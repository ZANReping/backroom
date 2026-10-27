// 仅预览用：v62.3 旧猎犬模型原样副本（猎犬重制阶段 1 的新旧对比图），游戏不引用。
// v62.1：猎犬（Entity 8）重制模型·细化版——参照中文维基附图（chompgwenarts，CC BY-SA 4.0，仅作造型参考）。
// 病态消瘦的人形四足爬行者：灰白皮包骨，肋骨/脊椎/肩胛/髋骨直接雕在皮肤表面；犬类长吻头部、黑色长发垂过脸、尖耳、
// 白眼、巨口利齿；细长人臂与长指爪手、人腿与长趾足；臀后一把乱蓬蓬的黑毛尾。
// 造型：所有躯体/四肢/指趾/爪均为沿样条扫掠的平滑管体（带肌肉起伏与圆头端盖，含 UV 与骨突 AO 顶点色）；
// 头部由球体逐顶点雕刻（口鼻、眉弓、眼窝、颧骨）；毛发为贴合皮肤外扩的低模壳体（头套/背鬃/尾束）+ 发梢镂空毛发纹理。
// 贴图：运行时程序化生成（可平铺皮肤：斑驳/静脉/污渍/毛孔；发丝：渐细发束），无外部资源；全部猎犬共享缓存。
// 模型正面 +X；24 个网格。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Entity } from '../game/entities'

