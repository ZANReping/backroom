// [ferren] Ferren（Entity 92）重制模型——商人之家的貂色（sable）雪貂，参照用户附图（家养雪貂实拍，仅作造型参考）。
// 体型：弓背细长，后半身隆起、肩颈低伏再抬头；体长约 0.6 m（鼻尖→臀，不含尾），尾约 0.24 m。
// 毛色（顶点色渐变 + 程序化毛丝贴图）：身体中段是奶油色底毛透出的浅色，背脊、臀部、肩胸是深棕护毛；
// 四肢和蓬松的尾巴深棕。头部：白脸，眼周一条深棕面罩横带，鼻梁深棕，吻部白，粉色鼻头；
// 白色圆耳（耳内粉）；亮黑眼带高光；吻侧细胡须。四肢末端是短爪脚掌。
// 结构：躯干/尾/四肢/头均为沿样条放样的平滑管体（无方块）。部件沿用旧方块模型的命名：
//   tag 'torso' / 'head'（头枢轴在颈根，渲染层待机时左右摆头），armL/armR/legL/legR 枢轴在肩/髋（rotation.x 前后摆）。
//   另在 userData.ferren 暴露 skull（颈端点头/歪头枢轴）、tail（尾根枢轴）供阶段 2 动画使用。
// 模型按 +Z 建造、地面 y=0；外层包 face 组（rotation.y=π/2）把正面转到实体约定的 +X（userData.facesZ=1，同 entitiesMesh 的统一包法）。
// 阶段 2：部件挂在 face→root 下，root 供动画整体摆姿；躯干/尾巴每实例一份几何，ferrenAnim 做脊柱弯曲形变。
// 贴图运行时 Canvas 生成（全部实例共享）；Node 下退化为纯顶点色。
// 另导出 buildFerrenNestMesh()：雪貂窝（圆形软垫窝 + 一条小被子），供阶段 3 放进商人之家的笼子。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { litMaterial } from './shared'
import { rng, V, gauss, sstep, canvasTex } from './houndMesh'

type RGB = [number, number, number]
const hex = (h: string): RGB => { const c = new THREE.Color(h); return [c.r, c.g, c.b] }
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k]
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
/** 分段平滑插值表：每行 [t, v1, v2, ...] */
const table = (tb: number[][], t: number, k: number) => {
  if (t <= tb[0][0]) return tb[0][k]
  for (let i = 1; i < tb.length; i++) if (t <= tb[i][0]) { const a = tb[i - 1], b = tb[i]; const s = sstep(0, 1, (t - a[0]) / (b[0] - a[0])); return a[k] + (b[k] - a[k]) * s }
  return tb[tb.length - 1][k]
}
/** 圆头端盖（0..1 段两端半球式收口） */
const capS = (t: number, e: number) => Math.sqrt(Math.max(0, Math.min(1, t / e)))
const capE = (t: number, e: number) => Math.sqrt(Math.max(0, Math.min(1, (1 - t) / e)))
/** 稳定的伪随机噪声（毛簇起伏） */
const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s) }

// ---------- 毛色 ----------
const C = {
  dark: hex('#24170f'), // 深棕近黑（四肢/尾/护毛最深处）
  brown: hex('#3d2a1d'), // 深棕护毛
  guard: hex('#6b5442'), // 护毛尖覆在奶油底毛上（背部过渡）
  cream: hex('#e6d4ae'), // 奶油色底毛
  creamHi: hex('#efe4c9'),
  white: hex('#f3eee4'),
  mask: hex('#2f1f16'),
  pink: hex('#dc9a94'),
  pinkIn: hex('#e8b0aa'),
  claw: hex('#d8cfc2'),
}

// ---------- 放样网格 ----------
/** rows×cols 网格放样：pt(t,a) 给顶点，col 给顶点色（线性 RGB），可选 uv 重复 */
function loft(seg: number, radial: number, pt: (t: number, a: number) => THREE.Vector3, col: (t: number, a: number, p: THREE.Vector3) => RGB, uRep = 1, vRep = 1) {
  const pos: number[] = [], uv: number[] = [], cl: number[] = [], idx: number[] = []
  for (let i = 0; i <= seg; i++) {
    const t = i / seg
    for (let j = 0; j <= radial; j++) {
      const a = ((j % radial) / radial) * Math.PI * 2 // 首尾两列同角（接缝处顶点/颜色/噪声一致）
      const p = pt(t, a), c = col(t, a, p)
      pos.push(p.x, p.y, p.z); uv.push((j / radial) * uRep, t * vRep); cl.push(c[0], c[1], c[2])
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1
    idx.push(a, a + 1, b, b, a + 1, b + 1) // 截面 a 自 +X 经 +Y 逆时针（沿 +T 看），此绕序法线朝外
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3))
  g.setIndex(idx); g.computeVertexNormals()
  return g
}
/** 沿样条的椭圆截面管体：rad(t) → [rx, ryTop, ryBot, 截面中心上移]；截面横轴恒为 ±X（适合在 YZ 平面内走向的身体/尾/腿）。 */
function tube(pts: THREE.Vector3[], seg: number, radial: number, rad: (t: number, a: number) => [number, number, number, number?], col: (t: number, a: number, p: THREE.Vector3) => RGB, uRep = 1, vRep = 1) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
  const P = new THREE.Vector3(), T = new THREE.Vector3(), U = new THREE.Vector3(), S = V(1, 0, 0)
  return loft(seg, radial, (t, a) => {
    curve.getPointAt(t, P); curve.getTangentAt(t, T)
    // 截面上方向 U = T×S；切线接近 ±X 时退化，改用世界 +Y 求正交
    U.crossVectors(T, S); if (U.lengthSq() < 1e-4) U.set(0, 1, 0); U.normalize()
    const side = new THREE.Vector3().crossVectors(U, T).normalize()
    const [rx, ryT, ryB, up = 0] = rad(t, a)
    const cs = Math.cos(a), sn = Math.sin(a)
    // 略带方形的超椭圆（毛茸茸的身体侧面更饱满）
    const sx = Math.sign(cs) * Math.pow(Math.abs(cs), 0.85), sy = Math.sign(sn) * Math.pow(Math.abs(sn), 0.9)
    return P.clone().addScaledVector(side, sx * rx).addScaledVector(U, sy * (sn > 0 ? ryT : ryB) + up)
  }, col, uRep, vRep)
}
const prep = (g: THREE.BufferGeometry, c: RGB) => {
  const n = g.index ? g.toNonIndexed() : g
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(n.attributes.position.count * 2).fill(0), 2))
  if (!n.attributes.color) { const a: number[] = []; for (let i = 0; i < n.attributes.position.count; i++) a.push(c[0], c[1], c[2]); n.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)) }
  if (n.attributes.normal === undefined) n.computeVertexNormals()
  return n
}
const merge = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)))!

