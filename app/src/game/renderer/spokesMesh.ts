import { shareHotelRigAssets } from './shared'
// [spokes] 迎宾女郎（Entity 28 / The Spokeslady）重制·阶段 1 建模（只建模，不做动画 / 机制，未接入游戏）。
// 参照 ZAN 附图 + 定稿（11-01）：写实真兔头（灰白短毛、长竖耳内侧粉色带血管、黑亮大眼无眼白、粉鼻、长白胡须），
// 纤瘦女性身体，深棕细格纹女式双排扣西装外套（袖口 4 粒扣）、白衬衫大尖翻领、同格纹及膝铅笔裙、裸色丝袜、深棕低跟船鞋；
// 兔头与人颈衔接处毛发渐短渐稀过渡到皮肤；领口别一个小音箱（她靠音箱说话）。
//
// 做法（沿用野兽 / 行李员）：
//   · 身体部件（西装 + 衬衫 / 裙 / 腿 / 鞋 / 手）写成 SDF，在「行李员空间」里求值（复用行李员的人体部件、手与权重），
//     窄带 Surface Nets 提取 → QEM 减面 → 投影回等值面 → spokesRig.warpBH 形变到女性体型；顶点色 = 明暗 × SDF 环境光遮蔽。
//   · 兔头 + 颈直接在迎宾女郎空间提取（spokesHead），和身体同一张 SkinnedMesh。
//   · 毛：头部底网格 + N 层壳层（furShells，独立 SkinnedMesh）；壳层着色器在静止坐标里做 3D 细胞噪声毛丝（无 UV、无接缝），
//     毛根深、毛梢浅（刺鼠色）、个别深色针毛；毛长由顶点 aFur 控制。耳外侧同样有短壳层毛。
//   · 格纹：顶点色只放明暗，着色器（plaidPatch）按静止坐标 aRest 三平面投影程序生成细格纹（深棕底 + 暗格带 + 浅褐细线 + 锈红细线），
//     按屏幕导数做盒滤波，线条小于约 2 像素时渐变到平均色 → 远看不出摩尔纹。
//   · 兔耳：参数曲面（内凹面 + 外凸面 + 耳缘），每侧 3 节骨；内侧血管贴图 + 透光感自发光。
//   · 眼球 / 胡须：刚性小网格挂骨（眼挂 head、胡须挂 whiskerL/R）。
// 坐标：+Z 正面建造、地面 y=0；外层组 rotation.y = π/2（userData.facesZ = 1，与看门人 / 行李员 / 野兽同约定）。
// 无头 SwiftShader 画 GPU 蒙皮会崩：预览 / 截图带 ?cpu=1（qaCpuSkin；aRest 属性在 CPU 替身里保留，格纹 / 毛丝不随姿态滑动）。
import { GLSL_SKIRT_DECL, GLSL_SKIRT_PUSH, SKIRT_UNI, installSkirtCollide } from './spokesSkirt'
import * as THREE from 'three'
import { litMaterial } from './shared'
import { decimate, extract, reproject, sdfAO, clamp, mix, sstep, gauss, type Sdf, type Surf } from './conciergeSdf'
import type { Shade } from './conciergeHead'
import { BONES, B, BH_HAND, K as SK, SX_PTS, W4, add, cross, dot, nrm, scl, sub, lenv, eyeC, warpBH, warpN, EAR, earDir, type V3 } from './spokesRig'
import { handBox, handKeep, handWeights } from './bellhopBody'
import {
  bodySdf, BODY_BOX, bodyShade, V0, FRONT_W, SHIRT_OPEN, SKIN_HEX, SHIRT_HEX, bodyWeights, foreSleeveRegion, foreSleeveBox, SLEEVE_BAND, collarRegion, COLLAR_BOX, JHEM, frontW, lapelD, BTN_Y, BTN_X, NECK_HOLE, jacketSdf, JCUFF_T,
  skirtSdf, SKIRT_BOX, jacketSmooth, handSdfS, skirtShade, skirtWeights, SKIRT_HEM, legSdf, legBox, legShade, legWeightsS, shoeSdf, shoeSolid, legKeepShoe, shoeBox, shoeShade, shoeWeights, handShadeS, onSurface, ARM, EDGE_X,
} from './spokesBody'
import { headSdf, HEAD_BOX, headKeep, headShade, headWeights, furComb, buildEarGeometry, earOuterColor, earInnerTexture, buildEyeGeometry, eyeQuat, eyeTexture, buildWhiskerGeometry } from './spokesHead'
import { buildCollarSpeaker } from './spokesProps'

// ---------- 顶点块 ----------
class Chunk {
  pos: number[] = []; nrm: number[] = []; col: number[] = []; mat: number[] = []; rm: number[] = []; si: number[] = []; sw: number[] = []; idx: number[] = []
  get n() { return this.pos.length / 3 }
  vert(p: ArrayLike<number>, n: ArrayLike<number>, s: Shade, w: W4, ao = 1) {
    this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2])
    this.col.push(lin(s.r) * ao, lin(s.g) * ao, lin(s.b) * ao); this.mat.push(s.fx ?? 0, s.fur); this.rm.push(s.rough, s.metal)
    this.si.push(w.i[0], w.i[1], w.i[2], w.i[3]); this.sw.push(w.w[0], w.w[1], w.w[2], w.w[3])
  }
}
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const shade0 = (): Shade => ({ r: 1, g: 1, b: 1, rough: 0.8, metal: 0, fur: 0, skin: 0, cloth: 0, wool: 0, fx: 0, fy: 0, fz: 0 })
const C3 = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]
type WarpMode = 'auto' | 'arm' | 'trunk' | 'none'

