import assert from 'node:assert/strict'
import { createCanvas } from '@napi-rs/canvas'
import * as THREE from 'three'
import { buildL1Prop } from '../src/game/renderer/l1Props'
import { disposeL1Owned } from '../src/game/renderer/l1Materials'
import { setMaterialMode } from '../src/game/renderer/shared'
import { L1_CRATE, l1CrateCount } from '../src/game/world/l1Crate'

Object.defineProperty(globalThis, 'document', { value: { createElement: () => createCanvas(128, 128), createElementNS: () => ({}) } })
const kinds = ['foldingtable', 'seat', 'panel', 'louver', 'extinguisher', 'crate', 'pathchair', 'airunit', 'caution']
const base = (kind: string, x = 12, y = -8, deg = 27) => ({ kind: 'crate' as const, x, y, w: 1, h: 1, solid: false, data: { l1Prop: kind, deg } })
function inspect(root: THREE.Group, s: ReturnType<typeof base>) {
  let tris = 0, meshes = 0
  root.updateMatrixWorld(true)
  root.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.geometry) return
    meshes++
    for (const a of ['position', 'normal', 'uv']) { const attr = m.geometry.attributes[a]; assert(attr, `${s.data.l1Prop} missing ${a}`); assert(Array.from(attr.array).every(Number.isFinite), `${s.data.l1Prop} non-finite ${a}`) }
    tris += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3
  })
  assert(tris <= 700, `${s.data.l1Prop} triangle budget ${tris}`); assert(meshes <= 3, `${s.data.l1Prop} draw budget ${meshes}`)
  const b = new THREE.Box3().setFromObject(root), c = new THREE.Vector3(s.x + .5, 0, s.y + .5)
  assert(b.min.y >= -.08, `${s.data.l1Prop} below ground ${b.min.y}`); assert(Math.abs(root.position.x - c.x) < 1e-6 && Math.abs(root.position.z - c.z) < 1e-6, `${s.data.l1Prop} center`)
  return { tris, meshes, box: b }
}
for (const mode of ['classic', 'realistic'] as const) {
  setMaterialMode(mode)
  for (const kind of kinds) {
    const a = buildL1Prop(base(kind)), b = buildL1Prop(base(kind, 20, 4, 0))
    assert(a && b, `${kind} returned null`)
    assert(Math.abs(a.rotation.y - 27 * Math.PI / 180) < 1e-9, `${kind} degree rotation`)
    assert(Math.abs(b.rotation.y) < 1e-9, `${kind} zero degree rotation`)
    const ia = inspect(a, base(kind)), ib = inspect(b, base(kind, 20, 4, 0)); assert(ia.tris <= 700 && ib.tris <= 700)
    if (kind === 'crate') {
      const zero=buildL1Prop({...base('crate'),data:{l1Prop:'crate',deg:0,l1Number:0,sid:99}})!; zero.updateMatrixWorld(true)
      const markMeshes: THREE.Mesh[]=[];zero.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry?.attributes.position.count===8)markMeshes.push(m)})
      assert.equal(markMeshes.length,1,'crate marks merged')
      const markGeo=markMeshes[0].geometry, normals=markGeo.attributes.normal, uv=markGeo.attributes.uv
      assert(normals.getZ(0)>.9 && normals.getZ(4)<-.9,'crate marks face outward')
      assert(Array.from(uv.array).every((v,i)=>i%2===0?v>=0&&v<=.1+1e-6:v>=.9-1e-6&&v<=1),'crate explicit zero atlas tile')
      zero.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)m.geometry.dispose()});zero.traverse(disposeL1Owned)
    }
    if (kind === 'pathchair') assert(ia.box.max.y - ia.box.min.y <= 1.4)
    if (kind === 'seat') assert(ia.box.max.y - ia.box.min.y <= .9)
    const ma: THREE.Material[] = [], mb: THREE.Material[] = [], ga: THREE.BufferGeometry[] = [], gb: THREE.BufferGeometry[] = []
    a.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) { ga.push(m.geometry); ma.push(...(Array.isArray(m.material) ? m.material : [m.material])) } })
    b.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) { gb.push(m.geometry); mb.push(...(Array.isArray(m.material) ? m.material : [m.material])) } })
    assert(ga.every(g => !gb.includes(g))); assert(ma.every(m => !mb.includes(m))); assert(ma.some(m => mb.some(n => (m as any).map && (m as any).map === (n as any).map)) || ma.every(m => !(m as any).map), `${kind} texture sharing`)
    const disposedA = new Set<THREE.BufferGeometry>(), disposedM = new Set<THREE.Material>(), disposedBGeometry = new Set<THREE.BufferGeometry>(), disposedBMaterial = new Set<THREE.Material>(), disposedTexture = new Set<THREE.Texture>()
    for (const g of ga) g.addEventListener('dispose', () => disposedA.add(g))
    for (const m of ma) m.addEventListener('dispose', () => disposedM.add(m))
    for (const g of gb) g.addEventListener('dispose', () => disposedBGeometry.add(g))
    for (const m of mb) m.addEventListener('dispose', () => disposedBMaterial.add(m))
    const sharedTextures = [...new Set(mb.flatMap(m => {
      const x = m as THREE.Material & { map?: THREE.Texture; alphaMap?: THREE.Texture; normalMap?: THREE.Texture; roughnessMap?: THREE.Texture }
      return [x.map, x.alphaMap, x.normalMap, x.roughnessMap].filter((t): t is THREE.Texture => !!t)
    }))]
    for (const t of sharedTextures) t.addEventListener('dispose', () => disposedTexture.add(t))
    a.traverse(disposeL1Owned); ga.forEach(g => g.dispose())
    assert.equal(disposedA.size, ga.length, `${kind} A geometry disposal`)
    assert.equal(disposedM.size, ma.length, `${kind} A material disposal`)
    assert.equal(disposedBGeometry.size, 0, `${kind} B geometry unaffected`)
    assert.equal(disposedBMaterial.size, 0, `${kind} B material unaffected`)
    assert.equal(disposedTexture.size, 0, `${kind} shared textures unaffected`)
    for (const m of mb) assert(m.userData.l1Owned === true)
    b.traverse(disposeL1Owned); b.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose() })
  }
}
for (const count of [1, 2]) {
  const s = base('crate', 0, 0, 0); s.data = { l1Prop: 'crate', l1Stack: count, l1Number: 1, l1UpperNumber: 11, sid: 77 }
  assert.equal(l1CrateCount(s), count)
  const g = buildL1Prop(s)!; const i = inspect(g, s)
  assert(i.box.max.x - i.box.min.x >= L1_CRATE.width - 1e-6 && i.box.max.x - i.box.min.x <= L1_CRATE.width + 1e-6, `crate width ${count}`)
  assert(i.box.max.z - i.box.min.z >= L1_CRATE.depth - 1e-6 && i.box.max.z - i.box.min.z <= L1_CRATE.depth + 1e-6, `crate depth ${count}`)
  assert(Math.abs(i.box.max.y - i.box.min.y - L1_CRATE.height * count) < 1e-6, `crate stack height ${count}`)
  assert(i.tris <= 700 && i.meshes <= 3, `crate stack budget ${count}`)
  g.traverse(disposeL1Owned); g.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose() })
}
console.log('L1 prop geometry/material checks passed')
