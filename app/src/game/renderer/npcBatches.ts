import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { materialBatchKey } from './materialBatch'

type Source = { mesh: THREE.Mesh; mask: number }
type Batch = { mesh: THREE.Mesh; sources: Source[] }
const records = new WeakMap<THREE.Object3D, Batch[]>()
const white = new THREE.Color(1, 1, 1)

const relativeMatrix = (source: THREE.Object3D, anchor: THREE.Object3D) => {
  const matrix = new THREE.Matrix4()
  for (let node: THREE.Object3D | null = source; node && node !== anchor; node = node.parent) matrix.premultiply(node.matrix)
  return matrix
}

// Hair, hats and clothing can contain overlapping coplanar faces. Baking their
// translations into Float32 vertices changes depth ties. Keep those source
// meshes intact instead of changing which colored face wins the tie.
function coplanarDetails(anchor: THREE.Object3D, sources: THREE.Mesh[]) {
  type Face = { mesh: THREE.Mesh; lx: number; ly: number; hx: number; hy: number }
  const planes = new Map<string, Face[]>(), keep = new Set<THREE.Mesh>()
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const edge = new THREE.Vector3(), otherEdge = new THREE.Vector3(), normal = new THREE.Vector3()
  for (const mesh of sources) {
    const matrix = relativeMatrix(mesh, anchor), geometry = mesh.geometry, p = geometry.getAttribute('position'), index = geometry.index
    for (let i = 0, count = index?.count ?? p.count; i + 2 < count; i += 3) {
      a.fromBufferAttribute(p, index ? index.getX(i) : i).applyMatrix4(matrix)
      b.fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1).applyMatrix4(matrix)
      c.fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2).applyMatrix4(matrix)
      normal.crossVectors(edge.subVectors(b, a), otherEdge.subVectors(c, a))
      if (normal.lengthSq() < 1e-16) continue
      normal.normalize()
      const axis = Math.abs(normal.x) > Math.abs(normal.y) ? (Math.abs(normal.x) > Math.abs(normal.z) ? 'x' : 'z') : (Math.abs(normal.y) > Math.abs(normal.z) ? 'y' : 'z')
      if (normal[axis] < 0) normal.negate()
      const key = `${Math.round(normal.x * 1e5)}:${Math.round(normal.y * 1e5)}:${Math.round(normal.z * 1e5)}:${Math.round(normal.dot(a) * 1e5)}`
      const u = axis === 'x' ? 'y' : 'x', v = axis === 'z' ? 'y' : 'z'
      const face = { mesh, lx: Math.min(a[u], b[u], c[u]), ly: Math.min(a[v], b[v], c[v]), hx: Math.max(a[u], b[u], c[u]), hy: Math.max(a[v], b[v], c[v]) }
      const others = planes.get(key) ?? []
      for (const other of others) if (other.mesh !== mesh
        && Math.min(face.hx, other.hx) - Math.max(face.lx, other.lx) > 1e-6
        && Math.min(face.hy, other.hy) - Math.max(face.ly, other.ly) > 1e-6) { keep.add(mesh); keep.add(other.mesh) }
      others.push(face); planes.set(key, others)
    }
  }
  return keep
}

/** Merge rigid NPC details within each animated joint, baking diffuse color. */
export function batchNpcParts(root: THREE.Object3D, parts: Record<string, THREE.Object3D>) {
  if (records.has(root)) return
  const anchors = new Set<THREE.Object3D>([root, ...Object.values(parts)])
  root.traverse(node => { if (node.userData.joeyGuitar) anchors.add(node) })
  const groups = new Map<THREE.Object3D, Map<string, THREE.Mesh[]>>()
  const keys = new Map<THREE.Material, string>()
  const visit = (node: THREE.Object3D, anchor: THREE.Object3D) => {
    if (!node.visible) return
    if (anchors.has(node)) anchor = node
    const mesh = node as THREE.Mesh, material = mesh.material as THREE.MeshLambertMaterial
    if (mesh.isMesh && !(mesh as THREE.SkinnedMesh).isSkinnedMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh
      && material?.isMeshLambertMaterial && !material.transparent && material.opacity === 1 && !material.vertexColors
      && material.onBeforeCompile === THREE.Material.prototype.onBeforeCompile
      && mesh.onBeforeRender === THREE.Object3D.prototype.onBeforeRender
      && mesh.renderOrder === 0 && mesh.layers.mask !== 0 && !Object.keys(mesh.geometry.morphAttributes).length
      && mesh.geometry.drawRange.start === 0 && mesh.geometry.drawRange.count === Infinity) {
      const geometry = mesh.geometry
      if (geometry.hasAttribute('position') && geometry.hasAttribute('normal') && !geometry.hasAttribute('color')) {
        let key = keys.get(material)
        if (key === undefined) { key = materialBatchKey(material, white); keys.set(material, key) }
        const layout = Object.keys(geometry.attributes).sort().map(name => {
          const a = geometry.getAttribute(name)
          return `${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`
        }).join('|')
        key += `|${layout}|${mesh.layers.mask}|${mesh.castShadow}|${mesh.receiveShadow}|${!!mesh.userData.noCastShadow}`
        let buckets = groups.get(anchor)
        if (!buckets) { buckets = new Map(); groups.set(anchor, buckets) }
        const bucket = buckets.get(key) ?? []
        bucket.push(mesh); buckets.set(key, bucket)
      }
    }
    for (const child of node.children) visit(child, anchor)
  }
  root.updateMatrixWorld(true)
  visit(root, root)
  const batches: Batch[] = []
  const keep = coplanarDetails(root, [...groups.values()].flatMap(buckets => [...buckets.values()].flat()))
  for (const [anchor, buckets] of groups) {
    for (const candidates of buckets.values()) {
      const sources = candidates.filter(source => !keep.has(source))
      if (sources.length < 2) continue
      const geometries = sources.map(source => {
        const geometry = source.geometry.index ? source.geometry.toNonIndexed() : source.geometry.clone()
        // Compose only the static path below this joint; animated ancestors are
        // deliberately absent so every normal and vertex follows the original rig.
        geometry.applyMatrix4(relativeMatrix(source, anchor))
        const count = geometry.getAttribute('position').count, colors = new Float32Array(count * 3)
        const color = (source.material as THREE.MeshLambertMaterial).color
        for (let i = 0; i < count; i++) { colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
        return geometry
      })
      const geometry = mergeGeometries(geometries, false)
      for (const part of geometries) part.dispose()
      if (!geometry) continue
      geometry.computeBoundingBox(); geometry.computeBoundingSphere()
      const first = sources[0], material = (first.material as THREE.MeshLambertMaterial).clone()
      material.color.copy(white); material.vertexColors = true
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = 'npc-rigid-color-batch'
      mesh.layers.mask = first.layers.mask
      mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow
      mesh.userData.noCastShadow = first.userData.noCastShadow
      mesh.matrixAutoUpdate = false
      anchor.add(mesh)
      const entries = sources.map(source => ({ mesh: source, mask: source.layers.mask }))
      // A joint can itself be a Mesh. Layers suppress only its own draw, while
      // its children, references and animation transforms remain intact.
      for (const source of sources) source.layers.mask = 0
      batches.push({ mesh, sources: entries })
    }
  }
  records.set(root, batches)
}

/** Same-scene verification can display the exact original geometry. */
export function setNpcBatchesEnabled(root: THREE.Object3D, enabled: boolean) {
  for (const batch of records.get(root) ?? []) {
    batch.mesh.visible = enabled
    for (const source of batch.sources) source.mesh.layers.mask = enabled ? 0 : source.mask
  }
}
