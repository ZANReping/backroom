// [kazoo] L8 乐器洞游戏内摆放：把 stoneInstrumentsMesh 的石乐器按 world/infiniteL8.l8InstrumentLayout 放进真实洞穴曲面。
// - 结构 'stoneinstruments'（洞心）：岩壁上的小提琴/吉他/长号、马桶与一圈邦戈鼓（两架倒了）、断口钟乳石
// - 结构 'stonechime'：石风铃，从洞顶垂一根石链下来，铃盘挂在离地 data.hang 处；data.ring=1 时渲染层摆动石管
// 返回的组以结构中心为原点（structures.ts 最后把组放到 (cx, 0, cz)），y 用真实洞底/洞顶高度。
// [tiny 收尾] 改为按洞穴体积场的真实表面贴合（seatInstrumentCave）：岩壁乐器沿射线找岩面、对齐法线、嵌入 3cm；落地物件压进洞底 1.5cm。
import * as THREE from 'three'
import type { Structure } from '../core/types'
import { caveCeilingAt, caveVolumeFieldAt, floorHeight, type GameMap } from '../world/mapgen'
import { l8InstrumentLayout } from '../world/infiniteL8'
import { stoneInstrumentGeometry, buildStoneWindchime } from './stoneInstrumentsMesh'

/** 洞穴表面采样（坐标系由调用方定：游戏内用地图局部坐标，验收用世界坐标）。field 正数=空气、负数=岩体 */
export interface CaveSurface { field: (x: number, y: number, z: number) => number; ground: (x: number, z: number) => number; roof: (x: number, z: number) => number }
export type InstrumentKind = Parameters<typeof stoneInstrumentGeometry>[0]
export interface InstrumentSeat { kind: InstrumentKind; matrix: THREE.Matrix4; on: 'wall' | 'floor' | 'roof'; ok: boolean }
export interface InstrumentCaveSeats { seats: InstrumentSeat[]; column: { x: number; z: number; y0: number; y1: number } | null }
/** 岩壁乐器嵌进岩面的目标深度（最深的顶点在岩面下 3cm；长件中段离墙 > 8cm 时改嵌 6cm）；落地物件压进洞底 1.5cm */
export const SEAT_EMBED = { wall: 0.03, wallDeep: 0.06, floor: 0.015 } as const
/** 岩壁乐器的「背面」：局部 z 最靠后的 20% 厚度（贴墙的那一面） */
export const BACK_ZONE = 0.2

