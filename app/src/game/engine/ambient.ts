import { flickerL1Crates } from './l1State'
// v53：现象与停电（层级氛围事件播报、L1「闪烁」停电链、视野计算）——
// 自 engine.ts 拆分，逻辑逐语句搬运。
import { LEVEL_EVENTS } from '../levels'
import { makeEntity } from '../entities'
import { restitch } from '../world/infinite'
import { l1StyleAt } from '../world/l1Architecture'
import { audio } from '../core/audio'
import type { Engine } from '../engine'

const handWeatherThunder = new WeakMap<Engine, string>()
const l10WeatherAudio = new WeakMap<Engine, string>()
const l10WeatherSyncT = new WeakMap<Engine, number>()

// ---- 层级氛围事件（wiki 设定播报）+ L1 停电预警/恢复 + 开发者现象开关 ----
// （原 step 内联段，逐语句搬运）
export function updateAmbient(eng: Engine, dt: number) {
  // ---- 层级氛围事件（wiki 设定播报）+ L1 停电恢复 ----
  eng.ambientT -= dt
  if (eng.ambientT <= 0) {
    eng.ambientT = 16 + Math.random() * 18
    eng.rollAmbientEvent()
  }
  if (eng.blackoutWarnT > 0) {
    // v31：「闪烁」预警期——灯光快速明灭数秒后才真正停电
    eng.blackoutWarnT -= dt
    if (eng.blackoutWarnT <= 0) eng.applyBlackout()
  }
  if (eng.blackoutT > 0) {
    eng.blackoutT -= dt
    if (eng.blackoutT <= 0) eng.endBlackout()
  }
  if(eng.player.level===1&&eng.mpSession?.started&&eng.mpSession.isHost&&Math.floor(eng.time/5)!==Math.floor((eng.time-dt)/5)){
    const inf=eng.map?.inf;if(inf?.l1Dynamics)bcast(eng,{t:'l1crates',seed:inf.seed,epoch:inf.l1Dynamics.epoch,hidden:inf.l1Dynamics.hidden})
  }
  updateL9Fog(eng, dt)
  updateL10Weather(eng, dt)
  // 开发者现象开关：强制触发/屏蔽「闪烁」
  if (eng.dev.phenOn.has('flicker') && eng.levelDef.id === 1 && eng.blackoutT <= 0 && eng.blackoutWarnT <= 0) eng.startBlackout(20)
  if (eng.dev.phenOff.has('flicker')) {
    if (eng.blackoutWarnT > 0) eng.blackoutWarnT = 0
    else if (eng.blackoutT > 0) eng.endBlackout()
  }
  // L8 巨臂林地天气只影响玩家当前所在的高洞厅。周期与渲染端一致，因此雨声和闪电画面同步。
  const hw = eng.levelDef.id === 8
    ? eng.map?.structures.find((s) => s.kind === 'handweather'
      && eng.player.x >= s.x && eng.player.x < s.x + s.w
      && eng.player.y >= s.y && eng.player.y < s.y + s.h)
    : undefined
  if (hw?.data?.storm) {
    const phase = Number(hw.data.phase ?? 0), period = Math.max(8, Number(hw.data.period ?? 24))
    const t = eng.time + phase
    const cycleIndex = Math.floor(t / period)
    const cycle = ((t % period) + period) % period / period
    const storm = cycle > 0.12 && cycle < 0.4
      ? Math.min(1, (cycle - 0.12) / 0.06, (0.4 - cycle) / 0.075)
      : 0
    audio.setCaveWeather(storm)
    if (cycle > 0.25 && cycle < 0.271) {
      const strikeId = `${String(hw.data.sid ?? 0)}:${cycleIndex}`
      if (handWeatherThunder.get(eng) !== strikeId) {
        handWeatherThunder.set(eng, strikeId)
        audio.caveThunder(0.72 + Math.random() * 0.28)
      }
    }
  } else audio.stopCaveWeather()
}

