// v64：肢团（Entity 5）专属 AI——只依据中文维基 Entity 5 主版本（https://backrooms-wiki-cn.wikidot.com/entity-5）
// 与 Level 3 条目「高智能实体·肢团」段落（https://backrooms-wiki-cn.wikidot.com/latest:level-3）：
//  · 饥饿游荡：一直处于饥饿状态，在层级中游荡寻找猎物；感知以听觉为主，视距极短（3m）。
//  · 甩肢于地：把肢体甩向地板来移动——静止起步很慢，一旦起势就爆发出极高的速度；移动时发出「多人奔跑」的脚步声（预警）。
//    普通个体的手臂彼此混乱无序：跑动中会周期性地缠成一团、骤然失速，这是逃离的窗口。
//  · 抓取：与猎物距离缩短到 8 英尺（2.4m）内，蓄力后甩出最长的主臂（8–10 英尺）抓住猎物，拖向中心并露出满是利齿的嘴吞食。
//    玩家连按（跳跃/攻击/交互）可以挣脱；挣脱失败只造成重伤（血量至少留 1）、减速，然后被吐出来——不会致死。
//  · 绝食：部分个体（普通层 40%，L3 0%）如果不被挑衅，会无视路过的流浪者；被攻击、近距离撞上或贴身奔跑会转为敌对。
//  · L3 子变种（chunk 标记 l3clump）：体型更大更壮；肢体协调，没有混乱期，更快、更敏捷、更难甩掉；嗜血。
//    持砖块/石器近战，被缴械后自残露出骨刺当武器；约 5% 个体持装腰果水的滋水枪（散布大、命中率低）。
//    追击时贴着同一条走廊的天花板移动，再从头顶俯扑下来（不做跨层寻路）。闲时偶尔做引体向上。
//  · 不做：休眠埋地、受伤爆裂繁殖、怕墙壁面具（用户确认只用主版本的核心机制）。
// 运行时状态挂在 e.cl（不入存档/联机），与猎犬 e.hd、钝人 e.dl 同一范式。
import { audio } from '../core/audio'
import type { Entity } from '../entities'
import type { Engine } from '../engine'
import { canOccupy } from '../core/player'
import { bandOfPlayerZ, ceilingHeightAt } from '../world/mapgen'
import { WALL_H } from '../renderer/shared'

/** 关键规则常量（验收脚本 check:clumps 直接读取） */
export const CLUMP = {
  SIGHT: 3, // 视距（米）——感知以听觉为主
  GRAB_RANGE: 2.4, // 8 英尺：进入此距离开始蓄力
  ARM_REACH: 3.0, // 主臂完全伸展 ≈ 10 英尺：蓄力结束时玩家仍在此距离内才抓得到
  WINDUP: 0.62, WINDUP_L3: 0.38, // 蓄力时长（秒）
  GRAB_TIME: 3.2, GRAB_TIME_L3: 2.6, // 拖向中心直到张嘴吞食的时长
  MASH: 7, MASH_L3: 10, // 挣脱所需连按次数（每次命中它 +2）
  DEVOUR_HP_LEFT: 8, // 被吞食后血量上限（且至少留 1）
  DEVOUR_SLOW: 4.5, // 被吐出后的减速时长（秒）
  SATED_T: 30, // 吞食后饱足、无视玩家的时长
  FASTING_CHANCE: 0.4, FASTING_CHANCE_L3: 0,
  L3_SCALE: 1.5, // L3 个体体型（完全伸展约 8 英尺）
  SQUIRT_CHANCE: 0.05, // L3 个体持滋水枪比例
  SQUIRT_RANGE: 8, SQUIRT_CD: 2.4,
  SQUIRT_SPREAD: 0.38, // 枪口散布（弧度，均匀 ±）
  SQUIRT_HALF_W: 0.42, // 水线横向偏差小于此值才算命中（米）
  SQUIRT_SANITY: 10, SQUIRT_THIRST: 5, // 腰果水命中：理智 -10（同滋水枪自饮腰果水），口渴 -5；不扣血
  DISARM_CHANCE: 0.35,
} as const

