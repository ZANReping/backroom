import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createCanvas } from '@napi-rs/canvas'
import { setMaterialMode } from '../src/game/renderer/shared'
import { buildOutdoorTree, outdoorTreeGeometry, outdoorTreeIdentity, outdoorTreeCacheInfo, OUTDOOR_TREE_FORMS } from '../src/game/renderer/outdoorTrees'

Object.defineProperty(globalThis, 'document', { value: { createElement: () => createCanvas(128, 128), createElementNS: () => { throw new Error('headless: no network image loader') } } })

let count = 0
const check = (value: unknown, message: string) => { assert(value, message); count++ }
const finite = (a: ArrayLike<number>) => Array.from(a).every(Number.isFinite)
const fingerprint = (g: THREE.BufferGeometry) => Array.from(g.getAttribute('position').array as Float32Array).slice(0, 180).map(v => v.toFixed(4)).join(',')
const triangles = (g: THREE.BufferGeometry) => (g.index?.count ?? g.getAttribute('position').count) / 3

const budgets: Record<string, { min: number; max: number }> = {}
for (const level of [9, 10] as const) {
  budgets[level] = { min: Infinity, max: 0 }
  const fingerprints = new Set<string>()
  for (let form = 0; form < 6; form++) for (let arrangement = 0; arrangement < 4; arrangement++) {
    const tree = outdoorTreeGeometry(level, form, arrangement)
    let total = 0
    for (const part of [tree.trunk, tree.branches, tree.leaves]) {
      total += triangles(part)
      for (const name of ['position', 'normal', 'uv', 'color']) {
        const attr = part.getAttribute(name)
        check(!!attr, `L${level} form ${form}: missing ${name}`)
        check(finite(attr.array), `L${level} form ${form}: non-finite ${name}`)
      }
      if (part.index) check(Array.from(part.index.array).every(i => i >= 0 && i < part.getAttribute('position').count), `L${level}: invalid index`)
    }
    check(total <= 6500, `L${level} form ${form}/${arrangement}: ${total} triangles exceeds budget`)
    budgets[level].min = Math.min(budgets[level].min, total); budgets[level].max = Math.max(budgets[level].max, total)
    const bounds = new THREE.Box3()
    for (const part of [tree.trunk, tree.branches, tree.leaves]) { part.computeBoundingBox(); bounds.union(part.boundingBox!) }
    check(Math.abs(bounds.max.y - bounds.min.y - (level === 10 ? 7 : 4.85)) < .01, `L${level} form ${form}/${arrangement}: changed tree height`)
    const uv = tree.leaves.getAttribute('uv')
    check(Array.from({length:uv.count},(_,i)=>uv.getX(i)>=.048-1e-6&&uv.getX(i)<=.188+1e-6&&uv.getY(i)>=.855-1e-6&&uv.getY(i)<=.948+1e-6).every(Boolean), `L${level}: leaves escape intact atlas island`)
    fingerprints.add(fingerprint(tree.leaves))
  }
  check(fingerprints.size >= 6, `L${level}: fewer than six distinct silhouette fingerprints (${fingerprints.size})`)
}

const l10 = outdoorTreeGeometry(10, 0, 0)
l10.trunk.computeBoundingBox(); l10.branches.computeBoundingBox(); l10.leaves.computeBoundingBox()
const maxY = Math.max(l10.trunk.boundingBox!.max.y, l10.branches.boundingBox!.max.y, l10.leaves.boundingBox!.max.y)
const minY = Math.min(l10.trunk.boundingBox!.min.y, l10.branches.boundingBox!.min.y, l10.leaves.boundingBox!.min.y)
check(Math.abs((maxY - minY) - 7) < .01, `L10 tree height is ${maxY - minY}, expected 7`)

