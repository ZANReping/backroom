// 死亡飞蛾（Entity 4）重制——第 2 阶段：骨骼动画。
// 只驱动 deathmothMesh 的骨架（userData.mothRig），不含 AI。每个片段是 t（秒）→ 姿态的纯函数，可任意时刻采样、可两两混合。
//
// 片段：
//   雄 / 雌：fly 巡航拍翅 | hover 悬停（足前伸）| dive 俯冲（翅后收、头下压、足张开抓握）| bite 贴身撕咬（雌：颚开合 + 头部前戳）
//            spray 喷腐蚀液（雌：腹部前卷到胸下，脉冲喷射）| feed 落地吸食（雄：翅收成屋脊状，针状口器伸直点地）
//            perch 停歇（翅收拢、触角抽动）| lay 产卵（雌：腹末下弯，产卵器伸缩）| death 死亡（翅下垂、六足蜷缩）
//   禁卫级：idle 待机（缓慢扇翅散布信息素）| walk 八足交替四足步态 | run 疾行（压低身体）| rear 立起威吓（前两对足抬起张开、颚张开、翅外展）
//            stab 附肢穿刺（立起后前足向前下猛刺两次）| spray 喷腐蚀液（腹部前卷）| frenzy 释放狂暴信息素（翅高频震颤）
//            drag 拖走猎物（倒退、前足合抱）| death 死亡（八足向上蜷缩、身体落地）
//   幼虫：crawl 体节波状爬行 | chew 啃食（头部上下锯咬）| curl 蜷成刺球 | burrow 钻进巢壁（头下压前顶）| death 死亡（翻身蜷曲）
//
// API：
//   sampleMoth(grp, clip, t, opts) → MothPose     采样一个片段
//   applyMothPose(grp, pose)                       写回骨骼
//   poseMoth(grp, clip, t, opts)                   = 采样 + 写回
//   mixMothPose(a, b, w)                           两个姿态混合（四元数 slerp、位移 lerp）
//   MOTH_CLIPS[form]                               每种形态的片段表（时长、是否循环）
import * as THREE from 'three'
import type { MothForm } from '../entities/types'
import { prepareMothGeometry, type MothRig } from './deathmothMesh'

type V3 = THREE.Vector3
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const TAU = Math.PI * 2
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
const smooth = (a: number, b: number, t: number) => { const k = clamp01((t - a) / (b - a)); return k * k * (3 - 2 * k) }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export type FlyerClip = 'fly' | 'hover' | 'dive' | 'bite' | 'spray' | 'feed' | 'perch' | 'lay' | 'death'
export type GuardClip = 'idle' | 'walk' | 'run' | 'rear' | 'stab' | 'spray' | 'frenzy' | 'drag' | 'death'
export type LarvaClip = 'crawl' | 'chew' | 'curl' | 'burrow' | 'death'
export type MothClip = FlyerClip | GuardClip | LarvaClip
export interface ClipInfo { len: number; loop: boolean }
export const MOTH_CLIPS: Record<MothForm, Record<string, ClipInfo>> = {
  male: { fly: { len: 1, loop: true }, hover: { len: 1, loop: true }, dive: { len: 0.6, loop: false }, bite: { len: 0.8, loop: true }, feed: { len: 2.4, loop: true }, perch: { len: 3, loop: true }, death: { len: 1.4, loop: false } },
  female: { fly: { len: 1, loop: true }, hover: { len: 1, loop: true }, dive: { len: 0.6, loop: false }, bite: { len: 0.8, loop: true }, spray: { len: 1.2, loop: false }, perch: { len: 3, loop: true }, lay: { len: 2.4, loop: true }, death: { len: 1.4, loop: false } },
  guard: { idle: { len: 4, loop: true }, walk: { len: 1.1, loop: true }, run: { len: 0.6, loop: true }, rear: { len: 1.2, loop: false }, stab: { len: 1.1, loop: false }, spray: { len: 1.3, loop: false }, frenzy: { len: 2, loop: true }, drag: { len: 1.6, loop: true }, death: { len: 1.8, loop: false } },
  larva: { crawl: { len: 1.4, loop: true }, chew: { len: 1.2, loop: true }, curl: { len: 0.9, loop: false }, burrow: { len: 2.5, loop: false }, death: { len: 1.2, loop: false } },
}

