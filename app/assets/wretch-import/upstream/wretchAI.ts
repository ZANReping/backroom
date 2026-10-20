// v78：悲尸（Entity 15）专属 AI——依据中文维基 Entity 15：
//  · 曾经是人；第三阶段的悲尸智力有限、力量惊人，行为与窃皮者相仿。外表骨瘦如柴却能破门而入。
//  · 个体差异很大：多数是迟缓蹒跚的；少数能超越人类地短跑；极少数表现出智能、会挥舞武器；
//    突变个体长出错位的眼睛、多余的肢体、肉质骨刺「翅膀」。
//  · 发声是判断威胁程度最快的办法：低沉缓慢的咯咯声 → 无智慧的变体；高音调 → 有智慧或异常迅速的个体。
//  · 群体里经常团结一致，像蜂巢社会：一只发现猎物，附近的同类一齐呼应、包抄。
// 游戏取舍（用户确认 2026-10-15）：四种变体全做；不做淤泥与玩家悲尸循环；
//  只能撞开「玩家不用工具就能打开」的门（普通房门 / 铁栅门 / 墨黑金属门 / 玻璃门 / 未锁的卷帘门），上锁、封死的门撞不开；栖息地不变。
// 运行时状态在 e.wr（不入存档/联机；变体由实体 id 决定，联机两端外观一致）。
import { audio } from '../core/audio'
import type { Entity } from '../entities'
import type { Engine } from '../engine'
import type { Structure } from '../core/types'

export type WretchKind = 'shambler' | 'sprinter' | 'smart' | 'mutant'
export interface WretchStats { hp: number; speed: number; damage: number; sight: number; reach: number; windup: number; cd: number; voice: [number, number] }
/** 四种变体的数值（voice = [音高, 节奏]：音高 < 1 低沉、> 1 尖利） */
export const WRETCH_STATS: Record<WretchKind, WretchStats> = {
  shambler: { hp: 75, speed: 1.6, damage: 20, sight: 7, reach: 1.35, windup: 0.42, cd: 1.6, voice: [0.55, 0.6] },
  sprinter: { hp: 50, speed: 4.6, damage: 15, sight: 12, reach: 1.9, windup: 0.22, cd: 1.0, voice: [1.9, 1.6] },
  smart: { hp: 85, speed: 2.5, damage: 26, sight: 12, reach: 1.75, windup: 0.5, cd: 1.5, voice: [1.4, 2.2] },
  mutant: { hp: 110, speed: 1.9, damage: 24, sight: 9, reach: 1.5, windup: 0.45, cd: 1.5, voice: [0.8, 1.0] },
}
export const WRETCH_KIND_NAME: Record<WretchKind, string> = { shambler: '蹒跚型', sprinter: '疾行型', smart: '有智型', mutant: '突变型' }
const hash = (n: number) => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296 }
/** 实体 id → 变体：蹒跚 70% / 疾行 20% / 有智 5% / 突变 5%（渲染层同样调用，模型与行为一致） */
export function wretchKind(id: number): WretchKind {
  const r = hash(id * 13 + 15)
  return r < 0.7 ? 'shambler' : r < 0.9 ? 'sprinter' : r < 0.95 ? 'smart' : 'mutant'
}
/** 模型细节（由 id 决定）：颅顶溶穿、突变部位、有智个体的铁管 */
export function wretchLook(id: number) {
  const kind = wretchKind(id)
  const r = (k: number) => hash(id * 31 + k)
  const mutant = kind === 'mutant' ? (() => {
    const m = { eyes: r(1) < 0.75 ? 2 + Math.floor(r(2) * 3) : 0, arm: r(3) < 0.5, wings: r(4) < 0.45, jaw: r(5) < 0.5 }
    if ((m.eyes ? 1 : 0) + (m.arm ? 1 : 0) + (m.wings ? 1 : 0) + (m.jaw ? 1 : 0) < 2) { m.eyes = Math.max(m.eyes, 3); if (!m.arm && !m.wings) m.wings = true }
    return m
  })() : undefined
  return { kind, brain: r(6) < (kind === 'mutant' ? 0.7 : 0.4), mutant, pipe: kind === 'smart' }
}

