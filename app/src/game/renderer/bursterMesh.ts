// 爆酸者（Entity 11）重制模型：方案 A「犬腿人形」（ZAN 2026-10-21 选定）。
// 依据中文维基 entity-11 正文（原站无图）：模糊人形、四肢爬行、后腿更长且呈犬科结构（反关节），背上生有许多胼胝，
// 狩猎/激动时胼胝爆裂喷出酸液；平时蜷成胎儿姿势；受酸过多时表皮硬化成茧。
// 造型：躯干/四肢/指趾均为沿样条扫掠的平滑管体（复用 houndMesh 的 sweep/limbSeg）；头部球体逐顶点雕刻成
// 模糊的光头人脸（深陷眼窝、塌鼻、无唇裂口）；背部胼胝区用顶点色做出发黄结痂皮肤，上面是两层 InstancedMesh：
// 硬痂底座 + 半透亮的酸液水泡（可逐个鼓胀/爆裂，阶段 2/3 用）。
// 骨架：root → body（躯干） → head/jaw、4 条肢链（肩/肘/腕，髋/膝/跗/趾），关节组旋转为 0 时即站姿。
// 茧：独立网格 buildBursterCocoon()，可设裂纹程度。
// 模型正面 +X。
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { rng, merge, V, gauss, sstep, cap, ell, sweep, limbSeg, canvasTex } from './houndMesh'
import type { RF } from './houndMesh'

// ---------- 程序化贴图（共享缓存） ----------
let TEX: { skin: THREE.Texture | null; crust: THREE.Texture | null } | null = null
function textures() {
  if (TEX) return TEX
  const tile = (f: (ox: number, oy: number) => void) => { for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) f(ox, oy) }
  // 皮肤：苍白发灰的肉色，斑驳的红紫色刺激斑、浅色旧酸灼疤、皮下青筋、毛孔噪点
  const skin = canvasTex(256, 256, (c, R) => {
    c.fillStyle = '#c9b7a6'; c.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 170; i++) {
      const x = R() * 256, y = R() * 256, r = 5 + R() * 28, a = 0.04 + R() * 0.08, k = R()
      const col = k < 0.45 ? `rgba(150,92,88,${a})` : k < 0.6 ? `rgba(222,210,194,${a * 0.6})` : `rgba(110,98,92,${a})`
      tile((ox, oy) => { c.fillStyle = col; c.beginPath(); c.arc(x + ox, y + oy, r, 0, Math.PI * 2); c.fill() })
    }
    for (let i = 0; i < 18; i++) { // 酸灼旧疤：边缘发亮的不规则浅斑
      const x = R() * 256, y = R() * 256, r = 4 + R() * 10, rot = R() * 3
      tile((ox, oy) => {
        c.fillStyle = 'rgba(226,206,178,0.14)'; c.beginPath(); c.ellipse(x + ox, y + oy, r, r * 0.6, rot, 0, Math.PI * 2); c.fill()
        c.strokeStyle = 'rgba(140,84,70,0.12)'; c.lineWidth = 1; c.stroke()
      })
    }
    for (let i = 0; i < 16; i++) {
      let x = R() * 256, y = R() * 256, a = R() * Math.PI * 2
      const pts: [number, number][] = [[x, y]]
      for (let k = 0; k < 14; k++) { a += (R() - 0.5) * 0.9; x += Math.cos(a) * 7; y += Math.sin(a) * 7; pts.push([x, y]) }
      const lw = 0.6 + R() * 1.2
      tile((ox, oy) => { c.strokeStyle = 'rgba(96,92,124,0.22)'; c.lineWidth = lw; c.beginPath(); pts.forEach(([px, py], k) => k ? c.lineTo(px + ox, py + oy) : c.moveTo(px + ox, py + oy)); c.stroke() })
    }
    const img = c.getImageData(0, 0, 256, 256), d = img.data
    for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 16; d[i] += n; d[i + 1] += n; d[i + 2] += n }
    c.putImageData(img, 0, 0)
  }, true)
  // 硬痂/茧壳：龟裂的角质板 + 凝固的酸液流痕
  const crust = canvasTex(256, 256, (c, R) => {
    c.fillStyle = '#8a7650'; c.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 90; i++) { // 板块
      const x = R() * 256, y = R() * 256, r = 8 + R() * 22, tone = R()
      const col = tone < 0.5 ? 'rgba(160,140,90,0.35)' : 'rgba(96,80,50,0.35)'
      tile((ox, oy) => { c.fillStyle = col; c.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + R() * 0.4; const rr = r * (0.7 + R() * 0.5); k ? c.lineTo(x + ox + Math.cos(a) * rr, y + oy + Math.sin(a) * rr) : c.moveTo(x + ox + Math.cos(a) * rr, y + oy + Math.sin(a) * rr) } c.closePath(); c.fill() })
    }
    for (let i = 0; i < 40; i++) { // 龟裂线
      let x = R() * 256, y = R() * 256, a = R() * Math.PI * 2
      const pts: [number, number][] = [[x, y]]
      for (let k = 0; k < 6; k++) { a += (R() - 0.5) * 1.4; x += Math.cos(a) * 9; y += Math.sin(a) * 9; pts.push([x, y]) }
      tile((ox, oy) => { c.strokeStyle = 'rgba(40,30,18,0.55)'; c.lineWidth = 1.2; c.beginPath(); pts.forEach(([px, py], k) => k ? c.lineTo(px + ox, py + oy) : c.moveTo(px + ox, py + oy)); c.stroke() })
    }
    for (let i = 0; i < 14; i++) { // 凝固的黄绿酸痕
      const x = R() * 256, y = R() * 256, l = 10 + R() * 30
      tile((ox, oy) => { c.strokeStyle = 'rgba(190,200,70,0.35)'; c.lineWidth = 2 + R() * 2; c.beginPath(); c.moveTo(x + ox, y + oy); c.lineTo(x + ox + (R() - 0.5) * 6, y + oy + l); c.stroke() })
    }
    const img = c.getImageData(0, 0, 256, 256), d = img.data
    for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n }
    c.putImageData(img, 0, 0)
  }, true)
  TEX = { skin, crust }
  return TEX
}

