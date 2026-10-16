// Clump v67: one fused SDF flesh body, skinned limbs, eyes and mouth; procedural shared skin.
// One owned skeleton per instance. Classic/realistic materials follow the scene factory.
// See CLUMP-REMAKE.md for the supplied design and assets/clump-import for provenance.
import * as THREE from 'three'
import { litMaterial } from './shared'
import { rng, merge, V, gauss, sstep, canvasTex } from './houndMesh'
import type { Entity } from '../entities'
import { getBlob, dirOf } from './clumpBlob'

type V3 = THREE.Vector3
const TONES = ['#d99b55', '#c9853f', '#b97238', '#e0aa66', '#c47c48', '#d2914d', '#bd8a52']
const UP = V(0, 1, 0)
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

// ---------- 程序化皮肤贴图（全部肢团共享） ----------
let SKIN: THREE.Texture | null | undefined
function skinTexture() {
  if (SKIN !== undefined && SKIN !== null) return SKIN
  SKIN = canvasTex(256, 256, (c, R) => {
    c.fillStyle = '#efe0cb'; c.fillRect(0, 0, 256, 256)
    const tile = (f: (ox: number, oy: number) => void) => { for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) f(ox, oy) }
    for (let i = 0; i < 150; i++) { // 冷暖斑驳
      const x = R() * 256, y = R() * 256, r = 6 + R() * 26, a = 0.04 + R() * 0.07
      const col = R() < 0.5 ? `rgba(150,96,58,${a})` : `rgba(255,236,206,${a})`
      tile((ox, oy) => { c.fillStyle = col; c.beginPath(); c.arc(x + ox, y + oy, r, 0, Math.PI * 2); c.fill() })
    }
    for (let i = 0; i < 26; i++) { // 皮肤褶纹
      let x = R() * 256, y = R() * 256, a = R() * Math.PI * 2
      const pts: [number, number][] = [[x, y]]
      for (let k = 0; k < 6; k++) { a += (R() - 0.5) * 0.5; x += Math.cos(a) * 6; y += Math.sin(a) * 6; pts.push([x, y]) }
      const lw = 0.6 + R()
      tile((ox, oy) => { c.strokeStyle = 'rgba(110,62,34,0.22)'; c.lineWidth = lw; c.beginPath(); pts.forEach(([px, py], k) => k ? c.lineTo(px + ox, py + oy) : c.moveTo(px + ox, py + oy)); c.stroke() })
    }
    for (let i = 0; i < 60; i++) { // 湿亮的小块反光
      const x = R() * 256, y = R() * 256, r = 1.5 + R() * 4, rot = R() * 3
      tile((ox, oy) => { c.fillStyle = 'rgba(255,248,230,0.16)'; c.beginPath(); c.ellipse(x + ox, y + oy, r, r * 0.5, rot, 0, Math.PI * 2); c.fill() })
    }
    for (let i = 0; i < 30; i++) { // 污渍
      const x = R() * 256, y = R() * 256, r = 2 + R() * 6
      tile((ox, oy) => { c.fillStyle = 'rgba(80,44,24,0.1)'; c.beginPath(); c.arc(x + ox, y + oy, r, 0, Math.PI * 2); c.fill() })
    }
    const img = c.getImageData(0, 0, 256, 256), d = img.data
    for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 12; d[i] += n; d[i + 1] += n; d[i + 2] += n } // 毛孔噪点
    c.putImageData(img, 0, 0)
  }, true)
  if (SKIN) SKIN.userData.entityShared = true
  return SKIN
}


// ---------- 带蒙皮权重的扫掠管体 ----------
type Wt = [number, number, number, number] // boneA, boneB, wA, wB
type RF = (t: number, d: V3, T: V3) => number
function tube(pts: V3[], rf: RF, o: { radial: number; seg: number; tone: THREE.Color; shade?: (t: number, d: V3, T: V3, P: V3) => number; w: (t: number) => Wt; uRep?: number; vRep?: number; tone2?: THREE.Color; mix?: (t: number, P: V3) => number; tmap?: (u: number) => number }) {
  const { radial, seg } = o
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
  const pos: number[] = [], uv: number[] = [], col: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = []
  const T = V(0, 0, 0), n1 = V(0, 0, 0), n2 = V(0, 0, 0), d = V(0, 0, 0), P = V(0, 0, 0), Z = V(0, 0, 1), X = V(1, 0, 0)
  for (let i = 0; i <= seg; i++) {
    const t = o.tmap ? o.tmap(i / seg) : i / seg
    curve.getPointAt(t, P); curve.getTangentAt(t, T)
    n1.crossVectors(T, Math.abs(T.z) < 0.9 ? Z : X).normalize(); n2.crossVectors(n1, T).normalize()
    const w = o.w(t)
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2
      d.copy(n1).multiplyScalar(Math.cos(a)).addScaledVector(n2, Math.sin(a))
      const r = rf(t, d, T)
      pos.push(P.x + d.x * r, P.y + d.y * r, P.z + d.z * r)
      uv.push((j / radial) * (o.uRep ?? 1), t * (o.vRep ?? 1))
      const s = o.shade ? o.shade(t, d, T, P) : 1
      const m = o.tone2 && o.mix ? clamp01(o.mix(t, P)) : 0, t2 = o.tone2 ?? o.tone // 根部渐变成肉团肤色
      col.push((o.tone.r + (t2.r - o.tone.r) * m) * s, (o.tone.g + (t2.g - o.tone.g) * m) * s, (o.tone.b + (t2.b - o.tone.b) * m) * s)
      si.push(w[0], w[1], 0, 0); sw.push(w[2], w[3], 0, 0)
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1
    idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4))
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
  g.setIndex(idx); g.computeVertexNormals()
  return g
}
/** 非蒙皮小件（齿口/眼睛/武器）：顶点色几何 */
function painted(g: THREE.BufferGeometry, color: string | ((p: V3) => THREE.Color)) {
  const n = g.attributes.position.count, col: number[] = [], p = V(0, 0, 0)
  const fixed = typeof color === 'string' ? new THREE.Color(color) : null
  for (let i = 0; i < n; i++) { p.fromBufferAttribute(g.attributes.position as THREE.BufferAttribute, i); const c = fixed ?? (color as (p: V3) => THREE.Color)(p); col.push(c.r, c.g, c.b) }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  return g
}

