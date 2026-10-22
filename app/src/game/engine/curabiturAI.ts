// 受眷鸟（Entity 37）重制 阶段 3：AI 与衍生物品机制。数值见 engine/curabiturTuning.ts。
//
// 接入点（共享文件里都用 // [L8-curabitur] 标出）：
//   entityAI.updateEntities —— generic 分派：updateCurabitur（替换旧的 avoidsHumans/hunts 通用逻辑）；
//                               实体循环结束后 curabiturPostStep（飞蛾诱引/驱避、受眷胶燃烧、孢子下落与腐解、腐液滩）
//   combat.killCheck        —— curabiturKilled（坠落尸体 + 掉落受眷胶）
//   inventory.finishUseSlot —— curabiturUseItem（受眷胶涂抹/放置、孢子捣碎、驱蛾剂泼洒）
//   renderer/curabiturRender.ts 读取本文件导出的状态（片段、灯光、腐液滩、下落孢子）
//
// 行为概要：
//   雌雄都悬浮在洞顶下方（身体中心距洞顶 hoverGap）。
//   雌性：lure（放舌光）→ 雄性死亡飞蛾被吸到舌尖绕飞 → 进入 REACH 后 strike → BITE_T 时刻移除飞蛾 → eat → 冷却。
//   雄性：周期性 spore_release，孢子缓慢飘落，落地变成可拾取的「受眷孢子」。
//   对人类：避开。玩家水平距离 < avoidR(4m) 或受到伤害 → flee（上升 + 远离）；keepR 内缓慢后退。
//   死亡：坠落到地面，尸体停留 corpseTime 秒，掉落受眷胶。
//   星群：同类在 swarmDetectR 内 ≥ swarmDetect 只时进入星群模式——共享栖点、空闲时一起垂舌发光。
// 运行时状态不入存档、不进联机快照（与其他重制实体一致）。
import type { Engine } from '../engine'
import type { Entity } from '../entities'
import type { GroundItem } from '../core/types'
import { caveCeilingAt, floorHeight, tileAt } from '../world/mapgen'
import { WALL_H } from '../renderer/shared'
import { ITEMS } from '../content/items'
import { audio } from '../core/audio'
import {
  CURABITUR_STRIKE_BITE_T, CURABITUR_STRIKE_REACH, CURABITUR_SPORE_TIMING, CURABITUR_CLIPS, type CurabiturClip,
} from '../renderer/curabiturAnim'
import { CB_ITEM, CURABITUR as C, CURABITUR_GEL as GEL, CURABITUR_SPORE as SP, SPORE_ROT_S } from './curabiturTuning'
import { h32 } from '../world/infiniteSeed'

export type CurabiturSex = 'female' | 'male'
export type CurabiturMode = 'hover' | 'lure' | 'strike' | 'eat' | 'spore' | 'flee' | 'hit'

export interface CurabiturState {
  sex: CurabiturSex
  seed: number
  mode: CurabiturMode
  modeT: number
  /** 当前动画片段与已播放时间；prev 用于 0.25s 混合过渡（渲染层读取） */
  clip: CurabiturClip; clipT: number
  prevClip: CurabiturClip; prevT: number; blend: number
  /** 是否在水平移动（drift / float_idle 切换） */
  moving: boolean
  /** 栖点（世界坐标，窗口平移不影响） */
  homeWX: number; homeWY: number
  /** 自管的悬浮高度（每帧覆盖 updateFlyingAltitude 的结果） */
  z: number
  lastHp: number
  lureCd: number
  sporeCd: number
  sporeReleased: number
  prey?: Entity
  bitten: boolean
  fleeWX: number; fleeWY: number
  roamT: number
  /** 当前漫游点（世界坐标） */
  roamWX: number; roamWY: number
  swarm: boolean
  swarmScanT: number
  /** 死亡瞬间的高度与地面（渲染层计算坠落高度） */
  deathZ?: number; deathGround?: number
  eaten: number
  /** 最近一次咬合发生在 strike 的第几秒（验收用） */
  biteClipT?: number
  /** 最近一次发动 strike 时猎物离舌尖的距离（验收用） */
  strikeDist?: number
}

const STATES = new WeakMap<Entity, CurabiturState>()
export function curabiturStateOf(e: Entity): CurabiturState | undefined { return STATES.get(e) }

/** 性别按出生点世界坐标哈希（同一位置重载后一致；星群内自然混合） */
export function curabiturSexAt(wx: number, wy: number): CurabiturSex {
  return (h32(Math.round(wx * 8), Math.round(wy * 8), 0x5e7) & 1) ? 'male' : 'female'
}
const ox = (eng: Engine) => eng.map?.inf?.ox ?? 0
const oy = (eng: Engine) => eng.map?.inf?.oy ?? 0

