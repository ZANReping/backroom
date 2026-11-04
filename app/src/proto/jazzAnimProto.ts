// [jazz stage 2] 爵士脑（Entity 197）阶段 2 动画预览：
// proto-jazz-anim.html?clip=X[&who=leader|sax|bass|drum][&lod=0..2][&cpu=1]
//   [&t=秒] 单帧 / [&ts=0.5,1.2,…&cols=C] 指定时刻网格（不标字）/ [&grid=N] N 帧均分网格（标时间）/ [&gif=1&fps=10&tile=480&reps=N] 全部帧（连续推进二阶，不标字）
//   [&cam=x,y,z&at=x,y,z&fov=]
// 场景按 jazzAnim 摆放常量：台上片段站在 0.45 m 舞台上（台下观众三个剪影）；pianoPlay 立式钢琴 + 琴凳；drinkBeer 吧台 + 啤酒杯；glanceCamera 墙角监控探头；
// argueReconcile 三人（头儿 + 萨克斯 + 低音提琴）；walk 棋盘格地面、相机跟根运动。window.__ready / __info
import * as THREE from 'three'
import { buildJazz, JAZZ_UNI, type JazzRig } from '../game/renderer/jazzMesh'
import { JAZZ_ZH, type JazzWho } from '../game/renderer/jazzRig'
import { buildUprightPiano, buildMusicStand, buildBeerMug, buildCctvCamera } from '../game/renderer/jazzProps'
import { JAZZ_CLIPS, JAZZ_STAGE, JAZZ_PIANO, JAZZ_BENCH, JAZZ_STAND, JAZZ_BAR, JAZZ_CCTV, JAZZ_ARGUE, animateJazz, animateJazzPreroll, resetJazzDynamics, jazzIkResidual, jazzRootMotion, attachJazzMug, type JazzClip } from '../game/renderer/jazzAnim'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'
const q = new URLSearchParams(location.search)
const clip = (q.get('clip') ?? 'idleSway') as JazzClip
const C = JAZZ_CLIPS[clip]
const who = (q.get('who') ?? C.who ?? 'leader') as JazzWho
const lod = Number(q.get('lod') ?? 0)
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#1a0b09')
const M = (c: string, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m })
const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), M('#2e1c13', 0.9)); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor)
const wall = new THREE.Mesh(new THREE.PlaneGeometry(24, 7), M('#4a1712', 1)); wall.position.set(0, 3.5, -1.6); wall.receiveShadow = true; scene.add(wall)
scene.add(new THREE.HemisphereLight('#ffe6c8', '#3a1408', 1.1))
const key = new THREE.DirectionalLight('#ffead2', 2.5); key.position.set(2.2, 4.2, 3.4); key.castShadow = true; key.shadow.mapSize.set(2048, 2048)
Object.assign(key.shadow.camera, { left: -2.6, right: 2.6, top: 3.4, bottom: -0.4, near: 0.1, far: 14 }); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.01; scene.add(key)
const fill = new THREE.DirectionalLight('#e8d8ff', 0.75); fill.position.set(-3, 1.6, 1.6); scene.add(fill)
const rim = new THREE.DirectionalLight('#ffe2c4', 0.9); rim.position.set(1.2, 3, -3); scene.add(rim)
const lab = document.getElementById('lab')!
const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; scene.add(o); return o }
const put = (o: THREE.Object3D, x: number, y: number, z: number, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; o.traverse((m) => { (m as THREE.Mesh).castShadow = true; (m as THREE.Mesh).receiveShadow = true }); scene.add(o); return o }

// ---------- 人 ----------
const t0 = performance.now()
interface Man { who: JazzWho; g: THREE.Group; rig: JazzRig; base: THREE.Vector3; ry: number }
const men: Man[] = []
const add = (w: JazzWho, p: number[], ry = 0) => { const g = buildJazz(w, { lod }); g.rotation.set(0, ry, 0); g.position.set(p[0], p[1], p[2]); scene.add(g); men.push({ who: w, g, rig: g.userData.jazz as JazzRig, base: new THREE.Vector3(p[0], p[1], p[2]), ry }); return g }
const sy = C.stage ? JAZZ_STAGE.h : 0
if (clip === 'argueReconcile') {
  add('leader', [0, 0, 0]); add('sax', [JAZZ_ARGUE.sax.p[0], 0, JAZZ_ARGUE.sax.p[2]], JAZZ_ARGUE.sax.ry); add('bass', [JAZZ_ARGUE.bass.p[0], 0, JAZZ_ARGUE.bass.p[2]], JAZZ_ARGUE.bass.ry)
} else add(who, [0, sy, 0])
const genMs = performance.now() - t0

