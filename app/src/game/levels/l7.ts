// Level 7「Thalassophobia / 深海恐惧」层级定义
// 设定依据：Wikidot 版结构（入口房间 + 四个深度带的无限海洋）为主；
// Fandom 版的骨粉浓雾与非标准重力朝向作为氛围/事件层吸收。
import type { LevelDef } from '../core/types'

export const L7: LevelDef = {
  id: 7,
  name: '深海恐惧',
  sd: 'Survival Difficulty: Class 4 · 实体 2 · 极难离开',
  flavor: '楼梯尽头是一间铺着地毯、亮着荧光灯的小房间——它侧着嵌在海洋的天花板里。站到门口，重力就会换成海的那一套，你会从门里直接掉进四米半以下的水面。',
  lore: 'Level 7「Thalassophobia」。由两个截然不同的空间组成。入口房间：从 Level 6 下来的楼梯底部，左墙一个书柜（内有若干来源不明的书）、一张小咖啡桌、一把椅子、一盏荧光吸顶灯，地面铺地毯并积着一层不深于水洼的水。这个房间采用与下方海洋不同的重力轴——它侧向嵌在海洋空间的天花板里，任何站到门前的东西重力都会被强制切换，直接坠落约 4.5 米到水面。海洋空间：无限延伸，上方是高悬的混凝土天花板；没有任何固定光源，却存在弥漫的、来源不明的昏暗自然光；水极冷但不会立即致命；水面上方的空气含有某种未知性质，使人能屏息约 30 分钟。四个深度带：Daylight Zone（照明最好也最荒芜）、Twilight Zone（水下约 1 公里，散落骨头与锈蚀金属，首次出现下颌异常增大、牙齿尖锐、腿部末端成鳍的类人骨架）、Midnight Zone（再往下约 3 公里，完全黑暗，大量类人骨架与结构「不可理解」的巨鱼骨架；发现合成纤维碎片，暗示海床是铺着地毯的）、The Abyss（7 公里以下，山丘状的焦油与岩石堆，持续冒泡）。⚠ Wikidot 明确建议携带绳索或梯子，否则掉进水里后无法爬回入口房间。——据 Backrooms Wikidot 整理。',
  palette: {
    floor: '#2b3b44', floorAlt: '#25333b', wall: '#4e5358', wallTop: '#5b6166',
    accent: '#8fb2bd', light: '#a9c6cf', decal: '#1b262c',
  },
  gen: 'ocean',
  size: 78,
  aquatic: true,
  sky: '#3f5a66',
  entryAnim: 'fall',
  containerBias: 0.6,
  entities: [
    { type: 'tiny', w: 16, min: 1, max: 2 },
    { type: 'thething', w: 6, min: 0, max: 1 },
    { type: 'deathmoth', w: 4, min: 0, max: 1 },
  ],
  items: [
    { type: 'rope', w: 12 },
    { type: 'divemask', w: 8 },
    { type: 'thingmeat', w: 8 },
    { type: 'oddbook', w: 10 },
  ],
  itemCount: [9, 13],
  structures: ['bookcase', 'barrel', 'rockisle', 'bonepile', 'fishbones', 'seatarpit', 'corpse', 'crate'],
  exits: [
    { kind: 'seacave', name: '海山中的水下洞穴', dest: 8, anim: 'sink', cutIn: 'crawl' },
    { kind: 'pipering', name: '环形管道石柱中的木门', dest: 9, anim: 'iris', req: { rope: true }, reqText: '门在水下 150 米，你需要一卷绳索才能下去再上来' },
    { kind: 'abyss', name: '深渊（在此失去意识）', dest: 'random', anim: 'sink' },
  ],
  entrance: '从 Level 6 下来的楼梯 · 入口房间的门口（重力侧置）',
  exitDesc: '出口：入口正下方一座高耸海山中的水下洞穴（Midnight Zone 边界 → Level 8）；入口以西 150 米、水下 150 米处，一圈由巨大水下管道与石柱构成的环形结构里的一扇木门（→ Level 9，需绳索）；在 Abyss 中失去意识（→ Level 83，官方强烈不建议）。',
  lightDensity: 0.004,
  darkness: 0.72,
}
