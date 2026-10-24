// 枪械模型（鎏金兵械库特许店）：双管猎枪 + 12 号弹壳。
//
// 本地坐标（米，真实尺寸）：原点 = 枪颈（右手握持中心）；-Z = 枪口方向；+Y = 上；+X = 右。
//   扳机 z≈-0.03 · 机匣（箱式枪机）z -0.13..-0.02 · 枪管 z -0.13..-0.84（28 英寸）· 托底板 z≈+0.36
// 活动部件全部是独立节点，由 renderer/firearmAnim.ts 驱动：
//   barrels（以铰链轴为原点，绕 X 下折开枪）· topLever（开合杠杆，绕 Y 右拨）· triggers[2] · chambers[2]（膛内弹壳）
// 地面掉落 / 第三人称共用同一模型（buildFirearmGroundMesh）。
import * as THREE from 'three'
import { litMaterial } from './shared'
import { AMMO, type AmmoType, type Chamber, type GunType } from '../content/firearms'
import { buildLeverRifle, buildRevolver, buildMusket, buildTrapdoor, buildCartMesh as buildMetalCart } from './firearmGuns'

// ---------------------------------------------------------------- 工具
export function rng(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const texCache = new Map<string, THREE.CanvasTexture>()
export function tex(key: string, paint: (c: CanvasRenderingContext2D, n: number, r: () => number) => void, n = 512): THREE.CanvasTexture {
  const hit = texCache.get(key); if (hit) return hit
  const cv = document.createElement('canvas'); cv.width = cv.height = n
  const c = cv.getContext('2d')!
  let h = 7; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  paint(c, n, rng(h))
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter
  t.userData.shared = true
  texCache.set(key, t); return t
}
/** 盒式投影 UV：长轴 Z 恒为 V（木纹、拉丝顺着枪身走） */
export function boxUV(geo: THREE.BufferGeometry, scale = 4): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo
  if (g !== geo) geo.dispose()
  g.computeVertexNormals()
  const p = g.attributes.position, n = g.attributes.normal
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i += 3) {
    let nx = 0, ny = 0, nz = 0
    for (let k = 0; k < 3; k++) { nx += Math.abs(n.getX(i + k)); ny += Math.abs(n.getY(i + k)); nz += Math.abs(n.getZ(i + k)) }
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k)
      const u = nx >= ny && nx >= nz ? y : ny >= nz ? x : x + y * 0.5
      const v = nz > nx && nz > ny ? y * 0.5 + x : z
      uv[(i + k) * 2] = u * scale; uv[(i + k) * 2 + 1] = v * scale
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}
/** 侧视轮廓（shape.x → +Z 向后，shape.y → Y）沿 X 挤出 width，居中；widthAt(z) 可让枪颈收窄 */
export function sideProfile(pts: [number, number][], width: number, bevel: number, widthAt?: (z: number) => number): THREE.BufferGeometry {
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1])
  sh.closePath()
  const geo = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 6 })
  geo.translate(0, 0, -(width - bevel * 2) / 2)
  // shape 平面 (sx, sy, ez) → 枪坐标 (x = ez, y = sy, z = sx)
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const sx = p.getX(i), sy = p.getY(i), ez = p.getZ(i)
    const k = widthAt ? widthAt(sx) : 1
    p.setXYZ(i, ez * k, sy, sx)
  }
  geo.computeVertexNormals()
  return geo
}
/** 管：外径 / 内径轮廓沿 -Z 车出（带膛口可见的空心） */
export function tube(z0: number, z1: number, r0: number, r1: number, bore: number, seg = 28): THREE.BufferGeometry {
  // Lathe 的轴是 Y：先在 Y 上车，再转到 Z
  const L = Math.abs(z1 - z0)
  const pts = [new THREE.Vector2(bore, 0), new THREE.Vector2(r0, 0), new THREE.Vector2(r0, 0.004), new THREE.Vector2(r1, L - 0.003), new THREE.Vector2(r1 - 0.0008, L), new THREE.Vector2(bore, L), new THREE.Vector2(bore * 0.98, L - 0.06)]
  const g = new THREE.LatheGeometry(pts, seg)
  g.rotateX(-Math.PI / 2) // +Y → -Z
  g.translate(0, 0, z0)
  return g
}
export function cyl(r0: number, r1: number, len: number, seg = 16): THREE.BufferGeometry { return new THREE.CylinderGeometry(r1, r0, len, seg) }
export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, name?: string): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat); if (name) m.name = name; m.castShadow = false; m.receiveShadow = false; return m
}

