// [casino] 赌场主要员工几何：Louie（ref2）、假肢人（ref3）、台球先生 Billy（ref4）、酒保 E164（维基 Entity 164「猩红之眼」）。
// 全部用参数曲面 / 管 / 椭球块拼出，按骨骼自动蒙皮；分段数 × q 出 LOD。
import { SM, hx, mixc, clamp, sstep, noise3, surf, blob, shellFur, bristle, ballSphere, limb, roundEnds, patch, seam, snrm, vo, pipe, tube, lathe, disc, box, sph, basisFromZ, toB,
  add, sub, scl, nrm, cross, dot, lenv, rot, type V3, type SOpt, type PS, type WFn, type Basis } from './casinoStaffKit'
import { TILES } from './casinoStaffMat'
import { PROS_LEGS, E164_LEGS, BILLY_BALL_R, PROS_GRIP_OFF, PROS_PALM } from './casinoStaffRig'
import type { BuildCtx } from './casinoStaffMesh'
import { buildLouieBody, buildLouieHead } from './casinoStaffLouie'

const N = (x: number, q: number, min = 3) => Math.max(min, Math.round(x * q))
const O = (col: SOpt['col'], mat: number, w: WFn, fb: number, x: Partial<SOpt> = {}): SOpt => ({ col, mat, w, fb, ...x })
const ell = (u: number, a: number, b: number) => { const t = u * Math.PI * 2, c = Math.cos(t), s = Math.sin(t); return 1 / Math.sqrt((c / a) ** 2 + (s / b) ** 2) }
/** 超椭圆环点（a=0 在 +Z，向 +X 转） */
const ring = (u: number, w: number, d: number, e = 2): [number, number] => { const a = u * Math.PI * 2, s = Math.sin(a), c = Math.cos(a); const f = (x: number) => Math.sign(x) * Math.pow(Math.abs(x), 2 / e); return [w * f(s), d * f(c)] }
/** 线性插值表 */
const tab = (T: number[][], y: number, k: number) => { if (y <= T[0][0]) return T[0][k]; for (let i = 1; i < T.length; i++) if (y <= T[i][0]) { const t = (y - T[i - 1][0]) / (T[i][0] - T[i - 1][0]); const s = t * t * (3 - 2 * t); return T[i - 1][k] + (T[i][k] - T[i - 1][k]) * s } return T[T.length - 1][k] }

// ============================================================ 共用小件
/** 蝴蝶领结（写实：两翼各三道折褶、中结收紧；s=1 时宽约 24 cm，写实领结用 s≈0.5） */
export function bowTie(c: BuildCtx, ctr: V3, s: number, col: number[], w: WFn, fb: number, stripe?: number[], mat: number = SM.cloth) {
  const { ch, q } = c
  for (const sd of [1, -1]) {
    const cc = add(ctr, [sd * 0.062 * s, 0, -0.006 * s])
    blob(ch, cc, [0.068 * s, 0.046 * s, 0.022 * s], N(36, q), N(22, q), O(stripe ? (p: V3) => (Math.sin((p[0] * 3 - p[1] * 1.2) / s * 60) > 0.72 ? stripe : col) : col, mat, w, fb, { su: 0.3 * s, sv: 0.15 * s }),
      (d) => { const toKnot = sstep(0.1, 1, -d[0] * sd); return (1 + 0.1 * Math.cos(d[1] * 3.2) * sstep(0.2, 0.9, Math.abs(d[0])) - 0.42 * toKnot ** 1.4 + 0.1 * sstep(0.5, 1, Math.abs(d[1])) * sstep(0, 0.6, d[0] * sd)) * (1 + 0.06 * Math.sin(d[1] * 9.5) * toKnot * Math.max(0, d[2])) })
  }
  blob(ch, add(ctr, [0, 0, 0.01 * s]), [0.022 * s, 0.03 * s, 0.018 * s], N(20, q), N(12, q), O(mixc(col, [0, 0, 0], 0.18), mat, w, fb, { su: 0.15, sv: 0.1 }), (d) => 1 + 0.05 * Math.sin(d[1] * 14))
}
/** 写实皮鞋（牛津鞋）：鞋楦形鞋面 + 沿条鞋底 + 鞋跟 + 鞋眼 / 鞋带 + 包头缝线。长约 0.28·big m */
export function shoe(c: BuildCtx, ankle: V3, toe: V3, col: number[], w: WFn, fb: number, big = 1) {
  const { ch, q } = c
  let f = sub(toe, ankle); f = nrm([f[0], 0, f[2]]); const sd = nrm(cross([0, 1, 0], f)), up: V3 = [0, 1, 0]
  const heel = add([ankle[0], 0, ankle[2]], scl(f, -0.075 * big)), L = 0.28 * big
  const Wf = (t: number) => { const W0 = 0.033 + 0.006 * sstep(0.3, 0.7, t) + 0.008 * Math.exp(-(((t - 0.7) / 0.12) ** 2)); const r0 = t < 0.13 ? Math.sqrt(Math.max(0, 1 - ((0.13 - t) / 0.13) ** 2)) : 1; const r1 = t > 0.74 ? Math.sqrt(Math.max(0, 1 - ((t - 0.74) / 0.26) ** 2)) : 1; return W0 * big * Math.max(0.02, r0) * Math.max(0.02, r1) }
  const Hf = (t: number) => big * (t < 0.36 ? 0.072 + 0.018 * sstep(0.1, 0.36, t) : 0.09 - 0.05 * sstep(0.36, 0.78, t) - 0.012 * sstep(0.8, 1, t))
  const SOLE = 0.012 * big, HEEL = 0.024 * big
  const lift = (t: number) => SOLE + HEEL * (1 - sstep(0.22, 0.42, t)) * 0.0 + 0.002
  const P = (t: number, x: number, y: number): V3 => add(add(add(heel, scl(f, t * L)), scl(sd, x)), scl(up, y))
  const upperS: PS = (u, v) => { const th = u * Math.PI, t = v, wv = Wf(t), cth = Math.cos(th), sth = Math.sin(th); const sq = Math.sign(cth) * Math.pow(Math.abs(cth), 0.75); return P(t, wv * sq, lift(t) + Hf(t) * Math.pow(Math.max(0, sth), 0.6)) }
  surf(ch, upperS, N(30, q), N(44, q), O(col, SM.leather, w, fb, { su: 0.2, sv: L, rough: 0.35, wrapU: false }))
  // 包头缝线 + 鞋眼片缝线
  seam(ch, upperS, Array.from({ length: 9 }, (_, i) => [0.08 + (i / 8) * 0.84, 0.8 - 0.05 * Math.sin((i / 8) * Math.PI)] as [number, number]), 0.0012, 0.004, 0.003, 0.0007, vo(O(mixc(col, [1, 1, 1], 0.12), SM.leather, w, fb)), false)
  // 鞋底（沿条外扩 3 mm）：侧壁 + 底面
  const outl = (u: number): [number, number] => { const a = u * 2, t = a < 1 ? a : 2 - a, x = (a < 1 ? 1 : -1) * (Wf(t) + 0.003 * big); return [t, x] }
  surf(ch, (u, v) => { const [t, x] = outl(u), hh = (t < 0.3 ? SOLE + HEEL : SOLE) * (1 - v); return P(t, x, hh + 0.0005) }, N(64, q), 2, O(hx('#2a1c14'), SM.leather, w, fb, { su: 0.6, sv: 0.03, rough: 0.6 }))
  surf(ch, (u, v) => { const [t, x] = outl(u); return P(t, x * (1 - v), 0.0005) }, N(64, q), 3, O(hx('#1a120e'), SM.leather, w, fb, { su: 0.6, sv: 0.1, rough: 0.8, flip: true }))
  surf(ch, (u, v) => { const [t, x] = outl(u), hh = t < 0.3 ? SOLE + HEEL : SOLE; return P(t, x * (1 - v * 0.98), hh) }, N(64, q), 2, O(hx('#2a1c14'), SM.leather, w, fb, { su: 0.6, sv: 0.1, rough: 0.6 }))
  // 鞋眼（4 对）+ 鞋带交叉
  const lace = vo(O(hx('#141010'), SM.cloth, w, fb)), eye: V3[][] = [[], []]
  for (let i = 0; i < 4; i++) { const t = 0.4 + i * 0.05; for (const k of [0, 1]) { const x = (k ? -1 : 1) * Wf(t) * 0.32, p = P(t, x, lift(t) + Hf(t) * 0.985 + 0.002); eye[k].push(p); lathe(ch, p, up, [[0.0035 * big, 0], [0.0025 * big, 0.0015]], 8, vo(O(hx('#3a3026'), SM.metal, w, fb, { metal: 1 }))) } }
  for (let i = 0; i < 4; i++) { tube(ch, [add(eye[0][i], [0, 0.002, 0]), add(eye[1][Math.min(3, i + 1)], [0, 0.003, 0])], 0.0018 * big, 4, lace, false); tube(ch, [add(eye[1][i], [0, 0.002, 0]), add(eye[0][Math.min(3, i + 1)], [0, 0.003, 0])], 0.0018 * big, 4, lace, false) }
}
/** 布料受力褶（返回半径的相对增量）：kink = 肘 / 膝堆褶中心 v，inner = 内侧方向 u；twist 前臂扭转斜褶；pit 腋下 / 胯下放射褶 */
export function clothFold(u: number, v: number, o: { kink?: number; inner?: number; amp?: number; twist?: number; pit?: number; hem?: number }) {
  const T = Math.PI * 2, amp = o.amp ?? 1, inner = o.inner ?? 0.5
  const side = 0.5 + 0.5 * Math.cos(T * (u - inner))
  let r = 0
  if (o.kink !== undefined) r += 0.055 * amp * Math.exp(-(((v - o.kink) / 0.075) ** 2)) * side * Math.sin(T * (u * 2 + v * 11)) ** 2
  if (o.kink !== undefined) r += 0.02 * amp * Math.exp(-(((v - o.kink) / 0.16) ** 2)) * Math.sin(T * (u * 4 - v * 6))
  if (o.twist) r += 0.022 * amp * o.twist * sstep(o.kink ?? 0.5, 1, v) * Math.sin(T * (u * 2 + v * 5)) * (1 - sstep(0.9, 1, v))
  if (o.pit) r += 0.05 * amp * o.pit * (1 - sstep(0, 0.2, v)) * side * Math.abs(Math.sin(T * (u * 3 + v * 2)))
  if (o.hem) r += 0.03 * amp * o.hem * sstep(0.86, 1, v) * Math.sin(T * (u * 3 + 0.2)) ** 2
  return r
}
/** 单位球方向 (X, Y) → surf/sph 的 (u, v)（正面半球） */
const uvOf = (X: number, Y: number): [number, number] => { const lat = Math.asin(clamp(Y, -0.999, 0.999)), cl = Math.cos(lat); return [Math.asin(clamp(X / cl, -1, 1)) / (Math.PI * 2), lat / Math.PI + 0.5] }
const G2 = (x: number, sx: number, y: number, sy: number) => Math.exp(-((x / sx) ** 2) - ((y / sy) ** 2))

