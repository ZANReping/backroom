// 第一人称手部（v71）：与复古人物同一风格的低多边形手——指节分段的手指按握持半径包住把手、
// 掌心/手背/拇指分块、手腕 + 前臂 + 袖管（带翻边袖口，袖子贴图取自身上衣服的袖子图块）。
// 不蒙皮：首次握持求解后缓存几何，动作仍由父节点（vm / vmFlash / vmLighter）整体驱动，
// 所以 renderer 里所有走路/攻击/饮用/搜索/检视动画原样兼容。
//
// 手部坐标系 H：握持轴 = +Y，穿过原点；手背朝 +X（右手），手腕在 +Z/+X 一侧，前臂沿 fdir 伸出画面。
// 姿势用「H 的 X、Y 轴落到父节点的哪个方向」描述（ax / ay），再平移到 at。左手 = 右手几何沿 X 镜像。
import * as THREE from 'three'
import { retroTexture } from './retroNpc'
import { installL0EnvironmentShader } from './l0EnvironmentShader'
import { installL1DynamicProbe } from './l1Probes'

type V3 = [number, number, number]
export interface HandPose {
  at: V3 // 握持轴中心（父节点坐标）
  ax?: V3 // H.X（手背方向）→ 父节点方向；默认 (1,0,0)
  ay?: V3 // H.Y（握持轴，食指一侧）→ 父节点方向；默认 (0,1,0)
  r: number // 把手半径（米）；0 = 空手握拳
  fdir?: V3 // 前臂方向（H 坐标），默认 (0.3,-0.35,1)
  trigger?: boolean // 食指伸直搭在扳机上
}
export type SleeveKind = 'long' | 'short' | 'none'
export interface RetroHandLook { skin: string; sleeve: string; sleeveKind: SleeveKind; topStyle: number; plainSleeve?: boolean; gloved?: boolean }
export interface RetroHand {
  group: THREE.Group
  skin: THREE.Mesh
  sleeve: THREE.Mesh
  /** item：手里的物体（其父节点坐标 = 手的父节点坐标）；给出时手指按物体真实网格接触求解。 */
  setPose(p: HandPose, item?: THREE.Object3D | null): void
  /** Cache contact geometry without changing the visible hand. Borrowed meshes; do not dispose. */
  preparePose(p: HandPose, item?: THREE.Object3D | null): THREE.Group
  setLook(l: RetroHandLook): void
  /** Release all cached poses and private materials; clothing textures remain shared. */
  dispose(): void
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: V3) => Math.hypot(a[0], a[1], a[2])
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const lerp3 = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]

class Geo {
  p: number[] = []; c: number[] = []; uv: number[] = []
  mirror: boolean
  constructor(mirror: boolean) { this.mirror = mirror }
  tri(a: V3, b: V3, c: V3, ca: number, cb = ca, cc = ca, ua: [number, number] = [0, 0], ub = ua, uc = ua) {
    const m = this.mirror
    const P = (v: V3) => this.p.push(m ? -v[0] : v[0], v[1], v[2])
    const pts: [V3, number, [number, number]][] = m ? [[a, ca, ua], [c, cc, uc], [b, cb, ub]] : [[a, ca, ua], [b, cb, ub], [c, cc, uc]]
    for (const [v, k, u] of pts) { P(v); this.c.push(k, k, k); this.uv.push(u[0], u[1]) }
  }
  quad(a: V3, b: V3, c: V3, d: V3, ca: number, cb = ca, cc = ca, cd = ca, uv?: [number, number][]) {
    const u = uv ?? [[0, 0], [0, 0], [0, 0], [0, 0]]
    this.tri(a, b, d, ca, cb, cd, u[0], u[1], u[3]); this.tri(b, c, d, cb, cc, cd, u[1], u[2], u[3])
  }
  build() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.computeVertexNormals() // 非索引 → 平直着色（复古低模）
    g.computeBoundingSphere()
    return g
  }
}

