import assert from 'node:assert/strict'
import { createCanvas } from '@napi-rs/canvas'
import * as THREE from 'three'
import { buildL0Architecture } from '../src/game/renderer/l0Architecture'
import { setMaterialMode } from '../src/game/renderer/shared'
import { l0Layout, l0WoodRects, type L0Region } from '../src/game/world/l0Architecture'
import { continuousL0Partitions } from '../src/game/world/l0Partitions'
import { buildL0Furniture } from '../src/game/renderer/l0Furniture'
import { l0FixtureLight } from '../src/game/renderer/l0Light'
import { perceptionBlur } from '../src/game/renderer/photoPass'

Object.defineProperty(globalThis, 'document', {
  value: { createElement: () => createCanvas(128, 128), createElementNS: () => { throw new Error('headless') } },
})

const regions: L0Region[] = ['maze', 'open', 'pillars', 'arch', 'pillarhall', 'pit', 'blackout', 'red', 'manila']
const finite = (attribute: THREE.BufferAttribute) => Array.from(attribute.array).every(Number.isFinite)

function inspect(root: THREE.Group, label: string) {
  const meshes: THREE.Mesh[] = []
  root.traverse(object => { if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh) })
  assert(meshes.length > 0, `${label}: generated no meshes`)
  for (const mesh of meshes) {
    const { geometry } = mesh
    for (const name of ['position', 'normal', 'uv']) {
      const attribute = geometry.getAttribute(name) as THREE.BufferAttribute | undefined
      assert(attribute, `${label}: missing ${name}`)
      assert(finite(attribute), `${label}: non-finite ${name}`)
    }
    const color = geometry.getAttribute('color') as THREE.BufferAttribute | undefined
    if (color) assert(finite(color), `${label}: non-finite color`)
    const position = geometry.getAttribute('position') as THREE.BufferAttribute
    const index = geometry.index
    if (index) for (let i = 0; i < index.count; i++) assert(index.getX(i) < position.count, `${label}: index out of range`)
    const triangles = (index?.count ?? position.count) / 3
    assert(Number.isInteger(triangles) && triangles > 0, `${label}: invalid triangle count`)
  }
  return meshes
}

function build(region: L0Region, mode: 'classic' | 'realistic') {
  setMaterialMode(mode)
  const root = new THREE.Group()
  const layout = l0Layout(20261006, 0, 0, region)
  const job = buildL0Architecture(layout, 0, 0, root)
  for (;;) { const step = job.next(); if (step.done) break }
  return { root, layout }
}

function materialName(mesh: THREE.Mesh) {
  return Array.isArray(mesh.material) ? mesh.material.map(material => material.name) : [mesh.material.name]
}

function hasFace(meshes: THREE.Mesh[], material: string, x: number, normalX: number) {
  return meshes.filter(mesh => materialName(mesh).includes(material)).some(mesh => {
    const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const normal = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(position.getX(i) - x) < 1e-5 && normal.getX(i) * normalX > 0.9) return true
    }
    return false
  })
}

function inspectFurniture(root: THREE.Group, label: string, maxMeshes: number) {
  const meshes = inspect(root, label)
  assert(meshes.length <= maxMeshes, label + ': mesh count exceeds limit')
  let triangles = 0
  const box = new THREE.Box3().setFromObject(root)
  for (const mesh of meshes) triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3
  assert(triangles <= 15000, label + ': triangle count exceeds 15000')
  assert(box.min.y >= -.02, label + ': bounds dip below floor')
  return { meshes, triangles }
}

function furniture(kind: string, data: Record<string, unknown>) {
  return buildL0Furniture({ kind, x: 0, y: 0, w: 1.06, h: 1, data } as never) as THREE.Group
}

