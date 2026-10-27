// Level 0.2 装饰物细化（第五轮）：洗手间设施（马桶/隔断/洗手台）、Wi‑Fi 路由器、板夹的分件倒角建模，
// 以及设备层（喷淋管法兰/管卡/吊杆、保温风管、电缆桥架）与未完工房屋里的管卡、接线盒、施工灯、工具、锥桶等小件。
// 材质延续 l02Scene/l02Pbr 的约定：MeshBasic（不吃实时光、不触发整层着色器重编译），
// 明暗用「烘焙式」顶点色（固定的顶光 + 前光朗伯项 + 贴地 AO），可用 PBR 贴图的表面（保温棉/OSB/墙面板）走 installL02Pbr 起伏/AO。
// 同一件设施内按材质合批（一件马桶 ≈ 4 个 draw call），几何与材质随 l02Scene 的 disposeTree 释放（材质按 key 缓存复用）。
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { installL02Pbr, l02Tex, type L02PbrName } from './l02Pbr'
import { mirrorSurface } from './mirrorSurface'

const L = new THREE.Vector3(0.32, 0.86, 0.4).normalize()
/** 烘焙式明暗：朗伯（顶光偏前）+ 环境底 + 贴地 AO；k=整体亮度。 */
export function shadeGeo(g: THREE.BufferGeometry, k = 1, yOff = 0) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), c = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const lam = Math.max(0, n.getX(i) * L.x + n.getY(i) * L.y + n.getZ(i) * L.z)
    const y = p.getY(i) + yOff, ao = y < 0.12 ? 0.78 + 0.22 * Math.max(0, y) / 0.12 : 1
    const under = n.getY(i) < -0.5 ? 0.82 : 1
    const v = Math.min(1.15, (0.6 + 0.48 * lam) * ao * under * k)
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3))
  return g
}

const matCache = new Map<string, THREE.MeshBasicMaterial>()
type MatSpec = { color: string; pbr?: L02PbrName; side?: THREE.Side }
const MATS: Record<string, MatSpec> = {
  porcelain: { color: '#f3f2ec' }, porcelainDim: { color: '#e4e2da' }, chrome: { color: '#c3c9cf' }, chromeDark: { color: '#80878e' },
  steel: { color: '#a9adb0' }, galv: { color: '#b5b8b4' }, black: { color: '#26272a' }, rubber: { color: '#1b1b1c' },
  vanityLine: { color: '#8f8a7e' }, laminate: { color: '#8d97a0' }, laminateEdge: { color: '#6f7880' }, counter: { color: '#d9d4c6' }, vanity: { color: '#cdc7b8' },
  mirror: { color: '#a9bcc4' }, mirrorFrame: { color: '#4a4f54' }, braid: { color: '#9a9c9a' },
  routerWhite: { color: '#efeee9' }, routerPanel: { color: '#3a3d42' }, port: { color: '#151618' }, wanPort: { color: '#c79a1d' },
  masonite: { color: '#7a5434' }, paper: { color: '#f2f1ea' }, sprinkler: { color: '#b0352b' }, brass: { color: '#c5a253' },
  insul: { color: '#ffffff', pbr: 'insul' }, foil: { color: '#c9cdd0' }, tray: { color: '#7a7d7a' }, rod: { color: '#8e918e' },
  coneOrange: { color: '#e5561c' }, coneWhite: { color: '#f0efe8' }, bucket: { color: '#e8e6dc' }, hammerHead: { color: '#3b3d40' }, hammerGrip: { color: '#c8a12a' },
  pvc: { color: '#d3d6d9' }, copper: { color: '#c07a45' }, wireo: { color: '#d8762a' }, wirew: { color: '#eeeeea' }, junction: { color: '#5d6066' }, junctionCover: { color: '#8a8d92' },
  lampYellow: { color: '#e6c21a' }, lampGlass: { color: '#fff6dc' }, cable: { color: '#202020' },
}
export function propMat(key: string, vertexColors = true): THREE.MeshBasicMaterial {
  const ck = key + (vertexColors ? ':vc' : '')
  let m = matCache.get(ck)
  if (!m) {
    const s = MATS[key] ?? { color: '#ff00ff' }
    m = new THREE.MeshBasicMaterial({ color: s.color, vertexColors, side: s.side ?? THREE.FrontSide, map: s.pbr ? l02Tex(s.pbr) : null })
    if (s.pbr) installL02Pbr(m, s.pbr)
    m.name = 'l02p-' + key; m.userData.l02Shared = true; matCache.set(ck, m)
  }
  return m
}