/** 拟合用的顶点子集（每件约 200 个；验收脚本用全部顶点复核） */
const fitVerts = new Map<InstrumentKind, THREE.Vector3[]>()
function sampleVerts(kind: InstrumentKind): THREE.Vector3[] {
  const hit = fitVerts.get(kind); if (hit) return hit
  const p = stoneInstrumentGeometry(kind).attributes.position as THREE.BufferAttribute
  const step = Math.max(1, Math.floor(p.count / 200)), out: THREE.Vector3[] = []
  for (let i = 0; i < p.count; i += step) out.push(new THREE.Vector3().fromBufferAttribute(p, i))
  fitVerts.set(kind, out); return out
}
const minField = (S: CaveSurface, verts: THREE.Vector3[], m: THREE.Matrix4) => {
  let mn = Infinity; const v = new THREE.Vector3()
  for (const q of verts) { v.copy(q).applyMatrix4(m); mn = Math.min(mn, S.field(v.x, v.y, v.z)) }
  return mn
}
/** 沿 dir 平移 base，找到「最深的顶点恰好在岩面下 embed」的位移（最小场值随位移单调） */
function slide(S: CaveSurface, verts: THREE.Vector3[], base: THREE.Matrix4, dir: THREE.Vector3, lo: number, hi: number, embed: number): { m: THREE.Matrix4; ok: boolean } {
  const at = (d: number) => new THREE.Matrix4().makeTranslation(dir.x * d, dir.y * d, dir.z * d).multiply(base)
  const f = (d: number) => minField(S, verts, at(d)) + embed
  let a = lo, b = hi
  const fa = f(a), fb = f(b)
  if (fa > 0 || fb < 0) return { m: at(fa > 0 ? lo : hi), ok: false }
  for (let i = 0; i < 14; i++) { const c = (a + b) / 2; if (f(c) < 0) a = c; else b = c }
  return { m: at(b), ok: true }
}
/** 从洞心 (cx, y, cz) 沿方向角 a、仰角 el 打射线，找第一处岩面（场值过零）；返回命中点与岩面法线（指向洞内） */
function wallHit(S: CaveSurface, cx: number, cz: number, y: number, a: number, el = 0, rMax = 6.5): { p: THREE.Vector3; n: THREE.Vector3; r: number } | null {
  const ce = Math.cos(el), dx = Math.cos(a) * ce, dz = Math.sin(a) * ce, dy = Math.sin(el)
  const F = (r: number) => S.field(cx + dx * r, y + dy * r, cz + dz * r)
  let prev = 0.8
  if (F(prev) <= 0) return null
  for (let r = 0.85; r <= rMax; r += 0.05) {
    if (F(r) > 0) { prev = r; continue }
    let lo = prev, hi = r
    for (let i = 0; i < 14; i++) { const c = (lo + hi) / 2; if (F(c) > 0) lo = c; else hi = c }
    const p = new THREE.Vector3(cx + dx * lo, y + dy * lo, cz + dz * lo), e = 0.04
    const n = new THREE.Vector3(
      S.field(p.x + e, p.y, p.z) - S.field(p.x - e, p.y, p.z),
      S.field(p.x, p.y + e, p.z) - S.field(p.x, p.y - e, p.z),
      S.field(p.x, p.y, p.z + e) - S.field(p.x, p.y, p.z - e)).normalize()
    if (!Number.isFinite(n.x)) n.set(-dx, 0, -dz)
    return { p, n, r: lo }
  }
  return null
}
/** 沿 n 从 p 出发找岩面（双向，最多 ±0.8m）：返回岩面点或 null */
function surfaceAlong(S: CaveSurface, p: THREE.Vector3, n: THREE.Vector3): THREE.Vector3 | null {
  const F = (t: number) => S.field(p.x + n.x * t, p.y + n.y * t, p.z + n.z * t)
  const f0 = F(0), dir = f0 > 0 ? -1 : 1
  let prev = 0
  for (let t = 0.04; t <= 0.8; t += 0.04) {
    const f = F(t * dir)
    if ((f > 0) === (f0 > 0)) { prev = t; continue }
    let lo = prev, hi = t
    for (let i = 0; i < 10; i++) { const c = (lo + hi) / 2; if ((F(c * dir) > 0) === (f0 > 0)) lo = c; else hi = c }
    const k = ((lo + hi) / 2) * dir
    return new THREE.Vector3(p.x + n.x * k, p.y + n.y * k, p.z + n.z * k)
  }
  return null
}
/**
 * 用乐器整个轮廓范围内的岩面拟合一个平面：沿乐器的长轴两端、宽度两侧各取一点，顺着法线找到岩面，用两条对角线的叉积当新法线。
 * 单点梯度只反映命中点附近，长达 1.3m 的吉他会一端贴墙、一端翘出去；用整片轮廓的平均朝向就能整件平贴。
 */
function refineNormal(S: CaveSurface, p: THREE.Vector3, n0: THREE.Vector3, roll: number, halfY: number, halfX: number): THREE.Vector3 {
  let n = n0.clone()
  for (let it = 0; it < 3; it++) {
    const q = wallBasis(n, roll)
    const ay = new THREE.Vector3(0, 1, 0).applyQuaternion(q), ax = new THREE.Vector3(1, 0, 0).applyQuaternion(q)
    const pts = [ay.clone().multiplyScalar(halfY), ay.clone().multiplyScalar(-halfY), ax.clone().multiplyScalar(halfX), ax.clone().multiplyScalar(-halfX)]
      .map((d) => surfaceAlong(S, p.clone().add(d), n))
    if (pts.some((q) => !q)) break
    const [t, b, r, l] = pts as THREE.Vector3[]
    const nn = new THREE.Vector3().crossVectors(r.clone().sub(l), t.clone().sub(b)).normalize()
    if (nn.dot(n) < 0) nn.negate()
    if (!Number.isFinite(nn.x) || nn.dot(n0) < 0.5) break
    n = nn
  }
  return n
}
/** 局部 +Z（乐器正面）对齐岩面法线、绕法线转 roll；局部 +Y 尽量朝上 */
function wallBasis(n: THREE.Vector3, roll: number): THREE.Quaternion {
  const z = n.clone().normalize(), up = Math.abs(z.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const x = new THREE.Vector3().crossVectors(up, z).normalize(), yv = new THREE.Vector3().crossVectors(z, x)
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, yv, z))
  return q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll))
}
/** 让局部 +Z（乐器正面）朝向洞心：方向角 a 是洞心→摆放点 */
const faceCenter = (a: number) => Math.atan2(-Math.cos(a), -Math.sin(a))
const BONGOS: [number, number, number, number][] = [[-0.75, 0.3, 0.3, 0], [-0.6, -0.3, 1.4, 0], [0.1, -0.85, 2.6, 0], [0.75, -0.35, 3.5, 0], [0.65, 0.45, 4.4, 1.35], [-0.05, 0.9, 5.3, 1.5]]

