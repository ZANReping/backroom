// [bellhop] 行李员（Entity 135）头部：颈 + 下颌芯（藏在面盘后）+ 蓬乱姜黄头发（SDF 毛团，盖住后脑 / 耳侧 / 颈侧，
// 在面盘四周围成一圈「发框」，不越过面盘背面）+ 藏青圆筒帽（侧带黑色锯齿纹 + 下缘饰边、顶上金色四芒绣星，略有光泽）。
// 面盘本身在 bellhopFace（独立网格，可换 8 张脸）。头直立（无俯仰）；头骨在寰椎，绕颈轴拧 180° 时头发 / 帽 / 面盘整体跟头走。
import * as THREE from 'three'
import { litMaterial } from './shared'
import { clamp, fbm, gauss, len2, mix, sdEll, sdRoundCone, smax, smin, sstep, vnoise } from './conciergeSdf'
import { B, FACE_C, HAT, W4, nrm, type V3 } from './bellhopRig'
import type { Shade } from './conciergeHead'
import { FACES, facePoly, sdPoly } from './bellhopFace'
import { setS } from './bellhopBody'

const C = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]
const mixc = (a: number[], b: number[], t: number) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
const mulc = (a: number[], k: number) => [a[0] * k, a[1] * k, a[2] * k]

// ---------- 面盘包络（8 张脸轮廓的并集）：头发只在它外面往前凑 ----------
const EG = 128, ES = 0.3
let ENV: Float32Array | null = null
function envGrid() {
  if (ENV) return ENV
  ENV = new Float32Array(EG * EG)
  const polys = FACES.map((_, i) => facePoly(i))
  for (let j = 0; j < EG; j++) for (let i = 0; i < EG; i++) {
    const x = (i / (EG - 1) - 0.5) * ES, y = (j / (EG - 1) - 0.5) * ES
    let d = 1e9; for (const P of polys) d = Math.min(d, sdPoly(P, x, y))
    ENV[i + j * EG] = d
  }
  return ENV
}
/** 面盘包络的有向距离（面盘局部 x / y） */
export function faceEnv(x: number, y: number) {
  const g = envGrid()
  const fx = clamp((x / ES + 0.5) * (EG - 1), 0, EG - 1.001), fy = clamp((y / ES + 0.5) * (EG - 1), 0, EG - 1.001)
  const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j
  const a = g[i + j * EG], b = g[i + 1 + j * EG], c = g[i + (j + 1) * EG], d = g[i + 1 + (j + 1) * EG]
  return mix(mix(a, b, tx), mix(c, d, tx), ty)
}
/** 面盘背面（模型空间 Z）：头发 / 下颌不得越过它 */
export const maskBackZ = (X: number, Y: number) => { const lx = X - FACE_C[0], ly = Y - FACE_C[1]; return FACE_C[2] - 4.1 * lx * lx - 0.9 * Math.min(0, ly) ** 2 - 0.011 }

// ---------- 帽的局部坐标（帽底中心为原点，+Y 帽轴）：头发在帽口里被压平 ----------
const hcx = Math.cos(HAT.tiltX), hsx = Math.sin(HAT.tiltX), hcz = Math.cos(HAT.tiltZ), hsz = Math.sin(HAT.tiltZ)
/** 模型空间 → 帽局部（帽 rotation = Euler(tiltX, 0, tiltZ)，XYZ 顺序：R = Rx·Rz；逆 = Rzᵀ·Rxᵀ）。返回 [x, y, z, 径向距离] */
export function hatLocal(X: number, Y: number, Z: number): [number, number, number, number] {
  const px = X - HAT.c[0], py = Y - HAT.c[1], pz = Z - HAT.c[2]
  const y1 = hcx * py + hsx * pz, z1 = -hsx * py + hcx * pz
  const x2 = hcz * px + hsz * y1, y2 = -hsz * px + hcz * y1
  return [x2, y2, z1, Math.hypot(x2, z1)]
}