/** 自发光/不打明暗的材质（灯罩玻璃）。 */
const NO_SHADE = new Set(['lampGlass'])
/** 合批构件：按材质收集几何，最后各合成一个 Mesh。 */
export class Kit {
  private parts = new Map<string, THREE.BufferGeometry[]>()
  private shadeK: number
  private yOff: number
  constructor(shadeK = 1, yOff = 0) { this.shadeK = shadeK; this.yOff = yOff }
  add(key: string, g: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz)
    g.translate(x, y, z)
    const flat = g.index ? g.toNonIndexed() : g
    if (flat !== g) g.dispose()
    for (const k of Object.keys(flat.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') flat.deleteAttribute(k)
    if (!flat.getAttribute('uv')) flat.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(flat.getAttribute('position').count * 2), 2))
    const l = this.parts.get(key) ?? []; l.push(flat); this.parts.set(key, l)
    return this
  }
  box(key: string, w: number, h: number, d: number, x: number, y: number, z: number, r = 0, rx = 0, ry = 0, rz = 0) {
    return this.add(key, r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)) : new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz)
  }
  cyl(key: string, rt: number, rb: number, h: number, x: number, y: number, z: number, seg = 12, rx = 0, ry = 0, rz = 0) {
    return this.add(key, new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z, rx, ry, rz)
  }
  torus(key: string, r: number, t: number, x: number, y: number, z: number, arc = Math.PI * 2, rx = 0, ry = 0, rz = 0, seg = 16) {
    return this.add(key, new THREE.TorusGeometry(r, t, 6, seg, arc), x, y, z, rx, ry, rz)
  }
  lathe(key: string, pts: [number, number][], x: number, y: number, z: number, seg = 20, sx = 1, sz = 1) {
    const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg)
    if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz)
    return this.add(key, g, x, y, z)
  }
  build(into: THREE.Object3D, name: string, pbrUV?: Record<string, number>) {
    for (const [k, list] of this.parts) {
      const g = mergeGeometries(list); list.forEach((v) => v.dispose()); if (!g) continue
      if (pbrUV?.[k]) worldUVBox(g, pbrUV[k])
      if (NO_SHADE.has(k)) g.deleteAttribute('color'); else shadeGeo(g, this.shadeK, this.yOff)
      const m = new THREE.Mesh(g, propMat(k, !NO_SHADE.has(k))); m.name = `${name}-${k}`; into.add(m)
    }
    this.parts.clear()
    return into
  }
}
/** 简单盒投影 UV（米 / scale），给 PBR 贴图用。 */
function worldUVBox(g: THREE.BufferGeometry, scale: number) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv')
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i))
    const u = ax > ay && ax > az ? p.getZ(i) : p.getX(i), v = ay > ax && ay > az ? p.getZ(i) : p.getY(i)
    uv.setXY(i, u / scale, v / scale)
  }
}

// ---------- 洗手间 ----------
/** 马桶（局部坐标：背靠 -z 墙，面朝 +z）。分件：底座+碗体（车削）、碗沿、座圈（椭圆环）、翻起的座盖、水箱+箱盖（倒角）、
 *  冲水按钮（双键）、角阀 + 编织软管、地脚螺栓盖。 */
