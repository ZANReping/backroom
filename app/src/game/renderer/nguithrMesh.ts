// Nguithr'xurh（Entity 16）重制模型——第 1 阶段：静态建模（无动画、无 AI）。
// 依据中文维基 entity-16（避日目、16 只附肢、天花板球状网囊储存镇静剂）与用户附图
// （黑白环纹长腿、斑纹腹部、伏在白色天花板上，四周凌乱绒丝）。
//
// 形体（避日目 Solifugae）：大号前凸头胸部（前体背板）+ 一对巨大的上下钳状螯肢（chelicerae）
// + 一对粗壮的须肢（末端奶白吸盘）+ 7 对环纹步足 + 分节蓬松腹部（腹背棋格斑纹）。
// 附肢计数：7 对步足 + 1 对须肢 = 16 只附肢；螯肢是口器，不计入。
// 尺寸（scale=1）：体长约 0.74m（螯尖→腹末），腿展约 1.8m；个体缩放 0.75–1.3x（作用在内层组上，几何全局共享）。
//
// 结构：一个 SkinnedMesh × 3 个材质组 = 3 次绘制：
//   组 0 体表（头胸/胸节/腹部/螯肢，512² Canvas 图集：斑纹 + 细毛笔触）
//   组 1 附肢（步足/须肢，Canvas 环纹贴图：奶白/黑褐相间，关节落在黑环中心）
//   组 2 光泽件（眼、螯指、螯齿：顶点色，低粗糙度）
// 体表与附肢上另有数百根单三角形「刚毛」（与附着点同骨骼权重、同贴图坐标），制造毛刺轮廓。
//
// 骨骼（58 根，静止时全部为单位旋转，仅有平移；第 2 阶段动画直接旋转对应骨骼）：
//   root → body(胸节，步足与须肢的父骨) → head(头胸背板) → chelL/chelR(螯肢整体) → chelFingerL/R(下侧活动指)
//   body → abd0 → abd1 → abd2（腹部三段，可做呼吸/摆动）
//   body → palpL/R_coxa → _femur → _tibia（须肢）
//   body → legL0.._coxa → _femur → _tibia（步足：基节/腿节/胫跗节，0=最前一对，6=最后一对）
//   命名：L = 模型左侧（+X，面向 +Z 时的左手边），R = 右侧。NG_LEGS 导出每条腿的髋/膝/踝/足尖与外展方向，供 IK 使用。
//
// 朝向约定：模型按 +Z 正面、+Y 背向（远离附着面）、原点=附着面（地面/天花板）上的身体投影点建造；
// 内层组旋转到 +X 正面（与其他实体同一约定）。倒挂在天花板上：外层 grp.rotation.x = Math.PI，grp.position.y = 天花板高度。
//
// 巢（buildNguithrNest）：天花板（局部 y=0 平面，内容全部向下 y≤0）上一片凌乱绒丝（Canvas 丝纹贴片 + 少量长丝线），
// 周围（1.0–1.35m 环上，避开本体腿展）用丝线吊 3–6 个半透明球状网囊（内装淡黄镇静液）。网囊外壳/内液/破囊残壳各一个 InstancedMesh，
// 每个网囊导出句柄（hide/show/pop），材质导出可调高光与自发光（setSacGlow），供后续阶段做手电反光与爆囊。
//
// 贴图全部为运行时 Canvas 程序化生成（全部实例共享），无外部资源；Node 下（无 document）退化为纯顶点色。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { getMaterialMode, litMaterial, mulberry } from './shared'

type V3 = THREE.Vector3
type RGB = [number, number, number]
/** 骨骼权重：[骨0, 骨1, 骨2, 骨3, 权0, 权1, 权2, 权3] */
type Wt = [number, number, number, number, number, number, number, number]
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const hex = (h: string, k = 1): RGB => { const c = new THREE.Color(h); return [c.r * k, c.g * k, c.b * k] }
const mixc = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
const WHITE: RGB = [1, 1, 1]
const w1 = (b: number): Wt => [b, 0, 0, 0, 1, 0, 0, 0]
const w2 = (a: number, b: number, t: number): Wt => (t <= 0 ? w1(a) : t >= 1 ? w1(b) : [a, b, 0, 0, 1 - t, t, 0, 0])
const DEG = Math.PI / 180

// ============================================================================
// 骨骼表（静止位置，模型空间）
// ============================================================================
const BODY_Y = 0.15 // 胸节中心离附着面高度
const HEAD_Y = 0.172
const names: string[] = []
const REST: V3[] = []
const PARENT: number[] = []
function bone(name: string, p: V3, parent: number) { names.push(name); REST.push(p.clone()); PARENT.push(parent); return names.length - 1 }

/** 一条附肢（步足/须肢）的静止折线与骨骼索引 */
export interface NgLimb {
  name: string; side: 1 | -1; kind: 'leg' | 'palp'; index: number
  hip: V3; coxaEnd: V3; knee: V3; ankle: V3; tip: V3
  /** 水平外展方向（单位向量，模型空间 XZ 平面） */
  dir: V3
  bones: [number, number, number] // [基节, 腿节, 胫跗节]
  radius: number // 腿节根部半径
}
export const NG_LEGS: NgLimb[] = []
export const NG_PALPS: NgLimb[] = []

const B_ROOT = bone('root', V(0, 0, 0), -1)
const B_BODY = bone('body', V(0, BODY_Y, 0), B_ROOT)
const B_HEAD = bone('head', V(0, HEAD_Y, 0.07), B_BODY)
const B_ABD0 = bone('abd0', V(0, 0.158, -0.07), B_BODY)
const B_ABD1 = bone('abd1', V(0, 0.162, -0.16), B_ABD0)
const B_ABD2 = bone('abd2', V(0, 0.16, -0.25), B_ABD1)
const CHEL_X = 0.047
const B_CHEL: Record<1 | -1, number> = { 1: 0, [-1]: 0 } as Record<1 | -1, number>
const B_FING: Record<1 | -1, number> = { 1: 0, [-1]: 0 } as Record<1 | -1, number>
for (const s of [1, -1] as const) {
  const t = s > 0 ? 'L' : 'R'
  B_CHEL[s] = bone(`chel${t}`, V(s * CHEL_X, 0.172, 0.11), B_HEAD)
  B_FING[s] = bone(`chelFinger${t}`, V(s * CHEL_X, 0.138, 0.285), B_CHEL[s])
}

/** 按外展角/仰角/段长生成一条附肢的关节折线 */
function makeLimb(kind: 'leg' | 'palp', index: number, side: 1 | -1, hip: V3, theta: number, lens: [number, number, number, number], up: number, down: number, radius: number, kink = 0): NgLimb {
  const dir = V(side * Math.sin(theta), 0, Math.cos(theta))
  // 膝部水平折角：前足胫跗节再向前收、后足再向后收（附图里腿在膝处明显折转）
  const dir2 = V(side * Math.sin(theta - kink), 0, Math.cos(theta - kink)), dir3 = V(side * Math.sin(theta - kink * 1.5), 0, Math.cos(theta - kink * 1.5))
  const coxaEnd = hip.clone().addScaledVector(dir, lens[0]).add(V(0, -0.004, 0))
  const knee = coxaEnd.clone().addScaledVector(dir, lens[1] * Math.cos(up)).add(V(0, lens[1] * Math.sin(up), 0))
  const ankle = knee.clone().addScaledVector(dir2, lens[2] * Math.cos(down)).add(V(0, -lens[2] * Math.sin(down), 0))
  const tipY = kind === 'palp' ? 0.018 : 0.006
  const dy = ankle.y - tipY
  const tip = ankle.clone().addScaledVector(dir3, Math.sqrt(Math.max(1e-6, lens[3] * lens[3] - dy * dy))); tip.y = tipY
  const t = side > 0 ? 'L' : 'R'
  const nm = kind === 'leg' ? `leg${t}${index}` : `palp${t}`
  const c = bone(`${nm}_coxa`, hip, B_BODY), f = bone(`${nm}_femur`, coxaEnd, c), tb = bone(`${nm}_tibia`, knee, f)
  return { name: nm, side, kind, index, hip, coxaEnd, knee, ankle, tip, dir, bones: [c, f, tb], radius }
}

