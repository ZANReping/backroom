// 原型预览页：枪械系统（鎏金兵械库）。与游戏 renderer 同一套 buildViewmodel / buildHeldItem / heldHandPose / FirearmView。
// ?mode=seq&gun=dbshotgun&seq=reload&n=12 —— 按真实时间表连续模拟一段动作，等间隔截 n 帧排成连拍（检查手部动作是否连贯）
// ?mode=model&gun=leverrifle —— 侧视建模 + 标尺（合枪 / 开枪两件）
// ?mode=lineup —— 五把枪 + 六种弹并排
// &real=1 真实材质
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { buildViewmodel, buildHeldItem, heldHandPose, heldBox, sleeveKindOf } from '../game/renderer/viewmodel'
import { FirearmView, GUN_VM_SCALE, ADS_HAND_OPACITY } from '../game/renderer/firearmView'
import { buildFirearmMesh, buildCartMesh, setChambers, type GunRig } from '../game/renderer/firearmMesh'
import { buildCapMesh } from '../game/renderer/firearmGuns'
import { setMaterialMode } from '../game/renderer/shared'
import { CHOREO } from '../game/renderer/firearmAnim'
import { newGunRun, type GunRun, type GunStep, type GunAct } from '../game/engine/firearms'
import { GUNS, AMMO, MUZZLE_STAGES, MUZZLE_STAGE_LABEL, type AmmoType, type Chamber, type GunType } from '../game/content/firearms'

const Q = new URLSearchParams(location.search)
const mode = Q.get('mode') ?? 'seq'
const gun = (Q.get('gun') ?? 'dbshotgun') as GunType
const real = Q.get('real') === '1'
if (real) setMaterialMode('realistic')
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.autoClear = false
if (real) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0 }
document.body.appendChild(renderer.domElement)
const envTex = real ? new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture : null
const lab = document.getElementById('lab')!
const label = (x: number, y: number, txt: string) => lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${x}px;top:${y}px">${txt}</div>`)
const look = { skin: '#c9a58a', sleeve: '#4a4038', sleeveKind: sleeveKindOf(3), topStyle: 3 }
const wallTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d')!; g.fillStyle = '#c2ad62'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(120,96,40,.35)'; for (let x = 0; x < 256; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke() } const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 3); t.colorSpace = THREE.SRGBColorSpace; return t })()
const ACT_CN: Record<string, string> = { idle: '持枪', fire: '击发', cycle: '拉杆', dry: '空击', open: '开枪机', extract: '退壳 / 拔弹', insert: '装弹', close: '收尾', stage: '' }

