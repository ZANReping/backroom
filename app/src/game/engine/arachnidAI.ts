// L8 蛛形纲重制——阶段 3：游戏机制（AI、18 个变种的能力、符文蛛巢区、玩家状态效果、公共查询）。
//
// 接入点（共享文件里都用 `// [L8-arachnid]` 标出）：
//   entityAI.updateEntities 帧首 beginArachnidFrame；实体分派 updateArachnid；noiseEvent → arachnidHear
//   combat.killCheck → arachnidHurt；汽油罐爆炸 → arachnidExplosion / arachnidFireHit；滋水枪 → arachnidSquirted
//   movement 速度 × arachnidMoveMul；interact.doInteract → arachnidInteract（拔蜱、拆茧）
//   渲染层 renderer/arachnidRender.ts 只读 e.arachnid（片段、片段时间、速度、膨胀、再生）与 getArachnidWorld（网、茧、特效事件）
//
// 状态都挂在 e.arachnid（实体运行时，不入存档 / 联机）与按 Engine 的 ArachnidWorld（换层即清空）上。
// 坐标约定：实体与玩家用窗口坐标；网、茧、蛛巢、家位置用世界坐标（= 窗口 + inf.ox/oy），窗口平移不受影响。
import type { Engine } from '../engine'
import type { Entity } from '../entities/types'
import type { GameMap } from '../world/mapgen'
import { floorHeight, walkableAt } from '../world/mapgen'
import { audio } from '../core/audio'
import { ARACHNID_CLIPS, ARACHNID_LUNGE_HIT, ARACHNID_STING_HIT, ARACHNID_PINCH_HIT, ARACHNID_LATCH_HIT, ARACHNID_JUMP_TAKEOFF, ARACHNID_JUMP_LAND, ARACHNID_SPRAY_PUFFS, ARACHNID_ROOT_MOTION, ARACHNID_REGROWN, type ArachnidClip } from '../renderer/arachnidAnim'
import { ARACHNID_STATS, isArachnidKind, arachnidLosesTargetInWater, arachnidCanEnterWater, type ArachnidKind, type ArachnidStat } from './arachnidStats'
import { legacyArachnidKind, arachnidNestsLoaded, findNearestArachnidNest, ARACHNID_NEST_RADIUS, type ArachnidNestDesc } from '../world/arachnidNest'
import { l8CaveMarginAt } from '../world/infiniteL8'
import { rollLoot } from './interact'

export { ARACHNID_STATS, arachnidLosesTargetInWater, arachnidCanEnterWater } from './arachnidStats'
export type { ArachnidKind, ArachnidStat } from './arachnidStats'

// ======================================================================
// 常量
// ======================================================================
export const ARACHNID = {
  /** 狼蛛伏击暴起距离 */
  ambushTrigger: 4.5,
  /** 跳蛛跳扑触发距离区间 */
  jumpMin: 2.8, jumpMax: 5.2, jumpCd: 3.5, jumpHitR: 1.2,
  /** 鞭蝎喷酸：射程、锥半角、每口伤害、腐蚀视野时长、冷却 */
  sprayMin: 2, sprayMax: 4.5, sprayCone: 0.61, sprayDmg: 2, acidT: 6, sprayCd: 6,
  /** 蛛网：触发半径、缠住时长、缠住时移速倍数、挣扎额外消耗倍数、织网冷却、每只织网蛛最多网数 */
  webR: 0.75, webHold: 3, webSlow: 0.12, webStruggle: 0.9, webCd: 22, webMax: 2, weaverLeash: 7,
  /** 吸附蜱：每秒吸血、吸饱所需秒数、拔除时撕掉的血 */
  tickDrain: 1, tickFull: 20, tickPull: 2,
  /** 不死蛛：假死到复苏的等待、复苏后血量比例、处决所需单次伤害 */
  undyingWait: 4, undyingRevive: 0.3, undyingExecute: 15, undyingHeavy: 25,
  /** 再生蛛：每秒回血、断肢阈值、火烧后停止回血秒数 */
  regenHps: 3, regenLimb: 8, regenBurn: 6,
  /** 群体：单体近战伤害系数（幼蛛 / 螨）、近战最低保留血量比例 */
  swarmMelee: 0.12, miteMelee: 0.25, swarmFloor: 0.25,
  /** 螨群瘙痒时长、理智 / 生命每秒损失 */
  mitesT: 20, mitesSanity: 1.2, mitesHp: 0.15,
  /** 火（打火机）驱赶半径 */
  fireRepel: 2.2,
  /** 被水甩脱后在岸边徘徊多久才放弃 */
  shoreGiveUp: 12,
  /** 远处降频：超过此距离的个体约每 0.25s 才步进一次 */
  lodFar: 28,
} as const

// ======================================================================
// 运行时状态
// ======================================================================
export type ArachnidMode =
  | 'wander' | 'idle' | 'ambush' | 'investigate' | 'chase' | 'attack' | 'rear' | 'jump' | 'spray' | 'spin' | 'flee' | 'recoil'
  | 'shore' | 'flail' | 'latched' | 'dormant' | 'revive' | 'regen' | 'sated'

export interface ArachnidState {
  kind: ArachnidKind
  mode: ArachnidMode
  modeT: number
  /** 当前动画片段与片段时间（渲染层直接读） */
  clip: ArachnidClip
  clipT: number
  /** 片段切换时不混合（跳扑落地：根位移已交给实体） */
  noBlend?: boolean
  /** 本帧实际地面速度 m/s（渲染层按它调步幅，脚底锁定） */
  speed: number
  cd: number
  specialCd: number
  hitDone: boolean
  puff: number
  /** 家（世界坐标）：织网蛛 / 守巢个体的拴绳中心 */
  homeX: number; homeY: number
  nest?: string
  mother?: boolean
  herb?: boolean
  provokedT: number
  lastHp: number
  lastSeenX: number; lastSeenY: number; seenT: number
  heardX?: number; heardY?: number; heardT: number
  revived?: boolean
  final?: boolean
  fireHit?: boolean
  burnT: number
  /** 再生蛛新肢缩放：1 = 刚断的短肢，ARACHNID_REGROWN = 长好 */
  regrow: number
  regenWait: number
  engorge: number
  latched?: boolean
  jump?: { hx: number; hy: number; D: number; moved: number }
  reared?: boolean
  shoreMsg?: boolean
  /** 在岸边放弃后，这段时间内不再理会水里的玩家 */
  ignoreT: number
  lod: number
  webs: number
  deadT?: number
}

export interface ArachnidWeb { id: string; x: number; y: number; nx: number; ny: number; owner?: number; nest?: string }
export interface ArachnidFx { kind: 'spray' | 'webburn' | 'disperse' | 'silk'; x: number; y: number; z: number; dx?: number; dy?: number; t: number; id?: number }

export interface ArachnidWorld {
  map: GameMap | null
  t: number
  nests: ArachnidNestDesc[]
  nestScanT: number
  webs: ArachnidWeb[]
  torn: Set<string>
  cocoonsTaken: Set<string>
  poison: { dps: number; t: number; src: ArachnidKind }[]
  webT: number
  webId?: string
  acidT: number
  mitesT: number
  latchedId: number | null
  dotAcc: number
  dotMsgT: number
  msgCd: Map<string, number>
  frame: number
  fx: ArachnidFx[]
  webSeq: number
}

const WORLDS = new WeakMap<Engine, ArachnidWorld>()
let activeEngine: Engine | null = null

function freshWorld(map: GameMap | null): ArachnidWorld {
  return { map, t: 0, nests: [], nestScanT: 0, webs: [], torn: new Set(), cocoonsTaken: new Set(), poison: [], webT: 0, acidT: 0, mitesT: 0, latchedId: null, dotAcc: 0, dotMsgT: 0, msgCd: new Map(), frame: 0, fx: [], webSeq: 0 }
}
export function getArachnidWorld(eng: Engine): ArachnidWorld {
  let w = WORLDS.get(eng)
  if (!w || w.map !== (eng.map ?? null)) { w = freshWorld(eng.map ?? null); WORLDS.set(eng, w) }
  return w
}

const ox = (eng: Engine) => eng.map?.inf?.ox ?? 0
const oy = (eng: Engine) => eng.map?.inf?.oy ?? 0
const hashId = (n: number) => (Math.imul(n ^ 0x9e3779b9, 2654435761) >>> 0)

