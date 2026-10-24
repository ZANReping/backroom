import {buildBursterEntity} from './bursterRender'
// 实体低模（骨骼式分组：四肢/头独立 pivot，可程序化动画）
// v14：全实体模型审计+精细化——每种实体专属分支、统一正面=+X、
// 面部特征 mesh 打 userData.face 标记（验收脚本据此校验朝向质心）。
// v23：按 Backrooms Wikidot / Fandom 正文重做 hound / duller / clump / faceling /
// skinstealer / smiler / deathmoth，并补齐 Level 6–11 / Level 601 的 14 种新实体。
//
// ★ 建模准则（新增/修改实体时必须遵守）★
// 实体模型必须尽可能精致，把该实体的全部设定特征都表现出来——形态/配色/标志性
// 器官/伤口/姿态，一个都不能少，拒绝「几个方块拼个人形」式的敷衍。典例（达标线）：
//   悲尸 wretch / 观察者 watcher / 派对客 partygoer / 猎犬 hound / 死亡飞蛾 deathmoth / 肢团 clump
// 新实体请先读这些 case 再动手；设定依据在 entities/ 各定义的 codex 注释里。
import * as THREE from 'three'
import { buildWranglerEntity } from './wranglerRender'
import { buildTinyMesh } from './tinyMesh'
import { buildThingMesh } from './thingMesh'
import { planFacelingFace } from './facelingFace'
import { facelingAge, FACELING_AGE_HEIGHT } from '../entities/facelingTraits'
import { buildMothMesh } from './mothMeshes'
import { buildLightguideEntityMesh } from './lightguideRender' // [L8-lightguide]
import { buildCurabiturEntityMesh } from './curabiturRender' // [L8-curabitur]
import { buildSmilerMesh } from './smilerMesh'
import { buildHoundMesh } from './houndMesh'
import { buildSkinStealerMesh } from './skinStealerMesh'
import { buildWretchMesh } from './wretchMesh'
import { buildRatMesh } from './ratMesh'
import { buildClumpMesh } from './clumpMesh'
import { buildDullerMesh } from './dullerMesh'
import { buildArmsMesh, buildArmsVent, armsVent } from './armsMesh'
import { buildNguithrAnimated } from './nguithrAnim'
import {buildNguithrNest} from './nguithrMesh'
import { buildShrimpMesh } from './shrimpMesh'
import { buildPartygoerMesh } from './partygoerMesh'
import {buildJerryMesh} from './jerryMesh'
import { buildFerrenMesh } from './ferrenMesh' // [ferren]
import { buildNWMesh } from './watchRender'
import { ENTITIES } from '../entities'
import { box, cyl, glow, litMaterial, mulberry } from './shared'
import { buildAvatarModel, fitLegacyAttachments } from './retroAvatar'
import { randomAvatar } from '../core/avatar'
import { buildCamoEntity } from './camoRender' // [L8-camo]
import { buildArachnidEntityMesh } from './arachnidRender' // [L8-arachnid]
import { buildWindowEntity } from './windowMesh' // [window]
import { buildVendingMachineJob } from './vendingMesh' // [vending]
import { vendingSeedOfEntity } from '../content/vendingLayout'

// ---------- 实体低模（骨骼式分组：四肢/头独立 pivot，可程序化动画）----------
// 朝向约定：模型正面 = +X（updateEntities 用 rotation.y = -e.facing 对齐移动/玩家方向）。
// 人形/正脸类模型按 +Z 建造（面部特征在 +Z），构建末期包一层 rotation.y=π/2 的内层组，
// 把正面旋到 +X，并以 userData.facesZ 标记（供追击前倾轴选择）。
// 面部特征（眼/牙/灯/面罩）统一打 userData.face=1，供朝向验收。
type PartMap = Record<string, THREE.Object3D>

// v53：实体建模变体（L3 高智能实体：无面灵错位面部器官/石器工具、尸鼠水豚形态；seed=实体 id，保证重建一致）
// ratMorph：尸鼠按层级固定形态——L2 灰白廊道种群 / L3 水豚（capybara 优先）/ L5 酒店正装（小西装+领结）/ 其余层级深褐（旧档「死亡鼠」）
export interface EntityMeshOpts {
  /** [window] 窗户 Entity 2：窗型 / 生命阶段 / 种子 */
  windowStyle?: import('./windowMesh').WindowStyle
  windowLife?: 'occupied' | 'newborn' | 'dying' | 'gone'
  windowSeed?: number
  arms?: {count:number;seed:number}
  nguithr?: {scale:number;seed:number;sacs:readonly unknown[]}
  partygoerColor?: import('../entities/partygoerLook').PartygoerColor
  partygoerIntern?: boolean
  partygoerBalloonArm?: 0 | 1
  mothForm?: import('../entities/types').MothForm
  l3face?: boolean; tool?: boolean; capybara?: boolean
  facelingAge?: import('../entities/facelingTraits').FacelingAge
  facelingRole?: import('../entities/facelingTraits').FacelingRole
  ratMorph?: import('../engine/ratAI').RatMorph; seed?: number
  ceilingCrawler?: boolean
  /** [vending] Entity 36 被打坏后撬开了后部暗格（露出三具艾里克尸体） */
  vmOpened?: boolean
  arachnidMorph?: 'spider' | 'scorpion' | 'tick' | 'mite'
  arachnidBreed?: number
  herbivore?: boolean
  curabiturSex?: 'female'|'male'
  curabiturSeed?: number
  arachnidVariant?: string // [L8-arachnid] 重制变种
  arachnidMother?: boolean // [L8-arachnid] 幼蛛潮带母蛛
  smilerKind?: import('../entities/smilers').SmilerKind // v61：笑魇变种
  houndNeutral?: boolean // v62：L11 中立猎犬
  wretchKind?: import('../entities/wretches').WretchKind
  l3clump?: boolean // v64：L3 高智能肢团（v65：更大的肉团、更粗的肢体、独立持械臂）
  wranglerKind?: 'male' | 'female' | 'juvenile' // 牧蛇变种（wranglerAI 首个 tick 决定）
  wranglerPregnant?: boolean
}

// 七层之物使用纯程序化 UV：DataTexture 在浏览器与 Node 验收脚本中都可创建，
// 因而不依赖外部素材或 DOM canvas。颜色图负责腐肉斑、盐渍与陈年疤痕；高度图
// 则把细密皮褶真正交给受光模型，而不是继续用几块浅色方片冒充皮肤细节。
let thingSkinTextures: { color: THREE.DataTexture; bump: THREE.DataTexture } | null = null
function getThingSkinTextures() {
  if (thingSkinTextures) return thingSkinTextures
  const n = 256
  const rgba = new Uint8Array(n * n * 4)
  const height = new Uint8Array(n * n * 4)
  const hash = (x: number, y: number) => {
    let h = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y ^ 0xc2b2ae35, 0x27d4eb2f)
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12
    return (h >>> 0) / 4294967295
  }
  const rot: [number, number, number][] = [[38, 46, 17], [119, 89, 24], [203, 37, 14], [221, 179, 27], [72, 198, 19]]
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const p = (y * n + x) * 4
    const fine = hash(x, y) - 0.5
    const coarse = hash(x >> 3, y >> 3) - 0.5
    const fold = Math.sin(y * 0.34 + Math.sin(x * 0.075) * 2.4) * 0.5 + 0.5
    const scale = Math.sin(x * 0.052 + Math.sin(y * 0.031) * 2.1) * 0.5 + 0.5
    let r = 61 + fine * 23 + coarse * 28 + fold * 9
    let g = 62 + fine * 20 + coarse * 23 + scale * 7
    let b = 51 + fine * 15 + coarse * 15
    let bh = 108 + fine * 72 + fold * 32 + scale * 18
    // 长而不规则的旧伤：浅灰瘢痕中央带一条更暗的裂口。
    const scar = Math.abs(((x * 0.83 + y * 0.29 + Math.sin(y * 0.12) * 9) % 91) - 45.5)
    if (scar < 2.1 && ((x + y * 3) % 157) < 104) {
      const k = 1 - scar / 2.1
      r += 54 * k; g += 50 * k; b += 38 * k; bh += 58 * k
      if (scar < 0.55) { r -= 48; g -= 43; b -= 31; bh -= 92 }
    }
    // 坏死/腐烂斑不会规则平铺，使用数个跨边界距离场形成破碎岛状暗斑。
    for (const [cx, cy, rad] of rot) {
      const dx0 = Math.abs(x - cx), dy0 = Math.abs(y - cy)
      const dx = Math.min(dx0, n - dx0), dy = Math.min(dy0, n - dy0)
      const d = Math.hypot(dx * 1.25, dy)
      if (d < rad + Math.sin(Math.atan2(dy, dx || 0.01) * 7) * 3) {
        const k = 1 - d / rad
        r -= 34 + k * 22; g -= 35 + k * 26; b -= 22 + k * 12; bh -= 45 + k * 48
        if (d > rad * 0.72) { r += 31; g += 15; b += 8 }
      }
    }
    rgba[p] = Math.max(8, Math.min(155, r)); rgba[p + 1] = Math.max(8, Math.min(150, g)); rgba[p + 2] = Math.max(7, Math.min(125, b)); rgba[p + 3] = 255
    const hv = Math.max(4, Math.min(245, bh))
    height[p] = height[p + 1] = height[p + 2] = hv; height[p + 3] = 255
  }
  const color = new THREE.DataTexture(rgba, n, n, THREE.RGBAFormat)
  color.colorSpace = THREE.SRGBColorSpace
  color.wrapS = color.wrapT = THREE.RepeatWrapping
  color.repeat.set(2.6, 1.45)
  color.magFilter = THREE.LinearFilter; color.minFilter = THREE.LinearMipmapLinearFilter
  color.generateMipmaps = true; color.anisotropy = 4; color.needsUpdate = true
  const bump = new THREE.DataTexture(height, n, n, THREE.RGBAFormat)
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping
  bump.repeat.copy(color.repeat)
  bump.magFilter = THREE.LinearFilter; bump.minFilter = THREE.LinearMipmapLinearFilter
  bump.generateMipmaps = true; bump.anisotropy = 4; bump.needsUpdate = true
  thingSkinTextures = { color, bump }
  return thingSkinTextures
}
/** 手臂（Entité 15-FR）容器：恒等变换的外层组（渲染层每帧把它归零），子节点 armsHome = 本体风口（buildArmsVent，
 *  anchor 上挂 buildArmsMesh）。臂数/种子在 AI 初始化后才确定，由 renderer.updateArmsMesh 按需换一副骨架；
 *  临时风口、焦皮碎片、血迹也由渲染层按 AI 状态补进本容器（世界坐标直接摆放）。 */
