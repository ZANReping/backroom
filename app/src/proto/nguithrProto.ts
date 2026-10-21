// 原型预览页：Nguithr'xurh（Entity 16）重制——第 1 阶段静态建模 + 第 2 阶段动画。
// ?mode=under（从下往上看天花板上的它，参照附图构图）| side | front | nest | plan | pop | scales
// ?anim=idle|cut|descend|crawl|feed|climb|sleep|cower|dead|spray|loop &t=秒 [&view=under|wide|side|front3q|top] [&play=1 实时播放]
// &real=1 真实感材质；&cpu=1 CPU 蒙皮替身（无头 SwiftShader 截图必开）
import * as THREE from 'three'
import { buildNguithrNest, nguithrBudget, nguithrNest, NG_LEGS, NG_PALPS } from '../game/renderer/nguithrMesh'
import { buildNguithrAnimated as buildNguithrMesh } from '../game/renderer/nguithrAnim'
import { runAnimProto } from './nguithrAnimProto'
import { setMaterialMode } from '../game/renderer/shared'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'

const Q = new URLSearchParams(location.search)
const mode = Q.get('mode') ?? 'under'
const real = Q.get('real') === '1'
if (real) setMaterialMode('realistic')
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
if (real) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1 }
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene()
const lab = document.getElementById('lab')!
const label = (x: number, y: number, txt: string) => lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${x}px;top:${y}px">${txt}</div>`)
let cam: THREE.Camera = new THREE.PerspectiveCamera(40, W / H, 0.02, 60)
const CEIL = 2.7

/** 白色粗糙天花板（附图那种微脏的白漆面），法线朝下 */
function ceiling(size = 14) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256
  const g = cv.getContext('2d')!; g.fillStyle = '#d9d6cf'; g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 6000; i++) { const v = 190 + Math.random() * 50; g.fillStyle = `rgba(${v},${v - 2},${v - 6},0.5)`; g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2) }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(size / 1.5, size / 1.5); t.colorSpace = THREE.SRGBColorSpace
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: t, bumpMap: t, bumpScale: 1.5, ...(Q.get('dark') === '1' ? { color: '#202020' } : {}) } as THREE.MeshLambertMaterialParameters))
  m.rotation.x = Math.PI / 2; m.position.y = CEIL; scene.add(m)
}
function floor(color = '#6c675c') {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color })); m.rotation.x = -Math.PI / 2; scene.add(m)
}
/** 天花板上的一只（倒挂）+ 可选巢 */
function onCeiling(scale = 1, x = 0, z = 0, rotY = 0) {
  const g = buildNguithrMesh(scale); g.rotation.set(Math.PI, rotY, 0, 'YXZ'); g.position.set(x, CEIL, z); scene.add(g); return g
}
/** 闪光灯式照明（附图是夜间闪光拍摄） */
function flash(pos: THREE.Vector3, target: THREE.Vector3, k = 1) {
  const s = new THREE.SpotLight('#fff8ec', 9 * k, 14, 0.85, 0.7, 1.2); s.position.copy(pos); s.target.position.copy(target); scene.add(s, s.target)
  scene.add(new THREE.HemisphereLight('#d8d4ca', '#2a2620', 0.25))
}
let worst = { meshes: 0, draws: 0, tris: 0, bones: 0 }
const track = (g: THREE.Object3D) => { const b = nguithrBudget(g); if (b.tris > worst.tris) worst = b; return g }
let nestInfo: unknown = null
const animName = Q.get('anim')

