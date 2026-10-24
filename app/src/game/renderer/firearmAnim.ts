// 枪械第一人称动画编排（鎏金兵械库）：每把枪的握法、站姿、各动作的关键帧。
//
// 一个动作（engine/firearms.ts 的 GunRun.act，含 fire / cycle / open / extract / insert / stage / close）
// 在归一化时间 u ∈ [0,1] 上由几条轨道描述：
//   vm  —— 整枪站姿（腰射 / 装填姿势 / 立枪捅膛……），关键帧之间平滑插值
//   ch  —— 枪内部件通道（枪管下折、杠杆、击锤、转轮角、通条位置……），rig.apply() 写入节点
//   L/R —— 左 / 右手：每个关键帧 = 挂点（att）+ 握法（pose）。挂点是
//          '@'           跟随握法所属部件（枪坐标系握法，在部件静止位求解手指接触，之后随部件运动）
//          'belt' 'face' 镜头坐标系里的固定点（腰间弹药袋 / 嘴边），与枪怎么摆无关
//          'mouth' 'seat' 当前步骤那一格弹位的入口 / 到位（沿弹位轴后退一段 = 入口）
//          'gateIn' 'gateSeat' 'nipIn' 'nipSeat' 'muzIn' 'muzSeat' 等锚点
//          'prev'        上一动作结束时手所在的位置（保证动作之间无缝衔接）
//   heldL/heldR —— 手里捏着的东西（弹 / 火帽）
//   seat —— 画面上弹位提前变化的时刻（塞到位 / 拔出来那一下）
// 关键帧之间：手的世界变换位置线性 + 朝向球面插值、smoothstep 缓动；握法（手指形状）在两帧中点切换，
// 并且所有切换都安排在手快速移动或离开画面的时候。
import * as THREE from 'three'
import type { HandPose } from './retroViewHand'
import { DB } from './firearmMesh'
import { LR, RV, MK, TD, CART, rvChamberAngle } from './firearmGuns'
import { GUNS, MUZZLE_STAGES, type AmmoType, type GunType, type MuzzleStage } from '../content/firearms'
import type { GunAct } from '../engine/firearms'

type V3 = [number, number, number]
/** 前臂方向：给出「手腕 → 手肘」的方向 d（握法所在坐标系），换算成握持坐标系 H（左手几何沿 X 镜像） */
export function fdirFor(ax: V3, ay: V3, d: V3, left = false): V3 {
  const X = new THREE.Vector3(...ax).normalize(), Y = new THREE.Vector3(...ay)
  Y.addScaledVector(X, -Y.dot(X)).normalize()
  const Z = new THREE.Vector3().crossVectors(X, Y), D = new THREE.Vector3(...d).normalize()
  return [D.dot(X) * (left ? -1 : 1), D.dot(Y), D.dot(Z)]
}
const P = (at: V3, r: number, ax: V3, ay: V3, d: V3, left = false, extra: Partial<HandPose> = {}): HandPose => ({ at, r, ax, ay, fdir: fdirFor(ax, ay, d, left), ...extra })

export interface PoseDef {
  hand: 'L' | 'R'
  pose: HandPose
  /** gun = 枪坐标系（随 node 部件运动；node 缺省 = 枪根）；local = 以捏着的物体为原点 */
  frame: 'gun' | 'local'
  node?: string
  /** local 握法求解时捏着的物体（也是手里显示的东西） */
  item?: AmmoType | 'cap'
  /** 前臂方向按「这个握法最主要出现的时刻」重新求：在 stance 站姿下（local 握法还要放在 att 挂点上），
   *  让前臂在镜头坐标系里朝向身体（右手往右后下、左手往左后下），而不是跟着枪身一起滚 */
  use?: { stance: string; att?: string; arm?: V3 }
  /** 握法求解时把另一只手（它的这个握法）也当成实体：转轮双手握，左手包在右手四指外面 */
  around?: string
  /** 跟随部件时手的朝向跟多少（0 = 只跟位置、手不跟着转；1 = 完全跟着转）。缺省 1 */
  follow?: number
}
export interface Stance { px: number; py: number; pz: number; rx: number; ry: number; rz: number }
export interface HandKey { t: number; att: string; pose: string; off?: V3 }
export type Track = [number, number][]
export interface ActAnim {
  vm: [number, string][]
  ch?: Record<string, Track | undefined>
  L: HandKey[]
  R: HandKey[]
  heldL?: [number, string][]
  heldR?: [number, string][]
  seat?: number
}
export interface AnimCtx {
  barrel: number // 当前步骤的格（转轮膛号 / 双管管号 / 管式弹仓位）
  stage?: MuzzleStage
  cyl: number // 转轮：当前正对枪管的膛
  /** 下一发要打的膛（转轮静止 / 击发后应转到的位置） */
  nextCyl: number
  lastBarrel: number
  loaded: boolean // 前装：已装好；活门 / 杠杆：膛里有弹
  stepNo: number
  /** 后面还有装 / 拔弹的步骤（最后一发装完手不必再回腰间） */
  more?: boolean
}
export interface GunChoreo {
  poses: Record<string, PoseDef>
  stances: Record<string, Stance>
  /** 待机时的部件通道 */
  idle(ctx: AnimCtx): Record<string, number>
  /** 待机时两只手 */
  idleHands: { L: string; R: string }
  act(act: GunAct, ctx: AnimCtx): ActAnim | null
  /** 镜头坐标系挂点（腰间 / 嘴边）：位置 + 欧拉角 */
  cam: Record<string, { p: V3; r: V3 }>
}

