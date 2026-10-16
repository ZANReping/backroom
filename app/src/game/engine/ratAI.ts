// v79：尸鼠（Entity 24）专属 AI——依据中文维基 Entity 24 与各层级条目：
//  · 每个种群都因所在层级而独一无二；最常见的品种像家鼠：长身、黑毛，头上长着棕色怪角、角尖发红光。
//  · 多以雄性死亡飞蛾与霉菌为食；大多无害，可作食物来源；有些种类非常危险、会设陷阱，比你想象的聪明。
//  · Level 2：以桶内液体/遗弃食物为食；为抵御高温褪去了毛发；尸鼠的尸身比活鼠更常见（被实体杀死、在机器里窒息烫死）。
//  · Level 3（latest:level-3）：外观与体型近似水豚；牙齿刻意磨尖、借坚不可摧的栅栏磨牙；会布置利用简陋电气设备的陷阱，
//    仿制 M.E.G. 的炸弹等装备（拙劣，并非总是有效）；在实体编队里充当指挥者；佩戴文字转语音设备与流浪者和实体交谈。
//  · Level 8：罗特尼斯大丛林穴顶的本土种群（反向重力，倒立排泄）。
// 导入包的游戏取舍：L3 只做陷阱与炸弹（不做毒气/无人机）；语音设备只做 NPC 式自言自语气泡（不可对话）；
//  保留 L5 酒店正装鼠；不加入 L1；被玩家杀死掉落「尸鼠肉」；不做尖叫事件。
// 运行期状态在 e.rt；陷阱与炸弹在 map.ratGear（世界坐标）。这两类临时状态不写入存档。
import { audio } from '../core/audio'
import type { Entity } from '../entities'
import type { Engine } from '../engine'

import { ratMorphFor, CAPY_HP, CAPY_DMG, CAPY_SPEED, CAPY_SIGHT } from '../entities/rats'
export { ratMorphFor, ratLook, RAT_MORPH_NAME, CAPY_HP, CAPY_DMG, CAPY_SPEED, CAPY_SIGHT, type RatMorph } from '../entities/rats'
import type { RatMorph } from '../entities/rats'

export type RatPhase = 'roam' | 'sniff' | 'gnaw' | 'watch' | 'flee' | 'hunt' | 'drag' | 'chase' | 'grind' | 'plant' | 'command'
export interface RatState {
  morph: RatMorph
  t: number
  phase: RatPhase
  phaseT: number
  lastHp: number
  voiceCd: number
  watchCd: number
  scanT: number
  prey?: Entity
  carry: number // 叼着猎物（渲染：嘴里的飞蛾）剩余秒
  strikeT?: number
  orbit: number // 围攻时绕玩家的方位
  // —— 水豚种 ——
  bubbleText: string; bubbleT: number; bubbleCd: number
  commandCd: number; lostT: number
  plantCd: number; plantKind?: 'trap' | 'bomb'; gearN: number; bombN: number
  fx?: number; fy?: number // 磨牙点
  grindT: number
}

export interface RatGear {
  id: number
  kind: 'trap' | 'bomb'
  wx: number; wy: number; wz: number // 世界坐标（无限层窗口平移不影响）
  owner: number
  dud: boolean // 拙劣仿制：一部分并不生效
  sprung: boolean
  fuse: number // 炸弹：触发后的倒计时（-1 = 未触发）
  t: number // 放置后经过的时间 / 触发后的时间
}

