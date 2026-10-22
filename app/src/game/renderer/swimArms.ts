// [swim] 第一人称蛙泳手臂：纯函数关键帧（相机空间，右手；左手镜像）。
// 相位 0 = 手臂前伸、刚开始发力；0–0.4 外划 + 内收（发力段，与 swim.ts 的划水冲量同步）；
// 0.4–0.65 收到胸前；0.65–1 往前伸出、滑行。
export interface ArmPose { px: number; py: number; pz: number; rx: number; ry: number; rz: number }

const KEYS: [number, ArmPose][] = [
  [0.0, { px: 0.10, py: -0.17, pz: -0.72, rx: -0.25, ry: 0.0, rz: 0.0 }], // 前伸
  [0.2, { px: 0.38, py: -0.21, pz: -0.58, rx: -0.15, ry: 0.35, rz: -0.55 }], // 外划（掌心朝外）
  [0.4, { px: 0.18, py: -0.37, pz: -0.37, rx: 0.4, ry: 0.15, rz: 0.2 }], // 内收（往身下拨水）
  [0.65, { px: 0.06, py: -0.27, pz: -0.33, rx: -0.6, ry: -0.1, rz: 0.1 }], // 收到胸前
  [0.85, { px: 0.07, py: -0.19, pz: -0.62, rx: -0.4, ry: 0.0, rz: 0.02 }], // 前伸
  [1.0, { px: 0.10, py: -0.17, pz: -0.72, rx: -0.25, ry: 0.0, rz: 0.0 }],
]

const smooth = (t: number) => t * t * (3 - 2 * t)

/** 右手划水姿势（phase 0–1） */
export function strokePose(phase: number): ArmPose {
  const ph = ((phase % 1) + 1) % 1
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [t0, a] = KEYS[i], [t1, b] = KEYS[i + 1]
    if (ph <= t1) {
      const k = smooth((ph - t0) / (t1 - t0))
      return {
        px: a.px + (b.px - a.px) * k, py: a.py + (b.py - a.py) * k, pz: a.pz + (b.pz - a.pz) * k,
        rx: a.rx + (b.rx - a.rx) * k, ry: a.ry + (b.ry - a.ry) * k, rz: a.rz + (b.rz - a.rz) * k,
      }
    }
  }
  return { ...KEYS[0][1] }
}

/** 原地踩水：手在胸前小幅画「8」字（time 秒） */
export function treadPose(time: number): ArmPose {
  const a = time * 2.6
  return { px: 0.2 + Math.sin(a) * 0.05, py: -0.23 + Math.sin(a * 2) * 0.018, pz: -0.46 + Math.cos(a) * 0.03, rx: 0.15, ry: 0, rz: Math.sin(a) * 0.35 }
}

/** 把右手姿势镜像成左手（x、ry、rz 取反） */
export const mirrorPose = (p: ArmPose): ArmPose => ({ px: -p.px, py: p.py, pz: p.pz, rx: p.rx, ry: -p.ry, rz: -p.rz })

/** 在 base 与 target 之间按 k 插值 */
export function blendPose(base: ArmPose, target: ArmPose, k: number): ArmPose {
  return {
    px: base.px + (target.px - base.px) * k, py: base.py + (target.py - base.py) * k, pz: base.pz + (target.pz - base.pz) * k,
    rx: base.rx + (target.rx - base.rx) * k, ry: base.ry + (target.ry - base.ry) * k, rz: base.rz + (target.rz - base.rz) * k,
  }
}

/**
 * 每帧推进手臂相位与权重。返回新的 { phase, k, tread }。
 * - 冲刺划水时相位直接跟 swim.ts 的划水对齐（sinceStroke / 周期），手臂发力那一下正好是冲量那一下；
 * - 普通游按速度推进；静止时切到踩水小动作。
 */
export function advanceArms(st: { phase: number; k: number }, dt: number, o: {
  swimming: boolean; busy: boolean; speed: number; maxSpeed: number; sprintStroke: boolean; sinceStroke: number; strokeT: number; moving: boolean
}) {
  const target = o.swimming && !o.busy ? 1 : 0
  st.k += (target - st.k) * Math.min(1, dt * (target ? 5 : 8))
  if (o.sprintStroke) st.phase = Math.min(0.999, o.sinceStroke / o.strokeT)
  else if (o.moving) st.phase = (st.phase + dt * (0.45 + 0.35 * Math.min(1, o.speed / Math.max(0.1, o.maxSpeed)))) % 1
  else st.phase = (st.phase + dt * 0.25) % 1
  const tread = o.moving || o.sprintStroke ? 0 : 1
  return { phase: st.phase, k: st.k, tread }
}
