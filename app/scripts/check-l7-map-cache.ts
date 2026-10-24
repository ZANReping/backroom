import {createCanvas} from '@napi-rs/canvas'
import {mkdirSync,writeFileSync} from 'node:fs'
Object.assign(globalThis,{document:{createElement:()=>createCanvas(256,256)},window:{addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})},localStorage:{getItem:()=>null,setItem(){},removeItem(){}}})
const {Engine}=await import('../src/game/engine')
const {drawL7Map,l7MapCacheStats,clearL7MapRenderCache}=await import('../src/game/content/l7Map')
const {drawL7Map:baseline}=await import('../verifier/l7-map-baseline')
const {clearL7ChartRetention,l7ChartRetentionStats,recalledL7ChartCell}=await import('../src/game/world/l7ChartCache')
const {requestDevMapPreview,devMapTeleport}=await import('../src/game/engine/devMap')
const {l7BathymetryCell}=await import('../src/game/world/l7Bathymetry')
const {floorHeight}=await import('../src/game/world/mapgen')
let pass=0,fail=0
const ok=(value:unknown,message:string,detail?:unknown)=>{if(value)pass++;else{fail++;console.error('FAIL',message,detail??'')}}
const e=new Engine();e.devEnabled=true;e.dev.god=true;e.dev.statLock=true;e.dev.frozenAI=true;e.dev.mapReveal=true;e.seed=424242;e.loadLevel(7,{mapSeed:424242,firstVisit:false});e.emit=()=>{};e.persist=()=>{}
const canvas=createCanvas(480,480),ctx=canvas.getContext('2d')as any,panels=[]as any[]
const draw=(view:any)=>{canvas.width=480;canvas.height=480;ctx.translate(-view.x0*view.scale,-view.y0*view.scale);return drawL7Map(ctx,e,view)}
for(const size of [80,120]){
 const view={x0:24,y0:24,x1:24+size,y1:24+size,scale:480/size,mini:size===80}
 clearL7MapRenderCache();const b=baseline(ctx,e,view),a=draw(view),cold=l7MapCacheStats();ok(a.known===b.known&&a.maxDepth===b.maxDepth&&a.band===b.band&&a.contours===b.contours,'Cached chart preserves reference depths, bands and contour coverage', {a,b})
 const repeat=draw(view),warm=l7MapCacheStats();ok(warm.layers.hits>cold.layers.hits&&warm.contours.builds===cold.contours.builds,'Repeated chart draw reuses the raster and contour cache')
 e.player.z-=20;draw(view);ok(l7MapCacheStats().layers.builds===warm.layers.builds,'Changing player depth does not rebuild bathymetry');e.player.z+=20
 draw({...view,x0:view.x0+.1,x1:view.x1+.1});const fractional=l7MapCacheStats();draw({...view,x0:view.x0+.2,x1:view.x1+.2});ok(l7MapCacheStats().layers.hits>fractional.layers.hits,'Submetre motion inside the same tile bounds reuses its raster')
 const p0=l7MapCacheStats();draw({...view,x0:view.x0+8,x1:view.x1+8});const p1=l7MapCacheStats();ok(p1.contours.builds-p0.contours.builds<cold.contours.builds,'Nearby panning builds only newly exposed contour chunks')
 panels.push({size,cold,warm,stats:repeat})
}
e.dev.mapReveal=false;e.explored.fill(0);const view={x0:24,y0:24,x1:104,y1:104,scale:1.75,mini:true};ok(draw(view).known===0,'Normal fog does not expose a cached revealed chart')
e.explored[50*e.map!.w+50]=1;const once=draw(view);ok(once.known===1&&once.maxDepth!==null,'Newly explored cells invalidate the raster immediately')
const originalExplored=e.explored.slice();e.dev.mapReveal=true;draw(view);e.dev.mapReveal=false;ok(draw(view).known===1&&e.explored.every((v,i)=>v===originalExplored[i]),'Reveal toggles neither poison fog nor change exploration')
e.dev.mapReveal=true
for(let i=0;i<40;i++)draw({x0:i*31,y0:i*-17,x1:i*31+80,y1:i*-17+80,scale:1.75,mini:true})
ok(l7MapCacheStats().contours.entries<=l7MapCacheStats().contours.limit,'Derived contour retention is bounded')
ok(l7MapCacheStats(e).layers.current!<=6,'Raster retention stays bounded while panning through many views')

