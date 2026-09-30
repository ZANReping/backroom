import { loadAvatar } from './avatar'
import { storage } from './storage'

/** 身份档案跟随本局存档；外观继续使用现有捏人配置。 */
export interface PlayerProfile {
  name: string
  gender: '男' | '女' | '其他' | '不透露' | null
  age: number | null
}

export function normalizeProfile(raw?: Partial<PlayerProfile> | null): PlayerProfile {
  return {
    name: typeof raw?.name === 'string' ? raw.name.trim().slice(0, 24) : '',
    gender: raw?.gender && ['男', '女', '其他', '不透露'].includes(raw.gender) ? raw.gender : null,
    age: typeof raw?.age === 'number' && Number.isInteger(raw.age) && raw.age >= 1 && raw.age <= 150 ? raw.age : null,
  }
}

export function freshProfile(): PlayerProfile {
  return normalizeProfile({
    name: storage.get('br_mp_name') ?? '',
    gender: storage.get('br_avatar') ? (loadAvatar().gender === 1 ? '女' : '男') : null,
  })
}
