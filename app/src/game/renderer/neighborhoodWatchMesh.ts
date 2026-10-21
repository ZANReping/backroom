// 邻里守望（Entity 96）重制模型——第 1 阶段：静态建模。观察者（Watcher）与挺进者（Strider）。
// 依据中文维基 entity-96 与用户附图：
//   观察者：一颗离地悬浮、约一辆车大小的白色巨眼，青绿色虹膜，巩膜上布满暗红裂纹般的血丝与隆起的眼静脉束。
//   挺进者：一颗白色眼球（琥珀褐虹膜），下方伸出 6 条细长的红色管状附肢（脉络膜、神经与血管拧成），像蜘蛛一样高高支起。
//
// 每种一个 SkinnedMesh，5 个材质组 = 5 次绘制：
//   组 0 巩膜（Canvas 等距柱状贴图：裂纹血丝、阴影、泛黄的后半球）
//   组 1 虹膜（Canvas 极坐标贴图：放射状纤维、领状环、暗色角膜缘）
//   组 2 瞳孔（近黑；运行时可调 emissive，作光束蓄力的内部辉光）
//   组 3 角膜（半透明高光圆顶）
//   组 4 肉质（隆起的眼静脉、视神经残端、垂须、附肢，顶点色）
//
// 尺寸（scale=1）：观察者眼球直径 2.2m，球心离地 1.75m（底部离地约 0.65m）；
//   挺进者眼球直径 1.0m，站立时球心离地 2.05m，6 条附肢各约 2.9m（基段 + 三节 + 卷曲足端）。
// 朝向约定：+X 正面（瞳孔方向）、+Y 向上。观察者原点 = 球心；挺进者原点 = 地面投影点。
// 骨骼静止时全为单位旋转，只有平移；瞳孔骨骼的 YZ 缩放 = 瞳孔放大/收缩（虹膜内圈跟随）。
import * as THREE from 'three'
import { getMaterialMode, litMaterial, mulberry } from './shared'
import { installL0EnvironmentShader } from './l0EnvironmentShader'
import { installL1DynamicProbe } from './l1Probes'
import { Acc, RigDesc, V, clamp01, hex, lerp, mixc, newPart, pushV, skinFrom, smooth, sweep, w1, w2, rigBudget } from './rigKit'
import type { RGB, V3, Wt } from './rigKit'

export type WatchKind = 'watcher' | 'strider'
const G_SCLERA = 0, G_IRIS = 1, G_PUPIL = 2, G_CORNEA = 3, G_FLESH = 4

