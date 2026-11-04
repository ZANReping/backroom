import { shareHotelRigAssets } from './shared'
// [concierge v2] 看门人（Entity 131 / The Concierge）重制·阶段 1 细致建模（替换 f1d5548 的「球 + 管」粗模）。
// 参照 ZAN 附图与中文维基：约 2.0 m 瘦高男体；真实感黑山羊头（四只橙眼、横瞳）；白衬衫卷袖到肘上、黑领带、深色西裤 + 皮带；
// 裸露深褐前臂长眼（左 4 右 5）；人手五指三节；反关节山羊腿（裤子包到跗关节，下露黑毛腿 + 分趾蹄 + 悬蹄）。
//
// 做法：
//   · 每个部件写成 SDF（conciergeHead / conciergeBody），窄带 Surface Nets 提取整块无缝网格，手 / 头先细提再 QEM 减面；
//     顶点投影回等值面，法线取 SDF 梯度（布褶、筋腱、毛簇在着色里体现）；顶点色 = 区域色 × SDF 环境光遮蔽。
//   · 部件只在衣物边界拼接：领口（颈从领子里出来）、肘上卷袖（前臂从袖口出来）、皮带（衬衫掖进裤腰）、裤口（毛腿从裤管出来）；
//     手 / 前臂、上 / 下裤管用同一个 SDF 的重叠带拼（表面重合、法线一致，看不出接缝）。
//   · 领子 / 领带 / 皮带 + 扣 / 衬衫扣子是独立薄壳（太薄，体素表达不了）。
//   · 全身一张 SkinnedMesh（1 次绘制）+ 眼球一张 SkinnedMesh（虹膜贴图）。权重按到骨段的链式关节平面平滑过渡。
//   · 材质：litMaterial + 三平面细节纹理（毛 / 皮肤 / 棉布 / 毛呢四通道，按顶点权重混合；在绑定空间采样，动画不游移），
//     写实模式下逐顶点粗糙度 / 金属度（鼻头湿亮、蹄、皮带扣）。
// 坐标：按 +Z 正面建造、地面 y=0；外层 face 组 rotation.y = π/2（userData.facesZ = 1）。
// 骨骼（userData.concierge，阶段 2 动画用）：root/hips/spine/chest/neck/head/jaw/earL/earR/tie；
//   armL/armR：clav → shoulder(上臂) → elbow(前臂) → wrist(手) → fingers.{thumb,index,middle,ring,pinky}[3]（userData.flexAxis 为屈曲轴）；
//   legL/legR：hip(大腿) → knee(小腿) → hock(跖骨) → pastern(系部 + 蹄)；
//   每只眼 {g 眼窝, ball 眼球, lidU, lidL, open}（lid 绕局部 X，0 = 闭合）；道具（默认隐藏）：handset + cord（右手）、key（左手）、cup、rope（腰侧）。
// v3（头颈精修）：头部 = 粗格（颅 / 颈 / 颊）+ 细格分区（每侧眼区、两耳、吻部）、卷袖细格，重叠带拼接（extract within 限定追踪范围）；
//   下门齿 8 颗（jaw）；毛流顶点属性 aFlow + 着色器毛流笔触 + 湿亮假高光；第三张 SkinnedMesh「conciergeFur」= 颈毛 / 颌下须 / 山羊胡发片（alphaTest，rig.furMesh）。
// 无头 SwiftShader 画 GPU 蒙皮会崩：预览 / 截图带 ?cpu=1（qaCpuSkin）。
import * as THREE from 'three'
import { litMaterial } from './shared'
import { decimate, extract, reproject, sdfAO, sdEll, sstep, mix, clamp, gauss, type Sdf, type Surf } from './conciergeSdf'
import { BONES, B, HANDS, J, W4, HU, HV, add, cross, dot, nrm, rot, scl, sub, side, lenv, type V3 } from './conciergeRig'
import { NECK_AXIS as NECK_AX, NECK_BASE, headPartSdf, HEAD_BOX, headShade, headWeights, headEyeMounts, irisTexture, keyTagTexture, headFineRegions, headCoarseKeep, setHeadDetail, lowerIncisorsCanon, canonToWorld, HANG, furZone, type CEye, type EyeMount, type Shade } from './conciergeHead'
import {
  torsoSdf, TORSO_BOX, torsoShade, torsoWeights, pantsSdf, PANTS_BOX, pantsShade, pantsSplit, legWeights, beltRing, onSurface,
  torsoCore, cuffRegion, cuffBox, CUFF_BAND, armSdf, armBox, armT, armShade, armWeights, handBox, lowerLegSdf, lowerLegBox, lowerLegShade, armEyeMounts,
} from './conciergeBody'

export type { CEye }

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
/** 顶点色按线性空间存（three 的 color 属性是线性的） */
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const shade0 = (): Shade => ({ r: 1, g: 1, b: 1, rough: 0.8, metal: 0, fur: 0, skin: 0, cloth: 0, wool: 0, fx: 0, fy: 0, fz: 0 })

// ---------- SDF 部件 ----------
interface Part {
  name: string; sdf: Sdf; box: { min: [number, number, number]; max: [number, number, number] }; h: [number, number]; target?: [number, number]
  keep?: (x: number, y: number, z: number) => boolean; within?: (x: number, y: number, z: number) => boolean; shade: (x: number, y: number, z: number, o: Shade) => void; weights: (x: number, y: number, z: number, acc: W4) => void
  ao?: Sdf; aoScale?: number
  /** 减面后用格点场取法线（不再求 SDF；布料 / 毛腿够用）*/
  gridN?: boolean
}
const pantsCoarse: Sdf = (x, y, z) => Math.min(sdEll(x, y, z, 0, 1.03, -0.006, 0.158, 0.11, 0.11), sdEll(x, y, z, 0, 1.098, 0, 0.15, 0.04, 0.108))
/** 头部各分区的减面目标 / 细格步长（LOD0）*/
const HEAD_T = { head: 7300, eyes: 1950, ear: 1400, muzzle: 4500 } as Record<string, number>
const FINE_H = { eyes: 0.0026, ear: 0.0027, muzzle: 0.0029 } as Record<string, number>
let lodNow = 0
/** 头部各分区在 ch.idx 里的区间（发片按面积采样用） */
let headTriRanges: [number, number][] = []
function parts(): Part[] {
  const out: Part[] = []
  const torsoAO: Sdf = (x, y, z) => pantsCoarse(x, y, z)
  // 头：粗格（颅 / 颈 / 颊）+ LOD0 的细格分区（眼区 / 耳 / 吻部），在重叠带拼接（同一 SDF，表面重合）
  out.push({ name: 'head', sdf: headPartSdf, box: HEAD_BOX, h: [0.0058, 0.009], target: [HEAD_T.head, 2600], keep: lodNow ? (_x, y) => y > 1.555 : (x, y, z) => y > 1.555 && headCoarseKeep(x, y, z), within: lodNow ? undefined : (x, y, z) => headCoarseKeep(x, y, z, 0.012), shade: headShade, weights: headWeights, ao: torsoCore, aoScale: 0.01 })
  if (!lodNow) for (const r of headFineRegions()) {
    const kind = r.name.slice(0, 3) === 'eye' ? 'eyes' : r.name.slice(0, 3) === 'ear' ? 'ear' : 'muzzle'
    out.push({ name: r.name, sdf: headPartSdf, box: r.box, h: [FINE_H[kind], FINE_H[kind]], target: [HEAD_T[kind], HEAD_T[kind]], keep: (x, y, z) => r.region(x, y, z) < 0, within: (x, y, z) => r.region(x, y, z) < 0.006, shade: headShade, weights: headWeights, aoScale: 0.008 })
  }
  const outCuff = (x: number, y: number, z: number, slack: number) => cuffRegion(1, x, y, z) > -CUFF_BAND - slack && cuffRegion(-1, x, y, z) > -CUFF_BAND - slack
  out.push({ name: 'torso', sdf: torsoSdf, box: TORSO_BOX, h: [0.0118, 0.018], target: [7300, 1800], keep: lodNow ? (_x, y) => y > 1.072 : (x, y, z) => y > 1.072 && outCuff(x, y, z, 0), within: lodNow ? undefined : (x, y, z) => outCuff(x, y, z, 0.02), shade: torsoShade, weights: torsoWeights, ao: torsoAO, aoScale: 0.018 })
  if (!lodNow) for (const s of [1, -1]) out.push({ name: 'cuff' + (s > 0 ? 'L' : 'R'), sdf: torsoSdf, box: cuffBox(s), h: [0.0044, 0.0044], target: [950, 950], keep: (x, y, z) => cuffRegion(s, x, y, z) < 0, within: (x, y, z) => cuffRegion(s, x, y, z) < 0.01, shade: torsoShade, weights: torsoWeights, ao: torsoAO, aoScale: 0.012 })
  out.push({ name: 'pants', sdf: pantsSdf, box: PANTS_BOX, h: [0.012, 0.019], target: [6900, 1700], keep: (x, y, z) => pantsSplit(x, y, z) < 0.03 && y < 1.13, shade: pantsShade, weights: legWeights, aoScale: 0.02 })
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R', f = armSdf(s), leg = lowerLegSdf(s)
    out.push({ name: 'leg' + S, sdf: leg, box: lowerLegBox(s), h: [0.0074, 0.012], target: [2700, 700], keep: (x, y, z) => Math.sign(x || s) === s && pantsSplit(x, y, z) > -0.03, shade: (x, y, z, o) => { lowerLegShade(s, x, y, z, o); o.fx = 0; o.fy = -1; o.fz = 0 }, weights: legWeights, aoScale: 0.012 })
    out.push({ name: 'fore' + S, sdf: f, box: armBox(s), h: [0.006, 0.011], target: [2600, 650], keep: (x, y, z) => armT(s, x, y, z) < 1.035, shade: (x, y, z, o) => armShade(s, x, y, z, o), weights: (x, y, z, a) => armWeights(s, x, y, z, a), ao: torsoCore, aoScale: 0.01 })
    out.push({ name: 'hand' + S, sdf: f, box: handBox(s), h: [0.0031, 0.006], target: [3900, 800], keep: (x, y, z) => armT(s, x, y, z) > 0.965, shade: (x, y, z, o) => armShade(s, x, y, z, o), weights: (x, y, z, a) => armWeights(s, x, y, z, a), aoScale: 0.008 })
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
    if (p.gridN || lod > 0) { const g = s.sample!, e = p.h[lod] * 0.5; for (let i = 0; i < s.vcount; i++) { const x = s.pos[i * 3], y = s.pos[i * 3 + 1], z = s.pos[i * 3 + 2]; const nx = g(x + e, y, z) - g(x - e, y, z), ny = g(x, y + e, z) - g(x, y - e, z), nz = g(x, y, z + e) - g(x, y, z - e), l = Math.hypot(nx, ny, nz) || 1; s.nrm[i * 3] = nx / l; s.nrm[i * 3 + 1] = ny / l; s.nrm[i * 3 + 2] = nz / l } }
    else reproject(p.sdf, s, 0, 0.0012)
  }
  const grid = s.sample!, extra = p.ao
  const ao: Sdf = extra ? (x, y, z) => Math.min(grid(x, y, z), extra(x, y, z)) : grid
  const base = ch.n, sh = shade0(), w = new W4()
  if (p.sdf === headPartSdf) headTriRanges.push([ch.idx.length, ch.idx.length + s.idx.length])
  for (let i = 0; i < s.vcount; i++) {
    const x = s.pos[i * 3], y = s.pos[i * 3 + 1], z = s.pos[i * 3 + 2], nx = s.nrm[i * 3], ny = s.nrm[i * 3 + 1], nz = s.nrm[i * 3 + 2]
    p.shade(x, y, z, sh)
    const occ = sdfAO(ao, x, y, z, nx, ny, nz, p.aoScale ?? 0.012, 1.6)
    p.weights(x, y, z, w.reset()); w.finish(B.chest)
    ch.vert([x, y, z], [nx, ny, nz], sh, w, 0.35 + 0.65 * occ)
  }
  for (let i = 0; i < s.idx.length; i++) ch.idx.push(base + s.idx[i])
  stats[p.name] = s.idx.length / 3
  stats[p.name + '_ms'] = Math.round(performance.now() - t0)
  stats[p.name + '_raw'] = raw
}

