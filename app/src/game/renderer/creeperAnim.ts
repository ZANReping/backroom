// 爬菌（Entity 17）重制·阶段 2：程序化动画（只驱动 creeperMesh 的模型，不含 AI / 机制）。
// 范式同 ferrenAnim / facelingAnim：animateCreeper(mesh, clip, t, stage) 无状态——每次调用都从静止姿态重新求值，
// 预览可以任意顺序逐帧渲染，游戏里每帧按 AI 状态调用即可。只转关节层级，不做网格变形。
//
// 支持三类对象（按 userData 自动识别）：
//   感染宿主  buildInfectedRat / buildInfectedArachnid（1–4 阶）：idle 待机 · walk 行走 · twitch 偶发抽搐 · attack 扑咬 · death 死亡
//             阶段越高越迟缓：步频随阶段降低（CREEP_MOTION.rate），关节越来越僵（膝几乎不弯）、各腿相位越来越乱、
//             步子一顿一顿；2 阶起每个行走循环里有一段拖着一条后腿走。attack 阶段越高前摇越长、扑得越远越狠。
//             death 倒地后绒球微微鼓胀（私有 uniform，见 creepUniforms）。尸鼠直接转 ratRig 关节；蛛形纲复用 arachnidAnim
//             的步态 / 扑咬 / 死亡（脚底锁定的 IK），再叠加时间缩放、僵硬、相位错乱、拖腿和抽搐。
//   爬菌人    buildCreeperHuman：crawl 双手交替爬行（落点两骨 IK 贴地、支撑相手掌在地上锁定、爪钩地）· idle 伏地、头像鸟一样
//             一顿一顿地转、抽搐 · lunge 扑击 · scream 尖叫（下颌张到最大）· death 死亡。脊骨与筋肉丝挂在 tail 关节上反向转回，
//             末端留在地上被拖着走。全身余烬在着色器里按噪声明灭（CREEP_TIME），动作只改整体强度。
//   第一人称手 creepHandOverlay(hand) 的 group：handTwitch（3、4 阶手指不受控地抽动 / 痉挛）。只做接口与预览，不接机制。
//
// 绒球的呼吸缩放、余烬明灭都在材质里按全局 uniform 计算（creeperMesh.setCreepTime），不逐个改实例矩阵；渲染层每帧调用一次 setCreepTime。
import * as THREE from 'three'
import { CREEP_STAGES, CREEP_CLAW_HAND_POSE, creepUniforms, type CreepStage, type CreeperRig, type CreepHandOverlay } from './creeperMesh'
import type { RatRig } from './ratMesh'
import type { ArachnidRig } from './arachnidMesh'
import { sampleArachnid, applyArachnidPose, arachnidGaitSpeed, ARACHNID_CLIPS } from './arachnidAnim'
import type { RetroHand, HandPose } from './retroViewHand'

export type CreeperHostClip = 'idle' | 'walk' | 'twitch' | 'attack' | 'death'
export type CreeperHumanClip = 'crawl' | 'idle' | 'lunge' | 'scream' | 'death'
export type CreeperHandClip = 'handTwitch' | 'idle'
export type CreeperClip = CreeperHostClip | CreeperHumanClip | CreeperHandClip
export interface CreeperClipInfo {
  /** 一个循环（或一次）的时长 s（宿主为 1 阶数值，按阶段的实际值用 creeperClipInfo 取） */
  dur: number; loop: boolean; zh: string
  /** 命中时刻 s（AI 结算伤害用） */
  hit?: number
  /** 移动速度：爬菌人为 m/s；宿主为相对该物种正常步行速度的倍数 */
  speed?: number
}
/** 片段表：host = 感染宿主（尸鼠 / 蛛形纲），human = 爬菌人，hand = 第一人称手 */
export const CREEPER_CLIPS = {
  host: {
    idle: { dur: 4, loop: true, zh: '待机：低头僵立、颤抖，偶尔一抽' },
    walk: { dur: 2.4, loop: true, zh: '行走：僵硬、相位错乱、一顿一顿，2 阶起偶尔拖腿（一个循环 = 4 步）', speed: 1 },
    twitch: { dur: 1.4, loop: false, zh: '偶发抽搐：身体与四肢猛地一阵痉挛' },
    attack: { dur: 1.0, loop: false, zh: '扑咬：阶段越高前摇越长、越狠', hit: 0.45 },
    death: { dur: 2.8, loop: false, zh: '死亡：抽搐、翻倒，绒球随后微微鼓胀' },
  } satisfies Record<CreeperHostClip, CreeperClipInfo>,
  human: {
    crawl: { dur: 1.6, loop: true, zh: '双手交替爬行，拖着身体、脊骨与筋肉丝在地上拖', speed: 0.22 },
    idle: { dur: 5, loop: true, zh: '伏地：头像鸟一样一顿一顿地转动，抽搐' },
    lunge: { dur: 1.5, loop: false, zh: '扑击（阶段 3 起带根位移：整只往前扑出 0.6 m，见 creeperLungeRoot；命中 = 双手拍地）', hit: 0.9 },
    scream: { dur: 2.2, loop: false, zh: '尖叫：下颌张到最大，余烬变亮' },
    death: { dur: 2.6, loop: false, zh: '死亡：抽搐后瘫倒，余烬熄灭，绒球微微鼓胀' },
  } satisfies Record<CreeperHumanClip, CreeperClipInfo>,
  hand: {
    handTwitch: { dur: 2.4, loop: true, zh: '手指不受控地抽动 / 痉挛（3、4 阶）' },
    idle: { dur: 1, loop: true, zh: '不抽动（只叠加阶段对应的空手姿势）' },
  } satisfies Record<CreeperHandClip, CreeperClipInfo>,
}

/**
 * 各阶段的运动参数（宿主）：rate 步频倍率 · stiff 关节僵硬（0–1）· chaos 相位错乱 / 顿挫 · drag 拖腿强度 ·
 * windup 扑咬前摇 s · fury 扑咬力度倍率 · twitch 抽搐强度。0 阶 = 未感染（同 1 阶以下的正常动物，供对比）。
 */
export const CREEP_MOTION = [
  { rate: 1, stiff: 0, chaos: 0, drag: 0, windup: 0.25, fury: 1, twitch: 0 },
  { rate: 0.88, stiff: 0.15, chaos: 0.06, drag: 0, windup: 0.35, fury: 1.1, twitch: 0.3 },
  { rate: 0.74, stiff: 0.38, chaos: 0.14, drag: 0.45, windup: 0.5, fury: 1.25, twitch: 0.5 },
  { rate: 0.6, stiff: 0.62, chaos: 0.24, drag: 0.75, windup: 0.7, fury: 1.45, twitch: 0.75 },
  { rate: 0.48, stiff: 0.85, chaos: 0.34, drag: 1, windup: 0.95, fury: 1.7, twitch: 1 },
] as const