const hash = (n: number) => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296 }
// —— 水豚种的自言自语（合成音 + 头顶气泡；只是自言自语，不能对话）——
export const CAPY_LINES = {
  idle: ['电池又不够了。', '三号线路……接反了吗。', '这条走廊，我记得。', 'M.E.G. 的图纸，原来是这么画的。', '今天的铜线不错。', '流浪者总是往左走。', '安静。安静。', '计划第四步。'],
  grind: ['牙。还不够尖。', '这根栅栏，磨牙正合适。', '再磨一会儿。'],
  plant: ['这里。放这里。', '踩上去，就好了。', '接线……完成。', '别踩。……算了，踩吧。'],
  command: ['目标出现。', '猎犬，去。', '左边。包抄。', '它往你们那边去了。', '慢慢来，别吓跑它。', '它没看见陷阱。'],
  hurt: ['你会后悔的。', '记录：流浪者，有敌意。', '……疼。'],
}
const LINE_SET = (k: keyof typeof CAPY_LINES) => { const a = CAPY_LINES[k]; return a[Math.floor(Math.random() * a.length)] }

const newFrame = (map: Engine['map']) => ({ map, told: new Set<string>(), biteGap: 0 })
let frames = new WeakMap<Engine, ReturnType<typeof newFrame>>()
function frameFor(eng: Engine) {
  let f = frames.get(eng)
  if (!f || f.map !== eng.map) { f = newFrame(eng.map); frames.set(eng, f) }
  return f
}
export function resetRatFrame(eng?: Engine) { if (eng) frames.delete(eng); else frames = new WeakMap() }
const once = (eng: Engine, key: string, text: string, kind: 'system' | 'damage' = 'system') => { const F = frameFor(eng); if (!F.told.has(key)) { F.told.add(key); eng.msg(text, kind) } }

export function initRat(eng: Engine, e: Entity): RatState {
  const morph = ratMorphFor(eng.levelDef?.id ?? 0, e.def)
  if (morph === 'capybara' && e.def.hp !== CAPY_HP) {
    const healthy = e.hp >= e.def.hp
    e.def = { ...e.def, hp: CAPY_HP, damage: CAPY_DMG, speed: CAPY_SPEED, sight: CAPY_SIGHT }
    e.hp = healthy ? CAPY_HP : Math.min(e.hp, CAPY_HP)
  }
  const s: RatState = {
    morph, t: 0, phase: 'roam', phaseT: 1 + hash(e.id) * 3, lastHp: e.hp, voiceCd: 2 + hash(e.id + 1) * 8, watchCd: 0, scanT: hash(e.id + 2) * 0.3,
    carry: 0, orbit: hash(e.id + 3) * Math.PI * 2,
    bubbleText: '', bubbleT: 0, bubbleCd: 3 + hash(e.id + 4) * 8, commandCd: 0, lostT: 99,
    plantCd: 8 + hash(e.id + 5) * 20, gearN: 0, bombN: 0, grindT: 0,
  }
  e.rt = s
  return s
}

function say(eng: Engine, _e: Entity, s: RatState, k: keyof typeof CAPY_LINES, d: number) {
  s.bubbleText = LINE_SET(k); s.bubbleT = 3.6; s.bubbleCd = 9 + Math.random() * 8
  const vol = Math.max(0, 1 - d / 16)
  if (vol > 0.03) audio.ratVoice(vol, 'tts', s.bubbleText.length)
  if (d < 14) once(eng, 'rtts', '那只水豚般的尸鼠胸前绑着一台自制音箱——合成音一字一顿地自言自语。', 'system')
}
function squeak(e: Entity, s: RatState, d: number, angry: boolean) {
  const vol = Math.max(0, 1 - d / 12) * (angry ? 1 : 0.55)
  if (vol > 0.03) audio.ratVoice(vol, angry ? 'chitter' : 'squeak', 0)
  s.voiceCd = (angry ? 1.6 : 6) + Math.random() * (angry ? 2 : 9)
  void e
}

/** 把一只尸鼠拉进激怒/记仇（玩家或指定实体为目标） */
export function ratProvoke(e: Entity, target?: Entity) {
  e.provoked = true; e.state = 'chase'; e.stateT = 0
  if (target) e.targetEnt = target
  if (e.rt) { e.rt.phase = 'chase'; e.rt.phaseT = 0; e.rt.carry = 0 }
}

