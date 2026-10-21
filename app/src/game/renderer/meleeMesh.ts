// 近战武器重制（2026-10-21）：刀 / 撬棍 / 管钳 / 木板 / 斧头 —— 完好、磨损（耐久 ≤25%）、残件三种状态 + 血污分级。
//
// 本地坐标约定（所有武器一致，便于第一人称握持与挥砍动画以手为轴心）：
//   原点 = 主手握持中心；+Y 沿武器长轴指向打击端；-Z = 打击面（刃口 / 羊角 / 钳口 / 钉尖）；X = 厚度方向。
// 地面掉落版用 buildMeleeGroundMesh()：长轴转到 +X、平躺、几何中心归零。
//
// 覆盖层：每把武器的打击部位挂「血污」叠层，握把/易损部位挂「裂痕锈蚀」叠层，
// 共享几何、polygonOffset 叠画，运行时用 setMeleeWear() 调整，不重建网格。
import * as THREE from 'three'
import { litMaterial } from './shared'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type MeleeType = 'knife' | 'crowbar' | 'wrench' | 'timber' | 'axe'
export const MELEE_TYPES: MeleeType[] = ['knife', 'crowbar', 'wrench', 'timber', 'axe']
export type MeleeState = 'intact' | 'broken'
export interface MeleeBuildOpts { state?: MeleeState; seed?: number }
export interface MeleeRig {
  type: MeleeType; state: MeleeState
  blood: THREE.Mesh[]; wear: THREE.Mesh[]
  /** 打击点（本地坐标），挥砍判定 / 火花粒子用 */
  tip: THREE.Vector3
  /** 副手握点（双手武器：斧头、木板、撬棍重击）；单手武器为 null */
  offGrip: THREE.Vector3 | null
  /** 长度（米），握点到打击端 */
  reach: number
}

/** 真实尺寸（米），供验收与 HUD 说明 */
export const MELEE_DIM: Record<MeleeType, { len: number; mass: number; note: string }> = {
  knife: { len: 0.29, mass: 0.21, note: '落尖直刀 · 14cm 刃 · 帆布胶木柄' },
  crowbar: { len: 0.76, mass: 1.6, note: '30 英寸六角撬棍 · 鹅颈羊角 + 扁凿' },
  wrench: { len: 0.36, mass: 1.1, note: '14 英寸管钳 · 工字柄 · 滚花调节螺母' },
  timber: { len: 0.86, mass: 1.4, note: '2×4 松木板 · 末端三根锈钉' },
  axe: { len: 0.86, mass: 2.7, note: '36 英寸消防斧 · 玻纤柄 · 后置尖镐' },
}

// ---------------------------------------------------------------- 工具
function rng(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const texCache = new Map<string, THREE.CanvasTexture>()
function tex(key: string, paint: (c: CanvasRenderingContext2D, n: number, r: () => number) => void, n = 512, alpha = false): THREE.CanvasTexture {
  const hit = texCache.get(key); if (hit) return hit
  const cv = document.createElement('canvas'); cv.width = cv.height = n
  const c = cv.getContext('2d')!
  let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  paint(c, n, rng(h))
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter
  if (alpha) t.premultiplyAlpha = false
  t.userData.shared = true
  texCache.set(key, t); return t
}

/** 盒式投影 UV：按面法线主轴取平面坐标，scale = 每米重复次数。几何转为非索引。 */
function boxUV(geo: THREE.BufferGeometry, scale = 4): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo
  if(g !== geo) geo.dispose()
  g.computeVertexNormals()
  const p = g.attributes.position, n = g.attributes.normal
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i += 3) {
    let nx = 0, ny = 0, nz = 0
    for (let k = 0; k < 3; k++) { nx += Math.abs(n.getX(i + k)); ny += Math.abs(n.getY(i + k)); nz += Math.abs(n.getZ(i + k)) }
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k)
      // 长轴 Y 恒为 V：纹理纹理方向（木纹、拉丝、玻纤）一律顺着武器长度走
      const u = nx >= ny && nx >= nz ? z : ny >= nz ? x + z * 0.5 : x
      const v = ny >= nx && ny >= nz ? z : y
      uv[(i + k) * 2] = u * scale; uv[(i + k) * 2 + 1] = v * scale
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

/** YZ 平面轮廓（shape.x→Z, shape.y→Y）沿 X 挤出 thick，居中。 */
function profile(shape: THREE.Shape, thick: number, bevel = 0.0015, curveSegments = 10): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thick, curveSegments, bevelEnabled: bevel > 0, bevelSegments: 2,
    bevelSize: bevel, bevelThickness: bevel,
  })
  geo.translate(0, 0, -thick / 2)
  geo.rotateY(-Math.PI / 2)
  return geo
}

/** 沿 Y 的截锥方盒：底面 w0×d0（y=0），顶面 w1×d1（y=len），顶面可沿 Z 偏移 dz（做弯刃/楔形）。 */
function taperBox(w0: number, d0: number, w1: number, d1: number, len: number, dz = 0, dx = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, len, 1, 1, 4, 1)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + len / 2) / len
    const w = w0 + (w1 - w0) * t, d = d0 + (d1 - d0) * t
    p.setXYZ(i, p.getX(i) * w + dx * t, p.getY(i) + len / 2, p.getZ(i) * d + dz * t)
  }
  g.computeVertexNormals(); return g
}

