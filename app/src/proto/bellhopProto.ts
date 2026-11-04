// [bellhop] 行李员（Entity 135）阶段 1 建模预览：
// proto-bellhop.html?view=three|front|side|back|head|headq|headside|headback|hands|faces|props|tea|turn|lod1[&lod=1][&cpu=1][&face=0..7][&cam=x,y,z&at=x,y,z&fov=][&label=]
//   faces：同一实例逐格换脸（4×2），每格头部特写；turn：头拧 180°（检查颈部权重）；tea：附图姿势（右手茶杯、左手茶碟）
import * as THREE from 'three'
import { buildBellhopMesh, bellhopTris, setBellhopFace, BELLHOP_FACES, type BellhopRig } from '../game/renderer/bellhopMesh'
import { BELLHOP_CLIPS, BELLHOP_FACE_SWAP_AT, animateBellhopPreroll, bellhopIkResidual, type BellhopAnimOpts, type BellhopClip } from '../game/renderer/bellhopAnim'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'
import { setMaterialMode } from '../game/renderer/shared'
const q = new URLSearchParams(location.search)
const view = q.get('view') ?? 'three'
const lod = Number(q.get('lod') ?? (view === 'lod1' ? 1 : 0))
if (q.get('real') === '1') setMaterialMode('realistic')
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: view === 'faces' || !!q.get('anim') }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#3a3a2e')
const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ color: '#4a3b2a', roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor)
const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 5), new THREE.MeshStandardMaterial({ color: '#58573f', roughness: 1 })); wall.position.set(0, 2.5, -2.4); wall.receiveShadow = true; scene.add(wall)
scene.add(new THREE.HemisphereLight('#fff3dc', '#3a2a1a', 1.25))
const key = new THREE.DirectionalLight('#ffe8c8', 2.5); key.position.set(2.2, 3.4, 3.2); key.castShadow = true; key.shadow.mapSize.set(2048, 2048)
Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2.6, bottom: -0.5, near: 0.1, far: 12 }); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.01; scene.add(key)
const fill = new THREE.DirectionalLight('#d8e0ff', 0.75); fill.position.set(-3, 1.6, 1.2); scene.add(fill)
const rim = new THREE.DirectionalLight('#ffd9a8', 0.9); rim.position.set(-1, 2.5, -3); scene.add(rim)
const lab = document.getElementById('lab')!
const t0 = performance.now()
const man = buildBellhopMesh({ lod, face: Number(q.get('face') ?? 0) }); man.rotation.set(0, 0, 0)
const genMs = performance.now() - t0
const t1 = performance.now(); if (!q.get('anim')) buildBellhopMesh({ lod }); const instMs = performance.now() - t1
const rig = man.userData.bellhop as BellhopRig
const stats = man.userData.bellhopStats as Record<string, number>
scene.add(man)
const tm = bellhopTris(man)
const R = (b: THREE.Object3D, x: number, y: number, z: number) => b.rotation.set(x, y, z)
const flex = (bs: THREE.Bone[], a: number[]) => bs.forEach((b, i) => b.quaternion.setFromAxisAngle(b.userData.flexAxis, a[i]))
// 前臂屈曲 + 绕前臂旋（twist > 0 左手掌心朝上 / 右手掌心朝前）的肘部四元数
const elbowQ = (flexA: number, twist: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), flexA).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), twist))
if (view === 'props') {
  rig.bell.visible = true; rig.tag.visible = true; rig.cart.visible = true
  rig.cart.position.set(0.95, 0, 0.35); rig.cart.rotation.y = -0.5
  // 右手握拳举铃（拳头朝前、铃口朝下），左手掌心朝上递行李牌
  R(rig.armR.shoulder, -0.35, 0, -0.08); rig.armR.elbow.quaternion.copy(elbowQ(-1.25, 0))
  for (const f of ['index', 'middle', 'ring', 'pinky'] as const) flex(rig.armR.fingers[f], [1.25, 1.35, 0.9])
  flex(rig.armR.fingers.thumb, [0.5, 0.6, 0.5])
  R(rig.armL.shoulder, -0.3, 0, 0.1); rig.armL.elbow.quaternion.copy(elbowQ(-1.3, Math.PI / 2))
  for (const f of ['index', 'middle', 'ring', 'pinky'] as const) flex(rig.armL.fingers[f], [0.15, 0.2, 0.1])
}
if (view === 'tea') {
  // 附图姿势：左手掌心朝上托茶碟，右手捏杯把举在碟上方
  rig.cup.visible = true; rig.saucer.visible = true
  R(rig.armL.shoulder, -0.3, 0, 0.16); rig.armL.elbow.quaternion.copy(elbowQ(-1.42, Math.PI / 2 - 0.35)); R(rig.armL.wrist, 0.85, 0, 0)
  for (const f of ['index', 'middle', 'ring', 'pinky'] as const) flex(rig.armL.fingers[f], [0.12, 0.15, 0.1])
  R(rig.armR.shoulder, -0.42, 0, -0.2); rig.armR.elbow.quaternion.copy(elbowQ(-1.45, -0.25)); R(rig.armR.wrist, 0, 0, 0.15)
  flex(rig.armR.fingers.index, [0.75, 0.8, 0.4]); flex(rig.armR.fingers.thumb, [0.35, 0.4, 0.3])
  for (const f of ['middle', 'ring', 'pinky'] as const) flex(rig.armR.fingers[f], [0.9, 1.1, 0.7])
}
if (view === 'turn') R(rig.head, 0, Math.PI, 0)
/** 摆好姿势后把道具在世界里扶正（局部 +Y = 世界上；只用于预览摆拍） */
const upright = (o: THREE.Object3D, yaw = 0) => { man.updateMatrixWorld(true); const pq = new THREE.Quaternion(); o.parent!.getWorldQuaternion(pq); o.quaternion.copy(pq.invert().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw))) }
if (view === 'tea') { upright(rig.saucer); upright(rig.cup, Math.PI) }
if (view === 'props') upright(rig.bell)
if (q.get('headturn')) R(rig.head, 0, Number(q.get('headturn')), 0)
const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 60)
const VW: Record<string, [number[], number[], number?]> = {
  front: [[0, 1.1, 5.0], [0, 0.95, 0]], side: [[5.0, 1.1, 0], [0, 0.95, 0]], back: [[-0.6, 1.2, -4.8], [0, 0.95, 0]], three: [[2.7, 1.5, 3.9], [0, 0.95, 0]], lod1: [[2.7, 1.5, 3.9], [0, 0.95, 0]],
  head: [[0, 1.7, 1.05], [0, 1.68, 0.03]], headq: [[0.7, 1.78, 0.8], [0, 1.67, 0.03]], headside: [[1.05, 1.7, 0.05], [0, 1.67, 0.02]], headback: [[-0.55, 1.85, -0.8], [0, 1.66, 0]],
  hands: [[0.75, 0.95, 0.65], [0.24, 0.86, 0.03]], props: [[2.6, 1.45, 3.2], [0.35, 0.95, 0.2]], tea: [[0.6, 1.45, 1.55], [0, 1.2, 0.15]], turn: [[0.6, 1.75, 1.0], [0, 1.6, 0]],
  torso: [[0.55, 1.35, 1.35], [0, 1.25, 0]], collar: [[0.35, 1.6, 0.75], [0, 1.52, 0.02]], feet: [[0.9, 0.35, 1.0], [0, 0.12, 0.05]],
}
let [p, l, fv] = VW[view] ?? VW.three
if (q.get('cam')) p = q.get('cam')!.split(',').map(Number)
if (q.get('at')) l = q.get('at')!.split(',').map(Number)
cam.fov = Number(q.get('fov') ?? fv ?? 30); cam.updateProjectionMatrix()
cam.position.set(p[0], p[1], p[2]); cam.lookAt(l[0], l[1], l[2])
const box = new THREE.Box3().setFromObject(man)
const title = `行李员 Entity 135 · 阶段 1 · ${q.get('label') ?? view}${lod ? ' · LOD1' : ''}`
const sub = `本体 ${tm.tris} 三角形 + 发片 ${tm.hair} / ${tm.meshes} 网格 · 生成 ${genMs.toFixed(0)} ms（第二个实例 ${instMs.toFixed(0)} ms）${QA_CPU_SKIN ? ' · CPU 蒙皮' : ''}`
;(window as any).__info = { tm, genMs: Math.round(genMs), instMs: Math.round(instMs), stats, h: +box.max.y.toFixed(3), w: +(box.max.x - box.min.x).toFixed(3), d: +(box.max.z - box.min.z).toFixed(3) }
man.updateMatrixWorld(true)
;(window as any).__hairTex = () => ((rig.hairMesh.material as THREE.MeshBasicMaterial).map?.image as HTMLCanvasElement | undefined)?.toDataURL()
if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
if (q.get('anim')) animMode()
else if (view === 'faces') {
  // 4×2：同一实例逐格换脸
  const cols = 4, rows = 2, tw = Math.floor(W / cols), th = Math.floor(H / rows)
  const tc = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 27), tw / th, 0.01, 20)
  const [cp, cl] = q.get('cam') ? [p, l] : [[0.3, 1.73, 1.0], [0, 1.705, 0.04]]
  tc.position.set(cp[0], cp[1], cp[2]); tc.lookAt(cl[0], cl[1], cl[2])
  renderer.setScissorTest(true)
  lab.innerHTML = ''
  let i = 0
  const step = () => {
    setBellhopFace(rig, i); man.updateMatrixWorld(true)
    if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
    const c = i % cols, r = Math.floor(i / cols)
    renderer.setViewport(c * tw, H - (r + 1) * th, tw, th); renderer.setScissor(c * tw, H - (r + 1) * th, tw, th)
    renderer.render(scene, tc)
    lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${c * tw + tw / 2}px;top:${r * th + 8}px">${i + 1}. ${BELLHOP_FACES[i].zh}</div>`)
    if (++i < 8) setTimeout(step, 0); else { setBellhopFace(rig, 0); (window as any).__ready = true }
  }
  renderer.setScissorTest(false); renderer.render(scene, cam); renderer.setScissorTest(true)
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:${H - 26}px;font-size:13px">行李员 Entity 135 · 8 张面盘（setBellhopFace 0–7）</div>`)
  setTimeout(step, 0)
} else {
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:8px">${title}<br><span class="s">${sub}</span></div>`)
  let n = 0; const loop = () => { if (QA_CPU_SKIN) syncSceneCpuSkins(scene); renderer.render(scene, cam); if (++n < 20) requestAnimationFrame(loop); else (window as any).__ready = true }; loop()
}

