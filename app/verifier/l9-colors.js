import { batchStaticColorsJob } from '/src/game/renderer/staticColors.ts'
import { cloneRenderGeometry } from '/src/game/renderer/renderGeometry.ts'

// Compare private copies with the original full L9 exterior, including real
// chunk transforms, inter-object depth ordering, lights and window transparency.
// Reproduce after integration: run .check/prepare-l9-color-baseline.mjs, then
// open /verifier/performance.html?l9ColorBaseline before invoking this verifier.
export async function verifyL9Colors() {
  const {renderer:r,engine:e,look}=perfQA,rows=[],checks=[]
  const assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  const oldYaw=look.yaw,oldPitch=look.pitch
  try {
    for(const mode of ['classic','realistic']) {
      r.setLightMode(mode);await perfQA.measure(9,5);e.paused=true
      const groups=[]
      r.scene.traverse(before=>{if(before.name==='l9-static-exterior-batch')groups.push({before,visible:before.visible})})
      assert(groups.every(({before})=>!before.children.some(child=>child.name==='static-color-batch')),'comparison uses the pre-color renderer (?l9ColorBaseline)')
      const sourceMaterials=new Set(),releasedSources=new Set(),listen=event=>releasedSources.add(event.target)
      for(const {before} of groups)before.traverse(o=>{if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])sourceMaterials.add(m)})
      for(const material of sourceMaterials)material.addEventListener('dispose',listen)
      const ownedMaterials=new Set(),releasedOwned=new Map(),track=event=>releasedOwned.set(event.target,(releasedOwned.get(event.target)??0)+1)
      try {
        for(const group of groups) {
          const after=group.before.clone(true)
          after.traverse(o=>{if(o.geometry)o.geometry=cloneRenderGeometry(o.geometry)})
          group.after=after
          const job=batchStaticColorsJob(after)
          try {let steps=0;while(!job.next().done)if(++steps%32===0)await new Promise(requestAnimationFrame)}finally{job.return()}
          after.traverse(o=>{if(o.material&&!Array.isArray(o.material)&&!sourceMaterials.has(o.material)){ownedMaterials.add(o.material);o.material.addEventListener('dispose',track)}})
          after.visible=false;group.before.parent.add(after)
        }
        assert(groups.length>0,`${mode}: actual L9 exterior groups exist`)
        if(mode==='classic')assert(ownedMaterials.size>0,'classic: diffuse colors actually merged')
        const gl=r.three.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight
        const draw=enabled=>{
          for(const group of groups){group.before.visible=!enabled&&group.visible;group.after.visible=enabled&&group.visible}
          r.three.shadowMap.needsUpdate=true;r.three.info.reset();r.three.render(r.scene,r.camera)
          const pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels)
          return {pixels,calls:r.three.info.render.calls}
        }
        for(const shadows of [false,true]) {
          r.setShadows(shadows)
          for(let pose=0;pose<24;pose++) {
            look.yaw=pose*Math.PI/12;look.pitch=pose>=12?-.16:.12
            r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},0)
            const now=Date.now,fixed=now();let before,after
            try {Date.now=()=>fixed;before=draw(false);after=draw(true)}finally{Date.now=now}
            let changed=0,large=0,total=0,maxDelta=0
            for(let i=0;i<before.pixels.length;i++){const delta=Math.abs(before.pixels[i]-after.pixels[i]);if(delta)changed++;if(delta>8)large++;total+=delta;maxDelta=Math.max(maxDelta,delta)}
            const row={mode,shadows,pose,groups:groups.length,callsBefore:before.calls,callsAfter:after.calls,changed,large,maxDelta,meanDelta:total/before.pixels.length}
            rows.push(row)
            assert(row.meanDelta<=.03&&large/before.pixels.length<=.0001,`L9 color pixels: ${JSON.stringify(row)}`)
            await new Promise(requestAnimationFrame)
          }
        }
      } finally {
        for(const group of groups){
          group.before.visible=group.visible;group.after?.removeFromParent()
          group.after?.traverse(o=>{if(o.isInstancedMesh)o.dispose();o.geometry?.dispose()})
        }
        assert(releasedSources.size===0,`${mode}: original shared materials remain alive`)
        assert([...ownedMaterials].every(material=>releasedOwned.get(material)===1),`${mode}: each private color material released once`)
        for(const material of sourceMaterials)material.removeEventListener('dispose',listen)
        for(const material of ownedMaterials)material.removeEventListener('dispose',track)
      }
    }
  } finally {look.yaw=oldYaw;look.pitch=oldPitch;r.setShadows(false);r.setLightMode('classic');r.applyView(e)}
  return {passed:checks.length,comparisons:rows.length,checks,rows}
}
