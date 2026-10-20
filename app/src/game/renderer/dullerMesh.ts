// v63：钝人（Entity 6）重制模型——参照中文维基 Entity 6 正文与附图（墙柱中探出的无面灰色人形）。
// 约 2.1 m 高、深灰近黑的类人生物：骨架脆弱（极细的腰、外凸的肋笼与胸骨、脊突、髋翼、细长四肢与骨节），
// 没有面部也没有耳朵（竖长圆角轮廓，带纵向骨棱）；修长的手臂垂过膝盖，前臂可伸缩到数米外；
// 四指细长、带黑色指甲；头顶、肩背与膝侧缠着卷曲的黑色须丝（附图中那团卷须）。
// 机制视觉：手臂穿墙时在墙面上晕开一圈黑色污痕（附图中柱面的黑渍），随伸臂程度浓淡变化；可在手中攥着随机物品。
// 造型工具沿用猎犬的样条扫掠管体（UV + 骨突 AO 顶点色）；贴图运行时程序化生成（干皱深灰皮肤 / 墙面污痕），无外部资源。
// 模型正面 +X；网格数量和三角面由 check-duller-integration.ts 验证。
import * as THREE from 'three'
import type { Entity } from '../entities'
import { rng, merge, V, gauss, sstep, cap, ell, sweep, limbSeg, canvasTex, type RF } from './houndMesh'