// ---------------------------------------------------------------- 动作脚本（与 engine 的步骤顺序一致）
interface Seg { act: GunAct; dur: number; step?: GunStep; after?: (mag: Chamber[], s: SimState) => void; before?: (mag: Chamber[], s: SimState) => void }
interface SimState { stage: number; cyl: number }
function script(g: GunType, seq: string): { segs: Seg[]; mag: Chamber[]; st: SimState } {
  const d = GUNS[g], R = d.reload, A = d.ammo[d.ammo.length > 1 ? 2 : 0] as AmmoType, B = d.ammo[0]
  const segs: Seg[] = [], st: SimState = { stage: 0, cyl: 0 }
  const idle = (t = 0.25) => segs.push({ act: 'idle', dur: t })
  const fire = (b: number) => segs.push({ act: 'fire', dur: d.fireInterval, before: (m, s) => { m[b] = d.reload.kind === 'muzzle' ? '' : 'spent'; if (d.reload.kind === 'gate') s.cyl = (b + 1) % 6; if (d.reload.kind === 'muzzle') s.stage = 0 }, step: { act: 'insert', barrel: b } })
  let mag: Chamber[] = []
  switch (g) {
    case 'dbshotgun':
      mag = seq === 'fire' ? [B, A] : ['spent', 'spent']
      if (seq === 'fire') { idle(); fire(0); idle(0.1); fire(1); idle(0.3) }
      else {
        idle(); segs.push({ act: 'open', dur: R.open, after: (m) => { m[0] = ''; m[1] = '' } })
        segs.push({ act: 'insert', dur: R.insert, step: { act: 'insert', barrel: 0, ammo: A }, after: (m) => { m[0] = A } })
        segs.push({ act: 'insert', dur: R.insert, step: { act: 'insert', barrel: 1, ammo: B }, after: (m) => { m[1] = B } })
        segs.push({ act: 'close', dur: R.close }); idle()
      }
      break
    case 'leverrifle':
      mag = Array(11).fill('') as Chamber[]
      if (seq === 'fire') { mag[0] = B; mag[1] = B; mag[2] = B; idle(); fire(0); segs.push({ act: 'cycle', dur: d.cycle!, after: (m) => { m[0] = B; m[2] = '' } }); idle(0.15); fire(0); segs.push({ act: 'cycle', dur: d.cycle!, after: (m) => { m[0] = B; m[1] = '' } }); idle() }
      else {
        idle(); segs.push({ act: 'open', dur: R.open })
        for (let k = 1; k <= 3; k++) segs.push({ act: 'insert', dur: R.insert, step: { act: 'insert', barrel: k, ammo: B }, after: (m) => { m[k] = B } })
        segs.push({ act: 'close', dur: R.close }); segs.push({ act: 'cycle', dur: d.cycle!, after: (m) => { m[0] = B; m[3] = '' } }); idle()
      }
      break
    case 'revolver':
      mag = seq === 'fire' ? [B, B, B, '', '', ''] : ['spent', 'spent', B, B, B, B]
      if (seq === 'fire') { idle(); fire(0); fire(1); idle() }
      else {
        idle(); segs.push({ act: 'open', dur: R.open })
        for (let b = 0; b < 2; b++) {
          segs.push({ act: 'extract', dur: R.extract, step: { act: 'extract', barrel: b }, after: (m) => { m[b] = '' } })
          segs.push({ act: 'insert', dur: R.insert, step: { act: 'insert', barrel: b, ammo: B }, after: (m) => { m[b] = B } })
        }
        segs.push({ act: 'close', dur: R.close }); idle()
      }
      break
    case 'musket':
      mag = seq === 'fire' ? [B] : ['']; st.stage = seq === 'fire' ? 6 : 0
      if (seq === 'fire') { idle(); fire(0); idle(0.6) }
      else {
        idle(0.15)
        const only = Q.get('stage')
        for (const s of MUZZLE_STAGES) {
          if (only && s !== only) { st.stage++; continue }
          segs.push({ act: 'stage', dur: R.stages![s], step: { act: 'stage', barrel: 0, stage: s, ammo: B }, after: (m, ss) => { ss.stage++; if (ss.stage >= 6) m[0] = B } })
        }
        idle(0.2)
      }
      break
    case 'trapdoor':
      mag = seq === 'fire' ? [B] : ['spent']
      if (seq === 'fire') { idle(); fire(0); idle(0.4) }
      else {
        idle(); segs.push({ act: 'open', dur: R.open, after: (m) => { m[0] = '' } })
        segs.push({ act: 'insert', dur: R.insert, step: { act: 'insert', barrel: 0, ammo: B }, after: (m) => { m[0] = B } })
        segs.push({ act: 'close', dur: R.close }); idle()
      }
      break
  }
  return { segs, mag, st }
}