// ---------- 程序化贴图（共享缓存） ----------
let TEX: { fur: THREE.Texture | null; quilt: THREE.Texture | null; fleece: THREE.Texture | null; head: THREE.Texture | null; headBump: THREE.Texture | null; glow: THREE.Texture | null } | null = null
function textures() {
  if (TEX) return TEX
  const tile = (f: (ox: number, oy: number) => void) => { for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) f(ox, oy) }
  // 毛丝：近白底 + 顺着身体（画布纵向 = 放样 v 方向）的细短毛丝，明暗交错；乘在顶点色上只添细节不改毛色
  const fur = canvasTex(256, 256, (c, R) => {
    c.fillStyle = '#efefef'; c.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 2600; i++) {
      const x = R() * 256, y = R() * 256, l = 6 + R() * 12, a = Math.PI / 2 + (R() - 0.5) * 0.5
      const v = R() < 0.5 ? 185 + R() * 50 : 245 + R() * 10, lw = 0.6 + R() * 0.8
      tile((ox, oy) => { c.strokeStyle = `rgba(${v},${v},${v},0.55)`; c.lineWidth = lw; c.beginPath(); c.moveTo(x + ox, y + oy); c.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); c.stroke() })
    }
  }, true)
  // 小被子：浅粉底 + 奶油色格纹 + 细绗缝线
  const quilt = canvasTex(128, 128, (c) => {
    c.fillStyle = '#d8a4a0'; c.fillRect(0, 0, 128, 128)
    c.fillStyle = 'rgba(246,234,214,0.55)'; for (let k = 0; k < 4; k++) { c.fillRect(k * 32 + 12, 0, 8, 128); c.fillRect(0, k * 32 + 12, 128, 8) }
    c.fillStyle = 'rgba(160,96,96,0.35)'; for (let k = 0; k < 4; k++) { c.fillRect(k * 32 + 15, 0, 2, 128); c.fillRect(0, k * 32 + 15, 128, 2) }
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.setLineDash([3, 3]); c.lineWidth = 1
    for (let k = 0; k < 8; k++) { c.beginPath(); c.moveTo(k * 16 + 4, 0); c.lineTo(k * 16 + 4, 128); c.stroke() }
  }, true)
  // 窝的绒布：灰蓝底 + 细密绒点
  const fleece = canvasTex(128, 128, (c, R) => {
    c.fillStyle = '#b8bcc0'; c.fillRect(0, 0, 128, 128)
    for (let i = 0; i < 1400; i++) { const v = 150 + R() * 100; c.fillStyle = `rgba(${v},${v},${v + 6},0.5)`; c.fillRect(R() * 128, R() * 128, 1.5, 1.5) }
  }, true)
  // 头部配色贴图：按头骨放样参数（u = 截面角 a/2π，v = 沿头长 t）逐像素求 headColor，面罩/鼻梁边缘由贴图双线性过渡，
  // 不再受顶点网格密度限制（阶段 1 的顶点色面罩在眼周出现锯齿）；其上以正片叠底叠一层顺毛毛丝。
  const head = canvasTex(HEAD_TW, HEAD_TH, (c, R) => {
    const img = c.createImageData(HEAD_TW, HEAD_TH), d = img.data
    const enc = (x: number) => Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055))
    for (let py = 0; py < HEAD_TH; py++) {
      const t = 1 - (py + 0.5) / HEAD_TH // CanvasTexture flipY：画布第 0 行 = v=1
      const z = HZ0 + (HZ1 - HZ0) * t
      for (let px = 0; px < HEAD_TW; px++) {
        const col = headColor(headPoint(z, ((px + 0.5) / HEAD_TW) * Math.PI * 2)), o = (py * HEAD_TW + px) * 4
        d[o] = enc(col[0]); d[o + 1] = enc(col[1]); d[o + 2] = enc(col[2]); d[o + 3] = 255
      }
    }
    c.putImageData(img, 0, 0)
    c.globalCompositeOperation = 'multiply'
    for (let i = 0; i < 2400; i++) {
      const x = R() * HEAD_TW, y = R() * HEAD_TH, l = 4 + R() * 7, a = Math.PI / 2 + (R() - 0.5) * 0.5
      const v = R() < 0.5 ? 200 + R() * 40 : 240 + R() * 15, lw = 0.6 + R() * 0.7
      for (const ox of [-HEAD_TW, 0, HEAD_TW]) { c.strokeStyle = `rgba(${v},${v},${v},0.5)`; c.lineWidth = lw; c.beginPath(); c.moveTo(x + ox, y); c.lineTo(x + ox + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke() }
    }
    c.globalCompositeOperation = 'source-over'
  }, false)
  if (head) { head.wrapS = THREE.RepeatWrapping; head.anisotropy = 8 }
  // 头部凹凸：共享毛丝图的克隆（同一图像源），按阶段 1 的头部 uv 重复率 3×1.5 走自己的贴图矩阵
  const headBump = fur ? fur.clone() : null
  if (headBump) headBump.repeat.set(3, 1.5)
  // 切行光晕：径向渐变（中心近白 → 淡蓝 → 透明）
  const glow = canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(235,246,255,0.85)'); g.addColorStop(0.45, 'rgba(170,215,255,0.32)'); g.addColorStop(1, 'rgba(120,180,255,0)')
    c.fillStyle = g; c.fillRect(0, 0, 128, 128)
  }, false)
  for (const t of [fur, quilt, fleece, head, headBump, glow]) if (t) t.userData.entityShared = true
  TEX = { fur, quilt, fleece, head, headBump, glow }
  return TEX
}

