// [chef] 厨师（Entity 800）阶段 1 建模预览：
// proto-chef.html?view=three|front|side|back|head|headq|headside|hands|props|ref|weapon|lod1|lod2|blood0|blood1
//   [&lod=0..2][&cpu=1][&pose=rest|hold|hands|weapon][&blood=0..1][&cam=x,y,z&at=x,y,z&fov=][&label=][&bg=][&hide=meshName,…][&nolab=1]
//   ref：附图同款（左手捧紫甘蓝、低头、暗红餐厅暖光）竖构图；props：道具一格（汤锅 / 炖锅 / 雕刻刀 / 汤勺 / 紫甘蓝 / 肉块 / 手铐铁管 / 档案员相机 / 胸麦）
//   window.__ready / __info（tris、生成耗时、身高 h 等）同野兽 / 迎宾女郎预览
// 阶段 2 动画：?anim=1&clip=X[&t=秒] / [&ts=…&cols=C] / [&grid=N] / [&gif=1&fps=10&tile=480&reps=N]（见文件末 animMode）
import * as THREE from 'three'
import { buildChef, chefTris, setChefPose, setChefBlood, CHEF_UNI, type ChefRig, type ChefPose } from '../game/renderer/chefMesh'
import { buildChefPot, buildStewCauldron, buildCarvingKnife, buildLadle, buildRedCabbage, buildMeatChunk, buildCuffsPipe, buildArchivistCamera, buildChestMic } from '../game/renderer/chefProps'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'
import { setMaterialMode } from '../game/renderer/shared'
import { CHEF_CLIPS, CHEF_STOVE, CHEF_CAULDRON, CHEF_TABLE, CHEF_SEAT, CHEF_DOOR, CHEF_KNIFE_WALL, CHEF_WALL_KNIFE_GRIP, animateChef, animateChefPreroll, resetChefDynamics, chefIkResidual, chefRootMotion, type ChefClip } from '../game/renderer/chefAnim'
const q = new URLSearchParams(location.search)
const view = q.get('view') ?? 'three'
const lod = Number(q.get('lod') ?? (view === 'lod1' ? 1 : view === 'lod2' ? 2 : 0))
if (q.get('real') === '1') setMaterialMode('realistic')
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!q.get('anim') }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)
const moody = view === 'ref'
// 暗红餐厅色调：酒红天鹅绒墙、深色木地板、暖光
const scene = new THREE.Scene(); scene.background = new THREE.Color(q.get('bg') ?? (moody ? '#1c0705' : '#2a0e0b'))
const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshStandardMaterial({ color: '#2e1c13', roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor)
const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), new THREE.MeshStandardMaterial({ color: moody ? '#3e100b' : '#5a1912', roughness: 1 })); wall.position.set(0, 3, -2.4); wall.receiveShadow = true; scene.add(wall)
// 护墙板
const wains = new THREE.Mesh(new THREE.BoxGeometry(16, 0.9, 0.04), new THREE.MeshStandardMaterial({ color: '#2a140c', roughness: 0.7 })); wains.position.set(0, 0.45, -2.38); scene.add(wains)
const lab = document.getElementById('lab')!
scene.add(new THREE.HemisphereLight(moody ? '#d9b8a0' : '#ffe6c8', '#3a1408', moody ? 0.6 : 1.15))
const key = new THREE.DirectionalLight(moody ? '#ffe0c4' : '#ffead2', moody ? 1.8 : 2.5); key.position.set(moody ? -1.6 : 2.2, 3.2, 3.0); key.castShadow = true; key.shadow.mapSize.set(2048, 2048)
Object.assign(key.shadow.camera, { left: -1.6, right: 1.6, top: 2.6, bottom: -0.3, near: 0.1, far: 12 }); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.01; scene.add(key)
const fill = new THREE.DirectionalLight(moody ? '#d06a3a' : '#e8d8ff', moody ? 0.6 : 0.75); fill.position.set(moody ? 2.6 : -3, 1.4, 1.4); scene.add(fill)
const rim = new THREE.DirectionalLight(moody ? '#ff8a4a' : '#ffe2c4', moody ? 1.1 : 0.9); rim.position.set(1.2, 2.6, -3); scene.add(rim)