const setPhase = (s: RatState, ph: RatPhase, t: number) => { s.phase = ph; s.phaseT = t }

export function updateRat(eng: Engine, e: Entity, dt: number, d: number, dmgMult: number) {
  const p = eng.player, m = eng.map!
  const s = e.rt ?? initRat(eng, e)
  const capy = s.morph === 'capybara', ceiling = !!e.def.ceilingCrawler
  const F = frameFor(eng)
  s.t += dt; s.phaseT -= dt; s.voiceCd -= dt; s.watchCd -= dt; s.scanT -= dt; s.carry = Math.max(0, s.carry - dt)
  s.bubbleT = Math.max(0, s.bubbleT - dt); s.bubbleCd -= dt; s.commandCd -= dt; s.plantCd -= dt
  F.biteGap -= dt / Math.max(1, m.entities.length) // 全局「咬一口」节流（围攻时轮流上嘴）
  const hurt = e.hp < s.lastHp
  s.lastHp = e.hp
  if (hurt && !e.provoked) ratProvoke(e)
  if (hurt && capy && s.bubbleCd < 6) say(eng, e, s, 'hurt', d)
  const zOk = Math.abs(e.z - p.z) < 1.2
  const los = !eng.dev.invisible && zOk && d < 24 && eng.los(e.x, e.y, p.x, p.y)
  const sprint = !!eng.input?.sprint

  // 加入围殴：4m 内有激怒的同伴 → 一同激怒（攻击同一目标）
  if (!e.provoked && s.scanT <= 0) {
    for (const q of m.entities) {
      if (q === e || q.dead || q.def.type !== 'corpserat' || !q.provoked || Math.abs(q.z - e.z) > 1.2) continue
      if (Math.hypot(q.x - e.x, q.y - e.y) < 4) { ratProvoke(e, q.targetEnt); break }
    }
  }
  if (e.provoked && s.phase !== 'chase' && !capy) setPhase(s, 'chase', 0)

  let speed = 0, tx = e.x, ty = e.y, face: [number, number] | null = null
  const sp = e.def.speed

  // ================= 水豚种（L3）：磨牙 / 布雷 / 指挥 =================
  if (capy) {
    const sees = los && d < CAPY_SIGHT
    if (sees) s.lostT = 0; else s.lostT += dt
    if ((sees || (e.provoked && s.lostT < 6)) && s.phase !== 'command') {
      setPhase(s, 'command', 0); s.commandCd = Math.min(s.commandCd, 1.2)
      once(eng, 'rcapy', '一只水豚大小的尸鼠站在走廊尽头，打量着你。它的牙被磨得像锯齿。', 'damage')
    }
    if (s.phase === 'command') {
      if (s.lostT > 8) { setPhase(s, 'roam', 2); e.provoked = false }
      else {
        face = [p.x, p.y]
        // 保持 6~9m：太近就退、太远就跟
        const ux = (e.x - p.x) / (d || 1), uy = (e.y - p.y) / (d || 1)
        if (d < 5.5) { tx = e.x + ux * 3 + -uy * 0.8; ty = e.y + uy * 3 + ux * 0.8; speed = sp * 1.1 }
        else if (d > 9.5 || !sees) { tx = p.x; ty = p.y; speed = sp * 0.7 }
        // 指挥：用合成音把附近的实体引向玩家
        if (sees && s.commandCd <= 0) {
          s.commandCd = 7 + Math.random() * 3
          say(eng, e, s, 'command', d)
          eng.noiseEvent(p.x, p.y, 14, true)
          once(eng, 'rcmd', '合成音在走廊里回荡——附近的实体循声朝你包抄过来。它在指挥它们。', 'damage')
        }
        // 被逼到身边才会咬（近战很弱）
        if (d < 1.3 && e.attackCd <= 0 && eng.meleeZOk(e) && los) {
          e.attackCd = 1.3; e.lungeT = 0.25
          eng.hurtPlayer(CAPY_DMG * dmgMult, e.def.name)
          once(eng, 'rcbite', '它用磨尖的牙狠狠咬了你一口，随即退开。', 'damage')
        }
      }
    } else if (s.phase === 'grind') {
      face = [s.fx!, s.fy!]
      const fd = Math.hypot(s.fx! - e.x, s.fy! - e.y)
      if (fd > 0.75) { tx = s.fx!; ty = s.fy!; speed = sp * 0.5 }
      else {
        s.grindT += dt
        if (Math.floor(s.grindT / 0.6) !== Math.floor((s.grindT - dt) / 0.6) && d < 14) {
          audio.scrape(Math.max(0, 1 - d / 14) * 0.6)
          once(eng, 'rgrind', '尖锐的刮擦声——一只尸鼠正抱着坚不可摧的栅栏磨牙。')
        }
        if (s.bubbleCd <= 0 && d < 14) say(eng, e, s, 'grind', d)
      }
      if (s.phaseT <= 0) setPhase(s, 'roam', 3)
    } else if (s.phase === 'plant') {
      speed = 0
      if (s.phaseT <= 0) {
        placeGear(eng, e, s, s.plantKind ?? 'trap')
        if (d < 14 && s.bubbleCd < 4) say(eng, e, s, 'plant', d)
        setPhase(s, 'roam', 2 + Math.random() * 3)
      }
    } else {
      // 闲逛 → 随机进入磨牙 / 布雷
      if (s.phaseT <= 0) {
        const r = Math.random()
        const fence = r < 0.4 ? nearestFence(eng, e, 10) : null
        if (fence) { s.fx = fence[0]; s.fy = fence[1]; s.grindT = 0; setPhase(s, 'grind', 7 + Math.random() * 4) }
        else if (s.plantCd <= 0 && s.gearN < 3 && d > 9 && canPlantHere(eng, e)) {
          s.plantKind = s.bombN < 1 && Math.random() < 0.4 ? 'bomb' : 'trap'
          s.plantCd = 25 + Math.random() * 20
          setPhase(s, 'plant', 2.4)
        } else setPhase(s, 'roam', 3 + Math.random() * 4)
      }
      if (e.stateT <= 0 || Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.4) eng.wanderTarget(e)
      tx = e.targetX; ty = e.targetY; speed = sp * 0.4
      if (s.bubbleCd <= 0 && d < 14) say(eng, e, s, 'idle', d)
    }
    e.state = s.phase === 'command' ? 'investigate' : s.phase === 'roam' ? 'wander' : 'idle'
    move(eng, e, s, speed, tx, ty, face, dt)
    return
  }

  // ================= 普通种群：觅食 / 捕飞蛾 / 避人 / 记仇围攻 =================
  if (s.phase === 'chase') {
    const tgt = e.targetEnt && !e.targetEnt.dead ? e.targetEnt : undefined
    if (e.targetEnt && !tgt) { e.targetEnt = undefined; if (!e.provoked) setPhase(s, 'roam', 1) }
    if (tgt) {
      // 陷阱里的猎物：扑上去撕咬
      const td = Math.hypot(tgt.x - e.x, tgt.y - e.y)
      tx = tgt.x; ty = tgt.y; face = [tgt.x, tgt.y]; speed = sp
      if (td < 1.05 && e.attackCd <= 0) {
        e.attackCd = 0.9; e.lungeT = 0.22
        tgt.hp -= e.def.damage; tgt.stunT = Math.max(tgt.stunT, 0.25)
        eng.bloodParticles(tgt.x, tgt.y)
        if (tgt.hp <= 0 && !tgt.dead) { tgt.dead = true; tgt.deathT = 1.4; if (d < 10) eng.msg(`尸鼠群扑翻了那只${tgt.def.name}，把它撕成了碎块。`, 'system') }
      }
    } else if (!ceiling) {
      // 围攻玩家：绕着玩家打转，轮流冲上去咬一口（咬住脚踝会被拖慢）
      e.state = 'chase'
      const a = s.orbit + s.t * 0.9
      const rr = d > 3 ? 0 : 1.35
      tx = p.x + Math.cos(a) * rr; ty = p.y + Math.sin(a) * rr
      face = [p.x, p.y]; speed = sp * (d > 3 ? 1 : 0.85)
      if (s.strikeT !== undefined) {
        s.strikeT -= dt; tx = p.x; ty = p.y; speed = sp * 1.2
        if (s.strikeT <= 0) {
          s.strikeT = undefined
          if (d < 1.15 && los && eng.meleeZOk(e) && !eng.dev.invisible) {
            eng.hurtPlayer(e.def.damage * dmgMult, e.def.name)
            p.slowT = Math.max(p.slowT, 0.55)
            once(eng, 'rbite', '尸鼠一口咬住你的脚踝不放——整群都围了上来。它们记仇，不会消气。', 'damage')
          }
          s.orbit += Math.PI * (0.6 + Math.random() * 0.8)
        }
      } else if (d < 1.9 && los && e.attackCd <= 0 && F.biteGap <= 0 && eng.meleeZOk(e)) {
        e.attackCd = 1.1 + Math.random() * 0.5; e.lungeT = 0.28; s.strikeT = 0.24
        F.biteGap = 0.35
      }
    } else {
      // 穴顶尸鼠：在头顶跟着你爬（够不着，但会尖叫招来地面的同伴）
      tx = p.x; ty = p.y; speed = sp * 0.8; face = [p.x, p.y]
    }
    if (s.voiceCd <= 0) squeak(e, s, d, true)
    move(eng, e, s, speed, tx, ty, face, dt)
    return
  }

  // —— 捕食死亡飞蛾：扫描节流（大鼠群下 O(n²) 搜索每秒约 4 次）——
  if (!ceiling && s.phase !== 'drag' && s.phase !== 'flee' && s.scanT <= 0) {
    s.scanT = 0.24 + (e.id % 5) * 0.02
    let prey = s.prey && !s.prey.dead && m.entities.includes(s.prey) ? s.prey : undefined
    if (!prey) {
      let pd = 13
      for (const q of m.entities) {
        if (q.dead || q.hidden || q.def.type !== 'deathmoth') continue
        const qd = Math.hypot(q.x - e.x, q.y - e.y)
        if (qd < pd && eng.los(e.x, e.y, q.x, q.y)) { prey = q; pd = qd }
      }
    }
    s.prey = prey
    if (prey && s.phase !== 'hunt') setPhase(s, 'hunt', 12)
  }
  if (s.phase === 'hunt') {
    const prey = s.prey
    if (!prey || prey.dead || s.phaseT <= 0) { s.prey = undefined; setPhase(s, 'roam', 1) }
    else {
      const qd = Math.hypot(prey.x - e.x, prey.y - e.y, (prey.z - e.z) * 0.8)
      tx = prey.x; ty = prey.y; face = [prey.x, prey.y]; speed = sp * 0.9
      e.state = 'investigate'; e.targetEnt = undefined
      if (qd < 1.05 && Math.abs(prey.z - e.z) < 0.82 && e.attackCd <= 0) {
        e.attackCd = 1.0; e.lungeT = 0.22
        prey.hp -= e.def.damage; prey.stunT = Math.max(prey.stunT, 0.3)
        eng.bloodParticles(prey.x, prey.y)
        if (prey.hp <= 0 && !prey.dead) {
          prey.dead = true; prey.deathT = 1.4
          if (d < 9) eng.msg(`尸鼠扑翻了那只${prey.def.name}，咬断头部，叼着往墙缝里拖。`, 'system')
          s.prey = undefined; s.carry = 4; setPhase(s, 'drag', 4)
          eng.wanderTarget(e)
        } else if (!prey.def.noRetaliate) { prey.provoked = true; prey.targetEnt = e; prey.state = 'chase'; prey.stateT = 0 }
      }
    }
  }
  if (s.phase === 'drag') {
    // 叼着猎物拖回墙缝
    tx = e.targetX; ty = e.targetY; speed = sp * 0.55; e.state = 'wander'
    if (s.phaseT <= 0) setPhase(s, 'gnaw', 3 + Math.random() * 2)
  }

  // —— 避人：被逼近会站起来盯着你；冲刺靠近 / 贴脸 → 四散逃开 ——
  if (!ceiling && s.phase !== 'hunt' && s.phase !== 'drag' && s.phase !== 'flee' && los && !eng.dev.invisible) {
    if (d < 1.6 || (sprint && d < 4.5)) {
      const ux = (e.x - p.x) / (d || 1), uy = (e.y - p.y) / (d || 1), side = (e.id % 2 ? 1 : -1) * 0.7
      e.targetX = e.x + (ux - uy * side) * 5; e.targetY = e.y + (uy + ux * side) * 5
      setPhase(s, 'flee', 1.8 + Math.random() * 0.6); squeak(e, s, d, false)
      once(eng, 'rflee', '尸鼠吱地一声四散窜开——它们怕人，只要你别招惹。')
    } else if (d < 3.2 && s.watchCd <= 0 && (s.phase === 'roam' || s.phase === 'gnaw')) {
      setPhase(s, 'watch', 1.4 + Math.random() * 1.6); s.watchCd = 7 + Math.random() * 6
    }
  }
  if (s.phase === 'flee') {
    tx = e.targetX; ty = e.targetY; speed = sp * 1.3; e.state = 'wander'
    if (s.phaseT <= 0) setPhase(s, 'roam', 2)
  } else if (s.phase === 'watch') {
    face = [p.x, p.y]; e.state = 'idle'
    if (s.phaseT <= 0) setPhase(s, 'roam', 2)
  } else if (s.phase === 'sniff' || s.phase === 'gnaw') {
    e.state = 'idle'
    if (s.phaseT <= 0) setPhase(s, 'roam', 2 + Math.random() * 4)
  } else if (s.phase === 'roam') {
    e.state = 'wander'
    if (e.stateT <= 0 || Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.35) eng.wanderTarget(e)
    tx = e.targetX; ty = e.targetY; speed = sp * 0.42
    if (s.phaseT <= 0) {
      const r = Math.random()
      // 觅食：Level 2 舔桶里的液体/翻遗弃食物，Level 8 啃菌，其余啃霉斑与腐肉
      setPhase(s, r < 0.4 ? 'sniff' : r < 0.75 ? 'gnaw' : 'roam', r < 0.4 ? 1.2 + Math.random() : r < 0.75 ? 2.5 + Math.random() * 3 : 3 + Math.random() * 3)
    }
  }
  if (s.voiceCd <= 0 && d < 10) squeak(e, s, d, false)
  move(eng, e, s, speed, tx, ty, face, dt)
}

