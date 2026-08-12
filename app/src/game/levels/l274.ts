// Level 274「杰瑞的房间」（v45：独立层级编号 274，走据点独立 id 空间注册，不占 LEVELS 下标——
// 层级结构为手工小层级，gen 'outpost' 管线复用，见 mapgenOutpost.ts genJerryRoom；
// v47：视为层级而非据点——层级图鉴（codexCat '层级'）显示本卡并应用 jerry 团体主题色规则，
// 同时仍显示在据点图鉴（outposts.ts 短名「杰瑞的房间」）；两边各出现一次、无重复计数；
// 设定：wikidot Level 274——鹉主杰瑞（Entity 7）的居所，信众的圣地；
// 布局：前厅 + 教堂风巨大穹顶主间，杰瑞栖木居中立 perch；仅经信众引路进入，进入门槛 jerry 声望 ≥10）
import type { LevelDef } from '../core/types'

export const L274: LevelDef = {
  id: 274, // 独立层级编号（OUTPOST_LEVEL_DEFS 空间；玩家可见编号即 274）
  name: '杰瑞的房间',
  label: 'Level 274 · 杰瑞的房间',
  flavor: '蓝白色的圣辉自穹顶洒落。鹉主在栖木上看着你——信众说，这是荣幸。',
  lore: 'Level 274「杰瑞的房间」是 Entity 7「Jerry」（鹉主）的居所。前厅之外是简朴的廊道，主间是一座教堂般的巨大穹顶大厅，杰瑞栖息于大厅中央的栖木上。只有被信众认可为足够虔诚的流浪者（杰瑞的信众声望 ≥10）才会被引路进入。接触鹉主会带来「教化」：不受控的诵咏与越来越强的留驻意愿；教化完成的流浪者再也无法主动离开。——据 Backrooms Wikidot 整理',
  // 教堂圣辉：蓝白地面/墙面 + 信众主题色点缀 + 圣洁暖白光（配 l274_* 贴图：蓝白石墙/蓝灰石板/蓝色吊顶——
  // 贴图本身已带蓝乘色，墙面 palette 调亮防双重叠乘过暗，地面调深半档压出教堂石厅的沉稳）
  palette: { floor: '#9aa4d6', floorAlt: '#8e98cc', wall: '#d4d9f2', wallTop: '#e2e6fa', accent: '#4142a5', light: '#f0ecff', decal: '#8a90c8' },
  gen: 'outpost',
  size: 80,
  entities: [], // 无敌对实体（鹉主与侍立信众由生成器定点放置）
  items: [],
  itemCount: [0, 0],
  structures: [],
  exits: [
    { kind: 'unlockeddoor', name: '返回', dest: 'back', anim: 'bloom' },
  ],
  entrance: '信众引路（杰瑞的信众声望 ≥10）',
  lightDensity: 0,
  darkness: 0.05,
  fullMap: true,
  sd: 'Survival Difficulty: Class 宜居 · 安全 · 鹉主在上',
  entryAnim: 'step',
}
