// Level 0.2「重塑的混乱」相关物品的专用低模（此前走 itemsMesh 的通用 fallback 白方块）：
//   brc_permit：后室装修公司施工许可——硬纸板夹 + 蓝色复写纸许可单（Canvas 印刷：抬头/表格/签名/金色钢印）+ 黑色长尾夹
//   dustmask：折叠式防尘口罩——两片杯形滤布（中缝压线）+ 铝鼻夹 + 两根松紧带 + 鼻夹印字
// 模型原点在几何中心，正面朝 +Z（与其它地面物品一致：renderer 抬高 0.45 m 悬浮旋转展示）。
// 面数：许可 ≈ 120 三角形 / 2 贴图批；口罩 ≈ 600 三角形。材质与贴图随物品模型一并 dispose（renderer.disposeItemModel）。
import * as THREE from 'three'

const lam = (color: string, map?: THREE.Texture | null, side: THREE.Side = THREE.FrontSide) =>
  new THREE.MeshLambertMaterial({ color, map: map ?? null, side, emissive: map ? '#ffffff' : color, emissiveMap: map ?? null, emissiveIntensity: 0.25 })

let permitCanvas: HTMLCanvasElement | null = null
function permitPaperCanvas(): HTMLCanvasElement {
  if (permitCanvas) return permitCanvas
  const c = document.createElement('canvas'); c.width = 256; c.height = 352
  const x = c.getContext('2d')!
  // 蓝色复写纸（第二联），轻微纸纹
  x.fillStyle = '#a9c4e2'; x.fillRect(0, 0, c.width, c.height)
  let s = 20261025
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296)
  for (let i = 0; i < 1400; i++) { x.fillStyle = `rgba(40,70,110,${0.03 + rnd() * 0.05})`; x.fillRect(rnd() * 256, rnd() * 352, 1 + rnd() * 2, 1) }
  x.fillStyle = '#1f3d6b'; x.textAlign = 'center'
  x.font = 'bold 26px "Noto Sans SC","Microsoft YaHei",sans-serif'; x.fillText('施工许可', 128, 44)
  x.font = '12px "Noto Sans SC","Microsoft YaHei",sans-serif'; x.fillText('后室装修公司 · BACKROOMS REMODELING CO.', 128, 64)
  x.strokeStyle = '#2b4d80'; x.lineWidth = 1.5; x.strokeRect(16, 78, 224, 196)
  x.textAlign = 'left'; x.font = '12px "Noto Sans SC","Microsoft YaHei",sans-serif'
  const rows = ['施工地点：Level 0（任意）', '工程内容：重塑', '许可编号：BRC-0.2-', '有效期：切换层级前', '持证人：']
  rows.forEach((t, i) => { const y = 78 + (i + 1) * 36; x.beginPath(); x.moveTo(16, y); x.lineTo(240, y); x.stroke(); x.fillText(t, 24, y - 12) })
  // 复写的手写字迹（蓝黑、略歪）
  x.strokeStyle = '#162d55'; x.lineWidth = 1.6
  for (const [y0, len] of [[214, 70], [250, 96]] as const) { x.beginPath(); x.moveTo(132, y0 - 12); for (let k = 0; k < len; k += 6) x.lineTo(132 + k, y0 - 12 + Math.sin(k * 0.7) * 3 - (rnd() * 2)); x.stroke() }
  // 签名线 + 金色钢印（右下）
  x.beginPath(); x.moveTo(24, 316); x.lineTo(130, 316); x.stroke()
  x.font = '11px "Noto Sans SC","Microsoft YaHei",sans-serif'; x.fillStyle = '#1f3d6b'; x.fillText('签发人', 24, 332)
  const g = x.createRadialGradient(200, 306, 4, 200, 306, 30); g.addColorStop(0, '#f1d47a'); g.addColorStop(0.7, '#c99a2e'); g.addColorStop(1, '#8a6414')
  x.fillStyle = g; x.beginPath()
  for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, r = k % 2 ? 26 : 30; x.lineTo(200 + Math.cos(a) * r, 306 + Math.sin(a) * r) }
  x.closePath(); x.fill()
  x.strokeStyle = '#7a560f'; x.lineWidth = 1.2; x.beginPath(); x.arc(200, 306, 18, 0, Math.PI * 2); x.stroke()
  x.fillStyle = '#6b4a0c'; x.textAlign = 'center'; x.font = 'bold 12px sans-serif'; x.fillText('BRC', 200, 310)
  permitCanvas = c
  return c
}