/** 顶点扰动：做旧木料/铸件不再是完美方块 */
function jitter(geo: THREE.BufferGeometry, amp: number, seed: number) {
  const r = rng(seed), p = geo.attributes.position, seen = new Map<string, [number, number, number]>()
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`
    let d = seen.get(k); if (!d) { d = [(r() - .5) * amp, (r() - .5) * amp * .4, (r() - .5) * amp]; seen.set(k, d) }
    p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2])
  }
  geo.computeVertexNormals(); return geo
}

// ---------------------------------------------------------------- 纹理
function scratches(c: CanvasRenderingContext2D, n: number, r: () => number, count: number, light: string, dark: string, vertical = true) {
  for (let i = 0; i < count; i++) {
    const x = r() * n, y = r() * n, L = 8 + r() * 60
    c.strokeStyle = r() < .6 ? light : dark; c.lineWidth = r() < .15 ? 1.6 : .8
    c.beginPath(); c.moveTo(x, y)
    if (vertical) c.lineTo(x + (r() - .5) * 6, y + L); else c.lineTo(x + L, y + (r() - .5) * 6)
    c.stroke()
  }
}
const steelTex = () => tex('melee-steel', (c, n, r) => {
  const g = c.createLinearGradient(0, 0, n, 0)
  g.addColorStop(0, '#8e9393'); g.addColorStop(.3, '#c9cdcb'); g.addColorStop(.55, '#9da2a1'); g.addColorStop(.8, '#d6d9d6'); g.addColorStop(1, '#8a8f8f')
  c.fillStyle = g; c.fillRect(0, 0, n, n)
  c.globalAlpha = .22
  for (let x = 0; x < n; x += 2) { c.fillStyle = r() < .5 ? '#ffffff' : '#3a3e3e'; c.fillRect(x, 0, 1, n) }
  c.globalAlpha = 1
  scratches(c, n, r, 160, 'rgba(255,255,255,.35)', 'rgba(30,32,32,.35)', false)
  for (let i = 0; i < 120; i++) { c.fillStyle = `rgba(60,48,36,${.08 + r() * .15})`; c.beginPath(); c.arc(r() * n, r() * n, .6 + r() * 1.8, 0, 7); c.fill() }
})
const edgeTex = () => tex('melee-edge', (c, n, r) => {
  c.fillStyle = '#e6e9e6'; c.fillRect(0, 0, n, n)
  c.globalAlpha = .35
  for (let y = 0; y < n; y += 2) { c.fillStyle = r() < .5 ? '#ffffff' : '#9aa0a0'; c.fillRect(0, y, n, 1) } // 磨刀石横纹
  c.globalAlpha = 1
})
const darkSteelTex = () => tex('melee-darksteel', (c, n, r) => {
  c.fillStyle = '#3c3f3f'; c.fillRect(0, 0, n, n)
  for (let i = 0; i < 2200; i++) { c.fillStyle = `rgba(${r() < .5 ? '120,110,96' : '20,20,22'},${.1 + r() * .2})`; c.fillRect(r() * n, r() * n, 1 + r() * 2, 1 + r() * 2) }
  scratches(c, n, r, 90, 'rgba(190,196,192,.45)', 'rgba(10,10,10,.4)')
  for (let i = 0; i < 26; i++) { c.fillStyle = `rgba(122,62,28,${.15 + r() * .25})`; c.beginPath(); c.ellipse(r() * n, r() * n, 3 + r() * 14, 2 + r() * 8, r() * 3, 0, 7); c.fill() } // 锈斑
})
/** 磨损烤漆：底漆色块 + 剥落露出钢 + 刮痕。edgeWear = 两端裸钢渐变（V 方向 0..1 映射到 UV v） */
const paintTex = (key: string, base: string, hi: string, chips = 22) => tex('melee-paint-' + key, (c, n, r) => {
  c.fillStyle = base; c.fillRect(0, 0, n, n)
  for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${r() < .5 ? '255,255,255' : '0,0,0'},${.03 + r() * .05})`; c.fillRect(r() * n, r() * n, 2 + r() * 6, 1 + r() * 3) }
  c.fillStyle = hi; c.globalAlpha = .12
  for (let i = 0; i < 10; i++) c.fillRect(0, r() * n, n, 1 + r() * 2)
  c.globalAlpha = 1
  for (let i = 0; i < chips; i++) { // 剥落露钢：不规则多边形，外圈一道暗边
    const x = r() * n, y = r() * n, s = 2 + r() * 7
    c.beginPath()
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, rr = s * (.5 + r() * .7); c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * (.5 + r())) }
    c.closePath(); c.fillStyle = 'rgba(40,24,18,.6)'; c.fill()
    c.save(); c.translate(x, y); c.scale(.72, .72); c.translate(-x, -y); c.fillStyle = r() < .5 ? '#5d615f' : '#4a4038'; c.fill(); c.restore()
  }
  scratches(c, n, r, 45, 'rgba(200,204,200,.35)', 'rgba(30,14,10,.3)', false)
})
const knurlTex = () => tex('melee-knurl', (c, n) => {
  c.fillStyle = '#6f7372'; c.fillRect(0, 0, n, n)
  c.strokeStyle = 'rgba(20,22,22,.75)'; c.lineWidth = 2
  for (let x = -n; x < 2 * n; x += 10) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + n, n); c.stroke(); c.beginPath(); c.moveTo(x + n, 0); c.lineTo(x, n); c.stroke() }
  c.strokeStyle = 'rgba(220,224,220,.35)'; c.lineWidth = 1
  for (let x = -n; x < 2 * n; x += 10) { c.beginPath(); c.moveTo(x + 3, 0); c.lineTo(x + n + 3, n); c.stroke() }
})
const micartaTex = () => tex('melee-micarta', (c, n, r) => {
  c.fillStyle = '#2d3428'; c.fillRect(0, 0, n, n)
  for (let y = 0; y < n; y += 3) { c.fillStyle = `rgba(${r() < .5 ? '90,104,74' : '14,16,12'},${.15 + r() * .25})`; c.fillRect(0, y + r() * 2, n, 1 + r() * 2) } // 帆布层
  for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(150,160,120,${r() * .12})`; c.fillRect(r() * n, r() * n, 2, 1) }
  for (let i = 0; i < 30; i++) { c.fillStyle = 'rgba(18,14,10,.25)'; c.beginPath(); c.ellipse(r() * n, r() * n, 6 + r() * 20, 3 + r() * 9, r() * 3, 0, 7); c.fill() } // 手汗油斑
})
const brassTex = () => tex('melee-brass', (c, n, r) => {
  c.fillStyle = '#a8843e'; c.fillRect(0, 0, n, n)
  for (let i = 0; i < 1600; i++) { c.fillStyle = `rgba(${r() < .5 ? '240,210,140' : '60,40,14'},${r() * .2})`; c.fillRect(r() * n, r() * n, 1, 1) }
}, 64)
const tapeTex = () => tex('melee-tape', (c, n, r) => {
  c.fillStyle = '#1b1c1e'; c.fillRect(0, 0, n, n)
  for (let y = 0; y < n; y += 26) { c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(0, y, n, 2); c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(0, y + 2, n, 1) } // 叠绕边
  for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(200,200,200,${r() * .06})`; c.fillRect(r() * n, r() * n, 3 + r() * 10, 1) }
}, 256)
const woodSide = (key: string) => tex('melee-wood-' + key, (c, n, r) => {
  c.fillStyle = '#a07a4a'; c.fillRect(0, 0, n, n)
  for (let x = 0; x < n; x += 1) { // 年轮纹：沿 V（长度）走，正弦起伏
    const w = Math.sin(x * .09 + r() * .3) * .5 + .5
    c.fillStyle = `rgba(${w > .82 ? '96,62,32' : '214,178,128'},${w > .82 ? .55 : .06})`
    c.fillRect(x, 0, 1, n)
  }
  for (let i = 0; i < 70; i++) { const x = r() * n; c.strokeStyle = `rgba(110,72,38,${.2 + r() * .3})`; c.lineWidth = .6 + r(); c.beginPath(); c.moveTo(x, 0); for (let y = 0; y <= n; y += 16) c.lineTo(x + Math.sin(y * .02 + i) * 4, y); c.stroke() }
  for (let k = 0; k < 2; k++) { // 节疤
    const x = n * (.25 + r() * .5), y = n * (.2 + r() * .6)
    for (let s = 14; s > 1; s -= 2) { c.strokeStyle = `rgba(86,50,22,${.25 + (14 - s) * .04})`; c.lineWidth = 1.5; c.beginPath(); c.ellipse(x, y, s * .7, s * 2.2, 0, 0, 7); c.stroke() }
    c.fillStyle = '#4a2c14'; c.beginPath(); c.ellipse(x, y, 3, 7, 0, 0, 7); c.fill()
  }
  // 风化：灰化 + 旧白漆残片（棚屋拆下来的）
  c.fillStyle = 'rgba(120,118,110,.22)'; c.fillRect(0, 0, n, n)
  for (let i = 0; i < 5; i++) { const x = r() * n, y = r() * n; c.fillStyle = 'rgba(206,204,190,.55)'; c.beginPath(); for (let k = 0; k < 6; k++) c.lineTo(x + (r() - .5) * 30, y + (r() - .5) * 60); c.fill() }
  for (let i = 0; i < 30; i++) { c.fillStyle = 'rgba(60,40,24,.35)'; c.fillRect(r() * n, r() * n, 1, 10 + r() * 40) } // 干裂
})
const woodEnd = () => tex('melee-wood-end', (c, n, r) => {
  c.fillStyle = '#c9a26a'; c.fillRect(0, 0, n, n)
  const cx = n * (.3 + r() * .4), cy = -n * .4
  for (let s = 0; s < n * 2; s += 7 + r() * 5) { c.strokeStyle = `rgba(120,80,40,${.35 + r() * .3})`; c.lineWidth = 2 + r() * 2; c.beginPath(); c.arc(cx, cy, s, 0, 7); c.stroke() }
  for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(60,40,20,${r() * .2})`; c.fillRect(r() * n, r() * n, 1, 1) }
}, 256)
const fiberglassTex = () => tex('melee-fiberglass', (c, n, r) => {
  const g = c.createLinearGradient(0, 0, n, 0)
  g.addColorStop(0, '#a66b0c'); g.addColorStop(.25, '#f2b72c'); g.addColorStop(.5, '#d99a18'); g.addColorStop(.75, '#f7c540'); g.addColorStop(1, '#a66b0c')
  c.fillStyle = g; c.fillRect(0, 0, n, n)
  for (let i = 0; i < 500; i++) { const x = r() * n; c.strokeStyle = `rgba(${r() < .5 ? '255,236,170' : '120,70,6'},${.1 + r() * .2})`; c.lineWidth = .7; c.beginPath(); c.moveTo(x, r() * n); c.lineTo(x + (r() - .5) * 2, r() * n); c.stroke() }
  scratches(c, n, r, 60, 'rgba(255,250,220,.35)', 'rgba(60,30,4,.35)')
})
const rubberTex = () => tex('melee-rubber', (c, n, r) => {
  c.fillStyle = '#222325'; c.fillRect(0, 0, n, n)
  for (let y = 0; y < n; y += 16) { c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(0, y, n, 3); c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(0, y + 3, n, 2) }
  for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(150,140,120,${r() * .1})`; c.fillRect(r() * n, r() * n, 2, 2) }
}, 256)
const ragTex = () => tex('melee-rag', (c, n, r) => {
  c.fillStyle = '#7d6f57'; c.fillRect(0, 0, n, n)
  for (let x = 0; x < n; x += 3) { c.fillStyle = `rgba(${r() < .5 ? '170,150,116' : '50,40,28'},.3)`; c.fillRect(x, 0, 1, n) }
  for (let y = 0; y < n; y += 3) { c.fillStyle = `rgba(${r() < .5 ? '160,140,110' : '40,32,22'},.25)`; c.fillRect(0, y, n, 1) }
  for (let i = 0; i < 20; i++) { c.fillStyle = `rgba(60,44,28,${.2 + r() * .3})`; c.beginPath(); c.ellipse(r() * n, r() * n, 10 + r() * 30, 6 + r() * 20, r() * 3, 0, 7); c.fill() }
}, 256)
/** 血污叠层：alpha 贴图。高处喷溅 + 打击端积血 + 顺长轴下流的血线 */
const bloodTex = () => tex('melee-blood', (c, n, r) => {
  c.clearRect(0, 0, n, n)
  const drop = (x: number, y: number, s: number, a: number) => { c.fillStyle = `rgba(${64 + r() * 34},${4 + r() * 8},${4 + r() * 6},${a})`; c.beginPath(); c.ellipse(x, y, s, s * (.6 + r() * .8), r() * 3, 0, 7); c.fill() }
  for (let i = 0; i < 26; i++) { const x = r() * n, y = r() * n; drop(x, y, 4 + r() * 16, .55 + r() * .35); for (let k = 0; k < 6; k++) drop(x + (r() - .5) * 70, y + (r() - .5) * 70, 1 + r() * 4, .7) }
  for (let i = 0; i < 18; i++) { // 流淌血线
    const x = r() * n, y = r() * n, L = 30 + r() * 120
    c.strokeStyle = `rgba(80,6,6,${.6 + r() * .3})`; c.lineWidth = 2 + r() * 4; c.lineCap = 'round'
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + (r() - .5) * 10, y + L / 2, x + (r() - .5) * 8, y + L); c.stroke()
    drop(x, y + L, 3 + r() * 3, .85)
  }
  for (let i = 0; i < 300; i++) drop(r() * n, r() * n, .6 + r() * 1.6, .8)
}, 512, true)
/** 磨损叠层：深色裂纹 + 锈斑 + 毛边白化 */
const wearTex = () => tex('melee-wear', (c, n, r) => {
  c.clearRect(0, 0, n, n)
  for (let i = 0; i < 14; i++) {
    let x = r() * n, y = r() * n
    c.strokeStyle = `rgba(16,12,10,${.7 + r() * .3})`; c.lineWidth = 1 + r() * 2
    c.beginPath(); c.moveTo(x, y)
    for (let k = 0; k < 8; k++) { x += (r() - .5) * 24; y += 6 + r() * 22; c.lineTo(x, y); if (r() < .3) { c.moveTo(x, y); c.lineTo(x + (r() - .5) * 30, y + r() * 16); c.moveTo(x, y) } }
    c.stroke()
  }
  for (let i = 0; i < 22; i++) { c.fillStyle = `rgba(${70 + r() * 30},${38 + r() * 14},${20},${.12 + r() * .2})`; c.beginPath(); c.ellipse(r() * n, r() * n, 4 + r() * 18, 3 + r() * 12, r() * 3, 0, 7); c.fill() }
  for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(230,224,210,${r() * .35})`; c.fillRect(r() * n, r() * n, 1 + r() * 3, 1) }
}, 512, true)

// ---------------------------------------------------------------- 材质（按需缓存；叠层材质每把一份，便于独立调透明度）
let matCache = new Map<string, THREE.Material>()
function M(key: string, make: () => THREE.Material) { let m = matCache.get(key); if (!m) { m = make(); matCache.set(key, m) } return m }
const mats = {
  steel: () => M('steel', () => litMaterial({ color: '#ffffff', map: steelTex(), metalness: .82, roughness: .34, envBase: .45 })),
  edge: () => M('edge', () => litMaterial({ color: '#ffffff', map: edgeTex(), metalness: .9, roughness: .18, envBase: .6 })),
  dark: () => M('dark', () => litMaterial({ color: '#ffffff', map: darkSteelTex(), metalness: .62, roughness: .6, envBase: .2 })),
  red: () => M('red', () => litMaterial({ color: '#ffffff', map: paintTex('red', '#9b2b20', '#c94a36', 30), metalness: .35, roughness: .55, envBase: .2 })),
  redHead: () => M('redHead', () => litMaterial({ color: '#ffffff', map: paintTex('redhead', '#b3271d', '#e0503a', 16), metalness: .4, roughness: .45, envBase: .25 })),
  wrenchRed: () => M('wrenchRed', () => litMaterial({ color: '#ffffff', map: paintTex('wrench', '#a8231b', '#d84634', 34), metalness: .45, roughness: .5, envBase: .25 })),
  knurl: () => M('knurl', () => litMaterial({ color: '#ffffff', map: knurlTex(), metalness: .75, roughness: .45, envBase: .3 })),
  micarta: () => M('micarta', () => litMaterial({ color: '#ffffff', map: micartaTex(), roughness: .82, envBase: .05 })),
  brass: () => M('brass', () => litMaterial({ color: '#ffffff', map: brassTex(), metalness: .85, roughness: .35, envBase: .4 })),
  tape: () => M('tape', () => litMaterial({ color: '#ffffff', map: tapeTex(), roughness: .6, envBase: .08 })),
  wood: () => M('wood', () => litMaterial({ color: '#ffffff', map: woodSide('a'), roughness: .92 })),
  woodEnd: () => M('woodEnd', () => litMaterial({ color: '#ffffff', map: woodEnd(), roughness: .95 })),
  woodRaw: () => M('woodRaw', () => litMaterial({ color: '#e8cf9c', map: woodSide('a'), roughness: .95 })), // 断口新鲜木色
  rust: () => M('rust', () => litMaterial({ color: '#7a4a2c', map: darkSteelTex(), metalness: .4, roughness: .8 })),
  fiber: () => M('fiber', () => litMaterial({ color: '#ffffff', map: fiberglassTex(), roughness: .45, envBase: .15 })),
  rubber: () => M('rubber', () => litMaterial({ color: '#ffffff', map: rubberTex(), roughness: .95 })),
  rag: () => M('rag', () => litMaterial({ color: '#ffffff', map: ragTex(), roughness: 1, side: THREE.DoubleSide })),
  blackPaint: () => M('blackPaint', () => litMaterial({ color: '#2a2b2c', map: darkSteelTex(), metalness: .5, roughness: .55, envBase: .15 })),
}
function overlayMat(kind: 'blood' | 'wear'): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ map: kind === 'blood' ? bloodTex() : wearTex(), transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  m.userData.overlay = kind
  return m
}

// ---------------------------------------------------------------- 构建上下文
interface Ctx { g: THREE.Group; blood: THREE.Mesh[]; wear: THREE.Mesh[]; bloodMat: THREE.MeshLambertMaterial; wearMat: THREE.MeshLambertMaterial; r: () => number }
function part(c: Ctx, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], o: { blood?: boolean; wear?: boolean; uv?: number; pos?: [number, number, number]; rot?: [number, number, number]; keepUV?: boolean; parent?: THREE.Object3D } = {}): THREE.Mesh {
  const gg = o.keepUV ? geo : boxUV(geo, o.uv ?? 5)
  const mesh = new THREE.Mesh(gg, mat)
  if (o.pos) mesh.position.set(...o.pos)
  if (o.rot) mesh.rotation.set(...o.rot)
  ;(o.parent ?? c.g).add(mesh)
  if (o.blood) { const b = new THREE.Mesh(gg, c.bloodMat); b.renderOrder = 2; b.userData.overlay = 'blood'; mesh.add(b); c.blood.push(b) }
  if (o.wear) { const w = new THREE.Mesh(gg, c.wearMat); w.renderOrder = 1; w.userData.overlay = 'wear'; mesh.add(w); c.wear.push(w) }
  return mesh
}
/** 胶带 / 布条螺旋缠绕：沿 Y 从 y0 到 y1，半径 rad（可椭圆 sx） */
function wrapBand(c: Ctx, y0: number, y1: number, rad: number, mat: THREE.Material, turns = 7, sx = 1, sz = 1, o: { blood?: boolean; wear?: boolean; seg?: number } = {}) {
  const segs = o.seg ?? Math.round(turns * 3)
  for (let i = 0; i < segs; i++) {
    const t = i / segs, h = (y1 - y0) / segs
    const ring = new THREE.CylinderGeometry(rad, rad, h * 1.08, 14, 1, true)
    ring.rotateZ((i % 2 ? 1 : -1) * 0.07) // 交叠的斜缠
    ring.scale(sx, 1, sz)
    part(c, ring, mat, { pos: [0, y0 + h * (i + .5), 0], blood: o.blood, wear: o.wear, uv: 8 })
    if (i % 3 === 0) part(c, new THREE.TorusGeometry(rad * 1.01, .0012, 4, 18).rotateX(Math.PI / 2).scale(sx, 1, sz), mat, { pos: [0, y0 + h * i, 0], uv: 8 }) // 缠边凸棱
    void t
  }
}
/** 锈钉：钉帽 + 弯曲钉身（从 base 沿 dir 伸出 len，末段弯折 bend） */
function nail(c: Ctx, base: THREE.Vector3, dir: THREE.Vector3, len: number, bend: number, blood = true) {
  const d = dir.clone().normalize()
  const side = new THREE.Vector3(1, 0, 0).cross(d).normalize()
  const pts = [base.clone(), base.clone().addScaledVector(d, len * .55), base.clone().addScaledVector(d, len * .85).addScaledVector(side, bend * .5), base.clone().addScaledVector(d, len).addScaledVector(side, bend)]
  const curve = new THREE.CatmullRomCurve3(pts)
  part(c, new THREE.TubeGeometry(curve, 10, .0021, 6, false), mats.rust(), { blood, uv: 30 })
  part(c, new THREE.ConeGeometry(.0021, .006, 6).translate(0, .003, 0).applyMatrix4(new THREE.Matrix4().lookAt(new THREE.Vector3(), pts[3].clone().sub(pts[2]), new THREE.Vector3(0, 1, 0))), mats.rust(), { pos: pts[3].toArray() as [number, number, number] })
}

// ---------------------------------------------------------------- 刀：落尖直刀
function buildKnife(c: Ctx, broken: boolean): Partial<MeleeRig> {
  // 刃型（YZ 平面：shape.x = Z，负为刃口侧；shape.y = Y 长度）
  const tipY = broken ? 0.122 : 0.212
  const blade = new THREE.Shape()
  blade.moveTo(.014, .052)            // 刀脊根（护手上方）
  blade.lineTo(.0145, .15)            // 平直刀脊
  if (broken) {
    // 断口：锯齿状斜断，刀脊侧残留更长
    blade.lineTo(.0145, tipY + .006); blade.lineTo(.008, tipY - .002); blade.lineTo(.003, tipY + .004); blade.lineTo(-.004, tipY - .006); blade.lineTo(-.01, tipY - .001); blade.lineTo(-.0155, tipY - .01)
  } else {
    blade.bezierCurveTo(.0145, .178, .006, .2, -.004, tipY)   // 落尖：刀脊下弧收向刀尖
    blade.bezierCurveTo(-.011, .19, -.016, .165, -.0165, .135) // 刃腹上扬
  }
  blade.lineTo(-.0165, .07)           // 直刃段
  blade.bezierCurveTo(-.0165, .062, -.012, .058, -.009, .056) // 开刃起点的小凹（choil）
  blade.lineTo(-.013, .052)
  blade.closePath()
  part(c, profile(blade, .0036, .0006), mats.steel(), { blood: true, wear: true, uv: 9 })
  // 开刃斜面：刃口侧窄带，更亮更薄，形成清晰的「磨刃线」
  const grind = new THREE.Shape()
  grind.moveTo(-.0168, .066)
  if (broken) { grind.lineTo(-.0168, tipY - .01); grind.lineTo(-.01, tipY - .002); grind.lineTo(-.009, tipY - .006) }
  else { grind.lineTo(-.0168, .135); grind.bezierCurveTo(-.016, .165, -.011, .19, -.004, tipY + .0005); grind.bezierCurveTo(-.006, .195, -.0095, .17, -.0098, .14) }
  grind.lineTo(-.0098, .068); grind.closePath()
  part(c, profile(grind, .0046, .0003), mats.edge(), { blood: true, uv: 9 })
  // 血槽（两侧各一道暗槽）
  const fullerLen = broken ? .045 : .085
  for (const s of [-1, 1]) part(c, new THREE.BoxGeometry(.0006, fullerLen, .0035), mats.dark(), { pos: [s * .0019, .065 + fullerLen / 2, .006] })
  // 护手：短十字，刃侧更长作指挡
  const guard = new THREE.Shape()
  guard.moveTo(.019, .045); guard.lineTo(.019, .052); guard.lineTo(-.024, .052); guard.bezierCurveTo(-.03, .052, -.031, .046, -.028, .043); guard.lineTo(-.02, .045); guard.closePath()
  part(c, profile(guard, .011, .0012), mats.dark(), { uv: 12 })
  // 柄：龙骨（全龙骨钢条外露一圈）+ 两片帆布胶木 + 铜钉 + 系绳孔
  const handle = new THREE.Shape()
  handle.moveTo(.0145, .045); handle.lineTo(.0155, -.02); handle.bezierCurveTo(.016, -.05, .015, -.068, .012, -.078)
  handle.lineTo(-.011, -.078); handle.bezierCurveTo(-.016, -.064, -.0175, -.05, -.015, -.036)
  handle.bezierCurveTo(-.011, -.022, -.011, -.01, -.0155, .004)   // 指槽
  handle.bezierCurveTo(-.0175, .02, -.0175, .035, -.019, .045)
  handle.closePath()
  part(c, profile(handle, .0042, .0004), mats.dark(), { uv: 10 })                 // 龙骨
  for (const s of [-1, 1]) part(c, profile(handle, .0078, .0016), mats.micarta(), { pos: [s * .006, 0, 0], wear: true, uv: 10, blood: true })
  for (const y of [.03, -.004, -.044]) part(c, new THREE.CylinderGeometry(.0028, .0028, .021, 10).rotateZ(Math.PI / 2), mats.brass(), { pos: [0, y, 0], uv: 40 })
  part(c, new THREE.TorusGeometry(.0042, .0013, 6, 14).rotateY(Math.PI / 2), mats.dark(), { pos: [0, -.068, .002] })
  for (const s of [-1, 1]) part(c, new THREE.CylinderGeometry(.0042, .0042, .0004, 12).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#050505' }), { pos: [s * .0101, -.068, .002] }) // 系绳孔透光
  // 伞绳挂坠
  const cord = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -.068, .002), new THREE.Vector3(.004, -.086, .006), new THREE.Vector3(-.003, -.104, .01), new THREE.Vector3(.002, -.118, .004)])
  part(c, new THREE.TubeGeometry(cord, 12, .0016, 6, false), M('cord', () => litMaterial({ color: '#4e5a3a', roughness: 1 })), { uv: 40 })
  return { tip: new THREE.Vector3(0, tipY - .004, -.004), offGrip: null, reach: tipY + .02 }
}

// ---------------------------------------------------------------- 撬棍：六角鹅颈撬棍
function buildCrowbar(c: Ctx, broken: boolean): Partial<MeleeRig> {
  const R = .0105
  // 主杆中心线：底端扁凿微翘向 -Z，顶端鹅颈弯向 -Z 再下勾成羊角
  const kink = broken ? .055 : 0
  const pts = [
    new THREE.Vector3(0, -.29, -.03), new THREE.Vector3(0, -.255, -.008), new THREE.Vector3(0, -.2, 0),
    new THREE.Vector3(0, .06, kink * .3), new THREE.Vector3(0, .12, kink), // 残件：中段被别弯的折角
    new THREE.Vector3(0, .32, kink * 1.4 - (broken ? .01 : 0)),
    new THREE.Vector3(0, .375, kink * 1.4 - .022), new THREE.Vector3(0, .398, kink * 1.4 - .07), new THREE.Vector3(0, .385, kink * 1.4 - .115), new THREE.Vector3(0, .35, kink * 1.4 - .142),
  ]
  const spine = new THREE.CatmullRomCurve3(pts, false, 'centripetal', .5)
  const tube = (from: number, to: number, mat: THREE.Material, blood = false, wear = false) => {
    const sub = new THREE.CatmullRomCurve3(Array.from({ length: 24 }, (_, i) => spine.getPoint(from + (to - from) * i / 23)))
    return part(c, new THREE.TubeGeometry(sub, 40, R, 6, false), mat, { blood, wear, uv: 14 })
  }
  tube(0, .1, mats.steel(), false, true)        // 底端：磨出裸钢的扁凿颈
  tube(.1, .72, mats.red(), true, true)         // 中段磨损红漆
  tube(.72, 1, mats.steel(), true, true)        // 鹅颈：撬口长期受力磨亮
  // 扁凿端：楔形压扁，沿 -Z 斜出
  const chisel = taperBox(.021, .018, .03, .0035, .05, -.012)
  chisel.rotateX(Math.PI); chisel.translate(0, -.278, -.024)
  part(c, chisel, mats.steel(), { wear: true, uv: 16 })
  // 羊角：两齿分叉（沿 X），中间 V 形拔钉口
  const end = spine.getPoint(1), tan = spine.getTangent(1)
  const claw = new THREE.Group(); claw.position.copy(end)
  claw.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan)
  c.g.add(claw)
  for (const s of [-1, 1]) {
    if (broken && s > 0) { // 残件：一齿崩断，只剩断茬
      part(c, taperBox(.0095, .016, .009, .012, .012, 0, s * .004), mats.steel(), { pos: [s * .0055, 0, 0], parent: claw, wear: true, uv: 20 })
      continue
    }
    const tine = taperBox(.0095, .017, .0045, .003, .045, .006, s * .004)
    part(c, tine, mats.steel(), { pos: [s * .0055, 0, 0], parent: claw, blood: true, wear: true, uv: 20 })
  }
  // 杆身铸造标记与胶带握把（流浪者缠的电工胶带，修理时会再缠一层）
  wrapBand(c, -.12, .02, R * 1.28, mats.tape(), 6, 1, 1, { wear: true, blood: true })
  return { tip: end.clone().addScaledVector(tan, .04), offGrip: new THREE.Vector3(0, .17, kink * .9), reach: .45 }
}

// ---------------------------------------------------------------- 管钳：14 英寸
function buildWrench(c: Ctx, broken: boolean): Partial<MeleeRig> {
  // 工字柄：外轮廓挤出 + 两侧凹槽暗板（假工字截面）
  const h = new THREE.Shape()
  h.moveTo(.012, -.17); h.bezierCurveTo(.017, -.17, .018, -.162, .017, -.155)
  h.lineTo(.0135, .085); h.lineTo(.018, .098); h.lineTo(-.018, .098); h.lineTo(-.0135, .085)
  h.lineTo(-.017, -.155); h.bezierCurveTo(-.018, -.162, -.017, -.17, -.012, -.17); h.closePath()
  const hole = new THREE.Path(); hole.absarc(0, -.152, .0055, 0, Math.PI * 2, true); h.holes.push(hole) // 挂孔
  part(c, profile(h, .019, .0018), mats.wrenchRed(), { wear: true, blood: true, uv: 9 })
  for (const s of [-1, 1]) {
    const web = new THREE.Shape()
    web.moveTo(.008, -.138); web.lineTo(.0075, .07); web.lineTo(-.0075, .07); web.lineTo(-.008, -.138); web.closePath()
    part(c, profile(web, .002, .0006), mats.dark(), { pos: [s * .0094, 0, 0], uv: 9 })
  }
  // 钳体套筒（固定钳口所在铸件）：y .095..0.16
  const housing = new THREE.Shape()
  housing.moveTo(.02, .095); housing.lineTo(.021, .155); housing.lineTo(-.006, .162); housing.lineTo(-.04, .158) // 下钳口向 -Z 伸出
  housing.lineTo(-.044, .148); housing.lineTo(-.03, .132); housing.lineTo(-.016, .1); housing.closePath()
  const win = new THREE.Path(); win.moveTo(.012, .103); win.lineTo(.012, .13); win.lineTo(-.008, .13); win.lineTo(-.008, .103); win.closePath(); housing.holes.push(win) // 调节螺母窗
  part(c, profile(housing, .026, .002), mats.wrenchRed(), { wear: true, blood: true, uv: 12 })
  // 下钳口齿（固定钳口顶面，齿尖朝 +Y）
  const teeth = (y: number, z0: number, z1: number, up: boolean, parent?: THREE.Object3D) => {
    const n = 7
    for (let i = 0; i < n; i++) {
      const z = z0 + (z1 - z0) * (i + .5) / n, w = Math.abs(z1 - z0) / n
      const s = new THREE.Shape(); s.moveTo(z - w / 2, 0); s.lineTo(z + w / 2, 0); s.lineTo(z + w * .2, up ? .0042 : -.0042); s.closePath()
      part(c, profile(s, .022, 0), mats.dark(), { pos: [0, y, 0], blood: true, uv: 40, parent })
    }
  }
  teeth(.158, -.002, -.042, true)
  // 调节螺母：滚花圆柱（轴向 Y），嵌在窗里
  part(c, new THREE.CylinderGeometry(.0105, .0105, .024, 22), mats.knurl(), { pos: [0, .1165, .002], keepUV: true, wear: broken })
  // 钩爪：螺杆（穿过套筒）+ 顶部 L 形上钳口
  if (!broken) {
    part(c, new THREE.CylinderGeometry(.0058, .0058, .09, 10), mats.knurl(), { pos: [0, .138, .006], keepUV: true })
    const hook = new THREE.Shape()
    hook.moveTo(.013, .182); hook.lineTo(.013, .21); hook.bezierCurveTo(.012, .218, .006, .221, -.004, .221)
    hook.lineTo(-.046, .216); hook.lineTo(-.048, .205); hook.lineTo(-.006, .2); hook.lineTo(-.002, .182); hook.closePath()
    part(c, profile(hook, .02, .0018), mats.steel(), { blood: true, wear: true, uv: 12, pos: [0, -.013, 0] })
    const up = new THREE.Group(); up.position.y = -.013; c.g.add(up)
    teeth(.2, -.004, -.046, false, up)
  } else {
    // 残件：钩爪崩飞，只剩一截断螺杆，螺母裂开
    part(c, new THREE.CylinderGeometry(.0058, .0058, .05, 10), mats.knurl(), { pos: [0, .124, .006], keepUV: true })
    part(c, new THREE.CylinderGeometry(.006, .0045, .006, 10), mats.dark(), { pos: [0, .152, .006] })
    part(c, new THREE.BoxGeometry(.024, .026, .0012), new THREE.MeshBasicMaterial({ color: '#0a0a0a' }), { pos: [0, .1165, -.0095], rot: [0, 0, .4] }) // 螺母裂缝
  }
  // 板簧盒（套筒侧面的小方盒）
  part(c, new THREE.BoxGeometry(.008, .028, .012), mats.dark(), { pos: [.016, .125, .012] })
  return { tip: new THREE.Vector3(0, broken ? .16 : .205, -.04), offGrip: null, reach: broken ? .17 : .23 }
}

// ---------------------------------------------------------------- 木板：2×4 松木 + 末端锈钉
function buildTimber(c: Ctx, broken: boolean): Partial<MeleeRig> {
  const W = .089, T = .038, y0 = -.2, y1 = broken ? .3 : .64
  // 圆角矩形截面沿 Y 挤出（profile 的挤出轴是 X，所以这里直接用 Extrude 再旋到 Y）
  const sec = new THREE.Shape()
  const rr = .004
  sec.moveTo(-T / 2 + rr, -W / 2); sec.lineTo(T / 2 - rr, -W / 2); sec.quadraticCurveTo(T / 2, -W / 2, T / 2, -W / 2 + rr)
  sec.lineTo(T / 2, W / 2 - rr); sec.quadraticCurveTo(T / 2, W / 2, T / 2 - rr, W / 2); sec.lineTo(-T / 2 + rr, W / 2)
  sec.quadraticCurveTo(-T / 2, W / 2, -T / 2, W / 2 - rr); sec.lineTo(-T / 2, -W / 2 + rr); sec.quadraticCurveTo(-T / 2, -W / 2, -T / 2 + rr, -W / 2)
  const len = y1 - y0
  const body = new THREE.ExtrudeGeometry(sec, { depth: len, bevelEnabled: false, steps: 12, curveSegments: 2 })
  body.rotateX(-Math.PI / 2) // 挤出轴 Z → +Y；截面 x→X(厚)，y→-Z(宽)
  body.translate(0, y0, 0)
  jitter(body, .0016, 7)
  // 板子微翘（顺长轴轻弯）
  const p = body.attributes.position
  for (let i = 0; i < p.count; i++) { const t = (p.getY(i) - y0) / len; p.setZ(i, p.getZ(i) + Math.sin(t * Math.PI) * .006) }
  body.computeVertexNormals()
  // 两套材质：端面年轮 / 侧面木纹（Extrude 的 groups 0=端面 1=侧面）
  const g0 = body.index ? body.toNonIndexed() : body
  const uvG = boxUV(g0, 3.2)
  uvG.clearGroups()
  // boxUV 打平后 groups 丢失：按法线重新分组——|ny| 大的是端面
  const n = uvG.attributes.normal, pos = uvG.attributes.position
  const idxSide: number[] = [], idxEnd: number[] = []
  for (let i = 0; i < pos.count; i += 3) (Math.abs(n.getY(i)) > .9 ? idxEnd : idxSide).push(i, i + 1, i + 2)
  const reorder = (attr: THREE.BufferAttribute, order: number[]) => { const a = new Float32Array(order.length * attr.itemSize); order.forEach((s, k) => { for (let j = 0; j < attr.itemSize; j++) a[k * attr.itemSize + j] = attr.array[s * attr.itemSize + j] }); return new THREE.BufferAttribute(a, attr.itemSize) }
  const order = [...idxSide, ...idxEnd]
  const fin = new THREE.BufferGeometry()
  for (const k of ['position', 'normal', 'uv']) fin.setAttribute(k, reorder(uvG.attributes[k] as THREE.BufferAttribute, order))
  fin.addGroup(0, idxSide.length, 0); fin.addGroup(idxSide.length, idxEnd.length, 1)
  part(c, fin, [mats.wood(), mats.woodEnd()], { keepUV: true, blood: true, wear: true })
  if (broken) {
    // 断口：参差木刺（新鲜浅色），一侧长一侧短
    const r = c.r
    for (let i = 0; i < 16; i++) {
      const x = (r() - .5) * T * .85, z = (r() - .5) * W * .9
      const L = .02 + r() * .07 * (z < 0 ? 1.4 : .6)
      part(c, taperBox(.004 + r() * .006, .006 + r() * .012, .0008, .001, L, (r() - .5) * .01, (r() - .5) * .006), mats.woodRaw(), { pos: [x, y1 - .002, z], uv: 6 })
    }
    // 顺纹长裂
    part(c, new THREE.BoxGeometry(.0012, .2, .003), new THREE.MeshBasicMaterial({ color: '#1a120a' }), { pos: [T / 2 + .0002, y1 - .12, -.01] })
  }
  // 锈钉：打击端 -Z 面伸出三根（残件只剩一根），一根被敲弯
  const tipY = y1 - .05
  const nails: [number, number, number, number][] = broken ? [[.004, y1 - .04, .035, .012]] : [[.006, tipY, .05, .002], [-.008, tipY - .07, .045, .006], [.002, tipY - .14, .04, .016]]
  for (const [x, y, L, bend] of nails) nail(c, new THREE.Vector3(x, y, -W / 2 + .004), new THREE.Vector3(0, .12, -1), L, bend)
  // 背面露出的钉帽
  for (const [x, y] of nails) part(c, new THREE.CylinderGeometry(.0045, .0045, .0015, 10).rotateX(Math.PI / 2), mats.rust(), { pos: [x, y, W / 2 + .0006] })
  // 握把：破布缠两圈 + 一道麻绳
  wrapBand(c, -.17, -.02, .052, mats.rag(), 5, T / .104 + .02, W / .104 + .02, { wear: true, blood: true, seg: 10 })
  return { tip: new THREE.Vector3(0, tipY, -W / 2 - .04), offGrip: new THREE.Vector3(0, .22, 0), reach: y1 }
}

// ---------------------------------------------------------------- 消防斧：玻纤长柄 + 尖镐
function buildAxe(c: Ctx, broken: boolean): Partial<MeleeRig> {
  const y0 = -.13, yH = .66 // 柄底 / 斧眼中心
  // 椭圆截面长柄，向斧头端略收细
  const handle = new THREE.CylinderGeometry(.0145, .018, yH + .07 - y0, 18, 8)
  handle.scale(1, 1, 1.38); handle.translate(0, (yH + .07 + y0) / 2, 0)
  part(c, handle, mats.fiber(), { wear: true, blood: true, uv: 6 })
  // 橡胶握把：分段棱纹
  for (let i = 0; i < 11; i++) {
    const y = y0 + .012 + i * .0165
    part(c, new THREE.CylinderGeometry(.0205, .0205, .012, 18).scale(1, 1, 1.3), mats.rubber(), { pos: [0, y, 0], uv: 10, wear: true })
    part(c, new THREE.TorusGeometry(.0198, .0024, 6, 20).rotateX(Math.PI / 2).scale(1, 1, 1.3), mats.rubber(), { pos: [0, y + .0075, 0], uv: 10 })
  }
  part(c, new THREE.CylinderGeometry(.022, .024, .02, 18).scale(1, 1, 1.3), mats.rubber(), { pos: [0, y0 - .002, 0], uv: 10 }) // 尾帽
  if (broken) { // 残件：柄身纵裂 + 两圈应急胶带
    part(c, new THREE.BoxGeometry(.0015, .22, .006), new THREE.MeshBasicMaterial({ color: '#2a1802' }), { pos: [.0148, .38, 0] })
    wrapBand(c, .34, .42, .0205, mats.tape(), 3, 1, 1.38, { seg: 6 })
  }
  // 斧头：侧面轮廓（YZ），刃向 -Z，后接尖镐向 +Z
  const head = new THREE.Group(); head.position.y = yH; c.g.add(head)
  const cheek = new THREE.Shape() // 斧颊（厚）：包住斧眼，向刃口方向收窄
  cheek.moveTo(.03, -.04); cheek.lineTo(.03, .045); cheek.lineTo(-.025, .042); cheek.lineTo(-.06, .05); cheek.lineTo(-.06, -.058); cheek.lineTo(-.025, -.045); cheek.closePath()
  part(c, profile(cheek, .034, .003), mats.redHead(), { parent: head, blood: true, wear: true, uv: 12 })
  // 刃口曲线（自上而下）；残件在两处崩口内凹
  const E: [number, number][] = [[-.142, .072], [-.151, .045], [-.155, .012], [-.154, -.022], [-.148, -.055], [-.137, -.082]]
  const edgeAt = (i: number): [number, number] => { const [z, y] = E[i]; return broken && (i === 1 || i === 3) ? [z + .007, y] : [z, y] }
  const inset = .02 // 磨刃带宽度
  // 刃身（中厚）：斧颊外侧到磨刃带内沿，上缘平直、下缘外撇成短胡
  const bit = new THREE.Shape()
  bit.moveTo(-.055, .048); bit.bezierCurveTo(-.085, .055, -.11, .065, -.142 + inset, .07)
  for (let i = 0; i < E.length; i++) { const [z, y] = edgeAt(i); bit.lineTo(z + inset, y * .96) }
  bit.bezierCurveTo(-.105, -.075, -.08, -.064, -.055, -.056); bit.closePath()
  part(c, profile(bit, .018, .002), mats.redHead(), { parent: head, blood: true, wear: true, uv: 12 })
  // 磨刃带（薄、裸钢、磨亮）：与刃身台阶相接，侧面可见清晰的开刃线
  const edge = new THREE.Shape()
  edge.moveTo(-.142 + inset + .002, .07)
  for (let i = 0; i < E.length; i++) { const [z, y] = edgeAt(i); edge.lineTo(z, y) }
  for (let i = E.length - 1; i >= 0; i--) { const [z, y] = edgeAt(i); edge.lineTo(z + inset + .002, y * .96) }
  edge.closePath()
  part(c, profile(edge, .0085, .0012), mats.edge(), { parent: head, blood: true, uv: 12 })
  if (broken) for (const i of [1, 3]) { const [z, y] = edgeAt(i); part(c, new THREE.BoxGeometry(.009, .011, .006), mats.dark(), { parent: head, pos: [0, y, z - .002], rot: [.6, 0, 0] }) } // 卷刃崩口内的暗面
  // 尖镐：沿 +Z 收尖并略下弯
  const pick = taperBox(.028, .032, .004, .006, .13, 0)
  pick.rotateX(Math.PI / 2) // +Y → +Z
  const pp = pick.attributes.position
  for (let i = 0; i < pp.count; i++) { const t = pp.getZ(i) / .13; pp.setY(i, pp.getY(i) - t * t * .026) }
  pick.computeVertexNormals()
  part(c, pick, mats.redHead(), { parent: head, pos: [0, 0, .028], blood: true, wear: true, uv: 12 })
  part(c, taperBox(.006, .008, .001, .001, .022).rotateX(Math.PI / 2), mats.steel(), { parent: head, pos: [0, -.026, .152] }) // 镐尖裸钢
  // 斧眼楔 + 顶部铆钉
  part(c, new THREE.BoxGeometry(.02, .006, .05), mats.dark(), { parent: head, pos: [0, .052, 0] })
  part(c, new THREE.CylinderGeometry(.0042, .0042, .036, 10).rotateZ(Math.PI / 2), mats.steel(), { parent: head, pos: [0, -.02, .004] })
  return { tip: new THREE.Vector3(0, yH, -.155), offGrip: new THREE.Vector3(0, .38, 0), reach: yH + .1 }
}

// ---------------------------------------------------------------- 入口
export function buildMeleeMesh(type: MeleeType, o: MeleeBuildOpts = {}): THREE.Group {
  const previous = matCache; matCache = new Map()
  try {
  const state = o.state ?? 'intact'
  const g = new THREE.Group(); g.name = `melee:${type}:${state}`
  const c: Ctx = { g, blood: [], wear: [], bloodMat: overlayMat('blood'), wearMat: overlayMat('wear'), r: rng(o.seed ?? 11) }
  const broken = state === 'broken'
  const r = type === 'knife' ? buildKnife(c, broken) : type === 'crowbar' ? buildCrowbar(c, broken) : type === 'wrench' ? buildWrench(c, broken) : type === 'timber' ? buildTimber(c, broken) : buildAxe(c, broken)
  const rig: MeleeRig = { type, state, blood: c.blood, wear: c.wear, tip: r.tip!, offGrip: r.offGrip ?? null, reach: r.reach! }
  g.userData.meleeRig = rig
  bakeBloodMask(g, rig)
  batchMelee(g, rig)
  g.traverse((m) => { if ((m as THREE.Mesh).isMesh) { m.castShadow = true } })
  setMeleeWear(g, { blood: 0, worn: broken ? 1 : 0 })
  return g
  } finally { matCache = previous }
}

/** Rigid weapon parts merge by material; overlays retain their independent runtime controls. */
function batchMelee(g: THREE.Group, rig: MeleeRig) {
  g.updateMatrixWorld(true)
  const inverse = g.matrixWorld.clone().invert(), transform = new THREE.Matrix4()
  const original = new Set<THREE.BufferGeometry>()
  const batches = new Map<THREE.Material, {geos:THREE.BufferGeometry[]; overlay?:string}>()
  g.traverse(o => {
    const mesh = o as THREE.Mesh
    if(!mesh.isMesh || Array.isArray(mesh.material)) return
    original.add(mesh.geometry)
    const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
    transform.multiplyMatrices(inverse,mesh.matrixWorld); geo.applyMatrix4(transform)
    const group = batches.get(mesh.material) ?? {geos:[] as THREE.BufferGeometry[],overlay:mesh.userData.overlay}
    group.geos.push(geo); batches.set(mesh.material,group)
  })
  g.clear(); rig.blood.length=0; rig.wear.length=0
  for(const [material,{geos,overlay}] of batches) {
    const merged = mergeGeometries(geos,false)
    for(const geo of merged?[merged]:geos) {
      const mesh=new THREE.Mesh(geo,material)
      if(overlay){mesh.userData.overlay=overlay; mesh.renderOrder=overlay==='blood'?2:1; (overlay==='blood'?rig.blood:rig.wear).push(mesh)}
      g.add(mesh)
    }
    if(merged)for(const geo of geos)geo.dispose()
  }
  for(const geo of original)geo.dispose()
}

/** Generate one shared procedural surface per step, behind the existing loading/preparation gates. */
const surfaceJobs = [steelTex,edgeTex,darkSteelTex,()=>paintTex('red','#9b2b20','#c94a36',30),()=>paintTex('redhead','#b3271d','#e0503a',16),()=>paintTex('wrench','#a8231b','#d84634',34),knurlTex,micartaTex,brassTex,tapeTex,()=>woodSide('a'),woodEnd,fiberglassTex,rubberTex,ragTex,bloodTex,wearTex]
let resourcesDone=false
export const meleeResourcesReady=()=>resourcesDone
export function* prepareMeleeJob():Generator<void,void>{for(const make of surfaceJobs){make();yield}resourcesDone=true}

/** 血污只集中在打击端：按武器根坐标的 Y 烘焙顶点 alpha（打击端 1 → 握把 0.12，手汗血印） */
const BLOOD_BAND: Record<MeleeType, [number, number]> = { knife: [.03, .11], crowbar: [.12, .36], wrench: [.04, .16], timber: [.15, .5], axe: [.35, .62] }
function bakeBloodMask(g: THREE.Group, rig: MeleeRig) {
  g.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), m = new THREE.Matrix4(), v = new THREE.Vector3()
  const [y0, y1] = BLOOD_BAND[rig.type]
  for (const b of rig.blood) {
    const geo = b.geometry.clone(); b.geometry = geo
    m.multiplyMatrices(inv, b.matrixWorld)
    const p = geo.attributes.position, col = new Float32Array(p.count * 4)
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m)
      const t = THREE.MathUtils.smoothstep(v.y, y0, y1)
      col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = 1; col[i * 4 + 3] = .12 + .88 * t
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4))
  }
  const bm = rig.blood[0]?.material as THREE.MeshLambertMaterial | undefined
  if (bm) { bm.vertexColors = true; bm.needsUpdate = true }
}

/**
 * 运行时调整外观：blood 0..1（0 干净，.35 溅了几滴，.7 糊满，1 滴血）；
 * worn 0..1（耐久 ≤25% 时由 0 渐变到 1；残件恒为 1）。
 */
export function setMeleeWear(g: THREE.Object3D, s: { blood?: number; worn?: number }) {
  const rig = g.userData.meleeRig as MeleeRig | undefined
  if (!rig) return
  if (s.blood !== undefined) {
    const m = rig.blood[0]?.material as THREE.MeshLambertMaterial | undefined
    if (m) { m.opacity = Math.min(1, .35 + s.blood * .75); m.alphaTest = s.blood > 0 ? Math.max(.03, .4 - s.blood * .38) : 0; m.needsUpdate = true }
    for (const b of rig.blood) b.visible = s.blood > 0.01
  }
  if (s.worn !== undefined) {
    const m = rig.wear[0]?.material as THREE.MeshLambertMaterial | undefined
    if (m) { m.opacity = Math.min(1, s.worn); m.alphaTest = s.worn > 0 ? Math.max(.02, .5 - s.worn * .45) : 0; m.needsUpdate = true }
    for (const w of rig.wear) w.visible = s.worn > 0.01
  }
}

/** 地面掉落版：长轴转到 +X 平躺（打击面朝 -Z 侧放），几何中心归零 */
export function buildMeleeGroundMesh(type: MeleeType, o: MeleeBuildOpts = {}): THREE.Group {
  const inner = buildMeleeMesh(type, o)
  inner.rotation.set(0, 0, -Math.PI / 2) // +Y → +X；厚度轴 X → 竖直，武器平躺
  const box = new THREE.Box3().setFromObject(inner)
  const ctr = box.getCenter(new THREE.Vector3())
  inner.position.sub(ctr); inner.position.y += (box.max.y - box.min.y) / 2
  const g = new THREE.Group(); g.add(inner)
  g.userData.meleeRig = inner.userData.meleeRig
  return g
}

/** 三角面数（验收预算） */
export function meleeBudget(g: THREE.Object3D) {
  let tris = 0, meshes = 0
  g.traverse((m) => { const mm = m as THREE.Mesh; if (mm.isMesh && !mm.userData.overlay) { meshes++; const geo = mm.geometry; tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3 } })
  return { tris: Math.round(tris), meshes }
}
