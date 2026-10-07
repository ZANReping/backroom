// Level 0「教学关卡」层级定义（v17：无限 chunk 生成；内部 id 仍为 0）
import type { LevelDef } from '../core/types'

export const L0: LevelDef = {
  id: 0,
  name: '教学关卡',
  flavor: '病态黄的墙纸，潮湿地毯，荧光灯持续嗡鸣。这里一望无际、没有实体——学会活下去，然后找到那面闪烁的墙壁。',
  lore: 'Level 0「Threshold」。无限延伸、由不规则黄室组成的办公后间空间：褪色墙纸、潮湿地毯与持续嗡鸣的荧光灯构成基础环境。稳定的窗式拱门与连续柱厅连接各区，致命深坑和静音熄灯区改变行进方式；红室先以预警出现，进入后，视野外的开口会被墙封闭，最终困于原区域内的回环通路。8×8 米的马尼拉房间及外环廊是安全会合点。实体未经官方确认——本层绝迹。——据 Backrooms Wikidot 整理',
  // 经典 Level 0：墙纸是褪色奶油黄，地毯偏灰褐，避免整层被橄榄黄覆盖。
  palette: { floor: '#a49a61', floorAlt: '#938953', wall: '#c4bd6c', wallTop: '#b7af82', accent: '#827a45', light: '#f3efd6', decal: '#91894f' },
  gen: 'rooms',
  size: 64, // 有限模式忽略；无限模式仅作兼容占位
  infinite: true, // v17：无边界无限 chunk 流式生成
  entities: [], // 官方设定：实体未经确认——本层实体绝迹（低理智幻影=幻觉，非实体）
  items: [
    { type: 'wallpaper', w: 14 },
    { type: 'glowstick', w: 12 },
  ],
  containerBias: 0.35,
  sd: 'Survival Difficulty: Class 1 · Safe / Secure / Unconfirmed Entities',
  itemCount: [10, 14], // 有限模式忽略；无限模式按 chunk 生成
  structures: ['lightgrid', 'wet', 'graffiti', 'crate', 'corpse', 'ladder'],
  exits: [
    // 主出口：闪烁的墙壁（墙上一片门形区域规律闪烁光芒），进入 → L1
    { kind: 'flickerdoor', name: '闪烁的墙壁', dest: 1, anim: 'bloom' },
  ],
  entrance: '天花板坠落',
  exitDesc: '出口：一面罕见的「闪烁的墙壁」——墙上一片门形区域规律地闪烁光芒，穿过去即达 Level 1。在无限迷宫中它以较大区域为保底稀有刷新；远处跟着电流声与气流走。马尼拉外环廊也保留一处可靠的闪烁墙出口。',
  lightDensity: 0.012,
  darkness: 0.42,
  lightSoft: 0.56, // 降低单灯刺眼热点，配合渲染器的邻近灯光漫反射补光获得更均匀的旧办公区照明
}
