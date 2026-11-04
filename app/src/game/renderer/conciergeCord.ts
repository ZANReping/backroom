// [concierge stage 2.1] 台式电话的螺旋电话线：底座插口 → 话筒尾端。
// · 线径 4.5 mm、螺旋外径 1.2 cm，自然长度（线圈并紧）L0 = 0.42 m，圈数固定；
// · 中心线 = 二次贝塞尔（下垂量二分求解使弧长 = max(L0, 弦长×1.03)），两端都低（在台面上）时下垂改成水平侧摆 → 线自然盘在台上；
// · 避让：中心线采样点推出躯干 / 头 / 上臂 / 前臂胶囊，并不低于台面；再做几轮拉普拉斯平滑（端点固定）；
// · 线长守恒：沿中心线弧长 S 铺 N 圈，螺距 = S / N，螺旋半径按单圈线长不变反算 → 拉直时螺旋变稀、变细；
// · 每帧原地重写一张固定拓扑的 BufferGeometry（≈ 530 环 × 5 边）。全部在模型空间（face 组局部）。
import * as THREE from 'three'
import type { V3 } from './conciergeRig'

export interface CordDesk { /** 底座插口（模型空间） */ socket: V3; /** 底座中心（台面上） */ base?: V3; /** 台面高度 */ top: number; /** 台面矩形 [xmin, xmax, zmin, zmax] */ rect: [number, number, number, number] }
export interface CordCapsule { a: THREE.Vector3; b: THREE.Vector3; r: number }

export const CORD = { wireR: 0.00225, outerR: 0.006, L0: 0.42, segPerTurn: 6, sides: 5, samples: 40 }
const COIL_R0 = CORD.outerR - CORD.wireR // 螺旋中心半径（并紧时）
const PITCH0 = CORD.wireR * 2.1 // 并紧时螺距
const TURNS = Math.round(CORD.L0 / PITCH0)
const WIRE_PER_TURN = Math.hypot(2 * Math.PI * COIL_R0, PITCH0)
const RINGS = TURNS * CORD.segPerTurn + 1

const MAT = new THREE.MeshStandardMaterial({ color: '#1b1a1a', roughness: 0.42 })

export interface CordState { mesh: THREE.Mesh; pos: Float32Array; nrm: Float32Array; lastS: number; lastR: number }
export function createCord(): CordState {
  const S = CORD.sides
  const pos = new Float32Array(RINGS * S * 3), nrm = new Float32Array(RINGS * S * 3)
  const idx: number[] = []
  for (let i = 0; i < RINGS - 1; i++) for (let j = 0; j < S; j++) {
    const a = i * S + j, b = i * S + ((j + 1) % S), c = a + S, d = b + S
    idx.push(a, c, b, b, c, d)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage))
  g.setIndex(idx)
  const mesh = new THREE.Mesh(g, MAT); mesh.name = 'phoneCord'; mesh.castShadow = true; mesh.frustumCulled = false; mesh.visible = false
  return { mesh, pos, nrm, lastS: 0, lastR: 0 }
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3()
function quadPoint(A: THREE.Vector3, C: THREE.Vector3, B: THREE.Vector3, t: number, out: THREE.Vector3) {
  const u = 1 - t; return out.set(0, 0, 0).addScaledVector(A, u * u).addScaledVector(C, 2 * u * t).addScaledVector(B, t * t)
}
function quadLen(A: THREE.Vector3, C: THREE.Vector3, B: THREE.Vector3, n = 24) {
  let L = 0; const p = A.clone(), q = new THREE.Vector3()
  for (let i = 1; i <= n; i++) { quadPoint(A, C, B, i / n, q); L += q.distanceTo(p); p.copy(q) }
  return L
}
function pushOutCapsule(p: THREE.Vector3, c: CordCapsule) {
  const ab = _v.copy(c.b).sub(c.a), t = Math.max(0, Math.min(1, _w.copy(p).sub(c.a).dot(ab) / Math.max(1e-9, ab.lengthSq())))
  const q = c.a.clone().addScaledVector(ab, t), d = p.clone().sub(q), L = d.length()
  if (L < c.r) { if (L < 1e-6) d.set(0, 0, 1); else d.divideScalar(L); p.copy(q).addScaledVector(d, c.r) }
}

