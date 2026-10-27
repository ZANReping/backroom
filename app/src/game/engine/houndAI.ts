// v62：猎犬（Entity 8）专属 AI——依据中文维基 Entity 8：
//  · 目击即敌对：一旦在视野内看见人类就被激怒；第一次锁定时仰头嚎叫，召集附近同类。
//  · 嚎叫：被召集的猎犬带着增强的视野搜寻嚎叫处——此时躲在它们视线之外最安全。
//  · 直视：直接、持续的眼神接触会让它伏低后退；但只能短暂生效（约 4 秒，持续制造噪音可延长到 6 秒），
//    之后它习惯了你的目光，6 秒内不再惧怕——足够规划路线逃跑。
//  · 逃跑：看见它就跑会立刻触发冲锋；扑击造成镜头震动与短暂减速。
//  · L3：高智能个体沿用伏击逻辑，被直视时完全僵住。
//  · L11 中立变种：城市效应下不主动攻击；保持距离观察、坐下、摇尾，被盯久了会扭头走开，
//    近处奔跑会把它吓跑；一旦被攻击即永久转为敌对，并带动附近的中立同类。
// 猎犬重制·阶段 3（机制，方案与 ZAN 定稿见 /workspace/work/hound-remake/plan.md）：
//  · HD 表：全部调参数值。
//  · 直视要看到脸：准星方向与「眼睛 → 猎犬头部」的夹角 < GAZE_CONE + atan(HEAD_R / 距离) 才算；
//    手电光锥照到脸：起效更远、威慑更久（×1.5），扑倒时还能帮你挣脱；暗处（猎犬所在处无灯光且没被手电照到）
//    要盯住 0.4 s 才起效、只在 5.5 m 内有效、维持时间 ×0.6。
//  · 群猎：2–3 只编组（PACK_R 内就近合群）。头犬嚎叫后其余成员左右分开，先横向绕开（不从正面进入视野），
//    再绕到玩家两侧偏后方，就位（或超时）后全体收拢冲锋；头犬在正面约 6 m 处低伏吸引注意。
//  · 嚎叫搜寻期：听到嚎叫（不在同一群里）的猎犬朝嚎叫处去，到了在附近来回嗅探直到搜寻期结束；
//    玩家躲出视线后，追击中的猎犬到最后看到玩家的位置徘徊一阵（linger）。
//  · 扑倒压制：冲锋扑中 → pin：玩家被压倒（movement 由 houndControlsPlayer 接管、视角压低），每秒撕咬一口。
//    连按交互 / 攻击 / 跳跃 / 特殊交互键 X（移动端情境按钮「挣脱」）累计挣脱值，手电照脸持续加、
//    自己打中它加、联机同伴（或其他来源）的攻击直接解救；挣脱后猎犬硬直（stagger）。
//  · 尸体：附近刚死的肉食类实体会被猎犬认领（尸体不再消失），玩家在旁时先拖走再啃；进食期间视野 ×0.35、
//    听觉 ×0.4，近到 2.4 m 或附近狂奔才会惊醒——借机溜走。
//  · 三形态：hostile 编组 / 扑倒 / 进食；neutral 不编组、不扑倒、不进食；ambusher 单独伏击、不编组不进食、
//    扑倒更难挣脱（10 下）、被直视完全僵住。
import { audio } from '../core/audio'
import type { Entity } from '../entities'
import type { Engine } from '../engine'
import type { SpecialAction } from './special'

/** 调参表（秒 / 米；速度为 def.speed（3.4 m/s）的倍数） */
export const HD = {
  // —— 感知 ——
  LOS_MAX: 22, Z_TOL: 1.4, ALERT_SIGHT_K: 1.7, PANIC_SPEED: 4.4,
  // —— 直视 ——
  GAZE_T: 4, GAZE_NOISE_T: 2, HABIT_T: 6, // 威慑约 4 s，持续噪音 +2 s；习惯后 6 s 内无效
  GAZE_R: 10, GAZE_R_DARK: 5.5, GAZE_R_FLASH: 14, // 起效距离：明处 / 暗处 / 手电照脸
  GAZE_CONE: 0.2, HEAD_R: 0.28, // 准星夹角阈值 = GAZE_CONE + atan(HEAD_R / 距离)（5 m ≈ 15°，2 m ≈ 19°）
  FLASH_CONE: 0.32, FLASH_R: 14, // 手电光锥半角 / 有效距离
  DUR_FLASH: 1.5, DUR_DARK: 0.6, // 威慑时长倍数
  TRIGGER_DARK: 0.4, // 暗处要先盯住这么久才起效（明处 / 手电立即）
  HEAD: { hostile: { fwd: 0.68, z: 0.5 }, neutral: { fwd: 0.68, z: 0.55 }, ambusher: { fwd: 0.74, z: 0.44 } } as Record<'hostile' | 'neutral' | 'ambusher', { fwd: number; z: number }>,
  HEAD_CROUCH: 0.18, // 伏低时头部下降
  EYE_H: 1.55, EYE_CROUCH: 0.55, // 玩家眼高（蹲下降低）；被压倒时见 PIN_EYE
  COWER_K: 0.22, COWER_MIN_T: 0.8,
  // —— 移动 ——
  ROAM_K: 0.4, SEARCH_K: 0.8, STALK_K: 0.45, CHARGE_K: 1.55, CHARGE_K_L3: 1.7, FLEE_K: 1.1, FLANK_K: 0.9, LINGER_K: 0.32, DRAG_K: 0.34, STAGGER_K: 0.15,
  FLEE_HP: 0.3, FLEE_T: 4,
  // —— 嚎叫 / 搜寻 / 徘徊 ——
  HOWL_T: 1.1, HOWL_R: 25, CALL_ALERT: 10, HEAR_ALERT: 5,
  SEARCH_T: 12, SEARCH_R: 4, SEARCH_ARRIVE: 1.0, SNIFF_GAP: 2.6,
  LINGER_T: 9, LINGER_R: 2.5, LOST_STALK: 3.5, LOST_CHARGE: 4, LOST_CHARGE_D: 6,
  STALK_CHARGE_D: 5, HOWL_CHARGE_D: 6,
  // —— 群猎 ——
  PACK_R: 8, PACK_MAX: 3,
  LEAD_HOLD: 6, LEAD_MIN: 3, // 头犬正面吸引：保持约 6 m，近于 3 m 才扑
  FLANK_WIDE: 6.5, FLANK_SIDE: 3, FLANK_BEHIND: 2.5, // 先横向绕到侧面 6.5 m，再到侧后方（横 3 m、后 2.5 m）
  FLANK_READY_R: 1.4, FLANK_MAX: 9, FLANK_VIEW: 0.6, FLANK_PUSH: 2.5, FLANK_CLOSE_D: 2.2,
  // —— 扑击 ——
  STRIKE_R: 2.4, STRIKE_WIND: 0.3, STRIKE_HIT_R: 1.5, STRIKE_CD: 1.5, STRIKE_SPEED: 7, STRIKE_LUNGE: 0.32, HIT_SLOW: 0.8, HIT_SHAKE: 0.7,
  // —— 扑倒压制 ——
  PIN_OFF: 1.2, // 猎犬中心到玩家（= 第一人称镜头 / 玩家头部）的距离：前爪落在头前 0.34 m 的胸口，脸在镜头前约 0.47 m（咬时探到 0.37 m）
  PIN_OFF_L3: 1.28, // 高智能形态身子长 12%：站远一点，脸同样落在镜头前 0.45 m 左右
  PIN_HEAD: { hostile: { fwd: 0.8, z: 0.57 }, neutral: { fwd: 0.8, z: 0.57 }, ambusher: { fwd: 0.86, z: 0.49 } } as Record<'hostile' | 'neutral' | 'ambusher', { fwd: number; z: number }>,
  // 压人时脸（双眼）的位置（PIN_HEAD）：身前 / 离地（抬颈俯脸看着玩家）
  PIN_LOOK_UP: 0.22, PIN_ROLL: 0.24, // 被压倒时镜头上仰 / 侧倾（弧度，renderer 读取）：它的脸在镜头前上方约 30°，镜头只仰 12.6°，脸（双眼）落在准星上方、嘴在面板之上（0.36 / 0.28 时实机 1-hit 双眼在准星附近、嘴被挣脱面板挡住），压在胸口的前爪在画面下缘
  PIN_DIST_MAX: 1.6, PIN_BITE: 6, PIN_BITE_GAP: 1, PIN_MAX: 7,
  PIN_NEED: 8, PIN_NEED_L3: 10, PIN_DECAY: 1.2, // 挣脱值：连按 8 下（高智能 10 下），每秒衰减 1.2
  PIN_PRESS: 1, PIN_HIT: 3, PIN_FLASH: 2.5, // 每次按键 / 自己打中它 / 手电照脸每秒
  STAGGER_T: 1.4, REPIN_CD: 8, PIN_EYE: 0.32, PIN_RING: 3, PIN_SLOW: 0.3,
  STAGGER_SHOVE: 1.05, STAGGER_SHOVE_TAU: 0.16, // 被掀翻那一下：后退速度额外 + def.speed × 1.05，按 0.16 s 指数衰减（约多退 0.55 m，0.3 s 内就离开胸口）
  // —— 尸体 ——
  FOOD: ['corpserat', 'arachnid', 'wretch', 'skinstealer', 'faceling', 'duller', 'deathmoth', 'curabitur', 'dryshrimp', 'camocrawler', 'clump', 'burster', 'creeper', 'nguithr'] as string[],
  CORPSE_SENSE: 16, CORPSE_HOLD: 0.15, CORPSE_SCAN: 0.5,
  FEED_T: 20, FEED_CD: 45, FEED_REACH: 0.95, DRAG_R: 7, DRAG_T: 3, MOUTH: 0.72,
  FEED_SIGHT_K: 0.35, FEED_HEAR_K: 0.4, FEED_NOTICE_R: 2.4, FEED_SPRINT_R: 4,
  // —— 中立 ——
  N_SEE: 9, N_KEEP: 4.5, N_KEEP_CROUCH: 2.6, N_STARE_T: 3, N_LOOKAWAY_T: 3, N_FLEE_R: 5, N_FLEE_T: 2.5, N_PROVOKE_R: 10,
  // —— LOD（渲染层 houndAnim 读取）——
  LOD1: 12, LOD2: 22, LOD_HYST: 1.5, LOD2_EVERY: 2,
}

