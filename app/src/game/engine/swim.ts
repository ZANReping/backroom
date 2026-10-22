// [swim] 游泳控制器（所有深水共用：L7 开放海、各层深水池、L11 运河）。
// 以前的游泳是「按下=满速、松开=钉死」：水平速度直接等于输入、垂直速度松键即清零、冲刺强制朝准星。
// 这里改成真正的三维速度 + 水阻：有输入时速度逐渐逼近目标，松手后滑行衰减；冲刺是一下一下的划水推进；
// 深度不同有微弱浮力；水面可以踩水、按下蹲翻身入水；岸边/礁台不高时可以撑上去。
//
// 两种方向操作（设置 → 操作 → 游泳方向）：
//   view：W/S 沿视线（含俯仰）游，A/D 侧移，跳跃/下蹲额外纯上浮/下潜；水面附近俯角小于 20° 时不往下钻
//   flat：W/A/S/D 只管水平，跳跃/下蹲负责升降（旧操作，但冲刺不再锁死方向）
import { look } from '../renderer/shared'
import { canOccupy, moveStep, PLAYER_RADIUS } from '../core/player'
import { floorHeight, structStandTopAt } from '../world/mapgen'
import { audio } from '../core/audio'
import type { Engine } from '../engine'

export type SwimMode = 'view' | 'flat'

/** 全部手感参数集中在这里（单位：米、秒） */
export const SWIM = {
  /** 有输入时速度逼近目标的速率（1/秒）：约 0.55s 到 90% */
  RESP: 4.2,
  /** 反向输入时额外的刹车速率（转身更快，不会「漂一大圈」） */
  BRAKE: 6.5,
  /** 无输入时的水阻（1/秒）：松手 1s 后剩约 30% 速度 */
  GLIDE: 1.2,
  /** 垂直方向无输入时的水阻 */
  VGLIDE: 1.6,
  /** 冲刺：划水周期、每次划水冲量（占最高速比例）、每次划水体力、速度上限倍数 */
  STROKE_T: 0.62,
  STROKE_K: 0.62,
  /** 一次划水的发力时长（冲量分摊在这段时间里，不是一帧顶上去） */
  STROKE_PUSH: 0.24,
  STROKE_STAMINA: 9,
  SPRINT_CAP: 1.18,
  /** 冲刺时持续目标速度占最高速的比例（其余靠划水冲量补上，形成一冲一滑的节奏） */
  SPRINT_BASE: 0.8,
  /** 浮力：水面以下 BUOY_D 米内向上（肺里有气，最后 1 米渐弱），SINK_D0 米以下开始下沉，SINK_D1 达到最大 */
  BUOY_UP: 1.0,
  BUOY_D: 3,
  SINK: 0.28,
  SINK_D0: 30,
  SINK_D1: 90,
  /** 浮力造成的漂移速度上限（只是缓慢漂，不会把人拽走） */
  BUOY_VMAX: 0.55,
  /** 水面附近俯角死区（弧度）：视角压低不到这个角度时 view 模式不往下钻 */
  SURF_DEAD_PITCH: 0.35,
  /** 判为「在水面」的距离（米） */
  SURF_EPS: 0.3,
  /** 水面按下蹲：翻身入水的初速度与冷却 */
  DUCK_V: -3.6,
  DUCK_CD: 0.8,
  /** 撑上岸：前方台面最多高出水面多少米、动作时长、检测距离 */
  CLIMB_OUT_H: 1.35,
  CLIMB_OUT_T: 0.55,
  CLIMB_OUT_REACH: 0.55,
  /** 垂直键单独使用时的目标速度占最高速的比例 */
  VKEY_K: 1.0,
  /** 水下体力恢复倍率（水面踩水正常恢复） */
  SUB_STAMINA_REGEN: 0.6,
  /** 耗氧倍率：静止 / 正常游 / 冲刺划水 */
  O2_IDLE: 0.7,
  O2_SWIM: 1.0,
  O2_SPRINT: 1.8,
  /** 屏气阶段（占屏气上限的比例）：憋气感 / 胸口抽动 */
  O2_URGE: 0.6,
  O2_CONTRACT: 0.85,
  /** 超过屏气上限后多少秒视野完全变黑 */
  BLACKOUT_T: 6,
  /** 出水恢复：前 RECOVER_FAST_T 秒以 RECOVER_FAST 倍速恢复，之后 RECOVER 倍速 */
  RECOVER_FAST: 6,
  RECOVER_FAST_T: 2,
  RECOVER: 3,
  /** 出水时憋气程度超过这个比例会大口吸气 */
  GASP_K: 0.4,
  // ---- 阶段 3：噪音分级（noiseEvent 半径，米） ----
  /** 普通游（每游 0.9m 一次）：水下 / 水面 */
  NOISE_SWIM_SUB: 3,
  NOISE_SWIM_SURF: 5,
  /** 冲刺划水（每划一下，算明显响动）：水下 / 水面拍水 */
  NOISE_STROKE_SUB: 8,
  NOISE_STROKE_SURF: 11,
  /** 翻身入水 / 撑上岸 */
  NOISE_DUCK: 6,
  NOISE_CLIMB: 5,
  // ---- 阶段 3：水下战斗 ----
  /** 头没在水下时近战间隔倍率 */
  MELEE_SLOW: 1.3,
  /** 水下投掷：出手速度倍率、水阻（1/s）、下沉加速度。水平射程约为岸上的一半 */
  THROW_SPEED: 0.6,
  THROW_DRAG: 2.0,
  THROW_G: 2.45,
  // ---- 阶段 3：L7 水流 ----
  /** 水流速度的衰减（1/s）：浪过去后还会被带着漂一段 */
  CUR_DRAG: 0.9,
  /** 涌浪推力：加速度 = 浪高 × SURGE_ACC × exp(−深度 / SURGE_DEPTH) */
  SURGE_ACC: 2.4,
  SURGE_DEPTH: 4,
  /** 水墙内朝中面的拉力（m/s² × 偏离量） */
  WALL_ACC: 1.2,
  // ---- 阶段 3：水压 / 减压病（只在 L7） ----
  /** 水压提示的深度（米）；150m 起扣血是原有逻辑 */
  PRESS_DEPTHS: [30, 60, 100, 150] as readonly number[],
  /** 超过这个上浮速度算「上浮太快」（m/s） */
  ASCENT_FAST: 1.6,
  /** 只有最近潜到过这么深才会累积 */
  BENDS_MIN_DEPTH: 40,
  /** 慢慢上浮 / 停留时「快速上浮米数」的消退速度（m/s，相当于减压停留） */
  BENDS_DECAY: 0.5,
  /** 回到这么浅时结算：快速上浮超过 BENDS_SAFE 米就发作 */
  BENDS_CHECK_DEPTH: 8,
  BENDS_SAFE: 25,
  /** 快速上浮超过 BENDS_SAFE 后，再多 BENDS_FULL 米就是最重 */
  BENDS_FULL: 40,
  /** 发作时长 = BASE + 严重度 × EXTRA（秒）；关节痛扣血 = DMG0 + 严重度 × DMG1（每秒） */
  BENDS_BASE_T: 30,
  BENDS_EXTRA_T: 30,
  BENDS_DMG0: 0.15,
  BENDS_DMG1: 0.25,
  /** 发作期间体力恢复倍率 */
  BENDS_STAMINA: 0.5,
  /** 潜回这么深可以「再加压」，症状消退快 3 倍 */
  BENDS_RECOMP_DEPTH: 15,
} as const

