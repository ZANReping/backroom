// v81：旱虾（Entity 20）重制模型——依据中文维基 Entity 20 与用户提供的两张奇虾复原模型参考图（仅作造型参考，原创程序化建模，无外部素材）：
//  · 约半米长、扁圆的奇虾体型：头甲圆盾 + 11 节躯干，向尾部逐节收窄、尾端微微上翘；节间有暗缝、每节后缘略鼓（覆瓦状背甲）。
//  · 每节两侧一片叶状鳍片（前小、中大、后小），浅杏色、带纵向鳍脉与发亮的薄边。
//  · 头部：一对长柄黑亮球眼；两条分节的弯钩前附肢（内侧一排小刺，向前下方卷曲）；腹面口锥圆盘。
//  · 尾部：三对竖起的 V 形尾扇（尖端泛蓝灰）+ 两条细长尾叉。
// 贴图：运行时程序化生成（颗粒甲壳 / 鳍脉），全部旱虾共享缓存。
// 动画：鳍片的划水波与躯干摆动在顶点着色器里完成（uniform 驱动，单网格），所以 11 对鳍片只占 1 个绘制批次；
//       眼柄与前附肢为独立分组。整只 8 个网格（壳/鳍/2 眼柄/2 眼球/2 前附肢）。模型正面 +X，原点在地面。
// 同一套几何也用于物品（旱虾 / 活旱虾 / 酥炸旱虾），物品版不带着色器动画，按姿态静态摆放。
import * as THREE from 'three'
import { litMaterial } from './shared'
import type { Entity } from '../entities'
import { rng, merge, V, gauss, sstep, cap, ell, sweep, canvasTex } from './houndMesh'

export interface ShrimpUniforms { sT: { value: number }; sFlap: { value: number }; sFlapBase: { value: number }; sBend: { value: number }; sBendT: { value: number }; sCurl: { value: number }; sPinch: { value: number } }
export interface ShrimpRig {
  root: THREE.Group
  eyes: THREE.Group[]
  arms: THREE.Group[]
  u?: ShrimpUniforms
  flapPh: number; bendPh: number; last: number
  size: number
  detail: THREE.Object3D[] // 远处隐藏的小部件
}

// ---------- 尺寸 ----------
const BODY_PTS = [V(-0.295, 0.088, 0), V(-0.21, 0.072, 0), V(-0.09, 0.063, 0), V(0.04, 0.062, 0), V(0.15, 0.064, 0), V(0.245, 0.058, 0)]
const SEG_T0 = 0.06, SEG_T1 = 0.735, SEGS = 11
/** 躯干半宽随 t（0=尾尖，1=头前缘） */
function bodyR(t: number) {
  const trunk = 0.012 + 0.05 * sstep(0.0, 0.5, t) - 0.008 * sstep(0.52, 0.72, t)
  const neck = -0.005 * gauss(t, 0.755, 0.025)
  const head = 0.004 * gauss(t, 0.86, 0.07)
  let r = trunk + neck + head
  if (t > SEG_T0 && t < SEG_T1) { // 覆瓦状背甲：每节后缘略鼓，节间暗缝收窄
    const f = ((t - SEG_T0) / (SEG_T1 - SEG_T0)) * SEGS % 1
    r *= (1 + 0.05 * (1 - f)) * (1 - 0.1 * (gauss(f, 0, 0.07) + gauss(f, 1, 0.07)))
  }
  return r * cap(t, 0.05)
}
function grooveShade(t: number) {
  if (t <= SEG_T0 || t >= SEG_T1) return t > 0.74 && t < 0.77 ? 0.7 : 1
  const f = ((t - SEG_T0) / (SEG_T1 - SEG_T0)) * SEGS % 1
  return 1 - 0.38 * (gauss(f, 0, 0.06) + gauss(f, 1, 0.06))
}
/** 节 i（0=最前，紧挨颈部）的中心 t */
const segT = (i: number) => SEG_T1 - (i + 0.5) / SEGS * (SEG_T1 - SEG_T0)