export type HoundPhase = 'roam' | 'howl' | 'search' | 'stalk' | 'charge' | 'cower' | 'flee' | 'watch' | 'sit'
  | 'flank' | 'linger' | 'pin' | 'stagger' | 'feed' | 'drag'
export interface HoundState {
  neutral: boolean
  phase: HoundPhase
  t: number
  gazeT: number
  gazeCd: number
  alert: number // 被嚎叫召集后的搜寻剩余时间（视野增强）
  lostT: number // 失去视线累计
  lastX: number; lastY: number // 最后目击/听见位置（世界坐标，不随流式窗口平移）
  lastHp: number
  strikeT?: number
  howled?: boolean
  lookAwayT?: number
  // 渲染姿态量 0..1
  crouch: number; howlPose: number; sit: number; jaw: number; wag: number
  // —— 阶段 3 ——
  gazeHold: number // 本次连续被盯住的时间（暗处起效延迟）
  gazeOn?: boolean; gazeFlash?: boolean // 本帧是否被直视 / 手电照脸（验收与渲染读取）
  pack?: number; role?: 'lead' | 1 | -1; flankStage?: number; flankReady?: boolean
  cx?: number; cy?: number; sniffT?: number; wx?: number; wy?: number // 搜寻 / 徘徊中心与当前嗅探点（世界坐标）
  searchLeft?: number; lingerLeft?: number
  pinT?: number; biteT?: number; biteAt?: number // biteAt：最近一口撕咬时的 pinT（HUD 红闪）
  corpse?: Entity; feedT?: number; feedCd?: number; dragged?: boolean; scanT?: number; startle?: boolean
}

interface Pack { id: number; members: Entity[]; phase: 'idle' | 'flank' | 'close'; leader?: Entity; t: number }

const newFrame = (map: Engine['map']) => ({
  map, px: 0, py: 0, speed: 0, init: false, told: new Set<string>(),
  packs: new Map<number, Pack>(), nextPack: 1,
  pinner: undefined as Entity | undefined, pinCd: 0, struggle: 0, pinFlash: false,
  keys: { a: false, i: false, j: false, x: false },
  claims: new Map<Entity, Entity>(), // 尸体 → 认领它的猎犬
})
const frames = new WeakMap<Engine, ReturnType<typeof newFrame>>()
function frameFor(eng: Engine) {
  let f = frames.get(eng)
  if (!f || f.map !== eng.map) { f = newFrame(eng.map); frames.set(eng, f) }
  return f
}
export function beginHoundFrame(eng: Engine, dt: number) {
  const F = frameFor(eng)
  const p = eng.player
  const px = p.x + (eng.map?.inf?.ox ?? 0), py = p.y + (eng.map?.inf?.oy ?? 0)
  if (!F.init || dt <= 0) { F.px = px; F.py = py; F.init = true }
  const sp = dt > 0 ? Math.hypot(px - F.px, py - F.py) / dt : 0
  F.speed = F.speed * 0.7 + Math.min(12, sp) * 0.3
  F.px = px; F.py = py
  F.pinCd = Math.max(0, F.pinCd - dt)
  if (F.pinner && (F.pinner.dead || F.pinner.hd?.phase !== 'pin' || !eng.map?.entities.includes(F.pinner))) releaseHoundPin(eng, 'drop') // 压住玩家的猎犬没了（死亡 / 卸载 / 换图）
  if (F.pinner) F.struggle = Math.max(0, F.struggle - HD.PIN_DECAY * dt)
  // 认领的尸体：认领者死了 / 走了就放手（尸体按原计时消失）
  for (const [c, h] of F.claims) if (h.dead || h.hd?.corpse !== c || !eng.map?.entities.includes(c)) F.claims.delete(c)
}
const once = (eng: Engine, key: string, text: string, kind: 'system' | 'damage' = 'system') => { const F = frameFor(eng); if (!F.told.has(key)) { F.told.add(key); eng.msg(text, kind) } }
const kindOf = (e: Entity) => e.def.houndKind ?? 'hostile'

export function initHound(eng: Engine, e: Entity, neutral = e.def.houndKind ? e.def.houndKind === 'neutral' : eng.levelDef.id === 11): HoundState {
  neutral = neutral && !e.provoked
  const s: HoundState = { neutral, phase: 'roam', t: 0, gazeT: 0, gazeCd: 0, alert: 0, lostT: 0,
    lastX: e.x + (eng.map?.inf?.ox ?? 0), lastY: e.y + (eng.map?.inf?.oy ?? 0), lastHp: Math.max(e.hp, e.def.hp),
    crouch: 0, howlPose: 0, sit: 0, jaw: 0, wag: 0, gazeHold: 0 }
  e.def = { ...e.def, houndKind: e.def.houndKind ?? (neutral ? 'neutral' : eng.levelDef.id === 3 ? 'ambusher' : 'hostile'), name: neutral ? '中立猎犬' : '猎犬' }
  e.hd = s
  return s
}
const setPhase = (s: HoundState, ph: HoundPhase) => { if (s.phase !== ph) { s.phase = ph; s.t = 0 } }

