import {disposeL8Tree} from './l8ModelResources'
// 迷彩爬行者（Entity 31）重制模型：方案 A「四臂潜伏者」（ZAN 2026-10-21 选定）。
// 依据中文维基 entity-31：外观怪异的类人形生物，灰褐色，四条手臂；巨大但失明的白色眼睛；皮肤非常干燥坚硬，
// 一般为灰色或棕色，有些个体长毛；嘴上有类似昆虫颚的结构；能改变外部纹理融入墙壁、地板与天花板。
// L8 正文：它会用全部四条手臂抓起巨石狠狠砸向地面。
// 造型：佝偻的双足人形。上一对手臂粗长有力（举石/砸地/扑抓），下一对略细，用来撑地爬行；
// 头颅偏大，两只乳白色的盲眼几乎占满上半张脸，没有鼻子，只有两道鼻缝；口部是左右一对弯钩状的大颚 + 一对小颚须。
// 皮肤：龟裂的干硬皮板（程序化贴图 + 顶点色），seed 为奇数时肩背和后脑长一层硬鬃毛。
// 伪装：所有材质都接入同一个 uCamo 统一量（0 原色 → 1 完全伪装）。伪装时按世界坐标做三平面岩石采样，
// 只在轮廓边缘留一圈很淡的暗边，正好对应维基「墙上奇怪的类人形特征」。
// 骨架：root（骨盆）→ waist（腰弯）→ 躯干/头/四臂；root → 双腿。关节组旋转为 0 时即伏行站姿。模型正面 +X。
import * as THREE from 'three'
import { rng, merge, V, gauss, sstep, cap, ell, sweep, limbSeg, canvasTex as sourceCanvasTex } from './houndMesh'
import type { RF } from './houndMesh'

// ---------- 程序化贴图（共享缓存） ----------
let TEX: { skin: THREE.Texture | null; rock: THREE.Texture | null; chitin: THREE.Texture | null } | null = null
const tile = (f: (ox: number, oy: number) => void) => { for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) f(ox, oy) }
function crackNet(c: CanvasRenderingContext2D, R: () => number, n: number, col: string, lw: number, step: number) {
  for (let i = 0; i < n; i++) {
    let x = R() * 256, y = R() * 256, a = R() * Math.PI * 2
    const pts: [number, number][] = [[x, y]]
    for (let k = 0; k < 7; k++) { a += (R() - 0.5) * 1.5; x += Math.cos(a) * step; y += Math.sin(a) * step; pts.push([x, y]) }
    const w = lw * (0.6 + R() * 0.8)
    tile((ox, oy) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); pts.forEach(([px, py], k) => k ? c.lineTo(px + ox, py + oy) : c.moveTo(px + ox, py + oy)); c.stroke() })
  }
}
export function* prepareCamoTextures(): Generator<void, NonNullable<typeof TEX>, unknown>  {
  if (TEX) return TEX
  // 皮肤：干裂的灰褐色硬皮——多边形皮板、深色裂缝、板边发白的角质、尘土斑点
  const skin = canvasTex(256, 256, (c, R) => {
    c.fillStyle = '#9d9585'; c.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 120; i++) {
      const x = R() * 256, y = R() * 256, r = 7 + R() * 18, tone = R()
      const col = tone < 0.4 ? 'rgba(112,100,84,0.45)' : tone < 0.75 ? 'rgba(150,140,122,0.35)' : 'rgba(96,90,82,0.4)'
      const pts: [number, number][] = []
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + R() * 0.5, rr = r * (0.7 + R() * 0.45); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]) }
      tile((ox, oy) => { c.fillStyle = col; c.beginPath(); pts.forEach(([px, py], k) => k ? c.lineTo(x + ox + px, y + oy + py) : c.moveTo(x + ox + px, y + oy + py)); c.closePath(); c.fill() })
    }
    crackNet(c, R, 70, 'rgba(40,34,28,0.7)', 1.3, 8)
    crackNet(c, R, 40, 'rgba(198,190,170,0.25)', 0.8, 6) // 裂缝边翘起的白色角质
    for (let i = 0; i < 220; i++) { const x = R() * 256, y = R() * 256, r = 0.6 + R() * 1.6; tile((ox, oy) => { c.fillStyle = 'rgba(60,52,42,0.35)'; c.fillRect(x + ox, y + oy, r, r) }) }
    const img = c.getImageData(0, 0, 256, 256), d = img.data
    for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n }
    c.putImageData(img, 0, 0)
  }, true)
  yield;
  // 伪装岩面：L8 洞壁的冷灰褐石灰岩（与洞壁色调接近），斑块 + 层理 + 细裂
  const rock = canvasTex(256, 256, (c, R) => {
    c.fillStyle = '#5f5a52'; c.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 260; i++) {
      const x = R() * 256, y = R() * 256, rx = 4 + R() * 22, ry = rx * (0.4 + R() * 0.5), g = 70 + R() * 40
      const col = `rgba(${g},${g * 0.95},${g * 0.86},0.5)`, rot = R() * 0.6
      tile((ox, oy) => { c.fillStyle = col; c.beginPath(); c.ellipse(x + ox, y + oy, rx, ry, rot, 0, Math.PI * 2); c.fill() })
    }
    for (let y = 0; y < 256; y += 9 + R() * 14) { const a = 0.08 + R() * 0.1; c.fillStyle = `rgba(30,28,24,${a})`; c.fillRect(0, y, 256, 1 + R() * 2) } // 层理
    crackNet(c, R, 40, 'rgba(28,26,22,0.55)', 1, 9)
    const img = c.getImageData(0, 0, 256, 256), d = img.data
    for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 26; d[i] += n; d[i + 1] += n; d[i + 2] += n }
    c.putImageData(img, 0, 0)
  }, true)
  yield;
  // 颚：深褐发黑的几丁质，纵向细纹
  const chitin = canvasTex(128, 128, (c, R) => {
    c.fillStyle = '#3a3027'; c.fillRect(0, 0, 128, 128)
    for (let i = 0; i < 60; i++) { const x = R() * 128; c.fillStyle = `rgba(${R() < 0.5 ? '20,16,12' : '90,76,60'},0.35)`; c.fillRect(x, 0, 0.8 + R() * 1.5, 128) }
  }, true)
  yield;
  TEX = { skin, rock, chitin }
  yield;
  return TEX
}