/** 姿态：每根骨骼一个局部旋转 + 相对静止位置的位移 */
export interface MothPose { form: MothForm; q: THREE.Quaternion[]; dp: V3[] }
export interface MothAnimOpts {
  /** 移动速度（m/s，仅影响步态频率/步幅；飞行片段影响拍翅幅度） */
  speed?: number
  /** 个体相位偏移（同一群飞蛾不同步） */
  phase?: number
}

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4()
function rigOf(grp: THREE.Object3D): MothRig { const r = grp.userData.mothRig as MothRig | undefined; if (!r) throw Error('not a deathmoth mesh'); return r }

/** 姿态写入器：按骨骼名设置欧拉角（XYZ）/ 位移 */
class Poser {
  q: THREE.Quaternion[]; dp: V3[]; idx: Record<string, number>; form: MothForm
  constructor(form: MothForm, names: string[]) { this.form = form; this.q = names.map(() => new THREE.Quaternion()); this.dp = names.map(() => V(0, 0, 0)); this.idx = Object.fromEntries(names.map((n, i) => [n, i])) }
  has(n: string) { return n in this.idx }
  rot(n: string, x: number, y: number, z: number) { const i = this.idx[n]; if (i === undefined) return; this.q[i].multiply(_q.setFromEuler(_e.set(x, y, z))) }
  setQ(n: string, q: THREE.Quaternion) { const i = this.idx[n]; if (i !== undefined) this.q[i].copy(q) }
  move(n: string, x: number, y: number, z: number) { const i = this.idx[n]; if (i !== undefined) this.dp[i].add(V(x, y, z)) }
  pose(): MothPose { return { form: this.form, q: this.q, dp: this.dp } }
}

