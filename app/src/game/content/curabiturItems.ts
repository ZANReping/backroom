// 受眷鸟（Entity 37）衍生物品：受眷胶、受眷孢子、孢子驱蛾剂。
// 由 content/items.ts 的 ITEMS 展开接入（// [L8-curabitur]）。使用效果在 engine/curabiturAI.ts 的 curabiturUseItem。
import type { ItemDef } from './items'
import { CB_ITEM, CURABITUR_GEL, CURABITUR_SPORE, GAME_HOUR_S, SPORE_ROT_S } from '../engine/curabiturTuning'

const h = (s: number) => Math.round(s / GAME_HOUR_S)

export const CURABITUR_ITEMS: Record<string, ItemDef> = {
  [CB_ITEM.gel]: {
    type: CB_ITEM.gel, name: '受眷胶',
    desc: `从受眷鸟浮囊里取出的生物发光胶，装在旋盖玻璃罐里。拿在手上就是一盏黄绿色的灯（开封后约 ${h(CURABITUR_GEL.life)} 小时）；右键可以涂在快捷栏里的近战武器上（约 ${h(CURABITUR_GEL.coatLife)} 小时），没有武器时就放在脚下。光会把附近的雄性死亡飞蛾引过来。`,
    stack: 3, anomalous: true, rarity: 'rare', glyph: 'can', unique: 8,
  },
  [CB_ITEM.spore]: {
    type: CB_ITEM.spore, name: '受眷孢子',
    desc: `雄性受眷鸟从浮囊上抖落的发光孢子。放在地上约 ${CURABITUR_SPORE.rotHours} 小时（折算约 ${Math.round(SPORE_ROT_S / 60)} 分钟）会腐解成恶臭的孢子腐液；右键可以直接捣碎成驱蛾剂。`,
    stack: 6, anomalous: true, rarity: 'uncommon', glyph: 'marble', unique: 8,
  },
  [CB_ITEM.repellent]: {
    type: CB_ITEM.repellent, name: '孢子驱蛾剂',
    desc: `腐解的受眷孢子，闻起来像烂掉的杏仁。右键泼在脚下，形成一滩腐液，${CURABITUR_SPORE.puddleR}m 内的死亡飞蛾会绕开，约 ${h(CURABITUR_SPORE.puddleLife)} 小时后干掉。带在身上也能让飞蛾离你远一点（约 ${CURABITUR_SPORE.carryR}m）。`,
    stack: 3, anomalous: true, rarity: 'uncommon', glyph: 'bottle', unique: 8,
  },
}