/**
 * 按洞穴场的真实表面摆放整洞石乐器（生成/渲染/验收共用）。
 * - 岩壁乐器：在洞心地面 + h 的高度沿摆放方向打射线找岩面，局部 +Z 对齐岩面法线（随岩壁倾斜），再沿法线平移到最深顶点嵌入岩面 3cm。
 *   该高度上射线没碰到岩面（极少见）就在 ±0.25/0.5m 处重试。
 * - 马桶与邦戈鼓（含倒地的两架）：先按姿态旋转，再竖直平移到最低的顶点压进洞底 1.5cm。
 * - 断口钟乳石的补柱：柱顶取柱截面一圈洞顶的最高点再 +8cm，保证整圈都插进洞顶。
 */
export function* seatInstrumentCaveJob(c: { x: number; y: number; rot: number }, S: CaveSurface): Generator<void, InstrumentCaveSeats, unknown> {
  const L = l8InstrumentLayout(c), seats: InstrumentSeat[] = []
  const g0 = S.ground(c.x, c.y)
  for (const w of L.wall) {
    yield;
    // 候选：设计高度 ±0.6m、仰角 0/±0.2/-0.4 的射线命中点；岩面越接近竖直（法线越水平）、离设计高度越近越好。
    // 洞厅外缘的洞底会顺着洞穴场的圆角往上翘，水平射线有时只擦到这道「洞肩」，或者从洞厅缝隙穿进隔壁洞穴——候选里自然会排掉。
    const cands: { p: THREE.Vector3; n: THREE.Vector3; score: number }[] = []
    // 射线瞄准乐器自身的中心高度（原点在乐器底端，竖放时中心在 h + 半高）
    const bb = (stoneInstrumentGeometry(w.kind).boundingBox ?? (stoneInstrumentGeometry(w.kind).computeBoundingBox(), stoneInstrumentGeometry(w.kind).boundingBox!))
    const mid = bb.getCenter(new THREE.Vector3()).setZ(0).multiplyScalar(w.s), size = bb.getSize(new THREE.Vector3())
    const midH = w.h + mid.y * Math.cos(w.roll)
    for (const dh of [0, 0.2, -0.2, 0.4, -0.4, -0.6]) for (const el of [0, -0.2, 0.2, -0.4]) {
      yield;
      const h = wallHit(S, c.x, c.y, g0 + midH + dh, w.a, el)
      if (h) cands.push({ p: h.p, n: h.n, score: Math.abs(h.n.y) * 1.2 + Math.abs(dh) * 0.5 + Math.abs(el) * 0.3 + Math.max(0, h.r - 5.2) * 0.4 })
    }
    cands.sort((a, b) => a.score - b.score)
    const verts = sampleVerts(w.kind)
    let seat: InstrumentSeat | null = null, best = Infinity
    // 背面（局部 z 最靠后的 20%）离岩面的中位距离：大 = 一端碰墙、其余翘在空中。候选里取「间隙 + 0.3×评分」最小的，间隙 < 5cm 立即采用
    const zCut = bb.min.z + size.z * BACK_ZONE, backVerts = verts.filter((v) => v.z <= zCut)
    for (const h of cands.slice(0, 6)) {
      yield;
      const n = refineNormal(S, h.p, h.n, w.roll, size.y * w.s * 0.45, size.x * w.s * 0.45)
      const q = wallBasis(n, w.roll)
      const base = new THREE.Matrix4().compose(h.p.clone().sub(mid.clone().applyQuaternion(q)), q, new THREE.Vector3(w.s, w.s, w.s))
      const backGap = (m: THREE.Matrix4) => { const v = new THREE.Vector3(), fs = backVerts.map((b) => { v.copy(b).applyMatrix4(m); return S.field(v.x, v.y, v.z) }).sort((a, b) => a - b); return fs[Math.floor(fs.length / 2)] ?? 0 }
      let r = slide(S, verts, base, n, -0.6, 1.4, SEAT_EMBED.wall)
      if (!r.ok) continue
      let gap = backGap(r.m)
      // 长件横贴在内凹的洞壁上，两端碰墙、中段离墙：再往里嵌一点（最深 6cm），让中段也贴上
      if (gap > 0.08) { const r2 = slide(S, verts, base, n, -0.6, 1.4, SEAT_EMBED.wallDeep); const g2 = r2.ok ? backGap(r2.m) : Infinity; if (g2 < gap) { r = r2; gap = g2 } }
      const cost = gap + h.score * 0.3
      if (cost < best) { best = cost; seat = { kind: w.kind, matrix: r.m, on: 'wall', ok: true } }
      if (gap < 0.05) break
    }
    if (!seat) { // 退回旧摆法（洞厅半径），标记未贴合（验收会报出来）
      const m = new THREE.Matrix4().compose(new THREE.Vector3(w.x, S.ground(w.x, w.y) + w.h, w.y), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, faceCenter(w.a), w.roll, 'YXZ')), new THREE.Vector3(w.s, w.s, w.s))
      seat = { kind: w.kind, matrix: m, on: 'wall', ok: false }
    }
    seats.push(seat)
  }
  const floorSeat = (kind: InstrumentKind, x: number, z: number, q: THREE.Quaternion) => {
    const base = new THREE.Matrix4().compose(new THREE.Vector3(x, S.ground(x, z), z), q, new THREE.Vector3(1, 1, 1))
    const r = slide(S, sampleVerts(kind), base, new THREE.Vector3(0, 1, 0), -0.4, 0.5, SEAT_EMBED.floor)
    seats.push({ kind, matrix: r.m, on: 'floor', ok: r.ok })
  }
  const t = L.toilet, ty = faceCenter(t.a)
  floorSeat('toilet', t.x, t.y, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ty, 0, 'YXZ')))
  for (const [ox, oz, ry, tip] of BONGOS) {
    yield;
    const x = t.x + Math.cos(ty) * ox + Math.sin(ty) * oz, z = t.y - Math.sin(ty) * ox + Math.cos(ty) * oz
    floorSeat('bongo', x, z, new THREE.Quaternion().setFromEuler(new THREE.Euler(tip, ry, 0, 'YXZ')))
  }
  // 断口钟乳石：原点在洞顶向下长；洞顶高于 2.75m 时补一段石柱，把断口压到伸手可及的 2.0m
  const k = L.spike, kg = S.ground(k.x, k.y), roof = S.roof(k.x, k.y)
  const tip = Math.min(roof, kg + 2.75)
  seats.push({ kind: 'kazoospike', matrix: new THREE.Matrix4().makeTranslation(k.x, tip, k.y), on: 'roof', ok: true })
  let column: InstrumentCaveSeats['column'] = null
  if (roof - tip > 0.05) {
    let top = roof
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; top = Math.max(top, S.roof(k.x + Math.cos(a) * 0.2, k.y + Math.sin(a) * 0.2)) }
    column = { x: k.x, z: k.y, y0: tip - 0.06, y1: top + 0.08 }
  }
  return { seats, column }
}

