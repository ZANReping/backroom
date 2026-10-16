// v61：笑魇（Entity 3）专属 AI——取代 entityAI 中旧的 lightHunter 分支。
// 核心机制（按 Wikidot 条目）：
//  · 趋光：手电亮着就会被远处的笑魇察觉并引来；关灯后失去光源目标。
//  · 对峙：盯住它（视线锥内）且不奔跑——它停下；黑暗中持续对视会让它沉回黑暗，亮灯时只会缓慢蠕近。
//  · 恐慌：近距离奔跑、巨响、攻击它，或在对峙中移开视线，都会触发扑击。
//  · 诱饵：抛出的荧光棒（饥饿笑魇还认地上的食物）会把它引开，它会盯着诱饵咧嘴，随后咬碎。
//  · 群猎：一只扑击时会唤醒附近同类；犬形笑魇成群包抄，从你背后扑。
//  · 扼颈：命中后减速并抽空体力。
// 变种差异见 entities/smilers.ts。状态只存于 e.sm（不入存档/联机）。
import { audio } from '../core/audio'
import { ITEMS } from '../content/items'
import { makeEntity, type Entity } from '../entities'
import { SMILER_KINDS, pickSmilerKind, smilerDefinition, type SmilerKind, type SmilerPhase, type SmilerState } from '../entities/smilers'
import type { Engine } from '../engine'
import { bandOfZ, floorHeight } from '../world/mapgen'
import { SMILER_STOP, SMILER_STRIKE, smilerReach, greatCeilingBend, greatWalkFactor, smilerApproachLimit } from '../entities/smilerPose'
import { smilerHeadroom } from '../world/smilerClearance'
import { WALL_H } from '../renderer/shared'

interface Lure { key: string; x: number; y: number; z: number; landed: boolean; food: boolean; itemId?: number }
const newFrame = (map: Engine['map']) => ({
  map,
  lightOn: false, prevLight: false, flashOnEdge: false,
  px: 0, py: 0, speed: 0, panic: false, init: false,
  lures: [] as Lure[],
  spawns: [] as Entity[],
  announced: new Set<SmilerKind>(),
  packSeq: 1,
})
// Each run/map owns its perception cache and queued pack members.
const frames = new WeakMap<Engine, ReturnType<typeof newFrame>>()
function frameFor(eng: Engine) {
  let frame = frames.get(eng)
  if (!frame || frame.map !== eng.map) { frame = newFrame(eng.map); frames.set(eng, frame) }
  return frame
}
function consumeLure(eng: Engine, lure: Lure): boolean {
  const m = eng.map!, index = m.items.findIndex(it => it.id === lure.itemId)
  if (index < 0) return false
  const [item] = m.items.splice(index, 1)
  m.inf?.taken.add(item.id) // Same ledger as pickup: streamed chunks cannot restore a consumed lure.
  const F = frameFor(eng), cached = F.lures.indexOf(lure)
  if (cached >= 0) F.lures.splice(cached, 1)
  return true
}

/** 每帧在实体循环前调用一次：缓存玩家光照/恐慌状态与诱饵列表 */
export function beginSmilerFrame(eng: Engine, dt: number, lightOn: boolean) {
  const F = frameFor(eng)
  const p = eng.player, m = eng.map!
  const px = p.x + (m.inf?.ox ?? 0), py = p.y + (m.inf?.oy ?? 0)
  if (!F.init || dt <= 0) { F.px = px; F.py = py; F.init = true }
  const sp = dt > 0 ? Math.hypot(px - F.px, py - F.py) / dt : 0
  F.speed = F.speed * 0.7 + Math.min(12, sp) * 0.3
  F.px = px; F.py = py
  F.panic = eng.input.sprint && F.speed > 4.4
  F.flashOnEdge = lightOn && !F.prevLight
  F.prevLight = F.lightOn = lightOn
  F.lures.length = 0
  if (!m.entities.some((e) => e.def.type === 'smiler' && !e.dead)) return
  for (const it of m.items) {
    if (it.fake) continue
    const food = ITEMS[it.type]?.use === 'eat'
    if (it.type === 'glowstick' || food) F.lures.push({ key: `i${it.id}`, x: it.x, y: it.y, z: it.z ?? floorHeight(m, it.x, it.y), landed: true, food, itemId: it.id })
  }
  for (const pr of eng.projectiles) if (pr.type === 'glowstick' && !pr.done) F.lures.push({ key: `p${pr.id}`, x: pr.x, y: pr.y, z: pr.z, landed: false, food: false })
}