export function ensureCurabitur(eng: Engine, e: Entity): CurabiturState {
  let st = STATES.get(e)
  if (st) return st
  const wx = e.x + ox(eng), wy = e.y + oy(eng)
  const sex = curabiturSexAt(wx, wy)
  const seed = h32(Math.round(wx * 4), Math.round(wy * 4), 0x37) % 997
  st = {
    sex, seed, mode: 'hover', modeT: 0,
    clip: 'float_idle', clipT: (seed % 40) / 10, prevClip: 'float_idle', prevT: 0, blend: 1, moving: false,
    homeWX: wx, homeWY: wy, z: e.z, lastHp: e.hp,
    lureCd: 2 + (seed % 9), sporeCd: C.sporeInterval * ((seed % 100) / 100), sporeReleased: 0,
    bitten: false, fleeWX: wx, fleeWY: wy, roamT: 0, roamWX: wx, roamWY: wy, swarm: false, swarmScanT: 0, eaten: 0,
  }
  STATES.set(e, st)
  if (eng.map) st.z = hoverZ(eng, e, st)
  e.flightReady = true
  return st
}
/** 测试/开发：强制性别（渲染层会按新性别重建模型） */
export function setCurabiturSex(eng: Engine, e: Entity, sex: CurabiturSex) { ensureCurabitur(eng, e).sex = sex }

/** 个体总缩放：实例缩放 × 雄性体型 0.74（与 curabiturMesh 一致） */
export function curabiturScale(e: Entity, st: CurabiturState) { return (e.def.scale ?? 1) * (st.sex === 'male' ? 0.74 : 1) }

function groundAt(eng: Engine, x: number, y: number) { return floorHeight(eng.map!, x, y, 0) }
function roofAt(eng: Engine, x: number, y: number, ground: number) {
  const m = eng.map!
  return m.organicCave ? caveCeilingAt(m, x, y) : ground + (WALL_H[eng.levelDef.gen] ?? 3)
}
function hoverZ(eng: Engine, e: Entity, st: CurabiturState, gap: number = C.hoverGap) {
  const S = curabiturScale(e, st), g = groundAt(eng, e.x, e.y), r = roofAt(eng, e.x, e.y, g)
  const z = r - gap * S
  return Math.max(Math.min(g + C.hoverMinAboveGround, r - 0.55 * S), Math.min(z, r - 0.5 * S))
}

/** 舌尖（诱捕肉球）的位置：身体中心沿朝向前 lureTipFwd、向下 lureTipDown（乘个体缩放） */
export function curabiturLureTip(e: Entity, st: CurabiturState) {
  const S = curabiturScale(e, st)
  return { x: e.x + Math.cos(e.facing) * C.lureTipFwd * S, y: e.y + Math.sin(e.facing) * C.lureTipFwd * S, z: e.z - C.lureTipDown * S }
}
export const CURABITUR_STRIKE_TRIGGER = CURABITUR_STRIKE_REACH + C.strikeSlack

function setClip(st: CurabiturState, clip: CurabiturClip) {
  if (st.clip === clip) return
  st.prevClip = st.clip; st.prevT = st.clipT; st.blend = 0
  st.clip = clip; st.clipT = 0
}
function enter(st: CurabiturState, mode: CurabiturMode) { st.mode = mode; st.modeT = 0 }
function releasePrey(st: CurabiturState) {
  const w = st.prey
  st.prey = undefined
  if (w) LURED_BY.delete(w)
}

function startFlee(eng: Engine, e: Entity, st: CurabiturState, fromX: number, fromY: number, hit: boolean) {
  releasePrey(st)
  let ax = e.x - fromX, ay = e.y - fromY
  const len = Math.hypot(ax, ay)
  if (len < 0.05) { const a = st.seed; ax = Math.cos(a); ay = Math.sin(a) } else { ax /= len; ay /= len }
  // 逃离方向如果正对岩壁，左右各偏 50° 试一次（最终仍由 stepEntity 碰撞兜底）
  const m = eng.map!
  let best = { x: e.x + ax * C.fleeDist, y: e.y + ay * C.fleeDist }
  for (const turn of [0, 0.87, -0.87, 1.6, -1.6]) {
    const c = Math.cos(turn), s = Math.sin(turn), dx = ax * c - ay * s, dy = ax * s + ay * c
    let ok = true
    for (let k = 1; k <= 4 && ok; k++) if (tileAt(m, Math.floor(e.x + dx * k), Math.floor(e.y + dy * k)) !== 1) ok = false
    if (ok) { best = { x: e.x + dx * C.fleeDist, y: e.y + dy * C.fleeDist }; break }
  }
  st.fleeWX = best.x + ox(eng); st.fleeWY = best.y + oy(eng)
  enter(st, hit ? 'hit' : 'flee')
  setClip(st, hit ? 'hit' : 'flee')
}

/** 雌性附近被舌光吸引的飞蛾（由 curabiturPostStep 每帧维护）：moth → bird */
const LURED_BY = new Map<Entity, Entity>()
export function curabiturLuredBy(moth: Entity): Entity | undefined { return LURED_BY.get(moth) }