// ---------------------------------------------------------------- 第一人称舞台
function fpStage() {
  const sc = new THREE.Scene(); sc.background = new THREE.Color('#6b6136'); if (envTex) { sc.environment = envTex; sc.environmentIntensity = .5 }
  sc.add(new THREE.HemisphereLight('#fff3d0', '#4a4330', real ? .6 : 1.15))
  const dl = new THREE.DirectionalLight('#fff0d0', real ? 1.8 : 1.4); dl.position.set(-1, 2, 1.5); sc.add(dl)
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshLambertMaterial({ map: wallTex })); wall.position.set(0, .6, -4); sc.add(wall)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshLambertMaterial({ color: '#8a7650' })); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.6; sc.add(floor)
  const cm = new THREE.PerspectiveCamera(72, 1, .02, 30); sc.add(cm)
  const vm = new THREE.Group(), vf = new THREE.Group()
  const parts = buildViewmodel(vm, vf, cm)
  vf.visible = false
  parts.right.setLook(look)
  const item = buildHeldItem(gun)
  vm.add(item)
  parts.right.setPose(heldHandPose(gun, heldBox(item)), item)
  const view = new FirearmView(vm, sc)
  view.attach(item.userData.gunRig as GunRig, parts.right, look)
  // &cam=side：从右前方近距离看双手（检查手指接触 / 前臂走向），镜头挂在玩家镜头上随身体走
  let shotCam: THREE.PerspectiveCamera = cm
  const camMode = Q.get('cam')
  if (camMode) {
    shotCam = new THREE.PerspectiveCamera(Number(Q.get('fov') ?? 40), 1, .01, 30); cm.add(shotCam)
    const [x, y, z, tx, ty, tz] = camMode === 'side' ? [0.75, 0.05, -0.55, 0.0, -0.12, -0.38] : camMode === 'left' ? [-0.75, 0.05, -0.55, 0.0, -0.12, -0.38] : camMode === 'top' ? [0.05, 0.6, -0.4, 0.0, -0.12, -0.4] : camMode.split(':').map(Number)
    shotCam.position.set(x, y, z); shotCam.lookAt(new THREE.Vector3(tx, ty, tz).applyMatrix4(cm.matrixWorld))
    shotCam.up.set(0, 1, 0)
  }
  return { sc, cm, vm, view, shotCam }
}