export interface SwimState {
  vx: number; vy: number; vz: number
  /** 下一次划水的倒计时；<0 表示没在冲刺 */
  strokeT: number
  /** 划水次数（渲染层用于手臂动画相位） */
  strokes: number
  /** 最近一次划水后的时间（秒） */
  sinceStroke: number
  /** 当前划水发力剩余时间与方向 */
  pushT: number; px: number; py: number; pz: number
  duckCd: number
  prevCrouch: boolean
  /** 本帧是否贴着水面 */
  atSurface: boolean
  /** 撑上岸演出 */
  out: { t: number; sx: number; sy: number; sz: number; tx: number; ty: number; tz: number } | null
  /** 上一帧世界坐标（检测传送：位置突变就清掉惯性） */
  lx: number; ly: number; lz: number
  /** 想游却被挡住的持续时间（L7 用于自动翻越障碍） */
  stuckT: number
  /** ---- 屏气反馈（渲染层/HUD 读取） ---- */
  /** 憋气程度 = breathT / 上限（>1 = 缺氧） */
  o2k: number
  /** 0 正常 / 1 憋气感 / 2 胸口抽动 / 3 缺氧 */
  stage: 0 | 1 | 2 | 3
  /** 缺氧黑屏程度 0–1 */
  blackK: number
  /** 心跳计时、最近一次心跳后的时间（HUD 脉冲） */
  beatT: number; sinceBeat: number
  /** 胸口抽动计时、最近一次抽动后的时间 */
  contractT: number; sinceContract: number
  /** 出水后经过的时间 */
  airT: number
  /** 入水冲击（渲染层镜头用，0–1 衰减） */
  entryK: number
  sinceMsg: number
  /** ---- 阶段 3 ---- */
  /** 外部水流速度（涌浪 / 水墙），单独积分，不受游速上限影响 */
  cx: number; cy: number
  /** 已提示到的水压阶段（PRESS_DEPTHS 的下标 +1；0 = 没提示过） */
  pressStage: number
  /** 最近潜到的最深处（米，浅水时慢慢回落） */
  deepMax: number
  /** 「快速上浮」累计米数 */
  fastUp: number
  fastWarned: boolean
  /** 减压病剩余时长与严重度（0–1） */
  bendsT: number; bendsSev: number
}

