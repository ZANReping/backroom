// 近战武器重制 阶段 2：第一人称握持 + 待机 / 普攻 / 蓄力重击动画（纯函数，renderer 与预览页共用）。
//
// 结构：vm 节点 = 手 + 武器（一个刚体，绕手腕/握点转动）。武器网格原点就是握点，挂在 MELEE_HOLD.at。
// 每次挥砍分三段：前摇（windup）→ 判定窗（active，刀刃真正扫过的那一段，阶段 3 在这里结算命中）→ 收招（recover，带惯性回摆）。
// 姿势用 vm 的增量 [px, py, pz, rx, ry, rz]（米 / 弧度），旋转顺序 YXZ：先前倾/后仰（rx）再左右扫（ry），rz 是刃面翻转。
//   +rx：武器顶端倒向镜头（举过肩）；-rx：向前劈下。 +ry：顶端扫向左；-ry：扫向右。 +rz：顶端歪向左。
import * as THREE from 'three'
import type { HandPose } from './retroViewHand'
import type { MeleeType } from './meleeMesh'

export type V6 = [number, number, number, number, number, number]
export interface MeleeHold {
  /** 握点在 vm 坐标下的位置（武器原点放在这里） */
  at: [number, number, number]
  /** 武器自身摆放（欧拉 XYZ，弧度）：让打击端前倾、偏向画面中央 */
  rot: [number, number, number]
  /** 手握半径（米），按握把真实截面 */
  r: number
  /** 待机下沉：越重的武器垂得越低、晃得越慢 */
  droop: number
  /** 待机呼吸幅度 */
  breathe: number
}
export const MELEE_HOLD: Record<MeleeType, MeleeHold> = {
  knife: { at: [0, -.005, -.06], rot: [-.32, .8, .06], r: .0125, droop: 0, breathe: .004 },
  wrench: { at: [0, -.01, -.06], rot: [-.28, .7, .1], r: .0135, droop: .01, breathe: .004 },
  crowbar: { at: [.01, -.02, -.07], rot: [-.22, .5, .16], r: .0135, droop: .02, breathe: .005 },
  timber: { at: [.01, -.03, -.07], rot: [-.2, .5, .22], r: .021, droop: .03, breathe: .006 },
  axe: { at: [.015, -.04, -.08], rot: [-.18, .6, .2], r: .0205, droop: .04, breathe: .006 },
}

/** 武器的握把轴（武器 +Y）在 vm 坐标下的方向——给手部接触求解 */
export function meleeHandPose(type: MeleeType): HandPose {
  const h = MELEE_HOLD[type]
  const v = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(...h.rot))
  const ay: [number, number, number] = [v.x, v.y, v.z]
  return { at: h.at, r: h.r, ay, fdir: [0.28, -0.38, 1] }
}

interface Key { t: number; p: V6; ease?: 'snap' | 'smooth' | 'out' }
export interface MeleeSwing {
  /** 全长（秒）= 物品攻击间隔；重击 ×1.45 */
  dur: number
  /** 前摇结束 / 判定窗结束（占全长的比例） */
  windup: number; active: number
  keys: Key[]
}
const Z: V6 = [0, 0, 0, 0, 0, 0]
/** 刀普攻左右交替：side=1 正手（右→左），side=-1 反手（左→右）——对 px/ry/rz 镜像 */
const mir = (p: V6, s: number): V6 => s > 0 ? p : [-p[0], p[1], p[2], p[3], -p[4], -p[5]]