export interface WretchState {
  kind: WretchKind
  t: number
  lastHp: number
  alertT: number // 被同类呼应/听见动静后的警觉剩余
  lastX: number; lastY: number // 最后已知玩家位置（世界坐标）
  lostT: number
  voiceCd: number
  strikeT?: number
  burstT: number // 疾行型：冲刺/喘息节奏
  rest: boolean
  dodgeT: number; dodgeSide: number // 有智型：躲手电
  flank: number // 包抄方向（-1 / 1）
  bashT: number; bashS?: Structure; bashHitT: number // 撞门
  scratchT: number // 渲染：抓挠自己（第一、二阶段奇痒的残留）
  stuckT: number
}

const newFrame = (map: Engine['map']) => ({ map, told: new Set<string>() })
let frames = new WeakMap<Engine, ReturnType<typeof newFrame>>()
function frameFor(eng: Engine) {
  let f = frames.get(eng)
  if (!f || f.map !== eng.map) { f = newFrame(eng.map); frames.set(eng, f) }
  return f
}
export function resetWretchFrame(eng?: Engine) { if (eng) frames.delete(eng); else frames = new WeakMap() }
const once = (eng: Engine, key: string, text: string, kind: 'system' | 'damage' = 'system') => { const F = frameFor(eng); if (!F.told.has(key)) { F.told.add(key); eng.msg(text, kind) } }

export function initWretch(eng: Engine, e: Entity): WretchState {
  const kind = wretchKind(e.id), st = WRETCH_STATS[kind]
  if (e.hp === e.def.hp) e.hp = st.hp // 新生成：按变体设血量（存档读回的残血个体不动）
  const s: WretchState = {
    kind, t: 0, lastHp: e.hp, alertT: 0,
    lastX: e.x + (eng.map?.inf?.ox ?? 0), lastY: e.y + (eng.map?.inf?.oy ?? 0), lostT: 99,
    voiceCd: 3 + hash(e.id + 2) * 8, burstT: 0, rest: false, dodgeT: 0, dodgeSide: 1,
    flank: hash(e.id + 9) < 0.5 ? -1 : 1, bashT: 0, bashHitT: 0, scratchT: 0, stuckT: 0,
  }
  e.wr = s
  return s
}

/** 发声（音高区分威胁）+ 首次听到时的提示 */
function voice(eng: Engine, e: Entity, s: WretchState, d: number, chase: boolean) {
  const [pitch, rate] = WRETCH_STATS[s.kind].voice
  const vol = Math.max(0, 1 - d / 22) * (chase ? 1 : 0.6)
  if (vol > 0.03) audio.wretchVoice(vol, pitch, s.kind)
  if (d < 18) {
    if (s.kind === 'shambler') once(eng, 'wv-low', '黑暗里传来低沉、缓慢的咯咯声——是迟缓的悲尸。保持距离就能甩掉它。')
    else if (s.kind === 'sprinter') once(eng, 'wv-high', '一声尖利的嘶叫刺进耳朵——高音调的悲尸跑得比人还快。别背对它。', 'damage')
    else if (s.kind === 'smart') once(eng, 'wv-smart', '那串咯咯声又高又有节奏，像在说话——这只悲尸有智慧，会绕路，会躲光。', 'damage')
    else once(eng, 'wv-mut', '几种不同的嚎叫从同一个身体里叠在一起传出来。', 'damage')
  }
  s.voiceCd = (chase ? 3.5 : 9) / rate + Math.random() * (chase ? 3 : 8)
}

