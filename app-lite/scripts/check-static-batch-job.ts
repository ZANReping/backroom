import assert from 'node:assert/strict'
import * as THREE from 'three'
import { batchL9StaticRoots, batchStaticRootsJob } from '../src/game/renderer/staticBatch'
import { batchL9StaticRoots as baseline } from '../.check/staticBatch-baseline'

let checks=0
const check=(ok:unknown,label:string)=>{assert.ok(ok,label);checks++}
const bytes=(a:THREE.TypedArray)=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('hex')
const geometryState=(g:THREE.BufferGeometry)=>({index:g.index&&bytes(g.index.array),attrs:Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,{size:a.itemSize,normalized:a.normalized,type:a.array.constructor.name,bytes:bytes(a.array)}])),groups:g.groups,range:g.drawRange})
const cube=new THREE.BoxGeometry(.3,.5,.7),plane=new THREE.PlaneGeometry(.7,.8),differentUV=cube.clone(),morph=plane.clone()
differentUV.getAttribute('uv').setXY(0,.33,.66)
morph.morphAttributes.position=[morph.getAttribute('position').clone()]
const solid=new THREE.MeshLambertMaterial({color:'#adbecc'}),same=solid.clone(),glass=new THREE.MeshPhysicalMaterial({transparent:true,opacity:.6,side:THREE.DoubleSide}),lineMat=new THREE.LineBasicMaterial(),pointMat=new THREE.PointsMaterial()
const sourceGeometries=new Set([cube,plane,differentUV,morph]),sourceMaterials=new Set([solid,same,glass,lineMat,pointMat])
let sourceDisposals=0
for(const resource of [...sourceGeometries,...sourceMaterials])resource.addEventListener('dispose',()=>sourceDisposals++)
function fixture(){
 const parent=new THREE.Group();parent.position.set(2,.8,-3);parent.rotation.y=.3
 const roots:THREE.Object3D[]=[]
 for(let i=0;i<3;i++){
  const root=new THREE.Group();root.position.set(i*.7,.2,i*.4);root.scale.x=i===1?-1:1;parent.add(root);roots.push(root)
  for(let j=0;j<8;j++){
   const mesh=new THREE.Mesh(j===6?differentUV:j===7?morph:cube,j===5?glass:j%2?solid:same)
   mesh.position.set(j*.2,j*.13,-j*.11);mesh.rotation.y=j*.15;mesh.userData.noCastShadow=j===3;mesh.renderOrder=j===4?2:0
   root.add(mesh)
  }
  const hidden=new THREE.Group();hidden.visible=false;hidden.add(new THREE.Mesh(plane,glass));root.add(hidden)
  const invisible=new THREE.Mesh(cube,solid);invisible.visible=false;root.add(invisible)
  if(i===0)for(let k=0;k<40;k++){const repeated=new THREE.Mesh(cube,solid);repeated.position.set(k*.2,1,0);root.add(repeated)}
 }
 // Unsupported renderable roots must retain their original hierarchy and identity.
 const instance=new THREE.InstancedMesh(cube,solid,2);instance.setMatrixAt(0,new THREE.Matrix4());instance.setMatrixAt(1,new THREE.Matrix4().makeTranslation(2,0,0))
 for(const item of [instance,new THREE.Line(plane,lineMat),new THREE.Points(plane,pointMat),new THREE.Mesh(cube,[solid,glass])]){
  const root=new THREE.Group();root.add(item,new THREE.Mesh(plane,glass));parent.add(root);roots.push(root)
 }
 return {parent,roots}
}
const signature=(root:THREE.Object3D):unknown=>({type:root.type,name:root.name,visible:root.visible,matrix:(root.updateMatrix(),root.matrix.elements),order:root.renderOrder,userData:root.userData,
 ...((root as THREE.Mesh).geometry?{geometry:geometryState((root as THREE.Mesh).geometry),materials:(Array.isArray((root as THREE.Mesh).material)?(root as THREE.Mesh).material as THREE.Material[]:[(root as THREE.Mesh).material as THREE.Material]).map(m=>m.uuid),cast:root.castShadow,receive:root.receiveShadow}:{}),
 ...((root as THREE.InstancedMesh).isInstancedMesh?{instances:bytes((root as THREE.InstancedMesh).instanceMatrix.array)}:{}),children:root.children.map(signature)})
