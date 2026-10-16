import { mkdirSync,writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { generateLevel,floorHeight,l11MapSpace } from '../src/game/world/mapgen'
import { updateInfinite } from '../src/game/world/infinite'
import { L11 } from '../src/game/levels/l11'
import { beginL11FacelingFrame,updateL11Faceling,l11FacelingActivity } from '../src/game/engine/l11FacelingAI'
import { l11PedestrianSurface,l11PedestrianSegment } from '../src/game/world/l11PedestrianSpace'
import { l11ChunkData } from '../src/game/world/l11Layout'
import { transform,bounds,type Point } from '../src/game/world/l11Geometry'
import type { L11ChunkData } from '../src/game/world/l11Types'
import { canOccupy } from '../src/game/core/player'
import type { Engine } from '../src/game/engine'

let checks=0
const ok=(value:unknown,message:string)=>{assert(value,message);checks++}
// Both endpoints are legal. The diagonal between them crosses a tiny wedge
// outside the stripes; the old .32m probes saw neither the wedge nor the curb.
const source=l11ChunkData(20261006,4,8),a:Point=[148.28031737487993,280.2643819887095],b:Point=[148.125,280.125]
ok(l11PedestrianSurface(source,...a)&&l11PedestrianSurface(source,...b),'regression endpoints are walkable')
ok(!l11PedestrianSegment(source,a,b),'reject the exact observed corner-cutting segment')
// Rotate/translate the complete road and marking geometry, including negative
// world coordinates. Never replace the crossing predicate with a world grid.
for(const angle of [0,.29,-.43,Math.PI/2])for(const [x,y]of [[0,0],[-1300,-1600]]){
  const point=(p:Point):Point=>[x+p[0]*Math.cos(angle)-p[1]*Math.sin(angle),y+p[0]*Math.sin(angle)+p[1]*Math.cos(angle)]
  const data:L11ChunkData={...source,buildings:[],canals:[],bridges:[],roads:source.roads.map(r=>{const polygon=r.polygon.map(p=>transform(p,x,y,angle));return {...r,polygon,bounds:bounds(polygon),points:r.points.map(point)}}),crosswalks:source.crosswalks?.map(c=>({...c,center:point(c.center),axis:[c.axis[0]*Math.cos(angle)-c.axis[1]*Math.sin(angle),c.axis[0]*Math.sin(angle)+c.axis[1]*Math.cos(angle)]}))}
  ok(!l11PedestrianSegment(data,point(a),point(b)),'rotated corner remains blocked')
  const c=source.crosswalks!.find(c=>c.center[0]===144&&Math.abs(c.center[1]-279.1)<.01)!
  const p=point([c.center[0]-c.width/2-1,c.center[1]]),q=point([c.center[0]+c.width/2+1,c.center[1]])
  ok(l11PedestrianSegment(data,p,q),`complete marked crossing remains open after rotation/translation ${angle},${x},${y}; ${Array.from({length:101},(_,i)=>[p[0]+(q[0]-p[0])*i/100,p[1]+(q[1]-p[1])*i/100] as Point).filter(p=>!l11PedestrianSurface(data,...p)).map(p=>p.join(',')).join(';')}`)
}
// Fine probes provide an independent oracle for many short pavement segments.
let legal=0,rejected=0
for(let x=147.9;x<149;x+=.13)for(let y=279.9;y<281;y+=.11){
  const a:Point=[x,y],b:Point=[x-.4,y-.31]
  if(l11PedestrianSegment(source,a,b)){legal++;for(let i=0;i<=100;i++)ok(l11PedestrianSurface(source,a[0]+(b[0]-a[0])*i/100,a[1]+(b[1]-a[1])*i/100),'accepted edge never leaves pavement')}else rejected++
}
ok(legal>0&&rejected>0,'edge oracle exercises both legal and illegal trajectories')
const m=generateLevel(L11,20261006,false)
updateInfinite(m,L11,220-m.inf!.ox,220-m.inf!.oy)
const eng={map:m,levelDef:L11,dev:{invisible:true},player:{x:0,y:0,z:0},los:()=>false,faceToward:(e:any,x:number,y:number)=>{e.facing=Math.atan2(y-e.y,x-e.x)}} as unknown as Engine
const records=new Map<number,any>()
for(let f=0;f<30*180;f++){
  beginL11FacelingFrame(m)
  for(const e of m.entities){if(!e.l11Home)continue
    const before=[e.x,e.y];updateL11Faceling(eng,e,1/30)
    if(e.l11Home.role!=='pedestrian')continue
    let a=records.get(e.id);if(!a){a={id:e.id,stalled:0,maxStalled:0,firstStall:null};records.set(e.id,a)}
    a.stalled=Math.hypot(e.x-before[0],e.y-before[1])<.001?a.stalled+1/30:0;a.maxStalled=Math.max(a.maxStalled,a.stalled)
    const activity=l11FacelingActivity(e)!
    if(a.stalled>8&&!a.firstStall&&activity.next){
      const x=e.x+m.inf!.ox,y=e.y+m.inf!.oy,[gx,gy]=activity.next,d=Math.hypot(gx-x,gy-y),nx=x+(gx-x)/d*.88/30,ny=y+(gy-y)/d*.88/30
      const data=m.inf!.chunks.get(`${Math.floor(nx/32)},${Math.floor(ny/32)}`)!.l11!,height=floorHeight(m,nx-m.inf!.ox,ny-m.inf!.oy)
      a.firstStall={frame:f,position:[x,y,e.z],next:[nx,ny,height],activity,surface:l11PedestrianSurface(data,nx,ny)??null,occupy:canOccupy(m,nx-m.inf!.ox,ny-m.inf!.oy,.28,{z:height+.03,band:0}),space:l11MapSpace(m,nx-m.inf!.ox,ny-m.inf!.oy,0),neighbours:m.entities.filter(q=>q!==e&&Math.hypot(q.x-e.x,q.y-e.y)<1).map(q=>[q.x+m.inf!.ox,q.y+m.inf!.oy]),crossings:data.crosswalks?.filter(c=>Math.hypot(c.center[0]-x,c.center[1]-y)<12)}
    }
    a.activity=activity
    if(f%15===0){const wx=e.x+m.inf!.ox,wy=e.y+m.inf!.oy,data=m.inf!.chunks.get(`${Math.floor(wx/32)},${Math.floor(wy/32)}`)!.l11!
      ok(l11PedestrianSurface(data,wx,wy),'live walker stays on paving or stripes')
      ok(canOccupy(m,e.x,e.y,.28,{z:e.z,band:0}),'live walker stays outside geometry')
    }
  }
}
for(const a of records.values()){
  ok(a.maxStalled<8,'no recurring curb stall: '+a.id)
  ok(a.activity.travel>110,'every pedestrian makes sustained progress: '+a.id)
}
ok([...records.values()].some(a=>a.activity.crossings>=4),'walkers complete repeated marked crossings')
mkdirSync('reports/l11-navigation-interiors',{recursive:true});writeFileSync('reports/l11-navigation-interiors/crosswalks.json',JSON.stringify({ok:true,checks,oracle:{legal,rejected},walkers:[...records.values()]},null,2));console.log(JSON.stringify({ok:true,checks,walkers:records.size}))
