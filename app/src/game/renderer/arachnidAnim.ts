// L8 蛛形纲重制——阶段 2：动画库（只驱动 arachnidMesh 的刚性关节组 userData.arachnidRig，不含 AI）。
// 范式同 deathmothAnim：每个片段是 t（秒）→ 姿态的纯函数，可任意时刻采样、可两两混合（四元数 slerp）。
//
// 着地腿用解析两段 IK（基节偏航 + 腿节/胫跗平面两连杆，膝朝上）：片段只给「脚尖目标点」（模型空间），
// 步态里支撑相的脚尖以恒定速度后移，速度 = arachnidGaitSpeed()，游戏按这个速度移动实体即可脚底锁定、不打滑。
// 抬起/蜷缩/划水等不着地的腿用 FK（相对静止姿态的偏航/抬落/屈伸增量），两种模式可按权重混合。
//
// 通用片段：idle 待机 | walk 步行 | run 疾行（压低身体）| rear 威吓 | lunge 扑咬 | web_spin 吐丝 | flail 落水挣扎
//           death 死亡（翻倒、腿蜷到腹上）| hit 受击
// 专属：水蛛 swim / dive（替代 flail）；洞蝎 sting 尾刺、pinch 螯夹；鞭蝎 spray 喷酸、pinch；吸附蜱 latch 咬合、feed 吸血膨胀；
//       跳蛛 jump；长脚盲蛛 bob；再生蛛 regen；不死蛛 跛行 walk + revive；幼蛛潮 / 螨群 swarm_flow（InstancedMesh 群体流动）；
//       符文强化 6 种：所有片段都带符文 / 自发光呼吸（与 emissive 脉冲同步），威吓、扑咬时增强。
//
// API：
//   sampleArachnid(grp, clip, t, opts) → ArachnidPose     采样
//   applyArachnidPose(grp, pose)                           写回关节组、膨胀度、发光、群体
//   poseArachnidClip(grp, clip, t, opts)                   = 采样 + 写回
//   mixArachnidPose(a, b, w)                               混合（四元数 slerp、位移 / 缩放 / 标量 lerp）
//   updateArachnidSwarm(grp, center, heading, t, opts)     幼蛛潮 / 螨群的群体流动（以群中心与朝向为参数）
//   ARACHNID_CLIPS[variant] / ARACHNID_CLIP_GROUPS          片段表（时长、是否循环、事件时刻）
//   ARACHNID_EVENTS / ARACHNID_LUNGE_HIT 等                 命中时刻常量；ARACHNID_ROOT_MOTION 根位移
import * as THREE from 'three'
import type { ArachnidRig, ArachnidVariant, ArachnidLegGeo } from './arachnidMesh'

type V3 = THREE.Vector3
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const TAU = Math.PI * 2
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
const smooth = (a: number, b: number, t: number) => { const k = clamp01((t - a) / (b - a)); return k * k * (3 - 2 * k) }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const fract = (x: number) => x - Math.floor(x)
/** 关键帧插值（相邻关键帧之间 smoothstep） */
function kf(t: number, keys: [number, number][]) {
  if (t <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [t0, v0] = keys[i - 1], [t1, v1] = keys[i]; return lerp(v0, v1, smooth(t0, t1, t)) }
  return keys[keys.length - 1][1]
}
/** 确定性噪声（-1..1），用于抽搐、个体差异 */
const hash = (n: number) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453) * 2 - 1
const noise1 = (x: number, s: number) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i + s * 57), hash(i + 1 + s * 57), u) }

// ======================================================================
// 片段表
// ======================================================================
export type ArachnidClip =
  | 'idle' | 'walk' | 'run' | 'rear' | 'lunge' | 'web_spin' | 'flail' | 'death' | 'hit'
  | 'swim' | 'dive' | 'sting' | 'pinch' | 'spray' | 'latch' | 'feed' | 'jump' | 'bob' | 'regen' | 'revive' | 'swarm_flow'
export interface ArachnidClipInfo { len: number; loop: boolean; desc: string; hit?: number }
export type ArachnidClipGroup = 'spider' | 'runic' | 'jumper' | 'harvestman' | 'diving' | 'regen' | 'undying' | 'scorpion' | 'whip' | 'tick' | 'swarm'

/** 扑咬命中时刻（s，从片段开始计） */
export const ARACHNID_LUNGE_HIT = 0.4
/** 洞蝎尾刺命中时刻 */
export const ARACHNID_STING_HIT = 0.42
/** 蝎螯夹合时刻 */
export const ARACHNID_PINCH_HIT = 0.3
/** 吸附蜱口器刺入时刻 */
export const ARACHNID_LATCH_HIT = 0.45
/** 跳蛛：起跳 / 落地时刻 */
export const ARACHNID_JUMP_TAKEOFF = 0.38, ARACHNID_JUMP_LAND = 0.78
/** 鞭蝎喷酸：三次喷雾脉冲的起始时刻 */
export const ARACHNID_SPRAY_PUFFS = [0.5, 0.72, 0.94] as const
/** 各片段的事件时刻（AI 结算伤害 / 特效用） */
export const ARACHNID_EVENTS = {
  lunge: { hit: ARACHNID_LUNGE_HIT }, sting: { hit: ARACHNID_STING_HIT }, pinch: { hit: ARACHNID_PINCH_HIT },
  latch: { hit: ARACHNID_LATCH_HIT }, jump: { takeoff: ARACHNID_JUMP_TAKEOFF, land: ARACHNID_JUMP_LAND }, spray: { puffs: ARACHNID_SPRAY_PUFFS },
} as const
/** 再生蛛新肢长好后的缩放（相对建模时的苍白短肢） */
export const ARACHNID_REGROWN = 1.8
/** 带根位移的片段：片段结束时根节点相对实体原点的位移（m，沿模型 +X）；游戏在片段结束时把实体前移这么多并切回 idle */
export const ARACHNID_ROOT_MOTION: Partial<Record<ArachnidClip, { dx: number; at: number }>> = { jump: { dx: 0.9, at: ARACHNID_JUMP_LAND } }

const C = (len: number, loop: boolean, desc: string, hit?: number): ArachnidClipInfo => ({ len, loop, desc, hit })
const BASE_SPIDER: Partial<Record<ArachnidClip, ArachnidClipInfo>> = {
  idle: C(4, true, '待机：触肢螯肢微动，偶尔挪一条腿'), walk: C(1, true, '步行：交替四足步态，脚底锁定'), run: C(0.5, true, '疾行：压低身体的快速步态'),
  rear: C(1.6, false, '威吓：前两对腿抬起张开、螯牙张开，后腿着地'), lunge: C(1.0, false, '扑咬（命中 0.40s）', ARACHNID_LUNGE_HIT),
  web_spin: C(2.4, true, '吐丝：腹部摆动，第四对腿交替拉丝'), flail: C(1.2, true, '落水挣扎：甩腿'), death: C(1.8, false, '死亡：抽搐、翻倒，腿蜷到腹上'), hit: C(0.5, false, '受击'),
}
const pick = (o: Partial<Record<ArachnidClip, ArachnidClipInfo>>, drop: ArachnidClip[] = []) => Object.fromEntries(Object.entries(o).filter(([k]) => !drop.includes(k as ArachnidClip))) as Partial<Record<ArachnidClip, ArachnidClipInfo>>
export const ARACHNID_CLIP_GROUPS: Record<ArachnidClipGroup, { variants: ArachnidVariant[]; clips: Partial<Record<ArachnidClip, ArachnidClipInfo>> }> = {
  spider: { variants: ['wolf', 'weaver', 'blindcave'], clips: BASE_SPIDER },
  runic: { variants: ['colossus', 'widow', 'fireproof', 'anoxic'], clips: { ...BASE_SPIDER } },
  jumper: { variants: ['jumper'], clips: { ...BASE_SPIDER, jump: C(1.2, false, '跳跃：蓄力下蹲后弧线弹跳（根位移 0.9m）') } },
  harvestman: { variants: ['harvestman'], clips: { ...pick(BASE_SPIDER, ['lunge', 'web_spin']), lunge: C(1.0, false, '扑咬', ARACHNID_LUNGE_HIT), bob: C(0.8, true, '弹动：身体在长腿上快速上下弹') } },
  diving: { variants: ['diving'], clips: { ...pick(BASE_SPIDER, ['flail']), swim: C(0.9, true, '游泳：腿交替划水'), dive: C(0.6, true, '下潜：头朝下快速划水') } },
  regen: { variants: ['regen'], clips: { ...BASE_SPIDER, regen: C(1.8, false, '再生：新肢 1.5s 内由短变长') } },
  undying: { variants: ['undying'], clips: { ...BASE_SPIDER, walk: C(1.3, true, '跛行：缺两条腿的不稳步态'), revive: C(2.8, false, '复苏：死后抽搐、翻身、颤巍巍站起') } },
  scorpion: {
    variants: ['cavescorpion'],
    clips: { ...pick(BASE_SPIDER, ['web_spin', 'lunge']), rear: C(1.4, false, '威吓：举螯张开、尾高举'), sting: C(0.9, false, '尾刺：尾节依次弯曲后前刺', ARACHNID_STING_HIT), pinch: C(0.7, false, '螯夹', ARACHNID_PINCH_HIT) },
  },
  whip: {
    variants: ['whipscorpion'],
    clips: { ...pick(BASE_SPIDER, ['web_spin', 'lunge']), rear: C(1.4, false, '威吓：举刺螯、扬尾须'), spray: C(1.4, false, '喷酸：尾须抬起，尾基三次喷雾'), pinch: C(0.7, false, '螯夹', ARACHNID_PINCH_HIT) },
  },
  tick: {
    variants: ['tick'],
    clips: { idle: C(4, true, '待机'), walk: C(0.8, true, '步行'), latch: C(0.8, false, '咬合：口器前戳刺入', ARACHNID_LATCH_HIT), feed: C(6, false, '吸血：膨胀 0→1，心跳搏动'), flail: BASE_SPIDER.flail!, death: BASE_SPIDER.death!, hit: BASE_SPIDER.hit! },
  },
  swarm: { variants: ['broodswarm', 'mitecloud'], clips: { swarm_flow: C(2, true, '群体流动：整体朝一个方向涌动、个体抖动') } },
}
// ======================================================================
// 步态参数（按变种）：cycle 周期 s、strideK 步幅 / 平均腿长、duty 支撑相占比、liftK 抬脚高 / 腿长、bob 身体起伏 / 腿长
// ======================================================================
interface Gait { cycle: number; strideK: number; duty: number; liftK: number; bobK: number; sway: number }
const GAIT: Partial<Record<ArachnidVariant, Gait>> & { default: Gait } = {
  default: { cycle: 0.85, strideK: 0.26, duty: 0.6, liftK: 0.12, bobK: 0.012, sway: 0.03 },
  wolf: { cycle: 0.8, strideK: 0.3, duty: 0.6, liftK: 0.13, bobK: 0.014, sway: 0.03 },
  weaver: { cycle: 1.0, strideK: 0.2, duty: 0.62, liftK: 0.12, bobK: 0.01, sway: 0.025 },
  jumper: { cycle: 0.45, strideK: 0.3, duty: 0.58, liftK: 0.16, bobK: 0.02, sway: 0.03 },
  blindcave: { cycle: 1.1, strideK: 0.18, duty: 0.64, liftK: 0.12, bobK: 0.008, sway: 0.02 },
  harvestman: { cycle: 1.1, strideK: 0.22, duty: 0.6, liftK: 0.14, bobK: 0.022, sway: 0.04 },
  diving: { cycle: 0.8, strideK: 0.28, duty: 0.6, liftK: 0.13, bobK: 0.012, sway: 0.03 },
  colossus: { cycle: 1.7, strideK: 0.22, duty: 0.62, liftK: 0.09, bobK: 0.012, sway: 0.035 },
  widow: { cycle: 0.95, strideK: 0.22, duty: 0.62, liftK: 0.12, bobK: 0.01, sway: 0.025 },
  regen: { cycle: 0.85, strideK: 0.26, duty: 0.6, liftK: 0.12, bobK: 0.012, sway: 0.03 },
  undying: { cycle: 1.3, strideK: 0.2, duty: 0.62, liftK: 0.09, bobK: 0.02, sway: 0.08 },
  fireproof: { cycle: 0.85, strideK: 0.28, duty: 0.6, liftK: 0.12, bobK: 0.012, sway: 0.03 },
  anoxic: { cycle: 0.9, strideK: 0.26, duty: 0.6, liftK: 0.12, bobK: 0.01, sway: 0.025 },
  cavescorpion: { cycle: 0.7, strideK: 0.3, duty: 0.6, liftK: 0.16, bobK: 0.01, sway: 0.03 },
  whipscorpion: { cycle: 0.8, strideK: 0.28, duty: 0.6, liftK: 0.16, bobK: 0.01, sway: 0.03 },
  tick: { cycle: 0.8, strideK: 0.24, duty: 0.62, liftK: 0.16, bobK: 0.01, sway: 0.03 },
}
const gaitOf = (v: ArachnidVariant) => GAIT[v] ?? GAIT.default