const blood = q.get('blood') !== null ? Number(q.get('blood')) : view === 'blood0' ? 0 : view === 'blood1' ? 1 : 0.55
const t0 = performance.now()
const man = buildChef({ lod }); man.rotation.set(0, 0, 0)
const genMs = performance.now() - t0
const t1 = performance.now(); if (!q.get('anim')) buildChef({ lod }); const instMs = performance.now() - t1
const rig = man.userData.chef as ChefRig
const stats = man.userData.chefStats as Record<string, number>
setChefBlood(rig, blood)
scene.add(man)
for (const nm of (q.get('hide') ?? '').split(',').filter(Boolean)) man.traverse((o) => { if (o.name === nm) o.visible = false })
const POSE: Record<string, ChefPose> = { ref: 'hold', hands: 'hands', weapon: 'weapon' }
const pose = (q.get('pose') as ChefPose) ?? POSE[view] ?? 'rest'
setChefPose(rig, pose)
if (view === 'rigtest') {
  // 专有骨骼权重自检：肚子前推放大、双下巴下坠、下颌张开、两耳竖起 / 折下、帽子后仰
  rig.belly.position.z += 0.05; rig.belly.scale.setScalar(1.12); rig.chin.position.y -= 0.02; rig.jaw.rotation.x = 0.35
  rig.earL[0].rotation.z = 0.4; rig.earL[2].rotation.x = -0.8; rig.earR[0].rotation.z = -0.25; rig.earR[2].rotation.x = 0.6; rig.hat.rotation.x = -0.25
}
if (view === 'ref') { rig.neck.rotation.set(0.2, -0.12, 0); rig.head.rotation.set(0.36, -0.22, 0.05); rig.chest.rotation.y = -0.1 }
const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 80)
const VW: Record<string, [number[], number[], number?]> = {
  front: [[0, 1.12, 5.6], [0, 1.03, 0]], side: [[5.6, 1.12, 0], [0, 1.03, 0]], back: [[-0.6, 1.2, -5.4], [0, 1.03, 0]], three: [[3.0, 1.55, 4.4], [0, 1.03, 0]],
  lod1: [[3.0, 1.55, 4.4], [0, 1.03, 0]], lod2: [[3.0, 1.55, 4.4], [0, 1.03, 0]], blood0: [[2.2, 1.4, 4.6], [0, 1.03, 0]], blood1: [[2.2, 1.4, 4.6], [0, 1.03, 0]],
  head: [[0, 1.72, 1.35], [0, 1.72, 0.05]], headq: [[0.85, 1.8, 1.05], [0, 1.72, 0.04]], headside: [[1.38, 1.7, 0.06], [0, 1.7, 0.06]], headback: [[-0.6, 1.95, -1.0], [0, 1.75, -0.03]],
  hands: [[0.35, 1.32, 1.3], [0, 1.22, 0.3], 30], rigtest: [[1.6, 1.5, 2.2], [0, 1.35, 0.05], 32], weapon: [[1.8, 1.55, 3.0], [-0.1, 1.25, 0.05], 34],
  ref: [[-0.34, 1.42, 1.28], [-0.04, 1.47, 0.08], 50],
}
let [p, l, fv] = VW[view] ?? VW.three
if (q.get('cam')) p = q.get('cam')!.split(',').map(Number)
if (q.get('at')) l = q.get('at')!.split(',').map(Number)
cam.fov = Number(q.get('fov') ?? fv ?? 30); cam.updateProjectionMatrix()
cam.position.set(p[0], p[1], p[2]); cam.lookAt(l[0], l[1], l[2])
man.updateMatrixWorld(true)
const tm = chefTris(man)
if (view === 'back' || view === 'headback') { wall.position.z = 2.4; wall.rotation.y = Math.PI; wains.position.z = 2.38 }
if (view === 'props') {
  man.visible = false
  const wood = new THREE.MeshStandardMaterial({ color: '#3a2014', roughness: 0.55 })
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.9), wood); desk.position.set(0.0, 0.74, 0.0); desk.receiveShadow = true; desk.castShadow = true; scene.add(desk)
  wall.position.z = -0.6; wains.position.z = -0.58
  const put = (o: THREE.Object3D, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1) => { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.setScalar(s); o.traverse((m) => { (m as THREE.Mesh).castShadow = true }); scene.add(o); return o }
  put(buildStewCauldron(), -0.55, 0.765, -0.2, 0, 0.3, 0, 0.8)
  put(buildChefPot(), 0.05, 0.78, 0.1, -Math.PI / 2, 0.2, 0) // 握点在原点、锅在 +Y：放倒在桌上
  put(buildCarvingKnife(), 0.5, 0.772, 0.26, -Math.PI / 2, 0, 0.6)
  put(buildLadle(), 0.72, 0.78, 0.08, -Math.PI / 2, 0, -0.4)
  put(buildRedCabbage(), 0.32, 0.84, -0.18)
  put(buildMeatChunk(), 0.62, 0.8, -0.2, 0, 0.8)
  put(buildCuffsPipe(), 0.25, 1.22, -0.54, 0, 0, 0, 0.75)
  put(buildArchivistCamera(), -0.35, 0.765, 0.3, 0, 0.5)
  put(buildChestMic(), -0.08, 0.77, 0.36, -Math.PI / 2, 0, 0.3, 2.2)
  const asp = W / H
  cam.position.set(0.0, 1.85, 2.3); cam.lookAt(0.05, 0.92, -0.08)
  cam.fov = asp < 1.2 ? 42 : 34; cam.updateProjectionMatrix()
  key.position.set(1.0, 3, 2.4); key.shadow.camera.updateProjectionMatrix()
}
if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
cam.updateMatrixWorld(true)
CHEF_UNI.uSpecDir.value.copy(key.position).normalize().transformDirection(cam.matrixWorldInverse)
const box = new THREE.Box3()
man.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.userData.cpuSkin && m.visible) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld)) } })
if (box.isEmpty()) box.setFromObject(man)
const title = `厨师 Entity 800 · 阶段 1 · ${q.get('label') ?? view}${lod ? ' · LOD' + lod : ''} · 血量 ${blood.toFixed(2)}`
const sub = `${tm.tris} 三角形（猪鬃壳层 ${tm.fur}、眼 / 道具 ${tm.small}）/ ${tm.meshes} 网格 · 高 ${box.max.y.toFixed(2)} m · 生成 ${genMs.toFixed(0)} ms（第二个实例 ${instMs.toFixed(0)} ms）${QA_CPU_SKIN ? ' · CPU 蒙皮' : ''}`
;(window as any).__info = { tm, genMs: Math.round(genMs), instMs: Math.round(instMs), stats, h: +box.max.y.toFixed(3), w: +(box.max.x - box.min.x).toFixed(3), d: +(box.max.z - box.min.z).toFixed(3), zMax: +box.max.z.toFixed(3) }
if (!q.get('nolab') && !moody) lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:8px">${title}<br><span class="s">${sub}</span></div>`)
let n = 0; const loop = () => {
  if (q.get('anim')) { animMode(); return }
  if (renderer.domElement.width !== innerWidth || renderer.domElement.height !== innerHeight) { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); n = 0 }
  if (QA_CPU_SKIN) syncSceneCpuSkins(scene); renderer.render(scene, cam); if (++n < 10) requestAnimationFrame(loop); else (window as any).__ready = true
}; loop()


