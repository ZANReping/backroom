// 「手臂」（FR wiki Entité 15-FR「Les Bras」，Level 1）重制模型——第 1 阶段静态建模 + 第 2 阶段建模修正（动画见 armsAnim.ts）。
// 设定：又长又扭曲、腐烂的灰色皮肤长臂，末端三根锋利钩爪（大到能环住人的胸口）；住在通风管里，
// 只在下方黑暗时钻出；被强光照到会缩回去，在格栅下留下冒烟的烧焦皮肤碎片。
// 参照用户附图：天花板下一截方形通风管，管口垂下三条暗色长臂，细长手掌 + 三根弯钩长爪，其中一条扣着柜子边缘。
//
// ─── 坐标约定 ───────────────────────────────────────────────────────────────
//   buildArmsVent()：原点 = 天花板底面上的管道中心，+Y 向上。管段从 y=-ARMS_VENT_DROP（管口下沿）一直向上没入天花板。
//   buildArmsMesh()：原点 = 管口中心（即 vent 的 y=-ARMS_VENT_DROP 处），+Y 向上；臂根藏在管内 y=+ARMS_ROOT_IN。
//     用法：armsVent(vent).anchor.add(buildArmsMesh(3, seed))——anchor 就在管口中心。
//
// ─── 结构与预算 ─────────────────────────────────────────────────────────────
//   手臂：1 个 SkinnedMesh × 2 个材质组 = 2 次绘制（所有臂共用一副骨架）
//     组 0 皮肤（臂 + 手掌，一条连续扫掠管体；Canvas 腐皮图集 + 每臂独立「烧焦」uniform）
//     组 1 角质钩爪（顶点色：灰皮 → 深褐角质 → 黑尖，低粗糙度）
//   风口：管段（含黑色内衬与内顶盖）1 次 + 百叶格栅（铰链组）1 次 = 2 次绘制
//   合计 4 次绘制。烧焦皮肤碎片（buildArmsBurntDebris）是第 3 阶段才出现的独立道具：焦痕贴花 + 皮片 + 烟 = 3 次。
//
// ─── 骨骼（第 2 阶段：每条臂 26 根，3 条臂共 1 + 78 = 79 根；静止时全部单位旋转、仅平移）───────────
//   root（管口中心）
//    └ arm{a}_s0 → m0 → s1 → m1 → … → s7 → m7   臂骨链 16 节（8 根主骨 s + 每段中点的中间骨 m，分摊弯曲、急弯不塌腰）
//       └ arm{a}_hand          腕/掌
//          └ arm{a}_claw{j}_0 → _1 → _2   三根爪 j=0,1,2（0/2 为两侧，1 居中），每根 3 节
//   蒙皮权重：臂管体上的顶点按弧长在相邻两个关节（16 节等分）之间做「帽函数」线性混合；爪同理；
//   爪根皮褶（指节套）在 hand 与爪第 1 节之间混合。
//     · 动画（armsAnim.ts）：沿一条路径按弧长摆放全部关节（「样条骨架」），朝向取平行移动标架；也可直接旋转骨骼。
//     · 伸长：setStretch(a, k) 把 chain[1..15] 与 hand 的局部平移乘以 k；setStretchLook(a, k) 让截面按体积守恒变细
//       （每臂一个 morph 目标，半径 × max(0.6, 1/√k)）并让 shader 按长度重新平铺皮肤贴图（腐皮不被拉长）。
//   爪：armsRig(g).setClawCurl(a, c)：c=0 静止弯钩，c>0 收拢（扣住），c<0 张开；绕每根爪自身的铰链轴旋转三节。
//
// 贴图全部为运行时 Canvas 程序化生成（全部实例共享），Node 下（无 document）退化为纯顶点色。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { getMaterialMode, litMaterial, mulberry } from './shared'

type V3 = THREE.Vector3
type RGB = [number, number, number]
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const hex = (h: string): RGB => { const c = new THREE.Color(h); return [c.r, c.g, c.b] }
const mixc = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
const DEG = Math.PI / 180

/** 管口下沿到天花板底面的距离（管段露出天花板的高度） */
export const ARMS_VENT_DROP = 0.45
/** 方形管段外边长 */
export const ARMS_VENT_SIZE = 0.6
/** 臂根（s0）在管口之上的高度（藏在漆黑的管内） */
export const ARMS_ROOT_IN = 0.35
/** 每条臂的臂骨节数（不含 hand） */
export const ARMS_SEGMENTS = 8
/** 第 2 阶段：每条臂的臂骨链总节数（8 根主骨 s0..s7 + 8 根中间骨 m0..m7 交替，不含 hand） */
export const ARMS_CHAIN = 16
/** 每条臂的骨骼数：16 节臂骨 + hand + 3×3 爪骨 */
export const ARMS_BONES_PER_ARM = ARMS_CHAIN + 1 + 9
const SEG = ARMS_SEGMENTS
const CH = ARMS_CHAIN
const COLS = 10 // 臂截面分段（第 1 阶段 9 → 10）
const ARM_RINGS = 56 // 臂管体环数（s0→腕；每节中间骨之间 3.5 环）
const SHEATH_COLS = 8 // 爪根皮褶截面分段
const PALM_RINGS = 9
const CLAW_COLS = 6
const CLAW_RPS = 4 // 每节爪的环数
const CLAW_LEN: [number, number, number] = [0.155, 0.135, 0.115] // 每根爪三节长度（合计 ≈0.4m）

// ============================================================================
// 几何累加器
// ============================================================================
interface Part { pos: number[]; nor: number[]; uv: number[]; col: number[]; si: number[]; sw: number[]; arm: number[]; idx: number[]; thin?: number[] }
const newPart = (): Part => ({ pos: [], nor: [], uv: [], col: [], si: [], sw: [], arm: [], idx: [] })
type Wt = [number, number, number, number] // [骨a, 骨b, 权a, 权b]

/** morphs = 臂数：每条臂一个「变细」morph 目标（相对位移 = 指向截面中心 × 遮罩），只有本臂管体顶点非零 */
function partGeo(p: Part, skinned = true, morphs = 0): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(p.col, 3))
  if (skinned) {
    const si: number[] = [], sw: number[] = []
    for (let i = 0; i < p.si.length; i += 2) { si.push(p.si[i], p.si[i + 1], 0, 0); sw.push(p.sw[i], p.sw[i + 1], 0, 0) }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4))
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
    g.setAttribute('armId', new THREE.Float32BufferAttribute(p.arm, 1))
  }
  if (morphs > 0) {
    const n = p.pos.length, mine = p.arm[0] ?? 0
    g.morphAttributes.position = Array.from({ length: morphs }, (_, m) => new THREE.Float32BufferAttribute(m === mine && p.thin ? p.thin : new Float32Array(n), 3))
    g.morphTargetsRelative = true
  }
  g.setIndex(p.idx)
  return g
}

/**
 * 扫掠管体：path 每个点一环，frames 为每环的 [S, U]（截面平面内两正交轴），
 * sec(i, a) → [S 向半径, U 向半径]（a∈[0,2π)），每环 cols+1 个顶点（接缝复制）。法线几何计算后校正朝外并平均接缝。
 */
function sweep(path: V3[], frames: [V3, V3][], cols: number, sec: (i: number, a: number) => [number, number],
  o: { uv: (i: number, j: number) => [number, number]; col: (i: number, j: number) => RGB; w: (i: number) => Wt; arm: number }): Part {
  const p = newPart(), n = path.length - 1
  for (let i = 0; i <= n; i++) {
    const [S, U] = frames[i]
    const w = o.w(i)
    for (let j = 0; j <= cols; j++) {
      const a = ((j % cols) / cols) * Math.PI * 2
      const [rs, ru] = sec(i, a)
      const q = path[i].clone().addScaledVector(S, Math.cos(a) * rs).addScaledVector(U, Math.sin(a) * ru)
      p.pos.push(q.x, q.y, q.z)
      const [uu, vv] = o.uv(i, j); p.uv.push(uu, vv)
      const c = o.col(i, j); p.col.push(c[0], c[1], c[2])
      p.si.push(w[0], w[1]); p.sw.push(w[2], w[3]); p.arm.push(o.arm)
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < cols; j++) {
    const a = i * (cols + 1) + j, b = a + cols + 1
    p.idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3)); g.setIndex(p.idx); g.computeVertexNormals()
  const nr = g.attributes.normal as THREE.BufferAttribute
  let dot = 0; const tmp = V(0, 0, 0)
  for (let i = 0; i <= n; i++) for (let j = 0; j <= cols; j++) {
    const k = i * (cols + 1) + j
    tmp.set(p.pos[k * 3], p.pos[k * 3 + 1], p.pos[k * 3 + 2]).sub(path[i])
    dot += tmp.x * nr.getX(k) + tmp.y * nr.getY(k) + tmp.z * nr.getZ(k)
  }
  if (dot < 0) {
    for (let k = 0; k < p.idx.length; k += 3) { const t = p.idx[k + 1]; p.idx[k + 1] = p.idx[k + 2]; p.idx[k + 2] = t }
    for (let k = 0; k < nr.count; k++) nr.setXYZ(k, -nr.getX(k), -nr.getY(k), -nr.getZ(k))
  }
  for (let i = 0; i <= n; i++) {
    const a = i * (cols + 1), b = a + cols
    let r = 0; for (let j = 0; j < cols; j++) r = Math.max(r, tmp.set(p.pos[(a + j) * 3], p.pos[(a + j) * 3 + 1], p.pos[(a + j) * 3 + 2]).distanceTo(path[i]))
    if (r < 1e-4) { // 极点（封口）：法线沿切线
      const d = (i === 0 ? path[0].clone().sub(path[1]) : path[n].clone().sub(path[n - 1])).normalize()
      for (let j = 0; j <= cols; j++) nr.setXYZ(a + j, d.x, d.y, d.z)
      continue
    }
    tmp.set(nr.getX(a) + nr.getX(b), nr.getY(a) + nr.getY(b), nr.getZ(a) + nr.getZ(b)).normalize()
    nr.setXYZ(a, tmp.x, tmp.y, tmp.z); nr.setXYZ(b, tmp.x, tmp.y, tmp.z)
  }
  p.nor = Array.from(nr.array as Float32Array)
  return p
}

