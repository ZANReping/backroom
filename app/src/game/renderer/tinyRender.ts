// [tiny] 小小重制 阶段 2：游戏内渲染接入。把实体状态映射成 tinyAnim 的参数（带平滑过渡），覆盖通用的颠簸、四肢摆动和攻击前摇。
// - 泳速：按每帧的实际位移估算，0 悬停 → 1 巡游 → 2 冲刺
// - 盘踞：未被激怒、处于 idle 且几乎不动时，蹲在「小小的谎言」门上方
// - 追击终段（距玩家 < 3.2 m）与攻击时甲壳张开
// - 被巨响逼退：[阶段 3] tinyAI 进入 repel（石卡祖笛连吹满 4 声）时播一遍完整 recoil；
//   每一声没吹满的笛响只让它缩一下（tinyAI.cringeT → 约 45% 的 recoil）
// - 盘踞：tinyAI 处于 perch（守在门上；激怒后回到门上也会蹲着）
// - 眼睛和荧光点越深越亮，浮出水面时几乎不亮（维基）
import * as THREE from 'three'
import type { Entity } from '../entities'
import { animateTiny, tinyKickHz, TINY_REST, type TinyAnim } from './tinyAnim'

const sst = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const approach = (cur: number, want: number, rate: number, dt: number) => cur + (want - cur) * Math.min(1, rate * dt)
export const TINY_RECOIL_T = 1.8

interface TinySm { x: number; y: number; spd: number; swim: number; open: number; perch: number; phase: number; recoilT: number; lastState: string; yaw: number; wind: number; strike: number; cringe: number }

export function animateTinyEntity(grp: THREE.Group, e: Entity, time: number, dt: number, gz: number, playerDist: number, originX = 0, originY = 0) {
  const wx = e.x + originX, wy = e.y + originY
  const sm = (grp.userData.tinySm ??= { x: wx, y: wy, spd: 0, swim: 0, open: 0, perch: 1, phase: 0, recoilT: 0, lastState: e.tiny?.phase ?? e.state, yaw: 0, wind: 0, strike: 0, cringe: 0 }) as TinySm
  const ddt = Math.max(1e-3, dt)
  const v = Math.hypot(wx - sm.x, wy - sm.y) / ddt
  sm.x = wx; sm.y = wy
  sm.spd = approach(sm.spd, Math.min(v, 12), 6, dt)
  const ai = e.tiny
  const calm = !!e.def.passive && !e.provoked
  // 被笛声逼退：tinyAI 刚转入 repel
  const phaseNow = ai?.phase ?? e.state
  if (phaseNow === 'repel' && sm.lastState !== 'repel') sm.recoilT = TINY_RECOIL_T
  sm.lastState = phaseNow
  sm.cringe = approach(sm.cringe, (ai?.cringeT ?? 0) > 0 ? 0.45 : 0, 14, dt)
  sm.recoilT = Math.max(0, sm.recoilT - dt)
  const chase = e.state === 'chase' || e.state === 'attack'
  const rel = sm.spd / Math.max(0.5, e.def.speed)
  const swimWant = rel < 0.06 ? 0 : rel < 0.55 ? sst(0.06, 0.45, rel) : 1 + sst(0.55, 0.95, rel)
  sm.swim = approach(sm.swim, chase ? Math.max(swimWant, 1) : swimWant, 3, dt)
  const perching = ai ? ai.phase === 'perch' : calm && e.state === 'idle'
  const perchWant = perching && sm.spd < 0.25 && sm.recoilT <= 0 ? 1 : 0
  sm.perch = approach(sm.perch, perchWant, perchWant ? 1.2 : 4, dt)
  const openWant = e.state === 'attack' || (chase && playerDist < 3.2) ? 1 : 0
  sm.open = approach(sm.open, openWant, 5, dt)
  // 攻击前摇：lungeT 0.32 → 0；前 55% 蓄力、后 45% 出手
  const lk = Math.max(0, e.lungeT) / 0.32
  const windW = e.state === 'attack' && e.lungeT > 0 ? (lk > 0.45 ? (1 - lk) / 0.55 : 1) : 0
  const strikeW = e.state === 'attack' && e.lungeT > 0 && lk <= 0.45 ? 1 - lk / 0.45 : 0
  sm.wind = approach(sm.wind, windW, 25, dt); sm.strike = approach(sm.strike, strikeW, 30, dt)
  sm.phase += dt * Math.PI * 2 * tinyKickHz(sm.swim) * (sm.recoilT > 0 ? 1.6 : 1) * (1 - sm.perch * 0.9)
  const rk = sm.recoilT > 0 ? 1 - sm.recoilT / TINY_RECOIL_T : 1
  const recoil = Math.max(sm.recoilT > 0 ? sst(0, 0.12, rk) * (1 - sst(0.75, 1, rk) * 0.6) : 0, sm.cringe)
  sm.yaw = approach(sm.yaw, chase ? 0 : Math.sin(time * 0.5) * 0.4, 2, dt)
  const depth = Math.max(0, -e.z)
  const a: TinyAnim = {
    ...TINY_REST, t: time, phase: sm.phase, swim: sm.swim, open: sm.open, wind: sm.wind, strike: sm.strike,
    recoil, perch: sm.perch, headYaw: sm.yaw, headPitch: 0,
    glow: (0.12 + Math.min(1, depth / 35) * 0.88) * (1 - 0.5 * recoil),
  }
  animateTiny(grp, a)
  grp.position.y = gz + Math.sin(time * 1.9) * 0.1 * (1 - sm.perch) * (1 - Math.min(1, sm.swim) * 0.6)
}