function move(eng: Engine, e: Entity, s: RatState, speed: number, tx: number, ty: number, face: [number, number] | null, dt: number) {
  if (speed > 0) {
    e.targetX = tx; e.targetY = ty
    const stuck = eng.stepEntity(e, speed, dt)
    if (stuck && (s.phase === 'roam' || s.phase === 'drag' || s.phase === 'flee')) eng.wanderTarget(e)
    e.animT += dt * speed
  }
  if (face) eng.faceToward(e, face[0], face[1], dt, 7)
  else if (speed > 0) eng.faceToward(e, tx, ty, dt, 7)
}

/** 最近的坚不可摧铁栅栏上的磨牙点（栅栏外沿，朝向尸鼠一侧） */
function nearestFence(eng: Engine, e: Entity, maxD: number): [number, number] | null {
  let best: [number, number] | null = null, bd = maxD
  for (const st of eng.map!.structures) {
    if (st.kind !== 'barfence') continue
    const cx = Math.max(st.x, Math.min(st.x + st.w, e.x)), cy = Math.max(st.y, Math.min(st.y + st.h, e.y))
    const dd = Math.hypot(cx - e.x, cy - e.y)
    if (dd < bd && dd > 0.01 && eng.los(e.x, e.y, cx + (e.x - cx) / dd * 0.3, cy + (e.y - cy) / dd * 0.3)) {
      bd = dd; best = [cx + (e.x - cx) / dd * 0.45, cy + (e.y - cy) / dd * 0.45]
    }
  }
  return best
}

