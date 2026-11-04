// [bellhop] 行李员（Entity 135）道具：黄铜手摇铃、茶杯 + 茶碟（附图）、黄铜行李车（鸟笼式挂杆 + 红地毯底板 + 两只行李箱 + 帽盒）、行李牌。
// 全部按「原点 = 握点 / 底面中心」建造，+Y 向上；bellhopMesh 把手持道具挂到手骨（默认隐藏），行李车挂 root。
import * as THREE from 'three'
import { litMaterial } from './shared'

const PM = {
  brass: litMaterial({ color: '#c09a4e', roughness: 0.28, metalness: 0.8 }),
  brassDk: litMaterial({ color: '#8a6a2e', roughness: 0.35, metalness: 0.75 }),
  wood: litMaterial({ color: '#3a1d10', roughness: 0.5 }),
  china: litMaterial({ color: '#f1ece2', roughness: 0.22 }),
  gilt: litMaterial({ color: '#c9a65a', roughness: 0.3, metalness: 0.7 }),
  tea: litMaterial({ color: '#6a3a16', roughness: 0.08 }),
  carpet: litMaterial({ color: '#6b1a1c', roughness: 1 }),
  rubber: litMaterial({ color: '#141212', roughness: 0.8 }),
  leatherA: litMaterial({ color: '#5a3320', roughness: 0.6 }),
  leatherB: litMaterial({ color: '#2b3a2e', roughness: 0.6 }),
  strap: litMaterial({ color: '#2a1a10', roughness: 0.6 }),
  hatbox: litMaterial({ color: '#d8c8a6', roughness: 0.7 }),
  hatboxBand: litMaterial({ color: '#7a2a2c', roughness: 0.7 }),
  string: litMaterial({ color: '#d8cfb8', roughness: 1 }),
  brassDS: litMaterial({ color: '#c09a4e', roughness: 0.28, metalness: 0.8, side: THREE.DoubleSide }),
}
function pm(g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o }
const V2 = (pts: number[][]) => pts.map(([x, y]) => new THREE.Vector2(x, y))

/** 黄铜手摇铃（原点 = 握把中部；铃口朝 −Y）。userData.clapper 为铃舌（阶段 2 摆动） */
export function buildBellhopBell(): THREE.Group {
  const g = new THREE.Group(); g.name = 'bell'
  // 木柄 + 黄铜箍
  pm(new THREE.LatheGeometry(V2([[0, -0.03], [0.0105, -0.03], [0.012, -0.015], [0.0105, 0.02], [0.013, 0.038], [0.008, 0.05], [0, 0.052]]), 18), PM.wood, g)
  pm(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 18), PM.brass, g, 0, -0.033, 0)
  // 铃身（口朝下）
  const bell = pm(new THREE.LatheGeometry(V2([[0.0, -0.036], [0.01, -0.036], [0.016, -0.045], [0.024, -0.07], [0.033, -0.095], [0.045, -0.108], [0.047, -0.112], [0.043, -0.112], [0.03, -0.1], [0.021, -0.075], [0.013, -0.05], [0, -0.046]]), 28), PM.brassDS, g)
  void bell
  const clap = new THREE.Group(); clap.position.set(0, -0.046, 0); g.add(clap)
  pm(new THREE.CylinderGeometry(0.0018, 0.0018, 0.05, 6), PM.brassDk, clap, 0, -0.025, 0)
  pm(new THREE.SphereGeometry(0.0075, 10, 8), PM.brassDk, clap, 0, -0.052, 0)
  g.userData.clapper = clap
  return g
}

/** 茶杯 + 茶碟（附图）：返回 { cup, saucer } 两个组（各自原点在底面中心），便于分挂两手 */
export function buildBellhopTea(): { cup: THREE.Group; saucer: THREE.Group } {
  const cup = new THREE.Group(); cup.name = 'cup'
  const prof = V2([[0.0, 0], [0.022, 0], [0.025, 0.004], [0.031, 0.026], [0.038, 0.05], [0.04, 0.054], [0.037, 0.054], [0.03, 0.028], [0.02, 0.008], [0, 0.008]])
  pm(new THREE.LatheGeometry(prof, 28), PM.china, cup)
  pm(new THREE.TorusGeometry(0.0395, 0.0011, 4, 32), PM.gilt, cup, 0, 0.054, 0).rotation.x = Math.PI / 2
  pm(new THREE.CircleGeometry(0.034, 24).rotateX(-Math.PI / 2), PM.tea, cup, 0, 0.044, 0)
  pm(new THREE.TorusGeometry(0.0115, 0.003, 8, 14, Math.PI * 1.3), PM.china, cup, 0.039, 0.03, 0).rotation.z = -Math.PI * 0.65
  const saucer = new THREE.Group(); saucer.name = 'saucer'
  pm(new THREE.LatheGeometry(V2([[0, 0], [0.048, 0], [0.066, 0.008], [0.071, 0.012], [0.065, 0.01], [0.03, 0.004], [0, 0.004]]), 32), PM.china, saucer)
  pm(new THREE.TorusGeometry(0.069, 0.0009, 4, 40), PM.gilt, saucer, 0, 0.0115, 0).rotation.x = Math.PI / 2
  return { cup, saucer }
}