// ---------- SDF 部件 ----------
interface Part {
  name: string; sdf: Sdf; box: { min: [number, number, number]; max: [number, number, number] }; h: number[]; target?: number[]
  warp: WarpMode
  keep?: (x: number, y: number, z: number) => boolean; within?: (x: number, y: number, z: number) => boolean; shade: (x: number, y: number, z: number, o: Shade) => void; weights: (x: number, y: number, z: number, acc: W4) => void
  ao?: Sdf; aoScale?: number
}
const LODS = 3
function parts(lod: number): Part[] {
  const out: Part[] = []
  const outSleeve = (x: number, y: number, z: number, slack: number) => foreSleeveRegion(1, x, y, z) > -SLEEVE_BAND - slack && foreSleeveRegion(-1, x, y, z) > -SLEEVE_BAND - slack
  const outCollar = (x: number, y: number, z: number, slack: number) => collarRegion(x, y, z) > -SLEEVE_BAND - slack
  const sl = [0.02, 0.03, 0.045][lod]
  out.push({ name: 'jacket', warp: 'auto', sdf: bodySdf, box: BODY_BOX, h: [0.0095, 0.016, 0.026], target: [6600, 2300, 800], keep: (x, y, z) => outSleeve(x, y, z, 0) && outCollar(x, y, z, 0), within: (x, y, z) => outSleeve(x, y, z, sl) && outCollar(x, y, z, sl), shade: bodyShade, weights: bodyWeights, aoScale: 0.018 })
  out.push({ name: 'collar', warp: 'auto', sdf: bodySdf, box: COLLAR_BOX, h: [0.003, 0.007, 0.014], target: [3900, 1000, 360], keep: (x, y, z) => collarRegion(x, y, z) < 0, within: (x, y, z) => collarRegion(x, y, z) < 0.012, shade: bodyShade, weights: bodyWeights, aoScale: 0.01 })
  for (const s of [1, -1]) out.push({ name: 'sleeve' + (s > 0 ? 'L' : 'R'), warp: 'auto', sdf: bodySdf, box: foreSleeveBox(s), h: [0.005, 0.0075, 0.014], target: [1400, 500, 180], keep: (x, y, z) => foreSleeveRegion(s, x, y, z) < 0, within: (x, y, z) => foreSleeveRegion(s, x, y, z) < 0.01, shade: bodyShade, weights: bodyWeights, aoScale: 0.01 })
  out.push({ name: 'skirt', warp: 'trunk', sdf: skirtSdf, box: SKIRT_BOX, h: [0.008, 0.014, 0.024], target: [2600, 800, 300], keep: (_x, y, z) => y < JHEM(z) + 0.05, within: (_x, y, z) => y < JHEM(z) + 0.08, shade: skirtShade, weights: skirtWeights, aoScale: 0.02, ao: (x, y, z) => Math.min(skirtSdf(x, y, z), jacketSdf(x, y, z)) })
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R', hs = handSdfS(s), sh = shoeSdf(s), lg = legSdf(s), sSol = shoeSolid(s), lk = legKeepShoe(s)
    out.push({ name: 'leg' + S, warp: 'trunk', sdf: lg, box: legBox(s), h: [0.0055, 0.01, 0.018], target: [1700, 520, 180], keep: (x, y, z) => y < SKIRT_HEM + 0.06 && lk(x, y, z), within: (_x, y) => y < SKIRT_HEM + 0.09, shade: (x, y, z, o) => legShade(s, x, y, z, o), weights: (x, y, z, a) => legWeightsS(s, x, y, z, a), ao: (x, y, z) => Math.min(lg(x, y, z), skirtSdf(x, y, z), sSol(x, y, z)), aoScale: 0.014 })
    out.push({ name: 'shoe' + S, warp: 'trunk', sdf: sh, box: shoeBox(s), h: [0.002, 0.0045, 0.0062], target: [2400, 480, 150], shade: (x, y, z, o) => shoeShade(s, x, y, z, o), weights: (x, y, z, a) => shoeWeights(s, x, y, z, a), ao: (x, y, z) => (y > 0.085 ? lg(x, y, z) : 0.05), aoScale: 0.008 }) // 鞋的 AO 只算鞋口以上的腿（藏在鞋里的脚不压暗鞋面）
    out.push({ name: 'hand' + S, warp: 'arm', sdf: hs, box: handBox(s), h: [0.0029, 0.0058, 0.009], target: [1900, 600, 220], keep: handKeep(s), shade: (x, y, z, o) => handShadeS(s, x, y, z, o), weights: (x, y, z, a) => handWeights(s, x, y, z, a), ao: jacketSdf, aoScale: 0.008 })
  }
  return out
}
function bakeSurf(ch: Chunk, s: Surf, p: Part, lod: number) {
  const grid = s.sample!, extra = p.ao
  const ao: Sdf = extra ? (x, y, z) => Math.min(grid(x, y, z), extra(x, y, z)) : grid
  const base = ch.n, sh = shade0(), w = new W4()
  for (let i = 0; i < s.vcount; i++) {
    const x = s.pos[i * 3], y = s.pos[i * 3 + 1], z = s.pos[i * 3 + 2], nx = s.nrm[i * 3], ny = s.nrm[i * 3 + 1], nz = s.nrm[i * 3 + 2]
    sh.fx = 0; p.shade(x, y, z, sh)
    const occ = sdfAO(ao, x, y, z, nx, ny, nz, p.aoScale ?? 0.012, 1.6)
    p.weights(x, y, z, w.reset()); w.finish(B.chest)
    const P: V3 = [x, y, z]
    const Pw = p.warp === 'none' ? P : warpBH(P, p.warp), Nw = p.warp === 'none' ? [nx, ny, nz] : warpN(P, [nx, ny, nz], p.warp)
    let aoK = lod ? 0.72 + 0.28 * occ : 0.52 + 0.48 * occ
    // 颈 / 颈下皮肤（兔头网格的人颈 + 衬衫开口里的皮肤是两张面）：同一个固定明暗，不按各自 SDF 的 AO 走 → 交界处不分色
    if ((p.name === 'head' || p.name === 'collar' || p.name === 'jacket') && sh.skin > 0.5 && y < 1.5) aoK = mix(aoK, 0.86, clamp(sh.skin, 0, 1))
    ch.vert(Pw, Nw, sh, w, aoK)
  }
  for (let i = 0; i < s.idx.length; i++) ch.idx.push(base + s.idx[i])
}
function extractPart(p: Part, lod: number) {
  let s: Surf = extract(p.sdf, { min: p.box.min, max: p.box.max, h: p.h[lod], keep: p.keep, within: p.within, project: 1 })
  if (p.target && s.idx.length / 3 > p.target[lod]) { s = decimate(s, p.target[lod]); reproject(p.sdf, s, 0, lod ? 0.003 : 0.0012) }
  return s
}
function bakePart(ch: Chunk, p: Part, lod: number, stats: Record<string, number>) {
  const t0 = performance.now()
  const s = extractPart(p, lod)
  stats[p.name + '_v0'] = ch.n // 部件顶点区间 [v0, v1)（自检脚本按部件取顶点）
  bakeSurf(ch, s, p, lod)
  stats[p.name + '_v1'] = ch.n
  stats[p.name] = s.idx.length / 3
  stats[p.name + '_ms'] = Math.round(performance.now() - t0)
  return s
}

