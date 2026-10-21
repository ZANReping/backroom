// 残缺者（Entity 63「The Mangled」）重制模型——第 1 阶段：静态建模。
// 依据中文维基 entity-63 与用户附图（雾中高过整片郊区的蜘蛛状巨物：黑色红杉般的巨腿直插街道，
// 身躯隐在云里，腹下垂着成束的触须；本体是无数人脸融合而成的团块）。
//
// 分部位建模（ZAN 2026-10-21 要求）：躯体 / 人脸团块 / 8 条腿 / 7 条触须各自是一个 SkinnedMesh，共用同一套骨骼；
// 每个部位两级精度（精细 / 远景），游戏内用 mangledLoader 分帧加载、updateMangledLod 按距离分部位切换。
// 材质：外皮（焦黑湿亮，顶点色 + 程序噪声贴图）、人脸（苍白灰肉色）、碎条（腿上垂挂的破损皮条，双面）。
// 另有 buildMangledShroud()：包裹身躯的体积烟雾（共享 3 种材质的大号公告板），雾中只透出轮廓。
//
// 尺寸（scale=1）：总高约 41m，躯体中心离地 33m（约 18m × 10m × 15m），8 条腿落点半径约 21m；
//   7 条触须各长 18–25m，末端离地 6–12m（下探捕人由第 2 阶段动画完成）。
// 朝向：+X 正面，+Y 向上，原点 = 地面投影点。骨骼静止时只有平移。
import * as THREE from 'three'
import { getMaterialMode, litMaterial, mulberry } from './shared'
import { installL0EnvironmentShader } from './l0EnvironmentShader'
import { installL1DynamicProbe } from './l1Probes'
import { Acc, RigDesc, V, hex, lerp, mixc, newPart, pushV, smooth, sweep, w1, w2, rigBudget } from './rigKit'
import type { Part, RGB, V3, Wt } from './rigKit'

export const MANGLED_BODY = V(0, 33, 0)
export const MANGLED_BODY_R = V(9, 5, 7.5)
export const MANGLED_LEG_AZ = [0.45, 1.15, 1.95, 2.65, -0.45, -1.15, -1.95, -2.65]
export const MANGLED_TENTACLES = 7

/** 低频值噪声（确定性） */
function noise3(x: number, y: number, z: number) {
  const s = Math.sin(x * 1.7 + y * 3.1 + z * 2.3) * 0.5 + Math.sin(x * 4.3 - z * 3.7 + y * 1.3) * 0.3 + Math.sin(y * 6.1 + x * 5.3 - z * 4.9) * 0.2
  return s
}
/** 腿的静止关节：髋（躯体边缘）→ 膝顶 → 胫中 → 足 */
export function mangledLegRest(i: number): V3[] {
  const a = MANGLED_LEG_AZ[i], d = V(Math.cos(a), 0, Math.sin(a)), B = MANGLED_BODY
  const at = (rad: number, y: number) => V(d.x * rad, y, d.z * rad)
  const hipR = Math.hypot(MANGLED_BODY_R.x * d.x, MANGLED_BODY_R.z * d.z) * 0.8
  const reach = 19 + (i % 4 === 1 || i % 4 === 2 ? 3 : 0)
  // “？”形骨节腿：髋部向上外拱，膝顶高出躯体约 13m，绕过顶点向外下钩，再几乎笔直插到地面
  return [at(hipR, B.y + 1.5), at(reach - 6.5, B.y + 13), at(reach + 0.4, B.y - 4), at(reach, 0.2)]
}
/** 腿的几何中线（比骨架关节多两个控制点，用来拱出问号的钩） */
function legCurve(i: number, J: V3[]): V3[] {
  const a = MANGLED_LEG_AZ[i], d = V(Math.cos(a), 0, Math.sin(a))
  const up = J[0].clone().lerp(J[1], 0.45).add(V(0, 3.2, 0)).addScaledVector(d, -1.2)
  const hook = J[1].clone().addScaledVector(d, 4.6).add(V(0, -2.2, 0))
  return [J[0], up, J[1], hook, J[2], J[2].clone().lerp(J[3], 0.5).addScaledVector(d, 0.3), J[3]]
}
/** 触须根部（腹面）与方向 */
function tentacleRoot(k: number, R: () => number): { root: V3; dir: V3; len: number } {
  const a = (k / MANGLED_TENTACLES) * Math.PI * 2 + 0.4, rr = 2.5 + R() * 3.5
  const root = MANGLED_BODY.clone().add(V(Math.cos(a) * rr + 1.5, -MANGLED_BODY_R.y * 0.8, Math.sin(a) * rr * 0.9))
  return { root, dir: V(Math.cos(a) * 0.22, -1, Math.sin(a) * 0.22).normalize(), len: 17 + R() * 6 }
}

