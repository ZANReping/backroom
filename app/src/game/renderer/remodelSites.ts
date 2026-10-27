// Level 0 施工点的可见模型：施工场所的门 + 条纹护栏 + 锥桶 + 「施工中」立牌 + 施工灯。
// 全部为程序几何 + Canvas 贴图（无外部素材）。按施工点 id 缓存，每帧按无限窗口原点平移；
// 改造渐变期间路障从地面升起（scale），门从墙面「显影」（透明度）。
import * as THREE from 'three'
import { afterSceneCompile } from './sceneWarmup'
import type { Engine } from '../engine'
import { REMODEL_TUNING, remodelProgress, type RemodelProp, type RemodelSite } from '../world/remodelSites'

const texCache = new Map<string, THREE.Texture>()
function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  let t = texCache.get(key)
  if (t) return t
  const c = document.createElement('canvas'); c.width = w; c.height = h
  draw(c.getContext('2d')!)
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  texCache.set(key, t)
  return t
}
const stripeTex = () => canvasTex('stripe', 256, 32, (g) => {
  g.fillStyle = '#f2f0ea'; g.fillRect(0, 0, 256, 32)
  g.fillStyle = '#e2561e'
  for (let x = -32; x < 288; x += 40) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 20, 32); g.lineTo(x + 40, 0); g.lineTo(x + 20, 0); g.fill() }
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.strokeRect(0.5, 0.5, 255, 31)
})
const hazardTex = () => canvasTex('hazard', 256, 32, (g) => {
  g.fillStyle = '#e8b822'; g.fillRect(0, 0, 256, 32); g.fillStyle = '#1c1b18'
  for (let x = -32; x < 288; x += 32) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 32); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.fill() }
})
const signTex = () => canvasTex('sign', 256, 320, (g) => {
  g.fillStyle = '#efc419'; g.fillRect(0, 0, 256, 320)
  g.strokeStyle = '#1c1b18'; g.lineWidth = 10; g.strokeRect(8, 8, 240, 304)
  g.fillStyle = '#1c1b18'; g.beginPath(); g.moveTo(128, 34); g.lineTo(206, 160); g.lineTo(50, 160); g.closePath(); g.fill()
  g.fillStyle = '#efc419'; g.beginPath(); g.moveTo(128, 62); g.lineTo(184, 148); g.lineTo(72, 148); g.closePath(); g.fill()
  g.fillStyle = '#1c1b18'; g.fillRect(122, 84, 12, 38); g.fillRect(122, 130, 12, 10)
  g.font = 'bold 54px "Noto Sans CJK SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.fillText('施工中', 128, 222)
  g.font = 'bold 20px sans-serif'; g.fillText('UNDER CONSTRUCTION', 128, 254)
  g.font = '18px "Noto Sans CJK SC",sans-serif'; g.fillText('后室装修公司', 128, 288)
})
const doorTex = () => canvasTex('door', 256, 512, (g) => {
  // 临时施工门：灰蓝钢板门，竖向压纹，门上贴「施工重地 闲人免进」告示，下半部有擦痕
  const grd = g.createLinearGradient(0, 0, 256, 0); grd.addColorStop(0, '#6f7c84'); grd.addColorStop(.5, '#7e8b93'); grd.addColorStop(1, '#6b7880')
  g.fillStyle = grd; g.fillRect(0, 0, 256, 512)
  g.fillStyle = 'rgba(0,0,0,.12)'; for (const x of [40, 88, 168, 216]) g.fillRect(x, 24, 4, 464)
  g.fillStyle = 'rgba(255,255,255,.08)'; for (const x of [44, 92, 172, 220]) g.fillRect(x, 24, 2, 464)
  // 告示：字号按框内宽留 ≥14 px 边距（第一阶段 36 px 四字正好顶到红框）
  g.fillStyle = '#f4f2ea'; g.fillRect(46, 106, 164, 128); g.strokeStyle = '#c4261d'; g.lineWidth = 6; g.strokeRect(49, 109, 158, 122)
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillStyle = '#c4261d'; g.font = 'bold 30px "Noto Sans CJK SC","Microsoft YaHei",sans-serif'; g.fillText('施工重地', 128, 151)
  g.fillStyle = '#1c1b18'; g.font = 'bold 25px "Noto Sans CJK SC",sans-serif'; g.fillText('闲人免进', 128, 194)
  g.textBaseline = 'alphabetic'
  g.fillStyle = '#efc419'; g.fillRect(0, 300, 256, 22); g.fillStyle = '#1c1b18'; for (let x = -20; x < 276; x += 28) { g.beginPath(); g.moveTo(x, 322); g.lineTo(x + 14, 322); g.lineTo(x + 28, 300); g.lineTo(x + 14, 300); g.fill() }
  g.strokeStyle = 'rgba(40,40,40,.25)'; g.lineWidth = 1; for (let i = 0; i < 40; i++) { const x = (i * 97) % 256, y = 360 + (i * 53) % 140; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 18, y + 3); g.stroke() }
})

