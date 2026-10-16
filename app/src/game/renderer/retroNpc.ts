// 复古人物建模（v67 起；v68 接入游戏：随机 NPC / 有名 NPC / 玩家形象统一走这里）
// 方法参考好友仓库 Bumper-Crop（obtusecat12/Bumper-Crop）的 NPC 生成方式，代码为本项目独立实现：
//   · 公制成人比例、+Z 朝前；单个 SkinnedMesh，19 根骨骼（hips/spine/chest/neck/head + 左右 clavicle/upperArm/foreArm/hand/thigh/shin/foot）；
//   · 有棱角的低模体块：八边形截面的躯干/四肢管体，袖根与躯干肩口共享权重，短颈、斜方肌下斜；
//   · 脸不是椭球 + 贴鼻子：而是一张按照片五官定位（landmarks）对齐 UV 的连续面部网格，鼻梁/鼻尖/颧骨是同一张面的起伏；
//   · 贴图全部为生成的照片质感小图，NearestFilter、无 mipmap：脸 / 闭眼脸 / 衣物 2×2 图集 / 发丝；
//   · 平直 Lambert（flatShading）+ 少量自发光托底，PS1/PS2 早期观感；
//   · 眨眼 = 预载的同一张脸只换眼部的贴图对调（不做 morph，不在动画时上传贴图）；
//   · 动作以 24Hz 离散采样（呼吸、骨盆/锁骨/头部微动），渲染帧率不受限制。
// 身体层与服装层分离：裸身轮廓（髋-腰-胸比例）上套裤子/上衣外壳，领口、袖口、下摆、裤脚有向内折边。
// v68：建模参数抽成 RetroSpec（体型/发型×18/上衣版型/袖长/领型/裤型/鞋型/眼镜/胡须/头饰/手套/徽章/无脸），
// 四个手工示例（kat/tom/aiko/kowalski）只是 RetroSpec 的预设；通用形象见 retroAvatar.ts。
// 每个角色 ≤ ~2300 三角（含道具），≤ 6 次绘制。
import * as THREE from 'three'
import { planFacelingFace } from './facelingFace'
import { retroTextureChanged } from './retroResources'
import { installL0EnvironmentShader } from './l0EnvironmentShader'
import { installL1DynamicProbe } from './l1Probes'

export type RetroNpcId = 'kat' | 'tom' | 'aiko' | 'kowalski'

export type RetroHair = 'none' | 'short' | 'buzz' | 'slick' | 'medium' | 'twintails' | 'bangs' | 'messy' | 'bun-top' | 'side-bangs'
  | 'dreads' | 'long' | 'curly' | 'mohawk' | 'double-buns' | 'ponytail' | 'tight-bun' | 'thin'
export type RetroCollar = 'stand' | 'open' | 'shirt' | 'crew' | 'scoop' | 'hood'
export type RetroPose = 'neutral' | 'behind-back' | 'hands-on-hips' | 'hold-axe' | 'hands-front'
export type RetroProp = 'axe' | 'clipboard' | 'neckerchief' | 'sideburns'

export interface RetroSpec {
  name: string
  fem: boolean
  height: number // 整体缩放
  shoulder: number
  waist: number
  hip: number
  limb: number
  head: [number, number, number]
  jaw: number
  nose: number
  belly: number
  neckAdj?: number // 头部整体上下微调（米，负值 = 脖子更短）
  hair: RetroHair
  hairTint?: number // 发色（顶点色染灰度发丝贴图；手工示例的彩色发图不染）
  top: {
    hemY: number // 上衣下摆高度（< 0.85 为长外套，下段外扩）
    fit: number // 上衣相对身体的放松量（米）
    collar: RetroCollar // shirt：西装里的衬衫立领（领口不开 V，collarColor 色）
    collarColor?: number
    sleeves: 'long' | 'short' | 'none'
    belt?: number
    tint?: number // 上衣色（顶点色）
    drapedHem?: boolean // NPC robe: front hem follows the thighs when walking/sitting.
  }
  pants: { style: 'long' | 'shorts' | 'wide' | 'sweat' | 'cargo'; tint?: number }
  shoe: { color: number; style: 'loafer' | 'sneaker' | 'boot' }
  glasses?: number // 0 无 1 圆框 2 方框 3 墨镜
  beard?: number // 0 无 1 山羊胡 2 络腮胡 3 胡茬 4 八字胡 5 连鬓胡 6 下颌胡 7 长须 8 铅笔胡
  gloves?: number // 手套色（无 = 皮肤）
  headgear?: { divemask?: boolean; headlamp?: boolean; nightvision?: boolean }
  badge?: number // 胸口徽章色
  skinTint?: number // 皮肤染色（黑影等近黑皮肤：照片肤色 × 此色）
  faceless?: boolean // 无面（无面灵 / BRC 黑影）：脸面只采样皮肤
  faceAnomaly?: number // v73：L3 进化无面灵异常五官（种子；仅 faceless 时生效，见 facelingFace.ts）
  stolen?: boolean // v77：窃皮者披着的人皮——眼窝更深、更暗（底下是它深陷的眼睛）
  wretch?: WretchSpec // v78：悲尸（Entity 15）——基于人体的腐坏改造，见 wretchMesh.ts
  props?: RetroProp[]
  pose: RetroPose
}

const PROFILES: Record<RetroNpcId, RetroSpec> = {
  kat: { name: 'kat', fem: true, height: 0.97, shoulder: 0.88, waist: 0.86, hip: 1.02, limb: 0.9, head: [0.95, 1, 0.96], jaw: 0.93, nose: 0.6, belly: 0, hair: 'tight-bun', pose: 'behind-back', top: { hemY: 0.9, fit: 0.012, collar: 'stand', sleeves: 'long', belt: 0x18181a }, pants: { style: 'long' }, shoe: { color: 0x1c1d20, style: 'loafer' }, props: ['clipboard'] },
  tom: { name: 'tom', fem: false, height: 1.0, shoulder: 1.06, waist: 1.14, hip: 1.04, limb: 1.04, head: [1.07, 0.99, 1.02], jaw: 1.1, nose: 0.72, belly: 0.05, hair: 'short', pose: 'hands-on-hips', top: { hemY: 0.83, fit: 0.02, collar: 'stand', sleeves: 'long' }, pants: { style: 'long' }, shoe: { color: 0x252525, style: 'loafer' }, props: ['neckerchief', 'sideburns'] },
  aiko: { name: 'aiko', fem: true, height: 0.93, shoulder: 0.86, waist: 0.82, hip: 0.95, limb: 0.9, head: [0.95, 0.98, 0.96], jaw: 0.92, nose: 0.5, belly: 0, neckAdj: -0.024, hair: 'long', pose: 'hold-axe', top: { hemY: 0.93, fit: 0.01, collar: 'open', sleeves: 'long' }, pants: { style: 'long' }, shoe: { color: 0x262830, style: 'loafer' }, props: ['axe'] },
  kowalski: { name: 'kowalski', fem: false, height: 0.97, shoulder: 0.96, waist: 1.04, hip: 1.0, limb: 0.92, head: [1.0, 1.04, 1.0], jaw: 1.0, nose: 0.7, belly: 0.025, neckAdj: -0.022, hair: 'thin', pose: 'hands-front', top: { hemY: 0.85, fit: 0.018, collar: 'shirt', collarColor: 0xcfc8b2, sleeves: 'long' }, pants: { style: 'long' }, shoe: { color: 0x3a2c22, style: 'loafer' }, glasses: 2, props: ['sideburns'] },
}

/** v78：悲尸改造参数（第三阶段：唇/睑/软骨溶解、牙与指甲错位重生、孔洞与脓疱、残破衣物） */
export interface WretchSpec {
  seed: number
  variant: 'shambler' | 'sprinter' | 'smart' | 'mutant'
  brain?: boolean // 颅顶溶穿，露出发黄的脑
  mutant?: { eyes?: number; arm?: boolean; wings?: boolean; jaw?: boolean }
  pipe?: boolean // 有智个体攥着的锈铁管
}

export const RETRO_NPC_IDS = Object.keys(PROFILES) as RetroNpcId[]
export const retroNpcSpec = (id: RetroNpcId): RetroSpec => PROFILES[id]

export interface RetroNpcMeta { landmarks: number[]; skinUV: [number, number]; faceFill?: [number, number] } // faceFill：照片里脸宽占比（下半脸, 上半脸）

export const RETRO_NPC_META: Record<RetroNpcId, RetroNpcMeta> = {
  kat: { landmarks: [0.36, 0.6, 0.78, 0.97, 0.29, 0.71], skinUV: [0.22, 0.48], faceFill: [0.86, 0.95] },
  tom: { landmarks: [0.36, 0.61, 0.77, 0.98, 0.28, 0.71], skinUV: [0.2, 0.42], faceFill: [0.95, 0.97] },
  aiko: { landmarks: [0.365, 0.585, 0.735, 0.94, 0.31, 0.675], skinUV: [0.25, 0.55], faceFill: [0.97, 1] },
  kowalski: { landmarks: [0.36, 0.6, 0.77, 0.98, 0.3, 0.7], skinUV: [0.2, 0.45], faceFill: [0.92, 0.95] },
}

export interface RetroNpcTextures { face: THREE.Texture; faceBlink: THREE.Texture; body: THREE.Texture; hair: THREE.Texture; faceless?: THREE.Texture; skinTile?: THREE.Texture } // skinTile：v78 悲尸皮肤平铺纹理（皮肤组按位置 UV 平铺） // faceless：v75 通用无五官脸面（按肤色档）

const nearest = (t: THREE.Texture) => {
  t.minFilter = THREE.NearestFilter
  t.magFilter = THREE.NearestFilter
  t.generateMipmaps = false
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
const loadCache = new Map<string, THREE.Texture>()
/** 同步取贴图（立即返回，图片到达后自动上传；同一路径全局共享，勿 dispose）。 */
export function retroTexture(url: string): THREE.Texture {
  let t = loadCache.get(url)
  if (!t) {
    // A neutral placeholder keeps clothes/skin visible during a cold load.
    t = nearest(new THREE.Texture())
    t.userData.retroShared = true
    t.userData.ready = false
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#b7aaa0'; ctx.fillRect(0, 0, 2, 2)
      t.image = canvas; t.needsUpdate = true
      const texture = t
      new THREE.ImageLoader().load(url, image => {
        // The placeholder may already own immutable GPU storage at 2x2. Retire
        // that allocation before replacing its source with the 128x128 image.
        texture.dispose()
        texture.image = image; texture.needsUpdate = true; texture.userData.ready = true; retroTextureChanged()
      }, undefined, () => { texture.userData.ready = true; texture.userData.loadError = url; retroTextureChanged() })
    }
    loadCache.set(url, t)
  }
  return t
}
/** 手工示例 NPC 的四张贴图（同步版：游戏内用）。 */
export function retroNpcTexturesSync(id: RetroNpcId, base = '/textures/npc-retro'): RetroNpcTextures {
  const g = (n: string) => retroTexture(`${base}/${id}/${n}.png`)
  return { face: g('face'), faceBlink: g('face-blink'), body: g('body'), hair: g('hair') }
}

/** 预载某个 NPC 的四张贴图（128²，Nearest，无 mipmap）。 */
export async function loadRetroNpcTextures(id: RetroNpcId, base = '/textures/npc-retro'): Promise<RetroNpcTextures> {
  const L = new THREE.TextureLoader()
  const get = (n: string) => L.loadAsync(`${base}/${id}/${n}.png`).then(nearest)
  const [face, faceBlink, body, hair] = await Promise.all([get('face'), get('face-blink'), get('body'), get('hair')])
  return { face, faceBlink, body, hair }
}

type V3 = [number, number, number]
type Wt = [number, number][]

const MAT = { body: 0, face: 1, skin: 2, solid: 3, hair: 4, prop: 5, glass: 6 } as const
const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'clavicleL', 'upperArmL', 'foreArmL', 'handL', 'clavicleR', 'upperArmR', 'foreArmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'] as const
export type RetroBoneName = (typeof BONES)[number]
type BoneName = RetroBoneName
const PARENT: Record<BoneName, BoneName | null> = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  clavicleL: 'chest', upperArmL: 'clavicleL', foreArmL: 'upperArmL', handL: 'foreArmL',
  clavicleR: 'chest', upperArmR: 'clavicleR', foreArmR: 'upperArmR', handR: 'foreArmR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR',
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))

export interface RetroNpc {
  group: THREE.Group
  mesh: THREE.SkinnedMesh
  bones: Record<BoneName, THREE.Bone>
  /** 24Hz 离散姿势 + 眨眼；driven 模式下只做呼吸与眨眼（四肢/头由外部动画驱动骨骼）。 */
  update(time: number): void
  /** 换脸贴图（表情切换等）；闭眼图一并换。 */
  setFace(face: THREE.Texture, blink: THREE.Texture): void
  dispose(): void
  /** 头部局部坐标里的关键尺寸（外部挂件对齐用）：下巴 y、头顶 y、脸前 z、头半宽（均为 head 骨骼局部，米） */
  headFrame: { chinY: number; topY: number; faceZ: number; halfW: number; eyeY: number }
  /** v78：悲尸外露眼球的中心（head 骨骼局部，米）与半径；渲染层挂独立眼球网格做乱转 */
  anchors?: { eyes: [number, number, number][]; eyeR: number }
  diagnostics: { id: string; bones: number; triangles: number; drawCalls: number; partTriangles: Record<string, number>; poseHz: number }
}

export const RETRO_POSE_HZ = 24

export function buildRetroNpc(id: RetroNpcId, tex: RetroNpcTextures, opts: { seed?: number; phase?: number; driven?: boolean } = {}): RetroNpc {
  return buildRetroFigure(PROFILES[id], RETRO_NPC_META[id], tex, { seed: opts.seed ?? (id.charCodeAt(0) * 31 + id.length), phase: opts.phase, driven: opts.driven })
}

