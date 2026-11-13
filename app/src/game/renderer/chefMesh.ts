import {requestHotelGeometry} from './hotelGeometryQueue'
import {unpackGeometryTree} from './geometryPacket'
import { shareHotelRigAssets } from './shared'
// [chef] 厨师（Entity 800 / The Chef）重制·阶段 1 建模（只建模，不做动画 / 机制，未接入游戏）。
// 参照 ZAN 附图 + 定稿（11-02）：写实灰黑猪头（额头到鼻梁灰白鬃毛、粉褐湿润鼻盘两鼻孔、小黑眼深陷、半折竖耳从高褶厨师帽两侧伸出），
// 帽上有血；白色双排扣厨师服满是血迹；极胖、双下巴、啤酒肚撑开衣扣；肥厚人手（短粗手指、深色指甲）；
// 米白半身围裙、深色细格纹厨裤、黑色防滑厨鞋。
//
// 做法（沿用野兽 / 迎宾女郎）：
//   · 全部部件写成 SDF（chefBody：厨师服 / 围裙 / 厨裤 / 厨鞋 / 手；chefHead：猪头 + 颈 / 厨师帽），直接在厨师空间里求值，
//     窄带 Surface Nets 提取 → QEM 减面 → 投影回等值面；顶点色 = 明暗 × SDF 环境光遮蔽。前臂袖 + 袖口用细格单独提取。
//   · 猪耳（参数曲面）、立领（薄壳）、布包扣、獠牙都并进同一张 SkinnedMesh（1 次绘制）；帽子也在里面（全部权重 = hat 骨）。
//   · 猪鬃：头部底网格 + N 层壳层（furShells，独立 SkinnedMesh），毛长 = 顶点 fur（鬃毛更长），粗、稀、灰白梢。
//   · 材质补丁（chefPatch）：按静止坐标 aRest 程序生成——白布细纹（厨师服 / 帽 / 围裙）、深色细格纹（厨裤）、猪皮毛孔、湿鼻盘高光，
//     以及**血迹 / 污渍**：大块污渍 + 往下流的血痕 + 飞溅点，按顶点沾血倾向 aBl × 统一变量 bloodLevel（0 干净 … 1 满身血）决定，
//     setChefBlood(rig, k) 改它（阶段 3 饱腹 / 阶段加深直接调）。
// LOD：0 ≈ 60k、1 ≈ 18k、2 ≈ 6k 三角形（LOD2 无壳层毛）。
// 坐标：+Z 正面建造、地面 y=0；外层组 rotation.y = π/2（userData.facesZ = 1，与看门人 / 行李员 / 野兽同约定）。
// 无头 SwiftShader 画 GPU 蒙皮会崩：预览 / 截图带 ?cpu=1（qaCpuSkin；aRest 在 CPU 替身里保留，图案不随姿态滑动）。
import * as THREE from 'three'
import { litMaterial } from './shared'
import { decimate, extract, reproject, sdfAO, clamp, mix, sstep, type Sdf, type Surf } from './conciergeSdf'
import type { Shade } from './conciergeHead'
import { BONES, B, HANDS, EYE, W4, add, cross, dot, nrm, scl, sub, lenv, eyeC, type V3 } from './chefRig'
import {
  coatSdf, COAT_BOX, coatShade, coatWeights, coatCore, foreSleeveRegion, foreSleeveBox, SLEEVE_BAND, NECK_HOLE, BTN_X, BTN_Y, JHEM, ARM, CUFF_T0, foreT,
  apronSdf, apronShade, apronWeights, APRON, apronPoint, AP_THMAX, AP_ZC, pantsSdf, PANTS_BOX, pantsShade, legWeights, shoeSdf, shoeBox, shoeShade, shoeWeights,
  handSdf, handBox, handKeep, handShade, handWeights, trunkW, onSurface, MAT, setC,
} from './chefBody'
import { headSdf, HEAD_BOX, HEAD_KEEP_Y, discRegion, DISC_BOX, headShade, headWeights, furComb, buildEars, earShade, earWeights, buildEyeGeometry, eyeQuat, tuskPath, hatSdf, HAT_BOX, hatShade, hatWeights } from './chefHead'
import { buildChefPot, buildCarvingKnife, buildLadle, buildRedCabbage, buildMeatChunk, setChefPropBlood } from './chefProps'

// ---------- 顶点块 ----------
class Chunk {
  pos: number[] = []; nrm: number[] = []; col: number[] = []; mat: number[] = []; rm: number[] = []; bl: number[] = []; si: number[] = []; sw: number[] = []; idx: number[] = []
  get n() { return this.pos.length / 3 }
  vert(p: ArrayLike<number>, n: ArrayLike<number>, s: Shade, w: W4, ao = 1) {
    this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2])
    this.col.push(lin(s.r) * ao, lin(s.g) * ao, lin(s.b) * ao); this.mat.push(s.fx ?? 0, s.fur); this.rm.push(s.rough, s.metal); this.bl.push(s.fy ?? 0)
    this.si.push(w.i[0], w.i[1], w.i[2], w.i[3]); this.sw.push(w.w[0], w.w[1], w.w[2], w.w[3])
  }
}
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const shade0 = (): Shade => ({ r: 1, g: 1, b: 1, rough: 0.8, metal: 0, fur: 0, skin: 0, cloth: 0, wool: 0, fx: 0, fy: 0, fz: 0 })
const C3 = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]