// ---------------------------------------------------------------- 共用握法
const ITEM_AXIS: V3 = [0, 0, -1]
/** 左 / 右手捏弹：手在弹的后方，前臂往后下方 */
const pinchL = (item: AmmoType | 'cap', r: number, at: V3): PoseDef => ({ hand: 'L', frame: 'local', item, pose: P(at, r, [-0.55, 0.83, 0], ITEM_AXIS, [-0.35, -0.82, 0.45], true) })
const pinchR = (item: AmmoType | 'cap', r: number, at: V3): PoseDef => ({ hand: 'R', frame: 'local', item, pose: P(at, r, [0.55, 0.83, 0], ITEM_AXIS, [0.35, -0.82, 0.45]) })
/** 右手握直颈（双管 / 前装 / 活门共用的写法，按各枪枪颈位置给 at） */
/** 右手握把时前臂的方向（镜头坐标，手腕 → 手肘）：往右下、略往后——手肘外展在肩膀前下方。
 *  原来的 ARM_R 往后得多，贴腮时前臂几乎直冲镜头、占掉右边三分之一的画面 */
export const ARM_GRIP_R: V3 = [0.4, -0.82, 0.4]
const wristR = (at: V3, r = 0.0165, node?: string): PoseDef => ({ hand: 'R', frame: 'gun', node, use: { stance: 'hip', arm: ARM_GRIP_R }, pose: P(at, r, [1, -0.05, 0], [0, 0.22, -1], [0.3, -0.8, 0.5], false, { trigger: true, thumbDy: -0.012 }) })
/** 左手托护木（掌心朝上） */
/** 左手托护木（掌心朝上，四指沿右侧、拇指沿左侧；thumbPhi 让拇指根低一点，拇指贴着左侧而不是竖到枪管顶上） */
const forendL = (at: V3, r: number, node?: string): PoseDef => ({ hand: 'L', frame: 'gun', node, pose: P(at, r, [0.45, 0.89, 0], [0, 0, -1], [-0.3, -0.88, 0.38], true, { thumbPhi: -0.1 }) })
const CAM_POINTS = {
  beltL: { p: [-0.13, -0.33, -0.24] as V3, r: [0.5, 0.3, 0.4] as V3 }, // 左腰弹药袋（画面外左下）
  beltR: { p: [0.17, -0.33, -0.22] as V3, r: [0.5, -0.3, -0.4] as V3 }, // 右腰弹药袋（画面外右下）
  face: { p: [0.03, -0.095, -0.22] as V3, r: [0.25, 0.9, 0.2] as V3 }, // 嘴边（咬纸包）
}
const ease = (k: number) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k) }

/** 关键帧插值（smoothstep） */
export function track(t: Track | undefined, u: number, dflt: number): number {
  if (!t || !t.length) return dflt
  if (u <= t[0][0]) return t[0][1]
  for (let i = 1; i < t.length; i++) if (u <= t[i][0]) { const [t0, v0] = t[i - 1], [t1, v1] = t[i]; return v0 + (v1 - v0) * ease((u - t0) / Math.max(1e-6, t1 - t0)) }
  return t[t.length - 1][1]
}
export function stepTrack<T>(t: [number, T][] | undefined, u: number, dflt: T): T {
  if (!t || !t.length) return dflt
  let v = dflt
  for (const [k, x] of t) if (u >= k) v = x
  return v
}

