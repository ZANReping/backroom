// [jazz] 爵士脑（Entity 197）身体 SDF 部件——四人统一的乐队礼服（按 ZAN 附图）：
//   coat   宝蓝色乐队礼服上衣：合身精裁（收腰、下摆到胯下）、双排铜扣（两列 × 5 排，扣子在 jazzMesh 里单独做黄铜圆扣）、
//          叠门在角色右侧、前襟 / 下摆 / 袖口上沿金色滚边；肩线、侧缝、后中缝、后背两道公主线；
//          长袖 + 袖口（金色盘花在 jazzMesh 里用金绳管道做）；[修订] 领口前开 V 口（V 里深色内衬），两侧金黄翻领三角 + 后 / 侧一圈矮翻领在 jazzMesh 里做
//   pants  深藏青长裤（裤侧一道金色侧章条），裤脚盖住鞋面
//   shoe   黑色亮面皮鞋（鞋壳 = 脚包络外扩，权重与脚同骨）
//   hand   人手（不戴手套）：普通 / 胖（低音提琴）/ 老人手（头儿：细、指节突出、手背筋、老年斑在着色器里）
// 体型按 makeJazzRig(who) 的 J / P 给，makeJazzBody(R) 返回闭包（四人各一套，不共享模块级常量）。
import { clamp, fbm, gauss, len2, len3, mix, sdCapsule, sdEll, sdRoundBox, sdRoundCone, smax, smin, sstep, vnoise } from './conciergeSdf'
import { add, chainWeights, dot, lenv, nrm, scl, side, sub, type Finger, type HandFrame, type JazzRigDef, type V3, W4 } from './jazzRig'
import type { Shade } from './conciergeHead'

export const C = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]
export const mixc = (a: number[], b: number[], t: number) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
export const mulc = (a: number[], k: number) => [a[0] * k, a[1] * k, a[2] * k]
function sdEllipse(x: number, y: number, a: number, b: number) { const k0 = len2(x / a, y / b), k1 = len2(x / (a * a), y / (b * b)); return k1 < 1e-9 ? -Math.min(a, b) : (k0 * (k0 - 1)) / k1 }

/** 材质号（顶点 aMat.x）：着色器按它选呢料斜纹 / 金绳编织 / 黄铜 / 皮肤 / 老人皮肤 / 亮皮 / 木纹 / 鼓皮 / 镀铬 / 毛毡 / 乌木 / 珠母 / 金色布 / 喇叭口深处 */
export const MAT = { plain: 0, wool: 1, cord: 2, brass: 3, skin: 4, old: 5, leather: 6, wood: 7, drumhead: 8, chrome: 9, felt: 10, ebony: 11, pearl: 12, goldCloth: 13, deep: 14, bronze: 15, spruce: 16, medal: 17 } as const
export const setC = (o: Shade, c: number[], rough: number, mat: number, fy = 0, metal = 0) => { o.r = c[0]; o.g = c[1]; o.b = c[2]; o.rough = rough; o.metal = metal; o.fur = 0; o.skin = 0; o.cloth = 0; o.wool = 0; o.fx = mat; o.fy = fy; o.fz = 0 }

/** 颜色（sRGB） */
export const COL = {
  coat: 0x2f55b4, coatSh: 0x1e3a84, seam: 0x22418f, gold: 0xe0b23c, goldSh: 0x9a6d1c, collar: 0xf0c23a, inner: 0x121a3a,
  pants: 0x1d2c5e, shoe: 0x0e0d0e, sole: 0x2a2624,
}

interface ArmSeg { a: V3; e: V3; w: V3; du: V3; df: V3; Lu: number; Lf: number; end: V3 }
interface LegSeg { hip: V3; knee: V3; ankle: V3; toe: V3; dT: V3; dS: V3; Lt: number; Ls: number }
type Box = { min: [number, number, number]; max: [number, number, number] }

