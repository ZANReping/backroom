import assert from 'node:assert/strict'
import * as THREE from 'three'
import { batchL4Static, batchL4StaticJob } from '../src/game/renderer/l4Batch'
import { batchL4Static as baseline } from '../.check/l4Batch-baseline'

let checks=0
const check=(ok:unknown,label:string)=>{assert.ok(ok,label);checks++}
const bytes=(array:THREE.TypedArray)=>Buffer.from(array.buffer,array.byteOffset,array.byteLength).toString('hex')
const geometryState=(g:THREE.BufferGeometry)=>({index:g.index&&bytes(g.index.array),attributes:Object.fromEntries(Object.entries(g.attributes).map(([k,v])=>[k,{itemSize:v.itemSize,normalized:v.normalized,type:v.array.constructor.name,bytes:bytes(v.array)}])),groups:g.groups,drawRange:g.drawRange})
const geometry=new THREE.BoxGeometry(.4,.7,.5),plane=new THREE.PlaneGeometry(.4,.6)
const solid=new THREE.MeshLambertMaterial({color:'#9da9b5'}),equivalent=solid.clone(),glass=new THREE.MeshBasicMaterial({color:'#abcdef',transparent:true,opacity:.3,side:THREE.DoubleSide})
let sourceDisposals=0
for(const resource of [geometry,plane,solid,equivalent,glass])resource.addEventListener('dispose',()=>sourceDisposals++)
const parent=new THREE.Group();parent.position.set(3,1,-2);parent.rotation.y=.3
const roots:THREE.Group[]=[]
for(let i=0;i<3;i++){
 const root=new THREE.Group();root.position.set(i*.3,.2,-i*.5);root.scale.set(1,.8,i===1?-1:1);parent.add(root);roots.push(root)
 for(let j=0;j<8;j++){
  const mesh=new THREE.Mesh(j%3===0?plane:geometry,j===2||j===7?glass:j%2?solid:equivalent)
  mesh.position.set(j*.3,j*.17,-j*.2);mesh.rotation.set(j*.2,j*.1,.05);mesh.castShadow=j%2===0;mesh.renderOrder=j===7?2:0;mesh.userData.noCastShadow=j===3
  root.add(mesh)
 }
 const hidden=new THREE.Group();hidden.visible=false;hidden.add(new THREE.Mesh(plane,glass));root.add(hidden)
 const invisible=new THREE.Mesh(geometry,solid);invisible.visible=false;root.add(invisible)
 const array=new THREE.Mesh(geometry,[solid,glass]);array.add(new THREE.Mesh(plane,solid));root.add(array)
}
const sentinel=new THREE.Object3D(),expected=new THREE.Group(),actual=new THREE.Group(),sync=new THREE.Group()
const signature=(target:THREE.Group)=>JSON.stringify(target.children.filter(o=>(o as THREE.Mesh).isMesh).map(o=>{const m=o as THREE.Mesh;return {material:(m.material as THREE.Material).uuid,geometry:geometryState(m.geometry),cast:m.castShadow,receive:m.receiveShadow,order:m.renderOrder,userData:m.userData}}))
const sourceState=JSON.stringify([geometryState(geometry),geometryState(plane)])
const sourceObjects:THREE.Object3D[]=[];parent.traverse(o=>sourceObjects.push(o))
const relations=sourceObjects.map(o=>({object:o,parent:o.parent,children:[...o.children],visible:o.visible}))
const sourceUnchanged=()=>sourceDisposals===0&&JSON.stringify([geometryState(geometry),geometryState(plane)])===sourceState&&relations.every(s=>s.object.parent===s.parent&&s.object.visible===s.visible&&s.object.children.length===s.children.length&&s.object.children.every((o,i)=>o===s.children[i]))
const disposeOutput=(target:THREE.Group)=>target.traverse(o=>{if((o as THREE.Mesh).isMesh)(o as THREE.Mesh).geometry.dispose()})
try{
 baseline(expected,roots)
 actual.add(sentinel);actual.name='pending'
 const job=batchL4StaticJob(actual,roots);let yields=0
 while(true){const step=job.next();if(step.done)break;yields++;check(actual.children.length===1&&actual.children[0]===sentinel&&actual.name==='pending','no partial output is published between yields');check(sourceUnchanged(),'sources and hierarchy remain unchanged')}
 check(signature(actual)===signature(expected),'completed job preserves every buffer, material identity, mesh flag and order')
 check(actual.name===expected.name&&actual.children[0]===sentinel,'completion appends to existing target content')
 batchL4Static(sync,roots);check(signature(sync)===signature(expected),'synchronous wrapper retains its original complete result')

 const setAttribute=THREE.BufferGeometry.prototype.setAttribute,apply=THREE.BufferGeometry.prototype.applyMatrix4
 const track=(run:()=>void)=>{
  const allocations=new Map<THREE.BufferGeometry,number>()
  THREE.BufferGeometry.prototype.setAttribute=function(...args){if(this!==geometry&&this!==plane&&!allocations.has(this)){allocations.set(this,0);this.addEventListener('dispose',()=>allocations.set(this,allocations.get(this)!+1))}return setAttribute.apply(this,args)}
  try{run()}finally{THREE.BufferGeometry.prototype.setAttribute=setAttribute;THREE.BufferGeometry.prototype.applyMatrix4=apply}
  check([...allocations.values()].every(n=>n===1),'all temporary geometry allocations release exactly once')
  check(sourceUnchanged(),'cancellation or failure preserves source data')
  return allocations.size
 }
 let cancelledGeometries=0
 for(let stop=0;stop<=yields;stop++)cancelledGeometries+=track(()=>{
  const target=new THREE.Group(),keep=new THREE.Object3D();target.add(keep);target.name='untouched'
  const iter=batchL4StaticJob(target,roots)
  for(let i=0;i<stop;i++)check(!iter.next().done,'cancellation occurs before publication')
  iter.return()
  check(target.children.length===1&&target.children[0]===keep&&target.name==='untouched','cancellation leaves target unchanged')
 })
 track(()=>{
  const target=new THREE.Group(),iter=batchL4StaticJob(target,roots);let transforms=0
  THREE.BufferGeometry.prototype.applyMatrix4=function(matrix){if(++transforms===3)throw new Error('intentional transform failure');return apply.call(this,matrix)}
  assert.throws(()=>{while(!iter.next().done){}},/intentional transform failure/);checks++
  check(target.children.length===0,'transform failure publishes no partial batch')
 })
 console.log(JSON.stringify({passed:checks,yields,cancelledGeometries}))
}finally{disposeOutput(expected);disposeOutput(actual);disposeOutput(sync);geometry.dispose();plane.dispose();solid.dispose();equivalent.dispose();glass.dispose()}