export function buildArmsEntityMesh(count = 3, seed = 1): THREE.Group {
  const grp = new THREE.Group()
  grp.userData.entityType = 'arms'
  const vent = buildArmsVent()
  vent.name = 'armsHome'
  const arms = buildArmsMesh(count, seed)
  armsVent(vent)!.anchor.add(arms)
  vent.userData.armsKey = `${count}:${seed}`
  grp.add(vent)
  grp.userData.armsHome = vent
  return grp
}
/** Nguithr'xurh 容器：恒等变换的外层组（渲染层每帧把它归零），子节点 ngSpider 为倒挂外层组（世界坐标直接摆放），
 *  巢（buildNguithrNest）在 AI 初始化出巢种子与网囊数后由 renderer 补进来（userData.ngNest）。 */
export function buildNguithrEntityMesh(scale = 1, count = 4, seed = 16): THREE.Group {
  const grp = new THREE.Group()
  grp.userData.entityType = 'nguithr'
  const sp = buildNguithrAnimated(scale)
  sp.name = 'ngSpider'; sp.rotation.x = Math.PI
  grp.add(sp)
  grp.userData.ngSpider = sp
  grp.userData.ngScale = scale
  const nest=buildNguithrNest(count,seed);grp.add(nest);grp.userData.ngNest=nest
  return grp
}
/** [window] 本客户端的「观察者种子」：同一扇窗，不同的人看到不同的风景（联机各端各自随机） */
const WINDOW_VIEWER = Math.floor(Math.random() * 4)
function buildWindowEntityMesh(opts?: EntityMeshOpts): THREE.Group {
  const life = opts?.windowLife ?? 'occupied', seed = opts?.windowSeed ?? 1
  const g = buildWindowEntity({ style: opts?.windowStyle ?? 'l601', state: life === 'newborn' ? 'newborn' : life === 'dying' || life === 'gone' ? 'dying' : 'occupied', seed, viewerSeed: (seed + WINDOW_VIEWER) % 4 })
  g.userData.winLife = life
  return g
}

export function* buildVendingEntityJob(type: string, opts?: EntityMeshOpts): Generator<void, THREE.Group, unknown> {
  const vm = yield* buildVendingMachineJob({ variant: 'e36', seed: vendingSeedOfEntity(opts?.seed ?? 3), dismantled: !!opts?.vmOpened })
  const root = new THREE.Group(); vm.rotation.y = Math.PI / 2; root.add(vm)
  root.userData.entityType = type; root.userData.parts = {}; root.userData.vending = vm.userData.vending
  root.userData.vmRoot = vm; root.userData.vmOpened = !!opts?.vmOpened
  return root
}

