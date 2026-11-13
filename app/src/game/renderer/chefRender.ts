import {prepareChefGeometry,chefGeometryReady} from './chefMesh'
// [chef] 厨师（Entity 800）阶段 3：渲染接入。
//   · buildChefEntityMesh：实体根组（正面 +X；外层 buildChef 组 rotation.y = π/2 / facesZ）= LOD2（约 6k，立即建）+ LOD1（约 1.9 万，22 m 内才建）+ LOD0（约 6 万，11 m 内才建）；
//     < 8 m 用 LOD0、< 17.5 m 用 LOD1、更远 LOD2（边界 ±1 m 内保持当前档，防抖）。GPU 蒙皮；?cpu=1 时 qaCpuSkin 全局替身接管。
//   · animateChefEntity：按 chefAI 的 e.ck.clip / seq 切片段（混合 = AI 给的 blend）；非循环片段时间 = AI 的 modeT（抡锅 1.41 s、取刀 1.95 s、闩门 6.4 s 与逻辑同步）；
//     循环走路片段按 AI 实际速度 / 片段速度缩放步频（慢慢靠近 0.38、打烊 0.6、暴怒 1.7）。opts.turn = e.ck.turn（看着你）。
//     融进环境：CHEF_UNI.uFade = 1 − 清晰度（AI 给 e.ck.vis，这里平滑：显形 3/s、隐去 1.2/s）；身体 / 鬃毛 / 眼睛走 chefMesh 的溶解补丁，
//     手持道具与动画自建道具克隆一份材质再打补丁（不影响厨房里同款的锅和刀）；清晰度 < 0.6 时不投影（影子会出卖他）。
//     游戏里不显示拖人片段的灰色假人（被拖的就是你）；进冷库时右手一直拿着那把雕刻刀（e.ck.knife）。setChefBlood 跟 chefAI.chefBloodLevel。
//   · buildChefProp / syncChefProp：餐厅后场与餐厅的结构模型（structures.buildStructure 的 chefprop 分支；动态件每帧由 renderer.updateStructs 调 sync）：
//     stove 燃气灶（台面 0.90、前沿 = 结构南沿、炖锅 0.8 倍底心在灶前站位前方 0.78 m、火苗随开关 / 损坏、东侧钩子上挂那口带把手的锅）、knives 刀墙（挂杆 1.55，
//     他取的那把挂在站位 +0.12 m）、counter / island / sink / shelf / sacks / coldshelf / carcass、pipe 铁管 + 手铐（被铐的人背靠东墙坐着）、
//     swing 弹簧门（有人走近就推开）、front 双开正门（门面在墙内沿、把手 1.00 / ±0.09、打烊合上；闩门后绳子 + 门闩 1.22）、bell 服务铃台、
//     table 餐桌（桌面 0.74 / 1.5 × 1.3，东西两把椅子 0.46；静态合批：桌椅 + 着迷进食的顾客身体）+ tabledyn（顾客拿勺的手、营业时上桌的那一盘）。
//   · syncChefStains：餐厅地毯上的血迹贴花（chefAI 存档 stains，世界坐标 → 窗口）。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Entity } from '../entities'
import type { Structure } from '../core/types'
import type { Engine } from '../engine'
import { buildChef, chefMaterials, chefFadePatch, setChefBlood, CHEF_UNI, type ChefRig } from './chefMesh'
import { CHEF_CLIPS, chefPose, mixChefPose, cloneChefPose, applyChefPose, resetChefDynamics, type ChefClip, type ChefAnimPose, type ChefAnimOpts } from './chefAnim'
import { buildChefPot, buildStewCauldron, buildCarvingKnife, buildCuffsPipe, buildRedCabbage, buildMeatChunk } from './chefProps'
import { litMaterial } from './shared'
import { chefSave, chefSite, chefClosed, chefCooking, plateReady, findChef, chefBloodLevel, CK } from '../engine/chefAI'

/** LOD 切换距离（米）：边界（< b0 LOD0、< b1 LOD1、否则 LOD2）、迟滞带、建模距离 */
export const CHEF_RLOD = { b0: 8, b1: 17.5, hyst: 1, build0: 11, build1: 22 }
/** 图鉴档案四个定格姿态（archiveViews 按个体序号轮换） */
export const CHEF_ARCHIVE_POSES = [
  { clip: 'holdCabbage', t: 2.0, label: '捧着紫甘蓝' },
  { clip: 'idle', t: 2.4, label: '灶前搅锅' },
  { clip: 'tapTable', t: 2.0, label: '敲你的桌子' },
  { clip: 'potSwing', t: 1.44, label: '那口带把手的锅' },
] as const satisfies readonly { clip: ChefClip; t: number; label: string }[]

interface View { clip: ChefClip; seq: number; t: number; gt: number; fadeT: number; blend: number; prev: ChefAnimPose | null; last: ChefAnimPose | null; lod: 0 | 1 | 2; vis: number; shadow: boolean }
const shadowsOn = (o: THREE.Object3D, on: boolean) => o.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh) { m.castShadow = on; m.receiveShadow = true } })
/** 手持道具 / 动画自建道具：克隆材质 + 溶解补丁（按原材质缓存） */
const FADE_CLONE = new Map<THREE.Material, THREE.Material>()
/** 每实例溶解：uFade 是共享 uniform，画每个网格前写入它所属实例的值（图鉴模型 fade = 0，不跟着游戏里的厨师变淡） */
function bindFade(o: THREE.Object3D, root: THREE.Object3D) {
  const set = () => { CHEF_UNI.uFade.value = (root.userData.fade as number | undefined) ?? 0 }
  o.traverse((x) => { if ((x as THREE.Mesh).isMesh) x.onBeforeRender = set })
}
function fadeProps(o: THREE.Object3D, root: THREE.Object3D) {
  const mats = chefMaterials()
  o.traverse((x) => {
    const m = x as THREE.Mesh
    if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return
    const swap = (mt: THREE.Material) => { if (mt === mats.eye || (mt as { __chefFade?: boolean }).__chefFade) return mt; let c = FADE_CLONE.get(mt); if (!c) { c = chefFadePatch(mt.clone()); FADE_CLONE.set(mt, c) } return c }
    m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material)
  })
  bindFade(o, root)
}
function mkHolder(root: THREE.Group, lod: number, name: string) {
  const h = new THREE.Group(); h.name = name; h.visible = false
  const m = buildChef({ lod }); h.add(m)
  shadowsOn(m, true)
  root.add(h)
  return { h, rig: m.userData.chef as ChefRig }
}
export function buildChefEntityMesh(archivePose?: number): THREE.Group {
  const root = new THREE.Group(); root.name = 'chefEntity'
  root.userData.entityType = 'chef'
  if (archivePose !== undefined) {
    const { h, rig } = mkHolder(root, 0, 'chefLOD0'); h.visible = true
    const P = CHEF_ARCHIVE_POSES[((archivePose % CHEF_ARCHIVE_POSES.length) + CHEF_ARCHIVE_POSES.length) % CHEF_ARCHIVE_POSES.length]
    resetChefDynamics(rig)
    const opts: ChefAnimOpts = { seed: 3 }
    let P0: ChefAnimPose | null = null
    for (let t = Math.max(0, P.t - 0.8); t <= P.t + 1e-6; t += 1 / 60) { P0 = chefPose(P.clip, t, opts); applyChefPose(rig, P0, { ...opts, time: t, dt: 1 / 60 }) }
    const vic = root.getObjectByName('chefVictim'); if (vic) vic.visible = false
    root.userData.archive = true; root.userData.fade = 0
    bindFade(root, root)
    return root
  }
  const L2 = mkHolder(root, 2, 'chefLOD2'); L2.h.visible = true
  fadeProps(L2.h, root)
  root.userData.lod2 = L2.h; root.userData.rig2 = L2.rig
  return root
}
function ensureLod(grp: THREE.Group, lod: 0 | 1): void {
  if (grp.userData['lod' + lod]) return
  const L = mkHolder(grp, lod, 'chefLOD' + lod)
  fadeProps(L.h, grp)
  grp.userData['lod' + lod] = L.h; grp.userData['rig' + lod] = L.rig
}
let warmed = false
/** 预热：LOD2 + LOD1 几何 + 材质（走近餐厅时一次性） */
export function prewarmChef(): boolean { if (warmed) return false; prepareChefGeometry(2); prepareChefGeometry(1); if(!chefGeometryReady(2)||!chefGeometryReady(1))return false; warmed = true; chefMaterials(); return true }

