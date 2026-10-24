// 滋水枪储罐液体表（批发市场 v2 起集中定义）。
// memoryjuice（记忆汁液，Object 11）与 laughrepellent（驱笑剂，Object 3，已失效）只是换了来源物品：
// 装入后效果完全等同清水（伤害、爆酸者洗眼、自饮），只有储罐颜色和提示文字不同。
export type SquirtLiquidId = 'water' | 'almond' | 'cashew' | 'liquidpain' | 'acid' | 'memoryjuice' | 'laughrepellent'
export const SQUIRT_LIQUID_NAME: Record<SquirtLiquidId, string> = {
  water: '清水', almond: '杏仁水', cashew: '腰果水', liquidpain: '液态痛苦', acid: '酸液', memoryjuice: '记忆汁液', laughrepellent: '驱笑剂',
}
/** 装入 1 瓶所消耗的背包物品（清水无需物品）。 */
export const SQUIRT_LIQUID_SRC: Record<SquirtLiquidId, string | null> = {
  water: null, almond: 'almond', cashew: 'cashew', liquidpain: 'liquidpain', acid: 'acidcallus', memoryjuice: 'memoryjuice', laughrepellent: 'laughrepellent',
}
/** 效果等同清水的液体。 */
export const squirtActsAsWater = (l: string): boolean => l === 'water' || l === 'memoryjuice' || l === 'laughrepellent'
