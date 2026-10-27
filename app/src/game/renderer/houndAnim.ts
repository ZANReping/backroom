// 猎犬（Entity 8）重制·阶段 2 动画（hd-wt，2026-10-25）。
// 片段（HOUND_CLIPS）：idle 低头嗅地 / walk 潜行 / stalk 低伏前进 / trot / gallop 冲锋 / pounce 扑击 / bite 撕咬甩头 / howl 仰头掀发 /
// cower 被直视压低盖脸后退 / habituate 甩头抖毛 / sit、wag 中立坐下摇尾 / flee / hit / death / pin 扑倒压住撕咬。
// 结构：
//   sampleHoundPose(rig, clip, t)   纯函数：片段 + 时间 → 姿态量（HoundPose），可 blendHoundPose 混合
//   applyHoundPose(grp, pose, dt)   姿态 → 骨骼：四肢平面三段 IK（落地脚锁在地面上，不滑步）、颈 / 头 / 下颌 / 耳、尾链（贴地约束）、
//                                    头发掀开 / 盖脸，再叠加头发链、背毛链、尾链的二阶摆动（弹簧阻尼，按骨点加速度与重力方向驱动；状态存在 grp.userData.hdDyn）
//   animateHoundClip(grp, clip, t, kind, dt)   无状态入口 = sample + apply
//   animateHound(grp, e, time, gz)  游戏入口：按 e.hd 的 phase 与姿态量选片段并交叉淡入（状态在 grp.userData.hdAnim）
// 移动片段的相位按走过的距离推进（e.animT 累计 速度×dt），支撑脚每周期相对身体后移的距离 = 身体前进距离，所以脚在世界里不动。
// 阶段 3：
//   · 步幅随速度缩放（walk / stalk / trot：strideK = √(实际速度 / 名义速度)，夹在 0.85–1.45），相位按距离 / 当前步幅累加——
//     AI 的 stalk 降到 1.53 m/s，步幅约 1 m、步频约 1.5 Hz，不再急促。
//   · 新相位映射：flank→trot、linger→walk / idle、pin→pin、stagger→habituate、feed→bite、drag→walk。
//   · pin：前爪落点按玩家实际位置（opts.px / py）算，压在玩家胸口。
//   · LOD 三档（houndLodTier / setHoundLod，阈值见 engine/houndAI 的 HD 表）：0 全量；1（≥12 m）停二阶摆动；
//     2（≥22 m）把头发 / 背毛骨链（约 370 根）从骨架上摘下，毛发换成只绑 11 根锚骨（躯干 / 颈 / 头 / 尾链）的同几何低骨数蒙皮，
//     姿态隔帧更新——多只同屏时不再每帧更新、上传几百根骨。
import * as THREE from 'three'
import type { Entity } from '../entities'
import { HOUND_SHAPES, houndHairPart, solveLeg, type HoundKind, type HoundLeg, type HoundRig } from './houndMesh'
import { HD } from '../engine/houndAI'

export type HoundClip = 'idle' | 'walk' | 'stalk' | 'trot' | 'gallop' | 'pounce' | 'bite' | 'howl' | 'cower' | 'habituate' | 'sit' | 'wag' | 'flee' | 'hit' | 'death' | 'pin'
export interface HoundClipInfo {
  title: string; dur: number; loop: boolean
  /** 移动片段：每个步态周期身体走过的距离（米）与名义速度（米 / 秒，负为后退）；t = 距离 / |speed| */
  stride?: number; speed?: number
}
export const HOUND_CLIPS: Record<HoundClip, HoundClipInfo> = {
  idle: { title: 'idle 低头嗅地', dur: 3.2, loop: true },
  walk: { title: 'walk 潜行', dur: 0.62, loop: true, stride: 0.8, speed: 1.3 },
  stalk: { title: 'stalk 低伏前进', dur: 0.9, loop: true, stride: 0.72, speed: 0.8 },
  trot: { title: 'trot 小跑', dur: 0.4, loop: true, stride: 1.1, speed: 2.75 },
  gallop: { title: 'gallop 冲锋', dur: 0.36, loop: true, stride: 1.9, speed: 5.3 },
  pounce: { title: 'pounce 扑击', dur: 0.75, loop: false },
  bite: { title: 'bite 撕咬甩头', dur: 0.8, loop: true },
  howl: { title: 'howl 仰头嚎叫（头发滑落露脸）', dur: 1.6, loop: false },
  cower: { title: 'cower 被直视：压低、头发盖脸、后退', dur: 0.75, loop: true, stride: 0.42, speed: -0.56 },
  habituate: { title: 'habituate 甩头抖毛', dur: 1.1, loop: false },
  sit: { title: 'sit 中立坐下', dur: 2.4, loop: false },
  wag: { title: 'wag 坐着摇尾', dur: 1.2, loop: true },
  flee: { title: 'flee 夹尾逃跑', dur: 0.36, loop: true, stride: 1.8, speed: 5 },
  hit: { title: 'hit 受击', dur: 0.45, loop: false },
  death: { title: 'death 倒地', dur: 1.4, loop: false },
  pin: { title: 'pin 扑倒压住撕咬', dur: 0.9, loop: true },
}

export interface HoundFoot { x: number; y: number; phi: number; lock: number }
/** 姿态量（全部可线性混合）。头 / 颈角相对世界（apply 时扣掉躯干俯仰）。 */
export interface HoundPose {
  rootX: number; bodyY: number; pitch: number; roll: number; yaw: number
  neckZ: number; neckY: number; headZ: number; headY: number; headX: number
  jaw: number; ear: number
  /** 前肢肩胛起伏（米，正为上顶） */
  scap: [number, number]
  feet: HoundFoot[]
  tailLift: number; tailYaw: number; wagAmp: number; wagFreq: number; tailCurl: number; tailT: number
  hairPart: number; hairCover: number
  shake: number
  grpY: number
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const ease = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t) }
const frac = (x: number) => x - Math.floor(x)
/** a→b 区间内 0→1→0 的平滑鼓包 */
const bump = (t: number, a: number, b: number) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI))
const ramp = (t: number, a: number, b: number) => ease((t - a) / (b - a))
const TAU = Math.PI * 2
/** pin 抬颈俯脸的基准角（颈 / 头相对世界，负为低头）、撕咬前探幅度、掀发程度 */
export const PIN_POSE = { neckZ: 0.5, headZ: -0.98, lunge: 0.34, hairPart: 0.75, pitch: 0.05, bodyY: 0.02 }

function rigOf(grp: THREE.Object3D) { return grp.userData.houndRig as HoundRig | undefined }