/** 惰性初始化：变种由 def.arachnidVariant 决定；旧数据（arachnidMorph / herbivore）按 legacyArachnidKind 映射 */
export function ensureArachnid(e: Entity, eng?: Engine): ArachnidState {
  if (e.arachnid) return e.arachnid
  const kind: ArachnidKind = isArachnidKind(e.def.arachnidVariant) ? e.def.arachnidVariant : legacyArachnidKind(e.def.arachnidMorph, !!e.def.herbivore, hashId(e.id))
  const st = ARACHNID_STATS[kind]
  const herb = !!e.def.herbivore && kind !== 'harvestman'
  const ratio = e.def.hp > 0 ? Math.max(0, Math.min(1, e.hp / e.def.hp)) : 1
  const sc = e.def.scale ?? 1
  e.def = {
    ...e.def, arachnidVariant: kind, name: herb ? `${st.name}（食草）` : st.name,
    hp: st.hp, speed: st.speed, damage: st.damage, sight: st.sight, hearing: st.hearing,
    passive: herb || st.flags.timid ? true : undefined, blind: st.flags.blind,
    // 模型按真实尺寸建模，这里只留 ±15% 个体差异（旧生成器的 0.66–1.18 太大）
    scale: kind === 'colossus' || st.flags.swarm ? 1 : Math.max(0.85, Math.min(1.15, sc)),
  }
  e.hp = Math.max(1, Math.round(st.hp * ratio))
  // 没有 eng（渲染层先建模）时家位置待定，首个 AI tick 再按窗口偏移补上
  const wx = eng ? e.x + ox(eng) : NaN, wy = eng ? e.y + oy(eng) : NaN
  e.arachnid = {
    kind, mode: st.flags.ambush ? 'ambush' : 'wander', modeT: 0, clip: st.flags.swarm ? 'swarm_flow' : 'idle', clipT: (e.id % 7) * 0.37,
    speed: 0, cd: 0, specialCd: 1 + (e.id % 5) * 0.4, hitDone: false, puff: 0,
    homeX: wx, homeY: wy, nest: e.def.arachnidNest, mother: !!e.def.arachnidMother || (kind === 'broodswarm' && hashId(e.id) % 3 === 0),
    herb, provokedT: 0, lastHp: e.hp, lastSeenX: e.x, lastSeenY: e.y, seenT: 99, heardT: 99,
    burnT: 0, ignoreT: 0, regrow: kind === 'regen' ? 1 : ARACHNID_REGROWN, regenWait: 3, engorge: 0, lod: 0, webs: 0,
  }
  return e.arachnid
}
/** 渲染 / 其它系统取变种（不存在时惰性初始化） */
export function arachnidKindOf(e: Entity): ArachnidKind { return ensureArachnid(e).kind }

function setClip(ar: ArachnidState, clip: ArachnidClip, restart = false, noBlend = false) {
  if (ar.clip !== clip || restart) { ar.clip = clip; ar.clipT = 0; ar.hitDone = false; ar.puff = 0; ar.noBlend = noBlend }
}
const clipLen = (k: ArachnidKind, c: ArachnidClip) => ARACHNID_CLIPS[k]?.[c]?.len ?? 1
function setMode(ar: ArachnidState, m: ArachnidMode) { if (ar.mode !== m) { ar.mode = m; ar.modeT = 0 } }

function msgOnce(eng: Engine, w: ArachnidWorld, key: string, text: string, kind: 'damage' | 'system' | 'lore' = 'system', cd = 8) {
  if ((w.msgCd.get(key) ?? -1e9) > w.t) return
  w.msgCd.set(key, w.t + cd)
  eng.msg(text, kind)
}

/** 持续伤害（中毒、吸血、群体啃咬、瘙痒）：直接扣血，消息节流，致死走 die */
function dot(eng: Engine, w: ArachnidWorld, dmg: number, cause: string) {
  if (eng.dev.god || dmg <= 0) return
  const p = eng.player
  p.hp -= dmg
  w.dotAcc += dmg
  if (w.dotMsgT <= 0 && w.dotAcc >= 1) {
    eng.msg(`受到 ${w.dotAcc.toFixed(0)} 点伤害（${cause}）`, 'damage')
    eng.emit({ kind: 'damage' })
    w.dotAcc = 0; w.dotMsgT = 2.2
  }
  if (p.hp <= 0) eng.die(`死于${cause}`)
}

export function addPoison(eng: Engine, kind: ArachnidKind) {
  const v = ARACHNID_STATS[kind].venom
  if (!v) return
  const w = getArachnidWorld(eng)
  const mine = w.poison.filter((q) => q.src === kind)
  if (mine.length >= v.stacks) { mine.sort((a, b) => a.t - b.t); mine[0].t = v.dur }
  else w.poison.push({ dps: v.dps, t: v.dur, src: kind })
  msgOnce(eng, w, 'poison-' + kind, kind === 'widow' ? `寡妇毒蛛的毒液烧进血管——强烈中毒（${w.poison.filter((q) => q.src === kind).length} 层）。` : `${ARACHNID_STATS[kind].name}的毒让伤口发麻（中毒）。`, 'damage', 3)
}

// ======================================================================
// 帧首：玩家状态效果 + 蛛巢登记 + 网
// ======================================================================
export function beginArachnidFrame(eng: Engine, dt: number, dmgMult = 1) {
  const m = eng.map
  if (!m) return
  activeEngine = eng
  const w = getArachnidWorld(eng)
  w.t += dt; w.frame++
  if (w.dotMsgT > 0) w.dotMsgT -= dt
  w.fx = w.fx.filter((f) => w.t - f.t < 3)
  const p = eng.player
  for (const e of m.entities) if (e.dead && e.arachnid) arachnidOnDead(e)
  // 蛛巢登记（只有 L8 无限层有）
  if (eng.levelDef.id === 8 && m.inf && (w.nestScanT -= dt) <= 0) {
    w.nestScanT = 1
    w.nests = arachnidNestsLoaded(m.inf as never)
  }
  // 中毒
  if (w.poison.length) {
    let dps = 0
    for (const q of w.poison) { dps += q.dps; q.t -= dt }
    w.poison = w.poison.filter((q) => q.t > 0)
    dot(eng, w, dps * dmgMult * dt, '蛛毒')
    if (!w.poison.length) eng.msg('毒性退去了。', 'system')
  }
  // 螨群瘙痒：入水（深水或浅溪）立刻冲掉
  if (w.mitesT > 0) {
    w.mitesT -= dt
    if (eng.inLiquid !== 0) { w.mitesT = 0; eng.msg('冷水一冲，钻进衣服里的螨虫被冲散了。', 'system') }
    else {
      p.sanity = Math.max(0, p.sanity - ARACHNID.mitesSanity * dt)
      dot(eng, w, ARACHNID.mitesHp * dmgMult * dt, '螨群')
      if (w.mitesT <= 0) eng.msg('皮肤上的瘙痒终于停了。', 'system')
    }
  }
  if (w.acidT > 0) w.acidT -= dt
  // 网：静态巢网 + 织网蛛的网
  const allWebs = arachnidWebs(eng)
  const wx = p.x + ox(eng), wy = p.y + oy(eng)
  if (w.webT > 0) {
    // 挣扎：有移动输入时额外消耗缠缚时间
    const struggling = Math.hypot(eng.input.mx, eng.input.my) > 0.1
    w.webT -= dt * (1 + (struggling ? ARACHNID.webStruggle : 0))
    if (w.webT <= 0) {
      w.webT = 0
      if (w.webId) tearWeb(w, w.webId)
      w.webId = undefined
      eng.msg('你扯断了蛛丝，挣脱出来。', 'system')
    }
  } else {
    for (const web of allWebs) {
      if (Math.hypot(web.x - wx, web.y - wy) > ARACHNID.webR) continue
      if (p.hasLighter) { burnWeb(eng, w, web); continue } // 打火机靠近即把网烧断
      w.webT = ARACHNID.webHold; w.webId = web.id
      eng.msg('你一头撞进黏稠的蛛网——被缠住了！（挣扎可以挣脱）', 'damage')
      audio.aggro()
      // 惊动网主与附近的织网蛛
      for (const q of m.entities) {
        if (q.dead || q.def.type !== 'arachnid' || !q.arachnid) continue
        if (q.id === web.owner || (q.arachnid.kind === 'weaver' && Math.hypot(q.x - p.x, q.y - p.y) < 10)) { q.provoked = true; q.arachnid.provokedT = 10; setMode(q.arachnid, 'chase') }
      }
      break
    }
  }
}

