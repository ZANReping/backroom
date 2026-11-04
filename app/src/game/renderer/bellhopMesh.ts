import { shareHotelRigAssets } from './shared'
// [bellhop] 行李员（Entity 135 / The Bellhopper）重制·阶段 1 建模（替换旧「侍者」type bellhop 的外观；本阶段只建模，不做动画 / 机制）。
// 参照 ZAN 附图：约 1.85 m 瘦高男体；仓鸮心形面盘（奶白上釉面具、羽毛细线刻纹、两只黑圆眼、细长钩喙从额中线下来），
// 面盘外一圈蓬乱姜黄头发；藏青圆筒帽（金色四芒绣星、黑色锯齿 / 扇贝饰边、略有光泽）；白色高立领 + 两颗金扣、V 口露深色内领；
// 藏青双排扣长制服（两列各 6 颗金扣、门襟叠边、肩线、腰缝、口袋盖、后中开衩）；白翻袖口 + 一颗金扣；苍白细长人手；深色西裤 + 黑皮鞋。
//
// 做法（沿用看门人 v4）：
//   · 每个部件写成 SDF（bellhopHead / bellhopBody），窄带 Surface Nets 提取、QEM 减面、顶点投影回等值面、法线取 SDF 梯度；
//     顶点色 = 区域色 × SDF 环境光遮蔽。前臂袖 + 翻袖口用细格单独提取（重叠带拼接）。
//   · 白立领 / 金扣是独立薄壳 / 小网格（体素表达不了）。全身一张 SkinnedMesh（1 次绘制）+ 发绺 SkinnedMesh（实心扁带卷发绺，不透明）。
//   · 面盘（8 张脸，bellhopFace）、帽是挂在 head 骨上的刚性网格；setBellhopFace(group, i) 换脸。
//   · 材质：litMaterial + 三平面细节纹理（发流笔触 / 皮肤 / 棉布 / 毛呢），在绑定空间采样。
// 坐标：按 +Z 正面建造、地面 y=0；外层 face 组 rotation.y = π/2（userData.facesZ = 1）。
// 骨骼（userData.bellhop）：root/hips/spine/chest/neck/head；armL/armR：clav → shoulder(上臂) → elbow(前臂) → wrist(手) → fingers.{thumb,index,middle,ring,pinky}[3]
//   （userData.flexAxis 为屈曲轴）；legL/legR：hip(大腿) → knee(小腿) → ankle(脚) → toe(趾)。头骨在寰椎：拧 180° 时颈部权重在 1.44–1.64 m 间渐变（留余量）。
// 道具（默认隐藏）：bell（右手）、cup（右手）+ saucer（左手）、tag（左手）、cart（root）。
// 无头 SwiftShader 画 GPU 蒙皮会崩：预览 / 截图带 ?cpu=1（qaCpuSkin）。
import * as THREE from 'three'
import { litMaterial } from './shared'
import { decimate, extract, reproject, sdfAO, clamp, mix, sstep, type Sdf, type Surf } from './conciergeSdf'
import type { Shade } from './conciergeHead'
import { BONES, B, HANDS, J, W4, FACE_C, HAT, add, cross, dot, nrm, scl, sub, side, lenv, type V3 } from './bellhopRig'
import {
  coatSdf, COAT_BOX, coatShade, coatWeights, foreSleeveRegion, foreSleeveBox, SLEEVE_BAND, pantsSdf, PANTS_BOX, pantsShade, legWeights, hemY,
  shoeSdf, shoeBox, shoeShade, shoeWeights, handSdf, handBox, handKeep, handShade, handWeights, onSurface, torsoCore, trunkW, BUTTON_ROWS, buttonX, cuffButton, NECK_HOLE,
} from './bellhopBody'
import { headPartSdf, HEAD_BOX, headShade, headWeights, buildHat, maskBackZ, hatLocal, hairSdf, faceEnv, maskRimFrontZ } from './bellhopHead'
import { buildFaceGeometry, faceMaterials, FACES, N_FACES } from './bellhopFace'
import { buildBellhopBell, buildBellhopCart, buildBellhopTag, buildBellhopTea } from './bellhopProps'

export { FACES as BELLHOP_FACES, N_FACES as BELLHOP_FACE_COUNT }

// ---------- 顶点块 ----------
class Chunk {
  pos: number[] = []; nrm: number[] = []; col: number[] = []; det: number[] = []; flow: number[] = []; rm: number[] = []; si: number[] = []; sw: number[] = []; idx: number[] = []
  get n() { return this.pos.length / 3 }
  vert(p: ArrayLike<number>, n: ArrayLike<number>, s: Shade, w: W4, ao = 1) {
    this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2])
    this.col.push(lin(s.r) * ao, lin(s.g) * ao, lin(s.b) * ao); this.det.push(s.fur, s.skin, s.cloth, s.wool); this.rm.push(s.rough, s.metal); this.flow.push(s.fx ?? 0, s.fy ?? 0, s.fz ?? 0)
    this.si.push(w.i[0], w.i[1], w.i[2], w.i[3]); this.sw.push(w.w[0], w.w[1], w.w[2], w.w[3])
  }
}
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const shade0 = (): Shade => ({ r: 1, g: 1, b: 1, rough: 0.8, metal: 0, fur: 0, skin: 0, cloth: 0, wool: 0, fx: 0, fy: 0, fz: 0 })
const C3 = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]