/** 重建电话线：A = 底座插口，B = 话筒尾端（模型空间）；caps = 身体胶囊；desk = 台面 */
export function updateCord(st: CordState, A: THREE.Vector3, B: THREE.Vector3, caps: CordCapsule[], desk: CordDesk | null) {
  const chord = A.distanceTo(B)
  const Lp = Math.max(CORD.L0, chord * 1.03)
  // 下垂方向：一般向下；两端都在台面附近时改成水平、朝远离身体（+z）一侧盘开
  const low = desk ? Math.max(0, 1 - (Math.max(A.y, B.y) - desk.top) / 0.12) : 0
  const ab = B.clone().sub(A), side = new THREE.Vector3(-ab.z, 0, ab.x); if (side.lengthSq() < 1e-8) side.set(0, 0, 1); side.normalize(); if (side.z < 0) side.negate()
  if (desk?.base && low > 0) { // 盘在台上：朝远离底座的方向摆开
    const away = A.clone().add(B).multiplyScalar(0.5).sub(new THREE.Vector3(...desk.base)); away.y = 0
    if (away.lengthSq() > 1e-6) { away.normalize(); if (away.dot(side) < 0) side.negate(); side.lerp(away, 0.5).normalize() }
  }
  const sagDir = new THREE.Vector3(0, -1, 0).multiplyScalar(1 - low).addScaledVector(side, 0.25 + 1.2 * low).normalize()
  const mid = A.clone().add(B).multiplyScalar(0.5), C = new THREE.Vector3()
  let lo = 0, hi = 1.2
  for (let i = 0; i < 22; i++) { const h = (lo + hi) / 2; C.copy(mid).addScaledVector(sagDir, h); if (quadLen(A, C, B) < Lp) lo = h; else hi = h }
  C.copy(mid).addScaledVector(sagDir, lo)
  // 采样 + 避让 + 平滑
  const n = CORD.samples, P: THREE.Vector3[] = []
  for (let i = 0; i <= n; i++) P.push(quadPoint(A, C, B, i / n, new THREE.Vector3()))
  const floorY = (p: THREE.Vector3) => {
    if (!desk) return 0.004
    const [x0, x1, z0, z1] = desk.rect
    return p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1 ? desk.top + CORD.outerR : 0.004
  }
  const baseCap: CordCapsule | null = desk?.base ? { a: new THREE.Vector3(desk.base[0], desk.base[1] - 0.2, desk.base[2]), b: new THREE.Vector3(desk.base[0], desk.base[1] + 0.06, desk.base[2]), r: 0.118 } : null
  for (let it = 0; it < 6; it++) {
    for (let i = 1; i < n; i++) { for (const c of caps) pushOutCapsule(P[i], c); if (baseCap && i > 2 && i < n - 2) pushOutCapsule(P[i], baseCap); const fy = floorY(P[i]); if (P[i].y < fy) P[i].y = fy }
    if (it < 5) { const Q = P.map((p) => p.clone()); for (let i = 1; i < n; i++) P[i].copy(Q[i - 1]).add(Q[i + 1]).multiplyScalar(0.25).addScaledVector(Q[i], 0.5) }
  }
  // 弧长表
  const cum = [0]; for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]))
  const S = cum[n]
  const pitch = S / TURNS
  const r = Math.sqrt(Math.max(0, WIRE_PER_TURN * WIRE_PER_TURN - pitch * pitch)) / (2 * Math.PI)
  const coilR = Math.max(0.0004, Math.min(COIL_R0, r))
  st.lastS = S; st.lastR = coilR
  // 中心线按弧长插值 + 平行移动标架
  const at = (s: number, out: THREE.Vector3, tan: THREE.Vector3) => {
    let k = 1; while (k < n && cum[k] < s) k++
    const f = (s - cum[k - 1]) / Math.max(1e-9, cum[k] - cum[k - 1])
    out.copy(P[k - 1]).lerp(P[k], Math.max(0, Math.min(1, f))); tan.copy(P[k]).sub(P[k - 1]).normalize()
  }
  const H: THREE.Vector3[] = new Array(RINGS)
  const c = new THREE.Vector3(), T = new THREE.Vector3(), N0 = new THREE.Vector3(), Bn = new THREE.Vector3(), Tp = new THREE.Vector3()
  at(0, c, T); N0.set(0, 1, 0); if (Math.abs(N0.dot(T)) > 0.9) N0.set(1, 0, 0); N0.addScaledVector(T, -N0.dot(T)).normalize(); Tp.copy(T)
  for (let i = 0; i < RINGS; i++) {
    const s = (i / (RINGS - 1)) * S
    at(s, c, T)
    const ax = new THREE.Vector3().crossVectors(Tp, T); const sa = ax.length()
    if (sa > 1e-7) N0.applyAxisAngle(ax.divideScalar(sa), Math.asin(Math.min(1, sa)))
    N0.addScaledVector(T, -N0.dot(T)).normalize(); Bn.crossVectors(T, N0); Tp.copy(T)
    const th = (i / (RINGS - 1)) * TURNS * Math.PI * 2
    // 两端各 1.5 cm 渐收到中心线（插头 / 话筒尾直段）
    const e = Math.min(1, s / 0.015, (S - s) / 0.015)
    H[i] = c.clone().addScaledVector(N0, Math.cos(th) * coilR * e).addScaledVector(Bn, Math.sin(th) * coilR * e)
  }
  // 螺旋线的管
  const SD = CORD.sides, pos = st.pos, nrm = st.nrm, t2 = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3(), o = new THREE.Vector3()
  let ref = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < RINGS; i++) {
    t2.copy(H[Math.min(RINGS - 1, i + 1)]).sub(H[Math.max(0, i - 1)]); if (t2.lengthSq() < 1e-14) t2.set(0, 0, 1); t2.normalize()
    u.copy(ref).addScaledVector(t2, -ref.dot(t2)); if (u.lengthSq() < 1e-8) { ref = new THREE.Vector3(1, 0, 0); u.copy(ref).addScaledVector(t2, -ref.dot(t2)) }
    u.normalize(); w.crossVectors(t2, u); ref.copy(u)
    for (let j = 0; j < SD; j++) {
      const a = (j / SD) * Math.PI * 2, k = (i * SD + j) * 3
      o.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a))
      pos[k] = H[i].x + o.x * CORD.wireR; pos[k + 1] = H[i].y + o.y * CORD.wireR; pos[k + 2] = H[i].z + o.z * CORD.wireR
      nrm[k] = o.x; nrm[k + 1] = o.y; nrm[k + 2] = o.z
    }
  }
  const g = st.mesh.geometry
  ;(g.attributes.position as THREE.BufferAttribute).needsUpdate = true
  ;(g.attributes.normal as THREE.BufferAttribute).needsUpdate = true
  g.computeBoundingSphere()
}
