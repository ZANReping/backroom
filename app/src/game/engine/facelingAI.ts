// 无面灵（Entity 9）重制阶段 3：普通种 / 进化种的社会行为、幼体哭闹与安抚、护幼与易怒分支。
// 依据 backrooms-wiki-cn entity-9：
//   · 普通种：模仿人类的社会行为——见到人会招手、点头；被无视会失望地垂下头；有时会给流浪者指出附近的东西。
//   · 幼年个体情绪最不稳定：一不顺心就躺在地上踢打哭闹；耐心安抚可以让它平静，平静后会抱住你的腿、牵着你走一小段。
//     （不做领养 / 跨层跟随：一小段之后它会自己松手离开。）
//   · 成体会保护幼体：伤害幼体会激怒附近所有成年个体。
//   · 进化种（Level 3）：易怒分支——仍对流浪者抱有敌意（部分持石锤），每次暴起前先暴怒捶胸 / 抡锤；
//     长时间无人安抚的哭闹幼体会进一步惹恼附近的进化种成体。
//   · 「触碰诅咒」只写进图鉴，不做机制。
// 本模块只拥有移动（返回 true）的情形：哭闹 / 被安抚 / 抱腿 / 牵手跟随 / 暴怒前摇；其余时间只叠加手势，交给 L11 例程或通用 AI。
import type { Engine } from '../engine'
import type { Entity } from '../entities'
import { facelingAge, type FacelingAge } from '../entities/facelingTraits'
import { FACELING_CLIPS, type FacelingGesture } from '../renderer/facelingAnim'
import { audio } from '../core/audio'

/** 数值表（秒 / 米 / 理智点） */
export const FC = {
  GREET_R: 4.5, GREET_P: 0.5, GREET_CD: 25, NOD_R: 2.2, IGNORE_R: 7, IGNORE_T: 6,
  POINT_R: 3.2, POINT_ITEM_R: 14, POINT_CD: 70, POINT_P: 0.35,
  TANTRUM_NEAR: 8, TANTRUM_P: 0.035, TANTRUM_CD: 90, TANTRUM_MAX: 40, CRY_EVERY: 2.6,
  CRY_SAN_R: 6, CRY_SAN: 0.5,
  IRK_T: 22, IRK_R: 12,
  SOOTHE_R: 1.8, SOOTHE_T: 2.4, SOOTHE_DECAY: 0.6, SOOTHE_SAN: 12,
  HUG_T: 3.2, FOLLOW_T: 25, FOLLOW_GAP: 0.85, FOLLOW_LOSE: 8, FOLLOW_SPEED: 1.25, AFTER_CD: 150,
  PROTECT_R: 10, RAGE_T: 0.9, SMASH_T: 1.3,
}

export type FacelingMode = 'none' | 'tantrum' | 'soothed' | 'hug' | 'follow' | 'rage'
export interface FacelingState {
  age: FacelingAge
  mode: FacelingMode; modeT: number
  gesture?: FacelingGesture; gT: number; gW: number
  greetCd: number; pointCd: number; tantrumCd: number
  waveAt: number // 招手之后等待回应的剩余时间（玩家走远即失望）
  cryT: number; soothe: number; irked: boolean
  alarmed: boolean; wasChase: boolean
}

/** 渲染与 AI 共用：生成标记指定的年龄优先，否则按实体种子确定 */
export function facelingAgeOf(e: Entity): FacelingAge { return e.fcAge ?? facelingAge(e.id, !!e.def.l3face) }
const evolved = (e: Entity) => !!e.def.l3face
function state(e: Entity): FacelingState {
  return e.fc ??= { age: facelingAgeOf(e), mode: 'none', modeT: 0, gT: 0, gW: 0, greetCd: 3 + Math.random() * 6, pointCd: 20, tantrumCd: 20 + Math.random() * 40,
    waveAt: 0, cryT: 0, soothe: 0, irked: false, alarmed: false, wasChase: false }
}
function play(s: FacelingState, g: FacelingGesture | undefined) { if (s.gesture !== g) { s.gesture = g; s.gT = 0 } }
function setMode(s: FacelingState, m: FacelingMode, g?: FacelingGesture) { s.mode = m; s.modeT = 0; play(s, g); if (g) s.gW = 1 }

