// 无面灵（Entity 9）程序化动作层：叠加在 HumanoidMotion 的行走 / 站立姿势之上（v90 重制阶段 2）。
// 依据 entity-9：会模仿人类的社会行为与职业（招手、点头、敲键盘、收银），会牵手、抱腿；
// 幼体情绪不稳定——一不顺心就躺在地上踢打哭闹，安抚后会慢慢平静；成体被激怒时暴躁地挥拳、砸东西。
// 骨骼约定（retroNpc）：+Z 朝前；L 侧在 +X；upperArm.x 为负 = 向前抬臂，z 为正（L）/负（R）= 外展；
// foreArm.x 为负 = 屈肘；head / spine .x 为正 = 低头 / 前倾；shin.x 为正 = 屈膝。
import type * as THREE from 'three'
import type { RetroNpc } from './retroNpc'
import type { FacelingAge } from '../entities/facelingTraits'

export type FacelingGesture =
  | 'wave' | 'nod' | 'sad' | 'point' | 'hold-hand' | 'hug-leg'
  | 'tantrum' | 'soothed' | 'rage' | 'smash' | 'type' | 'cashier'

/** dur：一次（或一个循环）的时长；loop：循环片段；child：仅幼体使用 */
export const FACELING_CLIPS: Record<FacelingGesture, { dur: number; loop: boolean; zh: string; child?: boolean }> = {
  wave: { dur: 1.6, loop: true, zh: '招手' },
  nod: { dur: 1.2, loop: false, zh: '点头' },
  sad: { dur: 3.2, loop: true, zh: '失望低头' },
  point: { dur: 2.4, loop: true, zh: '指路' },
  'hold-hand': { dur: 2.4, loop: true, zh: '牵手' },
  'hug-leg': { dur: 2, loop: true, zh: '抱腿', child: true },
  tantrum: { dur: 1.2, loop: true, zh: '躺地哭闹', child: true },
  soothed: { dur: 3.6, loop: false, zh: '被安抚', child: true },
  rage: { dur: 1, loop: true, zh: '暴怒' },
  smash: { dur: 1.3, loop: false, zh: '砸东西' },
  type: { dur: 1.2, loop: true, zh: '敲键盘' },
  cashier: { dur: 2.4, loop: true, zh: '收银扫码' },
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
const ease = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t) }
const TAU = Math.PI * 2
type Bones = RetroNpc['bones']
const mixR = (b: THREE.Bone, k: number, x: number, y: number, z: number) => {
  b.rotation.set(b.rotation.x + (x - b.rotation.x) * k, b.rotation.y + (y - b.rotation.y) * k, b.rotation.z + (z - b.rotation.z) * k)
}

/** 年龄档的站姿 / 步态修饰（每帧，在步态之后）。motion 0..1 = 行走强度 */
export function applyFacelingAge(rig: RetroNpc, age: FacelingAge | undefined, motion: number, time: number) {
  if (!age || age === 'adult') return
  const b = rig.bones
  if (age === 'elder') {
    // 驼背、探颈、步子拖沓、手微颤
    b.spine.rotation.x += 0.15; b.chest.rotation.x += 0.07; b.neck.rotation.x += 0.08; b.head.rotation.x -= 0.16
    for (const s of ['L', 'R'] as const) {
      const arm = b[`upperArm${s}`], fore = b[`foreArm${s}`]
      arm.rotation.x = arm.rotation.x * 0.5 - 0.08; fore.rotation.x -= 0.18
    }
    b.handR.rotation.z += Math.sin(time * 23) * 0.025; b.handL.rotation.z += Math.sin(time * 19 + 1) * 0.025
    b.hips.position.y -= 0.012 * motion
  } else {
    // 幼年：甩臂幅度大、脑袋东张西望
    for (const s of ['L', 'R'] as const) b[`upperArm${s}`].rotation.x *= 1.5
    b.head.rotation.y += Math.sin(time * 0.9) * 0.15 * (1 - motion)
    b.head.rotation.z += Math.sin(time * 1.3) * 0.06
  }
}

