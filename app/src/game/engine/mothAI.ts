// 死亡飞蛾（Entity 4）重制——第 3 阶段：专属 AI 与机制。全部数值集中在 MOTH 常量表（文档 app/DEATHMOTH-REMAKE.md）。
//
// 依据中文维基 entity-4：
//   雄性：温顺食腐者，吸食任何液体（含杏仁水），只取食死亡/濒死猎物；成群可吸干丧失行动能力的人；远离巢穴侦察、把消息带回巢；最易驯化。
//   雌性：越靠近巢心越凶；集群剥离暴露部位组织造成失血；用腐蚀性喷射物分解猎物；紧张时释放信息素召集同类与禁卫级。
//   禁卫级：每巢至少一只；敏捷、主动进攻；附肢麻痹毒素；也会喷腐蚀液；能释放信息素让部下狂暴（混乱且极具攻击性）。
//   幼虫：贪婪啃食巢壁，受威胁时蜷成球、刺毛朝外，刺毛分泌麻痹毒素。
//   生存指南：强光吸引死亡飞蛾——关灯/调暗。
// ZAN 的决定（2026-10-20）：不加女皇；L2/3/8/9 稀有卫星巢；杏仁水驯化雄性带路找出口；不做毒镖；被蛾群杀死直接死亡（溶成胶状球）。
import type { Engine } from '../engine'
import type { Entity } from '../entities'
import { audio } from '../core/audio'
import { devourShrimp } from './shrimpAI'
import { look } from '../core/renderer3d'
import { seatedEyeHeight, seatedEyeOffset } from './seating'
import { floorHeight } from '../world/mapgen'
import { nestOf, nestProps, type MothNestDesc } from '../world/mothNests'
import { l5NestLayout } from '../world/infiniteL5'

export const MOTH = {
  /** 强光吸引半径（m）与灯下扑灯耗电（每秒电量） */
  lureR: 11, lampDrain: 1.2, lampOrbit: 0.8,
  /** 雌性攻击性：巢内 1，巢外 nearR 内 0.85，到 farR 衰减到 base；无巢地区 base */
  aggrNearR: 6, aggrFarR: 22, aggrBase: 0.4, aggrHunt: 0.6,
  /** 雌性：视距、绕飞半径、同时扑咬上限、扑咬冷却、放弃距离 */
  femSight: 14, orbitR: 1.3, maxLungers: 2, lungeCd: 1.6, giveUpR: 22, lostSightT: 8,
  /** 失血：每次扑咬叠 1 层（上限 5），每层每秒掉血，6 秒内无新伤口则止血 */
  bleedPerStack: 0.7, bleedMax: 5, bleedT: 6,
  /** 信息素召集半径（同巢或同区域的雌性/雄性/禁卫级被激怒） */
  callR: 16,
  /** 腐蚀喷射：射程、冷却、直击伤害、酸池半径/持续/每秒伤害 */
  femSpray: { min: 2.5, max: 6, cd: 7, dmg: 5, poolR: 0.7, poolT: 8, at: 0.5 },
  guardSpray: { min: 2, max: 5, cd: 9, dmg: 9, poolR: 0.95, poolT: 10, at: 0.55 },
  poolDps: 4,
  /** 雄性：视距、侦察概率与冷却、吸食倒地者（口渴/生命每秒）、吸食地上杏仁水用时 */
  maleSight: 9, scoutChance: 0.35, scoutCd: 40, drinkThirst: 1.5, drinkHp: 0.5, feedT: 6, feedR: 6, downedHp: 25,
  /** 驯化：杏仁水对准 2.5m 内的雄性；带路时领先玩家的距离、等待距离 */
  tameR: 2.5, leadAhead: 3, leadWait: 6,
  /** 禁卫级：守巢警戒半径、拴绳（未被激怒时）、立起威吓、穿刺两击伤害倍率与麻痹、狂暴阈值/范围/持续/加成 */
  guardAlertR: 6, guardLeash: 25, rearT: 1.2, stabT: 1.1, stabHits: [0.4, 0.75], stabMult: 0.9, stabPara: 2.5,
  frenzyHp: 0.5, frenzyR: 25, frenzyT: 20, frenzySpeed: 1.35, frenzyDmg: 1.25, frenzyFriendly: 0.1,
  /** 幼虫：蜷球触发距离/持续；刺毛反伤（普通/蜷球时）：伤害 + 麻痹秒数 */
  curlR: 1.4, curlT: 5, spine: { dmg: 2, para: 1.0 }, spineCurled: { dmg: 4, para: 2.0 },
  /** 卵：一次挥击打破的卵数、挥击判定距离；踩踏地面卵堆 */
  eggSwing: [4, 8] as [number, number], eggReach: 1.7, eggStepEvery: 0.5,
} as const

export interface MothState {
  clip?: string; clipT: number
  mode: 'idle' | 'lured' | 'hunt' | 'spray' | 'scout' | 'feed' | 'drink' | 'tamed' | 'rear' | 'stab' | 'frenzy' | 'curl' | 'return'
  modeT: number
  orbitA: number; lunging?: boolean; lostT: number
  sprayCd: number; sprayHit?: boolean
  stabHit: number
  frenzyT: number; frenzied?: boolean
  scoutCd: number; scoutNest?: string
  feedItem?: number
  tamed?: boolean; tameMsgT?: number
  reared?: boolean; frenzyFired?: boolean
  curlT: number
}
const newState = (e: Entity): MothState => ({ clipT: 0, mode: 'idle', modeT: 0, orbitA: (e.id * 2.39996) % 6.283, lostT: 0, sprayCd: 0.8 + (e.id % 3) * 0.4, stabHit: 0, frenzyT: 0, scoutCd: 5 + (e.id % 7), curlT: 0 })