// ============================================================================
// 尺寸（模型空间，米）
// ============================================================================
/** 脊线（侧视 z,y）：臀 → 后半身隆起 → 腰 → 肩胸低伏 → 颈根 */
// 前端顺着颈的走向抬起并收细（伸进颈管内部），颈管从躯干表面以很小的夹角“长”出来，不再在肩前留一圈接缝
const SPINE: [number, number][] = [[-0.245, 0.11], [-0.2, 0.138], [-0.13, 0.152], [-0.05, 0.146], [0.04, 0.128], [0.115, 0.12], [0.165, 0.134], [0.2, 0.156], [0.225, 0.178]]
/** 躯干截面表 [t, 半宽, 上半高, 下半高] */
const BODY_R = [[0, 0.064, 0.08, 0.072], [0.14, 0.092, 0.12, 0.104], [0.33, 0.092, 0.114, 0.108], [0.55, 0.082, 0.09, 0.098], [0.78, 0.068, 0.068, 0.08], [1, 0.056, 0.056, 0.064], [1.07, 0.047, 0.046, 0.052], [1.137, 0.038, 0.036, 0.04]]
/** 躯干参数 u = t×TORSO_U：u∈[0,1] 是阶段 1 的臀→肩（截面/配色表沿用），u>1 是伸进颈管的收细延伸段 */
const TORSO_U = 1.137
export const FERREN_DIM = {
  neckBase: V(0, 0.14, 0.16), // 头枢轴（颈根）
  skull: V(0, 0.064, 0.062), // 头骨枢轴（相对颈根）
  armL: V(-0.036, 0.098, 0.122), armR: V(0.036, 0.098, 0.122),
  legL: V(-0.038, 0.115, -0.17), legR: V(0.038, 0.115, -0.17),
  tailBase: V(0, 0.12, -0.225),
}

// ---------- 躯干 ----------
function torsoColor(t: number, a: number): RGB {
  const sn = Math.sin(a) // +1 背脊 / -1 腹
  // 奶油色窗口：身体中段（臀部隆起之前 → 肩后），体侧大片
  const along = sstep(0.14, 0.3, t) * (1 - sstep(0.62, 0.8, t))
  const flank = sstep(-0.82, -0.5, sn) * (1 - sstep(0.55, 0.9, sn)) // 体侧（腹下与背脊除外）
  const cream = clamp01(along * flank)
  const ends = 1 - along
  // 底色：护毛尖（中棕）→ 奶油底毛
  let c = mix(C.guard, mix(C.cream, C.creamHi, gauss(t, 0.45, 0.12) * gauss(sn, 0.0, 0.35)), cream)
  // 背脊护毛：中棕（不是黑），臀部与肩胸深棕
  c = mix(c, C.guard, sstep(0.45, 0.95, sn) * along * 0.8)
  c = mix(c, C.brown, clamp01(ends * 0.95))
  c = mix(c, C.dark, clamp01(sstep(-0.55, -0.95, sn) * 0.9 + sstep(0.85, 1, t) * 0.3)) // 腹下深棕
  // 毛簇明暗噪声
  const n = hash(Math.round(t * 60), Math.round(a * 9)) - 0.5
  return mul(c, 1 + n * 0.14)
}
function torsoGeo() {
  const pts = SPINE.map(([z, y]) => V(0, y, z))
  return tube(pts, 50, 28, (t, a) => {
    const u = t * TORSO_U, k = capS(t, 0.08) * capE(t, 0.03)
    const fluff = 1 + (hash(Math.round(t * 50), Math.round(a * 4.46)) - 0.5) * 0.05 * (1 - sstep(0.9, 1.05, u)) // 伸进颈管的一段不加毛簇起伏（免得从颈表面戳出）
    return [table(BODY_R, u, 1) * k * fluff, table(BODY_R, u, 2) * k * fluff, table(BODY_R, u, 3) * k, -0.004 * gauss(u, 0.35, 0.2) * Math.max(0, -Math.sin(a))]
  }, (t, a) => torsoColor(t * TORSO_U, a), 6.8, 3.4)
}

// ---------- 尾 ----------
function tailGeo() {
  // 尾根枢轴为原点；先略下垂再平伸，末端微翘
  const pts = [V(0, 0, 0.02), V(0, -0.012, -0.06), V(0, -0.03, -0.14), V(0, -0.034, -0.2), V(0, -0.026, -0.245)]
  return tube(pts, 20, 16, (t, a) => {
    const r = (0.034 + 0.01 * gauss(t, 0.38, 0.22) - 0.026 * sstep(0.55, 1, t)) * capE(t, 0.18)
    const f = 1 + (hash(Math.round(t * 20), Math.round(a * 2.5)) - 0.5) * 0.26 // 蓬松毛簇
    return [r * f, r * f, r * f * 0.95]
  }, (t, a) => mul(mix(C.brown, C.dark, sstep(0.1, 0.6, t)), 1 + (hash(Math.round(t * 30), Math.round(a * 5)) - 0.5) * 0.2 + 0.08 * Math.sin(a)), 4, 2)
}