export function toiletModel(g: THREE.Group) {
  const k = new Kit()
  k.lathe('porcelain', [[0.0, 0], [0.13, 0], [0.135, 0.02], [0.11, 0.08], [0.1, 0.2], [0.14, 0.3], [0.18, 0.37], [0.19, 0.395], [0.17, 0.4], [0.0, 0.4]], 0, 0, 0.06, 24, 1, 1.22)
  k.lathe('porcelainDim', [[0.0, 0.33], [0.13, 0.33], [0.155, 0.385], [0.0, 0.385]], 0, 0.006, 0.06, 20, 1, 1.22) // 碗内（略暗）
  k.add('porcelain', new THREE.TorusGeometry(0.155, 0.022, 8, 28).scale(1, 1.22, 1), 0, 0.42, 0.075, Math.PI / 2) // 座圈
  k.box('porcelain', 0.36, 0.42, 0.022, 0, 0.62, -0.115, 0.01, -0.12) // 翻起的座盖（靠在水箱上）
  k.box('porcelain', 0.4, 0.34, 0.17, 0, 0.6, -0.215, 0.025) // 水箱
  k.box('porcelain', 0.42, 0.035, 0.19, 0, 0.785, -0.215, 0.012) // 箱盖
  k.cyl('chrome', 0.026, 0.026, 0.01, 0, 0.806, -0.215, 20) // 双键冲水按钮
  k.box('chromeDark', 0.003, 0.012, 0.05, 0, 0.809, -0.215)
  k.cyl('chrome', 0.012, 0.012, 0.05, -0.15, 0.2, -0.285, 10, Math.PI / 2) // 角阀
  k.box('chrome', 0.018, 0.03, 0.01, -0.15, 0.2, -0.255, 0.004)
  k.cyl('braid', 0.006, 0.006, 0.24, -0.15, 0.32, -0.25, 6) // 编织软管
  for (const sx of [-0.1, 0.1]) k.add('porcelainDim', new THREE.SphereGeometry(0.018, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), sx, 0.02, 0.17) // 地脚螺栓盖
  k.build(g, 'l02-toilet')
}
/** 隔断板（局部：板沿 z，厚度在 x）：板离地 17 cm，前端立柱落地 + 不锈钢支脚，顶部不锈钢压条；非尽端带门扇（铰链、插销指示、衣钩）。 */
export function stallModel(g: THREE.Group, end: boolean) {
  const k = new Kit()
  k.box('laminate', 0.025, 1.55, 1.5, 0, 0.945, 0, 0.008) // 隔板
  k.box('laminateEdge', 0.032, 0.02, 1.5, 0, 1.73, 0, 0.004)
  k.box('chrome', 0.034, 0.012, 1.52, 0, 1.745, 0, 0.004) // 顶部压条
  k.box('laminate', 0.034, 1.9, 0.08, 0, 0.97, 0.75, 0.01) // 前端立柱
  k.box('chrome', 0.05, 0.1, 0.1, 0, 0.05, 0.75, 0.01) // 立柱支脚罩
  for (const z of [-0.5, 0.2]) { k.box('chrome', 0.06, 0.03, 0.03, 0.03, 1.2, z, 0.005); k.box('chrome', 0.06, 0.03, 0.03, 0.03, 0.4, z, 0.005) } // 墙码
  if (!end) {
    k.box('laminate', 0.6, 1.55, 0.025, 0.36, 0.945, 0.76, 0.008) // 门扇（关着）
    for (const y of [0.4, 1.45]) k.cyl('chrome', 0.009, 0.009, 0.1, 0.06, y, 0.775, 8) // 铰链
    k.box('chrome', 0.06, 0.03, 0.012, 0.58, 1.0, 0.778, 0.004) // 插销
    k.box('sprinkler', 0.022, 0.012, 0.004, 0.58, 1.0, 0.786) // 有人/无人指示（红）
    k.cyl('chrome', 0.006, 0.006, 0.06, 0.36, 1.5, 0.79, 6, Math.PI / 2.4) // 衣钩
  }
  k.build(g, 'l02-stall')
}
/** 洗手台（局部：背靠 -z 墙）：台面（倒角）+ 车削台盆 + 鹅颈龙头/单把手 + 下水 P 弯 + 柜体 + 带框镜子。 */
export function sinkModel(g: THREE.Group) {
  const k = new Kit()
  k.box('counter', 0.52, 0.05, 0.55, 0, 0.84, 0, 0.012)
  k.lathe('porcelain', [[0.0, -0.12], [0.06, -0.12], [0.15, -0.07], [0.19, -0.01], [0.2, 0.0], [0.185, 0.006], [0.0, 0.006]], 0, 0.866, 0.02, 24, 1, 0.8)
  k.cyl('chromeDark', 0.022, 0.022, 0.004, 0, 0.75, 0.02, 12) // 下水口（碗底）
  k.cyl('chrome', 0.022, 0.026, 0.05, 0, 0.89, -0.18, 14) // 龙头底座
  k.cyl('chrome', 0.011, 0.011, 0.18, 0, 0.99, -0.18, 10)
  k.torus('chrome', 0.06, 0.011, 0, 1.08, -0.12, Math.PI, 0, Math.PI / 2, 0, 12) // 鹅颈
  k.cyl('chrome', 0.013, 0.011, 0.03, 0, 1.03, -0.06, 10)
  k.box('chrome', 0.012, 0.012, 0.08, 0.04, 0.93, -0.2, 0.005, 0, 0.6) // 单把手
  k.cyl('chrome', 0.016, 0.016, 0.12, 0, 0.7, 0.02, 10) // 下水立管
  k.torus('chrome', 0.05, 0.016, 0, 0.62, 0.02 - 0.05, Math.PI, 0, Math.PI / 2, Math.PI) // P 弯
  k.cyl('chrome', 0.016, 0.016, 0.2, 0, 0.67, -0.17, 10, Math.PI / 2)
  k.box('vanity', 0.5, 0.78, 0.5, 0, 0.4, -0.02, 0.012) // 柜体
  k.box('vanityLine', 0.003, 0.7, 0.003, 0, 0.42, 0.232)
  k.box('chromeDark', 0.012, 0.1, 0.014, -0.05, 0.62, 0.238, 0.004); k.box('chromeDark', 0.012, 0.1, 0.014, 0.05, 0.62, 0.238, 0.004) // 柜门拉手
  k.box('mirrorFrame', 0.58, 0.74, 0.018, 0, 1.5, -0.262, 0.006)
  k.build(g, 'l02-sink')
  const reflector = mirrorSurface(.54, .7)
  reflector.position.set(0, 1.5, -.2498)
  g.add(reflector)
}