/** a→b 的六棱/八棱柱；截面在 side（径向）方向半宽 wa/wb、在 up 方向半宽 ha/hb；两端颜色 ca/cb。 */
function prism(G: Geo, a: V3, b: V3, upHint: V3, wa: number, ha: number, wb: number, hb: number, ca: number, cb: number, n = 6, caps: [boolean, boolean] = [true, true], uvv?: [number, number]) {
  const ax = norm(sub(b, a))
  let side = cross(ax, upHint)
  if (len(side) < 1e-5) side = cross(ax, [1, 0, 0])
  side = norm(side)
  const up = norm(cross(side, ax))
  const ring = (c: V3, w: number, h: number) => Array.from({ length: n }, (_, j) => {
    const t = (j / n) * Math.PI * 2 + Math.PI / n
    return add(c, add(mul(side, Math.cos(t) * w), mul(up, Math.sin(t) * h)))
  })
  const A = ring(a, wa, ha), B = ring(b, wb, hb)
  for (let j = 0; j < n; j++) {
    const k = (j + 1) % n
    const uv: [number, number][] | undefined = uvv ? [[j / n * 0.5, uvv[0]], [(j + 1) / n * 0.5, uvv[0]], [(j + 1) / n * 0.5, uvv[1]], [j / n * 0.5, uvv[1]]] : undefined
    G.quad(A[k], A[j], B[j], B[k], ca, ca, cb, cb, uv && [uv[1], uv[0], uv[3], uv[2]]) // 外法线朝外（side×up = -ax）
  }
  if (caps[0]) for (let j = 0; j < n; j++) G.tri(a, A[j], A[(j + 1) % n], ca * 0.95)
  if (caps[1]) for (let j = 0; j < n; j++) G.tri(b, B[(j + 1) % n], B[j], cb)
  return { A, B, side, up }
}

// 手指：[高度 y, 三节长度, 宽, 厚, 指根角度偏移]
const FINGERS: [number, [number, number, number], number, number, number][] = [
  [0.0275, [0.041, 0.026, 0.02], 0.0198, 0.0182, 0.06],
  [0.008, [0.045, 0.029, 0.022], 0.0205, 0.0188, 0.0],
  [-0.0115, [0.042, 0.027, 0.021], 0.0195, 0.0178, -0.03],
  [-0.0295, [0.034, 0.021, 0.018], 0.0172, 0.0158, -0.08],
]
const PHI0 = (35 * Math.PI) / 180 // 指根（掌指关节）在握持圆上的方位：前右
const circ = (R: number, phi: number, y: number): V3 => [R * Math.cos(phi), y, -R * Math.sin(phi)]

