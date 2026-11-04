// [maid] 管家头部 v2：按 ZAN 附图还原——多边形浮雕壳 + 手绘贴图（插画线稿风）。
// 造型（附图正面）：顶部两只向外下垂的大眼瓣（螳螂头的复眼位），眼瓣内下侧各画一只半睁、眼皮沉重的人眼；
// 中间是倒五边形的脸盾收成尖下巴，额头一道竖线、脸中一道横缝、下面一道短竖线，两颊各一道斜线；
// 眼瓣与脸交界的下沿各垂一个小卷钩；头顶是中分的深棕头发，上面戴白帽。
// 做法：在附图像素坐标里描出头部轮廓（右半边，左边镜像），在包围盒内铺网格，轮廓外的顶点吸附到轮廓上；
// 正面按「脸盾 + 两个眼瓣圆顶」的高度场鼓起，背面做较浅的后脑壳，二者在轮廓上合拢成闭合壳。
// 正面 UV 是附图坐标的平面投影，贴图用 Canvas 按同一坐标绘制（Node 下无 DOM 时退化为纯肉色）。
import * as THREE from 'three'
import { litMaterial } from './shared'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smax = (a: number, b: number, k: number) => { const h = Math.max(0, Math.min(1, 0.5 + (a - b) / (2 * k))); return lerp(b, a, h) + k * h * (1 - h) }
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

/** 附图像素 → 头部局部坐标（米）：头宽 0.25 m，原点在下巴尖，x 向观者右，y 向上 */
export const HEAD_REF = { cx: 405, chinY: 525, s: 0.25 / 575, bx0: 110, bx1: 700, by0: 60, by1: 535 }
const toL = (X: number, Y: number) => [(X - HEAD_REF.cx) * HEAD_REF.s, (HEAD_REF.chinY - Y) * HEAD_REF.s] as const

// 右半边轮廓（附图像素，从头顶中线顺时针到下巴尖）
const RIGHT: [number, number][] = [
  [405, 148], [450, 142], [500, 136], [560, 128], [615, 138], [660, 165], [688, 210], [692, 262], [676, 310],
  [645, 322], [600, 340], [560, 352], [545, 362], [534, 385], [520, 418], [500, 450], [472, 484], [440, 510], [405, 526],
]
const RAW_OUTLINE: [number, number][] = [...RIGHT, ...RIGHT.slice(1, -1).map(([x, y]) => [2 * HEAD_REF.cx - x, y] as [number, number]).reverse()] // 右半（顶→下巴）接左半（下巴→顶）
/** 闭合 Catmull-Rom 重采样，轮廓变成平滑曲线（否则每段直线会在侧面形成一块平面） */
export const HEAD_OUTLINE: [number, number][] = (() => {
  const P = RAW_OUTLINE.map(([x, y]) => new THREE.Vector3(x, y, 0)); P.pop() // 下巴尖只留一个（RIGHT 末点）
  const c = new THREE.CatmullRomCurve3(RAW_OUTLINE.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal', 0.5)
  return c.getSpacedPoints(240).slice(0, -1).map((v) => [v.x, v.y] as [number, number])
})()

function inside(x: number, y: number, P: [number, number][]) {
  let c = false
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c }
  return c
}
function nearest(x: number, y: number, P: [number, number][]): [number, number, number] {
  let best = 1e9, bx = x, by = y
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, ay] = P[j], [cx, cy] = P[i], dx = cx - ax, dy = cy - ay, l2 = dx * dx + dy * dy
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)), px = ax + dx * t, py = ay + dy * t, d = Math.hypot(x - px, y - py)
    if (d < best) { best = d; bx = px; by = py }
  }
  return [bx, by, best]
}
/** 正面高度（米），X/Y 为附图像素 */
function frontZ(X: number, Y: number, edge: number) {
  const s = HEAD_REF.s
  const dx = Math.abs(X - HEAD_REF.cx)
  // 脸盾：中线最高，向两侧和下巴收；额头略鼓
  const tY = (HEAD_REF.chinY - Y) / 380
  const face = 0.045 * Math.max(0, 1 - (dx / lerp(120, 170, sstep(0, 0.6, tY))) ** 2) + 0.018 * sstep(0.1, 0.8, tY)
  // 两个眼瓣圆顶（中心偏外上）
  const lx = dx - 205, ly = Y - 238, dl = Math.hypot(lx / 1.1, ly) / 108
  const lobe = 0.06 * Math.sqrt(Math.max(0, 1 - dl * dl)) + 0.004
  let z = smax(face, lobe, 0.02) + 0.008
  // 眼瓣与脸交界处一道浅沟（附图里的分界线）
  const groove = Math.exp(-(((dx - 95 - Math.max(0, Y - 150) * 0.24) / 9) ** 2)) * sstep(170, 230, Y) * (1 - sstep(340, 360, Y))
  z -= groove * 0.006
  const k = Math.sqrt(Math.min(1, edge / 60) * (2 - Math.min(1, edge / 60))) // 圆弧形收边 // 轮廓处收成 0，形成圆润边
  return z * k + 0 * s
}
function backZ(X: number, Y: number, edge: number) {
  const dx = Math.abs(X - HEAD_REF.cx), tY = (HEAD_REF.chinY - Y) / 380
  const skull = 0.1 * Math.sqrt(Math.max(0, 1 - (dx / 200) ** 2)) * sstep(0.0, 0.45, tY) * (1 - 0.25 * sstep(0.75, 1.05, tY)) // 后脑：中下部最厚，颈从这里接入
  const lx = dx - 200, ly = Y - 250, dl = Math.hypot(lx / 1.05, ly) / 112
  const lobe = 0.055 * Math.sqrt(Math.max(0, 1 - dl * dl))
  return -(smax(skull, lobe, 0.03) + 0.012) * Math.sqrt(Math.min(1, edge / 70) * (2 - Math.min(1, edge / 70)))
}