/** 实体循环后调用：把犬形笑魇的同群个体加入地图 */
export function flushSmilerSpawns(eng: Engine) {
  const F = frameFor(eng)
  if (!F.spawns.length) return
  eng.map!.entities.push(...F.spawns)
  F.spawns.length = 0
}

/** Natural canids recruit a pack; developer single-form summons pass spawnPack=false. */
export function initSmiler(eng: Engine, e: Entity, kind?: SmilerKind, packId = 0, spawnPack = true): SmilerState {
  const F = frameFor(eng)
  const k = kind ?? e.def.smilerKind ?? pickSmilerKind(eng.levelDef.id, !!e.blackoutSpawn)
  const K = SMILER_KINDS[k]
  const healthRatio = Math.max(0, Math.min(1, e.hp / e.def.hp))
  e.def = smilerDefinition(k, e.def)
  e.hp = K.hp * healthRatio // Initializing after the first hit must not heal or kill a living entity.
  const s: SmilerState = {
    kind: k, phase: 'drift', t: 0, aware: 0, gaze: 0, glare: 0, glareCd: 0, lastHp: K.hp,
    lureX: 0, lureY: 0, orbit: (e.id * 2.399) % (Math.PI * 2), packId, vis: k === 'phantom' ? 0 : 1, grin: 0.1, glow: 0.8,
    giggleT: 2 + (e.id % 5),
  }
  e.sm = s
  // 犬形：成群出现（2~3 只），同群共享 packId
  if (k === 'canid' && packId === 0 && spawnPack) {
    s.packId = F.packSeq++
    const m = eng.map!
    const n = 1 + (Math.random() < 0.55 ? 1 : 0)
    for (let i = 0; i < n; i++) {
      for (let t = 0; t < 12; t++) {
        const a = Math.random() * Math.PI * 2, r = 1.2 + Math.random() * 1.8
        const x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r
        const z = eng.entityWalkH(m, Math.floor(x), Math.floor(y), bandOfZ(e.z))
        if (z === null || Math.abs(z - e.z) > 1.4) continue
        const c = makeEntity('smiler', x, y, z)
        c.blackoutSpawn = e.blackoutSpawn
        initSmiler(eng, c, 'canid', s.packId)
        F.spawns.push(c)
        break
      }
    }
  }
  return s
}

/** noiseEvent 钩子：笑魇记下声源（大声或奔跑声会在近距离触发扑击） */
export function smilerHear(eng: Engine, e: Entity, x: number, y: number, radius: number, sprint: boolean) {
  const s = e.sm ?? initSmiler(eng, e)
  const K = SMILER_KINDS[s.kind]
  const d0 = Math.hypot(e.x - x, e.y - y)
  const effR = Math.max(radius, K.hearing * (sprint ? 1.5 : 1))
  if (d0 >= effR) return
  // World coordinates survive streamed-window recentering.
  s.heardX = x + (eng.map!.inf?.ox ?? 0); s.heardY = y + (eng.map!.inf?.oy ?? 0); s.heardT = s.kind === 'starved' ? 12 : 5
  s.heardLoud = radius >= 10 || sprint
  if (s.kind === 'starved') s.aware = Math.max(s.aware, 8)
}

const setPhase = (s: SmilerState, ph: SmilerPhase) => { if (s.phase !== ph) { s.phase = ph; s.t = 0 } }

