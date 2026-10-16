// v77：窃皮者（Entity 10）专属 AI——依据中文维基 Entity 10：
//  · 穿上被害者的人皮伪装成人类（随机 NPC 外观）；会模仿听过的人声，但并不懂自己在说什么——
//    表现为头顶气泡：从其他 NPC 的自言自语里随机借来的几句话（夹杂一两句外语），前后接不上、反复说。
//    看不见它时，远处会传来同样的人声，引诱落单的流浪者靠近。
//  · 饥饿时寻找落单的人类，徒手撕碎——伪装态装作流浪者走近，近身才剥皮暴起；真身则直接追猎。
//  · 人皮约「24 小时」后被体表消化（游戏里按真实时间压缩：一轮 8～10 分钟），随后进入温顺期：
//    真身漫无目的地游荡，不主动攻击；激怒它（攻击、近处奔跑、贴身逗留、手电直照它的脸约 2 秒）会转为敌意。
//  · 温顺期过后再次饥饿；在玩家看不见的地方「进食」后换上新的人皮。
//  · 血液完全半透明——伪装中被打伤会立刻露馅（「血液鲜红，他们仍在。血液透明，赶快逃开。」）。
//  · 「落单」：玩家 12 米内没有友方 NPC。不落单时，伪装者只在附近游荡嘀咕，真身保持距离不下手。
// 运行时状态保存在 e.ss，生命周期与本层活动实体一致；本轮仅接入单人游戏。
import { audio } from '../core/audio'
import type { Entity } from '../entities'
import type { Engine } from '../engine'
import { NPCS } from '../content/npcs'
import { bandOfPlayerZ } from '../world/mapgen'

export type SkinPhase = 'skinned' | 'reveal' | 'docile' | 'hunt' | 'rage'
export interface SkinStealerState {
  phase: SkinPhase
  t: number
  timer: number // skinned：人皮剩余（被消化前）；docile：温顺剩余；hunt：饥饿追猎已持续
  skinSeed: number // 当前人皮外观种子（渲染层据此换模型）
  lines: string[] // 借来的台词（随人皮更换）
  lineIdx: number
  bubbleText: string; bubbleT: number
  talkCd: number; voiceCd: number
  lastHp: number
  lightT: number; lingerT: number
  unseenT: number // 玩家看不见它的累计时间（离屏进食判定）
  lostT: number
  lastX: number; lastY: number // 最后目击位置（世界坐标）
  strikeT?: number
  emerge: number // 渲染：剥皮现形后的撑开进度 1 → 0
}

// 时长（秒）：一轮 ≈ 人皮 240～300 + 温顺 150～180 + 饥饿追猎 60～120 ≈ 8～10 分钟
export const SKIN_TIME: [number, number] = [240, 300]
export const DOCILE_TIME: [number, number] = [150, 180]
export const HUNT_MIN = 60, HUNT_MAX = 120
const FEED_UNSEEN = 25 // 饥饿期间连续 25 秒不在玩家视野内 → 离屏进食，换上新人皮
const ALONE_R = 12

// 它「听过」的外语（维基：通常是不同的语言）
const FOREIGN = ['Hello? Is anyone there?', 'Hilfe… bitte…', '¿Hola? ¿Hay alguien?', 'Bonjour ? Vous êtes là ?', 'Помогите…', 'すみません…誰か…', 'Ciao… ciao…', '여보세요?']
let IDLE_POOL: string[] | null = null
function idlePool(): string[] {
  if (!IDLE_POOL) {
    const set = new Set<string>()
    for (const n of Object.values(NPCS)) if (n.faction !== 'jerry') for (const l of n.idle ?? []) if (l && l.length <= 22) set.add(l)
    IDLE_POOL = [...set]
    if (!IDLE_POOL.length) IDLE_POOL = ['有人吗？', '这边……', '我好像迷路了。']
  }
  return IDLE_POOL
}
const hash = (n: number) => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296 }
/** 按人皮种子借 3 句：两句其他 NPC 的自言自语 + 一句外语 */
export function borrowLines(seed: number): string[] {
  const pool = idlePool()
  const a = pool[Math.floor(hash(seed) * pool.length)]
  let b = pool[Math.floor(hash(seed + 17) * pool.length)]
  if (b === a && pool.length > 1) b = pool[(pool.indexOf(a) + 1) % pool.length]
  return [a, b, FOREIGN[Math.floor(hash(seed + 31) * FOREIGN.length)]]
}

