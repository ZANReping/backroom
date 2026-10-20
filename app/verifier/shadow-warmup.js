import * as THREE from 'three'
import { compileSceneJob, uploadSceneJob } from '/src/game/renderer/sceneWarmup.ts'

export async function verifyShadowWarmup() {
  const checks=[],assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(128,128,false)
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,1,.1,30)
  camera.position.set(0,2,6);camera.lookAt(0,0,0)
  const flash=new THREE.SpotLight(0xffffff,30,20,.8),sun=new THREE.DirectionalLight(0xffffff,1)
  flash.position.set(0,3,5);sun.position.set(2,5,3)
  for(const light of [flash,sun]){light.castShadow=true;light.shadow.mapSize.set(64,64);scene.add(light,light.target)}
  renderer.render(scene,camera) // Allocate valid, independent shadow maps.
  for(const light of [flash,sun]){light.shadow.autoUpdate=false;light.shadow.needsUpdate=false}
  const geometry=new THREE.BoxGeometry(.3,.3,.3), texture=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)
  texture.needsUpdate=true
  const material=new THREE.MeshLambertMaterial({map:texture,alphaTest:.3,side:THREE.DoubleSide})
  const root=new THREE.Group()
  for(let i=0;i<12;i++){
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(i%4-1.5,Math.floor(i/4)-1,0)
    mesh.castShadow=true;root.add(mesh)
  }
  root.updateMatrixWorld(true)
  const gl=renderer.getContext(),pixels=()=>{const data=new Uint8Array(128*128*4);gl.readPixels(0,0,128,128,gl.RGBA,gl.UNSIGNED_BYTE,data);return data}
  const probeGeometry=new THREE.BoxGeometry(.4,.4,.4),probeMaterial=new THREE.MeshBasicMaterial()
  const probeRoot=new THREE.Group(),sideProbe=new THREE.Mesh(probeGeometry,probeMaterial),farProbe=new THREE.Mesh(probeGeometry,probeMaterial)
  sideProbe.name='shadow-probe-side';sideProbe.position.set(6,0,0);sideProbe.castShadow=true
  farProbe.name='shadow-probe-far';farProbe.position.set(20,20,20);farProbe.castShadow=true
  probeRoot.add(sideProbe,farProbe);probeRoot.updateMatrixWorld(true)
  let sunUpdates=0,flashUpdates=0,links=0
  const sunUpdate=sun.shadow.updateMatrices,flashUpdate=flash.shadow.updateMatrices,link=gl.linkProgram
  sun.shadow.updateMatrices=function(...args){sunUpdates++;return sunUpdate.apply(this,args)}
  flash.shadow.updateMatrices=function(...args){flashUpdates++;return flashUpdate.apply(this,args)}
  gl.linkProgram=function(...args){links++;return link.apply(this,args)}
  try {
    const oldRender=renderer.render, uploaded=[]
    flash.position.set(0,3,5);flash.target.position.set(6,0,0)
    flash.updateMatrixWorld(true);flash.target.updateMatrixWorld(true);camera.updateMatrixWorld(true)
    const shadowMatrixBefore=flash.shadow.matrix.elements.slice(),shadowCameraBefore=flash.shadow.camera.matrixWorld.elements.slice()
    renderer.render=(view)=>{uploaded.push(...view.children)}
    const probeJob=uploadSceneJob(renderer,probeRoot,camera,scene,true,flash)
    while(!probeJob.next().done) { /* collect every bounded batch */ }
    renderer.render=oldRender
    assert(uploaded.includes(sideProbe),'shadow frustum warms a caster outside the camera frustum')
    assert(!uploaded.includes(farProbe),'objects outside both frustums remain skipped')
    assert(shadowMatrixBefore.every((v,i)=>v===flash.shadow.matrix.elements[i]),'probe leaves real shadow matrix unchanged')
    assert(shadowCameraBefore.every((v,i)=>v===flash.shadow.camera.matrixWorld.elements[i]),'probe leaves real shadow camera unchanged')

    const compile=compileSceneJob(renderer,root,camera,scene)
    while(!compile.next().done)await new Promise(requestAnimationFrame)
    renderer.setClearColor(0x123456);renderer.clear();const blank=pixels()
    const job=uploadSceneJob(renderer,root,camera,scene,false,flash)
    let steps=0
    while(!job.next().done){
      steps++
      assert(pixels().every((v,i)=>v===blank[i]),`batch ${steps}: canvas unchanged`)
      assert(renderer.autoClear&&renderer.shadowMap.autoUpdate,`batch ${steps}: renderer flags restored`)
      assert(!sun.shadow.autoUpdate&&!sun.shadow.needsUpdate,`batch ${steps}: unrelated shadow flags restored`)
      assert(root.children.length===12&&root.children.every(o=>o.parent===root&&o.frustumCulled)&&geometry.drawRange.count===Infinity,`batch ${steps}: live geometry restored`)
    }
    assert(flashUpdates===2&&sunUpdates===0,'only flashlight shadow updated in two batches')
    assert(flash.shadow.needsUpdate,'zero-range shadow marked for a real refresh')
    const warmLinks=links;scene.add(root);renderer.render(scene,camera)
    assert(links===warmLinks,'first visible shadow draw submits no shader')
    assert(flashUpdates===3&&sunUpdates===0,'real shadow refreshed after warmup')
    assert(gl.getError()===gl.NO_ERROR,'no WebGL errors')
    scene.remove(root)
    const originalRender=renderer.render;renderer.render=()=>{throw new Error('intentional shadow warmup failure')}
    const failing=uploadSceneJob(renderer,root,camera,scene,false,flash);failing.next()
    try{failing.next();throw new Error('expected failure')}catch(error){assert(error.message==='intentional shadow warmup failure','failure observable')}
    finally{renderer.render=originalRender}
    assert(!sun.shadow.autoUpdate&&!sun.shadow.needsUpdate&&!flash.shadow.autoUpdate&&flash.shadow.needsUpdate,'failure restores shadow ownership and requests refresh')
    assert(renderer.autoClear&&renderer.shadowMap.autoUpdate&&geometry.drawRange.count===Infinity,'failure restores renderer and geometry')
  } finally {
    sun.shadow.updateMatrices=sunUpdate;flash.shadow.updateMatrices=flashUpdate;gl.linkProgram=link
    probeGeometry.dispose();probeMaterial.dispose();flash.shadow.dispose();sun.shadow.dispose();geometry.dispose();material.dispose();texture.dispose();renderer.dispose();renderer.forceContextLoss()
  }
  return {passed:checks.length,checks}
}