// ---------- 薄壳 / 小件（行李员空间建造，warp 到迎宾女郎空间） ----------
function shell(ch: Chunk, P: (s: number, t: number) => V3, ns: number, nt: number, thick: (s: number, t: number) => number, shadeAt: (p: V3, s: number, t: number, o: Shade) => void, weightAt: (p: V3, acc: W4) => void, mode: WarpMode = 'trunk') {
  const wp = (p: V3) => (mode === 'none' ? p : warpBH(p, mode)), wn = (p: V3, n: V3) => (mode === 'none' ? n : warpN(p, n, mode))
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
      sh.fx = 0; shadeAt(p, i / ns, j / nt, sh); weightAt(p, w.reset()); w.finish(B.chest)
      ch.vert(wp(p), wn(p, scl(N[i][j], sg)), sh, w, sg > 0 ? 1 : 0.75)
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
      for (const p of q) { sh.fx = 0; shadeAt(p, i0 / ns, j0 / nt, sh); weightAt(p, w.reset()); w.finish(B.chest); ch.vert(wp(p), wn(p, en), sh, w) }
      ch.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }
  const e1: [number, number][] = [], e2: [number, number][] = [], e3: [number, number][] = [], e4: [number, number][] = []
  for (let i = 0; i <= ns; i++) { e1.push([i, 0]); e3.push([ns - i, nt]) }
  for (let j = 0; j <= nt; j++) { e2.push([ns, j]); e4.push([0, nt - j]) }
  rim(e1); rim(e3); rim(e2); rim(e4)
}
/** 扣子（扁圆顶 + 中间两个扣眼）：p 表面点、n 法线（行李员空间） */
function dome(ch: Chunk, p: V3, n: V3, r: number, h: number, seg: number, color: number, rough: number, metal: number, weightAt: (p: V3, acc: W4) => void, mode: WarpMode = 'auto') {
  const wp = (q: V3) => (mode === 'none' ? q : warpBH(q, mode)), wn = (q: V3, m: V3) => (mode === 'none' ? m : warpN(q, m, mode))
  const N = nrm(n), T = nrm(Math.abs(N[1]) < 0.9 ? cross([0, 1, 0], N) : cross([1, 0, 0], N)), Bt = cross(N, T)
  const sh = shade0(), w = new W4(), c = C3(color), rings = Math.max(3, Math.round(seg / 3))
  const base = ch.n
  for (let i = 0; i <= rings; i++) {
    const phi = (i / rings) * Math.PI / 2, rr = r * Math.cos(phi), hh = h * Math.sin(phi)
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a)
      const q = add(p, add(add(scl(T, ca * rr), scl(Bt, sa * rr)), scl(N, hh - h * 0.15)))
      const nn = nrm(add(add(scl(T, ca * Math.cos(phi) * h), scl(Bt, sa * Math.cos(phi) * h)), scl(N, Math.sin(phi) * r)))
      const rim = i === 1 ? 1.25 : 1, hole = i === rings ? 0.5 : 1
      const k = (0.8 + 0.35 * Math.max(0, dot(nn, nrm([0.3, 0.8, 0.5])))) * rim * hole
      sh.r = Math.min(1, c[0] * k); sh.g = Math.min(1, c[1] * k); sh.b = Math.min(1, c[2] * k); sh.rough = rough; sh.metal = metal; sh.fur = 0; sh.fx = 0
      weightAt(q, w.reset()); w.finish(B.chest)
      ch.vert(wp(q), wn(q, nn), sh, w)
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const a = base + i * seg + j, b = base + i * seg + ((j + 1) % seg); ch.idx.push(a, b, b + seg, a, b + seg, a + seg) }
  const top = ch.n; weightAt(p, w.reset()); w.finish(B.chest); { const tp = add(p, scl(N, h * 0.85)); ch.vert(wp(tp), wn(tp, N), sh, w) }
  for (let j = 0; j < seg; j++) ch.idx.push(base + rings * seg + j, base + rings * seg + ((j + 1) % seg), top)
}
/** 领口处西装 / 衬衫表面高度（沿方向 phi、半径 r） */
function bodyTopY(phi: number, r: number) {
  const x = NECK_HOLE.c[0] + Math.sin(phi) * r, z = NECK_HOLE.c[2] + Math.cos(phi) * r
  let lo = 1.36, hi = 1.62
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (bodySdf(x, m, z) < 0) lo = m; else hi = m }
  return lo
}
/** 衬衫领座（后高前低，前面敞开） */
const COL = { r0: 0.064, r1: 0.062, topF: 1.522, topB: 1.552, backDrop: 0.02, gap0: 0.34, gap1: 0.46 }
function collarPoint(s: number, t: number): V3 {
  const gap = mix(COL.gap0, COL.gap1, t)
  const phi = mix(gap, Math.PI * 2 - gap, s)
  const bk = (1 - Math.cos(phi)) * 0.5
  const r = mix(COL.r0, COL.r1, t) + 0.002 * bk
  // 正后方领座上沿压低 ~2 cm（bk³ 只集中在后颈一段）：颈背毛盖住领座，不露白边
  const y0 = bodyTopY(phi, r) - 0.008, y1 = Math.max(y0 + 0.006, mix(COL.topF, COL.topB, bk) - COL.backDrop * bk * bk * bk)
  return [NECK_HOLE.c[0] + Math.sin(phi) * r, mix(y0, y1, t), NECK_HOLE.c[2] + Math.cos(phi) * r]
}
function buildShells(ch: Chunk, lod: number) {
  const q = [1, 0.55, 0.3][lod], R = (n: number) => Math.max(3, Math.round(n * q))
  const white = (_p: V3, _s: number, t: number, o: Shade) => { const c = C3(0xf0eeea); const k = 0.86 + 0.14 * t; o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k; o.rough = 0.85; o.metal = 0; o.fur = 0 }
  const neckW = (p: V3, a: W4) => { const k = sstep(1.47, 1.53, p[1]) * 0.3; a.add(B.chest, 1 - k); a.add(B.neck, k) }
  // 衬衫领座
  shell(ch, collarPoint, R(40), R(5), () => 0.003, white, neckW)
  // 大尖翻领（附图）：上沿沿领座弧线绕着脖子（从前开口一直绕到颈侧），翻下来铺在驳头上，领尖往两边平铺（朝肩、外下）；
  // 有厚度（3.4 mm，翻折处 / 外缘更厚 = 卷边），外缘略往上翘；贴面高度按驳头实际凸起算 → 领尖压在驳头上不留缝
  for (const sd of [1, -1]) {
    const tip: V3 = [sd * 0.13, 1.37, 0.088], inner: V3 = [sd * 0.05, 1.41, 0.12]
    const S0 = sd > 0 ? 0.0 : 1.0, S1 = sd > 0 ? 0.19 : 0.81
    const P = (u: number, v: number): V3 => {
      // u：领子内边（靠颈 / V 边）→ 外边（领尖那条边）；v：翻折线 → 领尖 / 下沿
      const top = collarPoint(mix(S0, S1, u), mix(0.86, 1.0, u))
      const mid = add(scl(inner, 1 - u), scl(tip, u))
      const bot = add(mid, [0, 0.006 * Math.sin(Math.PI * u), 0]) // 下沿微凹（两个领尖之间往上收）
      const tipK = Math.pow(u, 1.5) * v
      let p = add(add(scl(top, 1 - v), scl(bot, v)), [sd * 0.01 * tipK, -0.008 * tipK, 0])
      if (v < 0.02) return p
      const e = Math.abs(p[0]) - frontW(p[1]), onLap = sstep(0.016, -0.001, lapelD(e, p[1])) * sstep(-0.03, -0.004, e) + sstep(-0.004, -0.03, e) // 驳头上：抬到驳头面；驳头外缘以外 1.6 cm 内渐落（盖住外缘不穿插）；V 口里也按驳头高度（领子悬在衬衫上方）
      const lift = 0.0021 + 0.0062 * Math.min(1, onLap) + 0.0085 * Math.pow(1 - v, 2.2) + 0.0035 * sstep(0.75, 1.0, u) * (1 - 0.6 * v) // 翻折鼓起 + 外缘上翘
      p = onSurface(jacketSmooth, p, lift)
      return p
    }
    const thick = (u: number, v: number) => 0.0034 + 0.0022 * gauss(v, 0.12) + 0.0014 * sstep(0.85, 1.0, u)
    shell(ch, P, R(14), R(14), thick, (p, u, v, o) => { white(p, u, v, o); const k = (1 - 0.16 * Math.pow(1 - v, 3)) * (1 - 0.08 * sstep(0.85, 1.0, u)); o.r *= k; o.g *= k; o.b *= k }, neckW)
  }
  const trunk = (_p: V3, a: W4) => { a.add(B.spine, 0.5); a.add(B.chest, 0.5) }
  // 双排扣：两列 × 两行（深色牛角扣）
  for (const y of BTN_Y) for (const sx of [1, -1]) {
    const x = sx * BTN_X + (sx < 0 ? 0 : 0)
    const p = onSurface(jacketSdf, [x, y, 0.2], 0), n = nrm(sub([x, y, 0.2], [x, y, -0.05]))
    dome(ch, add(p, scl(n, 0.0004)), n, 0.0085, 0.0032, lod ? 8 : 14, 0x2a1a12, 0.35, 0, trunk)
  }
  // 袖扣：每袖 4 粒（外侧近袖口，挨着排）
  for (const s of [1, -1]) {
    const A = ARM[s], S = s > 0 ? 'L' : 'R'
    const out = nrm(sub([s, 0, -0.35], scl(A.df, dot([s, 0, -0.35], A.df))))
    for (let k = 0; k < (lod >= 2 ? 0 : lod ? 2 : 4); k++) {
      const t = JCUFF_T - 0.04 - k * 0.026, c = add(A.e, scl(A.df, A.Lf * t))
      const p = onSurface(jacketSdf, add(c, scl(out, 0.06)), 0)
      dome(ch, add(p, scl(out, 0.0004)), out, 0.0048, 0.0022, lod ? 6 : 10, 0x22150f, 0.4, 0, (_p, a) => { a.add(B['foreArm' + S], 1) }, 'arm')
    }
  }
  void EDGE_X
}

