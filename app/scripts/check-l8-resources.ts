/* Full model/animation ownership and cooperative cancellation regression. */
import {mkdirSync,writeFileSync} from 'node:fs'
import * as THREE from 'three'
const {createCanvas}=await import('@napi-rs/canvas')
const memory=new Map<string,string>()
Object.assign(globalThis,{window:{addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})},document:{createElement:(tag:string)=>tag==='canvas'?createCanvas(64,64):({style:{},getContext:()=>null}),getElementById:()=>null,addEventListener(){},removeEventListener(){},body:{appendChild(){}}},localStorage:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)}})
const {ARACHNID_VARIANTS,buildArachnidJob,buildArachnidMesh}=await import('../src/game/renderer/arachnidMesh')
const {buildCamoCrawlerJob,buildCamoCrawlerMesh}=await import('../src/game/renderer/camoCrawlerMesh')
const {buildCurabiturJob,buildCurabiturMesh}=await import('../src/game/renderer/curabiturMesh')
const {buildLightguideEntityMesh}=await import('../src/game/renderer/lightguideRender')
const {sampleArachnid,applyArachnidPose}=await import('../src/game/renderer/arachnidAnim')
const {sampleCamo,applyCamoPose}=await import('../src/game/renderer/camoCrawlerAnim')
const {sampleCurabitur,applyCurabiturPose}=await import('../src/game/renderer/curabiturAnim')
const {sampleLightguide,applyLightguidePose}=await import('../src/game/renderer/lightguideAnim')
const {buildEntityArchiveModel}=await import('../src/game/renderer/entityArchiveModel')
const {L8EntityPreparation}=await import('../src/game/renderer/l8EntityPreparation')
const {disposeL8Tree}=await import('../src/game/renderer/l8ModelResources')
let checks=0,failures=0;const rows:any[]=[],cancellations:any[]=[]
const ok=(v:unknown,m:string)=>{checks++;if(!v){failures++;console.error('FAIL '+m)}}
function inspect(root:THREE.Group){
 let triangles=0,draws=0,bad=0;const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),instances:THREE.InstancedMesh[]=[]
 root.updateMatrixWorld(true)
 root.traverse(o=>{for(const n of o.matrixWorld.elements)if(!Number.isFinite(n))bad++;const m=o as THREE.Mesh
  if(m.geometry){geometries.add(m.geometry);for(const a of Object.values(m.geometry.attributes))for(const n of a.array)if(!Number.isFinite(n))bad++}
  if(m.material)for(const mt of Array.isArray(m.material)?m.material:[m.material]){materials.add(mt);for(const value of Object.values(mt)){const tex=value as THREE.Texture;if(tex?.isTexture)ok(tex.userData.entityShared===true,'shared texture tagged '+tex.uuid)}}
  if(m.isMesh){draws+=m.geometry.groups.length||1;triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3*((m as THREE.InstancedMesh).isInstancedMesh?(m as THREE.InstancedMesh).count:1);const needsUV=(Array.isArray(m.material)?m.material:[m.material]).some((mt:any)=>mt.map||mt.normalMap||mt.bumpMap);ok(!!m.geometry.attributes.normal&&(!needsUV||!!m.geometry.attributes.uv),'mesh has normals and UVs '+root.userData.entityType+'/'+root.userData.arachnidVariant+'/'+m.geometry.type+'/'+Object.keys(m.geometry.attributes).join(','))}
  if((m as THREE.InstancedMesh).isInstancedMesh){instances.push(m as THREE.InstancedMesh);for(const n of (m as THREE.InstancedMesh).instanceMatrix.array)if(!Number.isFinite(n))bad++}
 });const box=new THREE.Box3().setFromObject(root,true);ok(!box.isEmpty()&&[...box.min,...box.max].every(Number.isFinite),'finite renderable bounds');ok(bad===0,'finite geometry and animated transforms')
 return{triangles,draws,bad,geometries,materials,instances,bounds:{min:box.min.toArray(),max:box.max.toArray()}}
}
function animate(root:THREE.Group,type:string){if(type==='arachnid'){const swarm=root.userData.arachnidRig.kind==='swarm';applyArachnidPose(root,sampleArachnid(root,swarm?'swarm_flow':'idle',0));applyArachnidPose(root,sampleArachnid(root,swarm?'swarm_flow':'walk',.4));root.userData.arachnidRig.setEngorge?.(.65)}else if(type==='camo'){applyCamoPose(root,sampleCamo(root,'idle_camo',0));applyCamoPose(root,sampleCamo(root,'walk',.4))}else if(type==='curabitur'){applyCurabiturPose(root,sampleCurabitur(root,'float_idle',0));applyCurabiturPose(root,sampleCurabitur(root,'drift',.4))}else{applyLightguidePose(root,sampleLightguide(root,'wander',0));applyLightguidePose(root,sampleLightguide(root,'beckon',.4))}}
function pair(type:string,label:string,build:()=>THREE.Group){const a=build(),b=build(),ia=inspect(a),ib=inspect(b);ok([...ia.geometries].every(g=>!ib.geometries.has(g)),label+' private geometry');ok([...ia.materials].every(m=>!ib.materials.has(m)),label+' private materials');for(let i=0;i<ia.instances.length;i++)ok(ia.instances[i].instanceMatrix.array!==ib.instances[i].instanceMatrix.array,label+' private instance matrices')
 const original=new THREE.Box3().setFromObject(b,true).getSize(new THREE.Vector3());animate(a,type);inspect(a);ok(original.distanceTo(new THREE.Box3().setFromObject(b,true).getSize(new THREE.Vector3()))<1e-8,label+' A pose leaves B unchanged')
 let touched=0;for(const g of ib.geometries)g.addEventListener('dispose',()=>touched++);for(const m of ib.materials)m.addEventListener('dispose',()=>touched++);disposeL8Tree(a);ok(touched===0,label+' disposing A leaves B intact');animate(b,type);inspect(b);disposeL8Tree(b)
 rows.push({type:label,triangles:ia.triangles,draws:ia.draws,bounds:ia.bounds})
}
for(const v of ARACHNID_VARIANTS.filter(x=>x.id!=='runenest'))pair('arachnid','arachnid:'+v.id,()=>buildArachnidMesh(v.id,17))
pair('arachnid','arachnid:broodswarm:mother',()=>buildArachnidMesh('broodswarm',31,{mother:true}))
for(const seed of [1,2])pair('camo','camo:'+seed,()=>buildCamoCrawlerMesh(seed))
for(const sex of ['female','male'] as const)pair('curabitur','curabitur:'+sex,()=>buildCurabiturMesh(sex,9,{lights:false}))
pair('lightguide','lightguide',()=>buildLightguideEntityMesh(3))
const archive=buildEntityArchiveModel('curabitur')!;inspect(archive);disposeL8Tree(archive)
function finish(job:Generator<void,THREE.Group,unknown>){let count=0,n=job.next();while(!n.done&&count++<20000)n=job.next();ok(n.done,'generator completes in bounded steps');ok(count>2,'generator cooperates');if(!n.done)throw Error('generation stuck');disposeL8Tree(n.value);return count}
const geoDispose=THREE.BufferGeometry.prototype.dispose,matDispose=THREE.Material.prototype.dispose;let disposed=0
try{THREE.BufferGeometry.prototype.dispose=function(){disposed++;return geoDispose.call(this)};THREE.Material.prototype.dispose=function(){disposed++;return matDispose.call(this)}
 for(const [name,create]of [['arachnid',()=>buildArachnidJob('wolf',17)],['camo',()=>buildCamoCrawlerJob(2)],['curabitur',()=>buildCurabiturJob('male',9,{lights:false})]] as const){const count=finish(create()),j=create();for(let i=0;i<Math.floor(count*.6);i++)ok(!j.next().done,name+' partial construction');const old=disposed;j.return(undefined as never);ok(disposed>old,name+' cancellation disposes partial model');cancellations.push({name,steps:count,disposed:disposed-old})}
 const prep=new L8EntityPreparation(),ent:any={id:90001,def:{type:'curabitur'}};let ready:THREE.Group|null=null;for(let i=0;i<1000&&!ready;i++){ready=prep.request(ent,{seed:4,curabiturSex:'female',curabiturSeed:4});if(!ready)prep.advance(new Set([ent]),2)}ok(ready,'queued model actually completes');if(ready){inspect(ready);disposeL8Tree(ready)}
 const second:any={id:90002,def:{type:'camocrawler'}};prep.request(second,{seed:2});for(let i=0;i<15;i++)prep.advance(new Set([second]),.1);const old=disposed;prep.clear();ok(disposed>old,'queue clear releases pending or ready model');cancellations.push({name:'queue-clear',disposed:disposed-old})
}finally{THREE.BufferGeometry.prototype.dispose=geoDispose;THREE.Material.prototype.dispose=matDispose}
mkdirSync('reports/l8-stage3-mangled-20261022',{recursive:true});writeFileSync('reports/l8-stage3-mangled-20261022/resources.json',JSON.stringify({checks,failures,rows,cancellations},null,2));console.log(JSON.stringify({checks,failures,models:rows.length,cancellations}));if(failures)process.exitCode=1