const RUNIC = new Set<ArachnidVariant>(['colossus', 'widow', 'regen', 'undying', 'fireproof', 'anoxic'])
export function arachnidClipGroup(v: ArachnidVariant): ArachnidClipGroup | null {
  for (const [g, d] of Object.entries(ARACHNID_CLIP_GROUPS)) if (d.variants.includes(v)) return g as ArachnidClipGroup
  return null
}
/** 每个变种可用的片段（runenest 无） */
export const ARACHNID_CLIPS = Object.fromEntries(
  (['wolf', 'weaver', 'jumper', 'blindcave', 'broodswarm', 'harvestman', 'diving', 'colossus', 'widow', 'regen', 'undying', 'fireproof', 'anoxic', 'cavescorpion', 'whipscorpion', 'tick', 'mitecloud'] as ArachnidVariant[])
    .map((v) => {
      // 步行 / 疾行的一个周期随变种不同（标准速度下）
      const cl = { ...ARACHNID_CLIP_GROUPS[arachnidClipGroup(v)!].clips }
      const g = gaitOf(v)
      if (cl.walk) cl.walk = { ...cl.walk, len: g.cycle }
      if (cl.run) cl.run = { ...cl.run, len: +(g.cycle * 0.58).toFixed(3) }
      return [v, cl]
    }),
) as Record<Exclude<ArachnidVariant, 'runenest'>, Partial<Record<ArachnidClip, ArachnidClipInfo>>>


// ======================================================================
// 装配缓存：节点表、每条腿的 IK 参数、身体尺寸
// ======================================================================
interface LegC {
  j: THREE.Group[]; side: number; idx: number; ik: boolean; stump: boolean; feeler: boolean; regrow: boolean
  at: V3; yaw0: number; a: number; th: number; b: number; beta0: number; foot0: V3; F: V3
}
interface RigC {
  rig: ArachnidRig; nodes: THREE.Object3D[]; idx: Map<THREE.Object3D, number>; legs: LegC[]
  L: number; hy: number; clear: number; top: number; bot: number; halfW: number; len: number
  cephM: THREE.Matrix4
}
const CACHE = new WeakMap<ArachnidRig, RigC>()
const restOf = (o: THREE.Object3D) => ({ r: (o.userData.r0 as THREE.Euler | undefined) ?? new THREE.Euler(), p: (o.userData.p0 as V3 | undefined) ?? V() })
function rigOf(grp: THREE.Object3D): ArachnidRig {
  const r = grp.userData.arachnidRig as ArachnidRig | undefined
  if (!r || !r.root) throw Error('not an arachnid mesh')
  return r
}
function cacheOf(rig: ArachnidRig): RigC {
  let c = CACHE.get(rig)
  if (c) return c
  const set = new Set<THREE.Object3D>()
  const add = (o?: THREE.Object3D) => { if (o) set.add(o) }
  add(rig.root); add(rig.body.ceph); add(rig.body.abdomen)
  rig.legs.forEach((j) => j.forEach(add)); rig.chelicerae.forEach(add); rig.pedipalps.forEach(add)
  rig.claws.forEach((k) => { add(k.arm); add(k.finger) }); rig.tail.forEach(add); add(rig.mouth)
  const nodes = [...set], idx = new Map(nodes.map((n, i) => [n, i] as const))
  // 恢复静止姿态再量尺寸
  for (const n of nodes) { const r = restOf(n); n.rotation.copy(r.r); n.position.copy(r.p); n.scale.setScalar(1) }
  const rootP = restOf(rig.root).p, cephR = restOf(rig.body.ceph)
  const cephM = new THREE.Matrix4().compose(cephR.p, new THREE.Quaternion().setFromEuler(cephR.r), V(1, 1, 1))
  const legs: LegC[] = rig.legs.map((j, n) => {
    const info = rig.legInfo[n], geo = j[0].userData.leg as ArachnidLegGeo
    const r0 = restOf(j[0])
    const K = geo.K, F = geo.F
    const foot = K.clone().add(F).applyAxisAngle(V(0, 1, 0), r0.r.y).add(r0.p).applyMatrix4(cephM).add(rootP)
    return {
      j, side: info.side, idx: info.idx, stump: geo.stump, feeler: !!info.feeler, regrow: !!info.regrow,
      ik: !geo.stump && !info.feeler && !info.regrow && !info.missing,
      at: r0.p.clone(), yaw0: r0.r.y, a: K.length(), th: Math.atan2(K.y, K.x), b: F.length(), beta0: Math.atan2(F.y, F.x), foot0: foot, F: F.clone(),
    }
  })
  const ik = legs.filter((l) => l.ik)
  const L = ik.reduce((s, l) => s + l.a + l.b, 0) / Math.max(1, ik.length)
  // 身体（头胸 + 腹部，不含腿 / 尾 / 螯）在根坐标系下的包围盒
  rig.root.updateMatrixWorld(true)
  const inv = rig.root.matrixWorld.clone().invert(), box = new THREE.Box3(), bb = new THREE.Box3()
  const legSet = new Set<THREE.Object3D>([...rig.legs.flat(), ...rig.tail, ...rig.chelicerae, ...rig.pedipalps])
  const bodyMesh = (o: THREE.Object3D, under: THREE.Object3D) => {
    for (const ch of o.children) {
      if (legSet.has(ch)) continue
      const m = ch as THREE.Mesh
      if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && !m.userData.rune) {
        m.geometry.computeBoundingBox(); bb.copy(m.geometry.boundingBox!).applyMatrix4(inv.clone().multiply(m.matrixWorld)); box.union(bb)
      } else if ((ch as THREE.Group).isGroup && ch !== under) bodyMesh(ch, under)
    }
  }
  bodyMesh(rig.body.ceph, rig.body.abdomen); bodyMesh(rig.body.abdomen, rig.body.abdomen)
  if (box.isEmpty()) box.set(V(-0.05, -0.02, -0.04), V(0.05, 0.03, 0.04))
  c = {
    rig, nodes, idx, legs, L, hy: rootP.y, clear: rootP.y + box.min.y, top: box.max.y, bot: box.min.y,
    halfW: Math.max(-box.min.z, box.max.z), len: box.max.x - box.min.x, cephM,
  }
  CACHE.set(rig, c)
  return c
}

