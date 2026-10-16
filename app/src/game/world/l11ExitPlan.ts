import type { L11Building,L11CityPlan,L11BuildingExit } from './l11Types'
import { l11InteriorPlan } from './l11Interiors'
import type { Point } from './l11Geometry'

export const L11_EXIT_BUILDING_SPACING=180,L11_EXIT_SIGN_SPACING=90
export const L11_ROAD_EXITS=[{kind:'l11roadback',x:26,y:90,site:'L9'},{kind:'countrypath',x:92,y:26,site:'L10'}] as const
// Hashing includes the whole block/lot identity, never load order or dressing revision.
function rank(seed:number,id:string){let h=seed>>>0;for(const c of id){h=Math.imul(h^c.charCodeAt(0),16777619);h^=h>>>13}return h>>>0}
export function l11OfficeExit(b:L11Building,seed:number):L11BuildingExit|null {
  if(b.use!==1||b.sealed||b.accessible<2)return null
  const plan=l11InteriorPlan(b),doors=plan.floors.flatMap(f=>f.floor>0?f.doors.filter(d=>d.to==='hall'&&f.rooms.some(r=>r.id===d.from&&r.kind==='workspace')):[])
  if(!doors.length)return null
  const door=doors[rank(seed,b.id)%doors.length],room=plan.floors[door.floor].rooms.find(r=>r.id===door.from)!
  let angle=Math.atan2(door.b[1]-door.a[1],door.b[0]-door.a[0])
  if(Math.sin(angle)*(room.x+room.w/2-door.center[0])-Math.cos(angle)*(room.y+room.h/2-door.center[1])>0)angle+=Math.PI
  return {kind:'l11officedoor',center:door.center,angle,floor:door.floor as 1|2,width:1.38,roomId:room.id}
}
export function planL11ExitBuildings(plan:L11CityPlan,replace:(b:L11Building,kind:'l11unfinisheddoor'|'l11liftshaft'|'l11brickdoor')=>L11Building){
  const selected:L11Building[]=[],blocks=new Set<string>()
  const eligible=(b:L11Building)=>b.id!=='l11:public-archive'&&!b.id.includes(':reference:')&&!blocks.has(b.blockId)
    &&b.x>plan.bounds.x+120&&b.y>plan.bounds.y+120&&b.x+b.w<plan.bounds.x+plan.bounds.w-120&&b.y+b.h<plan.bounds.y+plan.bounds.h-120
    &&selected.every(q=>Math.hypot(q.x+q.w/2-b.x-b.w/2,q.y+q.h/2-b.y-b.h/2)>=L11_EXIT_BUILDING_SPACING)
  for(const kind of ['l11unfinisheddoor','l11liftshaft','l11brickdoor','l11officedoor'] as const){
    // At most one of each per square kilometre, and many regions omit one.
    if(rank(plan.seed,plan.id+kind)%5===0)continue
    const candidates=plan.buildings.filter(b=>eligible(b)&&(kind!=='l11officedoor'||b.use===1&&!b.sealed&&b.accessible>1)).sort((a,b)=>rank(plan.seed,a.id+kind)-rank(plan.seed,b.id+kind))
    for(const old of candidates){
      let b:L11Building
      if(kind==='l11officedoor'){
        const exit=l11OfficeExit(old,plan.seed);if(!exit)continue
        b={...old,exit}
      }else b=replace(old,kind)
      plan.buildings[plan.buildings.indexOf(old)]=b;selected.push(b);blocks.add(b.blockId);break
    }
  }
}
export function l11ExteriorExit(b:L11Building,kind:L11BuildingExit['kind']):L11BuildingExit{
  const angle=b.doorAngle-b.angle
  const center:Point=[b.doorLocal[0]+Math.sin(angle)*.22,b.doorLocal[1]-Math.cos(angle)*.22]
  return {kind,center,angle,floor:0,width:kind==='l11brickdoor'?1.25:1.5}
}