/** 沿折线的平行移动标架；alignAt/alignTo：在第 alignAt 环把 S 轴转到 alignTo（其余环按 roll(i) 比例渐变），避免截面扭转 */
function transportFrames(path: V3[], up: V3, roll?: (i: number, phi: number) => number, alignAt = -1, alignTo?: V3): [V3, V3][] {
  const n = path.length - 1
  const T: V3[] = []
  for (let i = 0; i <= n; i++) T.push(path[Math.min(n, i + 1)].clone().sub(path[Math.max(0, i - 1)]).normalize())
  let u = up.clone().sub(T[0].clone().multiplyScalar(up.dot(T[0])))
  if (u.lengthSq() < 1e-8) u = V(1, 0, 0).sub(T[0].clone().multiplyScalar(T[0].x))
  u.normalize()
  const out: [V3, V3][] = []
  for (let i = 0; i <= n; i++) {
    if (i > 0) { const ax = V(0, 0, 0).crossVectors(T[i - 1], T[i]); const s = ax.length(); if (s > 1e-6) u.applyAxisAngle(ax.normalize(), Math.atan2(s, T[i - 1].dot(T[i]))) }
    u.sub(T[i].clone().multiplyScalar(u.dot(T[i]))).normalize()
    const S = V(0, 0, 0).crossVectors(u, T[i]).normalize()
    out.push([S, u.clone()])
  }
  if (alignAt >= 0 && alignTo && roll) {
    const [S0, U0] = out[alignAt], tgt = alignTo.clone().sub(T[alignAt].clone().multiplyScalar(alignTo.dot(T[alignAt]))).normalize()
    const phi = Math.atan2(tgt.dot(U0), tgt.dot(S0))
    for (let i = 0; i <= n; i++) { const r = roll(i, phi); out[i][0].applyAxisAngle(T[i], r); out[i][1].applyAxisAngle(T[i], r) }
  }
  return out
}

// ============================================================================
// 程序贴图（模块级共享）
// ============================================================================
/** 皮肤图集 256×1024：U = 截面一周；V = 臂根(0，管内) → 腕(ARM_V) → 掌末(1)。canvas 的 y = (1-V)·H */
const ARM_V = 0.84
/** 臂段贴图的平铺周期与交叉淡化带宽（V 单位）：V∈[0,ARM_TILE) 一个周期 */
const ARM_BLEND = 0.08
const ARM_TILE = ARM_V - ARM_BLEND
const TEX_W = 256, TEX_H = 1024
function sharedArmsTexture<T extends THREE.Texture>(texture: T): T {
  texture.userData.entityShared = true
  return texture
}

let SKIN_TEX: THREE.CanvasTexture | null | undefined
let BURN_TEX: THREE.CanvasTexture | null | undefined
function skinTexture(): THREE.CanvasTexture | null {
  if (SKIN_TEX !== undefined) return SKIN_TEX
  if (typeof document === 'undefined') return (SKIN_TEX = null)
  const cv = document.createElement('canvas'); cv.width = TEX_W; cv.height = TEX_H
  const g = cv.getContext('2d')
  if (!g) return (SKIN_TEX = null)
  const R = mulberry(0xa2b5)
  const Y = (v: number) => (1 - v) * TEX_H
  // 1) 底色：灰白腐皮 + 逐像素颗粒 + 低频斑驳
  const img = g.createImageData(TEX_W, TEX_H)
  const base = hex('#8e8c85')
  const lowA = Array.from({ length: 8 }, () => [R() * 6.28, 1 + R() * 3, 2 + R() * 9, R() * 6.28])
  for (let y = 0; y < TEX_H; y++) for (let x = 0; x < TEX_W; x++) {
    const u = x / TEX_W, v = y / TEX_H
    let low = 0; for (const [p, fu, fv, q] of lowA) low += Math.sin(u * 6.283 * Math.round(fu) + p) * Math.sin(v * 6.283 * fv + q)
    const nz = (R() - 0.5) * 0.07 + low * 0.018
    const k = (y * TEX_W + x) * 4
    img.data[k] = (base[0] + nz) * 255; img.data[k + 1] = (base[1] + nz * 0.97) * 255; img.data[k + 2] = (base[2] + nz * 0.9) * 255; img.data[k + 3] = 255
  }
  g.putImageData(img, 0, 0)
  const wrap = (x: number, fn: (dx: number) => void) => { for (const d of [-TEX_W, 0, TEX_W]) if (x + d > -60 && x + d < TEX_W + 60) fn(d) }
  const blob = (x: number, y: number, rx: number, ry: number, c: string, a: number) => wrap(x, (d) => {
    const gr = g.createRadialGradient(x + d, y, 0, x + d, y, Math.max(rx, ry))
    gr.addColorStop(0, c.replace('A', String(a))); gr.addColorStop(1, c.replace('A', '0'))
    g.fillStyle = gr; g.save(); g.translate(x + d, y); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); g.translate(-(x + d), -y)
    g.beginPath(); g.arc(x + d, y, Math.max(rx, ry), 0, 6.283); g.fill(); g.restore()
  })
  // 2) 腐败暗斑：青灰 / 紫褐淤斑 / 黄褐坏死
  for (let i = 0; i < 70; i++) blob(R() * TEX_W, R() * TEX_H, 8 + R() * 30, 14 + R() * 60, ['rgba(62,66,64,A)', 'rgba(74,56,62,A)', 'rgba(128,116,80,A)', 'rgba(48,44,40,A)'][i % 4], 0.22 + R() * 0.3)
  // 3) 拉伸纹（沿臂长方向的细长波纹，成簇；浅色条带 + 暗边）
  for (let c = 0; c < 26; c++) {
    const cx = R() * TEX_W, cy = R() * TEX_H * ARM_V, n = 4 + Math.floor(R() * 7), len = 40 + R() * 150
    for (let k = 0; k < n; k++) {
      const x0 = cx + (k - n / 2) * (4 + R() * 3), y0 = cy + (R() - 0.5) * 30, l = len * (0.6 + R() * 0.5), wv = (R() - 0.5) * 6
      wrap(x0, (d) => {
        for (const [col, lw, off] of [['rgba(40,36,32,0.28)', 2.6, 0.9], ['rgba(222,218,206,0.42)', 1.4, 0]] as [string, number, number][]) {
          g.strokeStyle = col; g.lineWidth = lw; g.beginPath()
          for (let t = 0; t <= 1.0001; t += 0.1) { const xx = x0 + d + off + Math.sin(t * 3.1 + k) * wv * Math.sin(t * Math.PI), yy = y0 - l / 2 + t * l; if (t === 0) g.moveTo(xx, yy); else g.lineTo(xx, yy) }
          g.stroke()
        }
      })
    }
  }
  // 4) 关节褶皱（横向细纹，落在每个臂骨关节的 V 上）
  for (let k = 1; k <= SEG; k++) {
    const yc = Y((k / SEG) * ARM_V)
    for (let q = 0; q < 16; q++) {
      const y0 = yc + (R() - 0.5) * 26, x0 = R() * TEX_W, l = 20 + R() * 70
      wrap(x0, (d) => { g.strokeStyle = `rgba(36,32,28,${0.2 + R() * 0.3})`; g.lineWidth = 0.8 + R(); g.beginPath(); g.moveTo(x0 + d, y0); g.quadraticCurveTo(x0 + d + l / 2, y0 + (R() - 0.5) * 6, x0 + d + l, y0 + (R() - 0.5) * 4); g.stroke() })
    }
  }
  // 5) 细小暗点 / 毛孔
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(30,26,24,${0.15 + R() * 0.4})`; const r = 0.5 + R() * 1.6; g.beginPath(); g.arc(R() * TEX_W, R() * TEX_H, r, 0, 6.283); g.fill() }
  // 6) 青黑色静脉（细分叉线）
  for (let i = 0; i < 14; i++) {
    let x = R() * TEX_W, y = R() * TEX_H * ARM_V; g.strokeStyle = 'rgba(52,58,66,0.35)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y)
    for (let s = 0; s < 12; s++) { x += (R() - 0.5) * 10; y += 8 + R() * 10; g.lineTo(x, y) }
    g.stroke()
  }
  // 7) 皮肤撕裂：沿臂长的裂口（暗红褐内里 + 粉褐边 + 翻起的浅色皮缘）
  for (let i = 0; i < 9; i++) {
    const x = R() * TEX_W, y = Y(0.3 + R() * 0.62), l = 18 + R() * 42, w = 3 + R() * 5
    wrap(x, (d) => {
      const path = (sc: number) => { g.beginPath(); g.moveTo(x + d, y - l / 2); g.bezierCurveTo(x + d + w * sc, y - l / 4, x + d + w * sc * 0.6, y + l / 4, x + d + R() * 2, y + l / 2); g.bezierCurveTo(x + d - w * sc * 0.7, y + l / 5, x + d - w * sc, y - l / 5, x + d, y - l / 2); g.closePath() }
      path(1.9); g.fillStyle = 'rgba(214,206,190,0.55)'; g.fill()
      path(1.35); g.fillStyle = 'rgba(122,78,70,0.95)'; g.fill()
      path(0.8); g.fillStyle = 'rgba(60,22,20,1)'; g.fill()
      path(0.35); g.fillStyle = 'rgba(28,10,10,1)'; g.fill()
    })
  }
  // 8) 第 2 阶段：管口段发黑改由 shader（vArmsY）完成，贴图不再画黑带；
  //    并把臂段 V∈[0, ARM_V] 做成以 ARM_TILE 为周期可无缝平铺（V<ARM_BLEND 的一段与 V+ARM_TILE 处交叉淡化），
  //    这样伸长时 shader 可以按长度重新平铺，而不是把腐皮拉长（见 skinMaterial 里的 armsTileUv）。
  {
    const y0 = Math.round(Y(ARM_BLEND)), y1 = Math.round(Y(0)), dy = Math.round(ARM_TILE * TEX_H)
    const band = g.getImageData(0, y0 - dy, TEX_W, y1 - y0 + dy) // 覆盖 V∈[0, ARM_BLEND+ARM_TILE]
    const bw = TEX_W * 4
    for (let y = y0; y < y1; y++) {
      const v = (1 - y / TEX_H) // 当前行的 V
      const w = smooth(0, 1, v / ARM_BLEND) // V=0 → 全取 V+ARM_TILE 处；V=ARM_BLEND → 全取原图
      const rowSelf = (y - (y0 - dy)) * bw, rowSrc = (y - dy - (y0 - dy)) * bw
      for (let x = 0; x < bw; x++) band.data[rowSelf + x] = band.data[rowSrc + x] * (1 - w) + band.data[rowSelf + x] * w
    }
    g.putImageData(band, 0, y0 - dy)
  }
  // 9) 手掌段（V ARM_V..1）：略暗，指骨方向的浅色骨脊 + 掌末更黑（与角质爪衔接）
  {
    const y0 = Y(1), y1 = Y(ARM_V)
    g.fillStyle = 'rgba(40,36,32,0.25)'; g.fillRect(0, y0, TEX_W, y1 - y0)
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(200,196,186,0.35)'; g.fillRect(TEX_W * (0.05 + i * 0.165), y0, 5, y1 - y0) }
    const gr = g.createLinearGradient(0, Y(0.96), 0, Y(1)); gr.addColorStop(0, 'rgba(28,24,20,0)'); gr.addColorStop(1, 'rgba(28,24,20,0.85)')
    g.fillStyle = gr; g.fillRect(0, Y(1), TEX_W, Y(0.96) - Y(1))
  }
  const tex = sharedArmsTexture(new THREE.CanvasTexture(cv))
  tex.wrapS = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
  return (SKIN_TEX = tex)
}

/** 烧焦遮罩 128×512（线性灰度，同一 UV）：值越大越先烧焦；shader 用阈值 1-burn 切出焦黑区和红热边 */
function burnTexture(): THREE.CanvasTexture | null {
  if (BURN_TEX !== undefined) return BURN_TEX
  if (typeof document === 'undefined') return (BURN_TEX = null)
  const W = 128, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const g = cv.getContext('2d')
  if (!g) return (BURN_TEX = null)
  const R = mulberry(0xb042)
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H)
  g.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 260; i++) {
    const x = R() * W, y = R() * H, r = 6 + R() * 26, a = 0.05 + R() * 0.12
    for (const d of [-W, 0, W]) { const gr = g.createRadialGradient(x + d, y, 0, x + d, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x + d - r, y - r, 2 * r, 2 * r) }
  }
  g.globalCompositeOperation = 'source-over'
  // 细碎噪点让烧焦边缘呈锯齿状
  const img = g.getImageData(0, 0, W, H)
  let mx = 0; for (let k = 0; k < img.data.length; k += 4) mx = Math.max(mx, img.data[k])
  for (let k = 0; k < img.data.length; k += 4) { const v = Math.min(255, (img.data[k] / Math.max(1, mx)) * 235 + (R() - 0.5) * 34 + 10); img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.max(0, v) }
  g.putImageData(img, 0, 0)
  const tex = sharedArmsTexture(new THREE.CanvasTexture(cv))
  tex.wrapS = THREE.RepeatWrapping; tex.colorSpace = THREE.NoColorSpace
  return (BURN_TEX = tex)
}

/** 风管镀锌铁皮 256²：锌花 + 锈迹流痕 + 划痕 + 下缘污垢 */
let METAL_TEX: THREE.CanvasTexture | null | undefined
function metalTexture(): THREE.CanvasTexture | null {
  if (METAL_TEX !== undefined) return METAL_TEX
  if (typeof document === 'undefined') return (METAL_TEX = null)
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S
  const g = cv.getContext('2d')
  if (!g) return (METAL_TEX = null)
  const R = mulberry(0x3e7a)
  g.fillStyle = '#6e706c'; g.fillRect(0, 0, S, S)
  for (let i = 0; i < 380; i++) { // 锌花
    const v = 92 + R() * 40; g.fillStyle = `rgba(${v},${v + 2},${v},0.35)`
    g.beginPath(); const x = R() * S, y = R() * S, r = 4 + R() * 12; g.moveTo(x, y)
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283 + R(); g.lineTo(x + Math.cos(a) * r * (0.5 + R()), y + Math.sin(a) * r * (0.5 + R())) }
    g.fill()
  }
  for (let i = 0; i < 30; i++) { // 锈迹流痕（自上而下）
    const x = R() * S, l = 30 + R() * 160, w = 1 + R() * 5
    const gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, `rgba(110,62,30,${0.25 + R() * 0.4})`); gr.addColorStop(1, 'rgba(110,62,30,0)')
    g.fillStyle = gr; g.fillRect(x, R() * 40, w, l)
  }
  for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(200,200,196,${0.15 + R() * 0.25})`; g.lineWidth = 0.6; g.beginPath(); const x = R() * S, y = R() * S; g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 50, y + (R() - 0.5) * 12); g.stroke() }
  const gr = g.createLinearGradient(0, S * 0.6, 0, S); gr.addColorStop(0, 'rgba(30,28,24,0)'); gr.addColorStop(1, 'rgba(30,28,24,0.55)'); g.fillStyle = gr; g.fillRect(0, 0, S, S)
  const tex = sharedArmsTexture(new THREE.CanvasTexture(cv))
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
  return (METAL_TEX = tex)
}

