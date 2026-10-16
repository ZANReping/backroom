import * as THREE from 'three'
import { compileSceneJob, uploadSceneJob, type WarmupTarget } from './sceneWarmup'

/** Factories/instances retain texture ownership; preparation only uploads them. */
function* prepareModel(renderer: THREE.WebGLRenderer, root: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene, target?: WarmupTarget) {
  yield* compileSceneJob(renderer, root, camera, scene, target)
  const textures = new Set<THREE.Texture>()
  root.traverse(object => {
    const material = (object as THREE.Mesh).material
    for (const mat of Array.isArray(material) ? material : material ? [material] : []) {
      const values = [...Object.values(mat), ...Object.values((mat as THREE.ShaderMaterial).uniforms ?? {}).map(u => u.value)]
      for (const value of values) if (value?.isTexture && !value.isRenderTargetTexture) textures.add(value)
    }
  })
  for (const texture of textures) { yield; renderer.initTexture(texture) }
  root.updateWorldMatrix(true, true)
  yield* uploadSceneJob(renderer, root, camera, scene, false, null, typeof target === 'function' ? target() : target)
}

/** Prepare new ground models before their first visible draw, one small step per frame. */
export class ModelWarmupQueue {
  private jobs = new Map<THREE.Object3D, Generator<void, void, unknown>>()

  enqueue(root: THREE.Object3D, renderer: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene, renderTarget?: WarmupTarget, upload = false) {
    if (!this.jobs.has(root)) this.jobs.set(root, upload ? prepareModel(renderer, root, camera, scene, renderTarget) : compileSceneJob(renderer, root, camera, scene, renderTarget))
  }

  ready(root: THREE.Object3D) { return !this.jobs.has(root) }

  advance() {
    const first = this.jobs.entries().next().value
    if (!first) return
    const [root, job] = first, visible = root.visible
    // The model stays hidden during preparation. Only the synchronous traversal
    // needs its root visible; preserve hidden collision proxies below it.
    root.visible = true
    try {
      const step = job.next()
      this.jobs.delete(root)
      // Round-robin polling lets other models prepare while a driver is busy.
      if (!step.done) this.jobs.set(root, job)
    } finally { root.visible = visible }
  }

  cancel(root: THREE.Object3D) {
    this.jobs.get(root)?.return()
    this.jobs.delete(root)
    // In-flight compiler promises remain owned by sceneWarmup. Callers must
    // use afterSceneCompile before disposing this model's materials.
  }
}