// ============================================================================
// 分部位建模：骨架先行（所有部位共用同一套骨骼），各部位各自成一个 SkinnedMesh，可分帧加载、分部位 LOD
// ============================================================================
export type MangledPart = 'body' | 'faces' | 'legs' | 'tentacles'
export const MANGLED_PARTS: MangledPart[] = ['legs', 'body', 'tentacles', 'faces'] // 加载顺序：雾里最先看见腿
/** 每个部位两级精度：0 = 精细，1 = 远景 */
export type Lod = 0 | 1
/** 部位切换到远景精度的距离（米，按 scale=1；实际乘个体缩放） */
export const MANGLED_LOD_DIST: Record<MangledPart, number> = { body: 80, faces: 55, legs: 95, tentacles: 70 }
const charA: RGB = hex('#1c1a1c'), charB: RGB = hex('#3a3236'), ashC: RGB = hex('#6e6466'), raw: RGB = hex('#5a2a2e')

interface MangledSkel { rig: RigDesc; tent: { root: V3; dir: V3; len: number; J: V3[]; D: V3[] }[] }
let SKEL: MangledSkel | undefined
function mangledSkel(): MangledSkel {
  if (SKEL) return SKEL
  const rig = new RigDesc(), R = mulberry(6302)
  const bRoot = rig.bone('root', V(0, 0, 0), -1)
  const bBody = rig.bone('body', MANGLED_BODY, bRoot)
  const bCore = rig.bone('core', MANGLED_BODY.clone().add(V(1, -2, 0)), bBody)
  for (let i = 0; i < 8; i++) { const J = mangledLegRest(i); let par = bBody; for (let s = 0; s < 4; s++) par = rig.bone(`leg${i}_${s}`, J[s], par) }
  const tent: MangledSkel['tent'] = []
  for (let k = 0; k < MANGLED_TENTACLES; k++) {
    const { root, dir, len } = tentacleRoot(k, R)
    const sway = V(R() - 0.5, 0, R() - 0.5).normalize()
    // 章鱼腕的中线：上段微弯下垂，后 38% 段曲率逐渐增大、平滑卷成约 3/4 圈的螺旋（数值积分，处处切线连续）
    const D: V3[] = [], NS = 160, ds = len / NS
    const side = sway.clone().sub(dir.clone().multiplyScalar(sway.dot(dir))).normalize()
    let P = root.clone(), H = dir.clone()
    const k0 = (1.5 * Math.PI) / (2.5 * len * 0.38)
    D.push(P.clone())
    for (let q = 1; q <= NS; q++) {
      const u = q / NS
      const kk = u < 0.62 ? Math.sin(u * 9 + k) * 0.012 : k0 * (1 + 3 * ((u - 0.62) / 0.38))
      const axis = V(0, 0, 0).crossVectors(H, side).normalize() // 朝 side 方向卷
      if (axis.lengthSq() > 0) H.applyAxisAngle(axis, -kk * ds).normalize()
      P = P.clone().addScaledVector(H, ds); D.push(P)
    }
    const J: V3[] = Array.from({ length: 9 }, (_, s) => D[Math.round((s / 8) * NS)].clone())
    let par = bCore
    for (let s = 0; s < 8; s++) par = rig.bone(`ten${k}_${s}`, J[s], par)
    tent.push({ root, dir, len, J, D })
  }
  return (SKEL = { rig, tent })
}
const bi = (name: string) => mangledSkel().rig.names.indexOf(name)

const bodyPt = (th: number, ph: number) => {
  const B = MANGLED_BODY, BR = MANGLED_BODY_R
  const d = V(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph))
  const bump = 1 + 0.16 * noise3(d.x * 2.2, d.y * 2.2, d.z * 2.2) + 0.07 * noise3(d.x * 6, d.y * 6, d.z * 6) + 0.025 * noise3(d.x * 15, d.y * 15, d.z * 15)
  return { d, p: V(d.x * BR.x * bump, d.y * BR.y * bump * (d.y < 0 ? 1.25 : 1), d.z * BR.z * bump).add(B) }
}