// ============================================================================
// 材质
// ============================================================================
/** 皮肤材质（每次 buildArmsMesh 新建一个，以便每组手臂各自的烧焦 uniform；着色器程序按 cache key 共享） */
function skinMaterial(burn: { value: THREE.Vector3 }, stretch: { value: THREE.Vector3 }): THREE.Material {
  const map = skinTexture(), burnMap = burnTexture()
  const real = getMaterialMode() === 'realistic'
  const mat = litMaterial({
    color: '#ffffff', vertexColors: true,
    ...(map ? { map } : {}),
    ...(map && real ? { bumpMap: map, bumpScale: 3.2 } : {}),
    roughness: 0.48, metalness: 0, envBase: 0.22, // 真实材质：湿黏的腐皮，带一层暗淡油光 + 凹凸
  } as THREE.MeshLambertMaterialParameters)
  if (!burnMap) return mat
  const prior = mat.onBeforeCompile, key = mat.customProgramCacheKey()
  mat.onBeforeCompile = (shader, renderer) => {
    prior.call(mat, shader, renderer)
    shader.uniforms.uArmsBurn = burn
    shader.uniforms.uArmsStretch = stretch
    shader.uniforms.uArmsBurnMap = { value: burnMap }
    // vArmsY：蒙皮后的高度（网格原点 = 管口），用于「靠近管口一段发黑」——随伸长始终跟着管口走，而不是跟着贴图 V 被拉长
    shader.vertexShader = 'attribute float armId;\nvarying float vArmId;\nvarying float vArmsY;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvArmId = armId;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\nvArmsY = transformed.y;')
    shader.fragmentShader = 'uniform vec3 uArmsBurn;\nuniform vec3 uArmsStretch;\nuniform sampler2D uArmsBurnMap;\nvarying float vArmId;\nvarying float vArmsY;\n' + shader.fragmentShader
      .replace('#include <map_fragment>', `
#ifdef USE_MAP
  // 伸长时按长度重新平铺臂段贴图（以腕为锚点向臂根方向平铺，周期 ARM_TILE），腐皮纹理不被拉长；
  // 用未取模的坐标求导数，取模接缝处不会出现 mip 跳变的细线
  float armsK = vArmId < 0.5 ? uArmsStretch.x : (vArmId < 1.5 ? uArmsStretch.y : uArmsStretch.z);
  vec2 armsUvRaw = vMapUv, armsUv = vMapUv;
  if (vMapUv.y < ${ARM_V.toFixed(4)}) {
    float armsU = ${ARM_V.toFixed(4)} - (${ARM_V.toFixed(4)} - vMapUv.y) * armsK;
    armsUvRaw.y = armsU;
    armsUv.y = armsU >= 0.0 ? armsU : mod(armsU, ${ARM_TILE.toFixed(4)});
  }
  vec4 sampledDiffuseColor = textureGrad(map, armsUv, dFdx(armsUvRaw), dFdy(armsUvRaw));
  diffuseColor *= sampledDiffuseColor;
#endif
  float armsB = vArmId < 0.5 ? uArmsBurn.x : (vArmId < 1.5 ? uArmsBurn.y : uArmsBurn.z);
  float armsM = texture2D(uArmsBurnMap, vMapUv).r;
  float armsTh = 1.0 - armsB * 1.08;
  float armsChar = armsB > 0.001 ? smoothstep(armsTh, armsTh + 0.05, armsM) : 0.0;
  float armsEdge = armsB > 0.001 ? clamp(smoothstep(armsTh - 0.045, armsTh + 0.01, armsM) - armsChar, 0.0, 1.0) : 0.0;
  diffuseColor.rgb *= mix(1.0, 0.16, smoothstep(-0.42, 0.04, vArmsY)); // 管口段发黑（管内几乎全黑）
  diffuseColor.rgb *= mix(1.0, 0.78, smoothstep(-0.85, -0.35, vArmsY)); // 再往下一段轻微熏黑（取代第 1 阶段贴图里的黑带与污痕）
  diffuseColor.rgb *= mix(1.0, 0.55, armsB);                       // 整体熏黑
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.016, 0.012, 0.01), armsChar); // 焦黑斑
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.04, 0.02), armsEdge * 0.8);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += vec3(0.9, 0.16, 0.025) * armsEdge * armsEdge * (0.25 + 0.45 * armsB);`)
  }
  mat.customProgramCacheKey = () => key + '|arms-burn-v2'
  return mat
}
function clawMaterial(): THREE.Material {
  const mat = litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.32, metalness: 0.05, envBase: 0.35 } as THREE.MeshLambertMaterialParameters)
  return mat
}
function metalMaterial(): THREE.Material {
  const map = metalTexture()
  const mat = litMaterial({ color: '#ffffff', vertexColors: true, ...(map ? { map } : {}), roughness: 0.5, metalness: 0.35, envBase: 0.3 } as THREE.MeshLambertMaterialParameters)
  return mat
}

