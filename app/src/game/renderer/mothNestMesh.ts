// 死亡飞蛾巢穴道具（Entity 4 重制·第 1 阶段静态建模）。
// 维基：巢穴为 60–100cm 厚的半有机覆层（消化后的生物质 + 植物纤维 + 分泌树脂），以骨骼/硬木/金属碎料为支柱；
// 雌性在墙角/天花板缝隙用肉质上层组织做孵化囊，卵 3–5mm 起步，吸收养分长到 3–5cm，由母亲分层堆叠成柱；
// 门口覆盖肉质突起物（生存指南「警惕蜂巢」）。附图：深褐黑、湿亮的卵粒嵌在橙黄海绵状基质里。
//
//   buildMothEggCluster(seed, count, radius)  孵化囊：贴墙/墙角的海绵基质鼓包 + 实例化卵粒（2 次绘制）
//   buildMothEggPillar(seed, height)          卵柱：树脂芯 + 分层堆叠的卵环（2 次绘制）
//   buildMothNestCoat(seed, w, h, depth)      巢壁覆层：起伏肉质板（局部 +Z 朝外，贴墙用），嵌骨骼/金属碎料（1–2 次绘制）
//   buildMothDoorGrowth(seed, w, h)           门框肉质突起（围着门洞的一圈瘤状增生，局部 +Z 朝外）
//   buildMothGelBall(seed, r)                 猎物被腐蚀液溶成的胶状球（第 3 阶段死亡掉落用）
// 每个道具返回 Group；userData.eggs = 卵粒 InstancedMesh（供第 3 阶段打破单颗卵：setEggHidden）。
// 材质与贴图全部共享缓存；Node（无 document）退化为顶点色。
import * as THREE from 'three'
import { litMaterial, mulberry } from './shared'
import { glossMaterial } from './deathmothMesh'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// ---------------------------------------------------------------------------
// 贴图
// ---------------------------------------------------------------------------
let SPONGE: THREE.CanvasTexture | null | undefined
/** 海绵基质 256²：橙黄底 + 不规则气孔（深色凹点 + 浅色孔缘），可平铺 */
function spongeTex(): THREE.CanvasTexture | null {
  if (SPONGE !== undefined) return SPONGE
  if (typeof document === 'undefined') return (SPONGE = null)
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S
  const g = cv.getContext('2d'); if (!g) return (SPONGE = null)
  const R = mulberry(0x5e01)
  g.fillStyle = '#c9c0b4'; g.fillRect(0, 0, S, S)
  for (let i = 0; i < 900; i++) {
    const x = R() * S, y = R() * S, r = 1 + R() * R() * 7
    for (const ox of [0, S, -S]) for (const oy of [0, S, -S]) {
      g.fillStyle = `rgba(250,244,232,${0.35 + R() * 0.3})`; g.beginPath(); g.ellipse(x + ox + r * 0.25, y + oy - r * 0.25, r * 1.25, r, R() * 3, 0, Math.PI * 2); g.fill()
      g.fillStyle = `rgba(40,22,12,${0.5 + R() * 0.4})`; g.beginPath(); g.ellipse(x + ox, y + oy, r, r * 0.8, R() * 3, 0, Math.PI * 2); g.fill()
    }
  }
  const t = new THREE.CanvasTexture(cv); t.userData.entityShared = true; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping
  return (SPONGE = t)
}
let FLESH: THREE.CanvasTexture | null | undefined
/** 肉质覆层 512²：湿润肉色 + 血管网 + 纤维条纹 + 树脂亮斑，可平铺 */
function fleshTex(): THREE.CanvasTexture | null {
  if (FLESH !== undefined) return FLESH
  if (typeof document === 'undefined') return (FLESH = null)
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S
  const g = cv.getContext('2d'); if (!g) return (FLESH = null)
  const R = mulberry(0x5e02)
  g.fillStyle = '#bdb2a6'; g.fillRect(0, 0, S, S)
  const blot = (x: number, y: number, r: number, c: string) => { for (const ox of [0, S, -S]) for (const oy of [0, S, -S]) { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2) } }
  for (let i = 0; i < 70; i++) blot(R() * S, R() * S, 20 + R() * 60, R() < 0.5 ? 'rgba(90,50,40,0.25)' : 'rgba(240,226,200,0.22)')
  // 纤维条纹（植物纤维）
  for (let i = 0; i < 500; i++) { const x = R() * S, y = R() * S, a = R() * Math.PI, l = 8 + R() * 30; g.strokeStyle = `rgba(${R() < 0.5 ? '230,214,184' : '70,44,30'},${0.12 + R() * 0.2})`; g.lineWidth = 0.6 + R(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke() }
  // 血管网：分叉曲线
  const vein = (x: number, y: number, a: number, w: number, depth: number) => {
    for (let k = 0; k < 14 && w > 0.4; k++) {
      const nx = x + Math.cos(a) * 9, ny = y + Math.sin(a) * 9
      g.strokeStyle = `rgba(70,20,22,${0.35 + w * 0.08})`; g.lineWidth = w
      for (const ox of [0, S, -S]) for (const oy of [0, S, -S]) { g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(nx + ox, ny + oy); g.stroke() }
      x = nx; y = ny; a += (R() - 0.5) * 0.6; w *= 0.93
      if (depth < 3 && R() < 0.18) vein(x, y, a + (R() < 0.5 ? 0.8 : -0.8), w * 0.7, depth + 1)
    }
  }
  for (let i = 0; i < 18; i++) vein(R() * S, R() * S, R() * Math.PI * 2, 2.6, 0)
  // 树脂亮斑
  for (let i = 0; i < 40; i++) blot(R() * S, R() * S, 4 + R() * 10, 'rgba(255,236,170,0.35)')
  const t = new THREE.CanvasTexture(cv); t.userData.entityShared = true; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping
  return (FLESH = t)
}