/** 噪音钩子（entityAI.noiseEvent）：迟缓型只对近处响动有反应；其余循声而来 */
export function wretchHear(eng: Engine, e: Entity, x: number, y: number, radius: number, sprint: boolean) {
  const s = e.wr ?? initWretch(eng, e)
  const d = Math.hypot(e.x - x, e.y - y)
  const hearR = Math.max(radius, e.def.hearing * (s.kind === 'shambler' ? 0.8 : sprint ? 1.6 : 1.1))
  if (d >= hearR) return
  s.lastX = x + (eng.map?.inf?.ox ?? 0); s.lastY = y + (eng.map?.inf?.oy ?? 0)
  s.lostT = Math.min(s.lostT, 2); s.alertT = Math.max(s.alertT, 6)
}

/** 蜂巢式呼应：附近（16m）的同类一齐得知猎物位置 */
function rally(eng: Engine, e: Entity, s: WretchState) {
  for (const o of eng.map!.entities) {
    if (o === e || o.dead || o.def.type !== 'wretch') continue
    if (Math.hypot(o.x - e.x, o.y - e.y) > 16) continue
    const os = o.wr ?? initWretch(eng, o)
    if (os.lostT > 1 || os.alertT < 4) { os.lastX = s.lastX; os.lastY = s.lastY; os.lostT = Math.min(os.lostT, 1); os.alertT = 8 }
  }
}

/** 能撞开的门：玩家不借助工具就能打开的那几种（未上锁、未封死、无资格限制） */
export function wretchCanBash(s: Structure): boolean {
  if (!s.solid || s.data?.open) return false
  const d = s.data ?? {}
  if (s.kind === 'hoteldoor') return !d.locked && !d.sealed && !d.careerDoor && !d.mothNest && !d.l7porch && !d.tradeDoor
  if (s.kind === 'bargate') return !d.l7porch && !d.locked
  if (s.kind === 'inkdoor') return !d.locked
  if (s.kind === 'glassdoor' || s.kind === 'rollerdoor') return !d.tradeDoor && !d.locked
  return false
}
const DOOR_KINDS = new Set(['hoteldoor', 'bargate', 'inkdoor', 'glassdoor', 'rollerdoor'])
/** 实体前方 1.3m 内挡路的门（门中心在去往目标的半边） */
function doorAhead(eng: Engine, e: Entity, tx: number, ty: number): Structure | undefined {
  const dx = tx - e.x, dy = ty - e.y, dl = Math.hypot(dx, dy) || 1
  let best: Structure | undefined, bd = 1.3
  for (const st of eng.map!.structures) {
    if (!DOOR_KINDS.has(st.kind) || !st.solid || st.data?.open) continue
    const cx = st.x + st.w / 2, cy = st.y + st.h / 2
    const d = Math.hypot(cx - e.x, cy - e.y)
    if (d > bd) continue
    if (((cx - e.x) * dx + (cy - e.y) * dy) / dl < -0.1) continue
    best = st; bd = d
  }
  return best
}

