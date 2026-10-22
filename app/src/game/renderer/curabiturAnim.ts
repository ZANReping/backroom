// 受眷鸟（Entity 37）重制——第 2 阶段：动画库（不含 AI）。
// 只驱动 curabiturMesh 的刚性部件组（userData.curabiturRig）与发光材质，不改模型结构。
// 每个片段是 t（秒）→ 姿态（CurabiturPose，一组纯数值）的纯函数，可任意时刻采样、可两两混合。
//
// 片段（雌雄共用，spore_release 仅雄性）：
//   float_idle    悬浮呼吸：浮囊缓慢胀缩、胶核亮度呼吸、身体在浮囊下轻摆、羽团随之起伏，腿收起
//   drift         漂移：缓慢平移（可 inPlace 去掉平移），身体相对浮囊滞后摆动
//   lure          舌光诱捕：喙微张，舌缓慢放长下垂（首次播放 1.2s 引入），舌光一闪一闪地摇晃——循环
//   strike        收舌扑击：猛地收舌 + 前扑，腿爪前伸抓握，喙张开后在 CURABITUR_STRIKE_BITE_T 咬合（单次 0.9s）
//   eat           咀嚼吞咽：爪里抓着猎物，喙开合咀嚼、仰头吞咽
//   spore_release 散播孢子（雄）：浮囊收缩，孢子囊自上而下依次亮起后脱落飘散（粒子轨迹见 sampleCurabiturSpores）
//   flee          受惊逃离：浮囊一胀、胶核闪亮，迅速上升
//   hit           受击：被打得一晃，浮囊被挤扁后回弹，光闪烁
//   death         死亡：浮囊漏气瘪下、光熄灭，掉落在地侧躺
//
// API：
//   sampleCurabitur(grp, clip, t, opts) → CurabiturPose   采样一个片段
//   applyCurabiturPose(grp, pose)                          写回部件组与发光材质
//   animCurabitur(grp, clip, t, opts)                      = 采样 + 写回
//   mixCurabiturPose(a, b, w)                              两个姿态混合（数值线性插值）
//   sampleCurabiturSpores(grp, t)                          spore_release 第 t 秒每颗孢子的位置 / 状态（模型空间）
//   CURABITUR_CLIPS[sex]                                   每种性别的片段表（时长、是否循环）
//
// 坐标：模型正面 +X、上 +Y；位移（x/y/z）是相对模型原点的偏移，写在 rig.body 上（不改 grp.position，游戏层自由摆放 grp）。
import * as THREE from 'three'
import type { CurabiturRig, CurabiturSex } from './curabiturMesh'

const TAU = Math.PI * 2
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
const smooth = (a: number, b: number, t: number) => { const k = clamp01((t - a) / (b - a)); return k * k * (3 - 2 * k) }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** 一次「鼓包」：a→峰值→b，正弦半波 */
const bump = (a: number, b: number, t: number) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI))
/** 衰减振荡（受击回弹用） */
const ring = (t: number, hz: number, decay: number) => (t < 0 ? 0 : Math.sin(t * hz * TAU) * Math.exp(-t * decay))

export type CurabiturClip = 'float_idle' | 'drift' | 'lure' | 'strike' | 'eat' | 'spore_release' | 'flee' | 'hit' | 'death'
export interface ClipInfo { len: number; loop: boolean }
const COMMON: Record<Exclude<CurabiturClip, 'spore_release'>, ClipInfo> = {
  float_idle: { len: 4, loop: true },
  drift: { len: 4, loop: true },
  lure: { len: 2.4, loop: true },
  strike: { len: 0.9, loop: false },
  eat: { len: 1.6, loop: true },
  flee: { len: 1.4, loop: false },
  hit: { len: 0.5, loop: false },
  death: { len: 2.2, loop: false },
}
export const CURABITUR_CLIPS: Record<CurabiturSex, Partial<Record<CurabiturClip, ClipInfo>>> = {
  female: { ...COMMON },
  male: { ...COMMON, spore_release: { len: 3.6, loop: false } },
}
export const CURABITUR_CLIP_LABELS: Record<CurabiturClip, string> = {
  float_idle: '悬浮呼吸', drift: '漂移', lure: '舌光诱捕', strike: '收舌扑击', eat: '咀嚼吞咽',
  spore_release: '散播孢子（雄）', flee: '受惊逃离', hit: '受击', death: '漏气坠落',
}