for (const mode of ['classic', 'realistic'] as const) {
  setMaterialMode(mode)
  const doorModel = furniture('hoteldoor', { l0Door: true })
  const upright = furniture('table', { l0Furniture: true, chair: true })
  const fallen = furniture('table', { l0Furniture: true, chair: true, fallen: true })
  const cabinet = furniture('dresser', { l0Furniture: true, manilaTable: true })
  const doorStats = inspectFurniture(doorModel, 'furniture-door', 3)
  const chairStats = inspectFurniture(upright, 'furniture-chair', 1)
  const fallenStats = inspectFurniture(fallen, 'furniture-fallen-chair', 1)
  const cabinetStats = inspectFurniture(cabinet, 'furniture-cabinet', 5)
  console.log('furniture stats', mode, { door: [doorStats.meshes.length, doorStats.triangles], chair: [chairStats.meshes.length, chairStats.triangles], fallen: [fallenStats.meshes.length, fallenStats.triangles], cabinet: [cabinetStats.meshes.length, cabinetStats.triangles] })
  assert.equal(doorModel.userData.swing, 1, 'door swing marker')
  assert.equal(doorModel.children.filter(child => child.userData.lid === 1).length, 1, 'door one lid pivot')
  assert.equal(cabinet.children.filter(child => child.userData.lid === 1 && child.userData.part === 'doorL').length, 1, 'cabinet doorL pivot')
  assert.equal(cabinet.children.filter(child => child.userData.lid === 1 && child.userData.part === 'doorR').length, 1, 'cabinet doorR pivot')
  const secondCabinet = furniture('dresser', { l0Furniture: true, manilaTable: true })
  const firstMesh = cabinet.children.find(child => (child as THREE.Mesh).isMesh) as THREE.Mesh
  const secondMesh = secondCabinet.children.find(child => (child as THREE.Mesh).isMesh) as THREE.Mesh
  assert(firstMesh && secondMesh && firstMesh.geometry !== secondMesh.geometry && firstMesh.material !== secondMesh.material, 'furniture instances independent')
  const shared = (firstMesh.material as THREE.MeshStandardMaterial).map
  assert(shared && shared === (secondMesh.material as THREE.MeshStandardMaterial).map, 'furniture instances share texture')
  let secondGeometryDisposed = false
  let secondMaterialDisposed = false
  secondMesh.geometry.addEventListener('dispose', () => { secondGeometryDisposed = true })
  ;(secondMesh.material as THREE.Material).addEventListener('dispose', () => { secondMaterialDisposed = true })
  firstMesh.geometry.dispose(); (firstMesh.material as THREE.Material).dispose()
  assert(!secondGeometryDisposed && !secondMaterialDisposed && shared.image, 'disposing one furniture instance preserves the other')
  for (const root of [doorModel, upright, fallen, cabinet, secondCabinet]) root.traverse(object => { if ((object as THREE.Mesh).isMesh) { const mesh = object as THREE.Mesh; mesh.geometry.dispose(); if (Array.isArray(mesh.material)) mesh.material.forEach(material => material.dispose()); else mesh.material.dispose() } })
}

const lightLayout = l0Layout(20261006, 0, 0, 'maze')
const lamp = lightLayout.lamps[0]
assert.equal(l0FixtureLight({ ...lamp, off: true }, lamp.x, lamp.y, 1.6, 0, -1, 0), 0, 'off fixture emits no light')
const toward = l0FixtureLight(lamp, lamp.x + .2, lamp.y, 1.6, 0, 1, 0)
const away = l0FixtureLight(lamp, lamp.x + .2, lamp.y, 1.6, 0, -1, 0)
assert(toward > away, 'fixture front is brighter than back')
assert(l0FixtureLight(lamp, lamp.x + .25, lamp.y, 2.5, 0, -1, 0) > 0, 'lower fixture spread reaches offset')
assert(l0FixtureLight(lamp, lamp.x, lamp.y, 1.6, 0, 1, 0) >= l0FixtureLight(lamp, lamp.x, lamp.y, 1.6, 0, -1, 0), 'fixture does not emit upward')
assert.equal(perceptionBlur(100, 0), 0, 'full sanity has no blur')
assert(perceptionBlur(20, 0) > perceptionBlur(30, 0), 'low sanity blur is monotonic')
assert.equal(perceptionBlur(20, .6), Math.max(perceptionBlur(20, 0), .6 * .9), 'red and sanity blur use the stronger contribution')

function carpetColor(layout: ReturnType<typeof l0Layout>) {
  const root = new THREE.Group()
  const job = buildL0Architecture(layout, 0, 0, root)
  for (;;) { const step = job.next(); if (step.done) break }
  const mesh = root.children.find(object => (object as THREE.Mesh).isMesh && materialName(object as THREE.Mesh).includes('l0-carpet')) as THREE.Mesh
  assert(mesh, 'lighting occlusion regression has carpet mesh')
  const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
  const color = mesh.geometry.getAttribute('color') as THREE.BufferAttribute
  const normal = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute
  let value = -1
  for (let i = 0; i < position.count; i++) if (Math.abs(position.getX(i) - 4) < 1e-5 && Math.abs(position.getZ(i) - 6) < 1e-5 && Math.abs(position.getY(i)) < 1e-5 && normal.getY(i) > .99) {
    if (value >= 0) assert(Math.abs(value - color.getX(i)) < 1e-6, 'coincident floor vertices have consistent light')
    value = color.getX(i)
  }
  assert(value >= 0, 'lighting occlusion regression found target carpet vertex')
  root.traverse(object => { if ((object as THREE.Mesh).isMesh) { const m = object as THREE.Mesh; m.geometry.dispose(); if (Array.isArray(m.material)) m.material.forEach(material => material.dispose()); else m.material.dispose() } })
  return value
}

