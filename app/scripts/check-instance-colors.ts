import assert from 'node:assert/strict'
import * as THREE from 'three'
import { batchStaticInstanceColorsJob } from '../src/game/renderer/instanceColors'
import { geometryDataKey } from '../src/game/renderer/staticBatch'

let checks=0, cancellationPoints=0, cancelledGeometries=0, cancelledInstances=0
const check=(ok:boolean,label:string)=>{checks++;assert.ok(ok,label)}
const equal=(a:unknown,b:unknown,label:string)=>{checks++;assert.deepEqual(a,b,label)}
const bytes=(a:THREE.TypedArray)=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength)
const make=(color=0x874a32,count=3,basic=false)=>{
  const material=basic?new THREE.MeshBasicMaterial({color}):new THREE.MeshLambertMaterial({color})
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,count)
  mesh.name='l9-static-instanced'
  for(let i=0;i<count;i++)mesh.setMatrixAt(i,new THREE.Matrix4().compose(new THREE.Vector3(i*2,i%3,-i),new THREE.Quaternion().setFromEuler(new THREE.Euler(.1*i,.2*i,.05*i)),new THREE.Vector3(1+i%2,1,.7)))
  return mesh
}
const run=(group:THREE.Group)=>{const job=batchStaticInstanceColorsJob(group);let yields=0;while(!job.next().done)yields++;return yields}
const cleanup=(group:THREE.Group,materials:THREE.Material[])=>{
  group.traverse(o=>{const mesh=o as THREE.Mesh;if((o as THREE.InstancedMesh).isInstancedMesh)(o as THREE.InstancedMesh).dispose();mesh.geometry?.dispose()})
  for(const material of new Set(materials))material.dispose()
}
for(const basic of [false,true]){
  const group=new THREE.Group(),a=make(0x874a32,3,basic),b=make(0x321a9f,3,basic)
  for(const mesh of [a,b]){mesh.layers.set(2);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.noCastShadow=true}
  b.setMatrixAt(1,new THREE.Matrix4().makeTranslation(-5,3,-7));group.add(a,b)
  const states=[a,b].map(m=>JSON.stringify(m.material.toJSON())),matrices=new Float32Array([...a.instanceMatrix.array,...b.instanceMatrix.array])
  const colors=new Float32Array([a,b].flatMap(m=>Array.from({length:m.count},()=>m.material.color.toArray()).flat()))
  const released={instances:0,geometry:0,material:0}
  for(const mesh of [a,b]){mesh.addEventListener('dispose',()=>released.instances++);mesh.geometry.addEventListener('dispose',()=>released.geometry++);mesh.material.addEventListener('dispose',()=>released.material++)}
  run(group)
  const merged=group.children[0] as THREE.InstancedMesh<THREE.BufferGeometry,typeof a.material>
  check(group.children.length===1&&merged.name==='static-instance-color-batch'&&merged.isInstancedMesh,'one committed color instance batch')
  check(merged.count===6&&merged.material.type===a.material.type,'count and shading model preserved')
  equal(bytes(merged.instanceMatrix.array),bytes(matrices),'matrix bytes and order preserved')
  equal(bytes(merged.instanceColor!.array),bytes(colors),'linear colors stored per instance')
  check(merged.material.color.equals(new THREE.Color(1,1,1))&&!merged.material.vertexColors,'white material uses instance colors')
  check(merged.layers.mask===a.layers.mask&&merged.castShadow&&merged.receiveShadow&&merged.frustumCulled===a.frustumCulled&&merged.userData.noCastShadow===true,'render flags preserved')
  equal([a,b].map(m=>JSON.stringify(m.material.toJSON())),states,'source materials unchanged')
  equal(released,{instances:2,geometry:2,material:0},'consumed private resources release once, shared materials stay alive')
  const vertex=new THREE.Vector3(),matrix=new THREE.Matrix4(),position=merged.geometry.getAttribute('position'),bounds=merged.boundingBox!.clone().expandByScalar(1e-6)
  for(let i=0;i<merged.count;i++){merged.getMatrixAt(i,matrix);for(let v=0;v<position.count;v++){
    vertex.fromBufferAttribute(position,v).applyMatrix4(matrix)
    check(bounds.containsPoint(vertex),'box contains every transformed vertex')
    check(merged.boundingSphere!.center.distanceTo(vertex)<=merged.boundingSphere!.radius+1e-6,'sphere contains every transformed vertex')
  }}
  let materialDisposals=0;merged.material.addEventListener('dispose',()=>materialDisposals++)
  merged.geometry.dispose();merged.geometry.dispose();check(materialDisposals===1,'private material releases once with repeated geometry disposal')
  merged.dispose();a.material.dispose();b.material.dispose()
}
type Fixture=ReturnType<typeof make>
const noMerge=(label:string,change:(a:Fixture,b:Fixture)=>void)=>{
  const group=new THREE.Group(),a=make(),b=make(0x5a439c),materials=[a.material,b.material]
  change(a,b);group.add(a,b);run(group);check(group.children.length===2&&group.children[0]===a&&group.children[1]===b,label);cleanup(group,materials)
}
noMerge('sub-hash geometry differences stay separate',(a,b)=>{const p=b.geometry.getAttribute('position');p.setX(0,p.getX(0)+1e-6);check(geometryDataKey(a.geometry)===geometryDataKey(b.geometry),'fixture has identical quantized hash but different bytes')})
const exclusions:Record<string,(a:Fixture,b:Fixture)=>void>={
  uv:(_a,b)=>{const uv=b.geometry.getAttribute('uv');uv.setX(0,uv.getX(0)+1e-6)},
  index:(_a,b)=>b.geometry.index!.setX(0,b.geometry.index!.getX(1)),
  normalized:(_a,b)=>{b.geometry.getAttribute('uv').normalized=true},
  itemSize:(_a,b)=>{b.geometry.setAttribute('uv',new THREE.BufferAttribute(b.geometry.getAttribute('uv').array.slice(),1))},
  gpuType:(_a,b)=>{(b.geometry.getAttribute('uv') as THREE.BufferAttribute).gpuType=THREE.IntType},
  typedArray:(_a,b)=>{b.geometry.setAttribute('uv',new THREE.BufferAttribute(new Float64Array(b.geometry.getAttribute('uv').array),2))},
  interleaved:(_a,b)=>{b.geometry.setAttribute('uv',new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Float32Array(48),2),2,0))},
  instancedAttribute:(_a,b)=>{b.geometry.setAttribute('custom',new THREE.InstancedBufferAttribute(new Float32Array(3),1))},
  transparent:(_a,b)=>{b.material.transparent=true}, opacity:(_a,b)=>{b.material.opacity=.5},
  vertexColors:(_a,b)=>{b.material.vertexColors=true}, instanceColor:(_a,b)=>b.setColorAt(0,new THREE.Color()),
  morph:(_a,b)=>{b.geometry.morphAttributes.position=[b.geometry.getAttribute('position').clone()]},
  morphTexture:(_a,b)=>{b.morphTexture=new THREE.DataTexture()},
  children:(_a,b)=>{b.add(new THREE.Object3D())},transform:(_a,b)=>{b.position.x=1},name:(_a,b)=>{b.name='borrowed'},
  beforeRender:(_a,b)=>{b.onBeforeRender=()=>{}},afterRender:(_a,b)=>{b.onAfterRender=()=>{}},beforeShadow:(_a,b)=>{b.onBeforeShadow=()=>{}},
  raycast:(_a,b)=>{b.raycast=()=>{}},materialHook:(_a,b)=>{b.material.onBeforeRender=()=>{}},shaderHook:(_a,b)=>{b.material.onBeforeCompile=()=>{}},
  userData:(_a,b)=>{b.material.userData.pulse=1},emissive:(_a,b)=>{(b.material as THREE.MeshLambertMaterial).emissive.setHex(0x102030)},
  texture:(_a,b)=>{b.material.map=new THREE.Texture()},depth:(_a,b)=>{b.material.depthFunc=THREE.GreaterDepth},
  layers:(_a,b)=>b.layers.set(2),castShadow:(_a,b)=>{b.castShadow=true},receiveShadow:(_a,b)=>{b.receiveShadow=true},
  noCastShadow:(_a,b)=>{b.userData.noCastShadow=true},frustum:(_a,b)=>{b.frustumCulled=false},renderOrder:(_a,b)=>{b.renderOrder=1},
  drawRange:(_a,b)=>b.geometry.setDrawRange(3,6),visibility:(_a,b)=>{b.material.visible=false},
}
for(const [label,change] of Object.entries(exclusions))noMerge(`${label} stays separate or is excluded`,change)

