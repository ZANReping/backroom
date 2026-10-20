// v83：容器「尸体」= Object 70（Backrooms 中文维基 object-70）
// 设定：一系列面朝下趴在开阔单调处的尸体。全部是同一张平平无奇的中老年白人男性面孔——棕色短发、黑眼、无须、
// 脸上有枯槁的皱纹、神情疲惫而平和；右颈有一块早期黑素瘤；身穿颜色款式各异的三件套西装（最常见棕褐色 V 领商务款），
// 熨得整洁如新、皮鞋擦得锃亮；右手无名指戴一枚朴素银戒；手里提着一只老式公文包（自制晚餐便当、文具、水瓶……）。
// 它们会像普通尸体一样腐朽，最终只剩白骨。
//
// 建模：复用复古形象体系（retroAvatar → buildRetroFigure），按种子摆成俯卧姿势后 CPU 烘焙成静态网格
// （同一变体缓存 CPU 模板；运行实例独立持有几何/材质，共用图片）。公文包、银戒、黑素瘤、白骨头颅、尸液污渍为独立小网格。
// 搜刮动画（renderer.updateStructs 'corpse'）：搜索进度条期间公文包从手里抽出、两枚铜扣弹开（k 0→0.5），
// 搜索完成后箱盖向外翻开、露出内容物（k 0.5→1）；物品取空（looted）后箱内清空，箱盖保持敞开。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { DEFAULT_AVATAR, SKIN_OPTIONS, type AvatarCfg } from '../core/avatar'
import { buildAvatarModel } from './retroAvatar'
import { object70Hash, object70Keep } from '../decorations/object70'
import type { RetroNpc, RetroSpec } from './retroNpc'
import { getMaterialMode, litMaterial } from './shared'

export type O70Stage = 0 | 1 | 2 // 0 新鲜 / 1 腐败 / 2 白骨
export const O70_STAGE_NAMES = ['新鲜', '腐败', '白骨'] as const
/** 三件套西装配色：外套 / 马甲 / 西裤（第 0 款棕褐色 V 领商务款最常见） */
export const O70_SUITS = [
  { name: '棕褐', coat: '#8a6c4c', pants: '#7c6044', w: 0.46 },
  { name: '炭灰', coat: '#4c4f54', pants: '#45484d', w: 0.16 },
  { name: '海军蓝', coat: '#2c3650', pants: '#283149', w: 0.14 },
  { name: '橄榄褐', coat: '#5e5638', pants: '#575034', w: 0.12 },
  { name: '黑', coat: '#26262a', pants: '#232327', w: 0.12 },
] as const

const hash = object70Hash
const rnd = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

export { object70Keep }

export interface O70Variant { suit: number; stage: O70Stage; pose: 0 | 1; head: -1 | 1; yaw: number }
/** 种子 → 变体：腐化 新鲜 70% / 腐败 20% / 白骨 10%；西装按权重；两种俯卧姿势；头偏左/偏右 */
export function object70Variant(seed: number): O70Variant {
  const r = rnd(hash(seed, 70))
  const a = r()
  const stage: O70Stage = a < 0.7 ? 0 : a < 0.9 ? 1 : 2
  let b = r(), suit = 0
  for (let i = 0; i < O70_SUITS.length; i++) { b -= O70_SUITS[i].w; if (b < 0) { suit = i; break } }
  return { suit, stage, pose: r() < 0.5 ? 0 : 1, head: r() < 0.5 ? -1 : 1, yaw: (r() - 0.5) * 0.7 }
}