// ---------- 薄壳（领 / 领带 / 皮带 / 扣）----------
/** 由中面 P(s,t) 造带厚度的壳：上下两面 + 四周侧壁；返回加入 ch */
function shell(ch: Chunk, P: (s: number, t: number) => V3, ns: number, nt: number, thick: (s: number, t: number) => number, shadeAt: (p: V3, s: number, t: number, o: Shade) => void, weightAt: (p: V3, acc: W4) => void, closedS = false) {
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
      ch.vert(p, scl(N[i][j], sg), sh, w)
    }
    for (let i = 0; i < ns; i++) for (let j = 0; j < nt; j++) {
      const a = base + i * (nt + 1) + j, b = a + nt + 1
      if (sg > 0) ch.idx.push(a, b, a + 1, b, b + 1, a + 1); else ch.idx.push(a, a + 1, b, b, a + 1, b + 1)
    }
  }
  layer(1); layer(-1)
  // 侧壁
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
  rim(e1); rim(e3); if (!closedS) { rim(e2); rim(e4) }
}
const C3 = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]

function buildShells(ch: Chunk, lod: number) {
  const q = lod ? 0.5 : 1, R = (n: number) => Math.max(3, Math.round(n * q))
  const shirt = (p: V3, _s: number, t: number, o: Shade) => { const c = C3(0xeae7e0); const k = 0.9 + 0.1 * t; o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k; o.rough = 0.9; o.metal = 0; o.fur = 0; o.skin = 0; o.cloth = 1; o.wool = 0; void p }
  // 领座：绕颈一圈的立领（前面留出领带结的缺口），后高前低
  const GAP = 0.2
  const band = (s: number, t: number): V3 => {
    const phi = mix(GAP, Math.PI * 2 - GAP, s)
    const bk = (1 - Math.cos(phi)) * 0.5
    const y0 = 1.566 - 0.02 * bk
    const r = 0.0705 + 0.004 * t + 0.002 * bk
    const up = scl(NECK_AX, t * (0.04 + 0.032 * bk))
    return [NECK_BASE[0] + Math.sin(phi) * r + up[0], y0 + up[1], NECK_BASE[2] + Math.cos(phi) * r + up[2]]
  }
  shell(ch, band, R(40), R(4), () => 0.0035, shirt, (p, a) => { a.add(B.chest, sstep(1.64, 1.59, p[1]) + 0.3); a.add(B.neck, sstep(1.58, 1.63, p[1]) * 0.6) })
  // 领尖翻领：左右两片，从领座上沿翻下、盖住领座，前端成尖压在领带结两侧
  for (const sd of [1, -1]) {
    const leaf = (s: number, t: number): V3 => {
      const phi = mix(GAP + 0.02, Math.PI, s)
      const ph = sd > 0 ? phi : Math.PI * 2 - phi
      const top = band((ph - GAP) / (Math.PI * 2 - GAP * 2), 1)
      const out: V3 = nrm([Math.sin(ph), 0, Math.cos(ph)])
      const fold = add(top, add(scl(out, 0.005), [0, 0.003, 0]))
      const backEdge = add(fold, add(scl(out, 0.016), [0, -0.05, 0]))
      const tip: V3 = [sd * 0.058, 1.528, 0.104]
      const k = sstep(GAP, 1.35, phi)
      const edge: V3 = [mix(tip[0], backEdge[0], k), mix(tip[1], backEdge[1], k), mix(tip[2], backEdge[2], k)]
      const p = add(add(fold, scl(sub(edge, fold), t)), scl(out, Math.sin(Math.PI * t) * 0.006))
      // 别穿进衬衫
      const d = torsoSdf(p[0], p[1], p[2])
      return d < 0.0035 ? onSurface(torsoSdf, p, 0.0035) : p
    }
    shell(ch, leaf, R(30), R(6), (_s, t) => 0.0032 * (1 - 0.3 * t), shirt, (p, a) => { a.add(B.chest, 1); a.add(B.neck, sstep(1.56, 1.63, p[1]) * 0.4) })
  }
  // 领带结：上宽下窄的倒梯形块（温莎结），正面一道斜褶，嵌在领口缺口里
  {
    const nu = R(10), nv = R(8), base = ch.n, wv = new W4(), sh = shade0(), c = C3(0x18181c)
    const pt = (i: number, j: number): [V3, V3] => {
      const a = (i / nu) * Math.PI * 2, t = j / nv // t: 0 下 → 1 上
      const hw = mix(0.011, 0.021, t), hd = mix(0.008, 0.012, t)
      const ca = Math.cos(a), sa = Math.sin(a)
      // 超椭圆截面（方一点）
      const k = 0.55, cx = Math.sign(sa) * Math.pow(Math.abs(sa), k), cz = Math.sign(ca) * Math.pow(Math.abs(ca), k)
      const fold = 0.0015 * Math.sin(a * 2 + t * 4) * (cz > 0 ? 1 : 0)
      const y = J.tie[1] - 0.019 + t * 0.036 + (t === 0 || t === 1 ? 0 : 0)
      const capK = Math.sin(Math.PI * Math.min(1, Math.max(0, t)) * 0.5 + Math.PI * 0.5 * (t > 0.5 ? 0 : 0))
      void capK
      const p: V3 = [J.tie[0] + cx * hw, y, J.tie[2] + 0.002 + cz * (hd + fold) - 0.006 * t * t]
      return [p, nrm([cx / hw, 0.1 * (t - 0.5), cz / hd])]
    }
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const [p, n] = pt(i, j)
      const k = 0.85 + 0.15 * Math.sin(i * 1.3 + j)
      sh.r = c[0] * k; sh.g = c[1] * k; sh.b = c[2] * k; sh.rough = 0.45; sh.metal = 0; sh.fur = 0; sh.skin = 0; sh.cloth = 0.6; sh.wool = 0
      wv.reset().add(B.tie, 0.4).add(B.chest, 0.6).finish(B.chest)
      ch.vert(p, n, sh, wv)
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = base + j * (nu + 1) + i, b = a + nu + 1; ch.idx.push(a, a + 1, b, b, a + 1, b + 1) }
    // 上下封口
    for (const j of [0, nv]) { const cIdx = ch.n; const [p] = pt(0, j); const cp: V3 = [J.tie[0], p[1], J.tie[2] + 0.002 - 0.006 * (j / nv) ** 2]; sh.r = c[0]; sh.g = c[1]; sh.b = c[2]; wv.reset().add(B.chest, 1).finish(B.chest); ch.vert(cp, [0, j ? 1 : -1, 0], sh, wv); for (let i = 0; i < nu; i++) { const a = base + j * (nu + 1) + i; if (j) ch.idx.push(cIdx, a + 1, a); else ch.idx.push(cIdx, a, a + 1) } }
  }
  // 领带：贴胸、下宽、末端尖（尖端在皮带扣上方）
  const tieTop = J.tie[1] - 0.022, tieTip = 1.13
  const blade = (s: number, t: number): V3 => {
    const u = t * 2 - 1
    const hw = mix(0.016, 0.042, sstep(0, 0.82, s))
    const yc = mix(tieTop, tieTip, s)
    const y = s > 0.9 ? mix(yc, tieTip + Math.abs(u) * 0.034, sstep(0.9, 1, s)) : yc
    const x = u * hw + 0.004 * Math.sin(s * 3.2)
    const sp = onSurface(torsoSdf, [x * 0.6, y, 0.2], 0.0042)
    return [x, y, Math.max(sp[2], onSurface(torsoSdf, [0, y, 0.2], 0.0042)[2] - 0.004) + 0.0012 * Math.sin(s * 20)]
  }
  shell(ch, blade, R(26), R(4), () => 0.0045, (p, _s, t, o) => { const c = C3(0x17171a); const k = 0.9 + 0.12 * Math.abs(t - 0.5) + 0.04 * Math.sin(p[1] * 260 + p[0] * 600); o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k; o.rough = 0.42; o.metal = 0; o.fur = 0; o.skin = 0; o.cloth = 0.6; o.wool = 0 }, (p, a) => { const k = sstep(1.52, 1.25, p[1]); a.add(B.tie, k); trunkLike(p[1], a, 1 - k) })
  // 衬衫扣（门襟上 5 颗）
  for (const y of [1.17, 1.265, 1.36, 1.455, 1.545]) {
    const p = onSurface(torsoSdf, [0.0, y, 0.2], 0.0016)
    if (y < 1.53) {} // 领带盖住中间的扣子也照样做
    const n: V3 = nrm([0, 0.05, 1])
    const g = new THREE.CylinderGeometry(0.0052, 0.0052, 0.0022, R(12), 1).rotateX(Math.PI / 2)
    const pa = g.attributes.position as THREE.BufferAttribute, na = g.attributes.normal as THREE.BufferAttribute
    const sh = shade0(), wv = new W4(), base = ch.n
    const c = C3(0xf3f0e8)
    for (let i = 0; i < pa.count; i++) {
      const v: V3 = [p[0] + pa.getX(i), p[1] + pa.getY(i), p[2] + pa.getZ(i) + 0.0008]
      const hole = Math.hypot(Math.abs(pa.getX(i)) - 0.0016, Math.abs(pa.getY(i)) - 0.0016) < 0.0009 ? 0.6 : 1
      sh.r = c[0] * hole; sh.g = c[1] * hole; sh.b = c[2] * hole; sh.rough = 0.35; sh.metal = 0; sh.fur = 0; sh.skin = 0; sh.cloth = 0; sh.wool = 0
      trunkLike(v[1], wv.reset(), 1); wv.finish(B.chest)
      ch.vert(v, [na.getX(i), na.getY(i), na.getZ(i)], sh, wv)
    }
    const ix = g.index!.array; for (let i = 0; i < ix.length; i++) ch.idx.push(base + ix[i])
    void n
  }
  // 皮带 + 扣 + 裤襻
  {
    const n = R(64), ring = beltRing(n, 1.1)
    const P = (s: number, t: number): V3 => {
      const a = s * n, i0 = Math.floor(a) % n, i1 = (i0 + 1) % n, f = a - Math.floor(a)
      const p = [mix(ring[i0][0], ring[i1][0], f), 1.1, mix(ring[i0][2], ring[i1][2], f)] as V3
      const out = nrm([p[0], 0, p[2]])
      return add(add(p, scl(out, 0.0035)), [0, (t - 0.5) * 0.034, 0])
    }
    shell(ch, P, n, 2, () => 0.0045, (p, _s, t, o) => { const c = C3(0x161210); const k = 1 - 0.25 * gauss(Math.abs(t - 0.5) - 0.42, 0.04) + 0.03 * Math.sin(p[0] * 300); o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k; o.rough = 0.4; o.metal = 0; o.fur = 0; o.skin = 0; o.cloth = 0; o.wool = 0 }, (_p, a) => { a.add(B.hips, 1) }, true)
    // 扣：方框 + 扣针
    const front = P(0, 0.5), z0 = front[2] + 0.0035
    const box = (cx: number, cy: number, w: number, h: number, d: number, hex: number, rough: number, metal: number) => {
      const g = new THREE.BoxGeometry(w, h, d)
      const pa = g.attributes.position as THREE.BufferAttribute, na = g.attributes.normal as THREE.BufferAttribute
      const sh = shade0(), wv = new W4(), base = ch.n, c = C3(hex)
      for (let i = 0; i < pa.count; i++) { sh.r = c[0]; sh.g = c[1]; sh.b = c[2]; sh.rough = rough; sh.metal = metal; sh.fur = 0; sh.skin = 0; sh.cloth = 0; sh.wool = 0; wv.reset().add(B.hips, 1).finish(B.hips); ch.vert([cx + pa.getX(i), cy + pa.getY(i), z0 + pa.getZ(i)], [na.getX(i), na.getY(i), na.getZ(i)], sh, wv) }
      const ix = g.index!.array; for (let i = 0; i < ix.length; i++) ch.idx.push(base + ix[i])
    }
    const bx = 0.004
    box(bx, 1.1 + 0.0185, 0.05, 0.0045, 0.004, 0xb09a62, 0.28, 0.85); box(bx, 1.1 - 0.0185, 0.05, 0.0045, 0.004, 0xb09a62, 0.28, 0.85)
    box(bx - 0.0228, 1.1, 0.0045, 0.041, 0.004, 0xb09a62, 0.28, 0.85); box(bx + 0.0228, 1.1, 0.0045, 0.041, 0.004, 0xb09a62, 0.28, 0.85)
    box(bx - 0.004, 1.1, 0.03, 0.0026, 0.0035, 0xc8b47a, 0.25, 0.9)
    box(bx + 0.003, 1.1, 0.04, 0.03, 0.002, 0x1a1513, 0.4, 0) // 扣框里露出的皮带
    // 裤襻
    for (const a of [0.85, 1.85, Math.PI, -0.85, -1.85]) {
      const s = ((a / (Math.PI * 2)) + 1) % 1
      const c = P(s, 0.5), out = nrm([c[0], 0, c[2]])
      const g = new THREE.BoxGeometry(0.012, 0.044, 0.004).lookAt(new THREE.Vector3(out[0], 0, out[2]))
      const pa = g.attributes.position as THREE.BufferAttribute, na = g.attributes.normal as THREE.BufferAttribute
      const sh = shade0(), wv = new W4(), base = ch.n, col = C3(0x26262b)
      for (let i = 0; i < pa.count; i++) { sh.r = col[0]; sh.g = col[1]; sh.b = col[2]; sh.rough = 0.85; sh.wool = 1; sh.cloth = 0; sh.metal = 0; sh.fur = 0; sh.skin = 0; wv.reset().add(B.hips, 1).finish(B.hips); ch.vert([c[0] + out[0] * 0.0045 + pa.getX(i), c[1] + pa.getY(i), c[2] + out[2] * 0.0045 + pa.getZ(i)], [na.getX(i), na.getY(i), na.getZ(i)], sh, wv) }
      const ix = g.index!.array; for (let i = 0; i < ix.length; i++) ch.idx.push(base + ix[i])
    }
  }
}
function trunkLike(y: number, acc: W4, k: number) {
  const a = sstep(1.1, 1.22, y), b = sstep(1.3, 1.44, y)
  acc.add(B.hips, k * (1 - a)); acc.add(B.spine, k * a * (1 - b)); acc.add(B.chest, k * a * b)
}

