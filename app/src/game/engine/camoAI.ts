// 迷彩爬行者（Entity 31）重制阶段 3：游戏机制（ZAN 2026-10-22 确认的设定）。
//  · 静止时背贴岩壁伪装（uCamo≈0.95），远处几乎看不出来，只剩乳白盲眼和一圈很淡的暗边。
//  · 完全失明，只靠声音：跑步/跳跃落地/开枪/投掷物落地/挥击/交互声都会进入本模块的声音事件队列；
//    蹲行（响度 1）低于听觉阈值，几乎不会被听见。
//  · 听到声音 → reveal（现身）→ listen（歪头朝向声源，从 t=0.6s 接）→ 第一只发现目标的个体 call（召唤），
//    25m 内同伴全部惊醒赶来 → 走（stalk）或冲（charge）向声源最后的位置。
//  · 近身（≤2.2m）举石砸地：lift + slam，在 CAMO_SLAM_IMPACT_T 触地，震伤半径 2.5m、中心 35、向外线性衰减，
//    附带镜头震动、踉跄（减速 + 轻微推开）。砸完的巨石留在原地 45 秒，玩家不能穿过（可作掩体）。远程投石已取消。
//  · 投掷物落点的声音能把它们引开：到落点后播 distracted 10–12 秒（原通用 investigate 6 秒，约 ×1.8），期间不理会轻微噪音。
//  · 失去声源 12–20 秒后走回岩壁，重新伪装。
// 模块只依赖 Engine 的公开接口；运行时状态挂在 e.cc（不入存档/联机）。数值表：CAMO（见 app/CAMO-REMAKE.md）。
import type { Engine } from '../engine'
import type { Entity } from '../entities'
import type { GameMap } from '../world/mapgen'
import { floorHeight, walkableAt, tileAt } from '../world/mapgen'
import { canOccupy, PLAYER_RADIUS } from '../core/player'
import { audio } from '../core/audio'
import { l8VolumeColumn, l8VolumeField } from '../world/infiniteL8'
import { camoWallSpot, camoRand } from '../world/camoSpawn'
import { CAMO_CLIPS, CAMO_SLAM_IMPACT_T, CAMO_SLAM_IMPACT_POINT, CAMO_LIFT_GRAB_T, CAMO_WALK_SPEED, CAMO_RUN_SPEED, CAMO_IDLE_LEVEL, type CamoClip } from '../renderer/camoCrawlerAnim'