function rng(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const merge = (g: THREE.BufferGeometry[]) => mergeGeometries(g.map((x) => x.index ? x.toNonIndexed() : x))!
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const gauss = (x: number, c: number, w: number) => Math.exp(-((x - c) * (x - c)) / (2 * w * w))
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
/** 圆头端盖：两端半球式收口 */
const cap = (t: number, e = 0.1) => Math.sqrt(Math.max(0.0001, Math.min(1, t / e, (1 - t) / e)))
/** 椭圆截面：管体自身截面坐标 (cs=面内法向分量, sn=Z 向分量) 的半径系数 */
const ell = (cs: number, sn: number, a: number, b: number) => 1 / Math.sqrt((cs / a) ** 2 + (sn / b) ** 2)

type RF = (t: number, d: THREE.Vector3, cs: number, sn: number) => number
/** 沿样条扫掠的管体（含 UV 与顶点色）。rf 给半径，shade 给顶点色明度（AO/骨突）。 */
function sweep(pts: THREE.Vector3[], rf: RF, o: { radial?: number; seg?: number; vRep?: number; uRep?: number; shade?: RF } = {}) {
  const radial = o.radial ?? 10, seg = o.seg ?? 12
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
  const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = []
  const T = new THREE.Vector3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3(), d = new THREE.Vector3(), P = new THREE.Vector3()
  const Z = V(0, 0, 1), X = V(1, 0, 0)
  for (let i = 0; i <= seg; i++) {
    const t = i / seg
    curve.getPointAt(t, P); curve.getTangentAt(t, T)
    n1.crossVectors(T, Math.abs(T.z) < 0.9 ? Z : X).normalize(); n2.crossVectors(n1, T).normalize()
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2
      d.copy(n1).multiplyScalar(Math.cos(a)).addScaledVector(n2, Math.sin(a))
      const cs = Math.cos(a), sn = Math.sin(a)
      const r = rf(t, d, cs, sn)
      pos.push(P.x + d.x * r, P.y + d.y * r, P.z + d.z * r)
      uv.push((j / radial) * (o.uRep ?? 1), t * (o.vRep ?? 1))
      const c = o.shade ? o.shade(t, d, cs, sn) : 1
      col.push(c, c, c)
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
  g.setIndex(idx); g.computeVertexNormals()
  return g
}
/** 简单肢段：起点→终点（可带中间弯点），肌肉鼓包位置 bulgeAt */
function limbSeg(pts: THREE.Vector3[], r0: number, r1: number, bulge = 0.2, bulgeAt = 0.3, flat = 1, endCap = true) {
  return sweep(pts, (t, _d, cs, sn) => (r0 + (r1 - r0) * t) * (1 + bulge * gauss(t, bulgeAt, 0.16)) * (endCap || t < 0.5 ? cap(t, 0.12) : 1) * ell(cs, sn, 1, flat), {
    radial: 8, seg: 9, vRep: 1.5,
    shade: (t) => 0.82 + 0.18 * gauss(t, bulgeAt, 0.25),
  })
}
/** 低模网格壳：rows×cols 个点由 pt(i,j) 给出，UV 由 uvf(i,j) 给出；用于毛发壳体 */
function shell(rows: number, cols: number, pt: (i: number, j: number) => THREE.Vector3, uvf: (i: number, j: number) => [number, number], shade: (i: number, j: number) => number) {
  const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = []
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
    const p = pt(i, j), [u, v] = uvf(i, j), c = shade(i, j)
    pos.push(p.x, p.y, p.z); uv.push(u, v); col.push(c, c, c)
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const a = i * (cols + 1) + j, b = a + cols + 1
    idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx); g.computeVertexNormals()
  return g
}

// ---------- 程序化贴图（共享缓存） ----------
let TEX: { skin: THREE.Texture | null; hair: THREE.Texture | null } | null = null
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D, R: () => number) => void, repeat: boolean) {
  if (typeof document === 'undefined') return null
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  const c = cv.getContext('2d'); if (!c) return null
  draw(c, rng(0x5eed))
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}
function textures() {
  if (TEX) return TEX
  const skin = canvasTex(256, 256, (c, R) => {
    c.fillStyle = '#b9b2a5'; c.fillRect(0, 0, 256, 256)
    // 可平铺地画：每个元素在 3×3 位置各画一次
    const tile = (f: (ox: number, oy: number) => void) => { for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) f(ox, oy) }
    for (let i = 0; i < 160; i++) { // 斑驳
      const x = R() * 256, y = R() * 256, r = 6 + R() * 30, a = 0.04 + R() * 0.07
      const col = R() < 0.5 ? `rgba(120,108,96,${a})` : `rgba(214,206,190,${a})`
      tile((ox, oy) => { c.fillStyle = col; c.beginPath(); c.arc(x + ox, y + oy, r, 0, Math.PI * 2); c.fill() })
    }
    for (let i = 0; i < 14; i++) { // 透出皮下的青灰静脉
      let x = R() * 256, y = R() * 256, a = R() * Math.PI * 2
      const pts: [number, number][] = [[x, y]]
      for (let k = 0; k < 14; k++) { a += (R() - 0.5) * 0.9; x += Math.cos(a) * 7; y += Math.sin(a) * 7; pts.push([x, y]) }
      const lw = 0.6 + R() * 1.2
      tile((ox, oy) => { c.strokeStyle = 'rgba(88,98,118,0.22)'; c.lineWidth = lw; c.beginPath(); pts.forEach(([px, py], k) => k ? c.lineTo(px + ox, py + oy) : c.moveTo(px + ox, py + oy)); c.stroke() })
    }
    for (let i = 0; i < 40; i++) { // 污渍
      const x = R() * 256, y = R() * 256, r = 2 + R() * 7
      const rot = R() * 3
      tile((ox, oy) => { c.fillStyle = 'rgba(70,58,44,0.12)'; c.beginPath(); c.ellipse(x + ox, y + oy, r, r * 0.6, rot, 0, Math.PI * 2); c.fill() })
    }
    const img = c.getImageData(0, 0, 256, 256), d = img.data
    for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n } // 毛孔噪点
    c.putImageData(img, 0, 0)
  }, true)
  // 毛发纹理：上部不透明的顺向发束（横向可平铺），底部约 22% 为参差发梢镂空（alphaTest 裁切）
  const hair = canvasTex(256, 256, (c, R) => {
    c.fillStyle = '#1d1712'; c.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 220; i++) {
      const x = R() * 256, w = 1 + R() * 3, tone = 14 + R() * 34, a = 0.35 + R() * 0.5
      const c1 = (R() - 0.5) * 8, c2 = (R() - 0.5) * 10, c3 = (R() - 0.5) * 12
      for (const ox of [-256, 0, 256]) {
        c.strokeStyle = `rgba(${tone},${tone * 0.82},${tone * 0.66},${a})`; c.lineWidth = w; c.beginPath(); c.moveTo(x + ox, 0)
        c.bezierCurveTo(x + ox + c1, 90, x + ox + c2, 170, x + ox + c3, 256); c.stroke()
      }
    }
    for (let y = 0; y < 256; y += 2) { c.fillStyle = `rgba(0,0,0,${0.18 * (y / 256)})`; c.fillRect(0, y, 256, 2) } // 发梢方向略暗
    c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000' // 参差发梢
    for (let x = -6; x < 262; x += 5 + R() * 6) {
      const top = 196 + R() * 46
      c.beginPath(); c.moveTo(x - 4 - R() * 4, 257); c.lineTo(x + 3 + R() * 4, 257); c.lineTo(x + (R() - 0.5) * 3, top); c.closePath(); c.fill()
    }
    c.fillRect(0, 250, 256, 6)
    c.globalCompositeOperation = 'source-over'
  }, false)
  if (hair) { hair.wrapS = THREE.RepeatWrapping; hair.flipY = false } // v=0 发根（画布顶）→ v=1 发梢（画布底）
  TEX = { skin, hair }
  return TEX
}