// Each returned geometry is instance-owned, including typed arrays.
const original = outdoorTreeGeometry(9, 2, 1)
const clone = outdoorTreeGeometry(9, 2, 1)
for (const part of ['trunk', 'branches', 'leaves'] as const) {
  check(original[part] !== clone[part], `${part}: geometry clone is shared`)
  check(original[part].getAttribute('position').array !== clone[part].getAttribute('position').array, `${part}: position array is shared`)
  const before = Array.from(clone[part].getAttribute('position').array as Float32Array)
  ;(original[part].getAttribute('position').array as Float32Array)[0] += 99
  original[part].dispose()
  const fresh = outdoorTreeGeometry(9, 2, 1)[part]
  check(JSON.stringify(Array.from(fresh.getAttribute('position').array as Float32Array)) === JSON.stringify(before), `${part}: fresh clone changed after disposing/mutating A`)
}
check(outdoorTreeCacheInfo().entries <= 48, 'prototype cache exceeds 48 entries')

const source = { kind: 'l9tree', x: -13.25, y: 28.5, w: 1, h: 1, solid: false, data: { style: 2 } } as any
for (const origin of [{ x: 0, y: 0 }, { x: 512, y: -256 }, { x: -1024, y: 777 }]) {
  const rebased = { ...source, x: source.x - origin.x, y: source.y - origin.y }
  check(JSON.stringify(outdoorTreeIdentity(source, 9, { x: 0, y: 0 })) === JSON.stringify(outdoorTreeIdentity(rebased, 9, origin)), `L9 identity changes under world rebase ${JSON.stringify(origin)}`)
}

const structure = { kind: 'l10tree', x: 10, y: 20, w: 1, h: 1, solid: false, data: { v: 3 } } as any
let classicTree: THREE.Group | undefined, realisticTree: THREE.Group | undefined
for (const mode of ['classic', 'realistic'] as const) {
  setMaterialMode(mode)
  const a = buildOutdoorTree(structure, 10), b = buildOutdoorTree({ ...structure, x: 12 }, 10)
  check(a.children.length === 3, `L10 ${mode}: expected exactly three meshes`)
  check(a.children.every(o => o instanceof THREE.Mesh), `L10 ${mode}: non-mesh child`)
  const meshes = a.children as THREE.Mesh[]
  const trunk = meshes.find(m => m.name.endsWith('trunk'))!, branches = meshes.find(m => m.name.endsWith('branches'))!, leaves = meshes.find(m => m.name.endsWith('leaves'))!
  check(!trunk.userData.noCollision && branches.userData.noCollision === 1 && leaves.userData.noCollision === 1, `L10 ${mode}: collision flags incorrect`)
  check((leaves.material as THREE.Material & { alphaTest?: number }).alphaTest! > 0, `L10 ${mode}: leaves are not alpha-tested`)
  check((trunk.material as any).map && (trunk.material as any).normalMap, `L10 ${mode}: bark color/normal maps missing`)
  check((leaves.material as any).map && (leaves.material as any).normalMap, `L10 ${mode}: leaf color/normal maps missing`)
  check((a.children[0] as THREE.Mesh).material === (b.children[0] as THREE.Mesh).material, `L10 ${mode}: material cache not shared`)
  if (mode === 'classic') classicTree = a; else realisticTree = a
}
check((classicTree!.children[0] as THREE.Mesh).material instanceof THREE.MeshLambertMaterial, 'classic tree is not Lambert')
check((realisticTree!.children[0] as THREE.Mesh).material instanceof THREE.MeshStandardMaterial, 'realistic tree is not Standard')
check((classicTree!.children[0] as THREE.Mesh).material !== (realisticTree!.children[0] as THREE.Mesh).material, 'material modes share material instance')
check(OUTDOOR_TREE_FORMS.length === 6, 'tree form registry is not six entries')

console.log(`Outdoor tree geometry / cache / materials: ${count} assertions passed`)
console.log(JSON.stringify({ trianglesPerTree: budgets, cache: outdoorTreeCacheInfo() }))
