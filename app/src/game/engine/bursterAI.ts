// 爆酸者（Entity 11）重制 阶段 3：机制。设定依据 backrooms-wiki-cn entity-11 与 ZAN 2026-10-21 的决定。
// - 平时蜷成胎儿状休眠；活物靠近（4m 内看见，或 5m 内的噪声）就惊醒。
// - 惊醒后弓背：胼胝鼓胀 0.8s，然后连环爆裂，把酸液朝受害者的脸喷过去。酸液不秒杀：少量直接伤害，加上持续灼烧，再加视野模糊。
// - 喷完原地等待，看着受害者被酸液折磨；水泡回涨后接着喷，直到受害者休克倒地（低血量且大半失明）。
//   倒地 5 秒内不洗眼，就会被它爬过来消化。
// - 防护：潜水面罩挡 70%，夜视镜挡 40%；每次挡住都会被腐蚀掉耐久，耐久归零即报废。
// - 洗眼：用市政自来水、杏仁水，或滋水枪里的清水/杏仁水自饮，可以清掉失明、灼烧和休克。
// - 自伤：每次爆裂扣自己 8 血。血量降到 30% 以下就硬化结茧。
//   茧只怕重击（蓄力攻击），普攻打上去会弹开；茧碎即死，掉落「酸性胼胝」。茧放着 90 秒不管会重新孵出来。
// - 水：清水喷中会使它僵直，正在鼓胀的那一轮也作废；杏仁水造成重度灼伤（45 伤害，且留疤，不再自愈）。
// 运行时状态不入存档/联机。
import { squirtActsAsWater } from '../content/squirtLiquids'
import type { Engine } from '../engine'
import type { Entity } from '../entities'
import { ITEMS } from '../content/items'
import { audio } from '../core/audio'
import { bandOfZ, groundHeightAt, wallAt } from '../world/mapgen'
import type { FloorBand } from '../core/types'

export const BURSTER = {
  hp: 120,
  wakeSight: 4, wakeNoise: 5, wakeT: 1.4,
  burstR: 6, burstT: 1.6, fireFrom: 0.8, fireTo: 1.2, globs: 6,
  globSpeed: 9, globSpread: 0.05, gravity: 9.8,
  hitDmg: 1.2, burnPerGlob: 1.3, burnRate: 2, blindPerGlob: 0.12, blindDecay: 0.02,
  waitT: 3.5, regrowT: 4,
  crawl: 0.9, rush: 1.7,
  selfHurt: 8, cocoonAt: 0.3, cocoonT: 2.2, hatchT: 90,
  shockHp: 25, shockBlind: 0.6, shockT: 5, digestR: 1.5,
  splashChance: 0.4,
  puddleLife: 10, puddleR: 0.55, puddleBurn: 1.5,
  waterStun: 1.5, almondDmg: 45,
  // 滋水枪酸液弹（1 块酸性胼胝 = 3 份）：直伤 + 每秒腐蚀 × 秒数；对爆酸者无效
  acidShot: 22, acidDot: 4, acidDotT: 5,
  // 护脸：挡住的比例 / 每滴酸腐蚀掉的耐久（满耐久 100）
  guard: { divemask: 0.7, nightvision: 0.4 } as Record<string, number>,
  guardWear: 4, guardMax: 100,
  lose: 12,
} as const

