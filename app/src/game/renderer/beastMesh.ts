import {requestHotelGeometry} from './hotelGeometryQueue'
import {unpackGeometryTree} from './geometryPacket'
import { shareHotelRigAssets } from './shared'
// [beast] 第五层的野兽（Entity 18 / The Beast of Level 5）重制·阶段 1 建模（只建模，不做动画 / 机制）。
// 参照 ZAN 附图：瘦高 1.95 m 的绅士——近黑带酒红底的单排扣西装、白衬衫、黑细领带、黑西裤皮鞋，苍白细长的手上 3 枚戒指（金 / 暗绿宝石）；
// 头是墨鱼：外套膜向上后方拉长、两侧波浪鳍，两侧大眼 W 形瞳孔，色素细胞斑点 + 湿润高光 + 青绿虹彩；
// 口周 8 条腕 + 2 条长触腕垂到衬衫领口、末端卷曲像胡子。
// v2（ZAN 修改意见）：老板体型（beastRig.warpBH：宽肩厚胸、略有将军肚、腿加粗、手 ×1.12）、戗驳领 + 象牙白口袋巾；
// 两眼收窄前移；触须加长加粗垂到胸口中部；绅士头部无缝、真身另一套带缝头部网格（setBeastForm 切换）。
//
// 做法（沿用行李员 / 看门人）：
//   · 身体部件（西装 + 衬衫 + 领带 / 西裤 / 皮鞋 / 手）写成 SDF，在「行李员空间」里求值（复用行李员的人体部件与权重），
//     窄带 Surface Nets 提取 → QEM 减面 → 投影回等值面 → 顶点 ×K 放到野兽空间；顶点色 = 区域色 × SDF 环境光遮蔽。
//     前臂袖 + 衬衫袖口、领口（V 口上段 / 领带结 / 驳头缺口）用细格单独提取（重叠带拼接）。
//   · 墨鱼头（beastHead）直接在野兽空间提取，和身体同一张 SkinnedMesh（1 次绘制）。
//   · 触须是扫掠管（独立 SkinnedMesh，带 UV 与吸盘贴图），眼球 / 喙是挂骨骼的刚性网格，衬衫领 / 扣子 / 戒指是小网格（并进身体）。
//   · 材质：litMaterial + 三平面细节 + 「色素皮肤」补丁（色素细胞斑点、色素波纹、湿润高光、青绿虹彩，全部走 BEAST_CHROMA 统一变量，
//     阶段 2 只要改 uniform 就能做色素波纹 / 变色 / 恼怒闪色）。
// 坐标：按 +Z 正面建造、地面 y=0；外层组 rotation.y = π/2（userData.facesZ = 1，与看门人 / 行李员同约定）。
// 形态：buildBeast({ form: 'true' }) 或 setBeastForm(rig, 0..1)：外套膜两半绕背侧铰链掀开露喙、两条触腕拉长到 2.3–2.6 m、
//       西装背部鼓起、腿 / 躯干 / 外套膜拉长到约 2.4 m（全部是骨骼变换，阶段 2 的 reveal 可以直接插值）。
// 无头 SwiftShader 画 GPU 蒙皮会崩：预览 / 截图带 ?cpu=1（qaCpuSkin）。
import * as THREE from 'three'
import { litMaterial } from './shared'
import { decimate, extract, reproject, sdfAO, clamp, mix, sstep, gauss, type Sdf, type Surf } from './conciergeSdf'
import type { Shade } from './conciergeHead'
import { BONES, B, BH_HAND, J, MANTLE, EYE, N_TENT_BONES, TENTS, W4, add, cross, dot, nrm, scl, sub, lenv, tentBone, setTentacleBonePositions, eyeC, warpBH, warpN, bhSdfW, type V3 } from './beastRig'
import { pantsSdf, PANTS_BOX, legWeights, shoeSdf, shoeBox, shoeWeights, handSdf, handBox, handKeep, handWeights, trunkW, ARM } from './bellhopBody'
import {
  bodySdf, BODY_BOX, bodyShade, bodyWeights, foreSleeveRegion, foreSleeveBox, SLEEVE_BAND, collarRegion, COLLAR_BOX, JHEM, BTN_Y, NECK_HOLE, VEST_BTN_Y, VEST_ON, shirtSdf,
  pantsShadeB, shoeShadeB, handShadeB, shirtFrontZ, jacketSdf, JCUFF_T, onSurface,
} from './beastBody'
import { headPartSdf, HEAD_BOX, headShade, headWeights, tentaclePaths, tentacleBonePts, buildTentacleGeometry, buildEyeGeometry, eyeQuat, buildBeakGeometry, setHeadLod, setHeadVariant, clearSdf } from './beastHead'
import { buildBeastContract, buildBeastPen } from './beastProps'

// ---------- 顶点块 ----------
class Chunk {
  pos: number[] = []; nrm: number[] = []; col: number[] = []; det: number[] = []; rm: number[] = []; si: number[] = []; sw: number[] = []; idx: number[] = []
  get n() { return this.pos.length / 3 }
  vert(p: ArrayLike<number>, n: ArrayLike<number>, s: Shade, w: W4, ao = 1) {
    this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2])
    this.col.push(lin(s.r) * ao, lin(s.g) * ao, lin(s.b) * ao); this.det.push(s.fur, s.skin, s.cloth, s.wool); this.rm.push(s.rough, s.metal)
    this.si.push(w.i[0], w.i[1], w.i[2], w.i[3]); this.sw.push(w.w[0], w.w[1], w.w[2], w.w[3])
  }
}
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const shade0 = (): Shade => ({ r: 1, g: 1, b: 1, rough: 0.8, metal: 0, fur: 0, skin: 0, cloth: 0, wool: 0, fx: 0, fy: 0, fz: 0 })
const C3 = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]

// ---------- SDF 部件 ----------
interface Part {
  name: string; sdf: Sdf; box: { min: [number, number, number]; max: [number, number, number] }; h: [number, number]; target?: [number, number]
  /** 部件坐标 → 野兽空间：0 = 已在野兽空间（头）；1 = 行李员空间（warpBH 体型形变）；hs = 该侧手放大（手 / 前臂袖） */
  k: number; hs?: number
  keep?: (x: number, y: number, z: number) => boolean; within?: (x: number, y: number, z: number) => boolean; shade: (x: number, y: number, z: number, o: Shade) => void; weights: (x: number, y: number, z: number, acc: W4) => void
  ao?: Sdf; aoScale?: number
}
let lodNow = 0
function parts(): Part[] {
  const out: Part[] = []
  const lod = lodNow
  // 墨鱼头（野兽空间）
  // 身体（西装 + 衬衫 + 领带）：粗格，避开前臂袖 / 领口两个细格区
  const outSleeve = (x: number, y: number, z: number, slack: number) => foreSleeveRegion(1, x, y, z) > -SLEEVE_BAND - slack && foreSleeveRegion(-1, x, y, z) > -SLEEVE_BAND - slack
  const outCollar = (x: number, y: number, z: number, slack: number) => collarRegion(x, y, z) > -SLEEVE_BAND - slack
  out.push({ name: 'jacket', k: 1, sdf: bodySdf, box: BODY_BOX, h: [0.0098, 0.017], target: [8000, 2250], keep: (x, y, z) => outSleeve(x, y, z, 0) && outCollar(x, y, z, 0), within: (x, y, z) => outSleeve(x, y, z, lod ? 0.03 : 0.02) && outCollar(x, y, z, lod ? 0.03 : 0.02), shade: bodyShade, weights: bodyWeights, aoScale: 0.018 })
  out.push({ name: 'collar', k: 1, sdf: bodySdf, box: COLLAR_BOX, h: [0.0045, 0.01], target: [5200, 1250], keep: (x, y, z) => collarRegion(x, y, z) < 0, within: (x, y, z) => collarRegion(x, y, z) < 0.012, shade: bodyShade, weights: bodyWeights, aoScale: 0.01 })
  for (const s of [1, -1]) out.push({ name: 'sleeve' + (s > 0 ? 'L' : 'R'), k: 1, hs: s, sdf: bodySdf, box: foreSleeveBox(s), h: [0.0048, 0.0058], target: [1650, 600], keep: (x, y, z) => foreSleeveRegion(s, x, y, z) < 0, within: (x, y, z) => foreSleeveRegion(s, x, y, z) < 0.01, shade: bodyShade, weights: bodyWeights, aoScale: 0.01 })
  out.push({ name: 'pants', k: 1, sdf: pantsSdf, box: PANTS_BOX, h: [0.0085, 0.017], target: [3300, 1100], keep: (_x, y, z) => y < JHEM(z) + 0.04, within: (_x, y, z) => y < JHEM(z) + 0.07, shade: pantsShadeB, weights: legWeights, aoScale: 0.02, ao: (x, y, z) => Math.min(pantsSdf(x, y, z), jacketSdf(x, y, z)) })
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R', hs = handSdf(s), sh = shoeSdf(s)
    out.push({ name: 'shoe' + S, k: 1, sdf: sh, box: shoeBox(s), h: [0.0045, 0.009], target: [1050, 340], shade: (x, y, z, o) => shoeShadeB(s, x, y, z, o), weights: (x, y, z, a) => shoeWeights(s, x, y, z, a), ao: pantsSdf, aoScale: 0.01 })
    out.push({ name: 'hand' + S, k: 1, hs: s, sdf: hs, box: handBox(s), h: [0.0029, 0.0058], target: [2300, 640], keep: handKeep(s), shade: (x, y, z, o) => handShadeB(s, x, y, z, o), weights: (x, y, z, a) => handWeights(s, x, y, z, a), ao: jacketSdf, aoScale: 0.008 })
  }
  return out
}
function bakePart(ch: Chunk, p: Part, lod: number, stats: Record<string, number>) {
  const t0 = performance.now()
  let s: Surf = extract(p.sdf, { min: p.box.min, max: p.box.max, h: p.h[lod], keep: p.keep, within: p.within, project: 1 })
  const raw = s.idx.length / 3
  if (p.target && raw > p.target[lod]) { s = decimate(s, p.target[lod]); reproject(p.sdf, s, 0, lod ? 0.003 : 0.0012) }
  const grid = s.sample!, extra = p.ao
  const ao: Sdf = extra ? (x, y, z) => Math.min(grid(x, y, z), extra(x, y, z)) : grid
  const base = ch.n, sh = shade0(), w = new W4()
  for (let i = 0; i < s.vcount; i++) {
    const x = s.pos[i * 3], y = s.pos[i * 3 + 1], z = s.pos[i * 3 + 2], nx = s.nrm[i * 3], ny = s.nrm[i * 3 + 1], nz = s.nrm[i * 3 + 2]
    p.shade(x, y, z, sh)
    const occ = sdfAO(ao, x, y, z, nx, ny, nz, p.aoScale ?? 0.012, 1.6)
    p.weights(x, y, z, w.reset()); w.finish(B.chest)
    const P: V3 = [x, y, z], Pw = p.k ? warpBH(P, p.hs ?? 0) : P, Nw = p.k ? warpN(P, [nx, ny, nz], p.hs ?? 0) : [nx, ny, nz]
    ch.vert(Pw, Nw, sh, w, lod ? 0.7 + 0.3 * occ : 0.4 + 0.6 * occ)
  }
  for (let i = 0; i < s.idx.length; i++) ch.idx.push(base + s.idx[i])
  stats[p.name] = s.idx.length / 3
  stats[p.name + '_ms'] = Math.round(performance.now() - t0)
}

