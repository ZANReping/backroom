import {stepMangledFog,stepMangledPursuit} from './mangledWalk'
// 邻里守望（Entity 96：观察者 Watcher + 挺进者 Strider）与残缺者（Entity 63：The Mangled）专属 AI。
// 依据中文维基 entity-96、entity-63，以及 ZAN 2026-10-21 确认的设计约束：
//  · 观察者：悬浮巡视，无声扫视；看见目标后锁定 → 蓄力 1.5s（瞳孔收缩、发光）→ 持续光束。
//    光束不立即致死：持续造成高伤害，被照中的人仍有躲避窗口（脱离视线即中断）。被光束杀死的活体化为一堆细灰（留下遗物）。
//    不可被常规方式杀死。会干扰、腐蚀电子设备（手电闪烁熄灭），电子设备也会把它们引来。
//  · 挺进者：视觉为主、触觉（贴身）、听觉很弱。巡行时六足慢走；发现目标后短冲刺（不按 90 mph，取 7.5 m/s，持续 ≤1.6s）。
//    能从门窗把附肢伸进 2.4m 内抓人（房间深处与二楼安全）；抓住后挣扎可脱身，否则抡起砸地，
//    或在附近有观察者时把猎物举起来「递交」给观察者照射。会把「一些口袋」从你身上扯走、放回街区远处（原位机制）。
//    与观察者共享感知：一只发现你，附近的全都知道。可以被杀死。
//  · 残缺者：只随 L9 浓雾事件出现（ambient.ts）。出现前有气温骤降、地面震动、雷声预警；在雾里用熟人的声音诱骗；
//    触须下探前 1s 预警，抓住后吊到半空。可挣脱，挣脱后从高处坠落受坠落伤害；没挣脱就被同化（死亡）。
//    每同化一个受害者（玩家或其他实体），体型与声音库增长。不可被常规方式杀死；电子设备会把它引来。
//  · 水泳者（Swimmer）这次不做：只保留 kind 接口。
// 运行时状态挂在 e.nw（不入存档/联机），每局按地图重置的帧级数据放 WeakMap。
import { audio } from '../core/audio'
import type { Entity } from '../entities'
import type { Engine } from '../engine'

/** 全部规则数值（验收脚本 check:watch 直接读取；文档 app/WATCH-REMAKE.md 同步） */
export const NW = {
  // —— 观察者
  W_SIGHT: 26, // 视距（米）
  W_SPEED: 0.7, // 巡视漂移速度
  W_LOCK: 0.5, // 锁定（瞳孔收缩）时长
  W_CHARGE: 1.5, // 蓄力时长
  W_BEAM: 3.2, // 单次光束最长持续
  W_BEAM_DPS: 34, // 光束持续伤害（每秒）——约 3 秒致死，留出躲避窗口
  W_BEAM_TICK: 0.2, // 伤害结算间隔
  W_LOSE: 0.45, // 蓄力/照射中丢失视线超过此时长即中断
  W_COOL: 4, // 冷却
  W_RANGE: 30, // 光束射程
  // —— 挺进者
  S_SIGHT: 13, S_FOV: 2.1, // 视距、视野（弧度，约 120°）
  S_TOUCH: 1.3, // 触觉（贴身即察觉）
  S_HEAR_K: 0.45, // 听觉很弱：噪音半径打折
  S_WALK: 2.9, S_SPRINT: 7.5, S_SPRINT_T: 1.6, S_SPRINT_CD: 2.6,
  S_REACH: 2.4, // 门窗伸手范围（从实体所在室外格到玩家）
  S_REACH_WIND: 0.7, // 伸手预警
  S_SAFE_Z: 1.5, // 玩家在二楼（脚底高于此）安全
  S_GRAB_T: 2.2, // 抓住到抡砸之间的挣扎窗口
  S_MASH: 8, // 挣脱需要的连按次数
  S_SLAM_DMG: 42,
  S_PRESENT_R: 18, // 附近有观察者（此距离内）时改为递交
  S_PRESENT_T: 4.5, // 递交时举着的最长时长
  S_COOL: 4,
  SHARE_R: 40, // 共享感知半径
  POCKET_DROP_R: 22, // 「一些口袋」被放回的距离
  // —— 残缺者
  M_GRAB_R: 9, // 触须下探的水平半径（躯体中心起，按体型缩放）
  M_WARN: 1.0, // 下探预警
  M_LIFT: 14, M_LIFT_T: 1.8, // 吊起高度、吊起用时
  M_HOLD_T: 6.5, // 吊着到同化的时长
  M_MASH: 12,
  M_FALL_SAFE: 3, M_FALL_DMG: 4.2, // 坠落伤害：超过 3m 的部分每米 4.2
  M_SPEED: 1.5,
  M_LURE_CD: [9, 16] as const, // 熟人声音诱骗间隔
  M_GROW: 0.06, // 每同化一个受害者体型 +6%
  M_GROW_MAX: 1.6,
  M_COOL: 5,
  // —— 电子干扰
  EMP_R: 20, // 观察者/残缺者此距离内手电会闪烁熄灭
  EMP_CD: 7,
} as const