// ---------------------------------------------------------------------------
// 每只受眷鸟的 AI（entityAI generic 分派调用；dmgMult 不用——受眷鸟不攻击人）
// ---------------------------------------------------------------------------
export function updateCurabitur(eng: Engine, e: Entity, dt: number, d: number): void {
  const st = ensureCurabitur(eng, e)
  const m = eng.map!, p = eng.player
  st.modeT += dt; st.clipT += dt; st.blend = Math.min(1, st.blend + dt / 0.25)
  st.lureCd -= dt; st.sporeCd -= dt
  e.provoked = false; e.targetEnt = undefined // 不走通用激怒/追击；受击由血量变化检测
  e.animT += dt

  // 星群判定（每 2 秒）：附近同类够多就共用栖点
  st.swarmScanT -= dt
  if (st.swarmScanT <= 0) {
    st.swarmScanT = 2 + (st.seed % 7) * 0.1
    let n = 0, sx = 0, sy = 0
    for (const q of m.entities) if (q.def.type === 'curabitur' && !q.dead && Math.hypot(q.x - e.x, q.y - e.y) < C.swarmDetectR) { n++; sx += q.x; sy += q.y }
    const was = st.swarm
    st.swarm = n >= C.swarmDetect
    if (st.swarm && st.mode === 'hover') {
      // 星群：刚入群时就地把当前位置当栖点（成员本来就聚在一起）；离群心太远才往中心收拢
      const gx = sx / n, gy = sy / n
      if (!was) { st.homeWX = e.x + ox(eng); st.homeWY = e.y + oy(eng); st.roamT = Math.max(st.roamT, 4); st.roamWX = st.homeWX; st.roamWY = st.homeWY }
      else if (Math.hypot(st.homeWX - ox(eng) - gx, st.homeWY - oy(eng) - gy) > C.swarmR * 1.5) {
        st.homeWX = (st.homeWX - ox(eng)) * 0.5 + gx * 0.5 + ox(eng); st.homeWY = (st.homeWY - oy(eng)) * 0.5 + gy * 0.5 + oy(eng)
      }
    }
  }

  // 受伤检测：任何来源的伤害都会让它受惊（玩家近战、投掷物、其他实体）
  if (e.hp < st.lastHp - 1e-6 && st.mode !== 'hit') startFlee(eng, e, st, p.x, p.y, true)
  st.lastHp = e.hp

  const dH = eng.dev.invisible ? 1e9 : Math.hypot(e.x - p.x, e.y - p.y)
  if (dH < C.avoidR && st.mode !== 'flee' && st.mode !== 'hit') startFlee(eng, e, st, p.x, p.y, false)

  let zTarget = hoverZ(eng, e, st), climb: number = C.climb
  const homeX = st.homeWX - ox(eng), homeY = st.homeWY - oy(eng)
  st.moving = false
  const move = (tx: number, ty: number, speed: number) => {
    e.targetX = tx; e.targetY = ty
    const bx = e.x, by = e.y
    const stuck = eng.stepEntity(e, speed, dt)
    st.moving = Math.hypot(e.x - bx, e.y - by) > speed * dt * 0.3
    return stuck
  }

  switch (st.mode) {
    case 'hover': {
      e.state = 'wander'
      if (dH < C.keepR) {
        // 玩家在附近：慢慢退开，同时朝向玩家（警惕）
        const k = 1 / Math.max(0.1, dH)
        move(e.x + (e.x - p.x) * k * 2, e.y + (e.y - p.y) * k * 2, e.def.speed * C.roamSpeed * 1.6)
        eng.faceToward(e, p.x, p.y, dt, 1.5)
      } else {
        st.roamT -= dt
        if (st.roamT <= 0) {
          // 到点后停下悬浮一阵再换下一个漫游点（星群成员只在栖点附近小幅挪动）
          st.roamT = (st.swarm ? 9 : 5) + (st.seed % 5)
          const a = Math.random() * Math.PI * 2, r = Math.random() * (st.swarm ? 0.6 : C.roamR)
          let tx = homeX + Math.cos(a) * r, ty = homeY + Math.sin(a) * r
          if (tileAt(m, Math.floor(tx), Math.floor(ty)) !== 1) { tx = homeX; ty = homeY }
          st.roamWX = tx + ox(eng); st.roamWY = ty + oy(eng)
        }
        const rx = st.roamWX - ox(eng), ry = st.roamWY - oy(eng)
        if (Math.hypot(rx - e.x, ry - e.y) > 0.3) {
          if (move(rx, ry, e.def.speed * C.roamSpeed) && !st.moving) st.roamT = Math.min(st.roamT, 1) // 卡住：稍后换点
          if (st.moving) eng.faceToward(e, rx, ry, dt, 0.8)
        }
      }
      // 星群空闲时一起垂舌发光（舌光连成一片）；独居个体空闲时悬浮呼吸
      setClip(st, st.swarm && !st.moving ? 'lure' : st.moving ? 'drift' : 'float_idle')
      if (st.sex === 'female' && st.lureCd <= 0 && dH >= C.keepR) { enter(st, 'lure'); setClip(st, 'lure') }
      else if (st.sex === 'male' && st.sporeCd <= 0 && dH >= C.keepR) { enter(st, 'spore'); st.sporeReleased = 0; setClip(st, 'spore_release') }
      break
    }
    case 'lure': {
      e.state = 'idle'
      setClip(st, 'lure')
      if (dH < C.keepR) { enter(st, 'hover'); st.lureCd = 4; releasePrey(st); break }
      // 选定猎物：被本只吸引、离舌尖最近的飞蛾
      const tip = curabiturLureTip(e, st)
      let prey: Entity | undefined, pd = 1e9
      for (const [moth, bird] of LURED_BY) {
        if (bird !== e || moth.dead) continue
        const md = Math.hypot(moth.x - tip.x, moth.y - tip.y, moth.z - tip.z)
        if (md < pd) { pd = md; prey = moth }
      }
      st.prey = prey
      if (prey) eng.faceToward(e, prey.x, prey.y, dt, 0.9)
      // 舌光完全放下（引入 1.2s）之后，猎物进入 REACH 即扑击
      if (prey && st.clipT > 1.2 && pd < CURABITUR_STRIKE_TRIGGER) { enter(st, 'strike'); setClip(st, 'strike'); st.bitten = false; st.strikeDist = pd }
      else if (st.modeT > C.lureMax) { enter(st, 'hover'); st.lureCd = C.lureCooldown; releasePrey(st) }
      break
    }
    case 'strike': {
      e.state = 'attack'
      if (!st.bitten && st.clipT >= CURABITUR_STRIKE_BITE_T) {
        st.bitten = true; st.biteClipT = st.clipT
        const prey = st.prey, tip = curabiturLureTip(e, st)
        if (prey && !prey.dead && Math.hypot(prey.x - tip.x, prey.y - tip.y, prey.z - tip.z) < CURABITUR_STRIKE_REACH + C.biteSlack) {
          // 咬合这一帧移除飞蛾（整只吞下，不留尸体、不掉落）
          prey.dead = true; prey.deathT = 0; prey.hidden = true; prey.hp = 0
          st.eaten++
          releasePrey(st)
          if (d < 12) eng.msg('受眷鸟舌尖的微光一收，黏舌把那只死亡飞蛾卷进了钩喙里。', 'system')
          enter(st, 'eat'); setClip(st, 'eat')
        } else releasePrey(st)
      }
      if (st.mode === 'strike' && st.clipT >= (CURABITUR_CLIPS[st.sex].strike?.len ?? 0.9)) { enter(st, 'lure'); st.modeT = C.lureMax * 0.5; setClip(st, 'lure') }
      break
    }
    case 'eat': {
      e.state = 'idle'
      setClip(st, 'eat')
      if (st.modeT >= C.eatTime) { enter(st, 'hover'); st.lureCd = C.lureCooldown }
      break
    }
    case 'spore': {
      e.state = 'idle'
      setClip(st, 'spore_release')
      // 孢子囊依次亮起、脱落：在第 k 颗「可拾取孢子」对应的脱落时刻生成下落孢子
      const { start, span, hold } = CURABITUR_SPORE_TIMING
      while (st.sporeReleased < C.sporeDrop && st.clipT >= start + span * (st.sporeReleased + 1) / (C.sporeDrop + 1) + hold) {
        st.sporeReleased++
        dropSpore(eng, e, st)
      }
      if (st.clipT >= (CURABITUR_CLIPS.male.spore_release?.len ?? 3.6)) {
        enter(st, 'hover'); st.sporeCd = C.sporeInterval + (Math.random() - 0.5) * 2 * C.sporeJitter
      }
      break
    }
    case 'hit': {
      e.state = 'stunned'
      if (st.modeT >= C.hitTime) { enter(st, 'flee'); setClip(st, 'flee') }
      zTarget = Math.max(zTarget, e.z)
      break
    }
    case 'flee': {
      e.state = 'investigate'
      const tx = st.fleeWX - ox(eng), ty = st.fleeWY - oy(eng)
      const stuck = move(tx, ty, e.def.speed * C.fleeSpeed)
      eng.faceToward(e, tx, ty, dt, 3)
      if (st.clipT >= (CURABITUR_CLIPS[st.sex].flee?.len ?? 1.4)) setClip(st, 'drift')
      zTarget = hoverZ(eng, e, st, C.fleeGap); climb = C.fleeClimb
      const far = dH > C.keepR + 1.5
      if ((stuck && st.modeT > 1.4) || st.modeT > C.fleeTime || (far && st.modeT > 2.2)) {
        if (dH < C.avoidR) startFlee(eng, e, st, p.x, p.y, false) // 还被逼着：换方向再逃
        else {
          enter(st, 'hover'); st.homeWX = e.x + ox(eng); st.homeWY = e.y + oy(eng)
          st.lureCd = Math.max(st.lureCd, 8); st.sporeCd = Math.max(st.sporeCd, 10)
        }
      }
      break
    }
  }

  // 高度：始终自管（洞顶附近），平滑升降
  const step = climb * dt
  st.z += Math.max(-step, Math.min(step, zTarget - st.z))
  e.z = st.z
}

