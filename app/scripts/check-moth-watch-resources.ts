import assert from 'node:assert/strict'
import { createCanvas } from '@napi-rs/canvas'
import * as THREE from 'three'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setMaterialMode } from '../src/game/renderer/shared'
import { buildDeathmothMesh, deathmothResourcesReady, prepareDeathmothJob, type MothRig } from '../src/game/renderer/deathmothMesh'
import { buildWatchMesh, prepareWatchJob, watchResourcesReady, type WatchRig } from '../src/game/renderer/neighborhoodWatchMesh'
import { buildEntityMesh } from '../src/game/renderer/entitiesMesh'
import { buildMangledMesh, buildMangledShroud, MANGLED_PARTS } from '../src/game/renderer/mangledMesh'
import { prepareMangledJob, mangledGeometryReady } from '../src/game/renderer/watchRender'
import { buildMothEggCluster } from '../src/game/renderer/mothNestMesh'

Object.defineProperty(globalThis, 'document', { value: { createElement: () => createCanvas(256, 256), createElementNS: () => ({}) } })
let checks = 0
const ok = (v: unknown, msg: string) => { assert(v, msg); checks++ }
const finite = (a: ArrayLike<number>) => Array.from(a).every(Number.isFinite)
type Resources = { geos: Set<THREE.BufferGeometry>; mats: Set<THREE.Material>; skins: Set<THREE.Skeleton>; tex: Set<THREE.Texture> }
function resources(root: THREE.Object3D): Resources {
  const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>(), skins = new Set<THREE.Skeleton>(), tex = new Set<THREE.Texture>()
  root.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    geos.add(m.geometry)
    for (const x of Array.isArray(m.material) ? m.material : [m.material]) {
      mats.add(x)
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap'] as const) { const t = (x as any)[k] as THREE.Texture | undefined; if (t) tex.add(t) }
    }
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) skins.add((m as THREE.SkinnedMesh).skeleton)
  })
  return { geos, mats, skins, tex }
}
function inspect(root: THREE.Object3D, label: string) {
  const sk: THREE.SkinnedMesh[] = []
  root.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const g = m.geometry
    for (const a of Object.values(g.attributes)) ok(finite(a.array), `${label} finite attribute`)
    for (const list of Object.values(g.morphAttributes)) for (const a of list) ok(finite(a.array), `${label} finite morph`)
    const uv = g.getAttribute('uv'); if (uv) for (let i = 0; i < uv.count * 2; i++) ok(Number.isFinite(uv.array[i]), `${label} finite uv`)
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) sk.push(m as THREE.SkinnedMesh)
  })
  for (const m of sk) {
    const w = m.geometry.getAttribute('skinWeight'), si = m.geometry.getAttribute('skinIndex')
    if (!w || !si) continue
    for (let i = 0; i < w.count; i++) {
      let sum = 0
      for (let j = 0; j < 4; j++) { const v = w.array[i * 4 + j], idx = si.array[i * 4 + j]; sum += v; ok(Number.isFinite(v) && Number.isInteger(idx) && idx >= 0 && idx < m.skeleton.bones.length, `${label} skin binding`) }
      ok(Math.abs(sum - 1) < 1e-3, `${label} normalized weights`)
    }
  }
  return sk
}
function disposeOwned(r: Resources) { for (const g of r.geos) g.dispose(); for (const m of r.mats) m.dispose(); for (const s of r.skins) s.dispose() }
function finishJob(job: Generator<void, void>, limit = 300) { let n = 0, s = job.next(); while (!s.done && n++ < limit) s = job.next(); ok(s.done, 'preparation completes'); return n }

