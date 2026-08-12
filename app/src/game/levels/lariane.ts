// 希波克拉底 - 1（阿丽亚娜集团据点层级：大型医药研究所/生物实验室式手工布局，见 mapgenOutpost.ts genArianeOutpost；
// 设定依据 wikidot 阿丽亚娜集团 The Ariane Circle / 希波克拉底团队——外科医师与医学/生物学研究人员）
import type { LevelDef } from '../core/types'

export const LARIANE: LevelDef = {
  id: 103, // 据点独立 id 空间（100+）：Level 1 哥特段的子层级，不占 LEVELS 数字下标
  name: '希波克拉底 - 1',
  label: '希波克拉底 - 1',
  flavor: '消毒水气味与仪器的低鸣。阿丽亚娜集团的洁白研究所——异常生物学在这里被当作医学来对待。',
  // v38：医院走廊参考图改色——暖米墙面 + 蓝灰亮面地面 + 暖白灯光（palette 乘色即可，不重下贴图）
  palette: { floor: '#cfd6dd', floorAlt: '#c3ccd5', wall: '#e6ddcb', wallTop: '#ece4d4', accent: '#8676e2', light: '#fff2dc', decal: '#9a94c0' },
  gen: 'outpost',
  size: 80,
  entities: [], // 据点无敌对实体（居民是 NPC）
  items: [],
  itemCount: [0, 0],
  structures: [],
  exits: [
    { kind: 'unlockeddoor', name: '北部入口', dest: 'back', anim: 'bloom' },
    { kind: 'unlockeddoor', name: '东部入口', dest: 'back', anim: 'bloom' },
    { kind: 'unlockeddoor', name: '西部入口', dest: 'back', anim: 'bloom' },
  ],
  entrance: '定居点地标（哥特段）',
  lightDensity: 0,
  darkness: 0.08,
  fullMap: true,
  sd: 'Survival Difficulty: Class 宜居 · 安全 · 阿丽亚娜集团主要基地',
  entryAnim: 'step',
}