const mats = new Map<string, THREE.Material>()
function mat(key: string, make: () => THREE.Material) { let m = mats.get(key); if (!m) { m = make(); mats.set(key, m) } return m }
// 场景主要靠烘焙自发光照明：模型带少量自发光，避免在冷白改造区里显得过暗
const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, emissive: color, emissiveIntensity: 0.22, ...extra })

function box(g: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, ry = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y, z); mesh.rotation.y = ry; mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh
}

/** 施工门（局部：门面朝 +z，贴在 z=0 墙面上）。 */
export function buildRemodelDoor(): THREE.Group {
  const g = new THREE.Group(); g.name = 'remodel-door'
  const W = REMODEL_TUNING.doorW, H = REMODEL_TUNING.doorH
  const frame = mat('frame', () => std('#c9cbc8', { roughness: 0.45, metalness: 0.4, emissiveIntensity: 0.15 }))
  const leaf = mat('leaf', () => std('#ffffff', { map: doorTex(), roughness: 0.55, metalness: 0.25, emissiveMap: doorTex(), emissiveIntensity: 0.28 }))
  const dark = mat('gap', () => new THREE.MeshBasicMaterial({ color: '#0b0b0a' }))
  const tape = mat('tape', () => std('#ffffff', { map: hazardTex(), emissiveMap: hazardTex(), emissiveIntensity: 0.3 }))
  const handle = mat('handle', () => std('#d8d8d2', { metalness: 0.8, roughness: 0.3, emissiveIntensity: 0.1 }))
  box(g, W + 0.02, H + 0.02, 0.012, 0, (H + 0.02) / 2, 0.006, dark) // 门洞阴影缝
  box(g, 0.07, H + 0.07, 0.07, -W / 2 - 0.035, (H + 0.07) / 2, 0.03, frame)
  box(g, 0.07, H + 0.07, 0.07, W / 2 + 0.035, (H + 0.07) / 2, 0.03, frame)
  box(g, W + 0.14, 0.07, 0.07, 0, H + 0.035, 0.03, frame)
  const leafMesh = box(g, W - 0.02, H - 0.02, 0.04, 0, H / 2, 0.025, leaf); leafMesh.name = 'remodel-door-leaf'
  box(g, 0.035, 0.18, 0.04, W / 2 - 0.12, 1.02, 0.065, handle)
  box(g, 0.12, 0.03, 0.05, W / 2 - 0.17, 1.02, 0.08, handle)
  // 门框上方与两侧的黄黑警示胶带（斜贴）
  const t1 = box(g, W + 0.6, 0.06, 0.004, 0, H + 0.2, 0.004, tape); t1.rotation.z = 0.06
  const t2 = box(g, 0.9, 0.06, 0.004, -W / 2 - 0.42, 1.55, 0.004, tape); t2.rotation.z = -0.5
  const t3 = box(g, 0.9, 0.06, 0.004, W / 2 + 0.42, 0.75, 0.004, tape); t3.rotation.z = 0.45
  // 门头小型「出口」样式指示牌（暗绿底白字，Level 0.2 的冷白感）
  const plate = mat('plate', () => std('#2f5d4a', { emissive: '#3c8a64', emissiveIntensity: 0.6 }))
  box(g, 0.36, 0.12, 0.03, 0, H + 0.36, 0.02, plate)
  return g
}

