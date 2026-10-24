// [vending] 售货机重制——阶段 1 建模（普通售货机 structure 'vending' + Entity 36「人制品售货机」共用一套机身）
// 参考附图：日式罐装饮料售货机——顶部发光品牌灯箱、两层发光玻璃陈列窗（每层 4 格）、每格下方价签 + 字母数字编号、
//   每层下方一条圆角灯条（每格一个小窗，红灯 = 售罄，绿灯 = 有货）、下部取货口翻板、右下操作区（红色七段数码屏 + 字母键 + 数字键）。
// 品牌全部虚构。Entity 36（wikidot entity-36）：外观是一台「前厅品牌」售货机——正面和普通机几乎一样（品牌 KINDRED），
//   陈列窗里是人体组织制成的「产品」；背面印着艾里克家族的标语；顶部、底部各一扇暗门：
//   顶门伸出一条巨型骷髅臂（劈砍），底门伸出两条约 1.4 m、涂着金属漆的骷髅臂当腿；机内有一只白骨手负责把货推出；
//   后部暗格里是三具无臂、短腿、大下颌、额头写着名字的艾里克尸体（拆解后可见）。
// 坐标：原点贴地居中，正面朝 +Z；宽 0.95 × 高 1.86 × 深 0.7（与 mapgen 售货机碰撞体 0.95×0.7 一致）。
import * as THREE from 'three'
import { ownImportedModel } from './importedModelResources'
import { buildAvatarModel } from './retroAvatar'
import { randomAvatar } from '../core/avatar'
import { mulberry, litMaterial, getMaterialMode } from './shared'

import { vendingLayout, SLOT_CODES, type VendingBrand, type VendingProduct, type VendingVariant } from '../content/vendingLayout'
export { NORMAL_PRODUCTS, E36_PRODUCTS, PRODUCT_NAME, NORMAL_BRANDS, SLOT_CODES, vendingLayout, type VendingVariant, type VendingBrand, type VendingProduct } from '../content/vendingLayout'
export const VENDING_DIM = { w: 0.95, h: 1.86, d: 0.7 } as const
const ROW_Y = [1.16, 0.66] // 两层陈列底板高度
const COL_X = [-0.255, -0.085, 0.085, 0.255].map((x) => x - 0.07) // 陈列窗偏左（右侧留给操作区）
const FRONT = VENDING_DIM.d / 2
const SHELF_D = 0.125 // 陈列搁板深度（FRONT-0.225 → FRONT-0.10）；前沿到玻璃（FRONT-0.012）之间是 8.8 cm 的封闭落货通道
export const VM_SHELF_EDGE = 0.1, VM_BACK = 0.225

const BRAND: Record<VendingBrand, { body: string; face: string; title: string; sub: string; ink: string; accent: string; header: string }> = {
  northstar: { body: '#2b2d31', face: '#e9e8e2', title: 'N★RTHSTAR', sub: 'DRAFT · SODA · COFFEE', ink: '#1f3fae', accent: '#d8262c', header: '#f4f3ee' },
  almondo: { body: '#2f4a3a', face: '#e4ead9', title: 'ALMONDO', sub: '杏仁水 · 每一口都安心', ink: '#2f6b3d', accent: '#c9a046', header: '#f1f4e6' },
  kopi: { body: '#5a2a24', face: '#efe4d6', title: 'KOPI TIME', sub: 'HOT & COLD · 一罐醒神', ink: '#6b2f1c', accent: '#e38a2b', header: '#f6ecdf' },
  fuyou: { body: '#24395e', face: '#e2e8f0', title: '福友 LUCKY', sub: '四叶草牧场 · 豆奶与果汁', ink: '#1e4f9c', accent: '#3aa35a', header: '#eef3fa' },
  kindred: { body: '#7e2a2c', face: '#ece6dc', title: 'KINDRED', sub: 'COLA · 家的味道', ink: '#b21e24', accent: '#2a2a2a', header: '#f5efe6' },
}