// 须肢：从头胸部前下方、螯肢外侧伸出，粗壮、前伸，深褐色，末段渐浅、末端奶白吸盘
for (const s of [1, -1] as const) NG_PALPS.push(makeLimb('palp', 0, s, V(s * 0.088, 0.128, 0.128), 15 * DEG, [0.04, 0.21, 0.2, 0.15], 26 * DEG, 34 * DEG, 0.026))
// 7 对步足：前后扇形展开（前 3 对前伸、后 3 对后伸），前后两对最长
const LEG_THETA = [31, 46, 63, 82, 108, 128, 148]
const LEG_KINK = [7, 6, 4, 1, -5, -8, -10]
const LEG_LEN = [1.0, 0.92, 0.83, 0.79, 0.85, 0.95, 1.05]
const LEG_UP = [30, 33, 35, 36, 35, 33, 30]
for (let i = 0; i < 7; i++) for (const s of [1, -1] as const) {
  const f = LEG_LEN[i], z = 0.086 - i * 0.03
  const jit = ((i * 7 + (s > 0 ? 3 : 0)) % 5 - 2) * 0.6 * DEG // 左右不完全对称，避免机械感
  NG_LEGS.push(makeLimb('leg', i, s, V(s * 0.056, BODY_Y - 0.004, z), LEG_THETA[i] * DEG + jit, [0.045, 0.36 * f, 0.4 * f, 0.23 * f], LEG_UP[i] * DEG - jit, 47 * DEG, 0.02 * (0.86 + 0.14 * f), LEG_KINK[i] * DEG + jit * 2))
}
export const NG_BONE_NAMES: readonly string[] = names
export const NG_BONES = Object.fromEntries(names.map((n, i) => [n, i])) as Record<string, number>
/** 每根骨骼静止时的模型空间位置（只读；第 2 阶段 IK 用） */
export const NG_BONE_REST: readonly V3[] = REST
/** 静止时的胸节中心高度、腹末（纺器）模型空间位置 */
export const NG_BODY_Y = BODY_Y
export const NG_SPINNERET = V(0, 0.146, -0.335)

// ============================================================================
// 几何累加器（按材质组）
// ============================================================================
interface Part { pos: number[]; nor: number[]; uv: number[]; col: number[]; si: number[]; sw: number[]; idx: number[] }
const newPart = (): Part => ({ pos: [], nor: [], uv: [], col: [], si: [], sw: [], idx: [] })
const GROUPS = 3
class Acc {
  parts: THREE.BufferGeometry[][] = Array.from({ length: GROUPS }, () => [])
  add(group: number, p: Part) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(p.col, 3))
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(p.si, 4))
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(p.sw, 4))
    g.setIndex(p.idx)
    this.parts[group].push(g)
  }
  dispose(){for(const list of this.parts){for(const geo of list)geo.dispose();list.length=0}}
  build(): THREE.BufferGeometry {
    const groups = this.parts.map((l) => mergeGeometries(l)!)
    try { return mergeGeometries(groups, true)! } finally {for(const geo of groups)geo.dispose()}
  }
}

interface Swept { part: Part; rings: number; cols: number; tan: V3[] }
/**
 * 扫掠管体：沿任意折线，平行移动标架（初始 U 取 up 提示），截面由 sec(i, a) 给出 [S 向偏移, U 向偏移]。
 * a 从 -π/2（腹侧 -U）开始一周，所以贴图接缝落在腹中线。法线由几何计算后自动校正为朝外，并平均接缝/极点。
 */
function sweep(path: V3[], cols: number, sec: (i: number, a: number) => [number, number], o: {
  uv: (i: number, j: number) => [number, number]; col: (i: number, j: number, p: V3) => RGB; w: (i: number, j: number, p: V3) => Wt; up?: V3
}): Swept {
  const n = path.length - 1
  const T: V3[] = [], U: V3[] = [], S: V3[] = []
  for (let i = 0; i <= n; i++) T.push(path[Math.min(n, i + 1)].clone().sub(path[Math.max(0, i - 1)]).normalize())
  const up = (o.up ?? V(0, 1, 0)).clone()
  let u = up.sub(T[0].clone().multiplyScalar(up.dot(T[0])))
  if (u.lengthSq() < 1e-8) u = V(1, 0, 0).sub(T[0].clone().multiplyScalar(T[0].x))
  u.normalize()
  for (let i = 0; i <= n; i++) {
    if (i > 0) { const ax = V(0, 0, 0).crossVectors(T[i - 1], T[i]); const s = ax.length(); if (s > 1e-6) u.applyAxisAngle(ax.normalize(), Math.atan2(s, T[i - 1].dot(T[i]))) }
    u.sub(T[i].clone().multiplyScalar(u.dot(T[i]))).normalize()
    U.push(u.clone()); S.push(V(0, 0, 0).crossVectors(u, T[i]).normalize())
  }
  const p = newPart()
  const radial: number[] = []
  for (let i = 0; i <= n; i++) for (let j = 0; j <= cols; j++) {
    const a = -Math.PI / 2 + (j / cols) * Math.PI * 2
    const [rs, ru] = sec(i, a)
    const q = path[i].clone().addScaledVector(S[i], rs).addScaledVector(U[i], ru)
    p.pos.push(q.x, q.y, q.z); radial.push(Math.hypot(rs, ru))
    const [uu, vv] = o.uv(i, j); p.uv.push(uu, vv)
    const c = o.col(i, j, q); p.col.push(c[0], c[1], c[2])
    const w = o.w(i, j, q); p.si.push(w[0], w[1], w[2], w[3]); p.sw.push(w[4], w[5], w[6], w[7])
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < cols; j++) {
    const a = i * (cols + 1) + j, b = a + cols + 1
    p.idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
  // 法线：先按几何算，再判断朝向
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3)); g.setIndex(p.idx); g.computeVertexNormals()
  const nr = g.attributes.normal as THREE.BufferAttribute
  let dot = 0; const tmp = V(0, 0, 0)
  for (let i = 0; i <= n; i++) for (let j = 0; j <= cols; j++) {
    const k = i * (cols + 1) + j
    tmp.set(p.pos[k * 3], p.pos[k * 3 + 1], p.pos[k * 3 + 2]).sub(path[i])
    dot += tmp.x * nr.getX(k) + tmp.y * nr.getY(k) + tmp.z * nr.getZ(k)
  }
  if (dot < 0) { // 绕序反了：翻转索引与法线
    for (let k = 0; k < p.idx.length; k += 3) { const t = p.idx[k + 1]; p.idx[k + 1] = p.idx[k + 2]; p.idx[k + 2] = t }
    for (let k = 0; k < nr.count; k++) nr.setXYZ(k, -nr.getX(k), -nr.getY(k), -nr.getZ(k))
  }
  for (let i = 0; i <= n; i++) {
    const a = i * (cols + 1), b = a + cols
    let maxR = 0; for (let j = 0; j <= cols; j++) maxR = Math.max(maxR, radial[a + j])
    if (maxR < 1e-4) { // 极点：法线沿切线方向
      const d = i === 0 ? T[0].clone().negate() : T[n].clone()
      for (let j = 0; j <= cols; j++) nr.setXYZ(a + j, d.x, d.y, d.z)
      continue
    }
    tmp.set(nr.getX(a) + nr.getX(b), nr.getY(a) + nr.getY(b), nr.getZ(a) + nr.getZ(b)).normalize()
    nr.setXYZ(a, tmp.x, tmp.y, tmp.z); nr.setXYZ(b, tmp.x, tmp.y, tmp.z)
  }
  p.nor = Array.from(nr.array as Float32Array)
  g.dispose()
  return { part: p, rings: n + 1, cols, tan: T }
}

/**
 * 刚毛：在扫掠体的第 i0..i1 环上随机取 count 个顶点，各长出一根细长三角形（沿法线外伸并朝远端倾斜）。
 * 刚毛复制附着点的贴图坐标/顶点色/骨骼权重，所以颜色与环纹一致、动画时跟随同一骨骼。
 */