// ============================================================================
// 手臂
// ============================================================================
/** 一条臂的建造数据（静止姿态，模型空间 = 管口原点） */
interface ArmPlan {
  joints: V3[] // 16 节臂骨（s0,m0,s1,m1…s7,m7）+ wrist(hand)，共 CH+1 个
  curve: THREE.CatmullRomCurve3 // 臂中心线（s0 → 腕），静止标架用
  o: V3; h: V3 // 管内位置（相对管口中心）与外展方向
  path: V3[] // 臂管体中心线（含掌）
  palmEnd: V3; dp: V3; sp: V3; q: V3
  claws: { base: V3; joints: V3[]; tip: V3; axis: V3; path: V3[] }[]
  reach0: number // 管口 → 最远爪尖的沿体长度
}

export interface ArmsArm {
  index: number
  /** 8 根主臂骨 s0..s7（第 1 阶段接口，旋转它们仍可直接弯曲） */
  segs: THREE.Bone[]
  /** 第 2 阶段：完整臂骨链 16 节（s0,m0,s1,m1,…,s7,m7；m 为每段中点的中间骨，分摊弯曲、避免急弯塌腰） */
  chain: THREE.Bone[]
  /** 中间骨 m0..m7 */
  mids: THREE.Bone[]
  hand: THREE.Bone
  claws: [THREE.Bone, THREE.Bone, THREE.Bone][]
  /** 每根爪的铰链轴（模型空间 = 静止时所有骨骼局部空间）；绕它正向旋转 = 收拢 */
  clawAxis: V3[]
  /** 静止时 chain[1..15] 与 hand 相对父骨的平移（伸长时按系数缩放），共 16 个 */
  restOffsets: V3[]
  /** 静止时 管口→爪尖 沿体长度（m） */
  reach0: number
  /** 管内长度（s0→管口，伸长时近似不变）与 臂管长度（s0→腕）、手长（腕→爪尖） */
  inDuct: number; tubeLen: number; handLen: number
  /** 动画用静止数据（模型空间，原点 = 管口中心） */
  rest: ArmsArmRest
}
export interface ArmsArmRest {
  /** chain 0..15 + hand（腕）的静止位置，共 17 个 */
  joints: V3[]
  /** 与 joints 对应的静止平行移动标架（四元数，基 = [法向 N, 切向 T, N×T]），由管口处 (T=-Y, N=+Z) 沿中心线平行移动得到 */
  frames: THREE.Quaternion[]
  /** 管内位置（相对管口中心，水平）与外展方向 */
  duct: V3; out: V3
  /** 掌的伸出方向、掌宽方向、钩弯方向（静止，模型空间） */
  palmDir: V3; palmSide: V3; hook: V3
  /** 「抓握点」：三爪合抱的中心（静止，模型空间）；第 3 阶段挂载玩家用 */
  grip: V3
  /** 每根爪三个关节 + 爪尖的静止位置 */
  claws: { joints: V3[]; tip: V3 }[]
}
export interface ArmsRig {
  count: number
  mesh: THREE.SkinnedMesh
  root: THREE.Bone
  arms: ArmsArm[]
  /** 伸长系数 k（1 = 自然下垂约 2.2m）：chain[1..15]、hand 的局部平移 × k；同时调用 setStretchLook(a, k) */
  setStretch(a: number, k: number): void
  /** 按「管口→爪尖」目标长度（m）反算伸长系数，返回所用 k */
  setReach(a: number, meters: number): number
  /** 只改伸长的「外观」：截面按体积守恒变细（半径 × max(ARMS_THIN_MIN, 1/√k)）+ 贴图按长度重新平铺；不动骨骼 */
  setStretchLook(a: number, k: number): void
  /** 爪收拢：c=0 静止弯钩，1 = 完全收拢扣住，-1 = 完全张开 */
  setClawCurl(a: number, c: number): void
  /** 烧焦 0..1（每条臂独立；焦黑斑 + 红热边） */
  setBurn(a: number, b: number): void
}
/** 伸长变细的半径下限系数 */
export const ARMS_THIN_MIN = 0.6
/** 爪收拢/张开时三节各自的最大角度（rad）：c>0 用 CURL，c<0 用 SPREAD */
export const ARMS_CLAW_CURL = [22 * DEG, 30 * DEG, 34 * DEG]
export const ARMS_CLAW_SPREAD = [16 * DEG, 24 * DEG, 28 * DEG]
/** 由法向 N 与切向 T 求标架四元数（基 = [N, T, N×T]） */
export function armsFrameQuat(N: V3, T: V3, out = new THREE.Quaternion()): THREE.Quaternion {
  const B = _fb.crossVectors(N, T)
  _fm.makeBasis(N, T, B)
  return out.setFromRotationMatrix(_fm)
}
const _fb = new THREE.Vector3(), _fm = new THREE.Matrix4()
/** 平行移动一步：把 N 从切向 t0 转到 t1（最小旋转），并重新正交化 */
export function armsTransport(N: V3, t0: V3, t1: V3) {
  const ax = _fb.crossVectors(t0, t1), sn = ax.length()
  if (sn > 1e-7) N.applyAxisAngle(ax.multiplyScalar(1 / sn), Math.atan2(sn, t0.dot(t1)))
  N.addScaledVector(t1, -N.dot(t1)).normalize()
  return N
}