function swings(type: MeleeType, heavy: boolean, side: number): MeleeSwing {
  // 约束：rx ∈ [-0.5, 1.3]——再往前压，前臂会翻起来糊住画面；劈砍的「下」主要靠手的位移（py/pz）给出。
  // 横扫靠 rz 侧倒武器 + ry 偏航，前臂始终朝后下方。
  switch (type) {
    case 'knife': return heavy
      ? { // 蓄力前刺：刀尖放平、手收到胸前 → 直线扎出 → 拧刀拔回
        dur: .62, windup: .34, active: .52, keys: [
          { t: 0, p: Z }, { t: .34, p: [-.05, .03, .09, -.45, .25, -.1] },
          { t: .52, p: [-.15, .07, -.3, -.5, .3, -.15], ease: 'snap' },
          { t: .7, p: [-.15, .07, -.27, -.48, .3, .55] }, // 拧刀
          { t: 1, p: Z, ease: 'out' }] }
      : { // 快划：小前摇，刀刃横扫过准心，收招时手腕回带
        dur: .42, windup: .26, active: .55, keys: [
          { t: 0, p: Z }, { t: .26, p: mir([.07, .05, .02, -.2, -.3, -.75], side) },
          { t: .55, p: mir([-.2, -.06, -.08, -.35, .3, .85], side), ease: 'snap' },
          { t: .72, p: mir([-.23, -.08, -.07, -.3, .34, .95], side) }, // 惯性多送一点
          { t: 1, p: Z, ease: 'out' }] }
    case 'wrench': return heavy
      ? { // 重击下砸：举过头 → 钳头砸下，砸到底顿一下
        dur: 1.13, windup: .48, active: .62, keys: [
          { t: 0, p: Z }, { t: .48, p: [-.04, .22, .12, .9, .1, -.15] },
          { t: .62, p: [-.13, -.08, -.15, -.45, 0, .05], ease: 'snap' },
          { t: .74, p: [-.13, -.1, -.14, -.48, 0, .05] },
          { t: 1, p: Z, ease: 'out' }] }
      : { // 横扫：向右拉开 → 水平扫过 → 甩出去再拉回
        dur: .78, windup: .38, active: .6, keys: [
          { t: 0, p: Z }, { t: .38, p: [.08, .03, .03, -.1, -.3, -1.0] },
          { t: .6, p: [-.2, -.08, -.06, -.25, .32, .7], ease: 'snap' },
          { t: .76, p: [-.23, -.1, -.04, -.22, .36, .8] },
          { t: 1, p: Z, ease: 'out' }] }
    case 'crowbar': return heavy
      ? { // 重击勾拉：高举 → 羊角劈下 → 回拽（勾住目标往回拉）
        dur: 1.23, windup: .45, active: .6, keys: [
          { t: 0, p: Z }, { t: .45, p: [-.02, .24, .12, 1.0, -.1, -.2] },
          { t: .6, p: [-.13, -.08, -.18, -.5, .1, .2], ease: 'snap' },
          { t: .78, p: [-.1, -.1, .04, -.3, .05, .15] }, // 回拽
          { t: 1, p: Z, ease: 'out' }] }
      : { // 斜劈：右上 → 左下
        dur: .85, windup: .4, active: .6, keys: [
          { t: 0, p: Z }, { t: .4, p: [.06, .18, .08, .6, -.2, -.4] },
          { t: .6, p: [-.2, -.12, -.1, -.45, .26, .62], ease: 'snap' },
          { t: .75, p: [-.22, -.14, -.08, -.45, .3, .68] },
          { t: 1, p: Z, ease: 'out' }] }
    case 'timber': return heavy
      ? { // 重击：抡圆了往下拍
        dur: 1.36, windup: .5, active: .64, keys: [
          { t: 0, p: Z }, { t: .5, p: [.02, .25, .14, 1.15, -.15, -.25] },
          { t: .64, p: [-.13, -.1, -.16, -.5, .1, .1], ease: 'snap' },
          { t: .78, p: [-.13, -.12, -.15, -.5, .1, .1] },
          { t: 1, p: Z, ease: 'out' }] }
      : { // 大范围横扫：拉得最开、扫得最宽、收得最慢
        dur: .94, windup: .42, active: .64, keys: [
          { t: 0, p: Z }, { t: .42, p: [.1, .04, .04, -.1, -.35, -1.1] },
          { t: .64, p: [-.22, -.09, -.04, -.25, .36, .78], ease: 'snap' },
          { t: .8, p: [-.25, -.11, -.02, -.22, .4, .9] },
          { t: 1, p: Z, ease: 'out' }] }
    case 'axe': return heavy
      ? { // 蓄力劈：举得更高更久，劈到底斧头「吃住」一下再拔起
        dur: 1.62, windup: .5, active: .6, keys: [
          { t: 0, p: Z }, { t: .5, p: [-.04, .28, .16, 1.3, .05, -.12] },
          { t: .6, p: [-.14, -.14, -.2, -.5, 0, .05], ease: 'snap' },
          { t: .78, p: [-.14, -.15, -.19, -.5, 0, .05] }, // 吃住
          { t: .86, p: [-.1, -.06, -.12, -.2, 0, .05] },  // 拔起
          { t: 1, p: Z, ease: 'out' }] }
      : { // 竖劈：前摇最长（斧头举过肩），劈下极快
        dur: 1.12, windup: .45, active: .58, keys: [
          { t: 0, p: Z }, { t: .45, p: [-.02, .22, .14, 1.0, .05, -.15] },
          { t: .58, p: [-.12, -.12, -.16, -.5, 0, .05], ease: 'snap' },
          { t: .72, p: [-.12, -.13, -.15, -.5, 0, .05] },
          { t: 1, p: Z, ease: 'out' }] }
  }
}
/** 挥砍时间表（阶段 3 的判定窗、卡帧、体力消耗都按这张表） */
export function meleeSwing(type: MeleeType, heavy = false, side = 1): MeleeSwing { return swings(type, heavy, side) }

