import * as THREE from 'three'
import { architecturalGlassMaterial, architecturalGlassPassMaterials } from './shared'

/** Only call on a completed static batch with privately-owned geometries. */
export function prepareArchitecturalGlassPasses(batch: THREE.Group): void {
  const source = architecturalGlassMaterial()
  for (const object of batch.children) {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || mesh.material !== source
      || !mesh.userData.noCastShadow || mesh.castShadow
      || mesh.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender
      || mesh.onAfterRender !== THREE.Object3D.prototype.onAfterRender) continue
    const count = mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position')?.count
    if (!count) continue
    // Both groups cover the original geometry. Three's stable transparent sort
    // keeps these two entries together (same object id, depth and renderOrder).
    // drawRange, culling bounds, transforms, buffers and raycast geometry remain.
    mesh.geometry.clearGroups()
    mesh.geometry.addGroup(0, count, 0)
    mesh.geometry.addGroup(0, count, 1)
    mesh.material = architecturalGlassPassMaterials()
  }
}