// ---------- 薄壳 / 小件（行李员空间建造，顶点 ×K） ----------
function shell(ch: Chunk, P: (s: number, t: number) => V3, ns: number, nt: number, thick: (s: number, t: number) => number, shadeAt: (p: V3, s: number, t: number, o: Shade) => void, weightAt: (p: V3, acc: W4) => void, hs = 0) {
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
      ch.vert(warpBH(p, hs), warpN(p, scl(N[i][j], sg), hs), sh, w, sg > 0 ? 1 : 0.75)
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
      for (const p of q) { shadeAt(p, i0 / ns, j0 / nt, sh); weightAt(p, w.reset()); w.finish(B.chest); ch.vert(warpBH(p, hs), warpN(p, en, hs), sh, w) }
      ch.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }
  const e1: [number, number][] = [], e2: [number, number][] = [], e3: [number, number][] = [], e4: [number, number][] = []
  for (let i = 0; i <= ns; i++) { e1.push([i, 0]); e3.push([ns - i, nt]) }
  for (let j = 0; j <= nt; j++) { e2.push([ns, j]); e4.push([0, nt - j]) }
  rim(e1); rim(e3); rim(e2); rim(e4)
}
/** 扣子（扁圆顶 + 一圈边；颜色 / 金属度可选）：p 表面点、n 法线（行李员空间） */
function dome(ch: Chunk, p: V3, n: V3, r: number, h: number, seg: number, color: number, rough: number, metal: number, weightAt: (p: V3, acc: W4) => void, hs = 0) {
  const N = nrm(n), T = nrm(Math.abs(N[1]) < 0.9 ? cross([0, 1, 0], N) : cross([1, 0, 0], N)), Bt = cross(N, T)
  const sh = shade0(), w = new W4(), c = C3(color), rings = Math.max(3, Math.round(seg / 3))
  const base = ch.n
  for (let i = 0; i <= rings; i++) {
    const phi = (i / rings) * Math.PI / 2, rr = r * Math.cos(phi), hh = h * Math.sin(phi)
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a)
      const q = add(p, add(add(scl(T, ca * rr), scl(Bt, sa * rr)), scl(N, hh - h * 0.15)))
      const nn = nrm(add(add(scl(T, ca * Math.cos(phi) * h), scl(Bt, sa * Math.cos(phi) * h)), scl(N, Math.sin(phi) * r)))
      const k = 0.8 + 0.35 * Math.max(0, dot(nn, nrm([0.3, 0.8, 0.5])))
      sh.r = Math.min(1, c[0] * k); sh.g = Math.min(1, c[1] * k); sh.b = Math.min(1, c[2] * k); sh.rough = rough; sh.metal = metal; sh.fur = 0; sh.skin = 0; sh.cloth = 0; sh.wool = 0
      weightAt(q, w.reset()); w.finish(B.chest)
      ch.vert(warpBH(q, hs), warpN(q, nn, hs), sh, w)
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const a = base + i * seg + j, b = base + i * seg + ((j + 1) % seg); ch.idx.push(a, b, b + seg, a, b + seg, a + seg) }
  const top = ch.n; weightAt(p, w.reset()); w.finish(B.chest); { const tp = add(p, scl(N, h * 0.85)); ch.vert(warpBH(tp, hs), warpN(tp, N, hs), sh, w) }
  for (let j = 0; j < seg; j++) ch.idx.push(base + rings * seg + j, base + rings * seg + ((j + 1) % seg), top)
}
/** 圆环（戒指）：c 中心、a 轴（手指方向）、R 环半径、r 管半径；flatTop：印章戒指顶面（沿 d 方向）压平加宽 */
function torus(ch: Chunk, c: V3, a: V3, d: V3, R: number, r: number, seg: number, tseg: number, color: number, weightAt: (p: V3, acc: W4) => void, flatTop = 0, hs = 0) {
  const A = nrm(a), D0 = nrm(sub(d, scl(A, dot(d, A)))), E = cross(A, D0)
  const sh = shade0(), w = new W4(), col = C3(color)
  const base = ch.n
  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * Math.PI * 2, rd = add(scl(D0, Math.cos(t)), scl(E, Math.sin(t)))
    const top = flatTop * Math.max(0, Math.cos(t)) ** 6
    for (let j = 0; j < tseg; j++) {
      const u = (j / tseg) * Math.PI * 2
      const n = nrm(add(scl(rd, Math.cos(u)), scl(A, Math.sin(u) * (1 + top))))
      const q = add(add(c, scl(rd, R + r * Math.cos(u) * (1 + top * 0.6))), scl(A, r * Math.sin(u) * (1 + top * 1.4)))
      const k = 0.75 + 0.5 * Math.max(0, dot(n, nrm([0.2, 0.8, 0.55])))
      sh.r = Math.min(1, col[0] * k); sh.g = Math.min(1, col[1] * k); sh.b = Math.min(1, col[2] * k); sh.rough = 0.18; sh.metal = 0.95; sh.fur = 0; sh.skin = 0; sh.cloth = 0; sh.wool = 0
      weightAt(q, w.reset()); w.finish(B.chest)
      ch.vert(warpBH(q, hs), warpN(q, n, hs), sh, w)
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < tseg; j++) {
    const a0 = base + i * tseg + j, a1 = base + ((i + 1) % seg) * tseg + j, b0 = base + i * tseg + ((j + 1) % tseg), b1 = base + ((i + 1) % seg) * tseg + ((j + 1) % tseg)
    ch.idx.push(a0, a1, b1, a0, b1, b0)
  }
}
/** 领口处衬衫 / 西装表面高度（沿方向 phi、半径 r） */
function bodyTopY(phi: number, r: number) {
  const x = NECK_HOLE.c[0] + Math.sin(phi) * r, z = NECK_HOLE.c[2] + Math.cos(phi) * r
  let lo = 1.36, hi = 1.6
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (bodySdf(x, m, z) < 0) lo = m; else hi = m }
  return lo
}
const COL = { r0: 0.066, r1: 0.062, topF: 1.508, topB: 1.53, gap0: 0.16, gap1: 0.34 }
function collarPoint(s: number, t: number): V3 {
  const gap = mix(COL.gap0, COL.gap1, t)
  const phi = mix(gap, Math.PI * 2 - gap, s)
  const bk = (1 - Math.cos(phi)) * 0.5
  const r = mix(COL.r0, COL.r1, t) + 0.002 * bk
  const y0 = bodyTopY(phi, r) - 0.008, y1 = mix(COL.topF, COL.topB, bk)
  return [NECK_HOLE.c[0] + Math.sin(phi) * r, mix(y0, y1, t), NECK_HOLE.c[2] + Math.cos(phi) * r]
}
function buildShells(ch: Chunk, lod: number) {
  const q = lod ? 0.5 : 1, R = (n: number) => Math.max(4, Math.round(n * q))
  const white = (_p: V3, _s: number, t: number, o: Shade) => { const c = C3(0xeceae5); const k = 0.88 + 0.12 * t; o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k; o.rough = 0.85; o.metal = 0; o.fur = 0; o.skin = 0; o.cloth = 1; o.wool = 0 }
  const neckW = (p: V3, a: W4) => { const k = sstep(1.47, 1.53, p[1]) * 0.25; a.add(B.chest, 1 - k); a.add(B.neck, k) }
  // 衬衫领座（后高前低，前面留出领带结的口）
  shell(ch, collarPoint, R(44), R(5), () => 0.0035, white, neckW)
  // 两片领尖：从领座前沿翻下来，尖朝下外、贴在衬衫上（领带结两侧）
  for (const sd of [1, -1]) {
    const top = collarPoint(sd > 0 ? 0.035 : 0.965, 1), bot = collarPoint(sd > 0 ? 0.0 : 1.0, 0.25)
    const back = collarPoint(sd > 0 ? 0.11 : 0.89, 0.95)
    const tipY = 1.398, tipX = sd * 0.056
    const tip: V3 = [tipX, tipY, shirtFrontZ(tipX, tipY) + 0.0045]
    const P = (s: number, t: number): V3 => {
      // s：领座沿（0 = 内缘 / 结旁，1 = 外缘）；t：0 领座 → 1 领尖
      const e0 = add(scl(bot, 1 - s), scl(back, s)), e1 = add(scl(top, 1 - s), scl(tip, s))
      const pt = add(scl(add(scl(e0, 1 - s), scl(top, s)), 1 - t), scl(add(scl(e1, 1 - s), scl(tip, s)), t))
      // 往衬衫表面上贴（领尖略翘起 2 mm）
      const zs = shirtFrontZ(pt[0], Math.max(pt[1], 1.39)) + 0.004 + 0.002 * t
      return [pt[0], pt[1], Math.max(pt[2], zs)]
    }
    shell(ch, P, R(6), R(7), () => 0.0032, white, neckW)
  }
  // 西装扣（深色牛角扣）：两粒，在合襟线上
  const trunk = (p: V3, a: W4) => trunkW(p[0], p[1], a, 1)
  for (const y of BTN_Y) {
    const p = onSurface(jacketSdf, [-0.004, y, 0.2], 0)
    const e = 0.002, n = nrm([jacketSdf(p[0] + e, p[1], p[2]) - jacketSdf(p[0] - e, p[1], p[2]), jacketSdf(p[0], p[1] + e, p[2]) - jacketSdf(p[0], p[1] - e, p[2]), jacketSdf(p[0], p[1], p[2] + e) - jacketSdf(p[0], p[1], p[2] - e)])
    dome(ch, add(p, scl(n, 0.0008)), n, 0.0098, 0.0036, lod ? 8 : 14, 0x1a1210, 0.35, 0, trunk)
  }
  // 马甲扣（v2 可选三件套，默认关）：V 口下方两粒小扣（更下面的被西装盖住）
  for (const y of VEST_ON ? VEST_BTN_Y : []) {
    const f = (x: number, yy: number, z: number) => Math.min(bodySdf(x, yy, z), shirtSdf(x, yy, z) - 0.0052)
    const p = onSurface(bodySdf, [0, y, 0.2], 0)
    const e = 0.002, n = nrm([f(p[0] + e, p[1], p[2]) - f(p[0] - e, p[1], p[2]), f(p[0], p[1] + e, p[2]) - f(p[0], p[1] - e, p[2]), f(p[0], p[1], p[2] + e) - f(p[0], p[1], p[2] - e)])
    dome(ch, add(p, scl(n, 0.0005)), n, 0.0058, 0.0024, lod ? 6 : 10, 0x2a1a12, 0.3, 0, trunk)
  }
  // 袖扣：每袖 3 粒（外侧近袖口）
  for (const s of [1, -1]) {
    const A = ARM[s], S = s > 0 ? 'L' : 'R'
    const out = nrm(sub([s, 0, -0.4], scl(A.df, dot([s, 0, -0.4], A.df))))
    for (let k = 0; k < (lod ? 2 : 3); k++) {
      const t = JCUFF_T - 0.035 - k * 0.032, c = add(A.e, scl(A.df, A.Lf * t))
      const p = onSurface(jacketSdf, add(c, scl(out, 0.06)), 0)
      dome(ch, add(p, scl(out, 0.0006)), out, 0.0055, 0.0026, lod ? 6 : 10, 0x1a1210, 0.35, 0, (_p, a) => { a.add(B['foreArm' + S], 1) }, s)
    }
  }
  // 戒指：右手无名指金戒；左手食指暗绿宝石金戒、小指金印章戒
  const rings: [number, string, number, boolean][] = [[-1, 'ring', 0xc9a14a, false], [1, 'index', 0xcfa848, true], [1, 'pinky', 0xb8903c, false]]
  for (const [s, fname, color, gem] of rings) {
    const { F, fingers } = BH_HAND[s], f = fingers.find((x) => x.name === fname)!
    const S = s > 0 ? 'L' : 'R'
    const a = sub(f.joints[1], f.joints[0]), c = add(f.joints[0], scl(a, 0.42)), rf = mix(f.radii[0], f.radii[1], 0.42)
    const wf = (_p: V3, acc: W4) => { acc.add(B[fname + '1' + S], 1) }
    const signet = fname === 'pinky'
    torus(ch, c, a, F.d, rf + 0.0011, 0.00135, lod ? 10 : 18, lod ? 4 : 7, color, wf, signet ? 1.0 : gem ? 0.5 : 0, s)
    if (gem) {
      // 宝石托 + 暗绿宝石（扁圆顶，低粗糙度）
      const d = nrm(sub(F.d, scl(nrm(a), dot(F.d, nrm(a))))), gp = add(c, scl(d, rf + 0.0028))
      dome(ch, gp, d, 0.0042, 0.0016, lod ? 6 : 10, 0xb89040, 0.2, 0.95, wf, s)
      dome(ch, add(gp, scl(d, 0.0013)), d, 0.0034, 0.0026, lod ? 6 : 12, 0x0c3a22, 0.08, 0.1, wf, s)
    }
  }
}

