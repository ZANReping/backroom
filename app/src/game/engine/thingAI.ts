// [thing] 七层之物（Entity 20（旧））重制 阶段 3：机制。
// 设定依据 wikidot old:entity-20、Fandom Entity_20 与 ZAN 2026-10-22 的决定：
// - 不可杀：没有任何攻击能伤到它（近乎永生的再生力）。普通武器砍上去只会让它转头迟滞，睡着的它会被打醒。
// - 「彼物之肉」只能拿刀从它身上割：同一处锯三刀割下一块。它平时休眠漂流（装死），割它的肉也不醒；
//   醒着时割它，它要么惊逃甩身（掀起一堵水墙），要么直接扑过来。
//   每只身上最多同时能割 3 块，伤口每 4 分钟长好一块；两块肉之间玩家要歇 20 秒（刀卷刃、手发抖）。
// - 只追踪运动中的物体：追击中你关掉手电、停下不动 4 秒，它就失去你的位置，从你身边游过去。
// - 它会写字：深海的焦油地上偶尔有被拖出来的字；你割过它之后，附近的海床上可能会出现新写的字。
// - 吃「彼物之肉」：饱腹极强，但会口臭（硫磺味）10 分钟——每 25 秒散出一次气味，像一次 14m 的噪音把附近实体引来；
//   在 Level 7 里，160m 内的七层之物会闻到自己的肉味，醒来朝你游过来。NPC 交谈时会嫌弃你的口气。
// 碰撞与命中：引擎侧维护一条与渲染同节距的简化跟随链（头部胶囊 + 28 节躯干胶囊），用于近战命中、割肉与推开玩家。
// 单人运行时状态；身体链与玩家运动记录随流式窗口原点重定位。
import type { Engine } from '../engine'
import type { Entity } from '../entities'
import type { Structure } from '../core/types'
import { audio } from '../core/audio'
import { CS, chunkKey } from '../world/infinite'
import { canOccupy } from '../core/player'
import { groundHeightAt } from '../world/mapgen'

const S = 3.4 // 与 renderer/thingMesh.ts 的 THING.S 一致（check:thing 校验）
export const THINGM = {
  /** 实体坐标 = 头部中心；颈接口在其后方 HEAD_C 米（渲染层据此把模型往后挪） */
  HEAD_C: 2.4 * S,
  /** 头部胶囊：从头心往前 FRONT 米到往后 BACK 米，半径 HEAD_R */
  HEAD_FRONT: 1.0, HEAD_BACK: 6.4, HEAD_R: 5.6,
  /** 躯干：28 节，节距 8.16m，半径从 5.4m 渐细到 4.6m */
  SEGS: 28, SEG: 2.4 * S, BODY_R0: 1.6 * S, BODY_R1: 1.36 * S,
  /** 巨口攻击：头心到玩家的距离（口在头心前约 6.5m） */
  BITE_REACH: 8.5, BITE_HIT: 9.2, BITE_Z: 6,
  /** 强光：照到头上的距离 / 高差 */
  LIGHT_D: 22, LIGHT_Z: 9,
  /** 休眠：生成时休眠的概率；冲刺游动在 WAKE_R 内会吵醒它；离开 RESLEEP_D 外平静 RESLEEP_T 秒后重新睡去 */
  DORMANT_P: 0.7, WAKE_R: 12, WAKE_LIGHT_T: 1.6, RESLEEP_D: 45, RESLEEP_T: 90,
  /** 只追踪运动：玩家水平速度低于 STILL_V 且关灯，持续 STILL_T 秒就丢失目标 */
  STILL_V: 0.45, STILL_T: 4,
  /** 割肉 */
  CUT_SWINGS: 3, MEAT_CAP: 3, MEAT_REGEN: 240, MEAT_CD: 20, MELEE: 2.2,
  /** 醒着时被割：FLEE_P 概率惊逃（否则直接扑咬）；惊逃 FLEE_T 秒，甩身水墙半径 WAVE_R、伤害 WAVE_DMG */
  FLEE_P: 0.5, FLEE_T: 6, FLEE_V: 2.4, WAVE_R: 16, WAVE_DMG: 25, WAVE_PUSH: 6,
  /** 写字：割肉后在附近海床写新字的概率、延迟；靠近 READ_R 内读到 */
  TAR_P: 0.35, TAR_DELAY: 25, READ_R: 4.5,
  /** 口臭 */
  BREATH_T: 600, BREATH_PING: 25, BREATH_NOISE_R: 14, BREATH_THING_R: 160,
} as const