export const newSwimState = (): SwimState => ({ vx: 0, vy: 0, vz: 0, strokeT: -1, strokes: 0, sinceStroke: 9, pushT: 0, px: 0, py: 0, pz: 0, duckCd: 0, prevCrouch: false, atSurface: false, out: null, lx: NaN, ly: NaN, lz: NaN, stuckT: 0, o2k: 0, stage: 0, blackK: 0, beatT: 0, sinceBeat: 9, contractT: 0, sinceContract: 9, airT: 9, entryK: 0, sinceMsg: 99, cx: 0, cy: 0, pressStage: 0, deepMax: 0, fastUp: 0, fastWarned: false, bendsT: 0, bendsSev: 0 })

export function resetSwim(s: SwimState) { Object.assign(s, newSwimState()) }

/** 世界系输入 (mx,my) → 本地前进/右移分量（与 renderer.applyView 互逆） */
export function localAxes(mx: number, my: number, yaw: number) {
  const s = Math.sin(yaw), c = Math.cos(yaw)
  return { fwd: -s * mx - c * my, right: c * mx - s * my }
}

/** 期望游泳方向（长度 ≤1 的三维向量，世界系；z 向上为正） */
export function swimIntent(mode: SwimMode, mx: number, my: number, up: number, yaw: number, pitch: number, atSurface: boolean) {
  let x: number, y: number, z: number
  if (mode === 'view') {
    const { fwd, right } = localAxes(mx, my, yaw)
    // 水面附近俯角小于死区时按水平游（不然水面上稍微低头就会一直往下钻）
    const pit = atSurface && pitch > -SWIM.SURF_DEAD_PITCH && pitch < 0 ? 0 : pitch
    const cp = Math.cos(pit), sp = Math.sin(pit)
    const s = Math.sin(yaw), c = Math.cos(yaw)
    x = fwd * -s * cp + right * c
    y = fwd * -c * cp + right * -s
    z = fwd * sp + up * SWIM.VKEY_K
  } else {
    x = mx; y = my; z = up * SWIM.VKEY_K
  }
  const l = Math.hypot(x, y, z)
  if (l > 1) { x /= l; y /= l; z /= l }
  return { x, y, z, mag: Math.min(1, l) }
}

/** 浮力加速度（米/秒²），depth = 水面以下多少米（脚底计） */
export function buoyancy(depth: number): number {
  // 水面下 BUOY_D-1 米内满浮力，最后 1 米过渡到 0
  if (depth < SWIM.BUOY_D) return SWIM.BUOY_UP * Math.min(1, SWIM.BUOY_D - depth)
  if (depth <= SWIM.SINK_D0) return 0
  return -SWIM.SINK * Math.min(1, (depth - SWIM.SINK_D0) / (SWIM.SINK_D1 - SWIM.SINK_D0))
}

/** 指数逼近：v 以速率 k 朝 target 靠近 */
const approach = (v: number, target: number, k: number, dt: number) => v + (target - v) * (1 - Math.exp(-k * dt))

export interface SwimCtx {
  /** 当前（已含各种减速效果的）最高游速 */
  maxSpeed: number
  /** 是否按住冲刺且体力足够 */
  sprint: boolean
  /** 水面高度（玩家脚底能到的最高 z） */
  surfaceZ: number
  /** 水底高度 */
  floorZ: number
}

/**
 * 推进一帧游泳速度（只改速度，不改位置；位置由 movement 的水平积分/垂直段负责）。
 * 返回本帧是否发生了一次划水。
 */
