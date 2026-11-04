// [concierge v3 + stage 2] 看门人（Entity 131）阶段 1 细致建模预览 + 阶段 2 动画预览（?anim=1，见文件末 animMode）：
// proto-concierge.html?view=three|front|side|back|head|headq|headside|headfront|headback|arms|hands|legs|desk|scene[&lod=1][&cpu=1][&props=1][&real=1]
import * as THREE from 'three'
import { buildConciergeMesh, conciergeTris, type ConciergeRig } from '../game/renderer/conciergeMesh'
import { buildConciergeDeskMesh, buildDumbwaiterMesh } from '../game/renderer/conciergeProps'
import { CONCIERGE_CLIPS, CONCIERGE_DESK, CONCIERGE_DUMBWAITER, animateConciergePreroll, conciergeHandPoint, conciergeIkResidual, type ConciergeAnimOpts, type ConciergeClip } from '../game/renderer/conciergeAnim'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'
import { setMaterialMode } from '../game/renderer/shared'
const q = new URLSearchParams(location.search)
const view = q.get('view') ?? 'three'
const lod = Number(q.get('lod') ?? 0)
if (q.get('real') === '1') setMaterialMode('realistic')
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!q.get('anim') }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#2e231d')
const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ color: '#5a1f1a', roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor)
const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 5), new THREE.MeshStandardMaterial({ color: '#6e5438', roughness: 1 })); wall.position.set(0, 2.5, -2.4); wall.receiveShadow = true; scene.add(wall)
scene.add(new THREE.HemisphereLight('#fff3dc', '#4a2a1a', 1.25))
const key = new THREE.DirectionalLight('#ffe8c8', 2.6); key.position.set(2.2, 3.4, 3.2); key.castShadow = true; key.shadow.mapSize.set(2048, 2048)
Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2.6, bottom: -0.5, near: 0.1, far: 12 }); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.01; scene.add(key)
const fill = new THREE.DirectionalLight('#d8e0ff', 0.7); fill.position.set(-3, 1.6, 1.2); scene.add(fill)
const rim = new THREE.DirectionalLight('#ffd9a8', 0.9); rim.position.set(-1, 2.5, -3); scene.add(rim)
const lab = document.getElementById('lab')!
const t0 = performance.now()
const man = buildConciergeMesh({ lod }); man.rotation.set(0, 0, 0) // 预览：正面朝 +Z
const genMs = performance.now() - t0
const t1 = performance.now(); const man2 = q.get('anim') ? null : buildConciergeMesh({ lod }); const instMs = performance.now() - t1; void man2
const rig = man.userData.concierge as ConciergeRig
const stats = man.userData.conciergeStats as Record<string, number>
scene.add(man)
// 2.1 调试：&flat=1 本体改成浅灰无贴图（看西裤 / 关节的形变轮廓）
if (q.get('flat')) { const m = rig.body.material as THREE.MeshStandardMaterial; m.vertexColors = false; m.color.set('#b8b4ac'); m.map = null; m.needsUpdate = true }
const tm = conciergeTris(man)
const R = (b: THREE.Object3D, x: number, y: number, z: number) => b.rotation.set(x, y, z)
if (q.get('props') || view === 'scene') {
  rig.handset.visible = true; rig.key.visible = true
  // 右手举话筒到耳边（附图），左手举 437 钥匙
  R(rig.armR.clav, 0, 0, -0.12); R(rig.armR.shoulder, -0.95, 0.15, -0.42); R(rig.armR.elbow, -2.25, 0.1, 0.1); R(rig.armR.wrist, 0.2, -0.6, 0.0)
  for (const f of ['index', 'middle', 'ring', 'pinky'] as const) rig.armR.fingers[f].forEach((b, i) => b.quaternion.setFromAxisAngle(b.userData.flexAxis, [0.7, 0.9, 0.5][i]))
  rig.armR.fingers.thumb.forEach((b, i) => b.quaternion.setFromAxisAngle(b.userData.flexAxis, [0.3, 0.4, 0.3][i]))
  R(rig.armL.shoulder, -0.45, 0, 0.22); R(rig.armL.elbow, -1.35, -0.5, 0); R(rig.armL.wrist, 0.2, 0, 0.2)
  for (const f of ['ring', 'pinky'] as const) rig.armL.fingers[f].forEach((b, i) => b.quaternion.setFromAxisAngle(b.userData.flexAxis, [0.9, 1.1, 0.6][i]))
  rig.armL.fingers.index.forEach((b, i) => b.quaternion.setFromAxisAngle(b.userData.flexAxis, [0.5, 0.6, 0.3][i]))
  rig.armL.fingers.thumb.forEach((b, i) => b.quaternion.setFromAxisAngle(b.userData.flexAxis, [0.3, 0.3, 0.2][i]))
}
if (q.get('cup')) { rig.cup.visible = true }
// 阶段 2 预备检查：闭眼（眼睑骨 rotation.x = 0）、握拳（每节指骨绕 flexAxis 屈曲）、张嘴（jaw）
if (q.get('blink')) for (const e of [...rig.headEyes, ...rig.armL.eyes, ...rig.armR.eyes]) { e.lidU.rotation.x = 0; e.lidL.rotation.x = 0 }
if (q.get('fist')) for (const arm of [rig.armL, rig.armR]) for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb'] as const) arm.fingers[f].forEach((b, i) => b.quaternion.setFromAxisAngle(b.userData.flexAxis, f === 'thumb' ? [0.4, 0.6, 0.5][i] : [1.4, 1.6, 1.0][i]))
if (q.get('jaw')) rig.jaw.rotation.x = Number(q.get('jaw'))
if (q.get('headx')) rig.head.rotation.x = Number(q.get('headx'))
const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 60)
const VW: Record<string, [number[], number[]]> = {
  front: [[0, 1.15, 5.2], [0, 1.0, 0]], side: [[5.2, 1.15, 0], [0, 1.0, 0]], back: [[-0.6, 1.25, -5.0], [0, 1.0, 0]], three: [[2.8, 1.55, 4.1], [0, 1.0, 0]],
  head: [[0, 1.86, 1.05], [0, 1.78, 0.05]], headfront: [[0, 1.84, 1.05], [0, 1.78, 0.05]], headside: [[1.05, 1.84, 0.1], [0, 1.77, 0.06]], headq: [[0.72, 1.92, 0.82], [0, 1.78, 0.06]], headback: [[-0.55, 1.98, -0.75], [0, 1.8, 0]],
  arms: [[0.95, 1.2, 1.05], [0.15, 1.08, 0.0]], hands: [[0.85, 0.92, 0.62], [0.29, 0.86, 0.04]], legs: [[1.3, 0.55, 1.45], [0, 0.38, 0]],
  desk: [[2.6, 2.0, 4.2], [0, 1.1, -0.6]], scene: [[1.9, 1.75, 3.6], [0, 1.3, -0.2]], torso: [[0.5, 1.45, 1.4], [0, 1.35, 0]], collar: [[-0.25, 1.75, -0.75], [0, 1.58, -0.06]],
}
if (view === 'desk' || view === 'scene') {
  const desk = buildConciergeDeskMesh(); desk.position.set(0, 0, 0.55); scene.add(desk)
  if (view === 'desk') man.visible = false
  const dw = buildDumbwaiterMesh(); dw.position.set(-2.4, 0, -1.2); dw.rotation.y = 0.5; scene.add(dw); dw.userData.dumbwaiter.open(0.8)
  man.position.set(0, 0, -0.05)
  wall.position.z = -0.8
}
if (view === 'arms') { R(rig.armL.shoulder, -0.35, 0, 0.45); R(rig.armL.elbow, -0.5, -0.9, 0) }
let [p, l] = VW[view] ?? VW.three
if (q.get('cam')) p = q.get('cam')!.split(',').map(Number)
if (q.get('at')) l = q.get('at')!.split(',').map(Number)
if (q.get('fov')) { cam.fov = Number(q.get('fov')); cam.updateProjectionMatrix() }
cam.position.set(p[0], p[1], p[2]); cam.lookAt(l[0], l[1], l[2])
lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:8px">看门人 Entity 131 · v4 · ${q.get('label') ?? view}${lod ? ' · LOD1' : ''}<br><span class="s">本体 ${tm.tris} 三角形 + 发片 ${tm.fur} / ${tm.meshes} 网格 · 生成 ${genMs.toFixed(0)} ms（第二个实例 ${instMs.toFixed(0)} ms）${QA_CPU_SKIN ? ' · CPU 蒙皮' : ''}</span></div>`)
man.updateMatrixWorld(true)
if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
const box = new THREE.Box3().setFromObject(man)
;(window as any).__info = { tm, genMs: Math.round(genMs), instMs: Math.round(instMs), stats, h: +box.max.y.toFixed(3), w: +(box.max.x - box.min.x).toFixed(3), d: +(box.max.z - box.min.z).toFixed(3) }
if (q.get('anim')) animMode()
else { let n = 0; const loop = () => { if (QA_CPU_SKIN) syncSceneCpuSkins(scene); renderer.render(scene, cam); if (++n < 20) requestAnimationFrame(loop); else (window as any).__ready = true }; loop() }

