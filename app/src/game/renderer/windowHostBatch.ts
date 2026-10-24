import * as THREE from 'three'
import { geometryDataKey } from './staticBatch'
import { materialBatchKey } from './materialBatch'
import { cloneRenderGeometry } from './renderGeometry'

type Binding = { mesh: THREE.InstancedMesh; index: number; matrix: THREE.Matrix4; closed: boolean }
const collapsed = new THREE.Matrix4(), zero = new THREE.Vector3(0, 0, 0)

/** Facade windows retain individual lifecycle controls while sharing GPU submissions. */
export function setWindowHostGone(root: THREE.Object3D, gone: boolean): void {
  const open = root.userData.windowOpen as THREE.Object3D | undefined
  if (!open) return
  open.visible = !gone
  const wall = root.userData.windowClosed as THREE.Object3D | undefined
  if (wall) wall.visible = gone
  const bindings = root.userData.windowBindings as Binding[] | undefined
  if (!bindings || root.userData.windowBatchGone === gone) return
  for (const b of bindings) {
    const show = b.closed === gone
    collapsed.copy(b.matrix).scale(zero)
    b.mesh.setMatrixAt(b.index, show ? b.matrix : collapsed)
    b.mesh.instanceMatrix.needsUpdate = true
  }
  root.userData.windowBatchGone = gone
}

/** Bounded per-chunk batches; hidden closed walls are prepared once, with no rebuild on expiry. */
export function* batchWindowHostsJob(target: THREE.Group, roots: THREE.Object3D[]): Generator<void, void, unknown> {
  type Part = { root: THREE.Object3D; source: THREE.Mesh; matrix: THREE.Matrix4; closed: boolean }
  const buckets = new Map<string, Part[]>()
  for (const root of roots) {
    root.updateWorldMatrix(true, true)
    root.userData.windowBindings = [] as Binding[]
    for (const closed of [false, true]) {
      const branch = root.userData[closed ? 'windowClosed' : 'windowOpen'] as THREE.Object3D | undefined
      branch?.traverse(o => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh || Array.isArray(mesh.material)) return
        const key = `${materialBatchKey(mesh.material)}|${geometryDataKey(mesh.geometry)}|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.renderOrder}`
        const parts = buckets.get(key) ?? []
        parts.push({ root, source: mesh, matrix: mesh.matrixWorld.clone(), closed }); buckets.set(key, parts)
      })
    }
    yield
  }
  for (const parts of buckets.values()) {
    const src = parts[0].source
    src.geometry.computeBoundingBox(); const size=src.geometry.boundingBox!.getSize(new THREE.Vector3())
    const tiny=Math.max(size.x,size.y,size.z)<.45||size.y<.18
    const mesh = new THREE.InstancedMesh(cloneRenderGeometry(src.geometry), src.material as THREE.Material, parts.length)
    mesh.name = 'window-host-instances'; mesh.castShadow = src.castShadow&&!tiny; mesh.userData.noCastShadow=!!src.userData.noCastShadow||tiny; mesh.receiveShadow = src.receiveShadow; mesh.renderOrder = src.renderOrder
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    parts.forEach((p, index) => {
      mesh.setMatrixAt(index, p.matrix)
      ;(p.root.userData.windowBindings as Binding[]).push({ mesh, index, matrix: p.matrix, closed: p.closed })
    })
    // Bounds include both states before hiding anything, so activating a closed wall never changes culling.
    mesh.computeBoundingBox(); mesh.computeBoundingSphere(); target.add(mesh)
    yield
  }
  for (const root of roots) {
    root.userData.colliderProxy = true; root.visible = false
    const gone = !(root.userData.windowOpen as THREE.Object3D).visible
    root.userData.windowBatchGone = undefined
    setWindowHostGone(root, gone)
  }
}
