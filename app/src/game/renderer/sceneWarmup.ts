import * as THREE from 'three'
import { waitForSubmittedPrograms } from './programCompletion'

const pendingRoots = new WeakMap<THREE.Object3D, Set<Promise<void>>>()
const pendingRenderers = new WeakMap<THREE.WebGLRenderer, Set<Promise<void>>>()

// Three's async compiler polls material programs after compileAsync returns.
// Keep their materials alive when loading is cancelled during that polling.
export function afterSceneCompile(root: THREE.Object3D, dispose: () => void) {
  const pending = pendingRoots.get(root)
  if (pending?.size) void Promise.all([...pending]).then(dispose)
  else dispose()
}

export function afterRendererCompile(renderer: THREE.WebGLRenderer, dispose: () => void) {
  const pending = pendingRenderers.get(renderer)
  if (pending?.size) void Promise.all([...pending]).then(dispose)
  else dispose()
}

/** A read-only traversal view: compiling never reparents the live objects. */
class CompileView extends THREE.Object3D {
  private readonly objects: readonly THREE.Object3D[]
  constructor(objects: readonly THREE.Object3D[]) { super(); this.objects = objects }
  override traverse(callback: (object: THREE.Object3D) => void) {
    for (const object of this.objects) callback(object)
  }
  override traverseVisible(callback: (object: THREE.Object3D) => void) {
    this.traverse(callback)
  }
}

// compileAsync waits for the driver asynchronously, but its initial traversal
// and program preparation are synchronous. Limit that work too, and omit the
// hidden source meshes retained only for collision/animation after batching.
export function* compileSceneJob(
  renderer: THREE.WebGLRenderer, root: THREE.Object3D,
  camera: THREE.Camera, scene: THREE.Scene,
): Generator<void, void, unknown> {
  const objects: THREE.Object3D[] = []
  const lights: THREE.Object3D[] = []
  root.traverseVisible(object => {
    if ((object as THREE.Light).isLight && object.layers.test(camera.layers)) lights.push(object)
    const renderable = object as THREE.Mesh | THREE.Line | THREE.Points | THREE.Sprite
    if (renderable.material && object.layers.test(camera.layers)) objects.push(object)
  })
  let pending = 0
  const rootJobs = pendingRoots.get(root) ?? new Set<Promise<void>>()
  const rendererJobs = pendingRenderers.get(renderer) ?? new Set<Promise<void>>()
  pendingRoots.set(root, rootJobs); pendingRenderers.set(renderer, rendererJobs)
  for (let start = 0; start < objects.length; start += 8) {
    yield
    const view = new CompileView([...lights, ...objects.slice(start, start + 8)])
    pending++
    const compiled = renderer.compileAsync(view, camera, scene)
    const job = Promise.all([
      compiled.then(() => undefined, () => undefined),
      waitForSubmittedPrograms(renderer),
    ]).then(() => undefined).finally(() => {
      pending--; rootJobs.delete(job); rendererJobs.delete(job)
    })
    rootJobs.add(job); rendererJobs.add(job)
  }
  while (pending) yield
}

