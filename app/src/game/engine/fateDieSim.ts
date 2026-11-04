// [l5items v2] O666 命运之骰的 3D 投掷动画——纯数学刚体模拟（无 THREE 依赖，可无头校验）。
// 结果先由 o666Roll 决定，动画只负责「看起来真的是滚出来的」：
//   1) 自由刚体：立方体 8 个角点对地面 / 墙面平面做冲量碰撞（恢复系数 + 库仑摩擦 + 微弱阻尼），240 Hz 积分；
//   2) 停稳后若未完全平躺（靠墙斜倚等），最后 0.18 s 平滑吸附到最近的平躺朝向；
//   3) 朝上面：立方体 24 个对称旋转里取 S，使 S·目标面 = 实际朝上面，整段轨迹右乘 S——几何完全相同（立方体对称），
//      碰撞与轨迹一帧不变，只是「哪一面」被重新编号，所以最终朝上面严格 = 结果，没有任何末段扭转。
//   4) 「立在棱上」：自由滚动到速度降下来后接管，绕最近一条着地棱做衰减摆动，最终角度精确 45°、角速度 0（不稳定平衡，靠近 2.2 m 才倒）。
//   5) 「封闭房间转 5 min」：落地平躺后绕竖轴加速到 ~38 rad/s 原地高速旋转（嗡鸣由音效层按 spinRate 调），结束时 cracked。
export type Q = [number, number, number, number] // x y z w
export type V = [number, number, number]
export interface DieFrame { t: number; p: V; q: Q }
export interface DiePlane { n: V; d: number } // n·x = d（n 指向可活动区域）
export type DieMode = 'flat' | 'edge' | 'spin'
export interface DieThrowOpts {
  seed: number
  /** 目标朝上的骰面局部轴序号：0 +Y, 1 -Y, 2 +X, 3 -X, 4 +Z, 5 -Z */
  topFace: number
  mode: DieMode
  /** 出手点（相对玩家，m）与水平朝向（rad，+x 为 0，朝 +z 为 π/2） */
  from?: V
  yaw?: number
  half?: number // 半边长 m
  walls?: DiePlane[]
}
export interface DieThrow { frames: DieFrame[]; settleT: number; dt: number; mode: DieMode; topFace: number; half: number; bounces: number; edgeAxis?: V }

export const FACE_AXES: V[] = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]
// ---- 小型四元数 / 向量 ----
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: V) => Math.hypot(a[0], a[1], a[2])
export function qmul(a: Q, b: Q): Q {
  return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]
}
const qnorm = (q: Q): Q => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l] }
export const qaxis = (ax: V, ang: number): Q => { const l = len(ax) || 1, s = Math.sin(ang / 2) / l; return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)] }
export function qrot(q: Q, v: V): V { const u: V = [q[0], q[1], q[2]], t = mul(cross(u, v), 2); return add(add(v, mul(t, q[3])), cross(u, t)) }
export function qslerp(a: Q, b: Q, t: number): Q {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; let bb = b
  if (d < 0) { d = -d; bb = [-b[0], -b[1], -b[2], -b[3]] }
  if (d > .9995) return qnorm([a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t])
  const th = Math.acos(d), s = Math.sin(th), k0 = Math.sin((1 - t) * th) / s, k1 = Math.sin(t * th) / s
  return [a[0] * k0 + bb[0] * k1, a[1] * k0 + bb[1] * k1, a[2] * k0 + bb[2] * k1, a[3] * k0 + bb[3] * k1]
}
function rng(seed: number) { let s = (seed >>> 0) || 1; return () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296) }