// ---------- 四肢 ----------
/** 腿：枢轴为原点向下；脚掌朝 +Z；4 枚短爪 */
function limbGeo(hind: boolean) {
  const len = hind ? 0.113 : 0.096
  const pts = hind
    ? [V(0, 0.01, 0.0), V(0, -0.05, 0.022), V(0, -0.095, -0.004), V(0, -len + 0.01, 0.0)]
    : [V(0, 0.01, 0), V(0, -0.05, 0.004), V(0, -len + 0.01, 0.008)]
  const r0 = hind ? 0.03 : 0.027, r1 = hind ? 0.0145 : 0.014
  const leg = tube(pts, 14, 18, (t) => { const r = (r0 + (r1 - r0) * sstep(0, 0.85, t)) * capS(t, 0.12); return [r * 0.9, r, r] }, (t, a) => mul(mix(C.brown, C.dark, sstep(0.1, 0.7, t)), 1 + 0.06 * Math.sin(a)), 2, 2)
  // 脚掌：压扁的椭球
  const pawL = hind ? 0.034 : 0.028
  const paw = new THREE.SphereGeometry(1, 14, 8)
  paw.scale(0.017, 0.0095, pawL / 2); paw.translate(0, -len + 0.007, (hind ? 0.004 : 0.012) + pawL * 0.32)
  const geos = [leg, prep(paw, C.dark)]
  // 短爪：4 枚细锥，从脚掌前缘向前下方伸出
  for (let k = 0; k < 4; k++) {
    const x = (k - 1.5) * 0.0085
    const cl = new THREE.ConeGeometry(0.0022, 0.012, 5)
    cl.rotateX(Math.PI / 2 + 0.55); cl.translate(x, -len + 0.002, (hind ? 0.004 : 0.012) + pawL * 0.82 + 0.004)
    geos.push(prep(cl, C.claw))
  }
  return merge(geos.map((g) => prep(g, C.dark)))
}

// ---------- 头 ----------
/** 头骨截面表 [z, 半宽, 上半高, 下半高, 中心 y] ——头骨原点在颈端（后脑），吻尖约 z=0.118 */
const HEAD_R = [[-0.026, 0.03, 0.03, 0.028, 0.0], [-0.006, 0.042, 0.038, 0.034, 0.0], [0.02, 0.044, 0.038, 0.033, 0.0], [0.045, 0.038, 0.031, 0.029, -0.004], [0.068, 0.026, 0.022, 0.022, -0.01], [0.088, 0.017, 0.016, 0.016, -0.014], [0.104, 0.01, 0.01, 0.01, -0.016]]
const HZ0 = -0.028, HZ1 = 0.109
const HEAD_TW = 512, HEAD_TH = 256 // 头部配色贴图分辨率（u 绕头一周 × v 沿头长）
/** 头骨表面点（z, a）：与几何同一公式，眼/耳/鼻据此贴面 */
function headPoint(z: number, a: number) {
  const t = (z - HZ0) / (HZ1 - HZ0)
  const k = capS(t, 0.12) * capE(t, 0.06)
  const rx = table(HEAD_R, z, 1) * k, ryT = table(HEAD_R, z, 2) * k, ryB = table(HEAD_R, z, 3) * k, cy = table(HEAD_R, z, 4)
  const cs = Math.cos(a), sn = Math.sin(a)
  // 颊部在下侧外鼓（雪貂脸颊饱满）
  const cheek = 1 + 0.12 * gauss(z, 0.045, 0.025) * gauss(sn, -0.35, 0.35)
  return V(cs * rx * cheek, cy + sn * (sn > 0 ? ryT : ryB), z)
}
const EYE = { z: 0.05, a: 0.55, r: 0.0076 }
/** 面罩/白脸配色（头骨局部坐标） */
function headColor(p: THREE.Vector3): RGB {
  const { x, y, z } = p
  const ax = Math.abs(x)
  const e = headPoint(EYE.z, EYE.a)
  const cy = table(HEAD_R, Math.max(HZ0, Math.min(HZ1, z)), 4)
  let c = C.white
  // 头顶后部（两耳之间及后脑）：中棕护毛，与颈部相接
  c = mix(c, C.guard, sstep(0.016, 0.002, z) * sstep(e.y - 0.004, e.y + 0.012, y))
  c = mix(c, C.brown, sstep(0.002, -0.014, z))
  // 面罩：穿过双眼的深棕横带（越过鼻梁相连，向两颊/耳前收窄）
  const dy = y - e.y
  // 上缘贴着眼睛上沿（其上是白额），下缘到眼下约一眼高；向耳前略收窄
  const top = 0.0075 - 0.002 * sstep(0.03, 0.0, z), bot = 0.013 - 0.004 * sstep(0.03, -0.004, z)
  const band = (dy > 0 ? 1 - sstep(top * 0.55, top * 1.4, dy) : 1 - sstep(bot * 0.6, bot * 1.3, -dy)) * sstep(-0.008, 0.008, z) * (1 - sstep(0.06, 0.07, z))
  // 鼻梁：两眼之间沿鼻梁向前延伸到吻部前段（窄、上半面）
  const bw = 0.011 - 0.004 * sstep(0.055, 0.092, z)
  const bridge = (1 - sstep(bw * 0.55, bw * 1.35, ax)) * sstep(0.052, 0.062, z) * (1 - sstep(0.086, 0.096, z)) * sstep(-0.004, 0.004, y - cy)
  c = mix(c, C.mask, clamp01(band + bridge))
  // 喉部：白吻部/下巴之后接深棕
  c = mix(c, C.brown, sstep(0.014, -0.01, z) * sstep(cy - 0.006, cy - 0.022, y))
  return c
}
function headGeo() {
  const seg = 56, radial = 48
  return loft(seg, radial, (t, a) => headPoint(HZ0 + (HZ1 - HZ0) * t, a), (_t, _a, p) => headColor(p)) // uv 0..1 对应头部配色贴图；顶点色仅作 Node/无 Canvas 退化
}
function neckGeo() {
  // 颈根（原点）→ 头骨枢轴；比头骨略粗的毛领，前端插入后脑
  const end = FERREN_DIM.skull
  // 后端埋进躯干前段（躯干在此顺颈向上收细），颈管由细到粗从躯干表面以小夹角长出——肩前不再有一圈接缝
  const pts = [V(0, -0.034, -0.06), V(0, -0.01, -0.012), V(0, end.y * 0.55, end.z * 0.48), V(0, end.y, end.z - 0.012)]
  return tube(pts, 18, 22, (t) => { const r = (0.044 + 0.012 * sstep(0.05, 0.4, t) - 0.022 * sstep(0.4, 1, t)) * capS(t, 0.12); return [r * 0.92, r, r * 1.02] }, (t, a) => {
    const sn = Math.sin(a)
    let c = mix(C.brown, C.dark, sstep(-0.2, -0.8, sn) * 0.8)
    c = mix(c, C.guard, sstep(0.3, 1, sn) * sstep(0.4, 1, t) * 0.5)
    return mul(c, 1 + (hash(Math.round(t * 14), Math.round(a * 3.5)) - 0.5) * 0.14)
  }, 4, 1)
}
function earGeo(sd: number) {
  // 白色圆耳：扁圆盘（正面朝前外侧），耳内一小块粉色
  const outer = new THREE.SphereGeometry(1, 14, 10)
  outer.scale(0.017, 0.016, 0.0058)
  const inner = new THREE.CircleGeometry(0.0102, 14); inner.translate(0, -0.0014, 0.0061)
  const g = merge([prep(outer, C.white), prep(inner, C.pinkIn)])
  g.translate(0, 0.009, 0) // 耳根在下缘
  g.rotateY(sd * 0.75); g.rotateZ(-sd * 0.3)
  return g
}