export type NWKind = 'watcher' | 'strider' | 'mangled' | 'swimmer' // swimmer：仅接口，未实现
export type NWPhase =
  | 'patrol' | 'lock' | 'charge' | 'beam' | 'cool' // 观察者
  | 'hunt' | 'sprint' | 'reach' | 'grab' | 'slam' | 'present' | 'carry' // 挺进者
  | 'stalk' | 'warn' | 'snatch' | 'hold' // 残缺者
export interface NWState {
  kind: NWKind
  phase: NWPhase
  t: number
  lastX: number; lastY: number; seenT: number // 最后已知位置（世界坐标）与距今时长
  loseT: number
  tick: number
  sprintT: number; sprintCd: number
  mash: number; mashNeed: number; inJ: boolean; inA: boolean; inI: boolean
  holdZ: number // 被吊/被举的高度
  lureCd: number
  pocketX?: number; pocketY?: number
  // 渲染：片段名 + 片段内时间 + 注视方向
  clip: string; clipT: number; aimX: number; aimY: number; aimZ: number; glow: number
}

const newFrame = (map: Engine['map'], run?: number) => ({ map, run, captor: undefined as Entity | undefined, growth: 0, voices: [] as string[], empCd: 0, told: new Set<string>(), omenT: 0 })
const frames = new WeakMap<Engine, ReturnType<typeof newFrame>>()
function F(eng: Engine) {
  let f = frames.get(eng)
  if (!f || f.map !== eng.map || f.run !== eng.player.startTime) { const g = newFrame(eng.map, eng.player.startTime); if (f && f.run === g.run) { g.growth = f.growth; g.voices = f.voices } f = g; frames.set(eng, f) }
  return f
}
const origin = (eng: Engine) => [eng.map?.inf?.ox ?? 0, eng.map?.inf?.oy ?? 0] as const
const face = (e: Entity, x: number, y: number) => { e.facing = Math.atan2(y - e.y, x - e.x) }
const setPhase = (s: NWState, ph: NWPhase, clip?: string) => { if (s.phase !== ph) { s.phase = ph; s.t = 0 } if (clip && s.clip !== clip) { s.clip = clip; s.clipT = 0 } }
const once = (eng: Engine, key: string, text: string, kind: 'system' | 'damage' = 'damage') => { const f = F(eng); if (!f.told.has(key)) { f.told.add(key); eng.msg(text, kind) } }
export const isNW = (t: string) => t === 'watcher' || t === 'strider' || t === 'mangled'
/** 观察者和残缺者不可被常规方式杀死（combat 钩子） */
export const nwInvulnerable = (t: string) => t === 'watcher' || t === 'mangled'
export const mangledGrowth = (eng: Engine) => 1 + F(eng).growth * NW.M_GROW

export function initNW(e: Entity): NWState {
  const kind = e.def.type as NWKind
  const s: NWState = {
    kind, phase: kind === 'watcher' ? 'patrol' : kind === 'strider' ? 'patrol' : 'stalk', t: 0,
    lastX: 0, lastY: 0, seenT: 99, loseT: 0, tick: 0, sprintT: 0, sprintCd: 0,
    mash: 0, mashNeed: kind === 'mangled' ? NW.M_MASH : NW.S_MASH, inJ: false, inA: false, inI: false, holdZ: 0,
    lureCd: 4, clip: kind === 'watcher' ? 'hover' : 'idle', clipT: 0, aimX: 1, aimY: 0, aimZ: 0, glow: 0,
  }
  e.nw = s
  return s
}