// ---------- 接触求解（v72）：用表面采样减少手指穿插 ----------
// 手里物品的真实三角网格 → 手坐标系 H 下的表面采样点云（≈2.5mm 间距，只取手周围 16cm 内）+ 空间哈希。
// 求解时：① 手掌/指根/大鱼际若碰到物体，整只手沿手背方向外推直到离开表面；② 四指像真手合拢一样
// 三个关节一起小步弯曲，哪一节碰到物体（或掌心）就冻结该节及其近端关节，远端继续弯，直到全部贴合或到极限；
// ③ 拇指同理，障碍物额外包括已求解的四指。离散采样不等同精确实体碰撞，极薄或复杂物品仍需视觉检查。
export class HandCollider {
  private map = new Map<number, number[]>()
  private cell = 0.006
  count = 0
  sh: V3 = [0, 0, 0] // 查询偏移：手整体外推 s 等价于在 p + s 处查询物体
  private key(ix: number, iy: number, iz: number) { return ((ix + 512) * 1024 + (iy + 512)) * 1024 + (iz + 512) }
  add(x: number, y: number, z: number) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell), Math.floor(z / this.cell))
    let a = this.map.get(k)
    if (!a) { a = []; this.map.set(k, a) }
    a.push(x, y, z); this.count++
  }
  /** p 周围 r 内是否有物体表面。 */
  near(p: V3, r: number): boolean {
    const x = p[0] + this.sh[0], y = p[1] + this.sh[1], z = p[2] + this.sh[2], c = this.cell, r2 = r * r
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c), y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c), z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c)
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) for (let k = z0; k <= z1; k++) {
      const a = this.map.get(this.key(i, j, k))
      if (!a) continue
      for (let n = 0; n < a.length; n += 3) {
        const dx = a[n] - x, dy = a[n + 1] - y, dz = a[n + 2] - z
        if (dx * dx + dy * dy + dz * dz < r2) return true
      }
    }
    return false
  }
}
/** 物品网格 → 手坐标系点云。toH：物品父节点坐标 → H；mirror：左手（H 内 X 取反）。 */
export function buildHandCollider(item: THREE.Object3D, toH: THREE.Matrix4, mirror: boolean, center: V3 = [0, 0, 0], radius = 0.16, spacing = 0.0025): HandCollider {
  const col = new HandCollider()
  item.updateWorldMatrix(true, true)
  const base = new THREE.Matrix4()
  if (item.parent) base.copy(item.parent.matrixWorld).invert()
  const m = new THREE.Matrix4(), va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3()
  const lo = [center[0] - radius, center[1] - radius, center[2] - radius], hi = [center[0] + radius, center[1] + radius, center[2] + radius]
  item.traverseVisible((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !o.visible) return
    const pos = mesh.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!pos) return
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    if (mat && (mat as THREE.MeshBasicMaterial).blending === THREE.AdditiveBlending) return // 光晕/火苗等纯视觉片不算实体
    m.multiplyMatrices(toH, base).multiply(mesh.matrixWorld)
    const idx = mesh.geometry.getIndex()
    const n = idx ? idx.count : pos.count
    for (let t = 0; t + 2 < n; t += 3) {
      const i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2
      va.fromBufferAttribute(pos, i0).applyMatrix4(m); vb.fromBufferAttribute(pos, i1).applyMatrix4(m); vc.fromBufferAttribute(pos, i2).applyMatrix4(m)
      if (mirror) { va.x = -va.x; vb.x = -vb.x; vc.x = -vc.x }
      if (Math.max(va.x, vb.x, vc.x) < lo[0] || Math.min(va.x, vb.x, vc.x) > hi[0] || Math.max(va.y, vb.y, vc.y) < lo[1] || Math.min(va.y, vb.y, vc.y) > hi[1] || Math.max(va.z, vb.z, vc.z) < lo[2] || Math.min(va.z, vb.z, vc.z) > hi[2]) continue
      const e = Math.max(va.distanceTo(vb), vb.distanceTo(vc), vc.distanceTo(va))
      const k = Math.min(28, Math.max(1, Math.ceil(e / spacing)))
      for (let i = 0; i <= k; i++) for (let j = 0; j <= k - i; j++) {
        const u = i / k, v = j / k
        col.add(va.x + (vb.x - va.x) * u + (vc.x - va.x) * v, va.y + (vb.y - va.y) * u + (vc.y - va.y) * v, va.z + (vb.z - va.z) * u + (vc.z - va.z) * v)
      }
    }
  })
  return col
}

const rotY = (v: V3, a: number): V3 => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c] }
const segDist = (p: V3, a: V3, b: V3) => {
  const ab = sub(b, a), t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / Math.max(1e-9, ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2])))
  return len(sub(p, add(a, mul(ab, t))))
}
const SKIN_GAP = 0.0012 // 指腹与物体表面之间留的间隙