// ======================================================================
// 姿态
// ======================================================================
export interface ArachnidPose {
  variant: ArachnidVariant; clip: ArachnidClip; t: number
  /** 每个节点（按 rig 节点表顺序）的局部旋转 / 位置 / 统一缩放（绝对值，不是增量） */
  q: THREE.Quaternion[]; p: V3[]; s: number[]
  /** 吸附蜱膨胀度（undefined = 不改） */
  engorge?: number
  /** 符文 / 自发光强度倍数（1 = 建模时的强度） */
  glow: number
  /** 群体：采样时间与流速（applyArachnidPose 用群中心 = 原点、朝向 +X 更新） */
  swarm?: { t: number; speed: number }
  /** 幼蛛潮附带的母蛛姿态 */
  mother?: ArachnidPose
  /** 诊断：每条腿是否着地（支撑相）、IK 未达误差（m） */
  diag: { planted: boolean[]; ikErr: number[] }
}
export interface ArachnidAnimOpts {
  /** 步行 / 疾行的地面速度（m/s）。不给则用该变种的标准速度（arachnidGaitSpeed）；给了则按速度调步幅与步频 */
  speed?: number
  /** 个体相位偏移 s（同群个体不同步） */
  phase?: number
  /** 个体随机种子（待机挪腿、抽搐的个体差异） */
  seed?: number
  /** 再生蛛：新肢当前缩放（默认 1 = 刚长出的短肢；regen 片段播完后传 ARACHNID_REGROWN） */
  regrow?: number
}

/** 一条腿的指令：着地目标（模型空间）或 FK 增量，w = FK 权重 */
interface LegCmd { tgt: V3 | null; fwd: number; fz: number; tz: number; abs: boolean; w: number; planted: boolean; scale: number }
/** 片段函数写入的状态 */
class Rig {
  c: RigC
  body = { x: 0, y: 0, z: 0, roll: 0, yaw: 0, pitch: 0 }
  abd = { x: 0, y: 0, z: 0, s: 1 }
  legs: LegCmd[]
  chel = [{ open: 0, spread: 0 }, { open: 0, spread: 0 }]
  palp = [{ raise: 0, spread: 0, swing: 0 }, { raise: 0, spread: 0, swing: 0 }]
  claw = [{ raise: 0, yaw: 0, open: 0 }, { raise: 0, yaw: 0, open: 0 }]
  tail = [0, 0, 0]; tailY = [0, 0, 0]
  mouth = 0; mouthTilt = 0
  engorge: number | undefined = undefined
  glow = 1
  private _rootM: THREE.Matrix4 | null = null
  constructor(c: RigC) { this.c = c; this.legs = c.legs.map(() => ({ tgt: null, fwd: 0, fz: 0, tz: 0, abs: false, w: 0, planted: false, scale: 1 })) }
  /** 以根节点前方 px 处为支点俯仰（正 = 抬头），并补偿根位移 */
  pitchAbout(px: number, ang: number) {
    this.body.pitch += ang
    this.body.x += -px * Math.cos(ang) + px; this.body.y += -px * Math.sin(ang)
  }
  rootQ() { return new THREE.Quaternion().setFromEuler(new THREE.Euler(this.body.roll, this.body.yaw, this.body.pitch, 'YZX')) }
  rootP() { return this.c.rig.root.userData.p0.clone().add(V(this.body.x, this.body.y, this.body.z)) }
  rootM() { if (!this._rootM) this._rootM = new THREE.Matrix4().compose(this.rootP(), this.rootQ(), V(1, 1, 1)); return this._rootM }
  /** 身体改了之后要清掉缓存 */
  dirty() { this._rootM = null }
  /** 静止脚位随当前身体变换后的位置（腿跟着身体走，用于空中） */
  bodyFoot(n: number) { const r0 = new THREE.Matrix4().compose(this.c.rig.root.userData.p0, new THREE.Quaternion(), V(1, 1, 1)).invert(); return this.c.legs[n].foot0.clone().applyMatrix4(r0).applyMatrix4(this.rootM()) }
  plant(n: number, dx = 0, dy = 0, dz = 0) { const l = this.legs[n]; l.tgt = this.c.legs[n].foot0.clone().add(V(dx, dy, dz)); l.planted = dy <= 1e-5 }
  fk(n: number, fwd: number, fz: number, tz: number, w = 1, abs = false) { const l = this.legs[n]; l.fwd = fwd; l.fz = fz; l.tz = tz; l.w = w; l.abs = abs; if (w > 0.5) l.planted = false }
}

// ---------------------------------------------------------------------------
// 通用小动作
// ---------------------------------------------------------------------------
function lifeNoise(R: Rig, t: number, k = 1, seed = 0) {
  // 触肢交替轻点、螯肢微张（周期取 4s 的约数，待机片段可无缝循环）
  for (const s of [0, 1]) {
    R.palp[s].raise += k * (0.12 + 0.12 * Math.sin(TAU * (t / 2 + s * 0.5 + seed * 0.13)))
    R.palp[s].swing += k * 0.08 * Math.sin(TAU * (t / 1 + s * 0.3))
    R.chel[s].open += k * 0.06 * Math.max(0, Math.sin(TAU * (t / 4 + s * 0.15)))
  }
}
/** 交替四足步态：L1 R2 L3 R4 一组、R1 L2 R3 L4 一组；同侧相邻腿反相。返回身体前进速度 v */
function gait(R: Rig, t: number, stride: number, cycle: number, duty: number, lift: number, o: { lean?: number; sway?: number; bob?: number; dutyByGroup?: [number, number] } = {}) {
  const c = R.c
  const ph = t / cycle
  for (let n = 0; n < c.legs.length; n++) {
    const L = c.legs[n]
    if (!L.ik) continue
    const grp = (L.idx + (L.side > 0 ? 0 : 1)) % 2
    const d = o.dutyByGroup ? o.dutyByGroup[grp] : duty
    // 支撑相速度对所有腿相同（脚底锁定），所以每组步幅 = v · duty_g · cycle
    const v = stride / (duty * cycle), st = v * d * cycle
    const lp = fract(ph + grp * 0.5 + L.idx * 0.035)
    let dx: number, dy = 0
    if (lp < d) dx = (0.5 - lp / d) * st
    else { const k = (lp - d) / (1 - d), u = smooth(0, 1, k); dx = (-0.5 + u) * st; dy = Math.sin(k * Math.PI) * lift * (L.idx === 3 ? 0.85 : 1) }
    R.plant(n, dx, dy, 0)
  }
  const bob = o.bob ?? 0
  R.body.y += -bob * (0.5 + 0.5 * Math.cos(ph * TAU * 2))
  R.body.roll += (o.sway ?? 0) * Math.sin(ph * TAU)
  R.body.yaw += (o.sway ?? 0) * 0.6 * Math.sin(ph * TAU + 0.8)
  R.body.pitch += o.lean ?? 0
  return stride / (duty * cycle)
}
/** 该变种步行 / 疾行的地面速度（m/s）：游戏按此速度移动实体，脚底即锁定 */
export function arachnidGaitSpeed(grp: THREE.Object3D, clip: 'walk' | 'run' = 'walk') {
  const rig = rigOf(grp), c = cacheOf(rig), g = gaitOf(rig.variant)
  const p = gaitParams(c, g, clip, undefined)
  return p.stride / (p.duty * p.cycle)
}
function gaitParams(c: RigC, g: Gait, clip: 'walk' | 'run', speed: number | undefined) {
  let cycle = g.cycle, stride = g.strideK * c.L, duty = g.duty, lift = g.liftK * c.L
  if (clip === 'run') { cycle *= 0.58; stride *= 1.35; duty = 0.5; lift *= 0.85 }
  if (speed !== undefined && speed > 1e-4) {
    const v0 = stride / (duty * cycle), k = speed / v0
    stride *= Math.max(0.35, Math.min(1.25, k)); cycle = stride / (duty * speed)
    cycle = Math.max(0.25, Math.min(3, cycle)); stride = speed * duty * cycle
  }
  return { cycle, stride, duty, lift }
}

