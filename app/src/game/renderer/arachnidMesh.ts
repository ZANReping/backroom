import {disposeL8Tree} from './l8ModelResources'
// L8 蛛形纲（Entity 蛛形纲 / L8 洞穴系统）重制模型——阶段 1：静态模型与预览（不含动画/AI）。
// 共 18 项：蜘蛛 7 种、符文强化（蒙面教会象形魔法改造）6 种、蝎 2 种、蜱 1 种、螨群 1 种，外加环境件「符文蛛巢」。
// 造型：头胸部/腹部为逐顶点雕刻的球体（形状、花纹、发光量都由方向函数给出）；腿、螯肢、触肢、尾节为沿样条扫掠的管体，
// 毛/刺为细锥合并进同一几何。贴图全部运行时程序化生成（几丁质细纹、熔岩甲片、蛛网、裹茧丝、符文图集），无外部资源。
// 发光：所有身体材质接入同一个顶点属性 glow（关节缝、毒腺、裂纹），由 uGlow 颜色放大后加到自发光；
// 符文另用一层贴合体表的加色发光壳（青紫色象形符文贴图）。
// 骨架：root（身体中心）→ ceph（头胸）→ 每条腿 [coxa 基节偏航, femur 腿节抬落, tibia 胫跗屈伸]、螯肢、触肢；
// ceph → abdomen（腹柄处铰接）→ 尾/鞭/尾须链。所有关节组旋转为 0 时为静止站姿；模型正面 +X，脚底在 y=0。
// 关节链的几何按「整体坐标减去关节点」放置，所以每个关节组的 position 就是关节点，旋转即绕关节转动。
import * as THREE from 'three'
import { rng, merge, V, gauss, sstep, cap, sweep, canvasTex as sourceCanvasTex } from './houndMesh'

// ======================================================================
// 变种表
// ======================================================================
export type ArachnidVariant =
  | 'wolf' | 'weaver' | 'jumper' | 'blindcave' | 'broodswarm' | 'harvestman' | 'diving'
  | 'colossus' | 'widow' | 'regen' | 'undying' | 'fireproof' | 'anoxic'
  | 'cavescorpion' | 'whipscorpion' | 'tick' | 'mitecloud' | 'runenest'

export interface ArachnidVariantInfo { id: ArachnidVariant; name: string; desc: string; length: number; group: '蜘蛛' | '符文强化' | '蝎' | '蜱' | '螨' | '环境' }
export const ARACHNID_VARIANTS: ArachnidVariantInfo[] = [
  { id: 'wolf', name: '洞穴狼蛛', desc: '粗壮多毛的褐灰色猎蛛，八眼中一对大前眼', length: 0.6, group: '蜘蛛' },
  { id: 'weaver', name: '织网蛛', desc: '细长环纹腿，大而圆的花纹腹部，吐丝器外露', length: 0.5, group: '蜘蛛' },
  { id: 'jumper', name: '跳蛛', desc: '短胖毛绒，一对反光的巨大前中眼，粗壮前腿', length: 0.35, group: '蜘蛛' },
  { id: 'blindcave', name: '盲眼洞蛛', desc: '苍白半透明、无眼，极长的触肢在前方探路', length: 0.5, group: '蜘蛛' },
  { id: 'broodswarm', name: '群居幼蛛潮', desc: '几十只 4–6cm 幼蛛成群涌动，可带一只背幼蛛的母蛛', length: 0.05, group: '蜘蛛' },
  { id: 'harvestman', name: '长脚盲蛛', desc: '豆粒般的小身体高悬在约 1.6m 跨度的细长腿上', length: 0.15, group: '蜘蛛' },
  { id: 'diving', name: '水蛛', desc: '深色身体，腹部裹着一层银色气泡膜，后腿带泳毛', length: 0.4, group: '蜘蛛' },
  { id: 'colossus', name: '极巨蛛', desc: '体长 2.2m、腿跨 4m 以上的重甲巨蛛，背负大块符文', length: 2.2, group: '符文强化' },
  { id: 'widow', name: '寡妇毒蛛', desc: '黑亮球腹，腹下红沙漏，发光毒腺与滴毒螯牙', length: 0.6, group: '符文强化' },
  { id: 'regen', name: '再生蛛', desc: '外露的肉粉色组织，新长出的苍白短肢，符文缝合线', length: 0.7, group: '符文强化' },
  { id: 'undying', name: '不死蛛', desc: '干枯如尸，甲壳破洞露出发光符文内核，缺腿仍站立', length: 0.8, group: '符文强化' },
  { id: 'fireproof', name: '抗火蛛', desc: '赤褐焦黑的熔岩甲片，裂缝与关节缝透出橙光', length: 0.7, group: '符文强化' },
  { id: 'anoxic', name: '无氧蛛', desc: '无书肺开口的灰白陶瓷密封甲壳，头胸覆密封面甲', length: 0.6, group: '符文强化' },
  { id: 'cavescorpion', name: '洞蝎', desc: '一对大螯、五节上卷的尾与弯钩尾刺', length: 0.8, group: '蝎' },
  { id: 'whipscorpion', name: '鞭蝎', desc: '扁平身体、粗短刺螯、细长鞭状尾须，尾基酸腺黄绿发光', length: 0.6, group: '蝎' },
  { id: 'tick', name: '吸附蜱', desc: '扁平椭圆、口器前突带倒钩；吸血后腹部鼓成灰紫色球', length: 0.25, group: '蜱' },
  { id: 'mitecloud', name: '螨群', desc: '数百只 3–8mm 红色/米色小螨聚成约 1m 的一团', length: 1.0, group: '螨' },
  { id: 'runenest', name: '符文蛛巢', desc: '洞角厚蛛网、裹茧猎物与网上发光的蒙面教会符文', length: 2.2, group: '环境' },
]

// ======================================================================
// 通用工具
// ======================================================================
type C3 = [number, number, number]
type G = THREE.BufferGeometry
const mix = (a: C3, b: C3, t: number): C3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const mul = (a: C3, k: number): C3 => [a[0] * k, a[1] * k, a[2] * k]
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const fract = (x: number) => x - Math.floor(x)

/** 统一顶点属性（position/normal/uv/color/glow），保证可以合并；c 会乘到已有顶点色上 */
function fin(g: G, c: number | C3 = 1, glow = 0): G {
  const n = g.attributes.position.count
  if (!g.attributes.normal) g.computeVertexNormals()
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2))
  const cc: C3 = typeof c === 'number' ? [c, c, c] : c
  const col = g.attributes.color as THREE.BufferAttribute | undefined
  if (!col) {
    const a = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) a.set(cc, i * 3)
    g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3))
  } else if (cc[0] !== 1 || cc[1] !== 1 || cc[2] !== 1) {
    for (let i = 0; i < n; i++) col.setXYZ(i, col.getX(i) * cc[0], col.getY(i) * cc[1], col.getZ(i) * cc[2])
  }
  if (!g.attributes.glow) g.setAttribute('glow', new THREE.Float32BufferAttribute(new Float32Array(n).fill(glow), 1))
  return g
}
const mergeAll = (gs: G[]) => merge(gs.map((g) => fin(g)))
/** 三角形数（非索引几何按顶点数/3） */
const triCount = (g: G) => (g.index ? g.index.count : g.attributes.position.count) / 3

/** 身体材质：Phong + 顶点色 + 顶点 glow 自发光 */
function bodyMat(o: THREE.MeshPhongMaterialParameters, glowCol: THREE.ColorRepresentation = '#000000', glowK = 1) {
  const m = new THREE.MeshPhongMaterial({ vertexColors: true, ...o })
  const u = { uGlow: { value: new THREE.Color(glowCol).multiplyScalar(glowK) } }
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uGlow;\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlow * vGlow;')
  }
  m.customProgramCacheKey = () => 'arachGlow'
  m.userData.glow = u
  return m
}

// ======================================================================
// 程序化贴图（全部共享缓存）
// ======================================================================
const tile = (S: number, f: (ox: number, oy: number) => void) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) f(ox, oy) }
let TEX: { chitin: THREE.Texture | null; lava: THREE.Texture | null; lavaGlow: THREE.Texture | null; web: THREE.Texture | null; silk: THREE.Texture | null; glaze: THREE.Texture | null } | null = null
export function* prepareArachnidTextures(): Generator<void, NonNullable<typeof TEX>, unknown>  {
  if (TEX) return TEX
  // 几丁质：中性灰底，细密颗粒、短纵纹、浅色小凹点（颜色由材质/顶点色给）
  const chitin = canvasTex(256, 256, (c, R) => {
    c.fillStyle = '#c9c9c9'; c.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 180; i++) {
      const x = R() * 256, y = R() * 256, r = 4 + R() * 16, a = 0.05 + R() * 0.08, dark = R() < 0.55
      tile(256, (ox, oy) => { c.fillStyle = dark ? `rgba(60,60,60,${a})` : `rgba(255,255,255,${a})`; c.beginPath(); c.arc(x + ox, y + oy, r, 0, Math.PI * 2); c.fill() })
    }
    for (let i = 0; i < 260; i++) { const x = R() * 256, y = R() * 256, l = 3 + R() * 9; tile(256, (ox, oy) => { c.fillStyle = 'rgba(40,40,40,0.22)'; c.fillRect(x + ox, y + oy, 0.8, l) }) }
    for (let i = 0; i < 300; i++) { const x = R() * 256, y = R() * 256; tile(256, (ox, oy) => { c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x + ox, y + oy, 1.4, 1.4) }) }
    const img = c.getImageData(0, 0, 256, 256), d = img.data
    for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n }
    c.putImageData(img, 0, 0)
  }, true)
  yield;
  // 熔岩甲片：焦黑多边形甲片 + 赤褐边 + 缝隙；lavaGlow 只画缝隙（作自发光贴图）
  const cells: { x: number; y: number }[] = []
  yield;
  { const R = rng(0x1a7a); for (let i = 0; i < 46; i++) cells.push({ x: R() * 256, y: R() * 256 }) }
  yield;
  const EDGE = new Float32Array(256 * 256)
  yield; // 到甲片边界的距离（算一次，两张贴图共用）
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    let d1 = 1e9, d2 = 1e9
    for (const p of cells) for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
      const dd = (x - p.x - ox) ** 2 + (y - p.y - oy) ** 2
      if (dd < d1) { d2 = d1; d1 = dd } else if (dd < d2) d2 = dd
    }
    EDGE[y * 256 + x] = Math.sqrt(d2) - Math.sqrt(d1)
    if (x===255 && y%4===3) yield;
  }
  yield;
  const voro = (c: CanvasRenderingContext2D, glow: boolean) => {
    const img = c.createImageData(256, 256), d = img.data
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const edge = EDGE[y * 256 + x]
      const k = (y * 256 + x) * 4
      if (glow) { const g = Math.max(0, 1 - edge / 2.6); d[k] = 255 * g; d[k + 1] = 150 * g * g; d[k + 2] = 40 * g * g * g }
      else {
        const crack = edge < 2.2 ? 0.15 : 1, rim = sstep(2, 9, edge), n = 0.85 + 0.3 * Math.sin(x * 0.7 + y * 0.31) * Math.sin(y * 0.53 - x * 0.2)
        d[k] = (60 + 60 * (1 - rim)) * crack * n; d[k + 1] = (40 + 22 * (1 - rim)) * crack * n; d[k + 2] = (32 + 10 * (1 - rim)) * crack * n
      }
      d[k + 3] = 255
    }
    c.putImageData(img, 0, 0)
  }
  yield;
  const lava = canvasTex(256, 256, (c) => voro(c, false), true)
  yield;
  const lavaGlow = canvasTex(256, 256, (c) => voro(c, true), true)
  yield;
  // 片网：杂乱交织的丝线（透明背景，白丝）
  const web = canvasTex(512, 512, (c, R) => {
    c.clearRect(0, 0, 512, 512); c.lineCap = 'round'
    for (let i = 0; i < 900; i++) {
      const x = R() * 512, y = R() * 512, a = R() * Math.PI, l = 20 + R() * 200, al = 0.12 + R() * 0.32
      const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l, bx = (R() - 0.5) * 30, by = (R() - 0.5) * 30, w = 0.6 + R() * 1.1
      tile(512, (ox, oy) => { c.strokeStyle = `rgba(240,238,230,${al})`; c.lineWidth = w; c.beginPath(); c.moveTo(x + ox, y + oy); c.quadraticCurveTo((x + x2) / 2 + bx + ox, (y + y2) / 2 + by + oy, x2 + ox, y2 + oy); c.stroke() })
    }
    for (let i = 0; i < 60; i++) { // 积尘的密丝团
      const x = R() * 512, y = R() * 512, r = 10 + R() * 40
      tile(512, (ox, oy) => { const gr = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, 'rgba(225,222,212,0.35)'); gr.addColorStop(1, 'rgba(225,222,212,0)'); c.fillStyle = gr; c.fillRect(x + ox - r, y + oy - r, r * 2, r * 2) })
    }
  }, true)
  yield;
  // 裹茧丝（阶段 2 加强）：米白底，两组相反斜向的缠绕丝带，每根丝一条暗影 + 一条高光，丝带之间露出发暗的缝隙
  const silk = canvasTex(256, 256, (c, R) => {
    c.fillStyle = '#b9b09c'; c.fillRect(0, 0, 256, 256)
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 70; i++) {
      const y = R() * 256, s = (pass ? -1 : 1) * (0.35 + R() * 0.35), w = 2 + R() * 4, t = 205 + R() * 45
      for (const oy of [-256, 0, 256]) {
        c.lineCap = 'round'
        c.strokeStyle = 'rgba(70,60,45,0.45)'; c.lineWidth = w + 2; c.beginPath(); c.moveTo(-10, y + oy + 1.5); c.lineTo(266, y + oy + 1.5 + s * 276); c.stroke()
        c.strokeStyle = `rgba(${t},${t * 0.97},${t * 0.9},0.9)`; c.lineWidth = w; c.beginPath(); c.moveTo(-10, y + oy); c.lineTo(266, y + oy + s * 276); c.stroke()
        c.strokeStyle = 'rgba(255,253,245,0.5)'; c.lineWidth = Math.max(0.6, w * 0.25); c.beginPath(); c.moveTo(-10, y + oy - w * 0.25); c.lineTo(266, y + oy - w * 0.25 + s * 276); c.stroke()
      }
    }
    for (let i = 0; i < 40; i++) { const x = R() * 256, y = R() * 256, r = 4 + R() * 12; c.fillStyle = 'rgba(100,86,64,0.14)'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill() }
  }, true)
  yield;
  // 陶瓷釉面：极淡的开片细纹
  const glaze = canvasTex(256, 256, (c, R) => {
    c.fillStyle = '#efefef'; c.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 40; i++) {
      let x = R() * 256, y = R() * 256, a = R() * 6.28
      const pts: [number, number][] = [[x, y]]
      for (let k = 0; k < 6; k++) { a += (R() - 0.5) * 1.6; x += Math.cos(a) * 12; y += Math.sin(a) * 12; pts.push([x, y]) }
      tile(256, (ox, oy) => { c.strokeStyle = 'rgba(120,120,120,0.22)'; c.lineWidth = 0.7; c.beginPath(); pts.forEach(([px, py], k) => k ? c.lineTo(px + ox, py + oy) : c.moveTo(px + ox, py + oy)); c.stroke() })
    }
  }, true)
  yield;
  TEX = { chitin, lava, lavaGlow, web, silk, glaze }
  yield;
  return TEX
}