// ---------------------------------------------------------------------------
// 死亡：combat.killCheck 在 e.dead=true 之后调用
// ---------------------------------------------------------------------------
export function curabiturKilled(eng: Engine, e: Entity) {
  if (e.def.type !== 'curabitur') return
  const st = ensureCurabitur(eng, e)
  releasePrey(st)
  const g = groundAt(eng, e.x, e.y)
  st.deathZ = e.z; st.deathGround = g
  e.deathT = C.corpseTime
  for (let k = 0; k < C.gelDrop; k++) pushGroundItem(eng, CB_ITEM.gel, e.x + (k ? 0.25 : 0.08), e.y + 0.05, g)
  eng.msg('受眷鸟的浮囊瘪了下去，它坠落在地。破开的囊里淌出一团还在发光的受眷胶。', 'loot')
}

// ---------------------------------------------------------------------------
// 地面物品工具
// ---------------------------------------------------------------------------
function chunkOf(eng: Engine, x: number, y: number) {
  const inf = eng.map?.inf
  return inf?.chunks.get(`${Math.floor((x + inf.ox) / 32)},${Math.floor((y + inf.oy) / 32)}`)
}
export function pushGroundItem(eng: Engine, type: string, x: number, y: number, z?: number): GroundItem {
  const it: GroundItem = { id: Math.random(), type, x, y, ...(z !== undefined ? { z } : {}) }
  eng.map!.items.push(it)
  chunkOf(eng, x, y)?.items.push(it)
  return it
}
function removeGroundItem(eng: Engine, it: GroundItem) {
  const m = eng.map!
  m.items = m.items.filter((q) => q !== it)
  const c = chunkOf(eng, it.x, it.y)
  if (c) { const i = c.items.indexOf(it); if (i >= 0) c.items.splice(i, 1) }
  m.inf?.taken.add(it.id)
}