// ---------------------------------------------------------------------------
// 雄 / 雌
// ---------------------------------------------------------------------------
function flyer(P: Poser, clip: FlyerClip, t: number, o: MothAnimOpts) {
  const fem = P.form === 'female', ph = o.phase ?? 0, sp = o.speed ?? 1
  const hz = fem ? 7 : 8.5 // 拍翅频率（视觉；真实蛾类更快，这里取可读的节奏）
  let flapAmp = 0.95 + Math.min(1, sp / 3) * 0.12, flapBias = 0.12, flapHz = hz, fold = 0, sweep = 0
  let bodyPitch = 0, bodyRoll = 0, bob = 0, headPitch = 0, jaw = 0, abdCurl = 0, legReach = 0, legCurl = 0, prob = 0, antTwitch = 1
  const beat = (t + ph) * flapHz * TAU
  switch (clip) {
    case 'fly':
      bodyPitch = -0.08 + Math.sin(beat) * 0.04; bob = -Math.sin(beat) * 0.006; abdCurl = Math.sin(beat - 0.6) * 0.06; legCurl = 0.25
      bodyRoll = Math.sin((t + ph) * 1.3) * 0.12
      break
    case 'hover':
      flapHz = hz * 1.25; flapAmp = 0.8; flapBias = 0.25; bodyPitch = 0.35; bob = -Math.sin(beat) * 0.004; legReach = 0.7; abdCurl = 0.15 + Math.sin(beat) * 0.04
      break
    case 'dive': { // 0–0.25s 收翅前倾，之后保持俯冲；足张开、颚张开
      const k = smooth(0, 0.25, t)
      flapAmp = lerp(0.9, 0.12, k); flapBias = lerp(0.12, -0.15, k); sweep = 0.7 * k; bodyPitch = -0.7 * k; headPitch = -0.2 * k
      legReach = 1.0 * k; jaw = fem ? 0.9 * k : 0; abdCurl = -0.15 * k; prob = fem ? 0 : 0.6 * k
      break
    }
    case 'bite': { // 贴在猎物身上：翅半拍保持平衡，头部 2 次前戳，雌性颚开合、雄性针刺
      flapHz = hz * 0.8; flapAmp = 0.45; flapBias = 0.3; bodyPitch = 0.25; legReach = 0.9
      const c = ((t + ph) % 0.8) / 0.8, jab = Math.sin(clamp01(c / 0.35) * Math.PI)
      headPitch = -0.35 * jab; jaw = fem ? 0.2 + 0.8 * (1 - jab) : 0; prob = fem ? 0 : 0.5 + 0.5 * jab
      bob = 0.006 * jab
      break
    }
    case 'spray': { // 雌：腹部前卷到胸下（腐蚀腺对准前方），0.55s 喷一次脉冲
      const k = smooth(0, 0.35, t) * (1 - smooth(0.95, 1.2, t))
      flapHz = hz * 1.15; flapAmp = 0.7; flapBias = 0.2; bodyPitch = 0.2 * k
      abdCurl = 1.25 * k + Math.max(0, Math.sin(clamp01((t - 0.45) / 0.3) * Math.PI)) * 0.18; legReach = 0.4 * k
      break
    }
    case 'feed': { // 雄：落地吸食。翅收成屋脊，口器伸直、上下点刺
      flapAmp = 0; fold = 1; legReach = 0.2; bodyPitch = -0.12
      prob = 0.85 + Math.sin((t + ph) * 2.6) * 0.12; headPitch = -0.15 + Math.sin((t + ph) * 2.6) * 0.06
      abdCurl = Math.sin((t + ph) * 1.4) * 0.05 // 腹部吞咽起伏
      break
    }
    case 'perch':
      flapAmp = 0; fold = 1; legReach = 0.2; bodyPitch = -0.05; antTwitch = 1.8
      // 偶尔抖翅一下
      { const c = ((t + ph) % 3) / 3; if (c > 0.82) { fold = 1 - Math.sin((c - 0.82) / 0.18 * Math.PI) * 0.6 } }
      break
    case 'lay': { // 雌：伏在巢壁上，腹末下弯、产卵器伸缩
      flapAmp = 0; fold = 0.8; legReach = 0.25
      const c = ((t + ph) % 2.4) / 2.4
      abdCurl = -0.35 - 0.25 * Math.sin(c * TAU); bodyPitch = -0.08
      break
    }
    case 'death': { // 翅下垂抖动后停住、六足向内蜷缩、身体翻滚（高度由渲染层处理）
      const k = smooth(0, 1.0, t)
      flapAmp = 0.5 * (1 - k); flapHz = hz * 1.6; flapBias = lerp(0.1, -0.55, k); legCurl = 1.2 * k; bodyRoll = 2.6 * smooth(0.2, 1.2, t)
      headPitch = -0.3 * k; abdCurl = 0.4 * k; antTwitch = 1 - k
      break
    }
  }
  P.rot('thorax', bodyRoll, 0, bodyPitch); P.move('thorax', 0, bob, 0)
  P.rot('head', 0, Math.sin((t + ph) * 1.7) * 0.05 * antTwitch, headPitch)
  // 腹部：三节同向累加
  for (const [n, k] of [['abd0', 0.25], ['abd1', 0.35], ['abd2', 0.4]] as const) P.rot(n, 0, Math.sin((t + ph) * 1.1) * 0.03, -abdCurl * k * (abdCurl > 0 ? 1.4 : 1))
  // 触角
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R', tw = antTwitch
    P.rot(`ant${L}`, s * Math.sin((t + ph) * 3.1 + s) * 0.08 * tw, s * (0.05 + Math.sin((t + ph) * 2.3 + s * 0.7) * 0.07 * tw), Math.sin((t + ph) * 2.7 + s) * 0.08 * tw - (clip === 'dive' ? 0.5 : 0))
    P.rot(`ant${L}1`, 0, s * Math.sin((t + ph) * 4.1 + s) * 0.1 * tw, Math.sin((t + ph) * 3.6) * 0.12 * tw)
    P.rot(`jaw${L}`, 0, s * jaw * 0.55, 0)
  }
  P.rot('proboscis', 0, 0, -prob * 1.1) // 口器从盘卷前伸（绕 Z 向下摆直）
  // 翅：前翅领先，后翅滞后 0.35 rad；翅尖骨额外延迟弯折。fold=1 时绕 Y 后收成屋脊（前翅盖住后翅）
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R'
    for (const [pair, lag, k] of [['F', 0, 1], ['H', 0.35, 0.92]] as const) {
      const flap = (flapBias + Math.sin(beat - lag) * flapAmp) * k * (1 - fold)
      const tipFlex = Math.sin(beat - lag - 0.9) * 0.28 * flapAmp * (1 - fold)
      const back = (sweep + fold * (pair === 'F' ? 1.3 : 1.2)) // 后收（绕 Y）
      const roof = fold * 0.6 // 屋脊下压
      P.rot(`wing${pair}${L}`, -s * flap - s * roof, -s * back, 0)
      P.rot(`wing${pair}${L}1`, -s * tipFlex, 0, 0)
    }
  }
  // 足：飞行时下垂收拢；reach 向前张开（抓握）；curl 向内蜷
  for (const s of [1, -1]) for (let i = 0; i < 3; i++) {
    const n = `leg${s > 0 ? 'L' : 'R'}${i}`, sw = Math.sin((t + ph) * 2.2 + i + s) * 0.06
    P.rot(n + '_f', s * (0.15 * legReach) + sw, 0, legReach * (0.9 - i * 0.25) - legCurl * 0.4)
    P.rot(n + '_t', 0, 0, -legReach * 0.5 + legCurl * 1.1)
    P.rot(n + '_s', 0, 0, legCurl * 0.8 - legReach * 0.2)
  }
}

