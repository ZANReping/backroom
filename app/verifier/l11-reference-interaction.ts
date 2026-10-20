import { l11CityPlan } from '../src/game/world/l11Layout'
import { L11_REFERENCE_SEED } from '../src/game/world/l11ReferenceDistrict'
import { canOccupy } from '../src/game/core/player'
import { interactionLos3D,scanInteract,doInteract } from '../src/game/engine/interact'

/** A real generated locker, followed by the same target across its exterior
 * wall. Checks the mesh picker and the authoritative LOS independently. */
export async function verifyL11ReferenceInteraction(qa:any){
  const e=qa.eng,b=l11CityPlan(L11_REFERENCE_SEED,0,0).buildings.find(b=>b.id.endsWith(':reference:west-piers'))!
  const check=(v:unknown,message:string)=>{if(!v)throw Error(message)}
  qa.moveTo(b.ox+b.width-2.5,b.oy+1.45);e.player.z=b.base;e.player.floor=0;e.player.vz=0;e.input.mx=e.input.my=0
  const locker=e.map.structures.find((s:any)=>s.kind==='locker'&&s.data?.buildingId===b.id&&s.floor===0)
  check(locker,'Reference office locker missing')
  const aim=async()=>{
    const x=locker.x+locker.w/2,y=locker.y+locker.h/2,z=b.base+1.2
    qa.look.yaw=Math.atan2(e.player.x-x,e.player.y-y);qa.look.pitch=Math.atan2(z-e.player.z-1.55,Math.hypot(x-e.player.x,y-e.player.y));qa.look.roll=0
    await qa.warm();await new Promise(r=>setTimeout(r,100));e.player.facing=Math.atan2(y-e.player.y,x-e.player.x)
    return {x,y,z}
  }
  check(canOccupy(e.map,e.player.x,e.player.y,.32,{z:b.base,band:0}),'Locker approach obstructed')
  const target=await aim()
  check(qa.look.visualHit?.kind==='structure'&&qa.look.visualHit.structure===locker,'Crosshair missed generated locker')
  check(interactionLos3D(e,target.x,target.y,target.z,0,locker),'Visible locker rejected by LOS')
  scanInteract(e);check(e.interactTarget?.s===locker,'Visible locker not selected')
  doInteract(e);check(e.searching?.sid===locker.data.sid,'Visible locker search did not begin');e.searching=null
  const visible={sid:locker.data.sid,visualHit:true,searchStarted:true}
  qa.moveTo(b.ox+b.width-2.5,b.oy-.65);e.player.z=b.base;e.player.floor=0;e.player.vz=0
  const blocked=await aim()
  check(!interactionLos3D(e,blocked.x,blocked.y,blocked.z,0,locker),'Locker can be targeted through building wall')
  scanInteract(e);check(e.interactTarget?.s!==locker,'Wall failed to block locker interaction')
  return {ok:true,visible,wallBlocks:true}
}