// ---------- SDF 部件 ----------
interface Part {
  name: string; sdf: Sdf; box: { min: [number, number, number]; max: [number, number, number] }; h: [number, number]; target?: [number, number]
  keep?: (x: number, y: number, z: number) => boolean; within?: (x: number, y: number, z: number) => boolean; shade: (x: number, y: number, z: number, o: Shade) => void; weights: (x: number, y: number, z: number, acc: W4) => void
  ao?: Sdf; aoScale?: number
}
let lodNow = 0
let headTriRanges: [number, number][] = []
function parts(): Part[] {
  const out: Part[] = []
  out.push({ name: 'head', sdf: headPartSdf, box: HEAD_BOX, h: [0.0052, 0.009], target: [8400, 2400], keep: (_x, y) => y > 1.43, shade: headShade, weights: headWeights, ao: torsoCore, aoScale: 0.012 })
  const outSleeve = (x: number, y: number, z: number, slack: number) => foreSleeveRegion(1, x, y, z) > -SLEEVE_BAND - slack && foreSleeveRegion(-1, x, y, z) > -SLEEVE_BAND - slack
  out.push({ name: 'coat', sdf: coatSdf, box: COAT_BOX, h: [0.0105, 0.017], target: [10500, 2600], keep: (x, y, z) => outSleeve(x, y, z, 0), within: (x, y, z) => outSleeve(x, y, z, lodNow ? 0.03 : 0.02), shade: coatShade, weights: coatWeights, aoScale: 0.018 })
  // 前臂袖 + 翻袖口单独细格提取（LOD1 也要：粗格下翻袖口边缘是锯齿）
  for (const s of [1, -1]) out.push({ name: 'sleeve' + (s > 0 ? 'L' : 'R'), sdf: coatSdf, box: foreSleeveBox(s), h: [0.0048, 0.0055], target: [1700, 600], keep: (x, y, z) => foreSleeveRegion(s, x, y, z) < 0, within: (x, y, z) => foreSleeveRegion(s, x, y, z) < 0.01, shade: coatShade, weights: coatWeights, aoScale: 0.01 })
  out.push({ name: 'pants', sdf: pantsSdf, box: PANTS_BOX, h: [0.0082, 0.017], target: [5600, 1400], keep: (x, y, z) => y < hemY(x, z) + 0.04, within: (x, y, z) => y < hemY(x, z) + 0.07, shade: pantsShade, weights: legWeights, aoScale: 0.02 })
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R', hs = handSdf(s), sh = shoeSdf(s)
    out.push({ name: 'shoe' + S, sdf: sh, box: shoeBox(s), h: [0.0045, 0.009], target: [1700, 420], shade: (x, y, z, o) => shoeShade(s, x, y, z, o), weights: (x, y, z, a) => shoeWeights(s, x, y, z, a), ao: pantsSdf, aoScale: 0.01 })
    out.push({ name: 'hand' + S, sdf: hs, box: handBox(s), h: [0.0029, 0.0058], target: [3700, 760], keep: handKeep(s), shade: (x, y, z, o) => handShade(s, x, y, z, o), weights: (x, y, z, a) => handWeights(s, x, y, z, a), ao: coatSdf, aoScale: 0.008 })
  }
  return out
}
function bakePart(ch: Chunk, p: Part, lod: number, stats: Record<string, number>) {
  const t0 = performance.now()
  let s: Surf = extract(p.sdf, { min: p.box.min, max: p.box.max, h: p.h[lod], keep: p.keep, within: p.within, project: 1 })
  const raw = s.idx.length / 3
  const t1 = performance.now()
  if (p.target && raw > p.target[lod]) {
    s = decimate(s, p.target[lod]); stats[p.name + '_dec'] = Math.round(performance.now() - t1)
    // 法线一律用 SDF 梯度（LOD1 用格点场差分时，粗格未求值处退到更粗的格 → 裤子 / 头发上一块块黑斑）
    reproject(p.sdf, s, 0, lod ? 0.003 : 0.0012)
  }
  const grid = s.sample!, extra = p.ao
  const ao: Sdf = extra ? (x, y, z) => Math.min(grid(x, y, z), extra(x, y, z)) : grid
  const base = ch.n, sh = shade0(), w = new W4()
  if (p.sdf === headPartSdf) headTriRanges.push([ch.idx.length, ch.idx.length + s.idx.length])
  for (let i = 0; i < s.vcount; i++) {
    const x = s.pos[i * 3], y = s.pos[i * 3 + 1], z = s.pos[i * 3 + 2], nx = s.nrm[i * 3], ny = s.nrm[i * 3 + 1], nz = s.nrm[i * 3 + 2]
    sh.fx = 0; sh.fy = 0; sh.fz = 0
    p.shade(x, y, z, sh)
    const occ = sdfAO(ao, x, y, z, nx, ny, nz, p.aoScale ?? 0.012, 1.6)
    p.weights(x, y, z, w.reset()); w.finish(B.chest)
    // LOD1 粗格的格点场 AO 噪声大（裤子 / 头发上一块块黑斑）：减弱
    ch.vert([x, y, z], [nx, ny, nz], sh, w, lod ? 0.7 + 0.3 * occ : 0.38 + 0.62 * occ)
  }
  for (let i = 0; i < s.idx.length; i++) ch.idx.push(base + s.idx[i])
  stats[p.name] = s.idx.length / 3
  stats[p.name + '_ms'] = Math.round(performance.now() - t0)
  stats[p.name + '_raw'] = raw
}

