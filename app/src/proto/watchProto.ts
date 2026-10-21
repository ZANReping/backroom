// 原型预览页：邻里守望（观察者 / 挺进者）+ 残缺者 重制——第 1 阶段静态建模。
// ?mode=lineup（尺寸对照）| watcher（夜间林荫路，参照附图 1）| eye（正面特写）| strider（夜间停车场，参照附图 2）
//      | mangled（雾中郊区仰视，参照附图 3）| mangled-clear（无雾全身）| faces（腹面人脸团块特写）
// &real=1 真实材质；&cpu=1 CPU 蒙皮替身（可选软件调试；验收使用原生 GPU 蒙皮）；&cam=x,y,z&look=x,y,z 自定义镜头
import * as THREE from 'three'
import { prepareWatchGeometry, buildWatchMesh, watchBudget, setPupil, WATCHER_HOVER, STRIDER_STAND } from '../game/renderer/neighborhoodWatchMesh'
import { buildMangledMesh, buildMangledRig, addMangledPart, prepareMangledPart, MANGLED_PARTS, buildMangledShroud, mangledBudget, MANGLED_BODY, type MangledPart } from '../game/renderer/mangledMesh'
import { setMaterialMode } from '../game/renderer/shared'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'

const Q = new URLSearchParams(location.search)
const mode = Q.get('mode') ?? 'lineup'
const real = Q.get('real') === '1'
if (real) setMaterialMode('realistic')
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
if (real) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1 }
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene()
const lab = document.getElementById('lab')!
const label = (x: number, y: number, txt: string) => lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${x}px;top:${y}px">${txt}</div>`)
let cam: THREE.Camera = new THREE.PerspectiveCamera(50, W / H, 0.05, 400)
const pending3: (() => void)[] = []
const label3 = (p: THREE.Vector3, txt: string, dy = 0) => { pending3.push(() => { cam.updateMatrixWorld(true); const v = p.clone().project(cam); label((v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H + dy, txt) }) }
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const budgets: Record<string, ReturnType<typeof watchBudget>> = {}
const watcher = () => { const g = buildWatchMesh('watcher'); budgets.观察者 = watchBudget(g); return g }
const strider = () => { const g = buildWatchMesh('strider'); budgets.挺进者 = watchBudget(g); return g }
const mangled = () => { const g = buildMangledMesh(); budgets.残缺者 = mangledBudget(g); return g }

function human(x: number, z: number, col = '#8c8a84') {
  const m = new THREE.MeshLambertMaterial({ color: col }), g = new THREE.Group()
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 4, 10), m); torso.position.y = 1.23; torso.scale.z = 0.6; g.add(torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), m); head.position.y = 1.64; g.add(head)
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.78, 4, 8), m); leg.position.set(s * 0.09, 0.45, 0); g.add(leg); const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.56, 4, 8), m); arm.position.set(s * 0.23, 1.15, 0); g.add(arm) }
  g.position.set(x, 0, z); scene.add(g); return g
}
function ruler(x: number, z: number, top: number, step = 0.5) {
  const g = new THREE.Group(), my = new THREE.MeshBasicMaterial({ color: '#e0c060' }), mw = new THREE.MeshBasicMaterial({ color: '#f0ece0' })
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, top, 0.02), my); bar.position.y = top / 2; g.add(bar)
  for (let k = 0; k * step <= top + 1e-6; k++) { const major = k % 2 === 0; const t = new THREE.Mesh(new THREE.BoxGeometry(major ? 0.2 : 0.1, 0.015, 0.015), major ? my : mw); t.position.set(major ? 0.1 : 0.05, k * step, 0); g.add(t) }
  g.position.set(x, 0, z); scene.add(g); return g
}
function asphalt(size = 60, col = '#2a2826') {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d')!
  g.fillStyle = col; g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 6000; i++) { const v = 30 + Math.random() * 40; g.fillStyle = `rgba(${v},${v},${v},0.25)`; g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5) }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(size / 4, size / 4); t.colorSpace = THREE.SRGBColorSpace
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: t })); fl.rotation.x = -Math.PI / 2; scene.add(fl); return fl
}
function house(x: number, z: number, w: number, d: number, h: number, ry = 0, lit = false) {
  const g = new THREE.Group(), wall = new THREE.MeshLambertMaterial({ color: '#4a4844' }), roof = new THREE.MeshLambertMaterial({ color: '#2a2624' })
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall); b.position.y = h / 2; g.add(b)
  const r = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) * 0.55, h * 0.6, 4), roof); r.position.y = h + h * 0.3; r.rotation.y = Math.PI / 4; r.scale.z = d / w; g.add(r)
  const wm = new THREE.MeshBasicMaterial({ color: lit ? '#c89a52' : '#121416' })
  for (const s of [-1, 1]) { const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.18, h * 0.22), wm); win.position.set(s * w * 0.26, h * 0.6, d / 2 + 0.01); g.add(win) }
  g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g); return g
}
function streetlamp(x: number, z: number, col = '#ffb36a', k = 40) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5.5, 8), new THREE.MeshLambertMaterial({ color: '#2a2a2a' })); pole.position.set(x, 2.75, z); scene.add(pole)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshBasicMaterial({ color: col })); bulb.position.set(x, 5.5, z); scene.add(bulb)
  const l = new THREE.PointLight(col, k, 22, 1.4); l.position.set(x, 5.4, z); scene.add(l); return l
}
function trees(n: number, r0: number, r1: number, seed = 1) {
  let s = seed; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const leaf = new THREE.MeshLambertMaterial({ color: '#1e2a16' }), bark = new THREE.MeshLambertMaterial({ color: '#1a1512' })
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, rr = r0 + R() * (r1 - r0), x = Math.cos(a) * rr, z = Math.sin(a) * rr
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 4, 6), bark); t.position.set(x, 2, z); scene.add(t)
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + R() * 1.5, 1), leaf); c.position.set(x, 5 + R() * 1.5, z); scene.add(c)
  }
}
const persp = (fov: number, pos: THREE.Vector3, look: THREE.Vector3, far = 400) => {
  const c = new THREE.PerspectiveCamera(fov, W / H, 0.05, far)
  const qc = Q.get('cam'), ql = Q.get('look')
  if (qc) { const [x, y, z] = qc.split(',').map(Number); pos = V3(x, y, z) }
  if (ql) { const [x, y, z] = ql.split(',').map(Number); look = V3(x, y, z) }
  c.position.copy(pos); c.lookAt(look); cam = c; return c
}

