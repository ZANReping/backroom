// v53：存档读写（自 engine.ts 拆分；逻辑逐语句搬运，存档格式/字段迁移语义不变）
// v54：存档槽位——3 个手动槽 + 1 个自动保存槽（localStorage 键 br_save_slot1/2/3 + br_save_auto）。
// 旧版单存档（br_save 种子键 + br_save_state 快照键）首次读取时迁移为槽 1 并清除旧键。
// 写入时机：自动槽 = 切层（loadLevel 非读档路径）+ 游戏进行中每 60 秒；
// 手动槽 = 暂停/退回主界面落盘（engine.update 的 idleSaved 路径）与新开局（newRun 末尾）。
import { storage } from '../core/storage'
import type { QuestDef } from '../content/factions'
import type { Difficulty } from './shared'
import type { WarehouseState } from './warehouse'
import type { Engine, PlayerState } from '../engine'

// ===== v29a：存档/读档 =====
// v54 起：各槽位自持全量快照（含 seed/difficulty），继续游戏时凭种子匹配恢复进度。
export type SaveSlotId = 'slot1' | 'slot2' | 'slot3' | 'auto'
export const SAVE_SLOT_KEYS: Record<SaveSlotId, string> = {
  slot1: 'br_save_slot1',
  slot2: 'br_save_slot2',
  slot3: 'br_save_slot3',
  auto: 'br_save_auto',
}
export const SAVE_SLOT_LABELS: Record<SaveSlotId, string> = {
  slot1: '存档槽 1',
  slot2: '存档槽 2',
  slot3: '存档槽 3',
  auto: '自动保存',
}
// 旧版单存档键（v53 及之前）：br_save 仅存 seed+difficulty、br_save_state 存全量快照
export const SAVE_KEY = 'br_save_state'
const LEGACY_SEED_KEY = 'br_save'

export interface SaveSnapshot {
  v: 1
  seed: number
  difficulty: Difficulty
  time: number // 游戏内时间（地图种子派生依赖它）
  mapSeed: number // 当前层级地图生成种子（读档需复现同一张图）
  mapFirstVisit: boolean // 生成该图时的 firstVisit 标记（影响初始物资刷新）
  level: number
  visited: number[] // 已到过的层级（初始物资仅首访刷新）
  savedAt?: number // v54：落盘时间戳（槽位列表显示；旧档缺省）
  outpostReturn?: number | null // v35：进入据点前的层级（据点返程落点）
  rep?: Record<string, number> // v35：团体声望
  quests?: { def: QuestDef; progress: number; baseline: number; done: boolean }[] // v35：委托任务
  warehouses?: WarehouseState // v54：据点寄存仓库（阵营互通，每阵营 48 栏）
  brcSin?: { hurt: number; killed: number } // v39：BRC 未告发的伤害/杀死计数
  brcMimicCd?: number // v39：BRC 模仿装修冷却剩余秒数
  indoctrination?: number // v45：教化值 0~100（接触杰瑞积累；驯服清零；随存档持久）
  jerryTamed?: boolean // v45：鹉主已被杏仁水驯服（教化不再积累）
  jerryAgreed?: string[] // v45：已对其「认同杰瑞」的信众 NPC id（引路选项按此显示；v49 起每局至多一名——见 jerryOath）
  jerryOath?: boolean // v49：本局已宣誓认同杰瑞（+10 每局仅首次；之后任何信众处认同选项不再出现）
  homelyApplied?: boolean // v55：家常酒店入住申请已提交（L5 据点 111 准入）
  // v47：传教使命已标准委托化（kind 'preach' 进 quests，随 quests 持久）；旧档 jerryPreach 字段废弃不再读取
  player: PlayerState
}