// ---------- 阶段 2 动画预览 ----------
// ?anim=1&clip=X[&t=秒]           单帧
//   [&grid=N&cols=C]               N 帧网格（非循环含首尾，循环均分）
//   [&gif=1&fps=10&tile=300]       全部帧（按 fps）铺满窗口，供 GIF 切帧；&move=1 根位移按片段速度前进（脚锁定可见）
//   [&cam=x,y,z&at=x,y,z&fov=]     相机；默认按片段
//   [&side=L|R&target=x,y,z]        armWatch / giveKey 参数
function animMode() {
  const clip = (q.get('clip') ?? 'idle') as ConciergeClip
  const C = CONCIERGE_CLIPS[clip]
  const opts: ConciergeAnimOpts = { seed: Number(q.get('seed') ?? 1) }
  if (q.get('side')) opts.side = q.get('side') as 'L' | 'R'
  if (q.get('target')) opts.target = q.get('target')!.split(',').map(Number) as [number, number, number]
  const move = q.get('move') === '1'
  // 场景件
  const deskClips = ['idle', 'phone', 'giveKey']
  if (deskClips.includes(clip) || (clip === 'talk' && q.get('desk') === '1')) {
    if (clip === 'talk') opts.desk = true
    const desk = buildConciergeDeskMesh(); desk.position.set(...CONCIERGE_DESK.desk); scene.add(desk)
    wall.position.z = CONCIERGE_DESK.desk[2] - 1.07
  }
  if (clip === 'stuffLift' || clip === 'pullRope') {
    const dw = buildDumbwaiterMesh(); const at = clip === 'stuffLift' ? CONCIERGE_DUMBWAITER.stuff : CONCIERGE_DUMBWAITER.pull
    dw.position.set(...at); dw.rotation.y = CONCIERGE_DUMBWAITER.rotY; scene.add(dw); dw.userData.dumbwaiter.open(clip === 'stuffLift' ? 1 : 0)
  }
  const tgt = opts.target ?? (clip === 'armWatch' ? [0.35, 1.45, 2.4] : clip === 'giveKey' ? [0.12, 1.25, 0.78] : null)
  if (tgt && (clip === 'armWatch')) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff3b2f' })); m.position.set(tgt[0], tgt[1], tgt[2]); scene.add(m) }
  if (move) { // 地面棋盘格（0.25 m 一格）：支撑相的蹄相对格子不动 = 不打滑
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const cx = cv.getContext('2d')!
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { cx.fillStyle = (i + j) % 2 ? '#6b4a36' : '#3a281f'; cx.fillRect(i * 32, j * 32, 32, 32) }
    const tx = new THREE.CanvasTexture(cv); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(28, 28); tx.magFilter = THREE.NearestFilter; tx.colorSpace = THREE.SRGBColorSpace
    floor.material = new THREE.MeshStandardMaterial({ map: tx, roughness: 1 }); wall.visible = false
  }
  // 示意「人」（被捆 / 被拖 / 被塞）：几段胶囊
  let hookKey: THREE.Object3D | null = null
  if (clip === 'giveKey') { hookKey = rig.key.clone(); hookKey.visible = true; const hk = CONCIERGE_DESK.hook; hookKey.position.set(hk[0], hk[1] - 0.004, hk[2] - 0.0); hookKey.rotation.set(0, 0, -Math.PI / 2 - 0.08); scene.add(hookKey) }
  const victim = (clip === 'bind' || clip === 'drag' || clip === 'stuffLift') ? makeVictim() : null
  if (victim) scene.add(victim.g)
  const CAM: Record<string, [number[], number[], number?]> = {
    idle: [[1.6, 1.75, 2.7], [0, 1.3, 0.15]], phone: [[1.5, 1.9, 2.9], [-0.05, 1.4, 0.15]], giveKey: [[2.4, 2.0, 2.6], [0, 1.25, 0.05]],
    walk: [[4.6, 1.15, 0.2], [0, 0.95, 0.2]], run: [[4.6, 1.15, 0.2], [0, 0.9, 0.2]], armWatch: [[1.9, 1.5, 3.9], [0.15, 1.1, 0.5], 34],
    blinkTeleport: [[1.8, 1.7, 3.0], [0, 1.2, 0]], talk: [[1.9, 1.75, 2.0], [-0.05, 1.42, 0.05]], trip: [[3.4, 1.9, 3.2], [-0.25, 0.65, 0.3]],
    bind: [[2.3, 1.5, 2.5], [0, 0.6, 0.35]], drag: [[3.4, 1.4, 2.0], [0, 0.75, 0.4]], stuffLift: [[3.5, 1.6, -0.5], [0, 1.0, 0.45], 34],
    pullRope: [[2.4, 1.6, -1.4], [0, 1.35, 0.15], 34], wipeHands: [[1.2, 1.55, 1.9], [0, 1.15, 0.15]], teaBreak: [[1.25, 1.65, 1.9], [0, 1.35, 0.15]], gnawMetal: [[0.9, 1.6, 1.45], [0, 1.6, 0.1]],
  }
  let [cp, cl] = CAM[clip]
  if (q.get('cam')) cp = q.get('cam')!.split(',').map(Number)
  if (q.get('at')) cl = q.get('at')!.split(',').map(Number)
  const fov = Number(q.get('fov') ?? CAM[clip][2] ?? 30)
  // 帧时刻
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
  renderer.setScissorTest(true); renderer.autoClear = true
  lab.innerHTML = ''
  const bare = !!q.get('gif') // GIF 切帧：不画标题 / 时间
  if (!bare) lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:6px;font-size:${N > 12 ? 13 : 17}px">看门人 · ${C.zh} (${clip}) ${C.dur}s${C.loop ? ' 循环' : ''}</div>`)
  let i = 0
  const step = () => {
    const tt = times[i]
    animateConciergePreroll(rig, clip, tt, opts)
    if (move && C.speed) man.position.z = C.speed * tt
    const oz = move && C.speed ? man.position.z : 0
    if (move) { key.position.set(2.2, 3.4, 3.2 + oz); key.target.position.set(0, 0.8, oz); key.target.updateMatrixWorld() }
    if (victim) victim.update(rig, clip, tt)
    if (hookKey) hookKey.visible = tt < 1.6
    man.updateMatrixWorld(true)
    if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
    tc.position.set(cp[0], cp[1], cp[2] + oz); tc.lookAt(cl[0], cl[1], cl[2] + oz)
    const c = i % cols, r = Math.floor(i / cols)
    renderer.setViewport(c * tw, H - (r + 1) * th, tw, th); renderer.setScissor(c * tw, H - (r + 1) * th, tw, th)
    renderer.render(scene, tc)
    if (N > 1 && !bare) lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${c * tw + tw / 2}px;top:${r * th + th - 20}px;font-size:12px">${tt.toFixed(2)}s</div>`)
    if (++i < N) setTimeout(step, 0)
    else { (window as any).__info = { clip, cols, rows, frames: N, fps, dur: C.dur, tw, th, res: conciergeIkResidual() }; (window as any).__ready = true }
  }
  // 预热两帧（编译着色器）后开始逐格
  renderer.setScissorTest(false); renderer.render(scene, cam); renderer.setScissorTest(true)
  setTimeout(step, 0)
}
function makeVictim() {
  const g = new THREE.Group()
  const cloth = new THREE.MeshStandardMaterial({ color: '#41566e', roughness: 0.9 }), skin = new THREE.MeshStandardMaterial({ color: '#c99a7a', roughness: 0.8 }), pant = new THREE.MeshStandardMaterial({ color: '#2c2b30', roughness: 0.9 })
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.38, 6, 12), cloth), head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), skin)
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.7, 6, 12), pant)
  const tG = new THREE.Group(); tG.add(torso); torso.position.y = -0.34; g.add(tG)
  head.position.y = 0.11; tG.add(head); const lG = new THREE.Group(); lG.position.y = -0.68; tG.add(lG); lG.add(legs); legs.position.y = -0.45
  for (const m of [torso, head, legs]) { m.castShadow = true; m.receiveShadow = true }
  const hp = new THREE.Vector3(), hq = new THREE.Vector3()
  return {
    g,
    update(rig: ConciergeRig, clip: string, t: number) {
      // tG 原点 = 领口（头在 +y），身体沿 tG 的 −y
      if (clip === 'drag') {
        conciergeHandPoint(rig, 'R', hp)
        const dir = new THREE.Vector3(0, -(hp.y - 0.15), 0.62).normalize()
        tG.position.copy(hp); tG.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir)
        lG.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -1, 0).applyQuaternion(tG.quaternion.clone().invert()).lerp(new THREE.Vector3(0, 0, 1).applyQuaternion(tG.quaternion.clone().invert()), 0.0))
        // 腿平躺在地面上
        lG.quaternion.copy(tG.quaternion.clone().invert().multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -0.05, 1).normalize())))
      } else if (clip === 'bind') {
        tG.position.set(-0.22, 0.16, 0.6); tG.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0)); lG.quaternion.identity()
      } else {
        conciergeHandPoint(rig, 'L', hp); conciergeHandPoint(rig, 'R', hq); hp.add(hq).multiplyScalar(0.5)
        const slide = t > 2.75 ? (t - 2.75) * 0.5 : 0
        tG.position.set(0.5, hp.y + 0.13, hp.z + 0.12 + slide); tG.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(-1, 0, 0))
        lG.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), t < 2.3 ? 0.9 : 0.2)
      }
    },
  }
}