import { TAR_WORDS, TAR_WORDS_CUT } from '../content/thingTar'

export interface ThingState {
  chain: { x: number; y: number; z: number }[]
  dormant: boolean
  wakeLightT: number
  still: number
  calm: number
  cut: number
  meat: number
  regenT: number
  fleeT: number
  lastPx: number; lastPy: number
  tarT: number
  originX: number; originY: number
  lost: boolean
}

const isThing = (e: Entity) => e.def.type === 'thething'
export const thingState = (e: Entity): ThingState | undefined => e.th

function init(e: Entity, eng: Engine): ThingState {
  const st: ThingState = {
    chain: [], dormant: Math.random() < THINGM.DORMANT_P, wakeLightT: 0, still: 0, calm: 0, cut: 0,
    meat: THINGM.MEAT_CAP, regenT: 0, fleeT: 0, lastPx: NaN, lastPy: NaN, tarT: -1,
    originX: eng.map?.inf?.ox ?? 0, originY: eng.map?.inf?.oy ?? 0, lost: false,
  }
  const fx = Math.cos(e.facing), fy = Math.sin(e.facing)
  for (let i = 0; i <= THINGM.SEGS; i++) {
    const back = THINGM.HEAD_C + i * THINGM.SEG
    st.chain.push({ x: e.x - fx * back, y: e.y - fy * back, z: e.z })
  }
  e.th = st
  if (st.dormant) { e.state = 'idle'; e.stateT = 0 }
  return st
}

/** Keep all local simulation coordinates coherent when the 32m streaming window moves. */
function runtime(eng: Engine, e: Entity): ThingState {
  const st = e.th ?? init(e, eng), ox = eng.map?.inf?.ox ?? 0, oy = eng.map?.inf?.oy ?? 0
  const dx = ox - st.originX, dy = oy - st.originY
  if (dx || dy) {
    for (const n of st.chain) { n.x -= dx; n.y -= dy }
    st.lastPx -= dx; st.lastPy -= dy; st.originX = ox; st.originY = oy
  }
  return st
}

/** 简化跟随链：chain[0] 是颈接口（头心后 HEAD_C 米），之后每节拉到前一节 SEG 米处 */
function updateChain(e: Entity, st: ThingState) {
  const fx = Math.cos(e.facing), fy = Math.sin(e.facing)
  const c = st.chain
  c[0].x = e.x - fx * THINGM.HEAD_C; c[0].y = e.y - fy * THINGM.HEAD_C; c[0].z = e.z
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1], b = c[i]
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
    const l = Math.hypot(dx, dy, dz) || 1
    b.x = a.x + dx / l * THINGM.SEG; b.y = a.y + dy / l * THINGM.SEG; b.z = a.z + dz / l * THINGM.SEG
  }
}

const bodyR = (i: number) => THINGM.BODY_R0 + (THINGM.BODY_R1 - THINGM.BODY_R0) * Math.min(1, i / THINGM.SEGS)

/** 点到线段的最近点 */
function closest(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  const vx = bx - ax, vy = by - ay, vz = bz - az
  const l2 = vx * vx + vy * vy + vz * vz || 1
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy + (pz - az) * vz) / l2))
  return { x: ax + vx * t, y: ay + vy * t, z: az + vz * t }
}

