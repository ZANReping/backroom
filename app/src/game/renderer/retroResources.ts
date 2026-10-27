import type * as THREE from 'three'

// Shared images outlive individual avatars and renderer instances. Notify static
// portraits after loads so an early placeholder is never their final image.
let revision = 0
const listeners = new Set<() => void>()
export const retroTextureRevision = () => revision
export const subscribeRetroTextures = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function retroTextureChanged() {
  revision++
  for (const listener of listeners) listener()
}

/** Per-instance geometry, material and bone textures only; images stay shared. */
export function disposeCharacterModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), skeletons = new Set<THREE.Skeleton>()
  root.traverse(o => {
    const mesh = o as THREE.Mesh, skin = o as THREE.SkinnedMesh
    if (mesh.geometry && mesh.geometry.userData.entityShared !== true) geometries.add(mesh.geometry)
    if (skin.isSkinnedMesh) skeletons.add(skin.skeleton)
    if (mesh.material) for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (mat.userData.entityShared !== true) materials.add(mat)
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) (mesh as THREE.InstancedMesh).dispose()
  })
  for (const geometry of geometries) geometry.dispose()
  for (const skeleton of skeletons) skeleton.dispose()
  for (const material of materials) material.dispose()
}
