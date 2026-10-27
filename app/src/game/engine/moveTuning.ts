// [movefeel] 移动手感调参表（MV）——所有手感数值集中在这里，engine/movement.ts、core/player.ts、
// renderer/renderer.ts、components/TouchControls.tsx 只读本表。
// 不变量（实体追击平衡）：走速 3.4 / 跑速 6.0 / 跳跃初速 5.4 + 上升重力 11（顶点 ≈1.32 m）/
// 噪音事件（每 0.9 m 一次、半径 1/4/10）与改动前完全一致；改的只是「怎么到达这些速度」。
export const MV = {
  // ---- A 速度模型 ----
  WALK: 3.4, // 走速（m/s，不变）
  RUN: 6.0, // 跑速（m/s，不变）
  ACCEL: 22, // 地面加速度（m/s²）：0 → 走速 ≈0.155 s（用户选「轻」）
  DECEL: 28, // 地面减速度（松手 / 超速 / 侧向残余）：走速急停 ≈0.12 s、≈0.21 m
  REVERSE_MUL: 1.6, // 反向（沿目标方向的速度分量 < 0）时加速度倍率
  AIR_ACCEL: 6, // 空中加减速度（保留起跳惯性，空中只能微调）
  FWD: 1.0, // 方向限速：正前
  SIDE: 0.9, // 方向限速：正侧
  BACK: 0.72, // 方向限速：正后（斜向按方向余弦平方插值）
  SPRINT_CONE_DEG: 50, // 冲刺只在前进 ±50° 内生效
  SPRINT_RAMP: 0.25, // 冲刺渐入 / 渐出时间（s）：3.4 → 6.0
  STAMINA_DRAIN: 22, // 冲刺耗体力（/s，不变）
  WINDED_T: 2.5, // 体力耗尽后喘息时间（s），期间不能冲刺
  WINDED_RESUME: 25, // 喘息结束后体力 ≥25 才能再冲（消除 1 附近的冲刺 / 走路闪烁）
  WET_ACCEL: 0.4, // 湿地（地毯积水）加减速度倍率 → 打滑感
  SHALLOW_ACCEL: 0.6, // 浅水（非深水液体）加减速度倍率
  STOP_EPS: 0.02, // 速度低于此值（m/s）且无输入时归零
  // ---- B 碰撞滑动 ----
  CORNER_NUDGE: 0.12, // 直走被门框 / 桌角挡住时，最多横向绕开 0.12 m
  BLOCK_KEEP: 0.5, // 本子步某轴实际位移 < 期望 × 0.5 视为撞墙，扣掉该轴速度
  TELEPORT_RESET: 0.75, // 两帧间世界坐标跳变 > 0.75 m（传送 / 脚本挪位）→ 水平速度清零
  // ---- C 跳跃与落地 ----
  JUMP_VZ: 5.4, // 跳跃初速（不变）
  GRAV_UP: 11, // 上升段重力（不变 → 顶点 5.4²/22 ≈ 1.325 m）
  GRAV_DOWN: 15, // 下落段重力（落得更干脆；顶点不变）
  COYOTE: 0.1, // 土狼时间：走出平台边缘后 0.1 s 内仍可起跳
  JUMP_BUFFER: 0.12, // 跳跃缓冲：落地前 0.12 s 内按下跳跃，落地即起跳
  LAND_VZ_MIN: 3.5, // 下落速度超过此值（m/s）落地才减速
  LAND_VZ_MAX: 10, // 落地减速在此下落速度达到最长 / 最强
  LAND_T_MIN: 0.15, // 落地减速时长下限（s）
  LAND_T_MAX: 0.3, // 落地减速时长上限（s）
  LAND_SPEED_MUL: 0.6, // 落地瞬间目标速度倍率（随时间线性恢复到 1）
  // ---- D 镜头 / 脚步 ----
  STRIDE_WALK: 0.75, // 走路每一步距离（m）——摇晃相位与脚步声都按实际位移 / 步长推进
  STRIDE_RUN: 1.05, // 跑步步长
  STRIDE_CROUCH: 0.5, // 蹲行步长
  BOB_LIGHT: 0.6, // 简化版真实摇晃（默认）幅度倍率
  BOB_STRONG: 1.0, // 「强」= 原真实摇晃完整幅度
  BOB_LIGHT_ROLL: 0.5, // 简化版额外再压低 roll 侧倾
  STEP_PAN: 0.18, // 左右脚脚步声声像
  SPRINT_FOV: 6, // 冲刺 FOV +6°
  SPRINT_FOV_T: 0.3, // 冲刺 FOV 渐入 / 渐出（s）
  LEAN_MAX_DEG: 1.5, // 起步后仰 / 急停前倾上限（度）
  LEAN_PER_ACCEL: 1.5 / 22, // 每 m/s² 前向加速度对应的俯仰（度）
  VM_LAG_YAW: 0.055, // 手持物转身滞后（原 0.045）
  VM_LAG_MAX: 0.07, // 手持物滞后上限（原 0.06）
  // ---- 移动端摇杆 ----
  STICK_DEAD: 0.12, // 死区（摇杆半径比例）
  STICK_EXP: 1.5, // 响应曲线指数（小推 = 慢走）
  STICK_MIN: 0.12, // 刚出死区时的输入强度（> 引擎移动阈值 0.1，出死区即可慢走）
  STICK_RUN: 0.9, // 推满 0.9 以上才进入「推到底自动冲刺」计时
  STICK_SPRINT_DELAY: 0.4, // 持续满推的实际秒数；不依赖 touchmove 事件频率
  STICK_RUN_RELEASE: 0.75, // 自动冲刺退出阈值（迟滞）
} as const