// ---------- 伪装着色：所有材质共享一组统一量 ----------
export interface CamoUniforms { uCamo: { value: number }; uRock: { value: THREE.Texture | null }; uRockScale: { value: number }; uRockTint: { value: THREE.Color } }
function camoify<M extends THREE.Material>(m: M, u: CamoUniforms): M {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCw;\nvarying vec3 vCn;\nvarying float vRim;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCw = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvCn = normalize(mat3(modelMatrix) * normal);\nvRim = 1.0 - abs(normalize(normalMatrix * normal).z);')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCamo;\nuniform sampler2D uRock;\nuniform float uRockScale;\nuniform vec3 uRockTint;\nvarying vec3 vCw;\nvarying vec3 vCn;\nvarying float vRim;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      if (uCamo > 0.001) {
        vec3 bw = pow(abs(vCn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        vec3 rk = texture2D(uRock, vCw.zy * uRockScale).rgb * bw.x + texture2D(uRock, vCw.xz * uRockScale).rgb * bw.y + texture2D(uRock, vCw.xy * uRockScale).rgb * bw.z;
        rk *= uRockTint * (1.0 - 0.32 * smoothstep(0.55, 0.98, vRim));
        diffuseColor.rgb = mix(diffuseColor.rgb, rk, uCamo);
      }`)
      // 伪装时压掉高光/自发光，否则盲眼会「亮」出来
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 1.0 - uCamo;')
    if (sh.fragmentShader.includes('#include <specularmap_fragment>')) sh.fragmentShader = sh.fragmentShader.replace('#include <specularmap_fragment>', '#include <specularmap_fragment>\nspecularStrength *= 1.0 - uCamo * 0.95;')
  }
  m.customProgramCacheKey = () => 'camo31'
  return m
}

const jointBall = (r: number) => { const g = new THREE.SphereGeometry(r, 10, 8); g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(0.84), 3)); return g }
/** 一段肢体：pivot 组位于关节处（父空间 at），网格从原点指向 to（局部坐标） */
function seg(parent: THREE.Object3D, at: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, mat: THREE.Material, o: { bulge?: number; bulgeAt?: number; mid?: THREE.Vector3; flat?: number } = {}) {
  const g = new THREE.Group(); g.position.copy(at); parent.add(g)
  const pts = o.mid ? [V(0, 0, 0), o.mid, to] : [V(0, 0, 0), to.clone().multiplyScalar(0.5), to]
  const b = o.bulge ?? 0.2, ba = o.bulgeAt ?? 0.3, fl = o.flat ?? 1
  // 皮板质感：沿管体加一点低频起伏（干硬皮肤不是光滑的）
  const tube = sweep(pts.map((p) => p.clone()), (t, d, cs, sn) => (r0 + (r1 - r0) * t) * (1 + b * gauss(t, ba, 0.18) * Math.sin(Math.PI * t)) * ell(cs, sn, 1, fl) * (1 + 0.035 * Math.sin(t * 23 + d.x * 9) * Math.sin(d.z * 11 + t * 7)), { radial: 12, seg: 14, vRep: 1.6, shade: (t) => 0.8 + 0.16 * gauss(t, ba, 0.25) })
  g.add(new THREE.Mesh(merge([tube, jointBall(r0 * Math.min(1, fl + 0.05))]), mat))
  return g
}

export interface CamoArm { upper: boolean; side: number; j: THREE.Group[] }
export interface CamoLeg { side: number; j: THREE.Group[] }
export interface CamoRig {
  root: THREE.Group; waist: THREE.Group; chest: THREE.Group; head: THREE.Group
  /** 左右大颚（绕 Y 张合）与颚须 */
  mand: THREE.Group[]; palps: THREE.Group[]
  arms: CamoArm[]; legs: CamoLeg[]
  /** 上臂两只手的握点（举石时巨石放在两点之间） */
  grips: THREE.Object3D[]
  camo: CamoUniforms
  hairy: boolean
}

// 骨盆在 PELVIS；躯干脊线（骨盆→颈根）佝偻前倾
const PELVIS = V(0, 0.9, 0)
const SPINE = [V(-0.02, 0.86, 0), V(0.0, 0.99, 0), V(0.05, 1.13, 0), V(0.13, 1.27, 0), V(0.23, 1.37, 0), V(0.3, 1.42, 0)]
const PROF = [[0, 0.12], [0.1, 0.15], [0.28, 0.125], [0.48, 0.16], [0.66, 0.2], [0.82, 0.205], [0.93, 0.15], [1, 0.08]]
const baseR = (t: number) => { for (let i = 1; i < PROF.length; i++) if (t <= PROF[i][0]) { const [t0, r0] = PROF[i - 1], [t1, r1] = PROF[i]; return r0 + (r1 - r0) * sstep(0, 1, (t - t0) / (t1 - t0)) } return 0.08 }
function torsoDetail(t: number, d: THREE.Vector3) {
  const back = Math.max(0, -d.x), side = Math.abs(d.z)
  // 两对肩胛：上肩胛 t≈0.8，下肩胛 t≈0.55（第二对手臂的肩带）
  const blades = 0.04 * gauss(t, 0.8, 0.06) * sstep(0.2, 0.8, back) * sstep(0.1, 0.6, side) + 0.03 * gauss(t, 0.55, 0.05) * sstep(0.2, 0.8, back) * sstep(0.1, 0.6, side)
  const spine = back > 0.93 ? 0.016 * Math.max(0, Math.sin(t * Math.PI * 18)) ** 2 : 0 // 脊突
  const ribs = t > 0.3 && t < 0.62 && side > 0.7 && back < 0.4 ? 0.006 * Math.sin((t - 0.3) * Math.PI * 16) * sstep(0.7, 0.95, side) : 0
  const pec = 0.03 * gauss(t, 0.74, 0.08) * sstep(0.3, 0.9, d.x) * gauss(d.z, 0, 0.6) // 前胸肌
  const shoulderMass = 0.05 * gauss(t, 0.86, 0.06) * sstep(0.5, 0.95, side) // 上臂三角肌位
  const plate = 0.007 * (Math.sin(t * 31 + d.z * 23 + d.x * 7) * Math.sin(d.z * 17 - d.x * 29 + t * 5) + 0.3) // 皮板疙瘩
  return { blades, spine, ribs, pec, shoulderMass, plate }
}
const torsoR: RF = (t, d, cs, sn) => {
  const k = torsoDetail(t, d)
  return baseR(t) * cap(t, 0.07) * ell(cs, sn, 0.72, 1.32) + k.blades + k.spine + k.ribs + k.pec + k.shoulderMass + k.plate
}
function torsoPoint(t: number, a: number) {
  const curve = new THREE.CatmullRomCurve3(SPINE, false, 'centripetal')
  const P = curve.getPointAt(t), T = curve.getTangentAt(t)
  const n1 = new THREE.Vector3().crossVectors(T, Math.abs(T.z) < 0.9 ? V(0, 0, 1) : V(1, 0, 0)).normalize()
  const n2 = new THREE.Vector3().crossVectors(n1, T).normalize()
  const cs = Math.cos(a), sn = Math.sin(a)
  const d = n1.clone().multiplyScalar(cs).addScaledVector(n2, sn)
  return { p: P.addScaledVector(d, torsoR(t, d, cs, sn)), n: d }
}

/** 一束硬鬃：在表面点 p 沿法向 n 撒若干细锥 */
function bristles(out: THREE.BufferGeometry[], p: THREE.Vector3, n: THREE.Vector3, R: () => number, len: number, count: number, lean: THREE.Vector3) {
  for (let i = 0; i < count; i++) {
    const l = len * (0.6 + R() * 0.7)
    const dir = n.clone().multiplyScalar(0.55).add(lean).add(V(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(0.5)).normalize()
    const g = new THREE.ConeGeometry(0.0035 + R() * 0.002, l, 3).translate(0, l / 2, 0)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir))
    const o = V(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(0.03)
    g.translate(p.x + o.x - n.x * 0.004, p.y + o.y - n.y * 0.004, p.z + o.z - n.z * 0.004)
    const col = new Array(g.attributes.position.count * 3).fill(0.55 + R() * 0.3)
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.deleteAttribute('uv')
    out.push(g)
  }
}

/** 手：宽厚手掌 + 三根带钩爪的长指 + 一根对生拇指；朝 +X 伸出，掌心朝 -Y */
function hand(parent: THREE.Group, skinM: THREE.Material, clawM: THREE.Material, s: number, side: number) {
  const parts: THREE.BufferGeometry[] = [], claws: THREE.BufferGeometry[] = []
  parts.push(limbSeg([V(-0.015 * s, 0, 0), V(0.04 * s, -0.012 * s, 0), V(0.085 * s, -0.018 * s, 0)], 0.03 * s, 0.036 * s, 0.05, 0.5, 0.5))
  for (let f = 0; f < 3; f++) {
    const fz = (f - 1) * 0.026 * s, L = [0.12, 0.135, 0.115][f] * s
    const a = V(0.08 * s, -0.02 * s, fz), b = V(0.08 * s + L * 0.5, -0.03 * s, fz * 1.25), c = V(0.08 * s + L, -0.055 * s, fz * 1.45)
    parts.push(limbSeg([a, b, c], 0.014 * s, 0.009 * s, 0.25, 0.35))
    const cl = new THREE.ConeGeometry(0.008 * s, 0.035 * s, 6).translate(0, 0.0175 * s, 0).rotateZ(-Math.PI / 2 - 0.75).translate(c.x, c.y, c.z)
    claws.push(cl)
  }
  const ta = V(0.02 * s, -0.01 * s, side * 0.03 * s), tc = V(0.07 * s, -0.04 * s, side * 0.07 * s)
  parts.push(limbSeg([ta, ta.clone().lerp(tc, 0.5).add(V(0, 0, side * 0.008 * s)), tc], 0.014 * s, 0.009 * s, 0.2, 0.3))
  claws.push(new THREE.ConeGeometry(0.007 * s, 0.028 * s, 6).translate(0, 0.014 * s, 0).rotateZ(-Math.PI / 2 - 0.6).translate(tc.x, tc.y, tc.z))
  parts.push(jointBall(0.03 * s))
  parent.add(new THREE.Mesh(merge(parts), skinM), new THREE.Mesh(merge(claws), clawM))
  const grip = new THREE.Object3D(); grip.position.set(0.1 * s, -0.05 * s, 0); parent.add(grip)
  return grip
}

export function* buildCamoCrawlerJob(seed = 0): Generator<void, THREE.Group, unknown> {
  const grp = new THREE.Group()
 let complete=false
 try {
  grp.userData.entityType = 'camocrawler'
  yield;
  const R = rng(0xca31 + seed * 613)
  yield;
  const tx = textures()
  yield;
  const hairy = seed % 2 === 1
  yield;
  const camo: CamoUniforms = { uCamo: { value: 0 }, uRock: { value: tx.rock }, uRockScale: { value: 1.1 }, uRockTint: { value: new THREE.Color(1, 1, 1) } }
  yield;
  const hue = (R() - 0.5) * 0.06
  yield; // 灰 ↔ 棕 的个体差异
  const skinCol = new THREE.Color('#cfc6b6').offsetHSL(hue, 0, (R() - 0.5) * 0.06)
  yield;
  const skin = camoify(new THREE.MeshLambertMaterial({ color: skinCol, map: tx.skin, vertexColors: true }), camo)
  yield;
  const claw = camoify(new THREE.MeshPhongMaterial({ color: '#4a4036', specular: '#5a5246', shininess: 30, vertexColors: true }), camo)
  yield;
  const chit = camoify(new THREE.MeshPhongMaterial({ color: '#8a7a68', map: tx.chitin, specular: '#6a6050', shininess: 46 }), camo)
  yield;
  const eyeM = camoify(new THREE.MeshPhongMaterial({ color: '#ecebe2', vertexColors: true, emissive: '#1c1c1a', specular: '#6a6a64', shininess: 18 }), camo)
  yield;
  const mouthM = camoify(new THREE.MeshBasicMaterial({ color: '#14100c' }), camo)
  yield;
  const hairM = camoify(new THREE.MeshLambertMaterial({ color: '#5a4c3c', vertexColors: true }), camo)
  yield;

  const root = new THREE.Group();
  yield; root.position.copy(PELVIS);
  yield; grp.add(root)
  yield;
  const waist = new THREE.Group();
  yield; root.add(waist)
  yield;
  const chest = new THREE.Group();
  yield; chest.position.copy(PELVIS).multiplyScalar(-1);
  yield; waist.add(chest)
  yield; // 子级用模型坐标
  const hips = new THREE.Group();
  yield; hips.position.copy(PELVIS).multiplyScalar(-1);
  yield; root.add(hips)
  yield;
  const hair: THREE.BufferGeometry[] = []
  yield;

  // ---------- 躯干 ----------
  {
    const torso = sweep(SPINE, torsoR, {
      radial: 26, seg: 44, vRep: 2.6, uRep: 2,
      shade: (t, d) => {
        const k = torsoDetail(t, d)
        return Math.min(1.08, 0.86 + k.blades * 3 + k.spine * 5 + k.pec * 2 + k.plate * 5 - (d.x > 0.4 && t < 0.45 ? 0.08 : 0) - (k.ribs < 0 ? 0.08 : 0))
      },
    })
    const neck = sweep([V(0.26, 1.4, 0), V(0.32, 1.45, 0), V(0.38, 1.49, 0)], (t, _d, cs, sn) => (0.085 - t * 0.012) * cap(t, 0.15) * ell(cs, sn, 1, 1.15), { radial: 14, seg: 8, shade: () => 0.84 })
    chest.add(new THREE.Mesh(merge([torso, neck]), skin))
    if (hairy) for (let i = 0; i < 60; i++) {
      const t = 0.6 + R() * 0.38, a = Math.PI + (R() - 0.5) * 2.2
      const { p, n } = torsoPoint(t, a)
      bristles(hair, p, n, R, 0.05, 3, V(-0.3, 0.2, 0))
    
 yield;
 }
  }
  yield;

  // ---------- 头：大颅、乳白盲眼、无鼻、昆虫式双颚 ----------
  const head = new THREE.Group();
  yield; head.position.set(0.42, 1.52, 0);
  yield; chest.add(head)
  yield;
  const eyeDirs = [V(0.62, 0.2, 0.5).normalize(), V(0.62, 0.2, -0.5).normalize()]
  yield;
  const carve = (d: THREE.Vector3) => {
    let x = d.x * 0.12, y = d.y * 0.13, z = d.z * 0.112
    const front = sstep(0.2, 0.85, d.x)
    x += 0.035 * sstep(0, -1, d.x) * sstep(-0.3, 0.6, d.y) // 偏长的后颅
    y += 0.012 * sstep(0.5, 1, d.y) * sstep(-0.4, 0.4, d.x) // 高颅顶
    let eye = 0
    for (const s of eyeDirs) { const k = gauss(d.distanceTo(s), 0, 0.3); eye = Math.max(eye, k); x += 0.012 * k } // 眼球把眼眶顶出来
    const brow = gauss(d.y, 0.48, 0.08) * front
    x += 0.012 * brow
    // 下半张脸收窄成颚基：口部向前略凸、两侧内收
    const low = sstep(0.0, -0.6, d.y)
    z *= 1 - 0.32 * low * sstep(-0.2, 0.6, d.x)
    x += 0.022 * low * front
    let nos = 0
    for (const sz of [-0.07, 0.07]) { const k = gauss(d.z, sz, 0.03) * gauss(d.y, -0.08, 0.05) * front; x -= 0.009 * k; nos = Math.max(nos, k) }
    const mouthK = gauss(d.y, -0.55, 0.12) * gauss(d.z, 0, 0.18) * front
    x -= 0.03 * mouthK
    const cheek = gauss(d.y, -0.3, 0.12) * gauss(Math.abs(d.z), 0.6, 0.18)
    return { p: V(x, y, z), eye, nos, brow, mouthK, cheek, low }
  }
  yield;
  {
    const g = new THREE.SphereGeometry(1, 40, 28)
    const pa = g.attributes.position as THREE.BufferAttribute, col: number[] = [], d = new THREE.Vector3()
    for (let i = 0; i < pa.count; i++) {
      d.fromBufferAttribute(pa, i).normalize()
      const k = carve(d)
      const plate = 1 + 0.03 * Math.sin(d.x * 19 + d.y * 7) * Math.sin(d.z * 17 - d.y * 11)
      pa.setXYZ(i, k.p.x * plate, k.p.y * plate, k.p.z * plate)
      const c = Math.max(0.15, 0.88 - k.nos * 0.6 - k.mouthK * 0.7 - gauss(k.eye, 0.55, 0.12) * 0.25 + k.brow * 0.06 - k.cheek * 0.1)
      col.push(c, c * 0.97, c * 0.93)
    
 if((i&63)===63)yield;
 }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals()
    head.add(new THREE.Mesh(g, skin))
    // 盲眼：大而外凸、乳白浑浊，没有瞳孔；中心只隐约一圈灰影，边缘泛黄
    const eyes: THREE.BufferGeometry[] = [], lids: THREE.BufferGeometry[] = []
    for (const s of eyeDirs) {
      const q = carve(s).p, er = 0.043
      const eg = new THREE.SphereGeometry(er, 22, 16)
      const pp = eg.attributes.position as THREE.BufferAttribute, ec: number[] = [], v = new THREE.Vector3()
      for (let i = 0; i < pp.count; i++) {
        v.fromBufferAttribute(pp, i).normalize()
        const fwd = v.dot(s)
        const ghost = gauss(fwd, 0.93, 0.04) * 0.12 // 隐约的灰白虹膜残影
        const edge = sstep(0.6, 0.1, fwd) * 0.14
        ec.push(1 - ghost - edge * 0.6, 1 - ghost - edge * 0.7, 0.97 - ghost - edge)
      
 if((i&63)===63)yield;
 }
      eg.setAttribute('color', new THREE.Float32BufferAttribute(ec, 3))
      eg.scale(1, 0.86, 1)
      eg.translate(q.x - s.x * er * 0.5, q.y - s.y * er * 0.5, q.z - s.z * er * 0.5)
      eyes.push(eg)
      // 眼睑：一圈干裂的厚皮褶把盲眼半包住，上睑垂得更低
      const lid = new THREE.TorusGeometry(er * 0.96, er * 0.17, 8, 20, Math.PI * 1.15).rotateZ(-Math.PI * 0.075).scale(1, 0.8, 1.1)
      lid.lookAt(s); lid.translate(q.x - s.x * er * 0.08, q.y - s.y * er * 0.08 + er * 0.1, q.z - s.z * er * 0.08)
      lid.setAttribute('color', new THREE.Float32BufferAttribute(new Array(lid.attributes.position.count * 3).fill(0.72), 3))
      lids.push(lid)
    }
    const em = new THREE.Mesh(merge(eyes), eyeM); em.userData.face = 1; head.add(em)
    head.add(new THREE.Mesh(merge(lids), skin))
    // 口腔：颚之间的竖向黑缝
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10).scale(0.012, 0.03, 0.009).translate(0.112, -0.09, 0), mouthM); mouth.userData.face = 1; head.add(mouth)
    if (hairy) for (let i = 0; i < 26; i++) {
      const d = V(-0.2 - R() * 0.8, 0.1 + R() * 0.8, (R() - 0.5) * 1.6).normalize()
      const p = carve(d).p
      bristles(hair, p.clone().add(head.position), d, R, 0.04, 2, V(-0.5, 0.1, 0))
    
 yield;
 }
  }
  yield;
  // 大颚：口两侧一对向前、向内弯的钩状颚，内缘带锯齿；铰接点在下颊，绕 Y 张合
  const mand: THREE.Group[] = [], palps: THREE.Group[] = []
  yield;
  for (const side of [-1, 1]) {
    const m = new THREE.Group(); m.position.set(0.075, -0.085, side * 0.045); head.add(m)
    const pts = [V(0, 0, 0), V(0.045, -0.018, side * 0.03), V(0.09, -0.03, side * 0.022), V(0.118, -0.028, side * -0.008)]
    const blade = sweep(pts, (t, _d, cs, sn) => (0.017 - 0.014 * t) * cap(t, 0.06) * ell(cs, sn, 1, 0.62), { radial: 10, seg: 14, vRep: 2, shade: (t) => 0.8 + 0.2 * t })
    const teeth: THREE.BufferGeometry[] = [blade]
    const crv = new THREE.CatmullRomCurve3(pts)
    for (let i = 0; i < 4; i++) {
      const p = crv.getPointAt(0.35 + i * 0.13)
      const tg = new THREE.ConeGeometry(0.0035, 0.012, 4).rotateX(side > 0 ? Math.PI / 2 : -Math.PI / 2).translate(p.x, p.y, p.z - side * 0.006)
      tg.setAttribute('color', new THREE.Float32BufferAttribute(new Array(tg.attributes.position.count * 3).fill(0.7), 3))
      teeth.push(tg)
    
 yield;
 }
    m.add(new THREE.Mesh(merge(teeth.map((g) => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 2).fill(0), 2)); return g })), chit))
    mand.push(m)
    // 颚须：短小、分两节，垂在大颚内侧
    const pl = new THREE.Group(); pl.position.set(0.09, -0.1, side * 0.022); head.add(pl)
    pl.add(new THREE.Mesh(limbSeg([V(0, 0, 0), V(0.018, -0.022, side * 0.004), V(0.03, -0.045, side * 0.002)], 0.006, 0.004, 0.2, 0.4), chit))
    palps.push(pl)
  }
  yield;

  // ---------- 四臂 ----------
  const arms: CamoArm[] = [], grips: THREE.Object3D[] = []
  yield;
  for (const side of [-1, 1]) {
    const z = side
    // 上臂：粗长，肩位在上肩胛外侧；平时肘部向后、前臂垂在身前，长指半握
    {
      const sh = seg(chest, V(0.2, 1.36, z * 0.27), V(0.06, -0.4, z * 0.08), 0.068, 0.05, skin, { bulge: 0.3, bulgeAt: 0.25 })
      const el = seg(sh, V(0.06, -0.4, z * 0.08), V(0.26, -0.24, z * -0.02), 0.05, 0.036, skin, { bulge: 0.3, bulgeAt: 0.22 })
      const wr = new THREE.Group(); wr.position.set(0.26, -0.24, z * -0.02); el.add(wr)
      const hw = new THREE.Group(); hw.rotation.z = -0.9; wr.add(hw)
      grips.push(hand(hw, skin, claw, 1.15, side))
      arms.push({ upper: true, side, j: [sh, el, wr] })
    }
    // 下臂：细一些，从下肩胛伸出，拳背/手掌撑地
    {
      const sh = seg(chest, V(0.1, 1.16, z * 0.22), V(0.12, -0.42, z * 0.1), 0.05, 0.038, skin, { bulge: 0.25, bulgeAt: 0.28 })
      const el = seg(sh, V(0.12, -0.42, z * 0.1), V(0.1, -0.56, z * 0.02), 0.037, 0.028, skin, { bulge: 0.25, bulgeAt: 0.2 })
      const wr = new THREE.Group(); wr.position.set(0.1, -0.56, z * 0.02); el.add(wr)
      const hw = new THREE.Group(); hw.rotation.z = -0.15; hw.position.y = 0.01; wr.add(hw)
      hand(hw, skin, claw, 0.95, side)
      arms.push({ upper: false, side, j: [sh, el, wr] })
    }
  }
  yield;

  // ---------- 双腿：屈膝下蹲，长足、三趾钩爪 ----------
  const legs: CamoLeg[] = []
  yield;
  for (const side of [-1, 1]) {
    const z = side
    const hip = seg(hips, V(0.0, 0.88, z * 0.12), V(0.17, -0.38, z * 0.05), 0.085, 0.058, skin, { bulge: 0.25, bulgeAt: 0.3 })
    const knee = seg(hip, V(0.17, -0.38, z * 0.05), V(-0.13, -0.38, z * 0.0), 0.058, 0.036, skin, { bulge: 0.35, bulgeAt: 0.2 })
    const ank = new THREE.Group(); ank.position.set(-0.13, -0.38, 0); knee.add(ank)
    const foot: THREE.BufferGeometry[] = [limbSeg([V(-0.03, 0.0, 0), V(0.05, -0.05, 0), V(0.13, -0.07, 0)], 0.036, 0.04, 0.05, 0.5, 0.55)]
    const cl: THREE.BufferGeometry[] = []
    for (let f = 0; f < 3; f++) {
      const fz = (f - 1) * 0.03, L = [0.09, 0.11, 0.09][f]
      const a = V(0.12, -0.07, fz), c = V(0.12 + L, -0.085, fz * 1.5)
      foot.push(limbSeg([a, a.clone().lerp(c, 0.5).add(V(0, 0.012, 0)), c], 0.016, 0.011, 0.2, 0.3))
      cl.push(new THREE.ConeGeometry(0.009, 0.03, 6).translate(0, 0.015, 0).rotateZ(-Math.PI / 2 - 0.6).translate(c.x, c.y, c.z))
    
 yield;
 }
    // 后跟一根倒刺状距
    cl.push(new THREE.ConeGeometry(0.008, 0.035, 6).translate(0, 0.0175, 0).rotateZ(Math.PI / 2 + 0.5).translate(-0.04, -0.04, 0))
    ank.add(new THREE.Mesh(merge(foot), skin), new THREE.Mesh(merge(cl), claw))
    legs.push({ side, j: [hip, knee, ank] })
  }
  yield;
  if (hair.length) { const hm = new THREE.Mesh(merge(hair), hairM); chest.add(hm) }
  yield;

  const rig: CamoRig = { root, waist, chest, head, mand, palps, arms, legs, grips, camo, hairy }
  yield;
  grp.userData.camoRig = rig
 complete=true

  yield;
  return grp

 }finally{if(!complete)disposeL8Tree(grp)}
}

/** 巨石：L8 的灰褐石灰岩块，举石/砸地用 */
export function buildCamoBoulder(seed = 0, r = 0.32): THREE.Mesh {
  const R = rng(0xb01d + seed * 7)
  const tx = textures()
  const g = new THREE.IcosahedronGeometry(1, 3)
  const pa = g.attributes.position as THREE.BufferAttribute, d = new THREE.Vector3()
  const knots = Array.from({ length: 9 }, () => ({ d: V(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), k: (R() - 0.5) * 0.5 }))
  for (let i = 0; i < pa.count; i++) {
    d.fromBufferAttribute(pa, i).normalize()
    let s = 1
    for (const k of knots) s += k.k * gauss(d.distanceTo(k.d), 0, 0.45)
    s += 0.04 * Math.sin(d.x * 11 + d.y * 5) * Math.sin(d.z * 9)
    pa.setXYZ(i, d.x * r * s * 1.1, d.y * r * s * 0.85, d.z * r * s)
  }
  g.computeVertexNormals()
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#b4aa9a', map: tx.rock }))
  m.userData.entityType = 'camocrawler-boulder'
  return m
}

/** 伪装程度：0 原色 → 1 完全融入岩面 */
export function setCamo(grp: THREE.Group, k: number) {
  const rig = grp.userData.camoRig as CamoRig | undefined
  if (rig) rig.camo.uCamo.value = Math.min(1, Math.max(0, k))
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3()
/**
 * 静态姿势预设（阶段 1 预览用；阶段 2 动画在此基础上插值）。
 * crawl：0 伏行站姿 → 1 六肢着地低伏爬行；lift：四臂把巨石举过头顶；cling：背贴岩壁、四臂张开（伪装伏击）；
 * mand：大颚张开 0–1；headYaw/headPitch：转头/抬头（盲眼「听」声音时会歪头）。
 */
export function poseCamoCrawler(grp: THREE.Group, o: { crawl?: number; lift?: number; cling?: number; mand?: number; headYaw?: number; headPitch?: number; boulder?: THREE.Object3D } = {}) {
  const rig = grp.userData.camoRig as CamoRig | undefined
  if (!rig) return
  const c = o.crawl ?? 0, L = o.lift ?? 0, w = o.cling ?? 0
  // 整体：爬行时骨盆压低并前俯；举石时挺起上身；贴壁时躯干伸直
  rig.root.rotation.set(0, 0, -c * 1.05 + L * 0.12)
  rig.root.position.set(PELVIS.x - c * 0.05, PELVIS.y - c * 0.36 - L * 0.04 + w * 0.02, 0)
  rig.waist.rotation.set(0, 0, -c * 0.12 + L * 0.42 + w * 0.48)
  rig.head.rotation.set(o.headYaw ?? 0, 0, 0)
  rig.head.rotation.order = 'YZX'
  rig.head.rotation.y = o.headYaw ?? 0
  rig.head.rotation.z = (o.headPitch ?? 0) + c * 0.85 - L * 0.35 - w * 0.25
  const mo = o.mand ?? 0
  rig.mand.forEach((m, i) => { const s = i === 0 ? -1 : 1; m.rotation.set(0, s * (-0.05 + mo * 0.62), -mo * 0.12) })
  rig.palps.forEach((p, i) => { const s = i === 0 ? -1 : 1; p.rotation.set(s * mo * 0.4, 0, mo * 0.3) })
  for (const A of rig.arms) {
    const s = A.side
    if (A.upper) {
      // 举石：肩向上抡到头顶，肘微屈，双手在头顶上方相对
      const sz = L * 2.55 - c * 0.35 + w * 0.6, sx = s * (L * 0.18 - w * 1.05)
      A.j[0].rotation.set(sx, 0, sz)
      A.j[1].rotation.set(s * w * 0.3, 0, -L * 0.95 + c * 0.55 - w * 0.6)
      A.j[2].rotation.set(0, s * L * 0.9, L * 0.3 + w * 0.3)
    } else {
      A.j[0].rotation.set(s * (-w * 1.2), 0, c * 0.55 + w * 0.3 - L * 0.55)
      A.j[1].rotation.set(0, 0, -c * 0.3 - w * 0.5)
      A.j[2].rotation.set(0, 0, c * 0.4 + w * 0.6)
    }
  }
  for (const G of rig.legs) {
    const s = G.side
    G.j[0].rotation.set(s * (-w * 0.45), 0, c * 0.95 - L * 0.12 - w * 0.25)
    G.j[1].rotation.set(0, 0, -c * 0.55 + L * 0.2 + w * 0.5)
    G.j[2].rotation.set(0, 0, c * 0.2 - w * 0.25)
  }
  if (o.boulder) {
    grp.updateMatrixWorld(true)
    rig.grips[0].getWorldPosition(_a); rig.grips[1].getWorldPosition(_b)
    _a.add(_b).multiplyScalar(0.5)
    grp.worldToLocal(_a)
    o.boulder.position.copy(_a).add(V(0, 0.2, 0))
    if (o.boulder.parent !== grp) grp.add(o.boulder)
  }
}

function textures(){if(!TEX){const job=prepareCamoTextures();while(!job.next().done){/* standalone */}}return TEX!}
export function buildCamoCrawlerMesh(seed=0):THREE.Group{const job=buildCamoCrawlerJob(seed);let n=job.next();while(!n.done)n=job.next();return n.value}

const canvasTex:typeof sourceCanvasTex=(...args)=>{const t=sourceCanvasTex(...args);if(t)t.userData.entityShared=true;return t}