// ============================================================================
// 程序贴图
// ============================================================================
const TEX: Record<string, THREE.CanvasTexture | null> = {}
/** 巩膜：u = 方位角 φ / 2π，v = 离瞳孔轴的极角 θ / π（0 = 正前，1 = 正后） */
function scleraTexture(kind: WatchKind): THREE.CanvasTexture | null {
  const key = 'sc-' + kind
  if (key in TEX) return TEX[key]
  if (typeof document === 'undefined') return (TEX[key] = null)
  const W = 1024, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const g = cv.getContext('2d')!, R = mulberry(kind === 'watcher' ? 961 : 962)
  // 底色：前半球瓷白，后半球泛黄带灰；横向轻微污斑
  const grd = g.createLinearGradient(0, 0, 0, H)
  grd.addColorStop(0, '#f2efe6'); grd.addColorStop(0.35, '#e9e5da'); grd.addColorStop(0.7, '#d8d0bd'); grd.addColorStop(1, '#bfb39a')
  g.fillStyle = grd; g.fillRect(0, 0, W, H)
  for (let i = 0; i < 260; i++) {
    const x = R() * W, y = R() * H, r = 8 + R() * 40
    const rg = g.createRadialGradient(x, y, 0, x, y, r)
    rg.addColorStop(0, `rgba(${150 + R() * 40},${130 + R() * 30},${110 + R() * 20},${0.05 + R() * 0.06})`); rg.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // 角膜缘一圈充血（v 小处）
  const limbus = kind === 'watcher' ? 0.165 : 0.15
  const lg = g.createLinearGradient(0, limbus * H, 0, (limbus + 0.09) * H)
  lg.addColorStop(0, 'rgba(170,60,55,0.35)'); lg.addColorStop(1, 'rgba(170,60,55,0)')
  g.fillStyle = lg; g.fillRect(0, limbus * H, W, 0.09 * H)
  // 裂纹血丝：从角膜缘向后方的分叉随机游走（附图：暗红细裂纹布满全球）
  const vein = (x: number, y: number, ang: number, w: number, len: number, depth: number) => {
    g.lineCap = 'round'
    let px = x, py = y
    for (let s = 0; s < len; s++) {
      ang += (R() - 0.5) * 0.9
      const nx = px + Math.cos(ang) * 6, ny = py + Math.sin(ang) * 6 * 0.55
      g.strokeStyle = `rgba(${110 + R() * 50},${20 + R() * 25},${22 + R() * 20},${0.55 + R() * 0.35})`
      g.lineWidth = Math.max(0.6, w * (1 - s / len))
      g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke()
      // 环绕接缝：u 方向周期
      if (nx < 0 || nx > W) { g.beginPath(); g.moveTo(px - Math.sign(nx) * W, py); g.lineTo(nx - Math.sign(nx) * W, ny); g.stroke() }
      px = (nx + W) % W; py = ny
      if (py > H || py < 0) break
      if (depth < 3 && R() < 0.07) vein(px, py, ang + (R() < 0.5 ? 0.8 : -0.8), w * 0.6, len * 0.55, depth + 1)
    }
  }
  const nVein = kind === 'watcher' ? 30 : 22
  for (let i = 0; i < nVein; i++) vein(R() * W, (limbus + 0.02 + R() * 0.05) * H, Math.PI / 2 + (R() - 0.5) * 1.4, 1.6 + R() * 1.8, 30 + R() * 50, 0)
  for (let i = 0; i < nVein * 0.6; i++) vein(R() * W, (0.3 + R() * 0.55) * H, R() * Math.PI * 2, 1 + R() * 1.4, 18 + R() * 30, 1) // 后半球零散裂纹
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; t.userData.entityShared = true
  return (TEX[key] = t)
}
/** 虹膜：极坐标（中心 = 瞳孔），r = 0.5 为角膜缘 */
function irisTexture(kind: WatchKind): THREE.CanvasTexture | null {
  const key = 'ir-' + kind
  if (key in TEX) return TEX[key]
  if (typeof document === 'undefined') return (TEX[key] = null)
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S
  const g = cv.getContext('2d')!, R = mulberry(kind === 'watcher' ? 77 : 78), c = S / 2
  const pal = kind === 'watcher'
    ? { base: '#2f7d78', light: '#8fd3c2', dark: '#123a3c', ring: '#0a1e22', fleck: '#d8c27a' }
    : { base: '#8a5a2c', light: '#d6a564', dark: '#3e220e', ring: '#1e1006', fleck: '#e2c890' }
  const rg = g.createRadialGradient(c, c, S * 0.08, c, c, S * 0.5)
  rg.addColorStop(0, pal.dark); rg.addColorStop(0.3, pal.base); rg.addColorStop(0.72, pal.base); rg.addColorStop(0.9, pal.dark); rg.addColorStop(1, pal.ring)
  g.fillStyle = rg; g.fillRect(0, 0, S, S)
  // 放射状纤维（基质小梁）
  for (let i = 0; i < 900; i++) {
    const a = R() * Math.PI * 2, r0 = S * (0.1 + R() * 0.12), r1 = S * (0.3 + R() * 0.19)
    g.strokeStyle = R() < 0.55 ? `rgba(${hexRgb(pal.light)},${0.12 + R() * 0.25})` : `rgba(${hexRgb(pal.dark)},${0.15 + R() * 0.3})`
    g.lineWidth = 0.6 + R() * 1.6
    g.beginPath(); g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0)
    const wob = (R() - 0.5) * 0.08
    g.quadraticCurveTo(c + Math.cos(a + wob) * (r0 + r1) / 2, c + Math.sin(a + wob) * (r0 + r1) / 2, c + Math.cos(a + wob * 2) * r1, c + Math.sin(a + wob * 2) * r1)
    g.stroke()
  }
  // 领状环（collarette）与隐窝
  g.strokeStyle = `rgba(${hexRgb(pal.light)},0.45)`; g.lineWidth = 3
  g.beginPath(); for (let k = 0; k <= 72; k++) { const a = (k / 72) * Math.PI * 2, r = S * (0.2 + 0.018 * Math.sin(a * 9) + 0.01 * Math.sin(a * 23)); k ? g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r) : g.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r) } g.stroke()
  for (let i = 0; i < 40; i++) { const a = R() * Math.PI * 2, r = S * (0.22 + R() * 0.18); g.fillStyle = `rgba(${hexRgb(pal.dark)},${0.3 + R() * 0.3})`; g.beginPath(); g.ellipse(c + Math.cos(a) * r, c + Math.sin(a) * r, 2 + R() * 5, 1 + R() * 2, a, 0, Math.PI * 2); g.fill() }
  for (let i = 0; i < 26; i++) { const a = R() * Math.PI * 2, r = S * (0.25 + R() * 0.15); g.fillStyle = `rgba(${hexRgb(pal.fleck)},${0.25 + R() * 0.25})`; g.beginPath(); g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 1 + R() * 2.5, 0, Math.PI * 2); g.fill() }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData.entityShared = true
  return (TEX[key] = t)
}
function hexRgb(h: string) { const c = new THREE.Color(h); return `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}` }