// ---------- 壳层毛 ----------
interface FurSrc { pos: ArrayLike<number>; nrm: ArrayLike<number>; col: ArrayLike<number>; fur: ArrayLike<number>; si: ArrayLike<number>; sw: ArrayLike<number>; idx: ArrayLike<number>; comb: ArrayLike<number> }
/** 一张底网格 → N 层壳层（合并成一个几何）。每层：位置 = 底 + n·L·t·fur + comb·L·k·t²；aRest = 底网格位置（毛丝图案对齐） */
function furShells(src: FurSrc, layers: number, L: number, lean: number) {
  const nv = src.pos.length / 3, ni = src.idx.length
  const pos = new Float32Array(nv * 3 * layers), nor = new Float32Array(nv * 3 * layers), col = new Float32Array(nv * 3 * layers), rest = new Float32Array(nv * 3 * layers), sh = new Float32Array(nv * 2 * layers)
  const si = new Uint16Array(nv * 4 * layers), sw = new Float32Array(nv * 4 * layers), idx = new Uint32Array(ni * layers)
  for (let k = 0; k < layers; k++) {
    const t = (k + 1) / layers
    for (let i = 0; i < nv; i++) {
      const j = k * nv + i, f = src.fur[i]
      for (let c = 0; c < 3; c++) {
        pos[j * 3 + c] = src.pos[i * 3 + c] + src.nrm[i * 3 + c] * L * t * f + src.comb[i * 3 + c] * L * lean * t * t * f
        nor[j * 3 + c] = src.nrm[i * 3 + c]; col[j * 3 + c] = src.col[i * 3 + c]; rest[j * 3 + c] = src.pos[i * 3 + c]
      }
      sh[j * 2] = t; sh[j * 2 + 1] = f
      for (let c = 0; c < 4; c++) { si[j * 4 + c] = src.si[i * 4 + c]; sw[j * 4 + c] = src.sw[i * 4 + c] }
    }
    for (let i = 0; i < ni; i++) idx[k * ni + i] = k * nv + src.idx[i]
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setAttribute('aRest', new THREE.BufferAttribute(rest, 3)); g.setAttribute('aShell', new THREE.BufferAttribute(sh, 2))
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4))
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere(); g.boundingSphere!.radius *= 1.3
  return g
}
/** 头部壳层毛的底网格（减面版头部，单独提取） */
function headFurSrc(lod: number, stats: Record<string, number>): FurSrc {
  const target = [2300, 900, 0][lod]
  let s = extract(headSdf, { min: HEAD_BOX.min, max: HEAD_BOX.max, h: [0.0042, 0.0065, 0.01][lod], keep: (x, y) => headKeep(x, y) && y > 1.405, project: 1 })
  if (s.idx.length / 3 > target) { s = decimate(s, target); reproject(headSdf, s, 0, 0.0015) }
  const pos: number[] = [], nrmA: number[] = [], col: number[] = [], fur: number[] = [], si: number[] = [], sw: number[] = [], comb: number[] = []
  const sh = shade0(), w = new W4()
  for (let i = 0; i < s.vcount; i++) {
    const p: V3 = [s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]], n: V3 = [s.nrm[i * 3], s.nrm[i * 3 + 1], s.nrm[i * 3 + 2]]
    headShade(p[0], p[1], p[2], sh); headWeights(p[0], p[1], p[2], w.reset()); w.finish(B.head)
    pos.push(...p); nrmA.push(...n); col.push(lin(sh.r), lin(sh.g), lin(sh.b)); fur.push(sh.fur); comb.push(...furComb(p, n))
    si.push(...w.i); sw.push(...w.w)
  }
  // 毛长为 0 的三角形不要（鼻垫 / 颈部皮肤）
  const idx: number[] = []
  for (let t = 0; t < s.idx.length; t += 3) { const a = s.idx[t], b = s.idx[t + 1], c = s.idx[t + 2]; if (fur[a] + fur[b] + fur[c] > 0.12) idx.push(a, b, c) }
  stats.furSrcTris = idx.length / 3
  return { pos, nrm: nrmA, col, fur, si, sw, idx, comb }
}
/** 耳外侧壳层毛的底（外侧网格；梳向 = 耳尖方向） */
function earFurSrc(g: THREE.BufferGeometry): FurSrc {
  const P = g.attributes.position, N = g.attributes.normal, Cc = g.attributes.color, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, A = g.attributes.aEar
  const n = P.count, fur: number[] = [], comb: number[] = []
  for (let i = 0; i < n; i++) {
    const t = A.getX(i), x = P.getX(i), d = earDir(x >= 0 ? 1 : -1), nn: V3 = [N.getX(i), N.getY(i), N.getZ(i)]
    fur.push(mix(1.7, 1, sstep(0.0, 0.16, t)) * (1 - 0.4 * t)) // 耳根毛厚（包住插接处）
    const tt = sub(d, scl(nn, dot(d, nn))); comb.push(...nrm(tt))
  }
  const lc = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) lc[i] = (Cc.array as Float32Array)[i]
  return { pos: P.array as Float32Array, nrm: N.array as Float32Array, col: lc, fur, si: SI.array as Uint16Array, sw: SW.array as Float32Array, idx: g.index!.array as Uint32Array, comb }
}

// ---------- 几何缓存 ----------
interface Built { body: THREE.BufferGeometry; fur: THREE.BufferGeometry | null; earIn: THREE.BufferGeometry; earOut: THREE.BufferGeometry; earFur: THREE.BufferGeometry | null; eye: THREE.BufferGeometry; whisk: THREE.BufferGeometry; stats: Record<string, number> }
const cache: Record<number, Built> = {}
/** LOD 参数：壳层层数 / 毛长 */
export const SPOKES_LOD = [{ headLayers: 6, earLayers: 2 }, { headLayers: 3, earLayers: 0 }, { headLayers: 0, earLayers: 0 }]
const FUR_L = 0.0088, EAR_FUR_L = 0.0034
function addRest(g: THREE.BufferGeometry) {
  const p = g.attributes.position, n = g.attributes.normal
  g.setAttribute('aRest', new THREE.BufferAttribute(new Float32Array(p.array as Float32Array), 3))
  g.setAttribute('aRN', new THREE.BufferAttribute(new Float32Array(n.array as Float32Array), 3))
}
export function spokesGeometryReady(lod = 0): boolean { return !!cache[lod] }
export function buildSpokesGeometry(lod = 0): Built {
  const task = prepareSpokesGeometry(lod)
  let step = task.next()
  while (!step.done) step = task.next()
  return step.value
}
export function* prepareSpokesGeometry(lod = 0): Generator<void, Built> {
  lod = Math.max(0, Math.min(LODS - 1, lod))
  if (cache[lod]) return cache[lod]
  const t0 = performance.now(), stats: Record<string, number> = {}
  const ch = new Chunk()
  for (const p of parts(lod)) { yield; bakePart(ch, p, lod, stats) }
  yield
  bakePart(ch, { name: 'head', warp: 'none', sdf: headSdf, box: HEAD_BOX, h: [0.0024, 0.0045, 0.008], target: [6600, 2400, 800], keep: (x, y) => headKeep(x, y), shade: headShade, weights: headWeights, aoScale: 0.008 }, lod, stats)
  yield
  buildShells(ch, lod)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(ch.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(ch.nrm, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(ch.col, 3)); g.setAttribute('aMat', new THREE.Float32BufferAttribute(ch.mat, 2)); g.setAttribute('aRM', new THREE.Float32BufferAttribute(ch.rm, 2))
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(ch.si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(ch.sw, 4))
  g.setIndex(ch.n > 65535 ? new THREE.Uint32BufferAttribute(ch.idx, 1) : new THREE.Uint16BufferAttribute(ch.idx, 1))
  addRest(g); g.computeBoundingSphere(); g.boundingSphere!.radius *= 1.3
  stats.bodyTris = ch.idx.length / 3
  const L = SPOKES_LOD[lod]
  yield
  const fur = L.headLayers ? furShells(headFurSrc(lod, stats), L.headLayers, FUR_L * (lod ? 0.85 : 1), 0.9) : null
  stats.furTris = fur ? fur.index!.count / 3 : 0
  const ears = buildEarGeometry(lod, (p) => earOuterColor(p, 0, 0).map(lin))
  // 外侧颜色按 t / v 重新上（buildEarGeometry 传入 p,t,v）
  {
    const A = ears.outer.attributes.aEar, P = ears.outer.attributes.position, Cc = ears.outer.attributes.color
    for (let i = 0; i < P.count; i++) { const c = earOuterColor([P.getX(i), P.getY(i), P.getZ(i)], A.getX(i), A.getY(i)); Cc.setXYZ(i, lin(c[0]), lin(c[1]), lin(c[2])) }
  }
  addRest(ears.outer); addRest(ears.inner)
  ears.outer.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(ears.outer.attributes.position.count * 2).map((_, i) => (i % 2 && L.earLayers ? 0.6 : 0)), 2))
  ears.outer.setAttribute('aRM', new THREE.BufferAttribute(new Float32Array(ears.outer.attributes.position.count * 2).fill(0.85), 2))
  if (!L.headLayers) { const am = g.attributes.aMat; for (let i = 0; i < am.count; i++) am.setY(i, Math.min(0, am.getY(i))) }
  stats.earTris = (ears.inner.index!.count + ears.outer.index!.count) / 3
  const earFur = L.earLayers ? furShells(earFurSrc(ears.outer), L.earLayers, EAR_FUR_L, 0.8) : null
  stats.earFurTris = earFur ? earFur.index!.count / 3 : 0
  const eye = buildEyeGeometry(lod)
  stats.eyeTris = 2 * (eye.index ? eye.index.count / 3 : 0)
  const whisk = buildWhiskerGeometry(lod)
  stats.whiskerTris = whisk.index!.count / 3
  stats.ms = Math.round(performance.now() - t0)
  return (cache[lod] ??= { body: g, fur, earIn: ears.inner, earOut: ears.outer, earFur, eye, whisk, stats })
}