// ---------- 几何缓存 ----------
interface Built { body: THREE.BufferGeometry; head: THREE.BufferGeometry; headTrue: THREE.BufferGeometry; tent: THREE.BufferGeometry; eye: THREE.BufferGeometry; beak: { upper: THREE.BufferGeometry; lower: THREE.BufferGeometry }; stats: Record<string, number> }
const cache: Record<number, Built> = {}
let bonesReady = false
function ensureTentacleBones() {
  if (bonesReady) return
  setTentacleBonePositions(tentacleBonePts())
  bonesReady = true
}
function headPart(): Part {
  return { name: 'head', k: 0, sdf: headPartSdf, box: HEAD_BOX, h: [0.0027, 0.0062], target: [10400, 2350], keep: (_x, y) => y > 1.505, shade: headShade, weights: headWeights, ao: bhSdfW(bodySdf), aoScale: 0.01 }
}
const pendingGeometry = new Set<number>()
/** Keep the existing detail visible while its immutable high-detail buffers build. */
export function deferBeastGeometry(lod = 0): boolean {
  if (cache[lod]) return false
  if (pendingGeometry.has(lod)) return true
  pendingGeometry.add(lod)
  const accepted = requestHotelGeometry('beast', lod, tree => {
    pendingGeometry.delete(lod)
    if (tree && !cache[lod]) { ensureTentacleBones(); cache[lod] = unpackGeometryTree(tree) as Built }
  })
  if (!accepted) pendingGeometry.delete(lod)
  return accepted
}
export function beastGeometryReady(lod = 0): boolean { return !!cache[lod] }
export function buildBeastGeometry(lod = 0): Built {
  const task = prepareBeastGeometry(lod, false)
  let step = task.next()
  while (!step.done) step = task.next()
  return step.value
}
export function* prepareBeastGeometry(lod = 0, allowWorker = true): Generator<void, Built> {
  if (cache[lod]) return cache[lod]
  if (allowWorker && deferBeastGeometry(lod)) {
    while (pendingGeometry.has(lod) && !cache[lod]) yield
    if (cache[lod]) return cache[lod]
  }

  const t0 = performance.now(), stats: Record<string, number> = {}
  tentaclePaths(); ensureTentacleBones()
  stats.paths_ms = Math.round(performance.now() - t0)
  const ch = new Chunk()
  lodNow = lod; setHeadLod(lod)
  for (const p of parts()) {
    yield
    if (cache[lod]) return cache[lod]
    lodNow = lod; setHeadLod(lod)
    bakePart(ch, p, lod, stats)
  }
  yield; lodNow = lod; setHeadLod(lod)
  buildShells(ch, lod)
  const toGeo = (c: Chunk) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(c.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(c.nrm, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(c.col, 3)); g.setAttribute('aDet', new THREE.Float32BufferAttribute(c.det, 4)); g.setAttribute('aRM', new THREE.Float32BufferAttribute(c.rm, 2))
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(c.si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(c.sw, 4))
    g.setIndex(c.n > 65535 ? new THREE.Uint32BufferAttribute(c.idx, 1) : new THREE.Uint16BufferAttribute(c.idx, 1))
    g.computeBoundingSphere(); g.boundingSphere!.radius *= 1.3
    return g
  }
  const g = toGeo(ch)
  // 墨鱼头：绅士（无缝）/ 真身（中线裂缝）两套网格，setBeastForm 切换
  const hg = new Chunk(), ht = new Chunk(), hst: Record<string, number> = {}
  yield; lodNow = lod; setHeadLod(lod); setHeadVariant('gentleman'); bakePart(hg, headPart(), lod, stats)
  yield; lodNow = lod; setHeadLod(lod); setHeadVariant('true'); bakePart(ht, headPart(), lod, hst)
  setHeadVariant('gentleman')
  yield
  stats.headTrue = hst.head; stats.headTrue_ms = hst.head_ms
  const tg = buildTentacleGeometry(lod)
  // 触须：色素皮肤标记 = 背面（非口面）；粗糙度低（湿）
  {
    const n = tg.geo.attributes.position.count, uv = tg.geo.attributes.uv, det = new Float32Array(n * 4), rm = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) { const u = uv.getX(i), oral = Math.max(0, Math.cos((u - 0.5) * Math.PI * 2)); det[i * 4] = 1 - sstep(0.2, 0.7, oral); det[i * 4 + 1] = 0.3; rm[i * 2] = 0.3; rm[i * 2 + 1] = 0 }
    tg.geo.setAttribute('aDet', new THREE.BufferAttribute(det, 4)); tg.geo.setAttribute('aRM', new THREE.BufferAttribute(rm, 2))
    tg.geo.computeBoundingSphere()
  }
  stats.tentTris = tg.tris
  stats.bodyTris = ch.idx.length / 3 + hg.idx.length / 3
  yield
  const eye = buildEyeGeometry(lod)
  const beak = buildBeakGeometry(lod)
  stats.eyeTris = 2 * (eye.index ? eye.index.count / 3 : 0)
  stats.beakTris = (beak.upper.index!.count + beak.lower.index!.count) / 3
  stats.ms = Math.round(performance.now() - t0)
  return (cache[lod] ??= { body: g, head: toGeo(hg), headTrue: toGeo(ht), tent: tg.geo, eye, beak, stats })
}