/** 给扫掠几何体按位置乘一层彩色色调（顶点色原为灰度 AO） */
function tint(g: THREE.BufferGeometry, f: (p: THREE.Vector3) => [number, number, number]) {
  const pa = g.attributes.position as THREE.BufferAttribute, ca = g.attributes.color as THREE.BufferAttribute, p = new THREE.Vector3()
  for (let i = 0; i < pa.count; i++) { p.fromBufferAttribute(pa, i); const [r, gg, b] = f(p); ca.setXYZ(i, ca.getX(i) * r, ca.getY(i) * gg, ca.getZ(i) * b) }
  return g
}

export interface BursterJoint { g: THREE.Group; rest: THREE.Euler }
export interface BursterLeg {
  front: boolean; side: number
  /** 前肢：肩/肘/腕；后肢：髋/膝/跗/趾 */
  j: THREE.Group[]
}
export interface BursterRig {
  root: THREE.Group; body: THREE.Group; head: THREE.Group; jaw: THREE.Group
  legs: BursterLeg[]
  /** 背部水泡：位置、外法向、基础半径；inst 为水泡与硬痂底座两个 InstancedMesh */
  blisters: { p: THREE.Vector3; n: THREE.Vector3; r: number; swell: number; burst: number }[]
  blisterMesh: THREE.InstancedMesh; crustMesh: THREE.InstancedMesh
}

// 躯干脊线（髋→肩）：后腿更长，髋部高于肩部，整体前倾
const SPINE = [V(-0.56, 0.80, 0), V(-0.34, 0.85, 0), V(-0.08, 0.84, 0), V(0.16, 0.78, 0), V(0.36, 0.71, 0), V(0.48, 0.68, 0)]
const PROF = [[0, 0.09], [0.08, 0.135], [0.2, 0.14], [0.36, 0.118], [0.52, 0.135], [0.7, 0.17], [0.84, 0.165], [0.94, 0.12], [1, 0.07]]
const baseR = (t: number) => { for (let i = 1; i < PROF.length; i++) if (t <= PROF[i][0]) { const [t0, r0] = PROF[i - 1], [t1, r1] = PROF[i]; const k = sstep(0, 1, (t - t0) / (t1 - t0)); return r0 + (r1 - r0) * k } return 0.07 }
/** 背部胼胝区强度：t 0.18–0.86，上半背，中线最强 */
const callusK = (t: number, dy: number) => sstep(0.12, 0.3, t) * (1 - sstep(0.78, 0.9, t)) * sstep(0.25, 0.75, dy)
function torsoDetail(t: number, d: THREE.Vector3) {
  const side = Math.abs(d.z), top = Math.max(0, d.y)
  const ribPhase = Math.sin((t - 0.5) * Math.PI * 14)
  const ribs = t > 0.5 && t < 0.85 && d.y < 0.3 && d.y > -0.6 ? 0.012 * ribPhase * sstep(0.3, 0.8, side) : 0
  const blades = 0.045 * gauss(t, 0.8, 0.06) * gauss(d.y, 0.55, 0.22) * sstep(0.3, 0.8, side) // 人类肩胛
  const hips = 0.03 * gauss(t, 0.12, 0.06) * gauss(d.y, 0.4, 0.25) * sstep(0.3, 0.8, side)
  const spineB = top > 0.9 ? 0.012 * Math.max(0, Math.sin(t * Math.PI * 22)) ** 2 : 0
  const ck = callusK(t, d.y)
  const lumps = ck * 0.016 * (Math.sin(t * 61 + d.z * 23) * Math.sin(t * 37 - d.z * 41) + 0.6) // 硬痂疙瘩
  const belly = d.y < -0.4 ? -0.02 * gauss(t, 0.38, 0.1) : 0
  return { ribs, blades, hips, spineB, lumps, belly, ck, ribPhase }
}
const torsoR: RF = (t, d, cs, sn) => {
  const k = torsoDetail(t, d)
  return baseR(t) * cap(t, 0.08) * ell(cs, sn, 0.82, 1.18) + k.ribs + k.blades + k.hips + k.spineB + k.lumps + k.belly
}
/** 躯干表面点：与 sweep 相同的标架；a=π 为背中线（n1 指向 -Y） */
function torsoPoint(t: number, a: number) {
  const curve = new THREE.CatmullRomCurve3(SPINE, false, 'centripetal')
  const P = curve.getPointAt(t), T = curve.getTangentAt(t)
  const n1 = new THREE.Vector3().crossVectors(T, Math.abs(T.z) < 0.9 ? V(0, 0, 1) : V(1, 0, 0)).normalize()
  const n2 = new THREE.Vector3().crossVectors(n1, T).normalize()
  const cs = Math.cos(a), sn = Math.sin(a)
  const d = n1.clone().multiplyScalar(cs).addScaledVector(n2, sn)
  return { p: P.addScaledVector(d, torsoR(t, d, cs, sn)), n: d }
}

