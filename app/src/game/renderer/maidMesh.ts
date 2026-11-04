// [maid] 管家（Entity 111）重制·阶段 1 建模。参照 ZAN 附图（黑色羊腿泡袖长裙、白色长围裙、白翼领、白帽；
// 头部按附图还原：多边形浮雕壳 + 手绘贴图，见 maidHead.ts）。身高约 1.95 m，瘦长；裙摆拖地遮住腿（行走=滑行+裙摆）。
// 模型按 +Z 建造、地面 y=0；外层 face 组 rotation.y=π/2 把正面转到实体约定 +X（userData.facesZ=1）。
// 枢轴（阶段 2 动画用，userData.maid）：root → hips → chest → neck → head（eyeL/eyeR 眼皮、hookL/hookR 卷钩；头部见 maidHead.ts）；
//   armL/armR：shoulder → elbow → wrist；skirt（每实例一份几何，阶段 2 做裙摆形变）。
// 另导出 buildMaidCartMesh()：客房清洁车（毛巾、水桶拖把、扫帚、垃圾袋、失物招领箱=噪点纹理纸盒）。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { litMaterial } from './shared'
import { buildMaidHead } from './maidHead'
import { buildMaidCartMeshV2, boxNoise, lostLabel } from './maidCart'

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

// ---------- 材质（全部实例共享）----------
const M = {
  dress: litMaterial({ color: '#1a181c', roughness: 0.85 }),
  dressHi: litMaterial({ color: '#25222a', roughness: 0.8 }),
  white: litMaterial({ color: '#ebe6d8', roughness: 0.9 }),
  whiteShade: litMaterial({ color: '#d6cfbd', roughness: 0.9 }),
  flesh: litMaterial({ color: '#ffffff', roughness: 0.6, vertexColors: true }),
  fleshPlain: litMaterial({ color: '#e0ad93', roughness: 0.6 }),
  fleshDark: litMaterial({ color: '#b98068', roughness: 0.6 }),
  eye: litMaterial({ color: '#ffffff', roughness: 0.3, vertexColors: true }),
  pupil: litMaterial({ color: '#2a1612', roughness: 0.3 }),
  ribbon: litMaterial({ color: '#141216', roughness: 0.7 }),
  shoe: litMaterial({ color: '#0f0d0e', roughness: 0.4 }),
}

/** 沿折线的管体：pts 路径，r(t) 半径（t∈0..1），seg 周向段数；sx/sz 截面椭圆比例 */
function tube(pts: THREE.Vector3[], r: (t: number) => number, seg = 12, rows = 0, ell: [number, number] = [1, 1]): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts)
  const n = rows || Math.max(8, pts.length * 6)
  const frames = curve.computeFrenetFrames(n, false)
  const pos: number[] = [], idx: number[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n, c = curve.getPointAt(t), N = frames.normals[i], B = frames.binormals[i], rr = r(t)
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2, ca = Math.cos(a) * rr * ell[0], sa = Math.sin(a) * rr * ell[1]
      pos.push(c.x + N.x * ca + B.x * sa, c.y + N.y * ca + B.y * sa, c.z + N.z * ca + B.z * sa)
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; idx.push(a, b, a + 1, b, b + 1, a + 1) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g
}
/** 椭球 */
function ell(rx: number, ry: number, rz: number, ws = 18, hs = 12, phiS = 0, phiL = Math.PI * 2, thS = 0, thL = Math.PI) {
  const g = new THREE.SphereGeometry(1, ws, hs, phiS, phiL, thS, thL); g.scale(rx, ry, rz); return g
}
function mesh(g: THREE.BufferGeometry, m: THREE.Material, p?: THREE.Vector3, parent?: THREE.Object3D) {
  const o = new THREE.Mesh(g, m); if (p) o.position.copy(p); o.castShadow = true; o.receiveShadow = true; parent?.add(o); return o
}
function pivot(name: string, p: THREE.Vector3, parent: THREE.Object3D) { const o = new THREE.Group(); o.name = name; o.position.copy(p); parent.add(o); return o }