const newFrame = (map: Engine['map']) => ({ map, px: 0, py: 0, speed: 0, init: false, told: new Set<string>() })
let frames = new WeakMap<Engine, ReturnType<typeof newFrame>>()
function frameFor(eng: Engine) {
  let f = frames.get(eng)
  if (!f || f.map !== eng.map) { f = newFrame(eng.map); frames.set(eng, f) }
  return f
}
export function resetSkinStealerFrame(eng?: Engine) { if (eng) frames.delete(eng); else frames = new WeakMap() }
export function beginSkinStealerFrame(eng: Engine, dt: number) {
  const F = frameFor(eng), p = eng.player
  const px = p.x + (eng.map?.inf?.ox ?? 0), py = p.y + (eng.map?.inf?.oy ?? 0)
  if (!F.init || dt <= 0) { F.px = px; F.py = py; F.init = true }
  const sp = dt > 0 ? Math.hypot(px - F.px, py - F.py) / dt : 0
  F.speed = F.speed * 0.7 + Math.min(12, sp) * 0.3
  F.px = px; F.py = py
}
const once = (eng: Engine, key: string, text: string, kind: 'system' | 'damage' = 'system') => { const F = frameFor(eng); if (!F.told.has(key)) { F.told.add(key); eng.msg(text, kind) } }
const span = (r: [number, number], k: number) => r[0] + (r[1] - r[0]) * k
const setPhase = (s: SkinStealerState, ph: SkinPhase) => { if (s.phase !== ph) { s.phase = ph; s.t = 0 } }

/** 初始化：地图标记了 human（L3/L5 等）或按 id 抽到「穿着人皮」则从伪装态开始；否则温顺或饥饿 */
export function initSkinStealer(eng: Engine, e: Entity, phase?: SkinPhase): SkinStealerState {
  const r = hash(e.id * 7 + 3)
  const ph: SkinPhase = phase ?? e.def.skinPhase ?? (e.disguised === 'human' || r < 0.5 ? 'skinned' : r < 0.8 ? 'docile' : 'hunt')
  const seed = (e.id * 2654435761) >>> 0
  const s: SkinStealerState = {
    phase: ph, t: 0,
    timer: ph === 'skinned' ? span(SKIN_TIME, hash(e.id + 1)) * (0.35 + 0.65 * hash(e.id + 2)) : ph === 'docile' ? span(DOCILE_TIME, hash(e.id + 1)) * (0.4 + 0.6 * hash(e.id + 2)) : 0,
    skinSeed: seed, lines: borrowLines(seed), lineIdx: Math.floor(hash(e.id + 5) * 3),
    bubbleText: '', bubbleT: 0, talkCd: 1 + hash(e.id + 6) * 5, voiceCd: 8 + hash(e.id + 7) * 12,
    lastHp: Math.max(e.hp, e.def.hp), lightT: 0, lingerT: 0, unseenT: 0, lostT: 0,
    lastX: e.x + (eng.map?.inf?.ox ?? 0), lastY: e.y + (eng.map?.inf?.oy ?? 0), emerge: 0,
  }
  e.ss = s
  e.disguised = ph === 'skinned' ? 'human' : undefined
  if (ph === 'rage') e.provoked = true
  return s
}

/** 玩家是否落单：附近没有活着的友方 NPC */
export function playerAlone(eng: Engine): boolean {
  const p = eng.player
  for (const n of eng.npcs ?? []) if (!n.dead && !n.hostile && (n.floor ?? 0) === bandOfPlayerZ(eng.map!, p.z, p.x, p.y)
    && Math.hypot(n.x - p.x, n.y - p.y) < ALONE_R && eng.los(p.x, p.y, n.x, n.y)) return false
  return true
}