const jointBall = (r: number) => { const g = new THREE.SphereGeometry(r, 10, 8); g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(0.86), 3)); return g }
/** 一段肢体：pivot 组位于关节处，网格从原点指向 to（局部坐标） */
function seg(parent: THREE.Object3D, at: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, mat: THREE.Material, o: { bulge?: number; bulgeAt?: number; mid?: THREE.Vector3; flat?: number } = {}) {
  const g = new THREE.Group(); g.position.copy(at); parent.add(g)
  const pts = o.mid ? [V(0, 0, 0), o.mid, to] : [V(0, 0, 0), to.clone().multiplyScalar(0.5), to]
  // 无端盖的连续管体 + 与管径一致的关节球：相邻肢段在关节处平滑衔接，不出现人偶式的细腰和凸节
  const b = o.bulge ?? 0.2, ba = o.bulgeAt ?? 0.3, fl = o.flat ?? 1
  const tube = sweep(pts.map((p) => p.clone()), (t, _d, cs, sn) => (r0 + (r1 - r0) * t) * (1 + b * gauss(t, ba, 0.18) * Math.sin(Math.PI * t)) * ell(cs, sn, 1, fl), { radial: 12, seg: 12, vRep: 1.5, shade: (t) => 0.84 + 0.14 * gauss(t, ba, 0.25) })
  g.add(new THREE.Mesh(merge([tube, jointBall(r0 * Math.min(1, fl + 0.05))]), mat))
  return g
}