// ---------- 导出的时刻 / 幅度常量（AI 与判定用） ----------
/** strike：舌在这一刻完全收回（舌尖肉球回到喙边） */
export const CURABITUR_STRIKE_TONGUE_IN_T = 0.24
/** strike：喙咬合的时刻（判定命中 / 扣血的那一帧） */
export const CURABITUR_STRIKE_BITE_T = 0.38
/** strike：前扑的最远位移（米，模型 +X，未乘个体缩放） */
export const CURABITUR_STRIKE_REACH = 0.26
/** lure：舌从收起放到下垂诱捕长度所需时间（首次播放） */
export const CURABITUR_LURE_INTRO = 1.2
/** flee：整段上升高度（米） */
export const CURABITUR_FLEE_RISE = 1.8
/** death：默认坠落高度（米；opts.fallHeight 覆盖，应取「身体中心到地面」减去侧躺半厚 ≈0.1） */
export const CURABITUR_DEATH_DROP = 0.9
/** death：落地时刻（之后静止） */
export const CURABITUR_DEATH_LAND_T = 1.55
/** spore_release：第一颗孢子囊亮起的时刻、全部亮完的跨度、亮起到脱落的间隔（秒） */
export const CURABITUR_SPORE_TIMING = { start: 0.55, span: 1.5, hold: 0.35 }

/** 姿态：全部为数值，便于纯函数采样与混合 */
export interface CurabiturPose {
  /** 相对原点的位移（米，模型空间） */
  x: number; y: number; z: number
  /** 整体朝向 / 俯仰（+ 抬头）/ 侧滚 */
  yaw: number; pitch: number; roll: number
  /** 身体绕浮囊吊点的摆动（Z：前后，X：左右），浮囊按 sacLag 比例反向保持竖直 */
  swingZ: number; swingX: number; sacLag: number
  /** 浮囊缩放（水平 / 竖直） */
  sacXZ: number; sacY: number
  /** 羽团蓬起（0 = 静止，正 = 炸开） */
  plume: number
  headPitch: number; headYaw: number
  /** 喙张开 0–1（可略超） */
  beak: number
  /** 舌伸出长度：0 收回 →1 下垂 →2 伸长 */
  tongue: number
  /** 舌摆（绕 Z 前后 / 绕 X 左右）；lure 的反向缩放保持不变 */
  tongueSwayZ: number; tongueSwayX: number
  /** 腿：tuck 收腿 0–1，reach 前伸抓握 0–1+，grip 爪内扣；arms 前肢前伸 */
  tuck: number; reach: number; grip: number; arms: number
  /** 发光：胶核 / 舌光 / 孢子囊；lureFlash 舌光闪烁（加在光晕上） */
  glowCore: number; glowLure: number; glowSpore: number; lureFlash: number
  /** 身体竖向压缩（受击） */
  squash: number
  /** spore_release 进行到第几秒（<0 = 不在散播，孢子囊全在） */
  sporeT: number
}
export interface CurabiturAnimOpts {
  /** 个体相位偏移（星群里各只不同步） */
  phase?: number
  /** drift：漂移速度（m/s，模型 +X 为前）；影响滞后摆动幅度 */
  speed?: number
  /** drift：只要滞后摆动、不要片段自带的往返平移（游戏里由 AI 移动 grp） */
  inPlace?: boolean
  /** lure：跳过 1.2s 的放舌引入（从中途切入时） */
  noIntro?: boolean
  /** death：坠落高度（米） */
  fallHeight?: number
}

const NUM_KEYS: (keyof CurabiturPose)[] = ['x', 'y', 'z', 'yaw', 'pitch', 'roll', 'swingZ', 'swingX', 'sacLag', 'sacXZ', 'sacY', 'plume', 'headPitch', 'headYaw', 'beak', 'tongue', 'tongueSwayZ', 'tongueSwayX', 'tuck', 'reach', 'grip', 'arms', 'glowCore', 'glowLure', 'glowSpore', 'lureFlash', 'squash']
const restPose = (): CurabiturPose => ({
  x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, swingZ: 0, swingX: 0, sacLag: 0.75, sacXZ: 1, sacY: 1, plume: 0,
  headPitch: 0, headYaw: 0, beak: 0.08, tongue: 0.32, tongueSwayZ: 0, tongueSwayX: 0, tuck: 1, reach: 0, grip: 0, arms: 0,
  glowCore: 1, glowLure: 0.55, glowSpore: 0.7, lureFlash: 0, squash: 1, sporeT: -1,
})

function rigOf(grp: THREE.Object3D): CurabiturRig { const r = grp.userData.curabiturRig as CurabiturRig | undefined; if (!r) throw Error('not a curabitur mesh'); return r }