// ======================================================================
// 材质
// ======================================================================
/** 色素皮肤统一变量（所有野兽实例共享；阶段 2 色素波纹 / 变色 / 闪色改这些） */
export const BEAST_CHROMA = {
  uChromaTime: { value: 0 },
  /** 色素波纹幅度（0 = 静止；1 = 斑点随波纹明显扩张 / 收缩） */
  uChromaAmp: { value: 0.0 },
  uChromaFreq: { value: 38.0 },
  uChromaDir: { value: new THREE.Vector3(0.0, -1.0, 0.25).normalize() },
  /** 色素细胞整体扩张（-1 收缩变浅 … 1 扩张变深） */
  uChromaExpand: { value: 0.0 },
  /** 旧版整体着色（闪色）：颜色 + 强度——v2 起各片段不再使用（保留兼容，默认 0） */
  uChromaTint: { value: new THREE.Color('#b0201c') },
  uChromaTintK: { value: 0.0 },
  /** 青绿虹彩强度 */
  uIrid: { value: 0.55 },
  // —— v2 头足类变色（色素细胞各自扩张 / 收缩，见 beastPatch）——
  /** 大尺度斑块强度（深色斑块 + 浅色斑纹；边缘由色素点组成） */
  uPatch: { value: 0.08 },
  /** 流动云纹：x 强度、y 空间频率（rad/m，沿「离外套膜尖端的距离」）、z 相位（CPU 按波速积分） */
  uCloud: { value: new THREE.Vector3(0, 57, 0) },
  /** 单道云纹：x 位置（离外套膜尖端的距离，米；< 0 = 不在体表）、y 强度 */
  uSweep: { value: new THREE.Vector2(-1, 0) },
  /** 急速变白（色素点全收缩，露出白色素 / 虹彩细胞）0..1 */
  uBlanch: { value: 0 },
  /** 眼周深色环、外套膜（含侧鳍）边缘深色镶边 */
  uEyeRing: { value: 0 },
  uEdge: { value: 0.15 },
  /** 色相偏移：+ = 红褐色素细胞优先扩张（恼怒），− = 黄 / 橙；uDark = 深褐色素优先 + 全体偏深褐（隐入暗处） */
  uHue: { value: 0 },
  uDark: { value: 0 },
  /** 触须额外色波强度（云纹 / 单道云纹在触须上加强） */
  uTentWave: { value: 0 },
  /** 湿润高光：强度、方向（视空间）、颜色 */
  uWet: { value: 0.6 },
  uSpecDir: { value: new THREE.Vector3(0.35, 0.62, 0.7).normalize() },
  uSpecColor: { value: new THREE.Color('#ffffff') },
}
let detailTex: THREE.Texture | null = null
function detailTexture() {
  if (detailTex || typeof document === 'undefined') return detailTex
  const S = 256, c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d')!
  const img = g.createImageData(S, S), D = img.data
  let seed = 18; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x
    const pore = 0.5 + 0.12 * (rnd() - 0.5) + 0.06 * Math.sin(x * 0.5) * Math.sin(y * 0.37)
    const weave = 0.5 + 0.22 * Math.sin(x * Math.PI / 2) * Math.sin(y * Math.PI / 2) + 0.1 * (rnd() - 0.5)
    const twill = 0.5 + 0.2 * Math.sin((x + y) * Math.PI / 3) + 0.08 * (rnd() - 0.5)
    D[i * 4] = 128; D[i * 4 + 1] = clamp(pore, 0, 1) * 255; D[i * 4 + 2] = clamp(weave, 0, 1) * 255; D[i * 4 + 3] = clamp(twill, 0, 1) * 255
  }
  g.putImageData(img, 0, 0)
  detailTex = new THREE.CanvasTexture(c); detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping; detailTex.premultiplyAlpha = false; detailTex.colorSpace = THREE.NoColorSpace
  return detailTex
}
let chromaTex: THREE.Texture | null = null
/** 色素细胞每张贴图的细胞数（每边）；贴图 512²、头部按 vCBP × BEAST_CELL_SCALE 三平面采样 → 细胞间距 ≈ 1 / (6.2 × 48) m ≈ 3.4 mm */
export const BEAST_CELL_N = 48, BEAST_CELL_SCALE = 6.2
/** 色素细胞贴图 v2（512² 可平铺）：
 *  R = 色素细胞「内部度」1 − 2·F1 / (F1 + F2)（Voronoi：细胞中心 1 → 细胞边界 0；着色器按阈值决定每个色素点扩张到多大）
 *  G = 细胞编号（每个细胞一个常数 → 色素类型：黄 / 橙 / 红褐 / 深褐 + 个体差异）
 *  B = 平滑可平铺噪声（周期 8 + 16 + 32；斑驳 / 斑块分区 / 云纹边缘扰动）
 *  A = 白色素（leucophore）斑点 / 斑块 */