// ---------------------------------------------------------------------------
// 禁卫级：八足解析 IK
// ---------------------------------------------------------------------------
interface GuardLeg { f: string; t: string; s: string; H: V3; K: V3; A: V3; F: V3; side: 1 | -1; i: number }
let GUARD_LEGS: GuardLeg[] | null = null, GUARD_THX: V3 | null = null
function guardLegs() {
  if (GUARD_LEGS) return GUARD_LEGS
  const g = prepareMothGeometry('guard'), R = g.rig
  const at = (n: string) => R.rest[R.names.indexOf(n)].clone()
  GUARD_THX = at('thorax')
  GUARD_LEGS = []
  for (const s of [1, -1] as const) for (let i = 0; i < 4; i++) {
    const n = `leg${s > 0 ? 'L' : 'R'}${i}`
    GUARD_LEGS.push({ f: n + '_f', t: n + '_t', s: n + '_s', H: at(n + '_f'), K: at(n + '_t'), A: at(n + '_s'), F: at(n + '_e'), side: s, i })
  }
  return GUARD_LEGS
}
const _a = V(0, 0, 0), _b = V(0, 0, 0), _c = V(0, 0, 0), _d = V(0, 0, 0), _qi = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion()
/** 把一条腿的踝点（模型空间）解算到 f/t/s 三根骨骼：thorax 的模型空间变换由 (thxPos, thxQ) 给出 */
function solveLeg(P: Poser, L: GuardLeg, ankleM: V3, footM: V3, thxPos: V3, thxQ: THREE.Quaternion, kneeUp: number) {
  _qi.copy(thxQ).invert()
  const thx0 = GUARD_THX!
  // 胸节局部（以胸节静止位置为原点的静止坐标系）
  const H = L.H.clone().sub(thx0)
  const A = ankleM.clone().sub(thxPos).applyQuaternion(_qi)
  const Fp = footM.clone().sub(thxPos).applyQuaternion(_qi)
  const a = L.K.distanceTo(L.H), b = L.A.distanceTo(L.K)
  const d = A.clone().sub(H), dl = THREE.MathUtils.clamp(d.length(), Math.abs(a - b) + 1e-4, a + b - 1e-4)
  const dn = d.normalize()
  const along = (a * a - b * b + dl * dl) / (2 * dl), h = Math.sqrt(Math.max(0, a * a - along * along))
  const out = V(L.F.x - L.H.x, 0, L.F.z - L.H.z).normalize()
  const pole = V(0, 1, 0).addScaledVector(out, 0.1 - kneeUp * 0.4).normalize()
  pole.addScaledVector(dn, -pole.dot(dn)).normalize()
  const K = H.clone().addScaledVector(dn, along).addScaledVector(pole, h)
  const Ae = H.clone().addScaledVector(dn, dl)
  // 股节
  _a.copy(L.K).sub(L.H).normalize(); _b.copy(K).sub(H).normalize()
  _qa.setFromUnitVectors(_a, _b); P.setQ(L.f, _qa)
  // 胫节（父=股节）
  _c.copy(L.A).sub(L.K).normalize(); _d.copy(Ae).sub(K).normalize().applyQuaternion(_qi.copy(_qa).invert())
  _qb.setFromUnitVectors(_c, _d); P.setQ(L.t, _qb)
  // 跗节：指向足尖目标
  const acc = _qa.clone().multiply(_qb)
  _c.copy(L.F).sub(L.A).normalize(); _d.copy(Fp).sub(Ae).normalize().applyQuaternion(acc.invert())
  P.setQ(L.s, new THREE.Quaternion().setFromUnitVectors(_c, _d))
}