// ---------- 下门齿（8 颗铲形齿，挂 jaw）----------
function buildTeeth(ch: Chunk) {
  const sh = shade0(), w = new W4(), c = C3(0xd9cdb0)
  for (const t of lowerIncisorsCanon()) {
    const b = canonToWorld(t.base), tip = canonToWorld(t.tip)
    const A = nrm(sub(tip, b)), L = lenv(sub(tip, b))
    // 宽度方向：规范 x → 世界 x；厚度方向 = A × 宽
    let Wd: V3 = [1, 0, 0]; Wd = nrm(sub(Wd, scl(A, dot(Wd, A)))); const Th = nrm(cross(A, Wd))
    const ns = 4, nr = 8, base = ch.n
    for (let i = 0; i <= ns; i++) {
      const s = i / ns, hw = mix(0.62, 1, Math.min(1, s * 1.6)) * t.w * 0.5 * 1.1 * (s > 0.85 ? mix(1, 0.8, (s - 0.85) / 0.15) : 1), ht = mix(1, 0.55, s) * t.t * 0.5 * 1.1
      const curl = 0.0008 * s * s // 齿冠略向舌侧卷
      for (let j = 0; j < nr; j++) {
        const a = (j / nr) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a)
        const ex = Math.sign(ca) * Math.pow(Math.abs(ca), 0.6), ez = Math.sign(sa) * Math.pow(Math.abs(sa), 0.6)
        const p = add(add(add(b, scl(A, s * L)), scl(Wd, ex * hw)), scl(Th, ez * ht - curl))
        const n = nrm(add(scl(Wd, ca * 0.8), add(scl(Th, sa), scl(A, s > 0.9 ? 0.6 : 0))))
        const k = mix(0.75, 1.05, s)
        sh.r = c[0] * k; sh.g = c[1] * k; sh.b = c[2] * k; sh.rough = 0.3; sh.metal = 0; sh.fur = 0; sh.skin = 0.3; sh.cloth = 0; sh.wool = 0; sh.fx = 0; sh.fy = 0; sh.fz = 0
        w.reset().add(B.jaw, 1).finish(B.jaw)
        ch.vert(p, n, sh, w)
      }
    }
    for (let i = 0; i < ns; i++) for (let j = 0; j < nr; j++) { const a = base + i * nr + j, bb = base + i * nr + ((j + 1) % nr); ch.idx.push(a, bb, a + nr, bb, bb + nr, a + nr) }
    const tc = ch.n; sh.r = c[0] * 1.05; sh.g = c[1] * 1.05; sh.b = c[2] * 1.05; w.reset().add(B.jaw, 1).finish(B.jaw); ch.vert(add(tip, scl(A, 0.0004)), A, sh, w)
    for (let j = 0; j < nr; j++) ch.idx.push(base + ns * nr + j, base + ns * nr + ((j + 1) % nr), tc)
  }
}