export function updateWretch(eng: Engine, e: Entity, dt: number, d: number, dmgMult: number) {
  const p = eng.player, m = eng.map!
  const ox = m.inf?.ox ?? 0, oy = m.inf?.oy ?? 0
  const s = e.wr ?? initWretch(eng, e)
  const st = WRETCH_STATS[s.kind]
  s.t += dt; s.voiceCd -= dt; s.alertT = Math.max(0, s.alertT - dt); s.scratchT = Math.max(0, s.scratchT - dt)
  s.dodgeT = Math.max(0, s.dodgeT - dt); s.bashHitT -= dt
  const hurt = e.hp < s.lastHp
  s.lastHp = e.hp
  const zOk = Math.abs(e.z - p.z) < 1.4
  const los = !eng.dev.invisible && zOk && d < 30 && eng.los(e.x, e.y, p.x, p.y)
  const sees = los && d < st.sight * (s.lostT < 3 ? 1.6 : 1)
  if (sees) {
    if (s.lostT > 2) { rally(eng, e, s); once(eng, 'wsee', '一个骨瘦如柴的红褐色人形转过头来，没有眼皮的眼球在眼窝里乱转。', 'damage') }
    s.lastX = p.x + ox; s.lastY = p.y + oy; s.lostT = 0
  } else s.lostT += dt
  if (hurt) { s.lastX = p.x + ox; s.lastY = p.y + oy; s.lostT = Math.min(s.lostT, 0.5); rally(eng, e, s) }
  const hunting = s.lostT < 10 || s.alertT > 0

  let speed = 0, tx = e.x, ty = e.y, face: [number, number] | null = null
  // ---------- 撞门：追猎中被一扇能打开的门挡住 → 用肩膀和拳头撞开 ----------
  if (s.bashS) {
    const door = s.bashS
    if (!door.solid || door.data?.open || !hunting) { s.bashS = undefined; s.bashT = 0 }
    else {
      e.state = 'attack'
      face = [door.x + door.w / 2, door.y + door.h / 2]
      s.bashT += dt
      const need = s.kind === 'smart' ? 0.7 : s.kind === 'sprinter' ? 3.0 : s.kind === 'mutant' ? 1.8 : 2.4
      if (s.kind !== 'smart' && s.bashHitT <= 0) {
        s.bashHitT = 0.55
        const dp = Math.hypot(door.x + door.w / 2 - p.x, door.y + door.h / 2 - p.y)
        if (dp < 18) { audio.hit(); eng.camShake = Math.min(1, eng.camShake + Math.max(0, 0.25 - dp * 0.02)) }
        if (dp < 14) once(eng, 'wbash', '门板被撞得砰砰作响——有什么东西在门的另一边！', 'damage')
      }
      if (s.bashT >= need) {
        door.data = { ...door.data, open: 1 }
        door.solid = false
        eng.emit({ kind: 'mpevent', mp: { t: 'door', x: door.x + ox, y: door.y + oy, open: true } })
        if (Math.hypot(door.x - p.x, door.y - p.y) < 16) eng.msg(s.kind === 'smart' ? '门把手被拧开了——它会开门。' : '门被一下撞开，撞在墙上弹了回去！', 'damage')
        if (s.kind !== 'smart') audio.hit()
        s.bashS = undefined; s.bashT = 0
      }
      if (s.voiceCd <= 0) voice(eng, e, s, d, true)
      eng.faceToward(e, face[0], face[1], dt, 6)
      return
    }
  }

  if (hunting) {
    e.state = sees ? 'chase' : 'investigate'
    const lx = s.lastX - ox, ly = s.lastY - oy
    tx = sees ? p.x : lx; ty = sees ? p.y : ly
    if (sees) face = [p.x, p.y]
    // 包抄：疾行/有智/突变在 4~12m 时从侧面绕（同群里一左一右）
    if (sees && s.kind !== 'shambler' && d > 4 && d < 12) {
      const a = Math.atan2(p.y - e.y, p.x - e.x) + Math.PI / 2
      tx += Math.cos(a) * s.flank * Math.min(2.5, d * 0.3); ty += Math.sin(a) * s.flank * Math.min(2.5, d * 0.3)
    }
    let k = 1
    if (s.kind === 'shambler') k = 0.75 + 0.25 * Math.sin(s.t * 3.1 + e.id) // 一顿一顿的蹒跚
    if (s.kind === 'sprinter') { // 冲刺 3 秒、原地喘息 1 秒
      s.burstT -= dt
      if (s.burstT <= 0) { s.rest = !s.rest && sees && d > 3; s.burstT = s.rest ? 0.9 + Math.random() * 0.5 : 2.6 + Math.random() * 1.2 }
      k = s.rest ? 0.12 : 1
    }
    if (s.kind === 'smart') { // 手电照到就闪到侧面（会躲光）
      if (sees && p.flashlight && d < 9 && eng.lookingAt(e) && s.dodgeT <= 0 && Math.random() < dt * 1.5) { s.dodgeT = 0.9; s.dodgeSide = Math.random() < 0.5 ? -1 : 1; once(eng, 'wdodge', '手电光一扫过去，它就闪进了光照不到的地方。') }
      if (s.dodgeT > 0) { const a = Math.atan2(p.y - e.y, p.x - e.x) + Math.PI / 2 * s.dodgeSide; tx = e.x + Math.cos(a) * 2; ty = e.y + Math.sin(a) * 2; k = 1.25 }
    }
    if (!sees && Math.hypot(lx - e.x, ly - e.y) < 0.6) { s.lostT = Math.max(s.lostT, 10); s.alertT = 0 } // 到了最后位置也没找到
    speed = st.speed * k
    if (s.voiceCd <= 0) voice(eng, e, s, d, true)
  } else {
    // 漫无目的地徘徊、抓挠自己
    e.state = 'wander'
    if (e.stateT <= 0 || Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.4) eng.wanderTarget(e)
    tx = e.targetX; ty = e.targetY
    speed = st.speed * (s.kind === 'sprinter' ? 0.22 : 0.4)
    if (s.scratchT <= 0 && Math.random() < dt * 0.12) s.scratchT = 2.5 + Math.random() * 2
    if (s.scratchT > 0) speed *= 0.2
    if (s.voiceCd <= 0) voice(eng, e, s, d, false)
  }

  // ---------- 近战：抓挠/撕咬；疾行型扑跃；有智型抡铁管 ----------
  if (s.strikeT !== undefined) {
    s.strikeT -= dt; face = [p.x, p.y]
    speed = s.kind === 'sprinter' ? st.speed * 0.9 : st.speed * 0.3
    tx = p.x; ty = p.y
    if (s.strikeT <= 0) {
      s.strikeT = undefined
      if (d < st.reach + 0.25 && los && eng.meleeZOk(e) && !eng.dev.invisible) {
        eng.hurtPlayer(st.damage * dmgMult, e.def.name)
        eng.camShake = Math.min(1, eng.camShake + (s.kind === 'smart' ? 0.6 : 0.4))
        if (s.kind === 'smart') once(eng, 'wpipe', '锈铁管结结实实砸在你身上——这只悲尸知道怎么用武器。', 'damage')
        else if (s.kind === 'sprinter') once(eng, 'wleap', '它四肢着地扑了上来，快得不像人。', 'damage')
        else once(eng, 'wclaw', '骨瘦如柴的手臂力气大得吓人，长在错处的牙和指甲划开了你的皮肉。', 'damage')
      }
    }
  } else if (hunting && los && d < st.reach && e.attackCd <= 0 && eng.meleeZOk(e)) {
    e.attackCd = st.cd; e.lungeT = st.windup + 0.05; s.strikeT = st.windup
    if (s.kind === 'sprinter') s.rest = false
  }

  if (speed > 0) {
    e.targetX = tx; e.targetY = ty
    const bx = e.x, by = e.y
    const stuck = eng.stepEntity(e, speed, dt)
    const moved = Math.hypot(e.x - bx, e.y - by)
    s.stuckT = moved < speed * dt * 0.3 ? s.stuckT + dt : 0
    if (hunting && (stuck || s.stuckT > 0.35)) {
      const door = doorAhead(eng, e, tx, ty)
      if (door && wretchCanBash(door)) { s.bashS = door; s.bashT = 0; s.bashHitT = 0.15 }
      else if (door) once(eng, 'wlocked', '它撞了几下那扇锁死的门，撞不开，转身去找别的路。')
    }
    if (stuck && e.state === 'wander') eng.wanderTarget(e)
    e.animT += dt * speed
  }
  if (face) eng.faceToward(e, face[0], face[1], dt, s.kind === 'sprinter' ? 8 : 5)
  else if (speed > 0) eng.faceToward(e, tx, ty, dt, 5)
}