export interface ClumpLimb {
  kind: 'walk' | 'raise' | 'weapon'
  b: THREE.Bone[]; axis: V3; o: V3; ph: number; arm: boolean
  /** 收拢缠回肉团表面时三根骨骼的局部旋转 */
  tuck: THREE.Quaternion[]
}
export interface ClumpRig {
  flip: THREE.Group; core: THREE.Bone; coreRest: V3
  /** 蠕动骨：团块表面几处肉的鼓胀/回缩；抽动骨：个别露在外面的肢段抽动 */
  lobes: { b: THREE.Bone; rest: V3; dir: V3; ph: number }[]
  twitch: { b: THREE.Bone; axis: V3; ph: number }[]
  limbs: ClumpLimb[]
  main: { b: THREE.Bone[]; rest: THREE.Quaternion; theta: number[]; segs: THREE.Vector2[]; S: V3; table: number[] }
  jawU: THREE.Group; jawL: THREE.Group; throat: THREE.Mesh; jawX: number
  weapons: Record<'brick' | 'stone' | 'squirt' | 'bone', THREE.Object3D>
  mat: ReturnType<typeof litMaterial>
  l3: boolean
  tris: number
}

export function buildClumpMesh(l3 = false, seed = 0): THREE.Group {
  const grp = new THREE.Group()
  grp.userData.entityType = 'clump'
  grp.userData.parts = {}
  grp.userData.l3clump = l3
  const R = rng(0xc1a3 + seed * 977 + (l3 ? 31 : 0))
  const flip = new THREE.Group(); grp.add(flip)
  const th = l3 ? 1.2 : 1 // L3 肢体更粗
  const bs = l3 ? 1.1 : 1 // L3 团块更大
  const mt = l3 ? 1.14 : 1 // L3 团块肢段更壮
  const geos: THREE.BufferGeometry[] = []
  const bones: THREE.Bone[] = [], rest: V3[] = []
  const addBone = (parent: number, pos: V3) => {
    const b = new THREE.Bone()
    b.position.copy(pos).sub(parent < 0 ? V(0, 0, 0) : rest[parent])
    ;(parent < 0 ? flip : bones[parent]).add(b)
    bones.push(b); rest.push(pos.clone())
    return bones.length - 1
  }
  const CORE = V(0, 0.38 * bs, 0)
  const core = addBone(-1, CORE)
  /** 每条肢体一种略有差异的肤色（很多人拼在一起） */
  const segTone = () => new THREE.Color(TONES[Math.floor(R() * TONES.length)]).offsetHSL((R() - 0.5) * 0.03, (R() - 0.5) * 0.12, (R() - 0.5) * 0.1)
  const jit = () => (R() - 0.5)

  // ---------- 中心团块：SDF 平滑并集网格（3 种形态按 seed 复用，缓存） ----------
  const blob = getBlob(l3, ((seed % 3) + 3) % 3, CORE)
  const env = blob.env
  const lobeB = blob.lobes.map((lb) => addBone(core, lb.p))
  const twB = blob.twitch.map((t) => addBone(core, t.pivot))
  {
    const bmap = [core, ...lobeB, ...twB]
    const g = blob.geo.clone(), sa = g.attributes.skinIndex as THREE.BufferAttribute
    for (let i = 0; i < sa.count; i++) sa.setXYZW(i, bmap[sa.getX(i)], bmap[sa.getY(i)], bmap[sa.getZ(i)], bmap[sa.getW(i)])
    geos.push(g)
  }
  const walkAz: number[] = []
  const nWalk = l3 ? 7 : 6
  const az0 = l3 ? 1.25 : 0.75, az1 = Math.PI * 2 - 0.75
  for (let i = 0; i < nWalk; i++) walkAz.push(az0 + ((i + 0.5) / nWalk) * (az1 - az0) + jit() * 0.25)
  const walkDirs = walkAz.map((a) => dirOf(a, -0.3 + R() * 0.14))
  const weaponDir = dirOf(0.72, 0.12)
  const raiseDirs = l3 ? [dirOf(2.4, 1.05), dirOf(-2.3, 1.0)] : []

  // ---------- 手 / 足 ----------
  /** 手：掌心法向 nr、手指朝 fw。ground=true 时指尖贴地，否则指尖向掌心一侧扣（扣住团块 / 握持） */
  function hand(Wp: V3, fw: V3, nr: V3, hs: number, bone: number, tn: THREE.Color, ground: boolean) {
    const side = V(0, 0, 0).crossVectors(fw, nr).normalize()
    const flatN = (r: number): RF => (_t, d) => { const k = d.dot(nr); return r / Math.sqrt((k / 0.42) ** 2 + 1 - k * k + 1e-4) }
    const pm = Wp.clone().addScaledVector(fw, 0.1 * hs)
    if (ground) pm.y -= Math.max(0, Math.min(0.035, Wp.y - 0.018))
    else pm.addScaledVector(nr, -0.012)
    geos.push(tube([Wp, Wp.clone().lerp(pm, 0.5), pm], flatN(0.036 * hs), { radial: 7, seg: 3, tone: tn, w: () => [bone, 0, 1, 0], shade: () => 0.86 }))
    const tipOf = (st: V3, dir: V3, len: number) => { const tp = st.clone().addScaledVector(dir, len); if (ground) tp.y = Math.max(0.008, st.y - 0.012); else tp.addScaledVector(nr, -0.022 * hs); return tp }
    for (let f = 0; f < 4; f++) {
      const fd = fw.clone().applyAxisAngle(nr, (f - 1.5) * 0.24)
      const st = pm.clone().addScaledVector(side, (f - 1.5) * 0.019 * hs).addScaledVector(fw, -0.01)
      const len = (0.078 - Math.abs(f - 1.5) * 0.009) * hs
      geos.push(tube([st, st.clone().addScaledVector(fd, len * 0.55).addScaledVector(nr, 0.006), tipOf(st, fd, len)],
        (t) => 0.0125 * hs * (1 - 0.3 * t) * Math.sqrt(Math.max(0.05, Math.min(1, (1 - t) / 0.15))), { radial: 5, seg: 2, tone: tn, w: () => [bone, 0, 1, 0], shade: (t) => 0.82 + 0.1 * Math.cos(t * 8) }))
    }
    const ts = Wp.clone().addScaledVector(fw, 0.03 * hs).addScaledVector(side, -0.03 * hs)
    const td = fw.clone().addScaledVector(side, -0.8).normalize()
    geos.push(tube([ts, ts.clone().addScaledVector(td, 0.035 * hs), tipOf(ts, td, 0.07 * hs)],
      (t) => 0.013 * hs * (1 - 0.25 * t) * Math.sqrt(Math.max(0.05, Math.min(1, (1 - t) / 0.2))), { radial: 5, seg: 2, tone: tn, w: () => [bone, 0, 1, 0], shade: () => 0.84 }))
  }
  const foot = (Wp: V3, o: V3, fs: number, bone: number, tn: THREE.Color) => {
    const toe = Wp.clone().addScaledVector(o, 0.2 * fs).setY(0.025)
    const flat = (r: number): RF => (_t, d) => r / Math.sqrt((d.y / 0.42) ** 2 + 1 - d.y * d.y + 1e-4)
    geos.push(tube([Wp.clone().addScaledVector(o, -0.03), Wp.clone().addScaledVector(o, 0.07 * fs).setY(Math.max(0.035, Wp.y * 0.55)), toe],
      flat(0.042 * fs), { radial: 7, seg: 4, tone: tn, w: () => [bone, 0, 1, 0], shade: (t, d) => (0.8 + 0.12 * t) * (d.y < -0.5 ? 0.8 : 1) }))
  }
  /** 露在团块表面的脚掌：脚背贴着肉，脚趾翘起 */
  function massFoot(Wp: V3, fw: V3, nr: V3, fs: number, bone: number, tn: THREE.Color) {
    const flat = (r: number): RF => (_t, d) => { const k = d.dot(nr); return r / Math.sqrt((k / 0.45) ** 2 + 1 - k * k + 1e-4) }
    const heel = Wp.clone().addScaledVector(nr, -0.01 * fs).addScaledVector(fw, -0.03)
    geos.push(tube([heel, Wp.clone().addScaledVector(fw, 0.09 * fs).addScaledVector(nr, 0.02 * fs), Wp.clone().addScaledVector(fw, 0.2 * fs).addScaledVector(nr, 0.005 * fs)],
      (t) => flat(0.044 * fs)(t, V(0, 0, 0), V(1, 0, 0)) * (1 + 0.1 * t) * (0.5 + 0.5 * sstep(1, 0.8, t)), { radial: 6, seg: 4, tone: tn, w: () => [bone, 0, 1, 0], shade: (t) => 0.82 + 0.1 * t }))
  }
  // 团块里露出的手掌/脚掌：长在带手的前臂（抽动骨）末端，贴着团块
  for (const hd of blob.hands) {
    const tn = hd.tone.clone().multiplyScalar(0.95)
    if (hd.foot) massFoot(hd.W, hd.fw, hd.n, 1.05 * mt, twB[hd.tw], tn)
    else hand(hd.W, hd.fw, hd.n, 1.12 * mt, twB[hd.tw], tn, false)
  }

  /** 表面点 + 法向偏移（平滑包络，收拢姿态、主臂绕行用） */
  const surf = (d: V3, off = 0) => env.pt(d).addScaledVector(env.nrm(d), off)

  // ---------- 收拢姿态：沿团块表面爬一段的贴表面骨骼旋转 ----------
  const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4()
  const tuckFor = (R0: V3, E: V3, W: V3, dR: V3, u0: V3, lift: number, rf: V3, rn: V3) => {
    const u = u0.clone().addScaledVector(dR, -u0.dot(dR)).normalize()
    const P = (phi: number) => surf(dR.clone().multiplyScalar(Math.cos(phi)).addScaledVector(u, Math.sin(phi)).normalize(), lift)
    const march = (from: V3, phi0: number, len: number) => {
      let a = phi0, prev = from.distanceTo(P(a))
      for (let i = 0; i < 200 && a < 2.8; i++) {
        const nx = a + 0.02, dd = from.distanceTo(P(nx))
        if (dd >= len) { a += 0.02 * clamp01((len - prev) / Math.max(1e-5, dd - prev)); return a }
        a = nx; prev = dd
      }
      return a
    }
    const l1 = R0.distanceTo(E), l2 = E.distanceTo(W)
    const p1 = march(R0, 0, l1), Et = P(p1), p2 = march(Et, p1, l2), Wt = P(p2)
    const q0 = new THREE.Quaternion().setFromUnitVectors(E.clone().sub(R0).normalize(), Et.clone().sub(R0).normalize())
    const Ea = R0.clone().add(E.clone().sub(R0).applyQuaternion(q0))
    const qd = new THREE.Quaternion().setFromUnitVectors(W.clone().sub(E).applyQuaternion(q0).normalize(), Wt.clone().sub(Ea).normalize())
    const q01 = qd.clone().multiply(q0)
    const q1 = q0.clone().invert().multiply(qd).multiply(q0)
    const dW = dR.clone().multiplyScalar(Math.cos(p2)).addScaledVector(u, Math.sin(p2)).normalize()
    const n = env.nrm(dW), fw = P(p2 + 0.08).sub(P(p2)); fw.addScaledVector(n, -fw.dot(n)).normalize()
    _m1.makeBasis(rf, rn, V(0, 0, 0).crossVectors(rf, rn)); _m2.makeBasis(fw, n, V(0, 0, 0).crossVectors(fw, n))
    const qt = new THREE.Quaternion().setFromRotationMatrix(_m2.multiply(_m1.transpose()))
    const q2 = q01.clone().invert().multiply(qt)
    return [q0, q1, q2]
  }

  // ---------- 从团块里伸出的肢体（撑地 / 持械 / 上探）：根部埋进团块，出肉处颜色渐变成团块肤色 ----------
  const limbs: ClumpLimb[] = []
  const limbGeo: THREE.BufferGeometry[] = []
  /** 三骨肢体（根 → 肘/膝 → 腕/踝）+ 手或足。dR 根部方向；R0 埋在团块深处；E 关节；W 腕 */
  const limb = (kind: ClumpLimb['kind'], arm: boolean, dR: V3, E: V3, W: V3, o: V3, ph: number, big: number, hf: V3, hn: V3, ground: boolean, tuckU: V3) => {
    const R0 = env.pt(dR, 0.62)
    const b0 = addBone(core, R0), b1 = addBone(b0, E), b2 = addBone(b1, W)
    const l1 = R0.distanceTo(E), l2 = E.distanceTo(W), tE = l1 / (l1 + l2)
    const r0 = (arm ? 0.062 : 0.08) * th * big, rj = (arm ? 0.046 : 0.058) * th * big, rw = (arm ? 0.034 : 0.04) * th * big
    const tn = segTone(), skin = blob.toneAt(env.pt(dR, 1))
    const start = geos.length
    geos.push(tube([R0, R0.clone().lerp(E, 0.5).add(V(0, 0.012, 0)), E, E.clone().lerp(W, 0.5), W], (t) => {
      if (t < tE) { const s = t / tE; return (r0 + (rj - r0) * s) * (1 + 0.16 * gauss(s, 0.45, 0.2)) + 0.006 * gauss(t, tE, 0.03) }
      const s = (t - tE) / (1 - tE); return (rj + (rw - rj) * s) * (1 + 0.2 * gauss(s, 0.28, 0.18)) + 0.006 * gauss(t, tE, 0.03)
    }, {
      radial: 9, seg: 10, tone: tn, vRep: 1.4, tone2: skin, mix: (_t, P) => sstep(0.1, -0.02, blob.field(P)),
      w: (t) => { const w2 = sstep(0.93, 1, t); if (w2 > 0) return [b1, b2, 1 - w2, w2]; const w1 = sstep(tE - 0.07, tE + 0.07, t); return [b0, b1, 1 - w1, w1] },
      shade: (t, d, _T, P) => Math.max(0.4, (0.5 + 0.5 * sstep(-0.02, 0.09, blob.field(P))) * (0.92 + 0.08 * d.y) * (1 - 0.1 * gauss(t, tE, 0.03))),
    }))
    if (arm) hand(W, hf, hn, big * th, b2, tn, ground)
    else foot(W, o, big * th, b2, tn)
    for (let i = start; i < geos.length; i++) limbGeo.push(geos[i])
    const tuck = tuckFor(R0, E, W, dR, tuckU, 0.07 * th * big, arm ? hf : o, arm ? hn : UP)
    const L: ClumpLimb = { kind, b: [bones[b0], bones[b1], bones[b2]], axis: V(0, 0, 0).crossVectors(o, UP).normalize(), o: o.clone(), ph, arm, tuck }
    limbs.push(L)
    return L
  }
  // 向外甩、掌心撑地的肢体：环绕团块下缘（正前方给齿口让位），伸出不远——轮廓保持一团
  walkDirs.forEach((dR, i) => {
    const o = V(dR.x, 0, dR.z).normalize(), tg = V(-o.z, 0, o.x)
    const arm = i % 3 !== 1
    const R0 = env.pt(dR, 0.62)
    const edge = Math.hypot(env.pt(dR).x, env.pt(dR).z) - 0.1
    const reach = edge + (arm ? 0.5 : 0.42) * (l3 ? 1.08 : 1) + R() * 0.08
    const H = o.clone().multiplyScalar(reach).addScaledVector(tg, jit() * 0.18)
    const W = arm ? H.clone().addScaledVector(o, -0.17).setY(0.05) : H.clone().addScaledVector(o, -0.21).setY(0.085)
    const E = R0.clone().lerp(W, 0.55).addScaledVector(o, 0.1).add(V(0, arm ? 0.15 + R() * 0.06 : 0.17 + R() * 0.05, 0))
    // 收拢方向：向上偏一侧爬，左右交替，避免全挤到顶上
    const tu = UP.clone().addScaledVector(tg, (i % 2 ? 1 : -1) * (0.55 + R() * 0.3))
    limb('walk', arm, dR, E, W, o, l3 ? i / nWalk : R(), arm ? 1 : 1.05, o, UP, true, tu)
  })
  // L3 持械臂：独立的一条，从右前上方伸出、手悬在半空，不参与撑地
  if (l3) {
    const o = V(weaponDir.x, 0, weaponDir.z).normalize()
    const E = env.pt(weaponDir, 1).addScaledVector(o, 0.2).add(V(0, -0.07, 0))
    const W = E.clone().addScaledVector(o, 0.1).add(V(0.2, 0.04, 0))
    const hf = W.clone().sub(E).setY(0).normalize()
    limb('weapon', true, weaponDir, E, W, o, 0.3, 1.05, hf, UP, false, UP.clone().addScaledVector(V(-o.z, 0, o.x), 0.6))
    // 向上探出的两条手臂：平时收拢缠在团块顶上，引体向上时伸向天花板
    raiseDirs.forEach((dR, i) => {
      const o = V(dR.x, 0, dR.z).normalize()
      const S0 = env.pt(dR, 1)
      const E = S0.clone().addScaledVector(o, 0.16).add(V(0, 0.2, 0)), W = S0.clone().addScaledVector(o, 0.34).add(V(0, 0.3, 0))
      const hf = W.clone().sub(E).normalize(), hn = UP.clone().addScaledVector(hf, -hf.y).normalize()
      limb('raise', true, dR, E, W, o, R(), 0.95, hf, hn, false, V(-o.z, 0, o.x).multiplyScalar(i ? 1 : -1).addScaledVector(o, 0.4))
    })
  }

  // ---------- 主臂：7 节超长手臂，平时水平半压进团块上半圈（约 250°），抓取时整条甩直 ----------
  const nMB = 7, dAz = 0.82, mainAz0 = -0.42, mr = 0.066 * th
  const yC = CORE.y + 0.06 * bs // 绕团块最宽的一圈（腰部），伸直后够长
  const coilPt = (az: number) => { // 包络在 y=yC 处的水平截面上、方位 az 的点（半压进团块的肉里）
    let lo = -0.6, hi = 1.3
    for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (env.pt(dirOf(az, m)).y < yC) lo = m; else hi = m }
    const d = dirOf(az, (lo + hi) / 2), p = env.pt(d, 0.95), n = env.nrm(d)
    const h = V(n.x, 0, n.z).normalize()
    return p.setY(yC).addScaledVector(h, mr * 0.1)
  }
  const J: V3[] = []
  for (let k = 0; k < nMB; k++) J.push(coilPt(mainAz0 - k * dAz))
  const TIP = coilPt(mainAz0 - (nMB - 1) * dAz - 0.3)
  const S = J[0]
  // 主臂平面：局部 XY → 世界水平面（静止旋转），甩出时转为竖直平面内瞄准
  const QR = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.PI / 2), QRi = QR.clone().invert()
  const mbs: number[] = []
  {
    const b0 = new THREE.Bone(); b0.position.copy(S).sub(CORE); b0.quaternion.copy(QR); bones[core].add(b0); bones.push(b0); mbs.push(bones.length - 1)
    for (let k = 1; k < nMB; k++) {
      const b = new THREE.Bone(); b.position.copy(J[k]).sub(J[k - 1]).applyQuaternion(QRi); bones[mbs[k - 1]].add(b); bones.push(b); mbs.push(bones.length - 1)
    }
  }
  {
    const tn = segTone(), skin = blob.toneAt(S)
    // 一整条管体：从团块深处沿切向长出（根部绑核心、渐变到第一节），再经过每个关节和关节间的中点贴着团块绕行
    const mid0 = coilPt(mainAz0 - 0.5 * dAz), tan0 = mid0.clone().sub(S).normalize()
    const nS = V(S.x - CORE.x, 0, S.z - CORE.z).normalize()
    const pre = S.clone().addScaledVector(tan0, -0.13).addScaledVector(nS, -0.07)
    const st = pre.clone().addScaledVector(tan0, -0.08).addScaledVector(nS, -0.12)
    const pts: V3[] = [st, pre]
    for (let k = 0; k < nMB; k++) { pts.push(J[k]); if (k < nMB - 1) pts.push(coilPt(mainAz0 - (k + 0.5) * dAz)) }
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]))
    const Lt = cum[cum.length - 1], tS = cum[2] / Lt
    const tj: number[] = []; for (let k = 1; k < nMB - 1; k++) tj.push(cum[2 + 2 * k] / Lt)
    const knob = (t: number) => tj.reduce((a, x) => a + gauss(t, x, 0.012), 0)
    geos.push(tube(pts, (t) => {
      if (t < tS) return mr * (1 + 0.45 * (1 - sstep(0, tS, t))) * (0.3 + 0.7 * sstep(0, 0.04, t))
      const u = (t - tS) / (1 - tS)
      return mr * (1 - 0.4 * u) * (1 + 0.1 * Math.sin(u * 40)) * (1 - 0.25 * sstep(0.97, 1, t)) + 0.006 * knob(t)
    }, {
      radial: 7, seg: 40, tone: tn, vRep: 5, tone2: skin, mix: (t) => 1 - sstep(0, tS * 1.6, t),
      w: (t) => {
        if (t < tS) { const w = sstep(tS - 0.05, tS, t); return [core, mbs[0], 1 - w, w] }
        let k = 0; while (k < tj.length && t > tj[k]) k++
        // k：所在节；靠近关节处与相邻节混合
        const prevJ = k > 0 ? tj[k - 1] : -1, nextJ = k < tj.length ? tj[k] : 2
        if (t > nextJ - 0.02) { const w = sstep(nextJ - 0.02, nextJ + 0.02, t); return [mbs[k], mbs[k + 1], 1 - w, w] }
        if (t < prevJ + 0.02 && k > 0) { const w = sstep(prevJ - 0.02, prevJ + 0.02, t); return [mbs[k - 1], mbs[k], 1 - w, w] }
        return [mbs[k], 0, 1, 0]
      },
      shade: (t, d, _T, P) => Math.max(0.42, (0.84 + 0.16 * d.y) * (1 - 0.12 * knob(t)) * (0.55 + 0.45 * sstep(-0.01, 0.07, blob.field(P)))),
    }))
    // 主臂的大手：扣在团块侧面
    const WR = J[nMB - 1], dW = dirOf(mainAz0 - (nMB - 1) * dAz, 0.4), n = env.nrm(dW)
    const fw = TIP.clone().sub(WR); fw.addScaledVector(n, -fw.dot(n)).normalize()
    hand(WR, fw, n, 1.3 * th, mbs[nMB - 1], tn, false)
  }
  const chain = [...J, TIP]
  const segs = chain.slice(1).map((p, k) => { const v = p.clone().sub(chain[k]).applyQuaternion(QRi); return new THREE.Vector2(v.x, v.y) })
  const theta = segs.slice(1).map((s, i) => Math.atan2(segs[i].x * s.y - segs[i].y * s.x, segs[i].dot(s)))
  const chordAt = (ext: number) => { const c = new THREE.Vector2(); let a = 0; segs.forEach((v, i) => { if (i > 0) a += -theta[i - 1] * ext; c.add(v.clone().rotateAround(new THREE.Vector2(), a)) }); return c }
  const table = Array.from({ length: 21 }, (_, k) => chordAt(k / 20).length())

  // ---------- 贴在团块凹缝边上的耳朵 ----------
  blob.ears.forEach((er) => {
    const n = er.n, p = er.p
    const tg = V(0, 0, 0).crossVectors(n, UP).normalize()
    geos.push(tube([p.clone().addScaledVector(tg, -0.03), p.clone().addScaledVector(n, 0.025), p.clone().addScaledVector(tg, 0.035).addScaledVector(n, 0.012)],
      (t, d) => 0.03 * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.7 / Math.sqrt((d.dot(n) / 0.3) ** 2 + 1 - d.dot(n) ** 2 + 1e-4) + 0.004,
      { radial: 7, seg: 5, tone: er.tone, w: () => [core, 0, 1, 0], shade: (t) => 0.62 + 0.3 * Math.sin(Math.PI * t) }))
  })

  // ---------- 齿口：正面两条「唇」肢段之间的缝底 ----------
  const M = blob.mouth.clone()

  // ---------- 蠕动骨：团块表面几处肉一起鼓胀/回缩，像里面的肢体在挤动 ----------
  const lobes = blob.lobes.map((lb, i) => ({ b: lobeB[i], d: lb.d, p: lb.p, ph: i * 1.7 + R() * 2 }))
  const twitchBones = twB, twitchSpecs = blob.twitch


  // ---------- 合并成一个 SkinnedMesh ----------
  const tex = skinTexture()
  // 湿亮皮肤：低粗糙度 PBR（蒙皮 + 贴图 + 顶点色的 Phong 程序在软件光栅 SwiftShader 上偶发链接失败，Standard 稳定）
  const mat = litMaterial({ color: '#ffffff', map: tex, vertexColors: true, roughness: 0.42, metalness: 0 })
  const geo = merge(geos)
  const tris = geo.attributes.position.count / 3
  const body = new THREE.SkinnedMesh(geo, mat)
  body.frustumCulled = false // 主臂可甩出 3m，静态包围球不可靠
  flip.add(body)
  flip.updateMatrixWorld(true)
  body.bind(new THREE.Skeleton(bones))

  // ---------- 齿口：正面两条肢段之间的缝里，上/下颌（牙龈 + 一圈利齿），咽喉 ----------
  const coreB = bones[core]
  const jawM = litMaterial({ vertexColors: true, roughness: 0.35, metalness: 0 })
  const jawX = M.x - 0.045 - CORE.x
  const jaw = (upper: boolean) => {
    const sgn = upper ? 1 : -1, parts: THREE.BufferGeometry[] = []
    const arc = (u: number) => V(0.045 + 0.025 * Math.cos(u * Math.PI / 2), sgn * 0.004, u * 0.15 * th) // 局部：铰链在 x=0
    const gum = new THREE.CatmullRomCurve3([-1, -0.5, 0, 0.5, 1].map(arc))
    parts.push(painted(new THREE.TubeGeometry(gum, 12, 0.017 * th, 6, false), '#7a2620'))
    const nT = l3 ? 15 : 13
    for (let i = 0; i < nT; i++) {
      const u = (i / (nT - 1)) * 2 - 1, p = arc(u * 0.92)
      const len = (0.03 + 0.036 * (1 - Math.abs(u)) + (i % 2) * 0.01) * th
      const c = new THREE.ConeGeometry(0.0065 * th, len, 5)
      if (upper) c.rotateX(Math.PI)
      c.rotateZ(sgn * 0.15).translate(p.x + 0.004, p.y - sgn * (len / 2 + 0.004), p.z)
      parts.push(painted(c, (q) => new THREE.Color('#e9dfc4').lerp(new THREE.Color('#9c7a52'), clamp01(Math.abs(q.y - p.y) < 0.008 ? 0.6 : 0))))
    }
    const g = new THREE.Group(); g.position.set(jawX, M.y - CORE.y, M.z - CORE.z)
    g.add(new THREE.Mesh(merge(parts), jawM)); coreB.add(g)
    return g
  }
  const jawU = jaw(true), jawL = jaw(false)
  const throat = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6).scale(0.035, 0.07, 0.095 * th), new THREE.MeshBasicMaterial({ color: '#170707' }))
  throat.position.copy(M).sub(CORE).add(V(-0.015, 0, 0)); coreB.add(throat)

  // ---------- 眼睛：卡在肢段缝隙里的肉垫上 / 头颅上 ----------
  {
    const eg: THREE.BufferGeometry[] = []
    blob.eyes.forEach((ey, i) => {
      const nn = ey.n, s = (0.023 + R() * 0.007) * mt
      const p = ey.p.clone().addScaledVector(nn, s * 0.25)
      eg.push(painted(new THREE.SphereGeometry(s, 7, 5).translate(p.x, p.y, p.z), '#efe8d8'))
      const ir = p.clone().addScaledVector(nn, s * 0.78)
      eg.push(painted(new THREE.SphereGeometry(s * 0.5, 5, 3).translate(ir.x, ir.y, ir.z), i % 2 ? '#3b2a1a' : '#26302a'))
    })
    const eyes = new THREE.Mesh(merge(eg), litMaterial({ vertexColors: true, roughness: 0.15, metalness: 0 }))
    eyes.position.copy(CORE).negate(); eyes.userData.face = 1; coreB.add(eyes)
  }

  // ---------- 武器（L3）：砖块 / 石器 / 滋水枪（腰果水）/ 骨刺 ----------
  const emptyWeapon = () => { const g = new THREE.Group(); g.visible = false; return g }
  const weapons: ClumpRig['weapons'] = { brick: emptyWeapon(), stone: emptyWeapon(), squirt: emptyWeapon(), bone: emptyWeapon() }
  const wl = limbs.find((L) => L.kind === 'weapon')
  if (wl) {
    const wm = litMaterial({ vertexColors: true })
    const brick = painted(new THREE.BoxGeometry(0.21, 0.065, 0.1, 3, 1, 2), (p) => new THREE.Color(p.y > 0.025 ? '#b9a48a' : '#8e4a32').offsetHSL(0, 0, (Math.sin(p.x * 90 + p.z * 50) * 0.03)))
    const handle = painted(new THREE.CylinderGeometry(0.013, 0.016, 0.34, 6).rotateZ(Math.PI / 2).translate(0.1, 0, 0), '#6a4b2c')
    const head = painted(new THREE.DodecahedronGeometry(0.06).scale(1.35, 0.8, 0.7).translate(0.27, 0.01, 0), (p) => new THREE.Color('#77716a').offsetHSL(0, 0, Math.sin(p.x * 70 + p.y * 40) * 0.05))
    const gunBody = painted(new THREE.BoxGeometry(0.2, 0.055, 0.05).translate(0.08, 0.02, 0), '#e8642c')
    const tank = painted(new THREE.CylinderGeometry(0.034, 0.034, 0.085, 8).translate(0.06, 0.09, 0), '#c9a05a') // 腰果水储罐
    const nozzle = painted(new THREE.CylinderGeometry(0.009, 0.012, 0.07, 6).rotateZ(Math.PI / 2).translate(0.21, 0.025, 0), '#ffd34a')
    const grip = painted(new THREE.BoxGeometry(0.035, 0.08, 0.04).rotateZ(-0.3).translate(0.02, -0.035, 0), '#b8442a')
    const spur = merge([0, 1].map((i) => painted(new THREE.ConeGeometry(0.018 - i * 0.004, 0.19 - i * 0.05, 6).rotateZ(-Math.PI / 2 + 0.35 * i).translate(0.06 + i * 0.03, 0.03 + i * 0.03, (i - 0.5) * 0.03),
      (p) => new THREE.Color(p.x < 0.02 + i * 0.03 ? '#7a1c18' : '#e8dcc0'))))
    weapons.brick = new THREE.Mesh(brick, wm)
    weapons.stone = new THREE.Mesh(merge([handle, head]), wm)
    weapons.squirt = new THREE.Mesh(merge([gunBody, tank, nozzle, grip]), wm)
    weapons.bone = new THREE.Mesh(spur, wm)
    for (const w of Object.values(weapons)) w.visible = false
    if (wl) {
      const handB = wl.b[2], elbow = wl.b[1]
      const fwd = V(0.2, 0, 0).add(wl.o.clone().multiplyScalar(0.1)).normalize()
      const yaw = Math.atan2(-fwd.z, fwd.x)
      for (const k of ['brick', 'stone', 'squirt'] as const) { const w = weapons[k]; w.rotation.y = yaw; w.position.copy(fwd).multiplyScalar(0.09).add(V(0, -0.005, 0)); handB.add(w) }
      weapons.bone.rotation.y = yaw; weapons.bone.position.set(0, 0.02, 0); elbow.add(weapons.bone)
    }
  }

  const rig: ClumpRig = {
    flip, core: coreB, coreRest: CORE.clone(), limbs,
    lobes: lobes.map((l) => ({ b: bones[l.b], rest: bones[l.b].position.clone(), dir: l.d.clone(), ph: l.ph })),
    twitch: twitchBones.map((b, i) => ({ b: bones[b], axis: twitchSpecs[i].axis.clone(), ph: R() * 6.28 })),
    main: { b: mbs.map((i) => bones[i]), rest: QR.clone(), theta, segs, S: S.clone(), table },
    jawU, jawL, throat, jawX, weapons, mat, l3, tris,
  }
  grp.userData.clumpRig = rig
  poseClump(rig, null, 0, 1, 3, 1)
  return grp
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion(), _ax = new THREE.Vector3()
const ZA = new THREE.Vector3(0, 0, 1), YA = new THREE.Vector3(0, 1, 0)
/** 设置干燥度 0..1：濒死/死亡时皮肤变干、发灰、失去湿亮高光 */
export function setClumpDry(r: ClumpRig, k: number) {
  r.mat.color.setRGB(1 - 0.26 * k, 1 - 0.25 * k, 1 - 0.2 * k)
  if ('roughness' in r.mat) r.mat.roughness = 0.42 + 0.53 * k
}