const GEAR_CAP = 14
let gearSeq = 1
function canPlantHere(eng: Engine, e: Entity): boolean {
  const m = eng.map!, ox = m.inf?.ox ?? 0, oy = m.inf?.oy ?? 0
  for (const g of m.ratGear ?? []) if (Math.hypot(g.wx - ox - e.x, g.wy - oy - e.y) < 3) return false
  for (const st of m.structures) if (st.kind === 'rattrap' && Math.hypot(st.x + 0.5 - e.x, st.y + 0.5 - e.y) < 2.5) return false
  return true
}
export function placeGear(eng: Engine, e: Entity, s: RatState | undefined, kind: 'trap' | 'bomb') {
  const m = eng.map!, ox = m.inf?.ox ?? 0, oy = m.inf?.oy ?? 0
  const list = m.ratGear ?? (m.ratGear = [])
  if (list.length >= GEAR_CAP) {
    const i = list.findIndex((g) => g.sprung)
    list.splice(i >= 0 ? i : 0, 1)
  }
  const id = gearSeq++
  const g: RatGear = { id, kind, wx: e.x + ox, wy: e.y + oy, wz: e.z, owner: e.id, dud: hash(e.id * 7 + id) < (kind === 'bomb' ? 0.25 : 0.15), sprung: false, fuse: -1, t: 0 }
  list.push(g)
  if (s) { s.gearN++; if (kind === 'bomb') s.bombN++ }
  return g
}

