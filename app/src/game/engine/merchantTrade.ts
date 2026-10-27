// 商人交易（独立商店界面 ShopOverlay 用）：所有团体通用的「买 / 换 / 兑换 / 卖给商人」。
// B.N.T.G. 系（压印币）仍走 bntgBank（信用点 + 压印币结账、记账）；其余团体按 def.currency 实物货币结算。
// 回收价：每种物品的「基准价值」以杏仁水为单位，取全部商人里最便宜的那份售价（压印币 ÷2、天鹰币 ÷1），
// 商人回收 = 基准 × 本店汇率 × 系数（本店在卖的货 0.5 / 其他 0.3，声望优惠 +0.1）——
// 最高 0.6 倍（便宜货最少按 1 收），并封顶在任何商人打完折（≥0.76 倍）的售价以内，所以买进再卖出永远不赚钱。
// 没有任何商人卖的东西按稀有度给一个保守估价；货币、钥匙、任务物品不收。
import type { Engine } from '../engine'
import { creepStage } from './creeperAI'
import type { NpcDef } from '../content/npcs'
import { NPCS } from '../content/npcs'
import { ITEMS, itemName } from '../content/items'
import { FACTIONS, REP_TIER } from '../content/factions'
import { TRADERS_MARKET_PEOPLE, MARKET_RESERVED_PEOPLE } from '../content/tradersMarket'
import { TRADERS_SHOP_PEOPLE } from '../content/tradersShops'
import { L11_PEOPLE } from '../content/l11People'
import { addItem } from './inventory'
import { MELEE, isMelee } from '../content/melee'
import { audio } from '../core/audio'
import { bntgBuy, bntgBarter, bntgExchange, bntgCommit, stageInventory, removeStaged, type BntgPaymentMode, type BankResult } from './bntgBank'

export type MerchantCoin = 'presses' | 'eaglecoin' | 'almond'
/** 1 瓶杏仁水值几个该货币 */
export const COIN_RATE: Record<MerchantCoin, number> = { presses: 2, eaglecoin: 1, almond: 1 }
export const COIN_NAME: Record<MerchantCoin, string> = { presses: '压印币', eaglecoin: '天鹰币', almond: '杏仁水' }
/** 不收购：货币本身（兑换另有入口）、钥匙 / 门卡、任务与剧情物品、开局背包 */
export const NO_SELL = new Set(['presses', 'eaglecoin', 'almond', 'parcel', 'welcomenote', 'endnote', 'phone', 'foyerpack', 'keycard', 'skeleton', 'housekey', 'carkey', 'megfolder', 'stonekazoo'])
const RARITY_VALUE: Record<string, number> = { common: 0.5, uncommon: 1.5, rare: 4, epic: 10 }
export const SELL_K_OWN = 0.5, SELL_K_OTHER = 0.3, SELL_K_REP = 0.1

export const merchantCoin = (def: NpcDef): MerchantCoin => def.currency === 'presses' ? 'presses' : def.currency === 'almond' ? 'almond' : 'eaglecoin'
export const isMerchant = (def: NpcDef | undefined | null): boolean => !!def && (!!def.trade?.length || !!def.barter?.length)

let VALUES: Map<string, number> | null = null
function allMerchantDefs(): NpcDef[] {
  return [...Object.values(NPCS), ...Object.values(TRADERS_MARKET_PEOPLE), ...Object.values(MARKET_RESERVED_PEOPLE), ...Object.values(TRADERS_SHOP_PEOPLE), ...L11_PEOPLE].filter(isMerchant)
}
/** 基准价值表（杏仁水）：全部商人里最便宜的一份 */
export function merchantValues(): Map<string, number> {
  if (VALUES) return VALUES
  const v = new Map<string, number>()
  const put = (t: string, x: number) => { if (x > 0 && Number.isFinite(x)) v.set(t, Math.min(v.get(t) ?? Infinity, x)) }
  for (const d of allMerchantDefs()) {
    const r = COIN_RATE[merchantCoin(d)]
    for (const t of d.trade ?? []) put(t.item, t.price / Math.max(1, t.qty ?? 1) / r)
    for (const b of d.barter ?? []) if (b.give in COIN_RATE && !b.give2) put(b.get, b.giveN / COIN_RATE[b.give as MerchantCoin] / Math.max(1, b.getN))
  }
  return (VALUES = v)
}
export function itemBaseValue(type: string): number | null {
  if (NO_SELL.has(type) || !ITEMS[type] || ITEMS[type].keyItem) return null
  return merchantValues().get(type) ?? RARITY_VALUE[ITEMS[type].rarity ?? 'common']
}
const dealsIn = (def: NpcDef, type: string) => !!def.trade?.some((t) => t.item === type) || !!def.barter?.some((b) => b.get === type || b.give === type || b.give2 === type)
const repOf = (eng: Engine, def: NpcDef) => eng.rep[def.faction ?? 'meg'] ?? 0
const hasRep = (def: NpcDef) => !!FACTIONS[def.faction ?? 'meg']?.hasRep
export const repDiscount = (eng: Engine, def: NpcDef) => hasRep(def) && repOf(eng, def) >= REP_TIER.discount
export const repRefuses = (eng: Engine, def: NpcDef) => hasRep(def) && repOf(eng, def) <= REP_TIER.noTrade

