import {createCanvas} from '@napi-rs/canvas'
import * as THREE from 'three'
import {mkdirSync,writeFileSync} from 'node:fs'
const memory=new Map<string,string>()
Object.assign(globalThis,{document:{createElement:()=>createCanvas(256,256),createElementNS:()=>({addEventListener(){},removeEventListener(){}})},window:{addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})},localStorage:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)}})
const {buildVendingMachine}=await import('../src/game/renderer/vendingMesh')
const {buildWindowEntity,buildOrdinaryWindow}=await import('../src/game/renderer/windowMesh')
const {animateWindow}=await import('../src/game/renderer/windowAnim')
const {animateVending}=await import('../src/game/renderer/vendingAnim')
const {setMaterialMode}=await import('../src/game/renderer/shared')
const {vendingSeedOfStruct,vendingLayout}=await import('../src/game/content/vendingLayout')
const {npcIdleForce,npcIdleControl,npcIdleTick}=await import('../src/game/engine/npcIdle')
const {sootheTarget}=await import('../src/game/engine/facelingAI')
const {batchWindowHostsJob,setWindowHostGone}=await import('../src/game/renderer/windowHostBatch')
let n=0;const failures:string[]=[],timings:any[]=[],ok=(yes:unknown,msg:string)=>{n++;if(!yes)failures.push(msg)}
function resources(g:THREE.Object3D){const geos=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>(),tex=new Set<THREE.Texture>();let meshes=0,tris=0;g.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;meshes++;geos.add(m.geometry);tris+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;for(const x of Array.isArray(m.material)?m.material:[m.material]){mats.add(x);for(const v of Object.values(x))if(v instanceof THREE.Texture)tex.add(v)}});return{geos,mats,tex,meshes,tris}}
const timed=(label:string,make:()=>THREE.Group)=>{const t=performance.now(),g=make(),r=resources(g);timings.push({label,ms:performance.now()-t,meshes:r.meshes,tris:r.tris,materials:r.mats.size});return g}
const dispose=(g:THREE.Object3D)=>{const r=resources(g);r.geos.forEach(x=>x.dispose());r.mats.forEach(x=>x.dispose());g.traverse(o=>{if((o as THREE.SkinnedMesh).isSkinnedMesh)(o as THREE.SkinnedMesh).skeleton.dispose()})}
function pair(label:string,make:()=>THREE.Group,animate?:(g:THREE.Group)=>void){
 const a=timed(label+' cold',make),b=timed(label+' warm',make),ra=resources(a),rb=resources(b)
 ok([...ra.geos].every(x=>!rb.geos.has(x)),label+' geometry independent')
 ok([...ra.mats].every(x=>!rb.mats.has(x)),label+' material independent')
 ok([...ra.tex].some(x=>rb.tex.has(x)),label+' textures retained and shared')
 for(const g of ra.geos){const p=g.attributes.position;ok(!!p&&Array.from(p.array).every(Number.isFinite),label+' finite vertices')}
 animate?.(a);animate?.(b)
 let disposed=0;rb.geos.forEach(g=>g.addEventListener('dispose',()=>disposed++));rb.mats.forEach(g=>g.addEventListener('dispose',()=>disposed++))
 dispose(a);ok(disposed===0,label+' disposing another instance cannot dispose retained resources');animate?.(b);dispose(b)
}
for(const mode of ['classic','realistic'] as const){
 setMaterialMode(mode)
 pair(mode+' vending',()=>buildVendingMachine({variant:'normal',seed:29}),g=>animateVending(g,'coil',1.55,{slot:2}))
 pair(mode+' e36',()=>buildVendingMachine({variant:'e36',seed:39,dismantled:true}),g=>{for(const clip of ['hand','stand','crawl','chop','stun','whisper']as const)animateVending(g,clip,.7)})
 for(const style of ['l2','l4','l601']as const){
  pair(mode+' '+style,()=>buildWindowEntity({style,state:'occupied',seed:3}),g=>{animateWindow(g,'drag',.7);const w=g.userData.window;ok(w.uniforms===(w.pane.material as THREE.ShaderMaterial).uniforms,'window animation updates drawn material');ok(w.scenery===w.pane.material,'window scenery handle remains a material')})
  pair(mode+' ordinary '+style,()=>buildOrdinaryWindow(style,4))
 }
 const g=buildVendingMachine({variant:'normal'}),body=g.userData.vending.body as THREE.Group,frame=body.children.find(o=>(o as THREE.Mesh).isMesh)as THREE.Mesh
 ok(mode==='classic'?(frame.material as THREE.MeshLambertMaterial).isMeshLambertMaterial:(frame.material as THREE.MeshStandardMaterial).isMeshStandardMaterial,mode+' uses material factory');dispose(g)
}
{
 const a={x:12,y:14,data:{}},b={x:-52,y:-18,data:{}}
 const seed=vendingSeedOfStruct(a),other=vendingSeedOfStruct(b,64,32)
 ok(seed===other,'same world position has same vending seed with different origins')
 a.x-=32;a.y+=32;ok(vendingSeedOfStruct(a,32,-32)===seed,'loaded machine retains brand after origin shift')
 ok(JSON.stringify(vendingLayout('normal',seed))===JSON.stringify(vendingLayout('normal',other)),'machine products match across window rebasing')
}
{
 const map:any={inf:{ox:0,oy:0},w:40,h:40,tiles:new Uint8Array(1600).fill(1),structures:[],wet:new Uint8Array(1600),elev:new Uint8Array(1600),liquid:new Uint8Array(1600),seaFloor:new Float32Array(1600),step:new Uint8Array(1600)}
 const npc:any={id:'qa-idle',def:{personality:'calm',wanderRadius:3,idle:[],faction:'meg'},x:10,y:10,homeX:10,homeY:10,tx:10,ty:10,facing:0,floor:0,bubbleT:0,moveT:5}
 const eng:any={map,npcs:[npc],player:{x:30,y:30,z:0,floor:0,facing:0},levelDef:{id:2},time:1,los:()=>false}
 const st:any=npcIdleForce(npc,'','seat');st.phase='sit';st.modeT=20;st.seat={x:10,y:10,z:.46,yaw:0,floor:0,front:{x:10,y:10.5}};npcIdleControl(eng,npc,0,()=>true)
 map.inf.ox=32;map.inf.oy=-32;npc.x-=32;npc.y+=32;npc.homeX-=32;npc.homeY+=32;eng.player.x-=32;eng.player.y+=32
 npcIdleControl(eng,npc,.016,()=>true);ok(Math.abs(npc.x+22)<1e-6&&Math.abs(npc.y-42)<1e-6,'seated NPC retains world position after streaming shift')
 ok(st.seat.front.x===-22&&st.seat.front.y===42.5,'seat approach also rebases')
 st.mode='stand';st.phase='';st.seat=undefined;npc.homeFacing=0;npc.facing=0;npc.def.wanderRadius=.5;npc.tx=npc.x;npc.ty=npc.y;eng.player.x=npc.x-2;eng.player.y=npc.y
 st.losT=0;eng.los=()=>true;for(let i=0;i<5;i++)npcIdleTick(eng,npc,.1,()=>true)
 ok(npc.facing===0,'fixed duty facing preserved when player approaches')
 eng.map.entities=[{id:1,def:{type:'faceling'},x:eng.player.x+1,y:eng.player.y,z:0,fc:{mode:'tantrum'}}];eng.los=()=>false
 ok(!sootheTarget(eng),'cannot soothe a child through a wall');eng.los=()=>true;ok(!!sootheTarget(eng),'visible child can be soothed')
}
{
 const makeRoot=(x:number,y:number,rot:number)=>{
  const r=new THREE.Group();r.position.set(x,y,0);r.rotation.z=rot
  const open=new THREE.Group(),closed=new THREE.Group();
  const geo=new THREE.BoxGeometry(1,1,0.1),mat=new THREE.MeshBasicMaterial();
  open.add(new THREE.Mesh(geo,mat));open.add(new THREE.Mesh(geo,mat));
  closed.add(new THREE.Mesh(geo,mat));r.userData.windowOpen=open;r.userData.windowClosed=closed;r.add(open,closed);return r
 }
 const roots=[makeRoot(2,3,.2),makeRoot(-4,1,-.4)],target=new THREE.Group(),before=roots.flatMap(r=>[...(r.userData.windowOpen as THREE.Group).children,...(r.userData.windowClosed as THREE.Group).children]).length
 const job=batchWindowHostsJob(target,roots);let steps=0;for(let x=job.next();!x.done;x=job.next())steps++
 const batches=target.children.filter(o=>(o as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh[]
 ok(steps>0&&batches.length<before,'window hosts batch into fewer GPU meshes')
 ok(roots.every(r=>r.userData.colliderProxy===true&&!r.visible),'window roots remain as invisible collision proxies')
 ok(roots.every(r=>(r.userData.windowOpen as THREE.Group).visible&&!(r.userData.windowClosed as THREE.Group).visible),'open state is initially visible')
 const matrices=()=>batches.map(m=>Array.from(m.instanceMatrix.array));const secondBefore=matrices();setWindowHostGone(roots[0],true);const secondAfter=matrices();
 ok((roots[0].userData.windowOpen as THREE.Group).visible===false&&(roots[0].userData.windowClosed as THREE.Group).visible===true,'closed root toggles open/closed branches')
 ok(secondAfter.some((a,i)=>a.some((v,j)=>v!==secondBefore[i][j]))&&secondAfter.slice(0).length===secondBefore.length,'closed instance matrix collapses')
 const root1After=matrices();setWindowHostGone(roots[1],false);ok(JSON.stringify(matrices())===JSON.stringify(root1After),'repeating another root state leaves matrices unchanged')
 setWindowHostGone(roots[0],false);ok(roots[0].userData.windowBatchGone===false,'reopening restores open state')
 ok(batches.every(m=>{const a=m.instanceMatrix.array;return Array.from(a).every(Number.isFinite)}),'window instance matrices finite')
 const matrix=new THREE.Matrix4(),zero=new THREE.Vector3(0,0,0)
 const snapshot=(r:THREE.Group)=>r.userData.windowBindings.map((b:any)=>{b.mesh.getMatrixAt(b.index,matrix);return matrix.toArray()})
 const original=roots.map(r=>snapshot(r));setWindowHostGone(roots[0],true)
 ok(JSON.stringify(snapshot(roots[1]))===JSON.stringify(original[1]),'closing one transformed host preserves every other host matrix')
 ok(roots[0].userData.windowBindings.every((b:any)=>{b.mesh.getMatrixAt(b.index,matrix);const want=b.closed?b.matrix:new THREE.Matrix4().copy(b.matrix).scale(zero);return matrix.elements.every((v,i)=>Math.abs(v-want.elements[i])<1e-5)}),'closed walls render at their own transform and open instances collapse')
 setWindowHostGone(roots[0],false);ok(JSON.stringify(snapshot(roots[0]))===JSON.stringify(original[0]),'reopening restores original transformed geometry matrices')
 ok(batches.every(m=>{const p=m.geometry.getAttribute('position');if(!Array.from(p.array).every(Number.isFinite))return false;for(let i=0;i<m.count;i++){m.getMatrixAt(i,matrix);for(let j=0;j<p.count;j++){const v=new THREE.Vector3().fromBufferAttribute(p,j).applyMatrix4(matrix);if(!m.boundingBox!.clone().expandByScalar(1e-5).containsPoint(v))return false}}return true}),'both host states stay inside precomputed batch bounds with finite vertices')
 batches.forEach(m=>{m.geometry.dispose();m.dispose()});roots.forEach(r=>r.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh){(m.geometry as THREE.BufferGeometry).dispose();(m.material as THREE.Material).dispose()}}))
}const result={ok:failures.length===0,checks:n,failures,timings};mkdirSync('reports/four-import-20261023',{recursive:true});writeFileSync('reports/four-import-20261023/integration-checks.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1


