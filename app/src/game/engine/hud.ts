// HUD 权限系统（前厅逐步解锁）。
// player.hudUnlocks 缺省（undefined）= 全部解锁：旧存档、跳过前厅、直接进 Level 0 的新游戏都走这条路径。
// 前厅开局写入 {}（只有准星与交互提示），拾取手机/背包/手电等物品时逐项解锁并播放浮现动画。
// 设置「始终显示全部 HUD」(engine.hudShowAll) 只影响显示，不改写存档里的解锁记录。
import type { Engine, PlayerState } from '../engine'

/** HUD 权限键。 */
export const HUD_KEYS = ['hotbar', 'inventory', 'battery', 'clock', 'quest', 'minimap', 'log', 'status', 'hp'] as const
export type HudKey = (typeof HUD_KEYS)[number]

export const HUD_KEY_LABEL: Record<HudKey, string> = {
  hotbar: '快捷栏', inventory: '背包界面', battery: '电量', clock: '时钟', quest: '任务追踪',
  minimap: '小地图', log: '日志', status: '生存状态', hp: '生命值',
}

/** 浮现动画时长（毫秒）——HUD 用同一常量决定 reveal class 的存续。 */
export const HUD_REVEAL_MS = 1900

/** 某 HUD 区块当前是否显示。showAll=设置「始终显示全部 HUD」。 */
export function hudAllowed(p: Pick<PlayerState, 'hudUnlocks'>, key: HudKey, showAll = false): boolean {
  if (showAll || !p.hudUnlocks) return true
  return !!p.hudUnlocks[key]
}

/** 引擎侧便捷判定（读 engine.hudShowAll）。 */
export function hudOn(eng: Engine, key: HudKey): boolean {
  return hudAllowed(eng.player, key, eng.hudShowAll)
}

/** 解锁若干 HUD 区块；返回本次新解锁的键。新解锁的键记录浮现时间戳（不入存档）。 */
export function unlockHud(eng: Engine, keys: readonly HudKey[]): HudKey[] {
  const p = eng.player
  if (!p.hudUnlocks) return [] // 已全部解锁
  const fresh: HudKey[] = []
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  for (const k of keys) {
    if (p.hudUnlocks[k]) continue
    p.hudUnlocks[k] = true
    eng.hudRevealAt[k] = now
    fresh.push(k)
  }
  if (fresh.length) eng.emit({ kind: 'toast', text: `HUD · ${fresh.map((k) => HUD_KEY_LABEL[k]).join(' / ')}` })
  return fresh
}

/** 全部解锁（离开前厅 / 读旧存档）：清空记录即视为全开。 */
export function unlockAllHud(eng: Engine) {
  eng.player.hudUnlocks = undefined
}

/** 该键是否处于浮现动画中（HUD 渲染时调用）。 */
export function hudRevealing(eng: Engine, key: HudKey, now = performance.now()): boolean {
  const t = eng.hudRevealAt[key]
  return t !== undefined && now - t < HUD_REVEAL_MS
}