export type BuPhase = 'sleep' | 'wake' | 'wait' | 'stalk' | 'burst' | 'cocoon' | 'shell' | 'hatch' | 'broken'
export interface BursterState {
  phase: BuPhase; t: number
  /** 背部水泡余量 0..1（爆完 0，等待中回涨） */
  blisters: number
  /** 本轮已经射出的酸液滴数 */
  fired: number
  /** 茧壳裂纹 0..1（≥1 破茧） */
  crack: number
  /** 被杏仁水灼伤留疤：孵化后血量减少 */
  scar: boolean
  lostT: number
  /** 本轮瞄准点：鼓胀到顶（开始爆裂）那一刻受害者的脸。之后横移就能躲开 */
  aimX: number; aimY: number; aimZ: number
  /** 渲染侧读取：当前爬行速度（瓦片/秒） */
  speed: number
}
export interface AcidGlob { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; owner: number; band: FloorBand }
export interface AcidPuddle { x: number; y: number; z: number; t: number }
export interface PlayerAcid { burn: number; blind: number; shockT: number; shockBy: number; msgT: number; puddleT: number }
interface Frame { map:Engine['map']; player:Engine['player']; ox:number; oy:number; globs: AcidGlob[]; puddles: AcidPuddle[]; acid: PlayerAcid; shellMsg: number; burns: Map<Entity, number> }
const frames = new WeakMap<Engine, Frame>()
export function bursterFrame(eng: Engine): Frame {
  let f = frames.get(eng)
  if (!f||f.map!==eng.map||f.player!==eng.player) { f = { map:eng.map,player:eng.player,ox:eng.map?.inf?.ox??0,oy:eng.map?.inf?.oy??0,burns: new Map(), shellMsg: -99, globs: [], puddles: [], acid: { burn: 0, blind: 0, shockT: 0, shockBy: 0, msgT: 0, puddleT: 0 } }; frames.set(eng, f) }
  const ox=eng.map?.inf?.ox??0,oy=eng.map?.inf?.oy??0,dx=f.ox-ox,dy=f.oy-oy
  if(dx||dy){for(const g of f.globs){g.x+=dx;g.y+=dy}for(const q of f.puddles){q.x+=dx;q.y+=dy}for(const e of eng.map?.entities??[])if(e.bu){e.bu.aimX+=dx;e.bu.aimY+=dy}f.ox=ox;f.oy=oy}
  return f
}

export const isBurster = (e: Entity) => e.def.type === 'burster'
function st(e: Entity): BursterState {
  return e.bu ??= { phase: 'sleep', t: 0, blisters: 1, fired: 0, crack: 0, scar: false, lostT: 0, speed: 0, aimX: 0, aimY: 0, aimZ: 0 }
}
function go(e: Entity, phase: BuPhase) { const s = st(e); s.phase = phase; s.t = 0; if (phase === 'burst') s.fired = 0 }
const headZ = (eng: Engine) => eng.player.z + (eng.player.crouching?.82:1.55)

/** 玩家当前戴着的护脸（没有就返回 null） */
function faceGuard(eng: Engine) {
  const h = eng.player.equip.head
  if (!h) return null
  const k = BURSTER.guard[h.type]
  return k ? { slot: h, k } : null
}