/**
 * 阶段 3：
 *  · CREEP_WALK_NATURAL：walk 片段在推进率 1 时「脚不打滑」对应的移动速度（m/s，再乘 creeperClipInfo(...).speed）。渲染层按实际速度 / 这个值同步片段推进率。
 *  · 拖腿脚底锁定（stick-slip）：被拖的那条后腿每步的前 75% 跟着地面往后留（髋角按「步长 / 腿长」增大），最后 25% 被一把拽回去——
 *    不再是整条腿僵在身后跟着身体平移（滑步）。步长 = 自然速度 × 每步时长。
 *  · CREEP_LUNGE：爬菌人 lunge 的根位移曲线（与 engine/creeperAI.creeperLungeRoot 同一条：前摇 0.55 s 后到 1.15 s 平滑走完 0.6 m）。
 *    片段内的身体 / 手按「世界里往前扑、落地后停在前方」求出，再减去根位移——AI 把实体往前挪多少，身体就相对根少走多少。
 */
export const CREEP_WALK_NATURAL = { rat: 0.16, spider: 0.22 }
export const CREEP_LUNGE = { W: 0.55, E: 1.15, dist: 0.6 }
export function creeperLungeRoot(t: number) { const k = Math.min(1, Math.max(0, (t - CREEP_LUNGE.W) / (CREEP_LUNGE.E - CREEP_LUNGE.W))); return CREEP_LUNGE.dist * k * k * (3 - 2 * k) }
/** 拖腿锁定的锯齿：0→1 跟着地面往后留，最后一段 0 ← 1 被拽回 */
const slipSaw = (f: number) => f < 0.75 ? f / 0.75 : 1 - (f - 0.75) / 0.25
const RAT_STEP = 0.6 // 尸鼠正常步行一个步态周期 s（ratMesh.animateRat 约 0.57 s）
const SPIDER_STEP = 0.8
/** 按阶段求片段的实际时长 / 命中时刻 / 速度（宿主的 walk 速度为相对正常步行速度的倍数） */
export function creeperClipInfo(kind: 'host' | 'human' | 'hand', clip: CreeperClip, stage: CreepStage = 1, opts: { spider?: boolean } = {}): CreeperClipInfo {
  const base = (CREEPER_CLIPS[kind] as Record<string, CreeperClipInfo>)[clip]
  if (!base) throw Error(`creeper: no clip ${kind}.${clip}`)
  if (kind !== 'host') return base
  const M = CREEP_MOTION[stage]
  if (clip === 'walk') return { ...base, dur: (4 * (opts.spider ? SPIDER_STEP : RAT_STEP)) / M.rate, speed: M.rate * (1 - 0.3 * M.stiff) }
  if (clip === 'idle') return { ...base, dur: opts.spider ? 4 / M.rate : 4 }
  if (clip === 'attack') { const S = 0.14 / Math.sqrt(M.fury); return { ...base, dur: M.windup + S + 0.6, hit: M.windup + S * 0.8 } }
  return base
}

// ============================================================================
// 小工具
// ============================================================================
const TAU = Math.PI * 2
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const ease = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t) }
const seg = (t: number, a: number, b: number) => ease((t - a) / (b - a))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const fract = (x: number) => x - Math.floor(x)
const hash = (n: number) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453)
const hs = (n: number) => hash(n) * 2 - 1
/** 一次性片段的进出包络 */
const envelope = (t: number, a: number, b: number, dur: number) => seg(t, 0, a) * (1 - seg(t, dur - b, dur))
/**
 * 抽搐脉冲：每个 dur 周期里 n 次，时刻随机；每次是一个极快上冲、约 70 ms 衰减的尖峰，方向随机（-1..1）。周期性 → 循环片段无缝。
 */
function jerk(t: number, dur: number, n: number, seed: number, decay = 0.07) {
  if (n <= 0) return 0
  const u = fract(t / dur) * n, i = Math.floor(u), loc = u - i
  let v = 0
  for (const k of [i, i - 1]) { // 上一个窗口的尾巴也算进来
    const kk = ((k % n) + n) % n
    const e = 0.1 + 0.65 * hash(kk * 7.3 + seed * 13.1), dt = ((k === i ? loc : loc + 1) - e) * dur / n
    if (dt > 0) v += Math.exp(-dt / decay) * (1 - Math.exp(-dt / 0.012)) * (hash(kk * 3.1 + seed * 5.7) < 0.5 ? -1 : 1) * (0.6 + 0.4 * hash(kk + seed * 2.3))
  }
  return v
}
/** 持续的细颤（多频正弦叠加，高阶更明显） */
const tremor = (t: number, seed: number) => Math.sin(t * 37 + seed) * 0.5 + Math.sin(t * 53 + seed * 2.1) * 0.3 + Math.sin(t * 71 + seed * 0.7) * 0.2

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3()
const _m = new THREE.Matrix4()
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1)

/** 宿主的绒球鼓胀：只有需要时才换私有材质（死亡）；其余片段若已换过就复位 */
function setPuff(root: THREE.Object3D, k: number) {
  if (k !== 1) creepUniforms(root).puff.value = k
  else if (root.userData.creepU) (root.userData.creepU as { puff: { value: number } }).puff.value = 1
}

// ============================================================================
// 入口
// ============================================================================
export interface CreeperAnimOpts {
  /** 个体随机种子（抽搐时刻、拖哪条腿）。缺省取 userData.creep.seed */
  seed?: number
  /** 第一人称手：游戏当前的空手 / 握持姿势（缺省：4 阶爪形空手，其余握拳） */
  base?: HandPose
}
/**
 * 无状态动画：把 mesh 摆成片段 clip 在 t 秒时的姿态。stage = 感染阶段（宿主 1–4、第一人称手 0–4；爬菌人忽略）。
 * mesh：buildInfectedRat / buildInfectedArachnid 的返回组、buildCreeperHuman 的返回组、或 creepHandOverlay(...).group。
 */
export function animateCreeper(mesh: THREE.Object3D, clip: CreeperClip, t: number, stage: CreepStage = 1, opts: CreeperAnimOpts = {}) {
  const ud = mesh.userData
  const seed = opts.seed ?? (ud.creep?.seed as number | undefined) ?? 0
  if (ud.creeperHuman) return animateHuman(mesh, ud.creeperHuman.rig as CreeperRig, clip as CreeperHumanClip, t)
  if (ud.creepHand) { const h = ud.creepHand as { hand: RetroHand; overlay: CreepHandOverlay }; return animateCreepHand(h.hand, h.overlay, clip as CreeperHandClip, t, stage, opts.base, seed) }
  if (ud.ratRig) return animateRatHost(mesh, ud.ratRig as RatRig, clip as CreeperHostClip, t, stage, seed)
  if (ud.arachnidRig) return animateSpiderHost(mesh, clip as CreeperHostClip, t, stage, seed)
  throw Error('animateCreeper: unsupported mesh')
}