// ================================================================ 双管猎枪
const DB_SEAT = 0.74
const DB_CHOREO: GunChoreo = {
  cam: CAM_POINTS,
  poses: {
    grip: wristR([0, -0.024, 0.07]),
    forend: forendL([0, -0.033, -0.31], 0.022, 'barrels'),
    pinch: { ...pinchL('shell_buck', 0.0108, [0, 0, -0.007]), use: { stance: 'open', att: 'mouth' } },
  },
  stances: {
    hip: { px: 0.135, py: -0.15, pz: -0.18, rx: 0.03, ry: 0.05, rz: 0.07 }, // 腰射：枪托夹在右肋、枪口指向准心右下，略向左滚露出机匣右侧；手离准心 ≥ 13% 屏高
    open: { px: 0.06, py: -0.1, pz: -0.3, rx: 0.08, ry: 0.08, rz: 0.3 },
  },
  idleHands: { L: 'forend', R: 'grip' },
  idle: () => ({ open: 0, lever: 0 }),
  act(act, c) {
    const hold = { L: [{ t: 0, att: '@', pose: 'forend' }], R: [{ t: 0, att: '@', pose: 'grip' }] }
    switch (act) {
      case 'fire': case 'dry': return { vm: [[0, 'hip']], ch: { trig: [[0, 1], [0.6, 0]] }, ...hold }
      case 'open': return { vm: [[0, 'hip'], [0.85, 'open']], ch: { lever: [[0, 0], [0.35, 1]], open: [[0.2, 0], [1, 1]] }, ...hold }
      case 'insert': return {
        // 左手离开护木去腰间取弹 → 抬到膛口 → 顺着膛推到底 → 回腰间
        vm: [[0, 'open']], ch: { open: [[0, 1]], lever: [[0, 1]] },
        L: [{ t: 0, att: 'prev', pose: 'forend' }, { t: 0.36, att: 'belt', pose: 'pinch' }, { t: 0.58, att: 'mouth', pose: 'pinch' }, { t: DB_SEAT, att: 'seat', pose: 'pinch' }, c.more ? { t: 1, att: 'belt', pose: 'pinch' } : { t: 1, att: 'mouth', pose: 'pinch', off: [-0.02, -0.035, 0.05] }],
        R: [{ t: 0, att: '@', pose: 'grip' }],
        heldL: [[0, ''], [0.34, 'ammo'], [DB_SEAT, '']], seat: DB_SEAT,
      }
      case 'extract': return {
        vm: [[0, 'open']], ch: { open: [[0, 1]], lever: [[0, 1]] },
        L: [{ t: 0, att: 'prev', pose: 'forend' }, { t: 0.3, att: 'seat', pose: 'pinch' }, { t: 0.42, att: 'seat', pose: 'pinch' }, { t: 0.64, att: 'mouth', pose: 'pinch' }, { t: 1, att: 'belt', pose: 'pinch' }],
        R: [{ t: 0, att: '@', pose: 'grip' }],
        heldL: [[0, ''], [0.42, 'chamber'], [0.95, '']], seat: 0.42,
      }
      case 'close': return {
        // 左手回到护木 → 托起枪管「咔」合上 → 回到持枪
        vm: [[0, 'open'], [0.5, 'open'], [1, 'hip']], ch: { open: [[0.45, 1], [0.8, 0]], lever: [[0, 1], [0.72, 1], [0.85, 0]] },
        L: [{ t: 0, att: 'prev', pose: 'pinch' }, { t: 0.45, att: '@', pose: 'forend' }, { t: 1, att: '@', pose: 'forend' }],
        R: [{ t: 0, att: '@', pose: 'grip' }],
      }
      default: return null
    }
  },
}