/** 当前生效的全部网（世界坐标） */
export function arachnidWebs(eng: Engine): ArachnidWeb[] {
  const w = getArachnidWorld(eng)
  const out: ArachnidWeb[] = []
  for (const n of w.nests) for (const s of n.webs) if (!w.torn.has(s.id)) out.push({ ...s, nest: n.id })
  for (const s of w.webs) out.push(s)
  return out
}
function tearWeb(w: ArachnidWorld, id: string) { w.torn.add(id); w.webs = w.webs.filter((q) => q.id !== id) }
function burnWeb(eng: Engine, w: ArachnidWorld, web: ArachnidWeb) {
  tearWeb(w, web.id)
  w.fx.push({ kind: 'webburn', x: web.x, y: web.y, z: 0.9, t: w.t })
  msgOnce(eng, w, 'burnweb', '火苗舔上蛛网，整张网嘶地一声卷曲烧断了。', 'system', 2)
}
/** 织一张网（世界坐标；验收脚本也用它直接布网） */
export function spinArachnidWeb(eng: Engine, x: number, y: number, nx: number, ny: number, owner?: number): ArachnidWeb {
  const w = getArachnidWorld(eng)
  const web = { id: `ww:${w.webSeq++}`, x, y, nx, ny, owner }
  w.webs.push(web)
  return web
}
/** 移动速度倍数（movement.ts 接入） */
export function arachnidMoveMul(eng: Engine): number {
  const w = WORLDS.get(eng)
  return w && w.map === eng.map && w.webT > 0 ? ARACHNID.webSlow : 1
}

// ======================================================================
// 感知
// ======================================================================
/** noiseEvent 接入：所有蛛形纲的听觉。盲眼洞蛛只听脚步震动，蹲走（半径 ≤1）完全听不见 */
export function arachnidHear(eng: Engine, e: Entity, x: number, y: number, radius: number, sprint: boolean) {
  const ar = ensureArachnid(e, eng), st = ARACHNID_STATS[ar.kind]
  const d = Math.hypot(e.x - x, e.y - y)
  if (st.flags.blind) {
    if (radius <= 1.01) return // 蹲行近乎无声
    if (d > Math.max(radius * 1.5, sprint ? st.hearing * 1.6 : st.hearing)) return
  } else if (d > Math.max(radius, sprint ? st.hearing * 1.4 : st.hearing * 0.6)) return
  ar.heardX = x; ar.heardY = y; ar.heardT = 0
}

function canSee(eng: Engine, e: Entity, st: ArachnidStat, d: number): boolean {
  if (eng.dev.invisible) return false
  const p = eng.player
  if (st.flags.blind) return d < 0.9 // 只有碰到才知道
  if (d > st.sight || Math.abs(e.z - p.z) > 3) return false
  return eng.los(e.x, e.y, p.x, p.y)
}

// ======================================================================
// 移动
// ======================================================================
function isDeep(m: GameMap, x: number, y: number) {
  const tx = Math.floor(x), ty = Math.floor(y)
  return tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && m.liquid[ty * m.w + tx] === 1
}
/** 能否站在这里（极巨蛛额外要求洞穴余量 ≥ minMargin：窄道过不去） */
function roomy(eng: Engine, st: ArachnidStat, x: number, y: number) {
  if (!st.minMargin || eng.levelDef.id !== 8 || !eng.map?.inf) return true
  return l8CaveMarginAt(eng.map.inf.seed, x + ox(eng), y + oy(eng)) >= st.minMargin
}
/** 走向 (tx,ty)。返回 true = 到达或卡住。会游泳 / 无氧的个体可以进出深水 */
function moveTo(eng: Engine, e: Entity, ar: ArachnidState, tx: number, ty: number, speed: number, dt: number): boolean {
  const m = eng.map!, st = ARACHNID_STATS[ar.kind]
  const x0 = e.x, y0 = e.y
  e.targetX = tx; e.targetY = ty
  let stuck: boolean
  const water = arachnidCanEnterWater(ar.kind) && (isDeep(m, e.x, e.y) || isDeep(m, tx, ty))
  if (water) {
    const dx = tx - e.x, dy = ty - e.y, dd = Math.hypot(dx, dy)
    if (dd < 0.3) stuck = true
    else {
      const s = Math.min(dd, (ar.kind === 'diving' && isDeep(m, e.x, e.y) ? 2.8 : speed) * dt)
      const nx = e.x + dx / dd * s, ny = e.y + dy / dd * s
      const ntx = Math.floor(nx), nty = Math.floor(ny)
      const okTile = ntx >= 0 && nty >= 0 && ntx < m.w && nty < m.h && (isDeep(m, nx, ny) || walkableAt(m, ntx, nty, 0))
      if (okTile) { e.x = nx; e.y = ny; e.facing = Math.atan2(dy, dx); stuck = false } else stuck = true
    }
    swimDepth(eng, e, ar, dt)
  } else stuck = eng.stepEntity(e, speed, dt)
  if (!roomy(eng, st, e.x, e.y)) { e.x = x0; e.y = y0; stuck = true }
  ar.speed = Math.hypot(e.x - x0, e.y - y0) / Math.max(1e-4, dt)
  return stuck
}
/** 水中深度：水蛛贴着玩家深度游 / 潜；无氧蛛沿湖底走 */
function swimDepth(eng: Engine, e: Entity, ar: ArachnidState, dt: number) {
  const m = eng.map!
  if (!isDeep(m, e.x, e.y)) { e.z = floorHeight(m, e.x, e.y, 0); return }
  const bed = floorHeight(m, e.x, e.y, 0)
  if (ar.kind === 'anoxic') { e.z = bed; return }
  const p = eng.player
  const want = eng.inLiquid === 1 && (ar.mode === 'chase' || ar.mode === 'attack') ? Math.max(bed + 0.1, Math.min(-0.12, p.z + 0.6)) : -0.12
  e.z += Math.max(-2 * dt, Math.min(2 * dt, want - e.z))
}
function faceTo(eng: Engine, e: Entity, x: number, y: number, dt: number, rate = 9) { eng.faceToward(e, x, y, dt, rate) }
/** 按速度选移动片段 */
function locoClip(eng: Engine, e: Entity, ar: ArachnidState) {
  const st = ARACHNID_STATS[ar.kind]
  if (st.flags.swarm) { setClip(ar, 'swarm_flow'); return }
  if ((ar.kind === 'diving') && isDeep(eng.map!, e.x, e.y)) { setClip(ar, e.z < -0.5 ? 'dive' : 'swim'); return }
  if (ar.speed < 0.06) { setClip(ar, ar.kind === 'harvestman' ? 'bob' : 'idle'); return }
  setClip(ar, ar.speed > st.walk * 1.6 && ARACHNID_CLIPS[ar.kind]?.run ? 'run' : 'walk')
}
function wanderPick(eng: Engine, e: Entity, ar: ArachnidState, r = 4) {
  const hx = ar.homeX - ox(eng), hy = ar.homeY - oy(eng)
  const leash = ar.nest || ar.kind === 'weaver' ? 5 : 12
  const cx = Math.hypot(e.x - hx, e.y - hy) > leash ? hx : e.x, cy = Math.hypot(e.x - hx, e.y - hy) > leash ? hy : e.y
  const a = Math.random() * Math.PI * 2
  e.targetX = cx + Math.cos(a) * r; e.targetY = cy + Math.sin(a) * r
  e.stateT = 3 + Math.random() * 3
}

// ======================================================================
// 主更新（entityAI 分派）
// ======================================================================
export function updateArachnid(eng: Engine, e: Entity, dt0: number, d: number, dmgMult: number) {
  const ar = ensureArachnid(e, eng)
  const w = getArachnidWorld(eng)
  // 远处降频：累计时间，约每 0.25s 才真正步进一次
  let dt = dt0
  if (d > ARACHNID.lodFar && !ar.latched) {
    ar.lod += dt0
    if (ar.lod < 0.25) return
    dt = Math.min(0.4, ar.lod)
  }
  ar.lod = 0
  stepArachnid(eng, w, e, ar, dt, d, dmgMult)
  ar.lastHp = e.hp
  e.state = ar.mode === 'chase' || ar.mode === 'rear' || ar.mode === 'jump' ? 'chase' : ar.mode === 'attack' || ar.mode === 'spray' || ar.mode === 'latched' ? 'attack'
    : ar.mode === 'investigate' || ar.mode === 'shore' ? 'investigate' : ar.mode === 'idle' || ar.mode === 'ambush' || ar.mode === 'dormant' ? 'idle' : 'wander'
  e.animT += dt * Math.max(0.2, ar.speed)
}