if (animName) {
  runAnimProto({ renderer, scene, W, H, Q, label, real, CEIL, ceiling, floor, track })
} else if (mode === 'under') {
  scene.background = new THREE.Color('#0b0a09')
  ceiling(); const nest = buildNguithrNest(4, 3); nest.position.y = CEIL - 0.001; scene.add(nest)
  if (Q.get('nospider') !== '1') track(onCeiling(1, 0, 0, 0.12))
  const c = new THREE.PerspectiveCamera(52, W / H, 0.05, 30); c.position.set(-0.05, CEIL - 1.6, 0.03); c.up.set(1, 0, 0); c.lookAt(0.0, CEIL, 0); cam = c
  flash(V3(0.3, CEIL - 1.7, 0.4), V3(0, CEIL, 0), 1.1)
} else if (mode === 'side' || mode === 'front') {
  scene.background = new THREE.Color('#2a2a2c'); floor()
  const sp = buildNguithrMesh(1); scene.add(sp); track(sp)
  scene.add(new THREE.HemisphereLight('#efeae0', '#3a352e', 1.0)); const sun = new THREE.DirectionalLight('#fff6e8', 1.6); sun.position.set(2, 4, 3); scene.add(sun)
  const fill = new THREE.DirectionalLight('#cfd8ff', 0.5); fill.position.set(-3, 1.5, -2); scene.add(fill)
  const c = new THREE.PerspectiveCamera(mode === 'side' ? 30 : 28, W / H, 0.02, 30)
  if (mode === 'side') { c.position.set(0.0, 0.34, 2.45); c.lookAt(0.0, 0.16, 0) } // 侧视：模型 +X 正面 → 画面右
  else { c.position.set(1.25, 0.5, 0.42); c.lookAt(0.26, 0.17, 0) } // 正面特写：螯与眼
  cam = c
  if (mode === 'side') { // 1.8m 标尺
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.008, 0.008), new THREE.MeshBasicMaterial({ color: '#e0c060' })); bar.position.set(0, 0.004, 0); scene.add(bar)
    label(W / 2, H - 60, '<span class="s">黄色标尺 = 1.8m（与身体同一深度）</span>')
  }
} else if (mode === 'plan' || mode === 'scales') {
  scene.background = new THREE.Color('#38362f'); floor('#5d594f')
  const grid = new THREE.GridHelper(6, 60, '#8a8577', '#6d695e'); grid.position.y = 0.001; scene.add(grid)
  scene.add(new THREE.HemisphereLight('#f2eee4', '#3a352e', 1.1)); const sun = new THREE.DirectionalLight('#fff6e8', 1.3); sun.position.set(1, 5, 1); scene.add(sun)
  const list = mode === 'plan' ? [[1, 0]] : [[0.75, -2.1], [1, 0], [1.3, 2.3]]
  for (const [s, z] of list) { const g = buildNguithrMesh(s); g.position.set(0, 0, z); scene.add(g); track(g) }
  const span = mode === 'plan' ? 1.25 : 3.6
  const c = new THREE.OrthographicCamera(-span * W / H, span * W / H, span, -span, 0.1, 20); c.position.set(0, 8, 0); c.up.set(1, 0, 0); c.lookAt(0, 0, 0); cam = c
  if (mode === 'plan') label(W / 2, H - 40, `<span class="s">俯视平面图 · 网格 10cm · 附肢 ${NG_LEGS.length + NG_PALPS.length} 只（步足 ${NG_LEGS.length} + 须肢 ${NG_PALPS.length}）+ 一对螯肢</span>`)
  else { label(W * 0.5 - (2.1 / span) * (H / 2), 14, '0.75x'); label(W / 2, 14, '1.0x'); label(W * 0.5 + (2.3 / span) * (H / 2), 14, '1.3x') }
} else { // nest / pop：带巢全景
  scene.background = new THREE.Color('#0d0c0a')
  floor('#24221e')
  ceiling(); const nest = buildNguithrNest(5, 7); nest.position.y = CEIL - 0.001; scene.add(nest)
  const h = nguithrNest(nest)!
  if (mode === 'pop') { h.sacs[1].pop(); h.sacs[3].hide(); h.setSacGlow(0.35, 1.4) }
  nestInfo = h.sacs.map((s) => ({ i: s.index, state: s.state, r: +s.radius.toFixed(3), c: s.center.toArray().map((v) => +v.toFixed(2)) }))
  track(onCeiling(1.0, 0, 0, 0.4))
  const c = new THREE.PerspectiveCamera(50, W / H, 0.05, 30); c.position.set(1.15, 1.25, 3.0); c.lookAt(0, CEIL - 0.3, 0); cam = c
  flash(V3(1.6, 1.2, 2.8), V3(0, CEIL - 0.2, 0), 1.4)
  if (mode === 'pop') label(W / 2, H - 40, '<span class="s">句柄测试：1 号网囊已爆开（残壳）、3 号已隐藏、镇静液自发光/高光调高</span>')
}
function V3(x: number, y: number, z: number) { return new THREE.Vector3(x, y, z) }

if (!animName) finishStatic()
function finishStatic() {
label(W - 230, 8, `<span class="s">单只 ${worst.meshes} 网格 / ${worst.draws} 次绘制 / ${worst.tris} 三角面 / ${worst.bones} 骨骼${QA_CPU_SKIN ? ' · CPU 蒙皮' : ''}${real ? ' · 真实材质' : ' · 经典材质'}</span>`)
if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
let retries = 0
for (; retries < 6; retries++) {
  renderer.render(scene, cam)
  const bad = (renderer.info.programs ?? []).some((p) => (p as unknown as { diagnostics?: { runnable: boolean } }).diagnostics?.runnable === false)
  if (!bad) break
}
const w = window as unknown as Record<string, unknown>
w.__retries = retries; w.__budget = worst; w.__nest = nestInfo; w.__ready = true
}
