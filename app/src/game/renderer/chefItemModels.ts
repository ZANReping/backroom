// [chef] 厨师（Entity 800）五件物品的专用低模（不走 itemsMesh 的通用 fallback 方块）：
//   chefpot   带把手的锅：chefProps.buildChefPot（凹痕铸铁锅 + 磨亮的把手 + 血迹层）
//   megcamera 档案员的相机：chefProps.buildArchivistCamera（镜片裂纹、M.E.G. 资产标签、断背带）
//   megmic    坏掉的胸麦：chefProps.buildChestMic + 一张系在卷线上的 M.E.G. 编号小纸签
//   megform   未写完的表单：一张 M.E.G. 实体观察记录表（编号 800、字迹越往下越乱、最后拖成一道长线），一角折起
//   chefphoto 拍到他的照片：拍立得——后厨、大锅、高帽背影两只竖耳；背面圆珠笔字
// 规范：Canvas 程序贴图按类型缓存；每件 ≤ 2,000 三角面；正面朝 +Z，单位 m。地面展示放大见 buildChefItemMesh。
import * as THREE from 'three'
import { litMaterial } from './shared'
import { buildChefPot, buildArchivistCamera, buildChestMic } from './chefProps'

export const CHEF_ITEM_TYPES = ['chefpot', 'megcamera', 'megmic', 'megform', 'chefphoto'] as const
export type ChefItemType = typeof CHEF_ITEM_TYPES[number]
export const isChefItemType = (t: string): t is ChefItemType => (CHEF_ITEM_TYPES as readonly string[]).includes(t)

const TEX = new Map<string, THREE.Texture>()
function canvasTex(key: string, w: number, h: number, draw: (x: CanvasRenderingContext2D) => void): THREE.Texture {
  const hit = TEX.get(key); if (hit) return hit
  const c = document.createElement('canvas') as HTMLCanvasElement; c.width = w; c.height = h
  const x = c.getContext('2d') as CanvasRenderingContext2D
  draw(x)
  const t = new THREE.CanvasTexture(c as unknown as HTMLCanvasElement); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  TEX.set(key, t)
  return t
}
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296) }
const CJK = '"Noto Sans SC","Source Han Sans SC","PingFang SC","Microsoft YaHei",sans-serif'
const HAND = '"KaiTi","STKaiti","Kaiti SC","Noto Serif SC",' + CJK

