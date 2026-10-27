// 商店界面皮肤：每个团体一套独立风格（ShopOverlay.css 里 .shop--<id>）。
// 文案也按团体改：页签、按钮、价签、空状态、拒绝交易时的话。
import { TRADERS_SHOPS } from '@/game/content/tradersShops'
import { MARKET_DEPTS } from '@/game/content/tradersMarket'
import type { NpcDef } from '@/game/content/npcs'

export type ShopSkinId = 'bntg' | 'meg' | 'capital' | 'ariane' | 'tom' | 'homely' | 'originals' | 'generic'
export interface ShopSkin {
  id: ShopSkinId
  /** 页眉小字 */
  kicker: string
  /** 缺省店名（没有具体店名时） */
  title: string
  emblem: string
  buyTab: string; sellTab: string
  buyVerb: string; sellVerb: string; barterVerb: string
  /** 价格前缀（如「¤」「No.」） */
  priceMark: string
  motto: string
  refuse: string
  emptySell: string
}
export const SHOP_SKINS: Record<ShopSkinId, ShopSkin> = {
  bntg: { id: 'bntg', kicker: 'B.N.T.G. · 商户柜台', title: 'B.N.T.G. 商户柜台', emblem: 'BNTG', buyTab: '货架', sellTab: '回收', buyVerb: '结账', sellVerb: '回收入账', barterVerb: '换取', priceMark: '¤', motto: '繁荣缔造和平 · 每一笔交付，都有回执', refuse: '「信用受限。本柜台暂停为你办理业务。」', emptySell: '你身上没有本柜台回收的货品。' },
  meg: { id: 'meg', kicker: 'M.E.G. 军需处 · 物资领用单', title: '军需领用处', emblem: 'M.E.G.', buyTab: '领用', sellTab: '上缴', buyVerb: '核发', sellVerb: '上缴入库', barterVerb: '核发', priceMark: '', motto: '表格一式三份 · 盖章生效', refuse: '「你的领用资格已被冻结。去找主管说明情况。」', emptySell: '没有可以上缴入库的物资。' },
  capital: { id: 'capital', kicker: '首都共同体 · 天鹰币通用', title: '首都百货', emblem: '✶', buyTab: '橱窗', sellTab: '寄卖', buyVerb: '买下', sellVerb: '寄卖成交', barterVerb: '换取', priceMark: '', motto: '城市不眠 · 橱窗常亮', refuse: '「抱歉，本店不接待您。」', emptySell: '没有可以寄卖的东西。' },
  ariane: { id: 'ariane', kicker: '阿丽亚娜集团 · 医疗物资处', title: '处方药房', emblem: '✚', buyTab: '处方', sellTab: '捐赠回收', buyVerb: '取药', sellVerb: '回收', barterVerb: '凭处方取药', priceMark: '', motto: '以物易物 · 只收实物', refuse: '「诊室今日不对你开放。」', emptySell: '没有药房能回收的物品。' },
  tom: { id: 'tom', kicker: "Tom's Diner · 今日供应", title: '今日菜单', emblem: 'TOM', buyTab: '菜单', sellTab: '收食材', buyVerb: '点单', sellVerb: '卖给后厨', barterVerb: '换一份', priceMark: '', motto: '拿食材来，热菜马上出锅', refuse: '「厨房打烊了——至少对你是。」', emptySell: '后厨暂时不需要你身上的东西。' },
  homely: { id: 'homely', kicker: 'The Homely Hotel · 客房服务', title: '客房服务菜单', emblem: 'H', buyTab: '客房服务', sellTab: '礼宾回收', buyVerb: '送到房间', sellVerb: '交给礼宾', barterVerb: '兑换', priceMark: '', motto: '宾至如归 · 请勿打扰', refuse: '「很抱歉，前台无法为您服务。」', emptySell: '礼宾处不收你身上的东西。' },
  originals: { id: 'originals', kicker: '原住民 · 换东西的摊子', title: '换东西', emblem: '◎', buyTab: '摊上有的', sellTab: '我带来的', buyVerb: '换', sellVerb: '给他', barterVerb: '换', priceMark: '', motto: '不讲价，讲交情', refuse: '「走开。」', emptySell: '他对你带的东西没兴趣。' },
  generic: { id: 'generic', kicker: '流浪者的货摊', title: '货摊', emblem: '⌂', buyTab: '买', sellTab: '卖', buyVerb: '买下', sellVerb: '卖掉', barterVerb: '换', priceMark: '', motto: '后室里，一切都有价', refuse: '「不做你的生意。」', emptySell: '没有他收的东西。' },
}
export function skinOf(def: NpcDef): ShopSkin {
  const f = (def.faction ?? 'meg') as ShopSkinId
  return f && f in SHOP_SKINS ? SHOP_SKINS[f] : SHOP_SKINS.generic
}
/** 具体店名：商人之家北排店铺 / 批发市场档口；其余用皮肤缺省店名 */
export function shopTitle(def: NpcDef, skin: ShopSkin): string {
  const s = TRADERS_SHOPS.find((s) => s.vendor === def.id)
  if (s) return s.name
  const d = MARKET_DEPTS.find((d) => d.vendor === def.id)
  if (d) return `批发市场 · ${d.name}`
  return skin.title
}