/** 站立基准姿态 */
function basePose(r: HoundRig): HoundPose {
  const low = r.shape.low
  return {
    rootX: 0, bodyY: r.bodyY - low, pitch: -low * 0.25, roll: 0, yaw: 0,
    neckZ: -0.05, neckY: 0, headZ: -0.05, headY: 0, headX: 0, jaw: 0.08, ear: 0, scap: [0, 0],
    feet: r.legs.map((L) => ({ x: L.restX + (L.front ? low * 0.18 : -low * 0.2), y: L.pawY + 0.004, phi: 0, lock: 1 })),
    tailLift: 0, tailYaw: 0, wagAmp: 0.04, wagFreq: 1.3, tailCurl: 0, tailT: 0,
    hairPart: 0, hairCover: 0, shake: 0, grpY: 0,
  }
}

/** 步态：phase 0..1，D 每周期身体走过的距离，duty 支撑占比，offs 各腿相位（FL, FR, HL, HR），lift 抬脚高度，dir=-1 后退 */
function gait(r: HoundRig, P: HoundPose, phase: number, D: number, duty: number, offs: number[], lift: number, dir = 1, frontLift = lift) {
  const stance: number[] = []
  r.legs.forEach((L, i) => {
    const f = P.feet[i], ph = frac(phase + offs[i])
    const sweep = D * duty
    if (ph < duty) { const u = ph / duty; f.x += dir * sweep * (0.5 - u); f.lock = 1; stance.push(u) }
    else {
      const s = (ph - duty) / (1 - duty)
      f.x += dir * sweep * (-0.5 + ease(s))
      f.y += (L.front ? frontLift : lift) * Math.sin(Math.PI * s) ** 0.8
      f.phi += -(L.front ? 0.5 : 0.8) * Math.sin(Math.PI * s) // 抬脚时脚掌 / 跖段先立起、落地前放平
      f.lock = 0; stance.push(-1)
    }
  })
  // 肩胛：前肢支撑后段（推地）肩胛上顶，摆动时落下
  for (let i = 0; i < 2; i++) { const u = stance[i]; P.scap[i] = u < 0 ? -0.012 : 0.03 * Math.sin(Math.PI * u) }
  return stance
}