function planArm(index: number, count: number, R: () => number): ArmPlan {
  // 管内位置：三条臂挤在 0.6m 方管里，按 120° 均布
  const phi = (count === 1 ? R() * 6.283 : (index / count) * 6.283 + (R() - 0.5) * 0.5) + 0.6
  const h = V(Math.cos(phi), 0, Math.sin(phi)) // 外展方向（水平）
  const side = V(-h.z, 0, h.x)
  const r0 = count === 1 ? 0.02 : 0.13
  const o = h.clone().multiplyScalar(r0)
  const L = 0.87 + R() * 0.08 // 长度变化 ±4%（管口→爪尖沿体长 ≈2.2m）
  const sway = (R() - 0.5) * 0.14, bow = 0.12 + R() * 0.1
  // 控制点：管内竖直 → 出管口 → 上臂外弓 → 「肘」处扭折 → 前臂向内回收 → 腕
  const kink = () => (R() - 0.5) * 0.09
  const cp = [
    o.clone().add(V(0, ARMS_ROOT_IN, 0)),
    o.clone().add(V(0, 0.12, 0)),
    o.clone().addScaledVector(h, 0.03).addScaledVector(side, kink() * 0.4).add(V(0, -0.2 * L, 0)),
    o.clone().addScaledVector(h, bow * 0.55).addScaledVector(side, sway + kink()).add(V(0, -0.45 * L, 0)),
    o.clone().addScaledVector(h, bow * 0.95 + kink()).addScaledVector(side, sway * 0.6).add(V(0, -0.68 * L, 0)),
    o.clone().addScaledVector(h, bow * 1.2).addScaledVector(side, sway * 0.2 + kink()).add(V(0, -0.9 * L, 0)),
    o.clone().addScaledVector(h, bow * 0.85 + kink()).addScaledVector(side, -sway * 0.5).add(V(0, -1.12 * L, 0)),
    o.clone().addScaledVector(h, bow * 0.7).addScaledVector(side, -sway * 0.4 + kink()).add(V(0, -1.3 * L, 0)),
    o.clone().addScaledVector(h, bow * 0.95 + 0.05).addScaledVector(side, -sway * 0.2).add(V(0, -1.42 * L, 0)),
  ]
  const curve = new THREE.CatmullRomCurve3(cp, false, 'centripetal')
  const pts: V3[] = []
  for (let i = 0; i <= ARM_RINGS; i++) pts.push(curve.getPointAt(i / ARM_RINGS))
  const joints: V3[] = []
  for (let k = 0; k <= CH; k++) joints.push(curve.getPointAt(k / CH))
  const wrist = joints[CH]
  const d = curve.getTangentAt(1).normalize()
  // 手掌：自腕部斜向外下伸出（附图里手腕外折、长爪向外张开再向下钩）
  const dp = d.clone().multiplyScalar(0.8).addScaledVector(h, 0.55).add(V(0, -0.1, 0)).normalize()
  const sp = V(0, 0, 0).crossVectors(h, V(0, 1, 0)).normalize()
  sp.sub(dp.clone().multiplyScalar(sp.dot(dp))).normalize()
  const q = V(0, -1, 0).sub(dp.clone().multiplyScalar(-dp.y)).normalize() // 钩弯方向：dp 的垂直下方分量
  const palmLen = 0.3
  const palmEnd = wrist.clone().addScaledVector(dp, palmLen)
  const palmCurve = new THREE.QuadraticBezierCurve3(wrist, wrist.clone().addScaledVector(d, palmLen * 0.45), palmEnd)
  const path = pts.slice()
  for (let i = 1; i <= PALM_RINGS; i++) path.push(palmCurve.getPointAt(i / PALM_RINGS))
  path.push(palmEnd.clone().addScaledVector(dp, 0.022), palmEnd.clone().addScaledVector(dp, 0.034)) // 圆头 + 封口环
  // 三根爪：两侧外张、中间最长；每根先沿掌向外伸，然后逐节向 q 弯钩
  const claws: ArmPlan['claws'] = []
  for (let j = 0; j < 3; j++) {
    const s = j - 1
    const sc = s === 0 ? 1.08 : 0.92 + R() * 0.06
    const base = palmEnd.clone().addScaledVector(sp, s * 0.05).addScaledVector(dp, -0.015).addScaledVector(q, -0.006)
    const dir0 = dp.clone().addScaledVector(sp, s * 0.34).addScaledVector(q, -0.3).normalize()
    const axis = V(0, 0, 0).crossVectors(dir0, q).normalize()
    const bend = [10, 38, 64].map((a) => (a + (R() - 0.5) * 10) * DEG)
    const joints2: V3[] = [base.clone()]
    let p = base.clone()
    const path2: V3[] = [base.clone().addScaledVector(dir0, -0.03)]
    for (let k = 0; k < 3; k++) {
      const len = CLAW_LEN[k] * sc
      for (let r = 1; r <= CLAW_RPS; r++) {
        // 每节内部再沿弧线细分（节内也微微弯曲）
        const dd = dir0.clone().applyAxisAngle(axis, bend.slice(0, k).reduce((x, y) => x + y, 0) + bend[k] * (r / CLAW_RPS))
        p = p.clone().addScaledVector(dd, len / CLAW_RPS)
        path2.push(p.clone())
      }
      if (k < 2) joints2.push(p.clone())
    }
    claws.push({ base, joints: joints2, tip: p.clone(), axis, path: path2 })
  }
  // 管口 → 最远爪尖 沿体长度
  let below = 0
  for (let i = 1; i < pts.length; i++) if (pts[i].y < 0) below += pts[i].distanceTo(pts[i - 1])
  const reach0 = below + palmLen + Math.max(...claws.map((c) => c.path.reduce((s, v, i, a) => (i ? s + v.distanceTo(a[i - 1]) : 0), 0)))
  return { joints, curve, o, h, path, palmEnd, dp, sp, q, claws, reach0 }
}

/** 截面半径剖面：s∈[0,1] 沿臂（0=管内根部，1=腕）；未含骨节/筋索调制 */
export function armsTubeRadius(s: number): number { return armRadius(s) }
function armRadius(s: number): number {
  const K: [number, number][] = [[0, 0.07], [0.18, 0.068], [0.4, 0.06], [0.52, 0.064], [0.6, 0.053], [0.8, 0.044], [0.94, 0.032], [1, 0.03]]
  for (let i = 1; i < K.length; i++) if (s <= K[i][0]) { const t = (s - K[i - 1][0]) / (K[i][0] - K[i - 1][0]); return lerp(K[i - 1][1], K[i][1], t * t * (3 - 2 * t)) }
  return K[K.length - 1][1]
}

interface BuildResult { geo: THREE.BufferGeometry; plans: ArmPlan[]; tris: number }
function* buildGeometryJob(count: number, seed: number): Generator<void, BuildResult, unknown> {
  const R = mulberry(0xa53 + seed * 7919)
  const skinParts: THREE.BufferGeometry[] = [], clawParts: THREE.BufferGeometry[] = []
  const plans: ArmPlan[] = []
  const boneIdx = (a: number, local: number) => 1 + a * ARMS_BONES_PER_ARM + local // local: 0..15 臂骨链, 16 hand, 17+3j+k 爪
  const HAND = CH, CLAW0 = CH + 1
  const cSkin = hex('#ffffff'), cDark: RGB = [0.16, 0.15, 0.14]
  const clawSkin = hex('#403d39'), clawHorn = hex('#3b3129'), clawTip = hex('#060504')
  try {
  for (let a = 0; a < count; a++) {
    yield
    const P = planArm(a, count, R); plans.push(P)
    const nArm = ARM_RINGS, nAll = P.path.length - 1
    // 每环的弧长参数
    const arc: number[] = [0]; for (let i = 1; i <= nAll; i++) arc.push(arc[i - 1] + P.path[i].distanceTo(P.path[i - 1]))
    const Larm = arc[nArm], Lseg = Larm / SEG, Lch = Larm / CH
    // 截面方向：腕部把 S 轴对齐到掌宽方向 sp，沿臂逐渐过渡（贴图接缝也随之慢慢绕转，正好像扭曲）
    const frames = transportFrames(P.path, V(0, 0, 1), (i, phi) => phi * Math.min(1, arc[i] / Larm), nArm, P.sp)
    // 关节骨节凸起：每个关节随机偏向一侧
    const knob = Array.from({ length: SEG + 1 }, () => ({ amp: 0.008 + R() * 0.01, dir: R() * 6.283 }))
    const twist = (0.8 + R() * 0.8) * (R() < 0.5 ? -1 : 1), cordPh = R() * 6.283
    const lumps = Array.from({ length: 10 }, () => ({ s: R(), a: R() * 6.283, amp: 0.004 + R() * 0.008, w: 0.03 + R() * 0.05 }))
    const sec = (i: number, ang: number): [number, number] => {
      const sm = arc[i]
      if (i >= nAll) return [0, 0] // 掌末封口
      if (i === nAll - 1) return [0.05, 0.016] // 掌末圆头（三根爪从这里长出）
      if (i > nArm) { // 手掌：扁椭圆，宽度渐增，背面三道掌骨脊
        const t = (sm - Larm) / (arc[nAll - 2] - Larm)
        const wHalf = lerp(0.034, 0.072, smooth(0, 0.75, t)) * (t > 0.92 ? lerp(1, 0.9, (t - 0.92) / 0.08) : 1)
        const tHalf = lerp(0.03, 0.026, t) + 0.006 * Math.exp(-Math.pow((t - 0.12) / 0.1, 2)) // 腕骨隆起
        const ridge = Math.max(0, Math.sin(ang)) * 0.009 * Math.pow(Math.abs(Math.cos(ang * 3)), 3) * smooth(0.1, 0.5, t)
        return [wHalf, tHalf + ridge]
      }
      const s = sm / Larm
      let r = armRadius(s)
      for (let k = 1; k <= SEG; k++) { const dz = (sm - k * Lseg) / 0.045; if (Math.abs(dz) < 3) r += knob[k].amp * Math.exp(-dz * dz) * (0.55 + 0.45 * Math.cos(ang - knob[k].dir)) }
      // 扭曲的筋索：3 股沿臂螺旋的隆起（上臂弱、前臂强）
      const cords = Math.pow(Math.max(0, Math.cos(3 * (ang + twist * s * 6.283 * 0.5 + cordPh))), 4)
      r *= 1 + cords * lerp(0.07, 0.22, smooth(0.2, 0.7, s))
      for (const l of lumps) { const ds = (s - l.s) / l.w, da = Math.cos(ang - l.a); if (Math.abs(ds) < 3 && da > 0) r += l.amp * Math.exp(-ds * ds) * da * da }
      if (i === 0) r = 0 // 管内根部封口（从管口仰看不会看见空心）
      return [r, r * 0.86]
    }
    const skin = sweep(P.path, frames, COLS, sec, {
      arm: a,
      uv: (i, j) => [j / COLS, i <= nArm ? (arc[i] / Larm) * ARM_V : lerp(ARM_V, 1, (arc[i] - Larm) / (arc[nAll] - Larm))],
      col: (i) => { const y = P.path[i].y; return mixc(cDark, cSkin, smooth(0.3, 0.1, y)) }, // 管内深处压暗（无贴图/Node 回退时也成立；管口发黑主要由 shader 的 vArmsY 完成）
      w: (i) => {
        if (i >= nArm) return [boneIdx(a, HAND), boneIdx(a, HAND), 1, 0]
        const u = arc[i] / Lch, k = Math.min(CH - 1, Math.floor(u)), t = u - k
        return [boneIdx(a, k), boneIdx(a, k + 1), 1 - t, t]
      },
    })
    // 「变细」morph：管体顶点指向本环中心的位移（腕部 s>0.86 渐隐到 0，手掌不变细）；运行时影响 = 1 − 半径系数
    skin.thin = new Array(skin.pos.length).fill(0)
    for (let v = 0; v < skin.pos.length / 3; v++) {
      const i = Math.floor(v / (COLS + 1)); if (i > nArm) break
      const m = 1 - smooth(0.86, 1.0, arc[i] / Larm), c = P.path[i]
      skin.thin[v * 3] = (c.x - skin.pos[v * 3]) * m; skin.thin[v * 3 + 1] = (c.y - skin.pos[v * 3 + 1]) * m; skin.thin[v * 3 + 2] = (c.z - skin.pos[v * 3 + 2]) * m
    }
    skinParts.push(partGeo(skin, true, count))
    // 爪
    P.claws.forEach((C, j) => {
      const n = C.path.length - 1
      const carc: number[] = [0]; for (let i = 1; i <= n; i++) carc.push(carc[i - 1] + C.path[i].distanceTo(C.path[i - 1]))
      // path[0] 在掌内（基部前 3cm），path[1..] 每节 CLAW_RPS 环：关节 k 正好落在 path[k·CLAW_RPS]
      const Lc = carc[n], seg0 = C.path[0].distanceTo(C.base)
      const jl = [seg0, carc[CLAW_RPS], carc[2 * CLAW_RPS]]
      const frames2 = transportFrames(C.path, C.axis, () => 0)
      // 把 S 轴转到铰链轴方向：截面在铰链轴方向更窄（侧扁的钩爪）
      for (let i = 0; i <= n; i++) {
        const [S, U] = frames2[i], T = V(0, 0, 0).crossVectors(S, U).normalize()
        const ax = C.axis.clone().sub(T.clone().multiplyScalar(C.axis.dot(T))).normalize()
        frames2[i] = [ax, V(0, 0, 0).crossVectors(T, ax).normalize()]
      }
      const csec = (i: number, ang: number): [number, number] => {
        const s = carc[i]
        if (i === n) return [0, 0]
        const t = clamp01((s - jl[0]) / (Lc - jl[0]))
        let r = lerp(0.025, 0.0012, Math.pow(t, 1.25))
        for (const jj of [jl[1], jl[2]]) { const dz = (s - jj) / 0.016; r += 0.004 * Math.exp(-dz * dz) * (1 - t * 0.6) }
        r += 0.007 * Math.exp(-Math.pow((s - jl[0]) / 0.022, 2))
        const keel = Math.sin(ang) < 0 ? 1 + 0.25 * Math.pow(-Math.sin(ang), 6) * (1 - t) : 1 // 内弧（钩内侧）略起脊
        return [r * 0.72, r * keel]
      }
      const cp = sweep(C.path, frames2, CLAW_COLS, csec, {
        arm: a,
        uv: () => [0.5, 0.995],
        col: (i) => { const s = carc[i], t = clamp01((s - jl[0]) / (Lc - jl[0])); return t < 0.3 ? mixc(clawSkin, clawHorn, smooth(0.05, 0.3, t)) : mixc(clawHorn, clawTip, smooth(0.45, 0.92, t)) },
        w: (i) => {
          const s = carc[i]
          if (s <= jl[0]) return [boneIdx(a, CLAW0 + j * 3), boneIdx(a, CLAW0 + j * 3), 1, 0]
          for (let k = 0; k < 2; k++) if (s <= jl[k + 1]) { const t = (s - jl[k]) / (jl[k + 1] - jl[k]); return [boneIdx(a, CLAW0 + j * 3 + k), boneIdx(a, CLAW0 + j * 3 + k + 1), 1 - t, t] }
          return [boneIdx(a, CLAW0 + j * 3 + 2), boneIdx(a, CLAW0 + j * 3 + 2), 1, 0]
        },
      })
      clawParts.push(partGeo(cp, true, count))
      // 爪根皮褶（第 2 阶段修正）：一圈从掌末鼓出的肉质指节套，套住爪根、在爪上收出一道翻唇，
      // 让爪子像从皮肉里长出来（皮肤材质组；掌内环属于 hand，唇口属于爪第 1 节，中间按比例混合）
      const dir0 = C.joints[1].clone().sub(C.base).normalize()
      const SD = [-0.04, -0.018, 0.004, 0.022, 0.034, 0.04]
      const SR: [number, number][] = [[0.018, 0.022], [0.026, 0.034], [0.028, 0.04], [0.025, 0.036], [0.0225, 0.0325], [0.012, 0.016]]
      const SW = [0, 0, 0.4, 0.75, 1, 1]
      const spath = SD.map((d) => C.base.clone().addScaledVector(dir0, d))
      const sfr = SD.map((): [V3, V3] => { const ax = C.axis.clone().sub(dir0.clone().multiplyScalar(C.axis.dot(dir0))).normalize(); return [ax, V(0, 0, 0).crossVectors(dir0, ax).normalize()] })
      const sh = sweep(spath, sfr, SHEATH_COLS, (i, ang) => { const [rs, ru] = SR[i]; const fold = 1 + 0.08 * Math.cos(ang * 3) * (i === 2 ? 1 : 0.4); return [rs * fold, ru * fold * (Math.sin(ang) < 0 ? 1.06 : 1)] }, {
        arm: a,
        uv: (i, jj) => [0.08 + 0.12 * (jj / SHEATH_COLS), 0.9 + i * 0.008], // 取掌段两道骨脊之间的一窄条（避开浅色条纹）
        col: (i) => mixc([0.92, 0.9, 0.87], [0.42, 0.4, 0.37], smooth(1.5, 4.5, i)),
        w: (i) => [boneIdx(a, HAND), boneIdx(a, CLAW0 + j * 3), 1 - SW[i], SW[i]],
      })
      skinParts.push(partGeo(sh, true, count))
    })
  }
  const g0 = mergeGeometries(skinParts)!, g1 = mergeGeometries(clawParts)!
  const geo = mergeGeometries([g0, g1], true)!
  g0.dispose(); g1.dispose()
  geo.morphTargetsRelative = true // mergeGeometries 不保留该标志（各部件的 morph 都是相对位移）
  return { geo, plans, tris: (geo.index!.count / 3) | 0 }
  } finally { for (const g of [...skinParts, ...clawParts]) g.dispose() }
}