function bristles(sw: Swept, R: () => number, count: number, i0: number, i1: number, len: [number, number], width: number, lean: number, filter?: (a: number) => boolean) {
  const p = sw.part, n = V(0, 0, 0), b = V(0, 0, 0), side = V(0, 0, 0), tip = V(0, 0, 0)
  for (let k = 0; k < count; k++) {
    const i = Math.min(sw.rings - 1, Math.max(0, Math.floor(lerp(i0, i1 + 0.999, R()))))
    const j = Math.floor(R() * sw.cols)
    if (filter && !filter(-Math.PI / 2 + (j / sw.cols) * Math.PI * 2)) continue
    const vi = i * (sw.cols + 1) + j
    b.set(p.pos[vi * 3], p.pos[vi * 3 + 1], p.pos[vi * 3 + 2])
    n.set(p.nor[vi * 3], p.nor[vi * 3 + 1], p.nor[vi * 3 + 2])
    const t = sw.tan[i]
    side.crossVectors(n, t).normalize()
    const L = lerp(len[0], len[1], R())
    tip.copy(n).multiplyScalar(1).addScaledVector(t, lean + (R() - 0.5) * 0.5).addScaledVector(side, (R() - 0.5) * 0.7).normalize().multiplyScalar(L).add(b)
    const base = p.pos.length / 3
    const pts = [b.clone().addScaledVector(side, -width).addScaledVector(n, -0.002), b.clone().addScaledVector(side, width).addScaledVector(n, -0.002), tip]
    for (const q of pts) {
      p.pos.push(q.x, q.y, q.z); p.nor.push(n.x, n.y, n.z)
      p.uv.push(p.uv[vi * 2], p.uv[vi * 2 + 1])
      p.col.push(p.col[vi * 3] * 0.92, p.col[vi * 3 + 1] * 0.92, p.col[vi * 3 + 2] * 0.92)
      for (let c = 0; c < 4; c++) { p.si.push(p.si[vi * 4 + c]); p.sw.push(p.sw[vi * 4 + c]) }
    }
    p.idx.push(base, base + 1, base + 2)
  }
}

/** 已有 three 几何（球等）→ Part：应用矩阵、整体单色、单骨骼 */
function fromGeo(src: THREE.BufferGeometry, m: THREE.Matrix4, color: RGB, w: Wt, uv: [number, number] = [0.02, 0.02]): Part {
  const g = src.clone().applyMatrix4(m)
  const ng = g.index ? g : g
  const pos = ng.attributes.position as THREE.BufferAttribute, nor = ng.attributes.normal as THREE.BufferAttribute
  const p = newPart()
  for (let i = 0; i < pos.count; i++) {
    p.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i)); p.nor.push(nor.getX(i), nor.getY(i), nor.getZ(i))
    p.uv.push(uv[0], uv[1]); p.col.push(color[0], color[1], color[2])
    p.si.push(w[0], w[1], w[2], w[3]); p.sw.push(w[4], w[5], w[6], w[7])
  }
  if (ng.index) for (let i = 0; i < ng.index.count; i++) p.idx.push(ng.index.getX(i))
  else for (let i = 0; i < pos.count; i++) p.idx.push(i)
  g.dispose();src.dispose()
  return p
}

/** 小三角齿（螯齿）：base 处朝 dir 伸出 */
function tooth(p: Part, base: V3, dir: V3, side: V3, len: number, wid: number, color: RGB, w: Wt) {
  const tip = base.clone().addScaledVector(dir, len)
  const k = p.pos.length / 3
  const nrm = V(0, 0, 0).crossVectors(side, dir).normalize()
  for (const q of [base.clone().addScaledVector(side, -wid), base.clone().addScaledVector(side, wid), tip]) {
    p.pos.push(q.x, q.y, q.z); p.nor.push(nrm.x, nrm.y, nrm.z); p.uv.push(0.02, 0.02); p.col.push(color[0], color[1], color[2])
    p.si.push(w[0], w[1], w[2], w[3]); p.sw.push(w[4], w[5], w[6], w[7])
  }
  p.idx.push(k, k + 1, k + 2)
}

// ============================================================================
// 程序贴图
// ============================================================================
/** 体表图集 512²：u∈[0,.5]=腹部（v 前→后）；u∈[.5,1]×v∈[.5,1]=头胸/胸节；u∈[.5,1]×v∈[0,.5]=螯肢（v 基部→尖端）。
 *  每个区域内横向坐标 U：0=腹中线，.25=一侧，.5=背中线，.75=另一侧，1=腹中线（接缝两端图案连续） */
let BODY_TEX: THREE.CanvasTexture | null | undefined
function bodyTexture(): THREE.CanvasTexture | null {
  if (BODY_TEX !== undefined) return BODY_TEX
  if (typeof document === 'undefined') return (BODY_TEX = null)
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S
  const g = cv.getContext('2d')
  if (!g) return (BODY_TEX = null) // 无 2D 画布（Node 验收桩）：退化为纯顶点色
  const R = mulberry(0x16e0)
  // 区域 → 像素：x0/w 为区域左边与宽度；V 为区域内 0..1（底→顶）
  const reg = (x0: number, y0: number, w: number, h: number) => ({
    x: (U: number) => x0 + U * w, y: (Vv: number) => y0 + (1 - Vv) * h, w, h,
    ell(U: number, Vv: number, rx: number, ry: number, c: string) { // 横向环绕绘制（跨接缝时两端都画）
      g.fillStyle = c
      for (const d of [-1, 0, 1]) { const uu = U + d; if (uu + rx < -0.05 || uu - rx > 1.05) continue; g.beginPath(); g.ellipse(x0 + uu * w, y0 + (1 - Vv) * h, rx * w, ry * h, 0, 0, Math.PI * 2); g.fill() }
    },
  })
  const fur = (x0: number, y0: number, w: number, h: number, n: number, light: string, dark: string, len: number) => {
    g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip()
    for (let i = 0; i < n; i++) {
      const x = x0 + R() * w, y = y0 + R() * h, l = len * (0.5 + R()), a = (R() - 0.5) * 0.7
      g.strokeStyle = R() < 0.5 ? light : dark; g.globalAlpha = 0.18 + R() * 0.3; g.lineWidth = 0.6 + R() * 0.9
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(a) * l, y + Math.cos(a) * l); g.stroke()
    }
    g.restore(); g.globalAlpha = 1
  }
  // ---- 腹部：x 0..256 ----
  {
    const r = reg(0, 0, 256, 512)
    g.fillStyle = '#3d3328'; g.fillRect(0, 0, 256, 512)
    // 腹面（U≈0/1）：偏浅灰褐，带每节黑色横斑与成对黑点
    for (const [a, b] of [[0, 0.16], [0.84, 1]]) { g.fillStyle = '#6f6350'; g.fillRect(r.x(a), 0, (b - a) * 256, 512) }
    const NS = 9
    for (let k = 0; k < NS; k++) {
      const v0 = k / NS, v1 = (k + 1) / NS, vc = (v0 + v1) / 2, sh = 1 / NS
      // 背板：深色骨片（边缘不规则）
      g.fillStyle = '#231c15'; g.fillRect(r.x(0.3 + R() * 0.02), r.y(v1 - sh * 0.06), (0.38 + R() * 0.03) * 256, sh * 0.86 * 512)
      // 背面：成对的不规则浅色斑团（由多枚小斑叠成）+ 向后的浅色 V 形纹 + 黑色中线
      const blob = (U: number, Vc: number, size: number, c: string) => { for (let q = 0; q < 7; q++) r.ell(U + (R() - 0.5) * size * 1.6, Vc + (R() - 0.5) * sh * 0.45, size * (0.25 + R() * 0.45), sh * (0.05 + R() * 0.1), c) }
      blob(0.5 - 0.09, vc, 0.045, '#b3a586'); blob(0.5 + 0.09, vc, 0.045, '#b3a586')
      g.strokeStyle = 'rgba(190,176,142,0.75)'; g.lineWidth = 2.2
      g.beginPath(); g.moveTo(r.x(0.36), r.y(vc + sh * 0.32)); g.lineTo(r.x(0.5), r.y(vc - sh * 0.05)); g.lineTo(r.x(0.64), r.y(vc + sh * 0.32)); g.stroke()
      g.fillStyle = '#0f0b08'; g.fillRect(r.x(0.5) - 2.5, r.y(v1), 5, sh * 512)
      if (k % 2 === 0) blob(0.5, vc - sh * 0.22, 0.012, '#c7b893')
      blob(0.5 - 0.17, vc + sh * 0.1, 0.03, '#8e7f63'); blob(0.5 + 0.17, vc + sh * 0.1, 0.03, '#8e7f63')
      // 节间浅色软膜（后缘）
      g.fillStyle = 'rgba(206,192,158,0.75)'; g.fillRect(0, r.y(v0 + sh * 0.06), 256, 3)
      // 侧面：斑驳
      for (let q = 0; q < 6; q++) {
        const U = (R() < 0.5 ? 0.18 : 0.7) + R() * 0.12
        r.ell(U, v0 + R() * sh, 0.012 + R() * 0.02, sh * (0.08 + R() * 0.12), R() < 0.55 ? '#bfae8a' : '#17120e')
      }
      // 腹面：横斑与成对黑点（以腹中线 U=0 对称，跨接缝）
      g.fillStyle = '#2a221a'; g.fillRect(0, r.y(vc + sh * 0.12), r.x(0.1), sh * 0.22 * 512); g.fillRect(r.x(0.9), r.y(vc + sh * 0.12), r.x(0.1), sh * 0.22 * 512)
      r.ell(0.055, vc - sh * 0.2, 0.02, sh * 0.13, '#1e1813'); r.ell(0.945, vc - sh * 0.2, 0.02, sh * 0.13, '#1e1813')
      r.ell(0, vc + sh * 0.25, 0.018, sh * 0.1, '#c4b591')
    }
    // 腹柄（前端）略深
    const gr = g.createLinearGradient(0, 512, 0, 470); gr.addColorStop(0, 'rgba(20,15,10,0.8)'); gr.addColorStop(1, 'rgba(20,15,10,0)'); g.fillStyle = gr; g.fillRect(0, 470, 256, 42)
    fur(0, 0, 256, 512, 7000, '#e4d8bb', '#0d0a07', 7)
  }
  // ---- 头胸 / 胸节：x 256..512, y 0..256 ----
  {
    const r = reg(256, 0, 256, 256)
    g.fillStyle = '#4d4031'; g.fillRect(256, 0, 256, 256)
    g.fillStyle = '#8f8167'; g.fillRect(r.x(0), 0, 0.17 * 256, 256); g.fillRect(r.x(0.83), 0, 0.17 * 256, 256)
    g.fillStyle = '#271f17'; g.fillRect(r.x(0.33), 0, 0.34 * 256, 256)
    g.fillStyle = '#8e7e60'; g.fillRect(r.x(0.31), 0, 5, 256); g.fillRect(r.x(0.69) - 5, 0, 5, 256)
    g.fillStyle = '#7a6a50'; g.fillRect(r.x(0.5) - 1.5, 0, 3, 256)
    for (let q = 0; q < 70; q++) r.ell(0.2 + R() * 0.6, R(), 0.006 + R() * 0.012, 0.006 + R() * 0.014, R() < 0.5 ? '#14100c' : '#b7a682')
    // 前缘（v→1，眼区）更黑
    const gr = g.createLinearGradient(0, 0, 0, 60); gr.addColorStop(0, 'rgba(12,9,7,0.85)'); gr.addColorStop(1, 'rgba(12,9,7,0)'); g.fillStyle = gr; g.fillRect(256, 0, 256, 60)
    fur(256, 0, 256, 256, 3500, '#e7dcc0', '#0c0907', 6)
  }
  // ---- 螯肢：x 256..512, y 256..512 ----
  {
    const r = reg(256, 256, 256, 256)
    g.fillStyle = '#cbbb95'; g.fillRect(256, 256, 256, 256)
    for (const [U, wdt, c] of [[0.42, 0.05, '#3b3025'], [0.58, 0.05, '#3b3025'], [0.27, 0.04, '#6a5a44'], [0.73, 0.04, '#6a5a44'], [0.5, 0.012, '#8b7a5e']] as [number, number, string][]) {
      g.fillStyle = c; g.fillRect(r.x(U - wdt / 2), 256, wdt * 256, 256)
    }
    g.fillStyle = '#a5946f'; g.fillRect(r.x(0), 256, 0.12 * 256, 256); g.fillRect(r.x(0.88), 256, 0.12 * 256, 256)
    const gr = g.createLinearGradient(0, 330, 0, 256); gr.addColorStop(0, 'rgba(70,40,20,0)'); gr.addColorStop(1, 'rgba(60,32,16,0.95)'); g.fillStyle = gr; g.fillRect(256, 256, 256, 74)
    fur(256, 256, 256, 256, 3500, '#f2e8cf', '#1a130d', 6)
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
  tex.userData.entityShared=true
  return (BODY_TEX = tex)
}

