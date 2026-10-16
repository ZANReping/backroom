import assert from 'node:assert/strict'
import { mkdirSync,writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { L11 } from '../src/game/levels/l11'
import { generateLevel,floorHeight } from '../src/game/world/mapgen'
import { updateInfinite } from '../src/game/world/infinite'
import { genL11ChunkRaw } from '../src/game/world/l11Raw'
import { clearL11PlanCache,l11CityPlan,l11Local,l11ChunkData } from '../src/game/world/l11Layout'
import { l11CrossingPositions } from '../src/game/world/l11RoadMarkings'
import { l11IndoorFacelingHomes } from '../src/game/world/l11FacelingSpawns'
import { l11PedestrianSurface } from '../src/game/world/l11PedestrianSpace'
import { l11RoomFixtures } from '../src/game/world/l11RoomFurnishing'
import { l11InteriorPlan } from '../src/game/world/l11Interiors'
import { canOccupy } from '../src/game/core/player'
import { beginL11FacelingFrame,updateL11Faceling,l11FacelingActivity } from '../src/game/engine/l11FacelingAI'
import type { Engine } from '../src/game/engine'

let checks=0
const ok=(value:unknown,label:string)=>{assert(value,label);checks++}
const out='reports/l11-faceling-ecology';mkdirSync(out,{recursive:true})
const report:{checks:number;seeds:unknown[];simulations:unknown[];fixtures:unknown[];ok?:boolean}={checks:0,seeds:[],simulations:[],fixtures:[]}
for(const seed of [1,42,20261006])for(const [cx,cy]of [[0,0],[-32,-32],[32,32],[33,32]]){
  const data=l11ChunkData(seed,cx,cy),roads=[]
  // This is the renderer's full-graph collection, not the clipped chunk graph.
  for(let my=Math.floor((cy*32-16)/1024);my<=Math.floor((cy*32+16)/1024);my++)for(let mx=Math.floor((cx*32-16)/1024);mx<=Math.floor((cx*32+16)/1024);mx++)roads.push(...l11CityPlan(seed,mx,my).roads)
  for(const c of data.crosswalks??[]){const r=roads.find(r=>r.id===c.roadId)!;ok(l11CrossingPositions(r,c.segment,roads).some(t=>Math.abs(t-c.t)<1e-6),'navigation crossing agrees with visible stripes at macro seam')}
}
for(const seed of [1,42,20261006]){
  const homes=[],plan=l11CityPlan(seed,0,0),negative=l11CityPlan(seed,-1,-1)
  for(const p of [plan,negative])for(const b of p.buildings){
    const residents=l11IndoorFacelingHomes(b);ok(residents.length<=3,'bounded building population')
    for(const home of residents){
      homes.push({home,b})
      ok(!b.sealed&&home.floor<b.accessible,'inhabited accessible floor')
      const fixture=l11RoomFixtures(b).find(f=>f.id===home.fixtureId)!,r=l11InteriorPlan(b).floors[home.floor].rooms.find(r=>r.id===home.roomId)!
      ok(!!fixture&&!!r,'occupation has a real fixture/room')
      const [x,y]=l11Local(b,...home.position)
      ok(x>r.x&&x<r.x+r.w&&y>r.y&&y<r.y+r.h,'resident inside own room')
      if(home.role==='shopkeeper')ok((x-fixture.x)*-Math.sin(fixture.angle)+(y-fixture.y)*Math.cos(fixture.angle)>.4,'shopkeeper is behind checkout')
    }
  }
  ok(homes.some(v=>v.home.role==='shopkeeper'),'shopkeepers occur in ordinary seed')
  ok(homes.some(v=>v.home.role==='office'&&v.home.floor>0),'upper-floor offices populated')
  const fixtures=['shopkeeper','office'].flatMap(role=>homes.filter(v=>v.home.role===role).slice(0,2))
  const city=generateLevel(L11,seed,false)
  for(const {home,b}of fixtures){
    updateInfinite(city,L11,home.position[0]-city.inf!.ox,home.position[1]-city.inf!.oy)
    const resident=city.entities.find(e=>e.l11Home?.id===home.id)
    ok(resident,'spawn metadata reaches live entity')
    ok(canOccupy(city,resident!.x,resident!.y,.28,{z:resident!.z,band:home.floor}),`spawn clear ${home.id}`)
    ok(Math.abs(resident!.z-(b.base+home.floor*3+.03))<.001,'correct absolute floor height')
    const cx=Math.floor(home.position[0]/32),cy=Math.floor(home.position[1]/32),raw=genL11ChunkRaw(L11,seed,cx,cy),before=JSON.stringify(raw.entities)
    ok(before===JSON.stringify(genL11ChunkRaw(L11,seed,cx,cy,undefined,7).entities),'dressing revisions preserve ecological identity')
    clearL11PlanCache();l11CityPlan(seed,-1,0)
    ok(before===JSON.stringify(genL11ChunkRaw(L11,seed,cx,cy).entities),'generation order independent')
    report.fixtures.push({seed,home,base:b.base})
  }
  report.seeds.push({seed,homes:homes.length,shopkeepers:homes.filter(v=>v.home.role==='shopkeeper').length,upper:homes.filter(v=>v.home.floor>0).length})
}
const city=generateLevel(L11,20261006,false),eng={map:city,levelDef:L11,dev:{invisible:true},player:{x:0,y:0,z:0},los:()=>false,faceToward:(e:any,x:number,y:number)=>{e.facing=Math.atan2(y-e.y,x-e.x)}} as unknown as Engine
let migrationChecked=false
for(const [wx,wy]of [[220,220],[-80,-80],[1035,1028]]){
  updateInfinite(city,L11,wx-city.inf!.ox,wy-city.inf!.oy)
  const entities=city.entities.filter(e=>e.l11Home),pedestrians=entities.filter(e=>e.l11Home?.role==='pedestrian')
  ok(pedestrians.length>0,`street population ${wx},${wy}`)
  const samples:number[]=[],before=new Map(entities.map(e=>[e.id,[e.x,e.y]]))
  for(let frame=0;frame<30*120;frame++){
    const t=performance.now();beginL11FacelingFrame(city)
    for(const e of entities)updateL11Faceling(eng,e,1/30)
    samples.push(performance.now()-t)
    if(frame%15===0)for(const e of entities){
      ok(canOccupy(city,e.x,e.y,.28,{z:e.z,band:e.l11Home!.floor}),`body remains clear ${e.l11Home!.id} frame${frame}`)
      ok(Math.abs(e.z-floorHeight(city,e.x,e.y,e.l11Home!.floor))<.08,'ground/floor height follows actual space')
      if(e.l11Home!.role==='pedestrian'){
        const x=e.x+city.inf!.ox,y=e.y+city.inf!.oy,data=city.inf!.chunks.get(`${Math.floor(x/32)},${Math.floor(y/32)}`)!.l11!
        ok(l11PedestrianSurface(data,x,y),'never crosses unmarked roadway or enters water')
      }
    }
  }
  const moves=entities.map(e=>({id:e.l11Home!.id,role:e.l11Home!.role,from:before.get(e.id),to:[e.x,e.y],...l11FacelingActivity(e)}))
  ok(pedestrians.some(e=>(l11FacelingActivity(e)?.travel??0)>15),'pedestrians make progress')
  samples.sort((a,b)=>a-b);report.simulations.push({world:[wx,wy],count:entities.length,ms:{p50:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)],max:samples.at(-1)},moves})
  console.log(JSON.stringify(report.simulations.at(-1)))
  const migrant=city.entities.find(e=>e.l11Home?.role==='pedestrian'&&Math.abs(Math.floor((e.x+city.inf!.ox)/32)-Math.floor(e.l11Home.position[0]/32))>=2)
  if(migrant&&!migrationChecked){
    const h=migrant.l11Home!,mx=migrant.x+city.inf!.ox,my=migrant.y+city.inf!.oy,birthCX=Math.floor(h.position[0]/32),nowCX=Math.floor(mx/32),sign=Math.sign(nowCX-birthCX)
    updateInfinite(city,L11,(birthCX+sign*4)*32+16-city.inf!.ox,my-city.inf!.oy)
    ok(!city.inf!.chunks.has(`${birthCX},${Math.floor(h.position[1]/32)}`),'birth chunk unloaded while walking resident remains')
    ok(city.entities.includes(migrant),'migrant retained under current chunk ownership')
    updateInfinite(city,L11,(birthCX+sign*2)*32+16-city.inf!.ox,my-city.inf!.oy)
    ok(city.entities.filter(e=>e.l11Home?.id===h.id).length===1,'reloaded birth chunk deduplicates migrant')
    ok(Math.hypot(migrant.x+city.inf!.ox-mx,migrant.y+city.inf!.oy-my)<1e-6,'world position survives repeated rebase')
    migrationChecked=true
  }
}
ok(report.simulations.some((s:any)=>s.moves.some((e:any)=>e.crossings>0)),'marked crossings used')
ok(migrationChecked,'natural cross-chunk pedestrian lifecycle exercised')
report.checks=checks;report.ok=true;writeFileSync(out+'/generation.json',JSON.stringify(report,null,2));console.log(JSON.stringify({checks,ok:true,seeds:report.seeds}))