const shade = (c: string, k: number) => {
  const n = parseInt(c.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0')
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`
}
const desat = (c: string, k: number, toward = '#6a6458') => {
  const a = parseInt(c.slice(1), 16), b = parseInt(toward.slice(1), 16)
  const m = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k).toString(16).padStart(2, '0')
  return `#${m(16)}${m(8)}${m(0)}`
}

const lam = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => litMaterial({ color, ...extra })
const MATS = new Map<string, THREE.Material>()
const mat = (key: string, make: () => THREE.Material) => { key = `${getMaterialMode()}:${key}`; let m = MATS.get(key); if (!m) { m = make(); MATS.set(key, m) } return m }

// Cache only CPU templates. Live models own their geometry and materials so
// chunk retirement, item pools and previews cannot dispose another instance.
function ownMaterials(root: THREE.Object3D) {
  const owned = new Map<THREE.Material, THREE.Material>()
  const copy = (source: THREE.Material) => {
    let result = owned.get(source)
    if (!result) {
      result = source.clone()
      result.onBeforeCompile = source.onBeforeCompile
      result.customProgramCacheKey = source.customProgramCacheKey
      result.userData.object70Owned = true
      owned.set(source, result)
    }
    return result
  }
  root.traverse(o => {
    const m = o as THREE.Mesh
    if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map(copy) : copy(m.material)
  })
}
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number], r: [number, number, number] = [0, 0, 0]) => {
  const o = new THREE.Mesh(g, m); o.position.set(...p); o.rotation.set(...r); o.castShadow = false; return o
}
const BOX = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)

interface BakedBody { group: THREE.Group; hand: THREE.Vector3; handQ: THREE.Quaternion; neck: THREE.Vector3; neckN: THREE.Vector3; head: THREE.Vector3; headQ: THREE.Quaternion; headFrame: RetroNpc['headFrame']; scale: number; tris: number }
const BODY_CACHE = new Map<string, BakedBody>()