// ---------- SDF 部件 ----------
interface Part {
  name: string; sdf: Sdf; box: { min: [number, number, number]; max: [number, number, number] }; h: number[]; target?: number[]
  keep?: (x: number, y: number, z: number) => boolean; within?: (x: number, y: number, z: number) => boolean; shade: (x: number, y: number, z: number, o: Shade) => void; weights: (x: number, y: number, z: number, acc: W4) => void
  ao?: Sdf; aoScale?: number; fallback?: number
}
export const LODS = 3
function parts(lod: number): Part[] {
  const out: Part[] = []
  const outSleeve = (x: number, y: number, z: number, slack: number) => foreSleeveRegion(1, x, y, z) > -SLEEVE_BAND - slack && foreSleeveRegion(-1, x, y, z) > -SLEEVE_BAND - slack
  const sl = [0.02, 0.03, 0.045][lod]
  out.push({ name: 'coat', sdf: coatSdf, box: COAT_BOX, h: [0.0085, 0.015, 0.026], target: [12000, 4300, 1450], keep: (x, y, z) => outSleeve(x, y, z, 0), within: (x, y, z) => outSleeve(x, y, z, sl), shade: coatShade, weights: coatWeights, aoScale: 0.02, ao: (x, y, z) => Math.min(coatSdf(x, y, z), headSdf(x, y, z), apronSdf(x, y, z)) })
  for (const s of [1, -1]) out.push({ name: 'sleeve' + (s > 0 ? 'L' : 'R'), sdf: coatSdf, box: foreSleeveBox(s), h: [0.0055, 0.009, 0.016], target: [1700, 520, 190], keep: (x, y, z) => foreSleeveRegion(s, x, y, z) < 0, within: (x, y, z) => foreSleeveRegion(s, x, y, z) < 0.01, shade: coatShade, weights: coatWeights, aoScale: 0.012 })
  out.push({ name: 'pants', sdf: pantsSdf, box: PANTS_BOX, h: [0.0085, 0.015, 0.026], target: [3800, 1300, 430], keep: (_x, y, z) => y < JHEM(z) + 0.05, within: (_x, y, z) => y < JHEM(z) + 0.08, shade: pantsShade, weights: legWeights, aoScale: 0.02, ao: (x, y, z) => Math.min(pantsSdf(x, y, z), coatSdf(x, y, z), apronSdf(x, y, z)), fallback: B.hips })
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R', hs = handSdf(s), sh = shoeSdf(s)
    out.push({ name: 'shoe' + S, sdf: sh, box: shoeBox(s), h: [0.0042, 0.008, 0.013], target: [1500, 420, 150], shade: (x, y, z, o) => shoeShade(s, x, y, z, o), weights: (x, y, z, a) => shoeWeights(s, x, y, z, a), ao: (x, y, z) => (y > 0.1 ? pantsSdf(x, y, z) : 0.05), aoScale: 0.01, fallback: B['foot' + S] })
    out.push({ name: 'hand' + S, sdf: hs, box: handBox(s), h: [0.0028, 0.0055, 0.009], target: [2500, 760, 260], keep: handKeep(s), shade: (x, y, z, o) => handShade(s, x, y, z, o), weights: (x, y, z, a) => handWeights(s, x, y, z, a), ao: (x, y, z) => Math.min(hs(x, y, z), coatSdf(x, y, z)), aoScale: 0.009, fallback: B['hand' + S] })
  }
  const outDisc = (x: number, y: number, z: number, slack: number) => discRegion(x, y, z) > -SLEEVE_BAND - slack
  out.push({ name: 'head', sdf: headSdf, box: HEAD_BOX, h: [0.0026, 0.0052, 0.009], target: [8300, 2450, 820], keep: (x, y, z) => y > HEAD_KEEP_Y && outDisc(x, y, z, 0), within: (x, y, z) => outDisc(x, y, z, sl), shade: headShade, weights: headWeights, aoScale: 0.009, ao: (x, y, z) => Math.min(headSdf(x, y, z), coatSdf(x, y, z) + 0.012, hatSdf(x, y, z)), fallback: B.head }) // 衣领的 AO 放轻：进领口前颈皮不压成一圈黑
  out.push({ name: 'disc', sdf: headSdf, box: DISC_BOX, h: [0.0015, 0.0032, 0.0065], target: [2200, 420, 140], keep: (x, y, z) => discRegion(x, y, z) < 0, within: (x, y, z) => discRegion(x, y, z) < 0.012, shade: headShade, weights: headWeights, aoScale: 0.006, fallback: B.head })
  out.push({ name: 'hat', sdf: hatSdf, box: HAT_BOX, h: [0.0045, 0.008, 0.014], target: [3400, 1100, 380], shade: hatShade, weights: hatWeights, aoScale: 0.016, fallback: B.hat })
  return out
}
function bakeSurf(ch: Chunk, s: Surf, p: Part, lod: number) {
  const grid = s.sample!, extra = p.ao
  const ao: Sdf = extra ? (x, y, z) => Math.min(grid(x, y, z), extra(x, y, z)) : grid
  const base = ch.n, sh = shade0(), w = new W4()
  for (let i = 0; i < s.vcount; i++) {
    const x = s.pos[i * 3], y = s.pos[i * 3 + 1], z = s.pos[i * 3 + 2], nx = s.nrm[i * 3], ny = s.nrm[i * 3 + 1], nz = s.nrm[i * 3 + 2]
    p.shade(x, y, z, sh)
    const occ = sdfAO(ao, x, y, z, nx, ny, nz, p.aoScale ?? 0.012, 1.6)
    p.weights(x, y, z, w.reset()); w.finish(p.fallback ?? B.chest)
    ch.vert([x, y, z], [nx, ny, nz], sh, w, lod ? 0.7 + 0.3 * occ : 0.48 + 0.52 * occ)
  }
  for (let i = 0; i < s.idx.length; i++) ch.idx.push(base + s.idx[i])
}
function extractPart(p: Part, lod: number) {
  let s: Surf = extract(p.sdf, { min: p.box.min, max: p.box.max, h: p.h[lod], keep: p.keep, within: p.within, project: 1 })
  if (p.target && s.idx.length / 3 > p.target[lod]) { s = decimate(s, p.target[lod]); reproject(p.sdf, s, 0, lod ? 0.003 : 0.0012) }
  return s
}
function bakePart(ch: Chunk, p: Part, lod: number, stats: Record<string, number>) {
  const t0 = performance.now(), v0 = ch.n, i0 = ch.idx.length
  const s = extractPart(p, lod)
  bakeSurf(ch, s, p, lod)
  stats[p.name + '_v0'] = v0; stats[p.name + '_v1'] = ch.n
  stats[p.name] = (ch.idx.length - i0) / 3
  stats[p.name + '_ms'] = Math.round(performance.now() - t0)
  return s
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
      ch.vert(p, scl(N[i][j], sg), sh, w, sg > 0 ? 1 : 0.7)
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
/** 布包扣（扁圆顶 + 一圈收口褶）：p 表面点、n 法线 */
function dome(ch: Chunk, p: V3, n: V3, r: number, h: number, seg: number, color: number, rough: number, mat: number, blood: number, weightAt: (p: V3, acc: W4) => void) {
  const N = nrm(n), T = nrm(Math.abs(N[1]) < 0.9 ? cross([0, 1, 0], N) : cross([1, 0, 0], N)), Bt = cross(N, T)
  const sh = shade0(), w = new W4(), c = C3(color), rings = Math.max(3, Math.round(seg / 3))
  const base = ch.n
  for (let i = 0; i <= rings; i++) {
    const phi = (i / rings) * Math.PI / 2, rr = r * Math.cos(phi), hh = h * Math.sin(phi)
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a)
      const q = add(p, add(add(scl(T, ca * rr), scl(Bt, sa * rr)), scl(N, hh - h * 0.15)))
      const nn = nrm(add(add(scl(T, ca * Math.cos(phi) * h), scl(Bt, sa * Math.cos(phi) * h)), scl(N, Math.sin(phi) * r)))
      const k = (0.82 + 0.3 * Math.max(0, dot(nn, nrm([0.3, 0.8, 0.5])))) * (i === 1 ? 0.92 : 1)
      setC(sh, [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)], rough, mat, blood)
      weightAt(q, w.reset()); w.finish(B.chest)
      ch.vert(q, nn, sh, w)
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const a = base + i * seg + j, b = base + i * seg + ((j + 1) % seg); ch.idx.push(a, b, b + seg, a, b + seg, a + seg) }
  const top = ch.n; weightAt(p, w.reset()); w.finish(B.chest); ch.vert(add(p, scl(N, h * 0.85)), N, sh, w)
  for (let j = 0; j < seg; j++) ch.idx.push(base + rings * seg + j, base + rings * seg + ((j + 1) % seg), top)
}
/** 管（沿点列扫掠，半径逐点）：獠牙 */
function tube(ch: Chunk, pts: V3[], r: number[], seg: number, colorAt: (u: number) => number[], rough: number, weightAt: (p: V3, acc: W4) => void) {
  const sh = shade0(), w = new W4(), base = ch.n
  let ref: V3 = [0, 0, 1]
  for (let k = 0; k < pts.length; k++) {
    const t = nrm(sub(pts[Math.min(pts.length - 1, k + 1)], pts[Math.max(0, k - 1)]))
    if (Math.abs(dot(ref, t)) > 0.95) ref = [1, 0, 0]
    const u = nrm(cross(t, ref)), v = cross(t, u)
    const c = colorAt(k / (pts.length - 1))
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2, d = add(scl(u, Math.cos(a)), scl(v, Math.sin(a)))
      setC(sh, c, rough, MAT.plain, 0.6); weightAt(pts[k], w.reset()); w.finish(B.jaw)
      ch.vert(add(pts[k], scl(d, r[k])), d, sh, w)
    }
  }
  for (let k = 0; k < pts.length - 1; k++) for (let j = 0; j < seg; j++) { const a = base + k * seg + j, b = base + k * seg + ((j + 1) % seg); ch.idx.push(a, b + seg, b, a, a + seg, b + seg) }
}
/** 领口处厨师服表面高度（沿方向 phi、半径 r） */
function bodyTopY(phi: number, r: number) {
  const x = NECK_HOLE.c[0] + Math.sin(phi) * r, z = NECK_HOLE.c[2] + Math.cos(phi) * r
  let lo = 1.3, hi = 1.62
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (coatSdf(x, m, z) < 0) lo = m; else hi = m }
  return lo
}
/** 立领（中式立领，前面叠门处留一道小口；双下巴压在立领前沿上） */
const COL = { r0: 0.128, r1: 0.123, topF: 1.47, topB: 1.53, gap0: 0.2, gap1: 0.26 }
function collarPoint(s: number, t: number): V3 {
  const gap = mix(COL.gap0, COL.gap1, t)
  const phi = mix(gap, Math.PI * 2 - gap, s) - 0.25 // 开口偏向叠边一侧（角色右）
  const bk = (1 - Math.cos(phi)) * 0.5
  const r = mix(COL.r0, COL.r1, t) * (1 + 0.1 * (1 - bk))
  const y0 = bodyTopY(phi, r) - 0.01, y1 = Math.max(y0 + 0.012, mix(COL.topF, COL.topB, bk))
  return [NECK_HOLE.c[0] + Math.sin(phi) * r, mix(y0, y1, t), NECK_HOLE.c[2] + Math.cos(phi) * r]
}
function buildSmall(ch: Chunk, lod: number, stats: Record<string, number>) {
  const i0 = ch.idx.length
  const q = [1, 0.55, 0.32][lod], R = (n: number) => Math.max(3, Math.round(n * q))
  const white = (p: V3, _s: number, t: number, o: Shade) => { const c = C3(0xe7e4dc); const k = 0.86 + 0.14 * t; setC(o, [c[0] * k, c[1] * k, c[2] * k], 0.86, MAT.cloth, p[2] > 0 ? 0.8 : 0.3) }
  const neckW = (p: V3, a: W4) => { const k = sstep(1.45, 1.53, p[1]) * 0.35; a.add(B.chest, 1 - k); a.add(B.neck, k) }
  shell(ch, collarPoint, R(48), R(5), () => 0.0045, white, neckW)
  stats.collar = (ch.idx.length - i0) / 3
  // 布包扣：两列 × 5 排（白布扣，略带血）
  const trunk = (p: V3, a: W4) => trunkW(p[0], p[1], a, 1)
  const i1 = ch.idx.length
  for (const y of BTN_Y) for (const sx of [1, -1]) {
    const x = sx * BTN_X
    const p = onSurface(coatSdf, [x, y, 0.4], 0), e = 0.002
    const n = nrm([coatSdf(p[0] + e, p[1], p[2]) - coatSdf(p[0] - e, p[1], p[2]), coatSdf(p[0], p[1] + e, p[2]) - coatSdf(p[0], p[1] - e, p[2]), coatSdf(p[0], p[1], p[2] + e) - coatSdf(p[0], p[1], p[2] - e)])
    const belly = (pp: V3, a: W4) => { coatWeights(pp[0], pp[1], pp[2], a) }
    dome(ch, add(p, scl(n, 0.0006)), n, 0.0105, 0.0052, lod >= 2 ? 6 : lod ? 8 : 11, 0xe2ded4, 0.6, MAT.button, 0.8, y < 1.2 ? belly : trunk)
  }
  stats.buttons = (ch.idx.length - i1) / 3
  // 獠牙
  const i2 = ch.idx.length
  for (const s of [1, -1]) { const { pts, r } = tuskPath(s); tube(ch, pts, r, lod >= 2 ? 4 : lod ? 5 : 8, (u) => mixc3([0.86, 0.8, 0.62], [0.55, 0.45, 0.3], u), 0.35, (_p, a) => { a.add(B.jaw, 1) }) }
  stats.tusks = (ch.idx.length - i2) / 3
  // 猪耳
  const i3 = ch.idx.length
  buildEars(lod, (verts, s, tri) => {
    const base = ch.n, sh = shade0(), w = new W4()
    for (const ev of verts) { earShade(ev, sh); earWeights(s, ev.t, w.reset()); w.finish(B.head); ch.vert(ev.p, ev.n, sh, w, ev.inner ? 0.75 + 0.25 * sstep(0.0, 0.4, ev.t) : 0.9) }
    for (const k of tri) ch.idx.push(base + k)
  })
  stats.ears = (ch.idx.length - i3) / 3
  // 围裙（参数化薄壳：帆布面 + 腰带 + 后腰结 / 垂带）
  const i4 = ch.idx.length
  const apSh = (p: V3, _s: number, _t: number, o: Shade) => apronShade(p[0], p[1], p[2], o)
  const apW = (p: V3, a: W4) => apronWeights(p[0], p[1], p[2], a)
  const yTop = APRON.y0 - 0.004
  shell(ch, (u, v) => { const y = mix(yTop, APRON.bot, v) + 0.004 * Math.sin(u * 60) * sstep(0.9, 1, v); const tm = AP_THMAX(y); return apronPoint(mix(-tm, tm, u), y) }, [36, 20, 10][lod], [18, 9, 4][lod], (_u, v) => 0.0038 + 0.0018 * sstep(0.93, 1, v), apSh, apW)
  // 腰带：贴在下摆外侧一圈（沿径向找下摆表面）
  const bandP = (u: number, v: number): V3 => {
    const ph = u * Math.PI * 2, y = mix(APRON.y0, APRON.y1, v), dx = Math.sin(ph), dz = Math.cos(ph)
    let lo = 0.05, hi = 0.45
    for (let k = 0; k < 28; k++) { const m = (lo + hi) / 2; if (coatCore(dx * m, y, AP_ZC + dz * m) < 0) lo = m; else hi = m }
    const r = lo + 0.0075 + 0.003 * Math.max(0, Math.cos(ph)) // 前面压在围裙面上
    return [dx * r, y, AP_ZC + dz * r]
  }
  shell(ch, bandP, [72, 32, 16][lod], 2, () => 0.0032, apSh, apW)
  // 后腰结 + 两根垂带
  const back = bandP(0.5, 0.5)
  dome(ch, add(back, [0, 0, -0.004]), [0, 0.1, -1], 0.018, 0.012, lod >= 2 ? 6 : 10, 0xcfc8b8, 0.9, MAT.apron, 0.3, apW)
  for (const sd of [1, -1]) shell(ch, (u, v) => [back[0] + sd * (0.008 + 0.01 * v) + (u - 0.5) * 0.02, back[1] - 0.01 - 0.11 * v, back[2] - 0.006 - 0.012 * v], 2, [6, 3, 2][lod], () => 0.0024, apSh, apW)
  stats.apron = (ch.idx.length - i4) / 3
}
const mixc3 = (a: number[], b: number[], t: number) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]