// ---------------------------------------------------------------------------
// 数值表
// ---------------------------------------------------------------------------
export const CAMO = {
  // —— 听觉 ——
  /** 伪装中：声源距离 ≤ 响度半径 × 1.15 才听得见（失明，不会把小声放大） */
  HEAR_SCALE: 1.15,
  /** 已惊醒（搜索/追击中）更专注：× 1.4 */
  HEAR_SCALE_ALERT: 1.4,
  /** 响度半径低于此值完全听不见（蹲行 = 1，普通行走 = 4，奔跑 = 10） */
  MIN_LOUD: 1.5,
  // —— 现身 / 听声 / 召唤 ——
  REVEAL_T: CAMO_CLIPS.reveal.len, // 1.2s
  /** reveal 结束后 listen 从片段 t=0.6s 接 */
  LISTEN_START: 0.6,
  LISTEN_T: 1.6,
  CALL_T: CAMO_CLIPS.call.len, // 2.0s
  /** 召唤半径：范围内的同伴全部惊醒 */
  CALL_R: 25,
  // —— 移动 ——
  STALK_SPEED: 1.5,
  CHARGE_SPEED: 4.2, // 玩家行走 3.4、奔跑 6.0：走着逃不掉，跑得掉
  RETURN_SPEED: 1.1,
  /** 声源响度 ≥ 此值或距离 < CHARGE_NEAR 时冲刺，否则潜行靠近 */
  CHARGE_LOUD: 9,
  CHARGE_NEAR: 8,
  /** 卡住多久（秒）视为到达 */
  STUCK_T: 1.0,
  // —— 近身攻击 ——
  ATTACK_R: 2.2,
  /** 贴身（无论是否出声都能察觉） */
  TOUCH_R: 1.2,
  /** 最近 2.5s 内听到的声源离玩家 < 3m，就认为玩家就在那儿 */
  SENSE_QUIET: 2.5,
  SENSE_SRC_R: 3,
  LIFT_T: CAMO_CLIPS.lift.len, // 1.0s
  SLAM_T: CAMO_CLIPS.slam.len, // 0.8s
  RECOVER_T: 0.7,
  ATTACK_CD: 0.9,
  SLAM_IMPACT_T: CAMO_SLAM_IMPACT_T, // 0.45s
  SLAM_R: 2.5,
  SLAM_DMG: 35,
  /** 边缘伤害比例（线性衰减到 R 处为 35×0.3=10.5） */
  SLAM_EDGE: 0.3,
  /** 镜头震动的影响半径 */
  SLAM_SHAKE_R: 7,
  /** 踉跄：减速秒数（中心）与推开距离 */
  SLAM_SLOW: 1.4,
  SLAM_PUSH: 0.55,
  /** 砸地本身的响度（会把附近同伴引过来） */
  SLAM_LOUD: 12,
  // —— 引开 ——
  /** 投掷物落点的响度（所有投掷物统一） */
  THROW_LOUD: 12,
  /** 原通用 investigate 引开 6s；重制为 10–12s */
  DISTRACT_MIN: 10,
  DISTRACT_MAX: 12,
  /** 被引开期间（赶往落点 + distracted）忽略响度 < 9 的普通噪音（行走、挥击、跳跃落地） */
  DISTRACT_IGNORE: 9,
  // —— 搜索 / 回壁 ——
  SEARCH_T: 3,
  LOSE_MIN: 12,
  LOSE_MAX: 20,
  /** 回到岩壁后 uCamo 从 0 升到 0.95 的时间 */
  CLING_FADE: 2.5,
  HIT_T: CAMO_CLIPS.hit.len, // 0.55s
  // —— 巨石 ——
  BOULDER_LIFE: 45,
  BOULDER_MAX: 8,
  BOULDER_R: 0.42,
  // —— 声音队列 ——
  QUEUE_MAX: 48,
} as const

// ---------------------------------------------------------------------------
// 运行时状态
// ---------------------------------------------------------------------------
export type CamoMode = 'cling' | 'reveal' | 'listen' | 'call' | 'stalk' | 'charge' | 'search' | 'return' | 'lift' | 'slam' | 'recover' | 'distracted' | 'hit'
export interface CamoState {
  mode: CamoMode
  /** 本模式已持续（秒） */
  modeT: number
  /** 渲染层读：当前片段与片段时间（AI 按根位移速度推进） */
  clip: CamoClip
  clipT: number
  clipRate: number
  /** 伪装度（idle_camo 用；回壁后渐升） */
  camo: number
  /** 声源相对朝向的偏角（reveal/listen 歪头） */
  soundYaw: number
  /** 岩壁伪装点（世界坐标）与贴壁朝向 */
  homeWX: number; homeWY: number; homeF: number
  /** 最近一次听到的声源（世界坐标）与响度 */
  srcWX: number; srcWY: number; srcLoud: number
  hasSrc: boolean
  /** 距上次听到声音（秒） */
  quietT: number
  /** 本轮失去声源后回壁的阈值（12–20s） */
  loseT: number
  /** 被投掷物引开：赶往落点 + distracted 期间为 true */
  lured: boolean
  distractWX: number; distractWY: number
  /** distracted 的持续时间（10–12s，进入 distracted 时定） */
  distractT: number
  /** 本轮已召唤过（自己 call 过或被同伴唤醒），回壁后清除 */
  called: boolean
  impactDone: boolean
  stuckT: number
  rand: () => number
}