export type JazzBody = ReturnType<typeof makeJazzBody>
export function makeJazzBody(R: JazzRigDef) {
  const { J, P, B, HANDS } = R
  const ARM: Record<number, ArmSeg> = {}, LEG: Record<number, LegSeg> = {}
  for (const s of [1, -1]) {
    const a = side(J.shoulder, s), e = side(J.elbow, s), w = side(J.wrist, s)
    const du = nrm(sub(e, a)), df = nrm(sub(w, e))
    ARM[s] = { a, e, w, du, df, Lu: lenv(sub(e, a)), Lf: lenv(sub(w, e)), end: add(w, scl(df, 0.004)) }
    const hip = side(J.hip, s), knee = side(J.knee, s), ankle = side(J.ankle, s), toe = side(J.toe, s)
    LEG[s] = { hip, knee, ankle, toe, dT: nrm(sub(knee, hip)), dS: nrm(sub(ankle, knee)), Lt: lenv(sub(knee, hip)), Ls: lenv(sub(ankle, knee)) }
  }
  const foreT = (s: number, X: number, Y: number, Z: number) => { const A = ARM[s]; return ((X - A.e[0]) * A.df[0] + (Y - A.e[1]) * A.df[1] + (Z - A.e[2]) * A.df[2]) / A.Lf }
  const upT = (s: number, X: number, Y: number, Z: number) => { const A = ARM[s]; return ((X - A.a[0]) * A.du[0] + (Y - A.a[1]) * A.du[1] + (Z - A.a[2]) * A.du[2]) / A.Lu }

  // ====================================================================
  // 上衣
  // ====================================================================
  const neckY = J.neck[1], topY = neckY + 0.012
  /** 领座（立领薄壳贴着它）：中心 / 半径 */
  const NECK = { c: [0, topY, J.neck[2] + 0.004] as V3, rx: 0.068 + 0.01 * P.belly, rz: 0.064 + 0.008 * P.belly }
  const hemY = P.hemY
  const waistY = J.spine[1] - 0.03
  const bellyZ = 0.06 * P.belly
  function torsoCore(X: number, Y: number, Z: number) {
    const ax = Math.abs(X)
    let d = sdEll(X, Y, Z, 0, J.chest[1] + 0.03, J.chest[2] + 0.006, P.chestW, 0.2, P.chestD) // 胸廓
    d = smin(d, sdEll(X, Y, Z, 0, waistY, J.spine[2] + 0.004 + bellyZ * 0.5, P.waistW, 0.16, P.waistD), 0.09) // 收腰
    if (P.belly > 0) d = smin(d, sdEll(X, Y, Z, 0, waistY - 0.03, 0.05 + bellyZ, 0.19 * P.belly, 0.17, 0.12), 0.08) // 肚子
    d = smin(d, sdEll(X, Y, Z, 0, J.hips[1] - 0.05, 0.0, P.hipW, 0.14, P.hipD), 0.08) // 臀
    d = smin(d, sdEll(X, Y, Z, 0, J.chest[1] + 0.05, J.chest[2] - 0.04 - (P.old ? 0.015 : 0), P.chestW * 0.9, 0.17, P.chestD * 0.75), 0.05) // 背（驼背更鼓）
    // 肩（垫肩：平直方正）
    const A = ARM[1]
    d = smin(d, sdRoundCone(ax, Y, Z, 0.04, topY - 0.03, J.clav[2], A.a[0] + 0.004, A.a[1] + 0.004, A.a[2], 0.058, P.armR + 0.008), 0.05)
    d = smin(d, sdEll(X, Y, Z, 0, topY - 0.05, NECK.c[2], NECK.rx + 0.03, 0.06, NECK.rz + 0.025), 0.04) // 颈根（立领座）
    d = smax(d, Y - topY, 0.012)
    return d
  }
  /** 下摆：腰以下包住臀的椭圆柱（略外扩），到 hemY 截平 */
  function skirt(X: number, Y: number, Z: number) {
    const k = sstep(waistY, hemY, Y)
    const a = mix(P.waistW + 0.012, P.hipW + 0.03, Math.sqrt(k)), bF = mix(P.waistD + 0.012 + bellyZ, P.hipD + 0.03 + bellyZ * 0.6, Math.sqrt(k)), bB = mix(P.waistD + 0.008, P.hipD + 0.035, Math.sqrt(k))
    const b = Z > 0 ? bF : bB
    return smax(sdEllipse(X, Z - 0.004, a, b), Y - waistY, 0.04)
  }
  const sleeveR = (t: number) => mix(P.foreR + 0.012, P.foreR + 0.006, clamp(t, 0, 1))
  const CUFF_T0 = 0.78
  function sleeve(s: number, X: number, Y: number, Z: number) {
    const A = ARM[s]
    let d = sdRoundCone(X, Y, Z, A.a[0] - s * 0.008, A.a[1] - 0.008, A.a[2], A.e[0], A.e[1], A.e[2], P.armR + 0.014, P.foreR + 0.013)
    d = smin(d, sdEll(X, Y, Z, A.a[0] - s * 0.006, A.a[1] - 0.006, A.a[2], P.armR + 0.009, 0.042, P.armR + 0.013), 0.03) // 袖山
    d = smin(d, sdRoundCone(X, Y, Z, A.e[0], A.e[1], A.e[2], A.end[0], A.end[1], A.end[2], sleeveR(0), sleeveR(1)), 0.02)
    const t = foreT(s, X, Y, Z)
    if (t > -0.3 && t < 0.3) d -= 0.0018 * gauss(t, 0.13) * Math.sin(t * 60 + 0.6 * Math.sin(X * 80)) // 肘弯横褶
    // 袖口（比袖子略厚一圈）
    if (t > CUFF_T0 - 0.06) {
      const p0 = add(A.e, scl(A.df, A.Lf * CUFF_T0))
      const cuff = sdRoundCone(X, Y, Z, p0[0], p0[1], p0[2], A.end[0], A.end[1], A.end[2], sleeveR(CUFF_T0) + 0.0035, sleeveR(1) + 0.0035)
      d = Math.min(d, smax(cuff, (CUFF_T0 + 0.004 - t) * A.Lf, 0.003))
    }
    d = smax(d, (t - 1) * A.Lf - 0.004, 0.004)
    const cr = P.foreR * 0.62 + 0.006
    const cav = sdRoundCone(X, Y, Z, A.end[0] - A.df[0] * 0.06, A.end[1] - A.df[1] * 0.06, A.end[2] - A.df[2] * 0.06, A.end[0] + A.df[0] * 0.03, A.end[1] + A.df[1] * 0.03, A.end[2] + A.df[2] * 0.03, cr, cr + 0.003)
    d = smax(d, -cav, 0.004)
    return d
  }
  function coatCore(X: number, Y: number, Z: number) { return smin(torsoCore(X, Y, Z) + 0.006, skirt(X, Y, Z), 0.05) }
  const BTN_X = 0.066 * (0.8 + 0.2 * P.chestW / 0.165) + 0.01 * P.belly
  const BTN_Y = [0, 1, 2, 3, 4].map((i) => mix(J.chest[1] + 0.085, waistY - 0.03, i / 4))
  /** [修订 E197] 领口前开 V 口：V 底高度、领口两侧开口半角（领座椭圆上的角度）、V 口半宽（y 处） */
  const V_Y = BTN_Y[0] + 0.035, V_GAP = 0.95
  const vHalf = (y: number) => clamp((y - V_Y) / (topY - V_Y), 0, 1.2) * Math.sin(V_GAP) * NECK.rx
  /** 叠门边 x（角色右侧）：V 底 → 斜出到叠门线 → 竖直到下摆 */
  const edgeX = (y: number) => mix(-(BTN_X + 0.034), -0.004, sstep(V_Y - 0.04, V_Y, y))
  /** [修订 E197] 袖子只留肩头一截（上臂前 SLEEVE_CAP_T）：衣身部件用它提取，袖子另作独立网格（袖与衣身不再连成一片，抬臂时侧片不被拉长） */
  const SLEEVE_CAP_T = 0.34, SLEEVE_TOP_T = 0.2
  const sleeveCap = (s: number, X: number, Y: number, Z: number) => smax(sleeve(s, X, Y, Z), (upT(s, X, Y, Z) - SLEEVE_CAP_T) * ARM[s].Lu, 0.012)
  /** 独立袖子（上臂 + 前臂 + 袖口）：顶端在 SLEEVE_TOP_T 截平，藏在衣身的肩头里 */
  const sleeveOnly = (s: number) => (X: number, Y: number, Z: number) => smax(sleeve(s, X, Y, Z), (SLEEVE_TOP_T - upT(s, X, Y, Z)) * ARM[s].Lu, 0.006)
  function coatSdf(X: number, Y: number, Z: number) { return coatSdfM(X, Y, Z, false) }
  function coatSdfT(X: number, Y: number, Z: number) { return coatSdfM(X, Y, Z, true) }
  function coatSdfM(X: number, Y: number, Z: number, capped: boolean) {
    if (Y < hemY - 0.02 || Y > topY + 0.04) return Math.max(hemY - 0.02 - Y, Y - topY - 0.04) + 0.04
    const ax = Math.abs(X), sx = X >= 0 ? 1 : -1
    let d = coatCore(X, Y, Z)
    d = smax(d, hemY - Y, 0.004)
    // 精裁：腰部前后两道省缝（公主线）凹一点；后背公主线
    d += 0.0016 * gauss(ax - P.waistW * 0.55, 0.004) * sstep(J.chest[1] + 0.05, waistY, Y)
    d -= 0.0012 * sstep(waistY - 0.04, hemY, Y) * Math.sin(Math.atan2(X, Z) * 6 + 0.4) // 下摆微微的竖褶
    { const r = len2(X - sx * (P.chestW * 0.9), Y - (J.chest[1] + 0.06)), ang = Math.atan2(Y - J.chest[1] - 0.06, (X - sx * P.chestW * 0.9) * sx); d -= 0.0012 * gauss(r - 0.05, 0.035) * sstep(0.0, 0.03, r) * Math.sin(ang * 7 + r * 30) } // 腋下斜褶
    d += 0.00025 * fbm(X * 30, Y * 30, Z * 30, 2)
    if (Z > 0.02) {
      const ex = edgeX(Y)
      d += 0.0022 * sstep(ex + 0.002, ex - 0.002, X) * sstep(V_Y + 0.005, V_Y - 0.01, Y) // 叠门台阶（V 口以下）
    } else d += 0.0018 * gauss(X, 0.0024) * sstep(topY, topY - 0.08, Y) // 后中缝
    const kS = mix(0.003, 0.028, sstep(J.chest[1] - 0.15, J.chest[1] + 0.02, Y))
    for (const s of [1, -1]) if (sx === s || ax < 0.05) d = smin(d, capped ? sleeveCap(s, X, Y, Z) : sleeve(s, X, Y, Z), kS)
    return d
  }
  /** 独立上臂袖：上臂 SLEEVE_TOP_T 以下、前臂袖部件以上 */
  function upperSleeveRegion(s: number, X: number, Y: number, Z: number) { return Math.max((SLEEVE_TOP_T - 0.02 - upT(s, X, Y, Z)) * ARM[s].Lu, -foreSleeveRegion(s, X, Y, Z) - SLEEVE_BAND - 0.02) }
  function upperSleeveBox(s: number): Box {
    const A = ARM[s], p0 = add(A.a, scl(A.du, A.Lu * (SLEEVE_TOP_T - 0.05))), p1 = add(A.e, scl(A.df, A.Lf * 0.6)), r = P.armR + 0.05
    return { min: [Math.min(p0[0], p1[0]) - r, Math.min(p0[1], p1[1]) - r, Math.min(p0[2], p1[2]) - r], max: [Math.max(p0[0], p1[0]) + r, Math.max(p0[1], p1[1]) + r, Math.max(p0[2], p1[2]) + r] }
  }
  const COAT_BOX: Box = { min: [-0.5, hemY - 0.02, -0.3], max: [0.5, topY + 0.04, 0.34] }
  function foreSleeveRegion(s: number, X: number, Y: number, Z: number) {
    const A = ARM[s], t = foreT(s, X, Y, Z)
    const px = X - A.e[0] - A.df[0] * t * A.Lf, py = Y - A.e[1] - A.df[1] * t * A.Lf, pz = Z - A.e[2] - A.df[2] * t * A.Lf
    return Math.max((0.5 - t) * A.Lf, (t - 1.12) * A.Lf, len3(px, py, pz) - (P.foreR + 0.035))
  }
  const SLEEVE_BAND = 0.008
  function foreSleeveBox(s: number): Box {
    const A = ARM[s], p0 = add(A.e, scl(A.df, A.Lf * 0.45)), p1 = add(A.end, scl(A.df, 0.03)), r = P.foreR + 0.04
    return { min: [Math.min(p0[0], p1[0]) - r, Math.min(p0[1], p1[1]) - r, Math.min(p0[2], p1[2]) - r], max: [Math.max(p0[0], p1[0]) + r, Math.max(p0[1], p1[1]) + r, Math.max(p0[2], p1[2]) + r] }
  }
  const BLUE = C(COL.coat), BLUE_SH = C(COL.coatSh), SEAM = C(COL.seam)
  function coatShade(X: number, Y: number, Z: number, o: Shade) {
    const ax = Math.abs(X), sx = X >= 0 ? 1 : -1
    {
      const A = ARM[sx], t = foreT(sx, X, Y, Z)
      if (t > 0.95 && t < 1.08) {
        const px = X - A.e[0] - A.df[0] * t * A.Lf, py = Y - A.e[1] - A.df[1] * t * A.Lf, pz = Z - A.e[2] - A.df[2] * t * A.Lf
        if (len3(px, py, pz) < P.foreR * 0.62 + 0.012) { setC(o, mulc(BLUE_SH, 0.35), 0.95, MAT.wool); return }
      }
    }
    let c = mulc(BLUE, 0.98 + 0.035 * fbm(X * 9, Y * 9, Z * 9, 2))
    const mat: number = MAT.wool
    const seam = (k: number) => { c = mixc(c, SEAM, clamp(k, 0, 1)) }
    // 金色滚边 / 侧章条是 jazzMesh 里的金绳 / 金带几何（顶点色分辨率不够，画出来是脏斑）
    // 肩线、侧缝
    { const ys = mix(topY - 0.005, J.shoulder[1] + 0.03, clamp((ax - 0.05) / (ARM[1].a[0] - 0.05), 0, 1)); if (ax > 0.05 && ax < ARM[1].a[0] + 0.02) seam(0.55 * gauss(Y - ys, 0.003) * gauss(Z - J.clav[2] + 0.01, 0.03)) }
    seam(0.5 * gauss(ax - (P.waistW + 0.01), 0.0035) * sstep(0.0, -0.02, Z - 0.0) * sstep(J.chest[1] + 0.02, J.chest[1] - 0.05, Y))
    // 公主线（前后）
    seam(0.35 * gauss(ax - P.waistW * 0.55, 0.003) * sstep(J.chest[1] + 0.06, waistY, Y))
    if (Z > 0.02) {
      const ex = edgeX(Y)
      // 叠边金色滚边 + 叠边投影
      seam(0.6 * gauss(X - ex + 0.001, 0.0018) * sstep(V_Y + 0.005, V_Y - 0.01, Y))
      c = mulc(c, 1 - 0.18 * sstep(ex - 0.001, ex - 0.008, X) * sstep(ex - 0.025, ex - 0.008, X) * sstep(V_Y + 0.005, V_Y - 0.01, Y))
      // V 口里（两片金黄翻领之间）：深色内衬 / 衬衣（往翻领下多涂 1.2 cm，顶点色过渡藏在翻领下面）
      if (Y > V_Y - 0.012 && ax < vHalf(Y) + 0.012) { setC(o, mulc(C(COL.inner), 0.9 + 0.1 * fbm(X * 30, Y * 30, Z * 30, 2)), 0.85, MAT.wool); return }
    } else seam(0.5 * gauss(X, 0.0022) * sstep(topY, topY - 0.08, Y))
    // 袖口：上沿金色滚边，袖口布色略深
    {
      const t = foreT(sx, X, Y, Z), tu = upT(sx, X, Y, Z), A = ARM[sx]
      const dA = sdCapsule(X, Y, Z, A.e[0], A.e[1], A.e[2], A.end[0], A.end[1], A.end[2], P.foreR + 0.03)
      if (dA < 0.0 && tu > 0.9) {
        if (t > CUFF_T0 - 0.02 && t < 1.02) c = mulc(c, 0.9)
      }
    }
    setC(o, c, 0.9, mat)
  }
  function trunkW(_X: number, Y: number, acc: W4, k: number) {
    if (k <= 0) return
    const a = sstep(J.hips[1] + 0.05, J.spine[1] + 0.07, Y), b = sstep(J.spine[1] + 0.09, J.chest[1] + 0.07, Y)
    acc.add(B.hips, k * (1 - a)); acc.add(B.spine, k * a * (1 - b)); acc.add(B.chest, k * a * b)
  }
  /** mode：'full' 袖与衣身合一的饰件（金绳 / 盘花）；'torso' 衣身部件（袖只算肩头一截）；'sleeve' 独立袖子（全归手臂） */
  function coatWeights(X: number, Y: number, Z: number, acc: W4, noArm = false, mode: 'full' | 'torso' | 'sleeve' = 'full') {
    const p: V3 = [X, Y, Z], s = X >= 0 ? 1 : -1, S = s > 0 ? 'L' : 'R', A = ARM[s]
    // 袖 / 衣身按两支 SDF 谁更近来分（只用胶囊距离的话，垂在胯边的手会把衣摆侧片带走）；腋下过渡宽、腰以下窄
    // [修订] 衣身部件只跟「肩头那截袖」比：垂手时贴在腰侧 / 胯侧的衣身顶点不再分到手臂（抬臂时侧片被拉成长条的根源）
    const dArm = mode === 'torso' ? sleeveCap(s, X, Y, Z) : sleeve(s, X, Y, Z)
    const dTor = coatCore(X, Y, Z)
    const along = dot(sub(p, A.a), A.du)
    // 腋下过渡带：上臂抬起时肩头一截按离肩远近逐渐交给上臂（宽 3 cm → 抬臂时拉伸分散在肩头，不集中在一圈）
    const bw = mix(0.006, 0.03, sstep(J.chest[1] - 0.15, J.chest[1] + 0.02, Y))
    const armK = noArm ? 0 : mode === 'sleeve' ? sstep(-0.07, 0.0, along) : clamp(sstep(-bw * 0.6, bw, dTor - dArm) * sstep(-0.07, 0.02, along), 0, 1)
    const clavK = noArm ? 0 : gauss(lenv(sub(p, A.a)), 0.07) * (1 - armK) * 0.8 + armK * gauss(along, 0.055) * 0.4
    acc.add(B['clav' + S], clavK)
    if (armK > 0) {
      const fE = sstep(-0.035, 0.035, dot(sub(p, A.e), nrm(add(A.du, A.df))))
      const k = armK * (1 - clavK * 0.5)
      acc.add(B['upperArm' + S], k * (1 - fE)); acc.add(B['foreArm' + S], k * fE)
    }
    const tk = (1 - armK) * (1 - clavK)
    // 下摆：跟下摆骨（与大腿同轴；动画里按大腿屈伸的一部分摆）
    const hk = tk * sstep(J.hips[1] - 0.06, hemY + 0.01, Y) * 0.8 * sstep(0.02, 0.07, Math.abs(X))
    acc.add(B['hem' + S], hk)
    const nk = (tk - hk) * sstep(topY - 0.05, topY + 0.01, Y) * 0.4
    acc.add(B.neck, nk)
    trunkW(X, Y, acc, tk - hk - nk)
  }

  // ====================================================================
  // 长裤
  // ====================================================================
  const cuffY = (z: number, ankZ: number) => 0.06 + 0.03 * sstep(0.06, -0.04, z - ankZ)
  function pantsLeg(s: number, X: number, Y: number, Z: number) {
    const L = LEG[s]
    let d = sdRoundCone(X, Y, Z, L.hip[0] - s * 0.004, L.hip[1] + 0.02, L.hip[2] - 0.004, L.knee[0], L.knee[1], L.knee[2], P.thighR + 0.006, P.shinR + 0.012)
    const bot: V3 = [L.ankle[0], 0.07, L.ankle[2] + 0.014]
    d = smin(d, sdRoundCone(X, Y, Z, L.knee[0], L.knee[1], L.knee[2], bot[0], bot[1], bot[2], P.shinR + 0.012, P.shinR + 0.006), 0.03)
    // 膝窝斜褶 + 裤脚堆褶（压在鞋面上）
    d -= 0.0018 * gauss(Y - L.knee[1] + 0.01, 0.04) * Math.sin(Y * 160 + X * 40) * sstep(0.01, -0.04, Z - L.knee[2])
    d -= 0.0024 * gauss(Y - 0.13, 0.035) * (0.6 + 0.4 * Math.sin(Math.atan2(X - L.ankle[0], Z - L.ankle[2]) * 4 + Y * 50))
    // 前烫迹线（裤中线一道棱）
    d -= 0.0012 * gauss(X - L.knee[0], 0.006) * sstep(L.knee[2] - 0.02, L.knee[2] + 0.04, Z) * sstep(L.hip[1] - 0.05, L.hip[1] - 0.15, Y)
    d = smax(d, cuffY(Z, L.ankle[2]) - Y, 0.004)
    d = smax(d, -sdRoundCone(X, Y, Z, bot[0], bot[1] - 0.05, bot[2], bot[0], bot[1] + 0.06, bot[2], P.shinR - 0.004, P.shinR - 0.006), 0.004)
    return d
  }
  function pantsSdf(X: number, Y: number, Z: number) {
    if (Y > J.hips[1] + 0.1) return Y - J.hips[1] - 0.1 + 0.02
    const ax = Math.abs(X), sx = X >= 0 ? 1 : -1
    let d = sdEll(X, Y, Z, 0, J.hips[1] - 0.03, 0.0, P.hipW + 0.0, 0.12, P.hipD)
    for (const s of [1, -1]) if (s === sx || ax < 0.06) d = smin(d, pantsLeg(s, X, Y, Z), 0.04)
    d += 0.0005 * fbm(X * 25, Y * 25, Z * 25, 2)
    return d
  }
  const PANTS_BOX: Box = { min: [-0.36, 0.04, -0.22], max: [0.36, J.hips[1] + 0.06, 0.24] }
  function pantsShade(X: number, Y: number, Z: number, o: Shade) {
    const s = X >= 0 ? 1 : -1, L = LEG[s]
    let c = mulc(C(COL.pants), 0.94 + 0.1 * fbm(X * 14, Y * 14, Z * 14, 2)), mat: number = MAT.wool
    // 侧章：腿外侧一道金条（沿腿轴的外侧中线）
    const t = clamp(dot(sub([X, Y, Z], L.hip), L.dT) / L.Lt, 0, 1)
    const ax0 = t < 1 ? add(L.hip, scl(L.dT, t * L.Lt)) : L.knee
    const axP = Y < L.knee[1] ? add(L.knee, scl(L.dS, clamp(dot(sub([X, Y, Z], L.knee), L.dS), 0, L.Ls))) : ax0
    const out = (X - axP[0]) * s, dz = Z - axP[2] + 0.004
    void out; void dz
    if (Y < cuffY(Z, L.ankle[2]) + 0.004) c = mulc(c, 0.4)
    setC(o, c, 0.88, mat)
  }
  function legWeights(X: number, Y: number, Z: number, acc: W4) {
    const s = X >= 0 ? 1 : -1, S = s > 0 ? 'L' : 'R', L = LEG[s]
    const p: V3 = [X, Y, Z]
    const below = sstep(-0.07, 0.05, dot(sub(p, L.hip), L.dT) - 0.03)
    const mid = sstep(0.01, 0.06, Math.abs(X))
    const legK = clamp(below * mix(0.4, 1, mid), 0, 1) * (Y > J.hips[1] + 0.04 ? 0 : 1)
    acc.add(B.hips, 1 - legK)
    if (legK <= 0) return
    chainWeights(acc, p, [L.hip, L.knee, L.ankle, L.toe, add(L.toe, [0, 0, 0.08])], [B['thigh' + S], B['shin' + S], B['foot' + S], B['toe' + S]], [0.06, 0.035, 0.02], legK)
  }

  // ====================================================================
  // 黑色亮面皮鞋
  // ====================================================================
  const footW = (z: number) => z < 0.1 ? mix(0.034, 0.045, sstep(-0.07, 0.1, z)) : mix(0.045, 0.018, Math.pow(sstep(0.1, 0.2, z), 0.8))
  const footH = (z: number) => z < 0 ? mix(0.084, 0.09, sstep(-0.07, -0.01, z)) : mix(0.09, 0.045, sstep(-0.005, 0.16, z)) - 0.006 * sstep(0.16, 0.2, z)
  const SHOE_E = 0.008
  function footLocal(x: number, y: number, z: number) {
    const zc = clamp(z, -0.064, 0.2), w = footW(zc), hh = footH(zc)
    let d = sdEllipse(x, y - 0.022, w, hh - 0.022)
    d = len2(Math.max(d, 0), z - zc) + Math.min(d, 0)
    return smax(d, 0.022 - y, 0.004)
  }
  function shoeSdf(s: number) {
    const L = LEG[s], cx = L.ankle[0] + s * 0.003, az = L.ankle[2]
    return (X: number, Y: number, Z: number) => {
      const x = X - cx, z = Z - az
      if (Y > 0.16 || Math.abs(x) > 0.1 || z < -0.13 || z > 0.27) return Math.max(Y - 0.16, Math.abs(x) - 0.1, -0.13 - z, z - 0.27) + 0.03
      let d = footLocal(x, Y, z) - SHOE_E
      d -= 0.0012 * gauss(z - 0.06, 0.004) * sstep(0.03, 0.06, Y) // 鞋头 / 鞋面接缝（压一道）
      d = smax(d, -sdEll(x, Y, z, 0, 0.125, -0.025, 0.034, 0.045, 0.048), 0.008)
      // 薄皮底 + 鞋跟
      const zs = clamp(z, -0.072, 0.212), ws = footW(clamp(zs, -0.064, 0.2)) + SHOE_E + 0.002
      const heel = z < -0.01 ? 0.026 : 0.012
      const rr = 0.003, qx = Math.abs(x) - ws + rr, qy = Math.abs(Y - heel * 0.5) - heel * 0.5 + rr
      let sole = len2(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr
      sole = len2(Math.max(sole, 0), z - zs) + Math.min(sole, 0)
      d = smin(d, sole, 0.003)
      d = smax(d, -Y, 0.002)
      return d
    }
  }
  const shoeBox = (s: number): Box => { const L = LEG[s]; return { min: [L.ankle[0] - 0.08, -0.006, L.ankle[2] - 0.11], max: [L.ankle[0] + 0.08, 0.15, L.ankle[2] + 0.25] } }
  function shoeShade(s: number, X: number, Y: number, Z: number, o: Shade) {
    const L = LEG[s], z = Z - L.ankle[2]
    let c = mulc(C(COL.shoe), 0.9 + 0.2 * fbm(X * 40, Y * 40, Z * 40, 2)), rough = 0.22, mat: number = MAT.leather
    if (Y < (z < -0.01 ? 0.026 : 0.012) + 0.001) { c = C(COL.sole); rough = 0.7; mat = MAT.plain }
    if (Y > 0.1) c = mulc(c, 0.6)
    setC(o, c, rough, mat)
  }
  function shoeWeights(s: number, _X: number, _Y: number, Z: number, acc: W4) {
    const S = s > 0 ? 'L' : 'R', L = LEG[s]
    const f = sstep(-0.025, 0.025, Z - L.toe[2])
    acc.add(B['foot' + S], 1 - f); acc.add(B['toe' + S], f)
  }

  // ====================================================================
  // 人手（不戴手套）
  // ====================================================================
  const toHand = (F: HandFrame, X: number, Y: number, Z: number): V3 => { const px = X - F.o[0], py = Y - F.o[1], pz = Z - F.o[2]; return [px * F.a[0] + py * F.a[1] + pz * F.a[2], px * F.r[0] + py * F.r[1] + pz * F.r[2], px * F.d[0] + py * F.d[1] + pz * F.d[2]] }
  const fingerSeg = (f: Finger, k: number, X: number, Y: number, Z: number) => sdRoundCone(X, Y, Z, f.joints[k][0], f.joints[k][1], f.joints[k][2], f.joints[k + 1][0], f.joints[k + 1][1], f.joints[k + 1][2], f.radii[k], f.radii[k + 1])
  const kr = P.fingerR, kw = 0.82 + 0.18 * kr, kt = 0.75 + 0.25 * kr
  function handSdf(s: number) {
    const { F, fingers } = HANDS[s], A = ARM[s]
    const w0 = sub(A.w, scl(A.df, 0.06))
    const wr = 0.024 * kt
    return (X: number, Y: number, Z: number) => {
      const [ta, tr, td] = toHand(F, X, Y, Z)
      let wrist = sdRoundCone(X, Y, Z, w0[0], w0[1], w0[2], A.w[0], A.w[1], A.w[2], wr, wr * 0.97)
      wrist = smin(wrist, sdEll(ta, tr, td, 0.004, 0, 0, 0.022, 0.028 * kw, 0.017 * kt), 0.012)
      if (P.old) wrist = smin(wrist, len3(ta - 0.002, tr + 0.024, td + 0.002) - 0.0065, 0.006) // 突出的腕骨（尺骨茎突）
      { const bd = len3(ta - 0.1, tr, td) - 0.155; if (bd > 0.02) return Math.min(bd, wrist) }
      let d = sdRoundBox(ta - 0.058, tr + 0.001, td + 0.0005, 0.044, 0.036 * kw, 0.0105 * kt, 0.01)
      d = smin(d, sdEll(ta, tr, td, 0.014, 0.0, 0.0, 0.03, 0.027 * kw, 0.017 * kt), 0.02)
      d = smin(d, sdEll(ta, tr, td, 0.062, 0.0, 0.004, 0.05, 0.038 * kw, 0.0102 * kt), 0.01)
      d = smin(d, sdEll(ta, tr, td, 0.036, 0.02 * kw, -0.008, 0.033, 0.017 * kw, 0.014 * kt), 0.012) // 鱼际
      d = smin(d, sdEll(ta, tr, td, 0.054, -0.027 * kw, -0.005, 0.042, 0.012 * kw, 0.012 * kt), 0.012) // 小鱼际
      d = smax(d, -sdEll(ta, tr, td, 0.066, 0.002, -0.025 * kt, 0.03, 0.02, 0.012), 0.008)
      if (P.old) d += 0.0012 * sstep(0.0, 0.006, td) // 老人手：手背更薄（骨感）
      // 手背掌骨 / 筋（老人手更明显）
      if (td > 0) for (const f of fingers) if (f.name !== 'thumb') {
        const b = toHand(F, f.joints[0][0], f.joints[0][1], f.joints[0][2])
        d = smin(d, sdCapsule(ta, tr, td, 0.022, b[1] * 0.3, 0.0105 * kt, b[0] - 0.006, b[1], 0.0098 * kt, P.old ? 0.0026 : 0.0018), P.old ? 0.003 : 0.005)
      }
      let df = 1
      const kn = P.knuckle
      for (const f of fingers) {
        let g = 1
        for (let k = 0; k < 3; k++) g = Math.min(g, fingerSeg(f, k, X, Y, Z))
        for (let k = 1; k < 3; k++) { const j = f.joints[k], r = f.radii[k]; g = smin(g, len3(X - j[0] - F.d[0] * r * 0.25, Y - j[1] - F.d[1] * r * 0.25, Z - j[2] - F.d[2] * r * 0.25) - r * 0.97 * kn, 0.003) }
        const tip = f.joints[3], dj = f.joints[2]
        const ex = tip[0] - dj[0], ey = tip[1] - dj[1], ez = tip[2] - dj[2], L2 = ex * ex + ey * ey + ez * ez
        const tn = ((X - dj[0]) * ex + (Y - dj[1]) * ey + (Z - dj[2]) * ez) / L2
        if (tn > 0.2 && tn < 1.4) {
          const tc = Math.min(tn, 1)
          const back = (X - dj[0] - ex * tc) * F.d[0] + (Y - dj[1] - ey * tc) * F.d[1] + (Z - dj[2] - ez * tc) * F.d[2]
          g = smax(g, back - f.radii[3] * 0.8, 0.002)
        }
        df = Math.min(df, g)
      }
      for (const f of fingers) if (f.name !== 'thumb') { const j = f.joints[0]; d = smin(d, len3(X - j[0] - F.d[0] * 0.004, Y - j[1] - F.d[1] * 0.004, Z - j[2] - F.d[2] * 0.004) - f.radii[0] * 1.06 * (P.old ? 1.12 : 1), 0.008) }
      d = smin(d, df, 0.008)
      d = smin(d, wrist, 0.012)
      d += (P.old ? 0.00035 : 0.0002) * vnoise(X * 700, Y * 700, Z * 700)
      return d
    }
  }
  function handBox(s: number): Box {
    const { fingers, F } = HANDS[s], A = ARM[s]
    let mn: V3 = [...F.o], mx: V3 = [...F.o]
    const w0 = sub(A.w, scl(A.df, 0.08))
    for (const p of [w0, ...fingers.flatMap((f) => f.joints)]) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]) }
    mn = mn.map((v) => v - 0.04) as V3; mx = mx.map((v) => v + 0.04) as V3
    return { min: mn as [number, number, number], max: mx as [number, number, number] }
  }
  const handKeep = (s: number) => (X: number, Y: number, Z: number) => foreT(s, X, Y, Z) > 0.9
  const SKIN = C(P.skin)
  function handShade(s: number, X: number, Y: number, Z: number, o: Shade) {
    const { F, fingers } = HANDS[s]
    const [ta, , td] = toHand(F, X, Y, Z)
    let c = mulc(SKIN, 0.94 + 0.1 * fbm(X * 40, Y * 40, Z * 40, 2))
    c = mixc(c, mulc(SKIN, 0.82), sstep(0.02, -0.01, ta) * 0.4)
    const palmK = sstep(0.0, -0.012, td)
    c = mixc(c, mixc(SKIN, [1, 0.86, 0.78], 0.35), palmK * 0.6)
    if (P.old) c = mixc(c, mulc(SKIN, 0.85), 0.4 * sstep(0.002, 0.008, td)) // 手背发暗发黄
    let rough = 0.6
    for (const f of fingers) {
      const dj = f.joints[2], tip = f.joints[3]
      const L = lenv(sub(tip, dj)), dir = nrm(sub(tip, dj))
      const tn = dot(sub([X, Y, Z], dj), dir) / L
      const q = sub([X, Y, Z], add(dj, scl(dir, clamp(tn, 0, 1) * L)))
      const back = dot(q, F.d), rad = lenv(q)
      if (rad < f.radii[2] * 1.4 && tn > 0.3 && tn < 1.08 && back > f.radii[3] * 0.4) {
        const k = sstep(f.radii[3] * 0.4, f.radii[3] * 0.62, back) * sstep(0.3, 0.4, tn)
        const nail = P.old ? [0.86, 0.78, 0.66] : mixc(SKIN, [1, 0.9, 0.86], 0.5)
        c = mixc(c, nail, k); rough = mix(rough, 0.35, k)
      }
      for (let j = 0; j < 3; j++) { const jp = f.joints[j]; const dd = lenv(sub([X, Y, Z], jp)); if (dd < f.radii[j] * 1.7) c = mixc(c, mulc(SKIN, P.old ? 0.72 : 0.84), 0.45 * gauss(dd - f.radii[j], 0.004) * sstep(-0.002, 0.004, dot(sub([X, Y, Z], jp), F.d))) }
    }
    setC(o, c, rough, P.old ? MAT.old : MAT.skin)
  }
  function handWeights(s: number, X: number, Y: number, Z: number, acc: W4) {
    const S = s > 0 ? 'L' : 'R', p: V3 = [X, Y, Z]
    const { F, fingers } = HANDS[s], A = ARM[s]
    const fWrist = sstep(-0.02, 0.022, dot(sub(p, A.w), nrm(add(A.df, F.a))))
    acc.add(B['foreArm' + S], 1 - fWrist)
    if (fWrist <= 0) return
    let best = 1, bf: Finger | null = null
    for (const f of fingers) { let g = 1; for (let k = 0; k < 3; k++) g = Math.min(g, fingerSeg(f, k, X, Y, Z)); if (g < best) { best = g; bf = f } }
    if (!bf) { acc.add(B['hand' + S], fWrist); return }
    const thumb = bf.name === 'thumb'
    const j0 = bf.joints[0], j1 = bf.joints[1], dir0 = nrm(sub(j1, j0))
    const fBase = thumb ? sstep(-0.014, 0.02, dot(sub(p, j0), dir0)) * sstep(0.012, 0.0, best) : sstep(-0.008, 0.008, dot(sub(p, j0), dir0)) * sstep(0.006, 0.0, best)
    acc.add(B['hand' + S], fWrist * (1 - fBase))
    if (fBase > 0) chainWeights(acc, p, bf.joints, [B[bf.name + '1' + S], B[bf.name + '2' + S], B[bf.name + '3' + S]], [0.006, 0.005], fWrist * fBase)
  }

  return {
    pantsLeg, sleeve, ARM, LEG, foreT, upT, NECK, topY, hemY, waistY, CUFF_T0, BTN_X, BTN_Y, edgeX, SLEEVE_BAND, V_Y, V_GAP, vHalf,
    torsoCore, coatCore, coatSdf, coatSdfT, sleeveOnly, sleeveCap, upperSleeveRegion, upperSleeveBox, SLEEVE_CAP_T, coatSdfM, COAT_BOX, coatShade, coatWeights, trunkW, foreSleeveRegion, foreSleeveBox, sleeveR,
    pantsSdf, PANTS_BOX, pantsShade, legWeights, shoeSdf, shoeBox, shoeShade, shoeWeights,
    handSdf, handBox, handKeep, handShade, handWeights,
  }
}

