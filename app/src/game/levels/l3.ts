// Level 3「电站」层级定义（严格按设计文档 §3/§6）
import type { LevelDef } from '../types'

export const L3: LevelDef = {
  id: 3,
  name: '电站',
  flavor: '砖墙、积灰混凝土与噼啪电流。极度危险，但资源是全后室最丰富的——高智能实体也明白这一点。',
  lore: 'Level 3「Electrical Station」。老旧砖砌电站，墙上密布电缆与输送黑色液体的管道；生存难度 4，实体密度高且存在高智能独占敌对实体，但稀有材料与电气设备（保险丝/电池/门禁卡）刷新率全后室最高。M.E.G. Base Gamma 驻于巨大机房。——据 Backrooms Wikidot 整理',
  palette: { floor: '#26282c', floorAlt: '#212327', wall: '#3a3f46', wallTop: '#2e3238', accent: '#d9b13b', light: '#9adfff', decal: '#1c1e22' },
  gen: 'grid',
  size: 72,
  entities: [
    { type: 'arcwraith', w: 16, min: 2, max: 3 },
    { type: 'insulator', w: 14, min: 2, max: 3 },
    { type: 'smiler', w: 12, min: 2, max: 4 },
    { type: 'clump', w: 10, min: 1, max: 3 },
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
  structures: ['generator', 'cabinet', 'trench', 'graffiti', 'crate', 'vent', 'toolbox', 'safebox', 'locker'],
  exits: [
    { kind: 'elevatorshaft', name: '电梯井', dest: 4, anim: 'shutter', req: { fuses: 2 }, reqText: '需要 2 枚保险丝' },
    { kind: 'emergstairs', name: '应急楼梯', dest: 4, anim: 'bloom' },
    { kind: 'arcflash', name: '短路切出', dest: 'random', anim: 'glitch' },
  ],
  entrance: '主电闸门 / 竖井',
  exitDesc: '出口：电梯井（需 2 枚保险丝→B4）、应急楼梯（→B4）、短路切出（随机层级）。跟随标识可至更深层。',
  lightDensity: 0.007,
  darkness: 0.72,
}