export function stepSwimVelocity(eng: Engine, s: SwimState, dt: number, c: SwimCtx): boolean {
  const p = eng.player, inp = eng.input
  // 传送/换层/脚本挪动后不带惯性
  const wx = p.x + (eng.map?.inf?.ox ?? 0), wy = p.y + (eng.map?.inf?.oy ?? 0)
  if (!(Math.abs(wx - s.lx) < 3 && Math.abs(wy - s.ly) < 3 && Math.abs(p.z - s.lz) < 3)) { s.vx = s.vy = s.vz = 0 }
  const up = (inp.jump ? 1 : 0) - (inp.crouch ? 1 : 0)
  s.atSurface = p.z >= c.surfaceZ - SWIM.SURF_EPS
  const it = swimIntent(eng.swimMode, inp.mx, inp.my, up, look.yaw, look.pitch, s.atSurface)
  const max = c.maxSpeed
  let stroked = false
  s.sinceStroke += dt
  s.duckCd = Math.max(0, s.duckCd - dt)

  // 冲刺：一下一下划水。持续目标速度只占一部分，每次划水沿当前意图方向加一记冲量。
  const sprinting = c.sprint && it.mag > 0.1
  if (sprinting) {
    if (s.strokeT < 0) s.strokeT = 0 // 刚开始冲刺立刻划第一下
    s.strokeT -= dt
    if (s.strokeT <= 0) {
      s.strokeT += SWIM.STROKE_T
      s.pushT = SWIM.STROKE_PUSH
      s.px = it.x / it.mag; s.py = it.y / it.mag; s.pz = it.z / it.mag
      s.strokes++; s.sinceStroke = 0
      if (!(eng.dev.god && eng.dev.statLock)) p.stamina = Math.max(0, p.stamina - SWIM.STROKE_STAMINA * (eng.manmadeT > 0 ? 2 : 1))
      audio.swimStroke(eng.submerged, 0.8 + 0.4 * Math.min(1, Math.hypot(s.vx, s.vy, s.vz) / Math.max(0.1, max)))
      stroked = true
      // [swim 阶段 3] 冲刺划水是明显响动：水面拍水更响
      eng.noise = Math.min(1, eng.noise + 0.45)
      eng.noiseEvent(p.x, p.y, eng.submerged ? SWIM.NOISE_STROKE_SUB : SWIM.NOISE_STROKE_SURF, true)
    }
  } else s.strokeT = -1
  // 划水发力：冲量按正弦包络分摊在 STROKE_PUSH 秒里（总量 = STROKE_K × 最高速）
  if (s.pushT > 0) {
    const t0 = SWIM.STROKE_PUSH - s.pushT, t1 = Math.min(SWIM.STROKE_PUSH, t0 + dt)
    const F = (t: number) => (1 - Math.cos(Math.PI * t / SWIM.STROKE_PUSH)) / 2 // 0→1 累积
    const k = max * SWIM.STROKE_K * (F(t1) - F(t0))
    s.vx += s.px * k; s.vy += s.py * k; s.vz += s.pz * k
    s.pushT -= dt
  }

  const tgtK = sprinting ? SWIM.SPRINT_BASE : 1
  const tx = it.x * max * tgtK, ty = it.y * max * tgtK, tz = it.z * max * tgtK
  // 水平：有输入向目标逼近；与当前速度反向时额外刹车；没输入只受水阻
  const hIn = Math.hypot(it.x, it.y) > 0.05
  if (hIn) {
    const dot = s.vx * tx + s.vy * ty
    const k = dot < 0 ? SWIM.BRAKE : SWIM.RESP
    // 冲刺时速度高于持续目标属于划水冲量，只按水阻衰减，不被「拉回」目标
    if (sprinting && Math.hypot(s.vx, s.vy) > Math.hypot(tx, ty) && dot > 0) {
      const g = Math.exp(-SWIM.GLIDE * dt)
      s.vx *= g; s.vy *= g
      // 方向仍朝意图偏转
      const hv = Math.hypot(s.vx, s.vy), hl = Math.hypot(tx, ty) || 1
      s.vx = approach(s.vx, tx / hl * hv, SWIM.RESP, dt); s.vy = approach(s.vy, ty / hl * hv, SWIM.RESP, dt)
    } else {
      s.vx = approach(s.vx, tx, k, dt); s.vy = approach(s.vy, ty, k, dt)
    }
  } else {
    const g = Math.exp(-SWIM.GLIDE * dt)
    s.vx *= g; s.vy *= g
  }
  // 垂直：有垂直意图时逼近；没有时受水阻并叠加浮力
  if (Math.abs(it.z) > 0.05) {
    if (sprinting && s.vz * tz > 0 && Math.abs(s.vz) > Math.abs(tz)) s.vz *= Math.exp(-SWIM.GLIDE * dt)
    else s.vz = approach(s.vz, tz, s.vz * tz < 0 ? SWIM.BRAKE : SWIM.RESP, dt)
  } else {
    s.vz *= Math.exp(-SWIM.VGLIDE * dt)
    const a = buoyancy(c.surfaceZ - p.z)
    if (a !== 0 && !s.atSurface) {
      s.vz += a * dt
      // 浮力只造成缓慢漂移：超过漂移上限的部分不由浮力继续加速
      if (a > 0 && s.vz > SWIM.BUOY_VMAX) s.vz = Math.max(SWIM.BUOY_VMAX, s.vz - a * dt)
      if (a < 0 && s.vz < -SWIM.BUOY_VMAX) s.vz = Math.min(-SWIM.BUOY_VMAX, s.vz - a * dt)
    }
  }

  // 水面按下蹲（按下沿）：翻身入水
  if (inp.crouch && !s.prevCrouch && s.atSurface && s.duckCd <= 0 && p.z > c.floorZ + 0.6) {
    s.vz = Math.min(s.vz, SWIM.DUCK_V)
    s.duckCd = SWIM.DUCK_CD
    audio.splash(0.35)
    eng.splashParticles(p.x, p.y, c.surfaceZ)
    eng.noiseEvent(p.x, p.y, SWIM.NOISE_DUCK, false)
  }
  s.prevCrouch = !!inp.crouch

  // 总速度上限
  let cap = max * (sprinting || s.sinceStroke < SWIM.STROKE_T * 2 ? SWIM.SPRINT_CAP : 1.0) + 0.01
  if (s.duckCd > SWIM.DUCK_CD - 0.45) cap = Math.max(cap, -SWIM.DUCK_V) // 翻身入水那一下允许超过平时游速
  const sp = Math.hypot(s.vx, s.vy, s.vz)
  if (sp > cap) { const k = cap / sp; s.vx *= k; s.vy *= k; s.vz *= k }
  return stroked
}

