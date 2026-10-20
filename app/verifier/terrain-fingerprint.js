import * as THREE from 'three'

const fnv = bytes => { let h = 0x811c9dc5; for (const b of new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)) h = Math.imul(h ^ b, 0x01000193) >>> 0; return h.toString(16).padStart(8, '0') }
const value = v => Number.isFinite(v) ? v : String(v)
const attrs = g => Object.keys(g.attributes).sort().map(name => { const a = g.attributes[name]; return { name, itemSize: a.itemSize, normalized: a.normalized, count: a.count, hash: fnv(a.array) } })
const material = m => ({ type: m.type, color: m.color?.toArray?.(), emissive: m.emissive?.toArray?.(), opacity: m.opacity, transparent: m.transparent, side: m.side, vertexColors: m.vertexColors, roughness: m.roughness, metalness: m.metalness, onBeforeCompile: m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile ? '' : m.onBeforeCompile.toString(), customProgramCacheKey: m.customProgramCacheKey?.() ?? '', texture: Object.fromEntries(Object.keys(m).filter(k => m[k]?.isTexture).sort().map(k => { const t = m[k], d = t.source?.data; return [k, { src: d?.src, width: d?.width, height: d?.height, colorSpace: t.colorSpace, format: t.format, type: t.type }] })) })
const tree = root => { root.updateMatrixWorld(true); const nodes=[]; const mats=new Set(), geos=new Set(); root.traverse(o=>{const g=o.geometry, ms=Array.isArray(o.material)?o.material:o.material?[o.material]:[];ms.forEach(m=>mats.add(m));if(g)geos.add(g);nodes.push({type:o.type,name:o.name,local:o.matrix.toArray(),children:o.children.length,materials:ms.map(m=>[...mats].indexOf(m)),geometry:g?{attrs:attrs(g),index:g.index?{count:g.index.count,hash:fnv(g.index.array)}:null,groups:g.groups.map(x=>({...x,count:value(x.count)})),drawRange:{start:g.drawRange.start,count:value(g.drawRange.count)}}:null,instanced:o.isInstancedMesh?{count:o.count,instanceMatrix:fnv(o.instanceMatrix.array)}:null})});return {nodes,materials:[...mats].map(material)} }
const dispose = root => { const geos=new Set(),mats=new Set();root.traverse(o=>{if(o.geometry)geos.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])mats.add(m)});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose()) }

export async function captureTerrainFingerprints({ perfQA, job = false } = {}) {
  const [{ ALL_LEVEL_DEFS }, { buildTerrain, buildTerrainJob }, { WALL_H }] = await Promise.all([import('/src/game/levels/index.ts'), import('/src/game/renderer/geometry.ts'), import('/src/game/renderer/shared.ts')])
  if(job && !buildTerrainJob)throw new Error('buildTerrainJob missing')
  if(perfQA.busy)throw new Error('Benchmark busy')
  const e=perfQA.engine, result=[]
  e.newRun(424242,'normal')
  for (const def of ALL_LEVEL_DEFS.filter(d=>!d.infinite)) {
    e.loadLevel(def.id, { mapSeed: 424242, firstVisit: true }); const m=e.map; if (!m || m.inf) continue
    const g=new THREE.Group(), started=performance.now(); let yields=0
    if(job && buildTerrainJob){const it=buildTerrainJob(m,def,WALL_H[def.gen]??3,g);let n=0,r=it.next();while(!r.done){if(++yields && ++n%32===0)await new Promise(requestAnimationFrame);r=it.next()}}else buildTerrain(m,def,WALL_H[def.gen]??3,g)
    result.push({level:def.id,w:m.w,h:m.h,settlement:!!m.settlement,constructionMs:performance.now()-started,yields,...tree(g)});dispose(g);await new Promise(requestAnimationFrame)
  }
  return result
}