/** 买价（声望八折、银舌头 95 折），与对话窗旧逻辑 / bntgPrice 一致 */
export function merchantBuyPrice(eng: Engine, def: NpcDef, price: number): number {
  return Math.max(1, Math.floor((repDiscount(eng, def) ? price * 0.8 : price) * (eng.silverTongueT > 0 ? 0.95 : 1)))
}
/** 一件（一个计数单位）的回收价；null = 不收 */
export function sellUnitPrice(eng: Engine, def: NpcDef, slot: { type: string; dur?: number }): number | null {
  const base = itemBaseValue(slot.type)
  if (base == null) return null
  const it = ITEMS[slot.type]
  // 医疗箱等按剩余次数折价；近战武器按耐久折价（残件按一成）
  const melee = isMelee(slot.type) ? MELEE[slot.type] : null
  const wear = slot.dur == null ? 1 : it.charges ? Math.max(0, Math.min(1, slot.dur / it.charges)) : melee ? Math.max(0.1, Math.min(1, slot.dur / melee.maxDur)) : 1
  const k = (dealsIn(def, slot.type) ? SELL_K_OWN : SELL_K_OTHER) + (repDiscount(eng, def) ? SELL_K_REP : 0)
  // 便宜货（不足 1 但 ≥0.5）按 1 收；再封顶在「最低可能售价」（基准 × 0.76）以内——买进卖出永远不赚
  const v = base * COIN_RATE[merchantCoin(def)], raw = v * k * wear
  const p = Math.min(raw >= 1 ? Math.floor(raw) : raw >= 0.5 ? 1 : 0, Math.floor(v * 0.76 + 1e-9))
  return p >= 1 ? p : null
}

/** 能跟这位商人交易吗（活着、不敌对、就在身边、同层、声望没跌到拒绝交易） */
export function merchantAt(eng: Engine, id: string): NpcDef | null {
  const n = eng.npcs.find((n) => n.id === id && !n.dead && !n.hostile)
  if (!n || creepStage(eng.creepRun)>=4 || !isMerchant(n.def) || eng.over || eng.player.hp <= 0 || eng.transition) return null
  if (Math.hypot(n.x - eng.player.x, n.y - eng.player.y) > 3.2 || (n.floor ?? 0) !== (eng.player.floor ?? 0)) return null
  if (repRefuses(eng, n.def)) return null
  return n.def
}

const fail = (message: string): BankResult => ({ ok: false, message })
function commitPlain(eng: Engine, staged: Engine, detail: string): BankResult {
  eng.player.hotbar = staged.player.hotbar; eng.player.backpack = staged.player.backpack; eng.warpBerryLevel = staged.warpBerryLevel
  eng.syncPassives(); eng.persist(); audio.pickup()
  return { ok: true, message: detail }
}

export function merchantBuy(eng: Engine, id: string, item: string, mode: BntgPaymentMode = 'auto'): BankResult {
  const def = merchantAt(eng, id)
  if (!def) return fail('现在没法跟这位商人交易。')
  const coin = merchantCoin(def)
  if (coin === 'presses' && def.faction === 'bntg') return bntgBuy(eng, id, item, mode)
  const stock = def.trade?.find((t) => t.item === item)
  if (!stock || !ITEMS[item]) return fail('这件货已经不卖了。')
  const price = merchantBuyPrice(eng, def, stock.price), staged = stageInventory(eng)
  if (!removeStaged(staged, coin, price)) return fail(`${COIN_NAME[coin]}不够。`)
  const qty = Math.max(1, stock.qty ?? 1)
  for (let i = 0; i < qty; i++) if (!addItem(staged, item)) return fail('背包没有空位；这笔没成交。')
  return commitPlain(eng, staged, `-${price} ${COIN_NAME[coin]} → ${itemName(item)}${qty > 1 ? ' ×' + qty : ''}`)
}

