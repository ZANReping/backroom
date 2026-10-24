// 前厅（序章）随身物品的精细模型：手机 / 瓶装水 / 能量棒 / 双肩包。
// 倒角（圆角盒、车削瓶身）、细节部件（按键、摄像头、瓶盖螺纹环、封口锯齿、拉链头、肩带扣），
// 表面用自制像素贴图（public/textures/foyer/items/*.png，scripts/gen-foyer-item-textures.py 生成，CC0），
// NearestFilter 放大采样，与物品栏像素图标同一风格。每件约 0.3k–1.5k 三角形。
// 材质由调用方提供（家中走前厅 PBR+烘焙，Level 0 地面物品走通用 Lambert），本模块只管几何与贴图。
import * as THREE from 'three'

export interface ItemMatParams { color: string; map?: THREE.Texture | null; roughness?: number; metalness?: number; transparent?: boolean; opacity?: number; basic?: boolean; side?: THREE.Side }
export type ItemMatFactory = (key: string, p: ItemMatParams) => THREE.Material

const texCache = new Map<string, THREE.Texture>()
/** 像素贴图（最近邻放大、mipmap 缩小，保持近景颗粒并减少远景闪烁；共享缓存）。 */
export function foyerItemTex(name: 'phone_back' | 'phone_lock' | 'water_label' | 'snack_wrap' | 'pack_fabric' | 'pack_patch' | 'vhs_label', repeat = 1): THREE.Texture {
  const key = `${name}@${repeat}`
  let t = texCache.get(key)
  if (!t) {
    const base = (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/')
    t = new THREE.TextureLoader().load(`${base}textures/foyer/items/${name}.png`)
    t.userData.foyerShared = true // Bounded shared asset cache; scene disposal must not invalidate another instance.
    t.colorSpace = THREE.SRGBColorSpace
    t.magFilter = THREE.NearestFilter
    t.minFilter = THREE.NearestMipmapLinearFilter
    t.generateMipmaps = true
    if (repeat !== 1) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat) }
    texCache.set(key, t)
  }
  return t
}
export function disposeFoyerItemTextures() { for (const t of texCache.values()) t.dispose(); texCache.clear() }

/** 圆角盒（细分盒顶点内收到圆角；保留 BoxGeometry 每面 0–1 UV）。 */
export function roundBox(w: number, h: number, d: number, r: number, seg = 2): THREE.BufferGeometry {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2)
  const pos = g.getAttribute('position')
  const v = new THREE.Vector3(), inner = new THREE.Vector3()
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    inner.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)))
    const n = v.clone().sub(inner)
    if (n.lengthSq() > 1e-12) { n.normalize().multiplyScalar(r); v.copy(inner).add(n) }
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const o = new THREE.Mesh(g, m)
  o.position.set(x, y, z); o.rotation.set(rx, ry, rz)
  o.castShadow = !(m as THREE.MeshBasicMaterial).isMeshBasicMaterial && !m.transparent
  o.receiveShadow = true
  return o
}