function* buildBursterSource(seed = 0): Generator<void,THREE.Group> {
  const grp = new THREE.Group()
  grp.userData.entityType = 'burster'
  let complete=false
  try{yield
  const R = rng(0xb0057 + seed * 977)
  const tx = textures()
  const skin = new THREE.MeshLambertMaterial({ color: '#e2d2c2', map: tx.skin, vertexColors: true })
  const nail = new THREE.MeshLambertMaterial({ color: '#6d5a3e', vertexColors: true })
  const crustM = new THREE.MeshLambertMaterial({ color: '#c9ae86', map: tx.crust })
  const blisterM = new THREE.MeshPhongMaterial({ vertexColors: true, color: '#d6caa0', emissive: '#262808', specular: '#9a9660', shininess: 38 })
  const eyeM = new THREE.MeshPhongMaterial({ color: '#5e5a3c', emissive: '#0e0d06', specular: '#fff8d0', shininess: 120 })
  const mouthM = new THREE.MeshBasicMaterial({ color: '#1a0c0a' })
  const toothM = new THREE.MeshLambertMaterial({ color: '#b8a77e' })

  const root = new THREE.Group(); grp.add(root)
  const body = new THREE.Group(); root.add(body)

  yield
  // ---------- 躯干 ----------
  {
    const torso = sweep(SPINE, torsoR, {
      radial: 24, seg: 46, vRep: 2.5, uRep: 2,
      shade: (t, d) => {
        const k = torsoDetail(t, d)
        const groove = k.ribs !== 0 ? Math.max(0, -k.ribPhase) * 0.25 : 0
        return Math.min(1.1, 0.9 + k.blades * 3 + k.hips * 3 + k.spineB * 5 + k.lumps * 8 - groove - (d.y < -0.5 ? 0.12 : 0))
      },
    })
    // 胼胝区染成发黄的结痂色，四周一圈红肿
    const curve = new THREE.CatmullRomCurve3(SPINE, false, 'centripetal'), tmp = new THREE.Vector3()
    const tAt = (x: number) => Math.min(1, Math.max(0, (x - SPINE[0].x) / (SPINE[SPINE.length - 1].x - SPINE[0].x)))
    tint(torso, (p) => {
      const t = tAt(p.x); curve.getPointAt(t, tmp)
      const dy = (p.y - tmp.y) / Math.max(0.05, baseR(t))
      const ck = callusK(t, dy), red = Math.max(0, callusK(t, dy + 0.35) - ck)
      return [1 - ck * 0.2 + red * 0.05, 1 - ck * 0.22 - red * 0.18, 1 - ck * 0.5 - red * 0.2]
    })
    const neck = sweep([V(0.42, 0.7, 0), V(0.5, 0.69, 0), V(0.58, 0.675, 0)], (t, _d, cs, sn) => (0.075 - t * 0.018) * cap(t, 0.15) * ell(cs, sn, 1, 1.05), { radial: 12, seg: 8, shade: () => 0.88 })
    body.add(new THREE.Mesh(merge([torso, neck]), skin))
  }

  yield
  // ---------- 背部水泡与硬痂底座（InstancedMesh） ----------
  const blisters: BursterRig['blisters'] = []
  {
    const tries = 400
    for (let i = 0; i < tries && blisters.length < 34; i++) {
      const t = 0.18 + R() * 0.66, a = Math.PI + (R() - 0.5) * 1.7
      const { p, n } = torsoPoint(t, a)
      if (callusK(t, -Math.cos(a)) < 0.4) continue
      const r = (0.015 + R() * R() * 0.03) * (1 - Math.abs(a - Math.PI) * 0.45)
      if (blisters.some((b) => b.p.distanceTo(p) < (b.r + r) * 1.15)) continue
      blisters.push({ p, n, r, swell: 0, burst: 0 })
    }
  }
  // 水泡：不规则的脓疱（扰动二十面体），顶端浅黄发亮、根部充血发红
  const ico = new THREE.IcosahedronGeometry(1, 3); ico.deleteAttribute('normal'); ico.deleteAttribute('uv')
  const blisterGeo = mergeVertices(ico)
  {
    const pa = blisterGeo.attributes.position as THREE.BufferAttribute, col: number[] = [], q = new THREE.Vector3()
    for (let i = 0; i < pa.count; i++) {
      q.fromBufferAttribute(pa, i).normalize()
      const k = 1 + 0.09 * Math.sin(q.x * 7 + q.z * 3) * Math.sin(q.z * 6 - q.y * 4) + 0.05 * Math.sin(q.x * 13 + q.y * 11)
      pa.setXYZ(i, q.x * k, q.y * k, q.z * k)
      const top = sstep(-0.2, 0.9, q.y)
      col.push(0.82 + 0.18 * top, 0.62 + 0.38 * top, 0.5 + 0.32 * top)
    }
    blisterGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); blisterGeo.computeVertexNormals()
  }
  const crustGeo = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5)
  const blisterMesh = new THREE.InstancedMesh(blisterGeo, blisterM, blisters.length)
  const crustMesh = new THREE.InstancedMesh(crustGeo, crustM, blisters.length)
  body.add(crustMesh, blisterMesh)

  // ---------- 头：瘦削的骷髅状人脸 ----------
  // 颅骨偏长、太阳穴凹陷、眉弓压住深黑的眼窝；颧骨高耸、两颊塌陷；鼻子只剩一道塌梁和两条鼻孔缝；
  // 无唇，皮肉向后缩，牙龈和上下两排参差的黄牙常年外露；尖下巴是可开合的独立下颌。
  yield
  const head = new THREE.Group(); head.position.set(0.645, 0.665, 0); head.scale.set(1.15, 1.2, 1.12); body.add(head)
  const gumM = new THREE.MeshLambertMaterial({ color: '#6e2b28' })
  const sockets = [V(0.74, 0.22, 0.44).normalize(), V(0.74, 0.22, -0.44).normalize()]
  const MY = -0.042 // 口裂线（上牙龈下缘）
  const carve = (d: THREE.Vector3) => {
    let x = d.x * 0.094, y = d.y * 0.115, z = d.z * 0.072
    const front = sstep(0.25, 0.85, d.x)
    x += 0.026 * sstep(0, -1, d.x) * sstep(-0.2, 0.6, d.y) // 后脑勺外凸
    z *= 1 - 0.2 * gauss(d.y, 0.32, 0.18) * gauss(d.x, 0.25, 0.22) // 凹陷的太阳穴
    x += 0.016 * gauss(d.y, 0.4, 0.07) * gauss(d.z, 0, 0.55) * front // 眉弓
    let eye = 0
    for (const s of sockets) { const k = gauss(d.distanceTo(s), 0, 0.22); x -= 0.042 * k; eye = Math.max(eye, k) } // 深眼窝
    const brow = gauss(d.y, 0.4, 0.07) * front
    z *= 1 + 0.16 * gauss(d.y, 0.0, 0.08) * gauss(d.x, 0.5, 0.18) // 高颧骨
    const cheek = gauss(d.y, -0.2, 0.1) * gauss(Math.abs(d.z), 0.62, 0.16) * sstep(0.1, 0.6, d.x)
    x -= 0.024 * cheek; z *= 1 - 0.12 * cheek // 两颊塌陷
    x += 0.009 * gauss(d.z, 0, 0.07) * gauss(d.y, 0.1, 0.1) * front // 塌鼻梁
    let nos = 0
    for (const sz of [-0.08, 0.08]) { const k = gauss(d.z, sz, 0.035) * gauss(d.y, -0.08, 0.035) * front; x -= 0.01 * k; nos = Math.max(nos, k) } // 鼻孔缝
    z *= 1 - 0.14 * front * sstep(0.1, -0.4, d.y) // 嘴部收窄成吻状
    // 口裂线以下（前半）收进去，留给下颌
    const lowFront = sstep(-0.25, -0.45, d.y) * sstep(0.05, 0.45, d.x)
    if (lowFront > 0) { y = y + (Math.max(MY, y) - y) * lowFront; x *= 1 - 0.18 * lowFront }
    const mouthRim = gauss(d.y, -0.36, 0.07) * gauss(d.z, 0, 0.5) * front
    return { p: V(x, y, z), eye, nos, brow, cheek, mouthRim }
  }
  {
    const g = new THREE.SphereGeometry(1, 36, 26)
    const pa = g.attributes.position as THREE.BufferAttribute, col: number[] = [], d = new THREE.Vector3()
    for (let i = 0; i < pa.count; i++) {
      d.fromBufferAttribute(pa, i).normalize()
      const k = carve(d)
      pa.setXYZ(i, k.p.x, k.p.y, k.p.z)
      // 眼窝发黑、四周与口周红肿发炎；颧骨/眉弓高光，两颊阴影
      const dark = Math.min(1, k.eye * 1.45), red = Math.max(gauss(k.eye, 0.45, 0.2) * 0.6, k.mouthRim * 0.8)
      const c = Math.max(0.12, 0.9 - dark * 0.72 - k.nos * 0.6 - k.cheek * 0.2 + k.brow * 0.06)
      col.push(c * (1 + red * 0.08), c * (1 - red * 0.28), c * (1 - red * 0.3))
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals()
    head.add(new THREE.Mesh(g, skin))
    // 眼珠：浑浊发黄、缩在眼窝最深处，只反一点光
    const eyes = new THREE.Mesh(merge(sockets.map((s) => { const q = carve(s).p; q.x -= 0.006; return new THREE.SphereGeometry(0.0115, 12, 10).translate(q.x, q.y, q.z) })), eyeM)
    eyes.userData.face = 1; head.add(eyes)
    // 上牙龈 + 上排牙：沿 U 形齿弓，长短参差、略有歪斜
    const arch = (u: number, back = 0) => V(0.079 - u * u * 0.034 - back, MY, u * 0.031)
    const gum: THREE.BufferGeometry[] = [], up: THREE.BufferGeometry[] = []
    gum.push(sweep(Array.from({ length: 9 }, (_, i) => arch(i / 8 * 2.1 - 1.05).add(V(-0.003, 0.005, 0))), (t, _d, cs, sn) => 0.0055 * cap(t, 0.08) * ell(cs, sn, 1.3, 0.8), { radial: 8, seg: 24, shade: () => 1 })) // 外翻的连续牙龈
    for (let i = 0; i < 14; i++) {
      const u = (i + 0.5) / 14 * 2 - 1, p = arch(u), len = 0.015 + R() * 0.01 + 0.006 * gauss(Math.abs(u), 0.45, 0.12)
      up.push(new THREE.ConeGeometry(0.0042, len, 5).rotateX(Math.PI).rotateZ((R() - 0.5) * 0.4).translate(p.x, p.y - len / 2 + 0.002, p.z))
    }
    const gumMesh = new THREE.Mesh(merge(gum), gumM); gumMesh.userData.face = 1; head.add(gumMesh)
    const upper = new THREE.Mesh(merge(up), toothM); upper.userData.face = 1; head.add(upper)
    // 口腔：牙后的黑腔，张嘴时可见
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10).scale(0.05, 0.026, 0.03).translate(0.035, MY - 0.012, 0), mouthM); mouth.userData.face = 1; head.add(mouth)
  }
  // 下颌：从耳下铰接的尖下巴，上面一排下牙和牙龈，可下垂张开
  const jaw = new THREE.Group(); jaw.position.set(-0.03, MY + 0.004, 0); head.add(jaw)
  {
    const g = new THREE.SphereGeometry(1, 24, 16), pa = g.attributes.position as THREE.BufferAttribute, d = new THREE.Vector3(), col: number[] = []
    for (let i = 0; i < pa.count; i++) {
      d.fromBufferAttribute(pa, i)
      const u = (d.x + 1) / 2 // 0 铰接端 → 1 下巴尖
      let x = 0.055 + d.x * 0.06, y = Math.min(0, d.y) * (0.034 - 0.012 * u) + Math.max(0, d.y) * 0.004 - 0.006
      const z = d.z * (0.064 - 0.04 * u * u)
      y -= 0.01 * gauss(u, 0.85, 0.12) * sstep(0, -1, d.y) // 尖下巴往下戳
      x += 0.008 * gauss(u, 0.95, 0.1)
      pa.setXYZ(i, x, y, z)
      const c = 0.88 - 0.22 * sstep(0.3, -1, d.y) * (1 - u * 0.4) - 0.2 * gauss(u, 0.5, 0.2) * sstep(0.3, 0.9, Math.abs(d.z)) // 下颌下方与两腮阴影
      const inner = sstep(0.2, 0.6, d.y) // 下颌顶面就是口腔底：暗红
      col.push(c * (1 - inner * 0.55), c * 0.96 * (1 - inner * 0.75), c * 0.93 * (1 - inner * 0.75))
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals()
    jaw.add(new THREE.Mesh(g, skin))
    const lo: THREE.BufferGeometry[] = [], lg: THREE.BufferGeometry[] = []
    const arch = (u: number) => V(0.105 - u * u * 0.032, 0, u * 0.026)
    lg.push(sweep(Array.from({ length: 9 }, (_, i) => arch(i / 8 * 2.1 - 1.05).add(V(-0.003, -0.002, 0))), (t, _d, cs, sn) => 0.005 * cap(t, 0.08) * ell(cs, sn, 1.3, 0.8), { radial: 8, seg: 24, shade: () => 1 }))
    for (let i = 0; i < 12; i++) {
      const u = (i + 0.5) / 12 * 2 - 1, p = arch(u), len = 0.012 + R() * 0.008
      lo.push(new THREE.ConeGeometry(0.0038, len, 5).rotateZ((R() - 0.5) * 0.4).translate(p.x - 0.002, p.y + len / 2, p.z))
    }
    const lgM = new THREE.Mesh(merge(lg), gumM); lgM.userData.face = 1; jaw.add(lgM)
    const lower = new THREE.Mesh(merge(lo), toothM); lower.userData.face = 1; jaw.add(lower)
  }

  yield
  // ---------- 四肢 ----------
  const legs: BursterLeg[] = []
  for (const side of [-1, 1]) {
    yield
    const z = side
    // 前肢：人类手臂，肘部朝后，手掌撑地、长指张开
    {
      const sh = seg(body, V(0.36, 0.64, z * 0.17), V(-0.07, -0.27, z * 0.05), 0.046, 0.032, skin, { bulge: 0.25, bulgeAt: 0.3 })
      const el = seg(sh, V(-0.07, -0.27, z * 0.05), V(0.1, -0.27, z * -0.01), 0.031, 0.022, skin, { bulge: 0.22, bulgeAt: 0.2 })
      const wr = new THREE.Group(); wr.position.set(0.1, -0.27, z * -0.01); el.add(wr)
      const hand: THREE.BufferGeometry[] = []
      hand.push(limbSeg([V(-0.02, 0.012, 0), V(0.035, -0.028, 0), V(0.09, -0.04, 0)], 0.022, 0.028, 0.05, 0.5, 0.45))
      const fingers: THREE.BufferGeometry[] = []
      for (let f = 0; f < 4; f++) {
        const fz = (f - 1.5) * 0.019, L = [0.085, 0.1, 0.095, 0.075][f] * 1.15
        const a = V(0.085, -0.045, fz), b = V(0.085 + L * 0.55, -0.05, fz * 1.4), c = V(0.085 + L, -0.055, fz * 1.7)
        hand.push(limbSeg([a, b, c], 0.0105, 0.007, 0.15, 0.3))
        fingers.push(new THREE.ConeGeometry(0.0065, 0.016, 5).rotateZ(-Math.PI / 2).translate(c.x + 0.008, c.y, c.z))
      }
      hand.push(limbSeg([V(0.03, -0.03, z * 0.03), V(0.06, -0.045, z * 0.055), V(0.09, -0.05, z * 0.07)], 0.012, 0.008, 0.1, 0.3)) // 拇指朝内
      wr.add(new THREE.Mesh(merge(hand), skin), new THREE.Mesh(merge(fingers), nail))
      legs.push({ front: true, side, j: [sh, el, wr] })
    }
    // 后肢：犬科反关节——粗壮大腿前下、长胫骨后下、跗跖几乎竖直、趾行
    {
      const hip = seg(body, V(-0.46, 0.79, z * 0.13), V(0.2, -0.3, z * 0.03), 0.078, 0.046, skin, { bulge: 0.2, bulgeAt: 0.3 })
      const knee = seg(hip, V(0.2, -0.3, z * 0.03), V(-0.31, -0.27, z * -0.01), 0.046, 0.025, skin, { bulge: 0.4, bulgeAt: 0.22 })
      const hock = seg(knee, V(-0.31, -0.27, z * -0.01), V(0.05, -0.19, 0), 0.025, 0.021, skin, { bulge: 0.08, bulgeAt: 0.5 })
      const toe = new THREE.Group(); toe.position.set(0.05, -0.19, 0); hock.add(toe)
      const foot: THREE.BufferGeometry[] = [limbSeg([V(-0.02, 0.01, 0), V(0.03, -0.012, 0), V(0.06, -0.02, 0)], 0.021, 0.027, 0.05, 0.5, 0.55)]
      const claws: THREE.BufferGeometry[] = []
      for (let f = 0; f < 4; f++) {
        const fz = (f - 1.5) * 0.018, L = [0.06, 0.075, 0.072, 0.055][f]
        const a = V(0.055, -0.02, fz), c = V(0.055 + L, -0.04, fz * 1.4)
        foot.push(limbSeg([a, a.clone().lerp(c, 0.5).add(V(0, 0.008, 0)), c], 0.012, 0.008, 0.15, 0.3))
        claws.push(new THREE.ConeGeometry(0.006, 0.02, 5).rotateZ(-Math.PI / 2 - 0.4).translate(c.x + 0.01, c.y - 0.004, c.z))
      }
      toe.add(new THREE.Mesh(merge(foot), skin), new THREE.Mesh(merge(claws), nail))
      legs.push({ front: false, side, j: [hip, knee, hock, toe] })
    }
  }

  const rig: BursterRig = { root, body, head, jaw, legs, blisters, blisterMesh, crustMesh }
  grp.userData.bursterRig = rig
  updateBlisters(rig)
  complete=true
  return grp
  }finally{if(!complete)disposeBursterParts(grp)}
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = V(0, 1, 0), _p = new THREE.Vector3()
/** 按每个水泡的 swell（0 静息 → 1 鼓胀待爆）和 burst（0 完好 → 1 已爆，剩破口）写入实例矩阵 */
export function updateBlisters(rig: BursterRig) {
  rig.blisters.forEach((b, i) => {
    _q.setFromUnitVectors(_up, b.n).multiply(_q2.setFromAxisAngle(_up, i * 2.4)) // 绕法向随机转，打散扰动纹样
    const sw = 1 + b.swell * 0.4, gone = b.burst
    // 水泡：大半埋在皮下，鼓胀时顶起变高；爆裂后塌成贴皮的残膜
    const r = b.r * sw * (1 - gone * 0.4)
    _s.set(r, r * (0.7 + b.swell * 0.45) * (1 - gone * 0.8), r)
    _p.copy(b.p).addScaledVector(b.n, -r * 0.12 + r * 0.3 * b.swell * (1 - gone))
    rig.blisterMesh.setMatrixAt(i, _m.compose(_p, _q, _s))
    // 硬痂底座：一圈压扁的痂皮
    const cr = b.r * 1.28
    _s.set(cr, cr * 0.26, cr)
    rig.crustMesh.setMatrixAt(i, _m.compose(_p.copy(b.p).addScaledVector(b.n, -cr * 0.08), _q, _s))
  })
  rig.blisterMesh.instanceMatrix.needsUpdate = true
  rig.crustMesh.instanceMatrix.needsUpdate = true
}

