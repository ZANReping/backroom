// [casino] 第三轮 Louie（ref2）：身体与其他 L5 人形同一做法 / 同一体型——直接复用爵士脑 E197 的人体 / 西装 SDF（jazzBody.makeJazzBody：
//   torsoCore / coatCore 合身礼服衣身、pantsLeg / pantsSdf 西裤、shoeSdf 皮鞋），体型参数按瘦高男子给，窄带 Surface Nets 提取 → QEM 减面 → 投影回等值面
//   （与行李员 / 看门人 / 爵士脑同一管线，衣身 / 袖 / 裤 / 鞋各自的三角形预算同量级）。
//   与爵士脑不同：两只袖子按 Louie 的不对称骨架自己算（右臂举起、前臂朝上），衣身肩头袖帽也跟着走；单排三粒扣 + 胸袋 + 背后燕尾两片；
//   袖端没有手——台球杆从袖口里伸出代替前臂（铜箍 + 铆钉），右腿膝下截掉、裤管卷边接台球杆假肢。补丁（背后下摆绿呢、左前臂芥末黄、膝盖）。
// 头：参照游戏里正常人类 NPC（retroNpc 的复古人物头）——同一套成人头部比例表（宽 ≈ 15 cm、前后 ≈ 19.5 cm、下巴到头顶 ≈ 23.5 cm；
//   按「下巴 / 嘴 / 鼻 / 眼 / 眉 / 额 / 颅顶」逐行给脸半宽、前凸、后脑深与宽，脸面按弧面往后包），在它的基础上加密成连续参数曲面，
//   鼻梁 / 鼻头 / 鼻翼 / 颧骨 / 眉弓 / 唇是同一张面的起伏；皮肤做法同 retroNpc：整头一种肤色、五官区域（唇 / 颊 / 眼周）顶点色分区，材质用员工皮肤 PBR。
//   Louie 设定：左眼（x>0）是嵌进眼窝的 5 号台球（周围肿胀皮肤包边），右眼闭（睫毛线），嘴角向上两道粗黑缝线，球眼下一道竖缝；ref2 的齐肩波波头 + 斜刘海、发梢外翘。
import { extract, decimate, reproject, sdfAO, sdRoundCone, sdEll, smax, smin, gauss, fbm, len3, type Sdf, type Surf } from './conciergeSdf'
import { makeJazzRig, type JazzRigDef, type BodyP, type Joints } from './jazzRig'
import { makeJazzBody, onSurface, sdfNormal } from './jazzBody'
import { SM, hx, mixc, clamp, sstep, noise3, surf, blob, ballSphere, limb, roundEnds, stitches, vo, tube, lathe, sph, basisFromZ, toB, snrm, W4,
  add, sub, scl, nrm, cross, dot, lenv, type V3, type SOpt, type PS, type WFn } from './casinoStaffKit'
import { TILES } from './casinoStaffMat'
import { rowAt, LOUIE_HEAD, LOUIE_EYE, LOUIE_LID_HW, LOUIE_LID_K, LOUIE_HW, LOUIE_HD, LOUIE_STITCH, LOUIE_STITCH_EYE, LOUIE_STITCH_STEP, LOUIE_STITCH_LEN } from './casinoStaffLouieFace'
export { LOUIE_HEAD, LOUIE_EYE }
import type { BuildCtx } from './casinoStaffMesh'

const N = (x: number, q: number, min = 3) => Math.max(min, Math.round(x * q))
const O = (col: SOpt['col'], mat: number, w: WFn, fb: number, x: Partial<SOpt> = {}): SOpt => ({ col, mat, w, fb, ...x })
const dim = (c: number[], k: number) => c.map((v) => v * k)
const G2 = (x: number, sx: number, y: number, sy: number) => Math.exp(-((x / sx) ** 2) - ((y / sy) ** 2))

// ---------- 体型（爵士脑 BASE × 0.99 的关节；瘦高）——与 casinoStaffRig.HUMAN_J.louie 一致 ----------
export const LOUIE_JZ: Joints = {
  hips: [0, 0.98, 0], spine: [0, 1.119, -0.008], chest: [0, 1.287, -0.012], neck: [0, 1.485, -0.022], head: [0, 1.569, -0.018],
  clav: [0.028, 1.46, -0.012], shoulder: [0.178, 1.437, -0.022], elbow: [0.222, 1.156, -0.05], wrist: [0.238, 0.903, 0.012],
  hip: [0.088, 0.926, 0.0], knee: [0.098, 0.505, 0.012], ankle: [0.104, 0.087, -0.03], toe: [0.11, 0.022, 0.1],
}
/** 右臂（x<0）举起：上臂垂向外前、肘在腰侧外，前臂朝上（ref2） */
export const LOUIE_ARM_R = { shoulder: [-0.178, 1.437, -0.022] as V3, elbow: [-0.31, 1.13, 0.07] as V3, wrist: [-0.31, 1.41, 0.14] as V3, tip: [-0.315, 1.79, 0.15] as V3 }
const LOUIE_P: BodyP = { who: 'sax', chestW: 0.156, chestD: 0.106, waistW: 0.126, waistD: 0.092, hipW: 0.15, hipD: 0.102, belly: 0, armR: 0.05, foreR: 0.042, thighR: 0.076, shinR: 0.056, fingerL: 1, fingerR: 1, knuckle: 1, old: false, skin: 0xe2b89a, hemY: 0.84 }
/** 头部比例（retroNpc 成人头表）：下巴 y、下巴到头顶高 */

interface LPart { name: string; sdf: Sdf; box: { min: [number, number, number]; max: [number, number, number] }; h: number[]; target: number[]; keep?: (x: number, y: number, z: number) => boolean; within?: (x: number, y: number, z: number) => boolean; shade: (p: V3) => { c: number[]; mat: number; rough: number }; w: WFn; fb: number; ao?: Sdf; aoScale?: number; uv: (p: V3) => [number, number] }
const _w = new W4()
function bake(c: BuildCtx, p: LPart) {
  const { ch, lod } = c
  let s: Surf = extract(p.sdf, { min: p.box.min, max: p.box.max, h: p.h[lod], keep: p.keep, within: p.within, project: 1 })
  if (s.idx.length / 3 > p.target[lod]) { s = decimate(s, p.target[lod]); reproject(p.sdf, s, 0, lod ? 0.003 : 0.0012) }
  const grid = s.sample ?? p.sdf, extra = p.ao, aoF: Sdf = extra ? (x, y, z) => Math.min(grid(x, y, z), extra(x, y, z)) : grid
  const base = ch.n
  for (let i = 0; i < s.vcount; i++) {
    const P: V3 = [s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]], n: V3 = [s.nrm[i * 3], s.nrm[i * 3 + 1], s.nrm[i * 3 + 2]]
    const sh = p.shade(P), occ = sdfAO(aoF, P[0], P[1], P[2], n[0], n[1], n[2], p.aoScale ?? 0.014, 1.6)
    p.w(P, _w.reset(), 0); _w.finish(p.fb)
    const uv = p.uv(P)
    ch.vert(P, n, sh.c, sh.rough, 0, sh.mat, 0, _w, lod ? 0.78 + 0.22 * occ : 0.62 + 0.38 * occ, uv[0], uv[1])
  }
  for (let i = 0; i < s.idx.length; i++) ch.idx.push(base + s.idx[i])
}