/** 手机（平放，屏幕朝上；原点=底面中心）。72×152×8.5 mm，圆角边框 + 屏幕 + 背面摄像头模组 + 侧键。 */
export function buildFoyerPhone(M: ItemMatFactory): THREE.Group {
  const g = new THREE.Group(); g.name = 'foyer-item-phone'
  const W = 0.072, L = 0.152, T = 0.0085
  const frame = M('phone-frame', { color: '#4a4d53', roughness: 0.35, metalness: 0.8 })
  const back = M('phone-back', { color: '#ffffff', map: foyerItemTex('phone_back'), roughness: 0.55, metalness: 0.1 })
  const glass = M('phone-glass', { color: '#0c0d10', roughness: 0.08, metalness: 0.2 })
  const screen = M('phone-lock', { color: '#ffffff', map: foyerItemTex('phone_lock'), basic: true })
  g.add(mesh(roundBox(W, T, L, 0.0042, 3), frame, 0, T / 2, 0))
  g.add(mesh(roundBox(W - 0.002, 0.0012, L - 0.002, 0.004, 2), glass, 0, T - 0.0002, 0))
  g.add(mesh(new THREE.PlaneGeometry(W - 0.007, L - 0.009), screen, 0, T + 0.0005, 0, -Math.PI / 2))
  const bk = mesh(new THREE.PlaneGeometry(W - 0.004, L - 0.004), back, 0, -0.0003, 0, Math.PI / 2)
  g.add(bk)
  // 背面摄像头凸起（双摄 + 闪光灯）
  g.add(mesh(roundBox(0.024, 0.0018, 0.032, 0.005, 2), frame, -0.018, -0.0009, -0.052))
  for (const dz of [-0.06, -0.046]) g.add(mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.002, 12), glass, -0.019, -0.0018, dz))
  // 侧键（音量 ×2、电源）
  for (const [z, len] of [[-0.035, 0.016], [-0.015, 0.016]] as const) g.add(mesh(roundBox(0.0016, 0.0035, len, 0.0007, 1), frame, -W / 2 - 0.0005, T / 2, z))
  g.add(mesh(roundBox(0.0016, 0.0035, 0.022, 0.0007, 1), frame, W / 2 + 0.0005, T / 2, -0.025))
  // 听筒缝
  g.add(mesh(new THREE.BoxGeometry(0.012, 0.0004, 0.0012), M('phone-slot', { color: '#202226', roughness: 0.6 }), 0, T + 0.0006, -L / 2 + 0.006))
  return g
}

/** 500 ml 瓶装水（原点=瓶底中心）。车削 PET 瓶身（瓶肩/瓶颈/瓶底花瓣）+ 环绕腰标 + 螺纹瓶盖 + 内部水体。 */
export function buildFoyerWater(M: ItemMatFactory): THREE.Group {
  const g = new THREE.Group(); g.name = 'foyer-item-water'
  const R = 0.032, H = 0.205
  const prof: [number, number][] = [[0, 0], [R * 0.7, 0], [R * 0.92, 0.004], [R, 0.014], [R, 0.05], [R * 0.95, 0.06], [R, 0.07], [R, 0.135], [R * 0.9, 0.155], [R * 0.55, 0.18], [0.0125, 0.188], [0.0125, H - 0.012]]
  const pet = M('water-pet', { color: '#d8ecf6', roughness: 0.06, metalness: 0, transparent: true, opacity: 0.42, side: THREE.DoubleSide })
  g.add(mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18), pet))
  // 水（到瓶肩下）
  const water = M('water-in', { color: '#9fcbe6', roughness: 0.05, transparent: true, opacity: 0.35 })
  g.add(mesh(new THREE.CylinderGeometry(R * 0.93, R * 0.93, 0.13, 18), water, 0, 0.006 + 0.065, 0))
  // 腰标（开口圆柱环绕）
  const label = M('water-label', { color: '#ffffff', map: foyerItemTex('water_label'), roughness: 0.5 })
  g.add(mesh(new THREE.CylinderGeometry(R + 0.0006, R + 0.0006, 0.058, 24, 1, true), label, 0, 0.07 + 0.033, 0))
  // 瓶盖：主体 + 防盗环 + 竖纹（8 条细棱）
  const cap = M('water-cap', { color: '#1d5fa8', roughness: 0.45 })
  g.add(mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.016, 16), cap, 0, H - 0.012 + 0.008 + 0.002, 0))
  g.add(mesh(new THREE.CylinderGeometry(0.0148, 0.0148, 0.003, 16), cap, 0, H - 0.0105, 0))
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(mesh(new THREE.BoxGeometry(0.0016, 0.013, 0.0016), cap, Math.cos(a) * 0.0148, H + 0.0005, Math.sin(a) * 0.0148, 0, -a, 0)) }
  return g
}