// ---------------------------------------------------------------- 感知
const playerIndoor = (eng: Engine) => { const m = eng.map!, p = eng.player; return m.outdoor ? m.outdoor[Math.floor(p.y) * m.w + Math.floor(p.x)] !== 1 : false }
function spot(eng: Engine, e: Entity, s: NWState) {
  const [ox, oy] = origin(eng)
  s.lastX = eng.player.x + ox; s.lastY = eng.player.y + oy; s.seenT = 0
  if (!e.provoked) { e.provoked = true }
}
/** 共享感知：一只发现目标，附近的观察者/挺进者都知道最后位置 */
function share(eng: Engine, from: Entity) {
  const s0 = from.nw!
  for (const q of eng.map!.entities) {
    if (q === from || q.dead || (q.def.type !== 'watcher' && q.def.type !== 'strider')) continue
    if (Math.hypot(q.x - from.x, q.y - from.y) > NW.SHARE_R) continue
    const s = q.nw ?? initNW(q)
    if (s.seenT > 0.5) { s.lastX = s0.lastX; s.lastY = s0.lastY; s.seenT = 0.5 }
    if (s.phase === 'patrol') setPhase(s, q.def.type === 'watcher' ? 'patrol' : 'hunt')
  }
}
function canSee(eng: Engine, e: Entity, range: number, fov?: number) {
  const p = eng.player
  if (eng.dev.invisible) return false
  const d = Math.hypot(p.x - e.x, p.y - e.y)
  if (d > range) return false
  if (fov !== undefined && d > NW.S_TOUCH) {
    let a = Math.atan2(p.y - e.y, p.x - e.x) - e.facing
    a = Math.atan2(Math.sin(a), Math.cos(a))
    if (Math.abs(a) > fov / 2) return false
  }
  return eng.los(e.x, e.y, p.x, p.y)
}

/** noiseEvent 钩子：挺进者听觉很弱（半径 ×0.45）；观察者不靠听觉；残缺者听得很远（它在雾里等你出声） */
export function nwHear(eng: Engine, e: Entity, x: number, y: number, radius: number, sprint: boolean) {
  const s = e.nw ?? initNW(e)
  const r = s.kind === 'strider' ? radius * NW.S_HEAR_K : s.kind === 'mangled' ? Math.max(radius, e.def.hearing) * (sprint ? 1.5 : 1) : 0
  if (r <= 0 || Math.hypot(e.x - x, e.y - y) > r) return
  const [ox, oy] = origin(eng)
  s.lastX = x + ox; s.lastY = y + oy; s.seenT = Math.min(s.seenT, 1)
  if (s.kind === 'strider' && s.phase === 'patrol') setPhase(s, 'hunt')
}

// ---------------------------------------------------------------- 抓取 / 挣扎（movement 钩子）
/** movement 钩子：被挺进者举着 / 被残缺者吊着时接管玩家位置，并统计连按（跳跃/攻击/交互） */
export function nwControlsPlayer(eng: Engine): boolean {
  const f = F(eng), e = f.captor, s = e?.nw
  if (!e || !s) return false
  const p = eng.player
  if (e.dead || !eng.map?.entities.includes(e) || p.hp <= 0 || eng.dev.invisible) { releaseNW(eng, 'drop'); return false }
  const j = !!eng.input.jump, a = !!eng.input.attack, i = !!eng.input.interact
  if (j && !s.inJ) s.mash++
  if (a && !s.inA) s.mash++
  if (i && !s.inI) s.mash++
  s.inJ = j; s.inA = a; s.inI = i
  p.vz = 0
  p.z = s.holdZ
  return true
}
export const nwCaptor = (eng: Engine) => F(eng).captor
/** 放开玩家。escape：挣脱；drop：实体被打断。残缺者吊着时放开 = 从高处坠落，受坠落伤害。 */
export function releaseNW(eng: Engine, how: 'escape' | 'drop' | 'slam' = 'drop') {
  const f = F(eng), e = f.captor
  if (!e) return
  f.captor = undefined
  const s = e.nw!, p = eng.player
  const h = s.holdZ
  s.holdZ = 0; p.z = 0; p.vz = 0
  if (s.kind === 'mangled' && how !== 'slam') {
    const dmg = Math.max(0, h - NW.M_FALL_SAFE) * NW.M_FALL_DMG
    if (how === 'escape') eng.msg(`你从触须里挣了出来——然后从 ${h.toFixed(0)} 米高的雾里直直摔下去。`, 'damage')
    if (dmg > 0.5) { eng.hurtPlayer(dmg, '坠落'); eng.camShake = Math.min(1, eng.camShake + 0.8) }
    p.slowT = Math.max(p.slowT ?? 0, 2.5)
    setPhase(s, 'stalk', 'idle'); e.attackCd = NW.M_COOL
  } else if (s.kind === 'strider') {
    if (how === 'escape') eng.msg('你蹬开了缠在身上的附肢，滚落在地。', 'system')
    setPhase(s, s.pocketX !== undefined ? 'carry' : 'hunt', 'walk'); e.attackCd = NW.S_COOL // 扯走口袋的个体先把它送回去
  }
}
function takeMash(s: NWState) { const ok = s.mash >= s.mashNeed; return ok }