/** 悬浮底子：呼吸 + 轻摆（几乎所有片段都叠在它上面；频率都取 1/4Hz 的整数倍，4s 内首尾相接） */
function breathe(P: CurabiturPose, tt: number, k = 1) {
  const w = (tt / 4) * TAU
  const s = Math.sin(w)
  P.sacXZ += 0.06 * s * k; P.sacY += 0.08 * s * k
  P.glowCore += 0.16 * s * k
  P.y += (0.022 * Math.sin(w + 0.7) + 0.006 * Math.sin(w * 3)) * k
  P.swingZ += (0.06 * Math.sin(w - 0.9) + 0.015 * Math.sin(w * 3 + 1)) * k
  P.swingX += 0.045 * Math.sin(w * 2 + 1.3) * k
  P.plume += 0.035 * Math.sin(w - 1.4) * k // 羽团滞后于浮囊起伏
  P.headPitch += 0.04 * Math.sin(w * 2 - 0.4) * k
  P.headYaw += 0.08 * Math.sin(w + 2) * k
  P.tongueSwayZ += 0.08 * Math.sin(w * 2 - 1) * k
}

// ---------------------------------------------------------------------------
// 片段
// ---------------------------------------------------------------------------
function clipPose(P: CurabiturPose, clip: CurabiturClip, t: number, raw: number, o: CurabiturAnimOpts) {
  const ph = o.phase ?? 0, tt = t + ph
  switch (clip) {
    case 'float_idle':
      breathe(P, tt)
      break
    case 'drift': { // 往返平移（4s 一来回）：身体滞后于浮囊——速度方向的反向倾斜 + 相位延迟
      breathe(P, tt, 0.6)
      const w = (tt / 4) * TAU, A = 0.32
      const vel = o.inPlace ? (o.speed ?? 0.25) : A * (TAU / 4) * Math.cos(w)
      const velLag = o.inPlace ? vel : A * (TAU / 4) * Math.cos(w - 0.9) // 身体比浮囊晚约 0.6s
      if (!o.inPlace) P.x += A * Math.sin(w)
      // 浮囊带着走、身体被拖在后面：速度为正（向 +X）时下半身甩向 -X
      P.swingZ += -velLag * 0.75
      P.pitch += vel * 0.12
      P.plume += Math.abs(velLag) * 0.08
      P.tongueSwayZ += -velLag * 0.9 // 舌被拖在更后面
      P.headPitch += -0.05
      break
    }
    case 'lure': { // 舌缓慢放长下垂（raw 时间做引入，之后循环），舌光两次一闪
      breathe(P, tt, 0.5)
      const intro = o.noIntro ? 1 : smooth(0, CURABITUR_LURE_INTRO, raw)
      const w = (tt / 2.4) * TAU
      P.beak = lerp(0.1, 0.42, intro) + 0.04 * Math.sin(w * 2)
      P.tongue = lerp(0.32, 1.75, intro) + 0.1 * Math.sin(w + 0.5) * intro
      P.tongueSwayZ += (0.22 * Math.sin(w) + 0.05 * Math.sin(w * 3)) * intro
      P.tongueSwayX += 0.14 * Math.sin(w * 2 + 0.8) * intro
      P.headPitch += -0.16 * intro + 0.03 * Math.sin(w)
      // 一闪一闪：每循环两个尖脉冲 + 呼吸底光
      const flash = Math.pow(0.5 + 0.5 * Math.sin(w * 2), 4)
      P.lureFlash = flash * intro
      P.glowLure = lerp(0.55, 0.85, intro) + 0.55 * flash * intro
      P.glowCore += -0.08 * intro // 能量往舌光上集中，胶核略暗
      break
    }
    case 'strike': {
      const T = t
      // 舌：0.1–0.24 猛地收回（ease-in，越收越快）
      const tin = clamp01((T - 0.1) / (CURABITUR_STRIKE_TONGUE_IN_T - 0.1))
      P.tongue = lerp(1.75, 0.12, tin * tin) + 0.1 * smooth(0.6, 0.9, T)
      P.tongueSwayZ = 0.25 * bump(0.08, 0.26, T) // 被甩起
      P.lureFlash = bump(0.06, 0.2, T) * 1.2; P.glowLure = 1.3 - 0.7 * smooth(0.2, 0.5, T)
      // 前扑：0–0.1 后缩蓄力，0.12–0.36 冲出，0.55–0.9 收回
      const lunge = smooth(0.12, 0.34, T) * (1 - smooth(0.55, 0.9, T) * 0.85)
      P.x = -0.035 * bump(0, 0.16, T) + CURABITUR_STRIKE_REACH * lunge
      P.y = -0.06 * lunge
      P.pitch = 0.1 * bump(0, 0.16, T) - 0.22 * lunge
      P.swingZ = 0.28 * bump(0.12, 0.42, T) - 0.08 * bump(0.5, 0.9, T) // 下半身（爪）领先、回收时被甩回
      P.sacLag = 0.9
      P.sacXZ = 1 - 0.1 * bump(0.08, 0.4, T); P.sacY = 1 - 0.14 * bump(0.08, 0.4, T) + 0.05 * bump(0.4, 0.7, T) // 浮囊一挤推进
      P.glowCore = 1 + 0.35 * bump(0.1, 0.45, T)
      // 腿爪：放下前伸，0.38 起合拢抓握
      P.tuck = 1 - smooth(0.1, 0.26, T) + 0.4 * smooth(0.6, 0.9, T)
      P.reach = smooth(0.12, 0.32, T) * (1 - 0.45 * smooth(0.55, 0.9, T))
      P.grip = smooth(0.34, 0.42, T)
      P.arms = smooth(0.14, 0.3, T) * (1 - 0.5 * smooth(0.6, 0.9, T))
      // 喙：0.15–0.32 张大，0.32–0.38 咬合，之后补咬一口
      P.beak = 1.05 * smooth(0.14, 0.3, T) * (1 - smooth(0.31, CURABITUR_STRIKE_BITE_T, T)) + 0.5 * bump(0.5, 0.7, T) + 0.05
      P.headPitch = -0.25 * lunge + 0.12 * bump(0.36, 0.5, T) // 咬合那一下往回一扯
      P.plume = 0.12 * bump(0.12, 0.6, T)
      break
    }
    case 'eat': { // 爪里抓着猎物：喙两次咀嚼 + 一次仰头吞咽
      breathe(P, tt, 0.4)
      const c = (((tt % 1.6) + 1.6) % 1.6)
      P.tongue = 0.15; P.tuck = 0.35; P.reach = 0.45; P.grip = 1; P.arms = 0.55
      P.beak = 0.5 * bump(0.05, 0.38, c) + 0.42 * bump(0.42, 0.75, c) + 0.6 * bump(1.05, 1.25, c) + 0.05
      P.headPitch += -0.2 * (bump(0.05, 0.38, c) + bump(0.42, 0.75, c)) + 0.42 * bump(1.0, 1.5, c)
      P.pitch += 0.06 * bump(1.0, 1.5, c)
      P.plume += 0.05 * bump(1.15, 1.6, c) // 吞下去时颈羽一鼓
      P.glowCore += 0.06 * bump(1.2, 1.6, c)
      P.glowLure = 0.3
      break
    }
    case 'spore_release': {
      breathe(P, tt, 0.35)
      const T = t
      const squeeze = smooth(0, 0.6, T) * (1 - smooth(2.6, 3.4, T))
      P.sacXZ += -0.14 * squeeze; P.sacY += -0.18 * squeeze
      // 收缩时浑身一抖、羽毛炸开
      P.swingX += 0.04 * Math.sin(T * 17) * bump(0.1, 0.9, T)
      P.plume += 0.1 * squeeze
      P.glowCore += -0.22 * squeeze
      P.glowSpore = 0.7 + 0.5 * squeeze
      P.headPitch += 0.08 * squeeze
      P.sporeT = T
      break
    }
    case 'flee': {
      const T = t
      const puff = bump(0, 0.36, T)
      P.sacXZ = 1 + 0.2 * puff + 0.05 * smooth(0.3, 1.4, T); P.sacY = 1 + 0.28 * puff + 0.06 * smooth(0.3, 1.4, T)
      P.glowCore = 1 + 0.6 * puff + 0.15 * smooth(0.3, 1, T)
      // 上升：先慢后快（加速度），同时往后（远离威胁）退
      const k = clamp01((T - 0.12) / 1.28)
      P.y = CURABITUR_FLEE_RISE * (k * k * (1.6 - 0.6 * k))
      P.x = -0.3 * smooth(0.1, 1.4, T)
      P.pitch = 0.18 * smooth(0, 0.3, T)
      P.swingZ = 0.08 * Math.sin(T * 9) * (1 - k) - 0.06 * k; P.swingX = 0.05 * Math.sin(T * 7 + 1)
      P.tongue = 0.32 * (1 - smooth(0, 0.14, T)) + 0.02
      P.beak = 0.6 * bump(0, 0.25, T) + 0.05
      P.tuck = 1; P.plume = 0.16 * bump(0, 0.5, T) + 0.05
      P.glowLure = 0.3
      break
    }
    case 'hit': {
      const T = t
      P.x = -0.07 * bump(0, 0.3, T)
      P.roll = 0.28 * ring(T, 2.6, 6)
      P.pitch = 0.12 * ring(T, 2.2, 7)
      P.swingZ = -0.22 * ring(T, 2.1, 5); P.swingX = 0.1 * ring(T, 3, 6)
      P.sacY = 1 - 0.22 * ring(T + 0.096, 2.6, 6); P.sacXZ = 1 + 0.12 * ring(T + 0.096, 2.6, 6)
      P.glowCore = 1 - 0.55 * bump(0, 0.12, T) + 0.25 * bump(0.12, 0.3, T) - 0.2 * bump(0.3, 0.42, T)
      P.glowLure = 0.55 - 0.4 * bump(0, 0.2, T)
      P.tongue = lerp(0.32, 0.12, bump(0, 0.4, T))
      P.beak = 0.75 * bump(0, 0.35, T) + 0.06 // 尖叫
      P.tuck = 1 - 0.55 * bump(0, 0.4, T); P.reach = 0.3 * bump(0.02, 0.35, T) // 腿乱蹬
      P.plume = 0.22 * bump(0, 0.35, T)
      P.squash = 1 - 0.1 * bump(0, 0.18, T)
      break
    }
    case 'death': {
      const T = t, fall = o.fallHeight ?? CURABITUR_DEATH_DROP
      // 0–0.3：中弹一挣；0.15–1.2 浮囊漏气瘪下、胶核光熄灭（带闪烁）
      const leak = smooth(0.15, 1.25, T)
      P.sacXZ = lerp(1, 0.62, leak) + 0.06 * Math.sin(T * 23) * bump(0.15, 1.1, T); P.sacY = lerp(1, 0.32, leak)
      const flick = 0.5 + 0.5 * Math.sin(T * 31) * Math.sin(T * 11.3)
      P.glowCore = lerp(1, 0.07, smooth(0.1, 1.5, T)) * (1 - 0.45 * flick * bump(0.2, 1.4, T))
      P.glowLure = lerp(0.6, 0.04, smooth(0.1, 1.2, T)); P.glowSpore = lerp(0.7, 0.15, leak)
      // 坠落：0.45 起自由落体（二次），CURABITUR_DEATH_LAND_T 落地，一个小弹跳
      const L = CURABITUR_DEATH_LAND_T, f = clamp01((T - 0.45) / (L - 0.45))
      P.y = -fall * f * f + 0.035 * bump(L, L + 0.22, T)
      P.roll = 0.15 * ring(T, 2.5, 5) + 0.55 * smooth(0.5, L, T) + 0.08 * bump(L, L + 0.3, T) // 歪向一侧
      P.pitch = -1.0 * smooth(0.4, L, T) + 0.1 * bump(L, L + 0.3, T) // 栽倒：头朝前扑在地上，瘪掉的浮囊歪在背后
      P.swingZ = 0.12 * Math.sin(T * 6) * bump(0.1, L, T); P.sacLag = lerp(0.75, 0.15, smooth(0.6, L, T))
      P.tongue = lerp(0.32, 1.05, smooth(0.3, 1.2, T)) // 舌软软垂出
      P.tongueSwayZ = 0.5 * Math.sin(T * 5) * bump(0.3, L, T) + 0.9 * smooth(L - 0.2, L + 0.3, T) // 落地后被压向一边
      P.beak = 0.65 * bump(0, 0.4, T) + 0.35 * smooth(0.6, 1.4, T) + 0.05
      P.tuck = lerp(1, 0.4, smooth(0.1, 0.7, T)) + 0.4 * smooth(L, L + 0.5, T); P.reach = 0.25 * bump(0.05, 0.9, T); P.grip = smooth(L, L + 0.5, T) // 死后爪蜷起
      P.plume = 0.2 * bump(0, 0.6, T) + 0.06 * bump(L, L + 0.3, T)
      P.squash = 1 - 0.08 * bump(L, L + 0.18, T)
      P.headPitch = -0.3 * smooth(0.6, L, T)
      break
    }
  }
}