// ---------- 薄壳 / 小件 ----------
function shell(ch: Chunk, P: (s: number, t: number) => V3, ns: number, nt: number, thick: (s: number, t: number) => number, shadeAt: (p: V3, s: number, t: number, o: Shade) => void, weightAt: (p: V3, acc: W4) => void) {
  const grid: V3[][] = [], N: V3[][] = []
  for (let i = 0; i <= ns; i++) { grid.push([]); for (let j = 0; j <= nt; j++) grid[i].push(P(i / ns, j / nt)) }
  for (let i = 0; i <= ns; i++) { N.push([]); for (let j = 0; j <= nt; j++) {
    const a = grid[Math.min(ns, i + 1)][j], b = grid[Math.max(0, i - 1)][j], c = grid[i][Math.min(nt, j + 1)], d = grid[i][Math.max(0, j - 1)]
    N[i].push(nrm(cross(sub(a, b), sub(c, d)))) } }
  const sh = shade0(), w = new W4()
  const layer = (sg: number) => {
    const base = ch.n
    for (let i = 0; i <= ns; i++) for (let j = 0; j <= nt; j++) {
      const th = thick(i / ns, j / nt) * 0.5, p = add(grid[i][j], scl(N[i][j], th * sg))
      shadeAt(p, i / ns, j / nt, sh); weightAt(p, w.reset()); w.finish(B.chest)
      ch.vert(p, scl(N[i][j], sg), sh, w, sg > 0 ? 1 : 0.8)
    }
    for (let i = 0; i < ns; i++) for (let j = 0; j < nt; j++) {
      const a = base + i * (nt + 1) + j, b = a + nt + 1
      if (sg > 0) ch.idx.push(a, b, a + 1, b, b + 1, a + 1); else ch.idx.push(a, a + 1, b, b, a + 1, b + 1)
    }
  }
  layer(1); layer(-1)
  const rim = (pts: [number, number][]) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const [i0, j0] = pts[k], [i1, j1] = pts[k + 1]
      const q = [[i0, j0, 1], [i1, j1, 1], [i1, j1, -1], [i0, j0, -1]].map(([i, j, sg]) => add(grid[i][j], scl(N[i][j], thick(i / ns, j / nt) * 0.5 * sg)))
      const en = nrm(cross(sub(q[1], q[0]), sub(q[3], q[0])))
      const base = ch.n
      for (const p of q) { shadeAt(p, i0 / ns, j0 / nt, sh); weightAt(p, w.reset()); w.finish(B.chest); ch.vert(p, en, sh, w) }
      ch.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }
  const e1: [number, number][] = [], e2: [number, number][] = [], e3: [number, number][] = [], e4: [number, number][] = []
  for (let i = 0; i <= ns; i++) { e1.push([i, 0]); e3.push([ns - i, nt]) }
  for (let j = 0; j <= nt; j++) { e2.push([ns, j]); e4.push([0, nt - j]) }
  rim(e1); rim(e3); rim(e2); rim(e4)
}
/** 金扣（扁圆顶 + 一圈边）：p 表面点、n 法线 */
function dome(ch: Chunk, p: V3, n: V3, r: number, h: number, seg: number, weightAt: (p: V3, acc: W4) => void) {
  const N = nrm(n), T = nrm(Math.abs(N[1]) < 0.9 ? cross([0, 1, 0], N) : cross([1, 0, 0], N)), Bt = cross(N, T)
  const sh = shade0(), w = new W4(), c = C3(0xc9a03c), rings = Math.max(3, Math.round(seg / 3))
  const base = ch.n
  for (let i = 0; i <= rings; i++) {
    const phi = (i / rings) * Math.PI / 2, rr = r * Math.cos(phi), hh = h * Math.sin(phi)
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a)
      const q = add(p, add(add(scl(T, ca * rr), scl(Bt, sa * rr)), scl(N, hh - h * 0.15)))
      const nn = nrm(add(add(scl(T, ca * Math.cos(phi) * h), scl(Bt, sa * Math.cos(phi) * h)), scl(N, Math.sin(phi) * r)))
      const k = 0.75 + 0.45 * Math.max(0, dot(nn, nrm([0.3, 0.8, 0.5]))) + (i === rings - 1 ? 0.1 : 0)
      sh.r = Math.min(1, c[0] * k); sh.g = Math.min(1, c[1] * k); sh.b = Math.min(1, c[2] * k); sh.rough = 0.3; sh.metal = 0.85; sh.fur = 0; sh.skin = 0; sh.cloth = 0; sh.wool = 0; sh.fx = 0; sh.fy = 0; sh.fz = 0
      weightAt(q, w.reset()); w.finish(B.chest)
      ch.vert(q, nn, sh, w)
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const a = base + i * seg + j, b = base + i * seg + ((j + 1) % seg); ch.idx.push(a, b, b + seg, a, b + seg, a + seg) }
  const top = ch.n; sh.r = Math.min(1, c[0] * 1.15); sh.g = Math.min(1, c[1] * 1.15); sh.b = Math.min(1, c[2] * 1.15); weightAt(p, w.reset()); w.finish(B.chest); ch.vert(add(p, scl(N, h * 0.85)), N, sh, w)
  for (let j = 0; j < seg; j++) ch.idx.push(base + rings * seg + j, base + rings * seg + ((j + 1) % seg), top)
}
/** 领口处制服表面的高度（沿半径 r 的方向 phi） */
function coatTopY(phi: number, r: number) {
  const x = NECK_HOLE.c[0] + Math.sin(phi) * r, z = NECK_HOLE.c[2] + Math.cos(phi) * r
  let lo = 1.38, hi = 1.62
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (coatSdf(x, m, z) < 0) lo = m; else hi = m }
  return lo
}
export const COLLAR = { r0: 0.074, r1: 0.068, topF: 1.54, topB: 1.558, gap0: 0.025, gap1: 0.19 }
function collarPoint(s: number, t: number): V3 {
  const gap = mix(COLLAR.gap0, COLLAR.gap1, t)
  const phi = mix(gap, Math.PI * 2 - gap, s)
  const bk = (1 - Math.cos(phi)) * 0.5
  const r = mix(COLLAR.r0, COLLAR.r1, t) + 0.003 * bk
  const y0 = coatTopY(phi, r) - 0.006, y1 = mix(COLLAR.topF, COLLAR.topB, bk)
  return [NECK_HOLE.c[0] + Math.sin(phi) * r, mix(y0, y1, t), NECK_HOLE.c[2] + Math.cos(phi) * r]
}
function buildShells(ch: Chunk, lod: number) {
  const q = lod ? 0.5 : 1, R = (n: number) => Math.max(4, Math.round(n * q))
  const white = (_p: V3, _s: number, t: number, o: Shade) => { const c = C3(0xece6d6); const k = 0.9 + 0.1 * t; o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k; o.rough = 0.85; o.metal = 0; o.fur = 0; o.skin = 0; o.cloth = 1; o.wool = 0; o.fx = 0; o.fy = 0; o.fz = 0 }
  // 白色高立领（前 V 开口，后高前低，上沿略收）
  shell(ch, collarPoint, R(48), R(5), () => 0.0045, white, (p, a) => { const k = sstep(1.5, 1.55, p[1]) * 0.22; a.add(B.chest, 1 - k); a.add(B.neck, k) })
  // 立领两颗金扣（V 口两侧）
  for (const sd of [1, -1]) {
    const t = 0.45, gap = mix(COLLAR.gap0, COLLAR.gap1, t), phi = sd > 0 ? gap + 0.32 : Math.PI * 2 - gap - 0.32
    const s = (phi - gap) / (Math.PI * 2 - 2 * gap), p = collarPoint(s, t), n: V3 = nrm([Math.sin(phi), 0.05, Math.cos(phi)])
    dome(ch, add(p, scl(n, 0.0024)), n, 0.0068, 0.004, lod ? 8 : 12, (pp, a) => { const k = sstep(1.5, 1.55, pp[1]) * 0.22; a.add(B.chest, 1 - k); a.add(B.neck, k) })
  }
  // 双排扣：两列各 6 颗
  const trunk = (p: V3, a: W4) => trunkW(p[0], p[1], a, 1)
  for (const y of BUTTON_ROWS) for (const sd of [1, -1]) {
    const x = sd * buttonX(y)
    const p = onSurface(coatSdf, [x, y, 0.2], 0)
    const e = 0.002, n = nrm([coatSdf(p[0] + e, p[1], p[2]) - coatSdf(p[0] - e, p[1], p[2]), coatSdf(p[0], p[1] + e, p[2]) - coatSdf(p[0], p[1] - e, p[2]), coatSdf(p[0], p[1], p[2] + e) - coatSdf(p[0], p[1], p[2] - e)])
    dome(ch, add(p, scl(n, 0.001)), n, 0.0085, 0.0048, lod ? 8 : 14, trunk)
  }
  // 翻袖口金扣
  for (const s of [1, -1]) {
    const { p, n } = cuffButton(s), S = s > 0 ? 'L' : 'R'
    dome(ch, add(p, scl(n, 0.001)), n, 0.0062, 0.0036, lod ? 8 : 12, (_p, a) => { a.add(B['foreArm' + S], 1) })
  }
}