// ================================================================ 杠杆步枪
const LR_CHOREO: GunChoreo = {
  cam: CAM_POINTS,
  poses: {
    // 右手握颈、四指穿过杠杆指环：握法跟着杠杆一起转（拉杆时整只手随指环下压再推回）
    lever: { hand: 'R', frame: 'gun', node: 'lever', follow: 0.55, use: { stance: 'hip', arm: ARM_GRIP_R }, pose: P([0, -0.026, 0.06], 0.016, [1, -0.05, 0], [0, 0.25, -1], [0.3, -0.8, 0.5], false, { trigger: true, thumbDy: -0.022 }) },
    pinch: { ...pinchR('cart_4440', 0.0064, [0, 0, -0.004]), use: { stance: 'gate', att: 'gateSeat' } },
    forend: forendL([0, -0.025, -0.3], 0.017),
  },
  stances: {
    hip: { px: 0.135, py: -0.15, pz: -0.18, rx: 0.03, ry: 0.05, rz: 0.07 }, // 腰射：枪托夹在右肋、枪口指向准心右下，略向左滚露出机匣右侧；手离准心 ≥ 13% 屏高
    gate: { px: 0.04, py: -0.1, pz: -0.3, rx: 0.1, ry: 0.62, rz: 0.22 }, // 枪身左滚、右侧装弹口朝上对着镜头
  },
  idleHands: { L: 'forend', R: 'lever' },
  idle: (c) => ({ lever: 0, hammer: c.loaded ? 1 : 0, gate: 0 }),
  act(act, c) {
    const hold = { L: [{ t: 0, att: '@', pose: 'forend' }], R: [{ t: 0, att: '@', pose: 'lever' }] }
    switch (act) {
      case 'fire': return { vm: [[0, 'hip']], ch: { hammer: [[0, 0]], lever: [[0, 0]] }, ...hold }
      case 'dry': return { vm: [[0, 'hip']], ch: { hammer: [[0, 1], [0.05, 0]] }, ...hold }
      case 'cycle': return {
        // 杠杆下压到底（枪机后退、击锤被顶到待击、空壳从顶部抛出）→ 推回闭锁
        vm: [[0, 'hip']], ch: { lever: [[0, 0], [0.42, 1], [0.52, 1], [0.9, 0]], hammer: [[0.08, 0], [0.4, 1]], showChamber: [[0, 1]] }, ...hold,
      }
      case 'open': return { vm: [[0, 'hip'], [1, 'gate']], ch: { lever: [[0, 0]], hammer: [[0, c.loaded ? 1 : 0]] }, ...hold }
      case 'insert': case 'extract': {
        const ins = act === 'insert'
        return {
          // 右手离开握颈去右腰取弹 → 弹头朝前对准装弹口 → 拇指把它压进去（弹簧片被顶开）→ 回腰间
          vm: [[0, 'gate']], ch: { gate: ins ? [[0.56, 0], [0.72, 1], [0.82, 0]] : [[0.25, 0], [0.4, 1], [0.6, 0]], hammer: [[0, c.loaded ? 1 : 0]] },
          L: [{ t: 0, att: '@', pose: 'forend' }],
          R: ins
            ? [{ t: 0, att: 'prev', pose: 'lever' }, { t: 0.3, att: 'belt', pose: 'pinch' }, { t: 0.56, att: 'gateIn', pose: 'pinch' }, { t: 0.74, att: 'gateSeat', pose: 'pinch' }, { t: 1, att: 'belt', pose: 'pinch' }]
            : [{ t: 0, att: 'prev', pose: 'lever' }, { t: 0.3, att: 'gateSeat', pose: 'pinch' }, { t: 0.42, att: 'gateSeat', pose: 'pinch' }, { t: 0.62, att: 'gateIn', pose: 'pinch' }, { t: 1, att: 'belt', pose: 'pinch' }],
          heldR: ins ? [[0, ''], [0.28, 'ammo'], [0.74, '']] : [[0, ''], [0.42, 'ammo'], [0.95, '']],
        }
      }
      case 'close': return {
        vm: [[0, 'gate'], [1, 'hip']], ch: { hammer: [[0, c.loaded ? 1 : 0]] },
        L: [{ t: 0, att: '@', pose: 'forend' }],
        R: [{ t: 0, att: 'prev', pose: 'pinch' }, { t: 0.85, att: '@', pose: 'lever' }],
      }
      default: return null
    }
  },
}

