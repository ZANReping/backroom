// [ferren] Ferren（Entity 92）重制·阶段 1 建模预览：proto-ferren.html?view=front|side|three|top|head|nest|ref|neck|neckside
// 阶段 2 动画网格：proto-ferren.html?anim=1&clip=idle|walk|…&frames=16&cols=4[&view=q|side|front|top|nest][&gif=1]（逐格渲染同一只雪貂的不同时刻）
// 截图由 scripts/verify-ferren.mjs 驱动（无头 Chromium，端口 3494）。
import * as THREE from 'three'
import { buildFerrenMesh, buildFerrenNestMesh } from '../game/renderer/ferrenMesh'
import { animateFerren, FERREN_CLIPS, type FerrenClip } from '../game/renderer/ferrenAnim'
import { setMaterialMode } from '../game/renderer/shared'
const q = new URLSearchParams(location.search)
const view = q.get('view') ?? 'three'
if (q.get('real') === '1') setMaterialMode('realistic') // 默认 classic（游戏默认 Lambert 材质）
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#d6c8a8')
const cam = new THREE.PerspectiveCamera(30, W / H, 0.005, 40)
const lab = document.getElementById('lab')!
const info: any = {}
const count = (g: THREE.Object3D) => { let c = 0, t = 0; g.traverse((m: any) => { if ((m.isMesh || m.isLineSegments) && m.visible !== false) { c++; if (m.isMesh) t += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 } }); return { meshes: c, tris: Math.round(t) } }
// 米色绒布地面 + 背景（接近参考图的拍摄环境）
const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: '#cbbd9c', roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor)
const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), new THREE.MeshStandardMaterial({ color: '#b8aa8a', roughness: 1 })); wall.position.set(0, 2, -1.6); void wall
scene.add(new THREE.HemisphereLight('#fbf4e6', '#8a7c62', 1.9))
const key = new THREE.DirectionalLight('#fff4e2', 2.0); key.position.set(1.2, 2.4, 2.0); key.castShadow = true; key.shadow.mapSize.set(2048, 2048)
Object.assign(key.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 0.1, far: 8 }); key.shadow.bias = -0.0004; scene.add(key)
const fill = new THREE.DirectionalLight('#dfe6ff', 0.6); fill.position.set(-2, 1.2, -0.5); scene.add(fill)
const label = (html: string) => lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:10px">${html}</div>`)
const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
let subject: THREE.Object3D
// 实体约定正面 +X（buildFerrenMesh 外层已转好）；预览机位按建模 +Z 设计，所以这里整只转回 -π/2
const ferret = () => { const f = buildFerrenMesh(); f.rotation.y = -Math.PI / 2; return f }
if (q.has('anim')) {
  const clip = (q.get('clip') ?? 'idle') as FerrenClip
  const C = FERREN_CLIPS[clip]
  const f = ferret(); scene.add(f); subject = f
  const sleepy = clip === 'sleep'
  let nestY = 0
  if (sleepy || q.get('nest') === '1') { const n = buildFerrenNestMesh(); scene.add(n); nestY = (n.userData.nest as { bedY: number }).bedY; f.position.y = nestY }
  if (clip === 'eat') { const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.035, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#9fb4c4', roughness: 0.4, side: THREE.DoubleSide })); bowl.position.set(0, 0.0175, 0.3); scene.add(bowl); const kib = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.004, 20), new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.9 })); kib.position.set(0, 0.022, 0.3); scene.add(kib) }
  if (clip === 'pet') { const hand = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({ color: '#d7a98c', roughness: 0.6 })); hand.scale.set(0.05, 0.022, 0.08); hand.rotation.x = -0.25; hand.position.set(0, 0.29, 0.2); hand.castShadow = true; scene.add(hand); ;(window as any).__hand = hand }
  const frames = Number(q.get('frames') ?? 16), cols = Number(q.get('cols') ?? 4)
  const rows = Math.ceil(frames / cols)
  const tw = Math.floor(W / cols), th = Math.floor((H - 30) / rows)
  const tcam = new THREE.PerspectiveCamera(30, tw / th, 0.01, 30)
  const v = q.get('view') ?? ({ sleep: 'nest', wardance: 'q', roll: 'q2', stand: 'qHigh', pet: 'q', eat: 'q', sniff: 'q', noclip: 'q' } as Record<string, string>)[clip] ?? 'side'
  const VIEW: Record<string, [number[], number[]]> = {
    side: [[1.55, 0.26, 0.04], [0, 0.13, 0.04]],
    q: [[1.05, 0.5, 1.05], [0, 0.13, 0.02]],
    q2: [[0.9, 0.55, 1.2], [0, 0.1, 0]],
    qHigh: [[1.25, 0.55, 1.2], [0, 0.22, -0.05]],
    front: [[0.45, 0.42, 1.45], [0, 0.14, 0]],
    top: [[0.001, 1.6, 0.02], [0, 0, 0.02]],
    nest: [[0.62, 0.78, 0.68], [0, 0.07, 0]],
    nestTop: [[0.001, 1.25, 0.02], [0, 0, 0]],
    nestClose: [[0.34, 0.45, 0.4], [0, 0.07, 0]],
    nestClose2: [[-0.42, 0.42, -0.3], [0, 0.07, 0]],
  }
  const [cp, cl] = VIEW[v] ?? VIEW.side
  tcam.position.set(cp[0], cp[1], cp[2]); tcam.lookAt(cl[0], cl[1], cl[2])
  renderer.setScissorTest(true); renderer.autoClear = false
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:5px"><span class="s">Ferren · ${C.zh} · ${clip} · ${C.dur}s · ${frames} 帧</span></div>`)
  info.clip = clip
  const draw = () => {
    renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H); renderer.setClearColor('#111'); renderer.clear()
    for (let i = 0; i < frames; i++) {
      const t = C.loop ? (i / frames) * C.dur : (i / (frames - 1)) * C.dur
      animateFerren(f, clip, t)
      const hand = (window as any).__hand as THREE.Object3D | undefined
      if (hand) { const s = Math.sin((t / C.dur) * Math.PI * 2); hand.position.set(-s * 0.035, 0.29 + Math.abs(s) * 0.006, 0.2 - Math.abs(s) * 0.01) } // 手跟着头左右抚摸（预览道具；模型空间 x 与世界 x 反向）
      const c = i % cols, r = Math.floor(i / cols)
      const x = c * tw, y = H - 30 - (r + 1) * th
      renderer.setViewport(x, y, tw, th); renderer.setScissor(x, y, tw, th); renderer.render(scene, tcam)
    }
  }
  const t1 = performance.now(); const l2 = () => { draw(); if (performance.now() - t1 < 2500) requestAnimationFrame(l2); else (window as any).__ready = true }; l2()
} else if (view === 'nest') {
  const nest = buildFerrenNestMesh(); scene.add(nest); subject = nest
  info.nest = count(nest)
  if (q.get('back') === '1') { cam.position.set(-0.5, 0.5, -0.8) } else cam.position.set(0.6, 0.62, 0.85)
  cam.lookAt(0, 0.05, -0.02)
  if (q.get('ferret') === '1') { const f = ferret(); f.scale.setScalar(0.85); f.position.set(0.02, 0.04, 0.0); f.rotation.y = 2.2; scene.add(f) }
  label(`雪貂窝 + 小被子<br><span class="s">${info.nest.meshes} 网格 · ${info.nest.tris} 三角形</span>`)
} else {
  const f = ferret(); scene.add(f); subject = f
  info.ferren = count(f)
  if (q.get('nest') === '1') { const n = buildFerrenNestMesh(); n.position.set(-0.55, 0, -0.3); scene.add(n) }
  const CAM: Record<string, [THREE.Vector3, THREE.Vector3, string]> = {
    front: [at(0, 0.2, 1.25), at(0, 0.15, 0), '正面'],
    side: [at(1.45, 0.2, 0.05), at(0, 0.14, 0.05), '侧面（头朝左）'],
    three: [at(0.95, 0.42, 0.95), at(0, 0.13, 0.03), '3/4'],
    top: [at(0.001, 1.95, -0.06), at(0, 0, -0.06), '俯视'],
    head: [at(0.16, 0.26, 0.75), at(0, 0.2, 0.25), '头部特写'],
    ref: [at(-1.1, 0.32, 0.75), at(0, 0.14, 0.04), '对照参考图角度'],
    back: [at(-0.6, 0.35, -1.1), at(0, 0.14, -0.05), '背后'],
    neck: [at(0.42, 0.3, 0.5), at(0, 0.15, 0.1), '颈肩特写'],
    neckside: [at(0.6, 0.2, 0.12), at(0, 0.16, 0.12), '颈肩侧面'],
  }
  const [p, l, zh] = CAM[view] ?? CAM.three
  cam.position.copy(p); cam.lookAt(l)
  if (view === 'head') cam.fov = 24
  if (view === 'ref') { f.rotation.y = -Math.PI - 0.35; const hd = f.userData.ferren.head as THREE.Object3D; hd.rotation.y = 0.55 }
  cam.updateProjectionMatrix()
  label(`Ferren（Entity 92）· ${zh}<br><span class="s">${info.ferren.meshes} 网格 · ${info.ferren.tris} 三角形</span>`)
  // 尺寸（世界包围盒，不含胡须）
  const bb = new THREE.Box3(); f.updateMatrixWorld(true); f.traverse((m: any) => { if (m.isMesh) bb.expandByObject(m) })
  info.bbox = { x: +(bb.max.x - bb.min.x).toFixed(3), y: +(bb.max.y - bb.min.y).toFixed(3), z: +(bb.max.z - bb.min.z).toFixed(3), zmin: +bb.min.z.toFixed(3), zmax: +bb.max.z.toFixed(3), ymin: +bb.min.y.toFixed(3) }
  info.parts = Object.keys(f.userData.parts)
}
const vec = (s: string | null) => s ? new THREE.Vector3(...s.split(',').map(Number) as [number, number, number]) : null
const c = vec(q.get('cam')), lk = vec(q.get('look')); if (c) cam.position.copy(c); if (lk || c) cam.lookAt(lk ?? new THREE.Vector3(0, 0.14, 0))
void subject
;(window as any).__info = info
const t0 = performance.now(); const loop = () => { if (q.has('anim')) return; renderer.render(scene, cam); if (performance.now() - t0 < 1500) requestAnimationFrame(loop); else (window as any).__ready = true }; loop()
