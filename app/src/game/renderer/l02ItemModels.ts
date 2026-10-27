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

/** 防尘口罩：宽 ≈ 0.17 m，杯面朝 +Z。 */
export function buildDustMaskMesh(): THREE.Group {
  const g = new THREE.Group()
  const cloth = lam('#ecebe6', null, THREE.DoubleSide)
  // 两片杯形滤布：半球截取左右各一半，压扁成折叠口罩的轮廓，中缝留一道压线
  for (const side of [0, 1]) {
    const geo = new THREE.SphereGeometry(0.085, 12, 10, side ? 0 : Math.PI / 2, Math.PI / 2, 0.18, Math.PI - 0.36)
    const m = new THREE.Mesh(geo, cloth); m.scale.set(1, 0.72, 0.62); g.add(m)
  }
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.1, 0.006), lam('#cfcdc5')); seam.position.set(0, 0, 0.052); g.add(seam)
  // 包边（上下沿）
  for (const sy of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.TorusGeometry(0.084, 0.0035, 4, 18, Math.PI), lam('#dedcd4'))
    e.scale.set(1, 0.62, 1); e.rotation.x = Math.PI / 2 * sy; e.position.y = sy * 0.058; g.add(e)
  }
  // 铝鼻夹 + 印字条（蓝）
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.004), lam('#b9bdc2')); nose.position.set(0, 0.05, 0.034); nose.rotation.x = -0.6; g.add(nose)
  const print = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.002), lam('#3f6ea8')); print.position.set(0.03, -0.02, 0.05); print.rotation.y = 0.5; g.add(print)
  // 两根松紧带（上下各一，绕到后方）
  const band = lam('#e2dccd')
  for (const sy of [0.03, -0.03]) {
    const b = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.0022, 4, 20), band)
    b.scale.set(1, 1, 0.75); b.rotation.x = Math.PI / 2; b.position.set(0, sy, -0.035); g.add(b)
  }
  g.userData.l02Item = 'dustmask'
  return g
}