/** 在当前姿势上叠加动作。t = 片段内时间（秒）；w = 混合权重 0..1（AI 淡入淡出用） */
export function applyFacelingGesture(rig: RetroNpc, g: FacelingGesture, t: number, w = 1) {
  const b = rig.bones, C = FACELING_CLIPS[g]
  const u = C.loop ? (t % C.dur) / C.dur : clamp(t / C.dur, 0, 1)
  const env = C.loop ? w : w * ease(u / 0.15) * (1 - ease((u - 0.85) / 0.15)) // 一次性片段自带淡入淡出
  if (env <= 0) return
  switch (g) {
    case 'wave': {
      const s = Math.sin(u * TAU * 2)
      mixR(b.upperArmR, env, -0.3, 0.1, -1.3)
      mixR(b.foreArmR, env, -0.15, 0, -1.25 + s * 0.42)
      mixR(b.handR, env, 0, 0, s * 0.2)
      b.head.rotation.z += 0.08 * env; b.head.rotation.x -= 0.05 * env
      break
    }
    case 'nod': {
      const k = Math.sin(clamp(u / 0.8, 0, 1) * TAU * 2) // 两下
      b.head.rotation.x += (0.12 + 0.28 * Math.max(0, k)) * env
      b.neck.rotation.x += 0.08 * Math.max(0, k) * env
      break
    }
    case 'sad': {
      const sigh = Math.sin(u * TAU)
      b.head.rotation.x += (0.62 + sigh * 0.04) * env; b.neck.rotation.x += 0.18 * env
      b.spine.rotation.x += 0.16 * env; b.chest.rotation.x += 0.12 * env
      b.clavicleL.rotation.z -= 0.12 * env; b.clavicleR.rotation.z += 0.12 * env
      mixR(b.upperArmL, env, -0.12, 0, 0.02); mixR(b.upperArmR, env, -0.12, 0, -0.02)
      mixR(b.foreArmL, env, -0.3, 0, 0); mixR(b.foreArmR, env, -0.3, 0, 0)
      b.chest.scale.y += sigh * 0.012 * env
      break
    }
    case 'point': {
      // 指向前方（出口 / 物品），间或回头确认对方跟上
      const look = ease((Math.sin(u * TAU) + 1) / 2)
      mixR(b.upperArmR, env, -1.42, -0.15, -0.12)
      mixR(b.foreArmR, env, -0.08, 0, 0)
      mixR(b.handR, env, 0.15, 0, 0)
      b.chest.rotation.y -= 0.12 * env
      b.head.rotation.y += (-0.15 + look * 0.85) * env
      // 左手招呼「跟上」
      const beck = Math.max(0, Math.sin(u * TAU * 2))
      mixR(b.upperArmL, env * look, -0.5, 0, 0.12); mixR(b.foreArmL, env * look, -1.2 - beck * 0.5, 0, 0)
      break
    }
    case 'hold-hand': {
      // 一侧手臂伸向身旁偏前的低处（握住对方的手），身子微微靠过去
      const sw = Math.sin(u * TAU)
      mixR(b.upperArmR, env, -0.42 + sw * 0.08, 0, -0.32)
      mixR(b.foreArmR, env, -0.32, 0, 0)
      mixR(b.handR, env, 0.2, -0.4, 0)
      b.spine.rotation.z += 0.04 * env; b.head.rotation.y -= 0.35 * env; b.head.rotation.x += 0.12 * env
      break
    }
    case 'hug-leg': {
      // 幼体抱住对方的腿：前倾、双臂环抱、脸贴上去，轻轻蹭
      const rub = Math.sin(u * TAU)
      b.hips.position.y -= 0.03 * env
      b.spine.rotation.x += 0.38 * env; b.chest.rotation.x += 0.12 * env
      mixR(b.upperArmL, env, -1.25, 0.25, -0.42); mixR(b.upperArmR, env, -1.25, -0.25, 0.42)
      mixR(b.foreArmL, env, -1.25, 0, -0.2); mixR(b.foreArmR, env, -1.25, 0, 0.2)
      b.head.rotation.x -= 0.1 * env; b.head.rotation.z += (0.3 + rub * 0.08) * env; b.head.rotation.y += rub * 0.12 * env
      break
    }
    case 'tantrum': tantrum(b, u, env); break
    case 'soothed': {
      // 抽噎（越来越轻）→ 揉脸 → 放下手、点头
      const sob = Math.max(0, Math.sin(t * 9)) * (1 - ease(u / 0.7))
      const rubK = ease(u / 0.12) * (1 - ease((u - 0.62) / 0.16))
      b.chest.rotation.x += 0.08 * env + sob * 0.06 * env; b.head.rotation.x += (0.35 - 0.25 * ease((u - 0.6) / 0.3)) * env
      b.spine.position.y += sob * 0.006 * env
      b.clavicleL.rotation.z += sob * 0.1 * env; b.clavicleR.rotation.z -= sob * 0.1 * env
      const rub = Math.sin(t * 5) * 0.12
      mixR(b.upperArmL, env * rubK, -0.95, 0.35 + rub, -0.38); mixR(b.upperArmR, env * rubK, -0.95, -0.35 + rub, 0.38)
      mixR(b.foreArmL, env * rubK, -2.0, 0, 0); mixR(b.foreArmR, env * rubK, -2.0, 0, 0)
      if (u > 0.78) b.head.rotation.x += Math.max(0, Math.sin((u - 0.78) / 0.22 * TAU)) * 0.25 * env
      break
    }
    case 'rage': {
      // 双拳高举乱抖，跺脚，胸口起伏，摇头
      const f = Math.sin(u * TAU * 2), shake = Math.sin(t * 31)
      b.hips.position.y -= Math.abs(f) * 0.025 * env
      b.spine.rotation.x += (0.12 + Math.abs(f) * 0.06) * env; b.chest.scale.z += Math.abs(f) * 0.02 * env
      // 双拳在头侧屈肘紧握、上下乱捶（不是欢呼式的直臂上举）
      mixR(b.upperArmL, env, -1.75 + f * 0.35, 0.2, 0.55); mixR(b.upperArmR, env, -1.75 - f * 0.35, -0.2, -0.55)
      mixR(b.foreArmL, env, -1.55 + shake * 0.15, 0, 0); mixR(b.foreArmR, env, -1.55 - shake * 0.15, 0, 0)
      b.clavicleL.rotation.z += 0.12 * env; b.clavicleR.rotation.z -= 0.12 * env
      b.head.rotation.y += Math.sin(u * TAU * 2 + 1) * 0.3 * env; b.head.rotation.x -= 0.18 * env
      break
    }
    case 'smash': {
      // 双手抡过头顶（0–45%），砸下（45–60%），收势
      const up = ease(u / 0.45), down = ease((u - 0.45) / 0.15), rec = 1 - ease((u - 0.7) / 0.3) * 0.0
      const ax = -0.4 - 2.5 * up + 2.1 * down
      mixR(b.upperArmL, env, ax, 0.3, -0.1); mixR(b.upperArmR, env, ax, -0.3, 0.1)
      mixR(b.foreArmL, env, -0.9 * up + 0.7 * down, 0, 0); mixR(b.foreArmR, env, -0.9 * up + 0.7 * down, 0, 0)
      b.spine.rotation.x += (-0.18 * up * (1 - down) + 0.5 * down) * env * rec
      b.head.rotation.x += (-0.2 * up + 0.35 * down) * env
      b.hips.position.y -= 0.06 * down * env
      break
    }
    case 'type': {
      // 敲键盘：前臂平伸，两手交替点按，低头看屏
      const a = Math.sin(t * 17), c = Math.sin(t * 15 + 1.7)
      mixR(b.upperArmL, env, -0.55, 0, 0.12); mixR(b.upperArmR, env, -0.55, 0, -0.12)
      mixR(b.foreArmL, env, -1.0, -0.25, 0); mixR(b.foreArmR, env, -1.0, 0.25, 0)
      mixR(b.handL, env, 0.2 + Math.max(0, a) * 0.22, 0, 0); mixR(b.handR, env, 0.2 + Math.max(0, c) * 0.22, 0, 0)
      b.head.rotation.x += 0.18 * env; b.spine.rotation.x += 0.05 * env
      break
    }
    case 'cashier': {
      // 收银扫码：右手把东西从左边拿起、在扫码口前一顿、放到右边；左手按台面，头跟着货物
      const sweep = u < 0.75 ? ease(u / 0.75) : 1 - ease((u - 0.75) / 0.25)
      const beep = Math.exp(-(((u - 0.38) / 0.06) ** 2))
      mixR(b.upperArmR, env, -0.85, 0.5 - sweep * 1.0, -0.15 + sweep * 0.15)
      mixR(b.foreArmR, env, -0.95 + beep * 0.1, 0, 0)
      mixR(b.upperArmL, env, -0.55, 0, 0.12); mixR(b.foreArmL, env, -0.95, -0.2, 0)
      b.chest.rotation.y += (0.18 - sweep * 0.36) * env
      b.head.rotation.y += (0.3 - sweep * 0.6) * env; b.head.rotation.x += (0.22 - beep * 0.06) * env
      break
    }
  }
}

