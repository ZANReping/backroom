// 牧蛇（Entity 75）第 2 阶段：程序化动画。
// 躯体动画全部落到「脊线」上：每个片段在给定时刻 t 算出一条从头后颈往尾巴的折线 + 滚转函数 + 张嘴量，交给 setWranglerSpine。
// 核心是「跟随轨迹」：头沿一条路线前进，身体严格踩着头走过的路（蛇类的 follow-the-leader），
// 所以钻洞、切出、缩回都只是「头在轨迹上走到哪」的问题，身体自然被岩壁/地面遮住。
//
// 片段（全部是 t 的纯函数，可任意取帧；游戏里由 wranglerAI 选片段与时间）：
//  · slither 爬行：地面上的横向波动蜿蜒（循环）
//  · coil 栖息：盘成一团，缓慢呼吸，头微微摆（循环）
//  · drill 钻地：斜着扎进地面，全身螺旋自转——像钻头（循环）
//  · emerge 切出：岩壁先鼓包、再破洞，头探出并垂下（单次）
//  · hypno 催眠：前半身抬起，做缓慢的 8 字摆动，体表一道道波纹往后传（循环）
//  · strike 吞咽：后缩蓄力 → 张嘴（雄性下颌脱开 / 雌性张钳）前扑 → 合嘴 → 吞咽鼓包沿身体往后走（单次）
//  · graze 啃岩：雌性把头抵在岩壁上，口器钳一开一合地啃（循环）
//  · retreat 后撤：头一甩，沿来路倒退缩回洞里（单次）
//  · hop 蹦跳：幼体在母亲身边弹跳（循环）
import * as THREE from 'three'
import { setWranglerSpine, setWranglerMouth, setWranglerBulge, WRANGLER_DIM, type WranglerRig, type WranglerKind } from './wranglerMesh'

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
const smooth = (a: number, b: number, t: number) => { const k = clamp01((t - a) / (b - a)); return k * k * (3 - 2 * k) }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export type WranglerClip = 'slither' | 'coil' | 'drill' | 'emerge' | 'hypno' | 'strike' | 'graze' | 'retreat' | 'hop'
export const WRANGLER_CLIPS: Record<WranglerKind, Partial<Record<WranglerClip, { len: number; loop: boolean }>>> = {
  male: { slither: { len: 2.4, loop: true }, coil: { len: 5, loop: true }, drill: { len: 1.6, loop: true }, emerge: { len: 2.6, loop: false }, hypno: { len: 3.2, loop: true }, strike: { len: 1.8, loop: false }, retreat: { len: 2.2, loop: false } },
  female: { slither: { len: 2.8, loop: true }, coil: { len: 5, loop: true }, drill: { len: 1.8, loop: true }, emerge: { len: 2.8, loop: false }, hypno: { len: 3.4, loop: true }, strike: { len: 1.9, loop: false }, graze: { len: 1.6, loop: true }, retreat: { len: 2.0, loop: false } },
  juvenile: { slither: { len: 1.1, loop: true }, coil: { len: 4, loop: true }, drill: { len: 1.0, loop: true }, hop: { len: 0.9, loop: true } },
}

// ---------------------------------------------------------------------------
// 轨迹：按弧长采样的折线
// ---------------------------------------------------------------------------
export class Trail {
  pts: THREE.Vector3[]; acc: number[]
  constructor(pts: THREE.Vector3[]) {
    this.pts = pts; this.acc = [0]
    for (let i = 1; i < pts.length; i++) this.acc.push(this.acc[i - 1] + pts[i].distanceTo(pts[i - 1]))
  }
  get length() { return this.acc[this.acc.length - 1] }
  at(d: number, out = V(0, 0, 0)) {
    const L = this.length
    if (d <= 0) { const dir = this.pts[1].clone().sub(this.pts[0]).normalize(); return out.copy(this.pts[0]).addScaledVector(dir, d) }
    if (d >= L) { const n = this.pts.length; const dir = this.pts[n - 1].clone().sub(this.pts[n - 2]).normalize(); return out.copy(this.pts[n - 1]).addScaledVector(dir, d - L) }
    let lo = 0, hi = this.acc.length - 1
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.acc[m] <= d) lo = m; else hi = m }
    const f = (d - this.acc[lo]) / (this.acc[hi] - this.acc[lo] || 1)
    return out.copy(this.pts[lo]).lerp(this.pts[hi], f)
  }
  /** 头在轨迹 d 处，身体沿轨迹往回 len 米（越过起点就沿起点切线延伸——那一截在岩石里） */
  body(d: number, len: number, step = 0.4) {
    const out: THREE.Vector3[] = []
    for (let s = 0; s <= len + 1e-6; s += step) out.push(this.at(d - s))
    return out
  }
}
const cr = (pts: THREE.Vector3[], n = 160) => new THREE.CatmullRomCurve3(pts, false, 'centripetal').getSpacedPoints(n)