/** 表单：M.E.G. 抬头、编号 800、观察员空白、几行字越写越乱 → 一道长线；纸面泛黄、一角水渍 */
const formTex = () => canvasTex('megForm', 256, 352, (x) => {
  const R = rng(800)
  x.fillStyle = '#ece4cf'; x.fillRect(0, 0, 256, 352)
  for (let i = 0; i < 600; i++) { x.fillStyle = `rgba(120,100,60,${R() * 0.06})`; x.fillRect(R() * 256, R() * 352, 2, 2) }
  x.fillStyle = '#1b2a4a'; x.fillRect(14, 14, 228, 30)
  x.fillStyle = '#e8e2d0'; x.font = '700 18px Georgia, serif'; x.fillText('M.E.G.', 22, 36); x.font = `12px ${CJK}`; x.fillText('实体观察记录', 96, 34)
  x.fillStyle = '#2a2a2a'; x.font = `12px ${CJK}`
  const rows = ['编号：', '观察员：', '地点：', '描述：']
  for (let i = 0; i < rows.length; i++) { x.fillText(rows[i], 18, 68 + i * 22); x.strokeStyle = 'rgba(40,40,40,.5)'; x.beginPath(); x.moveTo(70, 70 + i * 22); x.lineTo(240, 70 + i * 22); x.stroke() }
  x.fillStyle = '#23305a'; x.font = `18px ${HAND}`; x.fillText('800', 78, 66); x.fillText('Level 5 · 餐厅', 78, 110)
  // 手写描述：越往下越歪越乱
  const lines = ['顾客看不见他。', '我跟邻座说话，', '他头也不抬。', '炖菜里的肉——', '我拿镊子挑出来', '对着灯看了。', '我不写了']
  for (let i = 0; i < lines.length; i++) { x.save(); x.translate(20 + i * 1.5, 158 + i * 22); x.rotate((i * 0.012) * (i % 2 ? 1 : -1.4)); x.font = `${15 + i * 0.6}px ${HAND}`; x.fillText(lines[i], 0, 0); x.restore() }
  x.strokeStyle = '#23305a'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(110, 300); x.bezierCurveTo(150, 306, 190, 318, 250, 346); x.stroke()
  const w = x.createRadialGradient(210, 300, 4, 210, 300, 46); w.addColorStop(0, 'rgba(110,40,30,.28)'); w.addColorStop(1, 'rgba(110,40,30,0)'); x.fillStyle = w; x.fillRect(150, 240, 106, 112)
})
const formBack = () => canvasTex('megFormBack', 128, 176, (x) => { x.fillStyle = '#e3dac2'; x.fillRect(0, 0, 128, 176); x.strokeStyle = 'rgba(80,70,50,.18)'; for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(8, 20 + i * 17); x.lineTo(120, 20 + i * 17); x.stroke() } })
/** 拍立得：后厨暗红调、大锅的蒸汽、锅前一个高帽背影 + 两只竖耳 */
const polaroidFront = () => canvasTex('chefPolaroid', 256, 300, (x) => {
  const R = rng(801)
  x.fillStyle = '#f1ece0'; x.fillRect(0, 0, 256, 300)
  const ox = 16, oy = 16, w = 224, h = 220
  const g = x.createLinearGradient(0, oy, 0, oy + h); g.addColorStop(0, '#3a1612'); g.addColorStop(1, '#170807'); x.fillStyle = g; x.fillRect(ox, oy, w, h)
  // 灶台 + 大锅 + 蒸汽
  x.fillStyle = '#4a4744'; x.fillRect(ox + 20, oy + 150, 184, 70)
  x.fillStyle = '#8c8a86'; x.beginPath(); x.ellipse(ox + 112, oy + 132, 52, 14, 0, 0, Math.PI * 2); x.fill(); x.fillRect(ox + 60, oy + 132, 104, 26)
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(230,220,210,${0.03 + R() * 0.05})`; x.beginPath(); x.arc(ox + 80 + R() * 64, oy + 40 + R() * 90, 6 + R() * 14, 0, Math.PI * 2); x.fill() }
  // 背影：肥胖的白衣身体 + 高帽 + 两耳
  x.fillStyle = '#cfc8bc'; x.beginPath(); x.ellipse(ox + 150, oy + 170, 44, 56, 0, 0, Math.PI * 2); x.fill()
  x.fillStyle = '#2a2624'; x.beginPath(); x.ellipse(ox + 150, oy + 104, 22, 20, 0, 0, Math.PI * 2); x.fill()
  x.fillStyle = '#e8e4da'; x.fillRect(ox + 132, oy + 50, 36, 46); x.beginPath(); x.ellipse(ox + 150, oy + 50, 26, 14, 0, 0, Math.PI * 2); x.fill()
  x.fillStyle = '#3a3330'; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(ox + 150 + s * 18, oy + 92); x.lineTo(ox + 150 + s * 34, oy + 72); x.lineTo(ox + 150 + s * 24, oy + 98); x.fill() }
  x.fillStyle = 'rgba(120,10,10,.55)'; for (let i = 0; i < 18; i++) x.fillRect(ox + 120 + R() * 60, oy + 140 + R() * 70, 2 + R() * 3, 3 + R() * 9)
  // 闪光过曝 + 颗粒
  const f = x.createRadialGradient(ox + 150, oy + 110, 4, ox + 150, oy + 110, 120); f.addColorStop(0, 'rgba(255,250,235,.35)'); f.addColorStop(1, 'rgba(255,250,235,0)'); x.fillStyle = f; x.fillRect(ox, oy, w, h)
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,230,210'},${R() * 0.07})`; x.fillRect(ox + R() * w, oy + R() * h, 1.3, 1.3) }
  x.fillStyle = '#6a5a48'; x.font = `16px ${HAND}`; x.textAlign = 'center'; x.fillText('800 · 后厨', 128, 274)
})
const polaroidBack = () => canvasTex('chefPolaroidBack', 256, 300, (x) => { x.fillStyle = '#e8e2d2'; x.fillRect(0, 0, 256, 300); x.fillStyle = '#1e2c66'; x.font = `20px ${HAND}`; x.textAlign = 'center'; x.fillText('他把人吐进锅里。', 128, 120); x.fillText('炖菜。香肠。', 128, 156); x.font = `26px ${HAND}`; x.fillText('别吃。', 128, 204) })
const tagTex = () => canvasTex('megMicTag', 128, 64, (x) => { x.fillStyle = '#d9d2bd'; x.fillRect(0, 0, 128, 64); x.fillStyle = '#1b2a4a'; x.font = '700 18px sans-serif'; x.fillText('M.E.G.', 8, 26); x.font = '13px monospace'; x.fillText('MIC A-12-3', 8, 50); x.fillStyle = 'rgba(110,10,10,.6)'; x.beginPath(); x.arc(108, 40, 9, 0, Math.PI * 2); x.fill() })