interface CamoSound { wx: number; wy: number; r: number; kind: 'noise' | 'throw' | 'slam'; src?: Entity }
export interface CamoBoulder { id: number; wx: number; wy: number; z: number; life: number; seed: number; rot: number }
interface CamoWorld { pending: CamoSound[]; current: CamoSound[]; boulders: CamoBoulder[]; nextId: number }
const worlds = new WeakMap<GameMap, CamoWorld>()
function world(m: GameMap): CamoWorld {
  let w = worlds.get(m)
  if (!w) { w = { pending: [], current: [], boulders: [], nextId: 1 }; worlds.set(m, w) }
  return w
}
const ox = (m: GameMap) => m.inf?.ox ?? 0
const oy = (m: GameMap) => m.inf?.oy ?? 0
const wrapPi = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a }

// ---------------------------------------------------------------------------
// 声音事件
// ---------------------------------------------------------------------------
/** 发出一个声音事件（窗口坐标，r = 响度半径）。noiseEvent / 投掷物落地 / 跳跃落地 / 开枪 都走这里 */
export function camoSound(eng: Engine, x: number, y: number, r: number, kind: CamoSound['kind'] = 'noise', src?: Entity) {
  const m = eng.map
  if (!m) return
  const w = world(m)
  if (w.pending.length >= CAMO.QUEUE_MAX) w.pending.shift()
  w.pending.push({ wx: x + ox(m), wy: y + oy(m), r, kind, src })
}
/** 投掷物落地（combat.landProjectile 钩子）：落点发出一个可引开迷彩爬行者的声音 */
export function camoProjectileLanded(eng: Engine, x: number, y: number) { camoSound(eng, x, y, CAMO.THROW_LOUD, 'throw') }
/** 能否听见：失明，只按响度半径；伪装中 ×1.15，惊醒后 ×1.4；被引开期间忽略轻微噪音 */
export function camoCanHear(st: Pick<CamoState, 'mode' | 'lured'>, dist: number, r: number, kind: CamoSound['kind'] = 'noise'): boolean {
  if (r < CAMO.MIN_LOUD) return false
  if (st.lured && kind === 'noise' && r < CAMO.DISTRACT_IGNORE) return false
  return dist <= r * (st.mode === 'cling' ? CAMO.HEAR_SCALE : CAMO.HEAR_SCALE_ALERT)
}
/** 砸地伤害曲线：中心 35，线性衰减到 2.5m 处的 30%，之外 0 */
export function camoSlamDamage(dist: number): number {
  if (dist > CAMO.SLAM_R) return 0
  return CAMO.SLAM_DMG * (1 - (1 - CAMO.SLAM_EDGE) * (dist / CAMO.SLAM_R))
}
/** 留在地上的巨石（渲染层读；世界坐标） */
export function camoBoulders(eng: Engine): readonly CamoBoulder[] { return eng.map ? world(eng.map).boulders : [] }

/** 每帧实体循环前调用一次：交换声音队列、巨石计时与玩家碰撞 */
export function beginCamoFrame(eng: Engine, dt: number) {
  const m = eng.map
  if (!m) return
  const w = world(m)
  w.current = w.pending; w.pending = []
  if (!w.boulders.length) return
  const p = eng.player
  for (const b of w.boulders) b.life -= dt
  w.boulders = w.boulders.filter((b) => b.life > 0)
  // 巨石是实心的：把玩家推出半径（可贴着它躲）
  for (const b of w.boulders) {
    const bx = b.wx - ox(m), by = b.wy - oy(m)
    const dx = p.x - bx, dy = p.y - by, dd = Math.hypot(dx, dy), R = CAMO.BOULDER_R + PLAYER_RADIUS
    if (dd >= R || Math.abs(p.z - b.z) > 1.2) continue
    const ux = dd > 1e-4 ? dx / dd : 1, uy = dd > 1e-4 ? dy / dd : 0
    const nx = bx + ux * R, ny = by + uy * R
    if (canOccupy(m, nx, ny, PLAYER_RADIUS, { z: p.z, crouch: p.crouching })) { p.x = nx; p.y = ny }
  }
}