/** 立方体 24 个旋转对称（四元数）。 */
export const CUBE_SYM: Q[] = (() => {
  const out: Q[] = [], seen = new Set<string>()
  const gens: Q[] = [[0, 0, 0, 1], qaxis([1, 0, 0], Math.PI / 2), qaxis([0, 1, 0], Math.PI / 2), qaxis([0, 0, 1], Math.PI / 2)]
  const key = (q: Q) => { const s = q[3] < -1e-6 || (Math.abs(q[3]) < 1e-6 && (q[0] < -1e-6 || (Math.abs(q[0]) < 1e-6 && (q[1] < -1e-6 || (Math.abs(q[1]) < 1e-6 && q[2] < 0))))) ? -1 : 1; return q.map((v) => Math.round(v * s * 1000)).join(',') }
  const queue: Q[] = [[0, 0, 0, 1]]
  while (queue.length) { const q = queue.shift()!; const k = key(q); if (seen.has(k)) continue; seen.add(k); out.push(q); for (const g of gens) queue.push(qnorm(qmul(q, g))) }
  return out
})()
/** 当前朝向下世界 +Y 对应的局部面序号（取最接近的） */
export function upFace(q: Q): { face: number; cos: number } {
  let best = 0, bc = -2
  for (let i = 0; i < 6; i++) { const c = qrot(q, FACE_AXES[i])[1]; if (c > bc) { bc = c; best = i } }
  return { face: best, cos: bc }
}

