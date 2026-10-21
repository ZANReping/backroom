// 原型预览页（第 1 阶段静态视图，由 armsProto.ts 分派）：「手臂」（Entité 15-FR「Les Bras」）重制——静态建模。
// ?mode=under（仰视风口垂下 3 条臂，参照附图构图）| side（单臂侧视 + 标尺/人形）| hand（三爪手特写）
//      | curl（爪张开/静止/收拢对比）| grate（格栅关/开对比）| burn（烧焦状态 + 地面烧焦皮片与烟）| stretch（伸长到 5m）
// &real=1 真实材质；&cpu=1 CPU 蒙皮替身（无头 SwiftShader 截图必开）；&seed=N；&n=1..3 臂数（under）；&burn=0..1
import * as THREE from 'three'
import { armsBudget, armsDebris, armsRig, armsVent, ARMS_VENT_DROP, buildArmsBurntDebris, buildArmsMesh, buildArmsVent, setGrateOpen } from '../game/renderer/armsMesh'
import { setMaterialMode } from '../game/renderer/shared'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'

const Q = new URLSearchParams(location.search)
const mode = Q.get('mode') ?? 'under'
const real = Q.get('real') === '1'
const seed = +(Q.get('seed') ?? 3)
if (real) setMaterialMode('realistic')
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
if (real) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15 }
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene()
const lab = document.getElementById('lab')!
const label = (x: number, y: number, txt: string) => lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${x}px;top:${y}px">${txt}</div>`)
let cam: THREE.Camera = new THREE.PerspectiveCamera(50, W / H, 0.02, 60)
// 3D 标注：延后到相机确定后再投影
const pending3: (() => void)[] = []
const label3 = (p: THREE.Vector3, txt: string, dy = 0) => { pending3.push(() => { cam.updateMatrixWorld(true); const v = p.clone().project(cam); label((v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H + dy, txt) }) }
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const CEIL = 3.0

function concreteTex(base: string, n = 5000, rep = 4) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256
  const g = cv.getContext('2d')!; g.fillStyle = base; g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < n; i++) { const v = Math.random() * 60 - 30; g.fillStyle = `rgba(${128 + v},${126 + v},${120 + v},0.18)`; g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3) }
  for (let i = 0; i < 20; i++) { const x = Math.random() * 256, y = Math.random() * 256, r = 30 + Math.random() * 60; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(40,38,34,0.12)'); gr.addColorStop(1, 'rgba(40,38,34,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r) }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.colorSpace = THREE.SRGBColorSpace; return t
}
/** L1 式混凝土房间：地面、天花板、背墙、侧墙 */
function room(opts: { back?: number; side?: number; size?: number } = {}) {
  const size = opts.size ?? 14
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: concreteTex('#6b6862', 6000, 5) })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
  const ce = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: concreteTex('#8a8781', 5000, 5) })); ce.rotation.x = Math.PI / 2; ce.position.y = CEIL; scene.add(ce)
  const wm = new THREE.MeshLambertMaterial({ map: concreteTex('#7a776f', 5000, 3) })
  const bw = new THREE.Mesh(new THREE.PlaneGeometry(size, CEIL), wm); bw.position.set(0, CEIL / 2, opts.back ?? -2.2); scene.add(bw)
  if (opts.side !== undefined) { const sw = new THREE.Mesh(new THREE.PlaneGeometry(size, CEIL), wm); sw.rotation.y = -Math.PI / 2; sw.position.set(opts.side, CEIL / 2, 0); scene.add(sw) }
}
/** 灰色铁皮柜（附图里被一只手扣住边缘的柜子） */
function cabinet(x: number, y: number, z: number, w: number, d: number, rotY = 0) {
  const g = new THREE.Group()
  const m = new THREE.MeshLambertMaterial({ color: '#4a4b47' })
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, y, d), m); b.position.y = y / 2; g.add(b)
  const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.02, d + 0.02), new THREE.MeshLambertMaterial({ color: '#3c3d3a' })); top.position.y = y + 0.01; g.add(top)
  for (let k = 0; k < 3; k++) { const dr = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 0.004, 0.004), new THREE.MeshBasicMaterial({ color: '#2a2a28' })); dr.position.set(0, y * (0.28 + k * 0.25), d / 2 + 0.002); g.add(dr) }
  g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g); return g
}
/** 1.75m 参照人形（灰色剪影） */
function human(x: number, z: number) {
  const m = new THREE.MeshLambertMaterial({ color: '#8c8a84' }), g = new THREE.Group()
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 4, 10), m); torso.position.y = 1.23; torso.scale.z = 0.6; g.add(torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), m); head.position.y = 1.64; g.add(head)
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.78, 4, 8), m); leg.position.set(s * 0.09, 0.45, 0); g.add(leg)
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.56, 4, 8), m); arm.position.set(s * 0.23, 1.15, 0); g.add(arm)
  }
  g.position.set(x, 0, z); scene.add(g); return g
}
/** 竖直标尺：自 top 向下到 bottom，每 0.5m 一格（黄色长刻度 = 整米，白色短刻度 = 半米） */
function ruler(x: number, z: number, bottom: number, top: number) {
  const g = new THREE.Group(), my = new THREE.MeshBasicMaterial({ color: '#e0c060' }), mw = new THREE.MeshBasicMaterial({ color: '#f0ece0' })
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.012, top - bottom, 0.012), my); bar.position.y = (top + bottom) / 2; g.add(bar)
  for (let k = 0; top - k * 0.5 >= bottom - 1e-6; k++) { const t = new THREE.Mesh(new THREE.BoxGeometry(k % 2 ? 0.06 : 0.12, 0.01, 0.01), k % 2 ? mw : my); t.position.set(k % 2 ? 0.03 : 0.06, top - k * 0.5, 0); g.add(t) }
  g.position.set(x, 0, z); scene.add(g); return g
}
/** 风口 + 臂（臂挂在管口 anchor 上） */
function ventWithArms(n: number, s: number, x = 0, z = 0, rotY = 0) {
  const vent = buildArmsVent(); vent.position.set(x, CEIL, z); vent.rotation.y = rotY; scene.add(vent)
  const arms = n > 0 ? buildArmsMesh(n, s) : null
  if (arms) { armsVent(vent)!.anchor.add(arms); setGrateOpen(vent, 1) }
  return { vent, arms }
}
function flash(pos: THREE.Vector3, target: THREE.Vector3, k = 1, angle = 0.6) {
  const sp = new THREE.SpotLight('#fff4e2', 26 * k, 16, angle, 0.65, 1.4); sp.position.copy(pos); sp.target.position.copy(target); scene.add(sp, sp.target)
}
let budget = { meshes: 0, draws: 0, tris: 0, bones: 0 }
const track = (g: THREE.Object3D) => { const b = armsBudget(g); if (b.tris > budget.tris) budget = b; return g }
/** 把一条臂摆成「伸出去扣住某处」：从 s1 起逐节朝 dir 弯，再伸长、收爪（静态摆姿，仅供构图） */
function poseReach(rig: NonNullable<ReturnType<typeof armsRig>>, a: number, axis: THREE.Vector3, angles: number[], stretch: number, curl: number) {
  const A = rig.arms[a]
  angles.forEach((ang, i) => { const b = A.segs[i + 1] ?? A.hand; b.quaternion.setFromAxisAngle(axis, ang) })
  rig.setStretch(a, stretch); rig.setClawCurl(a, curl)
}
const worldOf = (o: THREE.Object3D) => { scene.updateMatrixWorld(true); return o.getWorldPosition(new THREE.Vector3()) }

