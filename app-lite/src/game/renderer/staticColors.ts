import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { materialBatchKey } from './materialBatch'
import { cloneRenderGeometry } from './renderGeometry'

type ColoredMaterial = THREE.MeshLambertMaterial | THREE.MeshBasicMaterial
type Part = THREE.Mesh<THREE.BufferGeometry, ColoredMaterial>
const white = new THREE.Color(1, 1, 1)
const identity = new THREE.Matrix4()

/**
 * Second pass for already-baked, privately-owned static meshes in one spatial
 * bucket. Only diffuse color may differ; textures and all other state still
 * participate in the material key. Interactive originals remain outside this
 * render bucket. Sources are consumed only after their replacement is complete.
 */
export function* batchStaticColorsJob(target: THREE.Group): Generator<void> {
  const groups = new Map<string, Part[]>()
  const keys = new Map<THREE.Material, string>()
  let visited = 0
  for (const object of [...target.children]) {
    if (++visited % 4 === 0) yield
    const mesh = object as Part, material = mesh.material, geometry = mesh.geometry
    if (!mesh.isMesh || (mesh as unknown as THREE.InstancedMesh).isInstancedMesh || (mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh
      || mesh.children.length || !mesh.visible || !material || Array.isArray(material)
      || (!('isMeshLambertMaterial' in material) && !('isMeshBasicMaterial' in material))
      || material.transparent || material.opacity !== 1 || material.vertexColors || !material.visible
      || !material.depthWrite || !material.depthTest || !material.colorWrite || material.blending !== THREE.NormalBlending || material.stencilWrite
      || Object.keys(material.userData).length
      || material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile
      || mesh.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || mesh.onAfterRender !== THREE.Object3D.prototype.onAfterRender
      || mesh.renderOrder !== 0 || !geometry?.hasAttribute('position') || geometry.hasAttribute('color')
      || Object.keys(geometry.morphAttributes).length || geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) continue
    mesh.updateMatrix()
    if (!mesh.matrix.equals(identity)) continue
    let key = keys.get(material)
    if (key === undefined) { key = materialBatchKey(material, white); keys.set(material, key) }
    if (key.startsWith('unique:')) continue
    const layout = Object.keys(geometry.attributes).sort().map(name => {
      const a = geometry.getAttribute(name)
      return `${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`
    }).join('|')
    key += `|${!!geometry.index}|${layout}|${mesh.layers.mask}|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.frustumCulled}|${!!mesh.userData.noCastShadow}`
    const group = groups.get(key) ?? []
    group.push(mesh); groups.set(key, group)
  }
  for (const sources of groups.values()) {
    if (sources.length < 2) continue
    const geometries: THREE.BufferGeometry[] = []
    try {
      for (const source of sources) {
        yield
        const geometry = cloneRenderGeometry(source.geometry)
        geometries.push(geometry)
        const color = source.material.color, colors = new Float32Array(geometry.getAttribute('position').count * 3)
        for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      }
      yield
      const geometry = mergeGeometries(geometries, false)
      if (!geometry) continue
      const first = sources[0], material = first.material.clone()
      material.color.copy(white); material.vertexColors = true
      // This new material belongs solely to the merged geometry. Renderer
      // teardown already waits for outstanding compile jobs before disposal.
      const releaseMaterial = () => { geometry.removeEventListener('dispose', releaseMaterial); material.dispose() }
      geometry.addEventListener('dispose', releaseMaterial)
      geometry.computeBoundingBox(); geometry.computeBoundingSphere()
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = 'static-color-batch'
      mesh.layers.mask = first.layers.mask
      mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow
      mesh.frustumCulled = first.frustumCulled
      mesh.userData.noCastShadow = first.userData.noCastShadow
      mesh.matrixAutoUpdate = false
      target.add(mesh)
      for (const source of sources) { target.remove(source); source.geometry.dispose() }
    } finally { for (const geometry of geometries) geometry.dispose() }
  }
}