function stepArachnid(eng: Engine, w: ArachnidWorld, e: Entity, ar: ArachnidState, dt: number, d: number, dmgMult: number) {
  const m = eng.map!, p = eng.player, st = ARACHNID_STATS[ar.kind]
  if (Number.isNaN(ar.homeX)) { ar.homeX = e.x + ox(eng); ar.homeY = e.y + oy(eng) }
  ar.modeT += dt; ar.clipT += dt; ar.cd -= dt; ar.specialCd -= dt; ar.seenT += dt; ar.heardT += dt
  if (ar.provokedT > 0) ar.provokedT -= dt
  if (ar.burnT > 0) ar.burnT -= dt
  if (ar.ignoreT > 0) ar.ignoreT -= dt
  ar.speed = 0
  ar.noBlend = false

  // ---- 特殊状态优先 ----
  if (ar.mode === 'latched') { updateLatched(eng, w, e, ar, dt, dmgMult); return }
  if (ar.mode === 'dormant') {
    setClip(ar, 'death')
    if (ar.modeT >= ARACHNID.undyingWait) {
      setMode(ar, 'revive'); setClip(ar, 'revive', true)
      if (d < 14) eng.msg('不死蛛的符文内核重新亮起——它抽搐着翻过身，颤巍巍地站了起来。', 'damage')
      audio.aggro()
    }
    return
  }
  if (ar.mode === 'revive') {
    if (ar.clipT >= clipLen(ar.kind, 'revive')) {
      ar.revived = true
      e.hp = Math.max(1, Math.round(st.hp * ARACHNID.undyingRevive))
      e.def = { ...e.def, speed: st.speed * 0.7 }
      setMode(ar, 'chase')
    }
    return
  }
  // 群体入水即散
  if (st.flags.swarm && isDeep(m, e.x, e.y)) { disperse(eng, w, e, ar, '被水冲散了'); return }
  // 不会游泳的个体掉进深水：挣扎着往岸上划
  if (!arachnidCanEnterWater(ar.kind) && isDeep(m, e.x, e.y)) {
    setMode(ar, 'flail'); setClip(ar, 'flail')
    e.z = -0.15
    const shore = nearestDry(m, e.x, e.y)
    if (shore) {
      const dx = shore.x - e.x, dy = shore.y - e.y, dd = Math.hypot(dx, dy) || 1
      e.x += dx / dd * 0.7 * dt; e.y += dy / dd * 0.7 * dt; e.facing = Math.atan2(dy, dx)
    }
    e.hp -= 2 * dt
    if (e.hp <= 0 && !e.dead) { e.dead = true; e.deathT = 2.4; if (d < 12) eng.msg(`${e.def.name}在水里挣扎着沉了下去。`, 'system') }
    return
  }
  if (ar.mode === 'flail') { setMode(ar, 'wander'); e.z = floorHeight(m, e.x, e.y, 0) }

  // ---- 再生蛛：持续回血、断肢再生 ----
  if (ar.kind === 'regen') {
    if (ar.burnT <= 0 && e.hp < st.hp) e.hp = Math.min(st.hp, e.hp + ARACHNID.regenHps * dt)
    if (ar.mode === 'regen') {
      if (ar.clipT >= clipLen('regen', 'regen')) { ar.regrow = ARACHNID_REGROWN; e.hp = Math.min(st.hp, e.hp + 8); setMode(ar, 'chase') }
      return
    }
    if (ar.regrow < ARACHNID_REGROWN && (ar.regenWait -= dt) <= 0 && ar.mode !== 'attack' && (d > 3 || ar.mode === 'wander')) {
      setMode(ar, 'regen'); setClip(ar, 'regen', true)
      if (d < 12) msgOnce(eng, w, 'regen' + e.id, '再生蛛的断肢处鼓起苍白的肉芽——新的腿在几秒内长了出来。', 'system', 10)
      return
    }
  }
  // 幼蛛潮带母蛛：持续补员
  if (ar.kind === 'broodswarm' && ar.mother && ar.burnT <= 0 && e.hp < st.hp) e.hp = Math.min(st.hp, e.hp + 1.5 * dt)

  const seen = canSee(eng, e, st, d)
  if (seen) { ar.lastSeenX = p.x; ar.lastSeenY = p.y; ar.seenT = 0 }
  const hostile = !st.flags.timid && (!ar.herb || ar.provokedT > 0)
  if (ar.herb && e.provoked && ar.provokedT <= 0 && ar.mode === 'chase' && ar.modeT > 8) { e.provoked = false; setMode(ar, 'wander') }

  // ---- 胆小（长脚盲蛛）----
  if (st.flags.timid) {
    if ((d < 3.2 && !eng.dev.invisible) || ar.provokedT > 0) {
      setMode(ar, 'flee')
      const dd = Math.max(0.1, d)
      if (moveTo(eng, e, ar, e.x + (e.x - p.x) / dd * 5, e.y + (e.y - p.y) / dd * 5, st.speed, dt)) wanderPick(eng, e, ar)
    } else {
      if (ar.mode === 'flee') setMode(ar, 'wander')
      wanderStep(eng, e, ar, st, dt)
    }
    locoClip(eng, e, ar)
    return
  }

  // ---- 火（打火机）驱赶 ----
  if (p.hasLighter && !st.flags.fireproof && d < ARACHNID.fireRepel && ar.mode !== 'attack' && ar.mode !== 'jump') {
    setMode(ar, 'recoil')
    const dd = Math.max(0.1, d)
    moveTo(eng, e, ar, e.x + (e.x - p.x) / dd * 3, e.y + (e.y - p.y) / dd * 3, st.speed * 0.8, dt)
    faceTo(eng, e, p.x, p.y, dt)
    if (st.flags.swarm) setClip(ar, 'swarm_flow')
    else setClip(ar, ar.speed > 0.1 ? 'walk' : 'rear')
    if (d < 10) msgOnce(eng, w, 'fire-' + ar.kind, `${e.def.name}畏缩着避开你手里的火苗。`, 'system', 12)
    return
  }
  if (ar.mode === 'recoil') setMode(ar, 'chase')

  // ---- 水体甩脱：玩家在深水里，不会游泳的个体失去目标，在岸边徘徊 ----
  const playerDeep = eng.inLiquid === 1
  const engaged = ar.mode === 'chase' || ar.mode === 'attack' || ar.mode === 'investigate' || ar.mode === 'shore' || ar.mode === 'rear' || ar.mode === 'spray' || ar.mode === 'jump'
  if (playerDeep && arachnidLosesTargetInWater(ar.kind) && (engaged || (hostile && seen) || ar.ignoreT > 0)) {
    if (ar.ignoreT > 0) { wanderStep(eng, e, ar, st, dt); locoClip(eng, e, ar); return }
    if (ar.mode !== 'shore' && ar.mode !== 'jump') {
      setMode(ar, 'shore')
      if (!ar.shoreMsg && d < 16) { ar.shoreMsg = true; msgOnce(eng, w, 'shore', `${e.def.name}追到水边停住了——它不会游泳，只能在岸上来回踱步。`, 'system', 6) }
    }
    if (ar.mode === 'shore') {
      if (ar.modeT > ARACHNID.shoreGiveUp) { setMode(ar, 'wander'); e.provoked = false; ar.provokedT = 0; ar.ignoreT = 20; wanderPick(eng, e, ar, 6) }
      else {
        // 朝玩家逼近直到水线，然后沿岸踱步
        const stuck = moveTo(eng, e, ar, p.x, p.y, st.walk * 1.4, dt)
        if (stuck) {
          const a = Math.atan2(p.y - e.y, p.x - e.x) + (Math.sin(ar.modeT * 0.7 + e.id) > 0 ? 1.4 : -1.4)
          moveTo(eng, e, ar, e.x + Math.cos(a) * 1.5, e.y + Math.sin(a) * 1.5, st.walk, dt)
        }
        faceTo(eng, e, p.x, p.y, dt, 4)
        locoClip(eng, e, ar)
      }
      return
    }
  } else if (ar.mode === 'shore') { setMode(ar, seen && hostile ? 'chase' : 'wander') }

  // ---- 特殊招式进行中 ----
  if (ar.mode === 'jump') { updateJump(eng, w, e, ar, dt, dmgMult); return }
  if (ar.mode === 'spray') { updateSpray(eng, w, e, ar, dt, d, dmgMult); return }
  if (ar.mode === 'spin') { updateSpin(eng, w, e, ar, dt); if (ar.mode === 'spin') return }
  if (ar.mode === 'rear') {
    faceTo(eng, e, p.x, p.y, dt, 6)
    if (ar.clipT >= clipLen(ar.kind, 'rear')) setMode(ar, 'chase')
    return
  }
  if (ar.mode === 'attack') { updateAttack(eng, w, e, ar, dt, d, dmgMult); return }

  // ---- 群体 ----
  if (st.flags.swarm) { updateSwarm(eng, w, e, ar, st, dt, d, dmgMult, seen, hostile); return }
  // ---- 吸附蜱 ----
  if (ar.kind === 'tick') { updateTick(eng, w, e, ar, st, dt, d, seen); return }

  // ---- 索敌 ----
  const nestZone = ar.nest ? w.nests.find((n) => n.id === ar.nest) : undefined
  const inZone = !!nestZone && Math.hypot(p.x + ox(eng) - nestZone.zx, p.y + oy(eng) - nestZone.zy) < nestZone.r
  if (hostile && ar.mode !== 'chase') {
    let trigger = false
    if (st.flags.ambush && ar.mode === 'ambush') trigger = (seen && d < ARACHNID.ambushTrigger) || (ar.heardT < 0.2 && d < st.hearing) || e.provoked === true
    else if (ar.kind === 'weaver') trigger = (seen && Math.hypot(p.x + ox(eng) - ar.homeX, p.y + oy(eng) - ar.homeY) < ARACHNID.weaverLeash) || ar.provokedT > 0
    else trigger = seen || (inZone && d < 9) || ar.provokedT > 0
    if (trigger) {
      setMode(ar, 'chase')
      if (st.flags.ambush && d < 8) eng.msg(`岩缝里的${e.def.name}猛地窜了出来！`, 'damage')
      audio.aggro()
      if (ar.kind === 'colossus' && !ar.reared) {
        ar.reared = true; setMode(ar, 'rear'); setClip(ar, 'rear', true)
        p.sanity = Math.max(0, p.sanity - 8)
        eng.camShake = Math.min(1, eng.camShake + 0.4)
        eng.msg('极巨蛛人立而起，背上的符文骤然亮成一片——（理智 -8）', 'damage')
        return
      }
    } else if (st.flags.blind && ar.heardT < 3 && ar.heardX !== undefined) {
      // 盲眼洞蛛：循震动扑向声源
      setMode(ar, 'investigate')
      const stuck = moveTo(eng, e, ar, ar.heardX, ar.heardY!, st.speed, dt)
      if (stuck || Math.hypot(ar.heardX - e.x, ar.heardY! - e.y) < 0.6) ar.heardT = 99
      faceTo(eng, e, ar.heardX, ar.heardY!, dt)
      locoClip(eng, e, ar)
      if (d < 0.9) setMode(ar, 'chase')
      return
    } else if (!st.flags.blind && ar.heardT < 0.3 && ar.heardX !== undefined && ar.mode !== 'ambush') {
      setMode(ar, 'investigate'); ar.lastSeenX = ar.heardX; ar.lastSeenY = ar.heardY!; ar.seenT = 0.01
    }
  }

  if (ar.mode === 'chase') {
    // 失去目标
    const lost = st.flags.blind ? ar.heardT > 4 && d > 1.5 : ar.seenT > 6 && d > st.sight * 1.4
    const leashed = (ar.kind === 'weaver' || ar.nest) && Math.hypot(e.x + ox(eng) - ar.homeX, e.y + oy(eng) - ar.homeY) > (ar.kind === 'weaver' ? ARACHNID.weaverLeash + 1 : 14)
    if (lost || leashed || !hostile) {
      setMode(ar, leashed ? 'wander' : st.flags.ambush ? 'ambush' : 'investigate')
      if (leashed) { e.targetX = ar.homeX - ox(eng); e.targetY = ar.homeY - oy(eng) }
      e.provoked = false
    } else {
      const tx = st.flags.blind && !seen && ar.heardX !== undefined ? ar.heardX : p.x
      const ty = st.flags.blind && !seen && ar.heardY !== undefined ? ar.heardY : p.y
      // 跳蛛：距离合适就蓄力跳扑
      if (ar.kind === 'jumper' && d > ARACHNID.jumpMin && d < ARACHNID.jumpMax && ar.specialCd <= 0 && seen) { startJump(eng, e, ar, d); return }
      // 鞭蝎：中距离喷酸
      if (ar.kind === 'whipscorpion' && d > ARACHNID.sprayMin && d < ARACHNID.sprayMax && ar.specialCd <= 0 && seen) { setMode(ar, 'spray'); setClip(ar, 'spray', true); return }
      const wantStop = d < st.reach * 0.8
      if (!wantStop) moveTo(eng, e, ar, tx, ty, e.def.speed, dt)
      faceTo(eng, e, p.x, p.y, dt)
      locoClip(eng, e, ar)
      if (d < st.reach && ar.cd <= 0 && Math.abs(e.z - p.z) < (ar.kind === 'colossus' ? 1.8 : 1.1)) startAttack(eng, e, ar, d)
    }
    return
  }
  if (ar.mode === 'investigate') {
    const stuck = moveTo(eng, e, ar, ar.lastSeenX, ar.lastSeenY, st.walk * 1.6, dt)
    locoClip(eng, e, ar)
    if (stuck || ar.modeT > 6) setMode(ar, st.flags.ambush ? 'ambush' : 'wander')
    return
  }
  if (ar.mode === 'ambush') { setClip(ar, 'idle'); return }
  // ---- 游荡 / 织网 ----
  if (ar.kind === 'weaver' && ar.specialCd <= 0 && ar.webs < ARACHNID.webMax && arachnidWebs(eng).filter((q) => q.owner === e.id).length < ARACHNID.webMax) {
    if (beginSpin(eng, w, e, ar)) return
  }
  wanderStep(eng, e, ar, st, dt)
  locoClip(eng, e, ar)
}