// Three has a public texture initializer, but geometry buffers and vertex-array
// bindings are initialized on first draw. Submit small batches with zero draw
// ranges to prepare the actual objects without drawing over the current frame.
export function* uploadSceneJob(
  renderer: THREE.WebGLRenderer, root: THREE.Object3D,
  camera: THREE.Camera, scene: THREE.Scene, inViewOnly = false,
  shadowLight: THREE.SpotLight | null = null,
): Generator<void, void, unknown> {
  const objects: (THREE.Mesh | THREE.Line | THREE.Points)[] = []
  const frustum = inViewOnly ? new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  ) : null
  let shadowFrustum: THREE.Frustum | null = null
  if (frustum && shadowLight?.castShadow) {
    // Build an isolated probe so warmup never dirties the real shadow camera/matrix.
    shadowLight.updateMatrixWorld(true)
    shadowLight.target.updateMatrixWorld(true)
    const probe = shadowLight.shadow.clone()
    probe.updateMatrices(shadowLight)
    shadowFrustum = probe.getFrustum()
  }
  const lights: THREE.Object3D[] = []
  const collectLight = (object: THREE.Object3D) => {
    if ((object as THREE.Light).isLight && object.layers.test(camera.layers)) lights.push(object)
  }
  scene.traverseVisible(collectLight)
  root.traverseVisible(object => {
    collectLight(object)
    const mesh = object as THREE.Mesh
    if (!mesh.geometry || !mesh.material || !object.layers.test(camera.layers)) return
    // Streaming while walking should not allocate every offscreen buffer in a
    // newly built chunk. Other views still use Three's normal on-demand upload.
    if (frustum && mesh.frustumCulled && !frustum.intersectsObject(mesh) &&
        !(mesh.castShadow && shadowFrustum?.intersectsObject(mesh))) return
    // Keep application render hooks exclusive to real frames. The static world
    // uses ordinary Mesh/InstancedMesh; hooked effects can upload on demand.
    if (object.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender ||
        object.onAfterRender !== THREE.Object3D.prototype.onAfterRender) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    if (materials.some(material => material.onBeforeRender !== THREE.Material.prototype.onBeforeRender)) return
    objects.push(mesh)
  })
  const view = new THREE.Scene()
  view.matrixWorldAutoUpdate = false
  for (let start = 0; start < objects.length; start += 8) {
    yield
    // These are read-only references, deliberately not Object3D.add(): parent
    // links and world transforms must remain owned by the world hierarchy.
    view.children = [...new Set(lights), ...objects.slice(start, start + 8)]
    view.fog = scene.fog
    view.environment = scene.environment
    view.environmentIntensity = scene.environmentIntensity
    view.environmentRotation.copy(scene.environmentRotation)
    const children = new Map<THREE.Object3D, THREE.Object3D[]>()
    const frustum = new Map<THREE.Object3D, boolean>()
    const ranges = new Map<THREE.BufferGeometry, number>()
    const autoClear = renderer.autoClear
    const shadowAuto = renderer.shadowMap.autoUpdate, shadowNeeds = renderer.shadowMap.needsUpdate
    const shadowStates = new Map<THREE.LightShadow, { auto: boolean; needs: boolean }>()
    try {
      for (const object of view.children) {
        children.set(object, object.children); object.children = []
        frustum.set(object, object.frustumCulled); object.frustumCulled = false
        const geometry = (object as THREE.Mesh).geometry
        if (geometry && !ranges.has(geometry)) { ranges.set(geometry, geometry.drawRange.count); geometry.drawRange.count = 0 }
      }
      renderer.autoClear = false
      // compileAsync covers surface programs, but Three creates depth programs
      // only in a shadow pass. Prepare the actual casters in the same zero-range
      // batches; never clear unrelated sunlight/point-light shadow maps.
      if (shadowLight && renderer.shadowMap.enabled) {
        for (const object of lights) {
          const light = object as THREE.SpotLight
          if (!light.shadow || shadowStates.has(light.shadow)) continue
          shadowStates.set(light.shadow, { auto: light.shadow.autoUpdate, needs: light.shadow.needsUpdate })
          light.shadow.autoUpdate = false
          light.shadow.needsUpdate = light === shadowLight
        }
        renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true
      } else {
        renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false
      }
      renderer.render(view, camera)
    } finally {
      renderer.autoClear = autoClear
      renderer.shadowMap.autoUpdate = shadowAuto; renderer.shadowMap.needsUpdate = shadowNeeds
      for (const [shadow, state] of shadowStates) {
        shadow.autoUpdate = state.auto
        // The warmup map contains no pixels. Refresh it on the next real lit
        // frame, including when a chunk is streamed between cadence updates.
        shadow.needsUpdate = shadow === shadowLight?.shadow || state.needs
      }
      for (const [geometry, count] of ranges) geometry.drawRange.count = count
      for (const [object, value] of children) object.children = value
      for (const [object, value] of frustum) object.frustumCulled = value
      view.children = []
    }
  }
}
