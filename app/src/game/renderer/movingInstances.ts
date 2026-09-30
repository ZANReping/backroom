import * as THREE from 'three'
import { materialBatchKey } from './materialBatch'

type Binding = { mesh: THREE.InstancedMesh; sources: THREE.Mesh[] }
const bindings = new WeakMap<THREE.Object3D, Binding[]>()
const inverse = new THREE.Matrix4(), local = new THREE.Matrix4()

/** Batch repeated rigid moving parts; the original objects remain exact proxies. */
export function instanceMovingParts(root: THREE.Object3D, geometryKey: (geometry: THREE.BufferGeometry) => string) {
  if (bindings.has(root)) return
  const buckets = new Map<string, THREE.Mesh[]>()
  const keys = new Map<THREE.Material, string>()
  root.traverseVisible(node => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh
      || Array.isArray(mesh.material) || mesh.renderOrder !== 0 || Object.keys(mesh.geometry.morphAttributes).length) return
    let moving = false
    for (let parent: THREE.Object3D | null = mesh; parent && parent !== root; parent = parent.parent) {
      if (parent.userData.noCollision) return
      if (parent.userData.lid) moving = true
    }
    if (!moving || mesh.material.transparent || mesh.material.opacity < 1) return
    let materialKey = keys.get(mesh.material)
    if (materialKey === undefined) { materialKey = materialBatchKey(mesh.material); keys.set(mesh.material, materialKey) }
    const key = `${materialKey}|${geometryKey(mesh.geometry)}|${mesh.userData.noCastShadow ? 1 : 0}`
    const bucket = buckets.get(key) ?? []
    bucket.push(mesh); buckets.set(key, bucket)
  })
  const group = new THREE.Group(), records: Binding[] = []
  group.name = 'moving-part-instances'
  group.userData.noCollision = true
  for (const sources of buckets.values()) {
    if (sources.length < 4) continue
    const first = sources[0]
    const mesh = new THREE.InstancedMesh(first.geometry.clone(), first.material, sources.length)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.userData.noCastShadow = first.userData.noCastShadow
    mesh.raycast = () => undefined
    group.add(mesh); records.push({mesh, sources})
  }
  if (!records.length) return
  root.add(group); bindings.set(root, records)
  updateMovingInstances(root)
  for (const {sources} of records) for (const source of sources) {
    source.visible = false
    source.userData.colliderProxy = true
  }
}

/** Called only after a container pose changes; idle instances require no uploads. */
export function updateMovingInstances(root: THREE.Object3D) {
  const records = bindings.get(root)
  if (!records) return
  root.updateWorldMatrix(true, true)
  inverse.copy(root.matrixWorld).invert()
  for (const {mesh, sources} of records) {
    for (let i = 0; i < sources.length; i++) mesh.setMatrixAt(i, local.multiplyMatrices(inverse, sources[i].matrixWorld))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
  }
}
