// Deliberately isolated from App and its save slots. No save/newRun side effects.
const query=new URLSearchParams(location.search),before=query.has('before');
const root=query.get('baseline')==='v2'?'/.cache/l0-v2-baseline/src/game':before?'/.cache/l0-before/src/game':'/src/game';
await import(/* @vite-ignore */root+'/world/mapgen.ts');
const {storage}=await import(/* @vite-ignore */root+'/core/storage.ts');
const isolated=new Map<string,string>();storage.get=(k:string)=>isolated.get(k)??null;storage.set=(k:string,v:string)=>{isolated.set(k,v)};storage.remove=(k:string)=>{isolated.delete(k)};
const [{Engine},{getRenderer,look},{levelDefOf,LEVELS,OUTPOST_LEVEL_DEFS}]=await Promise.all([
  import(/* @vite-ignore */root+'/engine.ts'),import(/* @vite-ignore */root+'/renderer/index.ts'),import(/* @vite-ignore */root+'/levels/index.ts')]);
const canvas=document.querySelector('canvas')!,eng=new Engine(),r=getRenderer(canvas);
eng.seed=20261006;eng.dev.god=true;eng.dev.frozenAI=true;eng.dev.statLock=true;eng.paused=true;
r.resize(innerWidth,innerHeight,1);r.setTextureQuality(2);r.setLightMode(query.get('mode')||'realistic');r.setBloomFx(true);r.setLightShadows(2);
r.setSceneLightLimit(16);
r.three.info.autoReset=false;
let frames:number[]=[],last=performance.now(),label='',active=true,frozen=true,fixedRenderTime=false,fixedTime=0,buildStart=performance.now(),buildPeak=0,ao=1;
const gl=r.three.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');
let cpuFrames:number[]=[],gpuFrames:number[]=[],sampling=false,sampleId=0;
const queries:{query:WebGLQuery;id:number}[]=[];
function startGpu(){
 while(queries.length&&gl.getQueryParameter(queries[0].query,gl.QUERY_RESULT_AVAILABLE)){
  const q=queries.shift()!;if(q.id===sampleId&&!gl.getParameter(timer.GPU_DISJOINT_EXT))gpuFrames.push(gl.getQueryParameter(q.query,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q.query);
 }
 if(!sampling||!timer||queries.length>=8)return null;const q=gl.createQuery()!;gl.beginQuery(timer.TIME_ELAPSED_EXT,q);return q;
}
const quantile=(values:number[],q:number)=>{const a=[...values].sort((a,b)=>a-b);return a.length?a[Math.min(a.length-1,Math.floor(a.length*q))]:null};
async function scene(level=0,variant='open'){
  eng.loadLevel(level,{mapSeed:20261006,firstVisit:false});eng.introT=0;eng.player.flashlight=false;
  if(level===0&&variant!=='open')eng.devGotoVariant(variant);
  look.yaw=.42;look.pitch=.015;look.roll=0;label=level+':'+variant;frames=[];
  r.setFov(75);fixedRenderTime=false;frozen=true;eng.paused=true;eng.dev.god=true;eng.dev.statLock=true;buildStart=performance.now();buildPeak=0;
  document.querySelector('#status')!.textContent=label;
  return {level,variant,x:eng.player.x+(eng.map.inf?.ox??0),y:eng.player.y+(eng.map.inf?.oy??0)};
}
function stats(){const a=[...frames].sort((a,b)=>a-b),gl=r.three.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return{label,median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:Math.max(...a),cpuMedian:quantile(cpuFrames,.5),cpuP95:quantile(cpuFrames,.95),gpuMedian:quantile(gpuFrames,.5),gpuP95:quantile(gpuFrames,.95),gpuSamples:gpuFrames.length,draws:r.three.info.render.calls,triangles:r.three.info.render.triangles,memory:{...r.three.info.memory},programs:r.three.info.programs.length,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)}}
// A chunk job can finish between frames while more chunks remain queued. Do
// not mistake that gap (or deferred GPU disposal) for a fully warmed scene.
function pendingWork(){
 const m=eng.map,inf=m.inf,p=eng.player;
 const reach=(r.fogEnabled?Math.min(r.camera.far,r.scene.fog?.far??60):r.camera.far)+32;
 const missing=inf?[...inf.chunks.values()].filter((c:any)=>{const x=c.cx*32-inf.ox,y=c.cy*32-inf.oy;return Math.max(x-p.x,0,p.x-x-32)**2+Math.max(y-p.y,0,p.y-y-32)**2<=reach*reach&&!r.chunkGroups.has(c.key)}).length:0;
 return{missing,chunk:!!r.cityChunkTask,finite:!!r.finiteTask,flash:!!r.flashWarmup,moth:!!r.mothWarmup,items:r.itemWarmup.jobs.size,compile:r.precompileRunning||r.precompileDirty||r.precompileTimer!==null,retired:r.retiredWorld.length,textures:r.retiredTextures.size};
}
async function warm(){
 const start=performance.now();let stableAt=start,previous='';
 while(true){
  const pending=pendingWork(),signature=JSON.stringify([r.chunkGroups.size,r.three.info.memory,r.three.info.programs.length]);
  const now=performance.now();
  if(Object.values(pending).some(Boolean)||signature!==previous){stableAt=now;previous=signature}
  if(now-start>=3000&&now-stableAt>=1000)return{elapsed:now-start,pending,groups:r.chunkGroups.size,memory:{...r.three.info.memory},programs:r.three.info.programs.length};
  if(now-start>60000)throw Error('Warmup timed out: '+JSON.stringify(pending));
  await new Promise(resolve=>setTimeout(resolve,100));
 }
}
(window as any).qa={eng,r,look,scene,stats,levels:[...LEVELS,...Object.values(OUTPOST_LEVEL_DEFS)].map((d:any)=>({id:d.id,name:d.name})),ready:false,warm,pendingWork,hide(){(document.querySelector('aside') as HTMLElement).style.display='none'},mode(v:string){r.setLightMode(v)},async sample(n=180){fixedRenderTime=false;frames=[];cpuFrames=[];gpuFrames=[];sampleId++;sampling=true;const until=performance.now()+1200;try{while(frames.length<n||performance.now()<until)await new Promise(resolve=>setTimeout(resolve,50));return stats()}finally{sampling=false}},async anchor(id:string){const m=await import(/* @vite-ignore */ root+'/world/l0Architecture.ts');const a=m.L0_PHOTO_ANCHORS.find((v:any)=>v.id===id);await scene(0);eng.player.x=a.x-eng.map.inf.ox;eng.player.y=a.y-eng.map.inf.oy;eng.updateInfiniteWindow();eng.player.z=a.z??0;for(const s of eng.map.structures)if(s.data?.l0Door&&a.doors?.includes(Number(s.data.deg))){s.data.open=1;s.solid=false}look.yaw=a.yaw;look.pitch=a.pitch;look.roll=a.roll??0;r.setFov(a.fov,35);eng.player.crouching=!!a.crouch;label=id;fixedRenderTime=true;return a}};
await scene(Number(query.get('level')??0),query.get('variant')??'open');
function frame(now:number){const elapsed=now-last,dt=Math.min(.05,elapsed/1000);frames.push(elapsed);if(r.cityChunkTask||r.finiteTask)buildPeak=Math.max(buildPeak,elapsed);last=now;if(frames.length>(sampling?10000:1000))frames.shift();if(!frozen){eng.input.mx=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));eng.input.my=Number(keys.has('KeyS'))-Number(keys.has('KeyW'));eng.input.sprint=keys.has('ShiftLeft');eng.input.crouch=keys.has('ControlLeft');eng.input.jump=keys.has('Space');r.applyView(eng);eng.update(dt)}if(fixedRenderTime)r.time=fixedTime;r.three.info.reset();const q=startGpu(),cpuStart=performance.now();r.render(canvas,eng,{grain:false,flicker:0,shake:false},dt);if(sampling)cpuFrames.push(performance.now()-cpuStart);if(q){gl.endQuery(timer.TIME_ELAPSED_EXT);queries.push({query:q,id:sampleId})}if(active)requestAnimationFrame(frame)}
const keys=new Set<string>();
requestAnimationFrame(frame);(window as any).qa.ready=true;
const qa=(window as any).qa;
qa.normal=async(seed=7391,x=16,y=16,yaw=.42)=>{
 eng.seed=seed;eng.loadLevel(0,{mapSeed:seed,firstVisit:false});eng.introT=0;eng.player.flashlight=false;eng.player.z=0;eng.player.crouching=false;
 eng.player.x=x-eng.map.inf.ox;eng.player.y=y-eng.map.inf.oy;eng.updateInfiniteWindow();
 const {canOccupy}=await import(/* @vite-ignore */root+'/core/player.ts');
 const free=(wx:number,wy:number)=>canOccupy(eng.map,wx-eng.map.inf.ox,wy-eng.map.inf.oy,.32,{z:0,crouch:false,band:0});
 if(!free(x,y)){outer:for(let d=.5;d<6;d+=.5)for(const [dx,dy]of [[d,0],[-d,0],[0,d],[0,-d]])if(free(x+dx,y+dy)){x+=dx;y+=dy;break outer}}
 eng.player.x=x-eng.map.inf.ox;eng.player.y=y-eng.map.inf.oy;look.yaw=yaw;look.pitch=-.08;look.roll=0;r.setFov(75);
 label=`normal:${seed}:${x},${y}`;fixedRenderTime=true;frozen=true;eng.paused=true;eng.dev.god=true;eng.dev.statLock=true;frames=[];buildStart=performance.now();buildPeak=0;
 return {seed,x,y,yaw,pitch:look.pitch,fov:r.camera.fov,canOccupy:free(x,y)};
};
qa.buildStats=()=>({elapsed:performance.now()-buildStart,maxFrame:buildPeak});
qa.freezeRenderTime=(time:number)=>{fixedRenderTime=true;fixedTime=time};
qa.moveTo=(x:number,y:number)=>{eng.player.x=x-(eng.map.inf?.ox??0);eng.player.y=y-(eng.map.inf?.oy??0);eng.updateInfiniteWindow();buildStart=performance.now();buildPeak=0};
qa.rtc=async()=>{const {verifyLocalRTC}=await import('./l0-rtc');return verifyLocalRTC()};
qa.functional=async()=>{const {verifyL0Runtime}=await import('./l0-runtime');return verifyL0Runtime(qa)};
qa.mapPreview=async()=>{const {verifyMapPreview}=await import('./l0-runtime');return verifyMapPreview(qa)};
qa.photoRegression=async()=>{const {verifyPhotoAO}=await import('./l0-photo');return verifyPhotoAO(r.three)};
qa.detail=async(id:string)=>{
 const poses:Record<string,number[]>={
  cabinet:[588.65,16.1,1.28,590,18.15,.62,48],
  chair:[591.25,15.8,1.05,590.37,16.95,.66,48],
  door:[591.7,13.85,1.35,591.7,11.94,1.18,53],
  lamp:[12.857,18.5,1.55,12.857,17.027,2.63,62],
  vent:[201.998,31.8,1.55,201.998,31.75,2.69,37],
  outlet:[589.1,12.8,.45,589.1,12.014,.335,38],
 };
 if(!poses[id])throw Error('Unknown detail '+id);
 await scene(0);const [x,y,eye,tx,ty,h,fov]=poses[id];qa.moveTo(x,y);eng.player.z=eye-1.55;
 look.yaw=Math.atan2(x-tx,y-ty);look.pitch=Math.atan2(h-eye,Math.hypot(tx-x,ty-y));look.roll=0;r.setFov(fov,35);label='detail:'+id;fixedRenderTime=true;
 return {id,x,y,eye,tx,ty,h,fov};
};
qa.red=async()=>{await qa.anchor('red');const {enterL0Red,tickL0}=await import('../src/game/engine/l0State');enterL0Red(eng);eng.time+=1;tickL0(eng,.1);look.yaw=0;look.pitch=0;label='sealed-red';return {x:eng.player.x+eng.map.inf.ox,y:eng.player.y+eng.map.inf.oy}};
qa.setFrozen=(value:boolean)=>{frozen=value;eng.paused=value;eng.dev.god=value;eng.dev.statLock=value;document.querySelector('#walk')!.textContent=value?'开始自由游玩':'冻结时间与状态'};
qa.condition=async(id:string)=>{
 const [level,condition]=id.split(':');await scene(Number(level));
 if(condition==='power-out'&&eng.map.inf){eng.map.inf.blackout=true;eng.blackoutT=100;}
 if(condition==='underwater'){const i=eng.map.liquid.findIndex((v:number)=>v===1);if(i>=0){eng.player.x=i%eng.map.w+.5;eng.player.y=Math.floor(i/eng.map.w)+.5;eng.player.z=-8;eng.submerged=true;eng.player.flashlight=true;}}
 if(condition==='rain'){const w=Number(level)===11?eng.l11Weather:eng.l10Weather;Object.assign(w,{kind:'rain',t:120,k:1,wetness:1});}
 if(condition==='night'){eng.time=1000;r.time=1000;}
 label=id;return {id,x:eng.player.x,y:eng.player.y,z:eng.player.z};
};
const select=document.querySelector<HTMLSelectElement>('#anchors')!;
if(!before){const {L0_PHOTO_ANCHORS}=await import('../src/game/world/l0Architecture');for(const a of L0_PHOTO_ANCHORS){const o=document.createElement('option');o.value=a.id;o.textContent=a.file;select.append(o)}select.onchange=()=>qa.anchor(select.value);}
document.querySelector<HTMLSelectElement>('#mode')!.onchange=e=>qa.mode((e.target as HTMLSelectElement).value);
document.querySelector('#walk')!.addEventListener('click',()=>qa.setFrozen(!frozen));
document.querySelector('#flash')!.addEventListener('click',()=>{eng.player.flashlight=!eng.player.flashlight});
document.querySelector('#ao')!.addEventListener('click',e=>{ao=(ao+1)%3;r.setPhotography?.(ao,12,18,'neutral');(e.target as HTMLElement).textContent='环境遮蔽：'+['关闭','半分辨率','高'][ao]});
document.querySelector('#hide')!.addEventListener('click',qa.hide);
canvas.addEventListener('click',()=>{if(!frozen)canvas.requestPointerLock()});
addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='KeyH')(document.querySelector('aside') as HTMLElement).style.display='';if(e.code==='KeyE')eng.input.interact=true;if(e.code==='KeyF')eng.player.flashlight=!eng.player.flashlight});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas){look.yaw-=e.movementX*.002;look.pitch=Math.max(-1.5,Math.min(1.5,look.pitch-e.movementY*.002))}});
addEventListener('resize',()=>r.resize(innerWidth,innerHeight,1));
export {};

