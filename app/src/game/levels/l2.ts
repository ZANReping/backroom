// Level 2「废弃公共带」层级定义（v41：无限 chunk 生成；原名「管道走廊」，设定对齐 wikidot/Fandom Level 2）
import type { LevelDef } from '../types'

export const L2: LevelDef = {
  id: 2,
  name: '废弃公共带',
  flavor: '数条平行的窄廊道伸向黑暗深处，墙上的门大多锁死。肮脏段锈迹斑斑，扭曲段管道横穿——蹲低，或者跳过去。消防出口的绿色灯牌是这里唯一可信的路标。',
  lore: 'Level 2「废弃公共带」（原称 Abandoned Utility Halls）。由数条狭窄的平行竖直廊道与周期性横向连廊构成的无限网络，廊道按区域呈现四种面貌：金属生锈、机器废弃的肮脏的廊道；灯多却昏暗、墙面积灰的晦暗的廊道；灯光明亮洁净、部分机器仍在运行的整洁的廊道；灯光错乱、大小管道横穿路面必须蹲伏或跨越的扭曲的廊道。廊道两侧常见成排的不同粗细的平行管道——有的贴墙挤占路面，有的整段取代了墙面，尽头一律拐弯没入天花板或地板。廊道墙壁上的门颜色材料各异，但绝大多数以闻所未闻的方式锁死；少数未上锁的门后藏着横向连廊、设备房、补给间、电脑房、卧室，或者一条通往 Level 4 的办公走廊。绿色灯牌的消防出口一部分折返 Level 1，另一部分下行 Level 3。确认实体：肢团（最常见）、猎犬、笑魇（黑暗区）、无面灵（仅卧室）、尸鼠（成群 2~3，与 Level 8 天顶种群同种）、管道蠕虫、悲尸；死亡飞蛾极稀有且通常不主动攻击。「大停电」事件后，窃皮者已从本层销声匿迹。——据 Backrooms Wikidot/Fandom 整理',
  palette: { floor: '#2e2a26', floorAlt: '#28241f', wall: '#4a3f35', wallTop: '#3a3129', accent: '#a63a2e', light: '#cfc4b4', decal: '#242019' },
  gen: 'pipes',
  size: 70, // 有限模式忽略；无限模式仅作兼容占位
  infinite: true, // v41：无边界无限 chunk 流式生成（infiniteL2.ts）
  entities: [
    // v41：L2 实体池——肢团最常见、猎犬较常见、尸鼠成群 2~3 翻找腐肉、悲尸小概率、死亡飞蛾极稀有（被动实例）。
    // 笑魇/管道蠕虫按变体黑暗度在生成器内追加；无面灵仅生成于卧室；窃皮者已移除（「大停电」后消失）
    { type: 'clump', w: 30, min: 0, max: 1 },
    { type: 'hound', w: 22, min: 0, max: 1 },
    { type: 'corpserat', w: 12, min: 0, max: 1 },
    { type: 'wretch', w: 6, min: 0, max: 1 },
    { type: 'deathmoth', w: 3, min: 0, max: 1 },
  ],
  items: [
    { type: 'wrench', w: 10 },
    { type: 'gloves', w: 10 },
  ],
  // wiki：机器不产物资，补给极度匮乏 → 掉落数为全层最低
  containerBias: 0.5,
  sd: 'Survival Difficulty: Class 3 · 狭窄廊道网 · 锁死的门',
  itemCount: [7, 10],
  structures: ['pipes', 'valve', 'gauge', 'boiler', 'generator', 'maingen', 'machinewall', 'hoteldoor', 'bigcomputer', 'crate', 'megcrate', 'binshelf', 'table', 'officechair', 'debrispile', 'scrap', 'windowtrap', 'corpse', 'toolbox', 'locker'],
  exits: [
    // 仅两类出口（v41：随机/其他出口全删）——
    // 消防出口（独特建模：绿色 EXIT 灯牌 + 金属防火门 + 门框）：替换一小部分未上锁的门，一些折返 L1、一些下行 L3；
    // 办公走廊尽头：罕见的未上锁的门后是一条办公椅密布的 L4 风走廊，尽头通往 Level 4
    { kind: 'fireexit', name: '消防出口', dest: 'back', anim: 'bloom' },
    { kind: 'fireexit', name: '消防出口', dest: 3, anim: 'bloom' },
    { kind: 'officedoor', name: '办公走廊尽头', dest: 4, anim: 'bloom' },
  ],
  entrance: '楼梯井',
  exitDesc: '出口：消防出口（绿色 EXIT 灯牌的金属防火门，替换一小部分未上锁的门——一些返回 Level 1，一些通往 Level 3）；罕见地，某扇未上锁的门后是一条带大量办公椅的办公走廊，尽头通往 Level 4。',
  lightDensity: 0.006,
  darkness: 0.75,
  lightSoft: 1.4, // v41：无限化后廊道灯按变体布置 + 深色调色板补偿（同 L1 思路）
}
