// [beast] 第五层的野兽（Entity 18）道具：契约（羊皮纸 + 暗红火漆 + 缎带）、钢笔（黑杆金尖）、画像版的他（2D 贴图，给肖像系统用）。
// 手持道具按「原点 = 握点 / 底面中心，+Y 向上」建造；beastMesh 把契约挂左手、钢笔挂右手（默认隐藏）。茶杯复用办公室 / 行李员的。
import * as THREE from 'three'
import { litMaterial } from './shared'

let parchTex: THREE.Texture | null = null
/** 羊皮纸贴图：泛黄底 + 污渍 + 手写体墨迹行（看不清内容的条款）+ 底部签名线 */
function parchmentTexture() {
  if (parchTex || typeof document === 'undefined') return parchTex
  const W = 512, H = 704, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!
  const gr = g.createRadialGradient(W * 0.45, H * 0.4, 60, W / 2, H / 2, W * 0.75); gr.addColorStop(0, '#e9d9ad'); gr.addColorStop(0.7, '#d6bf86'); gr.addColorStop(1, '#a8874e')
  g.fillStyle = gr; g.fillRect(0, 0, W, H)
  let seed = 18; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let k = 0; k < 26; k++) { const x = rnd() * W, y = rnd() * H, r = 10 + rnd() * 60; const sg = g.createRadialGradient(x, y, 1, x, y, r); sg.addColorStop(0, 'rgba(120,80,30,0.16)'); sg.addColorStop(1, 'rgba(120,80,30,0)'); g.fillStyle = sg; g.fillRect(x - r, y - r, 2 * r, 2 * r) }
  // 标题
  g.fillStyle = '#2a140c'; g.font = 'bold 34px serif'; g.textAlign = 'center'; g.fillText('C O N T R A C T', W / 2, 74)
  g.strokeStyle = '#3a1c10'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(90, 92); g.lineTo(W - 90, 92); g.stroke()
  // 「手写」条款：一行行抖动的墨线
  g.lineCap = 'round'
  for (let y = 132; y < H - 170; y += 25) {
    let x = 58 + (y === 132 ? 30 : 0); const end = W - 58 - (rnd() < 0.15 ? 120 + rnd() * 120 : rnd() * 20)
    g.strokeStyle = `rgba(40,20,10,${0.75 + rnd() * 0.2})`
    while (x < end) {
      const w = 12 + rnd() * 40; g.lineWidth = 1.6 + rnd() * 1.2; g.beginPath()
      for (let t = 0; t <= w; t += 3) g.lineTo(x + t, y + Math.sin((x + t) * 0.45) * 3 + (rnd() - 0.5) * 2)
      g.stroke(); x += w + 6 + rnd() * 8
    }
  }
  // 签名线 + 一个已签的花体签名（他的）+ 一个空位（你的）
  g.strokeStyle = '#2a140c'; g.lineWidth = 1.2
  for (const [x0, x1] of [[60, 230], [282, 452]]) { g.beginPath(); g.moveTo(x0, H - 92); g.lineTo(x1, H - 92); g.stroke() }
  g.lineWidth = 2.4; g.beginPath(); g.moveTo(70, H - 100)
  for (let t = 0; t < 150; t += 2) g.lineTo(70 + t, H - 104 - Math.sin(t * 0.13) * 12 - Math.sin(t * 0.41) * 5)
  g.stroke()
  // 签名处一滴暗红
  g.fillStyle = 'rgba(110,10,16,0.85)'; g.beginPath(); g.ellipse(410, H - 104, 7, 9, 0.3, 0, Math.PI * 2); g.fill()
  parchTex = new THREE.CanvasTexture(c); parchTex.colorSpace = THREE.SRGBColorSpace; parchTex.anisotropy = 4
  return parchTex
}
/** 契约（原点 = 纸面中心，+Y = 纸面法线；纸宽 0.21、长 0.29，轻微卷边）+ 右下角火漆（暗红、压了墨鱼印）+ 两条黑缎带 */
export function buildBeastContract(): THREE.Group {
  const g = new THREE.Group(); g.name = 'beastContract'
  const W = 0.21, H = 0.29, nx = 10, ny = 14
  const geo = new THREE.PlaneGeometry(W, H, nx, ny); geo.rotateX(-Math.PI / 2)
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, 0.006 * Math.pow(Math.abs(z) / (H / 2), 3) + 0.004 * Math.pow(Math.abs(x) / (W / 2), 4)) }
  geo.computeVertexNormals()
  const pm = litMaterial({ color: '#ffffff', map: parchmentTexture() ?? undefined, roughness: 0.9, side: THREE.DoubleSide })
  const sheet = new THREE.Mesh(geo, pm); sheet.castShadow = true; sheet.receiveShadow = true; g.add(sheet)
  // 火漆：扁圆饼 + 边缘溢出的不规则一圈 + 浮雕印
  const wax = litMaterial({ color: '#6e0d14', roughness: 0.3, metalness: 0.05 })
  const seal = new THREE.Group(); seal.name = 'seal'; seal.position.set(W * 0.27, 0.0045, H * 0.36); g.add(seal)
  const lathe = new THREE.LatheGeometry([new THREE.Vector2(0, 0.0042), new THREE.Vector2(0.012, 0.0042), new THREE.Vector2(0.0145, 0.0034), new THREE.Vector2(0.0175, 0.0012), new THREE.Vector2(0.0185, 0)], 28)
  const lp = lathe.attributes.position
  for (let i = 0; i < lp.count; i++) { const x = lp.getX(i), z = lp.getZ(i), r = Math.hypot(x, z); if (r > 0.014) { const a = Math.atan2(z, x), k = 1 + 0.12 * Math.sin(a * 5) + 0.07 * Math.sin(a * 11 + 1); lp.setX(i, x * k); lp.setZ(i, z * k) } }
  lathe.computeVertexNormals()
  seal.add(new THREE.Mesh(lathe, wax))
  // 印：一个小墨鱼头（外套膜 + 两眼 + 三根垂须）浮雕
  const emb = litMaterial({ color: '#8a1a20', roughness: 0.35 })
  const mantle = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 12, 8), emb); mantle.scale.set(1, 0.35, 1.6); mantle.position.set(0, 0.0045, -0.003); seal.add(mantle)
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.0016, 8, 6), emb); e.position.set(s * 0.004, 0.0046, 0.003); seal.add(e) }
  for (const s of [-1, 0, 1]) { const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.0007, 0.006, 3, 6), emb); t.rotation.x = Math.PI / 2; t.rotation.z = s * 0.35; t.position.set(s * 0.0022, 0.0044, 0.0075); seal.add(t) }
  // 缎带（两条黑缎从火漆下垂出纸边）
  const rib = litMaterial({ color: '#141014', roughness: 0.4, side: THREE.DoubleSide })
  for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.PlaneGeometry(0.009, 0.07), rib); r.rotation.x = -Math.PI / 2; r.rotation.z = s * 0.35; r.position.set(W * 0.27 + s * 0.012, 0.003, H * 0.36 + 0.035); g.add(r) }
  g.userData.seal = seal
  return g
}
/** 钢笔（原点 = 握点，+Y = 笔尖方向）：黑漆笔杆、金箍、金笔尖、笔帽套在尾端 */
export function buildBeastPen(): THREE.Group {
  const g = new THREE.Group(); g.name = 'beastPen'
  const black = litMaterial({ color: '#0d0b0c', roughness: 0.15 }), gold = litMaterial({ color: '#c9a24a', roughness: 0.25, metalness: 0.85 })
  const prof = [[0, -0.075], [0.0052, -0.073], [0.0058, -0.06], [0.0058, 0.02], [0.0052, 0.03], [0.0045, 0.042], [0, 0.044]].map(([x, y]) => new THREE.Vector2(x, y))
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 20), black); body.castShadow = true; g.add(body)
  for (const y of [-0.035, 0.018]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.0058, 0.0007, 6, 20), gold); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r) }
  // 笔尖：扁锥 + 中缝
  const nib = new THREE.Mesh(new THREE.ConeGeometry(0.0042, 0.02, 12, 1, false, 0, Math.PI * 2), gold); nib.scale.set(1, 1, 0.35); nib.position.y = 0.053; g.add(nib)
  // 笔夹（尾端）
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.045, 0.0012), gold); clip.position.set(0, -0.045, 0.0066); g.add(clip)
  return g
}