// ============================================================================
// 眼球
// ============================================================================
interface EyeSpec {
  kind: WatchKind; c: V3; r: number; bEye: number; bPupil: number
  limbus: number // 虹膜角半径（rad）
  pupil: number // 静止瞳孔半径 / 虹膜半径
}
/** 眼球的方向向量：θ 离 +X 轴的极角，φ 绕 X 轴的方位角（φ=0 → +Y） */
const dirOf = (th: number, ph: number) => V(Math.cos(th), Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph))
function buildEye(acc: Acc, s: EyeSpec) {
  const { c, r, bEye, bPupil, limbus } = s
  // —— 巩膜：θ ∈ [limbus, π]
  const NT = 30, NP = 48
  const sc = newPart()
  for (let i = 0; i <= NT; i++) {
    const th = lerp(limbus, Math.PI, (i / NT) ** 0.92)
    for (let j = 0; j <= NP; j++) {
      const ph = (j / NP) * Math.PI * 2, d = dirOf(th, ph)
      pushV(sc, c.clone().addScaledVector(d, r), d, [j / NP, th / Math.PI], [1, 1, 1], w1(bEye))
    }
  }
  for (let i = 0; i < NT; i++) for (let j = 0; j < NP; j++) { const a = i * (NP + 1) + j, b = a + NP + 1; sc.idx.push(a, a + 1, b, b, a + 1, b + 1) }
  acc.add(G_SCLERA, sc)
  // —— 虹膜：微凹圆盘（中央下陷），内圈权重给瞳孔骨骼（缩放瞳孔时虹膜内缘跟随）
  const ir = newPart(), rimR = r * Math.sin(limbus), rimX = r * Math.cos(limbus)
  const NR = 10, rp = s.pupil
  for (let i = 0; i <= NR; i++) {
    const t = lerp(rp, 1, i / NR), rr = t * rimR
    const x = c.x + rimX - r * 0.035 * (1 - t) - r * 0.01
    for (let j = 0; j <= NP; j++) {
      const ph = (j / NP) * Math.PI * 2, y = Math.cos(ph) * rr, z = Math.sin(ph) * rr
      const k = smooth(0, 0.55, (t - rp) / (1 - rp))
      pushV(ir, V(x, c.y + y, c.z + z), V(1, -0.15 * y / r, -0.15 * z / r).normalize(), [0.5 + 0.5 * t * Math.cos(ph), 0.5 + 0.5 * t * Math.sin(ph)], [1, 1, 1], w2(bPupil, bEye, k))
    }
  }
  for (let i = 0; i < NR; i++) for (let j = 0; j < NP; j++) { const a = i * (NP + 1) + j, b = a + NP + 1; ir.idx.push(a, b, a + 1, b, b + 1, a + 1) }
  acc.add(G_IRIS, ir)
  // —— 瞳孔：向内凹的黑色漏斗（深处可发光）
  const pu = newPart(), prR = rp * rimR, px = c.x + rimX - r * 0.045
  pushV(pu, V(px - r * 0.12, c.y, c.z), V(1, 0, 0), [0.5, 0.5], [0.02, 0.02, 0.025], w1(bPupil))
  for (let ring = 1; ring <= 2; ring++) for (let j = 0; j <= NP; j++) {
    const ph = (j / NP) * Math.PI * 2, rr = prR * (ring === 2 ? 1.0 : 0.7), x = ring === 2 ? px : px - r * 0.06
    pushV(pu, V(x, c.y + Math.cos(ph) * rr, c.z + Math.sin(ph) * rr), V(1, 0, 0), [0.5, 0.5], ring === 2 ? [0.035, 0.03, 0.03] : [0.015, 0.012, 0.012], w1(bPupil))
  }
  for (let j = 0; j < NP; j++) { pu.idx.push(0, 1 + j, 2 + j); const a = 1 + j, b = 1 + NP + 1 + j; pu.idx.push(a, b, a + 1, b, b + 1, a + 1) }
  acc.add(G_PUPIL, pu)
  // —— 角膜：比球面略凸的透明圆顶
  const co = newPart(), NC = 8
  for (let i = 0; i <= NC; i++) {
    const th = (i / NC) * (limbus + 0.04)
    const bulge = 1 + 0.045 * Math.cos((th / (limbus + 0.04)) * Math.PI / 2) ** 2
    for (let j = 0; j <= NP; j++) {
      const ph = (j / NP) * Math.PI * 2, d = dirOf(th, ph)
      pushV(co, c.clone().addScaledVector(d, r * bulge), d, [0.5, 0.5], [1, 1, 1], w1(bEye))
    }
  }
  for (let i = 0; i < NC; i++) for (let j = 0; j < NP; j++) { const a = i * (NP + 1) + j, b = a + NP + 1; co.idx.push(a, a + 1, b, b, a + 1, b + 1) }
  acc.add(G_CORNEA, co)
}