/** 躯体：起伏的焦黑团块，下半权重给 core（随人脸团块脉动） */
function* partBody(lod: Lod): Generator<void, Acc> {
  const acc = new Acc(1), bBody = bi('body'), bCore = bi('core')
  const NT = lod ? 26 : 56, NP = lod ? 38 : 88, body = newPart(), BR = MANGLED_BODY_R
  for (let i = 0; i <= NT; i++) {
    yield
    for (let j = 0; j <= NP; j++) {
    const th = (i / NT) * Math.PI, ph = (j / NP) * Math.PI * 2
    const { d, p } = bodyPt(th, ph)
    const k = 0.5 + 0.5 * noise3(p.x * 0.25, p.y * 0.25, p.z * 0.25)
    const scar = Math.sin(p.x * 1.3 + noise3(p.y, p.z, p.x) * 3) > 0.93 ? 0.35 : 0 // 撕裂露肉的条痕
    const c = mixc(mixc(mixc(charA, charB, k), d.y < -0.2 ? raw : ashC, Math.max(0, -d.y - 0.2) * 0.5 + (k > 0.85 ? 0.3 : 0)), raw, scar)
    pushV(body, p, V(d.x / BR.x, d.y / BR.y, d.z / BR.z).normalize(), [j / NP * 6, i / NT * 3], c, w2(bBody, bCore, smooth(0.1, -0.5, d.y)))
  }
  }
  for (let i = 0; i < NT; i++) for (let j = 0; j < NP; j++) { const a = i * (NP + 1) + j, b = a + NP + 1; body.idx.push(a, a + 1, b, b, a + 1, b + 1) }
  renormal(body)
  acc.add(0, body)
  return acc
}
/** 融合人脸团块：铺满腹面与前下方，脸与脸互相挤压叠压 */
function* partFaces(lod: Lod): Generator<void, Acc> {
  const acc = new Acc(1), R = mulberry(6303), bBody = bi('body'), bCore = bi('core'), BR = MANGLED_BODY_R
  const faces = lod ? 40 : 70, grid = lod ? 10 : 22
  for (let f = 0; f < faces; f++) {
    yield
    const th = lerp(Math.PI * 0.42, Math.PI * 0.97, Math.sqrt(R())), ph = R() * Math.PI * 2
    const { d, p } = bodyPt(th, ph)
    const n = V(d.x / BR.x, d.y / BR.y, d.z / BR.z).normalize()
    face(acc, R, p.clone().addScaledVector(n, -0.55), n, 1.3 + R() * 1.3, (R() - 0.5) * 1.3, w2(bBody, bCore, 0.8), grid)
  }
  return acc
}
/** 8 条腿：黑色红杉般的粗糙巨柱，纵棱、扭结、焦痂环与垂挂碎条（第二材质组） */
function* partLegs(lod: Lod): Generator<void, Acc> {
  const acc = new Acc(2), R = mulberry(6304)
  const bone: RGB = hex('#5e5650'), boneHi: RGB = hex('#8a8078')
  for (let i = 0; i < 8; i++) {
    yield
    const J = mangledLegRest(i), bs = [0, 1, 2, 3].map((s) => bi(`leg${i}_${s}`))
    const pts = new THREE.CatmullRomCurve3(legCurve(i, J), false, 'centripetal').getPoints(lod ? 40 : 150)
    // 按弧长定位关节，供权重与骨节
    const L: number[] = [0]; for (let k = 1; k < pts.length; k++) L.push(L[k - 1] + pts[k].distanceTo(pts[k - 1]))
    const tot = L[L.length - 1], n = pts.length - 1
    const near = (P: V3) => { let bk = 0, bd = 1e9; pts.forEach((q, k) => { const dd = q.distanceToSquared(P); if (dd < bd) { bd = dd; bk = k } }); return L[bk] / tot }
    const tK = near(J[1]), tA = near(J[2])
    // 刚性骨段：权重只在关节骨结内 ±0.8% 弧长处过渡，骨段本身不弯（分节动作）
    const bw = 0.008
    const wOf = (t: number): Wt => (t < tK + bw ? w2(bs[0], bs[1], smooth(tK - bw, tK + bw, t)) : t < tA + bw ? w2(bs[1], bs[2], smooth(tA - bw, tA + bw, t)) : w1(bs[2]))
    // 骨节：大关节（髋、膝顶、踝）膨大成骨结；骨段之间每 ~3.2m 一圈节环，节间收细
    const bigKnob = (t: number) => Math.exp(-((t - tK) ** 2) / 0.0012) * 0.75 + Math.exp(-((t - tA) ** 2) / 0.0008) * 0.6 + Math.exp(-(t * t) / 0.002) * 0.4
    const segLen = 3.2 / tot
    const ring = (t: number) => { const u = (t / segLen) % 1; return Math.exp(-((u - 0.5) ** 2) / 0.006) }
    const shaft = (t: number) => (t < tK ? lerp(2.0, 1.25, t / tK) : t < tA ? lerp(1.25, 1.05, (t - tK) / (tA - tK)) : lerp(1.1, 0.7, (t - tA) / (1 - tA)))
    const thick = (t: number) => shaft(t) * (1 + bigKnob(t) + (lod ? 0.12 : 0.28) * ring(t) - 0.08) * (t > 0.97 ? lerp(1, 1.5, (t - 0.97) / 0.03) : 1)
    const sw = sweep(pts, lod ? 10 : 24, (k, a) => {
      const t = L[k] / tot
      const ridge = lod ? 0.08 * Math.sin(a * 3 + i) : 0.07 * Math.sin(a * 4 + k * 0.05 + i) + 0.04 * Math.sin(a * 9 - k * 0.21) + 0.03 * noise3(Math.cos(a) * 2, Math.sin(a) * 2, k * 0.15 + i)
      const rr = thick(t) * (1 + ridge)
      return [Math.cos(a) * rr, Math.sin(a) * rr * 0.9]
    }, {
      col: (k, j) => {
        const t = L[k] / tot, knob = Math.min(1, bigKnob(t) * 1.3 + ring(t) * 0.7), z = 0.5 + 0.5 * Math.sin(k * 0.3 + j * 1.1 + i)
        return mixc(mixc(mixc(charA, charB, z * 0.6), bone, knob * 0.75), boneHi, knob > 0.85 ? 0.35 * z : 0) // 骨节处露出灰白骨色
      },
      w: (k) => wOf(L[k] / tot),
    })
    acc.add(0, sw.part)
    const nShred = lod ? 4 : 14
    for (let s = 0; s < nShred; s++) {
      const t = 0.08 + R() * 0.75, k = Math.floor(t * n), P = pts[k], T = sw.tan[k]
      const side = V(0, 0, 0).crossVectors(T, V(0, 1, 0)); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize()
      const out = side.clone().applyAxisAngle(T, R() * Math.PI * 2), base = P.clone().addScaledVector(out, thick(L[k] / tot) * 0.9)
      shred(acc, base, out, 1.5 + R() * 3.5, 0.25 + R() * 0.4, mixc(ashC, charB, R() * 0.6), wOf(L[k] / tot), lod ? 3 : 7)
    }
  }
  return acc
}
/** 7 条触须：章鱼腕，根部粗 1.7m 渐细至 0.12m；腹面两列吸盘（杯状凸起、中心内凹），末端卷曲 */
function* partTentacles(lod: Lod): Generator<void, Acc> {
  const acc = new Acc(1), S = mangledSkel()
  const cols = lod ? 10 : 24, sucker: RGB = hex('#a89690'), suckIn: RGB = hex('#3a2224')
  for (let k = 0; k < S.tent.length; k++) {
    yield
    const { D } = S.tent[k]
    const bs = Array.from({ length: 8 }, (_, s) => bi(`ten${k}_${s}`))
    const step = lod ? 4 : 1, pts = D.filter((_, q) => q % step === 0), n = pts.length - 1
    const wq = (q: number): Wt => { const f = (q / n) * 8, s = Math.min(7, Math.floor(f)); return s + 1 < 8 ? w2(bs[s], bs[s + 1], smooth(0.5, 1, f - s)) : w1(bs[s]) }
    const rad = (t: number) => lerp(1.7, 0.12, Math.pow(t, 0.7)) * (t < 0.06 ? lerp(1.35, 1, t / 0.06) : 1)
    // 吸盘：腹面（a≈-π/2）两列交错，沿长度按半径等比排布
    const suck = (q: number, a: number) => {
      if (lod) return 0
      const t = q / n, da = Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))
      let best = 0
      for (const [off, ph] of [[-0.38, 0], [0.38, 0.5]]) {
        const pitch = 0.022 + 0.02 * (1 - t), u = ((t / pitch + ph) % 1) - 0.5, v = (da - off) / 0.32
        const r = Math.hypot(u * 2.2, v); if (r < 1) best = Math.max(best, r < 0.55 ? 0.6 - r * 0.6 : (1 - r) * 1.3) // 杯沿凸起，中心内凹
      }
      return best
    }
    const tw = sweep(pts, cols, (q, a) => {
      const t = q / n, rr = rad(t) * (1 + 0.04 * Math.sin(a * 3 + q * 0.2) + 0.16 * suck(q, a))
      return [Math.cos(a) * rr, Math.sin(a) * rr]
    }, {
      col: (q, j) => {
        const a = (j / cols) * Math.PI * 2, belly = Math.max(0, -Math.sin(a)), sk = suck(q, a)
        const base = mixc(mixc(charA, raw, 0.4), mixc(ashC, hex('#7a6662'), belly), belly * 0.8)
        return sk > 0 ? mixc(base, sk > 0.45 ? suckIn : sucker, 0.75) : base
      },
      w: wq,
    })
    acc.add(0, tw.part)
  }
  return acc
}
function renormal(p: Part) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3)); g.setIndex(p.idx); g.computeVertexNormals()
  const nr = g.attributes.normal.array as Float32Array; for (let q = 0; q < nr.length; q++) p.nor[q] = nr[q]
  g.dispose()
}
const PART_BUILD: Record<MangledPart, (lod: Lod) => Generator<void, Acc>> = { body: partBody, faces: partFaces, legs: partLegs, tentacles: partTentacles }
const GEO: Partial<Record<string, { geo: THREE.BufferGeometry; tris: number }>> = {}
export function prepareMangledPart(part: MangledPart, lod: Lod) {
  const key = part + lod
  const hit = GEO[key]; if (hit) return hit
  const job = PART_BUILD[part](lod)
  let step = job.next(); while (!step.done) step = job.next()
  const geo = step.value.build(); geo.computeBoundingSphere()
  return (GEO[key] = { geo, tris: (geo.index ? geo.index.count : geo.attributes.position.count) / 3 })
}