// ---------- 眼睑（每只眼两片，挂各自骨骼）----------
const LID_FUR = C3(0x2a201c), LID_RIM = C3(0x452d28), LID_ARM = C3(0x7c3a30), LID_ARM_RIM = C3(0xa04c42)
interface EyeBones { mount: EyeMount; gi: number; bi: number; ui: number; li: number }
function buildLids(ch: Chunk, eyes: EyeBones[], lod: number) {
  const sh = shade0(), w = new W4()
  for (const e of eyes) {
    const M = e.mount, Z = nrm(M.z), X = nrm(sub(M.x, scl(Z, dot(M.x, Z)))), Y = cross(Z, X)
    const toW = (p: V3): V3 => add(M.c, add(add(scl(X, p[0]), scl(Y, p[1])), scl(Z, p[2])))
    const dW = (p: V3): V3 => add(add(scl(X, p[0]), scl(Y, p[1])), scl(Z, p[2]))
    const r = M.r, ns = lod ? 6 : 10, nt = lod ? 2 : M.skin === 'fur' ? 4 : 3
    for (const up of [1, -1]) {
      const open = up > 0 ? M.open[0] : M.open[1]
      const bone = up > 0 ? e.ui : e.li
      const base = ch.n
      // 闭合时的形状：椭球（沿眼裂拉长）上的一片，从眼裂（phi=0，正前方）到背后；再绕 X 转到睁开位置
      for (let i = 0; i <= ns; i++) for (let j = 0; j <= nt; j++) for (const layer of [0, 1]) {
        const fur = M.skin === 'fur'
        const ps = (i / ns) * 2 - 1, phi = (j / nt) * (up > 0 ? 1.75 : 1.45)
        // v4：头眼的睑片移到睑套壳体内（1.15–1.235r）：睁开时藏在壳里，闭合时几乎与睑套表面齐平（v3 的 1.06–1.105r 闭眼时像凹进去的黑窝）
        const rr = fur ? r * (layer ? 1.235 : 1.15) : r * (layer ? 1.14 : 1.05)
        const ex = fur ? 1 : 1.32, psi = ps * (fur ? 1.3 : 1.22)
        let p: V3 = [Math.sin(psi) * rr * ex, Math.sin(phi) * Math.cos(psi) * rr * up, Math.cos(phi) * Math.cos(psi) * rr]
        // 睑缘：眼裂处圆润加厚
        if (j === 0) p = [p[0], p[1] - up * r * 0.03 * (layer ? 1 : 0), p[2]]
        let n: V3 = nrm([p[0] / (ex * ex), p[1], p[2]])
        if (!layer) n = scl(n, -1)
        const R = new THREE.Vector3(...p).applyAxisAngle(new THREE.Vector3(1, 0, 0), open), RN = new THREE.Vector3(...n).applyAxisAngle(new THREE.Vector3(1, 0, 0), open)
        const rim = j === 0 ? 1 : j === 1 ? 0.4 : 0
        const cB = M.skin === 'fur' ? LID_FUR : LID_ARM, cR = M.skin === 'fur' ? LID_RIM : LID_ARM_RIM
        sh.r = mix(cB[0], cR[0], rim); sh.g = mix(cB[1], cR[1], rim); sh.b = mix(cB[2], cR[2], rim)
        sh.rough = 0.55; sh.metal = 0; sh.fur = M.skin === 'fur' ? 1 - rim : 0; sh.skin = M.skin === 'fur' ? rim : 1; sh.cloth = 0; sh.wool = 0
        w.reset().add(bone, 1).finish(bone)
        ch.vert(toW([R.x, R.y, R.z]), dW([RN.x, RN.y, RN.z]), sh, w, fur ? 0.85 : 1)
      }
      const id = (i: number, j: number, l: number) => base + (i * (nt + 1) + j) * 2 + l
      for (let i = 0; i < ns; i++) for (let j = 0; j < nt; j++) {
        const a = id(i, j, 1), b = id(i + 1, j, 1), c = id(i + 1, j + 1, 1), d = id(i, j + 1, 1)
        // v4 修：v3 的内外层绕序反了（外层背面朝外被剔除，看到的是法线朝内的内层 → 闭眼时上睑像个黑洞）
        if (up > 0) ch.idx.push(a, c, d, a, b, c); else ch.idx.push(a, c, b, a, d, c)
        const a2 = id(i, j, 0), b2 = id(i + 1, j, 0), c2 = id(i + 1, j + 1, 0), d2 = id(i, j + 1, 0)
        if (up > 0) ch.idx.push(a2, d2, c2, a2, c2, b2); else ch.idx.push(a2, b2, c2, a2, c2, d2)
      }
      // 睑缘侧壁（j=0 处连接内外层）
      for (let i = 0; i < ns; i++) { const a = id(i, 0, 0), b = id(i + 1, 0, 0), c = id(i + 1, 0, 1), d = id(i, 0, 1); if (up > 0) ch.idx.push(a, b, c, a, c, d); else ch.idx.push(a, c, b, a, d, c) }
    }
  }
}