export function merchantBarter(eng: Engine, id: string, index: number, mode: BntgPaymentMode = 'auto'): BankResult {
  const def = merchantAt(eng, id)
  if (!def) return fail('现在没法跟这位商人交易。')
  if (def.faction === 'bntg') return bntgBarter(eng, id, index, mode)
  const b = Number.isSafeInteger(index) && index >= 0 ? def.barter?.[index] : undefined
  if (!b) return fail('这笔换物已经不做了。')
  const staged = stageInventory(eng)
  if (!removeStaged(staged, b.give, b.giveN)) return fail(`${itemName(b.give)}不够。`)
  if (b.give2 && !removeStaged(staged, b.give2, b.give2N ?? 1)) return fail(`${itemName(b.give2)}不够。`)
  for (let i = 0; i < b.getN; i++) if (!addItem(staged, b.get)) return fail('背包没有空位；这笔没成交。')
  return commitPlain(eng, staged, `${itemName(b.give)} ×${b.giveN}${b.give2 ? ` + ${itemName(b.give2)} ×${b.give2N ?? 1}` : ''} → ${itemName(b.get)} ×${b.getN}`)
}

/** 杏仁水 ↔ 本店货币（杏仁水计价的店没有兑换） */
export function merchantExchange(eng: Engine, id: string, dir: 'buyAlmond' | 'sellAlmond', mode: BntgPaymentMode = 'auto'): BankResult {
  const def = merchantAt(eng, id)
  if (!def) return fail('现在没法跟这位商人交易。')
  const coin = merchantCoin(def)
  if (coin === 'almond' || !def.trade?.length) return fail('这里不办理兑换。')
  if (def.faction === 'bntg' && coin === 'presses') return bntgExchange(eng, id, dir, mode)
  const r = COIN_RATE[coin], staged = stageInventory(eng)
  if (dir === 'sellAlmond') {
    if (!removeStaged(staged, 'almond', 1)) return fail('没有杏仁水。')
    for (let i = 0; i < r; i++) if (!addItem(staged, coin)) return fail('背包没有空位。')
    return commitPlain(eng, staged, `杏仁水 ×1 → ${COIN_NAME[coin]} ×${r}`)
  }
  if (!removeStaged(staged, coin, r)) return fail(`${COIN_NAME[coin]}不够。`)
  if (!addItem(staged, 'almond')) return fail('背包没有空位。')
  return commitPlain(eng, staged, `${COIN_NAME[coin]} ×${r} → 杏仁水 ×1`)
}

/** 卖给商人：背包 / 快捷栏的某一格，卖 n 个。B.N.T.G. 可选直接入账信用点（mode='credits'） */
export function merchantSell(eng: Engine, id: string, where: 'hotbar' | 'backpack', i: number, n: number, mode: BntgPaymentMode = 'auto'): BankResult {
  const def = merchantAt(eng, id)
  if (!def) return fail('现在没法跟这位商人交易。')
  const src = eng.player[where]?.[i]
  if (!src || !Number.isSafeInteger(n) || n < 1 || n > src.count) return fail('没有这件东西。')
  const unit = sellUnitPrice(eng, def, src)
  if (unit == null) return fail(`${def.name}不收${itemName(src.type)}。`)
  const total = unit * n, coin = merchantCoin(def), staged = stageInventory(eng)
  const s = staged.player[where][i]!
  s.count -= n; if (s.count <= 0) staged.player[where][i] = null
  const what = `${itemName(src.type)}${n > 1 ? ' ×' + n : ''}`
  if (def.faction === 'bntg' && coin === 'presses') {
    if (mode === 'credits') return bntgCommit(eng, staged, 'sale', total, 0, `卖出 ${what}：入账 ${total} 信用点。`)
    for (let k = 0; k < total; k++) if (!addItem(staged, 'presses')) return fail('背包放不下这么多压印币；可以改成入账信用点。')
    return bntgCommit(eng, staged, 'sale', 0, total, `卖出 ${what}：收到 ${total} 枚压印币。`)
  }
  for (let k = 0; k < total; k++) if (!addItem(staged, coin)) return fail(`背包放不下这么多${COIN_NAME[coin]}。`)
  return commitPlain(eng, staged, `卖出 ${what} → ${COIN_NAME[coin]} ×${total}`)
}