// ---------- 蒙面教会象形符文 ----------
// 图元：面具（无口、两道眼缝）、独眼、八足圈、三指手、同心圆十字、蒙面立像、螺旋、梯形竖符
type Glyph = (c: CanvasRenderingContext2D, x: number, y: number, s: number) => void
const GLYPHS: Glyph[] = [
  (c, x, y, s) => { c.beginPath(); c.ellipse(x, y, s * 0.36, s * 0.46, 0, 0, Math.PI * 2); c.stroke(); for (const k of [-1, 1]) { c.beginPath(); c.moveTo(x + k * s * 0.08, y - s * 0.08); c.lineTo(x + k * s * 0.26, y - s * 0.12); c.stroke() } c.beginPath(); c.moveTo(x, y - s * 0.46); c.lineTo(x, y - s * 0.2); c.moveTo(x - s * 0.2, y + s * 0.22); c.lineTo(x + s * 0.2, y + s * 0.22); c.stroke() },
  (c, x, y, s) => { c.beginPath(); c.moveTo(x - s * 0.45, y); c.quadraticCurveTo(x, y - s * 0.4, x + s * 0.45, y); c.quadraticCurveTo(x, y + s * 0.4, x - s * 0.45, y); c.stroke(); c.beginPath(); c.arc(x, y, s * 0.12, 0, Math.PI * 2); c.stroke(); for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(x + k * s * 0.16, y - s * 0.28); c.lineTo(x + k * s * 0.22, y - s * 0.46); c.stroke() } },
  (c, x, y, s) => { c.beginPath(); c.arc(x, y, s * 0.16, 0, Math.PI * 2); c.stroke(); for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; c.beginPath(); c.moveTo(x + Math.cos(a) * s * 0.16, y + Math.sin(a) * s * 0.16); c.lineTo(x + Math.cos(a) * s * 0.34, y + Math.sin(a) * s * 0.3); c.lineTo(x + Math.cos(a) * s * 0.46, y + Math.sin(a) * s * 0.46 + s * 0.08); c.stroke() } },
  (c, x, y, s) => { c.beginPath(); c.moveTo(x - s * 0.2, y + s * 0.42); c.lineTo(x - s * 0.22, y); c.lineTo(x + s * 0.22, y); c.lineTo(x + s * 0.2, y + s * 0.42); c.stroke(); for (const k of [-0.16, 0, 0.16]) { c.beginPath(); c.moveTo(x + k * s, y); c.lineTo(x + k * s * 1.3, y - s * 0.44); c.stroke() } c.beginPath(); c.arc(x, y + s * 0.2, s * 0.06, 0, Math.PI * 2); c.stroke() },
  (c, x, y, s) => { for (const r of [0.18, 0.32, 0.46]) { c.beginPath(); c.arc(x, y, s * r, 0, Math.PI * 2); c.stroke() } c.beginPath(); c.moveTo(x - s * 0.46, y); c.lineTo(x + s * 0.46, y); c.moveTo(x, y - s * 0.46); c.lineTo(x, y + s * 0.46); c.stroke() },
  (c, x, y, s) => { c.beginPath(); c.arc(x, y - s * 0.28, s * 0.14, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(x - s * 0.14, y - s * 0.3); c.lineTo(x + s * 0.14, y - s * 0.3); c.stroke(); c.beginPath(); c.moveTo(x, y - s * 0.12); c.lineTo(x - s * 0.3, y + s * 0.46); c.lineTo(x + s * 0.3, y + s * 0.46); c.closePath(); c.stroke(); c.beginPath(); c.moveTo(x - s * 0.36, y - s * 0.02); c.lineTo(x + s * 0.36, y - s * 0.02); c.stroke() },
  (c, x, y, s) => { c.beginPath(); for (let k = 0; k <= 60; k++) { const a = k / 60 * Math.PI * 5, r = s * 0.46 * k / 60; k ? c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : c.moveTo(x, y) } c.stroke() },
  (c, x, y, s) => { c.beginPath(); c.moveTo(x - s * 0.12, y - s * 0.46); c.lineTo(x - s * 0.12, y + s * 0.46); c.moveTo(x + s * 0.12, y - s * 0.46); c.lineTo(x + s * 0.12, y + s * 0.46); for (let k = -2; k <= 2; k++) { c.moveTo(x - s * 0.12, y + k * s * 0.18); c.lineTo(x + s * 0.12, y + k * s * 0.18 + s * 0.06) } c.moveTo(x - s * 0.3, y - s * 0.46); c.lineTo(x + s * 0.3, y - s * 0.46); c.stroke() },
]
function runeStyle(c: CanvasRenderingContext2D, w: number) { c.strokeStyle = '#3fe0ff'; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.shadowColor = '#a050ff'; c.shadowBlur = w * 4 }
const RUNE_TEX = new Map<string, THREE.Texture | null>()
/** 符文贴图：layout = back（背部大符文阵）| ring（散布小符文）| stitch（缝合线）| core（内核密符）| visor（面甲横符）| atlas（4×2 单符图集，蛛巢用） */
function runeTex(layout: string, seed = 0) {
  seed = Math.abs(Math.floor(seed)) % 4 // Bounded shared rune atlas variants.
  const key = layout + seed
  if (RUNE_TEX.has(key)) return RUNE_TEX.get(key)!
  const S = 512
  const t = canvasTex(S, S, (c) => {
    const R = rng(0x7e11 + seed * 31 + layout.length * 7)
    c.clearRect(0, 0, S, S)
    const g = (i: number, x: number, y: number, s: number, w: number) => { runeStyle(c, w); GLYPHS[i % GLYPHS.length](c, x, y, s); c.shadowBlur = 0; c.strokeStyle = 'rgba(200,250,255,0.9)'; c.lineWidth = w * 0.35; GLYPHS[i % GLYPHS.length](c, x, y, s) }
    if (layout === 'back') {
      g(0, 256, 250, 190, 9)
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.3; g(k + 1, 256 + Math.cos(a) * 165, 250 + Math.sin(a) * 150, 70, 6) }
      runeStyle(c, 4); c.beginPath(); c.ellipse(256, 250, 215, 200, 0, 0, Math.PI * 2); c.stroke()
      c.beginPath(); c.ellipse(256, 250, 112, 104, 0, 0, Math.PI * 2); c.stroke()
    } else if (layout === 'ring') {
      g(0, 256, 236, 150, 15)
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; g(k + 1, 256 + Math.cos(a) * 170, 246 + Math.sin(a) * 160, 74, 10) }
    } else if (layout === 'stitch') {
      // 缝合线：几道弯曲的发光缝 + 横向针脚，缝端各一个小符文
      for (let k = 0; k < 4; k++) {
        const pts: [number, number][] = []
        let x = 70 + R() * 80, y = 90 + k * 95 + R() * 30
        for (let j = 0; j < 9; j++) { pts.push([x, y]); x += 38 + R() * 12; y += (R() - 0.5) * 34 }
        runeStyle(c, 9); c.beginPath(); pts.forEach(([px, py], j) => j ? c.lineTo(px, py) : c.moveTo(px, py)); c.stroke()
        runeStyle(c, 6)
        for (let j = 0; j < pts.length - 1; j++) for (const f of [0.25, 0.75]) { const px = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f, py = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f; c.beginPath(); c.moveTo(px - 4, py - 14); c.lineTo(px + 4, py + 14); c.stroke() }
        g(k + 2, pts[0][0] - 30, pts[0][1], 50, 7)
      }
    } else if (layout === 'core') {
      c.fillStyle = '#2c1858'; c.fillRect(0, 0, S, S) // 内核底色：暗紫微光
      for (let k = 0; k < 22; k++) g(k, 50 + (k % 6) * 84 + R() * 10, 60 + Math.floor(k / 6) * 120 + R() * 16, 62, 5)
    } else if (layout === 'visor') {
      runeStyle(c, 12); c.beginPath(); c.moveTo(50, 262); c.lineTo(462, 262); c.stroke()
      for (let k = 0; k < 5; k++) g(k + 1, 100 + k * 78, 190, 62, 8)
      g(0, 256, 350, 110, 10)
    } else { // atlas 4×2
      for (let k = 0; k < 8; k++) g(k, 64 + (k % 4) * 128, 64 + Math.floor(k / 4) * 128, 76, 5)
      for (let k = 0; k < 8; k++) g(k + 3, 64 + (k % 4) * 128, 320 + Math.floor(k / 4) * 128, 76, 5)
    }
  }, false)
  if (t) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping }
  RUNE_TEX.set(key, t)
  return t
}
function runeMat(tex: THREE.Texture | null, k = 1.5, additive = false) {
  // 普通混合（不用加色）：符文压在浅色甲壳（如无氧蛛的白陶瓷）上也能看清；alphaMap 取贴图绿通道
  return new THREE.MeshLambertMaterial({ color: '#000000', emissive: new THREE.Color('#ffffff').multiplyScalar(k), emissiveMap: tex, alphaMap: tex, transparent: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })
}

// ======================================================================
// 体块：逐顶点雕刻的椭球
// ======================================================================
type BF = (d: THREE.Vector3) => { s?: number; c?: C3; g?: number }
function blob(r: C3, f: BF, ws = 32, hs = 22, off: THREE.Vector3 = V(0, 0, 0)): G {
  const g = new THREE.SphereGeometry(1, ws, hs)
  const pa = g.attributes.position as THREE.BufferAttribute, n = pa.count
  const col = new Float32Array(n * 3), gl = new Float32Array(n), d = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    d.fromBufferAttribute(pa, i).normalize()
    const k = f(d), s = k.s ?? 1
    pa.setXYZ(i, d.x * r[0] * s + off.x, d.y * r[1] * s + off.y, d.z * r[2] * s + off.z)
    col.set(k.c ?? [1, 1, 1], i * 3); gl[i] = k.g ?? 0
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('glow', new THREE.Float32BufferAttribute(gl, 1))
  g.computeVertexNormals()
  return g
}
/** 椭球表面点（与 blob 同一形状函数） */
const blobPt = (r: C3, f: BF, d: THREE.Vector3, off: THREE.Vector3 = V(0, 0, 0)) => { const dn = d.clone().normalize(), s = f(dn).s ?? 1; return V(dn.x * r[0] * s + off.x, dn.y * r[1] * s + off.y, dn.z * r[2] * s + off.z) }
/** 贴合体表的符文壳：同形略外扩；uv 按 axis 平面投影（top=俯视 xz，front=正视 zy），只在朝向一侧有图案 */
function runeShell(r: C3, f: BF, off: THREE.Vector3, axis: 'top' | 'front' | 'sphere', grow = 1.025, zoom = 1) {
  const g = blob(mul(r, grow), f, 32, 22, off)
  if (axis === 'sphere') return g
  const pa = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < pa.count; i++) {
    const x = (pa.getX(i) - off.x) / (r[0] * grow), y = (pa.getY(i) - off.y) / (r[1] * grow), z = (pa.getZ(i) - off.z) / (r[2] * grow)
    // 背向一侧的顶点不再塌到 (0,0)（跨界三角形会把符文拉成横纹），而是沿径向推到贴图透明边框之外
    if (axis === 'top') { const k = (1 + Math.max(0, 0.25 - y) * 10) * 0.5 * zoom; uv.setXY(i, 0.5 - z * k, 0.5 - x * k) }
    else { const k = (1 + Math.max(0, 0.25 - x) * 10) * 0.5 * zoom; uv.setXY(i, 0.5 + z * k, 0.5 + y * k) }
  }
  return g
}

/** 沿样条撒毛/刺（细锥）。fringe=只沿管体两侧水平方向排成「泳毛梳」 */
function hairs(out: G[], pts: THREE.Vector3[], rAt: (t: number) => number, n: number, len: number, R: () => number, col: C3, o: { spine?: boolean; lean?: number; fringe?: boolean; from?: number; to?: number; glow?: number } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
  const P = new THREE.Vector3(), T = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    const t = (o.from ?? 0.05) + R() * ((o.to ?? 0.95) - (o.from ?? 0.05))
    curve.getPointAt(t, P); curve.getTangentAt(t, T)
    let nn: THREE.Vector3
    if (o.fringe) nn = V(0, 0, R() < 0.5 ? 1 : -1).addScaledVector(T, -T.z).normalize()
    else nn = new THREE.Vector3().crossVectors(T, V(R() - 0.5, R() - 0.5, R() - 0.5).normalize()).normalize()
    if (!o.fringe && nn.y < -0.3 && R() < 0.6) nn.y = -nn.y // 毛多长在上侧
    const l = len * (0.6 + R() * 0.7), r = o.spine ? len * 0.11 : len * 0.045
    const dir = nn.clone().addScaledVector(T, o.lean ?? 0.6).normalize()
    const g = new THREE.ConeGeometry(r, l, o.spine ? 4 : 3, 1, true).translate(0, l / 2, 0)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir))
    const base = P.clone().addScaledVector(nn, rAt(t) * 0.85)
    g.translate(base.x, base.y, base.z)
    out.push(fin(g, mul(col, 0.85 + R() * 0.3), o.glow ?? 0))
  }
}
/** 椭球表面撒毛 */
function blobHairs(out: G[], r: C3, f: BF, off: THREE.Vector3, n: number, len: number, R: () => number, col: C3, keep: (d: THREE.Vector3) => boolean = () => true, spine = false) {
  for (let i = 0, tries = 0; i < n && tries < n * 6; tries++) {
    const d = V(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1); if (d.lengthSq() > 1 || d.lengthSq() < 0.01) continue
    d.normalize(); if (!keep(d)) continue
    i++
    const p = blobPt(r, f, d, off), nn = V(d.x / r[0], d.y / r[1], d.z / r[2]).normalize()
    const l = len * (0.6 + R() * 0.7), rr = spine ? len * 0.12 : len * 0.05
    const dir = nn.clone().add(V(-0.7, 0.05, 0)).add(V(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(0.4)).normalize()
    const g = new THREE.ConeGeometry(rr, l, spine ? 4 : 3, 1, true).translate(0, l / 2, 0)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), spine ? nn : dir))
    g.translate(p.x - nn.x * l * 0.08, p.y - nn.y * l * 0.08, p.z - nn.z * l * 0.08)
    out.push(fin(g, mul(col, 0.85 + R() * 0.3)))
  }
}

/** 管体：沿 pts 扫掠，半径 r(t)，顶点色 col(t)，发光 glow(t) */
function tube(pts: THREE.Vector3[], r: (t: number) => number, col: (t: number) => C3, glow: (t: number) => number = () => 0, radial = 7, seg = 10, flat = 1): G {
  const g = sweep(pts, (t, _d, cs, sn) => r(t) * cap(t, 0.08) / Math.sqrt(cs * cs + (sn / flat) ** 2), { radial, seg, vRep: 2 })
  const n = g.attributes.position.count, cl = g.attributes.color as THREE.BufferAttribute, gl = new Float32Array(n)
  for (let i = 0; i < n; i++) { const t = Math.floor(i / (radial + 1)) / seg, c = col(t), s = cl.getX(i); cl.setXYZ(i, c[0] * s, c[1] * s, c[2] * s); gl[i] = glow(t) }
  g.setAttribute('glow', new THREE.Float32BufferAttribute(gl, 1))
  return g
}
const ball = (r: number, p: THREE.Vector3, c: C3 | number = 1, glow = 0, w = 8, h = 6) => fin(new THREE.SphereGeometry(r, w, h).translate(p.x, p.y, p.z), c, glow)
const cone = (r: number, l: number, base: THREE.Vector3, dir: THREE.Vector3, c: C3 | number = 1, seg = 6, glow = 0) => {
  const g = new THREE.ConeGeometry(r, l, seg).translate(0, l / 2, 0)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize()))
  return fin(g.translate(base.x, base.y, base.z), c, glow)
}

// ======================================================================
// 腿：coxa（基节，绕 Y 偏航）→ femur（腿节，绕 Z 抬落）→ tibia（胫节+后跗+跗节，绕 Z 屈伸）
// 腿局部坐标：+X 指向外侧，+Y 向上；静止时足尖正好落在地面
// ======================================================================
interface LegOpt {
  len: number; up: number; r: number; hipH: number; ff?: number
  col?: (t: number, part: 0 | 1) => C3; glow?: (t: number, part: 0 | 1) => number; joint?: number
  hair?: number; hairLen?: number; hairCol?: C3; spines?: number; fringe?: boolean
  /** 覆盖胫节末端（相对膝关节）：用于前伸触腿、悬空的再生短肢 */
  tip?: THREE.Vector3; bow?: number
  /** 断肢残桩：只有一截带断口的腿节 */
  stump?: boolean
  radial?: number
  /** 关节球相对腿粗的倍数（默认 1；极巨蛛缩小让关节融进腿里） */
  jointR?: number
}
interface LegRec { j: THREE.Group[]; side: number; idx: number; missing?: boolean; feeler?: boolean; regrow?: boolean }
/** 腿的几何参数（阶段 2 动画的 IK 用）：K=膝点（腿节局部），F=足尖（相对膝点，胫节局部） */
export interface ArachnidLegGeo { K: THREE.Vector3; F: THREE.Vector3; stump: boolean }
function buildLeg(parent: THREE.Object3D, at: THREE.Vector3, phi: number, side: number, o: LegOpt, mat: THREE.Material, R: () => number): THREE.Group[] {
  const coxa = new THREE.Group(); coxa.position.copy(at); coxa.rotation.y = -side * phi; parent.add(coxa)
  const femur = new THREE.Group(); coxa.add(femur)
  const ff = o.ff ?? 0.42, a = o.len * ff, b = o.len - a, chord = b * 0.95
  let th = o.up
  for (let k = 0; k < 30 && !o.tip; k++) { if (chord > a * Math.sin(th) + o.hipH + 0.02 * o.len) break; th -= 0.05 }
  const K = V(a * Math.cos(th), a * Math.sin(th), 0)
  const tipR = o.r * 0.38
  const drop = K.y + o.hipH - tipR * 0.6
  const F = o.tip ?? V(Math.sqrt(Math.max(1e-4, chord * chord - drop * drop)), -drop, 0)
  const col = o.col ?? (() => [1, 1, 1] as C3), glow = o.glow ?? (() => 0)
  const rad = o.radial ?? 7
  const hairOut: G[] = []
  // 腿节（含基节小段与基部关节球）
  const fPts = o.stump ? [V(-o.r * 0.5, 0, 0), K.clone().multiplyScalar(0.18), K.clone().multiplyScalar(0.34)]
    : [V(-o.r * 0.5, 0, 0), K.clone().multiplyScalar(0.5).add(V(-Math.sin(th), Math.cos(th), 0).multiplyScalar(a * 0.07)), K]
  const fr = (t: number) => o.r * (1.12 - 0.2 * t) * (1 + 0.12 * gauss(t, 0.3, 0.2))
  const jr = o.jointR ?? 1
  const fg: G[] = [tube(fPts, fr, (t) => col(t, 0), (t) => glow(t, 0), rad, o.stump ? 5 : 9), ball(o.r * 1.15 * jr, V(0, 0, 0), col(0, 0), o.joint ?? 0)]
  if (o.stump) { // 断口：参差的碎片锥 + 发暗的断面
    const e = fPts[2]
    for (let k = 0; k < 5; k++) fg.push(cone(o.r * 0.35, o.r * (0.8 + R()), e.clone().add(V(0, (R() - 0.5) * o.r, (R() - 0.5) * o.r)), V(1, (R() - 0.5) * 1.4, (R() - 0.5) * 1.4), mul(col(1, 0), 0.6), 4))
  }
  if (o.hair) hairs(hairOut, fPts, fr, Math.round(o.hair * 0.45), o.hairLen ?? o.r * 1.6, R, o.hairCol ?? [0.5, 0.45, 0.4])
  if (o.spines) hairs(hairOut, fPts, fr, Math.round(o.spines * 0.4), o.r * 2.2, R, mul(col(0.5, 0), 0.8), { spine: true, lean: 0.9 })
  femur.add(new THREE.Mesh(mergeAll([...fg, ...hairOut]), mat))
  const tibia = new THREE.Group(); tibia.position.copy(K); femur.add(tibia)
  coxa.userData.leg = { K: K.clone(), F: F.clone(), stump: !!o.stump } as ArachnidLegGeo
  if (o.stump) return [coxa, femur, tibia]
  // 胫节→后跗节→跗节：中段向外上方略拱，末端渐细
  const p = V(-F.y, F.x, 0).normalize(), bw = (o.bow ?? 0.07) * F.length()
  const tPts = [V(0, 0, 0), F.clone().multiplyScalar(0.42).addScaledVector(p, bw), F.clone().multiplyScalar(0.8).addScaledVector(p, bw * 0.55), F]
  const tr = (t: number) => o.r * (0.95 - 0.6 * t) * (1 + 0.1 * gauss(t, 0.2, 0.12)) * (1 - 0.12 * gauss(t, 0.45, 0.03))
  const tg: G[] = [tube(tPts, tr, (t) => col(t, 1), (t) => glow(t, 1), rad, 12), ball(o.r * 1.0 * jr, V(0, 0, 0), col(0, 1), o.joint ?? 0)]
  const h2: G[] = []
  if (o.hair) hairs(h2, tPts, tr, Math.round(o.hair * 0.55), o.hairLen ?? o.r * 1.6, R, o.hairCol ?? [0.5, 0.45, 0.4], { to: 0.9 })
  if (o.spines) hairs(h2, tPts, tr, Math.round(o.spines * 0.6), o.r * 2, R, mul(col(0.5, 1), 0.8), { spine: true, lean: 1.1, to: 0.7 })
  if (o.fringe) hairs(h2, tPts, tr, 46, o.r * 3.2, R, [0.42, 0.4, 0.38], { fringe: true, lean: 0.25, from: 0.35, to: 0.95 })
  tibia.add(new THREE.Mesh(mergeAll([...tg, ...h2]), mat))
  return [coxa, femur, tibia]
}

