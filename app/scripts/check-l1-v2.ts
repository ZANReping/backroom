// L1 v2 (过道 / 小径) generation check: npm run check:l1-v2
import assert from 'node:assert/strict'
import {writeFileSync,mkdirSync} from 'node:fs'
import { genL1ChunkRaw } from '../src/game/world/infiniteL1'
import { L1 } from '../src/game/levels/l1'
import { l1PlanTile, l1PlanRegions, l1PlanDoors, l1PlanRooms, l1RegionAt } from '../src/game/world/l1Plan'
import { l1Outpost, l1LayoutVariant } from '../src/game/world/l1Layout'

let pass=0;const fails:string[]=[]
const ok=(c:unknown,m:string)=>{if(c)pass++;else fails.push(m)}
const report:Record<string,unknown>={}

// 1. section shares by area over a 9.6 km window, region sizes, rectangularity
for(const seed of [20261006,1,424242]){
 const regs=l1PlanRegions(seed,-4800,-4800,4800,4800),area:Record<string,number>={};let tot=0
 for(const r of regs){const a=(r.ix1-r.ix0)*(r.iy1-r.iy0);area[r.section]=(area[r.section]??0)+a;tot+=a}
 const pct=Object.fromEntries(Object.entries(area).map(([k,v])=>[k,+(100*v/tot).toFixed(1)]))
 report[`share:${seed}`]=pct
 const target:Record<string,number>={parking:46,storage:20,gothic:18,garden:7,ouroboros:6,fabled:3}
 for(const [k,v] of Object.entries(target))ok(Math.abs((pct[k]??0)-v)<=Math.max(2,v*.35),`share ${seed} ${k} ${pct[k]} vs ${v}`)
 const sizes=regs.filter(r=>r.section!=='fabled').map(r=>Math.sqrt((r.ix1-r.ix0)*(r.iy1-r.iy0))).sort((a,b)=>a-b)
 ok(sizes[0]>=50&&sizes[sizes.length-1]<=460,`region size range ${sizes[0]}..${sizes[sizes.length-1]}`)
 const our=regs.filter(r=>r.section==='ouroboros').map(r=>(r.ix1-r.ix0)*(r.iy1-r.iy0)),all=regs.map(r=>(r.ix1-r.ix0)*(r.iy1-r.iy0))
 ok(Math.max(...our)<Math.max(...all)/3,'ouroboros only in small halls')
 const fab=regs.filter(r=>r.section==='fabled')
 ok(fab.every(r=>Math.max(r.x1-r.x0,r.y1-r.y0)<=140),'fabled halls small')
 ok(fab.every(r=>Math.hypot((r.x0+r.x1)/2,(r.y0+r.y1)/2)>=1200),'fabled far from spawn')
 report[`fabledNearest:${seed}`]=Math.round(Math.min(...fab.map(r=>Math.hypot((r.ix0+r.ix1)/2,(r.iy0+r.iy1)/2))))
 // belts between neighbouring halls 12–30 m
 let minGap=1e9,maxGap=0
 for(const a of regs.slice(0,400))for(const b of regs){
  if(a===b)continue
  const ovY=Math.min(a.iy1,b.iy1)-Math.max(a.iy0,b.iy0),ovX=Math.min(a.ix1,b.ix1)-Math.max(a.ix0,b.ix0)
  if(ovY>10&&b.ix0>a.ix1){const g=b.ix0-a.ix1;if(g<40){minGap=Math.min(minGap,g);maxGap=Math.max(maxGap,g)}}
  if(ovX>10&&b.iy0>a.iy1){const g=b.iy0-a.iy1;if(g<40){minGap=Math.min(minGap,g);maxGap=Math.max(maxGap,g)}}
 }
 report[`belt:${seed}`]=[minGap,maxGap]
 ok(minGap>=12&&maxGap<=30,`belt width ${minGap}..${maxGap}`)
}

// 2. connectivity: every floor tile in a 2.4 km window reachable from the arrival point
for(const seed of [20261006,7]){
 const R=1200,N=2*R,f=new Uint8Array(N*N)
 for(let y=0;y<N;y++)for(let x=0;x<N;x++)f[y*N+x]=l1PlanTile(seed,x-R,y-R).floor?1:0
 const s=(R+15)*N+R+15;ok(f[s]===1,`spawn floor ${seed}`)
 const q=new Int32Array(N*N);let h=0,t=0;q[t++]=s;f[s]=2
 while(h<t){const c=q[h++],x=c%N;for(const n of [x>0?c-1:-1,x<N-1?c+1:-1,c-N,c+N])if(n>=0&&n<N*N&&f[n]===1){f[n]=2;q[t++]=n}}
 let un=0;for(let y=300;y<N-300;y++)for(let x=300;x<N-300;x++)if(f[y*N+x]===1)un++
 report[`unreached:${seed}`]=un
 ok(un===0,`connectivity ${seed}: ${un} unreachable floor tiles`)
 const r=l1RegionAt(seed,15,15);ok(r?.section==='parking','spawn in 天鹰段 hall')
}