// ---------------------------------------------------------------- 观察者
function beamHits(eng: Engine, e: Entity, dt: number) {
  const s = e.nw!, p = eng.player
  s.tick -= dt
  if (s.tick > 0) return
  s.tick = NW.W_BEAM_TICK
  const dmg = NW.W_BEAM_DPS * NW.W_BEAM_TICK
  if (p.hp - dmg <= 0 && !eng.dev.god) {
    ashify(eng, p.x, p.y, null)
    eng.die('被观察者的光束照中——你化成了街上一小堆细灰')
    return
  }
  eng.hurtPlayer(dmg, '观察者的光束')
}
/** 灰堆：被光束杀死的活体留下一捧细灰（可拾取，当遗物）；实体还会掉落身上的东西 */
export function ashify(eng: Engine, x: number, y: number, victim: Entity | null) {
  const m = eng.map!
  const drop = (type: string, k = 0) => {
    const item = { id: Math.random(), type, x: x + (k ? (Math.random() - 0.5) * 0.4 : 0), y: y + (k ? (Math.random() - 0.5) * 0.4 : 0), z: 0 }
    m.items.push(item)
    const inf = m.inf
    if (inf) inf.chunks.get(`${Math.floor((item.x + inf.ox) / 32)},${Math.floor((item.y + inf.oy) / 32)}`)?.items.push(item)
  }
  drop('ashpile')
  if (victim && Math.random() < 0.4) drop(['battery', 'almond', 'rope', 'notebook', 'carkey'][Math.floor(Math.random() * 5)], 1)
  for (let i = 0; i < 18; i++) eng.particles?.push({ x, y, z: 0.4 + Math.random() * 1.4, vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8, vz: -0.3 - Math.random() * 0.4, t: 0, life: 1.6 + Math.random(), color: '#8a8682', size: 0.05 })
}
function updateWatcher(eng: Engine, e: Entity, dt: number, d: number) {
  const s = e.nw!, p = eng.player, [ox, oy] = origin(eng)
  const sees = canSee(eng, e, NW.W_SIGHT) && (s.phase !== 'patrol' || d < NW.W_SIGHT)
  if (sees) { spot(eng, e, s); share(eng, e) } else s.seenT += dt
  // 被挺进者举着递交过来的猎物：直接进入蓄力（举着的人看得见）
  const presented = F(eng).captor?.nw?.phase === 'present' && Math.hypot(F(eng).captor!.x - e.x, F(eng).captor!.y - e.y) < NW.S_PRESENT_R
  s.aimX = s.lastX - ox; s.aimY = s.lastY - oy; s.aimZ = Math.max(0.9, p.z + 1.3)
  switch (s.phase) {
    case 'patrol': {
      s.glow = Math.max(0, s.glow - dt)
      setPhase(s, 'patrol', s.seenT < 6 ? 'scan' : 'hover')
      if ((sees || presented) && e.attackCd <= 0) { setPhase(s, 'lock', 'lock'); face(e, p.x, p.y); once(eng, 'w-lock', '远处那颗巨大的眼睛不再转动了。它的瞳孔在收缩。'); break }
      if (s.seenT < 8) { e.targetX = s.lastX - ox; e.targetY = s.lastY - oy } // 朝最后位置漂移
      else if (e.stateT <= 0) eng.wanderTarget(e)
      eng.stepEntity(e, NW.W_SPEED, dt)
      break
    }
    case 'lock':
      face(e, p.x, p.y)
      if (s.t > NW.W_LOCK) { setPhase(s, 'charge', 'charge'); audio.aggro(); eng.msg('观察者的瞳孔亮了起来——它在蓄力！躲到墙或房子后面！', 'damage') }
      break
    case 'charge':
      face(e, p.x, p.y)
      s.glow = Math.min(1, s.t / NW.W_CHARGE)
      s.loseT = sees || presented ? 0 : s.loseT + dt
      if (s.loseT > NW.W_LOSE) { setPhase(s, 'cool', 'cooldown'); e.attackCd = 1.2; eng.msg('光芒在它瞳孔里熄了下去。它失去了你的踪迹。', 'system'); break }
      if (s.t >= NW.W_CHARGE) { setPhase(s, 'beam', 'beam'); s.tick = 0 }
      break
    case 'beam': {
      face(e, p.x, p.y)
      s.glow = 1
      const inBeam = (sees || presented) && d < NW.W_RANGE
      s.loseT = inBeam ? 0 : s.loseT + dt
      if (inBeam) beamHits(eng, e, dt)
      // 光束路径上的其他活体（不含邻里守望）一并化灰
      for (const q of eng.map!.entities) {
        if (q === e || q.dead || isNW(q.def.type) || q.def.stationary) continue
        const qd = Math.hypot(q.x - e.x, q.y - e.y)
        if (qd > Math.min(d, NW.W_RANGE) || !eng.los(e.x, e.y, q.x, q.y)) continue
        const ax = (p.x - e.x) / Math.max(0.01, d), ay = (p.y - e.y) / Math.max(0.01, d)
        const off = Math.abs((q.x - e.x) * ay - (q.y - e.y) * ax)
        if (off < 0.5 && (q.x - e.x) * ax + (q.y - e.y) * ay > 0) { q.dead = true; q.deathT = 0.6; ashify(eng, q.x, q.y, q) }
      }
      if (s.loseT > NW.W_LOSE || s.t > NW.W_BEAM) { setPhase(s, 'cool', 'cooldown'); e.attackCd = NW.W_COOL }
      break
    }
    case 'cool':
      s.glow = Math.max(0, 1 - s.t)
      if (s.t > 1.4) setPhase(s, 'patrol', 'hover')
      break
  }
}