const smooth = (k: number) => k * k * (3 - 2 * k)
const snap = (k: number) => 1 - Math.pow(1 - k, 3) * (1 - k * .4) // 起手就快、末端急停：劈砍的「甩」劲
const out = (k: number) => { const a = 1 - k; return 1 - a * a * a + Math.sin(k * Math.PI) * .06 } // 回正略过冲 = 收招惯性
function interp(keys: Key[], pr: number): V6 {
  let i = 0
  while (i < keys.length - 2 && pr > keys[i + 1].t) i++
  const a = keys[i], b = keys[i + 1]
  const k0 = Math.max(0, Math.min(1, (pr - a.t) / Math.max(1e-4, b.t - a.t)))
  const k = b.ease === 'snap' ? snap(k0) : b.ease === 'out' ? out(k0) : smooth(k0)
  return a.p.map((v, j) => v + (b.p[j] - v) * k) as V6
}

export interface MeleePoseInput {
  type: MeleeType
  /** 挥砍进度 0..1（无挥砍时 <0） */
  pr: number
  heavy?: boolean
  /** 刀普攻交替方向：1 正手 / -1 反手 */
  side?: number
  /** 蓄力 0..1（按住重击键时），>0 时 pr 无效 */
  charge?: number
  /** 弹刀 0..1（打墙后的回震衰减，1 = 刚撞上） */
  bounce?: number
  time: number
  /** 走路幅度 0..1 */
  moving?: number
}
/** 挥砍转轴：手腕（vm 坐标，握点后下方约 0.1m 沿前臂）。前臂跟着手腕小幅转，配合 rx 上限不会把袖管翻进画面中央 */
export const MELEE_PIVOT = new THREE.Vector3(.03, -.05, .08)
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _v = new THREE.Vector3()
/** 把「绕肘」转换成 vm 原点的位移补偿：Δp = P − R·P */
export function pivotOffset(rx: number, ry: number, rz: number): [number, number, number] {
  _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'))
  _v.copy(MELEE_PIVOT).applyQuaternion(_q)
  return [MELEE_PIVOT.x - _v.x, MELEE_PIVOT.y - _v.y, MELEE_PIVOT.z - _v.z]
}

/** 返回 vm 增量（位移已含绕肘补偿）；renderer 加到基础位姿（0.27, -0.3, -0.55）上 */
export function meleePose(st: MeleePoseInput): V6 {
  const h = MELEE_HOLD[st.type]
  const breath = Math.sin(st.time * (1.9 - h.droop * 12)) * h.breathe
  let p: V6 = [0, -h.droop + breath, 0, breath * 1.5, 0, 0]
  if ((st.charge ?? 0) > 0) {
    // 蓄力：慢慢拉到重击前摇姿势，满蓄后发抖（提示可以放手）
    const sw = swings(st.type, true, 1), c = Math.min(1, st.charge!)
    const wind = interp(sw.keys, sw.windup * smooth(c))
    const shake = c >= 1 ? Math.sin(st.time * 47) * .006 : Math.sin(st.time * 23) * .002 * c
    p = p.map((v, j) => v + wind[j]) as V6
    p[0] += shake; p[1] += shake * .7; p[3] += shake * 2
  } else if (st.pr >= 0 && st.pr <= 1) {
    const sw = swings(st.type, !!st.heavy, st.side ?? 1)
    const d = interp(sw.keys, st.pr)
    p = p.map((v, j) => v + d[j]) as V6
  }
  if ((st.bounce ?? 0) > 0) {
    // 弹刀：沿来路往回震，衰减振荡
    const b = st.bounce!, ph = (1 - b) * 26
    const amp = b * b
    p[3] += Math.cos(ph) * .32 * amp; p[4] -= Math.cos(ph) * .22 * amp
    p[0] += Math.sin(ph * 1.3) * .02 * amp; p[2] += .05 * amp
  }
  const o = pivotOffset(p[3], p[4], p[5])
  p[0] += o[0]; p[1] += o[1]; p[2] += o[2]
  return p
}