export type ClumpPhase = 'roam' | 'hunt' | 'windup' | 'grab' | 'devour' | 'recoil' | 'sated' | 'fasting' | 'pounce' | 'selfharm' | 'pullup'
export type ClumpWeapon = 'none' | 'brick' | 'stone' | 'squirt' | 'bone'
export interface ClumpState {
  l3: boolean
  fasting: boolean // 绝食个体（未被挑衅）
  phase: ClumpPhase
  t: number
  momentum: number // 0..1 甩肢起势
  want: number // 上一帧目标方位（用于转向损失）
  chaos: number // 普通个体「肢体缠成一团」剩余时长
  chaosCd: number
  lastX: number; lastY: number // 最后听见/看见的位置（世界坐标）
  heardT: number // 距最后一次感知的时间
  lastHp: number
  mash: number; mashNeed: number
  inJ: boolean; inA: boolean; inI: boolean // 上一帧按键（边沿计数）
  weapon: ClumpWeapon
  squirtCd: number
  onCeil: boolean; ceilCd: number; ceilLostT: number
  stepT: number
  swingT?: number
  speed: number // 本帧移动速度（米/秒；渲染步态用）
  // 渲染姿态量 0..1
  arm: number; armLen: number; wind: number; mouth: number; chew: number; sit: number; ceil: number
  gait: number; tangle: number; shot: number; harm: number; pull: number; lunge: number
}

/** 确定性哈希（按实体 id 决定绝食/武器，召唤与 chunk 生成一致） */
export function clumpHash(n: number, salt: number) {
  let x = Math.imul((n | 0) ^ salt, 0x9e3779b1); x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16
  return (x >>> 0) / 4294967296
}
export function clumpWeaponFor(id: number, l3: boolean): ClumpWeapon {
  if (!l3) return 'none'
  if (clumpHash(id, 0x5a17) < CLUMP.SQUIRT_CHANCE) return 'squirt'
  return clumpHash(id, 0xb71c) < 0.5 ? 'brick' : 'stone'
}
export function clumpFastingFor(id: number, l3: boolean) { return clumpHash(id, 0xfa57) < (l3 ? CLUMP.FASTING_CHANCE_L3 : CLUMP.FASTING_CHANCE) }
/** 滋水枪一次射击：按散布随机出枪口偏角，水线在玩家处的横向偏差小于半宽才算命中 */
export function rollSquirt(d: number, r = Math.random()): boolean {
  const err = (r - 0.5) * 2 * CLUMP.SQUIRT_SPREAD
  return Math.max(0.5, d) * Math.abs(Math.sin(err)) < CLUMP.SQUIRT_HALF_W
}

const newFrame = (map: Engine['map']) => ({ map, px: 0, py: 0, speed: 0, init: false, told: new Set<string>(), captor: undefined as Entity | undefined })
const frames = new WeakMap<Engine, ReturnType<typeof newFrame>>()
function frameFor(eng: Engine) {
  let f = frames.get(eng)
  if (!f || f.map !== eng.map) { f = newFrame(eng.map); frames.set(eng, f) }
  return f
}
const origin = (eng: Engine) => [eng.map?.inf?.ox ?? 0, eng.map?.inf?.oy ?? 0] as const
export function beginClumpFrame(eng: Engine, dt: number) {
  const F = frameFor(eng), [ox, oy] = origin(eng), p = eng.player
  const x = p.x + ox, y = p.y + oy
  if (!F.init || dt <= 0) { F.px = x; F.py = y; F.init = true }
  const sp = dt > 0 ? Math.hypot(x - F.px, y - F.py) / dt : 0
  F.speed = F.speed * 0.7 + Math.min(12, sp) * 0.3
  F.px = x; F.py = y
}
const once = (eng: Engine, key: string, text: string, kind: 'system' | 'damage' = 'system') => { const F = frameFor(eng); if (!F.told.has(key)) { F.told.add(key); eng.msg(text, kind) } }
const setPhase = (s: ClumpState, ph: ClumpPhase) => { if (s.phase !== ph) { s.phase = ph; s.t = 0 } }