// ============================================================================
// 尸鼠宿主（ratRig：body.rotation.z + = 前身抬起；hip/knee.rotation.z；head.rotation.z + = 抬头、.y 偏航、.x 歪头；jaw.rotation.z − = 张嘴）
// ============================================================================
const RAT_REST = new WeakMap<RatRig, { rootP: THREE.Vector3; rootR: THREE.Euler; bodyP: THREE.Vector3; bodyS: THREE.Vector3 }>()
function animateRatHost(grp: THREE.Object3D, r: RatRig, clip: CreeperHostClip, t: number, stage: CreepStage, seed: number) {
  let rest = RAT_REST.get(r)
  if (!rest) { rest = { rootP: r.root.position.clone(), rootR: r.root.rotation.clone(), bodyP: r.body.position.clone(), bodyS: r.body.scale.clone() }; RAT_REST.set(r, rest) }
  const M = CREEP_MOTION[stage], k = CREEP_STAGES[stage].stiff, sh = CREEP_STAGES[stage].shrink, sz = r.scale
  const info = creeperClipInfo('host', clip, stage)
  // 复位到「阶段 1 的僵硬静止姿态」（同 poseCreepRat）
  r.root.position.copy(rest.rootP); r.root.rotation.copy(rest.rootR)
  r.body.position.copy(rest.bodyP); r.body.rotation.set(0, 0, 0)
  r.body.scale.set(rest.bodyS.x, rest.bodyS.y * (1 - sh * 0.6), rest.bodyS.z * (1 - sh))
  const hip0 = (L: RatRig['legs'][number]) => (L.front ? 0.35 : -0.3) * k, knee0 = (L: RatRig['legs'][number]) => (L.front ? -0.25 : 0.35) * k
  r.legs.forEach((L) => { L.hip.rotation.set(L.side * 0.35 * k, 0, hip0(L)); L.knee.rotation.set(0, 0, knee0(L)) })
  r.head.rotation.set(0.45 * k, 0.15 * k, 0.3 * k)
  r.jaw.rotation.set(0, 0, -0.35 * k)
  r.tail.forEach((tl) => tl.rotation.set(0, 0.1 * k, 0.25 * k))
  const dragLeg = r.legs.findIndex((L) => !L.front && (L.side > 0) === (hash(seed + 0.5) < 0.5))
  let puff = 1
  switch (clip) {
    case 'idle': {
      const u = t / 4
      r.body.scale.y *= 1 + 0.025 * Math.sin(u * TAU * 3) // 呼吸（4 s 三次，慢而浅）
      r.body.rotation.z += -0.04 * k + 0.02 * Math.sin(u * TAU)
      r.head.rotation.z += -0.18 * k + 0.08 * Math.sin(u * TAU + 0.7) // 低头、慢慢晃
      r.head.rotation.y += 0.2 * Math.sin(u * TAU) * (1 - 0.5 * k)
      r.head.rotation.x += 0.1 * Math.sin(u * TAU * 2 + 1)
      const tr = tremor(t, seed) * 0.012 * stage, j = jerk(t, 4, 2, seed) * M.twitch
      r.head.rotation.x += tr * 2 + j * 0.45; r.head.rotation.z += j * 0.2
      r.body.rotation.x += tr + j * 0.12
      r.legs.forEach((L, i) => { L.hip.rotation.z += tr * 0.8 + (i === (seed % r.legs.length) ? j * 0.5 : 0) })
      r.jaw.rotation.z += -0.12 * Math.max(0, Math.sin(u * TAU * 2)) * k
      r.tail.forEach((tl, i) => { tl.rotation.y += 0.06 * Math.sin(u * TAU + i * 0.6) * (1 - k) })
      break
    }
    case 'walk': {
      const u = fract(t / info.dur) * 4 // 循环内第几步（0..4）
      // 顿挫：时间扭曲（导数 1 + chaos·cos > 0，单调且整步循环），加一个每步的停顿感
      const p = u + (M.chaos * 0.9 / TAU) * Math.sin(TAU * u) + (M.chaos * 0.4 / (TAU * 2)) * Math.sin(TAU * 2 * u + seed)
      const ph = TAU * p
      const amp = 0.45 * (1 - 0.45 * k), knK = 1 - 0.75 * k
      // 拖腿窗口：一个循环（4 步）里第 1.2–3.4 步之间拖着一条后腿
      const dk = M.drag * seg(u, 1.0, 1.5) * (1 - seg(u, 3.0, 3.5))
      r.legs.forEach((L, i) => {
        const base = L.front ? (L.side < 0 ? 0 : Math.PI) : (L.side < 0 ? Math.PI : 0)
        const off = M.chaos * 2.2 * hs(i * 3.7 + seed) // 各腿相位错乱（不协调）
        const sw = Math.sin(ph + base + off) * amp * (1 + 0.35 * M.chaos * hs(i + seed * 1.3))
        if (L.front) { L.hip.rotation.z += sw * 0.7; L.knee.rotation.z += Math.max(0, -sw) * 0.6 * knK }
        else { L.hip.rotation.z += sw * 0.6; L.knee.rotation.z += Math.max(0, sw) * 0.5 * knK }
        if (i === dragLeg && dk > 0) {
          // 拖着的后腿：僵直地拖在身后、脚背着地，几乎不随步态摆动
          // 阶段 3：脚底锁定——每步前 75% 脚留在地上（髋角随身体前进加大），最后 25% 一把拽回
          const stride = CREEP_WALK_NATURAL.rat * (info.speed ?? 1) * sz * (info.dur / 4), legL = 0.075 * sz
          const lock = Math.min(0.5, stride / legL) * slipSaw(fract(u))
          L.hip.rotation.z = lerp(L.hip.rotation.z, -0.6 - lock, dk); L.knee.rotation.z = lerp(L.knee.rotation.z, 0.1 + 0.25 * lock, dk)
          L.hip.rotation.x = lerp(L.hip.rotation.x, L.side * 0.15, dk)
        }
      })
      const lurch = Math.abs(Math.sin(ph))
      r.body.position.y += (lurch * amp * 0.014 - 0.006 * k) * (1 - 0.4 * dk)
      r.body.rotation.z += 0.05 * Math.sin(ph * 2) * (1 - k) - 0.05 * k
      r.body.rotation.x += 0.06 * Math.sin(ph) * (0.5 + M.chaos) + (dragLeg >= 0 ? r.legs[dragLeg].side * 0.1 * dk : 0) // 拖腿一侧塌下去
      r.root.position.x += -0.004 * dk * Math.sin(ph * 2) * sz
      // 头：迟一拍地耷拉晃动（像没劲的玩偶）
      r.head.rotation.z += -0.1 * k + 0.1 * Math.sin(ph * 2 - 1.2) * (0.4 + k)
      r.head.rotation.x += 0.12 * Math.sin(ph - 1.6) * (0.3 + k)
      r.tail.forEach((tl, i) => { tl.rotation.y += Math.sin(ph - i * 0.8) * 0.14 * (1 - 0.7 * k) })
      const j = jerk(t, info.dur, stage, seed + 11) * M.twitch
      r.head.rotation.x += j * 0.35; r.body.rotation.x += j * 0.08
      r.legs[(seed + 1) % r.legs.length].hip.rotation.z += j * 0.4
      r.jaw.rotation.z += -0.1 * Math.max(0, Math.sin(ph)) * k
      break
    }
    case 'twitch': {
      const env = envelope(t, 0.04, 0.35, info.dur)
      const j1 = jerk(t, info.dur, 5, seed + 3, 0.14), j2 = jerk(t + 0.13, info.dur, 4, seed + 7, 0.12), tr = tremor(t, seed) * 0.06
      const A = (0.9 + 0.7 * M.twitch) * env
      r.body.rotation.x += (j1 * 0.45 + tr) * A; r.body.rotation.z += j2 * 0.25 * A
      r.body.position.y += Math.abs(j1) * 0.012 * A
      r.head.rotation.x += j2 * 0.8 * A; r.head.rotation.z += j1 * 0.5 * A; r.head.rotation.y += tr * 4 * A
      r.jaw.rotation.z -= (0.3 + 0.5 * Math.abs(j1)) * A
      r.legs.forEach((L, i) => { const ji = jerk(t, info.dur, 4, seed + 20 + i, 0.1); L.hip.rotation.z += ji * 0.9 * A; L.knee.rotation.z += Math.abs(ji) * 0.6 * A; L.hip.rotation.x += ji * 0.3 * A })
      r.tail.forEach((tl, i) => { tl.rotation.y += j1 * 0.4 * A * (1 - i * 0.2); tl.rotation.z += j2 * 0.3 * A })
      break
    }
    case 'attack': {
      const W = M.windup, S = 0.14 / Math.sqrt(M.fury), hit = W + S * 0.8, end = info.dur
      const k1 = seg(t, 0, W) * (1 - seg(t, W, W + S * 0.6)) // 蓄力（扑出时立刻放开）
      const st = seg(t, W, W + S), back = 1 - seg(t, W + S + 0.1, end)
      const reach = 0.075 * M.fury * sz
      const shake = tremor(t * 1.3, seed) * k1 * (0.02 + 0.012 * stage) // 前摇越久抖得越厉害
      r.body.position.y += (-0.022 * k1 + 0.01 * st * back) * sz
      r.body.rotation.z += -0.16 * k1 + 0.32 * st * back * M.fury * 0.8 + shake
      r.root.position.x += reach * st * back - 0.02 * sz * k1
      r.head.rotation.z += -0.35 * k1 + 0.15 * st * back
      r.head.rotation.x += shake * 3
      r.legs.forEach((L) => {
        if (L.front) { L.hip.rotation.z += -0.4 * k1 + 0.75 * st * back; L.knee.rotation.z += 0.6 * k1 - 0.2 * st * back }
        else { L.hip.rotation.z += 0.35 * k1 - 0.5 * st * back; L.knee.rotation.z += -0.4 * k1 + 0.2 * st * back }
      })
      // 嘴：前摇里一点点张开并发抖，扑出时张到最大，命中瞬间合上
      const open = t < hit ? 0.35 * k1 + 0.9 * seg(t, W, W + S * 0.6) : 0.9 * (1 - seg(t, hit, hit + 0.05)) * 0.2 + 0.12 * back
      r.jaw.rotation.z -= open + Math.abs(shake) * 2
      break
    }
    case 'death': {
      const side = hash(seed + 9) < 0.5 ? 1 : -1
      const conv = 1 - seg(t, 0.9, 1.9), fall = seg(t, 0.25, 0.75)
      const j = jerk(t, info.dur, 7, seed + 5, 0.08) * conv
      r.root.rotation.x = rest.rootR.x + side * (Math.PI / 2) * fall + j * 0.12 * fall
      r.root.position.y = rest.rootP.y + 0.05 * sz * fall
      r.body.rotation.x += j * 0.35 * (1 - fall * 0.5)
      r.body.rotation.z += -0.2 * seg(t, 0, 0.3) * (1 - fall)
      r.legs.forEach((L, i) => {
        const ji = jerk(t, info.dur, 6, seed + 40 + i, 0.07) * conv
        L.hip.rotation.z = lerp(L.hip.rotation.z, (L.front ? 0.9 : -0.7) + hs(i + seed) * 0.2, seg(t, 0.5, 1.6)) + ji * 0.9
        L.knee.rotation.z = lerp(L.knee.rotation.z, hs(i * 2 + seed) * 0.3, seg(t, 0.5, 1.6)) + Math.abs(ji) * 0.5
      })
      r.head.rotation.z += -0.3 * fall + j * 0.4; r.head.rotation.x += j * 0.6
      r.jaw.rotation.z -= 0.25 + 0.3 * seg(t, 0.2, 1.2)
      r.tail.forEach((tl, i) => { tl.rotation.y += hs(i + seed * 3) * 0.4 * fall + j * 0.3 })
      puff = 1 + 0.12 * seg(t, 1.5, info.dur)
      break
    }
  }
  setPuff(grp, puff)
  return info
}