// ============================================================================
// 纯函数（check:hound 直接断言）
// ============================================================================
/** 猎犬头部（脸）的位置：窗口坐标 x/y + 高度 z */
export function houndHeadPos(e: Entity): { x: number; y: number; z: number } {
  const s = e.hd, h = (s?.phase === 'pin' ? HD.PIN_HEAD : HD.HEAD)[kindOf(e)] ?? HD.HEAD.hostile, sc = e.def.scale ?? 1
  const low = s && s.phase !== 'pin' ? s.crouch * HD.HEAD_CROUCH : 0
  return { x: e.x + Math.cos(e.facing) * h.fwd * sc, y: e.y + Math.sin(e.facing) * h.fwd * sc, z: e.z + (h.z - low + (s?.howlPose ?? 0) * 0.12) * sc }
}
/** 视线（准星）方向与「眼睛 → 头部」的夹角（弧度）与距离 */
export function houndGazeAngle(eye: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, head: { x: number; y: number; z: number }) {
  const vx = head.x - eye.x, vy = head.y - eye.y, vz = head.z - eye.z
  const dist = Math.hypot(vx, vy, vz), dl = Math.hypot(dir.x, dir.y, dir.z) || 1
  if (dist < 1e-4) return { ang: 0, dist }
  const c = (vx * dir.x + vy * dir.y + vz * dir.z) / (dist * dl)
  return { ang: Math.acos(Math.max(-1, Math.min(1, c))), dist }
}
/** 准星夹角阈值：基础锥 + 头部角半径 */
export const houndGazeCone = (dist: number) => HD.GAZE_CONE + Math.atan(HD.HEAD_R / Math.max(0.3, dist))
export interface HoundGaze { on: boolean; flash: boolean; dark: boolean; durK: number; ang: number; dist: number; cone: number; range: number }
/** 直视判定：夹角 + 距离；手电照脸加成，暗处减弱 */
export function houndGazeEval(ang: number, dist: number, flashOn: boolean, lit: boolean): HoundGaze {
  const cone = houndGazeCone(dist)
  const flash = flashOn && ang < HD.FLASH_CONE && dist < HD.FLASH_R
  const dark = !flash && !lit
  const range = flash ? HD.GAZE_R_FLASH : lit ? HD.GAZE_R : HD.GAZE_R_DARK
  const on = (ang < cone || flash) && dist < range
  return { on, flash, dark, durK: flash ? HD.DUR_FLASH : dark ? HD.DUR_DARK : 1, ang, dist, cone, range }
}
/** 威慑上限（秒）：基础 4 s（持续噪音 +2 s）× 时长倍数；高智能无限 */
export const houndGazeLimit = (noise: boolean, durK: number, l3: boolean) => l3 ? Infinity : (HD.GAZE_T + (noise ? HD.GAZE_NOISE_T : 0)) * durK
/** 包抄站位：玩家 (px,py)，头犬 (lx,ly)，side ±1，stage 0 = 横向绕开，1 = 侧后方收拢点 */
export function houndFlankGoal(px: number, py: number, lx: number, ly: number, side: number, stage: number, push = 0) {
  let ux = px - lx, uy = py - ly
  const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul
  const nx = -uy * side, ny = ux * side
  if (stage === 0) { const w = HD.FLANK_WIDE + push; return { x: px + nx * w - ux * 1, y: py + ny * w - uy * 1 } }
  return { x: px + nx * HD.FLANK_SIDE + ux * HD.FLANK_BEHIND, y: py + ny * HD.FLANK_SIDE + uy * HD.FLANK_BEHIND }
}

/** 玩家视线射线（真实引擎：Engine.crosshairRay；简化模拟引擎没有时返回 null，退回旧的 lookingAt） */
function viewRay(eng: Engine) {
  return typeof eng.crosshairRay === 'function' ? eng.crosshairRay() : null
}
/** 本帧对 e 的直视判定（含手电 / 明暗） */
export function houndGaze(eng: Engine, e: Entity, d: number): HoundGaze {
  const ray = viewRay(eng)
  if (!ray) { const on = d < HD.GAZE_R && eng.lookingAt(e); return { on, flash: false, dark: false, durK: 1, ang: on ? 0 : Math.PI, dist: d, cone: HD.GAZE_CONE, range: HD.GAZE_R } }
  const head = houndHeadPos(e)
  const { ang, dist } = houndGazeAngle(ray, { x: ray.dx, y: ray.dy, z: ray.dz }, head)
  const p = eng.player
  const flashOn = !!p.flashlight && (p.battery ?? 100) > 0
  const lit = typeof eng.isLit === 'function' ? eng.isLit(e.x, e.y) : true
  return houndGazeEval(ang, dist, flashOn, lit)
}

// ============================================================================
// 群猎编组
// ============================================================================
const alive = (eng: Engine, q: Entity) => !q.dead && !!eng.map?.entities.includes(q)
function packOf(F: ReturnType<typeof frameFor>, s: HoundState) { return s.pack !== undefined ? F.packs.get(s.pack) : undefined }
/** 就近合群（最多 PACK_MAX 只）；只有空闲（不在围猎中）的群会接收新成员 */
function joinPack(eng: Engine, F: ReturnType<typeof frameFor>, e: Entity, s: HoundState) {
  if (s.neutral || kindOf(e) === 'ambusher') return
  const cur = packOf(F, s)
  if (cur) {
    cur.members = cur.members.filter((q) => alive(eng, q))
    if (cur.phase === 'close' && cur.members.every((q) => !q.hd || q.hd.phase === 'roam' || q.hd.phase === 'search' || q.hd.phase === 'linger' || q.hd.phase === 'feed')) {
      cur.phase = 'idle'; cur.leader = undefined
      for (const q of cur.members) if (q.hd) { q.hd.role = undefined; q.hd.flankReady = false }
    }
    if (cur.members.length > 1 || cur.phase !== 'idle') return
  }
  for (const P of F.packs.values()) {
    if (P === cur) continue
    P.members = P.members.filter((q) => alive(eng, q))
    if (!P.members.length) { F.packs.delete(P.id); continue }
    if (P.phase !== 'idle' || P.members.length >= HD.PACK_MAX) continue
    if (P.members.some((q) => q.hd && !q.hd.neutral && Math.abs(q.z - e.z) < HD.Z_TOL && Math.hypot(q.x - e.x, q.y - e.y) < HD.PACK_R)) {
      if (cur) F.packs.delete(cur.id)
      P.members.push(e); s.pack = P.id
      return
    }
  }
  if (!cur) { const P: Pack = { id: F.nextPack++, members: [e], phase: 'idle', t: 0 }; F.packs.set(P.id, P); s.pack = P.id }
}
/** 头犬嚎叫：同群其余成员左右分开包抄 */
function startPackHunt(eng: Engine, F: ReturnType<typeof frameFor>, e: Entity, s: HoundState) {
  joinPack(eng, F, e, s)
  const P = packOf(F, s), p = eng.player
  if (!P || P.phase !== 'idle') return [] as Entity[]
  // 嚎叫那一刻把身边还没编组（或独自一只）的同类拉进来——第一帧就看见玩家时也能成群
  for (const q of eng.map!.entities) {
    if (P.members.length >= HD.PACK_MAX) break
    if (q === e || q.dead || q.def.type !== 'hound' || P.members.includes(q) || kindOf(q) === 'ambusher') continue
    const qs = q.hd ?? initHound(eng, q)
    if (qs.neutral || Math.abs(q.z - e.z) > HD.Z_TOL || Math.hypot(q.x - e.x, q.y - e.y) > HD.PACK_R) continue
    if (qs.phase !== 'roam' && qs.phase !== 'search' && qs.phase !== 'linger' && qs.phase !== 'feed') continue
    const qp = packOf(F, qs)
    if (qp && (qp.phase !== 'idle' || qp.members.filter((r) => alive(eng, r)).length > 1)) continue
    if (qp) F.packs.delete(qp.id)
    P.members.push(q); qs.pack = P.id
  }
  const mates = P.members.filter((q) => q !== e && alive(eng, q) && q.hd && !q.hd.neutral && Math.abs(q.z - e.z) < HD.Z_TOL && Math.hypot(q.x - e.x, q.y - e.y) < HD.HOWL_R)
  if (!mates.length) return mates
  P.phase = 'flank'; P.leader = e; P.t = 0; s.role = 'lead'
  // 第一只按它本来所在的一侧，第二只取另一侧
  let ux = p.x - e.x, uy = p.y - e.y; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul
  const q0 = mates[0], side0 = Math.sign((q0.x - p.x) * -uy + (q0.y - p.y) * ux) || 1
  mates.forEach((q, i) => {
    const qs = q.hd!
    qs.howled = true; qs.alert = HD.CALL_ALERT; qs.role = (i % 2 === 0 ? side0 : -side0) as 1 | -1
    qs.flankStage = 0; qs.flankReady = false; qs.strikeT = undefined
    dropCorpse(F, qs)
    setPhase(qs, 'flank')
  })
  once(eng, 'hflank', '两侧的黑暗里也响起了关节的湿响——它们不止一只，正分头绕到你身边。别只盯着正面那只。', 'damage')
  return mates
}
function closePack(eng: Engine, P: Pack) {
  P.phase = 'close'
  for (const q of P.members) if (alive(eng, q) && q.hd && (q.hd.phase === 'flank' || q.hd.phase === 'stalk')) setPhase(q.hd, 'charge')
  once(eng, 'hclose', '它们同时从几个方向扑了上来！', 'damage')
}