type PoseState = Partial<import('../engine/clumpAI').ClumpState> | null | undefined
function poseClump(r: ClumpRig, s: PoseState, time: number, scale: number, headroom: number, hpK: number) {
  const speed = s?.speed ?? 0, wind = s?.wind ?? 0, arm = s?.arm ?? 0, mouth = s?.mouth ?? 0, sit = s?.sit ?? 0
  const ceil = s?.ceil ?? 0, tangle = s?.tangle ?? 0, harm = s?.harm ?? 0, lunge = s?.lunge ?? 0, shot = s?.shot ?? 0
  const pulling = s?.phase === 'pullup', devour = s?.phase === 'devour', pounce = s?.phase === 'pounce'
  const g = s?.gait ?? time * 0.3
  const moveAmp = Math.min(1.15, speed / 3.2)
  setClumpDry(r, sstep(0.45, 0.08, hpK))
  // 贴顶：整体绕前向轴翻转并抬到天花板下
  const cK = sstep(0, 1, ceil)
  const head = Math.max(1.2, headroom) / scale
  r.flip.rotation.x = Math.PI * cK
  r.flip.position.y = head * cK
  // 肉团：起伏、翻滚、前倾；呼吸/蓄力/静坐时压扁外摊
  const pull = pulling ? 0.22 + 0.2 * Math.sin((s?.pull ?? 0) * 2.6) : 0
  r.core.position.copy(r.coreRest)
  r.core.position.y += -0.06 * sit - 0.08 * wind + moveAmp * 0.045 * Math.abs(Math.sin(g * 2.4)) + pull + 0.02 * Math.sin(time * 1.1) * (1 - moveAmp)
  r.core.rotation.set(
    moveAmp * 0.08 * Math.sin(g * 1.3 + 1) + tangle * 0.28 * Math.sin(time * 13) + harm * 0.1 * Math.sin(time * 17),
    tangle * 0.2 * Math.sin(time * 7),
    0.14 * wind - 0.1 * arm - 0.22 * mouth + moveAmp * 0.07 * Math.sin(g * 1.1) + (devour ? Math.sin(time * 10) * 0.05 : 0),
  )
  const breathe = 0.022 * Math.sin(time * (sit > 0.5 ? 0.9 : 1.6)) * (1 - moveAmp)
  const sq = 0.07 * wind + 0.06 * sit + (devour ? 0.04 * Math.max(0, Math.sin(time * 11)) : 0)
  r.core.scale.set(1 + sq * 0.5 - breathe * 0.4, 1 - sq + breathe, 1 + sq * 0.5 - breathe * 0.4)
  // 团块蠕动：几处肉轮流鼓胀/回缩（移动、混乱、吞食时更剧烈；静坐时慢而浅）
  const wf = 1.4 + moveAmp * 3.2 + tangle * 4 + (devour ? 3 : 0)
  const wa = 0.022 + 0.022 * moveAmp + 0.03 * tangle + (devour ? 0.02 : 0) + 0.015 * wind - 0.01 * sit + 0.02 * harm
  for (const lb of r.lobes) lb.b.position.copy(lb.rest).addScaledVector(lb.dir, wa * Math.sin(time * wf + lb.ph) - 0.025 * sit)
  // 个别露在外面的肢段（带手/脚的）不时抽动一下
  const jerkK = 1 + 1.5 * tangle + (devour ? 1 : 0) + 2 * harm + moveAmp
  for (const tw of r.twitch) {
    const j = Math.max(0, Math.sin(time * (2.3 + tw.ph * 0.3) + tw.ph)) ** 12
    tw.b.quaternion.setFromAxisAngle(tw.axis, (0.025 * Math.sin(time * 0.9 + tw.ph) + 0.09 * j) * jerkK - 0.06 * sit) // 前臂与团块融在一起：幅度小，避免拉扯肉褶
  }
  // 肢体：甩向地面的步态；收拢量 tw → 贴着肉团缠回表面
  for (const L of r.limbs) {
    let sh = 0, el = 0, tw = 0
    if (L.kind === 'walk') {
      if (moveAmp > 0.05) {
        let u = (g * 0.34 + L.ph + tangle * 0.45 * Math.sin(time * 9 + L.ph * 17)) % 1
        if (u < 0) u += 1
        const lift = u < 0.55 ? Math.sin((u / 0.55) * Math.PI) : -0.22 * Math.sin(((u - 0.55) / 0.45) * Math.PI)
        sh += lift * 0.8 * moveAmp * (1 + tangle * 0.6); el += lift * 0.5 * moveAmp
      } else { sh += 0.05 * Math.sin(time * 1.3 + L.ph * 6); el += 0.06 * Math.sin(time * 1.7 + L.ph * 5) }
      sh += -0.12 * wind + 0.35 * cK + (pounce ? 0.4 : 0) + 0.22 * mouth + (devour ? 0.08 * Math.sin(time * 6 + L.ph * 9) : 0) // 吞食：肢体收紧、抽动
      el += -0.14 * wind + 0.2 * cK + 0.3 * mouth
      // 静坐：全部缠回肉团；混乱期：一部分肢体忽然缠回去
      tw = Math.max(sit, tangle * clamp01(0.25 + 0.75 * Math.sin(time * 4.3 + L.ph * 13)))
    } else if (L.kind === 'raise') {
      sh = (pulling ? 0.75 : 0) + 0.1 * Math.sin(time * 0.8 + L.ph * 6)
      el = pulling ? -0.6 + 0.5 * Math.sin((s?.pull ?? 0) * 2.6) : 0
      tw = pulling ? 0 : 0.92 + 0.08 * Math.sin(time * 0.7 + L.ph * 5)
    } else { // weapon：独立持械臂，不撑地
      const wpn = s?.weapon ?? 'brick'
      sh = 0.12 + 0.05 * Math.sin(time * 1.4) + moveAmp * 0.12 * Math.sin(g * 1.9); el = 0.05 * Math.sin(time * 1.9)
      if (wpn === 'squirt') { sh = 0.3 - shot * 0.12; el = -0.15 + shot * 0.1 }
      else if (wpn !== 'none' && (s?.phase === 'hunt' || s?.phase === 'windup' || lunge > 0)) {
        sh = 1.0 - 1.05 * sstep(0.25, 0.85, lunge); el = 0.6 - 0.55 * lunge // 砸到底手也悬在地面上方
      }
      sh += 0.3 * cK + (pounce ? 0.3 : 0)
      if (harm > 0.02) { sh += harm * (0.6 + 0.3 * Math.sin(time * 21)); el += harm * 0.9 }
      tw = sit * 0.85
    }
    _q.setFromAxisAngle(L.axis, sh); _q2.setFromAxisAngle(L.axis, el); _q3.setFromAxisAngle(L.axis, -(sh + el) * 0.75)
    const w = sstep(0, 1, clamp01(tw))
    L.b[0].quaternion.copy(_q).slerp(L.tuck[0], w)
    L.b[1].quaternion.copy(_q2).slerp(L.tuck[1], w)
    L.b[2].quaternion.copy(_q3).slerp(L.tuck[2], w)
  }
  // 主臂：缠在肉团上 ↔ 甩直并对准猎物
  const M = r.main, nB = M.b.length
  let ext = 0, stretch = 1
  // 平时：局部平面躺平（水平缠绕），蓄力时微微勒紧、抬起
  _q4.copy(M.rest).multiply(_q.setFromAxisAngle(ZA, 0.03 * Math.sin(time * 1.4) - 0.06 * wind)).premultiply(_q2.setFromAxisAngle(ZA, 0.08 * wind))
  if (arm > 0.001) {
    const D = Math.max(0.6, (s?.armLen ?? 2) / scale)
    const tv = V(D, 1.02 / scale, 0).sub(M.S)
    const want = tv.length()
    stretch = 1 + (Math.max(1, want / M.table[20]) - 1) * arm
    let k = 20
    for (let i = 1; i <= 20; i++) if (M.table[i] >= want) { const a = M.table[i - 1], b = M.table[i]; k = i - 1 + (b > a ? (want - a) / (b - a) : 0); break }
    ext = Math.min(1, k / 20) * arm
    // 当前展开度下的弦向量（主臂平面内）
    let ang = 0
    const c = new THREE.Vector2()
    M.segs.forEach((v, i) => { if (i > 0) ang += -M.theta[i - 1] * ext; c.add(v.clone().rotateAround(new THREE.Vector2(), ang)) })
    const h = Math.hypot(tv.x, tv.z)
    let alpha = Math.atan2(tv.y, h) - Math.atan2(c.y, c.x)
    while (alpha > Math.PI * 0.5) alpha -= Math.PI * 2
    while (alpha <= -Math.PI * 1.5) alpha += Math.PI * 2 // 大角度时统一从团块上方甩过去
    _q.setFromAxisAngle(ZA, alpha)
    _q2.setFromAxisAngle(YA, Math.atan2(-tv.z, tv.x))
    // 绕弦轴翻转：未完全伸直时弯折鼓向上方，而不是扎进地面
    _q3.setFromAxisAngle(_ax.set(c.x, c.y, 0).normalize(), Math.PI * (0.5 + 0.5 * sstep(0.3, 0.7, ext)))
    const aim = _q2.multiply(_q).multiply(_q3)
    // 只需要很短的伸展（吞食时猎物已在嘴边）就别把整圈盘臂竖起来，留在肉团上
    M.b[0].quaternion.copy(_q4).slerp(aim, sstep(0, 0.45, arm) * sstep(0.75, 1.05, want / Math.max(M.table[0], 1.05)))
  } else {
    M.b[0].quaternion.copy(_q4)
  }
  // Extend the whole continuous chain in its local plane; moving individual joints opens seams in rigid skin spans.
  M.b[0].scale.set(stretch, stretch, 1)
  const twitch = (1 - arm) * 0.03
  for (let i = 1; i < nB; i++) M.b[i].quaternion.setFromAxisAngle(ZA, -M.theta[i - 1] * ext + 0.025 * wind + twitch * Math.sin(time * (1.3 + i * 0.4) + i))
  // 齿口
  const chew = devour ? Math.max(0, Math.sin(time * 11)) * 0.18 : 0
  r.jawU.rotation.z = mouth * 0.62 + chew
  r.jawL.rotation.z = -(mouth * 0.72 + chew)
  r.jawU.position.x = r.jawL.position.x = r.jawX + mouth * 0.025
  r.throat.scale.set(1, 0.12 + 0.95 * mouth, 1)
  // 武器显隐
  const wpn = s?.weapon ?? 'none'
  r.weapons.brick.visible = wpn === 'brick'
  r.weapons.stone.visible = wpn === 'stone'
  r.weapons.squirt.visible = wpn === 'squirt'
  r.weapons.bone.visible = wpn === 'bone'
}

