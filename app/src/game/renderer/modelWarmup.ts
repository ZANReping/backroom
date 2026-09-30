import * as THREE from 'three'
import { compileSceneJob } from './sceneWarmup'

/** Prepare new ground models before their first visible draw, one small step per frame. */
export class ModelWarmupQueue {
  private jobs = new Map<THREE.Object3D, Generator<void, void, unknown>>()

  enqueue(root: THREE.Object3D, renderer: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene) {
    if (!this.jobs.has(root)) this.jobs.set(root, compileSceneJob(renderer, root, camera, scene))
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