// ---------------------------------------------------------------------------
// 世界状态：下落中的孢子、腐液滩、物品寿命
// ---------------------------------------------------------------------------
export interface FallingSpore { wx: number; wy: number; z: number; vx: number; vy: number; age: number; seed: number }
export interface RotPuddle { wx: number; wy: number; z: number; life: number; max: number; seed: number }
interface CbWorld { falling: FallingSpore[]; puddles: RotPuddle[]; scanT: number; spores: GroundItem[]; jars: GroundItem[]; bottles: GroundItem[]; lureScanT: number }
const WORLDS = new WeakMap<object, CbWorld>()
function worldOf(eng: Engine): CbWorld {
  const m = eng.map!
  let w = WORLDS.get(m)
  if (!w) { w = { falling: [], puddles: [], scanT: 0, spores: [], jars: [], bottles: [], lureScanT: 0 }; WORLDS.set(m, w) }
  return w
}
export function curabiturFallingSpores(eng: Engine): readonly FallingSpore[] { return eng.map ? worldOf(eng).falling : [] }
export function curabiturPuddles(eng: Engine): readonly RotPuddle[] { return eng.map ? worldOf(eng).puddles : [] }

/** 地面孢子已放置的秒数（腐解计时） */
const SPORE_AGE = new WeakMap<GroundItem, number>()
/** 打开（放置）的受眷胶罐剩余照明秒数；不在表里的罐子 = 未开封 */
const JAR_LIFE = new WeakMap<GroundItem, number>()
export function curabiturSporeAge(it: GroundItem) { return SPORE_AGE.get(it) ?? 0 }
export function curabiturJarLife(it: GroundItem) { return JAR_LIFE.get(it) }

/** 玩家侧状态（跨层保留）：手里那罐已开封胶的剩余时间、武器涂层 */
interface CbPlayer { heldLeft: number; coat: { type: string; left: number } | null; heldBurning: boolean }
const PLAYERS = new WeakMap<Engine['player'], CbPlayer>()
export function curabiturPlayer(eng: Engine): CbPlayer {
  let s = PLAYERS.get(eng.player)
  if (!s) { s = { heldLeft: GEL.life, coat: null, heldBurning: false }; PLAYERS.set(eng.player, s) }
  return s
}
const selectedType = (eng: Engine) => eng.handsStowed ? undefined : eng.player.hotbar[eng.player.selected]?.type
/** 手里正亮着受眷胶（手持罐或选中涂层武器） */
export function curabiturHeldGlow(eng: Engine): 'jar' | 'coat' | null {
  const t = selectedType(eng), s = curabiturPlayer(eng)
  if (t === CB_ITEM.gel) return 'jar'
  if (t && s.coat && s.coat.type === t && s.coat.left > 0) return 'coat'
  return null
}

function dropSpore(eng: Engine, e: Entity, st: CurabiturState) {
  const S = curabiturScale(e, st), a = Math.random() * Math.PI * 2, r = 0.12 * S
  worldOf(eng).falling.push({
    wx: e.x + ox(eng) + Math.cos(a) * r, wy: e.y + oy(eng) + Math.sin(a) * r, z: e.z + 0.27 * S,
    vx: (Math.random() - 0.5) * 2 * C.sporeDrift, vy: (Math.random() - 0.5) * 2 * C.sporeDrift, age: 0, seed: Math.floor(Math.random() * 1000),
  })
}

function makePuddle(eng: Engine, x: number, y: number, z?: number) {
  const w = worldOf(eng)
  w.puddles.push({ wx: x + ox(eng), wy: y + oy(eng), z: z ?? groundAt(eng, x, y), life: SP.puddleLife, max: SP.puddleLife, seed: Math.floor(Math.random() * 1000) })
}