// ---------------------------------------------------------------------------
// 材质
// ---------------------------------------------------------------------------
interface NestMats { sponge: THREE.Material; egg: THREE.Material; flesh: THREE.Material; resin: THREE.Material; bone: THREE.Material; gel: THREE.Material }
export function mothNestMaterials(): NestMats {
  const st = spongeTex(), ft = fleshTex()
  const sponge = litMaterial({ color: '#ffffff', vertexColors: true, ...(st ? { map: st, bumpMap: st, bumpScale: 2.2 } : {}), roughness: 0.75, envBase: 0.15 })
  const egg = glossMaterial({ roughness: 0.1, envBase: 1.2, shininess: 90, specular: '#d8d0c8', emissive: '#0a0302' })
  const flesh = litMaterial({ color: '#ffffff', vertexColors: true, ...(ft ? { map: ft, bumpMap: ft, bumpScale: 1.6 } : {}), roughness: 0.45, envBase: 0.4 })
  const resin = glossMaterial({ roughness: 0.18, envBase: 0.8, shininess: 60 })
  const bone = litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.8, envBase: 0.1 })
  const gel = glossMaterial({ color: '#c8a04a', transparent: true, opacity: 0.8, roughness: 0.1, envBase: 1.0, shininess: 40, specular: '#806a40' })
  return { sponge, egg, flesh, resin, bone, gel }
}

// ---------------------------------------------------------------------------
// 工具：值噪声 + 位移球
// ---------------------------------------------------------------------------
function noise3(seed: number) {
  const h = (x: number, y: number, z: number) => { let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ seed; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296 }
  const s = (t: number) => t * t * (3 - 2 * t)
  return (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = s(x - xi), yf = s(y - yi), zf = s(z - zi)
    const L = (a: number, b: number, t: number) => a + (b - a) * t
    return L(L(L(h(xi, yi, zi), h(xi + 1, yi, zi), xf), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), xf), yf),
      L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), xf), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), xf), yf), zf)
  }
}
/** 位移变形 + 顶点色。fn(p, n) 返回 [位移, RGB] */
function deform(geo: THREE.BufferGeometry, fn: (p: THREE.Vector3, n: THREE.Vector3) => [number, [number, number, number]]) {
  const pos = geo.attributes.position as THREE.BufferAttribute, nor = geo.attributes.normal as THREE.BufferAttribute
  const col = new Float32Array(pos.count * 3), p = V(0, 0, 0), n = V(0, 0, 0)
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i)
    const [d, c] = fn(p, n)
    p.addScaledVector(n, d); pos.setXYZ(i, p.x, p.y, p.z); col.set(c, i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.computeVertexNormals()
  return geo
}
const C = (h: string, k = 1): [number, number, number] => { const c = new THREE.Color(h); return [c.r * k, c.g * k, c.b * k] }
const mix3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

