// [beast] 第五层的野兽（Entity 18）阶段 1 建模预览：
// proto-beast.html?view=three|front|side|back|head|headq|headside|tentacles|hands|true|truehead|props|portrait|lod1|moody
//   [&lod=1][&cpu=1][&form=true|0..1][&cam=x,y,z&at=x,y,z&fov=][&label=][&bg=]
//   true / truehead：真身（setBeastForm 1）；moody：附图同款暗场青色侧光（竖构图）；portrait：画像贴图（beastPortraitTexture）
//   window.__ready / __info（tris、生成耗时、身高 h 等）同行李员预览
import * as THREE from 'three'
import { buildBeast, beastTris, setBeastForm, BEAST_CHROMA, type BeastRig } from '../game/renderer/beastMesh'
import { beastPortraitTexture } from '../game/renderer/beastProps'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'
import { setMaterialMode } from '../game/renderer/shared'
import { BEAST_CLIPS, BEAST_GRAB_DEFAULT, animateBeastPreroll, beastIkResidual, beastPalmPoint, type BeastAnimOpts, type BeastClip } from '../game/renderer/beastAnim'
const q = new URLSearchParams(location.search)
const view = q.get('view') ?? 'three'
const lod = Number(q.get('lod') ?? (view === 'lod1' ? 1 : 0))
if (q.get('real') === '1') setMaterialMode('realistic')
const moody = view === 'moody'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!q.get('anim') }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color(q.get('bg') ?? (moody ? '#000000' : '#34352c'))
const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshStandardMaterial({ color: '#3d3026', roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor)
const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), new THREE.MeshStandardMaterial({ color: '#4c4a37', roughness: 1 })); wall.position.set(0, 3, -2.6); wall.receiveShadow = true; scene.add(wall)
const lab = document.getElementById('lab')!
let key: THREE.DirectionalLight
if (moody) {
  // 附图：几乎全黑，左前方一道冷青侧光（照亮脸左半、衬衫左半），右侧极弱的暖红轮廓光（西装右肩一点酒红）
  floor.visible = false; wall.visible = false
  scene.add(new THREE.HemisphereLight('#0a1416', '#000000', 0.05))
  // 主光：从画面左侧偏前、略高的冷青聚光（只照到头左半 / 衬衫左半 / 左肩），右半边沉进黑里
  const spot = new THREE.SpotLight('#3fe6d6', 10, 6, 0.4, 0.6, 1.2); spot.position.set(-1.9, 2.05, 1.05); spot.target.position.set(0.05, 1.55, 0.0); scene.add(spot, spot.target)
  key = new THREE.DirectionalLight('#38d8cc', 0.35); key.position.set(-2.6, 1.6, 0.8); scene.add(key)
  // 西装右肩一点暗酒红轮廓光
  const warm = new THREE.DirectionalLight('#8a2a26', 0.45); warm.position.set(2.5, 1.8, -1.2); scene.add(warm)
  // 衬衫上那片偏粉白的正面补光（附图衬衫是亮的、西装还是黑的）：窄聚光只打胸口 V 区
  const shirtL = new THREE.SpotLight('#f0c8c4', 14, 4, 0.16, 0.6, 1.4); shirtL.position.set(0.6, 1.5, 1.9); shirtL.target.position.set(0, 1.2, 0.08); scene.add(shirtL, shirtL.target)
  BEAST_CHROMA.uSpecColor.value.set('#7ff5ea'); BEAST_CHROMA.uWet.value = 0.9; BEAST_CHROMA.uIrid.value = 0.6
} else {
  scene.add(new THREE.HemisphereLight('#fff3dc', '#3a2a1a', 1.2))
  key = new THREE.DirectionalLight('#ffe8c8', 2.5); key.position.set(2.2, 3.4, 3.2); key.castShadow = true; key.shadow.mapSize.set(2048, 2048)
  Object.assign(key.shadow.camera, { left: -2.2, right: 2.2, top: 2.9, bottom: -0.5, near: 0.1, far: 12 }); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.01; scene.add(key)
  const fill = new THREE.DirectionalLight('#cfe0ff', 0.75); fill.position.set(-3, 1.6, 1.2); scene.add(fill)
  const rim = new THREE.DirectionalLight('#9fe8e0', 0.9); rim.position.set(-1, 2.5, -3); scene.add(rim)
}
const t0 = performance.now()
const man = buildBeast({ lod }); man.rotation.set(0, 0, 0)
const genMs = performance.now() - t0
const t1 = performance.now(); if (!q.get('anim')) buildBeast({ lod }); const instMs = performance.now() - t1
const rig = man.userData.beast as BeastRig
const stats = man.userData.beastStats as Record<string, number>
scene.add(man)
// 调试：&hide=beastTentacles,beastHead … 隐藏指定网格
for (const nm of (q.get('hide') ?? '').split(',').filter(Boolean)) man.traverse((o) => { if (o.name === nm) o.visible = false })
const formQ = q.get('form')
if (view === 'true' || view === 'truehead' || view === 'trueside') setBeastForm(rig, 1)
else if (formQ) setBeastForm(rig, formQ === 'true' ? 1 : Number(formQ))
const R = (b: THREE.Object3D, x: number, y: number, z: number) => b.rotation.set(x, y, z)
const flex = (bs: THREE.Bone[], a: number[]) => bs.forEach((b, i) => b.quaternion.setFromAxisAngle(b.userData.flexAxis, a[i]))
const elbowQ = (flexA: number, twist: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), flexA).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), twist))
if (view === 'props') {
  // 左手平托契约（掌心朝上），右手握笔递出
  rig.contract.visible = true; rig.pen.visible = true
  R(rig.armL.shoulder, -0.35, 0, 0.12); rig.armL.elbow.quaternion.copy(elbowQ(-1.3, Math.PI / 2 - 0.2))
  for (const f of ['index', 'middle', 'ring', 'pinky'] as const) flex(rig.armL.fingers[f], [0.1, 0.12, 0.08])
  R(rig.armR.shoulder, -0.45, 0, -0.12); rig.armR.elbow.quaternion.copy(elbowQ(-1.15, -0.3))
  flex(rig.armR.fingers.index, [0.7, 0.8, 0.4]); flex(rig.armR.fingers.thumb, [0.35, 0.4, 0.3])
  for (const f of ['middle', 'ring', 'pinky'] as const) flex(rig.armR.fingers[f], [1.0, 1.2, 0.8])
  man.updateMatrixWorld(true)
  // 契约在世界里扶正、朝镜头斜过来（看得到条款和火漆），托在掌下 / 掌前
  const pq = new THREE.Quaternion(); rig.contract.parent!.getWorldQuaternion(pq); rig.contract.quaternion.copy(pq.clone().invert().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.75, 0.35, 0, 'YXZ'))))
  const hw = new THREE.Vector3(); rig.armL.wrist.getWorldPosition(hw)
  rig.contract.position.copy(rig.contract.parent!.worldToLocal(hw.add(new THREE.Vector3(0.06, -0.09, 0.13))))
}
if (view === 'hands') {
  // 两手抬到胸前（手背朝前、看戒指）：左手食指暗绿宝石戒 + 小指印章戒，右手无名指金戒
  R(rig.armL.shoulder, -0.42, 0, 0.06); rig.armL.elbow.quaternion.copy(elbowQ(-1.25, 0.25))
  R(rig.armR.shoulder, -0.42, 0, -0.06); rig.armR.elbow.quaternion.copy(elbowQ(-1.25, -0.25))
  for (const A of [rig.armL, rig.armR]) for (const f of ['index', 'middle', 'ring', 'pinky'] as const) flex(A.fingers[f], [0.25, 0.35, 0.2])
}
const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 80)
const VW: Record<string, [number[], number[], number?]> = {
  front: [[0, 1.12, 5.4], [0, 1.0, 0]], side: [[5.4, 1.12, 0], [0, 1.0, 0]], back: [[-0.7, 1.25, -5.2], [0, 1.0, 0]], three: [[2.9, 1.6, 4.2], [0, 1.0, 0]], lod1: [[2.9, 1.6, 4.2], [0, 1.0, 0]],
  head: [[0, 1.76, 1.25], [0, 1.73, 0.0]], headq: [[0.85, 1.85, 0.95], [0, 1.74, -0.02]], headside: [[1.25, 1.78, -0.03], [0, 1.75, -0.04]], headback: [[-0.7, 1.95, -0.95], [0, 1.78, -0.08]],
  tentacles: [[0.25, 1.62, 0.95], [0, 1.58, 0.06]], hands: [[0.45, 1.35, 1.55], [0, 1.12, 0.3], 30],
  true: [[3.6, 2.0, 5.4], [0, 1.15, 0.6], 34], truehead: [[0.5, 2.3, 1.1], [0, 2.12, 0.05]], trueside: [[6.2, 1.5, 1.0], [0, 1.2, 0.9], 32],
  props: [[0.75, 1.45, 1.45], [0.05, 1.12, 0.25], 34], moody: [[-0.28, 1.5, 2.05], [0, 1.47, 0.0], 30],
}
let [p, l, fv] = VW[view] ?? VW.three
if (q.get('cam')) p = q.get('cam')!.split(',').map(Number)
if (q.get('at')) l = q.get('at')!.split(',').map(Number)
cam.fov = Number(q.get('fov') ?? fv ?? 30); cam.updateProjectionMatrix()
cam.position.set(p[0], p[1], p[2]); cam.lookAt(l[0], l[1], l[2])
man.updateMatrixWorld(true)
const tm = beastTris(man)
if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
// 高光方向跟主光走（视空间）
cam.updateMatrixWorld(true)
BEAST_CHROMA.uSpecDir.value.copy(key.position).normalize().transformDirection(cam.matrixWorldInverse)
const box = new THREE.Box3()
man.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.userData.cpuSkin && m.visible) { m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld); box.union(b) } })
if (box.isEmpty()) box.setFromObject(man)
const title = `第五层的野兽 Entity 18 · 阶段 1 · ${q.get('label') ?? view}${lod ? ' · LOD1' : ''}${rig.form > 0 ? ' · 真身' : ''}`
const sub = `${tm.tris} 三角形（触须 ${tm.tent}、眼 / 喙 / 小件 ${tm.small}）/ ${tm.meshes} 网格 · 高 ${box.max.y.toFixed(2)} m · 生成 ${genMs.toFixed(0)} ms（第二个实例 ${instMs.toFixed(0)} ms）${QA_CPU_SKIN ? ' · CPU 蒙皮' : ''}`
;(window as any).__info = { tm, genMs: Math.round(genMs), instMs: Math.round(instMs), stats, h: +box.max.y.toFixed(3), w: +(box.max.x - box.min.x).toFixed(3), d: +(box.max.z - box.min.z).toFixed(3), zMax: +box.max.z.toFixed(3) }
if (view === 'portrait') {
  // 画像：带框的油画贴在墙上（2D 贴图在 3D 里的样子）+ 右侧原始贴图
  man.visible = false; floor.visible = false
  const tex = beastPortraitTexture({ w: 512, h: 680 })!
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), new THREE.MeshLambertMaterial({ map: tex })); plane.position.set(0, 1.5, -2.55); scene.add(plane)
  cam.position.set(-0.2, 1.5, 0.4); cam.lookAt(0.62, 1.5, -2.55) // 画框在画面左半，右半放原始贴图
  const img = tex.image as HTMLCanvasElement; img.style.cssText = `position:fixed;right:24px;top:60px;height:${H - 100}px;box-shadow:0 0 20px #000`; document.body.appendChild(img)
}
if (!moody) lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:8px">${title}<br><span class="s">${sub}</span></div>`)
// 视口在脚本启动后才变（截图脚本改设备尺寸）时跟着改画布 / 相机比例，再多渲染几帧才算就绪
let n = 0; const loop = () => {
  if (q.get('anim')) { animMode(); return }
  if (renderer.domElement.width !== innerWidth || renderer.domElement.height !== innerHeight) { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); n = 0 }
  if (QA_CPU_SKIN) syncSceneCpuSkins(scene); renderer.render(scene, cam); if (++n < 12) requestAnimationFrame(loop); else (window as any).__ready = true
}; loop()

