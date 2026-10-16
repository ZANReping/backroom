// v68：档案肖像 / 3D 预览用的人物模型工厂（与游戏内 renderer 同一约定）：
// 玩家 = 通用复古形象（标准体型、第 0 张脸、表情）；NPC = 专属复古模型（4 个手工示例）或通用形象（种子挑脸），
// BRC 黑影无脸；配饰、制服徽章统一由 npcGear 沿人物绑定姿态建模，并共享人物骨骼。
import type * as THREE from 'three'
import type { AvatarCfg } from '../core/avatar'
import type { NpcDef } from '../content/npcs'
import type { EquipVisual } from './playerModel'
import { applyNpcGear } from './npcGear'
import { buildAvatarModel, buildRetroNamedNpc, npcSeed } from './retroAvatar'
import { npcGearPlan } from './npcGearPlan'

export function buildCharacterModel(cfg: AvatarCfg, o: { ev?: EquipVisual; npcId?: string; npcDef?: NpcDef; driven?: boolean } = {}): THREE.Group {
  const driven = o.driven ?? false
  if (o.npcId) {
    const named = buildRetroNamedNpc(o.npcId, { driven, fittedGear:true })
    const plan=npcGearPlan(o.npcId,o.npcDef)
    const brc = o.npcDef?.faction === 'brc'
    const m = named ?? buildAvatarModel(plan.some(p=>p.kind==='glasses')?{...cfg,glasses:0}:cfg, {
      seed:npcSeed(o.npcId),faceless:brc,driven,
      npcGloves:o.npcId==='faust'?0x819a98:undefined,npcBoots:brc,
      npcRobe:o.npcId==='bluebird',
    })
    applyNpcGear(m,o.npcId,o.npcDef)
    return m
  }
  return buildAvatarModel(cfg, { ev: o.ev, driven })
}
