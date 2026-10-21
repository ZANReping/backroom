import assert from 'node:assert/strict'
import { createCanvas } from '@napi-rs/canvas'
import * as THREE from 'three'
import { setMaterialMode, getMaterialMode } from '../src/game/renderer/shared'
import { buildMeleeMesh, type MeleeType } from '../src/game/renderer/meleeMesh'
import { buildWranglerMesh, buildEggBranch, buildBurrowHole, type WranglerKind, type WranglerRig } from '../src/game/renderer/wranglerMesh'

Object.defineProperty(globalThis, 'document', { value: { createElement: () => createCanvas(256, 256), createElementNS: () => ({}) } })
let checks = 0
const ok = (v: unknown, msg: string) => { assert(v, msg); checks++ }
const finite = (a: ArrayLike<number>) => Array.from(a).every(Number.isFinite)
type Res = { geos: Set<THREE.BufferGeometry>; mats: Set<THREE.Material>; tex: Set<THREE.Texture> }
function resources(root: THREE.Object3D): Res {
  const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>(), tex = new Set<THREE.Texture>()
  root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; geos.add(m.geometry); for (const mat of Array.isArray(m.material) ? m.material : [m.material]) { mats.add(mat); for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap'] as const) { const t = (mat as any)[k] as THREE.Texture | undefined; if (t) tex.add(t) } } })
  return { geos, mats, tex }
}
function inspect(root: THREE.Object3D, label: string) {
  root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; const g = m.geometry; for (const a of Object.values(g.attributes)) ok(finite(a.array), `${label} finite attributes`); const p = g.getAttribute('position'); const n = g.getAttribute('normal'); const uv = g.getAttribute('uv'); if (p && n) ok(p.count === n.count, `${label} position/normal count`); if (uv) ok(finite(uv.array), `${label} finite uv`); if (g.index) for (const i of g.index.array) ok(Number.isInteger(i) && i >= 0 && i < (p?.count ?? 0), `${label} legal index`) })
}
function disposeUnique(r: Res, survivor?: Res) { for (const g of r.geos) if (!survivor?.geos.has(g)) g.dispose(); for (const m of r.mats) if (!survivor?.mats.has(m)) m.dispose(); for (const t of r.tex) if (!survivor?.tex.has(t) && t.userData.shared !== true) t.dispose() }
function taggedShared(a: Res, b: Res, label: string) { for (const t of a.tex) if (b.tex.has(t)) ok(t.userData.shared === true, `${label} shared texture tagged`) }
const melee: MeleeType[] = ['knife', 'crowbar', 'wrench', 'timber', 'axe']
const wranglers: Array<[WranglerKind, boolean]> = [['male', false], ['female', false], ['juvenile', false], ['female', true]]
for (const mode of ['classic', 'realistic'] as const) {
  setMaterialMode(mode); ok(getMaterialMode() === mode, `${mode} material mode`)
  for (const type of melee) for (const state of ['intact', 'broken'] as const) {
    const a = buildMeleeMesh(type, { state, seed: 11 }), b = buildMeleeMesh(type, { state, seed: 12 }); inspect(a, `${mode}/${type}/${state}/a`); inspect(b, `${mode}/${type}/${state}/b`)
    const ra = resources(a), rb = resources(b); ok([...ra.geos].every(x => !rb.geos.has(x)), `${mode}/${type}/${state} geometry isolated`); ok([...ra.mats].every(x => !rb.mats.has(x)), `${mode}/${type}/${state} material isolated`); taggedShared(ra, rb, `${mode}/${type}/${state}`)
    const disposed = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>(); for (const x of [...ra.geos, ...ra.mats, ...ra.tex]) { const d = x.dispose.bind(x); x.dispose = () => { disposed.add(x); d() } }; disposeUnique(ra, rb); inspect(b, `${mode}/${type}/${state}/survivor`); ok(disposed.size > 0, `${mode}/${type}/${state} A disposed`); disposeUnique(rb)
  }
  for (const [kind, pregnant] of wranglers) {
    const a = buildWranglerMesh(kind, { pregnant }), b = buildWranglerMesh(kind, { pregnant }); inspect(a, `${mode}/${kind}/${pregnant}/a`); inspect(b, `${mode}/${kind}/${pregnant}/b`)
    const ra = resources(a), rb = resources(b); ok([...ra.geos].every(x => !rb.geos.has(x)), `${mode}/${kind}/${pregnant} geometry isolated`); ok([...ra.mats].every(x => !rb.mats.has(x)), `${mode}/${kind}/${pregnant} material isolated`); taggedShared(ra, rb, `${mode}/${kind}/${pregnant}`)
    const ar = a.userData.wranglerRig as WranglerRig, br = b.userData.wranglerRig as WranglerRig; ok(ar.u.wSpine.value !== br.u.wSpine.value, `${mode}/${kind}/${pregnant} spine texture isolated`); let aSpineDisposals=0; ar.u.wSpine.value.addEventListener('dispose',()=>aSpineDisposals++); const spine = br.u.wSpine.value; const d = spine.dispose.bind(spine); let spineDisposed = false; spine.dispose = () => { spineDisposed = true; d() }; disposeUnique(ra, rb); inspect(b, `${mode}/${kind}/${pregnant}/survivor`); ok(aSpineDisposals===1, `${mode}/${kind}/${pregnant} A private spine disposed exactly once`); ok(!spineDisposed, `${mode}/${kind}/${pregnant} B spine survives A dispose`); disposeUnique(rb); ok(spineDisposed, `${mode}/${kind}/${pregnant} B private spine disposed with owner`)
  }
}
for (const [name, make] of [['egg', () => buildEggBranch(17, 1, 0)], ['hole', () => buildBurrowHole(1.2, 19, 0)] as const]) { const a = make(), b = make(); inspect(a, `${name}/a`); inspect(b, `${name}/b`); const ra = resources(a), rb = resources(b); ok([...ra.geos].every(x => !rb.geos.has(x)), `${name} geometry isolated`); ok([...ra.mats].every(x=>!rb.mats.has(x)), `${name} materials isolated`); taggedShared(ra,rb,name); disposeUnique(ra, rb); inspect(b, `${name}/survivor`); disposeUnique(rb) }
console.log(JSON.stringify({ checks, modes: ['classic', 'realistic'], melee: melee.length * 2, wrangler: wranglers.length, decorations: 2 }, null, 2))