export interface WranglerPoseOpts {
  /** 原型/游戏：头的目标点（吞咽前扑、催眠盯视用） */
  target?: THREE.Vector3
}
export interface WranglerPoseOut { mouth: number; bulge: number; rock: number; hole?: { pos: THREE.Vector3; normal: THREE.Vector3; open: number } }

/**
 * 摆一帧。所有片段在一个本地舞台里：地面 y=0，头大致在原点附近朝 +X，岩壁在 x=-2（切出/后撤用，法向 +X）。
 * 返回额外表现量（张嘴、吞咽鼓包位置、岩壁鼓包程度），供原型页和游戏渲染道具。
 */
export function poseWrangler(rig: WranglerRig, clip: WranglerClip, t: number, o: WranglerPoseOpts = {}): WranglerPoseOut {
  const kind = rig.kind, D = WRANGLER_DIM[kind], L = rig.len, R = D.r
  const k = kind === 'juvenile' ? 0.22 : kind === 'female' ? 1.1 : 1 // 动作幅度随体型
  const res: WranglerPoseOut = { mouth: 0, bulge: -1, rock: 0 }
  const tau = Math.PI * 2
  let path: THREE.Vector3[] = []
  let roll: ((s: number) => number) | undefined
  switch (clip) {
    case 'slither': {
      // 横向波动：波形相对地面静止、身体沿着它往前滑（真实蛇行），头只轻微左右点
      const len = WRANGLER_CLIPS[kind].slither!.len, ph = (t / len) * tau
      const lam = (kind === 'juvenile' ? 1.4 : 7) * (kind === 'female' ? 1.15 : 1), A = (kind === 'juvenile' ? 0.22 : 1.2) * (kind === 'female' ? 0.8 : 1)
      const adv = (t / len) * lam // 每个周期前进一个波长
      for (let s = 0; s <= L + 1e-6; s += kind === 'juvenile' ? 0.05 : 0.4) {
        const x = adv - s, env = smooth(0, lam * 0.4, s) // 头附近波幅小，头保持朝前
        path.push(V(x, R * 0.98, Math.sin((x / lam) * tau) * A * (0.25 + 0.75 * env)))
      }
      path[0].y += Math.sin(ph * 2) * R * 0.05
      break
    }
    case 'coil': {
      const len = WRANGLER_CLIPS[kind].coil!.len, ph = (t / len) * tau
      const br = 1 + 0.025 * Math.sin(ph) // 呼吸
      const hx = 0.4 + Math.sin(ph) * 0.15 * k, hz = Math.sin(ph * 0.5) * 0.3 * k, hy = R * (kind === 'juvenile' ? 3.5 : 3.6) + Math.sin(ph + 1) * 0.08 * k
      const ctr = V(-R * 3.2, 0, -R * 3.6), R0 = R * 2.6, R1 = R * 5.4
      const pts = [V(hx, hy, hz), V(hx - R * 1.2, hy - R * 0.3, hz - R * 0.4), V(hx - R * 2.2, hy * 0.45 + R * 0.55, hz - R * 1.2)]
      const a0 = Math.atan2(pts[2].z - ctr.z, pts[2].x - ctr.x), turns = 1.3
      for (let i = 1; i <= 40; i++) {
        const u = i / 40, a = a0 + u * turns * tau, r = (R0 + (R1 - R0) * u) * br
        pts.push(V(ctr.x + Math.cos(a) * r, R * 0.98 + (u < 0.5 ? R * 1.85 * (1 - u * 2) * 0 : 0), ctr.z + Math.sin(a) * r))
      }
      path = cr(pts, 260)
      break
    }
    case 'drill': {
      // 斜扎入地：轨迹是一条 35° 下潜直线，头沿轨迹往地下走；全身绕切线高速自转、螺旋纹往后传
      const len = WRANGLER_CLIPS[kind].drill!.len, u = t / len
      const dir = V(Math.cos(0.6), -Math.sin(0.6), 0).normalize()
      const entry = V(0, 0, 0)
      const back = (kind === 'juvenile' ? 2.2 : 14)
      const trail = new Trail([entry.clone().addScaledVector(dir, -back * 2).setY(R * 0.98), entry.clone().addScaledVector(dir, -back * 0.5).setY(R * 0.98 + back * 0.12), entry.clone(), entry.clone().addScaledVector(dir, 60)])
      const hd = back * 2 - (kind === 'juvenile' ? 0.5 : 3) + u * (kind === 'juvenile' ? 1.4 : 6)
      path = trail.body(hd, L, kind === 'juvenile' ? 0.05 : 0.4)
      const spin = (kind === 'juvenile' ? 7 : 4.5) * tau * t
      roll = (s) => spin - s * (kind === 'juvenile' ? 6 : 1.1)
      res.hole = { pos: entry.clone().setY(0.01), normal: V(0, 1, 0), open: 1 }
      res.rock = 1
      break
    }
    case 'emerge':
    case 'retreat': {
      // 岩壁在 x=-2，洞心高 3R。轨迹：壁内水平 → 出洞 → 向前下方垂头
      const emerge = clip === 'emerge', len = WRANGLER_CLIPS[kind][clip]!.len, u = t / len
      const wallX = -2, hy = R * 3.4
      const W0 = V(wallX, hy, 0)
      const inside = [V(wallX - 40, hy, 0), V(wallX - 20, hy, 0), V(wallX - 0.5, hy, 0)]
      const outside = cr([W0, V(wallX + R * 2.5, hy - R * 0.1, 0.3 * k), V(wallX + R * 4.5, hy - R * 1.1, 0.6 * k), V(wallX + R * 5.5, hy - R * 2.4, 0.4 * k)], 120)
      const trail = new Trail([...inside, ...outside])
      const inLen = 40, outLen = trail.length - inLen
      let p: number
      if (emerge) {
        // 0–0.35 鼓包（头还在壁里），0.35–1 破壁探出
        res.rock = smooth(0, 0.3, u) * (1 - smooth(0.38, 0.5, u))
        p = inLen + lerp(-R * 3, outLen, smooth(0.35, 1, u) ** 0.8)
        res.hole = { pos: V(wallX + 0.01, hy, 0), normal: V(1, 0, 0), open: smooth(0.33, 0.42, u) }
        res.mouth = smooth(0.8, 0.95, u) * 0.12
      } else {
        // 头先一甩（0–0.2），然后整条沿轨迹倒退
        p = inLen + lerp(outLen, -R * 3.2, smooth(0.15, 1, u))
        res.hole = { pos: V(wallX + 0.01, hy, 0), normal: V(1, 0, 0), open: 1 }
      }
      path = trail.body(p, L, kind === 'juvenile' ? 0.05 : 0.4)
      if (!emerge) { const flick = Math.sin(smooth(0, 0.22, u) * Math.PI) * 0.7 * k; for (let i = 0; i < Math.min(8, path.length); i++) path[i].z += flick * (1 - i / 8) }
      break
    }
    case 'hypno': {
      // 前 6m 抬起成「？」形，头端画 8 字；体表一道道横波往后传（身体左右的小幅波）
      const len = WRANGLER_CLIPS[kind].hypno!.len, ph = (t / len) * tau
      const hy = R * 4.2
      const hx = 0.6 * k * Math.sin(ph * 2) * 0.4, hz = Math.sin(ph) * 1.1 * k
      const pts = [V(R * 1.2 + hx, hy + Math.sin(ph * 2) * 0.25 * k, hz)]
      pts.push(V(R * 0.2, hy + R * 0.5, hz * 0.6))
      pts.push(V(-R * 1.6, hy - R * 0.4, hz * 0.2))
      pts.push(V(-R * 2.6, R * 1.6, -hz * 0.3))
      for (let x = -R * 3.2, i = 0; x > -L - 4; x -= 1.2, i++) pts.push(V(x, R * 0.98, Math.sin(x * 0.55 + ph * 1.8) * 0.9 * k * smooth(-R * 3.2, -R * 8, x)))
      path = cr(pts, 300)
      res.mouth = kind === 'male' ? 0.08 + 0.05 * Math.sin(ph * 3) : 0.1
      break
    }
    case 'strike': {
      // 0–0.45 后缩蓄力（S 形压缩），0.45–0.7 张嘴前扑，0.7–0.95 合嘴，之后吞咽鼓包沿身体往后走
      const len = WRANGLER_CLIPS[kind].strike!.len, u = t / len
      const tgt = o.target ?? V(R * 6, R * 1.6, 0)
      const coilK = smooth(0, 0.42, u) * (1 - smooth(0.45, 0.6, u))
      const lunge = smooth(0.45, 0.66, u) * (1 - smooth(0.75, 1, u) * 0.6)
      const head = V(lerp(R * 1.2, tgt.x, lunge) - coilK * R * 1.6, lerp(R * 2.8, tgt.y, lunge) + coilK * R * 0.8, lerp(0, tgt.z, lunge))
      const pts = [head, head.clone().add(V(-R * 1.4, -R * 0.2, coilK * R * 1.4)), V(-R * 1.2 - coilK * R, R * 1.5, -coilK * R * 1.6), V(-R * 3.4, R * 0.98, coilK * R * 1.2)]
      for (let x = -R * 4.5; x > -L - 4; x -= 1.5) pts.push(V(x, R * 0.98, Math.sin(x * 0.4) * 0.6))
      path = cr(pts, 300)
      res.mouth = smooth(0.4, 0.55, u) * (1 - smooth(0.68, 0.78, u))
      res.bulge = u > 0.75 ? lerp(1.5, L * 0.6, smooth(0.75, 1, u)) : -1
      break
    }
    case 'graze': {
      // 头抵在岩壁（x=-2 的反向：这里壁在头前方 x=R*2.2）上，一下下往里拱；口器钳开合
      const len = WRANGLER_CLIPS[kind].graze!.len, ph = (t / len) * tau
      const push = 0.12 * Math.max(0, Math.sin(ph))
      const pts = [V(R * 1.1 + push, R * 1.6 + Math.sin(ph) * 0.05, 0), V(-R * 0.6, R * 1.3, 0.3), V(-R * 2.8, R * 0.98, -0.6)]
      for (let x = -R * 4.2; x > -L - 4; x -= 1.5) pts.push(V(x, R * 0.98, Math.sin(x * 0.35) * 1.2))
      path = cr(pts, 300)
      res.mouth = 0.5 + 0.5 * Math.sin(ph * 2)
      res.rock = 0.5 + 0.5 * Math.sin(ph * 2)
      break
    }
    case 'hop': {
      // 弹跳：身体先压成 S、再弹起离地画抛物线、落地回弹
      const len = WRANGLER_CLIPS[kind].hop!.len, u = (t % len) / len
      const air = Math.sin(Math.PI * clamp01((u - 0.25) / 0.55)), h = air * 0.9
      const squash = (1 - smooth(0.0, 0.25, u)) * 0 + smooth(0.1, 0.25, u) * (1 - smooth(0.25, 0.35, u))
      const fx = lerp(-0.4, 0.6, smooth(0.25, 0.8, u))
      for (let s = 0; s <= L + 1e-6; s += 0.05) {
        const arc = h * Math.sin(Math.PI * clamp01(s / L)) * (1 - s / L * 0.4)
        path.push(V(fx - s * (1 - squash * 0.25), R * 0.98 + arc + (s < 0.6 ? air * 0.1 : 0), Math.sin(s * 3.2) * (0.12 + squash * 0.25)))
      }
      break
    }
  }
  setWranglerSpine(rig, path, roll)
  setWranglerMouth(rig, res.mouth)
  setWranglerBulge(rig, res.bulge)
  return res
}

// ---------------------------------------------------------------------------
// 岩壁鼓包（切出前）：一块随 rock 值隆起的岩面
// ---------------------------------------------------------------------------
export function buildRockBulge(r: number) {
  const geo = new THREE.CircleGeometry(r * 2.2, 40, 0, Math.PI * 2)
  const P = geo.attributes.position, base = new Float32Array(P.count)
  for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i); base[i] = Math.max(0, 1 - Math.hypot(x, y) / (r * 2.2)) }
  const cols: number[] = []
  for (let i = 0; i < P.count; i++) { const v = 0.55 + 0.1 * Math.sin(P.getX(i) * 7) * Math.cos(P.getY(i) * 5); cols.push(v, v * 0.95, v * 0.88) }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#5a5248', vertexColors: true, side: THREE.DoubleSide }))
  m.userData.setBulge = (k: number) => {
    for (let i = 0; i < P.count; i++) { const b = base[i]; P.setZ(i, k * r * 1.1 * b * b * (3 - 2 * b) + (k > 0.6 ? Math.sin(i * 12.9) * 0.04 * (k - 0.6) : 0)) }
    P.needsUpdate = true; geo.computeVertexNormals()
  }
  return m
}