/** 片段采样（纯函数）。t：秒（移动片段可传 距离 / |speed|）。 */
export function sampleHoundPose(r: HoundRig, clip: HoundClip, t: number, strideK = 1): HoundPose {
  const P = basePose(r), C = HOUND_CLIPS[clip], low = r.shape.low
  const SD = (C.stride ?? 0) * strideK // 本周期步幅（随速度缩放）
  const lt = C.loop ? frac(t / C.dur) : clamp01(t / C.dur) // 归一化时间
  const T = C.loop ? lt * C.dur : Math.min(t, C.dur)
  switch (clip) {
    case 'idle': { // 低头嗅地：头贴近地面一下一下地嗅，偶尔抬头左右张望；尾巴慢摆
      const look = bump(lt, 0.55, 0.85)
      const sniff = Math.max(0, Math.sin(T * 9)) ** 2 * (1 - look)
      P.bodyY += Math.sin(T * 1.9) * 0.005 - 0.02
      P.pitch += -0.06 * (1 - look)
      P.neckZ = -0.55 * (1 - look) + 0.05 * look; P.headZ = -0.75 * (1 - look) - 0.05 * look - sniff * 0.08
      P.headY = Math.sin(T * 0.8) * 0.18 * (1 - look) + Math.sin(lt * TAU * 2) * 0.55 * look
      P.jaw = 0.05 + 0.03 * sniff; P.ear = 0.1
      P.feet[0].x += 0.03; P.feet[1].x -= 0.02 // 前爪一前一后
      P.wagAmp = 0.12; P.wagFreq = 1.4; P.tailLift = 0.05
      break
    }
    case 'walk': case 'stalk': case 'trot': { // 潜行 / 低伏 / 小跑
      const st = clip === 'stalk', tr = clip === 'trot'
      const ph = lt
      const offs = tr ? [0, 0.5, 0.5, 0] : [0.25, 0.75, 0, 0.5]
      gait(r, P, ph, SD, tr ? 0.5 : st ? 0.76 : 0.68, offs, tr ? 0.1 : st ? 0.045 : 0.07 * Math.min(1.3, strideK))
      const bob = Math.cos(ph * TAU * 2)
      P.bodyY += (st ? -0.13 - low * 0.3 : tr ? 0.01 : -0.05) + bob * (tr ? 0.025 : 0.012)
      P.pitch += (st ? -0.07 : -0.03) + Math.sin(ph * TAU * 2) * (tr ? 0.025 : 0.02)
      P.neckY = Math.sin(ph * TAU) * 0.05 // 身体不侧滚 / 扭转（脚是平面 IK，侧滚会让落地脚滑），左右摆放在颈上
      P.neckZ = st ? -0.2 : tr ? 0.02 : -0.22; P.headZ = st ? -0.12 : tr ? -0.02 : -0.3
      P.headZ -= bob * 0.03 // 头随步点头（反相稳住视线）
      P.headY = Math.sin(ph * TAU) * -0.04
      P.ear = st ? 0.7 : tr ? 0.2 : 0.35; P.jaw = st ? 0.18 : 0.06
      P.tailLift = st ? -0.05 : tr ? 0.25 : 0.06; P.wagAmp = tr ? 0.1 : 0.06; P.wagFreq = TAU / C.dur
      if (st) for (let i = 0; i < 2; i++) P.feet[i].x += 0.05 // 低伏：前爪更往前探
      break
    }
    case 'gallop': case 'flee': { // 冲锋：旋转式跑步，前后肢交替伸展，躯干俯仰起伏、腾空
      const fl = clip === 'flee', ph = lt
      gait(r, P, ph, C.stride!, 0.32, [0.55, 0.66, 0, 0.1], 0.2, 1, 0.24)
      const c = Math.cos(ph * TAU), s2 = Math.sin(ph * TAU)
      P.bodyY += -0.03 + 0.07 * Math.max(0, Math.sin(ph * TAU - 0.6)) - (fl ? 0.04 : 0)
      P.pitch += -0.08 + 0.13 * c
      P.rootX = 0.04 * s2
      P.neckZ = (fl ? -0.25 : -0.12) - 0.12 * c; P.headZ = (fl ? -0.3 : -0.2) - 0.1 * c
      P.headY = fl ? 0.28 : 0
      P.jaw = fl ? 0.15 : 0.55 + 0.25 * Math.max(0, Math.sin(ph * TAU * 2)); P.ear = 1
      P.tailLift = fl ? -0.55 : 0.45; P.tailCurl = fl ? 0.4 : 0; P.wagAmp = 0.06; P.wagFreq = TAU / C.dur
      P.hairPart = fl ? 0 : 0.18 // 冲刺风压：刘海稍微往后掀
      break
    }
    case 'pounce': { // 扑击：0–0.3 压低蓄力（四爪不动），0.3–0.6 腾空前扑（前爪前伸、后腿蹬直），0.6–0.82 前爪先落、后腿跟上，最后收势
      const J = 0.55 // 前扑距离（根位移）
      const crouch = bump(lt, 0, 0.42)
      const air = bump(lt, 0.3, 0.64)
      P.rootX = -0.08 * bump(lt, 0, 0.36) + J * ramp(lt, 0.3, 0.66)
      P.bodyY += -0.12 * crouch + 0.24 * air - 0.06 * bump(lt, 0.6, 0.9)
      P.pitch += -0.1 * crouch + 0.18 * air - 0.14 * bump(lt, 0.58, 0.9)
      P.neckZ = -0.25 * crouch + 0.08 * air; P.headZ = -0.15 * crouch - 0.05 * air
      P.jaw = 0.2 + 0.8 * ramp(lt, 0.25, 0.4) * (1 - 0.6 * ramp(lt, 0.7, 1)); P.ear = 1
      for (let i = 0; i < 4; i++) {
        const L = r.legs[i], f = P.feet[i]
        if (L.front) { // 0.3 离地 → 0.62 落在前方 J 处
          const sw = clamp01((lt - 0.3) / 0.32), up = Math.sin(Math.PI * sw)
          f.x += J * ease(sw) + 0.12 * up; f.y += 0.2 * up; f.phi += -0.6 * up; f.lock = sw > 0 && sw < 1 ? 0 : 1
        } else { // 0.4 蹬地离地 → 0.82 落在前方 J 处
          const sw = clamp01((lt - 0.4) / 0.42), up = Math.sin(Math.PI * sw)
          f.x += J * ease(sw) - 0.12 * up; f.y += 0.12 * up; f.phi += -0.9 * up; f.lock = sw > 0 && sw < 1 ? 0 : 1
        }
      }
      P.tailLift = 0.5 * air + 0.1; P.hairPart = 0.35 * air; P.shake = 0.5 * bump(lt, 0.58, 0.8)
      break
    }
    case 'bite': { // 撕咬甩头：前腿撑住、后腿后蹬，头低下左右猛甩，下颌一开一合，身子往后拽
      const s = Math.sin(T * 13), clamp = 0.5 + 0.5 * Math.sin(T * TAU / 0.4)
      P.bodyY += -0.08; P.pitch += -0.14; P.rootX = -0.04 * (0.5 + 0.5 * Math.sin(T * 6))
      P.neckZ = -0.35; P.headZ = -0.35 + 0.08 * clamp; P.headY = 0.42 * s; P.headX = -0.3 * s
      P.neckY = 0.12 * s
      P.jaw = 0.15 + 0.75 * (1 - clamp); P.ear = 1
      P.feet[0].x += 0.08; P.feet[1].x += 0.12; P.feet[2].x -= 0.06; P.feet[3].x -= 0.1
      P.tailLift = 0.1; P.tailYaw = -0.25 * s; P.shake = 0.7
      break
    }
    case 'howl': { // 嚎叫：后坐、胸口挺起，脖子仰起，头发向后滑落露出脸，下颌大张
      const up = ramp(lt, 0.05, 0.35), hold = ramp(lt, 0.25, 0.4) * (1 - ramp(lt, 0.88, 1))
      P.bodyY += -0.05 * up; P.pitch += 0.2 * up
      P.rootX = -0.06 * up
      P.neckZ = 0.75 * up; P.headZ = 1.0 * up + 0.04 * Math.sin(T * 17) * hold // 喉咙颤动
      P.jaw = 0.12 + 0.95 * hold; P.ear = 0.75 * up
      P.hairPart = ramp(lt, 0.12, 0.42) * (1 - 0.3 * ramp(lt, 0.9, 1))
      P.tailLift = 0.2 * up; P.wagAmp = 0.02
      break
    }
    case 'cower': { // 被直视：压低身子、头埋低、头发盖住脸、夹尾，一步步往后退，浑身发抖
      const ph = lt
      gait(r, P, ph, C.stride!, 0.72, [0.25, 0.75, 0, 0.5], 0.035, -1)
      const tremble = Math.sin(t * 47) * 0.006
      P.bodyY += -0.2 - low * 0.2 + tremble + Math.cos(ph * TAU * 2) * 0.006
      P.pitch += -0.1
      P.neckZ = -0.4; P.headZ = -0.5 + tremble * 3; P.headY = Math.sin(ph * TAU) * 0.08
      P.jaw = 0.22; P.ear = 1
      P.hairCover = 1
      P.tailLift = -0.7; P.tailCurl = 0.6; P.wagAmp = 0.02
      for (let i = 0; i < 4; i++) P.feet[i].x += r.legs[i].front ? 0.05 : -0.03
      break
    }
    case 'habituate': { // 习惯目光：甩头（衰减振荡）、抖毛，然后抬起身子，下颌一咧
      const sh = Math.exp(-lt * 3.2) * Math.sin(T * 26), stand = ramp(lt, 0.35, 0.85)
      P.bodyY += -0.16 * (1 - stand); P.pitch += -0.08 * (1 - stand)
      P.headY = 0.7 * sh; P.headX = 0.45 * sh; P.neckY = 0.25 * sh
      P.neckZ = -0.3 * (1 - stand) + 0.05 * stand; P.headZ = -0.35 * (1 - stand) - 0.05 * stand
      P.jaw = 0.1 + 0.35 * bump(lt, 0.6, 1); P.ear = 1 - 0.7 * stand
      P.hairCover = 1 - ramp(lt, 0.1, 0.6); P.hairPart = 0.25 * bump(lt, 0.2, 0.7)
      P.tailLift = -0.5 * (1 - stand) + 0.15 * stand; P.tailYaw = 0.4 * sh
      P.shake = 1.4 * Math.exp(-lt * 2.5)
      break
    }
    case 'sit': case 'wag': { // 中立坐下：后腿折叠、后爪平贴地面，前腿撑直，胸口挺起；歪头看人，尾巴在地上扫
      const k = clip === 'wag' ? 1 : ramp(lt, 0, 0.45)
      sitPose(r, P, k)
      const tilt = clip === 'wag' ? Math.sin(T * TAU / C.dur) * 0.28 : 0.22 * bump(lt, 0.55, 1)
      P.headX = tilt; P.headY = clip === 'wag' ? 0.12 * Math.sin(T * 2.6) : 0
      P.bodyY += Math.sin(T * 1.8) * 0.004 * k
      P.wagAmp = clip === 'wag' ? 0.42 : 0.18 * k; P.wagFreq = clip === 'wag' ? TAU / 0.3 : 5
      P.jaw = clip === 'wag' ? 0.2 + 0.1 * Math.sin(T * 9) : 0.1; P.ear = 0
      break
    }
    case 'hit': { // 受击：整个身子往后一缩、侧歪，头猛地扬起、张嘴，耳朵贴后
      const k = bump(lt, 0, 0.55) ** 0.7, rec = bump(lt, 0.3, 1)
      P.rootX = -0.1 * k; P.bodyY += -0.05 * k; P.pitch += 0.1 * k - 0.04 * rec; P.neckY = 0.2 * k
      P.neckZ = 0.25 * k; P.headZ = 0.35 * k; P.headY = -0.25 * k; P.jaw = 0.1 + 0.7 * k; P.ear = 1
      P.hairPart = 0.3 * k; P.shake = 1.2 * k
      break
    }
    case 'death': { // 死亡：腿一软，侧翻倒地，四肢抽搐收拢，头垂地、下颌松开
      const buckle = ramp(lt, 0, 0.35), fall = ramp(lt, 0.2, 0.6), curl = ramp(lt, 0.45, 1)
      const tw = Math.sin(T * 30) * bump(lt, 0.55, 0.95) * 0.12
      P.bodyY = P.bodyY + (0.15 - P.bodyY) * fall - 0.12 * buckle * (1 - fall)
      P.pitch = P.pitch * (1 - fall) - 0.06 * fall
      P.roll = 1.5 * fall
      P.neckZ = -0.2 - 0.2 * fall; P.neckY = 0.4 * fall; P.headZ = -0.3 * fall; P.headX = 0.6 * fall
      P.jaw = 0.2 + 0.45 * fall; P.ear = 0.4
      r.legs.forEach((L, i) => { // 倒下后四肢在躯干平面里往身下收、抽搐
        const f = P.feet[i]
        f.lock = 1 - fall
        f.x += ((L.front ? -0.12 : 0.14) * curl + tw * (i % 2 ? 1 : -1)) * fall
        f.y += (0.06 + 0.12 * curl) * fall + (P.bodyY - (r.bodyY - low)) * (1 - fall) * 0
        f.phi += -0.6 * curl
      })
      P.tailLift = -0.1; P.wagAmp = 0; P.hairCover = 0.6 * fall
      P.grpY = 0
      break
    }
    case 'pin': { // 扑倒压住（第一人称镜头在玩家头部）：前爪按在玩家胸口，抬颈、脸朝下对着玩家的脸，掀开刘海露出脸和牙；
      // 撕咬的前探 / 回缩由 animateHound 按 AI 的撕咬节拍叠加（houndPinBite），这里只有压住时的喘息、低吼抖动
      const s = Math.sin(T * TAU / 0.45), jerk = Math.sin(T * 15)
      P.rootX = 0.03 + 0.015 * s
      P.bodyY += PIN_POSE.bodyY + 0.012 * s; P.pitch += PIN_POSE.pitch + 0.025 * s
      P.feet[0].x += 0.32; P.feet[1].x += 0.36; P.feet[0].y += 0.12; P.feet[1].y += 0.12 // 前爪踩在玩家身上（游戏里由 houndPinPaws 按玩家胸口重定位）
      P.feet[0].phi -= 0.15; P.feet[1].phi -= 0.15
      P.feet[2].x -= 0.12; P.feet[3].x -= 0.16
      P.neckZ = PIN_POSE.neckZ + 0.04 * s; P.headZ = PIN_POSE.headZ + 0.05 * s; P.headY = 0.1 * jerk; P.headX = -0.08 * jerk
      P.jaw = 0.2 + 0.22 * (0.5 + 0.5 * Math.sin(T * TAU / 0.3)); P.ear = 1 // 平时龇牙低吼（半张），大张嘴留给撕咬蓄力
      P.hairPart = PIN_POSE.hairPart
      P.tailLift = 0.25; P.tailYaw = 0.35 * Math.sin(T * 5); P.shake = 0.35
      P.scap = [0.03 + 0.02 * s, 0.03 - 0.02 * s]
      break
    }
  }
  P.tailT = t
  return P
}