function mesh(g: THREE.BufferGeometry, m: THREE.Material, name: string) { const o = new THREE.Mesh(g, m); o.name = name; o.castShadow = true; o.receiveShadow = true; return o }
function paper(front: THREE.Texture, back: THREE.Texture, W: number, H: number, fold = 0): THREE.Group {
  const g = new THREE.Group()
  const f = new THREE.PlaneGeometry(W, H, 6, 8)
  if (fold) { const p = f.getAttribute('position'); for (let i = 0; i < p.count; i++) { const xx = p.getX(i), yy = p.getY(i); if (xx > W / 2 - fold && yy > H / 2 - fold && xx - (W / 2 - fold) + yy - (H / 2 - fold) > fold) p.setZ(i, 0.01) } f.computeVertexNormals() }
  g.add(mesh(f, litMaterial({ color: '#ffffff', map: front, roughness: 0.92, side: THREE.FrontSide }), 'paperFront'))
  const b = f.clone(); b.rotateY(Math.PI); b.translate(0, 0, -0.0006)
  g.add(mesh(b, litMaterial({ color: '#ffffff', map: back, roughness: 0.95 }), 'paperBack'))
  return g
}
/** 地面 / 手持模型（正面朝 +Z）。pose 'upright' = 手持时竖起来 */
export function buildChefItemMesh(type: ChefItemType, pose: 'ground' | 'upright' = 'ground'): THREE.Group {
  let g: THREE.Group, k = 2
  switch (type) {
    case 'chefpot': g = new THREE.Group(); { const p = buildChefPot(); p.rotation.z = Math.PI / 2; p.position.y = 0.0; g.add(p) } k = 1.1; break
    case 'megcamera': g = new THREE.Group(); { const c = buildArchivistCamera(); c.position.y = -0.06; g.add(c) } k = 2.2; break
    case 'megmic': g = new THREE.Group(); { const m = buildChestMic(); g.add(m); const t = mesh(new THREE.PlaneGeometry(0.05, 0.025), litMaterial({ color: '#ffffff', map: tagTex(), roughness: 0.9, side: THREE.DoubleSide }), 'micTag'); t.position.set(0.02, -0.12, 0.005); t.rotation.z = 0.3; g.add(t) } k = 3.2; break
    case 'megform': g = paper(formTex(), formBack(), 0.21, 0.29, 0.03); k = 1.3; break
    default: g = paper(polaroidFront(), polaroidBack(), 0.088, 0.104); { const e = mesh(new THREE.BoxGeometry(0.088, 0.104, 0.0012), litMaterial({ color: '#efe9da', roughness: 0.8 }), 'polaroidEdge'); e.position.z = -0.0004; g.add(e) } k = 2.4
  }
  g.name = `chefItem_${type}`
  if (pose === 'ground') { g.scale.setScalar(k); if (type === 'megform' || type === 'chefphoto') g.rotation.x = -0.55 }
  return g
}