// ---------------------------------------------------------------------------
// 实体循环之后：飞蛾诱引/驱避、受眷胶燃烧、孢子下落与腐解、腐液滩
// ---------------------------------------------------------------------------
interface Attractor { x: number; y: number; z: number; r: number; bird?: Entity; held?: boolean }
interface Repeller { x: number; y: number; r: number }

export function curabiturPostStep(eng: Engine, dt: number) {
  const m = eng.map
  if (!m) return
  const p = eng.player, w = worldOf(eng), pl = curabiturPlayer(eng)
  const O = { x: ox(eng), y: oy(eng) }

  // 1. 物品扫描（0.25s 一次）：孢子腐解计时、开封胶罐燃烧
  w.scanT -= dt
  if (w.scanT <= 0) {
    const step = 0.25 - w.scanT
    w.scanT = 0.25
    w.spores = []; w.jars = []; w.bottles = []
    const rot: GroundItem[] = [], dry: GroundItem[] = []
    for (const it of m.items) {
      if (it.type === CB_ITEM.spore) {
        const age = (SPORE_AGE.get(it) ?? 0) + step
        SPORE_AGE.set(it, age)
        if (age >= SPORE_ROT_S) rot.push(it); else w.spores.push(it)
      } else if (it.type === CB_ITEM.gel) {
        const life = JAR_LIFE.get(it)
        if (life !== undefined) { const l = life - step; JAR_LIFE.set(it, l); if (l <= 0) dry.push(it) }
        w.jars.push(it)
      } else if (it.type === CB_ITEM.repellent) w.bottles.push(it)
    }
    for (const it of rot) {
      removeGroundItem(eng, it); makePuddle(eng, it.x, it.y, it.z)
      if (Math.hypot(it.x - p.x, it.y - p.y) < 8) eng.msg('地上的受眷孢子腐解了，化成一滩散发烂杏仁味的孢子腐液。', 'system')
    }
    for (const it of dry) {
      removeGroundItem(eng, it); w.jars = w.jars.filter((q) => q !== it)
      if (Math.hypot(it.x - p.x, it.y - p.y) < 10) eng.msg('放在地上的受眷胶耗尽了，罐底只剩一层暗绿的干膜。', 'system')
    }
  }

  // 2. 手持受眷胶 / 武器涂层燃烧
  const glow = curabiturHeldGlow(eng)
  pl.heldBurning = glow === 'jar'
  if (glow === 'jar') {
    pl.heldLeft -= dt
    if (pl.heldLeft <= 0) {
      pl.heldLeft = GEL.life
      const s = p.hotbar[p.selected]
      if (s && s.type === CB_ITEM.gel) { s.count--; if (s.count <= 0) p.hotbar[p.selected] = null; eng.syncPassives() }
      eng.msg('手里这罐受眷胶的光熄灭了。', 'system')
    }
  }
  if (pl.coat) {
    pl.coat.left -= dt
    if (pl.coat.left <= 0) { eng.msg(`${ITEMS[pl.coat.type]?.name ?? '武器'}上的受眷胶干掉了，光随之熄灭。`, 'system'); pl.coat = null }
  }

  // 3. 下落孢子 → 落地变成可拾取孢子
  for (let i = w.falling.length - 1; i >= 0; i--) {
    const f = w.falling[i]
    f.age += dt
    f.z -= C.sporeFall * dt
    const nx = f.wx + f.vx * dt, ny = f.wy + f.vy * dt
    if (tileAt(m, Math.floor(nx - O.x), Math.floor(ny - O.y)) === 1) { f.wx = nx; f.wy = ny }
    const x = f.wx - O.x, y = f.wy - O.y
    const g = groundAt(eng, x, y)
    if (f.z <= g + 0.015 || f.age > 40) {
      w.falling.splice(i, 1)
      const near = w.spores.filter((s) => Math.hypot(s.x - x, s.y - y) < 8).length
      if (near < C.sporeLocalCap) { const it = pushGroundItem(eng, CB_ITEM.spore, x, y, g); w.spores.push(it) }
    }
  }
  // 4. 腐液滩
  for (let i = w.puddles.length - 1; i >= 0; i--) { w.puddles[i].life -= dt; if (w.puddles[i].life <= 0) w.puddles.splice(i, 1) }

  // 5. 驱避源与吸引源
  const repel: Repeller[] = []
  for (const q of w.puddles) repel.push({ x: q.wx - O.x, y: q.wy - O.y, r: SP.puddleR })
  for (const b of w.bottles) repel.push({ x: b.x, y: b.y, r: SP.bottleR })
  if (eng.countItem(CB_ITEM.repellent) > 0) repel.push({ x: p.x, y: p.y, r: SP.carryR })
  const attract: Attractor[] = []
  if (glow) attract.push({ x: p.x, y: p.y, z: p.z + 1.1, r: GEL.attractR, held: true })
  for (const j of w.jars) if (JAR_LIFE.has(j)) attract.push({ x: j.x, y: j.y, z: (j.z ?? groundAt(eng, j.x, j.y)) + 0.45, r: GEL.attractR })
  const birds: Entity[] = []
  for (const e of m.entities) {
    if (e.def.type !== 'curabitur' || e.dead) continue
    const st = STATES.get(e)
    if (!st) continue
    if (e.netId !== undefined && eng.mpSession && !eng.mpSession.isHost) continue
    e.z = st.z // 覆盖通用飞行高度（受击硬直帧同样保持在洞顶）
    if (st.sex === 'female' && ((st.mode === 'lure' && st.clipT > 0.3) || (st.mode === 'strike' && !st.bitten))) {
      // strike 咬合前舌头仍粘着猎物
      const t = curabiturLureTip(e, st); birds.push(e); attract.push({ ...t, r: C.lureR, bird: e })
    }
  }

  // 6. 飞蛾：驱避 > 舌光 > 受眷胶
  w.lureScanT -= dt
  const rescan = w.lureScanT <= 0
  if (rescan) w.lureScanT = 0.25
  for (const moth of m.entities) {
    if (moth.def.type !== 'deathmoth' || moth.dead || moth.hidden || moth.def.mothForm === 'larva') continue
    if (moth.netId !== undefined && eng.mpSession && !eng.mpSession.isHost) continue
    const male = (moth.def.mothForm ?? 'male') === 'male'
    // 驱避：在任一驱避源半径内就转头飞开（所有成虫形态）
    let rx = 0, ry = 0, inside = false
    for (const r of repel) {
      const dx = moth.x - r.x, dy = moth.y - r.y, dd = Math.hypot(dx, dy)
      if (dd < r.r) { inside = true; const k = (r.r - dd) / r.r / Math.max(0.05, dd); rx += dx * k; ry += dy * k }
    }
    if (inside) {
      LURED_BY.delete(moth); REPELLED.add(moth)
      const len = Math.hypot(rx, ry) || 1
      const tx = moth.x + (rx / len) * 3, ty = moth.y + (ry / len) * 3
      if (male) { moth.state = 'investigate'; moth.stateT = 0.6 }
      moth.targetX = tx; moth.targetY = ty
      if (!male) eng.stepEntity(moth, moth.def.speed * 0.8, dt) // 巢内雌性/禁卫走专属 AI，这里直接推开
      continue
    }
    REPELLED.delete(moth)
    if (!male) continue
    // 吸引：舌光只对雄性飞蛾；受眷胶同样只吸引雄性
    let src: Attractor | undefined
    const cur = LURED_BY.get(moth)
    if (cur) src = attract.find((a) => a.bird === cur) // 已被某只雌性吸住：直到它停止诱捕
    if (!src && !rescan && GEL_LURED.has(moth)) src = attract.find((a) => !a.bird && Math.hypot(moth.x - a.x, moth.y - a.y, moth.z - a.z) < a.r * 1.2)
    if (!src && rescan) {
      let best = 1e9
      for (const a of attract) {
        const dd = Math.hypot(moth.x - a.x, moth.y - a.y, moth.z - a.z)
        if (dd >= a.r) continue
        // 舌光每只雌性最多同时吸住 3 只
        if (a.bird && [...LURED_BY.values()].filter((b) => b === a.bird).length >= 3) continue
        const score = dd - (a.bird ? 3 : 0) // 舌光优先
        if (score < best && eng.los(moth.x, moth.y, a.x, a.y)) { best = score; src = a }
      }
    }
    if (!src) { LURED_BY.delete(moth); GEL_LURED.delete(moth); continue }
    if (src.bird) LURED_BY.set(moth, src.bird); else { LURED_BY.delete(moth); GEL_LURED.add(moth) }
    // 绕着光源盘旋、逐渐收紧
    const t = (LURE_T.get(moth) ?? 0) + dt
    LURE_T.set(moth, t)
    const r = src.bird ? Math.max(0, C.lureOrbitR - C.lureOrbitShrink * t) : 0.85
    const a = moth.id * 1.7 + t * (src.bird ? 1.9 : 2.6)
    moth.state = 'investigate'; moth.stateT = 0.8
    moth.targetX = src.x + Math.cos(a) * r; moth.targetY = src.y + Math.sin(a) * r
    if (!src.held) {
      // 手持光源时飞蛾按通用 lightLure 高度飞向玩家胸口；舌光/放置的胶罐由这里改写高度。
      // 自己记录高度再整体覆盖：通用 updateFlyingAltitude 每帧会把它拉回低空巡航带。
      const s = C.mothClimb * dt
      let z = LURE_Z.get(moth) ?? moth.z
      z += Math.max(-s, Math.min(s, src.z - z))
      LURE_Z.set(moth, z)
      moth.z = z; moth.flightReady = true
    } else LURE_Z.delete(moth)
  }
  for (const moth of [...LURE_T.keys()]) if (moth.dead || (!LURED_BY.has(moth) && !GEL_LURED.has(moth))) { LURE_T.delete(moth); LURE_Z.delete(moth) }
  for (const moth of [...LURED_BY.keys()]) if (moth.dead || !m.entities.includes(moth)) LURED_BY.delete(moth)
}
const LURE_T = new Map<Entity, number>()
const LURE_Z = new Map<Entity, number>()
const GEL_LURED = new Set<Entity>()
const REPELLED = new Set<Entity>()
/** 验收用：飞蛾当前被谁吸引 / 是否正在回避 */
export function curabiturMothInfo(moth: Entity) {
  return { luredBy: LURED_BY.get(moth), gel: GEL_LURED.has(moth), repelled: REPELLED.has(moth) }
}