/** 坐姿：四爪不动，躯干往后坐到后爪上方（按后髋离地 0.15 m 反推高度、按后爪位置反推后移量），胸口挺起、前腿撑直 */
function sitPose(r: HoundRig, P: HoundPose, k: number) {
  const low = r.shape.low
  const th = 0.5 + low * 0.6
  const hi = r.legs.findIndex((L) => !L.front), hl = r.legs[hi]
  const c = Math.cos(th), s = Math.sin(th)
  const bySit = 0.15 - (s * hl.hx + c * hl.hy)
  const rxSit = P.feet[hi].x - (0.2 + hl.l3) - (c * hl.hx - s * hl.hy) // 后髋落在后爪后方 0.2 + 跖长处
  P.pitch += (th - P.pitch) * k
  P.bodyY += (bySit - P.bodyY) * k
  P.rootX += (rxSit - P.rootX) * k
  r.legs.forEach((L, i) => {
    const f = P.feet[i]
    if (!L.front) { f.phi += -L.phi * k; return } // 跖段（脚跟到脚掌）平放在地上
    // 前爪：坐下过程中各迈一小步，收到肩下略前（迈步时抬脚，不在地上拖）
    const goal = rxSit + (c * L.hx - s * L.hy) + 0.08
    const a0 = L.side < 0 ? 0.3 : 0.5, sw = clamp01((k - a0) / 0.3), up = Math.sin(Math.PI * sw)
    f.x += (goal - f.x) * ease(sw); f.y += 0.06 * up; f.phi += -0.4 * up; f.lock = sw > 0 && sw < 1 ? 0 : 1
  })
  P.neckZ += (0.25 - P.neckZ) * k; P.headZ += (0.05 - P.headZ) * k
  P.tailLift += (-0.2 - P.tailLift) * k
}

/** 两个姿态线性混合（w=0 → a，1 → b） */
export function blendHoundPose(a: HoundPose, b: HoundPose, w: number): HoundPose {
  if (w <= 0) return a
  if (w >= 1) return b
  const out = { ...a } as HoundPose
  for (const k of Object.keys(a) as (keyof HoundPose)[]) {
    const va = a[k], vb = b[k]
    if (typeof va === 'number' && typeof vb === 'number') (out as any)[k] = va + (vb - va) * w
  }
  out.scap = [a.scap[0] + (b.scap[0] - a.scap[0]) * w, a.scap[1] + (b.scap[1] - a.scap[1]) * w]
  out.feet = a.feet.map((f, i) => { const g = b.feet[i]; return { x: f.x + (g.x - f.x) * w, y: f.y + (g.y - f.y) * w, phi: f.phi + (g.phi - f.phi) * w, lock: f.lock + (g.lock - f.lock) * w } })
  return out
}