export function buildLouieBody(c: BuildCtx) {
  const { ch, sk, q, R, mark, lod } = c
  const JZ = makeJazzRig('sax'), RJ: JazzRigDef = { ...JZ, J: LOUIE_JZ, P: LOUIE_P }
  const Bd = makeJazzBody(RJ), P = LOUIE_P, J = R.J
  // 爵士脑骨号 → 员工骨号（同名）
  const map = JZ.BONES.map((b) => R.B[b.name] ?? R.B.chest)
  const remap = (f: (acc: W4) => void): WFn => (_p, acc) => { const px = { add: (i: number, w: number) => acc.add(map[i], w) } as unknown as W4; f(px) }
  const SUIT = hx('#4d2546'), SUIT_SH = hx('#2e1229'), SEAM = hx('#24101f'), TROU = hx('#2b1a2a'), SHIRT = hx('#efe9dd'), PATCH_A = hx('#b38c3a'), PATCH_B = hx('#3d6446'), PATCH_C = hx('#8f3a28')
  const thread = hx('#e8dab0'), threadDark = hx('#20130f')
  const MAPLE = hx('#e0bf86'), WALNUT = hx('#4a2a18'), BRASS = hx('#c99a40'), FERRULE = hx('#f2eee4'), TIP = hx('#2e6cc0'), RUBBER = hx('#151214')
  // ---------- 袖子（按 Louie 不对称骨架；同爵士脑袖 SDF 写法：袖山 + 上臂锥 + 前臂锥 + 肘横褶 + 加厚袖口 + 袖端空腔）----------
  interface Arm { a: V3; e: V3; w: V3; du: V3; df: V3; Lu: number; Lf: number; end: V3 }
  const mkArm = (a: V3, e: V3, w: V3): Arm => { const du = nrm(sub(e, a)), df = nrm(sub(w, e)); return { a, e, w, du, df, Lu: lenv(sub(e, a)), Lf: lenv(sub(w, e)), end: add(w, scl(df, 0.004)) } }
  const ARM: Record<number, Arm> = { 1: mkArm(J.shoulderL, J.elbowL, J.wristL), [-1]: mkArm(J.shoulderR, J.elbowR, J.wristR) }
  const foreT = (s: number, X: number, Y: number, Z: number) => { const A = ARM[s]; return ((X - A.e[0]) * A.df[0] + (Y - A.e[1]) * A.df[1] + (Z - A.e[2]) * A.df[2]) / A.Lf }
  const upT = (s: number, X: number, Y: number, Z: number) => { const A = ARM[s]; return ((X - A.a[0]) * A.du[0] + (Y - A.a[1]) * A.du[1] + (Z - A.a[2]) * A.du[2]) / A.Lu }
  const sleeveR = (t: number) => P.foreR + 0.012 - 0.006 * clamp(t, 0, 1)
  const CUFF_T0 = 0.8
  const sleeve = (s: number, X: number, Y: number, Z: number) => {
    const A = ARM[s]
    let d = sdRoundCone(X, Y, Z, A.a[0] - s * 0.008, A.a[1] - 0.008, A.a[2], A.e[0], A.e[1], A.e[2], P.armR + 0.014, P.foreR + 0.013)
    d = smin(d, sdEll(X, Y, Z, A.a[0] - s * 0.006, A.a[1] - 0.006, A.a[2], P.armR + 0.009, 0.042, P.armR + 0.013), 0.03)
    d = smin(d, sdRoundCone(X, Y, Z, A.e[0], A.e[1], A.e[2], A.end[0], A.end[1], A.end[2], sleeveR(0), sleeveR(1)), s < 0 ? 0.035 : 0.02)
    const t = foreT(s, X, Y, Z)
    if (t > -0.3 && t < 0.3) d -= (s < 0 ? 0.0034 : 0.0018) * gauss(t, 0.14) * Math.sin(t * 60 + 0.6 * Math.sin(X * 80)) // 肘弯横褶（举臂更深）
    if (t > 0.1 && t < 0.75) d -= 0.0012 * Math.sin(t * 34 + Math.atan2(X - A.e[0], Z - A.e[2]) * 2) * sstep(0.1, 0.25, t) // 前臂扭褶（杆在袖里，布松）
    if (t > CUFF_T0 - 0.06) {
      const p0 = add(A.e, scl(A.df, A.Lf * CUFF_T0))
      const cuff = sdRoundCone(X, Y, Z, p0[0], p0[1], p0[2], A.end[0], A.end[1], A.end[2], sleeveR(CUFF_T0) + 0.0035, sleeveR(1) + 0.0035)
      d = Math.min(d, smax(cuff, (CUFF_T0 + 0.004 - t) * A.Lf, 0.003))
    }
    d = smax(d, (t - 1) * A.Lf - 0.004, 0.004)
    const cr = P.foreR * 0.62 + 0.006
    const cav = sdRoundCone(X, Y, Z, A.end[0] - A.df[0] * 0.06, A.end[1] - A.df[1] * 0.06, A.end[2] - A.df[2] * 0.06, A.end[0] + A.df[0] * 0.03, A.end[1] + A.df[1] * 0.03, A.end[2] + A.df[2] * 0.03, cr, cr + 0.003)
    return smax(d, -cav, 0.004)
  }
  const CAP_T = 0.34, TOP_T = 0.2
  const sleeveCap = (s: number, X: number, Y: number, Z: number) => smax(sleeve(s, X, Y, Z), (upT(s, X, Y, Z) - CAP_T) * ARM[s].Lu, 0.012)
  const sleeveOnly = (s: number): Sdf => (X, Y, Z) => smax(sleeve(s, X, Y, Z), (TOP_T - upT(s, X, Y, Z)) * ARM[s].Lu, 0.006)
  // ---------- 衣身：爵士脑 coatCore（合身收腰 + 下摆）+ 单排扣门襟台阶 + 后中缝 + 燕尾 ----------
  const hemY = Bd.hemY, topY = Bd.topY, V_Y = Bd.V_Y
  const tailTop = hemY + 0.09, tailBot = 0.47
  const tail = (s: number, X: number, Y: number, Z: number) => {
    const t = clamp((tailTop - Y) / (tailTop - tailBot), -0.2, 1.2), cx = s * (0.072 + 0.012 * t), hw = 0.066 - 0.03 * t * t, cz = -(P.hipD + 0.036) - 0.012 * t - 0.01 * t * t
    let d = Math.max(Math.abs(X - cx) - hw, Math.abs(Z - cz) - 0.005)
    d = smax(d, Y - tailTop, 0.01)
    // 燕尾下端：外侧斜切成尖（内侧长）
    d = smax(d, tailBot + 0.06 * clamp((X - cx) * s / 0.066 + 0.5, 0, 1) - Y, 0.006)
    return d - 0.0015 * Math.sin(Y * 90 + X * 30) * sstep(tailTop - 0.05, tailTop - 0.2, Y)
  }
  const coatL: Sdf = (X, Y, Z) => {
    if (Y > topY + 0.04) return Y - topY - 0.04 + 0.04
    const ax = Math.abs(X), sx = X >= 0 ? 1 : -1
    let d = Y < hemY - 0.02 ? 0.05 + (hemY - 0.02 - Y) : Bd.coatCore(X, Y, Z)
    d = smax(d, hemY - Y, 0.004)
    d += 0.0016 * gauss(ax - P.waistW * 0.55, 0.004) * sstep(J.chest[1] + 0.05, Bd.waistY, Y)
    d -= 0.0012 * sstep(Bd.waistY - 0.04, hemY, Y) * Math.sin(Math.atan2(X, Z) * 6 + 0.4)
    { const r = Math.hypot(X - sx * (P.chestW * 0.9), Y - (J.chest[1] + 0.06)), ang = Math.atan2(Y - J.chest[1] - 0.06, (X - sx * P.chestW * 0.9) * sx); d -= 0.0012 * gauss(r - 0.05, 0.035) * sstep(0.0, 0.03, r) * Math.sin(ang * 7 + r * 30) }
    d += 0.00025 * fbm(X * 30, Y * 30, Z * 30, 2)
    if (Z > 0.02) d += 0.002 * sstep(0.002, -0.002, X) * sstep(V_Y + 0.005, V_Y - 0.01, Y) // 单排扣门襟台阶（中线）
    else d += 0.0018 * gauss(X, 0.0024) * sstep(topY, topY - 0.08, Y) * sstep(tailTop - 0.02, tailTop + 0.02, Y)
    const kS = 0.003 + 0.025 * sstep(J.chest[1] - 0.15, J.chest[1] + 0.02, Y)
    for (const s of [1, -1]) if (sx === s || ax < 0.05) d = smin(d, sleeveCap(s, X, Y, Z), kS)
    if (Z < 0 && Y < tailTop + 0.02) d = smin(d, tail(sx, X, Y, Z), 0.012)
    return d
  }
  const COAT_BOX = { min: [-0.5, tailBot - 0.03, -0.3] as [number, number, number], max: [0.5, topY + 0.04, 0.34] as [number, number, number] }
  // 衣身权重（同爵士脑 coatWeights 思路，袖帽按 Louie 的袖算）+ 燕尾骨
  const coatW: WFn = (p, acc) => {
    const [X, Y, Z] = p, s = X >= 0 ? 1 : -1, S = s > 0 ? 'L' : 'R', A = ARM[s]
    if (Z < 0 && Y < hemY + 0.04 && tail(s, X, Y, Z) < 0.012) { const k = sstep(hemY + 0.04, hemY - 0.08, Y); acc.add(sk.idx('tail' + S), k); acc.add(sk.idx('hips'), 1 - k); return }
    const dArm = sleeveCap(s, X, Y, Z), dTor = Bd.coatCore(X, Y, Z), along = dot(sub(p, A.a), A.du)
    const bw = 0.006 + 0.024 * sstep(J.chest[1] - 0.15, J.chest[1] + 0.02, Y)
    const armK = clamp(sstep(-bw * 0.6, bw, dTor - dArm) * sstep(-0.07, 0.02, along), 0, 1)
    const clavK = gauss(lenv(sub(p, A.a)), 0.07) * (1 - armK) * 0.8 + armK * gauss(along, 0.055) * 0.4
    acc.add(sk.idx('clav' + S), clavK); acc.add(sk.idx('upperArm' + S), armK * (1 - clavK * 0.5))
    const tk = (1 - armK) * (1 - clavK), hk = tk * sstep(J.hips[1] - 0.06, hemY + 0.01, Y) * 0.8 * sstep(0.02, 0.07, Math.abs(X))
    acc.add(sk.idx('hem' + S), hk)
    const nk = (tk - hk) * sstep(topY - 0.05, topY + 0.01, Y) * 0.4
    acc.add(sk.idx('neck'), nk)
    remap((a) => Bd.trunkW(X, Y, a, tk - hk - nk))(p, acc, 0)
  }
  const sleeveW = (s: number): WFn => { const S = s > 0 ? 'L' : 'R', f = sk.auto(['clav' + S, 'upperArm' + S, 'foreArm' + S], 0.03); return (p, acc, u) => { const t = foreT(s, p[0], p[1], p[2]); if (t > 0.92) { acc.add(sk.idx('foreArm' + S), 1 - sstep(0.92, 1.0, t)); acc.add(sk.idx('hand' + S), sstep(0.92, 1.0, t)) } else f(p, acc, u) } }
  // ---------- 着色 ----------
  const cyl = (p: V3, cx = 0, cz = 0): [number, number] => [Math.atan2(p[0] - cx, p[2] - cz) * 0.1768, p[1]]
  const inRect = (x: number, y: number, x0: number, x1: number, y0: number, y1: number) => x > x0 && x < x1 && y > y0 && y < y1
  const BACK_PATCH = { x0: 0.035, x1: 0.13, y0: 0.9, y1: 1.02 }
  const POCKET = { x0: 0.058, x1: 0.13, y0: 1.255, y1: 1.335 }
  const coatShade = (p: V3) => {
    const [X, Y, Z] = p, ax = Math.abs(X)
    let col = mixc(SUIT, SUIT_SH, 0.18 * fbm(X * 9, Y * 9, Z * 9, 2)), mat: number = SM.cloth
    // V 口：白衬衫（正面中线一道门襟）
    if (Z > 0.02 && Y > V_Y - 0.012 && ax < Bd.vHalf(Y) + 0.01) return { c: mixc(SHIRT, hx('#cfc6b6'), 0.6 * gauss(X, 0.004) + 0.2 * fbm(X * 30, Y * 30, 1, 2)), mat: SM.cloth, rough: 0.8 }
    const seamK = (k: number) => { col = mixc(col, SEAM, clamp(k, 0, 1)) }
    seamK(0.5 * gauss(ax - (P.waistW + 0.01), 0.0035) * sstep(0.0, -0.02, Z) * sstep(J.chest[1] + 0.02, J.chest[1] - 0.05, Y))
    seamK(0.35 * gauss(ax - P.waistW * 0.55, 0.003) * sstep(J.chest[1] + 0.06, Bd.waistY, Y))
    if (Z > 0.02) seamK(0.7 * gauss(X - 0.001, 0.0016) * sstep(V_Y + 0.005, V_Y - 0.01, Y))
    if (Z > 0.02 && inRect(X, Y, POCKET.x0, POCKET.x1, POCKET.y0, POCKET.y1)) col = mixc(col, SUIT_SH, 0.25)
    if (Z < 0 && inRect(X, Y, BACK_PATCH.x0, BACK_PATCH.x1, BACK_PATCH.y0, BACK_PATCH.y1)) { col = mixc(PATCH_B, hx('#26402c'), 0.3 * fbm(X * 40, Y * 40, 3, 2)); mat = SM.patch }
    return { c: col, mat, rough: 0.9 }
  }
  const ARM_PATCH = { t0: 0.18, t1: 0.5, a0: 0.35, a1: 1.75 }
  const armAng = (s: number, p: V3) => { const A = ARM[s], side = nrm(cross(A.df, [0, 0, 1])), fw = cross(side, A.df), d = sub(p, A.e); return Math.atan2(dot(d, side) * s, dot(d, fw)) }
  const sleeveShade = (s: number) => (p: V3) => {
    const t = foreT(s, p[0], p[1], p[2]), A = ARM[s]
    if (t > 0.95) { const ax = add(A.e, scl(A.df, t * A.Lf)); if (lenv(sub(p, ax)) < P.foreR * 0.62 + 0.012) return { c: dim(SUIT_SH, 0.35), mat: SM.cloth, rough: 0.95 } }
    let col = mixc(SUIT, SUIT_SH, 0.18 * fbm(p[0] * 9, p[1] * 9, p[2] * 9, 2)), mat: number = SM.cloth
    if (t > CUFF_T0 - 0.02 && t < 1.02) col = dim(col, 0.9)
    if (s > 0) { const a = armAng(s, p); if (t > ARM_PATCH.t0 && t < ARM_PATCH.t1 && a > ARM_PATCH.a0 && a < ARM_PATCH.a1) { col = mixc(PATCH_A, hx('#7a5a22'), 0.35 * fbm(p[0] * 50, p[1] * 50, p[2] * 50, 2)); mat = SM.patch } }
    return { c: col, mat, rough: 0.9 }
  }
  const KNEE = J.kneeR
  const pantsL: Sdf = (X, Y, Z) => { let d = Bd.pantsSdf(X, Y, Z); if (X < -0.02 && Y < KNEE[1] + 0.02) d = smax(d, KNEE[1] - 0.045 - Y, 0.006); return d }
  const pantsShade = (p: V3) => {
    let col = mixc(TROU, hx('#1a0f19'), 0.2 * fbm(p[0] * 14, p[1] * 14, p[2] * 14, 2)), mat: number = SM.cloth
    if (p[1] < 0.1) col = dim(col, 0.4)
    const L = Bd.LEG[1]
    if (p[0] > 0 && p[2] > L.knee[2] && Math.abs(p[1] - L.knee[1]) < 0.06 && Math.abs(p[0] - L.knee[0]) < 0.06) { col = mixc(PATCH_C, hx('#5a2014'), 0.3 * fbm(p[0] * 50, p[1] * 50, 2, 2)); mat = SM.patch }
    return { c: col, mat, rough: 0.88 }
  }
  const shoeShade = (p: V3) => ({ c: mixc(hx('#1c1416'), hx('#3a2a26'), 0.15 * fbm(p[0] * 60, p[1] * 60, p[2] * 60, 2)), mat: SM.leather, rough: 0.35 })
  // ---------- 提取（三角形预算与爵士脑 / 行李员同量级）----------
  mark('coat', () => bake(c, { name: 'coat', sdf: coatL, box: COAT_BOX, h: [0.0075, 0.014, 0.024], target: [8200, 2700, 820], shade: coatShade, w: coatW, fb: sk.idx('chest'), aoScale: 0.02, ao: (x, y, z) => Math.min(coatL(x, y, z), pantsL(x, y, z)), uv: (p) => cyl(p) }))
  mark('sleeves', () => {
    for (const s of [1, -1]) {
      const A = ARM[s], so = sleeveOnly(s), p0 = add(A.a, scl(A.du, A.Lu * (TOP_T - 0.05))), r = P.armR + 0.06
      const pts = [p0, A.e, A.end], mn = [0, 1, 2].map((k) => Math.min(...pts.map((q2) => q2[k])) - r) as [number, number, number], mx = [0, 1, 2].map((k) => Math.max(...pts.map((q2) => q2[k])) + r) as [number, number, number]
      bake(c, { name: 'sleeve', sdf: so, box: { min: mn, max: mx }, h: [0.0052, 0.0095, 0.016], target: [2700, 900, 280], shade: sleeveShade(s), w: sleeveW(s), fb: sk.idx('upperArm' + (s > 0 ? 'L' : 'R')), aoScale: 0.012, ao: coatL, uv: (p) => { const ax = foreT(s, p[0], p[1], p[2]) > 0 ? add(A.e, scl(A.df, clamp(foreT(s, p[0], p[1], p[2]), 0, 1) * A.Lf)) : A.e; return cyl(p, ax[0], ax[2]) } })
    }
  })
  mark('pants', () => bake(c, { name: 'pants', sdf: pantsL, box: Bd.PANTS_BOX, h: [0.0075, 0.014, 0.024], target: [4200, 1400, 420], keep: (_x, y) => y < hemY + 0.05, within: (_x, y) => y < hemY + 0.08, shade: pantsShade, w: (p, acc) => { const px = { add: (i: number, w: number) => acc.add(map[i], w) } as unknown as W4; Bd.legWeights(p[0], p[1], p[2], px) }, fb: sk.idx('hips'), aoScale: 0.02, ao: (x, y, z) => Math.min(pantsL(x, y, z), coatL(x, y, z)), uv: (p) => cyl(p, p[0] > 0 ? Bd.LEG[1].knee[0] : Bd.LEG[-1].knee[0], 0) }))
  mark('shoe', () => { const sh = Bd.shoeSdf(1); bake(c, { name: 'shoe', sdf: sh, box: Bd.shoeBox(1), h: [0.004, 0.008, 0.013], target: [1100, 370, 120], shade: shoeShade, w: (p, acc) => { const px = { add: (i: number, w: number) => acc.add(map[i], w) } as unknown as W4; Bd.shoeWeights(1, p[0], p[1], p[2], px) }, fb: sk.idx('footL'), aoScale: 0.01, ao: (x, y, z) => (y > 0.08 ? pantsL(x, y, z) : 0.05), uv: (p) => [p[0] * 3, p[2] * 3] }) })
  // ---------- 饰件：衬衫立领 + 大领结、三粒黑扣、胸袋缝线、补丁缝线 / 毛边、袖口铜箍 + 台球杆、右腿假肢 ----------
  const wChest = sk.auto(['chest', 'neck', 'spine'], 0.05)
  mark('trims', () => {
    const NK = Bd.NECK
    surf(ch, (u, v) => { const a = u * Math.PI * 2; return [Math.sin(a) * (NK.rx - 0.004), topY - 0.012 + v * 0.064 - 0.02 * Math.max(0, Math.cos(a)) ** 2, NK.c[2] + Math.cos(a) * (NK.rz - 0.004)] }, N(40, q), N(4, q, 1), O(SHIRT, SM.cloth, sk.auto(['neck', 'chest'], 0.04), sk.idx('neck'), { su: 0.4, sv: 0.05 }))
    bowTieL(c, [0, topY + 0.0, NK.c[2] + NK.rz + 0.012], 0.62, hx('#5e1238'), wChest, sk.idx('chest'), hx('#3a0a22'))
    const sf = coatL, dk = vo(O(hx('#141012'), SM.dark, wChest, sk.idx('chest'), { rough: 0.35 }))
    for (let i = 0; i < 3; i++) {
      const y = V_Y - 0.03 - i * 0.105, p = onSurface(sf, [0.0, y, 0.2], 0.0), n = sdfNormal(sf, p)
      lathe(ch, add(p, scl(n, -0.001)), n, [[0.0118, 0], [0.0125, 0.0015], [0.012, 0.0036], [0.009, 0.0048], [0.0, 0.0054]], N(14, q), dk)
      for (let k = 0; k < 2; k++) { const o2 = (k - 0.5) * 0.007; tube(ch, [add(add(p, [o2, 0.003, 0]), scl(n, 0.0056)), add(add(p, [o2, -0.003, 0]), scl(n, 0.0056))], 0.0008, 3, vo(O(hx('#2a1820'), SM.cloth, wChest, sk.idx('chest'))), false) }
    }
    const nAt = (f: Sdf) => (p: V3) => sdfNormal(f, p)
    const proj = (f: Sdf, pts: V3[], off = 0.0015) => pts.map((p) => onSurface(f, p, off))
    // 胸袋：圆角袋口 + 袋布轮廓缝线
    const pk = POCKET, pkPts: V3[] = []
    for (let i = 0; i <= 12; i++) { const t = i / 12; pkPts.push([pk.x0 + (pk.x1 - pk.x0) * t, pk.y1, 0.2]) }
    tube(ch, proj(sf, pkPts, 0.0022), 0.0026, N(6, q), vo(O(dim(SUIT, 0.8), SM.cloth, wChest, sk.idx('chest'))), false)
    if (lod < 2) stitches(ch, proj(sf, [[pk.x0 + 0.004, pk.y1 - 0.006, 0.2], [pk.x0 + 0.004, pk.y0 + 0.012, 0.2], [pk.x0 + 0.016, pk.y0 + 0.002, 0.2], [pk.x1 - 0.016, pk.y0 + 0.002, 0.2], [pk.x1 - 0.004, pk.y0 + 0.012, 0.2], [pk.x1 - 0.004, pk.y1 - 0.006, 0.2]]), nAt(sf), 0.006, 0.0025, 0.0007, vo(O(mixc(SUIT, [1, 1, 1], 0.18), SM.cloth, wChest, sk.idx('chest'))), false)
    // 背后下摆补丁：粗白线十字针脚 + 毛边线头
    const bp = BACK_PATCH, bpPts: V3[] = [[bp.x0, bp.y0, -0.2], [bp.x1, bp.y0, -0.2], [bp.x1, bp.y1, -0.2], [bp.x0, bp.y1, -0.2], [bp.x0, bp.y0, -0.2]]
    const fb2 = sk.idx('spine'), wBack = sk.auto(['hips', 'spine'], 0.05)
    if (lod < 2) stitches(ch, proj(sf, bpPts, 0.0015).map((p) => p), nAt(sf), 0.012, 0.012, 0.0016, vo(O(thread, SM.cloth, wBack, fb2)))
    // 左前臂补丁缝线 + 右前臂肘下一圈缝（ref2）
    for (const s of [1, -1]) {
      const A = ARM[s], so = sleeveOnly(s), side = nrm(cross(A.df, [0, 0, 1])), fw = cross(side, A.df), S = s > 0 ? 'L' : 'R'
      const ringAt = (t: number, a0: number, a1: number, n: number) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * (i / n), c0 = add(A.e, scl(A.df, t * A.Lf)); return onSurface(so, add(c0, add(scl(side, Math.sin(a) * 0.08 * s), scl(fw, Math.cos(a) * 0.08))), 0.0015) })
      const wF = sk.rigid('foreArm' + S), fbF = sk.idx('foreArm' + S)
      if (s > 0 && lod < 2) {
        const pp = ARM_PATCH, line = (t0: number, t1: number, a0: number, a1: number) => { const pts: V3[] = []; for (let i = 0; i <= 8; i++) { const k = i / 8, t = t0 + (t1 - t0) * k, a = a0 + (a1 - a0) * k; const c0 = add(A.e, scl(A.df, t * A.Lf)); pts.push(onSurface(so, add(c0, add(scl(side, Math.sin(a) * 0.08 * s), scl(fw, Math.cos(a) * 0.08))), 0.0015)) } return pts }
        const border = [...line(pp.t0, pp.t1, pp.a0, pp.a0), ...line(pp.t1, pp.t1, pp.a0, pp.a1).slice(1), ...line(pp.t1, pp.t0, pp.a1, pp.a1).slice(1), ...line(pp.t0, pp.t0, pp.a1, pp.a0).slice(1)]
        stitches(ch, border, nAt(so), 0.011, 0.011, 0.0015, vo(O(threadDark, SM.cloth, wF, fbF)))
      }
      if (s < 0 && lod < 2) stitches(ch, ringAt(0.2, -Math.PI, Math.PI, 28), nAt(so), 0.013, 0.014, 0.0017, vo(O(thread, SM.cloth, wF, fbF)), true)
      // 袖口铜箍 + 铆钉（ref2 袖端一圈带点的环）
      const wh = sk.rigid('hand' + S), fbH = sk.idx('hand' + S), cR = sleeveR(1) + 0.006, cP = add(A.e, scl(A.df, A.Lf * 0.93))
      lathe(ch, cP, A.df, [[cR - 0.004, -0.002], [cR, 0.0], [cR + 0.0015, 0.004], [cR + 0.0015, 0.018], [cR, 0.022], [cR - 0.004, 0.024]], N(28, q), vo(O(BRASS, SM.metal, wh, fbH, { metal: 1, rough: 0.32 })))
      { const rp = add(add(cP, scl(A.df, 0.011)), scl(fw, cR + 0.0015)); blob(ch, rp, [0.0045, 0.0045, 0.0035], N(8, q), N(6, q), O(hx('#5a4630'), SM.metal, wh, fbH, { metal: 1 }), undefined, basisFromZ(fw)) }
      // 台球杆（从袖口空腔里伸出，代替前臂 / 手）
      if (s > 0) {
        const tip = J.handTipL, ax = nrm(sub(tip, A.w)), L = lenv(sub(tip, A.w)) + 0.08, b0 = add(A.w, scl(ax, -0.08))
        lathe(ch, b0, ax, [[0, 0], [0.0175, 0.0], [0.0185, L * 0.4], [0.0195, L * 0.86], [0.02, L * 0.92], [0.0195, L * 0.97], [0.012, L], [0, L]], N(24, q), vo(O((p) => { const h = dot(sub(p, b0), ax) / L; const pts = Math.abs(((Math.atan2(p[0] - b0[0], p[2] - b0[2]) / Math.PI + 1) * 2) % 1 - 0.5); return h < 0.6 && h > 0.25 && pts < (0.6 - h) * 1.2 ? MAPLE : WALNUT }, SM.wood, wh, fbH)))
        lathe(ch, add(b0, scl(ax, L * 0.8)), ax, [[0.0196, 0], [0.0215, 0.003], [0.0215, 0.022], [0.0196, 0.025]], N(24, q), vo(O(BRASS, SM.metal, wh, fbH, { metal: 1, rough: 0.25 })))
        lathe(ch, add(b0, scl(ax, L * 0.97)), ax, [[0.0195, 0], [0.02, 0.012], [0.014, 0.024], [0, 0.026]], N(20, q), vo(O(RUBBER, SM.dark, wh, fbH, { rough: 0.7 })))
      } else {
        const tip = J.handTipR, ax = nrm(sub(tip, A.w)), L = lenv(sub(tip, A.w)) + 0.08, b0 = add(A.w, scl(ax, -0.08))
        lathe(ch, b0, ax, [[0, 0], [0.0155, 0], [0.0135, L * 0.5], [0.0098, L - 0.035], [0.0098, L - 0.035], [0, L - 0.035]], N(22, q), vo(O(MAPLE, SM.wood, wh, fbH)))
        lathe(ch, add(b0, scl(ax, L - 0.035)), ax, [[0, 0], [0.0099, 0], [0.0097, 0.024], [0, 0.024]], N(16, q), vo(O(FERRULE, SM.dark, wh, fbH, { rough: 0.4 })))
        lathe(ch, add(b0, scl(ax, L - 0.011)), ax, [[0, 0], [0.0095, 0], [0.009, 0.008], [0.006, 0.012], [0, 0.013]], N(16, q), vo(O(TIP, SM.dark, wh, fbH, { rough: 0.85 })))
        const tiles = [TILES.ball14, TILES.ball3, TILES.ball9]
        for (let i = 0; i < 3; i++) { const bn = 'cueBall' + (i + 1), cc = add(tip, [0.004 * i, 0.04 + 0.098 * i, 0]); ballSphere(ch, cc, 0.048, N(36, q), N(24, q), O([1, 1, 1], SM.ball, sk.rigid(bn), sk.idx(bn)), tiles[i], basisFromZ(nrm([[0.25, -0.2, 0.1][i], [0.1, 0.05, 0.2][i], 1]))) }
      }
    }
    // 右腿：裤管卷边 + 台球杆假肢（皮套 + 铜铆钉 → 胡桃木杆 + 枫木尖角 → 铜环 → 橡胶脚）
    {
      const ws = sk.rigid('shinR'), fb3 = sk.idx('shinR'), kneeLow: V3 = [KNEE[0], KNEE[1] - 0.045, KNEE[2] + 0.004]
      lathe(ch, add(kneeLow, [0, -0.012, 0]), [0, 1, 0], [[0.05, -0.008], [P.shinR + 0.026, -0.006], [P.shinR + 0.028, 0.012], [P.shinR + 0.018, 0.022]], N(28, q), vo(O(dim(TROU, 1.15), SM.cloth, ws, fb3)))
      const top = add(kneeLow, [0, -0.015, 0]), bot = J.toeR, ax = nrm(sub(bot, top)), L = lenv(sub(bot, top))
      lathe(ch, top, ax, [[0.0, 0.0], [0.05, 0.0], [0.053, 0.02], [0.048, 0.075], [0.03, 0.095]], N(26, q), vo(O(hx('#5a3420'), SM.leather, ws, fb3, { rough: 0.55 })))
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; blob(ch, add(top, [Math.sin(a) * 0.052, -0.04, Math.cos(a) * 0.052]), [0.005, 0.005, 0.005], N(6, q), N(4, q), O(BRASS, SM.metal, ws, fb3, { metal: 1 })) }
      lathe(ch, add(top, scl(ax, 0.09)), ax, [[0, 0], [0.026, 0], [0.024, (L - 0.09) * 0.5], [0.021, L - 0.115], [0, L - 0.115]], N(24, q), vo(O((p) => { const h = (p[1] - bot[1]) / L; const pa = Math.abs(((Math.atan2(p[0] - top[0], p[2] - top[2]) / Math.PI + 1) * 2) % 1 - 0.5); return h > 0.45 && pa < (h - 0.45) * 1.1 ? MAPLE : WALNUT }, SM.wood, ws, fb3)))
      lathe(ch, add(top, scl(ax, L * 0.5)), ax, [[0.0238, 0], [0.026, 0.003], [0.026, 0.02], [0.0236, 0.023]], N(24, q), vo(O(BRASS, SM.metal, ws, fb3, { metal: 1, rough: 0.25 })))
      lathe(ch, add(top, scl(ax, L - 0.028)), ax, [[0.021, 0], [0.025, 0.008], [0.026, 0.02], [0.02, 0.026], [0, 0.028]], N(20, q), vo(O(RUBBER, SM.dark, sk.rigid('footR'), sk.idx('footR'), { rough: 0.8 })))
    }
  })
}