export function chromaTexture() {
  if (chromaTex || typeof document === 'undefined') return chromaTex
  const S = 512, N = BEAST_CELL_N, cs = S / N
  let seed = 1818; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  // 抖动网格的 Voronoi 点（周期 N）
  const PX = new Float32Array(N * N), PY = new Float32Array(N * N), ID = new Float32Array(N * N)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; PX[k] = (i + 0.12 + 0.76 * rnd()) * cs; PY[k] = (j + 0.12 + 0.76 * rnd()) * cs; ID[k] = rnd() }
  // 周期值噪声（格点 n × n）
  const vnoiseP = (n: number) => { const g = new Float32Array(n * n); for (let k = 0; k < n * n; k++) g[k] = rnd(); return (x: number, y: number) => {
    const fx = (x / S) * n, fy = (y / S) * n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0
    const a = (ix: number, iy: number) => g[(((iy % n) + n) % n) * n + (((ix % n) + n) % n)]
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
    return (a(x0, y0) * (1 - sx) + a(x0 + 1, y0) * sx) * (1 - sy) + (a(x0, y0 + 1) * (1 - sx) + a(x0 + 1, y0 + 1) * sx) * sy
  } }
  const n8 = vnoiseP(8), n16 = vnoiseP(16), n32 = vnoiseP(32)
  const L = new Float32Array(S * S)
  for (let k = 0; k < 70; k++) {
    const cx = rnd() * S, cy = rnd() * S, r = 5 + rnd() * 16, a = 0.5 + 0.5 * rnd()
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      const d = Math.hypot(dx, dy) / r; if (d >= 1) continue
      const x = ((Math.floor(cx) + dx) % S + S) % S, y = ((Math.floor(cy) + dy) % S + S) % S
      L[y * S + x] = Math.max(L[y * S + x], a * (1 - d * d))
    }
  }
  // DataTexture（不走 canvas：canvas 内部预乘 alpha，A = 0 处 RGB 会丢）
  const D = new Uint8Array(S * S * 4)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const gi = Math.floor(x / cs), gj = Math.floor(y / cs)
    let f1 = 1e9, f2 = 1e9, id = 0
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { // 抖动网格：F1 一定在 3×3 内（F2 偶尔偏大，只影响细胞边缘一点）
      const ci = gi + di, cj = gj + dj, wi = ((ci % N) + N) % N, wj = ((cj % N) + N) % N, k = wj * N + wi
      const px = PX[k] + (ci - wi) * cs, py = PY[k] + (cj - wj) * cs
      const d = Math.hypot(x + 0.5 - px, y + 0.5 - py)
      if (d < f1) { f2 = f1; f1 = d; id = ID[k] } else if (d < f2) f2 = d
    }
    const inner = 1 - (2 * f1) / (f1 + f2)
    const nz = 0.55 * n8(x, y) + 0.3 * n16(x, y) + 0.15 * n32(x, y)
    const i4 = (y * S + x) * 4
    D[i4] = Math.round(clamp(inner, 0, 1) * 255); D[i4 + 1] = Math.round(id * 255); D[i4 + 2] = Math.round(clamp((nz - 0.5) * 1.7 + 0.5, 0, 1) * 255); D[i4 + 3] = Math.round(clamp(L[y * S + x], 0, 1) * 255)
  }
  const dt = new THREE.DataTexture(D, S, S, THREE.RGBAFormat, THREE.UnsignedByteType)
  dt.wrapS = dt.wrapT = THREE.RepeatWrapping; dt.magFilter = THREE.LinearFilter; dt.minFilter = THREE.LinearMipmapLinearFilter; dt.generateMipmaps = true
  dt.colorSpace = THREE.NoColorSpace; dt.needsUpdate = true
  chromaTex = dt
  return chromaTex
}
/** 体表「云纹坐标」用的几何常量（模型空间，静止姿态）：外套膜尖端、外套膜轴、眼心 */
const TIP_P: V3 = add(add(MANTLE.M0, scl(MANTLE.D, MANTLE.L)), scl(MANTLE.FH, -0.05))
const g3 = (v: V3) => `vec3(${v.map((x) => x.toFixed(4)).join(', ')})`
/** 野兽材质补丁：三平面细节（皮 / 布 / 毛呢）+ 色素皮肤（aDet.x）+ 湿润高光 + 虹彩。需要 aDet / aRM 属性 */
function beastPatch(m: THREE.Material, tag: string) {
  const tex = detailTexture(), ct = chromaTexture()
  const prev = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey()
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r)
    Object.assign(sh.uniforms, BEAST_CHROMA)
    sh.uniforms.cDetail = { value: tex }; sh.uniforms.cDetailOn = { value: tex ? 1 : 0 }; sh.uniforms.cChroma = { value: ct }
    // vCBP / vCBN = 静止姿态坐标（GPU 蒙皮时 position 本来就是静止的；QA 的 CPU 蒙皮替身另带 aBP / aBN，w = 2 作标记，缺省属性 w = 1）
    sh.vertexShader = 'attribute vec4 aDet;\nattribute vec2 aRM;\nattribute vec4 aBP;\nattribute vec3 aBN;\nvarying vec4 vCDet;\nvarying vec2 vCRM;\nvarying vec3 vCBP;\nvarying vec3 vCBN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCDet = aDet; vCRM = aRM; vCBP = position; vCBN = normal;\n#ifndef USE_SKINNING\nif (aBP.w > 1.5) { vCBP = aBP.xyz; vCBN = aBN; }\n#endif')
    sh.fragmentShader = (tag === 'tent' ? '#define BEAST_TENT\n' : '') + `uniform sampler2D cDetail; uniform sampler2D cChroma; uniform float cDetailOn;
uniform float uChromaTime, uChromaAmp, uChromaFreq, uChromaExpand, uChromaTintK, uIrid, uWet; uniform vec3 uChromaDir, uChromaTint, uSpecDir, uSpecColor;
uniform float uPatch, uBlanch, uEyeRing, uEdge, uHue, uDark, uTentWave; uniform vec3 uCloud; uniform vec2 uSweep;
varying vec4 vCDet; varying vec2 vCRM; varying vec3 vCBP; varying vec3 vCBN;
float bLeuco = 0.0, bCov = 0.0;
// 色素类型（线性色）：黄、橙、红褐、深褐；占比 0.28 / 0.24 / 0.28 / 0.20
const vec3 PIG_Y = vec3(0.27, 0.17, 0.04), PIG_O = vec3(0.15, 0.05, 0.016), PIG_R = vec3(0.058, 0.013, 0.007), PIG_D = vec3(0.014, 0.008, 0.006);
float bBias(int k) { return k == 0 ? -0.2 - 0.9 * uHue - 0.5 * uDark : k == 1 ? -0.08 - 0.5 * uHue - 0.2 * uDark : k == 2 ? 0.05 + 0.6 * uHue + 0.2 * uDark : 0.1 + 0.3 * uHue + 0.7 * uDark; }
// 深色带 / 眼环 / 镶边里（dk > 0）各类色素点都偏深褐（真实头足类深色带 = 深褐色素点大面积扩张、盖过邻居）
vec3 bPig(int k, float dk) { vec3 c = k == 0 ? PIG_Y : k == 1 ? PIG_O : k == 2 ? PIG_R : PIG_D; return mix(c, PIG_D * 0.6, clamp(uDark * 0.9 + (k == 2 ? 0.25 : 0.5) * dk, 0.0, 0.94)); }
float bTh(float e) { return clamp(0.55 - 0.3 * e, 0.02, 0.985); }
// 一个细胞：c.r 内部度、c.g 编号 → (色素色, 覆盖)
// dk = 深褐色素额外激活（云纹 / 单道云纹 / 眼环 / 镶边主要靠深褐色素点扩张，红褐次之 → 深色带有明暗对比）
vec4 bCell(vec4 c, float act, float dk, float aw) {
  int k = c.g < 0.28 ? 0 : c.g < 0.52 ? 1 : c.g < 0.8 ? 2 : 3;
  float th = bTh(act + bBias(k) + (k == 3 ? dk : k == 2 ? 0.4 * dk : 0.0) + (fract(c.g * 7.13) - 0.5) * 0.35);
  return vec4(bPig(k, dk), smoothstep(th - aw, th + aw, c.r));
}
// 远处：各类型面积期望（R > th 的面积 ≈ (1 − th)²）→ (Σ 色素色 × 覆盖, 总覆盖)
vec4 bCellFar(float act, float dk) {
  vec4 o = vec4(0.0);
  for (int k = 0; k < 4; k++) { float f = k == 0 ? 0.28 : k == 1 ? 0.24 : k == 2 ? 0.28 : 0.2; float t1 = 1.0 - bTh(act + bBias(k) + (k == 3 ? dk : k == 2 ? 0.4 * dk : 0.0)); float cv = f * t1 * t1; o += vec4(bPig(k, dk) * cv, cv); }
  return o;
}
` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
      if (cDetailOn > 0.5) {
        vec3 bw = pow(abs(vCBN) / max(length(vCBN), 1e-5), vec3(4.0)); bw /= (bw.x + bw.y + bw.z + 1e-5);
        vec3 pA = vCBP * 16.0, pB = vCBP * 46.0;
        vec4 sA = texture2D(cDetail, pA.zy) * bw.x + texture2D(cDetail, pA.xz) * bw.y + texture2D(cDetail, pA.xy) * bw.z;
        vec4 sB = texture2D(cDetail, pB.zy) * bw.x + texture2D(cDetail, pB.xz) * bw.y + texture2D(cDetail, pB.xy) * bw.z;
        float dt = vCDet.y * (sB.g - 0.5) * 0.25 + vCDet.z * ((sB.b - 0.5) * 0.25 + (sA.b - 0.5) * 0.1) + vCDet.w * (sA.a - 0.5) * 0.3;
        diffuseColor.rgb *= 1.0 + dt;
        if (vCDet.x > 0.01) {
          // —— 头足类变色 v2：色素细胞（chromatophore）各自扩张 / 收缩，不整体染色 ——
          // 激活场 act（斑驳 + 斑块 + 云纹 + 单道云纹 + 眼环 + 镶边 + 整体扩张，变白时压到 −1.4）→ 每个细胞按自己的色素类型阈值扩张成色点；
          // 细胞之间露出皮肤底色 / 白色素（leucophore）/ 虹彩细胞（iridophore，青绿，见 normal_fragment_maps）
          vec3 base = diffuseColor.rgb;
          vec3 pC = vCBP * ${BEAST_CELL_SCALE.toFixed(2)};
          vec4 cX = texture2D(cChroma, pC.zy), cY = texture2D(cChroma, pC.xz + 0.37), cZ = texture2D(cChroma, pC.xy + 0.71);
          vec3 pD = vCBP * 4.6 + vec3(0.0, 0.011, 0.006) * uChromaTime;
          vec4 dm = texture2D(cChroma, pD.zy + 0.13) * bw.x + texture2D(cChroma, pD.xz + 0.53) * bw.y + texture2D(cChroma, pD.xy + 0.29) * bw.z;
          vec3 pE = vCBP * 1.5 + vec3(0.21, 0.43, 0.0) - vec3(0.003, 0.004, 0.0) * uChromaTime;
          float nP = texture2D(cChroma, pE.zy).b * bw.x + texture2D(cChroma, pE.xz).b * bw.y + texture2D(cChroma, pE.xy).b * bw.z;
          float nM = dm.b;
          // 云纹坐标：离外套膜尖端的距离（外套膜 → 头 → 口 → 触须单调增大）；过了口（0.47 m）放慢 = 触须上的色波有延迟；噪声扰动边缘
          float sB = distance(vCBP, ${g3(TIP_P)});
          sB += max(0.0, sB - 0.47) * 0.6 + (nM - 0.5) * 0.06;
          float cloud = uCloud.x * (1.7 * smoothstep(0.1, 0.85, sin(sB * uCloud.y - uCloud.z)) - 0.35); // 深色带 + 带间略浅
          float swd = (sB - uSweep.x) / 0.065;
          float sweep = uSweep.y * exp(-swd * swd);
#ifdef BEAST_TENT
          cloud *= 1.0 + uTentWave; sweep *= 1.0 + 0.5 * uTentWave;
#endif
          // 眼周深色环（眼包外缘）
          vec3 qe = vCBP - vec3(sign(vCBP.x) * ${EYE.c[0].toFixed(4)}, ${EYE.c[1].toFixed(4)}, ${EYE.c[2].toFixed(4)});
          float de = (length(qe) - 0.05) / 0.0085;
          float eyeR = exp(-de * de);
          // 外套膜左右边缘 + 侧鳍：深色镶边
          float tm = dot(vCBP - ${g3(MANTLE.M0)}, ${g3(MANTLE.D)}) / ${MANTLE.L.toFixed(3)}, tc = clamp(tm, 0.0, 1.0);
          float am = 0.116 * sqrt(max(0.0, 1.0 - pow(tc, 2.6))) * (1.0 - 0.16 * tc) + 0.0045;
          float edgeM = smoothstep(0.7, 0.95, abs(vCBP.x) / am) * smoothstep(0.03, 0.18, tm);
          float patchF = smoothstep(0.54, 0.64, nP) - 0.7 * (1.0 - smoothstep(0.3, 0.4, nP));
          float bandK = cloud + sweep + uEyeRing * eyeR + uEdge * edgeM;
          float act = uChromaExpand + uChromaAmp * (nM - 0.5) * 1.6 + uPatch * patchF + bandK;
          float dk = 0.9 * bandK + 0.35 * uPatch * max(patchF, 0.0);
          act = mix(act, -1.0, uBlanch); dk *= 1.0 - uBlanch; // 全收缩：色素点缩成针尖小点（不完全消失）
          // 细胞间：皮肤底色略亮 + 白色素斑；收缩（act < 0）/ 变白时露出更多白色素 → 发白发亮
          float pale = clamp(uBlanch * 1.1 + max(0.0, -act - 0.15) * 0.45, 0.0, 1.0);
          vec3 gap = mix(base * 1.18 + dm.a * vec3(0.016, 0.018, 0.017), vec3(0.36, 0.345, 0.31) * (0.85 + 0.3 * dm.a), pale) * (1.0 - 0.55 * uDark);
          // 抗锯齿：细胞小于约 2 像素时过渡到解析覆盖率（按色素类型的面积期望）
          float fp = max(max(fwidth(pC.x), fwidth(pC.y)), fwidth(pC.z)) * 512.0;
          float ppc = ${(512 / BEAST_CELL_N).toFixed(2)} / max(fp, 1e-4);
          float farK = 1.0 - smoothstep(1.3, 3.2, ppc), aw = 0.04 + 0.5 / max(ppc, 0.5);
          vec4 rX = bCell(cX, act, dk, aw), rY = bCell(cY, act, dk, aw), rZ = bCell(cZ, act, dk, aw);
          vec3 nearC = mix(gap, rX.rgb, rX.a) * bw.x + mix(gap, rY.rgb, rY.a) * bw.y + mix(gap, rZ.rgb, rZ.a) * bw.z;
          float nearV = rX.a * bw.x + rY.a * bw.y + rZ.a * bw.z;
          vec4 fr = bCellFar(act, dk);
          vec3 col = mix(nearC, gap * (1.0 - fr.a) + fr.rgb, farK);
          bCov = mix(nearV, fr.a, farK) * vCDet.x;
          bLeuco = 0.6 * dm.a * vCDet.x * (1.0 - bCov);
          diffuseColor.rgb = mix(base, col, vCDet.x);
          diffuseColor.rgb = mix(diffuseColor.rgb, uChromaTint, uChromaTintK * vCDet.x);
        }
      }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if (vCDet.x > 0.01) {
        // 青绿虹彩：掠射角处偏青绿 / 紫，白色素斑块处更强（随光照，不自发光）
        vec3 Vd = normalize(vViewPosition);
        float fres = pow(1.0 - clamp(abs(dot(normal, Vd)), 0.0, 1.0), 1.6);
        float hue = 0.5 + 0.5 * sin(fres * 7.0 + dot(vCBP, vec3(31.0, 23.0, 17.0)));
        vec3 iri = mix(vec3(0.08, 0.62, 0.58), vec3(0.32, 0.26, 0.72), hue * 0.55);
        diffuseColor.rgb += vCDet.x * uIrid * (0.55 * fres + 0.35 * bLeuco + 0.12) * iri * (1.0 - 0.8 * bCov);
      }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        // 湿润高光（墨鱼皮 / 触须 / 领带 / 皮鞋 / 戒指）：经典 Lambert 模式也给一道随视角的高光
        float shine = clamp((0.45 - vCRM.x) / 0.25, 0.0, 1.0);
        if (shine > 0.0) {
          vec3 Vv = normalize(vViewPosition); vec3 Hh = normalize(uSpecDir + Vv);
          float nh = max(dot(normal, Hh), 0.0);
          float wet = vCDet.x > 0.01 ? uWet * (pow(nh, 60.0) * 0.9 + pow(nh, 14.0) * 0.12) : 0.0;
          float metalS = mix(0.3, 1.1, vCRM.y) * pow(nh, mix(34.0, 80.0, vCRM.y));
          totalEmissiveRadiance += shine * (wet + metalS) * uSpecColor * mix(vec3(1.0), vec3(1.0, 0.85, 0.5), vCRM.y);
        }
      }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vCRM.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vCRM.y;')
  }
  m.customProgramCacheKey = () => key + '|beast-' + tag
  return m
}
let tentTex: { map: THREE.Texture; bump: THREE.Texture } | null = null
/** 触须吸盘贴图（u 绕管一圈、口面中心 u = 0.5；v 每单位 = 2.3 倍管径，吸盘随管径变）：口面两排交错的吸盘环（浅肉色、内圈暗、齿环），背面留白给色素 */
function tentacleTextures() {
  if (tentTex || typeof document === 'undefined') return tentTex
  const W = 512, H = 180
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!
  const cb = document.createElement('canvas'); cb.width = W; cb.height = H; const gb = cb.getContext('2d')!
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); gb.fillStyle = '#808080'; gb.fillRect(0, 0, W, H)
  // 口面一道浅沟（两排之间）
  const grd = g.createLinearGradient(0.38 * W, 0, 0.62 * W, 0); grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, 'rgba(170,120,110,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd; g.fillRect(0.38 * W, 0, 0.24 * W, H)
  for (const [u, v] of [[0.43, 0.25], [0.57, 0.75], [0.43, 1.25], [0.57, -0.25]]) {
    const cx = u * W, cy = v * H, rx = 0.052 * W, ry = 0.36 * H
    for (const dx of [0]) {
      // 外环（隆起）→ 齿环 → 内凹（暗）
      gb.fillStyle = '#d8d8d8'; gb.beginPath(); gb.ellipse(cx + dx, cy, rx, ry, 0, 0, Math.PI * 2); gb.fill()
      gb.fillStyle = '#404040'; gb.beginPath(); gb.ellipse(cx + dx, cy, rx * 0.6, ry * 0.6, 0, 0, Math.PI * 2); gb.fill()
      g.fillStyle = '#efe0d8'; g.beginPath(); g.ellipse(cx + dx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill()
      g.strokeStyle = '#a07a70'; g.lineWidth = 2; g.beginPath(); g.ellipse(cx + dx, cy, rx * 0.72, ry * 0.72, 0, 0, Math.PI * 2); g.stroke()
      g.fillStyle = '#7a5048'; g.beginPath(); g.ellipse(cx + dx, cy, rx * 0.5, ry * 0.5, 0, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#3e2420'; g.beginPath(); g.ellipse(cx + dx, cy, rx * 0.22, ry * 0.22, 0, 0, Math.PI * 2); g.fill()
    }
  }
  // 背面：细横纹（环节感）
  for (let y = 0; y < H; y += 9) { g.fillStyle = 'rgba(80,60,55,0.12)'; g.fillRect(0, y, 0.3 * W, 3); g.fillRect(0.7 * W, y, 0.3 * W, 3) }
  const map = new THREE.CanvasTexture(c); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4
  const bump = new THREE.CanvasTexture(cb); bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.colorSpace = THREE.NoColorSpace
  return (tentTex = { map, bump })
}
let eyeTex: THREE.Texture | null = null
/** 墨鱼眼贴图（正面平行投影）：银金色虹膜 + 放射纹 + 黑色 W 形瞳孔 + 深色角膜缘，外圈暗绿灰巩膜 */
export function eyeTexture() {
  if (eyeTex || typeof document === 'undefined') return eyeTex
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d')!
  g.fillStyle = '#26302a'; g.fillRect(0, 0, S, S)
  const cx = S / 2, cy = S / 2, R = S * 0.36
  const gr = g.createRadialGradient(cx, cy - R * 0.2, R * 0.1, cx, cy, R)
  gr.addColorStop(0, '#d9d2a4'); gr.addColorStop(0.45, '#b9a66a'); gr.addColorStop(0.8, '#7c8a62'); gr.addColorStop(1, '#2c3a30')
  g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill()
  let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let k = 0; k < 160; k++) { const a = rnd() * Math.PI * 2, r0 = R * (0.3 + 0.2 * rnd()), r1 = R * (0.75 + 0.25 * rnd()); g.strokeStyle = rnd() < 0.5 ? 'rgba(250,240,200,0.25)' : 'rgba(60,70,40,0.3)'; g.lineWidth = 1 + rnd() * 1.5; g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke() }
  g.strokeStyle = 'rgba(20,24,18,0.85)'; g.lineWidth = 7; g.beginPath(); g.arc(cx, cy, R - 3, 0, Math.PI * 2); g.stroke()
  // W 形瞳孔（墨鱼特征）：一条粗 W，两端翘起，中间尖朝上
  g.fillStyle = '#050505'; g.strokeStyle = '#050505'; g.lineJoin = 'round'; g.lineCap = 'round'
  const W2 = (pts: [number, number][], w: number) => { g.lineWidth = w; g.beginPath(); g.moveTo(cx + pts[0][0] * R, cy + pts[0][1] * R); for (const p of pts.slice(1)) g.lineTo(cx + p[0] * R, cy + p[1] * R); g.stroke() }
  W2([[-0.66, -0.2], [-0.36, 0.3], [0, -0.02], [0.36, 0.3], [0.66, -0.2]], R * 0.24)
  W2([[-0.5, 0.02], [-0.36, 0.22], [0, 0.06], [0.36, 0.22], [0.5, 0.02]], R * 0.3)
  // 角膜高光（固定一点；随环境的高光在着色器里）
  g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.ellipse(cx - R * 0.35, cy - R * 0.42, R * 0.1, R * 0.06, -0.5, 0, Math.PI * 2); g.fill()
  eyeTex = new THREE.CanvasTexture(c); eyeTex.colorSpace = THREE.SRGBColorSpace; eyeTex.anisotropy = 4
  return eyeTex
}
/** 刚性小件的湿 / 亮高光补丁（眼球、喙）：不需要额外属性 */
function shinePatch(m: THREE.Material, power: number, k: number, tag: string) {
  const prev = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey()
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r)
    sh.uniforms.uSpecDir = BEAST_CHROMA.uSpecDir; sh.uniforms.uSpecColor = BEAST_CHROMA.uSpecColor; sh.uniforms.uWet = BEAST_CHROMA.uWet
    sh.fragmentShader = 'uniform vec3 uSpecDir, uSpecColor; uniform float uWet;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { vec3 Vv = normalize(vViewPosition); vec3 Hh = normalize(uSpecDir + Vv); totalEmissiveRadiance += ${k.toFixed(3)} * uWet * pow(max(dot(normal, Hh), 0.0), ${power.toFixed(1)}) * uSpecColor; }`)
  }
  m.customProgramCacheKey = () => key + '|beast-shine-' + tag
  return m
}
let MATS: { body: THREE.Material; tent: THREE.Material; eye: THREE.Material; beak: THREE.Material } | null = null
export function beastMaterials() {
  if (MATS) return MATS
  const body = beastPatch(litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.8 }), 'body')
  const tt = tentacleTextures()
  const tent = beastPatch(litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.35, map: tt?.map, bumpMap: tt?.bump, bumpScale: 1.6 } as THREE.MeshLambertMaterialParameters), 'tent')
  const et = eyeTexture()
  const eye = shinePatch(litMaterial({ color: '#ffffff', map: et ?? undefined, emissive: '#3a3f36', emissiveMap: et ?? undefined, roughness: 0.1 }), 120, 1.4, 'eye')
  const beak = shinePatch(litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.25 }), 50, 0.6, 'beak')
  return (MATS = { body, tent, eye, beak })
}

