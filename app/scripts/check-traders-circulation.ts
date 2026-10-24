import assert from 'node:assert/strict'
import {createTradersMap,generateTradersChunk} from '../src/game/world/tradersWorld'
import {levelDefOf} from '../src/game/levels'
import {canOccupy,resolvePlayerPenetration} from '../src/game/core/player'
import {enableRuntimeStructCollisionIndex} from '../src/game/world/mapgen'
import {TRADERS_PASSAGES,TRADERS_WALLS,TRADERS_THROUGH_ROUTES,TRADERS_ROOMS,TRADERS_DOORS,TRADERS_VAULT_CELLS,tradersIntersects} from '../src/game/content/tradersLayout'
import {buildTradersPassageFrame,tradersWallFinishBounds} from '../src/game/renderer/tradersArchitectureDetails'
import type {Builder} from '../src/game/renderer/tradersMeshes'
const m=createTradersMap(levelDefOf(102)!,424242)
assert.equal(m.traders!.chunks.size,0,'circulation data must not load the whole world')
for(let cy=0;cy<9;cy++)for(let cx=0;cx<14;cx++)generateTradersChunk(m,cx,cy)
enableRuntimeStructCollisionIndex(m)
let samples=0
function clear(x:number,y:number,message:string){assert(canOccupy(m,x,y,.32,{z:.02,band:0}),`${message}: ${x},${y}`);samples++}
// Check the full four-metre public lane with furnished collisions, not just its centerline.
for(const lane of TRADERS_THROUGH_ROUTES)for(let x=lane.x+.4;x<lane.x+lane.w-.39;x+=.5)for(let y=lane.y+.4;y<lane.y+lane.h-.39;y+=.4)clear(x,y,'public concourse')
for(const p of TRADERS_PASSAGES){
 assert(p.width>=2.4&&p.height>=2.8,'real standing clearance')
 for(const id of p.rooms){
  const r=TRADERS_ROOMS.find(r=>r.id===id)!
  assert(r&&!['vault','shop','anchor','rail','dock'].includes(r.kind),'no bypass through vaults, tenants or unopened transport')
  const fixed=p.axis==='x'?p.y:p.x,lo=p.axis==='x'?r.y:r.x,hi=lo+(p.axis==='x'?r.h:r.w),center=p.axis==='x'?p.x:p.y,start=p.axis==='x'?r.x:r.y,end=start+(p.axis==='x'?r.w:r.h)
  assert(Math.min(Math.abs(fixed-lo),Math.abs(fixed-hi))<.001,'passage follows actual room boundary')
  assert(center-p.width/2>start+.4&&center+p.width/2<end-.4,'door frame stays away from corners')
 }
 // Both sides, full opening width and approach: catches a second shared wall sealing the hole,
 // thin columns, chairs and carts that would obstruct the player after the wall is cut.
 for(let u=-p.width/2+.4;u<=p.width/2-.39;u+=.4)for(let v=-2.6;v<=2.61;v+=.4)clear(p.x+(p.axis==='x'?u:v),p.y+(p.axis==='x'?v:u),'passage '+p.id)
 // Every skirt/belt/cornice cap must remain outside the opening, including chunk clips.
 for(const wall of TRADERS_WALLS){
  if(wall.bottom!==0)continue
  const horizontal=wall.w>=wall.h,fixed=horizontal?wall.y+wall.h/2:wall.x+wall.w/2
  if(p.axis!==(horizontal?'x':'y')||Math.abs(fixed-(horizontal?p.y:p.x))>.001)continue
  const open=p.axis==='x'?{x:p.x-p.width/2+.0001,y:p.y-.15,w:p.width-.0002,h:.3}:{x:p.x-.15,y:p.y-p.width/2+.0001,w:.3,h:p.width-.0002}
  for(const pad of [.012,.02,.015]){
   assert(!tradersIntersects(tradersWallFinishBounds(wall,wall,pad),open),'wall finish protrudes through frame '+p.id)
   const clipped={...wall,x:Math.max(wall.x,Math.floor(wall.x/32)*32),y:Math.max(wall.y,Math.floor(wall.y/32)*32)}
   clipped.w=wall.x+wall.w-clipped.x;clipped.h=wall.y+wall.h-clipped.y
   assert(!tradersIntersects(tradersWallFinishBounds(wall,clipped,pad),open),'clipped wall finish protrudes through frame '+p.id)
  }
 }
 const boxes:{x:number;y:number;w:number;h:number;bottom:number;top:number;surface:string}[]=[]
 const builder={box:(x:number,bottom:number,y:number,w:number,h:number,d:number,surface:string)=>boxes.push({x,y,w,h:d,bottom,top:bottom+h,surface})} as unknown as Builder
 buildTradersPassageFrame(builder,p)
 const inside=p.axis==='x'?{x:p.x-p.width/2+.02,y:p.y-.05,w:p.width-.04,h:.1}:{x:p.x-.05,y:p.y-p.width/2+.02,w:.1,h:p.width-.04}
 for(const box of boxes){
  assert([box.x,box.y,box.w,box.h,box.bottom,box.top].every(Number.isFinite))
  assert(!(box.bottom<2.4&&box.top>.05&&tradersIntersects(box,inside)),'visible frame intrudes into clear opening '+p.id)
  if(box.top>.05)assert.equal(box.surface,p.kind==='public'?'stone':'steel')
 }
}
assert.equal(TRADERS_VAULT_CELLS.length,128);assert.equal(TRADERS_DOORS.length,128)
for(const d of TRADERS_DOORS)assert(!canOccupy(m,d.x+d.w/2,d.y+d.h/2,.32,{z:.02,band:0}),'closed restricted door remains solid')
assert.equal(m.structures.filter(s=>s.data?.tradersProp==='cafe_table').length,64,'keep all dining tables')
assert.equal(m.structures.filter(s=>String(s.data?.tradersId).includes('vacant_market.empty_stall')).length,9,'keep all empty stalls')
// Saved positions on moved partitions recover locally via the existing common player solver.
for(const p of [{x:88,y:115.6},{x:100,y:120},{x:88,y:125.2}]){
 const r=resolvePlayerPenetration(m,p,.32,{z:.02,band:0})
 assert(canOccupy(m,p.x,p.y,.32,{z:.02,band:0}),'old position must not become stuck in shifted partition')
 assert(Math.hypot(r.x,r.y)<1,'recovery must stay local rather than reset the player to the entry')
}
console.log(JSON.stringify({ok:true,openings:TRADERS_PASSAGES.length,publicLanes:TRADERS_THROUGH_ROUTES.length,collisionSamples:samples,closedVaults:128,tables:64,emptyStalls:9,oldPartitionRecovery:3},null,2))