// ---------- 程序化贴图（共享缓存） ----------
const TEX = new Map<string, THREE.Texture | null>()
function shellTex(kind: 'shell' | 'batter') {
  if (TEX.has(kind)) return TEX.get(kind)!
  const t = canvasTex(256, 256, (c, R) => {
    const tile = (f: (ox: number, oy: number) => void) => { for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) f(ox, oy) }
    if (kind === 'shell') {
      c.fillStyle = '#b5532b'; c.fillRect(0, 0, 256, 256)
      for (let i = 0; i < 70; i++) { // 斑驳
        const x = R() * 256, y = R() * 256, r = 8 + R() * 26, a = 0.05 + R() * 0.08
        const col = R() < 0.55 ? `rgba(110,40,18,${a})` : `rgba(226,128,78,${a})`
        tile((ox, oy) => { c.fillStyle = col; c.beginPath(); c.ellipse(x + ox, y + oy, r, r * 0.7, R() * 3, 0, 7); c.fill() })
      }
      for (let i = 0; i < 2600; i++) { // 颗粒状甲壳疣粒：亮顶 + 暗底
        const x = R() * 256, y = R() * 256, r = 0.6 + R() * 1.5
        tile((ox, oy) => {
          c.fillStyle = 'rgba(80,26,10,0.35)'; c.beginPath(); c.arc(x + ox + 0.6, y + oy + 0.6, r, 0, 7); c.fill()
          c.fillStyle = 'rgba(238,150,100,0.42)'; c.beginPath(); c.arc(x + ox - 0.3, y + oy - 0.3, r * 0.7, 0, 7); c.fill()
        })
      }
    } else {
      c.fillStyle = '#d9993f'; c.fillRect(0, 0, 256, 256)
      for (let i = 0; i < 900; i++) { // 裹粉酥皮的碎屑与焦点
        const x = R() * 256, y = R() * 256, r = 1.5 + R() * 5
        const col = R() < 0.3 ? 'rgba(150,80,22,0.45)' : R() < 0.6 ? 'rgba(246,206,120,0.5)' : 'rgba(196,120,40,0.4)'
        tile((ox, oy) => { c.fillStyle = col; c.beginPath(); c.ellipse(x + ox, y + oy, r, r * (0.5 + R() * 0.5), R() * 3, 0, 7); c.fill() })
      }
    }
    const img = c.getImageData(0, 0, 256, 256), d = img.data
    for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 16; d[i] += n; d[i + 1] += n * 0.8; d[i + 2] += n * 0.6 }
    c.putImageData(img, 0, 0)
  }, true)
  if (t) t.userData.entityShared = true
  TEX.set(kind, t)
  return t
}
function finTex(kind: 'fin' | 'friedfin') {
  if (TEX.has(kind)) return TEX.get(kind)!
  const t = canvasTex(128, 128, (c, R) => {
    // u（画布 x）= 鳍根 → 鳍尖；v（画布 y）= 鳍片前缘 → 后缘
    const g = c.createLinearGradient(0, 0, 128, 0)
    if (kind === 'fin') { g.addColorStop(0, '#b8562e'); g.addColorStop(0.25, '#dc8f5e'); g.addColorStop(0.7, '#f0bb8c'); g.addColorStop(1, '#f7d3ae') }
    else { g.addColorStop(0, '#9a5a1e'); g.addColorStop(0.4, '#c98a34'); g.addColorStop(1, '#e8b860') }
    c.fillStyle = g; c.fillRect(0, 0, 128, 128)
    for (let y = 3; y < 128; y += 5 + R() * 3) { // 纵向鳍脉（自鳍根放射到鳍尖）
      c.strokeStyle = kind === 'fin' ? 'rgba(150,62,30,0.32)' : 'rgba(110,56,14,0.35)'; c.lineWidth = 0.9 + R() * 0.6
      c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(40, y + (R() - 0.5) * 4, 90, y + (R() - 0.5) * 6, 128, y + (R() - 0.5) * 8); c.stroke()
    }
    // 薄边发亮（上下缘）
    const e = c.createLinearGradient(0, 0, 0, 128)
    e.addColorStop(0, 'rgba(255,236,210,0.55)'); e.addColorStop(0.12, 'rgba(255,236,210,0)'); e.addColorStop(0.88, 'rgba(255,236,210,0)'); e.addColorStop(1, 'rgba(255,236,210,0.45)')
    c.fillStyle = e; c.fillRect(0, 0, 128, 128)
  }, false)
  if (t) t.userData.entityShared = true
  TEX.set(kind, t)
  return t
}
export function shrimpTexturesReady() { return TEX.has('shell') && TEX.has('fin') }
export function* prepareShrimpTextures(): Generator<void, void> {
  if (!TEX.has('shell')) { yield; shellTex('shell') }
  if (!TEX.has('fin')) { yield; finTex('fin') }
}

