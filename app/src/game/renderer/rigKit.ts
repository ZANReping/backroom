// 程序化蒙皮建模工具（从 deathmothMesh 提炼）：扫掠管体、毛发、几何转 Part、骨架描述、预算统计。
// 邻里守望（观察者/挺进者）与残缺者共用。所有 Part 带顶点色与 4 骨骼权重，最终合并成按材质分组的一个 SkinnedMesh。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type V3 = THREE.Vector3
export type RGB = [number, number, number]
export type Wt = [number, number, number, number, number, number, number, number]
export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
export const smooth = (a: number, b: number, t: number) => { const k = clamp01((t - a) / (b - a)); return k * k * (3 - 2 * k) }
export const hex = (h: string, k = 1): RGB => { const c = new THREE.Color(h); return [c.r * k, c.g * k, c.b * k] }
export const mixc = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
export const w1 = (b: number): Wt => [b, 0, 0, 0, 1, 0, 0, 0]
export const w2 = (a: number, b: number, t: number): Wt => (t <= 0 ? w1(a) : t >= 1 ? w1(b) : [a, b, 0, 0, 1 - t, t, 0, 0])

// ============================================================================
// 几何累加器
// ============================================================================
export interface Part { pos: number[]; nor: number[]; uv: number[]; col: number[]; si: number[]; sw: number[]; idx: number[] }
export const newPart = (): Part => ({ pos: [], nor: [], uv: [], col: [], si: [], sw: [], idx: [] })
export class Acc {
  parts: Part[]
  constructor(groups: number) { this.parts = Array.from({ length: groups }, newPart) }
  add(group: number, src: Part) {
    const dst = this.parts[group], off = dst.pos.length / 3
    dst.pos.push(...src.pos); dst.nor.push(...src.nor); dst.uv.push(...src.uv); dst.col.push(...src.col); dst.si.push(...src.si); dst.sw.push(...src.sw)
    for (const k of src.idx) dst.idx.push(off + k)
  }
  build(): THREE.BufferGeometry {
    const geos: THREE.BufferGeometry[] = []
    for (const p of this.parts) {
      const g = new THREE.BufferGeometry()
      if (!p.pos.length) { // 空组也要占位，保持材质下标一致（一个退化三角形）
        p.pos.push(0, 0, 0, 0, 0, 0, 0, 0, 0); p.nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0); p.uv.push(0, 0, 0, 0, 0, 0); p.col.push(0, 0, 0, 0, 0, 0, 0, 0, 0)
        p.si.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); p.sw.push(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0); p.idx.push(0, 1, 2)
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3))
      g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3))
      g.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2))
      g.setAttribute('color', new THREE.Float32BufferAttribute(p.col, 3))
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(p.si, 4))
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(p.sw, 4))
      g.setIndex(p.idx)
      geos.push(g)
    }
    const merged = mergeGeometries(geos, true)!
    // mergeGeometries copies the attribute/index buffers; the per-group
    // geometries are temporary build products and must not be retained.
    for (const g of geos) g.dispose()
    return merged
  }
}

