import { shareHotelRigAssets } from './shared'
// [jazz] 爵士脑（Entity 197）四人乐队·阶段 1 建模（只建模，不做动画 / 机制，未接入游戏）。
// 参照 ZAN 附图 + 定稿（11-02）：宝蓝乐队礼服（双排铜扣、袖上金色盘花、金色编织肩带、金黄立领、合身精裁）、人手不戴手套；
// 乐器就是头（jazzHeads）：头儿小号 / 萨克斯 / 低音提琴 / 鼓（军鼓 + 双镲）。
//
// 做法（沿用厨师 / 野兽）：
//   · 身体写成 SDF（jazzBody：上衣 / 长裤 / 皮鞋 / 手），窄带 Surface Nets 提取 → QEM 减面 → 投影回等值面；前臂袖 + 袖口用细格单独提取。
//   · 金黄立领（薄壳）、黄铜双排扣、金色编织肩带（3 股绞绳）、袖上盘花（金绳绕成环的链状结，两股）、头儿的流苏肩章、乐器头（参数几何）
//     全部并进同一张 SkinnedMesh（1 次绘制）。
//   · 材质补丁（jazzPatch）：按静止坐标 aRest / 材质坐标 aUv 程序生成——呢料斜纹、金绳编织纹、黄铜（假环境反射 + 氧化斑）、
//     镀铬、青铜镲车纹、云杉面板木纹 + 镶线 + f 孔、枫木火焰纹、乌木、鼓皮磨砂、珠母贝、老人手老年斑。
// LOD：每人 0 ≤ 45k、1 ≈ 15k、2 ≈ 5k 三角形。
// 坐标：+Z 正面建造、地面 y=0；外层组 rotation.y = π/2（userData.facesZ = 1，与看门人 / 行李员 / 厨师同约定）。
// 无头 SwiftShader 画 GPU 蒙皮会崩：预览 / 截图带 ?cpu=1。
import * as THREE from 'three'
import { litMaterial } from './shared'
import { decimate, extract, reproject, sdfAO, clamp, mix, sstep, type Sdf, type Surf } from './conciergeSdf'
import type { Shade } from './conciergeHead'
import { makeJazzRig, add, cross, dot, nrm, rot, scl, sub, lenv, type JazzRigDef, type JazzWho, type V3, W4 } from './jazzRig'
import { makeJazzBody, onSurface, frontHit, sdfNormal, MAT, C, COL, type JazzBody } from './jazzBody'
import { Chunk, tube, lathe, braid, catmull, buildHead, BRASS, BRASS_D, type VOpt, type WFn } from './jazzHeads'

const shade0 = (): Shade => ({ r: 1, g: 1, b: 1, rough: 0.8, metal: 0, fur: 0, skin: 0, cloth: 0, wool: 0, fx: 0, fy: 0, fz: 0 })

// ---------- SDF 部件 ----------
interface Part {
  name: string; sdf: Sdf; box: { min: [number, number, number]; max: [number, number, number] }; h: number[]; target: number[]
  keep?: (x: number, y: number, z: number) => boolean; within?: (x: number, y: number, z: number) => boolean; shade: (x: number, y: number, z: number, o: Shade) => void; weights: (x: number, y: number, z: number, acc: W4) => void
  ao?: Sdf; aoScale?: number; fallback: number
}
export const LODS = 3
function parts(R: JazzRigDef, Bd: JazzBody): Part[] {
  const B = R.B, out: Part[] = []
  const fat = R.P.belly > 0 ? 1.12 : 1
  // [修订 E197] 衣身（袖只留肩头一截）与袖子（上臂 / 前臂各一段，只用袖 SDF）分开提取：垂手时袖子与衣身侧片不连成一片，抬臂不拉伸
  out.push({ name: 'coat', sdf: Bd.coatSdfT, box: Bd.COAT_BOX, h: [0.0075, 0.014, 0.024], target: [6900 * fat, 2600, 880].map(Math.round), shade: Bd.coatShade, weights: (x, y, z, a) => Bd.coatWeights(x, y, z, a, false, 'torso'), aoScale: 0.02, ao: (x, y, z) => Math.min(Bd.coatSdfT(x, y, z), Bd.pantsSdf(x, y, z)), fallback: B.chest })
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R', so = Bd.sleeveOnly(s)
    out.push({ name: 'upSleeve' + S, sdf: so, box: Bd.upperSleeveBox(s), h: [0.0062, 0.012, 0.02], target: [950 * fat, 350, 120].map(Math.round), keep: (x, y, z) => Bd.upperSleeveRegion(s, x, y, z) < 0, within: (x, y, z) => Bd.upperSleeveRegion(s, x, y, z) < 0.012, shade: Bd.coatShade, weights: (x, y, z, a) => Bd.coatWeights(x, y, z, a, false, 'sleeve'), aoScale: 0.014, ao: (x, y, z) => Math.min(so(x, y, z), Bd.coatSdfT(x, y, z)), fallback: B['upperArm' + S] })
    out.push({ name: 'sleeve' + S, sdf: so, box: Bd.foreSleeveBox(s), h: [0.0048, 0.009, 0.016], target: [1450, 480, 170], keep: (x, y, z) => Bd.foreSleeveRegion(s, x, y, z) < 0, within: (x, y, z) => Bd.foreSleeveRegion(s, x, y, z) < 0.01, shade: Bd.coatShade, weights: (x, y, z, a) => Bd.coatWeights(x, y, z, a, false, 'sleeve'), aoScale: 0.012, fallback: B['foreArm' + S] })
  }
  out.push({ name: 'pants', sdf: Bd.pantsSdf, box: Bd.PANTS_BOX, h: [0.0075, 0.014, 0.024], target: [3300, 1150, 400], keep: (_x, y) => y < Bd.hemY + 0.05, within: (_x, y) => y < Bd.hemY + 0.08, shade: Bd.pantsShade, weights: Bd.legWeights, aoScale: 0.02, ao: (x, y, z) => Math.min(Bd.pantsSdf(x, y, z), Bd.coatSdf(x, y, z)), fallback: B.hips })
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R', hs = Bd.handSdf(s), sh = Bd.shoeSdf(s)
    out.push({ name: 'shoe' + S, sdf: sh, box: Bd.shoeBox(s), h: [0.004, 0.008, 0.013], target: [1000, 340, 120], shade: (x, y, z, o) => Bd.shoeShade(s, x, y, z, o), weights: (x, y, z, a) => Bd.shoeWeights(s, x, y, z, a), ao: (x, y, z) => (y > 0.08 ? Bd.pantsSdf(x, y, z) : 0.05), aoScale: 0.01, fallback: B['foot' + S] })
    out.push({ name: 'hand' + S, sdf: hs, box: Bd.handBox(s), h: [0.0024, 0.005, 0.0085], target: [2300, 720, 240], keep: Bd.handKeep(s), shade: (x, y, z, o) => Bd.handShade(s, x, y, z, o), weights: (x, y, z, a) => Bd.handWeights(s, x, y, z, a), ao: (x, y, z) => Math.min(hs(x, y, z), Bd.coatSdf(x, y, z)), aoScale: 0.008, fallback: B['hand' + S] })
  }
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
    p.weights(x, y, z, w.reset()); w.finish(p.fallback)
    ch.vert([x, y, z], [nx, ny, nz], [sh.r, sh.g, sh.b], sh.rough, sh.metal, sh.fx ?? 0, 0, w, lod ? 0.76 + 0.24 * occ : 0.6 + 0.4 * occ, x, y)
  }
  for (let i = 0; i < s.idx.length; i++) ch.idx.push(base + s.idx[i])
}
function bakePart(ch: Chunk, p: Part, lod: number, stats: Record<string, number>) {
  const t0 = performance.now(), i0 = ch.idx.length
  stats[p.name + '_v0'] = ch.n
  let s: Surf = extract(p.sdf, { min: p.box.min, max: p.box.max, h: p.h[lod], keep: p.keep, within: p.within, project: 1 })
  if (s.idx.length / 3 > p.target[lod]) { s = decimate(s, p.target[lod]); reproject(p.sdf, s, 0, lod ? 0.003 : 0.0012) }
  bakeSurf(ch, s, p, lod)
  stats[p.name] = (ch.idx.length - i0) / 3
  stats[p.name + '_v1'] = ch.n
  stats[p.name + '_ms'] = Math.round(performance.now() - t0)
}

