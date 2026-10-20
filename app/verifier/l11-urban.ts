import { l11Buildings,l11World,l11Local,l11TerrainHeight,l11SurfaceAt } from '../src/game/world/l11Layout'
import { l11InteriorPlan } from '../src/game/world/l11Interiors'
import { l11RoomFixtures } from '../src/game/world/l11RoomFurnishing'
import { canOccupy } from '../src/game/core/player'
import { inPolygon,circlePolygon,segmentDistance } from '../src/game/world/l11Geometry'
import { updateMovement } from '../src/game/engine/movement'

/** Real generated rooms, with no QA furniture or substitute models. */
export function l11UrbanPhotoCandidates(seed=20261006){
  const buildings=l11Buildings(seed,16,16,1040,1040),targets=['living','bedroom','bathroom','workspace','meeting','reception','classroom','reading','shop','workshop','studio'],groups:any[][]=[]
  for(const kind of targets){
    const candidates:any[]=[]
    for(const b of buildings.filter(b=>!b.sealed)){
      const plan=l11InteriorPlan(b),fixtures=l11RoomFixtures(b)
      for(const f of plan.floors)for(const room of f.rooms.filter(r=>r.kind===kind)){
        const props=fixtures.filter(p=>p.roomId===room.id&&p.key!=='ceiling_light');if(props.length<2)continue
        const door=f.doors.find(d=>d.from===room.id||d.to===room.id)!,tx=room.x+room.w/2,ty=room.y+room.h/2
        const focus=kind==='bathroom'?props.filter(p=>p.key==='toilet'||p.key==='wash_basin'):props
        const aim: [number,number]=[focus.reduce((n,p)=>n+p.x,0)/focus.length,focus.reduce((n,p)=>n+p.y,0)/focus.length]
        for(const along of [.2,.65,1.1])for(const offset of [-.25,.25,0]){
          const dx=tx-door.center[0],dy=ty-door.center[1],len=Math.hypot(dx,dy),u=door.center[0]+dx/len*along-dy/len*offset,v=door.center[1]+dy/len*along+dx/len*offset
          const [x,y]=l11World(b,u,v),[targetX,targetY]=l11World(b,aim[0],aim[1])
          candidates.push({id:'room-'+kind,building:b.id,archetype:b.archetype,room:room.id,roomBounds:room,floor:f.floor,x,y,z:b.base+f.floor*3,yaw:Math.atan2(x-targetX,y-targetY),pitch:-.11,fixtures:props.map(p=>p.key)})
        }
      }
      if(candidates.length>=45)break
    }
    if(!candidates.length)throw Error('No furnished '+kind+' room');groups.push(candidates)
  }
  return groups
}
export async function prepareL11UrbanPhoto(qa:any,candidates:any[]){
  for(const pose of candidates){
    qa.moveTo(pose.x,pose.y);qa.eng.player.z=pose.z;qa.eng.player.floor=pose.floor;qa.eng.player.vz=0
    if(!canOccupy(qa.eng.map,qa.eng.player.x,qa.eng.player.y,.32,{z:pose.z,band:pose.floor}))continue
    qa.look.yaw=pose.yaw;qa.look.pitch=pose.pitch;qa.look.roll=0;qa.r.setFov(78,35);qa.freezeRenderTime(10);const warm=await qa.warm()
    return {...pose,canOccupy:true,warm}
  }
  throw Error('No clear room tripod '+candidates[0]?.id)
}
export function l11UrbanExteriorPoses(seed=20261006){
  const buildings=l11Buildings(seed,16,16,1040,1040),poses:any[]=[]
  for(const archetype of ['townhouse','detached','setback-office','museum','transit-station']){
    const b=buildings.find(b=>b.archetype===archetype)!
    const target=l11World(b,b.width/2,b.depth/2),angle=b.doorAngle,nx=Math.sin(angle),ny=-Math.cos(angle)
    // Elevated architectural inspection, separate from the player-height rooms.
    const x=b.door[0]+nx*24,y=b.door[1]+ny*24,z=b.base+b.floors*3+6
    poses.push({id:'roof-'+archetype,x,y,z,yaw:Math.atan2(x-target[0],y-target[1]),pitch:Math.atan2(b.floors*3-z-1.62,Math.hypot(x-target[0],y-target[1])),archetype,building:b.id})
  }
  for(const b of buildings.filter(b=>b.use===3||b.use===7)){
    const ring=b.footprint[0];let found=false
    for(let i=1;i<ring.length;i++){
      const a=ring[i-1],c=ring[i],len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(len<15)continue
      const dx=(c[0]-a[0])/len,dy=(c[1]-a[1])/len,nx=dy,ny=-dx,x=(a[0]+c[0])/2+nx*2.2-dx*7,y=(a[1]+c[1])/2+ny*2.2-dy*7
      if(buildings.some(q=>inPolygon(x,y,q.footprint)))continue
      poses.push({id:b.use===3?'commercial-lane':'service-lane',x,y,z:l11TerrainHeight(seed,x,y),yaw:Math.atan2(-dx,-dy),pitch:-.03,building:b.id,local:l11Local(b,x,y)});found=true;break
    }
    if(found&&poses.some(p=>p.id==='commercial-lane')&&poses.some(p=>p.id==='service-lane'))break
  }
  // An actual space between two buildings, separately from the retail frontage.
  alley:for(const b of buildings)for(const ring of b.footprint)for(let i=1;i<ring.length;i++){
    const a=ring[i-1],c=ring[i],len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(len<16)continue
    const dx=(c[0]-a[0])/len,dy=(c[1]-a[1])/len,mx=(a[0]+c[0])/2,my=(a[1]+c[1])/2
    let nx=dy,ny=-dx;if(inPolygon(mx+nx*.1,my+ny*.1,b.footprint)){nx=-nx;ny=-ny}
    const x=mx+nx*2.3-dx*5,y=my+ny*2.3-dy*5
    if(l11SurfaceAt(seed,x,y).kind==='road'||buildings.some(q=>circlePolygon(x,y,.6,q.footprint)))continue
    const opposite=buildings.find(q=>q.id!==b.id&&q.footprint.some(r=>r.slice(1).some((p,j)=>segmentDistance(mx+nx*4,my+ny*4,r[j],p)<2.5)))
    if(!opposite||[0,2,4,6].some(t=>buildings.some(q=>circlePolygon(x+dx*t,y+dy*t,.45,q.footprint))))continue
    poses.push({id:'back-alley',x,y,z:l11TerrainHeight(seed,x,y),yaw:Math.atan2(-dx,-dy),pitch:-.04,building:b.id,opposite:opposite.id});break alley
  }
  return poses.filter((p,i,a)=>a.findIndex(q=>q.id===p.id)===i)
}