// ---------------------------------------------------------------------------
// 物品使用（inventory.finishUseSlot 开头调用；返回 true 表示已处理）
// ---------------------------------------------------------------------------
type SlotWhere = import('../engine').SlotWhere
export function curabiturUseItem(eng: Engine, where: SlotWhere, i: number): boolean {
  const s = eng.slotGet({ w: where, i })
  if (!s || (s.type !== CB_ITEM.gel && s.type !== CB_ITEM.spore && s.type !== CB_ITEM.repellent)) return false
  const p = eng.player, pl = curabiturPlayer(eng)
  const take = () => { s.count--; if (s.count <= 0) eng.slotSet({ w: where, i }, null); eng.syncPassives() }
  if (s.type === CB_ITEM.gel) {
    // 涂到快捷栏里的近战武器上（从当前格往后找第一把）；没有武器就开罐放在脚下
    const n = p.hotbar.length
    let weapon: string | undefined
    for (let k = 1; k <= n; k++) { const q = p.hotbar[(p.selected + k) % n]; if (q && ITEMS[q.type]?.weapon) { weapon = q.type; break } }
    if (weapon) {
      pl.coat = { type: weapon, left: GEL.coatLife }
      take()
      if (where === 'hotbar' && i === p.selected) pl.heldLeft = GEL.life
      audio.pickup()
      eng.msg(`你把受眷胶抹在了${ITEMS[weapon].name}上。挥动时它会发出黄绿色的光——也会把雄性死亡飞蛾引过来。`, 'loot')
    } else {
      const a = p.facing, x = p.x + Math.cos(a) * 0.45, y = p.y + Math.sin(a) * 0.45
      const it = pushGroundItem(eng, CB_ITEM.gel, eng.los(p.x, p.y, x, y) ? x : p.x, eng.los(p.x, p.y, x, y) ? y : p.y, groundAt(eng, x, y))
      // 手上那罐若已开封，剩余时间随罐子一起放下
      const opened = where === 'hotbar' && i === p.selected && pl.heldLeft < GEL.life
      JAR_LIFE.set(it, opened ? pl.heldLeft : GEL.life)
      if (opened) pl.heldLeft = GEL.life
      take()
      audio.pickup()
      eng.msg('你拧开受眷胶，把罐子放在脚边。黄绿色的光铺开了。', 'system')
    }
    return true
  }
  if (s.type === CB_ITEM.spore) {
    // 捣碎：一颗孢子直接得到一份驱蛾剂
    take()
    if (!eng.addItem(CB_ITEM.repellent)) pushGroundItem(eng, CB_ITEM.repellent, p.x + 0.3, p.y + 0.3)
    audio.pickup()
    eng.msg('你把受眷孢子捣碎，发光的碎屑很快变成一团褐绿色的糊——闻起来像烂掉的杏仁。（获得 孢子驱蛾剂）', 'loot')
    return true
  }
  // 驱蛾剂：泼在脚下形成腐液滩
  take()
  makePuddle(eng, p.x, p.y)
  audio.pickup()
  eng.msg(`你把孢子驱蛾剂泼在脚下。恶臭散开，${SP.puddleR} 米内的死亡飞蛾都会绕开这里。`, 'system')
  return true
}