// ---------- 裙摆：钟形 + 褶皱（每实例一份，阶段 2 形变）----------
export const SKIRT = { top: 1.02, hem: 0.015, folds: 15 }
/** 裙摆半径（y 处、角度 a；a=0 指向 +Z 正面） */
export function skirtR(y: number, a: number) {
  const t = 1 - (y - SKIRT.hem) / (SKIRT.top - SKIRT.hem) // 0 腰 → 1 下摆
  const base = t < 0.12 ? lerp(0.135, 0.205, sstep(0, 0.12, t)) : lerp(0.205, 0.43, Math.pow((t - 0.12) / 0.88, 1.25))
  const fold = Math.sin(a * SKIRT.folds + Math.sin(a * 3) * 0.6) * 0.03 * sstep(0.15, 1, t) * (0.8 + 0.2 * Math.sin(a * 5 + 1))
  const back = 1 + 0.08 * sstep(0.3, 1, t) * Math.max(0, -Math.cos(a)) // 后摆略大（拖尾）
  return base * back + fold
}
const SKIRT_ZK = 0.86 // 前后略扁
function skirtGeom(rows = 30, seg = 72) {
  const pos: number[] = [], idx: number[] = []
  for (let i = 0; i <= rows; i++) {
    const y = lerp(SKIRT.top, SKIRT.hem, i / rows)
    for (let j = 0; j <= seg; j++) { const a = (j / seg) * Math.PI * 2, r = skirtR(y, a); pos.push(Math.sin(a) * r, y, Math.cos(a) * r * SKIRT_ZK) }
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; idx.push(a, a + 1, b, b, a + 1, b + 1) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals()
  g.userData.rest = Float32Array.from(pos); g.userData.grid = { rows, seg }
  return g
}
/** 围裙：贴在裙摆正面 ±A 弧度、外扩 1.4 cm；下摆略短于裙 */
const APRON = { a: 0.95, top: 1.0, hem: 0.07 }
function apronGeom(rows = 24, seg = 26) {
  const pos: number[] = [], idx: number[] = []
  for (let i = 0; i <= rows; i++) {
    const v = i / rows, y = lerp(APRON.top, APRON.hem, v)
    const A = APRON.a * lerp(0.62, 1, sstep(0, 0.5, v))
    for (let j = 0; j <= seg; j++) {
      const a = lerp(-A, A, j / seg), r = skirtR(y, a) * 0.92 + skirtR(y, 0) * 0.08 + 0.014 // 围裙比裙子平，盖住褶皱
      pos.push(Math.sin(a) * r, y, Math.cos(a) * r * SKIRT_ZK + 0.006)
    }
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; idx.push(a, a + 1, b, b, a + 1, b + 1) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals()
  g.userData.rest = Float32Array.from(pos)
  return g
}

export interface MaidArm { shoulder: THREE.Group; elbow: THREE.Group; wrist: THREE.Group; side: number }
export interface MaidRig {
  root: THREE.Group; hips: THREE.Group; chest: THREE.Group; neck: THREE.Group; head: THREE.Group
  eyeL: THREE.Group; eyeR: THREE.Group; hookL: THREE.Group; hookR: THREE.Group; mandL: THREE.Group; mandR: THREE.Group; antL: THREE.Group; antR: THREE.Group
  armL: MaidArm; armR: MaidArm; skirt: THREE.Mesh; apron: THREE.Mesh
  shoeL: THREE.Mesh; shoeR: THREE.Mesh; broom: THREE.Group; rag: THREE.Mesh; item: THREE.Mesh
}

function buildHand(side: number, parent: THREE.Object3D) {
  // 手腕原点，手指朝 -Y（垂手）；掌心朝身体内侧（-side x）
  const parts: THREE.BufferGeometry[] = []
  const palm = new THREE.BoxGeometry(0.026, 0.085, 0.07, 1, 2, 2); palm.translate(0, -0.05, 0); parts.push(palm)
  for (let k = 0; k < 4; k++) {
    const z = lerp(-0.026, 0.028, k / 3), len = [0.062, 0.078, 0.082, 0.07][k]
    const f = tube([V(0, -0.088, z), V(side * -0.006, -0.088 - len * 0.55, z), V(side * -0.016, -0.088 - len, z * 0.95)], (t) => 0.0085 - t * 0.0022, 8, 8)
    parts.push(f)
  }
  parts.push(tube([V(side * -0.01, -0.03, 0.036), V(side * -0.02, -0.07, 0.048), V(side * -0.03, -0.1, 0.044)], (t) => 0.0105 - t * 0.003, 8, 8))
  const g = mergeGeometries(parts.map((x) => { const n = x.index ? x.toNonIndexed() : x; n.deleteAttribute('uv'); n.deleteAttribute('normal'); return n }))!; g.computeVertexNormals()
  return mesh(g, M.fleshPlain, undefined, parent)
}

function buildArm(side: number, chest: THREE.Group): MaidArm {
  const shoulder = pivot(side > 0 ? 'shoulderL' : 'shoulderR', V(side * 0.165, 0.11, -0.005), chest)
  // 羊腿泡袖：肩头鼓起的大泡（顶部收褶）
  const puff = new THREE.SphereGeometry(1, 26, 18)
  { const p = puff.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = (y + 1) / 2
      const a = Math.atan2(z, x), pleat = 1 + 0.06 * Math.sin(a * 9) * sstep(0.55, 1, t) // 肩头抽褶
      const r = (0.105 + 0.035 * Math.sin(t * Math.PI)) * pleat * (t > 0.82 ? lerp(1, 0.6, (t - 0.82) / 0.18) : 1)
      p.setXYZ(i, x * r * 1.05, -0.17 + y * 0.165, z * r)
    } puff.computeVertexNormals() }
  mesh(puff, M.dress, V(side * 0.035, 0, 0), shoulder)
  mesh(tube([V(side * 0.03, -0.02, 0), V(side * 0.03, -0.2, 0), V(side * 0.025, -0.32, 0)], () => 0.05, 12, 8), M.dress, undefined, shoulder) // 上臂芯（泡袖里）
  const elbow = pivot('elbow', V(side * 0.025, -0.33, 0), shoulder)
  // 小臂：紧袖，越往手腕越细
  mesh(tube([V(0, 0.02, 0), V(0, -0.12, 0.005), V(0, -0.24, 0.008)], (t) => lerp(0.047, 0.036, t), 14, 10), M.dress, undefined, elbow)
  // 白色大翻袖口（图里很显眼）：外翻的喇叭口
  mesh(new THREE.CylinderGeometry(0.068, 0.046, 0.085, 22, 1, true).translate(0, -0.215, 0.008), M.white, undefined, elbow).material = M.white
  const cuffIn = new THREE.CylinderGeometry(0.064, 0.042, 0.083, 22, 1, true); cuffIn.translate(0, -0.215, 0.008); cuffIn.scale(-1, 1, 1)
  mesh(cuffIn, M.whiteShade, undefined, elbow)
  const wrist = pivot('wrist', V(0, -0.25, 0.008), elbow)
  mesh(tube([V(0, 0.03, 0), V(0, -0.01, 0)], () => 0.027, 10, 3), M.fleshPlain, undefined, wrist)
  buildHand(side, wrist)
  // 默认姿势：手臂自然下垂、略向前
  shoulder.rotation.set(-0.12, 0, side * 0.06); elbow.rotation.set(-0.35, 0, 0)
  return { shoulder, elbow, wrist, side }
}

export function buildMaidMesh(): THREE.Group {
  const face = new THREE.Group(); face.name = 'maid'; face.rotation.y = Math.PI / 2; face.userData.facesZ = 1
  const root = pivot('root', V(0, 0, 0), face)
  root.scale.setScalar(1.04) // 整体 ≈1.93 m
  const hips = pivot('hips', V(0, 1.0, 0), root)
  // 裙 + 围裙 + 鞋尖（裙摆挂 root，跟随髋的扭动由阶段 2 的形变处理）
  const skirt = mesh(skirtGeom(), M.dress, undefined, root); skirt.name = 'skirt'
  ;(skirt.material as THREE.Material) // 双面以免下摆掀起时看见背面空洞
  skirt.material = (M.dress as THREE.Material).clone(); (skirt.material as THREE.Material).side = THREE.DoubleSide
  const apron = mesh(apronGeom(), M.white, undefined, root); apron.name = 'apron'
  apron.material = (M.white as THREE.Material).clone(); (apron.material as THREE.Material).side = THREE.DoubleSide
  // 围裙腰带 + 背后蝴蝶结
  mesh(new THREE.TorusGeometry(0.142, 0.012, 6, 40).rotateX(Math.PI / 2).scale(1, 1, SKIRT_ZK), M.white, V(0, 1.005, 0), root)
  const bow = new THREE.Group(); bow.position.set(0, 1.0, -0.13); root.add(bow)
  for (const s of [-1, 1]) {
    mesh(ell(0.055, 0.032, 0.012), M.white, V(s * 0.05, 0.005, -0.006), bow).rotation.z = s * 0.25
    mesh(tube([V(s * 0.012, -0.01, -0.004), V(s * 0.03, -0.12, -0.02), V(s * 0.05, -0.27, -0.035)], () => 0.004, 4, 10, [5, 1]), M.white, undefined, bow)
  }
  mesh(ell(0.016, 0.02, 0.012), M.white, V(0, 0, -0.01), bow)
  const shoes: THREE.Mesh[] = []
  for (const s of [1, -1]) { const shoe = mesh(ell(0.04, 0.03, 0.07, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.shoe, V(s * 0.085, 0.002, 0.25), root); shoe.scale.y = 0.9; shoe.name = s > 0 ? 'shoeL' : 'shoeR'; shoes.push(shoe) }
  // 上身（挂 hips）：紧身胸衣，前后扁
  const chest = pivot('chest', V(0, 0.28, 0), hips)
  const torsoPts: [number, number][] = [[0.122, -0.29], [0.13, -0.2], [0.152, -0.06], [0.165, 0.04], [0.16, 0.11], [0.125, 0.165], [0.06, 0.2], [0.03, 0.215]]
  const torso = new THREE.LatheGeometry(torsoPts.map(([r, y]) => new THREE.Vector2(r, y)), 36); torso.scale(1, 1, 0.68)
  mesh(torso, M.dress, undefined, chest)
  // 围裙胸片 + 背带（越肩到背后交叉）
  const bibW = (y: number) => lerp(0.085, 0.07, (y + 0.28) / 0.38)
  { const pos: number[] = [], idx: number[] = []; const rows = 10, seg = 10
    for (let i = 0; i <= rows; i++) { const y = lerp(-0.29, 0.09, i / rows); const w = bibW(y)
      for (let j = 0; j <= seg; j++) { const x = lerp(-w, w, j / seg); const r = torsoR(y); pos.push(x, y, Math.sqrt(Math.max(0, r * r - x * x)) * 0.68 + 0.006) } }
    for (let i = 0; i < rows; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; idx.push(a, a + 1, b, b, a + 1, b + 1) }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); mesh(g, M.white, undefined, chest) }
  for (const s of [-1, 1]) mesh(tube([V(s * 0.07, 0.09, 0.085), V(s * 0.1, 0.16, 0.05), V(s * 0.1, 0.17, -0.02), V(s * 0.08, 0.09, -0.09), V(-s * 0.03, -0.2, -0.095)], () => 0.0035, 4, 24, [6, 1]), M.white, undefined, chest)
  // 白色翼领：颈部立领 + 胸前两片尖角下翻
  mesh(new THREE.CylinderGeometry(0.045, 0.058, 0.05, 24, 1, true).translate(0, 0.225, 0), M.white, undefined, chest)
  for (const s of [-1, 1]) {
    const w = new THREE.BufferGeometry()
    const P = [V(s * 0.01, 0.222, 0.052), V(s * 0.075, 0.212, 0.03), V(s * 0.022, 0.09, 0.098)]
    w.setAttribute('position', new THREE.Float32BufferAttribute(P.flatMap((v) => [v.x, v.y, v.z]), 3)); w.setIndex(s > 0 ? [0, 2, 1] : [0, 1, 2]); w.computeVertexNormals()
    const wing = mesh(w, (M.white as THREE.Material).clone(), undefined, chest); (wing.material as THREE.Material).side = THREE.DoubleSide
  }
  const armL = buildArm(1, chest), armR = buildArm(-1, chest)
  // 颈：细长（螳螂前胸），从领口里伸出，略前倾
  const neck = pivot('neck', V(0, 0.21, 0.005), chest)
  mesh(tube([V(0, -0.02, 0), V(0, 0.06, 0.006), V(0, 0.13, 0.02), V(0, 0.17, 0.04)], (t) => lerp(0.035, 0.03, t), 14, 10), M.fleshPlain, undefined, neck)
  neck.rotation.x = 0.1
  // 颈接在头部背面中偏下处：head 枢轴在颈端，头模型整体前移、下移，下巴垂在颈端前下方
  const head = pivot('head', V(0, 0.17, 0.04), neck)
  head.rotation.x = 0.06 // 微微低头（附图的神情）
  const headModel = pivot('headModel', V(0, -0.075, 0.085), head)
  const hp = buildMaidHead(headModel, { white: M.white, ribbon: M.ribbon })
  // 手持道具（阶段 2）：扫帚挂 root、每帧由动画摆到右手→地面；抹布、捡起的小物挂右腕
  const wood = litMaterial({ color: '#4a2f1e', roughness: 0.7 })
  const broom = new THREE.Group(); broom.name = 'broomHeld'; broom.visible = false; root.add(broom)
  mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.1, 8).translate(0, -0.45, 0), wood, undefined, broom) // 原点在握把上端，-Y 指向地面
  mesh(new THREE.CylinderGeometry(0.03, 0.09, 0.22, 14).translate(0, -1.08, 0), litMaterial({ color: '#b39a5e', roughness: 1 }), undefined, broom)
  const rag = mesh(new THREE.BoxGeometry(0.11, 0.02, 0.09).translate(0, -0.11, 0.01), litMaterial({ color: '#e2d9c6', roughness: 1 }), undefined, armR.wrist); rag.name = 'rag'; rag.visible = false
  const item = mesh(new THREE.BoxGeometry(0.06, 0.07, 0.04).translate(0, -0.12, 0.02), litMaterial({ color: '#7a5a8a', roughness: 0.8 }), undefined, armR.wrist); item.name = 'item'; item.visible = false
  const rig: MaidRig = { root, hips, chest, neck, head, eyeL: hp.eyeL, eyeR: hp.eyeR, hookL: hp.hookL, hookR: hp.hookR, mandL: hp.mandL, mandR: hp.mandR, antL: hp.antL, antR: hp.antR, armL, armR, skirt, apron, shoeL: shoes[0], shoeR: shoes[1], broom, rag, item }
  face.userData.maid = rig
  return face
}
function torsoR(y: number) {
  const P: [number, number][] = [[0.122, -0.29], [0.13, -0.2], [0.152, -0.06], [0.165, 0.04], [0.16, 0.11], [0.125, 0.165]]
  if (y <= P[0][1]) return P[0][0]
  for (let i = 1; i < P.length; i++) if (y <= P[i][1]) { const t = (y - P[i - 1][1]) / (P[i][1] - P[i - 1][1]); return lerp(P[i - 1][0], P[i][0], t) }
  return P[P.length - 1][0]
}