/** 球面上的隆起眼静脉束：沿球面随机游走的细管，起点在角膜缘附近，向后蜿蜒并分叉 */
function eyeVeins(acc: Acc, R: () => number, c: V3, r: number, limbus: number, bEye: number, count: number, thick: number) {
  const col: RGB = hex('#7a1f24'), dark: RGB = hex('#4a1016')
  const walk = (th: number, ph: number, len: number, rad: number, depth: number) => {
    const pts: V3[] = []
    let dth = 0.05 + R() * 0.03, dph = (R() - 0.5) * 0.06
    for (let k = 0; k < len; k++) {
      pts.push(c.clone().addScaledVector(dirOf(th, ph), r * (1 + rad * 0.45)))
      dth += (R() - 0.5) * 0.03; dph += (R() - 0.5) * 0.05; dth = Math.max(0.015, Math.min(0.09, dth))
      th += dth; ph += dph / Math.max(0.3, Math.sin(th))
      if (th > Math.PI - 0.15) break
      if (depth < 2 && k > 3 && R() < 0.12) walk(th, ph, Math.floor(len * 0.5), rad * 0.62, depth + 1)
    }
    if (pts.length < 3) return
    const n = pts.length - 1
    const sw = sweep(pts, 5, (i, a) => { const t = i / n, rr = r * rad * (i === 0 ? 0.2 : 1 - 0.75 * t) * (i === n ? 0 : 1); return [Math.cos(a) * rr, Math.sin(a) * rr * 0.7] }, {
      col: (i) => mixc(col, dark, i / n * 0.6 + R() * 0.15), w: () => w1(bEye),
    })
    acc.add(G_FLESH, sw.part)
  }
  for (let k = 0; k < count; k++) walk(limbus + 0.04 + R() * 0.08, R() * Math.PI * 2, 14 + Math.floor(R() * 16), thick * (0.7 + R() * 0.6), 0)
}