function buildHandGeo(p: HandPose, mirror: boolean, sleeveKind: SleeveKind, col?: HandCollider) {
  const S = new Geo(mirror) // 皮肤
  const C = new Geo(mirror) // 袖子
  const R = Math.max(p.r + 0.0085, 0.0235) // 指根所在圆（由把手半径估计；真实贴合交给接触求解）
  const tb: V3 = [Math.sin(PHI0), 0, Math.cos(PHI0)] // 指根处切线，往手腕方向
  const n0: V3 = [Math.cos(PHI0), 0, -Math.sin(PHI0)] // 指根处外法线（手背方向）
  // ---------- 手掌轮廓（先算，用于外推与四指自碰撞） ----------
  const kIn = (y: number) => add(circ(R - 0.006, PHI0 + (y > 0 ? 0.03 : -0.06), y), mul(tb, 0.006))
  const PL = 0.078
  const wIn = (y: number) => add(add(kIn(y), mul(tb, PL)), mul(n0, 0.004))
  const out = (v: V3, k = 1) => add(v, mul(n0, 0.027 * k))
  const yT = FINGERS[0][0] + 0.011, yB = FINGERS[3][0] - 0.009
  const k1 = kIn(yT), k2 = kIn(yB)
  const w1: V3 = [...wIn(0.023)] as V3, w2: V3 = [...wIn(-0.021)] as V3
  w1[1] = 0.021; w2[1] = -0.025
  const ko1 = out(k1, 0.95), ko2 = out(k2, 0.9), wo1 = out(w1, 0.9), wo2 = out(w2, 0.85)
  const thenar = add(lerp3(w1, k1, 0.45), mul(n0, -0.004))
  const mcp = FINGERS.map(([y, , , , dphi]) => circ(R, PHI0 + dphi, y))
  // ① 外推：掌心 4×4 采样 + 指根 + 大鱼际，任何一点贴进物体就整手沿手背方向外移
  let shift = 0
  if (col) {
    const probes: [V3, number][] = []
    for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3; j++) probes.push([lerp3(lerp3(k1, k2, j / 3), lerp3(w1, w2, j / 3), i / 3), 0.003])
    mcp.forEach((m, i) => probes.push([m, FINGERS[i][3] / 2]))
    probes.push([thenar, 0.011])
    const blocked = () => probes.some(([q, r]) => col.near(q, r + SKIN_GAP))
    while (shift < 0.07 && blocked()) { shift += 0.0015; col.sh = mul(n0, shift) }
  }
  // 掌心盒（四指/拇指自碰撞用）：沿掌长 u、掌宽 Y、掌厚 n0
  const pc = mul(add(add(add(k1, k2), add(w1, w2)), add(add(ko1, ko2), add(wo1, wo2))), 1 / 8)
  const pu = norm(sub(lerp3(w1, w2, 0.5), lerp3(k1, k2, 0.5)))
  const hu = len(sub(lerp3(w1, w2, 0.5), lerp3(k1, k2, 0.5))) / 2, hv = (yT - yB) / 2, hn = 0.0135
  const inPalm = (q: V3, r: number) => {
    const d = sub(q, pc)
    const du = d[0] * pu[0] + d[1] * pu[1] + d[2] * pu[2], dn = d[0] * n0[0] + d[1] * n0[1] + d[2] * n0[2]
    return Math.abs(du) < hu + r && Math.abs(d[1] - (pc[1] - (yT + yB) / 2)) < hv + r && Math.abs(dn) < hn + r
  }
  // ---------- ② 四指：关节合拢求解 ----------
  const caps: [V3, V3, number][] = [] // 已求解的指节胶囊（拇指的障碍物）
  const segHit = (a: V3, b: V3, r: number, t0: number, palm: boolean, extra?: [V3, V3, number][]) => {
    const l = len(sub(b, a)), n = Math.max(2, Math.ceil(l / 0.003))
    for (let i = Math.ceil(t0 * n); i <= n; i++) {
      const q = lerp3(a, b, i / n)
      if (col && col.near(q, r + SKIN_GAP)) return true
      if (palm && inPalm(q, r * 0.7)) return true
      if (extra) for (const [ca, cb, cr] of extra) if (segDist(q, ca, cb) < (r + cr) * 0.72) return true // 拇指可压在食指外侧（皮肤略受压）
    }
    return false
  }
  /** 通用合拢：从 th0 出发三个关节按 dth 小步弯曲，碰撞即冻结该节及近端；返回关节点。 */
  const closeChain = (J0: V3, d0: V3, L: number[], rad: number[], thMin: number[], thMax: number[], dth: number[], palmFrom: number, extra?: [V3, V3, number][], t0First = 0.35) => {
    const fk = (th: number[]) => {
      const J: V3[] = [J0]; let d = d0
      for (let k = 0; k < L.length; k++) { d = rotY(d, th[k]); J.push(add(J[k], mul(d, L[k]))) }
      return J
    }
    const hitAt = (J: V3[]) => { for (let k = 0; k < L.length; k++) if (segHit(J[k], J[k + 1], rad[k], k === 0 ? t0First : 0.15, k >= palmFrom, extra)) return k; return -1 }
    const th = thMin.slice()
    // 起始姿势若已碰撞（近节贴着物体）：先反向张开再合拢
    for (let g = 0; g < 14 && hitAt(fk(th)) >= 0; g++) th[0] -= Math.sign(dth[0]) * 0.05
    const frozen = L.map(() => false)
    for (let it = 0; it < 90 && frozen.some((f) => !f); it++) {
      const cand = th.map((t, k) => (frozen[k] ? t : dth[k] > 0 ? Math.min(thMax[k], t + dth[k]) : Math.max(thMax[k], t + dth[k])))
      if (cand.every((c, k) => c === th[k])) break
      const h = hitAt(fk(cand))
      if (h < 0) { for (let k = 0; k < th.length; k++) th[k] = cand[k]; continue }
      for (let k = 0; k <= h; k++) frozen[k] = true
    }
    return fk(th)
  }
  FINGERS.forEach(([, L, w, th, dphi], fi) => {
    const phi = PHI0 + dphi
    const trig = p.trigger && fi === 0
    const rad = [th / 2, th * 0.46, th * 0.4]
    const J = closeChain(mcp[fi], [-Math.sin(phi), 0, -Math.cos(phi)], L, rad, [0, 0, 0], trig ? [0.12, 0.4, 0.5] : [1.55, 1.85, 1.35], [0.05, 0.06, 0.045], 1)
    for (let k = 0; k < 3; k++) caps.push([J[k], J[k + 1], rad[k]])
    const pts = [add(J[0], mul(tb, 0.012)), ...J] // 指根埋进掌内
    for (let k = 0; k < pts.length - 1; k++) {
      const seg = k
      const kk = seg === 0 ? 1 : Math.pow(0.9, seg - 1)
      const a = pts[k], b = pts[k + 1]
      const ext = mul(norm(sub(b, a)), 0.0025)
      const bb = k === pts.length - 2 ? sub(b, mul(ext, 0.4)) : add(b, ext)
      const thA = th * kk / 2, thB = th * kk * (k === pts.length - 2 ? 0.8 : 0.92) / 2
      const wA = w * kk / 2, wB = w * kk * (k === pts.length - 2 ? 0.84 : 0.94) / 2
      // 节段两端：关节处偏暗（褶）、节中偏亮；末节指尖（指甲）更亮
      prism(S, k === 0 ? a : sub(a, ext), bb, [0, 1, 0], thA, wA, thB, wB, k === 0 ? 0.9 : 0.86, k === pts.length - 2 ? 1.06 : 0.98, 6, [k === 0, true])
    }
  })
  // ---------- 手掌几何 ----------
  const back = (a: V3, b: V3) => add(lerp3(a, b, 0.5), mul(n0, 0.004)) // 手背中线隆起
  const bm1 = back(ko1, ko2), bm2 = back(wo1, wo2)
  S.quad(ko1, bm1, bm2, wo1, 0.9, 0.92, 0.9, 0.88)
  S.quad(bm1, ko2, wo2, bm2, 0.92, 0.88, 0.86, 0.9)
  S.quad(k2, k1, w1, w2, 1.0, 1.02, 1.0, 0.98) // 掌心（朝把手，亮一些）
  S.quad(k1, ko1, wo1, w1, 0.95, 0.92, 0.9, 0.94) // 虎口侧
  S.quad(ko2, k2, w2, wo2, 0.9, 0.92, 0.9, 0.88) // 小鱼际侧
  S.quad(ko1, k1, k2, ko2, 0.86) // 指根面
  // ---------- ③ 拇指：掌骨端点沿径向找到第一个不碰撞的位置，两节指骨反向合拢，障碍含四指 ----------
  const yt = FINGERS[0][0] + 0.004
  const T0 = add(lerp3(w1, k1, 0.3), [0, -0.004, 0])
  const pt = -0.55
  let T1 = circ(R + 0.012, pt, yt - 0.004)
  for (let rho = R + 0.006; rho < R + 0.06; rho += 0.002) {
    const q = circ(rho, pt, yt - 0.004)
    if (!(col?.near(q, 0.0105 + SKIN_GAP)) && !caps.some(([a, b, r]) => segDist(q, a, b) < (r + 0.0105) * 0.72)) { T1 = q; break }
  }
  const dT: V3 = norm([Math.sin(pt), 0, Math.cos(pt)])
  const TJ = closeChain(T1, dT, [0.031, 0.026], [0.0095, 0.0082], [0.5, 0.2], [-1.35, -1.1], [-0.05, -0.05], 9, caps, 0.2)
  prism(S, T0, T1, [0, 1, 0], 0.012, 0.014, 0.0105, 0.0118, 0.95, 0.92)
  prism(S, sub(TJ[0], mul(norm(sub(TJ[1], TJ[0])), 0.003)), TJ[1], [0, 1, 0], 0.0098, 0.0108, 0.009, 0.01, 0.88, 0.98, 6, [false, true])
  prism(S, sub(TJ[1], mul(norm(sub(TJ[2], TJ[1])), 0.003)), TJ[2], [0, 1, 0], 0.009, 0.0096, 0.0074, 0.008, 0.88, 1.06, 6, [false, true])
  // 大鱼际肉垫：把拇指根和掌心连起来
  prism(S, add(lerp3(w1, w2, 0.35), mul(n0, 0.006)), thenar, [0, 1, 0], 0.012, 0.013, 0.01, 0.012, 0.98, 0.96)
  // ---------- 手腕 + 前臂 ----------
  const wc = add(lerp3(lerp3(w1, w2, 0.5), lerp3(wo1, wo2, 0.5), 0.5), mul(tb, -0.006))
  const fd = norm(p.fdir ?? [0.3, -0.35, 1])
  const upW: V3 = [0, 1, 0] // 腕部截面宽向沿掌宽（H.Y）
  const wr1 = add(wc, mul(fd, 0.035)), el = add(wc, mul(fd, 0.48)) // 前臂够长：各种挥舞/仰瓶姿势下断口都在画面外
  prism(S, sub(wc, mul(fd, 0.004)), wr1, upW, 0.0145, 0.025, 0.016, 0.026, 0.92, 0.9, 8, [false, false])
  prism(S, wr1, el, upW, 0.016, 0.026, 0.025, 0.031, 0.9, 0.84, 8, [false, true])
  // ---------- 袖子：翻边袖口 + 袖管（长袖盖到手腕上方；短袖/背心不出袖） ----------
  if (sleeveKind === 'long') {
    const c0 = add(wc, mul(fd, 0.05)), c1 = add(wc, mul(fd, 0.072)), e = add(wc, mul(fd, 0.52))
    // 袖口翻边：外圈略大、内口收进去（看得到袖口厚度）
    const lip = prism(C, c0, c1, upW, 0.024, 0.034, 0.025, 0.035, 0.8, 0.92, 8, [false, false], [0.02, 0.1])
    const tube = prism(C, c1, e, upW, 0.0235, 0.034, 0.03, 0.04, 0.95, 0.85, 8, [false, true], [0.1, 0.48])
    void tube
    // 袖口内侧暗面（袖口截面 → 手腕）
    const inner = prism(C, add(c0, mul(fd, 0.012)), c0, upW, 0.0165, 0.0265, 0.0215, 0.031, 0.45, 0.55, 8, [false, false])
    for (let j = 0; j < 8; j++) C.quad(lip.A[j], inner.B[j], inner.B[(j + 1) % 8], lip.A[(j + 1) % 8], 0.6, 0.5, 0.5, 0.6)
  }
  return { skin: S.build(), sleeve: C.build(), shift: mul(n0, shift) }
}