// ---------- 设备 ----------
/** Wi‑Fi 路由器：圆角机身 + 散热格栅 + 前面板指示灯条 + 后部网口（黄 WAN + 4 LAN）+ 两根带铰链的天线 + 橡胶脚垫。指示灯另由 l02Scene 生成（会闪）。 */
export function routerModel(g: THREE.Group) {
  const k = new Kit()
  k.box('routerWhite', 0.22, 0.042, 0.15, 0, 0.027, 0, 0.012)
  for (let i = 0; i < 7; i++) k.box('routerPanel', 0.12, 0.002, 0.004, 0, 0.0485, -0.04 + i * 0.012) // 顶面散热格栅
  k.box('routerPanel', 0.16, 0.012, 0.004, 0, 0.03, 0.074, 0.002) // 前面板
  k.box('wanPort', 0.016, 0.012, 0.01, -0.07, 0.025, -0.074)
  for (let i = 0; i < 4; i++) k.box('port', 0.016, 0.012, 0.01, -0.04 + i * 0.024, 0.025, -0.074)
  for (const sx of [-0.08, 0.08]) {
    k.cyl('black', 0.011, 0.011, 0.02, sx, 0.045, -0.07, 10, 0, 0, Math.PI / 2) // 铰链
    k.add('black', new THREE.CapsuleGeometry(0.008, 0.16, 4, 8), sx + Math.sin(sx * 1.2) * 0.09, 0.13, -0.07, 0, 0, sx * 1.2) // 天线
  }
  for (const [x, z] of [[-0.09, -0.06], [0.09, -0.06], [-0.09, 0.06], [0.09, 0.06]]) k.cyl('rubber', 0.008, 0.008, 0.006, x, 0.003, z, 8)
  k.build(g, 'l02-router')
}
/** 板夹（局部：已倾斜的子组里，板面朝 +z）：圆角硬纸板 + 金属长夹（压板 + 卷边 + 弹簧铰轴） + 纸张（另由 l02Scene 贴图）。 */
export function clipboardModel(tilt: THREE.Group) {
  const k = new Kit(1.05)
  k.box('masonite', 0.24, 0.33, 0.006, 0, 0.17, 0, 0.004)
  k.box('steel', 0.1, 0.03, 0.004, 0, 0.318, 0.008, 0.002) // 压板
  k.cyl('steel', 0.005, 0.005, 0.1, 0, 0.332, 0.01, 8, 0, 0, Math.PI / 2) // 铰轴
  k.torus('steel', 0.012, 0.0025, 0, 0.343, 0.014, Math.PI, 0, 0, 0, 10) // 提环
  for (const sx of [-0.045, 0.045]) k.cyl('steel', 0.002, 0.002, 0.008, sx, 0.31, 0.006, 6, Math.PI / 2) // 铆钉
  k.build(tilt, 'l02-clipboard')
}