/** 行李牌（原点 = 系绳顶端；牌子挂在下面）。number：牌上编号 */
export function buildBellhopTag(number = 135): THREE.Group {
  const g = new THREE.Group(); g.name = 'tag'
  let mat: THREE.Material = PM.hatbox
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = 128; c.height = 224; const x = c.getContext('2d')!
    x.fillStyle = '#e8dcc0'; x.fillRect(0, 0, 128, 224)
    x.strokeStyle = '#7a2a2c'; x.lineWidth = 6; x.strokeRect(8, 8, 112, 208)
    x.fillStyle = '#7a2a2c'; x.font = 'bold 22px serif'; x.textAlign = 'center'; x.fillText('HOTEL', 64, 70); x.font = '14px serif'; x.fillText('BAGGAGE', 64, 92)
    x.fillStyle = '#1d2147'; x.font = 'bold 52px serif'; x.fillText(String(number).padStart(3, '0'), 64, 160)
    x.strokeStyle = '#555'; x.lineWidth = 2; x.beginPath(); x.arc(64, 26, 7, 0, Math.PI * 2); x.stroke()
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
    mat = litMaterial({ color: '#ffffff', map: t, roughness: 0.8 })
  }
  // 牌子：上端切角的硬纸板
  const W = 0.046, H = 0.08, ch = 0.012
  const s = new THREE.Shape(); s.moveTo(-W / 2, -H); s.lineTo(W / 2, -H); s.lineTo(W / 2, -ch); s.lineTo(W / 2 - ch, 0); s.lineTo(-W / 2 + ch, 0); s.lineTo(-W / 2, -ch); s.closePath()
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.0012, bevelEnabled: false })
  const uv = geo.attributes.uv as THREE.BufferAttribute, p = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + W / 2) / W, (p.getY(i) + H) / H)
  pm(geo, mat, g, 0, -0.035, 0)
  pm(new THREE.TorusGeometry(0.004, 0.0012, 6, 12), PM.brass, g, 0, -0.035 - 0.009, 0.0006)
  // 系绳（打个环）
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.044, 0.001), new THREE.Vector3(-0.008, -0.02, 0.002), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.008, -0.02, -0.001), new THREE.Vector3(0, -0.044, 0.001)], true)
  pm(new THREE.TubeGeometry(curve, 24, 0.0008, 4, true), PM.string, g)
  return g
}