/** 一只第一人称手（右手；left = 镜像左手）。 */
export function buildRetroHand(opts: { left?: boolean } = {}): RetroHand {
  const group = new THREE.Group()
  const skinMat = new THREE.MeshLambertMaterial({ color: '#c9a58a', vertexColors: true })
  const sleeveMat = new THREE.MeshLambertMaterial({ color: '#3a3f46', vertexColors: true })
  for (const mat of [skinMat, sleeveMat]) {
    installL0EnvironmentShader(mat)
    installL1DynamicProbe(mat)
  }
  const skin = new THREE.Mesh(new THREE.BufferGeometry(), skinMat)
  const sleeve = new THREE.Mesh(new THREE.BufferGeometry(), sleeveMat)
  skin.frustumCulled = false; sleeve.frustumCulled = false // 贴相机的近距物体：避免包围球误判
  group.add(skin, sleeve)
  let pose: HandPose = { at: [0, 0, -0.03], r: 0 }
  let look: RetroHandLook = { skin: '#c9a58a', sleeve: '#3a3f46', sleeveKind: 'long', topStyle: 3 }
  let item: THREE.Object3D | null = null
  let geoKey = ''
  let disposed = false
  // 求解结果缓存（物体 × 握法 × 袖长）：快捷栏来回切换不重复采样/求解
  const cache = new Map<string, { skin: THREE.BufferGeometry; sleeve: THREE.BufferGeometry; shift: V3 }>()
  let shift: V3 = [0, 0, 0]
  const basis = (p = pose) => {
    const ax = new THREE.Vector3(...(p.ax ?? [1, 0, 0])).normalize()
    const ay = new THREE.Vector3(...(p.ay ?? [0, 1, 0]))
    ay.addScaledVector(ax, -ay.dot(ax)).normalize()
    const az = new THREE.Vector3().crossVectors(ax, ay)
    // 镜像后的左手：H.X 在几何里已取反，基底保持右手系即可
    return new THREE.Matrix4().makeBasis(ax, ay, az)
  }
  const prepare = (p: HandPose, it: THREE.Object3D | null, B: THREE.Matrix4) => {
    const key = JSON.stringify([p, look.sleeveKind, it?.uuid ?? ''])
    let g = cache.get(key)
    if (!g) {
      const M = B.clone().setPosition(...p.at)
      const col = it ? buildHandCollider(it, M.invert(), !!opts.left) : undefined
      g = buildHandGeo(p, !!opts.left, look.sleeveKind, col?.count ? col : undefined)
    }
    cache.delete(key); cache.set(key, g)
    while (cache.size > 16) {
      // Background preparation must not retire the currently displayed pose.
      const k0 = [...cache.keys()].find(k => k !== geoKey)!
      const old = cache.get(k0)!
      cache.delete(k0); old.skin.dispose(); old.sleeve.dispose()
    }
    return { key, g }
  }
  const rebuild = () => {
    if (disposed) return
    const B = basis()
    const key = JSON.stringify([pose, look.sleeveKind, item?.uuid ?? ''])
    if (key !== geoKey) {
      const { g } = prepare(pose, item, B)
      geoKey = key
      // Dispose the initial empty buffers, then keep a true bounded LRU.
      if (!geoKeyInitialized) { skin.geometry.dispose(); sleeve.geometry.dispose(); geoKeyInitialized = true }
      skin.geometry = g.skin; sleeve.geometry = g.sleeve
      shift = g.shift
    }
    group.quaternion.setFromRotationMatrix(B)
    // 外推量在 H 内求得（左手几何镜像 → X 取反），换到父节点坐标叠加到握持点
    const sv = new THREE.Vector3(opts.left ? -shift[0] : shift[0], shift[1], shift[2]).applyQuaternion(group.quaternion)
    group.position.set(pose.at[0] + sv.x, pose.at[1] + sv.y, pose.at[2] + sv.z)
    sleeve.visible = look.sleeveKind === 'long'
  }
  let geoKeyInitialized = false
  rebuild()
  const tint = (c: string, k: number) => { const col = new THREE.Color(c); col.r = Math.min(1, col.r * k); col.g = Math.min(1, col.g * k); col.b = Math.min(1, col.b * k); return col }
  let lookKey = ''
  return {
    group, skin, sleeve,
    setPose(p, it) { pose = p; item = it ?? null; rebuild() },
    preparePose(p, it) {
      const B = basis(p), { g } = prepare(p, it ?? null, B), root = new THREE.Group()
      root.add(new THREE.Mesh(g.skin, skinMat))
      if (look.sleeveKind === 'long') root.add(new THREE.Mesh(g.sleeve, sleeveMat))
      root.quaternion.setFromRotationMatrix(B)
      const sv = new THREE.Vector3(opts.left ? -g.shift[0] : g.shift[0], g.shift[1], g.shift[2]).applyQuaternion(root.quaternion)
      root.position.set(p.at[0] + sv.x, p.at[1] + sv.y, p.at[2] + sv.z)
      return root
    },
    setLook(l) {
      if (disposed) return
      const key = JSON.stringify(l)
      if (key === lookKey) return
      lookKey = key; look = l
      skinMat.color.copy(new THREE.Color(l.gloved ? '#b89a2e' : l.skin))
      // 袖子：普通上衣用身上那件衣服的袖子灰度图块（Nearest），顶点色/材质色染色（同人物模型的 ×1.45 提亮补偿）；
      // 绝缘服/保温服用纯色
      const map = l.plainSleeve ? null : retroTexture(`/textures/npc-retro/cloth/top-${Math.max(0, Math.min(7, l.topStyle))}.png`)
      if (sleeveMat.map !== map) { sleeveMat.map = map; sleeveMat.needsUpdate = true }
      sleeveMat.color.copy(map ? tint(l.sleeve, 1.45) : new THREE.Color(l.sleeve))
      rebuild()
    },
    dispose() {
      if (disposed) return
      disposed = true
      group.removeFromParent()
      for (const g of cache.values()) { g.skin.dispose(); g.sleeve.dispose() }
      cache.clear(); item = null
      skinMat.dispose(); sleeveMat.dispose()
    },
  }
}

