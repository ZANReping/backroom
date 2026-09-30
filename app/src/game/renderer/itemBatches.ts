import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { cloneRenderGeometry } from './renderGeometry'

// These five ground/projectile models have rigid leaf parts. Their parent
// transforms, texture coordinates, materials and pickup halo stay unchanged.
const rigidItems = new Set(['almond', 'cashew', 'canned', 'bandage', 'battery'])

export function batchRigidItem(root: THREE.Group) {
  if (!rigidItems.has(root.userData.itemType) || root.userData.rigidItemBatched) return
  root.userData.rigidItemBatched = true
  const parents: THREE.Object3D[] = []
  root.traverse(object => { if (object.children.length) parents.push(object) })
  const retired = new Set<THREE.BufferGeometry>()
  for (const parent of parents) {
    const buckets = new Map<string, THREE.Mesh[]>()
    for (const object of [...parent.children]) {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh
        || mesh.children.length || !mesh.visible || mesh.renderOrder !== 0
        || mesh.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || mesh.onAfterRender !== THREE.Object3D.prototype.onAfterRender) continue
      const geometry = mesh.geometry
      if (!geometry?.hasAttribute('position') || Object.keys(geometry.morphAttributes).length
        || geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) continue
      let material = mesh.material
      if (Array.isArray(material)) {
        // The bandage roll assigns the same gauze to all three cylinder groups.
        // Collapse only a complete, non-overlapping partition of its triangles.
        const materials = material, count = geometry.index?.count ?? geometry.getAttribute('position').count
        let offset = 0
        if (!materials.length || materials.some(m => m !== materials[0]) || !geometry.groups.length
          || geometry.groups.some(g => { const ok = g.start === offset && g.count > 0 && g.start % 3 === 0 && g.count % 3 === 0 && (g.materialIndex ?? 0) >= 0 && (g.materialIndex ?? 0) < materials.length; offset += g.count; return !ok })
          || offset !== count) continue
        material = material[0]
      }
      if (!material || !material.visible || material.transparent || material.opacity !== 1
        || !material.depthWrite || !material.depthTest || !material.colorWrite || material.stencilWrite
        || material.blending !== THREE.NormalBlending || material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile
        || (!('isMeshBasicMaterial' in material) && !('isMeshLambertMaterial' in material) && !('isMeshStandardMaterial' in material))) continue
      mesh.updateMatrix()
      if (mesh.matrix.determinant() <= 0) continue
      mesh.material = material
      const layout = Object.keys(geometry.attributes).sort().map(name => {
        const attribute = geometry.getAttribute(name)
        return `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`
      }).join('|')
      const key = `${material.uuid}|${!!geometry.index}|${layout}|${mesh.layers.mask}|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.frustumCulled}|${!!mesh.userData.noCastShadow}`
      const bucket = buckets.get(key) ?? []
      bucket.push(mesh); buckets.set(key, bucket)
    }
    for (const sources of buckets.values()) {
      if (sources.length < 2) continue
      const copies: THREE.BufferGeometry[] = []
      try {
        for (const source of sources) {
          const geometry = cloneRenderGeometry(source.geometry)
          copies.push(geometry); geometry.applyMatrix4(source.matrix)
        }
        const geometry = mergeGeometries(copies, false)
        if (!geometry) continue
        geometry.computeBoundingBox(); geometry.computeBoundingSphere()
        const first = sources[0], batch = new THREE.Mesh(geometry, first.material)
        batch.name = 'item-rigid-material-batch'
        batch.layers.mask = first.layers.mask; batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow
        batch.frustumCulled = first.frustumCulled; batch.userData.noCastShadow = first.userData.noCastShadow
        batch.matrixAutoUpdate = false
        parent.add(batch)
        for (const source of sources) { parent.remove(source); retired.add(source.geometry) }
      } finally { for (const geometry of copies) geometry.dispose() }
    }
  }
  // A factory may share geometry with a part excluded from batching.
  root.traverse(object => { const mesh = object as THREE.Mesh; if (mesh.geometry) retired.delete(mesh.geometry) })
  for (const geometry of retired) geometry.dispose()
}