// ---------- 发卡片：底层 SDF 发团之上，一层 alphaTest 卷发卡片（Canvas 程序生成的透明卷发簇贴图），双面、沿发流贴着发团弯曲 ----------
// 三层：A 成簇卷发（宽 3–4.5 cm，贴发团表面、发梢略离开表面 → 蓬松）；B 两鬓 / 后颈 / 帽口的翘起碎发（窄、发梢向外向上卷）；
// C 面盘外缘搭在面具上的几缕细发丝。卡片法线一律取发团 SDF 外法线（正反面同光，和发团同一明暗），哑光（Lambert / roughness 1）。
// 贴图 4 列：0–2 卷发簇（几绺 S 形卷、分叉碎梢、墨色暗边），3 细发丝。v：0 发根 → 1 发梢。
const HCOLS = 4
function buildHairCards(ch: Chunk, lod: number) {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = []
  let seed = 135135; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const P = ch.pos, N = ch.nrm
  const cRoot = C3(0x8a5122), cMid = C3(0xbb7d3a), cTip = C3(0xd8a35c)
  const e = 0.0015
  const grad = (q: V3): V3 => nrm([hairSdf(q[0] + e, q[1], q[2]) - hairSdf(q[0] - e, q[1], q[2]), hairSdf(q[0], q[1] + e, q[2]) - hairSdf(q[0], q[1] - e, q[2]), hairSdf(q[0], q[1], q[2] + e) - hairSdf(q[0], q[1], q[2] - e)])
  /** 面盘前方（包络内、面具背面之前）不许进；rimOK：外缘 1.4 cm 内允许（浮在面具正面前 4 mm） */
  const inFace = (q: V3, rimOK: boolean) => {
    const lx = q[0] - FACE_C[0], ly = q[1] - FACE_C[1], env = faceEnv(lx, ly)
    if (env > 0.002 || q[2] < maskBackZ(q[0], q[1]) - 0.004) return false
    if (rimOK && env > -0.014 && q[2] > maskRimFrontZ(q[0], q[1]) + 0.003) return false
    return true
  }
  /** 帽筒：推到帽筒外 */
  const hatPush = (q: V3): V3 => {
    const [hx, hy, hz, hr] = hatLocal(q[0], q[1], q[2])
    if (hy < -0.006 || hy > HAT.h + 0.012 || hr > HAT.r0 + 0.004) return q
    const k = (HAT.r0 + 0.005 - hr) / Math.max(hr, 1e-4)
    // 帽局部径向 → 模型空间（近似：帽倾角小，直接在 XZ 平面推）
    return [q[0] + hx * k, q[1], q[2] + hz * k]
  }
  interface Card { flip?: boolean; root: V3; dir: V3; L: number; W: number; lift: [number, number]; curl: number; axis: 'side' | 'out' | 'up'; csign: number; droop: number; col: number; tone: number; vi: number; ao: number; follow: number; rim?: boolean; ns: number; across: number }
  const card = (c: Card) => {
    const pts: V3[] = [c.root], outs: V3[] = []
    let p: V3 = c.root, d: V3 = c.dir
    const n0 = grad(p)
    for (let k = 1; k <= c.ns; k++) {
      const s = k / c.ns
      // 卷：绕侧向轴（在贴头切面里卷成 C / S）、或绕「向外 × 方向」（发梢向外 / 向上翘）
      const out = grad(p)
      let ax: V3 = c.axis === 'side' ? out : nrm(cross(d, out))
      if (c.axis === 'up') ax = scl(ax, -1)
      const ang = c.curl * c.csign * (Math.pow(s, 1.6) - Math.pow((k - 1) / c.ns, 1.6))
      d = nrm(add(add(scl(d, Math.cos(ang)), scl(cross(ax, d), Math.sin(ang))), [0, -c.droop / c.ns, 0]))
      let q = add(p, scl(d, c.L / c.ns))
      // 贴着发团：目标离表面 lift(s)（发根埋进去、发梢浮起来），发梢段逐渐放开
      const tgt = mix(c.lift[0], c.lift[1], Math.pow(s, 1.3)), dd = hairSdf(q[0], q[1], q[2]), fw = c.follow * (1 - sstep(0.55, 1.0, s) * 0.85)
      if (dd < tgt) q = add(q, scl(grad(q), (tgt - dd)))
      else if (dd < tgt + 0.035) q = add(q, scl(grad(q), -(dd - tgt) * fw * 0.8))
      q = hatPush(q)
      if (c.rim) { const fz = maskRimFrontZ(q[0], q[1]) + 0.004; const env = faceEnv(q[0] - FACE_C[0], q[1] - FACE_C[1]); if (env < 0.012 && q[2] < fz && q[2] > maskBackZ(q[0], q[1]) - 0.01) q = [q[0], q[1], fz] }
      if (inFace(q, !!c.rim)) break
      d = nrm(sub(q, p)); p = q; pts.push(q)
    }
    const n = pts.length
    if (n < 3) return 0
    for (let k = 0; k < n; k++) outs.push(nrm(add(scl(grad(pts[k]), 0.8), scl(n0, 0.2))))
    const base = pos.length / 3, A = c.across
    const u0 = c.col / HCOLS, du = 1 / HCOLS
    for (let k = 0; k < n; k++) {
      const s = k / (c.ns), dk = nrm(sub(pts[Math.min(n - 1, k + 1)], pts[Math.max(0, k - 1)])), o = outs[k]
      let b = cross(dk, o); b = lenv(b) > 1e-4 ? nrm(b) : nrm(cross(dk, [0, 0, 1]))
      const W = c.W * (1 - 0.25 * s)
      const cc = s < 0.5 ? cRoot.map((v, i) => mix(v, cMid[i], s * 2)) : cMid.map((v, i) => mix(v, cTip[i], Math.min(1, (s - 0.5) * 2)))
      const ao = c.ao * (0.62 + 0.38 * sstep(0, 0.55, s)) * c.tone
      for (let j = 0; j <= A; j++) {
        const t = j / A - 0.5, bulge = A > 1 ? (0.25 - t * t) * W * 0.5 : 0
        const q = add(add(pts[k], scl(b, t * W)), scl(o, bulge))
        pos.push(q[0], q[1], q[2]); nor.push(o[0], o[1], o[2]); uv.push(u0 + du * (0.02 + 0.96 * (c.flip ? 1 - j / A : j / A)), s)
        col.push(lin(Math.min(1, cc[0])) * ao, lin(Math.min(1, cc[1])) * ao, lin(Math.min(1, cc[2])) * ao)
        for (let qq = 0; qq < 4; qq++) { si.push(ch.si[c.vi * 4 + qq]); sw.push(ch.sw[c.vi * 4 + qq]) }
      }
    }
    const R = A + 1
    for (let k = 0; k < n - 1; k++) for (let j = 0; j < A; j++) { const a = base + k * R + j, b = a + 1, cc = a + R + 1, dd = a + R; idx.push(a, b, cc, a, cc, dd) }
    return (n - 1) * A * 2
  }
  // 发根候选：头发表面三角形按面积撒点
  const cand: { p: V3; n: V3; vi: number }[] = []
  for (const [i0, i1] of headTriRanges) for (let f = i0; f < i1; f += 3) {
    const a = ch.idx[f], b = ch.idx[f + 1], c = ch.idx[f + 2]
    if (ch.det[a * 4] < 0.5) continue
    const A: V3 = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], Bv: V3 = [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], Cv: V3 = [P[c * 3], P[c * 3 + 1], P[c * 3 + 2]]
    const area = 0.5 * lenv(cross(sub(Bv, A), sub(Cv, A)))
    const m: V3 = scl(add(add(A, Bv), Cv), 1 / 3)
    if (m[1] < 1.565) continue
    const n = nrm([N[a * 3] + N[b * 3] + N[c * 3], N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]])
    const [, hy, , hr] = hatLocal(m[0], m[1], m[2]); if (hr < HAT.r0 + 0.002 && hy > -0.01) continue
    if (m[2] > maskBackZ(m[0], m[1]) - 0.006 && faceEnv(m[0] - FACE_C[0], m[1] - FACE_C[1]) < 0.004) continue
    if (rnd() < area * 6000) cand.push({ p: m, n, vi: a })
  }
  for (let k = cand.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); const t = cand[k]; cand[k] = cand[j]; cand[j] = t }
  const pick = (minD: number, ok: (c: (typeof cand)[0]) => boolean, max = 1e9) => {
    const out: typeof cand = []
    for (const c of cand) { if (out.length >= max) break; if (ok(c) && out.every((r) => (r.p[0] - c.p[0]) ** 2 + (r.p[1] - c.p[1]) ** 2 + (r.p[2] - c.p[2]) ** 2 > minD * minD)) out.push(c) }
    return out
  }
  const tangentDown = (c: { p: V3; n: V3 }, lateral: number): V3 => {
    const [hx, hy, hz, hr] = hatLocal(c.p[0], c.p[1], c.p[2])
    // 帽口一圈：从帽口向外、向下翻出来；其余：顺发流往下（侧面略往后梳）
    const nearHat = sstep(HAT.r0 + 0.045, HAT.r0 + 0.01, hr) * sstep(-0.05, -0.01, hy)
    let want: V3 = add([0, -1, 0], scl(nrm([hx, 0, hz]), 1.4 * nearHat))
    if (c.p[2] > -0.02) want = add(want, [0, 0, -0.25 * sstep(0.04, 0.09, Math.abs(c.p[0]))])
    let t = sub(want, scl(c.n, dot(want, c.n))); t = lenv(t) > 1e-3 ? nrm(t) : nrm(cross(c.n, [1, 0, 0]))
    const sv = nrm(cross(c.n, t))
    return nrm(add(add(t, scl(sv, lateral)), scl(c.n, 0.08)))
  }
  let tris = 0
  // A：成簇卷发
  const rootsA = pick(lod ? 0.036 : 0.025, () => true)
  const nsA = lod ? 4 : 7, acA = lod ? 1 : 2
  for (const c of rootsA) {
    const top = c.p[1] > 1.765
    const side = sstep(0.06, 0.1, Math.abs(c.p[0])), nape = sstep(-0.04, -0.09, c.p[2]) * sstep(1.7, 1.62, c.p[1])
    tris += card({ root: add(c.p, scl(c.n, -0.003)), dir: tangentDown(c, (rnd() - 0.5) * 0.7), L: (top ? 0.036 + rnd() * 0.016 : 0.046 + rnd() * 0.024) * (1 + 0.12 * side + 0.1 * nape), W: lod ? 0.055 : 0.042 + rnd() * 0.014,
      lift: [-0.004, 0.005 + rnd() * 0.009 + 0.004 * (side + nape)], curl: 0.8 + rnd() * 1.4, axis: rnd() < 0.65 ? 'side' : 'up', csign: rnd() < 0.5 ? 1 : -1, droop: 0.15,
      col: Math.floor(rnd() * 3), flip: rnd() < 0.5, tone: 0.78 + rnd() * 0.38, vi: c.vi, ao: 0.92, follow: 1, ns: nsA, across: acA })
  }
  // B：两鬓 / 后颈 / 帽口外的翘起碎发
  const flyW = (c: (typeof cand)[0]) => { const x = Math.abs(c.p[0]); return (x > 0.07 && c.p[1] > 1.6 && c.p[1] < 1.78) || (c.p[2] < -0.05 && c.p[1] < 1.68) || (c.p[1] > 1.74 && x > 0.05) }
  const rootsB = pick(lod ? 0.04 : 0.026, flyW, lod ? 14 : 40)
  for (const c of rootsB) {
    tris += card({ root: add(c.p, scl(c.n, -0.002)), dir: tangentDown(c, (rnd() - 0.5) * 0.9), L: 0.04 + rnd() * 0.03, W: 0.016 + rnd() * 0.01,
      lift: [0.0, 0.012], curl: 1.5 + rnd() * 1.3, axis: 'up', csign: 1, droop: 0.05, flip: rnd() < 0.5, col: rnd() < 0.2 ? 3 : Math.floor(rnd() * 3), tone: 0.95 + rnd() * 0.15, vi: c.vi, ao: 1, follow: 0.5, ns: lod ? 4 : 8, across: lod ? 1 : 2 })
  }
  // C：面盘外缘搭在面具上的细发丝（发框里、包络外 0.5–2 cm、面盘中线以上到下颊）
  if (!lod) {
    const rimC = pick(0.022, (c) => { const lx = c.p[0] - FACE_C[0], ly = c.p[1] - FACE_C[1], env = faceEnv(lx, ly); return env > 0.004 && env < 0.022 && ly > -0.06 && ly < 0.1 && Math.abs(lx) > 0.03 && c.p[2] > maskBackZ(c.p[0], c.p[1]) - 0.03 }, 22)
    for (const c of rimC) {
      const lx = c.p[0] - FACE_C[0]
      // 顺着面盘外缘往下、往里搭一点
      const dir = nrm([-Math.sign(lx) * 0.35, -1, 0.35])
      tris += card({ root: add(c.p, scl(c.n, -0.002)), dir, L: 0.045 + rnd() * 0.03, W: 0.014 + rnd() * 0.008, lift: [0.0, 0.004], curl: 0.8 + rnd() * 0.8, axis: 'side', csign: rnd() < 0.5 ? 1 : -1, droop: 0.2,
        col: 3, tone: 1.0, vi: c.vi, ao: 1, follow: 0.3, rim: true, ns: 7, across: 1 })
    }
  }
  void tris
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); geo.setIndex(idx)
  return geo
}
let hairTex: THREE.Texture | null = null
/** 卷发卡片贴图（512²，4 列 × 128 px）：列 0–2 = 几绺 S 形卷发簇（发根铺满、发梢长短不一并分叉成细梢、每绺一侧墨色暗边 + 绺内细发丝），
 *  列 3 = 细发丝。RGB 暖灰白（乘顶点姜黄色），alpha 0 / 1（alphaTest）。flipY = false：v = 0 在画布顶（发根） */