// ============================================================================
// 观察者
// ============================================================================
export const WATCHER_R = 1.1
export const WATCHER_HOVER = 1.75
function buildWatcher() {
  const acc = new Acc(5), rig = new RigDesc(), R = mulberry(9601)
  const c = V(0, 0, 0), r = WATCHER_R, limbus = 0.52
  const bRoot = rig.bone('root', c, -1)
  const bEye = rig.bone('eye', c, bRoot)
  const bPupil = rig.bone('pupil', V(r * Math.cos(limbus), 0, 0), bEye)
  buildEye(acc, { kind: 'watcher', c, r, bEye, bPupil, limbus, pupil: 0.36 })
  eyeVeins(acc, R, c, r, limbus, bEye, 12, 0.022)
  // 视神经残端：后方一截粗短的灰粉色管，末端炸开成 6 条垂下的血管须（各 3 节骨骼，飘动用）
  const back = V(-r * 0.93, -r * 0.12, 0)
  const stem = sweep([back.clone().add(V(r * 0.1, 0, 0)), back.clone().add(V(-r * 0.12, -0.02, 0)), back.clone().add(V(-r * 0.26, -0.07, 0))], 12,
    (i, a) => { const rr = r * [0.17, 0.15, 0.12][i]; return [Math.cos(a) * rr, Math.sin(a) * rr] }, { col: (i) => mixc(hex('#b88a84'), hex('#6e2c34'), i / 2), w: () => w1(bEye) })
  acc.add(G_FLESH, stem.part)
  const tip = back.clone().add(V(-r * 0.26, -0.07, 0))
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3, len = r * (0.55 + R() * 0.45)
    const dir = V(-0.55, -0.75 + Math.cos(a) * 0.25, Math.sin(a) * 0.55).normalize()
    const joints: V3[] = [tip.clone().add(V(0, Math.cos(a) * r * 0.06, Math.sin(a) * r * 0.06))]
    for (let s = 1; s <= 3; s++) joints.push(joints[s - 1].clone().addScaledVector(dir, len / 3).add(V(0, -0.06 * s * s * 0.25, 0)))
    let par = bEye
    const bs: number[] = []
    for (let s = 0; s < 3; s++) { par = rig.bone(`ten${k}_${s}`, joints[s], par); bs.push(par) }
    tube(acc, joints, bs, r * 0.035, r * 0.008, (t) => mixc(hex('#8a2e36'), hex('#3c1218'), t), 5)
  }
  return finish(acc, rig)
}

