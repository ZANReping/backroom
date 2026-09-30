import * as THREE from 'three'
import { batchStaticInstanceColorsJob } from '/src/game/renderer/instanceColors.ts'
import { cloneRenderGeometry } from '/src/game/renderer/renderGeometry.ts'

// Run against the renderer before this pass (or ?instanceColorBaseline once
// integrated). Copies are private; original world resources are never consumed.
export async function verifyInstanceColors() {
  const {renderer:r,engine:e,look}=perfQA,checks=[],rows=[]
  const assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const saved={yaw:look.yaw,pitch:look.pitch,mode:r.lightMode,flash:r.flashShadowsOn,sun:r.sunShadowsOn,lights:r.lightShadowCount,paused:e.paused}
  let rayChecks=0
  try {
    for(const mode of ['classic','realistic']) {
      r.setLightMode(mode);await perfQA.measure(9,5);e.paused=true
      const groups=[]
      r.scene.traverse(before=>{if(before.name==='l9-static-exterior-batch')groups.push({before,visible:before.visible})})
      assert(groups.length>0&&groups.every(({before})=>!before.children.some(o=>o.name==='static-instance-color-batch')),'baseline contains original instance groups')
      const shared=new Set(),releasedShared=new Set(),privateMaterials=new Set(),releasedPrivate=new Map()
      const onShared=event=>releasedShared.add(event.target),onPrivate=event=>releasedPrivate.set(event.target,(releasedPrivate.get(event.target)??0)+1)
      for(const {before} of groups)before.traverse(o=>{if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])shared.add(m)})
      for(const material of shared)material.addEventListener('dispose',onShared)
      try {
        for(const entry of groups){
          entry.after=entry.before.clone(true)
          entry.after.traverse(o=>{if(o.geometry)o.geometry=cloneRenderGeometry(o.geometry)})
          const job=batchStaticInstanceColorsJob(entry.after)
          try{let steps=0;while(!job.next().done)if(++steps%32===0)await new Promise(requestAnimationFrame)}finally{job.return()}
          entry.after.traverse(o=>{if(o.material&&!Array.isArray(o.material)&&!shared.has(o.material)){privateMaterials.add(o.material);o.material.addEventListener('dispose',onPrivate)}})
          entry.after.visible=false;entry.before.parent.add(entry.after)
        }
        if(mode==='classic')assert(privateMaterials.size>0,'classic actually combines instance colors')
        const use=after=>{for(const group of groups){group.before.visible=!after&&group.visible;group.after.visible=after&&group.visible}}
        const gl=r.three.getContext(),draw=after=>{
          use(after);r.three.shadowMap.needsUpdate=true;r.three.info.reset();r.three.render(r.scene,r.camera)
          const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4)
          gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels)
          assert(gl.getError()===gl.NO_ERROR,'WebGL draw succeeds')
          return {pixels,calls:r.three.info.render.calls}
        }
        for(const shadows of [false,true]){
          r.setShadows(shadows);r.setSunShadows(shadows);r.setLightShadows(shadows?2:0)
          for(let pose=0;pose<24;pose++){
            use(false);look.yaw=pose*Math.PI/12;look.pitch=pose>=12?-.16:.12
            r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},0)
            const now=Date.now,fixed=now();let before,after
            try{Date.now=()=>fixed;before=draw(false);after=draw(true)}finally{Date.now=now}
            let maxDelta=0,changed=0,large=0,total=0
            for(let i=0;i<before.pixels.length;i++){const delta=Math.abs(before.pixels[i]-after.pixels[i]);maxDelta=Math.max(maxDelta,delta);if(delta)changed++;if(delta>8)large++;total+=delta}
            const row={mode,shadows,pose,maxDelta,changed,large,meanDelta:total/before.pixels.length,callsBefore:before.calls,callsAfter:after.calls}
            rows.push(row)
            assert(maxDelta<=16&&changed/before.pixels.length<=.0001&&row.meanDelta<=.0001,`instance-color pixels: ${JSON.stringify(row)}`)
            await new Promise(requestAnimationFrame)
          }
        }
        const signature=hits=>hits.map(hit=>JSON.stringify({distance:+hit.distance.toFixed(7),point:hit.point.toArray().map(n=>+n.toFixed(7)),face:hit.faceIndex})).sort()
        const ray=new THREE.Raycaster(),matrix=new THREE.Matrix4(),center=new THREE.Vector3()
        for(const {before,after} of groups.slice(0,5)){
          const mesh=before.children.find(o=>o.isInstancedMesh);if(!mesh)continue
          if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox()
          mesh.getMatrixAt(0,matrix);matrix.premultiply(mesh.matrixWorld);mesh.geometry.boundingBox.getCenter(center).applyMatrix4(matrix)
          for(const direction of [new THREE.Vector3(1,.3,.2),new THREE.Vector3(-1,.2,.3),new THREE.Vector3(.2,.3,1)]){
            const origin=center.clone().add(direction.normalize().multiplyScalar(8));ray.set(origin,center.clone().sub(origin).normalize())
            assert(JSON.stringify(signature(ray.intersectObject(before,true)))===JSON.stringify(signature(ray.intersectObject(after,true))),'all ray intersections preserve distance, position and face');rayChecks++
          }
        }
      } finally {
        for(const entry of groups){entry.before.visible=entry.visible;entry.after?.removeFromParent();entry.after?.traverse(o=>{if(o.isInstancedMesh)o.dispose();o.geometry?.dispose()})}
        assert(releasedShared.size===0,`${mode}: source materials stay alive`)
        assert([...privateMaterials].every(material=>releasedPrivate.get(material)===1),`${mode}: each private material released once`)
        for(const material of shared)material.removeEventListener('dispose',onShared)
        for(const material of privateMaterials)material.removeEventListener('dispose',onPrivate)
      }
    }
  } finally {look.yaw=saved.yaw;look.pitch=saved.pitch;e.paused=saved.paused;r.setShadows(saved.flash);r.setSunShadows(saved.sun);r.setLightShadows(saved.lights);r.setLightMode(saved.mode);r.applyView(e)}
  return {passed:checks.length,comparisons:rows.length,rayChecks,checks,rows}
}