// ---------- 设备层（掉板后露出） ----------
/** 设备层管线细化：喷淋支管（法兰/沟槽卡箍、管卡 + 吊杆）、保温风管（保温棉 PBR + 铝箔胶带箍）、电缆桥架（侧板 + 横档）、主龙骨吊杆。 */
export function plenumModel(g: THREE.Group, cx: number, cz: number, w: number, d: number, H: number) {
  const k = new Kit(0.75)
  const sx = cx + 0.22 * w
  // 喷淋支管（沿 z）+ 两道沟槽卡箍 + 一处管卡吊杆
  k.cyl('sprinkler', 0.018, 0.018, d + 0.2, sx, H + 0.18, cz, 10, Math.PI / 2)
  for (const dz of [-0.35, 0.35]) k.torus('sprinkler', 0.022, 0.006, sx, H + 0.18, cz + dz * d, Math.PI * 2, 0, 0, 0, 12)
  k.torus('galv', 0.024, 0.004, sx, H + 0.18, cz - 0.1 * d, Math.PI * 2, 0, 0, 0, 12) // 管卡环
  k.cyl('rod', 0.004, 0.004, 0.3, sx, H + 0.35, cz - 0.1 * d, 6) // 吊杆
  k.cyl('sprinkler', 0.012, 0.012, 0.13, sx, H + 0.11, cz, 8) // 下垂短管
  k.cyl('brass', 0.016, 0.016, 0.012, sx, H + 0.05, cz, 10) // 喷头座
  k.cyl('brass', 0.026, 0.012, 0.012, sx, H + 0.032, cz, 12) // 溅水盘
  // 保温风管（沿 x）：保温棉外包 + 铝箔胶带箍
  k.cyl('insul', 0.13, 0.13, w + 0.2, cx, H + 0.3, cz - 0.1 * d, 14, 0, 0, Math.PI / 2)
  for (const dx of [-0.3, 0.05, 0.38]) k.cyl('foil', 0.134, 0.134, 0.05, cx + dx * w, H + 0.3, cz - 0.1 * d, 14, 0, 0, Math.PI / 2)
  // 电缆桥架（沿 x）：两侧板 + 横档 + 两根吊杆
  const tz = cz - 0.32 * d
  for (const s of [-1, 1]) k.box('tray', w + 0.2, 0.05, 0.006, cx, H + 0.4, tz + s * 0.07)
  for (let t = -w / 2; t <= w / 2; t += 0.15) k.box('tray', 0.02, 0.006, 0.14, cx + t, H + 0.377, tz)
  k.cyl('cable', 0.008, 0.008, w + 0.2, cx, H + 0.39, tz - 0.03, 6, 0, 0, Math.PI / 2)
  k.cyl('cable', 0.008, 0.008, w + 0.2, cx, H + 0.39, tz + 0.01, 6, 0, 0, Math.PI / 2)
  // 主龙骨吊丝
  for (const dx of [-0.3, 0.3]) k.cyl('galv', 0.003, 0.003, 0.48, cx + dx * w, H + 0.24, cz + 0.1 * d, 4)
  k.build(g, 'l02-plenum', { insul: 0.6 })
}