// ======================= 每帧（在 ambient 里调用）：酸液滴、地面酸液、玩家身上的酸 =======================
export function bursterAmbient(eng: Engine, dt: number) {
  const f = frames.has(eng)?bursterFrame(eng):undefined, m = eng.map
  if (!f || !m) return
  const p = eng.player, A = f.acid
  // 被滋水枪酸液打中的实体：持续腐蚀
  for (const [e, left] of f.burns) {
    if (e.dead || !m.entities.includes(e) || left <= 0) { f.burns.delete(e); continue }
    const k = Math.min(left, dt)
    f.burns.set(e, left - k)
    e.hp -= BURSTER.acidDot * k
    if (e.hp <= 0) { f.burns.delete(e); eng.killCheck(e) }
  }
  // 酸液滴：抛物线飞行；碰到玩家结算，碰墙或落地变成一滩酸
  for (let i = f.globs.length - 1; i >= 0; i--) {
    const g = f.globs[i]
    g.t += dt; g.vz -= BURSTER.gravity * dt
    const px = g.x, py = g.y
    g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt
    const dh = Math.hypot(g.x - p.x, g.y - p.y)
    if (!eng.over && dh < 0.42 && g.z > p.z + 0.2 && g.z < p.z + 1.85) { acidHitPlayer(eng, g.z > p.z + 1.3, g.owner); f.globs.splice(i, 1); continue }
    const band = g.band // 按出手者所在楼层带判定（酸液飞到 1.5m 高不能算进上层）
    const tx = Math.floor(g.x), ty = Math.floor(g.y)
    const outside = tx < 0 || ty < 0 || tx >= m.w || ty >= m.h
    const floor = outside ? g.z : groundHeightAt(m, g.x, g.y, band)
    if (outside || wallAt(m, tx, ty, band) || g.z <= floor || g.t > 2) {
      if (!outside && f.puddles.length < 24) f.puddles.push({ x: wallAt(m, tx, ty, band) ? px : g.x, y: wallAt(m, tx, ty, band) ? py : g.y, z: outside ? g.z : groundHeightAt(m, px, py, band), t: 0 })
      f.globs.splice(i, 1)
    }
  }
  // 地面酸液：站在上面会灼脚
  let onPuddle = false
  for (let i = f.puddles.length - 1; i >= 0; i--) {
    const q = f.puddles[i]; q.t += dt
    if (q.t > BURSTER.puddleLife) { f.puddles.splice(i, 1); continue }
    if (Math.hypot(q.x - p.x, q.y - p.y) < BURSTER.puddleR && Math.abs(q.z - p.z) < 0.5) onPuddle = true
  }
  if (onPuddle && !eng.over) {
    A.burn = Math.min(30, A.burn + BURSTER.puddleBurn * dt)
    A.puddleT -= dt
    if (A.puddleT <= 0) { eng.msg('脚下的酸液嘶嘶作响，鞋底在被腐蚀。', 'damage'); A.puddleT = 4 }
  }
  // 灼烧（持续伤害）与失明衰减
  if (A.burn > 0 && !eng.over) {
    const d = Math.min(A.burn, BURSTER.burnRate * dt)
    A.burn -= d
    if (!eng.dev.god) { p.hp -= d; if (p.hp <= 0) { eng.die('被爆酸者的酸液活活烧死'); return } }
  }
  A.blind = Math.max(0, A.blind - BURSTER.blindDecay * dt)
  A.msgT -= dt
  // 休克：低血量且大半失明 → 倒地；5 秒内没洗眼，爆酸者爬到身边就开始消化
  if (A.shockT <= 0 && !eng.over && p.hp <= BURSTER.shockHp && A.blind >= BURSTER.shockBlind && A.shockBy) {
    A.shockT = BURSTER.shockT
    audio.hurt()
    eng.msg('剧痛和黑暗一起压下来——你跪倒在地。（休克：5 秒内用清水或杏仁水洗眼，否则……）', 'damage')
  }
  if (A.shockT > 0) {
    A.shockT -= dt
    const by = m.entities.find((e) => e.id === A.shockBy && !e.dead)
    if (!by) { A.shockT = 0; A.shockBy = 0 }
    else if (A.shockT <= 0) {
      if (Math.hypot(by.x - p.x, by.y - p.y) <= BURSTER.digestR + 0.6) eng.die('昏迷中被爆酸者消化', true)
      else A.shockT = 0.5 // 它还没爬到：再撑一会儿
    }
  }
}

/** 一滴酸液打中玩家：脸部被护脸挡住一部分，其余造成伤害、灼烧和失明 */
function acidHitPlayer(eng: Engine, face: boolean, owner: number) {
  const A = bursterFrame(eng).acid, p = eng.player
  A.shockBy = owner
  let k = 1
  if (face) {
    const g = faceGuard(eng)
    if (g) {
      k = 1 - g.k
      const cur = g.slot.dur ?? BURSTER.guardMax
      g.slot.dur = Math.max(0, cur - BURSTER.guardWear)
      if (g.slot.dur <= 0) {
        p.equip.head = null
        eng.msg(`${ITEMS[g.slot.type]?.name ?? '护脸'}的镜片被酸液蚀穿，彻底报废了。`, 'damage')
      } else if (cur > 50 && g.slot.dur <= 50) eng.msg(`${ITEMS[g.slot.type]?.name ?? '护脸'}的镜片被酸液蚀得发白。（耐久 ${g.slot.dur}/${BURSTER.guardMax}）`, 'system')
    }
    A.blind = Math.min(1, A.blind + BURSTER.blindPerGlob * k)
  }
  A.burn = Math.min(30, A.burn + BURSTER.burnPerGlob * k)
  if (!eng.dev.god) p.hp -= BURSTER.hitDmg * k
  eng.camShake = Math.min(1, eng.camShake + 0.25)
  if (A.msgT <= 0) {
    A.msgT = 2.5
    audio.hurt()
    eng.emit({ kind: 'damage' })
    eng.msg(face ? (k < 1 ? '酸液糊在镜片上，嘶嘶冒烟——面罩挡下了大半。' : '酸液泼了你一脸——眼睛像被烙铁按住！（视野模糊，持续灼烧；用清水洗眼）') : '酸液溅在身上，衣服冒起白烟。', 'damage')
  }
  if (p.hp <= 0 && !eng.dev.god) eng.die('被爆酸者的酸液活活烧死')
}

