// 原型预览页：窗户 Entity 2（?mode=state&state=occupied|newborn|dying | viewers | arm | old），可加 &cam=x,y,z&look=x,y,z
import * as THREE from 'three'
import { buildWindowEntity, poseWindowArm, tickWindowEntity, WINDOW_STYLE, type WindowState, type WindowStyle } from '../game/renderer/windowMesh'
import { buildEntityMesh } from '../game/renderer/entitiesMesh'
import { animateWindow, WINDOW_CLIPS, type WindowClip } from '../game/renderer/windowAnim'
const q = new URLSearchParams(location.search)
const mode = q.has('anim') ? 'anim' : q.get('mode') ?? 'state'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#121110')
const cam = new THREE.PerspectiveCamera(36, W / H, 0.02, 80)
const lab = document.getElementById('lab')!
const windows: THREE.Object3D[] = []
const count = (g: THREE.Object3D) => { let c = 0, t = 0; g.traverse((m: any) => { if (m.isMesh && m.visible !== false) { c++; t += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 } }); return { meshes: c, tris: Math.round(t) } }
const info: any = {}
const label = (x: number, y: number, z: number, html: string) => { const p = new THREE.Vector3(x, y, z).project(cam); lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${(p.x * 0.5 + 0.5) * W}px;top:${(0.5 - p.y * 0.5) * H}px">${html}</div>`) }
const WALL: Record<WindowStyle, [string, string]> = { l2: ['#5a5148', '#2c2824'], l4: ['#a9a69c', '#5d5a52'], l601: ['#cbbf9f', '#6b5e48'] }
const NAME: Record<WindowStyle, string> = { l2: 'L2 维修通道 · 钢格窗', l4: 'L4 废弃办公室 · 推拉窗', l601: 'L601 图书馆 · 平开木窗' }
const STATE: Record<WindowState, string> = { occupied: '附影窗户', newborn: '无主 · 新生态', dying: '无主 · 衰亡态' }
function bay(x: number, style: WindowStyle) {
  const [wc, fc] = WALL[style]
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2.3, 3.2, 0.3), new THREE.MeshStandardMaterial({ color: wc, roughness: 0.95 })); wall.position.set(x, 1.6, -0.15); wall.receiveShadow = true; scene.add(wall)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.05, 2.4), new THREE.MeshStandardMaterial({ color: fc, roughness: 0.9 })); floor.position.set(x, -0.025, 1.2); floor.receiveShadow = true; scene.add(floor)
}
const lights = () => {
  scene.add(new THREE.HemisphereLight('#efe8da', '#2a2622', 0.9))
  const k = new THREE.DirectionalLight('#fff2dc', 1.5); k.position.set(-2.5, 4, 5); k.castShadow = true; k.shadow.mapSize.set(2048, 2048)
  Object.assign(k.shadow.camera, { left: -8, right: 8, top: 5, bottom: -2 }); scene.add(k)
}
const put = (x: number, style: WindowStyle, state: WindowState, viewerSeed?: number, seed = 3) => { bay(x, style); const g = buildWindowEntity({ style, state, seed, viewerSeed }); g.position.x = x; scene.add(g); windows.push(g); return g }
if (mode === 'state') {
  lights()
  const st = (q.get('state') ?? 'occupied') as WindowState
  const styles: WindowStyle[] = ['l2', 'l4', 'l601']
  cam.position.set(0, 1.55, 7.4); cam.lookAt(0, 1.45, 0); cam.updateMatrixWorld()
  styles.forEach((s, i) => { const x = (i - 1) * 2.4; const g = put(x, s, st, st === 'newborn' ? [0, 3, 1][i] : i); info[s] = count(g); label(x, 0.15, 0.4, NAME[s] + `<br><span class="s">${info[s].meshes} 网格 · ${info[s].tris} 三角形</span>`) })
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:12px">${STATE[st]}</div>`)
  cam.position.set(0, 1.55, 7.4); cam.lookAt(0, 1.45, 0)
} else if (mode === 'viewers') {
  // 同一扇窗、三位观察者看到的不同景色（联机每个客户端用自己的种子）
  lights()
  cam.position.set(0, 1.6, 7.4); cam.lookAt(0, 1.5, 0); cam.updateMatrixWorld()
  for (let i = 0; i < 3; i++) { const x = (i - 1) * 2.4; put(x, 'l601', 'occupied', [0, 1, 3][i], 4 + i * 2); label(x, 0.15, 0.4, `观察者 ${'ABC'[i]}`) }
  cam.position.set(0, 1.6, 7.4); cam.lookAt(0, 1.5, 0)
} else if (mode === 'arm') {
  // 手臂伸出抓人（附图 5）：L4 窗，3/4 侧视
  lights()
  const style = (q.get('style') ?? 'l4') as WindowStyle
  const g = put(0, style, 'occupied', 2)
  const arm = g.userData.window.arm as THREE.Object3D; arm.visible = true
  poseWindowArm(arm, Number(q.get('reach') ?? 0.85), Number(q.get('grip') ?? 0.75), 0.35, 0.05)
  info.arm = count(arm)
  const man = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.2, 4, 10), new THREE.MeshStandardMaterial({ color: '#34404e', roughness: 0.8 })); man.position.set(0.15, 0.85, 2.15); man.castShadow = true; scene.add(man)
  cam.position.set(2.9, 1.7, 3.6); cam.lookAt(0, 1.35, 0.9)
} else if (mode === 'old') {
  lights()
  const g = buildEntityMesh('windowent'); scene.add(g); info.old = count(g)
  const bb = new THREE.Box3().setFromObject(g); info.oldBox = [bb.min.toArray(), bb.max.toArray()]
  const c0 = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3()).length()
  cam.position.set(c0.x + sz * 1.3, c0.y + sz * 0.05, c0.z + sz * 0.35); cam.lookAt(c0)
} else if (mode === 'close') {
  lights()
  const style = (q.get('style') ?? 'l601') as WindowStyle, st = (q.get('state') ?? 'occupied') as WindowState
  put(0, style, st, Number(q.get('viewer') ?? 1))
  const S = WINDOW_STYLE[style]
  cam.position.set(0.55, S.cy, 2.0); cam.lookAt(0, S.cy - 0.05, 0)
}
if (mode === 'anim') {
  // 动画网格：同一扇窗按片段时间逐帧渲染到网格格子里（animateWindow 无状态，可任意顺序求值）
  lights()
  const clip = (q.get('clip') ?? 'idle') as WindowClip
  const style = (q.get('style') ?? (clip === 'dying' || clip === 'vanish' ? 'l4' : 'l601')) as WindowStyle
  const state: WindowState = clip === 'dying' || clip === 'vanish' ? 'dying' : clip === 'newborn' ? 'newborn' : 'occupied'
  const g = put(0, style, state, Number(q.get('viewer') ?? 1)); windows.length = 0
  const grab = ['reach', 'drag', 'release', 'feed'].includes(clip)
  const S = WINDOW_STYLE[style]
  const target = new THREE.Vector3(0.12, 1.28, 1.75)
  let man: THREE.Object3D | null = null
  if (grab) {
    man = new THREE.Group()
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.05, 4, 10), new THREE.MeshStandardMaterial({ color: '#34404e', roughness: 0.8 })); body.position.y = 0.75; man.add(body)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshStandardMaterial({ color: '#c9a58a', roughness: 0.7 })); head.position.y = 1.62; man.add(head)
    man.traverse((o: any) => { if (o.isMesh) o.castShadow = true }); scene.add(man)
  }
  const frames = Number(q.get('frames') ?? 16), cols = Number(q.get('cols') ?? 4)
  const dur = WINDOW_CLIPS[clip].dur, rows = Math.ceil(frames / cols)
  const tw = Math.floor(W / cols), th = Math.floor((H - 30) / rows)
  const view = q.get('view') ?? (grab ? 'side' : 'front')
  const tcam = new THREE.PerspectiveCamera(36, tw / th, 0.02, 60)
  if (view === 'side') { tcam.position.set(2.6, S.cy + 0.15, 3.3); tcam.lookAt(0, S.cy - 0.25, 0.85) }
  else { tcam.position.set(0, S.cy, 2.9); tcam.lookAt(0, S.cy - 0.05, 0) }
  renderer.setScissorTest(true); renderer.autoClear = false
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:4px"><span class="s">${clip} · ${dur}s · ${frames} 帧</span></div>`)
  const draw = () => {
    renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H); renderer.setClearColor('#111'); renderer.clear()
    for (let i = 0; i < frames; i++) {
      const t = WINDOW_CLIPS[clip].loop ? (i / frames) * dur : (i / (frames - 1)) * dur
      // 拖拽期间玩家被一起往窗里拉
      if (man) { const pull = clip === 'drag' ? (t / dur) ** 2.2 * 0.9 : clip === 'feed' ? 2 : clip === 'release' ? 0 : 0; man.position.set(0.12, 0, 1.75 - pull); man.visible = clip !== 'feed' }
      const tg = target.clone(); if (man) tg.z = man.position.z
      animateWindow(g, clip, t, { target: tg, time: 3 + t })
      const c = i % cols, r = Math.floor(i / cols)
      const x = c * tw, y = H - 30 - (r + 1) * th
      renderer.setViewport(x, y, tw, th); renderer.setScissor(x, y, tw, th); renderer.render(scene, tcam)
    }
  }
  const t1 = performance.now(); const l2 = () => { draw(); if (performance.now() - t1 < 2500) requestAnimationFrame(l2); else (window as any).__ready = true }; l2()
}
const vec = (s: string | null) => s ? new THREE.Vector3(...s.split(',').map(Number) as [number, number, number]) : null
const c = vec(q.get('cam')), l = vec(q.get('look')); if (c) cam.position.copy(c); if (l) cam.lookAt(l)
;(window as any).__info = info
const t0 = performance.now(); const T = Number(q.get('t') ?? 4)
const loop = () => { if (mode === 'anim') return; for (const w of windows) tickWindowEntity(w, T); renderer.render(scene, cam); if (performance.now() - t0 < 2500) requestAnimationFrame(loop); else (window as any).__ready = true }; loop()
