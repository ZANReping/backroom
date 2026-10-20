import {l1BakeStats} from '../src/game/renderer/l1BakeQueue'
import {canOccupy} from '../src/game/core/player'

const sleep=(ms=100)=>new Promise(r=>setTimeout(r,ms))
export async function mount(app:any,cases:any[]){
 const e=app.engine,r=app.renderer(),checks:string[]=[],records:any[]=[]
 const original=r.render.bind(r);r.three.info.autoReset=false
 const cpu:number[]=[],draws:number[]=[],triangles:number[]=[];r.render=(...args:any[])=>{r.three.info.reset();const start=performance.now();const v=original(...args);cpu.push(performance.now()-start);draws.push(r.three.info.render.calls);triangles.push(r.three.info.render.triangles);if(cpu.length>180){cpu.shift();draws.shift();triangles.shift()}return v}
 const status=()=>({world:[e.player.x+e.map.inf.ox,e.player.y+e.map.inf.oy,e.player.z],yaw:app.look.yaw,pitch:app.look.pitch,fov:r.camera.fov,draws:r.three.info.render.calls,triangles:r.three.info.render.triangles,memory:{...r.three.info.memory},bakes:l1BakeStats(),ao:r.photo.ao})
 const warm=async()=>{const start=performance.now();for(;;){const b=l1BakeStats();if(r.isNearWorldReady(e)&&!b.active&&!b.queued&&!r.chunkBuilds.size&&!r.retiredWorld.length&&!r.precompileRunning&&r.precompileTimer===null)break;if(performance.now()-start>200000)throw Error('Bake/compile timeout');await sleep()}await sleep(750)}
 const pose=(x:number,z:number,yaw:number,pitch:number,fov:number)=>{
  let inf=e.map.inf;e.player.x=x-inf.ox;e.player.y=z-inf.oy;e.updateInfiniteWindow();inf=e.map.inf
  Object.assign(e.player,{x:x-inf.ox,y:z-inf.oy,z:0,vz:0,floor:0,flashlight:false})
  Object.assign(app.look,{yaw,pitch,roll:0});r.setFov(fov,35);e.time=15;e.input.mx=e.input.my=0
 }
 const prepare=async()=>{
  e.devEnabled=true;e.dev.god=true;e.dev.frozenAI=true;e.dev.statLock=true;e.dev.phenOff.add('flicker');e.handsStowed=true;e.endBlackout();e.introT=0
  e.updateNpcs=()=>{}
  document.querySelector<HTMLButtonElement>('[aria-label="收起开发者面板"]')?.click()
  await warm();if(e.player.level!==1||r.three.getContext().isContextLost())throw Error('Actual L1 unavailable')
  checks.push('Actual App enters L1 with live renderer');return status()
 }
 const scene=async(name:string,ao=true)=>{
  const contact=name.endsWith('-contact'),base=name.replace(/-contact$/,''),p=cases.find(v=>v.name===base)
  if(!p)throw Error('Unknown case '+name)
  if(contact){const b=p.column,x=(b.min[0]+b.max[0])/2,z=(b.min[2]+b.max[2])/2;pose(x+2.2,z+2.5,Math.atan2(2.2,2.5),-.43,70)}
  else pose(p.ref.x,p.ref.y,p.ref.yaw,-.38,p.ref.fov)
  r.photo.ao=ao?1:0;r.composerKey='';await warm()
  if(!canOccupy(e.map,e.player.x,e.player.y,.32,{z:e.player.z,band:0}))throw Error('Blocked camera '+name)
  checks.push(name+' camera has player clearance')
  const record={name,ao,...status()};records.push(record);return record
 }
 const bench=async()=>{
  const percentile=(a:number[],q:number)=>a.slice().sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*q))]
  const rounds=[],update=e.update;e.update=()=>{};e.time=15
  await sleep(1800)
  try{
  for(let j=0;j<5;j++){
   cpu.length=draws.length=triangles.length=0;const frames:number[]=[];let last=await new Promise<number>(resolve=>requestAnimationFrame(resolve))
   for(let i=0;i<90;i++){const now=await new Promise<number>(resolve=>requestAnimationFrame(resolve));frames.push(now-last);last=now}
   rounds.push({median:percentile(frames,.5),p95:percentile(frames,.95),cpuMedian:percentile(cpu,.5),cpuP95:percentile(cpu,.95),drawsMedian:percentile(draws,.5),trianglesMedian:percentile(triangles,.5),...status()})
  }return{scope:'Fixed-state actual App renderer, headless native GPU; simulation frozen only for five warmed render samples. rAF cadence, not a GPU timer query.',rounds}
  }finally{e.update=update}
 }
 return {prepare,scene,bench,result:()=>({checks,records})}
}
