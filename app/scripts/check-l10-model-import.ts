import assert from 'node:assert/strict'
import { createCanvas } from '@napi-rs/canvas'
import * as THREE from 'three'
import { buildL10Structure } from '../src/game/renderer/l10Meshes'
import { l10GroundMaterial } from '../src/game/renderer/l10Ground'
import { setMaterialMode } from '../src/game/renderer/shared'
Object.defineProperty(globalThis, 'document', { value: { createElement: () => createCanvas(128, 128), createElementNS: () => { throw new Error('headless: no network image loader') } } })
const checks = { total: 0, triangles: 0 }
const ok = (value: unknown, message: string) => { checks.total++; assert(value, message) }
const finite = (a: ArrayLike<number>) => Array.from(a).every(Number.isFinite)
const specs = [
  ['barn', 14, 18, {}], ['l10stable', 16, 8, {}], ['l10shed', 6, 5, {}], ['l10outhouse', 2, 2, {}],
  ['hedgerow', 1, 1, { node: 1, v: 23 }], ['l10tree', .6, .6, { v: 2 }], ['l10haybale', 2, 1.5, { round: 1 }],
] as const
function inspect(root: THREE.Object3D, mode: string) {
  root.updateMatrixWorld(true);
  root.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.geometry) return
    const g = m.geometry
    for (const name of ['position', 'normal', 'uv']) { const a = g.getAttribute(name); ok(!!a, `${mode}: missing ${name}`); ok(finite(a.array), `${mode}: non-finite ${name}`) }
    ok(finite(m.matrix.elements), `${mode}: non-finite matrix`)
    const mat = m.material as THREE.Material
    ok(mode === 'classic' ? mat instanceof THREE.MeshLambertMaterial : mat instanceof THREE.MeshStandardMaterial, `${mode}: unexpected material ${mat.type}`)
    checks.triangles += (g.index?.count ?? g.getAttribute('position').count) / 3
  })
}
for (const mode of ['classic', 'realistic'] as const) {
  setMaterialMode(mode)
  const groundA = l10GroundMaterial(), groundB = l10GroundMaterial()
  ok(groundA === groundB, `${mode}: ground material not cached`)
  if (mode === 'classic') var classicGround = groundA; else var realisticGround = groundA
  for (const [kind, w, h, data] of specs) {
    const s: any = { kind, x: 100, y: 150, w, h, solid: false, data }
    const root = buildL10Structure(s, { x: 0, y: 0 })
    ok(!!root, `${mode}/${kind}: no model`); inspect(root!, mode)
    root!.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose() })
  }
}
ok(classicGround !== realisticGround, 'ground material modes share instance')
function snapshot(spec: typeof specs[number], x: number, y: number, origin: { x: number, y: number }) {
  const [kind,w,h,data]=spec
  const root = buildL10Structure({ kind, x, y, w, h, solid: false, data }, origin)!
  root.updateMatrixWorld(true)
  const meshes: any[] = []
  root.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) meshes.push({ p: Array.from(m.geometry.getAttribute('position').array), uv: Array.from(m.geometry.getAttribute('uv').array), matrix: Array.from(m.matrix.elements) }) })
  return { root, meshes }
}
setMaterialMode('classic')
ok(l10GroundMaterial()===classicGround,'returning to classic reuses the original material')
for(const spec of specs){
  const a = snapshot(spec,100,150,{x:0,y:0}), b = snapshot(spec,4,22,{x:96,y:128})
  ok(a.meshes.length === b.meshes.length, `${spec[0]} rebase mesh count differs`)
  for (let i = 0; i < a.meshes.length; i++) {
    ok(JSON.stringify(a.meshes[i])===JSON.stringify(b.meshes[i]),`${spec[0]} rebase geometry/UV/matrix differs ${i}`)
  }
  for(const root of [a.root,b.root])root.traverse(o=>{const m=o as THREE.Mesh;m.geometry?.dispose()})
}
console.log(JSON.stringify(checks, null, 2))