// ======================================================================
// 材质
// ======================================================================
/** 格纹 / 毛色统一变量（所有实例共享） */
export const SPOKES_UNI = {
  /** 格纹：底色、暗格带、浅褐细线、锈红细线（线性色） */
  uPlaidBase: { value: new THREE.Color('#35251d') },
  uPlaidBand: { value: new THREE.Color('#2a1c16') },
  uPlaidLine: { value: new THREE.Color('#86684f') },
  uPlaidRust: { value: new THREE.Color('#7d3d29') },
  /** 格距（m）、暗格带宽、细线宽 */
  uPlaid: { value: new THREE.Vector3(0.034, 0.0105, 0.0011) },
  /** 毛丝密度（每米格数）、毛丝粗细（格内半径） */
  uFur: { value: new THREE.Vector2(880, 0.4) },
  /** V 口带：衬衫白 / 皮肤（线性色；皮肤和兔头颈部同一个色） */
  uShirtC: { value: new THREE.Color(SHIRT_HEX) },
  uSkinC: { value: new THREE.Color(SKIN_HEX) },
  /** 底网格有壳层毛时底绒压暗（LOD2 无壳层 = 0） */
  uFurBase: { value: 0.0 },
}
const GLSL_HASH = `
vec3 spHash33(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float spHash13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
`
const GLSL_PLAID = `
float spLine(float x, float period, float w, float fw){
  float f = abs(fract(x / period + 0.5) - 0.5) * period;
  float aa = max(fw, 1e-5);
  float c = 1.0 - smoothstep(0.5 * w - aa, 0.5 * w + aa, f);
  return mix(c, w / period, smoothstep(0.3, 0.9, fw / w));
}
vec3 spPlaid2(vec2 q, float fw, float skirt){
  float P = uPlaid.x, BW = uPlaid.y, LW = uPlaid.z;
  q += skirt * vec2(0.0, 0.011);
  float bx = spLine(q.x, P, BW, fw), by = spLine(q.y, P, BW, fw);
  float lx = spLine(q.x + 0.0, P, LW, fw), ly = spLine(q.y, P, LW, fw);
  float rx = spLine(q.x + 0.5 * P, P, LW * 0.6, fw), ry = spLine(q.y + 0.5 * P, P, LW * 0.6, fw);
  // 细格（每格里再一道极细暗线）
  float gx = spLine(q.x + 0.25 * P, P * 0.5, LW * 0.5, fw), gy = spLine(q.y + 0.25 * P, P * 0.5, LW * 0.5, fw);
  vec3 c = uPlaidBase;
  c = mix(c, uPlaidBand, 0.5 * bx); c = mix(c, uPlaidBand, 0.5 * by);
  c = mix(c, uPlaidBand * 0.8, 0.35 * max(gx, gy));
  c = mix(c, uPlaidRust, 0.45 * max(rx, ry));
  c = mix(c, uPlaidLine, 0.62 * max(lx, ly));
  // 粗花呢点（随机明暗小点，远处淡出）
  vec3 cell = floor(vec3(q * 900.0, 0.0));
  float tw = spHash13(cell) - 0.5;
  c *= 1.0 + 0.22 * tw * (1.0 - smoothstep(0.0006, 0.0018, fw));
  // 斜纹
  c *= 1.0 + 0.06 * sin((q.x + q.y) * 2600.0) * (1.0 - smoothstep(0.0003, 0.0009, fw));
  return c;
}
vec3 spPlaid(vec3 p, vec3 n, float skirt){
  float fw = length(fwidth(p)) * 0.7;
  vec3 w = pow(abs(n), vec3(6.0)); w /= (w.x + w.y + w.z + 1e-5);
  vec3 c = vec3(0.0);
  if (w.z > 0.01) c += w.z * spPlaid2(p.xy, fw, skirt);
  if (w.x > 0.01) c += w.x * spPlaid2(vec2(p.z + 0.007, p.y), fw, skirt);
  if (w.y > 0.01) c += w.y * spPlaid2(p.xz, fw, skirt);
  return c;
}
`
/** V 口带：静止坐标（迎宾女郎空间）里解析算 V 边 / 衬衫开口边（行李员空间版型 × 躯干横向缩放 SX × K），按屏幕导数抗锯齿 */
const glf = (v: number) => v.toFixed(5)
const GLSL_VEDGE = `
uniform vec3 uShirtC, uSkinC;
float spSX(float y){
  ${SX_PTS.map((p, i) => i === 0 ? `if (y <= ${glf(p[0])}) return ${glf(p[1])};` : `if (y <= ${glf(p[0])}) { float t = (y - ${glf(SX_PTS[i - 1][0])}) / ${glf(p[0] - SX_PTS[i - 1][0])}; t = t * t * (3.0 - 2.0 * t); return mix(${glf(SX_PTS[i - 1][1])}, ${glf(p[1])}, t); }`).join('\n  ')}
  return ${glf(SX_PTS[SX_PTS.length - 1][1])};
}
vec3 spVBand(vec3 p, vec3 n, vec3 base){
  float yb = p.y / ${glf(SK)}, ax = abs(p.x), sx = spSX(yb) * ${glf(SK)};
  float fw = yb > ${glf(V0)} ? ${glf(FRONT_W.w)} * pow(clamp((yb - ${glf(V0)}) / ${glf(FRONT_W.y1 - V0)}, 0.0, 1.0), ${glf(FRONT_W.p)}) : 0.0;
  float so = yb > ${glf(SHIRT_OPEN.y0)} ? ${glf(SHIRT_OPEN.w)} * pow(clamp((yb - ${glf(SHIRT_OPEN.y0)}) / ${glf(SHIRT_OPEN.y1 - SHIRT_OPEN.y0)}, 0.0, 1.0), ${glf(SHIRT_OPEN.p)}) : 0.0;
  float eV = ax - fw * sx, eS = ax - so * sx;
  float aV = max(fwidth(eV), 2e-4), aS = max(fwidth(eS), 2e-4);
  float jac = max(smoothstep(-aV, aV, eV - 0.0006), 1.0 - smoothstep(${glf(V0 - 0.002)}, ${glf(V0 + 0.006)}, yb));
  float sk = (1.0 - smoothstep(-aS, aS, eS + 0.0004)) * smoothstep(${glf(SHIRT_OPEN.y0)}, ${glf(SHIRT_OPEN.y0 + 0.012)}, yb);
  float lip = (eV - 0.0014) / max(0.0011, aV), edge = eS / max(0.0016, aS);
  vec3 jc = spPlaid(p, n, 0.0) * (1.0 - 0.5 * exp(-lip * lip));
  vec3 inner = mix(uShirtC * (1.0 - 0.1 * exp(-edge * edge) * step(0.0001, so)), uSkinC, sk);
  return mix(inner, jc, jac);
}
`
/** 身体材质补丁：格纹（aMat.x = 1 西装 / 2 裙；aMat.y = −1 V 口带）、底绒压暗（aMat.y = 毛长）、丝袜光泽 */
function bodyPatch(m: THREE.Material) {
  const prev = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey()
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r)
    Object.assign(sh.uniforms, { uShirtC: SPOKES_UNI.uShirtC, uSkinC: SPOKES_UNI.uSkinC, uPlaidBase: SPOKES_UNI.uPlaidBase, uPlaidBand: SPOKES_UNI.uPlaidBand, uPlaidLine: SPOKES_UNI.uPlaidLine, uPlaidRust: SPOKES_UNI.uPlaidRust, uPlaid: SPOKES_UNI.uPlaid, uFurBase: SPOKES_UNI.uFurBase })
    Object.assign(sh.uniforms, SKIRT_UNI)
    sh.vertexShader = 'attribute vec3 aRest;\nattribute vec3 aRN;\nattribute vec2 aMat;\nvarying vec3 vSpRest;\nvarying vec3 vSpRN;\nvarying vec2 vSpMat;\n' + GLSL_SKIRT_DECL + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSpRest = aRest; vSpRN = aRN; vSpMat = aMat;').replace('#include <skinning_vertex>', '#include <skinning_vertex>\n' + GLSL_SKIRT_PUSH)
    sh.fragmentShader = 'uniform vec3 uPlaidBase, uPlaidBand, uPlaidLine, uPlaidRust; uniform vec3 uPlaid; uniform float uFurBase;\nvarying vec3 vSpRest;\nvarying vec3 vSpRN;\nvarying vec2 vSpMat;\n' + GLSL_HASH + GLSL_PLAID + GLSL_VEDGE +
      sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      if (vSpMat.y < -0.5) diffuseColor.rgb *= spVBand(vSpRest, normalize(vSpRN), diffuseColor.rgb);
      else if (vSpMat.x > 0.5 && vSpMat.x < 2.5) diffuseColor.rgb *= spPlaid(vSpRest, normalize(vSpRN), vSpMat.x > 1.5 ? 1.0 : 0.0) * 1.0;
      if (vSpMat.y > 0.01) { vec3 q = vSpRest * 420.0; float nn = mix(spHash13(floor(q)), 0.5, smoothstep(0.8, 1.6, length(fwidth(q)))); diffuseColor.rgb *= mix(1.0, 0.62 + 0.25 * nn, uFurBase * min(vSpMat.y, 1.0)); }`)
  }
  m.customProgramCacheKey = () => key + '|spokes-body-skirt'
  return m
}
/** 壳层毛：3D 细胞噪声毛丝（aRest = 底网格位置，层间对齐成一根根毛）；毛根深、毛梢浅、针毛深梢 */
function furPatch(m: THREE.Material, tag: string, den: number) {
  const prev = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey()
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r)
    sh.uniforms.uFur = SPOKES_UNI.uFur
    sh.vertexShader = 'attribute vec3 aRest;\nattribute vec2 aShell;\nvarying vec3 vSpRest;\nvarying vec2 vSpShell;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSpRest = aRest; vSpShell = aShell;')
    sh.fragmentShader = 'uniform vec2 uFur;\nvarying vec3 vSpRest;\nvarying vec2 vSpShell;\n' + GLSL_HASH + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 q = vSpRest * uFur.x * ${den.toFixed(3)};
        vec3 iq = floor(q), fq = fract(q);
        float f1 = 9.0; vec3 idc = vec3(0.0);
        for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) for (int k = -1; k <= 1; k++) {
          vec3 g = vec3(float(i), float(j), float(k)), o = spHash33(iq + g), rr = g + o - fq; float d = dot(rr, rr);
          if (d < f1) { f1 = d; idc = iq + g; }
        }
        f1 = sqrt(f1);
        float id = spHash13(idc), h = vSpShell.x, fl = vSpShell.y;
        // 远景：毛丝格子小于约 1 像素时逐格开孔 / 明暗会闪成颗粒噪点 → 渐变成「最内一层实心、其余层不画、毛色取平均」
        float far = smoothstep(1.3, 2.6, length(fwidth(q)));
        float len = mix(mix(0.55, 1.0, fract(id * 7.31)), 0.2, far);
        float rad = uFur.y * (1.0 - h / max(len, 1e-3));
        float fw = max(fwidth(f1), 0.02);
        float cov = mix(1.0 - smoothstep(rad - fw, rad + fw, f1), 1.0, far);
        if (fl < 0.06 || h > len || cov < 0.5) discard;
        float tone = mix(0.72 + 0.56 * fract(id * 13.7), 1.0, far);
        float guard = step(0.93, fract(id * 3.17)) * (1.0 - far);
        vec3 c = diffuseColor.rgb * tone * mix(mix(0.92, 0.55, min(fl, 1.0)), 1.12, smoothstep(0.0, 0.85, h));
        c = mix(c, c * 0.35, guard * smoothstep(0.6, 1.0, h / len));
        diffuseColor.rgb = c;
      }`)
  }
  m.customProgramCacheKey = () => key + '|spokes-fur-' + tag
  return m
}
/** 刚性小件的湿 / 亮高光（眼球） */
export const SPOKES_SPEC = { uSpecDir: { value: new THREE.Vector3(0.35, 0.62, 0.7).normalize() } }
function shinePatch(m: THREE.Material, power: number, k: number, tag: string) {
  const prev = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey()
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r)
    sh.uniforms.uSpecDir = SPOKES_SPEC.uSpecDir
    sh.fragmentShader = 'uniform vec3 uSpecDir;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { vec3 Vv = normalize(vViewPosition); vec3 Hh = normalize(uSpecDir + Vv); totalEmissiveRadiance += ${k.toFixed(3)} * pow(max(dot(normal, Hh), 0.0), ${power.toFixed(1)}) * vec3(1.0); }`)
  }
  m.customProgramCacheKey = () => key + '|spokes-shine-' + tag
  return m
}
let MATS: { body: THREE.Material; fur: THREE.Material; earFur: THREE.Material; earIn: THREE.Material; eye: THREE.Material; whisk: THREE.Material } | null = null
export function spokesMaterials() {
  if (MATS) return MATS
  const body = bodyPatch(litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.8 }))
  const fur = furPatch(litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.9 }), 'head', 1)
  const earFur = furPatch(litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.9 }), 'ear', 1.25)
  const et = earInnerTexture()
  const earIn = litMaterial({ color: '#ffffff', map: et ?? undefined, emissive: '#221a16', emissiveMap: et ?? undefined, roughness: 0.6, side: THREE.FrontSide } as THREE.MeshLambertMaterialParameters)
  const ey = eyeTexture()
  const eye = shinePatch(litMaterial({ color: '#ffffff', map: ey ?? undefined, roughness: 0.08 }), 140, 1.6, 'eye')
  const whisk = litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.4 })
  return (MATS = { body, fur, earFur, earIn, eye, whisk })
}

