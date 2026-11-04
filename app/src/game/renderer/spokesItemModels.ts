// [spokes] 迎宾女郎（Entity 28）四件物品的专用低模（不走 itemsMesh 的通用 fallback 方块）：
//   spokesposter 迎宾海报：对折过的手绘海报（正面 = spokesProps.posterTexture 同一张图），微卷的纸
//   spokesphoto  侦探照片：白边相纸，棕发棕眼、侦探大衣的女人（褐调老照片），背面钢笔字
//   detbadge     侦探证件：打开的黑皮证件夹——左边嵌黄铜徽章（盾形，凸起），右边证件卡（同一张脸，名字被水泡花）
//   windupgear   发条零件：一大一小两枚黄铜齿轮 + 一卷钢发条 + 蝴蝶形钥匙
// 规范：Canvas 程序贴图每件一张、按类型缓存（实例共享，renderer 不释放）；每件 ≤ 3 个材质批次、≤ 2,000 三角面；原点在几何中心，正面朝 +Z，单位 m。
// 地面展示沿用其它物品的放大比例（小件约 2–3 倍实物），手持姿态见 viewmodel.buildHeldItem。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { litMaterial } from './shared'
import { posterTexture } from './spokesProps'

export const SPOKES_ITEM_TYPES = ['spokesposter', 'spokesphoto', 'detbadge', 'windupgear'] as const
export type SpokesItemType = typeof SPOKES_ITEM_TYPES[number]
export const isSpokesItemType = (t: string): t is SpokesItemType => (SPOKES_ITEM_TYPES as readonly string[]).includes(t)

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

