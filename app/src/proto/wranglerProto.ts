// 原型预览页：牧蛇（Entity 75）重制——第 1 阶段静态建模。
// ?mode=lineup（三变种 + 参照人形）| male（岩洞顶上钻出，参照图一）| female（矿道里盘踞，参照图二）| pregnant（受孕雌性腹部）
//      | juvenile（幼体半透明特写）| heads（三种头部特写）| mouth（雄性脱颌 + 雌性张钳）| eggs（卵枝三个成熟度 + 钻孔）| lod
// &real=1 真实材质；&cam=x,y,z&look=x,y,z 自定义镜头
import * as THREE from 'three'
import { buildWranglerMesh, setWranglerSpine, setWranglerMouth, wranglerBudget, buildEggBranch, buildBurrowHole, WRANGLER_DIM, BELLY, type WranglerRig, type WranglerKind, type WranglerLod } from '../game/renderer/wranglerMesh'
import { setMaterialMode } from '../game/renderer/shared'

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
let cam: THREE.Camera = new THREE.PerspectiveCamera(50, W / H, 0.05, 400)
const pending3: (() => void)[] = []
const label3 = (p: THREE.Vector3, txt: string, dy = 0) => { pending3.push(() => { cam.updateMatrixWorld(true); const v = p.clone().project(cam); label((v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H + dy, txt) }) }
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const budgets: Record<string, ReturnType<typeof wranglerBudget>> = {}
const NAME: Record<WranglerKind, string> = { male: '雄性', female: '雌性', juvenile: '幼体' }

function snake(kind: WranglerKind, o: { pregnant?: boolean; lod?: WranglerLod; light?: boolean; tag?: string } = {}) {
  const g = buildWranglerMesh(kind, o)
  budgets[o.tag ?? (NAME[kind] + (o.pregnant ? '（受孕）' : ''))] = wranglerBudget(g)
  scene.add(g)
  return { g, rig: g.userData.wranglerRig as WranglerRig }
}
/** 平滑曲线 → 折线 */
const curve = (pts: THREE.Vector3[], n = 200) => new THREE.CatmullRomCurve3(pts, false, 'centripetal').getSpacedPoints(n)
/** 盘踞姿态：头在 head 处朝 dir 方向，颈弯下落地，身体在 center 周围绕 turns 圈 */
function coilPath(head: THREE.Vector3, dir: number, center: THREE.Vector3, R0: number, R1: number, turns: number, y: number, len: number) {
  const pts: THREE.Vector3[] = [head.clone()]
  const back = V3(-Math.cos(dir), 0, -Math.sin(dir))
  pts.push(head.clone().addScaledVector(back, len * 0.04).add(V3(0, -len * 0.01, 0)))
  pts.push(head.clone().addScaledVector(back, len * 0.09).setY(head.y * 0.45 + y * 0.55))
  const a0 = Math.atan2(pts[2].z - center.z, pts[2].x - center.x)
  const steps = Math.ceil(turns * 16)
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, a = a0 + t * turns * Math.PI * 2
    const r = R0 + (R1 - R0) * t
    pts.push(V3(center.x + Math.cos(a) * r, y + (i % 16 === 8 ? 0.0 : 0), center.z + Math.sin(a) * r))
  }
  return curve(pts, 400)
}
function human(x: number, z: number, col = '#8c8a84', ry = 0) {
  const m = new THREE.MeshLambertMaterial({ color: col }), g = new THREE.Group()
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 4, 10), m); torso.position.y = 1.23; torso.scale.z = 0.6; g.add(torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), m); head.position.y = 1.64; g.add(head)
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.78, 4, 8), m); leg.position.set(s * 0.09, 0.45, 0); g.add(leg); const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.56, 4, 8), m); arm.position.set(s * 0.23, 1.15, 0); g.add(arm) }
  g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g); return g
}
function ruler(x: number, z: number, top: number, step = 0.5) {
  const g = new THREE.Group(), my = new THREE.MeshBasicMaterial({ color: '#e0c060' }), mw = new THREE.MeshBasicMaterial({ color: '#f0ece0' })
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, top, 0.03), my); bar.position.y = top / 2; g.add(bar)
  for (let k = 0; k * step <= top + 1e-6; k++) { const major = k % 2 === 0; const t = new THREE.Mesh(new THREE.BoxGeometry(major ? 0.3 : 0.15, 0.02, 0.02), major ? my : mw); t.position.set(major ? 0.15 : 0.07, k * step, 0); g.add(t) }
  g.position.set(x, 0, z); scene.add(g); return g
}
function hash(x: number, y: number, z: number) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s) }
function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf)
  let r = 0
  for (let k = 0; k < 8; k++) { const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1; r += hash(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w) }
  return r * 2 - 1
}
function rockMat(base = '#5a5248') {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d')!
  g.fillStyle = base; g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 9000; i++) { const v = Math.random(); g.fillStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 245 : 0},${v > 0.5 ? 230 : 0},${0.04 + Math.random() * 0.08})`; g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3) }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); t.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide, vertexColors: true })
}
/** 岩洞洞厅：噪声位移的穹顶半球 + 地面 + 钟乳石 */
function caveHall(R: number, Hh: number, seed = 1) {
  const geo = new THREE.SphereGeometry(1, 96, 48, 0, Math.PI * 2, 0, Math.PI * 0.62)
  const P = geo.attributes.position, cols: number[] = []
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i)
    const n = noise3(x * 3 + seed, y * 3, z * 3) * 0.12 + noise3(x * 9, y * 9 + seed, z * 9) * 0.04
    const k = 1 + n
    P.setXYZ(i, x * R * k, Math.max(-0.3, y) * Hh * k, z * R * k)
    const v = 0.55 + n * 2.2; cols.push(v, v * 0.96, v * 0.9)
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); geo.computeVertexNormals()
  const dome = new THREE.Mesh(geo, rockMat()); scene.add(dome)
  const fl = new THREE.Mesh(new THREE.CircleGeometry(R * 1.1, 64), rockMat('#4a443c')); fl.rotation.x = -Math.PI / 2
  ;(fl.geometry as THREE.BufferGeometry).setAttribute('color', new THREE.Float32BufferAttribute(new Array(fl.geometry.attributes.position.count * 3).fill(0.8), 3))
  scene.add(fl)
  const sm = rockMat('#6a6050')
  for (let k = 0; k < 70; k++) {
    const a = hash(k, 1, seed) * Math.PI * 2, r = R * (0.15 + 0.75 * hash(k, 2, seed)), len = 1 + hash(k, 3, seed) * 4
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.15 + len * 0.08, len, 6), sm)
    ;(c.geometry as THREE.BufferGeometry).setAttribute('color', new THREE.Float32BufferAttribute(new Array(c.geometry.attributes.position.count * 3).fill(0.75), 3))
    const top = Hh * Math.sqrt(Math.max(0, 1 - (r / R) ** 2)) * 0.98
    c.rotation.x = Math.PI; c.position.set(Math.cos(a) * r, top - len / 2, Math.sin(a) * r); scene.add(c)
  }
}
/** 矿道：拱形巷道 + 拱架 + 枕木 + 吊灯 */
function mineTunnel(len: number, w: number, h: number) {
  const shape = new THREE.Shape(); shape.moveTo(-w / 2, 0); shape.lineTo(-w / 2, h * 0.55); shape.absarc(0, h * 0.55, w / 2, Math.PI, 0, true); shape.lineTo(w / 2, 0)
  const pts = shape.getSpacedPoints(60)
  const geo = new THREE.BufferGeometry(), pos: number[] = [], col: number[] = [], idx: number[] = []
  const nz = 80
  for (let i = 0; i <= nz; i++) for (let j = 0; j < pts.length; j++) {
    const z = -len / 2 + (i / nz) * len, p = pts[j], n = noise3(p.x, p.y, z * 0.5) * 0.15
    pos.push(p.x * (1 + n * 0.1), p.y, z); const v = 0.5 + n * 1.5 + (Math.sin(z * 4) > 0.9 ? -0.15 : 0); col.push(v, v * 0.9, v * 0.8)
  }
  for (let i = 0; i < nz; i++) for (let j = 0; j < pts.length - 1; j++) { const a = i * pts.length + j, b = a + pts.length; idx.push(a, b, a + 1, a + 1, b, b + 1) }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals()
  scene.add(new THREE.Mesh(geo, rockMat('#5c4a3a')))
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, len), new THREE.MeshLambertMaterial({ color: '#3a3128' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
  const steel = new THREE.MeshLambertMaterial({ color: '#4a3c30' })
  for (let z = -len / 2 + 1; z < len / 2; z += 1.6) {
    const arch = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(shape.getSpacedPoints(30).map((p) => V3(p.x * 0.97, p.y * 0.97, z))), 30, 0.07, 5, false), steel); scene.add(arch)
  }
  for (let z = -len / 2; z < len / 2; z += 0.7) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.2), new THREE.MeshLambertMaterial({ color: '#2a221a' })); s.position.set(0.9, 0.04, z); scene.add(s) }
  for (const z of [-6, -13]) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffcf7a' })); bulb.position.set(0, h * 0.55 + w / 2 - 0.45, z); scene.add(bulb)
    const l = new THREE.PointLight('#ffb35a', 18, 14, 1.5); l.position.copy(bulb.position); scene.add(l)
  }
}
const persp = (fov: number, pos: THREE.Vector3, look: THREE.Vector3, far = 400) => {
  const c = new THREE.PerspectiveCamera(fov, W / H, 0.05, far)
  const qc = Q.get('cam'), ql = Q.get('look')
  if (qc) { const [x, y, z] = qc.split(',').map(Number); pos = V3(x, y, z) }
  if (ql) { const [x, y, z] = ql.split(',').map(Number); look = V3(x, y, z) }
  c.position.copy(pos); c.lookAt(look); cam = c; return c
}
function flashlight(from: THREE.Vector3, to: THREE.Vector3, k = 60) { const s = new THREE.SpotLight('#fff4e0', k, 40, 0.42, 0.55, 1.3); s.position.copy(from); s.target.position.copy(to); scene.add(s, s.target); return s }

if (mode === 'lineup') {
  scene.background = new THREE.Color('#2a2a2c')
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ color: '#5a554e' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
  scene.add(new THREE.HemisphereLight('#f0ece4', '#3a352e', 1.1)); const s = new THREE.DirectionalLight('#fff6e8', 2.0); s.position.set(6, 10, 12); scene.add(s)
  const rim = new THREE.DirectionalLight('#cfe0ff', 1.2); rim.position.set(-8, 5, -10); scene.add(rim)
  const m = snake('male'); setWranglerSpine(m.rig, coilPath(V3(-7, 3.4, 2), 0.25, V3(-9.2, 0, -3.5), 2.2, 4.2, 1.15, 0.78, WRANGLER_DIM.male.len))
  const f = snake('female', { pregnant: true }); setWranglerSpine(f.rig, coilPath(V3(3, 3.9, 2.4), 0.2, V3(1.2, 0, -3.8), 2.6, 4.6, 1.0, 0.98, WRANGLER_DIM.female.len))
  const j = snake('juvenile'); setWranglerSpine(j.rig, coilPath(V3(9.5, 0.75, 3), 0.4, V3(9.3, 0, 2.0), 0.5, 0.75, 1.3, 0.18, WRANGLER_DIM.juvenile.len))
  human(7.6, 3.4, '#9a968e', -0.4)
  ruler(-12.5, 3, 4)
  persp(42, V3(0, 7.5, 24), V3(0, 1.8, -1))
  for (let y = 0; y <= 4; y += 1) label3(V3(-12.5, y, 3), `<span class="s">${y}m</span>`, -10)
  label3(V3(-7, 5.2, 2), '雄性<br><span class="s">躯干粗 1.6m · 长 32m（游戏里两头埋在岩里）</span>', -20)
  label3(V3(3, 5.6, 2.4), '雌性（受孕）<br><span class="s">躯干粗 2m · 长 30m · 腹部透出种子卵</span>', -20)
  label3(V3(9.5, 1.6, 3), '幼体<br><span class="s">长 4.2m · 半透明</span>', -26)
  label3(V3(7.6, 2.0, 3.4), '<span class="s">参照人形 1.75m</span>', -4)
} else if (mode === 'male') {
  // 图一：洞厅高处岩壁上钻出，白色斜眼俯视脚下打手电的人
  scene.background = new THREE.Color('#020202')
  caveHall(16, 13, 3)
  scene.fog = new THREE.FogExp2('#050505', 0.025)
  scene.add(new THREE.HemisphereLight('#3a3a40', '#0a0806', 0.45))
  // 洞厅穹顶 r=12 处的岩壁（y≈8.6）钻出一个洞，雄性从洞里探出、头垂向脚下的人
  const hp = V3(-4, 8.3, -11.2), outward = hp.clone().setY(hp.y * 0.6).normalize()
  const hole = buildBurrowHole(1.15, 2); hole.position.copy(hp); hole.lookAt(hp.clone().sub(outward)); scene.add(hole)
  const m = snake('male')
  setWranglerSpine(m.rig, curve([V3(-1.5, 5.9, -5.6), V3(-2.0, 7.4, -7.0), V3(-2.9, 8.4, -8.8), V3(-3.7, 8.5, -10.4), hp.clone().addScaledVector(outward, 1.5), hp.clone().addScaledVector(outward, 30)], 300))
  setWranglerMouth(m.rig, 0.06)
  human(0.6, 1.5, '#4a4844', 2.3)
  flashlight(V3(0.5, 1.45, 1.3), V3(-2.4, 7.4, -8.5), 70)
  persp(60, V3(5.5, 1.7, -1.0), V3(-2.4, 7.0, -8.2))
} else if (mode === 'female') {
  // 图二：矿道里盘着的雌性，头抬起、两只圆眼
  scene.background = new THREE.Color('#050403')
  mineTunnel(30, 6, 5)
  scene.add(new THREE.HemisphereLight('#4a3a2a', '#0a0806', 0.5))
  const f = snake('female')
  setWranglerSpine(f.rig, curve([V3(-1.5, 3.6, -3.6), V3(-1.8, 3.2, -4.6), V3(-2.0, 2.2, -5.2), V3(-1.8, 1.2, -6.0), V3(-0.4, 1.0, -7.4), V3(-1.6, 1.0, -9.0), V3(-2.0, 2.4, -8.0), V3(-2.2, 4.4, -7.0), V3(-1.4, 5.2, -8.5), V3(-2.0, 4.2, -10.5), V3(-2.0, 1.0, -11.0), V3(-0.8, 1.0, -13), V3(-1.9, 1.0, -16), V3(-2.4, 1.6, -22), V3(-2.6, 1.6, -40)], 400))
  setWranglerMouth(f.rig, 0.15)
  persp(62, V3(1.2, 1.8, 4.5), V3(-1.2, 2.6, -6))
} else if (mode === 'pregnant') {
  // 受孕（前）与未受孕（后）对照，侧翻露出腹面
  scene.background = new THREE.Color('#1c1c1e')
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ color: '#4a453e' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
  scene.add(new THREE.HemisphereLight('#e8e4dc', '#2a2622', 1.0)); const s = new THREE.DirectionalLight('#fff4e0', 2.6); s.position.set(3, 4, 12); scene.add(s)
  const f = snake('female', { pregnant: true })
  setWranglerSpine(f.rig, curve([V3(-6, 1.75, 1.5), V3(0, 1.75, 1.5), V3(10, 1.75, 1.5), V3(16, 1.75, -2), V3(26, 1.75, -10)], 300), () => -1.15)
  const f2 = snake('female')
  setWranglerSpine(f2.rig, curve([V3(-6, 1.15, -3), V3(0, 1.15, -3), V3(10, 1.15, -3), V3(16, 1.15, -7), V3(26, 1.15, -15)], 300), () => -1.15)
  persp(44, V3(4.5, 0.9, 13), V3(4.5, 1.5, 0))
  label3(V3(-6 + (BELLY.s0 + BELLY.s1) / 2, 3.2, 1.5), '受孕雌性<br><span class="s">腹部鼓胀 · 绷薄的腹皮透出种子状卵</span>', -10)
  label3(V3(-6 + 2, 2.7, -3), '<span class="s">未受孕对照</span>', -10)
} else if (mode === 'juvenile') {
  scene.background = new THREE.Color('#141416')
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshLambertMaterial({ color: '#3e3a34' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
  scene.add(new THREE.HemisphereLight('#e8e4dc', '#2a2622', 0.8)); const s = new THREE.DirectionalLight('#fff4e0', 1.6); s.position.set(2, 4, 5); scene.add(s)
  const back = new THREE.DirectionalLight('#ffffff', 1.8); back.position.set(-2, 2, -5); scene.add(back)
  const j = snake('juvenile')
  setWranglerSpine(j.rig, curve([V3(-1.2, 0.55, 0.3), V3(-0.6, 0.3, 0.2), V3(0, 0.17, -0.2), V3(0.8, 0.17, 0.3), V3(1.6, 0.17, -0.2), V3(2.3, 0.17, 0.4), V3(3, 0.17, 0)], 200))
  persp(50, V3(-0.4, 1.5, 4.4), V3(0.2, 0.25, 0))
} else if (mode === 'heads' || mode === 'mouth') {
  scene.background = new THREE.Color('#202022')
  scene.add(new THREE.HemisphereLight('#e8e4dc', '#2a2622', 0.85)); const s = new THREE.DirectionalLight('#fff4e0', 2.2); s.position.set(5, 4, 6); scene.add(s)
  const rim = new THREE.DirectionalLight('#c8d8ff', 1.4); rim.position.set(-5, 3, -4); scene.add(rim)
  const open = mode === 'mouth' ? 1 : 0
  const m = snake('male'); setWranglerSpine(m.rig, curve([V3(-2.4, 1.4, 0), V3(-3.6, 1.0, -1.2), V3(-4.5, 0.8, -6), V3(-4.5, 0.8, -30)], 100)); setWranglerMouth(m.rig, open * 0.85)
  m.g.rotation.y = -0.15
  const f = snake('female'); setWranglerSpine(f.rig, curve([V3(1.2, 1.4, 0), V3(0, 1.1, -1.2), V3(-0.6, 1.0, -6), V3(-0.6, 1.0, -30)], 100)); setWranglerMouth(f.rig, open)
  const j = snake('juvenile'); setWranglerSpine(j.rig, curve([V3(3.6, 0.6, 0.6), V3(3.25, 0.5, 0.3), V3(3.1, 0.4, -0.4), V3(3.1, 0.4, -4)], 100))
  persp(36, V3(3.2, 1.8, 7.2), V3(0.4, 1.05, 0))
  label3(V3(-1.6, 2.6, 0), '雄性<br><span class="s">类人面 · 斜吊发光眼 · 裂到耳根的笑口</span>', -10)
  label3(V3(2, 2.6, 0), '雌性<br><span class="s">节肢样头甲 · 圆眼 · 口器钳</span>', -10)
  label3(V3(3.9, 1.1, 0.6), '幼体', -10)
} else if (mode === 'eggs') {
  scene.background = new THREE.Color('#121212')
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 8, 120, 60), rockMat())
  const P = wall.geometry.attributes.position, cols: number[] = []
  for (let i = 0; i < P.count; i++) { const n = noise3(P.getX(i) * 0.8, P.getY(i) * 0.8, 1) * 0.25; P.setZ(i, n); const v = 0.6 + n; cols.push(v, v * 0.95, v * 0.9) }
  wall.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); wall.geometry.computeVertexNormals(); wall.position.set(0, 4, 0); scene.add(wall)
  scene.add(new THREE.HemisphereLight('#e0dcd4', '#2a2622', 0.6)); const s = new THREE.DirectionalLight('#fff4e0', 2.0); s.position.set(3, 5, 8); scene.add(s)
  ;[0.25, 0.6, 1].forEach((k, i) => { const e = buildEggBranch(i + 1, k); e.position.set(-5 + i * 4, 4.6, 0.12); scene.add(e); label3(V3(-5 + i * 4, 2.6, 0.2), `卵枝 · 成熟度 ${Math.round(k * 100)}%`) })
  const h = buildBurrowHole(0.9, 4); h.position.set(6.2, 4.2, 0.1); scene.add(h); label3(V3(6.2, 2.6, 0.2), '钻孔')
  persp(42, V3(0.6, 4.4, 11.5), V3(0.6, 4.1, 0))
} else if (mode === 'lod') {
  scene.background = new THREE.Color('#2a2a2c')
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ color: '#5a554e' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
  scene.add(new THREE.HemisphereLight('#f0ece4', '#3a352e', 1.1)); const s = new THREE.DirectionalLight('#fff6e8', 2.0); s.position.set(6, 10, 12); scene.add(s)
  ;([0, 1, 2] as WranglerLod[]).forEach((lod) => {
    const m = snake('male', { lod, tag: `LOD${lod}` })
    const x = -7 + lod * 7
    setWranglerSpine(m.rig, curve([V3(x, 2.4, 1), V3(x - 0.6, 1.6, 0), V3(x - 0.4, 0.8, -2), V3(x + 1.4, 0.8, -4), V3(x - 1, 0.8, -7), V3(x - 1, 0.8, -30)], 160))
    label3(V3(x, 4, 1), `LOD${lod}`)
  })
  persp(42, V3(0, 5, 14), V3(0, 1.5, -1))
}

for (const f of pending3) f()
const b = Object.entries(budgets).map(([k, v]) => `${k} ${v.draws}次/${v.tris}面`).join(' · ')
label(W / 2, 8, `<span class="s">${b}${real ? ' · 真实材质' : ' · 经典材质'}</span>`)
renderer.render(scene, cam)
const w = window as unknown as Record<string, unknown>
w.__info = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }
w.__budget = budgets; w.__ready = true
