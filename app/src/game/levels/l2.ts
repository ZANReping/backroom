// Level 2「管道走廊」层级定义（严格按设计文档 §3/§6）
import type { LevelDef } from '../types'

export const L2: LevelDef = {
  id: 2,
  name: '管道走廊',
  flavor: '灼热的蒸汽管在头顶嘶鸣。笑魇守在黑暗的转角，窃皮者伪装成补给。别碰红色的阀门。',
  lore: 'Level 2「Abandoned Utility Halls」。无限维修隧道网，走廊严格以 45° 角转折；墙面风化混凝土与棕黑砖块，高温蒸汽管区可达 60–100°C。确认实体：笑魇、猎犬、窃皮者、团块；Fandom 另有「生物管道」独占记录（管道蠕虫疑似其幼体）。补给极度匮乏，管道水含病菌。——据 Backrooms Wikidot/Fandom 整理',
  palette: { floor: '#2e2a26', floorAlt: '#28241f', wall: '#4a3f35', wallTop: '#3a3129', accent: '#a63a2e', light: '#cfc4b4', decal: '#242019' },
  gen: 'pipes',
  size: 70,
  entities: [
    { type: 'smiler', w: 14, min: 2, max: 3 },
    { type: 'hound', w: 10, min: 1, max: 2 },
    { type: 'skinstealer', w: 10, min: 1, max: 2 },
    { type: 'clump', w: 10, min: 1, max: 2 },
    // 「生物管道」幼体：伪装在管线中伏击（Fandom 独占记录）
    { type: 'pipeworm', w: 8, min: 1, max: 2 },
  ],
  items: [
    { type: 'wrench', w: 10 },
    { type: 'gloves', w: 10 },
  ],
  // wiki：机器不产物资，补给极度匮乏 → 掉落数为全层最低
  containerBias: 0.5,
  sd: 'Survival Difficulty: Class 3 · 高温蒸汽管 · 生物管道',
  itemCount: [7, 10],
  structures: ['pipes', 'valve', 'gauge', 'boiler', 'crate', 'corpse', 'ladder', 'toolbox', 'locker'],
  exits: [
    { kind: 'breakerdoor', name: '主电闸门', dest: 3, anim: 'bloom' },
    { kind: 'shaft', name: '排水竖井', dest: 3, anim: 'fall', fallDamage: 10 },
    { kind: 'backvent', name: '回流通风口', dest: 1, anim: 'iris' },
  ],
  entrance: '维修舱口',
  exitDesc: '出口：主电闸门（→B3）、排水竖井（坠落→B3，受伤）、回流通风口（→B1）。',
  lightDensity: 0.006,
  darkness: 0.75,
}
