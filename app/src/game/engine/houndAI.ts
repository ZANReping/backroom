// v62：猎犬（Entity 8）专属 AI——依据中文维基 Entity 8：
//  · 目击即敌对：一旦在视野内看见人类就被激怒；第一次锁定时仰头嚎叫，召集附近同类。
//  · 嚎叫：被召集的猎犬带着增强的视野搜寻嚎叫处——此时躲在它们视线之外最安全。
//  · 直视：直接、持续的眼神接触会让它伏低后退；但只能短暂生效（约 4 秒，持续制造噪音可延长到 6 秒），
//    之后它习惯了你的目光，6 秒内不再惧怕——足够规划路线逃跑。
//  · 逃跑：看见它就跑会立刻触发冲锋；扑击造成镜头震动与短暂减速。
//  · L3：高智能个体沿用伏击逻辑，被直视时完全僵住。
//  · L11 中立变种：城市效应下不主动攻击；保持距离观察、坐下、摇尾，被盯久了会扭头走开，
//    近处奔跑会把它吓跑；一旦被攻击即永久转为敌对，并带动附近的中立同类。
import { audio } from '../core/audio'
import type { Entity } from '../entities'
import type { Engine } from '../engine'

export type HoundPhase = 'roam' | 'howl' | 'search' | 'stalk' | 'charge' | 'cower' | 'flee' | 'watch' | 'sit'
export interface HoundState {
  neutral: boolean
  phase: HoundPhase
  t: number
  gazeT: number
  gazeCd: number
  alert: number // 被嚎叫召集后的搜寻剩余时间（视野增强）
  lostT: number // 失去视线累计
  lastX: number; lastY: number // 最后目击/听见位置（世界坐标，不随流式窗口平移）
  lastHp: number
  strikeT?: number
  howled?: boolean
  lookAwayT?: number
  // 渲染姿态量 0..1
  crouch: number; howlPose: number; sit: number; jaw: number; wag: number
}

const newFrame = (map: Engine['map']) => ({ map, px: 0, py: 0, speed: 0, init: false, told: new Set<string>() })
const frames = new WeakMap<Engine, ReturnType<typeof newFrame>>()
function frameFor(eng: Engine) {
  let f = frames.get(eng)
  if (!f || f.map !== eng.map) { f = newFrame(eng.map); frames.set(eng, f) }
  return f
}
export function beginHoundFrame(eng: Engine, dt: number) {
  const F = frameFor(eng)
  const p = eng.player
  const px = p.x + (eng.map?.inf?.ox ?? 0), py = p.y + (eng.map?.inf?.oy ?? 0)
  if (!F.init || dt <= 0) { F.px = px; F.py = py; F.init = true }
  const sp = dt > 0 ? Math.hypot(px - F.px, py - F.py) / dt : 0
  F.speed = F.speed * 0.7 + Math.min(12, sp) * 0.3
  F.px = px; F.py = py
}
const once = (eng: Engine, key: string, text: string, kind: 'system' | 'damage' = 'system') => { const F=frameFor(eng); if (!F.told.has(key)) { F.told.add(key); eng.msg(text, kind) } }

export function initHound(eng: Engine, e: Entity, neutral = eng.levelDef.id === 11): HoundState {
  neutral = neutral && !e.provoked
  const s: HoundState = { neutral, phase: 'roam', t: 0, gazeT: 0, gazeCd: 0, alert: 0, lostT: 0,
    lastX: e.x+(eng.map?.inf?.ox??0), lastY: e.y+(eng.map?.inf?.oy??0), lastHp: Math.max(e.hp,e.def.hp),
    crouch: 0, howlPose: 0, sit: 0, jaw: 0, wag: 0 }
  e.def = { ...e.def, name: neutral ? '中立猎犬' : '猎犬' }
  e.hd = s
  return s
}
const setPhase = (s: HoundState, ph: HoundPhase) => { if (s.phase !== ph) { s.phase = ph; s.t = 0 } }