export function simulateDieThrow(o: DieThrowOpts): DieThrow {
  const R = rng(o.seed * 2654435761 + 17), h = o.half ?? .03, dt = 1 / 240
  const yaw = o.yaw ?? 0, fwd: V = [Math.cos(yaw), 0, Math.sin(yaw)]
  const planes: DiePlane[] = [{ n: [0, 1, 0], d: 0 }, ...(o.walls ?? [])]
  // 出手：胸口高度，向前上方抛出（抛物线），附带随机自旋
  let p: V = o.from ? [...o.from] as V : [fwd[0] * .35, 1.15, fwd[2] * .35]
  const speed = 1.7 + R() * .7
  let v: V = add(mul(fwd, speed), [(R() - .5) * .5, 1.1 + R() * .6, (R() - .5) * .5])
  let w: V = [(R() - .5) * 28, (R() - .5) * 18, (R() - .5) * 28]
  let q: Q = qnorm([R() - .5, R() - .5, R() - .5, R() - .5])
  const m = 1, I = (m * (2 * h) * (2 * h)) / 6, invI = 1 / I // 匀质立方体主惯量（各向同性）
  const e = .32, mu = .38, corners: V[] = []
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) corners.push([sx * h, sy * h, sz * h])
  const frames: DieFrame[] = []
  let ws = 9, vs = 9, t = 0, still = 0, bounces = 0, wasAir = true, takeover = -1
  const edgeMode = o.mode === 'edge'
  for (let step = 0; step < 240 * 8; step++) {
    // 积分
    v = add(v, [0, -9.81 * dt, 0])
    p = add(p, mul(v, dt))
    const wl = len(w); if (wl > 1e-9) q = qnorm(qmul(qaxis(w, wl * dt), q))
    // 接触（多次迭代，每个角点对每个平面）
    let touching = false
    for (let it = 0; it < 4; it++) for (const pl of planes) for (const c of corners) {
      const r = qrot(q, c), wp = add(p, r), pen = pl.d - dot(pl.n, wp)
      if (pen <= 0) continue
      touching = true
      p = add(p, mul(pl.n, pen * .8)) // 位置纠正
      const vc = add(v, cross(w, r)), vn = dot(vc, pl.n)
      if (vn >= 0) continue
      const rn = cross(r, pl.n), kn = 1 / m + invI * dot(rn, rn)
      const jn = (-(1 + (Math.abs(vn) < .25 ? 0 : e)) * vn) / kn
      v = add(v, mul(pl.n, jn / m)); w = add(w, mul(cross(r, pl.n), jn * invI))
      // 摩擦
      const vc2 = add(v, cross(w, r)), vt = sub(vc2, mul(pl.n, dot(vc2, pl.n))), vtl = len(vt)
      if (vtl > 1e-6) {
        const tdir = mul(vt, 1 / vtl), rt = cross(r, tdir), kt = 1 / m + invI * dot(rt, rt)
        const jt = Math.min(vtl / kt, mu * jn)
        v = sub(v, mul(tdir, jt / m)); w = sub(w, mul(cross(r, tdir), jt * invI))
      }
    }
    if (touching && wasAir && Math.abs(v[1]) > .05) bounces++
    wasAir = !touching
    if (touching) { const k = len(v) < .15 ? 6 : 1.2; v = mul(v, 1 - k * dt); w = mul(w, 1 - 2 * k * dt) } // 滚动阻力（低速时加大，避免无限摇晃）
    t += dt
    if (step % 4 === 0) frames.push({ t, p: [...p] as V, q: [...q] as Q })
    if (edgeMode && touching && t > .5 && len(v) < .45) { takeover = t; break }
    ws = ws * .95 + len(w) * .05; vs = vs * .95 + len(v) * .05
    still = touching && vs < .05 && ws < .5 ? still + dt : 0
    if (still > .25 || (t > 4.5 && touching)) break
  }
  if (edgeMode && takeover < 0) takeover = t
  const out: DieThrow = { frames, settleT: t, dt: dt * 4, mode: o.mode, topFace: o.topFace, half: h, bounces }
  const lift = (qq: Q, xz: V): V => { let lo = 1e9; for (const c of corners) lo = Math.min(lo, qrot(qq, c)[1]); return [xz[0], -lo, xz[2]] }
  if (edgeMode && takeover >= 0) {
    // 接管：最近的平躺朝向 → 选与当前倾斜最接近的水平棱，绕棱衰减摆动到精确 45°
    const q0 = q, flat = snapFlat(q0)
    // 倾斜轴：平躺后骰子自身的两条水平局部轴（映射到世界）里与滚动方向最垂直的一条；符号让骰子顺着滚动方向翻上棱
    const vh: V = len([v[0], 0, v[2]]) > 1e-3 ? mul([v[0], 0, v[2]], 1 / len([v[0], 0, v[2]])) : fwd
    let bestAx: V = [1, 0, 0], bestD = 2
    for (const la of FACE_AXES) { const wa = qrot(flat, la); if (Math.abs(wa[1]) > .5) continue; const d = Math.abs(dot(wa, vh)); if (d < bestD) { bestD = d; bestAx = wa } }
    const sign = dot(cross(bestAx, [0, 1, 0]), vh) > 0 ? -1 : 1
    const tilt = (ang: number) => qmul(qaxis(bestAx, sign * ang), flat)
    const startAng = Math.max(.1, Math.min(.7, Math.acos(Math.min(1, Math.max(-1, upFace(q0).cos)))))
    const T = 1.5, xz: V = [p[0], 0, p[2]], qa = q0
    for (let k = 1; k <= Math.round(T / out.dt); k++) {
      const tt = k * out.dt, s = tt / T
      // 0..0.25：从当前朝向过渡到「绕棱 startAng」；之后衰减摆动 45° ± A e^{-kt} cos(ωt)，末段严格收敛
      const swing = Math.PI / 4 + (startAng - Math.PI / 4) * Math.exp(-4.2 * tt) * Math.cos(11 * tt) * (1 - s * s)
      let qq = tilt(swing)
      if (tt < .25) qq = qslerp(qa, qq, tt / .25)
      frames.push({ t: takeover + tt, p: lift(qq, xz), q: qq })
    }
    const qEnd = tilt(Math.PI / 4)
    frames.push({ t: takeover + T + out.dt, p: lift(qEnd, xz), q: qEnd })
    out.settleT = takeover + T + out.dt
    out.edgeAxis = bestAx
    // 编号映射：选 S 使 S·目标面 = 当前「最朝上的两面之一」，让结果面成为棱两侧之一（棱上平衡本身没有朝上面，图标显示在两侧面）
  } else {
    // 停稳 → 吸附平躺
    const last = frames[frames.length - 1] ?? { t, p, q }
    const qf = snapFlat(last.q), n = Math.round(.18 / out.dt)
    for (let k = 1; k <= n; k++) { const s = k / n, e2 = s * s * (3 - 2 * s), qq = qslerp(last.q, qf, e2); frames.push({ t: last.t + k * out.dt, p: lift(qq, last.p), q: qq }) }
    out.settleT = frames[frames.length - 1].t
  }
  // 面编号重映射（整段右乘 S）
  const landed = upFace(frames[frames.length - 1].q).face
  const S = CUBE_SYM.find((s) => { const a = qrot(s, FACE_AXES[o.topFace]), b = FACE_AXES[landed]; return dot(a, b) > .999 })!
  for (const f of frames) f.q = qnorm(qmul(f.q, S))
  return out
}
/** 最近的「某个面严格朝上、竖轴角保持」的朝向 */
export function snapFlat(q: Q): Q {
  const { face } = upFace(q)
  const up = qrot(q, FACE_AXES[face]), ax = cross(up, [0, 1, 0]), s = len(ax)
  return s < 1e-9 ? q : qnorm(qmul(qaxis(ax, Math.asin(Math.min(1, s)) * (dot(up, [0, 1, 0]) < 0 ? -1 : 1)), q))
}
/** 采样某时刻（线性 + slerp 插值）。t 超出则取末帧。 */
export function samplePose(d: DieThrow, t: number): DieFrame {
  const f = d.frames
  if (t <= f[0].t) return f[0]
  if (t >= f[f.length - 1].t) return f[f.length - 1]
  let lo = 0, hi = f.length - 1
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (f[mid].t <= t) lo = mid; else hi = mid }
  const a = f[lo], b = f[hi], k = (t - a.t) / Math.max(1e-6, b.t - a.t)
  return { t, p: [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k], q: qslerp(a.q, b.q, k) }
}
/** 「转 5 min」：落地后的竖轴转速（rad/s）——2.5 s 内加速到 38，期满前 0.4 s 骤停 */
export function spinRate(tSinceSettle: number, total = 300) {
  if (tSinceSettle <= 0) return 0
  if (tSinceSettle >= total) return 0
  const up = Math.min(1, tSinceSettle / 2.5), down = Math.min(1, (total - tSinceSettle) / .4)
  return 38 * up * up * down
}
/** 转动累计角（解析积分，避免逐帧累计误差） */
export function spinAngle(ts: number, total = 300) {
  if (ts <= 0) return 0
  const a = Math.min(ts, 2.5), up = (38 * a * a * a) / (3 * 2.5 * 2.5)
  if (ts <= 2.5) return up
  const mid = Math.min(ts, total - .4) - 2.5, b = Math.max(0, ts - (total - .4))
  return up + 38 * mid + (b > 0 ? 38 * (b - (b * b) / (2 * .4)) : 0)
}
/** 结果面 → 骰子局部面序号（白骰六面都是空白，结果图案浮现在停下时朝上的那一面；按结果固定编号便于测试） */
export const RESULT_FACE: Record<string, number> = { rare: 0, sanity: 2, teleport: 4, weapon: 1, squid: 3, hotel: 5, gambler: 2, blank: 4, edge: 0 }
/** 出手点附近的墙面平面：四个方向各取最近一格非地面瓦片靠近玩家一侧的边（场景坐标：x→x，地图 y→z；平面相对出手点） */
export function dieWallPlanes(floor: (tx: number, ty: number) => boolean, x: number, y: number): DiePlane[] {
  const out: DiePlane[] = [], tx = Math.floor(x), ty = Math.floor(y)
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) for (let k = 1; k <= 5; k++) {
    if (floor(tx + dx * k, ty + dy * k)) continue
    if (dx) { const wx = dx > 0 ? tx + k : tx - k + 1; out.push({ n: [-dx, 0, 0], d: -dx * (wx - x) }) }
    else { const wz = dy > 0 ? ty + k : ty - k + 1; out.push({ n: [0, 0, -dy], d: -dy * (wz - y) }) }
    break
  }
  return out
}