/** 当前可被安抚的哭闹幼体（离玩家最近、在安抚距离内） */
export function sootheTarget(eng: Engine): Entity | undefined {
  const m = eng.map; if (!m) return
  const p = eng.player
  let best: Entity | undefined, bd = FC.SOOTHE_R
  for (const e of m.entities) {
    if (e.dead || e.def.type !== 'faceling' || e.fc?.mode !== 'tantrum') continue
    const d = Math.hypot(e.x - p.x, e.y - p.y)
    if (d < bd && Math.abs(e.z - p.z) < 0.8 && eng.los(e.x, e.y, p.x, p.y)) { bd = d; best = e }
  }
  return best
}
export const sootheAvailable = (eng: Engine) => !!sootheTarget(eng)

/** 每个无面灵每帧调用（在 L11 例程与通用 AI 之前）。返回 true = 本模块接管了本帧移动 */
export function updateFaceling(eng: Engine, e: Entity, dt: number): boolean {
  if (e.def.type !== 'faceling' || e.dead) return false
  const s = state(e), p = eng.player, m = eng.map!
  s.gT += dt; s.modeT += dt
  s.greetCd -= dt; s.pointCd -= dt; s.tantrumCd -= dt
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy), same = Math.abs(p.z - e.z) < 0.8 && !eng.dev.invisible
  const child = s.age === 'child'
  const hostile = e.state === 'chase' || e.state === 'attack'

  // ── 护幼：幼体被打 → 附近成年个体全部激怒（一次）；幼体本身不还手，倒地哭闹
  if (child && e.provoked && !s.alarmed) {
    s.alarmed = true
    let n = 0
    for (const q of m.entities) {
      if (q === e || q.dead || q.def.type !== 'faceling' || facelingAgeOf(q) === 'child') continue
      if (Math.hypot(q.x - e.x, q.y - e.y) > FC.PROTECT_R || Math.abs(q.z - e.z) > 1.2) continue
      q.provoked = true; q.state = 'chase'; q.stateT = 0; q.targetEnt = undefined; n++
    }
    if (n && d < 14) eng.msg(n > 1 ? '附近的无面灵同时转向了你——你伤害了它们的孩子。' : '一个成年无面灵猛地转向了你——你伤害了它的孩子。', 'damage')
    setMode(s, 'tantrum', 'tantrum'); s.cryT = 0
  }
  if (child) {
    // 幼体从不主动攻击（进化种幼体同样）；被激怒只会哭得更凶
    if (hostile) { e.state = 'idle'; e.targetEnt = undefined; e.lungeT = 0 }
    if (e.provoked && s.mode !== 'tantrum' && s.mode !== 'soothed') setMode(s, 'tantrum', 'tantrum')
  }

  // ── 进化种易怒分支：每次进入追击先暴怒前摇（持锤者抡锤），原地不动
  if (!child) {
    const chasing = e.state === 'chase'
    if (chasing && !s.wasChase && evolved(e) && s.mode === 'none') {
      setMode(s, 'rage', e.def.tool ? 'smash' : 'rage')
      if (d < 16) audio.aggro()
    }
    s.wasChase = chasing || e.state === 'attack'
    if (s.mode === 'rage') {
      eng.faceToward(e, p.x, p.y, dt, 6)
      e.lungeT = 0
      if (s.modeT >= (e.def.tool ? FC.SMASH_T : FC.RAGE_T)) { setMode(s, 'none'); return false }
      return true
    }
  }

  switch (s.mode) {
    case 'tantrum': return tantrum(eng, e, s, d, same, dt)
    case 'soothed':
      eng.faceToward(e, p.x, p.y, dt, 3)
      if (s.modeT >= FACELING_CLIPS.soothed.dur) setMode(s, 'hug', 'hug-leg')
      return idle(e)
    case 'hug': {
      // 贴到玩家腿边（正面朝向玩家）抱一会儿；玩家走开就提前松手改为跟随
      const gap = 0.42
      if (d > gap + 0.05 && d < 2.5) { e.targetX = p.x - dx / d * gap; e.targetY = p.y - dy / d * gap; eng.stepEntity(e, 1.1, dt) }
      eng.faceToward(e, p.x, p.y, dt, 8)
      if (s.modeT >= FC.HUG_T || d > 2.5) setMode(s, 'follow', 'hold-hand')
      return idle(e)
    }
    case 'follow': {
      // 牵着手走一小段：停在玩家身侧；跟丢 / 时间到就松手离开（不领养、不跨层）
      if (d > FC.FOLLOW_LOSE || !same || s.modeT >= FC.FOLLOW_T) {
        if (s.modeT >= FC.FOLLOW_T && d < 6) eng.msg('幼年无面灵松开了你的手，慢慢走开了。', 'system')
        setMode(s, 'none'); s.tantrumCd = FC.AFTER_CD; e.provoked = false; e.state = 'wander'; return false
      }
      const nx = -dy / Math.max(d, 1e-3), ny = dx / Math.max(d, 1e-3)
      const tx = p.x + nx * 0.55 - dx / Math.max(d, 1e-3) * 0.25, ty = p.y + ny * 0.55 - dy / Math.max(d, 1e-3) * 0.25
      const td = Math.hypot(tx - e.x, ty - e.y)
      if (td > 0.18) { e.targetX = tx; e.targetY = ty; eng.stepEntity(e, FC.FOLLOW_SPEED * Math.min(2.2, 0.6 + td), dt); e.state = 'wander'; e.animT += dt * 2 }
      else { eng.faceToward(e, p.x + Math.cos(p.facing), p.y + Math.sin(p.facing), dt, 3); e.state = 'idle' }
      s.gW = d < 1.3 ? Math.min(1, s.gW + dt * 3) : Math.max(0, s.gW - dt * 3)
      e.targetEnt = undefined; e.lungeT = 0
      return true
    }
  }

  // ── 以下不接管移动，只叠加手势（街头例程 / 通用游荡照常）
  if (hostile || e.provoked) { if (s.gesture && s.gesture !== 'rage' && s.gesture !== 'smash') play(s, undefined); return false }
  // 幼体随机哭闹（玩家附近才会发作，避免远处空转）
  if (child && same && d < FC.TANTRUM_NEAR && s.tantrumCd <= 0 && Math.random() < FC.TANTRUM_P * dt) {
    setMode(s, 'tantrum', 'tantrum'); s.cryT = 0; s.soothe = 0; s.irked = false
    if (d < 6) eng.msg('幼年无面灵忽然倒在地上，又哭又踢。', 'system')
    return true
  }
  // 一次性手势播完即止
  if (s.gesture && !FACELING_CLIPS[s.gesture].loop && s.gT >= FACELING_CLIPS[s.gesture].dur) play(s, undefined)
  // 失望：招手后被无视（玩家径直走远）
  if (s.gesture === 'wave') {
    eng.faceToward(e, p.x, p.y, dt, 4)
    s.waveAt -= dt
    if (d > FC.IGNORE_R) { play(s, 'sad'); s.waveAt = 0 }
    else if (s.gT > FACELING_CLIPS.wave.dur * 2) play(s, d < FC.NOD_R ? 'nod' : undefined)
    s.gW = 1; return false
  }
  if (s.gesture === 'sad') { if (s.gT > FACELING_CLIPS.sad.dur * 1.5) play(s, undefined); s.gW = 1; return false }
  if (s.gesture === 'point') { if (s.gT > FACELING_CLIPS.point.dur * 2) play(s, undefined); s.gW = 1; return false }
  // 打招呼：玩家进入视线距离、看得见
  if (!s.gesture && same && d < FC.GREET_R && s.greetCd <= 0 && eng.los(e.x, e.y, p.x, p.y)) {
    s.greetCd = FC.GREET_CD
    if (Math.random() < FC.GREET_P) { play(s, d < FC.NOD_R ? 'nod' : 'wave'); s.waveAt = FC.IGNORE_T; s.gW = 1; return false }
  }
  // 指路：玩家在身边站着时，偶尔指向附近地上的东西（成年 / 老年，普通种）
  if (!s.gesture && !child && !evolved(e) && same && d < FC.POINT_R && s.pointCd <= 0) {
    s.pointCd = FC.POINT_CD
    const it = m.items.reduce<{ x: number; y: number; d: number } | undefined>((b, i) => { const di = Math.hypot(i.x - e.x, i.y - e.y); return di < FC.POINT_ITEM_R && (!b || di < b.d) ? { x: i.x, y: i.y, d: di } : b }, undefined)
    if (it && Math.random() < FC.POINT_P) { eng.faceToward(e, it.x, it.y, 1, 99); e.state = 'idle'; e.stateT = FACELING_CLIPS.point.dur * 2; play(s, 'point'); s.gW = 1 }
  }
  return false
}