// ============================================================================
// 组装
// ============================================================================
export interface FerrenRig {
  torso: THREE.Mesh; head: THREE.Group; skull: THREE.Group; tail: THREE.Group
  armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group
  furMat: THREE.Material
  /** [ferren] 阶段 2：face = 把 +Z 建模转到实体约定正面 +X 的内层组（rotation.y = π/2）；root = 整体姿态（动画写位置/旋转/缩放） */
  face: THREE.Group; root: THREE.Group
  /** 尾巴网格（每实例一份几何，供尾巴卷曲形变） */
  tailMesh: THREE.Mesh
  /** 眼球（眯眼/闭眼时压扁）与高光点 */
  eyes: THREE.Mesh[]; glints: THREE.Object3D[]
  /** 切行光晕（默认隐藏；每实例一份材质；scale 为直径） */
  glow: THREE.Sprite
  /** 躯干网格原点（模型空间） */
  torsoOrigin: THREE.Vector3
}

let GEO: { torso: THREE.BufferGeometry; tail: THREE.BufferGeometry; arm: THREE.BufferGeometry; leg: THREE.BufferGeometry; head: THREE.BufferGeometry; neck: THREE.BufferGeometry; earL: THREE.BufferGeometry; earR: THREE.BufferGeometry; nose: THREE.BufferGeometry; whisk: THREE.BufferGeometry } | null = null
function geometry() {
  if (GEO) return GEO
  // 鼻头：真雪貂那种小三角粉鼻——上宽下尖的倒三角（略呈心形），扁平贴在吻尖，鼻孔是两侧下方的细缝
  const ns = new THREE.SphereGeometry(1, 18, 12), nsp = ns.attributes.position
  for (let i = 0; i < nsp.count; i++) {
    const x = nsp.getX(i), y = nsp.getY(i), z = nsp.getZ(i)
    const k = 0.42 + 0.58 * clamp01((y + 1) / 2) // 越往下越窄（倒三角）
    const notch = 1 - 0.18 * gauss(x, 0, 0.22) * sstep(0.4, 1, y) // 上缘中线微凹（心形）
    nsp.setXYZ(i, x * k * 0.0054, y * 0.0040 * notch - 0.0006 * (1 - k), z * 0.0034)
  }
  ns.computeVertexNormals()
  const nostril = (sd: number) => { const h = new THREE.SphereGeometry(0.00075, 6, 4); h.scale(1.5, 0.6, 0.6); h.rotateZ(sd * 0.7); h.translate(sd * 0.0023, -0.0006, 0.0027); return prep(h, hex('#a4605c')) }
  const nose = merge([prep(ns, C.pink), nostril(-1), nostril(1)])
  // 胡须：吻部两侧各 7 根细弧线（LineSegments）
  const wp: number[] = [], R = rng(92)
  for (const sd of [-1, 1]) for (let k = 0; k < 7; k++) {
    const o = headPoint(0.084 - (k % 3) * 0.006, sd > 0 ? -0.15 - (k % 4) * 0.12 : Math.PI + 0.15 + (k % 4) * 0.12)
    const len = 0.045 + R() * 0.03, up = (k - 3) * 0.12 + (R() - 0.5) * 0.1, back = 0.35 + R() * 0.35
    let px = o.x, py = o.y, pz = o.z
    for (let s = 1; s <= 4; s++) {
      const f = s / 4, nx = o.x + sd * Math.cos(back) * len * f, ny = o.y + up * len * f - 0.006 * f * f, nz = o.z - Math.sin(back) * len * f * 0.6
      wp.push(px, py, pz, nx, ny, nz); px = nx; py = ny; pz = nz
    }
  }
  const whisk = new THREE.BufferGeometry(); whisk.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3))
  GEO = { torso: torsoGeo(), tail: tailGeo(), arm: limbGeo(false), leg: limbGeo(true), head: headGeo(), neck: neckGeo(), earL: earGeo(-1), earR: earGeo(1), nose, whisk }
  return GEO
}