/** 推把：车局部坐标（近端 −X 外侧横杆，高 1.0 m） */
export const CART_BAR = { x: -0.57, y: 1.0, halfZ: 0.25 }
/** 黄铜行李车（原点 = 底板中心地面；长边沿 X）：红地毯底板 + 四轮 + 两根立柱上的拱形挂杆 + 两只行李箱 + 帽盒 + 一张行李牌 */
export function buildBellhopCart(): THREE.Group {
  const g = new THREE.Group(); g.name = 'cart'
  const L = 1.0, Wd = 0.56, deck = 0.2
  // 底板（黄铜包边 + 红地毯）
  pm(new THREE.BoxGeometry(L, 0.035, Wd), PM.wood, g, 0, deck, 0)
  pm(new THREE.BoxGeometry(L - 0.03, 0.006, Wd - 0.03), PM.carpet, g, 0, deck + 0.02, 0)
  for (const z of [-1, 1]) pm(new THREE.BoxGeometry(L + 0.01, 0.04, 0.012), PM.brass, g, 0, deck, z * (Wd / 2 + 0.002))
  for (const x of [-1, 1]) pm(new THREE.BoxGeometry(0.012, 0.04, Wd + 0.01), PM.brass, g, x * (L / 2 + 0.002), deck, 0)
  // 轮（四个，带黄铜叉）
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const w = pm(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 20), PM.rubber, g, x * (L / 2 - 0.09), 0.075, z * (Wd / 2 - 0.07)); w.rotation.x = Math.PI / 2
    pm(new THREE.CylinderGeometry(0.03, 0.03, 0.044, 12), PM.brass, g, x * (L / 2 - 0.09), 0.075, z * (Wd / 2 - 0.07)).rotation.x = Math.PI / 2
    pm(new THREE.BoxGeometry(0.02, 0.07, 0.05), PM.brassDk, g, x * (L / 2 - 0.09), 0.15, z * (Wd / 2 - 0.07))
  }
  // 两端立柱 + 顶上拱形挂杆（鸟笼式）
  const tube = (pts: THREE.Vector3[], r: number) => pm(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, r, 10), PM.brass, g)
  for (const x of [-1, 1]) {
    const X = x * (L / 2 - 0.03)
    for (const z of [-1, 1]) tube([new THREE.Vector3(X, deck, z * (Wd / 2 - 0.03)), new THREE.Vector3(X, 1.2, z * (Wd / 2 - 0.03))], 0.013)
    tube([new THREE.Vector3(X, 1.2, -(Wd / 2 - 0.03)), new THREE.Vector3(X, 1.42, -0.12), new THREE.Vector3(X, 1.48, 0), new THREE.Vector3(X, 1.42, 0.12), new THREE.Vector3(X, 1.2, Wd / 2 - 0.03)], 0.013)
    for (const z of [-1, 1]) pm(new THREE.SphereGeometry(0.022, 14, 10), PM.brass, g, X, 1.2, z * (Wd / 2 - 0.03))
    pm(new THREE.SphereGeometry(0.03, 14, 10), PM.brass, g, X, 1.49, 0)
  }
  tube([new THREE.Vector3(-(L / 2 - 0.03), 1.48, 0), new THREE.Vector3(L / 2 - 0.03, 1.48, 0)], 0.016) // 顶杆（挂衣）
  // 推把（阶段 2 pushCart 双手握）：近端（−X）立柱外 7 cm、高 1.0 m 的横杆 + 两根短撑
  { const X0 = -(L / 2 - 0.03), X1 = -(L / 2 + 0.07), Y = 1.0, Z = Wd / 2 - 0.03
    tube([new THREE.Vector3(X1, Y, -Z), new THREE.Vector3(X1, Y, Z)], 0.014)
    for (const z of [-1, 1]) { tube([new THREE.Vector3(X0, Y, z * Z), new THREE.Vector3(X1, Y, z * Z)], 0.011); pm(new THREE.SphereGeometry(0.018, 12, 8), PM.brass, g, X1, Y, z * Z) } }
  // 行李箱（皮面 + 两道皮带 + 黄铜角 + 提手）
  const suitcase = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, ry: number) => {
    const s = new THREE.Group(); s.position.set(x, y, z); s.rotation.y = ry; g.add(s)
    pm(new THREE.BoxGeometry(w, h, d), mat, s, 0, h / 2, 0)
    for (const k of [-1, 1]) pm(new THREE.BoxGeometry(0.03, h + 0.004, d + 0.004), PM.strap, s, k * w * 0.28, h / 2, 0)
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) pm(new THREE.BoxGeometry(0.03, 0.03, 0.03), PM.brass, s, a * (w / 2 - 0.012), h / 2 + b * (h / 2 - 0.012), c * (d / 2 - 0.012))
    pm(new THREE.TorusGeometry(0.035, 0.008, 6, 14, Math.PI), PM.strap, s, 0, h + 0.002, 0)
    return s
  }
  suitcase(0.62, 0.2, 0.42, PM.leatherA, -0.08, deck + 0.022, 0.0, 0.05)
  suitcase(0.5, 0.17, 0.34, PM.leatherB, -0.1, deck + 0.242, 0.01, -0.12)
  // 帽盒（圆筒 + 腰带）
  const hb = new THREE.Group(); hb.position.set(0.3, deck + 0.022, 0.05); g.add(hb)
  pm(new THREE.CylinderGeometry(0.15, 0.15, 0.2, 28), PM.hatbox, hb, 0, 0.1, 0)
  pm(new THREE.CylinderGeometry(0.155, 0.155, 0.05, 28), PM.hatboxBand, hb, 0, 0.18, 0)
  pm(new THREE.TorusGeometry(0.06, 0.006, 6, 14, Math.PI), PM.strap, hb, 0, 0.205, 0)
  // 箱子上挂一张行李牌
  const tag = buildBellhopTag(135); tag.position.set(-0.08 + 0.31, deck + 0.24, 0.215); tag.rotation.set(0.05, 0, 0.1); g.add(tag)
  return g
}