// ---------- 发片：颈毛（蓬乱成簇）/ 颌下短须 / 下巴山羊胡（成簇、交叉双片）/ 角根毛 ----------
// 在头部网格上按面积采样发根（确定性随机），每片是沿毛流方向、贴着表面略微翘起的弯条带（2–3 段），
// 法线取发根处的表面法线（与皮毛着色一致），权重复制发根所在三角形的顶点（neck / head / jaw）。alphaTest 贴图见 furTexture。
function buildFur(ch: Chunk, lod: number) {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = []
  let seed = 4242; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const P = ch.pos, N = ch.nrm
  const card = (root: V3, n: V3, dir: V3, L: number, W: number, segs: number, sag: number, colIdx: number, tone: number, vi: number, roll: number) => {
    // 发尖不得低于领口上沿（约 y=1.62）以下 —— 否则会穿出衬衫
    const tipY = root[1] + dir[1] * L - sag * L
    // v4：截短时再随机缩一点，避免发尖齐刷刷停在同一高度（一道横切的刘海）
    if (tipY < FUR_MIN_Y) { const k = (root[1] - FUR_MIN_Y) / Math.max(1e-4, root[1] - tipY); const h = Math.abs(Math.sin(root[0] * 9137 + root[2] * 4271 + root[1] * 1931)); L *= k * (0.55 + 0.45 * h); if (L < 0.006) return }
    // 宽度方向：在切平面内垂直于毛流，再绕毛流随机翻一点（不全贴平）
    let wd = nrm(cross(n, dir)); wd = nrm(add(scl(wd, Math.cos(roll)), scl(nrm(cross(dir, wd)), Math.sin(roll))))
    const base = pos.length / 3
    // v4：与头部一致的黑褐（v3 偏棕）
    const c0 = C3(0x1d1918), c1 = C3(0x2c2523)
    const cr = mix(c0[0], c1[0], tone), cg = mix(c0[1], c1[1], tone), cb = mix(c0[2], c1[2], tone)
    for (let k = 0; k <= segs; k++) {
      const t = k / segs
      const c = add(add(root, scl(dir, L * t)), [0, -sag * L * t * t, 0])
      const hw = W * 0.5 * (1 - 0.35 * t)
      const nn = nrm(add(scl(n, 0.8), scl(nrm(cross(wd, dir)), 0.2)))
      for (const sgn of [-1, 1]) {
        const p = add(c, scl(wd, hw * sgn))
        pos.push(p[0], p[1], p[2]); nor.push(nn[0], nn[1], nn[2]); uv.push((colIdx + (sgn > 0 ? 0.98 : 0.02)) * 0.25, t * 0.98)
        const sh = 0.8 + 0.25 * t
        col.push(lin(cr * sh), lin(cg * sh), lin(cb * sh))
        for (let q = 0; q < 4; q++) { si.push(ch.si[vi * 4 + q]); sw.push(ch.sw[vi * 4 + q]) }
      }
    }
    for (let k = 0; k < segs; k++) { const a = base + k * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2) }
  }
  const down: V3 = [0, -1, 0], hang = nrm(dirFromHeadW(HANG))
  const dens = lod ? 0.2 : 1
  for (const [i0, i1] of headTriRanges) for (let f = i0; f < i1; f += 3) {
    const a = ch.idx[f], b = ch.idx[f + 1], c = ch.idx[f + 2]
    const A: V3 = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], Bv: V3 = [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], Cv: V3 = [P[c * 3], P[c * 3 + 1], P[c * 3 + 2]]
    const area = 0.5 * lenv(cross(sub(Bv, A), sub(Cv, A)))
    const m: V3 = scl(add(add(A, Bv), Cv), 1 / 3)
    const n = nrm([N[a * 3] + N[b * 3] + N[c * 3], N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]])
    let neckish = 0; for (let q = 0; q < 4; q++) { const bi = ch.si[a * 4 + q]; if (bi === B.neck || bi === B.chest) neckish += ch.sw[a * 4 + q] }
    const fz = furZone(m, n, neckish)
    if (!fz) continue
    let expect = area * fz.density * (fz.kind === 'beard' ? 1 : dens)
    while (expect > 0) {
      if (rnd() >= Math.min(1, expect)) break
      expect -= 1
      // 三角形内随机点
      let r1 = rnd(), r2 = rnd(); if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2 }
      const p = add(A, add(scl(sub(Bv, A), r1), scl(sub(Cv, A), r2)))
      const root = add(p, scl(n, -0.0016))
      const tone = rnd() * 0.8 + (fz.kind === 'beard' ? 0.1 : 0)
      if (fz.kind === 'neck' || fz.kind === 'jaw') {
        const flow = fz.kind === 'neck' ? down : hang
        let t = sub(flow, scl(n, dot(flow, n))); t = lenv(t) > 1e-3 ? nrm(t) : nrm(cross(n, [1, 0, 0]))
        const jit = nrm(add(t, scl(nrm(cross(n, t)), (rnd() - 0.5) * 0.7)))
        const dir = nrm(add(jit, scl(n, 0.28 + rnd() * 0.26)))
        // v4：颈毛短（v3 的 40–50%）、蓬松成簇贴着颈部 —— 每个发根 2 片扇开，翘起多一点
        const L = (fz.kind === 'neck' ? 0.0105 + rnd() * 0.0085 : 0.013 + rnd() * 0.011) * fz.len
        const W = 0.0095 + rnd() * 0.005, ci = Math.floor(rnd() * 3), roll = (rnd() - 0.5) * 0.9
        card(root, n, dir, L, W, 2, 0.1, ci, tone, a, roll)
        if (fz.kind === 'neck') { const d2 = nrm(add(dir, add(scl(nrm(cross(n, dir)), (rnd() - 0.5) * 0.9), scl(n, 0.12)))); card(root, n, d2, L * (0.75 + rnd() * 0.2), W * 0.9, 2, 0.08, (ci + 1) % 3, tone * 0.8, a, roll + 0.8) }
      } else if (fz.kind === 'beard') {
        const dir = nrm(add(hang, add(scl(n, 0.15), [(rnd() - 0.5) * 0.25, 0, (rnd() - 0.5) * 0.15])))
        const L = (0.035 + rnd() * 0.045) * fz.len, roll = rnd() * Math.PI
        FUR_MIN_Y = -1
        card(root, n, dir, L, 0.012 + rnd() * 0.006, 3, 0.05, 3, tone, a, roll)
        card(root, n, dir, L * 0.92, 0.011 + rnd() * 0.005, 3, 0.05, 3, tone, a, roll + Math.PI / 2)
        FUR_MIN_Y = 1.627
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); geo.setIndex(idx)
  return geo
}
/** 领口上沿以上 1 cm（发片发尖的下限，beard 除外）*/
let FUR_MIN_Y = 1.627
const dirFromHeadW = (d: V3): V3 => [d[0], HU[1] * d[1] + HV[1] * d[2], HU[2] * d[1] + HV[2] * d[2]]
let furTex: THREE.Texture | null = null
/** 发片贴图（4 列：0–2 短毛簇、3 长须簇）：发根在下（v=0），发丝向尖端收拢变细，深褐 → 尖端微暖亮 */
function furTexture() {
  if (furTex || typeof document === 'undefined') return furTex
  const Wc = 128, H = 256, c = document.createElement('canvas'); c.width = Wc * 4; c.height = H; const g = c.getContext('2d')!
  let seed = 77; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  g.clearRect(0, 0, Wc * 4, H)
  for (let col = 0; col < 4; col++) {
    const x0 = col * Wc, long = col === 3
    // 发根处一层实底（保证贴着皮的部分不透）
    const gr = g.createLinearGradient(0, H, 0, H * 0.55); gr.addColorStop(0, 'rgba(150,146,142,1)'); gr.addColorStop(1, 'rgba(150,146,142,0)')
    g.fillStyle = gr; g.beginPath(); g.moveTo(x0 + Wc * 0.12, H); g.lineTo(x0 + Wc * 0.88, H); g.lineTo(x0 + Wc * 0.62, H * 0.5); g.lineTo(x0 + Wc * 0.38, H * 0.5); g.fill()
    const n = long ? 70 : 55
    for (let i = 0; i < n; i++) {
      const bx = x0 + Wc * (0.08 + rnd() * 0.84), tipL = (long ? 0.7 : 0.55) + rnd() * (long ? 0.3 : 0.43)
      const tx = x0 + Wc * 0.5 + (rnd() - 0.5) * Wc * (long ? 0.35 : 0.55) + (bx - x0 - Wc * 0.5) * 0.25, ty = H * (1 - tipL)
      const cx = (bx + tx) / 2 + (rnd() - 0.5) * Wc * 0.25, cy = H * (1 - tipL * 0.5)
      const lt = rnd(), r = Math.round(120 + lt * 120), gg = Math.round(116 + lt * 110), b = Math.round(112 + lt * 100)
      const segs = 8
      for (let k = 0; k < segs; k++) {
        const t0 = k / segs, t1 = (k + 1) / segs
        const q = (t: number) => [(1 - t) * (1 - t) * bx + 2 * (1 - t) * t * cx + t * t * tx, (1 - t) * (1 - t) * H + 2 * (1 - t) * t * cy + t * t * ty]
        const [ax, ay] = q(t0), [ex, ey] = q(t1)
        const warm = t1 * t1 * 0.1
        g.strokeStyle = `rgba(${Math.min(255, Math.round(r + warm * 40))},${Math.min(255, Math.round(gg + warm * 18))},${Math.round(b)},1)`
        g.lineWidth = (long ? 3.2 : 2.6) * (1 - t0 * 0.8) + 0.5
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(ex, ey); g.stroke()
      }
    }
  }
  furTex = new THREE.CanvasTexture(c); furTex.colorSpace = THREE.SRGBColorSpace; furTex.anisotropy = 4
  return furTex
}