// ======================================================================
// 装配
// ======================================================================
export interface SpokesArm { side: number; clav: THREE.Bone; shoulder: THREE.Bone; elbow: THREE.Bone; wrist: THREE.Bone; fingers: Record<'thumb' | 'index' | 'middle' | 'ring' | 'pinky', THREE.Bone[]> }
export interface SpokesLeg { side: number; hip: THREE.Bone; knee: THREE.Bone; ankle: THREE.Bone; toe: THREE.Bone }
export interface SpokesRig {
  root: THREE.Bone; hips: THREE.Bone; spine: THREE.Bone; chest: THREE.Bone; neck: THREE.Bone; head: THREE.Bone
  armL: SpokesArm; armR: SpokesArm; legL: SpokesLeg; legR: SpokesLeg
  /** 兔耳每侧 3 节（0 根部 → 2 耳尖段） */
  earL: THREE.Bone[]; earR: THREE.Bone[]
  nose: THREE.Bone; whiskerL: THREE.Bone; whiskerR: THREE.Bone; jaw: THREE.Bone
  eyes: THREE.Mesh[]
  /** 领口小音箱（挂 chest） */
  speaker: THREE.Group
  bones: Record<string, THREE.Bone>; body: THREE.SkinnedMesh; fur: THREE.SkinnedMesh | null; earIn: THREE.SkinnedMesh; earOut: THREE.SkinnedMesh; earFur: THREE.SkinnedMesh | null; whiskers: THREE.SkinnedMesh
  lod: number
}