function guard(P: Poser, clip: GuardClip, t: number, o: MothAnimOpts) {
  const legs = guardLegs(), ph = o.phase ?? 0, tt = t + ph
  let pitch = 0, drop = 0, bobA = 0.006, stride = 0, cycle = 1.1, lift = 0.09, frontRaise = 0, frontReach = 0, spread = 0, jaw = 0.1, wingFan = 0.06, wingHz = 0.6, wingOpen = 0, abdCurl = 0, back = 1, deathK = 0, stab = 0, hold = 0, headPitch = 0
  switch (clip) {
    case 'idle': wingFan = 0.08; wingHz = 0.35; jaw = 0.12 + Math.sin(tt * 1.3) * 0.05; break
    case 'walk': stride = 0.22; cycle = 1.1; break
    case 'run': stride = 0.36; cycle = 0.6; drop = 0.06; pitch = -0.12; lift = 0.12; bobA = 0.012; wingOpen = 0.15; break
    case 'rear': { const k = smooth(0, 0.45, t); pitch = 0.55 * k; drop = -0.12 * k; frontRaise = k; spread = k; jaw = 0.1 + 0.9 * k; wingOpen = 0.6 * k; wingFan = 0.15; wingHz = 3; headPitch = 0.2 * k; break }
    case 'stab': { // 立起 0–0.3s，前足 0.4s / 0.75s 两次猛刺
      const k = smooth(0, 0.3, t); pitch = 0.45 * k; drop = -0.08 * k; frontRaise = k; spread = 0.4 * k; jaw = 0.8 * k; wingOpen = 0.4 * k
      const s1 = Math.max(0, Math.sin(clamp01((t - 0.32) / 0.22) * Math.PI)), s2 = Math.max(0, Math.sin(clamp01((t - 0.68) / 0.22) * Math.PI))
      stab = Math.max(s1, s2); headPitch = -0.25 * stab
      break
    }
    case 'spray': { const k = smooth(0, 0.4, t) * (1 - smooth(1.05, 1.3, t)); abdCurl = 1.2 * k + Math.max(0, Math.sin(clamp01((t - 0.5) / 0.35) * Math.PI)) * 0.2; pitch = 0.25 * k; drop = 0.02 * k; jaw = 0.5 * k; break }
    case 'frenzy': wingOpen = 0.55; wingFan = 0.22; wingHz = 11; jaw = 0.5 + Math.sin(tt * 9) * 0.3; pitch = 0.15 + Math.sin(tt * 5) * 0.04; bobA = 0.012; break
    case 'drag': stride = 0.14; cycle = 1.6; back = -1; frontReach = 1; hold = 1; pitch = -0.08; drop = 0.04; jaw = 0.7; break
    case 'death': deathK = smooth(0, 1.4, t); drop = 0.42 * smooth(0.1, 1.2, t); pitch = -0.3 * deathK; jaw = 0.8; wingOpen = -0.3 * deathK; wingFan = 0; break
  }
  const gph = (tt / cycle) % 1
  const bob = Math.abs(Math.sin(gph * TAU * 2)) * bobA * (stride > 0 ? 1 : 0.3) + Math.sin(tt * 1.6) * 0.003
  const thxPos = GUARD_THX!.clone().add(V(0, bob - drop, 0))
  const thxQ = new THREE.Quaternion().setFromEuler(_e.set(0, 0, pitch))
  P.setQ('thorax', thxQ); P.move('thorax', 0, bob - drop, 0)
  P.rot('head', 0, Math.sin(tt * 0.9) * 0.08, headPitch)
  for (const [n, k] of [['abd0', 0.3], ['abd1', 0.35], ['abd2', 0.35]] as const) P.rot(n, 0, Math.sin(tt * 0.8) * 0.03, -abdCurl * k + Math.sin(tt * 1.6) * 0.02)
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R'
    P.rot(`jaw${L}`, 0, s * jaw * 0.6, 0)
    P.rot(`ant${L}`, 0, s * (Math.sin(tt * 1.7 + s) * 0.08), Math.sin(tt * 1.3 + s) * 0.07 - frontRaise * 0.3 - deathK * 0.6)
    P.rot(`ant${L}1`, 0, s * Math.sin(tt * 2.3 + s) * 0.12, Math.sin(tt * 2 + s) * 0.1)
    // 翅：缓慢开合散布信息素；wingOpen 外展（绕自身铰点向外下）
    const fan = Math.sin(tt * wingHz * TAU) * wingFan
    P.rot(`wingF${L}`, s * (wingOpen * 0.7 + fan), -s * wingOpen * 0.4, 0)
    P.rot(`wingH${L}`, s * (wingOpen * 0.5 + fan * 0.8), -s * wingOpen * 0.3, 0)
    P.rot(`wingF${L}1`, s * fan * 0.4, 0, 0); P.rot(`wingH${L}1`, s * fan * 0.4, 0, 0)
  }
  for (const L of legs) {
    // 步态：交替四足（L0 R1 L2 R3 一组），支撑相 60%，摆动相抬脚
    const grp = (L.i + (L.side > 0 ? 0 : 1)) % 2
    const lp = (gph + grp * 0.5 + L.i * 0.04) % 1
    let dx = 0, dy = 0
    if (stride > 0) {
      if (lp < 0.6) dx = (0.5 - lp / 0.6) * stride * back
      else { const k = (lp - 0.6) / 0.4; dx = (-0.5 + k) * stride * back; dy = Math.sin(k * Math.PI) * lift }
    }
    const A = L.A.clone().add(V(dx, dy, 0)), F = L.F.clone().add(V(dx, dy, 0))
    let kneeUp = 0
    const front = L.i <= 1 ? (L.i === 0 ? 1 : 0.7) : 0
    if (front > 0 && (frontRaise > 0 || frontReach > 0)) {
      // 抬起前足：踝点升到胸前上方并外张；stab 时猛向前下刺出
      const out = V(L.F.x, 0, L.F.z).normalize()
      const raised = GUARD_THX!.clone().add(V(0.18 + 0.1 * spread, 0.28 * front + 0.06 * spread, 0)).addScaledVector(out, 0.2 + 0.18 * spread)
      const strike = GUARD_THX!.clone().add(V(0.55, -0.3, 0)).addScaledVector(out, 0.08)
      const hug = GUARD_THX!.clone().add(V(0.32, -0.12, 0)).addScaledVector(out, 0.06) // drag：前足合抱在身前
      let target = A.clone().lerp(raised, frontRaise * front)
      if (stab > 0 && L.i === 0) target.lerp(strike, stab)
      if (hold > 0) target = A.clone().lerp(hug, hold * front)
      A.copy(target); F.copy(target).add(V(0.06, -0.06, 0).addScaledVector(out, 0.03).lerp(V(0.08, -0.1, 0), stab))
      kneeUp = frontRaise * 0.6
    }
    if (deathK > 0) { // 死亡：足尖向身体下方收拢、膝向上蜷
      const c = GUARD_THX!.clone().add(V(0, -0.1, 0))
      A.lerp(c.clone().addScaledVector(V(L.F.x, 0, L.F.z).normalize(), 0.18), deathK * 0.85); F.lerp(c, deathK * 0.7)
      kneeUp = -deathK
    }
    solveLeg(P, L, A, F, thxPos, thxQ, kneeUp)
  }
}