// ---------------------------------------------------------------- 纹理
export const walnutTex = (check: boolean) => tex(check ? 'fa-walnut-check' : 'fa-walnut', (c, n, r) => {
  const g = c.createLinearGradient(0, 0, n, 0)
  g.addColorStop(0, '#4a2616'); g.addColorStop(.35, '#6a3822'); g.addColorStop(.6, '#542c19'); g.addColorStop(1, '#6e3c24')
  c.fillStyle = g; c.fillRect(0, 0, n, n)
  // 年轮流纹：沿 V（枪身长度）方向起伏
  for (let i = 0; i < 70; i++) {
    const x0 = r() * n, amp = 6 + r() * 26, fq = 1 + r() * 3, ph = r() * 7
    c.strokeStyle = r() < .5 ? `rgba(28,12,6,${.18 + r() * .3})` : `rgba(150,88,50,${.08 + r() * .14})`
    c.lineWidth = .6 + r() * 2.2
    c.beginPath()
    for (let y = 0; y <= n; y += 8) { const x = x0 + Math.sin(y / n * Math.PI * 2 * fq + ph) * amp; if (y === 0) c.moveTo(x, y); else c.lineTo(x, y) }
    c.stroke()
  }
  // 树瘤 / 花纹（胡桃木的「鸟眼」）
  for (let i = 0; i < 22; i++) {
    const x = r() * n, y = r() * n, rr = 4 + r() * 16
    const rg = c.createRadialGradient(x, y, 0, x, y, rr); rg.addColorStop(0, 'rgba(30,12,6,.35)'); rg.addColorStop(1, 'rgba(30,12,6,0)')
    c.fillStyle = rg; c.beginPath(); c.arc(x, y, rr, 0, 7); c.fill()
  }
  // 油面高光与使用磨损
  for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(255,220,180,${r() * .05})`; c.fillRect(r() * n, r() * n, 1, 2 + r() * 6) }
  if (check) {
    // 手刻方格防滑纹（菱形网格，24 lpi 量级）
    c.strokeStyle = 'rgba(20,9,4,.75)'; c.lineWidth = 1.4
    for (let k = -n; k < n * 2; k += 9) {
      c.beginPath(); c.moveTo(k, 0); c.lineTo(k + n * .55, n); c.stroke()
      c.beginPath(); c.moveTo(k, 0); c.lineTo(k - n * .55, n); c.stroke()
    }
    c.strokeStyle = 'rgba(190,120,70,.18)'; c.lineWidth = .7
    for (let k = -n; k < n * 2; k += 9) { c.beginPath(); c.moveTo(k + 2, 0); c.lineTo(k + 2 + n * .55, n); c.stroke() }
  }
})
export const bluedTex = () => tex('fa-blued', (c, n, r) => {
  c.fillStyle = '#1a1f26'; c.fillRect(0, 0, n, n)
  // 打磨纵纹 + 发蓝的蓝紫色泛光
  for (let x = 0; x < n; x++) { c.fillStyle = `rgba(${60 + r() * 30},${70 + r() * 30},${95 + r() * 40},${.05 + r() * .12})`; c.fillRect(x, 0, 1, n) }
  for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(150,170,200,${.03 + r() * .06})`; c.fillRect(r() * n, 0, 2 + r() * 10, n) }
  // 磨损露出的白钢（边缘与持握处），以及一点锈斑
  for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(180,185,190,${.05 + r() * .1})`; c.fillRect(r() * n, r() * n, 1, 3 + r() * 14) }
  for (let i = 0; i < 26; i++) { c.fillStyle = `rgba(110,62,30,${.08 + r() * .14})`; c.beginPath(); c.arc(r() * n, r() * n, .8 + r() * 2.6, 0, 7); c.fill() }
})
export const caseTex = () => tex('fa-casehard', (c, n, r) => {
  // 骨炭渗碳硬化的彩色花纹：灰钢底 + 蓝 / 紫 / 草黄色云团
  c.fillStyle = '#80817f'; c.fillRect(0, 0, n, n)
  const cols = ['58,78,122', '96,70,120', '176,150,90', '60,64,70', '120,130,150', '150,110,70']
  for (let i = 0; i < 260; i++) {
    const x = r() * n, y = r() * n, rr = 6 + r() * 34, col = cols[Math.floor(r() * cols.length)]
    const rg = c.createRadialGradient(x, y, 0, x, y, rr); rg.addColorStop(0, `rgba(${col},${.25 + r() * .3})`); rg.addColorStop(1, `rgba(${col},0)`)
    c.fillStyle = rg; c.beginPath(); c.arc(x, y, rr, 0, 7); c.fill()
  }
  // 手工卷草纹雕刻
  c.strokeStyle = 'rgba(230,226,214,.32)'; c.lineWidth = 1
  for (let i = 0; i < 46; i++) {
    const x = r() * n, y = r() * n, rr = 5 + r() * 14
    c.beginPath(); c.arc(x, y, rr, r() * 6, r() * 6 + 3.5 + r() * 2); c.stroke()
    c.beginPath(); c.arc(x + rr * .6, y + rr * .3, rr * .45, 0, 4.2); c.stroke()
  }
  c.strokeStyle = 'rgba(30,30,32,.35)'; c.lineWidth = .8
  for (let i = 0; i < 30; i++) { const x = r() * n, y = r() * n; c.beginPath(); c.arc(x, y, 3 + r() * 9, 0, 3 + r() * 3); c.stroke() }
})
export const brassTex = () => tex('fa-brass', (c, n, r) => {
  c.fillStyle = '#b48a3c'; c.fillRect(0, 0, n, n)
  for (let x = 0; x < n; x += 2) { c.fillStyle = `rgba(${r() < .5 ? '255,226,150' : '90,60,20'},${.06 + r() * .1})`; c.fillRect(x, 0, 1, n) }
  for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(70,50,20,${.08 + r() * .12})`; c.beginPath(); c.arc(r() * n, r() * n, 1 + r() * 4, 0, 7); c.fill() }
}, 256)
/** 纸壳：底色 + 压纹 + 印字（爆团弹为鎏金兵械库的金壳与标志） */
const hullTex = (ammo: AmmoType, spent: boolean) => tex(`fa-hull-${ammo}-${spent ? 's' : 'n'}`, (c, n, r) => {
  const a = AMMO[ammo]
  c.fillStyle = a.hull; c.fillRect(0, 0, n, n)
  for (let x = 0; x < n; x += 3) { c.fillStyle = `rgba(0,0,0,${.05 + r() * .06})`; c.fillRect(x, 0, 1, n) }
  for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(255,255,255,${r() * .06})`; c.fillRect(r() * n, r() * n, 2, 1) }
  // 印字带（U 一圈 = 弹壳一周；V 沿弹壳长度）
  c.save(); c.translate(n * .5, n * .52); c.rotate(-Math.PI / 2)
  c.fillStyle = ammo === 'shell_clump' ? '#3a2408' : 'rgba(250,240,220,.85)'
  c.font = `bold ${Math.round(n * .085)}px Georgia, serif`; c.textAlign = 'center'
  c.fillText(ammo === 'shell_clump' ? 'GILDED ARMORY' : ammo === 'shell_buck' ? '00 BUCK' : 'No.7½ SHOT', 0, -n * .02)
  c.font = `${Math.round(n * .06)}px Georgia, serif`
  c.fillText(ammo === 'shell_clump' ? '★ CLUMP-BUSTER ★' : '12 GA · 2¾ IN', 0, n * .07)
  c.restore()
  if (ammo === 'shell_clump') { // 金壳亮面
    const g = c.createLinearGradient(0, 0, n, 0); g.addColorStop(0, 'rgba(255,240,170,.0)'); g.addColorStop(.5, 'rgba(255,240,170,.35)'); g.addColorStop(1, 'rgba(255,240,170,0)')
    c.fillStyle = g; c.fillRect(0, 0, n, n)
  }
  if (spent) { c.fillStyle = 'rgba(30,22,16,.35)'; c.fillRect(0, n * .82, n, n * .18) } // 击发后壳口焦黑
}, 256)

export interface Mats { wood: THREE.Material; woodCheck: THREE.Material; blued: THREE.Material; caseH: THREE.Material; dark: THREE.Material; brass: THREE.Material; bead: THREE.Material; bore: THREE.Material }
export function makeMats(): Mats {
  return {
    wood: litMaterial({ color: '#ffffff', map: walnutTex(false), roughness: .48, metalness: 0, envBase: .22 }),
    woodCheck: litMaterial({ color: '#ffffff', map: walnutTex(true), roughness: .7, metalness: 0, envBase: .12 }),
    blued: litMaterial({ color: '#ffffff', map: bluedTex(), roughness: .3, metalness: .78, envBase: .5 }),
    caseH: litMaterial({ color: '#ffffff', map: caseTex(), roughness: .32, metalness: .8, envBase: .5 }),
    dark: litMaterial({ color: '#2a2c30', roughness: .55, metalness: .6, envBase: .25 }),
    brass: litMaterial({ color: '#ffffff', map: brassTex(), roughness: .3, metalness: .85, envBase: .55 }),
    bead: litMaterial({ color: '#e8d9b0', roughness: .25, metalness: .5, envBase: .5 }),
    bore: litMaterial({ color: '#0b0c0d', roughness: .8, metalness: .3, envBase: .05 }),
  }
}

// ---------------------------------------------------------------- 12 号弹壳
export const SHELL = { r: 0.0103, len: 0.0675, head: 0.016, rim: 0.0112, rimT: 0.0018 } as const
/** 弹壳：原点 = 底缘（黄铜头）中心，壳口沿 -Z。spent = 已击发（底火凹陷、壳口焦黑、卷口张开） */
export function buildShellMesh(ammo: AmmoType, spent = false): THREE.Group {
  const g = new THREE.Group()
  g.userData.shell = ammo
  const hull = litMaterial({ color: '#ffffff', map: hullTex(ammo, spent), roughness: .62, metalness: ammo === 'shell_clump' ? .35 : 0, envBase: .2 })
  const brass = litMaterial({ color: '#ffffff', map: brassTex(), roughness: .28, metalness: .88, envBase: .6 })
  const body = cyl(SHELL.r, SHELL.r * (spent ? 1.04 : .985), SHELL.len - SHELL.head + 0.002, 20)
  body.rotateX(-Math.PI / 2); body.translate(0, 0, -SHELL.head - (SHELL.len - SHELL.head) / 2 + 0.001)
  g.add(mesh(body, hull))
  // 黄铜底座 + 底缘
  const head = cyl(SHELL.r * 1.01, SHELL.r * 1.01, SHELL.head, 20); head.rotateX(-Math.PI / 2); head.translate(0, 0, -SHELL.head / 2)
  g.add(mesh(head, brass))
  const rim = cyl(SHELL.rim, SHELL.rim, SHELL.rimT, 20); rim.rotateX(-Math.PI / 2); rim.translate(0, 0, -SHELL.rimT / 2)
  g.add(mesh(rim, brass))
  // 底火
  const pr = cyl(0.0031, 0.0031, 0.0006, 12); pr.rotateX(-Math.PI / 2); pr.translate(0, 0, spent ? 0.00005 : 0.0003)
  g.add(mesh(pr, litMaterial({ color: spent ? '#7a6a52' : '#c9b48a', roughness: .3, metalness: .9 })))
  // 壳口：未击发 = 六瓣星形卷口（平面）；已击发 = 张开的空口
  const capR = spent ? SHELL.r * 1.04 : SHELL.r * .985
  if (!spent) {
    const cap = new THREE.CircleGeometry(capR, 6); cap.translate(0, 0, -SHELL.len + 0.0005); cap.rotateY(Math.PI)
    g.add(mesh(cap, litMaterial({ color: AMMO[ammo].hull, roughness: .7 })))
  } else {
    const ins = cyl(capR * .9, capR * .9, 0.03, 16, ); ins.rotateX(-Math.PI / 2); ins.translate(0, 0, -SHELL.len + 0.015)
    const m = mesh(ins, litMaterial({ color: '#16110c', roughness: .9, side: THREE.BackSide })); g.add(m)
  }
  return g
}

// ---------------------------------------------------------------- 双管猎枪
export const DB = {
  breechZ: -0.13, muzzleZ: -0.84,
  hinge: new THREE.Vector3(0, -0.031, -0.192), // 铰链轴（枪管组原点）
  barrelX: 0.0136, // 管心距中线（膛尾处）
  sep: 0.0105, // 枪口处管心距中线
  rBreech: 0.0136, rMuzzle: 0.0108, bore: 0.0092,
  openAngle: 0.6, // 开枪角（弧度，约 34°）
  leverAngle: 0.62, // 开合杠杆右拨角
  /** 贴腮瞄准：后端（膛尾上方的平直通风带）与准星珠 */
  ribRear: new THREE.Vector3(0, 0.0164, -0.13), bead: new THREE.Vector3(0, 0.0198, -0.836),
  /** 左手托握点（枪管组坐标系，护木中段下方） */
  forend: new THREE.Vector3(0, -0.026, -0.11),
  grip: new THREE.Vector3(0, -0.014, 0.058),
} as const

export interface GunRig {
  type: GunType
  root: THREE.Group
  /** 动画部件（renderer/firearmAnim.ts 的通道经 apply() 写到这些节点上） */
  parts: Record<string, THREE.Object3D>
  /** 弹仓格对应的可见弹位（下标 = mag 下标；没有可见弹位的格为 undefined） */
  chambers: (THREE.Group | undefined)[]
  muzzles: THREE.Object3D[]
  /** 手部挂点 / 动作参考点（装弹口、火帽座、嘴边……），都挂在某个部件下 */
  anchors: Record<string, THREE.Object3D>
  /** 贴腮：眼位与准星（枪坐标） */
  sight: { eye: THREE.Vector3; target: THREE.Vector3 }
  /** 写入动画通道 */
  apply(ch: Record<string, number>): void
  mats: Mats
  chamberKey: string
}

export function buildDbShotgun(): GunRig {
  const mats = makeMats()
  const root = new THREE.Group(); root.name = 'dbshotgun'
  // ---- 枪托（英式直托：直颈、低托腮线）+ 托底板 ----
  const stockPts: [number, number][] = [
    [-0.02, 0.006], [0.02, 0.005], [0.07, -0.007], [0.12, -0.017], [0.2, -0.024], [0.3, -0.036], [0.362, -0.044], // 托腮线（托腮落差约 38mm / 托踵落差约 58mm，相对通风带）
    [0.366, -0.07], [0.37, -0.11], [0.372, -0.152], // 托底（略后倾）
    [0.3, -0.132], [0.2, -0.098], [0.13, -0.066], [0.09, -0.046], [0.05, -0.036], [0.0, -0.034], [-0.02, -0.03],
  ]
  const stock = sideProfile(stockPts, 0.044, 0.009, (z) => z < 0.11 ? 0.8 : 0.8 + 0.2 * Math.min(1, (z - 0.11) / 0.12)) // 枪颈收窄
  root.add(mesh(boxUV(stock, 3.2), mats.wood, 'stock'))
  // 枪颈防滑格纹（贴在两侧的薄片）
  for (const sx of [-1, 1]) {
    const pts: [number, number][] = [[0.015, 0.0], [0.095, -0.012], [0.1, -0.038], [0.02, -0.03]]
    const pan = sideProfile(pts, 0.0012, 0.0004)
    pan.translate(sx * 0.0168, 0, 0)
    root.add(mesh(boxUV(pan, 9), mats.woodCheck))
  }
  // 托底板（钢）
  const bp = sideProfile([[0.362, -0.04], [0.372, -0.04], [0.378, -0.152], [0.368, -0.155], [0.367, -0.11]], 0.042, 0.003)
  root.add(mesh(boxUV(bp, 10), mats.dark, 'buttplate'))
  // ---- 机匣（箱式枪机，渗碳硬化彩纹）----
  const action = sideProfile([[-0.13, 0.0075], [-0.04, 0.0075], [-0.022, 0.011], [0.0, 0.009], [0.0, -0.032], [-0.02, -0.05], [-0.13, -0.05], [-0.2, -0.047], [-0.205, -0.036], [-0.2, -0.028], [-0.13, -0.028]], 0.054, 0.004)
  root.add(mesh(boxUV(action, 6), mats.caseH, 'action'))
  // 膛尾面（枪管折下时看得见）+ 击针孔
  const face = new THREE.BoxGeometry(0.052, 0.034, 0.003); face.translate(0, -0.006, -0.1285)
  root.add(mesh(boxUV(face, 10), mats.caseH))
  for (const sx of [-1, 1]) { const pin = cyl(0.0012, 0.0012, 0.002, 8); pin.rotateX(Math.PI / 2); pin.translate(sx * DB.barrelX, 0, -0.1305); root.add(mesh(pin, mats.dark)) }
  // 顶背柄 + 保险推钮
  const tang = new THREE.BoxGeometry(0.014, 0.004, 0.05); tang.translate(0, 0.0095, 0.022)
  root.add(mesh(boxUV(tang, 10), mats.blued))
  const safety = new THREE.BoxGeometry(0.008, 0.004, 0.012); safety.translate(0, 0.0125, 0.03)
  root.add(mesh(safety, mats.dark))
  // 开合杠杆：轴在顶背柄前端，向右拨开
  const topLever = new THREE.Group(); topLever.position.set(0, 0.0115, -0.012)
  const lv = new THREE.Shape(); lv.moveTo(-0.006, 0.004); lv.lineTo(0.006, 0.004); lv.lineTo(0.008, 0.035); lv.quadraticCurveTo(0.009, 0.048, 0.022, 0.05); lv.lineTo(0.022, 0.056); lv.quadraticCurveTo(0.0, 0.054, -0.004, 0.036); lv.closePath()
  const lvg = new THREE.ExtrudeGeometry(lv, { depth: 0.004, bevelEnabled: true, bevelSize: 0.0008, bevelThickness: 0.0008, bevelSegments: 1 })
  lvg.rotateX(Math.PI / 2); lvg.translate(0, 0.004, 0)
  topLever.add(mesh(boxUV(lvg, 12), mats.blued, 'toplever'))
  root.add(topLever)
  // 扳机护圈 + 双扳机（前 = 右管，后 = 左管）
  const guard = new THREE.TorusGeometry(0.034, 0.0028, 6, 24, Math.PI)
  guard.rotateY(Math.PI / 2); guard.rotateX(Math.PI); guard.scale(1, 0.72, 1.18); guard.translate(0, -0.05, -0.02)
  root.add(mesh(guard, mats.blued, 'guard'))
  const guardTail = new THREE.BoxGeometry(0.008, 0.003, 0.08); guardTail.translate(0, -0.048, 0.035); root.add(mesh(guardTail, mats.blued))
  const triggers: THREE.Object3D[] = []
  for (const [i, z] of [[0, -0.038], [1, -0.016]] as const) {
    const tg = new THREE.Group(); tg.position.set(0, -0.05, z)
    const blade = new THREE.Shape(); blade.moveTo(-0.003, 0); blade.lineTo(0.003, 0); blade.quadraticCurveTo(0.006, -0.012, 0.001, -0.024); blade.lineTo(-0.002, -0.023); blade.quadraticCurveTo(0.001, -0.012, -0.003, 0)
    const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.005, bevelEnabled: false }); bg.rotateY(Math.PI / 2); bg.translate(-0.0025, 0, 0)
    tg.add(mesh(boxUV(bg, 20), mats.caseH, `trigger${i}`))
    root.add(tg); triggers.push(tg)
  }
  // ---- 枪管组（以铰链为原点）----
  const barrels = new THREE.Group(); barrels.name = 'barrels'; barrels.position.copy(DB.hinge)
  const B = (v: THREE.Vector3 | [number, number, number]) => { const a = Array.isArray(v) ? new THREE.Vector3(...v) : v.clone(); return a.sub(DB.hinge) }
  const muzzles: THREE.Object3D[] = []
  for (const sx of [1, -1]) { // 0 = 右管，1 = 左管
    const L = DB.breechZ - DB.muzzleZ
    const g = tube(0, -L, DB.rBreech, DB.rMuzzle, DB.bore, 30)
    // 两管在枪口处收拢（并列双管的「汇聚」）
    const pp = g.attributes.position
    for (let i = 0; i < pp.count; i++) { const t = -pp.getZ(i) / L; pp.setX(i, pp.getX(i) + sx * (DB.barrelX + (DB.sep - DB.barrelX) * t)) }
    g.computeVertexNormals()
    const o = B([0, 0, DB.breechZ]); g.translate(o.x, o.y, o.z)
    barrels.add(mesh(g, mats.blued, sx > 0 ? 'barrelR' : 'barrelL'))
    // 膛口深处一点黑（看进去不是空的）
    const plug = new THREE.CircleGeometry(DB.bore, 16); plug.rotateY(Math.PI); const pz = B([sx * DB.sep, 0, DB.muzzleZ + 0.05]); plug.translate(pz.x, pz.y, pz.z)
    barrels.add(mesh(plug, mats.bore))
    const mz = new THREE.Object3D(); mz.position.copy(B([sx * DB.sep, 0, DB.muzzleZ])); barrels.add(mz); muzzles.push(mz)
  }
  // 上 / 下肋条（两管之间）
  const rib = new THREE.BoxGeometry(0.009, 0.004, DB.breechZ - DB.muzzleZ)
  { const p = rib.attributes.position; for (let i = 0; i < p.count; i++) { const t = (DB.breechZ - (p.getZ(i) + (DB.breechZ + DB.muzzleZ) / 2)) / (DB.breechZ - DB.muzzleZ); p.setY(i, p.getY(i) + 0.0145 - t * 0.0028 + (p.getY(i) > 0 ? t * 0.0006 : 0)) } }
  { const o = B([0, 0, (DB.breechZ + DB.muzzleZ) / 2]); rib.translate(o.x, o.y, o.z) }
  barrels.add(mesh(boxUV(rib, 30), mats.blued, 'rib'))
  const rib2 = new THREE.BoxGeometry(0.008, 0.004, DB.breechZ - DB.muzzleZ - 0.3); { const o = B([0, -0.0125, (DB.breechZ + DB.muzzleZ) / 2 - 0.15]); rib2.translate(o.x, o.y, o.z) }
  barrels.add(mesh(boxUV(rib2, 30), mats.blued))
  // 准星珠（黄铜 / 象牙色）
  const bead = new THREE.SphereGeometry(0.0021, 10, 8); { const o = B(DB.bead); bead.translate(o.x, o.y, o.z) }
  barrels.add(mesh(bead, mats.bead, 'bead'))
  // 管底凸榫 + 挂钩（卡进机匣底杆）+ 抽壳器
  const lump = new THREE.BoxGeometry(0.02, 0.016, 0.06); { const o = B([0, -0.02, -0.16]); lump.translate(o.x, o.y, o.z) }
  barrels.add(mesh(boxUV(lump, 12), mats.blued))
  const ext = new THREE.BoxGeometry(0.03, 0.009, 0.004); { const o = B([0, 0.0005, DB.breechZ - 0.0005]); ext.translate(o.x, o.y, o.z) }
  barrels.add(mesh(ext, mats.dark, 'extractor'))
  // 膛尾环：管尾端面（开枪时正对镜头）
  for (const sx of [1, -1]) {
    const ring = new THREE.RingGeometry(DB.bore + 0.0012, DB.rBreech, 24); ring.rotateY(0); const o = B([sx * DB.barrelX, 0, DB.breechZ + 0.0002]); ring.translate(o.x, o.y, o.z)
    barrels.add(mesh(ring, mats.blued))
  }
  // 护木（分裂式，胡桃木）+ 护木铁
  const fe = sideProfile([[-0.42, -0.012], [-0.2, -0.012], [-0.198, -0.03], [-0.215, -0.041], [-0.4, -0.037], [-0.425, -0.026]], 0.05, 0.007, (z) => 0.85 + 0.15 * Math.min(1, Math.max(0, (z + 0.42) / 0.2)))
  fe.translate(-DB.hinge.x, -DB.hinge.y, -DB.hinge.z)
  barrels.add(mesh(boxUV(fe, 3.2), mats.woodCheck, 'forend'))
  const feIron = sideProfile([[-0.205, -0.012], [-0.19, -0.012], [-0.188, -0.034], [-0.2, -0.04], [-0.21, -0.038]], 0.046, 0.002)
  feIron.translate(-DB.hinge.x, -DB.hinge.y, -DB.hinge.z)
  barrels.add(mesh(boxUV(feIron, 10), mats.caseH))
  const latch = new THREE.BoxGeometry(0.006, 0.003, 0.016); { const o = B([0, -0.0405, -0.36]); latch.translate(o.x, o.y, o.z) }
  barrels.add(mesh(latch, mats.dark))
  // 膛内弹壳
  const chambers: THREE.Group[] = []
  for (const sx of [1, -1]) {
    const ch = new THREE.Group(); ch.position.copy(B([sx * DB.barrelX, 0, DB.breechZ + 0.0012]))
    barrels.add(ch); chambers.push(ch)
  }
  root.add(barrels)
  const rig: GunRig = {
    type: 'dbshotgun', root, parts: { barrels, topLever, trigger0: triggers[0], trigger1: triggers[1] }, chambers, muzzles, anchors: {},
    sight: { eye: new THREE.Vector3(0, DB.ribRear.y + 0.011, 0.26), target: DB.bead.clone() },
    apply(ch) {
      barrels.rotation.x = -DB.openAngle * (ch.open ?? 0)
      topLever.rotation.y = -DB.leverAngle * (ch.lever ?? 0)
      triggers[0].rotation.x = (ch.trig ?? 0) * 0.35
      triggers[1].rotation.x = (ch.trig2 ?? 0) * 0.35
    },
    mats, chamberKey: '',
  }
  root.userData.gunRig = rig
  return rig
}

/** 膛内弹壳按枪身 mag 刷新（值变才重建） */
/** 任意弹药的模型：12 号弹壳 / 金属定装弹 / 纸包弹。原点 = 底缘中心，弹头沿 -Z */
export function buildCartMesh(ammo: AmmoType, spent = false): THREE.Group {
  return AMMO[ammo].cal === '12ga' ? buildShellMesh(ammo, spent) : buildMetalCart(ammo, spent)
}
/** Release one factory-owned part; atlas images stay shared across gun instances. */
export function disposeFirearmPart(root: THREE.Object3D) {
  root.removeFromParent()
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
  root.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) geometries.add(m.geometry); for (const mat of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) materials.add(mat) })
  for (const geometry of geometries) geometry.dispose()
  for (const material of materials) material.dispose()
}
/** 膛内弹按枪身 mag 刷新（值变才重建） */
export function setChambers(rig: GunRig, mag: readonly Chamber[] | undefined, fallback: AmmoType) {
  const key = (mag ?? []).join(',')
  if (key === rig.chamberKey) return
  rig.chamberKey = key
  rig.chambers.forEach((ch, i) => {
    if (!ch) return
    const v = mag?.[i] ?? ''
    if (ch.userData.shown === v) return
    ch.userData.shown = v
    for (const c of [...ch.children]) disposeFirearmPart(c)
    if (!v || (v === 'spent' && AMMO[(ch.userData.lastAmmo ?? fallback) as AmmoType].cal === 'paper69')) return
    const ammo = (v === 'spent' ? (ch.userData.lastAmmo ?? fallback) : v) as AmmoType
    if (v !== 'spent') ch.userData.lastAmmo = v
    ch.add(buildCartMesh(ammo, v === 'spent'))
  })
}

export function buildFirearmMesh(type: GunType): GunRig {
  switch (type) {
    case 'dbshotgun': return buildDbShotgun()
    case 'leverrifle': return buildLeverRifle()
    case 'revolver': return buildRevolver()
    case 'musket': return buildMusket()
    case 'trapdoor': return buildTrapdoor()
  }
}
/** 地面 / 第三人称：枪身平放、几何中心归零（长轴 +X） */
export function buildFirearmGroundMesh(type: GunType): THREE.Group {
  const rig = buildFirearmMesh(type)
  const g = new THREE.Group()
  rig.root.rotation.set(0, Math.PI / 2, Math.PI / 2) // 侧躺：-Z → +X，枪身右侧朝上
  const box = new THREE.Box3().setFromObject(rig.root)
  rig.root.position.set(-(box.min.x + box.max.x) / 2, -box.min.y + 0.004, -(box.min.z + box.max.z) / 2)
  g.add(rig.root)
  g.userData.gunRig = rig
  return g
}
/** 地面弹药：一小盒（纸盒 + 露出几发） */
export function buildAmmoGroundMesh(type: AmmoType): THREE.Group {
  const g = new THREE.Group(), a = AMMO[type]
  const col: Record<AmmoType, string> = { shell_clump: '#c9a23a', shell_buck: '#8e3a2a', shell_bird: '#4b6a40', cart_4440: '#5a6a7a', cart_paper: '#b8a888', cart_4570: '#6a5a46' }
  const box = litMaterial({ color: col[type], roughness: .8 })
  const big = a.cal === '12ga'
  const b = new THREE.BoxGeometry(big ? 0.075 : 0.06, big ? 0.03 : 0.022, big ? 0.05 : 0.04); b.translate(0, big ? 0.015 : 0.011, 0)
  g.add(mesh(b, box))
  for (let i = 0; i < 3; i++) {
    const s = buildCartMesh(type)
    s.rotation.set(-Math.PI / 2, 0, 0); s.position.set((-1 + i) * (big ? 0.0235 : 0.015), big ? 0.03 : 0.022, 0.006)
    g.add(s)
  }
  return g
}