// ============================================================ Louie
export function buildLouie(c: BuildCtx) {
  // 第三轮：身体复用爵士脑人体 / 西装 SDF（与其他 L5 人形同精度同体型），头按正常人类 NPC（retroNpc）比例重建；见 casinoStaffLouie.ts
  buildLouieBody(c)
  buildLouieHead(c)
}

// ============================================================ 假肢人（ref3）
/** 纽扣（圆顶 + 外沿），图集平面 UV；正面朝 n */
function button(c: BuildCtx, ctr: V3, n: V3, R: number, tile: [number, number, number, number], w: WFn, fb: number) {
  const B = basisFromZ(n)
  const prof = (v: number) => (v < 0.82 ? 0.012 * R / 0.05 * (1 - (v / 0.82) ** 2) * 0.6 + 0.004 : 0.004 + 0.006 * Math.sin(((v - 0.82) / 0.18) * Math.PI) * R / 0.05)
  surf(c.ch, (u, v) => { const a = u * Math.PI * 2, r = v * R; return add(ctr, toB(B, [Math.sin(a) * r, Math.cos(a) * r, prof(v)])) }, N(36, c.q), N(10, c.q), { col: [1, 1, 1], mat: SM.ball, w, fb,
    uv: (u, v) => { const a = u * Math.PI * 2; return [tile[0] + (Math.sin(a) * v * 0.5 + 0.5) * tile[2], tile[1] + (Math.cos(a) * v * 0.5 + 0.5) * tile[3]] } })
  lathe(c.ch, ctr, n, [[R, 0.004], [R * 1.02, -0.004], [R * 0.9, -0.01]], N(28, c.q), vo(O(hx('#1a1010'), SM.dark, w, fb)))
}
export function buildProsthetic(c: BuildCtx) {
  // 第三轮：形体回到第一版（3a90cd9..cb369d5：宽扁猫头 + 两颊 / 头顶尖毛簇、咧嘴大笑露一排牙、两颗獠牙、锥形猫耳、大纽扣眼（右 15 偏高、左 1）、
  // 子弹头小高礼帽歪戴左侧、钟形斗篷 8 个尖角下摆 + 金边、大领结、细长袖右臂横握杆、8 条细杆腿），
  // 只换质感：壳体猫毛、四孔树脂纽扣 + 真缝线、真丝礼帽、深酒红厚呢斗篷 + 竖褶、白棉手套握杆、黄铜铰链；曲面细分加密让轮廓更顺。
  const { ch, sk, q, R, mark } = c
  const J = R.J
  const FUR = hx('#ece4d6'), FURD = hx('#b3a690'), CLOAK = hx('#2e0c14'), LINING = hx('#5c0f26'), GOLD = hx('#c9a04a'), HAT = hx('#121012'), WOOD = hx('#4a2c1a'), BRASS = hx('#b8913e'), GLOVE = hx('#efebe2'), NOSE = hx('#c07a84')
  const head = sk.idx('head'), wHead = sk.rigid('head')
  // ---------------- 猫头（第一版形：宽扁椭球 + 两颊锯齿尖毛 + 头顶右侧一簇尖毛 + 下巴收 + 口吻微凸）
  const Hc: V3 = [0, 1.72, 0.03], HR: V3 = [0.205, 0.152, 0.148]
  const tri = (x: number) => Math.abs(((x % 1) + 1) % 1 - 0.5) * 2
  const kOf = (d: V3, u: number, v: number) => {
    const ax = Math.abs(d[0])
    let k = 1 + 0.26 * (1 - tri(v * 7.5)) ** 2 * sstep(0.8, 0.97, ax) * sstep(-0.7, -0.1, -Math.abs(d[1]) + 0.2)
    k += 0.22 * (1 - tri(u * 26)) ** 2 * sstep(0.5, 0.85, d[1]) * sstep(0.0, 0.5, -d[0])
    k -= 0.08 * sstep(0.2, 1, -d[1])
    return k
  }
  const headS: PS = (u, v) => {
    const d = sph(u, v), k = kOf(d, u, v)
    const muzzle = 0.06 * Math.exp(-((d[0] / 0.35) ** 2) - (((d[1] + 0.3) / 0.25) ** 2)) * Math.max(0, d[2])
    return [Hc[0] + d[0] * HR[0] * k, Hc[1] + d[1] * HR[1] * k, Hc[2] + d[2] * HR[2] * (k + muzzle)]
  }
  const XY = (p: V3): [number, number] => [(p[0] - Hc[0]) / HR[0], (p[1] - Hc[1]) / HR[1]]
  const gTop = (X: number) => -0.12 + 0.22 * (X + 0.05) ** 2, gBot = (X: number) => -0.2 - 0.38 * (1 - ((X + 0.05) / 0.62) ** 2)
  const inGrin = (X: number, Y: number, m = 0) => Math.abs(X + 0.05) < 0.62 + m && Y < gTop(X) + m && Y > gBot(X) - m
  /** 毛色：奶白底 + 浅灰褐虎斑（额 / 颊）+ 口吻更白 */
  const furCol = (p: V3): number[] => {
    const [X, Y] = XY(p)
    const stripe = Math.pow(Math.max(0, Math.sin(X * 26 + noise3(p[0] * 40, p[1] * 40, 1) * 2)), 6) * sstep(0.35, 0.6, Y) * sstep(0.4, 0.1, Math.abs(X)) + Math.pow(Math.max(0, Math.sin(Y * 24 - Math.abs(X) * 8)), 8) * sstep(0.55, 0.85, Math.abs(X)) * 0.7
    return mixc(mixc(FUR, FURD, 0.5 * stripe + 0.12 * noise3(p[0] * 60, p[1] * 60, p[2] * 60)), hx('#f6f3ec'), 0.45 * G2(X, 0.35, Y + 0.3, 0.25) * (p[2] > Hc[2] ? 1 : 0))
  }
  /** 咧嘴：口内暗红湿肉、唇缘深褐（第一版图案；牙另做实体） */
  const grin = (p: V3): number[] => {
    const [X, Y] = XY(p)
    if (p[2] > Hc[2] && inGrin(X, Y)) { const depth = Math.min(Y - gBot(X), gTop(X) - Y); return mixc(hx('#5a1620'), hx('#250608'), sstep(0.0, 0.08, depth)) }
    if (p[2] > Hc[2] && inGrin(X, Y, 0.035)) return hx('#3a1a1e')
    return furCol(p)
  }
  const EYES: [number, number, number, [number, number, number, number]][] = [[-0.088, 1.768, 0.068, TILES.button15], [0.09, 1.738, 0.062, TILES.button1]]
  const eyeDist = (p: V3) => Math.min(...EYES.map(([x, y, r]) => Math.hypot(p[0] - x, p[1] - y) / r))
  const furLen = (u: number, v: number) => {
    const d = sph(u, v), p = headS(u, v), [X, Y] = XY(p)
    let L = 0.012 + 0.014 * sstep(0.8, 0.97, Math.abs(d[0])) + 0.01 * sstep(0.5, 0.85, d[1]) * sstep(0, 0.5, -d[0])
    if (d[2] > 0 && inGrin(X, Y, 0.06)) L *= 0.04
    L *= 0.2 + 0.8 * sstep(1.05, 1.5, eyeDist(p))
    return L
  }
  mark('head', () => {
    const wJ = sk.auto(['head', 'jaw'], 0.012)
    surf(ch, headS, N(110, q), N(76, q), O((p) => mixc(grin(p), [0.2, 0.15, 0.13], 0.04), SM.fur, wJ, head, { su: 1.1, sv: 0.5, rough: 0.8 }))
    shellFur(ch, headS, N(56, q), N(40, q), O(grin, SM.shell, wJ, head, { su: 1.1, sv: 0.5 }), 6, furLen, 0.22, (p) => { const [X, Y] = XY(p); return [X * 0.5, -0.15 - 0.2 * Math.max(0, -Y), -0.7] })
    // 牙：上排一列方牙（第一版：咧嘴上沿一排齿，齿缝分明），象牙白、湿亮；下沿内侧一线暗唇
    const tooth = vo(O(hx('#efe6d0'), SM.dark, wJ, head, { rough: 0.28 }))
    for (let i = 0; i < 8; i++) {
      const X = -0.6 + (i + 0.5) * (1.1 / 8), Y = gTop(X) - 0.055
      const [u, v] = uvOf(X, Y), p = headS(u, v), n = snrm(headS, u, v), B = basisFromZ(n)
      blob(ch, add(p, scl(n, 0.002)), [0.0115, 0.0105, 0.006], N(12, q), N(8, q), O(mixc(hx('#f2eadb'), hx('#cfc2a0'), 0.25 * noise3(i, 3, 5)), SM.dark, wJ, head, { rough: 0.28 }), (d) => 1 - 0.25 * Math.max(0, -d[1]) ** 2, B)
    }
    // 两颗獠牙（第一版位置）
    for (const x of [-0.11, 0.075]) { const p: V3 = [x, 1.698, Hc[2] + HR[2] * Math.sqrt(Math.max(0, 1 - (x / HR[0]) ** 2 - 0.02)) + 0.006]; lathe(ch, p, nrm([0, -1, 0.15]), [[0.012, 0], [0.0105, 0.006], [0.008, 0.016], [0.0045, 0.025], [0, 0.031]], N(14, q), tooth) }
    // 鼻（小三角鼻镜，湿润，带两鼻孔）
    { const np: V3 = [0, 1.725, Hc[2] + HR[2] + 0.004]; blob(ch, np, [0.017, 0.012, 0.011], N(16, q), N(10, q), O((p) => mixc(NOSE, hx('#3a1a1c'), G2(Math.abs(p[0]) - 0.007, 0.0035, p[1] - np[1] + 0.003, 0.0025)), SM.skin, wHead, head, { rough: 0.3 }), (d) => 1 + 0.25 * d[1] - 0.2 * Math.abs(d[0]) * Math.max(0, -d[1])) }
    // 胡须：每侧 10 根白须，从口吻两侧长出
    const wo = vo(O(hx('#f4f1ea'), SM.dark, wHead, head, { rough: 0.35 }))
    for (const s of [1, -1]) for (let i = 0; i < 10; i++) { const row = i % 3, col = Math.floor(i / 3), [u, v] = uvOf(s * (0.22 + col * 0.05), -0.1 - row * 0.05), p = headS(u, v); bristle(ch, p, [s * (0.9 - row * 0.05), 0.1 - row * 0.12, 0.3], 0.12 + 0.03 * noise3(i, s, 4), 0.0011, 0.18, wo) }
    // 猫耳（第一版：耳根在头顶两侧 (±0.13, 1.83)，向外上，耳高 0.085）：厚耳廓外毛 + 内粉皮凹面 + 耳内簇毛
    for (const s of [1, -1]) {
      const b: V3 = [s * 0.13, 1.83, 0.0], up = nrm([s * 0.45, 1, -0.05]), fwd = nrm([s * 0.12, 0.0, 1]), side = nrm(cross(up, fwd))
      const earS = (k: number): PS => (u, v) => { const a = (u - 0.5) * 2, w = 0.055 * (1 - v) ** 0.85, cup = 0.022 * (1 - a * a) * (1 - v * 0.5); return add(add(add(b, scl(side, a * w)), scl(up, v * 0.088)), scl(fwd, -cup * k + 0.006 * k)) }
      surf(ch, earS(1), N(18, q), N(18, q), O(mixc(FUR, FURD, 0.2), SM.fur, wHead, head, { su: 0.12, sv: 0.09, wrapU: false }))
      surf(ch, earS(-0.6), N(18, q), N(18, q), O((_p, u, v) => mixc(hx('#d0949a'), hx('#7a4a4a'), 0.4 * (1 - Math.abs(u - 0.5) * 2) * (1 - v)), SM.skin, wHead, head, { flip: true, su: 0.12, sv: 0.09 }))
      const rim: V3[] = []; for (let i = 0; i <= 16; i++) { const t = i / 16; rim.push(t < 0.5 ? earS(0.2)(0, t * 2 * 0.98) : earS(0.2)(1, (1 - t) * 2 * 0.98)) }
      tube(ch, rim, 0.0045, N(6, q), vo(O(mixc(FUR, FURD, 0.2), SM.fur, wHead, head)), false)
      for (let i = 0; i < 7; i++) { const p = earS(-0.3)(0.3 + 0.4 * noise3(i, s, 7), 0.04 + 0.25 * noise3(i, s, 8)); bristle(ch, p, add(up, scl(fwd, 0.9)), 0.014, 0.0007, 0.2, vo(O(hx('#efe8dc'), SM.fur, wHead, head))) }
    }
    // 纽扣眼（第一版大小 / 位置）：四孔树脂纽扣 + 粗线十字缝进皮里，眼周皮被线拉皱，线头垂下
    for (const [ex, ey, er, tile] of EYES) {
      const z = Hc[2] + HR[2] * Math.sqrt(Math.max(0, 1 - (ex / HR[0]) ** 2 - ((ey - Hc[1]) / HR[1]) ** 2))
      const n = nrm([ex / HR[0] ** 2, (ey - Hc[1]) / HR[1] ** 2 * 0.6, (z - Hc[2]) / HR[2] ** 2]), p: V3 = [ex, ey, z + 0.002], B = basisFromZ(n)
      button(c, p, n, er, tile, wHead, head)
      const th = vo(O(hx('#6a1018'), SM.cloth, wHead, head, { rough: 0.9 }))
      const hole = (i: number): V3 => { const a = Math.PI / 4 + (i * Math.PI) / 2; return add(add(p, scl(n, 0.006 + er * 0.12)), toB(B, [Math.cos(a) * er * 0.34, Math.sin(a) * er * 0.34, 0])) }
      tube(ch, [hole(0), add(scl(add(hole(0), hole(2)), 0.5), scl(n, 0.002)), hole(2)], 0.0018, 4, th, false)
      tube(ch, [hole(1), add(scl(add(hole(1), hole(3)), 0.5), scl(n, 0.002)), hole(3)], 0.0018, 4, th, false)
      for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2, out = add(p, toB(B, [Math.cos(a) * er * 1.25, Math.sin(a) * er * 1.25, -0.003])); tube(ch, [hole(i), add(scl(add(hole(i), out), 0.5), scl(n, er * 0.22)), out], 0.0016, 4, th, false) }
      // 皮被线拉出的放射皱（深色细褶环）
      const tail = add(p, toB(B, [er * 0.9, -er * 1.05, 0.003])); tube(ch, [tail, add(tail, [0.004, -0.014, 0.003]), add(tail, [0.002, -0.026, 0.001])], 0.0013, 4, th, false)
    }
  })
  // ---------------- 小高礼帽（第一版：子弹头帽身 r 0.06 × 0.24、帽檐 r 0.11，轴向外倾）真丝长绒 + 罗缎帽带（$$ 卡三处）
  mark('hat', () => {
    const wH = sk.rigid('hat'), fb = sk.idx('hat'), b0: V3 = [0.085, 1.845, 0.0], ax = nrm([0.32, 1, -0.05])
    const B = basisFromZ(ax, [0, 0, 1])
    surf(ch, (u, v) => { const a = u * Math.PI * 2, r = 0.06 + v * 0.05, curl = 0.008 * sstep(0.6, 1, v) ** 2; return add(b0, toB(B, [Math.sin(a) * r, Math.cos(a) * r, 0.0 + curl])) }, N(56, q), N(8, q), O(HAT, SM.velvet, wH, fb, { su: 0.6, sv: 0.08 }))
    surf(ch, (u, v) => { const a = u * Math.PI * 2, r = 0.06 + v * 0.05, curl = 0.008 * sstep(0.6, 1, v) ** 2; return add(b0, toB(B, [Math.sin(a) * r, Math.cos(a) * r, -0.004 + curl])) }, N(56, q), N(8, q), O(mixc(HAT, [0, 0, 0], 0.3), SM.velvet, wH, fb, { su: 0.6, sv: 0.08, flip: true }))
    const rimP: V3[] = []; for (let i = 0; i <= 56; i++) { const a = (i / 56) * Math.PI * 2; rimP.push(add(b0, toB(B, [Math.sin(a) * 0.11, Math.cos(a) * 0.11, 0.006]))) }
    tube(ch, rimP, 0.0034, N(6, q), vo(O(HAT, SM.velvet, wH, fb)), false)
    // 子弹头帽身：圆柱 → 圆顶
    surf(ch, (u, v) => { const a = u * Math.PI * 2, h = v * 0.24; const r = 0.06 * (h < 0.17 ? 1 : Math.sqrt(Math.max(0, 1 - ((h - 0.17) / 0.07) ** 2))) * (1 + 0.04 * (h / 0.24)); return add(b0, toB(B, [Math.sin(a) * r, Math.cos(a) * r, h])) }, N(56, q), N(30, q), O((p) => mixc(HAT, hx('#2a2430'), 0.12 * noise3(p[0] * 300, p[1] * 40, p[2] * 300)), SM.velvet, wH, fb, { su: 0.4, sv: 0.25, flip: true }))
    // 帽带（深色罗缎底 + $$ 图案带）
    surf(ch, (u, v) => { const a = u * Math.PI * 2, h = 0.006 + v * 0.06; return add(b0, toB(B, [Math.sin(a) * 0.0612, Math.cos(a) * 0.0612, h])) }, N(56, q), N(2, q, 1), O(hx('#2a0a12'), SM.cloth, wH, fb, { su: 0.4, sv: 0.06, flip: true }))
    surf(ch, (u, v) => { const a = u * Math.PI * 2, h = 0.012 + v * 0.045; return add(b0, toB(B, [Math.sin(a) * 0.0618, Math.cos(a) * 0.0618, h])) }, N(48, q), N(2, q, 1), { col: [1, 1, 1], mat: SM.ball, w: wH, fb, flip: true, uv: (u, v) => [TILES.hat[0] + (1 - ((u * 3) % 1)) * TILES.hat[2], TILES.hat[1] + v * TILES.hat[3]] })
  })
  // ---------------- 斗篷（第一版钟形 + 8 尖角下摆 + 金边）：深酒红厚呢、下段竖褶、暗红缎里
  const hemY = (u: number) => 0.84 + 0.13 * tri(u * 8 + 0.5)
  const CT = PROS_CLOAK_CT
  const drape = (u: number, v: number) => 1 + (0.035 * Math.sin(u * Math.PI * 2 * 16 + 0.5 + noise3(u * 7, 0, 3) * 2) + 0.012 * Math.sin(u * Math.PI * 2 * 32)) * (1 - v) ** 1.6
  const cloakS = (k: number): PS => (u, v) => { const y = 0.84 + 0.76 * v + (hemY(u) - 0.84) * (1 - v) ** 4; const dk = drape(u, v); const [x, z] = ring(u, tab(CT, v, 1) * k * dk, tab(CT, v, 2) * k * dk, 2); return [x, y, z + 0.01 * v] }
  const wC = sk.auto(['hips', 'spine', 'chest', 'neck', 'skirt0', 'skirt1', 'skirt2', 'skirt3'], 0.06)
  mark('cloak', () => {
    surf(ch, cloakS(1), N(128, q), N(46, q), O((p) => mixc(CLOAK, hx('#14060a'), 0.22 * noise3(p[0] * 9, p[1] * 9, p[2] * 9)), SM.cloth, wC, sk.idx('spine'), { su: 2.2, sv: 0.8 }))
    surf(ch, (u, v) => cloakS(0.975)(u, v * 0.45), N(128, q), N(12, q), O(LINING, SM.velvet, wC, sk.idx('hips'), { flip: true, su: 2.2, sv: 0.35 }))
    const hem: V3[] = []; for (let i = 0; i <= 192; i++) hem.push(cloakS(1.005)(i / 192, 0.002))
    tube(ch, hem, 0.0065, N(7, q), vo(O(GOLD, SM.metal, wC, sk.idx('hips'), { metal: 0.85, rough: 0.42 })), false)
    blob(ch, [0, 0.98, 0], [0.24, 0.09, 0.22], N(40, q), N(16, q), O(hx('#1a0a10'), SM.cloth, sk.rigid('hips'), sk.idx('hips'), { su: 1.2, sv: 0.3 }))
    // 大领结（第一版尺寸 s 0.95）：金色真丝 + 黑条
    bowTie(c, [0, 1.56, 0.09], 0.95, GOLD, sk.auto(['neck', 'chest'], 0.05), sk.idx('neck'), hx('#141014'), SM.velvet)
    const neckS = limb(ch, [[0, 1.52, 0.01], [0, 1.6, 0.02], [0, 1.66, 0.03]], () => 0.07, N(32, q), N(8, q), O(mixc(FUR, [0.2, 0.15, 0.13], 0.3), SM.fur, sk.auto(['neck', 'head'], 0.04), sk.idx('neck'), { su: 0.45, sv: 0.15 })).S
    shellFur(ch, neckS, N(24, q), N(6, q), O(FUR, SM.shell, sk.auto(['neck', 'head'], 0.04), sk.idx('neck'), { su: 0.45, sv: 0.15 }), 6, () => 0.016, 0.4)
  })
  // ---------------- 右臂（第一版：细长袖从斗篷上部伸出、弯上来）+ 白棉手套握拳裹住烟杆
  mark('arm', () => {
    const wA = sk.auto(['clavR', 'upperArmR', 'foreArmR', 'handR', 'chest'], 0.03)
    limb(ch, [[-0.12, 1.4, 0.04], J.shoulderR, J.elbowR, add(J.wristR, [0, -0.004, 0])], (u, v) => (0.04 - 0.012 * v) * (1 + clothFold(u, v, { kink: 0.55, inner: 0.5, twist: 1, hem: 0.5 })), N(32, q), N(48, q), O(CLOAK, SM.cloth, wA, sk.idx('upperArmR'), { su: 0.25, sv: 0.7 }))
    const wh = sk.rigid('handR'), fb = sk.idx('handR'), C = add(J.wristR, PROS_GRIP_OFF)
    // 手套翻口：套住袖口末端（内径 > 袖径 0.028），上沿收进掌根
    lathe(ch, J.wristR, nrm(sub(J.handTipR, J.wristR)), [[0.031, -0.026], [0.037, -0.018], [0.039, -0.004], [0.034, 0.006], [0.026, 0.012]], N(28, q), vo(O(GLOVE, SM.cloth, wh, fb)))
    lathe(ch, J.wristR, nrm(sub(J.handTipR, J.wristR)), [[0.026, 0.012], [0.03, -0.01], [0.031, -0.026]], N(28, q), vo(O(mixc(GLOVE, [0, 0, 0], 0.12), SM.cloth, wh, fb)))
    blob(ch, add(C, PROS_PALM.off), PROS_PALM.r, N(24, q), N(16, q), O(GLOVE, SM.cloth, wh, fb, { su: 0.2, sv: 0.15 }), (d) => 1 - 0.12 * Math.max(0, d[2]))
    const rr = 0.0215, at = (x: number, th: number, r = rr): V3 => add(C, [x, Math.sin(th) * r, Math.cos(th) * r])
    const FX = [0.027, 0.009, -0.009, -0.026], FR = [0.0092, 0.0097, 0.0092, 0.0082], FE = [1, 1.06, 1, 0.82]
    FX.forEach((x, i) => { const P: V3[] = [at(x * 1.05, 0.78 * Math.PI, 0.03), at(x, 0.5 * Math.PI), at(x, 0.12 * Math.PI), at(x, -0.28 * Math.PI * FE[i]), at(x * 0.95, -0.55 * Math.PI * FE[i], rr * 0.85)]; limb(ch, P, (_u, v) => FR[i] * (1 + 0.1 * Math.exp(-(((v - 0.42) / 0.06) ** 2)) + 0.08 * Math.exp(-(((v - 0.7) / 0.05) ** 2))) * roundEnds(v, 0.0, 0.12), N(10, q), N(18, q), O(GLOVE, SM.cloth, wh, fb, { su: 0.06, sv: 0.08 })) })
    limb(ch, [add(C, [0.042, -0.045, -0.012]), add(C, [0.046, -0.026, 0.012]), add(C, [0.036, -0.008, 0.026]), add(C, [0.02, 0.0, 0.03])], (_u, v) => 0.0105 * roundEnds(v, 0, 0.15), N(10, q), N(14, q), O(GLOVE, SM.cloth, wh, fb, { su: 0.06, sv: 0.08 }))
    for (const x of [0.018, 0, -0.018]) tube(ch, [add(C, [x, -0.06, -0.037]), add(C, [x * 1.1, -0.03, -0.04]), add(C, [x * 1.1, -0.01, -0.035])], 0.0011, 4, vo(O(mixc(GLOVE, [0, 0, 0], 0.25), SM.cloth, wh, fb)), false)
  })
  // ---------------- 8 条细杆腿（第一版杆径 0.021→0.015）：胡桃木杆 + 黄铜铰链（膝 / 踝 / 足关节）+ 铜脚套
  mark('legs', () => {
    for (const s of [1, -1]) for (let i = 0; i < 4; i++) {
      const S = s > 0 ? 'L' : 'R', nm = `leg${S}${i + 1}`
      const P = ['Hip', 'Knee', 'Ankle', 'Foot', 'Tip'].map((k) => J[nm + k])
      const wL = sk.auto([nm + 'a', nm + 'b', nm + 'c', nm + 'd'], 0.008)
      limb(ch, [add(P[0], [0, 0.04, 0]), P[0], P[1], P[2], P[3], P[4]], (_u, v) => 0.021 - 0.006 * v, N(14, q), N(56, q), O((p) => mixc(WOOD, hx('#2a1810'), 0.3 * noise3(p[0] * 30, p[1] * 3, p[2] * 30)), SM.wood, wL, sk.idx(nm + 'b'), { su: 0.12, sv: 1.2 }))
      for (const [k, b] of [[1, 'b'], [2, 'c'], [3, 'd']] as const) { const ax2 = nrm(cross(sub(P[k + 1], P[k]), sub(P[k - 1], P[k]))); lathe(ch, add(P[k], scl(ax2, -0.027)), ax2, [[0, 0], [0.023, 0], [0.027, 0.006], [0.027, 0.048], [0.023, 0.054], [0, 0.054]], N(18, q), vo(O(BRASS, SM.metal, sk.rigid(nm + b), sk.idx(nm + b), { metal: 1, rough: 0.35 }))); lathe(ch, add(P[k], scl(ax2, -0.031)), ax2, [[0, 0], [0.007, 0], [0.007, 0.062], [0, 0.062]], N(8, q), vo(O(hx('#5a4a30'), SM.metal, sk.rigid(nm + b), sk.idx(nm + b), { metal: 1 }))) }
      const ax = nrm(sub(P[4], P[3]))
      lathe(ch, add(P[4], scl(ax, -0.05)), ax, [[0.017, 0], [0.02, 0.005], [0.02, 0.04], [0.016, 0.05], [0, 0.052]], N(14, q), vo(O(BRASS, SM.metal, sk.rigid(nm + 'd'), sk.idx(nm + 'd'), { metal: 1, rough: 0.35 })))
    }
  })
}

