import * as THREE from 'three'
import { materialBatchKey } from './materialBatch'
import { geometryDataKey } from './staticBatch'
import { cloneRenderGeometry } from './renderGeometry'

type ColoredMaterial = THREE.MeshLambertMaterial | THREE.MeshBasicMaterial
type Part = THREE.InstancedMesh<THREE.BufferGeometry, ColoredMaterial>
const white = new THREE.Color(1, 1, 1)
const identity = new THREE.Matrix4()

function equalAttribute(a: THREE.BufferAttribute, b: THREE.BufferAttribute): boolean {
  if (a.itemSize !== b.itemSize || a.normalized !== b.normalized || a.gpuType !== b.gpuType
    || a.array.constructor !== b.array.constructor || a.array.byteLength !== b.array.byteLength) return false
  const left = new Uint8Array(a.array.buffer, a.array.byteOffset, a.array.byteLength)
  const right = new Uint8Array(b.array.buffer, b.array.byteOffset, b.array.byteLength)
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false
  return true
}

// The existing hash is only a candidate key: never let its quantization or a
// hash collision substitute another instance group's geometry or UVs.
function equalGeometry(a: THREE.BufferGeometry, b: THREE.BufferGeometry): boolean {
  if (!!a.index !== !!b.index || (a.index && b.index && !equalAttribute(a.index, b.index))) return false
  const names = Object.keys(a.attributes)
  if (names.length !== Object.keys(b.attributes).length) return false
  return names.every(name => b.attributes[name]
    && equalAttribute(a.attributes[name] as THREE.BufferAttribute, b.attributes[name] as THREE.BufferAttribute))
}

/**
 * Consumes only private, completed batchStaticRootsJob instance outputs. Groups
 * with identical geometry/material state can share one draw, with diffuse tint
 * carried by instanceColor. Each replacement publishes atomically; its geometry
 * owns its cloned material. Pending sources remain intact on cancellation.
 */
export function* batchStaticInstanceColorsJob(target: THREE.Group): Generator<void, void, unknown> {
  const buckets = new Map<string, Part[][]>()
  const materialKeys = new Map<THREE.Material, string>()
  for (const object of [...target.children]) {
    yield
    const mesh = object as Part, material = mesh.material, geometry = mesh.geometry
    if (!mesh.isInstancedMesh || mesh.name !== 'l9-static-instanced' || mesh.instanceColor || mesh.morphTexture
      || mesh.children.length || !mesh.visible || mesh.renderOrder !== 0
      || !Number.isInteger(mesh.count) || mesh.count <= 0 || mesh.count > mesh.instanceMatrix.count
      || !material || Array.isArray(material) || (!('isMeshLambertMaterial' in material) && !('isMeshBasicMaterial' in material))
      || material.transparent || material.opacity !== 1 || material.vertexColors || !material.visible
      || !material.depthWrite || !material.depthTest || !material.colorWrite || material.blending !== THREE.NormalBlending || material.stencilWrite
      || Object.keys(material.userData).length || material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile
      || material.onBeforeRender !== THREE.Material.prototype.onBeforeRender
      || mesh.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || mesh.onAfterRender !== THREE.Object3D.prototype.onAfterRender
      || mesh.onBeforeShadow !== THREE.Object3D.prototype.onBeforeShadow || mesh.onAfterShadow !== THREE.Object3D.prototype.onAfterShadow
      || mesh.raycast !== THREE.InstancedMesh.prototype.raycast
      || !geometry?.hasAttribute('position') || geometry.hasAttribute('color') || Object.keys(geometry.morphAttributes).length
      || geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity
      || Object.values(geometry.attributes).some(attribute => !(attribute instanceof THREE.BufferAttribute)
        || (attribute as THREE.InstancedBufferAttribute).isInstancedBufferAttribute)) continue
    mesh.updateMatrix()
    if (!mesh.matrix.equals(identity)) continue
    let key = materialKeys.get(material)
    if (key === undefined) { key = materialBatchKey(material, white); materialKeys.set(material, key) }
    if (key.startsWith('unique:')) continue
    key += `|${geometryDataKey(geometry)}|${mesh.layers.mask}|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.frustumCulled}|${!!mesh.userData.noCastShadow}`
    const candidates = buckets.get(key) ?? []
    const match = candidates.find(parts => equalGeometry(parts[0].geometry, geometry))
    if (match) match.push(mesh); else candidates.push([mesh])
    buckets.set(key, candidates)
  }
  const matrix = new THREE.Matrix4(), box = new THREE.Box3(), sphere = new THREE.Sphere()
  for (const candidates of buckets.values()) for (const sources of candidates) {
    if (sources.length < 2) continue
    yield
    const first = sources[0], geometry = cloneRenderGeometry(first.geometry)
    let material: ColoredMaterial | undefined, mesh: Part | undefined, published = false, boundMaterial = false
    try {
      material = first.material.clone()
      material.color.copy(white)
      const ownedMaterial = material
      const releaseMaterial = () => { geometry.removeEventListener('dispose', releaseMaterial); ownedMaterial.dispose() }
      geometry.addEventListener('dispose', releaseMaterial); boundMaterial = true
      mesh = new THREE.InstancedMesh(geometry, material, sources.reduce((count, source) => count + source.count, 0))
      mesh.name = 'static-instance-color-batch'
      mesh.layers.mask = first.layers.mask
      mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow
      mesh.frustumCulled = first.frustumCulled; mesh.userData.noCastShadow = first.userData.noCastShadow
      mesh.matrixAutoUpdate = false
      if (!geometry.boundingBox) geometry.computeBoundingBox()
      if (!geometry.boundingSphere) geometry.computeBoundingSphere()
      mesh.boundingBox = new THREE.Box3(); mesh.boundingSphere = new THREE.Sphere()
      let index = 0
      for (const source of sources) for (let i = 0; i < source.count; i++) {
        if (index % 32 === 0) yield
        source.getMatrixAt(i, matrix)
        mesh.setMatrixAt(index, matrix); mesh.setColorAt(index, source.material.color)
        mesh.boundingBox.union(box.copy(geometry.boundingBox!).applyMatrix4(matrix))
        mesh.boundingSphere.union(sphere.copy(geometry.boundingSphere!).applyMatrix4(matrix))
        index++
      }
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage); mesh.instanceMatrix.needsUpdate = true
      mesh.instanceColor!.setUsage(THREE.StaticDrawUsage); mesh.instanceColor!.needsUpdate = true
      target.add(mesh); published = true
      for (const source of sources) { target.remove(source); source.dispose(); source.geometry.dispose() }
    } finally {
      if (!published) {
        mesh?.dispose(); geometry.dispose()
        if (!boundMaterial) material?.dispose()
      }
    }
  }
}