/** L10 短阵风、稀有小雨与薄雾；天气不降低环境光，只改变风、湿润度与可见距离。 */
function updateL10Weather(eng: Engine, dt: number) {
  if ((eng.levelDef.id !== 10 && eng.levelDef.id !== 11) || !eng.map) return
  const city=eng.levelDef.id===11
  const w = city ? eng.l11Weather : eng.l10Weather
  const sync=()=>{
    bcast(eng, {t:city?'l11weather':'l10weather',kind:w.kind,time:w.t,k:w.k,wetness:w.wetness})
    if(city&&eng.map?.inf)bcast(eng,{t:'l11revisions',seed:eng.map.inf.seed,revisions:eng.map.inf.cityRevisions??{}})
  }
  w.t = Math.max(0, w.t - dt)
  const target = w.kind === 'calm' ? 0 : 1
  w.k += (target - w.k) * Math.min(1, dt * (target > w.k ? .7 : .28))
  w.wetness = Math.max(0, Math.min(1, w.wetness + (w.kind === 'rain' ? dt * .045 : -dt * .0025)))

  const audioKind = w.kind === 'rain' && w.k > .08 ? 'rain' : 'dry'
  if (l10WeatherAudio.get(eng) !== audioKind) {
    l10WeatherAudio.set(eng, audioKind)
    if (audioKind === 'rain') audio.startRain()
    else audio.stopRain()
  }

  // 房主每 5 秒广播一次状态，迟加入的客人也能追上相同天气；客人同层时不自行掷骰。
  if (eng.mpSession?.started && eng.mpSession.isHost) {
    const next = (l10WeatherSyncT.get(eng) ?? 0) - dt
    if (next <= 0) {
      l10WeatherSyncT.set(eng, 5)
      sync()
    } else l10WeatherSyncT.set(eng, next)
  }
  if (w.t > 0 || hostHere(eng)) return

  if (w.kind !== 'calm') {
    w.kind = 'calm'; w.t = (city?180:65) + Math.random() * 100
    sync()
    return
  }
  const r = Math.random()
  if (r < .72) {
    w.kind = 'gust'; w.t = 10 + Math.random() * 16
    eng.msg(city?'街道间涌来一阵凉风，楼顶的旗帜短暂扬起。':'一阵短促的风压过麦田，麦浪从视野一端追向另一端。', 'lore')
  } else if (r < .91) {
    w.kind = 'rain'; w.t = 24 + Math.random() * 34
    eng.msg(city?'细雨从连绵灰云中落下，柏油与石材渐渐泛起湿亮。':'细雨从连续的阴云中落下，车辙和木板很快泛起湿亮。', 'lore')
  } else {
    w.kind = 'mist'; w.t = 30 + Math.random() * 45
    eng.msg(city?'薄雾沿运河漫过来，远处楼群和云层一起淡入灰白。':'一层薄雾沿低洼地漫过来，天空和远处田埂一起失去轮廓。', 'lore')
  }
  sync()
}

function spawnL9FogMangled(eng: Engine) {
  if (hostHere(eng)) return
  const m = eng.map, p = eng.player
  if (!m || m.entities.some(e => !e.dead && e.l9FogSpawn)) return
  for (let a = 0; a < 60; a++) {
    const ang = Math.random() * Math.PI * 2
    const r = 10 + Math.random() * 8
    const tx = Math.floor(p.x + Math.cos(ang) * r), ty = Math.floor(p.y + Math.sin(ang) * r)
    if (tx < 1 || ty < 1 || tx >= m.w - 1 || ty >= m.h - 1) continue
    const i = ty * m.w + tx
    if (m.outdoor[i] !== 1 || eng.entityWalkH(m, tx, ty, 0) === null) continue
    const e = makeEntity('mangled', tx + 0.5, ty + 0.5)
    e.l9FogSpawn = true
    e.state = 'chase'; e.targetX = p.x; e.targetY = p.y; e.stateT = 0
    m.entities.push(e)
    return
  }
}

/** L9 黑雾是非常罕见的完整事件链，而不是常驻随机实体池的一部分。 */
function updateL9Fog(eng: Engine, dt: number) {
  if (eng.levelDef.id !== 9 || !eng.map) {
    eng.l9FogK = 0
    return
  }
  if (eng.dev.phenOff.has('l9fog')) {
    for (const e of eng.map.entities) if (e.l9FogSpawn && !e.dead) { e.dead = true; e.deathT = 0.35 }
    eng.l9FogPhase = 'idle'; eng.l9FogK = 0; eng.l9FogT = 300
    return
  }
  if (eng.dev.phenOn.has('l9fog') && eng.l9FogPhase === 'idle') eng.l9FogT = 0
  eng.l9FogT -= dt
  if (eng.l9FogPhase === 'idle') {
    eng.l9FogK = 0
    if (eng.l9FogT > 0 || hostHere(eng)) return
    eng.l9FogPhase = 'warning'; eng.l9FogT = 18
    eng.msg('街区尽头涌来一层不自然的浓雾。空气里传出湿布拖过柏油的声音。', 'damage')
    audio.aggro()
    return
  }
  if (eng.l9FogPhase === 'warning') {
    eng.l9FogK = Math.max(0, Math.min(1, 1 - eng.l9FogT / 18))
    if (eng.l9FogT > 0) return
    eng.l9FogPhase = 'active'; eng.l9FogT = 34 + Math.random() * 12; eng.l9FogK = 1
    spawnL9FogMangled(eng)
    eng.msg('浓雾吞没了整条街。有什么残缺的轮廓正在雾里拼起自己。', 'damage')
    return
  }
  if (eng.l9FogPhase === 'active') {
    eng.l9FogK = 1
    if (eng.l9FogT > 0) return
    eng.l9FogPhase = 'fade'; eng.l9FogT = 14
    eng.msg('雾层开始变薄，扭曲的脚步声也在后退。', 'system')
    return
  }
  eng.l9FogK = Math.max(0, Math.min(1, eng.l9FogT / 14))
  if (eng.l9FogT > 0) return
  for (const e of eng.map.entities) if (e.l9FogSpawn && !e.dead) { e.dead = true; e.deathT = 0.6 }
  eng.l9FogPhase = 'idle'; eng.l9FogK = 0; eng.l9FogT = 320 + Math.random() * 520
}
// ---------- 层级氛围事件（wiki 设定播报）----------
/** v59 联机：房主是否与本端同层——同层时全局事件/停电生成由房主权威驱动，客人不本地掷骰 */
function hostHere(eng: Engine): boolean {
  const mp = eng.mpSession
  return !!(mp?.started && !mp.isHost && mp.remotes.get('HOST')?.s.level === eng.player.level)
}
/** 房主广播全局事件（应用远端事件期间不再广播，防回环） */
function bcast(eng: Engine, e: Parameters<NonNullable<Engine['mpSession']>['sendEvent']>[0]) {
  const mp = eng.mpSession
  if (mp?.started && mp.isHost && !eng.applyingNet) eng.emit({ kind: 'mpevent', mp: e })
}