export function buildFerrenMesh(): THREE.Group {
  const G = geometry(), T = textures()
  const grp = new THREE.Group()
  grp.userData.entityType = 'ferren'
  // 朝向：模型按 +Z 建造，实体约定正面 +X（renderer 写 grp.rotation.y = -facing）。阶段 1 提前 return 跳过了
  // entitiesMesh 末尾统一包的 +Z→+X 内层组，导致游戏里横着走；这里自己包一层 face（rotation.y = π/2）并标 facesZ。
  const face = new THREE.Group(); face.rotation.y = Math.PI / 2; grp.add(face); grp.userData.facesZ = 1
  const root = new THREE.Group(); face.add(root)
  const parts: Record<string, THREE.Object3D> = {}
  grp.userData.parts = parts
  const furMat = litMaterial({ color: '#ffffff', vertexColors: true, ...(T.fur ? { map: T.fur, bumpMap: T.fur, bumpScale: 0.35 } : {}), roughness: 0.92, envBase: 0.08 })
  const skinMat = litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.45, envBase: 0.25 })
  // 头：有 Canvas 时用逐像素配色贴图（不读顶点色），否则退化为顶点色
  const headMat = T.head ? litMaterial({ color: '#ffffff', map: T.head, ...(T.headBump ? { bumpMap: T.headBump, bumpScale: 0.35 } : {}), roughness: 0.92, envBase: 0.08 }) : furMat
  const eyeMat = litMaterial({ color: '#070504', roughness: 0.04, metalness: 0, envBase: 1.2 })
  const tag = (o: THREE.Object3D, part: string) => { o.userData.part = part; parts[part] = o; return o }
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; return o }

  // 躯干：网格原点放在身体中心（渲染层待机呼吸 scale.y 以此为中心）
  const tc = V(0, 0.15, -0.03)
  const torso = mesh(G.torso.clone().translate(-tc.x, -tc.y, -tc.z), furMat)
  torso.position.copy(tc); root.add(tag(torso, 'torso'))

  // 尾
  const tail = new THREE.Group(); tail.position.copy(FERREN_DIM.tailBase); tail.rotation.x = -0.08
  const tailMesh = mesh(G.tail.clone(), furMat); tail.add(tailMesh); root.add(tail)

  // 四肢（关节枢轴：肩/髋；renderer 写 rotation.x 前后摆）
  const limb = (g: THREE.BufferGeometry, p: THREE.Vector3, name: string, splay: number) => {
    const j = new THREE.Group(); j.position.copy(p); j.userData.part = name; parts[name] = j
    const m = mesh(g, furMat); m.rotation.z = splay; j.add(m); root.add(j); return j
  }
  const armL = limb(G.arm, FERREN_DIM.armL, 'armL', -0.06), armR = limb(G.arm, FERREN_DIM.armR, 'armR', 0.06)
  const legL = limb(G.leg, FERREN_DIM.legL, 'legL', -0.08), legR = limb(G.leg, FERREN_DIM.legR, 'legR', 0.08)

  // 头：枢轴在颈根（head.rotation.y 摆头），skull 在颈端（点头/歪头）
  const head = new THREE.Group(); head.position.copy(FERREN_DIM.neckBase); tag(head, 'head'); root.add(head)
  head.add(mesh(G.neck, furMat))
  const skull = new THREE.Group(); skull.position.copy(FERREN_DIM.skull); skull.rotation.x = 0.1; head.add(skull)
  skull.add(mesh(G.head, headMat))
  // 耳
  for (const [g, sd] of [[G.earL, -1], [G.earR, 1]] as const) {
    const p = headPoint(-0.004, sd > 0 ? 0.72 : Math.PI - 0.72)
    const e = mesh(g, skinMat); e.position.set(p.x * 0.92, p.y - 0.006, p.z); skull.add(e)
  }
  // 眼：亮黑眼球 + 高光点 + 深色眼睑环（userData.face 供朝向验收）
  const eyes: THREE.Mesh[] = [], glints: THREE.Object3D[] = []
  for (const sd of [-1, 1]) {
    const a = sd > 0 ? EYE.a : Math.PI - EYE.a
    const p = headPoint(EYE.z, a)
    const nrm = new THREE.Vector3(p.x, p.y - table(HEAD_R, EYE.z, 4), 0).normalize().add(V(0, 0, 0.55)).normalize()
    const eye = mesh(new THREE.SphereGeometry(EYE.r, 14, 10), eyeMat)
    eye.position.copy(p).addScaledVector(nrm, -EYE.r * 0.42); eye.userData.face = 1; skull.add(eye); eyes.push(eye)
    const hl = new THREE.Mesh(new THREE.SphereGeometry(EYE.r * 0.17, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }))
    hl.position.copy(eye.position).addScaledVector(nrm, EYE.r * 0.92).add(V(sd * -0.0018, 0.0032, 0.001)); hl.userData.face = 1; skull.add(hl); glints.push(hl)
  }
  // 鼻头
  const np = headPoint(HZ1 - 0.006, Math.PI / 2)
  const nose = mesh(G.nose, skinMat); nose.position.set(0, np.y - 0.0035, HZ1 - 0.0028); nose.rotation.x = -0.2; nose.userData.face = 1; skull.add(nose)
  // 胡须
  const wh = new THREE.LineSegments(G.whisk, new THREE.LineBasicMaterial({ color: '#cfc8bd', transparent: true, opacity: 0.85 }))
  skull.add(wh)

  // 切行光晕：加色混合的柔光球，默认隐藏
  // 切行光晕：径向渐变的加色 Sprite（始终面向镜头，中心亮、边缘柔和散开），默认隐藏；Node 下无贴图则退化为纯色
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#d8ecff', ...(T.glow ? { map: T.glow } : {}), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))
  glow.scale.setScalar(0.4); glow.position.set(0, 0.2, -0.02); glow.visible = false; glow.renderOrder = 2; face.add(glow)
  const rig: FerrenRig = { torso, head, skull, tail, armL, armR, legL, legR, furMat, face, root, tailMesh, eyes, glints, glow, torsoOrigin: tc.clone() }
  grp.userData.ferren = rig
  return grp
}