// ---------------------------------------------------------------------------
// 对外接口
// ---------------------------------------------------------------------------
export function sampleCurabitur(grp: THREE.Object3D, clip: CurabiturClip, t: number, opts: CurabiturAnimOpts = {}): CurabiturPose {
  const rig = rigOf(grp)
  let info = CURABITUR_CLIPS[rig.sex][clip]
  if (!info) { clip = 'float_idle'; info = CURABITUR_CLIPS[rig.sex].float_idle! } // 雌性没有散播孢子
  const tt = info.loop ? t : Math.max(0, Math.min(t, info.len))
  const P = restPose()
  clipPose(P, clip, tt, t, opts)
  return P
}
export function mixCurabiturPose(a: CurabiturPose, b: CurabiturPose, w: number): CurabiturPose {
  const o = { ...a }
  for (const k of NUM_KEYS) o[k] = lerp(a[k], b[k], w)
  o.sporeT = w < 0.5 ? a.sporeT : b.sporeT // 孢子进度不可插值，取权重大的一方
  return o
}

interface Cache {
  S: number; sacPos: THREE.Vector3; headPos: THREE.Vector3; legPos: THREE.Vector3[]
  plume: THREE.Mesh | null
  sacHalo: THREE.Sprite | null; sacHaloOp: number; sacHaloSize: number
  lureHalo: THREE.Sprite | null; lureHaloOp: number; lureHaloSize: number
  core: THREE.Color; memb: THREE.Color; lure: THREE.Color; spore: THREE.Color | null
  light: number[]
  pods: { mesh: THREE.Mesh; rest: Float32Array; per: number; order: number[] } | null
}
const CACHE = new WeakMap<CurabiturRig, Cache>()
/** 首次写回时记下静止状态（缩放、材质基色、光强、孢子囊顶点） */
function cacheOf(rig: CurabiturRig): Cache {
  let c = CACHE.get(rig)
  if (c) return c
  let plume: THREE.Mesh | null = null
  for (const ch of rig.body.children) { const m = ch as THREE.Mesh; if (m.isMesh && (m.material as THREE.Material).alphaTest > 0) plume = m }
  const sprite = (g: THREE.Object3D) => (g.children.find((x) => (x as THREE.Sprite).isSprite) as THREE.Sprite | undefined) ?? null
  const sacHalo = sprite(rig.sac), lureHalo = sprite(rig.lure)
  let pods: Cache['pods'] = null
  if (rig.glow.spores) {
    const mesh = rig.sac.children.find((x) => (x as THREE.Mesh).isMesh && (x as THREE.Mesh).material === rig.glow.spores) as THREE.Mesh | undefined
    if (mesh) {
      const g = mesh.geometry, pa = g.attributes.position as THREE.BufferAttribute
      const n = rig.sporePods.length, per = pa.count / n
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pa.count * 3).fill(1), 3))
      rig.glow.spores.vertexColors = true; rig.glow.spores.needsUpdate = true
      pods = { mesh, rest: (pa.array as Float32Array).slice(), per, order: sporeOrder(rig) }
    }
  }
  c = {
    S: rig.body.scale.x, sacPos: rig.sac.position.clone(), headPos: rig.head.position.clone(), legPos: rig.legs.map((l) => l.position.clone()), plume,
    sacHalo, sacHaloOp: sacHalo?.material.opacity ?? 0, sacHaloSize: sacHalo?.scale.x ?? 0,
    lureHalo, lureHaloOp: lureHalo?.material.opacity ?? 0, lureHaloSize: lureHalo?.scale.x ?? 0,
    core: rig.glow.core.color.clone(), memb: rig.glow.membrane.emissive.clone(), lure: rig.glow.lure.color.clone(), spore: rig.glow.spores?.color.clone() ?? null,
    light: rig.lights.map((l) => l.intensity), pods,
  }
  CACHE.set(rig, c)
  return c
}
/** 孢子囊亮起顺序：自上而下（同高度按方位角），纯函数——只依赖 rig.sporePods */
const ORDER = new WeakMap<CurabiturRig, number[]>()
function sporeOrder(rig: CurabiturRig) {
  let o = ORDER.get(rig)
  if (!o) { const sp = rig.sporePods; o = sp.map((_p, i) => i).sort((a, b) => (sp[b].y - sp[a].y) || (Math.atan2(sp[a].z, sp[a].x) - Math.atan2(sp[b].z, sp[b].x))); ORDER.set(rig, o) }
  return o
}