// ---------- 二阶摆动 ----------
interface DynState {
  bones: THREE.Bone[]; dir: THREE.Vector3[]; k: Float32Array; c: Float32Array; lim: Float32Array; ga: Float32Array
  th: Float32Array; om: Float32Array; pp: Float32Array; pv: Float32Array; init: boolean
}
function dynOf(grp: THREE.Object3D, r: HoundRig): DynState {
  let D = grp.userData.hdDyn as DynState | undefined
  if (D) return D
  const bones: THREE.Bone[] = [], dir: THREE.Vector3[] = [], kk: number[] = [], cc: number[] = [], ll: number[] = [], gg: number[] = []
  const addChain = (ch: THREE.Bone[], from: number, k: number, c: number, lim: number, acc: number) => {
    for (let i = from; i < ch.length; i++) {
      const nx = ch[i + 1] ? (ch[i + 1].userData.rest as THREE.Vector3).clone() : (ch[i].userData.rest as THREE.Vector3).clone()
      bones.push(ch[i]); dir.push(nx.lengthSq() > 1e-10 ? nx.normalize() : new THREE.Vector3(0, -1, 0))
      kk.push(k * (1 + 0.25 * (i - from))); cc.push(c); ll.push(lim); gg.push(acc)
    }
  }
  for (const L of r.hair) addChain(L.bones, 1, 70, 7, 1.0, 0.45)
  for (const L of r.mane) addChain(L.bones, 1, 55, 6, 0.9, 0.45)
  addChain(r.tailChain, 1, 42, 11, 0.35, 0.18)
  const n = bones.length
  D = { bones, dir, k: Float32Array.from(kk), c: Float32Array.from(cc), lim: Float32Array.from(ll), ga: Float32Array.from(gg), th: new Float32Array(n * 3), om: new Float32Array(n * 3), pp: new Float32Array(n * 3), pv: new Float32Array(n * 3), init: false }
  grp.userData.hdDyn = D
  return D
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _g = new THREE.Vector3(), _a = new THREE.Vector3(), _t = new THREE.Vector3()
/** 用上一帧的世界矩阵算每根骨的骨点加速度与重力方向（换到父骨局部），驱动弹簧阻尼；结果叠加到骨骼当前（姿态）旋转上 */
function stepDynamics(grp: THREE.Object3D, r: HoundRig, dt: number, shake: number, time: number) {
  const D = dynOf(grp, r)
  const n = D.bones.length
  dt = Math.min(0.05, Math.max(0, dt))
  if (!D.init || dt <= 0) {
    for (let i = 0; i < n; i++) { const e = D.bones[i].matrixWorld.elements; D.pp[i * 3] = e[12]; D.pp[i * 3 + 1] = e[13]; D.pp[i * 3 + 2] = e[14]; D.pv[i * 3] = D.pv[i * 3 + 1] = D.pv[i * 3 + 2] = 0 }
    D.init = true
    if (dt <= 0) { for (let i = 0; i < n; i++) addRot(D, i); return }
  }
  for (let i = 0; i < n; i++) {
    const b = D.bones[i], e = b.matrixWorld.elements, i3 = i * 3
    // 骨点速度 / 加速度（世界）
    const vx = (e[12] - D.pp[i3]) / dt, vy = (e[13] - D.pp[i3 + 1]) / dt, vz = (e[14] - D.pp[i3 + 2]) / dt
    _a.set(vx - D.pv[i3], vy - D.pv[i3 + 1], vz - D.pv[i3 + 2]).divideScalar(dt)
    if (_a.lengthSq() > 2500) _a.setLength(50) // 传送 / 流式平移时不爆
    D.pp[i3] = e[12]; D.pp[i3 + 1] = e[13]; D.pp[i3 + 2] = e[14]; D.pv[i3] = vx; D.pv[i3 + 1] = vy; D.pv[i3 + 2] = vz
    // 父骨世界旋转的逆
    _m.extractRotation((b.parent as THREE.Object3D).matrixWorld); _q.setFromRotationMatrix(_m).invert()
    _g.set(0, -1, 0).applyQuaternion(_q).sub(_v.set(0, -1, 0)) // 重力方向相对静止姿态的偏差
    _a.applyQuaternion(_q).multiplyScalar(1 / 9.8)
    if (shake > 0) _a.add(_v.set(Math.sin(time * 41 + i * 1.7), Math.sin(time * 37 + i * 2.3), Math.sin(time * 43 + i)).multiplyScalar(shake * 1.6))
    _t.copy(_g).multiplyScalar(0.65).sub(_a.multiplyScalar(D.ga[i]))
    _t.crossVectors(D.dir[i], _t) // 力矩 = r × F
    const k = D.k[i], c = D.c[i], lim = D.lim[i]
    for (let a = 0; a < 3; a++) {
      const j = i3 + a, f = (a === 0 ? _t.x : a === 1 ? _t.y : _t.z) * k
      D.om[j] += (f - k * D.th[j] - c * D.om[j]) * dt
      D.th[j] = Math.max(-lim, Math.min(lim, D.th[j] + D.om[j] * dt))
    }
    addRot(D, i)
  }
}
function addRot(D: DynState, i: number) {
  const b = D.bones[i]
  b.rotation.x += D.th[i * 3]; b.rotation.y += D.th[i * 3 + 1]; b.rotation.z += D.th[i * 3 + 2]
}

/** 姿态 → 骨骼 */
export function applyHoundPose(grp: THREE.Object3D, P: HoundPose, dt = 1 / 30, time = 0, lod = 0) {
  const r = rigOf(grp)
  if (!r) return
  r.body.position.set(P.rootX, P.bodyY, 0); r.body.rotation.set(P.roll, P.yaw, P.pitch)
  // 四肢：平面 IK（脚在地面上锁定）；前肢肩胛起伏通过平移肩关节实现
  r.legs.forEach((L, i) => {
    const f = P.feet[i]
    let leg: HoundLeg = L
    if (L.front) {
      const lift = P.scap[i] ?? 0
      const rest = L.hip.userData.rest as THREE.Vector3
      L.hip.position.set(rest.x, rest.y + lift, rest.z)
      leg = { ...L, hy: L.hy + lift }
    }
    solveLeg(leg, P.rootX, P.bodyY, P.pitch, f.x, f.y, L.phi + f.phi)
  })
  // 颈 / 头（姿态里是相对世界的角度，扣掉躯干俯仰）
  r.neck.rotation.set(0, P.neckY, P.neckZ - P.pitch * 0.5)
  r.head.rotation.set(P.headX, P.headY, P.headZ - P.pitch * 0.5)
  r.jaw.rotation.z = -Math.max(0, P.jaw) * 0.62
  r.earL.rotation.set(-P.ear * 0.3, 0, -P.ear * 0.6); r.earR.rotation.set(P.ear * 0.3, 0, -P.ear * 0.6)
  // 头发：先归零，再掀发 / 盖脸（LOD 2 时发链已摘下，跳过）
  if (lod < 2) for (const L of r.hair) for (const b of L.bones) b.rotation.set(0, 0, 0)
  if (lod < 2) for (const L of r.mane) for (const b of L.bones) b.rotation.set(0, 0, 0)
  if (lod < 2 && P.hairPart > 0.001) houndHairPart(grp, Math.min(1, P.hairPart))
  if (lod < 2 && P.hairCover > 0.001) for (const L of r.hair) { // 盖脸：脸前的发缕往前下垂，两侧往脸中间拢
    if (L.group === 'back') continue
    const s = L.az >= 0 ? 1 : -1, c = P.hairCover
    if (L.group === 'face') { L.bones[1].rotation.z += 0.32 * c; if (L.bones[2]) L.bones[2].rotation.z += 0.2 * c }
    else { L.bones[1].rotation.x += s * 0.38 * c; L.bones[1].rotation.z += 0.18 * c; if (L.bones[2]) L.bones[2].rotation.x += s * 0.2 * c }
  }
  // 尾链：抬尾 / 夹尾 / 摇尾（每节相位滞后形成波）
  const n = r.tailChain.length, tt = P.tailT
  r.tailChain.forEach((b, i) => {
    const k = i / (n - 1)
    b.rotation.set(0, P.tailYaw * (i === 0 ? 1 : 0.15) + P.wagAmp * Math.sin(tt * P.wagFreq - i * 0.65) * (1 - 0.35 * k) / (i === 0 ? 1 : 2.2) + Math.sin(tt * 0.9 - i * 0.5) * 0.025, 0)
    b.rotation.z = i === 0 ? -P.tailLift - P.pitch : i < 3 ? P.tailCurl * 0.25 : -P.tailCurl * 0.12
  })
  // 二阶摆动（叠加在上面的姿态旋转上）；LOD ≥ 1 停用
  if (lod === 0) stepDynamics(grp, r, dt, P.shake, time)
  // 尾巴贴地：二维前向运动学，低于地面的节点把上一节往上抬
  tailFloor(r, P)
}

function tailFloor(r: HoundRig, P: HoundPose) {
  const FLOOR = 0.055
  const ch = r.tailChain
  const r0 = ch[0].userData.rest as THREE.Vector3
  let a = P.pitch
  let px = P.rootX + Math.cos(a) * r0.x - Math.sin(a) * r0.y, py = P.bodyY + Math.sin(a) * r0.x + Math.cos(a) * r0.y
  a += ch[0].rotation.z
  let touched = false
  for (let i = 1; i < ch.length; i++) {
    const o = ch[i].userData.rest as THREE.Vector3
    let nx = px + Math.cos(a) * o.x - Math.sin(a) * o.y, ny = py + Math.sin(a) * o.x + Math.cos(a) * o.y
    // 低于地面：把上一节抬起来；已经有节点着地之后，后面的节点也顺着地面拖（不往上翘）
    const target = ny < FLOOR ? FLOOR : touched && ny > FLOOR + 0.015 ? FLOOR + 0.015 : NaN
    if (ny < FLOOR) touched = true
    if (!Number.isNaN(target)) {
      const len = Math.hypot(o.x, o.y), dy = target - py
      if (Math.abs(dy) < len) {
        const cur = Math.atan2(ny - py, nx - px), des = Math.atan2(dy, Math.sign(nx - px || -1) * Math.sqrt(len * len - dy * dy))
        let d = des - cur; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU
        ch[i - 1].rotation.z += d; a += d
        nx = px + Math.cos(a) * o.x - Math.sin(a) * o.y; ny = py + Math.sin(a) * o.x + Math.cos(a) * o.y
      }
    }
    px = nx; py = ny; a += ch[i].rotation.z
  }
}

/** 无状态入口：片段 + 时间 → 骨骼（二阶摆动状态在 grp.userData.hdDyn，靠 dt 推进） */
export function animateHoundClip(grp: THREE.Object3D, clip: HoundClip, t: number, kind?: HoundKind, dt = 1 / 30) {
  const r = rigOf(grp)
  if (!r) return
  void (kind && HOUND_SHAPES[kind])
  applyHoundPose(grp, sampleHoundPose(r, clip, t), dt, t)
}

// ---------- 游戏映射 ----------
interface AnimState { clip: HoundClip; t0: number; prev: HoundClip | null; prevT0: number; fade0: number; last: number; hp: number; hitT: number; habT: number; dist: number; v: number; ph: Partial<Record<HoundClip, number>>; skip: number; lodT: number }
const FADE = 0.22
/** 扑击 → 压住的交叉淡入更短：扑击末姿态头低、根位移前冲，0.22 s 淡入时第一人称镜头会贴着头顶 / 吻部（实机 1-hit 前 3 帧） */
const PIN_FADE = 0.1
/** 按 AI 状态选片段 */
function pickClip(e: Entity): HoundClip {
  const s = e.hd
  if (e.dead) return 'death'
  if (!s) return 'idle'
  const moving = (e.state === 'chase' || e.state === 'wander' || e.state === 'investigate' || e.state === 'stunned')
  if (s.phase === 'pin') return 'pin'
  if (s.strikeT !== undefined || e.lungeT > 0) return 'pounce'
  if (e.attackCd > 0.75 && e.attackCd < 1.2 && (s.phase === 'stalk' || s.phase === 'charge')) return 'bite'
  switch (s.phase) {
    case 'howl': return 'howl'
    case 'cower': return 'cower'
    case 'flee': return 'flee'
    case 'charge': return 'gallop'
    case 'stalk': return 'stalk'
    case 'search': return 'trot'
    case 'sit': return s.wag ? 'wag' : 'sit'
    case 'watch': return s.crouch > 0.5 ? 'stalk' : 'walk'
    case 'flank': return 'trot'
    case 'linger': return moving ? 'walk' : 'idle'
    case 'stagger': return 'habituate'
    case 'feed': return e.state === 'idle' ? 'bite' : 'trot'
    case 'drag': return 'walk'
    default: return moving && e.state !== 'stunned' ? 'walk' : 'idle'
  }
}
/** 片段时间：移动片段按走过的距离推进（脚不滑），其余按片段开始后的秒数 */
function clipTime(clip: HoundClip, A: AnimState, t0: number, time: number) {
  const C = HOUND_CLIPS[clip]
  if (C.speed) return (A.ph[clip] ?? A.dist / C.stride!) * C.dur // 相位 = Σ 走过的距离 / 当时的步幅
  return time - t0
}
/** 步幅缩放：只对 walk / stalk / trot（gallop / flee / cower 的步幅本来就与 AI 速度相符） */
export function houndStrideK(clip: HoundClip, v: number) {
  const C = HOUND_CLIPS[clip]
  if (!C.speed || (clip !== 'walk' && clip !== 'stalk' && clip !== 'trot')) return 1
  return Math.max(0.85, Math.min(1.45, Math.sqrt(Math.max(0.01, v) / Math.abs(C.speed))))
}

// ---------- LOD ----------
/** LOD 档位（带回差）：0 全量 / 1 停二阶摆动 / 2 摘发链 + 低骨数毛发 + 隔帧更新 */
export function houndLodTier(dist: number, prev = 0): 0 | 1 | 2 {
  const h = HD.LOD_HYST
  const t1 = prev >= 1 ? HD.LOD1 - h : HD.LOD1, t2 = prev >= 2 ? HD.LOD2 - h : HD.LOD2
  return dist >= t2 ? 2 : dist >= t1 ? 1 : 0
}
interface LodState { tier: 0 | 1 | 2; proxy?: THREE.SkinnedMesh; fur?: THREE.SkinnedMesh; roots: { bone: THREE.Object3D; parent: THREE.Object3D }[] }
function lodOf(grp: THREE.Object3D) {
  let L = grp.userData.hdLod as LodState | undefined
  if (!L) { L = { tier: 0, roots: [] }; grp.userData.hdLod = L }
  return L
}
/** 毛发低骨数替身：几何属性与原毛发共用，只把蒙皮重映射到锚骨（躯干 / 颈 / 头 / 尾链等非发链骨） */
export function buildFurProxy(fur: THREE.SkinnedMesh, lockBones: Set<THREE.Object3D>) {
  const bones = fur.skeleton.bones
  const anchors = bones.filter((b) => !lockBones.has(b))
  const aIdx = new Map<THREE.Object3D, number>(anchors.map((b, i) => [b, i]))
  const map = bones.map((b) => { let q: THREE.Object3D | null = b; while (q && !aIdx.has(q)) q = q.parent; return q ? aIdx.get(q)! : 0 })
  const g = fur.geometry, si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight'), n = si.count
  const nsi = new Uint16Array(n * 4), nsw = new Float32Array(n * 4)
  const acc = new Map<number, number>()
  for (let v = 0; v < n; v++) {
    acc.clear()
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k); if (w > 0) { const a = map[si.getComponent(v, k)]; acc.set(a, (acc.get(a) ?? 0) + w) } }
    const top = [...acc.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4), tot = top.reduce((q, x) => q + x[1], 0) || 1
    top.forEach(([a, w], k) => { nsi[v * 4 + k] = a; nsw[v * 4 + k] = w / tot })
    if (!top.length) nsw[v * 4] = 1
  }
  const geo = new THREE.BufferGeometry()
  for (const name of Object.keys(g.attributes)) if (name !== 'skinIndex' && name !== 'skinWeight') geo.setAttribute(name, g.getAttribute(name))
  if (g.index) geo.setIndex(g.index)
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(nsi, 4))
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(nsw, 4))
  if (g.boundingSphere) geo.boundingSphere = g.boundingSphere.clone()
  const mesh = new THREE.SkinnedMesh(geo, fur.material); mesh.name = 'houndHairLod'
  mesh.position.copy(fur.position); mesh.quaternion.copy(fur.quaternion); mesh.scale.copy(fur.scale)
  const inv = anchors.map((b) => fur.skeleton.boneInverses[bones.indexOf(b)].clone())
  mesh.bind(new THREE.Skeleton(anchors, inv), fur.bindMatrix.clone())
  if (fur.boundingSphere) mesh.boundingSphere = fur.boundingSphere.clone()
  mesh.frustumCulled = fur.frustumCulled; mesh.castShadow = fur.castShadow; mesh.receiveShadow = fur.receiveShadow
  mesh.userData.anchors = anchors.length
  return mesh
}
/** 切换 LOD 档位（返回当前档） */
export function setHoundLod(grp: THREE.Object3D, tier: 0 | 1 | 2) {
  const r = rigOf(grp), L = lodOf(grp)
  if (!r || L.tier === tier) return L.tier
  if (tier === 2) {
    const fur = L.fur ?? (grp.getObjectByName('houndHair') as THREE.SkinnedMesh | undefined)
    if (fur?.isSkinnedMesh) {
      L.fur = fur
      const lockBones = new Set<THREE.Object3D>()
      for (const k of [...r.hair, ...r.mane]) for (const b of k.bones) lockBones.add(b)
      if (!L.proxy) { L.proxy = buildFurProxy(fur, lockBones); fur.parent?.add(L.proxy) }
      fur.visible = false; L.proxy.visible = true
      // 摘下发链根骨：场景图更新不再遍历这几百根骨
      L.roots = []
      for (const k of [...r.hair, ...r.mane]) {
        let b: THREE.Object3D = k.bones[0]
        while (b.parent && lockBones.has(b.parent)) b = b.parent
        if (b.parent && !L.roots.some((x) => x.bone === b)) { L.roots.push({ bone: b, parent: b.parent }); b.parent.remove(b) }
      }
    }
  } else if (L.tier === 2) {
    for (const { bone, parent } of L.roots) parent.add(bone)
    L.roots = []
    if (L.fur) L.fur.visible = true
    if (L.proxy) L.proxy.visible = false
  }
  if (tier === 0) { const D = grp.userData.hdDyn as DynState | undefined; if (D) { D.init = false; D.th.fill(0); D.om.fill(0) } }
  L.tier = tier
  return tier
}
/** 渲染层统计：当前每帧参与场景图更新的骨骼数 */
export function houndActiveBones(grp: THREE.Object3D) { let n = 0; grp.traverse((o) => { if ((o as THREE.Bone).isBone) n++ }); return n }

