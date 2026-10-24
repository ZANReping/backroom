import {drawL7Map,l7MapCacheStats,clearL7MapRenderCache} from '../src/game/content/l7Map'
import {drawL7Map as baseline} from './l7-map-baseline'
import {requestDevMapPreview,devMapTeleport} from '../src/game/engine/devMap'
import {floorHeight} from '../src/game/world/mapgen'
const sleep=(ms=100)=>new Promise(r=>setTimeout(r,ms))
const until=async(fn:()=>unknown,label:string,limit=60000)=>{const t=performance.now();while(!fn()){if(performance.now()-t>limit)throw Error('Timeout '+label);await sleep()}}
export async function mount(app:any){
 const e=app.engine,r=app.renderer(),checks:string[]=[],records:any[]=[]
 const ok=(value:unknown,message:string)=>{if(!value)throw Error(message);checks.push(message)}
 const keyMap=()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'m',code:'KeyM',bubbles:true}))
 const clear=()=>{e.map.entities=[];for(const c of e.map.inf?.chunks.values()??[])c.entities=[]}
 const ready=()=>r.isNearWorldReady(e)&&!document.querySelector('.loading-screen')
 const stats=(c:Element|null)=>c?.getAttribute('data-l7-bathymetry')?JSON.parse(c.getAttribute('data-l7-bathymetry')!):null
 const world=()=>({x:e.player.x+e.map.inf.ox,y:e.player.y+e.map.inf.oy,z:e.player.z})
 const overview=async()=>{e.handsStowed=true;e.dev.frozenAI=true;e.dev.god=true;e.dev.statLock=true;e.dev.bright=false;e.loadLevel(7,{mapSeed:424242,firstVisit:false});e.introT=0;e.over=false;e.transition=null;e.dev.mapReveal=true;app.look.yaw=0;app.look.pitch=-.1;await until(()=>ready()&&!e.paused,'L7');clear();await sleep(300);return status()}
 const status=()=>({level:e.player.level,player:world(),floor:e.player.floor,chunks:e.map.inf.chunks.size,cache:l7MapCacheStats(),memory:{...r.three.info.memory}})
 const maps=async()=>{if(e.player.level!==7)await overview();await until(()=>stats(document.querySelector('[data-minimap]'))?.contours>0,'minimap');keyMap();await until(()=>document.querySelector('[data-world-map]'),'big map');const c=document.querySelector('[data-world-map]')as HTMLCanvasElement;await until(()=>stats(c)?.contours>0,'bathymetry');ok(c.width===480,'Original big map opens at full size');ok(document.querySelector('[data-l7-map-legend]'),'Existing depth-band legend remains in the big map');return{mini:stats(document.querySelector('[data-minimap]')),big:stats(c),...status()}}
 const performance=async()=>{
  const inf=e.map.inf,preview=await requestDevMapPreview(e,{x:e.player.x+inf.ox,y:e.player.y+inf.oy,span:244,floor:0},new AbortController().signal)
  const c=document.createElement('canvas');c.width=c.height=480;const g=c.getContext('2d')!,rows:any[]=[]
  for(const kind of ['mini','big','wide']as const){const span=kind==='mini'?80:kind==='wide'?240:120,size=kind==='mini'?140:480,scale=size/span,view={x0:e.player.x-span/2,y0:e.player.y-span/2,x1:e.player.x+span/2,y1:e.player.y+span/2,scale,mini:kind==='mini',preview}
   const paint=(fn:typeof drawL7Map,v=view)=>{g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,480,480);g.translate(-v.x0*scale,-v.y0*scale);return fn(g,e,v)}
   const oldStart=window.performance.now(),baseStats=paint(baseline),coldBaselineMs=window.performance.now()-oldStart;clearL7MapRenderCache();const coldStart=window.performance.now(),newStats=paint(drawL7Map),coldMs=window.performance.now()-coldStart
   ok(baseStats.maxDepth===newStats.maxDepth&&baseStats.band===newStats.band&&baseStats.known===newStats.known,kind+' preserves discovered depths and bands')
   const measure=(fn:typeof drawL7Map,moving:boolean)=>{const rounds:any[]=[];for(let round=0;round<5;round++){const times:number[]=[],roundStart=window.performance.now();for(let i=0;i<25;i++){const v=moving?{...view,x0:view.x0+i*.18,x1:view.x1+i*.18}:view;const t=window.performance.now();paint(fn,v);times.push(window.performance.now()-t)}times.sort((a,b)=>a-b);rounds.push({median:times[12],p95:times[23],mean:(window.performance.now()-roundStart)/25})}return rounds}
   const before=measure(baseline,false),after=measure(drawL7Map,false),beforePan=measure(baseline,true),afterPan=measure(drawL7Map,true)
   rows.push({kind,coldBaselineMs,coldMs,before,after,beforePan,afterPan,stats:newStats,cache:l7MapCacheStats()})
   ok(after.map(x=>x.median).sort((a,b)=>a-b)[2]<before.map(x=>x.median).sort((a,b)=>a-b)[2]*.7,kind+' steady chart draw is at least 30% faster')
   await sleep(50)
  }
  records.push({performance:rows});return rows
 }
 const loading=async()=>{
  const before={chunks:e.map.inf.chunks.size,items:e.map.items.length,explored:Array.from(e.explored).join(',')},view={x:608,y:-608,span:244,floor:0},points:any[]=[],controller=new AbortController(),start=window.performance.now();let cancelled=false
  await requestDevMapPreview(e,view,controller.signal,p=>{points.push({ms:window.performance.now()-start,cells:p.cells.length});if(p.cells.length>0&&!cancelled){cancelled=true;controller.abort()}}).then(()=>{},error=>{if(error.name!=='AbortError')throw error})
  ok(cancelled,'Real worker can cancel after publishing an initial terrain batch')
  const resumed:any[]=[],resumeAt=window.performance.now(),data=await requestDevMapPreview(e,view,new AbortController().signal,p=>resumed.push({ms:window.performance.now()-resumeAt,cells:p.cells.length}))
  ok(resumed[0].cells>0,'New preview immediately restores completed terrain from an aborted request')
  const fullMs=window.performance.now()-resumeAt,reopenAt=window.performance.now(),again=await requestDevMapPreview(e,view,new AbortController().signal),reopenMs=window.performance.now()-reopenAt
  ok(again.cells.length===data.cells.length&&reopenMs<30,'Reopening already loaded remote bathymetry uses the cache')
  ok(e.map.inf.chunks.size===before.chunks&&e.map.items.length===before.items&&Array.from(e.explored).join(',')===before.explored,'Remote bathymetric previews do not instantiate terrain or alter exploration')
  const row={points,resumed,fullMs,reopenMs,cells:data.cells.length,...status()};records.push(row);return row
 }
 const clickTarget=()=>{const c=document.querySelector('[data-world-map]')as HTMLCanvasElement,b=c.getBoundingClientRect(),p=world(),x=b.x+b.width/2+(64.5-p.x)*4,y=b.y+b.height/2+(35.5-p.y)*4;ok(document.elementFromPoint(x,y)===c,'Right-click target is on the map canvas, clear of floor buttons');return{x,y,target:{x:64.5,y:35.5}}}
 const teleport=async()=>{await until(()=>Math.hypot(world().x-64.5,world().y-35.5)<3.01,'right-click teleport');await until(ready,'teleported geometry');clear();const p=e.player,bed=floorHeight(e.map,p.x,p.y,0);ok(p.floor===0&&Math.abs(p.z-bed-.02)<.001&&bed< -20,'Right-clicking the bathymetric map lands on the actual deep seabed from cabin floor 2F');ok(e.submerged&&e.inLiquid===1&&!e.swim.out,'Teleport sets diving state without retaining an old mantle');return{...status(),bed}}
 const far=async()=>{const target={x:-340.5,y:-240.5,floor:1},start=window.performance.now();ok(await devMapTeleport(e,target),'Distant negative-coordinate L7 map teleport succeeds');await until(ready,'negative target geometry');clear();const p=e.player,bed=floorHeight(e.map,p.x,p.y,0);ok(Math.abs(p.z-bed-.02)<.001&&p.floor===0&&Math.hypot(world().x-target.x,world().y-target.y)<3.01,'Distant teleport uses world coordinates and the rendered bed height');return{elapsedMs:window.performance.now()-start,bed,...status()}}
 const fog=async()=>{const root=document.querySelector('[data-world-map]')?.parentElement?.parentElement,input=root?.querySelector('input[type="checkbox"]')as HTMLInputElement;ok(input?.checked,'Original reveal toggle is active');input.click();await sleep(250);const c=document.querySelector('[data-world-map]')!,v=stats(c);ok(v.known<14400,'Cached revealed raster is hidden when exploration fog returns');input.click();await sleep(200);return{fogged:v,revealed:stats(c),...status()}}
 const close=async()=>{keyMap();await until(()=>!document.querySelector('[data-world-map]'),'close map');e.handsStowed=false;e.player.equip.offhand={type:'flashlight',count:1};e.syncPassives();e.player.flashlight=true;e.player.battery=100;app.look.yaw=-Math.PI/2;app.look.pitch=-.35;await sleep(350);return status()}
 const cleanup=async()=>{e.loadLevel(4,{mapSeed:424242,firstVisit:false});e.introT=0;e.dev.frozenAI=true;e.dev.god=true;e.dev.statLock=true;await until(ready,'cleanup');return status()}
 return{overview,maps,performance,loading,clickTarget,teleport,far,fog,close,cleanup,summary:()=>({checks,records,status:status()})}
}
