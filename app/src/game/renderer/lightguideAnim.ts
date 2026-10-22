// 微光向导（Entity 35）重制——第 2 阶段：动画库（不含 AI）。
// 它没有骨骼，动画只改：光晕贴片（sprite）的缩放 / 颜色 / 透明度、光核颜色与透明度、点光源的颜色与强度，以及相对位移。
// 位移写在 group 的各个子节点上（相对 group 原点的偏移），不改 grp.position——游戏层照常摆放 grp，片段给出相对偏移。
//
// 片段：
//   wander       闲逛：随机感的轻微漂移 + 亮度闪烁（暖白）
//   beckon       跟我来（青白）：往前飘一段 → 停下等待 → 回头绕一小圈；循环。带根位移：每个循环向前 LIGHTGUIDE_BECKON_ADVANCE
//   warn         警示（粉白）：0.5s 内从当前颜色渐变到粉白，原地快速小幅颤动，光晕脉冲变大；循环
//   color_shift  任意两种 mood 之间平滑渐变（opts.from → opts.to），插值函数 lightguideMoodColors 导出
//   flee         受击逃离：亮度骤降，迅速拉远，然后消失
//   nest_orbit   绕巢（淡金）：几只围着一点慢慢绕圈（opts.index / count / radius）
//   phase        穿墙：沿前进方向穿过墙面，淡出→不可见→淡入
//
// API：
//   sampleLightguide(grp, clip, t, opts) → LightguidePose
//   applyLightguidePose(grp, pose)
//   animLightguide(grp, clip, t, opts)
//   mixLightguidePose(a, b, w)
//   lightguideMoodColors(from, to, k) → { core, halo, ring }   两种情绪色之间插值（线性色彩空间）
//   LIGHTGUIDE_CLIPS
import * as THREE from 'three'
import { LIGHTGUIDE_COLORS, type LightguideMood, type LightguideRig } from './lightguideMesh'

const TAU = Math.PI * 2
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
const smooth = (a: number, b: number, t: number) => { const k = clamp01((t - a) / (b - a)); return k * k * (3 - 2 * k) }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const bump = (a: number, b: number, t: number) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI))

export type LightguideClip = 'wander' | 'beckon' | 'warn' | 'color_shift' | 'flee' | 'nest_orbit' | 'phase'
export interface ClipInfo { len: number; loop: boolean }
export const LIGHTGUIDE_CLIPS: Record<LightguideClip, ClipInfo> = {
  wander: { len: 6, loop: true },
  beckon: { len: 3.6, loop: true },
  warn: { len: 1.6, loop: true },
  color_shift: { len: 1, loop: false },
  flee: { len: 1.5, loop: false },
  nest_orbit: { len: 8, loop: true },
  phase: { len: 1.2, loop: false },
}
export const LIGHTGUIDE_CLIP_LABELS: Record<LightguideClip, string> = {
  wander: '闲逛游走', beckon: '跟我来', warn: '警示：停下', color_shift: '变色过渡', flee: '受击逃离', nest_orbit: '绕巢', phase: '穿墙',
}
/** beckon：每个循环末尾相对开头的前移距离（米，沿 opts.dir）。游戏层每循环把锚点前移这么多（根位移） */
export const LIGHTGUIDE_BECKON_ADVANCE = 0.9
/** beckon：停下等待的时间段（秒，循环内）——AI 可在这段判断玩家是否跟上 */
export const LIGHTGUIDE_BECKON_WAIT: [number, number] = [1.3, 2.1]
/** warn：颜色渐变到粉白所需时间 */
export const LIGHTGUIDE_WARN_FADE = 0.5
/** flee：拉远的距离（米）与完全消失的时刻 */
export const LIGHTGUIDE_FLEE_DIST = 4
export const LIGHTGUIDE_FLEE_GONE_T = 1.5
/** phase：穿过的距离（米），以及处于墙面正中（完全不可见）的时刻 */
export const LIGHTGUIDE_PHASE_DIST = 0.5
export const LIGHTGUIDE_PHASE_WALL_T = 0.6

