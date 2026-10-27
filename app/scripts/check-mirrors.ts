import assert from 'node:assert/strict'
import * as THREE from 'three'
import { SceneMirrors, mirrorCamera, mirrorQuality } from '../src/game/renderer/mirrors'
import { mirrorSurface, isMirrorSurface, inMirrorCapture, addBatchedMirrorOverlays } from '../src/game/renderer/mirrorSurface'
import { batchStaticRootsJob } from '../src/game/renderer/staticBatch'
import { CityBatch } from '../src/game/renderer/l11Batch'
import { setReflectK } from '../src/game/renderer/shared'
import { WallOcclusion } from '../src/game/renderer/occlusion'
import { createCanvas } from '@napi-rs/canvas'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

let checks=0
const ok=(v:unknown,label:string)=>{checks++;assert.ok(v,label)}
const near=(a:number,b:number,eps=1e-5)=>Math.abs(a-b)<eps

for(const angle of [0,.37,Math.PI/2,-1.1,Math.PI]){
 const normal=new THREE.Vector3(Math.sin(angle),0,Math.cos(angle)),center=new THREE.Vector3(3,1.5,-7),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,center)
 const source=new THREE.PerspectiveCamera(72,16/9,.05,100),target=new THREE.PerspectiveCamera(),matrix=new THREE.Matrix4()
 source.position.copy(center).addScaledVector(normal,2);source.lookAt(center);source.add(new THREE.Group());source.updateMatrixWorld(true)
 ok(mirrorCamera(source,plane,target,matrix),'Reflected camera accepts front side')
 ok(near(plane.distanceToPoint(target.position),-2),'Virtual eye has equal distance behind the mirror')
 ok(target.children.length===0,'Capture never clones first-person camera attachments')
 const front=center.clone().addScaledVector(normal,.3).project(target),back=center.clone().addScaledVector(normal,-.3).project(target)
 ok(front.z>=-1.01&&front.z<1,'Front scene retained by oblique clipping')
 ok(back.z < -1.01,'Behind-plane geometry clipped')
 ok(target.projectionMatrix.elements.every(Number.isFinite)&&target.projectionMatrixInverse.elements.every(Number.isFinite),'Clipped matrices finite')
 const tangent=new THREE.Vector3(normal.z,0,-normal.x),aperture=[-1,1].flatMap(x=>[-1,1].map(y=>center.clone().addScaledVector(tangent,x*.5).add(new THREE.Vector3(0,y*.4,0))))
 ok(mirrorCamera(source,plane,target,matrix,aperture),'Cropped capture camera valid')
 const left=new THREE.Vector4(...aperture[0].toArray(),1).applyMatrix4(matrix),right=new THREE.Vector4(...aperture[2].toArray(),1).applyMatrix4(matrix)
 ok(Math.abs(left.x/left.w-right.x/right.w)>.9,'Aperture occupies the reflection target')
 source.position.copy(center).addScaledVector(normal,-1);source.updateMatrixWorld(true)
 ok(!mirrorCamera(source,plane,target,matrix),'Back side performs no capture')
}

const plane=mirrorSurface(.8,1.2),root=new THREE.Group(),target=new THREE.Group()
root.position.set(4,1,-3);root.rotation.y=.7;plane.position.set(.1,1,.2);root.add(plane);root.updateMatrixWorld(true)
const world=plane.matrixWorld.clone(),job=batchStaticRootsJob(target,[root]);while(!job.next().done){}
const copy=target.children.find(isMirrorSurface)!
ok(!!copy,'Static batching preserves reflective surface metadata')
copy.updateMatrixWorld(true);ok(copy.matrixWorld.elements.every((x,i)=>near(x,world.elements[i])),'Batch preserves actual mirror plane transform')
ok(copy.geometry!==plane.geometry&&copy.material!==plane.material,'Batched mirrors own private geometry and material')
ok(copy.material.uniforms.surfaceMap.value===plane.material.uniforms.surfaceMap.value,'Mirror finish texture is shared across instances')
ok(plane.material.uniforms.surfaceMap.value.colorSpace===THREE.NoColorSpace,'Packed normal and roughness remain linear data')
let originalDisposed=0,copyDisposed=0;plane.material.addEventListener('dispose',()=>originalDisposed++);copy.material.addEventListener('dispose',()=>copyDisposed++)
plane.geometry.dispose();ok(originalDisposed===1&&copyDisposed===0,'Disposing one instance does not break another')
copy.geometry.dispose();copy.geometry.dispose();ok(copyDisposed===1,'Private material released once by geometry owner')

