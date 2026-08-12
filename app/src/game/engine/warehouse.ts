// v54：据点寄存仓库——阵营互通（M.E.G. 仓：Alpha/Gemma/Omega 同一库存；B.N.T.G. 仓：存储设施/EL3A 同一库存），
// 每阵营 48 栏位。寄存 NPC 由 NpcDef.warehouse 标记（suanpan/brandt/hobbs= meg，vesper/dorian = bntg）；
// 对应团体声望 ≥10 时对话出现「寄存物品 / 取回物品」（DialogOverlay 仓库模式）。
// BNTG 付费通道（v54 二轮）：声望不足时可付 5 压印币临时使用——仅本次对话有效
// （warehouseTempUnlock 不持久，DialogOverlay 卸载即清空）；MEG 侧纯声望门槛，无付费通道。
// 堆叠/并摞规则与背包一致；装备位物品需先卸下（面板只列背包格，引擎侧同样拦截）。随存档快照持久。
import { ITEMS, itemName } from '../content/items'
import { NPCS } from '../content/npcs'
import { audio } from '../core/audio'
import type { Engine, InvSlot, SlotRef } from '../engine'

export type WarehouseFaction = 'meg' | 'bntg'
export const WAREHOUSE_SIZE = 48
export const WAREHOUSE_REP_GATE = 10 // 声望门槛：≥10 开放（含等于）
export const WAREHOUSE_PAY_COST = 5 // BNTG 付费通道：5 压印币临时使用（仅本次对话）
export const WAREHOUSE_FACTION_NAME: Record<WarehouseFaction, string> = { meg: 'M.E.G.', bntg: 'B.N.T.G.' }
export type WarehouseState = Record<WarehouseFaction, (InvSlot | null)[]>

export function freshWarehouses(): WarehouseState {
  return { meg: new Array(WAREHOUSE_SIZE).fill(null), bntg: new Array(WAREHOUSE_SIZE).fill(null) }
}

/** NPC 是否为寄存 NPC（NpcDef.warehouse 标记）及其阵营仓库 id；非寄存 NPC 返回 null */
export function warehouseOfNpc(npcId: string): WarehouseFaction | null {
  return NPCS[npcId]?.warehouse ?? null
}

/** 声望门槛：对应团体声望 ≥10 开放；或本对话已付费临时解锁（BNTG） */
export function canUseWarehouse(eng: Engine, npcId: string): boolean {
  const fac = warehouseOfNpc(npcId)
  if (!fac) return false
  return (eng.rep[fac] ?? 0) >= WAREHOUSE_REP_GATE || eng.warehouseTempUnlock.has(fac)
}

/** BNTG 付费通道：付 5 压印币临时使用仓库（仅本次对话；MEG 无付费通道直接失败） */
export function payWarehouseAccess(eng: Engine, fac: WarehouseFaction): boolean {
  if (fac !== 'bntg') { eng.msg('M.E.G. 的仓库只认声望，不收钱。', 'system'); return false }
  if (eng.warehouseTempUnlock.has(fac)) return true
  if (eng.countItem('presses') < WAREHOUSE_PAY_COST) { eng.msg(`压印币不够（需要 ${WAREHOUSE_PAY_COST} 枚）。`, 'system'); return false }
  for (let i = 0; i < WAREHOUSE_PAY_COST; i++) eng.consumeItem('presses')
  eng.warehouseTempUnlock.add(fac)
  audio.pickup()
  eng.msg(`收下 ${WAREHOUSE_PAY_COST} 枚压印币——仓库这次随你用。（仅本次对话有效）`, 'loot')
  return true
}

/** 寄存：背包/快捷栏物品移入阵营仓库（同类同 tag 先并摞；满仓失败） */
export function warehouseDeposit(eng: Engine, fac: WarehouseFaction, from: SlotRef): boolean {
  if (from.w !== 'hotbar' && from.w !== 'backpack') { eng.msg('装备位物品要先卸下才能寄存。', 'system'); return false }
  const s = eng.slotGet(from)
  if (!s) return false
  const wh = eng.warehouses[fac]
  const facName = WAREHOUSE_FACTION_NAME[fac]
  const stack = ITEMS[s.type]?.stack ?? 1
  if (stack > 1) {
    for (const w of wh) {
      if (!w || w.type !== s.type || w.tag !== s.tag || w.count >= stack) continue
      const mv = Math.min(stack - w.count, s.count)
      w.count += mv
      s.count -= mv
      if (s.count <= 0) {
        eng.slotSet(from, null)
        eng.syncPassives()
        eng.msg(`寄存了 ${itemName(s.type)}（${facName} 阵营仓库）`, 'system')
        return true
      }
    }
  }
  const free = wh.findIndex((x) => !x)
  if (free < 0) { eng.msg(`${facName} 阵营仓库已满（${WAREHOUSE_SIZE} 栏）。`, 'system'); return false }
  wh[free] = { ...s }
  eng.slotSet(from, null)
  eng.syncPassives()
  eng.msg(`寄存了 ${s.count > 1 ? `${itemName(s.type)} ×${s.count}` : itemName(s.type)}（${facName} 阵营仓库）`, 'system')
  return true
}

/** 取回：仓库栏位移回背包（同类同 tag 先并摞进快捷栏/背包；背包满失败，仓库栏位不动） */
export function warehouseWithdraw(eng: Engine, fac: WarehouseFaction, i: number): boolean {
  const wh = eng.warehouses[fac]
  const w = wh[i]
  if (!w) return false
  const p = eng.player
  const stack = ITEMS[w.type]?.stack ?? 1
  if (stack > 1) {
    for (const arr of [p.hotbar, p.backpack]) {
      for (const s of arr) {
        if (!s || s.type !== w.type || s.tag !== w.tag || s.count >= stack) continue
        const mv = Math.min(stack - s.count, w.count)
        s.count += mv
        w.count -= mv
        if (w.count <= 0) {
          wh[i] = null
          eng.syncPassives()
          eng.msg(`取回了 ${itemName(w.type)}`, 'system')
          return true
        }
      }
    }
  }
  let free: SlotRef | null = null
  const hi = p.hotbar.findIndex((x) => !x)
  if (hi >= 0) free = { w: 'hotbar', i: hi }
  else {
    const bi = p.backpack.findIndex((x) => !x)
    if (bi >= 0) free = { w: 'backpack', i: bi }
  }
  if (!free) { eng.msg('背包已满，取不出来。', 'system'); return false }
  eng.slotSet(free, { ...w })
  wh[i] = null
  eng.syncPassives()
  eng.msg(`取回了 ${w.count > 1 ? `${itemName(w.type)} ×${w.count}` : itemName(w.type)}`, 'system')
  return true
}
