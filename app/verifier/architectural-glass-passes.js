import * as THREE from 'three'
import { architecturalGlassMaterial, architecturalGlassPassMaterials, getReflectK } from '/src/game/renderer/shared.ts'

function glassTargets(renderer, pair) {
  const targets=[]
  renderer.scene.traverse(mesh=>{
    if(mesh.isMesh && mesh.material===pair) targets.push(mesh)
  })
  if(!targets.length) throw new Error('No baked L9 architectural glass')
  return targets
}

export async function verifyArchitecturalGlassPasses() {
  const {renderer:r,engine:e,look}=perfQA, checks=[],rows=[]
  const assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const source=architecturalGlassMaterial(),pair=architecturalGlassPassMaterials()
  const saved={yaw:look.yaw,pitch:look.pitch,reflect:getReflectK(),paused:e.paused,
    mode:r.lightMode,flash:r.flashShadowsOn,sun:r.sunShadowsOn,lights:r.lightShadowCount}
  let targets=[],baselineVersionChanges=0,rayChecks=0
  const use=material=>{for(const mesh of targets)mesh.material=material}
  const gl=r.three.getContext()
  const draw=()=>{
    r.three.shadowMap.needsUpdate=true;r.three.info.reset();r.three.render(r.scene,r.camera)
    const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4)
    gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels)
    assert(gl.getError()===gl.NO_ERROR,'WebGL draw and readback succeed')
    return {pixels,calls:r.three.info.render.calls}
  }
  try {
    for(const mode of ['classic','realistic']) {
      use(pair);targets=[];r.setLightMode(mode);await perfQA.measure(9,5);e.paused=true
      targets=glassTargets(r,pair)
      assert(targets.length>0,`${mode}: shared glass pair found`)
      for(const mesh of targets){
        const count=mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count
        assert(mesh.geometry.groups.length===2&&mesh.geometry.groups.every((g,i)=>g.start===0&&g.count===count&&g.materialIndex===i),'back/front groups cover full geometry in order')
      }
      assert(pair[0].side===THREE.BackSide&&pair[1].side===THREE.FrontSide&&pair.every(m=>m.forceSinglePass),'stable material sides retain both passes')
      for(const shadows of [false,true]) {
        r.setShadows(shadows);r.setSunShadows(shadows);r.setLightShadows(shadows?2:0)
        for(const reflect of [0,60,100]) {
          use(source);r.setReflectivity(reflect)
          assert(Math.abs(source.envMapIntensity-.32*reflect/60)<1e-9,'baseline reflection updated')
          use(pair);r.setReflectivity(reflect)
          assert(pair.every(m=>Math.abs(m.envMapIntensity-.32*reflect/60)<1e-9),'both pass materials receive reflection setting')
          for(let pose=0;pose<12;pose++) {
            look.yaw=pose*Math.PI/6;look.pitch=pose%2?.12:-.12
            r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},0)
            const versions=pair.map(m=>m.version),originalVersion=source.version,now=Date.now,fixed=now()
            let before,after
            try {Date.now=()=>fixed;use(source);before=draw();use(pair);after=draw()}
            finally {Date.now=now;use(pair)}
            baselineVersionChanges+=source.version-originalVersion
            let maxDelta=0
            for(let i=0;i<before.pixels.length;i++)maxDelta=Math.max(maxDelta,Math.abs(before.pixels[i]-after.pixels[i]))
            const label=`${mode}/${shadows}/${reflect}/${pose}`
            assert(maxDelta===0,`${label}: identical pixels (delta ${maxDelta})`)
            assert(before.calls===after.calls,`${label}: unchanged draw count`)
            assert(pair.every((m,i)=>m.version===versions[i]),`${label}: no pass material version churn`)
            rows.push({mode,shadows,reflect,pose,maxDelta,calls:before.calls})
            await new Promise(requestAnimationFrame)
          }
        }
      }
      const ray=new THREE.Raycaster(),signature=hits=>JSON.stringify(hits.map(h=>({distance:h.distance,point:h.point.toArray(),faceIndex:h.faceIndex})))
      for(const mesh of targets.slice(0,8)) {
        const box=new THREE.Box3().setFromObject(mesh),center=box.getCenter(new THREE.Vector3()),radius=box.getSize(new THREE.Vector3()).length()*2
        for(const direction of [new THREE.Vector3(1,.2,0),new THREE.Vector3(-1,.15,.3),new THREE.Vector3(.4,.3,1)]) {
          const origin=center.clone().add(direction.normalize().multiplyScalar(radius))
          ray.set(origin,center.clone().sub(origin).normalize())
          mesh.material=source;const before=ray.intersectObject(mesh,false)
          mesh.material=pair;const after=ray.intersectObject(mesh,false)
          assert(signature(before)===signature(after),'all ray intersections preserve distance, position and face');rayChecks++
        }
      }
    }
    assert(baselineVersionChanges>0,'baseline exercises repeated double-sided material invalidation')
  } finally {
    use(pair);look.yaw=saved.yaw;look.pitch=saved.pitch;e.paused=saved.paused
    r.setReflectivity(saved.reflect*60);source.envMapIntensity=.32*saved.reflect
    r.setShadows(saved.flash);r.setSunShadows(saved.sun);r.setLightShadows(saved.lights);r.setLightMode(saved.mode);r.applyView(e)
  }
  return {passed:checks.length,comparisons:rows.length,rayChecks,baselineVersionChanges,rows,checks}
}

export async function measureGlassPassPairs(samples=240) {
  const {renderer:r,engine:e,look}=perfQA
  if(e.player.level!==9)throw new Error('Prepare L9 first')
  const pair=architecturalGlassPassMaterials(),source=architecturalGlassMaterial(),targets=glassTargets(r,pair),rows=[]
  const saved={yaw:look.yaw,pitch:look.pitch,rotation:r.camera.rotation.clone(),paused:e.paused,sourceIntensity:source.envMapIntensity}
  const use=material=>{for(const mesh of targets)mesh.material=material}
  const draw=stable=>{
    use(stable?pair:source);r.three.info.reset()
    const started=performance.now();r.three.render(r.scene,r.camera)
    return {cpu:performance.now()-started,calls:r.three.info.render.calls}
  }
  try {
    e.paused=true;source.envMapIntensity=pair[0].envMapIntensity
    for(let i=0;i<16;i++){await new Promise(requestAnimationFrame);draw(false);draw(true)}
    for(let i=0;i<samples;i++){
      await new Promise(requestAnimationFrame)
      // applyView updates the engine's input ray, not the render camera. Rotate
      // the actual camera while keeping the sampled world frozen.
      r.camera.rotation.y=saved.rotation.y+i*Math.PI*2/samples;r.camera.updateMatrixWorld(true)
      const row={};for(const stable of i%2?[true,false]:[false,true])row[stable?'stable':'original']=draw(stable)
      if(row.stable.calls!==row.original.calls)throw new Error('Draw count changed')
      rows.push(row)
    }
  } finally {use(pair);look.yaw=saved.yaw;look.pitch=saved.pitch;e.paused=saved.paused;source.envMapIntensity=saved.sourceIntensity;r.camera.rotation.copy(saved.rotation);r.camera.updateMatrixWorld(true);r.applyView(e)}
  const p=(values,q)=>[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*q)]
  const summary=key=>({cpuP50:p(rows.map(row=>row[key].cpu),.5),cpuP90:p(rows.map(row=>row[key].cpu),.9),callsP50:p(rows.map(row=>row[key].calls),.5)})
  return {meshes:targets.length,samples:rows.length,original:summary('original'),stable:summary('stable'),rows}
}