// ================================================================ 单动转轮
const rvAt = (k: number) => -(k % 6) * Math.PI / 3 // 第 k 膛转到正上方（对准枪管）的转轮角
const rvGate = (k: number) => RV.gateAngle - rvChamberAngle(k) // 第 k 膛转到装弹门的转轮角
const RV_CHOREO: GunChoreo = {
  cam: CAM_POINTS,
  poses: {
    grip: { hand: 'R', frame: 'gun', use: { stance: 'hip', arm: [0.45, -0.55, 0.7] }, pose: P([0.004, -0.032, 0.012], 0.0165, [1, -0.05, 0], [0, 0.94, -0.34], [0.25, -0.55, 0.8], false, { trigger: true }) },
    // 左手包住右手（单动转轮的传统双手握法）：掌根贴左侧握把，四指从前面绕过去压在右手四指外面，拇指在击锤下方
    support: { hand: 'L', frame: 'gun', around: 'grip', pose: P([0.002, -0.046, 0.017], 0.025, [0.95, 0.1, 0.3], [0, 0.94, -0.34], [-0.25, -0.6, 0.75], true) },
    rod: { hand: 'L', frame: 'gun', node: 'rod', pose: P([0.0135, 0.044, -0.207], 0.0052, [-0.55, 0.83, 0], [0, 0, 1], [-0.4, -0.8, 0.45], true), use: { stance: 'load' } },
    pinch: { ...pinchL('cart_4440', 0.0064, [0, 0, -0.004]), use: { stance: 'load', att: 'gateSeat' } },
  },
  stances: {
    hip: { px: 0.13, py: -0.135, pz: -0.32, rx: 0.04, ry: 0.16, rz: 0.08 }, // 腰射：双手握在胸前偏右，枪口略内收、露出转轮右侧（装弹门那一侧）
    load: { px: 0.05, py: -0.11, pz: -0.3, rx: 0.45, ry: 0.95, rz: 0.2 }, // 枪口上扬、枪身左滚：装弹门朝上对着镜头
  },
  idleHands: { L: 'support', R: 'grip' },
  idle: (c) => ({ hammer: 1, cyl: rvAt(c.nextCyl), gate: 0, rod: 0 }),
  act(act, c) {
    const hold = { L: [{ t: 0, att: '@', pose: 'support' }], R: [{ t: 0, att: '@', pose: 'grip' }] }
    switch (act) {
      case 'fire': return {
        // 击锤落下 → 拇指把击锤扳回待击，转轮随之转到下一膛
        vm: [[0, 'hip']], ch: { hammer: [[0, 0], [0.28, 0], [0.62, 1]], cyl: [[0.28, rvAt(c.lastBarrel)], [0.62, rvAt(c.lastBarrel + 1)]], trig: [[0, 1], [0.3, 0]] }, ...hold,
      }
      case 'dry': return { vm: [[0, 'hip']], ch: { hammer: [[0, 0], [0.3, 0], [0.9, 1]], cyl: [[0.3, rvAt(c.cyl)], [0.9, rvAt(c.cyl + 1)]], trig: [[0, 1], [0.3, 0]] }, ...hold }
      case 'open': return {
        // 半击发（转轮松开）→ 拇指拨开装弹门，枪立起来左滚
        vm: [[0, 'hip'], [0.9, 'load']], ch: { hammer: [[0, 1], [0.25, 0.45]], gate: [[0.5, 0], [0.85, 1]], cyl: [[0, rvAt(c.nextCyl)]] },
        L: [{ t: 0, att: '@', pose: 'support' }, { t: 1, att: '@', pose: 'support' }], R: [{ t: 0, att: '@', pose: 'grip' }],
      }
      case 'extract': return {
        // 转到这一膛 → 左手拇指按住退壳杆往后推，把空壳捅出装弹门
        vm: [[0, 'load']], ch: { hammer: [[0, 0.45]], gate: [[0, 1]], cyl: [[0, rvGate(c.barrel) + Math.PI / 3], [0.22, rvGate(c.barrel)]], rod: [[0.4, 0], [0.62, 1], [0.86, 0]] },
        L: [{ t: 0, att: 'prev', pose: 'support' }, { t: 0.34, att: '@', pose: 'rod' }, { t: 0.88, att: '@', pose: 'rod' }, { t: 1, att: '@', pose: 'rod', off: [0.02, -0.01, 0.03] }],
        R: [{ t: 0, att: '@', pose: 'grip' }], seat: 0.6,
      }
      case 'insert': return {
        vm: [[0, 'load']], ch: { hammer: [[0, 0.45]], gate: [[0, 1]], cyl: [[0, rvGate(c.barrel) + Math.PI / 3], [0.18, rvGate(c.barrel)]] },
        L: [{ t: 0, att: 'prev', pose: 'support' }, { t: 0.37, att: 'belt', pose: 'pinch' }, { t: 0.64, att: 'gateIn', pose: 'pinch' }, { t: 0.8, att: 'gateSeat', pose: 'pinch' }, { t: 1, att: 'gateIn', pose: 'pinch', off: [0.03, -0.02, 0.05] }],
        R: [{ t: 0, att: '@', pose: 'grip' }], heldL: [[0, ''], [0.35, 'ammo'], [0.8, '']], seat: 0.8,
      }
      case 'close': return {
        vm: [[0, 'load'], [0.35, 'load'], [1, 'hip']], ch: { gate: [[0, 1], [0.3, 0]], hammer: [[0.45, 0.45], [0.85, 1]], cyl: [[0.35, rvAt(c.nextCyl) + 0.25], [0.85, rvAt(c.nextCyl)]] },
        L: [{ t: 0, att: 'prev', pose: 'pinch' }, { t: 0.7, att: '@', pose: 'support' }], R: [{ t: 0, att: '@', pose: 'grip' }],
      }
      default: return null
    }
  },
}

