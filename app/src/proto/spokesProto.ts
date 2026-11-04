// [spokes] 迎宾女郎（Entity 28）阶段 1 建模预览：
// proto-spokes.html?view=three|front|side|back|head|headq|headside|headback|neck|plaid|hands|cross|crossside|tpose|apose|ref|props|windup|lod1|lod2
//   [&lod=0..2][&cpu=1][&pose=rest|A|T|cross][&headturn=rad][&cam=x,y,z&at=x,y,z&fov=][&label=][&bg=][&hide=meshName,…]
//   ref：附图同款（双臂交叉、头转向她的右侧、暖色书房光）竖构图；props：道具一格（海报 / 发条兔 / 铭牌 / 收音机 / 投递洞 / 领口音箱特写）
//   window.__ready / __info（tris、生成耗时、身高 h 等）同野兽预览
import * as THREE from 'three'
import { buildSpokes, spokesTris, setSpokesPose, SPOKES_SPEC, type SpokesRig, type SpokesPose } from '../game/renderer/spokesMesh'
import { buildSpokesPoster, buildWindupRabbit, buildNameplate, buildRadio, buildPosterDrops, buildCollarSpeaker } from '../game/renderer/spokesProps'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'
import { setMaterialMode } from '../game/renderer/shared'
import { SPOKES_CLIPS, SPOKES_SEAT_Y, SPOKES_DESK_Y, SPOKES_DESK_Z, SPOKES_DRAW_DESK_Z, SPOKES_DROP_HOLE, WINDUP_CLIPS, animateSpokesPreroll, animateSpokes, animateWindupRabbit, resetSpokesDynamics, spokesIkResidual, spokesPinchPoint, spokesRootMotion, type SpokesClip, type WindupClip } from '../game/renderer/spokesAnim'
const q = new URLSearchParams(location.search)
const view = q.get('view') ?? 'three'
const lod = Number(q.get('lod') ?? (view === 'lod1' ? 1 : view === 'lod2' ? 2 : 0))
if (q.get('real') === '1') setMaterialMode('realistic')
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!q.get('anim') }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)
const warm = view === 'ref'
const scene = new THREE.Scene(); scene.background = new THREE.Color(q.get('bg') ?? (warm ? '#3a2616' : '#3a3833'))
const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshStandardMaterial({ color: warm ? '#4a3020' : '#3d3328', roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor)
const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), new THREE.MeshStandardMaterial({ color: warm ? '#5a3a22' : '#4d4a40', roughness: 1 })); wall.position.set(0, 3, -2.6); wall.receiveShadow = true; scene.add(wall)
const lab = document.getElementById('lab')!
scene.add(new THREE.HemisphereLight(warm ? '#ffe2b8' : '#fff3dc', '#3a2a1a', warm ? 1.0 : 1.15))
const key = new THREE.DirectionalLight(warm ? '#ffd9a8' : '#ffeed6', warm ? 2.6 : 2.4); key.position.set(warm ? -2.4 : 2.2, 3.2, 3.2); key.castShadow = true; key.shadow.mapSize.set(2048, 2048)
Object.assign(key.shadow.camera, { left: -1.6, right: 1.6, top: 2.4, bottom: -0.3, near: 0.1, far: 12 }); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.01; scene.add(key)
const fill = new THREE.DirectionalLight('#d8e4ff', warm ? 0.5 : 0.8); fill.position.set(warm ? 3 : -3, 1.6, 1.4); scene.add(fill)
const rim = new THREE.DirectionalLight('#fff0dc', 0.9); rim.position.set(-1, 2.5, -3); scene.add(rim)