function shell(front: boolean, nx = 84, ny = 68) {
  const R = HEAD_REF, P = HEAD_OUTLINE
  const pos: number[] = [], uv: number[] = [], idx: number[] = [], out: boolean[] = []
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    let X = lerp(R.bx0, R.bx1, i / nx), Y = lerp(R.by0, R.by1, j / ny)
    const isIn = inside(X, Y, P)
    const [qx, qy, d] = nearest(X, Y, P)
    if (!isIn) { X = qx; Y = qy }
    const edge = isIn ? d : 0
    const z = front ? frontZ(X, Y, edge) : backZ(X, Y, edge)
    const [x, y] = toL(X, Y)
    pos.push(x, y, z); uv.push((X - R.bx0) / (R.bx1 - R.bx0), 1 - (Y - R.by0) / (R.by1 - R.by0)); out.push(!isIn)
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1
    if (out[a] && out[b] && out[c] && out[d]) continue
    // 正面：观者从 +Z 看，屏幕 y 向下对应网格 j 增大
    if (front) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals()
  return g
}

// ---------- 贴图 ----------
let faceTex: THREE.Texture | null = null
const INK = '#2b1a14', SKIN = '#e4bba2'
function paintFace(): THREE.Texture | null {
  if (faceTex || typeof document === 'undefined') return faceTex
  const R = HEAD_REF, Wc = 1024, k = Wc / (R.bx1 - R.bx0), Hc = Math.round((R.by1 - R.by0) * k)
  const c = document.createElement('canvas'); c.width = Wc; c.height = Hc
  const g = c.getContext('2d')!
  g.setTransform(k, 0, 0, k, -R.bx0 * k, -R.by0 * k) // 之后全部用附图像素坐标绘制
  // 底色 + 轻微纸张颗粒（插画质感）
  g.fillStyle = SKIN; g.fillRect(R.bx0 - 10, R.by0 - 10, R.bx1 - R.bx0 + 20, R.by1 - R.by0 + 20)
  for (let i = 0; i < 2600; i++) { const x = R.bx0 + ((i * 97.13) % (R.bx1 - R.bx0)), y = R.by0 + ((i * 53.71 * 1.3) % (R.by1 - R.by0)); g.fillStyle = `rgba(120,70,50,${0.03 + ((i * 7) % 5) * 0.008})`; g.fillRect(x, y, 1.6, 1.6) }
  // 眼瓣外下缘与下巴的柔和暗部
  const shade = (x: number, y: number, r: number, a: number) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(160,100,78,${a})`); gr.addColorStop(1, 'rgba(160,100,78,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2) }
  for (const m of [1, -1]) { const X = (x: number) => R.cx + (x - R.cx) * m; shade(X(660), 320, 70, 0.35); shade(X(560), 370, 50, 0.3); shade(X(470), 470, 60, 0.18) }
  const line = (pts: number[][], w = 3, col = INK) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) { const p = pts[i]; if (p.length === 4) g.quadraticCurveTo(p[0], p[1], p[2], p[3]); else g.lineTo(p[0], p[1]) } g.stroke() }
  // 中线：额头竖线、横缝、下方短竖线
  line([[402, 165], [400, 235]], 2.6)
  line([[315, 296], [360, 300, 405, 299], [450, 298, 492, 294]], 2.6)
  line([[398, 330], [397, 382]], 2.4)
  for (const m of [1, -1]) {
    g.save(); if (m < 0) { g.translate(2 * R.cx, 0); g.scale(-1, 1) }
    // 眼瓣与脸盾的分界线（从头顶一路落到下沿卷钩处）
    line([[498, 148], [500, 250, 550, 350], [545, 366, 536, 386]], 2.8)
    // 颊线
    line([[494, 330], [490, 360, 478, 392]], 2.4)
    // 眼睛（附图：半睁、眼皮沉重下垂，外眼角像眼线一样拖出尖尾；内眼角几道细纹）
    // 附图风格：窄长、外端下垂；眼内几乎全是深色大瞳，只在内眼角露一点白；上眼皮是一道粗墨线，外端收成拖尾；
    // 内眼角下方几道斜向细纹
    g.save(); g.translate(588, 252); g.scale(1.28, 1.28); g.translate(-588, -288)
    const almond = () => { g.beginPath(); g.moveTo(540, 274); g.quadraticCurveTo(585, 264, 632, 298); g.quadraticCurveTo(598, 326, 548, 292); g.closePath() }
    g.fillStyle = '#1e100b'; almond(); g.fill()
    g.save(); almond(); g.clip()
    g.fillStyle = '#efe2d2'; g.beginPath(); g.ellipse(549, 284, 10, 8, 0.3, 0, Math.PI * 2); g.fill() // 内眼角眼白
    g.fillStyle = 'rgba(255,245,230,0.95)'; g.beginPath(); g.ellipse(568, 285, 3.6, 2.8, 0, 0, Math.PI * 2); g.fill() // 高光
    g.restore()
    g.fillStyle = INK; g.beginPath(); g.moveTo(534, 278); g.quadraticCurveTo(584, 260, 630, 290); g.quadraticCurveTo(648, 298, 660, 306); g.quadraticCurveTo(640, 304, 626, 298); g.quadraticCurveTo(584, 274, 540, 284); g.closePath(); g.fill() // 上眼皮 + 拖尾
    line([[546, 266], [586, 252, 624, 274]], 1.8, '#5a3528') // 眼皮褶
    for (const [x0, y0, x1, y1] of [[548, 296, 532, 312], [557, 302, 543, 320], [568, 308, 556, 328], [581, 312, 573, 332]]) line([[x0, y0], [x1, y1]], 1.7)
    g.restore()
    // 下沿的小卷钩（3D 卷钩另有实体，这里补墨线阴影）
    line([[534, 388], [540, 406, 524, 414], [508, 418, 512, 406]], 3)
    g.restore()
  }
  // 轮廓墨线
  
  faceTex = new THREE.CanvasTexture(c); faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.anisotropy = 4
  return faceTex
}

let backTex: THREE.Texture | null = null
/** 背面/侧面贴图：与正面同色的肤底 + 同样的颗粒，四周压一点暗，使正背接缝处颜色连续 */
function paintBack(): THREE.Texture | null {
  if (backTex || typeof document === 'undefined') return backTex
  const R = HEAD_REF, Wc = 512, k = Wc / (R.bx1 - R.bx0), Hc = Math.round((R.by1 - R.by0) * k)
  const c = document.createElement('canvas'); c.width = Wc; c.height = Hc; const g = c.getContext('2d')!
  g.setTransform(k, 0, 0, k, -R.bx0 * k, -R.by0 * k)
  g.fillStyle = SKIN; g.fillRect(R.bx0 - 10, R.by0 - 10, R.bx1 - R.bx0 + 20, R.by1 - R.by0 + 20)
  for (let i = 0; i < 2600; i++) { const x = R.bx0 + ((i * 97.13) % (R.bx1 - R.bx0)), y = R.by0 + ((i * 53.71 * 1.3) % (R.by1 - R.by0)); g.fillStyle = `rgba(120,70,50,${0.03 + ((i * 7) % 5) * 0.008})`; g.fillRect(x, y, 1.6, 1.6) }
  const gr = g.createRadialGradient(R.cx, 330, 40, R.cx, 330, 260); gr.addColorStop(0, 'rgba(150,95,72,0.22)'); gr.addColorStop(1, 'rgba(150,95,72,0)'); g.fillStyle = gr; g.fillRect(R.bx0, R.by0, R.bx1 - R.bx0, R.by1 - R.by0)
  // 后脑中缝与眼瓣背面的分界细线（和正面同一套墨线语言）
  g.strokeStyle = 'rgba(43,26,20,0.55)'; g.lineWidth = 2; g.lineCap = 'round'
  g.beginPath(); g.moveTo(R.cx, 150); g.lineTo(R.cx, 330); g.stroke()
  for (const m of [1, -1]) { g.beginPath(); g.moveTo(R.cx + 92 * m, 150); g.quadraticCurveTo(R.cx + 100 * m, 260, R.cx + 140 * m, 350); g.stroke() }
  backTex = new THREE.CanvasTexture(c); backTex.colorSpace = THREE.SRGBColorSpace; return backTex
}

export interface MaidHeadParts { eyeL: THREE.Group; eyeR: THREE.Group; hookL: THREE.Group; hookR: THREE.Group; mandL: THREE.Group; mandR: THREE.Group; antL: THREE.Group; antR: THREE.Group; hair: THREE.Mesh }
/** 建在 head 枢轴下（原点=下巴尖附近的颈接处，脸朝 +Z）。返回动画用部件。 */
export function buildMaidHead(head: THREE.Group, capMats: { white: THREE.Material; ribbon: THREE.Material }): MaidHeadParts {
  const tex = paintFace()
  const frontMat = litMaterial(tex ? { color: '#ffffff', map: tex, roughness: 0.75 } : { color: SKIN, roughness: 0.75 })
  const bt = paintBack(); const backMat = litMaterial(bt ? { color: '#ffffff', map: bt, roughness: 0.75 } : { color: SKIN, roughness: 0.75 })
  const add = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = head) => { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o }
  add(shell(true), frontMat); add(shell(false), backMat)
  // 头发：中分的两团深棕发髻壳，压在头顶眼瓣之间（附图 230–560 × 75–185）
  const hairMat = litMaterial({ color: '#3b2419', roughness: 0.8 })
  const hg: THREE.BufferGeometry[] = []
  for (const m of [1, -1]) {
    const g = new THREE.SphereGeometry(1, 24, 14)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x * 0.058 + m * 0.03, y * 0.028, z * 0.075 - 0.02) }
    g.computeVertexNormals(); hg.push(g)
  }
  const hair = new THREE.Group(); hair.position.set(0, toL(0, 140)[1], 0); head.add(hair)
  const hairMeshes = hg.map((g) => add(g, hairMat, hair))
  // 白帽：头发之上的软帽 + 黑缎带
  const cap = new THREE.Group(); cap.position.set(0, toL(0, 108)[1], -0.035); cap.rotation.x = -0.35; head.add(cap)
  { const g = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.5); const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x); const kk = 1 + 0.05 * Math.sin(a * 14) * (1 - y); p.setXYZ(i, x * 0.07 * kk, y * 0.04, z * 0.06 * kk) }
    g.computeVertexNormals(); add(g, capMats.white, cap) }
  add(new THREE.TorusGeometry(0.068, 0.005, 6, 36).rotateX(Math.PI / 2).scale(1, 1, 0.86), capMats.ribbon, cap).position.y = 0.006
  // 眼睛枢轴（阶段 2 眨眼用：在眼位放一片可缩放的眼皮）
  const eye = (m: number) => { const e = new THREE.Group(); const [x, y] = toL(R(m, 582), 252); e.position.set(x, y, frontZ(R(m, 582), 252, 99) + 0.0015); e.name = m > 0 ? 'eyeL' : 'eyeR'; head.add(e)
    const lid = new THREE.Mesh(new THREE.CircleGeometry(1, 20), litMaterial({ color: '#cf9e84', roughness: 0.75 })); lid.scale.set(0.019, 0.0001, 1); lid.position.y = 0.004; lid.name = 'lid'; lid.visible = false; e.add(lid); return e }
  const R = (m: number, X: number) => HEAD_REF.cx + (X - HEAD_REF.cx) * m
  // 下沿卷钩（附图眼瓣下角那对 ~ 形小钩）
  const hook = (m: number) => { const h = new THREE.Group(); const [x, y] = toL(R(m, 536), 388); h.position.set(x, y, 0.004); h.name = m > 0 ? 'hookL' : 'hookR'; head.add(h)
    const pts = [[0, 0, 0], [0.002, -0.007, 0.002], [-0.001, -0.013, 0.003], [-0.007, -0.016, 0.003], [-0.011, -0.012, 0.002], [-0.009, -0.008, 0.001]].map(([a, b, cz]) => new THREE.Vector3(a * m, b, cz))
    h.scale.setScalar(1.5); add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.0016, 6), litMaterial({ color: '#6e4434', roughness: 0.6 }), h); return h }
  // 颚状口器（附图）：下巴两侧各垂一根扁平细长的淡色獠牙状上颚，上宽下尖，微向内收，尖端墨色
  let tuskTex: THREE.Texture | null = null
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d')!
    g.fillStyle = '#ead3bd'; g.fillRect(0, 0, 64, 256)
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(150,100,78,0.45)'); gr.addColorStop(0.25, 'rgba(150,100,78,0)'); gr.addColorStop(0.8, 'rgba(60,35,25,0)'); gr.addColorStop(1, 'rgba(40,22,15,0.95)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 256)
    g.strokeStyle = INK; g.lineWidth = 5; g.strokeRect(1, -4, 62, 264)
    tuskTex = new THREE.CanvasTexture(c); tuskTex.colorSpace = THREE.SRGBColorSpace
  }
  const tuskMat = litMaterial(tuskTex ? { color: '#ffffff', map: tuskTex, roughness: 0.6 } : { color: '#ead3bd', roughness: 0.6 })
  const mand = (m: number) => {
    // 附图右獠牙（像素）：根部 480–525 @ y≈480，尖端 (442, 672)
    const root = toL(R(m, 500), 478), j = new THREE.Group(); j.position.set(root[0], root[1], 0.006); j.name = m > 0 ? 'mandL' : 'mandR'; head.add(j)
    const P = (X: number, Y: number) => { const q = toL(R(m, X), Y); return new THREE.Vector2(q[0] - root[0], q[1] - root[1]) }
    const pts = [P(476, 470), P(470, 540), P(456, 620), P(442, 674), P(452, 616), P(486, 540), P(528, 474)]
    const sh = new THREE.Shape(); sh.moveTo(pts[0].x, pts[0].y)
    sh.splineThru(pts.slice(1, 4)); sh.splineThru(pts.slice(4)); sh.closePath()
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.001, bevelSegments: 2, curveSegments: 12 })
    geo.translate(0, 0, -0.0015)
    { geo.computeBoundingBox(); const bb = geo.boundingBox!, p = geo.attributes.position, uv = geo.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < p.count; i++) { const y = p.getY(i), x = p.getX(i); const t = (y - bb.min.y) / (bb.max.y - bb.min.y); const half = lerp(0.002, 0.012, t); const cxv = lerp(P(442, 674).x, 0, t); uv.setXY(i, 0.5 + (x - cxv) / (2 * half) * 0.5, t) } uv.needsUpdate = true }
    if (m < 0) { const ix = geo.index; if (ix) for (let i = 0; i < ix.count; i += 3) { const t = ix.getX(i); ix.setX(i, ix.getX(i + 1)); ix.setX(i + 1, t) } }
    geo.computeVertexNormals()
    const blade = add(geo, tuskMat, j); blade.rotation.x = -0.22 // 尖端略向前翘出领口
    return j
  }
  // 头顶两根细长触须：从发际中缝两侧伸出，向上再向外弯，末端细
  const antMat = litMaterial({ color: '#3a2219', roughness: 0.6 })
  const antenna = (m: number) => {
    const [x, y] = toL(R(m, 430), 128), a = new THREE.Group(); a.position.set(x, y, -0.01); a.name = m > 0 ? 'antL' : 'antR'; head.add(a)
    const curve = new THREE.CatmullRomCurve3([[0, 0, 0], [0.015, 0.05, -0.006], [0.05, 0.11, -0.015], [0.11, 0.16, -0.025], [0.18, 0.18, -0.03], [0.24, 0.165, -0.03]].map(([px, py, pz]) => new THREE.Vector3(px * m, py, pz)))
    const g = new THREE.TubeGeometry(curve, 40, 1, 6)
    { const p = g.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) { const t = Math.floor(i / 7) / 40, c = curve.getPointAt(Math.min(1, t)), rad = lerp(0.0022, 0.0007, t); p.setXYZ(i, c.x + (p.getX(i) - c.x) * rad, c.y + (p.getY(i) - c.y) * rad, c.z + (p.getZ(i) - c.z) * rad) } g.computeVertexNormals() }
    add(g, antMat, a); return a
  }
  return { eyeL: eye(1), eyeR: eye(-1), hookL: hook(1), hookR: hook(-1), mandL: mand(1), mandR: mand(-1), antL: antenna(1), antR: antenna(-1), hair: hairMeshes[0] }
}
