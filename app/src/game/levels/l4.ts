// Level 4「废弃办公室」层级定义（v54：无限 chunk 生成；无限化重制见 infiniteL4.ts）
import type { LevelDef } from '../core/types'

export const L4: LevelDef = {
  id: 4,
  name: '废弃办公室',
  flavor: '无限相连的废弃办公室：空旷大厅、隔间、柱网与小办公室围绕服务核心延伸。窗外是静止的灰蓝雨天，饮水机与杏仁水散布其间，实体罕见。',
  lore: 'Level 4「废弃办公室」（Abandoned Office）。空旷大厅、办公隔间、柱网与小办公室在同一栋无限延伸的建筑中相连，服务核心周围排列着走廊、储藏间和饮水机。窗外是没有可通行外部空间的灰蓝雨景，现代楼梯上下都回到原来的办公楼层。这里杏仁水丰富，实体踪迹极其罕见。出口稀少而隐蔽：嵌墙电梯可折返 Level 3；年久失修的古典楼梯下行至 Level 5；年久失修的活板门坠入 Level 6。——本项目 L4 v2 E2b 布局',
  palette: { floor: '#8e908b', floorAlt: '#8e908b', wall: '#e6e6dc', wallTop: '#d7d9d2', accent: '#7fb0c9', light: '#fff7e7', decal: '#4a443c' },
  gen: 'office',
  size: 70, // 有限模式忽略；无限模式仅作兼容占位
  infinite: true, // v54：无边界无限 chunk 流式生成（infiniteL4.ts）；有限 office 生成分支留作死代码（同 L2/L3 先例）
  entities: [
    // v54：实体几乎不生成——池里只有猎犬/钝人，生成器 ~1.5%/chunk 一只（官方仅确认的两种实体）
    { type: 'hound', w: 12, min: 0, max: 1 },
    { type: 'duller', w: 12, min: 0, max: 1 },
  ],
  items: [
    // wiki：杏仁水出现频率全后室最高 → 权重显著最高（40；v54b 再上调，对比 UNIVERSAL 杏仁水 18、其余层特色池均 ≤18）
    { type: 'almond', w: 40 },
    { type: 'coffee', w: 12 },
    { type: 'stapler', w: 8 },
    { type: 'keycard', w: 6 },
  ],
  containerBias: 0.5,
  sd: 'Survival Difficulty: Class 1 · 杏仁水全后室最富集 · 实体几乎绝迹',
  itemCount: [12, 16], // 有限模式忽略（无限由生成器按 chunk 投放）
  structures: ['cubicle', 'copier', 'server', 'vending', 'desk', 'crate', 'corpse', 'locker', 'fridge', 'safebox'],
  exits: [
    // v54 无限化出口链——电梯：regionHost 超区域保底 + 出生 chunk 保底，免费折返 Level 3（嵌墙壁龛同 L3）；
    // 古典楼梯：8×8 超区域小概率宿主 1 部，年久失修的深色木楼梯，通往 Level 5；现代循环楼梯是小房间区内部结构，不是出口；
    // 活板门：小房间 ~1.5%，年久失修的木框铁环盖板，坠入 Level 6
    { kind: 'elevatorshaft', name: '电梯', dest: 3, anim: 'shutter' },
    { kind: 'oldstairs', name: '年久失修的古典楼梯', dest: 5, anim: 'bloom' },
    { kind: 'trapdoor', name: '年久失修的活板门', dest: 6, anim: 'fall', fallDamage: 10 },
  ],
  entrance: '办公走廊尽头',
  exitDesc: '出口：电梯（→B3 回程，超区域保底嵌墙）；年久失修的古典楼梯（深色木扶手雕花栏杆，罕见，→B5）；年久失修的活板门（小房间极小概率，→B6）。',
  lightDensity: 0.008,
  darkness: 0.55,
  lightSoft: 1.3, // v54：无限化后灯网按区段布置 + 亮调调色板补偿（同 L1/L2 思路）
}
