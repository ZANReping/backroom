import { canFlyOccupy } from '../src/game/core/flight'
import { floorHeight } from '../src/game/world/mapgen'
import * as THREE from 'three'
import { TRADERS_DRESSING } from '../src/game/content/tradersDressing'
import { l02RestroomOf } from '../src/game/world/l02Layout'
import { resetMoveVelocity } from '../src/game/engine/moveTuning'

export async function mount(api:any){
 const e=api.engine,r=api.renderer(),look=api.look,checks:any[]=[],before=new URLSearchParams(location.search).get('stage')==='before'
 let lastFrame={cpu:0,calls:0,triangles:0}
 const render=r.render
 r.render=function(...args:any[]){const at=performance.now(),auto=this.three.info.autoReset;this.three.info.autoReset=false;this.three.info.reset();try{return render.apply(this,args)}finally{lastFrame={cpu:performance.now()-at,calls:this.three.info.render.calls,triangles:this.three.info.render.triangles};this.three.info.autoReset=auto}}
 const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))
 const until=async(fn:()=>boolean,label:string,ms=150000)=>{const at=performance.now();while(!fn()){if(performance.now()-at>ms)throw Error('Timeout '+label);await sleep(100)}}
 const ok=(value:any,label:string)=>{checks.push({ok:!!value,label});if(!value)throw Error(label)}
 const stats=()=>({level:e.player.level,pos:[e.player.x,e.player.y,e.player.z],camera:r.camera.position.toArray(),yaw:look.yaw,pitch:look.pitch,mirrors:r.mirrors?{...r.mirrors.stats}:null,memory:{...r.three.info.memory},calls:lastFrame.calls,triangles:lastFrame.triangles,cpu:lastFrame.cpu,checks:[...checks]})
 const go=(x:number,y:number,z=0)=>{e.seating=e.ride=e.climb=e.porchDrop=e.onStairs=null;Object.assign(e.player,{x:x-(e.map.inf?.ox??0),y:y-(e.map.inf?.oy??0),z,vz:0,floor:0,crouching:false});Object.assign(e.input,{mx:0,my:0,attack:false,jump:false,crouch:false,interact:false});e.introT=0;resetMoveVelocity(e.mv);e.moveIt.acc=0;e.updateInfiniteWindow()}
 const aim=(x:number,y:number,z=1.6)=>{const dx=x-(e.map.inf?.ox??0)-e.player.x,dy=y-(e.map.inf?.oy??0)-e.player.y;e.player.facing=Math.atan2(dy,dx);look.yaw=-e.player.facing-Math.PI/2;look.pitch=Math.atan2(z-e.player.z-1.55,Math.hypot(dx,dy));look.roll=0}
 const ready=()=>r.builtMap===e.map&&r.isNearWorldReady(e)&&!r.finiteTask&&!r.pendingEnvProbe
 const load=async(level:number,seed=20261027)=>{e.loadLevel(level,{mapSeed:seed,firstVisit:false});e.introT=0;e.dev.frozenAI=true;e.dev.god=true;e.dev.statLock=true;e.dev.fly=true;e.dev.noclip=true;e.handsStowed=true;e.player.flashlight=false;if(e.l02)e.l02.stopped=true;await until(ready,'level '+level);await sleep(1100)}
 const live=async()=>{if(before)return;await until(()=>r.mirrors.stats.visible>0&&r.mirrors.stats.targets>0&&r.mirrors.slots.some((s:any)=>s.valid),'live mirror');await sleep(750);ok(r.mirrors.stats.framePasses<=1,'At most one mirror world draw per frame');ok(r.mirrors.stats.targets<=2,'Reflection target pool bounded to two');ok(!r.mirrorPlayer.root.visible,'Full avatar hidden in main view');ok(!!r.mirrorPlayer.model,'Reflection uses full production avatar');ok(!r.three.getRenderTarget(),'Main render target restored');const active=r.mirrors.meshes.filter((m:any)=>m.material.uniforms.reflectionReady.value>0);ok(active.length>0,'Actual surface is bound to a captured scene');ok(active.every((m:any)=>m.material.uniforms.surfaceMap.value.image.width>1),'Shared wipe/normal/roughness image decoded');ok(active.every((m:any)=>m.material.uniforms.captureMatrix.value.elements.every(Number.isFinite)),'Reflection projection finite')}
 const foyer=async()=>{await load(900);go(6,12.55);aim(4.02,12.55,1.65);await sleep(1600);await live();return stats()}
 const bath=async()=>{go(10.45,5.4);aim(9.181,5.4,1.55);await sleep(1200);await live();return stats()}
 const crouchSetup=()=>{e.dev.fly=false;return stats()}
 const crouch=async()=>{await sleep(900);await live();ok(e.player.crouching&&r.mirrorPlayer.model.userData.retro.bones.shinL.rotation.x>1,'Actual crouch input bends reflected avatar knees');const result=stats();e.dev.fly=true;return result}
 const l02=async()=>{await load(902,20261025);let rest:any=null;for(let y=-2;y<=2&&!rest;y++)for(let x=-2;x<=2&&!rest;x++)rest=l02RestroomOf(20261025,x,y);if(!rest)throw Error('Restroom seed');go(rest.x+2.1,rest.y+2.2);aim(rest.x+.35,rest.y+2.2,1.5);await until(ready,'L02 restroom');await sleep(1800);await live();ok(e.map.structures.some((s:any)=>s.data?.fix==='sink'),'Natural L02 sink present');return{...stats(),rest}}
 const traders=async()=>{const s=TRADERS_DRESSING.find(s=>s.data?.dressing==='washcounter')!;await load(102);const angle=Number(s.data?.deg??0)*Math.PI/180,x=s.x+s.w/2,y=s.y+s.h/2;go(x+Math.sin(angle)*2.0,y+Math.cos(angle)*2.0);aim(x,y,1.65);await until(ready,'Traders washroom');await sleep(1800);await live();return{...stats(),fixture:s}}
 const l02Close=async()=>{const mirrors:any[]=[];r.scene.traverse((o:any)=>{if(o.userData.planarMirror?.kind==='silver')mirrors.push(o)});const m=mirrors.sort((a,b)=>a.getWorldPosition(new THREE.Vector3()).distanceTo(r.camera.position)-b.getWorldPosition(new THREE.Vector3()).distanceTo(r.camera.position))[0];const p=m.getWorldPosition(new THREE.Vector3()),n=new THREE.Vector3(0,0,1).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(m.matrixWorld)).normalize();go(p.x+(e.map.inf?.ox??0)+n.x*1.3,p.z+(e.map.inf?.oy??0)+n.z*1.3);aim(p.x+(e.map.inf?.ox??0),p.z+(e.map.inf?.oy??0),p.y);await sleep(1000);await live();return stats()}
 const flashlight=async()=>{e.player.flashlight=true;await sleep(1000);await live();return stats()}
 const reflectionOff=async()=>{r.setReflectivity(0);await sleep(1400);ok(r.mirrors.stats.targets===0&&r.mirrors.stats.framePasses===0,'Reflection setting zero disables captures and releases targets');return stats()}
 const reflectionOn=async()=>{r.setReflectivity(60);await sleep(1000);await live();return stats()}
 const city=async()=>{
  await load(11);await until(()=>!r.cityDistantTask&&!r.cityChunkTask&&r.chunkGroups.size===25,'full city window');await sleep(2500)
  r.scene.updateMatrixWorld(true)
  let sealed=0,minHeight=Infinity,maxHeight=-Infinity,minRange=Infinity;const opaque:THREE.Mesh[]=[],panes:{point:THREE.Vector3;normal:THREE.Vector3;score:number}[]=[]
  r.scene.traverseVisible((o:any)=>{
    if(!o.isMesh||o.userData.planarMirror||o.isSkinnedMesh||!o.geometry)return
    const mats=Array.isArray(o.material)?o.material:[o.material]
    if(mats.some((m:any)=>m.visible&&!m.transparent&&m.opacity===1))opaque.push(o)
    if(!mats.some((m:any)=>m.userData.l11Surface==='sealedglass'))return
    sealed++;const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal'),index=o.geometry.index
    if(!n)return
    const nm=new THREE.Matrix3().getNormalMatrix(o.matrixWorld)
    for(let i=0;i<(index?.count??p.count);i+=6){
      const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k),normal=new THREE.Vector3().fromBufferAttribute(n,ids[0]).applyMatrix3(nm).normalize()
      if(Math.abs(normal.y)>.05)continue
      const point=ids.reduce((v,id)=>v.add(new THREE.Vector3().fromBufferAttribute(p,id)),new THREE.Vector3()).multiplyScalar(1/3).applyMatrix4(o.matrixWorld)
      minHeight=Math.min(minHeight,point.y);maxHeight=Math.max(maxHeight,point.y);minRange=Math.min(minRange,Math.hypot(point.x-r.camera.position.x,point.z-r.camera.position.z));if(point.y<.5||point.y>35)continue
      const score=Math.hypot(point.x-r.camera.position.x,point.z-r.camera.position.z)+Math.abs(point.y-1.55)*2
      if(score<110)panes.push({point,normal,score})
    }
  })
  panes.sort((a,b)=>a.score-b.score||a.point.x-b.point.x||a.point.z-b.point.z||a.point.y-b.point.y)
  let fixture:any=null,attempts=0,bodyRejected=0;const hits:any[]=[]
  for(const {point,normal} of panes){
    for(const distance of [3.5,5,7]){
      const eye=point.clone().addScaledVector(normal,distance),z=floorHeight(e.map,eye.x,eye.z,0)+.08
      if(!canFlyOccupy(e.map,eye.x,eye.z,z,6)){bodyRejected++;continue}
      eye.y=z+1.55
      const delta=point.clone().sub(eye),length=delta.length();attempts++
      const ray=new THREE.Raycaster(eye,delta.normalize(),.05,length+.1),hit=ray.intersectObjects(opaque,false)[0]
      if(hits.length<8)hits.push({eye:eye.toArray(),point:point.toArray(),normal:normal.toArray(),length,hit:hit?{distance:hit.distance,name:hit.object.name}:null});if(!hit||Math.abs(hit.distance-length)>.08)continue
      const material=Array.isArray((hit.object as THREE.Mesh).material)?(hit.object as THREE.Mesh).material:[(hit.object as THREE.Mesh).material]
      if(!(material as THREE.Material[]).some(m=>m.userData.l11Surface==='sealedglass'))continue
      fixture={x:eye.x+(e.map.inf?.ox??0),y:eye.z+(e.map.inf?.oy??0),z,target:[point.x+(e.map.inf?.ox??0),point.z+(e.map.inf?.oy??0),point.y],normal:normal.toArray(),attempts,hitMaterial:(material as THREE.Material[]).map(m=>m.name)};break
    }
    if(fixture)break
  }
  if(!fixture)throw Error(JSON.stringify({sealed,minHeight,maxHeight,minRange,panes:panes.length,attempts,bodyRejected,hits}));ok(!!fixture,'City camera has physical body clearance and an unobstructed ray to actual sealed glass')
  go(fixture.x,fixture.y,fixture.z);aim(...fixture.target as [number,number,number]);await until(ready,'city mirror view');await sleep(1800);await live()
  return{...stats(),fixture,origin:[e.map.inf?.ox,e.map.inf?.oy]}
 }

 const side=async()=>{go(6.6,13.0);aim(4.02,12.55,1.65);await sleep(700);await live();return stats()}
 const away=async()=>{look.yaw+=Math.PI;await sleep(1500);if(!before){ok(r.mirrors.stats.framePasses===0,'No mirror capture behind the camera');ok(r.mirrors.stats.targets===0,'Idle reflection targets released')}return stats()}
 const low=async()=>{r.setTextureQuality(0);await sleep(1200);await live();if(!before)ok(r.mirrors.stats.size===256&&r.mirrors.stats.targets<=1,'Low quality uses 256px and one plane');return stats()}
 const high=async()=>{r.setTextureQuality(2);await sleep(1200);await live();if(!before)ok(r.mirrors.stats.size===1024,'High quality restores 1024px reflection');return stats()}
 const mobile=async()=>{await sleep(1200);await live();if(!before)ok(r.mirrors.stats.size===256&&r.mirrors.stats.targets<=1,'Touch viewport lowers reflection budget');return stats()}
 const bench=async()=>{await until(()=>!r.precompileRunning&&!r.precompileDirty,'shader warmup');await sleep(5000);const rounds=[];for(let round=0;round<5;round++){const frames:number[]=[],cpu:number[]=[],calls:number[]=[],tris:number[]=[],mirrorCpu:number[]=[];let last=performance.now(),start=last;await new Promise<void>(resolve=>{const step=()=>{const now=performance.now();frames.push(now-last);last=now;cpu.push(lastFrame.cpu);calls.push(lastFrame.calls);tris.push(lastFrame.triangles);mirrorCpu.push(r.mirrors?.stats.cpuMs??0);if(frames.length<120||now-start<1500)requestAnimationFrame(step);else resolve()};requestAnimationFrame(step)});const sort=(v:number[])=>v.sort((a,b)=>a-b),pct=(v:number[],p:number)=>sort(v)[Math.floor((v.length-1)*p)];rounds.push({median:pct(frames,.5),p95:pct(frames,.95),cpuMedian:pct(cpu,.5),cpuP95:pct(cpu,.95),callsMedian:pct(calls,.5),callsP95:pct(calls,.95),trianglesMedian:pct(tris,.5),trianglesP95:pct(tris,.95),mirrorCpuMedian:pct(mirrorCpu,.5),mirrorCpuP95:pct(mirrorCpu,.95),samples:frames.length,...stats()})}return rounds}
 const resources=async()=>{const samples=[];for(let i=0;i<3;i++){await load(0);if(!before)ok(r.mirrors.stats.targets===0,'No mirror target after leaving interior');await foyer();samples.push(stats())}return samples}
 return{stats,foyer,bath,crouchSetup,crouch,l02,l02Close,flashlight,traders,city,side,away,low,high,mobile,reflectionOff,reflectionOn,bench,resources}
}