/** Synchronous entry for tools; live scene builds use the cooperative job. */
export function seatInstrumentCave(c: { x: number; y: number; rot: number }, S: CaveSurface): InstrumentCaveSeats {
  const job = seatInstrumentCaveJob(c, S)
  for (;;) { const next = job.next(); if (next.done) return next.value }
}

/** 游戏内：洞穴表面取地图的体积场（世界坐标，换算回本端地图窗口坐标采样，结果不随窗口滚动而变） */
export const mapCaveSurface = (m: GameMap): CaveSurface => {
  const ox = m.inf?.ox ?? 0, oy = m.inf?.oy ?? 0
  return {
    field: (x, y, z) => caveVolumeFieldAt(m, x - ox, y, z - oy),
    ground: (x, z) => floorHeight(m, x - ox, z - oy, 0),
    roof: (x, z) => caveCeilingAt(m, x - ox, z - oy),
  }
}
/** 同一层同一个乐器洞只拟合一次（chunk 重建/窗口滚动时复用；约 0.2–0.3s 的射线与二分） */
const seatCache = new Map<string, InstrumentCaveSeats>()

export function* prepareInstrumentCave(s: Structure, m: GameMap): Generator<void, void, unknown> {
  if (s.kind !== 'stoneinstruments') return
  const wc = { x: s.x + s.w / 2 + (m.inf?.ox ?? 0), y: s.y + s.h / 2 + (m.inf?.oy ?? 0), rot: Number(s.data?.rot ?? 0) }
  const key = caveKey(m, wc)
  if (seatCache.has(key)) return
  for (const kind of ['violin','guitar','trombone','toilet','bongo','kazoospike'] as const) { stoneInstrumentGeometry(kind); yield }
  const fit = yield* seatInstrumentCaveJob(wc, mapCaveSurface(m))
  if (seatCache.size >= 8) seatCache.clear()
  seatCache.set(key, fit)
}
const caveKey = (m: GameMap, wc: { x: number; y: number; rot: number }) => [m.inf?.seed ?? 0, wc.x.toFixed(3), wc.y.toFixed(3), wc.rot.toFixed(4)].join(':')