/** 每局（每个 Engine）共享的机制状态：失血、酸池、胶状球、提示去抖 */
export interface MothFx {
  map: Engine['map']
  bleed: number; bleedT: number
  acid: { x: number; y: number; z: number; r: number; t: number; T: number }[]
  gels: { x: number; y: number; z: number; seed: number }[]
  lastMothHitT: number; gelSpawned?: boolean
  msgCd: Record<string, number>
  stepT: number
  time: number
}
const FX = new WeakMap<Engine, MothFx>()
export function mothFx(eng: Engine): MothFx {
  let f = FX.get(eng)
  if (!f || f.map !== eng.map) { f = { map: eng.map, bleed: 0, bleedT: 0, acid: [], gels: [], lastMothHitT: -99, msgCd: {}, stepT: 0, time: 0 }; FX.set(eng, f) }
  return f
}
const once = (eng: Engine, key: string, cd: number, text: string, kind: 'damage' | 'system' | 'lore' = 'damage') => {
  const f = mothFx(eng); if ((f.msgCd[key] ?? -99) > f.time) return
  f.msgCd[key] = f.time + cd; eng.msg(text, kind)
}
const isMoth = (q: Entity) => q.def.type === 'deathmoth' && !q.dead
const form = (e: Entity) => e.def.mothForm ?? 'male'
const lightOn = (eng: Engine) => { const p = eng.player; return p.flashlight && p.battery > 0 && p.flashJamT <= 0 }

// ---------------------------------------------------------------------------
// 巢
// ---------------------------------------------------------------------------
function nestFor(eng: Engine, e: Entity): MothNestDesc | undefined { return nestOf(eng.map?.inf, e.mothNest) }
/** 世界坐标 ↔ 窗口坐标 */
const ox = (eng: Engine) => eng.map?.inf?.ox ?? 0, oy = (eng: Engine) => eng.map?.inf?.oy ?? 0
function nestDist(eng: Engine, n: MothNestDesc, x: number, y: number) { return Math.hypot(x + ox(eng) - n.cx, y + oy(eng) - n.cy) }
function insideNest(eng: Engine, n: MothNestDesc, x: number, y: number) {
  const wx = x + ox(eng), wy = y + oy(eng)
  return wx >= n.x0 && wx < n.x1 + 1 && wy >= n.y0 && wy < n.y1 + 1
}
function alerts(eng: Engine) { const inf = eng.map?.inf; return inf ? (inf.mothAlerts ??= { all: false, nests: {} }) : null }
function nestAlerted(eng: Engine, id?: string) { const a = alerts(eng); return !!a && (a.all || (!!id && !!a.nests[id])) }
/** 雌性攻击性：越靠近巢心越高 */
export function femaleAggression(eng: Engine, e: Entity): number {
  const n = nestFor(eng, e)
  if (!n) return MOTH.aggrBase
  if (insideNest(eng, n, e.x, e.y) || insideNest(eng, n, eng.player.x, eng.player.y)) return 1
  const d = Math.min(nestDist(eng, n, e.x, e.y), nestDist(eng, n, eng.player.x, eng.player.y))
  if (d <= MOTH.aggrNearR) return 0.85
  return Math.max(MOTH.aggrBase, 0.85 - (d - MOTH.aggrNearR) / (MOTH.aggrFarR - MOTH.aggrNearR) * (0.85 - MOTH.aggrBase))
}

/** 信息素召集：半径内的同类全部激怒（幼虫除外），并标记巢穴警报 */
export function mothPheromone(eng: Engine, src: Entity, radius: number = MOTH.callR, frenzy = false) {
  const m = eng.map!
  for (const q of m.entities) {
    if (!isMoth(q) || form(q) === 'larva') continue
    if (Math.hypot(q.x - src.x, q.y - src.y) > radius) continue
    q.provoked = true
    if (frenzy) { const s = q.mt ??= newState(q); s.frenzyT = MOTH.frenzyT }
  }
  if (src.mothNest) { const a = alerts(eng); if (a) a.nests[src.mothNest] = true }
}