// ---------------------------------------------------------------------------
// 找墙（运行时）：L8 用真实三维岩体场，其他层退回瓦片
// ---------------------------------------------------------------------------
function wallFns(eng: Engine) {
  const m = eng.map!, X = ox(m), Y = oy(m), seed = m.inf?.seed
  const l8 = eng.levelDef.id === 8 && seed !== undefined
  const field = l8
    ? (x: number, y: number) => { const c = l8VolumeColumn(seed!, x + X, y + Y); return (h: number) => l8VolumeField(seed!, x + X, h, y + Y, c) }
    : (x: number, y: number) => { const v = walkableAt(m, Math.floor(x), Math.floor(y), 0) ? 1 : -1; return () => v }
  const ground = (x: number, y: number) => floorHeight(m, x, y, 0)
  const ok = (x: number, y: number) => eng.entityWalkH(m, Math.floor(x), Math.floor(y), 0) !== null && tileAt(m, Math.floor(x), Math.floor(y)) === 1
  return { field, ground, ok }
}
/** 在 (x, y) 附近（≤ radius）找一处贴壁点 */
export function camoFindWall(eng: Engine, x: number, y: number, radius = 6, rand: () => number = Math.random) {
  const { field, ground, ok } = wallFns(eng)
  const here = camoWallSpot(x, y, field, ground, ok, 0.9)
  if (here) return here
  for (let t = 0; t < 28; t++) {
    const a = rand() * Math.PI * 2, r = 0.8 + rand() * (radius - 0.8)
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r
    if (!ok(px, py)) continue
    const s = camoWallSpot(px, py, field, ground, ok)
    if (s) return s
  }
  return null
}

// ---------------------------------------------------------------------------
// 状态机
// ---------------------------------------------------------------------------
const CLIP_OF: Record<CamoMode, CamoClip> = {
  cling: 'idle_camo', reveal: 'reveal', listen: 'listen', call: 'call', stalk: 'walk', charge: 'run', search: 'listen',
  return: 'walk', lift: 'lift', slam: 'slam', recover: 'listen', distracted: 'distracted', hit: 'hit',
}
function setMode(e: Entity, st: CamoState, mode: CamoMode, clipT = 0) {
  st.mode = mode; st.modeT = 0; st.stuckT = 0
  st.clip = CLIP_OF[mode]; st.clipT = clipT; st.clipRate = 1
  e.state = mode === 'cling' ? 'idle'
    : mode === 'return' ? 'wander'
      : mode === 'lift' || mode === 'slam' ? 'attack'
        : mode === 'stalk' || mode === 'charge' || mode === 'call' || mode === 'hit' || mode === 'recover' ? 'chase'
          : 'investigate'
  if (mode === 'slam') st.impactDone = false
  if (mode !== 'cling') st.camo = 0
}

/** 首次 AI tick：就近找岩壁贴上去（生成器已经把它放在墙边时，原地即可命中） */
export function initCamo(eng: Engine, e: Entity): CamoState {
  const m = eng.map!
  const rand = camoRand((e.id * 2654435761) ^ 0xca31)
  const spot = camoFindWall(eng, e.x, e.y, 6, rand)
  if (spot) { e.x = spot.x; e.y = spot.y; e.facing = spot.facing; e.z = floorHeight(m, e.x, e.y, 0) }
  const st: CamoState = {
    mode: 'cling', modeT: 0, clip: 'idle_camo', clipT: rand() * 4, clipRate: 1,
    camo: CAMO_IDLE_LEVEL, soundYaw: 0,
    homeWX: e.x + ox(m), homeWY: e.y + oy(m), homeF: e.facing,
    srcWX: 0, srcWY: 0, srcLoud: 0, hasSrc: false,
    quietT: 99, loseT: CAMO.LOSE_MIN, lured: false, distractWX: 0, distractWY: 0, distractT: 0,
    called: false, impactDone: false, stuckT: 0, rand,
  }
  e.cc = st
  e.state = 'idle'
  e.targetX = e.x; e.targetY = e.y
  return st
}

