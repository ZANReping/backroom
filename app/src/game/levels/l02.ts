// Level 0.2「重塑的混乱」（The Remade Chaos）——Level 0 的子层级，由后室装修公司「重塑」Level 0 失败后分裂而成。
// 设定：https://backrooms-wiki-cn.wikidot.com/level-0-2 （作者 PandaShark71004，译者 JLhze；页面 _non-cc，贴图全部自制/CC0）。
// 独立 id 902（序章 900 之后），只经 levelDefOf 解析，不进 ALL_LEVEL_DEFS（图鉴/路线审计不列出）。
// 生成见 world/l02Layout.ts；渲染复用 Level 0 架构管线（theme='l02'）；入口见 engine/remodel.ts（施工许可）。
import type { LevelDef } from '../core/types'
import { L02_ID } from '../world/l02Layout'

export const L02: LevelDef = {
  id: L02_ID,
  name: '重塑的混乱',
  label: 'Level 0.2',
  displayId: 0.2, // HUD/进入卡显示「LEVEL 0.2」，而不是内部 id 902
  // 过场进入卡（Cutscene）：与其他层级同一套主题标题卡（levelTitleTheme 902 → 'remodel'），完整标题 + 副标题
  titleName: 'Level 0.2 · 重塑的混乱',
  titleSub: 'Level 0 的子层级 · 后室装修公司施工区 · 结构不稳定',
  flavor: '米白的隔墙，干燥的酒红地毯，冷白的灯盘一排排亮着。没有嗡鸣——只有空调的低风声。这里看起来像刚装修完，又像根本没装修完。',
  lore: 'Level 0.2「重塑的混乱」。后室装修公司试图把 Level 0 改造成一层整洁的办公空间，工程失败后这片区域从 Level 0 分裂出去：通高米白隔墙、深红棕防撞条、暗酒红短绒地毯、矿棉板吊顶与和 Level 0 一模一样的荧光灯盘。结构并不稳定。——据 Backrooms Wikidot（PandaShark71004 著，JLhze 译）整理',
  palette: { floor: '#6e2f2b', floorAlt: '#662a27', wall: '#e4e0cc', wallTop: '#c8c8c3', accent: '#5a2a20', light: '#f4f6f2', decal: '#8a8378' },
  gen: 'rooms',
  size: 64,
  infinite: true,
  entities: [],
  items: [
    { type: 'almond', w: 6 },
    { type: 'glowstick', w: 4 },
  ],
  containerBias: 0,
  sd: 'Survival Difficulty: Class 2 · 结构不稳定 · 无实体',
  itemCount: [0, 0],
  structures: [],
  exits: [
    // 返回 Level 0 的门（第五轮：按 64 m 门区自然生成，入口最近一扇 44 m 以外；出门回到 L0 的施工门旁）
    { kind: 'remodelreturn', name: '返回 Level 0 的门', dest: 0, anim: 'shutter' },
  ],
  entrance: '施工场所的门（Level 0，后室装修公司施工许可）',
  exitDesc: '出口：只有返回 Level 0 的门。门零星地嵌在隔墙里，离入口最近的一扇也要走上一段路。',
  lightDensity: 0.012,
  darkness: 0.2,
  lightSoft: 0.6,
}