/**
 * 一个风口挂 1–3 条臂（单个 SkinnedMesh，2 次绘制）。原点 = 管口中心（见文件头）。
 * 句柄：armsRig(group)。
 */
const geometryTemplates = new Map<string, BuildResult>()
const templateKey = (count: number, seed: number) => Math.max(1,Math.min(3,Math.round(count)))+':'+seed
function keepTemplate(key: string, value: BuildResult) {
  geometryTemplates.set(key, value)
  while (geometryTemplates.size > 12) { const oldest=geometryTemplates.keys().next().value!; geometryTemplates.get(oldest)!.geo.dispose(); geometryTemplates.delete(oldest) }
}
function geometryFor(count: number, seed: number): BuildResult {
  const key=templateKey(count,seed);let value=geometryTemplates.get(key)
  if (!value) { const job=buildGeometryJob(count,seed);let step=job.next();while(!step.done)step=job.next();value=step.value;keepTemplate(key,value) }
  else { geometryTemplates.delete(key);geometryTemplates.set(key,value) }
  return {...value,geo:value.geo.clone()}
}
export function armsResourcesReady(count=3,seed=1) { return geometryTemplates.has(templateKey(count,seed)) && SKIN_TEX!==undefined && BURN_TEX!==undefined && METAL_TEX!==undefined && PUFF_TEX!==undefined && SCORCH_TEX!==undefined }
export function* prepareArmsJob(count=3,seed=1): Generator<void,void,unknown> {
  for (const make of [skinTexture,burnTexture,metalTexture,puffTexture,scorchTexture]) { make();yield }
  const key=templateKey(count,seed);if(geometryTemplates.has(key))return
  const value=yield* buildGeometryJob(Math.max(1,Math.min(3,Math.round(count))),seed)
  if(geometryTemplates.has(key))value.geo.dispose();else keepTemplate(key,value)
}