// ---------- 阶段 2 动画预览 ----------
// ?anim=1&clip=X[&t=秒]           单帧
//   [&grid=N&cols=C]               N 帧网格（非循环含首尾，循环均分），每格标时间
//   [&gif=1&fps=10&tile=300]       全部帧（按 fps）铺满窗口，供 GIF 切帧（不标字）
//   [&cam=x,y,z&at=x,y,z&fov=]     相机；默认按片段（斜前方）；&close=1 头部 / 上身近景（看色素变色）
//   [&tx=&ty=&tz=]                 注视 / 抓取目标（root 空间）
// 坐姿片段（seatedIdle / pourTea / signContract）放椅子 + 书桌占位；handshake 放一只来客的手（灰色占位，位置跟野兽右手掌心）；
// tentacleGrab 放一个被抓的目标球（被抓住后跟着目标点走）；portraitGaze / peripheralStill 放一个注视目标小球。
function animMode() {
  const clip = (q.get('clip') ?? 'idle') as BeastClip
  const C = BEAST_CLIPS[clip]
  const opts: BeastAnimOpts = { seed: Number(q.get('seed') ?? 1) }
  if (q.get('tx') !== null) opts.target = [Number(q.get('tx')), Number(q.get('ty') ?? 1.6), Number(q.get('tz') ?? 2)]
  const seated = !!C.seated
  const wood = new THREE.MeshStandardMaterial({ color: '#3b2216', roughness: 0.9 }), leather = new THREE.MeshStandardMaterial({ color: '#4a1418', roughness: 0.6 })
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; scene.add(o); return o }
  if (seated) {
    // 椅子：座面顶 0.455 m（z −0.29 … 0.17）、靠背在身后；书桌：桌面顶 0.75 m，近边 z 0.17
    box(0.56, 0.06, 0.46, 0, 0.425, -0.06, leather); box(0.56, 0.75, 0.06, 0, 0.83, -0.33, leather)
    for (const [x, z] of [[-0.25, 0.14], [0.25, 0.14], [-0.25, -0.27], [0.25, -0.27]]) box(0.04, 0.4, 0.04, x, 0.2, z, wood)
    box(1.5, 0.04, 0.78, 0, 0.73, 0.56, wood); box(1.5, 0.3, 0.03, 0, 0.56, 0.93, wood)
    for (const x of [-0.72, 0.72]) box(0.05, 0.71, 0.74, x, 0.355, 0.56, wood)
  }
  const pale = new THREE.MeshStandardMaterial({ color: '#b9a48e', roughness: 0.7 }), sleeve = new THREE.MeshStandardMaterial({ color: '#2b3442', roughness: 0.8 })
  const guest = new THREE.Group(); guest.visible = false; scene.add(guest)
  { const palm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.085, 0.1), pale); palm.position.set(0, 0, 0.0); guest.add(palm); const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.4, 12), sleeve); arm.rotation.x = Math.PI / 2; arm.position.set(0, -0.01, 0.25); guest.add(arm) }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(clip === 'tentacleGrab' ? 0.11 : 0.04, 20, 14), new THREE.MeshStandardMaterial({ color: clip === 'tentacleGrab' ? '#5d6f86' : '#e0d27a', roughness: 0.6, emissive: clip === 'tentacleGrab' ? '#000000' : '#5a4a10' })); ball.visible = false; scene.add(ball)
  const CAM: Partial<Record<BeastClip, [number[], number[], number?]>> = {
    idle: [[1.5, 1.65, 3.4], [0, 1.15, 0.1]], talk: [[1.5, 1.65, 3.4], [0, 1.15, 0.1]], peripheralStill: [[1.5, 1.65, 3.4], [0, 1.15, 0.1]], colorFlash: [[1.3, 1.7, 3.0], [0, 1.25, 0.1]],
    seatedIdle: [[1.4, 1.65, 2.9], [0, 0.95, 0.25]], pourTea: [[0.9, 1.55, 2.0], [-0.05, 0.95, 0.3]], signContract: [[1.0, 1.6, 2.2], [0, 0.95, 0.3]],
    beckon: [[1.4, 1.6, 3.0], [0, 1.2, 0.15]], handshake: [[1.9, 1.5, 2.6], [0, 1.2, 0.25]], vanish: [[1.6, 1.6, 3.6], [0, 1.1, -0.2]],
    portraitGaze: [[0.55, 1.7, 1.5], [0, 1.6, 0.05]], doubtFreeze: [[0.9, 1.65, 2.2], [0, 1.4, 0.05]],
    reveal: [[1.9, 1.7, 3.9], [0, 1.3, 0.2], 34], tentacleGrab: [[2.6, 1.8, 4.2], [0.15, 1.25, 0.85], 40],
  }
  // &close=1：头部 / 上身近景（看色素变色）
  const CLOSE: Partial<Record<BeastClip, [number[], number[], number?]>> = {
    vanish: [[0.62, 1.74, 0.75], [0, 1.6, -0.24], 34], reveal: [[0.9, 1.95, 1.4], [0, 1.74, 0.05], 36], tentacleGrab: [[1.35, 1.85, 2.0], [0.12, 1.55, 0.55], 40],
    handshake: [[0.85, 1.7, 1.15], [0, 1.52, 0.08], 34], seatedIdle: [[0.75, 1.45, 1.2], [0, 1.25, 0.0], 32], pourTea: [[0.75, 1.45, 1.2], [0, 1.25, 0.0], 32], signContract: [[0.75, 1.45, 1.2], [0, 1.25, 0.0], 32],
  }
  let [cp, cl, cf] = q.get('close') ? (CLOSE[clip] ?? [[0.62, 1.78, 0.92], [0, 1.6, 0.02], 32]) : (CAM[clip] ?? [[1.5, 1.65, 3.4], [0, 1.15, 0.1]])
  if (q.get('cam')) cp = q.get('cam')!.split(',').map(Number)
  if (q.get('at')) cl = q.get('at')!.split(',').map(Number)
  const fov = Number(q.get('fov') ?? cf ?? 30)
  let times: number[]
  const fps = Number(q.get('fps') ?? 10)
  if (q.get('t') !== null) times = [Number(q.get('t'))]
  else if (q.get('gif')) { const n = Math.max(1, Math.round(C.dur * fps)); times = Array.from({ length: n }, (_, i) => i / fps) }
  else { const n = Number(q.get('grid') ?? 8); times = Array.from({ length: n }, (_, i) => C.loop ? (i / n) * C.dur : (i / (n - 1)) * C.dur) }
  const N = times.length, W2 = innerWidth, H2 = innerHeight
  renderer.setSize(W2, H2)
  let cols: number, rows: number
  if (q.get('gif')) { const tile = Number(q.get('tile') ?? 300); cols = Math.max(1, Math.floor(W2 / tile)); rows = Math.ceil(N / cols) }
  else { cols = Number(q.get('cols') ?? (N === 1 ? 1 : 4)); rows = Math.ceil(N / cols) }
  const tw = Math.floor(W2 / cols), th = Math.floor(H2 / rows)
  const tc = new THREE.PerspectiveCamera(fov, tw / th, 0.01, 60)
  tc.position.set(cp[0], cp[1], cp[2]); tc.lookAt(cl[0], cl[1], cl[2]); tc.updateMatrixWorld(true)
  BEAST_CHROMA.uSpecDir.value.copy(key.position).normalize().transformDirection(tc.matrixWorldInverse)
  renderer.setScissorTest(true)
  lab.innerHTML = ''
  const bare = !!q.get('gif')
  if (!bare) lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W2 / 2}px;top:6px;font-size:${N > 12 ? 13 : 17}px">第五层的野兽 · ${C.zh} (${clip}) ${C.dur}s${C.loop ? ' 循环' : ''}</div>`)
  let i = 0, maxRes = { arm: 0, leg: 0 }
  const step = () => {
    const tt = times[i]
    const P = animateBeastPreroll(rig, clip, tt, opts, clip === 'doubtFreeze' ? tt : Math.min(tt, 1.5))
    const r = beastIkResidual(); maxRes = { arm: Math.max(maxRes.arm, r.arm), leg: Math.max(maxRes.leg, r.leg) }
    man.updateMatrixWorld(true)
    guest.visible = clip === 'handshake' && tt > 0.95 && tt < 2.9
    if (guest.visible) guest.position.copy(beastPalmPoint(rig, -1, 0.3)).add(new THREE.Vector3(0.035, 0, 0.01))
    ball.visible = clip === 'tentacleGrab' ? tt < 3.0 : (clip === 'portraitGaze' || clip === 'peripheralStill') && !!opts.target
    if (clip === 'tentacleGrab') ball.position.set(...(P.grab.held ? P.grab.T : (opts.target ?? BEAST_GRAB_DEFAULT)))
    else if (opts.target) ball.position.set(...opts.target)
    if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
    const c = i % cols, rr = Math.floor(i / cols)
    renderer.setViewport(c * tw, H2 - (rr + 1) * th, tw, th); renderer.setScissor(c * tw, H2 - (rr + 1) * th, tw, th)
    renderer.render(scene, tc)
    if (N > 1 && !bare) lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${c * tw + tw / 2}px;top:${rr * th + th - 20}px;font-size:12px">${tt.toFixed(2)}s${P.form > 0.01 && P.form < 0.99 ? ' · 形态 ' + P.form.toFixed(2) : ''}${P.fade < 0.99 ? ' · 不透明 ' + P.fade.toFixed(2) : ''}</div>`)
    if (++i < N) setTimeout(step, 0)
    else { (window as any).__info = { clip, cols, rows, frames: N, fps, dur: C.dur, tw, th, res: maxRes }; (window as any).__ready = true }
  }
  setTimeout(step, 0)
}