const EGG_GEO: Partial<Record<'hi' | 'lo', THREE.BufferGeometry>> = {}
/** 单颗卵：略扁的卵形，表面微起伏（顶点色深褐 → 暗红）。hi=孵化囊（近看），lo=卵柱（数量多） */
function eggGeo(lod: 'hi' | 'lo' = 'hi') {
  const hit = EGG_GEO[lod]; if (hit) return hit
  let g: THREE.BufferGeometry = lod === 'hi' ? new THREE.SphereGeometry(1, 14, 10) : new THREE.SphereGeometry(1, 7, 5); g.scale(1, 0.92, 1.04); g.deleteAttribute('uv'); g = mergeVertices(g); g.computeVertexNormals()
  const nz = noise3(0x5e03)
  return (EGG_GEO[lod] = deform(g, (p, n) => [nz(p.x * 3, p.y * 3, p.z * 3) * 0.06, mix3(C('#1a0a06'), C('#4a1c10'), Math.max(0, n.y) * 0.6 + nz(p.x * 5, p.y * 5, p.z * 5) * 0.3)]))
}
/** 卵粒实例（单个 InstancedMesh）。每颗卵：位置、半径（3–5cm 的成熟卵 / 更小的新卵）、随机朝向、色差 */
function eggInstances(list: { p: THREE.Vector3; r: number }[], R: () => number, lod: 'hi' | 'lo' = 'hi') {
  const m = mothNestMaterials()
  const im = new THREE.InstancedMesh(eggGeo(lod).clone(), m.egg, list.length)
  const q = new THREE.Quaternion(), e = new THREE.Euler(), mat = new THREE.Matrix4(), c = new THREE.Color()
  list.forEach((it, i) => {
    e.set(R() * 6, R() * 6, R() * 6); q.setFromEuler(e)
    mat.compose(it.p, q, V(it.r, it.r, it.r)); im.setMatrixAt(i, mat)
    const k = 0.75 + R() * 0.45; im.setColorAt(i, c.setRGB(k, k * (0.85 + R() * 0.15), k * 0.85))
  })
  im.castShadow = true; im.receiveShadow = true
  im.userData.eggMatrices = list.map((_, i) => { const mm = new THREE.Matrix4(); im.getMatrixAt(i, mm); return mm })
  im.userData.eggCenters = list.map((it) => it.p.clone())
  im.userData.eggRadii = list.map((it) => it.r)
  return im
}
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)
/** 隐藏/恢复单颗卵（第 3 阶段打破卵用） */
export function setEggHidden(im: THREE.InstancedMesh, i: number, hidden: boolean) {
  im.setMatrixAt(i, hidden ? ZERO : (im.userData.eggMatrices as THREE.Matrix4[])[i]); im.instanceMatrix.needsUpdate = true
}

// ---------------------------------------------------------------------------
// 孵化囊
// ---------------------------------------------------------------------------
/**
 * 孵化囊：局部 +Z 朝外、背面贴墙（z=0 平面），中心在原点；墙角用时旋转即可。
 * 海绵基质是半埋的不规则鼓包，卵粒半嵌在表面（附图构图），外缘渐薄融进墙面。
 */