const burnK = +(Q.get('burn') ?? (mode === 'burn' ? 0.75 : 0))
if (mode === 'under' || mode === 'burn-under') {
  scene.background = new THREE.Color('#0d0d0c')
  room({ back: -2.4 })
  const { vent, arms } = ventWithArms(+(Q.get('n') ?? 3), seed, 0, 0, 0)
  track(vent)
  const rig = armsRig(arms!)!
  // 参照附图：一条臂伸向前下方扣住柜子顶边，其余两条自然垂下、爪微张
  let best = 0, bestDot = -9
  rig.arms.forEach((A, i) => { const p = worldOf(A.hand); const d = V3(p.x, 0, p.z).normalize().dot(V3(-0.4, 0, 1).normalize()); if (d > bestDot) { bestDot = d; best = i } })
  const hp = worldOf(rig.arms[best].segs[1]), dirH = V3(-0.3, 0, 1).normalize()
  const ax = new THREE.Vector3().crossVectors(V3(0, 1, 0), dirH).normalize().negate()
  poseReach(rig, best, ax, [0.12, 0.14, 0.1, 0.06, 0.0, -0.06, -0.14, -0.3], 1.28, 0.95)
  rig.arms.forEach((A, i) => { if (i !== best) { rig.setClawCurl(i, i % 2 ? -0.35 : 0.15); rig.setStretch(i, i % 2 ? 0.8 : 0.9); A.hand.quaternion.setFromAxisAngle(V3(0, 1, 0), i % 2 ? 0.7 : -0.5) } })
  if (burnK > 0) rig.arms.forEach((_, i) => rig.setBurn(i, burnK * (0.8 + i * 0.12)))
  scene.updateMatrixWorld(true)
  // 柜子：前缘落在三根爪的第 1 关节下方、正面朝向爪伸出的水平方向，爪的后两节钩过前缘垂在柜面外（附图构图）
  const A = rig.arms[best], CAM = V3(0.45, 1.4, 3.7)
  const avg = (k: number) => A.claws.map((c) => worldOf(c[k])).reduce((a, b) => a.add(b), V3(0, 0, 0)).multiplyScalar(1 / 3)
  let j0 = avg(0), j1 = avg(1), fwd = V3(0, 0, 1)
  for (let it = 0; it < 3; it++) { // 转腕：让爪朝向镜头一侧（爪钩过柜子朝镜头的前缘，参照附图）
    fwd = V3(j1.x - j0.x, 0, j1.z - j0.z).normalize()
    const want = V3(CAM.x - j1.x, 0, CAM.z - j1.z).normalize()
    const ang = Math.atan2(fwd.z * want.x - fwd.x * want.z, fwd.dot(want))
    A.hand.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), ang * 0.9))
    j0 = avg(0); j1 = avg(1)
  }
  fwd = V3(j1.x - j0.x, 0, j1.z - j0.z).normalize()
  const cabD = 0.55, cabH = Math.max(0.55, j1.y - 0.03)
  const ctr = j1.clone().addScaledVector(fwd, -(cabD / 2 - 0.015))
  cabinet(ctr.x, cabH, ctr.z, 1.1, cabD, Math.atan2(fwd.x, fwd.z))
  void hp
  const c = new THREE.PerspectiveCamera(56, W / H, 0.05, 30)
  c.position.copy(CAM); c.lookAt(0.0, 1.8, 0); cam = c
  scene.add(new THREE.HemisphereLight('#c9c6bc', '#2a2824', 0.42))
  flash(V3(0.9, 1.3, 3.2), V3(0, 1.7, 0), 0.75, 0.75)
  const pl = new THREE.PointLight('#d8d2c2', 3.5, 6, 1.6); pl.position.set(-1.6, 2.6, 1.4); scene.add(pl)
  if (mode === 'burn-under') { const deb = buildArmsBurntDebris(seed); deb.position.set(0.35, 0, 0.25); scene.add(deb) }
} else if (mode === 'side' || mode === 'stretch') {
  scene.background = new THREE.Color('#2a2a2c')
  const stretch = mode === 'stretch'
  const ceil = stretch ? 5.75 : CEIL
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshLambertMaterial({ color: '#4a4844' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
  const ce = new THREE.Mesh(new THREE.BoxGeometry(30, 0.6, 3), new THREE.MeshLambertMaterial({ color: '#55534e' })); ce.position.y = ceil + 0.3; scene.add(ce)
  const vent = buildArmsVent(); vent.position.set(0, ceil, 0); scene.add(vent); setGrateOpen(vent, 1)
  const arms = buildArmsMesh(1, seed); armsVent(vent)!.anchor.add(arms); track(vent)
  const rig = armsRig(arms)!
  // 侧视：把臂的外展方向转到画面 +X
  scene.updateMatrixWorld(true)
  const hp = worldOf(rig.arms[0].hand); vent.rotation.y = Math.atan2(hp.z, hp.x)
  let reach = rig.arms[0].reach0
  if (stretch) { rig.setReach(0, 5.0); reach = 5.0 }
  const mouthY = ceil - ARMS_VENT_DROP
  ruler(-0.75, 0, mouthY - Math.floor(mouthY * 2) / 2, mouthY)
  human(stretch ? 1.9 : 1.25, 0.3)
  scene.add(new THREE.HemisphereLight('#efeae0', '#3a352e', 1.0)); const sun = new THREE.DirectionalLight('#fff6e8', 1.6); sun.position.set(2, 4, 5); scene.add(sun)
  const span = stretch ? 3.2 : 1.85, cy = stretch ? 2.85 : 1.6
  const c = new THREE.OrthographicCamera(-span * W / H, span * W / H, span, -span, 0.1, 40); c.position.set(0.15, cy, 12); c.lookAt(0.15, cy, 0); cam = c
  for (let y = 0; y <= mouthY + 1e-6; y += 1) label3(V3(-0.75, mouthY - y, 0), `${y}m`, -10)
  label3(V3(stretch ? 1.9 : 1.25, 1.85, 0.3), '<span class="s">参照人形 1.75m</span>')
  label3(V3(-0.75, mouthY, 0), '<span class="s">← 管口（标尺从此向下计）</span>', -32)
  label(W / 2, H - 46, `<span class="s">${stretch ? `伸长：setReach(0, 5.0) → k=${(rig.arms[0].segs[1].position.length() / rig.arms[0].restOffsets[1].length()).toFixed(2)}，管口→爪尖 ≈5m（静止 ${rig.arms[0].reach0.toFixed(2)}m）` : `单臂自然下垂：管口→爪尖沿体长 ${reach.toFixed(2)}m · 白刻度 0.5m / 黄刻度 1m`}</span>`)
} else if (mode === 'hand' || mode === 'curl') {
  scene.background = new THREE.Color('#262624')
  scene.add(new THREE.HemisphereLight('#efeae0', '#3a352e', 0.9)); const sun = new THREE.DirectionalLight('#fff6e8', 1.8); sun.position.set(2, 3, 4); scene.add(sun)
  const fill = new THREE.DirectionalLight('#cfd8ff', 0.5); fill.position.set(-3, 1, -2); scene.add(fill)
  const list = mode === 'hand' ? [0] : [-1, 0, 1]
  const gap = 0.75
  list.forEach((curl, i) => {
    const arms = buildArmsMesh(1, seed); scene.add(arms); track(arms)
    const rig = armsRig(arms)!
    scene.updateMatrixWorld(true)
    // 把手掌转到朝向镜头侧面：外展方向 → +X，再整体平移让掌末在原点附近
    const hp = worldOf(rig.arms[0].hand); arms.rotation.y = Math.atan2(hp.z, hp.x) - (mode === 'hand' ? 0.75 : 1.2)
    rig.setClawCurl(0, curl)
    scene.updateMatrixWorld(true)
    const pe = worldOf(rig.arms[0].claws[1][0])
    arms.position.set(-pe.x + (i - (list.length - 1) / 2) * gap, -pe.y, -pe.z)
    if (mode === 'curl') label3(V3((i - (list.length - 1) / 2) * gap, -0.52, 0), ['张开 setClawCurl(-1)', '静止 0', '收拢 +1'][i])
  })
  const c = new THREE.PerspectiveCamera(mode === 'hand' ? 32 : 36, W / H, 0.02, 30)
  if (mode === 'hand') { c.position.set(0.38, 0.38, 1.0); c.lookAt(0.06, -0.1, 0) } else { c.position.set(0, -0.02, 2.5); c.lookAt(0, -0.12, 0) }
  const qc = Q.get('cam'), ql = Q.get('look')
  if (qc) { const [x, y, z] = qc.split(',').map(Number); c.position.set(x, y, z); const [lx, ly, lz] = (ql ?? '0,-0.15,0').split(',').map(Number); c.lookAt(lx, ly, lz) }
  cam = c
  if (mode === 'hand') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.004, 0.004), new THREE.MeshBasicMaterial({ color: '#e0c060' })); bar.position.set(-0.22, -0.38, 0.05); scene.add(bar)
    label3(V3(-0.22, -0.38, 0.05), '<span class="s">10cm</span>', 8)
  }
} else if (mode === 'grate') {
  scene.background = new THREE.Color('#121211')
  room({ back: -2.4 })
  const a = buildArmsVent(); a.position.set(-0.75, CEIL, 0); scene.add(a); setGrateOpen(a, 0); track(a)
  const b = buildArmsVent(); b.position.set(0.75, CEIL, 0); scene.add(b); setGrateOpen(b, 1)
  const c = new THREE.PerspectiveCamera(50, W / H, 0.05, 30); c.position.set(0.3, 1.25, 2.4); c.lookAt(0, 2.55, 0); cam = c
  scene.add(new THREE.HemisphereLight('#d8d4ca', '#2a2620', 0.6))
  flash(V3(0.4, 1.3, 2.3), V3(0, 2.6, 0), 1.0, 0.8)
  label3(V3(-0.75, CEIL - ARMS_VENT_DROP - 0.12, 0.35), 'setGrateOpen(0) 关')
  label3(V3(0.75, CEIL - ARMS_VENT_DROP - 0.7, 0.35), 'setGrateOpen(1) 开')
} else if (mode === 'burn') {
  // 烧焦状态：单臂近景（焦黑斑 + 红热边）+ 地面烧焦皮片与烟
  scene.background = new THREE.Color('#0e0e0d')
  room({ back: -1.6 })
  const { vent, arms } = ventWithArms(2, seed, 0, 0, 0); track(vent)
  const rig = armsRig(arms!)!
  rig.arms.forEach((_, i) => { rig.setBurn(i, burnK * (i ? 0.75 : 1)); rig.setClawCurl(i, 0.5) })
  rig.setStretch(0, 0.82); if (rig.arms[1]) rig.setStretch(1, 0.7)
  const deb = buildArmsBurntDebris(seed); scene.add(deb); armsDebris(deb)!.update(0.0)
  const c = new THREE.PerspectiveCamera(60, W / H, 0.05, 30); c.position.set(1.1, 1.05, 2.5); c.lookAt(0.05, 1.2, 0); cam = c
  scene.add(new THREE.HemisphereLight('#c9c6bc', '#2a2824', 0.4))
  flash(V3(1.1, 1.4, 2.2), V3(0, 1.6, 0), 1.25, 0.7)
  label(W / 2, H - 46, `<span class="s">setBurn(${burnK.toFixed(2)})：焦黑斑 + 红热边 · 地面：buildArmsBurntDebris（焦痕 + 卷曲焦皮 + 烟）</span>`)
}

for (const f of pending3) f()
label(W - 260, 8, `<span class="s">${budget.meshes} 网格 / ${budget.draws} 次绘制 / ${budget.tris} 三角面 / ${budget.bones} 骨骼${QA_CPU_SKIN ? ' · CPU 蒙皮' : ''}${real ? ' · 真实材质' : ' · 经典材质'}</span>`)
if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
let retries = 0
for (; retries < 6; retries++) {
  renderer.render(scene, cam)
  const bad = (renderer.info.programs ?? []).some((p) => (p as unknown as { diagnostics?: { runnable: boolean } }).diagnostics?.runnable === false)
  if (!bad) break
}
const w = window as unknown as Record<string, unknown>
w.__retries = retries; w.__budget = budget; w.__ready = true