export interface HoundRig {
  body: THREE.Group; head: THREE.Group; jaw: THREE.Group; tail: THREE.Group
  legs: { hip: THREE.Group; knee: THREE.Group; front: boolean; side: number; sole: THREE.Box3 }[]
  earL: THREE.Mesh; earR: THREE.Mesh
}

export function buildHoundMesh(neutral = false, seed = 0): THREE.Group {
  const grp = new THREE.Group()
  grp.userData.entityType = 'hound'
  grp.userData.parts = {}
  const R = rng(0x8a11 + seed * 131)
  const jit = Array.from({ length: 32 }, () => 0.75 + R() * 0.5) // 逐列长度起伏，让垂边成缕
  const tx = textures()
  const skin = new THREE.MeshLambertMaterial({ color: neutral ? '#e6dccb' : '#d6d0c6', map: tx.skin, vertexColors: true })
  const hair = new THREE.MeshLambertMaterial({ color: '#ffffff', map: tx.hair, vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.5, transparent: false })
  if (!tx.hair) hair.color.set('#15110e')
  hair.alphaTest = tx.hair ? 0.5 : 0
  const claw = new THREE.MeshLambertMaterial({ color: '#2f2822', vertexColors: true })
  const eyeM = new THREE.MeshBasicMaterial({ color: '#efece2' })
  const toothM = new THREE.MeshLambertMaterial({ color: '#d9cfb6', emissive: '#2a261c' })
  const mouthM = new THREE.MeshBasicMaterial({ color: '#1c0d0b' })

  // ---------- 躯干：沿弓起脊线扫掠，骨突雕在表面 ----------
  const body = new THREE.Group(); body.position.set(0, 0.66, 0); grp.add(body)
  {
    const spine = [V(-0.55, 0.02, 0), V(-0.38, 0.05, 0), V(-0.15, 0.0, 0), V(0.1, 0.03, 0), V(0.34, 0.06, 0), V(0.5, 0.06, 0)]
    const prof = [[0, 0.07], [0.1, 0.125], [0.2, 0.12], [0.36, 0.088], [0.48, 0.09], [0.62, 0.135], [0.8, 0.15], [0.93, 0.12], [1, 0.08]]
    const base = (t: number) => { for (let i = 1; i < prof.length; i++) if (t <= prof[i][0]) { const [t0, r0] = prof[i - 1], [t1, r1] = prof[i]; const k = sstep(0, 1, (t - t0) / (t1 - t0)); return r0 + (r1 - r0) * k } return 0.08 }
    const detail = (t: number, d: THREE.Vector3) => {
      const side = Math.abs(d.z), top = Math.max(0, d.y)
      const ribPhase = Math.sin((t - 0.5) * Math.PI * 16)
      const ribs = t > 0.5 && t < 0.9 && d.y > -0.7 ? 0.02 * ribPhase * sstep(0.2, 0.7, side + top * 0.3) * gauss(t, 0.7, 0.13) : 0
      const spineB = top > 0.88 ? 0.016 * Math.max(0, Math.sin(t * Math.PI * 24)) ** 2 * sstep(0.88, 1, top) : 0
      const blades = 0.04 * gauss(t, 0.78, 0.06) * gauss(d.y, 0.6, 0.22) * sstep(0.3, 0.8, side)
      const hips = 0.035 * gauss(t, 0.14, 0.06) * gauss(d.y, 0.5, 0.25) * sstep(0.3, 0.8, side)
      const tuck = d.y < -0.4 ? -0.025 * gauss(t, 0.4, 0.1) : 0 // 凹陷的腹部
      return { ribs, spineB, blades, hips, tuck, ribPhase }
    }
    const torsoR: RF = (t, d, cs, sn) => {
      const k = detail(t, d)
      return base(t) * cap(t, 0.08) * ell(cs, sn, 1, 0.82) + k.ribs + k.spineB + k.blades + k.hips + k.tuck
    }
    const torso = sweep(spine, torsoR, {
      radial: 22, seg: 44, vRep: 2.5, uRep: 2,
      shade: (t, d) => {
        const k = detail(t, d)
        const groove = t > 0.5 && t < 0.9 && d.y > -0.7 ? Math.max(0, -k.ribPhase) * 0.38 * gauss(t, 0.7, 0.13) * sstep(0.2, 0.7, Math.abs(d.z)) : 0
        return Math.min(1.1, 0.88 + (k.ribs > 0 ? k.ribs * 6 : 0) + k.spineB * 6 + k.blades * 3 + k.hips * 3 - groove - (d.y < -0.5 ? 0.1 : 0))
      },
    })
    const neck = sweep([V(0.4, 0.05, 0), V(0.52, 0.08, 0), V(0.64, 0.1, 0)], (t, _d, cs, sn) => (0.062 - t * 0.016) * cap(t, 0.15) * ell(cs, sn, 1.05, 0.9), { radial: 10, seg: 8, shade: () => 0.9 })
    body.add(new THREE.Mesh(merge([torso, neck]), skin))
    // 背鬃：沿脊线的低模毛发壳，按躯干实际表面（含肩胛/脊突）外扩 2.2cm 贴合，两侧短垂；肩部前肢处垂边收短以免穿进上臂
    {
      const curve = new THREE.CatmullRomCurve3(spine, false, 'centripetal')
      const P = new THREE.Vector3(), T = new THREE.Vector3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3(), d = new THREE.Vector3()
      const rows = 12, half = 4, drape = 2, cols = 2 * (half + drape), A = 1.45
      const t0 = 0.4, t1 = 0.99
      const edge: THREE.Vector3[] = []
      const maneG = shell(rows, cols, (i, j) => {
        const t = t0 + (t1 - t0) * (i / rows)
        curve.getPointAt(t, P); curve.getTangentAt(t, T)
        n1.crossVectors(T, V(0, 0, 1)).normalize(); n2.crossVectors(n1, T).normalize()
        const k = j - (half + drape), kc = Math.max(-half, Math.min(half, k))
        const a = Math.PI + (kc / half) * A * (0.3 + 0.7 * sstep(0, 0.16, t - t0)) // 后端收窄，鬃毛自然起头
        const cs = Math.cos(a), sn = Math.sin(a)
        d.copy(n1).multiplyScalar(cs).addScaledVector(n2, sn)
        const p = P.clone().addScaledVector(d, torsoR(t, d, cs, sn) + 0.022)
        if (Math.abs(k) <= half) { if (Math.abs(k) === half) edge[i] = p; return p }
        const step = Math.abs(k) - half, side = Math.sign(k) * Math.sign(n2.z || 1)
        const len = (0.05 * (1 - 0.9 * gauss(t, 0.84, 0.07)) * sstep(0, 0.12, t - t0) + 0.006) * jit[i]
        return p.add(V(0, -len * step, side * 0.008 * step))
      }, (i, j) => [i / rows * 3, Math.abs(j - (half + drape)) / (half + drape) * 0.98], (_i, j) => 0.75 + 0.3 * (1 - Math.abs(j - (half + drape)) / (half + drape)))
      void edge
      body.add(new THREE.Mesh(maneG, hair))
    }
  }
  // ---------- 尾：一条低模毛束，从臀部内侧长出、蓬起后收尖下垂 ----------
  const tail = new THREE.Group(); tail.position.set(-0.53, 0.05, 0); body.add(tail)
  {
    const tg = sweep([V(0.05, 0, 0), V(-0.15, -0.04, 0), V(-0.38, -0.13, 0), V(-0.62, -0.26, 0), V(-0.8, -0.36, 0)],
      (t, _d, cs, sn) => (0.035 + 0.06 * Math.sin(Math.min(1, t * 1.15) * Math.PI) ** 0.8 + 0.012 * (1 - t)) * ell(cs, sn, 0.8, 1) * (t > 0.9 ? 1 - (t - 0.9) * 6 : 1),
      { radial: 7, seg: 8, uRep: 2, vRep: 0.98, shade: (t) => 0.7 + 0.3 * Math.min(1, t * 3) })
    tail.add(new THREE.Mesh(tg, hair))
  }
  // ---------- 头：球体逐顶点雕刻 ----------
  const head = new THREE.Group(); head.position.set(0.68, 0.11, 0); head.scale.setScalar(1.22); body.add(head)
  // 犬类头骨：较小的颅腔（含额段/眉弓/眼窝/颧弓）+ 前伸的长吻部（上颌扫掠体，底面平直为口裂线）+ 吻端黑鼻头
  const sockets = [V(0.72, 0.3, 0.52).normalize(), V(0.72, 0.3, -0.52).normalize()]
  const carve = (d: THREE.Vector3) => {
    let x = d.x * 0.088, y = d.y * 0.08, z = d.z * 0.075
    y += 0.014 * gauss(d.x, 0.6, 0.18) * gauss(d.y, 0.45, 0.16) // 额段/眉弓隆起
    y += 0.008 * gauss(d.x, -0.2, 0.3) * sstep(0.7, 1, d.y) // 矢状嵴
    let dark = 0
    for (const s of sockets) { const k = gauss(d.distanceTo(s), 0, 0.14); x -= 0.012 * k; dark = Math.max(dark, k) } // 眼窝
    z *= 1 + 0.18 * gauss(d.x, 0.35, 0.25) * gauss(d.y, -0.2, 0.22) // 颧弓外张
    y -= 0.012 * sstep(0, -1, d.y) // 下颌底更平
    return { p: V(x, y, z), dark }
  }
  // 吻部中心线：根部埋进颅腔前下方，向前略下垂；底面基本落在 y≈-0.062 的口裂线上
  const SN0 = 0.025, SN1 = 0.215
  const snoutY = (t: number) => -0.012 - 0.024 * t
  const snoutRV = (t: number) => (0.05 - 0.024 * t) * (1 - 0.15 * sstep(0.85, 1, t))
  const snoutRZ = (t: number) => 0.05 - 0.026 * t * t - 0.004 * t
  {
    const g = new THREE.SphereGeometry(1, 24, 18)
    const pa = g.attributes.position as THREE.BufferAttribute, col: number[] = []
    const d = new THREE.Vector3()
    for (let i = 0; i < pa.count; i++) {
      d.fromBufferAttribute(pa, i).normalize()
      const { p, dark } = carve(d)
      pa.setXYZ(i, p.x, p.y, p.z)
      const c = 0.92 - dark * 0.45
      col.push(c, c, c)
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals()
    const snout = sweep([0, 0.33, 0.66, 1].map((t) => V(SN0 + (SN1 - SN0) * t, snoutY(t), 0)), (t, d, cs, sn) => {
      const rz = snoutRZ(t), rv = snoutRV(t)
      const bridge = d.y > 0.6 ? 0.004 * Math.sin(t * Math.PI) : 0 // 鼻梁
      const flat = d.y < -0.5 ? 0.82 : 1 // 平直下缘
      return rz * ell(cs, sn, rv / rz, 1) * flat * (t > 0.92 ? Math.sqrt(Math.max(0.05, 1 - (t - 0.92) / 0.08 * 0.75)) : 1) + bridge
    }, { radial: 14, seg: 14, vRep: 1, shade: (t, d) => (d.y < -0.4 ? 0.78 : 0.9) - 0.08 * sstep(0.7, 1, t) + (d.y > 0.7 ? 0.04 : 0) })
    const nose = sweep([V(SN1 - 0.012, snoutY(1) + 0.012, 0), V(SN1 + 0.008, snoutY(1) + 0.006, 0)], (t, _d, cs, sn) => 0.019 * cap(t, 0.35) * ell(cs, sn, 0.75, 1.15), { radial: 10, seg: 5, shade: () => 0.22 })
    head.add(new THREE.Mesh(merge([g, snout, nose]), skin))
    const eyes = new THREE.Mesh(merge(sockets.map((s) => { const q = carve(s).p.multiplyScalar(0.93); return new THREE.SphereGeometry(0.021, 10, 8).scale(0.55, 0.85, 1).translate(q.x, q.y, q.z) })), eyeM)
    eyes.userData.face = 1; head.add(eyes)
    // 上牙列：沿吻部的 U 形齿弓，前门齿短、犬齿最长、后排臼齿
    const up: THREE.BufferGeometry[] = []
    for (let i = 0; i < 17; i++) {
      const u = i / 16 * 2 - 1, au = Math.abs(u)
      const x = SN1 - 0.012 - au * au * 0.16, z = u * 0.034
      const len = 0.016 + 0.02 * gauss(au, 0.3, 0.1) + 0.006 * (1 - au)
      up.push(new THREE.ConeGeometry(0.0055, len, 5).rotateX(Math.PI).translate(x, -0.058 - len / 2, z))
    }
    const upper = new THREE.Mesh(merge(up), toothM); upper.userData.face = 1; head.add(upper)
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8).scale(0.09, 0.012, 0.03).translate(0.12, -0.064, 0), mouthM); mouth.userData.face = 1; head.add(mouth)
    // 犬耳：宽底三角，竖立略外撇
    for (const z of [-1, 1]) {
      const ear = new THREE.Mesh(sweep([V(0, 0, 0), V(-0.012, 0.055, z * 0.014), V(-0.03, 0.115, z * 0.026)], (t, _dd, cs, sn) => 0.05 * (1 - t) ** 0.85 * cap(t, 0.06) * ell(cs, sn, 0.22, 1), { radial: 8, seg: 8, shade: (t) => 0.72 + t * 0.18 }), skin)
      ear.position.set(-0.025, 0.06, z * 0.052); ear.rotation.x = z * 0.3
      head.add(ear)
      if (z < 0) grp.userData.earL = ear; else grp.userData.earR = ear
    }
    // 下颌（可开合）：与吻部等长，下缘略弧
    const jaw = new THREE.Group(); jaw.position.set(0.02, -0.066, 0); head.add(jaw)
    jaw.add(new THREE.Mesh(sweep([V(-0.03, 0.004, 0), V(0.06, -0.008, 0), V(0.14, -0.006, 0), V(SN1 - 0.03, 0.002, 0)], (t, _dd, cs, sn) => {
      const rz = 0.045 - 0.025 * t, rv = 0.026 - 0.012 * t
      return rz * ell(cs, sn, rv / rz, 1) * cap(t, 0.08)
    }, { radial: 12, seg: 12, shade: (t, d) => (d.y < 0 ? 0.76 : 0.88) + 0.06 * t }), skin))
    const lo: THREE.BufferGeometry[] = []
    for (let i = 0; i < 15; i++) {
      const u = i / 14 * 2 - 1, au = Math.abs(u)
      const x = SN1 - 0.04 - au * au * 0.15, z = u * 0.029
      const len = 0.014 + 0.016 * gauss(au, 0.3, 0.1) + 0.004 * (1 - au)
      lo.push(new THREE.ConeGeometry(0.005, len, 5).translate(x, 0.008 + len / 2, z))
    }
    const lower = new THREE.Mesh(merge(lo), toothM); lower.userData.face = 1; jaw.add(lower)
    grp.userData.jaw = jaw
    // 头发：低模头套壳，按雕刻后的颅骨外扩 13% 贴合；前额只留刘海，两侧直垂盖过脸颊，后脑沿颈背铺下（不穿进颈部）
    {
      const rows = 7, cols = 20, skull = 4
      const hairG = shell(rows, cols, (i, j) => {
        const th = (j / cols) * Math.PI * 2 - Math.PI
        const c0 = Math.cos(th), s0 = Math.sin(th)
        const f = sstep(0.3, 0.8, c0), b = sstep(0.1, 0.7, -c0)
        const phiMin = (-6 * (1 - f - b) + 32 * b + 38 * f) * Math.PI / 180, phiMax = 80 * Math.PI / 180
        const ii = Math.min(i, skull)
        const phi = phiMax + (phiMin - phiMax) * (ii / skull)
        const dir = V(Math.cos(phi) * c0, Math.sin(phi), Math.cos(phi) * s0)
        const p = carve(dir).p.multiplyScalar(1.13).add(V(0, 0.004, 0))
        if (i <= skull) return p
        const step = (i - skull) / (rows - skull)
        const len = (0.22 * (1 - f) + 0.025) * jit[j % cols]
        const dd = V(-1.0 * b + c0 * 0.12 * (1 - b), -(1 - b) - 0.16 * b, s0 * 0.14 * (1 - b)).normalize()
        return p.addScaledVector(dd, len * step)
      }, (i, j) => [j / cols * 2, i <= skull ? (i / skull) * 0.45 : 0.45 + ((i - skull) / (rows - skull)) * 0.53], (i) => 0.8 + 0.2 * (1 - i / rows))
      head.add(new THREE.Mesh(hairG, hair))
    }
  }
  // ---------- 四肢：平滑肌肉段 + 长指/趾 + 弯爪 ----------
  const legs: HoundRig['legs'] = []
  const digits = (wrist: THREE.Vector3, front: boolean) => {
    const skinG: THREE.BufferGeometry[] = [], clawG: THREE.BufferGeometry[] = []
    const palmEnd = wrist.clone().add(V(front ? 0.075 : 0.13, -0.035, 0))
    skinG.push(sweep([wrist, wrist.clone().lerp(palmEnd, 0.5).add(V(0, 0.004, 0)), palmEnd], (t, _d, cs, sn) => (front ? 0.03 : 0.034) * (1 - 0.25 * t) * (t < 0.5 ? 1 : cap(t, 0.15)) * ell(cs, sn, 0.45, 1), { radial: 10, seg: 8, shade: () => 0.85 }))
    for (let i = 0; i < 4; i++) {
      const z = (i - 1.5) * (front ? 0.017 : 0.019), L = (front ? 0.085 : 0.055) * (1 - Math.abs(i - 1.5) * 0.12)
      const a = palmEnd.clone().add(V(-0.01, 0, z)), b = a.clone().add(V(L * 0.6, 0.004, z * 0.35)), c = a.clone().add(V(L, -0.012, z * 0.6))
      skinG.push(sweep([a, b, c], (t, _d, cs, sn) => 0.0085 * (1 - 0.3 * t) * (1 + 0.25 * gauss(t, 0.5, 0.08)) * cap(t, 0.12) * ell(cs, sn, 0.85, 1), { radial: 6, seg: 6, shade: (t) => 0.8 + 0.1 * Math.cos(t * 9) }))
      const ce = c.clone().add(V(front ? 0.05 : 0.035, -0.008, z * 0.2)), cm = c.clone().lerp(ce, 0.5).add(V(0, 0.01, 0))
      clawG.push(sweep([c.clone().add(V(-0.006, 0, 0)), cm, ce.add(V(0, -0.018, 0))], (t, _d, cs, sn) => 0.006 * (1 - t) ** 1.2 * ell(cs, sn, 1, 0.7), { radial: 6, seg: 6, shade: (t) => 0.7 + t * 0.6 }))
    }
    return { skinG, clawG }
  }
  const limb = (front: boolean, side: number) => {
    const hip = new THREE.Group()
    hip.position.set(front ? 0.33 : -0.42, front ? 0.02 : 0.04, side * (front ? 0.12 : 0.105))
    body.add(hip)
    const L1 = front ? 0.34 : 0.36, L2 = front ? 0.3 : 0.38
    const a1 = front ? -0.25 : 0.45
    const p1 = V(Math.sin(a1) * L1, -Math.cos(a1) * L1, side * 0.02)
    const up = front
      ? limbSeg([V(0, 0.03, 0), V(p1.x * 0.5 + 0.01, p1.y * 0.5, p1.z * 0.5), p1.clone().add(V(0, -0.02, 0))], 0.05, 0.03, 0.35, 0.28, 0.85)
      : limbSeg([V(0.02, 0.04, 0), V(p1.x * 0.5 + 0.03, p1.y * 0.5, p1.z * 0.5), p1.clone().add(V(-0.01, -0.02, 0))], 0.078, 0.038, 0.3, 0.3, 0.8)
    // 肘/膝：骨突关节块，填平上下段之间的缝
    const jr = front ? 0.036 : 0.046
    const joint = new THREE.SphereGeometry(jr, 10, 8).scale(1, 1.15, 0.9).translate(p1.x, p1.y - 0.005, p1.z)
    joint.setAttribute('color', new THREE.Float32BufferAttribute(new Array(joint.attributes.position.count * 3).fill(0.95), 3))
    hip.add(new THREE.Mesh(merge([up, joint]), skin))
    const knee = new THREE.Group(); knee.position.copy(p1); hip.add(knee)
    const a2 = front ? 0.3 : -0.6
    const p2 = V(Math.sin(a2) * L2, -Math.cos(a2) * L2, 0)
    const lo = front
      ? limbSeg([V(0, 0.015, 0), p2.clone().multiplyScalar(0.5).add(V(-0.008, 0, 0)), p2], 0.034, 0.022, 0.3, 0.25, 0.85, false)
      : limbSeg([V(0, 0.015, 0), p2.clone().multiplyScalar(0.5).add(V(0.01, 0, 0)), p2], 0.042, 0.026, 0.35, 0.22, 0.8, false)
    const { skinG, clawG } = digits(p2.clone().add(V(0, -0.005, 0)), front)
    const sole = new THREE.Box3()
    for (const geo of [...skinG, ...clawG]) { geo.computeBoundingBox(); sole.union(geo.boundingBox!) }
    sole.translate(p2.clone().negate())
    knee.add(new THREE.Mesh(merge([lo, ...skinG]), skin))
    knee.add(new THREE.Mesh(merge(clawG), claw))
    legs.push({ hip, knee, front, side, sole })
  }
  limb(true, -1); limb(true, 1); limb(false, -1); limb(false, 1)
  const rig: HoundRig = { body, head, jaw: grp.userData.jaw, tail, legs, earL: grp.userData.earL, earR: grp.userData.earR }
  grp.userData.houndRig = rig
  grp.userData.houndNeutral = neutral
  return grp
}

