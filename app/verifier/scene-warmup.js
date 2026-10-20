import * as THREE from 'three'
import { uploadSceneJob } from '/src/game/renderer/sceneWarmup.ts'

export async function verifySceneWarmup() {
  const renderer = new THREE.WebGLRenderer({canvas:document.createElement('canvas'),antialias:false})
  renderer.setSize(160,160,false)
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60,1,.1,100)
  camera.position.set(0,2,7);camera.lookAt(0,0,0);camera.updateMatrixWorld(true)
  const light = new THREE.DirectionalLight(0xffffff,2);light.position.set(2,4,3);scene.add(light,new THREE.AmbientLight(0xffffff,.5))
  const root = new THREE.Group(), parent = new THREE.Group();parent.position.x=.3;root.add(parent)
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshLambertMaterial({color:0x6884c4})
  for(let i=0;i<20;i++){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(i%5-2,Math.floor(i/5)-1.5,0);parent.add(mesh)}
  const instances=new THREE.InstancedMesh(geometry,material,2)
  instances.setMatrixAt(0,new THREE.Matrix4().makeTranslation(-1,0,1));instances.setMatrixAt(1,new THREE.Matrix4().makeTranslation(1,0,1));root.add(instances)
  const nested=new THREE.Mesh(geometry,material);parent.children[0].add(nested);nested.scale.setScalar(.4);nested.position.z=1
  root.updateMatrixWorld(true)
  const checks=[],assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const snapshots=[];root.traverse(o=>snapshots.push({o,parent:o.parent,children:o.children,items:[...o.children],frustum:o.frustumCulled,visible:o.visible,matrix:o.matrix.toArray(),world:o.matrixWorld.toArray()}))
  const unchanged=()=>snapshots.every(s=>s.o.parent===s.parent&&s.o.children===s.children&&s.o.children.every((o,i)=>s.items[i]===o)&&s.o.children.length===s.items.length&&s.o.frustumCulled===s.frustum&&s.o.visible===s.visible&&s.o.matrix.toArray().every((v,i)=>v===s.matrix[i])&&s.o.matrixWorld.toArray().every((v,i)=>v===s.world[i]))
  const gl=renderer.getContext(),pixels=()=>{const p=new Uint8Array(160*160*4);gl.readPixels(0,0,160,160,gl.RGBA,gl.UNSIGNED_BYTE,p);return p}
  try {
    renderer.setClearColor(0x345678,1);renderer.clear();const blank=pixels()
    let uploads=0;const originalBufferData=gl.bufferData.bind(gl);gl.bufferData=(...args)=>{uploads++;return originalBufferData(...args)}
    const job=uploadSceneJob(renderer,root,camera,scene);let steps=0
    try {
      for(let step=job.next();!step.done;step=job.next()){
        steps++;assert(unchanged(),`hierarchy and transforms restored at yield ${steps}`)
        assert(geometry.drawRange.count===Infinity,`draw range restored at yield ${steps}`)
        assert(renderer.autoClear&&renderer.shadowMap.autoUpdate,`renderer flags restored at yield ${steps}`)
        assert(pixels().every((v,i)=>v===blank[i]),`warmup does not touch canvas at yield ${steps}`)
      }
      assert(uploads>0,'warmup uploads actual geometry and instance buffers')
      const beforeUploads=uploads;scene.add(root);renderer.render(scene,camera);const warmed=pixels()
      assert(uploads===beforeUploads,'first visible render needs no further bufferData uploads')
      geometry.dispose();instances.dispose();renderer.render(scene,camera);const cold=pixels()
      assert(warmed.every((v,i)=>v===cold[i]),'warmed and normal GPU upload produce identical pixels')
      assert(gl.getError()===gl.NO_ERROR,'no WebGL error')
    } finally {gl.bufferData=originalBufferData}
    scene.remove(root)
    const streaming=new THREE.Group(),geometries=[]
    for(const [x,culled] of [[0,true],[1000,true],[1000,false]]){
      const g=new THREE.BoxGeometry();geometries.push(g)
      const mesh=new THREE.Mesh(g,material);mesh.position.x=x;mesh.frustumCulled=culled;streaming.add(mesh)
    }
    streaming.updateMatrixWorld(true)
    const beforeCount=renderer.info.memory.geometries
    try {
      const job=uploadSceneJob(renderer,streaming,camera,scene,true)
      while(!job.next().done){/* exercise the current-view streaming path */}
      assert(renderer.info.memory.geometries===beforeCount+2,'streaming skips offscreen buffers but honors disabled frustum culling')
      assert(streaming.children.every(o=>o.parent===streaming&&o.geometry.drawRange.count===Infinity),'streaming preserves hierarchy and geometry ranges')
    } finally {geometries.forEach(g=>g.dispose())}
    // A renderer failure must also restore shared geometry, hierarchy and flags.
    const originalRender=renderer.render;renderer.render=()=>{throw new Error('intentional upload failure')}
    const failing=uploadSceneJob(renderer,root,camera,scene);failing.next()
    try {failing.next();throw new Error('expected upload failure')}catch(error){assert(error.message==='intentional upload failure','upload failure is observable')}
    finally {renderer.render=originalRender}
    assert(unchanged()&&geometry.drawRange.count===Infinity,'failure restores objects and draw ranges')
    assert(renderer.autoClear&&renderer.shadowMap.autoUpdate,'failure restores renderer flags')
    const cancel=uploadSceneJob(renderer,root,camera,scene);cancel.next();cancel.next();cancel.return()
    assert(unchanged()&&geometry.drawRange.count===Infinity,'cancellation leaves no partial mutations')
  } finally {instances.dispose();geometry.dispose();material.dispose();renderer.dispose();renderer.forceContextLoss()}
  return {passed:checks.length,checks}
}