// ============================================================================
// 雪貂窝：圆形软垫窝（厚边圈 + 凹底垫）+ 一条搭在边上的小被子。直径约 0.46 m，原点在地面中心。
// ============================================================================
export function buildFerrenNestMesh(): THREE.Group {
  const T = textures()
  const grp = new THREE.Group()
  grp.userData.entityType = 'ferrenNest'
  const fleece = litMaterial({ color: '#8e9aa6', ...(T.fleece ? { map: T.fleece } : {}), roughness: 0.95 })
  const lining = litMaterial({ color: '#e8dccb', ...(T.fleece ? { map: T.fleece } : {}), roughness: 0.95 })
  const quiltMat = litMaterial({ color: '#ffffff', ...(T.quilt ? { map: T.quilt } : {}), roughness: 0.9, side: THREE.DoubleSide })
  const add = (g: THREE.BufferGeometry, m: THREE.Material) => { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; grp.add(o); return o }
  // 边圈：饱满的环（截面略扁），前方一处压低的入口
  const RIM = 0.19, rimG = new THREE.TorusGeometry(RIM, 0.06, 16, 56)
  rimG.rotateX(Math.PI / 2)
  const pa = rimG.attributes.position
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), z = pa.getZ(i), ang = Math.atan2(x, z)
    const dip = 1 - 0.45 * gauss(ang, 0, 0.45) // +Z 方向入口压低
    const cy = 0.06 * dip
    pa.setY(i, (pa.getY(i)) * (0.75 + 0.25 * dip) + cy)
  }
  rimG.computeVertexNormals()
  add(rimG, fleece)
  // 底垫：中间下凹的软垫
  const base = new THREE.CylinderGeometry(0.22, 0.22, 0.035, 48, 1); base.translate(0, 0.0175, 0); add(base, fleece)
  const cush = new THREE.CircleGeometry(0.185, 48, 0, Math.PI * 2); cush.rotateX(-Math.PI / 2)
  const cp = cush.attributes.position
  for (let i = 0; i < cp.count; i++) { const r = Math.hypot(cp.getX(i), cp.getZ(i)); cp.setY(i, 0.045 - 0.012 * (1 - (r / 0.185) ** 2)) }
  cush.computeVertexNormals(); add(cush, lining)
  // 小被子：一块 0.3×0.24 的布，一半铺在垫上，一半搭过后侧边圈垂下，带随机褶皱
  // 截面路径（z,y）：垫上平铺 → 斜爬上后侧边圈 → 绕过圈顶 → 垂到圈外
  const path: [number, number][] = []
  for (let k = 0; k <= 10; k++) path.push([0.11 - k * 0.02, 0.05])
  for (let k = 1; k <= 4; k++) path.push([-0.09 - k * 0.011, 0.05 + k * 0.013])
  const AR = 0.069 // 绕过边圈的半径（圈管半径 0.06 + 布厚余量）
  for (let k = 0; k <= 14; k++) { const f = (-50 + (150 * k) / 14) * Math.PI / 180; path.push([-RIM - AR * Math.sin(f), 0.06 + AR * Math.cos(f)]) }
  for (let k = 1; k <= 4; k++) path.push([-RIM - AR * Math.sin(100 * Math.PI / 180) - k * 0.003, 0.06 + AR * Math.cos(100 * Math.PI / 180) - k * 0.012])
  const acc = [0]; for (let k = 1; k < path.length; k++) acc.push(acc[k - 1] + Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]))
  const ql = acc[acc.length - 1], qw = 0.3
  const at = (s: number): [number, number] => { for (let k = 1; k < acc.length; k++) if (s <= acc[k]) { const f = (s - acc[k - 1]) / (acc[k] - acc[k - 1]); return [path[k - 1][0] + (path[k][0] - path[k - 1][0]) * f, path[k - 1][1] + (path[k][1] - path[k - 1][1]) * f] } return path[path.length - 1] }
  const qg = new THREE.PlaneGeometry(qw, ql, 24, 40)
  const qp = qg.attributes.position, R = rng(7)
  const folds = Array.from({ length: 4 }, () => [R() * qw - qw / 2, 0.003 + R() * 0.005, 0.02 + R() * 0.03])
  for (let i = 0; i < qp.count; i++) {
    const u = qp.getX(i), s = ql / 2 - qp.getY(i)
    let [z, y] = at(s)
    for (const [fx, fa, fw] of folds) y += fa * gauss(u, fx, fw) * (0.5 + 0.5 * Math.sin(s * 25 + fx * 30))
    // 平铺段边缘略微卷起，垂下段两侧外摆
    y += 0.01 * sstep(0.1, 0.15, Math.abs(u)) * (1 - sstep(0.15, 0.25, s))
    // 横向沿边圈弧长展开（布贴着圆形边圈，而不是直板悬空）：越靠外越按极坐标绕圈
    const r = -z, w = sstep(0.0, 0.14, r), ang = (u * (1 + 0.06 * sstep(0.3, ql, s))) / RIM
    const px = u * (1 - w) + Math.max(r, 0) * Math.sin(ang) * w, pz = z * (1 - w) - Math.max(r, 0) * Math.cos(ang) * w
    qp.setXYZ(i, px, y + 0.003, pz)
  }
  qg.computeVertexNormals()
  const q = add(qg, quiltMat); q.rotation.y = 0.35
  grp.userData.nest = { rimRadius: RIM, bedY: 0.045 }
  return grp
}