/** 玩家到七层之物表面的最近距离（负数=在体内）、最近点与部位 */
export function thingSurface(eng: Engine, e: Entity): { d: number; x: number; y: number; z: number; part: 'head' | 'body' } {
  const st = runtime(eng, e)
  const p = eng.player
  const fx = Math.cos(e.facing), fy = Math.sin(e.facing)
  const q = closest(p.x, p.y, p.z, e.x + fx * THINGM.HEAD_FRONT, e.y + fy * THINGM.HEAD_FRONT, e.z, e.x - fx * THINGM.HEAD_BACK, e.y - fy * THINGM.HEAD_BACK, e.z)
  let best = { d: Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) - THINGM.HEAD_R, ...q, part: 'head' as 'head' | 'body' }
  // The full visible body remains solid and harvestable, including its distant segments.
  for (let i = 1; i < st.chain.length; i++) {
    const a = st.chain[i - 1], b = st.chain[i]
    const c = closest(p.x, p.y, p.z, a.x, a.y, a.z, b.x, b.y, b.z)
    const d = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) - bodyR(i)
    if (d < best.d) best = { d, ...c, part: 'body' }
  }
  return best
}

/** 近战命中判定（取代旧的 18 节直链近似）：表面在 MELEE 米内，且大致在准星前方（贴身免朝向） */
export function thingMeleePart(eng: Engine, e: Entity): 'head' | 'body' | null {
  if (!isThing(e) || e.dead) return null
  const s = thingSurface(eng, e), p = eng.player
  if (s.d > THINGM.MELEE) return null
  if (s.d > 0.6) {
    let diff = Math.abs(Math.atan2(s.y - p.y, s.x - p.x) - p.facing)
    if (diff > Math.PI) diff = Math.PI * 2 - diff
    if (diff > 1.2) return null
  }
  return s.part
}

/** combat.killCheck 钩子：不可杀，血量永远回满 */
export function thingKillGuard(eng: Engine, e: Entity): boolean {
  if (!isThing(e)) return false
  if (e.hp < e.def.hp) thingStruck(eng, e)
  e.hp = e.def.hp; e.dead = false
  return true
}

function wake(eng: Engine, e: Entity, st: ThingState, how: 'light' | 'noise' | 'hit' | 'smell', x?: number, y?: number) {
  if (!st.dormant) return
  st.dormant = false; st.calm = 0; st.lost = false
  if (how === 'hit') { e.activated = true; e.state = 'chase'; e.stateT = 0 }
  else { e.state = 'investigate'; e.targetX = x ?? eng.player.x; e.targetY = y ?? eng.player.y; e.stateT = 6 }
  const d = Math.hypot(e.x - eng.player.x, e.y - eng.player.y)
  if (d < 60 || how === 'smell') eng.msg(how === 'light' ? '光束停在那只浑浊的大眼上太久了。眼睑一样的照膜慢慢退开。'
    : how === 'hit' ? '你砸在它身上。那座漂着的「尸体」整个绷紧了——它醒了。'
    : how === 'smell' ? '黑水深处有什么东西转了个方向。它闻到了自己的肉味。'
    : '你划水的动静在黑水里荡开。漂着的那座「尸体」，鳃盖动了一下。', 'damage')
  if (how !== 'smell') audio.aggro()
}

/** 普通武器（非刀）打中：不掉血；转头迟滞 3 秒；睡着的被打醒 */
export function thingStruck(eng: Engine, e: Entity) {
  const st = runtime(eng, e)
  if ((e.turnSlowT ?? 0) <= 0) eng.msg('这一下砸进它皮革般的厚皮——伤不到它分毫，但它转头的动作滞涩了一瞬。', 'system')
  e.turnSlowT = 3
  if (st.dormant) wake(eng, e, st, 'hit')
  eng.bloodParticles(eng.player.x, eng.player.y)
}