// ---------- 阶段 2 动画预览 ----------
// ?anim=1&clip=X[&t=秒]                 单帧
//   [&ts=0.5,1.2,…&cols=C]               指定时刻网格（汇总图用，不标字）；[&grid=N] N 帧均分网格（标时间）
//   [&gif=1&fps=10&tile=480&reps=N]      全部帧（连续推进二阶）铺满窗口，供 GIF 切帧（不标字）
//   [&cam=x,y,z&at=x,y,z&fov=]
// 家具按 chefAnim 的摆放常量放：灶台 + 炖锅（idle / stoveLean / vomitPot）、餐桌（serve / tapTable）、刀墙（takeKnife）、双开门（barricade）、椅子（standFromChair）。
// 走路类片段地面换棋盘格（看脚滑不滑），相机跟根运动；vomitPot 远景背身；flashFreeze 0.3 s 打一下闪光。
function animMode() {
  const clip = (q.get('clip') ?? 'idle') as ChefClip
  const C = CHEF_CLIPS[clip]
  const opts = { seed: Number(q.get('seed') ?? 1) }
  const M = (c: string, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m })
  const wood = M('#4a2a18'), steel = M('#8d8f8f', 0.35, 0.6), dark = M('#1e1c1a', 0.6), tile = M('#cfcabb', 0.5), door = M('#5a3420', 0.6)
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; scene.add(o); return o }
  const move = !!C.speed
  if (move) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { g.fillStyle = (i + j) % 2 ? '#5a4632' : '#3b2d20'; g.fillRect(i * 32, j * 32, 32, 32) }
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(8, 8)
    floor.material = new THREE.MeshStandardMaterial({ map: tx, roughness: 1 })
  }
  if (clip === 'idle' || clip === 'stoveLean' || clip === 'vomitPot') {
    const S = CHEF_STOVE
    box(S.w, S.y - 0.03, S.d, 0, (S.y - 0.03) / 2, S.z + S.d / 2, M('#2b2b2b', 0.5, 0.3))
    box(S.w + 0.02, 0.03, S.d + 0.02, 0, S.y - 0.015, S.z + S.d / 2, steel)
    for (const x of [-0.42, 0.42]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 8, 20), dark); ring.rotation.x = Math.PI / 2; ring.position.set(x, S.y + 0.006, S.z + 0.3); scene.add(ring) }
    for (let i = 0; i < 4; i++) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 12), dark); k.rotation.x = Math.PI / 2; k.position.set(-0.3 + i * 0.2, S.y - 0.12, S.z - 0.01); scene.add(k) }
    const cau = buildStewCauldron(); cau.scale.setScalar(CHEF_CAULDRON.scale); cau.position.set(...CHEF_CAULDRON.c); cau.traverse((m) => { (m as THREE.Mesh).castShadow = true }); scene.add(cau)
    wall.position.set(0, 3, S.z + S.d + 0.05); wall.rotation.y = Math.PI; wains.position.set(0, 0.45, S.z + S.d + 0.03); wall.material = tile
  }
  if (clip === 'serve' || clip === 'tapTable') {
    const T = CHEF_TABLE, D = 0.8
    box(1.2, 0.04, D, 0, T.y - 0.02, T.z + D / 2, wood)
    box(1.24, 0.005, D + 0.04, 0, T.y + 0.0025 - 0.001, T.z + D / 2, M('#e9e1cf', 0.9))
    for (const x of [-0.56, 0.56]) for (const z of [T.z + 0.05, T.z + D - 0.05]) box(0.05, T.y - 0.04, 0.05, x, (T.y - 0.04) / 2, z, wood)
    if (clip === 'tapTable') { // 对面坐着的人：只放一把空椅子 + 一杯水
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.11, 16), new THREE.MeshStandardMaterial({ color: '#cfe3ea', roughness: 0.1, transparent: true, opacity: 0.6 })); cup.position.set(-0.05, T.y + 0.055, T.z + 0.5); scene.add(cup)
    }
  }
  if (clip === 'takeKnife') {
    const W = CHEF_KNIFE_WALL
    wall.position.set(0, 3, W.z + 0.005); wall.rotation.y = Math.PI; wall.material = tile; wains.visible = false
    box(1.3, 0.04, 0.012, 0, W.railY, W.z - 0.006, dark)
    for (const [x, s] of [[-0.42, 0.85], [-0.3, 1.0], [0.08, 0.9], [0.22, 1.1], [0.36, 0.8]]) { const k = buildCarvingKnife(); k.scale.setScalar(s); k.position.set(x, W.railY + 0.08 * s, CHEF_WALL_KNIFE_GRIP[2]); k.rotation.set(0, 0, Math.PI); scene.add(k) }
    const ld = buildLadle(); ld.position.set(0.5, W.railY + 0.1, CHEF_WALL_KNIFE_GRIP[2] - 0.01); ld.rotation.set(0, 0, Math.PI); scene.add(ld)
  }
  if (clip === 'barricade') {
    const Dz = CHEF_DOOR.z
    wall.position.set(0, 3, Dz + 0.06); wall.rotation.y = Math.PI; wains.visible = false
    for (const s of [1, -1]) {
      box(0.88, 2.1, 0.05, s * 0.445, 1.05, Dz + 0.025, door)
      box(0.6, 0.6, 0.01, s * 0.445, 1.55, Dz - 0.002, M('#2a1a10', 0.4)) // 门上的小窗（暗）
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, Dz - CHEF_DOOR.handleZ, 12), steel); h.rotation.x = Math.PI / 2; h.position.set(s * CHEF_DOOR.handleX, CHEF_DOOR.handleY, (Dz + CHEF_DOOR.handleZ) / 2); scene.add(h)
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), steel); k.position.set(s * CHEF_DOOR.handleX, CHEF_DOOR.handleY, CHEF_DOOR.handleZ); scene.add(k)
    }
    for (const x of [-0.06, 0.15, 0.4]) box(0.03, 0.05, 0.03, x, CHEF_DOOR.boltY, Dz - 0.03, dark) // 门闩卡座
  }
  if (clip === 'standFromChair') {
    const S = CHEF_SEAT, leather = M('#3a1a14', 0.55)
    box(0.62, 0.07, 0.5, 0, S.y - 0.035, S.c[2], leather)
    box(0.62, 0.6, 0.07, 0, S.y + 0.3, S.backZ + 0.035, leather)
    for (const x of [-0.27, 0.27]) for (const z of [S.c[2] + 0.2, S.c[2] - 0.2]) box(0.045, S.y - 0.07, 0.045, x, (S.y - 0.07) / 2, z, wood)
  }
  // 相机：[方向（从目标指向相机）, 目标, 距离, fov]；全身入画（竖格 480×552）
  const CAMD: Record<string, [number[], number[], number, number]> = {
    idle: [[-0.82, 0.2, 0.55], [0, 1.0, 0.4], 4.2, 34], waddle: [[0.8, 0.12, 0.6], [0, 1.0, 0.1], 4.4, 34], humWalk: [[0.75, 0.15, 0.65], [0, 1.0, 0.1], 4.4, 34],
    serve: [[-0.8, 0.22, 0.55], [0, 0.95, 0.35], 4.2, 34], earTwitch: [[0.35, 0.12, 1], [0, 1.1, 0.0], 4.2, 34], tapTable: [[-0.7, 0.2, 0.7], [-0.05, 0.95, 0.35], 4.2, 34],
    potSwing: [[0.65, 0.15, 0.75], [0, 1.1, 0.15], 4.6, 36], grabDrag: [[0.9, 0.2, 0.4], [0, 0.85, -0.45], 4.8, 36], sniffCrouch: [[0.7, 0.15, 0.7], [0, 0.85, 0.1], 4.0, 34],
    takeKnife: [[-1, 0.12, -0.35], [0, 1.15, 0.2], 4.0, 34], barricade: [[-1, 0.18, -0.3], [0, 1.05, 0.3], 4.2, 34], stuffedStagger: [[0.75, 0.15, 0.65], [0, 1.0, 0.1], 4.4, 34],
    stoveLean: [[-0.85, 0.22, 0.5], [0, 0.95, 0.4], 4.2, 34], vomitPot: [[-0.3, 0.3, -1], [0, 1.1, 0.45], 6.0, 30], flashFreeze: [[0.35, 0.1, 1], [0, 1.15, 0.05], 4.0, 34],
    standFromChair: [[0.85, 0.15, 0.55], [0, 0.85, -0.15], 4.2, 34], holdCabbage: [[-0.35, 0.1, 1], [-0.05, 1.25, 0.1], 2.6, 34],
  }
  const cd = CAMD[clip] ?? CAMD.idle
  const dn = Math.hypot(cd[0][0], cd[0][1], cd[0][2])
  const CAM: Record<string, [number[], number[], number?]> = { [clip]: [cd[1].map((v, k) => v + cd[0][k] / dn * cd[2]), cd[1], cd[3]] }
  if (clip === 'vomitPot') { scene.background = new THREE.Color('#120806') }
  let [cp, cl, cf] = CAM[clip] ?? CAM.idle
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
  if (gifM) { const tl = Number(q.get('tile') ?? 320); cols = Math.max(1, Math.floor(W2 / tl)); rows = Math.ceil(N / cols) }
  else { cols = Number(q.get('cols') ?? (N === 1 ? 1 : 4)); rows = Math.ceil(N / cols) }
  // gif：格子尺寸按 tile 定死（480 × 552），不依赖窗口高度（窗口偶尔比截图区大，按窗口算会把格子拉高、最后一行截不到）
  const tw = gifM ? Number(q.get('tile') ?? 320) : Math.floor(W2 / cols), th = gifM ? Math.round(tw * 1.15) : Math.floor(H2 / rows)
  const tc = new THREE.PerspectiveCamera(fov, tw / th, 0.01, 60)
  const setCam = (dz: number) => { tc.position.set(cp[0], cp[1], cp[2] + dz); tc.lookAt(cl[0], cl[1], cl[2] + dz); tc.updateMatrixWorld(true) }
  setCam(0)
  CHEF_UNI.uSpecDir.value.copy(key.position).normalize().transformDirection(tc.matrixWorldInverse)
  Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 2.8, bottom: -0.5, far: 14 }); key.shadow.camera.updateProjectionMatrix()
  const flash = new THREE.PointLight('#f4f6ff', 0, 12, 1.2); flash.position.set(0.9, 1.6, 2.2); scene.add(flash)
  const hemi = scene.children.find((o) => (o as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight
  const hemiI = hemi.intensity
  renderer.setScissorTest(true)
  lab.innerHTML = ''
  const bare = gifM || !!q.get('ts')
  if (!bare) lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W2 / 2}px;top:6px;font-size:${N > 12 ? 13 : 17}px">厨师 · ${C.zh} (${clip}) ${C.dur}s${C.loop ? ' 循环' : ''}${C.speed ? ' · ' + C.speed + ' m/s' : ''}</div>`)
  let i = 0, maxRes = { arm: 0, leg: 0 }
  let simT = C.loop ? -1.0 : 0
  if (gifM) resetChefDynamics(rig)
  const step = () => {
    const tt = times[i]
    if (gifM) {
      const h = 1 / 60
      while (simT <= tt + 1e-6) { animateChef(rig, clip, simT, { ...opts, time: simT, dt: simT === (C.loop ? -1.0 : 0) ? undefined : h }); simT += h }
    } else animateChefPreroll(rig, clip, tt, opts, Math.min(C.loop ? 1.0 : tt, 1.5))
    const r = chefIkResidual(); maxRes = { arm: Math.max(maxRes.arm, r.arm), leg: Math.max(maxRes.leg, r.leg) }
    let dz = 0
    if (move) { dz = chefRootMotion(clip, 0, tt)[1]; man.position.z = dz }
    man.updateMatrixWorld(true)
    if (clip === 'flashFreeze') { const f = Math.max(0, 1 - Math.abs(tt - 0.33) / 0.08); flash.intensity = 60 * f; hemi.intensity = hemiI * (1 + 2.5 * f) }
    if (move) setCam(dz)
    if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
    const c = i % cols, rr = Math.floor(i / cols)
    renderer.setViewport(c * tw, H2 - (rr + 1) * th, tw, th); renderer.setScissor(c * tw, H2 - (rr + 1) * th, tw, th)
    renderer.render(scene, tc)
    if (N > 1 && !bare) lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${c * tw + tw / 2}px;top:${rr * th + th - 20}px;font-size:12px">${tt.toFixed(2)}s</div>`)
    if (++i < N) setTimeout(step, 0)
    else { ;(window as any).__info = { clip, cols, rows, frames: N, fps, dur: C.dur, loop: C.loop, tw, th, res: maxRes, times }; (window as any).__ready = true }
  }
  setTimeout(step, 0)
}