/** 水平积分后：撞墙时只去掉速度里「顶着墙」的那部分（贴墙方向保留，沿墙继续滑） */
export function absorbBlocked(s: SwimState, moved: { x: number; y: number }, tUsed: number) {
  if (tUsed <= 1e-6) return
  const bx = s.vx * tUsed - moved.x, by = s.vy * tUsed - moved.y // 被挡掉的位移
  const bl = Math.hypot(bx, by)
  if (bl < Math.hypot(s.vx, s.vy) * tUsed * 0.05 || bl < 1e-5) return
  // 完全挡死（两个轴都走不动）时看不出墙的朝向：不削速度，让下一帧照常尝试（碰撞层会自己找滑动方向）
  if (Math.hypot(moved.x, moved.y) < 1e-6) return
  const nx = bx / bl, ny = by / bl
  const into = s.vx * nx + s.vy * ny
  if (into > 0) { s.vx -= into * nx; s.vy -= into * ny }
}

/** 找前方可以撑上去的落点（没有返回 null）。surfaceZ=玩家脚底能到的水面高度 */
export function findClimbOut(eng: Engine, surfaceZ: number, dirX: number, dirY: number) {
  const p = eng.player, m = eng.map!
  if (p.z < surfaceZ - 1.0) return null
  const dl = Math.hypot(dirX, dirY)
  if (dl < 0.1) return null
  const nx = dirX / dl, ny = dirY / dl
  for (const reach of [SWIM.CLIMB_OUT_REACH, SWIM.CLIMB_OUT_REACH + 0.3]) {
    const x = p.x + nx * reach, y = p.y + ny * reach
    const tx = Math.floor(x), ty = Math.floor(y)
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) continue
    const top = Math.max(floorHeight(m, x, y, 0), structStandTopAt(m, x, y, p.z + 2, 0))
    if (!(top > p.z + 0.25 && top <= surfaceZ + SWIM.CLIMB_OUT_H)) continue
    if (m.liquid[ty * m.w + tx] === 1 && top < surfaceZ - 0.05) continue // 前面还是水
    const land = { x: p.x + nx * (reach + 0.12), y: p.y + ny * (reach + 0.12) }
    if (!canOccupy(m, land.x, land.y, 0.32, { z: top + 0.02, band: 0 })) continue
    return { x: land.x, y: land.y, z: top + 0.02 }
  }
  return null
}

/** 按跳跃且前方有落点时开始撑上岸。返回是否开始了动作 */
export function tryClimbOut(eng: Engine, s: SwimState, surfaceZ: number, dirX: number, dirY: number): boolean {
  if (s.out || !eng.input.jump) return false
  const t = findClimbOut(eng, surfaceZ, dirX, dirY)
  if (!t) return false
  const p = eng.player
  s.out = { t: 0, sx: p.x, sy: p.y, sz: p.z, tx: t.x, ty: t.y, tz: t.z }
  s.vx = s.vy = s.vz = 0
  eng.input.jump = false
  audio.splash(0.6)
  eng.splashParticles(p.x, p.y, surfaceZ)
  eng.noiseEvent(p.x, p.y, SWIM.NOISE_CLIMB, false)
  return true
}