// ---------------- [l5items v2 收尾] 第一人称投掷挥臂 / 出手点 / 结果时序 / 嗡鸣状态 ----------------
/** 挥臂总时长 / 松手时刻（按 X 起算，s）；结果图案浮现时长（平躺） / 「枪」浮现时长（5 min 满后） */
export const THROW_DUR = .6, THROW_REL = .33, REVEAL_FLAT = .9, REVEAL_SPIN = .6
/** 第一人称右手 vm 节点基准位置（与 viewmodel.vmAnimPose 起点一致）与手中骰子中心（buildHeldItem('fatedie') 包围盒中心，vm 局部） */
export const VM_BASE: V = [.27, -.3, -.55], DIE_IN_HAND: V = [0, .02, -.18], EYE_H = 1.55
type Pose6 = [number, number, number, number, number, number] // px py pz rx ry rz（vm 偏移）
const POSE_REST: Pose6 = [0, 0, 0, 0, 0, 0]
const POSE_COCK: Pose6 = [-.03, .15, .12, .7, .05, -.12] // 抬手：举到肩后、手腕后仰
const POSE_FOLLOW: Pose6 = [-.08, -.05, -.26, -1.0, -.08, .14] // 前挥到底：手臂伸出、手腕下压
const sm = (x: number) => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k) }
const lerp6 = (a: Pose6, b: Pose6, k: number): Pose6 => a.map((v, i) => v + (b[i] - v) * k) as Pose6
/** 挥臂姿势（pr = 0..1，按 X 起算的进度）：0–0.38 抬手 → 0.38–0.72 前挥（0.55 = 松手，前挥中段速度最大）→ 0.72–1 收回 */
export function dieThrowPose(pr: number): Pose6 {
  if (pr <= 0 || pr >= 1) return [...POSE_REST] as Pose6
  if (pr < .38) return lerp6(POSE_REST, POSE_COCK, sm(pr / .38))
  if (pr < .72) return lerp6(POSE_COCK, POSE_FOLLOW, sm((pr - .38) / .34))
  return lerp6(POSE_FOLLOW, POSE_REST, sm((pr - .72) / .28))
}
const rx3 = (v: V, a: number): V => [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)]
const ry3 = (v: V, a: number): V => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)]
const rz3 = (v: V, a: number): V => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]]
const eulerYXZ = (v: V, x: number, y: number, z: number): V => ry3(rx3(rz3(v, z), x), y) // THREE Euler 'YXZ'：R = Ry·Rx·Rz
/** 松手那一帧手中骰子的位置（相对玩家脚下，场景坐标 x / 高 / z=地图 y）。lookYaw / pitch 同 renderer 相机（rotation YXZ）。 */
export function dieHandPoint(lookYaw: number, pitch: number, eye = EYE_H, pr = THROW_REL / THROW_DUR): V {
  const d = dieThrowPose(pr), vmPos: V = [VM_BASE[0] + d[0], VM_BASE[1] + d[1], VM_BASE[2] + d[2]]
  const inCam = add(vmPos, eulerYXZ(DIE_IN_HAND, d[3], d[4], d[5]))
  const w = eulerYXZ(inCam, pitch, lookYaw, 0)
  return [w[0], eye + w[1], w[2]]
}
/** p.facing（地图朝向）→ renderer 的 look.yaw（engine：facing = atan2(-cos yaw, -sin yaw)） */
export const lookYawOfFacing = (f: number) => Math.atan2(-Math.cos(f), -Math.sin(f))
/** 结果何时「生效」（相对松手，s）：平躺 = 停稳 + 图案浮现完；棱上 = 平衡达成；转 5 min = 落地开始转（枪在 5 min + 浮现完才给） */
export function dieResolveDelay(sim: DieThrow) { return sim.mode === 'flat' ? sim.settleT + REVEAL_FLAT : sim.settleT }

/** 嗡鸣目标状态（纯函数，FateDieFx 每帧调用）：spin = 当前转速 rad/s，fade = 作废 / 淡出进度，dist = 听者距离 m。 */
export interface HumTarget { on: boolean; gain: number; base: number; harm: number; cutoff: number }
export function dieHumTarget(spin: number, fade: number, dist: number): HumTarget {
  const k = Math.max(0, Math.min(1, spin / 38)), att = 1 / (1 + (dist / 1.6) ** 2) // 3D 距离衰减（参考 1.6 m，平方反比软化）
  const on = spin > .05 && fade <= 0
  return { on, gain: on ? .16 * (.25 + .75 * k) * att : 0, base: 52 + 18 * k, harm: (spin / (Math.PI * 2)) * 4, cutoff: 260 + 2400 * k * att } // 谐波 = 每秒掠过的面数（4 面 / 圈）
}
