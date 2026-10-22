import { createCanvas } from '@napi-rs/canvas'
Object.assign(globalThis,{document:{createElement:()=>createCanvas(64,64)},window:{addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})},localStorage:{getItem:()=>null,setItem(){},removeItem(){}}})
const THREE=await import('three')
const {buildThingMesh,buildThingJob,THING,updateThingLod}=await import('../src/game/renderer/thingMesh')
const {animateThing,makeThingAnimState}=await import('../src/game/renderer/thingAnim')
const {disposeL8Tree}=await import('../src/game/renderer/l8ModelResources')
const {setMaterialMode}=await import('../src/game/renderer/shared')
const {L8EntityPreparation,isL8Remade}=await import('../src/game/renderer/l8EntityPreparation')
const {makeEntity}=await import('../src/game/entities')
const {buildTarWriting}=await import('../src/game/renderer/tarWriting')
let checks=0
function ok(v:unknown,label:string){checks++;if(!v)throw Error(label);console.log('✔ '+label)}
function resources(root:THREE.Object3D){const g=new Set<THREE.BufferGeometry>(),m=new Set<THREE.Material>(),t=new Set<THREE.Texture>();root.traverse((o:any)=>{if(o.geometry)g.add(o.geometry);for(const a of !o.material?[]:Array.isArray(o.material)?o.material:[o.material]){m.add(a);for(const v of Object.values(a) as any[])if(v?.isTexture)t.add(v)}});return{g,m,t}}
for(const mode of ['classic','realistic'] as const){
 setMaterialMode(mode);const a=buildThingMesh(),b=buildThingMesh(),ar=resources(a),br=resources(b)
 ok([...ar.g].every(g=>!br.g.has(g)),mode+': geometries are instance owned')
 ok([...ar.m].every(m=>!br.m.has(m)),mode+': materials are instance owned')
 ok(ar.t.size===4&&[...ar.t].every(t=>br.t.has(t)&&t.userData.entityShared),mode+': four textures are shared and protected')
 ok([...ar.m].every((m:any)=>mode==='classic'?m.isMeshLambertMaterial:m.isMeshStandardMaterial),mode+': all body and detail materials use selected lighting mode')
 for(const g of ar.g){for(const key of ['position','normal','uv','color']){const a=g.getAttribute(key);if(a)for(const n of a.array)if(!Number.isFinite(n))throw Error('nonfinite '+key)}const p=g.getAttribute('position');ok(p.count>0&&g.getAttribute('uv')?.count===p.count,'finite geometry and UV '+g.id+' positions='+p.count+' uv='+g.getAttribute('uv')?.count+' attrs='+Object.keys(g.attributes).join(','))}
 const bLight=b.userData.thingLureMat.emissiveIntensity;animateThing(a,makeThingAnimState(),{t:3,dt:.2,clip:'flee'});ok(b.userData.thingLureMat.emissiveIntensity===bLight,mode+': animation cannot change another instance material')
 let geo=0,mat=0,tex=0,other=0;for(const g of ar.g)g.addEventListener('dispose',()=>geo++);for(const m of ar.m)m.addEventListener('dispose',()=>mat++);for(const t of ar.t)t.addEventListener('dispose',()=>tex++);for(const g of br.g)g.addEventListener('dispose',()=>other++)
 disposeL8Tree(a);ok(geo===ar.g.size&&mat===ar.m.size&&tex===0&&other===0,mode+': disposing one instance preserves other geometry and shared textures');disposeL8Tree(b)
}
{
 const a=buildThingMesh(),b=buildThingMesh(),sa=makeThingAnimState(),sb=makeThingAnimState()
 for(let i=0;i<30;i++)for(const [g,s] of [[a,sa],[b,sb]] as const){g.position.set(i*.05,-100,30);g.rotation.y=.2;animateThing(g,s,{t:i/30,dt:1/30,clip:'cruise',originX:64,originY:96})}
 a.position.x-=32;a.position.z+=64
 animateThing(a,sa,{t:1,dt:1/30,clip:'cruise',originX:96,originY:32});animateThing(b,sb,{t:1,dt:1/30,clip:'cruise',originX:64,originY:96});a.updateMatrixWorld(true);b.updateMatrixWorld(true)
 for(let i=0;i<THING.segs;i++){const p=a.userData.parts['seg'+i].getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(32,0,-64)),q=b.userData.parts['seg'+i].getWorldPosition(new THREE.Vector3());ok(p.distanceTo(q)<1e-5,'visual chain rebase segment '+i)}
 disposeL8Tree(a);disposeL8Tree(b)
}
{
 const queue=new L8EntityPreparation(),e=makeEntity('thething',40,40,-100),live=new Set([e]);ok(isL8Remade('thething'),'thething uses cooperative queue');ok(queue.request(e,{})===null,'first queue request does not build synchronously');let model:THREE.Group|null=null,turns=0
 while(!model&&turns++<2000){queue.advance(live,1.5);model=queue.request(e,{})}ok(model&&turns>1,'model prepared over multiple queue turns');disposeL8Tree(model!);queue.clear()
 const job=buildThingJob();let yielded=0;for(let i=0;i<130;i++){if(job.next().done)break;yielded++}ok(yielded>100,'base job yields across geometry rings');ok(job.return(undefined as never).done,'partial base job can be cancelled')
}
{
 const g=buildThingMesh();g.updateMatrixWorld(true);const cam=new THREE.Vector3(12,2,20);let turns=0
 while(!g.userData.thingLod[0].nodes.hi.length&&turns++<2000)updateThingLod(g,cam,1)
 ok(turns>1&&g.userData.thingLod[0].nodes.hi.length,'head LOD is built over multiple time slices')
 const r=resources(g);for(const geo of r.g)for(const x of geo.attributes.position.array)if(!Number.isFinite(x))throw Error('high LOD finite')
 ok(true,'high LOD finite');updateThingLod(g,new THREE.Vector3(0,0,900),1);ok(g.userData.thingLod.every((u:any)=>!u.hiOn),'far view returns to low LOD');disposeL8Tree(g)
}
{
 const a=buildTarWriting({w:4,h:2,data:{text:'别动'}}),b=buildTarWriting({w:4,h:2,data:{text:'别动'}});const ar=resources(a),br=resources(b);ok([...ar.t].every(t=>br.t.has(t)&&t.userData.entityShared),'tar glyph texture is protected and shared');disposeL8Tree(a);disposeL8Tree(b)
}
console.log(`thing integration: ${checks}/${checks}`)