export function buildArmsMesh(count = 3, seed = 1): THREE.Group {
  count = Math.max(1, Math.min(3, Math.round(count)))
  const { geo, plans } = geometryFor(count, seed)
  const burn = { value: new THREE.Vector3(0, 0, 0) }
  const stretchU = { value: new THREE.Vector3(1, 1, 1) }
  const mesh = new THREE.SkinnedMesh(geo, [skinMaterial(burn, stretchU), clawMaterial()])
  mesh.name = 'arms'
  mesh.frustumCulled = false // 蒙皮包围盒随伸长变化，避免误剔除（只有 1 个网格，代价很小）
  const bones: THREE.Bone[] = []
  const root = new THREE.Bone(); root.name = 'root'; bones.push(root)
  const arms: ArmsArm[] = []
  plans.forEach((P, a) => {
    const chain: THREE.Bone[] = []
    let parent = root, parentPos = V(0, 0, 0)
    const restOffsets: V3[] = []
    for (let k = 0; k <= CH; k++) {
      const b = new THREE.Bone(); b.name = k < CH ? (k % 2 === 0 ? `arm${a}_s${k / 2}` : `arm${a}_m${(k - 1) / 2}`) : `arm${a}_hand`
      const off = P.joints[k].clone().sub(parentPos)
      b.position.copy(off); parent.add(b); bones.push(b)
      if (k >= 1) restOffsets.push(off.clone())
      if (k < CH) chain.push(b)
      parent = b; parentPos = P.joints[k]
    }
    const hand = parent
    const claws: [THREE.Bone, THREE.Bone, THREE.Bone][] = []
    P.claws.forEach((C, j) => {
      let par: THREE.Bone = hand, pp = P.joints[CH]
      const cb: THREE.Bone[] = []
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Bone(); b.name = `arm${a}_claw${j}_${k}`
        b.position.copy(C.joints[k].clone().sub(pp)); par.add(b); bones.push(b); cb.push(b)
        par = b; pp = C.joints[k]
      }
      claws.push(cb as [THREE.Bone, THREE.Bone, THREE.Bone])
    })
    // 管内长度：s0 → 第一个低于管口的环
    let inDuct = 0, tube = 0
    for (let i = 1; i <= ARM_RINGS; i++) { const d = P.path[i].distanceTo(P.path[i - 1]); tube += d; if (P.path[i].y >= 0) inDuct += d }
    // 静止平行移动标架：从中心线穿过管口处开始（T≈-Y，N 由 +Z 平行移动而来），向两端传播
    const NS = CH * 16, pts: V3[] = [], tans: V3[] = []
    for (let i = 0; i <= NS; i++) { pts.push(P.curve.getPointAt(i / NS)); tans.push(P.curve.getTangentAt(i / NS).normalize()) }
    let ic = pts.findIndex((p) => p.y < 0); if (ic < 0) ic = 0
    const Ns: V3[] = new Array(NS + 1)
    Ns[ic] = armsTransport(V(0, 0, 1), V(0, -1, 0), tans[ic]).clone()
    for (let i = ic + 1; i <= NS; i++) Ns[i] = armsTransport(Ns[i - 1].clone(), tans[i - 1], tans[i])
    for (let i = ic - 1; i >= 0; i--) Ns[i] = armsTransport(Ns[i + 1].clone(), tans[i + 1], tans[i])
    const frames = Array.from({ length: CH + 1 }, (_, k) => armsFrameQuat(Ns[k * 16], tans[k * 16]))
    const rest: ArmsArmRest = {
      joints: P.joints.map((v) => v.clone()), frames,
      duct: V(P.o.x * 0.75, 0, P.o.z * 0.55 + 0.035), out: P.h.clone(),
      palmDir: P.dp.clone(), palmSide: P.sp.clone(), hook: P.q.clone(),
      grip: P.claws[1].joints[0].clone().addScaledVector(P.dp, 0.17).addScaledVector(P.q, 0.1), // 掌末前方 0.17m、向钩弯侧 0.1m：躯干放在这里时掌贴胸口、三爪环抱
      claws: P.claws.map((c) => ({ joints: c.joints.map((v) => v.clone()), tip: c.tip.clone() })),
    }
    arms.push({
      index: a, segs: chain.filter((_, i) => i % 2 === 0), chain, mids: chain.filter((_, i) => i % 2 === 1), hand, claws,
      clawAxis: P.claws.map((c) => c.axis.clone()), restOffsets, reach0: P.reach0, inDuct, tubeLen: tube, handLen: P.reach0 - (tube - inDuct), rest,
    })
  })
  mesh.add(root)
  const grp = new THREE.Group(); grp.name = 'armsGroup'; grp.add(mesh)
  grp.updateMatrixWorld(true)
  mesh.bind(new THREE.Skeleton(bones))
  const restQ = arms.map((A) => A.claws.map((c) => c.map((b) => b.quaternion.clone())))
  const curlQ = new THREE.Quaternion()
  const rig: ArmsRig = {
    count, mesh, root, arms,
    setStretch(a, k) {
      const A = arms[a]; if (!A) return
      const ch = [...A.chain.slice(1), A.hand]
      ch.forEach((b, i) => b.position.copy(A.restOffsets[i]).multiplyScalar(k))
      rig.setStretchLook(a, k)
    },
    setReach(a, meters) {
      const A = arms[a]; if (!A) return 1
      const k = Math.max(0.5, (meters - A.handLen + A.inDuct) / A.tubeLen)
      rig.setStretch(a, k); return k
    },
    setStretchLook(a, k) {
      if (!arms[a]) return
      const inf = mesh.morphTargetInfluences
      if (inf) inf[a] = 1 - Math.max(ARMS_THIN_MIN, 1 / Math.sqrt(Math.max(1, k)))
      stretchU.value.setComponent(a, Math.max(0.5, k))
    },
    setClawCurl(a, c) {
      const A = arms[a]; if (!A) return
      const amt = (c >= 0 ? ARMS_CLAW_CURL : ARMS_CLAW_SPREAD).map((x) => x * c) // 收拢 / 张开（张开到 -1 时钩尖仍略向内）
      A.claws.forEach((cb, j) => cb.forEach((b, k) => { curlQ.setFromAxisAngle(A.clawAxis[j], amt[k]); b.quaternion.copy(restQ[a][j][k]).multiply(curlQ) }))
    },
    setBurn(a, b) { const v = burn.value; if (a === 0) v.x = b; else if (a === 1) v.y = b; else v.z = b },
  }
  grp.userData.armsRig = rig
  return grp
}
export function armsRig(g: THREE.Object3D): ArmsRig | null { return (g.userData.armsRig as ArmsRig) ?? null }

// ============================================================================
// 风口（方形铁皮管段 + 铰链百叶格栅）
// ============================================================================
export interface ArmsVent {
  /** 管口中心（把 buildArmsMesh 的组挂在这里） */
  anchor: THREE.Object3D
  /** 格栅铰链组（绕局部 X 轴旋转） */
  hinge: THREE.Object3D
  open: number
}
function colored(g: THREE.BufferGeometry, c: RGB, uvScale = 1): THREE.BufferGeometry {
  const n = g.attributes.position.count, col: number[] = []
  for (let i = 0; i < n; i++) col.push(c[0], c[1], c[2])
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  if (uvScale !== 1) { const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale) }
  return g
}
const boxAt = (w: number, h: number, d: number, x: number, y: number, z: number, c: RGB, rx = 0, uvs = 1) => {
  const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); return colored(g, c, uvs)
}

/**
 * 天花板上的方形铁皮管段（约 0.6×0.6m，露出天花板 ARMS_VENT_DROP，向上没入天花板 0.5m），
 * 管口下沿铰链挂一块百叶格栅（setGrateOpen 0..1），管内是漆黑的衬里与内顶盖。2 次绘制。
 */
export function buildArmsVent(): THREE.Group {
  const S = ARMS_VENT_SIZE, h = S / 2, t = 0.012, top = 0.5, bot = -ARMS_VENT_DROP
  const W: RGB = [1, 1, 1], dim: RGB = [0.78, 0.78, 0.76], blk: RGB = [0.012, 0.011, 0.01]
  const H = top - bot, cy = (top + bot) / 2
  const parts: THREE.BufferGeometry[] = []
  // 四面外壁（铁皮）
  parts.push(boxAt(S, H, t, 0, cy, h - t / 2, W, 0, 1.4), boxAt(S, H, t, 0, cy, -h + t / 2, W, 0, 1.4))
  parts.push(boxAt(t, H, S - 2 * t, h - t / 2, cy, 0, W, 0, 1.4), boxAt(t, H, S - 2 * t, -h + t / 2, cy, 0, W, 0, 1.4))
  // 漆黑内衬 + 内顶盖（仰视管口只见一片黑）
  const ih = h - t - 0.002
  parts.push(boxAt(2 * ih, H, 0.004, 0, cy, ih, blk), boxAt(2 * ih, H, 0.004, 0, cy, -ih, blk), boxAt(0.004, H, 2 * ih, ih, cy, 0, blk), boxAt(0.004, H, 2 * ih, -ih, cy, 0, blk))
  parts.push(boxAt(2 * ih, 0.004, 2 * ih, 0, 0.12, 0, blk))
  // 管口下沿翻边（略外扩）
  const L = 0.035
  parts.push(boxAt(S + 0.03, 0.03, L, 0, bot + 0.015, h - L / 2 + 0.015, dim), boxAt(S + 0.03, 0.03, L, 0, bot + 0.015, -h + L / 2 - 0.015, dim))
  parts.push(boxAt(L, 0.03, S - 2 * L + 0.03, h - L / 2 + 0.015, bot + 0.015, 0, dim), boxAt(L, 0.03, S - 2 * L + 0.03, -h + L / 2 - 0.015, bot + 0.015, 0, dim))
  // 中段接缝法兰
  const fy = bot + 0.24
  parts.push(boxAt(S + 0.024, 0.026, 0.012, 0, fy, h + 0.006, dim), boxAt(S + 0.024, 0.026, 0.012, 0, fy, -h - 0.006, dim), boxAt(0.012, 0.026, S, h + 0.006, fy, 0, dim), boxAt(0.012, 0.026, S, -h - 0.006, fy, 0, dim))
  // 天花板收口圈（贴天花板的方形盖板）
  parts.push(boxAt(S + 0.16, 0.012, 0.08, 0, -0.006, h + 0.04, dim), boxAt(S + 0.16, 0.012, 0.08, 0, -0.006, -h - 0.04, dim), boxAt(0.08, 0.012, S, h + 0.04, -0.006, 0, dim), boxAt(0.08, 0.012, S, -h - 0.04, -0.006, 0, dim))
  // 铆钉
  const rv: RGB = [0.55, 0.55, 0.53]
  for (const yy of [fy - 0.03, fy + 0.03]) for (let k = 0; k < 4; k++) {
    const u = -h + 0.08 + k * ((S - 0.16) / 3)
    parts.push(boxAt(0.012, 0.012, 0.006, u, yy, h + 0.003, rv), boxAt(0.012, 0.012, 0.006, u, yy, -h - 0.003, rv), boxAt(0.006, 0.012, 0.012, h + 0.003, yy, u, rv), boxAt(0.006, 0.012, 0.012, -h - 0.003, yy, u, rv))
  }
  const duct = new THREE.Mesh(mergeGeometries(parts)!, metalMaterial()); duct.name = 'armsVentDuct'
  for (const part of parts) part.dispose()
  // ---- 格栅（铰链在管口 -Z 边）----
  const gp: THREE.BufferGeometry[] = [], gs = S - 0.05, gb = 0.026, gc: RGB = [0.52, 0.52, 0.5]
  gp.push(boxAt(gs, 0.016, gb, 0, 0, gb / 2, gc), boxAt(gs, 0.016, gb, 0, 0, gs - gb / 2, gc), boxAt(gb, 0.016, gs - 2 * gb, -gs / 2 + gb / 2, 0, gs / 2, gc), boxAt(gb, 0.016, gs - 2 * gb, gs / 2 - gb / 2, 0, gs / 2, gc))
  const nS = 8
  for (let k = 0; k < nS; k++) gp.push(boxAt(gs - 2 * gb, 0.004, 0.062, 0, 0.004, gb + 0.03 + k * ((gs - 2 * gb - 0.06) / (nS - 1)), [0.6, 0.6, 0.58], -42 * DEG))
  for (const x of [-gs * 0.32, gs * 0.32]) { const c = new THREE.CylinderGeometry(0.011, 0.011, 0.07, 8); c.rotateZ(Math.PI / 2); c.translate(x, 0, 0); gp.push(colored(c, [0.35, 0.35, 0.34])) }
  const grate = new THREE.Mesh(mergeGeometries(gp)!, metalMaterial()); grate.name = 'armsVentGrate'
  for (const part of gp) part.dispose()
  const hinge = new THREE.Group(); hinge.name = 'armsVentHinge'
  hinge.position.set(0, bot - 0.012, -gs / 2); hinge.add(grate)
  const anchor = new THREE.Group(); anchor.name = 'armsAnchor'; anchor.position.set(0, bot, 0)
  const grp = new THREE.Group(); grp.name = 'armsVent'
  grp.add(duct, hinge, anchor)
  const v: ArmsVent = { anchor, hinge, open: 0 }
  grp.userData.armsVent = v
  return grp
}
export function armsVent(g: THREE.Object3D): ArmsVent | null { return (g.userData.armsVent as ArmsVent) ?? null }
/** 格栅开合：0 = 关闭（与管口平齐），1 = 完全打开（向下垂挂约 95°） */
export function setGrateOpen(vent: THREE.Object3D, t: number) {
  const v = armsVent(vent); if (!v) return
  v.open = clamp01(t)
  v.hinge.rotation.x = v.open * 95 * DEG
}