/** 施工许可：板夹 0.23 × 0.31 m，正面朝 +Z。 */
export function buildPermitMesh(): THREE.Group {
  const g = new THREE.Group()
  const tex = new THREE.CanvasTexture(permitPaperCanvas()); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.31, 0.006), lam('#7a5634'))
  g.add(board)
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.205, 0.282), lam('#ffffff', tex))
  paper.position.set(0, -0.008, 0.0035); g.add(paper)
  // 底下垫着的第一联（白纸，露出一条边）
  const under = new THREE.Mesh(new THREE.PlaneGeometry(0.205, 0.282), lam('#ecebe4'))
  under.position.set(0.004, -0.012, 0.0031); under.rotation.z = -0.018; g.add(under)
  // 长尾夹：黑色夹身 + 两根银色把手
  const clipM = lam('#1c1c1e'), wireM = lam('#c4c7cc')
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.016), clipM); body.position.set(0, 0.142, 0.007); g.add(body)
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0018, 4, 10, Math.PI), wireM)
    h.position.set(sx * 0.022, 0.157, 0.016); h.rotation.set(-0.5, 0, 0); g.add(h)
  }
  g.userData.l02Item = 'brc_permit'
  return g
}

let maskCanvas: HTMLCanvasElement | null = null, maskTex: THREE.CanvasTexture | null = null
/** 口罩滤布：无纺布纤维 + 中缝压线 + 鼻夹下方蓝色印字「后室装修公司 · 施工专用」（UV：u 横向、v 自上而下）。 */
function maskClothCanvas(): HTMLCanvasElement {
  if (maskCanvas) return maskCanvas
  const c = document.createElement('canvas'); c.width = 256; c.height = 256
  const x = c.getContext('2d')!
  x.fillStyle = '#f1efe9'; x.fillRect(0, 0, 256, 256)
  let s = 20261101
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296)
  for (let i = 0; i < 2600; i++) { // 无纺布：随机短纤维
    const a = rnd() * Math.PI, l = 3 + rnd() * 9, px = rnd() * 256, py = rnd() * 256
    x.strokeStyle = `rgba(${rnd() < .5 ? '170,165,150' : '255,255,255'},${.12 + rnd() * .18})`; x.lineWidth = .7
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke()
  }
  for (let y = 6; y < 256; y += 9) { x.fillStyle = 'rgba(160,155,140,.08)'; x.fillRect(0, y, 256, 2) } // 热压纹
  x.fillStyle = 'rgba(150,145,130,.45)'; x.fillRect(126, 0, 4, 256) // 中缝压线
  x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(130, 0, 2, 256)
  // 印字（在鼻夹下方，u≈.5、v≈.72）；表面横向约为纵向 1.6 倍，先横向压缩
  x.save(); x.translate(128, 80); x.scale(1 / 1.6, 1)
  x.fillStyle = '#2f5f9e'; x.textAlign = 'center'; x.textBaseline = 'middle'
  x.font = 'bold 22px "Noto Sans SC","Microsoft YaHei",sans-serif'; x.fillText('后室装修公司 · 施工专用', 0, 0)
  x.font = 'bold 15px sans-serif'; x.fillText('BRC  KN95  DUST', 0, 22)
  x.restore()
  maskCanvas = c
  return c
}