/** 当前生效的所有受眷胶/鸟光源（渲染层据此生成 LightSource；窗口坐标） */
export interface CbLight { key: string; x: number; y: number; z: number; r: number; color: string; intensityMul: number }
export function curabiturLightList(eng: Engine): CbLight[] {
  const m = eng.map
  if (!m || eng.levelDef.noFlashlight) return []
  const out: CbLight[] = [], p = eng.player
  const glow = curabiturHeldGlow(eng)
  if (glow) { const L = glow === 'jar' ? GEL.light : GEL.coatLight; out.push({ key: 'held', x: p.x + Math.cos(p.facing) * 0.35, y: p.y + Math.sin(p.facing) * 0.35, z: p.z + 1.15, ...L }) }
  for (const it of m.items) if (it.type === CB_ITEM.gel) {
    const L = JAR_LIFE.has(it) ? GEL.light : GEL.sealedLight
    out.push({ key: `j${it.id}`, x: it.x, y: it.y, z: (it.z ?? groundAt(eng, it.x, it.y)) + 0.2, ...L })
  }
  // 受眷鸟：只给离玩家最近的几只活体挂光（星群里其余个体只靠自发光材质）
  const birds = m.entities.filter((e) => e.def.type === 'curabitur' && !e.dead && STATES.has(e))
    .map((e) => ({ e, d: Math.hypot(e.x - p.x, e.y - p.y) })).filter((b) => b.d < 30).sort((a, b) => a.d - b.d).slice(0, C.maxBirdLights)
  for (const { e } of birds) {
    const st = STATES.get(e)!
    out.push({ key: `b${e.id}`, x: e.x, y: e.y, z: e.z + 0.2, r: st.sex === 'male' ? 3.2 : 4.2, color: '#b6ff5a', intensityMul: st.sex === 'male' ? 0.16 : 0.24 })
  }
  return out
}
