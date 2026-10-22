import * as THREE from 'three'
import {floorHeight} from '../src/game/world/mapgen'
import {drawL7Map} from '../src/game/content/l7Map'
import {requestDevMapPreview} from '../src/game/engine/devMap'
const sleep=(ms=100)=>new Promise(r=>setTimeout(r,ms))
const until=async(fn:()=>unknown,label:string,limit=45000)=>{const t=performance.now();while(!fn()){if(performance.now()-t>limit)throw Error('Timeout '+label);await sleep()}}
export async function mount(app:any){
 const e=app.engine,r=app.renderer(),checks:string[]=[],records:any[]=[]
 const ok=(v:unknown,s:string)=>{if(!v)throw Error(s);checks.push(s)}
 let pin:any=null,raf=0
 const tick=()=>{if(pin&&e.map){const p=e.player;p.x=pin.x-e.map.inf.ox;p.y=pin.y-e.map.inf.oy;p.z=pin.z;p.vz=0;app.look.yaw=pin.yaw;app.look.pitch=pin.pitch;p.facing=pin.facing}raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick)
 const aim=(x:number,y:number,z:number,tx:number,ty:number,tz:number)=>{pin={x,y,z,yaw:Math.atan2(x-tx,y-ty),pitch:Math.atan2(tz-z-1.62,Math.hypot(tx-x,ty-y)),facing:Math.atan2(ty-y,tx-x)};tickNow()}
 const tickNow=()=>{if(pin){e.player.x=pin.x-e.map.inf.ox;e.player.y=pin.y-e.map.inf.oy;e.player.z=pin.z;e.player.vz=0;app.look.yaw=pin.yaw;app.look.pitch=pin.pitch}}
 const clear=()=>{e.map.entities=[];for(const c of e.map.inf?.chunks.values()??[])c.entities=[]}
 const ready=()=>r.isNearWorldReady(e)&&!document.querySelector('.loading-screen')
 const reset=()=>{pin=null;e.dev.frozenAI=true;e.dev.god=true;e.dev.statLock=true;e.dev.bright=false;e.over=false;e.transition=null;e.introT=0;e.input.mx=e.input.my=0;e.input.attack=e.input.attackHeld=e.input.interact=false;e.usingItem=null}
 const status=()=>({level:e.player.level,player:{x:e.player.x+(e.map.inf?.ox??0),y:e.player.y+(e.map.inf?.oy??0),z:e.player.z},origin:[e.map.inf?.ox,e.map.inf?.oy],mode:r.lightMode,memory:{...r.three.info.memory},chunks:r.chunkGroups.size,tasks:r.chunkBuilds.size})
 const overview=async()=>{reset();e.loadLevel(7,{mapSeed:424242,firstVisit:false});reset();aim(-10,15,-15,15,15,-25);e.updateInfiniteWindow();tickNow();await until(ready,'L7 entry');clear();e.player.flashlight=true;e.player.battery=100;e.player.equip.offhand={type:'flashlight',count:1};e.syncPassives();await sleep(300);return status()}
 const boundary=(key:string,axis:'x'|'z',w:number)=>{
  const cg=r.chunkGroups.get(key),vs=new Map<number,number>();if(!cg)return vs
  cg.group.updateWorldMatrix(true,true)
  cg.group.traverse((o:any)=>{if(!o.isMesh||!o.material?.customProgramCacheKey?.().includes('l7seabed'))return;const p=o.geometry.attributes.position,v=new THREE.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);v.x+=e.map.inf.ox;v.z+=e.map.inf.oy;if(Math.abs(v[axis]-w)<1e-4)vs.set(Math.round((axis==='x'?v.z:v.x)*2)/2,v.y)}})
  return vs
 }
 const seams=async()=>{
  await overview();await until(()=>r.chunkBuilds.size===0,'initial streaming');await sleep(500)
  // Chunk (2,0) first builds at the edge of the 5x5 window. Moving east
  // exposes its old outer edge to a newly built chunk (3,0).
  aim(30,15,-50,64,15,-160);e.updateInfiniteWindow();tickNow();clear();await until(()=>ready()&&r.chunkGroups.has('2,0')&&r.chunkBuilds.size===0,'new neighbour');await sleep(400)
  const a=boundary('1,0','x',64),b=boundary('2,0','x',64);let gap=0,at=15,ha=0,hb=0,n=0
  for(const [z,y]of a){const y2=b.get(z);if(y2===undefined)continue;n++;if(Math.abs(y-y2)>gap){gap=Math.abs(y-y2);at=z;ha=y;hb=y2}}
  if(gap===0){at=15.5;ha=a.get(at)!;hb=b.get(at)!}
  const row={gapMetres:gap,samples:n,at:{x:64,y:at,ha,hb},...status()};records.push(row)
  ok(n>=60,'both real chunk meshes contain the shared boundary')
  const camX=63,camY=at+2,camZ=floorHeight(e.map,camX-e.map.inf.ox,camY-e.map.inf.oy,0)+.7
  aim(camX,camY,camZ,64.6,at,(ha+hb)/2);await sleep(900)
  // Baseline is intentionally measured before applying the correction.
  if(!location.search.includes('baseline=1'))ok(gap<.0001,'retained and new seabed vertices meet after streaming')
  return row
 }
 const keyMap=()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyM',key:'m',bubbles:true}))
 const mapStats=(c:Element|null)=>c?.getAttribute('data-l7-bathymetry')?JSON.parse(c.getAttribute('data-l7-bathymetry')!):null
 let mapPreview:any=null
 const maps=async()=>{
  aim(15,15,3,15,20,3);e.player.floor=1;e.updateInfiniteWindow();tickNow();clear();await until(ready,'chart origin');e.dev.mapReveal=true;await sleep(500)
  const mini=document.querySelector('[data-minimap]') as HTMLCanvasElement
  await until(()=>mapStats(mini)?.contours>0&&mapStats(mini)?.known===6400,'bathymetric minimap')
  ok(!document.querySelector('[data-l7-map-legend]'),'no legend is placed under the minimap')
  const beforeMini=mapStats(mini),beforeChunks=[...e.map.inf.chunks.keys()].join(','),beforeItems=e.map.items.length,beforeEntities=e.map.entities.length
  keyMap();await until(()=>document.querySelector('[data-world-map]'),'original inventory map');await sleep(150)
  const c=document.querySelector('[data-world-map]') as HTMLCanvasElement
  await until(()=>mapStats(c)?.contours>0,'original map contours')
  ok(c.width>=450,'big map opens at full width')
  ok(document.querySelector('[data-l7-map-legend]')?.textContent?.includes('午夜带'),'bathymetric band legend is in original big map')
  const minus=()=>[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='－')?.click()
  minus();await sleep(200);minus();await until(()=>mapStats(c)?.known>40000&&mapStats(c)?.missing===0,'wide chart lightweight previews');await sleep(300)
  const wide=mapStats(c)
  ok(wide.maxDepth>230&&wide.band==='深渊','wide chart is classified by deepest seabed, even at cabin height')
  const z0=pin.z;pin.z=-85;tickNow();await sleep(200);const deep=mapStats(c);pin.z=z0;tickNow()
  ok(deep.maxDepth===wide.maxDepth&&deep.band===wide.band,'chart bands stay the same when swimmer depth changes')
  const explorationBefore=Array.from(e.explored).join(''),chunkCount=e.map.inf.chunks.size
  const start=performance.now();mapPreview=await requestDevMapPreview(e,{x:600,y:-600,span:240,floor:0},new AbortController().signal)
  ok(e.map.inf.chunks.size===chunkCount&&[...e.map.inf.chunks.keys()].join(',')===beforeChunks,'remote chart preview does not load live chunks')
  ok(e.map.items.length===beforeItems&&e.map.entities.length===beforeEntities,'remote chart preview does not create loot or actors')
  ok(Array.from(e.explored).join('')===explorationBefore,'remote preview does not mark terrain explored')
  ok(mapPreview.cells.every((a:any)=>a.seaFloor?.length===1024&&!a.entities&&!a.items&&!a.structures),'worker returns terrain-only depth records')
  const out={minimap:beforeMini,wide,remotePreviewMs:performance.now()-start,remoteCells:mapPreview.cells.length,width:c.width,...status()};records.push(out);return out
 }
 const mapFog=async()=>{
  const box=document.querySelector('[data-world-map]')?.parentElement?.parentElement
  const input=box?.querySelector('input[type="checkbox"]') as HTMLInputElement
  ok(input?.checked,'original reveal checkbox is active');input.click();await sleep(300)
  const c=document.querySelector('[data-world-map]')!
  await until(()=>mapStats(c)&&mapStats(c).known<40000,'map fog restored')
  const stats=mapStats(c);ok(stats.known>0&&stats.known<10000,'fogged map shows only discovered terrain');return stats
 }
 const stream=async()=>{
  if(document.querySelector('[data-world-map]'))keyMap();await until(()=>!document.querySelector('[data-world-map]'),'close original map')
  const rows:any[]=[]
  for(const [x,y]of [[-70,15],[-10,-70],[35,-10],[35,35],[15,15]]){
   aim(x,y,-25,x+4,y+5,-35);e.updateInfiniteWindow();tickNow();clear();await until(()=>ready()&&r.chunkBuilds.size===0,'streaming '+x+','+y);await sleep(180)
   let gap=0,n=0
   for(const [key]of r.chunkGroups){const [cx,cy]=key.split(',').map(Number)
    for(const axis of ['x','z'] as const){const other=axis==='x'?`${cx+1},${cy}`:`${cx},${cy+1}`;if(!r.chunkGroups.has(other))continue
     const edge=(axis==='x'?cx+1:cy+1)*32,a=boundary(key,axis,edge),b=boundary(other,axis,edge)
     for(const [u,h]of a){const h2=b.get(u);if(h2===undefined)continue;gap=Math.max(gap,Math.abs(h-h2));n++}
    }
   }
   ok(n>500&&gap<.0001,'all real seams align at streamed origin '+x+','+y+' ('+n+' vertices, '+gap+'m)')
   rows.push({x,y,n,gap,...status()})
  }
  const z=floorHeight(e.map,63-e.map.inf.ox,17.5-e.map.inf.oy,0)+.7;aim(63,17.5,z,64.6,15.5,-141.58493041992188);await sleep(500);return rows
 }
 const frames=async()=>{
  await until(()=>r.chunkBuilds.size===0,'settled performance window');await sleep(900)
  const rounds:any[]=[]
  for(let round=0;round<5;round++){const a:number[]=[];let last=performance.now();for(let i=0;i<120;i++){await new Promise(requestAnimationFrame);const now=performance.now();a.push(now-last);last=now}a.sort((a,b)=>a-b);rounds.push({median:a[60],p95:a[114]})}
  e.dev.mapReveal=true;const p0=e.player,inf=e.map.inf;const currentPreview=await requestDevMapPreview(e,{x:p0.x+inf.ox,y:p0.y+inf.oy,span:244,floor:0},new AbortController().signal)
  const paint=document.createElement('canvas');paint.width=paint.height=480;const g=paint.getContext('2d')!,p=e.player
  const drawRounds:any[]=[]
  for(const span of [80,120,240]){const times:number[]=[];for(let i=0;i<5;i++){const t=performance.now();drawL7Map(g,e,{x0:p.x-span/2,y0:p.y-span/2,x1:p.x+span/2,y1:p.y+span/2,scale:(span===80?140:480)/span,mini:span===80,preview:currentPreview});times.push(performance.now()-t)}times.sort((a,b)=>a-b);drawRounds.push({span,median:times[2],max:times[4]})}
  return{rounds,drawRounds,...status()}
 }
 const cleanup=async()=>{pin=null;cancelAnimationFrame(raf);reset();e.loadLevel(4,{mapSeed:424242,firstVisit:false});reset();await until(ready,'cleanup L4');clear();await sleep(700);return status()}
 const mapSnapshot=()=>{const c=document.querySelector('[data-world-map]') as HTMLCanvasElement;if(!c)return null;const rect=c.getBoundingClientRect(),pixels=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let hash=0;for(let i=0;i<pixels.length;i+=13)hash=(Math.imul(hash,31)+pixels[i])|0;return{rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},hash,stats:mapStats(c),chunks:e.map.inf.chunks.size,player:{x:e.player.x,y:e.player.y}}}
 return{seams,maps,mapSnapshot,mapFog,stream,frames,cleanup,summary:()=>({checks,records,status:status()})}
}