/** 上衣款式 → 袖长（与 retroAvatar 的 TOPS 一致：0 T恤短袖，5 背心无袖，其余长袖）。 */
export function sleeveKindOf(topStyle: number): SleeveKind {
  return topStyle === 0 ? 'short' : topStyle === 5 ? 'none' : 'long'
}

// ---------- 各手持物的握法 ----------
// at = 把手中心（vm 坐标，与 buildHeldItem 的摆放一致），r = 把手半径。
const VERT = (at: V3, r: number, extra: Partial<HandPose> = {}): HandPose => ({ at, r, ...extra })
export interface HeldBox { min: V3; max: V3 }
/** 物品在 vm 坐标下的包围盒（物品根节点尚未挂到 vm 时调用）。 */
export function heldBox(item: THREE.Object3D): HeldBox {
  item.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(item, true)
  return { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] }
}
export function heldHandPose(type: string, box?: HeldBox): HandPose {
  switch (type) {
    case '': return VERT([0.004, -0.005, -0.03], 0, { fdir: [0.28, -0.4, 1] }) // 空手：握拳，指节朝前（出拳）
    case 'crowbar': return VERT([0.015, -0.01, -0.08], 0.011)
    case 'wrench': return VERT([0, -0.015, -0.06], 0.013)
    case 'timber': return VERT([0, -0.005, -0.05], 0.02)
    case 'knife': return VERT([0, -0.01, -0.065], 0.012)
    case 'axe': return VERT([0.018, -0.02, -0.085], 0.015)
    case 'glowstick': return VERT([0, 0.03, -0.11], 0.011)
    case 'lighter': return VERT([0, -0.01, -0.1], 0.015)
    case 'guncandy': return VERT([0, -0.028, -0.03], 0.02, { trigger: true, ay: [0, 1, 0.12] })
    case 'squirtgun': return VERT([0, -0.125, -0.1], 0.036, { trigger: true, ay: [0, 1, 0.16] })
    default: {
      // 其余物品（瓶/罐/盒/小件）：按包围盒自适应——竖着握住物体下部三分之一，半径取横截面较小半宽，
      // 太粗的物体（>5.5cm）手贴在右后侧托住，不穿进去。
      if (!box) return VERT([0, 0.02, -0.15], 0.03)
      const cx = (box.min[0] + box.max[0]) / 2, cz = (box.min[2] + box.max[2]) / 2
      const hx = (box.max[0] - box.min[0]) / 2, hz = (box.max[2] - box.min[2]) / 2
      const h = box.max[1] - box.min[1]
      const r = Math.max(0.012, Math.min(0.055, Math.min(hx, hz) * 0.92))
      const y = box.min[1] + Math.min(0.06, h * 0.3)
      // 粗过 5.5cm 的：握持圆贴着物体右后侧表面（手在物体外侧托住，不穿进去）
      const ra = Math.min(hx, hz) * 0.92, sh = Math.max(0, ra - r)
      return VERT([cx + sh * 0.8, y, cz + sh * 0.6], r, { fdir: [0.3, -0.3, 1] })
    }
  }
}
/** 副手：手电（筒身沿 -Z）与打火机（竖持）。 */
// v72：从下方握住手电：手背朝左下、四指从右侧包上来、拇指搭在左上，前臂往左后下方回到画面外
export const FLASH_HAND_POSE: HandPose = { at: [0, 0, -0.04], r: 0.034, ax: [0.3, 0.95, 0], ay: [0, 0, -1], fdir: [0.53, -0.8, 0.2] }
export const LIGHTER_HAND_POSE: HandPose = { at: [0, -0.035, 0], r: 0.017, fdir: [0.25, -0.4, 1] }
