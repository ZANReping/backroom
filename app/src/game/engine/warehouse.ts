// v54：据点寄存仓库——阵营互通（M.E.G. 仓：Alpha/Gemma/Omega 同一库存；B.N.T.G. 仓：存储设施/EL3A 同一库存），
// 每阵营 48 栏位。寄存 NPC 由 NpcDef.warehouse 标记（suanpan/brandt/hobbs= meg，vesper/dorian = bntg）；
// 对应团体声望 ≥10 时对话出现「寄存物品 / 取回物品」（DialogOverlay 仓库模式）。
// BNTG 付费通道（v54 二轮）：声望不足时可付 5 压印币临时使用——仅本次对话有效
// （warehouseTempUnlock 不持久，DialogOverlay 卸载即清空）；MEG 侧纯声望门槛，无付费通道。
// 堆叠/并摞规则与背包一致；装备位物品需先卸下（面板只列背包格，引擎侧同样拦截）。随存档快照持久。
import { ITEMS, itemName } from '../content/items'
import { isGun, isAmmo } from '../content/firearms'
import { NPCS } from '../content/npcs'
import { L11_PEOPLE } from '../content/l11People'
import { audio } from '../core/audio'
import {payBntgService} from './bntgBank'
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
  return NPCS[npcId]?.warehouse ?? L11_PEOPLE.find(n => n.id === npcId)?.warehouse ?? null
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
  const paid=payBntgService(eng,WAREHOUSE_PAY_COST,'临时使用 B.N.T.G. 仓库')
  if(!paid.ok){eng.msg(paid.message,'system');return false}
  eng.warehouseTempUnlock.add(fac)
  audio.pickup()
  eng.msg(`已付 ${WAREHOUSE_PAY_COST} 信用点／压印币——仓库这次随你用。（仅本次对话有效）`, 'loot')
  return true
}

export type WarehouseCat = 'weapon' | 'med' | 'food' | 'power' | 'gear' | 'misc'
export const WAREHOUSE_CAT_LABEL: Record<WarehouseCat, string> = { weapon: '武器', med: '医疗', food: '食水', power: '电源照明', gear: '装备', misc: '杂项' }
const CAT_ORDER: WarehouseCat[] = ['weapon', 'med', 'food', 'power', 'gear', 'misc']
const RARITY_ORDER: Record<string, number> = { epic: 0, rare: 1, uncommon: 2, common: 3 }
export function warehouseCat(type: string): WarehouseCat {
  const d = ITEMS[type]
  if (!d) return 'misc'
  if (d.weapon || isGun(type) || isAmmo(type)) return 'weapon'
  if (d.use === 'eat' || d.use === 'sanityeat' || d.value3 != null) return 'food' // 饮品（杏仁水等）也算食水
  if (d.use === 'heal' || d.use === 'cure' || d.use === 'sanity' || d.use === 'bigsanity') return 'med'
  if (d.use === 'battery' || d.use === 'light') return 'power'
  if (d.equip) return 'gear'
  return 'misc'
}

type Slots = (InvSlot | null)[]
const cloneSlot = (s: InvSlot): InvSlot => ({ ...s, ...(s.mag ? { mag: [...s.mag] } : {}) })
const validSlot = (s: InvSlot | null | undefined): s is InvSlot => !!s && Number.isSafeInteger(s.count) && s.count > 0
const stackSize = (s: InvSlot) => Math.max(1, ITEMS[s.type]?.stack ?? 1)
/** Equal item state is required when merging; keep origin, wear, blood and loaded ammunition. */
const stackMatches = (a: InvSlot, b: InvSlot) => a.type === b.type && a.tag === b.tag && a.dur === b.dur && a.blood === b.blood && a.ammoSel === b.ammoSel && a.stage === b.stage && a.cyl === b.cyl && JSON.stringify(a.mag) === JSON.stringify(b.mag)
function capacity(arrays: Slots[], source: InvSlot): number {
  const stack = stackSize(source)
  return arrays.reduce((total, slots) => total + slots.reduce((n, s) => n + (!s ? stack : stack > 1 && stackMatches(s, source) ? Math.max(0, stack - s.count) : 0), 0), 0)
}
function moveCount(source: InvSlot, n?: number): number | null {
  return n === undefined ? source.count : Number.isSafeInteger(n) && n > 0 ? Math.min(n, source.count) : null
}
/** Write only to cloned destination slots; publish after the whole requested quantity fits. */
function stagedInsert(arrays: Slots[], source: InvSlot, count: number): Slots[] | null {
  if (capacity(arrays, source) < count) return null
  const stage = arrays.map(slots => slots.map(s => s ? cloneSlot(s) : null)), stack = stackSize(source)
  let left = count
  if (stack > 1) for (const slots of stage) for (const s of slots) {
    if (!s || !left || !stackMatches(s, source)) continue
    const n = Math.min(Math.max(0, stack - s.count), left); s.count += n; left -= n
  }
  for (const slots of stage) for (let i = 0; i < slots.length && left; i++) if (!slots[i]) {
    const n = Math.min(stack, left); slots[i] = { ...cloneSlot(source), count: n }; left -= n
  }
  return left ? null : stage
}
function publish(target: Slots, staged: Slots) { for (let i = 0; i < target.length; i++) target[i] = staged[i] }