/** 静态姿势预设（阶段 1 预览用；阶段 2 动画在此基础上插值）。curl：0 站姿 → 1 侧卧蜷成胎儿；arch：弓背准备爆酸 */
export function poseBurster(grp: THREE.Group, o: { curl?: number; arch?: number; jaw?: number; headYaw?: number; swell?: number } = {}) {
  const rig = grp.userData.bursterRig as BursterRig | undefined
  if (!rig) return
  const c = o.curl ?? 0, a = o.arch ?? 0
  // 侧卧：绕前后轴翻 85°，压低到地面；躯干微卷
  // 绕 X 翻 θ 后，躯干中线 (y≈0.8) 落到 z≈0.8·sinθ、y≈0.8·cosθ；平移回原点并让躯干侧面贴地
  const th = c * 1.48
  rig.root.rotation.set(th, 0, -a * 0.08 + c * 0.1)
  rig.root.position.set(c * 0.05, c * (0.17 - 0.8 * Math.cos(th) + 0.0) * 1 + a * 0.06 - c * 0.0, -0.8 * Math.sin(th))
  rig.head.rotation.set(0, (o.headYaw ?? 0) * (1 - c), -0.22 - c * 0.75 + a * 0.4) // 平时低垂着头
  rig.jaw.rotation.z = -0.06 - (o.jaw ?? 0) * 0.45 // 闭嘴时也微张，露出两排牙
  for (const L of rig.legs) {
    if (L.front) {
      // 双臂收到脸前抱住头
      L.j[0].rotation.set(0, 0, c * 0.55 - a * 0.1)
      L.j[1].rotation.set(0, 0, c * 2.3)
      L.j[2].rotation.set(0, 0, c * 0.2)
    } else {
      // 膝盖抵到胸口
      L.j[0].rotation.set(0, 0, c * 1.05 - a * 0.18)
      L.j[1].rotation.set(0, 0, -c * 0.55 + a * 0.1)
      L.j[2].rotation.set(0, 0, c * 0.9)
      L.j[3].rotation.set(0, 0, c * 0.4)
    }
  }
  if (o.swell !== undefined) { for (const b of rig.blisters) b.swell = o.swell; updateBlisters(rig) }
}