/** 一张融合人脸：网格浮雕（眉弓、鼻梁、颧骨）+ 深色眼窝与张开的嘴；roll 为绕法线的歪斜 */
function face(acc: Acc, R: () => number, c: V3, n: V3, size: number, roll: number, w: Wt, N = 12) {
  const up0 = Math.abs(n.y) > 0.95 ? V(1, 0, 0) : V(0, 1, 0)
  const s = V(0, 0, 0).crossVectors(up0, n).normalize().applyAxisAngle(n, roll), u = V(0, 0, 0).crossVectors(n, s).normalize()
  // 惨叫：绝大多数脸张到极限（下颌脱臼般拉长、嘴是竖椭圆的黑洞），少数半张呻吟
  const scream = R() < 0.85 ? 0.7 + R() * 0.3 : 0.3 + R() * 0.3
  const squeeze = R() < 0.6 // 眼睛死死挤闭 / 否则圆睁成深洞
  const tilt = (R() - 0.5) * 0.5 // 嘴略歪
  const skin: RGB = mixc(mixc(hex('#948a84'), hex('#6c5e5a'), R()), hex('#5a3a3a'), R() * 0.3), dark: RGB = hex('#040203'), gum: RGB = hex('#4a1e22')
  const p = newPart()
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const x = (j / N) * 2 - 1, y0 = (i / N) * 2 - 1 // x 横、y 纵（+ 为额头）
    const y = y0 // 形状场在未拉伸坐标里算，几何上再把下半张脸拉长
    const r2 = x * x * 0.8 + y * y * 0.65
    const g = (dx: number, dy: number, sx: number, sy: number) => Math.exp(-(dx * dx) / sx - (dy * dy) / sy)
    const fall = Math.max(0, 1 - r2)
    const ax = Math.abs(x)
    // 眉：内端被拉高（痛苦），眉心两道竖向皱沟
    const browY = 0.36 + (0.28 - ax) * 0.35
    const brow = g(ax - 0.3, y - browY, 0.05, 0.006) * 0.2
    const furrow = g(ax - 0.06, y - 0.36, 0.0012, 0.02) * 0.09
    const forehead = N > 16 ? 0.02 * Math.sin((y - (0.28 - ax) * 0.4) * 46) * smooth(0.45, 0.6, y) * (1 - ax) : 0 // 横向抬头纹，随眉弯
    // 眼：挤闭时眼窝浅但有放射状褶，圆睁时是深洞
    const eyeD = g(ax - 0.31, y - 0.17, squeeze ? 0.009 : 0.014, squeeze ? 0.0025 : 0.012) * (squeeze ? 0.55 : 1)
    const crow = squeeze && N > 16 ? 0.025 * Math.sin(Math.atan2(y - 0.17, ax - 0.31) * 7) * g(ax - 0.42, y - 0.17, 0.02, 0.02) : 0
    const cheek = g(ax - 0.4, y + 0.02, 0.03, 0.025) * (0.14 + scream * 0.1) // 颧肌上提
    const nose = g(x, y + 0.02, 0.015, 0.09) * 0.26
    const nostril = g(ax - 0.08, y + 0.17, 0.0025, 0.0018) * 0.12
    const nasolab = g(ax - (0.2 + (0.0 - y) * 0.25), y + 0.3, 0.002, 0.06) * 0.1 // 深鼻唇沟
    // 嘴：竖椭圆，张开越大越高；嘴唇向后绷成薄缘，中心是深洞
    const mx = x - tilt * (y + 0.5), my = y + 0.5 + scream * 0.05
    const mw = 0.035 + scream * 0.06, mh = 0.01 + scream * 0.085
    const mouthD = Math.exp(-(mx * mx) / mw - (my * my) / mh)
    const lipRim = Math.exp(-((Math.sqrt((mx * mx) / mw + (my * my) / mh) - 1.35) ** 2) / 0.1) * 0.1
    const teeth = 0
    const jaw = g(x, y + 0.92 + scream * 0.15, 0.06, 0.02) * 0.12 // 下巴被拽长
    const tendon = scream > 0.6 ? g(ax - 0.28, y + 0.95, 0.002, 0.05) * 0.05 : 0 // 颈部绷紧的筋
    const h = (fall * 0.7 + brow + furrow * -1 + forehead + cheek + nose + nasolab * -1 + lipRim + teeth + jaw + tendon + crow - nostril - eyeD * 0.45 - mouthD * (0.6 + scream * 0.9)) * size * Math.min(1, (1.05 - r2) * 3 + 0.1)
    const yStretch = y < -0.1 ? y * (1 + scream * 0.45) + 0.1 * scream * 0.45 : y // 下颌脱开
    const q = c.clone().addScaledVector(s, x * size * 0.75).addScaledVector(u, yStretch * size).addScaledVector(n, h)
    const edge = smooth(0.45, 1.0, r2) // 外缘渐变回焦黑外皮，脸像是从团块里挤出来
    const inner = Math.max(smooth(0.08, 0.32, mouthD), smooth(0.2, 0.6, eyeD) * (squeeze ? 0.6 : 1)) * (r2 < 1 ? 1 : 0)
    const sc = mixc(mixc(skin, gum, Math.min(1, mouthD * 2.2) * 0.6), dark, inner) // 嘴缘先过渡到暗红口腔，再到黑洞
    pushV(p, q, n, [0.5, 0.5], mixc(mixc(sc, hex('#3e2a2c'), furrow * 4 + nasolab * 3), hex('#2a2426'), edge), w)
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const a = i * (N + 1) + j, b = a + N + 1; p.idx.push(a, b, a + 1, b, b + 1, a + 1) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3)); g.setIndex(p.idx); g.computeVertexNormals()
  const nr = g.attributes.normal.array as Float32Array
  // 保证法线朝外
  let dot = 0; for (let q = 0; q < nr.length; q += 3) dot += nr[q] * n.x + nr[q + 1] * n.y + nr[q + 2] * n.z
  if (dot < 0) { for (let q = 0; q < p.idx.length; q += 3) { const t = p.idx[q + 1]; p.idx[q + 1] = p.idx[q + 2]; p.idx[q + 2] = t } for (let q = 0; q < nr.length; q++) nr[q] = -nr[q] }
  p.nor = Array.from(nr)
  acc.add(0, p)
}
/** 垂挂碎条：从附着点先外翻再下垂的扭曲窄带（双面材质） */
function shred(acc: Acc, base: V3, out: V3, len: number, wd: number, c: RGB, w: Wt, N = 5) {
  const p = newPart(), side = V(0, 0, 0).crossVectors(out, V(0, 1, 0)).normalize()
  if (side.lengthSq() < 1e-4) side.set(1, 0, 0)
  for (let i = 0; i <= N; i++) {
    const t = i / N, ctr = base.clone().addScaledVector(out, 0.5 * Math.sin(t * Math.PI * 0.6)).add(V(0, -len * t, 0))
    const ww = wd * (1 - t * 0.7), tw = t * 1.2
    const sd = side.clone().applyAxisAngle(V(0, 1, 0), tw)
    for (const sgn of [-1, 1]) pushV(p, ctr.clone().addScaledVector(sd, sgn * ww), out, [0.5, 0.5], mixc(c, [0, 0, 0], t * 0.4), w)
  }
  for (let i = 0; i < N; i++) { const a = i * 2; p.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
  acc.add(1, p)
}

// ============================================================================
// 贴图与材质
// ============================================================================
let HIDE_TEX: THREE.CanvasTexture | null | undefined
function hideTexture(): THREE.CanvasTexture | null {
  if (HIDE_TEX !== undefined) return HIDE_TEX
  if (typeof document === 'undefined') return (HIDE_TEX = null)
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S
  const g = cv.getContext('2d')!, R = mulberry(63)
  g.fillStyle = '#9a9496'; g.fillRect(0, 0, S, S)
  for (let i = 0; i < 1400; i++) { // 纵向撕裂纹 + 焦痂
    const x = R() * S, y = R() * S, l = 6 + R() * 30, v = 70 + R() * 120
    g.strokeStyle = `rgba(${v},${v * 0.95},${v * 0.95},${0.25 + R() * 0.35})`; g.lineWidth = 0.6 + R() * 2.2
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 4, y + l); g.stroke()
  }
  for (let i = 0; i < 90; i++) { const x = R() * S, y = R() * S, r = 2 + R() * 7; g.fillStyle = `rgba(30,22,24,${0.3 + R() * 0.4})`; g.beginPath(); g.ellipse(x, y, r, r * (0.5 + R()), R() * 3, 0, Math.PI * 2); g.fill() }
  const t = new THREE.CanvasTexture(cv); t.userData.entityShared = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace
  return (HIDE_TEX = t)
}
let SMOKE_TEX: THREE.CanvasTexture | null | undefined
function smokeTexture(): THREE.CanvasTexture | null {
  if (SMOKE_TEX !== undefined) return SMOKE_TEX
  if (typeof document === 'undefined') return (SMOKE_TEX = null)
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S
  const g = cv.getContext('2d')!, R = mulberry(631)
  for (let i = 0; i < 70; i++) {
    const a = R() * Math.PI * 2, d = R() * S * 0.26, x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d, r = S * (0.1 + R() * 0.18)
    const rg = g.createRadialGradient(x, y, 0, x, y, r)
    const v = 150 + R() * 70
    rg.addColorStop(0, `rgba(${v},${v},${v + 4},${0.12 + R() * 0.1})`); rg.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = rg; g.fillRect(0, 0, S, S)
  }
  const t = new THREE.CanvasTexture(cv); t.userData.entityShared = true; t.colorSpace = THREE.SRGBColorSpace
  return (SMOKE_TEX = t)
}
/**
 * 腔体压暗：顶点色很暗的地方（嘴洞、深陷的眼窝）是在吞光的空洞，高光、环境光和探针都不该把它照亮。
 * 把最终颜色乘以由顶点色亮度推出的遮蔽系数；与已有的 onBeforeCompile（环境/探针着色器）串联。
 */
