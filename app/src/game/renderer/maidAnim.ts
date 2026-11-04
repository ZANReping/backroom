// [maid] 管家（Entity 111）阶段 2 动画：关键帧姿势 + 程序叠加 + 裙摆 / 围裙形变 + 触须 / 獠牙二阶惯性。
// 用法：
//   const an = createMaidAnimator(maidGroup)      // maidGroup = buildMaidMesh() 的返回
//   an.play('push')                               // 0.25 s 交叉淡入
//   an.update(dt, { look: [yaw, pitch] })         // 每帧；look 为注视目标相对身体的偏航 / 俯仰（弧度），watch / approach 等会用
// 预览 / 截图用：maidPose(clip, t) 求某时刻姿势，applyMaidPose(rig, pose) 直接套用（无惯性）。
import * as THREE from 'three'
import type { MaidRig } from './maidMesh'
import { SKIRT } from './maidMesh'

export type MaidClip = 'idle' | 'push' | 'turn' | 'park' | 'sweep' | 'wipe' | 'pick' | 'watch' | 'greet' | 'shush' | 'sigh' | 'approach' | 'clean' | 'tidy'
type J = [number, number, number]
export interface MaidPose {
  hips: J; chest: J; neck: J; head: J
  shL: J; elL: J; wrL: J; shR: J; elR: J; wrR: J
  hipsY: number   // 髋高度偏移（欠身 / 弯腰时下沉）
  rootYaw: number // 整体转向（turn）
  mand: number    // 獠牙张开 0..1
  ant: number     // 触须上扬（负=耷拉）
  sway: number; fwd: number // 裙摆横 / 前后摆（m，下摆处）
  drop: number    // 裙腰下沉（与 hipsY 同步，裙摆被压缩）
  walk: number    // 步行强度 0..1（裙摆波纹 + 鞋）
  phase: number   // 步态相位 0..1
  broom: number; rag: number; item: number // 道具可见（>0.5）
  broomTip: [number, number] // 扫帚头着地点（root 局部 x, z）
}
export const MAID_CLIPS: Record<MaidClip, { dur: number; loop: boolean; zh: string }> = {
  idle: { dur: 4.0, loop: true, zh: '待机' },
  push: { dur: 1.6, loop: true, zh: '推车行走' },
  turn: { dur: 1.3, loop: false, zh: '转向' },
  park: { dur: 1.5, loop: false, zh: '停车松手' },
  sweep: { dur: 2.0, loop: true, zh: '扫地' },
  wipe: { dur: 1.6, loop: true, zh: '擦拭' },
  pick: { dur: 2.0, loop: false, zh: '捡物入车' },
  watch: { dur: 3.0, loop: false, zh: '转头注视' },
  greet: { dur: 2.4, loop: false, zh: '欠身问候' },
  shush: { dur: 2.0, loop: false, zh: '「嘘」' },
  sigh: { dur: 2.4, loop: false, zh: '叹气' },
  approach: { dur: 2.0, loop: true, zh: '缓步逼近' },
  clean: { dur: 2.6, loop: false, zh: '打扫' },
  tidy: { dur: 3.2, loop: false, zh: '整理帽子围裙' },
}
/** 步行速度（m/s，按步态周期 1.6 s / 2 步换算，阶段 3 用来对齐根位移） */
export const MAID_SPEED = { push: 1.1, approach: 1.3 }

const L3 = (a: J, b: J, k: number): J => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const ss = (x: number) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x) }
const TAU = Math.PI * 2