export function initClump(eng: Engine, e: Entity): ClumpState {
  const [ox, oy] = origin(eng)
  const l3 = !!e.def.l3clump
  const fasting = !e.provoked && (e.def.clumpFasting ?? clumpFastingFor(e.id, l3))
  if (l3 && !e.def.l3Tuned) { // 更大更壮：生命 ×1.5、伤害 +4（只调一次）
    const full = e.hp >= e.def.hp
    e.def = { ...e.def, name: '高智能肢团', hp: Math.round(e.def.hp * 1.5), damage: e.def.damage + 4, l3Tuned: true }
    if (full) e.hp = e.def.hp
  }
  const s: ClumpState = {
    l3, fasting, phase: fasting ? 'fasting' : 'roam', t: 0, momentum: 0, want: e.facing, chaos: 0, chaosCd: 2 + clumpHash(e.id, 3) * 2,
    lastX: e.x + ox, lastY: e.y + oy, heardT: 99, lastHp: e.hp, mash: 0, mashNeed: l3 ? CLUMP.MASH_L3 : CLUMP.MASH,
    inJ: false, inA: false, inI: false, weapon: l3 ? (e.def.clumpWeapon ?? clumpWeaponFor(e.id, l3)) : clumpWeaponFor(e.id, l3), squirtCd: 1, onCeil: false, ceilCd: 0, ceilLostT: 0, stepT: 0, speed: 0,
    arm: 0, armLen: 1, wind: 0, mouth: 0, chew: 0, sit: fasting ? 1 : 0, ceil: 0, gait: clumpHash(e.id, 9) * 10, tangle: 0, shot: 0, harm: 0, pull: 0, lunge: 0,
  }
  e.cl = s
  return s
}

/** 玩家（可站立）判定：模拟地图无 tiles 时只看瓦片可走 */
function standable(eng: Engine, x: number, y: number, z = eng.player.z): boolean {
  const m = eng.map!, p = eng.player
  const band = m.tiles ? bandOfPlayerZ(m, z) : 0
  const h = eng.entityWalkH(m, Math.floor(x), Math.floor(y), band)
  if (h === null || Math.abs(h - z) > 0.4) return false
  return !m.tiles || (m.elev[Math.floor(y) * m.w + Math.floor(x)] !== 4 && canOccupy(m, x, y, undefined, { z, band, crouch: p.crouching }))
}
/** 非致命伤害：最多扣到 1 血（hurtPlayer 只会再乘 ≤1 的系数） */
function hurtNonLethal(eng: Engine, dmg: number, src: string) {
  const d = Math.min(dmg, Math.max(0, eng.player.hp - 1))
  if (d > 0.01) eng.hurtPlayer(d, src)
}

function provoke(eng: Engine, e: Entity, s: ClumpState, d: number, why: string) {
  const [ox, oy] = origin(eng)
  e.provoked = true
  const was = s.fasting || s.phase === 'sated'
  s.fasting = false
  s.lastX = eng.player.x + ox; s.lastY = eng.player.y + oy; s.heardT = 0
  if (s.phase !== 'grab' && s.phase !== 'devour' && s.phase !== 'windup' && s.phase !== 'selfharm') setPhase(s, 'hunt')
  if (was && d < 16) eng.msg(why, 'damage')
}

/** noiseEvent 钩子：只按「响度半径」听觉；奔跑声额外按 hearing 放大 */
export function clumpHear(eng: Engine, e: Entity, x: number, y: number, radius: number, sprint: boolean) {
  const s = e.cl ?? initClump(eng, e)
  const r = (sprint ? Math.max(radius, e.def.hearing) : radius) * (s.l3 ? 1.25 : 1) // L3 嗜血：听得更远
  if (Math.hypot(e.x - x, e.y - y) >= r) return
  if (s.fasting || s.phase === 'sated' || s.phase === 'grab' || s.phase === 'devour' || s.phase === 'windup') return
  const [ox, oy] = origin(eng)
  s.lastX = x + ox; s.lastY = y + oy; s.heardT = 0
  if (s.phase === 'roam' || s.phase === 'pullup') setPhase(s, 'hunt')
}