export function rollAmbientEvent(eng: Engine) {
  const lvl = eng.player.level
  if (lvl === 6) {
    // 只有地表会出现极远的自然声幻听；大多数轮次维持彻底寂静。
    if (eng.player.floor === 0 && Math.random() < 0.18) {
      const bird = Math.random() < 0.36
      audio.tundraHallucination(bird)
      eng.msg(bird ? '极远处传来两三声鸟鸣。你抬头时，天空仍旧空无一物。' : '一阵很远的风声擦过地平线；身边的枯枝却没有动。', 'lore')
    }
    return
  }
  if (lvl === 9) {
    // 邻里守望是观察者/挺进者的统称：电子设备只会惊动或引来这两类个体。
    const p = eng.player
    const electronic = p.flashlight || (p.equip.head?.type === 'nightvision' && p.battery > 0)
    if (electronic && Math.random() < 0.09) {
      let n = 0
      for (const e of eng.map?.entities ?? []) {
        if (e.dead || (e.def.type !== 'watcher' && e.def.type !== 'strider')) continue
        e.state = 'chase'; e.targetX = p.x; e.targetY = p.y; e.stateT = 0; n++
      }
      if (n) { eng.msg('电子设备发出一声短促杂音。远处的邻里守望改变了巡行方向。', 'damage'); audio.aggro() }
    }
  }
  // L1「闪烁」现象（Fandom：停电数分钟到数天，实体倾巢而出）——低频率随机发生
  // v59 联机：房主在同层时由房主统一掷骰并广播，客人跳过本地随机（两端同步停/来电）
  if (lvl === 1 && eng.blackoutT <= 0 && eng.blackoutWarnT <= 0 && !eng.dev.phenOff.has('flicker') && !hostHere(eng) && Math.random() < 0.12) {
    eng.startBlackout(14 + Math.random() * 10)
    return
  }
  const pool = LEVEL_EVENTS[lvl]
  if (!pool?.length) return
  eng.msg(pool[Math.floor(Math.random() * pool.length)], 'lore')
}

export function startBlackout(eng: Engine, dur: number) {
  const m = eng.map
  if (!m || eng.blackoutBackup || m.inf?.blackout || eng.blackoutWarnT > 0) return
  // v31：「闪烁」——完全停电前先进入预警期：所有主区域灯光快速闪烁数秒
  eng.blackoutWarnT = 3.5
  eng.blackoutPendingDur = dur
  eng.msg('灯光开始剧烈闪烁，电流声忽高忽低——', 'damage')
  audio.spark()
  bcast(eng, { t: 'blackout', ph: 'warn', dur }) // v59：联机同步
}

export function applyBlackout(eng: Engine) {
  const m = eng.map
  if (!m) return
  if (eng.blackoutT > 0 || m.inf?.blackout) return // v59：幂等守卫（联机下本地预警计时与房主 start 事件会先后到达）
  if (m.inf) {
    // 无限模式：stitch 会重建 m.lights，数组置换会被冲掉——改走 inf.blackout 标志
    // （stitch 据此剔除层级固有灯；维护通廊 keep 灯与玩家追加灯保留）
    m.inf.blackout = true
    m.lights = m.lights.filter((l) => l.keep === 1 || !l.gen)
  } else {
    eng.blackoutBackup = m.lights
    m.lights = m.lights.filter(() => Math.random() < 0.15) // 仅剩零星应急灯
  }
  eng.blackoutT = eng.blackoutPendingDur
  eng.msg('灯光一排排熄灭——停电了。黑暗里有什么开始移动。', 'damage')
  audio.spark()
  // L1「闪烁」：笑魇在黑暗中倾巢而出（灯光恢复时消散）
  if (eng.player.level === 1) eng.spawnBlackoutSmilers()
  bcast(eng, { t: 'blackout', ph: 'start' }) // v59：联机同步
}