/** 撑上岸演出推进：先抬升到台面高度，再向前挪上去。结束返回 true */
export function stepClimbOut(eng: Engine, s: SwimState, dt: number): boolean {
  const o = s.out!
  const p = eng.player
  const oldK = Math.max(0, Math.min(1, o.t / SWIM.CLIMB_OUT_T)), oldZ = Math.min(1, oldK / .6), oldXY = Math.max(0, (oldK - .35) / .65)
  const oldEase = oldXY * oldXY * (3 - 2 * oldXY)
  const expectedX = o.sx + (o.tx - o.sx) * oldEase, expectedY = o.sy + (o.ty - o.sy) * oldEase
  const expectedZ = o.sz + (o.tz - o.sz) * (1 - (1 - oldZ) * (1 - oldZ))
  // Teleports and external scripts cancel a mantle rather than pulling the
  // player back to its previous bank (also safe if a streaming origin moved).
  if (Math.hypot(p.x - expectedX, p.y - expectedY) > 1 || Math.abs(p.z - expectedZ) > 1) {
    s.out = null; s.vx = s.vy = s.vz = 0; return true
  }
  o.t += dt
  const k = Math.min(1, o.t / SWIM.CLIMB_OUT_T)
  const kz = Math.min(1, k / 0.6), kxy = Math.max(0, (k - 0.35) / 0.65)
  const ez = 1 - (1 - kz) * (1 - kz), exy = kxy * kxy * (3 - 2 * kxy)
  p.z = o.sz + (o.tz - o.sz) * ez
  p.x = o.sx + (o.tx - o.sx) * exy
  p.y = o.sy + (o.ty - o.sy) * exy
  p.vz = 0
  if (k >= 1) { s.out = null; return true }
  return false
}

/** 当前耗氧倍率：静止 0.7、正常游 1、冲刺划水 1.8 */
export function o2Rate(eng: Engine, s: SwimState): number {
  if (s.sinceStroke < SWIM.STROKE_T * 1.5 && eng.input.sprint) return SWIM.O2_SPRINT
  const moving = Math.hypot(eng.input.mx, eng.input.my) > 0.1 || eng.input.jump || eng.input.crouch
  return moving ? SWIM.O2_SWIM : SWIM.O2_IDLE
}

/**
 * 每帧推进屏气反馈：阶段、心跳、胸口抽动、缺氧黑屏、出水吸气。
 * sub=当前是否在水下；limit=屏气上限。只读写 eng.breathT 的恢复，不负责扣血（movement 负责）。
 */
export function stepBreathFx(eng: Engine, s: SwimState, dt: number, sub: boolean, limit: number) {
  const wasSub = s.airT <= 0
  if (sub) s.airT = 0
  else {
    if (wasSub) {
      // 刚浮出水面
      if (s.o2k > SWIM.GASP_K) {
        audio.gasp(Math.min(1, (s.o2k - SWIM.GASP_K) / (1 - SWIM.GASP_K)))
        if (s.o2k > 0.85) eng.msg('你冲出水面，大口大口地喘着气。', 'system')
      }
    }
    s.airT += dt
    const rate = s.airT < SWIM.RECOVER_FAST_T ? SWIM.RECOVER_FAST : SWIM.RECOVER
    eng.breathT = Math.max(0, eng.breathT - dt * rate)
  }
  s.o2k = limit > 0 ? eng.breathT / limit : 0
  s.stage = s.o2k > 1 ? 3 : s.o2k > SWIM.O2_CONTRACT ? 2 : s.o2k > SWIM.O2_URGE ? 1 : 0
  // 心跳：憋气感阶段开始出现，越憋越快越响（出水后还会跳一会儿，跟着氧气恢复慢下来）
  s.sinceBeat += dt
  if (s.stage >= 1) {
    s.beatT -= dt
    if (s.beatT <= 0) {
      const u = Math.min(1, (s.o2k - SWIM.O2_URGE) / (1 - SWIM.O2_URGE))
      s.beatT = 1.05 - 0.5 * u
      s.sinceBeat = 0
      audio.breathBeat(0.35 + 0.65 * u)
    }
  } else s.beatT = 0
  // 胸口抽动：本能地想吸气，镜头一抖、吐出一串气泡
  s.sinceContract += dt
  if (sub && s.stage >= 2) {
    s.contractT -= dt
    if (s.contractT <= 0) {
      s.contractT = s.stage === 3 ? 1.1 + Math.random() * 0.6 : 2.0 + Math.random() * 1.2
      s.sinceContract = 0
      eng.camShake = Math.min(1, eng.camShake + (s.stage === 3 ? 0.32 : 0.18))
      audio.bubbleBurst(s.stage === 3 ? 1 : 0.6)
      eng.bubbleParticles(eng.player.x, eng.player.y, eng.player.z + 1.35)
      if (s.stage === 2 && s.sinceMsg > 8) { s.sinceMsg = 0; eng.msg('胸口一阵阵抽紧——身体在逼你吸气。', 'damage') }
    }
  } else s.contractT = 0.8
  // 缺氧黑屏：超过上限后 BLACKOUT_T 秒内逐渐全黑；有空气后很快退去
  if (s.stage === 3 && sub) s.blackK = Math.min(1, s.blackK + dt / SWIM.BLACKOUT_T)
  else s.blackK = Math.max(0, s.blackK - dt * 0.8)
  s.entryK = Math.max(0, s.entryK - dt * 2.2)
  s.sinceMsg += dt
}