/** 造一个迎宾女郎实例（几何 / 材质按 LOD 共享缓存；骨骼每实例一套） */
export function buildSpokes(opts: { lod?: number } = {}): THREE.Group {
  const lod = Math.max(0, Math.min(LODS - 1, opts.lod ?? 0))
  const geo = buildSpokesGeometry(lod)
  const M = spokesMaterials()
  shareHotelRigAssets({ ...geo, ...M })
  SPOKES_UNI.uFurBase.value = 1
  const face = new THREE.Group(); face.name = 'spokes'; face.rotation.y = Math.PI / 2; face.userData.facesZ = 1
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
  const sk = (g: THREE.BufferGeometry, m: THREE.Material, name: string, shadow = true) => { const o = new THREE.SkinnedMesh(g, m); o.name = name; o.castShadow = shadow; o.receiveShadow = true; o.frustumCulled = false; return o }
  const body = sk(geo.body, M.body, 'spokesBody')
  const fur = geo.fur ? sk(geo.fur, M.fur, 'spokesFur', false) : null
  const earIn = sk(geo.earIn, M.earIn, 'spokesEarInner'), earOut = sk(geo.earOut, M.body, 'spokesEarOuter')
  const earFur = geo.earFur ? sk(geo.earFur, M.earFur, 'spokesEarFur', false) : null
  const whiskers = sk(geo.whisk, M.whisk, 'spokesWhiskers', false)
  const meshes = [body, earIn, earOut, whiskers, ...(fur ? [fur] : []), ...(earFur ? [earFur] : [])]
  face.add(...meshes)
  face.updateMatrixWorld(true)
  const skel = new THREE.Skeleton(bones)
  for (const m of meshes) m.bind(skel, m.matrixWorld)
  for (const b of bones) b.userData.rest = { p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }
  const bn: Record<string, THREE.Bone> = {}; for (const d of BONES) bn[d.name] = bones[B[d.name]]
  const arm = (s: number): SpokesArm => {
    const S = s > 0 ? 'L' : 'R', fingers = {} as SpokesArm['fingers']
    for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky'] as const) fingers[f] = [1, 2, 3].map((k) => bn[f + k + S])
    return { side: s, clav: bn['clav' + S], shoulder: bn['upperArm' + S], elbow: bn['foreArm' + S], wrist: bn['hand' + S], fingers }
  }
  const leg = (s: number): SpokesLeg => { const S = s > 0 ? 'L' : 'R'; return { side: s, hip: bn['thigh' + S], knee: bn['shin' + S], ankle: bn['foot' + S], toe: bn['toe' + S] } }
  // 眼球（刚性，挂 head；局部原点 = 球心）
  const eyes: THREE.Mesh[] = []
  const headP = new THREE.Vector3(...BONES[B.head].pos)
  for (const s of [1, -1]) { const e = new THREE.Mesh(geo.eye, M.eye); e.name = 'spokesEye' + (s > 0 ? 'L' : 'R'); e.quaternion.copy(eyeQuat(s)); e.position.set(...eyeC(s)).sub(headP); bn.head.add(e); eyes.push(e) }
  // 领口小音箱：左驳头上（角色左 +X），挂 chest
  const speaker = buildCollarSpeaker()
  {
    const pBH = onSurface(bodySdf, [0.086, 1.312, 0.2], 0.0015), nBH = nrm(sub([0.086, 1.312, 0.2], [0.07, 1.312, 0.0]))
    const P = warpBH(pBH, 'trunk'), N = warpN(pBH, nBH, 'trunk'), chestP = new THREE.Vector3(...BONES[B.chest].pos)
    speaker.position.set(P[0], P[1], P[2]).sub(chestP)
    speaker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(N[0], N[1] * 0.3, N[2]).normalize())
    speaker.rotateZ(-0.12)
    bn.chest.add(speaker)
  }
  installSkirtCollide(body, bn)
  const rig: SpokesRig = {
    root: bones[0], hips: bn.hips, spine: bn.spine, chest: bn.chest, neck: bn.neck, head: bn.head,
    armL: arm(1), armR: arm(-1), legL: leg(1), legR: leg(-1),
    earL: [0, 1, 2].map((k) => bn['earL' + k]), earR: [0, 1, 2].map((k) => bn['earR' + k]), nose: bn.nose, whiskerL: bn.whiskerL, whiskerR: bn.whiskerR, jaw: bn.jaw,
    eyes, speaker, bones: bn, body, fur, earIn, earOut, earFur, whiskers, lod,
  }
  face.userData.spokes = rig
  face.userData.spokesStats = { ...geo.stats }
  return face
}