const _q = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _p2 = new THREE.Vector3()
export function applyCurabiturPose(grp: THREE.Object3D, P: CurabiturPose) {
  const rig = rigOf(grp), C = cacheOf(rig)
  // 身体：整体旋转绕身体中心，摆动绕浮囊吊点（吊点不动、下半身甩开）
  _q.setFromEuler(_e.set(P.roll, P.yaw, P.pitch, 'YXZ'))
  _qs.setFromEuler(_e.set(P.swingX, 0, P.swingZ, 'XYZ'))
  rig.body.quaternion.copy(_q).multiply(_qs)
  _p.copy(C.sacPos).multiplyScalar(C.S)
  _p2.copy(_p).applyQuaternion(_qs)
  rig.body.position.set(P.x, P.y, P.z).add(_p.sub(_p2).applyQuaternion(_q))
  rig.body.scale.set(C.S * (1 + (1 - P.squash) * 0.5), C.S * P.squash, C.S * (1 + (1 - P.squash) * 0.5))
  // 浮囊：反向抵消一部分摆动（保持大致竖直）、缩放
  _qi.copy(_qs).invert()
  rig.sac.quaternion.identity().slerp(_qi, P.sacLag)
  rig.sac.scale.set(P.sacXZ, P.sacY, P.sacXZ)
  if (C.plume) C.plume.scale.set(1 + P.plume * 0.6, 1 + P.plume, 1 + P.plume * 0.6)
  rig.head.rotation.set(0, P.headYaw, P.headPitch)
  rig.beak.forEach((g, i) => { const s = i === 0 ? -1 : 1; g.rotation.set(0, -s * P.beak * 0.55, 0) })
  // 舌：scale.y 伸缩，lure 反向缩放保持圆润（只在 tongue 组上旋转，lure 自身不旋转，不会产生剪切）
  const tl = Math.max(0.05, P.tongue)
  rig.tongue.visible = P.tongue > 0.02
  rig.tongue.scale.set(1, tl, 1)
  rig.tongue.rotation.set(P.tongueSwayX, 0, P.tongueSwayZ)
  rig.lure.scale.set(1, 1 / tl, 1)
  // 腿：tuck 收（绕 Z 向后折到腹下），reach 向前伸，grip 爪内扣（整条腿再向前勾一点）
  rig.legs.forEach((l, i) => {
    const s = i === 0 ? -1 : 1
    l.position.copy(C.legPos[i]).add(_p.set(0.05 * P.reach, -0.035 * P.reach, 0)) // 前伸时整条腿从羽团里探出
    l.rotation.set(s * 0.12 * P.reach, 0, P.tuck * 0.9 + P.reach * 1.45 + P.grip * 0.3)
  })
  rig.arms.forEach((a) => a.rotation.set(0, 0, -P.arms * 0.7 + P.tuck * 0.35 - P.grip * 0.15))
  // 发光
  const gc = Math.max(0, P.glowCore), gl = Math.max(0, P.glowLure)
  rig.glow.core.color.copy(C.core).multiplyScalar(gc)
  rig.glow.membrane.emissive.copy(C.memb).multiplyScalar(Math.pow(gc, 0.8))
  rig.glow.lure.color.copy(C.lure).multiplyScalar(Math.min(1.25, 0.25 + gl * 0.75))
  if (C.sacHalo) { C.sacHalo.material.opacity = C.sacHaloOp * Math.min(1.6, gc); C.sacHalo.scale.setScalar(C.sacHaloSize * (0.8 + 0.2 * gc)) }
  if (C.lureHalo) { C.lureHalo.material.opacity = Math.min(1, C.lureHaloOp * gl); C.lureHalo.scale.setScalar(C.lureHaloSize * (0.55 + 0.45 * gl + 0.5 * P.lureFlash)) }
  if (rig.lights[0]) rig.lights[0].intensity = C.light[0] * gc
  if (rig.lights[1]) rig.lights[1].intensity = C.light[1] + 0.22 * gl * gl + 0.35 * P.lureFlash
  if (rig.glow.spores && C.spore) rig.glow.spores.color.copy(C.spore).multiplyScalar(Math.min(1, P.glowSpore))
  // 孢子囊：依次亮起（顶点色）→ 脱落（顶点收到中心点隐藏）
  if (C.pods) {
    const { mesh, rest, per, order } = C.pods, g = mesh.geometry, pa = g.attributes.position as THREE.BufferAttribute, ca = g.attributes.color as THREE.BufferAttribute
    const arr = pa.array as Float32Array, col = ca.array as Float32Array
    order.forEach((pod, rank) => {
      const st = podState(rank, order.length, P.sporeT)
      const c = st.state === 0 ? 0.55 : st.state === 1 ? 0.55 + 0.45 * st.k : 0
      const p = rig.sporePods[pod]
      const cx = p.x - C.sacPos.x, cy = p.y - C.sacPos.y, cz = p.z - C.sacPos.z
      for (let v = pod * per; v < (pod + 1) * per; v++) {
        if (st.state === 2) { arr[v * 3] = cx; arr[v * 3 + 1] = cy; arr[v * 3 + 2] = cz }
        else { const sw = st.state === 1 ? 1 + 0.5 * st.k : 1; arr[v * 3] = cx + (rest[v * 3] - cx) * sw; arr[v * 3 + 1] = cy + (rest[v * 3 + 1] - cy) * sw; arr[v * 3 + 2] = cz + (rest[v * 3 + 2] - cz) * sw }
        col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = c
      }
    })
    pa.needsUpdate = true; ca.needsUpdate = true
  }
}
export function animCurabitur(grp: THREE.Object3D, clip: CurabiturClip, t: number, opts: CurabiturAnimOpts = {}) { const p = sampleCurabitur(grp, clip, t, opts); applyCurabiturPose(grp, p); return p }