if (mode === 'lineup') {
  scene.background = new THREE.Color('#26272a')
  asphalt(40, '#3a3936')
  const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), new THREE.MeshLambertMaterial({ color: '#33333a' })); back.position.set(0, 5, -4); scene.add(back)
  scene.add(new THREE.HemisphereLight('#efeae0', '#3a352e', 0.9)); const s = new THREE.DirectionalLight('#fff6e8', 1.7); s.position.set(3, 6, 8); scene.add(s)
  ruler(-3.6, 0, 4.5)
  const w = watcher(); w.position.set(-1.6, WATCHER_HOVER, 0); w.rotation.y = -0.45; scene.add(w)
  human(0.45, 0.2)
  const st = strider(); st.position.set(3.5, 0, -0.4); st.rotation.y = -0.5; scene.add(st)
  const c = new THREE.OrthographicCamera(-3.3 * W / H, 3.3 * W / H, 3.3, -3.3, 0.1, 80); c.position.set(0.6, 2.3, 30); c.lookAt(0.6, 2.3, 0); cam = c
  for (let y = 0; y <= 4 + 1e-6; y += 1) label3(V3(-3.6, y, 0), `<span class="s">${y}m</span>`, -10)
  label3(V3(-1.6, WATCHER_HOVER + 1.35, 0), '观察者<br><span class="s">眼球直径 2.2m · 底部离地 0.65m</span>', -20)
  label3(V3(0.45, 1.95, 0.2), '<span class="s">参照人形 1.75m</span>')
  label3(V3(3.5, STRIDER_STAND + 0.95, 0), '挺进者<br><span class="s">眼球 1.0m · 6 附肢各约 2.9m</span>', -20)
} else if (mode === 'raw') {
  scene.background = new THREE.Color('#26272a')
  scene.add(new THREE.HemisphereLight('#efeae0', '#3a352e', 0.9))
  const G = prepareWatchGeometry('strider')
  const geo = G.geo.clone()
  const mm = new THREE.Mesh(geo, ['#f00', '#0f0', '#00f', '#ff0', '#f0f'].map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }))); scene.add(mm)
  persp(50, V3(0, 2, 9), V3(0, 1.5, 0))
} else if (mode === 'raw2') {
  scene.background = new THREE.Color('#26272a')
  scene.add(new THREE.HemisphereLight('#efeae0', '#3a352e', 0.9))
  const st = strider(); scene.add(st)
  persp(50, V3(0, 2, 9), V3(0, 1.5, 0))
} else if (mode === 'watcher' || mode === 'eye') {
  scene.background = new THREE.Color('#030403')
  scene.fog = new THREE.FogExp2('#050605', 0.035)
  asphalt(80, '#2b2620')
  trees(40, 7, 26, 9)
  streetlamp(2.2, -9, '#ffd59a', 60)
  scene.add(new THREE.HemisphereLight('#3a4a3a', '#050403', 0.35))
  const key = new THREE.SpotLight('#fff0d8', mode === 'eye' ? 70 : 45, 30, 0.5, 0.7, 1.2); key.position.set(4, 7, 8); key.target.position.set(0, WATCHER_HOVER, 0); scene.add(key, key.target)
  const w = watcher(); w.position.set(0, WATCHER_HOVER, 0); w.rotation.y = mode === 'eye' ? -Math.PI / 2 : -Math.PI / 2 - 0.35; scene.add(w)
  setPupil(w, mode === 'eye' ? 0.85 : 1)
  // 地面投影（附图里眼下方那块阴影）
  const sh = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.55 })); sh.rotation.x = -Math.PI / 2; sh.position.set(-0.8, 0.01, 1.6); sh.scale.y = 0.6; scene.add(sh)
  if (mode === 'eye') persp(38, V3(0.15, WATCHER_HOVER + 0.1, 4.2), V3(0, WATCHER_HOVER, 0))
  else persp(42, V3(1.0, 1.6, 9.5), V3(0, 1.7, 0))
} else if (mode === 'strider') {
  scene.background = new THREE.Color('#050506')
  scene.fog = new THREE.FogExp2('#08080a', 0.04)
  asphalt(80, '#2e2d2b')
  // 停车场的几辆车（附图背景）
  for (const [x, z, c] of [[-4, -7, '#1c1e22'], [3.5, -8, '#2c2e30'], [7, -6.5, '#3a3c40']] as [number, number, string][]) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(4, 1.3, 1.8), new THREE.MeshLambertMaterial({ color: c })); car.position.set(x, 0.65, z); scene.add(car)
  }
  scene.add(new THREE.HemisphereLight('#4a4a58', '#050505', 0.35))
  const flash = new THREE.SpotLight('#fff8ee', 90, 25, 0.55, 0.5, 1.3); flash.position.set(1, 1.6, 8); flash.target.position.set(0, 1.6, 0); scene.add(flash, flash.target) // 手机闪光
  const st = strider(); st.position.set(0, 0, 0); st.rotation.y = -Math.PI / 2 - 0.2; scene.add(st)
  human(3.2, 1.6, '#55524c')
  persp(55, V3(0.6, 1.5, 7.5), V3(0, 1.6, 0))
} else if (mode === 'mangled' || mode === 'mangled-clear') {
  const clear = mode === 'mangled-clear'
  scene.background = new THREE.Color(clear ? '#4a4a4e' : '#58585c')
  if (!clear) scene.fog = new THREE.Fog('#5c5c60', 12, 130)
  asphalt(400, '#3c3a38')
  // 郊区：两排房子 + 远处房海（附图下半）
  for (let k = -9; k <= 9; k++) { house(k * 12, 14, 8, 7, 4.5, 0, k % 3 === 0); house(k * 12 + 6, -16, 8, 7, 4.5, Math.PI, k % 4 === 1) }
  for (let k = 0; k < 90; k++) { const a = Math.random() * Math.PI - Math.PI, rr = 45 + Math.random() * 90; house(Math.cos(a) * rr, Math.sin(a) * rr - 20, 7, 6, 4, Math.random() * 3) }
  for (let k = -3; k <= 3; k++) streetlamp(k * 18, 9, '#e8a050', 25)
  scene.add(new THREE.HemisphereLight('#c8c8cc', '#2a2826', clear ? 1.2 : 0.9))
  const s = new THREE.DirectionalLight('#e0e0e8', clear ? 1.3 : 0.6); s.position.set(-30, 80, 40); scene.add(s)
  const m = mangled(); m.position.set(0, 0, -45); m.rotation.y = Math.PI / 2; scene.add(m)
  if (!clear) { const sh = buildMangledShroud(1); sh.position.copy(m.position); scene.add(sh) }
  human(0, 30)
  if (clear) persp(55, V3(70, 30, 55), V3(0, 22, -45), 600)
  else persp(62, V3(0, 1.7, 34), V3(0, 22, -40), 600)
  label3(V3(0, MANGLED_BODY.y + 12, -45), clear ? '残缺者<br><span class="s">总高约 41m · 8 腿 · 7 触须</span>' : '', -10)
} else if (mode === 'parts' || mode === 'lod') {
  // parts：四个部位各自独立加载、拆开摆放；lod：左精细 / 右远景
  scene.background = new THREE.Color('#2e2e32')
  asphalt(400, '#3c3a38')
  scene.add(new THREE.HemisphereLight('#d8d8dc', '#3a3836', 2.2)); const s = new THREE.DirectionalLight('#e0e0e8', 2.4); s.position.set(-30, 80, 120); scene.add(s)
  const NAME: Record<MangledPart, string> = { body: '躯体', faces: '人脸团块', legs: '8 条腿', tentacles: '7 条触须' }
  if (mode === 'parts') {
    MANGLED_PARTS.forEach((pt, k) => {
      const g = buildMangledRig(); addMangledPart(g, pt, 0); g.position.set((k - 1.5) * 52, 0, 0); g.rotation.y = 0.5; scene.add(g)
      const t0 = prepareMangledPart(pt, 0).tris, t1 = prepareMangledPart(pt, 1).tris
      label3(V3((k - 1.5) * 52, pt === 'legs' ? 44 : 40, 0), `${NAME[pt]}<br><span class="s">精细 ${t0} 面 · 远景 ${t1} 面</span>`, -10)
    })
    persp(40, V3(0, 30, 175), V3(0, 21, 0), 800)
  } else {
    for (const [k, lod] of [[0, 0], [1, 1]] as [number, 0 | 1][]) { const g = buildMangledMesh(1, lod); g.position.set((k - 0.5) * 70, 0, 0); g.rotation.y = 0.6; scene.add(g); budgets[lod ? '远景' : '精细'] = mangledBudget(g) }
    label3(V3(-35, 44, 0), '精细（近处）', -10); label3(V3(35, 44, 0), '远景（远处）', -10)
    persp(40, V3(0, 30, 170), V3(0, 22, 0), 800)
  }
} else if (mode === 'faces') {
  scene.background = new THREE.Color('#2a2a2e')
  scene.add(new THREE.HemisphereLight('#c8c8cc', '#2a2826', 0.9))
  const s = new THREE.SpotLight('#fff0e0', 700, 120, 0.6, 0.6, 1.2); s.position.set(30, 10, 25); s.target.position.copy(MANGLED_BODY); scene.add(s, s.target)
  const m = mangled(); m.rotation.y = 0; scene.add(m)
  persp(45, V3(24, MANGLED_BODY.y - 14, 16), MANGLED_BODY.clone().add(V3(2, -4, 0)), 600)
} else if (mode === 'facecu' || mode === 'tentcu' || mode === 'legcu') {
  // 单部位特写：只挂一个部位，便于看细节
  scene.background = new THREE.Color('#2a2a2e')
  scene.add(new THREE.HemisphereLight('#d0d0d4', '#2a2826', 1.4))
  const part: MangledPart = mode === 'facecu' ? 'faces' : mode === 'tentcu' ? 'tentacles' : 'legs'
  const g = buildMangledRig(); addMangledPart(g, part, 0); if (part !== 'faces') addMangledPart(g, 'body', 0); scene.add(g)
  const tgt = mode === 'facecu' ? MANGLED_BODY.clone().add(V3(3, -6, 0)) : mode === 'tentcu' ? MANGLED_BODY.clone().add(V3(2, -12, 0)) : V3(17, 30, 6)
  const eye = mode === 'facecu' ? V3(9, MANGLED_BODY.y - 22, 3) : mode === 'tentcu' ? V3(22, MANGLED_BODY.y - 16, 10) : V3(40, 30, 30)
  const s = new THREE.DirectionalLight('#fff0e0', 2.6); s.position.copy(eye).add(V3(0, 15, 10)); s.target.position.copy(tgt); scene.add(s, s.target)
  persp(mode === 'legcu' ? 50 : 40, eye, tgt, 600)
}