// ---------------------------------------------------------------- 挺进者
/** 玩家是否在挺进者伸手范围内（室内但离它所在的室外格 ≤2.4m，且不在二楼） */
function reachable(eng: Engine, e: Entity, d: number) {
  const p = eng.player
  if (p.z > NW.S_SAFE_Z || !eng.los(e.x, e.y, p.x, p.y)) return false
  if (!playerIndoor(eng)) return d < NW.S_TOUCH + 0.6
  return d <= NW.S_REACH
}
function updateStrider(eng: Engine, e: Entity, dt: number, d: number) {
  const s = e.nw!, p = eng.player, [ox, oy] = origin(eng), f = F(eng)
  const sees = canSee(eng, e, NW.S_SIGHT, NW.S_FOV) || (d < NW.S_TOUCH && !eng.dev.invisible)
  if (sees) { if (s.seenT > 1) once(eng, 's-spot', '六声落点停了一下，然后变得更快。'); spot(eng, e, s); share(eng, e) } else s.seenT += dt
  s.sprintCd -= dt
  s.aimX = p.x; s.aimY = p.y; s.aimZ = p.z + 1
  switch (s.phase) {
    case 'patrol':
      setPhase(s, 'patrol', 'walk')
      if (s.seenT < 6) { setPhase(s, 'hunt', 'walk'); break }
      if (e.stateT <= 0) eng.wanderTarget(e)
      if (eng.stepEntity(e, NW.S_WALK * 0.55, dt)) e.stateT = 0
      break
    case 'hunt': {
      if (s.seenT > 10) { setPhase(s, 'patrol', 'walk'); break }
      e.targetX = s.lastX - ox; e.targetY = s.lastY - oy
      if (sees && e.attackCd <= 0 && reachable(eng, e, d)) { setPhase(s, 'reach', 'reach'); face(e, p.x, p.y); eng.msg(playerIndoor(eng) ? '一条红色的附肢从窗框外探了进来，在屋里摸索！退到房间深处！' : '附肢朝你甩了过来！', 'damage'); break }
      if (sees && s.sprintCd <= 0 && d > 3 && d < 14 && !playerIndoor(eng)) { setPhase(s, 'sprint', 'run'); s.sprintT = NW.S_SPRINT_T; audio.aggro(); break }
      const arrived = eng.stepEntity(e, NW.S_WALK, dt)
      s.clip = 'walk'
      if (arrived && !sees) s.seenT += 1
      break
    }
    case 'sprint':
      e.targetX = p.x; e.targetY = p.y
      eng.stepEntity(e, NW.S_SPRINT, dt)
      s.sprintT -= dt
      if (reachable(eng, e, d) && e.attackCd <= 0) { setPhase(s, 'reach', 'reach'); break }
      if (s.sprintT <= 0) { s.sprintCd = NW.S_SPRINT_CD; setPhase(s, 'hunt', 'walk') }
      break
    case 'reach':
      face(e, p.x, p.y)
      if (s.t < NW.S_REACH_WIND) break
      if (reachable(eng, e, d) && !f.captor && !eng.dev.invisible) {
        f.captor = e; s.mash = 0; s.mashNeed = NW.S_MASH; s.holdZ = 0.6
        setPhase(s, 'grab', 'grab'); audio.aggro()
        eng.msg('附肢缠住了你，把你往外拖！连按 跳跃/攻击/交互 挣脱！', 'damage')
        if (p.hasPockets) takePockets(eng, e)
      } else { setPhase(s, 'hunt', 'walk'); e.attackCd = 1.2 }
      break
    case 'grab': {
      // 把人从门窗拖出到自己身前，抬起
      const fx = e.x + Math.cos(e.facing) * 1.1, fy = e.y + Math.sin(e.facing) * 1.1
      p.x += (fx - p.x) * Math.min(1, dt * 3); p.y += (fy - p.y) * Math.min(1, dt * 3)
      s.holdZ = Math.min(2.2, s.holdZ + dt * 1.2)
      if (takeMash(s)) { releaseNW(eng, 'escape'); break }
      if (s.t > NW.S_GRAB_T) {
        const w = eng.map!.entities.find((q) => !q.dead && q.def.type === 'watcher' && Math.hypot(q.x - e.x, q.y - e.y) < NW.S_PRESENT_R)
        if (w) { setPhase(s, 'present', 'present'); s.mash = Math.max(0, s.mash - 2); eng.msg('它把你高高举起，转向了街道另一头——那颗眼睛。', 'damage'); const ws = w.nw ?? initNW(w); spot(eng, w, ws); if (ws.phase === 'patrol' || ws.phase === 'cool') { w.attackCd = 0; setPhase(ws, 'lock', 'lock') } }
        else { setPhase(s, 'slam', 'slam') }
      }
      break
    }
    case 'present':
      s.holdZ = Math.min(3.2, s.holdZ + dt * 1.5)
      if (takeMash(s)) { releaseNW(eng, 'escape'); break }
      if (s.t > NW.S_PRESENT_T) setPhase(s, 'slam', 'slam')
      break
    case 'slam':
      s.holdZ = s.t < 0.45 ? 3.2 : Math.max(0, 3.2 - (s.t - 0.45) * 14)
      if (s.t > 0.68 && f.captor === e) {
        releaseNW(eng, 'slam')
        eng.camShake = 1
        eng.hurtPlayer(NW.S_SLAM_DMG, '挺进者的砸击')
        p.slowT = Math.max(p.slowT ?? 0, 2)
        e.attackCd = NW.S_COOL
      }
      if (s.t > 1.2) setPhase(s, s.pocketX !== undefined ? 'carry' : 'hunt', 'walk')
      break
    case 'carry': { // 把口袋送回远处（这期间不再追人）
      if (s.pocketX === undefined) { setPhase(s, 'hunt', 'walk'); break }
      e.targetX = s.pocketX - ox; e.targetY = s.pocketY! - oy
      if (eng.stepEntity(e, NW.S_WALK, dt) || s.t > 14) {
        const m = eng.map!, item = { id: Math.random(), type: 'pockets', x: e.x, y: e.y, z: 0 }
        m.items.push(item)
        const inf = m.inf
        if (inf) inf.chunks.get(`${Math.floor((item.x + inf.ox) / 32)},${Math.floor((item.y + inf.oy) / 32)}`)?.items.push(item)
        s.pocketX = s.pocketY = undefined; e.attackCd = 8
        setPhase(s, 'patrol', 'walk')
      }
      break
    }
  }
}
/** 原位机制：挺进者把「一些口袋」从你身上扯走，带回街区远处放下 */
function takePockets(eng: Engine, e: Entity) {
  const p = eng.player, s = e.nw!
  const i = p.equip.pockets.findIndex((x) => x?.type === 'pockets')
  if (i < 0) return
  p.equip.pockets[i] = null
  eng.syncPassives?.()
  const [ox, oy] = origin(eng), m = eng.map!
  s.pocketX = e.x + ox; s.pocketY = e.y + oy // No safe distant target: retain the item for a local drop.
  for (let a = 0; a < 40; a++) {
    const ang = Math.random() * Math.PI * 2, r = NW.POCKET_DROP_R * (0.8 + Math.random() * 0.4)
    const tx = Math.floor(e.x + Math.cos(ang) * r), ty = Math.floor(e.y + Math.sin(ang) * r)
    if (tx < 1 || ty < 1 || tx >= m.w - 1 || ty >= m.h - 1) continue
    if (m.outdoor && m.outdoor[ty * m.w + tx] !== 1) continue
    s.pocketX = tx + 0.5 + ox; s.pocketY = ty + 0.5 + oy; break
  }
  eng.msg('一条附肢从你背包里扯走了「一些口袋」。', 'damage')
}