// ============================================================================
// 蛛形纲宿主：arachnidAnim 采样 → 时间缩放 / 相位错乱 / 僵硬 / 拖腿 / 抽搐
// ============================================================================
const _restQ = new WeakMap<THREE.Object3D, THREE.Quaternion>()
const restQ = (o: THREE.Object3D) => { let q = _restQ.get(o); if (!q) { q = new THREE.Quaternion().setFromEuler((o.userData.r0 as THREE.Euler | undefined) ?? new THREE.Euler()); _restQ.set(o, q) } return q }
/** 腿根偏航往后（-X）方向的符号：脚在根坐标的 z 分量决定（绕 +Y 转 θ：dx/dθ = z） */
const _yawBack = new WeakMap<THREE.Object3D, number>()
function yawBack(j0: THREE.Object3D) {
  let s = _yawBack.get(j0)
  if (s === undefined) {
    const leg = j0.userData.leg as { K: THREE.Vector3; F: THREE.Vector3 } | undefined
    const r0 = (j0.userData.r0 as THREE.Euler | undefined)?.y ?? 0
    const f = leg ? leg.K.clone().add(leg.F).applyAxisAngle(Y, r0) : new THREE.Vector3(0, 0, 1)
    s = f.z >= 0 ? -1 : 1
    _yawBack.set(j0, s)
  }
  return s
}
function animateSpiderHost(grp: THREE.Object3D, clip: CreeperHostClip, t: number, stage: CreepStage, seed: number) {
  const rig = grp.userData.arachnidRig as ArachnidRig
  const M = CREEP_MOTION[stage], k = CREEP_STAGES[stage].stiff, sh = CREEP_STAGES[stage].shrink
  const info = creeperClipInfo('host', clip, stage, { spider: true })
  const cyc = (ARACHNID_CLIPS as Record<string, { walk?: { len: number } }>)[rig.variant]?.walk?.len ?? SPIDER_STEP // 该变种的步行周期
  if (clip === 'walk') info.dur = (4 * cyc) / M.rate
  const legs = rig.legs.map((j, n) => ({ j, info: rig.legInfo[n] })).filter((l) => !l.info.missing)
  let puff = 1
  const sizeL = rig.hy * 3 // 粗略的腿长尺度（m）
  /** 采样 clip @ tt，若给 alt 则对一半的腿换成另一个相位的姿态（各腿不协调） */
  const pose = (c: 'idle' | 'walk' | 'lunge' | 'death' | 'hit', tt: number, o: { speed?: number } = {}, alt?: number) => {
    let saved: THREE.Quaternion[][] | null = null
    if (alt !== undefined) {
      applyArachnidPose(grp, sampleArachnid(grp, c, alt, { ...o, seed }))
      saved = legs.map((l) => l.j.map((n) => n.quaternion.clone()))
    }
    applyArachnidPose(grp, sampleArachnid(grp, c, tt, { ...o, seed }))
    if (saved) legs.forEach((l, i) => { if (hash(i * 1.7 + seed) < 0.5) l.j.forEach((n, m) => n.quaternion.copy(saved![i][m])) })
  }
  /** 僵硬：腿节 / 胫节的旋转往静止姿态收（膝几乎不弯） */
  const stiffen = (w: number) => legs.forEach((l) => { l.j[1].quaternion.slerp(restQ(l.j[1]), 0.22 * w); l.j[2].quaternion.slerp(restQ(l.j[2]), 0.5 * w) })
  /** 抽搐叠加：随机几条腿猛地一抬、身体一歪 */
  const jerks = (A: number, dur: number, n: number) => {
    if (A <= 0) return
    legs.forEach((l, i) => { const ji = jerk(t, dur, n, seed + 30 + i, 0.07); if (ji) { l.j[1].rotateZ(ji * 0.45 * A); l.j[2].rotateZ(-Math.abs(ji) * 0.4 * A) } })
    const jb = jerk(t, dur, n, seed + 3, 0.09)
    rig.root.rotateX(jb * 0.12 * A); rig.root.rotateZ(jerk(t + 0.21, dur, n, seed + 4) * 0.06 * A)
  }
  switch (clip) {
    case 'idle': {
      pose('idle', fract(t / info.dur) * 4)
      stiffen(k)
      const tr = tremor(t, seed) * 0.01 * stage
      rig.root.rotateX(tr); rig.root.position.y -= 0.06 * rig.clear * k
      legs.forEach((l, i) => l.j[1].rotateZ(tremor(t, seed + i) * 0.012 * stage))
      jerks(M.twitch * 0.6, info.dur, 2)
      break
    }
    case 'walk': {
      const u = fract(t / info.dur) * 4
      const p = u + (M.chaos * 0.9 / TAU) * Math.sin(TAU * u) + (M.chaos * 0.4 / (TAU * 2)) * Math.sin(TAU * 2 * u + seed)
      // 用该变种自己的步行周期采样：先把「4 步」映射到 4 个周期
      const v0 = arachnidGaitSpeed(grp, 'walk')
      const tt = p * cyc
      pose('walk', tt, { speed: v0 * (1 - 0.3 * k) }, M.chaos > 0 ? tt + (0.12 + 0.6 * M.chaos) * cyc : undefined)
      stiffen(k)
      // 拖腿：一条后腿（第 4 对）在循环的一段里僵直地拖在后面
      const dk = M.drag * seg(u, 1.0, 1.5) * (1 - seg(u, 3.0, 3.5))
      const dl = legs.find((l) => l.info.idx === 3 && (l.info.side > 0) === (hash(seed + 0.5) < 0.5))
      if (dl && dk > 0) {
        // 阶段 3：脚底锁定（同尸鼠）：偏航随这一步身体前进量往后加，最后一段拽回
        const stride = CREEP_WALK_NATURAL.spider * (info.speed ?? 1) * (info.dur / 4), lock = Math.min(0.45, stride / Math.max(0.05, sizeL)) * slipSaw(fract(u))
        _q.copy(restQ(dl.j[0])).multiply(_q2.setFromAxisAngle(Y, yawBack(dl.j[0]) * (0.4 + lock)))
        dl.j[0].quaternion.slerp(_q, dk)
        dl.j[1].quaternion.slerp(_q.copy(restQ(dl.j[1])).multiply(_q2.setFromAxisAngle(Z, -0.12)), dk)
        dl.j[2].quaternion.slerp(_q.copy(restQ(dl.j[2])).multiply(_q2.setFromAxisAngle(Z, 0.15)), dk)
        rig.root.rotateX(dl.info.side * 0.07 * dk)
      }
      rig.root.position.y -= 0.05 * rig.clear * k
      rig.root.rotateZ(-0.04 * k + 0.03 * M.chaos * Math.sin(TAU * p * 2))
      jerks(M.twitch * 0.7, info.dur, stage)
      break
    }
    case 'twitch': {
      pose('idle', 0)
      stiffen(k)
      const env = envelope(t, 0.04, 0.35, info.dur), A = (0.8 + 0.6 * M.twitch) * env
      legs.forEach((l, i) => { const ji = jerk(t, info.dur, 5, seed + 50 + i, 0.08); l.j[1].rotateZ(ji * 0.7 * A); l.j[2].rotateZ(-Math.abs(ji) * 0.7 * A); l.j[0].rotateY(ji * 0.2 * A) })
      rig.root.rotateX(jerk(t, info.dur, 5, seed + 1, 0.1) * 0.25 * A); rig.root.rotateZ(jerk(t + 0.1, info.dur, 4, seed + 2, 0.1) * 0.15 * A)
      rig.root.position.y += Math.abs(jerk(t, info.dur, 5, seed + 1, 0.1)) * 0.25 * rig.clear * A
      rig.chelicerae.forEach((c, i) => c.rotateZ(Math.abs(jerk(t, info.dur, 6, seed + 70 + i)) * 0.6 * A))
      break
    }
    case 'attack': {
      const W = M.windup, S = 0.14 / Math.sqrt(M.fury)
      // 时间重映射：arachnidAnim.lunge 的 0–0.3 s 蓄力拉长成 W，0.3–0.4 s 扑出按 fury 压短，之后按原速收回
      const tt = t < W ? 0.3 * (t / W) : t < W + S ? 0.3 + 0.1 * ((t - W) / S) : Math.min(1, 0.4 + (t - W - S))
      pose('lunge', tt)
      stiffen(k * 0.6)
      const k1 = seg(t, 0, W) * (1 - seg(t, W, W + S * 0.5)), st = seg(t, W, W + S) * (1 - seg(t, W + S + 0.1, info.dur))
      // 前摇：前腿高举、越抖越厉害；扑出：比正常扑得更远
      legs.forEach((l) => { if (l.info.idx < 2) { l.j[1].rotateZ(tremor(t * 1.2, seed + l.info.idx) * k1 * (0.03 + 0.02 * stage)); l.j[1].rotateZ(0.15 * k1 * (M.fury - 1)) } })
      rig.root.position.x += 0.35 * sizeL * (M.fury - 1) * st
      rig.root.position.y -= 0.15 * rig.clear * k1 * M.fury
      rig.root.rotateZ(tremor(t, seed) * 0.02 * k1 * stage)
      break
    }
    case 'death': {
      pose('death', Math.min(t, 1.8))
      const conv = 1 - seg(t, 0.9, 2.0)
      jerks(M.twitch * conv, info.dur, 7)
      puff = 1 + 0.12 * seg(t, 1.6, info.dur)
      break
    }
  }
  // arachnidAnim 只写统一缩放：把干瘪的腹部（poseCreepArachnid 的收缩）补回来
  const s = rig.body.abdomen.scale.x
  rig.body.abdomen.scale.set(s * (1 - sh * 0.3), s * (1 - sh), s * (1 - sh))
  setPuff(grp, puff)
  return info
}