let TEX: { skin: THREE.Texture | null; plain: THREE.Texture | null; stain: THREE.Texture | null } | null = null
function textures() {
  if (TEX) return TEX
  const skinTex = (rips: boolean) => canvasTex(256, 256, (c, R) => {
    c.fillStyle = '#5a5a60'; c.fillRect(0, 0, 256, 256)
    const tile = (f: (ox: number, oy: number) => void) => { for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) f(ox, oy) }
    for (let i = 0; i < 140; i++) { // 斑驳的灰
      const x = R() * 256, y = R() * 256, r = 5 + R() * 26, a = 0.05 + R() * 0.08
      const col = R() < 0.6 ? `rgba(30,30,36,${a})` : `rgba(120,120,128,${a})`
      tile((ox, oy) => { c.fillStyle = col; c.beginPath(); c.arc(x + ox, y + oy, r, 0, Math.PI * 2); c.fill() })
    }
    for (let i = 0; i < 70; i++) { // 干皱褶线（大致横向，像缩水的皮）
      let x = R() * 256, y = R() * 256, a = (R() - 0.5) * 0.6
      const pts: [number, number][] = [[x, y]]
      for (let k = 0; k < 8; k++) { a += (R() - 0.5) * 0.5; x += Math.cos(a) * 6; y += Math.sin(a) * 6; pts.push([x, y]) }
      const lw = 0.6 + R() * 1.4
      tile((ox, oy) => {
        c.strokeStyle = 'rgba(18,18,22,0.45)'; c.lineWidth = lw; c.beginPath(); pts.forEach(([px, py], k) => k ? c.lineTo(px + ox, py + oy) : c.moveTo(px + ox, py + oy)); c.stroke()
        c.strokeStyle = 'rgba(150,150,158,0.18)'; c.lineWidth = lw * 0.7; c.beginPath(); pts.forEach(([px, py], k) => k ? c.lineTo(px + ox, py + oy + 1.4) : c.moveTo(px + ox, py + oy + 1.4)); c.stroke()
      })
    }
    for (let i = 0; i < (rips ? 5 : 0); i++) { // 「煮烂」破口：少量暗紫红的肌肉
      const x = R() * 256, y = R() * 256, rx = 3 + R() * 7, ry = 2 + R() * 5, rot = R() * 3
      tile((ox, oy) => {
        c.fillStyle = 'rgba(92,30,58,0.75)'; c.beginPath(); c.ellipse(x + ox, y + oy, rx, ry, rot, 0, Math.PI * 2); c.fill()
        c.strokeStyle = 'rgba(20,18,22,0.6)'; c.lineWidth = 1.2; c.stroke()
      })
    }
    const img = c.getImageData(0, 0, 256, 256), d = img.data
    for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 16; d[i] += n; d[i + 1] += n; d[i + 2] += n }
    c.putImageData(img, 0, 0)
  }, true)
  const skin = skinTex(true), plain = skinTex(false) // 头部用无破口版本，免得紫红斑看起来像五官
  // 墙面污痕：中心浓黑、边缘破碎晕开，带向下的流痕
  const stain = canvasTex(256, 256, (c, R) => {
    c.clearRect(0, 0, 256, 256)
    const base = c.createRadialGradient(128, 118, 4, 128, 118, 105)
    base.addColorStop(0, 'rgba(6,6,8,0.92)'); base.addColorStop(0.35, 'rgba(8,8,10,0.75)'); base.addColorStop(0.7, 'rgba(10,10,12,0.25)'); base.addColorStop(1, 'rgba(10,10,12,0)')
    c.fillStyle = base; c.beginPath(); c.ellipse(128, 118, 100, 112, 0, 0, Math.PI * 2); c.fill()
    for (let i = 0; i < 260; i++) { // 破碎的边缘：大量小而淡的晕点，越靠外越稀
      const a = R() * Math.PI * 2, r = 40 + Math.pow(R(), 0.8) * 70
      const x = 128 + Math.cos(a) * r, y = 118 + Math.sin(a) * r * 1.1, s = 3 + R() * 9
      const g = c.createRadialGradient(x, y, 0, x, y, s)
      g.addColorStop(0, `rgba(8,8,10,${0.25 * (1 - r / 115)})`); g.addColorStop(1, 'rgba(8,8,10,0)')
      c.fillStyle = g; c.beginPath(); c.arc(x, y, s, 0, Math.PI * 2); c.fill()
    }
    c.strokeStyle = 'rgba(4,4,6,0.55)' // 灰泥裂纹
    for (let i = 0; i < 10; i++) {
      let x = 128 + (R() - 0.5) * 30, y = 118 + (R() - 0.5) * 30, a = R() * Math.PI * 2
      c.lineWidth = 0.8 + R(); c.beginPath(); c.moveTo(x, y)
      for (let k = 0; k < 9; k++) { a += (R() - 0.5) * 0.8; x += Math.cos(a) * 9; y += Math.sin(a) * 9; c.lineTo(x, y) }
      c.stroke()
    }
    for (let i = 0; i < 12; i++) { // 流痕
      const x = 80 + R() * 96, y0 = 140 + R() * 30, L = 25 + R() * 60, w = 1.2 + R() * 2.5
      const g = c.createLinearGradient(0, y0, 0, y0 + L)
      g.addColorStop(0, 'rgba(10,10,12,0.55)'); g.addColorStop(1, 'rgba(10,10,12,0)')
      c.strokeStyle = g; c.lineWidth = w; c.beginPath(); c.moveTo(x, y0); c.lineTo(x + (R() - 0.5) * 3, y0 + L); c.stroke()
    }
  }, false)
  TEX = { skin, plain, stain }
  return TEX
}

export interface DullerRig {
  root: THREE.Group; torso: THREE.Group; head: THREE.Group
  legs: { hip: THREE.Group; knee: THREE.Group; side: number }[]
  arms: { sh: THREE.Group; elbow: THREE.Group; stretch: THREE.Group; wrist: THREE.Group; side: number }[]
  wisps: THREE.Group[]
  carry: THREE.Group
  stain: THREE.Mesh
}