/** 释放被抓住的玩家（挣脱/吐出/肢团死亡）；把玩家放回可站立处 */
export function releaseClumpPlayer(eng: Engine, e = frameFor(eng).captor, how: 'escape' | 'spit' | 'drop' = 'drop') {
  const F = frameFor(eng)
  if (!e || F.captor !== e) return
  F.captor = undefined
  const s = e.cl, p = eng.player
  if (!s) return
  const d = Math.max(0.05, Math.hypot(p.x - e.x, p.y - e.y))
  const ux = (p.x - e.x) / d, uy = (p.y - e.y) / d
  for (const r of [how === 'spit' ? 1.0 : 0.85, 0.7, 0.55]) {
    const x = e.x + ux * r * (e.def.scale ?? 1), y = e.y + uy * r * (e.def.scale ?? 1)
    if (standable(eng, x, y)) { p.x = x; p.y = y; break }
  }
  if (how === 'escape') { setPhase(s, 'recoil'); e.attackCd = 3; s.momentum = 0 }
  else if (how === 'spit') { setPhase(s, 'sated') }
  else if (s.phase === 'grab' || s.phase === 'devour') setPhase(s, 'recoil')
}

/** movement 钩子：被抓住时肢团接管玩家位置（返回 true 跳过本帧移动），并在这里统计连按（逐帧，不受实体硬直影响） */
export function clumpControlsPlayer(eng: Engine): boolean {
  const F = frameFor(eng), e = F.captor, s = e?.cl
  if (!e || !s) return false
  const p = eng.player
  if (e.dead || !eng.map?.entities.includes(e) || eng.dev.frozenAI || eng.dev.invisible || p.hp <= 0 || Math.abs(p.z - e.z) > 1 || (s.phase !== 'grab' && s.phase !== 'devour')) {
    releaseClumpPlayer(eng, e); return false
  }
  if (s.phase === 'grab') {
    const j = !!eng.input.jump, a = !!eng.input.attack, i = !!eng.input.interact
    if (j && !s.inJ) s.mash++
    if (a && !s.inA) s.mash++
    if (i && !s.inI) s.mash++
    s.inJ = j; s.inA = a; s.inI = i
  }
  p.vz = 0
  return true
}
function headroom(eng: Engine, e: Entity) {
  if (!eng.map?.tiles) return 3 // Lightweight behavior fixtures.
  const band = bandOfPlayerZ(eng.map, e.z, e.x, e.y)
  return ceilingHeightAt(eng.map, e.x, e.y, WALL_H[eng.levelDef.gen] ?? 3, band) - e.z
}
export function clumpCaptor(eng: Engine) { return frameFor(eng).captor }