/** 附肢环纹贴图 64×256：一个周期 = 一黑一白，黑环中心在 v=0（关节处）；纵向细毛笔触 */
let LEG_TEX: THREE.CanvasTexture | null | undefined
function legTexture(): THREE.CanvasTexture | null {
  if (LEG_TEX !== undefined) return LEG_TEX
  if (typeof document === 'undefined') return (LEG_TEX = null)
  const W = 64, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const g = cv.getContext('2d')
  if (!g) return (LEG_TEX = null) // 无 2D 画布（Node 验收桩）：退化为纯顶点色
  const R = mulberry(0x1e65)
  const cream = hex('#e4dfd2'), dark = hex('#191613')
  const img = g.createImageData(W, H)
  for (let y = 0; y < H; y++) {
    const d = Math.min(y, H - y) / H // 到黑环中心的距离（0..0.5 周期）
    const t = Math.max(0, Math.min(1, (d - 0.2) / 0.05)) // 0=黑 1=白
    for (let x = 0; x < W; x++) {
      const nz = (R() - 0.5) * 0.12
      const c = mixc(dark, cream, t)
      const k = (y * W + x) * 4
      img.data[k] = Math.max(0, Math.min(255, (c[0] + nz) * 255)); img.data[k + 1] = Math.max(0, Math.min(255, (c[1] + nz) * 255)); img.data[k + 2] = Math.max(0, Math.min(255, (c[2] + nz * 0.9) * 255)); img.data[k + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  for (let i = 0; i < 900; i++) {
    const x = R() * W, y = R() * H, l = 4 + R() * 9
    g.strokeStyle = R() < 0.5 ? '#efe6cf' : '#0b0906'; g.globalAlpha = 0.15 + R() * 0.3; g.lineWidth = 0.7
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 2, y + l); g.stroke()
  }
  g.globalAlpha = 1
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
  tex.userData.entityShared=true
  return (LEG_TEX = tex)
}

// ============================================================================
// 几何构建
// ============================================================================
let CACHE: { geo: THREE.BufferGeometry; tris: number } | null = null

function* buildGeometryJob(): Generator<void, {geo:THREE.BufferGeometry;tris:number}, unknown> {
  const acc = new Acc()
  try {
  const R = mulberry(0x16)
  const BAND = 0.075 // 环纹周期（m）

  // ---------- 附肢（组 1）----------
  for (const L of [...NG_PALPS, ...NG_LEGS]) {
    const palp = L.kind === 'palp'
    // 关节折线：髋→基节端(1 段)→膝(3 段，腿节微微上拱)→踝(3 段)→足尖(3 段，跗节略下弯)
    const segs: [V3, V3, number, number][] = [[L.hip, L.coxaEnd, 1, 0], [L.coxaEnd, L.knee, 3, 1], [L.knee, L.ankle, 3, 2], [L.ankle, L.tip, palp ? 3 : 3, 3]]
    const path: V3[] = [L.hip.clone()], segOf: number[] = [0], fr: number[] = [0], vcoord: number[] = [0]
    let vBase = 0
    for (const [a, b, n, k] of segs) {
      const len = a.distanceTo(b), nb = Math.max(1, Math.round(len / BAND))
      for (let s = 1; s <= n; s++) {
        const t = s / n, q = a.clone().lerp(b, t)
        if (k === 1) q.y += Math.sin(t * Math.PI) * len * 0.05 // 腿节上拱
        if (k === 3) q.y += Math.sin(t * Math.PI) * len * 0.04
        path.push(q); segOf.push(k); fr.push(t); vcoord.push(vBase + t * nb)
      }
      vBase += nb
    }
    const r0 = L.radius
    const arc: number[] = [0]; for (let i = 1; i < path.length; i++) arc.push(arc[i - 1] + path[i].distanceTo(path[i - 1]))
    // 半径：基节粗→腿节→胫节→跗节尖；关节环略鼓（节肢感）
    const radAt = (i: number) => {
      const k = segOf[i], t = fr[i]
      const prof = palp ? [[1.05, 1.0], [1.0, 0.86], [0.86, 0.74], [0.74, 0.62]] : [[1.1, 0.95], [0.95, 0.78], [0.72, 0.56], [0.52, 0.12]]
      let r = r0 * lerp(prof[k][0], prof[k][1], t)
      if (i > 0 && t >= 0.999 && k < 3) r *= 1.12
      return r
    }
    // 权重：段内纯色，关节环 50/50
    const wAt = (i: number): Wt => {
      const k = segOf[i], t = fr[i]
      const bk = [L.bones[0], L.bones[1], L.bones[2], L.bones[2]]
      if (t >= 0.999 && k < 2) return w2(bk[k], bk[k + 1], 0.5)
      return w1(bk[k])
    }
    const cols = palp ? 8 : 7
    const tint = palp ? hex('#6b5643') : WHITE
    const sw = sweep(path, cols, (i, a) => { const r = radAt(i); return [Math.cos(a) * r, Math.sin(a) * r] }, {
      uv: (i, j) => [j / cols, palp ? 0.29 + 0.42 * arc[i] / arc[arc.length - 1] : vcoord[i]], // 须肢不做环纹：只在白环区段内取样（保留毛刷笔触）+ 顶点色，整体深褐、末端渐浅
      col: (i) => (palp && segOf[i] === 3 ? mixc(tint, hex('#f1e6cc'), Math.min(1, Math.max(0, (fr[i] - 0.3) / 0.6))) : tint),
      w: (i) => wAt(i),
    })
    // 须肢末端吸盘：浅色小球（组 1，贴图取白环处）
    if (palp) {
      const m = new THREE.Matrix4().compose(L.tip.clone().addScaledVector(L.dir, 0.006), new THREE.Quaternion(), V(1, 0.8, 1).multiplyScalar(r0 * 0.75))
      acc.add(1, fromGeo(new THREE.SphereGeometry(1, 8, 5), m, hex('#f4ead2'), w1(L.bones[2]), [0.5, 0.5]))
    }
    // 刚毛：步足在腿节/胫节，须肢更密更长
    if (palp) bristles(sw, R, 44, 1, sw.rings - 2, [0.022, 0.06], 0.0013, 0.9)
    else bristles(sw, R, 16, 2, sw.rings - 3, [0.02, 0.05], 0.0011, 0.9)
    acc.add(1, sw.part)
    yield
  }

  // ---------- 体表（组 0）----------
  const bodyW = (z: number): Wt => {
    // 头胸 ↔ 胸节 ↔ 腹部的平滑过渡
    if (z > 0.06) return w2(B_BODY, B_HEAD, Math.min(1, (z - 0.06) / 0.04))
    if (z > -0.065) return w1(B_BODY)
    if (z > -0.11) return w2(B_BODY, B_ABD0, (-0.065 - z) / 0.045)
    if (z > -0.2) return w2(B_ABD0, B_ABD1, (-0.11 - z) / 0.09)
    if (z > -0.26) return w2(B_ABD1, B_ABD2, (-0.2 - z) / 0.06)
    return w1(B_ABD2)
  }
  const capped = (n: number, f: (t: number) => V3) => Array.from({ length: n + 1 }, (_, i) => f(i / n))

  // 头胸背板（前体）：前圆后收的穹顶，两侧略外鼓
  {
    const N = 10, cols = 12
    const path = capped(N, (t) => V(0, HEAD_Y + Math.sin(t * Math.PI) * 0.006, lerp(0.045, 0.218, t)))
    const prof = (t: number) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1), 2.6)), 0.42)
    const sw = sweep(path, cols, (i, a) => {
      const t = i / N, p = prof(t), s = Math.sin(a), c = Math.cos(a)
      const rs = 0.096 * p * (1 + 0.06 * Math.max(0, s)), ru = (s >= 0 ? 0.068 : 0.044) * p
      return [c * rs, s * ru]
    }, { uv: (i, j) => [0.5 + 0.5 * (j / cols), lerp(0.62, 0.99, i / N)], col: () => WHITE, w: (_i, _j, p) => bodyW(p.z) })
    bristles(sw, R, 24, 2, N - 1, [0.012, 0.03], 0.0013, -0.4, (a) => Math.sin(a) > -0.2)
    acc.add(0, sw.part)
    yield
  }
  // 胸节（中/后体背板）：步足着生处，三道节缝
  {
    const N = 9, cols = 10
    const path = capped(N, (t) => V(0, BODY_Y, lerp(0.105, -0.115, t)))
    const sw = sweep(path, cols, (i, a) => {
      const t = i / N, s = Math.sin(a), c = Math.cos(a)
      const edge = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1), 4)), 0.35)
      const ridge = 1 - 0.07 * Math.pow(Math.abs(Math.cos(t * Math.PI * 3)), 6)
      return [c * 0.072 * edge * ridge, s * (s >= 0 ? 0.048 : 0.035) * edge * ridge]
    }, { uv: (i, j) => [0.5 + 0.5 * (j / cols), lerp(0.52, 0.62, i / N)], col: () => WHITE, w: (_i, _j, p) => bodyW(p.z) })
    acc.add(0, sw.part)
    yield
  }
  // 腹部：9 节，前窄中宽后收，背面略隆起，节间收缩；腹末微微下垂
  {
    const N = 22, cols = 14
    const path = capped(N, (t) => V(0, 0.158 + Math.sin(t * Math.PI) * 0.01 - t * t * 0.012, lerp(-0.06, -0.335, t)))
    const sw = sweep(path, cols, (i, a) => {
      const t = i / N, s = Math.sin(a), c = Math.cos(a)
      const env = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 0.8))), 0.55) * (1 - 0.25 * t)
      const seg = 1 - 0.09 * Math.pow(Math.abs(Math.cos(t * Math.PI * 9)), 8) * Math.min(1, t * 8)
      const rs = 0.112 * env * seg, ru = (s >= 0 ? 0.08 : 0.064) * env * seg
      return [c * rs, s * ru]
    }, { uv: (i, j) => [0.5 * (j / cols), 0.01 + 0.98 * (i / N)], col: () => WHITE, w: (_i, _j, p) => bodyW(p.z) })
    bristles(sw, R, 110, 1, N - 1, [0.014, 0.034], 0.0014, -0.7)
    acc.add(0, sw.part)
    yield
  }
  // 螯肢（巨螯）：左右并拢的两只粗壮钳，基部埋在头胸内，前端接上下两指
  for (const s of [1, -1] as const) {
    const x = s * CHEL_X
    const N = 8, cols = 10
    const path = capped(N, (t) => V(x + s * Math.sin(t * Math.PI) * 0.004, 0.172 + Math.sin(t * Math.PI) * 0.008 - t * 0.006, lerp(0.1, 0.318, t)))
    const sw = sweep(path, cols, (i, a) => {
      const t = i / N, sn = Math.sin(a), c = Math.cos(a)
      const tip = t > 0.85 ? Math.sqrt(Math.max(0.05, 1 - Math.pow((t - 0.85) / 0.15, 2))) : 1
      const bulge = 1 + 0.12 * Math.sin(Math.min(1, t / 0.7) * Math.PI)
      const rs = lerp(0.045, 0.028, t) * tip * bulge, ru = (sn >= 0 ? lerp(0.056, 0.032, t) : lerp(0.044, 0.028, t)) * tip * bulge
      return [c * rs, sn * ru]
    }, { uv: (i, j) => [0.5 + 0.5 * (j / cols), 0.01 + 0.48 * (i / N)], col: () => WHITE, w: () => w1(B_CHEL[s]) })
    bristles(sw, R, 18, 2, N - 1, [0.015, 0.035], 0.0012, 0.8, (a) => Math.sin(a) > -0.3)
    acc.add(0, sw.part)
    yield
  }

  // ---------- 光泽件（组 2）----------
  const glossy = newPart()
  const appendPart = (dst: Part, src: Part) => {
    const off = dst.pos.length / 3
    dst.pos.push(...src.pos); dst.nor.push(...src.nor); dst.uv.push(...src.uv); dst.col.push(...src.col); dst.si.push(...src.si); dst.sw.push(...src.sw)
    for (const k of src.idx) dst.idx.push(off + k)
  }
  const fingCol = (t: number) => mixc(hex('#3a2418'), hex('#0a0605'), Math.min(1, 0.25 + t * 1.2))
  for (const s of [1, -1] as const) {
    const x = s * CHEL_X
    // 上指（不动指）：从螯前端向前伸、末端向下钩
    // 两指末端向中线内收（俯视时呈钳形而非直角）
    const curveIn = (pts: V3[]) => pts.map((q, i) => { const t = i / (pts.length - 1); q.x -= s * 0.012 * t * t; return q })
    const up = curveIn([V(x, 0.168, 0.298), V(x, 0.168, 0.338), V(x, 0.162, 0.372), V(x, 0.146, 0.398), V(x, 0.124, 0.408), V(x, 0.108, 0.401)])
    const swU = sweep(up, 6, (i, a) => { const r = lerp(0.021, 0.0025, i / (up.length - 1)); return [Math.cos(a) * r * 0.9, Math.sin(a) * r] }, { uv: () => [0.02, 0.02], col: (i) => fingCol(i / (up.length - 1)), w: () => w1(B_CHEL[s]) })
    appendPart(glossy, swU.part)
    // 下指（活动指）：铰点在螯下侧，向前伸、末端上翘；与上指留一道缝（微张）
    const lo = curveIn([V(x, 0.142, 0.280), V(x, 0.134, 0.322), V(x, 0.13, 0.358), V(x, 0.134, 0.384), V(x, 0.146, 0.398)])
    const swL = sweep(lo, 6, (i, a) => { const r = lerp(0.017, 0.0022, i / (lo.length - 1)); return [Math.cos(a) * r * 0.9, Math.sin(a) * r] }, { uv: () => [0.02, 0.02], col: (i) => fingCol(i / (lo.length - 1)), w: () => w1(B_FING[s]) })
    appendPart(glossy, swL.part)
    // 螯齿：上指下缘向下、下指上缘向上
    const side = V(1, 0, 0), toothC = hex('#140c08')
    for (let k = 0; k < 4; k++) {
      const z = 0.325 + k * 0.016
      tooth(glossy, V(x, 0.154 - k * 0.004, z), V(0, -1, 0.25).normalize(), side, 0.011 - k * 0.0015, 0.0035, toothC, w1(B_CHEL[s]))
      tooth(glossy, V(x, 0.142 - k * 0.0005, z - 0.004), V(0, 1, 0.2).normalize(), side, 0.009 - k * 0.0012, 0.003, toothC, w1(B_FING[s]))
    }
  }
  // 眼丘 + 一对中眼（避日目只有一对明显的中眼，黑亮，长在前缘眼丘上）
  {
    const eyeC = hex('#050403'), mound = hex('#1d1610')
    appendPart(glossy, fromGeo(new THREE.SphereGeometry(1, 8, 5), new THREE.Matrix4().compose(V(0, 0.226, 0.192), new THREE.Quaternion(), V(0.022, 0.012, 0.016)), mound, w1(B_HEAD)))
    for (const s of [1, -1]) appendPart(glossy, fromGeo(new THREE.SphereGeometry(1, 8, 6), new THREE.Matrix4().compose(V(s * 0.0115, 0.233, 0.199), new THREE.Quaternion(), V(0.0095, 0.0095, 0.0095)), eyeC, w1(B_HEAD)))
  }
  acc.add(2, glossy)

  const geo = acc.build()
  geo.computeBoundingSphere()
  const tris = (geo.index ? geo.index.count : geo.attributes.position.count) / 3
  return { geo, tris }
  } finally { acc.dispose() }
}