const CHOREO_POSES = (g: GunType) => { const c = CHOREO[g]; return { R: c.poses[c.idleHands.R].pose.at, L: c.poses[c.idleHands.L].pose.at } }
const w = window as unknown as Record<string, unknown>
if (mode === 'hands') {
  // ?mode=hands&gun=X —— 两只手的握法特写（枪坐标系里的固定机位）：右手右侧 / 右手左上 / 左手右下 / 左手左上 / 贴腮视线 / 腰射
  const { sc, cm, vm, view } = fpStage()
  const run: GunRun = newGunRun()
  const mag: Chamber[] = gun === 'revolver' ? Array(6).fill(GUNS[gun].ammo[0]) as Chamber[] : gun === 'dbshotgun' ? [GUNS[gun].ammo[0], GUNS[gun].ammo[0]] : [GUNS[gun].ammo[0]]
  const aim = Number(Q.get('aim') ?? 0)
  run.aim = aim
  for (let i = 0; i < 120; i++) { const p = view.update({ run, mag, sel: GUNS[gun].ammo[0], stage: 6, cyl: 0, sprint: false, moving: false, time: 0, bob: 0, dt: 1 / 120, camera: cm, floorY: -1.6 }); vm.scale.setScalar(GUN_VM_SCALE); vm.position.set(p.px, p.py, p.pz); vm.rotation.set(p.rx, p.ry, p.rz) }
  vm.updateMatrixWorld(true)
  const rig = (view as unknown as { rig: GunRig }).rig
  const pR = new THREE.Vector3(...(CHOREO_POSES(gun).R)), pL = new THREE.Vector3(...(CHOREO_POSES(gun).L))
  const cols = 3, cw = Math.floor(W / cols), chh = Math.floor(H / 2)
  const shots: [string, THREE.Vector3, THREE.Vector3, number][] = [
    ['右手 · 右侧', pR.clone().add(new THREE.Vector3(0.22, 0.04, -0.02)), pR, 30],
    ['右手 · 左上', pR.clone().add(new THREE.Vector3(-0.16, 0.14, -0.06)), pR, 30],
    ['右手 · 后上（贴腮方向）', pR.clone().add(new THREE.Vector3(0.0, 0.08, 0.2)), pR.clone().add(new THREE.Vector3(0, 0, -0.04)), 34],
    ['左手 · 右下', pL.clone().add(new THREE.Vector3(0.2, -0.08, 0.06)), pL, 32],
    ['左手 · 左上', pL.clone().add(new THREE.Vector3(-0.18, 0.12, 0.04)), pL, 32],
    ['左手 · 后上（贴腮方向）', pL.clone().add(new THREE.Vector3(0.0, 0.06, 0.25)), pL, 30],
  ]
  renderer.setScissorTest(true)
  const c2 = new THREE.PerspectiveCamera(30, cw / chh, 0.005, 30); sc.add(c2)
  shots.forEach(([name, eye, at, fov], i) => {
    const e = eye.clone().sub(at).multiplyScalar(Number(Q.get('zoom') ?? 1.7)).add(at).applyMatrix4(rig.root.matrixWorld), t = at.clone().applyMatrix4(rig.root.matrixWorld)
    c2.fov = fov; c2.position.copy(e); c2.up.set(0, 1, 0); c2.lookAt(t); c2.updateProjectionMatrix(); c2.updateMatrixWorld(true)
    const x = (i % cols) * cw, y = Math.floor(i / cols) * chh
    renderer.setViewport(x, H - y - chh, cw, chh); renderer.setScissor(x, H - y - chh, cw, chh); renderer.clear(); renderer.render(sc, c2)
    label(x + cw / 2, y + 4, `${GUNS[gun].name} · ${name}`)
  })
  void cm
} else if (mode === 'grip') {
  // ?mode=grip&gun=X —— 腰射 / 贴腮两种持枪姿势（正面 + 侧面），并量出手 / 枪对准星区域的遮挡
  if (Q.get('st')) { const [px, py, pz, rx, ry, rz] = Q.get('st')!.split(',').map(Number); Object.assign(CHOREO[gun].stances.hip, { px, py, pz, rx, ry, rz }) } // 调站姿用
  const { sc, cm, vm, view } = fpStage()
  const run: GunRun = newGunRun()
  const mag: Chamber[] = gun === 'revolver' ? Array(6).fill(GUNS[gun].ammo[0]) as Chamber[] : gun === 'dbshotgun' ? [GUNS[gun].ammo[0], GUNS[gun].ammo[0]] : [GUNS[gun].ammo[0]]
  const cw = W / 2, chh = H / 2
  const side = new THREE.PerspectiveCamera(34, cw / chh, .01, 30); cm.add(side)
  const cams = (Q.get('side') ?? '0.62,0.06,-0.2,0,-0.08,-0.3').split(',').map(Number)
  const gl = renderer.getContext(), diag: Record<string, unknown> = {}
  renderer.setScissorTest(true)
  const pose = (aim: number) => {
    run.aim = aim
    let T = 0
    for (let i = 0; i < 240; i++) { const p = view.update({ run, mag, sel: GUNS[gun].ammo[0], stage: 6, cyl: 0, sprint: false, moving: false, time: Q.get('still') ? 0 : T, bob: 0, dt: 1 / 120, camera: cm, floorY: -1.6 }); vm.scale.setScalar(GUN_VM_SCALE); vm.position.set(p.px, p.py, p.pz); vm.rotation.set(p.rx, p.ry, p.rz); T += 1 / 120 }
    cm.fov = 72 * (aim ? GUNS[gun].adsFov : 1); cm.updateProjectionMatrix(); cm.updateMatrixWorld(true)
  }
  const read = (x: number, y: number, ww: number, hh: number) => { const b = new Uint8Array(ww * hh * 4); gl.readPixels(x, y, ww, hh, gl.RGBA, gl.UNSIGNED_BYTE, b); return b }
  // 中心区域里，「去掉某些物体」前后像素有变化的比例 = 那些物体挡住的比例
  const occl = (cam: THREE.Camera, x0: number, y0: number, r: number, hide: THREE.Object3D[], rect = false) => {
    const cx = Math.round(x0 + cw / 2), cy = Math.round(y0 + chh / 2), R = Math.round(r)
    renderer.setViewport(x0, y0, cw, chh); renderer.setScissor(x0, y0, cw, chh)
    renderer.clear(); renderer.render(sc, cam); const a = read(cx - R, cy - R, 2 * R, 2 * R)
    const vis = hide.map((o) => o.visible); hide.forEach((o) => (o.visible = false))
    renderer.clear(); renderer.render(sc, cam); const b = read(cx - R, cy - R, 2 * R, 2 * R)
    hide.forEach((o, i) => (o.visible = vis[i]))
    let n = 0, d = 0
    for (let j = 0; j < 2 * R; j++) for (let i = 0; i < 2 * R; i++) { if (rect ? Math.abs(i - R) > R * 0.35 || j < R * 0.8 : (i - R) ** 2 + (j - R) ** 2 > R * R) continue; n++; const k = (j * 2 * R + i) * 4; if (Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]) > 12) d++ }
    return d / Math.max(1, n)
  }
  const cross = (x: number, y: number) => lab.insertAdjacentHTML('beforeend', `<div style="position:absolute;left:${x - 13}px;top:${y - 13}px;width:26px;height:26px"><div style="position:absolute;left:12px;top:0;width:2px;height:7px;background:#e8e2d2"></div><div style="position:absolute;left:12px;top:19px;width:2px;height:7px;background:#e8e2d2"></div><div style="position:absolute;left:0;top:12px;width:7px;height:2px;background:#e8e2d2"></div><div style="position:absolute;left:19px;top:12px;width:7px;height:2px;background:#e8e2d2"></div><div style="position:absolute;left:12px;top:12px;width:2px;height:2px;background:#e8e2d2"></div></div>`)
  const rig = (view as unknown as { rig: GunRig }).rig
  for (const [ci, aim] of [[0, 0], [1, 1]] as const) {
    pose(aim)
    cm.aspect = cw / chh; cm.updateProjectionMatrix()
    const hands = view.handNodes()
    const hs = (view as unknown as { hands: Record<'L' | 'R', { hand: { setOpacity(a: number): void } }> }).hands
    const setOp = (a: number) => { hs.L.hand.setOpacity(a); hs.R.hand.setOpacity(a) }
    setOp(1) // 遮挡 / 占屏按不透明的手量
    // 正面（游戏画面）
    const x0 = ci * cw, y0 = chh
    // 腰射：准心周围半径 12% 屏高的圆；贴腮：「瞄准窗」= 准星 / 照门所在的竖条（宽 ±3.5%、中心下 3% 到上 10% 屏高）
    const r = chh * (aim ? 0.1 : 0.12)
    diag[aim ? 'adsHandOcc' : 'hipHandOcc'] = +occl(cm, x0, y0, r, hands, !!aim).toFixed(4)
    if (!aim) diag.hipGunOcc = +occl(cm, x0, y0, r, [vm]).toFixed(4)
    // 两只手（含前臂）占整个画面的比例
    {
      renderer.setViewport(x0, y0, cw, chh); renderer.setScissor(x0, y0, cw, chh)
      renderer.clear(); renderer.render(sc, cm); const a = read(x0, y0, cw, chh)
      hands.forEach((o) => (o.visible = false)); renderer.clear(); renderer.render(sc, cm); const b = read(x0, y0, cw, chh); hands.forEach((o) => (o.visible = true))
      let d = 0, n = 0
      for (let k = 0; k < a.length; k += 4 * 3) { n++; if (Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]) > 12) d++ }
      diag[aim ? 'adsHandCover' : 'hipHandCover'] = +(d / n).toFixed(3)
    }
    if (aim && !Q.get('opaque')) setOp(ADS_HAND_OPACITY) // 游戏里贴腮时手是半透明的
    renderer.setViewport(x0, y0, cw, chh); renderer.setScissor(x0, y0, cw, chh); renderer.clear(); renderer.render(sc, cm)
    if (!aim) cross(x0 + cw / 2, H - y0 - chh / 2)
    // 贴腮：准星 / 照门在画面上的位置（应在正中）
    if (aim) {
      const pf = rig.sight.target.clone().applyMatrix4(rig.root.matrixWorld).project(cm)
      diag.frontPx = [+(pf.x * cw / 2).toFixed(1), +(pf.y * chh / 2).toFixed(1)]
    }
    // 两只手离画面中心最近的距离（屏幕高度比例）
    let best = 9
    for (const hnd of hands) hnd.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh || !m.visible) return; const pos = m.geometry.attributes.position; for (let i = 0; i < pos.count; i += 3) { const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).project(cm); if (v.z > 1 || v.z < -1) continue; const dx = v.x * cm.aspect, dy = v.y; best = Math.min(best, Math.hypot(dx, dy) / 2) } })
    diag[aim ? 'adsHandDist' : 'hipHandDist'] = +best.toFixed(3)
    // 侧面
    side.position.set(cams[0] * (aim && !Q.get("side") ? 0.8 : 1), cams[1], cams[2]); cm.updateMatrixWorld(true); side.lookAt(new THREE.Vector3(cams[3], cams[4], cams[5]).applyMatrix4(cm.matrixWorld)); side.aspect = cw / chh; side.updateProjectionMatrix()
    renderer.setViewport(x0, 0, cw, chh); renderer.setScissor(x0, 0, cw, chh); renderer.clear(); renderer.render(sc, side)
    label(x0 + cw / 2, 4, `${GUNS[gun].name} · ${aim ? '贴腮瞄准' : '腰射'}<span class="s"> 手占画面 ${((diag[aim ? 'adsHandCover' : 'hipHandCover'] as number) * 100).toFixed(0)}% · 手遮挡中心 ${(+(diag[aim ? 'adsHandOcc' : 'hipHandOcc'] as number) * 100).toFixed(1)}%${aim ? '' : ` · 枪遮挡 ${((diag.hipGunOcc as number) * 100).toFixed(1)}%`}</span>`)
    label(x0 + cw / 2, chh + 4, `<span class="s">侧面</span>`)
  }
  w.__diag = diag
} else if (mode === 'seq') {
  const { sc, cm, vm, view, shotCam } = fpStage()
  const { segs, mag, st } = script(gun, Q.get('seq') ?? 'reload')
  const total = segs.reduce((s, x) => s + x.dur, 0)
  const n = Q.get('ts') ? Q.get('ts')!.split(',').length : Number(Q.get('n') ?? 12), cols = Number(Q.get('cols') ?? (n <= 6 ? 3 : n <= 12 ? 4 : 6)), rows = Math.ceil(n / cols)
  const cw = Math.floor(W / cols), chh = Math.min(Math.floor(H / rows), Math.floor(cw * 0.62))
  cm.aspect = cw / chh; cm.updateProjectionMatrix(); shotCam.aspect = cw / chh; shotCam.updateProjectionMatrix()
  const t0 = Number(Q.get('t0') ?? 0), t1 = Number(Q.get('t1') ?? total)
  const shots = Q.get('ts') ? Q.get('ts')!.split(',').map(Number) : Array.from({ length: n }, (_, i) => t0 + (t1 - t0) * (n === 1 ? 0 : i / (n - 1)))
  const run: GunRun = newGunRun()
  const DT = 1 / 120
  let T = 0, si = 0, segStart = 0, shot = 0, stepNo = 0
  const enter = (k: number) => {
    const s = segs[k]
    s.before?.(mag, st)
    run.act = s.act; run.t = 0; run.dur = s.dur
    run.step = s.act === 'fire' ? null : (s.step ?? null)
    if (s.act === 'fire') { run.shotN++; run.lastBarrel = s.step!.barrel; run.recoil = 1 }
    if (s.act === 'open' || s.act === 'cycle') run.ejected = false
    run.stepNo = stepNo
  }
  enter(0)
  renderer.setScissorTest(true)
  while (shot < n && si < segs.length) {
    // 抛壳时机（与 engine 一致）
    const s = segs[si], R = GUNS[gun].reload
    if (s.act === 'open' && R.kind === 'break' && !run.ejected && run.t >= R.eject) { run.ejected = true; const out = mag.map((c, b) => c === 'spent' ? b : -1).filter((b) => b >= 0); if (out.length) { out.forEach((b) => (mag[b] = '')); run.ejectBarrels = out; run.ejectAmmo = GUNS[gun].ammo[0]; run.ejectN++ } }
    if (s.act === 'cycle' && !run.ejected && run.t >= run.dur * 0.42) { run.ejected = true; if (mag[0] === 'spent' || mag[0]) { mag[0] = ''; run.ejectBarrels = [0]; run.ejectAmmo = GUNS[gun].ammo[0]; run.ejectN++ } }
    if (s.act === 'extract' && R.kind === 'gate' && run.t >= run.dur * 0.6 && mag[s.step!.barrel] === 'spent') { mag[s.step!.barrel] = ''; run.ejectBarrels = [s.step!.barrel]; run.ejectAmmo = 'cart_4440'; run.ejectN++ }
    const pose = view.update({ run, mag, sel: GUNS[gun].ammo[0], stage: st.stage, cyl: st.cyl, sprint: false, moving: false, time: T, bob: 0, dt: DT, camera: cm, floorY: -1.6 })
    vm.scale.setScalar(GUN_VM_SCALE); vm.position.set(pose.px, pose.py, pose.pz); vm.rotation.set(pose.rx, pose.ry, pose.rz)
    if (T >= shots[shot] - 1e-6) {
      const x = (shot % cols) * cw, y = Math.floor(shot / cols) * chh
      renderer.setViewport(x, H - y - chh, cw, chh); renderer.setScissor(x, H - y - chh, cw, chh)
      renderer.clear(); renderer.render(sc, shotCam)
      const stg = run.step?.stage ? MUZZLE_STAGE_LABEL[run.step.stage] : ACT_CN[run.act] ?? run.act
      label(x + cw / 2, y + 4, `${stg} <span class="s">${T.toFixed(2)}s · ${Math.round(run.t / Math.max(1e-6, run.dur) * 100)}%${Q.get('dbg') ? '<br>' + view.debugArms(cm) : ''}</span>`)
      shot++
    }
    T += DT; run.t += DT; run.recoil = Math.max(0, run.recoil - DT * 4.2)
    if (run.t >= run.dur) {
      s.after?.(mag, st)
      if (s.act === 'insert' || s.act === 'extract' || s.act === 'stage') stepNo++
      if (s.act === 'close' || s.act === 'idle') stepNo = 0
      si++; segStart = T
      if (si < segs.length) enter(si)
    }
  }
  void segStart
  label(W / 2, rows * chh + 6, `${GUNS[gun].name} · ${Q.get('seq') ?? 'reload'} · 全程 ${total.toFixed(2)}s`)
} else {
  // 侧视建模
  const sc = new THREE.Scene(); sc.background = new THREE.Color('#1d1c1a'); if (envTex) sc.environment = envTex
  sc.add(new THREE.HemisphereLight('#fff4e0', '#3a3428', real ? .45 : 1.15))
  const key = new THREE.DirectionalLight('#fff1dc', real ? 2.2 : 1.9); key.position.set(2, 3, 3); sc.add(key)
  const rim = new THREE.DirectionalLight('#a8c4ff', .7); rim.position.set(-3, 2, -3); sc.add(rim)
  const cm = new THREE.PerspectiveCamera(26, W / H, .01, 30)
  const guns: GunType[] = mode === 'lineup' ? ['dbshotgun', 'leverrifle', 'musket', 'trapdoor', 'revolver'] : [gun]
  const OPENCH: Record<GunType, Record<string, number>> = {
    dbshotgun: { open: 1, lever: 1 }, leverrifle: { lever: 1, hammer: 1, gate: 1 }, revolver: { hammer: 0.45, gate: 1, rod: 1, cyl: -0.3 },
    musket: { hammer: 0.5, cap: 1, rodZ: -0.5 }, trapdoor: { block: 1, hammer: 0.45, ext: 1 },
  }
  const MAG: Record<GunType, Chamber[]> = { dbshotgun: ['shell_clump', 'spent'], leverrifle: ['cart_4440'], revolver: ['cart_4440', 'spent', 'cart_4440', 'cart_4440', '', 'cart_4440'], musket: ['cart_paper'], trapdoor: ['cart_4570'] }
  const lb3: [THREE.Vector3, string][] = []
  let y = 0
  for (const g of guns) {
    const sizeK = g === 'revolver' ? 2.4 : 1
    for (const open of mode === 'lineup' ? [false] : [false, true]) {
      const rig = buildFirearmMesh(g)
      rig.apply(open ? OPENCH[g] : { hammer: 1, cap: 1 })
      setChambers(rig, MAG[g], GUNS[g].ammo[0])
      rig.root.rotation.y = Math.PI / 2; rig.root.scale.setScalar(sizeK)
      const box = new THREE.Box3().setFromObject(rig.root)
      rig.root.position.set(-(box.min.x + box.max.x) / 2 + (g === 'revolver' && mode === 'lineup' ? 0.45 : 0), y - box.min.y, 0)
      sc.add(rig.root)
      lb3.push([new THREE.Vector3(0, y + (box.max.y - box.min.y) + 0.04, 0), open ? '<span class="s">动作位</span>' : `${GUNS[g].name}${sizeK > 1 ? '（×2.4）' : ''}<br><span class="s">${GUNS[g].note}</span>`])
      y -= (box.max.y - box.min.y) + (mode === 'lineup' ? 0.2 : 0.16)
    }
  }
  if (mode === 'lineup') {
    const ammo: AmmoType[] = ['shell_buck', 'shell_bird', 'shell_clump', 'cart_4440', 'cart_paper', 'cart_4570']
    ammo.forEach((a, i) => { const s = buildCartMesh(a); s.scale.setScalar(2.4); s.rotation.set(Math.PI / 2, 0, 0); s.position.set(0.25 + i * 0.07, y + 0.05, 0.05); sc.add(s) })
    const cap = buildCapMesh(); cap.scale.setScalar(4); cap.position.set(0.25 + 6 * 0.07, y + 0.05, 0.05); sc.add(cap)
    lb3.push([new THREE.Vector3(0.45, y + 0.25, 0), `<span class="s">${ammo.map((a) => AMMO[a].short).join(' · ')} · 火帽（弹 ×2.4）</span>`])
  }
  const span = -y + 0.3, wide = new THREE.Box3().setFromObject(sc).getSize(new THREE.Vector3()).x + 0.2
  const dist = Math.max(span, wide / (W / H)) / (2 * Math.tan(THREE.MathUtils.degToRad(13))) * 1.08
  cm.position.set(0, -span / 2 + 0.1, dist); cm.lookAt(0, -span / 2 + 0.1, 0)
  renderer.render(sc, cm)
  cm.updateMatrixWorld(true)
  for (const [p, t] of lb3) { const v = p.clone().project(cm); label((v.x * .5 + .5) * W, (-v.y * .5 + .5) * H - 30, t) }
}
requestAnimationFrame(() => { w.__info = { mode, gun }; w.__ready = true })