// ======================================================================
// 装配
// ======================================================================
export interface BeastArm { side: number; clav: THREE.Bone; shoulder: THREE.Bone; elbow: THREE.Bone; wrist: THREE.Bone; fingers: Record<'thumb' | 'index' | 'middle' | 'ring' | 'pinky', THREE.Bone[]> }
export interface BeastLeg { side: number; hip: THREE.Bone; knee: THREE.Bone; ankle: THREE.Bone; toe: THREE.Bone }
export interface BeastTentacle { i: number; kind: 'arm' | 'club'; side: number; bones: THREE.Bone[]; length: number }
export interface BeastRig {
  root: THREE.Bone; hips: THREE.Bone; spine: THREE.Bone; chest: THREE.Bone; neck: THREE.Bone; head: THREE.Bone
  armL: BeastArm; armR: BeastArm; legL: BeastLeg; legR: BeastLeg
  /** 外套膜两半（裂缝）、侧鳍、眼、喙、背部鼓包 */
  mantleL: THREE.Bone; mantleR: THREE.Bone; finL: THREE.Bone; finR: THREE.Bone; eyeL: THREE.Bone; eyeR: THREE.Bone; beak: THREE.Bone; beakJaw: THREE.Bone; backBulge: THREE.Bone
  /** 10 条触须（0–7 腕、8–9 长触腕），每条 9 节骨 */
  tentacles: BeastTentacle[]
  eyes: THREE.Mesh[]; beakUpper: THREE.Mesh; beakLower: THREE.Mesh
  /** 道具（默认隐藏）：契约（左手）、钢笔（右手） */
  contract: THREE.Group; pen: THREE.Group
  bones: Record<string, THREE.Bone>; body: THREE.SkinnedMesh; tentMesh: THREE.SkinnedMesh; lod: number
  /** 头部网格：绅士（无缝）/ 真身（带裂缝），setBeastForm 按形态切换显示 */
  headMesh: THREE.SkinnedMesh; headTrueMesh: THREE.SkinnedMesh
  /** 当前形态 0 = 绅士 … 1 = 真身 */
  form: number
  chroma: typeof BEAST_CHROMA
}
export type BeastForm = 'gentleman' | 'true'