// ============================================================================
// 挺进者
// ============================================================================
export const STRIDER_R = 0.5
export const STRIDER_STAND = 2.05
/** 附肢方位（绕竖轴，0 = +X 正前）：前、中、后各一对 */
export const STRIDER_LEG_AZ = [0.62, 1.55, 2.45, -0.62, -1.55, -2.45]
/** 附肢静止关节（相对地面原点）：基部 → 上举段 → 膝顶 → 下行段 → 足端 */
export function striderLegRest(i: number): V3[] {
  const a = STRIDER_LEG_AZ[i], dx = Math.cos(a), dz = Math.sin(a), H = STRIDER_STAND, r = STRIDER_R
  const at = (rad: number, y: number) => V(dx * rad, y, dz * rad)
  return [at(r * 0.45, H - r * 0.72), at(0.85, H + 0.25), at(1.45, H + 0.55), at(2.05, 1.05), at(2.3, 0.04)]
}
function buildStrider() {
  const acc = new Acc(5), rig = new RigDesc(), R = mulberry(9602)
  const H = STRIDER_STAND, r = STRIDER_R, limbus = 0.47
  const c = V(0, H, 0)
  const bRoot = rig.bone('root', V(0, 0, 0), -1)
  const bBody = rig.bone('body', c, bRoot)
  const bEye = rig.bone('eye', c, bBody)
  const bPupil = rig.bone('pupil', c.clone().add(V(r * Math.cos(limbus), 0, 0)), bEye)
  buildEye(acc, { kind: 'strider', c, r, bEye, bPupil, limbus, pupil: 0.3 })
  eyeVeins(acc, R, c, r, limbus, bEye, 5, 0.03)
  // 腹侧附肢基座：盘结的血管团（不随眼球转动，挂在 body 上）
  const hub = c.clone().add(V(-r * 0.05, -r * 0.78, 0))
  for (let k = 0; k < 14; k++) {
    const a = R() * Math.PI * 2, d = V(Math.cos(a), 0.15 + R() * 0.3, Math.sin(a)).normalize()
    const p0 = hub.clone().addScaledVector(d, r * 0.1), p1 = hub.clone().addScaledVector(d, r * (0.35 + R() * 0.2)).add(V(0, r * 0.15, 0)), p2 = c.clone().addScaledVector(V(d.x, -0.55, d.z).normalize(), r * 0.98)
    const sw = sweep([p0, p1, p2], 6, (i, a) => { const rr = r * (0.07 - i * 0.022); return [Math.cos(a) * rr, Math.sin(a) * rr] }, { col: () => mixc(hex('#a02a30'), hex('#5a1820'), R()), w: () => w1(bBody) })
    acc.add(G_FLESH, sw.part)
  }
  const hubSw = sweep([hub.clone().add(V(0, r * 0.25, 0)), hub, hub.clone().add(V(0, -r * 0.16, 0))], 12, (i, a) => { const rr = r * [0.3, 0.26, 0.0][i]; return [Math.cos(a) * rr, Math.sin(a) * rr] }, { col: () => hex('#7c2228'), w: () => w1(bBody) })
  acc.add(G_FLESH, hubSw.part)
  // 6 条附肢：每条 5 骨（L{i}_0..4），主管 + 缠绕的脉络膜（暗红）与神经（苍白）细股，足端卷曲 + 3 根抓握细须
  for (let i = 0; i < 6; i++) {
    const J = striderLegRest(i), bs: number[] = []
    let par = bBody
    for (let s = 0; s < 5; s++) { par = rig.bone(`L${i}_${s}`, J[s], par); bs.push(par) }
    const pts = smoothPath(J, 7)
    const n = pts.length - 1
    const wOf = (t: number): Wt => { const f = t * 4, s = Math.min(3, Math.floor(f)); return w2(bs[s], bs[s + 1], smooth(0.25, 0.75, f - s)) }
    const main = sweep(pts, 8, (k, a) => { const t = k / n, rr = lerp(0.075, 0.03, t ** 0.8) * (1 + 0.12 * Math.sin(t * 40 + i)); return [Math.cos(a) * rr, Math.sin(a) * rr] }, {
      col: (k) => mixc(hex('#c2353a'), hex('#8e2228'), 0.5 + 0.5 * Math.sin(k * 0.7 + i)), w: (k) => wOf(k / n),
    })
    acc.add(G_FLESH, main.part)
    // 缠绕股：两股螺旋
    for (const [ofs, colA, rad] of [[0, '#5e141c', 0.016], [Math.PI, '#d8b4a8', 0.011]] as [number, string, number][]) {
      const hp: V3[] = []
      for (let k = 0; k <= n; k++) {
        const t = k / n, rr = lerp(0.075, 0.03, t ** 0.8) * 1.05, a = ofs + t * Math.PI * 2 * 7
        const T = main.tan[k], up = Math.abs(T.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0)
        const s1 = V(0, 0, 0).crossVectors(T, up).normalize(), s2 = V(0, 0, 0).crossVectors(T, s1).normalize()
        hp.push(pts[k].clone().addScaledVector(s1, Math.cos(a) * rr).addScaledVector(s2, Math.sin(a) * rr))
      }
      const sw = sweep(hp, 4, (k, a) => { const rr = rad * (1 - 0.5 * k / n); return [Math.cos(a) * rr, Math.sin(a) * rr] }, { col: () => hex(colA), w: (k) => wOf(k / n) })
      acc.add(G_FLESH, sw.part)
    }
    // 足端：卷曲的末梢 + 3 根抓握细须（挂在最后一节）
    const foot = J[4], dirOut = V(Math.cos(STRIDER_LEG_AZ[i]), 0, Math.sin(STRIDER_LEG_AZ[i]))
    for (let f = 0; f < 3; f++) {
      const a = (f - 1) * 0.7, side = V(-dirOut.z, 0, dirOut.x)
      const d = dirOut.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a))
      const fp = [foot.clone(), foot.clone().addScaledVector(d, 0.1).add(V(0, 0.01, 0)), foot.clone().addScaledVector(d, 0.17).add(V(0, 0.04, 0)), foot.clone().addScaledVector(d, 0.16).add(V(0, 0.09, 0))]
      const sw = sweep(fp, 4, (k, a) => { const rr = 0.018 * (1 - k / 3) + 0.002; return [Math.cos(a) * rr, Math.sin(a) * rr] }, { col: () => hex('#9a2830'), w: () => w1(bs[4]) })
      acc.add(G_FLESH, sw.part)
    }
  }
  return finish(acc, rig)
}
/** Catmull-Rom 平滑关节折线（每段 seg 个插值点） */
function smoothPath(J: V3[], seg: number): V3[] {
  const curve = new THREE.CatmullRomCurve3(J, false, 'centripetal')
  return curve.getPoints((J.length - 1) * seg)
}
/** 沿关节的蒙皮细管（按弧长分配到骨骼） */
function tube(acc: Acc, J: V3[], bs: number[], r0: number, r1: number, col: (t: number) => RGB, cols: number) {
  const pts = smoothPath(J, 5), n = pts.length - 1, segs = bs.length
  const sw = sweep(pts, cols, (k, a) => { const rr = lerp(r0, r1, k / n) * (k === n ? 0.3 : 1); return [Math.cos(a) * rr, Math.sin(a) * rr] }, {
    col: (k) => col(k / n),
    w: (k) => { const f = (k / n) * segs, s = Math.min(segs - 1, Math.floor(f)); return s + 1 < segs ? w2(bs[s], bs[s + 1], smooth(0.5, 1, f - s)) : w1(bs[s]) },
  })
  acc.add(G_FLESH, sw.part)
}

