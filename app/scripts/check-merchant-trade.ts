// 商人交易（独立商店界面）验收：X 键入口、买 / 换 / 卖、回收价不可套利、原子性、石卡祖笛下架。
import assert from 'node:assert/strict'
import { NPCS } from '../src/game/content/npcs'
import { TRADERS_MARKET_PEOPLE, MARKET_RESERVED_PEOPLE, MARKET_PRICES } from '../src/game/content/tradersMarket'
import { TRADERS_SHOP_PEOPLE } from '../src/game/content/tradersShops'
import { L11_PEOPLE } from '../src/game/content/l11People'
import { ITEMS } from '../src/game/content/items'
import { REP_TIER } from '../src/game/content/factions'
import { countItem, addItem } from '../src/game/engine/inventory'
import { freshBntgBank } from '../src/game/engine/bntgBank'
import { audio } from '../src/game/core/audio'
import * as M from '../src/game/engine/merchantTrade'
import { specialAction } from '../src/game/engine/special'
import { freshFerrenRun, stepFerrenWorld } from '../src/game/engine/ferrenAI'
import { freshCreepRun } from '../src/game/engine/creeperAI'
import { BNTG_BALANCE_MAX, restoreBntgBank } from '../src/game/engine/bntgBank'
import { SHOP_SKINS, skinOf } from '../src/components/shop/shopSkins'
import type { Engine } from '../src/game/engine'
import type { NpcDef } from '../src/game/content/npcs'
audio.uiTick = () => {}; audio.pickup = () => {}
const checks: string[] = []
const ok = (c: unknown, m: string) => { assert(c, m); checks.push(m) }
const all: NpcDef[] = [...Object.values(NPCS), ...Object.values(TRADERS_MARKET_PEOPLE), ...Object.values(MARKET_RESERVED_PEOPLE), ...Object.values(TRADERS_SHOP_PEOPLE), ...L11_PEOPLE].filter(M.isMerchant)

// 1. 石卡祖笛下架
ok(!all.some((d) => d.trade?.some((t) => t.item === 'stonekazoo') || d.barter?.some((b) => b.get === 'stonekazoo')), '石卡祖笛不在任何商人的货单里')
ok(!('stonekazoo' in MARKET_PRICES), '批发市场价目表去掉了石卡祖笛')
ok(TRADERS_SHOP_PEOPLE.mkt_pinkney.lines.every((l) => !l.npc.includes('石笛') && !l.npc.includes('卡祖笛')), '平克尼的台词不再提石笛')

// 2. 回收价不可套利：任何商人以最高声望回收一件 < 任何商人以最大折扣卖出同一件（都换算成杏仁水）
const best = { rep: Object.fromEntries(['meg', 'bntg', 'ariane', 'tom', 'homely', 'originals', 'capital'].map((f) => [f, 100])), silverTongueT: 9 } as unknown as Engine
const worst = { rep: {}, silverTongueT: 0 } as unknown as Engine
let pairs = 0
for (const m of all) for (const t of m.trade ?? []) {
  const buyUnit = M.merchantBuyPrice(best, m, t.price) / Math.max(1, t.qty ?? 1) / M.COIN_RATE[M.merchantCoin(m)]
  for (const n of all) {
    const s = M.sellUnitPrice(best, n, { type: t.item })
    if (s == null) continue
    pairs++
    assert(s / M.COIN_RATE[M.merchantCoin(n)] <= buyUnit + 1e-9, `${m.id} 卖 ${t.item} 单价 ${buyUnit.toFixed(2)} ≤ ${n.id} 回收 ${s}`)
  }
}
ok(pairs > 500, `所有「A 店买进 → B 店卖出」组合都不赚钱（回收 ≤ 售价，${pairs} 组，最高声望 + 银舌头）`)
for (const t of M.NO_SELL) ok(all.every((n) => M.sellUnitPrice(best, n, { type: t }) == null), `不收 ${t}`)
const moore = TRADERS_MARKET_PEOPLE.mkt_moore
ok(M.sellUnitPrice(worst, moore, { type: 'flashlight' })! > M.sellUnitPrice(worst, TRADERS_MARKET_PEOPLE.mkt_webb, { type: 'flashlight' })!, '本店在卖的货回收价更高（0.5 对 0.3）')
ok(M.sellUnitPrice(worst, TRADERS_MARKET_PEOPLE.mkt_ramos, { type: 'traumakit', dur: 1 })! < M.sellUnitPrice(worst, TRADERS_MARKET_PEOPLE.mkt_ramos, { type: 'traumakit' })!, '医疗箱按剩余次数折价')
ok(M.sellUnitPrice(worst, TRADERS_SHOP_PEOPLE.mkt_blankenship, { type: 'axe', dur: 0 })! < M.sellUnitPrice(worst, TRADERS_SHOP_PEOPLE.mkt_blankenship, { type: 'axe' })!, '近战残件按一成折价')