// ---------- 壳层毛 ----------
interface FurSrc { pos: ArrayLike<number>; nrm: ArrayLike<number>; col: ArrayLike<number>; fur: ArrayLike<number>; bl: ArrayLike<number>; si: ArrayLike<number>; sw: ArrayLike<number>; idx: ArrayLike<number>; comb: ArrayLike<number> }
function furShells(src: FurSrc, layers: number, L: number, lean: number) {
  const nv = src.pos.length / 3, ni = src.idx.length
  const pos = new Float32Array(nv * 3 * layers), nor = new Float32Array(nv * 3 * layers), col = new Float32Array(nv * 3 * layers), rest = new Float32Array(nv * 3 * layers), sh = new Float32Array(nv * 2 * layers), bl = new Float32Array(nv * layers)
  const si = new Uint16Array(nv * 4 * layers), sw = new Float32Array(nv * 4 * layers), idx = new Uint32Array(ni * layers)
  for (let k = 0; k < layers; k++) {
    const t = (k + 1) / layers
    for (let i = 0; i < nv; i++) {
      const j = k * nv + i, f = src.fur[i]
      for (let c = 0; c < 3; c++) {
        pos[j * 3 + c] = src.pos[i * 3 + c] + src.nrm[i * 3 + c] * L * t * f + src.comb[i * 3 + c] * L * lean * t * t * f
        nor[j * 3 + c] = src.nrm[i * 3 + c]; col[j * 3 + c] = src.col[i * 3 + c]; rest[j * 3 + c] = src.pos[i * 3 + c]
      }
      sh[j * 2] = t; sh[j * 2 + 1] = f; bl[j] = src.bl[i]
      for (let c = 0; c < 4; c++) { si[j * 4 + c] = src.si[i * 4 + c]; sw[j * 4 + c] = src.sw[i * 4 + c] }
    }
    for (let i = 0; i < ni; i++) idx[k * ni + i] = k * nv + src.idx[i]
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setAttribute('aRest', new THREE.BufferAttribute(rest, 3)); g.setAttribute('aShell', new THREE.BufferAttribute(sh, 2)); g.setAttribute('aBl', new THREE.BufferAttribute(bl, 1))
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4))
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere(); g.boundingSphere!.radius *= 1.3
  return g
}
function headFurSrc(lod: number, stats: Record<string, number>): FurSrc {
  const target = [2300, 1000, 0][lod]
  let s = extract(headSdf, { min: HEAD_BOX.min, max: HEAD_BOX.max, h: [0.0042, 0.0068, 0.01][lod], keep: (_x, y) => y > HEAD_KEEP_Y + 0.01, project: 1 })
  if (s.idx.length / 3 > target) { s = decimate(s, target); reproject(headSdf, s, 0, 0.0015) }
  const pos: number[] = [], nrmA: number[] = [], col: number[] = [], fur: number[] = [], bl: number[] = [], si: number[] = [], sw: number[] = [], comb: number[] = []
  const sh = shade0(), w = new W4()
  for (let i = 0; i < s.vcount; i++) {
    const p: V3 = [s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]], n: V3 = [s.nrm[i * 3], s.nrm[i * 3 + 1], s.nrm[i * 3 + 2]]
    headShade(p[0], p[1], p[2], sh); headWeights(p[0], p[1], p[2], w.reset()); w.finish(B.head)
    // 帽子里面的毛不要（帽箍压住）
    const inHat = hatSdf(p[0], p[1], p[2]) < 0.004 ? 0 : 1
    pos.push(...p); nrmA.push(...n); col.push(lin(sh.r), lin(sh.g), lin(sh.b)); fur.push(sh.fur * inHat); bl.push(sh.fy ?? 0); comb.push(...furComb(p, n))
    si.push(...w.i); sw.push(...w.w)
  }
  const idx: number[] = []
  for (let t = 0; t < s.idx.length; t += 3) { const a = s.idx[t], b = s.idx[t + 1], c = s.idx[t + 2]; if (fur[a] + fur[b] + fur[c] > 0.15) idx.push(a, b, c) }
  stats.furSrcTris = idx.length / 3
  return { pos, nrm: nrmA, col, fur, bl, si, sw, idx, comb }
}

