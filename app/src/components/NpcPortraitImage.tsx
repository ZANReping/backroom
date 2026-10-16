import { useSyncExternalStore, type ImgHTMLAttributes } from 'react'
import type { AvatarCfg } from '@/game/core/avatar'
import type { NpcDef } from '@/game/content/npcs'
import { retroTextureRevision, subscribeRetroTextures } from '@/game/renderer/retroResources'
import { npcPortrait } from './npcPortrait'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  avatar: AvatarCfg; npcId?: string; npcDef?: NpcDef; size?: number; framing?: 'full' | 'identity'
}
export default function NpcPortraitImage({ avatar, npcId, npcDef, size = 96, framing = 'full', alt, ...props }: Props) {
  useSyncExternalStore(subscribeRetroTextures, retroTextureRevision, () => 0)
  return <img {...props} alt={alt} src={npcPortrait(avatar, npcId, npcDef, size, framing)} />
}