function hairTexture() {
  if (hairTex || typeof document === 'undefined') return hairTex
  const S = 512, SW = 1024, CW = SW / HCOLS, c = document.createElement('canvas'); c.width = SW; c.height = S; const g = c.getContext('2d')!
  let seed = 99; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  g.clearRect(0, 0, SW, S); g.lineCap = 'round'; g.lineJoin = 'round'
  // 发绺中线：根部略波浪，后半段向一侧弯成钩（C 形卷梢）；hook > 0 向右卷，梢尖再往回勾一点
  const curve = (cx: number, len: number, amp: number, fr: number, ph: number, drift: number, hook = 0) => {
    const pts: [number, number][] = []
    for (let i = 0; i <= 48; i++) {
      const t = i / 48, hk = sstep(0.35, 1, t), back = sstep(0.85, 1, t)
      pts.push([cx + amp * Math.sin(Math.PI * 2 * fr * t + ph) * (0.3 + 0.7 * t) * (1 - hk) + drift * t + hook * hk * hk, t * len - Math.abs(hook) * 0.45 * back * back])
    }
    return pts
  }
  const ribbon = (x0: number, pts: [number, number][], hw: (t: number) => number, off = 0) => {
    const L: [number, number][] = [], R: [number, number][] = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1
      const nx = dy / l, ny = -dx / l, w = hw(i / (pts.length - 1))
      L.push([x0 + pts[i][0] + nx * (w + off), pts[i][1] + ny * (w + off)]); R.push([x0 + pts[i][0] - nx * (w - off), pts[i][1] - ny * (w - off)])
    }
    return { L, R }
  }
  const poly = (L: [number, number][], R: [number, number][]) => { g.beginPath(); g.moveTo(L[0][0], L[0][1]); for (const p of L) g.lineTo(p[0], p[1]); for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]); g.closePath() }
  const line = (x0: number, pts: [number, number][], dx: number, t1: number) => { g.beginPath(); const n = Math.round(t1 * (pts.length - 1)); g.moveTo(x0 + pts[0][0] + dx, pts[0][1]); for (let i = 1; i <= n; i++) g.lineTo(x0 + pts[i][0] + dx * (1 - i / pts.length * 0.8), pts[i][1]); g.stroke() }
  const tone = (v: number, a = 1) => `rgba(${Math.round(v)},${Math.round(v * 0.94)},${Math.round(v * 0.86)},${a})`
  for (let col = 0; col < HCOLS; col++) {
    const x0 = col * CW
    g.save(); g.beginPath(); g.rect(x0, 0, CW, S); g.clip()
    const thin = col === 3
    const nL = thin ? 6 : 3 + (col === 1 ? 1 : 0)
    for (let k = 0; k < nL; k++) {
      const back = k % 2 === 1 // 交替前后层（后层略暗），绺与绺之间有重叠
      const cx = thin ? 30 + rnd() * 196 : 20 + ((k + 0.25 + rnd() * 0.5) / nL) * 216, len = S * (thin ? 0.7 + rnd() * 0.28 : 0.62 + rnd() * 0.34)
      const hook = (rnd() < 0.5 ? -1 : 1) * (thin ? 30 + rnd() * 40 : 60 + rnd() * 60)
      const amp = thin ? 10 + rnd() * 14 : 6 + rnd() * 10, fr = 0.7 + rnd() * 0.6, ph = rnd() * 6.28, drift = (rnd() - 0.5) * (thin ? 50 : 30)
      const w0 = thin ? 4 + rnd() * 3 : 70 + rnd() * 24
      const y0 = thin ? 0 : rnd() * S * 0.06, pts = curve(cx, len, amp, fr, ph, drift, hook).map(([x, y]) => [x, y + y0] as [number, number])
      const r0k = 0.45 + rnd() * 0.25, hw = (t: number) => w0 * 0.5 * Math.pow(Math.max(0, 1 - t), 0.75) * (thin ? 1 : r0k + (1.15 - r0k) * sstep(0, 0.14, t)) + 1
      const base = (back ? 176 : 212) + rnd() * 28
      if (!thin) {
        // 发绺：圆柱明暗（由宽到窄几层，边暗中亮、亮带偏向卷外侧）+ 内侧墨色暗边；发根段整体压暗（埋在下一层发里）
        const sg = Math.sign(hook)
        const { L, R } = ribbon(x0, pts, hw)
        const grad = g.createLinearGradient(0, 0, 0, len); grad.addColorStop(0, tone(base * 0.7)); grad.addColorStop(0.3, tone(base * 0.9)); grad.addColorStop(1, tone(base))
        poly(L, R); g.fillStyle = grad; g.fill()
        for (const [k2, off, a2] of [[0.7, 0.1, 0.35], [0.45, 0.22, 0.4], [0.22, 0.32, 0.45]] as const) {
          const r3 = ribbon(x0, pts, (t) => hw(t) * k2, sg * off * w0 * 0.5); poly(r3.L, r3.R); g.fillStyle = tone(Math.min(252, base * 1.14), a2); g.fill()
        }
        const edge = sg > 0 ? R : L
        g.strokeStyle = 'rgba(70,42,22,0.9)'; g.lineWidth = 3; g.beginPath(); g.moveTo(edge[0][0], edge[0][1]); for (const p of edge) g.lineTo(p[0], p[1]); g.stroke()
        // 绺内几根细发丝（轻）
        for (let j = 0; j < 4; j++) { g.strokeStyle = tone(rnd() < 0.5 ? base * 1.12 : base * 0.76, 0.5); g.lineWidth = 1.2; line(x0, pts, (rnd() - 0.5) * w0 * 0.55, 0.5 + rnd() * 0.4) }
        // 梢分叉：一两根细梢从绺尖附近岔出去（往卷的反方向）
        const nT = 1 + Math.floor(rnd() * 2)
        for (let j = 0; j < nT; j++) {
          const i0 = Math.floor((0.55 + rnd() * 0.2) * 48), p0 = pts[i0], tl = len * (0.18 + rnd() * 0.16)
          const tp = curve(0, tl, 3 + rnd() * 5, 0.6 + rnd() * 0.6, rnd() * 6, -sg * (10 + rnd() * 20), -sg * (8 + rnd() * 16)).map(([x, y]) => [x + p0[0], y + p0[1]] as [number, number])
          const r2 = ribbon(x0, tp, (t) => 5 * Math.pow(1 - t, 0.9) + 0.8); poly(r2.L, r2.R); g.fillStyle = tone(base * 0.95); g.fill()
        }
      } else {
        const { L, R } = ribbon(x0, pts, hw); poly(L, R); g.fillStyle = tone(base + 10); g.fill()
        g.strokeStyle = 'rgba(80,50,28,0.8)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(R[0][0], R[0][1]); for (const p of R) g.lineTo(p[0], p[1]); g.stroke()
      }
    }
    // 零星飞出的单根发丝
    for (let k = 0; k < (thin ? 3 : 1); k++) {
      const pts = curve(30 + rnd() * 196, S * (0.5 + rnd() * 0.4), 10 + rnd() * 16, 0.8 + rnd(), rnd() * 6, (rnd() - 0.5) * 60, (rnd() - 0.5) * 80)
      const { L, R } = ribbon(x0, pts, (t) => 2.4 * (1 - t) + 0.9); poly(L, R); g.fillStyle = tone(200 + rnd() * 40); g.fill()
    }
    g.restore()
  }
  // alpha 二值化（alphaTest 下边缘干净），颜色加一点纸纹颗粒
  const img = g.getImageData(0, 0, SW, S), D = img.data; let s2 = 7
  for (let k = 0; k < D.length; k += 4) { s2 = (s2 * 16807) % 2147483647; const nn = (s2 / 2147483647 - 0.5) * 16; D[k] += nn; D[k + 1] += nn; D[k + 2] += nn; D[k + 3] = D[k + 3] > 110 ? 255 : 0 }
  g.putImageData(img, 0, 0)
  hairTex = new THREE.CanvasTexture(c); hairTex.colorSpace = THREE.SRGBColorSpace; hairTex.anisotropy = 4; hairTex.flipY = false
  return hairTex
}