// ================================================================ 前装滑膛枪
const MK_ROD_IN = MK.rodLen - 0.04 // 捅到底时通条头离枪口的深度
const MK_CHOREO: GunChoreo = {
  cam: CAM_POINTS,
  poses: {
    grip: wristR([0, -0.026, 0.07]),
    forend: forendL([0, -0.03, -0.36], 0.019),
    // 立枪装填：左手在上箍附近握住枪管和前托
    barrel: { hand: 'L', frame: 'gun', pose: P([0.004, -0.012, -0.8], 0.019, [-0.95, 0.3, 0], [0, 0, -1], [-0.6, -0.75, 0.25], true), use: { stance: 'ram' } },
    paper: { ...pinchR('cart_paper', 0.0068, [0, 0, -0.014]), use: { stance: 'ram', att: 'muzIn' } },
    cap: { ...pinchR('cap', 0.0034, [0, 0.003, 0.002]), use: { stance: 'capS', att: 'nipSeat' } },
    // 通条：拔 / 收时捏在通条头附近，捅膛时握在通条尾端
    rodHead: { hand: 'R', frame: 'gun', node: 'rod', follow: 0, pose: P([0, MK.rodY, MK.muzzleZ + 0.08], 0.0062, [0.6, 0.8, 0], [0, 0, -1], [0.35, -0.85, 0.4]), use: { stance: 'ram' } },
    rodTail: { hand: 'R', frame: 'gun', node: 'rod', follow: 0, pose: P([0, MK.rodY, MK.muzzleZ + 0.006 + MK.rodLen - 0.03], 0.0062, [0.6, 0, 0.8], [0, 0, -1], [0.4, -0.85, 0.3]), use: { stance: 'ram' } },
  },
  stances: {
    hip: { px: 0.135, py: -0.15, pz: -0.18, rx: 0.03, ry: 0.05, rz: 0.07 }, // 腰射：枪托夹在右肋、枪口指向准心右下，略向左滚露出机匣右侧；手离准心 ≥ 13% 屏高
    // 立枪：枪托落地（画面外），枪口抬到眼前偏左下，方便往里倒药捅弹
    ram: { px: 0.0, py: -1.0, pz: -0.3, rx: 1.3, ry: -0.12, rz: 0.08 },
    capS: { px: 0.04, py: -0.12, pz: -0.25, rx: 0.1, ry: -0.25, rz: -0.35 }, // 枪平端胸前、枪机朝向镜头
  },
  idleHands: { L: 'forend', R: 'grip' },
  idle: (c) => ({ hammer: c.loaded ? 1 : 0, cap: c.loaded ? 1 : 0, rodX: 0, rodY: 0, rodZ: 0, rodRx: 0 }),
  act(act, c) {
    const S = c.stage
    if (act === 'fire') return { vm: [[0, 'hip']], ch: { hammer: [[0, 0]], cap: [[0, 0]] }, L: [{ t: 0, att: '@', pose: 'forend' }], R: [{ t: 0, att: '@', pose: 'grip' }] }
    if (act === 'dry') return { vm: [[0, 'hip']], ch: { hammer: [[0, 1], [0.05, 0]] }, L: [{ t: 0, att: '@', pose: 'forend' }], R: [{ t: 0, att: '@', pose: 'grip' }] }
    if (act === 'close') return { vm: [[0, 'ram'], [1, 'hip']], L: [{ t: 0, att: 'prev', pose: 'barrel' }, { t: 0.8, att: '@', pose: 'forend' }], R: [{ t: 0, att: 'prev', pose: 'paper' }, { t: 0.85, att: '@', pose: 'grip' }] }
    if (act !== 'stage' || !S) return null
    const Lram = [{ t: 0, att: '@', pose: 'barrel' }]
    switch (S) {
      case 'bite': return {
        // 把枪立起来（左手换到上箍）→ 右手从腰间取一个纸包 → 送到嘴边咬开
        vm: [[0, 'hip'], [0.5, 'ram']], ch: { hammer: [[0, 0]] },
        L: [{ t: 0, att: '@', pose: 'forend' }, { t: 0.45, att: '@', pose: 'barrel' }],
        R: [{ t: 0, att: '@', pose: 'grip' }, { t: 0.28, att: 'belt', pose: 'paper' }, { t: 0.62, att: 'face', pose: 'paper' }, { t: 0.82, att: 'face', pose: 'paper', off: [0, -0.008, 0.01] }, { t: 1, att: 'face', pose: 'paper', off: [0.01, -0.02, -0.02] }],
        heldR: [[0, ''], [0.27, 'ammo']],
      }
      case 'pour': return {
        // 咬开的纸包口朝下，把火药倒进枪口
        vm: [[0, 'ram']], L: Lram,
        R: [{ t: 0, att: 'prev', pose: 'paper' }, { t: 0.32, att: 'muzIn', pose: 'paper', off: [0, 0, 0.07] }, { t: 0.85, att: 'muzIn', pose: 'paper', off: [0, 0, 0.055] }, { t: 1, att: 'muzIn', pose: 'paper', off: [0, 0, 0.06] }],
        heldR: [[0, 'ammo']],
      }
      case 'ball': return {
        // 弹丸连同纸包塞进枪口，手指往下按
        vm: [[0, 'ram']], L: Lram,
        R: [{ t: 0, att: 'prev', pose: 'paper' }, { t: 0.35, att: 'muzIn', pose: 'paper' }, { t: 0.62, att: 'muzSeat', pose: 'paper' }, { t: 1, att: 'muzIn', pose: 'paper', off: [0.02, 0.0, 0.04] }],
        heldR: [[0, 'ammo'], [0.62, '']],
      }
      case 'ram': return {
        // 捏住通条头往外抽（整根抽出，手出画面）→ 绕通条头翻过来 → 手滑到通条尾 → 通条头对准枪口往下捅 → 压实两下
        vm: [[0, 'ram']], L: Lram,
        ch: {
          rodZ: [[0.06, 0], [0.3, -(MK.rodLen + 0.03)], [0.52, -(MK.rodLen + 0.03)], [0.62, 0.004], [0.8, MK_ROD_IN], [0.86, MK_ROD_IN - 0.07], [0.92, MK_ROD_IN], [0.97, MK_ROD_IN - 0.06], [1, MK_ROD_IN - 0.05]],
          rodRx: [[0.3, 0], [0.42, Math.PI]],
          rodY: [[0.28, 0], [0.34, 0.08], [0.56, -MK.rodY]],
        },
        R: [{ t: 0, att: 'prev', pose: 'paper' }, { t: 0.06, att: '@', pose: 'rodHead' }, { t: 0.42, att: '@', pose: 'rodHead' }, { t: 0.52, att: '@', pose: 'rodTail' }, { t: 1, att: '@', pose: 'rodTail' }],
      }
      case 'rod': return {
        // 抽到通条头刚出枪口 → 手顺着通条滑回通条头 → 绕通条头一甩翻回来 → 插回前托下的通条管
        vm: [[0, 'ram']], L: Lram,
        ch: {
          rodZ: [[0, MK_ROD_IN - 0.05], [0.22, 0.004], [0.5, 0.004], [0.62, -0.1], [0.9, 0]],
          rodRx: [[0, Math.PI], [0.5, Math.PI], [0.62, 0]],
          rodY: [[0, -MK.rodY], [0.5, -MK.rodY], [0.56, 0.08], [0.7, 0.08], [0.9, 0]],
        },
        R: [{ t: 0, att: '@', pose: 'rodTail' }, { t: 0.26, att: '@', pose: 'rodTail' }, { t: 0.5, att: '@', pose: 'rodHead' }, { t: 0.9, att: '@', pose: 'rodHead' }, { t: 1, att: 'belt', pose: 'cap' }],
      }
      case 'cap': return {
        // 端平枪 → 拇指把击锤扳到半击发 → 取一枚火帽按在火门锥上 → 扳到全击发 → 握回枪颈
        vm: [[0, 'ram'], [0.35, 'capS'], [0.82, 'capS'], [1, 'hip']],
        ch: { hammer: [[0.22, 0], [0.32, 0.5], [0.86, 0.5], [0.95, 1]], cap: [[0, 0], [0.74, 1]] },
        L: [{ t: 0, att: '@', pose: 'barrel' }, { t: 0.35, att: '@', pose: 'forend' }],
        R: [{ t: 0, att: 'prev', pose: 'cap' }, { t: 0.2, att: '@', pose: 'grip' }, { t: 0.34, att: '@', pose: 'grip' }, { t: 0.5, att: 'belt', pose: 'cap' }, { t: 0.66, att: 'nipIn', pose: 'cap' }, { t: 0.76, att: 'nipSeat', pose: 'cap' }, { t: 0.86, att: '@', pose: 'grip' }, { t: 1, att: '@', pose: 'grip' }],
        heldR: [[0, ''], [0.49, 'cap'], [0.74, '']],
      }
    }
    return null
  },
}