// ---------- 礼服饰件：立领 / 铜扣 / 编织肩带 / 袖上盘花 / 头儿流苏肩章 ----------
function buildTrims(ch: Chunk, R: JazzRigDef, Bd: JazzBody, lod: number, stats: Record<string, number>) {
  const B = R.B, P = R.P, q = [1, 0.55, 0.3][lod], seg = (n: number) => Math.max(lod >= 2 ? 3 : 4, Math.round(n * q))
  const coatW: WFn = (p, a) => Bd.coatWeights(p[0], p[1], p[2], a)
  /** 金绳：LOD0 多股绞绳，LOD1 / 2 单根管（编织纹靠着色器） */
  const cord = (pts: V3[], r: number, strands: number, pitch: number, o: VOpt, hint?: (k: number) => V3, s0 = 5) => {
    if (lod === 0) braid(ch, pts, r, strands, pitch, s0, o, hint)
    else { const step = lod === 1 ? 1 : 2, pp = pts.filter((_, k) => k % step === 0 || k === pts.length - 1); tube(ch, pp, r * 0.85, lod === 1 ? 4 : 3, { ...o, ex: strands }, true) }
  }
  const gold: VOpt = { col: C(COL.gold), rough: 0.35, metal: 1, mat: MAT.cord, w: coatW, fallback: B.chest }
  const brass: VOpt = { col: BRASS, rough: 0.25, metal: 1, mat: MAT.brass, w: coatW, fallback: B.chest }
  // —— [修订 E197] 领口：前襟开 V 口，两侧翻出金黄衬里（翻领三角），后 / 侧一圈矮翻领（金黄）；V 口里深色内衬在 jazzBody 着色 ——
  let i0 = ch.idx.length
  const N = Bd.NECK
  const topSurfY = (x: number, z: number) => { let lo = Bd.topY - 0.2, hi = Bd.topY + 0.03; for (let k = 0; k < 28; k++) { const m = (lo + hi) / 2; if (Bd.coatSdf(x, m, z) < 0) lo = m; else hi = m } return lo }
  const gap = Bd.V_GAP, ns = seg(30), nh = Math.max(2, seg(4))
  /** 后 / 侧翻领：领座椭圆上 phi ∈ [gap, 2π − gap]，后中最高、两端（接翻领三角）矮；上沿外翻 */
  const colH = (phi: number) => mix(0.021, 0.032, (1 - Math.cos(phi)) / 2) + (P.old ? -0.003 : 0)
  const colP = (s: number, t: number, off: number): V3 => {
    const phi = mix(gap, Math.PI * 2 - gap, s)
    const flare = 1 + 0.2 * t * t // 上沿外翻（翻领感）
    const x = Math.sin(phi) * N.rx * flare, z = N.c[2] + Math.cos(phi) * N.rz * flare
    const y0 = topSurfY(x, z) - 0.006
    const nx = Math.sin(phi), nz = Math.cos(phi)
    return [x + nx * off, mix(y0, y0 + colH(phi), t), z + nz * off]
  }
  const collarO: VOpt = { col: C(COL.collar), rough: 0.6, mat: MAT.goldCloth, w: (p, a) => { const k = sstep(Bd.topY - 0.01, Bd.topY + 0.04, p[1]) * 0.5; a.add(B.chest, 1 - k); a.add(B.neck, k) }, fallback: B.chest }
  const th = 0.0035
  for (const sg of [1, -1]) {
    const base = ch.n, w = new W4()
    for (let i = 0; i <= ns; i++) for (let j = 0; j <= nh; j++) {
      const s = i / ns, t = j / nh, p = colP(s, t, sg * th)
      const phi = mix(gap, Math.PI * 2 - gap, s), n: V3 = scl(nrm([Math.sin(phi), -0.25 * t, Math.cos(phi)]), sg)
      collarO.w(p, w.reset(), 0); w.finish(B.chest)
      const k = sg > 0 ? 0.88 + 0.12 * t : 0.5
      const cc = C(COL.collar)
      ch.vert(p, n, [cc[0] * k, cc[1] * k, cc[2] * k], 0.6, 0, MAT.goldCloth, 0, w, 1, s * 0.4, t)
    }
    for (let i = 0; i < ns; i++) for (let j = 0; j < nh; j++) { const a = base + i * (nh + 1) + j, b = a + nh + 1; if (sg > 0) ch.idx.push(a, b, a + 1, b, b + 1, a + 1); else ch.idx.push(a, a + 1, b, b, a + 1, b + 1) }
  }
  // 翻领上沿金绳
  const top: V3[] = []; for (let i = 0; i <= ns; i++) top.push(colP(i / ns, 1, 0))
  tube(ch, top, 0.0032, seg(6), { ...gold, w: collarO.w }, true)
  // 翻领三角（左右各一）：A = 后翻领端点（领座侧）、B = V 底（前中）、C = 外角（胸前上方）；折边 A→B 略翻起，外边 A→C→B 平贴衣面
  const lapW: WFn = (p, a) => Bd.coatWeights(p[0], p[1], p[2], a, true)
  const lapO: VOpt = { ...gold, w: lapW }
  for (const sd of [1, -1]) {
    const A0 = colP(sd > 0 ? 0 : 1, 0, 0)
    const Ap: V3 = [A0[0], A0[1] + 0.004, A0[2]]
    const Bp: V3 = frontHit(Bd.coatSdf, sd * 0.003, Bd.V_Y, 0)
    const Cp: V3 = frontHit(Bd.coatSdf, sd * (N.rx + 0.044), Bd.topY - 0.046, 0)
    const nu = Math.max(4, seg(10)), nv = Math.max(2, seg(4)), uc = 0.3
    const outer = (u: number): V3 => (u < uc ? add(Ap, scl(sub(Cp, Ap), u / uc)) : add(Cp, scl(sub(Bp, Cp), (u - uc) / (1 - uc))))
    const P0 = (u: number, v: number): V3 => {
      const f = add(Ap, scl(sub(Bp, Ap), u)), o = outer(u), q = add(f, scl(sub(o, f), v))
      // 折边翻起（离衣面 3.5 → 1.6 mm）；靠领座处随领口往里收
      return onSurface(Bd.coatSdf, q, 0.0016 + 0.0034 * (1 - v) * (1 - v) * Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.05)))
    }
    const grid: V3[][] = [], base = ch.n, w = new W4(), cc = C(COL.collar)
    for (let i = 0; i <= nu; i++) { grid.push([]); for (let j = 0; j <= nv; j++) grid[i].push(P0(i / nu, j / nv)) }
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const p = grid[i][j], pu = grid[Math.min(nu, i + 1)][j], pm = grid[Math.max(0, i - 1)][j], pv = grid[i][Math.min(nv, j + 1)], pn = grid[i][Math.max(0, j - 1)]
      let n = nrm(cross(sub(pu, pm), sub(pv, pn))); if (sd > 0) n = scl(n, -1)
      if (!(lenv(n) > 0.5) || dot(n, sdfNormal(Bd.coatSdf, p)) < 0.2) n = sdfNormal(Bd.coatSdf, p)
      lapW(p, w.reset(), 0); w.finish(B.chest)
      const k = 0.86 + 0.14 * (1 - j / nv) // 折边受光、外边贴衣面略暗
      ch.vert(p, n, [cc[0] * k, cc[1] * k, cc[2] * k], 0.6, 0, MAT.goldCloth, 0, w, 1, p[0] * 4, p[1] * 4)
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = base + i * (nv + 1) + j, b = a + nv + 1; if (sd < 0) ch.idx.push(a, a + 1, b, b, a + 1, b + 1); else ch.idx.push(a, b, a + 1, b, b + 1, a + 1) }
    // 折边一道深金细绳（翻折线）+ 外边金色滚边
    const fold: V3[] = [], edge: V3[] = []
    for (let i = 0; i <= nu; i++) { fold.push(grid[i][0]); edge.push(grid[i][nv]) }
    tube(ch, fold, 0.0022, seg(6), { ...lapO, col: C(COL.goldSh) }, true)
    tube(ch, edge, 0.0024, seg(5), lapO, true)
  }
  // 领座里面：深色内领（布）从衣面领口收成一圈，接到乐器头颈部法兰底下（不露缝；前面 V 口里看得见）
  {
    const c0: V3 = [0, topSurfY(0, N.c[2]) + 0.0015, N.c[2]], yTop = Math.max(0.008, R.J.head[1] - 0.066 - c0[1])
    lathe(ch, c0, [0, 1, 0], [[N.rx * 0.98, -0.004], [N.rx * 0.9, yTop * 0.35], [N.rx * 0.74, yTop * 0.8], [0.046, yTop], [0.036, yTop + 0.002], [0.0, yTop + 0.002]], seg(24), { col: C(COL.inner), rough: 0.9, mat: MAT.wool, w: collarO.w, fallback: B.chest })
  }
  stats.collar = (ch.idx.length - i0) / 3
  // —— 黄铜双排扣（两列 × 5 排）：[修订] 军装扣——外圈圆边凸起、扣面略平，扣面浮雕（竖琴 + 珠圈）在着色器里按扣面平面坐标画（MAT.medal 凹凸）——
  i0 = ch.idx.length
  const btnSeg = lod >= 2 ? 6 : seg(12)
  const medal: VOpt = { ...brass, mat: MAT.medal }
  for (const y of Bd.BTN_Y) for (const sx of [1, -1]) {
    const x = sx * Bd.BTN_X - 0.006
    const p = frontHit(Bd.coatSdf, x, y, 0), n = sdfNormal(Bd.coatSdf, p)
    const r = 0.0108, v0 = ch.n, O = add(p, scl(n, -0.001))
    lathe(ch, O, n, lod >= 2 ? [[r, 0], [r * 0.9, 0.004], [0, 0.0055]] : [[r * 0.94, 0], [r, 0.0014], [r, 0.0032], [r * 0.93, 0.0044], [r * 0.84, 0.0042], [r * 0.78, 0.0046], [r * 0.5, 0.0054], [0.0, 0.0057]], btnSeg, medal)
    // 扣面平面坐标（单位 = 扣半径；v 朝上）→ aUv
    const up = nrm(sub([0, 1, 0], scl(n, n[1]))), rt = cross(up, n)
    for (let k = v0; k < ch.n; k++) { const d = sub([ch.pos[k * 3], ch.pos[k * 3 + 1], ch.pos[k * 3 + 2]] as V3, O); ch.uv[k * 2] = dot(d, rt) / r; ch.uv[k * 2 + 1] = dot(d, up) / r }
  }
  stats.buttons = (ch.idx.length - i0) / 3
  // —— 金色滚边（细金绳）：前襟叠边（领口 → 下摆）、下摆一圈、袖口上沿一圈 ——
  i0 = ch.idx.length
  {
    const pipeO: VOpt = { ...gold, ex: 1, w: (p, a) => Bd.coatWeights(p[0], p[1], p[2], a, true) }
    const pr = 0.0031, ps = lod >= 2 ? 3 : lod ? 4 : 6
    const ne = Math.max(10, Math.round(40 * q)), edge: V3[] = []
    for (let k = 0; k <= ne; k++) { const y = mix(Bd.V_Y + 0.002, Bd.hemY + 0.004, k / ne); edge.push(frontHit(Bd.coatSdf, Bd.edgeX(y) - 0.0015, y, 0.0022)) }
    tube(ch, edge, pr, ps, pipeO, true)
    const nh = Math.max(16, Math.round(72 * q)), hem: V3[] = []
    for (let k = 0; k < nh; k++) { const a = (k / nh) * Math.PI * 2; { const dx = Math.sin(a), dz = Math.cos(a), y = Bd.hemY + 0.0045; let lo = 0.02, hi = 0.45; for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (Bd.coatCore(dx * m, y, 0.004 + dz * m) < 0) lo = m; else hi = m } hem.push([dx * (lo + 0.0018), y, 0.004 + dz * (lo + 0.0018)]) } }
    tube(ch, hem, pr, ps, pipeO, false, true)
    if (lod < 2) for (const s of [1, -1]) {
      const A = Bd.ARM[s], c0 = add(A.e, scl(A.df, A.Lf * (Bd.CUFF_T0 + 0.006)))
      const u0 = nrm(cross(A.df, [0, 0, 1])), w0 = cross(A.df, u0), nc = Math.max(10, Math.round(32 * q)), ring: V3[] = []
      for (let k = 0; k < nc; k++) { const a = (k / nc) * Math.PI * 2; { const sf = (x: number, y: number, z: number) => Bd.sleeve(s, x, y, z); const d = add(scl(u0, Math.cos(a)), scl(w0, Math.sin(a))); let lo = 0.0, hi = 0.15; for (let it = 0; it < 28; it++) { const m = (lo + hi) / 2; const pp = add(c0, scl(d, m)); if (sf(pp[0], pp[1], pp[2]) < 0) lo = m; else hi = m } ring.push(add(c0, scl(d, lo + 0.0018))) } }
      const fb = B['foreArm' + (s > 0 ? 'L' : 'R')]
      tube(ch, ring, pr, ps, { ...pipeO, w: (_p, a) => { a.add(fb, 1) }, fallback: fb }, false, true)
    }
  }
  stats.piping = (ch.idx.length - i0) / 3
  // —— 裤侧金色侧章条：贴着裤管外侧的薄带（沿高度扫）——
  i0 = ch.idx.length
  for (const s of [1, -1]) {
    const Lg = Bd.LEG[s], legW: WFn = (p, a) => Bd.legWeights(p[0], p[1], p[2], a)
    const axisAt = (y: number): V3 => { if (y >= Lg.knee[1]) { const t = (Lg.hip[1] - y) / (Lg.hip[1] - Lg.knee[1]); return add(Lg.hip, scl(sub(Lg.knee, Lg.hip), t)) } const t = (Lg.knee[1] - y) / (Lg.knee[1] - Lg.ankle[1]); return add(Lg.knee, scl(sub(Lg.ankle, Lg.knee), t)) }
    const y0 = Bd.hemY - 0.02, y1 = 0.1, nv = Math.max(6, Math.round(40 * q))
    const sdfL = (x: number, y: number, z: number) => Bd.pantsLeg(s, x, y, z)
    const strip = (u: number, v: number): V3 => { const y = mix(y0, y1, v), a = axisAt(y); return onSurface(sdfL, [a[0] + s * 0.2, y, a[2] - 0.004 + (u - 0.5) * 0.019], 0.0009) }
    const base = ch.n, w = new W4(), gc = C(COL.gold)
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= 2; i++) {
      const p = strip(i / 2, j / nv), n = sdfNormal(sdfL, p)
      legW(p, w.reset(), 0); w.finish(B.hips)
      ch.vert(p, n, gc, 0.5, 0, MAT.goldCloth, 0, w, 0.92 + 0.08 * (i === 1 ? 1 : 0), p[0], p[1])
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < 2; i++) { const a = base + j * 3 + i, b = a + 3; if (s < 0) ch.idx.push(a, b, a + 1, b, b + 1, a + 1); else ch.idx.push(a, a + 1, b, b, a + 1, b + 1) }
  }
  stats.stripe = (ch.idx.length - i0) / 3
  // —— 金色编织肩带：领侧 → 肩点，沿衣面（3 股绞绳），肩点一颗小铜扣 ——
  i0 = ch.idx.length
  for (const s of [1, -1]) {
    const A = Bd.ARM[s]
    const p0: V3 = [s * (N.rx + 0.012), Bd.topY - 0.004, N.c[2] - 0.004], p1: V3 = [A.a[0] + s * 0.012, A.a[1] + P.armR + 0.006, A.a[2] - 0.004]
    const n = Math.max(6, Math.round(20 * q)), pts: V3[] = []
    for (let k = 0; k <= n; k++) { const t = k / n; pts.push(onSurface(Bd.coatSdf, add(add(p0, scl(sub(p1, p0), t)), [0, 0.03, 0]), 0.0055)) }
    cord(pts, 0.0062, 3, 0.022, gold, () => [0, 1, 0], 5)
    // 第二道细绳（肩带下沿一圈小环垂到腋前：附图的绳穗）
    const loop: V3[] = []
    for (let k = 0; k <= n; k++) { const t = k / n, sag = Math.sin(Math.PI * t) * 0.07; const g = add(add(p1, scl(sub([s * (P.chestW * 0.55), Bd.topY - 0.13, 0.12], p1), t)), [0, -sag * 0.5, 0]); loop.push(onSurface(Bd.coatSdf, g, 0.004)) }
    if (lod < 2 && P.old) cord(loop, 0.0042, 2, 0.016, gold, undefined, 4)
    const bp = onSurface(Bd.coatSdf, add(p1, [-s * 0.012, 0.02, 0]), 0.004), bn = sdfNormal(Bd.coatSdf, bp)
    lathe(ch, bp, bn, [[0.0068, 0], [0.007, 0.0016], [0.0055, 0.0034], [0.0, 0.0044]], seg(10), brass)
    // 头儿：流苏肩章（肩板 + 一圈金线流苏）
    if (P.old) {
      const c0 = onSurface(Bd.coatSdf, add(p1, [-s * 0.03, 0.03, 0]), 0.006)
      const nf = Math.max(4, Math.round(10 * q))
      lathe(ch, c0, sdfNormal(Bd.coatSdf, c0), [[0.0, 0.0], [0.04, 0.0], [0.043, 0.004], [0.04, 0.008], [0.0, 0.009]], seg(18), { ...gold, mat: MAT.goldCloth, col: C(COL.collar) })
      for (let k = 0; k < nf; k++) {
        const a = (k / (nf - 1) - 0.5) * Math.PI * 1.1
        const d: V3 = nrm([s * Math.cos(a), 0, Math.sin(a)])
        const top2 = add(c0, add(scl(d, 0.04), [0, -0.002, 0])), out = add(top2, scl(d, 0.014))
        const fr: V3[] = [top2, add(out, [0, -0.012, 0]), add(out, [0, -0.04, 0]), add(out, [0, -0.06, 0])]
        tube(ch, catmull(fr, lod ? 1 : 3), 0.0032, lod ? 3 : 4, { ...gold, ex: 2 }, true)
      }
    }
  }
  stats.shoulder = (ch.idx.length - i0) / 3
  // —— 袖上盘花：上臂外侧，金绳绕成一串环（长摆线：链状环）+ 顶端三叶结；两股绞绳 ——
  i0 = ch.idx.length
  for (const s of [1, -1]) {
    const A = Bd.ARM[s]
    const out0 = nrm(sub(nrm([s, 0, 0.45]), scl(A.du, dot(nrm([s, 0, 0.45]), A.du))))
    const surfAt = (b: number, a: number): V3 => {
      const base = add(A.a, scl(A.du, 0.055 + b))
      const r = P.armR + 0.016
      const d = rot(out0, A.du, a / r)
      return onSurface((x, y, z) => Bd.sleeve(s, x, y, z), add(base, scl(d, r + 0.01)), 0.0028)
    }
    const n = Math.max(30, Math.round(80 * q)), pts: V3[] = []
    const loops = 4, len = Math.min(0.2, A.Lu * 0.68), Rl = 0.0135, om = loops * Math.PI * 2
    for (let k = 0; k <= n; k++) {
      const t = k / n
      // 长摆线（b 向下推进，环的大小向下渐小）
      const sz = 1 - 0.3 * t
      const b = len * t - Rl * sz * Math.sin(om * t) * 1.15, a = s * Rl * sz * (Math.cos(om * t) - 1) * 0.9 + s * 0.006
      pts.push(surfAt(b, a))
    }
    // 顶端三叶结：从第一个环往上绕三瓣
    const tre: V3[] = []
    for (let k = 0; k <= Math.round(40 * q) + 8; k++) { const t = k / (Math.round(40 * q) + 8), th2 = t * Math.PI * 2, rr = 0.011 * Math.abs(Math.cos(1.5 * th2)) + 0.002; tre.push(surfAt(-0.012 + rr * -Math.cos(th2), s * (rr * Math.sin(th2)) + s * 0.006)) }
    cord(pts, 0.0058, 2, 0.014, gold, (k) => sdfNormal((x, y, z) => Bd.sleeve(s, x, y, z), pts[k]), 4)
    if (lod < 2) cord(tre, 0.0038, 2, 0.01, gold, (k) => sdfNormal((x, y, z) => Bd.sleeve(s, x, y, z), tre[k]), 4)
  }
  stats.knots = (ch.idx.length - i0) / 3
}