/** Original whole-slot interface; a full destination fails without moving part of the stack. */
export function warehouseDeposit(eng: Engine, fac: WarehouseFaction, from: SlotRef): boolean {
  return warehouseDepositN(eng, fac, from)
}
export function warehouseWithdraw(eng: Engine, fac: WarehouseFaction, i: number): boolean {
  return warehouseWithdrawN(eng, fac, i)
}

/** Deposit the requested positive integer quantity (default: the whole slot), atomically. */
export function warehouseDepositN(eng: Engine, fac: WarehouseFaction, from: SlotRef, n?: number): boolean {
  if (from.w !== 'hotbar' && from.w !== 'backpack') { eng.msg('装备位物品要先卸下才能寄存。', 'system'); return false }
  if (!Number.isSafeInteger(from.i) || from.i < 0) return false
  const source = eng.slotGet(from), wh = eng.warehouses[fac]
  if (!validSlot(source) || !wh) return false
  if (ITEMS[source.type]?.keyItem) { eng.msg(`「${ITEMS[source.type].name}」是关键收藏物，不能寄存。`, 'system'); return false }
  const count = moveCount(source, n)
  if (count === null) return false
  const stage = stagedInsert([wh], source, count)
  if (!stage) { eng.msg(`${WAREHOUSE_FACTION_NAME[fac]} 阵营仓库已满（${WAREHOUSE_SIZE} 栏）。`, 'system'); return false }
  publish(wh, stage[0])
  eng.slotSet(from, count === source.count ? null : { ...cloneSlot(source), count: source.count - count })
  eng.syncPassives()
  eng.msg(`寄存了 ${itemName(source.type)} ×${count}（${WAREHOUSE_FACTION_NAME[fac]} 阵营仓库）`, 'system')
  return true
}

/** Withdraw into inventory without retagging berries or dropping gun/medical item state. */
export function warehouseWithdrawN(eng: Engine, fac: WarehouseFaction, i: number, n?: number): boolean {
  const wh = eng.warehouses[fac]
  if (!wh || !Number.isSafeInteger(i) || i < 0) return false
  const source = wh[i]
  if (!validSlot(source)) return false
  const count = moveCount(source, n)
  if (count === null) return false
  const p = eng.player, stage = stagedInsert([p.hotbar, p.backpack], source, count)
  if (!stage) { eng.msg('背包已满，取不出来。', 'system'); return false }
  publish(p.hotbar, stage[0]); publish(p.backpack, stage[1])
  wh[i] = count === source.count ? null : { ...cloneSlot(source), count: source.count - count }
  eng.syncPassives()
  eng.msg(`取回了 ${itemName(source.type)} ×${count}`, 'system')
  return true
}

/** Move as many items of this type as fit, keeping each slot's metadata intact. */
export function warehouseDepositAllOf(eng: Engine, fac: WarehouseFaction, type: string): number {
  const wh = eng.warehouses[fac]
  if (!wh) return 0
  let moved = 0
  for (const w of ['backpack', 'hotbar'] as const) eng.player[w].forEach((s, i) => {
    if (!validSlot(s) || s.type !== type) return
    const n = Math.min(s.count, capacity([wh], s))
    if (n > 0 && warehouseDepositN(eng, fac, { w, i }, n)) moved += n
  })
  return moved
}
export function warehouseWithdrawAllOf(eng: Engine, fac: WarehouseFaction, type: string): number {
  const wh = eng.warehouses[fac]
  if (!wh) return 0
  let moved = 0
  wh.forEach((s, i) => {
    if (!validSlot(s) || s.type !== type) return
    const n = Math.min(s.count, capacity([eng.player.hotbar, eng.player.backpack], s))
    if (n > 0 && warehouseWithdrawN(eng, fac, i, n)) moved += n
  })
  return moved
}

/** Merge compatible stacks, sort, then publish together. Never truncate overflowed legacy data. */
export function warehouseSort(eng: Engine, fac: WarehouseFaction): boolean {
  const wh = eng.warehouses[fac]
  if (!wh || wh.some(s => s && !validSlot(s))) return false
  const merged: Slots = new Array(wh.length).fill(null)
  for (const s of wh) {
    if (!s) continue
    const stage = stagedInsert([merged], s, s.count)
    if (!stage) { eng.msg('库内数量超出可整理范围，原库存已保留。', 'system'); return false }
    publish(merged, stage[0])
  }
  const sorted = merged.filter((s): s is InvSlot => !!s).sort((a, b) =>
    CAT_ORDER.indexOf(warehouseCat(a.type)) - CAT_ORDER.indexOf(warehouseCat(b.type)) ||
    (RARITY_ORDER[ITEMS[a.type]?.rarity ?? 'common'] ?? 3) - (RARITY_ORDER[ITEMS[b.type]?.rarity ?? 'common'] ?? 3) ||
    itemName(a.type).localeCompare(itemName(b.type), 'zh-CN') || (b.count - a.count))
  publish(wh, [...sorted, ...new Array(wh.length - sorted.length).fill(null)])
  eng.msg(`${WAREHOUSE_FACTION_NAME[fac]} 阵营仓库已整理。`, 'system')
  return true
}