// ======================================================================
// 画像版的他（2D，给肖像系统用）：深色油画 — 半身像、暗场、左侧青光，墨鱼头 + 触须垂在白衬衫领口、黑细领带、近黑酒红西装，
// 胸前右手戒指一点反光；外圈金漆画框（可选）。返回 CanvasTexture；opts.eyes 给眼睛位置（肖像系统做「眼睛跟随」时可以叠瞳孔）
// ======================================================================
export interface BeastPortraitOpts { w?: number; h?: number; frame?: boolean; seed?: number }
export function beastPortraitTexture(opts: BeastPortraitOpts = {}): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const W = opts.w ?? 512, H = opts.h ?? 680, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!
  let seed = opts.seed ?? 1818; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const F = opts.frame === false ? 0 : Math.round(W * 0.07)
  // 背景：暗绿褐油画底 + 左上一团青光
  const bg = g.createRadialGradient(W * 0.32, H * 0.3, 10, W * 0.5, H * 0.5, H * 0.8); bg.addColorStop(0, '#20302c'); bg.addColorStop(0.5, '#0f1513'); bg.addColorStop(1, '#050605')
  g.fillStyle = bg; g.fillRect(0, 0, W, H)
  const sx = W / 512, sy = H / 680, P = (x: number, y: number): [number, number] => [x * sx, y * sy]
  const path = (pts: [number, number][], close = true) => { g.beginPath(); g.moveTo(...P(...pts[0])); for (const p of pts.slice(1)) g.lineTo(...P(...p)); if (close) g.closePath() }
  // 肩 / 西装
  const suit = g.createLinearGradient(...P(60, 0), ...P(460, 0)); suit.addColorStop(0, '#2b1d22'); suit.addColorStop(0.35, '#1a0d11'); suit.addColorStop(1, '#090405')
  g.fillStyle = suit; path([[40, 680], [55, 520], [110, 445], [190, 415], [256, 430], [322, 415], [402, 445], [458, 520], [472, 680]]); g.fill()
  // 白衬衫 V 口 + 领带
  const sh = g.createLinearGradient(...P(200, 0), ...P(320, 0)); sh.addColorStop(0, '#bfe3e0'); sh.addColorStop(0.5, '#e7e3dc'); sh.addColorStop(1, '#a9a49c')
  g.fillStyle = sh; path([[214, 430], [256, 446], [298, 430], [282, 680], [230, 680]]); g.fill()
  g.fillStyle = '#0a090b'; path([[248, 448], [264, 448], [268, 470], [272, 680], [240, 680], [244, 470]]); g.fill()
  // 驳头暗边
  g.strokeStyle = 'rgba(70,40,48,0.8)'; g.lineWidth = 3 * sx; path([[214, 430], [230, 680]], false); g.stroke(); path([[298, 430], [282, 680]], false); g.stroke()
  // 头：外套膜（向右上后方拉长）+ 鳍
  const head = g.createLinearGradient(...P(150, 120), ...P(370, 380)); head.addColorStop(0, '#5e8f86'); head.addColorStop(0.45, '#4a4a40'); head.addColorStop(1, '#1c1715')
  g.fillStyle = head
  path([[205, 360], [180, 300], [178, 240], [196, 170], [232, 110], [276, 70], [318, 58], [330, 78], [320, 128], [312, 190], [322, 250], [318, 318], [300, 362], [256, 380]]); g.fill()
  g.fillStyle = 'rgba(120,170,160,0.35)'; path([[196, 170], [160, 205], [176, 240]]); g.fill(); path([[318, 120], [352, 150], [314, 190]]); g.fill()
  // 色素斑点
  for (let k = 0; k < 500; k++) { const x = 180 + rnd() * 150, y = 70 + rnd() * 300; g.fillStyle = rnd() < 0.7 ? `rgba(30,18,14,${0.25 + rnd() * 0.4})` : `rgba(180,230,220,${0.15 + rnd() * 0.2})`; g.beginPath(); g.arc(...P(x, y), (0.8 + rnd() * 2.2) * sx, 0, Math.PI * 2); g.fill() }
  // 两只眼（侧面大眼，W 形瞳孔）
  const eyes: [number, number][] = [[214, 262], [300, 262]]
  for (const [ex, ey] of eyes) {
    const eg = g.createRadialGradient(...P(ex - 4, ey - 4), 2, ...P(ex, ey), 20 * sx); eg.addColorStop(0, '#e6dca6'); eg.addColorStop(0.7, '#9a9a64'); eg.addColorStop(1, '#202a22')
    g.fillStyle = eg; g.beginPath(); g.ellipse(...P(ex, ey), 20 * sx, 14 * sy, 0, 0, Math.PI * 2); g.fill()
    g.strokeStyle = '#050505'; g.lineWidth = 5 * sx; g.lineJoin = 'round'; path([[ex - 13, ey - 3], [ex - 6, ey + 5], [ex, ey], [ex + 6, ey + 5], [ex + 13, ey - 3]], false); g.stroke()
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(...P(ex - 7, ey - 6), 2.2 * sx, 0, Math.PI * 2); g.fill()
  }
  // 触须：从口周垂到领口，末端卷曲（胡须）
  g.lineCap = 'round'
  for (let k = 0; k < 9; k++) {
    const x0 = 230 + k * 7, y0 = 352, side = k < 4 ? -1 : k > 4 ? 1 : 0, len = 70 + (k % 3) * 18 + (side === 0 ? 40 : 0)
    const tg = g.createLinearGradient(...P(x0, y0), ...P(x0, y0 + len)); tg.addColorStop(0, '#6f8d84'); tg.addColorStop(1, '#3c4b45')
    g.strokeStyle = tg
    g.beginPath(); g.moveTo(...P(x0, y0))
    let x = x0, y = y0, a = Math.PI / 2 - side * 0.25, w = 9
    for (let t = 0; t < len; t += 3) {
      if (t > len * 0.55) a -= side === 0 ? 0.12 : side * 0.17
      x += Math.cos(a) * 3; y += Math.sin(a) * 3
      g.lineTo(...P(x, y))
    }
    g.lineWidth = w * sx; g.stroke()
    g.lineWidth = 3 * sx; g.strokeStyle = 'rgba(210,180,170,0.35)'; g.stroke()
  }
  // 右手（画面左下）戒指一点反光
  g.fillStyle = '#c9c5bd'; g.beginPath(); g.ellipse(...P(120, 610), 22 * sx, 36 * sy, 0.3, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#e8c86a'; g.beginPath(); g.arc(...P(128, 598), 4 * sx, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#1d6a44'; g.beginPath(); g.arc(...P(128, 597), 2 * sx, 0, Math.PI * 2); g.fill()
  // 油画笔触 + 龟裂 + 暗角
  for (let k = 0; k < 2200; k++) { const x = rnd() * W, y = rnd() * H, l = 3 + rnd() * 9; g.strokeStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,240,210'},${0.03 + rnd() * 0.04})`; g.lineWidth = 1 + rnd() * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l * 0.7, y + l * 0.3); g.stroke() }
  for (let k = 0; k < 140; k++) { let x = rnd() * W, y = rnd() * H; g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x, y); for (let t = 0; t < 6; t++) { x += (rnd() - 0.5) * 14; y += (rnd() - 0.5) * 14; g.lineTo(x, y) } g.stroke() }
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.7)'); g.fillStyle = vg; g.fillRect(0, 0, W, H)
  // 金漆画框
  if (F > 0) {
    const fr = g.createLinearGradient(0, 0, W, H); fr.addColorStop(0, '#d8b45a'); fr.addColorStop(0.5, '#7d5a20'); fr.addColorStop(1, '#c49a40')
    g.fillStyle = fr; g.fillRect(0, 0, W, F); g.fillRect(0, H - F, W, F); g.fillRect(0, 0, F, H); g.fillRect(W - F, 0, F, H)
    g.strokeStyle = 'rgba(40,24,6,0.85)'; g.lineWidth = 3; g.strokeRect(F - 2, F - 2, W - 2 * F + 4, H - 2 * F + 4); g.strokeRect(5, 5, W - 10, H - 10)
    for (let k = 0; k < 60; k++) { const t = k / 60; for (const [x, y] of [[t * W, F / 2], [t * W, H - F / 2]]) { g.fillStyle = 'rgba(255,230,160,0.25)'; g.beginPath(); g.arc(x, y, F * 0.18, 0, Math.PI * 2); g.fill() } }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
  tex.userData.eyes = eyes.map(([x, y]) => [x * sx / W, y * sy / H])
  return tex
}