function feed(st: CamoState, s: { wx: number; wy: number; r: number }) {
  st.srcWX = s.wx; st.srcWY = s.wy; st.srcLoud = s.r; st.hasSrc = true; st.quietT = 0
}
/** 走或冲向最近的声源（被引开时冲向落点） */
function goHunt(e: Entity, st: CamoState, m: GameMap) {
  const tx = (st.lured ? st.distractWX : st.srcWX) - ox(m), ty = (st.lured ? st.distractWY : st.srcWY) - oy(m)
  const dist = Math.hypot(tx - e.x, ty - e.y)
  setMode(e, st, st.lured || st.srcLoud >= CAMO.CHARGE_LOUD || dist < CAMO.CHARGE_NEAR ? 'charge' : 'stalk')
}
function wake(e: Entity, st: CamoState) {
  st.loseT = CAMO.LOSE_MIN + st.rand() * (CAMO.LOSE_MAX - CAMO.LOSE_MIN)
  setMode(e, st, 'reveal')
}
function onHear(e: Entity, st: CamoState, s: CamoSound, m: GameMap) {
  if (s.kind === 'throw') { st.lured = true; st.distractWX = s.wx; st.distractWY = s.wy }
  else if (st.lured && s.r >= CAMO.DISTRACT_IGNORE) st.lured = false // 巨响盖过了诱饵
  feed(st, s)
  switch (st.mode) {
    case 'cling': wake(e, st); break
    case 'stalk': case 'charge': case 'search': case 'return': case 'distracted': goHunt(e, st, m); break
    default: break // reveal/listen/call/lift/slam/recover/hit：做完当前动作再按新声源行动
  }
}
function pickSound(e: Entity, st: CamoState, w: CamoWorld, m: GameMap): CamoSound | null {
  let best: CamoSound | null = null, score = -Infinity
  const ex = e.x + ox(m), ey = e.y + oy(m)
  for (const s of w.current) {
    if (s.src === e) continue
    const d = Math.hypot(s.wx - ex, s.wy - ey)
    if (!camoCanHear(st, d, s.r, s.kind)) continue
    const sc = (s.kind === 'throw' ? 100 : 0) + s.r - d * 0.5
    if (sc > score) { score = sc; best = s }
  }
  return best
}
/** 同一时刻只有一只在召唤：几只同时听见时，先转入 call 的那只代表全组 */
function packCalling(m: GameMap, e: Entity): boolean {
  return m.entities.some((q) => q !== e && !q.dead && q.cc?.mode === 'call' && Math.hypot(q.x - e.x, q.y - e.y) <= CAMO.CALL_R)
}
/** 召唤：25m 内同伴全部惊醒，并共享声源 */
function callPack(eng: Engine, e: Entity, st: CamoState, d: number) {
  const m = eng.map!
  st.called = true
  let n = 0
  for (const q of m.entities) {
    if (q === e || q.dead || q.def.type !== 'camocrawler') continue
    if (Math.hypot(q.x - e.x, q.y - e.y) > CAMO.CALL_R) continue
    const qs = q.cc ?? initCamo(eng, q)
    qs.called = true
    if (st.lured) { qs.lured = true; qs.distractWX = st.distractWX; qs.distractWY = st.distractWY }
    feed(qs, { wx: st.srcWX, wy: st.srcWY, r: st.srcLoud })
    qs.quietT = 0
    if (qs.mode === 'cling') wake(q, qs)
    else if (qs.mode === 'search' || qs.mode === 'return' || qs.mode === 'distracted') goHunt(q, qs, m)
    n++
  }
  if (d < 30) {
    audio.aggro()
    eng.msg(n > 0 ? '岩壁上传来一声干裂的嘶鸣——附近好几块「石头」同时动了。' : '岩壁上传来一声干裂的嘶鸣。', 'damage')
  }
}