// ============================================================================
// [ferren] 阶段 3：食盆（饭碗 + 水碗，原点在地面中心，饭碗在原点）与盖在睡着的 Ferren 身上的小被子
// ============================================================================
export function buildFerrenBowlMesh(): THREE.Group {
  const grp = new THREE.Group()
  grp.userData.entityType = 'ferrenBowl'
  const steel = litMaterial({ color: '#b9c4cc', roughness: 0.32, metalness: 0.6, envBase: 0.6, side: THREE.DoubleSide })
  const kib = litMaterial({ color: '#8a5a32', roughness: 0.9 })
  const water = litMaterial({ color: '#7fa8c4', roughness: 0.08, metalness: 0, envBase: 0.9 })
  const add = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; grp.add(o); return o }
  const dish = (x: number, z: number, r: number) => {
    // 斜壁浅碗（开口朝上的截锥 + 卷边 + 底）
    add(new THREE.CylinderGeometry(r, r * 0.78, 0.04, 28, 1, true), steel, x, 0.02, z)
    const lip = new THREE.TorusGeometry(r, 0.005, 6, 28); lip.rotateX(Math.PI / 2); add(lip, steel, x, 0.04, z)
    const bot = new THREE.CircleGeometry(r * 0.78, 28); bot.rotateX(-Math.PI / 2); add(bot, steel, x, 0.002, z)
  }
  dish(0, 0, 0.07)
  // 饭碗里一小堆颗粒粮
  const R = rng(74)
  for (let i = 0; i < 26; i++) {
    const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * 0.05
    const g = new THREE.SphereGeometry(0.008 + R() * 0.003, 6, 4); g.scale(1, 0.7, 1)
    add(g, kib, Math.cos(a) * rr, 0.018 + (0.05 - rr) * 0.25 + R() * 0.004, Math.sin(a) * rr)
  }
  dish(0.17, 0.02, 0.055)
  const w = new THREE.CircleGeometry(0.05, 24); w.rotateX(-Math.PI / 2); add(w, water, 0.17, 0.028, 0.02)
  grp.userData.bowl = { radius: 0.07, rimY: 0.04 }
  return grp
}

/** 小被子：一块盖在蜷睡的 Ferren 身上的软布。drape(x, z) = 身体在 (x, z) 处（相对实体组，地面 y = 0）的顶面高度，
 *  布按「身体最高点往外 1.3 斜率垂下」的包络贴着身子（ferrenRender 从当前睡姿的躯干网格量出来）；cx/cz/r = 布的中心与半径。 */
export function buildFerrenBlanketMesh(drape: (x: number, z: number) => number, cx = 0, cz = 0, r = 0.17, hole?: { x: number; z: number; r: number }): THREE.Mesh {
  const T = textures()
  const mat = litMaterial({ color: '#ffffff', ...(T.quilt ? { map: T.quilt } : {}), roughness: 0.9, side: THREE.DoubleSide })
  const g = new THREE.CircleGeometry(r, 48, 0, Math.PI * 2)
  // CircleGeometry 只有一圈外缘顶点：换成同心环网格，布面才能贴出起伏
  const rings = 14, segs = 48, pos: number[] = [], uv: number[] = [], idx: number[] = []
  for (let i = 0; i <= rings; i++) for (let j = 0; j <= segs; j++) {
    const rr = (i / rings) * r, a = (j / segs) * Math.PI * 2
    const wob = 1 + 0.05 * Math.sin(a * 3 + 0.4) * (i / rings) // 外缘不规则
    const x = cx + Math.cos(a) * rr * wob, z = cz + Math.sin(a) * rr * wob
    const fold = 0.005 * Math.sin(a * 5 + 0.7) * (i / rings)
    pos.push(x, Math.max(0.008, drape(x, z) + 0.02) + fold, z)
    uv.push(0.5 + (x - cx) / (2 * r), 0.5 + (z - cz) / (2 * r))
  }
  // 头那一块留空：被子盖到脖子，脑袋露在外面
  const out = (k: number) => !hole || Math.hypot(pos[k * 3] - hole.x, pos[k * 3 + 2] - hole.z) > hole.r
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) { const a = i * (segs + 1) + j, b = a + segs + 1; if (out(a) && out(b) && out(a + 1)) idx.push(a, b, a + 1); if (out(b) && out(b + 1) && out(a + 1)) idx.push(b, b + 1, a + 1) }
  g.dispose()
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx)
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true
  m.userData.entityType = 'ferrenBlanket'
  return m
}

/** 雪貂笼的一段铁丝围栏：沿 X（alongY=false）或沿 Z（alongY=true，游戏的 y 轴）长 len 米、高 h 米；原点在这段的中心地面。
 *  方管立柱（约每 0.8 m 一根，两端必有）+ 上下横档 + 透空的铁丝网面（alphaTest 网格贴图；Node 下退化为半透明面） */
let CAGE_MESH_TEX: THREE.Texture | null | undefined
export function buildFerrenCageMesh(len: number, h: number, alongY: boolean): THREE.Group {
  const grp = new THREE.Group()
  grp.userData.entityType = 'ferrenCage'
  const frame = litMaterial({ color: '#d9dcd6', roughness: 0.45, metalness: 0.55, envBase: 0.5 })
  if (CAGE_MESH_TEX === undefined) {
    CAGE_MESH_TEX = canvasTex(64, 64, (c) => {
      c.clearRect(0, 0, 64, 64); c.strokeStyle = '#e8ebe6'; c.lineWidth = 3
      for (let k = 0; k <= 64; k += 16) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k, 64); c.stroke(); c.beginPath(); c.moveTo(0, k); c.lineTo(64, k); c.stroke() }
    }, true)
    if (CAGE_MESH_TEX) { CAGE_MESH_TEX.wrapS = CAGE_MESH_TEX.wrapT = THREE.RepeatWrapping; CAGE_MESH_TEX.userData.entityShared = true }
  }
  const tex = CAGE_MESH_TEX ? CAGE_MESH_TEX.clone() : null
  if (tex) { tex.needsUpdate = true; tex.repeat.set(len / 0.1, (h - 0.06) / 0.1); tex.userData.entityShared = false }
  const meshMat = litMaterial({ color: '#c9cdc6', ...(tex ? { map: tex, alphaTest: 0.4, transparent: false } : { transparent: true, opacity: 0.25 }), roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide })
  const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, 0); o.castShadow = m === frame; o.receiveShadow = true; grp.add(o); return o }
  const n = Math.max(1, Math.round(len / 0.8))
  for (let i = 0; i <= n; i++) add(new THREE.BoxGeometry(0.03, h, 0.03), frame, -len / 2 + (len * i) / n, h / 2)
  for (const y of [0.03, h - 0.015]) add(new THREE.BoxGeometry(len, 0.025, 0.025), frame, 0, y)
  add(new THREE.PlaneGeometry(len, h - 0.06), meshMat, 0, h / 2)
  if (alongY) grp.rotation.y = Math.PI / 2
  return grp
}
