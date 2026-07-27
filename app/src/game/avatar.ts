// 玩家形象（捏人）配置：持久化 br_avatar；身高等影响碰撞体积的参数不可编辑
import { storage } from './storage'

export interface AvatarCfg {
  skin: string // 肤色
  hair: number // 发型：0 光头 1 短发 2 寸头 3 背头
  hairColor: string
  top: string // 上衣
  pants: string // 裤子
}

export const SKIN_OPTIONS = ['#f0c8a8', '#c9a58a', '#a87f5c', '#7d5a3c', '#5a4030']
export const HAIR_NAMES = ['光头', '短发', '寸头', '背头']
export const HAIR_COLORS = ['#232326', '#4a3020', '#7a5a30', '#9a9a9e', '#8a3a2a']
export const TOP_OPTIONS = ['#3a3f46', '#5a4a3a', '#3a5a4a', '#4a3a5a', '#6a3a3a', '#8a8578']
export const PANTS_OPTIONS = ['#2a2d33', '#3a352e', '#2e3a4a', '#4a4a42']

export const DEFAULT_AVATAR: AvatarCfg = { skin: '#c9a58a', hair: 1, hairColor: '#232326', top: '#3a3f46', pants: '#2a2d33' }

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