// Drive the production preview protocol with a deterministic worker transport.
// Deliberately abort after the first real terrain record, before batch completion.
clearL7ChartRetention()
let transport:any
class WorkerStub{
 onmessage:any;onerror:any;messages:any[]=[]
 constructor(){transport=this}
 postMessage(m:any){this.messages.push(m)}terminate(){}
 deliver(data:any){this.onmessage({data})}
}
Object.assign(globalThis,{Worker:WorkerStub})
const chunks=[...e.map!.inf!.chunks.keys()].join(','),items=e.map!.items.length,explored=e.explored.slice(),progress:number[]=[],abort=new AbortController()
const pending=requestDevMapPreview(e,{x:608,y:-608,span:96,floor:0},abort.signal,p=>progress.push(p.cells.length)).then(()=>false,err=>err.name==='AbortError')
const job=transport.messages.find((m:any)=>m.coords),first=job.coords[0],cell=l7BathymetryCell(e.map!.inf!.seed,first.cx,first.cy)
ok(job.coords.every((p:any)=>Math.hypot(p.cx*32+16-608,p.cy*32+16+608)>=Math.hypot(first.cx*32+16-608,first.cy*32+16+608)),'Remote preview prioritizes the centre')
transport.deliver({id:job.id,cell});await new Promise(r=>setTimeout(r,20));ok(progress.some(n=>n===1),'A completed cell is published before the full preview finishes')
abort.abort();ok(await pending,'Cancelling a preview rejects as an abort')
ok(!!recalledL7ChartCell(e.map!.inf!.seed,first.cx,first.cy),'An aborted request retains completed terrain')
const previousProgress=progress.length;transport.deliver({id:job.id,cell:l7BathymetryCell(e.map!.inf!.seed,first.cx+1,first.cy)});await new Promise(r=>setTimeout(r,20));ok(progress.length===previousProgress,'Cancelled work cannot publish stale updates')
const resumedProgress:number[]=[],resumed=requestDevMapPreview(e,{x:608,y:-608,span:96,floor:0},new AbortController().signal,p=>resumedProgress.push(p.cells.length)),next=transport.messages.filter((m:any)=>m.coords).at(-1)
ok(resumedProgress[0]===1&&!next.coords.some((p:any)=>p.cx===first.cx&&p.cy===first.cy),'Resuming displays retained cells immediately and requests only missing cells')
for(const at of next.coords)transport.deliver({id:next.id,cell:l7BathymetryCell(e.map!.inf!.seed,at.cx,at.cy)})
transport.deliver({id:next.id,done:true});const preview=await resumed
ok(preview.cells.length===job.coords.length&&preview.seed===e.map!.inf!.seed,'Progressive completion returns the full correct-seed preview')
ok([...e.map!.inf!.chunks.keys()].join(',')===chunks&&e.map!.items.length===items&&e.explored.every((v,i)=>v===explored[i]),'Preview loading never loads the live world, items or exploration')
const beforeMessages=transport.messages.length;await requestDevMapPreview(e,{x:608,y:-608,span:96,floor:0},new AbortController().signal);ok(transport.messages.length===beforeMessages,'Reopening a fully cached preview requires no worker job')
ok(l7ChartRetentionStats().cells<=l7ChartRetentionStats().limit,'Retained raw bathymetry has a fixed size limit')
const abortCached=new AbortController();const abortedCached=await requestDevMapPreview(e,{x:608,y:-608,span:96,floor:0},abortCached.signal,()=>abortCached.abort()).then(()=>false,error=>error.name==='AbortError');ok(abortedCached,'An immediate abort during cached preview publication still rejects')
delete (globalThis as any).Worker

const teleports=[]as any[]
for(const target of [{x:-10.5,y:15.5,floor:1},{x:64.5,y:15.5,floor:0},{x:-340.5,y:-240.5,floor:1}]){
 e.swim.vx=3;e.swim.cy=4;e.swim.bendsT=9;e.swim.out={t:0,sx:e.player.x,sy:e.player.y,sz:e.player.z,tx:e.player.x+1,ty:e.player.y,tz:0};e.ride={t:0}as any
 const success=await devMapTeleport(e,target),m=e.map!,p=e.player,ground=floorHeight(m,p.x,p.y,0),world={x:p.x+m.inf!.ox,y:p.y+m.inf!.oy,z:p.z}
 ok(success&&Math.hypot(world.x-target.x,world.y-target.y)<=3.001,'Developer L7 map teleport reaches the selected terrain neighbourhood',target)
 ok(Math.abs(p.z-ground-.02)<1e-6&&p.floor===0&&p.z<0,'L7 map teleport lands on the rendered seabed, including from the cabin floor',{target,world,ground})
 ok(e.inLiquid===1&&e.submerged&&e.swim.vx===0&&e.swim.cy===0&&!e.swim.out&&e.swim.bendsT===0&&!e.ride,'Seabed teleport updates water state and clears stale swimming/script motion')
 teleports.push({target,success,world,ground})
}
e.devEnabled=false;const p0={x:e.player.x,y:e.player.y,z:e.player.z};ok(!await devMapTeleport(e,{x:100,y:100,floor:0})&&JSON.stringify(p0)===JSON.stringify({x:e.player.x,y:e.player.y,z:e.player.z}),'Map teleport stays disabled outside developer mode')
mkdirSync('reports/l7-map-performance-20261022',{recursive:true});writeFileSync('reports/l7-map-performance-20261022/checks.json',JSON.stringify({pass,fail,panels,progress,resumedProgress,teleports,cache:l7MapCacheStats()},null,2));console.log(JSON.stringify({pass,fail,cache:l7MapCacheStats()}));if(fail)process.exitCode=1