// ---------- 几何缓存 ----------
interface Built { body: THREE.BufferGeometry; stats: Record<string, number> }
const cache: Record<string, Built> = {}
export function jazzGeometryReady(who: JazzWho, lod = 0): boolean { return !!cache[who + lod] }
export function buildJazzGeometry(who: JazzWho, lod = 0): Built {
  const task = prepareJazzGeometry(who, lod)
  let step = task.next()
  while (!step.done) step = task.next()
  return step.value
}
export function* prepareJazzGeometry(who: JazzWho, lod = 0): Generator<void, Built> {
  lod = Math.max(0, Math.min(LODS - 1, lod))
  const key = who + lod
  if (cache[key]) return cache[key]
  const R = makeJazzRig(who), Bd = makeJazzBody(R)
  const t0 = performance.now(), stats: Record<string, number> = {}
  const ch = new Chunk()
  for (const p of parts(R, Bd)) { yield; bakePart(ch, p, lod, stats) }
  yield
  buildTrims(ch, R, Bd, lod, stats)
  yield
  const h0 = performance.now()
  stats.head = buildHead(ch, R, lod, stats)
  stats.head_ms = Math.round(performance.now() - h0)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(ch.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(ch.nrm, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(ch.col, 3)); g.setAttribute('aMat', new THREE.Float32BufferAttribute(ch.mat, 2)); g.setAttribute('aRM', new THREE.Float32BufferAttribute(ch.rm, 2)); g.setAttribute('aUv', new THREE.Float32BufferAttribute(ch.uv, 2))
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(ch.si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(ch.sw, 4))
  g.setIndex(ch.n > 65535 ? new THREE.Uint32BufferAttribute(ch.idx, 1) : new THREE.Uint16BufferAttribute(ch.idx, 1))
  g.setAttribute('aRest', new THREE.BufferAttribute(new Float32Array(ch.pos), 3)); g.setAttribute('aRN', new THREE.BufferAttribute(new Float32Array(ch.nrm), 3))
  g.computeBoundingSphere(); g.boundingSphere!.radius *= 1.3
  stats.tris = ch.idx.length / 3
  stats.ms = Math.round(performance.now() - t0)
  return (cache[key] ??= { body: g, stats })
}

// ======================================================================
// 材质
// ======================================================================
export const JAZZ_UNI = {
  /** 高光方向（视空间） */
  uSpecDir: { value: new THREE.Vector3(0.35, 0.62, 0.7).normalize() },
  /** 金属假环境反射强度（场景暗时调低，避免金属在黑暗里自己发亮） */
  uEnv: { value: 1.0 },
}
const GLSL = `
uniform vec3 uSpecDir; uniform float uEnv;
varying vec3 vJzRest; varying vec3 vJzRN; varying vec2 vJzMat; varying vec2 vJzRM; varying vec2 vJzUv;
float jzH13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float jzN(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(jzH13(i), jzH13(i + vec3(1,0,0)), f.x), mix(jzH13(i + vec3(0,1,0)), jzH13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(jzH13(i + vec3(0,0,1)), jzH13(i + vec3(1,0,1)), f.x), mix(jzH13(i + vec3(0,1,1)), jzH13(i + vec3(1,1,1)), f.x), f.y), f.z); }
// 低音提琴 f 孔（面板坐标 q = (|x|, 自琴身底起的 y)）：S 形琴腰 + 上眼（偏内）/ 下眼（偏外）+ 中间刻口
float jzFHole(vec2 q){
  float d = 1.0;
  vec2 cp = vec2(0.128, 0.14);
  for (int i = 1; i <= 14; i++) { float t = float(i) / 14.0; vec2 c = vec2(0.108 - 0.02 * sin(3.14159 * (t - 0.5)), 0.14 + 0.15 * t); float w = 0.0034 + 0.0022 * sin(3.14159 * t);
    vec2 pa = q - cp, ba = c - cp; float hh = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); d = min(d, length(pa - ba * hh) - w); cp = c; }
  d = min(d, length(q - vec2(0.108 - 0.02 - 0.005, 0.29 + 0.003)) - 0.009);
  d = min(d, length(q - vec2(0.108 + 0.02 + 0.005, 0.14 - 0.003)) - 0.01);
  d = min(d, max(abs(q.y - 0.213) - 0.0016, abs(q.x - 0.108) - 0.013));
  return d;
}
// [修订 E197] 军装扣扣面浮雕（扣面平面坐标 q，单位 = 扣半径）：竖琴（两弯臂 + 横梁 + 底座 + 三根弦）+ 一圈珠点；返回高度 0..1
float jzSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float jzMedal(vec2 q){
  vec2 p = vec2(abs(q.x), q.y);
  float d = 1.0;
  // 弯臂（右半，左右对称）：底 → 外鼓 → 收 → 角尖外卷
  vec2 P0 = vec2(0.1, -0.46), P1 = vec2(0.3, -0.32), P2 = vec2(0.36, -0.06), P3 = vec2(0.27, 0.16), P4 = vec2(0.25, 0.34), P5 = vec2(0.36, 0.46), P6 = vec2(0.42, 0.4);
  d = min(d, jzSeg(p, P0, P1) - 0.06); d = min(d, jzSeg(p, P1, P2) - 0.06); d = min(d, jzSeg(p, P2, P3) - 0.055);
  d = min(d, jzSeg(p, P3, P4) - 0.05); d = min(d, jzSeg(p, P4, P5) - 0.045); d = min(d, jzSeg(p, P5, P6) - 0.04);
  d = min(d, jzSeg(p, vec2(0.0, -0.48), vec2(0.2, -0.48)) - 0.055); // 底座
  d = min(d, jzSeg(p, vec2(0.0, 0.3), vec2(0.26, 0.3)) - 0.035); // 横梁
  float h = 1.0 - smoothstep(-0.02, 0.02, d);
  // 三根弦（细、低一点）
  float st = min(abs(q.x), abs(abs(q.x) - 0.12)) - 0.016;
  h = max(h, 0.55 * (1.0 - smoothstep(-0.012, 0.012, st)) * step(-0.44, q.y) * step(q.y, 0.29));
  // 珠圈
  float r = length(q), an = atan(q.y, q.x);
  float bead = length(vec2((r - 0.68) * 1.0, (fract(an / 6.28318 * 18.0) - 0.5) * 6.28318 * 0.68 / 18.0)) - 0.042;
  h = max(h, 0.8 * (1.0 - smoothstep(-0.015, 0.015, bead)));
  return h;
}
vec3 jzEnv(vec3 rv){
  vec3 rw = (vec4(rv, 0.0) * viewMatrix).xyz;
  float y = rw.y;
  vec3 c = y > 0.0 ? mix(vec3(0.42, 0.36, 0.3), vec3(1.05, 0.98, 0.88), smoothstep(0.0, 0.85, y)) : mix(vec3(0.07, 0.05, 0.045), vec3(0.32, 0.24, 0.2), smoothstep(-0.9, 0.0, y));
  c += 1.6 * smoothstep(0.9, 0.985, dot(rw, normalize(vec3(0.55, 0.62, 0.55))));
  c += 0.7 * smoothstep(0.86, 0.98, dot(rw, normalize(vec3(-0.75, 0.25, 0.5))));
  c += 0.35 * smoothstep(0.75, 0.98, dot(rw, normalize(vec3(0.0, 0.1, -1.0))));
  return c;
}
`
function jazzPatch(m: THREE.Material) {
  const prev = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey()
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r)
    Object.assign(sh.uniforms, { uSpecDir: JAZZ_UNI.uSpecDir, uEnv: JAZZ_UNI.uEnv })
    sh.vertexShader = 'attribute vec3 aRest;\nattribute vec3 aRN;\nattribute vec2 aMat;\nattribute vec2 aRM;\nattribute vec2 aUv;\nvarying vec3 vJzRest;\nvarying vec3 vJzRN;\nvarying vec2 vJzMat;\nvarying vec2 vJzRM;\nvarying vec2 vJzUv;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvJzRest = aRest; vJzRN = aRN; vJzMat = aMat; vJzRM = aRM; vJzUv = aUv;')
    sh.fragmentShader = GLSL + 'float jzMetal = 0.0; float jzSpec = 0.0; float jzPow = 40.0;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 p = vJzRest, n = normalize(vJzRN);
        float id = vJzMat.x + 0.5;
        float fwp = length(fwidth(p));
        float fa = 1.0 - smoothstep(0.0004, 0.0014, fwp);
        if (id > 1.0 && id < 2.0) {
          // 呢料：斜纹（华达呢）+ 绒感
          float tw = sin((p.x * 0.7 + p.y + p.z * 0.7) * 2400.0);
          diffuseColor.rgb *= 1.0 + 0.07 * tw * fa + 0.06 * (jzN(p * 140.0) - 0.5);
        } else if (id > 2.0 && id < 3.0) {
          // 金绳：股上斜向缠绕的细纹
          float s = sin(vJzUv.x * 1800.0 + vJzUv.y * 6.2832 * 2.0);
          diffuseColor.rgb *= 0.85 + 0.3 * mix(0.5, s * 0.5 + 0.5, fa);
          jzMetal = 0.45; jzSpec = 0.5; jzPow = 24.0;
        } else if (id > 3.0 && id < 4.0) {
          diffuseColor.rgb *= 1.0 - 0.22 * smoothstep(0.55, 0.85, jzN(p * 24.0)) - 0.06 * jzN(p * 160.0);
          jzMetal = 1.0; jzSpec = 1.0; jzPow = 90.0;
        } else if (id > 4.0 && id < 6.0) {
          diffuseColor.rgb *= 1.0 + fa * 0.12 * (jzH13(floor(p * 900.0)) - 0.5) + 0.08 * (jzN(p * 60.0) - 0.5);
          if (id > 5.0) {
            // 老年斑：手背 / 腕上不规则褐斑
            float sp = jzN(p * 170.0) * 0.65 + jzN(p * 380.0) * 0.35;
            float spot = smoothstep(0.7, 0.76, sp) * smoothstep(0.0, 0.5, dot(n, normalize(vec3(0.0, 0.3, 0.2))) + 0.6);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.45, 0.32), spot * 0.85);
          }
          jzSpec = 0.06; jzPow = 18.0;
        } else if (id > 6.0 && id < 7.0) { jzSpec = 0.55; jzPow = 70.0; }
        else if (id > 7.0 && id < 8.0) {
          if (vJzMat.y < 0.5) {
            // 枫木火焰纹 + 年轮
            float fl = sin(vJzUv.y * 260.0 + jzN(p * vec3(30.0, 4.0, 30.0)) * 7.0);
            float gr = sin(vJzUv.x * 900.0 + jzN(p * 40.0) * 4.0);
            diffuseColor.rgb *= 0.84 + 0.22 * fl * fa + 0.06 * gr * fa;
          }
          jzSpec = 0.32; jzPow = 60.0;
        } else if (id > 8.0 && id < 9.0) { diffuseColor.rgb *= 0.95 + 0.1 * jzN(p * 500.0) * fa; jzSpec = 0.05; jzPow = 12.0; }
        else if (id > 9.0 && id < 10.0) { jzMetal = 1.0; jzSpec = 1.2; jzPow = 120.0; }
        else if (id > 17.0 && id < 18.0) {
          // 军装扣：浮雕凸处抛光亮、底子与沟缝氧化发暗（远处 fwidth 大时淡出成素黄铜）
          float mfa = 1.0 - smoothstep(0.08, 0.3, length(fwidth(vJzUv)));
          float r = length(vJzUv);
          float h = jzMedal(vJzUv) * step(r, 0.8);
          float cav = smoothstep(0.0, 0.4, h) * (1.0 - smoothstep(0.6, 1.0, h));
          diffuseColor.rgb *= mix(1.0, mix(0.72, 1.12, h) * (1.0 - 0.35 * cav) * mix(1.0, 0.8, smoothstep(0.7, 0.82, r) * (1.0 - smoothstep(0.82, 0.9, r))), mfa);
          diffuseColor.rgb *= 1.0 - 0.18 * smoothstep(0.55, 0.85, jzN(p * 24.0));
          jzMetal = 1.0; jzSpec = 1.0; jzPow = 90.0;
        }
        else if (id > 11.0 && id < 12.0) { jzSpec = 0.3; jzPow = 50.0; }
        else if (id > 12.0 && id < 13.0) {
          float sw = jzN(p * 900.0 + vec3(0.0, 0.0, jzN(p * 300.0) * 3.0));
          diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(1.0, 0.86, 0.92), vec3(0.82, 0.95, 1.05), sw), 0.6);
          jzSpec = 0.6; jzPow = 60.0;
        } else if (id > 13.0 && id < 14.0) {
          diffuseColor.rgb *= 1.0 + 0.06 * sin((p.x - p.y + p.z) * 2600.0) * fa;
          jzSpec = 0.25; jzPow = 16.0;
        } else if (id > 15.0 && id < 16.0) {
          float gv = sin(vJzUv.x * 2600.0); float gfa = 1.0 - smoothstep(0.00025, 0.0009, fwp);
          diffuseColor.rgb *= 0.86 + 0.22 * mix(0.5, gv * 0.5 + 0.5, gfa);
          jzMetal = 0.9; jzSpec = 0.8; jzPow = 50.0;
        } else if (id > 16.0 && id < 17.0) {
          // 云杉面板：竖向细木纹 + 清漆、双镶线、f 孔
          vec2 q = vJzUv;
          float g = sin(q.x * 620.0 + jzN(vec3(q * vec2(20.0, 3.0), 1.0)) * 5.0);
          diffuseColor.rgb *= 0.88 + 0.16 * smoothstep(-0.3, 1.0, g) * fa;
          diffuseColor.rgb *= 0.9 + 0.1 * (1.0 - smoothstep(0.0, 0.12, abs(q.x)));
          float e = vJzMat.y;
          float pl = (1.0 - smoothstep(0.0006, 0.0011, abs(e - 0.0075))) * 0.9 + (1.0 - smoothstep(0.0005, 0.0009, abs(e - 0.0105))) * 0.9;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.02, 0.015), clamp(pl, 0.0, 1.0));
          diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 0.03, e)); // 边沿清漆更深
          float fh = jzFHole(vec2(abs(q.x), q.y));
          float aa = max(fwidth(fh), 0.0008);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.008, 0.006), 1.0 - smoothstep(-aa, aa, fh));
          diffuseColor.rgb *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.006, fh)) * step(0.0, fh); // f 孔边缘发暗（木头切口）
          jzSpec = 0.35; jzPow = 60.0;
        }
      }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec3 Vv = normalize(vViewPosition); vec3 Hh = normalize(uSpecDir + Vv);
        float nh = max(dot(normal, Hh), 0.0);
        vec3 base = diffuseColor.rgb;
        if (jzMetal > 0.0) {
          vec3 rv = reflect(-Vv, normal);
          float fres = 0.65 + 0.35 * pow(1.0 - clamp(dot(normal, Vv), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += jzMetal * uEnv * base * jzEnv(rv) * fres * 0.85;
          diffuseColor.rgb *= 1.0 - 0.72 * jzMetal;
        }
        totalEmissiveRadiance += jzSpec * pow(nh, jzPow) * mix(vec3(1.0), base * 1.6, jzMetal) * 0.5;
      }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if (vJzMat.x > 16.5 && vJzMat.x < 17.5) {
        // 扣面浮雕凹凸（屏幕空间导数 bump，同 three perturbNormalArb）；高 0.35 mm
        float mfa = 1.0 - smoothstep(0.08, 0.3, length(fwidth(vJzUv)));
        float Hh = jzMedal(vJzUv) * step(length(vJzUv), 0.8) * 0.00035 * mfa;
        vec3 sp = -vViewPosition, sx = dFdx(sp), sy = dFdy(sp);
        vec2 dH = vec2(dFdx(Hh), dFdy(Hh));
        vec3 R1 = cross(sy, normal), R2 = cross(normal, sx);
        float fD = dot(sx, R1) * faceDirection;
        vec3 gr = sign(fD) * (dH.x * R1 + dH.y * R2);
        vec3 bumped = abs(fD) * normal - gr;
        float bumpLen = length(bumped);
        if (bumpLen > 1e-8) normal = bumped / bumpLen;
      }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vJzRM.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vJzRM.y * 0.6;')
  }
  m.customProgramCacheKey = () => key + '|jazz-body'
  return m
}
let MAT0: THREE.Material | null = null
export function jazzMaterial() { if (!MAT0) { MAT0 = jazzPatch(litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.8 })); MAT0.shadowSide = THREE.DoubleSide; MAT0.userData.entityShared = true } return MAT0 }

