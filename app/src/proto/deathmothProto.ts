// 原型预览页：死亡飞蛾（Entity 4）重制——第 1 阶段静态建模。
// ?mode=lineup（四形态 + 卵囊 + 标尺/人形）| male | female | top（雌雄俯视翅面）| guard（白瓷砖走廊，参照附图）
//      | larva（幼虫正面特写，参照附图）| eggs（卵囊特写，参照附图）| pillar | nest（L5 巢房：覆层、门框增生、卵囊、卵柱、种群）
// &real=1 真实材质；&cpu=1 CPU 蒙皮替身（可选软件调试；验收使用原生 GPU 蒙皮）；&cam=x,y,z&look=x,y,z 自定义镜头
import * as THREE from 'three'
import { buildDeathmothMesh, mothBudget } from '../game/renderer/deathmothMesh'
import { buildMothDoorGrowth, buildMothEggCluster, buildMothEggPillar, buildMothGelBall, buildMothNestCoat } from '../game/renderer/mothNestMesh'
import { setMaterialMode } from '../game/renderer/shared'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'
import type { MothForm } from '../game/entities/types'

const Q = new URLSearchParams(location.search)
const mode = Q.get('mode') ?? 'lineup'
const real = Q.get('real') === '1'
if (real) setMaterialMode('realistic')
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
if (real) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15 }
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene()
const lab = document.getElementById('lab')!
const label = (x: number, y: number, txt: string) => lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${x}px;top:${y}px">${txt}</div>`)
let cam: THREE.Camera = new THREE.PerspectiveCamera(50, W / H, 0.01, 60)
const pending3: (() => void)[] = []
const label3 = (p: THREE.Vector3, txt: string, dy = 0) => { pending3.push(() => { cam.updateMatrixWorld(true); const v = p.clone().project(cam); label((v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H + dy, txt) }) }
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
let budget = { meshes: 0, draws: 0, tris: 0, bones: 0 }
const budgets: Record<string, ReturnType<typeof mothBudget>> = {}
const moth = (form: MothForm, scale = 1) => { const g = buildDeathmothMesh(form, scale); const b = mothBudget(g); budgets[form] = b; if (b.tris > budget.tris) budget = b; return g }

function tileTex(base: string, line: string, n = 8, w = 256, h = 256) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  const g = cv.getContext('2d')!; g.fillStyle = base; g.fillRect(0, 0, w, h)
  for (let i = 0; i < 3000; i++) { const v = Math.random() * 30 - 15; g.fillStyle = `rgba(${128 + v},${128 + v},${128 + v},0.06)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2) }
  g.strokeStyle = line; g.lineWidth = 2; for (let k = 0; k <= n; k++) { g.beginPath(); g.moveTo(0, k * h / n); g.lineTo(w, k * h / n); g.stroke(); g.beginPath(); g.moveTo(k * w / n, 0); g.lineTo(k * w / n, h); g.stroke() }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t
}
function human(x: number, z: number) {
  const m = new THREE.MeshLambertMaterial({ color: '#8c8a84' }), g = new THREE.Group()
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 4, 10), m); torso.position.y = 1.23; torso.scale.z = 0.6; g.add(torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), m); head.position.y = 1.64; g.add(head)
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.78, 4, 8), m); leg.position.set(s * 0.09, 0.45, 0); g.add(leg); const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.56, 4, 8), m); arm.position.set(s * 0.23, 1.15, 0); g.add(arm) }
  g.position.set(x, 0, z); scene.add(g); return g
}
function ruler(x: number, z: number, top: number, step = 0.25) {
  const g = new THREE.Group(), my = new THREE.MeshBasicMaterial({ color: '#e0c060' }), mw = new THREE.MeshBasicMaterial({ color: '#f0ece0' })
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.01, top, 0.01), my); bar.position.y = top / 2; g.add(bar)
  for (let k = 0; k * step <= top + 1e-6; k++) { const major = Math.abs((k * step) % 0.5) < 1e-6; const t = new THREE.Mesh(new THREE.BoxGeometry(major ? 0.1 : 0.05, 0.008, 0.008), major ? my : mw); t.position.set(major ? 0.05 : 0.025, k * step, 0); g.add(t) }
  g.position.set(x, 0, z); scene.add(g); return g
}
const lights = (k = 1) => { scene.add(new THREE.HemisphereLight('#efeae0', '#3a352e', 0.9 * k)); const s = new THREE.DirectionalLight('#fff6e8', 1.7 * k); s.position.set(2, 4, 5); scene.add(s); const f = new THREE.DirectionalLight('#cfd8ff', 0.45 * k); f.position.set(-3, 1, -2); scene.add(f) }
const persp = (fov: number, pos: THREE.Vector3, look: THREE.Vector3) => {
  const c = new THREE.PerspectiveCamera(fov, W / H, 0.005, 60)
  const qc = Q.get('cam'), ql = Q.get('look')
  if (qc) { const [x, y, z] = qc.split(',').map(Number); pos = V3(x, y, z) }
  if (ql) { const [x, y, z] = ql.split(',').map(Number); look = V3(x, y, z) }
  c.position.copy(pos); c.lookAt(look); cam = c; return c
}

if (mode === 'lineup') {
  scene.background = new THREE.Color('#2a2a2c')
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshLambertMaterial({ color: '#4a4844' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
  const back = new THREE.Mesh(new THREE.PlaneGeometry(20, 4), new THREE.MeshLambertMaterial({ color: '#3a3936' })); back.position.set(0, 2, -1.2); scene.add(back)
  lights()
  ruler(-1.45, 0, 1.75)
  human(1.95, -0.1)
  const eggs = buildMothEggCluster(1, undefined, 0.2); eggs.rotation.x = -Math.PI / 2; eggs.position.set(-1.2, 0, 0.1); scene.add(eggs)
  const larva = moth('larva'); larva.position.set(-0.75, 0, 0.1); larva.rotation.y = -0.6; scene.add(larva)
  const male = moth('male'); male.position.set(-0.2, 0.9, 0.05); male.rotation.set(0.9, -0.35, 0); scene.add(male)
  const fem = moth('female'); fem.position.set(0.45, 1.05, 0.05); fem.rotation.set(0.9, -0.35, 0); scene.add(fem)
  const guard = moth('guard'); guard.position.set(1.05, 0, 0); guard.rotation.y = -0.55; scene.add(guard)
  const c = new THREE.OrthographicCamera(-1.02 * W / H, 1.02 * W / H, 1.02, -1.02, 0.1, 40); c.position.set(0.3, 0.9, 10); c.lookAt(0.3, 0.9, 0); cam = c
  for (let y = 0; y <= 1.5 + 1e-6; y += 0.5) label3(V3(-1.45, y, 0), `<span class="s">${y}m</span>`, -10)
  label3(V3(-1.2, 0.3, 0.1), '卵囊<br><span class="s">卵 3–5cm</span>')
  label3(V3(-0.75, 0.3, 0.1), '幼虫<br><span class="s">体长 0.1m · 刺毛 7cm</span>')
  label3(V3(-0.2, 0.68, 0), '雄性<br><span class="s">翼展 0.34m</span>')
  label3(V3(0.45, 0.8, 0), '雌性<br><span class="s">翼展 0.44m</span>')
  label3(V3(1.05, 1.12, 0), '禁卫级<br><span class="s">8 附肢 0.73m · 翼展 0.6m</span>')
  label3(V3(1.95, 1.8, -0.1), '<span class="s">参照人形 1.75m</span>')
} else if (mode === 'male' || mode === 'female') {
  scene.background = new THREE.Color('#1d1c1a')
  lights()
  const m = moth(mode); scene.add(m); m.rotation.set(0.25, 0, 0)
  const k = mode === 'female' ? 1.3 : 1
  persp(34, V3(0.42 * k, 0.24 * k, 0.55 * k), V3(-0.01, 0, 0))
  label(W / 2, H - 46, `<span class="s">${mode === 'male' ? '雄性：黄褐、宽大羽状触角、细长针状口器（半卷）、六足收拢下垂' : '雌性：锈褐、胸腹粗壮、强颚 + 颚钳、腹末腐蚀腺（苍黄）与产卵器'}</span>`)
} else if (mode === 'top') {
  scene.background = new THREE.Color('#1d1c1a')
  lights(1.1)
  const a = moth('male'); a.position.set(-0.3, 0, 0); scene.add(a)
  const b = moth('female'); b.position.set(0.3, 0, 0); scene.add(b)
  const c = new THREE.OrthographicCamera(-0.62 * W / H, 0.62 * W / H, 0.62, -0.62, 0.01, 20); c.position.set(0, 3, 0.0001); c.up.set(1, 0, 0); c.lookAt(0, 0, 0)
  c.up.set(0, 0, -1); c.position.set(0, 3, 0); c.lookAt(0, 0, 0); cam = c
  a.rotation.y = Math.PI / 2; b.rotation.y = Math.PI / 2
  label3(V3(-0.3, 0, 0.3), '雄性 翼展 0.34m'); label3(V3(0.3, 0, 0.35), '雌性 翼展 0.44m')
} else if (mode === 'guard') {
  // 参照附图：白瓷砖地铁通道，禁卫级站在通道中央，镜头低机位正对
  scene.background = new THREE.Color('#111')
  const wallT = tileTex('#d8dad6', '#b9bcb6', 6), floorT = tileTex('#3a3a3a', '#2a2a2a', 4)
  wallT.repeat.set(10, 2); floorT.repeat.set(2, 12)
  const len = 24, wd = 2.4, hh = 2.6
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(wd, len), new THREE.MeshLambertMaterial({ map: floorT })); fl.rotation.x = -Math.PI / 2; fl.position.z = -len / 2 + 2; scene.add(fl)
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(len, hh), new THREE.MeshLambertMaterial({ map: wallT })); w.rotation.y = -s * Math.PI / 2; w.position.set(s * wd / 2, hh / 2, -len / 2 + 2); scene.add(w); const sk = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, len), new THREE.MeshLambertMaterial({ color: '#1c1c1c' })); sk.position.set(s * (wd / 2 - 0.01), 0.09, -len / 2 + 2); scene.add(sk) }
  const ce = new THREE.Mesh(new THREE.PlaneGeometry(wd, len), new THREE.MeshLambertMaterial({ color: '#cfcfca' })); ce.rotation.x = Math.PI / 2; ce.position.set(0, hh, -len / 2 + 2); scene.add(ce)
  for (let k = 0; k < 6; k++) { const lt = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.16), new THREE.MeshBasicMaterial({ color: '#fffaf0' })); lt.position.set(0, hh - 0.03, 0.5 - k * 3.5); scene.add(lt); const pl = new THREE.PointLight('#fff4e0', 2.2, 7, 1.4); pl.position.set(0, hh - 0.2, 0.5 - k * 3.5); scene.add(pl) }
  scene.add(new THREE.HemisphereLight('#e0e0dc', '#303030', 0.55))
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 10), new THREE.MeshLambertMaterial({ color: '#7a2a20' })); pipe.rotation.x = Math.PI / 2; pipe.position.set(wd / 2 - 0.12, hh - 0.25, -len / 2 + 2); scene.add(pipe)
  const g = moth('guard'); g.position.set(0, 0, -0.6); g.rotation.y = -Math.PI / 2; scene.add(g)
  persp(48, V3(0.15, 0.8, 1.6), V3(0, 0.5, -0.6))
} else if (mode === 'guardhead') {
  scene.background = new THREE.Color('#141414')
  scene.add(new THREE.HemisphereLight('#e0e0dc', '#202020', 0.5))
  const key = new THREE.DirectionalLight('#fff4e4', 2.0); key.position.set(1.2, 2.2, 1.0); scene.add(key)
  const rim = new THREE.DirectionalLight('#b8c4ff', 0.8); rim.position.set(-2, 1, -1.5); scene.add(rim)
  const g = moth('guard'); g.rotation.y = -Math.PI / 2 + (Q.get('yaw') ? +Q.get('yaw')! : 0.75); scene.add(g)
  persp(30, V3(0.12, 0.66, 0.78), V3(0.03, 0.62, 0.0))
} else if (mode === 'larva') {
  scene.background = new THREE.Color('#050505')
  scene.add(new THREE.HemisphereLight('#d8d8dc', '#101010', 0.35))
  const key = new THREE.DirectionalLight('#f4f2ee', 2.2); key.position.set(1.5, 2.5, 1.2); scene.add(key)
  const rim = new THREE.DirectionalLight('#c8d0ff', 0.9); rim.position.set(-2, 1, -2); scene.add(rim)
  const l = moth('larva'); scene.add(l)
  persp(30, V3(0.27, 0.1, 0.09), V3(0.03, 0.025, 0))
} else if (mode === 'eggs') {
  scene.background = new THREE.Color('#0b0705')
  scene.add(new THREE.HemisphereLight('#ffd8b0', '#200c06', 0.5))
  const key = new THREE.DirectionalLight('#ffe8cc', 2.4); key.position.set(0.6, 1.2, 1.5); scene.add(key)
  const e = buildMothEggCluster(2, undefined, 0.3); scene.add(e)
  const b = mothBudget(e); budget = b; budgets.eggs = b
  persp(30, V3(0.12, 0.08, 0.5), V3(0, 0, 0.1))
} else if (mode === 'pillar') {
  scene.background = new THREE.Color('#141110')
  lights(0.9)
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshLambertMaterial({ color: '#3a302a' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
  const p = buildMothEggPillar(1, 1.2); scene.add(p); budget = mothBudget(p); budgets.pillar = budget
  const gb = buildMothGelBall(1, 0.3); gb.position.set(0.7, 0, 0.1); scene.add(gb)
  persp(36, V3(1.3, 1.25, 2.9), V3(0.35, 0.6, 0))
  label3(V3(0, 1.3, 0), '卵柱 1.2m'); label3(V3(0.7, 0.68, 0.1), '胶状球（溶解后的猎物）')
} else if (mode === 'nest') {
  // L5 巢房：无灯小房间，墙面覆层、门框增生、墙角卵囊、中央卵柱，雌性守巢、幼虫啃墙、禁卫级在巢心
  scene.background = new THREE.Color('#060504')
  const RW = 4.2, RD = 3.6, RH = 2.7
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), new THREE.MeshLambertMaterial({ color: '#4a3226' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
  const ce = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), new THREE.MeshLambertMaterial({ color: '#3a2a22' })); ce.rotation.x = Math.PI / 2; ce.position.y = RH; scene.add(ce)
  const back = buildMothNestCoat(1, RW, RH, 0.24); back.position.set(0, RH / 2, -RD / 2); scene.add(back)
  const left = buildMothNestCoat(2, RD, RH, 0.22); left.rotation.y = Math.PI / 2; left.position.set(-RW / 2, RH / 2, 0); scene.add(left)
  const right = buildMothNestCoat(3, RD, RH, 0.2); right.rotation.y = -Math.PI / 2; right.position.set(RW / 2, RH / 2, 0); scene.add(right)
  const door = buildMothDoorGrowth(1); door.rotation.y = -Math.PI / 2; door.position.set(RW / 2 - 0.05, 0, 0.8); scene.add(door)
  const sacs: [number, number, number, number, number][] = [[-RW / 2 + 0.25, 2.2, -RD / 2 + 0.25, 0.7, 0.5], [RW / 2 - 0.3, 2.3, -RD / 2 + 0.28, -0.7, 0.4], [-RW / 2 + 0.24, 0.9, 0.6, 1.57, 0.3]]
  sacs.forEach(([x, y, z, ry, r], i) => { const s = buildMothEggCluster(10 + i, undefined, r * 0.7); s.position.set(x, y, z); s.rotation.y = ry; scene.add(s) })
  const pillar = buildMothEggPillar(4, 1.25); pillar.position.set(-0.5, 0, -0.8); scene.add(pillar)
  const g = moth('guard'); g.position.set(0.35, 0, -0.75); g.rotation.y = -Math.PI * 0.3; scene.add(g)
  for (let k = 0; k < 4; k++) { const f = moth('female'); f.position.set(-1 + k * 0.7, 1.4 + (k % 2) * 0.35, -0.2 + (k % 3) * 0.4); f.rotation.set(0.3, 0.6 + k, 0.2 * (k % 2 ? 1 : -1)); scene.add(f) }
  for (let k = 0; k < 5; k++) { const l = moth('larva'); l.position.set(-1.2 + k * 0.28, 0, 0.6 + (k % 2) * 0.25); l.rotation.y = k * 1.3; scene.add(l) }
  scene.add(new THREE.HemisphereLight('#c8a080', '#140804', 0.35))
  const fl2 = new THREE.SpotLight('#fff1dc', 30, 12, 0.7, 0.6, 1.3); fl2.position.set(1.6, 1.5, 1.6); fl2.target.position.set(-0.4, 0.9, -1); scene.add(fl2, fl2.target)
  const glow = new THREE.PointLight('#ffb070', 2.5, 4, 1.6); glow.position.set(-1.2, 2.2, -1); scene.add(glow)
  persp(60, V3(1.75, 1.45, 1.65), V3(-0.4, 1.0, -0.9))
}

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
w.__retries = retries; w.__budget = budgets; w.__ready = true