// ---------------------------------------------------------------------------
// 孢子粒子
// ---------------------------------------------------------------------------
/** 第 rank 颗（亮起顺序）孢子囊在 spore_release 第 t 秒的状态：0 附着未亮 / 1 亮起（k 0→1）/ 2 已脱落（age 秒） */
function podState(rank: number, n: number, t: number): { state: 0 | 1 | 2; k: number; age: number } {
  if (t < 0) return { state: 0, k: 0, age: 0 }
  const { start, span, hold } = CURABITUR_SPORE_TIMING
  const lit = start + (rank / Math.max(1, n - 1)) * span
  if (t < lit) return { state: 0, k: 0, age: 0 }
  if (t < lit + hold) return { state: 1, k: smooth(lit, lit + hold * 0.6, t), age: 0 }
  return { state: 2, k: 1, age: t - lit - hold }
}
/** 浮囊在 spore_release 第 t 秒的缩放（与 clipPose 一致，不含呼吸） */
const sacScaleAt = (t: number) => { const sq = smooth(0, 0.6, t) * (1 - smooth(2.6, 3.4, t)); return { xz: 1 - 0.14 * sq, y: 1 - 0.18 * sq } }
const hash = (i: number) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) }

export interface SporeParticle {
  /** 孢子囊序号（rig.sporePods 下标） */
  pod: number
  /** 0 附着未亮 / 1 亮起将脱落 / 2 飘散中 */
  state: 0 | 1 | 2
  /** 模型空间位置（未计入片段的位移 / 摆动——附着时贴着静止浮囊，飘散后与身体无关） */
  pos: THREE.Vector3
  /** 亮度 0–1（附着时暗、亮起时最亮、飘散中轻微闪烁） */
  glow: number
  /** 飘散了多少秒 */
  age: number
}
/**
 * spore_release 第 t 秒每颗孢子的轨迹采样（纯函数，t 可超过片段时长，孢子会继续飘）。
 * 轨迹：从孢子囊沿浮囊法向弹出（带阻尼），之后受微弱下沉 + 侧向缓流 + 小幅摆荡，慢慢沉向地面附近。
 * 发光孢子约 80 小时后才腐解，所以这里不淡出；游戏层把飘散中的孢子交给粒子系统 / 落地后换成 buildCurabiturSpore。
 */