const t0 = performance.now()
const man = buildSpokes({ lod }); man.rotation.set(0, 0, 0)
const genMs = performance.now() - t0
const t1 = performance.now(); if (!q.get('anim')) buildSpokes({ lod }); const instMs = performance.now() - t1
const rig = man.userData.spokes as SpokesRig
const stats = man.userData.spokesStats as Record<string, number>
scene.add(man)
for (const nm of (q.get('hide') ?? '').split(',').filter(Boolean)) man.traverse((o) => { if (o.name === nm) o.visible = false })
const POSE: Record<string, SpokesPose> = { cross: 'cross', crossside: 'cross', ref: 'cross', tpose: 'T', apose: 'A', hands: 'cross' }
const pose = (q.get('pose') as SpokesPose) ?? POSE[view] ?? 'rest'
setSpokesPose(rig, pose)
const ht = Number(q.get('headturn') ?? (view === 'ref' ? -1.0 : 0))
if (ht) { rig.neck.rotation.y = ht * 0.35; rig.head.rotation.y = ht * 0.65; rig.head.rotation.x = view === 'ref' ? 0.04 : 0 }
const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 80)
const VW: Record<string, [number[], number[], number?]> = {
  front: [[0, 1.05, 5.2], [0, 0.98, 0]], side: [[5.2, 1.05, 0], [0, 0.98, 0]], back: [[-0.6, 1.15, -5.0], [0, 0.98, 0]], three: [[2.8, 1.5, 4.0], [0, 0.98, 0]],
  lod1: [[2.8, 1.5, 4.0], [0, 0.98, 0]], lod2: [[2.8, 1.5, 4.0], [0, 0.98, 0]], cross: [[1.2, 1.35, 3.1], [0, 1.1, 0]], crossside: [[3.0, 1.3, 0.9], [0, 1.1, 0.05]],
  tpose: [[0, 1.1, 5.4], [0, 1.0, 0]], apose: [[0, 1.1, 5.2], [0, 1.0, 0]],
  head: [[0, 1.64, 1.05], [0, 1.645, 0.02]], headq: [[0.72, 1.72, 0.82], [0, 1.66, 0.02]], headside: [[1.05, 1.655, 0.03], [0, 1.655, 0.02]], headback: [[-0.55, 1.85, -0.85], [0, 1.68, -0.03]],
  neck: [[0.42, 1.5, 0.62], [0, 1.47, 0.03], 26], collar: [[0.3, 1.36, 1.05], [0, 1.28, 0.05], 30], plaid: [[0.35, 1.2, 0.75], [0.03, 1.14, 0.08], 30], hands: [[0.35, 1.25, 1.1], [0, 1.08, 0.12], 30],
  ref: [[-0.3, 1.47, 1.62], [-0.02, 1.4, 0.0], 34],
}
let [p, l, fv] = VW[view] ?? VW.three
if (q.get('cam')) p = q.get('cam')!.split(',').map(Number)
if (q.get('at')) l = q.get('at')!.split(',').map(Number)
cam.fov = Number(q.get('fov') ?? fv ?? 30); cam.updateProjectionMatrix()
cam.position.set(p[0], p[1], p[2]); cam.lookAt(l[0], l[1], l[2])
man.updateMatrixWorld(true)
const tm = spokesTris(man)
// 道具一格：人隐藏，摆一张桌子 + 墙
if (view === 'props' || view === 'windup') {
  man.visible = false
  const wood = new THREE.MeshStandardMaterial({ color: '#4a2a18', roughness: 0.55 })
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.7), wood); desk.position.set(0.15, 0.74, 0.1); desk.receiveShadow = true; desk.castShadow = true; scene.add(desk)
  const deskF = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 0.04), wood); deskF.position.set(0.15, 0.37, 0.43); scene.add(deskF)
  wall.position.z = -0.4
  const np = buildNameplate(); np.position.set(-0.32, 0.765, 0.28); np.rotation.y = 0.25; scene.add(np)
  const radio = buildRadio(); radio.position.set(0.55, 0.765, -0.05); radio.rotation.y = -0.35; scene.add(radio)
  const rab = buildWindupRabbit(); rab.position.set(0.12, 0.765, 0.22); rab.rotation.y = 0.75; scene.add(rab)
  const poster = buildSpokesPoster(); poster.position.set(-0.55, 1.05, -0.385); scene.add(poster)
  const drops = buildPosterDrops(); drops.position.set(0.5, 0.95, -0.4); drops.scale.setScalar(0.85); scene.add(drops)
  const spk = buildCollarSpeaker(); spk.scale.setScalar(3); spk.position.set(-0.05, 0.8, 0.32); spk.rotation.set(-0.5, 0.3, 0); scene.add(spk)
  if (view === 'windup') { cam.position.set(0.62, 1.0, 0.72); cam.lookAt(0.12, 0.83, 0.22); cam.fov = 28; cam.updateProjectionMatrix() }
  else {
    // 竖构图（汇总表格子 560×620）时保持横向取景不变、上下多露墙 / 桌面，不再留白边
    cam.position.set(0.05, 1.32, 1.85); cam.lookAt(0.05, 1.0, 0.0)
    const asp = W / H, ref = 1300 / 900
    cam.fov = asp < ref ? (2 * Math.atan(Math.tan((20 * Math.PI) / 180) * ref / asp) * 180) / Math.PI : 40; cam.updateProjectionMatrix()
  }
  key.position.set(1.2, 3, 2.5); key.shadow.camera.updateProjectionMatrix()
}
if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
cam.updateMatrixWorld(true)
SPOKES_SPEC.uSpecDir.value.copy(key.position).normalize().transformDirection(cam.matrixWorldInverse)
const box = new THREE.Box3()
man.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.userData.cpuSkin && m.visible) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld)) } })
if (box.isEmpty()) box.setFromObject(man)
const title = `迎宾女郎 Entity 28 · 阶段 1 · ${q.get('label') ?? view}${lod ? ' · LOD' + lod : ''}`
const sub = `${tm.tris} 三角形（壳层毛 ${tm.fur}、耳 / 眼 / 胡须 / 小件 ${tm.small}）/ ${tm.meshes} 网格 · 高 ${box.max.y.toFixed(2)} m · 生成 ${genMs.toFixed(0)} ms（第二个实例 ${instMs.toFixed(0)} ms）${QA_CPU_SKIN ? ' · CPU 蒙皮' : ''}`
;(window as any).__info = { tm, genMs: Math.round(genMs), instMs: Math.round(instMs), stats, h: +box.max.y.toFixed(3), w: +(box.max.x - box.min.x).toFixed(3), d: +(box.max.z - box.min.z).toFixed(3) }
if (view !== 'ref' && !q.get('nolabel')) lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:8px">${title}<br><span class="s">${sub}</span></div>`)
let n = 0; const loop = () => {
  if (q.get('anim')) { animMode(); return }
  if (renderer.domElement.width !== innerWidth || renderer.domElement.height !== innerHeight) { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); n = 0 }
  if (QA_CPU_SKIN) syncSceneCpuSkins(scene); renderer.render(scene, cam); if (++n < 10) requestAnimationFrame(loop); else (window as any).__ready = true
}; loop()