export const MAID_REST: MaidPose = {
  hips: [0, 0, 0], chest: [0, 0, 0], neck: [0.1, 0, 0], head: [0.06, 0, 0],
  shL: [-0.12, 0, 0.06], elL: [-0.35, 0, 0], wrL: [0, 0, 0], shR: [-0.12, 0, -0.06], elR: [-0.35, 0, 0], wrR: [0, 0, 0],
  hipsY: 0, rootYaw: 0, mand: 0, ant: 0, sway: 0, fwd: 0, drop: 0, walk: 0, phase: 0, broom: 0, rag: 0, item: 0, broomTip: [0.05, 0.55],
}
const JOINTS = ['hips', 'chest', 'neck', 'head', 'shL', 'elL', 'wrL', 'shR', 'elR', 'wrR'] as const
const SCAL = ['hipsY', 'rootYaw', 'mand', 'ant', 'sway', 'fwd', 'drop', 'walk', 'phase', 'broom', 'rag', 'item'] as const
export function clonePose(p: MaidPose): MaidPose {
  const o = { ...p } as MaidPose; for (const j of JOINTS) o[j] = [...p[j]] as J; o.broomTip = [...p.broomTip] as [number, number]; return o
}
export function mixMaidPose(a: MaidPose, b: MaidPose, k: number): MaidPose {
  const o = clonePose(a); for (const j of JOINTS) o[j] = L3(a[j], b[j], k); for (const s of SCAL) (o as any)[s] = lerp(a[s], b[s], k)
  o.phase = k < 0.5 ? a.phase : b.phase; o.broomTip = [lerp(a.broomTip[0], b.broomTip[0], k), lerp(a.broomTip[1], b.broomTip[1], k)]
  return o
}
type Part = Partial<MaidPose>
const over = (base: MaidPose, p: Part) => { const o = clonePose(base); for (const [k, v] of Object.entries(p)) (o as any)[k] = Array.isArray(v) ? [...v] : v; return o }
/** 关键帧：[[t, partial], ...]；未写的通道取 base；段间 smoothstep */
function keys(t: number, base: MaidPose, ks: [number, Part][]): MaidPose {
  if (t <= ks[0][0]) return over(base, ks[0][1])
  for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) {
    const [t0, a] = ks[i - 1], [t1, b] = ks[i]; return mixMaidPose(over(base, a), over(base, b), ss((t - t0) / (t1 - t0)))
  }
  return over(base, ks[ks.length - 1][1])
}
const S = (side: number, x: number, y: number, z: number): J => [x, y * side, z * side] // 左右对称写法：side=+1 左臂

// —— 常用姿势 ——
// S(side, x, y, z)：y、z 为正都是「向外」
const HANDS_FOLDED: Part = { shL: S(1, -0.3, 0, -0.06), elL: [-1.3, -0.65, 0], wrL: [0.1, 0, 0.2], shR: S(-1, -0.32, 0, -0.04), elR: [-1.35, 0.6, 0], wrR: [0.1, 0, -0.2] }
const PUSH_ARMS: Part = { shL: S(1, -0.95, 0, 0.0), elL: [-0.7, 0, 0], wrL: [0.55, 0, 0], shR: S(-1, -0.95, 0, 0.0), elR: [-0.7, 0, 0], wrR: [0.55, 0, 0] }
const IDLE = over(MAID_REST, HANDS_FOLDED)
const PUSH = over(MAID_REST, { ...PUSH_ARMS, hips: [0.08, 0, 0], chest: [0.06, 0, 0], neck: [0.02, 0, 0], head: [0.05, 0, 0] })

