// v53：现象与停电（层级氛围事件播报、L1「闪烁」停电链、视野计算）——
// 自 engine.ts 拆分，逻辑逐语句搬运。
import { LEVEL_EVENTS } from '../levels'
import { makeEntity } from '../entities'
import { restitch } from '../world/infinite'
import { audio } from '../core/audio'
import type { Engine } from '../engine'

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
  // 开发者现象开关：强制触发/屏蔽「闪烁」
  if (eng.dev.phenOn.has('flicker') && eng.levelDef.id === 1 && eng.blackoutT <= 0 && eng.blackoutWarnT <= 0) eng.startBlackout(20)
  if (eng.dev.phenOff.has('flicker')) {
    if (eng.blackoutWarnT > 0) eng.blackoutWarnT = 0
    else if (eng.blackoutT > 0) eng.endBlackout()
  }
}
// ---------- 层级氛围事件（wiki 设定播报）----------
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
  // L1「闪烁」现象（Fandom：停电数分钟到数天，实体倾巢而出）——低频率随机发生
  if (lvl === 1 && eng.blackoutT <= 0 && eng.blackoutWarnT <= 0 && !eng.dev.phenOff.has('flicker') && Math.random() < 0.12) {
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
}

export function applyBlackout(eng: Engine) {
  const m = eng.map
  if (!m) return
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
}

// 停电专属：在玩家周围的黑暗瓦片生成 2~3 只笑魇（打标 blackoutSpawn，电力恢复即退散）
export function spawnBlackoutSmilers(eng: Engine) {
  const m = eng.map!, p = eng.player
  const n = 2 + Math.floor(Math.random() * 2)
  for (let i = 0; i < n; i++) {
    for (let t = 0; t < 30; t++) {
      const ang = Math.random() * Math.PI * 2
      const r = 8 + Math.random() * 10
      const tx = Math.floor(p.x + Math.cos(ang) * r), ty = Math.floor(p.y + Math.sin(ang) * r)
      if (eng.entityWalkH(m, tx, ty, 0) === null) continue
      const e = makeEntity('smiler', tx + 0.5, ty + 0.5)
      e.blackoutSpawn = true
      m.entities.push(e)
      break
    }
  }
}

export function endBlackout(eng: Engine) {
  if (eng.map?.inf) {
    eng.map.inf.blackout = false
    restitch(eng.map) // 立即按 chunk 重建窗口数组，灯光恢复
  } else if (eng.blackoutBackup && eng.map) {
    // 停电期间玩家可能用荧光棒追加了光源，保留新增部分
    const added = eng.map.lights.filter((l) => !eng.blackoutBackup!.includes(l))
    eng.map.lights = [...eng.blackoutBackup, ...added]
  }
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
}
// ---------- 视野 ----------
export function computeVisibility(eng: Engine) {
  const m = eng.map!, p = eng.player
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