/** 洗眼：在使用物品时调用。返回 true 表示这次使用被当作洗眼处理掉了 */
export function bursterWash(eng: Engine, type: string): boolean {
  const f = frames.get(eng)
  if (!f) return false
  const A = f.acid
  if (A.blind < 0.05 && A.shockT <= 0 && A.burn < 1) return false
  const gun = type === 'squirtgun' && (squirtActsAsWater(eng.squirtTank) || eng.squirtTank === 'almond') && eng.squirtAmmo > 0
  if (!gun && type !== 'citywater' && type !== 'almond') return false
  if (gun) { eng.squirtAmmo--; if (eng.squirtAmmo <= 0) eng.squirtTank = 'none' } else eng.consumeItem(type)
  const wasShock = A.shockT > 0
  A.blind = 0; A.burn = 0; A.shockT = 0; A.shockBy = 0
  audio.pickup()
  eng.msg(wasShock ? '你摸索着把水泼到脸上——酸液被冲开，你挣扎着重新站了起来。' : '你用水冲洗了眼睛和脸——灼烧感退了下去，视野重新清晰。', 'loot')
  return true
}
/** 休克倒地时锁住玩家移动 */
export function bursterControlsPlayer(eng: Engine): boolean { return (frames.get(eng)?.acid.shockT ?? 0) > 0 }
/** 渲染侧：失明程度 0..1、是否休克 */
export function bursterVision(eng: Engine) { const a = frames.has(eng)?bursterFrame(eng).acid:undefined; return { blind: a?.blind ?? 0, shock: (a?.shockT ?? 0) > 0, burn: a?.burn ?? 0 } }