// ======================================================================
// 装配记录（rig）
// ======================================================================
export interface ArachnidRig {
  variant: ArachnidVariant
  kind: 'spider' | 'scorpion' | 'whip' | 'tick' | 'swarm' | 'nest'
  root: THREE.Group
  body: { ceph: THREE.Group; abdomen: THREE.Group }
  /** 每条腿 [coxa, femur, tibia]；顺序为 左1..左4, 右1..右4（缺失的腿只剩残桩，仍在表中） */
  legs: THREE.Group[][]
  legInfo: { side: number; idx: number; missing?: boolean; feeler?: boolean; regrow?: boolean }[]
  chelicerae: THREE.Group[]
  pedipalps: THREE.Group[]
  /** 蝎螯：arm（整条螯臂 + 掌 + 固定指）与 finger（可动指，绕 Y 开合） */
  claws: { arm: THREE.Group; finger: THREE.Group; side: number }[]
  /** 尾节链（洞蝎后腹+尾刺 / 鞭蝎尾须），从根到梢 */
  tail: THREE.Group[]
  /** 蜱口器 */
  mouth?: THREE.Group
  /** 群体：幼蛛/螨的 InstancedMesh */
  swarm?: THREE.InstancedMesh[]
  /** 吸附蜱：吸血膨胀 0–1 */
  engorge?: number
  setEngorge?: (k: number) => void
  /** 身体中心离地高、身体底部离地高（姿势用） */
  hy: number; clear: number; pivotX: number
}
const rest = (g: THREE.Object3D) => { g.userData.r0 = g.rotation.clone(); g.userData.p0 = g.position.clone() }
function newRig(variant: ArachnidVariant, kind: ArachnidRig['kind'], grp: THREE.Group, hy: number): ArachnidRig {
  const root = new THREE.Group(); root.position.set(0, hy, 0); grp.add(root)
  const ceph = new THREE.Group(); root.add(ceph)
  const abdomen = new THREE.Group(); ceph.add(abdomen)
  return { variant, kind, root, body: { ceph, abdomen }, legs: [], legInfo: [], chelicerae: [], pedipalps: [], claws: [], tail: [], hy, clear: hy * 0.5, pivotX: 0 }
}
function addLeg(rig: ArachnidRig, rec: LegRec) { rig.legs.push(rec.j); rig.legInfo.push({ side: rec.side, idx: rec.idx, missing: rec.missing, feeler: rec.feeler, regrow: rec.regrow }) }
/** 关节链：每节几何用整体坐标给出，组放在关节点，几何减去关节点 */
function chainSeg(parent: THREE.Object3D, parentAt: THREE.Vector3, at: THREE.Vector3, geo: G[], mat: THREE.Material) {
  const g = new THREE.Group(); g.position.copy(at).sub(parentAt); parent.add(g)
  if (geo.length) g.add(new THREE.Mesh(mergeAll(geo).translate(-at.x, -at.y, -at.z), mat))
  return g
}

// ======================================================================
// 蜘蛛
// ======================================================================
interface SpiderSpec {
  hy: number
  ceph: C3; cephX: number
  abd: C3; abdX: number; abdY: number
  legs: number[]; legR: number; frontR?: number; up: number; ff?: number; phi?: number[]
  cephF: BF; abdF: BF
  legCol?: (i: number, t: number, part: 0 | 1) => C3
  mat: THREE.MeshPhongMaterialParameters
  glowCol?: string; glowK?: number; joint?: number; jointR?: number
  hair?: number; hairLen?: number; hairCol?: C3; bodyHair?: number; legSpines?: number
  eyes: [THREE.Vector3, number][]
  eyeMat?: THREE.MeshPhongMaterialParameters
  chel: { len: number; r: number; col: C3; venom?: boolean; glow?: number }
  palp: { len: number; r: number; feeler?: boolean; col?: C3 }
  spinner?: number
  runes?: { layout: string; on: 'abd' | 'ceph'; axis: 'top' | 'front'; zoom?: number; k?: number }[]
  fringeLegs?: number[]
  /** 腹部发光毒液小点的个数（寡妇毒蛛） */
  venomDots?: number
}
// 眼位：x 前、y 上、z 侧；在头胸部单位球方向上
const E = (x: number, y: number, z: number) => V(x, y, z).normalize()
const sym = (x: number, y: number, z: number, r: number): [THREE.Vector3, number][] => [[E(x, y, z), r], [E(x, y, -z), r]]