// ---------------------------------------------------------------- 残缺者
const VOICES = ['妈妈', '爸爸', '你最好的朋友', '和你一起进来的同伴', '一个你以为早就离开后室的人', '你自己']
const LURES = ['「……这边，快过来，我找到出口了。」', '「是我啊。你为什么不回头？」', '「我受伤了，走不动……求你。」', '「别往那边走，跟着我的声音。」']
export function rememberVoice(eng: Engine, who: string) { const f = F(eng); if (!f.voices.includes(who)) f.voices.push(who) }
function updateMangled(eng: Engine, e: Entity, dt: number) {
  const s = e.nw!, p = eng.player, f = F(eng), g = mangledGrowth(eng)
  const dh = Math.hypot(p.x - e.x, p.y - e.y)
  const travel=e.l9FogTravel
  if(travel&&travel.mode!=='active'){
    if(f.captor===e)releaseNW(eng,'drop')
    setPhase(s,'stalk','stride')
    stepMangledFog(eng,e,NW.M_SPEED*g*(travel.mode==='leave'?.85:1),dt)
    return
  }
  s.aimX = p.x; s.aimY = p.y; s.aimZ = p.z
  // 熟人声音诱骗：从雾里另一个方向传来
  s.lureCd -= dt
  if (s.lureCd <= 0 && s.phase === 'stalk' && dh < 40) {
    s.lureCd = NW.M_LURE_CD[0] + Math.random() * (NW.M_LURE_CD[1] - NW.M_LURE_CD[0])
    const pool = [...VOICES, ...f.voices]
    const who = pool[Math.floor(Math.random() * pool.length)]
    audio.whisper(0.9)
    eng.msg(`雾里传来${who}的声音：${LURES[Math.floor(Math.random() * LURES.length)]}`, 'lore')
    once(eng, 'm-lure-tip', '（那不是他们。往声音的反方向走。）', 'system')
  }
  switch (s.phase) {
    case 'stalk': {
      setPhase(s, 'stalk', 'stride')
      stepMangledPursuit(eng, e, NW.M_SPEED * g, dt, NW.M_GRAB_R * g * .65)
      if (dh < NW.M_GRAB_R * g && e.attackCd <= 0 && !f.captor && !eng.dev.invisible && p.z < 3 && !playerIndoor(eng) && eng.los(e.x, e.y, p.x, p.y)) {
        setPhase(s, 'warn', 'snatch')
        eng.camShake = Math.min(1, eng.camShake + 0.3)
        eng.msg('头顶的浓雾里垂下了一条粗大的触须，正朝你落下来——快跑！', 'damage')
      }
      break
    }
    case 'warn':
      if (s.t < NW.M_WARN) break
      if (dh < (NW.M_GRAB_R + 1.5) * g && !f.captor && !eng.dev.invisible && p.z < 3 && !playerIndoor(eng) && eng.los(e.x, e.y, p.x, p.y)) {
        f.captor = e; s.mash = 0; s.mashNeed = NW.M_MASH; s.holdZ = 0.2
        setPhase(s, 'snatch', 'snatch'); audio.aggro()
        eng.msg('触须卷住了你的腰，把你拽离了地面！连按 跳跃/攻击/交互 挣脱——但你会从高处摔下去。', 'damage')
      } else { setPhase(s, 'stalk', 'stride'); e.attackCd = 2 }
      break
    case 'snatch':
      s.holdZ = NW.M_LIFT * Math.min(1, s.t / NW.M_LIFT_T)
      if (takeMash(s)) { releaseNW(eng, 'escape'); break }
      if (s.t >= NW.M_LIFT_T) setPhase(s, 'hold', 'hold')
      break
    case 'hold':
      s.holdZ = NW.M_LIFT + Math.sin(s.t * 1.3) * 0.4
      if (s.t > 1.5) once(eng, 'm-faces', '你被拉近那团东西的腹面——那里挤满了人脸。有几张脸在对你尖叫。')
      if (takeMash(s)) { releaseNW(eng, 'escape'); break }
      if (s.t > NW.M_HOLD_T) {
        // Finish the attack even when death is intercepted (e.g. developer invulnerability).
        // Releasing before die() avoids applying escape fall damage as a second death attempt.
        f.captor = undefined; s.holdZ = 0
        setPhase(s, 'stalk', 'stride'); e.attackCd = NW.M_COOL
        const map = eng.map
        eng.die('被残缺者同化——你成了雾里的又一张脸，又一个声音')
        if (eng.map === map && eng.player === p) {
          if (eng.over || p.hp <= 0) f.growth = Math.min((NW.M_GROW_MAX - 1) / NW.M_GROW, f.growth + 1)
          else p.vz = Math.min(p.vz, 0) // Surviving players fall naturally; the next grab still requires ground range.
        }
      }
      break
  }
}
/** 残缺者吞下其他实体（雾中顺路）：体型与声音库增长 */
export function mangledAssimilate(eng: Engine, victimName: string) {
  const f = F(eng)
  f.growth = Math.min((NW.M_GROW_MAX - 1) / NW.M_GROW, f.growth + 1)
  rememberVoice(eng, victimName)
}