const cleanup=(root:THREE.Object3D)=>root.traverse(o=>{const m=o as THREE.Mesh,g=m.geometry;if(g&&!sourceGeometries.has(g))g.dispose();if((o as THREE.InstancedMesh).isInstancedMesh&&!sourceGeometries.has(g))(o as THREE.InstancedMesh).dispose()})
const expected=new THREE.Group(),actual=new THREE.Group(),sync=new THREE.Group(),f=fixture(),ref=fixture(),fs=fixture()
const savedGeometries=JSON.stringify([...sourceGeometries].map(geometryState)),relations:{object:THREE.Object3D;parent:THREE.Object3D|null;children:THREE.Object3D[];visible:boolean}[]=[]
f.parent.traverse(o=>relations.push({object:o,parent:o.parent,children:[...o.children],visible:o.visible}))
const unchanged=()=>sourceDisposals===0&&JSON.stringify([...sourceGeometries].map(geometryState))===savedGeometries&&relations.every(s=>s.object.parent===s.parent&&s.visible===s.object.visible&&s.children.length===s.object.children.length&&s.children.every((c,i)=>s.object.children[i]===c))
try{
 baseline(expected,ref.roots)
 const job=batchStaticRootsJob(actual,f.roots);let yields=0
 while(!job.next().done){yields++;check(actual.children.length===0,'nothing published between steps');check(unchanged(),'pending job preserves sources and fallback parents')}
 check(JSON.stringify(signature(actual))===JSON.stringify(signature(expected)),'complete output preserves hierarchy, buffers, instance matrices, materials and ordering')
 check(f.roots.slice(3).every(root=>root.parent===actual),'fallback roots transfer by identity only at commit')
 batchL9StaticRoots(sync,fs.roots);check(JSON.stringify(signature(sync))===JSON.stringify(signature(expected)),'synchronous wrapper retains the original result')

 const setAttribute=THREE.BufferGeometry.prototype.setAttribute,apply=THREE.BufferGeometry.prototype.applyMatrix4,setMatrix=THREE.InstancedMesh.prototype.setMatrixAt,disposeInstance=THREE.InstancedMesh.prototype.dispose
 let partialInstanceCancellation=false
 const track=(run:()=>void)=>{
  const allocations=new Map<THREE.BufferGeometry,number>(),instances=new Map<THREE.InstancedMesh,number>(),written=new Map<THREE.InstancedMesh,number>()
  THREE.BufferGeometry.prototype.setAttribute=function(...args){if(!sourceGeometries.has(this)&&!allocations.has(this)){allocations.set(this,0);this.addEventListener('dispose',()=>allocations.set(this,allocations.get(this)!+1))}return setAttribute.apply(this,args)}
  THREE.InstancedMesh.prototype.setMatrixAt=function(...args){if(!sourceGeometries.has(this.geometry)){if(!instances.has(this))instances.set(this,0);written.set(this,args[0]+1)}return setMatrix.apply(this,args)}
  THREE.InstancedMesh.prototype.dispose=function(){if(instances.has(this))instances.set(this,instances.get(this)!+1);return disposeInstance.call(this)}
  try{run()}finally{THREE.BufferGeometry.prototype.setAttribute=setAttribute;THREE.BufferGeometry.prototype.applyMatrix4=apply;THREE.InstancedMesh.prototype.setMatrixAt=setMatrix;THREE.InstancedMesh.prototype.dispose=disposeInstance}
  check([...allocations.values()].every(n=>n===1),'cancel/failure disposes each private geometry once')
  check([...instances.values()].every(n=>n===1),'cancel/failure disposes each private instance once')
  partialInstanceCancellation ||= [...instances.keys()].some(mesh=>(written.get(mesh)??0)>0&&(written.get(mesh)??0)<mesh.count)
  check(sourceDisposals===0&&JSON.stringify([...sourceGeometries].map(geometryState))===savedGeometries,'source geometry and materials stay alive and unchanged')
  return {geometries:allocations.size,instances:instances.size}
 }
 let cancelledGeometries=0,cancelledInstances=0
 for(let stop=0;stop<=yields;stop++){
  const source=fixture(),target=new THREE.Group(),sentinel=new THREE.Object3D();target.add(sentinel)
  const count=track(()=>{
   const iter=batchStaticRootsJob(target,source.roots)
   for(let n=0;n<stop;n++)check(!iter.next().done,'cancel before commit')
   iter.return();check(target.children.length===1&&target.children[0]===sentinel,'cancellation preserves existing target contents')
   check(source.roots.every(root=>root.parent===source.parent),'cancellation preserves fallback roots')
  });cancelledGeometries+=count.geometries;cancelledInstances+=count.instances
 }
 track(()=>{
  const source=fixture(),target=new THREE.Group(),job=batchStaticRootsJob(target,source.roots);let transforms=0
  THREE.BufferGeometry.prototype.applyMatrix4=function(m){if(++transforms===3)throw new Error('intentional transform failure');return apply.call(this,m)}
  assert.throws(()=>{while(!job.next().done){}},/intentional transform failure/);checks++
  check(target.children.length===0&&source.roots.every(root=>root.parent===source.parent),'construction failure publishes and reparents nothing')
 })
 check(partialInstanceCancellation,'cancellation covers partially written instance matrices')
 for(const kind of ['empty','transparent','fallback']){
  const a=new THREE.Group(),b=new THREE.Group(),source=new THREE.Group()
  if(kind==='transparent')source.add(new THREE.Mesh(plane,glass))
  if(kind==='fallback')source.add(new THREE.Points(plane,pointMat))
  const roots=kind==='empty'?[]:[source]
  baseline(a,roots.map(root=>root.clone(true)));const iter=batchStaticRootsJob(b,roots)
  while(!iter.next().done)check(b.children.length===0,'no-opaque cases also publish atomically')
  check(JSON.stringify(signature(a))===JSON.stringify(signature(b)),`${kind}: zero opaque parts preserve the baseline result`)
  cleanup(a);cleanup(b)
 }
 check(sourceDisposals===0,'no source geometry or material disposed')
 console.log(JSON.stringify({passed:checks,yields,cancelledGeometries,cancelledInstances,partialInstanceCancellation,sourceDisposals}))
}finally{for(const root of [expected,actual,sync])cleanup(root);for(const g of sourceGeometries)g.dispose();for(const m of sourceMaterials)m.dispose()}