// ---------- 阶段 2 动画预览 ----------
// ?anim=1&clip=X[&t=秒]                 单帧
//   [&ts=0.5,1.2,…&cols=C]               指定时刻网格（汇总图用，不标字）；[&grid=N] N 帧均分网格（标时间）
//   [&gif=1&fps=8&tile=320&th=400]       全部帧（连续推进二阶）铺满窗口，供 GIF 切帧（不标字）
//   [&cam=x,y,z&at=x,y,z&fov=]
// clip = rabbitHop / rabbitStop：只看发条兔（近景）。walk / guidePoint / sitDesk 地面换棋盘格（看脚有没有滑），相机跟着根运动走。
// 坐姿片段 / drawPoster 放椅子 + 书桌；dropPoster 放墙上投递洞；shoulderTap 放一只老板的手（深色袖 + 灰手）。
function animMode() {
  const clipS = q.get('clip') ?? 'idle'
  const isRabbit = clipS === 'rabbitHop' || clipS === 'rabbitStop'
  const clip = clipS as SpokesClip, rclip = clipS as WindupClip
  const C = isRabbit ? WINDUP_CLIPS[rclip] : SPOKES_CLIPS[clip]
  const opts = { seed: Number(q.get('seed') ?? 1) }
  const wood = new THREE.MeshStandardMaterial({ color: '#4a2a18', roughness: 0.7 }), leather = new THREE.MeshStandardMaterial({ color: '#3a1a14', roughness: 0.55 })
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; scene.add(o); return o }
  const move = clip === 'walk' || clip === 'guidePoint' || isRabbit
  if (move || clip === 'sitDesk' || clip === 'windRabbit') {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { g.fillStyle = (i + j) % 2 ? '#5a4632' : '#3b2d20'; g.fillRect(i * 32, j * 32, 32, 32) }
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(isRabbit ? 32 : 8, isRabbit ? 32 : 8)
    floor.material = new THREE.MeshStandardMaterial({ map: tx, roughness: 1 })
  }
  if (C && (('seated' in C && C.seated) || clip === 'drawPoster')) {
    const sy = SPOKES_SEAT_Y, dy = SPOKES_DESK_Y
    if (clip !== 'drawPoster') {
      box(0.5, 0.06, 0.44, 0, sy - 0.03, -0.08, leather); box(0.5, 0.62, 0.06, 0, sy + 0.32, -0.33, leather)
      for (const [x, z] of [[-0.22, 0.1], [0.22, 0.1], [-0.22, -0.26], [0.22, -0.26]]) box(0.035, sy - 0.06, 0.035, x, (sy - 0.06) / 2, z, wood)
    }
    const dz = (clip === 'drawPoster' ? SPOKES_DRAW_DESK_Z : SPOKES_DESK_Z) + 0.35
    box(1.4, 0.04, 0.7, 0, dy - 0.02, dz, wood)
    for (const x of [-0.66, 0.66]) for (const z of [dz - 0.31, dz + 0.31]) box(0.04, dy - 0.04, 0.04, x, (dy - 0.04) / 2, z, wood)
    box(1.36, 0.1, 0.02, 0, dy - 0.09, dz + 0.33, wood)
  }
  if (clip === 'dropPoster') {
    const d = buildPosterDrops(); d.rotation.y = Math.PI; d.position.set(SPOKES_DROP_HOLE[0] - 0.21, SPOKES_DROP_HOLE[1] - 0.31, SPOKES_DROP_HOLE[2] + 0.036); scene.add(d)
    wall.position.set(0, 3, SPOKES_DROP_HOLE[2] + 0.04); wall.rotation.y = Math.PI
  }
  const boss = new THREE.Group(); boss.visible = false; scene.add(boss)
  if (clip === 'shoulderTap') {
    // 老板的手：手掌盖在她右肩上（手指朝前），袖子从她身后上方伸过来
    const dir = new THREE.Vector3(-0.15, 0.5, -1).normalize()
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.5, 12), new THREE.MeshStandardMaterial({ color: '#1e1f24', roughness: 0.7 })); sl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); sl.position.copy(dir.clone().multiplyScalar(0.3)); boss.add(sl)
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.028, 0.13), new THREE.MeshStandardMaterial({ color: '#8f8a84', roughness: 0.6 })); hand.position.set(0, 0, 0.0); boss.add(hand)
    for (let f = 0; f < 4; f++) { const fg = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.05, 3, 6), hand.material); fg.rotation.x = Math.PI / 2 + 0.5; fg.position.set(-0.03 + f * 0.02, -0.015, 0.085); boss.add(fg) }
  }
  let rabbit: THREE.Group | null = null
  if (isRabbit) { man.visible = false; rabbit = buildWindupRabbit(); scene.add(rabbit) }
  const CAM: Record<string, [number[], number[], number?]> = {
    idle: [[1.2, 1.35, 3.9], [0, 1.0, 0.05]], greetSpin: [[1.3, 1.3, 4.3], [0, 1.02, 0.05], 32], bowInvite: [[2.4, 1.4, 3.2], [-0.1, 1.0, 0.1], 32],
    speakerTalk: [[0.9, 1.55, 2.1], [0, 1.35, 0.05], 30], innerFreeze: [[1.6, 1.7, 1.6], [0, 1.45, -0.03], 30], drawPoster: [[2.1, 1.75, 2.0], [0.0, 0.95, 0.35], 32],
    dropPoster: [[2.4, 1.55, -1.5], [0.05, 0.98, 0.2], 40], windRabbit: [[1.9, 1.15, 2.4], [-0.1, 0.72, 0.25], 42], walk: [[3.4, 1.2, 1.2], [0, 0.95, 0.2], 32],
    guidePoint: [[3.1, 1.45, -0.75], [0, 0.95, 0.4], 38], sitDesk: [[-1.4, 1.5, 2.9], [0.3, 0.8, 0.1], 36], seatedIdle: [[2.2, 1.45, 2.2], [0, 0.85, 0.15], 32],
    shoulderTap: [[-1.1, 1.65, 2.5], [0, 1.3, 0.0], 30], photoRecall: [[1.3, 1.5, 2.4], [0, 1.2, 0.05], 30],
    rabbitHop: [[0.75, 0.32, 0.55], [0, 0.07, 0.05], 30], rabbitStop: [[0.62, 0.3, 0.6], [0, 0.08, 0.0], 30],
  }
  let [cp, cl, cf] = CAM[clipS] ?? CAM.idle
  if (q.get('cam')) cp = q.get('cam')!.split(',').map(Number)
  if (q.get('at')) cl = q.get('at')!.split(',').map(Number)
  const fov = Number(q.get('fov') ?? cf ?? 30)
  const fps = Number(q.get('fps') ?? 8)
  let times: number[]
  const gifM = !!q.get('gif')
  if (q.get('t') !== null) times = [Number(q.get('t'))]
  else if (q.get('ts')) times = q.get('ts')!.split(',').map(Number)
  else if (gifM) { const n = Math.max(1, Math.round(C.dur * Number(q.get('reps') ?? 1) * fps)); times = Array.from({ length: n }, (_, i) => i / fps) }
  else { const n = Number(q.get('grid') ?? 8); times = Array.from({ length: n }, (_, i) => (C.loop ? (i / n) * C.dur : (i / (n - 1)) * C.dur)) }
  const N = times.length, W2 = innerWidth, H2 = innerHeight
  renderer.setSize(W2, H2)
  let cols: number, rows: number
  if (gifM) { const tile = Number(q.get('tile') ?? 320); cols = Math.max(1, Math.floor(W2 / tile)); rows = Math.ceil(N / cols) }
  else { cols = Number(q.get('cols') ?? (N === 1 ? 1 : 4)); rows = Math.ceil(N / cols) }
  const tw = Math.floor(W2 / cols), th = Math.floor(H2 / rows)
  const tc = new THREE.PerspectiveCamera(fov, tw / th, 0.01, 60)
  const setCam = (dz: number) => { tc.position.set(cp[0], cp[1], cp[2] + dz); tc.lookAt(cl[0], cl[1], cl[2] + dz); tc.updateMatrixWorld(true) }
  setCam(0)
  SPOKES_SPEC.uSpecDir.value.copy(key.position).normalize().transformDirection(tc.matrixWorldInverse)
  key.shadow.camera.left = -2.5; key.shadow.camera.right = 2.5; key.shadow.camera.top = 2.6; key.shadow.camera.far = 14; key.shadow.camera.updateProjectionMatrix()
  renderer.setScissorTest(true)
  lab.innerHTML = ''
  const bare = gifM || !!q.get('ts')
  if (!bare) lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W2 / 2}px;top:6px;font-size:${N > 12 ? 13 : 17}px">迎宾女郎 · ${C.zh} (${clipS}) ${C.dur}s${C.loop ? ' 循环' : ''}</div>`)
  let i = 0, maxRes = { arm: 0, leg: 0 }
  // gif：连续推进（1/60 s），到帧时刻就渲染；循环片段先空跑 1 s 让二阶稳定
  let simT = C.loop ? -1.0 : 0
  if (gifM && !isRabbit) { resetSpokesDynamics(rig) }
  const step = () => {
    const tt = times[i]
    let dz = 0
    if (isRabbit) {
      animateWindupRabbit(rabbit!, rclip, tt)
      dz = rclip === 'rabbitHop' ? WINDUP_CLIPS.rabbitHop.speed * tt : 0
      rabbit!.position.set(0, 0, dz)
    } else if (gifM) {
      const h = 1 / 60
      while (simT <= tt + 1e-6) { animateSpokes(rig, clip, simT, { ...opts, time: simT, dt: simT === (C.loop ? -1.0 : 0) ? undefined : h }); simT += h }
    } else animateSpokesPreroll(rig, clip, tt, opts, Math.min(C.loop ? 1.0 : tt, 1.5))
    if (!isRabbit) {
      const r = spokesIkResidual(); maxRes = { arm: Math.max(maxRes.arm, r.arm), leg: Math.max(maxRes.leg, r.leg) }
      if (move) { dz = spokesRootMotion(clip, 0, tt)[1]; man.position.z = dz }
      man.updateMatrixWorld(true)
    }
    if (clip === 'shoulderTap') {
      const k = Math.min(1, Math.max(0, (tt - 0.25) / 0.25)) * (1 - Math.min(1, Math.max(0, (tt - 3.4) / 0.4)))
      boss.visible = k > 0.01
      boss.position.set(-0.13, 1.375 + 0.12 * (1 - k), -0.03 - 0.3 * (1 - k)); boss.rotation.set(0.15, 0, 0)
    }
    if (move || isRabbit) setCam(dz)
    if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
    const c = i % cols, rr = Math.floor(i / cols)
    renderer.setViewport(c * tw, H2 - (rr + 1) * th, tw, th); renderer.setScissor(c * tw, H2 - (rr + 1) * th, tw, th)
    renderer.render(scene, tc)
    if (N > 1 && !bare) lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${c * tw + tw / 2}px;top:${rr * th + th - 20}px;font-size:12px">${tt.toFixed(2)}s</div>`)
    if (++i < N) setTimeout(step, 0)
    else {
      const dbg: Record<string, number[]> = {}
      if (!isRabbit) { const pl = spokesPinchPoint(rig, 1), pr = spokesPinchPoint(rig, -1); dbg.pinchL = pl.toArray().map((v) => +v.toFixed(3)); dbg.pinchR = pr.toArray().map((v) => +v.toFixed(3)); man.traverse((o) => { if (o.name === 'spokesPhoto' && o.visible) dbg.photo = o.position.toArray().map((v) => +v.toFixed(3)) }) }
      ;(window as any).__info = { clip: clipS, cols, rows, frames: N, fps, dur: C.dur, loop: C.loop, tw, th, res: maxRes, times, dbg }; (window as any).__ready = true
    }
  }
  setTimeout(step, 0)
}