// 停电专属：在玩家周围的黑暗瓦片生成 2~3 只笑魇（打标 blackoutSpawn，电力恢复即退散）
export function spawnBlackoutSmilers(eng: Engine) {
  // v59 联机：房主在同层时客人不本地生成——房主的个体会经实体快照同步过来（避免两端各刷一份）
  if (hostHere(eng)) return
  const m = eng.map!, p = eng.player
  const n = 2 + Math.floor(Math.random() * 2)
  for (let i = 0; i < n; i++) {
    for (let t = 0; t < 30; t++) {
      const ang = Math.random() * Math.PI * 2
      const r = 8 + Math.random() * 10
      const tx = Math.floor(p.x + Math.cos(ang) * r), ty = Math.floor(p.y + Math.sin(ang) * r)
      const style = l1StyleAt(m, tx + 0.5, ty + 0.5)
      const inf = m.inf
      const chunk = inf?.chunks.get(`${Math.floor((inf.ox + tx + 0.5) / 32)},${Math.floor((inf.oy + ty + 0.5) / 32)}`)
      if (style === 'maintenance' || chunk?.variant === 'maintenance') continue
      if (eng.entityWalkH(m, tx, ty, 0) === null) continue
      const e = makeEntity('smiler', tx + 0.5, ty + 0.5)
      e.blackoutSpawn = true
      m.entities.push(e)
      break
    }
  }
}

export function endBlackout(eng: Engine) {
  if (eng.blackoutT <= 0 && !eng.map?.inf?.blackout && !eng.blackoutBackup) return // v59：幂等守卫（未在停电则无操作）
  if (eng.map?.inf) {
    eng.map.inf.blackout = false
    restitch(eng.map) // 立即按 chunk 重建窗口数组，灯光恢复
  } else if (eng.blackoutBackup && eng.map) {
    // 停电期间玩家可能用荧光棒追加了光源，保留新增部分
    const added = eng.map.lights.filter((l) => !eng.blackoutBackup!.includes(l))
    eng.map.lights = [...eng.blackoutBackup, ...added]
  }
  flickerL1Crates(eng)
  eng.blackoutBackup = null
  eng.blackoutT = 0
  // 停电生成的笑魇随灯光恢复退散（其他层级的常驻笑魇无标记，不受影响）
  if (eng.map) {
    const fleeing = eng.map.entities.filter((e) => e.blackoutSpawn && !e.dead)
    if (fleeing.length > 0) {
      for (const e of fleeing) { e.dead = true; e.deathT = 0.6 }
      eng.msg('灯光亮起，笑魇退回了黑暗。', 'system')
    }
  }
  eng.msg('电流声重新响起，灯光逐一恢复。', 'system')
  bcast(eng, { t: 'blackout', ph: 'end' })
  if(eng.map?.inf?.l1Dynamics)bcast(eng,{t:'l1crates',seed:eng.map.inf.seed,epoch:eng.map.inf.l1Dynamics.epoch,hidden:eng.map.inf.l1Dynamics.hidden}) // v59：联机同步
}
// ---------- 视野 ----------
export function computeVisibility(eng: Engine) {
  const m = eng.map!, p = eng.player
  // 据点进入时已经解锁完整地图（level.ts 会把 explored 填满）。继续每帧向数百格
  // 发射视线没有任何可见结果，却会重复触发数万次结构碰撞查询。
  if (eng.levelDef.fullMap) {
    eng.visible.fill(1)
    return
  }
  eng.visible.fill(0)
  const r = 8
  const px = Math.floor(p.x), py = Math.floor(p.y)
  for (let y = Math.max(0, py - r); y <= Math.min(m.h - 1, py + r); y++) {
    for (let x = Math.max(0, px - r); x <= Math.min(m.w - 1, px + r); x++) {
      const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y)
      if (d > r) continue
      if (eng.los(p.x, p.y, x + 0.5, y + 0.5)) {
        eng.visible[y * m.w + x] = 1
        eng.explored[y * m.w + x] = 1
        // 光源照亮额外格
        for (const l of m.lights) {
          if (Math.hypot(l.x - x - 0.5, l.y - y - 0.5) < l.r) eng.explored[y * m.w + x] = 1
        }
      }
    }
  }
}