const fixture=()=>{const group=new THREE.Group(),a=make(0x192b39,70),b=make(0x528629,70);group.add(a,b);return {group,a,b}}
const reference=fixture(),totalYields=run(reference.group)
check(totalYields>=8,'collect, allocation and every 32 copied instances yield');cleanup(reference.group,[reference.a.material,reference.b.material])
for(let stop=0;stop<=totalYields;stop++){
  const {group,a,b}=fixture(),job=batchStaticInstanceColorsJob(group),sources=[a,b]
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),instances=new Set<THREE.InstancedMesh>(),disposed=new Map<object,number>()
  const inc=(o:object)=>disposed.set(o,(disposed.get(o)??0)+1)
  const copy=THREE.BufferGeometry.prototype.copy,clone=THREE.Material.prototype.clone,setMatrix=THREE.InstancedMesh.prototype.setMatrixAt
  const disposeGeometry=THREE.BufferGeometry.prototype.dispose,disposeMaterial=THREE.Material.prototype.dispose,disposeInstance=THREE.InstancedMesh.prototype.dispose
  THREE.BufferGeometry.prototype.copy=function(source){const result=copy.call(this,source);geometries.add(this);return result}
  THREE.Material.prototype.clone=function(){const result=clone.call(this);materials.add(result);return result}
  THREE.InstancedMesh.prototype.setMatrixAt=function(index,matrix){if(!sources.includes(this as Fixture))instances.add(this);setMatrix.call(this,index,matrix)}
  THREE.BufferGeometry.prototype.dispose=function(){inc(this);disposeGeometry.call(this)}
  THREE.Material.prototype.dispose=function(){inc(this);disposeMaterial.call(this)}
  THREE.InstancedMesh.prototype.dispose=function(){inc(this);disposeInstance.call(this)}
  try{
    for(let step=0;step<stop;step++)check(!job.next().done,`cancel ${stop}: pause before publish`)
    job.return();job.return();cancellationPoints++
    equal(group.children,sources,`cancel ${stop}: sources remain attached`)
    for(const source of sources)for(const resource of [source,source.geometry,source.material])check(!disposed.has(resource),`cancel ${stop}: source remains alive`)
    for(const resource of [...geometries,...materials,...instances])check(disposed.get(resource)===1,`cancel ${stop}: private intermediate releases once`)
    cancelledGeometries+=geometries.size;cancelledInstances+=instances.size
  }finally{
    THREE.BufferGeometry.prototype.copy=copy;THREE.Material.prototype.clone=clone;THREE.InstancedMesh.prototype.setMatrixAt=setMatrix
    THREE.BufferGeometry.prototype.dispose=disposeGeometry;THREE.Material.prototype.dispose=disposeMaterial;THREE.InstancedMesh.prototype.dispose=disposeInstance
    cleanup(group,[a.material,b.material])
  }
}
check(cancelledGeometries>0&&cancelledInstances>0,'cancellation covers allocated partial instances')
console.log(JSON.stringify({checks,cancellationPoints,cancelledGeometries,cancelledInstances,totalYields}))