/** L9 浓雾预警期的征兆（ambient.updateL9Fog 每帧调用）：气温骤降、地面震动、雷声 */
export function mangledOmen(eng: Engine, dt: number, k: number) {
  const f = F(eng)
  once(eng, 'm-cold', '气温骤降。你呼出的气变成了白雾，指尖开始发麻。', 'system')
  f.omenT -= dt
  if (f.omenT > 0) return
  f.omenT = 3.5 + Math.random() * 4 - k * 2
  if (Math.random() < 0.5) { eng.camShake = Math.min(1, eng.camShake + 0.25 + k * 0.35); eng.msg('地面震了一下。路边车的警报没有响——它们早就没电了。', 'system') }
  else { audio.caveThunder?.(0.5 + k * 0.5); eng.msg('雾的深处滚过一声闷雷。', 'system') }
}

// ---------------------------------------------------------------- 电子干扰
/** 观察者/残缺者附近，手电闪烁熄灭（腐蚀电子设备） */
function emp(eng: Engine, e: Entity, dt: number, d: number) {
  const f = F(eng), p = eng.player
  f.empCd -= dt / Math.max(1, eng.map!.entities.filter(q => !q.dead && !q.presentationPending && (q.def.type === 'watcher' || q.def.type === 'mangled')).length) // 每帧多只时不重复加速
  if (d > NW.EMP_R || !p.flashlight || f.empCd > 0) return
  f.empCd = NW.EMP_CD
  p.flashlight = false
  eng.msg('手电筒的光闪了几下，熄灭了。电池仓烫得吓人。', 'damage')
  const s = e.nw!
  spot(eng, e, s); s.seenT = Math.max(s.seenT, 0.3) // 电子设备会把它引来
}