const modes: any[] = []
for (const mode of ['classic', 'realistic'] as const) {
  setMaterialMode(mode)
  for (const form of ['male', 'female', 'guard', 'larva'] as const) {
    finishJob(prepareDeathmothJob(form)); ok(deathmothResourcesReady(form), `${mode}/${form} moth ready`)
    const a = buildDeathmothMesh(form), b = buildDeathmothMesh(form); inspect(a, `${mode}/${form}/a`); inspect(b, `${mode}/${form}/b`)
    const ra = resources(a), rb = resources(b)
    ok([...ra.geos].every(g => !rb.geos.has(g)) && [...ra.mats].every(m => !rb.mats.has(m)) && [...ra.skins].every(s => !rb.skins.has(s)), `${mode}/${form} private instance resources`)
    ok(ra.tex.size > 0 && [...ra.tex].every(t => rb.tex.has(t) && t.userData.entityShared === true), `${mode}/${form} shared tagged textures`)
    modes.push({ mode, form, budget: { meshes: ra.geos.size, draws: [...ra.mats].length, tris: [...ra.geos].reduce((n, g) => n + (g.index ? g.index.count : g.attributes.position.count) / 3, 0) } })
    const rig = b.userData.mothRig as MothRig; rig.bones[0].rotation.z = 0.2; b.updateMatrixWorld(true); disposeOwned(ra); inspect(b, `${mode}/${form}/survivor`)
    const c = buildDeathmothMesh(form); inspect(c, `${mode}/${form}/c`); disposeOwned(resources(b)); disposeOwned(resources(c))
  }
  for (const kind of ['watcher', 'strider'] as const) {
    finishJob(prepareWatchJob(kind)); ok(watchResourcesReady(kind), `${mode}/${kind} ready`)
    const a = buildWatchMesh(kind), b = buildWatchMesh(kind); inspect(a, `${mode}/${kind}/a`); inspect(b, `${mode}/${kind}/b`)
    const ra = resources(a), rb = resources(b); ok([...ra.geos].every(g => !rb.geos.has(g)) && [...ra.mats].every(m => !rb.mats.has(m)) && [...ra.skins].every(s => !rb.skins.has(s)), `${mode}/${kind} private resources`)
    ok(ra.tex.size === 0 || [...ra.tex].every(t => rb.tex.has(t) && t.userData.entityShared === true), `${mode}/${kind} shared textures`)
    const rig = b.userData.watchRig as WatchRig; rig.bones[0].rotation.z = 0.15; b.updateMatrixWorld(true); disposeOwned(ra); inspect(b, `${mode}/${kind}/survivor`); disposeOwned(resources(b))
  }
  const entities = ['watcher', 'strider', 'mangled'] as const
  for (const type of entities) { const root = buildEntityMesh(type); inspect(root, `${mode}/${type}/entity`); disposeOwned(resources(root)) }
}

for (const lod of [1, 0] as const) { finishJob(prepareMangledJob(lod)); ok(mangledGeometryReady(lod), `mangled LOD ${lod} ready`) }
const mangledA = buildMangledMesh(1, 1), mangledB = buildMangledMesh(1, 0)
inspect(mangledA, 'mangled/lo'); inspect(mangledB, 'mangled/hi')
const lodMeshes = (r: THREE.Object3D) => { const out: THREE.Mesh[] = []; r.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && (m.userData.mangledPart || m.userData.mangledShroud)) out.push(m) }); return out }
ok(lodMeshes(mangledA).some(m => m.visible) && lodMeshes(mangledB).some(m => m.visible), 'mangled active LOD visible')
const mangledAR = resources(mangledA), mangledBR = resources(mangledB); ok([...mangledAR.geos].every(g => !mangledBR.geos.has(g)), 'mangled instances private geometry')
const smoke = buildMangledShroud(); inspect(smoke, 'mangled/shroud'); disposeOwned(mangledAR); inspect(mangledB, 'mangled survivor'); disposeOwned(mangledBR); disposeOwned(resources(smoke))

const eggA = buildMothEggCluster(11, 12, 0.24, 'lo'), eggB = buildMothEggCluster(12, 12, 0.24, 'lo'); inspect(eggA, 'nest/a'); inspect(eggB, 'nest/b'); const erA = resources(eggA), erB = resources(eggB); ok([...erA.geos].every(g => !erB.geos.has(g)), 'nest instances private geometry'); disposeOwned(erA); inspect(eggB, 'nest survivor'); disposeOwned(erB)

const out = { checks, modes, mangledParts: MANGLED_PARTS.length }
mkdirSync('reports/moth-watch-import-20261021', { recursive: true }); writeFileSync('reports/moth-watch-import-20261021/resources.json', JSON.stringify(out, null, 2) + '\n'); console.log(JSON.stringify(out, null, 2))