/** 茧：爆酸者表皮硬化后的整体角质茧壳。crack 0 完好 → 1 将碎（裂缝透出酸液绿光） */
function buildBursterCocoonSource(seed = 0, crack = 0): THREE.Group {
  const grp = new THREE.Group(); grp.userData.entityType = 'burster-cocoon'
  const R = rng(0xc0c0 + seed * 31)
  const tx = textures()
  const shellM = new THREE.MeshPhongMaterial({ color: '#c6ae78', map: tx.crust, specular: '#3a3424', shininess: 22 })
  const g = new THREE.SphereGeometry(1, 40, 26)
  const pa = g.attributes.position as THREE.BufferAttribute, d = new THREE.Vector3()
  const knots = Array.from({ length: 26 }, () => ({ d: V(R() - 0.5, R() * 0.9 - 0.2, R() - 0.5).normalize(), r: 0.12 + R() * 0.2, h: 0.03 + R() * 0.06 }))
  // 蜷缩的躯体轮廓：一端粗（背/头），一端收（膝），背侧一列凸起的旧水泡
  for (let i = 0; i < pa.count; i++) {
    d.fromBufferAttribute(pa, i)
    let x = d.x * 0.5, y = d.y * 0.3, z = d.z * 0.34
    x += 0.04 * d.x * d.x * Math.sign(d.x)
    y *= 1 + 0.2 * sstep(-0.4, 0.6, d.x) // 头背端更鼓
    if (d.y < -0.6) y = -0.3 * 0.6 - (d.y + 0.6) * 0.15 // 底面压平落地
    let bump = 0
    for (const k of knots) bump += k.h * gauss(d.distanceTo(k.d), 0, k.r)
    bump += 0.02 * Math.sin(d.x * 17) * Math.sin(d.z * 13 + d.y * 7)
    const n = d.clone().normalize()
    pa.setXYZ(i, x + n.x * bump * 0.6, y + 0.3 * 0.6 + n.y * bump * 0.6, z + n.z * bump * 0.6)
  }
  g.computeVertexNormals()
  grp.add(new THREE.Mesh(g, shellM))
  // 裂纹：在壳面上画发光的折线带（随 crack 增多）
  if (crack > 0) {
    const lines: THREE.BufferGeometry[] = []
    const n = Math.round(3 + crack * 12)
    for (let k = 0; k < n; k++) {
      let p = V(R() - 0.5, 0.2 + R() * 0.6, R() - 0.5).normalize(), dir = V(R() - 0.5, R() - 0.5, R() - 0.5)
      for (let s = 0; s < 6; s++) {
        dir.add(V(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(0.8)).normalize()
        const q = p.clone().addScaledVector(dir, 0.12).normalize()
        const a = V(p.x * 0.57, p.y * 0.37 + 0.18, p.z * 0.4), b = V(q.x * 0.57, q.y * 0.37 + 0.18, q.z * 0.4) // 略高出壳面，避免埋进起伏
        if (a.y < 0.03 || b.y < 0.03) break
        const len = a.distanceTo(b)
        const cyl = new THREE.CylinderGeometry(0.006 + crack * 0.006, 0.004 + crack * 0.005, len, 4)
        cyl.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()))
        cyl.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
        lines.push(cyl); p = q
      }
    }
    if (lines.length) grp.add(new THREE.Mesh(merge(lines), new THREE.MeshBasicMaterial({ color: new THREE.Color('#b8e23c').multiplyScalar(0.6 + crack * 0.5) })))
  }
  return grp
}