// ---------- 眼球 ----------
function buildEyeballs(eyes: EyeBones[], lod: number) {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = []
  for (const e of eyes) {
    const M = e.mount, Z = nrm(M.z), X = nrm(sub(M.x, scl(Z, dot(M.x, Z)))), Y = cross(Z, X)
    const g = new THREE.SphereGeometry(M.r, lod ? 8 : 12, lod ? 6 : 8).rotateX(Math.PI / 2) // 极点在 ±Z：前极 = 瞳孔
    const pa = g.attributes.position as THREE.BufferAttribute, base = pos.length / 3
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i)
      const w = add(M.c, add(add(scl(X, x), scl(Y, y)), scl(Z, z)))
      const n = nrm(sub(w, M.c))
      pos.push(...w); nor.push(...n); uv.push(0.5 + x / (2 * M.r) * 0.98, 0.5 + y / (2 * M.r) * 0.98)
      si.push(e.bi, 0, 0, 0); sw.push(1, 0, 0, 0)
    }
    const ix = g.index!.array; for (let i = 0; i < ix.length; i++) idx.push(base + ix[i])
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); geo.setIndex(idx)
  return geo
}

// ---------- 几何缓存 ----------
interface Built { body: THREE.BufferGeometry; eyes: THREE.BufferGeometry; fur: THREE.BufferGeometry; eyeDefs: EyeBones[]; stats: Record<string, number> }
const cache: Record<number, Built> = {}
function eyeDefs(): EyeBones[] {
  const mounts = [...headEyeMounts(), ...armEyeMounts()]
  let n = BONES.length
  return mounts.map((m) => { const e = { mount: m, gi: n, bi: n + 1, ui: n + 2, li: n + 3 }; n += 4; return e })
}
export function buildConciergeGeometry(lod = 0): Built {
  if (cache[lod]) return cache[lod]
  const t0 = performance.now(), stats: Record<string, number> = {}
  const ch = new Chunk()
  lodNow = lod; setHeadDetail(lod === 0); headTriRanges = []
  // 小部件先做（JIT 预热后再处理最大的头部），顺序不影响结果
  const order = parts().sort((a, b) => (a.name === 'head' ? 1 : 0) - (b.name === 'head' ? 1 : 0) || (a.name.startsWith('fore') ? -1 : 0) - (b.name.startsWith('fore') ? -1 : 0))
  for (const p of order) bakePart(ch, p, lod, stats)
  const t1 = performance.now()
  if (lod === 0) buildTeeth(ch)
  buildShells(ch, lod)
  const eyes = eyeDefs()
  buildLids(ch, eyes, lod)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(ch.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(ch.nrm, 3))
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(ch.flow, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(ch.col, 3)); g.setAttribute('aDet', new THREE.Float32BufferAttribute(ch.det, 4)); g.setAttribute('aRM', new THREE.Float32BufferAttribute(ch.rm, 2))
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(ch.si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(ch.sw, 4))
  g.setIndex(ch.n > 65535 ? new THREE.Uint32BufferAttribute(ch.idx, 1) : new THREE.Uint16BufferAttribute(ch.idx, 1))
  g.computeBoundingSphere(); g.boundingSphere!.radius *= 1.3
  const fur = buildFur(ch, lod); fur.computeBoundingSphere(); fur.boundingSphere!.radius = g.boundingSphere!.radius; fur.boundingSphere!.center.copy(g.boundingSphere!.center)
  stats.furTris = fur.index!.count / 3
  const eg = buildEyeballs(eyes, lod); eg.computeBoundingSphere(); eg.boundingSphere!.radius = g.boundingSphere!.radius; eg.boundingSphere!.center.copy(g.boundingSphere!.center)
  stats.bodyTris = ch.idx.length / 3; stats.eyeTris = eg.index!.count / 3; stats.tris = stats.bodyTris + stats.eyeTris
  setHeadDetail(true)
  stats.sdf_ms = Math.round(t1 - t0); stats.ms = Math.round(performance.now() - t0)
  return (cache[lod] = { body: g, eyes: eg, fur, eyeDefs: eyes, stats })
}

// ---------- 材质 ----------
let detailTex: THREE.Texture | null = null
/** 四通道可平铺细节：R 毛流笔触 / G 皮肤毛孔细纹 / B 棉布平纹 / A 毛呢斜纹 */
function detailTexture() {
  if (detailTex || typeof document === 'undefined') return detailTex
  const S = 256, c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d')!
  const img = g.createImageData(S, S), D = img.data
  let seed = 9; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const R = new Float32Array(S * S).fill(0.5), G = new Float32Array(S * S).fill(0.5)
  // 毛：短笔触（沿 v 方向），可平铺
  for (let k = 0; k < 2600; k++) {
    const x0 = rnd() * S, y0 = rnd() * S, L = 4 + rnd() * 9, v = rnd() < 0.5 ? -0.5 : 0.45, a = Math.PI / 2 + (rnd() - 0.5) * 0.5
    for (let t = 0; t < L; t++) { const x = Math.floor(x0 + Math.cos(a) * t + S) % S, y = Math.floor(y0 + Math.sin(a) * t + S) % S; R[y * S + x] = mix(R[y * S + x], 0.5 + v * (1 - t / L), 0.6) }
  }
  // 皮肤：毛孔点 + 细纹
  for (let k = 0; k < 1800; k++) { const x = Math.floor(rnd() * S), y = Math.floor(rnd() * S); G[y * S + x] = 0.2; G[y * S + ((x + 1) % S)] = 0.35 }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x
    G[i] += 0.12 * Math.sin((x + y * 0.3) * 0.35) * Math.sin(y * 0.11)
    const weave = 0.5 + 0.22 * Math.sin(x * Math.PI / 2) * Math.sin(y * Math.PI / 2) + 0.1 * (rnd() - 0.5) // 棉布平纹（4px 周期）
    const twill = 0.5 + 0.2 * Math.sin((x + y) * Math.PI / 3) + 0.08 * (rnd() - 0.5) // 毛呢斜纹
    D[i * 4] = clamp(R[i], 0, 1) * 255; D[i * 4 + 1] = clamp(G[i], 0, 1) * 255; D[i * 4 + 2] = clamp(weave, 0, 1) * 255; D[i * 4 + 3] = clamp(twill, 0, 1) * 255
  }
  g.putImageData(img, 0, 0)
  detailTex = new THREE.CanvasTexture(c); detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping; detailTex.premultiplyAlpha = false; detailTex.colorSpace = THREE.NoColorSpace
  return detailTex
}
let furStroke: THREE.Texture | null = null
/** 毛流笔触（可平铺）：沿 v 方向的细长笔触，亮暗交替、略带弯曲 */
function furStrokeTexture() {
  if (furStroke || typeof document === 'undefined') return furStroke
  const S = 256, c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d')!
  const img = g.createImageData(S, S), D = img.data, R = new Float32Array(S * S).fill(0.5)
  let seed = 31; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let k = 0; k < 3400; k++) {
    const x0 = rnd() * S, y0 = rnd() * S, L = 10 + rnd() * 20, v = rnd() < 0.5 ? 0.12 + rnd() * 0.15 : 0.7 + rnd() * 0.25, bend = (rnd() - 0.5) * 0.06, wdt = 1 + rnd() * 0.8
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
  furStroke = new THREE.CanvasTexture(c); furStroke.wrapS = furStroke.wrapT = THREE.RepeatWrapping; furStroke.colorSpace = THREE.NoColorSpace
  return furStroke
}
let bodyMat: THREE.Material | null = null, eyeMat: THREE.Material | null = null, furMat: THREE.Material | null = null
function materials() {
  if (bodyMat && eyeMat && furMat) return { bodyMat, eyeMat, furMat }
  const m = litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.8 })
  const tex = detailTexture(), ftex = furStrokeTexture()
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
        float furT = (sA.r - 0.5) * 0.7;
        // 毛流笔触：在切平面里沿毛流方向（顶点属性）展开平面坐标，采样细长笔触贴图（两个尺度叠加）
        if (dot(vCFlow, vCFlow) > 0.04) {
          vec3 Nn = normalize(vCBN); vec3 Tf = vCFlow - Nn * dot(vCFlow, Nn);
          if (dot(Tf, Tf) > 1e-4) {
            Tf = normalize(Tf); vec3 Bf = cross(Nn, Tf);
            vec2 fu = vec2(dot(vCBP, Bf), dot(vCBP, Tf)) * 6.5;
            float f1 = texture2D(cFur, fu).r, f2 = texture2D(cFur, fu * 2.37 + vec2(0.31, 0.17)).r;
            furT = (f1 - 0.5) * 0.95 + (f2 - 0.5) * 0.5;
          }
        }
        float dt = vCDet.x * furT + vCDet.y * (sB.g - 0.5) * 0.35 + vCDet.z * ((sB.b - 0.5) * 0.3 + (sA.b - 0.5) * 0.12) + vCDet.w * (sA.a - 0.5) * 0.4;
        diffuseColor.rgb *= 1.0 + dt;
      }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        // 湿亮（鼻头 / 唇 / 睑缘 / 口腔）：经典 Lambert 模式也给一个随视角的高光
        float wet = clamp((0.42 - vCRM.x) / 0.26, 0.0, 1.0) * (1.0 - vCRM.y);
        if (wet > 0.0) { vec3 Vv = normalize(vViewPosition); vec3 Hh = normalize(normalize(vec3(0.35, 0.62, 0.7)) + Vv); totalEmissiveRadiance += wet * 0.5 * pow(max(dot(normal, Hh), 0.0), 46.0) * vec3(1.0, 0.96, 0.9); }
      }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vCRM.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vCRM.y;')
  }
  m.customProgramCacheKey = () => key + '|concierge-v3'
  bodyMat = m
  const it = irisTexture()
  // v4：虹膜自发光加强（emissiveMap = 虹膜贴图，瞳孔仍黑）——暗光下也能看清四只眼
  eyeMat = litMaterial({ color: it ? '#ffffff' : '#e08a2a', map: it ?? undefined, emissive: '#a65a1a', emissiveIntensity: 0.65, roughness: 0.12 })
  const ft = furTexture()
  furMat = litMaterial({ color: '#ffffff', vertexColors: true, map: ft ?? undefined, alphaTest: ft ? 0.42 : 0, side: THREE.DoubleSide, roughness: 0.9 })
  return { bodyMat, eyeMat, furMat }
}