// ======================= 阶段 3 =======================

/** 头没在水下（真正的水下战斗） */
export const underwater = (eng: Engine) => eng.inLiquid === 1 && eng.submerged

/** 近战 / 徒手攻击间隔倍率 */
export function meleeIntervalMul(eng: Engine): number { return underwater(eng) ? SWIM.MELEE_SLOW : 1 }

/** 水下开枪：扣不响，只冒一串气泡。返回 true = 已拦下 */
export function blockUnderwaterGun(eng: Engine, s: SwimState): boolean {
  if (!underwater(eng)) return false
  const p = eng.player
  audio.bubbleBurst(0.5)
  eng.bubbleParticles(p.x, p.y, p.z + 1.2)
  if (s.sinceMsg > 2.5) { s.sinceMsg = 0; eng.msg('水下开不了枪——扳机扣下去，只冒出一串气泡。', 'system') }
  return true
}

/** 每帧推进外部水流：衰减 + 按水流把玩家挪开（只在水格里挪，撞到岸就停） */
export function stepCurrent(eng: Engine, s: SwimState, dt: number) {
  const p0 = eng.player, inf = eng.map?.inf
  if (Number.isFinite(s.lx) && (Math.abs(p0.x + (inf?.ox ?? 0) - s.lx) >= 3 || Math.abs(p0.y + (inf?.oy ?? 0) - s.ly) >= 3 || Math.abs(p0.z - s.lz) >= 3)) { s.cx = s.cy = 0; return }
  const g = Math.exp(-SWIM.CUR_DRAG * dt)
  s.cx *= g; s.cy *= g
  if (Math.abs(s.cx) + Math.abs(s.cy) < 1e-4) { s.cx = s.cy = 0; return }
  if (eng.inLiquid !== 1) { s.cx = s.cy = 0; return }
  const m = eng.map!, p = eng.player
  if (!Number.isFinite(s.cx + s.cy + dt) || dt <= 0) { s.cx = s.cy = 0; return }
  // Water forces use the same body collision as swimming. Bounded substeps
  // prevent a strong surge from tunnelling through a thin rock or crate.
  const speed = Math.hypot(s.cx, s.cy), time = Math.min(dt, 128 * .12 / speed)
  const steps = Math.max(1, Math.min(128, Math.ceil(speed * time / .12)))
  const h = time / steps
  const water = (x: number, y: number) => {
    const tx = Math.floor(x), ty = Math.floor(y), i = ty * m.w + tx
    return tx >= 1 && ty >= 1 && tx < m.w - 1 && ty < m.h - 1 && m.liquid[i] === 1 && m.up?.[i] !== 1
  }
  for (let i = 0; i < steps; i++) {
    const x = p.x, y = p.y
    const dx = s.cx * h, dy = s.cy * h
    const ax = water(x + dx, y) ? dx : 0, ay = water(x, y + dy) ? dy : 0
    moveStep(m, p, ax, ay, PLAYER_RADIUS, { z: p.z, band: 0, crouch: p.crouching })
    if (!water(p.x, p.y)) { p.x = x; p.y = y; s.cx = s.cy = 0; break }
    if (Math.abs(p.x - x) < Math.abs(dx) * .1) s.cx = 0
    if (Math.abs(p.y - y) < Math.abs(dy) * .1) s.cy = 0
    if (!s.cx && !s.cy) break
  }
}