/** noiseEvent 钩子 */
export function houndHear(eng: Engine, e: Entity, x: number, y: number, radius: number, sprint: boolean) {
  const s = e.hd ?? initHound(eng, e)
  const r = Math.max(radius, e.def.hearing * (sprint ? 1.6 : 1))
  if (Math.hypot(e.x - x, e.y - y) >= r) return
  if (s.neutral) { if (sprint && Math.hypot(e.x - x, e.y - y) < 5) { setPhase(s, 'flee'); audio.houndHowl(0.25, 1.9, 0.35) } return }
  s.lastX = x+(eng.map?.inf?.ox??0); s.lastY = y+(eng.map?.inf?.oy??0)
  if (s.phase === 'roam') { setPhase(s, 'search'); s.alert = Math.max(s.alert, 5) }
}

function turnHostile(eng: Engine, e: Entity, s: HoundState, d: number) {
  if (!s.neutral) return
  s.neutral = false
  e.provoked = true
  e.def = { ...e.def, name: '猎犬' }
  setPhase(s, 'howl')
  if (d < 14) eng.msg('中立猎犬龇出满口利齿——它不再中立了。', 'damage')
  for (const q of eng.map!.entities) {
    if (q === e || q.dead || q.def.type !== 'hound' || Math.abs(q.z-e.z)>1.4 || Math.hypot(q.x-e.x,q.y-e.y)>=10) continue
    const qs=q.hd??initHound(eng,q)
    if(qs.neutral){qs.neutral=false;q.provoked=true;q.def={...q.def,name:'猎犬'};setPhase(qs,'charge')}
  }
}

/** Player damage is processed before the next AI tick, including a lethal first hit. */
export function provokeHound(eng: Engine, e: Entity) {
  if (e.dead || e.def.type !== 'hound') return
  const s = e.hd ?? initHound(eng, e)
  if (s.neutral && e.hp < s.lastHp) {
    turnHostile(eng, e, s, Math.hypot(e.x-eng.player.x,e.y-eng.player.y))
    s.lastHp = e.hp // Do not replace the provocation howl with a second hurt transition.
  }
}

