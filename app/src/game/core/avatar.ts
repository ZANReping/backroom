// 玩家形象（捏人）配置：持久化 br_avatar；身高等影响碰撞体积的参数不可编辑
// v34：性别 / 发型×8 / 上衣款式 / 裤子款式 / 表情；旧存档经浅合并自动补默认值
// v54b：发型×16 / 上衣×8 / 裤子×6；新增眼镜/胡须/鞋子（默认 0=无/便鞋，浅合并自动兼容旧档）
import { storage } from './storage'

export interface AvatarCfg {
  skin: string // 肤色
  gender: number // 体型：0 男（宽肩）1 女（窄肩宽胯）
  hair: number // 发型：0 光头 1 短发 2 寸头 3 背头 4 中长发 5 双马尾 6 齐刘海 7 乱发 8 丸子头 9 斜刘海 10 脏辫 11 长直发 12 短卷发 13 莫西干 14 双丸子 15 高马尾
  hairColor: string
  top: string // 上衣颜色
  topStyle: number // 上衣款式：0 T恤 1 衬衫 2 连帽衫 3 夹克 4 工装 5 背心 6 毛衣 7 风衣
  pants: string // 裤子颜色
  pantsStyle: number // 裤子款式：0 长裤 1 短裤 2 工装裤 3 牛仔裤 4 运动裤 5 阔腿裤
  face: number // 表情：0 平静 1 微笑 2 严肃 3 困倦
  glasses: number // 眼镜：0 无 1 圆框 2 方框 3 墨镜
  beard: number // 胡须：0 无 1 山羊胡 2 络腮胡
  shoes: number // 鞋子：0 便鞋 1 运动鞋 2 皮靴
}

export const SKIN_OPTIONS = ['#f0c8a8', '#c9a58a', '#a87f5c', '#7d5a3c', '#5a4030']
export const GENDER_NAMES = ['男', '女']
export const HAIR_NAMES = ['光头', '短发', '寸头', '背头', '中长发', '双马尾', '齐刘海', '乱发',
  '丸子头', '斜刘海', '脏辫', '长直发', '短卷发', '莫西干', '双丸子', '高马尾']
export const HAIR_COLORS = ['#232326', '#4a3020', '#7a5a30', '#9a9a9e', '#8a3a2a']
export const TOP_STYLE_NAMES = ['T恤', '衬衫', '连帽衫', '夹克', '工装', '背心', '毛衣', '风衣']
export const TOP_OPTIONS = ['#3a3f46', '#5a4a3a', '#3a5a4a', '#4a3a5a', '#6a3a3a', '#8a8578', '#2e4a5e', '#6e6a2e']
export const PANTS_STYLE_NAMES = ['长裤', '短裤', '工装裤', '牛仔裤', '运动裤', '阔腿裤']
export const PANTS_OPTIONS = ['#2a2d33', '#3a352e', '#2e3a4a', '#4a4a42', '#5c5244']
export const FACE_NAMES = ['平静', '微笑', '严肃', '困倦']
export const GLASSES_NAMES = ['无', '圆框', '方框', '墨镜']
export const BEARD_NAMES = ['无', '山羊胡', '络腮胡']
export const SHOE_NAMES = ['便鞋', '运动鞋', '皮靴']

export const DEFAULT_AVATAR: AvatarCfg = {
  skin: '#c9a58a', gender: 0, hair: 1, hairColor: '#232326',
  top: '#3a3f46', topStyle: 0, pants: '#2a2d33', pantsStyle: 0, face: 0,
  glasses: 0, beard: 0, shoes: 0,
}

let cache: AvatarCfg | null = null

export function loadAvatar(): AvatarCfg {
  if (cache) return cache
  try {
    cache = { ...DEFAULT_AVATAR, ...JSON.parse(storage.get('br_avatar') ?? '{}') } as AvatarCfg
  } catch {
    cache = { ...DEFAULT_AVATAR }
  }
  return cache
}

// 渲染层热路径用（免解析；saveAvatar 会同步缓存）
export function getAvatar(): AvatarCfg {
  return loadAvatar()
}

export function saveAvatar(c: AvatarCfg) {
  cache = { ...c }
  storage.set('br_avatar', JSON.stringify(cache))
}

// 随机形象（无面灵等 NPC 外观用）：全字段在选项池内随机（不光头、表情恒平静——反正没有脸；
// 眼镜/胡须属面部件会被无面灵摘除，小概率随机无妨）
export function randomAvatar(rand: () => number = Math.random): AvatarCfg {
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]
  return {
    skin: pick(SKIN_OPTIONS),
    gender: rand() < 0.5 ? 0 : 1,
    hair: 1 + Math.floor(rand() * (HAIR_NAMES.length - 1)),
    hairColor: pick(HAIR_COLORS),
    top: pick(TOP_OPTIONS),
    topStyle: Math.floor(rand() * TOP_STYLE_NAMES.length),
    pants: pick(PANTS_OPTIONS),
    pantsStyle: Math.floor(rand() * PANTS_STYLE_NAMES.length),
    face: 0,
    glasses: rand() < 0.12 ? 1 + Math.floor(rand() * (GLASSES_NAMES.length - 1)) : 0,
    beard: 0,
    shoes: Math.floor(rand() * SHOE_NAMES.length),
  }
}