export function buildInstrumentCave(s: Structure, m: GameMap, drip: THREE.Material): THREE.Group {
  const grp = new THREE.Group(); grp.name = 'instrumentCave'
  const cx = s.x + s.w / 2, cz = s.y + s.h / 2, ox = m.inf?.ox ?? 0, oy = m.inf?.oy ?? 0
  const wc = { x: cx + ox, y: cz + oy, rot: Number(s.data?.rot ?? 0) }
  const key = caveKey(m, wc)
  let fit = seatCache.get(key)
  if (!fit) { fit = seatInstrumentCave(wc, mapCaveSurface(m)); if (seatCache.size > 8) seatCache.clear(); seatCache.set(key, fit) }
  const { seats, column } = fit
  const toGroup = new THREE.Matrix4().makeTranslation(-wc.x, 0, -wc.y)
  for (const st of seats) {
    const mesh = new THREE.Mesh(stoneInstrumentGeometry(st.kind).clone(), drip)
    new THREE.Matrix4().multiplyMatrices(toGroup, st.matrix).decompose(mesh.position, mesh.quaternion, mesh.scale)
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = 'instr:' + st.kind
    grp.add(mesh)
  }
  if (column) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, column.y1 - column.y0, 9), drip)
    col.position.set(column.x - wc.x, (column.y0 + column.y1) / 2, column.z - wc.y); grp.add(col)
  }
  grp.position.y = -floorHeight(m, cx, cz, s.floor ?? 0) // Parent applies the structure ground height once.
  grp.userData.seats = seats.map((q) => ({ kind: q.kind, on: q.on, ok: q.ok }))
  return grp
}

/** 石风铃挂点：铃盘离地 hang（不高于洞顶下 0.12m），石链顶端插进洞顶 5cm */
export function chimeHang(S: CaveSurface, x: number, z: number, hang: number): { hangY: number; chainTop: number; ground: number } {
  const g = S.ground(x, z), roof = S.roof(x, z)
  return { hangY: Math.min(roof - 0.12, g + hang), chainTop: roof + 0.05, ground: g }
}
export function buildStoneChimeStructure(s: Structure, m: GameMap, drip: THREE.Material): THREE.Group {
  const grp = new THREE.Group(); grp.name = 'stoneChime'
  const cx = s.x + s.w / 2, cz = s.y + s.h / 2
  const { hangY, chainTop } = chimeHang(mapCaveSurface(m), cx + (m.inf?.ox ?? 0), cz + (m.inf?.oy ?? 0), Number(s.data?.hang ?? 2.05))
  const chime = buildStoneWindchime(drip)
  chime.position.set(0, hangY, 0); grp.add(chime)
  if (chainTop - hangY > 0.1) {
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, chainTop - hangY, 5), drip)
    chain.position.set(0, (chainTop + hangY) / 2, 0); grp.add(chain)
  }
  grp.position.y = -floorHeight(m, cx, cz, s.floor ?? 0)
  grp.userData.rods = chime.userData.rods
  return grp
}

/** 每帧：铃声未息时石管来回撞击摆动，安静后慢慢停稳 */
export function swingStoneChime(g: THREE.Object3D, ringing: boolean, time: number, dt: number) {
  const rods = g.userData.rods as THREE.Object3D[] | undefined
  if (!rods) return
  const amp = (g.userData.chimeAmp = THREE.MathUtils.lerp(Number(g.userData.chimeAmp ?? 0), ringing ? 0.32 : 0, Math.min(1, dt * (ringing ? 4 : 0.8))))
  rods.forEach((r, i) => {
    r.rotation.x = Math.sin(time * (5.2 + i * 0.7) + i * 1.3) * amp
    r.rotation.z = Math.cos(time * (4.6 + i * 0.9) + i * 2.1) * amp * 0.8
  })
}
