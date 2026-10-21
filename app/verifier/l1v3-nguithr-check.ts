import * as THREE from 'three'
import {makeEntity} from '../src/game/entities'
import * as N from '../src/game/engine/nguithrAI'
import {canOccupy} from '../src/game/core/player'
import {ceilingHeightAt,floorHeight} from '../src/game/world/mapgen'
import {WALL_H} from '../src/game/renderer/shared'
import {l1FindReference} from '../src/game/world/l1Spatial'
import {l1BakeStats} from '../src/game/renderer/l1BakeQueue'
import {nguithrBudget,nguithrNest} from '../src/game/renderer/nguithrMesh'
const sleep=(ms=100)=>new Promise(r=>setTimeout(r,ms))
const until=async(f:()=>unknown,label:string,ms=180000)=>{const t=performance.now();while(!f()){if(performance.now()-t>ms)throw Error('Timeout '+label);await sleep()}}
export async function mount(app:any){
 const e=app.engine,r=app.renderer(),checks:string[]=[],records:any[]=[],frames:number[]=[],cpu:number[]=[];let ng:any,spot:any,last=0
 const ok=(v:unknown,msg:string)=>{if(!v)throw Error(msg);checks.push(msg)}
 const render=r.render;r.three.info.autoReset=false
 r.render=function(...args:any[]){const t=performance.now();if(last)frames.push(t-last);last=t;r.three.info.reset();try{return render.apply(this,args)}finally{cpu.push(performance.now()-t);if(frames.length>180)frames.shift();if(cpu.length>180)cpu.shift()}}
 const memory=()=>({...r.three.info.memory,programs:r.three.info.programs.length})
 const status=()=>({level:e.player.level,world:[e.player.x+e.map.inf.ox,e.player.y+e.map.inf.oy,e.player.z],camera:r.camera.position.toArray(),look:{...app.look},near:r.isNearWorldReady(e),chunks:r.chunkGroups.size,tasks:r.chunkBuilds.size,bake:l1BakeStats(),memory:memory(),draws:r.three.info.render.calls,triangles:r.three.info.render.triangles})
 document.querySelector<HTMLButtonElement>('[aria-label="收起开发者面板"]')?.click()
 e.dev.frozenAI=true;e.dev.god=true;e.dev.statLock=true;e.dev.phenOff.add('flicker');e.handsStowed=true;e.endBlackout();e.introT=0;e.input.mx=e.input.my=0
 const pose=(x:number,y:number,z:number,yaw:number,pitch:number,fov=70)=>{let inf=e.map.inf;e.player.x=x-inf.ox;e.player.y=y-inf.oy;e.updateInfiniteWindow();inf=e.map.inf;Object.assign(e.player,{x:x-inf.ox,y:y-inf.oy,z,vz:0,flashlight:false,crouching:false});Object.assign(app.look,{yaw,pitch,roll:0});r.setFov(fov,35)}
 const warm=async(final=false)=>{const t=performance.now();await until(()=>r.isNearWorldReady(e),'near geometry');await until(()=>r.chunkGroups.size===e.map.inf.chunks.size&&!r.chunkBuilds.size&&!l1BakeStats().initialQueued,'streaming');if(final)await until(()=>!l1BakeStats().active&&!l1BakeStats().queued,'final bake',360000);await sleep(1000);return performance.now()-t}
 const scene=async(name:string)=>{e.paused=true;e.player.flashlight=false;let a:any
  if(name==='spawn')a={x:15.5,y:15.5,z:0,yaw:.45,pitch:.02,fov:70}
  else a=l1FindReference(e.mapSeed,name,2400)
  ok(a,'generated reference exists: '+name);pose(a.x,a.y,a.z??0,a.yaw,a.pitch,a.fov??70)
  const ms=await warm();ok(!r.three.getContext().isContextLost(),'scene renders: '+name)
  const skins=new Set<string>();for(const {group}of r.chunkGroups.values())group.traverse((o:any)=>{if(o.userData.l1Skin)skins.add(o.userData.l1Skin)})
  const rec={name,anchor:a,readyMs:ms,skins:[...skins],...status()};records.push(rec);return rec
 }
 const setup=async()=>{
  await scene('spawn');const m=e.map,p=e.player,H=WALL_H[e.levelDef.gen]??3
  for(let d=0;d<28&&!spot;d++)for(let dy=-d;dy<=d&&!spot;dy++)for(let dx=-d;dx<=d&&!spot;dx++){
   if(Math.max(Math.abs(dx),Math.abs(dy))!==d)continue;const x=Math.floor(p.x)+dx+.5,y=Math.floor(p.y)+dy+.5,c=ceilingHeightAt(m,x,y,H,0)
   if(!Number.isFinite(c)||c>5||c<2.2)continue;let valid=true
   for(let z=-3.5;z<=3.5&&valid;z+=.5)for(let a=-3.5;a<=3.5&&valid;a+=.5)if(a*a+z*z<12.25)valid=canOccupy(m,x+a,y+z,.32,{z:0,band:0})&&Math.abs(floorHeight(m,x+a,y+z,0))<.02
   if(valid)spot={x,y,ceil:c}
  }
  ok(spot,'an actual hall has clear ceiling and floor around the nest')
  m.entities=[];for(const c of m.inf.chunks.values())c.entities=[]
  ng=makeEntity('nguithr',spot.x,spot.y,0);ng.id=990016;m.entities.push(ng)
  const key=`${Math.floor((spot.x+m.inf.ox)/32)},${Math.floor((spot.y+m.inf.oy)/32)}`;m.inf.chunks.get(key)?.entities.push(ng)
  N.nguithrState(e,ng);const t=performance.now()
  Object.assign(p,{x:spot.x+2.9,y:spot.y+1.3,flashlight:true,battery:100});app.look.yaw=Math.atan2(2.9,1.3);app.look.pitch=Math.atan2(spot.ceil-2.1,3.18)
  await until(()=>r.entityMeshes.get(ng.id)?.visible&&!ng.presentationPending,'new entity and nest GPU ready')
  const root=r.entityMeshes.get(ng.id),sk=root.userData.ngSpider.userData.nguithrRig.body
  ok(sk.isSkinnedMesh&&sk.visible&&!sk.userData.cpuProxy,'native GPU skin is visible, no CPU substitute')
  ok(nguithrNest(root.userData.ngNest)?.sacs.length===ng.ng.sacs.length,'all sacs are ready before first display')
  const rec={prepareMs:performance.now()-t,spot,scale:ng.ng.scale,sacs:ng.ng.sacs.length,budget:nguithrBudget(root),...status()};records.push(rec);return rec
 }
 const lookAt=(x:number,y:number,tx:number,ty:number,h:number)=>{const p=e.player;Object.assign(p,{x,y,z:0,vz:0,flashlight:true,battery:100});app.look.yaw=Math.atan2(x-tx,y-ty);app.look.pitch=Math.atan2(h-1.62,Math.hypot(tx-x,ty-y));app.look.roll=0}
 const state=()=>{const g=r.entityMeshes.get(ng?.id),rig=g?.userData.ngSpider?.userData.nguithrRig;return{mode:ng?.ng?.mode,clip:ng?.ng?.clip,clipT:ng?.ng?.clipT,sedation:e.ngRun.level,struggle:e.ngRun.struggle,visible:g?.visible,gpuSkin:rig?.body.visible,pose:rig?.bones[2].quaternion.toArray(),budget:g?nguithrBudget(g):null,resources:memory(),hp:e.player.hp,items:e.map.items.filter((i:any)=>i.type==='sedgland').length}}
 const poseEntity=async(clip:string)=>{
  e.paused=true;e.dev.frozenAI=true;const s=ng.ng
  Object.assign(e.ngRun,N.freshNgRun());s.mode=clip==='idle'?'ceiling':clip;s.clip=clip;s.t=2;s.clipT=clip==='descend'?3.8:clip==='feed'?1.3:clip==='cut'?2.55:2;s.speed=0;s.turn=0;s.target=null;s.sacIdx=0
  ng.x=spot.x;ng.y=spot.y;ng.z=0;s.yaw=-Math.PI/2+.35
  for(const c of s.sacs)c.state=clip==='idle'||clip==='cut'?'intact':'popped'
  r.entityMeshes.get(ng.id).userData.ngPoseInit=false
  const h=clip==='feed'||clip==='crawl'||clip==='dead'?.3:clip==='descend'?spot.ceil*.55:spot.ceil-.45
  lookAt(spot.x+2.8,spot.y-1.6,spot.x,spot.y,h)
  if(clip==='heavy')N.applyNguithrHeavy(e,ng.id)
  await sleep(350);const rec={name:'nguithr-'+clip,...state()};records.push(rec);return rec
 }
 const live=async()=>{
  const s=ng.ng;e.paused=false;e.dev.frozenAI=false;e.dev.god=false;e.dev.statLock=false
  Object.assign(e.ngRun,N.freshNgRun());Object.assign(s,{mode:'ceiling',clip:'idle',t:0,clipT:0,windowT:-1,target:null,speed:0,turn:0});ng.x=spot.x;ng.y=spot.y
  for(const c of s.sacs)c.state='intact'
  const w=N.nguithrSacWorld(e,s,0);lookAt(w.x,w.y,spot.x,spot.y,spot.ceil-.4)
  const trace:any[]=[];let prev='',sawLight=false,sawHeavy=false,sawDescend=false,sawFeed=false;const t=performance.now()
  await until(()=>{const st=state(),sig=st.mode+':'+st.sedation;if(sig!==prev){trace.push({ms:performance.now()-t,...st});prev=sig}
   sawLight||=st.sedation==='light';sawHeavy||=st.sedation==='heavy';sawDescend||=st.mode==='descend';sawFeed||=st.mode==='feed'
   return sawFeed||e.over
  },'live cut, sedation, descent and feeding',90000)
  ok(sawLight&&sawHeavy&&sawDescend&&sawFeed,'real step loop reaches light/heavy sedation, descent, and feeding')
  await until(()=>e.player.hp<100,'first feeding damage tick',5000)
  ok(e.player.hp<100,'live feeding deals real damage')
  e.dev.god=true;e.dev.statLock=true;const rec={name:'live',trace,...state()};records.push(rec);return rec
 }
 const escape=async()=>{await until(()=>e.ngRun.level!=='heavy','real jump-key struggle',10000);ok(e.ngRun.level!=='heavy','keyboard struggle releases the player');e.paused=true;e.dev.frozenAI=true;const rec={name:'escaped',...state()};records.push(rec);return rec}
 const kill=async()=>{const before=e.map.items.filter((i:any)=>i.type==='sedgland').length;ng.hp=0;e.killCheck(ng);ok(e.map.items.filter((i:any)=>i.type==='sedgland').length===before+1,'real death creates one sedgland drop');return state()}
 const sample=async()=>{const rounds=[];const q=(v:number[],p:number)=>v.slice().sort((a,b)=>a-b)[Math.floor((v.length-1)*p)];for(let k=0;k<5;k++){await sleep(1600);rounds.push({median:q(frames.slice(-90),.5),p95:q(frames.slice(-90),.95),cpuMedian:q(cpu.slice(-90),.5),cpuP95:q(cpu.slice(-90),.95),...memory(),draws:r.three.info.render.calls,triangles:r.three.info.render.triangles})}return{rounds,scope:'Actual App true-headless native GPU frame cadence; background bake may still run',bake:l1BakeStats()}}
 const cycles=async()=>{
  e.paused=true;e.dev.frozenAI=true;e.particles=[];const samples:any[]=[]
  const remove=()=>{e.map.entities=e.map.entities.filter((q:any)=>q.id!==ng.id);for(const c of e.map.inf.chunks.values())c.entities=c.entities.filter((q:any)=>q.id!==ng.id)}
  remove();await until(()=>!r.entityMeshes.has(ng.id),'remove first test entity');await sleep(350)
  for(let k=0;k<6;k++){
   ng=makeEntity('nguithr',spot.x,spot.y,0);ng.id=990017+k;N.nguithrState(e,ng);e.map.entities.push(ng)
   await until(()=>r.entityMeshes.get(ng.id)?.visible&&!ng.presentationPending,'cycle model upload');await sleep(150)
   const shown=memory();remove();await until(()=>!r.entityMeshes.has(ng.id),'cycle unload');await sleep(350);samples.push({shown,empty:memory()})
  }
  const stable=samples.slice(-3).map(v=>JSON.stringify(v.empty));ok(new Set(stable).size===1,'last three spawn/recycle rounds retain stable geometry, textures and programs')
  records.push({name:'resource-cycles',samples});return samples
 }
 return{scene,setup,poseEntity,live,escape,kill,sample,state,status,warm,cycles,summary:()=>({checks,records,status:status()})}
}
