import {canOccupy} from '../src/game/core/player'
import {look} from '../src/game/renderer/shared'
import type {Engine} from '../src/game/engine'
export async function runL2Runtime(eng:Engine) {
 let checks=0;const assert=(condition:unknown,message:string)=>{if(!condition)throw new Error(message);checks++}
 const m=eng.map,p=eng.player
 const racks=m.structures.filter(s=>s.data?.l2Service)
 let passages=0
 for(const s of racks.slice(0,150)) {
  assert(!canOccupy(m,s.x+s.w/2,s.y+.5,.32),'rack must physically block the player')
  const x=s.data?.side===1?s.x-.4:s.x+s.w+.4
  if(canOccupy(m,x,s.y+.5,.32))passages++
 }
 assert(passages>20,'body-width route alongside equipment remains open')
 const settle=()=>new Promise<void>(resolve=>{let n=25;function tick(){if(--n<0)resolve();else requestAnimationFrame(tick)}tick()})
 const testDoor=async(sealed:boolean)=>{
  for(const d of m.structures.filter(s=>s.kind==='hoteldoor'&&!!s.data?.sealed===sealed&&!s.data?.open&&(!s.data?.locked||sealed))) {
   for(const dx of [-1.05,1.05]) {
    const x=d.x+.5+dx,y=d.y+.5
    if(!canOccupy(m,x,y,.32))continue
    p.x=x;p.y=y;p.z=0;p.flashlight=false
    look.yaw=Math.atan2(-(d.x+.5-x),-(d.y+.5-y));look.pitch=-.12
    await settle();eng.scanInteract()
    if(eng.interactTarget?.s!==d)continue
    assert(eng.interactTarget?.kind==='hoteldoor','new door still targeted by real camera ray')
    eng.doInteract();await settle()
    if(sealed)assert(!d.data?.open&&d.solid,'sealed door remains locked through real interaction')
    else {assert(d.data?.open===1&&!d.solid,'unlocked door opens through real interaction');assert(canOccupy(m,d.x+.5,d.y+.5,.28),'open doorway can be walked through')}
    return true
   }
  }
  return false
 }
 assert(await testDoor(true),'a sealed door was exercised')
 assert(await testDoor(false),'an unlocked door was exercised')
 return {pass:true,checks,racks:racks.length,clearPassages:passages}
}
