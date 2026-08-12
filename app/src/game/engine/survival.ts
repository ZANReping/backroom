// v53：生存属性（饥饿/口渴/理智/电池/体力提示/低理智幻影 + 现象判定汇总）——
// 自 engine.ts step 内联段拆分，逻辑逐语句搬运；返回 true 表示本帧已死亡（原 step 的 return）。
// v55：疫疾（Entity 19）隐藏感染值——湿地/锅炉房积累、四阶段效果、升阶计图鉴遭遇。
import { tileAt } from '../world/mapgen'
import { audio } from '../core/audio'
import { recordEncounter } from '../entities'
import type { Engine } from '../engine'

type DiffMult = { dmg: number; drain: number }

/** v55：感染阶段（每 100 点一阶，封顶 4） */
export function infectionStageOf(infection: number): number {
  return Math.min(4, Math.floor(infection / 100))
}

/** 生存消耗主段（原 step「---- 生存消耗 ----」至低理智幻影一整段） */
export function updateSurvival(eng: Engine, dt: number, dm: DiffMult, mag: number): boolean {
  const p = eng.player, m = eng.map!
  // ---- 生存消耗（v51：据点中饥饿下降 ×1/3；玩家不动时 ×1/2，可叠加）----
  const hungerK = (eng.inOutpost ? 1 / 3 : 1) * (mag > 0.1 ? 1 : 0.5)
  p.hunger = Math.max(0, p.hunger - 0.28 * dm.drain * (eng.levelDef.entropy ?? 1) * hungerK * dt)
  if (p.hunger <= 25 && eng.statusMsgT.hunger <= 0) {
    eng.statusMsgT.hunger = 8
    eng.msg('你饿得头晕。', 'damage')
    audio.stomach()
  }
  if (p.hunger <= 0 && !eng.dev.god) { p.hp -= 1.2 * dt; if (p.hp <= 0) { eng.die('饿死了'); return true } }
  // v54：口渴值——与饥饿同率自然流失（据点 ×1/3、不动 ×1/2 同规则叠加）；体力耗尽（stamina ≤1，同 movement 冲刺耗尽阈值）时流失 ×2
  const thirstK = hungerK * (p.stamina <= 1 ? 2 : 1)
  p.thirst = Math.max(0, p.thirst - 0.28 * dm.drain * (eng.levelDef.entropy ?? 1) * thirstK * dt)
  if (p.thirst <= 25 && eng.statusMsgT.thirst <= 0) {
    eng.statusMsgT.thirst = 8
    eng.msg('你渴得喉咙发干。', 'damage')
    audio.stomach()
  }
  if (p.thirst <= 0 && !eng.dev.god) { p.hp -= 1.2 * dt; if (p.hp <= 0) { eng.die('渴死了'); return true } }
  // ---- v55：疫疾（Entity 19）隐藏感染值 ----
  // 积累：站在潮湿地板（wet=1，液态水里不算）或 L3/L5 锅炉房区域，每秒 +1
  {
    const ti = Math.floor(p.y) * m.w + Math.floor(p.x)
    let breeding = m.wet?.[ti] === 1 && eng.inLiquid === 0
    if (!breeding && (p.level === 3 || p.level === 5)) {
      for (const s of m.structures) {
        if (s.kind !== 'boiler' && s.kind !== 'sphboiler') continue
        if (Math.hypot(s.x + s.w / 2 - p.x, s.y + s.h / 2 - p.y) < 4) { breeding = true; break }
      }
    }
    if (eng.infectionRecoverT > 0) {
      // v55：「恢复」buff——持续期间感染值不再增长；在非感染区缓慢自然消退（每 5s -1）
      eng.infectionRecoverT -= dt
      if (!breeding) p.infection = Math.max(0, p.infection - dt / 5)
    } else if (breeding) p.infection += dt
    // 阶段跟踪：每次进入新阶段 = 图鉴遭遇「疫疾」一次（malady 无实体实例，直接计类型）
    const st = infectionStageOf(p.infection)
    if (st > eng.infectionStage) {
      for (let i = eng.infectionStage; i < st; i++) recordEncounter('malady')
      eng.infectionStage = st
    } else if (st < eng.infectionStage) eng.infectionStage = st // 治愈/退阶后再次升阶会重新计数
    // 阶段2（潜藏期）：偶尔咳嗽——咳嗽按噪音事件处理（可吸引实体）
    if (st >= 2) {
      eng.coughT -= dt
      if (eng.coughT <= 0) {
        eng.coughT = 12 + Math.random() * 14
        eng.msg('你没忍住咳嗽了一声。', 'system')
        eng.noiseEvent(p.x, p.y, 6, false)
      }
    }
    // 阶段4（坏死期）：生命值持续流失直至死亡
    if (st >= 4 && !eng.dev.god) { p.hp -= 1.2 * dt; if (p.hp <= 0) { eng.die('疫疾恶化而亡'); return true } }
  }
  // 理智：黑暗中流失
  const lit = eng.isLit(p.x, p.y)
  // 现象判定：孤立效应——Level 0 除马尼拉室外的所有区域发生（红室 tint=2，马尼拉 tint=1），
  // 生效期间替代原版的黑暗理智流失机制；植殖癌——花园段生效（判定见上方，含染病未愈期）。
  // 开发者面板可对每个现象强制开（phenOn）/强制关（phenOff）
  const pTint = m.tint?.[Math.floor(p.y) * m.w + Math.floor(p.x)] ?? 0
  let isolation = p.level === 0 && pTint !== 1
  if (eng.dev.phenOn.has('isolation')) isolation = true
  if (eng.dev.phenOff.has('isolation')) isolation = false
  const flickerActive = eng.levelDef.id === 1 &&
    (eng.dev.phenOn.has('flicker') || (!eng.dev.phenOff.has('flicker') && (eng.blackoutWarnT > 0 || eng.blackoutT > 0)))
  eng.activePhenomena = [
    ...(isolation ? ['isolation'] : []),
    ...(eng.inGardenEff || eng.plantK > 0.01 ? ['plantcancer'] : []),
    ...(flickerActive ? ['flicker'] : []),
  ]
  if (!eng.dev.god) {
    if (isolation) {
      // 孤立效应：缓慢失去理智；红室内流失速率加倍
      p.sanity -= 0.25 * dm.drain * (pTint === 2 ? 2 : 1) * dt
    } else if (!lit && !p.flashlight) p.sanity -= 1.5 * dm.drain * dt
    else if (!lit) p.sanity -= 0.5 * dm.drain * dt
    else p.sanity = Math.min(100, p.sanity + 0.4 * dt)
    // 附近实体压迫感
    for (const e of m.entities) {
      if (e.dead || e.hidden || e.disguised) continue
      const d = Math.hypot(e.x - p.x, e.y - p.y)
      if (d < 5 && !e.def.passive) p.sanity -= (5 - d) * 0.5 * dt
    }
    p.sanity = Math.max(0, Math.min(100, p.sanity))
    // v32：皇家口粮——理智下限锁定（成瘾崩塌期间失效，崩塌时理智急速下降）
    if (eng.royalDrainT > 0) { eng.royalDrainT -= dt; p.sanity = Math.max(0, p.sanity - 9 * dt) }
    else if (p.sanity < eng.sanityFloor) p.sanity = eng.sanityFloor
  }
  // v32：皇家口粮成瘾期计时（期间其他食物不恢复饥饿）
  if (eng.royalAddictT > 0) {
    eng.royalAddictT -= dt
    if (eng.royalAddictT <= 0) eng.msg('对皇家口粮的渴求终于褪去了。', 'system')
  }
  // v23：Level 6 的外带光源全部失效——开关是响的，灯头在发烫，但视野里什么都没有改变
  if (eng.levelDef.noFlashlight && p.flashlight && eng.statusMsgT.battery <= 0) {
    eng.statusMsgT.battery = 14
    eng.msg('手电亮着，灯头在发烫——但你的视野里什么都没有改变。', 'lore')
  }
  if (p.flashlight) {
    // v23：Level 8 的熵效应——电池飞快耗尽
    p.battery = Math.max(0, p.battery - 0.5 * (eng.levelDef.entropy ?? 1) * dt)
    if (p.battery <= 0) { p.flashlight = false; eng.msg('手电筒没电了。', 'system') }
    else if (p.battery <= 15 && eng.statusMsgT.battery <= 0) {
      eng.statusMsgT.battery = 10
      eng.msg('手电电池快耗尽了，光开始闪烁。', 'system')
    }
  }
  // 开发者模式：状态锁定（devSetStat 会暂时解除锁定以便手动调整）
  // v55：infection 一并锁定——语义取「锁满=健康满状态」，即每帧锁回 0（永不染病；与锁满 HP/饥饿同类）
  if (eng.dev.god && eng.dev.statLock) { p.hp = 100; p.sanity = 100; p.hunger = 100; p.thirst = 100; p.stamina = 100; p.infection = 0; if (p.flashlight) p.battery = 100 }

  audio.updateHeartbeat(p.hp)
  audio.updateWhispers(dt, p.sanity)
  audio.setSanityDistort(p.sanity)

  // 低理智幻影
  if (p.sanity < 40 && Math.random() < dt * 0.25 && eng.fakes.length < 4) {
    const ang = Math.random() * Math.PI * 2
    const fx = p.x + Math.cos(ang) * 6, fy = p.y + Math.sin(ang) * 6
    if (tileAt(m, Math.floor(fx), Math.floor(fy)) === 1)
      eng.fakes.push({ x: fx, y: fy, t: 2 + Math.random() * 3 })
  }
  for (const f of eng.fakes) f.t -= dt
  eng.fakes = eng.fakes.filter((f) => f.t > 0)
  return false
}