function installCavityShader(m: THREE.Material) {
  const prev = m.onBeforeCompile
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r)
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
#ifdef USE_COLOR
  float cavL = max(vColor.r, max(vColor.g, vColor.b));
  gl_FragColor.rgb *= smoothstep(0.035, 0.2, cavL) * 0.92 + 0.08 * step(0.2, cavL);
#endif`)
  }
  const key = m.customProgramCacheKey?.bind(m)
  m.customProgramCacheKey = () => (key ? key() : '') + '|cavity'
}
interface MangledMats { hide: THREE.Material; face: THREE.Material; shred: THREE.Material }
function mangledMaterials(): MangledMats {
  const mode = getMaterialMode()
  const tex = hideTexture()
  if (tex) tex.repeat.set(1, 1)
  let hide: THREE.Material, face: THREE.Material
  if (mode === 'realistic') {
    hide = litMaterial({ color: '#ffffff', vertexColors: true, ...(tex ? { map: tex, bumpMap: tex, bumpScale: 2 } : {}), roughness: 0.55, envBase: 0.25 })
    face = litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.6, envBase: 0.2 })
  } else {
    hide = new THREE.MeshPhongMaterial({ color: '#ffffff', vertexColors: true, ...(tex ? { map: tex } : {}), shininess: 22, specular: '#3a3436' })
    face = new THREE.MeshPhongMaterial({ color: '#ffffff', vertexColors: true, shininess: 18, specular: '#4a4446' })
    installL0EnvironmentShader(hide); installL1DynamicProbe(hide); installL0EnvironmentShader(face); installL1DynamicProbe(face)
  }
  const shred = litMaterial({ color: '#ffffff', vertexColors: true, side: THREE.DoubleSide, roughness: 0.9, envBase: 0.05 })
  installCavityShader(face)
  return { hide, face, shred }
}