function wanderStep(eng: Engine, e: Entity, ar: ArachnidState, st: ArachnidStat, dt: number) {
  if (ar.mode !== 'wander' && ar.mode !== 'idle' && ar.mode !== 'flee' && ar.mode !== 'sated') setMode(ar, 'wander')
  if (ar.mode === 'idle') { if (ar.modeT > 2.5) { setMode(ar, 'wander'); wanderPick(eng, e, ar) } return }
  e.stateT -= dt
  if (e.stateT <= 0) { if (Math.random() < 0.35) { setMode(ar, 'idle'); return } wanderPick(eng, e, ar) }
  if (moveTo(eng, e, ar, e.targetX, e.targetY, st.walk, dt)) wanderPick(eng, e, ar)
}

function nearestDry(m: GameMap, x: number, y: number): { x: number; y: number } | null {
  for (let r = 1; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
    const tx = Math.floor(x) + dx, ty = Math.floor(y) + dy
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) continue
    if (m.liquid[ty * m.w + tx] !== 1 && walkableAt(m, tx, ty, 0)) return { x: tx + 0.5, y: ty + 0.5 }
  }
  return null
}

// ---------- 近战 ----------
function startAttack(eng: Engine, _e: Entity, ar: ArachnidState, d: number) {
  let clip: ArachnidClip = 'lunge'
  if (ar.kind === 'cavescorpion') clip = d < 1.1 ? 'pinch' : 'sting'
  else if (ar.kind === 'whipscorpion') clip = 'pinch'
  setMode(ar, 'attack'); setClip(ar, clip, true)
  void eng
}
function updateAttack(eng: Engine, w: ArachnidWorld, e: Entity, ar: ArachnidState, dt: number, d: number, dmgMult: number) {
  const p = eng.player, st = ARACHNID_STATS[ar.kind]
  faceTo(eng, e, p.x, p.y, dt, 12)
  const hitAt = ar.clip === 'sting' ? ARACHNID_STING_HIT : ar.clip === 'pinch' ? ARACHNID_PINCH_HIT : ARACHNID_LUNGE_HIT
  // 扑咬时身体向前探一点（视觉上 lunge 自带前探，这里只在出手前补 0.25m 贴近）
  if (ar.clip === 'lunge' && ar.clipT < hitAt && d > st.reach * 0.6) moveTo(eng, e, ar, p.x, p.y, st.speed * 0.6, dt)
  if (!ar.hitDone && ar.clipT >= hitAt) {
    ar.hitDone = true
    const zOk = Math.abs(e.z - p.z) < (ar.kind === 'colossus' ? 1.8 : 1.1)
    if (d < st.reach + 0.25 && zOk && !eng.dev.invisible) {
      const dmg = ar.clip === 'sting' ? 6 : st.damage
      eng.hurtPlayer(dmg * dmgMult, e.def.name)
      if (ar.kind === 'colossus') { p.slowT = Math.max(p.slowT, 1.2); eng.camShake = Math.min(1, eng.camShake + 0.7) }
      if (ar.kind === 'widow' || ar.kind === 'wolf' || (ar.kind === 'cavescorpion' && ar.clip === 'sting')) addPoison(eng, ar.kind)
      void w
    }
  }
  if (ar.clipT >= clipLen(ar.kind, ar.clip)) { ar.cd = st.cd; setMode(ar, 'chase') }
}