/** 渲染器每帧调用：按 e.cl 的姿态量驱动骨骼；headroom=当前位置的天花板净空（米，贴顶时使用） */
export function animateClump(grp: THREE.Group, e: Entity, time: number, gz: number, headroom = 3) {
  const r = grp.userData.clumpRig as ClumpRig | undefined
  if (!r) return
  poseClump(r, e.cl, time + e.id * 0.7, e.def.scale ?? 1, headroom, Math.max(0, Math.min(1, e.hp / Math.max(1, e.def.hp))))
  grp.position.y = gz
}
const _limp = new THREE.Quaternion()
/** 死亡（k: 0→1）：皮肤迅速干枯发灰、齿口合拢、肉团塌下去、肢体瘫软摊开、主臂松垮地落回 */
export function animateClumpDeath(grp: THREE.Group, k: number) {
  const r = grp.userData.clumpRig as ClumpRig | undefined
  if (!r) return
  const kk = clamp01(k)
  setClumpDry(r, Math.min(1, 0.6 + k))
  r.jawU.rotation.z = 0; r.jawL.rotation.z = 0; r.throat.scale.set(1, 0.12, 1)
  r.flip.rotation.x = 0; r.flip.position.y = 0
  r.core.position.y = r.coreRest.y - 0.08 * kk
  r.core.rotation.set(0, 0, 0)
  r.core.scale.set(1 + 0.08 * kk, 1 - 0.12 * kk, 1 + 0.08 * kk)
  for (const L of r.limbs) {
    const t = L.kind === 'walk' ? kk : kk * 0.5
    L.b[0].quaternion.slerp(_limp.setFromAxisAngle(L.axis, -0.18), t)
    L.b[1].quaternion.slerp(_limp.setFromAxisAngle(L.axis, 0.22), t)
    L.b[2].quaternion.slerp(_limp.identity(), t)
  }
  for (const lb of r.lobes) lb.b.position.copy(lb.rest).addScaledVector(lb.dir, -0.03 * kk) // 肉塌陷下去
  for (const tw of r.twitch) tw.b.quaternion.slerp(_limp.setFromAxisAngle(tw.axis, -0.1), kk) // 露出的肢段垂软
  r.main.b[0].scale.lerp(_ax.set(1, 1, 1), kk)
  r.main.b[0].quaternion.slerp(r.main.rest, kk)
  for (let i = 1; i < r.main.b.length; i++) r.main.b[i].quaternion.slerp(_limp.identity(), kk)
}
