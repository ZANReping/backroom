// Separate development page: uses production factories, never loads player saves.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { ITEMS } from '../src/game/content/items'
import { REFINED_ITEM_ATLAS, REFINED_ITEM_TYPES } from '../src/game/renderer/refinedItemMesh'
import { buildItemMesh } from '../src/game/renderer/itemsMesh'
import { buildHeldItem, buildViewmodel } from '../src/game/renderer/viewmodel'
import { setMaterialMode } from '../src/game/renderer/shared'

const params = new URLSearchParams(location.search), baseline = params.has('baseline')
const mode = params.get('mode') === 'realistic' ? 'realistic' : 'classic'
setMaterialMode(mode)
const factory = baseline ? (await import('./refined-itemsMesh-baseline')).buildItemMesh : buildItemMesh
const heldFactory = baseline ? (await import('./refined-viewmodel-baseline')).buildHeldItem : buildHeldItem
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight - 88)
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping
document.body.append(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#1c2427')
const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .01, 30)
camera.position.z = 8
const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment(), environment = pmrem.fromScene(room, .04)
scene.environment = environment.texture; room.dispose(); pmrem.dispose()
const ambient = new THREE.HemisphereLight('#f5f0e1', '#596570', 1), key = new THREE.DirectionalLight('#fff1df', 2), rim = new THREE.DirectionalLight('#c4dce8', 1)
key.position.set(-2, 3, 4); rim.position.set(3, 1, -2); scene.add(ambient, key, rim)
const torch = new THREE.SpotLight('#fff3d7', 85, 20, 1.05, .75, 1)
torch.position.set(0, 1, 5); torch.visible = false; scene.add(torch, torch.target)
let models: THREE.Group[] = [], types = [...REFINED_ITEM_TYPES], held = false, angle = 0
const render = () => renderer.render(scene, camera)
function dispose(root: THREE.Object3D) {
  const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>()
  root.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) geos.add(m.geometry); if (m.material) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mat) })
  geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); root.removeFromParent()
}
function clear() { models.forEach(dispose); models = []; document.querySelector('#labels')!.innerHTML = '' }
function fit(cols: number, rows: number) {
  const aspect = innerWidth / (innerHeight - 88), halfHeight = Math.max(rows / 2, cols / 2 / aspect)
  camera.top = halfHeight; camera.bottom = -halfHeight; camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect; camera.updateProjectionMatrix()
}
function gallery(atlas = 'all', holding = false) {
  clear(); held = holding; angle = 0
  types = REFINED_ITEM_TYPES.filter(type => atlas === 'all' || REFINED_ITEM_ATLAS[type] === atlas)
  const cols = atlas === 'all' ? 8 : 4, rows = Math.ceil(types.length / cols)
  fit(cols, rows)
  // Cells follow the camera's physical area, including the extra horizontal margins.
  const labels = document.querySelector('#labels') as HTMLElement
  labels.style.gridTemplateColumns = `repeat(${cols},1fr)`; labels.style.gridTemplateRows = `repeat(${rows},1fr)`
  for (const [i, type] of types.entries()) {
    const root = new THREE.Group(), pose = new THREE.Group()
    let model = held ? heldFactory(type) : factory(type, { halo: false })
    if (held) {
      const hand = new THREE.Group(), flash = new THREE.Group(), dummy = new THREE.Camera()
      buildViewmodel(hand, flash, dummy); dispose(flash); hand.removeFromParent(); hand.position.set(0, 0, 0); hand.add(model); model = hand
    }
    const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3())
    model.position.sub(center); pose.add(model); root.add(pose); root.userData.pose = pose
    root.scale.setScalar(.56 / Math.max(size.x, size.y, size.z)); pose.rotation.set(.45, -.4, 0)
    root.position.set(camera.left + (i % cols + .5) * (camera.right - camera.left) / cols, camera.top - (Math.floor(i / cols) + .38) * (camera.top - camera.bottom) / rows, 0)
    scene.add(root); models.push(root)
    const label = document.createElement('div'); label.className = 'label'
    label.textContent = ITEMS[type]?.name ?? type
    const id = document.createElement('small'); id.textContent = type; label.append(id); labels.append(label)
  }
  document.querySelector('#title')!.textContent = `${baseline ? '导入前' : '重制物品'} · ${mode} · ${atlas} · ${held ? '手持' : '模型'}`
  render()
  document.querySelector('#status')!.textContent = `${renderer.info.render.calls} draws / ${renderer.info.render.triangles} triangles`
}
function dark(enabled: boolean) { ambient.intensity = enabled ? .015 : 1; key.visible = rim.visible = !enabled; torch.visible = enabled; scene.environmentIntensity = enabled ? .01 : 1; render() }
function rotate(value: number) { angle = value; models.forEach(g => (g.userData.pose as THREE.Group).rotation.y = -.4 + angle); render() }
const tick = () => new Promise<number>(resolve => requestAnimationFrame(resolve))
const percentile = (a: number[], q: number) => a.length ? [...a].sort((a, b) => a - b)[Math.floor((a.length - 1) * q)] : null
async function warm() { await renderer.compileAsync(scene, camera); for (let n = 0; n < 5; n++) { await tick(); render() } }
function textures() {
  const maps = new Map<string, unknown>()
  for (const root of models) root.traverse(o => { if (o instanceof THREE.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) for (const key of ['map', 'normalMap', 'roughnessMap']) {
    const texture = (m as any)[key] as THREE.Texture | undefined
    if (texture) maps.set(texture.uuid, { width: texture.image?.width, height: texture.image?.height, colorSpace: texture.colorSpace, key })
  } })
  return [...maps.values()]
}
async function lifecycle() { const rows = []; for (let i = 0; i < 8; i++) { gallery(); await warm(); rows.push({ ...renderer.info.memory, programs: renderer.info.programs?.length }) } return rows }
async function bench(count = 550) {
  clear(); dark(false)
  const cols = 22, rows = Math.ceil(count / cols); fit(cols, rows)
  const started = performance.now()
  for (let i = 0; i < count; i++) { const g = factory(REFINED_ITEM_TYPES[i % 55], { halo: false }); g.position.set(i % cols - (cols - 1) / 2, (rows - 1) / 2 - Math.floor(i / cols), 0); g.scale.setScalar(2); g.rotation.x = .4; scene.add(g); models.push(g) }
  const buildMs = performance.now() - started
  await warm()
  const gl = renderer.getContext() as WebGL2RenderingContext, timer = gl.getExtension('EXT_disjoint_timer_query_webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info'), result = []
  for (let round = 0; round < 5; round++) {
    for (let n = 0; n < 30; n++) { await tick(); render() }
    const frame: number[] = [], cpu: number[] = [], gpu: number[] = [], queries: WebGLQuery[] = []
    let previous = await tick()
    for (let n = 0; n < 120; n++) {
      const now = await tick(); frame.push(now - previous); previous = now
      while (timer && queries.length && gl.getQueryParameter(queries[0], gl.QUERY_RESULT_AVAILABLE)) { const q = queries.shift()!; if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q) }
      const query = timer && queries.length < 8 ? gl.createQuery() : null
      if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query)
      const start = performance.now(); render(); cpu.push(performance.now() - start)
      if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); queries.push(query) }
    }
    queries.forEach(q => gl.deleteQuery(q))
    result.push({ round, frameMedian: percentile(frame, .5), frameP95: percentile(frame, .95), cpuMedian: percentile(cpu, .5), cpuP95: percentile(cpu, .95), gpuMedian: percentile(gpu, .5), gpuP95: percentile(gpu, .95), gpuSamples: gpu.length, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, memory: { ...renderer.info.memory } })
  }
  return { mode, baseline, count, buildMs, viewport: [innerWidth, innerHeight - 88], renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), rounds: result }
}
document.querySelector('#back')!.addEventListener('click', () => rotate(angle + Math.PI))
document.querySelector('#dark')!.addEventListener('click', () => dark(!torch.visible))
gallery(params.get('atlas') ?? 'all', params.has('held'))
await Promise.all(['tools', 'gear', 'food', 'paper'].flatMap(a => ['color', 'normal', ...(mode === 'realistic' ? ['roughness'] : [])].map(async name => { const i = new Image(); i.src = `/textures/items-refined/${a}/${name}.png`; await i.decode() })))
await new Promise(r => setTimeout(r, 300)); await warm()
document.querySelector('#status')!.textContent = `${renderer.info.render.calls} draws / ${renderer.info.render.triangles} triangles`
;(window as any).__refined = { ready: true, renderer, scene, camera, gallery, rotate, dark, render, warm, textures, lifecycle, bench }