function spiderSpec(v: ArachnidVariant, R: () => number): SpiderSpec {
  const lean = (d: THREE.Vector3) => 1 - 0.18 * sstep(0.1, 1, -d.y) // 腹面略平
  switch (v) {
    case 'wolf': {
      const base: C3 = [0.36, 0.29, 0.22]
      return {
        hy: 0.15, ceph: [0.14, 0.085, 0.105], cephX: 0.12, abd: [0.18, 0.12, 0.13], abdX: -0.17, abdY: 0.015,
        legs: [0.58, 0.52, 0.5, 0.66], legR: 0.017, up: 0.8, eyes: [...sym(0.97, 0.05, 0.08, 0.009), ...sym(0.95, 0.05, 0.22, 0.008), ...sym(0.78, 0.48, 0.16, 0.024), ...sym(0.3, 0.84, 0.36, 0.015)],
        cephF: (d) => {
          const s = lean(d) + 0.12 * sstep(0, 0.8, d.x) * sstep(-0.1, 0.7, d.y)
          let c: C3 = base
          const ang = Math.atan2(d.z, -d.x)
          if (d.y > 0.25) c = mix(c, [0.24, 0.2, 0.16], 0.6 * sstep(0.5, 0.9, Math.sin(ang * 7) ** 2) * sstep(0.25, 0.6, d.y))
          c = mix(c, [0.7, 0.62, 0.5], gauss(d.z, 0, 0.13) * sstep(0.3, 0.8, d.y))
          if (d.y < -0.2) c = mul(c, 0.7)
          return { s, c }
        },
        abdF: (d) => {
          let c: C3 = base
          c = mix(c, [0.2, 0.16, 0.13], gauss(d.z, 0, 0.14 + 0.08 * sstep(-0.2, 0.8, d.x)) * sstep(-0.2, 0.7, d.x) * sstep(0.2, 0.7, d.y))
          if (d.x < 0 && d.y > 0.2) c = mix(c, [0.24, 0.19, 0.15], 0.7 * sstep(0.6, 0.9, Math.sin(d.x * 16 - Math.abs(d.z) * 6)) * gauss(d.z, 0, 0.45))
          c = mix(c, [0.62, 0.55, 0.45], 0.3 * gauss(Math.abs(d.z), 0.75, 0.15))
          if (d.y < -0.3) c = mul(c, 0.72)
          return { s: lean(d), c }
        },
        legCol: (_i, t, part) => mix([0.4, 0.33, 0.25], [0.2, 0.16, 0.12], part ? 0.25 + 0.4 * sstep(0.6, 0.9, Math.sin(t * Math.PI * 3) ** 2) : 0.2),
        mat: { color: '#ffffff', map: textures().chitin, shininess: 18, specular: '#2a2620' },
        hair: 50, hairLen: 0.028, hairCol: [0.4, 0.34, 0.26], bodyHair: 240, legSpines: 10,
        chel: { len: 0.07, r: 0.022, col: [0.25, 0.2, 0.16] }, palp: { len: 0.14, r: 0.012 }, spinner: 0.012,
      }
    }
    case 'weaver': {
      return {
        hy: 0.19, ceph: [0.085, 0.055, 0.07], cephX: 0.09, abd: [0.17, 0.155, 0.15], abdX: -0.13, abdY: 0.06,
        legs: [0.78, 0.68, 0.46, 0.62], legR: 0.0095, up: 0.95, eyes: [...sym(0.95, 0.25, 0.1, 0.007), ...sym(0.85, 0.48, 0.12, 0.0075), ...sym(0.84, 0.25, 0.36, 0.005), ...sym(0.78, 0.38, 0.4, 0.005)],
        cephF: (d) => ({ s: lean(d) + 0.08 * gauss(d.x, 0.9, 0.3) * sstep(0, 0.6, d.y), c: mix([0.55, 0.42, 0.26], [0.35, 0.26, 0.16], sstep(0.2, -0.4, d.y)) }),
        abdF: (d) => {
          // 叶状斑（folium）：深褐波浪边的中带 + 白色十字斑
          const w = 0.42 + 0.1 * Math.sin(d.x * 18) * sstep(0.8, -0.6, d.x) - 0.15 * sstep(-0.2, -0.9, d.x)
          const fol = sstep(w + 0.05, w - 0.04, Math.abs(d.z)) * sstep(-0.1, 0.4, d.y)
          let c: C3 = mix([0.78, 0.62, 0.36], [0.26, 0.16, 0.09], fol)
          c = mix(c, [0.55, 0.42, 0.26], fol * gauss(d.z, 0, 0.12) * 0.8)
          const cross = gauss(d.z, 0, 0.035) * gauss(d.x, 0.45, 0.2) + gauss(d.x, 0.42, 0.035) * gauss(d.z, 0, 0.16)
          c = mix(c, [0.96, 0.94, 0.88], clamp01(cross * 1.4) * sstep(0.3, 0.6, d.y))
          for (const [x, z] of [[0.15, 0.22], [-0.2, 0.18], [-0.45, 0.12]]) c = mix(c, [0.95, 0.93, 0.86], gauss(d.x, x, 0.05) * gauss(Math.abs(d.z), z, 0.05) * sstep(0.2, 0.5, d.y))
          if (d.y < -0.2) c = mix(c, [0.2, 0.15, 0.1], 0.6)
          return { s: 1 + 0.06 * gauss(d.x, 0.55, 0.3) * sstep(0, 0.6, d.y) - 0.08 * sstep(0.1, 1, -d.y), c }
        },
        legCol: (_i, t, part) => (Math.sin(t * Math.PI * (part ? 5 : 3) + 0.4) > 0.35 ? [0.32, 0.23, 0.14] : [0.7, 0.57, 0.36]) as C3,
        mat: { color: '#ffffff', map: textures().chitin, shininess: 30, specular: '#3a3428' },
        hair: 18, hairLen: 0.018, hairCol: [0.6, 0.5, 0.35], bodyHair: 60, legSpines: 14,
        chel: { len: 0.045, r: 0.013, col: [0.4, 0.3, 0.18] }, palp: { len: 0.08, r: 0.007 }, spinner: 0.022,
      }
    }
    case 'jumper': {
      const box = (d: THREE.Vector3) => { const p = 3.2; return 1 / Math.pow(Math.abs(d.x) ** p + Math.abs(d.y) ** p + Math.abs(d.z) ** p, 1 / p) }
      return {
        hy: 0.085, ceph: [0.085, 0.07, 0.075], cephX: 0.075, abd: [0.09, 0.07, 0.072], abdX: -0.085, abdY: 0.012,
        legs: [0.3, 0.24, 0.22, 0.27], legR: 0.013, frontR: 1.55, up: 0.75, ff: 0.45,
        eyes: [...sym(0.93, 0.1, 0.3, 0.025), ...sym(0.78, 0.22, 0.62, 0.012), ...sym(0.3, 0.75, 0.62, 0.01)],
        eyeMat: { color: '#0c0c0e', specular: '#ffffff', shininess: 160, emissive: '#06080a' },
        cephF: (d) => {
          const s = box(d) * (0.86 - 0.1 * sstep(0.1, 1, -d.y))
          let c: C3 = [0.1, 0.09, 0.085]
          c = mix(c, [0.92, 0.9, 0.84], gauss(d.y, -0.18, 0.1) * sstep(-0.3, 0.5, d.x)) // 眼下白色毛带
          c = mix(c, [0.75, 0.55, 0.3], 0.5 * gauss(d.y, 0.85, 0.15)) // 头顶橙褐毛斑
          return { s, c }
        },
        abdF: (d) => {
          let c: C3 = [0.09, 0.085, 0.08]
          c = mix(c, [0.93, 0.92, 0.88], gauss(d.x, 0.62, 0.1) * sstep(0, 0.5, d.y)) // 前缘白横带
          for (const x of [0.05, -0.35]) c = mix(c, [0.92, 0.9, 0.85], gauss(d.x, x, 0.08) * gauss(Math.abs(d.z), 0.32, 0.1) * sstep(0.1, 0.5, d.y))
          return { s: lean(d), c }
        },
        legCol: (i, t, part) => (i === 0 ? mix([0.08, 0.08, 0.08], [0.85, 0.85, 0.82], part ? 0.2 * sstep(0.6, 0.9, t) : 0) : (Math.sin(t * 9) > 0.5 ? [0.6, 0.5, 0.38] : [0.12, 0.11, 0.1])) as C3,
        mat: { color: '#ffffff', map: textures().chitin, shininess: 22, specular: '#33302c' },
        hair: 40, hairLen: 0.012, hairCol: [0.25, 0.23, 0.2], bodyHair: 320,
        chel: { len: 0.032, r: 0.011, col: [0.06, 0.26, 0.24] }, palp: { len: 0.05, r: 0.0055, col: [0.9, 0.88, 0.82] }, spinner: 0.006,
      }
    }
    case 'blindcave': {
      const pale: C3 = [0.9, 0.87, 0.8]
      return {
        hy: 0.12, ceph: [0.095, 0.06, 0.08], cephX: 0.1, abd: [0.15, 0.1, 0.11], abdX: -0.14, abdY: 0.02,
        legs: [0.95, 0.78, 0.66, 0.84], legR: 0.0085, up: 0.9, eyes: [],
        cephF: (d) => ({ s: lean(d), c: mix(pale, [0.78, 0.7, 0.62], gauss(d.z, 0, 0.2) * sstep(0.2, 0.8, d.y) * 0.5) }),
        abdF: (d) => ({ s: lean(d) + 0.02 * Math.sin(d.x * 9) * sstep(0, 0.5, d.y), c: mix(pale, [0.8, 0.62, 0.58], 0.55 * gauss(d.z, 0, 0.22) * gauss(d.y, 0.3, 0.35)) }),
        legCol: (_i, t) => mix(pale, [0.98, 0.96, 0.92], t),
        mat: { color: '#ffffff', transparent: true, opacity: 0.86, shininess: 70, specular: '#8a8478', emissive: '#2b2721', map: textures().glaze },
        hair: 10, hairLen: 0.012, hairCol: [0.95, 0.94, 0.9],
        chel: { len: 0.05, r: 0.014, col: [0.78, 0.66, 0.5] }, palp: { len: 0.42, r: 0.006, feeler: true }, spinner: 0.01,
      }
    }
    case 'harvestman': {
      const b: C3 = [0.5, 0.33, 0.2]
      return {
        hy: 0.3, ceph: [0.05, 0.035, 0.048], cephX: 0.035, abd: [0.07, 0.045, 0.055], abdX: -0.025, abdY: 0.0,
        legs: [1.2, 1.5, 1.15, 1.3], legR: 0.0045, up: 0.98, ff: 0.36, phi: [0.6, 1.2, 1.9, 2.45],
        eyes: sym(0.3, 0.92, 0.18, 0.006),
        cephF: (d) => ({ s: 1 + 0.35 * gauss(d.x, 0.3, 0.12) * gauss(d.z, 0, 0.18) * sstep(0.6, 0.95, d.y), c: mix(b, [0.3, 0.2, 0.12], sstep(0.4, 0.9, d.y) * 0.5) }),
        abdF: (d) => ({ s: 1 - 0.1 * sstep(0.2, 1, -d.y), c: mix(mix(b, [0.26, 0.17, 0.1], gauss(d.z, 0, 0.3) * sstep(0.3, 0.8, d.y)), [0.62, 0.48, 0.32], sstep(-0.2, -0.8, d.y)) }),
        legCol: (_i, t, part) => mix([0.4, 0.28, 0.18], [0.2, 0.14, 0.1], part ? t * 0.6 : 0.1),
        mat: { color: '#ffffff', map: textures().chitin, shininess: 40, specular: '#3c3226' },
        chel: { len: 0.02, r: 0.006, col: [0.55, 0.4, 0.25] }, palp: { len: 0.05, r: 0.004 },
      }
    }
    case 'diving': {
      return {
        hy: 0.11, ceph: [0.09, 0.055, 0.075], cephX: 0.09, abd: [0.13, 0.085, 0.095], abdX: -0.12, abdY: 0.01,
        legs: [0.42, 0.38, 0.36, 0.44], legR: 0.011, up: 0.75, fringeLegs: [2, 3],
        eyes: [...sym(0.96, 0.15, 0.08, 0.008), ...sym(0.88, 0.35, 0.14, 0.008), ...sym(0.86, 0.22, 0.3, 0.007), ...sym(0.75, 0.42, 0.3, 0.007)],
        cephF: (d) => ({ s: lean(d), c: mix([0.2, 0.13, 0.1], [0.32, 0.2, 0.14], gauss(d.z, 0, 0.15) * sstep(0.3, 0.8, d.y)) }),
        abdF: (d) => ({ s: lean(d), c: mix([0.2, 0.19, 0.19], [0.36, 0.35, 0.34], gauss(d.z, 0, 0.2) * sstep(0.1, 0.8, d.y)) }),
        legCol: (_i, t) => mix([0.24, 0.16, 0.12], [0.16, 0.11, 0.09], t),
        mat: { color: '#ffffff', map: textures().chitin, shininess: 55, specular: '#4a4440' },
        hair: 22, hairLen: 0.014, hairCol: [0.3, 0.28, 0.26], bodyHair: 140,
        chel: { len: 0.05, r: 0.016, col: [0.18, 0.1, 0.08] }, palp: { len: 0.09, r: 0.008 }, spinner: 0.01,
      }
    }
    case 'colossus': {
      // 阶段 2 修正：去掉偏灰的板岩色，改成深褐黑甲片 + 锈红 / 骨白环带（每个 seed 随机选主副色），关节球缩小融进腿里
      const blk: C3 = [0.1, 0.062, 0.042], brn: C3 = [0.2, 0.12, 0.075], rust: C3 = [0.55, 0.2, 0.08], bone: C3 = [0.8, 0.72, 0.56]
      const acc: C3 = R() < 0.6 ? rust : bone, acc2: C3 = acc === rust ? bone : rust
      const bandF = 3.2 + R() * 0.6
      return {
        hy: 0.66, ceph: [0.5, 0.3, 0.42], cephX: 0.5, abd: [0.68, 0.48, 0.56], abdX: -0.62, abdY: 0.12,
        legs: [2.75, 2.55, 2.35, 2.85], legR: 0.07, up: 0.62, joint: 0.0, jointR: 0.62,
        eyes: [...sym(0.96, 0.15, 0.1, 0.035), ...sym(0.92, 0.22, 0.26, 0.03), ...sym(0.8, 0.5, 0.17, 0.06), ...sym(0.5, 0.78, 0.3, 0.04)],
        cephF: (d) => {
          // 厚甲：前额隆起、纵向棱脊（锈红高光）、甲片接缝（近黑）
          const rv = sstep(0.75, 1, Math.abs(Math.sin(Math.atan2(d.z, d.y) * 3))) * sstep(0.2, 0.7, d.y)
          const s = lean(d) + 0.1 * sstep(0.1, 0.8, d.x) * sstep(0, 0.6, d.y) + 0.05 * rv
          let c: C3 = mix(blk, brn, 0.5 + 0.5 * sstep(-0.2, 0.8, d.y))
          c = mix(c, acc, 0.75 * rv)
          c = mix(c, mul(acc, 0.7), 0.45 * gauss(d.z, 0, 0.1) * sstep(0.3, 0.9, d.y)) // 中线色带
          c = mix(c, [0.04, 0.03, 0.025], sstep(0.92, 1, Math.abs(Math.sin(d.x * 7 + d.z * 2))) * 0.8)
          if (d.y < -0.2) c = mul(c, 0.65)
          return { s, c }
        },
        abdF: (d) => {
          // 环带甲片：沿体轴的厚板交替深褐黑 / 主色，板缘一道副色细边，板间深缝
          const bx = (d.x + 1) * bandF, bi = Math.floor(bx), band = fract(bx), plate = sstep(0, 0.16, band) * sstep(1, 0.84, band)
          const rim = gauss(band, 0.2, 0.05) + gauss(band, 0.8, 0.05)
          const s = lean(d) + 0.06 * plate * sstep(-0.3, 0.4, d.y)
          let c: C3 = bi % 2 ? mix(blk, acc, 0.78) : mix(blk, brn, 0.6)
          c = mix(c, acc2, 0.55 * clamp01(rim) * sstep(-0.1, 0.5, d.y))
          c = mix([0.03, 0.022, 0.018], c, plate)
          c = mul(c, 0.8 + 0.35 * sstep(0.2, 1, d.y)) // 背面受光更亮
          if (d.y < -0.2) c = mul(c, 0.7)
          return { s, c }
        },
        legCol: (_i, t, part) => {
          // 腿：深褐黑底，每段末端一圈主色环，胫节中段再一圈副色细环
          let c: C3 = mix(blk, brn, 0.35)
          c = mix(c, acc, 0.85 * (part ? gauss(t, 0.06, 0.05) + gauss(t, 0.55, 0.05) : gauss(t, 0.9, 0.06)))
          if (part) c = mix(c, acc2, 0.6 * gauss(t, 0.3, 0.025))
          return c
        },
        mat: { color: '#ffffff', map: textures().chitin, shininess: 32, specular: '#4a3022' },
        legSpines: 26, bodyHair: 40, hairLen: 0.09, hairCol: [0.18, 0.11, 0.07],
        chel: { len: 0.3, r: 0.1, col: [0.12, 0.07, 0.05] }, palp: { len: 0.55, r: 0.045 }, spinner: 0.05,
        runes: [{ layout: 'back', on: 'abd', axis: 'top', zoom: 1.15, k: 1.7 }],
      }
    }
    case 'widow': {
      const blk: C3 = [0.07, 0.065, 0.07]
      return {
        hy: 0.15, ceph: [0.1, 0.065, 0.085], cephX: 0.085, abd: [0.17, 0.165, 0.16], abdX: -0.15, abdY: 0.07,
        legs: [0.72, 0.6, 0.46, 0.66], legR: 0.012, up: 0.92, glowCol: '#8dff4a', glowK: 1.4,
        eyes: [...sym(0.95, 0.3, 0.09, 0.008), ...sym(0.85, 0.48, 0.12, 0.008), ...sym(0.86, 0.28, 0.32, 0.007), ...sym(0.76, 0.42, 0.34, 0.007)],
        // 阶段 2 修正：头胸不再发光（原先两块毒腺光斑正面看像绿色面罩），只保留黑亮甲壳；毒液改为螯牙尖与腹部的小亮点
        cephF: (d) => ({ s: lean(d) + 0.04 * gauss(d.x, 0.3, 0.2) * sstep(0.3, 0.8, d.y), c: mix(blk, [0.14, 0.12, 0.14], 0.4 * gauss(d.z, 0, 0.12) * sstep(0.4, 0.9, d.y)) }),
        abdF: (d) => {
          // 红沙漏：中心从正腹面后移约 40°（腹面偏后下方），常规俯侧视角也能看到上半个；背面一列红斑
          const ca = Math.cos(0.7), sa = Math.sin(0.7)
          const ux = d.x * ca - d.y * sa, uy = d.x * sa + d.y * ca
          const hz = Math.abs(d.z), hx = ux
          const hour = sstep(-0.5, -0.68, uy) * sstep(0.03, -0.02, hz - (0.07 + 0.62 * Math.abs(hx))) * sstep(0.56, 0.47, Math.abs(hx)) * sstep(0.02, 0.07, Math.abs(hx) + 0.05)
          let c: C3 = mix(blk, [0.88, 0.07, 0.04], clamp01(hour))
          for (const x of [-0.92, -0.75, -0.55]) c = mix(c, [0.8, 0.07, 0.05], gauss(d.x, x, 0.07) * gauss(d.z, 0, 0.1) * sstep(-0.2, 0.2, d.y))
          return { s: 1, c, g: 0 }
        },
        legCol: (_i, t, part) => mix(blk, [0.16, 0.12, 0.12], part ? 0.3 * gauss(t, 0.45, 0.05) : 0),
        mat: { color: '#ffffff', shininess: 120, specular: '#b8b4c0' },
        chel: { len: 0.05, r: 0.016, col: [0.08, 0.07, 0.08], venom: true, glow: 1.6 }, palp: { len: 0.09, r: 0.008 }, spinner: 0.01,
        runes: [{ layout: 'ring', on: 'abd', axis: 'top', zoom: 1.05, k: 1.5 }],
        venomDots: 7,
      }
    }
    case 'regen': {
      // 外露组织：若干随机方向的肉粉色斑块（略鼓、湿亮）
      const patches = Array.from({ length: 7 }, () => ({ d: V(R() - 0.5, R() * 0.8, R() - 0.5).normalize(), w: 0.18 + R() * 0.16 }))
      const flesh = (d: THREE.Vector3) => { let k = 0; for (const p of patches) k = Math.max(k, sstep(p.w, p.w * 0.55, d.distanceTo(p.d))); return k }
      const base: C3 = [0.2, 0.12, 0.1]
      return {
        hy: 0.17, ceph: [0.15, 0.09, 0.12], cephX: 0.14, abd: [0.21, 0.15, 0.16], abdX: -0.2, abdY: 0.03,
        legs: [0.66, 0.6, 0.56, 0.7], legR: 0.018, up: 0.82, glowCol: '#b06cff', glowK: 0.8,
        eyes: [...sym(0.96, 0.08, 0.09, 0.01), ...sym(0.82, 0.42, 0.15, 0.016), ...sym(0.4, 0.8, 0.35, 0.012)],
        cephF: (d) => { const f = flesh(d); return { s: lean(d) + 0.025 * f, c: mix(base, [0.95, 0.56, 0.55], f) } },
        abdF: (d) => { const f = flesh(d.clone().multiply(V(1, 1, -1))); return { s: lean(d) + 0.03 * f + 0.01 * Math.sin(d.x * 30) * f, c: mix(mix(base, [0.22, 0.12, 0.1], 0.4 * sstep(0.7, 1, Math.sin(d.x * 14))), [0.96, 0.58, 0.56], f) } },
        legCol: (_i, t, part) => mix(base, [0.6, 0.32, 0.3], part ? 0.2 * gauss(t, 0, 0.1) : 0.3 * gauss(t, 1, 0.08)),
        mat: { color: '#ffffff', map: textures().chitin, shininess: 70, specular: '#6a4a48' },
        hair: 12, hairLen: 0.02, hairCol: [0.3, 0.18, 0.15],
        chel: { len: 0.075, r: 0.024, col: [0.25, 0.12, 0.1] }, palp: { len: 0.14, r: 0.012 }, spinner: 0.012,
        runes: [{ layout: 'stitch', on: 'abd', axis: 'top', k: 1.4 }, { layout: 'stitch', on: 'ceph', axis: 'top', k: 1.3 }],
      }
    }
    case 'undying': {
      const dry: C3 = [0.44, 0.4, 0.34]
      return {
        hy: 0.17, ceph: [0.16, 0.09, 0.13], cephX: 0.15, abd: [0.19, 0.13, 0.15], abdX: -0.2, abdY: 0.0,
        legs: [0.8, 0.74, 0.7, 0.86], legR: 0.016, up: 0.9, glowCol: '#8a8cff', glowK: 1.5,
        eyes: [...sym(0.96, 0.1, 0.1, 0.009), ...sym(0.82, 0.42, 0.15, 0.015)],
        cephF: (d) => ({ s: lean(d) - 0.04 * Math.abs(Math.sin(d.z * 9 + d.x * 4)) * sstep(0, 0.6, d.y), c: mix(dry, [0.25, 0.22, 0.18], 0.5 * sstep(0.7, 1, Math.abs(Math.sin(d.z * 9 + d.x * 4)))) }),
        abdF: (d) => {
          // 干瘪：纵横皱褶，顶部塌陷
          const wr = Math.abs(Math.sin(d.x * 17 + Math.sin(d.z * 6) * 2)) * 0.6 + Math.abs(Math.sin(d.z * 13 + d.x * 3)) * 0.4
          return { s: lean(d) - 0.07 * wr - 0.12 * sstep(0.5, 1, d.y) * gauss(d.z, 0, 0.5), c: mix(dry, [0.24, 0.21, 0.17], 0.6 * sstep(0.6, 1, wr)) }
        },
        legCol: (_i, t, part) => mix(dry, [0.28, 0.25, 0.21], part ? t * 0.5 : 0.2),
        mat: { color: '#ffffff', map: textures().chitin, shininess: 8, specular: '#1c1a18' },
        hair: 8, hairLen: 0.02, hairCol: [0.3, 0.28, 0.24],
        chel: { len: 0.08, r: 0.022, col: [0.3, 0.27, 0.22] }, palp: { len: 0.15, r: 0.01 }, spinner: 0.012,
        runes: [{ layout: 'ring', on: 'ceph', axis: 'top', zoom: 1.1, k: 1.2 }],
      }
    }
    case 'fireproof': {
      return {
        hy: 0.17, ceph: [0.15, 0.09, 0.12], cephX: 0.14, abd: [0.2, 0.14, 0.155], abdX: -0.2, abdY: 0.025,
        legs: [0.66, 0.6, 0.56, 0.72], legR: 0.019, up: 0.8, glowCol: '#ff7a1e', glowK: 1.6, joint: 0.9,
        eyes: [...sym(0.96, 0.1, 0.09, 0.01), ...sym(0.82, 0.42, 0.15, 0.017), ...sym(0.4, 0.8, 0.35, 0.012)],
        cephF: (d) => ({ s: lean(d) + 0.025 * Math.abs(Math.sin(d.x * 8) * Math.sin(d.z * 7)), c: [1, 1, 1] }),
        abdF: (d) => ({ s: lean(d) + 0.03 * Math.abs(Math.sin(d.x * 7 + 1) * Math.sin(d.z * 6)), c: [1, 1, 1] }),
        legCol: () => [0.95, 0.9, 0.88],
        // 关节缝：各段两端透橙光
        mat: { color: '#ffffff', map: textures().lava, emissiveMap: textures().lavaGlow, emissive: '#ff6a1a', emissiveIntensity: 1.35, shininess: 20, specular: '#3a2a20' },
        legSpines: 8,
        chel: { len: 0.075, r: 0.024, col: [0.6, 0.5, 0.45] }, palp: { len: 0.14, r: 0.012 }, spinner: 0.012,
        runes: [{ layout: 'ring', on: 'abd', axis: 'top', zoom: 1.1, k: 1.5 }],
      }
    }
    case 'anoxic': {
      const cer: C3 = [0.86, 0.85, 0.82]
      return {
        hy: 0.15, ceph: [0.13, 0.08, 0.105], cephX: 0.12, abd: [0.18, 0.12, 0.13], abdX: -0.17, abdY: 0.02,
        legs: [0.6, 0.55, 0.52, 0.64], legR: 0.016, up: 0.82, eyes: [],
        cephF: (d) => {
          // 密封面甲：前半部一块略外凸的弧形面板，与后甲之间一道细缝
          const vis = sstep(0.3, 0.42, d.x)
          const seam = gauss(d.x, 0.36, 0.022)
          return { s: lean(d) + 0.05 * vis - 0.03 * seam, c: mix(mix(cer, [0.42, 0.44, 0.47], vis * 0.85), [0.2, 0.2, 0.2], seam) }
        },
        abdF: (d) => ({ s: 1 - 0.1 * sstep(0.1, 1, -d.y), c: mix(cer, [0.76, 0.75, 0.72], sstep(0.85, 1, Math.sin(d.x * 9)) * 0.5) }),
        legCol: (_i, t, part) => mix(cer, [0.55, 0.55, 0.54], part ? gauss(t, 0.45, 0.025) : gauss(t, 0.98, 0.05)),
        mat: { color: '#ffffff', map: textures().glaze, shininess: 90, specular: '#7a7a78' },
        chel: { len: 0.06, r: 0.02, col: [0.7, 0.7, 0.68] }, palp: { len: 0.12, r: 0.011 },
        runes: [{ layout: 'visor', on: 'ceph', axis: 'front', zoom: 1.0, k: 1.7 }, { layout: 'ring', on: 'abd', axis: 'top', zoom: 1.1, k: 1.3 }],
      }
    }
    default: return spiderSpec('wolf', R)
  }
}