// ---------- 程序贴图 ----------
const hasDom = typeof document !== 'undefined'
const texCache = new Map<string, THREE.Texture | null>()
function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.Texture | null {
  if (texCache.has(key)) return texCache.get(key)!
  if (!hasDom) { texCache.set(key, null); return null }
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')!; draw(g, w, h)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  texCache.set(key, t); return t
}
const FONT = "'Noto Sans CJK SC','Noto Sans SC','Microsoft YaHei',sans-serif"
function headerTex(b: VendingBrand) {
  const B = BRAND[b]
  return canvasTex('vm-head-' + b, 512, 160, (g, w, h) => {
    g.fillStyle = B.header; g.fillRect(0, 0, w, h)
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0.08)'); g.fillStyle = gr; g.fillRect(0, 0, w, h)
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.font = `900 78px ${FONT}`
    if (b === 'northstar') { // 星形替代字母 O
      const txt = ['N', '', 'RTHSTAR']; g.fillStyle = B.ink
      const wN = g.measureText('N').width, wR = g.measureText('RTHSTAR').width, star = 66, total = wN + star + wR, x0 = w / 2 - total / 2
      g.textAlign = 'left'; g.fillText(txt[0], x0, h * 0.44); g.fillText(txt[2], x0 + wN + star, h * 0.44)
      starPath(g, x0 + wN + star / 2, h * 0.44, 31, 13); g.fillStyle = B.accent; g.fill(); g.textAlign = 'center'
    } else if (b === 'fuyou') {
      g.fillStyle = B.ink; g.fillText(B.title, w / 2 + 20, h * 0.44)
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.arc(70 + Math.cos(a) * 13, h * 0.44 + Math.sin(a) * 13, 12, 0, Math.PI * 2); g.fillStyle = B.accent; g.fill() }
    } else if (b === 'kindred') {
      g.font = `italic 900 84px Georgia,${FONT}`; g.fillStyle = B.ink; g.fillText(B.title, w / 2, h * 0.43)
      g.strokeStyle = B.ink; g.lineWidth = 5; g.beginPath(); g.moveTo(90, h * 0.7); g.bezierCurveTo(200, h * 0.6, 320, h * 0.82, 430, h * 0.66); g.stroke()
    } else { g.fillStyle = B.ink; g.fillText(B.title, w / 2, h * 0.44) }
    g.font = `600 22px ${FONT}`; g.fillStyle = b === 'kindred' ? '#5a4a40' : '#555'; g.fillText(B.sub, w / 2, h * 0.84)
  })
}
function starPath(g: CanvasRenderingContext2D, cx: number, cy: number, R: number, r: number) {
  g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) } g.closePath()
}
function tagTex(code: string) {
  return canvasTex('vm-tag-' + code, 128, 48, (g, w, h) => {
    g.fillStyle = '#e8e6de'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#16181b'; g.fillRect(6, 8, w - 12, h - 16)
    g.font = `700 22px ${FONT}`; g.textBaseline = 'middle'; g.fillStyle = '#f0ede4'; g.textAlign = 'left'; g.fillText(code, 12, h / 2 + 1)
    g.textAlign = 'right'; g.fillText('¥0', w - 12, h / 2 + 1)
  })
}
/** 背面：普通机是贴纸 + 型号铭牌；E36 印着艾里克家族的标语（维基原文） */
function backTex(variant: VendingVariant) {
  return canvasTex('vm-back-' + variant, 256, 512, (g, w, h) => {
    g.fillStyle = variant === 'e36' ? '#cfc8bb' : '#b9bbbd'; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 1 + Math.random() * 2) }
    g.textAlign = 'center'; g.fillStyle = '#2a2a2a'
    if (variant === 'e36') {
      g.fillStyle = '#3a2420'; g.fillRect(28, 120, w - 56, 250)
      g.fillStyle = '#efe6d6'; g.font = `900 30px ${FONT}`; g.fillText('人制品售货机', w / 2, 170)
      g.font = `600 19px ${FONT}`; g.fillText('艾里克家族出品', w / 2, 210)
      g.font = `italic 600 17px ${FONT}`; g.fillText('「它于人人，人人为它，', w / 2, 262); g.fillText('它为人人。」', w / 2, 288)
      g.font = `600 16px ${FONT}`; g.fillText('2019，亚利桑那', w / 2, 340)
      g.fillStyle = '#4a3a30'; g.font = `600 13px ${FONT}`; g.fillText('ERIC FAMILY · CANNIBAL CUISINES', w / 2, 400)
    } else {
      g.fillStyle = '#e9e6dc'; g.fillRect(40, 60, w - 80, 70); g.fillStyle = '#333'; g.font = `700 16px ${FONT}`
      g.fillText('MODEL VM-8C · 100V 50/60Hz', w / 2, 92); g.font = `500 13px ${FONT}`; g.fillText('SERIAL 0000-0000-0000', w / 2, 116)
      g.fillStyle = '#d8b54a'; g.fillRect(70, 380, w - 140, 54); g.fillStyle = '#222'; g.font = `700 15px ${FONT}`; g.fillText('⚠ 背面勿贴墙 10cm', w / 2, 413)
    }
  })
}
function nameTex(name: string) {
  return canvasTex('vm-name-' + name, 128, 40, (g, w, h) => {
    g.fillStyle = '#d9cfb8'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a1a14'; g.font = `700 20px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, w / 2, h / 2 + 1)
  })
}
/** 商品标签（罐身 / 瓶身 / 包装袋） */
function labelTex(id: VendingProduct) {
  return canvasTex('vm-lbl-' + id, 128, 128, (g, w, h) => {
    const P: Partial<Record<VendingProduct, [string, string, string]>> = {
      almond: ['#f1efe4', '#2f6b3d', 'ALMONDO'], coffee: ['#4a2a1c', '#e8c48a', 'KOPI'], canned: ['#b7b9b6', '#7c7e7a', ''], cashew: ['#d9cdb2', '#6b4a2a', 'CASHEW'],
      luckymilk: ['#eef3fa', '#3aa35a', '福友'], meatcandy: ['#e88aa8', '#fff3a8', 'SWEET'], spinechips: ['#e2b23a', '#b2241e', 'CRISPY'], bloodsoda: ['#f0ede4', '#b21e24', 'KINDRED'],
      teeth: ['#ffffff', '#555555', ''], ears: ['#f2e2c8', '#8a2a2a', 'GIFT'], frostskin: ['#f4f0f6', '#b26a8a', 'FROSTED'],
    }
    const [bg, fg, txt] = P[id] ?? ['#ddd', '#333', '']
    g.fillStyle = bg; g.fillRect(0, 0, w, h)
    g.fillStyle = fg; g.fillRect(0, h * 0.12, w, h * 0.06); g.fillRect(0, h * 0.82, w, h * 0.06)
    if (id === 'luckymilk') for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.arc(w / 2 + Math.cos(a) * 11, h * 0.42 + Math.sin(a) * 11, 10, 0, Math.PI * 2); g.fill() }
    if (id === 'spinechips') { g.fillStyle = '#7a1a14'; g.beginPath(); g.ellipse(w / 2, h * 0.5, 30, 18, 0, 0, Math.PI * 2); g.fill() }
    if (id === 'canned') { g.fillStyle = '#9a9c98'; for (let y = 20; y < h; y += 14) g.fillRect(0, y, w, 3) }
    g.font = `900 24px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg; if (txt) g.fillText(txt, w / 2, h * 0.66)
  })
}

// ---------- 材质（模块级缓存） ----------
const matCache = new Map<string, THREE.Material>()
function std(color: string, rough = 0.6, metal = 0, extra: Partial<Parameters<typeof litMaterial>[0]> = {}, key = '') {
  const k = getMaterialMode() + 's' + color + rough + metal + key; const hit = matCache.get(k); if (hit) return hit
  const m = litMaterial({ color, roughness: rough, metalness: metal, ...extra }); matCache.set(k, m); return m
}
function basic(color: string, extra: Partial<THREE.MeshBasicMaterialParameters> = {}, key = '') {
  const k = 'b' + color + key; const hit = matCache.get(k); if (hit) return hit
  const m = new THREE.MeshBasicMaterial({ color, toneMapped: false, ...extra }); matCache.set(k, m); return m
}
function texMat(key: string, tex: THREE.Texture | null, fallback: string, emissive = false) {
  const k = getMaterialMode() + 't' + key; const hit = matCache.get(k); if (hit) return hit
  const m = emissive ? new THREE.MeshBasicMaterial({ map: tex ?? undefined, color: tex ? '#ffffff' : fallback, toneMapped: false })
    : litMaterial({ map: tex ?? undefined, color: tex ? '#ffffff' : fallback, roughness: 0.55 })
  matCache.set(k, m); return m
}
const BONE = () => std('#e2dccb', 0.7, 0, {}, 'bone')
const BONE_METAL = () => std('#bfc3c6', 0.38, 0.45, {}, 'bonemetal') // 维基：手臂涂有不明的金属涂装
const geoCache = new Map<string, THREE.BufferGeometry>()
const G = <T extends THREE.BufferGeometry>(k: string, mk: () => T): T => { const hit = geoCache.get(k); if (hit) return hit as T; const g = mk(); geoCache.set(k, g); return g }
function bx(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(G(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), mat); m.position.set(x, y, z); return m
}
function cy(rt: number, rb: number, h: number, mat: THREE.Material, seg = 14, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(G(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), mat); m.position.set(x, y, z); return m
}
function sp(r: number, mat: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(G(`s${r}`, () => new THREE.SphereGeometry(r, 12, 9)), mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); return m
}
function plane(w: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(G(`p${w},${h}`, () => new THREE.PlaneGeometry(w, h)), mat); m.position.set(x, y, z); return m
}

// ---------- 商品模型（约 0.13 宽 × 0.17 高以内，底面贴 y=0） ----------
export function buildProduct(id: VendingProduct): THREE.Group {
  const g = new THREE.Group(); g.name = 'product-' + id
  const lbl = () => texMat('lbl-' + id, labelTex(id), '#ccc')
  switch (id) {
    case 'almond': case 'cashew': { // 透明塑料瓶 + 液体 + 瓶盖 + 标签环
      const liquid = id === 'almond' ? '#f2efe2' : '#d9c39a'
      g.add(cy(0.036, 0.036, 0.13, std(liquid, 0.25, 0, { transparent: true, opacity: 0.85 }, 'liq'), 14, 0, 0.068, 0))
      g.add(cy(0.0375, 0.0375, 0.05, lbl(), 14, 0, 0.07, 0))
      g.add(cy(0.018, 0.034, 0.03, std('#dfe6ea', 0.2, 0, { transparent: true, opacity: 0.6 }, 'pet'), 12, 0, 0.148, 0))
      g.add(cy(0.016, 0.016, 0.018, std(id === 'almond' ? '#3a7ac0' : '#8a5a2a', 0.5), 10, 0, 0.17, 0)); break
    }
    case 'coffee': case 'bloodsoda': { // 铝罐
      if (id === 'coffee') { g.add(cy(0.033, 0.033, 0.12, lbl(), 16, 0, 0.062, 0)); g.add(cy(0.028, 0.033, 0.012, std('#c9ccd0', 0.3, 0.8), 16, 0, 0.128, 0)) }
      else { // 气泡血：透明瓶，液体像苏打水一样冒泡
        g.add(cy(0.034, 0.034, 0.13, std('#8a0f14', 0.15, 0, { transparent: true, opacity: 0.88 }, 'blood'), 14, 0, 0.068, 0))
        g.add(cy(0.0352, 0.0352, 0.04, lbl(), 14, 0, 0.07, 0))
        for (let i = 0; i < 6; i++) g.add(sp(0.005, std('#e8b0b0', 0.2), Math.sin(i * 2.3) * 0.02, 0.03 + i * 0.016, 0.03))
        g.add(cy(0.016, 0.03, 0.03, std('#7a0e12', 0.2, 0, { transparent: true, opacity: 0.85 }, 'blood2'), 12, 0, 0.148, 0))
        g.add(cy(0.015, 0.015, 0.016, std('#c9ccd0', 0.3, 0.8), 10, 0, 0.168, 0))
      }
      break
    }
    case 'canned': g.add(cy(0.042, 0.042, 0.085, lbl(), 18, 0, 0.0425, 0)); g.add(cy(0.043, 0.043, 0.006, std('#cfd2d4', 0.3, 0.85), 18, 0, 0.087, 0)); break
    case 'luckymilk': { // 屋顶形纸盒
      g.add(bx(0.07, 0.11, 0.07, lbl(), 0, 0.055, 0))
      const roof = new THREE.Mesh(G('vm-roof', () => { const s = new THREE.Shape(); s.moveTo(-0.035, 0); s.lineTo(0.035, 0); s.lineTo(0, 0.035); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: false }) }), std('#eef3fa', 0.6))
      roof.position.set(0, 0.11, -0.035); g.add(roof); g.add(bx(0.012, 0.012, 0.07, std('#eef3fa', 0.6), 0, 0.15, 0)); break
    }
    case 'meatcandy': { // 维基：一块四英寸用糖果纸简单包裹的人肉块
      g.add(sp(0.05, std('#e88aa8', 0.25, 0, { transparent: true, opacity: 0.55 }, 'wrap'), 0, 0.05, 0, 1.15, 0.8, 0.8))
      g.add(sp(0.042, std('#8a2a2a', 0.55), 0, 0.05, 0, 1.1, 0.75, 0.75))
      for (const s of [-1, 1]) { const tw = cy(0.002, 0.03, 0.04, std('#e88aa8', 0.25, 0, { transparent: true, opacity: 0.7 }, 'wrap2'), 8, s * 0.075, 0.05, 0); tw.rotation.z = s * Math.PI / 2; g.add(tw) }
      break
    }
    case 'spinechips': { // 一包装着 10–15 截脊髓的薯片袋（枕形袋）
      const bag = bx(0.11, 0.15, 0.04, lbl(), 0, 0.075, 0); bag.scale.set(1, 1, 1); g.add(bag)
      g.add(sp(0.05, lbl(), 0, 0.075, 0, 1.05, 1.35, 0.42))
      g.add(bx(0.115, 0.012, 0.03, std('#b8b8b8', 0.3, 0.6), 0, 0.152, 0))
      for (let i = 0; i < 3; i++) g.add(cy(0.008, 0.008, 0.02, BONE(), 8, -0.02 + i * 0.02, 0.165, 0.004))
      break
    }
    case 'bloodhalf': { // 一半瓶装在透明瓶子里的人血
      g.add(cy(0.036, 0.036, 0.14, std('#dfe6ea', 0.15, 0, { transparent: true, opacity: 0.35 }, 'glass'), 14, 0, 0.072, 0))
      g.add(cy(0.033, 0.033, 0.065, std('#6a0a10', 0.2, 0, { transparent: true, opacity: 0.92 }, 'bloodd'), 14, 0, 0.034, 0))
      g.add(cy(0.016, 0.016, 0.02, std('#2a2a2a', 0.5), 10, 0, 0.152, 0)); break
    }
    case 'heart': {
      const m = std('#7a1418', 0.35, 0, {}, 'heart')
      g.add(sp(0.045, m, 0, 0.06, 0, 1, 1.2, 0.9)); g.add(sp(0.03, m, -0.022, 0.1, 0.004)); g.add(sp(0.028, m, 0.022, 0.1, 0))
      const ao = cy(0.012, 0.014, 0.05, std('#9a3a3a', 0.4), 8, 0.01, 0.13, 0); ao.rotation.z = -0.4; g.add(ao)
      g.add(bx(0.13, 0.008, 0.08, std('#e8e6de', 0.6), 0, 0.004, 0)); break // 托盘
    }
    case 'esophagus': { // 一条沾满血的食道：弯曲软管
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.05, 0.01, 0), new THREE.Vector3(-0.03, 0.08, 0.01), new THREE.Vector3(0.02, 0.12, -0.01), new THREE.Vector3(0.05, 0.05, 0.01), new THREE.Vector3(0.03, 0.01, 0)])
      g.add(new THREE.Mesh(G('vm-eso', () => new THREE.TubeGeometry(curve, 24, 0.014, 8)), std('#a03a3a', 0.3, 0, {}, 'eso')))
      for (let i = 0; i < 4; i++) g.add(sp(0.008, std('#5a0a0e', 0.2), -0.04 + i * 0.03, 0.004, 0.01)); break
    }
    case 'teeth': { // 一袋 20 颗牙齿的塑料袋
      g.add(sp(0.05, std('#f4f4f2', 0.15, 0, { transparent: true, opacity: 0.35 }, 'poly'), 0, 0.055, 0, 1, 1.1, 0.7))
      for (let i = 0; i < 12; i++) g.add(sp(0.008, std('#efe8d2', 0.4), Math.sin(i * 1.7) * 0.03, 0.02 + (i % 4) * 0.014, Math.cos(i * 2.1) * 0.02, 0.8, 1.2, 0.8))
      g.add(bx(0.03, 0.02, 0.01, std('#3a7ac0', 0.5), 0, 0.115, 0)); break // 扎口
    }
    case 'ears': { // 一个装着 2 个人耳的小盒子（开盖）
      g.add(bx(0.11, 0.04, 0.08, lbl(), 0, 0.02, 0))
      const lid = bx(0.11, 0.06, 0.006, lbl(), 0, 0.07, -0.042); lid.rotation.x = -0.25; g.add(lid)
      for (const s of [-1, 1]) { const ear = new THREE.Mesh(G('vm-ear', () => new THREE.TorusGeometry(0.018, 0.008, 6, 12, Math.PI * 1.4)), std('#d9a58a', 0.5, 0, {}, 'skin')); ear.position.set(s * 0.025, 0.045, 0); ear.rotation.set(-0.6, 0, s * 0.6); g.add(ear) }
      break
    }
    case 'drumstick': { // 一块很像鸡腿的人肉
      g.add(sp(0.04, std('#a8642e', 0.5, 0, {}, 'roast'), 0, 0.045, 0, 1.4, 0.9, 0.9))
      const b = cy(0.009, 0.009, 0.06, BONE(), 8, 0.06, 0.05, 0); b.rotation.z = Math.PI / 2; g.add(b); g.add(sp(0.013, BONE(), 0.09, 0.05, 0)); break
    }
    case 'frostskin': { // 沾上了一些糖霜的人皮（叠起的薄片 + 白色糖霜点）
      for (let i = 0; i < 3; i++) { const s = bx(0.1, 0.008, 0.07, std('#d9a58a', 0.55, 0, {}, 'skin2'), (i - 1) * 0.006, 0.006 + i * 0.01, 0); s.rotation.y = i * 0.15; g.add(s) }
      for (let i = 0; i < 10; i++) g.add(sp(0.006, std('#ffffff', 0.4), Math.sin(i * 2.7) * 0.04, 0.038, Math.cos(i * 1.9) * 0.025))
      g.add(bx(0.12, 0.06, 0.004, lbl(), 0, 0.03, -0.04)); break // 背卡
    }
  }
  return g
}

/** 出货螺旋线：轴沿 +Z，半径 r、长 len、圈数 turns */
class HelixCurve extends THREE.Curve<THREE.Vector3> {
  r: number; len: number; turns: number
  constructor(r: number, len: number, turns: number) { super(); this.r = r; this.len = len; this.turns = turns }
  getPoint(t: number, out = new THREE.Vector3()) { const a = t * this.turns * Math.PI * 2; return out.set(Math.cos(a) * this.r, Math.sin(a) * this.r + this.r * 0.2, t * this.len) }
}

// ---------- 骷髅臂（肩 → 肘 → 腕 → 五指，刚性关节层级，阶段 2 做动画） ----------
export interface BoneArm { root: THREE.Group; elbow: THREE.Group; wrist: THREE.Group; fingers: THREE.Group[]; len: number }
export function buildBoneArm(len = 1.37, metal = true, thick = 1): BoneArm {
  const m = metal ? BONE_METAL() : BONE()
  const up = len * 0.44, fo = len * 0.4
  const root = new THREE.Group(); root.name = 'boneArm'
  const t = thick
  root.add(sp(0.045 * len * t, m)) // 肩关节球
  const h1 = cy(0.024 * len * t, 0.019 * len * t, up, m, 8, 0, -up / 2, 0); root.add(h1)
  root.add(sp(0.032 * len * t, m, 0, -up * 0.96, 0, 1.25, 0.9, 1.1)) // 肱骨远端髁
  const elbow = new THREE.Group(); elbow.position.y = -up; root.add(elbow)
  elbow.add(sp(0.028 * len * t, m, 0, 0.0, -0.012 * len, 0.8, 1, 1)) // 鹰嘴
  for (const dx of [-0.014, 0.014]) elbow.add(cy(0.013 * len * t, 0.01 * len * t, fo, m, 7, dx * len, -fo / 2, 0)) // 桡骨 + 尺骨
  const wrist = new THREE.Group(); wrist.position.y = -fo; elbow.add(wrist)
  wrist.add(bx(0.07 * len, 0.03 * len, 0.03 * len * t, m, 0, -0.012 * len, 0)) // 腕骨
  const fingers: THREE.Group[] = []
  for (let i = 0; i < 5; i++) {
    const thumb = i === 4
    const f = new THREE.Group()
    const fx = thumb ? 0.04 * len : (-0.027 + i * 0.018) * len
    f.position.set(fx, thumb ? -0.03 * len : -0.03 * len, thumb ? 0.012 * len : 0)
    if (thumb) f.rotation.z = 0.7
    const mc = (thumb ? 0.035 : 0.055) * len // 掌骨
    f.add(cy(0.0065 * len * t, 0.0055 * len * t, mc, m, 6, 0, -mc / 2, 0))
    let parent: THREE.Object3D = f, y = -mc
    for (let k = 0; k < (thumb ? 2 : 3); k++) { // 指骨
      const seg = new THREE.Group(); seg.position.y = y; parent.add(seg)
      const sl = (0.034 - k * 0.008) * len
      seg.add(sp(0.0075 * len * t, m)); seg.add(cy(0.0055 * len * t, 0.0045 * len * t, sl, m, 6, 0, -sl / 2, 0))
      seg.rotation.x = 0.12; parent = seg; y = -sl
    }
    wrist.add(f); fingers.push(f)
  }
  return { root, elbow, wrist, fingers, len }
}

// ---------- 艾里克尸体（暗格内，拆解后可见）----------
// 沿用人类 NPC 复古模型（buildAvatarModel），再按 wiki 的「异于常人」改造：
//   手臂全部脱落（上臂骨缩到 0，肩头留暗红断面）· 短腿（大腿骨 y 缩到 0.55）· 无趾骨（脚掌缩成圆钝的一截）·
//   大下颚（spec.jaw ×1.5，再挂一块能开合的下颌，下颌开合 = 低语）· 额头贴名字纸条 · 三具腐败程度不同（灰白 → 灰绿 → 暗灰褐）
const CORPSE_SKIN = [0xa8b8be, 0x98aaa6, 0x8a948c] // 压低红色通道：照片肤色 × 冷灰 = 灰败的尸体皮肤 // 照片肤色 × 灰色调 = 尸体的灰败感
export const ERIC_NAMES = ['亨利 艾里克', '史蒂文 艾里克', '马文 艾里克']
function mulHex(a: string, t: number) { const c = parseInt(a.slice(1), 16), f = (sh: number) => Math.round(((c >> sh) & 255) * ((t >> sh) & 255) / 255); return '#' + ((f(16) << 16) | (f(8) << 8) | f(0)).toString(16).padStart(6, '0') }
function buildEricCorpse(name: string, decay: number): THREE.Group {
  const g = new THREE.Group(); g.name = 'eric-' + name
  const seed = 3600 + decay * 17
  const cfg = randomAvatar(mulberry(seed))
  cfg.gender = 0; cfg.glasses = 0; cfg.skin = ['#f0c8a8', '#c9a58a', '#f0c8a8'][decay]; cfg.hairColor = ['#3a3836', '#5a5652', '#2a2826'][decay]; cfg.beard = decay === 1 ? 3 : 0; cfg.hair = [3, 0, 3][decay] ?? 0
  cfg.top = ['#5a5852', '#4a4c46', '#3e3a34'][decay]; cfg.pants = ['#3a3936', '#33332f', '#2c2a26'][decay]; cfg.topStyle = 0; cfg.pantsStyle = 0
  const pm = buildAvatarModel(cfg, { seed, driven: true, closedEyes: decay !== 2, specPatch: (sp) => {
    sp.skinTint = CORPSE_SKIN[decay]; sp.jaw *= 1.5; sp.belly = 0; sp.waist *= 0.86; sp.shoulder *= 0.92
    sp.top = { ...sp.top, sleeves: 'none' }
    sp.shoe = { color: parseInt(mulHex(cfg.skin, CORPSE_SKIN[decay]).slice(1), 16), style: 'loafer' } // 赤脚：鞋按灰皮肤色画，脚掌缩成没有趾头的一截
  } })
  const npc = pm.userData.retro as import('./retroNpc').RetroNpc
  const B = npc.bones
  // 无臂
  for (const k of ['upperArmL', 'upperArmR'] as const) B[k].scale.setScalar(0.001)
  const wound = std('#4a1612', 0.9, 0, {}, 'eric-wound'), skinC = mulHex(cfg.skin, CORPSE_SKIN[decay])
  const skin = std(skinC, 0.85, 0, {}, 'eric-skin' + decay)
  for (const s of [-1, 1]) { const st = sp(0.05, skin, s * 0.2, 1.39, -0.01, 0.9, 0.75, 0.9); g.add(st); g.add(sp(0.032, wound, s * 0.235, 1.37, -0.01, 0.5, 1, 1)) }
  // 短腿 + 无趾
  for (const k of ['thighL', 'thighR'] as const) B[k].scale.set(1, 0.55, 1)
  for (const k of ['footL', 'footR'] as const) B[k].scale.set(1, 1.6, 0.42)
  pm.position.y = -0.4
  g.add(pm)
  // 大下颌（可开合）：下巴下面一块灰色的大下颌 + 张开时露出的暗色口腔
  const hf = npc.headFrame
  const jawP = new THREE.Group(); jawP.name = 'jaw'; jawP.position.set(0, hf.chinY + 0.055, hf.faceZ - 0.06); jawP.rotation.x = 0.12; B.head.add(jawP)
  jawP.add(bx(hf.halfW * 1.55, 0.03, 0.085, skin, 0, -0.04, 0.035))
  jawP.add(bx(hf.halfW * 1.25, 0.01, 0.07, std('#1a0d0b', 0.95, 0, {}, 'eric-mouth'), 0, -0.022, 0.035))
  for (let k = 0; k < 6; k++) jawP.add(bx(0.007, 0.01, 0.005, std('#b8ae90', 0.6, 0, {}, 'eric-tooth'), (k - 2.5) * 0.012, -0.018, 0.075))
  // 额头的名字纸条
  const tag = plane(0.11, 0.032, texMat('name-' + name, nameTex(name), '#d9cfb8'), 0, hf.eyeY + 0.055, hf.faceZ + 0.006); tag.rotation.x = -0.15; tag.rotation.z = (decay - 1) * 0.08; B.head.add(tag)
  // 姿态：头歪向一侧，越腐败越垂
  B.head.rotation.set(0.12 + decay * 0.1, 0, (decay - 1) * 0.18)
  B.spine.rotation.x = 0.05 * decay
  g.userData.corpse = npc
  return g
}

const handles0 = (legs: BoneArm[], hatchBottom: THREE.Group, body: THREE.Group) => ({ legs, hatchBottom, body })
/**
 * 骷髅腿两骨 IK（腿根局部坐标，+Z = 机身正面，-Y = 向下）：把腕关节放到 (tz, ty)，肘关节朝后（像鸟腿），
 * 手掌始终贴平地面（lift>0 时手腕下垂、指尖收拢）。splay = 腿面绕 Z 外撇的角度（两腿各自在自己的斜面里，不会交叉）。
 */
export function legIK(L: BoneArm, s: number, tz: number, ty: number, lift = 0, splay = 0.12) {
  const a = L.len * 0.44, b = L.len * 0.4
  const y = ty / Math.cos(splay)
  let d = Math.hypot(tz, y)
  const dMax = a + b - 0.005, dMin = 0.12
  const k = d > dMax ? dMax / d : d < dMin ? dMin / d : 1
  const z = tz * k, yy = y * k; d *= k
  const th0 = Math.atan2(-z, -yy) // 直腿指向目标的俯仰（负 = 向前）
  const beta = Math.acos(clamp1((a * a + d * d - b * b) / (2 * a * d)))
  const gam = Math.acos(clamp1((a * a + b * b - d * d) / (2 * a * b)))
  const th = th0 + beta, el = -(Math.PI - gam)
  L.root.rotation.set(th, 0, s * splay)
  L.elbow.rotation.set(el, 0, 0)
  L.wrist.rotation.set(-Math.PI / 2 + 0.1 - (th + el) + lift * 0.9, 0, 0)
  L.fingers.forEach((f, j) => { if (j < 4) f.rotation.x = -0.25 + lift * 0.4 })
}
const clamp1 = (x: number) => Math.max(-1, Math.min(1, x))
export const LEG_ROOT_Y = 0.12
export const LEG_WRIST_Y = 0.036 // 手掌平贴地面时腕关节离地高度
/** 活化站姿：底门打开，两条骷髅臂先贴地向前伸出，手掌按住地面后把机身撑起约 1 m（全程手掌不入地）。k=0 收起 / 1 站立 */
export function poseVendingStand(h: { legs: BoneArm[]; hatchBottom: THREE.Group; body: THREE.Group }, k: number) {
  for (const dr of h.hatchBottom.children) dr.rotation.z = (dr.name === 'door1' ? -1 : 1) * 1.45 * Math.min(1, k * 3)
  const u = Math.min(1, k / 0.35), r = Math.max(0, Math.min(1, (k - 0.3) / 0.7))
  const er = r * r * (3 - 2 * r)
  h.body.position.y = 0.98 * er
  const rootH = h.body.position.y + LEG_ROOT_Y
  h.legs.forEach((L, i) => {
    const s = i ? 1 : -1
    L.root.visible = k > 0.02
    const tz = r > 0 ? 0.55 + (0.06 - 0.55) * er : 0.12 + (0.55 - 0.12) * u
    legIK(L, s, tz, -(rootH - LEG_WRIST_Y))
  })
}

export interface VendingOpts { variant?: VendingVariant; brand?: VendingBrand; seed?: number; slots?: (VendingProduct | null)[]; jammed?: boolean; mad?: boolean; dismantled?: boolean }
export interface VendingHandles {
  variant: VendingVariant; brand: VendingBrand
  slots: { code: string; product: VendingProduct | null; item: THREE.Group | null; lampOk: THREE.Mesh; lampOut: THREE.Mesh; base: THREE.Vector3; coil: THREE.Mesh | null }[]
  pusher: BoneArm; topArm: BoneArm; legs: BoneArm[]; hatchTop: THREE.Group; hatchBottom: THREE.Group; eric: THREE.Group; body: THREE.Group
  display: THREE.Mesh; flap: THREE.Group; jamItem: THREE.Group | null; glass: THREE.Mesh[]; bayLights: THREE.Mesh[]
}

/** 普通售货机与 Entity 36 共用的机身。返回的 Group.userData.vending 是动画 / 界面要用的句柄。 */
export function buildVendingMachine(o: VendingOpts = {}): THREE.Group {
  const job = buildVendingMachineJob(o); let step = job.next(); while (!step.done) step = job.next(); return step.value
}
/** Prepare animated assemblies across frames before publishing a complete rig. */
export function* buildVendingMachineJob(o: VendingOpts = {}): Generator<void, THREE.Group, unknown> {
  const variant = o.variant ?? 'normal'
  const rnd = mulberry((o.seed ?? 7) * 7919)
  const lay = vendingLayout(variant, o.seed ?? 7) // 品牌与每格商品和引擎 / 界面共用同一套布局
  const brand: VendingBrand = o.brand ?? lay.brand
  const B = BRAND[brand]
  const { w: W, h: H, d: D } = VENDING_DIM
  const root = new THREE.Group(); root.name = 'vending-' + variant
  let complete = false
  try {
  const body = new THREE.Group(); body.name = 'vmBody'; root.add(body) // 机身（活化时被骷髅腿托起）
  const casing = std(B.body, 0.55, 0.15, {}, 'case'), face = std(B.face, 0.45, 0.05, {}, 'face'), dark = std('#141518', 0.7), trim = std('#c9cbcd', 0.35, 0.7, {}, 'trim')
  // 外壳：两侧板 + 顶板 + 背板 + 底座（踢脚板凹进）
  for (const s of [-1, 1]) body.add(bx(0.05, H - 0.06, D, casing, s * (W / 2 - 0.025), H / 2 + 0.03, 0))
  body.add(bx(W, 0.05, D, casing, 0, H - 0.025, 0))
  const back = bx(W - 0.1, H - 0.12, 0.03, casing, 0, H / 2 + 0.03, -D / 2 + 0.015); body.add(back)
  const backPanel = plane(W - 0.14, H - 0.3, texMat('back-' + variant, backTex(variant), '#bbb'), 0, H / 2 + 0.05, -D / 2 - 0.002); backPanel.rotation.y = Math.PI; body.add(backPanel)
  body.add(bx(W - 0.08, 0.08, D - 0.08, dark, 0, 0.04, -0.02)) // 踢脚
  // 正面框（米白面板）
  body.add(bx(W - 0.1, 0.06, 0.04, face, 0, H - 0.08, FRONT - 0.02))
  // 顶部品牌灯箱
  const head = plane(W - 0.16, 0.22, texMat('head-' + brand, headerTex(brand), B.header, true), 0, 1.66, FRONT + 0.004); body.add(head)
  body.add(bx(W - 0.1, 0.26, 0.03, face, 0, 1.66, FRONT - 0.02))
  yield
  // 陈列窗（两层）：内衬发光背板 + 底板 + 格位 + 价签 + 灯条
  const bayW = 0.68, bayX = -0.07
  const glass: THREE.Mesh[] = [], bayLights: THREE.Mesh[] = []
  const glassMat = std('#cfe3ea', 0.05, 0.1, { transparent: true, opacity: variant === 'e36' ? 0.32 : 0.16, depthWrite: false }, 'glass' + variant)
  const backLit = basic(variant === 'e36' ? '#e8dcc8' : '#f4f6f2', {}, 'lit' + variant)
  const slots: VendingHandles['slots'] = []
  const pool: VendingProduct[] = lay.products
  for (let r = 0; r < 2; r++) {
    const y0 = ROW_Y[r]
    for (const s of [-1, 1]) body.add(bx(0.03, 0.42, 0.03, face, bayX + s * (bayW / 2 + 0.015), y0 + 0.2, FRONT - 0.02)) // 窗框左右边
    const lit = plane(bayW, 0.36, backLit, bayX, y0 + 0.2, FRONT - VM_BACK); body.add(lit); bayLights.push(lit) // 发光背板
    for (const s of [-1, 1]) body.add(bx(0.02, 0.38, 0.215, face, bayX + s * (bayW / 2 + 0.01), y0 + 0.2, FRONT - 0.1195)) // 窗内侧壁（一直伸到玻璃，把落货通道两侧封住）
    // 底板 / 顶板只到 FRONT-0.07：前面留出一条 ~6 cm 的落货通道（货从格口翻下，贴着玻璃后面掉进取货口）
    body.add(bx(bayW, 0.025, SHELF_D, face, bayX, y0 + 0.012, FRONT - VM_SHELF_EDGE - SHELF_D / 2)) // 底板
    body.add(bx(bayW, 0.012, SHELF_D, face, bayX, y0 + 0.39, FRONT - VM_SHELF_EDGE - SHELF_D / 2)) // 顶板
    const gl = plane(bayW, 0.37, glassMat, bayX, y0 + 0.2, FRONT - 0.012); body.add(gl); glass.push(gl)
    // 灯条（圆角横条，每格一个小窗：上绿灯 = 有货，红灯 = 售罄）
    body.add(bx(bayW + 0.06, 0.105, 0.012, face, bayX, y0 - 0.0375, FRONT - 0.006)) // 灯条后面的薄面板（挡住落货通道的这一段）
    const bar = cy(0.03, 0.03, bayW + 0.08, face, 12, bayX, y0 - 0.06, FRONT + 0.014); bar.rotation.z = Math.PI / 2; body.add(bar)
    for (const s of [-1, 1]) body.add(sp(0.03, face, bayX + s * (bayW / 2 + 0.04), y0 - 0.06, FRONT + 0.014))
    for (let c = 0; c < 4; c++) {
      const i = r * 4 + c, x = COL_X[c]
      const product: VendingProduct | null = o.slots ? (o.slots[i] ?? null) : pool[i % pool.length]
      // 价签（编号 + ¥0）
      body.add(plane(0.1, 0.038, texMat('tag-' + SLOT_CODES[i], tagTex(SLOT_CODES[i]), '#222'), x, y0 + 0.012, FRONT - VM_SHELF_EDGE + 0.002))
      body.add(bx(0.08, 0.026, 0.005, dark, x, y0 - 0.06, FRONT + 0.046))
      const lampOk = plane(0.016, 0.01, basic('#3fe07a', {}, 'ok'), x - 0.02, y0 - 0.06, FRONT + 0.0495)
      const lampOut = plane(0.016, 0.01, basic('#ff2a1e', {}, 'out'), x + 0.02, y0 - 0.06, FRONT + 0.0495)
      lampOk.visible = !!product; lampOut.visible = !product
      body.add(lampOk, lampOut)
      let item: THREE.Group | null = null
      const base = new THREE.Vector3(x, y0 + 0.025, FRONT - 0.165) // 货底贴着搁板面，套在螺旋线里
      if (product) { item = buildProduct(product); item.position.copy(base); item.rotation.y = (rnd() - 0.5) * 0.25; body.add(item) }
      // 普通机：后面还有一圈出货螺旋线（Entity 36 没有——货由白骨手推出）
      let coil: THREE.Mesh | null = null
      if (variant === 'normal') { coil = new THREE.Mesh(G('vm-coil2', () => new THREE.TubeGeometry(new HelixCurve(0.05, 0.11, 2.2), 64, 0.0025, 4)), trim); coil.position.set(x, y0 + 0.068, FRONT - 0.218); body.add(coil) }
      slots.push({ code: SLOT_CODES[i], product, item, lampOk, lampOut, base, coil }); yield
    }
  }
  // 陈列窗之间与下部的面板
  // 两层之间、下部的面板做薄（只占玻璃前那 1.2 cm），后面就是落货通道
  body.add(bx(W - 0.1, 0.07, 0.012, face, 0, 1.12, FRONT - 0.006))
  body.add(bx(W - 0.1, 0.14, 0.012, face, 0, 0.15, FRONT - 0.006)) // 取货口以下
  body.add(bx(W - 0.1, 0.16, 0.012, face, 0, 0.5, FRONT - 0.006)) // 取货口与下层陈列窗之间
  for (const s of [-1, 1]) body.add(bx(0.18, 0.2, 0.012, face, -0.07 + s * 0.36, 0.32, FRONT - 0.006)) // 取货口两侧
  body.add(bx(W - 0.1, 0.06, 0.03, face, 0, 1.53, FRONT - 0.02))
  // 右侧操作区：红色七段数码屏 + 字母键（A/B）+ 数字键（1–4）+ 投币口（装饰）+ 退币杆
  const px = 0.36
  body.add(bx(0.13, 0.88, 0.03, std('#d9d8d2', 0.4), px, 1.1, FRONT - 0.01))
  body.add(bx(0.1, 0.05, 0.012, dark, px, 1.42, FRONT + 0.008))
  const display = plane(0.085, 0.034, basic('#ff3a22', {}, 'disp'), px, 1.42, FRONT + 0.015); display.name = 'vmDisplay'; body.add(display)
  for (let k = 0; k < 2; k++) { body.add(cy(0.016, 0.016, 0.012, std('#e8e6de', 0.4), 12, px - 0.025 + k * 0.05, 1.32, FRONT + 0.01).rotateX(Math.PI / 2)); body.add(plane(0.012, 0.012, basic('#333', {}, 'k'), px - 0.025 + k * 0.05, 1.32, FRONT + 0.0175)) }
  for (let k = 0; k < 4; k++) body.add(cy(0.013, 0.013, 0.012, std('#e8e6de', 0.4), 12, px - 0.03 + (k % 2) * 0.06, 1.23 - Math.floor(k / 2) * 0.045, FRONT + 0.01).rotateX(Math.PI / 2))
  body.add(bx(0.012, 0.05, 0.01, std('#222', 0.4), px, 1.05, FRONT + 0.006)) // 投币口
  body.add(bx(0.05, 0.016, 0.03, trim, px, 0.96, FRONT + 0.012)) // 退币杆
  // 取货口：凹槽 + 可翻开的挡板（pivot 在上沿）
  // 取货口：空心的斗（底 / 后 / 两侧，顶部前沿敞开接住落下的货）
  const binM = std('#4a4d52', 0.7, 0, {}, 'vm-bin') // 斗内壁浅一点，隔着烟色翻板能看见里面躺着的货
  body.add(bx(0.5, 0.012, 0.16, binM, -0.07, 0.226, FRONT - 0.08))
  body.add(bx(0.5, 0.2, 0.012, binM, -0.07, 0.32, FRONT - 0.16))
  for (const s of [-1, 1]) body.add(bx(0.012, 0.2, 0.16, dark, -0.07 + s * 0.25, 0.32, FRONT - 0.08))
  for (const s of [-1, 1]) { body.add(bx(0.54, 0.02, 0.02, face, -0.07, 0.32 + s * 0.11, FRONT)); body.add(bx(0.02, 0.24, 0.02, face, -0.07 + s * 0.26, 0.32, FRONT)) } // 外框（环形，中间是翻板）
  const flap = new THREE.Group(); flap.name = 'vmFlap'; flap.position.set(-0.07, 0.42, FRONT + 0.012); body.add(flap)
  flap.add(bx(0.48, 0.19, 0.012, std('#3a4048', 0.25, 0, { transparent: true, opacity: 0.55 }, 'flap'), 0, -0.095, 0))
  flap.add(plane(0.2, 0.026, texMat('push', canvasTex('vm-push', 128, 20, (g, w, h) => { g.fillStyle = '#20242a'; g.fillRect(0, 0, w, h); g.fillStyle = '#c9c4b8'; g.font = `700 13px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('PUSH 取货口', w / 2, h / 2) }), '#333'), 0, -0.04, 0.007))
  // 卡货：一件货斜卡在出货通道（从取货口翻板上方的玻璃里看得到）
  let jamItem: THREE.Group | null = null
  if (o.jammed) { const it = slots.find((s) => s.product)?.product ?? 'almond'; jamItem = buildProduct(it); jamItem.position.set(COL_X[1], ROW_Y[1] + 0.02, FRONT - 0.112); jamItem.rotation.set(0.2, 0.3, 0.1); body.add(jamItem) }
  // 侧面贴纸 / 磨损（普通机）
  if (variant === 'normal') for (const s of [-1, 1]) { const st = plane(0.36, 0.5, std(B.body, 0.7, 0, {}, 'sideside'), s * (W / 2 + 0.001), 1.0, 0); st.rotation.y = s * Math.PI / 2; body.add(st) }
  yield
  // ---------- Entity 36 专属：暗门、骷髅臂、推货白骨手、艾里克暗格 ----------
  const hatchTop = new THREE.Group(); hatchTop.name = 'vmHatchTop'; hatchTop.position.set(0, H + 0.001, -0.1); body.add(hatchTop)
  const hatchBottom = new THREE.Group(); hatchBottom.name = 'vmHatchBottom'; hatchBottom.position.set(0, 0.0, -0.02); body.add(hatchBottom)
  const emptyArm = (): BoneArm => ({ root: new THREE.Group(), elbow: new THREE.Group(), wrist: new THREE.Group(), fingers: [], len: 1 })
  const topArm = variant === 'e36' ? buildBoneArm(1.37 * 1.25, true, 1.5) : emptyArm(); yield
  const legs: BoneArm[] = []; for (let i = 0; i < 2; i++) { legs.push(variant === 'e36' ? buildBoneArm(1.37, true, 1.3) : emptyArm()); yield }
  const pusher = variant === 'e36' ? buildBoneArm(0.32, false, 1.6) : emptyArm(); yield
  const eric = new THREE.Group(); eric.name = 'vmEric'
  if (variant === 'e36') {
    // 顶门：顶板上一道方形接缝 + 铰链（门板 pivot 在后沿）
    const seam = std('#0e0e10', 0.9)
    for (const [w, d, x, z] of [[0.44, 0.008, 0, 0.17], [0.44, 0.008, 0, -0.17], [0.008, 0.34, -0.22, 0], [0.008, 0.34, 0.22, 0]] as const) hatchTop.add(bx(w, 0.004, d, seam, x, 0.001, z))
    const lid = new THREE.Group(); lid.name = 'lid'; lid.position.z = -0.17; hatchTop.add(lid)
    lid.add(bx(0.43, 0.012, 0.33, casing, 0, 0.004, 0.165))
    for (const x of [-0.15, 0.15]) hatchTop.add(cy(0.008, 0.008, 0.05, trim, 8, x, 0.006, -0.172).rotateZ(Math.PI / 2))
    topArm.root.position.set(0, H - 0.25, 0.02); topArm.root.visible = false; body.add(topArm.root)
    // 底门：踢脚板换成两扇向下翻的门
    const bl = std('#1c1416', 0.7)
    for (const s of [-1, 1]) { const dr = new THREE.Group(); dr.name = 'door' + s; dr.position.set(s * 0.2, 0.002, 0); dr.add(bx(0.4, 0.01, D - 0.12, bl, -s * 0.2 + s * 0.01, 0, 0)); hatchBottom.add(dr) }
    for (const [i, s] of [-1, 1].entries()) { const L = legs[i]; L.root.position.set(s * 0.2, 0.12, -0.02); L.root.visible = !!o.mad; body.add(L.root) }
    // 推货白骨手：藏在陈列格后方，出货时移到对应格位（阶段 2）
    pusher.root.position.set(COL_X[0], ROW_Y[0] + 0.09, FRONT - 0.28); pusher.root.rotation.x = -Math.PI / 2; pusher.root.visible = false; body.add(pusher.root)
    // 后部暗格（拆解后：背板移除，露出三具艾里克尸体与一颗张嘴尖叫的头）
    if (o.dismantled) for (const [i, n] of ERIC_NAMES.entries()) { const c = buildEricCorpse(n, i); c.position.set(-0.27 + i * 0.27, 0.12, -D / 2 + 0.11); c.scale.setScalar(0.7); c.rotation.y = Math.PI + (i - 1) * 0.12; eric.add(c); yield }
    eric.add(bx(W - 0.12, 0.02, 0.26, dark, 0, 0.11, -D / 2 + 0.14))
    eric.visible = !!o.dismantled; body.add(eric)
    if (o.dismantled) { back.visible = false; backPanel.visible = false }
    // 骷髅腿托起机身
    if (o.mad) poseVendingStand(handles0(legs, hatchBottom, body), 1)
  }
  root.traverse((m: any) => { if (m.isMesh && m.material !== glassMat) { m.castShadow = true; m.receiveShadow = true } })
  const handles: VendingHandles = { variant, brand, slots, pusher, topArm, legs, hatchTop, hatchBottom, eric, body, display, flap, jamItem, glass, bayLights }
  root.userData.vending = handles
  ownImportedModel(root, { geometry: true }); complete = true; return root
  } finally { if (!complete) root.clear() }
}