// ======================================================================
// [beast stage 2] 茶壶（阶段 2 pourTea 用）：白瓷金边（与行李员 / 办公室的茶杯同一套），原点 = 底面中心，+X = 壶嘴、-X = 壶把（竖环）
// ======================================================================
/** 茶壶关键点（壶局部）：grip = 壶把竖直段中点（握拳中心对这里），spout = 壶嘴口 */
export const BEAST_TEAPOT = { grip: [-0.094, 0.058, 0] as [number, number, number], spout: [0.136, 0.104, 0] as [number, number, number] }
export function buildBeastTeapot(): THREE.Group {
  const g = new THREE.Group(); g.name = 'beastTeapot'
  const china = litMaterial({ color: '#f1ede4', roughness: 0.18 }), gilt = litMaterial({ color: '#c8a050', roughness: 0.25, metalness: 0.85 })
  const V = (pts: number[][]) => pts.map(([x, y]) => new THREE.Vector2(x, y))
  const add = (geo: THREE.BufferGeometry, m: THREE.Material) => { const o = new THREE.Mesh(geo, m); o.castShadow = true; o.receiveShadow = true; g.add(o); return o }
  add(new THREE.LatheGeometry(V([[0, 0], [0.044, 0], [0.058, 0.014], [0.067, 0.044], [0.064, 0.074], [0.05, 0.094], [0.032, 0.101], [0, 0.101]]), 32), china)
  add(new THREE.LatheGeometry(V([[0, 0.101], [0.033, 0.101], [0.031, 0.108], [0.02, 0.116], [0, 0.119]]), 24), china)
  const knob = add(new THREE.SphereGeometry(0.009, 12, 8), gilt); knob.position.y = 0.126
  for (const [y, r] of [[0.002, 0.045], [0.101, 0.033]]) { const t = add(new THREE.TorusGeometry(r, 0.0013, 4, 36), gilt); t.rotation.x = Math.PI / 2; t.position.y = y }
  // 壶嘴：二次曲线扫掠管（根粗口细）
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.05, 0.032, 0), new THREE.Vector3(0.112, 0.045, 0), new THREE.Vector3(0.136, 0.104, 0))
  const tube = new THREE.TubeGeometry(curve, 16, 0.009, 10, false)
  const tp = tube.attributes.position
  for (let i = 0; i < tp.count; i++) { // 沿长度收细：按到曲线起点的距离缩放截面
    const v = new THREE.Vector3().fromBufferAttribute(tp, i), u = Math.min(1, Math.max(0, (v.x - 0.05) / 0.086)), c = curve.getPoint(u), k = 1.25 - 0.5 * u
    v.sub(c).multiplyScalar(k).add(c); tp.setXYZ(i, v.x, v.y, v.z)
  }
  tube.computeVertexNormals(); add(tube, china)
  // 壶把：竖环（XY 平面内，开口朝壶身），拳心握在最外侧竖直段
  const h = add(new THREE.TorusGeometry(0.034, 0.0068, 8, 20, Math.PI * 1.2), china); h.rotation.z = Math.PI * 0.4; h.position.set(-0.06, 0.058, 0)
  return g
}