/** 拿刀割：同一处锯 CUT_SWINGS 刀割下一块「彼物之肉」 */
export function thingCut(eng: Engine, e: Entity, part: 'head' | 'body') {
  const st = runtime(eng, e)
  eng.bloodParticles(eng.player.x, eng.player.y)
  if (eng.thingMeatCd > 0) {
    eng.msg(`刀刃打滑——手还在抖，刀口也卷了。（还要 ${Math.ceil(eng.thingMeatCd)} 秒）`, 'system')
    return
  }
  if (st.meat <= 0) {
    eng.msg('能下刀的地方都是刚愈合的新肉，滑得像油，刀根本吃不进去。（伤口约 4 分钟长好一块）', 'system')
    return
  }
  st.cut++
  if (st.cut < THINGM.CUT_SWINGS) {
    eng.msg(st.cut === 1 ? '刀尖扎进厚皮，黑色的焦油从刀口渗出来，硫磺味呛得你想吐。' : '你来回锯着那块油腻的肉……', 'system')
  } else {
    st.cut = 0; st.meat--
    eng.thingMeatCd = THINGM.MEAT_CD
    if (eng.addItem('thingmeat')) eng.msg('一块彼物之肉被你割了下来。它还在你手里微微抽动。', 'loot')
    else eng.msg('你割下了一块肉，可身上没地方放了——它打着旋沉进了黑水。', 'system')
    if (Math.random() < THINGM.TAR_P) st.tarT = THINGM.TAR_DELAY
  }
  if (!st.dormant) {
    // 醒着被割：惊逃甩身，或者直接扑过来
    if (Math.random() < THINGM.FLEE_P) startFlee(eng, e, st)
    else { e.activated = true; e.state = 'chase'; e.stateT = 0; eng.msg('它整条身子拧了过来——那张嘴在找你。', 'damage'); audio.aggro() }
  } else if (part === 'head') {
    eng.msg('它的眼睛没有动。它在装死——或者它真的不在乎。', 'lore')
  }
}

function startFlee(eng: Engine, e: Entity, st: ThingState) {
  st.fleeT = THINGM.FLEE_T
  const p = eng.player
  const s = thingSurface(eng, e)
  eng.camShake = Math.min(1, eng.camShake + 0.8)
  if (s.d < THINGM.WAVE_R) {
    eng.hurtPlayer(THINGM.WAVE_DMG * (1 - Math.max(0, s.d) / THINGM.WAVE_R * 0.6), '七层之物甩身掀起的水墙')
    const dx = p.x - s.x, dy = p.y - s.y, l = Math.hypot(dx, dy) || 1
    pushPlayer(eng, dx / l * THINGM.WAVE_PUSH, dy / l * THINGM.WAVE_PUSH, 0)
    eng.msg('它整条身体猛地一甩——一堵水墙把你掀了出去。', 'damage')
  }
}

function pushPlayer(eng: Engine, dx: number, dy: number, dz: number) {
  const m = eng.map!, p = eng.player
  const steps = Math.ceil(Math.hypot(dx, dy) / 0.4) || 1
  for (let k = 0; k < steps; k++) {
    const nx = p.x + dx / steps, ny = p.y + dy / steps
    const ti = Math.floor(ny) * m.w + Math.floor(nx)
    if (nx < 1 || ny < 1 || nx >= m.w - 1 || ny >= m.h - 1 || m.liquid[ti] !== 1) break
    if (!canOccupy(m, nx, ny, undefined, { z: p.z, band: 0, crouch: p.crouching, from: { x: p.x, y: p.y } })) break
    p.x = nx; p.y = ny
  }
  if (dz) {
    const nz = Math.min(0, p.z + dz)
    if (canOccupy(m, p.x, p.y, undefined, { z: nz, band: 0, crouch: p.crouching, from: { x: p.x, y: p.y } })) p.z = nz
  }
}

/** entityAI.noiseEvent 钩子：休眠时只有冲刺游动 / 明显响动在 WAKE_R 内才吵醒它（返回 true=已处理） */
export function thingHear(eng: Engine, e: Entity, x: number, y: number, radius: number, sprint: boolean): boolean {
  const st = runtime(eng, e)
  if (!st.dormant) { if (st.lost && !(sprint || radius >= 10)) return true; st.lost = false; return false }
  const d = Math.hypot(e.x - x, e.y - y)
  if ((sprint || radius >= 10) && d < Math.max(THINGM.WAKE_R, radius * 0.8)) wake(eng, e, st, 'noise', x, y)
  return true
}