/** 陷阱与炸弹的触发（每帧一次，由 entityAI.updateEntities 调用） */
export function updateRatGear(eng: Engine, dt: number, dmgMult: number) {
  const m = eng.map
  if (!m?.ratGear?.length) return
  const p = eng.player, ox = m.inf?.ox ?? 0, oy = m.inf?.oy ?? 0
  const keep: RatGear[] = []
  for (const g of m.ratGear) {
    g.t += dt
    const x = g.wx - ox, y = g.wy - oy
    const dp = eng.dev.invisible || Math.abs(p.z - g.wz) > 1.2 ? 1e9 : Math.hypot(p.x - x, p.y - y)
    if (g.kind === 'trap') {
      if (!g.sprung) {
        if (dp < 0.55) {
          g.sprung = true; g.t = 0
          audio.spark()
          if (g.dud) eng.msg('脚下「咔」一声，夹子合上又弹开了——缠在上面的电线只爆出一点火花。这个陷阱没接好。', 'system')
          else {
            eng.hurtPlayer(8 * dmgMult, '尸鼠的电击陷阱')
            p.slowT = Math.max(p.slowT, 1.6)
            p.flashJamT = Math.max(p.flashJamT, 2.5)
            audio.hurt()
            eng.msg('捕兽夹咬住了你的脚踝，缠着的电线噼啪炸出电弧——手电一下熄了！附近的尸鼠把你当成了猎物。', 'damage')
            for (const q of m.entities) if (!q.dead && q.def.type === 'corpserat' && Math.abs(q.z - g.wz) <= 1.2 && Math.hypot(q.x - p.x, q.y - p.y) < 14) ratProvoke(q)
          }
        } else {
          for (const q of m.entities) {
            if (q.dead || q.def.type === 'corpserat' || q.def.flying || q.hidden || Math.abs(q.z - g.wz) > 1.2) continue
            if (Math.hypot(q.x - x, q.y - y) > 0.55) continue
            g.sprung = true; g.t = 0
            if (!g.dud) {
              q.hp -= 8; q.stunT = Math.max(q.stunT, 1.4)
              eng.bloodParticles(q.x, q.y)
              for (const r of m.entities) if (!r.dead && r.def.type === 'corpserat' && Math.abs(r.z - g.wz) <= 1.2 && Math.hypot(r.x - q.x, r.y - q.y) < 14) ratProvoke(r, q)
              if (dp < 12) eng.msg(`电击陷阱「啪」地炸出火花，夹住了那只${q.def.name}——附近的尸鼠一拥而上。`, 'system')
              if (q.hp <= 0 && !q.dead) { q.dead = true; q.deathT = 1.4 }
            }
            break
          }
        }
      }
      if (!(g.sprung && g.t > 90)) keep.push(g)
      continue
    }
    // —— 炸弹：靠近 1.8m 内开始「嘀嘀」倒计时，1.4 秒后爆炸（拙劣仿制，有的只冒烟）——
    if (g.fuse < 0) {
      let trig = dp < 1.8
      if (!trig) for (const q of m.entities) if (!q.dead && q.def.type !== 'corpserat' && !q.def.flying && !q.hidden && Math.abs(q.z - g.wz) <= 1.2 && Math.hypot(q.x - x, q.y - y) < 1.2) { trig = true; break }
      if (trig) {
        g.fuse = 1.4; g.t = 0
        if (dp < 14) eng.msg('脚边传来急促的「嘀、嘀」声——一截缠满胶带的水管上，红灯在狂闪。快跑！', 'damage')
      }
      keep.push(g)
      continue
    }
    g.fuse -= dt
    if (Math.floor(g.fuse * 7) !== Math.floor((g.fuse + dt) * 7) && dp < 20) audio.ratBeep(Math.max(0.1, 1 - dp / 20))
    if (g.fuse > 0) { keep.push(g); continue }
    if (g.dud) {
      for (let i = 0; i < 8; i++) eng.particles.push({ x, y, vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8, t: 0, life: 1.2, color: '#8a8a82', size: 3 + Math.random() * 3 })
      if (dp < 14) eng.msg('嘀声戛然而止，水管只「噗」地冒出一股黑烟——是个哑弹。', 'system')
      continue
    }
    explode(eng, x, y, g.wz, dp, dmgMult)
  }
  m.ratGear = keep
}