export function prepareNguithrGeometry() {
  if(!CACHE){const job=buildGeometryJob();let step=job.next();while(!step.done)step=job.next();CACHE=step.value}
  return CACHE
}
/** Cooperative preparation; cancellation releases every temporary geometry. */
export function* prepareNguithrJob():Generator<void,void,unknown>{
  if(!CACHE){
    const job=buildGeometryJob();let complete=false
    try{let step=job.next();while(!step.done){yield;step=job.next()}
      if(CACHE)step.value.geo.dispose();else CACHE=step.value
      complete=true
    }finally{if(!complete)job.return(undefined as never)}
  }
  bodyTexture();yield
  legTexture();yield
  webTexture();yield
  shellTexture();yield
}
export function nguithrResourcesReady(){return !!CACHE&&BODY_TEX!==undefined&&LEG_TEX!==undefined&&WEB_TEX!==undefined&&SHELL_TEX!==undefined}
export function nguithrGeometryReady() { return !!CACHE }

// ============================================================================
// 材质（按光影模式缓存，全部实例共享）
// ============================================================================
interface NgMats { body: THREE.Material; limb: THREE.Material; gloss: THREE.Material }
function nguithrMaterials(): NgMats {
  const bt = bodyTexture(), lt = legTexture()
  const body = litMaterial({ color: '#ffffff', vertexColors: true, ...(bt ? { map: bt, bumpMap: bt, bumpScale: 1.2 } : {}), roughness: 0.82, envBase: 0.12, side: THREE.DoubleSide })
  const limb = litMaterial({ color: '#ffffff', vertexColors: true, ...(lt ? { map: lt, bumpMap: lt, bumpScale: 0.8 } : {}), roughness: 0.7, envBase: 0.16, side: THREE.DoubleSide })
  const gloss = litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.2, envBase: 0.85 })
  if ((gloss as THREE.MeshLambertMaterial).emissive) (gloss as THREE.MeshLambertMaterial).emissive.set('#040302')
  return { body, limb, gloss }
}