export const mangledPartReady = (part: MangledPart, lod: Lod) => !!GEO[part + lod]
export function* prepareMangledPartJob(part: MangledPart, lod: Lod): Generator<void, void> {
  const key = part + lod
  if (GEO[key]) return
  const acc = yield* PART_BUILD[part](lod)
  yield
  if (GEO[key]) return
  const geo = acc.build(); geo.computeBoundingSphere()
  GEO[key] = { geo, tris: (geo.index ? geo.index.count : geo.attributes.position.count) / 3 }
}
export function* prepareMangledTextures(): Generator<void, void> {
  if (HIDE_TEX === undefined) { yield; hideTexture() }
  if (SMOKE_TEX === undefined) { yield; smokeTexture() }
}

// ============================================================================
// 实例
// ============================================================================
export interface MangledRig { mount: THREE.Group; skeleton: THREE.Skeleton; bones: THREE.Bone[]; byName: Record<string, THREE.Bone>; rest: V3[]; scale: number
  materials: MangledMats; lodMeshes: Partial<Record<string, THREE.SkinnedMesh>>
  parts: Partial<Record<MangledPart, { mesh: THREE.SkinnedMesh; lod: Lod; tris: number }>> }
const partMats = (part: MangledPart, m: MangledMats): THREE.Material[] => part === 'faces' ? [m.face] : part === 'legs' ? [m.hide, m.shred] : [m.hide]
/** 构建残缺者骨架（不含任何网格），随后用 addMangledPart 逐个挂上部位。 */
export function buildMangledRig(scale = 1): THREE.Group {
  const S = mangledSkel()
  const grp = new THREE.Group(); grp.userData.entityType = 'mangled'
  const mount = new THREE.Group(); mount.scale.setScalar(scale); grp.add(mount)
  const bones: THREE.Bone[] = [], byName: Record<string, THREE.Bone> = {}
  S.rig.rest.forEach((p, i) => {
    const b = new THREE.Bone(); b.name = S.rig.names[i]; const par = S.rig.parent[i]
    b.position.copy(p).sub(par < 0 ? V(0, 0, 0) : S.rig.rest[par]); (par < 0 ? mount : bones[par]).add(b); bones.push(b); byName[b.name] = b
  })
  mount.updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(bones)
  grp.userData.mangledRig = { mount, skeleton, bones, byName, rest: bones.map((b) => b.position.clone()), scale, parts: {}, materials: mangledMaterials(), lodMeshes: {} } satisfies MangledRig
  return grp
}
/** 挂上（或替换精度）一个部位。所有部位共用同一 Skeleton，动画只驱动骨骼。 */
export function addMangledPart(grp: THREE.Object3D, part: MangledPart, lod: Lod = 0) {
  const rig = grp.userData.mangledRig as MangledRig
  const cur = rig.parts[part]
  if (cur && cur.lod === lod) return cur
  const G = prepareMangledPart(part, lod)
  const key = part + lod
  let mesh = rig.lodMeshes[key]
  if (!mesh) {
    mesh = new THREE.SkinnedMesh(G.geo.clone(), partMats(part, rig.materials))
    rig.lodMeshes[key] = mesh
    rig.mount.add(mesh); mesh.bind(rig.skeleton, new THREE.Matrix4())
  }
  mesh.visible = true
  mesh.name = 'mangled-' + part; mesh.frustumCulled = false; mesh.castShadow = part !== 'faces'
  mesh.userData.mangledPart = part
  if (cur) cur.mesh.visible = false
  return (rig.parts[part] = { mesh, lod, tris: G.tris })
}
/** 同步构建全部部位（预览/测试用） */
export function buildMangledMesh(scale = 1, lod: Lod = 0): THREE.Group {
  const g = buildMangledRig(scale)
  for (const p of MANGLED_PARTS) addMangledPart(g, p, lod)
  return g
}
/**
 * 游戏内分帧加载：每帧最多构建一个部位（先远景精度、后精细精度），避免一次性卡顿。
 * 返回一个步进函数，渲染循环每帧调用一次，全部完成后返回 true。
 */