// ============================================================================
// 扑倒压制
// ============================================================================
/** 当前压住玩家的猎犬 */
export const houndPinner = (eng: Engine) => { const e = frameFor(eng).pinner; return e && !e.dead && e.hd?.phase === 'pin' && eng.map?.entities.includes(e) ? e : undefined }
/** 挣脱进度 0..1（HUD / 验收） */
export function houndPinProgress(eng: Engine) {
  const F = frameFor(eng), e = houndPinner(eng)
  if (!e) return 0
  return Math.min(1, F.struggle / (kindOf(e) === 'ambusher' ? HD.PIN_NEED_L3 : HD.PIN_NEED))
}
/** 挣脱 HUD 用的只读快照；没被压住时返回 null（HUD 据此隐藏） */
export interface HoundPinHud {
  progress: number // 挣脱进度 0..1（= houndPinProgress）
  struggle: number; need: number // 当前挣脱值 / 需要的值（hostile 8、ambusher 10）
  left: number; max: number // 剩余压制时间（最长 PIN_MAX 7 s）
  bite: number // 被咬红闪 0..1（咬下那一刻 1，BITE_FLASH 秒内线性消退）
  flash: boolean // 手电正照着它的脸（每秒 +PIN_FLASH）
  kind: 'hostile' | 'neutral' | 'ambusher'
}
export const PIN_BITE_FLASH = 0.45
export function houndPinOverlay(eng: Engine): HoundPinHud | null {
  const F = frameFor(eng), e = houndPinner(eng)
  if (!e || !e.hd) return null
  const kind = kindOf(e), need = kind === 'ambusher' ? HD.PIN_NEED_L3 : HD.PIN_NEED, s = e.hd, pt = s.pinT ?? 0
  const since = s.biteAt === undefined ? Infinity : pt - s.biteAt
  return {
    progress: Math.max(0, Math.min(1, F.struggle / need)), struggle: F.struggle, need,
    left: Math.max(0, HD.PIN_MAX - pt), max: HD.PIN_MAX,
    bite: since < PIN_BITE_FLASH ? 1 - since / PIN_BITE_FLASH : 0,
    flash: F.pinFlash, kind,
  }
}
/** 渲染层：是否处于被压倒视角 */
export const houndPinView = (eng: Engine) => houndPinner(eng) ? 1 : 0
/** 特殊交互键 X（engine/special.ts）：被压住时显示「挣脱」，移动端情境按钮同此 */
export function houndSpecial(eng: Engine): SpecialAction | null {
  return houndPinner(eng) ? { id: 'houndPin', label: '挣脱', hint: '连按挣脱压在身上的猎犬（交互 / 攻击键同样有效）', hold: false } : null
}
export function releaseHoundPin(eng: Engine, how: 'escape' | 'ally' | 'done' | 'drop' = 'drop') {
  const F = frameFor(eng), e = F.pinner
  if (!e) return
  F.pinner = undefined; F.struggle = 0; F.pinFlash = false; F.pinCd = HD.REPIN_CD
  eng.player.slowT = Math.max(eng.player.slowT ?? 0, 0.5)
  const s = e.hd
  if (!s || e.dead) return
  s.strikeT = undefined
  if (how === 'escape' || how === 'ally') {
    setPhase(s, 'stagger'); e.attackCd = Math.max(e.attackCd, HD.STAGGER_T + 0.6)
    eng.msg(how === 'ally' ? '一击砸在猎犬身上——它惨叫着从你身上滚了下去！' : '你拼命把猎犬从身上掀了下去——它踉跄着退开，甩着头。快走！', 'system')
  } else if (how === 'done') { setPhase(s, 'stalk'); e.attackCd = Math.max(e.attackCd, 1.2); eng.msg('猎犬松开了你，低吼着退开半步。', 'system') }
  else if (s.phase === 'pin') setPhase(s, 'stalk')
}
/** movement 钩子：被压住时接管玩家（返回 true 跳过本帧移动），并在这里逐帧统计连按 */
export function houndControlsPlayer(eng: Engine): boolean {
  const F = frameFor(eng), e = F.pinner
  if (!e) return false
  const p = eng.player
  if (e.dead || !eng.map?.entities.includes(e) || e.hd?.phase !== 'pin' || p.hp <= 0 || eng.dev?.frozenAI || eng.dev?.invisible || Math.abs(p.z - e.z) > HD.Z_TOL) {
    releaseHoundPin(eng, 'drop'); return false
  }
  const k = { a: !!eng.input.attack, i: !!eng.input.interact, j: !!eng.input.jump, x: !!eng.specialHeld }
  for (const n of ['a', 'i', 'j', 'x'] as const) if (k[n] && !F.keys[n]) F.struggle += HD.PIN_PRESS
  F.keys = k
  p.vz = 0
  return true
}
/** 压人时猎犬中心到玩家的距离（米，含体型缩放） */
const pinOffOf = (e: Entity) => (kindOf(e) === 'ambusher' ? HD.PIN_OFF_L3 : HD.PIN_OFF) * (e.def.scale ?? 1)
function startPin(eng: Engine, F: ReturnType<typeof frameFor>, e: Entity, s: HoundState) {
  F.pinner = e; F.struggle = 0
  { // 扑中那一刻就落在压人位置（不再从冲过头的地方滑回来）
    const p = eng.player, off = pinOffOf(e), dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy)
    if (d > 1e-3 && Math.abs(d - off) < 0.6) { e.x = p.x + dx / d * off; e.y = p.y + dy / d * off }
  }
  F.keys = { a: !!eng.input.attack, i: !!eng.input.interact, j: !!eng.input.jump, x: !!eng.specialHeld }
  setPhase(s, 'pin'); s.pinT = 0; s.biteT = HD.PIN_BITE_GAP; s.biteAt = 0; F.pinFlash = false // 扑中那一下也算一口（HUD 红闪）
  eng.player.crouching = false
  once(eng, 'hpin', '猎犬把你扑倒在地，压着你的胸口撕咬！连按交互 / 攻击键（移动端「挣脱」）挣脱——用手电照它的脸、同伴打它都能帮你。', 'damage')
}