export function buildMothEggCluster(seed = 1, count?: number, radius = 0.32, detail: 'hi' | 'lo' = 'hi'): THREE.Group {
  count ??= Math.max(14, Math.round(radius * radius * 1700))
  const R = mulberry(0x5e10 + seed), nz = noise3(0x5e11 + seed), m = mothNestMaterials()
  const grp = new THREE.Group()
  const geo = new THREE.SphereGeometry(1, detail === 'hi' ? 40 : 24, detail === 'hi' ? 28 : 16, 0, Math.PI * 2, 0, Math.PI / 2)
  geo.rotateX(Math.PI / 2) // 半球 → +Z 朝外
  geo.scale(radius, radius * 0.86, radius * 0.38)
  { // 不规则轮廓：按方位角伸缩，半球不再是正圆；贴图改为平面投影（避免极点拉伸）
    const pa = geo.attributes.position as THREE.BufferAttribute, ua = geo.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), a = Math.atan2(y, x), k = 1 + 0.18 * Math.sin(a * 3 + seed) + 0.1 * Math.sin(a * 5 + seed * 2); pa.setXY(i, x * k, y * k); ua.setXY(i, x * k / radius * 1.6, y * k / radius * 1.6) }
    geo.computeVertexNormals()
  }
  // 表面函数（用于摆卵）：极坐标 → 位移后的点
  deform(geo, (p) => {
    const big = nz(p.x * 6, p.y * 6, 1.3) - 0.5, small = nz(p.x * 22, p.y * 22, 4.1) - 0.5
    const rim = Math.max(0, p.z / (radius * 0.38))
    const d = (big * 0.08 + small * 0.025) * radius * (0.3 + rim)
    const wet = 0.85 + nz(p.x * 9, p.y * 9, 7) * 0.3
    return [d, mix3(C('#a8581e', wet), C('#e2a64e', wet), rim * 0.6 + small * 0.4)]
  })
  const sponge = new THREE.Mesh(geo, m.sponge); sponge.castShadow = true; sponge.receiveShadow = true
  grp.add(sponge)
  // 卵：在半球表面按黄金角铺开，半嵌；外圈更小（新卵）
  const eggs: { p: THREE.Vector3; r: number }[] = []
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count, phi = Math.acos(1 - t * 0.92), th = i * 2.39996 + R() * 0.3
    const k = 1 + 0.18 * Math.sin(th * 3 + seed) + 0.1 * Math.sin(th * 5 + seed * 2)
    const dir = V(Math.sin(phi) * Math.cos(th), Math.sin(phi) * Math.sin(th) * 0.86, Math.cos(phi) * 0.38 * 1.6).normalize()
    const sr = V(radius * k * Math.sin(phi) * Math.cos(th), radius * k * 0.86 * Math.sin(phi) * Math.sin(th), radius * 0.38 * Math.cos(phi))
    const r = lerp(0.024, 0.014, t) * (0.85 + R() * 0.35)
    eggs.push({ p: sr.addScaledVector(dir, r * (i % 3 === 0 ? 0.95 : 0.2)), r }) // 每三颗一颗叠在外层（分层堆叠）
  }
  const im = eggInstances(eggs, R, detail); grp.add(im)
  grp.userData.eggs = im
  grp.userData.nestProp = 'eggsac'
  return grp
}

// ---------------------------------------------------------------------------
// 卵柱
// ---------------------------------------------------------------------------
/** 卵柱：竖直树脂芯（底部落地、局部 y 向上），外圈分层堆叠成熟卵（3–5cm），层间夹海绵基质环 */
export function buildMothEggPillar(seed = 1, height = 1.1): THREE.Group {
  const R = mulberry(0x5e20 + seed), nz = noise3(0x5e21 + seed), m = mothNestMaterials()
  const grp = new THREE.Group()
  const core = new THREE.CylinderGeometry(0.075, 0.12, height, 18, 24, true)
  core.translate(0, height / 2, 0)
  deform(core, (p) => [(nz(p.x * 12, p.y * 6, p.z * 12) - 0.5) * 0.05, mix3(C('#9a541c'), C('#d79a48'), nz(p.x * 20, p.y * 20, p.z * 20))])
  const cm = new THREE.Mesh(core, m.sponge); cm.castShadow = true; cm.receiveShadow = true; grp.add(cm)
  const eggs: { p: THREE.Vector3; r: number }[] = []
  for (let y = 0.05; y < height - 0.03; y += 0.05) {
    const rad = lerp(0.12, 0.075, y / height) + 0.02, n = Math.floor(rad * Math.PI * 2 / 0.042), off = R() * 6
    for (let k = 0; k < n; k++) { const a = off + k / n * Math.PI * 2; eggs.push({ p: V(Math.cos(a) * rad, y + (R() - 0.5) * 0.01, Math.sin(a) * rad), r: 0.019 + R() * 0.006 }) }
  }
  // 顶端一簇
  for (let k = 0; k < 7; k++) { const a = k * 0.9; eggs.push({ p: V(Math.cos(a) * 0.04, height + 0.01, Math.sin(a) * 0.04), r: 0.02 }) }
  grp.add(eggInstances(eggs, R, 'lo'))
  grp.userData.eggs = grp.children[1]
  grp.userData.nestProp = 'eggpillar'
  return grp
}