/** 渲染层每帧：e.ck → 片段 / LOD / 清晰度 / 道具 */
export function animateChefEntity(grp: THREE.Group, e: Entity, dt: number, distance: number, blood?: number) {
  if (grp.userData.archive) return
  const s = e.ck
  if (distance < CHEF_RLOD.build1 && prepareChefGeometry(1)) ensureLod(grp, 1)
  if (distance < CHEF_RLOD.build0 && prepareChefGeometry(0)) ensureLod(grp, 0)
  let v = grp.userData.ckView as View | undefined
  if (!v) { v = { clip: (s?.clip ?? 'idle') as ChefClip, seq: -1, t: 0, gt: 0, fadeT: 1, blend: 0.3, prev: null, last: null, lod: 2, vis: s?.vis ?? 0, shadow: true }; grp.userData.ckView = v }
  // —— LOD ——
  const want: 0 | 1 | 2 = distance < CHEF_RLOD.b0 ? 0 : distance < CHEF_RLOD.b1 ? 1 : 2
  const near = (b: number) => Math.abs(distance - b) < CHEF_RLOD.hyst
  let lod = v.lod
  if (!(near(CHEF_RLOD.b0) && (v.lod === 0 || v.lod === 1)) && !(near(CHEF_RLOD.b1) && (v.lod === 1 || v.lod === 2))) lod = want
  while (lod < 2 && !grp.userData['lod' + lod]) lod++
  const prevLod = v.lod; v.lod = lod as 0 | 1 | 2
  for (const k of [0, 1, 2]) { const h = grp.userData['lod' + k] as THREE.Group | undefined; if (h) h.visible = k === v.lod }
  const rig = grp.userData['rig' + v.lod] as ChefRig
  const holder = grp.userData['lod' + v.lod] as THREE.Group
  if (prevLod !== v.lod && v.last) resetChefDynamics(rig)
  // —— 片段 ——
  const clip = (s?.clip ?? 'idle') as ChefClip, C = CHEF_CLIPS[clip]
  if (s && (s.seq !== v.seq || clip !== v.clip)) { v.prev = v.last ? cloneChefPose(v.last) : null; v.fadeT = 0; v.blend = s.blend || C.blend; v.clip = clip; v.seq = s.seq; v.t = 0 }
  v.fadeT += dt; v.gt += dt
  if (C.loop) { const k = C.speed && s ? (s.mode === 'walk' || s.mode === 'stalk' || s.mode === 'rage' || s.mode === 'drag' || s.mode === 'knife' || s.mode === 'lunge' ? Math.max(0, s.speed) / C.speed : 1) : 1; v.t += dt * (C.speed ? Math.min(3, k) : 1) }
  else v.t = s ? Math.min(s.modeT, C.dur) : Math.min(v.t + dt, C.dur)
  const opts: ChefAnimOpts = { seed: (e.id % 7) + 1, turn: s?.turn ?? 0 }
  let P = chefPose(clip, v.t, { ...opts, time: v.gt })
  if (v.prev && v.fadeT < v.blend) P = mixChefPose(v.prev, P, smooth(v.fadeT / v.blend))
  v.last = P
  applyChefPose(rig, P, { ...opts, time: v.gt, dt })
  // 动画第一次 apply 时才建的场景件（盘子 / 绳子 / 门闩 / 呕吐物 / 墙上的刀）也要溶解
  if (!holder.userData.fadeDone) { holder.userData.fadeDone = true; fadeProps(holder, grp) }
  // —— 道具 ——
  const vic = (rig.root.getObjectByName('chefVictim') ?? null); if (vic) vic.visible = false
  if (s?.knife && clip !== 'takeKnife') rig.props.knife.visible = true
  if (s && !s.pot) rig.props.pot.visible = false
  // —— 融进环境 ——
  const target = s ? s.vis : 1
  v.vis += (target - v.vis) * Math.min(1, dt * (target > v.vis ? 3 : 1.2))
  grp.userData.fade = CHEF_UNI.uFade.value = Math.max(0, Math.min(1, 1 - v.vis))
  const sh = v.vis > 0.6
  v.shadow = sh
  for (const k of [0, 1, 2]) { const h = grp.userData['lod' + k] as THREE.Group | undefined; if (h && h.userData.shadow !== sh) { h.userData.shadow = sh; h.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh) m.castShadow = sh }) } }
  if (blood !== undefined && Math.abs(rig.blood - blood) > 0.005) setChefBlood(rig, blood)
}
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t) }

