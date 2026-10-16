import assert from 'node:assert/strict'
import { mkdirSync,writeFileSync } from 'node:fs'
import { l11CityPlan,l11World } from '../src/game/world/l11Layout'
import { L11_REFERENCE_SEED } from '../src/game/world/l11ReferenceDistrict'
import { l11InteriorPlan } from '../src/game/world/l11Interiors'
import { l11RoomFixtures } from '../src/game/world/l11RoomFurnishing'
import { l11RetailFrame,l11VisibleRetailRoom } from '../src/game/world/l11RetailLayout'
import { l11Shopfront } from '../src/game/world/l11Shopfront'
import { l11DecorDef } from '../src/game/content/l11Decor'
import { l11PropColliders } from '../src/game/world/l11Collision'
import { l11SolidHits } from '../src/game/world/l11Solid'
import type { L11Building } from '../src/game/world/l11Types'
import type { Structure } from '../src/game/core/types'

const report={buildings:0,shops:0,fixtures:{} as Record<string,number>,doorRoutes:0,sampleCells:0,orientations:[] as string[],ordinary:[] as unknown[]}
const base=l11CityPlan(L11_REFERENCE_SEED,0,0).buildings.find(b=>b.id.endsWith(':reference:west-piers'))!
const verify=(b:L11Building)=>{
  report.buildings++
  const all=l11RoomFixtures(b)
  for(const f of l11InteriorPlan(b).floors)for(const r of f.rooms.filter(r=>r.kind==='shop')){
    report.shops++
    const props=all.filter(p=>p.roomId===r.id),solids=props.flatMap(p=>{
      report.fixtures[p.key]=(report.fixtures[p.key]??0)+1
      const d=l11DecorDef('l11_'+p.key)!
      const s:Structure={kind:d.id,x:p.x-d.w/2,y:p.y-d.d/2,w:d.w,h:d.d,solid:d.solid,data:{deg:-p.angle*180/Math.PI}}
      return d.solid?l11PropColliders(s):[]
    })
    assert(!props.some(p=>p.key==='reception_desk'),'shop uses a real checkout, not office reception')
    const {point,W,D,angle}=l11RetailFrame(b,r,f)
    for(const p of props.filter(p=>p.key==='retail_checkout'||p.key==='retail_cooler'))assert(Math.abs(Math.sin(p.angle-angle))<1e-6,'customer faces follow the shop orientation')
    const lamps=props.filter(p=>p.key==='ceiling_light')
    assert.equal(lamps.length,Math.max(1,Math.ceil(W/3.6))*Math.max(1,Math.ceil(D/3.5)))
    for(const lamp of lamps)assert.equal(lamp.mount,2.65)
    // Walkability uses the actual detailed shelf/cabinet solid meshes. Flood
    // fill connects every door approach and both customer sides of each aisle.
    const step=.25,nx=Math.floor((r.w-.8)/step)+1,ny=Math.floor((r.h-.8)/step)+1
    const pos=(k:number):[number,number]=>[r.x+.4+k%nx*step,r.y+.4+Math.floor(k/nx)*step]
    const free=Uint8Array.from({length:nx*ny},(_,k)=>solids.some(s=>l11SolidHits(s,...pos(k),.32,.03,1.48))?0:1)
    const nearest=(x:number,y:number)=>{let best=-1,d=Infinity;for(let k=0;k<free.length;k++)if(free[k]){const p=pos(k),v=Math.hypot(p[0]-x,p[1]-y);if(v<d){best=k;d=v}}return {best,d}}
    const doors=f.doors.filter(d=>d.from===r.id||d.to===r.id),starts=doors.map(d=>nearest(Math.max(r.x+.4,Math.min(r.x+r.w-.4,d.center[0])),Math.max(r.y+.4,Math.min(r.y+r.h-.4,d.center[1]))))
    assert(starts.every(s=>s.best>=0&&s.d<.42),'door approaches must stay clear')
    const seen=new Set<number>(),queue=[starts[0].best];seen.add(queue[0])
    for(let i=0;i<queue.length;i++){
      const k=queue[i],x=k%nx,y=Math.floor(k/nx)
      for(const [u,v] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){const n=v*nx+u;if(u>=0&&u<nx&&v>=0&&v<ny&&free[n]&&!seen.has(n)){seen.add(n);queue.push(n)}}
    }
    for(const start of starts){assert(seen.has(start.best),'street and hall doors connected by a walkable shop');report.doorRoutes++}
    report.sampleCells+=free.length
    for(const p of props.filter(p=>p.key==='retail_gondola'))for(const side of [-1,1]){
      const approach=nearest(p.x+Math.sin(p.angle)*.9*side,p.y-Math.cos(p.angle)*.9*side)
      assert(approach.d<.45&&seen.has(approach.best),'both faces of merchandise accessible')
    }
    const centre=point(W/2,D/2);assert(centre.every(Number.isFinite))
  }
  const shop=l11Shopfront(b)
  if(shop?.available){
    for(const side of [shop.side,shop.back]){
      const p: [number,number]=side==='e'?[b.width+2,shop.y+shop.h/2]:side==='w'?[-2,shop.y+shop.h/2]:side==='s'?[shop.x+shop.w/2,b.depth+2]:[shop.x+shop.w/2,-2]
      const world=l11World(b,...p),room=l11VisibleRetailRoom(b,...world,b.base)
      assert(room,'shop light visible through either glazed elevation')
      assert(!l11VisibleRetailRoom(b,...world,b.base+3),'upper-storey observer cannot enable ground shop lighting')
    }
    assert(!l11VisibleRetailRoom(b,...l11World(b,b.width/2,b.depth/2),b.base),'opaque neighbouring rooms do not enable shop lights')
  }
}
verify(base)
for(const front of ['n','e','s','w'] as const){
  const doorLocal:[number,number]=front==='n'?[base.width/2,0]:front==='s'?[base.width/2,base.depth]:front==='e'?[base.width,base.depth/2]:[0,base.depth/2]
  const b={...base,id:'test:'+front,front,angle:.37,ox:-350,oy:-213,doorLocal,stairs:[],accessible:1}
  b.door=l11World(b,...doorLocal);verify(b);report.orientations.push(front)
}
for(const seed of [42,-17,7391]){
  let count=0
  for(const [mx,my] of [[0,0],[-1,-1],[1,0],[-1,0],[0,1],[1,1],[0,-1],[-2,-1],[2,1]]){
    for(const b of l11CityPlan(seed,mx,my).buildings.filter(b=>!b.sealed&&l11Shopfront(b)?.available)){
      verify(b);report.ordinary.push({seed,building:b.id,front:b.front,angle:b.angle});if(++count===2)break
    }
    if(count===2)break
  }
  assert(count>0,'ordinary seed has populated corner retailers')
}
for(const key of ['retail_checkout','retail_gondola','retail_cooler'])assert(report.fixtures[key]>0,key+' generated')
mkdirSync('reports/l11-reference/retail-v16',{recursive:true})
writeFileSync('reports/l11-reference/retail-v16/static.json',JSON.stringify({ok:true,...report},null,2));console.log(JSON.stringify(report,null,2))