type RGB = [number, number, number]
export interface LightguidePose {
  /** 相对 group 原点的偏移（米） */
  x: number; y: number; z: number
  core: RGB; halo: RGB; ring: RGB
  /** 亮度倍率（贴片透明度、光源强度） */
  bright: number
  /** 可见度 0–1（穿墙 / 消失） */
  alpha: number
  /** 外晕 / 内晕 / 色散环的缩放倍率 */
  haloK: number; innerK: number; ringK: number
}
export interface LightguideAnimOpts {
  /** 个体相位偏移 */
  phase?: number
  /** 当前情绪色（wander / flee / phase 用；默认按片段：wander→idle，beckon→guide，nest_orbit→nest） */
  mood?: LightguideMood
  /** color_shift / warn 的起始色（warn 默认 guide） */
  from?: LightguideMood
  /** color_shift 的目标色 */
  to?: LightguideMood
  /** 前进 / 逃离方向（模型空间，会归一化）：beckon / phase 默认 +X，flee 默认远离（+X 偏上偏后） */
  dir?: [number, number, number]
  /** nest_orbit：第几只、共几只、轨道半径（米） */
  index?: number; count?: number; radius?: number
}

const _c = new THREE.Color(), _c2 = new THREE.Color()
const rgb = (c: THREE.Color): RGB => [c.r, c.g, c.b]
/** 两种情绪色之间插值：k=0 为 from，k=1 为 to（线性色彩空间插值，中途不会发灰）。返回新建的 Color */
export function lightguideMoodColors(from: LightguideMood, to: LightguideMood, k: number) {
  const a = LIGHTGUIDE_COLORS[from], b = LIGHTGUIDE_COLORS[to], w = clamp01(k)
  const f = (x: string, y: string) => _c.set(x).clone().lerp(_c2.set(y), w)
  return { core: f(a.core, b.core), halo: f(a.halo, b.halo), ring: f(a.ring, b.ring) }
}
function setMood(P: LightguidePose, from: LightguideMood, to: LightguideMood, k: number) {
  const c = lightguideMoodColors(from, to, k); P.core = rgb(c.core); P.halo = rgb(c.halo); P.ring = rgb(c.ring)
}
const dirOf = (o: LightguideAnimOpts, def: [number, number, number]) => new THREE.Vector3(...(o.dir ?? def)).normalize()

function rigOf(grp: THREE.Object3D): LightguideRig { const r = grp.userData.lightguideRig as LightguideRig | undefined; if (!r) throw Error('not a lightguide mesh'); return r }