/** 复古形象 → 俯卧姿势 → 静态烘焙（结果为「尸体局部」坐标：原点在躯干中点地面，头朝 +Z） */
function bakeBody(v: O70Variant): BakedBody {
  const key = `${getMaterialMode()}/${v.suit}/${v.stage}/${v.pose}/${v.head}`
  const hit = BODY_CACHE.get(key)
  if (hit) return hit
  const S = O70_SUITS[v.suit]
  const rot = v.stage === 1, bone = v.stage === 2
  const coat = bone ? desat(S.coat, 0.45, '#5c574c') : rot ? desat(shade(S.coat, 0.8), 0.25, '#4a4636') : S.coat
  const pants = bone ? desat(S.pants, 0.45, '#5c574c') : rot ? desat(shade(S.pants, 0.8), 0.25, '#4a4636') : S.pants
  const cfg: AvatarCfg = { ...DEFAULT_AVATAR, gender: 0, skin: SKIN_OPTIONS[0], hair: bone ? 0 : 1, hairColor: '#5a3c24', top: coat, topStyle: 3, pants, pantsStyle: 0, shoes: 0, glasses: 0, beard: 0, face: 0 }
  // 同一张脸：池脸 浅肤 · 第 3 张（中老年、皱纹）——种子 %3 === 2
  const model = buildAvatarModel(cfg, {
    seed: 70 * 3 + 2, driven: true, faceless: bone, closedEyes: !bone,
    specPatch: (s: RetroSpec) => {
      s.height = 1.0; s.shoulder = 1.0; s.waist = bone ? 0.86 : 1.04; s.hip = 1.0; s.limb = 1.0; s.belly = bone ? 0 : 0.02
      s.head = [1.0, 1.0, 1.0]; s.jaw = 1.0; s.beard = 0; s.glasses = 0
      s.top = { hemY: 0.79, fit: 0.026, collar: 'open', sleeves: 'long', tint: parseInt(coat.slice(1), 16) } // V 领西装外套（下摆盖过臀线）
      s.pants = { style: 'long', tint: parseInt(pants.slice(1), 16) }
      s.shoe = { color: bone ? 0x2a2420 : rot ? 0x1e1a18 : 0x141416, style: 'loafer' } // 擦得锃亮的黑皮鞋
      if (rot) s.skinTint = 0xb8b48c // 腐败：灰绿、发蜡
      if (bone) { s.skinTint = 0xd8ccb0; s.hair = 'none' }
    },
  })
  const npc = model.userData.retro as RetroNpc
  const B = npc.bones
  const e = new THREE.Euler()
  const set = (n: keyof RetroNpc['bones'], x: number, y: number, z: number) => B[n].quaternion.setFromEuler(e.set(x, y, z, 'XYZ'))
  // 骨骼局部轴 = 网格轴（站立：+Y 上、+Z 前、解剖左 +X）。整体再绕 X 轴 +90° 放倒：头 → +Z、正面 → 朝下。
  const h = v.head
  set('neck', 0.05, h * 0.42, 0)
  set('head', 0.12, h * 0.95, h * -0.05) // 脸侧向一边，面颊贴地
  set('spine', 0, 0, 0.03 * h)
  if (v.pose === 0) {
    set('upperArmL', 0.05, 0, 1.45); set('foreArmL', 0, 0, 1.25); set('handL', 0, 0, 0.3) // 左臂屈肘伸到头侧
    set('upperArmR', 0.08, 0, -0.32); set('foreArmR', -0.15, 0, -0.08); set('handR', 0, 0.2, 0) // 右臂贴身，手里攥着公文包
  } else {
    set('upperArmL', 0.1, 0, 0.42); set('foreArmL', -0.2, 0, 0.1); set('handL', 0, 0, 0)
    set('upperArmR', 0.06, 0, -0.55); set('foreArmR', -0.1, 0, -0.18); set('handR', 0, 0.2, 0) // 右臂外撇，公文包在身侧
  }
  set('thighL', 0, 0.45, 0.1); set('thighR', 0, -0.4, v.pose ? -0.16 : -0.07) // 腿外旋，脚侧倒
  set('shinL', v.pose ? 0.25 : 0.05, 0, 0); set('shinR', 0.05, 0, 0)
  set('footL', 1.25, 0, 0); set('footR', 1.25, 0, 0)
  if (bone) { B.head.scale.setScalar(0.001); for (const n of ['handL', 'handR'] as const) B[n].scale.set(0.75, 0.95, 0.75) } // 白骨：颅骨另建
  const fig = npc.group
  const holder = new THREE.Group()
  holder.add(fig)
  holder.rotation.x = Math.PI / 2 // 正面朝下、头朝 +Z（右手在 -X 侧）
  holder.updateMatrixWorld(true)
  npc.mesh.skeleton.update()
  // —— 烘焙：骨骼蒙皮 → 静态几何（holder 局部）
  const m = npc.mesh, src = m.geometry, pos = src.getAttribute('position')
  const out = new Float32Array(pos.count * 3), p = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i); m.applyBoneTransform(i, p); p.applyMatrix4(m.matrixWorld); out.set([p.x, p.y, p.z], i * 3) }
  const g = new THREE.BufferGeometry()
  for (const k of ['uv', 'color']) if (src.getAttribute(k)) g.setAttribute(k, src.getAttribute(k))
  g.setAttribute('position', new THREE.BufferAttribute(out, 3))
  if (src.index) g.setIndex(src.index)
  g.computeVertexNormals()
  for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex ?? 0)
  const root = new THREE.Group()
  const body = new THREE.Mesh(g, m.material); body.name = 'object70 body'
  root.add(body)
  m.traverse((o) => {
    const mm = o as THREE.Mesh
    if (!mm.isMesh || o === m || !mm.visible) return
    const c = new THREE.Mesh(mm.geometry, mm.material)
    c.matrixAutoUpdate = false; c.matrix.copy(mm.matrixWorld); root.add(c)
  })
  // 贴地：最低点落到 y=0；躯干中点（髋—胸之间）挪到原点
  g.computeBoundingBox()
  const bb = g.boundingBox!
  const wp = (n: keyof RetroNpc['bones'], o = new THREE.Vector3()) => B[n].getWorldPosition(o)
  const mid = wp('hips').add(wp('chest')).multiplyScalar(0.5)
  const off = new THREE.Vector3(-mid.x, -bb.min.y + (bone ? -0.02 : -0.012), -mid.z) // 胸腹压在地上，略微下沉
  root.children.forEach((c) => { if (c.matrixAutoUpdate) c.position.add(off); else c.matrix.premultiply(new THREE.Matrix4().makeTranslation(off.x, off.y, off.z)) })
  if (bone) root.scale.set(1, 1, 1)
  const q = new THREE.Quaternion()
  const res: BakedBody = {
    group: root,
    hand: wp('handR').add(off), handQ: B.handR.getWorldQuaternion(q.clone()),
    neck: wp('neck').lerp(wp('head'), 0.35).add(off), neckN: new THREE.Vector3(-1, 0, 0).applyQuaternion(B.neck.getWorldQuaternion(new THREE.Quaternion())),
    head: wp('head').add(off), headQ: B.head.getWorldQuaternion(new THREE.Quaternion()), headFrame: npc.headFrame, scale: fig.scale.x,
    tris: (src.index ? src.index.count : pos.count) / 3,
  }
  BODY_CACHE.set(key, res)
  // The posed rig is never rendered. Its static CPU template retains the
  // image references and mesh attributes, not a live skeleton/bone texture.
  npc.mesh.skeleton.dispose()
  src.dispose()
  return res
}