// 3. 引擎流程（夹具）：买 / 卖 / 换 / 兑换、远离与声望拒绝、失败不改背包
function fixture(id: string, def: NpcDef) {
  const e = { player: { x: 0, y: -1, z: 0, floor: 0, hp: 100, level: 102, hotbar: new Array(7).fill(null), backpack: new Array(24).fill(null) }, bntgBank: freshBntgBank(), creepRun: freshCreepRun(), rep: {}, silverTongueT: 0, warpBerryLevel: null, msg() {}, npcs: [{ id, def, x: 0, y: 0, floor: 0 }], syncPassives() {}, persist() {}, countItem(t: string) { return countItem(this as unknown as Engine, t) } } as unknown as Engine
  return e
}
const st = (e: Engine) => JSON.stringify([e.player.hotbar, e.player.backpack, e.bntgBank])
{
  const e = fixture('mkt_moore', moore)
  for (let i = 0; i < 30; i++) addItem(e, 'presses')
  ok(M.merchantBuy(e, 'mkt_moore', 'flashlight').ok && e.countItem('flashlight') === 1 && e.countItem('presses') === 16, 'B.N.T.G. 购买（压印币）')
  const unit = M.sellUnitPrice(e, moore, { type: 'flashlight' })!
  const where = e.player.hotbar.findIndex((s) => s?.type === 'flashlight') >= 0 ? 'hotbar' : 'backpack'
  const i = e.player[where].findIndex((s) => s?.type === 'flashlight')
  ok(M.merchantSell(e, 'mkt_moore', where, i, 1).ok && e.countItem('flashlight') === 0 && e.countItem('presses') === 16 + unit, `卖回手电筒拿回 ${unit} 压印币（买价 14）`)
  addItem(e, 'battery'); addItem(e, 'battery'); addItem(e, 'battery')
  const bi = e.player.hotbar.findIndex((s) => s?.type === 'battery'), bw = bi >= 0 ? 'hotbar' : 'backpack', bj = bi >= 0 ? bi : e.player.backpack.findIndex((s) => s?.type === 'battery')
  const bal = e.bntgBank.balance
  ok(M.merchantSell(e, 'mkt_moore', bw, bj, 2, 'credits').ok && e.countItem('battery') === 1 && e.bntgBank.balance === bal + 2 * M.sellUnitPrice(e, moore, { type: 'battery' })!, 'B.N.T.G. 回收可直接入账信用点（按数量）')
  ok(e.bntgBank.history.at(-1)?.kind === 'sale', '回收记一笔「商户回收」账')
  const before = st(e)
  ok(!M.merchantSell(e, 'mkt_moore', bw, bj, 5).ok && st(e) === before, '数量超过持有：失败且背包不变')
  addItem(e, 'stonekazoo'); const ki = e.player.hotbar.findIndex((s) => s?.type === 'stonekazoo'), kw = ki >= 0 ? 'hotbar' : 'backpack', kj = ki >= 0 ? ki : e.player.backpack.findIndex((s) => s?.type === 'stonekazoo')
  const b2 = st(e); ok(!M.merchantSell(e, 'mkt_moore', kw, kj, 1).ok && st(e) === b2, '不收的东西：失败且背包不变')
  e.player.y = -6; const b3 = st(e); ok(!M.merchantBuy(e, 'mkt_moore', 'battery').ok && st(e) === b3, '离柜台太远：拒绝交易')
  e.player.y = -1; (e.rep as Record<string, number>).bntg = REP_TIER.noTrade; ok(M.merchantAt(e, 'mkt_moore') == null, '声望过低：拒绝交易')
}
{
  const petra = NPCS.petra, e = fixture('petra', petra)
  for (let i = 0; i < 8; i++) addItem(e, 'almond')
  const t = petra.trade![0], p = M.merchantBuyPrice(e, petra, t.price)
  ok(M.merchantBuy(e, 'petra', t.item).ok && e.countItem('almond') === 8 - p, 'M.E.G. 购买（杏仁水计价）')
  ok(!M.merchantExchange(e, 'petra', 'sellAlmond').ok, '杏仁水计价的店没有兑换')
}
{
  const tom = NPCS.tom, e = fixture('tom', tom), b = tom.barter![0]
  for (let i = 0; i < b.giveN; i++) addItem(e, b.give)
  if (b.give2) for (let i = 0; i < (b.give2N ?? 1); i++) addItem(e, b.give2)
  ok(M.merchantBarter(e, 'tom', 0).ok && e.countItem(b.get) === b.getN, 'Tom 餐馆以物易物')
  const e2 = fixture('tom', tom), b4 = st(e2); ok(!M.merchantBarter(e2, 'tom', 0).ok && st(e2) === b4, '食材不够：失败且背包不变')
}
{
  const q = L11_PEOPLE.find((d) => d.id === 'l11_quartermaster')!, e = fixture(q.id, q)
  addItem(e, 'almond'); ok(M.merchantExchange(e, q.id, 'sellAlmond').ok && e.countItem('eaglecoin') === 1, '天鹰币店：杏仁水兑换')
}