// ======================= 实体 AI =======================
export function updateBurster(eng: Engine, e: Entity, dt: number, d: number) {
  const s = st(e), p = eng.player, A = bursterFrame(eng).acid
  s.t += dt
  s.speed = 0
  if(eng.dev.invisible){e.state='idle';return}
  const see = !eng.over && d < 9 && eng.los(e.x, e.y, p.x, p.y) && Math.abs(e.z - p.z) < 1.6
  const turn = (rate: number) => {
    let a = Math.atan2(p.y - e.y, p.x - e.x) - e.facing
    while (a > Math.PI) a -= Math.PI * 2
    while (a < -Math.PI) a += Math.PI * 2
    e.facing += Math.max(-rate * dt, Math.min(rate * dt, a))
  }
  if (e.stunT > 0) { e.stunT -= dt; e.state = 'stunned'; return } // 清水僵直：不动、不喷
  switch (s.phase) {
    case 'sleep':
      e.state = 'idle'
      if (see && d < BURSTER.wakeSight) { go(e, 'wake'); audio.aggro(); eng.msg('地上那团蜷缩的东西抽动了一下——它背上的胼胝正在鼓起来。', 'system') }
      break
    case 'wake':
      e.state = 'investigate'; turn(2.5)
      if (s.t >= BURSTER.wakeT) go(e, see && d < BURSTER.burstR ? 'burst' : 'wait')
      break
    case 'burst': {
      e.state = 'attack'; turn(s.t < BURSTER.fireFrom ? 2.2 : 0.6)
      const k = (s.t - BURSTER.fireFrom) / (BURSTER.fireTo - BURSTER.fireFrom)
      const want = Math.min(BURSTER.globs, Math.floor(Math.max(0, k) * BURSTER.globs + (k > 0 ? 1 : 0)))
      while (s.fired < want) { fireGlob(eng, e); s.fired++ }
      if (s.t >= BURSTER.burstT) {
        s.blisters = 0
        e.hp -= BURSTER.selfHurt // 自身的酸也会伤到自己
        if (e.hp <= e.def.hp * BURSTER.cocoonAt) startCocoon(eng, e, '酸液溅回了它自己身上——它的表皮开始发硬、发黄，蜷成一团。')
        else go(e, 'wait')
      }
      break
    }
    case 'wait':
      // 等受害者被酸烧倒；水泡回涨后，看得见就接着喷
      e.state = 'idle'; turn(1.2)
      s.blisters = Math.min(1, s.blisters + dt / BURSTER.regrowT)
      if (A.shockT > 0 && A.shockBy === e.id) { go(e, 'stalk'); break }
      if (s.t >= BURSTER.waitT && s.blisters >= 0.6) {
        if (see && d < BURSTER.burstR) go(e, 'burst')
        else if (see || s.lostT < BURSTER.lose) go(e, 'stalk')
      }
      s.lostT = see ? 0 : s.lostT + dt
      if (s.lostT > BURSTER.lose) go(e, 'sleep')
      break
    case 'stalk': {
      // 慢慢爬近；受害者休克时改为小跑过去消化
      const digest = A.shockT > 0 && A.shockBy === e.id
      s.blisters = Math.min(1, s.blisters + dt / BURSTER.regrowT)
      s.lostT = see ? 0 : s.lostT + dt
      if (s.lostT > BURSTER.lose) { go(e, 'sleep'); break }
      if (!digest && see && d < BURSTER.burstR * 0.85 && s.blisters >= 0.6) { go(e, 'burst'); break }
      if (digest && d < BURSTER.digestR) { e.state = 'attack'; turn(3); break }
      e.state = 'chase'
      e.targetX = p.x; e.targetY = p.y
      s.speed = digest ? BURSTER.rush : BURSTER.crawl
      const ox = e.x, oy = e.y
      eng.stepEntity(e, s.speed, dt)
      s.speed = Math.hypot(e.x - ox, e.y - oy) / Math.max(dt, 1e-4)
      break
    }
    case 'cocoon':
      e.state = 'idle'
      if (s.t >= BURSTER.cocoonT) go(e, 'shell')
      break
    case 'shell':
      e.state = 'idle'
      if (s.t >= BURSTER.hatchT) {
        go(e, 'hatch'); s.crack = 0
        e.hp = e.def.hp * (s.scar ? 0.4 : 0.6); s.blisters = 1
        if (d < 14) eng.msg('不远处传来硬壳裂开的声音。有什么东西从茧里爬了出来。', 'system')
      }
      break
    case 'hatch':
      e.state = 'investigate'
      if (s.t >= BURSTER.wakeT) go(e, 'wait')
      break
    case 'broken':
      break
  }
}

function fireGlob(eng: Engine, e: Entity) {
  const p = eng.player, f = bursterFrame(eng), s = st(e)
  if (s.fired === 0) { s.aimX = p.x; s.aimY = p.y; s.aimZ = headZ(eng) }
  // 从背部（约 1m 高）喷向受害者的脸，按飞行时间补偿重力
  const ox = e.x - Math.cos(e.facing) * 0.15, oy = e.y - Math.sin(e.facing) * 0.15, oz = e.z + 1.0
  const tz = s.aimZ
  const dist = Math.max(0.5, Math.hypot(s.aimX - ox, s.aimY - oy))
  const T = dist / BURSTER.globSpeed
  const a = Math.atan2(s.aimY - oy, s.aimX - ox) + (Math.random() - 0.5) * 2 * BURSTER.globSpread
  const pitch = (Math.random() - 0.5) * BURSTER.globSpread * 6
  f.globs.push({ x: ox, y: oy, z: oz, vx: Math.cos(a) * BURSTER.globSpeed, vy: Math.sin(a) * BURSTER.globSpeed, vz: (tz - oz) / T + 0.5 * BURSTER.gravity * T + pitch, t: 0, owner: e.id, band: bandOfZ(e.z) })
  if (s.fired === 0) { audio.hit(); eng.noiseEvent(e.x, e.y, 6, false) }
}