/** 正面命中：固定 x / y，沿 −Z 从 z0 往里找 f 的零点（再外偏 off） */
export function frontHit(f: (x: number, y: number, z: number) => number, x: number, y: number, off = 0, z0 = 0.45, dir = -1): V3 {
  let a = z0, b = 0
  if (f(x, y, a) < 0) return [x, y, a]
  // 先步进找到进入点
  let prev = a
  for (let z = z0; dir < 0 ? z > -0.45 : z < 0.45; z += dir * 0.01) { if (f(x, y, z) < 0) { a = prev; b = z; break } prev = z }
  for (let k = 0; k < 30; k++) { const m = (a + b) / 2; if (f(x, y, m) < 0) b = m; else a = m }
  return [x, y, a - dir * off]
}
/** 沿梯度把点投到 f 的等值面（off 外偏） */
export function onSurface(f: (x: number, y: number, z: number) => number, p: V3, off = 0): V3 {
  let x = p[0], y = p[1], z = p[2]
  for (let i = 0; i < 40; i++) {
    const d = f(x, y, z) - off, e = 0.001
    const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e)
    const gl = len3(gx, gy, gz) || 1
    x -= (gx / gl) * d * 0.8; y -= (gy / gl) * d * 0.8; z -= (gz / gl) * d * 0.8
    if (Math.abs(d) < 1e-5) break
  }
  return [x, y, z]
}
export function sdfNormal(f: (x: number, y: number, z: number) => number, p: V3): V3 {
  const e = 0.0015
  return nrm([f(p[0] + e, p[1], p[2]) - f(p[0] - e, p[1], p[2]), f(p[0], p[1] + e, p[2]) - f(p[0], p[1] - e, p[2]), f(p[0], p[1], p[2] + e) - f(p[0], p[1], p[2] - e)])
}