/** 白骨颅骨（低模）：颅顶 + 眶窝 + 鼻孔 + 上颌齿列 + 下颌，头骨局部坐标（与 headFrame 同系：下巴 y=chinY、前 +Z） */
function buildSkull(hf: RetroNpc['headFrame']): THREE.Group {
  const g = new THREE.Group()
  const boneM = mat('o70bone', () => lam('#d6cbb0'))
  const darkM = mat('o70socket', () => lam('#1c1612'))
  const hy = hf.topY - hf.chinY, cy = hf.chinY + hy * 0.62
  const cran = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), boneM)
  cran.scale.set(hf.halfW * 1.0, hy * 0.42, hf.halfW * 1.18); cran.position.set(0, cy, -0.01); g.add(cran)
  const face = mesh(BOX(hf.halfW * 1.35, hy * 0.36, hf.halfW * 0.9), boneM, [0, hf.chinY + hy * 0.36, hf.faceZ - hf.halfW * 0.55])
  g.add(face)
  for (const s of [-1, 1]) g.add(mesh(new THREE.IcosahedronGeometry(hf.halfW * 0.26, 0), darkM, [s * hf.halfW * 0.38, hf.eyeY, hf.faceZ - 0.012]))
  g.add(mesh(BOX(hf.halfW * 0.22, hy * 0.08, 0.02), darkM, [0, hf.chinY + hy * 0.4, hf.faceZ - 0.01]))
  const jaw = mesh(BOX(hf.halfW * 1.15, hy * 0.12, hf.halfW * 0.8), boneM, [0, hf.chinY + hy * 0.08, hf.faceZ - hf.halfW * 0.62], [0.35, 0, 0]) // 下颌松脱、微张
  g.add(jaw)
  mergeStatic(g)
  return g
}

/** 同材质的静态子网格合并成一个（公文包 ~25 个小盒子 → 每组 3–4 批），可动件（lid/latch/goods 组）保持独立 */
function mergeStatic(g: THREE.Group) {
  const by = new Map<THREE.Material, THREE.Mesh[]>()
  for (const c of g.children) { const m = c as THREE.Mesh; if (m.isMesh && !m.userData.lid) { const k = m.material as THREE.Material; by.set(k, [...(by.get(k) ?? []), m]) } }
  for (const [mt, list] of by) {
    if (list.length < 2) continue
    const mixed = list.some((m) => !m.geometry.index)
    const geos = list.map((m) => { m.updateMatrix(); const gg = mixed && m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); return gg.applyMatrix4(m.matrix) })
    const merged = mergeGeometries(geos, false)
    geos.forEach((x) => x.dispose())
    if (!merged) continue
    for (const m of list) { g.remove(m); m.geometry.dispose() }
    const mm = new THREE.Mesh(merged, mt); mm.castShadow = false; g.add(mm)
  }
}