/** 卷曲须丝：沿 dir 伸出的螺旋细管，末端越卷越紧 */
function wisp(start: THREE.Vector3, dir: THREE.Vector3, len: number, R: () => number, thick = 0.0065) {
  const d = dir.clone().normalize()
  const a = Math.abs(d.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)
  const u = new THREE.Vector3().crossVectors(d, a).normalize(), w = new THREE.Vector3().crossVectors(d, u)
  const pts: THREE.Vector3[] = [], ph = R() * 6.28, turns = 1.1 + R() * 1.2
  const rk = 0.6 + R() * 0.4
  for (let k = 0; k <= 16; k++) {
    const t = k / 16, rr = 0.01 + 0.03 * t * rk
    const ang = ph + t * turns * Math.PI * 2 * (0.6 + t)
    pts.push(start.clone().addScaledVector(d, len * t * (1 - 0.25 * t)).addScaledVector(u, Math.cos(ang) * rr).addScaledVector(w, Math.sin(ang) * rr).add(V(0, -0.05 * t * t, 0)))
  }
  return sweep(pts, (t) => thick * (1 - 0.8 * t) + 0.0012, { radial: 5, seg: 30, shade: () => 0.6 })
}

export function buildDullerMesh(seed = 0): THREE.Group {
  const grp = new THREE.Group()
  grp.userData.entityType = 'duller'
  grp.userData.parts = {}
  const R = rng(0xd011 + seed * 977)
  const tx = textures()
  const skin = new THREE.MeshLambertMaterial({ color: '#8c8c94', map: tx.skin, vertexColors: true })
  if (!tx.skin) skin.color.set('#3a3a41')
  const headSkin = new THREE.MeshLambertMaterial({ color: '#a2a2aa', map: tx.plain, vertexColors: true })
  if (!tx.plain) headSkin.color.set('#3a3a41')
  const nail = new THREE.MeshLambertMaterial({ color: '#141416', vertexColors: true })
  const wispM = new THREE.MeshLambertMaterial({ color: '#0c0c0e', vertexColors: true })
  const stainM = new THREE.MeshBasicMaterial({ map: tx.stain, color: tx.stain ? '#ffffff' : '#0a0a0c', transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6, side: THREE.DoubleSide })
  const root = new THREE.Group(); grp.add(root)
  const PELVIS = 0.98

  // ---------- 躯干：极细的腰 + 外凸的肋笼（肋骨/胸骨/脊突/髋翼雕在表面） ----------
  const torso = new THREE.Group(); torso.position.set(0, PELVIS, 0); root.add(torso)
  {
    const spine = [V(-0.02, -0.02, 0), V(-0.035, 0.17, 0), V(0, 0.38, 0), V(0.035, 0.57, 0), V(0.05, 0.72, 0)]
    // [t, 半宽 Z, 厚度 X]
    const prof = [[0, 0.11, 0.085], [0.12, 0.118, 0.09], [0.27, 0.082, 0.064], [0.42, 0.135, 0.1], [0.62, 0.165, 0.118], [0.82, 0.17, 0.1], [0.92, 0.2, 0.085], [1, 0.07, 0.055]]
    const lerpP = (t: number, k: 1 | 2) => { for (let i = 1; i < prof.length; i++) if (t <= prof[i][0]) { const a = prof[i - 1], b = prof[i]; const s = sstep(0, 1, (t - a[0]) / (b[0] - a[0])); return a[k] + (b[k] - a[k]) * s } return prof[prof.length - 1][k] }
    const det = (t: number, cs: number, sn: number) => {
      // 肋骨由脊柱向前下方斜行：前侧相位下移；正前方（胸骨两侧肋软骨）与背面淡出
      const tr = t + 0.07 * cs
      const ribBand = tr > 0.42 && tr < 0.9 ? Math.sin((tr - 0.42) * Math.PI * 14) * sstep(0.42, 0.47, tr) * sstep(0.9, 0.84, tr) : 0
      const ribs = 0.009 * ribBand * sstep(-0.5, 0.1, cs) * (1 - 0.85 * gauss(sn, 0, 0.3) * sstep(0.3, 0.9, cs))
      const sternum = 0.012 * gauss(sn, 0, 0.12) * sstep(0.75, 1, cs) * gauss(t, 0.62, 0.14)
      const spineB = cs < -0.85 ? 0.012 * Math.max(0, Math.sin(t * Math.PI * 22)) ** 2 : 0
      const hips = 0.025 * gauss(t, 0.08, 0.06) * sstep(0.5, 0.9, Math.abs(sn))
      const ribEdge = -0.02 * gauss(t, 0.36, 0.035) * sstep(-0.2, 0.6, cs) // 肋弓下缘的深凹
      const clav = 0.012 * gauss(t, 0.9, 0.035) * sstep(0.2, 0.9, cs)
      return { ribs, sternum, spineB, hips, ribEdge, clav, ribBand }
    }
    const torsoR: RF = (t, _d, cs, sn) => {
      const rz = lerpP(t, 1), rx = lerpP(t, 2), k = det(t, cs, sn)
      return rz * ell(cs, sn, rx / rz, 1) * cap(t, 0.06) + k.ribs + k.sternum + k.spineB + k.hips + k.ribEdge + k.clav
    }
    const tg = sweep(spine, torsoR, {
      radial: 22, seg: 46, uRep: 2, vRep: 2.6,
      shade: (t, _d, cs, sn) => {
        const k = det(t, cs, sn)
        const groove = Math.max(0, -k.ribBand) * 0.3 * sstep(-0.6, 0.2, cs)
        return Math.min(1.12, 0.84 + k.ribs * 8 + k.sternum * 6 + k.spineB * 6 + k.hips * 4 + k.clav * 6 - groove + k.ribEdge * 6 - (t > 0.2 && t < 0.34 ? 0.12 : 0))
      },
    })
    const neck = sweep([V(0.045, 0.64, 0), V(0.052, 0.69, 0), V(0.06, 0.74, 0)], (t, _d, cs, sn) => (0.05 - 0.006 * t) * cap(t, 0.15) * ell(cs, sn, 1.1, 0.9) + 0.006 * gauss(t, 0.5, 0.2) * sstep(0.6, 1, Math.abs(sn)), { radial: 10, seg: 8, shade: (t) => 0.82 + 0.08 * t })
    torso.add(new THREE.Mesh(merge([tg, neck]), skin))
  }

  // ---------- 头：对照附图——直接压在肩上的大号竖长头颅（无脸、无耳），圆角长方体轮廓，
  //            正面一圈隆起的边框，框内是竖向的骨棱与凹槽，中线一道纵脊 ----------
  const HH = 0.46 // 头高
  const head = new THREE.Group(); head.position.set(0.06, 0.66, 0); torso.add(head)
  {
    const g = new THREE.SphereGeometry(1, 72, 40)
    const pa = g.attributes.position as THREE.BufferAttribute, col: number[] = []
    const d = new THREE.Vector3()
    const se = (v: number, n: number) => Math.sign(v) * Math.abs(v) ** (2 / n)
    for (let i = 0; i < pa.count; i++) {
      d.fromBufferAttribute(pa, i).normalize()
      const u = se(d.x, 3.6), w = se(d.z, 3.6), h = se(d.y, d.y > 0 ? 2.6 : 3.2)
      const hy = (h + 1) / 2 // 0 底 → 1 顶
      const front = sstep(0.35, 0.9, d.x)
      const zr = 0.105 * (1 - 0.18 * sstep(0.55, 0, hy)) * (1 + 0.04 * Math.sin(hy * Math.PI)) // 下端略收
      const xr = 0.088 * (1 - 0.12 * sstep(0.5, 0, hy))
      let x = u * xr, z = w * zr
      const y = hy * HH
      const az = Math.abs(w)
      const rim = 0.02 * sstep(0.62, 0.86, az) * front + 0.01 * sstep(0.82, 0.96, hy) * front + 0.008 * sstep(0.2, 0.06, hy) * front
      const slats = az < 0.7 ? 0.008 * Math.cos(w * Math.PI * 4.5) * front * sstep(0.06, 0.18, hy) * sstep(0.95, 0.82, hy) : 0
      const ridge = 0.016 * gauss(w, 0, 0.07) * front * sstep(0.04, 0.2, hy)
      const recess = -0.014 * sstep(0.7, 0.4, az) * front * sstep(0.08, 0.2, hy) * sstep(0.92, 0.8, hy)
      x += rim + slats + ridge + recess
      pa.setXYZ(i, x, y, z)
      const c = Math.min(1.45, 0.78 + rim * 26 + Math.max(0, slats) * 28 + ridge * 16 + recess * 14 - (d.y < -0.6 ? 0.12 : 0))
      col.push(c, c, c)
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals()
    head.add(new THREE.Mesh(g, headSkin))
    // 头顶与后脑的卷须
    const wg: THREE.BufferGeometry[] = []
    for (let i = 0; i < 9; i++) {
      const a = -0.6 + (i / 8) * 4.2 + (R() - 0.5) * 0.4, el = 0.35 + R() * 0.6
      const s = V(Math.cos(a) * 0.07 * Math.cos(el) - 0.01, HH * (0.55 + 0.4 * Math.sin(el)), Math.sign(Math.sin(a) || 1) * 0.1)
      wg.push(wisp(s, V(Math.cos(a) * 0.4 - 0.3, (R() - 0.3) * 0.9, Math.sign(Math.sin(a) || 1) * (0.8 + R() * 0.5)), 0.12 + R() * 0.14, R))
    }
    const wm = new THREE.Group(); wm.add(new THREE.Mesh(merge(wg), wispM)); head.add(wm)
    grp.userData.headWisps = wm
  }
  head.rotation.set(0.08, 0, -0.05) // 微微歪斜

  // 肩背卷须
  const shoulderWisps = new THREE.Group(); torso.add(shoulderWisps)
  {
    const wg: THREE.BufferGeometry[] = []
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      wg.push(wisp(V(-0.02 - R() * 0.05, 0.64 + R() * 0.06, side * (0.12 + R() * 0.06)), V(-0.3 - R() * 0.4, 0.3 + R() * 0.5, side * (0.6 + R() * 0.4)), 0.12 + R() * 0.14, R))
    }
    shoulderWisps.add(new THREE.Mesh(merge(wg), wispM))
  }

  // ---------- 腿：细长、骨节外凸、站姿外八 ----------
  const legs: DullerRig['legs'] = []
  const kneeWisps: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(-0.01, PELVIS - 0.02, side * 0.095); root.add(hip)
    const thigh = limbSeg([V(0, 0.03, 0), V(0.025, -0.22, side * 0.01), V(0.03, -0.45, side * 0.012)], 0.058, 0.032, 0.2, 0.22, 0.95)
    hip.add(new THREE.Mesh(thigh, skin))
    const knee = new THREE.Group(); knee.position.set(0.03, -0.45, side * 0.012); hip.add(knee)
    const kn = new THREE.SphereGeometry(0.04, 10, 8).scale(1.05, 1.2, 0.95).translate(0.006, 0, 0)
    kn.setAttribute('color', new THREE.Float32BufferAttribute(new Array(kn.attributes.position.count * 3).fill(1), 3))
    const shin = limbSeg([V(0, 0, 0), V(-0.018, -0.22, 0), V(-0.03, -0.43, 0)], 0.036, 0.022, 0.25, 0.18, 0.95, false)
    const ank = new THREE.SphereGeometry(0.026, 8, 6).translate(-0.03, -0.43, 0)
    ank.setAttribute('color', new THREE.Float32BufferAttribute(new Array(ank.attributes.position.count * 3).fill(0.95), 3))
    const foot = sweep([V(-0.06, -0.43, 0), V(0.02, -0.485, 0), V(0.12, -0.5, side * 0.01), V(0.19, -0.505, side * 0.015)], (t, _d, cs, sn) => (0.03 - 0.012 * t) * cap(t, 0.12) * ell(cs, sn, 0.6, 1.15), { radial: 8, seg: 8, shade: (t) => 0.78 + 0.1 * t })
    const toes: THREE.BufferGeometry[] = []
    for (let i = 0; i < 4; i++) { const z = side * 0.01 + (i - 1.5) * 0.013; toes.push(new THREE.ConeGeometry(0.006, 0.025, 4).rotateZ(-Math.PI / 2).translate(0.205, -0.51, z)) }
    knee.add(new THREE.Mesh(merge([kn, shin, ank, foot]), skin))
    knee.add(new THREE.Mesh(merge(toes.map((g) => { g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(1), 3)); return g })), nail))
    // 小腿上的卷须（附图中下肢周围的黑色卷丝）
    const kw = new THREE.Group()
    const wg: THREE.BufferGeometry[] = []
    for (let i = 0; i < 3; i++) wg.push(wisp(V(-0.02, -0.08 - R() * 0.2, side * 0.03), V(-0.3 - R() * 0.5, (R() - 0.5) * 0.6, side * (0.7 + R() * 0.5)), 0.1 + R() * 0.1, R, 0.005))
    kw.add(new THREE.Mesh(merge(wg), wispM)); knee.add(kw); kneeWisps.push(kw)
    legs.push({ hip, knee, side })
  }

  // ---------- 手臂：垂过膝盖；前臂可伸缩（stretch.scale.y），手腕随之外移 ----------
  const arms: DullerRig['arms'] = []
  const carry = new THREE.Group()
  for (const side of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.035, 0.66, side * 0.205); torso.add(sh)
    const knob = new THREE.SphereGeometry(0.048, 10, 8).scale(1, 0.9, 1)
    knob.setAttribute('color', new THREE.Float32BufferAttribute(new Array(knob.attributes.position.count * 3).fill(0.95), 3))
    const upper = limbSeg([V(0, 0, 0), V(0.006, -0.22, side * 0.012), V(0, -0.44, side * 0.014)], 0.042, 0.027, 0.18, 0.18, 0.95)
    sh.add(new THREE.Mesh(merge([knob, upper]), skin))
    const elbow = new THREE.Group(); elbow.position.set(0, -0.44, side * 0.014); sh.add(elbow)
    const eb = new THREE.SphereGeometry(0.03, 8, 6).scale(1, 1.25, 1).translate(-0.008, 0, 0)
    eb.setAttribute('color', new THREE.Float32BufferAttribute(new Array(eb.attributes.position.count * 3).fill(1), 3))
    elbow.add(new THREE.Mesh(eb, skin))
    const stretch = new THREE.Group(); elbow.add(stretch)
    // 前臂：两根并行的细骨（尺骨/桡骨感）+ 筋，管体沿 -Y，单位长度 0.5
    const fa = sweep([V(0, 0, 0), V(0.004, -0.25, 0), V(0, -0.5, 0)], (t, _d, cs, sn) => (0.028 - 0.008 * t) * (1 + 0.15 * gauss(t, 0.15, 0.1)) * ell(cs, sn, 0.85, 1) + 0.004 * Math.abs(Math.sin(t * Math.PI * 7)) * gauss(cs, 1, 0.4), { radial: 9, seg: 14, vRep: 2.5, shade: (t) => 0.82 + 0.06 * Math.sin(t * 20) })
    stretch.add(new THREE.Mesh(fa, skin))
    const wrist = new THREE.Group(); wrist.position.set(0, -0.5, 0); elbow.add(wrist)
    // 手：窄长的掌 + 四根长指（含指节）+ 拇指，黑色指甲
    const hs: THREE.BufferGeometry[] = [], hn: THREE.BufferGeometry[] = []
    hs.push(sweep([V(0, 0.01, 0), V(0.004, -0.05, 0), V(0.002, -0.1, 0)], (t, _d, cs, sn) => (0.024 + 0.008 * Math.sin(t * Math.PI)) * cap(t, 0.15) * ell(cs, sn, 1.5, 0.55), { radial: 8, seg: 6, shade: () => 0.85 }))
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.014, L = (0.16 - Math.abs(i - 1.5) * 0.02)
      const a = V(x, -0.095, 0), b = V(x * 1.15, -0.095 - L * 0.5, side * -0.008), c = V(x * 1.25, -0.095 - L, side * -0.03)
      hs.push(sweep([a, b, c], (t, _d, cs, sn) => 0.0075 * (1 - 0.35 * t) * (1 + 0.3 * gauss(t, 0.33, 0.06) + 0.3 * gauss(t, 0.66, 0.06)) * cap(t, 0.1) * ell(cs, sn, 1, 0.9), { radial: 6, seg: 9, shade: (t) => 0.8 + 0.12 * gauss(t, 0.33, 0.08) }))
      hn.push(sweep([c.clone().add(V(0, 0.012, side * 0.004)), c.clone().add(V(0, -0.012, side * -0.012))], (t) => 0.006 * (1 - t * 0.85), { radial: 5, seg: 3, shade: () => 0.8 }))
    }
    hs.push(sweep([V(0.022, -0.02, 0), V(0.035, -0.06, side * -0.01), V(0.04, -0.1, side * -0.02)], (t, _d, cs, sn) => 0.0075 * (1 - 0.3 * t) * cap(t, 0.12) * ell(cs, sn, 1, 0.9), { radial: 6, seg: 6, shade: () => 0.82 }))
    wrist.add(new THREE.Mesh(merge(hs), skin))
    wrist.add(new THREE.Mesh(merge(hn), nail))
    if (side > 0) { carry.position.set(0.0, -0.13, side * -0.035); wrist.add(carry) }
    arms.push({ sh, elbow, stretch, wrist, side })
  }

  // ---------- 墙面污痕（穿墙伸臂时出现） ----------
  const stain = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.9), stainM)
  stain.rotation.y = Math.PI / 2; stain.position.set(0.8, 1.2, 0); stain.visible = false
  grp.add(stain)

  const rig: DullerRig = { root, torso, head, legs, arms, wisps: [grp.userData.headWisps, shoulderWisps, ...kneeWisps], carry, stain }
  grp.userData.dullerRig = rig
  return grp
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