/** 老照片里的女人：棕发、棕眼、侦探大衣（褐调） */
function drawPortrait(x: CanvasRenderingContext2D, ox: number, oy: number, w: number, h: number, sepia = 1) {
  const R = rng(2828)
  const g = x.createLinearGradient(ox, oy, ox, oy + h); g.addColorStop(0, sepia ? '#b9a079' : '#8a8f96'); g.addColorStop(1, sepia ? '#6e5536' : '#4a4f56')
  x.fillStyle = g; x.fillRect(ox, oy, w, h)
  const cx = ox + w / 2, s = w / 100
  // 大衣 + 翻领
  x.fillStyle = '#4b3a28'; x.beginPath(); x.moveTo(cx - 46 * s, oy + h); x.quadraticCurveTo(cx - 40 * s, oy + h * 0.66, cx - 12 * s, oy + h * 0.62); x.lineTo(cx + 12 * s, oy + h * 0.62); x.quadraticCurveTo(cx + 40 * s, oy + h * 0.66, cx + 46 * s, oy + h); x.fill()
  x.fillStyle = '#3a2c1e'; x.beginPath(); x.moveTo(cx - 12 * s, oy + h * 0.62); x.lineTo(cx - 2 * s, oy + h * 0.82); x.lineTo(cx - 20 * s, oy + h * 0.76); x.fill(); x.beginPath(); x.moveTo(cx + 12 * s, oy + h * 0.62); x.lineTo(cx + 2 * s, oy + h * 0.82); x.lineTo(cx + 20 * s, oy + h * 0.76); x.fill()
  x.fillStyle = '#e8dcc4'; x.beginPath(); x.moveTo(cx - 8 * s, oy + h * 0.63); x.lineTo(cx, oy + h * 0.78); x.lineTo(cx + 8 * s, oy + h * 0.63); x.fill()
  // 脖子 + 脸
  x.fillStyle = '#d6b08c'; x.fillRect(cx - 7 * s, oy + h * 0.5, 14 * s, h * 0.13)
  x.beginPath(); x.ellipse(cx, oy + h * 0.38, 17 * s, 22 * s, 0, 0, Math.PI * 2); x.fill()
  // 棕色头发（齐肩，侧分）
  x.fillStyle = '#5a3a20'; x.beginPath(); x.ellipse(cx, oy + h * 0.32, 21 * s, 22 * s, 0, Math.PI, 0); x.fill()
  x.fillRect(cx - 21 * s, oy + h * 0.32, 7 * s, h * 0.22); x.fillRect(cx + 14 * s, oy + h * 0.32, 7 * s, h * 0.22)
  x.beginPath(); x.moveTo(cx - 18 * s, oy + h * 0.3); x.quadraticCurveTo(cx + 2 * s, oy + h * 0.2, cx + 19 * s, oy + h * 0.36); x.lineTo(cx + 20 * s, oy + h * 0.26); x.fill()
  // 棕色眼睛 + 眉（皱眉）
  for (const sx of [-1, 1]) { x.fillStyle = '#f2ead8'; x.beginPath(); x.ellipse(cx + sx * 7 * s, oy + h * 0.385, 3.6 * s, 2.2 * s, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = '#6b4220'; x.beginPath(); x.arc(cx + sx * 7 * s, oy + h * 0.385, 1.8 * s, 0, Math.PI * 2); x.fill(); x.strokeStyle = '#3a2412'; x.lineWidth = 1.4 * s; x.beginPath(); x.moveTo(cx + sx * 3 * s, oy + h * 0.345); x.lineTo(cx + sx * 11 * s, oy + h * 0.335); x.stroke() }
  x.strokeStyle = '#8a5a44'; x.lineWidth = 1.2 * s; x.beginPath(); x.moveTo(cx - 5 * s, oy + h * 0.48); x.lineTo(cx + 5 * s, oy + h * 0.48); x.stroke()
  // 老照片颗粒 + 暗角
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${R() < 0.5 ? '40,25,10' : '255,240,210'},${0.04 + R() * 0.06})`; x.fillRect(ox + R() * w, oy + R() * h, 1.2, 1.2) }
  const v = x.createRadialGradient(cx, oy + h / 2, w * 0.2, cx, oy + h / 2, w * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(30,18,6,0.45)'); x.fillStyle = v; x.fillRect(ox, oy, w, h)
}
const photoFront = () => canvasTex('photoFront', 256, 352, (x) => { x.fillStyle = '#efe6d0'; x.fillRect(0, 0, 256, 352); drawPortrait(x, 16, 16, 224, 290); x.fillStyle = '#7a6a50'; x.font = `14px ${HAND}`; x.textAlign = 'center'; x.fillText('L5 · 118', 128, 334) })
const photoBack = () => canvasTex('photoBack', 256, 352, (x) => { x.fillStyle = '#e6dcc4'; x.fillRect(0, 0, 256, 352); x.fillStyle = '#2a3150'; x.font = `22px ${HAND}`; x.textAlign = 'center'; x.fillText('你不觉得', 128, 150); x.fillText('她很面熟吗？', 128, 184); x.strokeStyle = 'rgba(120,100,70,.4)'; for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(30, 230 + i * 18); x.lineTo(226, 230 + i * 18); x.stroke() } })
const badgeTex = () => canvasTex('badgeIn', 512, 256, (x) => {
  x.fillStyle = '#1e1916'; x.fillRect(0, 0, 512, 256)
  const R = rng(51); for (let i = 0; i < 2400; i++) { x.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '90,70,60'},${0.08 + R() * 0.1})`; x.fillRect(R() * 512, R() * 256, 2, 2) }
  x.strokeStyle = '#3a2e26'; x.lineWidth = 3; x.setLineDash([6, 5]); x.strokeRect(10, 10, 236, 236); x.strokeRect(266, 10, 236, 236); x.setLineDash([])
  // 右：证件卡
  x.fillStyle = '#ece3cb'; x.fillRect(282, 26, 204, 204)
  drawPortrait(x, 296, 50, 70, 92)
  x.fillStyle = '#2a2018'; x.font = '700 15px Georgia, serif'; x.fillText('PRIVATE INVESTIGATOR', 296, 44)
  x.font = '18px Georgia, serif'; x.fillText('M.', 378, 74)
  x.fillStyle = 'rgba(70,90,120,.45)'; x.beginPath(); x.ellipse(430, 80, 46, 18, 0.2, 0, Math.PI * 2); x.fill() // 水渍
  x.fillStyle = '#2a2018'; for (let i = 0; i < 4; i++) x.fillRect(378, 100 + i * 14, 90 - i * 12, 3)
  x.font = '12px monospace'; x.fillText('No. 0028', 296, 176); x.fillText('LICENSED', 296, 196)
  x.fillStyle = '#a03a2a'; x.beginPath(); x.arc(450, 196, 20, 0, Math.PI * 2); x.fill()
})
const brassTex = () => canvasTex('brass', 256, 256, (x) => {
  const g = x.createLinearGradient(0, 0, 256, 256); g.addColorStop(0, '#f0d58a'); g.addColorStop(0.5, '#c79a40'); g.addColorStop(1, '#8f6a28'); x.fillStyle = g; x.fillRect(0, 0, 256, 256)
  const R = rng(7); for (let i = 0; i < 260; i++) { x.strokeStyle = `rgba(255,240,200,${0.05 + R() * 0.08})`; x.beginPath(); const y = R() * 256; x.moveTo(0, y); x.lineTo(256, y + (R() - 0.5) * 6); x.stroke() }
  x.fillStyle = '#5a3f12'; x.font = '700 20px Georgia, serif'; x.textAlign = 'center'; x.fillText('L5', 128, 136)
})
const steelTex = () => canvasTex('steel', 128, 128, (x) => { const g = x.createLinearGradient(0, 0, 128, 0); g.addColorStop(0, '#6d7377'); g.addColorStop(0.5, '#c4c9cc'); g.addColorStop(1, '#6d7377'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); const R = rng(3); for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(0,0,0,${R() * 0.1})`; x.fillRect(R() * 128, R() * 128, 3, 1) } })
const paperBack = () => canvasTex('posterBack', 256, 352, (x) => { x.fillStyle = '#efe3c6'; x.fillRect(0, 0, 256, 352); x.fillStyle = 'rgba(60,60,60,.75)'; x.font = `30px ${HAND}`; x.textAlign = 'center'; x.fillText('别来', 128, 190); x.strokeStyle = 'rgba(150,120,80,.25)'; x.beginPath(); x.moveTo(0, 176); x.lineTo(256, 176); x.stroke() })

const nonIdx = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g)
function merged(parts: THREE.BufferGeometry[]) { const m = mergeGeometries(parts.map((p) => { const q = nonIdx(p); q.deleteAttribute('uv1' as never); return q }), false)!; m.computeBoundingSphere(); return m }
function mesh(g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], name: string) { const o = new THREE.Mesh(g, m); o.name = name; o.castShadow = true; o.receiveShadow = true; return o }

function poster(): THREE.Group {
  const g = new THREE.Group()
  const W = 0.21, H = 0.29
  // 微卷的纸：两片（正反）共用一个弯曲平面，沿 x 方向轻微拱起；中间一道折痕
  const curl = (geo: THREE.PlaneGeometry, k: number) => { const p = geo.getAttribute('position'); for (let i = 0; i < p.count; i++) { const xx = p.getX(i); p.setZ(i, k * (0.012 * Math.cos((xx / W) * Math.PI) + (Math.abs(p.getY(i)) < 0.004 ? -0.002 : 0))) } geo.computeVertexNormals(); return geo }
  const front = curl(new THREE.PlaneGeometry(W, H, 12, 8), 1)
  const back = curl(new THREE.PlaneGeometry(W, H, 12, 8), 1); back.rotateY(Math.PI); back.translate(0, 0, -0.0006)
  const pt = posterTexture()
  g.add(mesh(front, litMaterial({ color: '#ffffff', map: pt?.map, roughness: 0.9 }), 'posterFront'))
  g.add(mesh(back, litMaterial({ color: '#ffffff', map: paperBack(), roughness: 0.95 }), 'posterBack'))
  return g
}
function photo(): THREE.Group {
  const g = new THREE.Group(), W = 0.1, H = 0.1375
  g.add(mesh(new THREE.PlaneGeometry(W, H), litMaterial({ color: '#ffffff', map: photoFront(), roughness: 0.6 }), 'photoFront'))
  const b = new THREE.PlaneGeometry(W, H); b.rotateY(Math.PI); b.translate(0, 0, -0.0008)
  g.add(mesh(b, litMaterial({ color: '#ffffff', map: photoBack(), roughness: 0.9 }), 'photoBack'))
  const edge = new THREE.BoxGeometry(W, H, 0.0006); edge.translate(0, 0, -0.0004)
  g.add(mesh(edge, litMaterial({ color: '#e8dfc8', roughness: 0.9 }), 'photoEdge'))
  return g
}
function badge(): THREE.Group {
  const g = new THREE.Group()
  // 皮夹：打开 160°，两页；内侧贴图左右各半
  const W = 0.085, H = 0.105, T = 0.004
  const leather = litMaterial({ color: '#ffffff', map: badgeTex(), roughness: 0.65 })
  const pages: THREE.BufferGeometry[] = []
  for (const s of [-1, 1]) {
    const p = new THREE.BoxGeometry(W, H, T)
    // 内侧 UV：左页取贴图左半、右页取右半；其它面也取同侧（深色皮）
    const uv = p.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setX(i, (s < 0 ? 0 : 0.5) + uv.getX(i) * 0.5)
    p.translate(s * W / 2, 0, 0); p.rotateY(-s * 0.17); pages.push(p)
  }
  g.add(mesh(merged(pages), leather, 'badgeWallet'))
  // 黄铜盾徽（左页上，凸起）
  const sh = new THREE.Shape(); sh.moveTo(0, 0.034); sh.lineTo(0.026, 0.024); sh.lineTo(0.022, -0.012); sh.lineTo(0, -0.03); sh.lineTo(-0.022, -0.012); sh.lineTo(-0.026, 0.024); sh.closePath()
  const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.003, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0012, bevelSegments: 2 })
  const uvb = sg.getAttribute('uv') as THREE.BufferAttribute; for (let i = 0; i < uvb.count; i++) uvb.setXY(i, 0.5 + uvb.getX(i) * 8, 0.5 + uvb.getY(i) * 8)
  sg.translate(-W / 2 - 0.002, 0.004, T / 2); sg.rotateY(0.17)
  g.add(mesh(sg, litMaterial({ color: '#ffffff', map: brassTex(), metalness: 0.8, roughness: 0.35 }), 'badgeShield'))
  return g
}
function gear(): THREE.Group {
  const g = new THREE.Group()
  const cog = (r: number, teeth: number, th: number) => {
    const s = new THREE.Shape(), n = teeth * 4
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, rr = i % 4 < 2 ? r : r * 0.84; const px = Math.cos(a) * rr, py = Math.sin(a) * rr; if (i) s.lineTo(px, py); else s.moveTo(px, py) }
    const h = new THREE.Path(); h.absarc(0, 0, r * 0.22, 0, Math.PI * 2, true); s.holes.push(h)
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4, w = new THREE.Path(); w.absarc(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52, r * 0.16, 0, Math.PI * 2, true); s.holes.push(w) }
    const geo = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: false, curveSegments: 6 })
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + uv.getX(i) * 4, 0.5 + uv.getY(i) * 4)
    return geo
  }
  const big = cog(0.04, 14, 0.006); big.translate(0, 0, -0.003)
  const small = cog(0.022, 9, 0.006); small.translate(0.055, 0.012, -0.003)
  const key: THREE.BufferGeometry[] = []
  const stem = new THREE.CylinderGeometry(0.004, 0.004, 0.05, 10); stem.rotateX(Math.PI / 2); stem.translate(0, 0, 0.025); key.push(stem)
  for (const s of [-1, 1]) { const w = new THREE.CylinderGeometry(0.016, 0.016, 0.004, 18); w.scale(1, 1, 0.62); w.rotateX(Math.PI / 2); w.rotateY(Math.PI / 2); w.translate(s * 0.014, 0, 0.052); key.push(w) }
  g.add(mesh(merged([big, small, ...key]), litMaterial({ color: '#ffffff', map: brassTex(), metalness: 0.85, roughness: 0.32 }), 'gearBrass'))
  // 钢发条：一圈阿基米德螺线扁带
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 120; i++) { const a = (i / 120) * Math.PI * 2 * 4, r = 0.006 + (i / 120) * 0.022; pts.push(new THREE.Vector3(Math.cos(a) * r - 0.05, Math.sin(a) * r - 0.03, 0)) }
  const spring = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 0.0012, 3, false); spring.scale(1, 1, 3)
  g.add(mesh(spring, litMaterial({ color: '#ffffff', map: steelTex(), metalness: 0.9, roughness: 0.3 }), 'gearSpring'))
  return g
}

/** 地面模型（正面朝 +Z；itemsMesh 统一抬高 / 旋转展示）。pose 'upright' = 手持时竖起来（正面朝镜头） */
export function buildSpokesItemMesh(type: SpokesItemType, pose: 'ground' | 'upright' = 'ground'): THREE.Group {
  const g = type === 'spokesposter' ? poster() : type === 'spokesphoto' ? photo() : type === 'detbadge' ? badge() : gear()
  g.name = `spokesItem_${type}`
  const k = type === 'spokesposter' ? 1.3 : type === 'windupgear' ? 2.4 : 2.2 // 地面展示放大
  if (pose === 'ground') { g.scale.setScalar(k); g.rotation.x = -0.55 }
  return g
}
