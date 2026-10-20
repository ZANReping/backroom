import { l11CityPlan,l11World } from '../src/game/world/l11Layout'
import { L11_REFERENCE_SEED } from '../src/game/world/l11ReferenceDistrict'
import { l11InteriorPlan } from '../src/game/world/l11Interiors'
import { l11RoomFixtures } from '../src/game/world/l11RoomFurnishing'
import { l11RetailFrame } from '../src/game/world/l11RetailLayout'
import { l11Shopfront } from '../src/game/world/l11Shopfront'
import { canOccupy } from '../src/game/core/player'
import { updateMovement } from '../src/game/engine/movement'

export async function verifyL11Retail(qa:any){
  const check=(v:unknown,m:string)=>{if(!v)throw Error(m)},e=qa.eng,r=qa.r
  const b=l11CityPlan(L11_REFERENCE_SEED,0,0).buildings.find(b=>b.id.endsWith(':reference:west-piers'))!,shop=l11Shopfront(b)!
  const f=l11InteriorPlan(b).floors[0],room=f.rooms.find(r=>r.kind==='shop'&&Math.abs(r.x-shop.x)<.01&&Math.abs(r.y-shop.y)<.01)!
  const frame=l11RetailFrame(b,room,f),fixtures=l11RoomFixtures(b).filter(p=>p.roomId===room.id),walks=[]
  const move=async(u:number,v:number)=>{const p=l11World(b,...frame.point(u,v));qa.moveTo(...p);e.player.z=b.base;e.player.floor=0;e.player.vz=0;e.input.mx=e.input.my=0;e.onStairs=false;await qa.warm();return p}
  const stops=[[frame.W/2,.9],[frame.W/2,frame.D-1.5],[frame.W*.25+.95,frame.D-1.5],[frame.W*.25+.95,2.6],[frame.W/2,2.6],[frame.W/2,.9]]
  await move(...stops[0] as [number,number])
  for(const [u,v] of stops.slice(1)){
    const target=l11World(b,...frame.point(u,v))
    for(let i=0;i<540;i++){
      const x=e.player.x+e.map.inf.ox,y=e.player.y+e.map.inf.oy,d=Math.hypot(target[0]-x,target[1]-y);if(d<.07)break
      e.input.mx=(target[0]-x)/d;e.input.my=(target[1]-y)/d;updateMovement(e,1/60,{dmg:1,drain:1},false)
    }
    e.input.mx=e.input.my=0
    const error=Math.hypot(target[0]-e.player.x-e.map.inf.ox,target[1]-e.player.y-e.map.inf.oy)
    check(error<.14,'Retail aisle blocked '+JSON.stringify({u,v,error}));walks.push({u,v,error})
  }
  const checkout=fixtures.find(p=>p.key==='retail_checkout')!,p=l11World(b,checkout.x,checkout.y)
  qa.moveTo(...p);e.player.z=b.base;e.player.vz=0;await qa.warm()
  check(!canOccupy(e.map,e.player.x,e.player.y,.32,{z:b.base,band:0}),'Checkout lost side collision')
  e.player.z=b.base+2
  for(let i=0;i<180;i++)updateMovement(e,1/60,{dmg:1,drain:1},false)
  const landed=e.player.z-b.base;check(landed>=.92&&landed<=1.27,'Checkout top does not support falling player: '+landed)
  await move(frame.W/2,-2)
  // Observe the real renderer light pool from outside, then behind the shop's
  // rear partition. Physical point shadows, not camera-only emissive walls.
  await new Promise(resolve=>setTimeout(resolve,800))
  const lit=()=>[...r.lightPowerScratch].filter(([l,p]:any)=>l.l11Room===room.id&&p>.01).map(([l,p]:any)=>({x:l.x,y:l.y,power:p}))
  const mode=r.lightMode,originalShadowCount=r.lightShadowCount,shadowBudgets=[]
  const inspectLights=(requested:number)=>{
    const lights=lit(),limit=mode==='realistic'?Math.min(2,requested):0
    check(limit===0?lights.length===0:lights.length>0&&lights.length<=limit,'Storefront illumination did not respect real shadow slots: '+JSON.stringify({mode,requested,lights}))
    const active=r.activeLightPool.flatMap((light:any,i:number)=>r.lightSortScratch[i]?.l11Room===room.id&&light.intensity>.01?[{slot:i,castShadow:light.castShadow,shadowIntensity:light.shadow.intensity,shadowMap:!!light.shadow.map}]:[])
    check(active.length===lights.length,'Shop light pool disagrees with fixture illumination')
    check(active.every((l:any)=>r.three.shadowMap.enabled&&l.castShadow&&l.shadowIntensity>0&&l.shadowMap),'An exterior shop light has no real shadow map')
    return {requested,limit,lights,active,shadowEnabled:r.three.shadowMap.enabled}
  }
  const outside=inspectLights(originalShadowCount).lights
  try{
    for(const requested of [0,1,2,4]){
      r.setLightShadows(requested);await qa.warm()
      await new Promise(resolve=>setTimeout(resolve,800))
      shadowBudgets.push(inspectLights(requested))
    }
  }finally{r.setLightShadows(originalShadowCount);await qa.warm()}
  await move(frame.W/2,frame.D+1)
  await new Promise(resolve=>setTimeout(resolve,800))
  check(lit().length===0,'Shop lights enabled behind an opaque room partition')
  return {ok:true,building:b.id,room:room.id,walks,checkoutLanded:landed,fixtures:fixtures.reduce((a:any,p)=>{a[p.key]=(a[p.key]??0)+1;return a},{}),outsideLights:outside,mode,shadowSlots:r.lightShadowCount,shadowBudgets,backWallLights:0}
}