export interface Swept { part: Part; rings: number; cols: number; tan: V3[] }
/** 扫掠管体（平行移动标架），截面 sec(i, a) → [S 向, U 向] 偏移；a 从 -π/2（腹侧）开始一周。端点半径为 0 即闭合极点。 */
export function sweep(path: V3[], cols: number, sec: (i: number, a: number) => [number, number], o: {
  uv?: (i: number, j: number) => [number, number]; col: (i: number, j: number, p: V3) => RGB; w: (i: number, j: number, p: V3) => Wt; up?: V3
}): Swept {
  const n = path.length - 1
  const T: V3[] = [], U: V3[] = [], S: V3[] = []
  for (let i = 0; i <= n; i++) T.push(path[Math.min(n, i + 1)].clone().sub(path[Math.max(0, i - 1)]).normalize())
  const up = (o.up ?? V(0, 1, 0)).clone()
  let u = up.sub(T[0].clone().multiplyScalar(up.dot(T[0])))
  if (u.lengthSq() < 1e-8) u = V(1, 0, 0).sub(T[0].clone().multiplyScalar(T[0].x))
  u.normalize()
  for (let i = 0; i <= n; i++) {
    if (i > 0) { const ax = V(0, 0, 0).crossVectors(T[i - 1], T[i]); const s = ax.length(); if (s > 1e-6) u.applyAxisAngle(ax.normalize(), Math.atan2(s, T[i - 1].dot(T[i]))) }
    u.sub(T[i].clone().multiplyScalar(u.dot(T[i]))).normalize()
    U.push(u.clone()); S.push(V(0, 0, 0).crossVectors(u, T[i]).normalize())
  }
  const p = newPart(), radial: number[] = []
  for (let i = 0; i <= n; i++) for (let j = 0; j <= cols; j++) {
    const a = -Math.PI / 2 + (j / cols) * Math.PI * 2
    const [rs, ru] = sec(i, a)
    const q = path[i].clone().addScaledVector(S[i], rs).addScaledVector(U[i], ru)
    p.pos.push(q.x, q.y, q.z); radial.push(Math.hypot(rs, ru))
    const [uu, vv] = o.uv ? o.uv(i, j) : [j / cols, i / n]; p.uv.push(uu, vv)
    const c = o.col(i, j, q); p.col.push(c[0], c[1], c[2])
    const w = o.w(i, j, q); p.si.push(w[0], w[1], w[2], w[3]); p.sw.push(w[4], w[5], w[6], w[7])
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < cols; j++) { const a = i * (cols + 1) + j, b = a + cols + 1; p.idx.push(a, b, a + 1, b, b + 1, a + 1) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3)); g.setIndex(p.idx); g.computeVertexNormals()
  const nr = g.attributes.normal as THREE.BufferAttribute
  let dot = 0; const tmp = V(0, 0, 0)
  for (let i = 0; i <= n; i++) for (let j = 0; j <= cols; j++) {
    const k = i * (cols + 1) + j
    tmp.set(p.pos[k * 3], p.pos[k * 3 + 1], p.pos[k * 3 + 2]).sub(path[i])
    dot += tmp.x * nr.getX(k) + tmp.y * nr.getY(k) + tmp.z * nr.getZ(k)
  }
  if (dot < 0) {
    for (let k = 0; k < p.idx.length; k += 3) { const t = p.idx[k + 1]; p.idx[k + 1] = p.idx[k + 2]; p.idx[k + 2] = t }
    for (let k = 0; k < nr.count; k++) nr.setXYZ(k, -nr.getX(k), -nr.getY(k), -nr.getZ(k))
  }
  for (let i = 0; i <= n; i++) {
    const a = i * (cols + 1), b = a + cols
    let maxR = 0; for (let j = 0; j <= cols; j++) maxR = Math.max(maxR, radial[a + j])
    if (maxR < 1e-5) { const d = i === 0 ? T[0].clone().negate() : T[n].clone(); for (let j = 0; j <= cols; j++) nr.setXYZ(a + j, d.x, d.y, d.z); continue }
    tmp.set(nr.getX(a) + nr.getX(b), nr.getY(a) + nr.getY(b), nr.getZ(a) + nr.getZ(b)).normalize()
    nr.setXYZ(a, tmp.x, tmp.y, tmp.z); nr.setXYZ(b, tmp.x, tmp.y, tmp.z)
  }
  p.nor = Array.from(nr.array as Float32Array)
  return { part: p, rings: n + 1, cols, tan: T }
}