/** 涌浪推力：浪峰（h>0）沿离开波源的方向加速，越深越弱 */
export function surgePush(eng: Engine, s: SwimState, dt: number, h: number, dirX: number, dirY: number) {
  if (h <= 0) return
  const depth = Math.max(0, -eng.player.z)
  const a = h * SWIM.SURGE_ACC * Math.exp(-depth / SWIM.SURGE_DEPTH)
  s.cx += dirX * a * dt; s.cy += dirY * a * dt
}

/** 水墙拉力：朝墙体中面 */
export function wallPull(s: SwimState, dt: number, nx: number, ny: number, perp: number) {
  s.cx -= nx * perp * SWIM.WALL_ACC * dt; s.cy -= ny * perp * SWIM.WALL_ACC * dt
}

const PRESS_MSG = [
  '耳膜被压得生疼——你已经在 30 米以下了。',
  '胸口像被一只手攥紧。60 米，阳光几乎到不了这里。',
  '100 米。手电的光被黑水一口一口吞掉，四周安静得可怕。',
  '水压大得骨头都在响——再往下就是死区了。',
]

/**
 * 水压提示 + 轻度减压病（只在 L7）。
 * - 下潜越过 30/60/100/150m 各提示一次（回浅 10m 后可再次提示）；
 * - 最近到过 40m 以下时，以超过 1.6m/s 的速度上浮会累积「快速上浮米数」；慢慢上浮或停留会消退；
 * - 回到 8m 以内结算：超过 25m 就发作。发作期间关节痛轻微扣血、体力恢复减半、视野晃；潜回 15m 以下消退快 3 倍。
 */
export function stepPressure(eng: Engine, s: SwimState, dt: number) {
  const p = eng.player
  const l7 = eng.levelDef.id === 7
  const inSea = l7 && eng.inLiquid === 1
  const depth = inSea ? Math.max(0, -p.z) : 0
  // 水压阶段提示
  if (inSea) {
    const D = SWIM.PRESS_DEPTHS
    while (s.pressStage < D.length && depth >= D[s.pressStage]) {
      eng.msg(PRESS_MSG[s.pressStage], s.pressStage >= 3 ? 'damage' : 'system')
      s.pressStage++
    }
    while (s.pressStage > 0 && depth < D[s.pressStage - 1] - 10) s.pressStage--
  } else s.pressStage = 0
  // 最深记录：更深时立刻刷新；只有回到浅水（≤8m）停留时才每秒回落 1m（相当于水面休息）
  s.deepMax = depth > s.deepMax ? depth : depth <= SWIM.BENDS_CHECK_DEPTH ? Math.max(depth, s.deepMax - dt) : s.deepMax
  // 快速上浮累积
  const up = inSea ? p.vz : 0
  if (inSea && s.deepMax >= SWIM.BENDS_MIN_DEPTH && up > SWIM.ASCENT_FAST && depth > SWIM.BENDS_CHECK_DEPTH) {
    s.fastUp += up * dt
    if (!s.fastWarned && s.fastUp > SWIM.BENDS_SAFE * 0.6) {
      s.fastWarned = true
      eng.msg('你上浮得太快了——耳朵和关节一阵刺痛。慢一点，或者停一停。', 'damage')
    }
  } else if (up < 1.2) s.fastUp = Math.max(0, s.fastUp - SWIM.BENDS_DECAY * dt)
  // 回到浅水结算
  if (inSea && depth <= SWIM.BENDS_CHECK_DEPTH && s.fastUp > 0) {
    if (s.fastUp > SWIM.BENDS_SAFE) {
      const sev = Math.min(1, (s.fastUp - SWIM.BENDS_SAFE) / SWIM.BENDS_FULL)
      s.bendsSev = Math.max(s.bendsSev, sev)
      s.bendsT = Math.max(s.bendsT, SWIM.BENDS_BASE_T + sev * SWIM.BENDS_EXTRA_T)
      eng.msg('关节里像灌进了碎玻璃——减压病。潜回 15 米以下能缓一缓。', 'damage')
    }
    s.fastUp = 0; s.fastWarned = false
  }
  // 发作
  if (s.bendsT > 0) {
    const recomp = inSea && depth >= SWIM.BENDS_RECOMP_DEPTH
    s.bendsT = Math.max(0, s.bendsT - dt * (recomp ? 3 : 1))
    if (!eng.dev.god) {
      p.hp -= (SWIM.BENDS_DMG0 + s.bendsSev * SWIM.BENDS_DMG1) * dt
      if (p.hp <= 0) { eng.die('死于减压病'); return }
    }
    if (s.bendsT <= 0) { s.bendsSev = 0; eng.msg('关节里的刺痛终于退了。', 'system') }
  }
}
