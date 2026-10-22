// 小小第 2 阶段动画预览：?anim=1&clip=名字&frames=N&cols=4&view=side|three|front
// 一张画布按网格画出片段的 N 个等间隔帧（同一只实体逐帧摆姿势，用 scissor 分格渲染），供截图拼 GIF。
import * as THREE from 'three'
import { buildTinyMesh } from '../game/renderer/tinyMesh'
import { animateTiny, sampleTiny, TINY_CLIPS } from '../game/renderer/tinyAnim'
const q = new URLSearchParams(location.search)
const clip = q.get('clip') ?? 'cruise', N = Number(q.get('frames') ?? 8), cols = Number(q.get('cols') ?? 4), view = q.get('view') ?? 'side'
const W = innerWidth, H = innerHeight, rows = Math.ceil(N / cols), cw = Math.floor(W / cols), ch = Math.floor((H - 30) / rows)
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
// L7 暮色带的冷蓝水色（预览提亮），远处一层沙质海床
const scene = new THREE.Scene(); scene.background = new THREE.Color('#14263a'); scene.fog = new THREE.Fog(scene.background as THREE.Color, 8, 30)
const fl = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: '#4d5a5c' })); fl.rotation.x = -Math.PI / 2; fl.position.y = clip === 'perch' ? -3 : -1.2; scene.add(fl)
scene.add(new THREE.HemisphereLight('#d6e8f4', '#2a3a44', 1.7)); const sun = new THREE.DirectionalLight('#eaf4ff', 1.9); sun.position.set(3, 6, 4); scene.add(sun)
const g = buildTinyMesh(); scene.add(g)
if (clip === 'perch') {
  // 「小小的谎言」那扇门的门沿：一块横着的岩石门楣，小小蹲在上面
  animateTiny(g, sampleTiny('perch', 0)); g.updateMatrixWorld(true)
  const box = new THREE.Box3(); for (const k of ['kneeL', 'kneeR', 'legL', 'legR']) box.expandByObject(g.userData.parts[k])
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 0.9), new THREE.MeshLambertMaterial({ color: '#5b5850' }))
  lintel.position.set(0.15, box.min.y - 0.175, 0); scene.add(lintel)
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.0, 1.1), new THREE.MeshLambertMaterial({ color: '#3a2f25' }))
  door.position.set(0.75, box.min.y - 0.35 - 1.0, 0); scene.add(door)
}
const cam = new THREE.PerspectiveCamera(34, cw / ch, 0.05, 80)
const cy0 = clip === 'perch' ? 0.6 : clip === 'recoil' ? 1.4 : 1.15
if (view === 'side') { cam.position.set(0.25, cy0 + 0.15, 4.9); cam.lookAt(0.25, cy0, 0) }
else if (view === 'near') { cam.position.set(1.0, cy0 + 1.0, 2.0); cam.lookAt(0.2, cy0 + 0.75, 0) }
else if (view === 'nearb') { cam.position.set(-0.6, cy0 + 1.1, -2.0); cam.lookAt(0.2, cy0 + 0.75, 0) }
else if (view === 'head-on') { cam.position.set(4.2, cy0 + 0.3, 0.001); cam.lookAt(0, cy0, 0) }
else if (view === 'back') { cam.position.set(-3.2, cy0 + 1.6, 2.2); cam.lookAt(0.2, cy0, 0) }
else if (view === 'front') { cam.position.set(3.6, cy0 + 0.4, 2.0); cam.lookAt(0.3, cy0, 0) }
else { cam.position.set(2.3, cy0 + 0.9, 3.7); cam.lookAt(0.2, cy0, 0) }
const dur = TINY_CLIPS[clip].dur, loop = TINY_CLIPS[clip].loop
renderer.setScissorTest(true)
renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H); renderer.setClearColor('#0b141e'); renderer.clear()
const lab = document.getElementById('lab')!
for (let i = 0; i < N; i++) {
  const t = loop ? (i / N) * dur : (i / (N - 1)) * dur
  animateTiny(g, sampleTiny(clip, t))
  const cx = (i % cols) * cw, cy = H - 30 - (Math.floor(i / cols) + 1) * ch
  renderer.setViewport(cx, cy, cw - 2, ch - 2); renderer.setScissor(cx, cy, cw - 2, ch - 2)
  renderer.render(scene, cam)
  lab.insertAdjacentHTML('beforeend', `<div class="l s" style="left:${cx + 40}px;top:${30 + Math.floor(i / cols) * ch + 6}px">${t.toFixed(2)}s</div>`)
}
lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:4px">${clip} · ${dur.toFixed(2)}s${loop ? ' 循环' : ''}</div>`)
;(window as any).__info = { clip, N, cols, cw, ch }; (window as any).__ready = true