function disposeBursterParts(root:THREE.Object3D){
 const geos=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>()
 root.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)geos.add(m.geometry);if(m.material)for(const a of Array.isArray(m.material)?m.material:[m.material])mats.add(a);if((m as THREE.InstancedMesh).isInstancedMesh)(m as THREE.InstancedMesh).dispose()})
 for(const g of geos)g.dispose();for(const m of mats)m.dispose()
}
// Two deterministic appearances; templates are CPU-only, instances own their buffers/materials.
const templates=new Map<number,THREE.Group>(),shells=new Map<number,THREE.Group>()
const appearance=(seed:number)=>Math.abs(Math.floor(seed))%2
function cloneBursterParts(src:THREE.Group){
 const refs=new Map<THREE.Object3D,THREE.Object3D>(),geos=new Map<THREE.BufferGeometry,THREE.BufferGeometry>(),mats=new Map<THREE.Material,THREE.Material>()
 const material=(m:THREE.Material)=>{let v=mats.get(m);if(!v){v=m.clone();mats.set(m,v)}return v}
 const copy=(o:THREE.Object3D):THREE.Object3D=>{const data=o.userData;o.userData={};let v:THREE.Object3D;try{v=o.clone(false)}finally{o.userData=data}refs.set(o,v);const m=v as THREE.Mesh,old=o as THREE.Mesh
  if(old.geometry){let g=geos.get(old.geometry);if(!g){g=old.geometry.clone();geos.set(old.geometry,g)}m.geometry=g}
  if(old.material)m.material=Array.isArray(old.material)?old.material.map(material):material(old.material)
  v.userData={...data};delete v.userData.bursterRig;delete v.userData.bursterAnim
  for(const child of o.children)v.add(copy(child));return v}
 const root=copy(src) as THREE.Group,R=src.userData.bursterRig as BursterRig|undefined
 if(R){const node=<T extends THREE.Object3D>(v:T)=>refs.get(v) as T
 root.userData.bursterRig={root:node(R.root),body:node(R.body),head:node(R.head),jaw:node(R.jaw),legs:R.legs.map(l=>({...l,j:l.j.map(node)})),blisters:R.blisters.map(b=>({...b,p:b.p.clone(),n:b.n.clone()})),blisterMesh:node(R.blisterMesh),crustMesh:node(R.crustMesh)} satisfies BursterRig}
 return root
}
export function bursterResourcesReady(seed=0){return templates.has(appearance(seed))&&shells.size===5}
export function* prepareBursterJob(seed=0):Generator<void,void>{
 const key=appearance(seed)
 if(!templates.has(key)){const model=yield* buildBursterSource(key);templates.set(key,model)}
 for(let i=0;i<=4;i++)if(!shells.has(i)){yield;shells.set(i,buildBursterCocoonSource(0,i/4))}
}
export function buildBursterMesh(seed=0):THREE.Group{
 const key=appearance(seed);if(!templates.has(key)){const job=prepareBursterJob(seed);while(!job.next().done){/* synchronous standalone fallback */}}
 return cloneBursterParts(templates.get(key)!)
}
export function buildBursterCocoon(_seed=0,crack=0):THREE.Group{
 const step=Math.round(Math.max(0,Math.min(1,crack))*4)
 if(!shells.has(step))shells.set(step,buildBursterCocoonSource(0,step/4))
 const g=cloneBursterParts(shells.get(step)!);g.userData.crack=step/4;return g
}