// ---------------------------------------------------------------------------
// 蜘蛛类通用片段（也用于蝎、蜱的同名片段，个别参数按 kind 区分）
// ---------------------------------------------------------------------------
function common(R: Rig, clip: ArachnidClip, t: number, o: ArachnidAnimOpts): boolean {
  const c = R.c, rig = c.rig, v = rig.variant, g = gaitOf(v), L = c.L, kind = rig.kind
  const seed = o.seed ?? 0
  const spider = kind === 'spider'
  switch (clip) {
    case 'idle': {
      // 呼吸般的轻微起伏；每 4s 有一条腿抬起挪一下再放回原处
      R.body.y += 0.004 * L * Math.sin(TAU * t / 2)
      R.body.pitch += 0.01 * Math.sin(TAU * t / 4)
      lifeNoise(R, t, 1, seed)
      const pickLeg = Math.abs(Math.floor(hash(seed + 3) * 100)) % Math.max(1, c.legs.length)
      c.legs.forEach((_l, n) => {
        if (!c.legs[n].ik) return
        const k = n === pickLeg ? Math.max(0, Math.sin(Math.PI * clamp01((t - 2.3) / 0.6))) : 0
        R.plant(n, 0.04 * L * k * (c.legs[n].idx < 2 ? 1 : -0.5), 0.07 * L * k, 0)
      })
      if (kind === 'scorpion' || kind === 'whip') { R.tail = R.tail.map((x, i) => x + 0.03 * Math.sin(TAU * (t / 4 + i * 0.1))) }
      return true
    }
    case 'walk': case 'run': {
      const p = gaitParams(c, g, clip, o.speed)
      const run = clip === 'run'
      if (run) R.body.y -= 0.32 * c.clear
      gait(R, t + (o.phase ?? 0), p.stride, p.cycle, p.duty, p.lift, { bob: g.bobK * L * (run ? 1.3 : 1), sway: g.sway * (run ? 0.6 : 1), lean: run ? -0.04 : 0 })
      lifeNoise(R, t, 0.5, seed)
      R.abd.y += 0.04 * Math.sin(TAU * t / p.cycle)
      if (v === 'blindcave') { // 盲眼洞蛛：长触肢左右扫地探路
        for (const s of [0, 1]) { R.palp[s].swing += 0.25 * Math.sin(TAU * t / p.cycle + s * Math.PI); R.palp[s].raise += 0.08 * Math.max(0, Math.sin(TAU * t / p.cycle * 2 + s)) }
      }
      if (kind === 'scorpion' || kind === 'whip') {
        R.tail = R.tail.map((x, i) => x + 0.04 * Math.sin(TAU * t / p.cycle + i * 0.5)); R.tailY = R.tailY.map((x, i) => x + 0.06 * Math.sin(TAU * t / p.cycle * 0.5 + i * 0.7))
        R.claw.forEach((k, s) => { k.raise += 0.05 * Math.sin(TAU * t / p.cycle + s); k.yaw += 0.06 })
      }
      if (kind === 'whip') c.legs.forEach((l, n) => { if (l.feeler) R.fk(n, 0.15 * Math.sin(TAU * t / p.cycle * 2 + l.side), 0.15 + 0.15 * Math.sin(TAU * t / p.cycle * 2 + l.side + 1), 0, 1) })
      return true
    }
    case 'rear': {
      const k = smooth(0, 0.5, t), tr = smooth(0.4, 0.7, t)
      const pitch = (spider ? (v === 'colossus' ? 0.32 : v === 'harvestman' ? 0.2 : 0.48) : 0.18) * k
      R.body.y -= (spider ? 0.16 : 0.2) * c.clear * k
      R.pitchAbout(rig.pivotX, pitch)
      R.abd.z -= pitch * (spider ? 0.95 : 0.5)
      R.dirty()
      c.legs.forEach((l, n) => {
        if (!l.ik) return
        // 后两对着地（略后撤外撑）；前两对抬起张开，抬起后微颤
        if (l.idx >= 2 || !spider) R.plant(n)
        if (spider && l.idx < 2) {
          // 抬起的前腿：腿节近竖直、胫跗向前上方张开（角度已扣除身体俯仰）
          const tremble = 0.05 * tr * Math.sin(TAU * (t * 7 + n * 0.3))
          if (l.idx === 0) R.fk(n, 0.12 + tremble, 0.2 + tremble, 1.15 - pitch * 0.6, k)
          else R.fk(n, -0.25, 0.08 + tremble, 0.65 - pitch * 0.4, k)
        }
      })
      R.chel.forEach((ch) => { ch.open += 0.9 * k; ch.spread += 0.35 * k })
      R.palp.forEach((p) => { p.raise += 0.75 * k; p.spread += 0.25 * k })
      if (kind === 'scorpion' || kind === 'whip') {
        R.claw.forEach((cl) => { cl.raise += 0.5 * k; cl.yaw -= 0.35 * k; cl.open += (0.6 + 0.15 * tr * Math.sin(TAU * t * 3)) * k })
        if (kind === 'scorpion') { R.tail[0] -= 0.12 * k; R.tail[1] -= 0.08 * k; R.tail[2] += 0.1 * k + 0.05 * tr * Math.sin(TAU * t * 2) }
        else { R.tail[0] -= 0.3 * k; R.tail[1] -= 0.3 * k; R.tail[2] -= 0.15 * k }
        if (kind === 'whip') c.legs.forEach((l, n) => { if (l.feeler) R.fk(n, -0.2 * k, 0.6 * k + 0.1 * tr * Math.sin(TAU * t * 2), 0.2 * k, 1) })
      }
      R.glow *= 1 + 0.7 * k
      lifeNoise(R, t, 0.3, seed)
      return true
    }
    case 'lunge': {
      // 0–0.3 后坐蓄力（前腿抬起）→ 0.3–0.4 前扑（螯牙张开，0.40 合咬）→ 0.45–1.0 回位；后两对腿始终着地
      const back = kf(t, [[0, 0], [0.3, -0.07], [0.4, 0.2], [0.5, 0.18], [1, 0]]) * L
      const down = kf(t, [[0, 0], [0.3, -0.18], [0.4, -0.12], [0.55, -0.1], [1, 0]]) * c.clear
      const pitch = kf(t, [[0, 0], [0.3, 0.22], [0.4, -0.12], [0.55, -0.08], [1, 0]])
      R.body.x += back; R.body.y += down; R.pitchAbout(rig.pivotX, pitch); R.abd.z -= Math.max(0, pitch) * 0.9; R.dirty()
      const raise = kf(t, [[0, 0], [0.3, 1], [0.4, 0.15], [0.55, 0.15], [1, 0]]), reach = kf(t, [[0, 0], [0.3, 0], [0.4, 1], [0.6, 0.8], [1, 0]])
      c.legs.forEach((l, n) => {
        if (!l.ik) return
        if (l.idx >= 2) R.plant(n)
        else if (l.idx === 1) { R.plant(n); R.fk(n, 0.1, 0.5, 0.2, raise * 0.6) }
        else R.fk(n, 0.12 + 0.3 * reach, 0.85 * raise + 0.25 * reach, 0.5 * raise + 0.7 * reach, Math.max(raise, reach))
      })
      const open = kf(t, [[0, 0], [0.25, 1], [0.38, 1.1], [0.42, 0], [0.7, 0], [1, 0]])
      R.chel.forEach((ch) => { ch.open += open; ch.spread += 0.3 * open })
      R.palp.forEach((p) => { p.raise += 0.5 * raise })
      R.glow *= 1 + 0.8 * Math.max(raise, reach)
      return true
    }
    case 'web_spin': {
      // 身体略抬、腹部抬起左右摆，第四对腿交替向吐丝器梳丝
      R.body.y += 0.12 * c.clear; R.body.pitch += 0.05
      R.abd.y += 0.28 * Math.sin(TAU * t / 2.4); R.abd.z += 0.12 + 0.08 * Math.sin(TAU * t / 1.2)
      R.dirty()
      c.legs.forEach((l, n) => {
        if (!l.ik) return
        if (l.idx === 3) {
          const k = Math.max(0, Math.sin(TAU * (t / 1.2 + (l.side > 0 ? 0 : 0.5))))
          R.plant(n, 0.08 * L * k, 0.22 * L * k, -l.side * 0.12 * L * k)
        } else R.plant(n)
      })
      lifeNoise(R, t, 0.6, seed)
      return true
    }
    case 'flail': {
      // 落水：身体随水面起伏翻滚，八条腿乱甩（周期取 1.2s 的约数）
      R.body.y += 0.15 * c.hy + 0.05 * c.hy * Math.sin(TAU * t / 0.6)
      R.body.roll += 0.25 * Math.sin(TAU * t / 1.2); R.body.pitch += 0.15 * Math.sin(TAU * t / 0.6 + 1)
      R.dirty()
      c.legs.forEach((l, n) => {
        if (l.stump) return
        const a = n * 0.37 + seed
        R.fk(n, 0.5 * Math.sin(TAU * (t / 0.4 + a)), 0.35 + 0.45 * Math.sin(TAU * (t / 0.6 + a * 1.3)), -0.2 + 0.6 * Math.sin(TAU * (t / 0.4 + a * 0.7)), 1)
      })
      R.chel.forEach((ch, s) => { ch.open += 0.5 + 0.4 * Math.sin(TAU * (t / 0.3 + s)) })
      R.palp.forEach((p, s) => { p.raise += 0.4 * Math.sin(TAU * (t / 0.4 + s)) })
      R.claw.forEach((k, s) => { k.raise += 0.4 * Math.sin(TAU * (t / 0.6 + s)); k.open += 0.5 + 0.5 * Math.sin(TAU * t / 0.3) })
      R.tail = R.tail.map((x, i) => x + 0.3 * Math.sin(TAU * (t / 0.6 + i * 0.2)))
      return true
    }
    case 'hit': {
      // 受击：0.06s 内被打得后仰、抬起，随后弹回；前腿反射性缩起
      const p = t < 0.06 ? t / 0.06 : Math.exp(-(t - 0.06) * 9)
      R.body.x -= 0.06 * L * p; R.body.y += 0.12 * c.clear * p; R.pitchAbout(rig.pivotX, 0.14 * p); R.body.roll += 0.08 * p * (hash(seed) > 0 ? 1 : -1)
      R.dirty()
      c.legs.forEach((l, n) => { if (!l.ik) return; R.plant(n); if (l.idx < 2) R.fk(n, -0.1, 0.4, -0.5, 0.7 * p) })
      R.chel.forEach((ch) => { ch.open += 0.4 * p })
      R.claw.forEach((k) => { k.raise += 0.3 * p; k.open += 0.4 * p })
      R.tail = R.tail.map((x) => x - 0.15 * p)
      R.glow *= 1 + 1.2 * p * Math.abs(Math.sin(t * 60))
      return true
    }
    case 'death': deathPose(R, t, o); return true
  }
  return false
}

/**
 * 死亡：抽搐（0–0.3，腿着地）→ 临死一弹（0.15–0.8 根节点弹起）同时腿向腹面急收成「死虫」折叠（0.2–0.55）、
 * 绕体轴滚转 π 成仰面（0.3–0.8）→ 背面着地后余颤衰减、腿略松开。折叠腿：腿节朝腹面、胫跗折回（膝朝天），
 * 足尖离地高度按仰面后的髋高限位，保证不入地。蝎类不翻身：瘫在地上侧倾、腿收到身下、尾放平。
 * ctl 供 revive 倒放（直接给翻转 / 折叠 / 弹起 / 抽搐量）。
 */
