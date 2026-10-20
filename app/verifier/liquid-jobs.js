import * as THREE from 'three'
import { ALL_LEVEL_DEFS } from '/src/game/levels/index.ts'
import { buildLiquidSurfaces, buildLiquidSurfacesJob, buildSkyAndLiquidsJob } from '/src/game/renderer/liquidsSky.ts'
import { setMaterialMode } from '/src/game/renderer/shared.ts'

const frame = () => new Promise(requestAnimationFrame)
const bytes = a => { let h = 0x811c9dc5; for (const v of new Uint8Array(a.buffer, a.byteOffset, a.byteLength)) h = Math.imul(h ^ v, 0x01000193) >>> 0; return h.toString(16) }
function snapshot(root) {
  root.updateMatrixWorld(true)
  const nodes = []
  root.traverse(o => {
    const g = o.geometry, m = o.material
    nodes.push({ type: o.type, name: o.name, matrix: o.matrix.toArray(), children: o.children.length, userData: o.userData,
      geometry: g && { index: g.index && bytes(g.index.array), attrs: Object.fromEntries(Object.entries(g.attributes).map(([k,a]) => [k, [a.itemSize,a.normalized,a.count,a.array.constructor.name,bytes(a.array)]])), groups: g.groups, range: [g.drawRange.start,String(g.drawRange.count)] },
      material: m && { type:m.type, color:m.color?.toArray(), emissive:m.emissive?.toArray(), opacity:m.opacity, transparent:m.transparent, side:m.side, fog:m.fog,
        roughness:m.roughness, metalness:m.metalness, normalScale:m.normalScale?.toArray(), envMapIntensity:m.envMapIntensity,
        shader:m.customProgramCacheKey(), textures:Object.keys(m).filter(k=>m[k]?.isTexture).sort() } })
  })
  return JSON.stringify(nodes)
}
function dispose(root) {
  const materials = new Set()
  root.traverse(o => { o.geometry?.dispose(); if(o.material) materials.add(o.material) })
  for(const m of materials) m.dispose()
}
async function drain(job) { let steps=0,maxStepMs=0; while(true) { const t=performance.now(), next=job.next(); maxStepMs=Math.max(maxStepMs,performance.now()-t); if(next.done)break; if(++steps%32===0) await frame() } return {steps,maxStepMs} }

// A captured pre-change module is optional; normal runs still verify sync/job equivalence.
export async function verifyLiquidJobs(baselinePath) {
  const before = baselinePath ? await import(baselinePath) : null
  const rows=[], e=perfQA.engine
  if(perfQA.busy) throw new Error('Benchmark busy')
  e.newRun(424242,'normal')
  for(const mode of ['classic','realistic']) {
    setMaterialMode(mode)
    for(const id of [7,8,9,10,11]) {
      e.loadLevel(id,{mapSeed:424242,firstVisit:true})
      const m=e.map, def=ALL_LEVEL_DEFS.find(d=>d.id===id), ranges=new Map()
      // Include one owner of each water type, plus every chunk surrounding the L8 lake.
      for(const type of [1,2]) {
        const i=m.liquid.findIndex((v,i)=>v===type&&m.tiles[i]===1)
        if(i>=0){const x0=Math.floor((i%m.w)/32)*32,y0=Math.floor(Math.floor(i/m.w)/32)*32;ranges.set(`${x0},${y0}`,{x0,y0,x1:x0+32,y1:y0+32})}
      }
      if(id===8)for(const c of m.inf.chunks.values()) if(Math.abs(c.cx)<=1&&Math.abs(c.cy)<=1){const x0=c.cx*32-m.inf.ox,y0=c.cy*32-m.inf.oy;ranges.set(`${x0},${y0}`,{x0,y0,x1:x0+32,y1:y0+32})}
      if(!ranges.size) ranges.set('center',{x0:64,y0:64,x1:96,y1:96})
      for(const range of ranges.values()) for(const realWater of [false,true]) {
        const original=new THREE.Group(), sliced=new THREE.Group()
        ;(before?.buildLiquidSurfaces??buildLiquidSurfaces)(m,def,original,range,realWater)
        const timing=await drain(buildLiquidSurfacesJob(m,def,sliced,range,realWater))
        if(snapshot(original)!==snapshot(sliced))throw new Error(`Liquid mismatch ${mode} L${id} ${JSON.stringify(range)} water=${realWater}`)
        rows.push({mode,level:id,realWater,range,meshes:sliced.children.length,...timing})
        dispose(original);dispose(sliced)
      }
    }
  }
  // Sky flood fill and silhouettes also keep their original output when yielding.
  if(before)for(const def of ALL_LEVEL_DEFS.filter(d=>!d.infinite)) {
    e.loadLevel(def.id,{mapSeed:424242,firstVisit:true})
    const original=new THREE.Group(),sliced=new THREE.Group()
    before.buildSkyAndLiquids(e.map,def,original,false)
    const timing=await drain(buildSkyAndLiquidsJob(e.map,def,sliced,false))
    if(snapshot(original)!==snapshot(sliced))throw new Error(`Sky mismatch L${def.id}`)
    rows.push({level:def.id,sky:true,...timing});dispose(original);dispose(sliced)
  }
  e.loadLevel(8,{mapSeed:424242,firstVisit:true})
  const m=e.map, def=ALL_LEVEL_DEFS.find(d=>d.id===8)
  const range={x0:-m.inf.ox,y0:-m.inf.oy,x1:32-m.inf.ox,y1:32-m.inf.oy}
  let cancelledBuffers=0
  for(const stopAfter of [5,50,100,250,500]) {
    const root=new THREE.Group(), created=new Map(), original=THREE.BufferGeometry.prototype.setAttribute
    const job=buildLiquidSurfacesJob(m,def,root,range,true)
    THREE.BufferGeometry.prototype.setAttribute=function(...args) {
      if(!created.has(this)) {
        created.set(this,0)
        this.addEventListener('dispose',()=>created.set(this,created.get(this)+1))
      }
      return original.apply(this,args)
    }
    try {
      for(let i=0;i<stopAfter;i++)if(job.next().done)break
      job.return()
      const owned=new Set(); root.traverse(o=>{if(o.geometry)owned.add(o.geometry)})
      for(const [geometry,count] of created) if(!owned.has(geometry)) {
        if(count!==1)throw new Error(`Cancelled water buffer disposed ${count} times at step ${stopAfter}`)
        cancelledBuffers++
      }
    } finally { job.return(); THREE.BufferGeometry.prototype.setAttribute=original; dispose(root) }
    rows.push({level:8,cancelAt:stopAfter,buffers:created.size})
  }
  if(!cancelledBuffers)throw new Error('Cancellation did not exercise intermediate water buffers')
  setMaterialMode('classic')
  return {passed:rows.length,baseline:!!before,cancelledBuffers,rows}
}