export interface HoundAnimOpts { dist?: number; px?: number; py?: number }

/** 游戏入口（接口与旧版一致）：按 e.hd 的 phase 和姿态量映射到片段并交叉淡入 */
export function animateHound(grp: THREE.Group, e: Entity, time: number, gz: number, opts?: HoundAnimOpts) {
  const r = rigOf(grp)
  if (!r) return
  let A = grp.userData.hdAnim as AnimState | undefined
  if (!A) { A = { clip: pickClip(e), t0: time, prev: null, prevT0: time, fade0: -1, last: time, hp: e.hp, hitT: -1, habT: -1, dist: e.animT ?? 0, v: 0, ph: {}, skip: 0, lodT: time }; grp.userData.hdAnim = A }
  // LOD：距离分档（死亡 / 被压住时保持全量）
  const L = lodOf(grp)
  const want = e.dead || e.hd?.phase === 'pin' ? 0 : houndLodTier(opts?.dist ?? 0, L.tier)
  const lod = setHoundLod(grp, want)
  if (lod === 2 && (A.skip = (A.skip + 1) % HD.LOD2_EVERY) !== 0) { grp.position.y = gz + (grp.userData.hdGrpY ?? 0); return } // 隔帧：只跟地面高度
  const dt = Math.max(0, Math.min(0.1, time - A.last)); A.last = time
  // 相位按距离 / 当前步幅累加（步幅随速度缩放，脚仍锁地）
  const nd = e.animT ?? 0, dd = Math.max(0, nd - A.dist); A.dist = nd
  if (dt > 0) A.v += (dd / dt - A.v) * Math.min(1, dt * 6)
  for (const c of ['walk', 'stalk', 'trot', 'gallop', 'flee', 'cower'] as HoundClip[]) {
    const C = HOUND_CLIPS[c]
    A.ph[c] = (A.ph[c] ?? 0) + dd / (C.stride! * houndStrideK(c, A.v))
  }
  const s = e.hd
  // 受击：血量下降时叠加 hit
  if (e.hp < A.hp && !e.dead) A.hitT = time
  A.hp = e.hp
  // 习惯目光：cower 结束转冲锋的那一刻（gazeCd 刚被设成 6）先甩头抖毛
  if (s && s.gazeCd > 5.4 && A.habT < 0) A.habT = time
  if (s && s.gazeCd <= 5.4) A.habT = -1
  let clip = pickClip(e)
  if (A.habT >= 0 && time - A.habT < HOUND_CLIPS.habituate.dur && !e.dead) clip = 'habituate'
  if (clip !== A.clip) { A.prev = A.clip; A.prevT0 = A.t0; A.clip = clip; A.t0 = time; A.fade0 = time }
  const tC = e.dead ? Math.max(0, 1.4 - e.deathT) : clipTime(clip, A, A.t0, time)
  let P = sampleHoundPose(r, clip, tC, houndStrideK(clip, A.v))
  if (A.prev && A.fade0 >= 0) {
    const w = (time - A.fade0) / (clip === 'pin' ? PIN_FADE : FADE)
    if (w < 1) P = blendHoundPose(sampleHoundPose(r, A.prev, clipTime(A.prev, A, A.prevT0, time), houndStrideK(A.prev, A.v)), P, ease(w))
    else A.prev = null
  }
  // 扑击的根位移在游戏里大部分由 AI 位移承担（扑击时实体本身以 7 m/s 前冲），这里只保留三成，避免模型冲出碰撞体
  if (clip === 'pounce' || A.prev === 'pounce') { const R0 = P.rootX * 0.7; P.rootX -= R0; for (const f of P.feet) f.x -= R0 }
  // 中立摇尾 / 姿态量微调（兼容旧语义：crouch 压低、jaw 张嘴）
  if (s) {
    if (clip === 'idle' || clip === 'walk') P.bodyY -= s.crouch * 0.1
    if (clip !== 'pin') P.jaw = Math.max(P.jaw, s.jaw * 0.6) // pin 自己按撕咬节拍开合（AI 的 s.jaw 在 pin 时恒为 1，会把嘴撑成常开 0.6，实机 3-half 一直大张）
    if (s.wag && clip !== 'wag' && clip !== 'sit') { P.wagAmp = Math.max(P.wagAmp, 0.3); P.wagFreq = TAU / 0.3 }
  }
  if (A.hitT >= 0 && time - A.hitT < HOUND_CLIPS.hit.dur && !e.dead) {
    const ht = time - A.hitT
    P = blendHoundPose(P, sampleHoundPose(r, 'hit', ht), Math.sin(Math.min(1, ht / HOUND_CLIPS.hit.dur) * Math.PI) * 0.85)
  }
  // 头部朝向：闲时 / 观察时轻轻转头
  if (s && (s.phase === 'watch' || s.phase === 'sit')) P.headY += Math.sin((time + e.id * 0.9) * 0.5) * 0.25
  // pin：撕咬节拍（AI 的 biteAt / biteT）叠加前探；前爪落点按玩家实际位置（玩家仰面躺着、头即镜头，胸口在头前 HOUND_PIN_CHEST_FWD、离地约 22 cm）
  if (clip === 'pin' && s && s.pinT !== undefined) houndPinBite(P, s.biteAt === undefined ? -1 : s.pinT - s.biteAt, Math.max(0, s.biteT ?? 1))
  if (clip === 'pin' && opts?.px !== undefined && opts.py !== undefined) houndPinPaws(r, P, e, opts.px, opts.py, grp.scale.x || 1)
  P.tailT = time + e.id * 0.9
  applyHoundPose(grp, P, dt, time, lod)
  grp.userData.hdGrpY = P.grpY
  grp.position.y = gz + P.grpY
}
/** 仰面躺着的玩家胸口离地高度（米） */
export const HOUND_PIN_CHEST = 0.22
/** 玩家胸口在镜头（头部）前方的水平距离（米）：玩家被扑得仰面倒下，脚朝猎犬，胸口在头前约 0.34 m */
export const HOUND_PIN_CHEST_FWD = 0.34
/** pin 撕咬节拍叠加：untilNext = 距下一口的秒数（< 0.28 s 时后仰蓄力、张大嘴），since = 距上一口的秒数（0.42 s 内猛地前探、
 *  合嘴撕扯甩头再回缩）。纯函数，check:hound 断言前探 / 回缩幅度。 */