if (Q.get('dbg')) scene.traverse((o) => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh && Array.isArray(m.material)) m.material = m.material.map((x, i) => i === Number(Q.get('dbg')) ? new THREE.MeshBasicMaterial({ color: '#ff00ff', side: THREE.DoubleSide }) : x) })
for (const f of pending3) f()
const b = Object.entries(budgets).map(([k, v]) => `${k} ${v.draws}次/${v.tris}面/${v.bones}骨`).join(' · ')
label(W / 2, 8, `<span class="s">${b}${QA_CPU_SKIN ? ' · CPU 蒙皮' : ''}${real ? ' · 真实材质' : ' · 经典材质'}</span>`)
if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
let retries = 0
for (; retries < 6; retries++) {
  renderer.render(scene, cam)
  const bad = (renderer.info.programs ?? []).some((p) => (p as unknown as { diagnostics?: { runnable: boolean } }).diagnostics?.runnable === false)
  if (!bad) break
}
const w = window as unknown as Record<string, unknown>
const info: unknown[] = []
scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.userData.cpuSkin) { const g = m.geometry; g.computeBoundingBox(); info.push({ groups: g.groups.length, vis: m.visible, bb: g.boundingBox, mats: (m.material as THREE.Material[]).map((x) => x.type + ':' + x.visible) }) } })
w.__info = { info, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }
w.__retries = retries; w.__budget = budgets; w.__ready = true