/**
 * 同种个体差异（阶段 2）：按 seed 给整体配色加轻微偏色 / 明暗，并对花纹取色方向做小幅扭曲（花纹位置、宽窄随个体变化，
 * 体形不变）。偏移量控制在 ±10% 冷暖偏色、±13% 明暗，保证同一种仍一眼认得出。
 */
function seedVary(S: SpiderSpec, R: () => number): SpiderSpec {
  const TR = rng(Math.floor(R() * 1e9))
  const br = 1 + (TR() - 0.5) * 0.26
  const hue = (TR() - 0.5) * 0.2
  const tint: C3 = [br * (1 + hue), br * (1 + (TR() - 0.5) * 0.08), br * (1 - hue)]
  const a1 = TR() * 6.28, a2 = TR() * 6.28, f1 = 4 + TR() * 3, f2 = 4 + TR() * 3, amp = 0.1 + TR() * 0.12
  const legAmp = (TR() - 0.5) * 0.12
  const warp = (d: THREE.Vector3) => V(d.x + amp * Math.sin(d.y * f1 + a1), d.y, d.z + amp * 0.7 * Math.sin(d.x * f2 + a2)).normalize()
  const tc = (c: C3 | undefined): C3 => { const k = c ?? [1, 1, 1]; return [clamp01(k[0] * tint[0]), clamp01(k[1] * tint[1]), clamp01(k[2] * tint[2])] }
  const wrapF = (f: BF): BF => (d) => { const a = f(d), b = f(warp(d)); return { s: a.s, c: tc(b.c), g: b.g } }
  return {
    ...S, cephF: wrapF(S.cephF), abdF: wrapF(S.abdF),
    legCol: S.legCol ? (i, t, p) => tc(S.legCol!(i, Math.min(1, Math.max(0, t + legAmp * (p ? 1 : -1))), p)) : undefined,
    hairCol: S.hairCol ? tc(S.hairCol) : S.hairCol,
  }
}

/** 按规格装出一只蜘蛛（mother=true 时腹背再挂一群 InstancedMesh 幼蛛） */
function* buildSpiderJob(grp: THREE.Group, v: ArachnidVariant, R: () => number, scale = 1): Generator<void, ArachnidRig, unknown> {
  const S = seedVary(spiderSpec(v, R), R)
  const rig = newRig(v, 'spider', grp, S.hy)
  yield;
  const { ceph, abdomen } = rig.body
  yield;
  const mat = bodyMat(S.mat, S.glowCol, S.glowK)
  yield;
  const cOff = V(S.cephX, 0, 0)
  yield;
  const pedX = S.cephX - S.ceph[0] * 0.92
  yield;
  abdomen.position.set(pedX, 0, 0)
  yield;
  const aOff = V(S.abdX - pedX, S.abdY, 0)
  yield;
  // ---------- 头胸 ----------
  const cg: G[] = [blob(S.ceph, S.cephF, 30, 20, cOff)]
  yield;
  if (S.bodyHair) blobHairs(cg, S.ceph, S.cephF, cOff, Math.round(S.bodyHair * 0.35), S.hairLen ?? 0.02, R, S.hairCol ?? [0.5, 0.45, 0.4], (d) => d.y > -0.2, v === 'colossus')
  yield;
  // 胸板（腹面）与腹柄
  cg.push(blob([S.ceph[0] * 0.7, S.ceph[1] * 0.25, S.ceph[2] * 0.6], () => ({ c: mul(S.cephF(V(0, -1, 0)).c ?? [1, 1, 1], 0.8) }), 16, 8, V(S.cephX, -S.ceph[1] * 0.68, 0)))
  yield;
  // 缺腿/断腿位置的基节残桩在 buildLeg 里处理
  if (v === 'undying') {
    // 头胸甲上一个小破洞：洞缘发暗，洞里露出符文内核的光
    cg.push(ball(S.ceph[0] * 0.18, V(S.cephX - S.ceph[0] * 0.2, S.ceph[1] * 0.72, S.ceph[2] * 0.25), [0.3, 0.5, 0.9], 1, 10, 8))
  }
  yield;
  ceph.add(new THREE.Mesh(mergeAll(cg), mat))
  yield;
  // ---------- 眼 ----------
  if (S.eyes.length) {
    const eg: G[] = []
    const big = Math.max(...S.eyes.map((e) => e[1]))
    for (const [d, r] of S.eyes) { const p = blobPt(S.ceph, S.cephF, d, cOff); eg.push(r === big ? ball(r, p.addScaledVector(d, -r * 0.35), 1, 0, 14, 10) : ball(r, p.addScaledVector(d, -r * 0.35), 1, 0, 8, 6)) }
    const em = new THREE.Mesh(mergeAll(eg), new THREE.MeshPhongMaterial({ color: '#08080a', specular: '#d0d4dc', shininess: 120, ...(S.eyeMat ?? {}) }))
    em.userData.face = 1; ceph.add(em)
  }
  yield;
  // ---------- 腹部 ----------
  const ag: G[] = [blob(S.abd, S.abdF, 32, 22, aOff)]
  yield;
  ag.push(fin(new THREE.CylinderGeometry(S.ceph[2] * 0.18, S.ceph[2] * 0.22, S.ceph[0] * 0.5, 8).rotateZ(Math.PI / 2).translate(-S.ceph[0] * 0.05, -0.002, 0), mul(S.abdF(V(1, 0, 0)).c ?? [1, 1, 1], 0.7)))
  yield;
  if (S.spinner) {
    const tip = blobPt(S.abd, S.abdF, V(-1, -0.35, 0), aOff)
    const sp: G[] = []
    for (const [z, dy, l] of [[-1, 0, 1], [1, 0, 1], [-0.5, -0.6, 0.7], [0.5, -0.6, 0.7]]) sp.push(cone(S.spinner * 0.55, S.spinner * 1.6 * l, tip.clone().add(V(S.spinner * 0.3, dy * S.spinner, z * S.spinner * 0.7)), V(-1, -0.25 + dy * 0.2, z * 0.25), mul(S.abdF(V(-1, -0.5, 0)).c ?? [1, 1, 1], 0.8), 6))
    ag.push(...sp)
  }
  yield;
  if (S.bodyHair) blobHairs(ag, S.abd, S.abdF, aOff, Math.round(S.bodyHair * 0.65), (S.hairLen ?? 0.02) * 1.1, R, S.hairCol ?? [0.5, 0.45, 0.4], (d) => d.y > -0.4, v === 'colossus')
  yield;
  if (S.venomDots) {
    // 腹部侧后方几颗米粒大的发光毒液点（嵌在体表）
    for (let k = 0; k < S.venomDots; k++) {
      const d = V(-0.2 - R() * 0.75, -0.1 + R() * 0.7, (R() < 0.5 ? -1 : 1) * (0.35 + R() * 0.55)).normalize()
      ag.push(ball(S.abd[0] * (0.022 + R() * 0.014), blobPt(S.abd, S.abdF, d, aOff), [0.75, 1, 0.5], 1.4, 6, 5))
    
 yield;
 }
  }
  yield;
  let abdGeo = mergeAll(ag)
  yield;
  if (v === 'undying') abdGeo = punchHoles(abdGeo, aOff, S.abd, R)
  yield;
  abdomen.add(new THREE.Mesh(abdGeo, mat))
  yield;
  // ---------- 符文发光壳 ----------
  for (const rn of S.runes ?? []) {
    const on = rn.on === 'abd'
    const sh = runeShell(on ? S.abd : S.ceph, on ? S.abdF : S.cephF, on ? aOff : cOff, rn.axis, 1.022, rn.zoom ?? 1)
    const m = new THREE.Mesh(sh, runeMat(runeTex(rn.layout, rn.on === 'ceph' ? 1 : 0), rn.k ?? 1.5)); m.renderOrder = 2
    m.userData.rune = 1;
    (on ? abdomen : ceph).add(m)
  }
  yield;
  // ---------- 腿 ----------
  const phis = S.phi ?? [0.62, 1.2, 1.85, 2.45]
  yield;
  const hipY = -S.ceph[1] * 0.3
  yield;
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const t = [0.6, 0.22, -0.18, -0.55][i]
    const ax = S.cephX + S.ceph[0] * t, az = side * S.ceph[2] * Math.sqrt(1 - t * t) * 0.88
    const at = V(ax, hipY, az)
    let o: LegOpt = {
      len: S.legs[i], up: S.up, r: S.legR * (i === 0 ? S.frontR ?? 1 : 1), hipH: S.hy + hipY, ff: S.ff,
      col: S.legCol ? (tt, p) => S.legCol!(i, tt, p) : undefined, joint: S.joint, jointR: S.jointR,
      hair: S.hair, hairLen: S.hairLen, hairCol: S.hairCol, spines: S.legSpines, fringe: S.fringeLegs?.includes(i),
      glow: v === 'fireproof' ? (tt) => 0.9 * (gauss(tt, 0, 0.05) + gauss(tt, 1, 0.04)) : undefined,
    }
    let missing = false, regrow = false
    if (v === 'undying' && ((side < 0 && i === 1) || (side > 0 && i === 2))) { o = { ...o, stump: true }; missing = true }
    if (v === 'regen' && ((side < 0 && i === 1) || (side > 0 && i === 3))) {
      // 新长出的苍白短肢：细、短、悬空不着地
      const pale: C3 = [0.9, 0.84, 0.76]
      o = { ...o, len: S.legs[i] * 0.42, r: S.legR * 0.62, up: 0.5, col: (tt) => mix([0.86, 0.5, 0.48], pale, sstep(0, 0.25, tt)), hair: 0, spines: 0, tip: V(0.12, -0.07, 0), bow: 0.2 }
      regrow = true
    }
    const j = buildLeg(ceph, at, phis[i] + (R() - 0.5) * 0.06, side, o, mat, R)
    addLeg(rig, { j, side, idx: i, missing, regrow })
  
 yield;
 }
  yield;
  // ---------- 螯肢（向下，末端毒牙向内弯） ----------
  for (const side of [-1, 1]) {
    const c = S.chel
    const at = V(S.cephX + S.ceph[0] * 0.86, -S.ceph[1] * 0.05, side * S.ceph[2] * 0.25)
    const g = new THREE.Group(); g.position.copy(at); ceph.add(g)
    const base = [V(-c.r * 0.4, c.r * 0.3, 0), V(c.len * 0.35, -c.len * 0.35, side * c.r * 0.1), V(c.len * 0.45, -c.len * 0.85, 0)]
    const cg2: G[] = [tube(base, (t) => c.r * (1 - 0.35 * t), () => c.col, () => 0, 8, 8)]
    const fb = base[2], fang = [fb, fb.clone().add(V(c.len * 0.12, -c.len * 0.25, -side * c.len * 0.08)), fb.clone().add(V(-c.len * 0.05, -c.len * 0.42, -side * c.len * 0.22))]
    cg2.push(tube(fang, (t) => c.r * 0.42 * (1 - 0.9 * t), () => [0.12, 0.08, 0.06], () => 0, 6, 8))
    if (c.venom) { // 牙尖挂着一滴发光毒液，下面拉出一道细丝
      const tip = fang[2]
      // 阶段 2 修正：毒液点缩小提亮，只在牙尖挂一颗小滴和一截短丝
      cg2.push(ball(c.r * 0.16, tip.clone().add(V(0, -c.r * 0.1, 0)), [0.7, 1, 0.45], c.glow ?? 0.8, 8, 6))
      cg2.push(tube([tip, tip.clone().add(V(0, -c.len * 0.12, 0)), tip.clone().add(V(0.001, -c.len * 0.24, 0))], (t) => c.r * 0.07 * (1 - 0.4 * t), () => [0.7, 1, 0.45], () => c.glow ?? 0.8, 4, 4))
      cg2.push(ball(c.r * 0.11, tip.clone().add(V(0.001, -c.len * 0.27, 0)), [0.7, 1, 0.45], c.glow ?? 0.8, 6, 5))
    }
    g.add(new THREE.Mesh(mergeAll(cg2), c.col[1] > c.col[0] * 1.5 ? new THREE.MeshPhongMaterial({ color: '#ffffff', vertexColors: true, shininess: 140, specular: '#9ad8ff' }) : mat))
    rig.chelicerae.push(g)
  }
  yield;
  // ---------- 触肢 ----------
  for (const side of [-1, 1]) {
    const pl = S.palp
    const at = V(S.cephX + S.ceph[0] * 0.78, -S.ceph[1] * 0.2, side * S.ceph[2] * 0.5)
    const g = new THREE.Group(); g.position.copy(at); ceph.add(g)
    const col = pl.col ?? (S.legCol ? S.legCol(0, 0.3, 0) : [1, 1, 1] as C3)
    const L = pl.len
    const pts = pl.feeler
      ? [V(0, 0, 0), V(L * 0.2, L * 0.12, side * L * 0.06), V(L * 0.55, L * 0.08, side * L * 0.16), V(L * 0.85, -L * 0.12, side * L * 0.22), V(L, -S.hy * 0.85 + S.ceph[1] * 0.2, side * L * 0.25)]
      : [V(0, 0, 0), V(L * 0.35, L * 0.25, side * L * 0.15), V(L * 0.6, L * 0.05, side * L * 0.18), V(L * 0.75, -L * 0.3, side * L * 0.12)]
    g.add(new THREE.Mesh(mergeAll([tube(pts, (t) => pl.r * (1 - 0.35 * t) * (1 + 0.5 * gauss(t, 0.95, 0.06) * (v === 'jumper' || v === 'wolf' ? 1 : 0)), () => col, () => 0, 7, pl.feeler ? 20 : 10), ball(pl.r * 1.1, V(0, 0, 0), col)]), mat))
    rig.pedipalps.push(g)
  }
  yield;
  // ---------- 变种附加件 ----------
  if (v === 'diving') {
    // 腹部银色气泡膜：略大一圈的半透明高光壳
    const bm = new THREE.MeshPhongMaterial({ color: '#c8dde6', specular: '#ffffff', shininess: 160, transparent: true, opacity: 0.42, depthWrite: false, emissive: '#2a3a40' })
    const bub = new THREE.Mesh(blob(mul(S.abd, 1.13), (d) => ({ s: 1 + 0.015 * Math.sin(d.x * 11) * Math.sin(d.z * 9) }), 32, 22, aOff.clone().add(V(-0.004, 0.004, 0))), bm)
    bub.renderOrder = 1; abdomen.add(bub)
  }
  yield;
  if (v === 'undying') {
    // 符文内核：腹内一颗发光的符文球，从破洞里透出来
    const core = new THREE.Mesh(blob(mul(S.abd, 0.8), () => ({}), 28, 20, aOff), new THREE.MeshLambertMaterial({ color: '#1a1030', emissive: '#ffffff', emissiveIntensity: 1.5, emissiveMap: runeTex('core', 0) }))
    core.userData.rune = 1; abdomen.add(core)
  }
  yield;
  rig.clear = S.hy + Math.min(-S.ceph[1], S.abdY - S.abd[1] * 0.85)
  yield;
  rig.pivotX = S.cephX - S.ceph[0] * 0.5
  yield;
  if (scale !== 1) grp.scale.setScalar(scale)
  yield;
  return rig
}

/** 在腹部几何上挖破洞（删掉落在洞区的三角形），洞缘顶点压暗 */
function punchHoles(g: G, off: THREE.Vector3, r: C3, R: () => number): G {
  const holes = [V(0.2, 0.8, 0.4), V(-0.5, 0.6, -0.4), V(-0.1, 0.3, -0.9), V(-0.85, 0.35, 0.3)].map((d) => ({ d: d.normalize(), w: 0.3 + R() * 0.1 }))
  const pa = g.attributes.position as THREE.BufferAttribute
  const keep: number[] = [], d = new THREE.Vector3(), c = new THREE.Vector3()
  const dirOf = (i: number) => d.set((pa.getX(i) - off.x) / r[0], (pa.getY(i) - off.y) / r[1], (pa.getZ(i) - off.z) / r[2]).normalize()
  const n = pa.count
  for (let t = 0; t < n; t += 3) {
    c.set(0, 0, 0)
    for (let k = 0; k < 3; k++) c.add(dirOf(t + k))
    c.normalize()
    // 只对贴近体表的三角形挖洞（毛、吐丝器不动）
    const rr = Math.hypot((pa.getX(t) - off.x) / r[0], (pa.getY(t) - off.y) / r[1], (pa.getZ(t) - off.z) / r[2])
    const inHole = rr < 1.08 && rr > 0.7 && holes.some((h) => {
      const jag = 1 + 0.25 * Math.sin(c.x * 40 + c.z * 23) * Math.sin(c.y * 31)
      return c.distanceTo(h.d) < h.w * jag
    })
    if (!inHole) for (let k = 0; k < 3; k++) keep.push(t + k)
  }
  const out = new THREE.BufferGeometry()
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name] as THREE.BufferAttribute, sz = a.itemSize, arr = new Float32Array(keep.length * sz)
    keep.forEach((src, i) => { for (let k = 0; k < sz; k++) arr[i * sz + k] = a.array[src * sz + k] })
    out.setAttribute(name, new THREE.Float32BufferAttribute(arr, sz))
  }
  // 洞缘压暗 + 微微发光（内核光照到洞缘）
  const op = out.attributes.position as THREE.BufferAttribute, oc = out.attributes.color as THREE.BufferAttribute
  for (let i = 0; i < op.count; i++) {
    const dd = V((op.getX(i) - off.x) / r[0], (op.getY(i) - off.y) / r[1], (op.getZ(i) - off.z) / r[2]).normalize()
    let m = 1e9; for (const h of holes) m = Math.min(m, dd.distanceTo(h.d) - h.w)
    const k = sstep(0.12, 0, m) * 0.7
    oc.setXYZ(i, oc.getX(i) * (1 - k), oc.getY(i) * (1 - k), oc.getZ(i) * (1 - k))
  }
  return out
}