// ---------- 跳蛛跳扑 ----------
function startJump(eng: Engine, e: Entity, ar: ArachnidState, d: number) {
  const p = eng.player
  const a = Math.atan2(p.y - e.y, p.x - e.x)
  e.facing = a
  ar.jump = { hx: Math.cos(a), hy: Math.sin(a), D: Math.max(1.5, Math.min(5, d - 0.5)), moved: 0 }
  setMode(ar, 'jump'); setClip(ar, 'jump', true)
}
function jumpStep(m: GameMap, e: Entity, dx: number, dy: number): boolean {
  const nx = e.x + dx, ny = e.y + dy, tx = Math.floor(nx), ty = Math.floor(ny)
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || !(walkableAt(m, tx, ty, 0) || m.liquid[ty * m.w + tx] === 1)) return false
  e.x = nx; e.y = ny
  return true
}
function updateJump(eng: Engine, w: ArachnidWorld, e: Entity, ar: ArachnidState, _dt: number, dmgMult: number) {
  const m = eng.map!, p = eng.player, j = ar.jump!
  const rm = ARACHNID_ROOT_MOTION.jump!.dx
  // 起跳到落地之间：实体本身补足「总距离 - 根位移」；根位移 0.9m 由动画给出，落地瞬间再交给实体
  if (ar.clipT > ARACHNID_JUMP_TAKEOFF && ar.clipT < ARACHNID_JUMP_LAND) {
    const k = Math.min(1, (ar.clipT - ARACHNID_JUMP_TAKEOFF) / (ARACHNID_JUMP_LAND - ARACHNID_JUMP_TAKEOFF))
    const want = Math.max(0, j.D - rm) * k, step = want - j.moved
    if (step > 0 && jumpStep(m, e, j.hx * step, j.hy * step)) j.moved = want
    ar.speed = 0
  }
  if (ar.clipT >= ARACHNID_JUMP_LAND) {
    jumpStep(m, e, j.hx * rm, j.hy * rm)
    if (!isDeep(m, e.x, e.y)) e.z = floorHeight(m, e.x, e.y, 0)
    const dd = Math.hypot(p.x - e.x, p.y - e.y)
    if (dd < ARACHNID.jumpHitR && Math.abs(e.z - p.z) < 1.2 && !eng.dev.invisible) {
      eng.hurtPlayer(ARACHNID_STATS.jumper.damage * dmgMult, e.def.name)
      eng.camShake = Math.min(1, eng.camShake + 0.3)
    }
    ar.jump = undefined
    ar.specialCd = ARACHNID.jumpCd
    setClip(ar, 'idle', true, true) // 根位移已交给实体：硬切，不混合
    setMode(ar, 'chase')
    void w
  }
}

// ---------- 鞭蝎喷酸 ----------
function updateSpray(eng: Engine, w: ArachnidWorld, e: Entity, ar: ArachnidState, dt: number, d: number, dmgMult: number) {
  const p = eng.player
  faceTo(eng, e, p.x, p.y, dt, 6)
  while (ar.puff < ARACHNID_SPRAY_PUFFS.length && ar.clipT >= ARACHNID_SPRAY_PUFFS[ar.puff]) {
    ar.puff++
    w.fx.push({ kind: 'spray', x: e.x + ox(eng), y: e.y + oy(eng), z: e.z + 0.25, dx: Math.cos(e.facing), dy: Math.sin(e.facing), t: w.t, id: e.id })
    if (arachnidSprayHits(e, p.x, p.y, p.z) && eng.los(e.x, e.y, p.x, p.y) && !eng.dev.invisible) {
      eng.hurtPlayer(ARACHNID.sprayDmg * dmgMult, '鞭蝎酸雾')
      w.acidT = ARACHNID.acidT
      msgOnce(eng, w, 'acid', '刺鼻的酸雾糊了你一脸——眼睛火辣辣地疼，视野一片模糊。', 'damage', 4)
    }
  }
  void d
  if (ar.clipT >= clipLen('whipscorpion', 'spray')) { ar.specialCd = ARACHNID.sprayCd; setMode(ar, 'chase') }
}
/** 酸雾锥形判定（纯几何，验收脚本直接测） */
export function arachnidSprayHits(e: { x: number; y: number; z: number; facing: number }, px: number, py: number, pz: number): boolean {
  const d = Math.hypot(px - e.x, py - e.y)
  if (d > ARACHNID.sprayMax + 0.3 || Math.abs(pz - e.z) > 1.6) return false
  let diff = Math.abs(Math.atan2(py - e.y, px - e.x) - e.facing)
  if (diff > Math.PI) diff = Math.PI * 2 - diff
  return diff < ARACHNID.sprayCone
}

// ---------- 织网 ----------
function beginSpin(eng: Engine, _w: ArachnidWorld, e: Entity, ar: ArachnidState): boolean {
  const m = eng.map!
  if (eng.levelDef.id === 8 && m.inf) {
    const seed = m.inf.seed
    // 在家附近找一段通道（余量 0.8–2.6m）横向织网
    for (let t = 0; t < 10; t++) {
      const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 3
      const wx = ar.homeX + Math.cos(a) * r, wy = ar.homeY + Math.sin(a) * r
      const mg = l8CaveMarginAt(seed, wx, wy)
      if (mg < 0.8 || mg > 2.6) continue
      if (arachnidWebs(eng).some((q) => Math.hypot(q.x - wx, q.y - wy) < 3)) continue
      const tx = Math.floor(wx - ox(eng)), ty = Math.floor(wy - oy(eng))
      if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || !walkableAt(m, tx, ty, 0)) continue
      e.targetX = wx - ox(eng); e.targetY = wy - oy(eng)
      setMode(ar, 'spin')
      return true
    }
  }
  ar.specialCd = 8
  return false
}
function updateSpin(eng: Engine, w: ArachnidWorld, e: Entity, ar: ArachnidState, dt: number) {
  const st = ARACHNID_STATS.weaver
  if (ar.clip !== 'web_spin') {
    const stuck = moveTo(eng, e, ar, e.targetX, e.targetY, st.walk, dt)
    locoClip(eng, e, ar)
    if (Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.4 || stuck || ar.modeT > 10) setClip(ar, 'web_spin', true)
    return
  }
  w.fx.push({ kind: 'silk', x: e.x + ox(eng), y: e.y + oy(eng), z: e.z + 0.3, t: w.t, id: e.id })
  if (ar.clipT >= clipLen('weaver', 'web_spin')) {
    // 网横在通道上：法线沿实体朝向
    spinArachnidWeb(eng, e.x + ox(eng) + Math.cos(e.facing) * 0.6, e.y + oy(eng) + Math.sin(e.facing) * 0.6, Math.cos(e.facing), Math.sin(e.facing), e.id)
    ar.webs++
    ar.specialCd = ARACHNID.webCd
    setMode(ar, 'wander')
  }
}

