import * as THREE from 'three'
import {buildL1Prop} from '../src/game/renderer/l1Props'
import {buildL1EmitterMeshes} from '../src/game/renderer/l1BakedScene'
import {compileSceneJob,uploadSceneJob} from '../src/game/renderer/sceneWarmup'
import {l1FindReference} from '../src/game/world/l1Spatial'
import {l1BakeStats} from '../src/game/renderer/l1BakeQueue'
const sleep=(ms=100)=>new Promise(r=>setTimeout(r,ms))
const until=async(f:()=>unknown,label:string,ms=240000)=>{const t=performance.now();while(!f()){if(performance.now()-t>ms)throw Error('Timeout '+label);await sleep()}}
export async function mount(app:any){
 const e=app.engine,r=app.renderer(),checks:string[]=[],records:any[]=[],frames:number[]=[],cpu:number[]=[];let last=0
 const ok=(v:unknown,msg:string)=>{if(!v)throw Error(msg);checks.push(msg)}
 const render=r.render;r.three.info.autoReset=false
 r.render=function(...args:any[]){const t=performance.now();if(last)frames.push(t-last);last=t;r.three.info.reset();try{return render.apply(this,args)}finally{cpu.push(performance.now()-t);if(frames.length>240)frames.shift();if(cpu.length>240)cpu.shift()}}
 const memory=()=>({...r.three.info.memory,programs:r.three.info.programs.length})
 const status=()=>({level:e.player.level,world:[e.player.x+e.map.inf.ox,e.player.y+e.map.inf.oy,e.player.z],camera:r.camera.position.toArray(),look:{...app.look},near:r.isNearWorldReady(e),chunks:r.chunkGroups.size,tasks:r.chunkBuilds.size,bake:l1BakeStats(),memory:memory(),draws:r.three.info.render.calls,triangles:r.three.info.render.triangles})
 document.querySelector<HTMLButtonElement>('[aria-label="收起开发者面板"]')?.click()
 e.dev.frozenAI=true;e.dev.god=true;e.dev.statLock=true;e.dev.phenOff.add('flicker');e.handsStowed=true;e.endBlackout();e.introT=0;e.input.mx=e.input.my=0
 const warm=async()=>{await until(()=>r.isNearWorldReady(e)&&!r.chunkBuilds.size&&!l1BakeStats().initialQueued,'playable streaming');await sleep(1200)}
 const scene=async(name:string)=>{
  e.paused=true;e.player.flashlight=false
  const a:any=l1FindReference(e.mapSeed,name.startsWith('ouro-')?'ouroboros':name,2400);ok(a,'reference exists: '+name)
  let inf=e.map.inf;e.player.x=a.x-inf.ox;e.player.y=a.y-inf.oy;e.updateInfiniteWindow();inf=e.map.inf
  Object.assign(e.player,{x:a.x-inf.ox,y:a.y-inf.oy,z:a.z??0,vz:0,flashlight:false,crouching:false})
  Object.assign(app.look,{yaw:a.yaw+(name==='ouro-left'?1.1:name==='ouro-back'?Math.PI:0),pitch:name==='ouro-ceiling'?.65:a.pitch,roll:0});r.setFov(a.fov??70,35)
  const t=performance.now();await warm();ok(!r.three.getContext().isContextLost(),'native scene visible: '+name)
  let propMeshes=0,emitters=0;for(const {group}of r.chunkGroups.values())group.traverse((o:any)=>{if(o.isMesh&&o.name?.startsWith('l1-emitter'))emitters++;if(o.isMesh&&o.material?.userData?.l1Owned&&!o.material?.userData?.l1Baked)propMeshes++})
  const props=e.map.structures.filter((s:any)=>['grate','matpile'].includes(s.data?.l1Prop)).map((s:any)=>({kind:s.data.l1Prop,x:s.x+inf.ox,y:s.y+inf.oy,deg:s.data.deg}))
  const rec={name,anchor:a,readyMs:performance.now()-t,props,propMeshes,emitterBatches:emitters,...status()};records.push(rec);return rec
 }
 const sample=async()=>{await until(()=>!l1BakeStats().active&&!l1BakeStats().queued,'final bake',360000);await sleep(1800);const rounds=[];const q=(v:number[],p:number)=>v.slice().sort((a,b)=>a-b)[Math.floor((v.length-1)*p)];for(let k=0;k<5;k++){await sleep(2000);rounds.push({median:q(frames.slice(-90),.5),p95:q(frames.slice(-90),.95),cpuMedian:q(cpu.slice(-90),.5),cpuP95:q(cpu.slice(-90),.95),...memory(),draws:r.three.info.render.calls,triangles:r.three.info.render.triangles})}return{rounds,scope:'Actual App, native GPU headless frame cadence; final bake ready; one fixed view, five rounds',bake:l1BakeStats()}}
 const runJob=async(job:Generator)=>{while(!job.next().done)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))}
 const cycles=async()=>{
  e.paused=true;await until(()=>!r.chunkBuilds.size&&!l1BakeStats().active&&!l1BakeStats().queued,'world settled before recycle',360000)
  const inf=e.map.inf,data=[...inf.chunks.values()].find((c:any)=>c.l1?.roofs.some((q:any)=>q.style==='ouroboros'))?.l1;ok(data,'actual streamed ouro geometry exists for resource check')
  const one=async(k:number)=>{const root=new THREE.Group();root.name='ouro-resource-qa-'+k
   for(const [i,kind]of ['grate','matpile'].entries()){const s:any={kind:'pillar',x:e.player.x+2+i*1.5,y:e.player.y-3,w:1.3,h:1.2,solid:true,data:{l1Prop:kind,deg:0}};root.add(buildL1Prop(s)!)}
   buildL1EmitterMeshes(data,inf.ox,inf.oy,root,[],[]);r.scene.add(root)
   try{await runJob(r.warmSceneTextures(root));await runJob(compileSceneJob(r.three,root,r.camera,r.scene,r.composer?.readBuffer??null));await runJob(uploadSceneJob(r.three,root,r.camera,r.scene,false,null,r.composer?.readBuffer??null));await sleep(180);return memory()}
   finally{root.removeFromParent();r.retireWorld(root);await until(()=>!r.retiredWorld.length,'retire construction props');await sleep(500)}
  }
  await one(-1);await sleep(4500);const rows=[];for(let i=0;i<6;i++){const shown=await one(i);rows.push({shown,empty:memory()})}
  ok(new Set(rows.map(v=>JSON.stringify(v.empty))).size===1,'six full GPU prop and lamp recycle cycles are stable');return rows
 }
 const diagnose=()=>{const ray=new THREE.Raycaster();ray.layers.mask=r.camera.layers.mask;const groups=[...r.chunkGroups.values()].map((v:any)=>v.group);const points=[[580,107],[780,250],[800,300],[930,380],[800,50]]
  return points.map(([x,y])=>{ray.setFromCamera(new THREE.Vector2(x/1920*2-1,1-y/1080*2),r.camera);const hit=ray.intersectObjects(groups,true).find((h:any)=>{let o=h.object;while(o){if(!o.visible)return false;o=o.parent}return true});if(!hit)return{x,y};const o:any=hit.object,m=Array.isArray(o.material)?o.material[hit.face?.materialIndex??0]:o.material;return{x,y,object:o.name,material:m?.name,position:hit.point.toArray(),normal:hit.face?.normal.toArray(),uv:hit.uv?.toArray(),uv1:(hit as any).uv1?.toArray(),color:m?.color?.toArray(),emissive:m?.emissive?.toArray(),instance:hit.instanceId}})
 }
 return{scene,status,warm,sample,cycles,diagnose,summary:()=>({checks,records,status:status()})}
}