// ---------- 未完工房屋小件（世界坐标；l02Scene.buildHouse 调用） ----------
export function houseProps(root: THREE.Group, F: { x: number; y: number; w: number; h: number }, O: { x: number; y: number; w: number; h: number }, D: number, partitions: { x: number; y: number; w: number; h: number }[], pipeYs: [number, string, number][], lamps: { x: number; y: number; z: number }[]) {
  const k = new Kit(0.62, D)
  for (const l of lamps) workLamp(k, l.x, l.y, l.z, -D)
  // 管线：每根龙骨处一个 U 形管卡 + 两颗钉帽；PVC 管每 1.2 m 一个承插接头
  for (const p of partitions) {
    const alongX = p.w > p.h, len = alongX ? p.w : p.h
    for (let t = 0; t <= len + 0.01; t += 0.4) {
      const x = alongX ? p.x + Math.min(t, len) : p.x + p.w / 2, z = alongX ? p.y + p.h / 2 : p.y + Math.min(t, len)
      for (const [y, , r] of pipeYs) k.torus('galv', r + 0.004, 0.003, x, y, z, Math.PI, 0, alongX ? Math.PI / 2 : 0, 0, 8)
    }
    for (let t = 0.6; t < len; t += 1.2) { const x = alongX ? p.x + t : p.x + p.w / 2, z = alongX ? p.y + p.h / 2 : p.y + t; k.cyl('pvc', 0.036, 0.036, 0.07, x, -D + 0.45, z, 12, alongX ? 0 : Math.PI / 2, 0, alongX ? Math.PI / 2 : 0) }
  }
  // 接线盒：盒盖 + 4 颗螺钉 + 2 根引出电线 + 线帽
  const jx = F.x + 0.5, jy = -0.25 - 0.3, jz = F.y + 0.16
  k.box('junctionCover', 0.13, 0.13, 0.008, jx, jy, jz + 0.034, 0.004)
  for (const [a, b] of [[-0.05, -0.05], [0.05, -0.05], [-0.05, 0.05], [0.05, 0.05]]) k.cyl('chromeDark', 0.005, 0.005, 0.004, jx + a, jy + b, jz + 0.04, 6, Math.PI / 2)
  k.cyl('wireo', 0.006, 0.006, 0.25, jx - 0.03, jy - 0.19, jz + 0.02, 6, 0.2); k.cyl('wirew', 0.006, 0.006, 0.22, jx + 0.03, jy - 0.18, jz + 0.02, 6, -0.2)
  k.cyl('sprinkler', 0.01, 0.006, 0.03, jx - 0.05, jy - 0.32, jz + 0.04, 8)
  // 工具与碎料：塑料桶、羊角锤、卷尺、锥桶、几段断龙骨
  const bx = F.x + F.w - 0.55, bz = F.y + F.h - 0.55, fy = -D
  k.lathe('bucket', [[0.12, 0], [0.14, 0.3], [0.15, 0.3], [0.15, 0.31], [0.135, 0.31], [0.115, 0.01], [0, 0.01]], bx, fy, bz, 18)
  k.torus('steel', 0.14, 0.003, bx, fy + 0.3, bz, Math.PI, 0.9, 0, 0, 12)
  k.box('hammerGrip', 0.03, 0.025, 0.24, bx - 0.35, fy + 0.014, bz + 0.05, 0.008, 0, 0.5)
  k.box('hammerHead', 0.11, 0.03, 0.03, bx - 0.41, fy + 0.016, bz - 0.06, 0.005, 0, 0.5)
  k.cyl('lampYellow', 0.035, 0.035, 0.035, bx - 0.2, fy + 0.018, bz - 0.25, 14)
  k.box('black', 0.03, 0.02, 0.012, bx - 0.2, fy + 0.018, bz - 0.21, 0.003)
  const ccx = O.x + O.w + 0.45, ccz = O.y + 0.35
  if (ccx < F.x + F.w - 0.2) {
    k.box('black', 0.3, 0.025, 0.3, ccx, fy + 0.012, ccz, 0.01)
    k.lathe('coneOrange', [[0.12, 0.025], [0.025, 0.46], [0.0, 0.46]], ccx, fy, ccz, 16)
    k.lathe('coneWhite', [[0.092, 0.15], [0.07, 0.22], [0.068, 0.221], [0.09, 0.151]], ccx, fy + 0.001, ccz, 16)
    k.lathe('coneWhite', [[0.058, 0.28], [0.045, 0.33], [0.044, 0.331], [0.057, 0.281]], ccx, fy + 0.001, ccz, 16)
  }
  for (let i = 0; i < 3; i++) k.box('galv', 0.6 - i * 0.12, 0.04, 0.09, F.x + 0.7 + i * 0.25, fy + 0.025 + i * 0.04, F.y + F.h - 0.45, 0.004, 0, 0.3 + i * 0.5)
  k.build(root, 'l02-house-props')
}
/** 施工灯（三脚架 + 中柱卡箍 + 灯头壳/玻璃/护网 + 电线拖地）：世界坐标，(x,y)=地面位置，z=灯头高度。 */
export function workLamp(k: Kit, x: number, y: number, z: number, floor: number) {
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; k.add('black', new THREE.CylinderGeometry(0.011, 0.011, 1.0, 6).rotateZ(Math.cos(a) * 0.3).rotateX(Math.sin(a) * 0.3), x + Math.cos(a) * 0.15, floor + 0.48, y + Math.sin(a) * 0.15) }
  k.cyl('black', 0.012, 0.012, z - floor - 0.5, x, floor + 0.5 + (z - floor - 0.5) / 2, y, 8)
  k.cyl('galv', 0.02, 0.02, 0.04, x, floor + 0.95, y, 10) // 卡箍
  k.box('lampYellow', 0.34, 0.26, 0.14, x, z, y, 0.025)
  k.box('lampGlass', 0.28, 0.2, 0.02, x, z, y + 0.075)
  for (let i = 0; i < 4; i++) k.box('black', 0.3, 0.008, 0.008, x, z - 0.09 + i * 0.06, y + 0.088)
  k.cyl('black', 0.008, 0.008, 0.45, x - 0.2, floor + 0.2, y, 6, 0, 0, 0.9) // 电线
}