function startCocoon(eng: Engine, e: Entity, text: string) {
  const s = st(e)
  if (s.phase === 'cocoon' || s.phase === 'shell' || s.phase === 'broken') return
  e.hp = Math.max(1, e.hp)
  go(e, 'cocoon'); s.crack = 0
  eng.msg(text, 'system')
}

// ======================= 与战斗系统的接口 =======================
/** killCheck 前调用：没破茧之前它不会死，血量见底只会结茧。返回 true 时阻止通用死亡 */
export function bursterKillGuard(eng: Engine, e: Entity): boolean {
  const s = st(e)
  if (s.phase === 'broken') return false
  if (e.hp <= e.def.hp * BURSTER.cocoonAt) { startCocoon(eng, e, '它尖叫着缩成一团，表皮迅速硬化——它把自己封进了茧里。'); if (e.hp <= 0) e.hp = 1 }
  return e.hp > 0
}

/**
 * 近战命中。heavy=蓄力重击。返回 true 表示已经处理完，通用结算跳过。
 * - 休眠或惊醒时挨打：立刻起身，近距离爆一轮
 * - 醒着时打它：正常扣血，但有 40% 概率把背上的水泡打爆，酸液溅回自己身上
 * - 结茧中：普攻弹开；重击按伤害累计裂纹，破茧即死
 */
export function bursterMelee(eng: Engine, e: Entity, dmg: number, heavy: boolean): boolean {
  const s = st(e)
  if (s.phase === 'broken') return true
  if (s.phase === 'cocoon' || s.phase === 'shell') {
    if (!heavy) {
      audio.hit()
      const f = bursterFrame(eng)
      if (eng.time - f.shellMsg > 3) { eng.msg('武器被茧壳弹开了——它硬得像石头。（要用蓄力重击才能打碎）', 'system'); f.shellMsg = eng.time }
      return true
    }
    s.crack = Math.min(1, s.crack + Math.max(0.25, Math.min(0.5, dmg / 60)))
    eng.camShake = Math.min(1, eng.camShake + 0.35)
    audio.hit()
    if (s.crack >= 1) breakCocoon(eng, e)
    else eng.msg(s.crack < 0.5 ? '重击砸在茧上，壳面裂开了一道缝。' : '茧壳碎裂成了蛛网状，里面的东西在抽搐。', 'system')
    return true
  }
  if (s.phase === 'sleep' || s.phase === 'wake') {
    go(e, 'burst'); s.t = BURSTER.fireFrom - 0.25 // 被打醒：几乎没有前摇
    eng.msg('你惊醒了它——它背上的胼胝瞬间鼓胀！', 'damage')
  }
  e.hp -= dmg
  e.stunT = Math.max(e.stunT, heavy ? 0.5 : 0.25)
  eng.bloodParticles(e.x, e.y)
  if (s.blisters > 0.4 && Math.random() < BURSTER.splashChance) {
    s.blisters = Math.max(0, s.blisters - 0.35)
    acidHitPlayer(eng, Math.random() < 0.3, e.id) // 近身打爆水泡：溅到身上，偶尔溅到脸上
  }
  if (e.hp <= 0 || e.hp <= e.def.hp * BURSTER.cocoonAt) bursterKillGuard(eng, e)
  return true
}