export function updateClump(eng: Engine, e: Entity, dt: number, d: number, dmgMult: number) {
  const F = frameFor(eng)
  const p = eng.player, def = e.def
  const [ox, oy] = origin(eng)
  const s = e.cl ?? initClump(eng, e)
  const l3 = s.l3, sc = def.scale ?? 1
  s.t += dt; s.heardT += dt; s.squirtCd -= dt; s.ceilCd -= dt; s.chaosCd -= dt; s.chaos = Math.max(0, s.chaos - dt)
  const hurt = e.hp < s.lastHp
  s.lastHp = e.hp
  const invis = !!eng.dev.invisible
  const zOk = Math.abs(e.z - p.z) < 1.4
  const los = !invis && zOk && d < 14 && eng.los(e.x, e.y, p.x, p.y)
  const sees = los && d < CLUMP.SIGHT * (s.onCeil ? 1.2 : 1)
  const running = !!eng.input.sprint && F.speed > 4.2
  let speed = 0, tx = e.x, ty = e.y, face: [number, number] | null = null

  // A ceiling pose requires actual architecture, including when walking out from under a roof.
  const hasRoof = !l3 || Number.isFinite(headroom(eng, e))
  if (!hasRoof) { s.onCeil = false; if (s.phase === 'pullup') setPhase(s, 'roam') }

  // ---------- 受击：挑衅、L3 缴械 ----------
  if (hurt) {
    if (s.phase === 'grab') s.mash += 2 // 反击也算挣扎
    if (s.phase === 'sated' || s.fasting || s.phase === 'roam' || s.phase === 'pullup') provoke(eng, e, s, d, s.fasting ? '你惊扰了一只绝食的肢团——它的肢体猛地全部绷紧，朝你转了过来。' : '肢团被激怒了。')
    if (l3 && (s.weapon === 'brick' || s.weapon === 'stone' || s.weapon === 'squirt') && Math.random() < CLUMP.DISARM_CHANCE && s.phase !== 'grab' && s.phase !== 'devour') {
      const lost = s.weapon === 'brick' ? '砖块' : s.weapon === 'stone' ? '石器' : '滋水枪'
      s.weapon = 'none'; setPhase(s, 'selfharm')
      if (d < 16) eng.msg(`你打掉了肢团手里的${lost}——它立刻用另几只手撕开自己的小臂，掰出一截尖利的骨刺。`, 'damage')
    }
  }
  // ---------- 绝食个体：不受挑衅时无视路过的流浪者 ----------
  if (s.fasting) {
    if (!invis && zOk && (d < 1.25 || (running && d < 3.2 && los))) provoke(eng, e, s, d, d < 1.25 ? '你撞上了一只静坐的肢团——它不再绝食了。' : '你在它身边狂奔——绝食的肢团被惊醒，十几只手同时撑起了地面。')
    else if (los && d < 5) once(eng, 'cfast', '一只肢团静静蹲在角落里，肢体收拢、一动不动，对你毫无反应。它似乎在绝食——别惊扰它。')
  }
  // ---------- 感知（饥饿个体） ----------
  if (!s.fasting && s.phase !== 'sated' && sees) { s.lastX = p.x + ox; s.lastY = p.y + oy; s.heardT = 0 }
  if (!s.fasting && sees && (s.phase === 'roam' || s.phase === 'pullup')) setPhase(s, 'hunt')

  let moving = false
  switch (s.phase) {
    case 'fasting': {
      e.state = 'idle'
      if (!s.fasting) { setPhase(s, 'hunt'); break }
      // 偶尔挪动一点位置，大部分时间静坐
      if (e.stateT <= 0) {
        if (clumpHash(e.id, Math.floor(s.t)) < 0.25) eng.wanderTarget(e)
        else { e.targetX = e.x; e.targetY = e.y }
        e.stateT = 6
      }
      tx = e.targetX; ty = e.targetY; speed = Math.hypot(tx - e.x, ty - e.y) > 0.4 ? def.speed * 0.18 : 0
      break
    }
    case 'roam': case 'sated': {
      e.state = 'wander'
      if (s.phase === 'sated' && s.t > CLUMP.SATED_T) { setPhase(s, 'roam'); break }
      if (e.stateT <= 0 || Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.4) {
        // L3 闲时：偶尔停下来做引体向上（氛围演出）
        if (l3 && hasRoof && s.phase === 'roam' && clumpHash(e.id, Math.floor(s.t * 3)) < 0.12) { setPhase(s, 'pullup'); break }
        eng.wanderTarget(e)
      }
      tx = e.targetX; ty = e.targetY; moving = true
      break
    }
    case 'pullup': {
      e.state = 'idle'
      if (s.t > 5) { setPhase(s, 'roam'); eng.wanderTarget(e) }
      break
    }
    case 'hunt': {
      e.state = 'chase'
      // L3 更难甩掉：最近 4s 内听见/看见过，就直接追踪玩家本人；普通个体只扑向最后听见的声音点
      const track = sees || (l3 && s.heardT < 4 && d < 12 && zOk)
      tx = track ? p.x : s.lastX - ox; ty = track ? p.y : s.lastY - oy
      moving = true; face = track ? [p.x, p.y] : null
      const reached = Math.hypot(tx - e.x, ty - e.y) < 0.6
      if (!sees && (s.heardT > (l3 ? 10 : 5) || (reached && s.heardT > (l3 ? 4 : 1.5)))) { setPhase(s, 'roam'); s.onCeil = false; s.momentum *= 0.3; eng.wanderTarget(e); break }
      if (d < 18) once(eng, 'crun', '走廊里响起一阵杂乱的脚步声，像好几个人在同时奔跑——那是肢团在甩动肢体。退开，保持安静。', 'damage')
      // L3：贴着同一条走廊的天花板移动，接近后从头顶俯扑
      if (l3) {
        // 持枪个体留在地面射击，不爬天花板
        if (hasRoof && !s.onCeil && s.weapon !== 'squirt' && s.ceilCd <= 0 && los && d > 3.2 && d < 11) { s.onCeil = true; s.ceilLostT = 0; once(eng, 'cceil', '那团肢体顺着墙爬上了天花板，倒挂着朝你荡过来！', 'damage') }
        if (s.onCeil) {
          s.ceilLostT = los ? 0 : s.ceilLostT + dt
          if (s.ceilLostT > 3) { s.onCeil = false; s.ceilCd = 3 }
          else if (los && d < 2.6 && eng.meleeZOk(e)) { setPhase(s, 'pounce'); break }
        }
      }
      // L3 武器：近身挥砸；滋水枪远程喷射
      if (l3 && !s.onCeil && s.swingT === undefined && (s.weapon === 'brick' || s.weapon === 'stone' || s.weapon === 'bone') && los && d < 1.5 && e.attackCd <= 0 && eng.meleeZOk(e)) {
        e.attackCd = 1.3; e.lungeT = 0.32; s.swingT = 0.32
      }
      if (l3 && !s.onCeil && s.weapon === 'squirt' && los && d > 1.6 && d < CLUMP.SQUIRT_RANGE && (sees || s.heardT < 1.5) && s.squirtCd <= 0) {
        s.squirtCd = CLUMP.SQUIRT_CD; s.shot = 1
        fireSquirt(eng, e, d)
      }
      // 抓取：8 英尺内蓄力甩出主臂
      if (!s.onCeil && s.swingT === undefined && sees && d < CLUMP.GRAB_RANGE && e.attackCd <= 0 && eng.meleeZOk(e) && !F.captor) {
        setPhase(s, 'windup'); s.momentum = 0
        once(eng, 'cwind', '肢团猛地刹住，一条长得不成比例的手臂在团块里一圈圈收紧——它要甩出来了！', 'damage')
      }
      break
    }
    case 'windup': {
      e.state = 'attack'; face = [p.x, p.y]
      s.armLen = d
      if (!los || !zOk || invis || F.captor) { setPhase(s, 'hunt'); e.attackCd = 1; break }
      if (s.t >= (l3 ? CLUMP.WINDUP_L3 : CLUMP.WINDUP)) {
        if (d <= CLUMP.ARM_REACH && eng.meleeZOk(e) && !F.captor) {
          setPhase(s, 'grab'); F.captor = e; s.mash = 0
          s.inJ = !!eng.input.jump; s.inA = !!eng.input.attack; s.inI = !!eng.input.interact // 抓住瞬间按着的键不算一次
          hurtNonLethal(eng, def.damage * 0.3 * dmgMult, def.name)
          eng.camShake = Math.min(1, (eng.camShake ?? 0) + 0.7)
          eng.msg('最长的那条手臂甩过来缠住了你，把你往团块中央拖！连按 跳跃/攻击/交互 挣脱！', 'damage')
        } else { setPhase(s, 'hunt'); e.attackCd = 1.4; once(eng, 'cmiss', '主臂「啪」地抽在你刚才站的地方——差一点。') }
      }
      break
    }
    case 'grab': {
      e.state = 'attack'; face = [p.x, p.y]
      if (F.captor !== e) { setPhase(s, 'recoil'); break }
      // 拖向中心（每步校验可站立）
      const want = 0.62 * sc
      if (d > want) {
        const ux = (e.x - p.x) / d, uy = (e.y - p.y) / d, step = Math.min(d - want, (l3 ? 2.3 : 1.7) * dt)
        const nx = p.x + ux * step, ny = p.y + uy * step
        if (standable(eng, nx, ny)) { p.x = nx; p.y = ny }
      }
      p.slowT = Math.max(p.slowT ?? 0, 0.3)
      s.armLen = Math.max(0.6, d)
      if (s.mash >= s.mashNeed) {
        releaseClumpPlayer(eng, e, 'escape')
        eng.msg('你拼命挣开了那条手臂，连滚带爬地退了出来！', 'system')
        break
      }
      if (s.t >= (l3 ? CLUMP.GRAB_TIME_L3 : CLUMP.GRAB_TIME)) {
        setPhase(s, 'devour')
        const left = Math.max(1, Math.min(p.hp - 30, CLUMP.DEVOUR_HP_LEFT))
        hurtNonLethal(eng, p.hp - left, def.name)
        p.slowT = Math.max(p.slowT ?? 0, CLUMP.DEVOUR_SLOW)
        p.stamina = 0
        p.sanity = Math.max(0, p.sanity - 12)
        eng.camShake = 1
        eng.msg('团块中央裂开一张满是利齿的嘴，把你半个身子吞了进去——', 'damage')
        audio.clumpChew(1)
      }
      break
    }
    case 'devour': {
      e.state = 'attack'; face = [p.x, p.y]
      s.chew += dt
      if (s.chew > 0.32) { s.chew = 0; audio.clumpChew(0.7) }
      p.slowT = Math.max(p.slowT ?? 0, CLUMP.DEVOUR_SLOW)
      if (s.t > 1.3) {
        releaseClumpPlayer(eng, e, 'spit')
        eng.msg('……它嚼了几下，又把你吐了出来。你还活着，但伤得很重，腿软得几乎站不住。', 'damage')
      }
      break
    }
    case 'recoil': {
      e.state = 'stunned'
      if (s.t > 1.2) setPhase(s, s.fasting ? 'fasting' : 'hunt')
      break
    }
    case 'pounce': {
      e.state = 'attack'; face = [p.x, p.y]
      tx = p.x; ty = p.y; speed = 4.2
      if (s.t > 0.45) {
        s.onCeil = false; s.ceilCd = 6
        if (!invis && d < 1.6 && eng.meleeZOk(e)) {
          eng.hurtPlayer(def.damage * 0.8 * dmgMult, def.name)
          p.slowT = Math.max(p.slowT ?? 0, 1.2)
          eng.camShake = Math.min(1, (eng.camShake ?? 0) + 0.8)
          eng.msg('它从天花板上直直砸了下来，十几只手把你按倒在地！', 'damage')
        }
        e.attackCd = 0.7; setPhase(s, 'hunt')
      }
      break
    }
    case 'selfharm': {
      e.state = 'stunned'
      if (s.t < 0.1 && e.hp > 4) { e.hp -= 3; s.lastHp = e.hp; eng.bloodParticles(e.x, e.y) }
      if (s.t > 1.1) { s.weapon = 'bone'; setPhase(s, 'hunt') }
      break
    }
  }

  // 武器挥砸结算
  if (s.swingT !== undefined) {
    s.swingT -= dt; face = [p.x, p.y]
    if (s.swingT <= 0) {
      s.swingT = undefined
      if (!invis && d < 1.9 && los && eng.meleeZOk(e)) {
        const k = s.weapon === 'stone' ? 1.15 : s.weapon === 'bone' ? 1.3 : 1
        eng.hurtPlayer(def.damage * k * dmgMult, def.name)
        eng.camShake = Math.min(1, (eng.camShake ?? 0) + 0.5)
      }
    }
  }

  // ---------- 甩肢移动：静止起步慢，起势后爆发 ----------
  if (moving) {
    const want = Math.atan2(ty - e.y, tx - e.x)
    let turn = Math.abs(want - s.want); if (turn > Math.PI) turn = Math.PI * 2 - turn
    s.want = want
    const hunting = s.phase === 'hunt'
    const cap = hunting ? 1 : 0.35
    const gain = l3 ? 1.7 : 0.75
    s.momentum = Math.min(cap, s.momentum + gain * dt) * (1 - Math.min(0.9, turn * (l3 ? 0.25 : 1.1)))
    // 普通个体：跑动中肢体周期性缠成一团（混乱期）——骤然失速，这是逃离的窗口；L3 个体肢体协调，没有这个弱点
    if (!l3 && hunting && s.momentum > 0.55 && s.chaosCd <= 0) {
      s.chaos = 0.75; s.chaosCd = 2.2 + Math.random() * 1.6
      if (d < 12) once(eng, 'cchaos', '它的肢体突然缠成一团，原地打了个趔趄——趁现在拉开距离！')
    }
    if (s.chaos > 0) s.momentum = Math.min(s.momentum, 0.12)
    const peak = l3 ? 1.6 : 1.25
    speed = def.speed * (hunting ? 0.22 + peak * Math.pow(s.momentum, 1.5) : 0.3 + 0.3 * s.momentum) * (s.onCeil ? 1.05 : 1)
  } else if (speed === 0) s.momentum = Math.max(0, s.momentum - dt * 2)

  if (speed > 0) {
    e.targetX = tx; e.targetY = ty
    const stuck = eng.stepEntity(e, speed, dt)
    if (stuck && (s.phase === 'roam' || s.phase === 'sated')) eng.wanderTarget(e)
    if (stuck && s.phase === 'hunt') s.momentum *= 0.5
    e.animT += dt * speed
  }
  if (face) eng.faceToward(e, face[0], face[1], dt, l3 ? 10 : 6)
  else if (speed > 0) eng.faceToward(e, tx, ty, dt, l3 ? 9 : 5)
  s.speed = speed

  // 「多人奔跑」脚步声：速度越快越密
  if (speed > 1.1 && d < 20 && !s.onCeil) {
    s.stepT -= dt * Math.min(2.4, speed / 2.2)
    if (s.stepT <= 0) { s.stepT = 0.42; audio.clumpRun(Math.max(0.12, 1 - d / 20) * Math.min(1, 0.35 + speed / 6), Math.min(1, speed / 6)) }
  }

  // ---------- 外观姿态量 ----------
  const k = Math.min(1, dt * 6)
  s.wind += ((s.phase === 'windup' ? 1 : 0) - s.wind) * k
  s.arm += ((s.phase === 'grab' ? 1 : s.phase === 'devour' ? 0.35 : 0) - s.arm) * Math.min(1, dt * (s.phase === 'grab' ? 14 : 4))
  s.mouth += ((s.phase === 'devour' ? 1 : s.phase === 'grab' ? Math.max(0, Math.min(1, 1 - (d - 0.7 * sc) / 1.4)) * 0.7 : 0) - s.mouth) * k
  s.sit += ((s.phase === 'fasting' && speed === 0 ? 1 : s.phase === 'sated' ? 0.35 : 0) - s.sit) * k * 0.5
  s.ceil += ((s.onCeil && s.phase !== 'pounce' ? 1 : 0) - s.ceil) * Math.min(1, dt * (s.phase === 'pounce' ? 7 : 3))
  s.tangle += ((s.chaos > 0 ? 1 : 0) - s.tangle) * Math.min(1, dt * 10)
  s.shot = Math.max(0, s.shot - dt * 3)
  s.harm += ((s.phase === 'selfharm' ? 1 : 0) - s.harm) * k
  s.pull = s.phase === 'pullup' ? s.t : 0
  s.lunge = s.swingT !== undefined ? 1 - s.swingT / 0.32 : 0
  s.gait += dt * speed * (l3 ? 2.0 : 1.7) + (s.chaos > 0 ? dt * 6 : 0)
}