export function buildEntityMesh(type: string, opts?: EntityMeshOpts): THREE.Group {
  if (type === 'vendingmachine' || type === 'vmad') { const job = buildVendingEntityJob(type, opts); let step = job.next(); while (!step.done) step = job.next(); return step.value }
  if (type === 'curabitur') return buildCurabiturEntityMesh(opts)
  if (type === 'lightguide') return buildLightguideEntityMesh(opts?.seed ?? 0)
  if(type==='burster')return buildBursterEntity(opts?.seed??0)
  if (type === 'windowent') return buildWindowEntityMesh(opts) // [window] 重制窗户 Entity 2（windowMesh；动画 windowAnim，摆位 windowRender）
  if (type === 'arms') return buildArmsEntityMesh(opts?.arms?.count,opts?.arms?.seed) // 手臂重制：风口 + 1–3 条蒙皮长臂（armsMesh），动画由 renderer.updateArmsMesh 按 AI 状态驱动
  if(type==='jerry')return buildJerryMesh()
  if (type === 'ferren') return buildFerrenMesh() // [ferren] 重制 Ferren（Entity 92，貂色雪貂）
  if (type === 'nguithr') return buildNguithrEntityMesh(opts?.nguithr?.scale,opts?.nguithr?.sacs.length,opts?.nguithr?.seed) // 重制 Nguithr'xurh：避日目蒙皮模型（58 骨，3 次绘制）+ 程序化动画；巢由渲染层按 AI 的巢种子补建
  if (type === 'watcher' || type === 'strider' || type === 'mangled') return buildNWMesh(type) // 重制邻里守望 / 残缺者（WATCH-REMAKE.md）
  if (type === 'partygoer') return buildPartygoerMesh(opts?.seed ?? 0, { color: opts?.partygoerColor, intern: opts?.partygoerIntern, balloonArm: opts?.partygoerBalloonArm })
  if(type === 'deathmoth') return buildMothMesh(opts?.mothForm ?? 'male')
  if(type === 'wrangler') return buildWranglerEntity(opts?.wranglerKind ?? 'male', !!opts?.wranglerPregnant)
  if (type === 'clump') return buildClumpMesh(!!opts?.l3clump, opts?.seed ?? 0)
  if (type === 'duller') return buildDullerMesh(opts?.seed ?? 0) // v63：重制钝人
  if (type === 'dryshrimp') return buildShrimpMesh(opts?.seed ?? 0) // v81：重制旱虾（奇虾体型，鳍片划水着色器动画）
  if (type === 'camocrawler') return buildCamoEntity(opts?.seed) // [L8-camo] 重制四臂潜伏者（共享伪装统一量 + 手上巨石）
  if (type === 'arachnid') return buildArachnidEntityMesh(opts) // [L8-arachnid] 重制 17 变种（arachnidMesh）
  if (type === 'hound') return buildHoundMesh(!!opts?.houndNeutral, opts?.seed ?? 0) // v62：重制猎犬
  if (type === 'corpserat') return buildRatMesh(opts?.ratMorph ?? (opts?.capybara ? 'capybara' : opts?.ceilingCrawler ? 'cave' : 'common'), opts?.seed ?? 0, !!opts?.ceilingCrawler)
  if (type === 'wretch') return buildWretchMesh(opts?.seed ?? 0, opts?.wretchKind)
  if (type === 'skinstealer') return buildSkinStealerMesh(opts?.seed ?? 0) // v77：重制窃皮者（真身）
  if (type === 'thething') return buildThingMesh() // [thing] 重制七层之物（Entity 20）：黑巨口鱼式头 + 28 节鳞甲躯干
  if (type === 'tiny') return buildTinyMesh() // [tiny] 重制小小（Entity 720，披鲨皮的瘦长类人形）
  if (type === 'smiler') return buildSmilerMesh(opts?.smilerKind ?? 'common', opts?.seed ?? 0) // v61：重制笑魇（含 5 变种）
  const grp = new THREE.Group()
  grp.userData.entityType = type
  const def = ENTITIES[type]
  const c = def?.color ?? '#888888'
  const parts: PartMap = {}
  grp.userData.parts = parts
  const lam = (color: string | number) => new THREE.MeshLambertMaterial({ color })
  // 自发光 Lambert：高彩度伤口/黏膜/粉尘/烟雾等。刻意不用 MeshBasicMaterial——
  // 冒烟脚本按「所有 Basic 材质 mesh 的质心」判朝向，这类装饰不应参与统计。
  const emat = (color: string, inten = 0.35, opacity = 1) => new THREE.MeshLambertMaterial({
    color, emissive: new THREE.Color(color), emissiveIntensity: inten,
    transparent: opacity < 1, opacity,
  })
  const ebox = (w: number, h: number, d: number, color: string, x: number, y: number, z: number, inten = 0.35): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), emat(color, inten))
    m.position.set(x, y, z)
    grp.add(m)
    return m
  }
  const basic = (color: string, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity })
  // 球体助手（眼球/流线躯体/肉瘤）：只创建不挂载，由调用方决定父级
  const sph = (r: number, color: string | number, seg = 8, mat?: THREE.Material): THREE.Mesh =>
    new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)), mat ?? lam(color))
  // 关节 mesh：几何原点移到关节处（顶部），可整体旋转
  const joint = (w: number, h: number, d: number, color: string | number, x: number, y: number, z: number, part: string, mat?: THREE.Material) => {
    const geo = new THREE.BoxGeometry(w, h, d)
    geo.translate(0, -h / 2, 0)
    const m = new THREE.Mesh(geo, mat ?? lam(color))
    m.position.set(x, y, z)
    m.userData.part = part
    parts[part] = m
    grp.add(m)
    return m
  }
  // 挂在自定义 holder 上的关节肢：holder 承担预旋转/朝向。
  // renderer 只写部件自身的 rotation，不会覆盖 holder——预摆姿因此得以保留。
  const jointOn = (holder: THREE.Object3D, w: number, h: number, d: number, color: string | number, part: string) => {
    const geo = new THREE.BoxGeometry(w, h, d)
    geo.translate(0, -h / 2, 0)
    const m = new THREE.Mesh(geo, lam(color))
    m.userData.part = part
    parts[part] = m
    holder.add(m)
    return m
  }
  // 原生 +X 模型的肢体：holder 绕 Y 转 -π/2，使 renderer 写入的 rotation.x 摆动
  // 落在前后（±X）平面而不是左右；splay 为侧向外张角（写在 holder 上，不被覆盖）。
  const jointX = (w: number, h: number, d: number, color: string | number, x: number, y: number, z: number, part: string, splay = 0) => {
    const holder = new THREE.Group()
    holder.position.set(x, y, z)
    holder.rotation.y = -Math.PI / 2
    holder.rotation.z = splay
    grp.add(holder)
    return jointOn(holder, w, h, d, color, part)
  }
  // 修复 v15：tag 必须真正把部件挂入场景图——v14 多处 tag(box(...), 'torso') 未 grp.add，
  // 导致久坐者/猎犬躯干与头、运输车底盘、笑魇躯干、死亡飞蛾胸头等整件不可见。
  const tag = (m: THREE.Object3D, part: string) => { m.userData.part = part; parts[part] = m; if (!m.parent) grp.add(m); return m }
  const face = (m: THREE.Mesh) => { m.userData.face = 1; return m }
  // 双眼（+Z 面，供人形；facesX 模型需自行摆放到 +X）
  const eyes = (y: number, spread: number, color = '#ffffff', s = 0.05, z = 0.18) => {
    const e1 = face(glow(s, s, s, color, -spread, y, z))
    const e2 = face(glow(s, s, s, color, spread, y, z))
    grp.add(e1, e2)
    return [e1, e2]
  }
  // 通用人形：躯干/头/双臂/双腿独立 pivot；opts 支持分区配色与材质覆盖（半透明幽灵）
  interface HOpts { head?: string | number; limbs?: string | number; mat?: THREE.Material; armLen?: number }
  const humanoid = (h: number, bulk: number, color: string | number, opts: HOpts = {}) => {
    const lc = opts.limbs ?? color
    const armL = opts.armLen ?? h * 0.45
    const mk = (w: number, hh: number, d: number, cc: string | number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), opts.mat ?? lam(cc))
      m.position.set(x, y, z); grp.add(m); return m
    }
    tag(mk(0.42 * bulk, h * 0.5, 0.26 * bulk, color, 0, h * 0.55, 0), 'torso')
    tag(mk(0.3 * bulk, 0.3 * bulk, 0.28 * bulk, opts.head ?? color, 0, h * 0.93, 0), 'head')
    joint(0.12 * bulk, armL, 0.14 * bulk, lc, -0.3 * bulk, h * 0.72, 0, 'armL', opts.mat)
    joint(0.12 * bulk, armL, 0.14 * bulk, lc, 0.3 * bulk, h * 0.72, 0, 'armR', opts.mat)
    joint(0.15 * bulk, h * 0.38, 0.16 * bulk, lc, -0.12 * bulk, h * 0.38, 0, 'legL', opts.mat)
    joint(0.15 * bulk, h * 0.38, 0.16 * bulk, lc, 0.12 * bulk, h * 0.38, 0, 'legR', opts.mat)
  }
  // 在关节末端附加细节（爪/手套/靴——随肢体摆动）
  const tip = (parent: THREE.Object3D, w: number, h: number, d: number, color: string | number, y: number, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(color))
    m.position.set(0, y, z)
    parent.add(m)
    return m
  }

  switch (type) {
    // v63：'duller' 已在函数开头交给 dullerMesh.buildDullerMesh（旧版方块模型移除）
    case 'faceling': { // 无面灵（Entity 9）：与人类高度相似——直接复用玩家形象模型（随机肤色/发型/服装），
      //                 唯独完全缺失面部特征：头部只剩一张没有五官的光滑平面。
      // v68：复古人物模型的无面版本（脸面只采样皮肤、鼻梁削平，眼镜/胡须不生成）
      const faceSeed = opts?.seed ?? Math.floor(Math.random() * 1e6)
      const avatarSeed = faceSeed + 101
      // v90（Entity 9 重制）：年龄档（幼年 / 成年 / 老年）+ 模仿的职业衣着；进化种（L3）长出胡须
      const evolved = !!opts?.l3face
      const age = opts?.facelingAge ?? facelingAge(faceSeed, evolved)
      const fr = mulberry(faceSeed * 7 + 3)
      const cfg = randomAvatar(mulberry(avatarSeed))
      const role = opts?.facelingRole
      if (role === 'office') { cfg.topStyle = 1; cfg.top = ['#d8d4c8', '#b9c4cf', '#e2ddd2'][Math.floor(fr() * 3)]; cfg.pantsStyle = 0; cfg.pants = '#2a2d33'; cfg.shoes = 0 }
      else if (role === 'shopkeeper') { cfg.topStyle = 0; cfg.top = ['#6a3a3a', '#2e4a5e', '#3a5a4a'][Math.floor(fr() * 3)]; cfg.pantsStyle = 0; cfg.shoes = 1 }
      if (age === 'child') { cfg.glasses = 0; if (cfg.topStyle === 7) cfg.topStyle = 0 }
      if (evolved && cfg.gender === 0 && age !== 'child') { const p = planFacelingFace(faceSeed); if (p.hairy > 0.45) cfg.beard = [3, 3, 2, 6, 5][Math.floor(fr() * 5)] }
      if (age === 'elder') { cfg.hairColor = ['#9a9a9e', '#c4c2bc', '#dedcd6'][Math.floor(fr() * 3)]; if (fr() < 0.3) cfg.hair = 3 }
      const pm = buildAvatarModel(cfg, { seed: avatarSeed, faceless: true, faceAnomaly: evolved ? faceSeed : undefined, badge: role === 'shopkeeper' ? '#d8c24a' : undefined,
        specPatch: (sp) => {
          if (age === 'child') {
            sp.height *= FACELING_AGE_HEIGHT.child; sp.head = [sp.head[0] * 1.24, sp.head[1] * 1.2, sp.head[2] * 1.22]
            sp.shoulder *= 0.86; sp.waist *= 0.94; sp.hip *= 0.9; sp.limb *= 0.94; sp.belly = 0; sp.beard = 0; sp.neckAdj = (sp.neckAdj ?? 0) - 0.03
          } else if (age === 'elder') {
            sp.height *= FACELING_AGE_HEIGHT.elder; sp.belly = (sp.belly ?? 0) + 0.015; sp.waist *= 1.04; sp.shoulder *= 0.97
          }
        } })
      grp.userData.facelingAge = age
      grp.userData.retroUpdate = pm.userData.retroUpdate
      const pmParts = pm.userData.parts as Record<string, THREE.Object3D>
      // 注册骨骼部件（步态/待机敲键动画沿用现有驱动）
      for (const k of ['torso', 'head', 'armL', 'armR', 'legL', 'legR']) tag(pmParts[k], k)
      if (opts?.l3face) grp.userData.facePlan = planFacelingFace(faceSeed)
      // v53：L3 部分无面灵使用石器工具（石锤握在右手）
      if (opts?.tool && pmParts.armR) {
        const tool = new THREE.Group()
        tool.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), lam('#6a4e30'))) // 木柄
        const stone = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.05), lam('#7a7a76')) // 石锤头
        stone.position.set(0, 0.13, 0)
        tool.add(stone)
        tool.position.set(0, -0.66, 0.06)
        tool.rotation.x = -0.5
        pmParts.armR.add(tool)
      }
      fitLegacyAttachments(pm) // 旧坐标系下挂的错位五官/石锤 → 新骨骼坐标
      grp.add(pm)
      break
    }
    // [ferren] Ferren（Entity 92）：已在函数开头交给 ferrenMesh.buildFerrenMesh（旧方块雪貂移除）
    // 鹉主杰瑞（Entity 7）：已在函数开头交给 jerryMesh.buildJerryMesh（旧方块小鹦鹉移除，见 JERRY-REMAKE.md）
    // v61：'smiler' 已在函数开头交给 smilerMesh.buildSmilerMesh（旧版方块模型移除）
    // 手臂（Entité 15-FR）：已在函数开头交给 armsMesh/armsAnim（旧方块长臂移除，见 ARMS-REMAKE.md）
    // v77：'skinstealer' 已在函数开头交给 skinStealerMesh.buildSkinStealerMesh（旧版方块模型移除）
    // v62：'hound' 已在函数开头交给 houndMesh.buildHoundMesh（旧版方块模型移除）
    case 'carrier': { // 运输车：机械厢体（底盘/货厢/驾驶室/风挡/保险杠/四轮/前后灯，原生 +X）
      // 修复 v15：v14 底盘（torso）从未挂入场景 → 车身悬浮于四轮之上、保险杠/车灯悬空。
      // 现把上部车体整合进 body 组并 tag 为 torso（冲撞时整体绕 z 微俯仰，轮组独立）。
      const body = new THREE.Group()
      body.add(box(1.7, 0.35, 0.95, '#4a4d45', 0, 0.42, 0)) // 底盘（连接车身与轮）
      body.add(box(1.05, 0.55, 0.85, '#3a3d38', -0.2, 0.85, 0)) // 货厢
      body.add(box(0.5, 0.5, 0.9, '#565a52', 0.55, 0.82, 0)) // 驾驶室
      body.add(box(0.03, 0.22, 0.7, '#10141a', 0.81, 0.88, 0)) // 风挡
      body.add(box(0.08, 0.14, 0.95, '#2e312c', 0.86, 0.32, 0)) // 保险杠
      body.add(box(0.04, 0.1, 0.3, '#6a7066', -0.2, 1.16, 0)) // 厢顶警示条
      const hlL = face(glow(0.14, 0.14, 0.05, '#ffeebb', 0.83, 0.48, -0.3)) // 车灯=眼睛（嵌在底盘前缘）
      const hlR = face(glow(0.14, 0.14, 0.05, '#ffeebb', 0.83, 0.48, 0.3))
      body.add(hlL, hlR)
      tag(hlL, 'hlL'); tag(hlR, 'hlR') // 已有 body 父级，tag 仅注册部件
      body.add(glow(0.08, 0.06, 0.03, '#c9302a', -0.86, 0.45, -0.3)) // 尾灯
      body.add(glow(0.08, 0.06, 0.03, '#c9302a', -0.86, 0.45, 0.3))
      tag(body, 'torso')
      const wheel = (x: number, z: number, part: string) => {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10), lam('#1c1e1c'))
        w.rotation.x = Math.PI / 2
        w.position.set(x, 0.22, z)
        tag(w, part); grp.add(w)
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.13, 8), lam('#4a4d45'))
        w.add(hub)
      }
      wheel(0.55, -0.48, 'wheelFL'); wheel(0.55, 0.48, 'wheelFR')
      wheel(-0.55, -0.48, 'wheelBL'); wheel(-0.55, 0.48, 'wheelBR')
      break
    }
    case 'pipeworm': { // 管道蠕虫：六节蠕躯 + 口器环 + 獠牙 + 背脊（原生 +X）
      for (let i = 0; i < 6; i++) {
        const seg = cyl(0.22 - i * 0.02, 0.24 - i * 0.02, 0.3, i % 2 ? '#7a4a2c' : '#8a5632', -i * 0.3, 0.35, 0, 7)
        seg.rotation.z = Math.PI / 2
        tag(seg, `seg${i}`)
        grp.add(seg) // 修复：v13 起身体节段漏挂入场景（历史缺失部件 bug）
        grp.add(box(0.08, 0.06, 0.06, '#4a2c1a', -i * 0.3, 0.56 - i * 0.01, 0)) // 背脊
      }
      const mouth = cyl(0.2, 0.24, 0.16, '#8a4a2e', 0.16, 0.35, 0, 8)
      mouth.rotation.z = Math.PI / 2
      tag(mouth, 'mouth'); grp.add(mouth)
      for (let i = 0; i < 4; i++) { // 环形獠牙
        const a = (i / 4) * Math.PI * 2
        const f = face(glow(0.03, 0.08, 0.03, '#e8d8b0', 0.26, 0.35 + Math.sin(a) * 0.14, Math.cos(a) * 0.14))
        grp.add(f)
      }
      const weye1 = face(glow(0.06, 0.06, 0.06, '#ff5533', 0.1, 0.5, -0.1))
      const weye2 = face(glow(0.06, 0.06, 0.06, '#ff5533', 0.1, 0.5, 0.1))
      grp.add(weye1, weye2)
      break
    }
    case 'arcwraith': { // 电弧体：等离子核 + 内芯 + 环绕电屑 + 电缆残躯（各向对称，原生 +X）
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: '#9adfff' }))
      core.position.y = 1.2
      tag(core, 'core'); grp.add(core)
      const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: '#eaf8ff' }))
      core.add(inner)
      grp.add(box(0.5, 0.5, 0.3, '#223038', 0, 0.7, 0)) // 电缆残躯
      grp.add(box(0.34, 0.4, 0.24, '#1a242c', 0, 0.3, 0))
      grp.add(box(0.2, 0.5, 0.14, '#151d24', 0, 0.55, 0.12))
      for (let i = 0; i < 4; i++) { // 环绕电屑（renderer 驱动公转）
        const s = glow(0.08, 0.02, 0.02, '#cfe8ff', 0, 1.2, 0)
        tag(s, `shard${i}`); grp.add(s)
      }
      const spark = face(glow(0.05, 0.05, 0.05, '#ffffff', 0.42, 1.28, 0)) // 前向电弧（定义正面）
      tag(spark, 'spark'); grp.add(spark)
      break
    }
    case 'copierwraith': { // 复印机幽灵：通体半透明蓝人形 + 漂浮复印纸
      const mat = new THREE.MeshLambertMaterial({ color: '#7fb0c9', transparent: true, opacity: 0.5 })
      humanoid(1.7, 0.88, '#7fb0c9', { mat })
      eyes(1.58, 0.08, '#cfe8ff', 0.05)
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.01),
        new THREE.MeshLambertMaterial({ color: '#eaf4ff', transparent: true, opacity: 0.7 }))
      sheet.position.set(-0.45, 1.0, 0.2)
      tag(sheet, 'sheet'); grp.add(sheet)
      break
    }
    case 'seated': { // 久坐者：瘫坐办公椅（坐姿腿 + 扶手 + 五星椅脚）
      // 修复 v15：v14 的 torso/head 从未挂入场景（只剩一把空椅 + 悬浮四肢）；
      // 小腿悬空离地 0.11 无脚；手臂下垂整根穿过扶手。
      grp.add(box(0.5, 0.07, 0.5, '#3a352e', 0, 0.44, 0)) // 椅面
      grp.add(box(0.5, 0.6, 0.07, '#3a352e', 0, 0.78, -0.19)) // 椅背（贴住躯干，不再留缝）
      grp.add(cyl(0.04, 0.04, 0.3, '#2a2620', 0, 0.26, 0, 6)) // 气压杆
      grp.add(box(0.6, 0.04, 0.08, '#2a2620', 0, 0.05, 0)) // 五星脚（十字）
      grp.add(box(0.08, 0.04, 0.6, '#2a2620', 0, 0.05, 0))
      tag(box(0.42, 0.5, 0.3, '#6e6a5c', 0, 0.74, 0), 'torso')
      tag(box(0.26, 0.28, 0.26, '#8f8a7c', 0, 1.1, 0.02), 'head')
      grp.add(box(0.11, 0.09, 0.32, '#5a5648', -0.12, 0.5, 0.18)) // 大腿（前伸）
      grp.add(box(0.11, 0.09, 0.32, '#5a5648', 0.12, 0.5, 0.18))
      grp.add(box(0.1, 0.44, 0.1, '#4e4a3e', -0.12, 0.23, 0.32)) // 小腿（及地）
      grp.add(box(0.1, 0.44, 0.1, '#4e4a3e', 0.12, 0.23, 0.32))
      grp.add(box(0.1, 0.05, 0.2, '#3e3a30', -0.12, 0.03, 0.37)) // 鞋（踩地）
      grp.add(box(0.1, 0.05, 0.2, '#3e3a30', 0.12, 0.03, 0.37))
      joint(0.09, 0.26, 0.1, '#6e6a5c', -0.28, 0.9, 0, 'armL') // 手臂缩短搭在扶手上（不再穿模）
      joint(0.09, 0.26, 0.1, '#6e6a5c', 0.28, 0.9, 0, 'armR')
      tip(parts.armL, 0.08, 0.05, 0.12, '#8f8a7c', -0.24) // 手掌搭扶手面
      tip(parts.armR, 0.08, 0.05, 0.12, '#8f8a7c', -0.24)
      grp.add(box(0.06, 0.05, 0.3, '#2a2620', -0.3, 0.62, 0.08)) // 扶手
      grp.add(box(0.06, 0.05, 0.3, '#2a2620', 0.3, 0.62, 0.08))
      eyes(1.12, 0.07, '#ffe9b0', 0.04, 0.16)
      break
    }
    case 'bellhop': { // 侍者：酒红制服 + 金扣/帽带 + 白手套 + 黄铜行李车
      humanoid(1.8, 0.95, '#7a2e2e', { head: '#c9a58a' })
      eyes(1.68, 0.08, '#ffd9a0', 0.045)
      for (let i = 0; i < 3; i++) grp.add(glow(0.035, 0.035, 0.02, '#b08d46', 0, 1.3 - i * 0.18, 0.135)) // 金扣
      grp.add(box(0.3, 0.1, 0.28, '#7a2e2e', 0, 1.76, 0)) // 帽
      grp.add(box(0.31, 0.035, 0.29, '#b08d46', 0, 1.72, 0)) // 帽带
      grp.add(box(0.36, 0.2, 0.02, '#5e2424', 0, 0.62, -0.14)) // 衣摆后片
      tip(parts.armL, 0.1, 0.1, 0.1, '#e8e2d2', -0.8) // 白手套
      tip(parts.armR, 0.1, 0.1, 0.1, '#e8e2d2', -0.8)
      const cart = new THREE.Group() // 黄铜行李车
      cart.add(box(0.5, 0.04, 0.6, '#b08d46', 0, 0.12, 0))
      cart.add(cyl(0.025, 0.025, 0.95, '#b08d46', 0, 0.6, -0.26, 6))
      cart.add(cyl(0.025, 0.025, 0.95, '#b08d46', 0, 0.6, 0.26, 6))
      const bar = cyl(0.02, 0.02, 0.55, '#b08d46', 0, 1.05, 0, 6); bar.rotation.x = Math.PI / 2; cart.add(bar)
      const cw1 = cyl(0.07, 0.07, 0.05, '#6a5a2e', 0, 0.07, -0.2, 8); cw1.rotation.x = Math.PI / 2; cart.add(cw1)
      const cw2 = cyl(0.07, 0.07, 0.05, '#6a5a2e', 0, 0.07, 0.2, 8); cw2.rotation.x = Math.PI / 2; cart.add(cw2)
      cart.position.set(0.55, 0, 0)
      tag(cart, 'cart'); grp.add(cart)
      break
    }
    case 'mirrorself': { // 镜中人：苍白「你」+ 胸前镜片 + 纯黑眼
      humanoid(1.75, 0.9, '#d8ccc0')
      eyes(1.63, 0.08, '#0c0507', 0.05)
      const shard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.02),
        new THREE.MeshLambertMaterial({ color: '#dfeaf2', emissive: 0xdfeaf2, emissiveIntensity: 0.35 }))
      shard.position.set(0, 1.15, 0.14)
      face(shard); grp.add(shard)
      grp.add(box(0.2, 0.3, 0.02, '#c8d4dc', 0.05, 1.1, -0.14)) // 背部碎镜
      break
    }
    // v64：'clump' 已在函数开头交给 clumpMesh.buildClumpMesh（旧版方块模型移除）

    // ==================== v23：Level 6–11 / Level 601 ====================
    case 'mimicry': { // 模仿者（Level 6）：黑暗中的类人剪影，深色、轮廓模糊、无面部细节，
      //                只有一张过大的嘴（用于复制人声）。低调、不发光。
      humanoid(1.82, 0.95, '#20242a', { limbs: '#1a1e24', head: '#242830' })
      const blur = new THREE.MeshLambertMaterial({ color: '#181c22', transparent: true, opacity: 0.34 })
      for (const [w, h, d, y] of [[0.58, 0.66, 0.42, 1.02], [0.46, 0.38, 0.38, 1.7], [0.52, 0.52, 0.38, 0.5]]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), blur) // 轮廓模糊：外层柔化壳
        m.position.set(0, y, 0)
        grp.add(m)
      }
      const maw = box(0.24, 0.12, 0.03, '#08090b', 0, 1.63, 0.125) // 过大的嘴（口腔深处）
      face(maw); grp.add(maw)
      const gum = ebox(0.22, 0.09, 0.02, '#3a2429', 0, 1.63, 0.118, 0.16) // 微亮的口腔内壁（不自发光）
      face(gum)
      grp.add(box(0.27, 0.022, 0.03, '#14171c', 0, 1.7, 0.135)) // 上唇
      grp.add(box(0.27, 0.022, 0.03, '#14171c', 0, 1.56, 0.135)) // 下唇
      break
    }
    case 'thething': { // Entity 20「七层之物」：近乎无尽的腐烂巨鳗（原生正面 +X）
      const tex = getThingSkinTextures()
      const skinMat = litMaterial({
        color: '#aaa99d', map: tex.color, bumpMap: tex.bump, bumpScale: 0.13,
        roughness: 0.72, metalness: 0.02, envBase: 0.1,
        emissive: '#151711', emissiveIntensity: 0.13, side: THREE.DoubleSide,
      })
      const darkSkinMat = litMaterial({
        color: '#77766d', map: tex.color, bumpMap: tex.bump, bumpScale: 0.16,
        roughness: 0.82, metalness: 0, envBase: 0.06,
        emissive: '#0c0d0a', emissiveIntensity: 0.12, side: THREE.DoubleSide,
      })
      const mouthMat = litMaterial({ color: '#0b0708', roughness: 0.92, metalness: 0, envBase: 0.01, emissive: '#050203', emissiveIntensity: 0.02, side: THREE.DoubleSide })
      const mouthDarkMat = litMaterial({ color: '#030203', roughness: 1, emissive: '#020102', emissiveIntensity: 0.01, side: THREE.DoubleSide })
      const gumMat = litMaterial({ color: '#351014', roughness: 0.78, emissive: '#080102', emissiveIntensity: 0.035 })
      const toothMat = litMaterial({ color: '#c8c0a3', roughness: 0.68, envBase: 0.12 })
      const gillMat = litMaterial({ color: '#6f1f27', roughness: 0.58, emissive: '#31060c', emissiveIntensity: 0.34 })
      const rotMat = litMaterial({ color: '#0d0e0c', roughness: 0.96, emissive: '#020302', emissiveIntensity: 0.08 })
      const scarMat = litMaterial({ color: '#85877b', roughness: 0.9 })
      const finMat = litMaterial({
        color: '#24271f', map: tex.color, bumpMap: tex.bump, bumpScale: 0.07,
        roughness: 0.8, side: THREE.DoubleSide, transparent: true, opacity: 0.92,
        emissive: '#0d0f0b', emissiveIntensity: 0.12,
      })
      const raggedFin = (length: number, height: number, seed: number, ventral = false) => {
        const sh = new THREE.Shape()
        sh.moveTo(-length * 0.54, 0)
        const teeth = 7
        for (let j = 0; j <= teeth; j++) {
          const u = j / teeth
          const rag = 0.66 + (((j * 17 + seed * 11) % 13) / 13) * 0.34
          const taper = Math.sin(Math.PI * u) * 0.38 + 0.62
          sh.lineTo(-length * 0.5 + u * length, height * rag * taper)
        }
        sh.lineTo(length * 0.54, 0); sh.closePath()
        const mesh = new THREE.Mesh(new THREE.ShapeGeometry(sh, 2), finMat)
        if (ventral) mesh.scale.y = -1
        return mesh
      }
      const pectoralGeo = (side: number) => {
        const pos = new Float32Array([
          -0.55, 0.12, 0, 0.45, -0.14, 0, -0.45, -0.42, side * 2.25,
          -0.55, 0.12, 0, -0.45, -0.42, side * 2.25, -0.9, -0.18, side * 1.15,
        ])
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.computeVertexNormals()
        return geo
      }
      // 相邻段共用的“近圆柱椭圆管”几何：端部仍保留 91% 截面，只在中部微鼓。
      // 与球体两端收成零半径不同，它们重叠后不会产生一节一节的肉丸轮廓。
      const eelSectionGeo = (length: number) => {
        const axial = 8, radial = 18
        const pos: number[] = [], uv: number[] = [], idx: number[] = []
        for (let xi = 0; xi <= axial; xi++) {
          const u = xi / axial
          const profile = 0.91 + Math.sin(u * Math.PI) * 0.09
          for (let ri = 0; ri <= radial; ri++) {
            const v = ri / radial, a = v * Math.PI * 2
            const organic = 1 + Math.sin(a * 3 + u * 2.4) * 0.018
            pos.push((u - 0.5) * length, Math.cos(a) * profile * organic, Math.sin(a) * profile * 0.66)
            uv.push(u * 1.45, v)
          }
        }
        const row = radial + 1
        for (let xi = 0; xi < axial; xi++) for (let ri = 0; ri < radial; ri++) {
          const a = xi * row + ri, b = a + row
          // 从外侧观察的逆时针绕序；旧实现顺序相反，开启背面剔除后会把外壁裁掉。
          idx.push(a, a + 1, b, b, a + 1, b + 1)
        }
        // 端盖绝大部分会藏在相邻段内，但封口可避免极端转弯时从缝隙看穿模型。
        const front = pos.length / 3
        pos.push(-length * 0.5, 0, 0); uv.push(0, 0.5)
        const back = pos.length / 3
        pos.push(length * 0.5, 0, 0); uv.push(1, 0.5)
        for (let ri = 0; ri < radial; ri++) {
          idx.push(front, ri + 1, ri)
          const a = axial * row + ri
          idx.push(back, a, a + 1)
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
        geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere()
        return geo
      }
      const irregularWoundRim = (rx: number, ry: number, seed: number) => {
        const steps = 18, pos: number[] = [], idx: number[] = []
        for (let i = 0; i < steps; i++) {
          const a = i / steps * Math.PI * 2
          const jag = 0.88 + ((Math.sin(i * 7.3 + seed) + Math.sin(i * 3.1 + seed * 2.7)) * 0.06)
          const inner = 0.56 + Math.sin(i * 5.7 + seed) * 0.035
          pos.push(Math.cos(a) * rx * jag, Math.sin(a) * ry * jag, 0)
          pos.push(Math.cos(a) * rx * inner, Math.sin(a) * ry * inner, 0.012)
        }
        for (let i = 0; i < steps; i++) {
          const n = (i + 1) % steps, o = i * 2, no = n * 2
          idx.push(o, no, o + 1, no, no + 1, o + 1)
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals()
        return geo
      }
      const makeTooth = (height: number, downward: boolean) => {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.065 + height * 0.025, height, 7), toothMat)
        if (downward) tooth.rotation.z = Math.PI
        return tooth
      }

      // ---- 头：近四米长的楔形颅骨，口腔不是贴片，而是上下颚间真实留空的深腔。 ----
      const hg = new THREE.Group()
      hg.position.set(0.62, 1.12, 0)
      const cranium = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), skinMat)
      cranium.scale.set(2.02, 0.86, 0.72); cranium.rotation.z = -0.045
      hg.add(cranium)
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), darkSkinMat)
      crown.scale.set(1.62, 0.46, 0.67); crown.position.set(-0.63, 0.31, 0); crown.rotation.z = -0.08
      hg.add(crown)
      const upperSnout = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), skinMat)
      upperSnout.scale.set(1.52, 0.4, 0.62); upperSnout.position.set(1.55, -0.3, 0); upperSnout.rotation.z = -0.065
      hg.add(upperSnout)
      // 开放口腔：上腭 + 深处黑喉。不能放跨越上下颚的静态“内颊面”——它会在张口时
      // 继续封住口裂，看上去就像一张红膜/红泡泡在扩大。
      const mouthVoid = new THREE.Group()
      const palate = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.72, 4, 1), mouthMat)
      palate.rotation.x = -Math.PI / 2; palate.position.set(1.12, -0.59, 0); hg.add(palate)
      const throatBack = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), mouthDarkMat)
      throatBack.scale.set(0.82, 1.1, 1); throatBack.rotation.y = Math.PI / 2; throatBack.position.set(-0.18, -0.78, 0); mouthVoid.add(throatBack)
      hg.add(mouthVoid); tag(mouthVoid, 'mouthVoid')
      const upperGum = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.032, 6, 28, Math.PI), gumMat)
      upperGum.scale.set(1.82, 0.62, 1); upperGum.rotation.set(Math.PI / 2, 0, -Math.PI / 2); upperGum.position.set(1.34, -0.55, 0)
      hg.add(upperGum)
      // 两排上颌牙，越靠吻尖越长且彼此参差，正面和侧面都能读到“血盆巨口”。
      const upperTeeth: THREE.Object3D[] = []
      for (const side of [-1, 1]) for (let i = 0; i < 12; i++) {
        const h = 0.22 + ((i * 7 + (side > 0 ? 3 : 0)) % 5) * 0.035
        const tooth = makeTooth(h, true)
        tooth.position.set(0.05 + i * 0.205, -0.65 - (i % 3) * 0.016, side * (0.3 + Math.sin(i / 11 * Math.PI) * 0.26))
        if (i > 8) tooth.rotation.x = side * 0.14
        if (i > 9) face(tooth)
        hg.add(tooth); upperTeeth.push(tooth)
      }
      // 上颚使用独立后铰链。把上吻、上腭、牙龈和全部上牙重挂到这个转轴；
      // renderer 会在扑咬时令它向上抬，与下颚相反方向运动。
      const upperJaw = new THREE.Group()
      upperJaw.position.set(-0.55, -0.24, 0)
      for (const piece of [upperSnout, palate, upperGum, ...upperTeeth]) {
        piece.position.sub(upperJaw.position)
        upperJaw.add(piece)
      }
      hg.add(upperJaw); tag(upperJaw, 'upperJaw')
      const jaw = new THREE.Group() // 后端为铰链；renderer 在攻击前摇中把它向下掀开约 70°。
      jaw.position.set(-0.52, -0.58, 0)
      const jawBone = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), darkSkinMat)
      jawBone.scale.set(1.78, 0.32, 0.67); jawBone.position.set(1.5, -0.12, 0)
      jaw.add(jawBone)
      const lowerMouth = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 0.72, 4, 1), mouthMat)
      lowerMouth.rotation.x = -Math.PI / 2; lowerMouth.position.set(1.48, 0.13, 0)
      jaw.add(lowerMouth)
      const tongue = new THREE.Mesh(
        new THREE.PlaneGeometry(1.25, 0.28, 4, 1),
        litMaterial({ color: '#290b0f', roughness: 0.72, emissive: '#060102', emissiveIntensity: 0.025, side: THREE.DoubleSide }),
      )
      tongue.rotation.x = -Math.PI / 2; tongue.position.set(1.42, 0.155, 0)
      jaw.add(tongue); tag(tongue, 'tongue')
      for (const side of [-1, 1]) for (let i = 0; i < 11; i++) {
        const h = 0.2 + ((i * 5 + (side > 0 ? 2 : 0)) % 4) * 0.04
        const tooth = makeTooth(h, false)
        tooth.position.set(0.2 + i * 0.215, 0.2 + (i % 2) * 0.012, side * (0.28 + Math.sin(i / 10 * Math.PI) * 0.25))
        if (i > 8) face(tooth)
        jaw.add(tooth)
      }
      hg.add(jaw); tag(jaw, 'jaw')
      const throat = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), darkSkinMat)
      throat.scale.set(0.8, 0.76, 0.73); throat.position.set(-0.82, -0.55, 0)
      hg.add(throat); tag(throat, 'throat')

      // 浑浊、深陷的小眼；额前与咽喉各留一点肮脏黄光，对应目击记录中的远处黄线。
      const eyeMats: THREE.MeshLambertMaterial[] = []
      for (const side of [-1, 1]) {
        const socket = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), rotMat)
        socket.scale.set(1.15, 0.9, 0.42); socket.position.set(0.54, 0.27, side * 0.8); hg.add(socket)
        const eyeMat = emat('#b5a85e', 0.45)
        eyeMats.push(eyeMat)
        const eye = face(new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 8), eyeMat))
        eye.scale.set(1.15, 0.78, 0.42); eye.position.set(0.59, 0.28, side * 0.875); hg.add(eye)
        const pupil = face(new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), rotMat))
        pupil.position.set(0.64, 0.28, side * 0.915); hg.add(pupil)
      }
      grp.userData.eyeMats = eyeMats
      const lureMat = emat('#c5ad58', 0.55, 0.8)
      const lure = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 7), lureMat)
      lure.position.set(1.9, -0.88, 0); hg.add(lure); tag(lure, 'lure')
      grp.userData.thingLureMat = lureMat

      // 颅骨两侧的主鳃盖与深红鳃裂。每道裂口都是弯曲管线，不再是并排的矩形梳齿。
      for (const side of [-1, 1]) {
        const cover = raggedFin(1.05, 0.55, side > 0 ? 7 : 13)
        cover.material = darkSkinMat; cover.position.set(-0.76, 0.02, side * 0.73); cover.rotation.y = side * 0.15
        hg.add(cover)
        for (let i = 0; i < 5; i++) {
          const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(-0.46 - i * 0.13, 0.3 - i * 0.05, side * 0.81),
            new THREE.Vector3(-0.64 - i * 0.13, -0.02, side * 0.88),
            new THREE.Vector3(-0.43 - i * 0.13, -0.34, side * 0.8),
          )
          hg.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 7, 0.035, 5, false), gillMat))
        }
      }
      // 立体瘢痕补充 UV 细节：几条隆起的封口伤在手电斜照下会留下阴影。
      for (const [x, y, z, rz] of [[-0.2, 0.55, 0.7, -0.3], [0.72, 0.62, -0.65, 0.22], [1.42, -0.08, 0.66, -0.15]] as const) {
        const scar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 5, 16, Math.PI * 1.35), scarMat)
        scar.scale.set(1.8, 0.55, 1); scar.position.set(x, y, z); scar.rotation.z = rz; hg.add(scar)
      }
      tag(hg, 'head')

      // ---- 躯干：18 个重叠椭球形成约 40m 的连续鳗躯；末端只轻微变细并消失在水雾中，
      //      玩家不会再一眼看到一截短尾巴，从视觉上保留“没有尽头”的尺度错觉。 ----
      const segmentCount = 18
      const spacing = 2.16
      const bodyGeo = eelSectionGeo(spacing * 1.52)
      grp.userData.thingSegmentCount = segmentCount
      grp.userData.thingSegmentSpacing = spacing
      const glitchMats: THREE.MeshBasicMaterial[] = []
      for (let i = 0; i < segmentCount; i++) {
        const seg = new THREE.Group()
        seg.position.set(0.35 - (i + 1) * spacing, 1.15, 0)
        const u = i / (segmentCount - 1)
        const rr = 1.34 - u * 0.38 // 保持异常粗壮；远端绝不收成一条“正常鱼尾”
        const body = new THREE.Mesh(bodyGeo, i % 4 === 3 ? darkSkinMat : skinMat)
        body.scale.set(1, rr, rr)
        body.userData.thingBaseScale = body.scale.clone()
        seg.add(body)

        // 连续、破损的背鳍与腹鳍膜；高度起伏使侧影更像巨型深海鳗而非一串球。
        const fins = new THREE.Group()
        const dorsal = raggedFin(spacing * 1.14, rr * (0.48 + (i % 5) * 0.025), i * 3 + 5)
        dorsal.position.y = rr * 0.86; fins.add(dorsal)
        if (i > 1) {
          const ventral = raggedFin(spacing * 1.08, rr * (0.27 + (i % 3) * 0.02), i * 7 + 2, true)
          ventral.position.y = -rr * 0.86; fins.add(ventral)
        }
        seg.add(fins); tag(fins, `fin${i}`)

        // 前六节每侧各两道鳃裂：加上头部主鳃盖，远看会形成“一排仍在呼吸的伤口”。
        if (i < 6) {
          const gills = new THREE.Group()
          for (const side of [-1, 1]) for (let gi = 0; gi < 2; gi++) {
            const curve = new THREE.QuadraticBezierCurve3(
              new THREE.Vector3(-0.5 + gi * 0.52, rr * 0.36, side * rr * 0.72),
              new THREE.Vector3(-0.62 + gi * 0.52, 0, side * rr * 0.79),
              new THREE.Vector3(-0.46 + gi * 0.52, -rr * 0.42, side * rr * 0.71),
            )
            gills.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 6, 0.045, 5, false), gillMat))
          }
          seg.add(gills); tag(gills, `gill${i}`)
        }

        // 成对巨胸鳍与零散副鳍，打破“只有一条背鳍”的人工轮廓。
        if (i === 0 || i === 2 || i === 5) for (const side of [-1, 1]) {
          const pf = new THREE.Mesh(pectoralGeo(side), finMat)
          pf.position.set(0.15, -rr * 0.12, side * rr * 0.69)
          seg.add(pf); tag(pf, `pect${side < 0 ? 'L' : 'R'}${i}`)
        }

        // 明确的开放性坏死创面：暗洞、红褐肉缘、下垂皮瓣，与 UV 中的细腐斑形成两个尺度层次。
        if ([3, 7, 11, 15].includes(i)) {
          const side = i % 2 ? 1 : -1
          const wound = new THREE.Group()
          wound.position.set(0.18, rr * (i % 3 ? 0.12 : -0.2), side * rr * 0.72)
          const hole = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), rotMat)
          hole.scale.set(0.48, 0.29, 0.07); wound.add(hole)
          const rim = new THREE.Mesh(irregularWoundRim(0.47, 0.25, i), gillMat)
          wound.add(rim)
          const flap = raggedFin(0.68, 0.32, i * 11, true)
          flap.material = darkSkinMat; flap.position.set(0.08, -0.23, 0.035); flap.rotation.z = -0.24; wound.add(flap)
          seg.add(wound)
        }
        if ([2, 6, 9, 13].includes(i)) {
          const side = i % 2 ? -1 : 1
          const scar = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.028, 5, 18, Math.PI * 1.45), scarMat)
          scar.scale.set(2.15, 0.58, 1); scar.position.set(-0.25, rr * 0.24, side * rr * 0.73); scar.rotation.z = (i % 3 - 1) * 0.28
          seg.add(scar)
        }

        // “故障”不再是青色积木：复制一层半透明躯体轮廓，配以薄薄的色差扫描切片。
        // renderer 只在不规则脉冲中显示并错移它们，同时让实体本身短暂被拉伸。
        if ([4, 10, 16].includes(i)) {
          const glitch = new THREE.Group(); glitch.visible = false
          for (const [color, off] of [['#74d6cf', -0.08], ['#b44b7e', 0.09]] as const) {
            const gm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, wireframe: true, fog: false })
            glitchMats.push(gm)
            const ghost = new THREE.Mesh(bodyGeo, gm)
            ghost.scale.copy(body.scale).multiplyScalar(1.025); ghost.position.z = off; glitch.add(ghost)
          }
          for (let s = 0; s < 3; s++) {
            const gm = new THREE.MeshBasicMaterial({ color: s % 2 ? '#a64070' : '#68d0c8', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false })
            glitchMats.push(gm)
            const slice = new THREE.Mesh(new THREE.PlaneGeometry(rr * 2.7, 0.035 + s * 0.018), gm)
            slice.position.set((s - 1) * 0.24, (s - 1) * rr * 0.35, rr * 0.77); glitch.add(slice)
          }
          seg.add(glitch); tag(glitch, `glitch${i}`)
        }
        tag(seg, `seg${i}`)
      }
      grp.userData.glitchMats = glitchMats
      break
    }
    case 'wrangler': { // 缠斗者：蛇形巨躯——10 节递减圆柱蜿蜒；前端是一颗类人的头，
      //                 白色发光的双眼，嘴部是一个令人不安的宽阔笑容。（原生 +X）
      // renderer 会把 seg0..5 的 y 钉在 0.35（分节蠕动），故整体挂在抬高 0.55 的 hold 内。
      const hold = new THREE.Group()
      hold.position.y = 0.55
      grp.add(hold)
      const sc1 = '#4a3c34', sc2 = '#3d3129'
      for (let i = 0; i < 10; i++) {
        const r = 0.44 - i * 0.032
        const s = cyl(r - 0.02, r, 0.46, i % 2 ? sc1 : sc2, -i * 0.42, 0.35, Math.sin(i * 0.8) * 0.42, 8)
        s.rotation.z = Math.PI / 2
        s.rotation.y = Math.cos(i * 0.8) * 0.5 // 顺着蜿蜒方向摆正
        hold.add(s)
        if (i < 6) tag(s, `seg${i}`) // 前 6 节复用 renderer 的分节蠕动
        hold.add(box(0.1, 0.09, 0.09, '#2e241e', -i * 0.42, 0.35 + r * 0.9, Math.sin(i * 0.8) * 0.42)) // 背脊角质
      }
      // 颈：包一层组再 tag——renderer 会改写 torso.rotation.z（追击昂身），
      // 直接 tag 躺倒的圆柱会被复位成竖立
      const neck = new THREE.Group()
      neck.position.set(0.3, 0.35, 0)
      const nc = cyl(0.4, 0.44, 0.42, sc1, 0, 0, 0, 8)
      nc.rotation.z = Math.PI / 2
      neck.add(nc)
      hold.add(neck); tag(neck, 'torso')
      const hg = new THREE.Group() // 类人的头
      hg.position.set(0.72, 0.42, 0)
      hg.add(box(0.42, 0.46, 0.42, '#5a4a40', 0, 0, 0))
      hg.add(box(0.3, 0.17, 0.36, '#4e4036', 0.2, -0.16, 0)) // 下颌
      hg.add(box(0.12, 0.1, 0.36, '#4e4036', 0.24, 0.16, 0)) // 眉弓
      for (const z of [-0.13, 0.13]) hg.add(face(glow(0.1, 0.08, 0.08, '#ffffff', 0.19, 0.08, z))) // 白色发光的双眼
      for (let i = 0; i < 11; i++) { // 宽阔的笑容：一排白色发光牙组成的长弧
        const a = (i / 10 - 0.5) * 1.55
        const t = face(glow(0.035, 0.075, 0.05, '#f2f2ea', 0.23 - Math.abs(a) * 0.03,
          -0.12 + (1 - Math.cos(a)) * 0.22, Math.sin(a) * 0.2))
        t.rotation.x = a * 0.4
        hg.add(t)
      }
      hold.add(hg); tag(hg, 'head')
      break
    }
    // [L8-camo] 'camocrawler' 已在函数开头交给 camoRender.buildCamoEntity（旧版方块模型与抓着的石头移除）
    // [L8-lightguide] 旧的「宝石星星」网格已移除：'lightguide' 在函数开头交给 lightguideRender.buildLightguideEntityMesh
    case 'curabitur': { // 受眷鸟（Entity 37）：退化悬浮鸟体 + 低密度荧光胶囊 + 黏性诱饵长舌（原生 +X）
      const feather = lam('#786552'), featherLight = lam('#9a846d')
      const body = sph(0.43, '#786552', 12, feather)
      body.scale.set(1.35, 0.9, 0.88); body.position.set(-0.08, 0.72, 0)
      tag(body, 'torso')
      // 蓬乱胸颈轮廓用数层羽簇打破球形；全部依附躯体，动画时一同轻微呼吸。
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2
        const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.24, 4), i % 2 ? feather : featherLight)
        tuft.position.set(-0.02, 0.61 + Math.sin(a) * 0.2, Math.cos(a) * 0.37)
        tuft.rotation.set(Math.PI / 2, 0, -0.2 + Math.sin(a) * 0.35)
        grp.add(tuft)
      }
      const head = sph(0.3, '#8b7660', 11, featherLight)
      head.scale.set(1.05, 0.9, 0.95); head.position.set(0.47, 0.71, 0)
      tag(head, 'head')
      // 两瓣黑色硬喙，尖端明确朝 +X；分缝保留图示的剪刀状轮廓。
      for (const z of [-0.075, 0.075]) {
        const beakGeo = new THREE.ConeGeometry(0.115, 0.48, 4)
        beakGeo.rotateZ(-Math.PI / 2)
        const beak = new THREE.Mesh(beakGeo, lam(z < 0 ? '#222429' : '#35383b'))
        beak.position.set(0.83, 0.62, z); beak.rotation.x = z < 0 ? -0.13 : 0.13
        grp.add(beak); face(beak)
      }
      for (const z of [-0.18, 0.18]) {
        const eye = sph(0.065, '#171618', 10, new THREE.MeshPhongMaterial({ color: '#1a1716', shininess: 95 }))
        eye.position.set(0.68, 0.82, z); grp.add(face(eye))
        const glint = sph(0.017, '#f4e5bd', 6, basic('#f4e5bd'))
        glint.position.set(0.73, 0.845, z + (z < 0 ? -0.047 : 0.047)); grp.add(glint)
      }
      // 退化翅：尺寸很小，只够改变悬浮方向。独立 pivot 供缓慢拍动。
      for (const [z, key] of [[-0.4, 'wingL'], [0.4, 'wingR']] as const) {
        const wing = new THREE.Group(); wing.position.set(-0.13, 0.82, z)
        const wg = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.62, 5), feather)
        wg.scale.set(0.8, 1, 0.3); wg.rotation.z = 1.2; wg.position.set(-0.22, 0, 0)
        wing.add(wg)
        for (let i = 0; i < 3; i++) wing.add(box(0.25 + i * 0.04, 0.035, 0.055, i % 2 ? '#6a5848' : '#8b7560', -0.17 - i * 0.08, -0.1 - i * 0.045, 0))
        grp.add(wing); tag(wing, key)
      }
      // 粉色短腿和分叉趾爪悬在腹下。
      for (const [z, key] of [[-0.17, 'legL'], [0.17, 'legR']] as const) {
        const leg = new THREE.Group(); leg.position.set(0.02, 0.48, z)
        leg.add(box(0.065, 0.36, 0.065, '#b87478', 0, -0.17, 0))
        for (let i = -1; i <= 1; i++) {
          const toe = box(0.28, 0.035, 0.035, i === 0 ? '#9f6269' : '#c78588', 0.12, -0.36, i * 0.065)
          toe.rotation.z = -0.15; leg.add(toe)
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.09, 5), lam('#3a3432'))
          claw.rotation.z = -Math.PI / 2; claw.position.set(0.3, -0.39, i * 0.065); leg.add(claw)
        }
        grp.add(leg); tag(leg, key)
      }
      // 背部发光胶囊：半透明外膜、内部柔光核心和浅黄胶团。自然生成按整座生态带限额，
      // 且不再给每个个体附加 PointLight，避免实体流式载入触发灯光着色器重编译。
      const sac = new THREE.Group(); sac.position.set(-0.17, 1.37, 0)
      const sacOuterMat = new THREE.MeshPhysicalMaterial({
        color: '#8fc765', emissive: '#6c9f3f', emissiveIntensity: 0.7,
        transparent: true, opacity: 0.55, roughness: 0.24, metalness: 0, depthWrite: false,
      })
      const outer = sph(0.66, '#8fc765', 14, sacOuterMat); outer.scale.set(1.1, 0.96, 0.94); sac.add(outer)
      const inner = sph(0.49, '#d7ee72', 12, emat('#cdea69', 1.15, 0.64)); inner.scale.set(1.05, 0.88, 0.9); sac.add(inner)
      const blobMat = emat('#f2dc78', 0.7, 0.82)
      const blobs: [number, number, number, number][] = [[0.28, 0.18, -0.38, .13], [-.22, .3, .37, .11], [.1, -.25, .42, .12], [-.35, -.14, -.29, .09], [.36, -.12, .18, .08]]
      for (const [x, y, z, r] of blobs) { const b = sph(r, '#f2dc78', 8, blobMat); b.position.set(x, y, z); sac.add(b) }
      grp.add(sac); tag(sac, 'gelSac')
      // 诱饵长舌从喙底垂下，末端暖色液滴会把死亡飞蛾引到捕食距离。
      const tongue = new THREE.Group(); tongue.position.set(0.75, 0.53, 0)
      for (let i = 0; i < 6; i++) {
        const rr = 0.025 - i * 0.0018
        const seg = cyl(rr, rr * 0.9, 0.23, '#b56d7c', -0.04 - i * 0.045, -0.11 - i * 0.2, Math.sin(i * 0.8) * 0.035, 6)
        seg.rotation.z = -0.22; tongue.add(seg)
      }
      const lure = new THREE.Mesh(new THREE.SphereGeometry(0.075, 9, 6), emat('#ffd45d', 1.8))
      lure.scale.set(0.75, 1.35, 0.75); lure.position.set(-0.28, -1.22, 0); tongue.add(lure); tag(lure, 'tongueTip')
      grp.add(tongue); tag(tongue, 'tongue')
      break
    }
    // Nguithr'xurh（Entity 16）：已在函数开头交给 nguithrMesh/nguithrAnim（旧 12 腿方块简模移除，见 NGUITHR-REMAKE.md）
    // [L8-arachnid] 'arachnid' 已在函数开头交给 arachnidRender.buildArachnidEntityMesh（旧版只换皮模型移除）
    // v79：'corpserat' 已在函数开头交给 ratMesh.buildRatMesh（旧版方块模型移除）
    // v78：'wretch' 已在函数开头交给 wretchMesh.buildWretchMesh（旧版方块模型移除）
    case 'watcher': { // 观察者（Entity 96）：巨型眼球（直径约 1.2m，白色巩膜 + 深色虹膜 + 黑瞳），
      //                表面伸出多条视神经/血管向后方辐射；静默悬浮。（原生 +X）
      const eyeGrp = new THREE.Group()
      eyeGrp.position.set(0, 1.8, 0)
      eyeGrp.add(sph(0.6, '#d8d2c4', 12))
      const rng = mulberry(0x9601)
      for (let i = 0; i < 8; i++) { // 巩膜血丝
        const a = (i / 8) * Math.PI * 2
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.012, 0.012), emat('#a8443a', 0.2))
        v.position.set(0.34, Math.sin(a) * 0.44, Math.cos(a) * 0.44)
        v.rotation.set(rng() * 3, rng() * 3, rng() * 3)
        eyeGrp.add(v)
      }
      tag(eyeGrp, 'torso')
      // 虹膜/瞳孔挂在以球心为原点的 head 组内：renderer 的待机张望使视线沿球面扫视
      const hg = new THREE.Group()
      const iris = sph(0.26, '#3a5560', 10)
      iris.scale.set(0.34, 1, 1)
      iris.position.set(0.52, 0, 0)
      face(iris); hg.add(iris)
      const pupil = sph(0.13, '#08080a', 8, basic('#08080a'))
      pupil.scale.set(0.4, 1, 1)
      pupil.position.set(0.575, 0, 0)
      face(pupil); hg.add(pupil)
      eyeGrp.add(hg); tag(hg, 'head')
      for (let i = 0; i < 11; i++) { // 视神经与血管：向后方辐射的扭曲管束
        const a = (i / 11) * Math.PI * 2
        const root = new THREE.Group()
        root.position.set(-0.3, Math.sin(a) * 0.42, Math.cos(a) * 0.42)
        root.rotation.z = -Math.PI / 2 + (rng() - 0.5) * 0.5
        root.rotation.y = (rng() - 0.5) * 0.6
        root.add(cyl(0.05, 0.075, 0.5, '#5e2430', 0, -0.25, 0, 6))
        const bend = new THREE.Group()
        bend.position.y = -0.5
        bend.rotation.x = (rng() - 0.5) * 1.3
        bend.rotation.z = (rng() - 0.5) * 1.0
        bend.add(cyl(0.026, 0.05, 0.46, '#4a1c26', 0, -0.23, 0, 6))
        root.add(bend)
        eyeGrp.add(root)
      }
      break
    }
    case 'strider': { // 阔步者（Entity 96）：中央一颗眼球（约 0.9m），下方六条约 2.4m 长的附肢——
      //                由脉络膜、视神经与血管构成（暗红紫分段柱，带一次膝关节弯折）。（原生 +X）
      const eyeGrp = new THREE.Group()
      eyeGrp.position.set(0, 2.5, 0)
      eyeGrp.add(sph(0.45, '#c8b9a4', 12))
      tag(eyeGrp, 'torso')
      const hg = new THREE.Group()
      const iris = sph(0.2, '#4a3a4e', 10)
      iris.scale.set(0.34, 1, 1)
      iris.position.set(0.39, 0, 0)
      face(iris); hg.add(iris)
      const pupil = sph(0.1, '#08080a', 8, basic('#08080a'))
      pupil.scale.set(0.4, 1, 1)
      pupil.position.set(0.43, 0, 0)
      face(pupil); hg.add(pupil)
      eyeGrp.add(hg); tag(hg, 'head')
      eyeGrp.add(sph(0.34, '#7a4a58', 8).translateY(-0.34)) // 附肢基座（血管盘结）
      // [part, x, z, splay]；splay 正值把附肢推向 +Z，故 -Z 侧取负值才是向外张开
      const legPos: [string, number, number, number][] = [
        ['legL', 0.4, -0.42, -0.5], ['legR', 0.4, 0.42, 0.5],
        ['t1', 0, -0.48, -0.62], ['t2', 0, 0.48, 0.62],
        ['armL', -0.4, -0.42, -0.5], ['armR', -0.4, 0.42, 0.5],
      ]
      for (const [part, x, z, splay] of legPos) {
        const up = jointX(0.11, 1.15, 0.11, '#5a2a44', x, 2.25, z, part, splay)
        const knee = new THREE.Group() // 膝关节：下段回摆到竖直，落点贴地
        knee.position.y = -1.15
        knee.rotation.z = -splay
        knee.add(box(0.085, 1.25, 0.085, '#47203a', 0, -0.62, 0))
        knee.add(box(0.1, 0.1, 0.1, '#6a2f4c', 0, -0.02, 0)) // 关节结
        knee.add(box(0.07, 0.09, 0.16, '#3a1a2e', 0, -1.25, 0.03)) // 足尖
        for (let k = 0; k < 3; k++) knee.add(box(0.09, 0.02, 0.09, '#8a3a52', 0, -0.3 - k * 0.35, 0)) // 血管环
        up.add(knee)
      }
      break
    }
    case 'mangled': { // 残破者（Entity 63）：房子大小的蜘蛛状轮廓，被浓密翻涌的烟雾遮蔽；
      //                烟雾之下的本体是无数人脸融合成的团块。（原生 +X）
      const rng = mulberry(0x6303)
      const core = new THREE.Group() // 人脸团块核心
      core.position.set(0, 2.0, 0)
      const skins = ['#b8a08a', '#a08872', '#c2ab94', '#8f7a66']
      const faceBlk = (dir: THREE.Vector3, idx: number, tagIt: boolean) => {
        const g2 = new THREE.Group()
        g2.position.copy(dir.clone().multiplyScalar(0.52))
        g2.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
        const s = 0.26 + rng() * 0.16
        g2.add(box(s, s * 1.2, s * 0.9, skins[idx % skins.length], 0, 0, 0))
        const eL = box(0.05, 0.04, 0.02, '#100c0a', -s * 0.22, s * 0.22, s * 0.46)
        const eR = box(0.05, 0.04, 0.02, '#100c0a', s * 0.22, s * 0.22, s * 0.46)
        const mo = box(s * 0.5, 0.03, 0.02, '#100c0a', 0, -s * 0.3, s * 0.46)
        g2.add(eL, eR, mo)
        if (tagIt) { face(eL); face(eR); face(mo) }
        core.add(g2)
      }
      for (let i = 0; i < 14; i++) { // 密集堆叠成球状的脸块
        const yv = 1 - (i + 0.5) / 7
        const rr = Math.sqrt(Math.max(0.04, 1 - yv * yv))
        const a = i * 2.39996
        faceBlk(new THREE.Vector3(Math.cos(a) * rr, yv, Math.sin(a) * rr).normalize(), i, false)
      }
      // 正面三张脸（左右对称，把面部质心稳稳压在 +X）
      faceBlk(new THREE.Vector3(1, 0.15, 0).normalize(), 0, true)
      faceBlk(new THREE.Vector3(0.86, -0.1, 0.3).normalize(), 1, true)
      faceBlk(new THREE.Vector3(0.86, -0.1, -0.3).normalize(), 2, true)
      core.add(sph(0.42, '#8f7a66', 8)) // 团块内核（脑状整体结构）
      tag(core, 'torso')
      // 八条细长蜘蛛腿（其中四条复用 renderer 的步态摆动）
      const legDef: [string | null, number, number, number][] = [ // [part, x, z, splay]
        ['legL', 0.5, -0.5, -1.15], ['legR', 0.5, 0.5, 1.15],
        ['armL', -0.5, -0.5, -1.15], ['armR', -0.5, 0.5, 1.15],
        [null, 0.9, -0.3, -1.3], [null, 0.9, 0.3, 1.3], [null, -0.9, -0.3, -1.3], [null, -0.9, 0.3, 1.3],
      ]
      for (const [part, x, z, splay] of legDef) {
        const holder = new THREE.Group()
        holder.position.set(x, 2.2, z)
        holder.rotation.y = -Math.PI / 2
        holder.rotation.z = splay
        grp.add(holder)
        const up = part ? jointOn(holder, 0.13, 1.5, 0.13, '#3a3038', part) : (() => {
          const geo = new THREE.BoxGeometry(0.13, 1.5, 0.13); geo.translate(0, -0.75, 0)
          const m = new THREE.Mesh(geo, lam('#3a3038')); holder.add(m); return m
        })()
        const knee = new THREE.Group()
        knee.position.y = -1.5
        knee.rotation.z = -splay
        knee.add(box(0.1, 1.6, 0.1, '#2e262c', 0, -0.8, 0))
        knee.add(box(0.16, 0.16, 0.16, '#4a4048', 0, -0.03, 0)) // 关节
        knee.add(box(0.08, 0.12, 0.24, '#241e22', 0, -1.6, 0.05)) // 足尖
        up.add(knee)
      }
      const smoke = new THREE.MeshLambertMaterial({ color: '#3d3a42', transparent: true, opacity: 0.42 })
      const smoke2 = new THREE.MeshLambertMaterial({ color: '#4a4048', transparent: true, opacity: 0.35 })
      for (let i = 0; i < 8; i++) { // 浓密翻涌的烟雾（前 4 团命名 shard0..3）
        const puff = new THREE.Mesh(new THREE.SphereGeometry(1.0 + rng() * 0.6, 8, 6), i % 2 ? smoke : smoke2)
        const a = (i / 8) * Math.PI * 2
        puff.position.set(Math.cos(a) * 1.1, 1.5 + rng() * 1.4, Math.sin(a) * 1.1)
        grp.add(puff)
        if (i < 4) tag(puff, `shard${i}`)
      }
      break
    }
    // 派对客（Entity 67）：已在函数开头交给 partygoerMesh.buildPartygoerMesh（旧方块模型移除，见 PARTYGOER-REMAKE.md）
    case 'soilworm': { // 土壤蠕虫：小型分节蠕虫（5 节递减 + 前端口器环），土褐色，体长约 0.5m。（原生 +X）
      // renderer 会把 seg 的 y 钉在 0.35 并叠加 ±0.12 蠕动——对 0.5m 小虫过大，
      // 故整体挂在 scale=0.3 的外层组内按 3.33 倍建模，缩放后落到 y≈0.105、幅度 ±0.036。
      const sw = new THREE.Group()
      sw.scale.setScalar(0.3)
      grp.add(sw)
      const c1 = '#8a6a52', c2 = '#6e523e'
      for (let i = 0; i < 5; i++) {
        const r = 0.26 - i * 0.035
        const s = cyl(r - 0.02, r, 0.34, i % 2 ? c1 : c2, -i * 0.33, 0.35, 0, 7)
        s.rotation.z = Math.PI / 2
        sw.add(s); tag(s, `seg${i}`)
        sw.add(box(0.05, 0.06, r * 2.1, '#5a4232', -i * 0.33 - 0.16, 0.35, 0)) // 环节褶
      }
      sw.add(box(0.07, 0.22, 0.22, '#3a281c', 0.2, 0.35, 0)) // 口腔
      for (let i = 0; i < 6; i++) { // 前端一圈小口器
        const a = (i / 6) * Math.PI * 2
        sw.add(face(box(0.07, 0.055, 0.055, '#d8c9a8', 0.23, 0.35 + Math.sin(a) * 0.16, Math.cos(a) * 0.16)))
      }
      break
    }
    default: humanoid(1.7, 0.9, c); eyes(1.6, 0.08, '#ffffff', 0.05)
  }
  // 统一正面到 +X：猎犬/运输车/管道蠕虫/电弧体/死亡飞蛾，以及 v23 的水生/蛇形/四足/眼球类
  // 原生面向 +X（或各向对称）；其余按 +Z 建造的模型包一层 rotation.y=π/2 内层组把正面旋到 +X。
  const facesX = type === 'hound' || type === 'duller' || type === 'carrier' || type === 'pipeworm' || type === 'arcwraith' || type === 'deathmoth'
    || type === 'tiny' || type === 'thething' || type === 'wrangler' || type === 'camocrawler' || type === 'lightguide' || type === 'curabitur'
    || type === 'corpserat' || type === 'watcher' || type === 'strider' || type === 'mangled' || type === 'soilworm'
    || type === 'nguithr' || type === 'dryshrimp' || type === 'arachnid'
  if (!facesX) {
    const inner = new THREE.Group()
    inner.rotation.y = Math.PI / 2
    for (const ch of [...grp.children]) inner.add(ch)
    grp.add(inner)
    grp.userData.facesZ = 1
  }
  return grp
}