/** 造一个野兽实例（几何 / 材质按 LOD 共享缓存；骨骼每实例一套） */
export function buildBeast(opts: { lod?: number; form?: BeastForm } = {}): THREE.Group {
  const lod = opts.lod ?? 0
  const geo = buildBeastGeometry(lod)
  const M = beastMaterials()
  shareHotelRigAssets({ ...geo, ...geo.beak, ...M })
  const face = new THREE.Group(); face.name = 'beast'; face.rotation.y = Math.PI / 2; face.userData.facesZ = 1
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
  const body = new THREE.SkinnedMesh(geo.body, M.body); body.name = 'beastBody'; body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false
  const tentMesh = new THREE.SkinnedMesh(geo.tent, M.tent); tentMesh.name = 'beastTentacles'; tentMesh.castShadow = true; tentMesh.receiveShadow = true; tentMesh.frustumCulled = false
  const headMesh = new THREE.SkinnedMesh(geo.head, M.body); headMesh.name = 'beastHead'; headMesh.castShadow = true; headMesh.receiveShadow = true; headMesh.frustumCulled = false
  const headTrueMesh = new THREE.SkinnedMesh(geo.headTrue, M.body); headTrueMesh.name = 'beastHeadTrue'; headTrueMesh.castShadow = true; headTrueMesh.receiveShadow = true; headTrueMesh.frustumCulled = false; headTrueMesh.visible = false
  face.add(body, headMesh, headTrueMesh, tentMesh)
  face.updateMatrixWorld(true)
  const skel = new THREE.Skeleton(bones)
  body.bind(skel, body.matrixWorld); tentMesh.bind(skel, tentMesh.matrixWorld); headMesh.bind(skel, headMesh.matrixWorld); headTrueMesh.bind(skel, headTrueMesh.matrixWorld)
  for (const b of bones) b.userData.rest = { p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }
  const bn: Record<string, THREE.Bone> = {}; for (const d of BONES) bn[d.name] = bones[B[d.name]]
  const arm = (s: number): BeastArm => {
    const S = s > 0 ? 'L' : 'R', fingers = {} as BeastArm['fingers']
    for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky'] as const) fingers[f] = [1, 2, 3].map((k) => bn[f + k + S])
    return { side: s, clav: bn['clav' + S], shoulder: bn['upperArm' + S], elbow: bn['foreArm' + S], wrist: bn['hand' + S], fingers }
  }
  const leg = (s: number): BeastLeg => { const S = s > 0 ? 'L' : 'R'; return { side: s, hip: bn['thigh' + S], knee: bn['shin' + S], ankle: bn['foot' + S], toe: bn['toe' + S] } }
  // 眼球（刚性，挂眼骨；局部原点 = 球心）
  const eyes: THREE.Mesh[] = []
  for (const s of [1, -1]) { const e = new THREE.Mesh(geo.eye, M.eye); e.name = 'beastEye' + (s > 0 ? 'L' : 'R'); e.quaternion.copy(eyeQuat(s)); bn[s > 0 ? 'eyeL' : 'eyeR'].add(e); eyes.push(e) }
  // 喙（上颚挂 beak、下颚挂 beakJaw；静止时藏在脸团里）
  const beakUpper = new THREE.Mesh(geo.beak.upper, M.beak); beakUpper.name = 'beastBeakUpper'; bn.beak.add(beakUpper); beakUpper.visible = false
  const beakLower = new THREE.Mesh(geo.beak.lower, M.beak); beakLower.name = 'beastBeakLower'; bn.beakJaw.add(beakLower); beakLower.visible = false
  // 道具（默认隐藏）：契约挂左手掌心、钢笔握在右手
  const handLocal = (s: number, ta: number, tr: number, td: number) => {
    const { F } = BH_HAND[s]
    const p = warpBH(add(F.o, add(add(scl(F.a, ta), scl(F.r, tr)), scl(F.d, td))), s)
    return new THREE.Vector3(...sub(p, warpBH(F.o, s)))
  }
  const contract = buildBeastContract(); contract.visible = false; bn.handL.add(contract); contract.position.copy(handLocal(1, 0.08, 0.0, -0.02))
  contract.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...nrm(scl(BH_HAND[1].F.d, -1))))
  const pen = buildBeastPen(); pen.visible = false; bn.handR.add(pen); pen.position.copy(handLocal(-1, 0.07, 0.035, -0.022))
  pen.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...nrm(add(BH_HAND[-1].F.a, scl(BH_HAND[-1].F.r, 0.4)))))
  const tentacles: BeastTentacle[] = TENTS.map((t) => ({ i: t.i, kind: t.kind, side: t.side, bones: Array.from({ length: N_TENT_BONES }, (_, k) => bn[tentBone(t.i, k)]), length: t.len }))
  const rig: BeastRig = {
    root: bones[0], hips: bn.hips, spine: bn.spine, chest: bn.chest, neck: bn.neck, head: bn.head,
    armL: arm(1), armR: arm(-1), legL: leg(1), legR: leg(-1),
    mantleL: bn.mantleL, mantleR: bn.mantleR, finL: bn.finL, finR: bn.finR, eyeL: bn.eyeL, eyeR: bn.eyeR, beak: bn.beak, beakJaw: bn.beakJaw, backBulge: bn.backBulge,
    tentacles, eyes, beakUpper, beakLower, contract, pen, bones: bn, body, tentMesh, headMesh, headTrueMesh, lod, form: 0, chroma: BEAST_CHROMA,
  }
  face.userData.beast = rig
  face.userData.beastStats = { ...geo.stats }
  if (opts.form === 'true') setBeastForm(rig, 1)
  return face
}