// ---------- 场景道具 ----------
const wood = M('#4a2a18', 0.6), dark = M('#1e1c1a', 0.6)
if (C.stage) {
  box(4.6, JAZZ_STAGE.h, JAZZ_STAGE.edgeZ + 1.6, 0, JAZZ_STAGE.h / 2, JAZZ_STAGE.edgeZ - (JAZZ_STAGE.edgeZ + 1.6) / 2, M('#3a1f12', 0.55))
  box(4.6, 0.04, 0.04, 0, JAZZ_STAGE.h - 0.02, JAZZ_STAGE.edgeZ + 0.01, M('#c8a050', 0.3, 0.8))
  // 观众三个剪影（台下）
  for (const [x, z] of [[-1.3, 3.3], [-0.2, 3.6], [1.2, 3.3]]) { const s = M('#120806', 0.9); box(0.4, 0.5, 0.25, x, 0.75, z, s); const h = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), s); h.position.set(x, 1.13, z); scene.add(h) }
  if (clip !== 'pianoPlay' && clip !== 'bow' && clip !== 'fakeSoulSuck' && clip !== 'trueSoulSuck') put(buildMusicStand(), JAZZ_STAND[0], sy, JAZZ_STAND[2], -0.9)
}
if (clip === 'pianoPlay') {
  put(buildUprightPiano(), JAZZ_PIANO.origin[0], sy, JAZZ_PIANO.origin[2], JAZZ_PIANO.ry)
  const B = JAZZ_BENCH, leather = M('#2a120c', 0.5)
  box(B.w, 0.05, B.d, 0, sy + B.y - 0.025, B.z, leather)
  for (const x of [-B.w / 2 + 0.05, B.w / 2 - 0.05]) for (const z of [B.z - B.d / 2 + 0.04, B.z + B.d / 2 - 0.04]) box(0.04, B.y - 0.05, 0.04, x, sy + (B.y - 0.05) / 2, z, wood)
}
if (clip === 'drinkBeer') {
  box(1.6, JAZZ_BAR.y - 0.04, 0.55, -0.1, (JAZZ_BAR.y - 0.04) / 2, JAZZ_BAR.z + 0.275 + 0.03, wood)
  box(1.7, 0.04, 0.62, -0.1, JAZZ_BAR.y - 0.02, JAZZ_BAR.z + 0.31, M('#2a160c', 0.35))
  for (const m of men) attachJazzMug(m.rig, buildBeerMug)
}
if (clip === 'glanceCamera') { const c = put(buildCctvCamera(), JAZZ_CCTV[0], JAZZ_CCTV[1], JAZZ_CCTV[2], 0); c.lookAt(0, 1.6, 0); const pole = box(0.04, 0.04, 0.9, JAZZ_CCTV[0], JAZZ_CCTV[1] + 0.05, JAZZ_CCTV[2] - 0.45, dark); void pole }
const move = !!C.speed
if (move) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { g.fillStyle = (i + j) % 2 ? '#5a4632' : '#3b2d20'; g.fillRect(i * 32, j * 32, 32, 32) }
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(12, 12)
  floor.material = new THREE.MeshStandardMaterial({ map: tx, roughness: 1 })
}