// ============================================================================
// 爬菌人：关节层级（body → neck → head → jaw；body → tail；body → upperArm → foreArm → hand），静止旋转全为 0
// ============================================================================
interface ArmRest { S0: THREE.Vector3; E0: THREE.Vector3; W0: THREE.Vector3; a: number; b: number; Fr: THREE.Matrix4; pole: THREE.Vector3; s: number }
interface HumanRest { body: THREE.Vector3; L: ArmRest; R: ArmRest; hinge: THREE.Vector3 }
const HUMAN_REST = new WeakMap<CreeperRig, HumanRest>()
function humanRest(rig: CreeperRig): HumanRest {
  let h = HUMAN_REST.get(rig)
  if (h) return h
  const arm = (s: number, ua: THREE.Object3D, fa: THREE.Object3D, hd: THREE.Object3D): ArmRest => {
    const S0 = (ua.userData.pivot as THREE.Vector3).clone(), E0 = (fa.userData.pivot as THREE.Vector3).clone(), W0 = (hd.userData.pivot as THREE.Vector3).clone()
    const x0 = E0.clone().sub(S0).normalize(), n0 = E0.clone().sub(S0).cross(W0.clone().sub(E0)).normalize()
    return { S0, E0, W0, a: E0.distanceTo(S0), b: W0.distanceTo(E0), Fr: new THREE.Matrix4().makeBasis(x0, n0, x0.clone().cross(n0)), pole: new THREE.Vector3(s * 0.5, 1, -0.45), s }
  }
  h = { body: (rig.body.userData.pivot as THREE.Vector3).clone(), L: arm(-1, rig.upperArmL, rig.foreArmL, rig.handL), R: arm(1, rig.upperArmR, rig.foreArmR, rig.handR), hinge: ((rig.jaw.userData.hinge as THREE.Vector3 | undefined) ?? X).clone() }
  HUMAN_REST.set(rig, h)
  return h
}
/** 一只手的指令：W = 腕部目标（根坐标，米）；curl = 手绕腕横轴转（+ 指尖往下扎 / 钩地，− 爪子翘起前伸）；yaw；pole = 肘部朝向（根坐标，缺省静止姿态那样高抬外翻） */
interface HandCmd { W: THREE.Vector3; curl: number; yaw: number; roll: number; pole?: THREE.Vector3 }
interface HumanPose {
  off: THREE.Vector3; rx: number; ry: number; rz: number // 身体（枢轴 = 腰部断口）：rx + = 胸口压低，ry + = 左肩前送，rz 侧滚
  neck: [number, number, number]; head: [number, number, number]; jaw: number // jaw：绕开合轴额外张开（rad，+ 更大）
  tail: [number, number]; L: HandCmd; R: HandCmd; ember: number; puff: number
}
function ik2(S: THREE.Vector3, W: THREE.Vector3, a: number, b: number, pole: THREE.Vector3) {
  const D = W.clone().sub(S), d = Math.min(Math.max(D.length(), Math.abs(a - b) + 1e-3), a + b - 1e-3), Dn = D.normalize()
  const P = pole.clone().addScaledVector(Dn, -pole.dot(Dn)).normalize()
  const ca = (a * a + d * d - b * b) / (2 * a * d), sa = Math.sqrt(Math.max(0, 1 - ca * ca))
  return S.clone().addScaledVector(Dn, a * ca).addScaledVector(P, a * sa)
}
const _Qb = new THREE.Quaternion(), _Qbi = new THREE.Quaternion(), _Qua = new THREE.Quaternion(), _Qfa = new THREE.Quaternion(), _Ft = new THREE.Matrix4()
function solveArm(A: ArmRest, cmd: HandCmd, bodyP: THREE.Vector3, ua: THREE.Object3D, fa: THREE.Object3D, hd: THREE.Object3D, restBody: THREE.Vector3) {
  const S = A.S0.clone().sub(restBody).applyQuaternion(_Qb).add(bodyP)
  const pole = (cmd.pole ?? A.pole).clone().applyQuaternion(_Qb)
  const E = ik2(S, cmd.W, A.a, A.b, pole)
  const reachD = Math.min(cmd.W.distanceTo(S), A.a + A.b - 1e-3)
  const W = S.clone().addScaledVector(cmd.W.clone().sub(S).normalize(), reachD)
  const x1 = E.clone().sub(S).normalize()
  let n1 = E.clone().sub(S).cross(W.clone().sub(E))
  if (n1.lengthSq() < 1e-10) n1 = new THREE.Vector3().setFromMatrixColumn(A.Fr, 1).applyQuaternion(_Qb)
  n1.normalize()
  _Ft.makeBasis(x1, n1, x1.clone().cross(n1))
  _Qua.setFromRotationMatrix(_m.multiplyMatrices(_Ft, A.Fr.clone().transpose()))
  ua.quaternion.copy(_Qbi).multiply(_Qua)
  const d0 = A.W0.clone().sub(A.E0).applyQuaternion(_Qua).normalize(), d1 = W.clone().sub(E).normalize()
  _Qfa.setFromUnitVectors(d0, d1).multiply(_Qua)
  fa.quaternion.copy(_Qua).invert().multiply(_Qfa)
  // 手：世界朝向 = 绕竖轴 yaw · 绕手的横轴 curl / roll（静止时掌贴地）
  _q.setFromEuler(_e.set(cmd.curl, cmd.yaw, cmd.roll, 'YXZ'))
  hd.quaternion.copy(_Qfa).invert().multiply(_q)
}
function restPose(h: HumanRest): HumanPose {
  return {
    off: new THREE.Vector3(), rx: 0, ry: 0, rz: 0, neck: [0, 0, 0], head: [0, 0, 0], jaw: 0, tail: [0, 0],
    L: { W: h.L.W0.clone(), curl: 0, yaw: 0, roll: 0 }, R: { W: h.R.W0.clone(), curl: 0, yaw: 0, roll: 0 }, ember: 1, puff: 1,
  }
}
function applyHuman(root: THREE.Object3D, rig: CreeperRig, h: HumanRest, P: HumanPose) {
  rig.body.position.copy(h.body).sub((root.userData.pivot as THREE.Vector3 | undefined) ?? _v.set(0, 0, 0)).add(P.off)
  rig.body.quaternion.setFromEuler(_e.set(P.rx, P.ry, P.rz, 'YXZ'))
  _Qb.copy(rig.body.quaternion); _Qbi.copy(_Qb).invert()
  const bodyP = h.body.clone().add(P.off)
  solveArm(h.L, P.L, bodyP, rig.upperArmL, rig.foreArmL, rig.handL, h.body)
  solveArm(h.R, P.R, bodyP, rig.upperArmR, rig.foreArmR, rig.handR, h.body)
  rig.neck.rotation.set(P.neck[0], P.neck[1], P.neck[2], 'YXZ')
  rig.head.rotation.set(P.head[0], P.head[1], P.head[2], 'YXZ')
  rig.jaw.quaternion.setFromAxisAngle(h.hinge, P.jaw)
  // 拖地的脊骨 / 筋肉丝：抵消身体的俯仰与偏航（末端留在地上），再加一点被拖动的左右摆
  rig.tail.quaternion.copy(_Qbi).multiply(_q.setFromEuler(_e.set(P.tail[1], P.tail[0], 0, 'YXZ')))
  const u = creepUniforms(root)
  u.ember.value = P.ember; u.puff.value = P.puff
}
/** 鸟一样一顿一顿：每段 segDur 秒一个随机目标，段首 snap 秒内急转过去，然后定住 */
function birdHead(t: number, dur: number, segDur: number, seed: number, snap = 0.07) {
  const n = Math.round(dur / segDur), u = fract(t / dur) * n, i = Math.floor(u), loc = (u - i) * segDur
  const tgt = (k: number) => { const kk = ((k % n) + n) % n; return [hs(kk * 3.1 + seed) * 0.75, -0.05 + hs(kk * 5.7 + seed) * 0.28, hs(kk * 2.3 + seed) * 0.5] }
  const a = tgt(i - 1), b = tgt(i), kk = Math.pow(clamp(loc / snap), 0.6)
  // 急转到位时略冲过头再回弹一点
  const over = Math.sin(clamp(loc / (snap * 2.2)) * Math.PI) * 0.12
  return a.map((x, j) => lerp(x, b[j], kk) + (b[j] - x) * over)
}

