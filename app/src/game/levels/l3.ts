// Level 3「电站」层级定义（严格按设计文档 §3/§6；v51：无限化重制——不规则廊道网 + 铁栅栏 + 双照明变体）
import type { LevelDef } from '../core/types'

export const L3: LevelDef = {
  id: 3,
  name: '电站',
  flavor: '砖墙、积灰混凝土与噼啪电流。无限延伸的廊道被铁栅栏截断又接续。极度危险，但资源是全后室最丰富的——高智能实体也明白这一点。',
  lore: 'Level 3「Electrical Station」。老旧砖砌电站，无限延伸的不规则廊道两侧密布电缆与配电箱，部分廊道被铁栅栏封死——另一侧可见而不可达；生存难度 4，实体密度高且存在高智能独占敌对实体，但稀有材料与电气设备（保险丝/电池/门禁卡）刷新率全后室最高。M.E.G. Base Gemma 驻于巨大机房。——据 Backrooms Wikidot 整理',
  // 红黄烧结砖颜色图使用浅暖陶土乘色，保留红/赭黄差异；旧暖灰乘色会把新砖再次压回灰褐。
  palette: { floor: '#5e5c58', floorAlt: '#565450', wall: '#f0cfad', wallTop: '#b89068', accent: '#d9b13b', light: '#cfd6dd', decal: '#26241f' },
  gen: 'grid', // 保留：墙高 WALL_H.grid=4.2 / 电火花粒子 keyed on 'grid'（实际生成走 infinite chunk）
  infinite: true,
  size: 72, // 兼容占位（无限模式不使用）
  entities: [
    { type: 'arcwraith', w: 16, min: 2, max: 3 },
    { type: 'smiler', w: 12, min: 2, max: 4 },
    { type: 'clump', w: 10, min: 1, max: 3 },
    // v53：L3 高智能实体（wikidot Level 3 条目）——伏击猎犬 / 敌意无面灵（部分持石器）/
    // 伪装成流浪者的窃皮者 / 水豚形尸鼠（设陷阱）/ 集群死亡飞蛾 / 极其罕见的悲尸
    { type: 'hound', w: 8, min: 1, max: 2 },
    { type: 'faceling', w: 7, min: 1, max: 2 },
    { type: 'deathmoth', w: 6, min: 2, max: 4 },
    { type: 'skinstealer', w: 5, min: 1, max: 1 },
    { type: 'corpserat', w: 5, min: 1, max: 2 },
    { type: 'wretch', w: 1, min: 1, max: 1 }, // 极其罕见
  ],
  items: [
    // wiki：稀有材料与电气设备刷新率全后室最高（保险丝/电池/门禁卡）
    { type: 'suit', w: 8 },
    { type: 'fuse', w: 18 },
    { type: 'battery', w: 12 },
    { type: 'capacitor', w: 8 },
    { type: 'keycard', w: 3 },
  ],
  // 资源最丰富 → 掉落数为全层最高
  containerBias: 0.55,
  sd: 'Survival Difficulty: Class 3 · 电弧危险 · 输送黑色液体的管道',
  itemCount: [14, 18],
  structures: ['generator', 'cabinet', 'trench', 'graffiti', 'crate', 'vent', 'toolbox', 'safebox', 'locker', 'elecbox', 'cables', 'barfence', 'bargate', 'pipes', 'valve', 'boiler', 'debrispile', 'scrap', 'megcrate', 'statue', 'conveyor', 'angelstatue', 'fallencolumn', 'column', 'maingen', 'busbar', 'warningsign', 'worktable', 'factlamp', 'sphboiler', 'floordrain', 'turbinegen', 'switchboard', 'transformer', 'pressmachine', 'feedpump', 'manifold', 'piperack', 'cabletray'],
  exits: [
    // v51：电梯唯二出口——电梯井嵌墙，随机下行 L4/L5（保险丝机制保留；电梯双向联通：L4/L5 有免费回程梯）
    { kind: 'elevatorshaft', name: '电梯', dest: 4, anim: 'shutter', req: { fuses: 2 }, reqText: '需要 2 枚保险丝' },
    { kind: 'elevatorshaft', name: '电梯', dest: 5, anim: 'shutter', req: { fuses: 2 }, reqText: '需要 2 枚保险丝' },
  ],
  entrance: '主电闸门 / 竖井',
  exitDesc: '出口：电梯（需 2 枚保险丝→随机 B4/B5；L4/L5 侧有免费回程电梯）。',
  lightDensity: 0.007,
  darkness: 0.72,
}