export function maidPose(clip: MaidClip, t: number, look: [number, number] = [0.9, 0]): MaidPose {
  const C = MAID_CLIPS[clip]; if (C.loop) t = ((t % C.dur) + C.dur) % C.dur; else t = Math.min(t, C.dur)
  const u = t / C.dur
  switch (clip) {
    case 'idle': { // 双手交叠在围裙前；缓慢呼吸，头偶尔偏一下（螳螂式的小幅顿挫），触须慢摆
      const p = clonePose(IDLE), b = Math.sin(u * TAU)
      p.chest[0] += 0.015 * b; p.hipsY = 0.003 * b; p.ant = 0.1 * Math.sin(u * TAU * 2)
      const tilt = ss((u - 0.45) / 0.06) - ss((u - 0.8) / 0.06); p.head[2] += 0.22 * tilt; p.head[1] += 0.12 * tilt
      return p
    }
    case 'push': { // 推车：上身前倾，双手握把；步态 1.6 s 两步，髋上下颠两次、轻扭；裙摆随步前后荡
      const p = clonePose(PUSH), ph = u, s2 = Math.sin(ph * TAU * 2), s1 = Math.sin(ph * TAU)
      p.hipsY = -0.012 + 0.012 * Math.cos(ph * TAU * 2); p.hips[1] = 0.05 * s1; p.chest[1] = -0.06 * s1; p.head[1] = 0.03 * s1
      p.shL[0] += 0.03 * s1; p.shR[0] -= 0.03 * s1; p.head[0] += 0.015 * s2
      p.walk = 1; p.phase = ph; p.fwd = -0.02 + 0.02 * s2; p.sway = 0.015 * s1; p.ant = -0.15
      return p
    }
    case 'turn': // 原地转 90°：头先转过去（螳螂），身体随后跟上
      return keys(t, IDLE, [[0, {}], [0.25, { head: [0.06, 0.75, 0.1], neck: [0.1, 0.25, 0] }], [0.5, { head: [0.06, 0.75, 0.1], neck: [0.1, 0.25, 0], rootYaw: 0.2, sway: -0.03 }],
        [1.05, { head: [0.06, 0.05, 0], rootYaw: Math.PI / 2, sway: 0.05, walk: 0.5, phase: 0.25 }], [1.3, { rootYaw: Math.PI / 2 }]])
    case 'park': // 停车：从推车姿势松手，后退半步，拍两下手，回到交叠
      return keys(t, MAID_REST, [[0, { ...PUSH, walk: 0 }], [0.35, { ...PUSH_ARMS, shL: S(1, -0.7, 0, 0.1), shR: S(-1, -0.7, 0, 0.1), elL: [-0.9, 0, 0], elR: [-0.9, 0, 0], hips: [0.04, 0, 0], fwd: 0.03 }],
        [0.7, { shL: S(1, -0.6, 0.2, -0.25), elL: [-1.5, 0.4, 0], shR: S(-1, -0.6, 0.2, -0.25), elR: [-1.5, -0.4, 0], fwd: -0.02 }],
        [0.85, { shL: S(1, -0.6, 0.2, -0.15), elL: [-1.5, 0.4, 0], shR: S(-1, -0.6, 0.2, -0.15), elR: [-1.5, -0.4, 0] }],
        [1.0, { shL: S(1, -0.6, 0.2, -0.25), elL: [-1.5, 0.4, 0], shR: S(-1, -0.6, 0.2, -0.25), elR: [-1.5, -0.4, 0] }], [1.5, IDLE]])
    case 'sweep': { // 扫地：双手握扫帚，上身左右扭摆，扫帚头在身前地面划弧；低头看地
      const a = Math.sin(u * TAU), p = over(MAID_REST, {
        hips: [0.22, 0, 0], chest: [0.12, -0.28 * a, 0.04 * a], neck: [0.25, 0, 0], head: [0.25, 0.15 * a, 0], hipsY: -0.03, drop: 0.02,
        shR: S(-1, -0.7, 0, 0.05), elR: [-0.6, 0, 0], wrR: [0.3, 0, 0],
        shL: S(1, -0.55 - 0.08 * a, -0.35, -0.12), elL: [-1.35, -0.35, 0], wrL: [0.5, 0, 0.3], broom: 1, broomTip: [0.3 * a, 0.55], sway: -0.02 * a, ant: -0.1 })
      return p
    }
    case 'wipe': { // 擦拭：右手持抹布在胸前高度画圈（擦墙 / 擦桌面），左手扶腰
      const a = u * TAU, p = over(MAID_REST, {
        chest: [0.06, 0.1 + 0.04 * Math.sin(a), 0], head: [0.1, 0.12, 0], neck: [0.12, 0.1, 0],
        shR: S(-1, -1.2 + 0.16 * Math.sin(a), -0.15 + 0.2 * Math.cos(a), -0.02), elR: [-0.5 - 0.15 * Math.cos(a), 0, 0], wrR: [-0.3, 0, 0],
        shL: S(1, 0.1, 0, 0.3), elL: [-1.6, -1.3, 0], wrL: [0, 0, 0.3], rag: 1, sway: 0.01 * Math.sin(a) })
      return p
    }
    case 'pick': // 捡物：弯腰伸右手 → 捏起（道具出现）→ 直身 → 转身把东西放进右后方的车里
      return keys(t, IDLE, [[0, {}], [0.6, { hips: [0.85, 0, 0], chest: [0.35, -0.1, 0], neck: [0.2, 0, 0], head: [-0.3, 0, 0], hipsY: -0.12, drop: 0.08, shR: S(-1, -0.9, 0, -0.05), elR: [-0.15, 0, 0], shL: S(1, -0.3, 0, 0.25), elL: [-0.6, 0, 0], fwd: 0.04 }],
        [0.8, { hips: [0.85, 0, 0], chest: [0.35, -0.1, 0], neck: [0.2, 0, 0], head: [-0.3, 0, 0], hipsY: -0.12, drop: 0.08, shR: S(-1, -0.85, 0, -0.05), elR: [-0.4, 0, 0], wrR: [0.4, 0, 0], shL: S(1, -0.3, 0, 0.25), elL: [-0.6, 0, 0], item: 1, fwd: 0.04 }],
        [1.3, { chest: [0.0, -0.7, 0], head: [0.15, -0.5, 0], shR: S(-1, -0.5, 0, 0.55), elR: [-0.6, 0, 0], wrR: [0.4, 0, 0], item: 1, sway: 0.03 }],
        [1.5, { chest: [0.0, -0.75, 0], head: [0.2, -0.5, 0], shR: S(-1, -0.4, 0, 0.6), elR: [-0.3, 0, 0], item: 0, sway: 0.03 }], [2.0, {}]])
    case 'watch': { // 注视：头猛地一转（0.2 s 螳螂式），然后定住，只有很小的歪头；颈带一点，身体基本不动
      const [yaw, pitch] = look, k = ss(t / 0.22), settle = Math.sin(Math.min(1, t / 0.5) * Math.PI) * 0.06
      const p = clonePose(IDLE)
      p.neck[1] = yaw * 0.3 * k; p.head[1] = yaw * 0.7 * k + settle * Math.sign(yaw); p.head[0] = 0.06 - pitch * k; p.head[2] = 0.18 * ss((t - 1.2) / 0.4)
      p.chest[1] = yaw * 0.08 * ss(t / 0.8); p.ant = 0.25 * k
      return p
    }
    case 'greet': // 欠身问候：双手提裙侧，屈膝下沉，上身与头一起低下，停住，再起身
      return keys(t, IDLE, [[0, {}], [0.45, { shL: S(1, -0.15, 0, 0.32), elL: [-0.35, 0, 0], wrL: [0, 0, 0.3], shR: S(-1, -0.15, 0, 0.32), elR: [-0.35, 0, 0], wrR: [0, 0, -0.3] }],
        [1.1, { shL: S(1, -0.2, 0, 0.42), elL: [-0.3, 0, 0], wrL: [0, 0, 0.3], shR: S(-1, -0.2, 0, 0.42), elR: [-0.3, 0, 0], wrR: [0, 0, -0.3], hipsY: -0.13, drop: 0.11, hips: [0.12, 0, 0], chest: [0.3, 0, 0], neck: [0.3, 0, 0], head: [0.3, 0, 0], ant: -0.25, fwd: -0.03 }],
        [1.6, { shL: S(1, -0.2, 0, 0.42), elL: [-0.3, 0, 0], wrL: [0, 0, 0.3], shR: S(-1, -0.2, 0, 0.42), elR: [-0.3, 0, 0], wrR: [0, 0, -0.3], hipsY: -0.13, drop: 0.11, hips: [0.12, 0, 0], chest: [0.3, 0, 0], neck: [0.3, 0, 0], head: [0.3, 0, 0], ant: -0.25, fwd: -0.03 }],
        [2.4, {}]])
    case 'shush': // 「嘘」：右手抬起，食指竖在口器前；头微前探歪一下；獠牙合拢
      return keys(t, IDLE, [[0, {}], [0.45, { shR: S(-1, -1.2, -0.55, -0.3), elR: [-2.15, 0.35, 0], wrR: [-0.5, 0, 0], neck: [0.2, 0, 0], head: [0.0, 0, 0.12], mand: -0.3 }],
        [1.4, { shR: S(-1, -1.2, -0.55, -0.3), elR: [-2.2, 0.35, 0], wrR: [-0.5, 0, 0], neck: [0.22, 0, 0], head: [0.0, 0, 0.18], mand: -0.3 }], [2.0, {}]])
    case 'sigh': // 叹气：吸气耸肩抬头 → 长出一口气，肩塌、头垂、触须耷拉，獠牙微张
      return keys(t, IDLE, [[0, {}], [0.6, { chest: [-0.1, 0, 0], head: [-0.15, 0, 0], hipsY: 0.012, shL: S(1, -0.4, 0.1, -0.1), shR: S(-1, -0.4, 0.1, -0.1), ant: 0.2 }],
        [1.4, { chest: [0.16, 0, 0], neck: [0.25, 0, 0], head: [0.3, 0, 0.1], hipsY: -0.01, mand: 0.35, ant: -0.45 }], [1.9, { chest: [0.14, 0, 0], neck: [0.22, 0, 0], head: [0.28, 0, 0.1], mand: 0.15, ant: -0.4 }], [2.4, {}]])
    case 'approach': { // 缓步逼近（不推车）：颈前探、头压低平视，双手微抬张开，獠牙一张一合；裙下滑步
      const ph = u, s1 = Math.sin(ph * TAU), s2 = Math.sin(ph * TAU * 2)
      const p = over(MAID_REST, { hips: [0.06, 0.04 * s1, 0], chest: [0.12, -0.05 * s1, 0], neck: [0.45, 0, 0], head: [-0.32, look[0] * 0.3, 0],
        shL: S(1, -0.55, 0, 0.18), elL: [-0.65, 0, 0], wrL: [0.3, 0, 0.2], shR: S(-1, -0.55, 0, 0.18), elR: [-0.65, 0, 0], wrR: [0.3, 0, -0.2],
        hipsY: -0.01 + 0.01 * Math.cos(ph * TAU * 2), mand: 0.3 + 0.3 * Math.max(0, Math.sin(ph * TAU * 1.5)), ant: 0.35, walk: 1, phase: ph, fwd: -0.03 + 0.02 * s2, sway: 0.012 * s1 })
      return p
    }
    case 'clean': { // 打扫（终结）：双臂高举折起（螳螂捕捉足）、獠牙大张 → 猛扑下压 → 快速左右「擦洗」 → 起身整理
      const base = keys(t, IDLE, [[0, {}],
        [0.45, { shL: S(1, -0.7, -0.25, -0.02), elL: [-2.4, -0.2, 0], wrL: [1.4, 0, 0], shR: S(-1, -0.7, -0.25, -0.02), elR: [-2.4, 0.2, 0], wrR: [1.4, 0, 0], neck: [-0.1, 0, 0], head: [-0.15, 0, 0], chest: [-0.12, 0, 0], mand: 1, ant: 0.6, hipsY: 0.02 }],
        [0.7, { shL: S(1, -1.35, 0, 0.12), elL: [-0.25, 0, 0], wrL: [0.3, 0, 0], shR: S(-1, -1.35, 0, 0.12), elR: [-0.25, 0, 0], wrR: [0.3, 0, 0], hips: [0.45, 0, 0], chest: [0.3, 0, 0], neck: [0.55, 0, 0], head: [-0.1, 0, 0], mand: 1, ant: 0.5, hipsY: -0.08, drop: 0.05, fwd: 0.06 }],
        [1.9, { shL: S(1, -1.3, 0, 0.15), elL: [-0.4, 0, 0], shR: S(-1, -1.3, 0, 0.15), elR: [-0.4, 0, 0], hips: [0.45, 0, 0], chest: [0.32, 0, 0], neck: [0.5, 0, 0], head: [-0.05, 0, 0], mand: 0.6, ant: 0.3, hipsY: -0.08, drop: 0.05, fwd: 0.05 }],
        [2.6, {}]])
      if (t > 0.7 && t < 1.9) { const w = Math.sin((t - 0.7) * TAU * 3.2) * Math.sin(((t - 0.7) / 1.2) * Math.PI); base.chest[1] += 0.3 * w; base.shL[2] += 0.25 * w; base.shR[2] -= 0.25 * w; base.sway = -0.03 * w }
      return base
    }
    case 'tidy': // 整理：右手扶正帽子 → 双手从胸口往下抚平围裙
      return keys(t, IDLE, [[0, {}], [0.5, { shR: S(-1, -2.75, 0.3, -0.25), elR: [-1.7, 0, 0], wrR: [0, 0, -0.4], head: [0.15, 0, -0.1] }],
        [0.8, { shR: S(-1, -2.7, 0.3, -0.2), elR: [-1.6, 0, 0], wrR: [0, 0, -0.6], head: [0.12, 0, -0.14] }], [1.05, { shR: S(-1, -2.75, 0.3, -0.25), elR: [-1.7, 0, 0], wrR: [0, 0, -0.4], head: [0.15, 0, -0.1] }],
        [1.6, { shL: S(1, -0.75, 0.2, -0.3), elL: [-1.5, 0.3, 0], shR: S(-1, -0.75, 0.2, -0.3), elR: [-1.5, -0.3, 0], head: [0.32, 0, 0], neck: [0.2, 0, 0] }],
        [2.4, { shL: S(1, -0.25, 0.2, -0.18), elL: [-0.5, 0.3, 0], shR: S(-1, -0.25, 0.2, -0.18), elR: [-0.5, -0.3, 0], head: [0.3, 0, 0], neck: [0.2, 0, 0], hips: [0.1, 0, 0] }], [3.2, {}]])
  }
}