// ======================================================================
// 静帧姿势（骨骼摆出；阶段 2 动画会替换）：'rest'（建模姿态，手垂在身侧）、'A'、'T'、'cross'（附图式双臂交叉）
// ======================================================================
const restOf = (b: THREE.Bone) => { const r = b.userData.rest; b.position.copy(r.p); b.quaternion.copy(r.q); b.scale.copy(r.s) }
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q1 = new THREE.Quaternion()
/** 让骨骼 b 的子点 child（世界）指向目标 target（世界）：在世界里求最短旋转再换算到局部 */
function aimBone(b: THREE.Bone, childWorld: THREE.Vector3, targetWorld: THREE.Vector3) {
  const bp = b.getWorldPosition(_v1)
  const from = _v2.copy(childWorld).sub(bp).normalize(), to = _v3.copy(targetWorld).sub(bp).normalize()
  const qw = _q1.setFromUnitVectors(from, to)
  const parentQ = b.parent!.getWorldQuaternion(new THREE.Quaternion())
  const curW = parentQ.clone().multiply(b.quaternion)
  const newW = qw.multiply(curW)
  b.quaternion.copy(parentQ.invert().multiply(newW))
  b.updateMatrixWorld(true)
}
/** 两骨 IK：把腕放到 target（root 空间 = 模型空间），肘朝 pole 方向 */
export function spokesArmIK(rig: SpokesRig, A: SpokesArm, target: V3, pole: V3) {
  const root = rig.root.parent!
  root.updateMatrixWorld(true)
  const W = (p: V3) => root.localToWorld(new THREE.Vector3(...p))
  const S = A.shoulder.getWorldPosition(new THREE.Vector3()), E = A.elbow.getWorldPosition(new THREE.Vector3()), Wr = A.wrist.getWorldPosition(new THREE.Vector3())
  const L1 = S.distanceTo(E), L2 = E.distanceTo(Wr)
  const T = W(target), d = Math.min(L1 + L2 - 1e-4, Math.max(Math.abs(L1 - L2) + 1e-4, S.distanceTo(T)))
  const dir = T.clone().sub(S).normalize()
  const pw = W(pole).sub(S); const perp = pw.sub(dir.clone().multiplyScalar(pw.dot(dir))).normalize()
  const a = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a * L1 * L1))
  const Et = S.clone().add(dir.clone().multiplyScalar(a * L1)).add(perp.multiplyScalar(h))
  aimBone(A.shoulder, E, Et)
  const E2 = A.elbow.getWorldPosition(new THREE.Vector3()), W2 = A.wrist.getWorldPosition(new THREE.Vector3())
  void E2
  aimBone(A.elbow, W2, S.clone().add(dir.multiplyScalar(d)))
}
/** 手腕朝向：让手骨的「指尖方向」（rest 下的手部 a 轴）指向 aDir、手背朝 back（模型空间方向） */
export function spokesHandAim(rig: SpokesRig, A: SpokesArm, aDir: V3, back: V3) {
  const root = rig.root.parent!; root.updateMatrixWorld(true)
  const F = BH_HAND[A.side].F
  // rest 下手骨世界朝向 = 模型朝向（骨骼无旋转）；求 rest 局部的 a / d 轴（行李员空间方向近似 = 迎宾女郎空间方向）
  const ra = new THREE.Vector3(...F.a), rd = new THREE.Vector3(...F.d)
  const ta = new THREE.Vector3(...nrm(aDir)), td = new THREE.Vector3(...nrm(back))
  const mR = new THREE.Matrix4().makeBasis(ra, rd, ra.clone().cross(rd).normalize())
  const tdo = td.clone().sub(ta.clone().multiplyScalar(td.dot(ta))).normalize()
  const mT = new THREE.Matrix4().makeBasis(ta, tdo, ta.clone().cross(tdo).normalize())
  const rdo = rd.clone().sub(ra.clone().multiplyScalar(rd.dot(ra))).normalize()
  mR.makeBasis(ra, rdo, ra.clone().cross(rdo).normalize())
  const qR = new THREE.Quaternion().setFromRotationMatrix(mR), qT = new THREE.Quaternion().setFromRotationMatrix(mT)
  const rootQ = root.getWorldQuaternion(new THREE.Quaternion())
  const qWorld = rootQ.clone().multiply(qT).multiply(qR.invert())
  const parentQ = A.wrist.parent!.getWorldQuaternion(new THREE.Quaternion())
  A.wrist.quaternion.copy(parentQ.invert().multiply(qWorld))
  A.wrist.updateMatrixWorld(true)
}
/** 拇指外展：绕手背法线（rest 模型空间）转拇指根节 */
function thumbAbd(A: SpokesArm, ang: number) { const d = BH_HAND[A.side].F.d, q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...d), ang); const t = A.fingers.thumb[0]; t.quaternion.premultiply(q) }
const flexF = (bs: THREE.Bone[], a: number[]) => bs.forEach((b, i) => { restOf(b); b.quaternion.setFromAxisAngle(b.userData.flexAxis, a[i]) })
export type SpokesPose = 'rest' | 'A' | 'T' | 'cross'
/** 双臂交叉静帧的腕位置 / 肘极点 / 手朝向（模型空间） */
export const CROSS = {
  rW: [0.093, 1.098, 0.12] as V3, rPole: [-0.582, 1.136, 0.177] as V3, rDir: [0.45, 0.35, -0.82] as V3, rBack: [0.85, -0.1, 0.5] as V3,
  lW: [-0.108, 1.194, 0.159] as V3, lPole: [2.667, 0.82, 0.134] as V3, lDir: [-0.989, 0.61, -0.803] as V3, lBack: [0.245, 1.468, 0.38] as V3, lThumb: 0.442,
  lFlex: { index: [0.48, 1.07, 0.51], middle: [0.58, 1.16, 0.45], ring: [0.79, 0.88, 0.74], pinky: [0.78, 1.18, 0.62], thumb: [-0.35, -0.3, 0] } as Record<'index' | 'middle' | 'ring' | 'pinky' | 'thumb', number[]>,
}
export function setSpokesPose(rig: SpokesRig, pose: SpokesPose) {
  for (const b of Object.values(rig.bones)) restOf(b)
  rig.root.parent!.updateMatrixWorld(true)
  if (pose === 'rest') return rig
  const sh = (s: number): V3 => { const p = BONES[B[s > 0 ? 'upperArmL' : 'upperArmR']].pos; return p }
  if (pose === 'T' || pose === 'A') {
    const ang = pose === 'T' ? 0.02 : 0.72
    for (const A of [rig.armL, rig.armR]) {
      const s = A.side, S0 = sh(s), L = 0.505
      spokesArmIK(rig, A, [S0[0] + s * L * Math.cos(ang), S0[1] - L * Math.sin(ang), S0[2] - 0.005], [S0[0] + s * 0.2, S0[1] - 0.1, S0[2] - 0.6])
      spokesHandAim(rig, A, [s * Math.cos(ang), -Math.sin(ang), 0], [0, Math.cos(ang) * 0.9, -0.3])
      for (const f of ['index', 'middle', 'ring', 'pinky'] as const) flexF(A.fingers[f], [0.12, 0.16, 0.1])
    }
    return rig
  }
  // 'cross'（附图）：前臂抬到胸下 / 肋部高度相叠——右前臂在下、贴着身体，右手压在左臂（左肘）下；
  //   左前臂叠在上面、略高略靠前，左手真正握住右上臂（肘上方，手指绕到上臂外侧包住）
  rig.chest.rotation.x = -0.03
  rig.root.parent!.updateMatrixWorld(true)
  spokesArmIK(rig, rig.armR, CROSS.rW, CROSS.rPole)
  spokesHandAim(rig, rig.armR, CROSS.rDir, CROSS.rBack)
  spokesArmIK(rig, rig.armL, CROSS.lW, CROSS.lPole)
  spokesHandAim(rig, rig.armL, CROSS.lDir, CROSS.lBack)
  // 左手：四指弯曲包住右上臂、拇指在上臂内侧前面按住；右手：手指半收，压在左肘下
  for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb'] as const) flexF(rig.armL.fingers[f], CROSS.lFlex[f])
  thumbAbd(rig.armL, CROSS.lThumb)
  for (const f of ['index', 'middle', 'ring', 'pinky'] as const) flexF(rig.armR.fingers[f], [0.4, 0.5, 0.3])
  flexF(rig.armR.fingers.thumb, [0.15, 0.2, 0.15])
  return rig
}

/** 三角形统计（只算可见网格；不含 CPU 替身） */
export function spokesTris(o: THREE.Object3D) {
  let t = 0, n = 0, fur = 0, small = 0
  o.traverse((m) => {
    const x = m as THREE.Mesh; if (!x.isMesh || x.userData.cpuSkin) return
    let vis = true; for (let p: THREE.Object3D | null = x; p && p !== o; p = p.parent) if (!p.visible) vis = false
    if (!vis) return
    n++; const g = x.geometry, kk = (g.index ? g.index.count : g.attributes.position.count) / 3
    t += kk; if (x.name === 'spokesFur' || x.name === 'spokesEarFur') fur += kk; else if (x.name !== 'spokesBody') small += kk
  })
  return { tris: Math.round(t), meshes: n, fur: Math.round(fur), small: Math.round(small) }
}
export { clamp, lenv, EAR }