/** entityAI 主循环钩子。返回 true = 本帧已完全接管（休眠 / 惊逃），跳过通用 AI */
export function updateThing(eng: Engine, e: Entity, dt: number, d: number, lightOn: boolean, lit: boolean): boolean {
  const st = runtime(eng, e)
  const p = eng.player
  e.hp = e.def.hp // 近乎永生的再生力
  // 伤口长好
  if (st.meat < THINGM.MEAT_CAP) { st.regenT += dt; if (st.regenT >= THINGM.MEAT_REGEN) { st.regenT = 0; st.meat++ } }
  updateChain(e, st)
  // 玩家自己的水平速度（只追踪运动中的物体；先于下面的推开，被它挤开不算「自己在动」）
  const v = Number.isFinite(st.lastPx) ? Math.hypot(p.x - st.lastPx, p.y - st.lastPy) / Math.max(1e-3, dt) : 0
  if (lightOn || v >= THINGM.STILL_V) st.lost = false
  // 推开玩家：不允许游进它的身体里
  const s = thingSurface(eng, e)
  if (s.d < 0.5) {
    const dx = p.x - s.x, dy = p.y - s.y, dz = p.z - s.z, l = Math.hypot(dx, dy, dz) || 1
    const k = 0.5 - s.d
    pushPlayer(eng, dx / l * k, dy / l * k, dz / l * k)
  }
  st.lastPx = p.x; st.lastPy = p.y
  // 写字（割肉后）
  if (st.tarT > 0) { st.tarT -= dt; if (st.tarT <= 0) { st.tarT = -1; writeTar(eng, true) } }

  // 惊逃：背离玩家高速甩身游走
  if (st.fleeT > 0) {
    st.fleeT -= dt
    const away = Math.atan2(e.y - p.y, e.x - p.x)
    eng.faceToward(e, e.x + Math.cos(away) * 10, e.y + Math.sin(away) * 10, dt, 1.6)
    e.targetX = e.x + Math.cos(e.facing) * 10; e.targetY = e.y + Math.sin(e.facing) * 10
    eng.stepEntity(e, e.def.speed * THINGM.FLEE_V, dt)
    e.state = 'wander'
    if (st.fleeT <= 0) { e.activated = false; e.lightStressT = 0; st.calm = 0 }
    return true
  }

  if (st.dormant) {
    e.state = 'idle'; e.lightRecoilT = 0
    // 强光照在头上太久会醒
    if (lit) { st.wakeLightT += dt; if (st.wakeLightT > THINGM.WAKE_LIGHT_T) wake(eng, e, st, 'light') }
    else st.wakeLightT = Math.max(0, st.wakeLightT - dt * 0.5)
    // 休眠漂流：几乎不动，随水流极慢地偏航
    e.facing += Math.sin(eng.time * 0.05 + e.id) * 0.004 * dt
    return st.dormant
  }

  // 醒着：只追踪运动中的物体
  if (e.state === 'chase' || e.state === 'attack') {
    if (!lightOn && v < THINGM.STILL_V) {
      st.still += dt
      if (st.still > THINGM.STILL_T) {
        st.still = 0; st.lost = true; e.activated = false; e.lightStressT = 0
        e.state = 'wander'; e.stateT = 8
        e.targetX = e.x + Math.cos(e.facing) * 30; e.targetY = e.y + Math.sin(e.facing) * 30
        if (d < 40) eng.msg('巨口在离你不到十米的地方合上，又张开。它慢慢游了过去——它看不见不动的东西。', 'lore')
      }
    } else st.still = 0
    st.calm = 0
  } else if (d > THINGM.RESLEEP_D) {
    st.calm += dt
    if (st.calm > THINGM.RESLEEP_T) { st.dormant = true; st.calm = 0; e.state = 'idle' }
  } else st.calm = 0
  if (st.dormant) return true
  return false
}

/** 每帧（movement，L7 与全局）：口臭气味、读焦油字 */
export function stepThingWorld(eng: Engine, dt: number) {
  const p = eng.player, m = eng.map
  if (!m) return
  if (eng.thingBreathT > 0) {
    eng.thingBreathPingT -= dt
    if (eng.thingBreathPingT <= 0) {
      eng.thingBreathPingT = THINGM.BREATH_PING
      breathPing(eng)
    }
  }
  if (eng.levelDef.id !== 7) return
  for (const s of m.structures) {
    if (s.kind !== 'tarwriting' || s.data?.read) continue
    const gx = s.x + s.w / 2, gy = s.y + s.h / 2
    if (Math.hypot(gx - p.x, gy - p.y, groundHeightAt(m, gx, gy, 0) - (p.z + 1.35)) > THINGM.READ_R) continue
    s.data = { ...s.data, read: 1 }
    const w = String(s.data?.text ?? '')
    eng.msg(`海床上的焦油被什么东西拖成了歪斜的字：「${w}」`, 'lore')
    p.sanity = Math.max(0, p.sanity - (s.data?.fresh ? 6 : 3))
  }
}