const baseLayout: ReturnType<typeof l0Layout> = {
  ...l0Layout(20261006, 0, 0, 'open'), region: 'open',
  walls: [], pits: [], puddles: [], arches: [], vents: [], wood: undefined, trap: undefined,
  lamps: [{ x: 4, y: 4, width: 1.13, depth: .34, off: false, red: false, round: false }],
}
const wall = { x: 3, y: 4.96, w: 2, h: .08, bottom: 0, top: 2.7, surface: 'wall' as const }
const unblocked = carpetColor(structuredClone(baseLayout))
const fullWall = carpetColor({ ...structuredClone(baseLayout), walls: [wall] })
const lowWall = carpetColor({ ...structuredClone(baseLayout), walls: [{ ...wall, top: .7 }] })
const hanging = carpetColor({ ...structuredClone(baseLayout), walls: [{ ...wall, bottom: 1 }] })
assert(unblocked > fullWall + 1e-4, 'unblocked lamp is brighter than full wall')
assert(Math.abs(lowWall - unblocked) < 1e-4, 'ray passes above low wall')
assert(Math.abs(hanging - fullWall) < 1e-4, 'hanging panel blocks the ray')

const manilaLayout = l0Layout(20261006, 18, 0, 'manila')
const manilaRects = l0WoodRects(manilaLayout)
assert.equal(manilaRects.length, 5, 'Manila wood rectangles include room and four door openings')
const manilaRoot = new THREE.Group()
const manilaJob = buildL0Architecture(manilaLayout, 18 * 32, 0, manilaRoot)
for (;;) { const step = manilaJob.next(); if (step.done) break }
const wood = manilaRoot.children.filter(object => (object as THREE.Mesh).isMesh && materialName(object as THREE.Mesh).includes('l0-wood')) as THREE.Mesh[]
const carpet = manilaRoot.children.filter(object => (object as THREE.Mesh).isMesh && materialName(object as THREE.Mesh).includes('l0-carpet')) as THREE.Mesh[]
function coversCenter(meshes: THREE.Mesh[], rect: { x: number; y: number; w: number; h: number }) {
  const cx = rect.x - 18 * 32 + rect.w / 2, cz = rect.y + rect.h / 2
  return meshes.some(mesh => {
    const p = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const n = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute
    const index=mesh.geometry.index,count=index?.count??p.count,at=(i:number)=>index?index.getX(i):i
    for(let i=0;i+2<count;i+=3){
      const a=at(i),b=at(i+1),c=at(i+2)
      if(n.getY(a)<.99||Math.abs(p.getY(a))>1e-5)continue
      const cross=(i:number,j:number)=>(p.getX(j)-p.getX(i))*(cz-p.getZ(i))-(p.getZ(j)-p.getZ(i))*(cx-p.getX(i))
      const signs=[cross(a,b),cross(b,c),cross(c,a)]
      if(signs.every(v=>v>=-1e-5)||signs.every(v=>v<=1e-5))return true
    }
    return false
  })
}
for (const rect of manilaRects) { assert(coversCenter(wood, rect), 'Manila wood floor covers every opening center'); assert(!coversCenter(carpet, rect), 'Manila carpet does not overlap wood floor') }
manilaRoot.traverse(object => { if ((object as THREE.Mesh).isMesh) { const m = object as THREE.Mesh; m.geometry.dispose(); if (Array.isArray(m.material)) m.material.forEach(material => material.dispose()); else m.material.dispose() } })