/** 假肢人钟形斗篷截面表 [v, 半宽 x, 半深 z]（y = 0.84 + 0.76v；check 用来验臂不穿斗篷） */
export const PROS_CLOAK_CT = [[0, 0.44, 0.38], [0.15, 0.42, 0.36], [0.35, 0.33, 0.29], [0.55, 0.2, 0.18], [0.75, 0.115, 0.105], [0.9, 0.082, 0.075], [1, 0.07, 0.065]]
export const prosCloakRadius = (y: number): [number, number] => { const v = Math.max(0, Math.min(1, (y - 0.84) / 0.76)); return [tab(PROS_CLOAK_CT, v, 1) * 1.04, tab(PROS_CLOAK_CT, v, 2) * 1.04] }
/** Billy 蝴蝶结中心方向（球心出发，世界坐标）：球下缘前方、两大腿根之前 */
export const BILLY_BOW_DIR: V3 = [0, -0.62, 0.785]
// ============================================================ Billy（ref4）
export function buildBilly(c: BuildCtx) {
  // 第三轮（ref4）：身体就是一颗巨大的 4 号台球（球即躯干：无胸腹 / 西装 / 脖子）。四肢从球面直接长出，根部一圈湿润皮肉包边嵌进球面；
  // 球前下方一个大蝴蝶结；标签圆下缘一道嘴缝（肉唇包边），湿舌从缝里垂出盖过领结。半蹲：右手（x<0）举起托 11 号球，左手爪搭在左膝上。
  const { ch, sk, q, R, mark } = c
  const J = R.J
  const SKIN = hx('#8a6a6e'), SKIND = hx('#5a4048'), FLESH = hx('#a8606a'), RAW = hx('#6a2430'), NAIL = hx('#cbbf9e'), TONGUE = hx('#a24a56'), SHOE = hx('#191216'), BRASS = hx('#b8913e'), BOWA = hx('#3a1446'), BOWB = hx('#6a4a2a')
  // 第四轮：四肢服装（袖 / 裤腿 / 袖口）与 4 号球同色系紫（球漆 #5b2a8c，布料略深、偏灰，保留羊毛斜纹质感）
  const PURP = hx('#3c1a5e'), PURPD = hx('#24103a'), PURPC = hx('#48206e')
  const purp = (p: V3) => mixc(PURP, PURPD, 0.22 * noise3(p[0] * 40, p[1] * 40, p[2] * 40))
  const Bc = J.ball, BR = BILLY_BALL_R, ballI = sk.idx('ball'), wBall = sk.rigid('ball')
  const BB = basisFromZ(nrm([-0.12, 0.16, 1]))
  const onBall = (d: V3, h = 0): V3 => add(Bc, scl(nrm(d), BR + h))
  const loc = (x: number, y: number): V3 => nrm(toB(BB, [x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y))]))
  const skn = (p: V3) => mixc(mixc(SKIN, SKIND, 0.35 * noise3(p[0] * 90, p[1] * 90, p[2] * 90)), FLESH, 0.18 * noise3(p[0] * 13, p[1] * 13, 7))
  // ---------------- 球身：写实树脂台球（紫、4 号白圆标、清漆 + 划痕在材质）
  mark('ball', () => { ballSphere(ch, Bc, BR, N(150, q), N(104, q), O([1, 1, 1], SM.ball, wBall, ballI), TILES.billy, BB) })
  /** 皮肉包边：球面上绕方向 d0 的一圈肉瓣（内半径 a0 → 外缘 a1(u) 弧度），内厚外薄、边缘湿亮暗红 + 爬上球面的血管 */
  const fleshRim = (d0: V3, a0: number, a1: number, w: WFn, fb: number, veins = 6, seed = 1) => {
    const Bd = basisFromZ(d0), edge = (u: number) => a1 * (0.8 + 0.3 * noise3(u * 9, seed, 2) + 0.08 * Math.sin(u * Math.PI * 2 * 3 + seed))
    const P = (u: number, v: number, h0 = 0): V3 => { const a = u * Math.PI * 2, ang = a0 + (edge(u) - a0) * v, d = toB(Bd, [Math.sin(ang) * Math.cos(a), Math.sin(ang) * Math.sin(a), Math.cos(ang)]); return onBall(d, h0 + 0.03 * (1 - v) ** 1.4 + 0.006 * Math.sin(v * Math.PI) + 0.002) }
    surf(ch, (u, v) => P(u, v), N(48, q), N(10, q), O((_p, _u, v) => mixc(mixc(SKIN, FLESH, 0.45 + 0.2 * (1 - v)), RAW, 0.55 * sstep(0.72, 1, v)), SM.skin, w, fb, { su: 0.5, sv: 0.1, rough: 0.32 }))
    const e: V3[] = []; for (let i = 0; i <= 48; i++) e.push(P(i / 48, 1, 0.0015)); tube(ch, e, 0.0032, N(6, q), vo(O(hx('#6a2a32'), SM.skin, w, fb, { rough: 0.2 })), false)
    const vv = vo(O(hx('#3a1830'), SM.skin, w, fb, { rough: 0.6 }))
    for (let i = 0; i < veins; i++) {
      const a0v = (i / veins) * Math.PI * 2 + 0.6 * noise3(i, seed, 3), pts: V3[] = []
      for (let k = 0; k <= 8; k++) { const t = k / 8, ang = a0 + (edge(a0v / (Math.PI * 2)) * (0.95 + 0.45 * t) - a0) * (0.6 + 0.4 * t), a = a0v + 0.25 * Math.sin(t * 5 + i); pts.push(onBall(toB(Bd, [Math.sin(ang) * Math.cos(a), Math.sin(ang) * Math.sin(a), Math.cos(ang)]), 0.0022)) }
      tube(ch, pts, pts.map((_, k) => 0.0042 * (1 - 0.7 * k / 8)), 4, vv, false)
    }
  }
  // ---------------- 嘴缝（标签圆下缘）：肉唇包边 + 湿暗口腔；舌头从中间垂出
  const MC = loc(0, -0.085)
  mark('mouth', () => {
    const MB = basisFromZ(MC, toB(BB, [0, 1, 0])), wM = sk.auto(['ball', 'tongue1'], 0.04)
    const lip = (u: number, k: number): V3 => { const a = u * Math.PI * 2; return onBall(add(MC, toB(MB, [Math.cos(a) * 0.23 * k, Math.sin(a) * 0.05 * k, 0])), 0.006 + 0.006 * (k > 1 ? 0 : 1)) }
    surf(ch, (u, v) => { const a = u * Math.PI * 2, k = 0.55 * (1 - v); return onBall(add(MC, toB(MB, [Math.cos(a) * 0.2 * k, Math.sin(a) * 0.045 * k, 0])), -0.012 * (1 - v * 0.2)) }, N(32, q), N(4, q, 2), O(hx('#2a0a10'), SM.skin, wM, ballI, { rough: 0.12, flip: true }))
    for (const k of [0.92, 1.12]) { const pts: V3[] = []; for (let i = 0; i <= 40; i++) pts.push(lip(i / 40, k)); tube(ch, pts, k < 1 ? 0.013 : 0.009, N(10, q), vo(O(k < 1 ? hx('#5e1c26') : mixc(SKIN, FLESH, 0.55), SM.skin, wM, ballI, { rough: k < 1 ? 0.4 : 0.55 })), false) }
    // 唾液丝
    tube(ch, [lip(0.86, 0.95), add(lip(0.82, 0.95), [0.004, -0.05, 0.01]), add(lip(0.8, 0.95), [0.002, -0.08, 0.02])], [0.0016, 0.0009, 0.0005], 4, vo(O(hx('#d8c8c8'), SM.skin, wM, ballI, { rough: 0.05 })), false)
  })
  mark('tongue', () => {
    const t0 = onBall(MC, -0.03), t1 = onBall(MC, 0.03), down: V3 = [0, -1, 0]
    const P: V3[] = [t0, t1, add(t1, [0.004, -0.045, 0.05]), add(t1, [0.01, -0.11, 0.075]), add(t1, [0.016, -0.17, 0.072]), add(t1, [0.02, -0.205, 0.058])]
    void down
    const tc = (_p: V3, u: number, v: number) => { const top = Math.cos(u * Math.PI * 2) > 0 ? 1 : 0, groove = Math.exp(-(((u % 1) / 0.03) ** 2)) + Math.exp(-((((u % 1) - 1) / 0.03) ** 2)); return mixc(mixc(TONGUE, hx('#7a2a3a'), (1 - top) * 0.55 + groove * 0.4), hx('#e8a0a4'), 0.16 * top * noise3(u * 60, v * 80, 3)) }
    limb(ch, P, (u, v) => { const a = u * Math.PI * 2; return (0.017 + 0.007 * v) * ell(u, 1, 2.6 + 0.6 * v) * (1 - 0.18 * Math.exp(-((Math.sin(a) / 0.12) ** 2)) * Math.max(0, Math.cos(a))) * roundEnds(v, 0.0, 0.1) }, N(40, q), N(52, q), O(tc, SM.skin, sk.auto(['ball', 'tongue1', 'tongue2', 'tongue3'], 0.03), sk.idx('tongue1'), { su: 0.16, sv: 0.45, rough: 0.16 }), { ref: [0, 0, 1] })
  })
  // ---------------- 大蝴蝶结（球前下方，两翼顺球面弯）：深紫缎 + 金褐斜纹
  mark('bow', () => {
    // 第四轮：移到球体下缘前方、两大腿根前（世界方向 ≈ 前下 50°），整体外推离开球面，舌头不再盖住
    const wB = sk.rigid('bow'), ctrD = nrm(BILLY_BOW_DIR), up: V3 = [0, 1, 0] // 阶段 3：绑到 bow 弹簧骨
    const ctr = onBall(ctrD, 0.05), ctrB = basisFromZ(ctrD, up)
    const stripe = (p: V3) => (Math.sin((dot(p, ctrB.x) * 3 - dot(p, ctrB.y) * 1.2) * 30) > 0.72 ? BOWB : BOWA)
    for (const sd of [1, -1]) {
      const wd = nrm(add(ctrD, scl(ctrB.x, sd * 0.42))), cc = add(onBall(wd, 0.06), scl(ctrD, 0.02)), WB = basisFromZ(nrm(add(wd, ctrD)), up)
      blob(ch, cc, [0.17, 0.11, 0.028], N(44, q), N(28, q), O(stripe, SM.cloth, wB, ballI, { su: 0.5, sv: 0.25 }),
        (d) => { const toKnot = sstep(0.1, 1, -d[0] * sd); return (1 + 0.1 * Math.cos(d[1] * 3.2) * sstep(0.2, 0.9, Math.abs(d[0])) - 0.42 * toKnot ** 1.4 + 0.1 * sstep(0.5, 1, Math.abs(d[1])) * sstep(0, 0.6, d[0] * sd)) * (1 + 0.06 * Math.sin(d[1] * 9.5) * toKnot * Math.max(0, d[2])) }, WB)
    }
    blob(ch, ctr, [0.056, 0.075, 0.045], N(24, q), N(16, q), O(mixc(BOWA, [0, 0, 0], 0.18), SM.cloth, wB, ballI, { su: 0.2, sv: 0.12 }), (d) => 1 + 0.05 * Math.sin(d[1] * 14), ctrB)
  })
  // ---------------- 四肢：从球面直接长出（根部埋进球里 5 cm），根部皮肉包边
  mark('arms', () => {
    for (const s of [1, -1]) {
      const S = s > 0 ? 'L' : 'R'
      const sh = J['shoulder' + S], el = J['elbow' + S], wr = J['wrist' + S], tip = J['handTip' + S]
      const dS = nrm(sub(sh, Bc)), root = add(Bc, scl(dS, BR - 0.06))
      const wA = sk.auto(['ball', 'upperArm' + S, 'foreArm' + S, 'hand' + S], 0.035)
      // 胳膊：灰紫皮肉、三角肌 / 二头肌隆起、肘部皮褶
      limb(ch, [root, sh, el, add(wr, scl(nrm(sub(wr, el)), 0.01))], (u, v) => (0.088 - 0.018 * v + 0.008 * Math.exp(-(((v - 0.28) / 0.12) ** 2))) * (1 + clothFold(u, v, { kink: 0.52, inner: 0.6, twist: s, hem: 0.4 })), N(40, q), N(56, q), O(purp, SM.cloth, wA, sk.idx('upperArm' + S), { su: 0.36, sv: 0.9 }))
      fleshRim(dS, 0.19, 0.36, sk.auto(['ball', 'upperArm' + S], 0.05), ballI, 0, s + 3)
      // 衬衫袖口（ref4 腕上一圈带扣袖口）
      const f = nrm(sub(wr, el)), wh = sk.rigid('hand' + S), fb = sk.idx('hand' + S)
      lathe(ch, add(wr, scl(f, -0.05)), f, [[0.06, 0], [0.074, 0.002], [0.075, 0.046], [0.07, 0.052], [0.056, 0.052]], N(28, q), vo(O(PURPC, SM.cloth, wh, fb)))
      { const side = nrm(cross(f, [0, 0, 1])); lathe(ch, add(add(wr, scl(f, -0.03)), scl(side, 0.072 * s)), scl(side, s), [[0.0, 0], [0.006, 0], [0.006, 0.003], [0, 0.0045]], 10, vo(O(BRASS, SM.metal, wh, fb, { metal: 1 }))) }
      // 爪手：掌 + 四指三节（指节皱）+ 角质弯爪
      const a = nrm(sub(tip, wr))
      limb(ch, [add(wr, scl(a, -0.03)), wr], () => 0.034, N(20, q), N(6, q), O(skn, SM.skin, sk.auto(['hand' + S, 'foreArm' + S], 0.02), fb, { su: 0.2, sv: 0.1 }))
      blob(ch, add(wr, scl(a, 0.05)), [0.045, 0.058, 0.026], N(28, q), N(18, q), O(skn, SM.skin, sk.auto(['hand' + S, 'foreArm' + S], 0.02), fb, { su: 0.2, sv: 0.15 }), (d) => 1 + 0.06 * Math.sin(d[0] * 20) * Math.max(0, d[2]), basisFromZ(nrm(cross(a, [s, 0, 0])), a))
      for (const fn of ['thumb', 'index', 'middle', 'ring']) {
        const b = [1, 2, 3].map((k) => R.seg[sk.idx(fn + k + S)])
        const wf = sk.auto([fn + 1 + S, fn + 2 + S, fn + 3 + S], 0.01)
        limb(ch, [add(b[0].a, scl(sub(b[0].a, b[0].b), 0.3)), b[0].a, b[1].a, b[2].a, add(b[2].a, scl(sub(b[2].b, b[2].a), 0.45))], (u, v) => (0.0145 - 0.004 * v) * (1 + 0.12 * Math.exp(-(((v - 0.38) / 0.05) ** 2)) + 0.12 * Math.exp(-(((v - 0.68) / 0.05) ** 2))) * (1 + 0.04 * Math.sin(u * Math.PI * 2 * 3) * (Math.exp(-(((v - 0.38) / 0.04) ** 2)) + Math.exp(-(((v - 0.68) / 0.04) ** 2)))) * roundEnds(v, 0, 0.08), N(14, q), N(22, q), O(skn, SM.skin, wf, sk.idx(fn + 1 + S), { su: 0.1, sv: 0.12 }))
        const d = nrm(sub(b[2].b, b[2].a)), dn = nrm(cross(d, cross([0, 0, 1], d))), base = add(b[2].a, scl(d, 0.012)), pts: V3[] = []
        for (let k = 0; k <= 8; k++) { const t = k / 8, ang = t * 1.1; pts.push(add(add(base, scl(d, 0.05 * Math.sin(ang) / 1.1 * 1.2)), scl(dn, -0.022 * (1 - Math.cos(ang))))) }
        tube(ch, pts, pts.map((_, k) => 0.0105 * Math.pow(1 - k / 8, 0.85) + 0.0006), N(8, q), vo(O((p) => mixc(NAIL, hx('#6a5a40'), 0.35 * Math.abs(Math.sin(lenv(sub(p, base)) * 260)) + 0.15), SM.dark, sk.rigid(fn + 3 + S), sk.idx(fn + 3 + S), { rough: 0.45 })), false)
      }
    }
  })
  mark('legs', () => {
    for (const s of [1, -1]) {
      const S = s > 0 ? 'L' : 'R'
      const hip = J['hip' + S], kn = J['knee' + S], an = J['ankle' + S]
      const dH = nrm(sub(hip, Bc)), root = add(Bc, scl(dH, BR - 0.07))
      const wL = sk.auto(['ball', 'thigh' + S, 'shin' + S, 'foot' + S], 0.04)
      // 粗短腿：大腿肌肉、膝盖骨、小腿肚，皮肉同手臂
      limb(ch, [root, hip, kn, add(an, [0, 0.02, 0]), an], (u, v) => (0.11 - 0.026 * v + 0.012 * Math.exp(-(((v - 0.28) / 0.14) ** 2))) * (1 + clothFold(u, v, { kink: 0.5, inner: 0.55, twist: -s, hem: 0.85 })), N(44, q), N(56, q), O(purp, SM.cloth, wL, sk.idx('thigh' + S), { su: 0.45, sv: 0.85 }))
      // 裤脚翻边
      { const ax = nrm(sub(kn, an)); lathe(ch, add(an, [0, 0.012, 0]), ax, [[0.082, 0], [0.09, 0.004], [0.09, 0.03], [0.084, 0.034], [0.07, 0.034]], N(28, q), vo(O(PURPC, SM.cloth, sk.auto(['shin' + S, 'foot' + S], 0.04), sk.idx('shin' + S)))) }
      fleshRim(dH, 0.25, 0.44, sk.auto(['ball', 'thigh' + S], 0.06), ballI, 0, s + 7)
      shoe(c, an, J['toe' + S], SHOE, sk.auto(['foot' + S, 'toe' + S], 0.04), sk.idx('foot' + S), 1.08)
    }
  })
}

