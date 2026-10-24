// [window] 窗户 Entity 2 —— 阶段 2 动画
// 纯函数式：animateWindow(g, clip, t, p) 按片段与片段内时间 t（秒）直接写入窗内景观的 uniform、手臂关节与碎片，
// 不保存内部状态，机制层（阶段 3）每帧按 AI 状态调用即可，联机各端独立计算。
// 片段：
//   idle     附影窗待机：人形缓慢呼吸、左右轻晃，景色流动（循环 6 s）
//   lure     诱引（玩家 1–6 m 内）：人形贴近玻璃变大、抬手招手，景色泛暖提亮（循环 2.4 s）
//   reach    抓取（≤1–2 m）：手臂从玻璃里猛地伸出、五指张开扑向目标，末段握拳（0.55 s）
//   drag     拖拽：握拳往窗里拉，带挣扎颤动；剪影随之后仰（2.5 s，对应挣脱窗口）
//   release  被近战击中松手：手臂一震、五指弹开、迅速缩回（0.7 s）
//   feed     吞噬：拉入窗内后剪影迅速变清晰、暗闪一下（2 s）
//   newborn  新生态：无人形，景色更亮并缓慢「呼吸」（循环 5 s）
//   dying    衰亡态：碎片漂浮自转、窗框颤动、嵌套碎框缓慢旋转并闪烁（循环 6 s）
//   vanish   衰亡态最终消失：窗内溶解露出墙面，窗框沉入墙里（2.5 s）
import * as THREE from 'three'
import { poseWindowArm } from './windowMesh'

export type WindowClip = 'idle' | 'lure' | 'reach' | 'drag' | 'release' | 'feed' | 'newborn' | 'dying' | 'vanish'
export const WINDOW_CLIPS: Record<WindowClip, { dur: number; loop: boolean }> = {
  idle: { dur: 6, loop: true }, lure: { dur: 2.4, loop: true }, reach: { dur: 0.55, loop: false }, drag: { dur: 2.5, loop: false },
  release: { dur: 0.7, loop: false }, feed: { dur: 2, loop: false }, newborn: { dur: 5, loop: true }, dying: { dur: 6, loop: true }, vanish: { dur: 2.5, loop: false },
}
export interface WindowAnimParams {
  /** 人形清晰度基线（附影随时间变淡 → 机制层传入），默认 0.85 */
  sil?: number
  /** 目标（玩家胸口）在窗户局部坐标中的位置；手臂按此瞄准 */
  target?: THREE.Vector3
  /** 全局时间，驱动景观流动；缺省用片段时间 */
  time?: number
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const ease = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x) }
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3
const easeIn = (x: number) => clamp01(x) ** 2.2

interface WinData {
  uniforms: Record<string, THREE.IUniform>; arm: THREE.Object3D; frame: THREE.Group; glass: THREE.Mesh
  shards: THREE.Object3D | null; frameRest: { p: THREE.Vector3; r: THREE.Euler }[]; cy: number; glassH: number
}

/** 手臂瞄准：肩点（窗内）→ 目标的方向，转换成 poseWindowArm 的 aimY（俯仰）与根节点偏航；返回伸出所需的 reach */
function aimArm(w: WinData, target: THREE.Vector3 | undefined): { reachMax: number } {
  const arm = w.arm
  const tgt = target ?? new THREE.Vector3(0, w.cy - 0.25, 1.7)
  const from = new THREE.Vector3(arm.position.x, arm.position.y, 0)
  const d = tgt.clone().sub(from)
  arm.rotation.set(0, Math.atan2(d.x, Math.max(0.2, d.z)), 0)
  const dist = Math.hypot(d.x, d.y, d.z)
  arm.userData.aimY = Math.atan2(d.y, Math.hypot(d.x, d.z))
  // 指尖离玻璃 = scale×(reach×1.9 + 0.08)；让指尖停在目标前 0.15 m（抓在胸口而不是穿过去）
  return { reachMax: clamp01(((dist - 0.15) / arm.scale.x - 0.08) / 1.9) }
}