/** 旧版单存档迁移：br_save_state 快照复制为槽 1（槽 1 已有内容则不覆盖），随后清除旧键 */
function migrateLegacy() {
  const raw = storage.get(SAVE_KEY)
  if (raw) {
    if (!storage.get(SAVE_SLOT_KEYS.slot1)) storage.set(SAVE_SLOT_KEYS.slot1, raw)
    storage.remove(SAVE_KEY)
  }
  storage.remove(LEGACY_SEED_KEY)
}

/** 读取指定槽位的快照（非法/损坏视为空槽） */
export function readSaveSlot(slot: SaveSlotId): SaveSnapshot | null {
  try {
    const raw = storage.get(SAVE_SLOT_KEYS[slot])
    if (!raw) return null
    const s = JSON.parse(raw) as SaveSnapshot
    if (!s || s.v !== 1 || typeof s.seed !== 'number' || !s.player) return null
    if (!Array.isArray(s.player.hotbar) || !Array.isArray(s.player.backpack)) return null
    return s
  } catch { return null }
}
export function loadSaveSnapshot(slot: SaveSlotId = 'slot1'): SaveSnapshot | null {
  migrateLegacy()
  return readSaveSlot(slot)
}

export interface SlotInfo { id: SaveSlotId; label: string; auto: boolean; snap: SaveSnapshot | null }
/** 标题屏槽位列表（含旧档迁移；自动槽只读——不可选为新游戏写入槽，但可读取继续） */
export function listSaveSlots(): SlotInfo[] {
  migrateLegacy()
  return (['slot1', 'slot2', 'slot3', 'auto'] as const).map((id) => ({
    id,
    label: SAVE_SLOT_LABELS[id],
    auto: id === 'auto',
    snap: readSaveSlot(id),
  }))
}

/** 清空指定槽位；缺省清空全部槽位与旧版键 */
export function clearSaveSnapshot(slot?: SaveSlotId) {
  if (slot) { storage.remove(SAVE_SLOT_KEYS[slot]); return }
  for (const k of Object.values(SAVE_SLOT_KEYS)) storage.remove(k)
  storage.remove(SAVE_KEY)
  storage.remove(LEGACY_SEED_KEY)
}
/** 死亡/通关后：本局进度失效——清空绑定槽与自动槽（其余槽位的别的局不受影响） */
export function clearRunSlots(eng: Engine) {
  clearSaveSnapshot(eng.saveSlot)
  if (eng.saveSlot !== 'auto') clearSaveSnapshot('auto')
}

// v29a：当前进度快照（纯 JSON 可序列化）
export function snapshot(eng: Engine): SaveSnapshot {
  return {
    v: 1,
    seed: eng.seed,
    difficulty: eng.difficulty,
    time: eng.time,
    mapSeed: eng.mapSeed,
    mapFirstVisit: eng.mapFirstVisit,
    level: eng.player.level,
    visited: [...eng.visitedLevels],
    outpostReturn: eng.outpostReturn,
    rep: eng.rep,
    quests: eng.quests,
    warehouses: JSON.parse(JSON.stringify(eng.warehouses)) as WarehouseState, // v54：寄存仓库库存
    brcSin: eng.brcSin,
    brcMimicCd: eng.brcMimicCd,
    indoctrination: eng.indoctrination,
    jerryTamed: eng.jerryTamed,
    jerryAgreed: [...eng.jerryAgreed],
    jerryOath: eng.jerryOath,
    homelyApplied: eng.homelyApplied, // v55：家常酒店入住申请（L5 据点 111 准入）
    player: JSON.parse(JSON.stringify(eng.player)),
  }
}
/** 立即写盘（暂停/退回主界面写绑定槽；周期与切层自动存档显式传 'auto'；死亡与胜利后不再覆盖存档） */
export function persist(eng: Engine, slot?: SaveSlotId) {
  if (!eng.map || eng.player.hp <= 0 || eng.victory) return
  const snap = eng.snapshot()
  snap.savedAt = Date.now()
  storage.set(SAVE_SLOT_KEYS[slot ?? eng.saveSlot], JSON.stringify(snap))
}