export function sampleLightguide(grp: THREE.Object3D, clip: LightguideClip, t: number, o: LightguideAnimOpts = {}): LightguidePose {
  rigOf(grp)
  const info = LIGHTGUIDE_CLIPS[clip]
  const raw = t, T = info.loop ? t : Math.max(0, Math.min(t, info.len)), ph = o.phase ?? 0, tt = T + ph
  const P: LightguidePose = { x: 0, y: 0, z: 0, core: [1, 1, 1], halo: [1, 1, 1], ring: [1, 1, 1], bright: 1, alpha: 1, haloK: 1, innerK: 1, ringK: 1 }
  // 所有循环片段都叠一点「活着」的微光呼吸（频率取片段时长的整数倍）
  const live = (len: number, a = 1) => {
    const w = (tt / len) * TAU
    P.bright += (0.05 * Math.sin(w * 5) + 0.035 * Math.sin(w * 11 + 1.7)) * a
    P.haloK += 0.04 * Math.sin(w * 3 + 0.5) * a
  }
  switch (clip) {
    case 'wander': {
      setMood(P, o.mood ?? 'idle', o.mood ?? 'idle', 0)
      const w = (tt / 6) * TAU
      P.x = 0.14 * Math.sin(w) + 0.05 * Math.sin(w * 3 + 1.1)
      P.y = 0.07 * Math.sin(w * 2 + 0.4) + 0.025 * Math.sin(w * 5 + 2)
      P.z = 0.1 * Math.sin(w + 1.9) + 0.04 * Math.sin(w * 4 + 0.3)
      live(6, 1.6)
      // 偶尔一次明显的闪烁（每循环一次，像烛火被风吹了一下）
      P.bright -= 0.35 * bump(0.62, 0.7, (((tt / 6) % 1) + 1) % 1)
      break
    }
    case 'beckon': {
      setMood(P, 'guide', 'guide', 0)
      const d = dirOf(o, [1, 0, 0]), A = LIGHTGUIDE_BECKON_ADVANCE, c = ((tt % 3.6) + 3.6) % 3.6
      const [w0, w1] = LIGHTGUIDE_BECKON_WAIT
      // 0–1.3 前飘（略呈弧线）；1.3–2.1 等待（上下浮动 + 亮一下）；2.1–3.2 向回绕一小圈；3.2–3.6 停在前方
      let along = A * smooth(0, w0, c), up = 0.06 * bump(0, w0, c), side = 0
      if (c >= w0) up += 0.02 * Math.sin((c - w0) * TAU * 1.25)
      if (c >= w1 && c < 3.2) {
        const th = smooth(w1, 3.2, c) * TAU, r = 0.16
        along = A - r + r * Math.cos(th) // 先往回（朝向跟随者）再绕回来
        up += 0.09 * Math.sin(th)
        side = 0.08 * Math.sin(th)
      }
      const s = new THREE.Vector3(-d.z, 0, d.x)
      P.x = d.x * along + s.x * side; P.y = d.y * along + up; P.z = d.z * along + s.z * side
      P.bright = 1 + 0.35 * bump(w0 + 0.1, w0 + 0.6, c) + 0.15 * bump(2.1, 3.2, c)
      P.haloK = 1 + 0.25 * bump(w0 + 0.1, w0 + 0.6, c)
      P.ringK = 1 + 0.4 * bump(2.1, 3.2, c)
      live(3.6)
      break
    }
    case 'warn': {
      const k = smooth(0, LIGHTGUIDE_WARN_FADE, raw)
      setMood(P, o.from ?? 'guide', 'warn', k)
      // 颤动：约 9–14Hz 的小幅抖动（频率为 1/1.6Hz 的整数倍，循环首尾相接）
      const f = (n: number) => Math.sin((tt / 1.6) * TAU * n)
      const shake = 0.012 * k
      P.x = shake * (f(15) + 0.5 * f(23)); P.y = shake * (f(19) * 0.8 + 0.4 * f(9)); P.z = shake * f(17) * 0.7
      const pulse = Math.pow(0.5 + 0.5 * f(2), 2)
      P.haloK = 1 + (0.25 + 0.5 * pulse) * k
      P.ringK = 1 + 0.7 * pulse * k
      P.innerK = 1 + 0.12 * pulse * k
      P.bright = 1 + (0.15 + 0.25 * pulse) * k
      break
    }
    case 'color_shift': {
      const k = smooth(0, 1, T)
      setMood(P, o.from ?? 'idle', o.to ?? 'guide', k)
      P.bright = 1 - 0.15 * bump(0, 1, T)
      P.ringK = 1 + 0.3 * bump(0, 1, T)
      P.innerK = 1 - 0.1 * bump(0, 1, T)
      break
    }
    case 'flee': {
      const m = o.mood ?? 'warn'
      setMood(P, m, m, 0)
      // 骤暗：0.12s 内掉到 30%，并开始抽搐似地闪
      const dim = smooth(0, 0.12, T)
      P.bright = lerp(1, 0.4, dim) + 0.12 * Math.sin(T * 41) * dim * (1 - smooth(0.8, 1.2, T))
      P.haloK = lerp(1, 0.6, dim); P.ringK = lerp(1, 0.5, dim); P.innerK = lerp(1, 0.8, dim)
      // 拉远：0.15 起加速（ease-in 后匀速）
      const d = dirOf(o, [0.55, 0.22, -1]), k = clamp01((T - 0.15) / (LIGHTGUIDE_FLEE_GONE_T - 0.15))
      const dist = LIGHTGUIDE_FLEE_DIST * (k < 0.4 ? (k * k) / 0.8 : 0.2 + (k - 0.4) * (0.8 / 0.6))
      P.x = d.x * dist; P.y = d.y * dist; P.z = d.z * dist
      P.alpha = 1 - smooth(0.9, LIGHTGUIDE_FLEE_GONE_T, T)
      break
    }
    case 'nest_orbit': {
      setMood(P, o.mood ?? 'nest', o.mood ?? 'nest', 0)
      const n = Math.max(1, o.count ?? 3), i = o.index ?? 0, r = o.radius ?? 0.35
      const th = (tt / 8) * TAU + (i / n) * TAU
      P.x = r * Math.cos(th); P.z = r * Math.sin(th)
      P.y = 0.05 * Math.sin(th * 2 + i * 1.3) + 0.02 * Math.sin((tt / 8) * TAU * 5 + i)
      live(8, 0.8)
      break
    }
    case 'phase': {
      const m = o.mood ?? 'guide'
      setMood(P, m, m, 0)
      const d = dirOf(o, [1, 0, 0]), s = LIGHTGUIDE_PHASE_DIST * smooth(0, 1.2, T) * 0.4 + LIGHTGUIDE_PHASE_DIST * 0.6 * clamp01(T / 1.2)
      P.x = d.x * s; P.y = d.y * s; P.z = d.z * s
      const W = LIGHTGUIDE_PHASE_WALL_T
      P.alpha = 1 - smooth(W - 0.42, W - 0.12, T) + smooth(W + 0.12, W + 0.42, T)
      // 进墙 / 出墙的一瞬色散环外扩
      P.ringK = 1 + 0.8 * bump(W - 0.45, W - 0.1, T) + 0.8 * bump(W + 0.1, W + 0.45, T)
      P.haloK = 0.55 + 0.45 * P.alpha
      P.innerK = 0.7 + 0.3 * P.alpha
      break
    }
  }
  return P
}

