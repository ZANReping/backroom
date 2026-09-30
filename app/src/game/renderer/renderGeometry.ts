import * as THREE from 'three'

/** Render-only copy of geometry data; avoids rerunning primitive constructors. */
export function cloneRenderGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  return new THREE.BufferGeometry().copy(source)
}
