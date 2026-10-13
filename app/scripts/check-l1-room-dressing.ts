import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createCanvas } from '@napi-rs/canvas'
import { L1 } from '../src/game/levels/l1'
import { genL1ChunkRaw } from '../src/game/world/infiniteL1'
import { l1RoomDressing,l1HallDressing } from '../src/game/world/l1Dressing'
import {buildL1Data} from '../src/game/world/l1Building'
import { L1_SHOWCASE_SEED,L1_PHOTO_ANCHORS } from '../src/game/world/l1Spatial'
import { buildL1Prop } from '../src/game/renderer/l1Props'
import {l1LayoutVariant} from '../src/game/world/l1Layout'
import {disposeL1Owned} from '../src/game/renderer/l1Materials'
Object.defineProperty(globalThis, 'document', { value: { createElement: () => createCanvas(128, 128), createElementNS: () => ({}) } })

for (const seed of [1, 42, 7391]) for (let cy = -5; cy <= 5; cy++) for (let cx = -5; cx <= 5; cx++) {
  const v = l1RoomDressing(seed, cx, cy)
  if(l1LayoutVariant(seed,cx,cy)!=='maintenance')assert.equal(v.length,0,`unexpected dressing ${seed}:${cx},${cy}`)
}
const anchor=L1_PHOTO_ANCHORS.find(a=>a.id==='path-room')!,showcaseCx=Math.floor(anchor.centerX/32),expected=l1RoomDressing(L1_SHOWCASE_SEED,showcaseCx,0)
assert.equal(expected.filter(s => s.data?.l1Prop === 'pathchair').length, 2)
for (const kind of ['airunit', 'caution', 'paintcan']) assert.equal(expected.filter(s => s.data?.l1Prop === kind).length, 1)
const raw = genL1ChunkRaw(L1, L1_SHOWCASE_SEED, showcaseCx, 0)
const dressed = raw.structures.filter(s => ['pathchair', 'airunit', 'caution', 'paintcan'].includes(String(s.data?.l1Prop)))
assert.equal(dressed.filter(s => s.data?.l1Prop === 'pathchair').length, 2)
for (const kind of ['airunit', 'caution', 'paintcan']) assert.equal(dressed.filter(s => s.data?.l1Prop === kind).length, 1)
for (const s of dressed) { assert(s.solid); assert(expected.some(t => t.data?.l1Prop === s.data?.l1Prop && t.x === s.x && t.y === s.y), `dressing coordinate ${s.data?.l1Prop}`) }
for (const kind of ['airunit', 'paintcan']) {
  const a = buildL1Prop({ kind: 'pillar', x: 0, y: 0, w: 1, h: 1, solid: true, data: { l1Prop: kind } })!, b = buildL1Prop({ kind: 'pillar', x: 2, y: 2, w: 1, h: 1, solid: true, data: { l1Prop: kind } })!
  for (const g of [a, b]) { g.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(g); assert(box.min.y >= -.00001); let meshes = 0; g.traverse(o => { const m = o as THREE.Mesh; if (!m.geometry) return; meshes++; for (const k of ['position', 'uv']) assert(Array.from(m.geometry.getAttribute(k).array).every(Number.isFinite)) }); assert(meshes <= 3) }
  const geometryA=new Set<THREE.BufferGeometry>(),geometryB=new Set<THREE.BufferGeometry>(),materialA=new Set<THREE.Material>(),materialB=new Set<THREE.Material>()
  for(const [g,geos,mats]of [[a,geometryA,materialA],[b,geometryB,materialB]] as const)g.traverse(o=>{const m=o as THREE.Mesh;if(!m.geometry)return;geos.add(m.geometry);for(const mat of Array.isArray(m.material)?m.material:[m.material])mats.add(mat)})
  assert([...geometryA].every(g=>!geometryB.has(g)));assert([...materialA].every(m=>!materialB.has(m)))
  let releasedB=0;for(const resource of [...geometryB,...materialB])resource.addEventListener('dispose',()=>releasedB++)
  a.traverse(disposeL1Owned);for(const g of geometryA)g.dispose();assert.equal(releasedB,0)
  b.traverse(disposeL1Owned);for(const g of geometryB)g.dispose();assert.equal(releasedB,geometryB.size+materialB.size)
}
console.log('L1 room dressing checks passed')
const hallAnchor=L1_PHOTO_ANCHORS.find(a=>a.id==='parking-props')!,hallCx=Math.floor(hallAnchor.centerX/32),architecture=buildL1Data(L1_SHOWCASE_SEED,hallCx,0),expectedHall=l1HallDressing(architecture),hall=genL1ChunkRaw(L1,L1_SHOWCASE_SEED,hallCx,0)
const actualHall=hall.structures.filter(s=>s.data?.l1HallDressing)
assert.equal(actualHall.length,7,'table, three chairs, two louvers, extinguisher survive completed architecture')
assert.deepEqual(actualHall,expectedHall,'authored hall dressing is not silently moved by legacy placement')
assert(architecture.emitters.some(e=>e.id.startsWith('bay-wall-lamp:')&&e.power>0),'rear-wall fixtures have real native emitters')
assert(!architecture.emitters.some(e=>e.id.includes('column:')&&e.power>0),'work bay foreground columns are not luminous')
console.log('L1 hall dressing checks passed')