export function updateHound(eng: Engine, e: Entity, dt: number, d: number, dmgMult: number, l3: boolean) {
  const F=frameFor(eng)
  const p = eng.player, m = eng.map!, def = e.def
  const ox=m.inf?.ox??0,oy=m.inf?.oy??0
  const s = e.hd ?? initHound(eng, e)
  s.t += dt; s.gazeCd -= dt; s.alert = Math.max(0, s.alert - dt)
  const hurt = e.hp < s.lastHp
  s.lastHp = e.hp
  const zOk = Math.abs(e.z - p.z) < 1.4
  const los = !eng.dev.invisible && d < 22 && zOk && eng.los(e.x, e.y, p.x, p.y)
  const gazing = los && d < 10 && eng.lookingAt(e)
  const sight = def.sight * (s.alert > 0 ? 1.7 : 1)
  const sees = los && d < sight
  const panic = eng.input.sprint && F.speed > 4.4
  let speed = 0, tx = e.x, ty = e.y, face: [number, number] | null = null

  if (hurt) {
    if (s.neutral) turnHostile(eng, e, s, d)
    else if (e.hp < def.hp * 0.3) { setPhase(s, 'flee'); once(eng, 'hflee', '猎犬哀嚎一声，拖着身子逃进了黑暗。') }
    else setPhase(s, 'charge')
  }

  // Keep L3's ambush in the same state machine so cowering can resume when gaze breaks.
  if(l3&&!s.neutral&&!hurt&&(s.phase==='roam'||s.phase==='search')&&s.alert<=0){
    if(sees&&eng.viewAngle(e.x,e.y)>1.2){
      e.activated=true;s.howled=true;setPhase(s,'charge')
      once(eng,'hambush','背后响起湿冷的关节摩擦声——猎犬趁你背对它扑了上来！','damage');audio.aggro()
    }else{e.state='idle';e.targetX=e.x;e.targetY=e.y;return}
  }

  if (s.neutral) {
    // ---------- L11 中立变种 ----------
    e.state = 'wander'
    if(panic&&los&&d<5&&s.phase!=='flee'){setPhase(s,'flee');audio.houndHowl(.25,1.9,.35)}
    if (s.phase === 'flee') {
      const a = Math.max(0.1, d); tx = e.x + (e.x - p.x) / a * 5; ty = e.y + (e.y - p.y) / a * 5; speed = def.speed * 0.9
      if (s.t > 2.5) setPhase(s, 'roam')
    } else if((s.lookAwayT??0)>0){
      s.lookAwayT=Math.max(0,s.lookAwayT!-dt);tx=e.targetX;ty=e.targetY;speed=def.speed*.3
    } else if (los && d < 9) {
      once(eng, 'hneutral', '一只猎犬远远蹲坐着打量你，尾巴慢慢摆动。城市里的它们似乎没有敌意。')
      const keep = p.crouching ? 2.6 : 4.5
      if (gazing) s.gazeT += dt; else s.gazeT = Math.max(0, s.gazeT - dt * 0.5)
      if (s.gazeT > 3) { setPhase(s, 'roam'); s.gazeT = 0; eng.wanderTarget(e); e.stateT = 5; s.lookAwayT=3; tx=e.targetX;ty=e.targetY;speed=def.speed*.3 } // 被盯久了，扭头走开
      else if (d < keep - 0.4) { setPhase(s, 'watch'); const a = Math.max(0.1, d); tx = e.x + (e.x - p.x) / a * 2; ty = e.y + (e.y - p.y) / a * 2; speed = def.speed * 0.35; face = [p.x, p.y] }
      else if (p.crouching && d > keep + 0.6 && F.speed < 0.3) { setPhase(s, 'watch'); tx = p.x; ty = p.y; speed = def.speed * 0.18; face = [p.x, p.y] } // 蹲下不动时好奇地凑近
      else { setPhase(s, 'sit'); face = [p.x, p.y] }
    } else {
      setPhase(s, 'roam')
      if (e.stateT <= 0 || Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.4) eng.wanderTarget(e)
      tx = e.targetX; ty = e.targetY; speed = def.speed * 0.3
    }
  } else {
    // ---------- 敌对 ----------
    if (sees) { s.lastX = p.x+ox; s.lastY = p.y+oy; s.lostT = 0 } else s.lostT += dt
    // 首次目击：嚎叫召集
    if (sees && (s.phase === 'roam' || s.phase === 'search')) {
      if (!s.howled) setPhase(s, 'howl')
      else setPhase(s, panic || d < 5 ? 'charge' : 'stalk')
    }
    // 看见它就逃跑 → 冲锋
    if (sees && panic && d < 14 && (s.phase === 'stalk' || s.phase === 'cower')) { setPhase(s, 'charge'); once(eng, 'hpanic', '你转身就跑——猎犬四肢着地猛冲过来！', 'damage') }
    // 直视：伏低后退，短暂有效
    const limit = l3 ? Infinity : 4 + (eng.playerNoiseT > 0 ? 2 : 0)
    if (gazing && s.gazeCd <= 0 && (s.phase === 'stalk' || s.phase === 'charge' || s.phase === 'search')) {
      setPhase(s, 'cower')
      once(eng, 'hgaze', '你死死盯住猎犬的眼睛——它伏低身子，一步步向后退。别指望这能撑多久。')
    }
    if (s.phase === 'cower') {
      if (gazing) s.gazeT += dt
      if (s.gazeT > limit) { s.gazeT = 0; s.gazeCd = 6; setPhase(s, 'charge'); eng.msg('猎犬习惯了你的目光，低吼着再次扑来！', 'damage'); audio.aggro() }
      else if (!gazing && s.t > 0.8) { setPhase(s, 'stalk') }
    } else s.gazeT = Math.max(0, s.gazeT - dt * 0.35)

    switch (s.phase) {
      case 'roam': {
        e.state = 'wander'
        if (e.stateT <= 0 || Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.4) eng.wanderTarget(e)
        tx = e.targetX; ty = e.targetY; speed = def.speed * 0.4
        break
      }
      case 'howl': {
        e.state = 'chase'; face = [p.x, p.y]
        if (!s.howled) {
          s.howled = true
          audio.houndHowl(Math.max(0.2, 1 - d / 26), 1, 1.3)
          once(eng, 'hhowl', '一声拖长的嚎叫在走廊里回荡——其他猎犬会循声而来。躲到它们的视线之外！', 'damage')
          for (const q of m.entities) {
            if (q === e || q.dead || q.def.type !== 'hound') continue
            if (Math.hypot(q.x - e.x, q.y - e.y) > 25 || Math.abs(q.z-e.z)>1.4) continue
            const qs = q.hd ?? initHound(eng, q)
            if (qs.neutral) continue
            qs.alert = 10; qs.lastX = e.x+ox; qs.lastY = e.y+oy; qs.howled = true
            if (qs.phase === 'roam') setPhase(qs, 'search')
          }
        }
        if (s.t > 1.1) setPhase(s, d < 6 ? 'charge' : 'stalk')
        break
      }
      case 'search': {
        e.state = 'investigate'
        tx = s.lastX-ox; ty = s.lastY-oy; speed = def.speed * 0.8
        if (Math.hypot(tx - e.x, ty - e.y) < 0.6 && s.alert <= 0) setPhase(s, 'roam')
        if (s.t > 12) setPhase(s, 'roam')
        break
      }
      case 'stalk': {
        e.state = 'chase'
        tx = sees ? p.x : s.lastX-ox; ty = sees ? p.y : s.lastY-oy; speed = def.speed * 0.75; face = sees ? [p.x, p.y] : null
        if (sees && d < 5) setPhase(s, 'charge')
        if (s.lostT > 6) { setPhase(s, 'search'); s.alert = 4 }
        break
      }
      case 'charge': {
        e.state = 'chase'
        tx = sees ? p.x : s.lastX-ox; ty = sees ? p.y : s.lastY-oy
        speed = def.speed * (l3 ? 1.7 : 1.55)
        face = [p.x, p.y]
        if (s.lostT > 4 && d > 6) { setPhase(s, 'search'); s.alert = 6 }
        break
      }
      case 'cower': {
        e.state = 'stunned'
        face = [p.x, p.y]
        if (!l3) { const a = Math.max(0.1, d); tx = e.x + (e.x - p.x) / a * 2; ty = e.y + (e.y - p.y) / a * 2; speed = def.speed * 0.22 }
        break
      }
      case 'flee': {
        e.state = 'investigate'
        const a = Math.max(0.1, d); tx = e.x + (e.x - p.x) / a * 5; ty = e.y + (e.y - p.y) / a * 5; speed = def.speed * 1.1
        if (s.t > 4) setPhase(s, 'roam')
        break
      }
      default: setPhase(s, 'roam')
    }

    // 扑击：2.4m 内起跳（前摇 0.3s 带前冲），命中震动与减速
    if(!los||s.phase==='cower'||s.phase==='flee')s.strikeT=undefined
    if (s.strikeT !== undefined) {
      s.strikeT -= dt
      tx = p.x; ty = p.y; speed = 7; face = [p.x, p.y]
      if (s.strikeT <= 0) {
        s.strikeT = undefined
        if (d < 1.5 && los && eng.meleeZOk(e) && !eng.dev.invisible) {
          eng.hurtPlayer(def.damage * dmgMult, def.name)
          eng.camShake = Math.min(1, eng.camShake + 0.7)
          p.slowT = Math.max(p.slowT, 0.8)
        }
        setPhase(s, 'stalk')
      }
    } else if (s.phase === 'charge' && los && d < 2.4 && e.attackCd <= 0 && eng.meleeZOk(e)) {
      e.attackCd = 1.5; e.lungeT = 0.32; s.strikeT = 0.3
    }
  }

  if (speed > 0) {
    e.targetX = tx; e.targetY = ty
    const stuck = eng.stepEntity(e, speed, dt)
    if (stuck && (s.phase === 'roam')) eng.wanderTarget(e)
    e.animT += dt * speed
  }
  if (face) eng.faceToward(e, face[0], face[1], dt, 8)
  else if (speed > 0) eng.faceToward(e, tx, ty, dt, 8)
  // 外观姿态量
  const k = Math.min(1, dt * 5)
  s.crouch += ((s.phase === 'cower' ? 1 : s.phase === 'stalk' ? 0.45 : 0) - s.crouch) * k
  s.howlPose += ((s.phase === 'howl' ? 1 : 0) - s.howlPose) * k
  s.sit += ((s.phase === 'sit' ? 1 : 0) - s.sit) * k * 0.6
  s.jaw += ((s.phase === 'howl' || s.strikeT !== undefined ? 1 : s.phase === 'charge' ? 0.55 : s.phase === 'cower' ? 0.25 : 0) - s.jaw) * k
  s.wag = s.neutral && (s.phase === 'sit' || s.phase === 'watch') ? 1 : 0
}