export function mixLightguidePose(a: LightguidePose, b: LightguidePose, w: number): LightguidePose {
  const L3 = (p: RGB, q: RGB): RGB => [lerp(p[0], q[0], w), lerp(p[1], q[1], w), lerp(p[2], q[2], w)]
  return {
    x: lerp(a.x, b.x, w), y: lerp(a.y, b.y, w), z: lerp(a.z, b.z, w),
    core: L3(a.core, b.core), halo: L3(a.halo, b.halo), ring: L3(a.ring, b.ring),
    bright: lerp(a.bright, b.bright, w), alpha: lerp(a.alpha, b.alpha, w), haloK: lerp(a.haloK, b.haloK, w), innerK: lerp(a.innerK, b.innerK, w), ringK: lerp(a.ringK, b.ringK, w),
  }
}

/** 光源基础强度（与 buildLightguideMesh 一致） */
const lightBase = (size: number) => 0.9 + size * 6
export function applyLightguidePose(grp: THREE.Object3D, P: LightguidePose) {
  const r = rigOf(grp), s = r.size, b = Math.max(0, P.bright), a = clamp01(P.alpha)
  for (const ch of [r.core, r.inner, r.outer, r.ring, r.light]) if (ch) ch.position.set(P.x, P.y, P.z)
  const cm = r.core.material as THREE.MeshBasicMaterial
  cm.color.setRGB(...P.core); cm.opacity = a
  r.inner.material.color.setRGB(...P.core); r.inner.material.opacity = Math.min(1, b) * a
  r.outer.material.color.setRGB(...P.halo); r.outer.material.opacity = Math.min(1, 0.55 * b) * a
  r.ring.material.color.setRGB(...P.ring); r.ring.material.opacity = Math.min(1, 0.5 * b) * a
  r.inner.scale.setScalar(s * 1.1 * P.innerK * (0.85 + 0.15 * Math.min(1.5, b)))
  r.outer.scale.setScalar(s * 3.4 * P.haloK)
  r.ring.scale.setScalar(s * 1.6 * P.ringK)
  r.core.visible = a > 0.01
  if (r.light) { r.light.color.setRGB(...P.halo); r.light.intensity = lightBase(s) * b * a }
}
export function animLightguide(grp: THREE.Object3D, clip: LightguideClip, t: number, opts: LightguideAnimOpts = {}) { const p = sampleLightguide(grp, clip, t, opts); applyLightguidePose(grp, p); return p }