/** 蝴蝶领结（ref2 宽大松软的领结：两翼三道折褶、中结收紧） */
function bowTieL(c: BuildCtx, ctr: V3, s: number, col: number[], w: WFn, fb: number, dark: number[]) {
  const { ch, q } = c
  for (const sd of [1, -1]) {
    const cc = add(ctr, [sd * 0.062 * s, 0, -0.006 * s])
    blob(ch, cc, [0.068 * s, 0.05 * s, 0.024 * s], N(36, q), N(22, q), O((p: V3) => mixc(col, dark, 0.25 * Math.max(0, Math.sin((p[1] - ctr[1]) / s * 90)) ** 4), SM.cloth, w, fb, { su: 0.3 * s, sv: 0.15 * s }),
      (d) => { const toKnot = sstep(0.1, 1, -d[0] * sd); return (1 + 0.12 * Math.cos(d[1] * 3.2) * sstep(0.2, 0.9, Math.abs(d[0])) - 0.42 * toKnot ** 1.4 + 0.12 * sstep(0.5, 1, Math.abs(d[1])) * sstep(0, 0.6, d[0] * sd)) * (1 + 0.07 * Math.sin(d[1] * 9.5) * toKnot * Math.max(0, d[2])) })
  }
  blob(ch, add(ctr, [0, 0, 0.01 * s]), [0.024 * s, 0.032 * s, 0.02 * s], N(20, q), N(12, q), O(mixc(col, [0, 0, 0], 0.18), SM.cloth, w, fb, { su: 0.15, sv: 0.1 }), (d) => 1 + 0.05 * Math.sin(d[1] * 14))
}

