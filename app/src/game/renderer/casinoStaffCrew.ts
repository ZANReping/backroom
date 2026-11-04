// [casino] 背景员工（低模群众，8–15k 三角形）：半人形，头换成赌场物件（方案 §3）。统一赌场制服（品红 / 黑 / 金），按调色板换色复用。
//   dealer 荷官：骰子头（象牙圆角方块 + 品红点）、白衬衫袖 + 金袖箍、品红绒马甲（金边）、黑裤、白手套
//   waiter 侍应 / 发筹码员：轮盘头（胡桃木轮 + 37 格转盘面 + 金转塔，骨 wheel 可自转）、品红绒短外套、白手套（托盘在 props）
//   guard  保安：老虎机头（圆角机箱 + 777 滚轮窗自发光 + 顶灯 + 侧拉杆，骨 reel1..3 / lever）、黑西装 + 品红领带 + 金徽章，更壮
import { SM, hx, mixc, sstep, surf, blob, limb, roundEnds, ballSphere, vo, tube, lathe, disc, box, basisFromZ, toB, add, sub, scl, nrm, type V3, type SOpt, type PS, type WFn } from './casinoStaffKit'
import { TILES } from './casinoStaffMat'
import { shoe, clothFold } from './casinoStaffHeroes'
import type { BuildCtx } from './casinoStaffMesh'
import type { StaffWho } from './casinoStaffRig'

export interface CrewPalette { name: string; primary: string; trim: string; dark: string; shirt: string; accent: string }
/** 0 品红主色 / 1 黑金（反色）/ 2 酒红金 —— 同一套几何换顶点色复用 */
export const CREW_PALETTES: CrewPalette[] = [
  { name: '品红 · 黑 · 金', primary: '#b0186a', trim: '#d9b25a', dark: '#141014', shirt: '#f1ebe0', accent: '#b0186a' },
  { name: '黑 · 金 · 品红', primary: '#1c1418', trim: '#d9b25a', dark: '#0e0a0c', shirt: '#efe6d8', accent: '#d0207c' },
  { name: '酒红 · 金', primary: '#6e1030', trim: '#e0b860', dark: '#181012', shirt: '#f3ece0', accent: '#e0b860' },
]
const N = (x: number, q: number, min = 3) => Math.max(min, Math.round(x * q))
const O = (col: SOpt['col'], mat: number, w: WFn, fb: number, x: Partial<SOpt> = {}): SOpt => ({ col, mat, w, fb, ...x })
const tab = (T: number[][], y: number, k: number) => { if (y <= T[0][0]) return T[0][k]; for (let i = 1; i < T.length; i++) if (y <= T[i][0]) { const t = (y - T[i - 1][0]) / (T[i][0] - T[i - 1][0]); const s = t * t * (3 - 2 * t); return T[i - 1][k] + (T[i][k] - T[i - 1][k]) * s } return T[T.length - 1][k] }
const ring = (u: number, w: number, d: number, e = 2): [number, number] => { const a = u * Math.PI * 2, s = Math.sin(a), c = Math.cos(a); const f = (x: number) => Math.sign(x) * Math.pow(Math.abs(x), 2 / e); return [w * f(s), d * f(c)] }

