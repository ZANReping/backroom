import * as THREE from 'three'
import { architecturalGlassPassMaterials } from '/src/game/renderer/shared.ts'

export async function verifyL9ColorCancellation() {
  const {renderer:r,engine:e}=perfQA,checks=[],rows=[]
  const assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label)}
  for(const phase of ['collecting','partly-merged','instance-merged','compiling']) {
    e.loadLevel(9,{mapSeed:424242,firstVisit:false});e.paused=true
    r.buildInfiniteEnv(e.map,e.levelDef)
    const chunk=[...e.map.inf.chunks.values()].sort((a,b)=>b.structures.filter(s=>s.kind==='house').length-a.structures.filter(s=>s.kind==='house').length)[0]
    const add=THREE.Object3D.prototype.add,compile=r.three.compileAsync
    const geometries=new Map(),materials=new Map(),instances=new Map(),shared=new Map(),listeners=[]
    const watch=(resource,map)=>{if(!map.has(resource)){const listener=()=>map.set(resource,map.get(resource)+1);map.set(resource,0);resource.addEventListener('dispose',listener);listeners.push([resource,listener])}}
    const glassPair=architecturalGlassPassMaterials();watch(glassPair[0],shared);watch(glassPair[1],shared)
    let exterior,chunkRoot,submitted=0,combined=0,release
    const gate=new Promise(resolve=>release=resolve)
    THREE.Object3D.prototype.add=function(...objects){
      const result=add.apply(this,objects)
      for(const object of objects) {
        if(object.name==='l9-static-exterior-batch') {
          exterior=object;chunkRoot=this
          object.traverse(o=>{if(o.geometry)watch(o.geometry,geometries);if(o.isInstancedMesh)watch(o,instances);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])watch(m,shared)})
        }
        if(this===exterior&&(object.name==='static-color-batch'||object.name==='static-instance-color-batch')){
          watch(object.geometry,geometries);watch(object.material,materials)
          if(object.isInstancedMesh){watch(object,instances);combined++}
        }
      }
      return result
    }
    if(phase==='compiling')r.three.compileAsync=function(...args){submitted++;return compile.apply(this,args).then(()=>gate)}
    const job=r.buildInfiniteChunk(e.map,e.levelDef,chunk)
    let steps=0
    try {
      const started=performance.now()
      while(!(phase==='collecting'?!!exterior:phase==='partly-merged'?materials.size>0:phase==='instance-merged'?combined>0:submitted>0)) {
        assert(!job.next().done,`${phase}/${steps}: chunk remains unpublished before cancellation`)
        if(++steps%32===0)await new Promise(requestAnimationFrame)
        if(performance.now()-started>30_000)throw new Error(`L9 cancellation stage timed out: ${phase}`)
      }
      assert(exterior?.parent===chunkRoot&&chunkRoot.parent===null,`${phase}: chunk owns the unpublished batch`)
      if(phase==='compiling'){const count=[];exterior.traverse(o=>{if(Array.isArray(o.material)&&o.material[0]===glassPair[0]&&o.material[1]===glassPair[1])count.push(o)});assert(count.length>0,'compiling: cancelled chunk owns prepared glass passes')}
      if(phase!=='collecting')assert(materials.size>0,`${phase}: private color materials exist`)
      const geometryCount=geometries.size,materialCount=materials.size
      job.return();job.return()
      if(phase==='compiling')assert([...materials.values()].every(n=>n===0),`${phase}: submitted compiler retains private materials until it settles`)
      release()
      const waited=performance.now()
      while([...geometries.values()].some(n=>n===0)){
        await new Promise(requestAnimationFrame)
        if(performance.now()-waited>10_000)throw new Error(`L9 cancelled geometry was not released: ${phase}`)
      }
      assert([...geometries.values()].every(n=>n===1),`${phase}: each consumed or cancelled geometry releases once`)
      assert([...materials.values()].every(n=>n===1),`${phase}: each private material releases once`)
      assert([...instances.values()].every(n=>n===1),`${phase}: each consumed or cancelled instance releases once`)
      assert([...shared.values()].every(n=>n===0),`${phase}: shared materials remain alive`)
      assert(chunkRoot.parent===null&&!r.chunkGroups.has(chunk.key),`${phase}: cancelled chunk cannot publish after compile completion`)
      rows.push({phase,steps,geometryCount,materialCount,instanceCount:instances.size,combined,submitted})
    } finally {THREE.Object3D.prototype.add=add;r.three.compileAsync=compile;release();job.return();for(const [resource,listener] of listeners)resource.removeEventListener('dispose',listener)}
  }
  await perfQA.measure(9,5)
  assert(r.isNearWorldReady(e),'normal L9 loading reaches readiness after the cancelled builds')
  return {passed:checks.length,checks,rows}
}