/** 幼体躺在地上踢打哭闹：仰面躺倒，双腿交替乱蹬，双臂拍地，头左右甩 */
function tantrum(b: Bones, u: number, env: number) {
  const k = env, p = u * TAU
  const hip0 = b.hips.position.y
  b.hips.position.y = hip0 + (0.11 - hip0) * k + Math.abs(Math.sin(p * 2)) * 0.012 * k
  b.hips.position.z += -0.15 * k
  b.hips.rotation.x += (-Math.PI / 2 + 0.12 + Math.sin(p * 2) * 0.05) * k
  b.hips.rotation.z += Math.sin(p) * 0.08 * k
  b.spine.rotation.x += 0.08 * k; b.chest.rotation.x += 0.06 * k
  b.head.rotation.set(b.head.rotation.x * (1 - k) + 0.25 * k, b.head.rotation.y * (1 - k) + Math.sin(p * 2) * 0.55 * k, 0)
  for (const [s, ph] of [['L', 0], ['R', Math.PI]] as const) {
    const kick = Math.sin(p * 2 + ph), up = Math.max(0, kick)
    const thigh = b[`thigh${s}`], shin = b[`shin${s}`], foot = b[`foot${s}`]
    thigh.quaternion.identity(); shin.quaternion.identity(); foot.quaternion.identity()
    thigh.rotation.set(-0.35 - up * 0.95, 0, (s === 'L' ? 0.18 : -0.18)); shin.rotation.set(0.25 + (1 - up) * 0.9, 0, 0); foot.rotation.set(-0.2, 0, 0)
    const arm = b[`upperArm${s}`], fore = b[`foreArm${s}`], beat = Math.sin(p * 2 + ph + 1.2)
    mixR(arm, k, -0.2 - Math.max(0, beat) * 0.9, 0, (s === 'L' ? 1 : -1) * (1.2 + beat * 0.3))
    mixR(fore, k, -0.3 - Math.max(0, beat) * 0.5, 0, 0)
  }
}