function buildProp(p: RemodelProp): THREE.Group {
  const g = new THREE.Group(); g.name = 'remodel-' + p.kind
  if (p.kind === 'barricade') {
    const board = mat('board', () => std('#ffffff', { map: stripeTex(), emissiveMap: stripeTex(), emissiveIntensity: 0.25, roughness: 0.6 }))
    const leg = mat('leg', () => std('#d9d7cf', { roughness: 0.5 }))
    const lamp = mat('blink', () => new THREE.MeshBasicMaterial({ color: '#ffb22e' }))
    for (const y of [0.92, 0.6]) box(g, 1.24, 0.16, 0.025, 0, y, 0, board)
    for (const sx of [-0.52, 0.52]) for (const sz of [-1, 1]) { const l = box(g, 0.05, 1.02, 0.045, sx, 0.5, sz * 0.09, leg); l.rotation.x = sz * 0.17 }
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.07, 12), lamp); b.position.set(0.52, 1.06, 0); b.name = 'remodel-blink'; g.add(b)
  } else if (p.kind === 'cone') {
    const orange = mat('cone', () => std('#e8541b', { roughness: 0.55, emissiveIntensity: 0.3 }))
    const white = mat('band', () => std('#f4f4f0', { roughness: 0.3, emissiveIntensity: 0.35 }))
    const base = mat('coneBase', () => std('#25231f', { roughness: 0.9, emissiveIntensity: 0.05 }))
    box(g, 0.36, 0.035, 0.36, 0, 0.018, 0, base)
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.66, 18, 1, true), orange); c.position.y = 0.36; c.castShadow = true; g.add(c)
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.098, 0.11, 18, 1, true), white); band.position.y = 0.43; g.add(band)
  } else if (p.kind === 'sign') {
    const face = mat('signFace', () => std('#ffffff', { map: signTex(), emissiveMap: signTex(), emissiveIntensity: 0.3, roughness: 0.5 }))
    for (const s of [-1, 1]) { const panel = box(g, 0.56, 0.72, 0.02, 0, 0.5, s * 0.12, face, s > 0 ? 0 : Math.PI); panel.rotation.x = s * 0.24 }
    const hinge = mat('leg', () => std('#d9d7cf'))
    box(g, 0.58, 0.04, 0.05, 0, 0.88, 0, hinge)
  } else {
    // 施工灯：三脚架 + 冷白方形泛光灯（自发光；不另加实时光源，避免挤占光源池）
    const metal = mat('lampLeg', () => std('#2c2c2a', { metalness: 0.6, roughness: 0.4, emissiveIntensity: 0.05 }))
    const head = mat('lampHead', () => std('#e6c21a', { metalness: 0.3, roughness: 0.4 }))
    const glass = mat('lampGlass', () => new THREE.MeshBasicMaterial({ color: '#f2f8ff' }))
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2, l = box(g, 0.025, 1.2, 0.025, Math.cos(a) * 0.16, 0.58, Math.sin(a) * 0.16, metal); l.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25) }
    box(g, 0.03, 0.45, 0.03, 0, 1.35, 0, metal)
    box(g, 0.34, 0.26, 0.12, 0, 1.62, 0, head)
    box(g, 0.28, 0.2, 0.01, 0, 1.62, 0.062, glass)
  }
  return g
}

interface SiteView { root: THREE.Group; door: THREE.Group; props: { g: THREE.Group; p: RemodelProp; delay: number }[]; doorMats: THREE.Material[] }
const views = new Map<string, SiteView>()
let parent: THREE.Object3D | null = null

function buildSite(s: RemodelSite): SiteView {
  const root = new THREE.Group(); root.name = 'remodel-site:' + s.id
  const door = buildRemodelDoor()
  door.position.set(s.door.x, 0, s.door.y); door.rotation.y = s.door.yaw
  root.add(door)
  const props = s.props.map((p, i) => { const g = buildProp(p); g.position.set(p.x, 0, p.y); g.rotation.y = p.yaw; root.add(g); return { g, p, delay: 0.15 + i * 0.08 } })
  // 门显影：克隆材质做透明渐入（渐变完成后恢复不透明）
  const doorMats: THREE.Material[] = []
  door.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { const c = (m.material as THREE.Material).clone(); c.transparent = true; m.material = c; doorMats.push(c) } })
  return { root, door, props, doorMats }
}

export function clearRemodelSites(scene:THREE.Object3D){if(parent!==scene)return;for(const v of views.values())retireSite(v);views.clear();parent=null}
function retireSite(v:SiteView){v.root.removeFromParent();afterSceneCompile(v.root,()=>{const geos=new Set<THREE.BufferGeometry>();v.root.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)geos.add(m.geometry)});for(const g of geos)g.dispose();for(const m of v.doorMats)m.dispose()})}
/** 每帧同步（renderer 调用）：只在 Level 0 显示；无限窗口平移通过 root.position 抵消。 */
export function syncRemodelSites(scene: THREE.Object3D, eng: Engine, time: number) {
  const inf = eng.map?.inf, sites = eng.player.remodel?.sites ?? []
  const show = eng.player.level === 0 && !!inf
  if (parent !== scene) { if(parent)clearRemodelSites(parent); parent = scene }
  const want = new Set(show ? sites.map((s) => s.id) : [])
  for (const [id, v] of views) if (!want.has(id)) { retireSite(v); views.delete(id) }
  if (!show || !inf) return
  for (const s of sites) {
    // 只绘制窗口附近的施工点（160 m 窗口）
    if (Math.abs(s.x - inf.ox - eng.player.x) > 110 || Math.abs(s.y - inf.oy - eng.player.y) > 110) { const v = views.get(s.id); if (v) v.root.visible = false; continue }
    let v = views.get(s.id)
    if (!v) { v = buildSite(s); views.set(s.id, v); scene.add(v.root) }
    v.root.visible = true
    v.root.position.set(-inf.ox, 0, -inf.oy)
    const k = remodelProgress(s, eng.time)
    for (const m of v.doorMats) { m.opacity = Math.min(1, k * 1.4); m.transparent = k < 0.999; m.depthWrite = k > 0.5 }
    for (const pr of v.props) { const t = Math.min(1, Math.max(0, (k - pr.delay) / 0.35)); pr.g.scale.setScalar(Math.max(0.001, t)); pr.g.visible = t > 0.01 }
    // 护栏顶上的琥珀警示灯慢闪
    v.root.traverse((o) => { if (o.name === 'remodel-blink') ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(Math.sin(time * 3.4) > 0 ? '#ffb22e' : '#5a3a10') })
  }
}