export function sampleCurabiturSpores(grp: THREE.Object3D, t: number): SporeParticle[] {
  const rig = rigOf(grp), sp = rig.sporePods, order = sporeOrder(rig), n = sp.length
  const S = rig.sex === 'male' ? 0.74 : 1 // 与 curabiturMesh 的个体缩放一致
  const sacC = rig.sac.position // 浮囊静止位置（动画不改它）
  const out: SporeParticle[] = []
  order.forEach((pod, rank) => {
    const st = podState(rank, n, t)
    const p = sp[pod], d = p.clone().sub(sacC)
    const tDet = st.state === 2 ? t - st.age : t
    const sc = sacScaleAt(tDet)
    const p0 = sacC.clone().add(new THREE.Vector3(d.x * sc.xz, d.y * sc.y, d.z * sc.xz)).multiplyScalar(S)
    let glow = st.state === 0 ? 0.35 : st.state === 1 ? 0.35 + 0.65 * st.k : 1
    if (st.state === 2) {
      const a = st.age, h = hash(pod), h2 = hash(pod + 50), nrm = d.clone().normalize()
      const v0 = nrm.multiplyScalar(0.3 + 0.12 * h).add(new THREE.Vector3((h2 - 0.5) * 0.1, 0.06, (h - 0.5) * 0.1))
      const kd = 1.7, e = (1 - Math.exp(-kd * a)) / kd
      p0.addScaledVector(v0, e)
      p0.x += 0.06 * a + 0.03 * Math.sin(a * 1.3 + h * 6)
      p0.y += -0.08 * a + 0.02 * Math.sin(a * 2.1 + h2 * 6)
      p0.z += 0.04 * Math.sin(a * 0.9 + h * 9) + 0.025 * a * (h2 - 0.5)
      glow = 0.82 + 0.18 * Math.sin(a * 7 + h * 20)
    }
    out.push({ pod, state: st.state, pos: p0, glow, age: st.age })
  })
  return out
}
