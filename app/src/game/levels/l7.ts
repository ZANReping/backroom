// Level 7「Thalassophobia / 深海恐惧」层级定义
// 设定依据：Wikidot 版结构（入口房间 + 四个深度带的无限海洋）为主；
// Fandom 版的骨粉浓雾与非标准重力朝向作为氛围/事件层吸收。
import type { LevelDef } from '../core/types'

export const L7: LevelDef = {
  id: 7,
  name: '深海恐惧',
  sd: 'Survival Difficulty: Class 4 · 实体 2 · 极难离开',
  flavor: '楼梯尽头是一间由锈蚀钢板拼成的金属舱室：里面亮着荧光吊灯，地上铺着旧地毯，浅水一直漫到门廊。舱门之外四米半以下就是海面。',
  lore: 'Level 7「Thalassophobia」。由两个截然不同的空间组成。入口房间：从 Level 6 下来的楼梯底部，本体是一间悬浮在海面上方的锈蚀金属舱室。左墙一个书柜（内有若干来源不明的书）、一张小咖啡桌、一把椅子、一盏荧光吊灯，金属地面上铺着旧地毯并积着一层不深于水洼的水。房间向南伸出一道门廊，尽头舱门外即海洋。舱室采用与下方海洋不同的重力轴——它侧向嵌在海洋空间的天花板里，任何站到舱门前的东西重力都会被强制切换，直接坠落约 4.5 米到水面。舱门边有系缆桩，可使用尼龙绳垂入海中，作为返回入口的唯一可靠途径。海洋空间：无限延伸，上方是高悬的混凝土天花板；没有任何固定光源，却存在弥漫的、来源不明的昏暗自然光；水极冷但不会立即致命；水面上方的空气含有某种未知性质，使人能屏息约 30 分钟。四个深度带：Daylight Zone（照明最好也最荒芜）、Twilight Zone（水下约 1 公里，散落骨头与锈蚀金属，首次出现下颌异常增大、牙齿尖锐、腿部末端成鳍的类人骨架）、Midnight Zone（再往下约 3 公里，完全黑暗，大量类人骨架与结构「不可理解」的巨鱼骨架；发现合成纤维碎片，暗示海床是铺着地毯的）、The Abyss（7 公里以下，山丘状的焦油与岩石堆，持续冒泡）。本作的海床拥有真实逐瓦片深度：从舱门落入海中后可以一路下潜，穿越有光带、微光带、午夜带，直到深逾两百米的深渊带。⚠ Wikidot 明确建议携带绳索或梯子，否则掉进水里后无法爬回入口房间。——据 Backrooms Wikidot 与 Fandom 整理。',
  palette: {
    floor: '#2b3b44', floorAlt: '#25333b', wall: '#4e5358', wallTop: '#5b6166',
    accent: '#8fb2bd', light: '#a9c6cf', decal: '#1b262c',
  },
  gen: 'ocean',
  size: 160,
  infinite: true,
  aquatic: true,
  sky: '#3f5a66',
  entryAnim: 'fall',
  containerBias: 0.6,
  entities: [
    // v58：小小移出自然生成池——唯一可对话个体固定在「小小的谎言」环形场
    // （ENTITY_EVENT_SPAWNS[7] 事件归属维持图鉴/DevPanel 的 L7 分类）
    { type: 'thething', w: 6, min: 0, max: 1 }, // v58：全窗口同时至多一只（instantiate 过滤）
  ],
  items: [
    { type: 'rope', w: 12 },
    { type: 'divemask', w: 8 },
    { type: 'thingmeat', w: 8 },
  ],
  itemCount: [9, 13],
  structures: ['bookcase', 'table', 'hanglight', 'vent', 'hoteldoor', 'ropeanchor', 'barrel', 'crate', 'rockisle', 'bonepile', 'fishbones', 'seatarpit', 'corpse', 'seapillar', 'seapipe', 'seadais'],
  exits: [
    { kind: 'l7cave', name: '午夜海床的岩洞洞口', dest: 8, anim: 'sink', cutIn: 'crawl' },
    { kind: 'notexit', name: '「不是出口」的门', dest: 4, anim: 'noclip' },
    // v58：环形石台中心镶嵌的木门（入口正西 150m 暮色带环形场）
    { kind: 'littledoor', name: '小小的谎言', dest: 9, anim: 'sink' },
  ],
  entrance: 'Level 6 深海锈蚀活板门 · 入口房间（固定出生点：锈蚀金属舱体 + 书橱/咖啡桌/椅/荧光吊灯，增长门廊尽头舱门外即深海）',
  exitDesc: '出口：午夜带海床上偶尔会露出一个岩洞洞口（→ Level 8）；极罕见地，深水中会漂着一扇标着「不是出口」的门（→ Level 4）；入口房间正西 150m 暮色带有一片由水下管道与石柱围成的环形场，中心石台上嵌着一扇木门「小小的谎言」（→ Level 9）。',
  lightDensity: 0.008,
  lightSoft: 1.18, // v57m：海面自然光更柔和、普遍
  darkness: 0.66,
}