// ======================================================================
// 蝎（洞蝎 / 鞭蝎）
// ======================================================================
function* buildScorpionJob(grp: THREE.Group, v: 'cavescorpion' | 'whipscorpion', R: () => number): Generator<void, ArachnidRig, unknown> {
  const whip = v === 'whipscorpion'
  const hy = whip ? 0.06 : 0.075
  yield;
  const rig = newRig(v, whip ? 'whip' : 'scorpion', grp, hy)
  yield;
  const { ceph, abdomen } = rig.body
  yield;
  // 个体差异：按 seed 轻微偏色 / 明暗（±8%），中体板的花纹频率略变
  const vk = 1 + (R() - 0.5) * 0.16, vh = (R() - 0.5) * 0.12, bandK = 3.3 + R() * 0.5
  yield;
  const amber: C3 = whip ? [0.2 * vk * (1 + vh), 0.12 * vk, 0.1 * vk * (1 - vh)] : [0.42 * vk * (1 + vh), 0.28 * vk, 0.15 * vk * (1 - vh)]
  yield;
  const dark: C3 = whip ? [0.1 * vk, 0.07 * vk, 0.06 * vk] : [0.22 * vk, 0.14 * vk, 0.08 * vk]
  yield;
  const mat = bodyMat({ color: '#ffffff', map: textures().chitin, shininess: whip ? 70 : 55, specular: '#4a3c2c' }, '#c8ff3a', 1.5)
  yield;
  // 前体（头胸甲）
  const pr: C3 = whip ? [0.11, 0.03, 0.075] : [0.085, 0.04, 0.075], pX = whip ? 0.12 : 0.1
  yield;
  const pF: BF = (d) => {
    let c: C3 = mix(amber, dark, 0.4 * sstep(0.5, 1, d.y) * gauss(d.z, 0, 0.25))
    // 中眼一对（顶部中线）+ 侧眼（前角）：黑亮小点
    const eye = gauss(d.x, 0.35, 0.06) * gauss(Math.abs(d.z), 0.1, 0.05) * sstep(0.6, 0.9, d.y) + gauss(d.x, 0.85, 0.05) * gauss(Math.abs(d.z), 0.42, 0.06) * sstep(0, 0.4, d.y)
    c = mix(c, [0.02, 0.02, 0.02], clamp01(eye * 2))
    const s = (1 - 0.35 * sstep(0, 1, -d.y)) * (1 + 0.04 * Math.abs(d.z) ** 4 - 0.05 * sstep(0.8, 1, d.x)) + 0.15 * gauss(d.x, 0.35, 0.1) * gauss(d.z, 0, 0.12) * sstep(0.6, 0.9, d.y) * (whip ? 0 : 1)
    return { s, c }
  }
  yield;
  const cg: G[] = [blob(pr, pF, 32, 20, V(pX, 0, 0))]
  yield;
  // 小螯肢：前缘一对短钳（静态并入头胸）
  for (const side of [-1, 1]) cg.push(tube([V(pX + pr[0] * 0.85, -0.005, side * 0.015), V(pX + pr[0] * 1.05, -0.008, side * 0.012), V(pX + pr[0] * 1.15, -0.012, side * 0.006)], (t) => 0.009 * (1 - 0.6 * t), () => dark))
  yield;
  ceph.add(new THREE.Mesh(mergeAll(cg), mat))
  yield;
  // 中体（7 节背板）
  const mL = whip ? 0.17 : 0.15
  yield;
  abdomen.position.set(pX - pr[0] * 0.9, 0, 0)
  yield;
  const mr: C3 = whip ? [mL, 0.032, 0.085] : [mL, 0.045, 0.08], mOff = V(-mL * 0.92, 0.002, 0)
  yield;
  const mF: BF = (d) => {
    const band = fract((d.x + 1) * bandK), plate = sstep(0, 0.12, band) * sstep(1, 0.88, band)
    const s = (1 - 0.35 * sstep(0, 1, -d.y)) * (1 + 0.03 * plate * sstep(0, 0.5, d.y))
    let c: C3 = mix(dark, amber, 0.4 + 0.6 * plate)
    c = mix(c, mul(amber, 1.25), 0.3 * gauss(d.z, 0, 0.2) * plate)
    if (d.y < -0.3) c = mix(c, [0.62, 0.48, 0.3], 0.5)
    return { s, c }
  }
  yield;
  const ag: G[] = [blob(mr, mF, 36, 22, mOff)]
  yield;
  abdomen.add(new THREE.Mesh(mergeAll(ag), mat))
  yield;
  // 腿：短、外展、向后排
  const phis = [0.75, 1.15, 1.6, 2.05]
  yield;
  const lens = whip ? [0.5, 0.24, 0.27, 0.3] : [0.21, 0.23, 0.25, 0.28]
  yield;
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const t = [0.35, 0.0, -0.35, -0.75][i]
    const at = V(pX + pr[0] * t, -pr[1] * 0.45, side * pr[2] * Math.sqrt(1 - t * t * 0.8) * 0.9)
    const feeler = whip && i === 0
    const o: LegOpt = {
      len: lens[i], up: 0.65, r: whip ? 0.0085 : 0.011, hipH: hy - pr[1] * 0.45, ff: 0.4,
      col: (tt, p) => mix(amber, mix(amber, [0.62, 0.48, 0.3], 0.3), p ? tt : 0), spines: whip ? 0 : 6,
      // 鞭蝎第一对足：触角状细长「触足」，前伸、末端离地
      tip: feeler ? V(lens[i] * 0.5, -0.05, -side * 0.0) : undefined, radial: feeler ? 6 : 8,
    }
    const phi = feeler ? 0.32 : phis[i]
    if (feeler) o.r = 0.005
    const j = buildLeg(ceph, at, phi, side, o, mat, R)
    addLeg(rig, { j, side, idx: i, feeler })
  
 yield;
 }
  yield;
  // 螯（触肢）：螯臂（转节+腿节+膝节）→ 掌 + 固定指；可动指单独一组
  for (const side of [-1, 1]) {
    const z = side
    const A0 = V(pX + pr[0] * 0.8, -0.005, z * 0.03)
    let arm: G[], F0: THREE.Vector3, fingerPts: THREE.Vector3[]
    if (!whip) {
      const el = V(pX + 0.11, 0.03, z * 0.13), wr = V(pX + 0.19, 0.03, z * 0.12)
      const palm = V(pX + 0.25, 0.025, z * 0.105)
      arm = [
        tube([A0, A0.clone().lerp(el, 0.5).add(V(0, 0.02, 0)), el], (t) => 0.014 * (1 + 0.2 * gauss(t, 0.5, 0.2)), () => amber, () => 0, 8, 10, 0.7),
        tube([el, el.clone().lerp(wr, 0.5).add(V(0, 0.008, 0)), wr], (t) => 0.016 * (1 + 0.3 * gauss(t, 0.6, 0.2)), () => amber, () => 0, 8, 10, 0.75),
        ball(0.016, el, amber), ball(0.018, wr, amber),
        // 掌：鼓胀的椭球，带纵棱
        blob([0.055, 0.028, 0.036], (d) => ({ s: 1 + 0.04 * sstep(0.8, 1, Math.abs(Math.sin(Math.atan2(d.y, d.z) * 3))), c: mix(amber, dark, 0.3 + 0.4 * sstep(0.3, 1, d.x)) }), 20, 14, palm),
        // 固定指（外侧）
        tube([palm.clone().add(V(0.045, 0, z * 0.012)), palm.clone().add(V(0.075, -0.002, z * 0.012)), palm.clone().add(V(0.1, -0.004, -z * 0.002))], (t) => 0.011 * (1 - 0.8 * t), (t) => mix(amber, [0.08, 0.05, 0.03], t), () => 0, 8, 10, 0.7),
      ]
      for (let k = 0; k < 5; k++) arm.push(cone(0.0025, 0.008, palm.clone().add(V(0.05 + k * 0.01, -0.002, -z * 0.0)), V(0, 0, -z), dark, 4))
      F0 = palm.clone().add(V(0.042, 0.002, -z * 0.012))
      fingerPts = [F0, F0.clone().add(V(0.03, 0.002, -z * 0.002)), F0.clone().add(V(0.058, 0, z * 0.012))]
    } else {
      // 鞭蝎：粗短、举在身前的刺螯
      const el = V(pX + 0.1, 0.035, z * 0.075), palm = V(pX + 0.15, 0.03, z * 0.06)
      arm = [
        tube([A0, A0.clone().lerp(el, 0.5).add(V(0, 0.02, z * 0.01)), el], (t) => 0.018 * (1 + 0.3 * gauss(t, 0.5, 0.2)), () => amber, () => 0, 8, 10, 0.8),
        ball(0.018, el, amber),
        blob([0.035, 0.022, 0.022], () => ({ c: amber }), 16, 12, palm),
        tube([palm.clone().add(V(0.025, 0, 0)), palm.clone().add(V(0.045, -0.005, -z * 0.006)), palm.clone().add(V(0.055, -0.016, -z * 0.016))], (t) => 0.008 * (1 - 0.8 * t), () => dark, () => 0, 6, 8),
      ]
      for (let k = 0; k < 6; k++) arm.push(cone(0.003, 0.016, A0.clone().lerp(el, 0.3 + k * 0.12).add(V(0, 0.01, -z * 0.008)), V(0.2, 0.6, -z), dark, 4))
      F0 = palm.clone().add(V(0.02, 0.008, -z * 0.012))
      fingerPts = [F0, F0.clone().add(V(0.02, -0.002, -z * 0.01)), F0.clone().add(V(0.03, -0.014, -z * 0.022))]
    }
    const armG = chainSeg(ceph, V(0, 0, 0), A0, arm, mat)
    const fg = chainSeg(armG, A0, F0, [tube(fingerPts, (t) => (whip ? 0.006 : 0.01) * (1 - 0.8 * t), (t) => mix(amber, [0.08, 0.05, 0.03], t), () => 0, 8, 10, 0.7)], mat)
    rig.claws.push({ arm: armG, finger: fg, side })
    rig.pedipalps.push(armG)
  }
  yield;
  // 尾
  const base = V(mOff.x - mr[0] * 0.93, 0.01, 0)
  yield;
  if (!whip) {
    // 后腹 5 节 + 尾刺：向后上方拱起再向前卷，静止时尾刺悬在背上方
    const ang = [2.55, 1.95, 1.45, 1.0, 0.55], segL = [0.058, 0.062, 0.066, 0.07, 0.078], segR = [0.026, 0.024, 0.023, 0.022, 0.023]
    const pts: THREE.Vector3[] = [base.clone()]
    for (let k = 0; k < 5; k++) { const p = pts[k]; pts.push(p.clone().add(V(Math.cos(ang[k]) * segL[k], Math.sin(ang[k]) * segL[k], 0))) 
 yield;
 }
    const segGeo = (k: number) => {
      const a = pts[k], b = pts[k + 1]
      const g: G[] = [blob([segL[k] * 0.56, segR[k], segR[k] * 1.05], (d) => ({ s: 1 + 0.06 * sstep(0.85, 1, Math.abs(Math.sin(Math.atan2(d.y, d.z) * 2))), c: mix(amber, dark, 0.25 + 0.5 * gauss(Math.abs(d.x), 1, 0.15)) }), 14, 10)]
      g[0].rotateZ(ang[k]).translate((a.x + b.x) / 2, (a.y + b.y) / 2, 0)
      return g
    }
    // 尾刺：毒囊球 + 弯钩
    const T0 = pts[5], tAng = -0.6
    const vesc = V(T0.x + Math.cos(tAng) * 0.035, T0.y + Math.sin(tAng) * 0.035, 0)
    const telson: G[] = [
      blob([0.04, 0.024, 0.024], (d) => ({ c: mix([0.58, 0.4, 0.2], amber, 0.5 + 0.5 * d.y) }), 16, 12, vesc).rotateZ(0),
      tube([vesc.clone().add(V(Math.cos(tAng) * 0.03, Math.sin(tAng) * 0.03, 0)), vesc.clone().add(V(0.05, -0.04, 0)), vesc.clone().add(V(0.05, -0.075, 0)), vesc.clone().add(V(0.035, -0.09, 0))], (t) => 0.009 * (1 - 0.92 * t), (t) => mix(dark, [0.04, 0.03, 0.02], t), () => 0, 8, 12),
    ]
    const t0 = chainSeg(abdomen, V(0, 0, 0), pts[0], [...segGeo(0), ...segGeo(1)], mat)
    const t1 = chainSeg(t0, pts[0], pts[2], [...segGeo(2), ...segGeo(3)], mat)
    const t2 = chainSeg(t1, pts[2], pts[4], [...segGeo(4), ...telson], mat)
    rig.tail.push(t0, t1, t2)
  } else {
    // 鞭蝎：尾基小节 + 一对黄绿发光酸腺 → 细长鞭状尾须（两段）
    const b1 = base.clone().add(V(-0.03, 0.006, 0))
    const g0: G[] = [blob([0.025, 0.018, 0.022], () => ({ c: dark }), 14, 10, base.clone().add(V(-0.012, 0.004, 0)))]
    for (const z of [-1, 1]) g0.push(blob([0.014, 0.011, 0.011], () => ({ c: [0.72, 0.85, 0.25], g: 1 }), 12, 8, base.clone().add(V(-0.008, 0.0, z * 0.024))))
    const t0 = chainSeg(abdomen, V(0, 0, 0), base, g0, mat)
    const mid = b1.clone().add(V(-0.15, 0.06, 0)), end = b1.clone().add(V(-0.32, 0.075, 0))
    const t1 = chainSeg(t0, base, b1, [tube([b1, b1.clone().add(V(-0.07, 0.04, 0)), mid], (t) => 0.0045 * (1 - 0.3 * t), () => dark, () => 0, 6, 12)], mat)
    const t2 = chainSeg(t1, b1, mid, [tube([mid, mid.clone().add(V(-0.08, 0.012, 0.005)), end], (t) => 0.0032 * (1 - 0.6 * t), () => dark, () => 0, 5, 12)], mat)
    rig.tail.push(t0, t1, t2)
  }
  yield;
  rig.clear = hy - Math.max(pr[1], mr[1]) * 0.8
  yield;
  rig.pivotX = pX - pr[0]
  yield;
  return rig
}