// ============================================================ 酒保 E164（猩红之眼：猩红长毛肉团 + 三瞳主眼 + 躯干下口器 + 八条带倒刺的腿；酒保装：领结 + 黑金短围裙）
export function buildBartender(c: BuildCtx) {
  const { ch, sk, q, R, mark } = c
  const J = R.J
  const FUR = hx('#8e121c'), FUR2 = hx('#4a060c'), FLESH = hx('#b8505a'), TEETH = hx('#ece0c8'), APRON = hx('#121014'), GOLD = hx('#d6a948')
  const Bc: V3 = [0, 1.16, -0.02], BR: V3 = [0.32, 0.34, 0.3]
  const wBody = sk.auto(['hips', 'spine'], 0.12)
  // ---------------- 毛团：拼凑起伏（维基：多具躯体粗糙拼接）+ 长毛尖
  const bodyS: PS = (u, v) => {
    const d = sph(u, v)
    const lump = 0.07 * (noise3(d[0] * 2.2 + 3, d[1] * 2.2, d[2] * 2.2) - 0.5) * 2
    const strand = 0.012 * Math.pow(noise3(d[0] * 26, d[1] * 9, d[2] * 26), 3) * sstep(-0.2, 0.6, -d[1] + 0.5)
    const k = 1 + lump + strand - 0.12 * sstep(0.3, 1, -d[1])
    return [Bc[0] + d[0] * BR[0] * k, Bc[1] + d[1] * BR[1] * k, Bc[2] + d[2] * BR[2] * k]
  }
  mark('body', () => {
    const furC = (p: V3) => mixc(FUR, FUR2, 0.55 * noise3(p[0] * 30, p[1] * 8, p[2] * 30) + 0.25 * sstep(1.2, 0.85, p[1]))
    surf(ch, bodyS, N(90, q), N(68, q), O((p) => mixc(furC(p), [0.08, 0.01, 0.02], 0.12), SM.fur, wBody, sk.idx('spine'), { su: 1.8, sv: 1.0 }))
    // 长毛：壳体毛（上短下长、重力下垂、毛尖朝后下梳）
    shellFur(ch, bodyS, N(48, q), N(36, q), O(furC, SM.shell, wBody, sk.idx('spine'), { su: 1.8, sv: 1.0 }), 7, (u, v) => { const d = sph(u, v); const nearEye = G2(d[0], 0.5, d[1] - 0.15, 0.45) * Math.max(0, d[2]); return (0.03 + 0.07 * sstep(0.6, -0.4, d[1])) * (1 - 0.8 * nearEye) }, 0.7, (p) => [0, -0.3, (p[2] - Bc[2]) * -0.8])
    // 底部垂下的长毛缕（发束：渐细弯管，湿结成绺）
    const fr = N(70, q, 16)
    // 阶段 3：毛缕下段按方位分到 tuft0..3 弹簧骨
    const iHp = sk.idx('hips'), iT = [0, 1, 2, 3].map((i) => sk.idx('tuft' + i))
    const wTuft: WFn = (p, acc) => { const k = sstep(0.93, 0.76, p[1]); acc.add(iHp, 1 - k + 1e-4); if (k <= 0) return; const a = Math.atan2(p[0], p[2] + 0.02); iT.forEach((b, i) => { let d = Math.abs(a - (i / 4) * Math.PI * 2); d = Math.min(d, Math.PI * 2 - d); const w = Math.max(0, 1 - d / (Math.PI / 2)); if (w > 0) acc.add(b, k * w) }) }
    for (let i = 0; i < fr; i++) {
      const u = (i + 0.5) / fr + 0.01 * noise3(i, 1, 1), v0 = 0.22 + 0.12 * noise3(i, 2, 2), top = bodyS(u, v0), n = snrm(bodyS, u, v0), len = 0.1 + 0.12 * noise3(i * 1.7, 0, 0)
      const pts: V3[] = []; for (let k = 0; k <= 7; k++) { const t = k / 7; pts.push(add(add(top, scl(n, 0.012 + 0.03 * t)), [0.01 * Math.sin(i + t * 3) * t, -len * t * t * 0.9 - len * 0.1 * t, 0])) }
      tube(ch, pts, pts.map((_, k) => 0.009 * (1 - 0.9 * k / 7)), N(5, q, 3), vo(O(mixc(FUR2, FUR, 0.3 * noise3(i, 5, 5)), SM.fur, wTuft, sk.idx('hips'))), false)
    }
  })
  // ---------------- 主眼：三只猩红瞳孔（图集），湿润肉质眼睑圈
  mark('eye', () => {
    const ec: V3 = [0, 1.21, 0.15], er = 0.165, we = sk.rigid('eye'), fb = sk.idx('eye')
    ballSphere(ch, ec, er, N(64, q), N(40, q), O([1, 1, 1], SM.ball, we, fb), TILES.e164Eye, basisFromZ([0, 0.05, 1]))
    const lid = (k: number, tilt: number): V3[] => { const P: V3[] = []; for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; P.push(add(ec, [Math.cos(a) * er * k, Math.sin(a) * er * k * 0.86, 0.085 + tilt * Math.sin(a)])) } return P }
    tube(ch, lid(1.02, 0.01), 0.03, N(18, q), vo(O((p) => mixc(FLESH, hx('#5a1018'), 0.4 * noise3(p[0] * 90, p[1] * 90, p[2] * 90)), SM.skin, sk.auto(['eye', 'spine'], 0.05), fb, { rough: 0.15 })), false)
    tube(ch, lid(1.0, 0.0).map((p, i) => add(p, [0, 0, -0.012 - 0.002 * Math.sin(i)])), 0.012, N(10, q), vo(O(hx('#e8b0a8'), SM.skin, we, fb, { rough: 0.08 })), false)
    tube(ch, lid(1.16, 0.0), 0.034, N(12, q), vo(O(FUR, SM.fur, wBody, sk.idx('spine'))), false)
  })
  // ---------------- 躯干下的口器：一圈尖牙 + 吸血管
  mark('mouth', () => {
    const mc: V3 = [0, 0.86, 0.02], wm = sk.auto(['mouth', 'hips'], 0.03), fb = sk.idx('mouth')
    lathe(ch, mc, [0, -1, 0], [[0.0, 0.03], [0.07, 0.02], [0.11, 0.0], [0.125, -0.012], [0.13, -0.03]], N(36, q), vo(O((p) => mixc(hx('#4a0a10'), hx('#9a3a40'), sstep(0.07, 0.125, Math.hypot(p[0] - mc[0], p[2] - mc[2]))), SM.skin, wm, fb, { rough: 0.12 })), true)
    const nT = N(22, q)
    for (let i = 0; i < nT; i++) { const a = (i / nT) * Math.PI * 2, p = add(mc, [Math.sin(a) * 0.1, -0.012, Math.cos(a) * 0.1]); lathe(ch, p, nrm([-Math.sin(a) * 0.5, -1, -Math.cos(a) * 0.5]), [[0.012, 0], [0.008, 0.02], [0, 0.04]], N(8, q), vo(O(TEETH, SM.dark, wm, fb, { rough: 0.3 }))) }
    limb(ch, [add(mc, [0, 0.02, 0]), add(mc, [0, -0.04, 0.01]), add(mc, [0, -0.08, 0.03])], (_u, v) => 0.018 * (1 - 0.6 * v), N(10, q), N(8, q), O(FLESH, SM.skin, wm, fb, { su: 0.1, sv: 0.1 }))
  })
  // ---------------- 酒保装：领结（眼下）+ 黑金短围裙
  mark('attire', () => {
    bowTie(c, [0, 0.99, 0.3], 0.6, hx('#141014'), sk.auto(['spine', 'hips'], 0.08), sk.idx('spine'), GOLD, SM.velvet)
    // 半身围裙：贴着毛团前下方（patch 在 bodyS 上），金边 + 腰带
    const wA = sk.auto(['hips', 'spine'], 0.1)
    patch(ch, bodyS, -0.17, 0.17, 0.17, 0.4, N(30, q), N(14, q), O((_p, u, v) => (v < 0.08 || u < 0.04 || u > 0.96 ? GOLD : APRON), SM.cloth, wA, sk.idx('hips'), { su: 1.8, sv: 1.0 }), 0.06)
    const band: [number, number][] = []; for (let i = 0; i <= 24; i++) band.push([-0.5 + i / 24, 0.4])
    seam(ch, bodyS, band, 0.06, 9, 0.001, 0.011, vo(O(APRON, SM.cloth, wA, sk.idx('hips'))), false, true)
  })
  // ---------------- 8 条腿：猩红短毛 + 黑色倒刺；1 号腿抬起当手（末端两指爪，props 挂 clawL / clawR）
  mark('legs', () => {
    for (const s of [1, -1]) for (let i = 0; i < 4; i++) {
      const S = s > 0 ? 'L' : 'R', nm = `leg${S}${i + 1}`
      const P = ['Hip', 'Knee', 'Ankle', 'Foot', 'Tip'].map((k) => J[nm + k])
      const wL = sk.auto([nm + 'a', nm + 'b', nm + 'c', nm + 'd'], 0.012)
      const lg = limb(ch, [add(P[0], scl(nrm(sub(P[0], [0, P[0][1], 0])), -0.06)), P[0], P[1], P[2], P[3], P[4]], (_u, v) => (0.042 - 0.03 * v) * (1 + 0.15 * Math.exp(-(((v - 0.3) / 0.05) ** 2))) * roundEnds(v, 0, 0.03), N(16, q), N(52, q), O((p) => mixc(FUR, FUR2, 0.5 * noise3(p[0] * 40, p[1] * 40, p[2] * 40)), SM.fur, wL, sk.idx(nm + 'b'), { su: 0.2, sv: 1.6 }))
      // 倒刺：沿腿外侧一排短黑刺
      const nb = N(16, q, 3)
      for (let k = 0; k < nb; k++) {
        const v = 0.3 + (k / nb) * 0.6, f = lg.at(v), out = nrm(add(f.b, scl(f.n, 0.3)))
        const p = add(f.p, scl(out, 0.03 - 0.02 * v)), bn = v < 0.45 ? 'b' : v < 0.8 ? 'c' : 'd'
        lathe(ch, p, nrm(add(out, scl(f.t, 0.8))), [[0.0045, 0], [0.003, 0.008], [0.0, 0.02]], 6, vo(O(hx('#1a0a08'), SM.dark, sk.rigid(nm + bn), sk.idx(nm + bn), { rough: 0.4 })))
      }
      if (i === 0) {
        // 前腿末端：两根对生的钳指（握摇酒壶 / 抹布）
        const cl = 'claw' + S, tip = P[4], d = nrm(sub(P[4], P[3]))
        for (const sg of [1, -1]) lathe(ch, tip, nrm(add(d, [0, sg * 0.6, 0])), [[0.01, 0], [0.008, 0.025], [0, 0.045]], N(8, q), vo(O(hx('#200608'), SM.dark, sk.rigid(cl), sk.idx(cl))))
      }
    }
  })
}
void [clamp, pipe, disc, box, toB, cross, rot, noise3, PROS_LEGS, E164_LEGS] as unknown
export type { Basis }