/** entityAI 主循环入口 */
export function updateNW(eng: Engine, e: Entity, dt: number, d: number) {
  const s = e.nw ?? initNW(e)
  s.t += dt; s.clipT += dt
  if (s.kind === 'watcher') { updateWatcher(eng, e, dt, d); emp(eng, e, dt, d) }
  else if (s.kind === 'strider') updateStrider(eng, e, dt, d)
  else if (s.kind === 'mangled') { updateMangled(eng, e, dt); if(e.l9FogTravel?.mode!=='leave')emp(eng, e, dt, Math.hypot(eng.player.x - e.x, eng.player.y - e.y) * 0.6) }
  e.animT += dt
}
/** 挺进者死亡：放开被抓的玩家 */
export function nwKilled(eng: Engine, e: Entity) {
  if (F(eng).captor === e) releaseNW(eng, 'drop')
  if (e.nw) {
    if (e.nw.pocketX !== undefined && eng.map) {
      const m = eng.map, item = { id: Math.random(), type: 'pockets', x: e.x, y: e.y, z: e.z }
      m.items.push(item)
      const inf = m.inf
      if (inf) inf.chunks.get(Math.floor((e.x + inf.ox) / 32) + ',' + Math.floor((e.y + inf.oy) / 32))?.items.push(item)
      e.nw.pocketX = e.nw.pocketY = undefined
    }
    e.nw.clip = 'death'; e.nw.clipT = 0
  }
}
/** QA / 开发者：直接让某只实体抓住玩家（游戏内截图脚本用） */
export function nwSetCaptor(eng: Engine, e: Entity | undefined, holdZ = 0) { const f = F(eng); f.captor = e; if (e) { const s = e.nw ?? initNW(e); s.holdZ = holdZ } }
