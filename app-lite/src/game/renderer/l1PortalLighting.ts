import type * as THREE from 'three'
import type {Structure} from '../core/types'
import type {GameMap} from '../world/mapgen'

const transmission=new Map<string,number>()
const bindings=new Set<{seed:number;ids:readonly string[];value:Float32Array}>()
let currentMap:GameMap|undefined,revision=0
const key=(seed:number,id:string)=>`${seed}:${id}`
export function l1PortalRevision(){return revision}
export function l1PortalVisibility(seed:number,ids:readonly string[]|undefined,weights:readonly number[]|undefined){
 if(!ids||!weights)return 1
 let blocked=0;for(let i=0;i<ids.length;i++)blocked+=weights[i]*(1-(transmission.get(key(seed,ids[i]))??0))
 return Math.max(0,1-blocked)
}
/** Each chunk retains its own bounded door list. Other scene instances cannot
 * mutate or dispose its uniforms. Unloaded doors default to their closed state. */
export function bindL1Portals(seed:number,ids:readonly string[]){
 const binding={seed,ids,value:new Float32Array(8)};bindings.add(binding)
 for(let i=0;i<ids.length;i++)binding.value[i]=1-(transmission.get(key(seed,ids[i]))??0)
 return{uniform:{value:binding.value},dispose:()=>{bindings.delete(binding)}}
}
export function updateL1PortalLighting(m:GameMap,meshes:ReadonlyMap<Structure,THREE.Group>,active:boolean){
 if(!active){if(currentMap){currentMap=undefined;transmission.clear();revision++}return}
 let changed=false
 if(currentMap!==m){currentMap=m;transmission.clear();changed=true}
 const seed=m.inf?.seed??0
 for(const s of m.structures){
  if(!s.data?.l1PathDoor||typeof s.data.l1PortalId!=='string')continue
  const open=Number(meshes.get(s)?.userData.open??(s.data.open?1:0)),value=1-Math.cos(Math.min(Math.PI/2,Math.max(0,open)*1.85)),id=key(seed,s.data.l1PortalId)
  if(Math.abs((transmission.get(id)??-1)-value)>.002){transmission.set(id,value);changed=true}
 }
 if(!changed)return
 revision++
 for(const b of bindings)for(let i=0;i<b.ids.length;i++)b.value[i]=1-(transmission.get(key(b.seed,b.ids[i]))??0)
 // Streaming holds at most 25 chunks. Forget distant animation states after
 // their lighting owners are gone; saved door state is restored by gameplay.
 if(transmission.size>512){const used=new Set([...bindings].flatMap(b=>b.ids.map(id=>key(b.seed,id))));for(const id of transmission.keys())if(!used.has(id))transmission.delete(id)}
}
export function l1PortalLightingStats(){return{bindings:bindings.size,states:transmission.size,revision}}