// ============================================================================
// 实例
// ============================================================================
export interface NguithrRig {
  inner: THREE.Group; mount: THREE.Group; body: THREE.SkinnedMesh; bones: THREE.Bone[]; rest: V3[]
  scale: number; tris: number
}

/**
 * 构建一只 Nguithr'xurh。scale：个体缩放（夹在 0.75–1.3）。
 * 返回外层组（+X 正面、原点在附着面）；倒挂天花板时设 grp.rotation.x = Math.PI。
 */
export function buildNguithrMesh(scale = 1): THREE.Group {
  const sc = Math.max(0.75, Math.min(1.3, scale))
  const C0 = prepareNguithrGeometry()
  const grp = new THREE.Group()
  grp.userData.entityType = 'nguithr'
  grp.userData.parts = {} // 不交给通用四肢动画
  const inner = new THREE.Group(); inner.rotation.y = Math.PI / 2; inner.scale.setScalar(sc); grp.add(inner)
  const mount = new THREE.Group(); inner.add(mount)
  const bones: THREE.Bone[] = []
  REST.forEach((p, i) => {
    const b = new THREE.Bone(); b.name = names[i]; const par = PARENT[i]
    b.position.copy(p).sub(par < 0 ? V(0, 0, 0) : REST[par])
    ;(par < 0 ? mount : bones[par]).add(b); bones.push(b)
  })
  const m = nguithrMaterials()
  const body = new THREE.SkinnedMesh(C0.geo.clone(), [m.body, m.limb, m.gloss])
  body.frustumCulled = false // 长腿动画时会超出包围球
  body.castShadow = true
  mount.add(body)
  mount.updateMatrixWorld(true)
  body.bind(new THREE.Skeleton(bones))
  const rig: NguithrRig = { inner, mount, body, bones, rest: bones.map((b) => b.position.clone()), scale: sc, tris: C0.tris }
  grp.userData.nguithrRig = rig
  return grp
}

/** 验收用：网格数、绘制次数（材质组计入）、三角面、骨骼数 */
export function nguithrBudget(grp: THREE.Object3D) {
  let meshes = 0, draws = 0, tris = 0, bones = 0
  grp.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || m.userData.cpuSkin) return
    meshes++
    const g = m.geometry as THREE.BufferGeometry
    const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1
    draws += Array.isArray(m.material) ? Math.max(1, g.groups.length) : 1
    tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * inst
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) bones += (m as THREE.SkinnedMesh).skeleton.bones.length
  })
  return { meshes, draws, tris, bones }
}

// ============================================================================
// 巢：天花板绒丝网 + 吊挂网囊
// ============================================================================
export type SacState = 'intact' | 'popped' | 'hidden'
/** 单个网囊的句柄（坐标为巢组局部空间：天花板 y=0，向下为负） */
export interface NguithrSacHandle {
  index: number; center: THREE.Vector3; radius: number; state: SacState
  /** 完全隐藏（囊、液、残壳、吊丝都不显示） */
  hide(): void
  /** 恢复完整网囊 */
  show(): void
  /** 爆开：囊壳与镇静液消失，只剩上半截撕裂残壳挂在丝上（液体飞溅/毒雾由后续阶段处理） */
  pop(): void
}
export interface NguithrNestHandle {
  group: THREE.Group
  sacs: NguithrSacHandle[]
  materials: { web: THREE.Material; thread: THREE.LineBasicMaterial; shell: THREE.Material; liquid: THREE.Material }
  /** 调节镇静液自发光与高光（手电照射时可调高 specular 让网囊反光） */
  setSacGlow(emissive: number, specular?: number): void
  /** 半径（m），给碰撞/放置参考 */
  radius: number
}

let WEB_TEX: THREE.CanvasTexture | null | undefined
/** 绒丝贴片：卷曲、打折的白色丝缕（附图中那种凌乱绒毛状），边缘径向淡出 */
function webTexture(): THREE.CanvasTexture | null {
  if (WEB_TEX !== undefined) return WEB_TEX
  if (typeof document === 'undefined') return (WEB_TEX = null)
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S
  const g = cv.getContext('2d')
  if (!g) return (WEB_TEX = null) // 无 2D 画布（Node 验收桩）：退化为纯顶点色
  const R = mulberry(0x3eb)
  g.clearRect(0, 0, S, S)
  g.lineCap = 'round'
  for (let i = 0; i < 80; i++) {
    // 一缕丝：大体沿 u 方向（贴片长轴=径向）延伸，高频折线抖动（附图里那种卷曲、打折的绒丝）
    let x = S * R() * 0.5, y = S * (0.15 + R() * 0.7), a = (R() - 0.5) * 0.7
    const steps = 12 + Math.floor(R() * 22)
    g.strokeStyle = R() < 0.08 ? `rgba(178,174,165,${0.3 + R() * 0.3})` : `rgba(244,241,233,${0.25 + R() * 0.5})`; g.lineWidth = 0.7 + R() * 1.1
    g.beginPath(); g.moveTo(x, y)
    for (let k = 0; k < steps; k++) {
      a = a * 0.7 + (R() - 0.5) * 1.1
      const l = 4 + R() * 6
      x += Math.cos(a) * l; y += Math.sin(a) * l * 0.8
      g.lineTo(x, y + (k % 2 ? 2.5 : -2.5) * R())
    }
    g.stroke()
  }
  // 径向淡出（贴片边缘不出现硬边）
  g.globalCompositeOperation = 'destination-in'
  const gr = g.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S * 0.5)
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = gr; g.fillRect(0, 0, S, S)
  g.globalCompositeOperation = 'source-over'
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace
  tex.userData.entityShared=true
  return (WEB_TEX = tex)
}

