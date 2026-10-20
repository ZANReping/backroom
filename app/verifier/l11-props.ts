import { genL11ChunkRaw } from '../src/game/world/l11Raw'
import { l11Buildings,l11SurfaceAt } from '../src/game/world/l11Layout'
import { L11 } from '../src/game/levels/l11'
import { l11DecorDef } from '../src/game/content/l11Decor'
import { inPolygon, circlePolygon, segmentDistance } from '../src/game/world/l11Geometry'
import { canOccupy } from '../src/game/core/player'

const targets=['bus_shelter','hydrant','streetlight','trash_bin','manhole','storm_drain','vending_machine','phone_booth','delivery_bike','shopping_cart','market_stall','cafe_table','bus','hvac','pallet_stack','cable_reel','cement_mixer','cone','life_ring','park_bench','park_lamp','fountain','sofa','bed','office_desk','exhibit_case','wash_basin']
type Pose={id:string;instance:string;kind:string;x:number;y:number;z:number;yaw:number;pitch:number;tx:number;ty:number;targetHeight:number;role:string}
let cached:Pose[][]|undefined

/** Select existing generated instances; nothing is inserted into the game world. */
export function l11PropPhotoCandidates(seed=20261006):Pose[][]{
  if(cached)return cached
  const found=new Map<string,Pose[]>(),seen=new Set<string>()
  for(let cy=0;cy<32;cy++)for(let cx=0;cx<32;cx++){
    const raw=genL11ChunkRaw(L11,seed,cx,cy)
    for(const s of raw.structures){
      const key=s.kind.slice(4),id=String(s.data?.instanceId??'')
      if(!targets.includes(key)||(found.get(key)?.length??0)>=18||seen.has(id)||s.floor)continue
      seen.add(id)
      const def=l11DecorDef(s.kind)!,angle=-Number(s.data?.deg??0)*Math.PI/180,tx=s.x+s.w/2,ty=s.y+s.h/2,building=raw.l11!.buildings.find(b=>b.id===s.data?.buildingId)
      const base=building?.base??l11SurfaceAt(seed,tx,ty).height,targetHeight=base+Number(s.data?.mount??0)+Math.max(.03,def.height*.6)
      const distance=Math.max(1.8,def.w*1.2,def.d*.75+Math.min(def.d,def.w)*.75,def.height*.85)
      for(const dist of [distance,distance*1.18,distance*.85])for(const side of [.38,-.38,0]){
        const x=tx+Math.sin(angle)*dist+Math.cos(angle)*dist*side,y=ty-Math.cos(angle)*dist+Math.sin(angle)*dist*side
        if(l11SurfaceAt(seed,x,y).kind==='canal')continue
        if(building&&!inPolygon(x,y,building.footprint))continue
        const neighbours=l11Buildings(seed,x-2,y-2,x+2,y+2)
        if(neighbours.some(b=>b.id!==building?.id&&circlePolygon(x,y,.35,b.footprint)))continue
        if(neighbours.some(b=>b.id!==building?.id&&[.2,.4,.6,.8].some(t=>inPolygon(x+(tx-x)*t,y+(ty-y)*t,b.footprint))))continue
        if(raw.structures.some(q=>q!==s&&q.solid&&!q.l11&&(q.floor??0)===0&&segmentDistance(q.x+q.w/2,q.y+q.h/2,[x,y],[tx,ty])<Math.min(q.w,q.h)*.36))continue
        const p:Pose={id:'prop-'+key,instance:id,kind:s.kind,x,y,z:base,yaw:Math.atan2(x-tx,y-ty),pitch:Math.atan2(targetHeight-base-1.62,Math.hypot(tx-x,ty-y)),tx,ty,targetHeight,role:String(s.data?.placementRole??'park')}
        const list=found.get(key)??[];list.push(p);found.set(key,list)
      }
    }
  }
  for(const key of targets)if(!found.has(key))throw Error('No generated photo candidates: '+key)
  return cached=targets.map(k=>found.get(k)!)
}

/** Use the real player collision query before accepting a reproducible tripod. */
export async function prepareL11PropPhoto(qa:any,candidates:Pose[]){
  for(const pose of candidates){
    qa.moveTo(pose.x,pose.y);qa.eng.player.z=pose.z;qa.eng.player.vz=0;qa.eng.player.floor=0
    const map=qa.eng.map
    if(!canOccupy(map,qa.eng.player.x,qa.eng.player.y,.26,{z:pose.z,crouch:false,band:0}))continue
    const target=map.structures.find((s:any)=>s.data?.instanceId===pose.instance)
    if(!target)continue
    const ox=map.inf.ox,oy=map.inf.oy
    if(map.structures.some((s:any)=>s!==target&&s.solid&&!s.l11&&(s.floor??0)===0&&segmentDistance(s.x+s.w/2+ox,s.y+s.h/2+oy,[pose.x,pose.y],[pose.tx,pose.ty])<Math.min(s.w,s.h)*.4+.08))continue
    qa.look.yaw=pose.yaw;qa.look.pitch=pose.pitch;qa.look.roll=0;qa.r.setFov(55,35);qa.freezeRenderTime(10)
    await qa.warm()
    return {...pose,canOccupy:true,deg:target.data.deg,front:'-z',materialSurfaces:[...new Set<string>(await import('../src/game/content/l11PropParts').then(m=>m.l11PropParts(target.kind).map(p=>p.surface)))]}
  }
  throw Error('No collision-free generated closeup: '+candidates[0]?.kind)
}