/** L3 滋水枪：装的是腰果水（不是液态痛苦），散布大、命中率低；命中只扣理智与口渴，不扣血 */
function fireSquirt(eng: Engine, e: Entity, d: number) {
  const p = eng.player
  const r = Math.random()
  const hit = rollSquirt(d, r)
  const err = (r - 0.5) * 2 * CLUMP.SQUIRT_SPREAD
  audio.swing()
  const a = Math.atan2(p.y - e.y, p.x - e.x) + err
  const len = Math.min(CLUMP.SQUIRT_RANGE, d + (hit ? 0 : 1.5))
  const z0 = e.z + 0.75 * (e.def.scale ?? 1)
  for (let t = 0.3; t < len; t += 0.3) {
    eng.particles?.push({ x: e.x + Math.cos(a) * t, y: e.y + Math.sin(a) * t, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, t: 0, life: 0.32, color: '#c9a05a', size: 1.5, z: z0 + (p.z + 1.3 - z0) * (t / len), vz: 0 })
  }
  if (hit) {
    p.sanity = Math.max(0, p.sanity - CLUMP.SQUIRT_SANITY)
    if (typeof p.thirst === 'number') p.thirst = Math.max(0, p.thirst - CLUMP.SQUIRT_THIRST)
    eng.msg('一道苦涩的腰果水正中你的脸——它用的是滋水枪。（理智 -10）', 'damage')
  } else once(eng, 'csqmiss', '一道褐色水线擦着你飞过去——那只肢团手里握着一把装满腰果水的滋水枪，准头很差。')
}