export function houndPinBite(P: HoundPose, since: number, untilNext: number) {
  const w = untilNext < 0.28 ? ease(1 - untilNext / 0.28) : 0
  const u = since / 0.42, k = since < 0 || u >= 1 ? 0 : u < 0.3 ? ease(u / 0.3) : 1 - ease((u - 0.3) / 0.7)
  P.neckZ += 0.16 * w - PIN_POSE.lunge * k; P.headZ += -0.08 * w + 0.28 * k // 蓄力：脖子后仰但吻部压低，脸始终对着镜头（不露下巴底）
  P.rootX += 0.07 * k; P.bodyY -= 0.03 * k
  P.headY += 0.28 * k * Math.sin(since * 38); P.headX += -0.12 * k * Math.sin(since * 31)
  // 张嘴：蓄力时张大，咬下去的前 0.05 s 仍大张（与蓄力衔接，不在扑过来的那一帧突然闭嘴），0.17 s 合拢，随后狠狠咬合（低于平时）
  const gape = Math.max(w, since >= 0 && since < 0.17 ? 1 - ease(clamp01((since - 0.05) / 0.12)) : 0)
  P.jaw = Math.max(P.jaw, gape) * (1 - 0.85 * bump(since, 0.12, 0.3))
  P.hairPart = Math.max(P.hairPart, PIN_POSE.hairPart + 0.15 * w)
  return k
}
/** pin 前爪：把两只前爪的落点平移到玩家胸口（模型前向距离），高度贴在玩家身上 */
export function houndPinPaws(r: HoundRig, P: HoundPose, e: { x: number; y: number; facing: number }, px: number, py: number, scale = 1) {
  const fwd = ((px - e.x) * Math.cos(e.facing) + (py - e.y) * Math.sin(e.facing)) / scale
  const chest = fwd - HOUND_PIN_CHEST_FWD / scale
  r.legs.forEach((L, i) => {
    if (!L.front) return
    const f = P.feet[i]
    const spread = i === 0 ? -0.02 : 0.02
    f.x = chest + spread + (f.x - (L.restX + 0.34)) * 0.3 // 保留片段里的一点按压起伏
    f.y = HOUND_PIN_CHEST / scale + (f.y - (L.pawY + 0.124)) * 0.5
  })
  return chest
}