function breakCocoon(eng: Engine, e: Entity) {
  const s = st(e), m = eng.map!
  s.phase = 'broken'; s.t = 0; s.crack = 1
  e.hp = 0; e.dead = true; e.deathT = 4
  eng.player.kills++
  audio.aggro()
  eng.msg('茧壳轰然碎裂，里面的爆酸者流出一摊冒泡的黄水，不再动了。', 'loot')
  const item = { id: Math.random(), type: 'acidcallus', x: e.x + 0.2, y: e.y + 0.2,z:e.z }
  m.items.push(item)
  const inf = m.inf
  if (inf) inf.chunks.get(`${Math.floor((item.x + inf.ox) / 32)},${Math.floor((item.y + inf.oy) / 32)}`)?.items.push(item)
  eng.msg('碎壳里留下一块还在渗酸的胼胝。', 'loot')
}

/** 滋水枪命中。返回 true 表示已处理（通用逻辑跳过） */
export function bursterSquirt(eng: Engine, e: Entity, tank: string): boolean {
  const s = st(e)
  if (s.phase === 'broken') return true
  if (s.phase === 'cocoon' || s.phase === 'shell') { eng.msg('水顺着茧壳流了下去，发出轻微的嘶嘶声。', 'system'); return true }
  if (tank === 'water') {
    // 酸遇水剧烈反应：僵直，正在鼓胀的那一轮作废
    e.stunT = Math.max(e.stunT, BURSTER.waterStun)
    if (s.phase === 'burst' && s.t < BURSTER.fireFrom) { go(e, 'wait'); s.blisters = 0.2 }
    else s.blisters = Math.max(0, s.blisters - 0.3)
    e.hp -= 4
    if (s.phase === 'sleep') go(e, 'wake')
    eng.msg('清水泼上它背上的胼胝，泛起大片黄色泡沫——它抽搐着僵住了。', 'system')
  } else if (tank === 'almond') {
    e.hp -= BURSTER.almondDmg; s.scar = true
    e.stunT = Math.max(e.stunT, 2)
    if (s.phase === 'burst') go(e, 'wait')
    eng.msg('杏仁水泼到它身上，皮肤像被泼了沸油一样起泡溃烂——它发出了刺耳的尖叫！', 'damage')
  } else if (tank === 'acid') {
    eng.msg('它的胼胝把酸液吸了进去，背上的水泡反而胀大了一圈——对它没用。', 'system')
    s.blisters = Math.min(1, s.blisters + 0.2)
    if (s.phase === 'sleep') go(e, 'wake')
  } else {
    e.hp -= tank === 'liquidpain' ? 60 : tank === 'cashew' ? 20 : 8
    e.stunT = Math.max(e.stunT, 0.4)
    eng.msg('水线打在它身上，它往后缩了缩。', 'system')
  }
  eng.provoked = true
  if (e.hp <= e.def.hp * BURSTER.cocoonAt) bursterKillGuard(eng, e)
  return true
}

/** 滋水枪酸液命中实体：开始（或刷新）持续腐蚀。爆酸者不受影响（bursterSquirt 先处理） */
export function acidBurnEntity(eng: Engine, e: Entity) {
  if (isBurster(e)) return
  bursterFrame(eng).burns.set(e, BURSTER.acidDotT)
}
/** 滋水枪自饮酸液：重创，酸液还会呛进眼睛 */
export function acidDrink(eng: Engine) {
  const p = eng.player, A = bursterFrame(eng).acid
  p.hp = Math.max(1, p.hp - 25)
  p.sanity = Math.max(0, p.sanity - 20)
  A.burn = Math.min(30, A.burn + 6)
  A.blind = Math.min(1, A.blind + 0.4)
  eng.msg('你就着储罐喝了一口爆酸者的酸液——嘴里像含了一口火炭，呛出来的酸雾糊住了眼睛。（生命 -25 · 理智 -20 · 持续灼烧）', 'damage')
}

/** 噪声：近距离的响动会把它吵醒 */
export function bursterHear(e: Entity, x: number, y: number, radius: number) {
  const s = st(e)
  if (s.phase !== 'sleep') return
  const d = Math.hypot(e.x - x, e.y - y)
  if (d < Math.min(radius, BURSTER.wakeNoise)) go(e, 'wake')
}