// ---------------------------------------------------------------------------
// 巢壁覆层
// ---------------------------------------------------------------------------
let BONE_GEO: THREE.BufferGeometry | undefined
function boneGeo() { // 长骨：两端膨大的管
  if (BONE_GEO) return BONE_GEO
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= 12; i++) { const t = i / 12, r = 0.012 + 0.012 * Math.pow(Math.abs(t - 0.5) * 2, 4); pts.push(new THREE.Vector2(r, (t - 0.5) * 0.3)) }
  const g = new THREE.LatheGeometry(pts, 8)
  const col = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < col.length; i += 3) col.set(C('#b8a888'), i)
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return (BONE_GEO = g)
}
/**
 * 巢壁覆层：w×h 的贴墙板（局部 xy 平面、+Z 朝外，背面 z=0 贴墙），厚度 depth（0.6–1.0m 的维基厚度在关卡里只取视觉厚度）。
 * 大尺度起伏 + 瘤状突起 + 肉质褶皱；嵌入的骨骼、木条与金属碎料作为支柱（单独一个实例化网格）。
 */
export function buildMothNestCoat(seed = 1, w = 3, h = 2.6, depth = 0.22): THREE.Group {
  const R = mulberry(0x5e30 + seed), nz = noise3(0x5e31 + seed), m = mothNestMaterials()
  const grp = new THREE.Group()
  const sx = Math.max(8, Math.round(w * 22)), sy = Math.max(8, Math.round(h * 22))
  const geo = new THREE.PlaneGeometry(w, h, sx, sy)
  const pos = geo.attributes.position as THREE.BufferAttribute, col = new Float32Array(pos.count * 3)
  const lumps = Array.from({ length: Math.round(w * h * 3) }, () => ({ x: (R() - 0.5) * w, y: (R() - 0.5) * h, r: 0.08 + R() * 0.22, k: 0.4 + R() * 0.8 }))
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i)
    const edge = Math.min(1, Math.min(w / 2 - Math.abs(x), h / 2 - Math.abs(y)) / 0.25) // 边缘贴回墙面
    let z = (nz(x * 1.6, y * 1.6, 0.5) * 0.6 + nz(x * 5, y * 5, 2.2) * 0.3 + nz(x * 14, y * 9, 4) * 0.1) * depth
    let lumpK = 0
    for (const L of lumps) { const d = Math.hypot(x - L.x, y - L.y) / L.r; if (d < 1) { const b = Math.cos(d * Math.PI / 2) ** 2 * L.k; z += b * L.r * 0.55; lumpK = Math.max(lumpK, b) } }
    // 竖向褶皱（树脂垂流）
    z += Math.sin(x * 23 + nz(x * 2, y * 2, 9) * 6) * 0.008 * depth / 0.22
    z *= edge
    pos.setZ(i, z)
    const wet = nz(x * 7, y * 7, 11)
    const c = mix3(mix3(C('#6e3a2a'), C('#b07a52'), wet), C('#d9a978'), lumpK * 0.5)
    col.set(c, i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  const uv = geo.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 1.2, uv.getY(i) * h / 1.2)
  geo.computeVertexNormals()
  const coat = new THREE.Mesh(geo, m.flesh); coat.receiveShadow = true; coat.castShadow = true
  grp.add(coat)
  // 嵌入的支柱残骸：长骨（顶点色骨白）——半露在肉层外
  const n = Math.round(w * h * 0.55)
  const bones = new THREE.InstancedMesh(boneGeo().clone(), m.bone, n), mat = new THREE.Matrix4(), q = new THREE.Quaternion()
  for (let k = 0; k < n; k++) {
    const x = (R() - 0.5) * (w - 0.4), y = (R() - 0.5) * (h - 0.4)
    q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.6, (R() - 0.5) * 0.6, R() * Math.PI))
    const s = 0.5 + R() * 0.6
    mat.compose(V(x, y, depth * (0.12 + R() * 0.25)), q, V(s, s, s)); bones.setMatrixAt(k, mat)
  }
  bones.castShadow = true
  grp.add(bones)
  grp.userData.nestProp = 'coat'
  return grp
}