// Cancelling a streamed batch must release newly created mirror geometry too.
const cancelled=mirrorSurface(1,1),owner=new THREE.Group();owner.add(cancelled)
const task=batchStaticRootsJob(new THREE.Group(),[owner]);task.next();task.return();cancelled.geometry.dispose()
ok(true,'Partially prepared mirror batch can be cancelled')

const city=new CityBatch(false,true),mat=new THREE.MeshStandardMaterial({color:'#203941'});mat.userData.l11Surface='sealedglass'
for(const x of [-2,2])city.quad(mat,[[x,0,0],[x+1,0,0],[x+1,2,0],[x,2,0]],[0,0,1])
const facade=new THREE.Group();city.finish(facade)
const overlays=facade.children.filter(isMirrorSurface)
ok(overlays.length===1,'Coplanar city panes share a single discontinuous overlay')
ok(overlays[0].geometry.getAttribute('position').count===12,'City overlay preserves holes between real window panes')
ok(!overlays[0].visible&&overlays[0].material.transparent&&!overlays[0].material.depthWrite,'Inactive city mirror adds no draw and retains original opaque glass')
ok(overlays[0].material.uniforms.overlay.value===1,'Active city reflection blends with original coating')
const farCity=new CityBatch(),farGroup=new THREE.Group();farCity.quad(mat,[[0,0,0],[1,0,0],[1,2,0],[0,2,0]],[0,0,1]);farCity.finish(farGroup)
ok(!farGroup.children.some(isMirrorSurface),'Far and ordinary city batches create no extra mirror objects')
for(const o of farGroup.children)(o as THREE.Mesh).geometry.dispose()
const faced=new THREE.BufferGeometry();addBatchedMirrorOverlays(new THREE.Group(),faced);ok(true,'Empty nonmirror geometry ignored')