function animateHuman(root: THREE.Object3D, rig: CreeperRig, clip: CreeperHumanClip, t: number) {
  const h = humanRest(rig)
  const info = CREEPER_CLIPS.human[clip]
  const P = restPose(h)
  const seed = 17
  switch (clip) {
    case 'crawl': {
      const dur = info.dur, u = fract(t / dur), duty = 0.62, stride = 0.22
      for (const [cmd, A, off] of [[P.L, h.L, 0.5], [P.R, h.R, 0]] as [HandCmd, ArmRest, number][]) {
        const lp = fract(u + off)
        if (lp < duty) {
          // 支撑：手掌在地上锁定（相对根匀速后移 = 身体被拖向前），刚落地时爪子往地里一钩
          const k = lp / duty
          cmd.W.z = A.W0.z + stride * (0.5 - k); cmd.W.y = A.W0.y
          cmd.curl = 0.1 * Math.exp(-k * 8) - 0.05 * k
          cmd.W.x = A.W0.x * (1 - 0.06 * Math.sin(Math.PI * k))
        } else {
          // 摆动：手抬起、往前探，腕下垂（指尖朝下），落地前爪子翘起前伸
          const k = (lp - duty) / (1 - duty), e = ease(k)
          cmd.W.z = A.W0.z + stride * (-0.5 + e); cmd.W.y = A.W0.y + Math.sin(Math.PI * k) * 0.075
          cmd.W.x = A.W0.x * (1 - 0.12 * Math.sin(Math.PI * k))
          cmd.curl = 0.5 * Math.sin(Math.PI * Math.min(1, k * 1.6)) * (1 - seg(k, 0.55, 0.85)) - 0.35 * seg(k, 0.55, 0.85) * (1 - seg(k, 0.88, 1))
        }
        cmd.yaw = A.s * 0.05 * Math.sin(TAU * (lp - 0.2))
      }
      P.ry = -0.14 * Math.sin(TAU * (u - 0.06)) // 伸手一侧的肩膀前送
      P.rz = 0.06 * Math.sin(TAU * (u + 0.19)) // 往撑地一侧倾
      P.rx = -0.03 - 0.035 * Math.sin(TAU * 2 * u + 0.6) // 每次拉动胸口抬起一下
      P.off.z = 0.025 * Math.sin(TAU * 2 * u - 0.4) // 一拽一拽地向前
      P.off.y = 0.006 * Math.sin(TAU * 2 * u + 1.2)
      P.tail = [-P.ry * 0.85 + 0.12 * Math.sin(TAU * u + 1.1), -P.rx]
      // 头：迟一拍地点动，偏航部分抵消身体扭动（盯着前方），偶尔一抽
      const j = jerk(t, dur * 2, 2, seed, 0.06)
      P.neck = [0.05 * Math.sin(TAU * 2 * u - 1.0) + j * 0.15, -P.ry * 0.7, j * 0.1]
      P.head = [0.04 * Math.sin(TAU * 2 * u - 1.6), -P.ry * 0.3 + j * 0.2, 0.05 * Math.sin(TAU * u)]
      P.jaw = -0.06 + 0.06 * Math.sin(TAU * 2 * u - 0.9)
      break
    }
    case 'idle': {
      const dur = info.dur, u = fract(t / dur)
      P.rx = 0.1 + 0.015 * Math.sin(TAU * u * 2) // 伏低，慢呼吸
      P.off.z = -0.02
      const bh = birdHead(t, dur, 0.5, seed)
      const j = jerk(t, dur, 3, seed + 1, 0.06), j2 = jerk(t + 1.7, dur, 2, seed + 2, 0.05)
      P.neck = [0.08 + bh[1] * 0.5 + j2 * 0.2, bh[0] * 0.6, bh[2] * 0.3]
      P.head = [bh[1] * 0.5, bh[0] * 0.4 + j * 0.25, bh[2] * 0.7 + j * 0.2]
      P.rz = j2 * 0.08 + tremor(t, seed) * 0.004
      P.ry = 0.02 * Math.sin(TAU * u)
      for (const [cmd, A, sd] of [[P.L, h.L, 1], [P.R, h.R, 2]] as [HandCmd, ArmRest, number][]) {
        cmd.W.x = A.W0.x * 1.04; cmd.W.z = A.W0.z - 0.02
        const jh = jerk(t, dur, 2, seed + 10 + sd, 0.05)
        cmd.curl = 0.06 * Math.abs(jh) + 0.02 * tremor(t, sd) // 手指抽一下（爪子在地上刮）
        cmd.W.y = A.W0.y + 0.012 * Math.max(0, jh)
      }
      // 下颌：偶尔「咔」地合一下再张开
      P.jaw = -0.18 * Math.max(0, jerk(t + 0.8, dur, 2, seed + 5, 0.09))
      P.tail = [-P.ry, -P.rx]
      P.ember = 0.9
      break
    }
    case 'lunge': {
      // 阶段 3：根位移。B = 身体在世界里往前扑出的量（扑出后不再收回），H = 手在世界里的落点（最后拍在 dist 之外），都减去根位移 R
      const W = CREEP_LUNGE.W, S = 0.8, Ld = 0.95, end = info.dur, D = CREEP_LUNGE.dist
      const k1 = seg(t, 0, W) * (1 - seg(t, W, W + 0.06)), st = seg(t, W, S), ld = seg(t, S, Ld), back = 1 - seg(t, Ld + 0.05, end)
      const air = st * (1 - ld), R = creeperLungeRoot(t)
      const shake = tremor(t * 1.4, seed) * k1 * 0.012
      P.off.z = -0.07 * k1 + D * st - R
      P.off.y = 0.045 * air
      P.rx = 0.16 * k1 - 0.2 * air + 0.04 * ld * back + shake
      P.rz = shake * 2
      for (const [cmd, A] of [[P.L, h.L], [P.R, h.R]] as [HandCmd, ArmRest][]) {
        // 前摇：手掌死死按住地面；扑出：双臂前伸、爪子翘起（比身体多探出 0.16）；落地：狠狠拍在 D 之外的地上，之后根追上来
        const Hz = D * st + 0.16 * air - 0.03 * k1, liftY = 0.13 * air
        cmd.W.z = A.W0.z + Hz - R; cmd.W.y = A.W0.y + liftY
        cmd.W.x = A.W0.x * (1 - 0.18 * air)
        cmd.curl = -0.7 * air + 0.12 * ld * back * (1 - seg(t, Ld, Ld + 0.15)) + 0.04 * k1
      }
      P.neck = [0.14 * k1 - 0.22 * air, 0, 0]
      P.head = [0.1 * k1 - 0.15 * air, tremor(t, seed + 3) * 0.04 * k1, 0]
      P.jaw = 0.2 * k1 + 0.45 * air + 0.15 * ld * back - 0.1 * (1 - back)
      P.tail = [-P.ry, -P.rx]
      P.ember = 1 + 1.1 * Math.max(k1 * 0.5, air)
      break
    }
    case 'scream': {
      const env = envelope(t, 0.35, 0.4, info.dur)
      const sh = tremor(t * 1.2, seed) * env
      P.rx = -0.3 * env + sh * 0.01
      P.off.z = -0.03 * env
      P.rz = sh * 0.025
      for (const [cmd, A] of [[P.L, h.L], [P.R, h.R]] as [HandCmd, ArmRest][]) { cmd.W.x = A.W0.x * (1 + 0.1 * env); cmd.W.z = A.W0.z - 0.04 * env; cmd.curl = 0.1 * env }
      P.neck = [-0.32 * env, sh * 0.04, 0]
      P.head = [-0.28 * env + sh * 0.02, Math.sin(t * 21) * 0.07 * env, sh * 0.05]
      P.jaw = 0.5 * env + Math.sin(t * 47) * 0.04 * env // 下颌张到最大，发抖
      P.tail = [-P.ry, -P.rx]
      P.ember = 1 + 1.4 * env
      break
    }
    case 'death': {
      const conv = seg(t, 0, 0.15) * (1 - seg(t, 0.5, 0.75)), fall = seg(t, 0.45, 1.15), j = jerk(t, info.dur, 6, seed + 9, 0.08) * (1 - seg(t, 1.0, 2.2))
      P.rx = -0.22 * conv + 0.42 * fall + j * 0.04 // 胸口贴地
      P.rz = 0.1 * fall + j * 0.03
      P.off.z = -0.03 * fall
      for (const [cmd, A] of [[P.L, h.L], [P.R, h.R]] as [HandCmd, ArmRest][]) {
        // 瘫倒：双手向外滑开、肘部塌向两侧
        cmd.W.x = A.W0.x * (1 + 0.3 * fall); cmd.W.z = A.W0.z + 0.04 * fall - 0.05 * conv
        cmd.pole = new THREE.Vector3(A.s * lerp(0.5, 1, fall), lerp(1, 0.35, fall), lerp(-0.45, 0, fall))
        cmd.curl = 0.25 * conv + 0.1 * fall
      }
      // 头侧着搁在地上（颈部往上折回来抵消身体前倾，免得头插进地里）
      P.neck = [-0.35 * conv - 0.36 * fall + j * 0.2, 0.2 * fall, 0]
      P.head = [-0.2 * conv - 0.12 * fall, 0.4 * fall, 0.75 * fall + j * 0.2]
      P.jaw = 0.35 * conv + 0.25 * fall
      P.tail = [0, -P.rx]
      P.ember = Math.max(0.03, 1 + 0.8 * conv - seg(t, 0.8, 2.4))
      P.puff = 1 + 0.1 * seg(t, 1.6, info.dur)
      break
    }
  }
  applyHuman(root, rig, h, P)
  return info
}