// ---------- 阶段 2 动画预览 ----------
// ?anim=1&clip=X[&t=秒]           单帧
//   [&grid=N&cols=C]               N 帧网格（非循环含首尾，循环均分）
//   [&gif=1&fps=10&tile=300]       全部帧（按 fps）铺满窗口，供 GIF 切帧；&move=1 根位移按片段速度前进（地面棋盘格看脚锁定）
//   [&cam=x,y,z&at=x,y,z&fov=]     相机；默认按片段
//   [&turn=&tilt=]                 叠加拧头 / 歪头（headTurn：最终角度）
function animMode() {
  const clip = (q.get('clip') ?? 'idle') as BellhopClip
  const C = BELLHOP_CLIPS[clip]
  const opts: BellhopAnimOpts = { seed: Number(q.get('seed') ?? 1) }
  if (q.get('turn') !== null) opts.turn = Number(q.get('turn'))
  if (q.get('tilt') !== null) opts.tilt = Number(q.get('tilt'))
  if (clip === 'faceShift') { opts.faceFrom = Number(q.get('face') ?? 0); opts.faceTo = Number(q.get('faceto') ?? 1) }
  const move = q.get('move') === '1'
  if (move) { // 地面棋盘格（0.25 m 一格）：支撑相的脚相对格子不动 = 不打滑
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const cx = cv.getContext('2d')!
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { cx.fillStyle = (i + j) % 2 ? '#6b4a36' : '#3a281f'; cx.fillRect(i * 32, j * 32, 32, 32) }
    const tx = new THREE.CanvasTexture(cv); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(28, 28); tx.magFilter = THREE.NearestFilter; tx.colorSpace = THREE.SRGBColorSpace
    floor.material = new THREE.MeshStandardMaterial({ map: tx, roughness: 1 }); wall.visible = false
  }
  const CAM: Record<BellhopClip, [number[], number[], number?]> = {
    idle: [[1.5, 1.6, 3.3], [0, 1.05, 0.1]], headTurn: [[0.9, 1.75, 1.6], [0, 1.6, 0.0]], ringFriendly: [[1.3, 1.6, 2.9], [-0.1, 1.15, 0.15]], ringAnnoyed: [[1.3, 1.6, 2.9], [-0.1, 1.15, 0.15]],
    bow: [[3.2, 1.4, 1.8], [0, 1.0, 0.0]], walk: [[4.6, 1.15, 0.2], [0, 0.95, 0.2]], pushCart: [[4.8, 1.3, 0.7], [0, 0.9, 0.55], 32],
    takeItem: [[2.2, 1.6, 2.6], [0, 1.05, 0.3]], giveBack: [[2.2, 1.6, 2.6], [0, 1.05, 0.3]], tagHand: [[1.9, 1.55, 2.4], [0.05, 1.1, 0.2]],
    teaSip: [[0.9, 1.55, 1.75], [0, 1.38, 0.15]], faceShift: [[0.7, 1.75, 1.45], [0, 1.62, 0.02]], pickUp: [[2.4, 1.6, 2.9], [-0.25, 0.75, 0.25], 34], stillWatch: [[1.5, 1.6, 3.3], [0, 1.05, 0.1]],
  }
  let [cp, cl] = CAM[clip]
  if (q.get('cam')) cp = q.get('cam')!.split(',').map(Number)
  if (q.get('at')) cl = q.get('at')!.split(',').map(Number)
  const fov = Number(q.get('fov') ?? CAM[clip][2] ?? 30)
  let times: number[]
  const fps = Number(q.get('fps') ?? 10)
  if (q.get('t') !== null) times = [Number(q.get('t'))]
  else if (q.get('gif')) { const n = Math.max(1, Math.round(C.dur * fps * Number(q.get('cycles') ?? 1))); times = Array.from({ length: n }, (_, i) => i / fps) }
  else { const n = Number(q.get('grid') ?? 8); times = Array.from({ length: n }, (_, i) => C.loop ? (i / n) * C.dur : (i / (n - 1)) * C.dur) }
  const N = times.length
  let cols: number, rows: number
  if (q.get('gif')) { const tile = Number(q.get('tile') ?? 300); cols = Math.max(1, Math.floor(W / tile)); rows = Math.ceil(N / cols) }
  else { cols = Number(q.get('cols') ?? (N === 1 ? 1 : 4)); rows = Math.ceil(N / cols) }
  const tw = Math.floor(W / cols), th = Math.floor(H / rows)
  const tc = new THREE.PerspectiveCamera(fov, tw / th, 0.01, 60)
  renderer.setScissorTest(true)
  lab.innerHTML = ''
  const bare = !!q.get('gif')
  if (!bare) lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:6px;font-size:${N > 12 ? 13 : 17}px">行李员 · ${C.zh} (${clip}) ${C.dur}s${C.loop ? ' 循环' : ''}</div>`)
  let i = 0, maxRes = { arm: 0, leg: 0 }
  const step = () => {
    const tt = times[i]
    animateBellhopPreroll(rig, clip, tt, opts)
    const r = bellhopIkResidual(); maxRes = { arm: Math.max(maxRes.arm, r.arm), leg: Math.max(maxRes.leg, r.leg) }
    const oz = move && C.speed ? C.speed * tt : 0
    man.position.z = oz
    if (move) { key.position.set(2.2, 3.4, 3.2 + oz); key.target.position.set(0, 0.8, oz); key.target.updateMatrixWorld() }
    man.updateMatrixWorld(true)
    if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
    tc.position.set(cp[0], cp[1], cp[2] + oz); tc.lookAt(cl[0], cl[1], cl[2] + oz)
    const c = i % cols, rr = Math.floor(i / cols)
    renderer.setViewport(c * tw, H - (rr + 1) * th, tw, th); renderer.setScissor(c * tw, H - (rr + 1) * th, tw, th)
    renderer.render(scene, tc)
    if (N > 1 && !bare) lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${c * tw + tw / 2}px;top:${rr * th + th - 20}px;font-size:12px">${tt.toFixed(2)}s${clip === 'faceShift' && tt >= BELLHOP_FACE_SWAP_AT ? ' · 换脸' : ''}</div>`)
    if (++i < N) setTimeout(step, 0)
    else { (window as any).__info = { clip, cols, rows, frames: N, fps, dur: C.dur, tw, th, res: maxRes }; (window as any).__ready = true }
  }
  renderer.setScissorTest(false); renderer.render(scene, cam); renderer.setScissorTest(true)
  setTimeout(step, 0)
}
