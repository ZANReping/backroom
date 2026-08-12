// M.E.G. Gamma 基地（据点层级：完全手工布局，见 mapgenOutpost.ts genGammaOutpost；
// 设定依据 wikidot Level 3 条目——Gamma 基地是 M.E.G. 在 Level 3 的主要根据地，
// 位于该层最大开阔区域，持续运作中）。
// v54：真三层单图——引擎多层机制升级为楼层带 0|1|2（bandOfZ/up2/upWall2，见 mapgen.ts），
// Gamma 基地是首个三层据点：1F 公共部 / 2F 住宅部 / 3F 行政部，两部 stampStairRun 坡道楼梯
// （1F→2F、2F→3F）上下，不再拆图互链。
// 没有专属贴图文件——v54 起有了：l106_*（PaintedPlaster017 浅色涂装粉刷墙 / Tiles006 办公地砖 /
// PaintedPlaster015 涂装粉刷吊顶，ambientCG CC0 全新下载，`scripts/gen-l106-textures.py` 可复现）；
// 去色归一后 palette 负责色调（奶油办公调，同 Alpha 先例；2F/3F 楼板顶面=floor 贴图、板底=ceil 贴图）。
import type { LevelDef } from '../core/types'

export const LGAMMA: LevelDef = {
  id: 106, // 据点独立 id 空间（100+）：Level 3 的子层级，不占 LEVELS 数字下标
  name: 'M.E.G. Gemma 基地',
  label: 'M.E.G. Gemma 基地',
  flavor: '电站深处最大的开阔区，灯带一层层亮起来——人声、饭香、无线电的静电噪声。三层楼，数百号人，这里是 Gemma 基地。',
  // 明亮办公风 palette（MEG 鹰徽黄点缀；按 l106_* 贴图效果微调——地砖带深色圆点胶粒，地板/墙面略提亮半档）
  palette: { floor: '#a09d93', floorAlt: '#96938a', wall: '#d2ccbd', wallTop: '#e0dacb', accent: '#c9a03a', light: '#fff2d8', decal: '#6a6258' },
  gen: 'outpost',
  size: 80,
  entities: [], // 据点无敌对实体（居民是 NPC，不是实体）
  items: [],
  itemCount: [0, 0],
  structures: [], // 一切结构由生成器手工布置（无随机物品/容器）
  exits: [
    { kind: 'unlockeddoor', name: '北部入口', dest: 'back', anim: 'bloom' }, // 返回 Level 3（outpostReturn）
  ],
  entrance: '定居点地标（Level 3）',
  lightDensity: 0, // 灯光全部手工布置
  darkness: 0.06, // 明亮的室内基地（同 Alpha）
  fullMap: true, // 进入即获得完整地图
  sd: 'Survival Difficulty: Class 宜居 · 安全 · M.E.G. 主要基地',
  entryAnim: 'step',
}