// ============================================================================
// 尸体
// ============================================================================
function dropCorpse(F: ReturnType<typeof frameFor>, s: HoundState) {
  if (s.corpse) F.claims.delete(s.corpse)
  s.corpse = undefined; s.feedT = 0; s.dragged = false
}
function findCorpse(eng: Engine, F: ReturnType<typeof frameFor>, e: Entity) {
  let best: Entity | undefined, bd = HD.CORPSE_SENSE
  for (const q of eng.map!.entities) {
    if (!q.dead || q.deathT <= 0 || q.hidden || !HD.FOOD.includes(q.def.type) || F.claims.has(q) || Math.abs(q.z - e.z) > HD.Z_TOL) continue
    const d = Math.hypot(q.x - e.x, q.y - e.y)
    if (d < bd) { bd = d; best = q }
  }
  return best
}

/** noiseEvent 钩子 */
export function houndHear(eng: Engine, e: Entity, x: number, y: number, radius: number, sprint: boolean) {
  const s = e.hd ?? initHound(eng, e)
  const feeding = s.phase === 'feed' || s.phase === 'drag'
  const r = Math.max(radius, e.def.hearing * (sprint ? 1.6 : 1)) * (feeding ? HD.FEED_HEAR_K : 1)
  const dd = Math.hypot(e.x - x, e.y - y)
  if (dd >= r) return
  if (s.neutral) { if (sprint && dd < HD.N_FLEE_R) { setPhase(s, 'flee'); audio.houndHowl(0.25, 1.9, 0.35) } return }
  if (feeding) { if (sprint && dd < HD.FEED_SPRINT_R) { s.startle = true; s.lastX = x + (eng.map?.inf?.ox ?? 0); s.lastY = y + (eng.map?.inf?.oy ?? 0) } return }
  s.lastX = x + (eng.map?.inf?.ox ?? 0); s.lastY = y + (eng.map?.inf?.oy ?? 0)
  if (s.phase === 'roam' || s.phase === 'linger') { setPhase(s, 'search'); s.alert = Math.max(s.alert, HD.HEAR_ALERT); s.searchLeft = HD.SEARCH_T; s.cx = undefined }
}

function turnHostile(eng: Engine, e: Entity, s: HoundState, d: number) {
  if (!s.neutral) return
  s.neutral = false
  e.provoked = true
  e.def = { ...e.def, name: '猎犬' }
  setPhase(s, 'howl')
  if (d < 14) eng.msg('中立猎犬龇出满口利齿——它不再中立了。', 'damage')
  for (const q of eng.map!.entities) {
    if (q === e || q.dead || q.def.type !== 'hound' || Math.abs(q.z - e.z) > HD.Z_TOL || Math.hypot(q.x - e.x, q.y - e.y) >= HD.N_PROVOKE_R) continue
    const qs = q.hd ?? initHound(eng, q)
    if (qs.neutral) { qs.neutral = false; q.provoked = true; q.def = { ...q.def, name: '猎犬' }; setPhase(qs, 'charge') }
  }
}

/** Player damage is processed before the next AI tick, including a lethal first hit. */
export function provokeHound(eng: Engine, e: Entity) {
  if (e.def.type !== 'hound') return
  const F = frameFor(eng)
  // 压着玩家时挨打：联机同伴的攻击（房主结算 entHit）直接解救，自己打中它也算挣扎
  if (F.pinner === e) {
    if (e.dead || e.hp <= 0) { releaseHoundPin(eng, 'drop'); return }
    if (eng.applyingNet) { releaseHoundPin(eng, 'ally'); return }
    F.struggle += HD.PIN_HIT
  }
  if (e.dead) return
  const s = e.hd ?? initHound(eng, e)
  if (s.neutral && e.hp < s.lastHp) {
    turnHostile(eng, e, s, Math.hypot(e.x - eng.player.x, e.y - eng.player.y))
    s.lastHp = e.hp // Do not replace the provocation howl with a second hurt transition.
  }
}

/** 在 (cx,cy) 附近换一个嗅探点（世界坐标） */
function sniffPoint(s: HoundState, r: number) {
  const a = Math.random() * Math.PI * 2, k = 0.4 + Math.random() * 0.6
  s.wx = (s.cx ?? s.lastX) + Math.cos(a) * r * k; s.wy = (s.cy ?? s.lastY) + Math.sin(a) * r * k; s.sniffT = HD.SNIFF_GAP
}