// ---------- 几何缓存 ----------
interface Built { body: THREE.BufferGeometry; fur: THREE.BufferGeometry | null; eye: THREE.BufferGeometry; stats: Record<string, number> }
const cache: Record<number, Built> = {}
/** LOD 参数：壳层层数 / 毛长 */
export const CHEF_LOD = [{ layers: 5 }, { layers: 3 }, { layers: 0 }]
const FUR_L = 0.011
export function chefGeometryReady(lod = 1) { return !!cache[lod] }
const chefPending = new Set<number>()
export function prepareChefGeometry(lod = 1) {
  if (cache[lod] || chefPending.has(lod)) return !!cache[lod]
  chefPending.add(lod)
  const accepted = requestHotelGeometry('chef', lod, tree => {
    chefPending.delete(lod)
    if (tree && !cache[lod]) cache[lod] = unpackGeometryTree(tree) as Built
  })
  if (!accepted) { chefPending.delete(lod); buildChefGeometry(lod) }
  return !!cache[lod]
}
export function buildChefGeometry(lod = 0): Built {
  lod = Math.max(0, Math.min(LODS - 1, lod))
  if (cache[lod]) return cache[lod]
  const t0 = performance.now(), stats: Record<string, number> = {}
  const ch = new Chunk()
  for (const p of parts(lod)) bakePart(ch, p, lod, stats)
  buildSmall(ch, lod, stats)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(ch.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(ch.nrm, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(ch.col, 3)); g.setAttribute('aMat', new THREE.Float32BufferAttribute(ch.mat, 2)); g.setAttribute('aRM', new THREE.Float32BufferAttribute(ch.rm, 2)); g.setAttribute('aBl', new THREE.Float32BufferAttribute(ch.bl, 1))
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(ch.si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(ch.sw, 4))
  g.setIndex(ch.n > 65535 ? new THREE.Uint32BufferAttribute(ch.idx, 1) : new THREE.Uint16BufferAttribute(ch.idx, 1))
  g.setAttribute('aRest', new THREE.BufferAttribute(new Float32Array(ch.pos), 3)); g.setAttribute('aRN', new THREE.BufferAttribute(new Float32Array(ch.nrm), 3))
  g.computeBoundingSphere(); g.boundingSphere!.radius *= 1.3
  stats.bodyTris = ch.idx.length / 3
  const L = CHEF_LOD[lod]
  const fur = L.layers ? furShells(headFurSrc(lod, stats), L.layers, FUR_L * (lod ? 0.85 : 1), 0.9) : null
  stats.furTris = fur ? fur.index!.count / 3 : 0
  // 无壳层（LOD2）时底网格不压暗
  if (!L.layers) { const am = g.attributes.aMat; for (let i = 0; i < am.count; i++) am.setY(i, 0) }
  const eye = buildEyeGeometry(lod)
  stats.eyeTris = 2 * (eye.index ? eye.index.count / 3 : 0)
  stats.ms = Math.round(performance.now() - t0)
  return (cache[lod] = { body: g, fur, eye, stats })
}

// ======================================================================
// 材质
// ======================================================================
/** 统一变量（所有厨师实例共享） */
export const CHEF_UNI = {
  /** 血量 0 干净 … 1 满身血（阶段 3：饱腹 / 阶段加深） */
  uBlood: { value: 0.55 },
  /** 厨裤格纹：底色 / 线色（线性色）、格距 m / 线宽 m */
  uPlaidA: { value: new THREE.Color('#1d1d20') },
  uPlaidB: { value: new THREE.Color('#77787c') },
  uPlaid: { value: new THREE.Vector2(0.016, 0.0024) },
  /** 毛丝密度（每米格数）、毛丝粗细（格内半径） */
  uFur: { value: new THREE.Vector2(520, 0.36) },
  /** 底网格有壳层毛时底色压暗（LOD2 = 0） */
  uFurBase: { value: 1.0 },
  /** 高光方向（视空间） */
  uSpecDir: { value: new THREE.Vector3(0.35, 0.62, 0.7).normalize() },
  /** [chef stage 3] 融进环境 0（清楚）… 1（几乎看不见）：屏幕空间抖动溶解，轮廓边缘先化开（chefRender 每帧按 AI 的清晰度给） */
  uFade: { value: 0 },
}
/** [chef stage 3] 抖动溶解（片元末尾）：IGN 噪声阈值 = uFade ×（0.82 + 0.5 × 掠射角），边缘先消失；uFade = 0 时整段跳过 */
export const CHEF_FADE_GLSL = `
if (uFade > 0.001) {
  vec3 chVv = normalize(vViewPosition);
  float chRim = 1.0 - clamp(abs(dot(normalize(normal), chVv)), 0.0, 1.0);
  float chN = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (chN < clamp(uFade * (0.82 + 0.5 * chRim), 0.0, 0.985)) discard;
}`
const CHEF_FADE_GLSL_FLAT = `
if (uFade > 0.001) {
  float chN = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (chN < clamp(uFade * 0.9, 0.0, 0.985)) discard;
}`
const expandChunks = (src: string, d = 0): string => d > 6 ? src : src.replace(/#include <(\w+)>/g, (_, n: string) => expandChunks((THREE.ShaderChunk as Record<string, string>)[n] ?? '', d + 1))
/** [chef stage 3] 给任意 three 材质装上溶解（原 onBeforeCompile 保留；缓存键加后缀） */
export function chefFadePatch<M extends THREE.Material>(m: M): M {
  if ((m as { __chefFade?: boolean }).__chefFade) return m
  const prev = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey()
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r)
    sh.uniforms.uFade = CHEF_UNI.uFade
    if (!sh.fragmentShader.includes('uniform float uFade;')) sh.fragmentShader = 'uniform float uFade;\n' + sh.fragmentShader
    // 判断要按展开 #include 之后的源码（Lambert / Phong 的 vViewPosition 声明在 lights_*_pars_fragment 里），否则会重复声明
    // 没有视空间位置 / 法线的材质（MeshBasic）只做噪声阈值，不算掠射角
    const fx = expandChunks(sh.fragmentShader), rim = /vViewPosition\s*=/.test(expandChunks(sh.vertexShader)) && /vec3 normal\s*=/.test(fx)
    if (rim && !/varying vec3 vViewPosition;/.test(fx)) sh.fragmentShader = 'varying vec3 vViewPosition;\n' + sh.fragmentShader
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + (rim ? CHEF_FADE_GLSL : CHEF_FADE_GLSL_FLAT))
  }
  m.customProgramCacheKey = () => key + '|chef-fade'
  ;(m as { __chefFade?: boolean }).__chefFade = true
  return m
}
const GLSL_COMMON = `
uniform float uBlood;
float chHash13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 chHash33(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float chNoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(chHash13(i), chHash13(i + vec3(1,0,0)), f.x), mix(chHash13(i + vec3(0,1,0)), chHash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(chHash13(i + vec3(0,0,1)), chHash13(i + vec3(1,0,1)), f.x), mix(chHash13(i + vec3(0,1,1)), chHash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
// 血迹遮罩：大块污渍（低频）+ 往下流的血痕（y 方向拉长）+ 飞溅点（细胞噪声）；bias = 顶点沾血倾向；按 uBlood 降阈值
float chBloodField(vec3 p, out float dry){
  float big = chNoise(p * 7.0 + 3.1) * 0.6 + chNoise(p * 17.0 + 7.7) * 0.4;
  float drip = chNoise(vec3(p.x * 46.0, p.y * 4.2 + chNoise(p * 9.0) * 1.5, p.z * 46.0));
  drip *= smoothstep(0.35, 0.75, chNoise(vec3(p.x * 12.0, p.y * 2.0 + 5.0, p.z * 12.0)));
  vec3 q = p * 70.0; vec3 iq = floor(q), fq = fract(q); float f1 = 9.0; float id = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) for (int k = -1; k <= 1; k++) { vec3 g = vec3(float(i), float(j), float(k)); vec3 o = chHash33(iq + g); float d = length(g + o - fq); if (d < f1) { f1 = d; id = chHash13(iq + g + 0.5); } }
  float spl = (1.0 - smoothstep(0.12, 0.3, f1)) * step(0.72, id);
  dry = chNoise(p * 23.0 + 11.0);
  return max(max(big * 0.9, drip * 1.08), spl * 0.95 * smoothstep(0.3, 0.6, big));
}
float chBlood(vec3 p, float bias, out float dry){
  if (bias < 0.01 || uBlood < 0.01) { dry = 0.0; return 0.0; }
  float f = chBloodField(p, dry);
  float th = mix(1.12, 0.6, uBlood) + 0.42 * (1.0 - bias);
  float aa = max(fwidth(f), 0.01);
  return smoothstep(th - aa, th + aa, f);
}
vec3 chBloodColor(float dry, float m){ return mix(vec3(0.4, 0.008, 0.01), vec3(0.11, 0.012, 0.009), clamp(dry * 1.2 - 0.1, 0.0, 1.0)) * (0.85 + 0.3 * m); }
`
/** 身体材质补丁 */
function bodyPatch(m: THREE.Material) {
  const prev = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey()
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r)
    Object.assign(sh.uniforms, { uBlood: CHEF_UNI.uBlood, uPlaidA: CHEF_UNI.uPlaidA, uPlaidB: CHEF_UNI.uPlaidB, uPlaid: CHEF_UNI.uPlaid, uFurBase: CHEF_UNI.uFurBase, uSpecDir: CHEF_UNI.uSpecDir })
    sh.vertexShader = 'attribute vec3 aRest;\nattribute vec3 aRN;\nattribute vec2 aMat;\nattribute vec2 aRM;\nattribute float aBl;\nvarying vec3 vChRest;\nvarying vec3 vChRN;\nvarying vec2 vChMat;\nvarying vec2 vChRM;\nvarying float vChBl;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvChRest = aRest; vChRN = aRN; vChMat = aMat; vChRM = aRM; vChBl = aBl;')
    sh.fragmentShader = 'uniform vec3 uPlaidA, uPlaidB, uSpecDir; uniform vec2 uPlaid; uniform float uFurBase;\nvarying vec3 vChRest;\nvarying vec3 vChRN;\nvarying vec2 vChMat;\nvarying vec2 vChRM;\nvarying float vChBl;\nfloat chBl = 0.0;\n' + GLSL_COMMON + `
float chLine(float x, float P, float w, float fw){ float f = abs(fract(x / P + 0.5) - 0.5) * P; float aa = max(fw, 1e-5); float c = 1.0 - smoothstep(0.5 * w - aa, 0.5 * w + aa, f); return mix(c, w / P, smoothstep(0.3, 0.9, fw / w)); }
vec3 chPlaid2(vec2 q, float fw){
  float P = uPlaid.x, w = uPlaid.y;
  float lx = chLine(q.x, P, w, fw), ly = chLine(q.y, P, w, fw);
  float hx = chLine(q.x + 0.5 * P, P, P * 0.5, fw), hy = chLine(q.y + 0.5 * P, P, P * 0.5, fw);
  vec3 c = uPlaidA;
  c = mix(c, mix(uPlaidA, uPlaidB, 0.45), 0.5 * (hx + hy) * 0.5); // 半格的浅格块（经纬交织）
  c = mix(c, uPlaidB, 0.55 * max(lx, ly));
  c = mix(c, uPlaidB * 1.25, 0.4 * lx * ly);
  return c;
}
vec3 chPlaid(vec3 p, vec3 n){
  float fw = length(fwidth(p)) * 0.7;
  vec3 w = pow(abs(n), vec3(6.0)); w /= (w.x + w.y + w.z + 1e-5);
  return w.z * chPlaid2(p.xy, fw) + w.x * chPlaid2(vec2(p.z, p.y), fw) + w.y * chPlaid2(p.xz, fw);
}
` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 p = vChRest, n = normalize(vChRN);
        float id = vChMat.x + 0.5;
        vec3 w3 = pow(abs(n), vec3(4.0)); w3 /= (w3.x + w3.y + w3.z + 1e-5);
        float fwp = length(fwidth(p));
        if (id > 1.0 && id < 2.0 || id > 8.0 && id < 9.0) {
          // 白布 / 帆布：经纬细纹（远处淡出）
          float fa = 1.0 - smoothstep(0.0004, 0.0012, fwp);
          vec3 q = p * (id > 8.0 ? 1500.0 : 2300.0);
          float wv = w3.z * sin(q.x) * sin(q.y) + w3.x * sin(q.z) * sin(q.y) + w3.y * sin(q.x) * sin(q.z);
          diffuseColor.rgb *= 1.0 + (id > 8.0 ? 0.09 : 0.05) * wv * fa;
          diffuseColor.rgb *= 1.0 + 0.04 * (chNoise(p * 90.0) - 0.5);
        } else if (id > 2.0 && id < 3.0) {
          diffuseColor.rgb *= chPlaid(p, n) * 2.0;
        } else if (id > 3.0 && id < 4.0 || id > 5.0 && id < 6.0) {
          // 皮：毛孔 / 细碎斑驳
          float fa = 1.0 - smoothstep(0.0006, 0.002, fwp);
          diffuseColor.rgb *= 1.0 + fa * 0.18 * (chHash13(floor(p * 900.0)) - 0.5) + 0.1 * (chNoise(p * 60.0) - 0.5);
        }
        if (vChMat.y > 0.01) diffuseColor.rgb *= mix(1.0, 0.7 + 0.22 * chNoise(p * 400.0), uFurBase * min(vChMat.y, 1.0));
        float dry;
        chBl = chBlood(p, vChBl, dry);
        diffuseColor.rgb = mix(diffuseColor.rgb, chBloodColor(dry, chNoise(p * 40.0)), chBl * 0.94);
      }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        // 湿高光：鼻盘 / 獠牙 / 未干的血 / 扣子（经典 Lambert 模式也给一道随视角的高光）
        vec3 Vv = normalize(vViewPosition); vec3 Hh = normalize(uSpecDir + Vv);
        float nh = max(dot(normal, Hh), 0.0);
        float wet = (vChMat.x > 3.5 && vChMat.x < 4.5) ? 1.0 : 0.0;
        float rub = (vChMat.x > 5.5 && vChMat.x < 6.5) ? 0.25 : 0.0;
        float bw = chBl * 0.6 * (1.0 - smoothstep(0.3, 0.8, chNoise(vChRest * 23.0 + 11.0)));
        totalEmissiveRadiance += (wet * (pow(nh, 140.0) * 0.12 + pow(nh, 20.0) * 0.01) + bw * pow(nh, 60.0) * 0.6 + rub * pow(nh, 30.0)) * vec3(1.0);
      }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(vChRM.x, 0.25, chBl * 0.6);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vChRM.y;')
  }
  m.customProgramCacheKey = () => key + '|chef-body'
  return m
}
/** 壳层猪鬃：3D 细胞噪声毛丝（粗、稀），毛根深、毛梢浅；沾血处毛梢一起染血 */
function furPatch(m: THREE.Material) {
  const prev = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey()
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r)
    sh.uniforms.uFur = CHEF_UNI.uFur; sh.uniforms.uBlood = CHEF_UNI.uBlood
    sh.vertexShader = 'attribute vec3 aRest;\nattribute vec2 aShell;\nattribute float aBl;\nvarying vec3 vChRest;\nvarying vec2 vChShell;\nvarying float vChBl;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvChRest = aRest; vChShell = aShell; vChBl = aBl;')
    sh.fragmentShader = 'uniform vec2 uFur;\nvarying vec3 vChRest;\nvarying vec2 vChShell;\nvarying float vChBl;\n' + GLSL_COMMON + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 q = vChRest * uFur.x;
        vec3 iq = floor(q), fq = fract(q);
        float f1 = 9.0; vec3 idc = vec3(0.0);
        for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) for (int k = -1; k <= 1; k++) {
          vec3 g = vec3(float(i), float(j), float(k)), o = chHash33(iq + g), rr = g + o - fq; float d = dot(rr, rr);
          if (d < f1) { f1 = d; idc = iq + g; }
        }
        f1 = sqrt(f1);
        float id = chHash13(idc), h = vChShell.x, fl = vChShell.y;
        float far = smoothstep(1.3, 2.6, length(fwidth(q)));
        // 猪鬃稀：只有约 55% 的格子长毛
        float has = step(0.45, fract(id * 5.17));
        float len = mix(mix(0.5, 1.0, fract(id * 7.31)), 0.2, far);
        float rad = uFur.y * (1.0 - 0.8 * h / max(len, 1e-3));
        float fw = max(fwidth(f1), 0.02);
        float cov = mix((1.0 - smoothstep(rad - fw, rad + fw, f1)) * has, 1.0, far);
        if (fl < 0.06 || h > len || cov < 0.5) discard;
        float tone = mix(0.75 + 0.5 * fract(id * 13.7), 1.0, far);
        vec3 c = diffuseColor.rgb * tone * mix(0.65, 1.35, smoothstep(0.0, 0.9, h));
        // 灰白梢（鬃毛区更明显）
        c = mix(c, vec3(0.42, 0.4, 0.37), 0.35 * smoothstep(0.5, 1.0, h / len) * step(0.6, fract(id * 3.7)) * (1.0 - far));
        float dry; float bm = chBlood(vChRest, vChBl, dry);
        c = mix(c, chBloodColor(dry, 0.5), bm * 0.85);
        diffuseColor.rgb = c;
      }`)
  }
  m.customProgramCacheKey = () => key + '|chef-fur'
  return m
}
function shinePatch(m: THREE.Material, power: number, k: number, tag: string) {
  const prev = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey()
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r)
    sh.uniforms.uSpecDir = CHEF_UNI.uSpecDir
    sh.fragmentShader = 'uniform vec3 uSpecDir;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { vec3 Vv = normalize(vViewPosition); vec3 Hh = normalize(uSpecDir + Vv); totalEmissiveRadiance += ${k.toFixed(3)} * pow(max(dot(normal, Hh), 0.0), ${power.toFixed(1)}) * vec3(1.0); }`)
  }
  m.customProgramCacheKey = () => key + '|chef-shine-' + tag
  return m
}
let MATS: { body: THREE.Material; fur: THREE.Material; eye: THREE.Material } | null = null
export function chefMaterials() {
  if (MATS) return MATS
  const body = bodyPatch(litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.8 }))
  const fur = furPatch(litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.9 }))
  const eye = shinePatch(litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.08 }), 120, 1.5, 'eye')
  for (const m of [body, fur, eye]) chefFadePatch(m) // [chef stage 3] 融进环境
  return (MATS = { body, fur, eye })
}