export function updateSmiler(eng: Engine, e: Entity, dt: number, d: number, dmgMult: number, l3: boolean) {
  const F = frameFor(eng)
  const p = eng.player, m = eng.map!
  const s = e.sm ?? initSmiler(eng, e)
  const K = SMILER_KINDS[s.kind]
  const def = e.def
  s.t += dt; s.aware = Math.max(0, s.aware - dt); s.glareCd -= dt; s.giggleT -= dt
  if (s.strikeAge !== undefined) {
    s.strikeAge += dt
    if (s.strikeAge >= SMILER_STRIKE.duration) s.strikeAge = undefined
  }
  if (s.heardT !== undefined) { s.heardT -= dt; if (s.heardT <= 0) { s.heardT = undefined; s.heardLoud = false } }
  const hurt = e.hp < s.lastHp
  s.lastHp = e.hp

  const near = d < 18
  const los = near && eng.los(e.x, e.y, p.x, p.y)
  const gazing = d < 10 && los && eng.lookingAt(e)
  const lit = F.lightOn
  const beamOnIt = lit && gazing && d < 11
  const zOk = Math.abs(e.z - p.z) < 1.4

  // ---------- 感知 ----------
  let sensed = false
  if (zOk) {
    if (lit && los && d < K.sight + (beamOnIt ? 3 : 0)) sensed = true // 看见光源
    if (lit && d < K.lightPull && (los || d < 5)) sensed = true // 被光晕吸引（隔着转角也能感到）
    if (d < 1.8) sensed = true
    if (l3 && los && d < K.sight) sensed = true // L3：高智能个体无视光照
  }
  if (sensed) s.aware = Math.max(s.aware, s.kind === 'starved' ? 10 : 3.5)
  // 关灯：仅凭光源锁定的个体很快失去目标（L3/饥饿/听见声音除外）
  if (!lit && !l3 && s.kind !== 'starved' && !s.heardT && d > 2.2 && s.aware > 1.2 && s.phase !== 'pounce' && s.phase !== 'standoff') s.aware = 1.2

  const beginPounce = (why: string) => {
    if (s.phase === 'pounce') return
    setPhase(s, 'pounce'); s.aware = Math.max(s.aware, 6); s.gaze = 0
    if (def.aggroStinger && d < 16) audio.aggro()
    if (d < 14) audio.smilerGiggle(Math.max(0.25, 1 - d / 14), s.kind === 'great' ? 0.6 : s.kind === 'phantom' ? 1.5 : 1)
    if (why && d < 12) eng.msg(why, 'damage')
    // 群猎：唤醒附近同类
    for (const q of m.entities) {
      if (q === e || q.dead || q.def.type !== 'smiler' || !q.sm) continue
      const qd = Math.hypot(q.x - e.x, q.y - e.y)
      if (qd < 12 || (s.packId && q.sm.packId === s.packId)) {
        q.sm.aware = Math.max(q.sm.aware, 6)
        if (q.sm.phase === 'drift' || q.sm.phase === 'lure' || q.sm.phase === 'feed') setPhase(q.sm, 'stalk')
      }
    }
  }

  // 首次遭遇某变种：给出可读的提示
  if (!F.announced.has(s.kind) && (sensed || (los && d < 8)) && (s.kind !== 'phantom' || s.vis > 0.5)) {
    F.announced.add(s.kind)
    eng.msg(K.blurb, 'system')
  }

  // ---------- 事件触发 ----------
  if (hurt) {
    if (s.kind === 'great') { s.aware = 8; if (d < 5) beginPounce('') }
    else if (e.hp < K.hp * 0.35) { setPhase(s, 'retreat'); s.aware = 0; if (d < 12) eng.msg(`${K.name}的笑容碎裂了一瞬——它缩回黑暗里。`, 'system') }
    else beginPounce('')
  }
  if (s.kind === 'phantom' && F.flashOnEdge && d < 9 && (los || d < 4) && zOk) beginPounce('手电亮起的瞬间，一对环形的眼睛冲你扑了过来！')
  if (s.aware > 0 && d < 8 && F.panic && s.phase !== 'retreat' && s.phase !== 'stagger') beginPounce(s.phase === 'standoff' ? '你转身就跑——它不再忍耐。' : '')
  if (s.aware > 0 && d < 9 && s.heardLoud && s.phase !== 'retreat') { s.heardLoud = false; beginPounce('') }

  // 巨笑魇：持续强光灼眼 → 踉跄
  if (s.kind === 'great') {
    if (beamOnIt && s.glareCd <= 0) s.glare += dt
    else s.glare = Math.max(0, s.glare - dt * 0.6)
    if (s.glare > 1.3) {
      s.glare = 0; s.glareCd = 7
      e.stunT = 2.4
      setPhase(s, 'stagger')
      eng.msg('强光灌进那几只巨大的眼睛——巨笑魇抱头踉跄。', 'system')
    }
  }

  // ---------- 诱饵 ----------
  let lure: Lure | null = null
  if (F.lures.length && s.phase !== 'pounce' && s.phase !== 'retreat') {
    let best = 1e9
    for (const L of F.lures) {
      if (Math.abs(L.z - e.z) > (L.landed ? 1.4 : 2.5) || !eng.los(e.x, e.y, L.x, L.y)) continue
      if (L.food && s.kind !== 'starved') continue
      if (!L.food && s.kind === 'starved' && s.aware > 0) continue // 饥饿笑魇被声音/食物驱动，锁定后不理荧光棒
      const ld = Math.hypot(L.x - e.x, L.y - e.y)
      const reach = L.food ? 9 : s.kind === 'great' ? 5 : 10
      if (ld > reach) continue
      // 玩家近在眼前且光亮时，诱饵必须比玩家更近才有效
      if (s.aware > 0 && lit && d < 3 && ld > d) continue
      if (ld < best) { best = ld; lure = L }
    }
  }
  if (lure && s.phase !== 'feed') { setPhase(s, 'lure'); s.lureKey = lure.key; s.lureX = lure.x; s.lureY = lure.y }

  // ---------- 对峙 / 移开视线 ----------
  const gazeWorks = K.gazeHold > 0 && !l3
  if (s.aware > 0 && gazing && gazeWorks && d < 8 && !F.panic && (s.phase === 'stalk' || s.phase === 'standoff' || s.phase === 'flank')) {
    if (s.kind === 'canid') { setPhase(s, 'retreat'); s.t = 2.6 } // 被盯住的那只退开（retreat 只持续 1.4s）
    else { setPhase(s, 'standoff'); s.gaze += dt }
  }
  if (s.phase === 'standoff' && !gazing) {
    if (d < 7 && s.aware > 0) { setPhase(s, 'stalk'); s.gaze = 0; s.brokeGaze = 1.6 } // 一移开视线就加速逼近
    else setPhase(s, 'drift')
  }
  if (s.phase === 'standoff') {
    if (K.gazeHold === Infinity) {
      if (!lit && s.gaze > 3.5) { setPhase(s, 'retreat'); s.aware = 0; if (d < 12) eng.msg('它在你的注视下一点点沉回黑暗。', 'system') }
    } else if (s.gaze > K.gazeHold) beginPounce(s.kind === 'starved' ? '饥饿压过了畏惧——它不再理会你的目光。' : '')
  }
  if (s.brokeGaze) s.brokeGaze = Math.max(0, s.brokeGaze - dt)

  // ---------- 状态推进 ----------
  if (s.aware > 0 && (s.phase === 'drift')) setPhase(s, s.kind === 'canid' ? 'flank' : 'stalk')
  if (s.aware <= 0 && (s.phase === 'stalk' || s.phase === 'standoff' || s.phase === 'flank')) setPhase(s, 'drift')

  let speed = 0, tx = e.x, ty = e.y
  switch (s.phase) {
    case 'drift': {
      e.state = 'wander'
      if (s.heardT && s.heardX !== undefined) { tx = s.heardX - (m.inf?.ox ?? 0); ty = s.heardY! - (m.inf?.oy ?? 0); speed = def.speed * 0.6 }
      else {
        if (e.stateT <= 0 || Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.4) eng.wanderTarget(e)
        tx = e.targetX; ty = e.targetY; speed = def.speed * 0.38
      }
      break
    }
    case 'lure': {
      e.state = 'investigate'
      const L = F.lures.find((x) => x.key === s.lureKey)
      if (!L) { setPhase(s, 'drift'); break }
      tx = L.x; ty = L.y; speed = def.speed * 0.95
      if (Math.hypot(L.x - e.x, L.y - e.y) < (s.kind === 'great' ? 1.4 : 0.75) && L.landed) setPhase(s, 'feed')
      break
    }
    case 'feed': {
      e.state = 'investigate'
      const L = F.lures.find((x) => x.key === s.lureKey)
      if (!L) { setPhase(s, 'drift'); break }
      eng.faceToward(e, L.x, L.y, dt, 6)
      const dur = L.food ? 4.5 : s.kind === 'common' ? 6 : s.kind === 'canid' ? 3 : s.kind === 'phantom' ? 1.6 : s.kind === 'great' ? 0.4 : 4
      if (s.t > dur) {
        const consumed = consumeLure(eng, L)
        if (consumed && d < 14) {
          eng.msg(L.food ? `${K.name}把地上的食物连包装一起嚼碎了。` : `「咔嚓」——${K.name}咬碎了荧光棒，四下重归黑暗。`, 'system')
          audio.smilerGiggle(Math.max(0.2, 1 - d / 14), 1.2)
        }
        setPhase(s, 'drift'); s.aware = Math.min(s.aware, 1)
      }
      break
    }
    case 'stalk': {
      e.state = 'chase'
      const seen = lit || l3 || d < 2.2 || s.kind === 'starved'
      if (seen || !s.heardT) { tx = p.x; ty = p.y } else { tx = s.heardX! - (m.inf?.ox ?? 0); ty = s.heardY! - (m.inf?.oy ?? 0) }
      speed = def.speed * (s.brokeGaze ? 1.3 : 0.82)
      break
    }
    case 'standoff': {
      e.state = 'chase'
      eng.faceToward(e, p.x, p.y, dt, 6)
      // 亮灯：被光牵引着缓慢蠕近（停在 2.2m）；黑暗：原地不动
      if (lit && d > 2.2) { tx = p.x; ty = p.y; speed = def.speed * 0.2 }
      break
    }
    case 'flank': {
      e.state = 'chase'
      // 绕到玩家侧后方：目标角向玩家视线反方向偏移
      const behind = eng.viewAngle(e.x, e.y) > 1.3
      const a0 = Math.atan2(e.y - p.y, e.x - p.x)
      s.orbit += dt * (behind ? 0.2 : 0.9) * (e.id % 2 ? 1 : -1)
      const a = a0 + (behind ? 0 : 0.6 * (e.id % 2 ? 1 : -1))
      const r = 3.1 + Math.sin(s.orbit) * 0.5
      tx = p.x + Math.cos(a) * r; ty = p.y + Math.sin(a) * r
      speed = def.speed * 0.8
      if (behind && d < 5 && s.t > 1.6 + (e.id % 3) * 0.7) beginPounce('')
      if (d > 9) { tx = p.x; ty = p.y }
      break
    }
    case 'pounce': {
      // 前 0.6s 是一次弹射式扑跃（约 8 m/s，快过奔跑），之后转为快过步行的追猎；
      // 体力耗尽前全力奔跑仍能甩开，但停下或撞进死角就会被追上
      e.state = 'chase'
      tx = p.x; ty = p.y
      const leap = s.t < 0.6
      speed = def.speed * (s.kind === 'great' ? (leap ? 2.2 : 1.25) : s.kind === 'phantom' ? (leap ? 2.3 : 1.35) : (leap ? 3.3 : 1.6))
      if (s.t > 3.2) setPhase(s, s.kind === 'canid' ? 'flank' : 'stalk')
      break
    }
    case 'retreat': {
      e.state = 'investigate'
      const away = Math.max(0.1, d)
      tx = e.x + ((e.x - p.x) / away) * 4; ty = e.y + ((e.y - p.y) / away) * 4
      speed = def.speed * 0.9
      if (s.t > (s.kind === 'canid' ? 4 : 3.5)) setPhase(s, s.aware > 0 ? (s.kind === 'canid' ? 'flank' : 'stalk') : 'drift')
      break
    }
    case 'stagger': {
      e.state = 'stunned'
      if (e.stunT <= 0) { setPhase(s, 'stalk'); s.aware = 6 }
      break
    }
  }

  const combat = s.phase === 'stalk' || s.phase === 'pounce' || s.phase === 'flank' || s.phase === 'standoff'
  if (!combat || e.stunT > 0) { s.strikeT = undefined; s.strikeAge = undefined }
  const stop = SMILER_STOP[s.kind]
  let backing = false
  if (combat && zOk && los && !eng.dev.invisible) {
    if (d < stop - .04) {
      // The entity yields space through ordinary collision checks, never pushes/teleports the camera.
      const ux = d > .001 ? (e.x - p.x) / d : -Math.cos(e.facing)
      const uy = d > .001 ? (e.y - p.y) / d : -Math.sin(e.facing)
      tx = e.x + ux * (stop - d + .35); ty = e.y + uy * (stop - d + .35)
      speed = Math.min(def.speed, (stop - d) / Math.max(dt, .001)); backing = true
    } else {
      speed = smilerApproachLimit(e.x - p.x, e.y - p.y, tx - e.x, ty - e.y, speed * dt, stop) / Math.max(dt, .001)
    }
  }
  if (s.kind === 'great') {
    const room = smilerHeadroom(m, e.x, e.y, e.z, e.facing, WALL_H[eng.levelDef.gen] ?? 3)
    const bend = greatCeilingBend(room, def.scale ?? 1)
    s.ceilingBend = bend
    speed *= greatWalkFactor(bend)
  }
  // Plant the body during the swing; the player can retreat out of the hit.
  if (s.strikeAge !== undefined && !backing) speed = 0
  if (speed > 0) {
    e.targetX = tx; e.targetY = ty
    const facing = e.facing
    const stuck = eng.stepEntity(e, speed, dt)
    if (backing) e.facing = facing
    if (stuck && s.phase === 'drift') eng.wanderTarget(e)
    e.animT += dt * speed
    if (s.phase !== 'feed') eng.faceToward(e, s.phase === 'drift' || s.phase === 'lure' || s.phase === 'retreat' ? tx : p.x, s.phase === 'drift' || s.phase === 'lure' || s.phase === 'retreat' ? ty : p.y, dt, 7)
  }
  if (combat && zOk && los) eng.faceToward(e, p.x, p.y, dt, 9)
  // 巨笑魇：沉重脚步震动镜头 + 踩碎脚下荧光棒
  if (s.kind === 'great' && speed > 0 && d < 9) eng.camShake = Math.min(0.35, eng.camShake + dt * 0.25 * (1 - d / 9))
  if (s.kind === 'great') for (const L of [...F.lures]) if (L.landed && !L.food && Math.abs(L.z - e.z) < 1.4 && Math.hypot(L.x - e.x, L.y - e.y) < 0.9 && eng.los(e.x, e.y, L.x, L.y)) {
    if (consumeLure(eng, L) && d < 12) eng.msg('巨笑魇一脚踩灭了荧光棒。', 'system')
  }

  // ---------- 攻击：蓄力 → 出击命中点 → 收势，模型使用同一个时钟 ----------
  const reach = smilerReach(s.kind)
  const strikeD = Math.hypot(e.x - p.x, e.y - p.y)
  const facingPlayer = strikeD < .001 || ((p.x - e.x) * Math.cos(e.facing) + (p.y - e.y) * Math.sin(e.facing)) / strikeD > .6
  if (s.strikeT !== undefined) {
    s.strikeT -= dt
    eng.faceToward(e, p.x, p.y, dt, 12)
    if (s.strikeT <= 0) {
      s.strikeT = undefined
      if (strikeD <= reach && facingPlayer && eng.meleeZOk(e) && eng.los(e.x, e.y, p.x, p.y) && !eng.dev.invisible) {
        eng.hurtPlayer(def.damage * dmgMult, K.name)
        if (s.kind === 'canid') p.sanity = Math.max(0, p.sanity - 3)
        else if (s.kind === 'great') eng.camShake = Math.min(1, eng.camShake + 0.6)
        else {
          p.slowT = Math.max(p.slowT, 1.1)
          p.stamina = Math.max(0, p.stamina - 25)
          if (Math.random() < 0.35) eng.msg('冰冷的手指扣住了你的脖子——喘不上气！', 'damage')
        }
      }
    }
  } else if (s.strikeAge === undefined && combat && e.stunT <= 0 && strikeD < reach && facingPlayer && e.attackCd <= 0 && zOk && los && !eng.dev.invisible) {
    e.attackCd = s.kind === 'great' ? 2.2 : 1.3
    e.lungeT = SMILER_STRIKE.duration
    s.strikeT = SMILER_STRIKE.hitAt
    s.strikeAge = 0
  }
  if (s.strikeAge !== undefined) e.state = 'attack'

  // ---------- 渲染提示量 ----------
  const k = Math.min(1, dt * 4)
  const visT = s.kind !== 'phantom' ? 1 : (d < 4.5 || beamOnIt || s.phase === 'pounce' || s.strikeT !== undefined ? 1 : 0.04)
  s.vis += (visT - s.vis) * k
  const grinT = s.strikeT !== undefined || s.phase === 'pounce' ? 1 : s.phase === 'feed' ? 0.75 : s.phase === 'standoff' ? 0.3 : s.phase === 'retreat' ? 0 : s.aware > 0 ? 0.45 : 0.12
  s.grin += (grinT - s.grin) * k
  const glowT = s.phase === 'retreat' ? 0.25 : s.phase === 'drift' ? 0.7 : 1
  s.glow += (glowT - s.glow) * k

  // 咯咯笑（已察觉时间歇发出）
  if (s.aware > 0 && s.giggleT <= 0 && d < 15) {
    s.giggleT = 4 + Math.random() * 5
    audio.smilerGiggle(Math.max(0.15, 0.8 * (1 - d / 15)), s.kind === 'great' ? 0.6 : s.kind === 'phantom' ? 1.5 : s.kind === 'starved' ? 1.25 : 1)
  }
}