export function mangledLoader(grp: THREE.Object3D): () => boolean {
  const queue: [MangledPart, Lod][] = [...MANGLED_PARTS.map((p) => [p, 1] as [MangledPart, Lod]), ...MANGLED_PARTS.map((p) => [p, 0] as [MangledPart, Lod])]
  return () => {
    const job = queue.shift(); if (!job) return true
    const [part, lod] = job
    prepareMangledPart(part, lod) // 只构建几何（缓存）；挂哪一级由 updateMangledLod 决定
    const rig = grp.userData.mangledRig as MangledRig
    if (!rig.parts[part]) addMangledPart(grp, part, lod)
    return queue.length === 0
  }
}
/** 分部位 LOD：按相机到躯体中心的距离选每个部位的精度；精细几何尚未构建时保持远景。 */
export function updateMangledLod(grp: THREE.Object3D, camWorld: THREE.Vector3) {
  const rig = grp.userData.mangledRig as MangledRig | undefined; if (!rig) return
  const c = grp.localToWorld(MANGLED_BODY.clone().multiplyScalar(rig.scale).setY(MANGLED_BODY.y * rig.scale * 0.6))
  const d = c.distanceTo(camWorld) / rig.scale
  for (const p of MANGLED_PARTS) {
    if (!rig.parts[p]) continue
    const previous = rig.parts[p]!.lod
    const want: Lod = d > MANGLED_LOD_DIST[p] + (previous === 0 ? 5 : -5) ? 1 : 0
    if (want === 0 && !GEO[p + '0']) continue
    addMangledPart(grp, p, want)
  }
}
/**
 * 烟雾外壳：大号公告板团簇包住躯体与腿的上段（附图：身躯完全没入翻涌的云）。
 * density 0..1 控制整体不透明度（雾事件淡入/淡出时调）；每层材质共享，最多 3 种。
 */
