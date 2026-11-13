import type * as THREE from 'three'

/** Material.copy JSON-serializes userData. Resource metadata must retain its
 * texture/uniform references, without encoding canvases or changing the source. */
export function cloneRenderMaterial<T extends THREE.Material>(source: T): T {
  const view = Object.create(source) as T
  view.userData = {}
  const copy = source.clone.call(view) as T
  copy.userData = { ...source.userData }
  copy.onBeforeCompile = source.onBeforeCompile
  copy.customProgramCacheKey = source.customProgramCacheKey
  return copy
}