export function animateWindow(g: THREE.Object3D, clip: WindowClip, t: number, p: WindowAnimParams = {}): void {
  const w = g.userData.window as WinData | undefined
  if (!w) return
  const U = w.uniforms
  const T = p.time ?? t
  const info = WINDOW_CLIPS[clip]
  const tt = info.loop ? ((t % info.dur) + info.dur) % info.dur : Math.min(t, info.dur)
  const k = tt / info.dur
  const sil = p.sil ?? 0.85
  // 默认值（每帧重置，片段只改自己关心的部分）
  U.uTime.value = T; U.uSil.value = sil; U.uSilScale.value = 1; U.uSilX.value = 0; U.uBeckon.value = 0; U.uLure.value = 0
  U.uArmHide.value = 0; U.uVanish.value = 0; U.uBright.value = 1
  w.arm.visible = false
  w.frame.position.set(0, 0, 0); w.frame.scale.setScalar(1)
  ;(w.glass.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 1
  const aimY = () => (w.arm.userData.aimY as number) ?? 0

  switch (clip) {
    case 'idle': {
      const br = Math.sin(T * 1.05) // 呼吸 ~6 s 一周
      U.uSilScale.value = 1 + br * 0.018
      U.uSilX.value = Math.sin(T * 0.37) * 0.035 + Math.sin(T * 0.91) * 0.01
      U.uSil.value = sil * (0.94 + 0.06 * Math.sin(T * 0.6))
      break
    }
    case 'lure': {
      // 先贴近（0→0.35），再反复招手；景色随招手节奏泛暖
      const near = ease(k / 0.35)
      U.uSilScale.value = 1 + 0.16 * near + Math.sin(T * 1.6) * 0.01
      U.uSilX.value = Math.sin(T * 0.5) * 0.02
      U.uSil.value = Math.min(1, sil + 0.12 * near)
      const wave = 0.5 + 0.5 * Math.sin(tt * (Math.PI * 2 / info.dur) * 2 - Math.PI / 2)
      U.uBeckon.value = near * (0.55 + 0.45 * wave)
      U.uLure.value = 0.35 + 0.65 * wave * near
      break
    }
    case 'reach': {
      const { reachMax } = aimArm(w, p.target)
      w.arm.visible = true; U.uArmHide.value = 1; U.uSilScale.value = 1.18; U.uSil.value = Math.min(1, sil + 0.15); U.uLure.value = 0.2
      const r = easeOut(k / 0.8) * reachMax
      // 前 80% 张开扑出，末段握紧
      const grip = k < 0.78 ? 0 : ease((k - 0.78) / 0.22) * 0.85
      poseWindowArm(w.arm, r, grip, 0.35 * (1 - k) + 0.05, aimY())
      break
    }
    case 'drag': {
      const { reachMax } = aimArm(w, p.target)
      w.arm.visible = true; U.uArmHide.value = 1; U.uSilScale.value = 1.18 - 0.12 * k; U.uSil.value = Math.min(1, sil + 0.15)
      // 拉回到 35%，加挣扎颤动（逐渐变弱 = 越拖越没力气挣）
      const r = reachMax * (1 - 0.65 * easeIn(k)) + Math.sin(T * 31) * 0.025 * (1 - k * 0.6) + Math.sin(T * 13.7) * 0.02
      poseWindowArm(w.arm, r, 0.9 + Math.sin(T * 23) * 0.04, 0.12 + 0.45 * k, aimY() * (1 - 0.6 * k))
      w.arm.rotation.z = Math.sin(T * 17) * 0.06 * (1 - k)
      U.uSilX.value = Math.sin(T * 9) * 0.01
      break
    }
    case 'release': {
      const { reachMax } = aimArm(w, p.target)
      w.arm.visible = k < 0.98; U.uArmHide.value = k < 0.98 ? 1 : 0; U.uSilScale.value = 1.1 - 0.1 * k
      // 0–15%：受击一震（向上弹、五指张开）；之后加速缩回墙内
      const jolt = Math.sin(clamp01(k / 0.15) * Math.PI)
      const r = reachMax * 0.8 * (1 - easeIn((k - 0.12) / 0.88))
      poseWindowArm(w.arm, r, Math.max(0, 0.9 - k * 6), 0.2 + jolt * 0.5, aimY() + jolt * 0.35)
      w.arm.rotation.z = jolt * 0.25
      U.uSil.value = sil * (1 - 0.35 * jolt)
      break
    }
    case 'feed': {
      // 手臂最后一截缩回（0–20%），之后剪影迅速变清晰并暗闪
      w.arm.visible = k < 0.2; U.uArmHide.value = k < 0.2 ? 1 : 0
      if (k < 0.2) { aimArm(w, p.target); poseWindowArm(w.arm, 0.3 * (1 - k / 0.2), 1, 0.6, 0) }
      const sharpen = ease((k - 0.15) / 0.6)
      U.uSil.value = sil + (1 - sil) * sharpen
      U.uSilScale.value = 1.04 + 0.06 * Math.sin(clamp01((k - 0.15) / 0.4) * Math.PI)
      U.uBright.value = 1 - 0.55 * Math.sin(clamp01((k - 0.18) / 0.3) * Math.PI)
      break
    }
    case 'newborn': {
      U.uSil.value = 0
      U.uBright.value = 1 + 0.08 * Math.sin(T * 1.25)
      U.uLure.value = 0.25 + 0.25 * Math.sin(T * 1.25)
      break
    }
    case 'dying': case 'vanish': {
      U.uSil.value = 0
      const v = clip === 'vanish' ? ease(k) : 0
      // 闪烁：偶发的短暂暗帧
      const flick = Math.sin(T * 0.7) * Math.sin(T * 5.3) > 0.82 ? 0.75 : 1
      U.uBright.value = flick * (1 - 0.3 * v)
      U.uVanish.value = v
      // 窗框各零件绕静止位轻微颤动；消失时沉入墙内
      w.frame.children.forEach((c, i) => {
        const r = w.frameRest[i]; if (!r) return
        c.position.set(r.p.x + Math.sin(T * 1.3 + i) * 0.004, r.p.y + Math.sin(T * 1.7 + i * 2) * 0.004, r.p.z)
        c.rotation.set(r.r.x, r.r.y, r.r.z + Math.sin(T * 0.9 + i) * 0.006)
      })
      w.frame.position.z = -0.28 * easeIn(v)
      w.frame.scale.setScalar(1 - 0.08 * v)
      ;(w.glass.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 1 - v
      if (w.shards) w.shards.children.forEach((s) => {
        const b = s.userData.base as { p: THREE.Vector3; r: THREE.Euler; ph: number; sp: number }
        s.position.set(b.p.x + Math.sin(T * 0.4 * b.sp + b.ph) * 0.03, b.p.y + Math.sin(T * 0.55 * b.sp + b.ph * 1.3) * 0.04, b.p.z + Math.sin(T * 0.3 + b.ph) * 0.02 - 0.45 * easeIn(v))
        s.rotation.set(b.r.x + T * 0.3 * b.sp, b.r.y + T * 0.45 * b.sp, b.r.z)
        s.scale.setScalar(1 - v)
        s.visible = v < 0.99
      })
      break
    }
  }
}
