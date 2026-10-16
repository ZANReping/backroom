import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import * as THREE from 'three'
import { buildEntityMesh } from '../src/game/renderer/entitiesMesh'
import { animateWretch } from '../src/game/renderer/wretchMesh'
import { wretchKind, type WretchKind, type WretchState } from '../src/game/engine/wretchAI'
import { makeEntity } from '../src/game/entities'
import { disposeCharacterModel } from '../src/game/renderer/retroResources'
import { setMaterialMode } from '../src/game/renderer/shared'

// Geometry-only Node check. The runtime verifier exercises real Canvas textures.
let checks = 0
const ok = (v: unknown, message: string) => { assert(v, message); checks++ }
const finite = (a: ArrayLike<number>) => Array.from(a).every(Number.isFinite)
const kinds: WretchKind[] = ['shambler', 'sprinter', 'smart', 'mutant']
const seeds = new Map<WretchKind, number>()
for (let seed = 0; seeds.size < kinds.length; seed++) { const kind = wretchKind(seed); if (!seeds.has(kind)) seeds.set(kind, seed) }

function state(kind: WretchKind): WretchState {
  return { kind, t: 0, lastHp: 75, alertT: 0, lastX: 0, lastY: 0, lostT: 99, voiceCd: 0, burstT: 0, rest: false, dodgeT: 0, dodgeSide: 1, flank: 1, bashT: 0, bashHitT: 0, scratchT: 0, stuckT: 0 }
}
function resources(root: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), skeletons = new Set<THREE.Skeleton>(), textures = new Set<THREE.Texture>()
  root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; geometries.add(m.geometry); for (const mat of Array.isArray(m.material) ? m.material : [m.material]) { materials.add(mat); for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap']) { const t = (mat as any)[k]; if (t?.isTexture) textures.add(t) } }; if ((m as THREE.SkinnedMesh).isSkinnedMesh) skeletons.add((m as THREE.SkinnedMesh).skeleton) })
  return { geometries, materials, skeletons, textures, owned: [...geometries, ...materials, ...skeletons] }
}
function inspect(root: THREE.Group, label: string) {
  let tris = 0, draws = 0
  root.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh) return
    const g = m.geometry; const n = g.attributes.position.count; tris += (g.index?.count ?? n) / 3
    const visible = m.visible && (Array.isArray(m.material) ? m.material.some(x => x.visible) : m.material.visible)
    if (visible) draws += Array.isArray(m.material) ? g.groups.length || 1 : 1
    for (const [name, attr] of Object.entries(g.attributes)) ok(finite(attr.array), `${label} finite ${name}`)
    if (g.index) ok(Array.from(g.index.array).every(i => i >= 0 && i < n), `${label} valid indices`)
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
      const skin = m as THREE.SkinnedMesh, w = g.getAttribute('skinWeight'), si = g.getAttribute('skinIndex')
      ok(!!w && !!si && !!g.attributes.uv, `${label} skinned attributes`)
      for (let i = 0; i < n; i++) { let sum = 0; for (let j = 0; j < 4; j++) { const weight = w.array[i * 4 + j], index = si.array[i * 4 + j]; sum += weight; ok(weight >= 0 && weight <= 1 && Number.isInteger(index) && index < skin.skeleton.bones.length, `${label} valid skin binding`) }; ok(Math.abs(sum - 1) < 1e-4, `${label} normalized skin weights`) }
    }
  })
  ok(tris <= 8000, `${label} triangle budget`); ok(draws <= 9, `${label} draw budget`)
  return { tris, draws }
}
const stats: object[] = []
for (const mode of ['classic', 'realistic'] as const) {
  setMaterialMode(mode)
  for (const kind of kinds) {
    const seed = seeds.get(kind)!; const a = buildEntityMesh('wretch', { seed }); const b = buildEntityMesh('wretch', { seed }); const ra = resources(a), rb = resources(b)
    ok(ra.owned.every(x => !rb.owned.includes(x)), `${mode}/${kind} ownership independent`)
    ok([...ra.textures].every(t => t.userData.retroShared || t.userData.entityShared), `${mode}/${kind} shared texture flags`)
    const da = inspect(a, `${mode}/${kind}`), db = inspect(b, `${mode}/${kind}/repeat`); ok(da.tris === db.tris && da.draws === db.draws, `${mode}/${kind} stable geometry diagnostics`)
    const eye = a.getObjectByName('wretchEye') as THREE.Mesh
    ok((eye.material as THREE.Material).type === (mode === 'classic' ? 'MeshLambertMaterial' : 'MeshStandardMaterial'), `${mode} eye uses active material mode`)
    const ea = makeEntity('wretch', 0, 0); ea.id = seed; ea.wr = state(kind); ea.lungeT = 0
    const rig = a.userData.wretchRig, mesh = rig.npc.mesh as THREE.SkinnedMesh
    const sampleVertices = () => {
      a.updateMatrixWorld(true)
      const result: THREE.Vector3[] = []
      for (let i = 0; i < mesh.geometry.attributes.position.count; i += 23) result.push(mesh.getVertexPosition(i, new THREE.Vector3()))
      return result
    }
    let clock = 1.5, idleVertices: THREE.Vector3[] = []
    for (const phase of ['idle', 'attack', 'run', 'bash'] as const) {
      ea.state = phase === 'attack' || phase === 'bash' ? 'attack' : phase === 'run' ? 'chase' : 'wander'
      ea.lungeT = phase === 'attack' ? 0.21 : 0
      ea.wr!.bashS = phase === 'bash' ? ({} as any) : undefined; ea.wr!.bashT = phase === 'bash' ? 1 : 0
      for (let frame = 0; frame < 60; frame++) {
        clock += 1 / 60
        if (phase === 'run') ea.animT += 4.6 / 60
        animateWretch(a, ea, clock, 0)
      }
      const vertices = sampleVertices()
      a.traverse(o => ok(finite(o.matrixWorld.elements), `${mode}/${kind}/${phase} finite transform`))
      if (phase === 'idle') idleVertices = vertices
      else ok(vertices.some((v, i) => v.distanceTo(idleVertices[i]) > 0.15), `${mode}/${kind}/${phase} deforms actual skinned vertices`)
      if (phase === 'run' && kind === 'sprinter') ok(a.userData.wrRun > .95 && rig.npc.bones.spine.rotation.x > .8, `${mode} sprinter blends into low running stance`)
      if (phase === 'attack' && kind === 'smart') ok(rig.npc.bones.upperArmR.rotation.x < -2.4, `${mode} smart wretch lifts pipe above shoulder`)
    }
    stats.push({ mode, kind, seed, tris: da.tris, draws: da.draws, owned: ra.owned.length, textures: ra.textures.size }); disposeCharacterModel(a); disposeCharacterModel(b)
  }
}
for (const mode of ['classic', 'realistic'] as const) { setMaterialMode(mode); const a = buildEntityMesh('wretch', { seed: seeds.get('shambler')! }), b = buildEntityMesh('wretch', { seed: seeds.get('shambler')! }); const ra = resources(a), rb = resources(b); const counts = new Map<object, number>(); for (const x of [...ra.owned, ...rb.owned, ...ra.textures, ...rb.textures]) { counts.set(x, 0); const dispose = x.dispose.bind(x); x.dispose = () => { counts.set(x, counts.get(x)! + 1); dispose() } }; disposeCharacterModel(a); ok(ra.owned.every(x => counts.get(x) === 1), `${mode} releases A owned resources`); ok(rb.owned.every(x => counts.get(x) === 0), `${mode} keeps B alive`); ok([...ra.textures, ...rb.textures].every(x => counts.get(x) === 0), `${mode} keeps shared textures`); disposeCharacterModel(b); ok(rb.owned.every(x => counts.get(x) === 1), `${mode} releases B owned resources`) }
mkdirSync('reports/wretch-import', { recursive: true }); writeFileSync('reports/wretch-import/mesh.json', JSON.stringify({ checks, seeds: Object.fromEntries(seeds), stats }, null, 2) + '\n'); console.log(JSON.stringify({ checks, seeds: Object.fromEntries(seeds), stats }, null, 2))