// ---------- 应用 ----------
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4()
function setJ(o: THREE.Object3D, j: J) { o.rotation.order = 'YXZ'; o.rotation.set(j[0], j[1], j[2]) }
function deformSheet(m: THREE.Mesh, P: MaidPose, apron: boolean) {
  const g = m.geometry as THREE.BufferGeometry, rest = g.userData.rest as Float32Array | undefined; if (!rest) return
  const pos = g.attributes.position as THREE.BufferAttribute, top = SKIRT.top, span = SKIRT.top - SKIRT.hem
  const quiet = Math.abs(P.sway) + Math.abs(P.fwd) + P.drop + P.walk < 1e-4
  if (quiet && g.userData.quiet) return
  g.userData.quiet = quiet
  const ph = P.phase * TAU
  for (let i = 0; i < pos.count; i++) {
    const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2]
    const t = Math.max(0, Math.min(1, (top - y) / span)), t15 = t * Math.sqrt(t)
    const a = Math.atan2(x, z)
    const ripple = P.walk * 0.012 * t * Math.sin(a * 3 - ph * 2) // 走动时下摆波纹
    const fr = P.walk * 0.03 * t15 * Math.sin(ph * 2 + (apron ? 0.4 : 0)) * Math.max(0, Math.cos(a)) // 前摆被腿顶起
    const r = Math.hypot(x, z) || 1
    const ny = y - P.drop * (1 - t) // 下沉：腰下移、下摆不动（裙被压缩，略外鼓）
    const bulge = P.drop * 0.5 * Math.sin(t * Math.PI)
    pos.setXYZ(i, x + (x / r) * (ripple + bulge) + P.sway * t15, ny, z + (z / r) * (ripple + bulge) + P.fwd * t15 + fr)
  }
  pos.needsUpdate = true; g.computeVertexNormals()
}
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _j = new THREE.Vector3(), _e = new THREE.Vector3()
/** 两节 CCD IK：转肘、肩让腕到达 target（世界坐标），每步限角，避免翻折 */
export function ccdArm(arm: { shoulder: THREE.Object3D; elbow: THREE.Object3D; wrist: THREE.Object3D }, target: THREE.Vector3, iters = 10) {
  for (let it = 0; it < iters; it++) {
    for (const jn of [arm.elbow, arm.shoulder]) {
      jn.updateMatrixWorld(true)
      jn.getWorldPosition(_j); arm.wrist.getWorldPosition(_e)
      _a.copy(_e).sub(_j).normalize(); _b.copy(target).sub(_j).normalize()
      const ang = Math.acos(Math.max(-1, Math.min(1, _a.dot(_b)))); if (ang < 1e-4) continue
      _q.setFromUnitVectors(_a, _b); if (ang > 0.4) _q.slerp(new THREE.Quaternion(), 1 - 0.4 / ang)
      jn.parent!.getWorldQuaternion(_pq)
      jn.quaternion.premultiply(_pq.clone().invert().multiply(_q).multiply(_pq))
    }
    arm.shoulder.updateMatrixWorld(true); arm.wrist.getWorldPosition(_e); if (_e.distanceTo(target) < 0.005) break
  }
}
export function applyMaidPose(rig: MaidRig, P: MaidPose) {
  const root = rig.root
  root.rotation.y = P.rootYaw
  setJ(rig.hips, P.hips); rig.hips.position.y = 1.0 + P.hipsY
  setJ(rig.chest, P.chest); setJ(rig.neck, P.neck); setJ(rig.head, P.head)
  setJ(rig.armL.shoulder, P.shL); setJ(rig.armL.elbow, P.elL); setJ(rig.armL.wrist, P.wrL)
  setJ(rig.armR.shoulder, P.shR); setJ(rig.armR.elbow, P.elR); setJ(rig.armR.wrist, P.wrR)
  const mo = Math.max(-0.3, P.mand)
  rig.mandL.rotation.set(-0.15 * Math.max(0, mo), 0, 0.42 * mo); rig.mandR.rotation.set(-0.15 * Math.max(0, mo), 0, -0.42 * mo)
  rig.antL.rotation.set(-0.35 * P.ant, 0, 0.1 * P.ant); rig.antR.rotation.set(-0.35 * P.ant, 0, -0.1 * P.ant)
  // 鞋：步行时前后交替露出裙摆
  const ph = P.phase * TAU
  rig.shoeL.position.z = 0.25 + P.walk * 0.07 * Math.sin(ph); rig.shoeR.position.z = 0.25 - P.walk * 0.07 * Math.sin(ph)
  rig.shoeL.position.y = 0.002 + P.walk * 0.015 * Math.max(0, Math.cos(ph)); rig.shoeR.position.y = 0.002 + P.walk * 0.015 * Math.max(0, -Math.cos(ph))
  deformSheet(rig.skirt, P, false); deformSheet(rig.apron, P, true)
  // 道具
  rig.rag.visible = P.rag > 0.5; rig.item.visible = P.item > 0.5; rig.broom.visible = P.broom > 0.5
  if (rig.broom.visible) {
    root.updateMatrixWorld(true)
    // 双手握：左手握上端（扫帚原点），右手用 CCD IK 贴到杆子下方 0.38 m 处
    rig.armL.wrist.getWorldPosition(_v); _m.copy(root.matrixWorld).invert(); _v.applyMatrix4(_m); _v.y -= 0.07
    _w.set(P.broomTip[0], 0.03, P.broomTip[1])
    rig.broom.position.copy(_v)
    const dir = _w.clone().sub(_v).normalize(); rig.broom.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir)
    rig.broom.scale.setScalar(Math.min(1.4, _w.distanceTo(_v) / 1.15))
    const grip = _v.clone().addScaledVector(dir, 0.38); grip.y += 0.07; grip.applyMatrix4(root.matrixWorld)
    ccdArm(rig.armR, grip)
  }
}