for (let cx = -5; cx <= 5; cx++) for (let cy = -5; cy <= 5; cy++) {
  const layout = l0Layout(7391, cx, cy, 'maze')
  assert(!layout.walls.some(w => (w.x === cx * 32 || w.y === cy * 32) && (w.w >= 12 || w.h >= 12)), 'ordinary seed has no legacy chunk-edge wall')
}
const partition = (cx: number, cy: number) => continuousL0Partitions({ ...l0Layout(7391, cx, cy, 'open'), walls: [], pits: [], puddles: [], arches: [], vents: [], wood: undefined, trap: undefined }, 7391)
assert(partition(0, 0).length > 0 && partition(1, 0).length > 0 && partition(0, 1).length > 0 && partition(0, -1).length > 0, 'continuous partitions cover adjacent chunks')
let crossCount=0
for(let cx=-4;cx<=4;cx++)for(let cy=-4;cy<=4;cy++)for(const axis of ['x','y']as const){
  const edge=(axis==='x'?cx+1:cy+1)*32,left=partition(cx,cy),right=partition(cx+(axis==='x'?1:0),cy+(axis==='y'?1:0))
  // Compare walls running through the edge, not walls parallel to it: the
  // latter can legitimately start on the edge and have different .01 samples.
  const intervals=(walls:typeof left,sample:number)=>walls.filter(w=>axis==='x'?Math.abs(w.h-.24)<1e-5&&sample>w.x&&sample<w.x+w.w:Math.abs(w.w-.24)<1e-5&&sample>w.y&&sample<w.y+w.h).map(w=>axis==='x'?[w.y,w.y+w.h]:[w.x,w.x+w.w]).sort((a,b)=>a[0]-b[0])
  const a=intervals(left,edge-.01),b=intervals(right,edge+.01)
  assert.deepEqual(a,b,`world partition continuity at ${cx},${cy}/${axis}`)
  crossCount+=a.length
}
assert(crossCount>10,'ordinary walls continue through multiple positive and negative chunk boundaries')

for (const mode of ['classic', 'realistic'] as const) for (const region of regions) {
  const { root } = build(region, mode)
  const meshes = inspect(root, `${mode}/${region}`)
  if (region === 'arch') {
    const cream = meshes.filter(mesh => mesh.material instanceof THREE.Material && mesh.material.name === 'l0-cream')
    assert(cream.length > 0, `${mode}/arch: cream mesh is present`)
    const hasUpperArch = cream.some(mesh => {
      const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < position.count; i++) if (position.getY(i) > 2 && position.getX(i) > 19.9 && position.getX(i) < 23 && position.getZ(i) >= 6 && position.getZ(i) <= 28) return true
      return false
    })
    assert(hasUpperArch, `${mode}/arch: cream mesh contains upper arch geometry`)
  }
  if (region === 'manila') {
    assert(meshes.some(mesh => materialName(mesh).includes('l0-manila')), `${mode}/manila: interior material exists`)
    assert(meshes.some(mesh => materialName(mesh).includes('l0-wall')), `${mode}/manila: exterior wall material exists`)
    assert(hasFace(meshes, 'l0-manila', 20, -1), `${mode}/manila: east interior face at x=20 faces inward`)
    assert(hasFace(meshes, 'l0-wall', 21, 1), `${mode}/manila: east exterior face at x=21 faces outward`)
    assert(meshes.some(mesh => materialName(mesh).includes('l0-manila-ceiling')), `${mode}/manila: room ceiling material exists`)
    assert(meshes.some(mesh => materialName(mesh).includes('l0-ceiling')), `${mode}/manila: exterior ceiling material exists`)
  }
  for (const mesh of meshes) { mesh.geometry.dispose(); if (Array.isArray(mesh.material)) mesh.material.forEach(material => material.dispose()); else mesh.material.dispose() }
}

// Two instances own their materials and geometries independently while sharing atlas textures.
const first = build('arch', 'realistic').root
const second = build('arch', 'realistic').root
const firstMesh = first.children.find(object => (object as THREE.Mesh).isMesh && (object as THREE.Mesh).material instanceof THREE.Material && ((object as THREE.Mesh).material as THREE.MeshStandardMaterial).map) as THREE.Mesh
const secondMesh = second.children.find(object => (object as THREE.Mesh).isMesh && (object as THREE.Mesh).material instanceof THREE.Material && ((object as THREE.Mesh).material as THREE.MeshStandardMaterial).map) as THREE.Mesh
assert(firstMesh && secondMesh, 'independent instances contain meshes')
assert.notEqual(firstMesh.geometry, secondMesh.geometry, 'instances own independent geometry')
assert.notEqual(firstMesh.material, secondMesh.material, 'instances own independent materials')
const sharedMap = (firstMesh.material as THREE.MeshStandardMaterial).map
assert(sharedMap, 'L0 material has a shared atlas texture')
firstMesh.geometry.dispose(); (firstMesh.material as THREE.Material).dispose()
assert(sharedMap.image, 'disposing an instance material keeps shared texture alive')
secondMesh.geometry.dispose(); (secondMesh.material as THREE.Material).dispose()

// Cancellation must execute the generator finally block without leaving an exception.
setMaterialMode('classic')
const cancelledRoot = new THREE.Group()
const cancelled = buildL0Architecture(l0Layout(20261006, 0, 0, 'arch'), 0, 0, cancelledRoot)
cancelled.next(); cancelled.return(undefined)

console.log(`L0 mesh checks passed (${regions.length * 2} region/mode builds)`)