// ---------------------------------------------------------------------------
// 幼虫
// ---------------------------------------------------------------------------
function larva(P: Poser, clip: LarvaClip, t: number, o: MothAnimOpts) {
  const ph = o.phase ?? 0, tt = t + ph, N = 11
  let waveA = 0.12, waveHz = 1 / 1.4, curl = 0, headNod = 0, headDip = 0, roll = 0, lift = 0, push = 0, yaw = 0.05
  switch (clip) {
    case 'crawl': waveA = 0.16 * Math.min(1.5, Math.max(0.6, (o.speed ?? 0.2) / 0.2)); break
    case 'chew': waveA = 0.03; headNod = Math.sin(tt * 9) * 0.22; headDip = -0.25; yaw = 0.02; break
    case 'curl': { const k = smooth(0, 0.6, t); curl = k; waveA = 0.12 * (1 - k); lift = 0.016 * k; break }
    case 'burrow': { const k = smooth(0, 2.2, t); headDip = -0.7 * smooth(0, 0.6, t); push = 0.06 * k; waveA = 0.2; waveHz = 1.6; break }
    case 'death': { const k = smooth(0, 1, t); curl = 0.7 * k; roll = Math.PI * 0.9 * smooth(0.1, 0.8, t); waveA = 0.25 * (1 - k); waveHz = 4; lift = 0.012 * k; break }
  }
  // 体节：沿体长的行波（拱起 = 绕 Z），并略带左右摆（绕 Y）；蜷球：每节均匀弯曲（总计约 2π·0.9，头尾相接）
  for (let k = 0; k < N; k++) {
    const w = Math.sin(tt * waveHz * TAU - k * 0.75) * waveA
    const c = curl * (k === 0 ? 0 : (TAU * 0.88) / (N - 1))
    P.rot(`seg${k}`, k === 0 ? roll : 0, Math.sin(tt * 0.9 - k * 0.5) * yaw, (k === 0 ? 0 : w * 0.6 + c))
    if (k > 0) P.move(`seg${k}`, Math.max(0, w) * 0.004, 0, 0) // 收缩波：体节间距随波动变化
  }
  P.move('seg0', push, lift + Math.max(0, Math.sin(tt * waveHz * TAU)) * waveA * 0.006, 0)
  P.rot('seg0', 0, 0, -curl * 0.9 + headDip * 0.4) // 蜷球时头向下内收
  P.rot('head', 0, 0, headNod + headDip * 0.6 - curl * 0.5)
}