// ======================================================================
// 形态：0 绅士 … 1 真身（全部是骨骼变换；先把相关骨骼复位到静止再叠加，可在动画里每帧调用）
// ======================================================================
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3()
const restOf = (b: THREE.Bone) => { const r = b.userData.rest; b.position.copy(r.p); b.quaternion.copy(r.q); b.scale.copy(r.s) }
/** 真身里两条长触腕的走向（头局部 = 模型轴向；每节一个方向）：左触腕向前平伸探向玩家、末端上卷；右触腕垂到地面、触腕穗贴地翘起 */
const CLUB_DIRS: Record<number, V3[]> = {
  1: [[0.25, -0.85, 0.45], [0.3, -0.55, 0.8], [0.25, -0.2, 0.95], [0.2, 0.0, 1], [0.15, 0.08, 1], [0.1, 0.12, 1], [0.05, 0.55, 0.85], [0.0, 1.0, 0.25], [-0.1, 0.6, -0.8]],
  [-1]: [[-0.2, -1, 0.25], [-0.25, -1, 0.15], [-0.3, -1, 0.1], [-0.3, -1, 0.2], [-0.25, -0.9, 0.45], [-0.15, -0.35, 1], [-0.05, 0.08, 1], [0.0, 0.6, 0.8], [0.1, 0.8, -0.6]],
}
const CLUB_LEN: Record<number, number> = { 1: 2.6, [-1]: 2.35 }
export function setBeastForm(rig: BeastRig, k: number) {
  k = clamp(k, 0, 1)
  rig.form = k
  const sL = 1 + 0.34 * k, sS = 1 + 0.22 * k
  // 腿拉长（脚掌不变形）+ 髋抬高让脚仍落地
  for (const L of [rig.legL, rig.legR]) { restOf(L.hip); restOf(L.ankle); L.hip.scale.y = sL; L.ankle.scale.y = 1 / sL }
  restOf(rig.hips); rig.hips.position.y += (J.hip[1] - J.ankle[1]) * (sL - 1)
  // 躯干拉长；头 / 手抵消回原比例（手指略长一点）
  restOf(rig.spine); rig.spine.scale.y = sS
  restOf(rig.neck); rig.neck.scale.y = 1 / sS
  for (const A of [rig.armL, rig.armR]) { restOf(A.wrist); A.wrist.scale.y = 1.12 / sS }
  // 外套膜沿中线裂开：两半绕背侧铰链（轴 = 外套膜轴向）向两侧掀开，并拉长
  const ax = new THREE.Vector3(...MANTLE.D)
  restOf(rig.mantleL); restOf(rig.mantleR)
  // v2：开裂幅度收小（0.26 rad，外套膜上部按拉链权重保持闭合），不再整片掀成两把扇子；只略拉长
  rig.mantleL.quaternion.setFromAxisAngle(ax, 0.21 * k); rig.mantleR.quaternion.setFromAxisAngle(ax, -0.21 * k) // v3：头放大后铰链更远，0.26 → 0.21 rad 保持缝宽相近
  rig.mantleL.scale.set(1, 1 + 0.08 * k, 1 + 0.04 * k); rig.mantleR.scale.copy(rig.mantleL.scale)
  // 头部网格切换：绅士头无缝；一进入真身（k > 0.02）换带缝的头，缝随 k 张开
  const tf = k > 0.02
  rig.headMesh.visible = !tf; rig.headTrueMesh.visible = tf; rig.beakUpper.visible = tf; rig.beakLower.visible = tf
  // 鳍张开
  restOf(rig.finL); restOf(rig.finR); rig.finL.quaternion.setFromAxisAngle(ax, 0.25 * k); rig.finR.quaternion.setFromAxisAngle(ax, -0.25 * k)
  // 喙前伸、张开
  restOf(rig.beak); restOf(rig.beakJaw)
  // v2：喙更大（×2.0），前伸到缝口外、下颚张开
  rig.beak.position.add(_v.set(0, 0.004, 0.07).multiplyScalar(k)); rig.beak.rotation.x = -0.22 * k; rig.beak.scale.setScalar(1 + 1.0 * k)
  rig.beakJaw.rotation.x = 0.6 * k
  // 背部鼓起
  restOf(rig.backBulge); rig.backBulge.scale.set(1 + 0.45 * k, 1 + 0.3 * k, 1 + 1.3 * k); rig.backBulge.position.z -= 0.035 * k
  // 触须：8 条腕整体拉长 1.25；2 条长触腕按 CLUB_DIRS 重新摆、柄段拉长到 2.35–2.6 m（触腕穗那几节保持原长）
  for (const T of rig.tentacles) {
    for (const b of T.bones) restOf(b)
    if (T.kind === 'arm') { for (let i = 1; i < T.bones.length; i++) T.bones[i].position.multiplyScalar(1 + 0.15 * k); continue }
    if (k <= 0) continue
    const dirs = CLUB_DIRS[T.side], bindP = T.bones.map((b) => BONES[B[b.name]].pos)
    const bindLen = bindP.map((p, i) => (i < bindP.length - 1 ? lenv(sub(bindP[i + 1], p)) : 0.02))
    const clubPart = bindLen[6] + bindLen[7] + bindLen[8]
    const stalk = Math.max(0.01, (CLUB_LEN[T.side] - clubPart) / 6)
    // 柄段变粗（世界缩放 wS[i]；three 的缩放沿骨链继承，所以局部缩放 = wS[i] / wS[i-1]，子骨位置除以父骨世界缩放）
    const wS = T.bones.map((_, i) => 1 + (i < 6 ? 0.85 : i < 8 ? 0.35 : 0.2) * k)
    const Qw: THREE.Quaternion[] = []
    for (let i = 0; i < T.bones.length; i++) {
      const b = i < bindP.length - 1 ? nrm(sub(bindP[i + 1], bindP[i])) : nrm(sub(bindP[i], bindP[i - 1]))
      const target = new THREE.Vector3(...nrm(dirs[i]))
      const qFull = new THREE.Quaternion().setFromUnitVectors(_v.set(b[0], b[1], b[2]), target)
      Qw.push(new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), qFull, k))
    }
    for (let i = 0; i < T.bones.length; i++) {
      const parentQ = i === 0 ? _q.identity() : _q.copy(Qw[i - 1])
      T.bones[i].quaternion.copy(_q2.copy(parentQ).invert().multiply(Qw[i]))
      T.bones[i].scale.setScalar(wS[i] / (i > 0 ? wS[i - 1] : 1))
      if (i > 0) {
        const len = mix(bindLen[i - 1], i - 1 < 6 ? stalk : bindLen[i - 1], k)
        const bdir = nrm(sub(bindP[i], bindP[i - 1]))
        // 父骨世界方向 = Qw[i-1]·bdir；在父骨局部里就是 bdir（父骨旋转把它带到目标方向）
        _v2.set(bdir[0], bdir[1], bdir[2]).multiplyScalar(len / wS[i - 1])
        T.bones[i].position.copy(_v2)
      }
    }
  }
  return rig
}

/** 三角形统计（不含默认隐藏的道具）：tris = 全部可见网格；tent = 触须；eyes / beak 单列 */
export function beastTris(o: THREE.Object3D) {
  let t = 0, n = 0, tent = 0, small = 0
  o.traverse((m) => {
    const x = m as THREE.Mesh; if (!x.isMesh || x.userData.cpuSkin) return
    if (!x.visible) return
    let vis = true; for (let p: THREE.Object3D | null = x; p && p !== o; p = p.parent) if (!p.visible) vis = false
    if (!vis) return
    n++; const g = x.geometry, kk = (g.index ? g.index.count : g.attributes.position.count) / 3
    t += kk; if (x.name === 'beastTentacles') tent += kk; else if (x.name !== 'beastBody' && x.name !== 'beastHead' && x.name !== 'beastHeadTrue') small += kk
  })
  return { tris: Math.round(t), meshes: n, tent: Math.round(tent), small: Math.round(small) }
}
export { clearSdf, eyeC, gauss }
