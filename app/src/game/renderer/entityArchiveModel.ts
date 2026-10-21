import * as THREE from 'three'
import { ENTITIES } from '../entities'
import { entityArchiveView } from '../entities/archiveViews'
import type { MothForm } from '../entities/types'
import type { SmilerKind } from '../entities/smilers'
import { ratMorphFor } from '../entities/rats'
import { buildEntityMesh, type EntityMeshOpts } from './entitiesMesh'
import { buildAvatarModel } from './retroAvatar'
import { randomAvatar } from '../core/avatar'
import { mulberry } from './shared'
import {WRANGLER_DIM,type WranglerRig} from './wranglerMesh'

export function entityArchiveOptions(type: string, step = 0): EntityMeshOpts {
  const { seed, specimen, form } = entityArchiveView(type, step), traits = form?.traits
  return {
    seed,
    mothForm: type === 'deathmoth' ? form?.id as MothForm : undefined,
    smilerKind: type === 'smiler' ? form?.id as SmilerKind : undefined,
    l3clump: traits?.l3clump, l3face: traits?.l3face, tool: traits?.tool,
    wranglerKind:traits?.wranglerKind,
    houndNeutral: traits?.houndKind === 'neutral', wretchKind: traits?.wretchKind,
    ratMorph: type === 'corpserat' ? ratMorphFor(0, traits ?? {}) : undefined,
    capybara: traits?.capybara, ceilingCrawler: traits?.ceilingCrawler,
    arachnidMorph: traits?.arachnidMorph, arachnidBreed: specimen, herbivore: traits?.herbivore,
  }
}

/** Same parent-entity model as gameplay, with a stable specimen seed. */
export function buildEntityArchiveModel(type: string, step = 0): THREE.Group | null {
  if (!ENTITIES[type] || type === 'malady') return null // No visible physical model.
  const view = entityArchiveView(type, step)
  let model: THREE.Group
  if (type === 'skinstealer' && view.form?.traits?.skinPhase === 'skinned') {
    // Same stolen-avatar factory and seed convention as the game's human disguise.
    model = new THREE.Group()
    const avatar = buildAvatarModel(randomAvatar(mulberry(view.seed)), { seed: view.seed % 100000, stolen: true })
    avatar.rotation.y = Math.PI / 2; model.add(avatar)
  } else model = buildEntityMesh(type, entityArchiveOptions(type, step))
  // Keep faces readable, but show flat wings from above and long bodies broadside.
  model.rotation.y += (type === 'thething' ? -.24 : -Math.PI / 2 + .32) + view.angle * Math.PI / 2
  if (type === 'deathmoth') model.rotation.x = .95
  model.updateMatrixWorld(true)
  // Studio lighting must not sample the active level's darkness or probe field.
  // Only this new model's material uniforms are replaced; world uniforms stay intact.
  const materials = new Set<THREE.Material>()
  model.traverse(o => {
    const m = o as THREE.Mesh
    if (m.material) for (const material of Array.isArray(m.material) ? m.material : [m.material]) materials.add(material)
  })
  for (const material of materials) {
    const compile = material.onBeforeCompile, key = material.customProgramCacheKey()
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer)
      for (const name of ['l0EnvironmentOn', 'l0PerceptionOn', 'l1ProbeActive']) {
        if (shader.uniforms[name]) shader.uniforms[name] = { value: 0 }
      }
    }
    material.customProgramCacheKey = () => key + '|entity-archive-studio-v1'
  }
  return model
}

function archiveBounds(model:THREE.Group):THREE.Box3 {
  const rig=model.userData.wranglerRig as WranglerRig|undefined
  if(!rig)return new THREE.Box3().setFromObject(model,true)
  const b=new THREE.Box3().setFromPoints(rig.pts).expandByScalar(WRANGLER_DIM[rig.kind].r*1.65)
  const head=new THREE.Box3().setFromObject(rig.headRig.head,true)
  return b.applyMatrix4(model.matrixWorld).union(head)
}

/** Fit all eight bounds corners, including long bodies, wings and raised limbs. */
export function frameEntityArchive(model: THREE.Group, camera: THREE.PerspectiveCamera) {
  // SkinnedMesh.updateMatrixWorld also refreshes its inverse bind matrix. Using
  // updateWorldMatrix here would count the studio scale twice in skinned bounds.
  model.updateMatrixWorld(true)
  const original = archiveBounds(model)
  if (original.isEmpty()) throw new Error('Entity has no renderable bounds')
  const size = original.getSize(new THREE.Vector3()), center = original.getCenter(new THREE.Vector3())
  if (![...size, ...center].every(Number.isFinite) || Math.max(...size) < .0001) throw new Error('Invalid entity bounds')
  const root = new THREE.Group(), offset = new THREE.Group()
  offset.add(model); offset.position.copy(center).multiplyScalar(-1); root.add(offset)
  root.scale.setScalar(2 / Math.max(...size)); root.updateMatrixWorld(true)
  const bounds = archiveBounds(model)
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * .86, tanX = tanY * camera.aspect
  let distance = 0
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    distance = Math.max(distance, Math.abs(x) / tanX + z, Math.abs(y) / tanY + z)
  }
  camera.near = .01; camera.far = distance + 10
  camera.position.set(0, 0, distance); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true)
  return { root, bounds, distance }
}