export function animateHound(grp: THREE.Group, e: Entity, time: number, gz: number) {
  const r = grp.userData.houndRig as HoundRig | undefined
  if (!r) return
  const s = e.hd
  const t = time + e.id * 0.9
  const crouch = s?.crouch ?? 0, howl = s?.howlPose ?? 0, sit = s?.sit ?? 0, jaw = s?.jaw ?? 0
  const moving = e.state !== 'stunned' && s?.phase !== 'sit' && s?.phase !== 'howl' && s?.phase !== 'watch'
    && (e.state === 'chase' || e.state === 'wander' || e.state === 'investigate')
  const fast = e.state === 'chase' && s?.phase === 'charge'
  const g = e.animT * (fast ? 5.2 : 6.5)
  const amp = moving ? (fast ? 0.75 : 0.42) : 0
  // Pose the torso first; planar two-bone IK then keeps wrists at floor height.
  // No geometry deformation, raycasts or additional render objects per frame.
  r.body.position.y = 0.66 - crouch * 0.07 - sit * 0.12 + Math.abs(Math.sin(g)) * amp * 0.05
  r.body.rotation.z = sit * 0.42 + (fast ? Math.sin(g * 2) * 0.05 : 0) - crouch * 0.05
  const bodyAngle = r.body.rotation.z, cb = Math.cos(bodyAngle), sb = Math.sin(bodyAngle)
  // 对角步态：左前+右后同相；支撑脚接地、摆动脚抬起。
  for (const L of r.legs) {
    const ph = (L.front ? (L.side < 0 ? 0 : Math.PI) : (L.side < 0 ? Math.PI : 0)) + (fast && !L.front ? 0.6 : 0) // 冲锋时近似跳跃步（后肢略滞后）
    const l1 = L.front ? .34 : .36, l2 = L.front ? .3 : .38
    const a1 = L.front ? -.25 : .45, a2 = L.front ? .3 : -.6
    const hipX = cb * L.hip.position.x - sb * L.hip.position.y
    const hipY = r.body.position.y + sb * L.hip.position.x + cb * L.hip.position.y
    const restX = L.hip.position.x + Math.sin(a1)*l1 + Math.sin(a2)*l2
    const dx = restX + (L.front ? 0 : sit*.24) + Math.sin(g+ph)*amp*.22 - hipX
    const lift = Math.max(0,Math.cos(g+ph))*amp*.16
    let footY = .06
    // Three bounded iterations account for toe length as the ankle rotates.
    for (let i=0;i<3;i++) {
      const dy = footY + lift - hipY
      const reach = Math.max(Math.abs(l1-l2)+.001,Math.min(l1+l2-.001,Math.hypot(dx,dy)))
      const spread = Math.acos(Math.max(-1,Math.min(1,(l1*l1+reach*reach-l2*l2)/(2*l1*reach))))
      const axis = Math.atan2(dy,dx), upper = axis + (L.front ? -spread : spread)
      const lower = Math.atan2(Math.sin(axis)*reach-Math.sin(upper)*l1,Math.cos(axis)*reach-Math.cos(upper)*l1)
      L.hip.rotation.z = upper - (a1-Math.PI/2) - bodyAngle
      L.knee.rotation.z = lower - (a2-Math.PI/2) - L.hip.rotation.z - bodyAngle
      const c = Math.cos(lower-(a2-Math.PI/2)), sn = Math.sin(lower-(a2-Math.PI/2))
      footY = .005 - Math.min(L.sole.min.x*sn,L.sole.max.x*sn) - Math.min(L.sole.min.y*c,L.sole.max.y*c)
    }
  }
  grp.position.y = gz
  // 头：嚎叫仰头 / 伏低时压低 / 闲时转动张望
  r.head.rotation.z = howl * 1.25 - crouch * 0.35 - sit * 0.25 + (fast ? -0.15 : 0)
  r.head.rotation.y = moving || howl > 0.1 ? 0 : Math.sin(t * 0.5) * 0.5
  r.head.rotation.x = (s?.phase === 'watch' || s?.phase === 'sit') ? Math.sin(t * 0.7) * 0.25 : 0 // 歪头打量
  r.jaw.rotation.z = -jaw * 0.55 - Math.max(0, Math.sin(t * 9)) * 0.08 * (fast ? 1 : 0)
  // 耳：伏低时贴后，中立/警觉时竖起
  const earBack = crouch * 0.9
  r.earL.rotation.z = 0.1 + earBack; r.earR.rotation.z = 0.1 + earBack
  // 尾：中立摇尾、伏低夹尾、冲锋拖直
  r.tail.rotation.y = (s?.wag ?? 0) > 0 ? Math.sin(t * 7) * 0.45 : Math.sin(t * 1.3) * 0.08
  r.tail.rotation.z = -crouch * 0.5 + (fast ? 0.3 : 0) + sit * -0.3
}

// v63：钝人等后续重制模型复用的扫掠/壳体/程序化贴图工具
export { rng, merge, V, gauss, sstep, cap, ell, sweep, limbSeg, shell, canvasTex }
export type { RF }