function deathPose(R: Rig, t: number, o: ArachnidAnimOpts, ctl?: { flip: number; curl: number; tw: number; bump: number }) {
  const c = R.c, rig = c.rig, kind = rig.kind, seed = o.seed ?? 0
  const scorp = kind === 'scorpion' || kind === 'whip'
  const revive = !!ctl
  const flip = ctl ? ctl.flip : smooth(0.3, 0.8, t)
  const curl = ctl ? ctl.curl : smooth(0.2, 0.55, t) * (1 - 0.12 * smooth(1.0, 1.6, t))
  const jolt = ctl ? 0 : Math.max(0, Math.sin(Math.PI * clamp01(t / 0.3)))
  const tw = ctl ? ctl.tw : 0.55 * Math.exp(-Math.max(0, t - 0.85) * 2.2) * smooth(0.75, 0.9, t) + jolt * 0.6
  if (scorp) {
    R.body.y -= (c.clear + 0.004) * smooth(0.1, 0.7, t)
    R.body.roll += 0.35 * smooth(0.25, 0.85, t)
    R.dirty()
    c.legs.forEach((l, n) => {
      if (l.stump) return
      if (l.ik) R.plant(n)
      R.fk(n, 0.15 * (l.idx < 2 ? -1 : 1), 0.45 * curl + 0.2 * jolt, -1.3 * curl + tw * 0.3 * noise1(t * 9 + n, seed + n), Math.max(curl, jolt))
    })
    R.tail = R.tail.map((x, i) => x + [0.5, 0.35, 0.25][i] * smooth(0.2, 1, t))
    R.claw.forEach((k) => { k.raise -= 0.3 * curl; k.open += 0.3 * jolt })
    return
  }
  // 根高度：滚转中按椭圆截面估最低点；再加临死一弹（够让折叠到腹面的腿离地）
  const roll = Math.PI * flip
  const cs = Math.cos(roll), sn = Math.sin(roll)
  const dep = cs > 0 ? -c.bot : c.top
  const low = Math.sqrt((dep * cs) ** 2 + (c.halfW * Math.abs(sn)) ** 2)
  const yEnd = c.top * 0.96, yStart = revive ? c.hy - 0.95 * c.clear : c.hy
  const aMax = Math.max(...c.legs.map((l) => l.a))
  const bump = ctl ? ctl.bump : smooth(0.12, 0.42, t) * (1 - smooth(0.55, 0.82, t))
  const y = Math.max(lerp(yStart, yEnd, flip), low * 0.98) + 0.85 * aMax * bump * (1 - 0.6 * flip)
  R.body.y += y - c.hy
  R.body.roll += roll
  R.body.pitch += 0.06 * flip
  if (!revive) { R.body.x += 0.02 * c.L * jolt * hash(seed + 1); R.body.yaw += 0.15 * jolt * hash(seed + 2) }
  R.dirty()
  c.legs.forEach((l, n) => {
    if (l.stump) return
    const nz = tw * noise1(t * 11 + n * 3.1, seed + n)
    // 折叠终态：腿节 −1.85（越过腹面中线向内，仰面后八个膝在腹上方聚拢），胫跗折回到 腿节+π−0.75（向外下垂、足尖回到身侧）；
    // 足尖若会伸过仰面后的地面则改为向内横折
    const aF1 = -1.85, ky = l.a * Math.sin(aF1), hipW = yEnd - l.at.y, lim = 0.7 * hipW - ky
    let aT1 = aF1 + Math.PI - 0.75
    if (ky + l.b * Math.sin(aT1) > 0.7 * hipW) aT1 = Math.PI - Math.asin(Math.max(-1, Math.min(1, lim / l.b)))
    // 起始角：死亡从静止站姿（腿节 th、足端 beta0）开始；复苏的终点是「摊开」姿态（与站起段的 FK 增量 0.3/0.3 衔接）
    const bF = revive ? l.th + 0.3 : l.th, bT = revive ? l.beta0 + 0.6 : l.beta0
    const fwd = [-0.45, -0.15, 0.15, 0.45][l.idx] * curl
    const aF = lerp(bF, aF1, curl) + 0.22 * nz + jolt * 0.25, aT = lerp(bT, aT1, curl) + 0.35 * nz + jolt * 0.2
    if (l.ik && !revive) R.plant(n)
    R.fk(n, fwd + 0.12 * nz, aF, aT, revive ? 1 : Math.max(curl, smooth(0.15, 0.25, t)), true)
  })
  R.chel.forEach((ch) => { ch.open += 0.3 * jolt - 0.15 * curl })
  R.palp.forEach((p) => { p.raise -= 0.6 * curl; p.spread -= 0.2 * curl })
  R.abd.z += 0.1 * curl
  if (!revive) R.glow *= lerp(1, 0.25, smooth(0.6, 1.8, t)) * (1 + 1.5 * jolt)
}