/** 防尘口罩（杯形）：宽 ≈ 0.16 m、高 ≈ 0.11 m，杯面朝 +Z；铝鼻夹贴上沿，两根松紧带在背后收成小圈。 */
export function buildDustMaskMesh(): THREE.Group {
  const g = new THREE.Group()
  if (!maskTex) { maskTex = new THREE.CanvasTexture(maskClothCanvas()); maskTex.colorSpace = THREE.SRGBColorSpace; maskTex.anisotropy = 4 }
  const tex = maskTex // 共享：renderer 释放物品时只释放材质/几何
  const cloth = lam('#ffffff', tex), inner = lam('#e9e6de', null, THREE.BackSide) // 外层印字、内层素布（避免从里面看到反字）
  // 杯体：球面取正前方 ±55°、上下去掉两极；SphereGeometry 的 phi=π/2 方向为 +Z
  const R = 0.08, P0 = Math.PI / 2 - 0.96, PL = 1.92, T0 = 0.6, TL = Math.PI - 1.2
  const SX = 1, SY = 0.72, SZ = 0.62
  const shell = new THREE.Mesh(new THREE.SphereGeometry(R, 16, 10, P0, PL, T0, TL), cloth)
  shell.scale.set(SX, SY, SZ); g.add(shell)
  const lining = new THREE.Mesh(shell.geometry, inner); lining.scale.copy(shell.scale); g.add(lining)
  // 杯沿上的点（与 SphereGeometry 同一参数化：x=-R cosφ sinθ, y=R cosθ, z=R sinφ sinθ）
  const rim = (phi: number, th: number, inset = 1) => new THREE.Vector3(-R * Math.cos(phi) * Math.sin(th) * SX * inset, R * Math.cos(th) * SY * inset, R * Math.sin(phi) * Math.sin(th) * SZ * inset)
  // 包边：沿四条边一圈细管
  const edge: THREE.Vector3[] = []
  for (let i = 0; i <= 12; i++) edge.push(rim(P0 + PL * i / 12, T0))
  for (let i = 1; i <= 8; i++) edge.push(rim(P0 + PL, T0 + TL * i / 8))
  for (let i = 1; i <= 12; i++) edge.push(rim(P0 + PL - PL * i / 12, T0 + TL))
  for (let i = 1; i < 8; i++) edge.push(rim(P0, T0 + TL - TL * i / 8))
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge, true), 48, 0.0028, 4, true), lam('#e2ded3')))
  // 铝鼻夹：贴着上沿中段，略高出布面
  const nose: THREE.Vector3[] = []
  for (let i = 0; i <= 6; i++) nose.push(rim(Math.PI / 2 - 0.42 + 0.84 * i / 6, T0 + 0.08, 1.04))
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(nose), 10, 0.0024, 4), lam('#b9bdc2')))
  // 松紧带：从左右两侧上下两点出发，在背后收成两个扁圈
  const band = lam('#d9d2c2')
  for (const sy of [0.6, -0.45]) {
    const th = T0 + TL * (sy > 0 ? 0.22 : 0.8)
    const a = rim(P0 + 0.02, th), b = rim(P0 + PL - 0.02, th)
    const pts = [a, new THREE.Vector3(a.x * 1.05, a.y + sy * 0.004, -0.02), new THREE.Vector3(a.x * 0.7, a.y, -0.045), new THREE.Vector3(0, a.y - sy * 0.006, -0.055), new THREE.Vector3(b.x * 0.7, b.y, -0.045), new THREE.Vector3(b.x * 1.05, b.y + sy * 0.004, -0.02), b]
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.0018, 4), band))
  }
  // 两侧钉扣（松紧带固定点）
  for (const p of [rim(P0 + 0.02, T0 + TL * 0.22), rim(P0 + PL - 0.02, T0 + TL * 0.22), rim(P0 + 0.02, T0 + TL * 0.8), rim(P0 + PL - 0.02, T0 + TL * 0.8)]) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 6, 4), lam('#cfcac0')); d.position.copy(p); g.add(d)
  }
  g.position.z = 0.012
  const root = new THREE.Group(); root.add(g)
  root.userData.l02Item = 'dustmask'
  return root
}