// ============================================================================
// 汇总
// ============================================================================
export interface WatchGeometry { geo: THREE.BufferGeometry; tris: number; rig: RigDesc }
function finish(acc: Acc, rig: RigDesc): WatchGeometry {
  const geo = acc.build(); geo.computeBoundingSphere()
  return { geo, tris: (geo.index ? geo.index.count : geo.attributes.position.count) / 3, rig }
}
const CACHE: Partial<Record<WatchKind, WatchGeometry>> = {}
export function prepareWatchGeometry(kind: WatchKind) { return (CACHE[kind] ??= kind === 'watcher' ? buildWatcher() : buildStrider()) }

interface WatchMats { sclera: THREE.Material; iris: THREE.Material; pupil: THREE.MeshLambertMaterial | THREE.MeshStandardMaterial; cornea: THREE.Material; flesh: THREE.Material }
/** 每个实体实例拥有独立材质；仅程序纹理在实体之间共享。 */
function watchMaterials(kind: WatchKind): WatchMats {
  const sct = scleraTexture(kind), irt = irisTexture(kind)
  const sclera = glossy({ map: sct, roughness: 0.32, envBase: 0.55, shininess: 70 })
  const iris = glossy({ map: irt, roughness: 0.45, envBase: 0.3, shininess: 30 })
  const pupil = litMaterial({ color: '#ffffff', vertexColors: true, emissive: '#000000', roughness: 0.6, envBase: 0.05 })
  const cornea = getMaterialMode() === 'realistic'
    ? new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0, depthWrite: false })
    : new THREE.MeshPhongMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, shininess: 140, specular: '#ffffff', depthWrite: false })
  if (!(cornea as THREE.MeshStandardMaterial).isMeshStandardMaterial) { installL0EnvironmentShader(cornea); installL1DynamicProbe(cornea) }
  const flesh = glossy({ roughness: 0.5, envBase: 0.25, shininess: 35 })
  return { sclera, iris, pupil, cornea, flesh }
}
/** 湿润表面：经典模式用 Phong 才有高光；真实模式走 litMaterial（Standard） */
function glossy(p: { map?: THREE.Texture | null; roughness: number; envBase: number; shininess: number }): THREE.Material {
  if (getMaterialMode() === 'realistic') return litMaterial({ color: '#ffffff', vertexColors: true, ...(p.map ? { map: p.map } : {}), roughness: p.roughness, envBase: p.envBase })
  const m = new THREE.MeshPhongMaterial({ color: '#ffffff', vertexColors: true, ...(p.map ? { map: p.map } : {}), shininess: p.shininess, specular: '#5a5652' })
  installL0EnvironmentShader(m); installL1DynamicProbe(m)
  return m
}

