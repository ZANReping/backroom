// World NPCs and portraits use the same fitted, skinned retro accessories.
import * as THREE from 'three'
import type {NpcDef} from '../content/npcs'
import {npcGearPlan} from './npcGearPlan'
import {NpcGearModels} from './npcGearModels'

export function applyNpcGear(rootOrParts:THREE.Object3D|Record<string,THREE.Object3D>,id:string,def?:NpcDef){
 let root:THREE.Object3D|undefined=(rootOrParts as THREE.Object3D).isObject3D?rootOrParts as THREE.Object3D:(rootOrParts as Record<string,THREE.Object3D>).head
 while(root&&!root.userData.retro)root=root.parent??undefined
 if(!root||root.userData.npcGear)return
 const plan=npcGearPlan(id,def);root.userData.npcGearPlan=plan;root.userData.npcGearBadge=def?.uniform?.badge
 const builder=new NpcGearModels(root);for(const spec of plan)builder.build(spec);builder.finish()
}