export function buildMangledShroud(density = 1, seed = 7): THREE.Group {
  const grp = new THREE.Group(); grp.userData.mangledShroud = true
  const tex = smokeTexture(), R = mulberry(seed), B = MANGLED_BODY
  const positions: number[] = [], uv: number[] = [], colors: number[] = [], centers: number[] = [], sizes: number[] = [], angles: number[] = [], alpha: number[] = [], indices: number[] = []
  const palette = ['#8c8a8e', '#6c6a70', '#a4a2a6'].map(c => new THREE.Color(c))
  for (let i = 0; i < 64; i++) {
    const skirt = i >= 46, a = R() * Math.PI * 2, rr = skirt ? 6 + R() * 18 : Math.sqrt(R()) * 20
    const y = skirt ? B.y - 9 - R() * 8 : B.y + (R() - 0.35) * 14
    const size = skirt ? 12 + R() * 10 : 14 + R() * 18, aspect = skirt ? 0.5 : 0.6 + R() * 0.3
    const angle = R() * 6, color = palette[skirt ? 1 : i % 3], opacity = [0.95, 0.75, 0.55][skirt ? 1 : i % 3]
    for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      positions.push(x, z, 0); uv.push(x + 0.5, z + 0.5); colors.push(color.r, color.g, color.b)
      centers.push(Math.cos(a) * rr, y, Math.sin(a) * rr * (skirt ? 1 : 0.9)); sizes.push(size, size * aspect); angles.push(angle); alpha.push(opacity)
    }
    const q = i * 4; indices.push(q, q + 1, q + 2, q, q + 2, q + 3)
  }
  const geo = new THREE.BufferGeometry()
  for (const [name, data, count] of [['position', positions, 3], ['uv', uv, 2], ['color', colors, 3], ['smokeCenter', centers, 3], ['smokeSize', sizes, 2], ['smokeAngle', angles, 1], ['smokeAlpha', alpha, 1]] as const) geo.setAttribute(name, new THREE.Float32BufferAttribute(data, count))
  geo.setIndex(indices); geo.boundingSphere = new THREE.Sphere(B.clone(), 60)
  const uDensity = { value: density }
  const mat = new THREE.MeshBasicMaterial({ ...(tex ? { map: tex } : {}), vertexColors: true, transparent: true, depthWrite: false, fog: true })
  mat.onBeforeCompile = sh => {
    sh.uniforms.uShroudDensity = uDensity
    sh.vertexShader = 'attribute vec3 smokeCenter; attribute vec2 smokeSize; attribute float smokeAngle; attribute float smokeAlpha; varying float vSmokeAlpha;\n' + sh.vertexShader
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', [
      'float c = cos(smokeAngle), s = sin(smokeAngle);',
      'vec2 q = mat2(c, s, -s, c) * (position.xy * smokeSize);',
      'vec4 mvPosition = modelViewMatrix * vec4(smokeCenter, 1.0);',
      'mvPosition.xy += q * length(modelViewMatrix[0].xyz);',
      'vSmokeAlpha = smokeAlpha;',
      'gl_Position = projectionMatrix * mvPosition;'
    ].join('\n'))
    sh.fragmentShader = 'uniform float uShroudDensity; varying float vSmokeAlpha;\n' + sh.fragmentShader
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'diffuseColor.a *= vSmokeAlpha * uShroudDensity;\n#include <opaque_fragment>')
  }
  mat.customProgramCacheKey = () => 'mangled-shroud-billboards-v1'
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.name = 'mangled-smoke-batch'
  grp.add(mesh); grp.userData.shroudDensityUniform = uDensity
  return grp
}
export function setShroudDensity(grp: THREE.Object3D, k: number) {
  const uniform = grp.userData.shroudDensityUniform as { value: number } | undefined
  if (uniform) uniform.value = THREE.MathUtils.clamp(k, 0, 1)
}
export const mangledBudget = rigBudget