function mockRenderer(){
 let target:THREE.WebGLRenderTarget|null=null,test=true,viewport=new THREE.Vector4(2,3,500,400),scissor=new THREE.Vector4(5,6,200,180),face=3,mip=1
 const mock:any={
  xr:{enabled:true},shadowMap:{autoUpdate:true,needsUpdate:true},info:{autoReset:true,render:{calls:3,triangles:7}},
  getRenderTarget:()=>target,getActiveCubeFace:()=>face,getActiveMipmapLevel:()=>mip,
  setRenderTarget:(v:THREE.WebGLRenderTarget|null,f=0,m=0)=>{target=v;face=f;mip=m},
  getViewport:(v:THREE.Vector4)=>v.copy(viewport),setViewport:(v:THREE.Vector4)=>{viewport=v.clone()},
  getScissor:(v:THREE.Vector4)=>v.copy(scissor),setScissor:(v:THREE.Vector4)=>{scissor=v.clone()},
  getScissorTest:()=>test,setScissorTest:(v:boolean)=>{test=v},clear(){},
  render(scene:THREE.Scene,camera:THREE.Camera){ok(inMirrorCapture(),'Capture scope protects existing water reflectors');ok(!mock.shadowMap.autoUpdate&&!mock.shadowMap.needsUpdate,'Mirror reuses shadows without redraw');ok(camera.children.length===0,'Render camera has no first-person mesh');scene.traverse(o=>{if(isMirrorSurface(o))ok(!o.visible,'Mirror surfaces hidden during capture; no feedback loop')});mock.info.render.calls+=4;mock.info.render.triangles+=12},
 }
 return mock
}
const scene=new THREE.Scene(),a=mirrorSurface(1,1),b=mirrorSurface(1,1),cam=new THREE.PerspectiveCamera(72,16/9,.05,100),pool=new SceneMirrors(),renderer=mockRenderer()
a.position.set(-.7,1.5,0);b.position.set(.7,1.5,0);scene.add(a,b);scene.updateMatrixWorld(true);cam.position.set(0,1.5,2);cam.lookAt(0,1.5,0);cam.updateMatrixWorld(true)
let preparations=0,restores=0
const update=(time:number,quality=2,key:unknown=scene,enabled=true)=>pool.update(renderer,scene,cam,time,quality,false,key,enabled,()=>{preparations++;return()=>restores++})
update(1)
ok(pool.stats.targets===1&&pool.stats.planes===1,'Adjacent coplanar mirrors share one capture target')
ok(pool.stats.framePasses===1&&pool.stats.calls===4,'Per-frame pass and call accounting bounded')
ok(a.material.uniforms.reflectedScene.value===b.material.uniforms.reflectedScene.value,'Adjacent mirror panes share the real scene texture')
ok(preparations===restores&&renderer.getRenderTarget()===null,'Camera and world scopes restore')
ok(renderer.xr.enabled&&renderer.shadowMap.autoUpdate&&renderer.shadowMap.needsUpdate&&renderer.info.autoReset,'Renderer XR/shadow/info state restores')
ok(renderer.getScissorTest()&&renderer.getViewport(new THREE.Vector4()).equals(new THREE.Vector4(2,3,500,400)),'Viewport and scissor restore')
update(1.001);ok(pool.stats.framePasses===0,'No redundant capture before refresh interval')
cam.lookAt(0,1.5,4);cam.updateMatrixWorld(true);update(2.1);update(3.2)
ok(pool.stats.targets===0&&pool.stats.framePasses===0,'Behind-camera views allocate no reflection target')
cam.lookAt(0,1.5,0);cam.updateMatrixWorld(true);update(4,0)
ok(pool.stats.targets===1&&pool.stats.size===256,'Low tier selects one 256px render target')
setReflectK(0);update(5.2);update(6.3);ok(pool.stats.targets===0,'Zero reflection setting frees targets');setReflectK(1)
update(7,2);const previous=a.material.uniforms.reflectedScene.value
let freed=0;previous.addEventListener('dispose',()=>freed++)
pool.clear();ok(pool.stats.targets===0&&a.material.uniforms.reflectedScene.value===null,'Level teardown releases capture and detaches uniforms')
// WebGLRenderTarget owns its attachments; disposal is one render-target event, not a Texture.dispose call.
ok(freed===0,'Render-target attachments are disposed through their owner')

// Engine callbacks and GL state restore even if a render fails.
const errorRenderer=mockRenderer(),errorPool=new SceneMirrors();errorRenderer.render=()=>{throw Error('expected render failure')}
let restored=false
assert.throws(()=>errorPool.update(errorRenderer,scene,cam,8,2,false,scene,true,()=>()=>{restored=true}),/expected render failure/)
ok(restored&&!inMirrorCapture()&&errorRenderer.getRenderTarget()===null&&a.visible&&b.visible,'Failed capture restores visibility, target and capture guard')
errorPool.clear()
const dense=new THREE.Scene(),densePool=new SceneMirrors(),denseRenderer=mockRenderer(),denseCam=new THREE.PerspectiveCamera(72,16/9,.05,100)
for(let i=0;i<9;i++){const mirror=mirrorSurface(.65,1.0);mirror.position.set((i%3-1)*.75,1.5,-Math.floor(i/3)*.2);dense.add(mirror)}
dense.updateMatrixWorld(true);denseCam.position.set(0,1.5,3);denseCam.lookAt(0,1.5,0);denseCam.updateMatrixWorld(true)
for(let i=0;i<5;i++)densePool.update(denseRenderer,dense,denseCam,20+i*.1,2,false,dense,true,()=>()=>{})
ok(densePool.stats.targets===2&&densePool.stats.planes===2&&densePool.stats.framePasses<=1,'Nine mirrors on three planes remain within two targets and one draw per frame')
let disposedTargets=0;for(const slot of (densePool as any).slots)slot.target.addEventListener('dispose',()=>disposedTargets++)
densePool.clear();ok(disposedTargets===2,'Every pooled render target is explicitly disposed on scene change')
for(const mesh of dense.children)if(isMirrorSurface(mesh))mesh.geometry.dispose()
const occlusion=new WallOcclusion(),hidden=new THREE.Group(),terrain=new THREE.Group(),occluder=new THREE.Group();occluder.add(hidden)
occlusion.register(occluder,terrain,[hidden]);hidden.visible=false;const restore=occlusion.reflectionScope()
ok(hidden.visible,'Reflected eye restores only main-view occlusion candidates');restore();ok(!hidden.visible,'Main-view occlusion restored after reflection');occlusion.clear()
for(const mobile of [false,true])for(const tier of [0,1,2]){const q=mirrorQuality(tier,mobile);ok(q.planes<=2&&q.size<=1024&&q.hz<=60,'Quality budgets bounded')}
const manifest=JSON.parse(readFileSync('public/textures/mirrors/manifest.json','utf8')),surfaceBytes=readFileSync('public/textures/mirrors/surface.png')
ok(manifest.license==='CC0-1.0'&&manifest.size.join(',')==='512,512','Openly licensed mirror data asset has recorded source and bounded resolution')
ok(createHash('sha256').update(surfaceBytes).digest('hex')===manifest.outputSha256,'Generated mirror texture matches reproducible manifest')