// ---------------------------------------------------------------------------
// 门框肉质突起
// ---------------------------------------------------------------------------
/** 围着 w×h 门洞的一圈瘤状增生（局部 xy，门洞底边中点在原点，+Z 朝外）。门洞本身留空，突起向内侵入 8–15cm。 */
export function buildMothDoorGrowth(seed = 1, w = 0.95, h = 2.1): THREE.Group {
  const R = mulberry(0x5e40 + seed), nz = noise3(0x5e41 + seed), m = mothNestMaterials()
  const grp = new THREE.Group()
  const geos: THREE.BufferGeometry[] = []
  // 沿门框（两侧 + 顶）布置瘤团
  const pts: THREE.Vector3[] = []
  const per = (len: number) => Math.round(len / 0.11)
  for (let k = 0; k <= per(h); k++) { const y = k / per(h) * h; pts.push(V(-w / 2, y, 0), V(w / 2, y, 0)) }
  for (let k = 1; k < per(w); k++) pts.push(V(-w / 2 + k / per(w) * w, h, 0))
  for (const p of pts) {
    if (R() < 0.15) continue
    const r = 0.06 + R() * 0.09 * (p.y > h * 0.4 ? 1.3 : 0.8)
    const g = new THREE.SphereGeometry(r, 10, 8)
    const off = V(Math.sign(p.x) * (p.y >= h - 1e-3 ? 0 : -1) * r * 0.3 * (0.4 + R()) , p.y >= h - 1e-3 ? -r * 0.35 : (R() - 0.5) * 0.05, r * (0.2 + R() * 0.5))
    g.translate(p.x + off.x, p.y + off.y, off.z)
    deform(g, (q, n) => [(nz(q.x * 18, q.y * 18, q.z * 18) - 0.5) * r * 0.5, mix3(C('#7a3a2c'), C('#c99070'), nz(q.x * 9, q.y * 9, q.z * 9) * 0.8 + Math.max(0, n.z) * 0.2)])
    geos.push(g)
  }
  // 门楣上垂下的树脂丝 / 肉帘
  for (let k = 0; k < 7; k++) {
    const x = -w / 2 + 0.08 + R() * (w - 0.16), len = 0.12 + R() * 0.35
    const g = new THREE.CylinderGeometry(0.006 + R() * 0.01, 0.018, len, 6, 4)
    g.translate(x, h - len / 2, 0.03 + R() * 0.05)
    deform(g, () => [0, C('#c9a060')])
    geos.push(g)
  }
  const merged = mergeAll(geos)
  const mesh = new THREE.Mesh(merged, m.flesh); mesh.castShadow = true; mesh.receiveShadow = true
  grp.add(mesh)
  grp.userData.nestProp = 'doorgrowth'
  return grp
}
function mergeAll(geos: THREE.BufferGeometry[]) {
  // 统一成非索引 + 同属性，再拼接
  const list = geos.map((g) => (g.index ? g.toNonIndexed() : g))
  let n = 0; for (const g of list) n += g.attributes.position.count
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3)
  let o = 0
  for (const g of list) {
    const c = g.attributes.position.count
    pos.set(g.attributes.position.array as Float32Array, o * 3); nor.set(g.attributes.normal.array as Float32Array, o * 3)
    if (g.attributes.uv) uv.set(g.attributes.uv.array as Float32Array, o * 2)
    if (g.attributes.color) col.set(g.attributes.color.array as Float32Array, o * 3)
    o += c
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return out
}

// ---------------------------------------------------------------------------
// 胶状球（被溶解的猎物）
// ---------------------------------------------------------------------------
/** 被腐蚀喷射物分解后塑成的胶状球：半透明琥珀色外壳 + 内部悬浮的骨块（半径 r，底部落地） */
export function buildMothGelBall(seed = 1, r = 0.32): THREE.Group {
  const R = mulberry(0x5e50 + seed), nz = noise3(0x5e51 + seed), m = mothNestMaterials()
  const grp = new THREE.Group()
  const g = new THREE.SphereGeometry(r, 28, 20)
  deform(g, (p) => [(nz(p.x * 6, p.y * 6, p.z * 6) - 0.5) * r * 0.18 - Math.max(0, -p.y / r - 0.6) * r * 0.25, C('#ffffff')])
  g.translate(0, r * 0.9, 0)
  const shell = new THREE.Mesh(g, m.gel); shell.castShadow = true; shell.renderOrder = 2
  const n = 9, bones = new THREE.InstancedMesh(boneGeo().clone(), m.bone, n), mat = new THREE.Matrix4(), q = new THREE.Quaternion()
  for (let k = 0; k < n; k++) {
    q.setFromEuler(new THREE.Euler(R() * 6, R() * 6, R() * 6))
    const s = 0.5 + R() * 0.6
    mat.compose(V((R() - 0.5) * r, r * 0.9 + (R() - 0.5) * r, (R() - 0.5) * r), q, V(s, s, s)); bones.setMatrixAt(k, mat)
  }
  grp.add(bones, shell)
  grp.userData.nestProp = 'gelball'
  return grp
}