// 4. X 键入口：准心对着商人时特殊交互 = 「交易」，对着普通 NPC 没有
{
  const e = fixture('mkt_moore', moore) as unknown as Record<string, unknown>
  Object.assign(e, { map: { structures: [], entities: [] }, levelDef: { id: 102 }, over: false, interactTarget: { kind: 'npc', label: '', npc: (e.npcs as unknown[])[0] } })
  const a = specialAction(e as unknown as Engine)
  ok(a?.id === 'trade' && a.label === '交易', '对着商人：特殊交互键 = 交易')
  ;(e as { interactTarget: unknown }).interactTarget = { kind: 'npc', label: '', npc: { id: 'kui', def: NPCS.kui } }
  ok(specialAction(e as unknown as Engine)?.id !== 'trade', '对着不卖东西的 NPC：没有交易')
}

// Imported UI uses a shared special key: unrelated Ferren ticks must not eat merchant taps.
{
  const e = fixture('mkt_moore', moore)
  Object.assign(e, { map: { structures: [], entities: [] }, levelDef: {id:102}, ferrenRun: freshFerrenRun(), specialPressed: true, specialHeld: false })
  stepFerrenWorld(e, 1 / 60)
  ok(e.specialPressed, 'Ferren 未处理的点按保留给商人入口')
}
// Failed settlement must preserve all slots, wear values and account history.
{
  const d = NPCS.petra, e = fixture(d.id, d)
  e.player.hotbar = Array.from({length:7}, () => ({type:'flashlight',count:1}))
  e.player.backpack = Array.from({length:24}, () => ({type:'flashlight',count:1}))
  e.player.hotbar[0] = {type:'almond',count:60}
  const before=st(e)
  ok(!M.merchantBuy(e,d.id,d.trade![0].item).ok && st(e)===before,'非 BNTG 背包满时购买失败不扣货币')
}
{
  const d=TRADERS_SHOP_PEOPLE.shop_guns, fallback=Object.values(TRADERS_SHOP_PEOPLE).find(d=>d.trade?.some(t=>t.item==='trapdoor'))!
  const vendor=d??fallback, e=fixture(vendor.id,vendor)
  e.player.hotbar=Array.from({length:7},()=>({type:'flashlight',count:1}))
  e.player.backpack=Array.from({length:24},()=>({type:'flashlight',count:1}))
  e.player.hotbar[0]={type:'trapdoor',count:1}
  const before=st(e)
  ok(!M.merchantSell(e,vendor.id,'hotbar',0,1,'cash').ok&&st(e)===before,'现金放不下时出售失败且保留原物品')
  e.bntgBank.balance=BNTG_BALANCE_MAX
  const full=st(e)
  ok(!M.merchantSell(e,vendor.id,'hotbar',0,1,'credits').ok&&st(e)===full,'账户达到上限时回收失败且保留原物品')
  e.bntgBank.balance=0
  ok(M.merchantSell(e,vendor.id,'hotbar',0,1,'credits').ok,'背包满可通过信用点回收腾出物品格')
  ok(restoreBntgBank(e.bntgBank).history.at(-1)?.kind==='sale','v1 银行记录恢复时保留商户回收账单')
}

// 5. 皮肤：七个团体各一套，所有商人都有皮肤
const facs = new Set(all.map((d) => skinOf(d).id))
ok(['bntg', 'meg', 'capital', 'ariane', 'tom', 'homely', 'originals'].every((f) => f in SHOP_SKINS), '七个团体都有独立皮肤')
ok([...facs].every((f) => f !== 'generic'), `现有商人全部落在团体皮肤上（${[...facs].join(' / ')}）`)
console.log(checks.map((c) => '✔ ' + c).join('\n'))
console.log(`${checks.length}/${checks.length} checks passed`)