// ---------------------------------------------------------------------------
// 专属片段
// ---------------------------------------------------------------------------
function special(R: Rig, clip: ArachnidClip, t: number, o: ArachnidAnimOpts): boolean {
  const c = R.c, rig = c.rig, v = rig.variant, L = c.L, seed = o.seed ?? 0
  switch (clip) {
    case 'swim': case 'dive': {
      // 水蛛：身体悬在水中，后两对带泳毛的腿左右交替划水（伸直后蹬 = 推进，屈曲前收 = 回程），前两对小幅协同
      const dive = clip === 'dive', P = dive ? 0.3 : 0.45
      R.body.y += (dive ? 1.5 : 0.9) * c.hy; R.body.pitch += dive ? -0.62 : 0.04 * Math.sin(TAU * t / P)
      R.body.roll += 0.06 * Math.sin(TAU * t / (P * 2))
      R.abd.z += dive ? -0.1 : 0
      R.dirty()
      c.legs.forEach((l, n) => {
        const ph = TAU * (t / P + (l.side > 0 ? 0 : 0.5) + (l.idx === 2 ? 0.12 : 0))
        const s = Math.sin(ph), stroke = Math.cos(ph) // stroke>0 回程（前收）、<0 推进（后蹬）
        if (l.idx >= 2) R.fk(n, 0.55 * stroke, -0.05 + 0.3 * Math.max(0, stroke), stroke > 0 ? -0.7 * stroke : 0.35 * -stroke, 1)
        else R.fk(n, 0.2 * s + (dive ? 0.25 : 0.1), 0.25 + 0.1 * s, -0.25 + 0.15 * s, 1)
      })
      R.palp.forEach((p, s) => { p.raise += 0.2 + 0.1 * Math.sin(TAU * (t / P + s)) })
      return true
    }
    case 'jump': {
      // 跳蛛：0–0.38 下蹲蓄力（前腿与触肢抬起）→ 0.38–0.78 弧线腾空（前腿前伸、后腿蹬直后收）→ 落地缓冲
      const t0 = ARACHNID_JUMP_TAKEOFF, t1 = ARACHNID_JUMP_LAND, D = ARACHNID_ROOT_MOTION.jump!.dx, Hh = 0.24
      const u = clamp01((t - t0) / (t1 - t0)), air = t > t0 && t < t1
      const crouch = kf(t, [[0, 0], [0.32, 1], [t0, 0.9], [t0 + 0.06, 0], [t1, 0], [t1 + 0.07, 0.8], [1.2, 0]])
      R.body.y -= 0.62 * c.clear * crouch
      R.body.x += D * smooth(0, 1, u) * 1 // 水平：腾空段匀加速 / 减速
      if (air) R.body.y += 4 * Hh * u * (1 - u)
      R.pitchAbout(rig.pivotX, kf(t, [[0, 0], [0.32, 0.12], [t0 + 0.05, 0.28], [t1 - 0.08, -0.25], [t1 + 0.05, -0.05], [1.2, 0]]))
      R.dirty()
      const airW = kf(t, [[0, 0], [t0 - 0.02, 0], [t0 + 0.04, 1], [t1 - 0.05, 1], [t1, 0]])
      c.legs.forEach((l, n) => {
        if (!l.ik) return
        R.plant(n, t >= t1 - 0.05 ? D : 0, 0, 0)
        if (l.idx === 0) R.fk(n, 0.25, lerp(0.7, 0.35, airW), lerp(0.4, 0.75, airW), kf(t, [[0, 0], [0.3, 0.6], [t0, 0.6], [t0 + 0.04, 1], [t1 - 0.06, 1], [t1, 0]]))
        else if (airW > 0) {
          const ext = 1 - smooth(0.45, 0.85, u) // 起跳时后腿蹬直，空中后半段收回准备落地
          R.fk(n, l.idx >= 2 ? -0.2 * ext : 0.1, l.idx >= 2 ? -0.15 * ext + 0.25 * (1 - ext) : 0.3, l.idx >= 2 ? 0.55 * ext - 0.2 * (1 - ext) : 0.2, airW)
        }
      })
      R.palp.forEach((p) => { p.raise += 0.4 * crouch + 0.3 * airW })
      R.chel.forEach((ch) => { ch.open += 0.3 * airW })
      return true
    }
    case 'bob': {
      // 长脚盲蛛防御性弹动：身体在八条长腿间快速下沉回弹，脚不动
      const k = 0.5 - 0.5 * Math.cos(TAU * t / 0.4)
      R.body.y -= 0.32 * c.hy * k; R.body.roll += 0.05 * Math.sin(TAU * t / 0.8); R.body.pitch += 0.04 * Math.sin(TAU * t / 0.4 + 1)
      R.dirty()
      c.legs.forEach((l, n) => { if (l.ik) R.plant(n) })
      return true
    }
    case 'regen': {
      // 再生蛛：新肢从芽状（建模短肢的 0.15 倍）在 1.5s 内长到接近正常腿长（1.8 倍），边长边抽动舒展；身体随之抽搐，缝合线符文高亮。
      // 长好后的长度由 opts.regrow 带到其它片段（AI 记住再生状态即可）
      const g = kf(t, [[0, 0.15], [0.25, 0.35], [1.2, 1.7], [1.4, 1.9], [1.5, ARACHNID_REGROWN]])
      R.body.y += 0.01 * L * Math.sin(TAU * t * 3) * (1 - smooth(1.2, 1.8, t)); R.body.roll += 0.04 * Math.sin(TAU * t * 2.5) * (1 - smooth(1.2, 1.8, t))
      R.dirty()
      c.legs.forEach((l, n) => {
        if (l.ik) { R.plant(n); return }
        if (!l.regrow) return
        R.legs[n].scale = g
        const unfold = smooth(0.3, 1.5, t)
        R.fk(n, 0.1 * Math.sin(TAU * t * 2 + n), lerp(0.45, -0.15, unfold) + 0.12 * Math.sin(TAU * t * 3 + n), lerp(-1.1, -0.25, unfold) + 0.2 * Math.sin(TAU * t * 4 + n), 1)
      })
      lifeNoise(R, t, 1.5, seed)
      R.glow *= 1 + 1.4 * Math.sin(Math.PI * clamp01(t / 1.5))
      return true
    }
    case 'revive': {
      // 不死蛛复苏：0–0.9 仰面抽搐渐强 → 0.9–1.6 翻回 → 1.6–2.8 一顿一顿地撑起站稳；内核符文强烈搏动
      // 0.9–1.35 腿保持折叠翻回 → 1.25–1.6 仍在半空时摊开腿 → 1.6 腹面落地
      const flip = 1 - smooth(0.9, 1.35, t)
      const tw = 0.15 + 0.7 * smooth(0, 0.9, t) * (1 - smooth(1.4, 2.0, t))
      // 站起：分三次一顿一顿地抬高（阶梯缓动）
      const st = smooth(1.6, 2.8, t), stair = clamp01(st * 3 - Math.sin(st * 3 * TAU) / TAU * 0.8) / 3
      if (t < 1.6) deathPose(R, t, o, { flip, curl: 1 - smooth(1.25, 1.55, t), tw, bump: smooth(0.85, 1.1, t) * (1 - smooth(1.45, 1.6, t)) })
      else {
        R.body.y -= (c.clear * 0.95) * (1 - Math.min(1, stair * 1.0))
        R.body.roll += 0.12 * (1 - st) * Math.sin(TAU * t * 2)
        R.dirty()
        const legsW = 1 - smooth(1.6, 2.1, t)
        c.legs.forEach((l, n) => {
          if (!l.ik) return
          R.plant(n)
          R.fk(n, 0, 0.3, 0.3, legsW)
          if (l.idx === (Math.floor(t * 5) % 4)) { R.legs[n].tgt!.y += 0.03 * L * Math.max(0, Math.sin(TAU * t * 5)) * (1 - st); R.legs[n].planted = false }
        })
      }
      R.glow *= 1.2 + 1.3 * Math.abs(Math.sin(TAU * t * 1.5)) * (1 - smooth(2.2, 2.8, t))
      return true
    }
    case 'sting': {
      // 洞蝎：0–0.3 尾节从根到梢依次后拉蓄力 → 0.3–0.42 依次前卷，尾刺前刺（0.42 命中）→ 回位；双螯前伸夹住猎物
      const keys = (d: number, back: number, fwd: number): [number, number][] => [[0, 0], [0.22 + d, back], [0.32 + d, back], [0.36 + d * 1.5, fwd], [0.5, fwd], [0.9, 0]]
      R.tail[0] += kf(t, keys(0, 0.12, -0.34)); R.tail[1] += kf(t, keys(0.015, 0.18, -0.46)); R.tail[2] += kf(t, keys(0.03, 0.28, -0.7))
      const lean = kf(t, [[0, 0], [0.3, 0.06], [0.42, -0.06], [0.9, 0]])
      R.pitchAbout(rig.pivotX, lean); R.body.y -= 0.15 * c.clear * smooth(0.3, 0.42, t) * (1 - smooth(0.5, 0.9, t))
      R.dirty()
      c.legs.forEach((l, n) => { if (l.ik) R.plant(n) })
      R.claw.forEach((k) => { k.raise += 0.15; k.yaw += 0.2; k.open += 0.1 })
      return true
    }
    case 'pinch': {
      // 螯夹：0–0.22 张螯前探 → 0.3 夹合 → 回收
      const reach = kf(t, [[0, 0], [0.22, 1], [0.3, 1], [0.5, 0.4], [0.7, 0]]), open = kf(t, [[0, 0], [0.2, 1], [0.27, 1], [0.3, -0.1], [0.5, 0], [0.7, 0]])
      R.body.x += 0.08 * L * reach; R.body.y -= 0.1 * c.clear * reach
      R.dirty()
      c.legs.forEach((l, n) => { if (l.ik) R.plant(n) })
      R.claw.forEach((k) => { k.yaw += 0.3 * reach; k.raise += 0.12 * reach; k.open += 0.85 * open })
      R.tail = R.tail.map((x, i) => x - 0.06 * reach * (i + 1))
      return true
    }
    case 'spray': {
      // 鞭蝎：抬腹、尾基上扬、鞭状尾须竖起，尾基酸腺在 ARACHNID_SPRAY_PUFFS 三次喷雾（每次腹部一抖）
      const k = smooth(0, 0.4, t) * (1 - smooth(1.15, 1.4, t))
      let jerk = 0
      for (const p of ARACHNID_SPRAY_PUFFS) jerk = Math.max(jerk, Math.max(0, Math.sin(Math.PI * clamp01((t - p) / 0.12))))
      R.body.y += 0.15 * c.clear * k; R.pitchAbout(rig.pivotX, -0.06 * k)
      R.abd.z -= 0.22 * k + 0.05 * jerk
      R.dirty()
      R.tail[0] -= 0.55 * k + 0.08 * jerk; R.tail[1] -= 0.35 * k; R.tail[2] -= 0.25 * k
      R.tailY = R.tailY.map((x, i) => x + 0.12 * k * Math.sin(TAU * t * 1.5 + i))
      c.legs.forEach((l, n) => { if (l.ik) R.plant(n); else if (l.feeler) R.fk(n, -0.1, 0.35 * k, 0.1, 1) })
      R.claw.forEach((cl) => { cl.raise += 0.3 * k; cl.open += 0.4 * k })
      return true
    }
    case 'latch': case 'feed': {
      // 吸附蜱：头朝下压、口器前戳刺入（latch 0.45 命中）；feed 保持咬合，膨胀度 0→1，伴随「咚-咚」心跳搏动
      const feed = clip === 'feed'
      const k = feed ? 1 : smooth(0, 0.35, t)
      const stab = feed ? 1 : kf(t, [[0, 0], [0.3, -0.3], [0.45, 1], [0.8, 1]])
      const E = feed ? smooth(0, 5.6, t) : 0
      const beatPh = fract(t * 1.25), beat = Math.exp(-(((beatPh - 0.1) / 0.05) ** 2)) + 0.6 * Math.exp(-(((beatPh - 0.3) / 0.05) ** 2))
      R.engorge = feed ? clamp01(E + 0.04 * beat * (0.3 + E)) : 0
      R.body.y += 0.32 * c.hy * E
      R.pitchAbout(0.05, -0.2 * k * (1 - 0.6 * E))
      R.dirty()
      R.mouth += 0.01 * stab; R.mouthTilt -= 0.25 * k
      c.legs.forEach((l, n) => {
        if (!l.ik) return
        if (l.idx === 0) R.plant(n, 0.012 * k, 0, -l.side * 0.004 * k)
        else R.plant(n, 0, 0, l.side * 0.015 * E)
      })
      R.abd.s = 1 + 0.025 * beat * (feed ? 1 : 0)
      return true
    }
    case 'walk': {
      if (v !== 'undying') return false
      // 不死蛛跛行：缺左 2、右 3 两条腿，一组支撑腿只剩两条——这组摆动时身体向缺腿侧塌陷、侧倾，另一组支撑相更长
      const g = gaitOf(v), p = gaitParams(c, g, 'walk', o.speed)
      const tt = t + (o.phase ?? 0), ph = tt / p.cycle
      gait(R, tt, p.stride, p.cycle, p.duty, p.lift, { dutyByGroup: [0.56, 0.7], bob: g.bobK * L * 0.5, sway: 0.02 })
      // 组 1（L1 R2 L3 R4 中残缺的那组）摆动时塌陷
      const lurch = Math.max(0, Math.sin(TAU * (ph - 0.05))) ** 2
      R.body.y -= 0.18 * c.clear * lurch; R.body.roll += 0.11 * lurch
      R.body.yaw += 0.05 * Math.sin(TAU * ph)
      R.dirty()
      // 残肢随步抽动
      c.legs.forEach((l, n) => { if (l.stump) R.fk(n, 0.2 * Math.sin(TAU * ph + n), 0.3 * Math.sin(TAU * ph * 2 + n), 0, 1) })
      lifeNoise(R, t, 0.4, seed)
      return true
    }
  }
  return false
}

