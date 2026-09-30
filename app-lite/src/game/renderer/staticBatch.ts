import * as THREE from 'three'
import { materialBatchKey } from './materialBatch'
import { cloneRenderGeometry } from './renderGeometry'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

type StaticMeshPart = {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  matrix: THREE.Matrix4
  noCastShadow: boolean
  renderOrder: number
}

const geometryLayoutKey = (geo: THREE.BufferGeometry, includeCounts = false) => {
  const attrs = Object.keys(geo.attributes).sort().map((name) => {
    const a = geo.getAttribute(name)
    return `${name}:${a.itemSize}:${a.normalized ? 1 : 0}:${includeCounts ? a.count : ''}:${a.array.constructor.name}`
  }).join(',')
  return `${geo.index ? `i:${geo.index.array.constructor.name}` : 'n'}|${attrs}`
}

// 实例化必须确认几何数据本身一致，不能只比较 BoxGeometry 参数：L9 窗口/墙板会把
// 世界空间纹理相位直接写进 UV，相同尺寸也可能不是同一份几何。
export const geometryDataKey = (geo: THREE.BufferGeometry) => {
  let h = 0x811c9dc5
  const feed = (v: number) => { h = Math.imul(h ^ (Math.round(v * 100000) | 0), 0x01000193) }
  if (geo.index) {
    const index = geo.index.array as unknown as ArrayLike<number>
    for (let i = 0; i < index.length; i++) feed(Number(index[i]))
  }
  for (const name of Object.keys(geo.attributes).sort()) {
    for (let i = 0; i < name.length; i++) feed(name.charCodeAt(i))
    const a = geo.getAttribute(name).array as unknown as ArrayLike<number>
    for (let i = 0; i < a.length; i++) feed(Number(a[i]))
  }
  return `${geo.type}|${geometryLayoutKey(geo, true)}|${h >>> 0}`
}

/**
 * 把一批不可交互的静态结构压缩为少量渲染对象：同几何+同材质出现 4 次以上时使用
 * InstancedMesh，其余按材质合并 BufferGeometry。透明件保持独立，以免破坏透明排序。
 */
export function batchL9StaticRoots(target: THREE.Group, roots: THREE.Object3D[]) {
  const job = batchStaticRootsJob(target, roots)
  while (!job.next().done) { /* Small synchronous callers still receive a complete batch. */ }
}

export function* batchStaticRootsJob(target: THREE.Group, roots: THREE.Object3D[]): Generator<void, void, unknown> {
  const parts: StaticMeshPart[] = []
  const staged: THREE.Object3D[] = []
  const owned = new Set<THREE.BufferGeometry>()
  const instances = new Set<THREE.InstancedMesh>()
  const clone = (geometry: THREE.BufferGeometry) => {
    const result = cloneRenderGeometry(geometry)
    owned.add(result)
    return result
  }
  const materialKeys = new Map<THREE.Material, string>()
  const materialKey = (mat: THREE.Material) => {
    let key = materialKeys.get(mat)
    if (key === undefined) { key = materialBatchKey(mat); materialKeys.set(mat, key) }
    return key
  }
  try {
  for (const root of roots) {
    yield
    let flattenable = true
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if ((o as THREE.InstancedMesh).isInstancedMesh || (o as THREE.Line).isLine || (o as THREE.Points).isPoints
        || (mesh.isMesh && Array.isArray(mesh.material))) flattenable = false
    })
    // 复杂渲染对象宁可保留原组，也不能为了合批丢失已有实例矩阵、线段或多材质分组。
    // Do not reparent borrowed fallback roots until the whole batch is ready.
    if (!flattenable) { staged.push(root); continue }
    root.updateWorldMatrix(true, true)
    const meshes: THREE.Mesh[] = []
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || !mesh.visible || !mesh.geometry || Array.isArray(mesh.material)) return
      meshes.push(mesh)
    })
    for (const mesh of meshes) {
      yield
      const mat = mesh.material as THREE.Material
      const part: StaticMeshPart = {
        geometry: mesh.geometry,
        material: mat,
        matrix: mesh.matrixWorld.clone(),
        noCastShadow: !!mesh.userData.noCastShadow,
        renderOrder: mesh.renderOrder,
      }
      // 透明玻璃/屏幕逐件保留，确保房屋窗户从远近角度观察时仍正确排序。
      if (mat.transparent || mat.opacity < 1 || mesh.renderOrder !== 0 || Object.keys(mesh.geometry.morphAttributes).length > 0) {
        const baked = clone(mesh.geometry).applyMatrix4(part.matrix)
        const individual = new THREE.Mesh(baked, mat)
        individual.renderOrder = mesh.renderOrder
        individual.userData = { ...mesh.userData }
        staged.push(individual)
      } else parts.push(part)
    }
  }

  const exact = new Map<string, StaticMeshPart[]>()
  for (const part of parts) {
    yield
    const key = `${materialKey(part.material)}|${geometryDataKey(part.geometry)}|${part.noCastShadow ? 1 : 0}`
    const bucket = exact.get(key)
    if (bucket) bucket.push(part); else exact.set(key, [part])
  }
  const instanced = new Set<StaticMeshPart>()
  for (const bucket of exact.values()) {
    if (bucket.length < 4) continue
    yield
    const mesh = new THREE.InstancedMesh(clone(bucket[0].geometry), bucket[0].material, bucket.length)
    instances.add(mesh)
    for (let i = 0; i < bucket.length; i++) {
      if (i > 0 && i % 32 === 0) yield
      mesh.setMatrixAt(i, bucket[i].matrix); instanced.add(bucket[i])
    }
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    mesh.instanceMatrix.needsUpdate = true
    mesh.userData.noCastShadow = bucket[0].noCastShadow
    mesh.name = 'l9-static-instanced'
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
    staged.push(mesh)
  }

  const mergeBuckets = new Map<string, StaticMeshPart[]>()
  for (const part of parts) {
    if (instanced.has(part)) continue
    yield
    const key = `${materialKey(part.material)}|${geometryLayoutKey(part.geometry)}|${part.noCastShadow ? 1 : 0}`
    const bucket = mergeBuckets.get(key)
    if (bucket) bucket.push(part); else mergeBuckets.set(key, [part])
  }
  for (const bucket of mergeBuckets.values()) {
    const geos: THREE.BufferGeometry[] = []
    for (const part of bucket) {
      yield
      geos.push(clone(part.geometry).applyMatrix4(part.matrix))
    }
    yield
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)
    if (merged) owned.add(merged)
    if (!merged) {
      for (let i = 0; i < bucket.length; i++) {
        const mesh = new THREE.Mesh(geos[i], bucket[i].material)
        mesh.userData.noCastShadow = bucket[i].noCastShadow
        staged.push(mesh)
      }
      continue
    }
    merged.computeBoundingBox()
    merged.computeBoundingSphere()
    if(geos.length>1)for(const geo of geos){geo.dispose();owned.delete(geo)}
    const mesh = new THREE.Mesh(merged, bucket[0].material)
    mesh.userData.noCastShadow = bucket[0].noCastShadow
    mesh.name = 'l9-static-merged'
    staged.push(mesh)
  }
  for (const object of staged) target.add(object)
  owned.clear(); instances.clear()
  } finally {
    for (const mesh of instances) mesh.dispose()
    for (const geometry of owned) geometry.dispose()
  }
}