// ---------- SDF ----------
const CROWN: V3 = [0.0, 1.85, -0.045]
const hash1 = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }
/** 发簇场：绕头一圈约 22 簇（沿发流向下略旋），返回 [簇脊 0（簇间沟）..1（簇中）, 簇号, 簇内卷曲起伏 0..1] */
export function hairClump(X: number, Y: number, Z: number): [number, number, number] {
  const th = Math.atan2(X, Z + 0.03)
  const s = th * 3.5 + (1.84 - Y) * 5.5 + 0.55 * (vnoise(X * 13 + 5, Y * 5, Z * 13) - 0.5) * 2
  const id = Math.floor(s), f = s - id
  const ridge = Math.sin(Math.PI * f)
  const curl = 0.5 + 0.5 * Math.sin(Y * 105 + hash1(id) * 6.28 + f * 2.2)
  return [ridge, id, curl]
}
export function hairSdf(X: number, Y: number, Z: number) {
  const ax = Math.abs(X)
  let d = sdEll(X, Y, Z, 0, 1.712, -0.024, 0.104, 0.118, 0.102) // 头顶 / 后脑
  d = smin(d, sdEll(ax, Y, Z, 0.082, 1.68, -0.022, 0.038, 0.068, 0.058), 0.03) // 耳侧蓬出（附图：两鬓向外蓬）
  d = smin(d, sdRoundCone(ax, Y, Z, 0.09, 1.69, -0.004, 0.08, 1.585, -0.014, 0.03, 0.017), 0.025) // 鬓边垂下的一簇（到面盘下巴高度）
  d = smin(d, sdEll(X, Y, Z, 0, 1.62, -0.072, 0.085, 0.082, 0.05), 0.035) // 后颈蓬出（盖到领子上沿）
  d = smin(d, sdEll(ax, Y, Z, 0.052, 1.79, 0.016, 0.058, 0.038, 0.058), 0.03) // 额上蓬起
  // 大团起伏 + 成簇（簇间有沟、簇内带卷）+ 细碎
  const [rg, , cu] = hairClump(X, Y, Z)
  d -= 0.0065 * (fbm(X * 9 + 3, Y * 9, Z * 9, 2) - 0.3)
  d -= 0.006 * (Math.pow(rg, 0.7) - 0.55) + 0.0022 * cu * rg
  d -= 0.0012 * vnoise(X * 70, Y * 30, Z * 70)
  // 帽口压住头发：帽筒里头发压到帽底平面，帽口外 4–5 cm 内渐渐回到原来的蓬度
  {
    const [, hy, , hr] = hatLocal(X, Y, Z)
    d = smax(d, hy - (0.003 + 0.032 * sstep(HAT.r0 - 0.006, HAT.r0 + 0.05, hr)), 0.006)
  }
  // 不越过面盘：面盘包络里面压到面盘背面后 5 mm；包络外 2 cm 内可以往前凑一点（发框）
  const lx = X - FACE_C[0], ly = Y - FACE_C[1]
  const env = faceEnv(lx, ly)
  const lim = maskBackZ(X, Y) - 0.004 + 0.012 * sstep(0.0, 0.025, env) - 0.02 * sstep(-0.075, -0.115, ly) * sstep(0.03, 0.0, env)
  d = smax(d, Z - lim, 0.008)
  return d
}
/** 面盘正面外缘（模型空间 Z 的近似，按包脸弧）：搭在面具外缘上的发丝要浮在它前面 */
export const maskRimFrontZ = (X: number, Y: number) => { const lx = X - FACE_C[0], ly = Y - FACE_C[1]; return FACE_C[2] - 4.1 * lx * lx - 0.9 * Math.min(0, ly) ** 2 - 0.6 * Math.max(0, ly - 0.06) ** 2 - 0.004 }
function skinSdf(X: number, Y: number, Z: number) {
  let d = sdRoundCone(X, Y, Z, 0, 1.42, -0.02, 0, 1.64, -0.022, 0.058, 0.05)
  d = smin(d, sdEll(X, Y, Z, 0, 1.628, 0.012, 0.054, 0.048, 0.056), 0.025) // 下颌芯（藏在面盘后）
  d = smax(d, Z - maskBackZ(X, Y) + 0.002, 0.006)
  return d
}
export function headPartSdf(X: number, Y: number, Z: number) {
  if (Y < 1.4) return 1.4 - Y + 0.04
  return Math.min(hairSdf(X, Y, Z), skinSdf(X, Y, Z))
}
export const HEAD_BOX = { min: [-0.18, 1.42, -0.18] as [number, number, number], max: [0.18, 1.89, 0.14] as [number, number, number] }
export const isHair = (X: number, Y: number, Z: number) => hairSdf(X, Y, Z) < skinSdf(X, Y, Z) + 0.0008
const HAIR = C(0xb57f3e), HAIR_LT = C(0xd8a862), HAIR_DK = C(0x6e4520), SKIN = C(0xc9b9a2), INNER = C(0x14152a)
export function headShade(X: number, Y: number, Z: number, o: Shade) {
  if (isHair(X, Y, Z)) {
    // 哑光：按簇分深浅（簇间沟暗、簇中亮、每簇色调不同），簇内卷曲处一道亮
    const [rg, id, cu] = hairClump(X, Y, Z), hv = hash1(id * 3.7 + 1)
    let c = mixc(HAIR_DK, HAIR, sstep(0.05, 0.6, rg))
    c = mixc(c, HAIR_LT, 0.55 * sstep(0.55, 1, rg) * sstep(0.35, 0.9, cu))
    c = mulc(c, 0.86 + 0.26 * hv + 0.12 * (fbm(X * 30, Y * 12, Z * 30, 2) - 0.4))
    c = mixc(c, HAIR_DK, 0.4 * sstep(1.66, 1.57, Y))
    setS(o, c, 1, 0, 1, 0, 0, 0)
    // 毛流：从发旋向外、向下
    const fx = X - CROWN[0], fy = Y - CROWN[1], fz = Z - CROWN[2], l = Math.hypot(fx, fy, fz) || 1
    const f = nrm([fx / l, fy / l - 0.9, fz / l])
    o.fx = f[0]; o.fy = f[1]; o.fz = f[2]
    return
  }
  let c = SKIN
  // 立领 V 口里露出的深色内领
  if (Z > -0.02 && Y < 1.548) c = mixc(c, INNER, sstep(1.548, 1.535, Y))
  setS(o, c, 0.6, 0, 0, 1, 0, 0)
}
export function headWeights(X: number, Y: number, Z: number, acc: W4) {
  if (isHair(X, Y, Z)) {
    const k = sstep(1.6, 1.53, Y) * 0.6
    acc.add(B.neck, k); acc.add(B.head, 1 - k); return
  }
  // 颈：领口内归胸，往上渐变到颈、再到头（过渡带宽，给拧头留余量）
  const c = sstep(1.49, 1.43, Y), h = sstep(1.52, 1.665, Y) // 阶段 2：颈→头过渡带加宽（拧 180° 时扭转摊在 14 cm 上，不起麻花纹）
  acc.add(B.chest, c); acc.add(B.neck, (1 - c) * (1 - h)); acc.add(B.head, (1 - c) * h)
  void Z; void X
}
/** 发片分区：头发表面、不在面盘前方；返回密度（每平方米发根数）与长度系数 */
export function hairZone(m: V3, n: V3): { density: number; len: number; out: V3 } | null {
  const lx = m[0] - FACE_C[0], ly = m[1] - FACE_C[1]
  if (m[1] < 1.56) return null
  const env = faceEnv(lx, ly)
  // 面盘四周（发框）：沿面盘平面向外翘
  const rim = sstep(0.05, 0.0, env) * sstep(-0.06, 0.0, m[2] - maskBackZ(m[0], m[1]))
  const radial = nrm([lx, ly + 0.02, -0.25])
  const out = nrm([mix(n[0], radial[0], rim * 0.7), mix(n[1], radial[1], rim * 0.7) , mix(n[2], radial[2], rim * 0.7)])
  const top = sstep(1.7, 1.8, m[1])
  return { density: 1300 + 2800 * rim + 800 * top, len: 0.8 + 0.35 * rim + 0.2 * top, out }
}