/** 自制便当盒：蓝色盒身 + 米白盒盖 + 一道红橡皮筋（公文包内容物与地面物品「自制便当」共用） */
function bentoGroup(): THREE.Group {
  const bento = new THREE.Group()
  bento.add(mesh(BOX(0.12, 0.045, 0.17), mat('o70bento', () => lam('#3c6a8a')), [0, 0.0225, 0]))
  bento.add(mesh(BOX(0.124, 0.014, 0.174), mat('o70bentoLid', () => lam('#d8d2bf')), [0, 0.052, 0]))
  bento.add(mesh(BOX(0.128, 0.064, 0.014), mat('o70band', () => lam('#a83a2a')), [0, 0.03, 0.02]))
  bento.add(mesh(BOX(0.02, 0.003, 0.05), mat('o70bentoTag', () => lam('#8a8270')), [0.035, 0.0605, -0.05])) // 盒盖上的胶布名签
  mergeStatic(bento)
  return bento
}
/** 地面物品「自制便当」 */
export function buildBentoItemMesh(): THREE.Group {
  const g = bentoGroup(); g.scale.setScalar(1.35); ownMaterials(g); return g
}

/** 老式公文包：硬壳箱体 + 外侧铰链箱盖 + 两枚铜扣 + 皮提手；内容物（便当盒 / 水瓶 / 钢笔 / 折起的信纸）。部件按 movable 约定命名 */
function buildBriefcase(r: () => number, stage: O70Stage) {
  const W = 0.43, D = 0.31, H = 0.085, LT = 0.035 // 长（沿 Z）/ 宽（沿 X）/ 箱体高 / 箱盖厚
  const leather = stage === 2 ? '#4a3a2c' : stage === 1 ? '#553722' : ['#6e4228', '#5c3820', '#7a4c2c'][Math.floor(r() * 3)]
  const legM = mat(`o70leather${leather}`, () => lam(leather))
  const edgeM = mat(`o70leatherEdge${leather}`, () => lam(shade(leather, 0.7)))
  const brass = mat(`o70brass${stage}`, () => lam(stage === 2 ? '#6a5a36' : '#b8913a', { emissive: new THREE.Color(stage === 2 ? 0x000000 : 0x1a1206) }))
  const lining = mat('o70lining', () => lam('#6a2a22'))
  const caseG = new THREE.Group(); caseG.name = 'briefcase'
  // 箱体（开口朝上的浅盒）：底 + 四壁 + 里衬
  caseG.add(mesh(BOX(D, 0.012, W), edgeM, [0, 0.006, 0]))
  for (const s of [-1, 1]) {
    caseG.add(mesh(BOX(0.012, H, W), legM, [s * (D / 2 - 0.006), H / 2, 0]))
    caseG.add(mesh(BOX(D, H, 0.012), legM, [0, H / 2, s * (W / 2 - 0.006)]))
  }
  caseG.add(mesh(BOX(D - 0.024, 0.004, W - 0.024), lining, [0, 0.014, 0]))
  // 包角（铜）
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) caseG.add(mesh(BOX(0.022, 0.03, 0.022), brass, [sx * (D / 2 - 0.006), 0.015, sz * (W / 2 - 0.006)]))
  // 提手：在靠尸体手的一侧（+X）长边中部
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.009, 5, 10, Math.PI), edgeM)
  handle.rotation.set(0, Math.PI / 2, Math.PI / 2); handle.position.set(D / 2 + 0.004, H * 0.62, 0); caseG.add(handle)
  for (const s of [-1, 1]) caseG.add(mesh(BOX(0.014, 0.018, 0.016), brass, [D / 2 + 0.004, H * 0.62, s * 0.045]))
  // 内容物（搜刮完成前可见；looted 后收起）
  const goods = new THREE.Group(); goods.name = 'goods'
  const bento = bentoGroup()
  bento.position.set(-0.06, 0.016, -0.08); goods.add(bento)
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.17, 8), mat('o70bottle', () => lam('#9ab8c4', { transparent: true, opacity: 0.75 })))
  bottle.rotation.x = Math.PI / 2; bottle.position.set(0.075, 0.045, -0.05); goods.add(bottle)
  goods.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.026, 8), mat('o70cap', () => lam('#2a5a8a')), [0.075, 0.045, 0.045], [Math.PI / 2, 0, 0]))
  goods.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 6), mat('o70pen', () => lam('#1a1a1e')), [0.06, 0.022, 0.13], [Math.PI / 2, 0, 0.15]))
  goods.add(mesh(BOX(0.11, 0.006, 0.15), mat('o70paper', () => lam('#e4dcc4')), [-0.055, 0.02, 0.12], [0, 0.08, 0]))
  caseG.add(goods)
  // 箱盖：铰链在外侧（-X）长边，盖板从铰链向 +X 伸出
  const lid = new THREE.Group(); lid.name = 'lid'
  lid.position.set(-D / 2, H, 0)
  lid.add(mesh(BOX(D, LT, W), legM, [D / 2, LT / 2, 0]))
  lid.add(mesh(BOX(D - 0.02, 0.004, W - 0.02), lining, [D / 2, -0.001, 0]))
  lid.add(mesh(BOX(D * 0.98, 0.004, W * 0.98), edgeM, [D / 2, LT + 0.001, 0])) // 盖面压边
  const latches: THREE.Object3D[] = []
  for (const s of [-1, 1]) {
    const l = new THREE.Group(); l.name = 'latch'
    l.position.set(D + 0.004, LT * 0.5, s * 0.13)
    l.add(mesh(BOX(0.012, 0.03, 0.03), brass, [0, -0.012, 0]))
    lid.add(l); latches.push(l)
    caseG.add(mesh(BOX(0.008, 0.02, 0.034), brass, [D / 2 + 0.003, H - 0.012, s * 0.13])) // 箱体上的扣座
  }
  caseG.add(lid)
  mergeStatic(caseG); mergeStatic(lid); mergeStatic(goods)
  return { caseG, lid, latches, goods, W, D }
}