/** 能量棒（平放；原点=底面中心）。圆角包装体（像素包装贴图）+ 两端锯齿封口。 */
export function buildFoyerSnack(M: ItemMatFactory): THREE.Group {
  const g = new THREE.Group(); g.name = 'foyer-item-snack'
  const L = 0.13, T = 0.022, W = 0.04
  const wrap = M('snack-wrap', { color: '#ffffff', map: foyerItemTex('snack_wrap'), roughness: 0.42, metalness: 0.25 })
  const seal = M('snack-seal', { color: '#e6a07a', roughness: 0.5, metalness: 0.2 })
  g.add(mesh(roundBox(L - 0.016, T, W, 0.007, 2), wrap, 0, T / 2, 0))
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(0.01, 0.0024, W + 0.002), seal, s * (L / 2 - 0.005), T * 0.45, 0))
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.BoxGeometry(0.0035, 0.0024, 0.0035), seal, s * (L / 2 + 0.0006), T * 0.45, -W / 2 + 0.004 + i * (W - 0.008) / 4, 0, Math.PI / 4, 0))
  }
  return g
}

/** 双肩包（直立；原点=底面中心，正面朝 +z）。圆角主袋 + 前袋 + 徽章 + 拉链与拉链头 + 提手 + 肩带与卡扣 + 侧袋。 */
export function buildFoyerBackpack(M: ItemMatFactory): THREE.Group {
  const g = new THREE.Group(); g.name = 'foyer-item-backpack'
  const fab = M('pack-fabric', { color: '#ffffff', map: foyerItemTex('pack_fabric', 3), roughness: 0.95 })
  const fab2 = M('pack-fabric2', { color: '#b8c0cc', map: foyerItemTex('pack_fabric', 2), roughness: 0.95 })
  const web = M('pack-web', { color: '#1f242b', roughness: 0.9 })
  const zip = M('pack-zip', { color: '#16181c', roughness: 0.6 })
  const pull = M('pack-pull', { color: '#e3a83c', roughness: 0.35, metalness: 0.6 })
  const patch = M('pack-patch', { color: '#ffffff', map: foyerItemTex('pack_patch'), roughness: 0.8, transparent: true })
  g.add(mesh(roundBox(0.32, 0.44, 0.17, 0.065, 3), fab, 0, 0.22, 0))
  g.add(mesh(roundBox(0.25, 0.2, 0.06, 0.03, 2), fab2, 0, 0.13, 0.095))
  g.add(mesh(new THREE.PlaneGeometry(0.06, 0.06), patch, 0, 0.18, 0.1255))
  // 拉链：主袋顶弧（三段）+ 前袋横线；拉链头
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.006, 0.008), zip, 0, 0.432, 0.04))
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.006, 0.16, 0.008), zip, s * 0.148, 0.33, 0.06, 0, 0, s * 0.12))
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.005, 0.006), zip, 0, 0.215, 0.126))
  for (const [x, y, z] of [[0.07, 0.427, 0.05], [0.06, 0.205, 0.131]] as const) g.add(mesh(roundBox(0.012, 0.026, 0.004, 0.002, 1), pull, x, y - 0.013, z))
  // 提手
  g.add(mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 14, Math.PI), web, 0, 0.44, -0.02))
  // 肩带（背面两条，略弯）+ 卡扣
  for (const s of [-1, 1]) {
    g.add(mesh(roundBox(0.055, 0.36, 0.022, 0.01, 1), web, s * 0.085, 0.24, -0.1, 0.1, 0, 0))
    g.add(mesh(roundBox(0.03, 0.02, 0.008, 0.003, 1), pull, s * 0.085, 0.1, -0.115))
  }
  // 侧袋（右侧网兜）
  g.add(mesh(roundBox(0.03, 0.13, 0.12, 0.012, 1), fab2, 0.168, 0.08, 0.01))
  return g
}