export function animateDuller(grp: THREE.Group, e: Entity, time: number, gz: number, ox=0, oy=0) {
  const r = grp.userData.dullerRig as DullerRig | undefined
  if (!r) return
  const s = e.dl
  const t = time + e.id * 1.37
  // 运动量：由 animT（AI 按步速累加）的变化率推得
  const last = grp.userData.dlLast as [number, number] | undefined
  const vel = last && time > last[1] ? Math.min(8, (e.animT - last[0]) / (time - last[1])) : 0
  grp.userData.dlLast = [e.animT, time]
  const mv = grp.userData.dlMv = lerp((grp.userData.dlMv as number) ?? 0, Math.min(1, vel / 1.2), 0.15)
  const run = s?.run ?? 0, reach = s?.reach ?? 0, sway = s?.sway ?? 1
  const g = e.animT * (Math.PI * 2 / (1.25 + run * 0.6))
  const amp = mv * (0.42 + run * 0.5)
  // 不自然的步态：偶发的抽搐与踉跄（基于时间的伪随机）
  const twitch = Math.max(0, Math.sin(t * 0.83) * Math.sin(t * 2.17) - 0.7) * 3
  const stagger = Math.sin(g * 0.5 + 0.7) * 0.12 * mv * sway
  for (const L of r.legs) {
    const ph = L.side < 0 ? 0 : Math.PI
    L.hip.rotation.z = Math.sin(g + ph) * amp + (L.side < 0 ? stagger : -stagger) * 0.5
    L.hip.rotation.x = L.side * (0.05 + 0.04 * sway * Math.sin(t * 0.6)) // 外八、摇晃
    L.knee.rotation.z = -Math.max(0, Math.sin(g + ph + Math.PI / 2)) * amp * 1.4 - 0.06
  }
  r.root.position.y = Math.abs(Math.sin(g)) * amp * 0.06 - run * 0.06
  grp.position.y = gz
  // 躯干：左右摇摆（站不稳）+ 前倾（奔逃/伸臂）
  r.torso.rotation.x = (Math.sin(g) * 0.1 * mv + Math.sin(t * 0.9) * 0.07 + Math.sin(t * 0.37) * 0.04) * sway
  r.torso.rotation.z = -(0.06 + run * 0.42 + reach * 0.22) + twitch * 0.05 * sway
  r.torso.rotation.y = Math.sin(t * 0.5) * 0.05 * sway
  // 头：微歪、慢慢转动、偶发猛抽
  r.head.rotation.x = 0.08 + Math.sin(t * 0.7) * 0.12 * sway + twitch * 0.25 * sway
  r.head.rotation.y = Math.sin(t * 0.41) * 0.35 * (1 - reach) * (1 - run)
  r.head.rotation.z = -0.05 + run * -0.2 + reach * -0.08
  // 手臂
  const S = s ? Math.max(1, Math.min(5.2, (s.reachLen - 0.75) / 0.5)) : 1
  const holding = s?.phase === 'hold' || s?.phase === 'drag'
  for (const A of r.arms) {
    const ph = A.side < 0 ? Math.PI : 0
    const dangle = -Math.sin(g + ph) * amp * 0.6 + Math.sin(t * 1.1 + A.side) * 0.05
    const idleZ = dangle - run * 0.95
    const reachZ = holding ? 1.15 : s?.phase === 'feed' ? 0.72 : 1.47 // v81：捕食旱虾时向前下方伸手
    A.sh.rotation.z = lerp(idleZ, reachZ + Math.sin(t * 9 + A.side) * 0.02, reach)
    A.sh.rotation.x = lerp(A.side * -0.06 + run * A.side * -0.15, A.side * -0.02, reach)
    A.elbow.rotation.z = lerp(0.16 + run * 0.6 + Math.max(0, Math.sin(g + ph)) * amp * 0.3, 0.02, reach)
    const k = lerp(1, S, reach)
    A.stretch.scale.set(1 - (k - 1) * 0.04, k, 1 - (k - 1) * 0.04)
    A.wrist.position.y = -0.5 * k
    A.wrist.rotation.z = lerp(0.05, -0.15, reach)
  }
  // 卷须缓慢蠕动
  for (let i = 0; i < r.wisps.length; i++) { const w = r.wisps[i]; w.rotation.x = Math.sin(t * 1.3 + i) * 0.06; w.rotation.y = Math.sin(t * 0.9 + i * 2) * 0.08 }
  // 墙面污痕：沿朝向放在墙面（玩家一侧），浓度随伸臂程度
  const wd = s?.wallD ?? -1
  const on = reach > 0.02 && wd > 0
  r.stain.visible = on
  if (on) {
    if(s?.wallX!==undefined&&s.wallY!==undefined&&s.wallAngle!==undefined){
      const facing=-grp.rotation.y,dx=s.wallX-ox-e.x,dy=s.wallY-oy-e.y,c=Math.cos(facing),sn=Math.sin(facing)
      r.stain.position.set(c*dx+sn*dy,1.32,-sn*dx+c*dy)
      r.stain.rotation.y=Math.PI/2-s.wallAngle+facing
    }else{r.stain.position.set(wd, 1.32, 0);r.stain.rotation.y=Math.PI/2}
    ;(r.stain.material as THREE.MeshBasicMaterial).opacity = Math.min(0.92, reach * 1.1)
    r.stain.scale.setScalar(0.6 + reach * 0.4)
  }
  r.carry.visible = reach < 0.5
}