// ---------- 几何 ----------
function addColor(g: THREE.BufferGeometry, v: number | ((i: number, p: THREE.Vector3) => [number, number, number])) {
  const pos = g.getAttribute('position'), col: number[] = [], p = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i); const c = typeof v === 'number' ? [v, v, v] : v(i, p); col.push(c[0], c[1], c[2]) }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.count * 2).fill(0.5), 2))
  return g
}
const strip = (g: THREE.BufferGeometry) => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color' && k !== 'aFin') g.deleteAttribute(k); return g }

/** 叶状薄片：沿 long 方向长 len、沿 wide 方向最宽 width，叶尖向 sweep 方向后掠；aFin 写入转轴与相位 */
function leaf(o: THREE.Vector3, long: THREE.Vector3, wide: THREE.Vector3, len: number, width: number, back: THREE.Vector3, fin: [number, number, number, number], tip: [number, number, number] = [1, 1, 1], nu = 6, nv = 3) {
  const pos: number[] = [], uv: number[] = [], col: number[] = [], af: number[] = [], idx: number[] = []
  for (let i = 0; i <= nu; i++) {
    const u = i / nu
    const w = width * Math.pow(Math.sin(Math.PI * (0.12 + u * 0.88)), 0.75) * (1 - 0.15 * u) + width * 0.06
    for (let j = 0; j <= nv; j++) {
      const v = j / nv - 0.5
      const p = o.clone().addScaledVector(long, u * len).addScaledVector(wide, v * w).addScaledVector(back, u * u * len)
      p.y -= Math.abs(v) * w * 0.12 // 中脉微隆
      pos.push(p.x, p.y, p.z); uv.push(u, j / nv)
      const k = u * u
      col.push(1 + (tip[0] - 1) * k, 1 + (tip[1] - 1) * k, 1 + (tip[2] - 1) * k)
      af.push(...fin)
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; idx.push(a, b, a + 1, b, b + 1, a + 1) }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('aFin', new THREE.Float32BufferAttribute(af, 4))
  g.setIndex(idx); g.computeVertexNormals()
  return g.toNonIndexed()
}

export type ShrimpPose = 'live' | 'dead' | 'fried'
interface BuildOpts { pose: ShrimpPose; seed: number; lump?: boolean }
const ITEM_TEMPLATES = new Map<ShrimpPose, THREE.BufferGeometry[]>()
const itemMaterials = (pose: ShrimpPose) => { const m = materials(pose); return [m.shell, m.fin, m.eye] }

function bodyGeometry(o: BuildOpts) {
  const R = rng(0x5717 + o.seed * 131)
  const lumpy = o.pose === 'fried'
  const geo: THREE.BufferGeometry[] = []
  const body = sweep(BODY_PTS, (t, _d, cs, sn) => {
    let r = bodyR(t) * ell(cs, sn, t > 0.75 ? 0.6 : 0.56, 1)
    if (lumpy) r *= 1.14 + 0.07 * Math.sin(t * 61 + sn * 5) * Math.sin(cs * 7 + t * 23)
    // 背中线微隆
    if (cs < -0.85) r *= 1.04
    return r
  }, { radial: 16, seg: 72, vRep: 3, uRep: 2, shade: (t, d) => grooveShade(t) * (d.y > 0 ? 0.9 : 1.14) })
  geo.push(body)
  // 头背甲片（略隆起的椭圆盾）
  const plate = new THREE.SphereGeometry(1, 14, 8)
  plate.scale(0.052, 0.014, 0.042); plate.translate(0.19, 0.088, 0)
  geo.push(addColor(plate, 0.82))
  // 腹面口锥：一圈小甲片
  const mouth = new THREE.TorusGeometry(0.014, 0.005, 6, 14)
  mouth.rotateX(Math.PI / 2); mouth.translate(0.2, 0.034, 0)
  geo.push(addColor(mouth, 0.75))
  // 尾叉两条（细长、外撇上挑）
  for (const s of [-1, 1]) {
    const f = sweep([V(-0.285, 0.088, s * 0.006), V(-0.33, 0.1, s * 0.02), V(-0.375, 0.118, s * 0.042), V(-0.41, 0.13, s * 0.06)], (t) => 0.0042 * (1 - t * 0.75) * cap(t, 0.08), { radial: 6, seg: 8 })
    geo.push(f)
  }
  void R
  return merge(geo.map((g) => strip(addColorIfMissing(g))))
}
const addColorIfMissing = (g: THREE.BufferGeometry) => g.getAttribute('color') ? g : addColor(g, 1)

function finGeometry(o: BuildOpts) {
  const geo: THREE.BufferGeometry[] = []
  const curve = new THREE.CatmullRomCurve3(BODY_PTS, false, 'centripetal')
  const droop = o.pose === 'dead' ? -0.55 : o.pose === 'fried' ? -0.25 : -0.12
  for (let i = 0; i < SEGS; i++) {
    const t = segT(i), P = curve.getPointAt(t)
    // 前小、中大、后小（参考图：中段鳍片最长，靠尾部逐渐变短变窄）
    const k = i / (SEGS - 1)
    const len = (0.06 + 0.085 * gauss(k, 0.38, 0.3)) * (o.pose === 'fried' ? 0.92 : 1)
    const wid = (0.05 + 0.02 * gauss(k, 0.4, 0.35)) * 1.12
    const r = bodyR(t)
    for (const s of [-1, 1]) {
      const pivot = V(P.x, P.y - 0.006, s * r * 0.85)
      const long = V(-0.2 - k * 0.35, Math.sin(droop), s * Math.cos(droop)).normalize()
      const wide = V(1, 0, 0)
      const back = V(-0.32, -0.06, 0)
      geo.push(leaf(pivot, long, wide, len, wid, back, [pivot.y, pivot.z, i * 0.62, s]))
    }
  }
  // 尾扇：三对竖起的 V 形尾片，尖端泛蓝灰（参考图）
  const tipBlue: [number, number, number] = o.pose === 'fried' ? [0.85, 0.8, 0.7] : [0.66, 0.78, 0.98]
  const base = V(-0.288, 0.09, 0)
  for (let j = 0; j < 3; j++) for (const s of [-1, 1]) {
    const long = V(-1, 0.55 + j * 0.42, s * (0.18 + j * 0.16)).normalize()
    const up = V(0, 1, 0).addScaledVector(long, -long.y).normalize()
    const wide = new THREE.Vector3().crossVectors(long, up).normalize().lerp(up, 0.75).normalize()
    geo.push(leaf(base.clone().add(V(0.012 * j, 0, s * 0.004)), long, wide, 0.085 - j * 0.012, 0.03, V(-0.1, 0.05, 0), [base.y, 0, 0, 0], tipBlue, 5, 2))
  }
  return merge(geo.map(strip))
}

/** 前附肢（局部坐标：根部在原点，向 +X 前伸后向下卷曲；内侧一排小刺） */
function armGeometry(side: number, curl: number) {
  const c = curl
  const Y = 0.55 // 贴地爬行：卷曲的前附肢压扁一些，末端刚好触地
  const pts = [V(0, 0, 0), V(0.035, -0.004 * Y, side * 0.008), V(0.07, (-0.016 - c * 0.004) * Y, side * 0.012), V(0.093, (-0.04 - c * 0.008) * Y, side * 0.011), V(0.092 - c * 0.012, (-0.066 - c * 0.006) * Y, side * 0.008), V(0.074 - c * 0.02, (-0.08 + c * 0.006) * Y, side * 0.004)]
  const N = 13
  const arm = sweep(pts, (t) => (0.011 - 0.0065 * t) * (1 - 0.18 * Math.pow(Math.abs(Math.sin(t * N * Math.PI)), 6)) * cap(t, 0.04), {
    radial: 8, seg: 48, vRep: 1.2, shade: (t) => 1 - 0.3 * Math.pow(Math.abs(Math.sin(t * N * Math.PI)), 8),
  })
  const geo: THREE.BufferGeometry[] = [arm]
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
  const C = V(0.06 - c * 0.01, -0.045 * Y, 0) // 卷曲中心：小刺指向它（凹面）
  for (let k = 1; k < N; k++) {
    const t = (k + 0.5) / N
    if (t < 0.18) continue
    const P = curve.getPointAt(t)
    const dir = C.clone().sub(P); dir.z = 0; dir.normalize()
    for (const z of [-0.004, 0.004]) {
      const spine = new THREE.ConeGeometry(0.0022, 0.012 + 0.006 * Math.sin(t * Math.PI), 5)
      spine.translate(0, 0.006, 0)
      spine.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().add(V(0, 0, z * 40 * side)).normalize()))
      spine.translate(P.x, P.y, P.z + z)
      geo.push(addColor(spine, 0.9))
    }
  }
  return merge(geo.map((g) => strip(addColorIfMissing(g))))
}