export function buildRetroFigure(P: RetroSpec, meta: RetroNpcMeta, tex: RetroNpcTextures, opts: { seed?: number; phase?: number; driven?: boolean } = {}): RetroNpc {
  const id = P.name
  const lm = meta.landmarks
  const skinUV = meta.skinUV
  const sh = P.shoulder, limb = P.limb
  const props = new Set(P.props ?? [])

  // ---------- 骨骼绑定姿态（世界坐标，米）----------
  const hipY = 0.95
  const BW: Record<BoneName, V3> = {
    hips: [0, hipY, 0], spine: [0, 1.06, 0], chest: [0, 1.27, 0], neck: [0, 1.475, -0.01], head: [0, 1.515, -0.005],
    clavicleL: [0.04, 1.43, 0], upperArmL: [0.205 * sh + 0.008, 1.41, -0.01], foreArmL: [0.22 * sh + 0.012, 1.11, -0.02], handL: [0.225 * sh + 0.014, 0.86, 0],
    clavicleR: [-0.04, 1.43, 0], upperArmR: [-0.205 * sh - 0.008, 1.41, -0.01], foreArmR: [-0.22 * sh - 0.012, 1.11, -0.02], handR: [-0.225 * sh - 0.014, 0.86, 0],
    thighL: [0.088 * P.hip, 0.9, 0], shinL: [0.088 * P.hip, 0.5, 0.01], footL: [0.088 * P.hip, 0.085, -0.01],
    thighR: [-0.088 * P.hip, 0.9, 0], shinR: [-0.088 * P.hip, 0.5, 0.01], footR: [-0.088 * P.hip, 0.085, -0.01],
  }
  const bi = (n: BoneName) => BONES.indexOf(n)
  const W = (a: BoneName, w = 1, b?: BoneName): Wt => (b ? [[bi(a), w], [bi(b), 1 - w]] : [[bi(a), 1]])

  // ---------- 几何累积 ----------
  const bins = Array.from({ length: 7 }, () => ({ p: [] as number[], uv: [] as number[], c: [] as number[], si: [] as number[], sw: [] as number[] }))
  const partTriangles: Record<string, number> = {}
  let part = 'body'
  const WR = P.wretch
  const vert = (m: number, p: V3, uv: [number, number], col: V3, w: Wt) => {
    const b = bins[m]
    if (WR && m === MAT.skin) uv = [(p[0] * 0.9 + p[2] * 0.75) * 3.2, p[1] * 3.2 + p[2] * 0.8] // v78：悲尸皮肤按位置平铺（干裂/脓疱纹理）
    b.p.push(p[0], p[1], p[2]); b.uv.push(uv[0], uv[1]); b.c.push(col[0], col[1], col[2])
    for (let k = 0; k < 4; k++) { b.si.push(w[k]?.[0] ?? 0); b.sw.push(w[k]?.[1] ?? 0) }
  }
  const tri = (m: number, a: V3, b: V3, c: V3, ua: [number, number], ub: [number, number], uc: [number, number], col: V3, wa: Wt, wb: Wt = wa, wc: Wt = wa) => {
    vert(m, a, ua, col, wa); vert(m, b, ub, col, wb); vert(m, c, uc, col, wc)
    partTriangles[part] = (partTriangles[part] || 0) + 1
  }
  const quad = (m: number, a: V3, b: V3, c: V3, d: V3, uv: [number, number][], col: V3, w: Wt[]) => {
    tri(m, a, b, d, uv[0], uv[1], uv[3], col, w[0], w[1], w[3])
    tri(m, b, c, d, uv[1], uv[2], uv[3], col, w[1], w[2], w[3])
  }
  const WHITE: V3 = [1, 1, 1]
  const hex = (h: number): V3 => { const c = new THREE.Color(h); return [c.r, c.g, c.b] }
  // 染色：灰度贴图（中位 ≈ 0.8 sRGB ≈ 0.6 线性）× 顶点色；提亮补偿
  const tint = (h: number | undefined): V3 => (h === undefined ? WHITE : hex(h).map((v) => Math.min(1, v * 1.45)) as V3)
  const TOP = tint(P.top.tint), PANTS = tint(P.pants.tint), HAIRC = tint(P.hairTint), SKINC = P.skinTint === undefined ? WHITE : hex(P.skinTint)
  const skin2 = (): [number, number] => [skinUV[0], 1 - skinUV[1]]

  interface Ring { p: V3; rx: number; rz: number; rzB?: number; w: Wt; v?: number; tilt?: number }
  /** 截面管体：环自下而上；uv 模式决定采样图集的哪个象限。 */
  const tube = (rings: Ring[], n: number, m: number, col: V3, uvMode: 'sleeve' | 'pants' | 'skin' | 'hair' | 'solid', caps: [boolean, boolean] = [true, true], phase = 0) => {
    const pts = rings.map((r) => Array.from({ length: n }, (_, j) => {
      const a = (2 * Math.PI * j) / n + phase, f = Math.cos(a) >= 0
      // tilt：环面绕前后轴倾斜（0 = 水平截面，接近 π/2 = 竖直的袖窿），外侧点往上抬
      const t = r.tilt ?? 0, sx = Math.sign(r.p[0]) || 1
      return [r.p[0] + Math.sin(a) * r.rx * Math.cos(t), r.p[1] + Math.sin(a) * r.rx * Math.sin(t) * sx, r.p[2] + Math.cos(a) * (f ? r.rz : (r.rzB ?? r.rz))] as V3
    }))
    const uv = (i: number, j: number): [number, number] => {
      const vv = rings[i].v ?? i / (rings.length - 1)
      if (uvMode === 'sleeve') return [0.018 + (0.465 * j) / n, 0.016 + 0.467 * vv]
      if (uvMode === 'pants') return [0.515 + (0.47 * j) / n, 0.016 + 0.467 * vv]
      if (uvMode === 'hair') return [j / n, vv]
      if (uvMode === 'skin') return [skin2()[0] + Math.sin(j) * 0.01, skin2()[1] + i * 0.006]
      return [0.5, 0.5]
    }
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < n; j++) {
      const k = (j + 1) % n
      quad(m, pts[i][j], pts[i][k], pts[i + 1][k], pts[i + 1][j], [uv(i, j), uv(i, j + 1), uv(i + 1, j + 1), uv(i + 1, j)], col, [rings[i].w, rings[i].w, rings[i + 1].w, rings[i + 1].w])
    }
    const last = rings.length - 1
    if (caps[0]) for (let j = 0; j < n; j++) tri(m, rings[0].p, pts[0][(j + 1) % n], pts[0][j], uv(0, 0), uv(0, j + 1), uv(0, j), col, rings[0].w)
    if (caps[1]) for (let j = 0; j < n; j++) tri(m, rings[last].p, pts[last][j], pts[last][(j + 1) % n], uv(last, 0), uv(last, j), uv(last, j + 1), col, rings[last].w)
  }
  const box = (c: V3, s: V3, m: number, col: V3, w: Wt, rot?: THREE.Matrix4, uvr?: [number, number, number, number]) => {
    const [x, y, z] = c, a = s[0] / 2, b = s[1] / 2, d = s[2] / 2
    const ps = ([[-a, -b, -d], [a, -b, -d], [a, b, -d], [-a, b, -d], [-a, -b, d], [a, -b, d], [a, b, d], [-a, b, d]] as V3[]).map((p) => {
      const v = new THREE.Vector3(...p)
      if (rot) v.applyMatrix4(rot)
      return [v.x + x, v.y + y, v.z + z] as V3
    })
    const [u0, v0, u1, v1] = uvr ?? [0.5, 0.5, 0.5, 0.5]
    const fu: [number, number][] = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
    for (const q of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]]) quad(m, ps[q[0]], ps[q[1]], ps[q[2]], ps[q[3]], fu, col, [w, w, w, w])
  }
  const geoInto = (geo: THREE.BufferGeometry, m: number, col: V3, w: Wt, mat4: THREE.Matrix4, uv: [number, number]) => {
    const g = geo.index ? geo.toNonIndexed() : geo
    const p = g.getAttribute('position')
    for (let i = 0; i < p.count; i += 3) {
      const t = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, i + k).applyMatrix4(mat4).toArray() as V3)
      tri(m, t[0], t[1], t[2], uv, uv, uv, col, w)
    }
    if (g !== geo) g.dispose()
    geo.dispose()
  }
  const TRS = (p: V3, s: V3, e: V3 = [0, 0, 0]) => new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...e)), new THREE.Vector3(...s))

  const shoe = (x: number, fw: number, col: V3, w: Wt) => {
    // [z, 半宽, 高]
    const sneaker = P.shoe.style === 'sneaker'
    const secs: [number, number, number][] = [[-0.085, 0.034, 0.06], [-0.06, 0.044, 0.085], [0.0, 0.048, 0.098], [0.07, 0.054, 0.07], [0.135, 0.05, 0.05], [0.175, 0.036, 0.034], [0.19, 0.018, 0.022]]
    const prof = (hw: number, h: number): [number, number][] => [[-hw, 0], [hw, 0], [hw * 1.02, h * 0.55], [hw * 0.72, h], [-hw * 0.72, h], [-hw * 1.02, h * 0.55]]
    const y0 = sneaker ? 0.026 : 0.018, bw = sneaker ? 1.08 : 1
    const ring = secs.map(([z, hw, h]) => prof(hw * fw * bw, h).map(([px, py]) => [x + px, y0 + py, z * fw] as V3))
    const n = 6, uv: [number, number] = [0.5, 0.5]
    for (let i = 0; i < ring.length - 1; i++) for (let j = 0; j < n; j++) {
      const k = (j + 1) % n
      quad(MAT.solid, ring[i][j], ring[i][k], ring[i + 1][k], ring[i + 1][j], [uv, uv, uv, uv], j === 0 ? col.map((v) => v * 0.7) as V3 : col, [w, w, w, w])
    }
    const last = ring.length - 1
    const c0: V3 = [x, y0 + 0.03, secs[0][0] * fw], c1: V3 = [x, y0 + 0.01, secs[last][0] * fw]
    for (let j = 0; j < n; j++) { tri(MAT.solid, c0, ring[0][(j + 1) % n], ring[0][j], uv, uv, uv, col, w); tri(MAT.solid, c1, ring[last][j], ring[last][(j + 1) % n], uv, uv, uv, col, w) }
    // 鞋底：比鞋身略宽的板（含后跟加厚）；运动鞋为浅色厚底
    const sole = sneaker ? hex(0xe6e4de) : col.map((v) => v * 0.45) as V3
    box([x, sneaker ? 0.013 : 0.009, 0.05 * fw], [0.108 * fw * bw, sneaker ? 0.026 : 0.018, 0.29 * fw], MAT.solid, sole, w)
    box([x, 0.02, -0.06 * fw], [0.09 * fw, 0.012, 0.06], MAT.solid, sole, w)
  }

  // ================= 身体层 + 服装层 =================
  // 先定义「裸身」轮廓（解剖比例：股骨大转子最宽 → 髂嵴 → 腰最细 → 下肋 → 胸 → 腋下 → 肩），
  // 服装是套在轮廓外的独立壳：裤子（骨盆 + 两条裤腿）贴身 +0.6cm，上衣按版型再放松 fit，
  // 开口处（领口、袖口、衣摆、裤脚）做向内翻的双面折边，能看到布料厚度和里面的皮肤/裤子。
  const fem = P.fem
  const hipF = P.hip * (fem ? 1.06 : 1), waistF = P.waist * (fem ? 0.9 : 1)
  // [y, 半宽, 半深(背), 前凸]
  const BODY: [number, number, number, number][] = [
    [0.82, 0.1 * hipF, 0.085, 0],
    [0.87, 0.172 * hipF, 0.104, 0],
    [0.95, 0.162 * hipF, 0.102, 0.004 + P.belly * 0.45],
    [1.04, 0.13 * waistF, 0.094 + P.belly * 0.15, P.belly],
    [1.14, 0.147 * waistF, 0.106 + P.belly * 0.1, P.belly * 0.55],
    [1.27, 0.168 * sh, 0.118, fem ? 0.032 : 0.012],
    [1.36, 0.183 * sh, 0.112, fem ? 0.018 : 0.006],
    [1.42, 0.176 * sh, 0.094, 0],
    [1.465, 0.076, 0.066, 0],
  ]
  const SX0 = 0.205 * sh + 0.008
  const sleeveless = P.top.sleeves === 'none'
  const shoulderSide = (y: number) => {
    if (sleeveless) return 0
    const t36 = (SX0 + 0.016 * P.limb) / 0.924, t42 = (SX0 + 0.004) / 0.924
    if (y < 1.3) return 0
    if (y < 1.36) return 0.168 * sh + (t36 - 0.168 * sh) * ((y - 1.3) / 0.06)
    return t36 + (t42 - t36) * clamp((y - 1.36) / 0.06, 0, 1)
  }
  const bodyAt = (y: number): [number, number, number] => {
    let i = 0
    while (i < BODY.length - 2 && y > BODY[i + 1][0]) i++
    const a = BODY[i], b = BODY[i + 1], t = clamp((y - a[0]) / (b[0] - a[0]), 0, 1)
    return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]
  }
  const torsoW = (y: number, side: number, j: number): Wt => {
    if (side > 0.8 && y > 1.33) return W(j < 4 ? 'upperArmL' : 'upperArmR', y > 1.39 ? 0.3 : 0.4, 'chest')
    if (y < 0.97) return W('hips')
    if (y < 1.1) return W('hips', 1 - (y - 0.97) / 0.13, 'spine')
    if (y < 1.25) return W('spine', 1 - (y - 1.1) / 0.15, 'chest')
    if (y > 1.45) return W('neck', 0.4, 'chest')
    return W('chest')
  }
  /** 通用放样：rings[i][j] 顶点，自下而上；twoSided 时同时生成反面（用于折边、领子这种能看到内侧的薄片）。 */
  const loft = (rings: V3[][], ws: Wt[][], m: number, col: V3, uvf: (i: number, j: number, p: V3, q: number) => [number, number], twoSided = false) => {
    const n = rings[0].length
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < n; j++) {
      const k = (j + 1) % n
      const ps = [rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]]
      const uvs = [uvf(i, j, ps[0], j), uvf(i, j + 1, ps[1], j), uvf(i + 1, j + 1, ps[2], j), uvf(i + 1, j, ps[3], j)]
      const w4 = [ws[i][j], ws[i][k], ws[i + 1][k], ws[i + 1][j]]
      quad(m, ps[0], ps[1], ps[2], ps[3], uvs, col, w4)
      if (twoSided) quad(m, ps[3], ps[2], ps[1], ps[0], [uvs[3], uvs[2], uvs[1], uvs[0]], col.map((v) => v * 0.55) as V3, [w4[3], w4[2], w4[1], w4[0]])
    }
  }
  const N8 = 8
  const ang = (j: number) => (j * Math.PI) / 4 + Math.PI / 8
  /** 躯干截面环：off 为布料外扩；trap 为斜方肌下压（肩线下斜）。 */
  const torsoRing = (y: number, off: number, opts: { trap?: boolean; frontDrop?: number } = {}) => Array.from({ length: N8 }, (_, j) => {
    const a = ang(j), [w0, d, f] = bodyAt(y), front = Math.cos(a) > 0
    // 肩：只把两侧顶点外推到盖住上臂顶端（三角肌），胸前/背后不变宽；袖子从这层肩下面伸出来
    const w = Math.abs(Math.sin(a)) > 0.8 ? Math.max(w0, shoulderSide(y)) : w0
    let yy = y
    if (opts.trap && y > 1.4) yy -= Math.abs(Math.sin(a)) * 0.028
    if (opts.frontDrop && Math.cos(a) > 0.9) yy -= opts.frontDrop
    return [Math.sin(a) * (w + off), yy, Math.cos(a) * (front ? d + f + off : (d + off) * 0.94)] as V3
  })
  const ringW = (ring: V3[]) => ring.map((p, j) => torsoW(p[1], Math.abs(Math.sin(ang(j))), j))
  const cUV = (p: V3, q: number): [number, number] => {
    const front = Math.cos(ang(q) + Math.PI / 8) >= 0
    const xs = clamp(p[0] / (0.44 * sh) + 0.5, 0, 1)
    const u = (front ? 0 : 0.5) + (0.03 + 0.94 * (front ? xs : 1 - xs)) * 0.5
    return [u, 0.515 + 0.47 * clamp((p[1] - Math.min(0.88, P.top.hemY)) / (1.48 - Math.min(0.88, P.top.hemY)), 0, 1)]
  }
  const pantsUV = (y: number, j: number): [number, number] => [0.515 + (0.47 * j) / N8, 0.016 + 0.467 * clamp((y - 0.085) / 0.87, 0, 1)]

  // ---------- 腿：裤腿（裤子象限 UV），裤脚向内翻边；短裤露小腿；鞋 ----------
  part = 'legs'
  const pst = P.pants.style
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R'
    const x = 0.088 * P.hip * s
    const th = ('thigh' + L) as BoneName, sn = ('shin' + L) as BoneName
    const lw = fem ? 0.94 : 1
    // 裤腿下段截面：阔腿外扩、运动裤收口
    const wide = pst === 'wide' ? 1.32 : pst === 'sweat' ? 0.9 : 1
    const rings: Ring[] = [
      { p: [x * 0.99, 0.085, 0.0], rx: 0.054 * wide, rz: 0.06 * wide, w: W(sn), v: 0 },
      { p: [x, 0.2, -0.005], rx: 0.05 * (wide > 1 ? 1.26 : wide), rz: 0.055 * (wide > 1 ? 1.24 : wide), rzB: 0.062 * (wide > 1 ? 1.2 : wide), w: W(sn), v: 0.15 },
      { p: [x, 0.36, -0.005], rx: 0.055 * lw * (wide > 1 ? 1.16 : 1), rz: 0.06 * (wide > 1 ? 1.14 : 1), rzB: 0.07, w: W(sn), v: 0.34 },
      { p: [x, 0.5, 0.005], rx: 0.058 * lw * (wide > 1 ? 1.08 : 1), rz: 0.062, w: W(sn, 0.5, th), v: 0.5 },
      { p: [x * 1.02, 0.68, 0.0], rx: 0.074 * lw, rz: 0.078, w: W(th), v: 0.7 },
      { p: [x * 1.04, 0.82, 0.0], rx: 0.084 * lw * P.hip, rz: 0.088, w: W(th, 0.8, 'hips'), v: 0.86 },
      { p: [x * 0.98, 0.9, 0.0], rx: 0.08 * P.hip, rz: 0.086, w: W('hips'), v: 0.95 },
    ]
    if (pst === 'shorts') {
      // 短裤：裤管只到膝上（y 0.56），下面是皮肤小腿（伸进鞋里）
      const hemY = 0.56
      const sr: Ring[] = [{ p: [x * 1.01, hemY, 0.004], rx: 0.07 * lw, rz: 0.074, w: W(th, 0.85, sn), v: 0.55 }, ...rings.slice(4)]
      tube(sr, 8, MAT.body, PANTS, 'pants', [false, false], Math.PI / 8)
      const hemR = (r: number, y: number) => Array.from({ length: N8 }, (_, j) => [x * 1.01 + Math.sin(ang(j)) * 0.07 * lw * r, y, 0.004 + Math.cos(ang(j)) * 0.074 * r] as V3)
      const hr = [hemR(1, hemY), hemR(0.84, hemY), hemR(0.84, hemY + 0.025)]
      loft(hr, hr.map((r) => r.map(() => W(th, 0.85, sn))), MAT.body, PANTS, (_i, j) => pantsUV(hemY + 0.01, j), true)
      part = 'shins'
      tube([
        { p: [x * 0.99, 0.07, 0.0], rx: 0.036, rz: 0.04, w: W(sn) },
        { p: [x, 0.2, -0.004], rx: 0.04 * lw, rz: 0.044, rzB: 0.05, w: W(sn) },
        { p: [x, 0.36, -0.006], rx: 0.048 * lw, rz: 0.05, rzB: 0.062, w: W(sn) },
        { p: [x, 0.5, 0.004], rx: 0.052 * lw, rz: 0.054, w: W(sn, 0.5, th) },
        { p: [x * 1.01, 0.6, 0.004], rx: 0.062 * lw, rz: 0.064, w: W(th) },
      ], 8, MAT.skin, SKINC, 'skin', [false, false], Math.PI / 8)
      part = 'legs'
    } else {
      tube(rings, 8, MAT.body, PANTS, 'pants', [false, false], Math.PI / 8)
      // 裤脚折边：外沿 → 内沿 → 向上 2.5cm（双面）；运动裤为加厚罗纹收口
      const r0 = rings[0]
      const hemR = (r: number, y: number) => Array.from({ length: N8 }, (_, j) => [x * 0.99 + Math.sin(ang(j)) * r0.rx * r, y, Math.cos(ang(j)) * r0.rz * r] as V3)
      const hr = pst === 'sweat' ? [hemR(1.04, 0.085), hemR(0.8, 0.085), hemR(0.8, 0.13)] : [hemR(1, 0.085), hemR(0.82, 0.085), hemR(0.82, 0.11)]
      loft(hr, hr.map((r) => r.map(() => W(sn))), MAT.body, PANTS, (_i, j) => pantsUV(0.09, j), true)
      if (pst === 'sweat') {
        const cuff = [hemR(1.0, 0.085), hemR(1.06, 0.105), hemR(1.0, 0.13)]
        loft(cuff, cuff.map((r) => r.map(() => W(sn))), MAT.body, PANTS.map((v) => v * 0.85) as V3, (_i, j) => pantsUV(0.1, j))
      }
    }
    if (pst === 'cargo') {
      // 工装裤：大腿外侧风琴袋（袋身 + 袋盖）
      part = 'cargo'
      box([x * 1.02 + s * 0.072, 0.62, 0.01], [0.022, 0.13, 0.1], MAT.body, PANTS.map((v) => v * 0.92) as V3, W(th), undefined, [0.6, 0.3, 0.7, 0.4])
      box([x * 1.02 + s * 0.08, 0.69, 0.01], [0.012, 0.028, 0.106], MAT.body, PANTS.map((v) => v * 0.75) as V3, W(th), undefined, [0.6, 0.3, 0.7, 0.4])
      part = 'legs'
    }
    part = 'shoes'
    const sc = hex(P.shoe.style === 'sneaker' ? 0xd2d2d4 : P.shoe.color), ft = ('foot' + L) as BoneName, fw = fem ? 0.9 : 1
    shoe(x, fw, sc, W(ft))
    if (P.shoe.style === 'boot') {
      // 靴筒：包住脚踝到小腿下段（裤腿塞进靴里/盖住靴口均可，这里靴筒在裤外）
      const bc = hex(P.shoe.color)
      const rr = pst === 'wide' ? 1.0 : 1.12
      tube([
        { p: [x, 0.05, 0.0], rx: 0.05 * rr, rz: 0.06 * rr, w: W(ft) },
        { p: [x, 0.12, -0.004], rx: 0.05 * rr, rz: 0.058 * rr, w: W(sn, 0.6, ft) },
        { p: [x, 0.24, -0.006], rx: 0.054 * rr, rz: 0.06 * rr, rzB: 0.066 * rr, w: W(sn) },
      ], 8, MAT.solid, bc, 'solid', [false, true], Math.PI / 8)
    }
    part = 'legs'
  }

  // ---------- v78 悲尸：衣服底下的裸身（衣物破洞里露出来）——躯干 + 双腿，比衣物内收 ----------
  if (WR) {
    part = 'wretchBody'
    const ys = [0.83, 0.87, 0.95, 1.04, 1.14, 1.27, 1.36, 1.42]
    const rings = ys.map((y) => torsoRing(y, y > 1.3 ? -0.008 : -0.004, { trap: true }))
    loft(rings, rings.map(ringW), MAT.skin, SKINC, () => [0, 0])
    for (const s of [1, -1]) {
      const L = s > 0 ? 'L' : 'R', x = 0.088 * P.hip * s
      const th = ('thigh' + L) as BoneName, sn = ('shin' + L) as BoneName
      const lk = P.limb
      tube([
        { p: [x * 0.99, 0.09, 0.0], rx: 0.03 * lk, rz: 0.034 * lk, w: W(sn) },
        { p: [x, 0.3, -0.006], rx: 0.04 * lk, rz: 0.045 * lk, w: W(sn) },
        { p: [x, 0.5, 0.004], rx: 0.044 * lk, rz: 0.046 * lk, w: W(sn, 0.5, th) },
        { p: [x * 1.02, 0.68, 0.0], rx: 0.058 * lk, rz: 0.06 * lk, w: W(th) },
        { p: [x * 1.02, 0.86, 0.0], rx: 0.07 * lk, rz: 0.072 * lk, w: W(th, 0.8, 'hips') },
      ], 6, MAT.skin, SKINC, 'skin', [false, false], 0)
    }
  }

  // ---------- 裤子骨盆段：裆部 → 髋 → 髂嵴 → 腰头（高过上衣下摆，被上衣盖住）----------
  part = 'pants'
  {
    const ys = [0.82, 0.87, 0.95, 1.04, 1.075]
    const rings = ys.map((y) => torsoRing(y, 0.006))
    loft(rings, rings.map(ringW), MAT.body, PANTS, (_i, j, p) => pantsUV(Math.min(p[1], 0.94), j))
    for (let j = 0; j < N8; j++) tri(MAT.body, [0, 0.805, 0], rings[0][(j + 1) % N8], rings[0][j], pantsUV(0.9, 0), pantsUV(0.9, 0), pantsUV(0.9, 0), PANTS, W('hips'))
  }

  // ---------- 上衣：按版型放松的外壳，下摆外翻一点再向内折，肩线下斜，顶部接领子 ----------
  part = 'shirt'
  const fit = P.top.fit, collar = P.top.collar, open = collar === 'open'
  const hemY = P.top.hemY
  // 长外套（风衣）：下摆在臀线以下继续往下，并向外撒开，减少走路时腿穿模
  const shirtYs = [hemY, ...(hemY < 0.8 ? [0.72, 0.82] : []), ...BODY.map((r) => r[0]).filter((y) => y > Math.max(hemY, 0.85) + 0.03 && y < 1.43), 1.42]
  const flare = (y: number) => (y < 0.88 ? 1 + (0.88 - y) * 0.9 : 1)
  const shirt = shirtYs.map((y, i) => {
    const yy = Math.max(y, 0.88) // 长下摆（厨师服、西装）在臀线以下垂直落下，不随裆部收窄
    const f = flare(y)
    return torsoRing(yy, fit + (i === 0 ? 0.005 : 0) + (y > 1.35 ? -fit * 0.4 : 0), { trap: true }).map((p) => [p[0] * f, p[1] - (yy - y), p[2] * f] as V3)
  })
  // 领口：上衣顶环收到领座（open 领在前中下落成 V；scoop 背心领口更低更宽）
  const collarBase = Array.from({ length: N8 }, (_, j) => {
    const a = ang(j), fr = Math.cos(a)
    const drop = (open && fr > 0.9 ? 0.045 : 0) + (collar === 'scoop' && fr > 0.3 ? 0.05 * fr : 0)
    const wid = collar === 'scoop' ? 1.12 : 1
    return [Math.sin(a) * 0.084 * wid, 1.445 - drop - Math.abs(Math.sin(a)) * 0.004, Math.cos(a) * (fr > 0 ? 0.08 + (open && fr > 0.9 ? 0.02 : 0) : 0.072) * wid - 0.01] as V3
  })
  const shirtRings = [...shirt, collarBase]
  const shirtW = (r: V3[]) => (r[0][1] < 0.85 ? r.map((p):Wt => {
    if(!P.top.drapedHem)return W('hips')
    const front=clamp((p[2]+.035)/.11,0,1),left=clamp(p[0]/.12+.5,0,1)
    const hips=clamp((p[1]-.8)/.1,0,1),shin=clamp((.68-p[1])/.36,0,.5),thigh=1-hips-shin
    return [[bi('hips'),1-front+front*hips],[bi('thighL'),front*thigh*left],[bi('thighR'),front*thigh*(1-left)],
      [bi(left>.5?'shinL':'shinR'),front*shin]]
  }) : ringW(r))
  loft(shirtRings, shirtRings.map(shirtW), MAT.body, TOP, (_i, _j, p, q) => cUV(p, q))
  // 下摆折边
  {
    const h0 = shirt[0], inner = (dy: number) => h0.map((p) => [p[0] * 0.9, p[1] + dy, p[2] * 0.9] as V3)
    const hr = [h0, inner(0), inner(0.03)]
    loft(hr, hr.map(shirtW), MAT.body, TOP, (_i, _j, p, q) => cUV([p[0], Math.max(0.9, hemY + 0.02), p[2]], q), true)
  }
  // 领子：立领（stand）= 领座 → 领口上沿；翻领（open）= 前中断开、向外翻折；圆领（crew）/背心（scoop）只有一圈罗纹边；
  // 连帽（hood）= 圆领 + 堆在后颈的帽兜。双面，能看到领子厚度与里面的脖子
  part = 'collar'
  {
    const top = collarBase.map((p, j) => {
      const a = ang(j), fr = Math.cos(a)
      if (open) return [p[0] * 1.12, p[1] + (fr > 0.9 ? 0.03 : 0.045), p[2] * 1.12 + (fr > 0.9 ? 0.012 : 0)] as V3
      if (collar === 'shirt') return [p[0] * 0.93, p[1] + (fr > 0.9 ? 0.034 : 0.046), p[2] * 0.93 + (fr > 0.9 ? 0.004 : 0)] as V3
      if (collar === 'crew' || collar === 'hood') return [p[0] * 0.95, p[1] + 0.016, p[2] * 0.95] as V3
      if (collar === 'scoop') return [p[0] * 0.98, p[1] + 0.008, p[2] * 0.98] as V3
      return [p[0] * 0.9, p[1] + 0.05, p[2] * 0.9 - 0.002] as V3
    })
    const lip = top.map((p) => [p[0] * 0.9, p[1] - 0.004, p[2] * 0.9 - 0.001] as V3)
    const rings = [collarBase, top, lip]
    const cw = rings.map((r) => r.map(() => W('chest', 0.7, 'neck')))
    if (P.top.collarColor !== undefined) loft(rings, cw, MAT.solid, hex(P.top.collarColor), () => [0.5, 0.5], true)
    else loft(rings, cw, MAT.body, TOP.map((v) => (collar === 'crew' || collar === 'scoop' ? v * 0.9 : v)) as V3, (_i, _j, p, q) => cUV([p[0], 1.43, p[2]], q), true)
    if (collar === 'hood') {
      part = 'hood'
      geoInto(new THREE.IcosahedronGeometry(1, 0), MAT.body, TOP.map((v) => v * 0.92) as V3, W('chest', 0.7, 'neck'), TRS([0, 1.44, -0.1], [0.105, 0.06, 0.055], [0.35, 0, 0]), [0.75, 0.9])
    }
  }
  if (P.top.belt !== undefined) {
    // 腰带：收出腰线（贴着上衣外侧）
    part = 'belt'
    const by = 1.035, bc = hex(P.top.belt)
    const rings = [torsoRing(by - 0.02, fit + 0.004), torsoRing(by + 0.02, fit + 0.004)]
    loft(rings, rings.map(ringW), MAT.solid, bc, () => [0.5, 0.5])
    box([0, by, bodyAt(by)[1] + bodyAt(by)[2] + fit + 0.008], [0.05, 0.036, 0.01], MAT.prop, hex(0x8a7a50), W('hips', 0.6, 'spine'))
  }
  if (P.badge !== undefined) {
    // 制服徽章：右胸（-X）贴在上衣外表面
    part = 'badge'
    const y = 1.3, b = bodyAt(y)
    box([-0.085 * sh, y, b[1] + b[2] + fit + 0.004], [0.05, 0.062, 0.008], MAT.solid, hex(P.badge), W('chest'))
  }

  // ---------- 脖子（皮肤）：从衣领里伸出，根部埋进领口下方 ----------
  part = 'neck'
  tube([
    { p: [0, 1.385, 0.0], rx: 0.07, rz: 0.07, w: W('chest') },
    { p: [0, 1.445, -0.01], rx: 0.062, rz: 0.058, w: W('chest', 0.6, 'neck') },
    { p: [0, 1.49, -0.01], rx: 0.057 * (fem ? 0.9 : 1), rz: 0.053, w: W('neck') },
    { p: [0, 1.55, -0.008], rx: 0.057, rz: 0.053, w: W('head') },
  ], 8, MAT.skin, SKINC, 'skin', [false, false], Math.PI / 8)

  // ---------- 手臂：袖子（服装层）+ 从袖口露出的手腕/前臂（皮肤层）+ 手 ----------
  const handMat = P.gloves !== undefined ? MAT.solid : MAT.skin, handCol = P.gloves !== undefined ? hex(P.gloves) : SKINC
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R'
    const ua = ('upperArm' + L) as BoneName, fa = ('foreArm' + L) as BoneName, hd = ('hand' + L) as BoneName
    const x0 = (0.205 * sh + 0.008) * s, x1 = (0.22 * sh + 0.012) * s, x2 = (0.225 * sh + 0.014) * s
    const ar = limb * (fem ? 0.93 : 1) + fit * 1.5
    const hs = limb * (fem ? 0.9 : 1) * 1.02
    const sk = limb * (fem ? 0.9 : 1) // 裸臂粗细
    part = 'sleeves'
    if (P.top.sleeves === 'long') {
      const cuffY = 0.925
      tube([
        { p: [x2, cuffY, 0.0], rx: 0.042 * ar, rz: 0.045 * ar, w: W(fa), v: 0.08 },
        { p: [x2, 0.97, -0.01], rx: 0.048 * ar, rz: 0.047 * ar, w: W(fa), v: 0.2 },
        { p: [x1, 1.06, -0.02], rx: 0.052 * ar, rz: 0.051 * ar, w: W(fa), v: 0.38 },
        { p: [x1, 1.11, -0.022], rx: 0.054 * ar, rz: 0.052 * ar, w: W(fa, 0.5, ua), v: 0.47 },
        { p: [x0 * 1.02, 1.22, -0.015], rx: 0.056 * ar, rz: 0.056 * ar, w: W(ua), v: 0.66 },
        // 袖子顶端收进上衣肩部里面（被肩盖住），三角肌的圆由上衣肩部负责
        { p: [x0 * 1.0, 1.3, -0.012], rx: 0.054 * ar, rz: 0.056 * ar, w: W(ua), v: 0.8 },
        { p: [x0 * 0.94, 1.36, -0.01], rx: 0.044 * ar, rz: 0.05 * ar, w: W(ua, 0.7, 'chest'), v: 0.92 },
        { p: [x0 * 0.85, 1.39, -0.01], rx: 0.03 * ar, rz: 0.04 * ar, w: W(ua, 0.5, 'chest'), v: 1 },
      ], 8, MAT.body, TOP, 'sleeve', [false, false], Math.PI / 8)
      // 袖口折边（双面）
      const cr = (r: number, y: number) => Array.from({ length: N8 }, (_, j) => [x2 + Math.sin(ang(j)) * 0.042 * ar * r, y, Math.cos(ang(j)) * 0.045 * ar * r] as V3)
      const cuff = [cr(1, cuffY), cr(0.8, cuffY), cr(0.8, cuffY + 0.03)]
      loft(cuff, cuff.map((r) => r.map(() => W(fa))), MAT.body, TOP, (_i, j) => [0.018 + (0.465 * j) / N8, 0.03], true)
    } else if (P.top.sleeves === 'short') {
      // 短袖：袖管到上臂中段（y 1.2），袖口略宽松
      const cy = 1.2, cx = x0 * 1.02
      tube([
        { p: [cx, cy, -0.015], rx: 0.062 * ar, rz: 0.062 * ar, w: W(ua), v: 0.05 },
        { p: [x0 * 1.0, 1.3, -0.012], rx: 0.058 * ar, rz: 0.06 * ar, w: W(ua), v: 0.55 },
        { p: [x0 * 0.94, 1.36, -0.01], rx: 0.046 * ar, rz: 0.052 * ar, w: W(ua, 0.7, 'chest'), v: 0.85 },
        { p: [x0 * 0.85, 1.39, -0.01], rx: 0.03 * ar, rz: 0.04 * ar, w: W(ua, 0.5, 'chest'), v: 1 },
      ], 8, MAT.body, TOP, 'sleeve', [false, false], Math.PI / 8)
      const cr = (r: number, y: number) => Array.from({ length: N8 }, (_, j) => [cx + Math.sin(ang(j)) * 0.062 * ar * r, y, -0.015 + Math.cos(ang(j)) * 0.062 * ar * r] as V3)
      const cuff = [cr(1, cy), cr(0.82, cy), cr(0.82, cy + 0.025)]
      loft(cuff, cuff.map((r) => r.map(() => W(ua))), MAT.body, TOP, (_i, j) => [0.018 + (0.465 * j) / N8, 0.1], true)
    }
    // 裸露的手臂（皮肤层）：长袖只露手腕；短袖露前臂 + 上臂下段；无袖整条手臂 + 三角肌
    part = 'hands'
    const armSkin: Ring[] = [
      // 手腕是扁的（掌心朝内时前后宽、左右窄），往前臂逐渐变圆变粗
      { p: [x2, 0.872, 0.0], rx: 0.02 * hs, rz: 0.027 * hs, w: W(hd) },
      { p: [x2, 0.9, 0.0], rx: 0.023 * hs, rz: 0.028 * hs, w: W(fa, 0.7, hd) },
      { p: [x2, 0.94, -0.003], rx: 0.028 * hs, rz: 0.031 * hs, w: W(fa) },
      { p: [x2, 0.99, -0.008], rx: 0.033 * hs, rz: 0.034 * hs, w: W(fa) },
    ]
    if (P.top.sleeves !== 'long' || WR) {
      armSkin.push(
        { p: [x1, 1.06, -0.018], rx: 0.04 * sk, rz: 0.04 * sk, w: W(fa) },
        { p: [x1, 1.11, -0.02], rx: 0.042 * sk, rz: 0.041 * sk, w: W(fa, 0.5, ua) },
        { p: [x0 * 1.02, 1.22, -0.015], rx: 0.046 * sk, rz: 0.046 * sk, w: W(ua) },
      )
      if (sleeveless || WR) armSkin.push(
        { p: [x0 * 1.01, 1.32, -0.012], rx: 0.052 * sk, rz: 0.05 * sk, w: W(ua) },
        { p: [x0 * 0.94, 1.39, -0.01], rx: 0.044 * sk, rz: 0.046 * sk, w: W(ua, 0.6, 'chest') },
        { p: [x0 * 0.8, 1.42, -0.01], rx: 0.026 * sk, rz: 0.034 * sk, w: W(ua, 0.4, 'chest') },
      )
    }
    tube(armSkin, 6, MAT.skin, SKINC, 'skin', [false, false], 0)
    const hx = x2
    tube([
      { p: [hx, 0.872, 0.0], rx: 0.02 * hs, rz: 0.027 * hs, w: W(hd) },
      { p: [hx, 0.85, 0.002], rx: 0.018 * hs, rz: 0.038 * hs, w: W(hd) },
      { p: [hx, 0.79, 0.004], rx: 0.016 * hs, rz: 0.043 * hs, w: W(hd) },
    ], 6, handMat, handCol, 'skin', [false, true], 0)
    for (let f = 0; f < 4; f++) {
      const fz = 0.004 + (f - 1.5) * 0.019 * hs, len = [0.062, 0.072, 0.068, 0.054][f] * hs
      // 手指根部埋进手掌下缘 1cm，避免看起来和手掌脱开
      box([hx + s * 0.002, 0.8 - len / 2 + 0.004, fz], [0.016 * hs, len + 0.012, 0.016 * hs], handMat, handCol, W(hd), TRS([0, 0, 0], [1, 1, 1], [0, 0, s * 0.06]), [skin2()[0], skin2()[1], skin2()[0] + 0.02, skin2()[1] + 0.02])
    }
    box([hx - s * 0.012, 0.82, 0.042 * hs], [0.017 * hs, 0.05 * hs, 0.018 * hs], handMat, handCol, W(hd), TRS([0, 0, 0], [1, 1, 1], [0.5, 0, -s * 0.35]), [skin2()[0], skin2()[1], skin2()[0] + 0.02, skin2()[1] + 0.02])
  }

  // ---------- 头：颅骨轮廓 + 按 landmarks 对齐 UV 的连续面部网格 ----------
  // 比例按成人头部：宽 ≈ 15cm、前后 ≈ 19.5cm、下巴到头顶 ≈ 23cm；颧骨/太阳穴处最宽，下颌收成 V，
  // 后脑枕骨向后凸、比脸更宽（顶骨），下颌后方收进脖子；脸面左右按弧面往后包，不是平板。
  part = 'face'
  const hW = P.head[0] * 1.05, hH = P.head[1], hD = P.head[2] * 1.03
  // 贴图映射：竖直方向用「眼线→下巴」一个统一比例（不再逐行硬对 landmark，避免五官间距被拉伸/压缩），
  // 几何的嘴、鼻行放到照片里嘴、鼻对应的高度；水平方向线性，眼睛列（±0.44）正好落在照片的瞳孔上。
  const T_CHIN = 0.04, T_EYE = 0.56
  const vk = (lm[3] - lm[0]) / (T_EYE - T_CHIN)
  const tOf = (v: number) => T_EYE - (v - lm[0]) / vk
  const vOf = (t: number) => clamp(lm[0] - (t - T_EYE) * vk, 0.004, 0.996)
  const tM = tOf(lm[2]), tN = tOf(lm[1])
  const HH = 0.235 * hH, headY = 1.512 - T_CHIN * HH + (P.neckAdj ?? 0)
  // [自下巴起高度比例, 脸半宽, 前凸, 贴图 v, 后脑深度, 后脑宽度系数]
  const rows: [number, number, number, number, number, number][] = [
    [T_CHIN, 0.03, 0.074, 0, 0.04, 0.8],
    [(T_CHIN + tM) / 2, 0.053, 0.082, 0, 0.066, 0.86],
    [tM, 0.064, 0.088, 0, 0.088, 0.95],
    [tN, 0.071, 0.088, 0, 0.097, 1.02],
    [T_EYE, 0.075, 0.08, 0, 0.107, 1.06],
    [0.66, 0.076, 0.087, 0, 0.11, 1.07],
    [0.8, 0.072, 0.079, 0, 0.1, 1.06],
    [0.94, 0.057, 0.055, 0, 0.074, 1.04],
  ]
  rows.forEach((r) => { r[3] = vOf(r[0]) })
  const fx = [-1, -0.72, -0.44, 0, 0.44, 0.72, 1]
  const fill = meta.faceFill ?? [1, 1]
  const uC = (lm[4] + lm[5]) / 2, uEye = (lm[5] - lm[4]) / 2 / 0.44
  const faceU = (r: number, c: number) => {
    const half = uEye * (rows[r][1] / rows[4][1]) * (r < 4 ? fill[0] / fill[1] : 1)
    return clamp(uC + fx[c] * Math.min(half, 0.49), 0.008, 0.992)
  }
  const nose = P.faceless ? 0.15 : WR ? 0.12 : P.nose // v78：悲尸软骨溶解，鼻子塌平
  const front = rows.map(([t, w, z], i) => fx.map((s, j) => {
    let zz = z * (1 - 0.5 * s * s - 0.27 * s * s * s * s) // 弧面：中间饱满，两侧向后包
    if (i === 3) zz += (j === 3 ? 0.026 : j === 2 || j === 4 ? 0.01 : 0) * nose // 鼻尖/鼻翼
    if (i === 4) zz += j === 3 ? 0.014 * nose : j === 2 || j === 4 ? (P.faceless ? 0 : -0.006) : 0 // 鼻梁 + 眼窝
    if (i === 3 && (j === 1 || j === 5)) zz += 0.006 // 颧骨
    if (i === 2 && j === 3 && !P.faceless && !WR) zz += 0.005 // 嘴唇
    if (WR && i === 2 && j >= 1 && j <= 5) zz -= j === 3 ? 0.014 : j === 2 || j === 4 ? 0.012 : 0.006 // v78：嘴唇溶解——嘴部凹成一道裂开的齿槽
    if (WR && i === 4 && (j === 2 || j === 4)) zz -= 0.009 // v78：眼睑溶解，眼窝深陷（外露眼球另挂）
    if (i === 5 && (j === 2 || j === 4)) zz += 0.004 // 眉弓
    if (P.stolen && i === 4 && (j === 2 || j === 4)) zz -= 0.011 // v77：人皮下的眼窝深陷
    if (P.stolen && i === 4 && (j === 1 || j === 5)) zz -= 0.004
    const jaw = i < 2 ? P.jaw : 1
    return [s * w * hW * jaw, headY + t * HH, zz * hD] as V3
  }))
  const hw = W('head')
  const sk = skin2()
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < 6; j++) {
    // 无面：脸面只采样皮肤（光滑、没有五官）
    // 无面：有通用无五官脸面纹理时按正常脸 UV 贴（皮肤材质组的贴图换成它）；否则退回单点皮肤采样
    const uv = (r: number, c: number): [number, number] => (P.faceless && !tex.faceless ? [sk[0] + (c % 2) * 0.012, sk[1] + (r % 2) * 0.012] : [faceU(r, c), 1 - rows[r][3]])
    const fc = P.stolen && (i === 3 || i === 4) && j >= 1 && j <= 4 ? SKINC.map((v) => v * (j === 1 || j === 4 ? 0.6 : 0.8) * (i === 4 ? 1 : 1.12)) as V3 : SKINC // v77：人皮眼窝阴影
    quad(P.faceless ? MAT.skin : MAT.face, front[i][j], front[i][j + 1], front[i + 1][j + 1], front[i + 1][j], [uv(i, j), uv(i, j + 1), uv(i + 1, j + 1), uv(i + 1, j)], fc, [hw, hw, hw, hw])
  }
  // 侧面/后脑：从脸缘向后包一圈；顶上加一圈颅顶，避免平顶
  part = 'cranium'
  const rear = rows.map(([t, w, , , bd, bw], i) => Array.from({ length: 7 }, (_, j) => {
    if (j === 0) return front[i][0]
    if (j === 6) return front[i][6]
    const a = -Math.PI / 2 - (j * Math.PI) / 6
    const side = Math.abs(Math.sin(a))
    const ww = w * hW * (i < 2 ? P.jaw : 1) * (1 + (bw - 1) * (1 - side * 0.3))
    return [Math.sin(a) * ww, headY + t * HH, Math.cos(a) * bd * hD - 0.012] as V3
  }))
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < 6; j++) {
    const su = (q: number): [number, number] => [sk[0] + q * 0.03, sk[1] + (i % 2) * 0.02]
    quad(MAT.skin, rear[i][j + 1], rear[i][j], rear[i + 1][j], rear[i + 1][j + 1], [su(1), su(0), su(0), su(1)], SKINC, [hw, hw, hw, hw])
  }
  {
    const last = rows.length - 1
    const ringTop = [...front[last], ...rear[last].slice(1, 6).reverse()]
    const crown = ringTop.map((p) => [p[0] * 0.55, headY + 0.985 * HH, (p[2] + 0.012) * 0.6 - 0.016] as V3)
    const cTop: V3 = [0, headY + 1.01 * HH, -0.016]
    for (let j = 0; j < ringTop.length; j++) {
      const k = (j + 1) % ringTop.length
      quad(MAT.skin, ringTop[j], ringTop[k], crown[k], crown[j], [sk, sk, sk, sk], SKINC, [hw, hw, hw, hw])
      tri(MAT.skin, cTop, crown[j], crown[k], sk, sk, sk, SKINC, hw)
    }
    const ring0 = [...front[0], ...rear[0].slice(1, 6).reverse()]
    const c0: V3 = [0, headY + rows[0][0] * HH - 0.006, -0.02]
    for (let j = 0; j < ring0.length; j++) tri(MAT.skin, c0, ring0[(j + 1) % ring0.length], ring0[j], sk, sk, sk, SKINC, hw)
  }
  part = 'ears'
  const fplan = P.faceless && P.faceAnomaly !== undefined ? planFacelingFace(P.faceAnomaly) : null
  for (const s of [-1, 1]) {
    const kind = fplan ? fplan.ears[s > 0 ? 0 : 1] : 'normal'
    if (kind === 'none' || kind === 'hole') continue // 没长 / 只有耳孔（耳孔在无面灵器官段里画）
    const k = kind === 'tiny' ? 0.5 : 1 // 发育不全的小肉芽
    geoInto(new THREE.OctahedronGeometry(1, 0), MAT.skin, SKINC, hw, TRS([s * (0.077 - (1 - k) * 0.006) * hW, headY + 0.47 * HH, -0.012], [0.013 * (0.6 + 0.4 * k), 0.03 * k, 0.019 * k]), sk)
  }

  // ---------- 头发：独立发壳，按「头部网格的局部最大半径」外扩（v70：不再穿模/悬空）----------
  // 发壳每个顶点 = 该高度、该方位上头部所有顶点（脸面、后脑、颅顶、耳朵）的支撑半径 + 发量；
  // 支撑半径取窗口内顶点在该方向上的投影最大值，所以发壳一定包住下面的面片（含鼻梁/眉弓/耳朵）。
  // 发壳下沿（发际线）收回到贴头皮，不再留一圈悬空的「头盔边」。
  part = 'hair'
  const hN = 14
  const style = P.hair
  const AX = -0.012 // 头部竖轴（z 偏移）
  const headPts: V3[] = []
  for (const r of front) headPts.push(...r)
  for (const r of rear) headPts.push(...r)
  {
    const last = rows.length - 1
    for (const p of [...front[last], ...rear[last].slice(1, 6)]) headPts.push([p[0] * 0.55, headY + 0.985 * HH, (p[2] + 0.012) * 0.6 - 0.016])
  }
  const earPts: V3[] = []
  for (const s of [-1, 1]) {
    const c: V3 = [s * 0.077 * hW, headY + 0.47 * HH, -0.012]
    earPts.push([c[0] + s * 0.013, c[1], c[2]], [c[0], c[1] + 0.03, c[2]], [c[0], c[1] - 0.03, c[2]], [c[0], c[1], c[2] + 0.019], [c[0], c[1], c[2] - 0.019])
  }
  // 颅骨在高度 t、方位角 a 处的椭圆半径（由 rows 插值；作为支撑半径的下限）
  const skullAt = (t: number, a: number): [number, number] => {
    const tt = clamp(t, rows[0][0], 1.0)
    if (tt > 0.94) { const k = (tt - 0.94) / 0.06; return [0.057 * hW * (1 - 0.45 * k), (Math.cos(a) > 0 ? 0.055 : 0.074) * hD * (1 - 0.4 * k)] }
    let i = 0
    while (i < rows.length - 2 && tt > rows[i + 1][0]) i++
    const A = rows[i], B = rows[i + 1], k = clamp((tt - A[0]) / (B[0] - A[0]), 0, 1)
    const w = A[1] + (B[1] - A[1]) * k, bw = A[5] + (B[5] - A[5]) * k
    const f = A[2] + (B[2] - A[2]) * k, bd = A[4] + (B[4] - A[4]) * k
    return [w * hW * (Math.cos(a) < 0 ? bw : 1), (Math.cos(a) > 0 ? f : bd) * hD]
  }
  const angDiff = (x: number, y: number) => { let d = x - y; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d }
  // 支撑半径：高度 t、方位 a（0 = 正前，+ = 朝 +x）
  const headR = (t: number, a: number, ears: boolean) => {
    const Y = headY + t * HH
    const [w, d] = skullAt(Math.min(t, 1), a)
    let R = Math.hypot(Math.sin(a) * w, Math.cos(a) * d) * 0.97
    const pts = ears ? headPts.concat(earPts) : headPts
    for (const p of pts) {
      const dy = Math.abs(p[1] - Y)
      if (dy > 0.024) continue
      const pa = Math.atan2(p[0], p[2] - AX), da = angDiff(pa, a)
      if (Math.abs(da) > 0.5) continue
      // 远离当前高度的顶点按距离衰减（只防穿模，不让眉弓/鼻梁把整圈刘海顶出去）
      R = Math.max(R, Math.hypot(p[0], p[2] - AX) * Math.cos(da) - dy * 0.12)
    }
    return R
  }
  const surf = (t: number, a: number, off: number, ears = false): V3 => {
    const R = headR(t, a, ears) + off
    return [Math.sin(a) * R, headY + t * HH, Math.cos(a) * R + AX]
  }
  // 发际线（自下巴起的高度比例）：[前额, 太阳穴, 耳上/鬓角, 后颈]；puff = 发量
  const HL: Record<Exclude<RetroHair, 'none'>, { b: [number, number, number, number]; puff: number }> = {
    'tight-bun': { b: [0.9, 0.86, 0.5, 0.2], puff: 0.012 },
    short: { b: [0.9, 0.86, 0.5, 0.16], puff: 0.018 },
    thin: { b: [0.86, 0.82, 0.5, 0.16], puff: 0.014 },
    long: { b: [0.9, 0.78, 0.32, 0.2], puff: 0.018 },
    buzz: { b: [0.92, 0.88, 0.55, 0.24], puff: 0.006 },
    slick: { b: [0.93, 0.88, 0.52, 0.2], puff: 0.014 },
    medium: { b: [0.88, 0.7, 0.24, 0.08], puff: 0.022 },
    twintails: { b: [0.88, 0.8, 0.45, 0.2], puff: 0.016 },
    bangs: { b: [0.71, 0.68, 0.3, 0.12], puff: 0.02 },
    messy: { b: [0.86, 0.8, 0.45, 0.16], puff: 0.024 },
    'bun-top': { b: [0.9, 0.86, 0.5, 0.2], puff: 0.012 },
    'side-bangs': { b: [0.9, 0.78, 0.4, 0.16], puff: 0.02 },
    dreads: { b: [0.9, 0.84, 0.45, 0.2], puff: 0.02 },
    curly: { b: [0.9, 0.84, 0.5, 0.2], puff: 0.028 },
    mohawk: { b: [0.92, 0.88, 0.55, 0.24], puff: 0.005 },
    'double-buns': { b: [0.9, 0.86, 0.5, 0.2], puff: 0.012 },
    ponytail: { b: [0.9, 0.86, 0.5, 0.2], puff: 0.012 },
  }
  const sstep = (x: number) => { const k = clamp(x, 0, 1); return k * k * (3 - 2 * k) }
  const hl = style === 'none' ? null : HL[style]
  const coverEars = !!hl && hl.b[2] <= 0.45
  const shellOff = (t: number, b: number) => {
    // 发际线处收回贴头皮（0.25×发量），往上 0.08 内过渡到满发量；+0.002 补多边形弦高
    return hl ? 0.002 + hl.puff * (0.25 + 0.75 * sstep((t - b) / 0.08)) : 0
  }
  const hairBottom = (a: number) => {
    if (!hl) return 1
    const f = Math.cos(a), sd = Math.sin(a)
    // 发际线沿方位平滑过渡（原来是分段台阶，相邻顶点高度突变会拉出斜面）
    let b: number
    if (f > 0.9) b = hl.b[0]
    else if (f > 0.55) b = hl.b[1] + (hl.b[0] - hl.b[1]) * sstep((f - 0.55) / 0.35)
    else if (f > 0) b = hl.b[2] + (hl.b[1] - hl.b[2]) * sstep(f / 0.55)
    else b = hl.b[2] + (hl.b[3] - hl.b[2]) * sstep(-f / 0.6)
    if (style === 'side-bangs' && f > 0.5) b = Math.min(b, 0.72 + 0.12 * (sd + 1) / 2 + (1 - f) * 0.1)
    // 不盖耳朵的短发：发际线在耳朵上方绕成弧，耳朵露在外面（不再从发壳里戳出来）
    if (!coverEars) {
      const ear = sstep((Math.abs(sd) - 0.8) / 0.15) * sstep((f + 0.45) / 0.3) * sstep((0.5 - f) / 0.3)
      b = b + (Math.max(b, 0.64) - b) * ear
    }
    return b
  }
  const shellPt = (t: number, a: number) => surf(Math.min(t, 1.0), a, shellOff(t, hairBottom(a)), coverEars)
  if (hl) {
    const NR = 6
    // 每列从发际线到 0.97 分 NR 段（低处更密），顶上再收一圈
    const ring = (r: number) => Array.from({ length: hN }, (_, j) => {
      const a = (j * Math.PI * 2) / hN
      const b = hairBottom(a)
      const k = r / (NR - 1), t = b + (0.97 - b) * (1 - (1 - k) * (1 - k)) * 0.5 + (0.97 - b) * k * 0.5
      return shellPt(t, a)
    })
    const hr = Array.from({ length: NR }, (_, r) => ring(r))
    const topR = Array.from({ length: hN }, (_, j) => {
      const a = (j * Math.PI * 2) / hN
      const p = shellPt(0.97, a)
      return [p[0] * 0.6, headY + 1.035 * HH + hl.puff * 0.8, (p[2] - AX) * 0.6 + AX - 0.004] as V3
    })
    hr.push(topR)
    for (let r = 0; r < hr.length - 1; r++) for (let j = 0; j < hN; j++) {
      const k = (j + 1) % hN, v0 = r / (hr.length - 1), v1 = (r + 1) / (hr.length - 1)
      quad(MAT.hair, hr[r][j], hr[r][k], hr[r + 1][k], hr[r + 1][j], [[j / hN, v0], [(j + 1) / hN, v0], [(j + 1) / hN, v1], [j / hN, v1]], HAIRC, [hw, hw, hw, hw])
    }
    const apex: V3 = [0, headY + 1.06 * HH + hl.puff, AX - 0.006]
    for (let j = 0; j < hN; j++) tri(MAT.hair, apex, topR[j], topR[(j + 1) % hN], [0.5, 1], [j / hN, 0.95], [(j + 1) / hN, 0.95], HAIRC, hw)
  }
  // 发壳外表面上的点（发量全额）+ 法线：发髻/发束/乱发簇都从这里长出来，而不是凭空定坐标
  const onShell = (t: number, a: number, extra = 0): [V3, V3] => {
    const tt = Math.min(t, 1)
    const p = surf(tt, a, (hl ? hl.puff + 0.002 : 0) + extra, coverEars)
    if (t > 1) p[1] += (t - 1) * HH * 0.4
    const c: V3 = [0, headY + 0.55 * HH, AX]
    const n = new THREE.Vector3(p[0] - c[0], (p[1] - c[1]) * 0.8, p[2] - c[2]).normalize()
    return [p, [n.x, n.y, n.z]]
  }
  const ico = (c: V3, s: V3, w: Wt = hw, col: V3 = HAIRC) => geoInto(new THREE.IcosahedronGeometry(1, 0), MAT.hair, col, w, TRS(c, s), [0.5, 0.5])
  // 一缕垂下的发束（马尾/双马尾/脏辫）：点列 + 半径，权重自 head 渐变到 chest
  const lock = (pts: V3[], r: number[], n = 5) => tube(pts.map((p, i) => {
    const k = i / (pts.length - 1)
    return { p, rx: r[i], rz: r[i] * 1.1, w: p[1] > headY + 0.02 ? hw : W('head', clamp(1 - k, 0.2, 1), 'chest'), v: 1 - k }
  }).reverse(), n, MAT.hair, HAIRC, 'hair', [true, true])
  // 沿法线嵌进发壳：中心在表面内 sink×半径
  const embed = (t: number, a: number, r: number, sink = 0.45): V3 => { const [p, n] = onShell(t, a); return [p[0] + n[0] * r * (1 - sink * 2), p[1] + n[1] * r * (1 - sink * 2), p[2] + n[2] * r * (1 - sink * 2)] }
  if (style === 'tight-bun') { part = 'bun'; ico(embed(0.66, Math.PI, 0.04, 0.3), [0.042, 0.038, 0.036]) }
  if (style === 'bun-top') { part = 'bun'; const c = embed(1.0, Math.PI, 0.045, 0.3); ico([0, c[1] + 0.01, c[2] + 0.02], [0.048, 0.042, 0.046]) }
  if (style === 'double-buns') { part = 'bun'; for (const s of [-1, 1]) ico(embed(0.93, s * 2.2, 0.037, 0.35), [0.038, 0.036, 0.038]) }
  if (style === 'ponytail') {
    part = 'ponytail'
    const tie = embed(0.84, Math.PI, 0.026, 0.4)
    ico(tie, [0.026, 0.026, 0.026], hw, HAIRC.map((v) => v * 0.6) as V3)
    lock([[0, tie[1], tie[2] - 0.008], [0, headY + 0.55 * HH, tie[2] - 0.026], [0, 1.47, tie[2] - 0.034], [0, 1.34, tie[2] - 0.03]], [0.024, 0.028, 0.022, 0.012])
  }
  if (style === 'twintails') {
    part = 'twintails'
    for (const s of [-1, 1]) {
      const root = embed(0.72, s * 1.85, 0.022, 0.5)
      ico(root, [0.02, 0.02, 0.02], hw, HAIRC.map((v) => v * 0.6) as V3)
      lock([root, [root[0] + s * 0.016, headY + 0.45 * HH, root[2] - 0.012], [root[0] + s * 0.024, 1.46, root[2] - 0.008], [root[0] + s * 0.026, 1.35, root[2] + 0.004]], [0.02, 0.026, 0.022, 0.01])
    }
  }
  if (style === 'dreads') {
    part = 'dreads'
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8 - 0.5) * 3.4 // 两侧到后脑
      const [p, n] = onShell(0.6, a, -0.006)
      const len = 1.36 + (i % 3) * 0.03
      lock([p, [p[0] + n[0] * 0.012, headY + 0.2 * HH, p[2] + n[2] * 0.012 - 0.006], [p[0] + n[0] * 0.018, len, p[2] + n[2] * 0.016 - 0.01]], [0.011, 0.011, 0.009], 4)
    }
  }
  if (style === 'messy' || style === 'curly') {
    part = 'tufts'
    const n = style === 'curly' ? 11 : 8
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3
      const b0 = hairBottom(a), t = Math.max(b0 + 0.07, style === 'curly' ? 0.66 + (i % 3) * 0.12 : 0.8 + (i % 3) * 0.08) // 只长在发际线以内
      const r = style === 'curly' ? 0.026 : 0.02
      const c = embed(t, a, r, style === 'curly' ? 0.5 : 0.4)
      if (style === 'curly') ico(c, [r, r * 0.9, r])
      else {
        // 乱发：沿法线翘起的尖簇（底部埋进发壳）
        const [, nn] = onShell(t, a)
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nn[0] * 0.7 + 0.1, nn[1] * 0.7 + 0.5, nn[2] * 0.7).normalize())
        geoInto(new THREE.ConeGeometry(1, 1, 4), MAT.hair, HAIRC, hw, new THREE.Matrix4().compose(new THREE.Vector3(...c), q, new THREE.Vector3(r * 0.9, r * 2.2, r * 0.9)), [0.5, 0.5])
      }
    }
  }
  if (style === 'mohawk') {
    part = 'mohawk'
    // 中央发脊：从前额沿矢状线过头顶到后脑，截面是底边埋在头皮里的三角，高度中间最高
    const S = 9, secs: V3[][] = []
    for (let i = 0; i < S; i++) {
      const u = i / (S - 1)
      const a = u < 0.5 ? 0 : Math.PI, t = u < 0.5 ? 0.9 + u * 2 * 0.12 : 1.02 - (u - 0.5) * 2 * 0.34
      const [p, n] = onShell(Math.min(t, 1.02), a, -0.004)
      const h = 0.018 + 0.045 * Math.sin(Math.PI * Math.min(1, u * 1.15))
      const side = 0.009
      secs.push([[p[0] - side, p[1] - n[1] * 0.004, p[2] - n[2] * 0.004], [p[0] + n[0] * h, p[1] + n[1] * h, p[2] + n[2] * h], [p[0] + side, p[1] - n[1] * 0.004, p[2] - n[2] * 0.004]])
    }
    for (let i = 0; i < S - 1; i++) for (let k = 0; k < 2; k++) {
      const A = secs[i], B = secs[i + 1], v0 = i / (S - 1), v1 = (i + 1) / (S - 1)
      quad(MAT.hair, A[k], A[k + 1], B[k + 1], B[k], [[0.3 + k * 0.2, v0], [0.5 + k * 0.2, v0], [0.5 + k * 0.2, v1], [0.3 + k * 0.2, v1]], HAIRC, [hw, hw, hw, hw])
    }
  }
  if (style === 'long' || style === 'medium') {
    // 长直发：后脑发帘的第一排直接取发壳上的点（无缝接上），往下沿后颈垂到肩胛；两侧发束贴着发壳侧面垂下
    part = 'longHair'
    const med = style === 'medium'
    const cols = 7, span = med ? 2.0 : 2.3
    const ang = (j: number) => Math.PI + (j / (cols - 1) - 0.5) * span
    const rowA = Array.from({ length: cols }, (_, j) => onShell(0.46, ang(j), -0.003)[0])
    const rowB = Array.from({ length: cols }, (_, j) => {
      const a = ang(j), p = onShell(0.22, a, 0.004)[0]
      return [p[0] * 1.04, med ? headY + 0.02 : headY - 0.02, p[2] - 0.006] as V3
    })
    const curtain = (y: number, k: number) => Array.from({ length: cols }, (_, j) => {
      const a = ang(j)
      const rw = (med ? 0.1 : 0.104) + k * (med ? 0.008 : 0.026), rd = 0.11 + k * (med ? 0.006 : 0.012)
      return [Math.sin(a) * rw * hW, y, Math.cos(a) * rd * hD - 0.02 - k * 0.012] as V3
    })
    const cr = med ? [rowA, rowB, curtain(1.46, 2)] : [rowA, rowB, curtain(1.43, 2), curtain(1.3, 3)]
    const cw = (k: number): Wt => (k < 2 ? hw : k === 2 ? W('head', 0.5, 'chest') : W('chest'))
    for (let k = 0; k < cr.length - 1; k++) for (let j = 0; j < cols - 1; j++) {
      const n = cr.length - 1
      const uv: [number, number][] = [[j / (cols - 1), 1 - k / n], [(j + 1) / (cols - 1), 1 - k / n], [(j + 1) / (cols - 1), 1 - (k + 1) / n], [j / (cols - 1), 1 - (k + 1) / n]]
      quad(MAT.hair, cr[k][j], cr[k][j + 1], cr[k + 1][j + 1], cr[k + 1][j], uv, HAIRC, [cw(k), cw(k), cw(k + 1), cw(k + 1)])
      quad(MAT.hair, cr[k][j + 1], cr[k][j], cr[k + 1][j], cr[k + 1][j + 1], uv, HAIRC, [cw(k), cw(k), cw(k + 1), cw(k + 1)])
    }
    for (const s of [-1, 1]) {
      // 侧发束：上端埋在太阳穴发壳里，贴着头侧（支撑半径 + 半个束宽）垂下，下端略向外散；不再在下巴旁伸出一块板
      const at = (t: number, a: number, rx: number): V3 => { const p = surf(Math.min(t, 1), a, 0, true); const R = Math.hypot(p[0], p[2] - AX); const k = (R + rx * 0.8) / R; return [p[0] * k, p[1], (p[2] - AX) * k + AX] }
      const bot = med ? 0.2 : -0.5
      tube([
        { p: med ? at(bot, s * 1.32, 0.012) : [s * 0.086 * hW, 1.4, 0.0], rx: 0.012, rz: 0.018, w: med ? hw : W('head', 0.4, 'chest'), v: 0 },
        { p: at(0.16, s * 1.32, 0.013), rx: 0.013, rz: 0.02, w: hw, v: 0.45 },
        { p: at(0.45, s * 1.3, 0.013), rx: 0.013, rz: 0.022, w: hw, v: 0.75 },
        { p: at(0.78, s * 1.22, 0.006), rx: 0.011, rz: 0.022, w: hw, v: 1 },
      ], 5, MAT.hair, HAIRC, 'hair', [true, false])
    }
  }
  if (props.has('sideburns')) {
    // 鬓角：贴在耳前的薄片（从发壳下沿往下）
    part = 'sideburns'
    for (const s of [-1, 1]) {
      const p0 = surf(0.62, s * 1.38, 0.002), p1 = surf(0.42, s * 1.4, 0.002)
      const n = 0.014
      quad(MAT.hair, [p1[0], p1[1], p1[2] - n], [p1[0], p1[1], p1[2] + n], [p0[0], p0[1], p0[2] + n], [p0[0], p0[1], p0[2] - n], [[0.2, 0.2], [0.4, 0.2], [0.4, 0.4], [0.2, 0.4]], HAIRC, [hw, hw, hw, hw])
    }
  }

  // ---------- 脸面参数化（v70 胡须 / v73 无面灵器官共用）----------
  const rowPt = (i: number, x: number): V3 => {
    const ax = Math.abs(x)
    if (ax <= 1) {
      let j = 0
      while (j < 5 && x > fx[j + 1]) j++
      const k = (x - fx[j]) / (fx[j + 1] - fx[j]), A = front[i][j], B = front[i][j + 1]
      return [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k]
    }
    const k = Math.min(ax - 1, 1) * 0.5, A = front[i][x < 0 ? 0 : 6], B = rear[i][x < 0 ? 1 : 5]
    return [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k]
  }
  const chinC: V3 = [0, headY + rows[0][0] * HH - 0.006, -0.02]
  const facePt = (t: number, x: number): [V3, V3] => {
    if (t < rows[0][0]) {
      const u = clamp((rows[0][0] - t) / 0.2, 0, 1), p0 = rowPt(0, x)
      const c: V3 = [p0[0] * 0.55, chinC[1] - 0.004, chinC[2] + 0.012]
      const p: V3 = [p0[0] + (c[0] - p0[0]) * u * 0.8, p0[1] + (c[1] - p0[1]) * u * 0.8, p0[2] + (c[2] - p0[2]) * u * 0.8]
      const n = new THREE.Vector3(p[0] * 0.6, -0.6 - 0.4 * u, (p[2] - AX) * (1 - u) + 0.2).normalize()
      return [p, [n.x, n.y, n.z]]
    }
    let i = 0
    while (i < rows.length - 2 && t > rows[i + 1][0]) i++
    const k = clamp((t - rows[i][0]) / (rows[i + 1][0] - rows[i][0]), 0, 1)
    const A = rowPt(i, x), B = rowPt(i + 1, x)
    const p: V3 = [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k]
    const n = new THREE.Vector3(p[0] * 1.3, t < tM ? -0.25 * (1 - t / tM) : 0, p[2] - AX).normalize()
    return [p, [n.x, n.y, n.z]]
  }
  // 脸面任意 (t, x) 的照片 UV（与脸面网格同一插值；下巴底面钳到下巴行）
  const faceUVat = (t: number, x: number): [number, number] => {
    const tt = Math.max(t, rows[0][0])
    let i = 0
    while (i < rows.length - 2 && tt > rows[i + 1][0]) i++
    const kt = clamp((tt - rows[i][0]) / (rows[i + 1][0] - rows[i][0]), 0, 1)
    let j = 0
    while (j < 5 && x > fx[j + 1]) j++
    const kx = clamp((x - fx[j]) / (fx[j + 1] - fx[j]), 0, 1)
    const u0 = faceU(i, j) + (faceU(i, j + 1) - faceU(i, j)) * kx, u1 = faceU(i + 1, j) + (faceU(i + 1, j + 1) - faceU(i + 1, j)) * kx
    const v = rows[i][3] + (rows[i + 1][3] - rows[i][3]) * kt
    return [u0 + (u1 - u0) * kt, 1 - v]
  }

  // ---------- v78 悲尸（Entity 15）：在人体上做第三阶段的腐坏改造 ----------
  // 维基：嘴唇/眼睑/软骨溶解，眼球外露乱转；牙与指甲脱落后在别处以异常的数量与尺寸重新长出；
  // 皮肤红褐干裂、布满孔洞与脓疱、渗出红褐分泌物；嘴与孔洞不断淌出棕色淤泥；脱发；残留生前衣物。
  // 附图：裂到脸颊的一大排参差黄牙、黑眼圈里的充血眼球、颅顶缺一块露出发黄的脑。
  let wretchAnchors: { eyes: V3[]; eyeR: number } | undefined
  if (WR) {
    part = 'wretch'
    let ws = (WR.seed * 2654435761) >>> 0
    const R = () => { ws = (ws + 0x6d2b79f5) | 0; let t = Math.imul(ws ^ (ws >>> 15), 1 | ws); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
    const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]
    /** 带逐顶点颜色的几何并入（colf 按顶点局部坐标给色） */
    const geoVC = (geo: THREE.BufferGeometry, m: number, w: Wt, mat4: THREE.Matrix4, colf: (v: THREE.Vector3) => V3, uv: [number, number] = [0.5, 0.5]) => {
      const g = geo.index ? geo.toNonIndexed() : geo
      const pa = g.getAttribute('position')
      for (let i = 0; i < pa.count; i += 3) {
        const loc = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pa, i + k))
        const t3 = loc.map((v) => v.clone().applyMatrix4(mat4).toArray() as V3)
        const c3 = loc.map(colf)
        for (let k = 0; k < 3; k++) vert(m, t3[k], uv, c3[k], w)
        partTriangles[part] = (partTriangles[part] || 0) + 1
      }
      if (g !== geo) g.dispose()
      geo.dispose()
    }
    const basis = (n: V3, up: V3 = [0, 1, 0]) => {
      const N = new THREE.Vector3(...n).normalize(), U = new THREE.Vector3(...up).cross(N).normalize(), Vv = N.clone().cross(U).normalize()
      return { N, U, V: Vv }
    }
    const TOOTH: V3 = [0.86, 0.8, 0.52], TOOTH2: V3 = [0.72, 0.66, 0.36], GUM: V3 = [0.2, 0.05, 0.05]
    const SLIME: V3 = [0.3, 0.19, 0.08], PUS: V3 = [0.62, 0.42, 0.18], RAW: V3 = [0.42, 0.1, 0.08], HOLE: V3 = [0.08, 0.025, 0.02]
    /** 一颗牙/指甲：沿 dir 伸出的四棱锥台（根粗尖细），根部埋进皮肉 */
    const fang = (root: V3, dir: V3, len: number, wid: number, col: V3, w: Wt, twist = 0) => {
      const g = new THREE.CylinderGeometry(wid * 0.45, wid, len, 4, 1)
      g.translate(0, len / 2 - wid * 0.6, 0)
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir).normalize())
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4 + twist))
      geoVC(g, MAT.solid, w, new THREE.Matrix4().compose(new THREE.Vector3(...root), q, new THREE.Vector3(1, 1, 0.75)), (v) => { const k = clamp((v.y + wid) / (len + wid), 0, 1); return col.map((c, i) => c * (0.72 + 0.28 * k) + (i === 2 ? 0 : 0)) as V3 })
    }
    // —— 嘴：一大排参差、发黄的长牙，从嘴角一直裂到脸颊（上排下垂、下排上翘，缺牙处露出暗红牙床）——
    {
      const mw = WR.variant === 'mutant' && WR.mutant?.jaw ? 1.15 : 1
      const nT = 15 + Math.floor(R() * 5)
      for (const up of [true, false]) {
        for (let k = 0; k < nT; k++) {
          if (R() < 0.12) continue // 脱落的缺口
          const x = (-0.92 + (1.84 * (k + 0.5 + (R() - 0.5) * 0.4)) / nT) * mw
          const edge = 1 - Math.abs(x) / (0.95 * mw)
          const t0 = tM + (up ? 0.035 : -0.04) + (R() - 0.5) * 0.01 - (WR.mutant?.jaw && !up ? 0.03 : 0)
          const [p, n] = facePt(t0, x)
          const big = R() < 0.18 ? 1.6 : 1
          const len = (0.019 + R() * 0.022 * (0.5 + edge)) * big
          const wid = (0.0075 + R() * 0.005) * (0.7 + 0.5 * edge) * (big > 1 ? 1.2 : 1)
          const dir: V3 = [n[0] * 0.35 + (R() - 0.5) * 0.25, up ? -1 : 1, n[2] * 0.35 + 0.15]
          fang(add(p, n, -0.002), dir, len, wid, R() < 0.3 ? TOOTH2 : TOOTH, hw, (R() - 0.5) * 0.8)
        }
      }
      // 齿槽里的牙床（暗红扁条），让牙根有东西可扎
      for (const up of [true, false]) {
        const g = new THREE.BoxGeometry(1, 1, 1)
        const [p, n] = facePt(tM + (up ? 0.03 : -0.035), 0)
        geoVC(g, MAT.solid, hw, TRS(add(p, n, -0.006), [0.11 * hW * mw, 0.012, 0.012]), () => GUM)
      }
    }
    // —— 外露的眼球：锚点交给渲染层挂独立网格（会乱转）；这里只在眼窝里补一圈充血的软组织 ——
    {
      const eyes: V3[] = []
      const eyeR = 0.022 * hW
      for (const x of [-0.44, 0.44]) {
        const [p, n] = facePt(T_EYE + 0.004, x)
        eyes.push(add(p, n, -0.004))
        const b = basis(n)
        for (let k = 0; k < 7; k++) { // 眼眶一圈溃烂的肉瘤（替代溶解掉的眼睑）
          const a = (k / 7) * Math.PI * 2
          const c = add(add(p, [b.U.x, b.U.y, b.U.z], Math.cos(a) * eyeR * 1.25), [b.V.x, b.V.y, b.V.z], Math.sin(a) * eyeR * 1.1)
          geoVC(new THREE.IcosahedronGeometry(1, 0), MAT.solid, hw, TRS(add(c, n, 0.001), [0.006, 0.0045, 0.004]), () => RAW.map((v) => v * (0.8 + R() * 0.4)) as V3)
        }
      }
      wretchAnchors = { eyes, eyeR }
    }
    // —— 颅顶溶穿：一块发黄的脑露在外面（附图右上）——
    if (WR.brain) {
      const s = R() < 0.5 ? 1 : -1
      const c: V3 = [s * 0.032 * hW, headY + 0.93 * HH, 0.01]
      geoVC(new THREE.IcosahedronGeometry(1, 2), MAT.solid, hw, TRS(c, [0.046 * hW, 0.03, 0.05 * hD], [0.1, 0, -s * 0.35]), (v) => {
        const fold = Math.sin(v.x * 23 + Math.sin(v.z * 17) * 2) * Math.sin(v.z * 19 + v.y * 9)
        const k = 0.82 + 0.2 * fold
        return [0.86 * k, 0.74 * k, 0.5 * k]
      })
      for (let k = 0; k < 9; k++) { // 溃口边缘翻起的皮
        const a = (k / 9) * Math.PI * 2
        const e: V3 = [c[0] + Math.cos(a) * 0.044 * hW, c[1] - 0.006 + Math.sin(a * 2) * 0.004, c[2] + Math.sin(a) * 0.048 * hD]
        geoVC(new THREE.IcosahedronGeometry(1, 0), MAT.solid, hw, TRS(e, [0.012, 0.007, 0.012]), () => RAW)
      }
    }
    // —— 棕色淤泥：从齿缝和下巴不断滴下 ——
    for (let k = 0; k < 3; k++) {
      const x = (R() - 0.5) * 1.1
      const [p, n] = facePt(tM - 0.07 - R() * 0.06, x)
      const L0 = 0.03 + R() * 0.05
      tube([
        { p: add(p, n, -0.002), rx: 0.006, rz: 0.005, w: hw },
        { p: add(add(p, n, 0.002), [0, -L0 * 0.6, 0]), rx: 0.0035, rz: 0.003, w: hw },
        { p: add(add(p, n, 0.003), [0, -L0, 0]), rx: 0.0055, rz: 0.005, w: hw },
      ], 5, MAT.solid, SLIME, 'solid', [false, true])
    }
    // —— 身上的脓疱与孔洞（颈、肩、前臂、手背、胸口——衣服破洞里也看得到）——
    const skinSpots: { p: V3; n: V3; w: Wt }[] = []
    for (let k = 0; k < 12; k++) { // 躯干表面
      const y = 0.9 + R() * 0.5, j = Math.floor(R() * N8)
      const r = torsoRing(y, -0.003)
      const a = ang(j)
      skinSpots.push({ p: r[j], n: [Math.sin(a), 0, Math.cos(a)], w: torsoW(y, Math.abs(Math.sin(a)), j) })
    }
    for (const s of [1, -1]) for (let k = 0; k < 5; k++) { // 手臂
      const L = s > 0 ? 'L' : 'R'
      const y = 0.9 + R() * 0.45, a = R() * Math.PI * 2
      const x = (y > 1.1 ? 0.205 * sh + 0.008 : 0.225 * sh + 0.014) * s
      const rr = (y > 1.1 ? 0.044 : 0.034) * P.limb
      skinSpots.push({ p: [x + Math.sin(a) * rr, y, -0.01 + Math.cos(a) * rr], n: [Math.sin(a), 0, Math.cos(a)], w: W((y > 1.11 ? 'upperArm' : 'foreArm') + L as BoneName) })
    }
    for (let k = 0; k < 4; k++) { // 颈
      const a = R() * Math.PI * 2, y = 1.42 + R() * 0.1
      skinSpots.push({ p: [Math.sin(a) * 0.055, y, -0.01 + Math.cos(a) * 0.052], n: [Math.sin(a), 0, Math.cos(a)], w: y > 1.47 ? W('neck') : W('chest', 0.5, 'neck') })
    }
    for (let k = 0; k < 4; k++) { // 脸颊、额头
      const [p, n] = facePt(R() < 0.5 ? 0.42 + R() * 0.08 : 0.7 + R() * 0.15, (R() < 0.5 ? -1 : 1) * (0.6 + R() * 0.5))
      skinSpots.push({ p, n, w: hw })
    }
    for (const sp of skinSpots) {
      const b = basis(sp.n)
      const m4 = new THREE.Matrix4().makeBasis(b.U, b.V, b.N)
      if (R() < 0.55) { // 脓疱：鼓起的黄褐色泡，顶端发亮
        const r = 0.006 + R() * 0.008
        m4.scale(new THREE.Vector3(r, r * 0.9, r * 0.7)).setPosition(...add(sp.p, sp.n, r * 0.15))
        geoVC(new THREE.IcosahedronGeometry(1, 0), MAT.solid, sp.w, m4, (v) => (v.z > 0.5 ? PUS.map((c) => c * 1.25) as V3 : v.z > -0.2 ? PUS : RAW))
      } else { // 孔洞：皮肉溶出的深洞，边缘一圈红肉
        const r = 0.007 + R() * 0.01
        m4.scale(new THREE.Vector3(r, r * 0.85, r * 0.35)).setPosition(...add(sp.p, sp.n, 0.0005))
        geoVC(new THREE.OctahedronGeometry(1, 0), MAT.solid, sp.w, m4, (v) => (v.z > 0.2 ? HOLE : RAW))
      }
    }
    // —— 错位重生的牙齿与指甲：长在前臂、肩头、肋侧、手背上 ——
    for (let k = 0; k < 9; k++) {
      const sp = skinSpots[Math.floor(R() * (skinSpots.length - 4))]
      const dir: V3 = [sp.n[0] + (R() - 0.5) * 0.8, sp.n[1] + (R() - 0.3) * 0.8, sp.n[2] + (R() - 0.5) * 0.8]
      fang(add(sp.p, sp.n, -0.004), dir, 0.016 + R() * 0.022, 0.006 + R() * 0.004, R() < 0.5 ? TOOTH : TOOTH2, sp.w, R())
    }
    // 指尖：指甲脱落，换成又长又黄的爪状甲
    for (const s of [1, -1]) {
      const L = s > 0 ? 'L' : 'R', hx = (0.225 * sh + 0.014) * s, hs = P.limb * 1.02
      for (let f = 0; f < 4; f++) {
        if (R() < 0.2) continue
        const fz = 0.004 + (f - 1.5) * 0.019 * hs, len = [0.062, 0.072, 0.068, 0.054][f] * hs
        fang([hx + s * 0.002, 0.8 - len + 0.004, fz], [s * 0.1, -1, 0.15], 0.018 + R() * 0.02, 0.006, TOOTH2, W(('hand' + L) as BoneName), R())
      }
    }
    // —— 有智个体：攥着一截锈铁管 ——
    if (WR.pipe) {
      const wh = W('handR'), hx = -(0.225 * sh + 0.014), hz = 0.012
      const rust = hex(0x6a4a34)
      tube([
        { p: [hx, 0.3, hz], rx: 0.014, rz: 0.014, w: wh },
        { p: [hx, 0.55, hz], rx: 0.0135, rz: 0.0135, w: wh },
        { p: [hx, 0.92, hz], rx: 0.014, rz: 0.014, w: wh },
      ], 6, MAT.solid, rust, 'solid')
      tube([{ p: [hx, 0.28, hz], rx: 0.02, rz: 0.02, w: wh }, { p: [hx, 0.33, hz], rx: 0.02, rz: 0.02, w: wh }], 6, MAT.solid, hex(0x4a3a2c), 'solid') // 弯头接口
    }
    // —— 突变个体 ——
    if (WR.mutant) {
      const mu = WR.mutant
      // 多出来的眼球：长在额头、脸颊、肩头（不会转，充血、偏黄）
      for (let k = 0; k < (mu.eyes ?? 0); k++) {
        let p: V3, n: V3, w: Wt
        if (k % 3 === 2) { const s = R() < 0.5 ? 1 : -1; const a = 0.4 + R() * 0.6; p = [s * (0.15 * sh + Math.sin(a) * 0.04), 1.4, Math.cos(a) * 0.05]; n = [s * Math.sin(a), 0.4, Math.cos(a)]; w = W('chest') }
        else { const fp = facePt(k % 3 === 0 ? 0.78 : 0.42, (R() - 0.5) * 1.4); p = fp[0]; n = fp[1]; w = hw }
        const r = 0.012 + R() * 0.008
        const b = basis(n)
        const iris = R() < 0.5 ? [0.35, 0.22, 0.1] : [0.2, 0.25, 0.18]
        const m4 = new THREE.Matrix4().makeBasis(b.U, b.V, b.N).scale(new THREE.Vector3(r, r, r)).setPosition(...add(p, n, r * 0.25))
        geoVC(new THREE.IcosahedronGeometry(1, 1), MAT.solid, w, m4, (v) => (v.z > 0.86 ? [0.05, 0.03, 0.03] : v.z > 0.65 ? iris as V3 : Math.sin(v.x * 30) * Math.sin(v.y * 27) > 0.6 ? [0.7, 0.18, 0.15] : [0.9, 0.84, 0.66]))
        for (let q = 0; q < 5; q++) { const a = (q / 5) * Math.PI * 2; geoVC(new THREE.IcosahedronGeometry(1, 0), MAT.solid, w, TRS(add(add(p, [b.U.x, b.U.y, b.U.z], Math.cos(a) * r * 1.1), [b.V.x, b.V.y, b.V.z], Math.sin(a) * r), [0.005, 0.005, 0.004]), () => RAW) }
      }
      // 从肋侧长出的第三条萎缩手臂
      if (mu.arm) {
        const s = R() < 0.5 ? 1 : -1, w = W('chest')
        const r0: V3 = [s * 0.14 * sh, 1.2, 0.05], e1: V3 = [s * 0.26, 1.08, 0.14], h1: V3 = [s * 0.22, 0.92, 0.22]
        tube([
          { p: r0, rx: 0.03, rz: 0.03, w }, { p: e1, rx: 0.022, rz: 0.022, w }, { p: h1, rx: 0.018, rz: 0.02, w },
        ], 6, MAT.skin, SKINC, 'skin', [true, true], 0)
        for (let f = 0; f < 3; f++) fang(add(h1, [0, -0.01, (f - 1) * 0.012]), [s * 0.1, -1, 0.5], 0.05, 0.007, SKINC.map((v) => v * 0.8) as V3, w, f)
      }
      // 背后肋骨刺穿皮肉长成的「翅膀」：几根弯曲的骨刺 + 撑开的薄皮膜
      if (mu.wings) {
        const w = W('chest')
        for (const s of [1, -1]) {
          const base: V3 = [s * 0.07, 1.33, -0.1]
          const tips: V3[] = [[s * 0.42, 1.62, -0.3], [s * 0.5, 1.36, -0.32], [s * 0.4, 1.1, -0.26]]
          const BONE: V3 = [0.8, 0.72, 0.56]
          for (const tp of tips) {
            const mid: V3 = [(base[0] + tp[0]) / 2, (base[1] + tp[1]) / 2 + 0.06, (base[2] + tp[2]) / 2 - 0.04]
            tube([{ p: base, rx: 0.013, rz: 0.013, w }, { p: mid, rx: 0.01, rz: 0.01, w }, { p: tp, rx: 0.003, rz: 0.003, w }], 5, MAT.solid, BONE, 'solid', [false, false])
          }
          const mem = (a: V3, b: V3, c: V3) => {
            const col = SKINC.map((v) => v * 0.7) as V3, uv: [number, number] = [0.5, 0.5]
            tri(MAT.skin, a, b, c, uv, uv, uv, col, w); tri(MAT.skin, a, c, b, uv, uv, uv, col, w)
          }
          const inner = (tp: V3, k: number): V3 => [base[0] + (tp[0] - base[0]) * k, base[1] + (tp[1] - base[1]) * k, base[2] + (tp[2] - base[2]) * k]
          mem(base, inner(tips[0], 0.85), inner(tips[1], 0.85)); mem(base, inner(tips[1], 0.85), inner(tips[2], 0.8))
        }
      }
    }
  }

  // ---------- 胡须（v70）：沿脸面网格生成的变厚度发丝壳 ----------
  // 每款胡子 = 脸上 (t 高度, x 横向) 的厚度场：中间厚、边缘渐薄到贴皮，所以轮廓是软的、贴脸的；
  // 下巴底面沿颌下收向脖子；嘴部留空。胡茬（及大胡子边缘的过渡带）用皮肤材质 + 顶点色压暗做「青皮」。
  // 0 无 1 山羊胡 2 络腮胡 3 胡茬 4 八字胡 5 连鬓胡 6 下颌胡 7 长须 8 铅笔胡
  if (P.beard && !P.faceless) {
    part = 'beard'
    const bs = P.beard
    // 脸面上的点：t ∈ [T_CHIN, 0.94]，x ∈ [-1.5, 1.5]（|x| > 1 往耳前的侧脸延伸）；t < T_CHIN 为下巴底面
    const band = (v: number, lo: number, hi: number, f: number) => sstep((v - lo) / f) * sstep((hi - v) / f)
    const lerp = (a: number, b: number, k: number) => a + (b - a) * clamp(k, 0, 1)
    const ax = Math.abs
    const tLip = tM, tNose = tN - 0.022
    // 嘴部留空（1 = 有胡）
    const mouthGap = (t: number, x: number) => 1 - band(t, tLip - 0.035, tLip + 0.026, 0.012) * band(x, -0.46, 0.46, 0.08)
    // 各区域
    const must = (t: number, x: number, w = 0.56, droop = 0.03) => band(t, tLip + 0.018 - droop * sstep((ax(x) - 0.3) / 0.3), tNose, 0.014) * band(x, -w, w, 0.1)
    const chin = (t: number, x: number, w = 0.55) => band(t, rows[0][0] - 0.13, tLip - 0.02, 0.02) * band(x, -w, w, 0.12)
    const cheekTop = (x: number) => (ax(x) < 0.55 ? tNose : ax(x) < 1.1 ? lerp(tN - 0.05, tN + 0.04, (ax(x) - 0.55) / 0.55) : lerp(tN + 0.04, 0.6, (ax(x) - 1.1) / 0.4))
    const fullM = (t: number, x: number) => sstep((cheekTop(x) - t) / 0.05) * sstep((t - (rows[0][0] - 0.17)) / 0.03) * sstep((1.5 - ax(x)) / 0.08)
    const chops = (t: number, x: number) => sstep((cheekTop(x) - t) / 0.05) * sstep((ax(x) - 0.62) / 0.15) * sstep((t - rows[0][0] - 0.03) / 0.05) * sstep((1.5 - ax(x)) / 0.08)
    const strap = (t: number, x: number) => {
      const lineT = rows[0][0] + 0.07 + 0.2 * Math.max(0, ax(x) - 0.45)
      return Math.max(band(t, rows[0][0] - 0.12, lineT, 0.025) * sstep((1.5 - ax(x)) / 0.08), ax(x) > 1.1 ? sstep((cheekTop(x) - t) / 0.04) * sstep((ax(x) - 1.1) / 0.1) : 0)
    }
    // 返回 [厚度(米), 覆盖 0..1]
    const field = (t: number, x: number): number => {
      const g = mouthGap(t, x)
      switch (bs) {
        case 1: return Math.max(chin(t, x) * (0.004 + 0.004 * sstep((tLip - 0.04 - t) / 0.15)), must(t, x, 0.5) * 0.006, band(x, -0.56, 0.56, 0.08) * band(t, tLip - 0.05, tLip + 0.03, 0.02) * (1 - band(x, -0.36, 0.36, 0.06)) * 0.005) * g
        case 2: return Math.max(fullM(t, x) * (0.004 + 0.004 * sstep((tLip - t) / 0.2)), must(t, x) * 0.006) * g
        case 4: return must(t, x, 0.62, 0.05) * (0.004 + 0.003 * band(x, -0.3, 0.3, 0.2)) * g
        case 5: return Math.max(chops(t, x) * 0.0065, must(t, x, 0.66, 0.02) * 0.006) * g
        case 6: return strap(t, x) * 0.0042 * g
        case 7: return Math.max(fullM(t, x) * (0.005 + 0.006 * sstep((tLip - t) / 0.2)), must(t, x, 0.6, 0.05) * 0.007) * g
        case 8: return band(t, tLip + 0.028, tLip + 0.058, 0.007) * band(x, -0.46, 0.46, 0.06) * 0.0036
        default: return 0
      }
    }
    // 青皮层：胡茬本身，或大胡子外缘一圈过渡
    const stubble = (t: number, x: number): number => {
      const g = mouthGap(t, x)
      if (bs === 3) return Math.max(fullM(t, x), must(t, x)) * g
      if (bs === 2 || bs === 7 || bs === 5) return (bs === 5 ? Math.max(chops(t, x), must(t, x, 0.66)) : Math.max(fullM(t, x), must(t, x))) * g * 0.75
      if (bs === 1 || bs === 6) return 0.55 * g * (bs === 1 ? Math.max(chin(t, x, 0.7), must(t, x, 0.6)) : strap(t, x))
      return 0
    }
    // 采样网格：下巴底面 3 排 + 脸面（嘴/唇上区域加密）
    const ts: number[] = [rows[0][0] - 0.2, rows[0][0] - 0.13, rows[0][0] - 0.06]
    for (let t = rows[0][0]; t < 0.62; t += t > tLip - 0.05 && t < tN ? 0.0155 : 0.045) ts.push(t)
    const xs: number[] = []
    for (let x = -1.5; x <= 1.5001; x += 0.25) xs.push(x)
    const BC = HAIRC.map((v) => v * 0.82) as V3
    const sk2 = sk
    const grid = (fn: (t: number, x: number) => number, base: number) => ts.map((t) => xs.map((x) => { const [p, n] = facePt(t, x); const th = fn(t, x); return { p, n, th, d: base + th } }))
    if (bs !== 3) {
      const G = grid(field, 0.0012)
      for (let i = 0; i < ts.length - 1; i++) for (let j = 0; j < xs.length - 1; j++) {
        const c = [G[i][j], G[i][j + 1], G[i + 1][j + 1], G[i + 1][j]]
        if (c.every((q) => q.th < 0.0004)) continue
        const P4 = c.map((q) => [q.p[0] + q.n[0] * q.d, q.p[1] + q.n[1] * q.d, q.p[2] + q.n[2] * q.d] as V3)
        const uv = [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]].map(([a, b]) => [0.08 + 0.84 * (xs[b] + 1.5) / 3, 0.08 + 0.84 * (ts[a] - ts[0]) / (ts[ts.length - 1] - ts[0])] as [number, number])
        // 边缘（薄处）顶点色稍暗，模拟发梢稀疏处透出的阴影
        // 薄处（边缘、发梢）顶点色略暗；与皮肤的过渡交给下面的青皮层
        const col = c.map((q) => BC.map((v) => v * (0.72 + 0.28 * sstep(q.th / 0.0035))) as V3)
        const t1 = [0, 1, 3], t2 = [1, 2, 3]
        for (const tt of [t1, t2]) { for (const m of tt) vert(MAT.hair, P4[m], uv[m], col[m], hw); partTriangles[part] = (partTriangles[part] || 0) + 1 }
      }
    }
    // 青皮：皮肤材质，覆盖 0 → 原肤色，1 → 压暗偏青
    {
      part = 'stubble'
      const G = grid(stubble, 0.0007)
      const dark: V3 = [SKINC[0] * 0.66, SKINC[1] * 0.64, SKINC[2] * 0.68]
      for (let i = 0; i < ts.length - 1; i++) for (let j = 0; j < xs.length - 1; j++) {
        const c = [G[i][j], G[i][j + 1], G[i + 1][j + 1], G[i + 1][j]]
        if (c.every((q) => q.th < 0.03)) continue
        if (bs !== 3 && c.every((_, m) => [field(ts[i], xs[j]), field(ts[i], xs[j + 1]), field(ts[i + 1], xs[j + 1]), field(ts[i + 1], xs[j])][m] > 0.003)) continue // 被胡子完全盖住的格子不出
        const P4 = c.map((q) => [q.p[0] + q.n[0] * 0.0007, q.p[1] + q.n[1] * 0.0007, q.p[2] + q.n[2] * 0.0007] as V3)
        const col = c.map((q) => SKINC.map((v, k) => v + (dark[k] - v) * clamp(q.th, 0, 1)) as V3)
        // 用脸照片本身的 UV（和下面的脸面同一像素），只靠顶点色压暗 → 没有色差补丁；|x| > 1 的侧脸用皮肤采样
        const cells = [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]]
        const onFace = cells.every(([, b]) => Math.abs(xs[b]) <= 1)
        const uv = cells.map(([a, b], m) => (onFace ? faceUVat(ts[a], xs[b]) : [sk2[0] + (m % 2) * 0.01, sk2[1] + (m > 1 ? 0.01 : 0)]) as [number, number])
        const mat = onFace ? MAT.face : MAT.skin
        for (const tt of [[0, 1, 3], [1, 2, 3]]) { for (const m of tt) vert(mat, P4[m], uv[m], col[m], hw); partTriangles[part] = (partTriangles[part] || 0) + 1 }
      }
      part = 'beard'
    }
    if (bs === 7) {
      // 长须：下巴下方垂到胸口的扁楔形，上端埋进下巴胡壳
      const [c0] = facePt(rows[0][0] - 0.03, 0)
      const y0 = c0[1]
      tube([
        { p: [0, y0 + 0.012, c0[2] - 0.012], rx: 0.044, rz: 0.03, w: hw, v: 1 },
        { p: [0, y0 - 0.03, c0[2] - 0.004], rx: 0.04, rz: 0.028, w: hw, v: 0.7 },
        { p: [0, y0 - 0.075, c0[2] + 0.004], rx: 0.03, rz: 0.022, w: W('head', 0.6, 'chest'), v: 0.35 },
        { p: [0, y0 - 0.115, c0[2] + 0.01], rx: 0.012, rz: 0.012, w: W('head', 0.3, 'chest'), v: 0 },
      ], 6, MAT.hair, BC, 'hair', [true, true])
    }
  }

  // ---------- L3 进化无面灵：异常面部器官（v73）----------
  // 器官全部贴着脸面网格生成：局部坐标 (a 横, b 竖, 米) 先按器官朝向旋转，再换算成脸面参数 (t, x) 落到真实曲面上，
  // 最后沿法线抬高 h —— 所以圆环、鼓包、裂口都顺着脸的弧度包过去，不会悬空或插进脸里。
  // 凹陷（眼窝、鼻孔、嘴洞）用「外圈隆起 + 内圈压暗」表现：几何仍在皮肤之上，靠顶点色读成坑。
  if (fplan) {
    part = 'anomaly'
    const SZ = 0.95 // v76：异常器官整体不超过正常五官的大小（v73–v75 为 1.3，太大）
    const SK = SKINC
    const mul = (c: V3, k: V3): V3 => [c[0] * k[0], c[1] * k[1], c[2] * k[2]]
    const C = {
      skin: SK,
      fold: mul(SK, [0.86, 0.8, 0.78]), // 皮褶阴影
      lip: mul(SK, [0.86, 0.6, 0.58]), // 发育不全的唇：偏红
      raw: mul(SK, [0.62, 0.34, 0.32]), // 嫩肉 / 牙龈
      dark: mul(SK, [0.2, 0.11, 0.1]), // 洞口
      void: mul(SK, [0.06, 0.035, 0.035]),
    }
    const TOOTH: V3 = [0.78, 0.72, 0.56]
    const wAt = (t: number) => {
      const tt = clamp(t, rows[0][0], rows[rows.length - 1][0])
      let i = 0
      while (i < rows.length - 2 && tt > rows[i + 1][0]) i++
      const k = (tt - rows[i][0]) / (rows[i + 1][0] - rows[i][0])
      return (rows[i][1] + (rows[i + 1][1] - rows[i][1]) * k) * hW * (i < 2 ? P.jaw : 1)
    }
    /** 器官局部坐标系 → 脸面上的点（a 横、b 竖，米；h 沿法线抬高） */
    const at = (t0: number, x0: number, rot: number) => {
      const cr = Math.cos(rot), sr = Math.sin(rot), w0 = wAt(t0)
      const S = (a: number, b: number, h: number): V3 => {
        const aa = a * cr - b * sr, bb = a * sr + b * cr
        const [p, n] = facePt(clamp(t0 + bb / HH, rows[0][0] - 0.05, 0.95), clamp(x0 + aa / w0, -1.45, 1.45))
        return [p[0] + n[0] * h, p[1] + n[1] * h, p[2] + n[2] * h]
      }
      const [p0, n0] = facePt(t0, x0)
      const ux = new THREE.Vector3(0, 1, 0).cross(new THREE.Vector3(...n0)).normalize()
      const vy = new THREE.Vector3(...n0).cross(ux).normalize()
      const U = ux.clone().multiplyScalar(cr).addScaledVector(vy, sr), Vv = vy.clone().multiplyScalar(cr).addScaledVector(ux, -sr)
      return { S, p0, n0, U, V: Vv }
    }
    interface RingDef { r: [number, number]; h: number; c: V3; o?: [number, number]; star?: number }
    /** 同心环面片：rings 从外到内，最后收到中心点（中心取最后一环的 h/c，可偏移） */
    type UVF = (a: number, b: number) => [number, number]
    const disc = (S: (a: number, b: number, h: number) => V3, rings: RingDef[], m: number, seg = 8, center?: { h: number; c: V3; o?: [number, number] }, uvf?: UVF) => {
      const uv0 = m === MAT.solid ? [0.5, 0.5] as [number, number] : sk
      const loc = rings.map((rd) => Array.from({ length: seg }, (_, j) => {
        const a = (2 * Math.PI * j) / seg, st = rd.star ? 1 + (j % 2 ? -rd.star : rd.star) : 1
        return [Math.cos(a) * rd.r[0] * st + (rd.o?.[0] ?? 0), Math.sin(a) * rd.r[1] * st + (rd.o?.[1] ?? 0)] as [number, number]
      }))
      const pts = loc.map((row, i) => row.map(([x, y]) => S(x, y, rings[i].h)))
      const uvs = loc.map((row) => row.map(([x, y]) => (uvf ? uvf(x, y) : uv0)))
      for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < seg; j++) {
        const k = (j + 1) % seg
        tri(m, pts[i][j], pts[i][k], pts[i + 1][k], uvs[i][j], uvs[i][k], uvs[i + 1][k], rings[i].c, hw, hw, hw)
        tri(m, pts[i][j], pts[i + 1][k], pts[i + 1][j], uvs[i][j], uvs[i + 1][k], uvs[i + 1][j], rings[i + 1].c, hw, hw, hw)
      }
      const L = rings[rings.length - 1], cc = center ?? { h: L.h, c: L.c, o: L.o }
      const co: [number, number] = [cc.o?.[0] ?? 0, cc.o?.[1] ?? 0]
      const cp = S(co[0], co[1], cc.h), cuv = uvf ? uvf(co[0], co[1]) : uv0
      const n = pts.length - 1
      for (let j = 0; j < seg; j++) tri(m, pts[n][j], pts[n][(j + 1) % seg], cp, uvs[n][j], uvs[n][(j + 1) % seg], cuv, cc.c, hw)
    }
    // 写实贴图：把器官局部坐标映射回该个体脸照里正常五官的位置（与正常 NPC 同一张图、同一套 UV）。
    // k = 照片里正常五官尺寸 / 器官尺寸；器官旋转时照片跟着转（竖眼 = 一只转了 90° 的真人眼）。
    const photo = (tc: number, xc: number, kx: number, ky: number, ox = 0, oy = 0): UVF => (a, b) => faceUVat(tc + (b - oy) * ky / HH, xc + (a - ox) * kx / wAt(tc))
    const eyePhoto = (x: number, R: number, ox = 0, oy = 0) => photo(T_EYE, x >= 0 ? 0.44 : -0.44, 0.0125 / R, 0.0125 / R, ox, oy)
    const MW = 0.022, MH = 0.0085 // 照片里嘴的半宽 / 半高（米）
    const WHITE3: V3 = [1, 1, 1]
    /** 一颗写实眼球（坐在眼窝里）：穹顶贴该个体脸照里的眼睛；浑浊的整体偏灰蓝 */
    const eyeball = (S: (a: number, b: number, h: number) => V3, R: number, x: number, milky: boolean, ox = 0, oy = 0) => {
      const tint: V3 = milky ? [0.86, 0.92, 1.0] : WHITE3
      disc(S, [
        { r: [R * 0.84, R * 0.66], h: 0.0012, c: mul(tint, [0.78, 0.76, 0.76]), o: [ox, oy] },
        { r: [R * 0.66, R * 0.5], h: 0.0042, c: tint, o: [ox, oy] },
        { r: [R * 0.34, R * 0.26], h: 0.0062, c: tint, o: [ox, oy] },
      ], MAT.face, 8, { h: 0.0068, c: tint, o: [ox, oy] }, eyePhoto(x, R * 0.8, ox, oy))
    }
    /** 写实人眼贴片：几乎平贴皮肤（正常位置的就和正常 NPC 的眼睛一模一样，也会眨眼） */
    const realEye = (S: (a: number, b: number, h: number) => V3, R: number, x: number, milky = false) => {
      const tint: V3 = milky ? [0.86, 0.92, 1.0] : WHITE3
      disc(S, [
        { r: [R * 1.4, R * 1.0], h: 0.0004, c: WHITE3 }, { r: [R * 1.15, R * 0.75], h: 0.0011, c: WHITE3 },
        { r: [R * 0.62, R * 0.36], h: 0.0016, c: tint },
      ], MAT.face, 10, { h: 0.0018, c: tint }, eyePhoto(x, R))
    }
    const socket = (S: (a: number, b: number, h: number) => V3, R: number, ox = 0, oy = 0) => disc(S, [
      { r: [R * 1.3, R * 1.0], h: 0.0005, c: C.skin, o: [ox, oy] },
      { r: [R * 1.02, R * 0.78], h: 0.0034, c: C.fold, o: [ox, oy] },
      { r: [R * 0.84, R * 0.64], h: 0.0016, c: C.raw, o: [ox, oy] },
    ], MAT.skin, 8, { h: 0.0008, c: C.dark, o: [ox, oy] })
    const pit = (S: (a: number, b: number, h: number) => V3, rx: number, ry: number, ox = 0, oy = 0, rim = 0.0026) => disc(S, [
      { r: [rx * 1.7, ry * 1.6], h: 0.0005, c: C.skin, o: [ox, oy] },
      { r: [rx * 1.15, ry * 1.12], h: rim, c: C.fold, o: [ox, oy] },
      { r: [rx * 0.8, ry * 0.8], h: 0.0012, c: C.dark, o: [ox, oy] },
    ], MAT.skin, 8, { h: 0.0008, c: C.void, o: [ox, oy] })

    for (const o of fplan.organs) {
      // 长对了的：放回正常 NPC 的精确位置，1:1 大小、不旋转
      const nrm = 'normal' in o && !!o.normal
      const ot = nrm ? (o.kind === 'eye' ? T_EYE : o.kind === 'nose' ? tN : tM) : o.t
      const ox0 = nrm ? (o.kind === 'eye' ? Math.sign(o.x) * 0.44 : 0) : o.x
      const os = nrm ? 1 : o.s * SZ, orot = nrm ? 0 : o.rot
      const F = at(ot, ox0, orot), S = F.S
      if (o.kind === 'eye') {
        const R = (o.form === 'real' ? 0.0125 : 0.0115) * os
        if (o.form === 'real') realEye(S, R, ox0, o.milky)
        else if (o.form === 'ball') { socket(S, R); eyeball(S, R, ox0, o.milky) }
        else if (o.form === 'pit') {
          disc(S, [
            { r: [R * 1.3, R], h: 0.0005, c: C.skin }, { r: [R * 1.02, R * 0.8], h: 0.0036, c: C.fold },
            { r: [R * 0.72, R * 0.56], h: 0.0014, c: C.dark }, { r: [R * 0.36, R * 0.3], h: 0.0009, c: C.void },
          ], MAT.skin, 8, { h: 0.0007, c: C.void })
        } else if (o.form === 'lidded') {
          // 皮下鼓起的眼球，一道没睁开的缝（眼睑长合了）
          disc(S, [
            { r: [R * 1.35, R * 1.05], h: 0.0005, c: C.skin }, { r: [R * 1.0, R * 0.78], h: 0.0036, c: C.skin },
            { r: [R * 0.62, R * 0.48], h: 0.0056, c: C.fold }, { r: [R * 0.7, R * 0.07], h: 0.0062, c: C.raw },
          ], MAT.skin, 8, { h: 0.0062, c: C.dark })
        } else {
          // 簇眼：三颗小写实眼挤在一个肉窝里
          const r = R * 0.46
          disc(S, [{ r: [R * 1.5, R * 1.25], h: 0.0005, c: C.skin }, { r: [R * 1.15, R * 0.95], h: 0.003, c: C.fold }], MAT.skin, 8, { h: 0.0024, c: C.raw })
          const offs: [number, number][] = [[-R * 0.5, -R * 0.25], [R * 0.5, -R * 0.2], [R * 0.05, R * 0.5]]
          offs.forEach(([ex, ey], k) => eyeball(S, r * (k === 2 ? 0.85 : 1), k === 1 ? -ox0 || 1 : ox0, o.milky, ex, ey))
        }
      } else if (o.kind === 'nose') {
        const s = os
        if (o.form === 'nostrils') { pit(S, 0.0028 * s, 0.0021 * s, -0.0052 * s, 0); pit(S, 0.0025 * s, 0.0023 * s, 0.0055 * s, 0.0006) }
        else if (o.form === 'slit') pit(S, 0.0013 * s, 0.0068 * s, 0, 0, 0.0032)
        else {
          // 鼻：楔形隆起，尖端偏向 -b（flipped 旋转 π，鼻孔朝上）；real 贴该个体脸照里的鼻子，肉鼻只是皮肤
          const real = o.form === 'real'
          const m = real ? MAT.face : MAT.skin
          const uvf = real ? photo(tN + 0.009 / HH, 0, 1 / s, 1 / s, 0, 0) : undefined
          const cc = real ? WHITE3 : C.skin
          disc(S, [
            { r: [0.0125 * s, 0.017 * s], h: 0.0005, c: cc }, { r: [0.0085 * s, 0.013 * s], h: 0.0062 * s, c: cc, o: [0, -0.002 * s] },
            { r: [0.0048 * s, 0.0068 * s], h: 0.0118 * s, c: cc, o: [real ? 0 : 0.001 * s, -0.0052 * s] },
          ], m, 8, { h: 0.0136 * s, c: real ? WHITE3 : C.fold, o: [real ? 0 : 0.0015 * s, -0.0078 * s] }, uvf)
          if (!real) for (const sx of [-1, 1]) {
            const ex = sx * 0.0042 * s, ey = -0.0118 * s
            disc(S, [{ r: [0.0021 * s, 0.0014 * s], h: 0.0052 * s, c: C.dark, o: [ex, ey] }], MAT.skin, 6, { h: 0.0048 * s, c: C.void, o: [ex, ey] })
          }
        }
      } else if (o.kind === 'mouth') {
        const s = os
        if (o.form === 'seam') {
          disc(S, [
            { r: [0.026 * s, 0.0105 * s], h: 0.0005, c: C.skin }, { r: [0.0215 * s, 0.0066 * s], h: 0.0034, c: C.fold },
            { r: [0.0185 * s, 0.0009 * s], h: 0.0028, c: C.lip },
          ], MAT.skin, 10, { h: 0.0026, c: C.fold })
        } else if (o.form === 'real' || o.form === 'slitV') {
          // 写实人嘴（slitV 是同一张嘴竖过来，嘴缝微张）
          const rx = 0.024 * s, ry = 0.0095 * s, uvf = photo(tM, 0, MW / (rx * 0.92), MH / ry)
          const open = o.form === 'slitV'
          disc(S, [
            { r: [rx * 1.14, ry * 1.4], h: 0.0004, c: WHITE3 }, { r: [rx, ry * 1.05], h: 0.0022, c: WHITE3 },
            { r: [rx * 0.72, ry * (open ? 0.22 : 0.45)], h: open ? 0.0018 : 0.0028, c: open ? C.dark : WHITE3 },
          ], MAT.face, 12, { h: open ? 0.0012 : 0.003, c: open ? mul(C.void, [2, 2, 2]) : WHITE3 }, uvf)
        } else if (o.form === 'pucker') {
          // 写实嘴被挤成一个圆孔：嘴唇的照片沿横向压缩，中间开口
          const r0 = 0.0125 * s, uvf = photo(tM, 0, MW / (r0 * 0.75), MH / (r0 * 0.75))
          disc(S, [
            { r: [r0, r0 * 0.95], h: 0.0005, c: WHITE3 }, { r: [r0 * 0.76, r0 * 0.72], h: 0.0042, c: WHITE3, star: 0.14 },
            { r: [r0 * 0.42, r0 * 0.4], h: 0.0036, c: mul(WHITE3, [0.85, 0.7, 0.7]), star: 0.18 }, { r: [r0 * 0.22, r0 * 0.2], h: 0.0018, c: C.dark },
          ], MAT.face, 10, { h: 0.0012, c: C.void }, uvf)
        } else {
          // 撕裂嘴：写实嘴被横向撕宽，嘴唇照片拉长到嘴角裂口，露出牙龈和几颗参差不齐的牙
          const rx = 0.032 * s, ry = 0.0075 * s, uvf = photo(tM, 0, MW / (rx * 0.85), MH / (ry * 1.1))
          disc(S, [
            { r: [rx * 1.08, ry * 1.55], h: 0.0005, c: WHITE3 }, { r: [rx, ry * 1.12], h: 0.0022, c: WHITE3 },
            { r: [rx * 0.92, ry * 0.86], h: 0.0016, c: mul(C.raw, [1.25, 1.25, 1.25]) }, { r: [rx * 0.8, ry * 0.42], h: 0.0012, c: C.dark },
          ], MAT.face, 10, { h: 0.001, c: C.void }, uvf)
          const n = o.teeth
          for (let k = 0; k < n; k++) {
            const up = k % 2 === 0, f = (k + 0.5) / n
            const a = (f * 2 - 1) * rx * 0.72 + Math.sin(k * 7.3) * 0.0012
            const b = (up ? 1 : -1) * ry * (0.55 + 0.1 * Math.sin(k * 3.1))
            const tw = 0.0034 * s * (0.75 + 0.5 * Math.abs(Math.sin(k * 5.7))), th = 0.0042 * s * (0.7 + 0.6 * Math.abs(Math.cos(k * 4.3)))
            const p = S(a, b, 0.0022)
            const m4 = new THREE.Matrix4().makeBasis(F.U, F.V, new THREE.Vector3(...F.n0))
            m4.multiply(new THREE.Matrix4().makeRotationZ(Math.sin(k * 9.1) * 0.35)).scale(new THREE.Vector3(tw, th, 0.0026))
            m4.setPosition(p[0], p[1], p[2])
            geoInto(new THREE.BoxGeometry(1, 1, 1), MAT.solid, mul(TOOTH, [1 - 0.12 * (k % 3), 1 - 0.14 * (k % 3), 1 - 0.18 * (k % 3)]), hw, m4, [0.5, 0.5])
          }
        }
      } else if (o.kind === 'ear') {
        const s = (o.s * SZ)
        if (o.form === 'flap') {
          // 一片肉耳从脸上长出来：耳廓片向一侧翘起，根部一个耳孔
          const m4 = new THREE.Matrix4().makeBasis(F.U, F.V, new THREE.Vector3(...F.n0))
          m4.multiply(new THREE.Matrix4().makeRotationY(0.55)).scale(new THREE.Vector3(0.0085 * s, 0.019 * s, 0.0105 * s))
          const p = S(0.004 * s, 0, 0.0055)
          m4.setPosition(p[0], p[1], p[2])
          geoInto(new THREE.OctahedronGeometry(1, 0), MAT.skin, C.fold, hw, m4, sk)
          pit(S, 0.0024 * s, 0.0032 * s, -0.0058 * s, -0.002 * s, 0.0032)
        } else pit(S, 0.0034 * s, 0.0042 * s, 0, 0, 0.0036)
      }
    }
    // 两侧耳位：只有耳孔 / 发育不全的小肉芽（正常/缺失在上面的耳朵循环里处理）
    fplan.ears.forEach((kind, i) => {
      if (kind !== 'hole') return
      const F = at(0.47, i === 0 ? 1.38 : -1.38, 0)
      pit(F.S, 0.0028, 0.0042, 0, 0, 0.003)
    })
  }

  // ---------- 眼镜：镜框贴着脸的弧面，两片镜圈各自向外侧往后转（包脸），镜腿从镜圈外缘斜着收进鬓角/头发 ----------
  const yEye = headY + (T_EYE + 0.004) * HH, zFace = 0.087 * hD
  if (P.glasses && !P.faceless && P.glasses !== 3) {
    part = 'glasses'
    const kind = P.glasses
    const fc = hex(kind === 1 ? 0x3a2e22 : 0x2d2823), bw = 0.003
    const lw = kind === 1 ? 0.044 : 0.05, lh = kind === 1 ? 0.036 : 0.03, yaw = 0.3
    for (const s of [-1, 1]) {
      const cx = s * 0.036, cz = zFace - 0.004
      const R = new THREE.Matrix4().makeRotationY(s * yaw)
      const at = (lx: number, ly: number): V3 => { const v = new THREE.Vector3(lx, ly, 0).applyMatrix4(R); return [cx + v.x, yEye + v.y, cz + v.z] }
      if (kind === 1) {
        // 圆框：八边形镜圈
        for (let k = 0; k < 8; k++) {
          const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2
          const p0 = at(Math.cos(a0) * lw / 2, Math.sin(a0) * lh / 2), p1 = at(Math.cos(a1) * lw / 2, Math.sin(a1) * lh / 2)
          const seg = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])
          const rot = new THREE.Matrix4().makeRotationY(s * yaw).multiply(new THREE.Matrix4().makeRotationZ((a0 + a1) / 2 + Math.PI / 2))
          box([(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2], [seg + 0.002, bw, bw], MAT.solid, fc, hw, rot)
        }
      } else {
        for (const y of [-lh / 2, lh / 2]) box(at(0, y), [lw, bw, bw], MAT.solid, fc, hw, R)
        for (const x of [-lw / 2, lw / 2]) box(at(x, 0), [bw, lh, bw], MAT.solid, fc, hw, R)
      }
      // 镜腿：镜圈外上角 → 耳朵上方（藏进头发）
      const h = at(s * lw / 2, lh / 2 - 0.004), e: V3 = [s * 0.079 * hW, yEye + 0.002, -0.012]
      const dx = e[0] - h[0], dz = e[2] - h[2], len = Math.hypot(dx, dz)
      const T = new THREE.Matrix4().makeRotationY(Math.atan2(dx, dz))
      box([(h[0] + e[0]) / 2, (h[1] + e[1]) / 2, (h[2] + e[2]) / 2], [bw, bw + 0.001, len], MAT.solid, fc, hw, T)
    }
    box([0, yEye + 0.006, zFace + 0.006], [0.024, bw + 0.001, bw], MAT.solid, fc, hw)
  }
  if (P.glasses === 3 && !P.faceless) {
    // 墨镜（Wayfarer 式）：上宽下窄的梯形镜片随脸弧面弯曲；镜框是有厚度的醋酸板框，上沿眉框加粗、
    // 镜片是单独的玻璃材质（Phong 高光 + 半透明 + 上深下浅渐变 + 一道斜向反光条），镜腿带铰链块、尾端下弯挂耳
    part = 'sunglasses'
    const fc = hex(0x121212), fcHi = hex(0x2a2a2c), yaw = 0.28
    // 镜片外轮廓（镜片局部，+x = 外侧）
    const OUT: [number, number][] = [[-0.024, 0.017], [0.0, 0.0185], [0.028, 0.019], [0.031, 0.007], [0.027, -0.008], [0.018, -0.016], [0.004, -0.0175], [-0.012, -0.016], [-0.021, -0.01], [-0.025, 0.004]]
    const n = OUT.length
    for (const s of [-1, 1]) {
      const cx = s * 0.035, cz = zFace + 0.002
      const R = new THREE.Matrix4().makeRotationY(s * yaw)
      // 镜片局部 → 头部坐标：外侧往后弯（弧面包脸），z 偏移 dz 用于镜框前后层
      const at = (lx: number, ly: number, dz = 0): V3 => {
        const v = new THREE.Vector3(s * lx, ly, dz - 1.6 * lx * lx - (lx > 0 ? 0.35 : 0.1) * lx * lx * 10).applyMatrix4(R)
        return [cx + v.x, yEye + 0.002 + v.y, cz + v.z]
      }
      // 镜片：中心扇形，渐变（上沿 0.05 → 下沿 0.2，暗青灰）
      const lensC = (ly: number): V3 => { const k = clamp((0.019 - ly) / 0.037, 0, 1); return [0.015 + 0.07 * k, 0.02 + 0.08 * k, 0.026 + 0.09 * k] }
      const c0 = at(0.002, 0.001, 0.001)
      for (let k = 0; k < n; k++) {
        const a = OUT[k], b = OUT[(k + 1) % n]
        const pa = at(a[0], a[1], 0.001), pb = at(b[0], b[1], 0.001)
        const ca = lensC(a[1]), cb = lensC(b[1]), cc = lensC(0.001)
        // 外凸面朝前：s 镜像后保持逆时针
        if (s > 0) { vert(MAT.glass, c0, [0.5, 0.5], cc, hw); vert(MAT.glass, pb, [0.5, 0.5], cb, hw); vert(MAT.glass, pa, [0.5, 0.5], ca, hw) }
        else { vert(MAT.glass, c0, [0.5, 0.5], cc, hw); vert(MAT.glass, pa, [0.5, 0.5], ca, hw); vert(MAT.glass, pb, [0.5, 0.5], cb, hw) }
        partTriangles[part] = (partTriangles[part] || 0) + 1
      }
      // 斜向反光条（上外侧，PS1 式假高光）
      {
        const q = [at(0.008, 0.016, 0.0016), at(0.0135, 0.016, 0.0016), at(0.0035, -0.004, 0.0016), at(-0.002, -0.004, 0.0016)]
        const hc: V3 = [0.3, 0.33, 0.36]
        if (s > 0) quad(MAT.glass, q[3], q[2], q[1], q[0], [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5]], hc, [hw, hw, hw, hw])
        else quad(MAT.glass, q[0], q[1], q[2], q[3], [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5]], hc, [hw, hw, hw, hw])
      }
      // 镜框：轮廓外扩一圈（上沿眉框更宽），前后两层 + 外侧壁，形成 5mm 厚的板框
      const rim = (k: number, sc: number): [number, number] => {
        const [x, y] = OUT[k], top = y > 0.012
        const g = top ? 0.0065 : 0.0035
        const L = Math.hypot(x, y) || 1
        return [x + (x / L) * g * sc, y + (y / L) * g * sc + (top ? 0.002 * sc : 0)]
      }
      const ring = (sc: number, dz: number) => OUT.map((_, k) => { const r = sc === 0 ? OUT[k] : rim(k, sc); return at(r[0], r[1], dz) })
      const inF = ring(0, 0.003), outF = ring(1, 0.003), outB = ring(1, -0.003), inB = ring(0, -0.003)
      for (let k = 0; k < n; k++) {
        const j = (k + 1) % n
        const top = OUT[k][1] > 0.012 && OUT[j][1] > 0.012
        const col = top ? fcHi : fc
        const faces: V3[][] = [[inF[k], inF[j], outF[j], outF[k]], [outF[k], outF[j], outB[j], outB[k]], [inB[k], inB[j], inF[j], inF[k]]]
        // 两面都出（镜像后不必逐面判断朝向；框很薄，多出的背面只有几十个三角）
        for (const f of faces) {
          quad(MAT.solid, f[0], f[1], f[2], f[3], [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5]], col, [hw, hw, hw, hw])
          quad(MAT.solid, f[3], f[2], f[1], f[0], [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5]], col, [hw, hw, hw, hw])
        }
      }
      // 铰链块（镜框外上角）+ 镜腿（宽扁、尾端下弯挂到耳后）
      const hinge = at(0.034, 0.012, -0.004)
      box(hinge, [0.007, 0.011, 0.012], MAT.solid, fc, hw, R)
      const e1: V3 = [s * 0.08 * hW, yEye + 0.004, -0.02], e2: V3 = [s * 0.076 * hW, yEye - 0.016, -0.05]
      for (const [p0, p1, th] of [[hinge, e1, 0.008], [e1, e2, 0.006]] as [V3, V3, number][]) {
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2], L = Math.hypot(dx, dy, dz)
        const T = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(dx, dy, dz), new THREE.Vector3(0, 1, 0))
        box([(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2], [0.004, th, L + 0.004], MAT.solid, fc, hw, T)
      }
    }
    // 鼻梁：两片镜框内上角之间的拱桥
    box([0, yEye + 0.011, zFace + 0.008], [0.024, 0.006, 0.006], MAT.solid, fcHi, hw)
  }
  // ---------- 头饰（装备）：潜水面罩 / 头灯 / 夜视仪，绕头一圈的头带按颅骨尺寸 ----------
  const hg = P.headgear ?? {}
  const strap = (t: number, col: V3, h = 0.022, extra = 0.01) => {
    const ring = (dy: number) => Array.from({ length: 10 }, (_, j) => {
      const a = (j / 10) * Math.PI * 2
      const pf = hl ? hl.puff + 0.002 : 0, p = surf(t, a, pf + extra, coverEars)
      return [p[0], p[1] + dy, p[2]] as V3
    })
    const rs = [ring(-h / 2), ring(h / 2)]
    loft(rs, rs.map((r) => r.map(() => hw)), MAT.solid, col, () => [0.5, 0.5], true)
  }
  if (hg.divemask) {
    part = 'divemask'
    const dk = hex(0x2a2d30)
    box([0, yEye, zFace + 0.016], [0.16, 0.07, 0.03], MAT.solid, dk, hw)
    box([0, yEye, zFace + 0.032], [0.13, 0.05, 0.004], MAT.prop, hex(0x7ac9d9), hw)
    strap(T_EYE + 0.02, dk, 0.03)
  }
  if (hg.headlamp) {
    part = 'headlamp'
    strap(0.8, hex(0x3a3a3e), 0.026)
    const [, d] = skullAt(0.8, 0)
    box([0, headY + 0.8 * HH, d + 0.02], [0.055, 0.04, 0.03], MAT.solid, hex(0x2a2d30), hw)
    box([0, headY + 0.8 * HH, d + 0.036], [0.034, 0.026, 0.004], MAT.prop, hex(0xfff2c0), hw)
  }
  if (hg.nightvision) {
    part = 'nightvision'
    const dk = hex(0x26322b)
    for (const s of [-1, 1]) {
      box([s * 0.034, yEye, zFace + 0.028], [0.036, 0.036, 0.046], MAT.solid, dk, hw)
      box([s * 0.034, yEye, zFace + 0.052], [0.026, 0.026, 0.004], MAT.prop, hex(0x78b886), hw)
    }
    box([0, yEye, zFace + 0.02], [0.05, 0.03, 0.04], MAT.solid, dk.map((v) => v * 0.8) as V3, hw)
    strap(T_EYE + 0.06, hex(0x343b37), 0.024)
  }

  // ---------- 道具 ----------
  if (props.has('axe')) {
    // 「幸运」：从不离身的金色斧头（右手垂握）
    part = 'axe'
    const gold = hex(0xd4a838), wood = hex(0x5a3a22), wh = W('handR')
    const hx = -(0.225 * sh + 0.014), hz = 0.012
    // 斧柄：六边形锥管，握在掌心，柄尾略粗
    tube([
      { p: [hx, 0.42, hz], rx: 0.016, rz: 0.019, w: wh },
      { p: [hx, 0.62, hz], rx: 0.013, rz: 0.016, w: wh },
      { p: [hx, 0.9, hz], rx: 0.015, rz: 0.018, w: wh },
    ], 6, MAT.solid, wood, 'solid')
    // 斧头：侧面轮廓挤出（斧眼套在柄上、刃口向前展开、后有锤背），金色
    const sh2 = new THREE.Shape()
    sh2.moveTo(-0.03, 0.03); sh2.lineTo(0.02, 0.028); sh2.lineTo(0.1, 0.06); sh2.quadraticCurveTo(0.125, 0.0, 0.1, -0.07)
    sh2.lineTo(0.02, -0.03); sh2.lineTo(-0.03, -0.028); sh2.lineTo(-0.045, 0.0); sh2.closePath()
    const ax = new THREE.ExtrudeGeometry(sh2, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 3 })
    ax.translate(0, 0, -0.008)
    geoInto(ax, MAT.prop, gold, wh, TRS([hx, 0.45, hz], [1.3, 1.3, 1], [0, -Math.PI / 2, 0]), [0.5, 0.5])
  }
  if (props.has('neckerchief')) {
    // 厨师领巾：绕颈一圈 + 前结，暖红
    part = 'neckerchief'
    const red = hex(0xb04030)
    tube([
      { p: [0, 1.44, -0.01], rx: 0.094, rz: 0.088, w: W('chest') },
      { p: [0, 1.47, -0.01], rx: 0.088, rz: 0.082, w: W('chest', 0.7, 'neck') },
    ], 8, MAT.solid, red, 'solid', [false, false], Math.PI / 8)
    box([0, 1.43, 0.086], [0.045, 0.04, 0.024], MAT.solid, red.map((v) => v * 0.85) as V3, W('chest'), TRS([0, 0, 0], [1, 1, 1], [0, 0, Math.PI / 4]))
  }
  if (props.has('clipboard')) {
    part = 'clipboard'
    // 背在身后的手里攥着配给表夹板：硬纸板 + 纸 + 金属夹
    const cb = hex(0x7a5c3a), paper = hex(0xe8e2d0), steel = hex(0x9a9ca0)
    box([0, 0.99, -0.158], [0.23, 0.31, 0.008], MAT.solid, cb, W('hips'))
    box([0, 0.98, -0.163], [0.2, 0.26, 0.003], MAT.solid, paper, W('hips'))
    box([0, 1.13, -0.165], [0.07, 0.025, 0.014], MAT.solid, steel, W('hips'))
  }

  // ---------- 组装 SkinnedMesh ----------
  const geo = new THREE.BufferGeometry()
  const all = { p: [] as number[], uv: [] as number[], c: [] as number[], si: [] as number[], sw: [] as number[] }
  let start = 0
  bins.forEach((b, m) => {
    const n = b.p.length / 3
    if (!n) return
    for (let i = 0; i < b.p.length; i++) all.p.push(b.p[i])
    for (let i = 0; i < b.uv.length; i++) all.uv.push(b.uv[i])
    for (let i = 0; i < b.c.length; i++) all.c.push(b.c[i])
    for (let i = 0; i < b.si.length; i++) { all.si.push(b.si[i]); all.sw.push(b.sw[i]) }
    geo.addGroup(start, n, m)
    start += n
  })
  geo.setAttribute('position', new THREE.Float32BufferAttribute(all.p, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(all.uv, 2))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(all.c, 3))
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(all.si, 4))
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(all.sw, 4))
  geo.computeVertexNormals()
  geo.computeBoundingSphere()

  const mk = (name: string, map: THREE.Texture | null, emis = 0.2, extra: THREE.MeshLambertMaterialParameters = {}) => {
    const m = new THREE.MeshLambertMaterial({ map, flatShading: true, vertexColors: true, ...extra })
    if (map) { m.emissive.setHex(0xffffff); m.emissiveMap = map; m.emissiveIntensity = emis }
    // 自发光托底也乘顶点色（衣物/发丝靠顶点色染色，否则托底会把染色冲成灰）
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;') }
    m.customProgramCacheKey = () => 'retroEmisVC'
    installL0EnvironmentShader(m)
    installL1DynamicProbe(m)
    const environmentKey = m.customProgramCacheKey()
    m.customProgramCacheKey = () => environmentKey + '|retro-emissive-vertex-color'
    m.name = `retro ${id} / ${name}`
    return m
  }
  let faceTex = tex.face, blinkTex = tex.faceBlink
  // 无面灵：皮肤组（脸面 + 颈/手/耳等单点采样）整体用通用无五官脸面；脸照只留给 L3 的写实器官（face 组，照常眨眼）
  const skinTex = P.faceless && tex.faceless ? tex.faceless : tex.face
  const faceMat = mk('face', faceTex, 0.34)
  const skinMap = WR && tex.skinTile ? tex.skinTile : skinTex
  const mats = [
    mk('body', tex.body, 0.2, WR ? { alphaTest: 0.5, side: THREE.DoubleSide } : P.top.drapedHem ? {side:THREE.DoubleSide} : {}), faceMat, mk('skin', skinMap, 0.26), mk('solid', null), mk('hair', tex.hair, 0.16, { side: THREE.DoubleSide }),
    mk('prop', null, 0, { emissive: new THREE.Color(0x2a2008) }),
  ]
  // 镜片玻璃：Phong 高光 + 半透明（只有戴墨镜的角色才有这个绘制组）
  const glass = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 96, specular: 0x9aa8b4, transparent: true, opacity: 0.94, emissive: 0x020304, side: THREE.DoubleSide })
  glass.name = `retro ${id} / glass`
  mats.push(glass as unknown as THREE.MeshLambertMaterial)
  const mesh = new THREE.SkinnedMesh(geo, mats)
  mesh.name = `retroNpc:${id}`
  mesh.frustumCulled = false

  const bones = {} as Record<BoneName, THREE.Bone>
  for (const n of BONES) {
    const b = new THREE.Bone()
    b.name = n
    const par = PARENT[n]
    const w = BW[n], pw = par ? BW[par] : [0, 0, 0]
    b.position.set(w[0] - pw[0], w[1] - pw[1], w[2] - pw[2])
    b.userData.bind = b.position.clone()
    bones[n] = b
    if (par) bones[par].add(b)
  }
  mesh.add(bones.hips)
  mesh.updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(BONES.map((n) => bones[n]))
  mesh.bind(skeleton)

  const group = new THREE.Group()
  group.name = `RetroNpc / ${id}`
  group.add(mesh)
  group.scale.setScalar(P.height)

  // ---------- 姿势：离散 24Hz 采样 ----------
  const seed = opts.seed ?? (id.charCodeAt(0) * 31 + id.length)
  const phase = opts.phase ?? (seed % 97) * 0.13
  const driven = !!opts.driven
  const e = new THREE.Euler()
  const setR = (n: BoneName, x: number, y: number, z: number) => { bones[n].quaternion.setFromEuler(e.set(x, y, z, 'XYZ')) }
  // —— IK 工具（全部在 SkinnedMesh 局部空间计算，与 group 的位置/缩放无关）——
  const qMesh = (n: BoneName | null, out: THREE.Quaternion) => {
    out.identity()
    const chain: BoneName[] = []
    for (let c = n; c; c = PARENT[c]) chain.unshift(c)
    for (const c of chain) out.multiply(bones[c].quaternion)
    return out
  }
  const pMesh = (n: BoneName, out: THREE.Vector3) => {
    // 骨骼原点在网格局部空间的位置
    const chain: BoneName[] = []
    for (let c: BoneName | null = n; c; c = PARENT[c]) chain.unshift(c)
    out.set(0, 0, 0); const q = new THREE.Quaternion(), tmp = new THREE.Vector3()
    for (const c of chain) { tmp.copy(bones[c].position).multiply(bones[c].scale.x === 1 ? new THREE.Vector3(1, 1, 1) : bones[c].scale).applyQuaternion(q); out.add(tmp); q.multiply(bones[c].quaternion) }
    return out
  }
  const DOWN = new THREE.Vector3(0, -1, 0)
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion()
  const aimBone = (n: BoneName, dir: THREE.Vector3) => {
    qMesh(PARENT[n], qa); qb.setFromUnitVectors(DOWN, dir.clone().normalize())
    bones[n].quaternion.copy(qa.invert().multiply(qb))
  }
  const len = (a: BoneName, b: BoneName) => new THREE.Vector3(...BW[a]).distanceTo(new THREE.Vector3(...BW[b]))
  const armIK = (side: 'L' | 'R', target: THREE.Vector3, bend: THREE.Vector3) => {
    const ua = ('upperArm' + side) as BoneName, fa = ('foreArm' + side) as BoneName
    const hd = ('hand' + side) as BoneName
    const l1 = len(ua, fa), l2 = len(fa, hd)
    bones[ua].quaternion.identity(); bones[fa].quaternion.identity()
    const s0 = pMesh(ua, new THREE.Vector3())
    const d = target.clone().sub(s0); const dist = clamp(d.length(), 0.05, l1 + l2 - 0.001); d.normalize()
    const bn = bend.clone().addScaledVector(d, -bend.dot(d)).normalize()
    const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), hgt = Math.sqrt(Math.max(0, l1 * l1 - along * along))
    const elbow = s0.clone().addScaledVector(d, along).addScaledVector(bn, hgt)
    aimBone(ua, elbow.clone().sub(s0))
    const hand = s0.clone().addScaledVector(d, dist)
    aimBone(fa, hand.sub(elbow))
  }
  let lastStep = -1
  let eyeClosed = false
  const pose = (t: number) => {
    const br = Math.sin(t * 1.6 + phase) // 呼吸 ~0.25Hz
    if (driven) {
      // 游戏内：四肢/头/躯干由外部动画（userData.parts）驱动，这里只做胸廓呼吸与锁骨起伏
      setR('chest', -0.01 + br * 0.008, 0, 0)
      bones.chest.scale.set(1 + br * 0.006, 1, 1 + br * 0.012)
      setR('clavicleL', 0, 0, br * 0.012); setR('clavicleR', 0, 0, -br * 0.012)
      return
    }
    const sway = Math.sin(t * 0.37 + phase)
    bones.hips.position.copy(bones.hips.userData.bind as THREE.Vector3)
    bones.hips.position.x += sway * 0.008
    setR('hips', 0, 0, sway * 0.018)
    setR('spine', 0.02, 0, -sway * 0.012)
    setR('chest', -0.01 + br * 0.008, 0, -sway * 0.008)
    bones.chest.scale.set(1 + br * 0.006, 1, 1 + br * 0.012)
    setR('clavicleL', 0, 0, br * 0.012); setR('clavicleR', 0, 0, -br * 0.012)
    setR('neck', 0.03, 0, 0)
    const look = Math.sin(t * 0.21 + phase * 2) * 0.22 + Math.sin(t * 0.53) * 0.04
    setR('head', -0.02 + Math.sin(t * 0.29) * 0.03, look, sway * 0.02)
    // 双腿：重心落在一侧，另一膝微屈
    const lean = sway * 0.5 + 0.5
    setR('thighL', -0.03 * lean, 0, sway * 0.02); setR('shinL', 0.07 * lean, 0, 0); setR('footL', -0.04 * lean, 0, 0)
    setR('thighR', -0.03 * (1 - lean), 0, sway * 0.02); setR('shinR', 0.07 * (1 - lean), 0, 0); setR('footR', -0.04 * (1 - lean), 0, 0)
    // 手臂：两骨 IK 到手部目标（网格局部坐标，绑定尺度），bend 指定肘部朝向
    const tgt = (x: number, y: number, z: number, bx: number, by: number, bz: number) => ({ t: new THREE.Vector3(x, y, z), b: new THREE.Vector3(bx, by, bz) })
    let L = tgt(0.23 * sh, 0.87, 0.03, 0.2, 0, -1), R = tgt(-0.23 * sh, 0.87, 0.03, -0.2, 0, -1)
    switch (P.pose) {
      case 'behind-back': // 双手背后攥着夹板
        L = tgt(0.05, 0.99 + br * 0.003, -0.15, 1, 0, -0.35); R = tgt(-0.05, 0.99 + br * 0.003, -0.15, -1, 0, -0.35); break
      case 'hands-on-hips': // 叉腰
        L = tgt(0.15 * P.waist + 0.05, 1.03, 0.0, 1, 0.1, -0.6); R = tgt(-0.15 * P.waist - 0.05, 1.03, 0.0, -1, 0.1, -0.6); break
      case 'hold-axe': // 左手自然垂，右手垂握斧柄
        L = tgt(0.215 * sh, 0.875 + br * 0.003, 0.02, 0.3, 0, -1); R = tgt(-0.225 * sh, 0.88, 0.06, -0.2, 0, -1); break
      case 'hands-front': // 双手在身前交握
        L = tgt(0.035, 0.985, 0.16, 1, -0.3, -0.5); R = tgt(-0.035, 0.97, 0.165, -1, -0.3, -0.5); break
    }
    armIK('L', L.t, L.b); armIK('R', R.t, R.b)
    setR('handL', 0, 0, P.pose === 'hands-on-hips' ? 0.6 : 0); setR('handR', 0, 0, P.pose === 'hands-on-hips' ? -0.6 : 0)
  }
  pose(0)

  const update = (time: number) => {
    const step = Math.floor(time * RETRO_POSE_HZ)
    if (step === lastStep) return
    lastStep = step
    const t = step / RETRO_POSE_HZ
    pose(t)
    // 眨眼：预载贴图对调（只换 map 引用，不上传）；每 3.1~4.6s 一次、闭 0.13s
    const period = 3.1 + (seed % 5) * 0.37
    const closed = ((t + phase) % period) < 0.13
    if (closed !== eyeClosed) {
      eyeClosed = closed
      faceMat.map = closed ? blinkTex : faceTex
      faceMat.emissiveMap = faceMat.map
    }
  }
  const setFace = (f: THREE.Texture, b: THREE.Texture) => {
    faceTex = f; blinkTex = b
    faceMat.map = eyeClosed ? b : f; faceMat.emissiveMap = faceMat.map
    if (skinTex === tex.face && skinMap === skinTex) { mats[MAT.skin].map = f; mats[MAT.skin].emissiveMap = f }
  }

  const tris = geo.getAttribute('position').count / 3
  const headB = BW.head[1]
  return {
    group, mesh, bones, update, setFace,
    // 材质释放；贴图由共享缓存持有（retroTexture / retroAvatar 池），这里不释放
    dispose: () => { skeleton.dispose(); geo.dispose(); mats.forEach((m) => m.dispose()) },
    anchors: wretchAnchors ? { eyes: wretchAnchors.eyes.map((p) => [p[0] - BW.head[0], p[1] - BW.head[1], p[2] - BW.head[2]] as [number, number, number]), eyeR: wretchAnchors.eyeR } : undefined,
    headFrame: { chinY: headY + T_CHIN * HH - headB, topY: headY + 1.04 * HH - headB, faceZ: zFace - BW.head[2], halfW: 0.076 * hW, eyeY: yEye - headB },
    diagnostics: { id, bones: BONES.length, triangles: tris, drawCalls: geo.groups.length, partTriangles, poseHz: RETRO_POSE_HZ },
  }
}