/** 受击（combat.killCheck 钩子）：播 hit，知道你就在跟前；第一次受击会召唤同伴 */
export function camoHurt(eng: Engine, e: Entity) {
  if (e.def.type !== 'camocrawler' || e.dead || !eng.map) return
  const m = eng.map, p = eng.player
  const st = e.cc ?? initCamo(eng, e)
  if (e.hp <= 0) return // 死亡由渲染层播 death
  if (e.stunT > 0 && e.stunT <= 0.4) e.stunT = 0 // 近战的 0.35s 通用硬直由 hit 片段代替（否则片段会冻住）
  feed(st, { wx: p.x + ox(m), wy: p.y + oy(m), r: 10 })
  st.lured = false
  if (st.mode === 'slam' && !st.impactDone) return // 巨石已经抡下来了，砸完再说
  if (st.mode === 'cling') st.loseT = CAMO.LOSE_MIN + st.rand() * (CAMO.LOSE_MAX - CAMO.LOSE_MIN)
  setMode(e, st, 'hit')
}

/** 能否出手：近身 + 高度相近 + （贴身，或刚听到的声源就在玩家身边） */
function canStrike(eng: Engine, e: Entity, st: CamoState, d: number): boolean {
  if (eng.dev.invisible || d > CAMO.ATTACK_R || e.attackCd > 0 || Math.abs(e.z - eng.player.z) > 1.2) return false
  if (d <= CAMO.TOUCH_R) return true
  const m = eng.map!, p = eng.player
  return st.hasSrc && st.quietT < CAMO.SENSE_QUIET && Math.hypot(st.srcWX - ox(m) - p.x, st.srcWY - oy(m) - p.y) < CAMO.SENSE_SRC_R
}

function slamImpact(eng: Engine, e: Entity, dmgMult: number) {
  const m = eng.map!, p = eng.player, s = e.def.scale ?? 1
  const c = Math.cos(e.facing), sn = Math.sin(e.facing)
  const ix = e.x + c * CAMO_SLAM_IMPACT_POINT.x * s - sn * CAMO_SLAM_IMPACT_POINT.z * s
  const iy = e.y + sn * CAMO_SLAM_IMPACT_POINT.x * s + c * CAMO_SLAM_IMPACT_POINT.z * s
  const iz = floorHeight(m, ix, iy, 0)
  const dp = Math.hypot(p.x - ix, p.y - iy)
  const pd = Math.hypot(p.x - e.x, p.y - e.y)
  // 镜头震动：7m 内都能感到地面一震
  if (pd < CAMO.SLAM_SHAKE_R) eng.camShake = Math.min(1, eng.camShake + 0.75 * (1 - pd / CAMO.SLAM_SHAKE_R))
  audio.hit()
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2, v = 1.2 + Math.random() * 2.4
    eng.particles.push({ x: ix, y: iy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.5 + Math.random() * 0.4, color: i % 3 ? '#7d766a' : '#a39b8a', size: 2.5 + Math.random() * 3, z: iz + 0.1, vz: 1 + Math.random() * 1.6 })
  }
  const dmg = camoSlamDamage(dp)
  if (dmg > 0 && Math.abs(p.z - iz) < 1.2 && !eng.dev.invisible && !eng.over) {
    eng.hurtPlayer(dmg * dmgMult, e.def.name)
    const k = 1 - dp / CAMO.SLAM_R
    p.slowT = Math.max(p.slowT, 0.5 + CAMO.SLAM_SLOW * k) // 踉跄：短暂减速
    const ux = dp > 1e-3 ? (p.x - ix) / dp : Math.cos(e.facing), uy = dp > 1e-3 ? (p.y - iy) / dp : Math.sin(e.facing)
    const push = CAMO.SLAM_PUSH * (0.4 + 0.6 * k)
    const nx = p.x + ux * push, ny = p.y + uy * push
    if (canOccupy(m, nx, ny, PLAYER_RADIUS, { z: p.z, crouch: p.crouching })) { p.x = nx; p.y = ny }
    if (!eng.over) eng.msg('巨石轰在你脚边——碎石和冲击把你掀得一个踉跄。', 'damage')
  }
  // 砸地本身是巨响：附近的同伴会循声赶来
  camoSound(eng, ix, iy, CAMO.SLAM_LOUD, 'slam', e)
  const w = world(m)
  w.boulders.push({ id: w.nextId++, wx: ix + ox(m), wy: iy + oy(m), z: iz, life: CAMO.BOULDER_LIFE, seed: e.id, rot: e.facing })
  if (w.boulders.length > CAMO.BOULDER_MAX) w.boulders.shift()
}