function idle(e: Entity) { e.state = 'idle'; e.targetEnt = undefined; e.lungeT = 0; return true }

function tantrum(eng: Engine, e: Entity, s: FacelingState, d: number, same: boolean, dt: number) {
  play(s, 'tantrum'); s.gW = Math.min(1, s.gW + dt * 4)
  // 哭声（闷在没有嘴的脸里）；附近流浪者理智缓慢下降
  s.cryT -= dt
  if (s.cryT <= 0) { s.cryT = FC.CRY_EVERY * (0.8 + Math.random() * 0.4); if (d < 18) audio.facelingCry(Math.max(0.15, 1 - d / 18)) }
  if (same && d < FC.CRY_SAN_R) eng.player.sanity = Math.max(eng.sanityFloor ?? 0, eng.player.sanity - FC.CRY_SAN * dt)
  // 安抚：按住特殊交互键，在幼体身边（只推进最近的那一个）
  const held = !!eng.specialHeld && !eng.winRun?.murmur && sootheTarget(eng) === e
  s.soothe = held ? s.soothe + dt : Math.max(0, s.soothe - FC.SOOTHE_DECAY * dt)
  if (s.soothe >= FC.SOOTHE_T) {
    setMode(s, 'soothed', 'soothed'); s.soothe = 0; e.provoked = false; s.alarmed = false; s.irked = false
    eng.player.sanity = Math.min(100, eng.player.sanity + FC.SOOTHE_SAN)
    eng.msg('你蹲下来，轻轻拍着它的背。幼年无面灵的哭声渐渐小了。', 'system')
    return idle(e)
  }
  // 久哭无人理 → 惹恼附近的进化种成体（它们迁怒于在场的流浪者）
  if (!s.irked && s.modeT > FC.IRK_T && same && d < FC.IRK_R) {
    s.irked = true
    for (const q of eng.map!.entities) {
      if (q === e || q.dead || q.def.type !== 'faceling' || !evolved(q) || facelingAgeOf(q) === 'child') continue
      if (Math.hypot(q.x - e.x, q.y - e.y) < FC.IRK_R) { q.provoked = true; q.state = 'chase'; q.stateT = 0 }
    }
  }
  // 被打的委屈也会过去：15 秒后不再算作被激怒（成体那边的仇恨照常走被动实体的平息规则）
  if (e.provoked && s.modeT > 15) e.provoked = false
  // 哭够了自己停（无人安抚）
  if (s.modeT > FC.TANTRUM_MAX && !e.provoked) { setMode(s, 'none', 'sad'); s.tantrumCd = FC.TANTRUM_CD; return false }
  return idle(e)
}