// ---------- 道具 ----------
const PM = {
  cream: litMaterial({ color: '#dcd5c3', roughness: 0.35 }), cord: litMaterial({ color: '#1c1b1b', roughness: 0.45 }),
  brass: litMaterial({ color: '#b39350', roughness: 0.3, metalness: 0.75 }), keyBlack: litMaterial({ color: '#1a1a1c', roughness: 0.4 }),
  china: litMaterial({ color: '#f1ede4', roughness: 0.25 }), gilt: litMaterial({ color: '#c9a65a', roughness: 0.3, metalness: 0.7 }), tea: litMaterial({ color: '#5e3112', roughness: 0.1 }),
  rope: litMaterial({ color: '#a88a5a', roughness: 1 }), steel: litMaterial({ color: '#c3c5ca', roughness: 0.3, metalness: 0.6 }),
}
function sweepTube(pts: THREE.Vector3[], r: (t: number) => number, seg = 10, rows = 40, closed = false) {
  const curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal')
  const g = new THREE.TubeGeometry(curve, rows, 1, seg, closed)
  const pa = g.attributes.position as THREE.BufferAttribute, P = new THREE.Vector3()
  for (let i = 0; i <= rows; i++) { const c = curve.getPointAt(i / rows); for (let j = 0; j <= seg; j++) { const k = i * (seg + 1) + j; P.fromBufferAttribute(pa, k).sub(c).multiplyScalar(r(i / rows)).add(c); pa.setXYZ(k, P.x, P.y, P.z) } }
  g.computeVertexNormals(); return g
}
function pmesh(g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, p?: THREE.Vector3) { const o = new THREE.Mesh(g, m); if (p) o.position.copy(p); o.castShadow = true; parent.add(o); return o }
function buildHandset() {
  const g = new THREE.Group(); g.name = 'handset'
  // 老式电木话筒：弯握把，两端听筒 / 话筒杯（原点在握把中部，听筒 +Y）
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  pmesh(sweepTube([V(0, -0.1, 0.03), V(0, -0.06, 0.004), V(0, 0, -0.004), V(0, 0.06, 0.004), V(0, 0.1, 0.03)], (t) => 0.0125 + 0.003 * Math.sin(t * Math.PI), 12, 30), PM.cream, g)
  for (const s of [-1, 1]) {
    const cup = new THREE.LatheGeometry([[0, 0], [0.024, 0], [0.03, 0.006], [0.031, 0.016], [0.027, 0.026], [0.02, 0.03], [0.014, 0.024], [0, 0.024]].map(([x, y]) => new THREE.Vector2(x, y)), 20)
    const m = pmesh(cup, PM.cream, g, V(0, s * 0.112, 0.036)); m.rotation.x = s > 0 ? Math.PI * 0.62 : -Math.PI * 0.62 + Math.PI
    for (let k = 0; k < 6; k++) { const h = pmesh(new THREE.CircleGeometry(0.0022, 6), PM.cord, m, V(Math.cos(k) * 0.009, 0.0245, Math.sin(k) * 0.009)); h.rotation.x = -Math.PI / 2 }
  }
  return g
}
function cordGeom() {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 420; i++) { const t = i / 420, a = t * 64 * Math.PI * 2, base = new THREE.Vector3(0.03 * t, -0.62 * Math.sin(t * Math.PI * 0.6), 0.1 * t); const r = 0.0085; pts.push(base.add(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.3, Math.sin(a) * r))) }
  return sweepTube(pts, () => 0.0024, 5, 800)
}
function buildKey() {
  const g = new THREE.Group(); g.name = 'key'
  const tt = keyTagTexture()
  const tagMat = tt ? litMaterial({ color: '#ffffff', map: tt, roughness: 0.3, metalness: 0.4 }) : PM.steel
  // 椭圆金属牌（附图：银色椭圆牌，蓝字 437）
  const shape = new THREE.Shape(); shape.absellipse(0, 0, 0.046, 0.026, 0, Math.PI * 2, false, 0)
  shape.holes.push(Object.assign(new THREE.Path(), {}).absellipse(-0.034, 0, 0.0045, 0.0045, 0, Math.PI * 2, true, 0) as unknown as THREE.Path)
  const tg = new THREE.ExtrudeGeometry(shape, { depth: 0.003, bevelEnabled: true, bevelSize: 0.0012, bevelThickness: 0.001, bevelSegments: 2, curveSegments: 24 })
  const uvs = tg.attributes.uv as THREE.BufferAttribute, ps = tg.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < uvs.count; i++) uvs.setXY(i, (ps.getX(i) + 0.046) / 0.092, (ps.getY(i) + 0.026) / 0.052)
  pmesh(tg, tagMat, g)
  pmesh(new THREE.TorusGeometry(0.009, 0.0014, 6, 18), PM.brass, g, new THREE.Vector3(-0.046, -0.006, 0.0015))
  const kg = new THREE.Group(); kg.position.set(-0.05, -0.02, 0.0015); kg.rotation.z = 0.25; g.add(kg)
  pmesh(new THREE.BoxGeometry(0.022, 0.03, 0.007), PM.keyBlack, kg, new THREE.Vector3(0, -0.014, 0))
  pmesh(new THREE.BoxGeometry(0.0065, 0.048, 0.0025), PM.brass, kg, new THREE.Vector3(0, -0.052, 0))
  for (let i = 0; i < 4; i++) pmesh(new THREE.BoxGeometry(0.004, 0.004 + (i % 2) * 0.002, 0.0025), PM.brass, kg, new THREE.Vector3(0.005, -0.04 - i * 0.009, 0))
  return g
}
function buildCup() {
  const g = new THREE.Group(); g.name = 'cup'
  const prof = [[0.0, 0], [0.024, 0], [0.027, 0.004], [0.034, 0.03], [0.041, 0.052], [0.043, 0.056], [0.04, 0.056], [0.032, 0.03], [0.022, 0.008], [0, 0.008]].map(([x, y]) => new THREE.Vector2(x, y))
  pmesh(new THREE.LatheGeometry(prof, 28), PM.china, g)
  pmesh(new THREE.TorusGeometry(0.0425, 0.0012, 4, 32), PM.gilt, g, new THREE.Vector3(0, 0.056, 0)).rotation.x = Math.PI / 2
  pmesh(new THREE.CircleGeometry(0.036, 24).rotateX(-Math.PI / 2), PM.tea, g, new THREE.Vector3(0, 0.046, 0))
  pmesh(new THREE.TorusGeometry(0.012, 0.0032, 8, 14, Math.PI * 1.3), PM.china, g, new THREE.Vector3(0.042, 0.032, 0)).rotation.z = -Math.PI * 0.65
  const saucer = [[0, 0], [0.05, 0], [0.068, 0.008], [0.072, 0.012], [0.066, 0.01], [0.03, 0.004], [0, 0.004]].map(([x, y]) => new THREE.Vector2(x, y))
  pmesh(new THREE.LatheGeometry(saucer, 32), PM.china, g, new THREE.Vector3(0, -0.006, 0))
  return g
}
function buildRope() {
  const g = new THREE.Group(); g.name = 'rope'
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 160; i++) { const t = i / 160, a = t * 6 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * 0.058, -t * 0.035 + Math.sin(a * 0.5) * 0.004, Math.sin(a) * 0.058 * 0.5)) }
  pmesh(sweepTube(pts, () => 0.0058, 6, 320), PM.rope, g)
  pmesh(sweepTube([new THREE.Vector3(0.058, -0.035, 0), new THREE.Vector3(0.066, -0.11, 0.01), new THREE.Vector3(0.05, -0.2, 0.0)], () => 0.0058, 6, 24), PM.rope, g)
  // 捆扎的两道
  for (const x of [-0.05, 0.05]) pmesh(new THREE.TorusGeometry(0.012, 0.004, 6, 12), PM.rope, g, new THREE.Vector3(x, -0.017, 0)).rotation.y = Math.PI / 2
  return g
}