// ======================================================================
// 装配
// ======================================================================
export interface JazzArm { side: number; clav: THREE.Bone; shoulder: THREE.Bone; elbow: THREE.Bone; wrist: THREE.Bone; fingers: Record<'thumb' | 'index' | 'middle' | 'ring' | 'pinky', THREE.Bone[]> }
export interface JazzLeg { side: number; hip: THREE.Bone; knee: THREE.Bone; ankle: THREE.Bone; toe: THREE.Bone }
export interface JazzRig {
  who: JazzWho; def: JazzRigDef
  root: THREE.Bone; hips: THREE.Bone; spine: THREE.Bone; chest: THREE.Bone; neck: THREE.Bone; head: THREE.Bone
  armL: JazzArm; armR: JazzArm; legL: JazzLeg; legR: JazzLeg; hemL: THREE.Bone; hemR: THREE.Bone
  /** 乐器头骨骼：valve1..3 / octKey,key1..6,keyS / str1..4 / drumHead,cymL,cymR */
  inst: Record<string, THREE.Bone>
  bones: Record<string, THREE.Bone>; body: THREE.SkinnedMesh; lod: number
}
export function buildJazz(who: JazzWho, opts: { lod?: number } = {}): THREE.Group {
  const lod = Math.max(0, Math.min(LODS - 1, opts.lod ?? 0))
  const def = makeJazzRig(who), geo = buildJazzGeometry(who, lod)
  shareHotelRigAssets(geo)
  const face = new THREE.Group(); face.name = 'jazz-' + who; face.rotation.y = Math.PI / 2; face.userData.facesZ = 1
  const bones: THREE.Bone[] = []
  for (const d of def.BONES) {
    const b = new THREE.Bone(); b.name = d.name
    const pp = d.parent >= 0 ? def.BONES[d.parent].pos : [0, 0, 0]
    b.position.set(d.pos[0] - pp[0], d.pos[1] - pp[1], d.pos[2] - pp[2])
    if (d.flex) b.userData.flexAxis = new THREE.Vector3(...d.flex)
    if (d.parent >= 0) bones[d.parent].add(b)
    bones.push(b)
  }
  face.add(bones[0])
  const body = new THREE.SkinnedMesh(geo.body, jazzMaterial()); body.name = 'jazzBody'; body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false
  face.add(body); face.updateMatrixWorld(true)
  body.bind(new THREE.Skeleton(bones), body.matrixWorld)
  for (const b of bones) b.userData.rest = { p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }
  const bn: Record<string, THREE.Bone> = {}; for (const d of def.BONES) bn[d.name] = bones[def.B[d.name]]
  const arm = (s: number): JazzArm => {
    const S = s > 0 ? 'L' : 'R', fingers = {} as JazzArm['fingers']
    for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky'] as const) fingers[f] = [1, 2, 3].map((k) => bn[f + k + S])
    return { side: s, clav: bn['clav' + S], shoulder: bn['upperArm' + S], elbow: bn['foreArm' + S], wrist: bn['hand' + S], fingers }
  }
  const leg = (s: number): JazzLeg => { const S = s > 0 ? 'L' : 'R'; return { side: s, hip: bn['thigh' + S], knee: bn['shin' + S], ankle: bn['foot' + S], toe: bn['toe' + S] } }
  const inst: Record<string, THREE.Bone> = {}; for (const n of def.headBones) inst[n] = bn[n]
  const rig: JazzRig = { who, def, root: bones[0], hips: bn.hips, spine: bn.spine, chest: bn.chest, neck: bn.neck, head: bn.head, armL: arm(1), armR: arm(-1), legL: leg(1), legR: leg(-1), hemL: bn.hemL, hemR: bn.hemR, inst, bones: bn, body, lod }
  face.userData.jazz = rig
  face.userData.jazzStats = { ...geo.stats }
  return face
}