export interface Object70Build { group: THREE.Group; variant: O70Variant; tris: number; parts: { caseG: THREE.Object3D; lid: THREE.Object3D; latches: THREE.Object3D[]; goods: THREE.Object3D } }

/** 构建一具 Object 70。seed：世界坐标哈希（窗口重缝合不变）。返回的 group 原点在躯干中点地面、头朝 +Z（外部再转 rotation.y） */
export function buildObject70(seed: number): Object70Build {
  const v = object70Variant(seed)
  const r = rnd(hash(seed, 171))
  const baked = bakeBody(v)
  const group = new THREE.Group(); group.name = 'object70'
  const body = baked.group.clone(true)
  body.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry = m.geometry.clone() })
  group.add(body)
  let tris = baked.tris
  // 右颈黑素瘤（腐败期发暗，白骨期没有）
  if (v.stage < 2) {
    const mel = new THREE.Mesh(new THREE.IcosahedronGeometry(0.011, 0), mat(`o70mel${v.stage}`, () => lam(v.stage ? '#2a1a14' : '#3a2218')))
    mel.scale.set(1.25, 0.5, 1); mel.position.copy(baked.neck).addScaledVector(baked.neckN, 0.052 * baked.scale)
    group.add(mel)
  } else {
    const sk = buildSkull(baked.headFrame)
    sk.scale.setScalar(baked.scale * 0.85); sk.quaternion.copy(baked.headQ); sk.position.copy(baked.head)
    group.add(sk); tris += 120
    // 指骨（双手各四根）
    const boneM = mat('o70bone', () => lam('#d6cbb0'))
    const fingers = new THREE.Group()
    for (let i = 0; i < 4; i++) fingers.add(mesh(new THREE.CylinderGeometry(0.005, 0.004, 0.06, 4), boneM, [baked.hand.x - 0.01 + i * 0.012, 0.012, baked.hand.z - 0.05], [Math.PI / 2, 0, 0]))
    mergeStatic(fingers); group.add(fingers)
  }
  // 右手无名指银戒
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0095, 0.0028, 4, 8), mat('o70ring', () => lam('#c8ccd2', { emissive: new THREE.Color(0x202224) })))
  ring.position.copy(baked.hand).add(new THREE.Vector3(0.012, -0.012, -0.045)); ring.rotation.x = Math.PI / 2
  group.add(ring)
  // 尸液 / 干涸污渍（腐败、白骨期）：贴地暗斑
  if (v.stage > 0) {
    const stain = new THREE.Mesh(new THREE.CircleGeometry(1, 14), mat(`o70stain${v.stage}`, () => lam(v.stage === 1 ? '#2a2216' : '#3a3428', { transparent: true, opacity: v.stage === 1 ? 0.62 : 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })))
    stain.rotation.x = -Math.PI / 2; stain.scale.set(0.38 + r() * 0.08, 0.8 + r() * 0.12, 1); stain.position.set((r() - 0.5) * 0.06, 0.004, -0.05)
    stain.renderOrder = -1
    group.add(stain)
  }
  // 公文包：躺在右手外侧，提手对着手心
  const bc = buildBriefcase(r, v.stage)
  const out = baked.hand.x >= 0 ? 1 : -1 // 公文包在手的外侧（远离躯干）
  bc.caseG.position.set(baked.hand.x + out * (bc.D / 2 + 0.035), 0, baked.hand.z + (r() - 0.5) * 0.04)
  bc.caseG.rotation.y = (out > 0 ? Math.PI : 0) + (r() - 0.5) * 0.18
  bc.caseG.userData.out = out
  group.add(bc.caseG)
  tris += 220
  group.rotation.y = v.yaw
  ownMaterials(group)
  tris = 0
  group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) tris += (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3 })
  return { group, variant: v, tris, parts: { caseG: bc.caseG, lid: bc.lid, latches: bc.latches, goods: bc.goods } }
}