export type MoveTuning = typeof MV

/** 移动端摇杆：原始推杆比例 r（0..1）→ 输入强度（死区内 0；出死区从 STICK_MIN 起按幂曲线到 1） */
export function stickResponse(r: number): number {
  if (!(r > MV.STICK_DEAD)) return 0
  const k = Math.min(1, (r - MV.STICK_DEAD) / (1 - MV.STICK_DEAD))
  return MV.STICK_MIN + (1 - MV.STICK_MIN) * Math.pow(k, MV.STICK_EXP)
}

/** 方向限速：local 前向分量 f、侧向分量 s（单位向量）→ 速度倍率 */
export function directionLimit(f: number, s: number): number {
  const ff = f * f, ss = s * s, n = ff + ss
  if (n < 1e-9) return 1
  return ((f >= 0 ? MV.FWD : MV.BACK) * ff + MV.SIDE * ss) / n
}

/** 按实际水平速度（m/s）给出步长（m）：蹲 1.7→0.5、走 3.4→0.75、跑 6.0→1.05，之间线性 */
export function strideFor(speed: number, crouch: boolean): number {
  if (crouch) return MV.STRIDE_CROUCH
  const half = MV.WALK * 0.5
  if (speed <= MV.WALK) return Math.max(0.4, MV.STRIDE_CROUCH + (MV.STRIDE_WALK - MV.STRIDE_CROUCH) * (speed - half) / half)
  return Math.min(MV.STRIDE_RUN, MV.STRIDE_WALK + (MV.STRIDE_RUN - MV.STRIDE_WALK) * (speed - MV.WALK) / (MV.RUN - MV.WALK))
}

/** 每帧移动手感状态（Engine.mv；不入存档） */
export interface MoveFeelState {
  vx: number; vy: number // 水平速度（m/s，世界系，不含 L1 度量缩放）
  sprintK: number // 冲刺渐入 0..1
  winded: boolean; windedT: number // 喘息状态
  airT: number // 离地时间（s）；贴地为 0
  jumpBuf: number // 跳跃缓冲剩余（s）
  jumped: boolean // 本次离地是主动起跳（不再给土狼时间）
  landT: number; landDur: number // 落地减速剩余 / 总时长
  stride: number // 累计步数（实际位移 / 步长）；整数处 = 落脚
  foot: number // 下一只脚（0 左 / 1 右）
  speed: number // 实测水平速度（m/s，平滑）
  accF: number // 前向加速度（m/s²，平滑；镜头前后倾）
  lx: number; ly: number; lz: number; lmap: unknown // 上帧末世界坐标（传送检测）
}

export function newMoveFeel(): MoveFeelState {
  return { vx: 0, vy: 0, sprintK: 0, winded: false, windedT: 0, airT: 0, jumpBuf: 0, jumped: false, landT: 0, landDur: 0, stride: 0, foot: 0, speed: 0, accF: 0, lx: NaN, ly: NaN, lz: NaN, lmap: null }
}

/** 清空水平惯性（脚本接管 / 传送 / 游泳 / 梯子 / 电梯 / 坐下 / dev 飞行时调用） */
export function resetMoveVelocity(s: MoveFeelState) {
  s.vx = 0; s.vy = 0; s.sprintK = 0; s.speed = 0; s.accF = 0; s.landT = 0
}

/**
 * 速度趋近目标（单个子步 h 秒）：速度向量直接朝目标速度移动，步长 = 速率 × h（不越过目标）。
 * 速率：无目标 / 目标比当前慢 → decel；与当前速度反向 → accel × REVERSE_MUL；其余 → accel。
 * （向量趋近而不是「分量分解」：撞墙被扣掉法向分量后，沿墙的分量仍会持续加速到投影速度。）返回 [vx, vy]。
 */
export function approachVelocity(vx: number, vy: number, tx: number, ty: number, accel: number, decel: number, h: number): [number, number] {
  const dx = tx - vx, dy = ty - vy, dl = Math.hypot(dx, dy)
  if (dl < 1e-9) return [tx, ty]
  const tl = Math.hypot(tx, ty), vl = Math.hypot(vx, vy)
  const rate = tl < 1e-6 || tl < vl - 1e-9 ? decel : vx * tx + vy * ty < 0 ? accel * MV.REVERSE_MUL : accel
  const st = rate * h
  if (st >= dl) return [tx, ty]
  return [vx + dx / dl * st, vy + dy / dl * st]
}