// ======================================================================
// 解算：身体 → 腿（IK / FK 混合）→ 附肢
// ======================================================================
const _e = new THREE.Euler(), _m = new THREE.Matrix4(), _v = V()
function solve(R: Rig, variant: ArachnidVariant, clip: ArachnidClip, t: number): ArachnidPose {
  const c = R.c, rig = c.rig
  const q = c.nodes.map((n) => new THREE.Quaternion().setFromEuler(restOf(n).r))
  const p = c.nodes.map((n) => restOf(n).p.clone())
  const s = c.nodes.map(() => 1)
  const I = (n?: THREE.Object3D) => (n ? c.idx.get(n) ?? -1 : -1)
  const setRot = (n: THREE.Object3D | undefined, x: number, y: number, z: number) => { const i = I(n); if (i < 0) return; const r = restOf(n!).r; q[i].setFromEuler(_e.set(r.x + x, r.y + y, r.z + z)) }
  // 根
  R.dirty()
  const ri = I(rig.root); q[ri].copy(R.rootQ()); p[ri].copy(R.rootP())
  setRot(rig.body.abdomen, R.abd.x, R.abd.y, R.abd.z); s[I(rig.body.abdomen)] = R.abd.s
  // 腿
  const rootCephInv = R.rootM().clone().multiply(c.cephM).invert()
  const planted: boolean[] = [], ikErr: number[] = []
  c.legs.forEach((L, n) => {
    const cmd = R.legs[n]
    let yaw = L.yaw0, fz = 0, tz = 0, err = 0
    if (cmd.tgt && cmd.w < 1) {
      const rel = _v.copy(cmd.tgt).applyMatrix4(rootCephInv).sub(L.at)
      let ay = Math.atan2(-rel.z, rel.x)
      let dy = ay - L.yaw0; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); ay = L.yaw0 + dy
      const h = Math.hypot(rel.x, rel.z), y = rel.y
      const d0 = Math.hypot(h, y), d = Math.min(Math.max(d0, Math.abs(L.a - L.b) + 1e-4), L.a + L.b - 1e-4)
      err = Math.max(0, d0 - (L.a + L.b))
      const base = Math.atan2(y, h), off = Math.acos(Math.max(-1, Math.min(1, (L.a * L.a + d * d - L.b * L.b) / (2 * L.a * d))))
      const al = base + off, kx = L.a * Math.cos(al), ky = L.a * Math.sin(al)
      const ga = Math.atan2(y - ky, h - kx)
      yaw = ay; fz = al - L.th; tz = ga - fz - L.beta0
    }
    if (cmd.w > 0) {
      const fy = L.yaw0 + L.side * cmd.fwd
      const ffz = cmd.abs ? cmd.fz - L.th : cmd.fz
      const ftz = cmd.abs ? cmd.tz - (cmd.fz - L.th) - L.beta0 : cmd.tz
      if (cmd.tgt) { const w = cmd.w; yaw = lerp(yaw, fy, w); fz = lerp(fz, ffz, w); tz = lerp(tz, ftz, w) } else { yaw = fy; fz = ffz; tz = ftz }
    }
    q[I(L.j[0])].setFromEuler(_e.set(0, yaw, 0)); q[I(L.j[1])].setFromEuler(_e.set(0, 0, fz)); q[I(L.j[2])].setFromEuler(_e.set(0, 0, tz))
    s[I(L.j[0])] = cmd.scale
    planted.push(L.ik && cmd.planted && cmd.w < 0.01 && !!cmd.tgt); ikErr.push(err)
  })
  // 螯肢 / 触肢 / 蝎螯 / 尾 / 口器
  rig.chelicerae.forEach((g, k) => { const ch = R.chel[k] ?? R.chel[0]; setRot(g, (k ? -1 : 1) * ch.spread * 0.35, 0, ch.open * 0.6) })
  if (rig.kind !== 'scorpion' && rig.kind !== 'whip') rig.pedipalps.forEach((g, k) => { const pl = R.palp[k] ?? R.palp[0], side = k ? 1 : -1; setRot(g, 0, -side * pl.spread * 0.5 + pl.swing, pl.raise * 0.8) })
  rig.claws.forEach((cl, k) => { const cc = R.claw[k] ?? R.claw[0]; setRot(cl.arm, 0, cl.side * cc.yaw, cc.raise); setRot(cl.finger, 0, cl.side * cc.open * 0.55 * (rig.kind === 'whip' ? -1 : 1), 0) })
  rig.tail.forEach((g, k) => setRot(g, 0, R.tailY[k] ?? 0, R.tail[k] ?? 0))
  if (rig.mouth) { const i = I(rig.mouth); p[i].x += R.mouth; setRot(rig.mouth, 0, 0, R.mouthTilt) }
  return { variant, clip, t, q, p, s, engorge: R.engorge, glow: R.glow, diag: { planted, ikErr } }
}

// ======================================================================
// 对外接口
// ======================================================================
export function sampleArachnid(grp: THREE.Object3D, clip: ArachnidClip, t: number, opts: ArachnidAnimOpts = {}): ArachnidPose {
  const rig = rigOf(grp)
  if (rig.kind === 'swarm') {
    const tt = t
    const mrig = rig.root.userData.mother as ArachnidRig | undefined
    const pose: ArachnidPose = { variant: rig.variant, clip, t: tt, q: [], p: [], s: [], glow: 1, swarm: { t: tt, speed: opts.speed ?? 0.25 }, diag: { planted: [], ikErr: [] } }
    if (mrig && mrig.root.parent) pose.mother = sampleArachnid(mrig.root.parent, clip === 'swarm_flow' ? ((opts.speed ?? 0.25) > 0.02 ? 'walk' : 'idle') : clip, t, opts)
    return pose
  }
  const c = cacheOf(rig)
  const info = ARACHNID_CLIPS[rig.variant as 'wolf']?.[clip]
  // 步行 / 疾行由步态函数自身周期化（周期随速度变），不按片段时长取模
  const free = clip === 'walk' || clip === 'run'
  const tt = info && !free ? (info.loop ? ((t % info.len) + info.len) % info.len : Math.min(Math.max(0, t), info.len)) : t
  const R = new Rig(c)
  if (opts.regrow !== undefined) c.legs.forEach((l, n) => { if (l.regrow) R.legs[n].scale = opts.regrow! })
  if (!special(R, clip, tt, opts) && !common(R, clip, tt, opts)) common(R, 'idle', tt % 4, opts)
  // 符文强化：所有片段带「呼吸」——周期取能整除片段时长的约 2.4s，循环片段首尾一致
  if (RUNIC.has(rig.variant)) {
    const len = info?.len ?? 4, P = info?.loop && len >= 1.2 ? len / Math.max(1, Math.round(len / 2.4)) : 2.4
    R.glow *= 1 + 0.35 * Math.sin(TAU * tt / P)
  }
  let pose = solve(R, rig.variant, clip, tt)
  // 防入地：FK 腿（抽搐、蜷缩、抬腿）的膝或足尖若低于地面，就把根节点抬到刚好离地，再解一遍（着地腿 IK 随之重解，仍贴地）
  if (clip !== 'swim' && clip !== 'dive' && clip !== 'flail') {
    for (let it = 0; it < 4; it++) {
      const low = legMinY(c, pose)
      if (low >= 0.0015) break
      R.body.y += 0.0015 - low
      pose = solve(R, rig.variant, clip, tt)
    }
  }
  return pose
}
/** 由姿态数组前向计算所有腿的膝点 / 足尖，返回最低高度（模型空间） */
function legMinY(c: RigC, pose: ArachnidPose) {
  const M = (n: THREE.Object3D, parent: THREE.Matrix4) => { const i = c.idx.get(n)!; return parent.clone().multiply(new THREE.Matrix4().compose(pose.p[i], pose.q[i], V(pose.s[i], pose.s[i], pose.s[i]))) }
  const root = M(c.rig.root, new THREE.Matrix4()), ceph = M(c.rig.body.ceph, root)
  let low = 1e9
  for (const L of c.legs) {
    if (L.stump) continue
    const tib = M(L.j[2], M(L.j[1], M(L.j[0], ceph)))
    low = Math.min(low, _v.setFromMatrixPosition(tib).y, _v.copy(L.F).applyMatrix4(tib).y)
  }
  return low
}

type GlowRec = { kind: 'emissive' | 'uGlow' | 'intensity'; mat: THREE.Material; base: THREE.Color | number }
const GLOW = new WeakMap<THREE.Object3D, GlowRec[]>()
function glowTargets(grp: THREE.Object3D) {
  let list = GLOW.get(grp)
  if (list) return list
  list = []
  const seen = new Set<THREE.Material>()
  grp.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
    if (!m) return
    for (const mm of Array.isArray(m) ? m : [m]) {
      if (seen.has(mm)) continue
      seen.add(mm)
      const u = mm.userData.glow as { uGlow: { value: THREE.Color } } | undefined
      if (u) list!.push({ kind: 'uGlow', mat: mm, base: u.uGlow.value.clone() })
      const em = mm as THREE.MeshLambertMaterial
      if (o.userData.rune && em.emissive) list!.push({ kind: 'emissive', mat: mm, base: em.emissive.clone() })
      else if (em.emissiveMap && em.emissiveIntensity !== undefined) list!.push({ kind: 'intensity', mat: mm, base: em.emissiveIntensity })
    }
  })
  GLOW.set(grp, list)
  return list
}
/** 写入发光倍数（符文壳 emissive、身体顶点发光 uGlow、熔岩 / 内核 emissiveIntensity 同步缩放） */
export function setArachnidGlow(grp: THREE.Object3D, k: number) {
  for (const g of glowTargets(grp)) {
    if (g.kind === 'uGlow') (g.mat.userData.glow.uGlow.value as THREE.Color).copy(g.base as THREE.Color).multiplyScalar(k)
    else if (g.kind === 'emissive') (g.mat as THREE.MeshLambertMaterial).emissive.copy(g.base as THREE.Color).multiplyScalar(k)
    else (g.mat as THREE.MeshLambertMaterial).emissiveIntensity = (g.base as number) * k
  }
}