function say(s: SkinStealerState, t = 3) {
  s.bubbleText = s.lines[s.lineIdx % s.lines.length]
  s.lineIdx++
  s.bubbleT = t
}

/** 与伪装中的「流浪者」搭话（interact 钩子）：不会进入对话，只会再冒一句借来的话 */
export function skinStealerTalk(eng: Engine, e: Entity) {
  const s = e.ss ?? initSkinStealer(eng, e)
  if (s.phase !== 'skinned') return
  e.facing = Math.atan2(eng.player.y - e.y, eng.player.x - e.x)
  say(s, 3.2); s.talkCd = 4 + Math.random() * 3
  audio.uiTick()
  if (s.lineIdx > 3) once(eng, 'sstalk', '它只是重复着那几句话，眼睛没有焦点，好像根本没听懂你在说什么。')
}

/** 受击钩子（combat）：返回是否是半透明血（用于血迹颜色与提示） */
export function skinStealerHit(eng: Engine, e: Entity): void {
  if (e.def.type !== 'skinstealer') return
  if (e.disguised) once(eng, 'ssblood', '伤口里流出的血是透明的——它不是人！血液透明，赶快逃开。', 'damage')
  const s = e.ss ?? initSkinStealer(eng, e)
  if (!e.dead && e.hp > 0 && e.hp < s.lastHp) {
    if (s.phase === 'skinned') reveal(eng, e, s, '那个「流浪者」的皮肉像外套一样翻卷脱落——是窃皮者！')
    else if (s.phase === 'docile') provoke(eng, e, s, '窃皮者被激怒了，长臂一甩朝你扑来！')
    s.lastHp = e.hp
  }
}

function reveal(eng: Engine, e: Entity, s: SkinStealerState, text: string) {
  e.disguised = undefined
  setPhase(s, 'reveal'); s.emerge = 1; s.bubbleT = 0
  e.state = 'chase'; e.stateT = 0
  eng.msg(text, 'damage'); audio.aggro()
  for (let i = 0; i < 16; i++) { // 翻卷脱落的人皮碎屑（很快被它吸收，不留在地上）
    const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.4
    eng.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.6 + Math.random() * 0.4, color: i % 3 ? '#c99a7a' : '#8f5a48', size: 0.05 + Math.random() * 0.05, z: e.z + 0.8 + Math.random() * 0.9, vz: -0.5 - Math.random() })
  }
}

function provoke(eng: Engine, e: Entity, s: SkinStealerState, text: string) {
  e.provoked = true
  setPhase(s, 'rage'); s.lostT = 0
  eng.msg(text, 'damage'); audio.aggro()
}

/** 换上新人皮（离屏进食后） */
function newSkin(e: Entity, s: SkinStealerState) {
  s.skinSeed = (Math.imul(s.skinSeed ^ 0x5bd1e995, 2246822519) + e.id) >>> 0
  s.lines = borrowLines(s.skinSeed); s.lineIdx = 0
  s.timer = span(SKIN_TIME, hash(s.skinSeed))
  e.disguised = 'human'; e.provoked = false
  s.strikeT = undefined; s.lightT = 0; s.lingerT = 0; s.unseenT = 0; s.lostT = 0
  setPhase(s, 'skinned')
}

