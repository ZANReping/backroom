// [casino] Level 5.1「恐怖旅馆赌场盛大开幕」：内部 level id 119（不占 LEVELS 下标；同 117/118 口袋房间只经 levelDefOf 解析），displayId 5.1。
// 布局见 content/casinoLayout（64 × 44 m、挑高 7 m），生成 world/mapgenOutpost.genCasino，营业 / 进出 engine/casinoAI。
import type { LevelDef } from '../core/types'
import { CASINO_MAP } from '../content/casinoLayout'
export const LCASINO: LevelDef = {
  id: 119, // CASINO_LEVEL（engine/casinoAI）
  displayId: 5.1,
  name: '恐怖旅馆赌场盛大开幕',
  label: 'Level 5.1 · 赌场',
  flavor: '挂满灯泡的 TH 大门后面是一座不该在酒店平面图上的赌场：分区花地毯、成排的老虎机、品红绒面的牌桌、环形酒吧。所有人都在笑，用一种你听不懂的语言。',
  palette: { floor: '#3a1a12', floorAlt: '#2c140e', wall: '#2a1216', wallTop: '#1a0a0c', accent: '#d8a84a', light: '#ffcf96', decal: '#22100c' },
  gen: 'outpost', size: Math.max(CASINO_MAP.w, CASINO_MAP.h), entities: [], items: [], itemCount: [0, 0], structures: [],
  lightDensity: 0, fullMap: true, entryAnim: 'step',
  exits: [{ kind: 'unlockeddoor', name: 'TH 大门', dest: 'back', anim: 'bloom' }],
  entrance: 'Level 5 贝弗莉室墙上的 TH 跑马灯大门（营业 16 分钟 / 打烊 8 分钟）',
  exitDesc: '出口：只有那扇 TH 大门（返回 Level 5）。',
  darkness: 0.2, // v2：烘焙光照提亮（原 0.35）
  sd: 'Survival Difficulty: Class ？ · 庄家永远赢',
}