// ============================================================================
// 第一人称手：handTwitch（只做接口与预览，不接机制）
// ============================================================================
/**
 * 3、4 阶：手指偶尔不受控地抽动 / 痉挛——四指猛地一攥或一张、食指弹出、拇指一抽；4 阶更频繁更猛，并且手腕持续细颤。
 * 手指形变靠 hand.setPose（握姿几何由 retroViewHand 生成并 LRU 缓存）：抽动幅度量化成 7 档 × 食指伸 / 不伸，
 * 最多 14 个握姿，落在缓存容量内；手腕的细颤直接转 hand.group（不改几何）。绒球按「三角形 + 重心坐标」跟着手指走。
 */
export function animateCreepHand(hand: RetroHand, overlay: CreepHandOverlay | null, clip: CreeperHandClip, t: number, stage: CreepStage, base?: HandPose, seed = 0) {
  const info = CREEPER_CLIPS.hand[clip]
  const b = base ?? (stage === 4 ? CREEP_CLAW_HAND_POSE : { at: [0, 0, -0.03], r: 0 } as HandPose)
  let pose = b
  let wristX = 0, wristZ = 0
  if (clip === 'handTwitch' && stage >= 3) {
    const st4 = stage === 4
    const e = jerk(t, info.dur, st4 ? 4 : 2, seed + 1, st4 ? 0.12 : 0.09) * (st4 ? 1.25 : 0.9)
    const f = jerk(t + 0.4, info.dur, st4 ? 3 : 1, seed + 2, 0.08)
    const q = Math.round(clamp(e, -1, 1) * 3) / 3
    const w0 = b.wrap ?? 1, tw0 = b.thumbWrap ?? 1
    pose = { ...b, wrap: clamp(w0 + q * 0.42, 0.05, 1), thumbWrap: clamp(tw0 - q * 0.3, 0.05, 1), trigger: b.trigger || f > 0.45 }
    wristX = e * 0.07 + (st4 ? tremor(t, seed) * 0.012 : tremor(t, seed) * 0.004)
    wristZ = f * 0.05 + (st4 ? tremor(t * 0.8, seed + 3) * 0.008 : 0)
  }
  hand.setPose(pose)
  if (wristX || wristZ) { hand.group.rotateX(wristX); hand.group.rotateZ(wristZ) }
  overlay?.sync()
  return info
}