// 3. every hall has ≥3 doors, every door joins hall floor to path floor
{
 const seed=20261006,regs=l1PlanRegions(seed,-1200,-1200,1200,1200).filter(r=>r.ix0>-1100&&r.ix1<1100&&r.iy0>-1100&&r.iy1<1100)
 let bad=0,badDoor=0
 for(const r of regs){
  const ds=l1PlanDoors(seed,r.ix0-1,r.iy0-1,r.ix1+2,r.iy1+2).filter(d=>d.region===r.id)
  if(ds.length<3)bad++
  for(const d of ds){
   const nx=d.dir===0?1:d.dir===1?-1:0,ny=d.dir===2?1:d.dir===3?-1:0
   const hall=l1PlanTile(seed,d.x+nx,d.y+ny),path=l1PlanTile(seed,d.x-nx,d.y-ny)
   if(!hall.floor||hall.style==='maintenance'||!path.floor||path.style!=='maintenance')badDoor++
  }
 }
 ok(bad===0,`halls with <3 doors: ${bad}`);ok(badDoor===0,`doors not joining hall and path: ${badDoor}`)
 const rooms=l1PlanRooms(seed,-1200,-1200,1200,1200),types:Record<string,number>={}
 for(const r of rooms)types[r.type]=(types[r.type]??0)+1
 report.rooms=types;ok(rooms.length>100&&Object.keys(types).length>=6,'小径 rooms of all wiki types')
}

// 4. chunk generation over a 20×20 chunk window: deterministic, no throw, mechanics
{
 const seed=20261006;let pathLoot=0,hallLoot=0,pathEnt=0,hallEnt=0,pathTiles=0,hallTiles=0,doors=0,outposts=0
 for(let cy=-10;cy<10;cy++)for(let cx=-10;cx<10;cx++){
  let c
  try{c=genL1ChunkRaw(L1,seed,cx,cy)}catch(e){fails.push(`gen ${cx},${cy}: ${(e as Error).message}`);continue}
  if(cx===0&&cy===0){const d=genL1ChunkRaw(L1,seed,cx,cy);ok(JSON.stringify(d.l1)===JSON.stringify(c.l1),'determinism')}
  for(let i=0;i<1024;i++)if(c.tiles[i]===1){const p=l1PlanTile(seed,cx*32+i%32,cy*32+Math.floor(i/32)).style==='maintenance';if(p)pathTiles++;else hallTiles++}
  for(const s of c.structures)if(s.data?.loot){if(l1PlanTile(seed,s.x,s.y).style==='maintenance')pathLoot++;else hallLoot++}
  for(const e of c.entities){if(l1PlanTile(seed,e.x,e.y).style==='maintenance')pathEnt++;else hallEnt++}
  doors+=c.structures.filter(s=>s.kind==='inkdoor').length
  if(l1Outpost(seed,cx,cy))outposts++
  ok(c.l1?.styles.length===1024,'styles')
 }
 const lootDensity={path:+(pathLoot/pathTiles*1000).toFixed(2),hall:+(hallLoot/hallTiles*1000).toFixed(2)}
 const entDensity={path:+(pathEnt/pathTiles*1000).toFixed(2),hall:+(hallEnt/hallTiles*1000).toFixed(2)}
 report.lootPer1000Tiles=lootDensity;report.entitiesPer1000Tiles=entDensity;report.doors=doors;report.outposts=outposts
 ok(lootDensity.path<lootDensity.hall*.5,'path supplies scarce')
 // Compare unrounded densities; rounding 0.126 to 0.13 used to reject a valid ratio below 1/4.
 ok(pathEnt/pathTiles<=hallEnt/hallTiles*.25,'entities rare in paths')
 ok(doors>20,'doors generated');ok(outposts>=1,'settlement outposts')
 ok(l1LayoutVariant(seed,0,0)==='parking','spawn chunk variant')
}
console.log(JSON.stringify(report,null,1))
mkdirSync('reports/l1-v2',{recursive:true})
writeFileSync('reports/l1-v2/check.json',JSON.stringify({pass,fail:fails.length,fails,report},null,1))
console.log(`L1 v2: ${pass} passed, ${fails.length} failed`);if(fails.length){console.log(fails.slice(0,20).join('\n'));process.exit(1)}