// ======================================================================
// 吸附蜱：扁平椭圆 + 前突带倒钩口器；setEngorge(k) 用形变目标把腹部吹成灰紫色鼓球
// ======================================================================
function* buildTickJob(grp: THREE.Group, R: () => number): Generator<void, ArachnidRig, unknown> {
  const hy = 0.045
  const rig = newRig('tick', 'tick', grp, hy)
  yield;
  const { ceph, abdomen } = rig.body
  yield;
  const mat = bodyMat({ color: '#ffffff', map: textures().chitin, shininess: 45, specular: '#4a3c34' })
  yield;
  const r0: C3 = [0.11, 0.03, 0.08], off0 = V(-0.0, 0, 0)
  yield;
  const r1: C3 = [0.195, 0.155, 0.16], off1 = V(-0.075, 0.105, 0)
  yield;
  const vk = 1 + (R() - 0.5) * 0.18, vh = (R() - 0.5) * 0.14
  yield;
  const brown: C3 = [0.45 * vk * (1 + vh), 0.28 * vk, 0.2 * vk * (1 - vh)], purple: C3 = [0.56 * (1 + vh * 0.5), 0.5, 0.6 * (1 - vh * 0.5)]
  yield;
  const scut = (d: THREE.Vector3) => sstep(0.25, 0.4, d.x + 0.15 * (1 - Math.abs(d.z) * 2)) * sstep(-0.1, 0.3, d.y)
  yield;
  const F0: BF = (d) => {
    // 尾缘一圈花彩（褶边）、背面纵沟、前背盾板深色
    const fest = 0.03 * sstep(0.2, -0.6, d.x) * Math.abs(Math.sin(Math.atan2(d.z, -d.x) * 5.5)) * gauss(d.y, 0, 0.35)
    const groove = 0.18 * gauss(Math.abs(d.z), 0.35, 0.05) * sstep(0.4, 0.8, d.y) * sstep(0.2, -0.3, d.x)
    let c: C3 = mix(brown, [0.2, 0.12, 0.09], scut(d))
    c = mix(c, mul(brown, 0.6), groove * 3)
    if (d.y < -0.3) c = mix(c, [0.55, 0.42, 0.34], 0.5)
    return { s: 1 - fest - groove * 0.1 - 0.25 * sstep(0, 1, -d.y), c }
  }
  yield;
  const body = blob(r0, F0, 40, 26, off0)
  yield;
  // 吸饱后的圆鼓体（同拓扑）：setEngorge 在 CPU 上逐顶点插值位置/法线/顶点色（灰紫、盾板仍是前背一小块深色）。
  // 注：没用 morphTargets——当前 three 版本的形变颜色有着色器 bug，且形变位置在 swiftshader 下整帧发黑。
  const g1 = blob(r1, (d) => ({ s: 1 - 0.04 * sstep(0, 1, -d.y) + 0.012 * Math.sin(d.x * 14) * Math.sin(d.z * 12), c: mix(mix(purple, [0.66, 0.6, 0.68], 0.3 * sstep(0, 1, d.y)), [0.18, 0.11, 0.08], sstep(0.82, 0.9, d.x) * sstep(0.3, 0.5, d.y)) }), 40, 26, off1)
  yield;
  fin(body);
  yield; fin(g1)
  yield;
  const A = (g: G, n: string) => Float32Array.from((g.attributes[n] as THREE.BufferAttribute).array as Float32Array)
  yield;
  const P0 = A(body, 'position'), P1 = A(g1, 'position'), N0 = A(body, 'normal'), N1 = A(g1, 'normal'), C0 = A(body, 'color'), C1 = A(g1, 'color')
  yield;
  const bm = new THREE.Mesh(body, mat);
  yield; abdomen.add(bm)
  yield;
  const lerpAttr = (name: string, a: Float32Array, b: Float32Array, k: number) => {
    const at = body.attributes[name] as THREE.BufferAttribute, arr = at.array as Float32Array
    for (let i = 0; i < arr.length; i++) arr[i] = a[i] + (b[i] - a[i]) * k
    at.needsUpdate = true
  }
  yield;
  // 口器（假头）：基部 + 一对须肢 + 中间带倒钩的口下板
  const mouth = new THREE.Group();
  yield; mouth.position.set(r0[0] * 0.92, -0.006, 0);
  yield; ceph.add(mouth)
  yield;
  const mg: G[] = [blob([0.018, 0.011, 0.02], () => ({ c: [0.28, 0.16, 0.11] }), 14, 10, V(0.008, 0, 0))]
  yield;
  for (const z of [-1, 1]) mg.push(tube([V(0.012, 0, z * 0.012), V(0.03, -0.001, z * 0.012), V(0.045, -0.004, z * 0.006)], (t) => 0.0055 * (1 - 0.4 * t), () => [0.32, 0.19, 0.13], () => 0, 7, 8, 0.7))
  yield;
  mg.push(tube([V(0.012, -0.002, 0), V(0.035, -0.003, 0), V(0.055, -0.006, 0)], (t) => 0.0045 * (1 - 0.7 * t), () => [0.5, 0.36, 0.26], () => 0, 7, 10, 0.6))
  yield;
  for (let k = 0; k < 6; k++) for (const z of [-1, 1]) mg.push(cone(0.0012, 0.005, V(0.02 + k * 0.0055, -0.004, z * 0.0025), V(-0.8, -0.1, z * 0.6), [0.62, 0.48, 0.36], 3))
  yield;
  mouth.add(new THREE.Mesh(mergeAll(mg), mat))
  yield;
  rig.mouth = mouth
  yield;
  // 8 条短腿，集中在前半身两侧，向外向前张开
  const phis = [0.75, 1.25, 1.75, 2.2]
  yield;
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const t = [0.62, 0.4, 0.15, -0.1][i]
    const at = V(r0[0] * t, -0.014, side * r0[2] * Math.sqrt(1 - t * t) * 0.7)
    const j = buildLeg(ceph, at, phis[i], side, { len: [0.13, 0.12, 0.12, 0.13][i], up: 0.75, r: 0.0065, hipH: hy - 0.014, ff: 0.42, col: (tt, p) => mix([0.42, 0.26, 0.18], [0.6, 0.45, 0.35], p ? 0.5 * sstep(0.6, 0.9, Math.sin(tt * 12) ** 2) : 0), hair: 6, hairLen: 0.006, hairCol: [0.6, 0.48, 0.38] }, mat, R)
    addLeg(rig, { j, side, idx: i })
  
 yield;
 }
  yield;
  rig.engorge = 0
  yield;
  rig.setEngorge = (k: number) => {
    k = clamp01(k); rig.engorge = k
    lerpAttr('position', P0, P1, k); lerpAttr('normal', N0, N1, k); lerpAttr('color', C0, C1, k)
    body.computeBoundingSphere(); body.computeBoundingBox()
    // 吸饱后口器略下压、腿向外撑开（身体变高时脚仍要够到地面）
    mouth.position.set(r0[0] * 0.92 + 0.015 * k, -0.006 - 0.002 * k, 0)
    rig.legs.forEach((j) => { j[1].rotation.z = (j[1].userData.r0?.z ?? 0) - 0.25 * k; j[2].rotation.z = (j[2].userData.r0?.z ?? 0) + 0.3 * k })
  }
  yield;
  rig.clear = hy - 0.025
  yield;
  rig.pivotX = 0
  yield;
  return rig
}

// ======================================================================
// 群体：幼蛛潮 / 螨群（InstancedMesh）
// ======================================================================
function spiderlingGeo(): G {
  const parts: G[] = [ball(0.009, V(0.01, 0.012, 0), [0.62, 0.5, 0.36], 0, 8, 6).scale(1, 0.75, 0.9), ball(0.012, V(-0.008, 0.014, 0), [0.5, 0.4, 0.3], 0, 8, 6).scale(1.1, 0.85, 0.9)]
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const phi = [0.6, 1.2, 1.9, 2.5][i], dir = V(Math.cos(phi), 0, side * Math.sin(phi))
    const h = V(0.01 - i * 0.004, 0.011, side * 0.004), k = h.clone().addScaledVector(dir, 0.012).add(V(0, 0.01, 0)), f = h.clone().addScaledVector(dir, 0.026).setY(0.0008)
    parts.push(fin(sweep([h, k, f], (t) => 0.0016 * (1 - 0.5 * t), { radial: 3, seg: 4 }), [0.45, 0.36, 0.27]))
  }
  return mergeAll(parts)
}
function miteGeo(): G {
  // 几毫米的小螨：低面数椭球 + 头部小球 + 细杆腿（8 足只剩轮廓，远看是带毛刺的小点）
  const parts: G[] = [fin(new THREE.SphereGeometry(0.5, 6, 4).scale(1.15, 0.8, 0.9).translate(0, 0.42, 0)), fin(new THREE.SphereGeometry(0.18, 4, 3).translate(0.55, 0.3, 0), 0.8)]
  // 4 根横贯身体的细杆 = 左右各 4 条腿（每根 12 个三角）
  for (const a of [0.55, 0.2, -0.2, -0.6]) parts.push(fin(new THREE.BoxGeometry(0.06, 0.05, 1.7).rotateY(a).rotateX(0).translate(a * 0.4, 0.14, 0), 0.65))
  return mergeAll(parts) // 单位尺寸约 1（身长），实例缩放到 3–8mm
}
function* buildSwarmJob(grp: THREE.Group, v: 'broodswarm' | 'mitecloud', R: () => number, mother: boolean): Generator<void, ArachnidRig, unknown> {
  const rig = newRig(v, 'swarm', grp, 0)
  rig.swarm = []
  yield;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color()
  yield;
  if (v === 'broodswarm') {
    const N = 48
    const im = new THREE.InstancedMesh(spiderlingGeo(), new THREE.MeshPhongMaterial({ color: '#ffffff', vertexColors: true, map: textures().chitin, shininess: 30, specular: '#3a3028' }), N)
    for (let i = 0; i < N; i++) {
      // 潮头向 +X：前端密、后端拖成一条带
      const a = R() * Math.PI * 2, rr = Math.sqrt(R())
      p.set(Math.cos(a) * rr * 0.45 - (mother ? 0 : 0.1) + (R() - 0.5) * 0.3, 0, Math.sin(a) * rr * 0.32)
      if (mother && p.length() < 0.36) p.multiplyScalar(0.36 / Math.max(0.05, p.length()) + 0.05) // 给母蛛让出位置
      q.setFromAxisAngle(V(0, 1, 0), (R() - 0.5) * 1.6)
      const k = (4 + R() * 2) / 5 // 4–6cm
      m4.compose(p, q, s.set(k, k, k)); im.setMatrixAt(i, m4)
      im.setColorAt(i, col.setHSL(0.08 + R() * 0.03, 0.35 + R() * 0.2, 0.42 + R() * 0.2))
    
 yield;
 }
    rig.swarm.push(im); rig.root.add(im)
    if (mother) {
      // 母蛛：一只狼蛛，腹背驮着二十来只幼蛛
      const mg = new THREE.Group(); grp.add(mg)
      const mrig = yield* buildSpiderJob(mg, 'wolf', R)
      mg.userData.arachnidRig = mrig
      const ab = mrig.body.abdomen
      const back = new THREE.InstancedMesh(spiderlingGeo(), (im.material as THREE.Material), 22)
      const S = spiderSpec('wolf', R), aOff = V(S.abdX - (S.cephX - S.ceph[0] * 0.92), S.abdY, 0)
      for (let i = 0; i < 22; i++) {
        const d = V(-0.2 - R() * 0.8, 0.45 + R() * 0.55, (R() - 0.5) * 1.4).normalize()
        const pt = blobPt(S.abd, S.abdF, d, aOff), nn = V(d.x / S.abd[0], d.y / S.abd[1], d.z / S.abd[2]).normalize()
        q.setFromUnitVectors(V(0, 1, 0), nn).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), R() * 6.28))
        const k = (3.5 + R() * 1.5) / 5
        m4.compose(pt.addScaledVector(nn, 0.006), q, s.set(k, k, k)); back.setMatrixAt(i, m4)
        back.setColorAt(i, col.setHSL(0.08, 0.3, 0.5 + R() * 0.15))
      
 yield;
 }
      ab.add(back); rig.swarm.push(back)
      rig.root.userData.mother = mrig
    }
  } else {
    const N = 520
    const im = new THREE.InstancedMesh(miteGeo(), new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true }), N)
    // 几个团块中心：地面上的几堆 + 少量悬浮扩散
    const clumps = Array.from({ length: 6 }, () => V((R() - 0.5) * 0.6, 0, (R() - 0.5) * 0.6))
    for (let i = 0; i < N; i++) {
      const c = clumps[i % clumps.length], air = R() < 0.25
      const rr = (air ? 0.4 : 0.16) * Math.sqrt(-2 * Math.log(Math.max(1e-3, R())))
      const a = R() * 6.28
      p.set(c.x + Math.cos(a) * rr, 0, c.z + Math.sin(a) * rr)
      // 团中心堆高（螨相互叠成小丘）
      p.y = air ? 0.05 + R() * 0.55 : Math.max(0, 0.025 * Math.exp(-(rr * rr) / 0.006)) * R()
      if (Math.hypot(p.x, p.z) > 0.55) p.multiplyScalar(0.55 / Math.hypot(p.x, p.z)).setY(p.y)
      q.setFromEuler(new THREE.Euler(air ? R() * 6 : (R() - 0.5) * 0.4, R() * 6.28, air ? R() * 6 : (R() - 0.5) * 0.4))
      const k = 0.003 + R() * 0.005
      m4.compose(p, q, s.set(k, k, k)); im.setMatrixAt(i, m4)
      im.setColorAt(i, R() < 0.62 ? col.setRGB(0.72 + R() * 0.15, 0.1 + R() * 0.06, 0.06) : col.setRGB(0.86, 0.76 + R() * 0.06, 0.58))
    
 yield;
 }
    rig.swarm.push(im); rig.root.add(im)
  }
  yield;
  rig.swarm.forEach((m) => { if (m.instanceColor) m.instanceColor.needsUpdate = true; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere() })
  yield;
  return rig
}

// ======================================================================
// 符文蛛巢（环境件）：局部坐标里洞角在原点，两面墙分别是 x=0（向 +Z 延伸）与 z=0（向 +X 延伸），地面 y=0；
// 巢占据 x>0、z>0 的象限约 2.2m×2.2m×2m。放置时把象限对角线朝向开阔处即可。
// ======================================================================
/** 双线性网片：四角 + 下垂量 + 起伏 */
function sheet(out: G[], q00: THREE.Vector3, q10: THREE.Vector3, q01: THREE.Vector3, q11: THREE.Vector3, sag: THREE.Vector3, R: () => number, nu = 14, nv = 14, uvK = 1.2) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  const ph = R() * 6
  const pt = (u: number, v: number) => {
    const a = q00.clone().lerp(q10, u), b = q01.clone().lerp(q11, u), p = a.lerp(b, v)
    const w = Math.sin(Math.PI * u) * Math.sin(Math.PI * v)
    return p.addScaledVector(sag, w * (1 + 0.25 * Math.sin(u * 7 + ph) * Math.sin(v * 5 + ph)))
  }
  const L = q00.distanceTo(q11) * uvK
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const u = i / nu, v = j / nv, p = pt(u, v); pos.push(p.x, p.y, p.z); uv.push(u * L, v * L)
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; idx.push(a, b, a + 1, b, b + 1, a + 1) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals()
  out.push(fin(g))
  return pt
}
/**
 * 人形茧（阶段 2 重做）：沿 +Y 从脚到头，按人体剖面放样——头、颈、宽肩、胸、腰、胯，下半身前后各一道腿缝分成两条腿，
 * 两侧有手臂贴身的浅沟；表面叠一圈圈螺旋丝棱，再外缠几股交叉的粗丝带。正面朝 +Z。
 */
/** 单独的人形茧（预览 / 场景散件用）：脚在 y=0，正面 +Z */
export function buildHumanCocoon(seed = 0): THREE.Mesh {
  const g = humanCocoon(1.62, rng(0xc0c0 + seed * 31)).translate(0, 0.81, 0)
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#ffffff', map: textures().silk, vertexColors: true }))
}
function humanCocoon(H: number, R: () => number): G {
  // 剖面关键帧：[高度比例, 半宽(左右), 半厚(前后)]（单位 m，按 1.62m 人形）
  const prof: [number, number, number][] = [
    [0, 0.0, 0.0], [0.012, 0.085, 0.07], [0.04, 0.12, 0.095], [0.075, 0.095, 0.07], [0.19, 0.14, 0.095], [0.27, 0.125, 0.085], [0.41, 0.175, 0.105],
    [0.5, 0.195, 0.115], [0.59, 0.15, 0.1], [0.69, 0.19, 0.12], [0.775, 0.245, 0.115], [0.815, 0.215, 0.1], [0.845, 0.11, 0.08], [0.865, 0.058, 0.06],
    [0.885, 0.075, 0.08], [0.925, 0.108, 0.112], [0.965, 0.1, 0.104], [0.993, 0.05, 0.055], [1, 0, 0],
  ]
  const at = (v: number): [number, number] => {
    for (let k = 1; k < prof.length; k++) if (v <= prof[k][0]) { const a = prof[k - 1], b = prof[k], t = (v - a[0]) / (b[0] - a[0]), u = t * t * (3 - 2 * t); return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u] }
    return [0, 0]
  }
  const NU = 40, NV = 96, pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = []
  const ph = R() * 6
  for (let j = 0; j <= NV; j++) {
    const v = j / NV, [wx, wz] = at(v)
    for (let i = 0; i <= NU; i++) {
      const th = (i / NU) * Math.PI * 2, cx = Math.cos(th), sz = Math.sin(th)
      let r = 1
      // 腿缝：0.05–0.47 高度，前后正中（th=±π/2 方向）各一道凹沟
      const leg = sstep(0.03, 0.1, v) * sstep(0.49, 0.42, v)
      r -= 0.42 * leg * Math.exp(-((Math.abs(cx)) ** 2) / 0.025)
      // 手臂沟：0.45–0.8 高度，左右两侧偏前后各一道浅沟（手臂贴在身侧）
      const arm = sstep(0.44, 0.5, v) * sstep(0.81, 0.76, v)
      r -= 0.14 * arm * (Math.exp(-((Math.abs(cx) - 0.8) ** 2) / 0.006))
      // 颈下锁骨、膝盖的轻微起伏
      r += 0.04 * gauss(v, 0.28, 0.02) * Math.abs(sz)
      // 螺旋丝棱（两组相反方向）
      const sp = Math.sin(v * H * 70 + th * 2 + ph), sp2 = Math.sin(v * H * 46 - th * 3 + ph * 2)
      r += 0.035 * Math.max(sp, 0) ** 3 + 0.025 * Math.max(sp2, 0) ** 4
      const x = cx * wx * r, z = sz * wz * r
      pos.push(x, v * H, z)
      uv.push(i / NU * 2, v * H * 2.2)
      const shade = 0.78 + 0.22 * Math.max(sp, 0) - 0.4 * leg * Math.exp(-(cx ** 2) / 0.025) - 0.12 * arm * Math.exp(-((Math.abs(cx) - 0.8) ** 2) / 0.006)
      col.push(0.9 * shade, 0.87 * shade, 0.8 * shade)
    }
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + NU + 1; idx.push(a, a + 1, b, b, a + 1, b + 1) }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx)
  g.computeVertexNormals()
  const parts: G[] = [fin(g.toNonIndexed())]
  // 外缠粗丝带：几股绕身体的螺旋，交叉缠绕（股与股之间相位不同、方向相反）
  for (let k = 0; k < 7; k++) {
    const dir = k % 2 ? -1 : 1, turns = 1.2 + R() * 0.8, v0 = 0.04 + R() * 0.5, v1 = Math.min(0.98, v0 + 0.3 + R() * 0.3), a0 = R() * 6.28
    const pts: THREE.Vector3[] = []
    for (let m = 0; m <= 40; m++) {
      const t = m / 40, v = v0 + (v1 - v0) * t, th = a0 + dir * t * turns * Math.PI * 2, [wx, wz] = at(v)
      pts.push(V(Math.cos(th) * wx * 1.06, v * H, Math.sin(th) * wz * 1.06))
    }
    parts.push(fin(tube(pts, () => 0.007, () => [0.95, 0.93, 0.87], () => 0, 4, 60)))
  }
  return mergeAll(parts).translate(0, -H / 2, 0)
}

