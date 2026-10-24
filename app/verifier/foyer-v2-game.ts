import * as THREE from 'three'
import { FOYER_PROPS, FOYER_PICKUP_POS } from '../src/game/world/foyerLayout'
import { canOccupy, PLAYER_RADIUS } from '../src/game/core/player'
import { seatsFor } from '../src/game/world/seating'
import { pickSeat } from '../src/game/engine/seating'
import { scanInteract } from '../src/game/engine/interact'
export function mountV2(api:any){
 const e=api.engine,r=()=>api.renderer(),assert=(v:unknown,s:string)=>{if(!v)throw Error(s)}
 const move=(x:number,y:number,yaw=0,pitch=0)=>{Object.assign(e.player,{x,y,z:0,vz:0,crouching:false});Object.assign(api.look,{yaw,pitch,rayX:-Math.sin(yaw)*Math.cos(pitch),rayY:-Math.cos(yaw)*Math.cos(pitch),rayZ:Math.sin(pitch)})}
 return {
  state(){return{warm:r().foyerWarmStats,indoor:r().foyerIndoor,homeVisible:r().foyer?.group.visible,streetVisible:r().foyerStreet?.group.visible,npcs:e.npcs.filter((n:any)=>n.def.ambient).map((n:any)=>({id:n.id,x:n.x,y:n.y,route:!!n.def.route})),models:[...r().npcMeshes].map(([id,v]:any)=>({id,visible:v.grp.visible,position:v.grp.position.toArray()})),programs:r().three.info.programs.length,flags:{...e.player.prologue.flags}}},
  pickups(){const a:any[]=[];r().foyer.group.updateMatrixWorld(true);for(const id of ['backpack','water','snack']){const o=r().foyer.pickups.get(id),pos=o.getWorldPosition(new THREE.Vector3()),q=FOYER_PICKUP_POS[id as keyof typeof FOYER_PICKUP_POS];assert(pos.distanceTo(new THREE.Vector3(q.x,q.z,q.y))<.01,'pickup misplaced '+id);a.push({id,pos:pos.toArray(),box:new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).toArray()})}return a},
  seat(id:string){const s=e.map.structures.find((s:any)=>s.data?.pid===id);assert(s,'seat missing '+id);e.introT=0;for(const a of seatsFor(s,e.map,900))for(const d of [.65,.85,1.1])for(const off of [0,.65,-.65,Math.PI/2,-Math.PI/2]){const x=a.x+Math.sin(a.yaw+off)*d,y=a.y+Math.cos(a.yaw+off)*d;if(!canOccupy(e.map,x,y,PLAYER_RADIUS,{z:0}))continue;move(x,y,Math.atan2(-(a.x-x),-(a.y-y)),Math.atan2(a.z-1.55,d));if(!pickSeat(e,s))continue;scanInteract(e);if(e.interactTarget?.s===s&&e.interactTarget?.kind==='sit')return{id,hint:e.interactTarget.label}}throw Error('cannot aim seat '+id+' '+JSON.stringify(e.getInteract()))},
  sitting(){return{phase:e.seating?.phase??null,eye:api.look.eye,position:[e.player.x,e.player.y,e.player.z]}},
  doorway(){const d=FOYER_PROPS.find(p=>p.id==='doormat')!;move(5.5,14.5,0,0);return{id:d.id,pos:[e.player.x,e.player.y]}},
  propertyView(){move(10.4,12,-1.1,-.07)},
 }
}