// ---------- 相机 ----------
const tall = who === 'bass' ? 2.45 : who === 'sax' ? 2.12 : who === 'drum' ? 2.0 : 1.78
// [方向（目标 → 相机）, 目标, 距离, fov]
const ctr = sy + tall * 0.54
const CAMD: Partial<Record<JazzClip, [number[], number[], number, number]>> = {
  trumpetPlay: [[-0.55, 0.16, 1], [0, ctr + 0.1, 0.1], 4.6, 32], trumpetSolo: [[-0.55, 0.16, 1], [0, ctr + 0.1, 0.1], 4.8, 32],
  saxPlay: [[-0.6, 0.16, 1], [0, ctr, 0.1], 5.2, 32], saxSolo: [[-0.6, 0.16, 1], [0, ctr - 0.05, 0.1], 5.4, 32],
  bassPlay: [[-0.45, 0.16, 1], [0, ctr, 0.1], 6.2, 32], drumPlay: [[-0.4, 0.14, 1], [0, ctr, 0.05], 5.2, 32],
  pianoPlay: [[0.95, 0.45, -0.35], [0, sy + 0.95, 0.3], 4.4, 32], bow: [[0.85, 0.08, 0.6], [0, ctr, 0.1], 5.4, 32],
  tuneUp: [[-0.5, 0.14, 1], [0, ctr + 0.1, 0.1], 5.0, 32], fakeSoulSuck: [[-0.6, 0.0, 1], [0, ctr + 0.15, 0.2], 5.6, 32],
  idleSway: [[0.4, 0.1, 1], [0, ctr, 0], 5.0, 32], walk: [[0.85, 0.1, 0.5], [0, ctr, 0.1], 5.4, 32], drinkBeer: [[-0.8, 0.12, 0.65], [-0.05, ctr, 0.2], 5.0, 32],
  holdHead: [[-0.4, 0.12, 1], [0, ctr, 0.05], 6.0, 32], talkGesture: [[0.45, 0.1, 1], [0, ctr, 0.05], 5.0, 32], leanFamiliar: [[0.9, 0.08, 0.5], [0, ctr, 0.15], 5.0, 32],
  pointDirection: [[0.4, 0.15, 1], [0.1, ctr, 0], 5.4, 34], glanceCamera: [[0.3, 0.05, 1], [-0.2, ctr + 0.2, 0.2], 5.4, 34], argueReconcile: [[0.15, 0.25, 1], [0, 1.2, 0.35], 6.4, 34],
}
const cd = CAMD[clip] ?? [[0.5, 0.1, 1], [0, ctr, 0], 5, 32]
const dn = Math.hypot(cd[0][0], cd[0][1], cd[0][2])
const zoom = Number(q.get('zoom') ?? (who === 'bass' ? 0.95 : 0.86))
let cp = cd[1].map((v, k) => v + (cd[0][k] / dn) * cd[2] * zoom), cl = cd[1]
if (q.get('cam')) cp = q.get('cam')!.split(',').map(Number)
if (q.get('at')) cl = q.get('at')!.split(',').map(Number)
const fov = Number(q.get('fov') ?? cd[3])
const fps = Number(q.get('fps') ?? 8)
let times: number[]
const gifM = !!q.get('gif')
if (q.get('t') !== null) times = [Number(q.get('t'))]
else if (q.get('ts')) times = q.get('ts')!.split(',').map(Number)
else if (gifM) { const n = Math.max(1, Math.round(C.dur * Number(q.get('reps') ?? 1) * fps)); times = Array.from({ length: n }, (_, i) => i / fps) }
else { const n = Number(q.get('grid') ?? 8); times = Array.from({ length: n }, (_, i) => (C.loop ? (i / n) * C.dur : (i / (n - 1)) * C.dur)) }
const N = times.length
let cols: number, rows: number
if (gifM) { const tl = Number(q.get('tile') ?? 320); cols = Math.max(1, Math.floor(W / tl)); rows = Math.ceil(N / cols) }
else { cols = Number(q.get('cols') ?? (N === 1 ? 1 : 4)); rows = Math.ceil(N / cols) }
const tw = gifM ? Number(q.get('tile') ?? 320) : Math.floor(W / cols), th = gifM ? Math.round(tw * 1.15) : Math.floor(H / rows)
const tc = new THREE.PerspectiveCamera(fov, tw / th, 0.01, 60)
const setCam = (dz: number) => { tc.position.set(cp[0], cp[1], cp[2] + dz); tc.lookAt(cl[0], cl[1], cl[2] + dz); tc.updateMatrixWorld(true) }
setCam(0)
JAZZ_UNI.uSpecDir.value.copy(key.position).normalize().transformDirection(tc.matrixWorldInverse)
renderer.setScissorTest(true)
const bare = gifM || !!q.get('ts')
if (!bare) lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:6px;font-size:${N > 12 ? 13 : 17}px">爵士脑 · ${JAZZ_ZH[who]} · ${C.zh} (${clip}) ${C.dur}s${C.loop ? ' 循环' : ''}</div>`)
let i = 0, maxRes = { arm: 0, leg: 0, tip: 0 }
let simT = C.loop ? -1.0 : 0
const h = 1 / 60
if (gifM) for (const m of men) resetJazzDynamics(m.rig)
/** [修] 真吸魂：雾从「观众」胸口（前方 2.6 m）被抽走 */
const MIST_FROM: [number, number, number] | null = clip === 'trueSoulSuck' ? [0.3, 1.15, 2.6] : null
const step = () => {
  const tt = times[i]
  if (gifM) { while (simT <= tt + 1e-6) { for (const m of men) animateJazz(m.rig, clip, simT, { time: simT, dt: simT === (C.loop ? -1.0 : 0) ? undefined : h, mistFrom: MIST_FROM }); simT += h } }
  else for (const m of men) animateJazzPreroll(m.rig, clip, tt, { mistFrom: MIST_FROM }, Math.min(C.loop ? 1.0 : tt, 1.5))
  const r = jazzIkResidual(); maxRes = { arm: Math.max(maxRes.arm, r.arm), leg: Math.max(maxRes.leg, r.leg), tip: Math.max(maxRes.tip, r.tip) }
  let dz = 0
  if (move) { dz = jazzRootMotion(clip, 0, tt)[1]; for (const m of men) m.g.position.z = m.base.z + dz }
  for (const m of men) m.g.updateMatrixWorld(true)
  if (move) setCam(dz)
  if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
  const c = i % cols, rr = Math.floor(i / cols)
  renderer.setViewport(c * tw, H - (rr + 1) * th, tw, th); renderer.setScissor(c * tw, H - (rr + 1) * th, tw, th)
  renderer.render(scene, tc)
  if (N > 1 && !bare) lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${c * tw + tw / 2}px;top:${rr * th + th - 20}px;font-size:12px">${tt.toFixed(2)}s</div>`)
  if (++i < N) setTimeout(step, 0)
  else { ;(window as any).__info = { clip, who, cols, rows, frames: N, fps, dur: C.dur, loop: C.loop, tw, th, res: maxRes, times, genMs: Math.round(genMs) }; (window as any).__ready = true }
}
setTimeout(step, 0)