export function updateSkinStealer(eng: Engine, e: Entity, dt: number, d: number, dmgMult: number) {
  const F = frameFor(eng), p = eng.player, def = e.def, m = eng.map!
  const ox = m.inf?.ox ?? 0, oy = m.inf?.oy ?? 0
  const s = e.ss ?? initSkinStealer(eng, e)
  s.t += dt; s.bubbleT = Math.max(0, s.bubbleT - dt); s.talkCd -= dt; s.voiceCd -= dt
  s.emerge = Math.max(0, s.emerge - dt * 1.6)
  const hurt = e.hp < s.lastHp
  s.lastHp = e.hp
  const zOk = Math.abs(e.z - p.z) < 1.4
  const los = !eng.dev.invisible && zOk && d < 26 && eng.los(e.x, e.y, p.x, p.y)
  const alone = playerAlone(eng)
  // 玩家看得见它（离屏进食/消化只在看不见时发生）
  const watched = los && eng.inView(e.x, e.y, 26)
  s.unseenT = watched ? 0 : s.unseenT + dt
  let speed = 0, tx = e.x, ty = e.y, face: [number, number] | null = null

  switch (s.phase) {
    // ---------- 穿着人皮：装作流浪者；落单就走近，近身剥皮暴起 ----------
    case 'skinned': {
      e.disguised = 'human'
      s.timer -= dt
      if (hurt) { reveal(eng, e, s, '那个「流浪者」的皮肉像外套一样翻卷脱落——是窃皮者！'); break }
      if (s.timer <= 0 && !watched) { e.disguised = undefined; setPhase(s, 'docile'); s.timer = span(DOCILE_TIME, Math.random()); break } // 人皮被体表消化
      if (alone && los && d < 2.0 && eng.meleeZOk(e)) { reveal(eng, e, s, '那个「流浪者」的皮肉像外套一样翻卷脱落——是窃皮者！'); break }
      if (alone && los && d < 16) {
        // 装作普通流浪者走近，边走边说借来的话
        e.state = 'wander'
        tx = p.x; ty = p.y; speed = def.speed * 0.42; face = [p.x, p.y]
        if (s.talkCd <= 0 && d < 12) { say(s); s.talkCd = 5 + Math.random() * 4 }
        once(eng, 'ssnear', '一个流浪者朝你走来，嘴里断断续续地念叨着什么。')
      } else if (alone && !los && d < 20 && zOk) {
        // 看不见时模仿人声引诱
        e.state = 'investigate'
        tx = p.x; ty = p.y; speed = def.speed * 0.36
        if (s.voiceCd <= 0) {
          const line = s.lines[s.lineIdx++ % s.lines.length]
          eng.msg(`远处有人在说：「${line}」`, 'system')
          s.voiceCd = 18 + Math.random() * 10
          once(eng, 'ssvoice', '那声音一直重复着同样几句话。别相信不怎么说话、或者只会随口念叨几句的人。')
        }
      } else {
        // 不落单 / 远离：在附近游荡嘀咕
        e.state = 'wander'
        if (e.stateT <= 0 || Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.4) eng.wanderTarget(e)
        tx = e.targetX; ty = e.targetY; speed = def.speed * 0.3
        if (s.talkCd <= 0 && d < 14) { say(s); s.talkCd = 7 + Math.random() * 5 }
        if (!alone && los && d < 3) face = [p.x, p.y]
      }
      break
    }
    // ---------- 剥皮现形（约 0.7 秒，原地撑开）----------
    case 'reveal': {
      e.state = 'chase'; face = [p.x, p.y]
      if (s.t > 0.7) { setPhase(s, 'hunt'); s.timer = 0; s.unseenT = 0; e.provoked = true }
      break
    }
    // ---------- 温顺：漫无目的地游荡；激怒即转敌意 ----------
    case 'docile': {
      e.state = 'wander'; e.provoked = false
      s.timer -= dt
      if (los && d < 10) once(eng, 'ssdocile', '一个高瘦的苍黄人形在漫无目的地游荡，深陷的眼窝里只有两点白。它好像没注意到你——慢慢离开，别惊动它。')
      if (hurt) { provoke(eng, e, s, '窃皮者被激怒了，长臂一甩朝你扑来！'); break }
      // 近处奔跑
      if (los && d < 4.5 && eng.input.sprint && F.speed > 4) { provoke(eng, e, s, '你的奔跑惊动了窃皮者——它猛地转过头来！'); break }
      // 贴身逗留
      if (los && d < 1.6) s.lingerT += dt; else s.lingerT = Math.max(0, s.lingerT - dt)
      if (s.lingerT > 3) { provoke(eng, e, s, '你靠得太近了。窃皮者深陷的白眼转向你，身体绷紧——'); break }
      // 手电直照它的脸
      if (los && d < 9 && p.flashlight && eng.lookingAt(e)) {
        s.lightT += dt
        if (s.lightT > 0.8) once(eng, 'sslight', '手电光落在它脸上，它的头慢慢偏了过来……把光移开。')
      } else s.lightT = Math.max(0, s.lightT - dt * 0.5)
      if (s.lightT > 2) { provoke(eng, e, s, '强光照得它发狂——窃皮者朝光源扑来！'); s.lightT = 0; break }
      if (s.timer <= 0) { setPhase(s, 'hunt'); s.timer = 0; break }
      if (e.stateT <= 0 || Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.4) eng.wanderTarget(e)
      tx = e.targetX; ty = e.targetY; speed = def.speed * 0.26
      break
    }
    // ---------- 饥饿真身：追猎落单者；看不见时离屏进食 ----------
    case 'hunt':
    case 'rage': {
      const rage = s.phase === 'rage'
      if (s.phase === 'hunt') s.timer += dt
      const sees = los && d < def.sight * 1.5
      if (sees) { s.lastX = p.x + ox; s.lastY = p.y + oy; s.lostT = 0 } else s.lostT += dt
      if (hurt && !rage) e.provoked = true
      if (rage && s.lostT > 10) { setPhase(s, 'docile'); s.timer = span(DOCILE_TIME, Math.random()); s.strikeT = undefined; e.provoked = false; break }
      if (!rage && s.unseenT > FEED_UNSEEN && s.timer > HUNT_MIN * 0.5 && d > 12) { newSkin(e, s); break }
      if (!rage && s.timer > HUNT_MAX && !watched) { newSkin(e, s); break }
      if (sees && (alone || rage || e.provoked)) {
        e.state = 'chase'
        once(eng, 'sshunt', '窃皮者四肢细长，饿着肚子，正朝落单的你走来。', 'damage')
        tx = p.x; ty = p.y; speed = def.speed * (rage ? 1.1 : 1); face = [p.x, p.y]
      } else if (sees) {
        // 有同伴在场：保持 6 米左右，不下手
        e.state = 'investigate'; face = [p.x, p.y]
        if (d < 6) { const a = Math.max(0.1, d); tx = e.x + (e.x - p.x) / a * 2; ty = e.y + (e.y - p.y) / a * 2; speed = def.speed * 0.4 }
      } else if (s.lostT < 8) {
        e.state = 'investigate'
        tx = s.lastX - ox; ty = s.lastY - oy; speed = def.speed * 0.7
      } else {
        e.state = 'wander'
        if (e.stateT <= 0 || Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.4) eng.wanderTarget(e)
        tx = e.targetX; ty = e.targetY; speed = def.speed * 0.4
      }
      // 徒手撕扯：1.4 米内前摇 0.3 秒，命中
      if (!los) s.strikeT = undefined
      if (s.strikeT !== undefined) {
        s.strikeT -= dt; face = [p.x, p.y]; tx = p.x; ty = p.y; speed = def.speed * 0.5
        if (s.strikeT <= 0) {
          s.strikeT = undefined
          if (d < 1.6 && los && eng.meleeZOk(e) && !eng.dev.invisible) {
            eng.hurtPlayer(def.damage * dmgMult, def.name)
            eng.camShake = Math.min(1, eng.camShake + 0.5)
            once(eng, 'sstear', '它用那双长得过分的手抓住你，想把你徒手撕开！', 'damage')
          }
        }
      } else if ((alone || rage || e.provoked) && los && d < 1.4 && e.attackCd <= 0 && eng.meleeZOk(e)) {
        e.attackCd = 1.4; e.lungeT = 0.32; s.strikeT = 0.3
      }
      break
    }
  }

  if (speed > 0) {
    e.targetX = tx; e.targetY = ty
    const stuck = eng.stepEntity(e, speed, dt)
    if (stuck && e.state === 'wander') eng.wanderTarget(e)
    e.animT += dt * speed
  }
  if (face) eng.faceToward(e, face[0], face[1], dt, 6)
  else if (speed > 0) eng.faceToward(e, tx, ty, dt, 6)
}