// ---------- 群体（幼蛛潮 / 螨群）----------
function updateSwarm(eng: Engine, w: ArachnidWorld, e: Entity, ar: ArachnidState, st: ArachnidStat, dt: number, d: number, dmgMult: number, seen: boolean, hostile: boolean) {
  const p = eng.player
  setClip(ar, 'swarm_flow')
  const chase = hostile && (seen || d < st.hearing * 0.7 || ar.provokedT > 0) && d < 12
  if (chase) {
    setMode(ar, 'chase')
    if (d > 0.35) moveTo(eng, e, ar, p.x, p.y, st.speed, dt)
    if (d < st.reach && Math.abs(e.z - p.z) < 1.2 && !eng.dev.invisible) {
      if (ar.kind === 'broodswarm') {
        dot(eng, w, st.damage * dmgMult * dt, '幼蛛潮')
        msgOnce(eng, w, 'brood', '几十只幼蛛顺着裤腿往上爬，细小的螯牙一口口啃着皮肤！', 'damage', 6)
      } else {
        dot(eng, w, st.damage * dmgMult * dt, '螨群')
        if (w.mitesT <= 0) eng.msg('螨群扑到身上，钻进了衣服缝里——全身奇痒难忍。（找水冲掉）', 'damage')
        w.mitesT = ARACHNID.mitesT
      }
    }
  } else {
    if (ar.mode === 'chase') setMode(ar, 'wander')
    wanderStep(eng, e, ar, st, dt)
    setClip(ar, 'swarm_flow')
  }
  // 螨群进浅溪也会散
  if (ar.kind === 'mitecloud') {
    const m = eng.map!, tx = Math.floor(e.x), ty = Math.floor(e.y)
    if (tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && m.liquid[ty * m.w + tx] !== 0) disperse(eng, w, e, ar, '碰到流水就散开了')
  }
}
/** 群体被驱散。viaKill=true 时只把血清零，由调用方随后走 killCheck 记击杀 */
function disperse(eng: Engine, w: ArachnidWorld, e: Entity, ar: ArachnidState, why: string, viaKill = false) {
  if (e.dead) return
  e.hp = 0; ar.final = true
  if (!viaKill) { e.dead = true; e.deathT = 1.2 }
  w.fx.push({ kind: 'disperse', x: e.x + ox(eng), y: e.y + oy(eng), z: e.z, t: w.t, id: e.id })
  if (Math.hypot(e.x - eng.player.x, e.y - eng.player.y) < 14) eng.msg(`${e.def.name}${why}。`, 'system')
}

// ---------- 吸附蜱 ----------
function updateTick(eng: Engine, w: ArachnidWorld, e: Entity, ar: ArachnidState, st: ArachnidStat, dt: number, d: number, seen: boolean) {
  const p = eng.player
  if (ar.mode === 'sated') { wanderStep(eng, e, ar, { ...st, walk: 0.25 }, dt); setMode(ar, 'sated'); locoClip(eng, e, ar); return }
  if (ar.clip === 'latch') {
    faceTo(eng, e, p.x, p.y, dt, 12)
    if (!ar.hitDone && ar.clipT >= ARACHNID_LATCH_HIT) {
      ar.hitDone = true
      if (d < st.reach + 0.2 && w.latchedId === null && Math.abs(e.z - p.z) < 1 && !eng.dev.invisible) { latchTick(eng, w, e, ar); return }
    }
    if (ar.clipT >= clipLen('tick', 'latch')) { ar.cd = st.cd; setClip(ar, 'walk') }
    return
  }
  if (w.latchedId === null && (seen || ar.heardT < 1) && d < 6) {
    setMode(ar, 'chase')
    if (d > st.reach * 0.7) moveTo(eng, e, ar, p.x, p.y, st.speed, dt)
    faceTo(eng, e, p.x, p.y, dt)
    locoClip(eng, e, ar)
    if (d < st.reach && ar.cd <= 0) setClip(ar, 'latch', true)
    return
  }
  if (ar.mode === 'chase') setMode(ar, 'wander')
  wanderStep(eng, e, ar, st, dt)
  locoClip(eng, e, ar)
}
/** 吸附到玩家身上（验收脚本也直接调用） */
export function latchTick(eng: Engine, w: ArachnidWorld, e: Entity, ar: ArachnidState) {
  ar.latched = true; w.latchedId = e.id
  setMode(ar, 'latched'); setClip(ar, 'feed', true)
  eng.msg('有什么东西扎进了你的小腿——一只吸附蜱的倒钩口器咬住不放了！（交互键拔掉，或者打它）', 'damage')
  audio.hurt()
}
function updateLatched(eng: Engine, w: ArachnidWorld, e: Entity, ar: ArachnidState, dt: number, dmgMult: number) {
  const p = eng.player
  // 挂在玩家右小腿前侧：低头能看见它鼓起来
  const a = p.facing + 0.75
  e.x = p.x + Math.cos(a) * 0.3; e.y = p.y + Math.sin(a) * 0.3; e.z = p.z + 0.42
  e.facing = p.facing + Math.PI
  ar.engorge = Math.min(1, ar.engorge + dt / ARACHNID.tickFull)
  ar.clip = 'feed'; ar.clipT = ar.engorge * clipLen('tick', 'feed')
  dot(eng, w, ARACHNID.tickDrain * dmgMult * dt, '吸附蜱')
  if (ar.engorge >= 1) {
    detachTick(eng, w, e, ar)
    setMode(ar, 'sated')
    eng.msg('吸得滚圆的蜱虫自己松口，「啪」地掉在地上。', 'system')
  }
}
export function detachTick(eng: Engine, w: ArachnidWorld, e: Entity, ar: ArachnidState) {
  ar.latched = false
  if (w.latchedId === e.id) w.latchedId = null
  const m = eng.map!
  e.z = floorHeight(m, e.x, e.y, 0)
  setMode(ar, 'wander'); setClip(ar, 'walk', true)
  ar.cd = 3
}

// ======================================================================
// 受击（combat.killCheck 接入）：返回 true = 拦截本次死亡结算
// ======================================================================
export function arachnidHurt(eng: Engine, e: Entity): boolean {
  if (e.dead) return false
  const ar = ensureArachnid(e, eng), st = ARACHNID_STATS[ar.kind], w = getArachnidWorld(eng)
  if (ar.final) return false
  const hit = Math.max(0, ar.lastHp - e.hp)
  const fire = !!ar.fireHit
  ar.fireHit = false
  if (hit <= 0 && e.hp > 0) return false
  e.provoked = true; ar.provokedT = 8
  if (ar.latched) {
    detachTick(eng, w, e, ar)
    e.stunT = Math.max(e.stunT, 1)
    eng.msg('你一巴掌把吸附蜱从腿上拍了下来。', 'system')
  }
  // 群体：单体打击只打散一小撮，打不完
  if (st.flags.swarm && !fire) {
    const k = ar.kind === 'mitecloud' ? ARACHNID.miteMelee : ARACHNID.swarmMelee
    e.hp = Math.max(st.hp * ARACHNID.swarmFloor, ar.lastHp - hit * k)
    if (e.hp > ar.lastHp) e.hp = ar.lastHp
    msgOnce(eng, w, 'swarmhit' + ar.kind, ar.kind === 'mitecloud' ? '拍打只让螨群散开又聚拢——得用水或火。' : '幼蛛四散又重新聚拢——单靠拍打打不完，得用火。', 'system', 10)
    ar.lastHp = e.hp
    return false
  }
  if (ar.kind === 'regen' && hit >= ARACHNID.regenLimb && ar.regrow >= ARACHNID_REGROWN && e.hp > 0) {
    ar.regrow = 1; ar.regenWait = 2
    msgOnce(eng, w, 'limb' + e.id, '一条蛛腿被你砍断了——断口处的符文缝线还在发亮。', 'system', 6)
  }
  if (ar.kind === 'undying' && e.hp <= 0) {
    if (ar.mode === 'dormant') {
      if (fire || hit >= ARACHNID.undyingExecute) { ar.final = true; eng.msg('你砸碎了不死蛛发光的符文内核——它终于不动了。', 'loot'); return false }
      e.hp = 1; ar.lastHp = 1
      msgOnce(eng, w, 'undying-weak', '它的符文内核还亮着——需要火，或者一次足够重的处决。', 'system', 4)
      return true
    }
    if (!ar.revived && !fire && hit < ARACHNID.undyingHeavy) {
      e.hp = 1; ar.lastHp = 1
      setMode(ar, 'dormant'); setClip(ar, 'death', true)
      e.state = 'idle'
      eng.msg('不死蛛翻倒在地，腿蜷了起来……但甲壳破洞里的符文还在发光。', 'system')
      return true
    }
  }
  ar.lastHp = e.hp
  if (ar.mode !== 'attack' && ar.mode !== 'jump' && ar.mode !== 'spray' && !st.flags.timid && ar.mode !== 'regen') { setMode(ar, 'chase'); if (ar.clip !== 'hit') setClip(ar, 'hit', true) }
  return false
}

