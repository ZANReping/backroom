import assert from 'node:assert/strict'
import { createCanvas } from '@napi-rs/canvas'
import * as THREE from 'three'
import { buildL1Architecture,buildL1Column } from '../src/game/renderer/l1Architecture'
import { setMaterialMode } from '../src/game/renderer/shared'
import { disposeL1Owned } from '../src/game/renderer/l1Materials'

Object.defineProperty(globalThis, 'document', { value: { createElement: () => createCanvas(128, 128), createElementNS: () => ({}) } })
const variants = ['parking', 'storage', 'gothic', 'ouroboros', 'garden', 'maintenance'] as const
const makeMap = (variant: string) => ({ w: 32, h: 32, tiles: new Uint8Array(32 * 32).fill(1), l1Architecture: true, structures: [{ kind: 'pillar', x: 4, y: 4, w: 1, h: 1, solid: true, data: { l1Column: variant } }], lights: [{ x: 6, y: 6, r: 1, color: '#fff', noFix: true }, { x: 8, y: 8, r: 1, color: '#6faa78', noFix: true, keep: 1 }], inf: { ox: 0, oy: 0, seed: 20261006, chunks: new Map([['0,0', { variant, structures: [] }]]) } } as any)
function build(variant: string, modify?: (map: any) => void) {
  const g = new THREE.Group(), map = makeMap(variant); modify?.(map); const lights: any[] = map.lights, fixtures: any[] = [], job = buildL1Architecture(map, { x0: 0, y0: 0, x1: 32, y1: 32, variant }, g, lights, fixtures)
  for (;;) { const r = job.next(); if (r.done) break }
  return { g, lights, fixtures }
}
function inspect(g: THREE.Group, variant: string) {
  let tris = 0, meshes = 0, has = false
  g.traverse(o => { const m = o as THREE.Mesh; if (!m.geometry) return; meshes++; has = true
    const p = m.geometry.getAttribute('position'), n = m.geometry.getAttribute('normal'), uv = m.geometry.getAttribute('uv')
    assert(p && n && uv, `${variant} missing attributes`); assert(Array.from(p.array).every(Number.isFinite), `${variant} position finite`); assert(Array.from(n.array).every(Number.isFinite), `${variant} normal finite`); assert(Array.from(uv.array).every(Number.isFinite), `${variant} UV finite`)
    if (m.geometry.index) { const ix = m.geometry.index; assert(Array.from(ix.array).every(i => i >= 0 && i < p.count), `${variant} invalid index`); assert(ix.count % 3 === 0) }
    assert(p.count >= 3, `${variant} empty mesh`); tris += (m.geometry.index?.count ?? p.count) / 3
  })
  assert(has && meshes > 0, `${variant} no geometry`); return { tris, meshes }
}
for (const mode of ['classic', 'realistic'] as const) { setMaterialMode(mode)
  for (const variant of variants) {
    const aa = build(variant), bb = build(variant), a = aa.g, b = bb.g, ia = inspect(a, variant), ib = inspect(b, variant)
    assert.equal(ia.tris, ib.tris, `${variant} repeated triangle count`)
    if (variant === 'storage') { assert(a.getObjectByName('l1-batch-metal')); assert(aa.fixtures.length > 0); assert.equal(aa.lights.length, 2); assert.equal(bb.fixtures.length, aa.fixtures.length) }
    if (variant === 'gothic') {
      const vault=a.getObjectByName('l1-continuous-cross-vault')!;assert(vault)
      const shaft=buildL1Column(makeMap(variant).structures[0]);shaft.updateMatrixWorld(true);a.updateMatrixWorld(true)
      const top=new THREE.Box3().setFromObject(shaft).max.y
      for(let i=0;i<32;i++){
        const angle=i*Math.PI/16,x=4.5+Math.cos(angle)*.487,z=4.5+Math.sin(angle)*.487
        const hit=new THREE.Raycaster(new THREE.Vector3(x,0,z),new THREE.Vector3(0,1,0),0,4).intersectObject(vault)[0]
        assert(hit&&hit.point.y<=top,`gothic shaft/vault gap at ${i}`)
      }
      shaft.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.geometry)mesh.geometry.dispose()})
    }
    if (variant === 'garden') assert(a.getObjectByName('l1-ivy-lod'))
    if (variant === 'maintenance') {
      const broken = build('maintenance', map => { map.tiles[3 * 32 + 10] = 2 }).g; broken.updateMatrixWorld(true)
      const metal = broken.getObjectByName('l1-batch-metal')!; assert(metal)
      assert.equal(new THREE.Raycaster(new THREE.Vector3(10.5, 3.35, 3.5), new THREE.Vector3(0, 1, 0), 0, .15).intersectObject(metal, true).length, 0)
      assert(new THREE.Raycaster(new THREE.Vector3(9.5, 3.35, 3.5), new THREE.Vector3(0, 1, 0), 0, .15).intersectObject(metal, true).length > 0)
      broken.traverse(disposeL1Owned);broken.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose() })
    }
    if (variant === 'storage') {
      const broken = build('storage', map => { map.tiles[6 * 32 + 10] = 2 }).g; broken.updateMatrixWorld(true)
      const metal = broken.getObjectByName('l1-batch-metal')!; assert(metal)
      const clear = new THREE.Vector3(10.48, 6.0, 6.5), dir = new THREE.Vector3(0, 1, 0)
      assert.equal(new THREE.Raycaster(clear, dir, 0, .39).intersectObject(metal, true).length, 0)
      assert(new THREE.Raycaster(new THREE.Vector3(9.5, 6.0, 6.5), dir, 0, .39).intersectObject(metal, true).length > 0)
      broken.traverse(disposeL1Owned);broken.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose() })
    }
    const maps: THREE.Texture[] = []; const mats: THREE.Material[] = [], bmats: THREE.Material[] = [], bgeos: THREE.BufferGeometry[] = [], disposedA = new Set<THREE.Material>(), disposedB = new Set<THREE.Material>(), disposedBG = new Set<THREE.BufferGeometry>(), disposedT = new Set<THREE.Texture>()
    a.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) { for (const x of (Array.isArray(m.material) ? m.material : [m.material])) { mats.push(x); const t = (x as THREE.MeshStandardMaterial).map; if (t) maps.push(t) } } })
    b.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) { bgeos.push(m.geometry); for (const x of (Array.isArray(m.material) ? m.material : [m.material])) bmats.push(x) } })
    for (const m of mats) m.addEventListener('dispose', () => disposedA.add(m)); for (const m of bmats) m.addEventListener('dispose', () => disposedB.add(m)); for (const g of bgeos) g.addEventListener('dispose', () => disposedBG.add(g)); for (const t of [...new Set(maps)]) t.addEventListener('dispose', () => disposedT.add(t))
    a.traverse(disposeL1Owned); a.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose() })
    assert(mats.filter(m => m.userData.l1Owned).every(m => disposedA.has(m))); assert.equal(disposedB.size, 0); assert.equal(disposedBG.size, 0); assert.equal(disposedT.size, 0)
    for (const m of mats) assert(m.userData.l1Shared === true || m.userData.l1Owned === true, `${variant} unmarked material`)
    b.traverse(disposeL1Owned); b.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose() })
  }
  const cancelledGroup = new THREE.Group(), cancelledMap = makeMap('maintenance'), cancelledJob = buildL1Architecture(cancelledMap, { x0: 0, y0: 0, x1: 32, y1: 32, variant: 'maintenance' }, cancelledGroup, cancelledMap.lights, [])
  while(!cancelledGroup.children.length){if(cancelledJob.next().done)break}
  cancelledJob.return();cancelledGroup.traverse(disposeL1Owned);cancelledGroup.traverse(o=>(o as THREE.Mesh).geometry?.dispose())
  const afterCancel = build('maintenance'); assert(inspect(afterCancel.g, 'maintenance after cancelled generator').meshes > 0)
  afterCancel.g.traverse(disposeL1Owned); afterCancel.g.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose() })
}
console.log('L1 architecture service geometry checks passed')