export function buildRuneNest(seed = 0): THREE.Group {
  const grp = new THREE.Group()
  grp.userData.entityType = 'arachnid-runenest'
  const R = rng(0x5e57 + seed * 977)
  const tx = textures()
  // ---------- 网片 ----------
  const sh: G[] = []
  const e = 0.015
  const main = sheet(sh, V(e, 1.95, e), V(e, 1.25, 1.9), V(1.9, 1.25, e), V(1.25, 0.22, 1.25), V(-0.05, -0.32, -0.05), R, 18, 18)
  sheet(sh, V(e, 0.02, e), V(e, 0.03, 2.2), V(2.2, 0.03, e), V(1.6, 0.03, 1.6), V(0, 0.12, 0), R, 16, 16, 1.6) // 地毯网（盖在碎石上微微隆起）
  sheet(sh, V(0.04, 0.02, 0.08), V(0.06, 0.02, 1.7), V(0.08, 1.6, 0.06), V(0.06, 1.2, 1.4), V(0.12, 0, 0), R, 12, 12) // 贴 x=0 墙的厚网
  sheet(sh, V(0.08, 0.02, 0.04), V(1.7, 0.02, 0.06), V(0.06, 1.6, 0.08), V(1.4, 1.2, 0.06), V(0, 0, 0.12), R, 12, 12)
  sheet(sh, V(e, 1.98, 0.5), V(e, 2.0, e), V(0.5, 2.0, e), V(0.55, 1.6, 0.55), V(0.06, -0.1, 0.06), R, 8, 8) // 顶角漏斗
  sheet(sh, V(0.35, 0.03, 1.5), V(0.9, 0.03, 1.9), V(0.6, 0.7, 1.1), V(1.0, 0.45, 1.4), V(0.05, -0.08, 0.05), R, 8, 8) // 侧下方的斜网
  const webM = new THREE.MeshLambertMaterial({ color: '#e8e4da', map: tx.web, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, emissive: '#1c1b18' })
  const webMesh = new THREE.Mesh(merge(sh), webM); webMesh.renderOrder = 1; grp.add(webMesh)
  // ---------- 丝线 ----------
  const ln: number[] = []
  const line = (a: THREE.Vector3, b: THREE.Vector3, sagK = 0.05) => { // 每根丝分 6 段下垂
    let prev = a
    for (let k = 1; k <= 6; k++) { const t = k / 6, p = a.clone().lerp(b, t); p.y -= Math.sin(Math.PI * t) * a.distanceTo(b) * sagK; ln.push(prev.x, prev.y, prev.z, p.x, p.y, p.z); prev = p }
  }
  for (let i = 0; i < 70; i++) {
    const a = main(0.1 + R() * 0.8, 0.1 + R() * 0.8)
    const r = R()
    const b = r < 0.3 ? V(e, 0.2 + R() * 1.7, 0.1 + R() * 1.6) : r < 0.6 ? V(0.1 + R() * 1.6, 0.2 + R() * 1.7, e) : r < 0.85 ? V(0.2 + R() * 1.4, 0.02, 0.2 + R() * 1.4) : main(R(), R())
    line(a, b, 0.02 + R() * 0.05)
  }
  for (let i = 0; i < 26; i++) { const a = V(e, 0.4 + R() * 1.5, 0.1 + R() * 1.2), b = V(0.1 + R() * 1.2, 0.4 + R() * 1.5, e); line(a, b, 0.03) } // 横跨洞角的丝
  const lm = new THREE.LineBasicMaterial({ color: '#d8d4ca', transparent: true, opacity: 0.3, depthWrite: false })
  const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(ln, 3))
  grp.add(new THREE.LineSegments(lineGeo, lm))
  // 粗缆绳（承重丝）
  const ropes: G[] = []
  for (const [a, b] of [[main(0.5, 1), V(1.7, 0.02, 1.9)], [main(1, 0.5), V(2.1, 0.02, 1.4)], [main(1, 1), V(1.6, 0.02, 1.6)], [main(0, 1), V(2.2, 1.4, e)], [main(1, 0), V(e, 1.4, 2.2)], [main(0.5, 0.5), V(0.9, 0.02, 0.9)]] as [THREE.Vector3, THREE.Vector3][]) {
    const m = a.clone().lerp(b, 0.5); m.y -= 0.05
    ropes.push(tube([a, m, b], () => 0.006, () => [0.86, 0.84, 0.78], () => 0, 5, 8))
  }
  // ---------- 裹茧的猎物 ----------
  const coc: G[] = []
  const cocoon = (len: number, r: number, at: THREE.Vector3, rot: THREE.Euler, human: boolean) => {
    const g = blob([r, len / 2, r * 0.85], (d) => {
      // 人形茧：头部隆起、肩宽、脚端收细；其余为纺锤形；外加一圈圈缠绕的丝棱
      let s = 1 - 0.35 * sstep(0, -1, d.y) * (human ? 0.6 : 1)
      if (human) { s *= 1 - 0.28 * gauss(d.y, 0.72, 0.06); s *= 1 + 0.12 * gauss(d.y, 0.55, 0.08) }
      s *= 1 + 0.035 * Math.sin(d.y * 38 + Math.atan2(d.z, d.x) * 2)
      return { s, c: mix([0.82, 0.79, 0.72], [0.6, 0.55, 0.46], 0.35 * sstep(0.2, 1, Math.sin(d.y * 9 + d.x * 3))) }
    }, 20, 24)
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot)).translate(at.x, at.y, at.z)
    coc.push(g)
    return g
  }
  // 人形大茧：倒挂在主网下，脚端离地
  // 人形大茧：斜靠在洞角，头端搭在贴墙厚网上，脚端落在地毯网里，几根丝把它吊在主网下
  const cc = V(1.05, 0.5, 0.9)
  coc.push(humanCocoon(1.62, R).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.98, 0, 0.12))).translate(cc.x, cc.y, cc.z))
  for (const t of [0.3, 0.6]) line(main(0.45 + t * 0.2, 0.5), cc.clone().add(V(0, 0.2 + t * 0.3, -0.25 - t * 0.2)), 0)
  cocoon(0.48, 0.12, V(1.25, 0.12, 0.55), new THREE.Euler(0, 0.4, Math.PI / 2), false)
  cocoon(0.38, 0.1, V(0.55, 0.11, 1.35), new THREE.Euler(Math.PI / 2, 0, 0.3), false)
  cocoon(0.26, 0.07, V(0.14, 1.05, 0.7), new THREE.Euler(0.1, 0, 0.15), false)
  cocoon(0.22, 0.06, V(0.9, 1.45, 0.16), new THREE.Euler(0.2, 0, -0.2), false)
  for (const c of [V(1.25, 0.12, 0.55), V(0.55, 0.11, 1.35)]) line(c.clone().add(V(0, 0.08, 0)), main(R() * 0.5 + 0.4, R() * 0.5 + 0.4), 0.01)
  const cm = new THREE.MeshLambertMaterial({ color: '#ffffff', map: tx.silk, vertexColors: true })
  grp.add(new THREE.Mesh(merge([...coc.map((g) => fin(g)), ...ropes.map((g) => fin(g))]), cm))
  // ---------- 发光符文：贴在网片与墙上的象形符（图集 4×4 取格） ----------
  const rg: G[] = []
  const glyphQuad = (p: THREE.Vector3, n: THREE.Vector3, size: number, cell: number, spin: number) => {
    const g = new THREE.PlaneGeometry(size, size)
    const uv = g.attributes.uv as THREE.BufferAttribute, cx = cell % 4, cy = Math.floor(cell / 4)
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i)) / 4, 1 - (cy + 1 - uv.getY(i)) / 4)
    g.rotateZ(spin)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n.clone().normalize()))
    g.translate(p.x + n.x * 0.02, p.y + n.y * 0.02, p.z + n.z * 0.02)
    rg.push(fin(g))
  }
  const nAt = (u: number, v: number) => { const a = main(u + 0.01, v).sub(main(u - 0.01, v)), b = main(u, v + 0.01).sub(main(u, v - 0.01)); const n = new THREE.Vector3().crossVectors(a, b).normalize(); return n.dot(V(1, 0.3, 1)) < 0 ? n.negate() : n }
  const cells = [0, 4, 5, 2, 9, 13, 6, 1]
  ;[[0.45, 0.45, 0.5], [0.3, 0.7, 0.3], [0.7, 0.3, 0.3], [0.75, 0.75, 0.34], [0.2, 0.25, 0.22]].forEach(([u, v, s], k) => glyphQuad(main(u, v), nAt(u, v), s, cells[k], (R() - 0.5) * 0.4))
  glyphQuad(V(0.16, 0.85, 0.9), V(1, 0, 0), 0.55, 0, 0.05) // 墙网上的大面具符
  glyphQuad(V(1.0, 0.75, 0.16), V(0, 0, 1), 0.45, 5, -0.1)
  glyphQuad(V(1.0, 0.16, 1.0), V(0, 1, 0), 0.6, 4, 0.7) // 地毯网中央
  const runeMesh = new THREE.Mesh(merge(rg), runeMat(runeTex('atlas', seed), 1.8, true)); runeMesh.renderOrder = 3; runeMesh.userData.rune = 1
  grp.add(runeMesh)
  grp.userData.arachnidRig = { variant: 'runenest', kind: 'nest', lightHint: { pos: V(0.7, 0.9, 0.7), color: '#8a6cff', intensity: 0.6, distance: 3 } }
  return grp
}

// ======================================================================
// 对外入口
// ======================================================================
export function* buildArachnidJob(variant: ArachnidVariant, seed = 0, opts: { mother?: boolean } = {}): Generator<void, THREE.Group, unknown> {
  if (variant === 'runenest') return buildRuneNest(seed)
  const grp = new THREE.Group()
 let complete=false
 try {
  yield;
  grp.userData.entityType = 'arachnid'
  yield;
  grp.userData.arachnidVariant = variant
  yield;
  const R = rng(0xa8ac + seed * 7919 + variant.length * 131)
  yield;
  let rig: ArachnidRig
  yield;
  if (variant === 'cavescorpion' || variant === 'whipscorpion') rig = yield* buildScorpionJob(grp, variant, R)
  else if (variant === 'tick') rig = yield* buildTickJob(grp, R)
  else if (variant === 'broodswarm' || variant === 'mitecloud') rig = yield* buildSwarmJob(grp, variant, R, opts.mother ?? false)
  else rig = yield* buildSpiderJob(grp, variant, R)
  yield;
  // 记录静止姿态，姿势函数在此基础上叠加
  grp.traverse((o) => { if (o !== grp && (o as THREE.Group).isGroup) rest(o) })
  yield;
  grp.userData.arachnidRig = rig
 complete=true

  yield;
  return grp

 }finally{if(!complete)disposeL8Tree(grp)}
}

const _p = new THREE.Vector3()
const setR = (g: THREE.Object3D, x = 0, y = 0, z = 0) => { const r0 = g.userData.r0 as THREE.Euler | undefined; g.rotation.set((r0?.x ?? 0) + x, (r0?.y ?? 0) + y, (r0?.z ?? 0) + z) }
/**
 * 静态姿势（阶段 2 动画在此基础上插值）：
 * rear 0–1：前两对腿抬起、身体前端抬高、螯肢张开（威吓）；
 * curl 0–1：腿向腹下收拢、身体落地（受惊缩团 / 死亡）；
 * strike 0–1：尾刺前刺、螯前伸张开（蝎）/ 螯牙前探（蜘蛛）/ 口器前顶（蜱）；
 * engorge 0–1：仅吸附蜱，吸血膨胀。
 */
export function poseArachnid(grp: THREE.Group, o: { rear?: number; curl?: number; strike?: number; engorge?: number } = {}) {
  const rig = grp.userData.arachnidRig as ArachnidRig | undefined
  if (!rig || rig.kind === 'nest' || rig.kind === 'swarm') {
    const m = rig?.root.userData.mother as ArachnidRig | undefined
    if (m && m.root.parent) poseArachnid(m.root.parent as THREE.Group, { ...o, engorge: undefined })
    return
  }
  const r = clamp01(o.rear ?? 0), c = clamp01(o.curl ?? 0), s = clamp01(o.strike ?? 0)
  grp.traverse((g) => { if ((g as THREE.Group).isGroup && g.userData.r0) { g.rotation.copy(g.userData.r0); g.position.copy(g.userData.p0) } })
  // 身体：威吓时以后腿基部为支点抬起前端；缩团时整体落地
  const tilt = r * (rig.kind === 'spider' ? 0.42 : 0.25)
  const piv = V(rig.pivotX, 0, 0)
  _p.copy(rig.root.userData.p0).sub(V(piv.x, rig.hy, 0)).applyAxisAngle(V(0, 0, 1), tilt).add(V(piv.x, rig.hy, 0))
  rig.root.position.copy(_p)
  rig.root.position.y -= c * Math.max(0, rig.clear) * 0.92
  rig.root.position.x += s * rig.hy * 0.25
  rig.root.rotation.z = tilt - s * 0.05
  rig.body.abdomen.rotation.z = -r * 0.18 + c * 0.12
  rig.legs.forEach((j, n) => {
    const info = rig.legInfo[n], i = info.idx
    if (info.missing) return
    let fz = 0, tz = 0, cy = 0
    // 威吓：第 1 对腿高举、第 2 对半举，后两对压低支撑
    if (i === 0) { fz += r * 0.95; tz += r * 0.75; cy += -r * 0.12 * info.side }
    else if (i === 1) { fz += r * 0.5; tz += r * 0.35 }
    else if (i === 2) { fz += -r * 0.22; tz += r * 0.1 }
    else { fz += -r * 0.28; tz += r * 0.18 }
    // 缩团：腿节上翘、胫节向内折到腹下
    fz += c * 0.7; tz += -c * 2.1
    cy += c * 0.18 * info.side * (i < 2 ? -1 : 1)
    if (rig.kind !== 'spider' && s > 0 && i < 2) { fz += s * 0.1 }
    setR(j[0], 0, cy, 0); setR(j[1], 0, 0, fz); setR(j[2], 0, 0, tz)
  })
  // 螯肢：威吓/扑咬时向前张开露牙
  rig.chelicerae.forEach((g, k) => setR(g, (k ? -1 : 1) * (r * 0.2), 0, r * 0.45 + s * 0.8 + c * -0.2))
  // 触肢：威吓时上举
  if (rig.kind === 'spider') rig.pedipalps.forEach((g, k) => setR(g, (k ? 1 : -1) * r * 0.25, 0, r * 0.7 - c * 0.5))
  // 蝎螯：威吓张开上举，前刺时前伸
  rig.claws.forEach((cl) => {
    setR(cl.arm, 0, -cl.side * (r * 0.35 - s * 0.25) * 1, r * 0.35 + s * 0.12 - c * 0.2)
    setR(cl.finger, 0, cl.side * (r * 0.55 + s * 0.45) * (rig.kind === 'whip' ? -1 : 1), 0)
  })
  // 尾：洞蝎前刺 = 后腹各节顺序向前卷压；鞭蝎尾须上扬
  if (rig.kind === 'scorpion') {
    const k = [-0.32, -0.42, -0.62]
    rig.tail.forEach((g, n) => setR(g, 0, 0, k[n] * s + r * [0.08, 0.1, 0.12][n] - c * [0.25, 0.3, 0.2][n]))
  } else if (rig.kind === 'whip') {
    rig.tail.forEach((g, n) => setR(g, 0, 0, r * [0.3, 0.25, 0.15][n] - s * [0.0, 0.25, 0.2][n]))
  }
  if (rig.mouth) rig.mouth.position.x += s * 0.012
  if (rig.setEngorge && o.engorge !== undefined) rig.setEngorge(o.engorge)
  else if (rig.setEngorge) rig.setEngorge(rig.engorge ?? 0)
}

/** 统计：网格数与三角形数（InstancedMesh 计单体 × 实例数） */
export function arachnidStats(grp: THREE.Object3D) {
  let meshes = 0, tris = 0, inst = 0
  grp.traverse((m) => {
    const mm = m as THREE.Mesh
    if (!mm.isMesh) return
    meshes++
    const t = triCount(mm.geometry)
    const im = m as THREE.InstancedMesh
    if (im.isInstancedMesh) { tris += t * im.count; inst += im.count } else tris += t
  })
  return { meshes, tris: Math.round(tris), instances: inst }
}

function textures(){if(!TEX){const job=prepareArachnidTextures();while(!job.next().done){/* standalone */}}return TEX!}
export function buildArachnidMesh(variant:ArachnidVariant,seed=0,opts:{mother?:boolean}={}):THREE.Group{const job=buildArachnidJob(variant,seed,opts);let n=job.next();while(!n.done)n=job.next();return n.value}

const canvasTex:typeof sourceCanvasTex=(...args)=>{const t=sourceCanvasTex(...args);if(t)t.userData.entityShared=true;return t}