/** 汽油罐等火焰命中（combat.landProjectile 接入）。返回 true = 已处理（调用方跳过默认伤害） */
export function arachnidFireHit(eng: Engine, e: Entity, dmg: number): boolean {
  const ar = ensureArachnid(e, eng), st = ARACHNID_STATS[ar.kind], w = getArachnidWorld(eng)
  if (st.flags.fireproof) {
    e.stunT = Math.max(e.stunT, 0.3)
    msgOnce(eng, w, 'fireproof', '火焰从抗火蛛的熔岩甲片上滑开——它毫发无伤。', 'system', 4)
    e.provoked = true; ar.provokedT = 8
    return true
  }
  ar.burnT = ARACHNID.regenBurn
  if (st.flags.swarm) { disperse(eng, w, e, ar, '被火焰烧散了', true); eng.killCheck(e); return true }
  ar.lastHp = e.hp
  ar.fireHit = true
  e.hp -= dmg
  e.stunT = Math.max(e.stunT, 0.6)
  eng.killCheck(e)
  return true
}
/** 爆炸 / 火焰落点：烧掉附近的网 */
export function arachnidExplosion(eng: Engine, x: number, y: number, r = 3.2) {
  const w = getArachnidWorld(eng)
  for (const web of arachnidWebs(eng)) if (Math.hypot(web.x - ox(eng) - x, web.y - oy(eng) - y) < r) burnWeb(eng, w, web)
}
/** 滋水枪命中：螨群（任何液体）被泼散。返回 true = 已处理 */
export function arachnidSquirted(eng: Engine, e: Entity, _tank: string): boolean {
  const ar = ensureArachnid(e, eng)
  if (ar.kind !== 'mitecloud') return false
  disperse(eng, getArachnidWorld(eng), e, ar, '被泼得四散，再也聚不起来', true)
  eng.killCheck(e)
  return true
}

// ======================================================================
// 交互（interact.doInteract 接入）：拔蜱、拆茧。返回 true = 本次交互已被消费
// ======================================================================
export function arachnidInteract(eng: Engine): boolean {
  const m = eng.map
  if (!m) return false
  const w = getArachnidWorld(eng), p = eng.player
  if (w.latchedId !== null) {
    const e = m.entities.find((q) => q.id === w.latchedId)
    if (e?.arachnid) {
      detachTick(eng, w, e, e.arachnid)
      e.stunT = Math.max(e.stunT, 1.5)
      e.hp -= 2
      if (!eng.dev.god) p.hp -= ARACHNID.tickPull
      eng.msg('你捏住蜱虫硬生生拔了下来——倒钩带走一小块皮。（生命 -2）', 'damage')
      if (e.hp <= 0 && !e.dead) { e.dead = true; e.deathT = 1.4 }
      return true
    } else w.latchedId = null
  }
  // 拆茧：1.7m 内、大致正前方
  const wx = p.x + ox(eng), wy = p.y + oy(eng)
  for (const n of w.nests) for (const c of n.cocoons) {
    if (w.cocoonsTaken.has(c.id)) continue
    const dd = Math.hypot(c.x - wx, c.y - wy)
    if (dd > 1.7) continue
    let diff = Math.abs(Math.atan2(c.y - wy, c.x - wx) - p.facing)
    if (diff > Math.PI) diff = Math.PI * 2 - diff
    if (dd > 0.8 && diff > 0.8) continue
    w.cocoonsTaken.add(c.id)
    const loot = rollLoot(eng, 'corpse').slice(0, 2)
    for (const type of loot) {
      const it = { id: Math.random(), type, x: p.x + Math.cos(p.facing) * 0.6 + (Math.random() - 0.5) * 0.4, y: p.y + Math.sin(p.facing) * 0.6 + (Math.random() - 0.5) * 0.4 }
      m.items.push(it)
      const inf = m.inf
      inf?.chunks.get(`${Math.floor((it.x + inf.ox) / 32)},${Math.floor((it.y + inf.oy) / 32)}`)?.items.push(it)
    }
    eng.msg(loot.length ? `你撕开裹得发硬的人形茧——里面是一具干瘪的遗骸，还有些没被带走的东西。` : '你撕开人形茧——里面只剩干瘪的遗骸。', loot.length ? 'loot' : 'lore')
    // 拆茧会惊动巢里的守卫
    for (const q of m.entities) if (q.arachnid?.nest === n.id && !q.dead) { q.provoked = true; q.arachnid.provokedT = 10 }
    audio.aggro()
    return true
  }
  return false
}

// ======================================================================
// 公共查询（给微光向导等系统）
// ======================================================================
export interface ArachnidNear { e: Entity; kind: ArachnidKind; d: number; hostile: boolean; runic: boolean }
/** pos 为窗口坐标（与实体相同）；r 内存活的蛛形纲，按距离排序 */
export function getArachnidsNear(pos: { x: number; y: number }, r: number, eng: Engine | null = activeEngine): ArachnidNear[] {
  const m = eng?.map
  if (!m) return []
  const out: ArachnidNear[] = []
  for (const e of m.entities) {
    if (e.dead || e.def.type !== 'arachnid') continue
    const d = Math.hypot(e.x - pos.x, e.y - pos.y)
    if (d > r) continue
    const ar = ensureArachnid(e, eng!), st = ARACHNID_STATS[ar.kind]
    out.push({ e, kind: ar.kind, d, hostile: !st.flags.timid && !(ar.herb && ar.provokedT <= 0), runic: !!st.flags.runic })
  }
  return out.sort((a, b) => a.d - b.d)
}
/** 是否处于符文蛛巢危险区（巢区半径 + 2m 缓冲）。pos 为窗口坐标 */
export function isArachnidDangerZone(pos: { x: number; y: number }, eng: Engine | null = activeEngine): boolean {
  if (!eng?.map) return false
  const w = getArachnidWorld(eng)
  if (!w.nests.length && eng.levelDef.id === 8 && eng.map.inf) w.nests = arachnidNestsLoaded(eng.map.inf as never)
  const wx = pos.x + ox(eng), wy = pos.y + oy(eng)
  return w.nests.some((n) => Math.hypot(n.zx - wx, n.zy - wy) < n.r + 2)
}
/** 当前已加载的蛛巢（窗口坐标的巢心 + 半径） */
export function arachnidDangerZones(eng: Engine | null = activeEngine): { id: string; x: number; y: number; r: number }[] {
  if (!eng?.map) return []
  return getArachnidWorld(eng).nests.map((n) => ({ id: n.id, x: n.zx - ox(eng), y: n.zy - oy(eng), r: n.r }))
}

/** HUD：玩家身上的蛛形纲状态 */
export function arachnidHudState(eng: Engine) {
  const w = WORLDS.get(eng)
  if (!w || w.map !== eng.map) return null
  const tick = w.latchedId !== null ? eng.map?.entities.find((q) => q.id === w.latchedId)?.arachnid : undefined
  const poison = w.poison.reduce((s, q) => s + q.dps, 0)
  if (!poison && w.webT <= 0 && w.acidT <= 0 && w.mitesT <= 0 && !tick) return null
  return { poison, poisonT: Math.max(0, ...w.poison.map((q) => q.t)), web: w.webT, acid: Math.max(0, Math.min(1, w.acidT / ARACHNID.acidT)), mites: w.mitesT, tick: tick ? tick.engorge : null }
}

/** 实体刚死：延长尸体停留，让 death 片段播完 */
export function arachnidOnDead(e: Entity) {
  if (!e.arachnid || e.arachnid.deadT !== undefined) return
  e.arachnid.deadT = 0
  e.deathT = Math.max(e.deathT, 2.4)
  if (e.arachnid.latched && activeEngine) { const w = getArachnidWorld(activeEngine); if (w.latchedId === e.id) w.latchedId = null; e.arachnid.latched = false }
}
/** 防止旧的 ARACHNID_NEST_RADIUS 未用告警（文档里引用） */
export const ARACHNID_DANGER_RADIUS = ARACHNID_NEST_RADIUS + 2

/** 开发者 / 验收：传送到最近的符文蛛巢区（巢心旁可落脚处）。返回巢描述，没有则 null */
export function devGotoArachnidNest(eng: Engine): ArachnidNestDesc | null {
  const m = eng.map, p = eng.player
  if (!m?.inf || eng.levelDef.id !== 8) return null
  const inf0 = m.inf
  const n = findNearestArachnidNest(inf0.seed, p.x + inf0.ox, p.y + inf0.oy)
  if (!n) return null
  p.x = n.zx - inf0.ox; p.y = n.zy - inf0.oy; p.z = 0; p.vz = 0
  eng.updateInfiniteWindow()
  const inf = eng.map!.inf!
  const spot = eng.devFindSpot(n.zx + n.dx * 2.5 - inf.ox, n.zy + n.dy * 2.5 - inf.oy, 6, 0) ?? eng.devFindSpot(n.zx - inf.ox, n.zy - inf.oy, 8, 0)
  if (spot) { p.x = spot.x; p.y = spot.y }
  p.z = floorHeight(eng.map!, p.x, p.y, 0) + 0.02; p.vz = 0; p.floor = 0
  const w = getArachnidWorld(eng)
  w.nests = arachnidNestsLoaded(eng.map!.inf as never)
  return n
}
