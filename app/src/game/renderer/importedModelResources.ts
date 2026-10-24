import * as THREE from 'three'
import { cloneRenderGeometry } from './renderGeometry'

export function ownImportedModel<T extends THREE.Object3D>(root: T, opts: { geometry?: boolean } = {}) {
  const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>(), materials = new Map<THREE.Material, THREE.Material>()
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    if (opts.geometry && m.geometry) {
      let g = geometries.get(m.geometry); if (!g) { g = cloneRenderGeometry(m.geometry); for (const key of ['entityShared', 'shared', 'sharedModelGeometry']) delete g.userData[key]; geometries.set(m.geometry, g) }; m.geometry = g
    }
    const src = Array.isArray(m.material) ? m.material : [m.material]
    const own = src.map((mat) => { let c = materials.get(mat); if (!c) { c = mat.clone(); for (const key of ['shared', 'entityShared']) delete c.userData[key]; c.onBeforeCompile = mat.onBeforeCompile; c.customProgramCacheKey = mat.customProgramCacheKey.bind(c); materials.set(mat, c) }; return c })
    m.material = Array.isArray(m.material) ? own : own[0]
  })
  return root
}