// =====================================================================
// 场景件
// =====================================================================
const MAT: Record<string, THREE.Material> = {}
const mat = (k: string, p: Parameters<typeof litMaterial>[0]) => (MAT[k] ??= litMaterial(p))
const M = {
  steel: () => mat('steel', { color: '#a9adb0', roughness: 0.35, metalness: 0.75 }),
  steelDk: () => mat('steelDk', { color: '#55595c', roughness: 0.45, metalness: 0.7 }),
  black: () => mat('black', { color: '#1a1a1a', roughness: 0.6 }),
  wood: () => mat('wood', { color: '#4a2c1a', roughness: 0.65 }),
  woodDk: () => mat('woodDk', { color: '#2e1b10', roughness: 0.7 }),
  linen: () => mat('linen', { color: '#f1ece2', roughness: 0.9 }),
  brass: () => mat('brass', { color: '#c9a04a', roughness: 0.3, metalness: 0.85 }),
  tile: () => mat('tile', { color: '#ffffff', map: tileTex(), roughness: 0.4 }),
  flame: () => mat('flame', { color: '#3a7cff', emissive: '#2a6aff', roughness: 1, transparent: true, opacity: 0.85 } as THREE.MeshLambertMaterialParameters),
  frost: () => mat('frost', { color: '#dfeaf0', roughness: 0.85 }),
  meat: () => mat('meat', { color: '#7a2a24', roughness: 0.55 }),
  fat: () => mat('fat', { color: '#d9c6ae', roughness: 0.6 }),
  sack: () => mat('sack', { color: '#b8a17a', roughness: 0.95 }),
  rope: () => mat('rope', { color: '#a88a5a', roughness: 0.9 }),
  iron: () => mat('iron', { color: '#3a3a3c', roughness: 0.5, metalness: 0.7 }),
  glass: () => mat('glass', { color: '#1d2a30', roughness: 0.1, transparent: true, opacity: 0.55 } as THREE.MeshLambertMaterialParameters),
  red: () => mat('red', { color: '#6a1418', roughness: 0.7 }),
  vc: () => mat('vc', { color: '#ffffff', vertexColors: true, roughness: 0.75 }),
  stain: () => mat('stain', { color: '#ffffff', map: stainTex(), transparent: true, depthWrite: false, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -4 } as THREE.MeshLambertMaterialParameters),
}
let _tile: THREE.Texture | null = null
function tileTex() {
  if (_tile) return _tile
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d')!
  x.fillStyle = '#e8e8e2'; x.fillRect(0, 0, 128, 128); x.strokeStyle = '#a8aaa4'; x.lineWidth = 2
  for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(0, i * 32); x.lineTo(128, i * 32); x.stroke(); x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, 128); x.stroke() }
  x.fillStyle = 'rgba(110,30,20,.25)'; x.beginPath(); x.ellipse(80, 90, 14, 6, 0.4, 0, Math.PI * 2); x.fill()
  _tile = new THREE.CanvasTexture(c as unknown as HTMLCanvasElement); _tile.colorSpace = THREE.SRGBColorSpace; _tile.wrapS = _tile.wrapT = THREE.RepeatWrapping
  return _tile
}
let _velvet: THREE.Texture | null = null
/** 天鹅绒壁纸：深酒红底 + 暗纹大马士革花（竖向重复）+ 细金线 */
function velvetTex() {
  if (_velvet) return _velvet
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d')!
  const g = x.createLinearGradient(0, 0, 128, 0); g.addColorStop(0, '#4a0f18'); g.addColorStop(0.5, '#5c1420'); g.addColorStop(1, '#4a0f18'); x.fillStyle = g; x.fillRect(0, 0, 128, 256)
  x.fillStyle = 'rgba(30,4,8,0.55)'
  const fleur = (cx: number, cy: number, k: number) => { x.beginPath(); x.moveTo(cx, cy - 34 * k); x.bezierCurveTo(cx + 22 * k, cy - 20 * k, cx + 26 * k, cy + 8 * k, cx, cy + 34 * k); x.bezierCurveTo(cx - 26 * k, cy + 8 * k, cx - 22 * k, cy - 20 * k, cx, cy - 34 * k); x.fill(); x.beginPath(); x.ellipse(cx + 18 * k, cy - 4 * k, 8 * k, 14 * k, 0.6, 0, Math.PI * 2); x.fill(); x.beginPath(); x.ellipse(cx - 18 * k, cy - 4 * k, 8 * k, 14 * k, -0.6, 0, Math.PI * 2); x.fill() }
  fleur(64, 64, 1); fleur(0, 192, 1); fleur(128, 192, 1)
  x.strokeStyle = 'rgba(200,150,70,0.35)'; x.lineWidth = 1; for (const xx of [0.5, 127.5]) { x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx, 256); x.stroke() }
  let sd = 5; const R = () => ((sd = (sd * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '120,40,50'},${R() * 0.08})`; x.fillRect(R() * 128, R() * 256, 1, 2) }
  _velvet = new THREE.CanvasTexture(c as unknown as HTMLCanvasElement); _velvet.colorSpace = THREE.SRGBColorSpace; _velvet.wrapS = _velvet.wrapT = THREE.RepeatWrapping
  return _velvet
}
let _stain: THREE.Texture | null = null
function stainTex() {
  if (_stain) return _stain
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d')!
  let sd = 77; const R = () => ((sd = (sd * 16807) % 2147483647) / 2147483647)
  x.clearRect(0, 0, 128, 128)
  for (let i = 0; i < 9; i++) { x.fillStyle = `rgba(${70 + R() * 40 | 0},4,6,${0.55 + R() * 0.35})`; x.beginPath(); x.ellipse(64 + (R() - 0.5) * 50, 64 + (R() - 0.5) * 50, 8 + R() * 22, 6 + R() * 14, R() * 3, 0, Math.PI * 2); x.fill() }
  for (let i = 0; i < 30; i++) { x.fillStyle = 'rgba(80,4,6,.7)'; x.beginPath(); x.arc(R() * 128, R() * 128, 1 + R() * 3, 0, Math.PI * 2); x.fill() }
  x.strokeStyle = 'rgba(70,4,6,.6)'; x.lineWidth = 5; x.beginPath(); x.moveTo(64, 64); x.quadraticCurveTo(90, 80, 124, 70); x.stroke() // 被拖走的那一道
  _stain = new THREE.CanvasTexture(c as unknown as HTMLCanvasElement); _stain.colorSpace = THREE.SRGBColorSpace
  return _stain
}
function box(g: THREE.Object3D, name: string, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.name = name; o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o
}
function cyl(g: THREE.Object3D, name: string, r0: number, r1: number, h: number, x: number, y: number, z: number, m: THREE.Material, seg = 16) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); o.name = name; o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o
}
/** 顶点色合批小工具 */
function vcGeo(geo: THREE.BufferGeometry, color: string, m?: THREE.Matrix4) {
  const g = (geo.index ? geo.toNonIndexed() : geo); if (m) g.applyMatrix4(m)
  const c = new THREE.Color(color), n = g.getAttribute('position').count, arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color' && k !== 'uv') g.deleteAttribute(k)
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
  return g
}
const TM = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz))

// ---------- 餐桌 + 顾客 ----------
/** 餐桌（桌面 0.74 = CHEF_TABLE.y；1.5 × 1.3，桌沿距中心 0.65）+ 东西两把椅子（椅面 0.46）；局部原点 = 格子西北角 */
const TABLE = { top: 0.74, w: 1.5, d: 1.3, seat: 0.46, chairX: 0.95 }
const SUITS = ['#2b2f3a', '#4a2e2a', '#3a3f2e', '#5a4a3a', '#262626', '#5e2434', '#3d3550']
const SKIN = ['#d8b090', '#c08a6a', '#8a5a3a', '#e8c8a8', '#b07850']
const HAIR = ['#2a1a10', '#5a3a20', '#9a9a9a', '#151515', '#7a5a30']
/** 一位着迷进食的顾客（静态部分：坐姿身体、低着的头、搭在桌沿的左手），朝 +Z（桌子方向） */
function dinerStatic(seed: number, m: THREE.Matrix4): THREE.BufferGeometry[] {
  const suit = SUITS[seed % SUITS.length], skin = SKIN[(seed >> 3) % SKIN.length], hair = HAIR[(seed >> 5) % HAIR.length]
  const out: THREE.BufferGeometry[] = []
  const add = (geo: THREE.BufferGeometry, c: string, t: THREE.Matrix4) => out.push(vcGeo(geo, c, m.clone().multiply(t)))
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.15, 0.14, 0.44), suit, TM(s * 0.1, TABLE.seat + 0.07, 0.17))
    add(new THREE.BoxGeometry(0.12, 0.44, 0.13), suit, TM(s * 0.1, 0.24, 0.38))
    add(new THREE.BoxGeometry(0.11, 0.07, 0.25), '#141414', TM(s * 0.1, 0.035, 0.44))
  }
  // 上身前倾（贴着桌子吃）：躯干绕髋前倾 0.42
  const lean = TM(0, TABLE.seat + 0.02, 0.02, 0.42)
  add(new THREE.BoxGeometry(0.38, 0.5, 0.22), suit, lean.clone().multiply(TM(0, 0.27, 0)))
  add(new THREE.BoxGeometry(0.16, 0.06, 0.18), '#e8e2d6', lean.clone().multiply(TM(0, 0.5, 0.04))) // 衬衫领
  add(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 8), skin, lean.clone().multiply(TM(0, 0.56, 0.02)))
  // 头：低着（看盘子），脸朝下，没有表情
  const head = lean.clone().multiply(TM(0, 0.68, 0.06, 0.5))
  add(new THREE.SphereGeometry(0.1, 12, 9), skin, head.clone().multiply(TM(0, 0, 0, 0, 0, 0, 0.95, 1.12, 1.0)))
  add(new THREE.SphereGeometry(0.106, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, head.clone().multiply(TM(0, 0.015, -0.012, -0.3, 0, 0, 1, 1.1, 1.05)))
  // 左臂：上臂下垂、前臂搭在桌沿
  add(new THREE.BoxGeometry(0.1, 0.3, 0.1), suit, lean.clone().multiply(TM(0.24, 0.32, 0.03, -0.9)))
  add(new THREE.BoxGeometry(0.085, 0.085, 0.3), suit, TM(0.2, TABLE.top + 0.05, 0.33))
  add(new THREE.BoxGeometry(0.08, 0.04, 0.09), skin, TM(0.17, TABLE.top + 0.03, 0.5))
  return out
}
/** 顾客拿勺的右臂（动态）：肩为原点，前臂 + 手 + 勺；绕 x 轴转动 = 勺子在盘子与嘴之间来回 */
function dinerArm(seed: number): THREE.Group {
  const suit = SUITS[seed % SUITS.length], skin = SKIN[(seed >> 3) % SKIN.length]
  const g = new THREE.Group(); g.name = 'dinerArm'
  const parts = [
    vcGeo(new THREE.BoxGeometry(0.1, 0.1, 0.3), suit, TM(0, -0.02, 0.15)),
    vcGeo(new THREE.BoxGeometry(0.085, 0.085, 0.26), suit, TM(0, -0.05, 0.4, 0.5)),
    vcGeo(new THREE.BoxGeometry(0.075, 0.06, 0.08), skin, TM(0, -0.12, 0.52)),
    vcGeo(new THREE.BoxGeometry(0.012, 0.008, 0.16), '#c9c9c4', TM(0, -0.14, 0.6, 0.6)),
    vcGeo(new THREE.SphereGeometry(0.022, 8, 6), '#c9c9c4', TM(0, -0.2, 0.66, 0, 0, 0, 1, 0.4, 1.3)),
  ]
  const o = new THREE.Mesh(mergeGeometries(parts, false)!, M.vc()); o.castShadow = true; g.add(o)
  return g
}
/** 菜：0 炖菜（碗 + 酱汁 + 肉块）/ 1 香肠 ×3 / 2 牛排（盘子 + 烤纹） */
function dish(kind: number): THREE.Group {
  const g = new THREE.Group(); g.name = 'dish'
  const parts: THREE.BufferGeometry[] = []
  const plate = new THREE.LatheGeometry([[0, 0], [0.085, 0], [0.095, 0.006], [0.135, 0.02], [0.13, 0.022], [0.09, 0.01], [0, 0.01]].map(([x, y]) => new THREE.Vector2(x, y)), 20)
  parts.push(vcGeo(plate, '#f4f1ea'))
  if (kind === 0) {
    parts.push(vcGeo(new THREE.CylinderGeometry(0.07, 0.05, 0.05, 14, 1, true), '#efe9df', TM(0, 0.035, 0)))
    parts.push(vcGeo(new THREE.CircleGeometry(0.066, 14), '#5a1a10', TM(0, 0.052, 0, -Math.PI / 2)))
    for (const [x, z] of [[0.02, 0.01], [-0.025, -0.015], [0.005, -0.03]]) parts.push(vcGeo(new THREE.DodecahedronGeometry(0.018, 0), '#7a3424', TM(x, 0.058, z)))
  } else if (kind === 1) {
    for (const z of [-0.035, 0, 0.035]) parts.push(vcGeo(new THREE.CapsuleGeometry(0.016, 0.1, 3, 8), '#7a3a22', TM(0, 0.03, z, 0, 0, Math.PI / 2)))
    parts.push(vcGeo(new THREE.SphereGeometry(0.02, 8, 6), '#6a1a12', TM(0.07, 0.025, 0.05, 0, 0, 0, 1, 0.3, 1)))
  } else {
    parts.push(vcGeo(new THREE.BoxGeometry(0.15, 0.025, 0.1), '#5a2416', TM(0, 0.03, 0, 0, 0.3)))
    for (const k of [-1, 0, 1]) parts.push(vcGeo(new THREE.BoxGeometry(0.004, 0.002, 0.11), '#1e0c08', TM(k * 0.035, 0.0435, 0, 0, 0.3 + 0.6)))
    parts.push(vcGeo(new THREE.BoxGeometry(0.03, 0.026, 0.02), '#c87a7a', TM(0.07, 0.03, 0.01, 0, 0.3)))
  }
  const o = new THREE.Mesh(mergeGeometries(parts, false)!, M.vc()); o.castShadow = true; o.receiveShadow = true; g.add(o)
  return g
}
function buildTable(s: Structure): THREE.Group {
  const g = new THREE.Group(); g.name = 'chefTable'
  const cx = 0.5, cz = 0.5, T = TABLE
  const parts: THREE.BufferGeometry[] = []
  // 桌：四腿 + 桌板 + 白桌布（台面 0.74、四边垂下 0.26）
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(vcGeo(new THREE.BoxGeometry(0.06, T.top - 0.04, 0.06), '#3a2216', TM(cx + sx * (T.w / 2 - 0.12), (T.top - 0.04) / 2, cz + sz * (T.d / 2 - 0.12))))
  parts.push(vcGeo(new THREE.BoxGeometry(T.w - 0.02, 0.035, T.d - 0.02), '#3a2216', TM(cx, T.top - 0.022, cz)))
  parts.push(vcGeo(new THREE.BoxGeometry(T.w, 0.006, T.d), '#f2ede3', TM(cx, T.top - 0.003, cz)))
  for (const sz of [-1, 1]) parts.push(vcGeo(new THREE.BoxGeometry(T.w, 0.26, 0.008), '#ebe5da', TM(cx, T.top - 0.13, cz + sz * (T.d / 2 + 0.004))))
  for (const sx of [-1, 1]) parts.push(vcGeo(new THREE.BoxGeometry(0.008, 0.26, T.d), '#ebe5da', TM(cx + sx * (T.w / 2 + 0.004), T.top - 0.13, cz)))
  // 烛台 + 花瓶
  parts.push(vcGeo(new THREE.CylinderGeometry(0.04, 0.05, 0.02, 10), '#c9a04a', TM(cx, T.top + 0.01, cz)))
  parts.push(vcGeo(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 8), '#efe8d8', TM(cx, T.top + 0.11, cz)))
  // 椅子（东西两侧，面朝桌子）：椅面 0.46
  const diners = Number(s.data?.diners ?? 0), seed0 = (s.x * 73856093) ^ (s.y * 19349663)
  for (const [k, sx] of [[0, -1], [1, 1]] as const) {
    const yaw = sx < 0 ? Math.PI / 2 : -Math.PI / 2
    const cm = TM(cx + sx * T.chairX, 0, cz, 0, yaw)
    const add = (geo: THREE.BufferGeometry, c: string, t: THREE.Matrix4) => parts.push(vcGeo(geo, c, cm.clone().multiply(t)))
    add(new THREE.BoxGeometry(0.46, 0.05, 0.44), '#5e1e22', TM(0, T.seat - 0.025, 0))
    add(new THREE.BoxGeometry(0.46, 0.62, 0.05), '#5e1e22', TM(0, T.seat + 0.33, -0.21))
    for (const lx of [-0.2, 0.2]) for (const lz of [-0.18, 0.18]) add(new THREE.BoxGeometry(0.04, T.seat - 0.05, 0.04), '#2e1a10', TM(lx, (T.seat - 0.05) / 2, lz))
    // 顾客
    if (k < diners) {
      parts.push(...dinerStatic(Math.abs(seed0 + k * 131), cm.clone().multiply(TM(0, 0, -0.04))))
      // 自己的一盘（炖菜）
      const dm = TM(cx + sx * 0.42, T.top, cz)
      const d0 = dish(0).children[0] as THREE.Mesh
      parts.push(vcGeo(d0.geometry.clone(), '#ffffff', dm)) // 颜色已在顶点色里——这里只要位置：重算颜色前保留原色
      parts[parts.length - 1].setAttribute('color', (d0.geometry.getAttribute('color') as THREE.BufferAttribute).clone())
    }
  }
  const o = new THREE.Mesh(mergeGeometries(parts, false)!, M.vc()); o.name = 'chefTableBody'; o.castShadow = true; o.receiveShadow = true; g.add(o)
  g.position.set(s.x, 0, s.y)
  return g
}
/** 动态：顾客的勺子手 + 营业时上桌的那一盘（syncChefProp 驱动） */
function buildTableDyn(s: Structure): THREE.Group {
  const g = new THREE.Group(); g.name = 'chefTableDyn'
  const cx = 0.5, cz = 0.5, T = TABLE
  const diners = Number(s.data?.diners ?? 0), seed0 = (s.x * 73856093) ^ (s.y * 19349663)
  const arms: THREE.Group[] = []
  for (const [k, sx] of [[0, -1], [1, 1]] as const) {
    if (k >= diners) continue
    const yaw = sx < 0 ? Math.PI / 2 : -Math.PI / 2
    const holder = new THREE.Group(); holder.position.set(cx + sx * T.chairX, 0, cz); holder.rotation.y = yaw
    const arm = dinerArm(Math.abs(seed0 + k * 131))
    // 右肩（顾客局部 x −0.21，躯干前倾后肩在 y ≈ 0.98、z ≈ 0.2）
    arm.position.set(-0.21, 0.98, 0.17); arm.userData.phase = (k * 1.7 + (s.x + s.y) * 0.37) % 6.28
    holder.add(arm); g.add(holder); arms.push(arm)
  }
  const plate = dish(Number(s.data?.dish ?? 0) % 3); plate.name = 'servePlate'; plate.position.set(cx, T.top, cz + 0.32); g.add(plate)
  g.userData.arms = arms; g.userData.plate = plate
  g.position.set(s.x, 0, s.y)
  return g
}

// ---------- 厨房 ----------
function buildStove(): THREE.Group {
  const g = new THREE.Group(); g.name = 'chefStove'
  // 灶身：x 0.2..1.8、z 0.4..1.0（前沿 = 结构南沿）、台面 0.90
  box(g, 'stoveBody', 1.6, 0.84, 0.6, 1.0, 0.42, 0.7, M.steelDk())
  box(g, 'stoveTop', 1.62, 0.06, 0.62, 1.0, 0.87, 0.7, M.steel())
  box(g, 'ovenDoor', 0.9, 0.42, 0.02, 1.0, 0.36, 1.005, M.steel())
  box(g, 'ovenGlass', 0.6, 0.18, 0.004, 1.0, 0.4, 1.017, M.glass())
  cyl(g, 'ovenHandle', 0.012, 0.012, 0.7, 1.0, 0.62, 1.04, M.steel()).rotation.z = Math.PI / 2
  const knobs = new THREE.Group(); knobs.name = 'knobs'; g.add(knobs)
  for (let i = 0; i < 6; i++) { const k = cyl(knobs, 'knob', 0.022, 0.024, 0.03, 0.4 + i * 0.24, 0.78, 1.015, M.black(), 12); k.rotation.x = Math.PI / 2 }
  // 三个炉头 + 火苗（中间那个正对炖锅：灶前站位前方 0.78 m → 局部 z 0.72）
  const flames = new THREE.Group(); flames.name = 'flames'; g.add(flames)
  for (const [x, z] of [[0.5, 0.62], [1.0, 0.72], [1.5, 0.62]]) {
    cyl(g, 'burner', 0.09, 0.1, 0.02, x, 0.91, z, M.iron(), 16)
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI; const bar = box(g, 'grate', 0.24, 0.012, 0.012, x, 0.925, z, M.iron()); bar.rotation.y = a }
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const f = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.035, 6), M.flame()); f.position.set(x + Math.cos(a) * 0.07, 0.935, z + Math.sin(a) * 0.07); f.name = 'flame'; flames.add(f) }
  }
  const pot = buildStewCauldron(); pot.scale.setScalar(0.8); pot.position.set(1.0, 0.9, 0.72); g.add(pot)
  // 白瓷砖防溅墙 + 抽油烟罩 + 燃气管
  const bs = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.75), M.tile()); bs.position.set(1.0, 1.28, 0.012); bs.name = 'splash'; g.add(bs)
  ;(bs.geometry.getAttribute('uv') as THREE.BufferAttribute).array.forEach((_v, i, a) => { (a as Float32Array)[i] *= i % 2 ? 1.5 : 4.4 })
  box(g, 'hood', 1.8, 0.3, 0.62, 1.0, 2.05, 0.32, M.steel())
  box(g, 'hoodDuct', 0.4, 0.6, 0.35, 1.0, 2.5, 0.18, M.steel())
  cyl(g, 'gasPipe', 0.015, 0.015, 0.8, 0.12, 0.5, 0.42, M.brass(), 8)
  // 损坏：焦黑 + 掉下的旋钮 + 扯断的管子
  const broken = new THREE.Group(); broken.name = 'broken'; broken.visible = false; g.add(broken)
  const sc = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), mat('scorch', { color: '#120c08', roughness: 1, transparent: true, opacity: 0.8 } as THREE.MeshLambertMaterialParameters)); sc.rotation.x = -Math.PI / 2; sc.position.set(1.0, 0.903, 0.62); broken.add(sc)
  const lk = cyl(broken, 'looseKnob', 0.022, 0.024, 0.03, 0.9, 0.015, 1.15, M.black(), 12); lk.rotation.z = Math.PI / 2
  const bp = cyl(broken, 'cutPipe', 0.015, 0.015, 0.35, 0.18, 0.2, 0.62, M.brass(), 8); bp.rotation.z = 0.9
  // 东侧墙上的挂钩 + 那口带把手的锅（世界 hook = 灶结构 x + 2.25、北墙内 0.12 m）
  box(g, 'hookRail', 0.5, 0.03, 0.03, 2.25, 1.62, 0.02, M.steel())
  // [l5items] 锅常挂在钩子上可见：原先握点 z 0.12 时锅底 3 cm 插进墙里（只露半口锅）→ 前移到 0.17 + 一根从挂杆伸出的 S 钩穿过挂孔
  cyl(g, 'hookPeg', 0.005, 0.005, 0.17, 2.25, 1.6, 0.095, M.steel(), 6).rotation.x = Math.PI / 2
  const hp = buildChefPot(); hp.name = 'hookPot'; hp.rotation.z = Math.PI; hp.position.set(2.25, 1.6, 0.17); g.add(hp)
  return g
}
function buildKnives(): THREE.Group {
  const g = new THREE.Group(); g.name = 'chefKnives'
  box(g, 'rail', 0.9, 0.04, 0.012, 0.5, 1.55, 0.008, M.black())
  for (const [x, len] of [[0.16, 0.9], [0.28, 0.8], [0.72, 0.85], [0.84, 0.75]] as const) { const k = buildCarvingKnife(); k.scale.set(1, len, 1); k.rotation.z = Math.PI; k.position.set(x, 1.6, 0.015); g.add(k) }
  // 剁肉刀（宽刃）
  const cl = box(g, 'cleaver', 0.11, 0.18, 0.004, 0.04, 1.47, 0.012, M.steel()); cl.rotation.z = 0.05
  // 他取的那把：站位 +0.12 m（局部 x 0.5）、离墙 1.5 cm、刀尖朝下（= chefAnim CHEF_WALL_KNIFE_GRIP）
  const sk = buildCarvingKnife(); sk.name = 'slotKnife'; sk.rotation.z = Math.PI; sk.position.set(0.5, 1.63, 0.015); g.add(sk)
  return g
}
function buildFront(): THREE.Group {
  const g = new THREE.Group(); g.name = 'chefFront'
  // 门框（墙内沿 = 局部 z 0；门洞两格宽 2 m、高 2.4 m）
  box(g, 'frameL', 0.08, 2.5, 0.12, 0.04, 1.25, 0.06, M.woodDk()); box(g, 'frameR', 0.08, 2.5, 0.12, 1.96, 1.25, 0.06, M.woodDk()); box(g, 'frameT', 2.0, 0.1, 0.12, 1.0, 2.45, 0.06, M.woodDk())
  const leaves: THREE.Group[] = []
  for (const sgn of [-1, 1]) {
    const hinge = new THREE.Group(); hinge.name = sgn < 0 ? 'leafW' : 'leafE'; hinge.position.set(sgn < 0 ? 0.08 : 1.92, 0, 0.025); g.add(hinge)
    const w = 0.92, dir = sgn < 0 ? 1 : -1 // 从铰链往门缝
    box(hinge, 'leaf', w, 2.35, 0.05, dir * w / 2, 1.18, 0, M.wood())
    box(hinge, 'panelU', w - 0.2, 0.9, 0.012, dir * w / 2, 1.65, -0.03, M.woodDk())
    box(hinge, 'panelD', w - 0.2, 0.7, 0.012, dir * w / 2, 0.55, -0.03, M.woodDk())
    // 把手：高 1.00、门缝两侧 ±0.09（= 局部 x 1 ± 0.09），伸出到门面以内 0.07（= CHEF_DOOR 把手杆 z 0.53）
    const hx = (1 - sgn * -0.09) - hinge.position.x // 把手在铰链组里的 x
    const hb = cyl(hinge, 'handle', 0.012, 0.012, 0.22, sgn < 0 ? 1 - 0.09 - hinge.position.x : 1 + 0.09 - hinge.position.x, 1.0, -0.07, M.brass(), 10); void hx
    box(hinge, 'handlePost', 0.02, 0.02, 0.07, hb.position.x, 1.1, -0.035, M.brass()); box(hinge, 'handlePost2', 0.02, 0.02, 0.07, hb.position.x, 0.9, -0.035, M.brass())
    leaves.push(hinge)
  }
  // 绳子（缠两只把手两圈 + 结）+ 门闩（1.22、跨过门缝）
  const bar = new THREE.Group(); bar.name = 'barricade'; bar.visible = false; g.add(bar)
  for (let i = 0; i < 2; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.009, 6, 24), M.rope()); t.scale.set(1, 0.55, 1); t.position.set(1.0, 1.0 + (i - 0.5) * 0.03, -0.07); t.rotation.x = Math.PI / 2; bar.add(t) }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), M.rope()); knot.position.set(1.0, 0.99, -0.085); bar.add(knot)
  for (const s of [-1, 1]) { const tail = cyl(bar, 'ropeTail', 0.008, 0.008, 0.16, 1.0 + s * 0.03, 0.9, -0.085, M.rope(), 6); tail.rotation.z = s * 0.25 }
  box(bar, 'bolt', 0.3, 0.028, 0.022, 1.06, 1.22, -0.045, M.iron())
  box(g, 'boltKeeper', 0.06, 0.05, 0.03, 1.2, 1.22, -0.02, M.iron())
  g.userData.leaves = leaves; g.userData.bar = bar
  return g
}
function buildSwing(): THREE.Group {
  const g = new THREE.Group(); g.name = 'chefSwing'
  const leaves: THREE.Group[] = []
  for (const sgn of [-1, 1]) {
    const hinge = new THREE.Group(); hinge.name = 'swingLeaf'; hinge.position.set(sgn < 0 ? 0.04 : 1.96, 0, 0.5); g.add(hinge)
    const w = 0.94, dir = sgn < 0 ? 1 : -1
    box(hinge, 'leaf', w, 2.05, 0.045, dir * w / 2, 1.05, 0, M.steel())
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.13, 18), M.glass()); win.position.set(dir * w / 2, 1.5, 0.024); hinge.add(win)
    const win2 = win.clone(); win2.rotation.y = Math.PI; win2.position.z = -0.024; hinge.add(win2)
    box(hinge, 'kick', w - 0.06, 0.25, 0.05, dir * w / 2, 0.15, 0, M.steelDk())
    leaves.push(hinge)
  }
  g.userData.leaves = leaves
  return g
}
function buildBell(): THREE.Group {
  const g = new THREE.Group(); g.name = 'chefBell'
  box(g, 'podium', 0.5, 0.92, 0.42, 0.5, 0.46, 0.5, M.wood())
  box(g, 'podiumTop', 0.56, 0.04, 0.48, 0.5, 0.94, 0.5, M.woodDk())
  cyl(g, 'bellBase', 0.05, 0.055, 0.015, 0.5, 0.968, 0.5, M.black(), 18)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.045, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.brass()); dome.name = 'bellDome'; dome.position.set(0.5, 0.975, 0.5); g.add(dome)
  cyl(g, 'bellPin', 0.006, 0.006, 0.02, 0.5, 1.03, 0.5, M.brass(), 8)
  // 小卡片「请按铃」
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d')!
  x.fillStyle = '#f1e8d4'; x.fillRect(0, 0, 128, 64); x.fillStyle = '#5a1a1a'; x.font = '22px "Noto Sans SC",sans-serif'; x.textAlign = 'center'; x.fillText('请按铃', 64, 30); x.font = '12px Georgia,serif'; x.fillText('SERVICE', 64, 52)
  const t = new THREE.CanvasTexture(c as unknown as HTMLCanvasElement); t.colorSpace = THREE.SRGBColorSpace
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.06), litMaterial({ color: '#ffffff', map: t, side: THREE.DoubleSide })); card.position.set(0.62, 0.99, 0.6); card.rotation.set(-0.3, -0.4, 0); g.add(card)
  return g
}
function shelfUnit(g: THREE.Group, len: number, axis: 'x' | 'y', cold: boolean) {
  const along = (u: number, v: number): [number, number] => (axis === 'x' ? [u, v] : [v, u])
  const frame = cold ? M.steel() : M.woodDk()
  for (const u of [0.05, len - 0.05]) for (const v of [0.08, 0.5]) { const [x, z] = along(u, v); box(g, 'post', 0.04, 2.0, 0.04, x, 1.0, z, frame) }
  for (const h of [0.15, 0.7, 1.25, 1.8]) { const [x, z] = along(len / 2, 0.29); box(g, 'board', axis === 'x' ? len : 0.46, 0.03, axis === 'x' ? 0.46 : len, x, h, z, frame) }
  let sd = (len * 977) | 0; const R = () => ((sd = (sd * 16807) % 2147483647) / 2147483647)
  for (const h of [0.15, 0.7, 1.25, 1.8]) for (let u = 0.2; u < len - 0.15; u += 0.22 + R() * 0.12) {
    const [x, z] = along(u, 0.29)
    if (cold) { const pk = box(g, 'pack', 0.18, 0.08 + R() * 0.06, 0.26, x, h + 0.06, z, R() < 0.6 ? M.meat() : M.frost()); pk.rotation.y = R() * 0.3 }
    else if (R() < 0.5) cyl(g, 'jar', 0.05, 0.05, 0.16, x, h + 0.095, z, mat('jar' + (R() * 3 | 0), { color: ['#7a5a2a', '#3a5a2a', '#8a2a1a'][R() * 3 | 0], roughness: 0.3, transparent: true, opacity: 0.85 } as THREE.MeshLambertMaterialParameters), 10)
    else box(g, 'can', 0.12, 0.14, 0.12, x, h + 0.085, z, mat('can' + (R() * 3 | 0), { color: ['#b8a07a', '#7a2a2a', '#4a5a6a'][R() * 3 | 0], roughness: 0.6 }))
  }
}
/** structures.buildStructure → chefprop：返回已摆在世界坐标（地图坐标）里的组 */
export function buildChefProp(s: Structure): THREE.Object3D | null {
  const kind = String(s.data?.prop ?? '')
  let g: THREE.Group
  switch (kind) {
    case 'table': return buildTable(s)
    case 'tabledyn': return buildTableDyn(s)
    case 'stove': g = buildStove(); break
    case 'knives': g = buildKnives(); break
    case 'front': g = buildFront(); break
    case 'swing': g = buildSwing(); break
    case 'bell': g = buildBell(); break
    case 'wallpaper': {
      // 墙面内沿（局部原点 = 结构西北角）：L5 餐厅墙面（l5Architecture：白漆面板外沿离格边 0.028 m、木护墙板到 0.955 m、腰线 1.05 m、壁柱每 3 格）
      // 之上贴一条天鹅绒壁纸 1.08–2.62 m（离格边 0.036 m，压在白漆面板前、腰线和壁柱后面）+ 顶上一道深色木线
      g = new THREE.Group(); g.name = 'chefWallpaper'
      const side = String(s.data?.side ?? 'w'), len = side === 'w' || side === 'e' ? s.h : s.w
      const m = mat('velvet', { color: '#ffffff', map: velvetTex(), roughness: 0.95 })
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.54), m); pl.name = 'velvet'
      const uv = pl.geometry.getAttribute('uv') as THREE.BufferAttribute; // u 按墙上的世界位置算（chunk 裁剪的两段在接缝处花纹对得上）
      const a0 = side === 'w' || side === 'e' ? s.y : s.x, flip = side === 'w' || side === 's'
      for (let i = 0; i < uv.count; i++) { const k = uv.getX(i) * len; uv.setXY(i, (flip ? k - len - a0 : a0 + k) / 0.6, uv.getY(i) * 1.54 / 1.2) }
      const holder = new THREE.Group(); holder.add(pl); pl.position.y = 1.85
      { const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.03), M.woodDk()); r.position.set(0, 2.63, 0.012); holder.add(r) }
      const IN = 0.036
      if (side === 'w') { holder.rotation.y = Math.PI / 2; holder.position.set(IN, 0, len / 2) }
      else if (side === 'e') { holder.rotation.y = -Math.PI / 2; holder.position.set(1 - IN, 0, len / 2) }
      else if (side === 'n') { holder.position.set(len / 2, 0, IN) }
      else { holder.rotation.y = Math.PI; holder.position.set(len / 2, 0, 1 - IN) }
      g.add(holder)
      break
    }
    case 'counter': {
      g = new THREE.Group(); g.name = 'chefCounter'
      const L = s.h
      box(g, 'counterBody', 0.62, 0.86, L, 0.4, 0.43, L / 2, M.steelDk()); box(g, 'counterTop', 0.66, 0.04, L, 0.4, 0.88, L / 2, M.steel())
      box(g, 'board', 0.36, 0.03, 0.5, 0.42, 0.915, 1.2, M.wood())
      const cab = buildRedCabbage(); cab.position.set(0.42, 1.0, 2.2); g.add(cab)
      const mt = buildMeatChunk(); mt.position.set(0.42, 0.95, 1.2); g.add(mt)
      const kn = buildCarvingKnife(); kn.rotation.set(Math.PI / 2, 0, 0.4); kn.position.set(0.5, 0.94, 1.45); g.add(kn)
      break
    }
    case 'island': {
      g = new THREE.Group(); g.name = 'chefIsland'
      box(g, 'islandTop', 1.8, 0.05, 1.6, 1.0, 0.88, 1.0, M.steel()); box(g, 'islandShelf', 1.7, 0.03, 1.5, 1.0, 0.25, 1.0, M.steel())
      for (const x of [0.15, 1.85]) for (const z of [0.25, 1.75]) cyl(g, 'leg', 0.025, 0.025, 0.86, x, 0.43, z, M.steel(), 8)
      for (let i = 0; i < 4; i++) cyl(g, 'bowl', 0.12, 0.08, 0.09, 0.5 + i * 0.32, 0.95, 0.8 + (i % 2) * 0.4, M.steel(), 14)
      break
    }
    case 'sink': {
      g = new THREE.Group(); g.name = 'chefSink'
      box(g, 'sinkBody', 0.9, 0.86, 0.6, 0.5, 0.43, 0.32, M.steelDk()); box(g, 'sinkTop', 0.92, 0.04, 0.62, 0.5, 0.88, 0.32, M.steel())
      box(g, 'basin', 0.6, 0.02, 0.4, 0.5, 0.75, 0.34, M.steelDk())
      const tap = cyl(g, 'tap', 0.015, 0.015, 0.3, 0.5, 1.05, 0.08, M.steel(), 8); tap.rotation.x = 0.4
      break
    }
    case 'shelf': case 'coldshelf': {
      g = new THREE.Group(); g.name = kind === 'shelf' ? 'chefShelf' : 'chefColdShelf'
      const axis = s.data?.axis === 'y' ? 'y' : 'x'
      shelfUnit(g, axis === 'x' ? s.w : s.h, axis, kind === 'coldshelf')
      break
    }
    case 'sacks': {
      g = new THREE.Group(); g.name = 'chefSacks'
      for (let i = 0; i < 5; i++) { const sk = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.3, 4, 10), M.sack()); sk.scale.set(1, 0.7, 0.8); sk.position.set(0.35 + (i % 3) * 0.62, 0.22 + Math.floor(i / 3) * 0.32, 0.5 + (i % 2) * 0.1); sk.rotation.z = Math.PI / 2 + (i - 2) * 0.1; sk.castShadow = true; g.add(sk) }
      break
    }
    case 'carcass': {
      g = new THREE.Group(); g.name = 'chefCarcass'
      box(g, 'rail', 2.0, 0.05, 0.05, 1.0, 2.75, 1.0, M.steel())
      for (let i = 0; i < 3; i++) {
        const x = 0.4 + i * 0.6
        cyl(g, 'hook', 0.008, 0.008, 0.4, x, 2.53, 1.0, M.steel(), 6)
        const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.75, 4, 12), M.meat()); c.position.set(x, 1.75, 1.0); c.scale.set(1, 1, 0.7); c.rotation.z = (i - 1) * 0.06; c.castShadow = true; c.name = 'carcass'; g.add(c)
        const fat = new THREE.Mesh(new THREE.CapsuleGeometry(0.172, 0.5, 4, 12, ), M.fat()); fat.position.set(x, 1.85, 0.99); fat.scale.set(0.98, 1, 0.55); g.add(fat)
        const fr = new THREE.Mesh(new THREE.CapsuleGeometry(0.175, 0.76, 4, 12), mat('frostCoat', { color: '#e8f0f4', roughness: 0.9, transparent: true, opacity: 0.25 } as THREE.MeshLambertMaterialParameters)); fr.position.copy(c.position); fr.scale.set(1, 1, 0.71); g.add(fr)
      }
      break
    }
    case 'pipe': {
      // 冷库东墙上的铁管（水平、距地 0.55）+ 手铐；被铐的人背靠东墙坐（chefLayout.at.cuff：墙内 0.42 m）
      g = new THREE.Group(); g.name = 'chefPipe'
      const p = buildCuffsPipe(); p.rotation.y = Math.PI / 2; p.position.set(0.95, 0.55, 0.5); g.add(p)
      for (const z of [0.08, 0.92]) box(g, 'bracket', 0.06, 0.08, 0.04, 0.98, 0.55, z, M.iron())
      const fr = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.4), mat('wallFrost', { color: '#eef6fa', roughness: 0.9, transparent: true, opacity: 0.35 } as THREE.MeshLambertMaterialParameters)); fr.rotation.y = -Math.PI / 2; fr.position.set(0.995, 0.9, 0.5); g.add(fr)
      break
    }
    default: return null
  }
  g.position.set(s.x, 0, s.y)
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow ??= true; m.receiveShadow = true } })
  return g
}
/** 需要每帧同步的厨师结构（renderer ANIM_STRUCT） */
export const CHEF_DYN_PROPS = new Set(['stove', 'knives', 'front', 'swing', 'tabledyn', 'bell'])
/** renderer.updateStructs：按引擎状态同步动态件 */
export function syncChefProp(g: THREE.Object3D, s: Structure, eng: Engine | null | undefined, dt: number) {
  if (!eng || eng.levelDef.id !== 5) return
  const kind = String(s.data?.prop ?? '')
  const sv = chefSave(eng), ox = eng.map?.inf?.ox ?? 0, oy = eng.map?.inf?.oy ?? 0
  const t = eng.time
  switch (kind) {
    case 'stove': {
      const fl = g.getObjectByName('flames'); if (fl) { fl.visible = sv.stoveT <= 0; if (fl.visible) fl.children.forEach((f, i) => { f.scale.y = 0.8 + 0.35 * Math.sin(t * 17 + i * 1.3) }) }
      const br = g.getObjectByName('broken'); if (br) br.visible = !!sv.stoveBroken
      const hp = g.getObjectByName('hookPot')
      if (hp) { const e = findChef(eng), md = e?.ck?.mode; hp.visible = !sv.potStolen && !(md === 'stalk' || md === 'tap' || md === 'lunge' || md === 'swing' || md === 'drag' || md === 'guard' || md === 'grab') }
      break
    }
    case 'knives': {
      const sk = g.getObjectByName('slotKnife'); const e = findChef(eng)
      if (sk) sk.visible = !(e?.ck && (e.ck.knife || e.ck.clip === 'takeKnife'))
      break
    }
    case 'front': {
      const closed = chefClosed(eng), bar = !!s.data?.bar
      const leaves = g.userData.leaves as THREE.Group[] | undefined
      if (leaves) { const want = closed ? 0 : 1.35; for (const [i, l] of leaves.entries()) { const a = (l.userData.a as number | undefined) ?? want; const na = a + (want - a) * Math.min(1, dt * 2.5); l.userData.a = na; l.rotation.y = (i === 0 ? 1 : -1) * na } }
      const b = g.userData.bar as THREE.Object3D | undefined; if (b) b.visible = bar
      break
    }
    case 'swing': {
      // 有人（你 / 他）走近就推开：门往离人远的一侧摆
      const leaves = g.userData.leaves as THREE.Group[] | undefined; if (!leaves) break
      const cx = s.x + 1, cy = s.y + 0.5
      let best = 9, side = 1
      const movers: { x: number; y: number }[] = [eng.player]; const e = findChef(eng); if (e) movers.push(e)
      for (const mv of movers) { const d = Math.hypot(mv.x - cx, mv.y - cy); if (d < best) { best = d; side = mv.y < cy ? 1 : -1 } }
      const want = best < 1.3 ? (1 - best / 1.3) * 1.4 * side : 0
      for (const [i, l] of leaves.entries()) { const a = (l.userData.a as number | undefined) ?? 0; const na = a + (want - a) * Math.min(1, dt * 6); l.userData.a = na; l.rotation.y = (i === 0 ? -1 : 1) * na }
      break
    }
    case 'tabledyn': {
      const plate = g.userData.plate as THREE.Object3D | undefined
      if (plate) plate.visible = plateReady(eng, s.x + ox, s.y + oy)
      const arms = g.userData.arms as THREE.Group[] | undefined
      // 着迷进食：勺子在盘子和嘴之间来回（2.6 s 一口）；打烊后也不停
      if (arms) for (const a of arms) { const ph = (t * 2.4 + (a.userData.phase as number)) % (Math.PI * 2); a.rotation.x = -0.15 + 0.85 * Math.max(0, Math.sin(ph)) ** 2 }
      break
    }
    case 'bell': break
  }
  void chefCooking; void chefSite; void CK
}
/** 餐厅地毯上的血迹（chefAI 存档 stains → 窗口坐标贴花；renderer 每帧调用） */
const stainGroups = new WeakMap<THREE.Scene, THREE.Group>()
export function syncChefStains(scene: THREE.Scene, eng: Engine | null) {
  let grp = stainGroups.get(scene)
  if (grp && grp.parent !== scene) {
    for (const child of grp.children) (child as THREE.Mesh).geometry.dispose()
    stainGroups.delete(scene); grp = undefined
  }
  const on = !!eng && eng.levelDef.id === 5 && !!eng.map?.inf
  const st = on ? chefSave(eng!).stains : []
  if (!grp) { if (!st.length) return; grp = new THREE.Group(); grp.name = 'chefStains'; scene.add(grp); stainGroups.set(scene, grp) }
  const ox = eng?.map?.inf?.ox ?? 0, oy = eng?.map?.inf?.oy ?? 0
  while (grp.children.length < st.length) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), M.stain()); m.rotation.x = -Math.PI / 2; m.renderOrder = 1; grp.add(m) }
  grp.children.forEach((c, i) => { const s = st[i]; c.visible = !!s; if (s) { c.position.set(s.x - ox, 0.012, s.y - oy); c.rotation.z = (i * 1.37) % 6.28 } })
}
/** 餐厅附近（预热用）：chefSite 存在、离大厅 60 m 内 */
export function chefWarmHint(eng: Engine): boolean { const s = chefSite(eng); if (!s) return false; const ox = eng.map?.inf?.ox ?? 0, oy = eng.map?.inf?.oy ?? 0; return Math.hypot(eng.player.x + ox - (s.hall.x0 + s.hall.x1) / 2, eng.player.y + oy - (s.hall.y0 + s.hall.y1) / 2) < 60 }
export const chefBloodFor = (eng: Engine) => chefBloodLevel(eng)