// ---------- 几何缓存 ----------
interface Built { body: THREE.BufferGeometry; hair: THREE.BufferGeometry; stats: Record<string, number> }
const cache: Record<number, Built> = {}
export function buildBellhopGeometry(lod = 0): Built {
  if (cache[lod]) return cache[lod]
  const t0 = performance.now(), stats: Record<string, number> = {}
  const ch = new Chunk()
  lodNow = lod; headTriRanges = []
  const order = parts().sort((a, b) => (a.name === 'head' ? 1 : 0) - (b.name === 'head' ? 1 : 0))
  for (const p of order) bakePart(ch, p, lod, stats)
  const t1 = performance.now()
  buildShells(ch, lod)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(ch.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(ch.nrm, 3))
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(ch.flow, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(ch.col, 3)); g.setAttribute('aDet', new THREE.Float32BufferAttribute(ch.det, 4)); g.setAttribute('aRM', new THREE.Float32BufferAttribute(ch.rm, 2))
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(ch.si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(ch.sw, 4))
  g.setIndex(ch.n > 65535 ? new THREE.Uint32BufferAttribute(ch.idx, 1) : new THREE.Uint16BufferAttribute(ch.idx, 1))
  g.computeBoundingSphere(); g.boundingSphere!.radius *= 1.3
  const hair = buildHairCards(ch, lod); hair.computeBoundingSphere(); hair.boundingSphere!.radius = g.boundingSphere!.radius; hair.boundingSphere!.center.copy(g.boundingSphere!.center)
  stats.hairTris = hair.index!.count / 3
  stats.bodyTris = ch.idx.length / 3
  stats.sdf_ms = Math.round(t1 - t0); stats.ms = Math.round(performance.now() - t0)
  return (cache[lod] = { body: g, hair, stats })
}