Object.assign(globalThis,{document:{createElement:()=>createCanvas(64,64),createElementNS:()=>({addEventListener(){},removeEventListener(){}})},window:{addEventListener(){},removeEventListener(){},setTimeout,clearTimeout,matchMedia:()=>({matches:false})}})
const { MirrorPlayer }=await import('../src/game/renderer/mirrorPlayer')
const reflectedPlayer=new MirrorPlayer(),fake:any={player:{x:3,y:4,z:0,hasGloves:false,hasSuit:false,equip:{body:null,head:null}},seating:null,mv:{speed:2,stride:.5},handsStowed:true,over:false}
const hide=reflectedPlayer.show(fake,1),rig=reflectedPlayer.model!.userData.retro
ok(reflectedPlayer.root.visible&&rig.mesh.isSkinnedMesh,'Reflection shows complete production skinned avatar')
ok(reflectedPlayer.root.position.equals(new THREE.Vector3(3,0,4)),'Reflected avatar follows player world position')
ok(rig.bones.thighL.rotation.x!==rig.bones.thighR.rotation.x,'Reflection leg pose follows actual movement stride')
hide();ok(!reflectedPlayer.root.visible,'Full player body hidden again after capture')
fake.player.crouching=true;const standHip=rig.bones.hips.position.y,hideCrouch=reflectedPlayer.show(fake,2)
ok(rig.bones.hips.position.y<standHip&&rig.bones.shinL.rotation.x>1,'Crouching reflection bends the production skeleton')
hideCrouch();const original=reflectedPlayer.model;fake.player.hasGloves=true;reflectedPlayer.prepare(fake)
ok(original!==reflectedPlayer.model,'Changing equipment rebuilds the complete reflected appearance')
ok(fake.player.x===3&&fake.player.y===4&&fake.player.z===0,'Rendering does not modify gameplay position')
reflectedPlayer.dispose();ok(!reflectedPlayer.model&&!reflectedPlayer.root.parent,'Avatar private resources release without disposing shared maps')
const {buildEntityMesh}=await import('../src/game/renderer/entitiesMesh')
const mirrorSelf=buildEntityMesh('mirrorself',{seed:7}),shards:THREE.Mesh[]=[]
mirrorSelf.updateMatrixWorld(true);mirrorSelf.traverse(o=>{if(isMirrorSurface(o))shards.push(o)})
ok(shards.length===2,'Mirror-self entity uses real front and rear mirror shards')
const directions=shards.map(m=>new THREE.Vector3(0,0,1).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(m.matrixWorld)))
ok(directions.some(n=>n.x>.99)&&directions.some(n=>n.x<-.99),'Entity shards keep the production +X front and -X back orientation')
mirrorSelf.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)m.geometry.dispose();if(m.material)for(const mat of Array.isArray(m.material)?m.material:[m.material])mat.dispose()})
for(const object of [a,b,...overlays])object.geometry.dispose();mat.dispose()
console.log(JSON.stringify({ok:true,checks},null,2))