function explode(eng: Engine, x: number, y: number, z: number, dp: number, dmgMult: number) {
  const m = eng.map!, p = eng.player
  const R = 2.6
  eng.noiseEvent(x, y, 16, true)
  audio.hit(); audio.spark()
  eng.camShake = Math.min(1, eng.camShake + Math.max(0.2, 0.8 - dp * 0.06))
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2
    eng.particles.push({ x, y, vx: Math.cos(a) * 3.2, vy: Math.sin(a) * 3.2, t: 0, life: 0.6, color: i % 3 === 0 ? '#e8823c' : i % 3 === 1 ? '#c93a1e' : '#5a5650', size: 3 + Math.random() * 3 })
  }
  if (dp < R) {
    eng.hurtPlayer(30 * (1 - dp / R * 0.6) * dmgMult, '尸鼠的土制炸弹')
    eng.msg('土制炸弹在脚边炸开，碎铁片和电池残片扎进了你的腿。', 'damage')
  } else if (dp < 16) eng.msg('不远处一声闷响——尸鼠的土制炸弹炸了。', 'system')
  for (const e of m.entities) {
    if (e.dead || Math.abs(e.z - z) > 1.2) continue
    const d = Math.hypot(e.x - x, e.y - y)
    if (d > R) continue
    e.hp -= 30 * (1 - d / R * 0.6); e.stunT = Math.max(e.stunT, 0.6)
    eng.bloodParticles(e.x, e.y)
    if (e.hp <= 0 && !e.dead) { e.dead = true; e.deathT = 1.4 }
  }
  void p
}