export function updateHound(eng: Engine, e: Entity, dt: number, d: number, dmgMult: number, l3: boolean) {
  const F = frameFor(eng)
  const p = eng.player, m = eng.map!, def = e.def
  const ox = m.inf?.ox ?? 0, oy = m.inf?.oy ?? 0
  const s = e.hd ?? initHound(eng, e)
  if (kindOf(e) === 'ambusher') l3 = true
  s.t += dt; s.gazeCd -= dt; s.alert = Math.max(0, s.alert - dt)
  if (s.feedCd !== undefined) s.feedCd -= dt
  const hurt = e.hp < s.lastHp
  s.lastHp = e.hp
  const feeding = s.phase === 'feed' || s.phase === 'drag'
  const zOk = Math.abs(e.z - p.z) < HD.Z_TOL
  const los = !eng.dev.invisible && d < HD.LOS_MAX && zOk && eng.los(e.x, e.y, p.x, p.y)
  const G = los ? houndGaze(eng, e, d) : null
  const gazing = !!G?.on
  s.gazeOn = gazing; s.gazeFlash = !!G?.flash
  s.gazeHold = gazing ? s.gazeHold + dt : 0
  const sight = def.sight * (s.alert > 0 ? HD.ALERT_SIGHT_K : 1) * (feeding ? HD.FEED_SIGHT_K : 1)
  const sees = los && (d < sight || (feeding && d < HD.FEED_NOTICE_R))
  const panic = eng.input.sprint && F.speed > HD.PANIC_SPEED
  let speed = 0, tx = e.x, ty = e.y, face: [number, number] | null = null
  const P = packOf(F, s)
  if (s.phase === 'roam' || s.phase === 'search' || s.phase === 'linger') joinPack(eng, F, e, s)

  if (hurt && s.phase !== 'pin') {
    if (feeding) dropCorpse(F, s)
    if (s.neutral) turnHostile(eng, e, s, d)
    else if (e.hp < def.hp * HD.FLEE_HP) { setPhase(s, 'flee'); once(eng, 'hflee', '猎犬哀嚎一声，拖着身子逃进了黑暗。') }
    else if (s.phase !== 'stagger') { s.howled = true; setPhase(s, 'charge') }
  }
  if (hurt && s.phase === 'pin' && e.hp < def.hp * HD.FLEE_HP) { releaseHoundPin(eng, 'drop'); setPhase(s, 'flee') }

  // Keep L3's ambush in the same state machine so cowering can resume when gaze breaks.
  if (l3 && !s.neutral && !hurt && (s.phase === 'roam' || s.phase === 'search') && s.alert <= 0) {
    if (sees && eng.viewAngle(e.x, e.y) > 1.2) {
      e.activated = true; s.howled = true; setPhase(s, 'charge')
      once(eng, 'hambush', '背后响起湿冷的关节摩擦声——猎犬趁你背对它扑了上来！', 'damage'); audio.aggro()
    } else { e.state = 'idle'; e.targetX = e.x; e.targetY = e.y; return }
  }

  if (s.neutral) {
    // ---------- L11 中立变种 ----------
    e.state = 'wander'
    if (panic && los && d < HD.N_FLEE_R && s.phase !== 'flee') { setPhase(s, 'flee'); audio.houndHowl(0.25, 1.9, 0.35) }
    if (s.phase === 'flee') {
      const a = Math.max(0.1, d); tx = e.x + (e.x - p.x) / a * 5; ty = e.y + (e.y - p.y) / a * 5; speed = def.speed * 0.9
      if (s.t > HD.N_FLEE_T) setPhase(s, 'roam')
    } else if ((s.lookAwayT ?? 0) > 0) {
      s.lookAwayT = Math.max(0, s.lookAwayT! - dt); tx = e.targetX; ty = e.targetY; speed = def.speed * 0.3
    } else if (los && d < HD.N_SEE) {
      once(eng, 'hneutral', '一只猎犬远远蹲坐着打量你，尾巴慢慢摆动。城市里的它们似乎没有敌意。')
      const keep = p.crouching ? HD.N_KEEP_CROUCH : HD.N_KEEP
      if (gazing) s.gazeT += dt; else s.gazeT = Math.max(0, s.gazeT - dt * 0.5)
      if (s.gazeT > HD.N_STARE_T) { setPhase(s, 'roam'); s.gazeT = 0; eng.wanderTarget(e); e.stateT = 5; s.lookAwayT = HD.N_LOOKAWAY_T; tx = e.targetX; ty = e.targetY; speed = def.speed * 0.3 } // 被盯久了，扭头走开
      else if (d < keep - 0.4) { setPhase(s, 'watch'); const a = Math.max(0.1, d); tx = e.x + (e.x - p.x) / a * 2; ty = e.y + (e.y - p.y) / a * 2; speed = def.speed * 0.35; face = [p.x, p.y] }
      else if (p.crouching && d > keep + 0.6 && F.speed < 0.3) { setPhase(s, 'watch'); tx = p.x; ty = p.y; speed = def.speed * 0.18; face = [p.x, p.y] } // 蹲下不动时好奇地凑近
      else { setPhase(s, 'sit'); face = [p.x, p.y] }
    } else {
      setPhase(s, 'roam')
      if (e.stateT <= 0 || Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.4) eng.wanderTarget(e)
      tx = e.targetX; ty = e.targetY; speed = def.speed * 0.3
    }
  } else {
    // ---------- 敌对 ----------
    if (sees) { s.lastX = p.x + ox; s.lastY = p.y + oy; s.lostT = 0 } else s.lostT += dt
    // 进食中被惊醒：近处看见 / 近处狂奔 / 受击（上面已处理）
    if (feeding && (sees || s.startle)) {
      dropCorpse(F, s); s.startle = false
      setPhase(s, s.howled ? (d < HD.STALK_CHARGE_D ? 'charge' : 'stalk') : 'howl')
      once(eng, 'hfeedwake', '猎犬猛地从尸体上抬起头——它发现你了！', 'damage')
    }
    // 首次目击：嚎叫召集
    if (sees && (s.phase === 'roam' || s.phase === 'search' || s.phase === 'linger')) {
      if (!s.howled) setPhase(s, 'howl')
      else setPhase(s, panic || d < HD.STALK_CHARGE_D ? 'charge' : 'stalk')
    }
    // 看见它就逃跑 → 冲锋
    if (sees && panic && d < 14 && (s.phase === 'stalk' || s.phase === 'cower' || (s.phase === 'flank' && d < 8))) { setPhase(s, 'charge'); once(eng, 'hpanic', '你转身就跑——猎犬四肢着地猛冲过来！', 'damage') }
    // 直视：伏低后退，短暂有效（准星要对准头部；手电照脸更快更久，暗处更难）
    const limit = houndGazeLimit(eng.playerNoiseT > 0, 1, l3)
    const canCower = s.phase === 'stalk' || s.phase === 'charge' || s.phase === 'search' || s.phase === 'flank' || s.phase === 'linger'
    if (gazing && s.gazeCd <= 0 && canCower && s.gazeHold >= (G!.dark ? HD.TRIGGER_DARK : 0)) {
      setPhase(s, 'cower'); s.strikeT = undefined
      once(eng, 'hgaze', '你死死盯住猎犬的脸——它伏低身子，一步步向后退。别指望这能撑多久。')
      if (G!.flash) once(eng, 'hgazeflash', '手电光直直照在它脸上，它眯着眼往后缩得更厉害了。')
    }
    if (s.phase === 'cower') {
      if (gazing) s.gazeT += dt / (G?.durK ?? 1)
      if (s.gazeT > limit) { s.gazeT = 0; s.gazeCd = HD.HABIT_T; setPhase(s, 'charge'); eng.msg('猎犬习惯了你的目光，低吼着再次扑来！', 'damage'); audio.aggro() }
      else if (!gazing && s.t > HD.COWER_MIN_T) { setPhase(s, 'stalk') }
    } else s.gazeT = Math.max(0, s.gazeT - dt * 0.35)

    // 附近刚死的猎物：没在追猎时去认领
    if ((s.phase === 'roam' || s.phase === 'search' || s.phase === 'linger') && kindOf(e) !== 'ambusher' && (s.feedCd ?? 0) <= 0 && !sees) {
      s.scanT = (s.scanT ?? 0) - dt
      if (s.scanT <= 0) {
        s.scanT = HD.CORPSE_SCAN
        const c = findCorpse(eng, F, e)
        if (c) { s.corpse = c; s.feedT = 0; s.dragged = false; F.claims.set(c, e); setPhase(s, 'feed') }
      }
    }
    const pinner = houndPinner(eng), ringHold = !!pinner && pinner !== e // 同伴已经压住玩家：在外圈等，不一起扑
    switch (s.phase) {
      case 'roam': {
        e.state = 'wander'
        if (e.stateT <= 0 || Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.4) eng.wanderTarget(e)
        tx = e.targetX; ty = e.targetY; speed = def.speed * HD.ROAM_K
        break
      }
      case 'howl': {
        e.state = 'chase'; face = [p.x, p.y]
        if (!s.howled) {
          s.howled = true; s.alert = Math.max(s.alert, HD.CALL_ALERT) // 嚎叫者自己也进入围猎（视野增强），头犬在 LEAD_HOLD 处才看得见玩家
          audio.houndHowl(Math.max(0.2, 1 - d / 26), 1, 1.3)
          once(eng, 'hhowl', '一声拖长的嚎叫在走廊里回荡——其他猎犬会循声而来。躲到它们的视线之外！', 'damage')
          const mates = startPackHunt(eng, F, e, s)
          for (const q of m.entities) {
            if (q === e || q.dead || q.def.type !== 'hound' || mates.includes(q)) continue
            if (Math.hypot(q.x - e.x, q.y - e.y) > HD.HOWL_R || Math.abs(q.z - e.z) > HD.Z_TOL) continue
            const qs = q.hd ?? initHound(eng, q)
            if (qs.neutral) continue
            qs.alert = HD.CALL_ALERT; qs.lastX = e.x + ox; qs.lastY = e.y + oy; qs.howled = true
            // 嚎叫搜寻期：朝声源方位前去，到了在附近嗅探
            if (qs.phase === 'roam' || qs.phase === 'linger' || qs.phase === 'search') { setPhase(qs, 'search'); qs.searchLeft = HD.SEARCH_T; qs.cx = undefined }
            if (qs.phase === 'feed' || qs.phase === 'drag') { dropCorpse(F, qs); setPhase(qs, 'search'); qs.searchLeft = HD.SEARCH_T; qs.cx = undefined }
          }
        }
        if (s.t > HD.HOWL_T) setPhase(s, P?.phase === 'flank' && P.leader === e ? 'stalk' : d < HD.HOWL_CHARGE_D ? 'charge' : 'stalk')
        break
      }
      case 'search': {
        e.state = 'investigate'
        s.searchLeft = (s.searchLeft ?? HD.SEARCH_T) - dt
        const lx = s.lastX - ox, ly = s.lastY - oy
        if (s.cx === undefined && Math.hypot(lx - e.x, ly - e.y) > HD.SEARCH_ARRIVE) { tx = lx; ty = ly; speed = def.speed * HD.SEARCH_K }
        else {
          // 到了声源：在附近来回嗅探
          if (s.cx === undefined) { s.cx = s.lastX; s.cy = s.lastY; sniffPoint(s, HD.SEARCH_R) }
          s.sniffT = (s.sniffT ?? 0) - dt
          if (s.sniffT <= 0 || Math.hypot(s.wx! - ox - e.x, s.wy! - oy - e.y) < 0.4) sniffPoint(s, HD.SEARCH_R)
          tx = s.wx! - ox; ty = s.wy! - oy; speed = def.speed * HD.LINGER_K
        }
        if (s.searchLeft <= 0 || s.t > HD.SEARCH_T + 6) { setPhase(s, 'roam'); s.cx = undefined }
        break
      }
      case 'linger': { // 躲出视线后：在最后看到玩家的位置徘徊
        e.state = 'investigate'
        const lx = s.lastX - ox, ly = s.lastY - oy
        if (s.cx === undefined && Math.hypot(lx - e.x, ly - e.y) > HD.SEARCH_ARRIVE) { tx = lx; ty = ly; speed = def.speed * HD.SEARCH_K }
        else {
          if (s.cx === undefined) { s.cx = s.lastX; s.cy = s.lastY; s.lingerLeft = HD.LINGER_T; sniffPoint(s, HD.LINGER_R) }
          s.lingerLeft = (s.lingerLeft ?? HD.LINGER_T) - dt; s.sniffT = (s.sniffT ?? 0) - dt
          if (s.sniffT <= 0 || Math.hypot(s.wx! - ox - e.x, s.wy! - oy - e.y) < 0.35) sniffPoint(s, HD.LINGER_R)
          tx = s.wx! - ox; ty = s.wy! - oy; speed = def.speed * HD.LINGER_K
          if (s.lingerLeft <= 0) { setPhase(s, 'roam'); s.cx = undefined }
        }
        if (s.t > HD.LINGER_T + 12) { setPhase(s, 'roam'); s.cx = undefined }
        break
      }
      case 'stalk': {
        e.state = 'chase'
        tx = sees ? p.x : s.lastX - ox; ty = sees ? p.y : s.lastY - oy; speed = def.speed * HD.STALK_K; face = sees ? [p.x, p.y] : null
        if (P?.phase === 'flank' && P.leader === e) {
          // 头犬：正面吸引，保持距离等两翼就位
          P.t += dt
          if (sees && d < HD.LEAD_HOLD - 0.6) { const a = Math.max(0.1, d); tx = e.x + (e.x - p.x) / a * 2; ty = e.y + (e.y - p.y) / a * 2; speed = def.speed * HD.COWER_K * 1.4 }
          else if (sees && d < HD.LEAD_HOLD + 0.6) speed = 0
          const wings = P.members.filter((q) => q !== e && alive(eng, q) && q.hd?.phase === 'flank')
          if (!wings.length || wings.every((q) => q.hd!.flankReady) || P.t > HD.FLANK_MAX || (sees && d < HD.LEAD_MIN)) closePack(eng, P)
          if (s.lostT > HD.LOST_STALK) { P.phase = 'idle'; for (const q of P.members) if (q.hd?.phase === 'flank') { setPhase(q.hd, 'linger'); q.hd.lastX = s.lastX; q.hd.lastY = s.lastY; q.hd.cx = undefined } }
        } else if (sees && d < HD.STALK_CHARGE_D && !ringHold) setPhase(s, 'charge')
        if (s.lostT > HD.LOST_STALK && s.phase === 'stalk') { setPhase(s, 'linger'); s.cx = undefined; s.alert = Math.max(s.alert, 4) }
        break
      }
      case 'flank': {
        e.state = 'chase'
        const L = P?.leader
        if (!P || P.phase !== 'flank' || !L || !alive(eng, L)) { setPhase(s, sees ? 'charge' : 'linger'); s.cx = undefined; break }
        const inView = los && eng.viewAngle(e.x, e.y) < HD.FLANK_VIEW
        const g = houndFlankGoal(p.x, p.y, L.x, L.y, s.role === -1 ? -1 : 1, s.flankStage ?? 0, inView ? HD.FLANK_PUSH : 0)
        const gd = Math.hypot(g.x - e.x, g.y - e.y)
        if ((s.flankStage ?? 0) === 0 && gd < HD.FLANK_READY_R * 1.6) s.flankStage = 1
        else if (s.flankStage === 1 && gd < HD.FLANK_READY_R) s.flankReady = true
        tx = g.x; ty = g.y; speed = s.flankReady ? def.speed * HD.STALK_K * 0.5 : def.speed * HD.FLANK_K
        if (s.flankReady) face = [p.x, p.y]
        // 两翼都就位（或绕太久）→ 全体收拢；头犬被盯住伏低时也照样收拢
        const wings = P.members.filter((q) => q !== L && alive(eng, q) && q.hd?.phase === 'flank')
        if (wings.every((q) => q.hd!.flankReady) || s.t > HD.FLANK_MAX) closePack(eng, P)
        else if (sees && d < HD.FLANK_CLOSE_D) setPhase(s, 'charge')
        break
      }
      case 'charge': {
        e.state = 'chase'
        tx = sees ? p.x : s.lastX - ox; ty = sees ? p.y : s.lastY - oy
        speed = def.speed * (l3 ? HD.CHARGE_K_L3 : HD.CHARGE_K)
        face = [p.x, p.y]
        if (ringHold) { const a = Math.max(0.1, d); if (d < HD.PIN_RING) { tx = e.x + (e.x - p.x) / a; ty = e.y + (e.y - p.y) / a; speed = def.speed * HD.STALK_K } else if (d < HD.PIN_RING + 0.8) speed = 0 }
        // 追丢：离得远，或已经扑到最后看到玩家的位置还是看不见 → 在那里徘徊
        if (s.lostT > HD.LOST_CHARGE && (d > HD.LOST_CHARGE_D || Math.hypot(s.lastX - ox - e.x, s.lastY - oy - e.y) < HD.SEARCH_ARRIVE * 1.5)) { setPhase(s, 'linger'); s.cx = undefined; s.alert = 6 }
        break
      }
      case 'cower': {
        e.state = 'stunned'
        face = [p.x, p.y]
        if (!l3) { const a = Math.max(0.1, d); tx = e.x + (e.x - p.x) / a * 2; ty = e.y + (e.y - p.y) / a * 2; speed = def.speed * HD.COWER_K }
        break
      }
      case 'flee': {
        e.state = 'investigate'
        const a = Math.max(0.1, d); tx = e.x + (e.x - p.x) / a * 5; ty = e.y + (e.y - p.y) / a * 5; speed = def.speed * HD.FLEE_K
        if (s.t > HD.FLEE_T) setPhase(s, 'roam')
        break
      }
      case 'pin': {
        e.state = 'attack'
        if (F.pinner !== e) { setPhase(s, 'stalk'); break }
        // 压在玩家身上：身体中心在玩家前方 PIN_OFF，前爪落在玩家胸口（渲染层按玩家实际位置给落点）
        const off = pinOffOf(e)
        tx = p.x - Math.cos(e.facing) * off; ty = p.y - Math.sin(e.facing) * off
        face = [p.x, p.y]
        // 退到压人站位：stepEntity 在目标 0.3 m 内不动（扑中时贴多近就会一直贴多近，第一人称镜头会穿进它头里），
        // 所以 1 m 内直接快速平滑过去（≈0.2 s；站位在它扑来的那条线上，刚走过，不会进墙）；更远时照常走碰撞
        const dd = Math.hypot(tx - e.x, ty - e.y)
        if (dd > 0.02) {
          e.targetX = tx; e.targetY = ty
          if (dd < 1) { const k = Math.min(1, dt * 14); e.x += (tx - e.x) * k; e.y += (ty - e.y) * k } else eng.stepEntity(e, 3, dt)
        }
        s.pinT = (s.pinT ?? 0) + dt; s.biteT = (s.biteT ?? HD.PIN_BITE_GAP) - dt
        p.slowT = Math.max(p.slowT ?? 0, HD.PIN_SLOW)
        if (s.biteT <= 0) { s.biteT += HD.PIN_BITE_GAP; s.biteAt = s.pinT; eng.hurtPlayer(HD.PIN_BITE * dmgMult, def.name); eng.camShake = Math.min(1, eng.camShake + 0.35) }
        F.pinFlash = !!G?.flash
        if (G?.flash) F.struggle += HD.PIN_FLASH * dt // 手电照脸：它偏头躲光，压得没那么死
        const need = kindOf(e) === 'ambusher' ? HD.PIN_NEED_L3 : HD.PIN_NEED
        if (p.hp <= 0) releaseHoundPin(eng, 'drop')
        else if (F.struggle >= need) releaseHoundPin(eng, 'escape')
        else if (s.pinT > HD.PIN_MAX) releaseHoundPin(eng, 'done')
        else if (d > HD.PIN_DIST_MAX) releaseHoundPin(eng, 'drop')
        break
      }
      case 'stagger': { // 被掀翻后的硬直：甩头、踉跄后退
        e.state = 'stunned'; face = [p.x, p.y]
        const a = Math.max(0.1, d); tx = e.x + (e.x - p.x) / a; ty = e.y + (e.y - p.y) / a; speed = def.speed * (HD.STAGGER_K + HD.STAGGER_SHOVE * Math.exp(-s.t / HD.STAGGER_SHOVE_TAU))
        if (s.t > HD.STAGGER_T) setPhase(s, sees ? 'stalk' : 'linger')
        break
      }
      case 'feed': case 'drag': {
        const c = s.corpse
        if (!c || !m.entities.includes(c) || F.claims.get(c) !== e) { dropCorpse(F, s); setPhase(s, 'roam'); break }
        c.deathT = Math.max(c.deathT, HD.CORPSE_HOLD)
        once(eng, 'hfeed', '一只猎犬伏在尸体上撕扯——它现在没那么警觉，趁机离开。')
        if (s.phase === 'drag') {
          // 拖走：叼着尸体背离玩家
          e.state = 'investigate'
          const a = Math.max(0.1, d); tx = e.x + (e.x - p.x) / a * 3; ty = e.y + (e.y - p.y) / a * 3; speed = def.speed * HD.DRAG_K
          const f = e.facing; c.x = e.x + Math.cos(f) * HD.MOUTH * (def.scale ?? 1); c.y = e.y + Math.sin(f) * HD.MOUTH * (def.scale ?? 1)
          if (s.t > HD.DRAG_T) { s.dragged = true; setPhase(s, 'feed') }
          break
        }
        const dc = Math.hypot(c.x - e.x, c.y - e.y)
        if (dc > HD.FEED_REACH) { e.state = 'investigate'; tx = c.x; ty = c.y; speed = def.speed * HD.SEARCH_K; break }
        if (!s.dragged && los && d < HD.DRAG_R) { setPhase(s, 'drag'); break }
        e.state = 'idle'; face = [c.x, c.y]
        s.feedT = (s.feedT ?? 0) + dt
        if (s.feedT > HD.FEED_T) { F.claims.delete(c); s.corpse = undefined; s.feedCd = HD.FEED_CD; setPhase(s, 'roam') }
        break
      }
      default: setPhase(s, 'roam')
    }

    // 扑击：2.4m 内起跳（前摇 0.3s 带前冲），命中震动与减速；冲锋扑中 → 扑倒压制
    if (!los || s.phase === 'cower' || s.phase === 'flee' || s.phase === 'pin' || s.phase === 'stagger') s.strikeT = undefined
    if (s.strikeT !== undefined) {
      s.strikeT -= dt
      // 前冲停在压人距离（PIN_OFF）：原来 0.3 s × 7 m/s 会冲到玩家脚下 0.3–0.5 m，扑中那一帧头正好盖在第一人称镜头上（实机 1-hit 前两帧镜头在下巴底下）
      const stopR = pinOffOf(e)
      tx = p.x; ty = p.y; speed = Math.min(HD.STRIKE_SPEED, Math.max(0, d - stopR) / Math.max(dt, 1e-3)); face = [p.x, p.y]
      if (s.strikeT <= 0) {
        s.strikeT = undefined
        let pinned = false
        if (d < HD.STRIKE_HIT_R && los && eng.meleeZOk(e) && !eng.dev.invisible) {
          eng.hurtPlayer(def.damage * dmgMult, def.name)
          eng.camShake = Math.min(1, eng.camShake + HD.HIT_SHAKE)
          p.slowT = Math.max(p.slowT, HD.HIT_SLOW)
          if (!houndPinner(eng) && F.pinCd <= 0 && p.hp > 0) { startPin(eng, F, e, s); pinned = true }
        }
        if (!pinned) setPhase(s, 'stalk')
      }
    } else if (s.phase === 'charge' && !ringHold && los && d < HD.STRIKE_R && e.attackCd <= 0 && eng.meleeZOk(e)) {
      e.attackCd = HD.STRIKE_CD; e.lungeT = HD.STRIKE_LUNGE; s.strikeT = HD.STRIKE_WIND
    }
  }

  if (speed > 0) {
    e.targetX = tx; e.targetY = ty
    const f0 = e.facing
    const stuck = eng.stepEntity(e, speed, dt)
    // stepEntity 会把朝向直接拧到移动方向；要「面朝玩家往后退」（硬直、压人站位、外圈让开）时保留原朝向，交给下面 faceToward
    // （否则每帧被拧向背后再转回 8×dt，实机 4-stagger 猎犬侧身对着镜头）
    if (face && Math.cos(Math.atan2(ty - e.y, tx - e.x) - Math.atan2(face[1] - e.y, face[0] - e.x)) < 0) e.facing = f0
    if (stuck && (s.phase === 'roam')) eng.wanderTarget(e)
    if (stuck && (s.phase === 'search' || s.phase === 'linger') && s.cx !== undefined) s.sniffT = 0
    e.animT += dt * speed
  }
  if (face) eng.faceToward(e, face[0], face[1], dt, 8)
  else if (speed > 0) eng.faceToward(e, tx, ty, dt, 8)
  // 外观姿态量
  const k = Math.min(1, dt * 5)
  s.crouch += ((s.phase === 'cower' ? 1 : s.phase === 'stalk' || s.phase === 'flank' ? 0.45 : s.phase === 'feed' ? 0.3 : 0) - s.crouch) * k
  s.howlPose += ((s.phase === 'howl' ? 1 : 0) - s.howlPose) * k
  s.sit += ((s.phase === 'sit' ? 1 : 0) - s.sit) * k * 0.6
  s.jaw += ((s.phase === 'howl' || s.strikeT !== undefined || s.phase === 'pin' ? 1 : s.phase === 'charge' ? 0.55 : s.phase === 'cower' ? 0.25 : s.phase === 'feed' ? 0.5 : 0) - s.jaw) * k
  s.wag = s.neutral && (s.phase === 'sit' || s.phase === 'watch') ? 1 : 0
}