// ---------------------------------------------------------------------------
// 机制：失血、酸池、胶状球、卵
// ---------------------------------------------------------------------------
export function stopMothBleed(eng: Engine) { const f = mothFx(eng); f.bleed = 0; f.bleedT = 0 }
function addBleed(eng: Engine) {
  const f = mothFx(eng); f.bleed = Math.min(MOTH.bleedMax, f.bleed + 1); f.bleedT = MOTH.bleedT
  if (f.bleed === 1) once(eng, 'bleed', 10, '飞蛾的颚撕开了你的皮肤——伤口在流血。（失血：停下来包扎或甩掉它们）')
}
function spawnAcid(eng: Engine, x: number, y: number, r: number, T: number) {
  const m = eng.map!
  mothFx(eng).acid.push({ x: x + ox(eng), y: y + oy(eng), z: floorHeight(m, x, y), r, t: 0, T })
  audio.spark()
}
function mothHurtPlayer(eng: Engine, e: Entity, dmg: number, source = e.def.name) {
  mothFx(eng).lastMothHitT = mothFx(eng).time
  eng.hurtPlayer(dmg, source)
  gelOnDeath(eng)
  void e
}
/** 被死亡飞蛾杀死：腐蚀液把尸体溶成胶状球（原地留下，供其他玩家/下一局看到时的视觉反馈） */
function gelOnDeath(eng: Engine) {
  const f = mothFx(eng), p = eng.player, m = eng.map
  if (!eng.over || f.gelSpawned || !m) return
  f.gelSpawned = true; f.lastMothHitT = f.time
  f.gels.push({ x: p.x + ox(eng), y: p.y + oy(eng), z: floorHeight(m, p.x, p.y), seed: Math.floor(f.time * 1000) % 997 })
  eng.msg('飞蛾群把腐蚀液喷满了你的身体——你被溶成了一团胶状物。', 'damage')
}
/** 每帧一次（实体循环之前）：失血、酸池伤害与消退、驯化提示、踩踏卵堆、被蛾群杀死后的胶状球 */
export function updateMothWorld(eng: Engine, dt: number) {
  const f = mothFx(eng), p = eng.player, m = eng.map
  if (!m) return
  f.time += dt
  for (const k in f.msgCd) if (f.msgCd[k] < f.time - 60) delete f.msgCd[k]
  if (eng.over) return
  f.gelSpawned = false
  if (f.bleed > 0) {
    f.bleedT -= dt
    if (f.bleedT <= 0) { f.bleed = 0; f.bleedT = 0 }
    else if (!eng.dev.god) { p.hp -= MOTH.bleedPerStack * f.bleed * dt; if (p.hp <= 0) { f.lastMothHitT = f.time; eng.die('失血过多（死亡飞蛾）'); gelOnDeath(eng) } }
  }
  for (let i = f.acid.length - 1; i >= 0; i--) {
    const a = f.acid[i]; a.t += dt
    if (a.t >= a.T) { f.acid.splice(i, 1); continue }
    if (Math.hypot(p.x + ox(eng) - a.x, p.y + oy(eng) - a.y) < a.r && Math.abs(p.z - a.z) < 0.6 && !eng.dev.god) {
      p.hp -= MOTH.poolDps * dt
      once(eng, 'acid', 6, '脚下的腐蚀液咝咝作响，正在烧穿你的鞋底。', 'damage')
      if (p.hp <= 0) { f.lastMothHitT = f.time; eng.die('被死亡飞蛾的腐蚀液溶解'); gelOnDeath(eng) }
    }
  }
  // 踩踏地面卵堆
  f.stepT -= dt
  if (f.stepT <= 0 && m.inf?.mothNests) {
    f.stepT = MOTH.eggStepEvery
    for (const n of Object.values(m.inf.mothNests)) {
      if (Math.hypot(n.cx - (p.x + ox(eng)), n.cy - (p.y + oy(eng))) > 6) continue
      for (const pr of nestProps(n)) {
        if (pr.kind !== 'floor' && pr.kind !== 'pillar') continue
        if (Math.hypot(pr.x - (p.x + ox(eng)), pr.y - (p.y + oy(eng))) < pr.r + 0.25) breakEggs(eng, n, pr.key, pr.kind === 'pillar' ? 3 : 2, '你一脚踩进了卵堆，湿滑的卵壳在脚下爆开。')
      }
    }
  }
}
function breakEggs(eng: Engine, n: MothNestDesc, key: string, count: number, text: string) {
  const inf = eng.map?.inf; if (!inf) return
  const pr = nestProps(n).find((q) => q.key === key); if (!pr) return
  const k = `${n.id}:${key}`, cap = pr.kind === 'pillar' ? 400 : pr.eggs, cur = (inf.mothEggs ??= {})[k] ?? 0
  if (cur >= cap) return
  inf.mothEggs[k] = Math.min(cap, cur + count)
  once(eng, 'egg', 4, text)
  // 卵被毁 = 惊巢
  const a = alerts(eng); if (a) a.nests[n.id] = true
  for (const q of eng.map!.entities) if (isMoth(q) && q.mothNest === n.id && form(q) !== 'larva') q.provoked = true
  once(eng, 'eggAlarm', 12, '巢穴深处爆发出一片愤怒的扑翼声。', 'damage')
  audio.aggro()
}
/** 近战挥空时调用：打破面前的卵（孵化囊/卵柱/地面卵堆） */
export function mothEggSwing(eng: Engine): boolean {
  const inf = eng.map?.inf, p = eng.player
  if (!inf?.mothNests) return false
  const fx = Math.cos(p.facing), fy = Math.sin(p.facing)
  for (const n of Object.values(inf.mothNests)) {
    if (Math.hypot(n.cx - (p.x + ox(eng)), n.cy - (p.y + oy(eng))) > 8) continue
    for (const pr of nestProps(n)) {
      if (pr.kind === 'coat' || pr.kind === 'door') continue
      const dx = pr.x - (p.x + ox(eng)), dy = pr.y - (p.y + oy(eng)), d = Math.hypot(dx, dy)
      if (d > MOTH.eggReach + pr.r) continue
      if (d > 0.4 && (dx * fx + dy * fy) / d < 0.3) continue
      if (pr.h > 2.0) continue // 太高够不着
      const [a, b] = MOTH.eggSwing
      breakEggs(eng, n, pr.key, a + Math.floor(Math.random() * (b - a + 1)), '你一下砸烂了一片卵——黏稠的卵液溅了一地。')
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// 驯化（杏仁水）
// ---------------------------------------------------------------------------
/** 准星对准 2.5m 内未驯化的雄性 → 返回它（给 inventory 判断是否把杏仁水喂给飞蛾） */
export function aimMothToTame(eng: Engine): Entity | null {
  if (!eng.map || eng.handsStowed) return null
  const p = eng.player, off = seatedEyeOffset(eng)
  const eyeX = p.x + off.x, eyeY = p.y + off.y, eyeZ = p.z + seatedEyeHeight(eng)
  const n = Math.hypot(look.rayX, look.rayY, look.rayZ), cp = Math.cos(look.pitch)
  const dir = n > 0.5 ? { x: look.rayX / n, y: look.rayY / n, z: look.rayZ / n } : { x: -Math.sin(look.yaw) * cp, y: -Math.cos(look.yaw) * cp, z: Math.sin(look.pitch) }
  let best: Entity | null = null, nearest = Infinity
  for (const e of eng.map.entities) {
    if (!isMoth(e) || form(e) !== 'male' || e.mt?.tamed || e.hidden || Math.hypot(e.x - p.x, e.y - p.y) > MOTH.tameR) continue
    const dx = e.x - eyeX, dy = e.y - eyeY, dz = e.z - eyeZ, along = dx * dir.x + dy * dir.y + dz * dir.z
    const miss = Math.hypot(dx - dir.x * along, dy - dir.y * along, dz - dir.z * along)
    if (along <= 0 || miss > 0.2 * (e.def.scale ?? 1) || along >= nearest || !eng.los(p.x, p.y, e.x, e.y)) continue
    best = e; nearest = along
  }
  return best
}
export function tameMoth(eng: Engine, e: Entity): boolean {
  if (!isMoth(e) || form(e) !== 'male' || Math.hypot(e.x - eng.player.x, e.y - eng.player.y) > MOTH.tameR || !eng.los(e.x, e.y, eng.player.x, eng.player.y)) return false
  if (!eng.hasItem('almond')) { eng.msg('需要一瓶杏仁水。', 'system'); return false }
  eng.consumeItem('almond')
  const s = e.mt ??= newState(e)
  s.tamed = true; s.mode = 'tamed'; s.modeT = 0
  e.provoked = false; e.state = 'wander'; e.targetEnt = undefined
  e.def = { ...e.def, passive: true, grudge: false, hunts: undefined, lightLure: false, drainsLight: false }
  eng.msg('雄蛾把细长的口器探进瓶口，喝光了杏仁水。它绕着你飞了两圈，然后朝某个方向飞去，又停下来等你。（驯化：它会带你找最近的出口）', 'lore')
  audio.uiTick()
  return true
}

// ---------------------------------------------------------------------------
// 主更新：返回 true 表示本帧已处理（跳过通用 AI）
// ---------------------------------------------------------------------------
export function updateMoth(eng: Engine, e: Entity, dt: number, d: number, dmgMult: number): boolean {
  if (e.def.type !== 'deathmoth') return false
  const s = e.mt ??= newState(e)
  s.modeT += dt; s.clipT += dt
  s.sprayCd -= dt; s.scoutCd -= dt
  if (s.frenzyT > 0) s.frenzyT -= dt
  e.attackCd -= 0 // （通用循环已递减）
  e.animT += dt
  if (e.stunT > 0) { e.stunT -= dt; return true }
  const f = form(e)
  if (f === 'larva') larvaAI(eng, e, s, dt, d)
  else if (f === 'guard') guardAI(eng, e, s, dt, d, dmgMult)
  else if (f === 'female') femaleAI(eng, e, s, dt, d, dmgMult)
  else maleAI(eng, e, s, dt, d, dmgMult)
  return true
}
const setClip = (s: MothState, clip: string | undefined) => { if (s.clip !== clip) { s.clip = clip; s.clipT = 0 } }
const spd = (e: Entity, s: MothState, k = 1) => e.def.speed * k * (s.frenzyT > 0 ? MOTH.frenzySpeed : 1)
const dmgOf = (e: Entity, s: MothState, mult: number) => e.def.damage * mult * (s.frenzyT > 0 ? MOTH.frenzyDmg : 1)
function moveTo(eng: Engine, e: Entity, x: number, y: number, speed: number, dt: number) {
  // 主巢只有一扇门：在巢内追向巢外目标时先绕到门口，不斜穿隔墙
  const n = nestFor(eng, e)
  if (n?.kind === 'main' && n.doorX !== undefined && n.doorY !== undefined) {
    const inside = insideNest(eng, n, e.x, e.y), tgtInside = insideNest(eng, n, x, y)
    if (inside !== tgtInside) { const ex = e.y + oy(eng); x = (Math.abs(ex - (n.doorY + 0.5)) > 0.27 ? (inside ? n.doorX - 0.45 : n.doorX + 1.6) : (inside ? n.doorX + 1.6 : n.doorX - 0.45)) - ox(eng); y = n.doorY + 0.5 - oy(eng) }
  }
  e.targetX = x; e.targetY = y
  eng.faceToward(e, x, y, dt, 7)
  eng.stepEntity(e, speed, dt)
}
function wanderNear(eng: Engine, e: Entity, s: MothState, dt: number, k: number, radius: number) {
  const n = nestFor(eng, e)
  if (s.modeT > 4 + (e.id % 4) || Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.3) {
    s.modeT = 0
    const a = e.id * 1.7 + eng.time * 0.37
    if (n) { const cx = n.cx - ox(eng), cy = n.cy - oy(eng); e.targetX = cx + Math.cos(a) * radius * (0.3 + 0.7 * Math.abs(Math.sin(a * 1.3))); e.targetY = cy + Math.sin(a) * radius * (0.3 + 0.7 * Math.abs(Math.cos(a * 0.7))) }
    else eng.wanderTarget(e)
  }
  eng.faceToward(e, e.targetX, e.targetY, dt, 4)
  eng.stepEntity(e, e.def.speed * k, dt)
}
const seesPlayer = (eng: Engine, e: Entity, d: number, sight: number) => !eng.dev.invisible && d < sight && eng.los(e.x, e.y, eng.player.x, eng.player.y)

/** 灯下扑灯：绕着手电光点小圈飞、耗电（不伤人） */
function lampFlutter(eng: Engine, e: Entity, s: MothState, dt: number, d: number) {
  const p = eng.player, yaw = p.facing
  const lx = p.x + Math.cos(yaw) * 0.9, ly = p.y + Math.sin(yaw) * 0.9
  s.orbitA += dt * 3.2
  moveTo(eng, e, lx + Math.cos(s.orbitA) * MOTH.lampOrbit, ly + Math.sin(s.orbitA) * MOTH.lampOrbit, e.def.speed * 1.1, dt)
  e.state = 'investigate'
  if (d < 1.6) { p.battery = Math.max(0, p.battery - MOTH.lampDrain * dt); once(eng, 'lamp', 20, '飞蛾一头撞在手电玻璃上，扑落的鳞粉糊住了光——电量在掉。关灯能甩开它们。', 'system') }
  setClip(s, 'hover')
}

// ---------------------------------------------------------------------------
// 雄性
// ---------------------------------------------------------------------------
function maleAI(eng: Engine, e: Entity, s: MothState, dt: number, d: number, dmgMult: number) {
  const p = eng.player, m = eng.map!
  if (s.tamed) return tamedAI(eng, e, s, dt, d)
  // 被激怒（被打过）：弱小的反击撕咬
  if (e.provoked && !e.def.passive || (e.provoked && e.def.grudge)) {
    e.state = 'chase'
    moveTo(eng, e, p.x, p.y, spd(e, s, 1.1), dt)
    setClip(s, d < 1.2 ? 'bite' : 'fly')
    if (d < 0.85 && e.attackCd <= 0 && eng.meleeZOk(e)) { e.attackCd = 1.3; e.lungeT = 0.32; mothHurtPlayer(eng, e, dmgOf(e, s, dmgMult) * 0.5) }
    return
  }
  // 吸食倒地/麻痹的玩家（成群的雄性能把人吸干）
  const downed = p.hp < MOTH.downedHp || eng.webbedT > 0
  if (downed && d < 8 && eng.los(e.x, e.y, p.x, p.y)) {
    e.state = 'chase'
    moveTo(eng, e, p.x, p.y, spd(e, s), dt)
    setClip(s, d < 1 ? 'bite' : 'fly')
    if (d < 0.8 && !eng.dev.god) {
      p.thirst = Math.max(0, p.thirst - MOTH.drinkThirst * dt)
      p.hp -= MOTH.drinkHp * dt; mothFx(eng).lastMothHitT = mothFx(eng).time
      once(eng, 'drink', 15, '雄蛾落在你身上，把针状口器扎进皮肤吸水——你动弹不得。', 'damage')
      if (p.hp <= 0) { eng.die('被死亡飞蛾吸干'); gelOnDeath(eng) }
    }
    return
  }
  // 侦察回巢报信
  if (s.mode === 'scout') {
    const n = nestOf(m.inf, s.scoutNest)
    if (!n) { s.mode = 'idle'; return }
    const tx = n.cx - ox(eng), ty = n.cy - oy(eng)
    e.state = 'wander'; moveTo(eng, e, tx, ty, spd(e, s, 1.25), dt); setClip(s, 'fly')
    if (Math.hypot(tx - e.x, ty - e.y) < 1.6) {
      const a = alerts(eng); if (a) a.nests[n.id] = true
      if (Math.hypot(p.x + ox(eng) - n.cx, p.y + oy(eng) - n.cy) < 45) once(eng, 'scout', 30, '远处传来密集的扑翼声——有雄蛾把你的位置带回了巢穴。', 'damage')
      s.mode = 'idle'; s.scoutCd = MOTH.scoutCd
    }
    return
  }
  // 地上的杏仁水：飞过去落地吸食
  if (s.mode === 'feed' || s.scoutCd < MOTH.scoutCd - 2) {
    const it = s.feedItem !== undefined ? m.items.find((q) => q.id === s.feedItem) : m.items.find((q) => q.type === 'almond' && Math.hypot(q.x - e.x, q.y - e.y) < MOTH.feedR)
    if (it) {
      s.feedItem = it.id
      if (Math.hypot(it.x - e.x, it.y - e.y) > 0.35) { if (s.mode !== 'feed') { s.mode = 'feed'; s.modeT = 0 }; moveTo(eng, e, it.x, it.y, spd(e, s), dt); setClip(s, 'fly'); return }
      if (s.clip !== 'feed') s.modeT = 0 // Drinking time starts at the item, excluding the flight to it.
      s.mode = 'feed'; setClip(s, 'feed')
      e.z += (floorHeight(m, e.x, e.y) + 0.05 - e.z) * Math.min(1, dt * 4)
      if (s.modeT > MOTH.feedT) {
        m.items = m.items.filter(q => q !== it); m.inf?.taken.add(it.id)
        for (const c of m.inf?.chunks.values() ?? []) c.items = c.items.filter(q => q !== it)
        s.feedItem = undefined; s.mode = 'idle'
      }
      return
    }
    if (s.mode === 'feed') { s.mode = 'idle'; s.feedItem = undefined }
  }
  // Keep the existing Entity 20 prey relationship when replacing the generic AI.
  if (e.def.hunts?.includes('dryshrimp')) {
    if (!e.targetEnt || e.targetEnt.dead || (e.huntScanT ?? 0) <= 0) {
      e.huntScanT = 0.8
      e.targetEnt = m.entities.find(q => !q.dead && q.def.type === 'dryshrimp' && Math.hypot(q.x - e.x, q.y - e.y) < 6 && eng.los(e.x, e.y, q.x, q.y))
    }
    const prey = e.targetEnt
    if (prey && !prey.dead && Math.hypot(prey.x - e.x, prey.y - e.y) < 8 && eng.los(e.x, e.y, prey.x, prey.y)) {
      moveTo(eng, e, prey.x, prey.y, spd(e, s), dt); setClip(s, 'dive')
      if (Math.hypot(prey.x - e.x, prey.y - e.y) < 0.8 && Math.abs(prey.z - e.z) < 1.8 && e.attackCd <= 0) { devourShrimp(eng, e, prey); e.attackCd = 1.3; setClip(s, 'feed') }
      return
    }
  }
  // 强光吸引
  if (lightOn(eng) && d < MOTH.lureR && eng.los(e.x, e.y, p.x, p.y)) return lampFlutter(eng, e, s, dt, d)
  // 看见玩家 → 有巢可回时一定概率回巢报信
  if (seesPlayer(eng, e, d, MOTH.maleSight) && s.scoutCd <= 0) {
    s.scoutCd = MOTH.scoutCd
    const n = nearestNest(eng, e)
    if (n && Math.random() < MOTH.scoutChance) { s.mode = 'scout'; s.scoutNest = n.id; s.modeT = 0; return }
  }
  e.state = 'wander'
  wanderNear(eng, e, s, dt, 0.45, nestFor(eng, e)?.kind === 'main' ? 2.5 : 7)
  setClip(s, undefined)
}
function nearestNest(eng: Engine, e: Entity): MothNestDesc | undefined {
  const inf = eng.map?.inf; if (!inf?.mothNests) return undefined
  let best: MothNestDesc | undefined, bd = 60
  for (const n of Object.values(inf.mothNests)) { const dd = nestDist(eng, n, e.x, e.y); if (dd < bd) { bd = dd; best = n } }
  return best
}
function tamedAI(eng: Engine, e: Entity, s: MothState, dt: number, d: number) {
  const p = eng.player
  e.state = 'wander'
  const ex = eng.nearestExit()
  if (!ex) { // 没有出口可指：跟着玩家绕飞
    s.orbitA += dt * 1.6
    moveTo(eng, e, p.x + Math.cos(s.orbitA) * 1.4, p.y + Math.sin(s.orbitA) * 1.4, e.def.speed, dt); setClip(s, 'fly'); return
  }
  const tx = ex.x + 0.5, ty = ex.y + 0.5, toExit = Math.hypot(tx - p.x, ty - p.y)
  if (d > MOTH.leadWait) { moveTo(eng, e, p.x, p.y, e.def.speed * 1.2, dt); setClip(s, 'fly'); return } // 玩家落后：飞回来
  if (toExit < 1.5) { moveTo(eng, e, tx, ty, e.def.speed * 0.6, dt); setClip(s, 'hover'); return }
  const k = Math.min(1, MOTH.leadAhead / Math.max(0.01, toExit))
  moveTo(eng, e, p.x + (tx - p.x) * k, p.y + (ty - p.y) * k, e.def.speed, dt)
  setClip(s, Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.4 ? 'hover' : 'fly')
  if ((s.tameMsgT ?? 0) <= 0 && toExit < 3) { s.tameMsgT = 30; eng.msg('驯化的雄蛾停在一处不动了，翅膀急促地扇着——出口就在附近。', 'lore') }
  if (s.tameMsgT) s.tameMsgT -= dt
}

// ---------------------------------------------------------------------------
// 雌性
// ---------------------------------------------------------------------------
function femaleAI(eng: Engine, e: Entity, s: MothState, dt: number, d: number, dmgMult: number) {
  const p = eng.player
  const aggr = femaleAggression(eng, e)
  const alerted = e.provoked || nestAlerted(eng, e.mothNest) || s.frenzyT > 0
  const sees = seesPlayer(eng, e, d, MOTH.femSight)
  // 喷射中
  if (s.mode === 'spray') {
    eng.faceToward(e, p.x, p.y, dt, 8); setClip(s, 'spray'); e.state = 'chase'
    if (!s.sprayHit && s.modeT >= MOTH.femSpray.at) {
      s.sprayHit = true
      spawnAcid(eng, p.x, p.y, MOTH.femSpray.poolR, MOTH.femSpray.poolT)
      if (d < MOTH.femSpray.max + 0.5 && eng.los(e.x, e.y, p.x, p.y)) mothHurtPlayer(eng, e, MOTH.femSpray.dmg * dmgMult, '死亡飞蛾的腐蚀液')
    }
    if (s.modeT > 1.2) { s.mode = 'hunt'; s.modeT = 0 }
    return
  }
  if (s.mode !== 'hunt') {
    const startHunt = sees && (aggr >= MOTH.aggrHunt || alerted || d < 2.5)
    if (startHunt) {
      s.mode = 'hunt'; s.modeT = 0; s.lostT = 0; e.state = 'chase'
      if (d > MOTH.femSpray.min && d < MOTH.femSpray.max && s.sprayCd < 2) { s.mode = "spray"; s.sprayHit = false; s.sprayCd = MOTH.femSpray.cd } // 开场先从远处喷一口
      if (!e.provoked) { e.provoked = true; mothPheromone(eng, e); once(eng, 'femCall', 20, '雌蛾的腹部抽动着释放出刺鼻的气味——周围的飞蛾都朝你转了过来。', 'damage'); audio.aggro() }
    } else if (lightOn(eng) && d < MOTH.lureR && eng.los(e.x, e.y, p.x, p.y)) return lampFlutter(eng, e, s, dt, d)
    else { e.state = 'wander'; wanderNear(eng, e, s, dt, 0.35, nestFor(eng, e)?.kind === 'main' ? 2 : 3); setClip(s, undefined); return }
  }
  // 狩猎：绕飞包抄 + 轮流扑咬；中距离喷腐蚀液
  e.state = 'chase'
  if (sees) s.lostT = 0; else s.lostT += dt
  if ((d > MOTH.giveUpR || s.lostT > MOTH.lostSightT) && !nestAlerted(eng, e.mothNest)) { s.mode = 'return'; s.modeT = 0; e.provoked = false; e.state = 'wander'; return }
  if (sees && d > MOTH.femSpray.min && d < MOTH.femSpray.max && s.sprayCd <= 0) { s.mode = 'spray'; s.modeT = 0; s.sprayHit = false; s.sprayCd = MOTH.femSpray.cd; return }
  const lungers = eng.map!.entities.filter((q) => q !== e && isMoth(q) && q.mt?.lunging && Math.hypot(q.x - p.x, q.y - p.y) < 4).length
  if (s.lunging) {
    moveTo(eng, e, p.x, p.y, spd(e, s, 1.6), dt); setClip(s, 'dive')
    if (d < 0.9 && eng.meleeZOk(e)) {
      s.lunging = false; e.attackCd = MOTH.lungeCd; e.lungeT = 0.32
      // 狂暴的混乱：偶尔咬错对象
      const victim = s.frenzyT > 0 && Math.random() < MOTH.frenzyFriendly ? eng.map!.entities.find((q) => q !== e && isMoth(q) && Math.hypot(q.x - e.x, q.y - e.y) < 1.5) : undefined
      if (victim) { victim.hp -= dmgOf(e, s, 1); eng.killCheck(victim) }
      else { mothHurtPlayer(eng, e, dmgOf(e, s, dmgMult)); addBleed(eng) }
      setClip(s, 'bite')
    } else if (s.modeT > 1.4) s.lunging = false
    return
  }
  if (e.attackCd <= 0 && d < 2.2 && lungers < MOTH.maxLungers) { s.lunging = true; s.modeT = 0; return }
  s.orbitA += dt * (1.4 + (e.id % 3) * 0.25) * (e.id % 2 ? 1 : -1)
  const r = MOTH.orbitR + (e.id % 3) * 0.25
  moveTo(eng, e, p.x + Math.cos(s.orbitA) * r, p.y + Math.sin(s.orbitA) * r, spd(e, s), dt)
  setClip(s, 'fly')
}

// ---------------------------------------------------------------------------
// 禁卫级
// ---------------------------------------------------------------------------
function guardAI(eng: Engine, e: Entity, s: MothState, dt: number, d: number, dmgMult: number) {
  const p = eng.player, n = nestFor(eng, e)
  const post = n ? { x: n.cx - ox(eng), y: n.cy - oy(eng) } : { x: e.targetX, y: e.targetY }
  const playerInNest = !!n && insideNest(eng, n, p.x, p.y)
  const alerted = e.provoked || nestAlerted(eng, e.mothNest) || s.frenzyT > 0 || playerInNest || (d < MOTH.guardAlertR && eng.los(e.x, e.y, p.x, p.y))
  // 立起威吓（首次交战）
  if (s.mode === 'rear') { eng.faceToward(e, p.x, p.y, dt, 6); setClip(s, 'rear'); if (s.modeT > MOTH.rearT) { s.mode = 'hunt'; s.modeT = 0 }; return }
  if (s.mode === 'frenzy') { setClip(s, 'frenzy'); if (s.modeT > 2) { s.mode = 'hunt'; s.modeT = 0 }; return }
  if (s.mode === 'stab') {
    eng.faceToward(e, p.x, p.y, dt, 5); setClip(s, 'stab')
    for (let i = 0; i < MOTH.stabHits.length; i++) if (s.stabHit === i && s.modeT >= MOTH.stabHits[i]) {
      s.stabHit++
      if (d < 1.6 && eng.meleeZOk(e)) {
        mothHurtPlayer(eng, e, dmgOf(e, s, dmgMult) * MOTH.stabMult)
        eng.webbedT = Math.max(eng.webbedT, MOTH.stabPara)
        once(eng, 'stab', 8, '禁卫级的长足刺穿了你——麻痹毒素顺着伤口扩散，四肢发沉。（麻痹）', 'damage')
      }
    }
    if (s.modeT > MOTH.stabT) { s.mode = 'hunt'; s.modeT = 0; e.attackCd = 1.2 }
    return
  }
  if (s.mode === 'spray') {
    eng.faceToward(e, p.x, p.y, dt, 6); setClip(s, 'spray')
    if (!s.sprayHit && s.modeT >= MOTH.guardSpray.at) {
      s.sprayHit = true; spawnAcid(eng, p.x, p.y, MOTH.guardSpray.poolR, MOTH.guardSpray.poolT)
      if (d < MOTH.guardSpray.max + 0.5 && eng.los(e.x, e.y, p.x, p.y)) mothHurtPlayer(eng, e, MOTH.guardSpray.dmg * dmgMult, '禁卫级飞蛾的腐蚀液')
    }
    if (s.modeT > 1.3) { s.mode = 'hunt'; s.modeT = 0 }
    return
  }
  if (!alerted) {
    s.mode = 'idle'; e.state = 'wander'
    const dp = Math.hypot(post.x - e.x, post.y - e.y)
    if (dp > 0.6) { moveTo(eng, e, post.x, post.y, e.def.speed * 0.5, dt); setClip(s, 'walk') } else setClip(s, 'idle')
    return
  }
  if (s.mode !== 'hunt') {
    if (!s.reared && d < 9) { s.reared = true; s.mode = 'rear'; s.modeT = 0; e.provoked = true; mothPheromone(eng, e); once(eng, 'guardRear', 25, '一只禁卫级飞蛾立了起来，八条长足张开，颚钳咔哒作响。', 'damage'); audio.aggro(); return }
    s.mode = 'hunt'; s.modeT = 0
  }
  e.state = 'chase'
  // 拴绳：未被激怒、玩家离巢太远 → 回巢
  if (!e.provoked && s.frenzyT <= 0 && Math.hypot(post.x - e.x, post.y - e.y) > MOTH.guardLeash) { s.mode = 'return'; e.state = 'wander'; return }
  if (d < 1.3 && e.attackCd <= 0) { s.mode = 'stab'; s.modeT = 0; s.stabHit = 0; return }
  if (d > MOTH.guardSpray.min && d < MOTH.guardSpray.max && s.sprayCd <= 0 && eng.los(e.x, e.y, p.x, p.y)) { s.mode = 'spray'; s.modeT = 0; s.sprayHit = false; s.sprayCd = MOTH.guardSpray.cd; return }
  moveTo(eng, e, p.x, p.y, spd(e, s), dt)
  setClip(s, spd(e, s) > 1.6 ? 'run' : 'walk')
}

// ---------------------------------------------------------------------------
// 幼虫
// ---------------------------------------------------------------------------
function larvaAI(eng: Engine, e: Entity, s: MothState, dt: number, d: number) {
  if (s.curlT > 0) { s.curlT -= dt; setClip(s, 'curl'); e.state = 'idle'; return }
  if (d < MOTH.curlR && !eng.dev.invisible) { s.curlT = MOTH.curlT; setClip(s, 'curl'); return }
  e.state = 'wander'
  // 慢慢爬、停下啃食巢壁
  if (Math.floor((eng.time + e.id * 3.7) / 6) % 2 === 0) { setClip(s, 'chew'); return }
  wanderNear(eng, e, s, dt, 1, nestFor(eng, e)?.kind === 'main' ? 1.8 : 0.9)
  setClip(s, 'crawl')
}

// ---------------------------------------------------------------------------
// 受伤钩子（killCheck → provokeMoths 之后调用）
// ---------------------------------------------------------------------------
/** 玩家近战伤到飞蛾：幼虫刺毛反伤 + 蜷球；禁卫级半血狂暴；雌性召集 */
export function mothHurt(eng: Engine, e: Entity, melee: boolean) {
  if (!isMoth(e)) return
  const s = e.mt ??= newState(e), f = form(e)
  if (f === 'larva') {
    const curled = s.curlT > 0
    s.curlT = MOTH.curlT
    if (melee && Math.hypot(e.x - eng.player.x, e.y - eng.player.y) < 2.2) {
      const sp = curled ? MOTH.spineCurled : MOTH.spine
      eng.hurtPlayer(sp.dmg, '死亡飞蛾幼虫的刺毛')
      eng.webbedT = Math.max(eng.webbedT, sp.para)
      once(eng, 'spine', 8, curled ? '你一拳砸在刺球上——几十根中空毒刺扎进了手里，整条手臂都麻了。（麻痹）' : '幼虫背上的刺毛扎进了你的手。（麻痹）', 'damage')
    }
  } else if (f === 'guard') {
    if (!s.frenzyFired && e.hp > 0 && e.hp < e.def.hp * MOTH.frenzyHp) {
      s.frenzyFired = true; s.mode = 'frenzy'; s.modeT = 0
      mothPheromone(eng, e, MOTH.frenzyR, true)
      eng.msg('禁卫级飞蛾的残翅疯狂震颤，一股甜腥的气味扑面而来——所有飞蛾都陷入了狂暴。', 'damage')
      audio.aggro()
    }
  } else if (f === 'female' && !e.provoked) mothPheromone(eng, e)
}

/** 旧接口兼容：L5 巢门/幼虫警报仍由 engine/moths.ts 处理；这里只给验收脚本一个 L5 主巢查询 */
export const _l5NestLayout = l5NestLayout