// ======================================================================
// 装配
// ======================================================================
export interface ChefArm { side: number; clav: THREE.Bone; shoulder: THREE.Bone; elbow: THREE.Bone; wrist: THREE.Bone; fingers: Record<'thumb' | 'index' | 'middle' | 'ring' | 'pinky', THREE.Bone[]> }
export interface ChefLeg { side: number; hip: THREE.Bone; knee: THREE.Bone; ankle: THREE.Bone; toe: THREE.Bone }
export type ChefPropName = 'pot' | 'knife' | 'ladle' | 'cabbage' | 'meat'
export interface ChefRig {
  root: THREE.Bone; hips: THREE.Bone; spine: THREE.Bone; chest: THREE.Bone; neck: THREE.Bone; head: THREE.Bone
  armL: ChefArm; armR: ChefArm; legL: ChefLeg; legR: ChefLeg
  /** 啤酒肚 / 双下巴 / 下颌 / 帽 */
  belly: THREE.Bone; chin: THREE.Bone; jaw: THREE.Bone; hat: THREE.Bone
  /** 猪耳每侧 3 节（0 根部 → 2 折下的耳尖） */
  earL: THREE.Bone[]; earR: THREE.Bone[]
  eyes: THREE.Mesh[]
  /** 手持道具（默认隐藏）：汤锅 / 雕刻刀 / 汤勺挂右手，紫甘蓝挂右手（附图）、肉块挂左手 */
  props: Record<ChefPropName, THREE.Group>
  bones: Record<string, THREE.Bone>; body: THREE.SkinnedMesh; fur: THREE.SkinnedMesh | null
  lod: number
  /** 当前血量（setChefBlood） */
  blood: number
}
/** 手局部点（手坐标 a / r / d）→ 相对手骨的位置 */
function handLocal(s: number, ta: number, tr: number, td: number) {
  const { F } = HANDS[s]
  const p = add(F.o, add(add(scl(F.a, ta), scl(F.r, tr)), scl(F.d, td)))
  return new THREE.Vector3(...sub(p, F.o))
}
/** 造一个厨师实例（几何 / 材质按 LOD 共享缓存；骨骼每实例一套） */
export function buildChef(opts: { lod?: number; blood?: number } = {}): THREE.Group {
  const lod = Math.max(0, Math.min(LODS - 1, opts.lod ?? 0))
  const geo = buildChefGeometry(lod)
  const M = chefMaterials()
  shareHotelRigAssets({ ...geo, ...M })
  const face = new THREE.Group(); face.name = 'chef'; face.rotation.y = Math.PI / 2; face.userData.facesZ = 1
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
  const body = sk(geo.body, M.body, 'chefBody')
  const fur = geo.fur ? sk(geo.fur, M.fur, 'chefFur', false) : null
  const meshes = [body, ...(fur ? [fur] : [])]
  face.add(...meshes)
  face.updateMatrixWorld(true)
  const skel = new THREE.Skeleton(bones)
  for (const m of meshes) m.bind(skel, m.matrixWorld)
  for (const b of bones) b.userData.rest = { p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }
  const bn: Record<string, THREE.Bone> = {}; for (const d of BONES) bn[d.name] = bones[B[d.name]]
  const arm = (s: number): ChefArm => {
    const S = s > 0 ? 'L' : 'R', fingers = {} as ChefArm['fingers']
    for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky'] as const) fingers[f] = [1, 2, 3].map((k) => bn[f + k + S])
    return { side: s, clav: bn['clav' + S], shoulder: bn['upperArm' + S], elbow: bn['foreArm' + S], wrist: bn['hand' + S], fingers }
  }
  const leg = (s: number): ChefLeg => { const S = s > 0 ? 'L' : 'R'; return { side: s, hip: bn['thigh' + S], knee: bn['shin' + S], ankle: bn['foot' + S], toe: bn['toe' + S] } }
  const eyes: THREE.Mesh[] = []
  const headP = new THREE.Vector3(...BONES[B.head].pos)
  for (const s of [1, -1]) { const e = new THREE.Mesh(geo.eye, M.eye); e.name = 'chefEye' + (s > 0 ? 'L' : 'R'); e.quaternion.copy(eyeQuat(s)); e.position.set(...eyeC(s)).sub(headP); bn.head.add(e); eyes.push(e) }
  // 手持道具：握点放在掌心（四指握拳时的空腔中心），+Y 朝拇指外侧（握柄方向沿 r 轴 → 物件从拳眼伸出）
  const props = {} as Record<ChefPropName, THREE.Group>
  const grip = (g: THREE.Group, s: number, ta: number, tr: number, td: number, dir: V3) => {
    const { F } = HANDS[s]; g.visible = false; bn[s > 0 ? 'handL' : 'handR'].add(g); g.position.copy(handLocal(s, ta, tr, td))
    const d = nrm(add(add(scl(F.a, dir[0]), scl(F.r, dir[1])), scl(F.d, dir[2])))
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d))
  }
  props.pot = buildChefPot(); grip(props.pot, -1, 0.07, 0.0, -0.028, [0.15, 1, 0])
  props.knife = buildCarvingKnife(); grip(props.knife, -1, 0.07, 0.0, -0.026, [0.2, 1, 0])
  props.ladle = buildLadle(); grip(props.ladle, -1, 0.07, 0.0, -0.026, [0.2, 1, 0])
  props.cabbage = buildRedCabbage(); grip(props.cabbage, -1, 0.085, 0.0, -0.1, [0, 0, -1])
  props.meat = buildMeatChunk(); grip(props.meat, 1, 0.085, 0.0, -0.085, [0, 0, -1])
  const rig: ChefRig = {
    root: bones[0], hips: bn.hips, spine: bn.spine, chest: bn.chest, neck: bn.neck, head: bn.head,
    armL: arm(1), armR: arm(-1), legL: leg(1), legR: leg(-1),
    belly: bn.belly, chin: bn.chin, jaw: bn.jaw, hat: bn.hat,
    earL: [0, 1, 2].map((k) => bn['earL' + k]), earR: [0, 1, 2].map((k) => bn['earR' + k]),
    eyes, props, bones: bn, body, fur, lod, blood: CHEF_UNI.uBlood.value,
  }
  face.userData.chef = rig
  face.userData.chefStats = { ...geo.stats }
  if (opts.blood !== undefined) setChefBlood(rig, opts.blood)
  return face
}
/** 血量 0..1（所有厨师实例共享一个统一变量；道具血迹层同步） */
export function setChefBlood(rig: ChefRig | null, k: number) {
  k = clamp(k, 0, 1)
  CHEF_UNI.uBlood.value = k
  setChefPropBlood(k)
  if (rig) rig.blood = k
}