/** 沿扫掠体表面随机长毛（单三角形），复制附着点的顶点色与骨骼权重 */
export function hairs(dst: Part, sw: Swept, R: () => number, count: number, i0: number, i1: number, len: [number, number], width: number, lean: number,
  color: (base: RGB, r: number) => RGB, filter?: (a: number, i: number) => boolean, curl = 0) {
  const p = sw.part, n = V(0, 0, 0), b = V(0, 0, 0), side = V(0, 0, 0), tip = V(0, 0, 0), mid = V(0, 0, 0)
  for (let k = 0; k < count; k++) {
    const i = Math.min(sw.rings - 1, Math.max(0, Math.floor(lerp(i0, i1 + 0.999, R()))))
    const j = Math.floor(R() * sw.cols), a = -Math.PI / 2 + (j / sw.cols) * Math.PI * 2
    if (filter && !filter(a, i)) continue
    const vi = i * (sw.cols + 1) + j
    b.set(p.pos[vi * 3], p.pos[vi * 3 + 1], p.pos[vi * 3 + 2]); n.set(p.nor[vi * 3], p.nor[vi * 3 + 1], p.nor[vi * 3 + 2])
    const t = sw.tan[i]
    side.crossVectors(n, t).normalize()
    const L = lerp(len[0], len[1], R())
    tip.copy(n).addScaledVector(t, lean + (R() - 0.5) * 0.45).addScaledVector(side, (R() - 0.5) * 0.6).normalize().multiplyScalar(L).add(b)
    const base = dst.pos.length / 3, c = color([p.col[vi * 3], p.col[vi * 3 + 1], p.col[vi * 3 + 2]], R())
    const wd = width * (0.7 + R() * 0.6)
    if (curl > 0) { // 两段式（中点外弯）：幼虫刺毛略弯
      mid.copy(b).lerp(tip, 0.5).addScaledVector(n, L * curl)
      const pts = [b.clone().addScaledVector(side, -wd), b.clone().addScaledVector(side, wd), mid.clone().addScaledVector(side, wd * 0.45), mid.clone().addScaledVector(side, -wd * 0.45), tip]
      for (const q of pts) pushV(dst, q, n, [p.uv[vi * 2], p.uv[vi * 2 + 1]], c, [p.si[vi * 4], p.si[vi * 4 + 1], p.si[vi * 4 + 2], p.si[vi * 4 + 3], p.sw[vi * 4], p.sw[vi * 4 + 1], p.sw[vi * 4 + 2], p.sw[vi * 4 + 3]])
      dst.idx.push(base, base + 1, base + 2, base, base + 2, base + 3, base + 3, base + 2, base + 4)
    } else {
      for (const q of [b.clone().addScaledVector(side, -wd), b.clone().addScaledVector(side, wd), tip])
        pushV(dst, q, n, [p.uv[vi * 2], p.uv[vi * 2 + 1]], c, [p.si[vi * 4], p.si[vi * 4 + 1], p.si[vi * 4 + 2], p.si[vi * 4 + 3], p.sw[vi * 4], p.sw[vi * 4 + 1], p.sw[vi * 4 + 2], p.sw[vi * 4 + 3]])
      dst.idx.push(base, base + 1, base + 2)
    }
  }
}
export function pushV(p: Part, q: V3, n: V3, uv: [number, number], c: RGB, w: Wt) {
  p.pos.push(q.x, q.y, q.z); p.nor.push(n.x, n.y, n.z); p.uv.push(uv[0], uv[1]); p.col.push(c[0], c[1], c[2])
  p.si.push(w[0], w[1], w[2], w[3]); p.sw.push(w[4], w[5], w[6], w[7])
}
/** three 几何 → Part（单色、单骨骼） */
export function fromGeo(src: THREE.BufferGeometry, m: THREE.Matrix4, color: RGB | ((p: V3, n: V3) => RGB), w: Wt): Part {
  const g = src.clone().applyMatrix4(m)
  try {
    const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute | undefined
    const p = newPart(), q = V(0, 0, 0), n = V(0, 0, 0)
    for (let i = 0; i < pos.count; i++) {
      q.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i)
      const c = typeof color === 'function' ? color(q, n) : color
      pushV(p, q, n, uv ? [uv.getX(i), uv.getY(i)] : [0.5, 0.5], c, w)
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) p.idx.push(g.index.getX(i))
    else for (let i = 0; i < pos.count; i++) p.idx.push(i)
    return p
  } finally {
    g.dispose()
  }
}
export const ellipsoid = (c: V3, r: V3, q = new THREE.Quaternion(), ws = 12, hs = 8) => ({ geo: new THREE.SphereGeometry(1, ws, hs), m: new THREE.Matrix4().compose(c, q, r) })
/** 尖齿/爪（单三角形） */
export function spike(p: Part, base: V3, dir: V3, side: V3, len: number, wid: number, c: RGB, w: Wt) {
  const tip = base.clone().addScaledVector(dir, len), nrm = V(0, 0, 0).crossVectors(side, dir).normalize(), k = p.pos.length / 3
  for (const q of [base.clone().addScaledVector(side, -wid), base.clone().addScaledVector(side, wid), tip]) pushV(p, q, nrm, [0.5, 0.5], c, w)
  p.idx.push(k, k + 1, k + 2)
}

// ============================================================================
// 骨架描述
// ============================================================================
export class RigDesc {
  names: string[] = []; rest: V3[] = []; parent: number[] = []
  bone(name: string, p: V3, parent: number) { this.names.push(name); this.rest.push(p.clone()); this.parent.push(parent); return this.names.length - 1 }
}


/** 验收用：网格数、绘制次数（材质组计入）、三角面、骨骼数 */
export function rigBudget(grp: THREE.Object3D) {
  let meshes = 0, draws = 0, tris = 0, bones = 0
  grp.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.visible || m.userData.cpuSkin) return
    meshes++
    const g = m.geometry as THREE.BufferGeometry
    const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1
    draws += Array.isArray(m.material) ? Math.max(1, g.groups.length) : 1
    tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * inst
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) bones += (m as THREE.SkinnedMesh).skeleton.bones.length
  })
  return { meshes, draws, tris, bones }
}
/** 由骨架描述生成骨骼树并绑定 SkinnedMesh */
export function skinFrom(geo: THREE.BufferGeometry, mats: THREE.Material[], rig: RigDesc, mount: THREE.Object3D) {
  const bones: THREE.Bone[] = [], byName: Record<string, THREE.Bone> = {}
  rig.rest.forEach((p, i) => {
    const b = new THREE.Bone(); b.name = rig.names[i]; const par = rig.parent[i]
    b.position.copy(p).sub(par < 0 ? new THREE.Vector3() : rig.rest[par])
    ;(par < 0 ? mount : bones[par]).add(b); bones.push(b); byName[b.name] = b
  })
  // Every rendered instance owns its geometry. The cached template remains
  // untouched when a world entity is released.
  const mesh = new THREE.SkinnedMesh(geo.clone(), mats)
  mesh.frustumCulled = false; mesh.castShadow = true
  mount.add(mesh); mount.updateMatrixWorld(true)
  mesh.bind(new THREE.Skeleton(bones))
  return { mesh, bones, byName, rest: bones.map((b) => b.position.clone()) }
}