// ---------- 材质（与看门人同一套着色思路：三平面细节 + 毛流笔触）----------
let detailTex: THREE.Texture | null = null
function detailTexture() {
  if (detailTex || typeof document === 'undefined') return detailTex
  const S = 256, c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d')!
  const img = g.createImageData(S, S), D = img.data
  let seed = 9; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const G = new Float32Array(S * S).fill(0.5)
  for (let k = 0; k < 1500; k++) { const x = Math.floor(rnd() * S), y = Math.floor(rnd() * S); G[y * S + x] = 0.3; G[y * S + ((x + 1) % S)] = 0.4 }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x
    G[i] += 0.08 * Math.sin((x + y * 0.3) * 0.35) * Math.sin(y * 0.11)
    const weave = 0.5 + 0.22 * Math.sin(x * Math.PI / 2) * Math.sin(y * Math.PI / 2) + 0.1 * (rnd() - 0.5)
    const twill = 0.5 + 0.2 * Math.sin((x + y) * Math.PI / 3) + 0.08 * (rnd() - 0.5)
    D[i * 4] = 128; D[i * 4 + 1] = clamp(G[i], 0, 1) * 255; D[i * 4 + 2] = clamp(weave, 0, 1) * 255; D[i * 4 + 3] = clamp(twill, 0, 1) * 255
  }
  g.putImageData(img, 0, 0)
  detailTex = new THREE.CanvasTexture(c); detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping; detailTex.premultiplyAlpha = false; detailTex.colorSpace = THREE.NoColorSpace
  return detailTex
}
let strokeTex: THREE.Texture | null = null
function hairStrokeTexture() {
  if (strokeTex || typeof document === 'undefined') return strokeTex
  const S = 256, c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d')!
  const img = g.createImageData(S, S), D = img.data, R = new Float32Array(S * S).fill(0.5)
  let seed = 31; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let k = 0; k < 3000; k++) {
    const x0 = rnd() * S, y0 = rnd() * S, L = 14 + rnd() * 26, v = rnd() < 0.5 ? 0.15 + rnd() * 0.15 : 0.7 + rnd() * 0.25, bend = (rnd() - 0.5) * 0.08, wdt = 1 + rnd() * 0.8
    for (let t = 0; t < L; t++) {
      const x = x0 + bend * t * t * 0.1, y = y0 + t, a = 0.55 * (1 - Math.pow(t / L, 2))
      for (let dx = -1; dx <= 1; dx++) {
        const w = Math.max(0, 1 - Math.abs(dx - (x - Math.floor(x)) + 0.5) / wdt)
        const xi = ((Math.floor(x) + dx) % S + S) % S, yi = ((Math.floor(y)) % S + S) % S
        R[yi * S + xi] = mix(R[yi * S + xi], v, a * w)
      }
    }
  }
  for (let i = 0; i < S * S; i++) { const q = clamp(R[i], 0, 1) * 255; D[i * 4] = q; D[i * 4 + 1] = q; D[i * 4 + 2] = q; D[i * 4 + 3] = 255 }
  g.putImageData(img, 0, 0)
  strokeTex = new THREE.CanvasTexture(c); strokeTex.wrapS = strokeTex.wrapT = THREE.RepeatWrapping; strokeTex.colorSpace = THREE.NoColorSpace
  return strokeTex
}
let bodyMat: THREE.Material | null = null, hairMat: THREE.Material | null = null
function materials() {
  if (bodyMat && hairMat) return { bodyMat, hairMat }
  const m = litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.8 })
  const tex = detailTexture(), ftex = hairStrokeTexture()
  const prev = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey()
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r)
    sh.uniforms.cDetail = { value: tex }
    sh.uniforms.cDetailOn = { value: tex ? 1 : 0 }
    sh.uniforms.cFur = { value: ftex }
    sh.vertexShader = 'attribute vec4 aDet;\nattribute vec2 aRM;\nattribute vec3 aFlow;\nvarying vec4 vCDet;\nvarying vec2 vCRM;\nvarying vec3 vCBP;\nvarying vec3 vCBN;\nvarying vec3 vCFlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCDet = aDet; vCRM = aRM; vCBP = position; vCBN = normal; vCFlow = aFlow;')
    sh.fragmentShader = 'uniform sampler2D cDetail;\nuniform sampler2D cFur;\nuniform float cDetailOn;\nvarying vec4 vCDet;\nvarying vec2 vCRM;\nvarying vec3 vCBP;\nvarying vec3 vCBN;\nvarying vec3 vCFlow;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
      if (cDetailOn > 0.5) {
        vec3 bw = pow(abs(normalize(vCBN)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z + 1e-5);
        vec3 pA = vCBP * 16.0, pB = vCBP * 46.0;
        vec4 sA = texture2D(cDetail, pA.zy) * bw.x + texture2D(cDetail, pA.xz) * bw.y + texture2D(cDetail, pA.xy) * bw.z;
        vec4 sB = texture2D(cDetail, pB.zy) * bw.x + texture2D(cDetail, pB.xz) * bw.y + texture2D(cDetail, pB.xy) * bw.z;
        float furT = 0.0;
        if (dot(vCFlow, vCFlow) > 0.04) {
          vec3 Nn = normalize(vCBN); vec3 Tf = vCFlow - Nn * dot(vCFlow, Nn);
          if (dot(Tf, Tf) > 1e-4) {
            Tf = normalize(Tf); vec3 Bf = cross(Nn, Tf);
            vec2 fu = vec2(dot(vCBP, Bf), dot(vCBP, Tf)) * 5.0;
            float f1 = texture2D(cFur, fu).r, f2 = texture2D(cFur, fu * 2.37 + vec2(0.31, 0.17)).r;
            furT = (f1 - 0.5) * 0.9 + (f2 - 0.5) * 0.45;
          }
        }
        float dt = vCDet.x * furT + vCDet.y * (sB.g - 0.5) * 0.2 + vCDet.z * ((sB.b - 0.5) * 0.25 + (sA.b - 0.5) * 0.1) + vCDet.w * (sA.a - 0.5) * 0.3;
        diffuseColor.rgb *= 1.0 + dt;
      }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        // 金扣 / 皮鞋：经典 Lambert 模式也给一道随视角的高光
        float shine = clamp((0.42 - vCRM.x) / 0.2, 0.0, 1.0);
        if (shine > 0.0) { vec3 Vv = normalize(vViewPosition); vec3 Hh = normalize(normalize(vec3(0.35, 0.62, 0.7)) + Vv); totalEmissiveRadiance += shine * mix(0.35, 0.8, vCRM.y) * pow(max(dot(normal, Hh), 0.0), 34.0) * mix(vec3(0.9, 0.92, 1.0), vec3(1.0, 0.85, 0.5), vCRM.y); }
      }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vCRM.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vCRM.y;')
  }
  m.customProgramCacheKey = () => key + '|bellhop-v1'
  bodyMat = m
  const ht = hairTexture()
  const hm = litMaterial({ color: '#ffffff', vertexColors: true, map: ht ?? undefined, roughness: 1, alphaTest: 0.5, side: THREE.DoubleSide })
  // 双面同光：背面不翻法线（卡片法线 = 发团外法线）
  const hprev = hm.onBeforeCompile.bind(hm), hkey = hm.customProgramCacheKey()
  hm.onBeforeCompile = (sh, r) => { hprev(sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n#ifndef FLAT_SHADED\nnormal = normalize(vNormal);\n#endif') }
  hm.customProgramCacheKey = () => hkey + '|bellhop-hair2'
  hairMat = hm
  return { bodyMat, hairMat }
}

// ---------- 装配 ----------
export interface BArm { side: number; clav: THREE.Bone; shoulder: THREE.Bone; elbow: THREE.Bone; wrist: THREE.Bone; fingers: Record<'thumb' | 'index' | 'middle' | 'ring' | 'pinky', THREE.Bone[]> }
export interface BLeg { side: number; hip: THREE.Bone; knee: THREE.Bone; ankle: THREE.Bone; toe: THREE.Bone }
export interface BellhopRig {
  root: THREE.Bone; hips: THREE.Bone; spine: THREE.Bone; chest: THREE.Bone; neck: THREE.Bone; head: THREE.Bone
  armL: BArm; armR: BArm; legL: BLeg; legR: BLeg
  /** 面盘组（挂 head 骨）：disc + eyes 两个网格；faceIndex = 当前脸 */
  face: THREE.Group; faceDisc: THREE.Mesh; faceEyes: THREE.Mesh; faceIndex: number
  hat: THREE.Group
  bell: THREE.Group; cup: THREE.Group; saucer: THREE.Group; tag: THREE.Group; cart: THREE.Group
  bones: Record<string, THREE.Bone>; body: THREE.SkinnedMesh; hairMesh: THREE.SkinnedMesh; lod: number
}

/** 换脸（0 仓鸮 / 1 雪鸮 / 2 角鸮 / 3 长耳鸮 / 4 草鸮 / 5 乌林鸮 / 6 灰林鸮 / 7 纵纹腹小鸮）。group = buildBellhopMesh() 的返回值或其 rig */
export function setBellhopFace(group: THREE.Object3D | BellhopRig, i: number) {
  const rig = ((group as THREE.Object3D).isObject3D ? (group as THREE.Object3D).userData.bellhop : group) as BellhopRig
  const k = ((Math.round(i) % N_FACES) + N_FACES) % N_FACES
  const g = buildFaceGeometry(k, rig.lod), m = faceMaterials(k)
  rig.faceDisc.geometry = g.disc; rig.faceDisc.material = m.disc
  rig.faceEyes.geometry = g.eyes; rig.faceEyes.material = m.eyes
  rig.faceIndex = k
  return k
}

/** 造一个行李员实例（几何 / 材质按 LOD 共享缓存；骨骼每实例一套）。opts.face：初始脸（默认 0 仓鸮） */
export function buildBellhopMesh(opts: { lod?: number; face?: number } = {}): THREE.Group {
  const lod = opts.lod ?? 0
  const geo = buildBellhopGeometry(lod)
  const { bodyMat, hairMat } = materials()
  shareHotelRigAssets({ ...geo, bodyMat, hairMat })
  const face = new THREE.Group(); face.name = 'bellhop'; face.rotation.y = Math.PI / 2; face.userData.facesZ = 1
  const bones: THREE.Bone[] = []
  for (const d of BONES) {
    const b = new THREE.Bone(); b.name = d.name
    const pp = d.parent >= 0 ? BONES[d.parent].pos : [0, 0, 0]
    b.position.set(d.pos[0] - pp[0], d.pos[1] - pp[1], d.pos[2] - pp[2])
    if (d.flex) b.userData.flexAxis = new THREE.Vector3(...d.flex)
    if (d.parent >= 0) bones[d.parent].add(b)
    bones.push(b)
  }
  face.add(bones[0])
  const body = new THREE.SkinnedMesh(geo.body, bodyMat); body.name = 'bellhopBody'; body.castShadow = true; body.receiveShadow = true
  const hairMesh = new THREE.SkinnedMesh(geo.hair, hairMat); hairMesh.name = 'bellhopHair'; hairMesh.castShadow = false // 发片自投影会在发团上留下一块块黑斑
  face.add(body, hairMesh)
  face.updateMatrixWorld(true)
  const skel = new THREE.Skeleton(bones)
  body.bind(skel, body.matrixWorld); hairMesh.bind(skel, hairMesh.matrixWorld)
  for (const b of bones) b.userData.rest = { p: b.position.clone(), q: b.quaternion.clone() }
  const bn: Record<string, THREE.Bone> = {}; for (const d of BONES) bn[d.name] = bones[B[d.name]]
  const arm = (s: number): BArm => {
    const S = s > 0 ? 'L' : 'R'
    const fingers = {} as BArm['fingers']
    for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky'] as const) fingers[f] = [1, 2, 3].map((k) => bn[f + k + S])
    return { side: s, clav: bn['clav' + S], shoulder: bn['upperArm' + S], elbow: bn['foreArm' + S], wrist: bn['hand' + S], fingers }
  }
  const leg = (s: number): BLeg => { const S = s > 0 ? 'L' : 'R'; return { side: s, hip: bn['thigh' + S], knee: bn['shin' + S], ankle: bn['foot' + S], toe: bn['toe' + S] } }
  // 面盘 + 帽（刚性，挂 head 骨）
  const head = bn.head
  const fg = new THREE.Group(); fg.name = 'bellhopFace'; fg.position.set(FACE_C[0] - J.head[0], FACE_C[1] - J.head[1], FACE_C[2] - J.head[2]); head.add(fg)
  const faceDisc = new THREE.Mesh(undefined, undefined); faceDisc.name = 'faceDisc'; faceDisc.castShadow = true
  const faceEyes = new THREE.Mesh(undefined, undefined); faceEyes.name = 'faceEyes'
  fg.add(faceDisc, faceEyes)
  const hat = buildHat(lod); hat.position.sub(new THREE.Vector3(...J.head)); head.add(hat)
  // 道具（默认隐藏）
  const FR = HANDS[-1].F, FL = HANDS[1].F
  const at = (F: typeof FR, s: number, ta: number, tr: number, td: number) => { const p = sub(add(F.o, add(add(scl(F.a, ta), scl(F.r, tr)), scl(F.d, td))), side(J.wrist, s)); return new THREE.Vector3(p[0], p[1], p[2]) }
  // 朝向：道具局部 +Y 对到手部坐标系的某个方向（静止姿态 = 绑定空间）
  const up = (o: THREE.Object3D, d: V3) => o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...nrm(d)))
  // 铃：握在拳里，柄沿拇指方向（拳头朝前时铃口朝下）
  const bell = buildBellhopBell(); bell.visible = false; bn.handR.add(bell); bell.position.copy(at(FR, -1, 0.075, 0.0, -0.03)); up(bell, FR.r)
  const tea = buildBellhopTea()
  // 茶杯：拇指 / 食指捏住杯把，杯口朝拇指方向；茶碟：平托在左手掌心
  const cup = tea.cup; cup.visible = false; bn.handR.add(cup); up(cup, FR.r); cup.position.copy(at(FR, -1, 0.115, -0.025, -0.065))
  const saucer = tea.saucer; saucer.visible = false; bn.handL.add(saucer); up(saucer, scl(FL.d, -1)); saucer.position.copy(at(FL, 1, 0.075, 0.0, -0.016))
  const tag = buildBellhopTag(135); tag.visible = false; bn.handL.add(tag); up(tag, scl(FL.d, -1)); tag.position.copy(at(FL, 1, 0.15, 0.03, -0.012))
  const cart = buildBellhopCart(); cart.visible = false; bones[0].add(cart); cart.position.set(0.05, 0, 0.75)
  const rig: BellhopRig = {
    root: bones[0], hips: bn.hips, spine: bn.spine, chest: bn.chest, neck: bn.neck, head,
    armL: arm(1), armR: arm(-1), legL: leg(1), legR: leg(-1),
    face: fg, faceDisc, faceEyes, faceIndex: 0, hat, bell, cup, saucer, tag, cart, bones: bn, body, hairMesh, lod,
  }
  face.userData.bellhop = rig
  setBellhopFace(rig, opts.face ?? 0)
  const fgeo = buildFaceGeometry(rig.faceIndex, lod)
  face.userData.bellhopStats = { ...geo.stats, faceTris: fgeo.tris }
  return face
}

/** 三角形统计（不含默认隐藏的道具）：tris = 本体 + 面盘 + 帽，hair = 发片 */
export function bellhopTris(o: THREE.Object3D) {
  let t = 0, n = 0, hair = 0
  o.traverse((m) => { const x = m as THREE.Mesh; if (!x.isMesh || x.userData.cpuSkin) return; let vis = true; for (let p: THREE.Object3D | null = x; p && p !== o; p = p.parent) if (!p.visible) vis = false; if (!vis) return; n++; const g = x.geometry, k = (g.index ? g.index.count : g.attributes.position.count) / 3; if (x.name === 'bellhopHair') hair += k; else t += k })
  return { tris: Math.round(t), meshes: n, hair: Math.round(hair) }
}
void dot