export function buildCrew(c: BuildCtx, who: StaffWho, pal: CrewPalette) {
  const { ch, sk, q, R, mark } = c
  const J = R.J
  const P = hx(pal.primary), TR = hx(pal.trim), DK = hx(pal.dark), SH = hx(pal.shirt), AC = hx(pal.accent)
  const guard = who === 'guard', k = guard ? 1.12 : 1
  const jacket = who !== 'dealer' // dealer 只穿马甲，袖子是衬衫
  const torsoCol = guard ? DK : P, sleeveCol = who === 'dealer' ? SH : guard ? DK : P, glove = guard ? hx('#141014') : hx('#f4f1ea')
  const torsoMat = SM.cloth, sleeveMat = SM.cloth
  // ---------------- 躯干（马甲 / 外套）+ 前襟金边 + 纽扣
  const y0 = J.hips[1] - 0.12, y1 = J.neck[1] + 0.02
  const TT = [[0, 0.172, 0.128], [0.25, 0.158, 0.112], [0.5, 0.17, 0.118], [0.72, 0.19 * k, 0.125], [0.85, 0.19 * k, 0.118], [0.94, 0.12, 0.085], [1, 0.068, 0.062]]
  const torsoS: PS = (u, v) => { const y = y0 + (y1 - y0) * v; const [x, z] = ring(u, tab(TT, v, 1), tab(TT, v, 2), 2.4); const fo = 1 + clothFold(u, v, { kink: 0.32, inner: 0, amp: 0.35 }); return [x * fo, y, (z - 0.01) * fo] }
  const wT = sk.auto(['hips', 'spine', 'chest', 'neck', 'clavL', 'clavR'], 0.05)
  mark('torso', () => {
    surf(ch, torsoS, N(48, q), N(30, q), O(torsoCol, torsoMat, wT, sk.idx('chest'), { su: 1.0, sv: 0.6 }))
    // 衬衫前襟（荷官马甲 V 口露白）+ 前襟金线
    if (who === 'dealer') surf(ch, (u, v) => { const vv = 0.5 + v * 0.47, w = 0.075 * (vv - 0.5) / 0.47; return add(torsoS((u - 0.5) * 2 * w, vv), scl(nrm([((u - 0.5) * 2 * w) * 6, 0, 1]), 0.0025)) }, N(6, q), N(8, q), O(SH, SM.cloth, wT, sk.idx('chest'), { su: 0.1, sv: 0.3 }))
    if (!guard) { const fl: V3[] = []; for (let i = 0; i <= 10; i++) fl.push(add(torsoS(0, (i / 10) * (who === 'dealer' ? 0.5 : 0.86)), [0, 0, 0.004])); tube(ch, fl, 0.0045, N(4, q), vo(O(TR, SM.metal, wT, sk.idx('chest'), { metal: 1 })), false) }
    for (let i = 0; i < 3; i++) { const v = 0.12 + i * 0.13, p = torsoS(0, v); blob(ch, add(p, [0, 0, 0.006]), [0.011, 0.011, 0.006], N(8, q), N(5, q), O(TR, SM.metal, wT, sk.idx('chest'), { metal: 1, rough: 0.3 })) }
    // 下摆金边
    const hem: V3[] = []; for (let i = 0; i <= 32; i++) hem.push(add(torsoS(i / 32, 0), [0, 0.004, 0]))
    tube(ch, hem, 0.006, N(4, q), vo(O(TR, SM.metal, wT, sk.idx('hips'), { metal: 1 })), false)
    // 领口 + 领结 / 领带
    surf(ch, (u, v) => { const [x, z] = ring(u, 0.06, 0.056); return [x, J.neck[1] - 0.005 + v * 0.04, z + 0.004] }, N(16, q), 1, O(SH, SM.cloth, sk.auto(['neck', 'chest'], 0.04), sk.idx('neck'), { su: 0.4, sv: 0.04 }))
    const nk: V3 = [0, J.neck[1] + 0.005, 0.07]
    if (guard) {
      blob(ch, nk, [0.02, 0.018, 0.012], N(8, q), N(6, q), O(AC, SM.velvet, wT, sk.idx('chest')))
      limb(ch, [nk, add(nk, [0, -0.12, 0.045]), add(nk, [0, -0.3, 0.06])], (u, v) => (0.02 + 0.022 * v) * (Math.abs(Math.cos(u * Math.PI * 2)) * 0.15 + 0.3), N(8, q), N(8, q), O(AC, SM.velvet, wT, sk.idx('chest')), { ref: [0, 0, 1] })
      // 金徽章（左胸）
      const bp = torsoS(0.09, 0.68); lathe(ch, add(bp, [0, 0, 0.004]), [0, 0, 1], [[0, 0.004], [0.022, 0.003], [0.026, 0], [0, 0]], N(10, q), vo(O(TR, SM.metal, wT, sk.idx('chest'), { metal: 1, rough: 0.25 })))
    } else {
      for (const s of [1, -1]) blob(ch, add(nk, [s * 0.04, 0, -0.004]), [0.045, 0.028, 0.014], N(10, q), N(6, q), O(who === 'dealer' ? DK : TR, SM.velvet, wT, sk.idx('chest')))
      blob(ch, add(nk, [0, 0, 0.006]), [0.016, 0.016, 0.012], N(8, q), N(5, q), O(who === 'dealer' ? DK : TR, SM.velvet, wT, sk.idx('chest')))
    }
    // 颈
    limb(ch, [J.chest, J.neck, add(J.head, [0, 0.04, 0])], () => 0.045, N(12, q), N(4, q), O(hx('#d8b090'), SM.skin, sk.auto(['neck', 'head', 'chest'], 0.03), sk.idx('neck'), { su: 0.3, sv: 0.2 }))
  })
  // ---------------- 胳膊 + 手套（连指 + 拇指）
  mark('arms', () => {
    for (const s of [1, -1]) {
      const S = s > 0 ? 'L' : 'R', sh = J['shoulder' + S], el = J['elbow' + S], wr = J['wrist' + S], tip = J['handTip' + S]
      const wA = sk.auto(['clav' + S, 'upperArm' + S, 'foreArm' + S, 'hand' + S, 'chest'], 0.035)
      const sl = limb(ch, [add(sh, [-s * 0.03, 0.02, 0]), sh, el, wr], (u, v) => (0.058 - 0.014 * v) * k * (1 + clothFold(u, v, { kink: 0.5, inner: 0.5, twist: 1, pit: 1, hem: 0.6 })), N(24, q), N(32, q), O(sleeveCol, sleeveMat, wA, sk.idx('upperArm' + S), { su: 0.35, sv: 0.6 }))
      if (who === 'dealer') { const f = sl.at(0.35); lathe(ch, f.p, f.t, [[0.058, -0.012], [0.062, 0], [0.058, 0.012]], N(14, q), vo(O(TR, SM.metal, wA, sk.idx('upperArm' + S), { metal: 1 }))) }
      if (jacket) { const f = sl.at(0.96); lathe(ch, f.p, f.t, [[0.04, -0.02], [0.05 * k, -0.018], [0.05 * k, 0.012], [0.04, 0.014]], N(14, q), vo(O(guard ? DK : TR, guard ? SM.cloth : SM.metal, wA, sk.idx('foreArm' + S), { metal: guard ? 0 : 1 }))) }
      // 写实五指手套：掌（扁椭球，掌心朝内）+ 五指沿指骨（指节鼓起、指尖圆）+ 手背三道缝线
      const wh = sk.auto(['hand' + S, 'foreArm' + S], 0.02), a = nrm(sub(tip, wr)), med: V3 = [-s, 0, 0], fbH = sk.idx('hand' + S)
      limb(ch, [add(wr, scl(a, -0.035)), add(wr, scl(a, 0.01))], (u) => 0.03 * k * (0.8 + 0.2 * Math.abs(Math.cos(u * Math.PI * 2))), N(16, q), N(4, q), O(glove, SM.cloth, wh, fbH, { su: 0.15, sv: 0.05 }))
      blob(ch, add(wr, scl(a, 0.052)), [0.04 * k, 0.05, 0.015 * k], N(24, q), N(16, q), O(glove, SM.cloth, wh, fbH, { su: 0.2, sv: 0.15 }), (d) => 1 + 0.12 * Math.max(0, -d[1]) * (1 - Math.abs(d[2])) , basisFromZ(med, a))
      for (const fn of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
        const bb = [1, 2, 3].map((n) => R.seg[sk.idx(fn + n + S)]), rf = ({ thumb: 0.0105, index: 0.0092, middle: 0.0096, ring: 0.009, pinky: 0.008 } as Record<string, number>)[fn] * k
        limb(ch, [add(bb[0].a, scl(sub(bb[0].a, bb[0].b), 0.35)), bb[0].a, bb[1].a, bb[2].a, bb[2].b], (_u, v) => rf * (1 - 0.15 * v) * (1 + 0.1 * Math.exp(-(((v - 0.3) / 0.06) ** 2)) + 0.08 * Math.exp(-(((v - 0.62) / 0.05) ** 2))) * roundEnds(v, 0, 0.1), N(10, q), N(18, q), O(glove, SM.cloth, sk.auto([fn + 1 + S, fn + 2 + S, fn + 3 + S, 'hand' + S], 0.008), sk.idx(fn + 1 + S), { su: 0.06, sv: 0.08 }))
      }
      for (const z of [-0.014, 0, 0.014]) { const b0 = add(add(wr, scl(a, 0.025)), [s * 0.013 * k, 0, z]), b1 = add(add(wr, scl(a, 0.075)), [s * 0.014 * k, 0, z * 1.2]); tube(ch, [b0, add(scl(add(b0, b1), 0.5), [s * 0.002, 0, 0]), b1], 0.001, 4, vo(O(mixc(glove, [0.5, 0.5, 0.5], 0.3), SM.cloth, wh, fbH)), false) }
    }
  })
  // ---------------- 裤 + 鞋
  mark('legs', () => {
    blob(ch, [0, J.hips[1] - 0.05, -0.01], [0.15 * k, 0.15, 0.1], N(24, q), N(12, q), O(DK, SM.cloth, sk.auto(['hips', 'thighL', 'thighR'], 0.05), sk.idx('hips'), { su: 0.8, sv: 0.4 }), undefined, undefined, 0, 0.75)
    for (const s of [1, -1]) {
      const S = s > 0 ? 'L' : 'R', hip = J['hip' + S], kn = J['knee' + S], an = J['ankle' + S], to = J['toe' + S]
      const wL = sk.auto(['hips', 'thigh' + S, 'shin' + S, 'foot' + S], 0.04)
      limb(ch, [add(hip, [0, 0.06, 0]), hip, kn, an], (u, v) => (0.082 - 0.024 * v) * k * (1 + clothFold(u, v, { kink: 0.5, inner: 0, amp: 0.7, hem: 1.4 }) + 0.022 * Math.exp(-(((u - 0.5) / 0.025) ** 2)) * sstep(0.1, 0.25, v)), N(24, q), N(30, q), O(DK, SM.cloth, wL, sk.idx('thigh' + S), { su: 0.45, sv: 0.9 }))
      shoe(c, an, to, hx('#141012'), sk.auto(['foot' + S, 'toe' + S], 0.04), sk.idx('foot' + S), 1.0 * k)
    }
  })
  // ---------------- 头
  const H = J.head, wHead = sk.rigid('head'), head = sk.idx('head')
  mark('head', () => {
    if (who === 'dealer') {
      // 骰子头：圆角方块（超椭球），六面点数，正面 5
      const c0: V3 = add(H, [0, 0.135, 0.01]), r = 0.125
      const se = (x: number) => Math.sign(x) * Math.pow(Math.abs(x), 0.22)
      surf(ch, (u, v) => { const a = u * Math.PI * 2, l = (v - 0.5) * Math.PI; return add(c0, [se(Math.cos(l)) * se(Math.sin(a)) * r, se(Math.sin(l)) * r, se(Math.cos(l)) * se(Math.cos(a)) * r]) }, N(40, q), N(28, q), O(hx('#f4efe6'), SM.dark, wHead, head, { rough: 0.25 }))
      const pip = (ctr: V3, n: V3) => { const B = basisFromZ(n); blob(ch, add(ctr, scl(n, -0.0035)), [0.017, 0.017, 0.0045], N(14, q), N(8, q), O(AC, SM.dark, wHead, head, { rough: 0.25 }), undefined, B); lathe(ch, add(ctr, scl(n, -0.003)), n, [[0.0185, 0], [0.019, 0.0028], [0.0205, 0.0034]], N(14, q), vo(O(hx('#e8e0d2'), SM.dark, wHead, head, { rough: 0.3 }))) }
      const face = (n: V3, up: V3, pts: [number, number][]) => { const B = basisFromZ(n, up); for (const [x, y] of pts) pip(add(c0, toB(B, [x * 0.062, y * 0.062, r + 0.0005])), n) }
      const P5: [number, number][] = [[0, 0], [-1, -1], [1, 1], [-1, 1], [1, -1]], P3: [number, number][] = [[0, 0], [-1, -1], [1, 1]], P4: [number, number][] = [[-1, -1], [1, 1], [-1, 1], [1, -1]], P6: [number, number][] = [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]]
      face([0, 0, 1], [0, 1, 0], P5); face([1, 0, 0], [0, 1, 0], P3); face([-1, 0, 0], [0, 1, 0], P4); face([0, 0, -1], [0, 1, 0], P6)
      blob(ch, add(c0, [0, r + 0.0005, 0]), [0.03, 0.03, 0.006], N(12, q), N(6, q), O(hx('#c41830'), SM.dark, wHead, head), undefined, basisFromZ([0, 1, 0], [0, 0, 1]))
    } else if (who === 'waiter') {
      // 轮盘头：胡桃木轮体（车削）+ 转盘面（图集）+ 金转塔 + 白珠
      const c0: V3 = add(H, [0, 0.14, 0.02]), ax: V3 = [0, 0, 1], R2 = 0.16
      const ww = sk.auto(['wheel', 'head'], 0.01), wb = sk.rigid('wheel'), fb = sk.idx('wheel')
      lathe(ch, add(c0, [0, 0, -0.045]), ax, [[0.0, 0], [R2 * 0.8, 0.0], [R2, 0.02], [R2 * 1.04, 0.05], [R2, 0.07], [R2 * 0.97, 0.072]], N(40, q), vo(O(hx('#4a2a18'), SM.wood, ww, fb, { rough: 0.35 })))
      surf(ch, (u, v) => { const a = u * Math.PI * 2, r = v * R2 * 0.97, dip = -0.012 * Math.sin(v * Math.PI) ; return add(c0, [Math.sin(a) * r, Math.cos(a) * r, 0.027 + dip + (v < 0.5 ? 0.02 * (1 - v / 0.5) : 0)]) }, N(48, q), N(10, q), { col: [1, 1, 1], mat: SM.ball, w: wb, fb, uv: (u, v) => { const a = u * Math.PI * 2; return [TILES.roulette[0] + (Math.sin(a) * v * 0.5 + 0.5) * TILES.roulette[2], TILES.roulette[1] + (Math.cos(a) * v * 0.5 + 0.5) * TILES.roulette[3]] } })
      lathe(ch, add(c0, [0, 0, 0.045]), ax, [[0.016, 0], [0.012, 0.02], [0.006, 0.05], [0, 0.058]], N(12, q), vo(O(TR, SM.metal, wb, fb, { metal: 1, rough: 0.2 })))
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; tube(ch, [add(c0, [0, 0, 0.075]), add(c0, [Math.sin(a) * 0.045, Math.cos(a) * 0.045, 0.072])], 0.004, 5, vo(O(TR, SM.metal, wb, fb, { metal: 1 }))); blob(ch, add(c0, [Math.sin(a) * 0.048, Math.cos(a) * 0.048, 0.072]), [0.007, 0.007, 0.007], N(6, q), N(4, q), O(TR, SM.metal, wb, fb, { metal: 1 })) }
      blob(ch, add(c0, [0.1, 0.06, 0.03]), [0.009, 0.009, 0.009], N(8, q), N(6, q), O(hx('#fbf8f0'), SM.dark, wb, fb, { rough: 0.2 }))
      // 轮轴架：从颈接到轮背
      limb(ch, [add(H, [0, 0.0, 0]), add(H, [0, 0.07, -0.01]), add(c0, [0, 0, -0.05])], () => 0.022, N(10, q), N(6, q), O(TR, SM.metal, wHead, head, { metal: 1 }))
    } else {
      // 老虎机头：圆角机箱（品红 + 金边）、777 滚轮窗（自发光）、顶灯、侧拉杆
      const c0: V3 = add(H, [0, 0.16, 0.0]), hw = 0.15, hh = 0.16, hd = 0.12
      const se = (x: number) => Math.sign(x) * Math.pow(Math.abs(x), 0.25)
      surf(ch, (u, v) => { const a = u * Math.PI * 2, l = (v - 0.5) * Math.PI; return add(c0, [se(Math.cos(l)) * se(Math.sin(a)) * hw, se(Math.sin(l)) * hh, se(Math.cos(l)) * se(Math.cos(a)) * hd]) }, N(40, q), N(28, q), O((p) => (Math.abs(p[1] - c0[1]) > hh * 0.86 ? TR : P), SM.velvet, wHead, head))
      const wR = sk.auto(['reel1', 'reel2', 'reel3', 'head'], 0.02)
      // 滚轮窗（略凹的屏，3 列）
      surf(ch, (u, v) => add(c0, [(u - 0.5) * 0.23, (v - 0.5) * 0.11, hd + 0.003 - 0.01 * Math.sin(u * Math.PI) * 0]), 18, 4, { col: [1, 1, 1], mat: SM.screen, w: wR, fb: sk.idx('reel2'), uv: (u, v) => [TILES.slot[0] + u * TILES.slot[2], TILES.slot[1] + v * TILES.slot[3]] })
      // 金窗框
      const fr: V3[] = [[-0.12, -0.062, 0], [0.12, -0.062, 0], [0.12, 0.062, 0], [-0.12, 0.062, 0], [-0.12, -0.062, 0]].map((p) => add(c0, [p[0], p[1], hd + 0.006]) as V3)
      tube(ch, fr, 0.007, 5, vo(O(TR, SM.metal, wHead, head, { metal: 1 })), false)
      // 底部投币口 + 顶灯
      box(ch, add(c0, [0, -0.11, hd + 0.002]), [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.03, 0.008, 0.004, vo(O(hx('#0a0808'), SM.dark, wHead, head)))
      lathe(ch, add(c0, [0, hh, 0]), [0, 1, 0], [[0.04, 0], [0.042, 0.01], [0.035, 0.05], [0, 0.07]], N(14, q), vo(O(hx('#ff3040'), SM.dark, wHead, head, { rough: 0.15 })))
      // 拉杆（右侧，骨 lever）
      const wl = sk.rigid('lever'), fl = sk.idx('lever'), lb = add(c0, [hw + 0.01, -0.04, 0])
      lathe(ch, lb, [1, 0, 0], [[0.03, 0], [0.03, 0.025], [0, 0.03]], N(12, q), vo(O(TR, SM.metal, wl, fl, { metal: 1 })))
      tube(ch, [add(lb, [0.025, 0, 0]), add(lb, [0.035, 0.12, 0]), add(lb, [0.035, 0.2, 0])], 0.008, 6, vo(O(hx('#cfd2d8'), SM.metal, wl, fl, { metal: 1, rough: 0.2 })))
      blob(ch, add(lb, [0.035, 0.22, 0]), [0.026, 0.026, 0.026], N(12, q), N(8, q), O(hx('#d0102a'), SM.dark, wl, fl, { rough: 0.2 }))
      limb(ch, [add(H, [0, 0.0, 0]), add(H, [0, 0.03, 0])], () => 0.05, N(12, q), 2, O(DK, SM.cloth, wHead, head))
    }
  })
  void [mixc, sstep, ballSphere, disc]
}