let SHELL_TEX: THREE.CanvasTexture | null | undefined
/** 网囊外壳：交错丝纹，半透明 */
function shellTexture(): THREE.CanvasTexture | null {
  if (SHELL_TEX !== undefined) return SHELL_TEX
  if (typeof document === 'undefined') return (SHELL_TEX = null)
  const W = 256, H = 128, cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const g = cv.getContext('2d')
  if (!g) return (SHELL_TEX = null) // 无 2D 画布（Node 验收桩）：退化为纯顶点色
  const R = mulberry(0x5ac)
  g.fillStyle = 'rgba(214,207,190,0.55)'; g.fillRect(0, 0, W, H)
  for (let i = 0; i < 420; i++) {
    const x = R() * W, y = R() * H, a = R() * Math.PI, l = 10 + R() * 40
    g.strokeStyle = `rgba(250,247,238,${0.3 + R() * 0.6})`; g.lineWidth = 0.5 + R() * 1.2
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (R() - 0.5) * 8, y + Math.sin(a) * l * 0.5 + (R() - 0.5) * 8, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke()
    // 横向环绕：左右边缘各补一份，保证 u 方向无缝
    if (x < 40 || x > W - 40) { const dx = x < 40 ? W : -W; g.beginPath(); g.moveTo(x + dx, y); g.lineTo(x + dx + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke() }
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping
  tex.userData.entityShared=true
  return (SHELL_TEX = tex)
}

/** 网囊材质：classic 用 Phong（有镜面高光，手电照到会亮一点），realistic 用 Physical（清漆层） */
function sacMaterials() {
  const real = getMaterialMode() === 'realistic'
  const st = shellTexture()
  // 只画正面：双面半透明在轮廓处前后两层叠加，会出现一圈发白的厚边（「煎蛋」感）
  const shellP = { color: '#d9cfb4', transparent: true, opacity: 0.62, depthWrite: false, side: THREE.FrontSide, ...(st ? { map: st } : {}) }
  const liqP = { color: '#b39645', transparent: true, opacity: 0.9, emissive: new THREE.Color('#6b5214'), emissiveIntensity: 0.05 }
  const shell = real
    ? new THREE.MeshPhysicalMaterial({ ...shellP, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.4 })
    : new THREE.MeshPhongMaterial({ ...shellP, specular: new THREE.Color('#3a3a36'), shininess: 30 })
  const liquid = real
    ? new THREE.MeshPhysicalMaterial({ ...liqP, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08 })
    : new THREE.MeshPhongMaterial({ ...liqP, specular: new THREE.Color('#5e5844'), shininess: 140 })
  shell.userData.baseSpecular = 0.25; liquid.userData.baseSpecular = 1
  // 破囊残壳是开口薄壳，内外都要看得见：单独一份双面材质（稍暗，内壁沾着镇静液的黄）
  const remnant = shell.clone(); remnant.side = THREE.DoubleSide; remnant.opacity = 0.8
  ;(remnant as THREE.MeshPhongMaterial).color.set('#cbbd96')
  return { shell, liquid, remnant }
}

/** 网囊布局（巢局部坐标：x/z 水平，y≤0 向下，单位 m）。纯数值，AI（engine/nguithrAI.ts）与巢模型共用 */
export interface NguithrSacSpot { x: number; y: number; z: number; r: number }
function sacLayoutFrom(R: () => number, n: number, seed: number): NguithrSacSpot[] {
  const out: NguithrSacSpot[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (R() - 0.5) * 0.7 + seed
    const rr = 1.0 + R() * 0.35
    const r = 0.095 + R() * 0.05
    out.push({ x: Math.cos(a) * rr, y: -(0.24 + R() * 0.34), z: Math.sin(a) * rr, r })
  }
  return out
}
/** count（夹 3–6）、seed 与 buildNguithrNest 相同时，返回完全相同的网囊位置/半径 */
export function nguithrSacLayout(count = 4, seed = 16): NguithrSacSpot[] {
  const n = Math.max(3, Math.min(6, Math.round(count)))
  return sacLayoutFrom(mulberry(0x6e57 + seed * 977), n, seed)
}

/**
 * 构建巢：count 个网囊（夹在 3–6）。返回组的 userData.nguithrNest 为 NguithrNestHandle（也可用 nguithrNest(group) 取）。
 * 局部坐标：天花板为 y=0 平面，全部内容向下；巢中心在原点，绒丝铺开半径约 1.4m，网囊挂在 1.0–1.35m 环上（本体腿展半径约 0.9m，不会与囊重叠）。
 */
export function buildNguithrNest(count = 4, seed = 16): THREE.Group {
  const n = Math.max(3, Math.min(6, Math.round(count)))
  const R = mulberry(0x6e57 + seed * 977)
  const group = new THREE.Group(); group.name = 'nguithrNest'
  const real = getMaterialMode() === 'realistic'
  const wt = webTexture()
  const webP = { color: '#f4f1ea', transparent: true, depthWrite: false, side: THREE.DoubleSide, ...(wt ? { map: wt } : { opacity: 0.35 }) }
  const web = real ? new THREE.MeshStandardMaterial({ ...webP, roughness: 0.9 }) : new THREE.MeshLambertMaterial(webP)

  // ---- 网囊布局（与 AI 共用 nguithrSacLayout，同一随机流，保证巢模型与玩法判定点一致）----
  type Sac = { c: V3; r: number }
  const sacs: Sac[] = sacLayoutFrom(R, n, seed).map((s) => ({ c: V(s.x, s.y, s.z), r: s.r }))

  // ---- 绒丝贴片（一个网格）：天花板下几厘米的平铺丝团 + 垂挂丝絮 + 每个网囊上方的丝锥 ----
  const quads: number[] = [], quv: number[] = [], qi: number[] = []
  const quad = (c: V3, ax: V3, ay: V3) => {
    const k = quads.length / 3
    for (const [sx, sy, u, v] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      const p = c.clone().addScaledVector(ax, sx).addScaledVector(ay, sy); quads.push(p.x, p.y, p.z); quv.push(u, v)
    }
    qi.push(k, k + 1, k + 2, k, k + 2, k + 3)
  }
  const flat = (x: number, z: number, size: number, y: number, ang?: number) => {
    const a = ang ?? R() * Math.PI, s = size * (0.7 + R() * 0.6)
    const tilt = (R() - 0.5) * 0.25
    y = Math.min(y, -0.004 - Math.abs(tilt) * (s + size * 0.1)) // 倾斜贴片整片都在天花板之下（否则会被天花板切出硬边）
    quad(V(x, y, z), V(Math.cos(a) * s, tilt * s, Math.sin(a) * s), V(-Math.sin(a) * size * 0.45, -tilt * size * 0.2, Math.cos(a) * size * 0.45))
  }
  for (let i = 0; i < 60; i++) { // 平铺丝团：沿径向排布（长轴朝外），在腿展范围内最密，形成附图那种环绕本体的绒丝晕
    const rr = 0.12 + Math.pow(R(), 0.9) * 1.3, a = R() * Math.PI * 2
    flat(Math.cos(a) * rr, Math.sin(a) * rr, 0.12 + R() * 0.18, -0.004 - R() * 0.045, a + (R() - 0.5) * 0.5)
  }
  for (let i = 0; i < 26; i++) { // 垂挂丝絮（竖直贴片，上沿贴天花板）
    const rr = 0.3 + R() * 1.0, a = R() * Math.PI * 2, h = 0.05 + R() * 0.14, w = 0.06 + R() * 0.1, ya = R() * Math.PI
    quad(V(Math.cos(a) * rr, -h, Math.sin(a) * rr), V(Math.cos(ya) * w, 0, Math.sin(ya) * w), V(0, h, 0))
  }
  for (const s of sacs) { // 网囊上方丝锥：两片交叉竖贴片 + 囊顶包裹
    const top = s.c.y + s.r * 0.6
    for (let k = 0; k < 2; k++) {
      const ya = k * Math.PI / 2 + R()
      quad(V(s.c.x, top * 0.5, s.c.z), V(Math.cos(ya) * s.r * 0.9, 0, Math.sin(ya) * s.r * 0.9), V(0, -top * 0.5, 0))
    }
    flat(s.c.x, s.c.z, s.r * 1.6, -0.01)
  }
  const wg = new THREE.BufferGeometry()
  wg.setAttribute('position', new THREE.Float32BufferAttribute(quads, 3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(quv, 2)); wg.setIndex(qi); wg.computeVertexNormals()
  // 法线统一朝下（从下方被照亮）
  const wn = wg.attributes.normal as THREE.BufferAttribute; for (let i = 0; i < wn.count; i++) { if (wn.getY(i) > 0) wn.setXYZ(i, -wn.getX(i), -wn.getY(i), -wn.getZ(i)) }
  const webMesh = new THREE.Mesh(wg, web); webMesh.name = 'nestWeb'; webMesh.userData.noCastShadow=true; webMesh.renderOrder = 3; group.add(webMesh)

  // ---- 丝线（一个 LineSegments）：吊丝 + 拉索 + 少量长丝 ----
  const lp: number[] = []
  const threadRange: [number, number][] = []
  const seg = (a: V3, b: V3) => { lp.push(a.x, a.y, a.z, b.x, b.y, b.z) }
  for (const s of sacs) {
    const st = lp.length
    const top = V(s.c.x, s.c.y + s.r * 0.92, s.c.z)
    // 主吊丝略带折弯
    const mid = V(s.c.x + (R() - 0.5) * 0.03, top.y * 0.5, s.c.z + (R() - 0.5) * 0.03)
    seg(V(s.c.x, 0, s.c.z), mid); seg(mid, top)
    for (let k = 0; k < 4; k++) { // 斜拉索
      const a = R() * Math.PI * 2, d = 0.12 + R() * 0.22
      seg(V(s.c.x + Math.cos(a) * d, 0, s.c.z + Math.sin(a) * d), V(s.c.x + (R() - 0.5) * s.r, s.c.y + s.r * (0.3 + R() * 0.5), s.c.z + (R() - 0.5) * s.r))
    }
    threadRange.push([st, lp.length])
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3))
  const threadBase = lp.slice()
  // 丝线不受光：颜色压暗、透明度降低并参与雾，暗处不再发亮
  const thread = new THREE.LineBasicMaterial({ color: '#8a8579', transparent: true, opacity: 0.32, depthWrite: false, fog: true })
  const lines = new THREE.LineSegments(lg, thread); lines.name = 'nestThreads'; lines.userData.noCastShadow=true; group.add(lines)

  // ---- 网囊：外壳 / 镇静液 / 破囊残壳 三个 InstancedMesh ----
  const { shell, liquid, remnant } = sacMaterials()
  const shellGeo = new THREE.SphereGeometry(1, 26, 16)
  // 网囊略呈水滴形（底部下坠）：顶点按高度拉伸
  { const p = shellGeo.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setY(i, y < 0 ? y * 1.12 : y * 0.96); const k = 1 + 0.05 * Math.sin(i * 1.7); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k) } shellGeo.computeVertexNormals() }
  const liqGeo = new THREE.SphereGeometry(1, 22, 14)
  // 残壳：上半截球壳，下沿撕成长短不一的尖齿与垂片（每一列一个随机撕裂深度，奇偶列交错形成锯齿，个别列拉成长条残片向外翻卷）
  const remGeo = (() => {
    const cols = 28, rows = 10, Rr = mulberry(0x7ea2)
    const depth: number[] = []
    for (let j = 0; j <= cols; j++) {
      const jj = j % cols
      if (depth[jj] !== undefined) { depth.push(depth[jj]); continue }
      let d = 0.42 + Rr() * 0.22 + (jj % 2 ? 0.18 : -0.05) // 撕裂线（0=顶，1=赤道以下）
      if (Rr() < 0.18) d += 0.35 + Rr() * 0.25 // 长垂片
      depth.push(Math.min(1.25, d))
    }
    const pos: number[] = [], uv: number[] = [], idx: number[] = []
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
      const a = (j / cols) * Math.PI * 2
      const th = (i / rows) * depth[j] * Math.PI * 0.62 // 极角
      const flare = 1 + Math.max(0, i / rows - 0.6) * 0.35 * depth[j] // 撕裂边外翻
      const sy = Math.cos(th), sr = Math.sin(th) * flare
      pos.push(Math.cos(a) * sr, sy - (i === rows ? 0.02 : 0), Math.sin(a) * sr); uv.push(j / cols, 1 - (i / rows) * depth[j] * 0.62)
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { const a = i * (cols + 1) + j, b = a + cols + 1; idx.push(a, b, a + 1, b, b + 1, a + 1) }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals()
    return g
  })()
  const shellIM = new THREE.InstancedMesh(shellGeo, shell, n); shellIM.name = 'nestSacShell'; shellIM.renderOrder = 2
  const liqIM = new THREE.InstancedMesh(liqGeo, liquid, n); liqIM.name = 'nestSacLiquid'; liqIM.renderOrder = 1
  const remIM = new THREE.InstancedMesh(remGeo, remnant, n); remIM.name = 'nestSacRemnant'; remIM.renderOrder = 2
  for (const im of [shellIM, liqIM, remIM]) { im.frustumCulled = false; im.userData.noCastShadow=true; group.add(im) }
  const M = new THREE.Matrix4(), Z = new THREE.Matrix4().makeScale(0, 0, 0), Qt = new THREE.Quaternion()
  const setAt = (im: THREE.InstancedMesh, i: number, on: boolean, c: V3, s: number, sy = 1) => {
    im.setMatrixAt(i, on ? M.compose(c, Qt, V(s, s * sy, s)) : Z); im.instanceMatrix.needsUpdate = true
  }
  const setThread = (i: number, on: boolean) => {
    const arr = (lg.attributes.position as THREE.BufferAttribute).array as Float32Array
    const [a, b] = threadRange[i]
    for (let k = a; k < b; k++) arr[k] = on ? threadBase[k] : 0
    if (!on) for (let k = a; k < b; k += 3) { arr[k] = threadBase[a]; arr[k + 1] = 0; arr[k + 2] = threadBase[a + 2] } // 收成天花板上的一点
    lg.attributes.position.needsUpdate = true
  }
  const handles: NguithrSacHandle[] = sacs.map((s, i) => {
    const h: NguithrSacHandle = {
      index: i, center: s.c.clone(), radius: s.r, state: 'intact',
      show() { h.state = 'intact'; setAt(shellIM, i, true, s.c, s.r); setAt(liqIM, i, true, V(s.c.x, s.c.y - s.r * 0.06, s.c.z), s.r * 0.93, 1.08); setAt(remIM, i, false, s.c, s.r); setThread(i, true) },
      hide() { h.state = 'hidden'; setAt(shellIM, i, false, s.c, s.r); setAt(liqIM, i, false, s.c, s.r); setAt(remIM, i, false, s.c, s.r); setThread(i, false) },
      pop() { h.state = 'popped'; setAt(shellIM, i, false, s.c, s.r); setAt(liqIM, i, false, s.c, s.r); setAt(remIM, i, true, s.c, s.r * 1.02); setThread(i, true) },
    }
    h.show()
    return h
  })
  const handle: NguithrNestHandle = {
    group, sacs: handles, radius: 1.45,
    materials: { web, thread, shell, liquid },
    setSacGlow(emissive: number, specular?: number) {
      const l = liquid as THREE.MeshPhongMaterial
      l.emissiveIntensity = emissive
      if (specular !== undefined) {
        if ((l as THREE.MeshPhongMaterial).isMeshPhongMaterial) { l.specular.setRGB(specular, specular * 0.95, specular * 0.75); (shell as THREE.MeshPhongMaterial).specular.setScalar(specular * 0.25) }
        else { (liquid as THREE.MeshPhysicalMaterial).clearcoat = Math.min(1, specular); (liquid as THREE.MeshPhysicalMaterial).roughness = Math.max(0.04, 0.3 - specular * 0.2) }
      }
    },
  }
  group.userData.nguithrNest = handle
  return group
}

/** 取巢句柄 */
export function nguithrNest(group: THREE.Object3D): NguithrNestHandle | undefined { return group.userData.nguithrNest as NguithrNestHandle | undefined }