/** Exercise the real movement/collision stack through the new interior portals,
 * including upper floors and rotated buildings; no noclip or QA mesh is used. */
export const L11_URBAN_WALK_TARGETS=[['living',0],['bedroom',0],['bathroom',0],['studio',0],['workspace',0],['meeting',0],['classroom',0],['reading',0],['shop',0],['workshop',0],['bedroom',1],['workspace',1]] as const
export async function verifyL11UrbanRooms(qa:any,targetIndex?:number){
  const eng=qa.eng,seed=eng.map.inf.seed,buildings=l11Buildings(seed,16,16,1040,1040).filter(b=>!b.sealed),checks:any[]=[]
  const targets=targetIndex===undefined?L11_URBAN_WALK_TARGETS:[L11_URBAN_WALK_TARGETS[targetIndex]]
  for(const [kind,floor]of targets){
    const candidates=buildings.flatMap(b=>{const f=l11InteriorPlan(b).floors[floor];return f?f.rooms.filter(r=>r.kind===kind).map(room=>({b,f,room})):[]}).sort((a,b)=>Number(!!b.b.angle)-Number(!!a.b.angle))
    let checked=false
    for(const {b,f,room}of candidates){
      const door=f.doors.find(d=>d.to===room.id||d.from===room.id)!,len=Math.hypot(door.b[0]-door.a[0],door.b[1]-door.a[1]),dx=(door.b[0]-door.a[0])/len,dy=(door.b[1]-door.a[1])/len
      const start=l11World(b,door.center[0]-dy*.8,door.center[1]+dx*.8),end=l11World(b,door.center[0]+dy*.8,door.center[1]-dx*.8),z=b.base+floor*3
      qa.moveTo(...start);eng.player.z=z;eng.player.vz=0;eng.player.floor=floor;eng.onStairs=false;eng.moveIt.acc=0;eng.input.mx=eng.input.my=0;eng.input.jump=false;eng.input.sprint=false
      const clear=(p:number[])=>canOccupy(eng.map,p[0]-eng.map.inf.ox,p[1]-eng.map.inf.oy,.32,{z,band:floor as 0|1|2})
      if(!clear(start)||!clear(end))continue
      // Collision is available with the synchronously loaded map. Visual
      // shader warm-up belongs to photo tests, not each 1.6m doorway crossing.
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
      for(const target of [end,start]){
        for(let i=0;i<100;i++){
          const x=eng.player.x+eng.map.inf.ox,y=eng.player.y+eng.map.inf.oy,d=Math.hypot(target[0]-x,target[1]-y);if(d<.06)break
          eng.input.mx=(target[0]-x)/d;eng.input.my=(target[1]-y)/d;updateMovement(eng,1/60,{dmg:1,drain:1},false)
        }
        eng.input.mx=eng.input.my=0
        if(Math.hypot(eng.player.x+eng.map.inf.ox-target[0],eng.player.y+eng.map.inf.oy-target[1])>.12||Math.abs(eng.player.z-z)>.1)throw Error('Room traversal failed '+room.id)
      }
      checks.push({kind,floor,room:room.id,building:b.id,angle:b.angle,doorWidth:len,twoWay:true});checked=true;break
    }
    if(!checked)throw Error('No clear runtime room test '+kind+':'+floor)
  }
  return {ok:true,checks}
}