/** 迷彩爬行者 AI 步进（entityAI.updateEntities 的 generic 段钩子） */
export function updateCamo(eng: Engine, e: Entity, dt: number, d: number, dmgMult: number) {
  const m = eng.map!, p = eng.player
  const st = e.cc ?? initCamo(eng, e)
  const w = world(m)
  st.modeT += dt
  st.quietT += dt
  // 1. 听觉
  const s = pickSound(e, st, w, m)
  if (s) onHear(e, st, s, m)
  // 贴身碰到伪装中的个体也会惊醒它
  if (st.mode === 'cling' && d < CAMO.TOUCH_R * 0.8 && !eng.dev.invisible) {
    feed(st, { wx: p.x + ox(m), wy: p.y + oy(m), r: 6 }); wake(e, st)
  }
  const srcX = st.srcWX - ox(m), srcY = st.srcWY - oy(m)
  const turnTo = (x: number, y: number, rate: number) => eng.faceToward(e, x, y, dt, rate)
  const yawTo = (x: number, y: number) => Math.max(-1.2, Math.min(1.2, -wrapPi(Math.atan2(y - e.y, x - e.x) - e.facing)))
  // 2. 模式
  switch (st.mode) {
    case 'cling': {
      // 钉在伪装点（玩家推挤也不会把它从墙上挤下来）
      e.x = st.homeWX - ox(m); e.y = st.homeWY - oy(m); e.facing = st.homeF
      st.camo = Math.min(CAMO_IDLE_LEVEL, st.camo + dt * CAMO_IDLE_LEVEL / CAMO.CLING_FADE)
      break
    }
    case 'reveal': {
      st.soundYaw = yawTo(srcX, srcY)
      if (st.modeT >= CAMO.REVEAL_T) setMode(e, st, 'listen', CAMO.LISTEN_START)
      break
    }
    case 'listen': {
      // reveal 没有转身过渡：listen 时才慢慢把身体转向声源
      turnTo(srcX, srcY, 2.6)
      st.soundYaw = yawTo(srcX, srcY)
      if (st.modeT >= CAMO.LISTEN_T) {
        if (!st.called && !packCalling(m, e)) setMode(e, st, 'call')
        else { st.called = true; goHunt(e, st, m) }
      }
      break
    }
    case 'call': {
      if (st.modeT <= dt + 1e-6) callPack(eng, e, st, d)
      if (st.modeT >= CAMO.CALL_T) goHunt(e, st, m)
      break
    }
    case 'stalk': case 'charge': case 'return': {
      if (st.mode !== 'return' && !st.lured && canStrike(eng, e, st, d)) { setMode(e, st, 'lift'); turnTo(p.x, p.y, 8); break }
      const home = st.mode === 'return'
      const tx = home ? st.homeWX - ox(m) : st.lured ? st.distractWX - ox(m) : srcX
      const ty = home ? st.homeWY - oy(m) : st.lured ? st.distractWY - oy(m) : srcY
      const speed = st.mode === 'charge' ? CAMO.CHARGE_SPEED : st.mode === 'stalk' ? CAMO.STALK_SPEED : CAMO.RETURN_SPEED
      e.targetX = tx; e.targetY = ty
      const x0 = e.x, y0 = e.y
      const blocked = eng.stepEntity(e, speed, dt)
      const moved = Math.hypot(e.x - x0, e.y - y0)
      st.clipRate = (moved / Math.max(dt, 1e-4)) / (st.mode === 'charge' ? CAMO_RUN_SPEED : CAMO_WALK_SPEED)
      const arrived = Math.hypot(tx - e.x, ty - e.y) < 0.45
      if (blocked && !arrived) st.stuckT += dt; else st.stuckT = 0
      if (arrived || st.stuckT > CAMO.STUCK_T) {
        if (home) {
          if (!arrived) { // 回不去原来的墙：就近另找一面
            const spot = camoFindWall(eng, e.x, e.y, 4, st.rand)
            if (spot) { st.homeWX = spot.x + ox(m); st.homeWY = spot.y + oy(m); st.homeF = spot.facing; st.stuckT = 0; break }
            st.homeWX = e.x + ox(m); st.homeWY = e.y + oy(m); st.homeF = e.facing
          }
          e.x = st.homeWX - ox(m); e.y = st.homeWY - oy(m); e.z = floorHeight(m, e.x, e.y, 0)
          st.called = false; st.lured = false; st.hasSrc = false
          setMode(e, st, 'cling'); st.camo = 0
        } else if (st.lured) {
          st.distractT = CAMO.DISTRACT_MIN + st.rand() * (CAMO.DISTRACT_MAX - CAMO.DISTRACT_MIN)
          setMode(e, st, 'distracted')
        } else setMode(e, st, 'search')
      }
      break
    }
    case 'search': {
      turnTo(srcX, srcY, 1.5)
      st.soundYaw = Math.sin(st.modeT * 1.3 + e.id) * 0.5
      if (canStrike(eng, e, st, d)) { setMode(e, st, 'lift'); break }
      if (st.modeT >= CAMO.SEARCH_T) {
        if (st.quietT >= st.loseT) setMode(e, st, 'return')
        else setMode(e, st, 'search', st.clipT)
      }
      break
    }
    case 'distracted': {
      // 片段本身没有转身过渡：先把身体转向落点
      turnTo(st.distractWX - ox(m), st.distractWY - oy(m), 4)
      if (d <= CAMO.TOUCH_R && e.attackCd <= 0 && Math.abs(e.z - p.z) < 1.2 && !eng.dev.invisible) { st.lured = false; setMode(e, st, 'lift'); break }
      if (st.modeT >= st.distractT) {
        st.lured = false
        if (st.quietT >= st.loseT) setMode(e, st, 'return')
        else setMode(e, st, 'search')
      }
      break
    }
    case 'lift': {
      if (st.modeT < CAMO_LIFT_GRAB_T + 0.2) turnTo(p.x, p.y, 6)
      if (st.modeT >= CAMO.LIFT_T) setMode(e, st, 'slam')
      break
    }
    case 'slam': {
      if (!st.impactDone && st.clipT >= CAMO.SLAM_IMPACT_T) { st.impactDone = true; slamImpact(eng, e, dmgMult) }
      if (st.modeT >= CAMO.SLAM_T) setMode(e, st, 'recover')
      break
    }
    case 'recover': {
      if (st.modeT >= CAMO.RECOVER_T) {
        e.attackCd = CAMO.ATTACK_CD
        if (st.hasSrc && st.quietT < st.loseT) goHunt(e, st, m); else setMode(e, st, 'search')
      }
      break
    }
    case 'hit': {
      if (st.modeT >= CAMO.HIT_T) {
        if (!st.called && !packCalling(m, e)) setMode(e, st, 'call')
        else if (canStrike(eng, e, st, d)) setMode(e, st, 'lift')
        else goHunt(e, st, m)
      }
      break
    }
  }
  // 片段时间：slam 的触地判定要和动画同一时钟，所以在模式逻辑之后推进
  st.clipT += dt * st.clipRate
  e.animT += dt * st.clipRate
}