// ---------- 运行时动画器（淡入淡出 + 二阶惯性） ----------
export interface MaidAnimator {
  play(clip: MaidClip, fade?: number): void
  update(dt: number, opt?: { look?: [number, number] }): void
  readonly clip: MaidClip; readonly time: number; readonly done: boolean
}
export function createMaidAnimator(obj: THREE.Object3D): MaidAnimator {
  const rig = obj.userData.maid as MaidRig
  let clip: MaidClip = 'idle', time = 0, prev: MaidPose = clonePose(IDLE), fadeT = 0, fadeDur = 0
  // 触须 / 獠牙惯性：跟随头部角速度做阻尼弹簧
  const hq = new THREE.Quaternion(), hqPrev = new THREE.Quaternion(), dq = new THREE.Quaternion(), eu = new THREE.Euler()
  const spr = { x: 0, z: 0, vx: 0, vz: 0, m: 0, vm: 0 }; let first = true
  let last = clonePose(IDLE)
  return {
    get clip() { return clip }, get time() { return time }, get done() { const C = MAID_CLIPS[clip]; return !C.loop && time >= C.dur },
    play(c, fade = 0.25) { if (c === clip && MAID_CLIPS[c].loop) return; prev = clonePose(last); clip = c; time = 0; fadeT = 0; fadeDur = fade },
    update(dt, opt) {
      time += dt; fadeT += dt
      let P = maidPose(clip, time, opt?.look)
      if (fadeT < fadeDur) P = mixMaidPose(prev, P, ss(fadeT / fadeDur))
      last = P
      applyMaidPose(rig, P)
      rig.head.updateMatrixWorld(true); rig.head.getWorldQuaternion(hq)
      if (first) { hqPrev.copy(hq); first = false }
      dq.copy(hqPrev).invert().multiply(hq); eu.setFromQuaternion(dq, 'YXZ'); hqPrev.copy(hq)
      const h = Math.max(1e-3, dt), wx = eu.x / h, wy = eu.y / h
      const K = 60, D = 7, step = (p: number, v: number, f: number) => { const a = -K * p - D * v + f; v += a * h; return [p + v * h, v] }
      ;[spr.x, spr.vx] = step(spr.x, spr.vx, wx * 3.0); [spr.z, spr.vz] = step(spr.z, spr.vz, -wy * 3.0); [spr.m, spr.vm] = step(spr.m, spr.vm, (wx * 1.2 + Math.abs(wy) * 0.6))
      const c = (v: number, m: number) => Math.max(-m, Math.min(m, v))
      rig.antL.rotation.x += c(spr.x, 0.5); rig.antR.rotation.x += c(spr.x, 0.5); rig.antL.rotation.z += c(spr.z, 0.5); rig.antR.rotation.z += c(spr.z, 0.5)
      rig.mandL.rotation.z += c(spr.m, 0.2) * 0.4; rig.mandR.rotation.z -= c(spr.m, 0.2) * 0.4
    },
  }
}