// ---------- 帽 ----------
let hatTex: { side: THREE.Texture | null; top: THREE.Texture | null } | null = null
function hatTextures() {
  if (hatTex) return hatTex
  if (typeof document === 'undefined') return (hatTex = { side: null, top: null })
  // 侧带：u 绕一圈（1024），v 自下而上（128）。下段藏青带光泽（几道竖向高光），上段深藏青，交界一圈黑色锯齿（齿尖朝下），下缘一道黑色扇贝饰边
  const W = 1024, H = 160, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!
  const gr = g.createLinearGradient(0, H, 0, 0); gr.addColorStop(0, '#2a3156'); gr.addColorStop(0.55, '#38406a'); gr.addColorStop(1, '#262c4e')
  g.fillStyle = gr; g.fillRect(0, 0, W, H)
  for (let k = 0; k < 7; k++) { const x = (k / 7) * W + 40, w = 30 + (k % 3) * 18; const g2 = g.createLinearGradient(x - w, 0, x + w, 0); g2.addColorStop(0, 'rgba(160,175,205,0)'); g2.addColorStop(0.5, `rgba(170,185,215,${0.22 + 0.1 * (k % 2)})`); g2.addColorStop(1, 'rgba(160,175,205,0)'); g.fillStyle = g2; g.fillRect(x - w, H * 0.12, w * 2, H * 0.62) }
  // 上段深色 + 锯齿
  g.fillStyle = '#12142a'; g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); const nT = 22
  for (let k = nT; k >= 0; k--) { const x = (k / nT) * W; g.lineTo(x, H * 0.36); if (k > 0) g.lineTo(x - W / nT / 2, H * 0.58) }
  g.closePath(); g.fill()
  g.strokeStyle = '#05060f'; g.lineWidth = 3; g.stroke()
  // 下缘扇贝饰边
  g.fillStyle = '#0b0c1a'; g.fillRect(0, H - 14, W, 14)
  for (let k = 0; k < 44; k++) { g.beginPath(); g.arc((k + 0.5) * (W / 44), H - 14, W / 88, Math.PI, 0); g.fill() }
  // 水彩颗粒
  const img = g.getImageData(0, 0, W, H), D = img.data; let s = 7
  for (let k = 0; k < D.length; k += 4) { s = (s * 16807) % 2147483647; const n = (s / 2147483647 - 0.5) * 14; D[k] += n; D[k + 1] += n; D[k + 2] += n }
  g.putImageData(img, 0, 0)
  const side = new THREE.CanvasTexture(c); side.colorSpace = THREE.SRGBColorSpace; side.wrapS = THREE.RepeatWrapping; side.anisotropy = 4
  // 顶：深藏青 + 金色四芒星（略斜，四角各一点）
  const T = 256, c2 = document.createElement('canvas'); c2.width = c2.height = T; const h = c2.getContext('2d')!
  const g3 = h.createRadialGradient(T * 0.4, T * 0.4, 10, T / 2, T / 2, T * 0.6); g3.addColorStop(0, '#262b4c'); g3.addColorStop(1, '#151831'); h.fillStyle = g3; h.fillRect(0, 0, T, T)
  h.save(); h.translate(T / 2, T / 2); h.rotate(0.3); h.fillStyle = '#d9a94a'; h.strokeStyle = '#8a6420'; h.lineWidth = 2
  h.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, r = k % 2 ? 9 : 40; h.lineTo(Math.cos(a) * r, Math.sin(a) * r) } h.closePath(); h.fill(); h.stroke()
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; h.beginPath(); h.arc(Math.cos(a) * 22, Math.sin(a) * 22, 4.5, 0, Math.PI * 2); h.fill() }
  h.restore()
  const top = new THREE.CanvasTexture(c2); top.colorSpace = THREE.SRGBColorSpace
  return (hatTex = { side, top })
}
let hatMats: THREE.Material[] | null = null
function glazeM(m: THREE.Material, k: number) {
  const prev = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey()
  m.onBeforeCompile = (sh, r) => { prev(sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
    { vec3 Vv = normalize(vViewPosition); vec3 Hh = normalize(normalize(vec3(0.35, 0.62, 0.7)) + Vv); totalEmissiveRadiance += ${k.toFixed(3)} * pow(max(dot(normal, Hh), 0.0), 20.0) * vec3(0.8, 0.85, 1.0); }`) }
  m.customProgramCacheKey = () => key + '|bellhop-hat-' + k
  return m
}
/** 藏青圆筒帽（挂 head 骨；局部原点 = 帽底中心）。lod1 段数减半 */
export function buildHat(lod = 0): THREE.Group {
  const t = hatTextures()
  if (!hatMats) hatMats = [glazeM(litMaterial({ color: '#ffffff', map: t.side ?? undefined, roughness: 0.35 }), 0.16), glazeM(litMaterial({ color: '#ffffff', map: t.top ?? undefined, roughness: 0.35 }), 0.12), litMaterial({ color: '#0a0b14', roughness: 0.9 })]
  const g = new THREE.Group(); g.name = 'bellhopHat'
  const { r0, r1, h } = HAT, seg = lod ? 20 : 40
  // 侧带：自下而上，上沿圆角收进顶面
  const prof: THREE.Vector2[] = []
  const nS = lod ? 6 : 12
  for (let k = 0; k <= nS; k++) { const v = k / nS; prof.push(new THREE.Vector2(mix(r0, r1, v) + 0.0015 * gauss(v - 0.05, 0.05), v * (h - 0.008))) }
  for (let k = 1; k <= 4; k++) { const a = (k / 4) * Math.PI / 2; prof.push(new THREE.Vector2(r1 - 0.008 + Math.cos(a) * 0.008, h - 0.008 + Math.sin(a) * 0.008)) }
  const side = new THREE.LatheGeometry(prof, seg)
  // LatheGeometry 的 v 沿轮廓 0→1：侧带贴图的 v 按高度重算
  const uv = side.attributes.uv as THREE.BufferAttribute, pa = side.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setY(i, clamp(pa.getY(i) / h, 0, 1))
  const sm = new THREE.Mesh(side, hatMats[0]); sm.castShadow = true; g.add(sm)
  // 顶面：微微鼓起
  const top = new THREE.CircleGeometry(r1 - 0.008, seg).rotateX(-Math.PI / 2)
  { const p = top.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) { const r = len2(p.getX(i), p.getZ(i)); p.setY(i, h + 0.003 * (1 - (r / r1) ** 2)) } top.computeVertexNormals() }
  const tm = new THREE.Mesh(top, hatMats[1]); g.add(tm)
  // 帽里（底面暗色，从下面看不穿帮）
  const bot = new THREE.CircleGeometry(r0, seg).rotateX(Math.PI / 2)
  g.add(new THREE.Mesh(bot, hatMats[2]))
  g.position.set(HAT.c[0], HAT.c[1], HAT.c[2]); g.rotation.set(HAT.tiltX, 0, HAT.tiltZ)
  return g
}
void smax