// ---------------------------------------------------------------------------
// 对外接口
// ---------------------------------------------------------------------------
export function sampleMoth(grp: THREE.Object3D, clip: MothClip, t: number, opts: MothAnimOpts = {}): MothPose {
  const rig = rigOf(grp), names = rig.bones.map((b) => b.name)
  const P = new Poser(rig.form, names)
  const info = MOTH_CLIPS[rig.form][clip]
  const tt = info ? (info.loop ? t : Math.min(t, info.len)) : t
  if (rig.form === 'guard') guard(P, clip as GuardClip, tt, opts)
  else if (rig.form === 'larva') larva(P, clip as LarvaClip, tt, opts)
  else flyer(P, clip as FlyerClip, tt, opts)
  return P.pose()
}
export function applyMothPose(grp: THREE.Object3D, pose: MothPose) {
  const rig = rigOf(grp)
  rig.bones.forEach((b, i) => { b.quaternion.copy(pose.q[i]); b.position.copy(rig.rest[i]).add(pose.dp[i]) })
}
export function poseMoth(grp: THREE.Object3D, clip: MothClip, t: number, opts: MothAnimOpts = {}) { const p = sampleMoth(grp, clip, t, opts); applyMothPose(grp, p); return p }
export function mixMothPose(a: MothPose, b: MothPose, w: number): MothPose {
  return { form: a.form, q: a.q.map((q, i) => q.clone().slerp(b.q[i], w)), dp: a.dp.map((d, i) => d.clone().lerp(b.dp[i], w)) }
}
/** 当前姿态下某根骨骼的模型空间位置（验收与 AI 用：如颚尖、腐蚀腺、足尖） */
export function mothBoneWorld(grp: THREE.Object3D, name: string, out = V(0, 0, 0)) {
  const rig = rigOf(grp); const b = rig.byName[name]; if (!b) return null
  grp.updateMatrixWorld(true); _m.copy(b.matrixWorld); return out.setFromMatrixPosition(_m)
}