export interface WatchRig {
  kind: WatchKind; mount: THREE.Group; mesh: THREE.SkinnedMesh; bones: THREE.Bone[]; byName: Record<string, THREE.Bone>; rest: V3[]; tris: number
  pupilMat: THREE.MeshLambertMaterial | THREE.MeshStandardMaterial
}
/** 构建观察者/挺进者（scale 个体缩放）。外层组 +X 正面；userData.watchRig 为骨架句柄。 */
export function buildWatchMesh(kind: WatchKind, scale = 1): THREE.Group {
  const G = prepareWatchGeometry(kind)
  const grp = new THREE.Group(); grp.userData.entityType = kind
  const mount = new THREE.Group(); mount.scale.setScalar(scale); grp.add(mount)
  const m = watchMaterials(kind)
  const sk = skinFrom(G.geo, [m.sclera, m.iris, m.pupil, m.cornea, m.flesh], G.rig, mount)
  sk.mesh.renderOrder = 1
  const rig: WatchRig = { kind, mount, mesh: sk.mesh, bones: sk.bones, byName: sk.byName, rest: sk.rest, tris: G.tris, pupilMat: m.pupil }
  grp.userData.watchRig = rig
  return grp
}
/** True once all CPU resources needed by this variant have been prepared. */
export function watchResourcesReady(kind: WatchKind): boolean {
  return !!CACHE[kind] && TEX['sc-' + kind] !== undefined && TEX['ir-' + kind] !== undefined
}
/** Cooperative first-use preparation: textures and geometry are each split by yield. */
export function* prepareWatchJob(kind: WatchKind): Generator<void, void, unknown> {
  if (TEX['sc-' + kind] === undefined) { scleraTexture(kind); yield }
  if (TEX['ir-' + kind] === undefined) { irisTexture(kind); yield }
  if (!CACHE[kind]) { CACHE[kind] = kind === 'watcher' ? buildWatcher() : buildStrider(); yield }
}
/** 瞳孔放大系数（1 = 静止；<1 收缩、>1 放大） */
export function setPupil(grp: THREE.Object3D, k: number) { const rig = grp.userData.watchRig as WatchRig | undefined; if (rig) rig.byName.pupil.scale.set(1, k, k) }
/** 瞳孔深处辉光（0..1），光束蓄力 */
export function setPupilGlow(grp: THREE.Object3D, k: number) {
  const rig = grp.userData.watchRig as WatchRig | undefined; if (!rig) return
  rig.pupilMat.emissive.setRGB(1.6 * k, 1.5 * k, 1.25 * k)
}
export const watchBudget = rigBudget
export const WATCH_BONE_NAMES = (kind: WatchKind) => prepareWatchGeometry(kind).rig.names
export { clamp01 }