function eyeGeometry(side: number) {
  const stalk = sweep([V(0, 0, 0), V(0.01, 0.009, side * 0.016), V(0.018, 0.018, side * 0.03), V(0.022, 0.022, side * 0.04)], (t) => 0.0062 * (1 - t * 0.3) * cap(t, 0.08), { radial: 7, seg: 7 })
  const ball = new THREE.SphereGeometry(0.0165, 14, 10)
  ball.translate(0.024, 0.026, side * 0.048)
  const glint = new THREE.SphereGeometry(0.0042, 6, 4)
  glint.translate(0.033, 0.037, side * 0.051)
  addColor(ball, 0.035); addColor(glint, 1.6)
  return { stalk: strip(addColorIfMissing(stalk)), ball: merge([strip(ball), strip(glint)]) }
}

// ---------- 着色器：鳍片划水波 + 躯干摆动 + 分裂缢缩 ----------
function install(mat: THREE.Material, u: ShrimpUniforms, fin: boolean) {
  const prev = mat.onBeforeCompile.bind(mat)
  mat.onBeforeCompile = (shader, r) => {
    prev(shader, r)
    Object.assign(shader.uniforms, u)
    shader.vertexShader = `uniform float sT, sFlap, sFlapBase, sBend, sBendT, sCurl, sPinch;\n${fin ? 'attribute vec4 aFin;\n' : ''}` + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      ${fin ? `if (aFin.w != 0.0) {
        float sAng = -aFin.w * (sFlapBase + sFlap * sin(sT + aFin.z));
        vec2 sRel = vec2(transformed.y - aFin.x, transformed.z - aFin.y);
        float sc = cos(sAng), ss = sin(sAng);
        transformed.y = aFin.x + sRel.x * sc - sRel.y * ss;
        transformed.z = aFin.y + sRel.x * ss + sRel.y * sc;
      }` : ''}
      float sW = clamp((0.16 - transformed.x) / 0.48, 0.0, 1.2);
      transformed.z += sBend * sW * sW * sin(transformed.x * 13.0 - sBendT);
      transformed.y += sCurl * sW * sW * sW;
      float sPf = exp(-pow((transformed.x + 0.03) / 0.05, 2.0)) * sPinch;
      transformed.y = 0.062 + (transformed.y - 0.062) * (1.0 - 0.82 * sPf);
      transformed.z *= 1.0 - 0.85 * sPf;`)
  }
  const prevKey = mat.customProgramCacheKey.bind(mat)
  mat.customProgramCacheKey = () => prevKey() + (fin ? '|shrimpFin' : '|shrimpBody')
}

function materials(pose: ShrimpPose) {
  const fried = pose === 'fried', dead = pose === 'dead'
  const shell = litMaterial({ color: fried ? '#ffffff' : dead ? '#d8c4b8' : '#ffffff', map: shellTex(fried ? 'batter' : 'shell'), vertexColors: true, roughness: fried ? 0.75 : 0.5, envBase: 0.22 })
  const fin = litMaterial({ color: dead ? '#dccabc' : '#ffffff', map: finTex(fried ? 'friedfin' : 'fin'), vertexColors: true, side: THREE.DoubleSide, roughness: 0.6, emissive: '#ffffff', emissiveIntensity: fried ? 0.05 : 0.16 })
  const eye = litMaterial({ color: fried ? '#e8e0cc' : '#ffffff', vertexColors: !fried, roughness: 0.12, envBase: 0.6 })
  return { shell, fin, eye }
}

/** 构建模型。animated=true 时鳍片/躯干由 ShrimpRig.u 驱动（实体）；否则为静态物品姿态 */
function build(o: BuildOpts, animated: boolean): { root: THREE.Group; rig: ShrimpRig } {
  const M = materials(o.pose)
  const root = new THREE.Group()
  const u: ShrimpUniforms | undefined = animated ? { sT: { value: 0 }, sFlap: { value: 0.15 }, sFlapBase: { value: 0 }, sBend: { value: 0 }, sBendT: { value: 0 }, sCurl: { value: 0 }, sPinch: { value: 0 } } : undefined
  if (u) { install(M.shell, u, false); install(M.fin, u, true) }
  const body = new THREE.Mesh(bodyGeometry(o), M.shell)
  const fins = new THREE.Mesh(finGeometry(o), M.fin)
  body.name = 'shrimpBody'; fins.name = 'shrimpFins'
  root.add(body, fins)
  const curl = o.pose === 'live' ? 0.2 : o.pose === 'dead' ? 1 : 0.7
  const eyes: THREE.Group[] = [], arms: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(0.205, 0.074, s * 0.03)
    const E = eyeGeometry(s)
    eg.add(new THREE.Mesh(E.stalk, M.shell), new THREE.Mesh(E.ball, M.eye))
    if (o.pose !== 'live') eg.rotation.z = -0.35
    root.add(eg); eyes.push(eg)
    const ag = new THREE.Group(); ag.position.set(0.222, 0.046, s * 0.02)
    ag.add(new THREE.Mesh(armGeometry(s, curl), M.shell))
    ag.rotation.z = o.pose === 'dead' ? -0.35 : 0
    root.add(ag); arms.push(ag)
  }
  const rig: ShrimpRig = { root, eyes, arms, u, flapPh: o.seed * 1.7, bendPh: o.seed * 0.9, last: -1, size: 1, detail: [...arms] }
  return { root, rig }
}

/** 实体模型（正面 +X，原点在地面） */
export function buildShrimpMesh(seed = 0): THREE.Group {
  const grp = new THREE.Group()
  const { root, rig } = build({ pose: 'live', seed }, true)
  grp.add(root)
  grp.userData.shrimpRig = rig
  return grp
}

/** 物品模型（旱虾 / 活旱虾 / 酥炸旱虾）：体长约 0.27m，中心在原点 */
export function buildShrimpItemMesh(type: string): THREE.Group {
  const pose: ShrimpPose = type === 'friedshrimp' ? 'fried' : type === 'liveshrimp' ? 'live' : 'dead'
  const g = new THREE.Group()
  let templates = ITEM_TEMPLATES.get(pose)
  if (!templates) { templates = buildItemTemplate(pose); ITEM_TEMPLATES.set(pose, templates) }
  const mats = itemMaterials(pose)
  for (let i = 0; i < templates.length; i++) g.add(new THREE.Mesh(templates[i].clone(), mats[i]))
  g.rotation.y = 0.5
  return g
}

function* buildItemTemplateSteps(pose: ShrimpPose): Generator<void, THREE.BufferGeometry[], void> {
  const M = materials(pose), root = new THREE.Group(), meshes: THREE.Mesh[] = []
  const pending: THREE.BufferGeometry[] = [], out: THREE.BufferGeometry[] = []
  let success = false
  try {
    root.scale.setScalar(0.52); root.position.set(0.004, -0.034, 0); if (pose === 'dead') root.rotation.z = 0.04
    const body = new THREE.Mesh(bodyGeometry({ pose, seed: 7 }), M.shell); root.add(body); meshes.push(body); yield
    const fins = new THREE.Mesh(finGeometry({ pose, seed: 7 }), M.fin); root.add(fins); meshes.push(fins); yield
    const curl = pose === 'live' ? 0.2 : pose === 'dead' ? 1 : 0.7
    for (const s of [-1, 1]) {
      const eg = new THREE.Group(); eg.position.set(0.205, 0.074, s * 0.03); const E = eyeGeometry(s)
      const stalk = new THREE.Mesh(E.stalk, M.shell), ball = new THREE.Mesh(E.ball, M.eye); eg.add(stalk, ball); if (pose !== 'live') eg.rotation.z = -0.35
      root.add(eg); meshes.push(stalk, ball); yield
      const ag = new THREE.Group(); ag.position.set(0.222, 0.046, s * 0.02); const arm = new THREE.Mesh(armGeometry(s, curl), M.shell)
      ag.add(arm); if (pose === 'dead') ag.rotation.z = -0.35; root.add(ag); meshes.push(arm); yield
    }
    root.updateMatrixWorld(true)
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>()
    for (const mesh of meshes) { const parts = batches.get(mesh.material as THREE.Material) ?? []; const clone = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld); parts.push(clone); pending.push(clone); batches.set(mesh.material as THREE.Material, parts) }
    for (const parts of batches.values()) { out.push(merge(parts)); for (const p of parts) { p.dispose(); pending.splice(pending.indexOf(p), 1) } yield }
    success = true; return out
  } finally {
    for (const mesh of meshes) mesh.geometry.dispose()
    for (const p of pending) p.dispose()
    if (!success) for (const g of out) g.dispose()
    for (const m of [M.shell, M.fin, M.eye]) m.dispose()
  }
}
function buildItemTemplate(pose: ShrimpPose): THREE.BufferGeometry[] { const g = buildItemTemplateSteps(pose); let s = g.next(); while (!s.done) s = g.next(); return s.value }

export function shrimpItemMeshReady(type: string): boolean {
  const pose: ShrimpPose = type === 'friedshrimp' ? 'fried' : type === 'liveshrimp' ? 'live' : 'dead'
  return ITEM_TEMPLATES.has(pose)
}

export function* prepareShrimpItemMesh(type: string): Generator<void, void> {
  const pose: ShrimpPose = type === 'friedshrimp' ? 'fried' : type === 'liveshrimp' ? 'live' : 'dead'
  if (ITEM_TEMPLATES.has(pose)) return
  const g = buildItemTemplateSteps(pose)
  try {
    let s = g.next()
    while (!s.done) { yield; s = g.next() }
    // A synchronous ground/held factory may have completed the same pose while
    // this job yielded. Keep its published owner and release the duplicate.
    if (ITEM_TEMPLATES.has(pose)) for (const geometry of s.value) geometry.dispose()
    else ITEM_TEMPLATES.set(pose, s.value)
  } finally { g.return([]) }
}

const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

/** 实体动画：爬行（鳍片划地 + 轻微 S 摆）· 游泳（离地、大幅划水）· 发呆 · 受惊弹窜 · 被按住挣扎 · 分裂（缢缩→拉长→一分为二） */
export function animateShrimp(grp: THREE.Group, e: Entity, time: number, _gz: number) {
  const rig = grp.userData.shrimpRig as ShrimpRig | undefined
  if (!rig?.u) return
  const s = e.sh
  const dt = rig.last < 0 ? 0.016 : Math.min(0.1, Math.max(0, time - rig.last)); rig.last = time
  const speed = s?.speed ?? (e.state === 'wander' ? 0.36 : 0)
  const swim = s?.swim ?? 0
  const startle = s?.phase === 'startle' ? 1 : 0
  const held = s?.phase === 'held' ? 1 : 0
  const split = s?.phase === 'split' ? s.split : 0
  const mv = Math.min(1, speed / 0.4)
  rig.flapPh += dt * (1.6 + mv * 7 + swim * 2.5 + startle * 10 + held * 14 + (split > 0 ? 3 : 0))
  rig.bendPh += dt * (1.5 + mv * 5 + swim * 3 + startle * 9 + held * 12)
  const u = rig.u
  u.sT.value = rig.flapPh
  u.sFlap.value = 0.07 + mv * 0.17 + swim * 0.2 + startle * 0.28 + held * 0.4
  u.sFlapBase.value = swim * 0.12 - (1 - swim) * mv * 0.04 // 陆地上鳍片压低贴地划，水里抬平
  u.sBendT.value = rig.bendPh
  u.sBend.value = 0.004 + mv * 0.005 + swim * 0.012 + startle * 0.016 + held * 0.02
  u.sCurl.value = 0.012 + swim * 0.01 + startle * 0.02 + Math.sin(time * 0.7 + e.id) * 0.004
  // 分裂：前 25% 静止鼓胀，之后中段缢缩、整体拉长
  u.sPinch.value = sm(0.2, 0.95, split)
  const size = (s?.size ?? 1) * (s?.grow ?? 1)
  rig.root.scale.set(size * (1 + 0.55 * sm(0.15, 1, split)), size * (1 + 0.06 * Math.sin(split * Math.PI)), size)
  // 游泳离地上浮、轻微点头；爬行时几乎贴地
  const lift = swim * (0.05 + Math.sin(time * 2.1 + e.id) * 0.008) + (1 - swim) * Math.abs(Math.sin(rig.flapPh * 0.5)) * 0.003 * mv
  rig.root.position.y = lift
  rig.root.rotation.z = swim * (-0.05 + Math.sin(time * 1.3 + e.id) * 0.03) + startle * 0.06
  // 前附肢：爬行时交替向前探地；发呆时慢慢拨弄；受惊收到身下；被按住乱挥
  for (let i = 0; i < 2; i++) {
    const a = rig.arms[i], ph = i ? Math.PI : 0
    a.rotation.z = -startle * 0.55 + held * Math.sin(time * 16 + ph) * 0.35 + (1 - startle) * (Math.sin(rig.flapPh * 0.5 + ph) * 0.16 * mv + Math.sin(time * 0.9 + ph + e.id) * 0.08 * (1 - mv)) - swim * 0.2
    a.rotation.y = (i ? 1 : -1) * (0.05 + Math.sin(time * 0.6 + ph) * 0.05)
  }
  // 眼柄：各自缓慢地四下张望
  for (let i = 0; i < 2; i++) {
    const g = rig.eyes[i]
    g.rotation.y = Math.sin(time * 0.53 + i * 2.1 + e.id) * 0.3
    g.rotation.z = Math.sin(time * 0.41 + i * 1.3 + e.id * 0.7) * 0.18 - startle * 0.2
  }
}

/** 死亡动画：被捕食者吃掉（缩进捕食者嘴里）/ 被打死（翻肚、鳍片耷拉） */
export function animateShrimpDeath(grp: THREE.Group, e: Entity, d: number, gz: number) {
  const rig = grp.userData.shrimpRig as ShrimpRig | undefined
  const eater = e.sh?.eater
  if (eater) {
    const k = sm(0.2, 1, d)
    const h = eater.def.type === 'duller' ? 1.05 : 0.1
    grp.position.set(e.x + (eater.x - e.x) * k, gz + (eater.z + h - gz) * k + Math.sin(d * Math.PI) * 0.15, e.y + (eater.y - e.y) * k)
    grp.scale.setScalar(Math.max(0.01, 1 - k))
    if (rig?.u) { rig.u.sFlap.value = 0.5 * (1 - k); rig.u.sT.value += 0.4 }
    return
  }
  if (rig) {
    rig.root.rotation.x = sm(0, 0.5, d) * Math.PI
    rig.root.position.y = Math.sin(sm(0, 0.5, d) * Math.PI) * 0.08 + sm(0, 0.5, d) * 0.12
    if (rig.u) { rig.u.sFlap.value = 0.02; rig.u.sFlapBase.value = -0.5 * d; rig.u.sBend.value = 0 }
    for (const a of rig.arms) a.rotation.z = -0.5 * d
  }
  grp.position.y = gz
}