// ---------- 清洁车 ----------
/** 清洁车：细化版见 maidCart.ts（旧版保留为 buildMaidCartMeshV1 作对比） */
export function buildMaidCartMesh(): THREE.Group { return buildMaidCartMeshV2() }
export function buildMaidCartMeshV1(): THREE.Group {
  const g = new THREE.Group(); g.name = 'maidCart'
  const metal = litMaterial({ color: '#5b5650', roughness: 0.45, metalness: 0.6 })
  const brass = litMaterial({ color: '#a68a4a', roughness: 0.35, metalness: 0.7 })
  const wood = litMaterial({ color: '#4a2f1e', roughness: 0.7 })
  const towel = litMaterial({ color: '#f0ece2', roughness: 1 }), towel2 = litMaterial({ color: '#e2d9c6', roughness: 1 })
  const bag = litMaterial({ color: '#3a3b3d', roughness: 0.35 })
  const yellow = litMaterial({ color: '#c9a227', roughness: 0.5 })
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => mesh(new THREE.BoxGeometry(w, h, d), m, V(x, y, z), g)
  // 车长沿 X（1.0 m），宽 Z（0.48 m）；把手在 -X 端（管家站在 -X 推）
  const L = 1.0, W = 0.48
  for (const [x, z] of [[-L / 2, -W / 2], [L / 2, -W / 2], [-L / 2, W / 2], [L / 2, W / 2]]) {
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 8), metal, V(x, 0.58, z), g)
    mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.022, 14).rotateX(Math.PI / 2), litMaterial({ color: '#1c1b1a', roughness: 0.6 }), V(x, 0.045, z), g)
    box(0.03, 0.04, 0.03, metal, x, 0.085, z)
  }
  for (const y of [0.12, 0.5, 0.86]) box(L + 0.03, 0.025, W + 0.03, wood, 0, y, 0)
  box(L + 0.03, 0.018, W + 0.03, wood, 0, 1.085, 0) // 顶板
  // 推把手
  mesh(new THREE.CylinderGeometry(0.014, 0.014, W, 10).rotateX(Math.PI / 2), brass, V(-L / 2 - 0.08, 0.98, 0), g)
  for (const z of [-W / 2, W / 2]) mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.09, 8).rotateZ(Math.PI / 2), brass, V(-L / 2 - 0.04, 0.98, z), g)
  // 毛巾：中层两摞叠好的毛巾
  for (const [x, n] of [[0.18, 5], [0.38, 4]] as const) for (let i = 0; i < n; i++) { const t = box(0.26, 0.05, 0.36, i % 2 ? towel2 : towel, x + (i % 2) * 0.006, 0.54 + i * 0.05, 0); t.rotation.y = (i % 3 - 1) * 0.03 }
  // 下层：水桶 + 拖把、清洁剂瓶
  mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.24, 20, 1, true), yellow, V(0.25, 0.26, 0), g).material = yellow
  mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.01, 20), litMaterial({ color: '#6a7a6a', roughness: 0.2 }), V(0.25, 0.32, 0), g)
  mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.25, 8), wood, V(0.33, 0.86, -0.08), g).rotation.z = -0.1
  for (const [x, c] of [[-0.1, '#3d7a8a'], [-0.03, '#c7c2b0'], [0.04, '#8a3d3d']] as const) { mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 12), litMaterial({ color: c, roughness: 0.4 }), V(x, 0.215, 0.12), g); mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.04, 8), litMaterial({ color: '#eeeeee', roughness: 0.4 }), V(x, 0.315, 0.12), g) }
  // 扫帚：斜插在车侧
  const broom = new THREE.Group(); broom.position.set(-0.3, 0.6, W / 2 + 0.03); broom.rotation.x = -0.08; broom.rotation.z = 0.05; g.add(broom)
  mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.1, 8), wood, V(0, 0.15, 0), broom)
  mesh(new THREE.CylinderGeometry(0.03, 0.09, 0.22, 14), litMaterial({ color: '#b39a5e', roughness: 1 }), V(0, -0.47, 0), broom)
  // 垃圾袋：挂在 +X 端的深灰塑料袋（鼓胀不规则）
  { const sg = new THREE.SphereGeometry(1, 20, 14); const p = sg.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + 0.08 * Math.sin(x * 9 + y * 5) * Math.cos(z * 7); p.setXYZ(i, x * 0.17 * k, y * 0.3 * (y < 0 ? 1 : 0.9), z * 0.2 * k) } sg.computeVertexNormals()
    mesh(sg, bag, V(L / 2 + 0.15, 0.55, 0), g) }
  box(0.02, 0.3, W, metal, L / 2 + 0.01, 0.9, 0)
  // 顶层：失物招领箱（噪点纸盒）+ 两个小噪点盒 + 铜铃
  const nt = boxNoise()
  const nm = litMaterial(nt ? { color: '#ffffff', map: nt, roughness: 0.9 } : { color: '#8a6a5a', roughness: 0.9 })
  const crate = box(0.42, 0.24, 0.34, wood, -0.2, 1.215, 0)
  crate.name = 'lostBox'
  const lt = lostLabel(); if (lt) mesh(new THREE.PlaneGeometry(0.2, 0.075), litMaterial({ color: '#ffffff', map: lt }), V(-0.2, 1.22, 0.172), g)
  box(0.38, 0.02, 0.3, litMaterial({ color: '#2a1a10', roughness: 1 }), -0.2, 1.33, 0)
  for (const [x, y, z, s] of [[-0.28, 1.36, -0.05, 0.11], [-0.12, 1.37, 0.06, 0.13], [0.22, 1.16, -0.05, 0.12]] as const) { const b = box(s, s * 1.2, s * 0.6, nm, x, y, z); b.rotation.y = x * 2 }
  mesh(new THREE.SphereGeometry(0.035, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), brass, V(0.35, 1.095, 0.12), g)
  g.userData.cart = { handleX: -L / 2 - 0.08, handleY: 0.98, length: L, width: W }
  return g
}

/** 三角形统计（验收/预览用） */
export function maidTris(o: THREE.Object3D) { let t = 0, n = 0; o.traverse((m) => { const x = m as THREE.Mesh; if (x.isMesh) { n++; const g = x.geometry; t += (g.index ? g.index.count : g.attributes.position.count) / 3 } }); return { tris: Math.round(t), meshes: n } }