// ================================================================ 活门后膛步枪
const TD_CHOREO: GunChoreo = {
  cam: CAM_POINTS,
  poses: {
    grip: wristR([0, -0.025, 0.07]),
    forend: forendL([0, -0.03, -0.36], 0.018),
    // 右手拇指：扳击锤 / 掀活门（握法跟着活门转）
    hammer: { hand: 'R', frame: 'gun', pose: P([0.024, 0.008, 0.008], 0.008, [0.3, 0.95, 0], [0, 0.2, -1], [0.45, -0.75, 0.5]), use: { stance: 'open', arm: [0.72, -0.6, 0.35] } },
    block: { hand: 'R', frame: 'gun', node: 'block', follow: 0.2, pose: P([0.0135, 0.0215, -0.04], 0.006, [0.4, 0.9, 0], [0, 0, -1], [0.45, -0.75, 0.5]), use: { stance: 'open', arm: [0.72, -0.6, 0.35] } },
    pinch: { ...pinchR('cart_4570', 0.0068, [0, 0, -0.004]), use: { stance: 'open', att: 'seat', arm: [0.75, -0.55, 0.36] } },
  },
  stances: {
    hip: { px: 0.135, py: -0.15, pz: -0.18, rx: 0.03, ry: 0.05, rz: 0.07 }, // 腰射：枪托夹在右肋、枪口指向准心右下，略向左滚露出机匣右侧；手离准心 ≥ 13% 屏高
    open: { px: 0.02, py: -0.1, pz: -0.29, rx: 0.12, ry: 0.32, rz: 0.3 },
  },
  idleHands: { L: 'forend', R: 'grip' },
  idle: (c) => ({ block: 0, hammer: c.loaded ? 1 : 0, ext: 0 }),
  act(act, c) {
    const L = [{ t: 0, att: '@', pose: 'forend' }]
    switch (act) {
      case 'fire': return { vm: [[0, 'hip']], ch: { hammer: [[0, 0]] }, L, R: [{ t: 0, att: '@', pose: 'grip' }] }
      case 'dry': return { vm: [[0, 'hip']], ch: { hammer: [[0, 1], [0.05, 0]] }, L, R: [{ t: 0, att: '@', pose: 'grip' }] }
      case 'open': return {
        // 拇指扳击锤到半击发 → 挪到活门右后的拇指扳上 → 掀开活门（抽壳器把空壳甩出来）
        vm: [[0, 'hip'], [0.8, 'open']], ch: { hammer: [[0.16, c.loaded ? 1 : 0], [0.3, 0.45]], block: [[0.4, 0], [0.86, 1]], ext: [[0.68, 0], [0.74, 1], [0.86, 0]] },
        L, R: [{ t: 0, att: '@', pose: 'grip' }, { t: 0.16, att: '@', pose: 'hammer' }, { t: 0.3, att: '@', pose: 'hammer' }, { t: 0.4, att: '@', pose: 'block' }, { t: 1, att: '@', pose: 'block' }],
      }
      case 'insert': return {
        vm: [[0, 'open']], ch: { hammer: [[0, 0.45]], block: [[0, 1]] }, L,
        R: [{ t: 0, att: 'prev', pose: 'block' }, { t: 0.32, att: 'belt', pose: 'pinch' }, { t: 0.58, att: 'mouth', pose: 'pinch' }, { t: 0.76, att: 'seat', pose: 'pinch' }, { t: 1, att: c.more ? 'belt' : 'mouth', pose: 'pinch', off: c.more ? undefined : [0.02, 0.03, 0.04] }],
        heldR: [[0, ''], [0.3, 'ammo'], [0.76, '']], seat: 0.76,
      }
      case 'extract': return {
        vm: [[0, 'open']], ch: { hammer: [[0, 0.45]], block: [[0, 1]] }, L,
        R: [{ t: 0, att: 'prev', pose: 'block' }, { t: 0.3, att: 'seat', pose: 'pinch' }, { t: 0.42, att: 'seat', pose: 'pinch' }, { t: 0.62, att: 'mouth', pose: 'pinch' }, { t: 1, att: 'belt', pose: 'pinch' }],
        heldR: [[0, ''], [0.42, 'chamber'], [0.95, '']], seat: 0.42,
      }
      case 'close': return {
        // 压下活门 → 拇指扳到全击发 → 握回枪颈
        vm: [[0, 'open'], [0.6, 'open'], [1, 'hip']], ch: { block: [[0.3, 1], [0.62, 0]], hammer: [[0.7, 0.45], [0.84, c.loaded ? 1 : 0.45]] },
        L, R: [{ t: 0, att: 'prev', pose: 'pinch' }, { t: 0.3, att: '@', pose: 'block' }, { t: 0.62, att: '@', pose: 'block' }, { t: 0.72, att: '@', pose: 'hammer' }, { t: 0.84, att: '@', pose: 'hammer' }, { t: 1, att: '@', pose: 'grip' }],
      }
      default: return null
    }
  },
}