// ============================================================================
// 烧焦皮肤碎片（第 3 阶段：被强光逼退后留在格栅下的地面上，冒烟）
// ============================================================================
export interface ArmsDebris {
  /** 推进烟雾（秒）；第 3 阶段每帧调用 */
  update(dt: number): void
  /** 烟量 0..1（0 = 熄灭隐藏） */
  setSmoke(k: number): void
  /** 余烬红热 0..1 */
  setEmber(k: number): void
}
let PUFF_TEX: THREE.CanvasTexture | null | undefined, SCORCH_TEX: THREE.CanvasTexture | null | undefined
function puffTexture() {
  if (PUFF_TEX !== undefined) return PUFF_TEX
  if (typeof document === 'undefined') return (PUFF_TEX = null)
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); if (!g) return (PUFF_TEX = null)
  const R = mulberry(77)
  for (let i = 0; i < 9; i++) { const x = 20 + R() * 24, y = 20 + R() * 24, r = 10 + R() * 12; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64) }
  return (PUFF_TEX = sharedArmsTexture(new THREE.CanvasTexture(cv)))
}
function scorchTexture() {
  if (SCORCH_TEX !== undefined) return SCORCH_TEX
  if (typeof document === 'undefined') return (SCORCH_TEX = null)
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'); if (!g) return (SCORCH_TEX = null)
  const R = mulberry(91)
  for (let i = 0; i < 40; i++) { const x = 64 + (R() - 0.5) * 60, y = 64 + (R() - 0.5) * 60, r = 8 + R() * 26; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(12,9,7,${0.25 + R() * 0.3})`); gr.addColorStop(1, 'rgba(12,9,7,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128) }
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(40,20,12,${0.3 + R() * 0.4})`; g.fillRect(64 + (R() - 0.5) * 80, 64 + (R() - 0.5) * 80, 1 + R() * 2, 1 + R() * 2) }
  const t = sharedArmsTexture(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace; return (SCORCH_TEX = t)
}
/** 原点 = 地面（格栅正下方），约 0.7m 见方的散落范围。3 次绘制：焦痕贴花 + 皮片 + 烟。 */
export function buildArmsBurntDebris(seed = 1): THREE.Group {
  const R = mulberry(0xdeb + seed * 131)
  const grp = new THREE.Group(); grp.name = 'armsBurntDebris'
  const st = scorchTexture()
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, ...(st ? { map: st } : { opacity: 0.4, color: '#120c09' }) }))
  decal.rotation.x = -Math.PI / 2; decal.position.y = 0.002; decal.name = 'armsScorch'; grp.add(decal)
  // 皮片：卷曲的小块焦皮（细分平面按两个方向弯曲），焦黑面 + 灰白残皮 + 红热边（顶点色，emissive 由 setEmber 调）
  const chips: THREE.BufferGeometry[] = []
  const char = hex('#151110'), ash = hex('#6e6a63'), hot = hex('#5a1a08')
  const n = 7 + Math.floor(R() * 4)
  for (let i = 0; i < n; i++) {
    const w = 0.04 + R() * 0.07, l = 0.06 + R() * 0.12
    const g = new THREE.PlaneGeometry(w, l, 3, 4); g.rotateX(-Math.PI / 2)
    const p = g.attributes.position as THREE.BufferAttribute, col: number[] = []
    const cu = 4 + R() * 10, cv = (R() - 0.5) * 8, burnt = R()
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), z = p.getZ(k)
      p.setY(k, 0.004 + cu * x * x + cv * z * z * 0.5 + Math.abs(cv) * 0.002)
      const edge = Math.max(Math.abs(x) / (w / 2), Math.abs(z) / (l / 2))
      const c = edge > 0.92 && R() < 0.6 ? hot : mixc(ash, char, clamp01(burnt + (R() - 0.3) * 0.6))
      col.push(c[0], c[1], c[2])
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals()
    g.rotateY(R() * 6.283); const rr = Math.sqrt(R()) * 0.3, ra = R() * 6.283; g.translate(Math.cos(ra) * rr, 0, Math.sin(ra) * rr)
    chips.push(g)
  }
  const chipMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: '#ff4a10', emissiveIntensity: 0 })
  // 只让红热色的顶点发光：用 onBeforeCompile 按顶点色的红度调制 emissive
  chipMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= clamp((vColor.r - vColor.g) * 2.6 - 0.25, 0.0, 1.0);\n#endif') }
  chipMat.customProgramCacheKey = () => 'arms-chip-ember-v1'
  const chipMesh = new THREE.Mesh(mergeGeometries(chips)!, chipMat); chipMesh.name = 'armsSkinChips'; grp.add(chipMesh)
  for (const chip of chips) chip.dispose()
  // 烟：一组缓慢上升、扩散、淡出的点精灵
  const NP = 28, pos = new Float32Array(NP * 3), life = new Float32Array(NP), origin: V3[] = []
  for (let i = 0; i < NP; i++) { const rr = Math.sqrt(R()) * 0.22, ra = R() * 6.283; origin.push(V(Math.cos(ra) * rr, 0.02, Math.sin(ra) * rr)); life[i] = R() }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const alpha = new Float32Array(NP); pg.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1))
  const pt = puffTexture()
  const pm = new THREE.PointsMaterial({ color: '#77736c', size: 0.32, transparent: true, depthWrite: false, opacity: 0.55, ...(pt ? { map: pt } : {}) })
  pm.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aAlpha;\nvarying float vAlpha;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;')
    sh.fragmentShader = 'varying float vAlpha;\n' + sh.fragmentShader.replace('#include <premultiplied_alpha_fragment>', 'gl_FragColor.a *= vAlpha;\n#include <premultiplied_alpha_fragment>')
  }
  pm.customProgramCacheKey = () => 'arms-smoke-v1'
  const smoke = new THREE.Points(pg, pm); smoke.name = 'armsSmoke'; smoke.frustumCulled = false; grp.add(smoke)
  let smokeK = 1
  const place = () => {
    for (let i = 0; i < NP; i++) {
      const t = life[i], o = origin[i]
      pos[i * 3] = o.x + Math.sin(t * 7 + i) * 0.05 * t; pos[i * 3 + 1] = o.y + t * 1.1; pos[i * 3 + 2] = o.z + Math.cos(t * 5 + i) * 0.05 * t
      alpha[i] = smokeK * Math.sin(Math.PI * Math.min(1, t)) * (1 - t * 0.5)
    }
    pg.attributes.position.needsUpdate = true; pg.attributes.aAlpha.needsUpdate = true
  }
  place()
  const h: ArmsDebris = {
    update(dt) { for (let i = 0; i < NP; i++) { life[i] += dt * 0.28; if (life[i] > 1) life[i] -= 1 } place() },
    setSmoke(k) { smokeK = clamp01(k); smoke.visible = smokeK > 0.001; place() },
    setEmber(k) { chipMat.emissiveIntensity = clamp01(k) * 2.2 },
  }
  h.setEmber(0.22)
  grp.userData.armsDebris = h
  return grp
}
export function armsDebris(g: THREE.Object3D): ArmsDebris | null { return (g.userData.armsDebris as ArmsDebris) ?? null }

// ============================================================================
// 预算统计
// ============================================================================
export function armsBudget(root: THREE.Object3D): { meshes: number; draws: number; tris: number; bones: number } {
  let meshes = 0, draws = 0, tris = 0, bones = 0
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || m.userData.cpuSkin) return
    meshes++
    const g = m.geometry
    draws += Array.isArray(m.material) ? Math.max(1, g.groups.length) : 1
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) bones += (m as THREE.SkinnedMesh).skeleton.bones.length
  })
  return { meshes, draws, tris: Math.round(tris), bones }
}