// ---------- 装配 ----------
export interface CArm { side: number; clav: THREE.Bone; shoulder: THREE.Bone; elbow: THREE.Bone; wrist: THREE.Bone; eyes: CEye[]; fingers: Record<'thumb' | 'index' | 'middle' | 'ring' | 'pinky', THREE.Bone[]> }
export interface CLeg { side: number; hip: THREE.Bone; knee: THREE.Bone; hock: THREE.Bone; pastern: THREE.Bone; kneeFix?: THREE.Bone; kneeIn?: THREE.Bone }
export interface ConciergeRig {
  root: THREE.Bone; hips: THREE.Bone; spine: THREE.Bone; chest: THREE.Bone; neck: THREE.Bone; head: THREE.Bone; tie: THREE.Bone
  jaw: THREE.Bone; earL: THREE.Bone; earR: THREE.Bone; headEyes: CEye[]
  armL: CArm; armR: CArm; legL: CLeg; legR: CLeg
  handset: THREE.Group; cord: THREE.Mesh; key: THREE.Group; cup: THREE.Group; rope: THREE.Group
  bones: Record<string, THREE.Bone>; body: THREE.SkinnedMesh; eyeMesh: THREE.SkinnedMesh; furMesh: THREE.SkinnedMesh; lod: number
}

/** 造一个看门人实例（几何 / 材质按 LOD 共享缓存；骨骼每实例一套）。lod: 0 ≈ 6.4 万三角形（+ 发片 ≈ 2.6k），1 ≈ 1.5 万（+ 发片 ≈ 1.7k） */
export function buildConciergeMesh(opts: { lod?: number } = {}): THREE.Group {
  const lod = opts.lod ?? 0
  const geo = buildConciergeGeometry(lod)
  const { bodyMat, eyeMat, furMat } = materials()
  shareHotelRigAssets({ ...geo, bodyMat, eyeMat, furMat })
  const face = new THREE.Group(); face.name = 'concierge'; face.rotation.y = Math.PI / 2; face.userData.facesZ = 1
  // 骨骼
  const bones: THREE.Bone[] = []
  for (const d of BONES) {
    const b = new THREE.Bone(); b.name = d.name
    const pp = d.parent >= 0 ? BONES[d.parent].pos : [0, 0, 0]
    b.position.set(d.pos[0] - pp[0], d.pos[1] - pp[1], d.pos[2] - pp[2])
    if (d.flex) b.userData.flexAxis = new THREE.Vector3(...d.flex)
    if (d.q) b.quaternion.set(...d.q)
    if (d.parent >= 0) bones[d.parent].add(b)
    bones.push(b)
  }
  const mkEye = (e: EyeBones): CEye => {
    const M = e.mount, parent = bones[B[M.parent]], pp = BONES[B[M.parent]].pos
    const Z = nrm(M.z), X = nrm(sub(M.x, scl(Z, dot(M.x, Z)))), Y = cross(Z, X)
    const g = new THREE.Bone(); g.name = 'eye'; g.position.set(M.c[0] - pp[0], M.c[1] - pp[1], M.c[2] - pp[2])
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...X), new THREE.Vector3(...Y), new THREE.Vector3(...Z)))
    parent.add(g)
    const ball = new THREE.Bone(), lidU = new THREE.Bone(), lidL = new THREE.Bone()
    ball.name = 'eyeBall'; lidU.name = 'lidU'; lidL.name = 'lidL'
    lidU.rotation.x = M.open[0]; lidL.rotation.x = M.open[1]
    g.add(ball, lidU, lidL)
    bones[e.gi] = g; bones[e.bi] = ball; bones[e.ui] = lidU; bones[e.li] = lidL
    return { g, ball, lidU, lidL, open: M.open, r: M.r }
  }
  const eyes = geo.eyeDefs.map(mkEye)
  face.add(bones[0])
  const body = new THREE.SkinnedMesh(geo.body, bodyMat); body.name = 'conciergeBody'; body.castShadow = true; body.receiveShadow = true
  const eyeMesh = new THREE.SkinnedMesh(geo.eyes, eyeMat); eyeMesh.name = 'conciergeEyes'
  const furMesh = new THREE.SkinnedMesh(geo.fur, furMat); furMesh.name = 'conciergeFur'
  face.add(body, eyeMesh, furMesh)
  face.updateMatrixWorld(true)
  // 眼睑的绑定姿态 = 睁开；骨骼逆矩阵在此刻计算
  const skel = new THREE.Skeleton(bones)
  body.bind(skel, body.matrixWorld); eyeMesh.bind(skel, eyeMesh.matrixWorld); furMesh.bind(skel, furMesh.matrixWorld)
  for (const b of bones) b.userData.rest = { p: b.position.clone(), q: b.quaternion.clone() }
  const bn: Record<string, THREE.Bone> = {}; for (const d of BONES) bn[d.name] = bones[B[d.name]]
  const arm = (s: number): CArm => {
    const S = s > 0 ? 'L' : 'R'
    const fingers = {} as CArm['fingers']
    for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky'] as const) fingers[f] = [1, 2, 3].map((k) => bn[f + k + S])
    const eyesOf = eyes.filter((_, i) => geo.eyeDefs[i].mount.parent === 'foreArm' + S)
    return { side: s, clav: bn['clav' + S], shoulder: bn['upperArm' + S], elbow: bn['foreArm' + S], wrist: bn['hand' + S], eyes: eyesOf, fingers }
  }
  const leg = (s: number): CLeg => { const S = s > 0 ? 'L' : 'R'; return { side: s, hip: bn['thigh' + S], knee: bn['shin' + S], hock: bn['hock' + S], pastern: bn['pastern' + S], kneeFix: bn['kneeFix' + S], kneeIn: bn['kneeIn' + S] } }
  // 道具（挂骨骼，默认隐藏）
  const handR = bn.handR, handL = bn.handL
  const FR = HANDS[-1].F, FL = HANDS[1].F
  const handset = buildHandset(); handset.visible = false; handR.add(handset)
  { const p = sub(add(FR.o, add(scl(FR.a, 0.07), scl(FR.d, -0.03))), side(J.wrist, -1)); handset.position.set(p[0], p[1], p[2]) }
  const cord = new THREE.Mesh(cordGeom(), PM.cord); cord.name = 'cord'; cord.position.set(0, -0.1, 0.03); handset.add(cord)
  const key = buildKey(); key.visible = false; handL.add(key)
  { const p = sub(add(FL.o, add(scl(FL.a, 0.12), scl(FL.d, -0.025))), side(J.wrist, 1)); key.position.set(p[0], p[1], p[2]) }
  const cup = buildCup(); cup.visible = false; handR.add(cup)
  { const p = sub(add(FR.o, add(scl(FR.a, 0.09), scl(FR.d, -0.05))), side(J.wrist, -1)); cup.position.set(p[0], p[1], p[2]) }
  const rope = buildRope(); rope.visible = false; bn.hips.add(rope); rope.position.set(-0.16, 0.035, -0.035); rope.rotation.set(0, 0.3, Math.PI / 2 - 0.15)
  const rig: ConciergeRig = {
    root: bones[0], hips: bn.hips, spine: bn.spine, chest: bn.chest, neck: bn.neck, head: bn.head, tie: bn.tie, jaw: bn.jaw, earL: bn.earL, earR: bn.earR,
    headEyes: eyes.filter((_, i) => geo.eyeDefs[i].mount.parent === 'head'), armL: arm(1), armR: arm(-1), legL: leg(1), legR: leg(-1),
    handset, cord, key, cup, rope, bones: bn, body, eyeMesh, furMesh, lod,
  }
  face.userData.concierge = rig
  face.userData.conciergeStats = geo.stats
  return face
}

/** 三角形统计（验收 / 预览用；不含默认隐藏的道具） */
export function conciergeTris(o: THREE.Object3D) {
  let t = 0, n = 0, fur = 0
  o.traverse((m) => { const x = m as THREE.Mesh; if (!x.isMesh || x.userData.cpuSkin) return; let vis = true; for (let p: THREE.Object3D | null = x; p && p !== o; p = p.parent) if (!p.visible) vis = false; if (!vis) return; n++; const g = x.geometry, k = (g.index ? g.index.count : g.attributes.position.count) / 3; if (x.name === 'conciergeFur') fur += k; else t += k })
  /** tris = 本体（身体 + 眼球），fur = 发片（另算） */
  return { tris: Math.round(t), meshes: n, fur: Math.round(fur) }
}
void rot; void lenv; void gauss