// ======================================================================
// 静帧姿势（预览用；阶段 2 动画会替换）
//   rest     建模姿态
//   play     各自演奏：头儿右手三指按头顶活塞、左手托号管；萨克斯两手按侧面 / 正面按键；低音提琴右手拨弦、左手按指板；鼓头两手背后（不用手）
//   rigtest  乐器头骨骼自检（活塞按下 / 按键合上 / 弦偏移 / 镲倾斜 / 鼓皮凹）
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
/** 两骨 IK：腕到 target（模型空间），肘朝 pole */
export function jazzArmIK(rig: JazzRig, A: JazzArm, target: V3, pole: V3) {
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
/** 手腕朝向：指尖方向（静止 a 轴）→ aDir、手背 → back（模型空间） */
export function jazzHandAim(rig: JazzRig, A: JazzArm, aDir: V3, back: V3) {
  const root = rig.root.parent!; root.updateMatrixWorld(true)
  const F = rig.def.HANDS[A.side].F
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
export type JazzPose = 'rest' | 'play' | 'rigtest' | 'holdHead'
export function setJazzPose(rig: JazzRig, pose: JazzPose) {
  for (const b of Object.values(rig.bones)) restOf(b)
  rig.root.parent!.updateMatrixWorld(true)
  if (pose === 'rest') return rig
  const H = rig.def.J.head
  const curl = (A: JazzArm, k: number[], th = [0.2, 0.3, 0.25]) => { for (const f of ['index', 'middle', 'ring', 'pinky'] as const) flexF(A.fingers[f], k); flexF(A.fingers.thumb, th) }
  if (pose === 'rigtest') {
    for (const [n, b] of Object.entries(rig.inst)) {
      if (n.startsWith('valve')) b.position.y -= 0.012 * Number(n.slice(5)) / 3
      else if (n.startsWith('key')) b.position.z -= 0.004
      else if (n === 'octKey') b.rotation.x = 0.25
      else if (n.startsWith('str')) b.position.x += 0.006 * (Number(n.slice(3)) % 2 ? 1 : -1)
      else if (n === 'drumHead') b.position.z -= 0.01
      else if (n.startsWith('cym')) b.rotation.z = n === 'cymL' ? 0.25 : -0.25
    }
    return rig
  }
  if (pose === 'holdHead') {
    // 低音提琴「一手托头」：右手掌托在琴身下沿
    jazzArmIK(rig, rig.armR, [H[0] - 0.2, H[1] - 0.03, H[2] + 0.12], [-0.9, 0.3, -0.6])
    jazzHandAim(rig, rig.armR, [0.55, 0.45, 0.3], [-0.2, -0.95, 0.1])
    curl(rig.armR, [0.25, 0.3, 0.2])
    rig.neck.rotation.z = 0.06
    return rig
  }
  // play
  if (rig.who === 'leader') {
    // 右手抬到头顶：三指按活塞；左手托住吹口管下方（颈前）
    jazzArmIK(rig, rig.armR, [H[0] - 0.07, H[1] + 0.2, H[2] + 0.0], [-0.9, -0.2, -0.5])
    jazzHandAim(rig, rig.armR, [0.85, 0.05, 0.35], [0.0, 1, 0.0])
    for (const [f, k] of [['index', [0.75, 0.7, 0.35]], ['middle', [0.7, 0.75, 0.35]], ['ring', [0.65, 0.75, 0.35]], ['pinky', [0.9, 1.0, 0.6]]] as const) flexF(rig.armR.fingers[f], [...k])
    flexF(rig.armR.fingers.thumb, [0.5, 0.4, 0.3])
    jazzArmIK(rig, rig.armL, [H[0] + 0.07, H[1] + 0.03, H[2] + 0.1], [0.9, -0.5, -0.3])
    jazzHandAim(rig, rig.armL, [-0.6, 0.3, 0.7], [0.4, 0.1, -0.9])
    curl(rig.armL, [0.7, 0.8, 0.5], [0.4, 0.4, 0.3])
    rig.chest.rotation.x = -0.04
    return rig
  }
  if (rig.who === 'sax') {
    jazzArmIK(rig, rig.armL, [H[0] + 0.06, H[1] + 0.2, H[2] + 0.07], [0.9, -0.3, -0.3])
    jazzHandAim(rig, rig.armL, [-0.7, 0.2, 0.6], [0.5, 0.1, 0.8])
    curl(rig.armL, [0.6, 0.7, 0.4])
    jazzArmIK(rig, rig.armR, [H[0] - 0.05, H[1] + 0.33, H[2] + 0.08], [-0.9, -0.2, -0.4])
    jazzHandAim(rig, rig.armR, [0.8, 0.2, 0.5], [-0.3, 0.2, 0.9])
    curl(rig.armR, [0.55, 0.6, 0.4])
    return rig
  }
  if (rig.who === 'bass') {
    // 右手在琴马上方拨弦、左手按在指板高处
    jazzArmIK(rig, rig.armR, [H[0] - 0.06, H[1] + 0.17, H[2] + 0.16], [-0.9, -0.6, -0.2])
    jazzHandAim(rig, rig.armR, [0.5, 0.3, 0.6], [-0.1, 0.3, 0.95])
    curl(rig.armR, [0.3, 0.5, 0.3])
    jazzArmIK(rig, rig.armL, [H[0] + 0.06, H[1] + 0.55, H[2] + 0.09], [0.9, -0.2, -0.3])
    jazzHandAim(rig, rig.armL, [-0.8, 0.4, 0.3], [0.2, 0.2, 0.95])
    curl(rig.armL, [0.7, 0.8, 0.5])
    return rig
  }
  // drum：不用手，两手背在身后
  for (const A of [rig.armL, rig.armR]) {
    const s = A.side
    jazzArmIK(rig, A, [s * 0.06, 0.96, -0.17], [s * 0.9, 0.0, 0.4])
    jazzHandAim(rig, A, [-s * 0.6, -0.3, -0.3], [s * 0.2, 0.1, -0.95])
    curl(A, [0.5, 0.6, 0.4])
  }
  return rig
}

/** 三角形统计（只算可见网格；不含 CPU 替身） */
export function jazzTris(o: THREE.Object3D) {
  let t = 0, n = 0
  o.traverse((m) => {
    const x = m as THREE.Mesh; if (!x.isMesh || x.userData.cpuSkin) return
    let vis = true; for (let p: THREE.Object3D | null = x; p && p !== o; p = p.parent) if (!p.visible) vis = false
    if (!vis) return
    n++; const g = x.geometry; t += (g.index ? g.index.count : g.attributes.position.count) / 3
  })
  return { tris: Math.round(t), meshes: n }
}
export { BRASS_D, clamp, lenv, cross }