// ======================================================================
// 静帧姿势（预览用；阶段 2 动画会替换）：'rest'、'hold'（附图：左手捧紫甘蓝在胸前）、'hands'（两手抬到胸前看手）、'weapon'（右手举汤锅）
// ======================================================================
const restOf = (b: THREE.Bone) => { const r = b.userData.rest; b.position.copy(r.p); b.quaternion.copy(r.q); b.scale.copy(r.s) }
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q1 = new THREE.Quaternion()
function aimBone(b: THREE.Bone, childWorld: THREE.Vector3, targetWorld: THREE.Vector3) {
  const bp = b.getWorldPosition(_v1)
  const from = _v2.copy(childWorld).sub(bp).normalize(), to = _v3.copy(targetWorld).sub(bp).normalize()
  const qw = _q1.setFromUnitVectors(from, to)
  const parentQ = b.parent!.getWorldQuaternion(new THREE.Quaternion())
  const newW = qw.multiply(parentQ.clone().multiply(b.quaternion))
  b.quaternion.copy(parentQ.invert().multiply(newW))
  b.updateMatrixWorld(true)
}
/** 两骨 IK：把腕放到 target（模型空间），肘朝 pole */
export function chefArmIK(rig: ChefRig, A: ChefArm, target: V3, pole: V3) {
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
  const W2 = A.wrist.getWorldPosition(new THREE.Vector3())
  aimBone(A.elbow, W2, S.clone().add(dir.multiplyScalar(d)))
}
/** 手腕朝向：手的指尖方向（rest 下的 a 轴）指向 aDir、手背朝 back（模型空间方向） */
export function chefHandAim(rig: ChefRig, A: ChefArm, aDir: V3, back: V3) {
  const root = rig.root.parent!; root.updateMatrixWorld(true)
  const F = HANDS[A.side].F
  const ra = new THREE.Vector3(...F.a), rd = new THREE.Vector3(...F.d)
  const ta = new THREE.Vector3(...nrm(aDir)), td = new THREE.Vector3(...nrm(back))
  const tdo = td.clone().sub(ta.clone().multiplyScalar(td.dot(ta))).normalize()
  const mT = new THREE.Matrix4().makeBasis(ta, tdo, ta.clone().cross(tdo).normalize())
  const rdo = rd.clone().sub(ra.clone().multiplyScalar(rd.dot(ra))).normalize()
  const mR = new THREE.Matrix4().makeBasis(ra, rdo, ra.clone().cross(rdo).normalize())
  const qR = new THREE.Quaternion().setFromRotationMatrix(mR), qT = new THREE.Quaternion().setFromRotationMatrix(mT)
  const rootQ = root.getWorldQuaternion(new THREE.Quaternion())
  const qWorld = rootQ.clone().multiply(qT).multiply(qR.invert())
  const parentQ = A.wrist.parent!.getWorldQuaternion(new THREE.Quaternion())
  A.wrist.quaternion.copy(parentQ.invert().multiply(qWorld))
  A.wrist.updateMatrixWorld(true)
}
const flexF = (bs: THREE.Bone[], a: number[]) => bs.forEach((b, i) => { restOf(b); b.quaternion.setFromAxisAngle(b.userData.flexAxis, a[i]) })
export type ChefPose = 'rest' | 'hold' | 'hands' | 'weapon'
export function setChefPose(rig: ChefRig, pose: ChefPose) {
  for (const b of Object.values(rig.bones)) restOf(b)
  for (const p of Object.values(rig.props)) p.visible = false
  rig.root.parent!.updateMatrixWorld(true)
  if (pose === 'rest') return rig
  const fist = (A: ChefArm, k = 1) => { for (const f of ['index', 'middle', 'ring', 'pinky'] as const) flexF(A.fingers[f], [1.25 * k, 1.35 * k, 0.9 * k]); flexF(A.fingers.thumb, [0.3 * k, 0.6 * k, 0.5 * k]) }
  if (pose === 'hold') {
    // 附图：右手托着紫甘蓝举在右胸前（掌心朝上、手指包住），头低下来、吻部朝前下
    chefArmIK(rig, rig.armR, [-0.2, 1.2, 0.36], [-0.8, 0.7, -0.3])
    chefHandAim(rig, rig.armR, [0.5, 0.15, 0.85], [-0.1, -0.95, 0.2])
    for (const f of ['index', 'middle', 'ring', 'pinky'] as const) flexF(rig.armR.fingers[f], [0.55, 0.6, 0.4])
    flexF(rig.armR.fingers.thumb, [0.1, 0.25, 0.2])
    rig.props.cabbage.visible = true
    rig.neck.rotation.x = 0.16; rig.head.rotation.x = 0.26
    return rig
  }
  if (pose === 'hands') {
    for (const A of [rig.armL, rig.armR]) {
      const s = A.side
      chefArmIK(rig, A, [s * 0.15, 1.24, 0.36], [s * 0.8, 0.9, -0.2])
      chefHandAim(rig, A, [-s * 0.25, 0.55, 0.8], [s * 0.15, 0.25, 0.95])
      for (const f of ['index', 'middle', 'ring', 'pinky'] as const) flexF(A.fingers[f], [0.2, 0.3, 0.2])
    }
    return rig
  }
  // 'weapon'：右手把汤锅举到肩高（锅砸前一瞬）
  chefArmIK(rig, rig.armR, [-0.34, 1.58, 0.12], [-0.9, 1.0, -0.5])
  chefHandAim(rig, rig.armR, [0.2, 0.9, 0.4], [-0.9, 0.1, 0.3])
  fist(rig.armR)
  rig.props.pot.visible = true
  rig.chest.rotation.y = 0.18
  return rig
}

/** 三角形统计（只算可见网格；不含 CPU 替身） */
export function chefTris(o: THREE.Object3D) {
  let t = 0, n = 0, fur = 0, small = 0
  o.traverse((m) => {
    const x = m as THREE.Mesh; if (!x.isMesh || x.userData.cpuSkin) return
    let vis = true; for (let p: THREE.Object3D | null = x; p && p !== o; p = p.parent) if (!p.visible) vis = false
    if (!vis) return
    n++; const g = x.geometry, kk = (g.index ? g.index.count : g.attributes.position.count) / 3
    t += kk; if (x.name === 'chefFur') fur += kk; else if (x.name !== 'chefBody') small += kk
  })
  return { tris: Math.round(t), meshes: n, fur: Math.round(fur), small: Math.round(small) }
}
export { EYE, lenv, ARM, CUFF_T0, foreT, APRON, coatCore }