function breathPing(eng: Engine) {
  const p = eng.player, m = eng.map!
  // 像一次噪音一样把附近的实体引过来（不叠加玩家噪音残余）
  const keep = eng.playerNoiseT
  eng.noiseEvent(p.x, p.y, THINGM.BREATH_NOISE_R, false)
  eng.playerNoiseT = keep
  if (eng.levelDef.id === 7) {
    for (const e of m.entities) {
      if (!isThing(e) || e.dead) continue
      if (Math.hypot(e.x - p.x, e.y - p.y) > THINGM.BREATH_THING_R) continue
      const st = runtime(eng, e)
      if (st.dormant) wake(eng, e, st, 'smell', p.x, p.y)
      else if (e.state !== 'chase' && e.state !== 'attack') { e.state = 'investigate'; e.targetX = p.x; e.targetY = p.y; e.stateT = 8 }
    }
  }
}

/** inventory 'eat' 钩子：吃下彼物之肉 */
export function eatThingMeat(eng: Engine) {
  const p = eng.player
  p.hunger = Math.min(100, p.hunger + 55)
  p.hp = Math.min(100, p.hp + 10)
  p.sanity = Math.max(0, p.sanity - 8)
  const again = eng.thingBreathT > 0
  eng.thingBreathT = THINGM.BREATH_T
  eng.thingBreathPingT = 4
  eng.msg(again ? '又一块。硫磺味从胃里一路顶到鼻腔，你连自己都闻得到。（口臭重新计时 10 分钟）'
    : '油腻、富脂、带着腥甜和硫磺味，咽下去时还在你喉咙里抽了一下。（饥饿 +55 · 生命 +10 · 理智 -8 · 口臭 10 分钟：气味会把附近的东西引过来）', 'lore')
}

/** NPC 交谈钩子：口臭时对方的反应（返回提示文本，无口臭返回 null） */
export function thingBreathRemark(eng: Engine, name: string): string | null {
  if (eng.thingBreathT <= 0) return null
  const lines = [`${name}往后退了半步：「你嘴里什么味？……硫磺？」`, `${name}屏住呼吸跟你说话，眼睛一直往别处看。`, `${name}皱起鼻子：「你又吃了那片海里的东西，是吧。」`]
  return lines[Math.floor(Math.random() * lines.length)]
}

/** 在玩家附近的海床上写一行焦油字（fresh=割过它之后新写的） */
export function writeTar(eng: Engine, fresh: boolean): Structure | null {
  const m = eng.map, p = eng.player
  if (!m || eng.levelDef.id !== 7) return null
  const pool = fresh ? TAR_WORDS_CUT : TAR_WORDS
  const text = pool[Math.floor(Math.random() * pool.length)]
  for (let tr = 0; tr < 30; tr++) {
    const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 10
    const tx = Math.floor(p.x + Math.cos(a) * r), ty = Math.floor(p.y + Math.sin(a) * r)
    let ok = true
    for (let j = ty; j < ty + 2 && ok; j++) for (let i = tx; i < tx + 4 && ok; i++) {
      if (i < 1 || j < 1 || i >= m.w - 1 || j >= m.h - 1 || m.liquid[j * m.w + i] !== 1) ok = false
    }
    if (!ok) continue
    const s: Structure = { kind: 'tarwriting', x: tx, y: ty, w: 4, h: 2, solid: false, data: { text, fresh: fresh ? 1 : 0, rot: Math.round(a * 100) / 100 } }
    m.structures.push(s)
    const inf = m.inf
    if (inf) {
      inf.chunks.get(chunkKey(Math.floor((inf.ox + tx) / CS), Math.floor((inf.oy + ty) / CS)))?.structures.push(s)
      inf.redo = (inf.redo ?? 0) + 1
    }
    eng.mapRev++
    return s
  }
  return null
}