export const CHOREO: Record<GunType, GunChoreo> = { dbshotgun: DB_CHOREO, leverrifle: LR_CHOREO, revolver: RV_CHOREO, musket: MK_CHOREO, trapdoor: TD_CHOREO }
/** 右手默认握法（retroViewHand.heldHandPose 用；手部在 FirearmView 里还会按动作切换） */
export const GUN_RIGHT_POSE: Record<GunType, HandPose> = Object.fromEntries(
  (Object.keys(CHOREO) as GunType[]).map((t) => [t, CHOREO[t].poses[CHOREO[t].idleHands.R].pose]),
) as Record<GunType, HandPose>
/** 弹位入口离到位的距离（弹长 + 余量） */
export function itemLen(ammo: AmmoType): number {
  if (ammo.startsWith('shell')) return 0.0675
  return CART[ammo as keyof typeof CART]?.len ?? 0.04
}

// 静态校验用：每个动作的时长
export function actDur(type: GunType, act: GunAct, stage?: MuzzleStage): number {
  const d = GUNS[type], R = d.reload
  switch (act) {
    case 'fire': return d.fireInterval
    case 'cycle': return d.cycle ?? 0
    case 'open': return R.open
    case 'extract': return R.extract
    case 'insert': return R.insert
    case 'close': return R.close
    case 'stage': return stage ? R.stages![stage] : 0
    default: return 0.22
  }
}
export { MUZZLE_STAGES, DB, LR, RV, MK, TD }