export function applyArachnidPose(grp: THREE.Object3D, pose: ArachnidPose) {
  const rig = rigOf(grp)
  if (rig.kind === 'swarm') {
    if (pose.swarm) updateArachnidSwarm(grp, V(), 0, pose.swarm.t, { speed: pose.swarm.speed })
    const mrig = rig.root.userData.mother as ArachnidRig | undefined
    if (pose.mother && mrig?.root.parent) applyArachnidPose(mrig.root.parent, pose.mother)
    return
  }
  const c = cacheOf(rig)
  // 吸附蜱：先写膨胀度（它会改腿），再写关节
  if (pose.engorge !== undefined && rig.setEngorge && Math.abs((rig.engorge ?? 0) - pose.engorge) > 1e-4) rig.setEngorge(pose.engorge)
  c.nodes.forEach((n, i) => { if (!pose.q[i]) return; n.quaternion.copy(pose.q[i]); n.position.copy(pose.p[i]); n.scale.setScalar(pose.s[i]) })
  setArachnidGlow(grp, pose.glow)
}
export function poseArachnidClip(grp: THREE.Object3D, clip: ArachnidClip, t: number, opts: ArachnidAnimOpts = {}) {
  const p = sampleArachnid(grp, clip, t, opts); applyArachnidPose(grp, p); return p
}
export function mixArachnidPose(a: ArachnidPose, b: ArachnidPose, w: number): ArachnidPose {
  const lerpOpt = (x?: number, y?: number) => (x === undefined ? y : y === undefined ? x : lerp(x, y, w))
  return {
    variant: a.variant, clip: w < 0.5 ? a.clip : b.clip, t: w < 0.5 ? a.t : b.t,
    q: a.q.map((q, i) => q.clone().slerp(b.q[i] ?? q, w)), p: a.p.map((p, i) => p.clone().lerp(b.p[i] ?? p, w)), s: a.s.map((s, i) => lerp(s, b.s[i] ?? s, w)),
    engorge: lerpOpt(a.engorge, b.engorge), glow: lerp(a.glow, b.glow, w),
    swarm: a.swarm && b.swarm ? { t: w < 0.5 ? a.swarm.t : b.swarm.t, speed: lerp(a.swarm.speed, b.swarm.speed, w) } : (a.swarm ?? b.swarm),
    mother: a.mother && b.mother ? mixArachnidPose(a.mother, b.mother, w) : (a.mother ?? b.mother),
    diag: w < 0.5 ? a.diag : b.diag,
  }
}

/** 验收 / AI 用：当前姿态下每条着地腿的脚尖（模型空间）与身体最低点 */
export function arachnidContacts(grp: THREE.Object3D) {
  const rig = rigOf(grp), c = cacheOf(rig)
  grp.updateMatrixWorld(true)
  const inv = (grp as THREE.Object3D).matrixWorld.clone().invert()
  const feet = c.legs.map((l) => (l.stump ? null : l.F.clone().applyMatrix4(_m.copy(inv).multiply(l.j[2].matrixWorld))))
  return { feet, ik: c.legs.map((l) => l.ik) }
}
/** 鞭蝎酸腺 / 蜘蛛吐丝器的喷口位置与朝向（模型空间），给特效用 */
export function arachnidEmitter(grp: THREE.Object3D, which: 'spray' | 'spinner'): { pos: V3; dir: V3 } | null {
  const rig = rigOf(grp)
  grp.updateMatrixWorld(true)
  const inv = grp.matrixWorld.clone().invert()
  if (which === 'spray') {
    const t0 = rig.tail[0]; if (!t0) return null
    const m = _m.copy(inv).multiply(t0.matrixWorld)
    const pos = V(-0.015, 0.01, 0).applyMatrix4(m), dir = V(-0.55, 1, 0).transformDirection(m)
    return { pos, dir }
  }
  const ab = rig.body.abdomen, box = new THREE.Box3()
  for (const ch of ab.children) { const mm = ch as THREE.Mesh; if (mm.isMesh && !mm.userData.rune && !(mm as THREE.InstancedMesh).isInstancedMesh) { mm.geometry.computeBoundingBox(); box.union(mm.geometry.boundingBox!) } }
  const m = _m.copy(inv).multiply(ab.matrixWorld)
  return { pos: V(box.min.x + 0.01, (box.min.y + box.max.y) * 0.42, 0).applyMatrix4(m), dir: V(-1, -0.5, 0).transformDirection(m) }
}

// ======================================================================
// 群体流动：幼蛛潮 / 螨群（InstancedMesh）
// ======================================================================
interface SwarmBase { pos: V3[]; yaw: number[]; quat: THREE.Quaternion[]; scl: number[]; ph: number[]; clump: number[] }
const SWARM = new WeakMap<THREE.InstancedMesh, SwarmBase>()
/**
 * 群体流动更新：center = 群中心（模型空间，地面高度 y），heading = 朝向（绕 Y，0 = +X），t = 时间 s。
 * 幼蛛：保持潮头密、潮尾拖带的队形整体涌动；个体沿流向前后穿插、左右摆动、一停一窜地抖，朝向大体对齐流向（静止时四散乱转）。
 * 螨：各小团绕团心缓慢打旋并随流漂移，地面个体高频抖动，空中个体上下浮沉。
 * 母蛛背上的幼蛛（swarm[1]）随母蛛走，不在此更新。
 */
export function updateArachnidSwarm(grp: THREE.Object3D, center: V3, heading: number, t: number, opts: { speed?: number } = {}) {
  const rig = rigOf(grp)
  if (rig.kind !== 'swarm' || !rig.swarm?.length) return
  const im = rig.swarm[0], speed = opts.speed ?? 0.25, mite = rig.variant === 'mitecloud'
  let B = SWARM.get(im)
  if (!B) {
    B = { pos: [], yaw: [], quat: [], scl: [], ph: [], clump: [] }
    const m = new THREE.Matrix4(), p = V(), q = new THREE.Quaternion(), s = V()
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m); m.decompose(p, q, s)
      B.pos.push(p.clone()); B.quat.push(q.clone()); B.scl.push(s.x); B.yaw.push(new THREE.Euler().setFromQuaternion(q, 'YXZ').y); B.ph.push(fract(Math.sin(i * 12.9898) * 43758.5453)); B.clump.push(i % 6)
    }
    SWARM.set(im, B)
  }
  const flow = clamp01(speed / 0.15) // 0 = 原地打转，1 = 齐向流动
  const ch = Math.cos(heading), sh = Math.sin(heading)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), sv = V(), P = V()
  // 螨的团心：从初始分布估计（按 i%6 分组的均值）
  const cc: V3[] = []
  if (mite) { for (let k = 0; k < 6; k++) cc.push(V()); const cnt = new Array(6).fill(0); B.pos.forEach((p, i) => { if (p.y < 0.04) { cc[B!.clump[i]].add(p); cnt[B!.clump[i]]++ } }); cc.forEach((c, k) => c.multiplyScalar(1 / Math.max(1, cnt[k])).setY(0)) }
  for (let i = 0; i < im.count; i++) {
    const b = B.pos[i], ph = B.ph[i], k = B.scl[i]
    let x = b.x, y = b.y, z = b.z, yaw: number
    if (!mite) {
      // 队形：沿流向拉长（潮尾拖后），个体前后穿插（慢）、左右摆（中）、一停一窜（快）
      x = x * (1 + 0.35 * flow) - 0.08 * flow * (z * z) * 6
      x += 0.07 * Math.sin(t * (0.7 + ph * 0.6) + ph * 20) + 0.025 * flow * noise1(t * 3 + ph * 9, i)
      z += 0.05 * Math.sin(t * (1.1 + ph) + ph * 31) * (1 - 0.4 * flow)
      const dart = Math.max(0, Math.sin(t * (5 + ph * 3) + ph * 50))
      x += 0.02 * flow * dart
      y = 0.0025 * Math.abs(Math.sin(t * 28 + ph * 40))
      const vx = 0.07 * (0.7 + ph * 0.6) * Math.cos(t * (0.7 + ph * 0.6) + ph * 20), vz = 0.05 * (1.1 + ph) * Math.cos(t * (1.1 + ph) + ph * 31)
      yaw = lerp(B.yaw[i] + 0.8 * Math.sin(t * 0.9 + ph * 17), Math.atan2(-vz * 0.6, speed + vx) + 0.15 * noise1(t * 6, i), flow)
    } else {
      const air = b.y > 0.04
      if (air) {
        y = b.y + 0.06 * Math.sin(t * (0.8 + ph) + ph * 30)
        x += 0.05 * Math.sin(t * 0.6 + ph * 11); z += 0.05 * Math.cos(t * 0.5 + ph * 13)
      } else {
        // 绕团心打旋
        const c0 = cc[B.clump[i]], rx = b.x - c0.x, rz = b.z - c0.z, a = t * (0.6 + 0.4 * ph) * (B.clump[i] % 2 ? 1 : -1)
        x = c0.x + rx * Math.cos(a) - rz * Math.sin(a); z = c0.z + rx * Math.sin(a) + rz * Math.cos(a)
        x += 0.003 * noise1(t * 20 + ph * 5, i); z += 0.003 * noise1(t * 20 + ph * 7, i + 99)
        x *= 1 + 0.25 * flow
      }
      yaw = B.yaw[i] + t * (2 + ph * 3) * (ph > 0.5 ? 1 : -1)
    }
    // 旋到朝向、平移到群中心
    P.set(center.x + x * ch + z * sh, center.y + y, center.z - x * sh + z * ch)
    qy.setFromAxisAngle(V(0, 1, 0), heading + yaw - (mite ? 0 : B.yaw[i]))
    q.copy(qy).multiply(B.quat[i])
    m4.compose(P, q, sv.set(k, k, k)); im.setMatrixAt(i, m4)
  }
  im.instanceMatrix.needsUpdate = true
  im.computeBoundingSphere()
}

/** 符文蛛巢：网上符文缓慢呼吸（与蛛形纲符文同频） */
export function breatheRuneNest(nest: THREE.Object3D, t: number) {
  nest.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined; if (o.userData.rune && m?.emissive) { m.userData.base ??= m.emissive.clone(); m.emissive.copy(m.userData.base).multiplyScalar(1 + 0.35 * Math.sin(TAU * t / 2.4)) } })
}