// ======================================================================
// 头（retroNpc 正常人头比例表 → 加密参数曲面）
// ======================================================================
const hW = LOUIE_HW, hD = LOUIE_HD
export function buildLouieHead(c: BuildCtx) {
  const { ch, sk, q, mark, lod } = c
  const { chinY, HH, z0 } = LOUIE_HEAD
  const SKIN = hx('#e3b99c'), head = sk.idx('head'), wHead = sk.rigid('head')
  const BALL_R = 0.023
  /** 正面起伏（s = 归一化横向 −1..1，t = 高度比例） */
  const feat = (s: number, t: number) => {
    const as = Math.abs(s)
    let z = 0
    z += 0.016 * Math.exp(-((s / 0.13) ** 2)) * sstep(0.62, 0.5, t) * sstep(0.335, 0.37, t) * (0.45 + 0.55 * sstep(0.56, 0.4, t)) // 鼻梁
    z += 0.011 * G2(s, 0.15, t - 0.372, 0.034) + 0.0075 * G2(as - 0.21, 0.08, t - 0.36, 0.03) - 0.004 * G2(s, 0.3, t - 0.33, 0.016) // 鼻头 / 鼻翼 / 鼻底
    z -= 0.0085 * G2(as - 0.43, 0.17, t - 0.552, 0.05) // 眼窝
    z += 0.0065 * G2(as - 0.4, 0.26, t - 0.645, 0.032) // 眉弓
    z += 0.0065 * G2(as - 0.66, 0.16, t - 0.43, 0.07) // 颧骨
    z -= 0.0045 * G2(as - 0.88, 0.12, t - 0.63, 0.1) // 太阳穴
    const smile = 0.035 * s * s
    z += 0.0058 * G2(s, 0.3, t - 0.232 - smile, 0.02) + 0.0062 * G2(s, 0.26, t - 0.185 - smile * 0.6, 0.022) - 0.0045 * G2(s, 0.34, t - 0.208 - smile, 0.0055) // 上 / 下唇、唇缝（嘴角上扬）
    z -= 0.0016 * G2(as - 0.055, 0.03, t - 0.28, 0.03) // 人中
    z -= 0.003 * G2(s, 0.3, t - 0.138, 0.02) + 0.0055 * -G2(s, 0.32, t - 0.075, 0.05) // 颏唇沟 / 下巴
    z += 0.0035 * G2(as - 0.5, 0.2, t - 0.27, 0.05) // 鼻唇沟外的颊肉（笑）
    if (s < 0) z += 0.0042 * G2(s + 0.44, 0.13 * LOUIE_LID_K, t - 0.556, 0.024 * LOUIE_LID_K) + 0.0018 * G2(s + 0.44, 0.12 * LOUIE_LID_K, t - 0.522, 0.012 * LOUIE_LID_K) // 右眼闭：上睑鼓起（眼球轮廓）+ 下睑隆起，按 3 cm 眼裂放大
    else z -= 0.012 * G2(Math.hypot(s - 0.44, (t - 0.552) * 2.1), 0.17, 0, 1) // 左眼：球眼眼窝更深
    return z
  }
  const headS: PS = (u, v) => {
    const th = u * Math.PI * 2, t = -0.06 + 1.06 * v
    const w = rowAt(t, 1) * hW, zf = rowAt(t, 2) * hD, zb = rowAt(t, 3) * hD, bw = rowAt(t, 4)
    const sn = Math.sin(th), cs = Math.cos(th)
    let x: number, z: number
    if (cs >= 0) { const s = sn, zz = zf * (1 - 0.5 * s * s - 0.27 * s ** 4); x = w * s; z = zz + feat(s, t) * cs ** 0.5 * sstep(-0.02, 0.06, t) }
    else { const zs = zf * 0.23, bwf = 1 + (bw - 1) * sstep(0, 0.6, -cs); x = w * bwf * sn; z = zs + (zb - 0.012 + zs) * cs }
    return [x, chinY + (t - 0.04) * HH, z + z0]
  }
  const front = (s: number, t: number): V3 => { const u = Math.asin(clamp(s, -1, 1)) / (Math.PI * 2), v = (t + 0.06) / 1.06; return headS((u + 1) % 1, v) }
  const frontN = (s: number, t: number): V3 => { const u = Math.asin(clamp(s, -1, 1)) / (Math.PI * 2), v = (t + 0.06) / 1.06; return snrm(headS, (u + 1) % 1, v) }
  mark('head', () => {
    const wJ = sk.auto(['head', 'jaw'], 0.014)
    surf(ch, headS, N(112, q), N(84, q), O([1, 1, 1], SM.face, wJ, head, { uv: (u, v) => [u + 0.5, v], rough: 0.6, ao: (p) => { const t = (p[1] - chinY) / HH; return 1 - 0.25 * G2(Math.abs(p[0]) - 0.034, 0.02, t - 0.55, 0.05) * (p[2] > 0.05 ? 1 : 0) } }))
    // 颈
    limb(ch, [[0, LOUIE_JZ.neck[1] - 0.06, -0.025], [0, LOUIE_JZ.neck[1] + 0.02, -0.02], [0, chinY + 0.01, -0.025]], (u, v) => 0.057 * (1 + 0.06 * Math.exp(-(((u - 0.5) / 0.06) ** 2)) * Math.exp(-(((v - 0.55) / 0.12) ** 2))), N(28, q), N(10, q), O(SKIN, SM.skin, sk.auto(['neck', 'head', 'chest'], 0.03), sk.idx('neck'), { rough: 0.62, su: 1.2, sv: 0.4 }))
    // 闭着的右眼（x<0）：睑缘线 + 两排上睫毛（外眼角渐长、向下外弯、尖端微翘）+ 下睫毛短排 + 上睑褶
    const eo = vo(O(hx('#24140c'), SM.dark, wHead, head, { rough: 0.55 }))
    const LK = LOUIE_LID_K, LW = LOUIE_LID_HW * 2
    const lidAt = (k: number, dt = 0): V3 => { const s = -LOUIE_EYE.s + (k - 0.5) * LW, t = LOUIE_EYE.t - 0.004 * LK - 0.012 * LK * Math.sin(k * Math.PI) + dt * LK; return add(front(s, t), scl(frontN(s, t), 0.001)) }
    const lash: V3[] = []
    for (let i = 0; i <= 20; i++) lash.push(lidAt(i / 20))
    tube(ch, lash, 0.0008, 4, eo, false)
    tube(ch, Array.from({ length: 13 }, (_, i) => lidAt(0.04 + (i / 12) * 0.92, -0.0025)), 0.00045, 3, vo(O(hx('#a86a5e'), SM.skin, wHead, head, { rough: 0.3 })), false)
    const nL = N(42, q, 12)
    for (let i = 0; i < nL; i++) {
      const k = 0.05 + 0.9 * ((i + 0.5 * noise3(i, 3, 1)) / nL), row = i % 2, s = -LOUIE_EYE.s + (k - 0.5) * LW, n = frontN(s, LOUIE_EYE.t), b0 = add(lidAt(k), scl(n, row * 0.0004))
      const out = -(k - 0.5) * 2, L = (0.0055 + 0.004 * sstep(0.2, 1, -out) + 0.0012 * noise3(i, 7, 2)) * (0.5 + 0.5 * LK)
      const d1 = nrm(add(add(scl(n, 0.55), [0, -0.75, 0]), [out * 0.35, 0, 0])), p1 = add(b0, scl(d1, L * 0.6)), p2 = add(add(p1, scl(d1, L * 0.35)), add(scl(n, L * 0.25), [0, L * 0.12, 0]))
      tube(ch, [b0, p1, p2], [0.00032, 0.00022, 0.00006], 3, eo, false)
    }
    for (let i = 0; i < N(12, q, 4); i++) { const k = 0.15 + 0.7 * (i / N(12, q, 4)), b0 = lidAt(k, -0.0022), n = frontN(-LOUIE_EYE.s + (k - 0.5) * LW, LOUIE_EYE.t); tube(ch, [b0, add(b0, add(scl(n, 0.0022), [0, -0.003, 0]))], [0.0002, 0.00005], 3, eo, false) }
    { const crease: V3[] = []; for (let i = 0; i <= 12; i++) { const k = i / 12, s = -LOUIE_EYE.s + (k - 0.5) * LW * 0.94, t = LOUIE_EYE.t + 0.018 * LK + 0.006 * LK * Math.sin(k * Math.PI); crease.push(add(front(s, t), scl(frontN(s, t), -0.0002))) } tube(ch, crease, 0.00055, 3, vo(O(hx('#6e4636'), SM.skin, wHead, head, { rough: 0.95 })), false) }
    // 眉毛：细毛发片（每侧约 110 根细毛，按眉头竖 → 眉尾斜下的毛流分布在眉宽内，贴皮肤）
    const bo = vo(O(hx('#3a2214'), SM.fur, wHead, head)), bo2 = vo(O(hx('#5a3a24'), SM.fur, wHead, head))
    const nB = N(120, q, 26)
    for (const sd of [1, -1]) for (let i = 0; i < nB; i++) {
      const r1 = noise3(i * 1.37, sd, 1), r2 = noise3(i * 2.11, sd, 2), r3 = noise3(i * 0.71, sd, 3)
      const k = Math.pow((i + r1) / nB, 0.95), s = sd * (0.17 + k * 0.52), tc = 0.64 + 0.022 * Math.sin(k * Math.PI * 0.9) - 0.01 * k, thk = 0.014 + 0.01 * (1 - k)
      const t = tc + (r2 - 0.5) * 2 * thk * (1 - 0.4 * k), p = front(s, t), n = frontN(s, t)
      const up = (1 - k) * 0.9 + 0.1, dir = add(scl(n, 0.12), [sd * (0.35 + 0.8 * k), up * (0.9 - 0.9 * k) - 0.15 * k + (t - tc) * -8, 0])
      const L = 0.0045 + 0.0035 * r3 + 0.002 * (1 - Math.abs(k - 0.4))
      bristle2(ch, add(p, scl(n, 0.0004)), dir, L, 0.00028, r3 > 0.75 ? bo2 : bo)
    }
    // 嘴角向上的粗黑缝线（十字针脚，ref2 嘴角两道）+ 球眼下一道竖缝
    const thr = vo(O(hx('#1a100c'), SM.dark, wHead, head, { rough: 0.7 }))
    const nF = (p: V3) => { const t = (p[1] - chinY) / HH + 0.04, w = rowAt(t, 1) * hW; return frontN(clamp(p[0] / w, -1, 1), t) }
    for (const sd of [1, -1]) {
      const pts: V3[] = LOUIE_STITCH.map(([s, t]) => add(front(sd * s, t + 0.035 * s * s), scl(frontN(sd * s, t), 0.0008)))
      stitches(ch, pts, nF, LOUIE_STITCH_STEP, LOUIE_STITCH_LEN, 0.0012, thr)
    }
    stitches(ch, LOUIE_STITCH_EYE.map(([s, t]) => add(front(s, t), scl(frontN(s, t), 0.0008))), nF, LOUIE_STITCH_STEP, LOUIE_STITCH_LEN, 0.001, thr)
    // 耳朵（藏在头发里，侧面露耳垂）
    for (const sd of [1, -1]) {
      const t = 0.45, w = rowAt(t, 1) * hW * 1.03, ec: V3 = [sd * (w + 0.004), chinY + (t - 0.04) * HH, z0 - 0.012], EB = basisFromZ([sd, 0, -0.3])
      blob(ch, ec, [0.02, 0.03, 0.007], N(18, q), N(12, q), O((p) => { const l = sub(p, ec), dz = dot(l, EB.z), r = Math.hypot(dot(l, EB.x) / 0.02, dot(l, EB.y) / 0.03); return dz > 0 ? mixc(mixc(SKIN, hx('#c47a6c'), 0.45), hx('#8a4a44'), 0.5 * sstep(0.75, 0.2, r)) : mixc(SKIN, hx('#ecc4a8'), 0.3) }, SM.skin, wHead, head, { rough: 0.6 }), (d) => 1 - 0.35 * sstep(0.2, 0.9, d[2]) * (1 - Math.abs(d[1])), EB)
      const rim: V3[] = []; for (let i = 0; i <= 14; i++) { const a = -0.6 + (i / 14) * 3.6; rim.push(add(ec, toB(EB, [Math.cos(a) * 0.018, Math.sin(a) * 0.028, 0.005]))) }
      tube(ch, rim, 0.003, N(6, q), vo(O(mixc(SKIN, hx('#e09a88'), 0.45), SM.skin, wHead, head, { rough: 0.5 })), false)
    }
  })
  // 5 号台球眼（左眼 x>0）：嵌进加深的眼窝，上下肿胀湿润的皮肤包边压住球缘
  mark('ballEye', () => {
    const { s, t } = LOUIE_EYE, sp = front(s, t), n = frontN(s, t), bc = add(sp, scl(n, -0.006))
    ballSphere(ch, bc, BALL_R, N(44, q), N(28, q), O([1, 1, 1], SM.ball, sk.rigid('ballEye'), sk.idx('ballEye')), TILES.louieEye, basisFromZ(nrm(add(n, [0.0, 0.03, 0.12]))))
    const B = basisFromZ(n)
    for (const [k, r, col, rg, dz] of [[1.02, 0.0042, mixc(SKIN, hx('#7a3a3a'), 0.6), 0.25, 0.012], [1.28, 0.0045, mixc(SKIN, hx('#b8806a'), 0.35), 0.55, 0.008]] as [number, number, number[], number, number][]) {
      const pts: V3[] = []; for (let i = 0; i <= 36; i++) { const a = (i / 36) * Math.PI * 2; pts.push(add(bc, toB(B, [Math.cos(a) * BALL_R * k, Math.sin(a) * BALL_R * k * (Math.sin(a) > 0 ? 1.06 : 0.94), dz - 0.004 * (k - 1)]))) }
      tube(ch, pts, r, N(10, q), vo(O(col, SM.skin, wHead, head, { rough: rg })), false)
    }
    // 球眼眼睑：上睑缘压住球上缘（湿润粉红）+ 上睫毛一排（稀疏、被肿胀撑开），下睑缘红肿 + 几根短下睫毛
    const onB = (a: number, k: number, lift = 0.0012): V3 => add(bc, toB(B, [Math.cos(a) * BALL_R * k, Math.sin(a) * BALL_R * k, Math.sqrt(Math.max(0, 1 - k * k)) * BALL_R + lift]))
    const upA = (i: number, n: number) => Math.PI * (0.1 + 0.8 * (i / n)), loA = (i: number, n: number) => Math.PI * (1.18 + 0.64 * (i / n))
    tube(ch, Array.from({ length: 25 }, (_, i) => onB(upA(i, 24), 0.9 - 0.04 * Math.sin((i / 24) * Math.PI), 0.0018)), Array.from({ length: 25 }, (_, i) => 0.0018 + 0.0018 * Math.sin((i / 24) * Math.PI)), N(8, q), vo(O(mixc(SKIN, hx('#c06a64'), 0.55), SM.skin, wHead, head, { rough: 0.22 })), false)
    tube(ch, Array.from({ length: 17 }, (_, i) => onB(loA(i, 16), 0.95, 0.0014)), 0.0016, N(8, q), vo(O(mixc(SKIN, hx('#8a3a3a'), 0.6), SM.skin, wHead, head, { rough: 0.2 })), false)
    const eo2 = vo(O(hx('#24140c'), SM.dark, wHead, head, { rough: 0.55 }))
    for (let i = 0; i < N(22, q, 8); i++) {
      const a = upA(i + 0.5, N(22, q, 8)), kk = 0.9 - 0.04 * Math.sin(a), b0 = onB(a, kk, 0.0032), rad = nrm(toB(B, [Math.cos(a), Math.sin(a), 0])), L = 0.006 + 0.003 * sstep(0.5, 0.1, Math.abs(Math.cos(a) - 0.6)) * 0.5 + 0.0015 * noise3(i, 4, 4)
      const p1 = add(b0, add(scl(rad, L * 0.45), scl(n, L * 0.45))), p2 = add(p1, add(scl(rad, L * 0.25), add(scl(n, L * 0.1), [0, L * 0.25, 0])))
      tube(ch, [b0, p1, p2], [0.00034, 0.00022, 0.00006], 3, eo2, false)
    }
    for (let i = 0; i < N(7, q, 3); i++) { const a = loA(i + 0.5, N(7, q, 3)), b0 = onB(a, 0.95, 0.0025), rad = nrm(toB(B, [Math.cos(a), Math.sin(a), 0])); tube(ch, [b0, add(b0, add(scl(rad, 0.0026), scl(n, 0.0012)))], [0.00022, 0.00005], 3, eo2, false) }
  })
  // 头发（ref2：齐肩波波头，中分偏左的斜刘海盖额到眉上，两侧过耳垂到肩、发梢外翘不齐）
  mark('hair', () => {
    const HAIR = hx('#4a2c1a'), hw = sk.auto(['head', 'neck'], 0.05)
    // 阶段 3：发束下段渐变到 hairL / hairR / hairB（弹簧骨），发根与刘海仍随 head
    const iH = sk.idx('head'), iL = sk.idx('hairL'), iR = sk.idx('hairR'), iB = sk.idx('hairB')
    const hwS: WFn = (p, acc) => { const k = sstep(1.705, 1.6, p[1]); if (k <= 0) { acc.add(iH, 1); return } const r = Math.hypot(p[0], p[2]) || 1, l = sstep(0.25, 0.9, p[0] / r), rr = sstep(0.25, 0.9, -p[0] / r), b = Math.max(0, 1 - l - rr); acc.add(iH, 1 - k); if (l > 0) acc.add(iL, k * l); if (rr > 0) acc.add(iR, k * rr); if (b > 0) acc.add(iB, k * b) }
    const capS: PS = (u, v) => { const th = u * Math.PI * 2, cs = Math.cos(th), lo = cs > 0.2 ? 0.4 + 0.34 * sstep(0.2, 0.85, cs) : 0.4 * sstep(-0.9, 0.2, cs), tt = lo + (1.0 - lo) * v; const p = headS(u, (tt + 0.06) / 1.06), n = snrm(headS, u, (tt + 0.06) / 1.06); return add(p, scl(n, 0.006 + 0.004 * v)) }
    surf(ch, capS, N(64, q), N(22, q), O(mixc(HAIR, [0, 0, 0], 0.35), SM.fur, hw, head, { su: 0.6, sv: 0.25 }))
    const hc = (k: number, j: number) => mixc(mixc(HAIR, hx('#2a160c'), 0.5 * (1 - k)), hx('#7a5034'), 0.22 * k * noise3(j * 1.3, 2, 3))
    const NC = N(110, q, 26), part = -0.35
    const pos = (th: number, t: number, off: number): V3 => { const u = ((th / (Math.PI * 2)) % 1 + 1) % 1, v = clamp((t + 0.06) / 1.06, 0, 1), p = headS(u, v), n = snrm(headS, u, v); return add(p, scl(n, off)) }
    for (let j = 0; j < NC; j++) {
      const r1 = noise3(j * 1.71, 0.3, 0.7), r2 = noise3(j * 2.93, 5.1, 1.3), r3 = noise3(j * 0.77, 9.4, 3.3)
      const th0 = (j / NC) * Math.PI * 2 + (r1 - 0.5) * 0.1, cs = Math.cos(th0), frontK = sstep(0.55, 0.85, cs)
      const pts: V3[] = []
      if (frontK > 0.5) {
        // 斜刘海：从分线附近起，斜扫过额头，发梢停在眉上
        const sweep = 0.75 + 0.25 * r3
        for (let i = 0; i <= 8; i++) { const k = i / 8; pts.push(pos(part + (th0 - part) * 0.3 + (th0 - part) * 0.7 * k + sweep * k * 0.35, 0.99 - (0.99 - (0.69 + 0.04 * r2 + 0.04 * Math.sin(th0 * 5))) * k, 0.011 + 0.006 * k)) }
        const last = pts[pts.length - 1]; pts.push(add(last, [0.006, -0.01, 0.004]))
      } else {
        const lat0 = 0.99, latE = 0.42
        for (let i = 0; i <= 7; i++) { const k = i / 7; pts.push(pos(th0 + (Math.sin(th0 - part) > 0 ? 0.08 : -0.08) * k, lat0 + (latE - lat0) * k, 0.011 + 0.01 * k + 0.004 * r3)) }
        const last = pts[pts.length - 1], out = nrm([last[0], 0, last[2] - z0 + 0.02])
        const side = Math.abs(Math.sin(th0)), drop = 0.1 + 0.07 * side * (cs < 0 ? 0.8 : 1) + 0.05 * r1, flare = 0.012 + 0.03 * r2 * side
        for (let i = 1; i <= 6; i++) { const k = i / 6; pts.push(add(add(last, [0, -drop * k, 0]), scl(out, 0.008 * k + flare * k * k * k))) }
      }
      const R0 = (0.0078 + 0.0024 * r3) * (frontK > 0.5 ? 0.85 : 1)
      limb(ch, pts, (u, v) => R0 * (1 - 0.84 * Math.pow(v, 1.7)) * (0.55 + 0.45 * Math.abs(Math.cos(u * Math.PI * 2))), N(6, q, 3), N(16, q, 6), O((p) => hc(clamp((chinY + HH - p[1]) / 0.3 + 0.2), j), SM.fur, hwS, head, { su: 0.05, sv: 0.3 }), { ref: [0, 1, 0] })
    }
    void lod
  })
}
function bristle2(ch: BuildCtx['ch'], base: V3, dir: V3, L: number, r0: number, o: ReturnType<typeof vo>) {
  const d = nrm(dir); tube(ch, [base, add(base, scl(d, L * 0.5)), add(base, add(scl(d, L), [0, -L * 0.15, 0]))], [r0, r0 * 0.7, r0 * 0.2], 3, o, false)
}
void len3; void roundEnds; void sph