/** 搜刮动画（k：0 未动 → 0.5 搜索进度条走完（抽出 + 弹扣）→ 1 箱盖全开）。部件基准在 userData（movable 约定） */
export function animateObject70Part(ch: THREE.Object3D, part: string, k: number, looted: boolean) {
  const c01 = (x: number) => Math.max(0, Math.min(1, x))
  const ease = (x: number) => { const t = c01(x); return t * t * (3 - 2 * t) }
  const u = ch.userData as { bx: number; by: number; bz: number; brx: number; bry: number; brz: number }
  if (part === 'case') { // 从手里抽出，往外拖一截、转正一点
    const a = ease(k / 0.3)
    const out = (ch.userData.out as number) ?? -1
    ch.position.x = u.bx + out * a * 0.14; ch.position.z = u.bz + a * 0.03; ch.rotation.y = u.bry + out * a * 0.28
  } else if (part === 'latch') { // 铜扣翻起弹开
    const a = ease((k - 0.28) / 0.16)
    ch.rotation.z = u.brz + a * 1.3
  } else if (part === 'lid') { // 箱盖绕外侧铰链翻开 ~112°
    const a = ease((k - 0.5) / 0.5)
    ch.rotation.z = u.brz + a * 1.95
  } else if (part === 'goods') { // 内容物：箱盖开到一半后可见；取空后收起
    const s = !looted && k > 0.62 ? 1 : 0.0001
    ch.scale.setScalar(s)
  }
}
