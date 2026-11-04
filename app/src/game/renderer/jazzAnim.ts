// [jazz stage 2] 爵士脑（Entity 197 / Jazz Brain）四人乐队·阶段 2 动画：程序化关键帧 / 曲线（不接 AI）。结构沿用厨师 chefAnim / 迎宾女郎 spokesAnim。
// 用法：
//   const an = createJazzAnimator(group)                 // group = buildJazz(who) 的返回（userData.jazz）
//   an.play('trumpetPlay')                               // 片段间按 JAZZ_CLIPS[clip].blend 交叉混合
//   an.update(dt)                                        // 每帧；an.rootDelta = 本帧根运动（root 空间 [dx, dz]，AI 叠到世界位置上）
// 无状态入口（预览 / 截图 / 验收）：
//   jazzPose(who, clip, t, opts) → JazzAnimPose（纯函数）；mixJazzPose(a, b, k)；applyJazzPose(rig, P, opts)
//   animateJazz(rig, clip, t, opts) / animateJazzPreroll(rig, clip, t, opts, pre)   // 后者先推进二阶（头惯性 / 下摆 / 弦 / 镲）
//   jazzRootMotion(clip, t0, t1) → [dx, dz]（walk 匀速前进）
//
// ===== 摆放常量（乐手 root 空间：+Z 正面、+Y 上、地面 y = 0、+X = 角色左侧；舞台上的片段 root 原点 = 舞台台面）=====
//   JAZZ_STAGE      舞台：台面高 0.45 m（台口在乐手前方 z +1.2，观众席在台下 z +2.5 起）；trumpetPlay / Solo、saxPlay / Solo、bassPlay、drumPlay、
//                   pianoPlay、bow、tuneUp、fakeSoulSuck 都在台上演（root 原点 = 台面）。
//   JAZZ_PIANO      立式钢琴（buildUprightPiano，琴背朝 −Z，转 π 摆在乐手正前方）：白键面高 y 0.742、白键前沿 z 0.40、键深 0.15、
//                   白键宽 (1.48 − 0.11) / 52 ≈ 0.0263、中央 C 在 x 0；钢琴原点（底面中心）在乐手 root [0, 0, 0.695]、rotation.y = π。
//   JAZZ_BENCH      琴凳：凳面高 0.48、凳面中心 z −0.02（坐着时髋关节 y ≈ 0.60）、宽 0.9 × 深 0.36。
//   JAZZ_STAND      谱架（buildMusicStand，高 1.15）：放在乐手左前 [0.78, 0, 0.5]、朝乐手转 −0.9 rad（不挡手、不挡观众看乐手）。
//   JAZZ_BAR        吧台：台面高 1.05、近边 z 0.34；啤酒杯（buildBeerMug，底心）放在 JAZZ_MUG_AT = [−0.16, 1.05, 0.44]（右手边）。
//   JAZZ_CCTV       监控探头：右上方墙角 [−1.6, 2.6, 1.4]（glanceCamera 看它）。
//   JAZZ_EXIT_DIR   指出口的方向（pointDirection）：角色左侧略偏前 [0.92, 0.12, 0.2]（往后指手臂会扫进背后——不做；靠转头 + 上身左转示意方向）。
//   argueReconcile  三人：头儿在原点朝 +Z；萨克斯在 [0.40, 0, 0.55] 朝 −X（rotation.y = −π/2）、低音提琴在 [−0.42, 0, 0.55] 朝 +X（π/2），两人面对面吵；
//                   头儿两手按在萨克斯右肩（JAZZ_ARGUE.shoulderSax）/ 低音提琴左上臂（JAZZ_ARGUE.armBass，琴身压着肩，按上臂外侧）。
// ===== 层高对照（chefLayout / infiniteL5 餐厅格）=====
//   L5 hotel 普通层高 WALL_H.hotel = 3.30 m；餐厅（dining 大厅，厨师阶段 3 的餐厅格）是挑高格 ceiling = 1 → tallCeilH = 3.30 × 1.75 = 5.78 m（单层；多层图更高）。
//   最高的低音提琴头 2.44 m + 舞台 0.45 = 2.89 m；bassPlay 左手按指板最高处 ≈ 2.1 + 0.45 = 2.55 m、bow / fakeSoulSuck 举臂 ≈ 2.3 + 0.45 m，
//   都低于 5.78 m（离天花 > 2.8 m），连普通 3.30 m 层高也不顶（余 0.41 m）。舞台不用降低；吊灯不要挂在舞台正上方 2.9 m 以下。
//
// 结构（同厨师）：
//   · 姿态量都在 root 骨空间，可线性混合；躯干 / 颈 / 头为欧拉角（YXZ，x+ = 前屈、y+ = 向角色左转、z+ = 向角色右歪）。
//   · 手臂：两骨 IK（腕目标 t / 掌心 pp + 肘极向），手朝向 = root 空间四元数；手指 = 15 个绝对屈曲角（fl，0 = 建模静止手形）+ 拇指外展 tab。
//     抬臂自动耸肩（锁骨随腕高抬起，减轻肩头拉伸）。
//   · 「按自己的头」：片段在姿态时用躯干 FK 预测头骨变换，把乐器上的活塞 / 按键 / 弦点换到 root 空间当手的目标；apply 时头若被二阶晃动，
//     按「实际头 ∘ 预测头⁻¹」把手目标跟着搬（ht 权重）——手永远贴着自己的头。
//   · 指尖接触（tips）：一组手指各自的指尖目标（活塞顶 / 萨克斯键面 / 低音弦 / 琴键），apply 里逐指解「外展 + 掌指屈 + 指间屈」（高斯牛顿 3×3），
//     按下量 press 同时驱动乐器骨（活塞下行 18 mm、萨克斯键压 4 mm、弦被按下）；check:jazz-anim 查指尖到目标距离。
//   · 腿：脚掌点 + 两骨 IK；步态支撑相脚锁（不滑步）；关键帧间重新站位自动抬脚迈小步。
//   · 二阶（apply 里按 dt 推进；预览 / 截图用 animateJazzPreroll）：
//       头惯性：头顶点位移弹簧 → 头骨小转角（低音提琴头重：1.5 Hz、增益大、走路时沉甸甸地晃；其余 2.6 Hz）；
//       下摆骨 hemL/R：跟大腿 + 弹簧滞后；乐器：弦振动（4 根，按拨弦包络 × 高频）、镲颤（cymL/R，阻尼摆）、鼓皮震（drumHead）、
//       活塞弹起 / 萨克斯键回弹（按下量带回弹过冲）。
//   · 道具：啤酒杯（片段里挂右手 / 放吧台）+ 倒酒液流；假吸魂的「魂雾」（观众席升起、流向乐器口，又散掉——假的）。本文件自建、挂 root。
import * as THREE from 'three'
import type { JazzRig, JazzArm } from './jazzMesh'
import { makeJazzBody } from './jazzBody'
import { makeJazzRig, TRUMPET, SAX, SNARE, saxKeyPos, saxAxis, bassStringEnds, BASS, BASS_TOPZ, type JazzWho, type V3, type JazzRigDef } from './jazzRig'

export type JazzClip =
  | 'trumpetPlay' | 'trumpetSolo' | 'saxPlay' | 'saxSolo' | 'bassPlay' | 'drumPlay' | 'pianoPlay'
  | 'bow' | 'tuneUp' | 'fakeSoulSuck'
  | 'idleSway' | 'walk' | 'drinkBeer' | 'holdHead' | 'talkGesture' | 'leanFamiliar' | 'pointDirection' | 'glanceCamera' | 'argueReconcile'
  | 'packUp' | 'trueSoulSuck'
export interface JazzClipInfo { dur: number; loop: boolean; zh: string; blend: number; speed?: number; who?: JazzWho; stage?: boolean; seated?: boolean }
export const JAZZ_CLIPS: Record<JazzClip, JazzClipInfo> = {
  trumpetPlay: { dur: 4.0, loop: true, zh: '小号演奏（右手按头顶活塞）', blend: 0.35, who: 'leader', stage: true },
  trumpetSolo: { dur: 6.0, loop: false, zh: '小号独奏（后仰吹高音）', blend: 0.35, who: 'leader', stage: true },
  saxPlay: { dur: 4.0, loop: true, zh: '萨克斯演奏（头前倾按键）', blend: 0.35, who: 'sax', stage: true },
  saxSolo: { dur: 6.0, loop: false, zh: '萨克斯独奏（后仰 → 蹲身高潮）', blend: 0.35, who: 'sax', stage: true },
  bassPlay: { dur: 4.0, loop: true, zh: '低音提琴（左手按弦 · 右手拨弦）', blend: 0.35, who: 'bass', stage: true },
  drumPlay: { dur: 4.0, loop: true, zh: '鼓自奏（两手响指 · 点头摇摆）', blend: 0.35, who: 'drum', stage: true },
  pianoPlay: { dur: 4.0, loop: true, zh: '鼓手弹立式钢琴', blend: 0.4, who: 'drum', stage: true, seated: true },
  bow: { dur: 3.6, loop: false, zh: '谢幕鞠躬', blend: 0.3, stage: true },
  tuneUp: { dur: 4.8, loop: false, zh: '调音', blend: 0.3, stage: true },
  fakeSoulSuck: { dur: 4.0, loop: false, zh: '假吸魂（举臂向观众）', blend: 0.25, stage: true },
  idleSway: { dur: 4.0, loop: true, zh: '台下待着·随拍摇', blend: 0.4 },
  walk: { dur: 1.15, loop: true, zh: '走路', blend: 0.3, speed: 0.8 },
  drinkBeer: { dur: 6.0, loop: false, zh: '喝啤酒（倒进领口）', blend: 0.3 },
  holdHead: { dur: 5.0, loop: true, zh: '双手扶稳琴身·歪头活动被压酸的脖子', blend: 0.35, who: 'bass' },
  talkGesture: { dur: 4.0, loop: true, zh: '聊天比划', blend: 0.35 },
  leanFamiliar: { dur: 4.0, loop: false, zh: '凑近：「你看着面熟」', blend: 0.3 },
  pointDirection: { dur: 3.6, loop: false, zh: '指方向', blend: 0.3 },
  glanceCamera: { dur: 4.0, loop: false, zh: '瞄监控·心虚（立正装没事）', blend: 0.2 },
  argueReconcile: { dur: 6.0, loop: false, zh: '吵架·被头儿按肩劝和', blend: 0.3 },
  // [修 E197 阶段 3] 告发之后：瞪你、摇头 → 收起谱架上的乐谱、按在胸前 → 下台离场（walk）；回来以后的真吸魂（僵直前伸、一下下往回抽）
  packUp: { dur: 4.4, loop: false, zh: '收拾离场（瞪你 · 摇头 · 收谱）', blend: 0.3 },
  trueSoulSuck: { dur: 4.0, loop: false, zh: '真吸魂（僵直前伸 · 一下下往回抽）', blend: 0.3, stage: true },
}
// ---------- 摆放常量（root 空间；见文件头）----------
export const JAZZ_STAGE = { h: 0.45, edgeZ: 1.2, audienceZ: 2.5 }
export const JAZZ_PIANO = { keyY: 0.742, keyZ: 0.4, keyD: 0.15, ww: (1.48 - 0.11) / 52, origin: [0, 0, 0.695] as V3, ry: Math.PI }
export const JAZZ_BENCH = { y: 0.48, z: -0.02, w: 0.9, d: 0.36 }
export const JAZZ_STAND: V3 = [0.78, 0, 0.5]
export const JAZZ_BAR = { y: 1.05, z: 0.34 }
export const JAZZ_MUG_AT: V3 = [-0.16, 1.05, 0.44]
export const JAZZ_CCTV: V3 = [-1.6, 2.6, 1.4]
export const JAZZ_EXIT_DIR: V3 = [0.92, 0.12, 0.2]
export const JAZZ_CEILING = { hotel: 3.3, dining: 3.3 * 1.75 }
export const JAZZ_ARGUE = {
  sax: { p: [0.4, 0, 0.55] as V3, ry: -Math.PI / 2 }, bass: { p: [-0.42, 0, 0.55] as V3, ry: Math.PI / 2 },
  /** 头儿手掌目标（头儿 root 空间）：萨克斯右肩顶 / 低音提琴左上臂外侧 */
  shoulderSax: [0.415, 1.505, 0.37] as V3, armBass: [-0.43, 1.33, 0.33] as V3,
}

type Q4 = [number, number, number, number]
/** 指尖接触组：set 名（valves / saxL / saxR / bassL / bassR / pianoL / pianoR / none）、权重、每指按下量（0..1，对应 fingers 顺序）、额外参数 a（弦位置 / 琴键号） */
export interface JTips { set: string; w: number; press: number[]; a: number[] }
export interface JArmPose {
  t: V3; pole: V3; hq: Q4; hw: number
  fl: number[]; tab: number
  clav: V3
  /** 掌心目标：pk 0 = 掌心表面、1 = 拳心 */
  pp: V3; pw: number; pk: number
  /** 头跟随权重（目标是按预测头位置算的，apply 时随实际头搬） */
  ht: number
  /** 有意贴着衣身（0..1）：避让间隙按贴合目标放宽（连续，不跳变） */
  touch: number
  tips: JTips
}
export interface JLegPose { p: V3; ph: number; yw: number; tf: number }
export interface JInstPose {
  /** 小号活塞按下量（0..1）；萨克斯 6 键 + 八度键 + 侧键；弦振幅包络（m）；鼓皮 / 左右镲激励（0..1） */
  valve: number[]; key: number[]; oct: number; keyS: number; str: number[]; drum: number; cymL: number; cymR: number
}
export interface JPropsPose {
  /** 啤酒杯：0 不显示；1 在右手里；2 放在吧台 JAZZ_MUG_AT；倾角（rad，往前倒）；倒酒流 0..1 */
  mug: number; mugTilt: number; pour: number
  /** 假吸魂的雾 0..1（观众席升起 → 流向乐器口）、相位 */
  mist: number; mistK: number
  /** [修] 真吸魂：雾从玩家身上被抽走（opts.mistFrom；颜色 / 方向不同）0..1；收拾离场手里那叠乐谱 0..1 */
  mistReal: number; sheet: number
}
export interface JazzAnimPose {
  root: V3; rootR: V3; hipsP: V3; hipsR: V3; spine: V3; chest: V3; neck: V3; head: V3
  L: JArmPose; R: JArmPose; legL: JLegPose; legR: JLegPose
  inst: JInstPose; props: JPropsPose
  /** 头惯性增益倍数（0 = 关；低音提琴走路时 > 1） */
  headDyn: number
}
export interface JazzAnimOpts {
  seed?: number; dt?: number; time?: number
  /** [修] 注视层：看向 root 空间点 p（头 / 颈叠加转角，限角 + 平滑；play = 演奏中，幅度收小；w 权重 0..1）。不给 = 回正 */
  look?: { p: V3 | null; play?: boolean; w?: number } | null
  /** [修] 真吸魂的源（root 空间：玩家胸口）；不给 = 观众席 */
  mistFrom?: V3 | null
}
/** [修] 注视层限角（rad，相对片段本来的头朝向）/ 平滑（指数趋近速率 1/s + 角速度上限 rad/s）。低音提琴头是一把低音提琴：幅度 ×bassK */
export const JAZZ_LOOK = { yaw: 1.0, pitchUp: 0.3, pitchDown: 0.42, playYaw: 0.14, playPitch: 0.07, bassK: 0.5, neckShare: 0.4, rate: 5, maxSpeed: 3.0 }
/** [修] 魂雾：加性混合的软边丝带（相机朝向的拉丝，宽度两侧 pow 软边）+ 软粒子（圆点径向软边），按视深淡入淡出、丝带两端透明。两次绘制。 */
export const JAZZ_MIST = { strands: 7, segs: 16, motes: 18, opacity: 0.2, width: [0.035, 0.11] as const, soft: 1.7, moteSoft: 2.2, moteSize: [0.07, 0.16] as const, near: 0.5, far: 26, fake: '#bcd8ff', real: '#ff8a6a', realOpacity: 0.3 }

// ---------- 小工具 ----------
const TAU = Math.PI * 2
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x)
const c01 = (x: number) => clamp(x, 0, 1)
const ss = (x: number) => { const t = c01(x); return t * t * (3 - 2 * t) }
const ramp = (t: number, a: number, b: number) => ss((t - a) / (b - a))
const bump = (t: number, a: number, b: number) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI))
const frac = (x: number) => x - Math.floor(x)
const mix = (a: number, b: number, k: number) => a + (b - a) * k
const addV = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const subV = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const sclV = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const nz = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const v3 = (a: V3 | THREE.Vector3) => (a instanceof THREE.Vector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]))
const arr = (v: THREE.Vector3): V3 => [v.x, v.y, v.z]
const qArr = (q: THREE.Quaternion): Q4 => [q.x, q.y, q.z, q.w]
const Q_ID: Q4 = [0, 0, 0, 1]
const hash1 = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }
/** 衰减包络：事件时刻 te 之后 exp(−k·Δ)（周期 per 内的事件列表） */
/** 拍点后一甩（0 起 0 落，连续） */
const flick = (f: number) => Math.exp(-10 * f) * ss(f / 0.06)
/** 平滑周期脉冲：拍点（b = 0）上为 1、拍间为 0，sharp 越大越尖（连续，不跳变） */
const pulse = (b: number, sharp = 3) => Math.pow(0.5 + 0.5 * Math.cos(TAU * b), sharp)
const env = (t: number, hits: number[], k: number, per = 0) => { let e = 0; for (const h of hits) { let d = t - h; if (per > 0) d = ((d % per) + per) % per; if (d >= 0) e = Math.max(e, Math.exp(-k * d)) } return e }
function basisQuat(x0: V3, y0: V3, x1: V3, y1: V3): THREE.Quaternion {
  const mk = (x: V3, y: V3) => { const X = v3(x).normalize(), Y = v3(y); Y.addScaledVector(X, -Y.dot(X)).normalize(); const Z = new THREE.Vector3().crossVectors(X, Y); return new THREE.Matrix4().makeBasis(X, Y, Z) }
  const a = mk(x0, y0), b = mk(x1, y1)
  return new THREE.Quaternion().setFromRotationMatrix(b.multiply(a.transpose()))
}
const eulerQ = (e: V3) => new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2], 'YXZ'))

// ---------- 每人的静止量 ----------
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const
type FName = typeof FINGERS[number]
interface FingerRest { j: V3[]; flex: V3 }
interface WD {
  who: JazzWho; R: JazzRigDef
  JP: (n: string) => V3
  SH: (s: number) => V3; EL: (s: number) => V3; WR: (s: number) => V3
  LU: number; LF: number; LT: number; LS: number
  TOE: V3; ANK: V3; TOE_H: number; FOOT_A: V3; FOOT_H: V3; HIP_Y: number
  palm: Record<number, THREE.Vector3[]>
  fing: Record<number, Record<FName, FingerRest>>
  /** 手坐标系（静止，模型空间）：a 指尖 / r 拇指侧 / d 手背 */
  F: Record<number, { a: V3; r: V3; d: V3 }>
}
const WDC: Partial<Record<JazzWho, WD>> = {}
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
function wd(who: JazzWho): WD {
  if (WDC[who]) return WDC[who]!
  const R = makeJazzRig(who)
  const JP = (n: string): V3 => R.BONES[R.B[n]].pos
  const SN = (s: number) => (s > 0 ? 'L' : 'R')
  const SH = (s: number) => JP('upperArm' + SN(s)), EL = (s: number) => JP('foreArm' + SN(s)), WR = (s: number) => JP('hand' + SN(s))
  const TOE = JP('toeL'), ANK = JP('footL')
  const palm: WD['palm'] = {}, fing = {} as WD['fing'], F = {} as WD['F']
  for (const s of [1, -1]) {
    const H = R.HANDS[s], Fr = H.F
    F[s] = { a: Fr.a, r: Fr.r, d: Fr.d }
    palm[s] = [[0.058, 0.0, -0.013 * (0.75 + 0.25 * R.P.fingerR)], [0.066, 0.0, -0.024 * (0.75 + 0.25 * R.P.fingerR)]].map(([a, r, d]) => v3(addV(addV(sclV(Fr.a, a), sclV(Fr.r, r)), sclV(Fr.d, d))))
    const o = {} as Record<FName, FingerRest>
    for (const f of H.fingers) o[f.name as FName] = { j: f.joints.map((p) => subV(p, WR(s))), flex: f.flex }
    fing[s] = o
  }
  const d: WD = {
    who, R, JP, SH, EL, WR,
    LU: dist(EL(1), SH(1)), LF: dist(WR(1), EL(1)), LT: dist(JP('shinL'), JP('thighL')), LS: dist(JP('footL'), JP('shinL')),
    TOE, ANK, TOE_H: TOE[1], FOOT_A: subV(ANK, TOE), FOOT_H: [ANK[0] - TOE[0], -TOE[1], ANK[2] - 0.062 - TOE[2]], HIP_Y: JP('thighL')[1],
    palm, fing, F,
  }
  return (WDC[who] = d)
}
/** 手朝向：手坐标系 a 指尖 / d 手背 → 目标方向（root 空间） */
export function jazzHandQuat(who: JazzWho, s: number, aDir: V3, dDir: V3): Q4 { const F = wd(who).F[s]; return qArr(basisQuat(F.a, F.d, nz(aDir), nz(dDir))) }
const palmLocal = (D: WD, s: number, pk: number) => D.palm[s][0].clone().lerp(D.palm[s][1], c01(pk))

// ---------- 手指：屈曲表 / 手指 FK（手局部）/ 指尖解算 ----------
const REST_FLEX: Record<FName, number[]> = { thumb: [0.05, 0.16, 0.2], index: [0.2, 0.3, 0.18], middle: [0.24, 0.34, 0.2], ring: [0.29, 0.38, 0.22], pinky: [0.34, 0.42, 0.24] }
const FIST: Record<FName, number[]> = { thumb: [0.3, 0.6, 0.5], index: [1.2, 1.3, 0.9], middle: [1.25, 1.35, 0.9], ring: [1.25, 1.35, 0.9], pinky: [1.3, 1.35, 0.9] }
/** curl（每指一个数：0 静止、1 握拳、−1 伸直）→ 15 个绝对角 */
const C = (c: number[]): number[] => FINGERS.flatMap((f, i) => FIST[f].map((v, k) => (c[i] >= 0 ? c[i] * v : Math.max(c[i], -1) * REST_FLEX[f][k])))
const CURL_RELAX = C([0.1, 0.12, 0.15, 0.2, 0.25])
const CURL_SOFT = C([0.2, 0.3, 0.35, 0.42, 0.5])
const CURL_OPEN = C([-0.4, -0.7, -0.65, -0.6, -0.55])
const CURL_SPREAD = C([-0.6, -0.9, -0.9, -0.85, -0.8])
const CURL_GRIP = C([0.85, 0.95, 1, 1, 1])
const CURL_POINT = C([0.7, -0.9, 1, 1, 1])
const CURL_CLAW = C([0.3, 0.55, 0.55, 0.55, 0.55])
const CURL_HOVER = C([0.1, 0.35, 0.38, 0.4, 0.5])
const CURL_SNAP = C([0.5, 0.4, 0.55, 0.9, 0.95])
const CURL_SNAPPED = C([0.25, 0.25, 1.05, 1.0, 1.0])
const _qa = new THREE.Quaternion(), _qf = new THREE.Quaternion()
/** 手指 FK（手骨局部，静止手坐标 = 模型轴）：ang = [外展, 掌指, 近指间, 远指间] → 指尖点 */
function tipLocal(D: WD, s: number, f: FName, ang: number[], out = new THREE.Vector3()): THREE.Vector3 {
  const R = D.fing[s][f], ax = v3(R.flex), dax = v3(D.F[s].d)
  const q = new THREE.Quaternion().setFromAxisAngle(dax, ang[0]).multiply(_qf.setFromAxisAngle(ax, ang[1]))
  const p = v3(R.j[0])
  p.add(v3(subV(R.j[1], R.j[0])).applyQuaternion(q))
  q.multiply(_qa.setFromAxisAngle(ax, ang[2])); p.add(v3(subV(R.j[2], R.j[1])).applyQuaternion(q))
  q.multiply(_qa.setFromAxisAngle(ax, ang[3])); p.add(v3(subV(R.j[3], R.j[2])).applyQuaternion(q))
  return out.copy(p)
}
/** 指尖解算：目标 T（手局部）→ [外展, 掌指, 近指间, 远指间]；远指间 = 0.65 × 近指间。高斯牛顿 + 阻尼，带关节范围 */
function solveFinger(D: WD, s: number, f: FName, T: THREE.Vector3, init: number[]): { ang: number[]; err: number } {
  let x = [0, init[0], init[1]]
  const lo = [-0.5, -0.45, -0.1], hi = [0.5, 1.6, 1.9]
  const ev = (y: number[]) => tipLocal(D, s, f, [y[0], y[1], y[2], 0.65 * y[2]])
  let p = ev(x)
  for (let it = 0; it < 14; it++) {
    const r = T.clone().sub(p)
    if (r.lengthSq() < 1e-8) break
    const Jc: THREE.Vector3[] = []
    for (let k = 0; k < 3; k++) { const y = x.slice(); y[k] += 1e-3; Jc.push(ev(y).sub(p).multiplyScalar(1e3)) }
    // (JᵀJ + λI) Δ = Jᵀ r
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0]
    for (let i = 0; i < 3; i++) { b[i] = Jc[i].dot(r); for (let j = 0; j < 3; j++) A[i][j] = Jc[i].dot(Jc[j]) + (i === j ? 2e-4 : 0) }
    const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    const d0 = det(A); if (Math.abs(d0) < 1e-14) break
    const dx = [0, 1, 2].map((c) => det(A.map((row, i) => row.map((v, j) => (j === c ? b[i] : v)))) / d0)
    x = x.map((v, k) => clamp(v + clamp(dx[k], -0.4, 0.4), lo[k], hi[k]))
    p = ev(x)
  }
  return { ang: [x[0], x[1], x[2], 0.65 * x[2]], err: p.distanceTo(T) }
}

// ---------- 躯干 FK（预测：姿态时求头 / 胸的 root 空间变换；与 apply 的骨骼层级一致）----------
interface Xf { p: THREE.Vector3; q: THREE.Quaternion }
const compose = (P: Xf, off: V3, q: THREE.Quaternion): Xf => ({ p: P.p.clone().add(v3(off).applyQuaternion(P.q)), q: P.q.clone().multiply(q) })
function trunkFK(D: WD, P: JazzAnimPose): Record<'hips' | 'spine' | 'chest' | 'neck' | 'head', Xf> {
  const rootX: Xf = { p: v3(P.root), q: eulerQ(P.rootR) }
  const hips = compose(rootX, addV(D.JP('hips'), P.hipsP), eulerQ(P.hipsR))
  const spine = compose(hips, subV(D.JP('spine'), D.JP('hips')), eulerQ(P.spine))
  const chest = compose(spine, subV(D.JP('chest'), D.JP('spine')), eulerQ(P.chest))
  const neck = compose(chest, subV(D.JP('neck'), D.JP('chest')), eulerQ(P.neck))
  const head = compose(neck, subV(D.JP('head'), D.JP('neck')), eulerQ(P.head))
  return { hips, spine, chest, neck, head }
}
/** 头局部点（相对 head 关节，静止朝向）→ root 空间（按姿态预测） */
const headPt = (H: Xf, local: V3): V3 => arr(v3(local).applyQuaternion(H.q).add(H.p))
const headDir = (H: Xf, d: V3): V3 => arr(v3(d).applyQuaternion(H.q))
const chestPt = (X: Xf, D: WD, model: V3): V3 => arr(v3(subV(model, D.JP('chest'))).applyQuaternion(X.q).add(X.p))

// ---------- 乐器上的接触点（头局部，相对 head 关节）----------
const VALVE_TRAVEL = 0.018, KEY_TRAVEL = 0.004, PAD = 0.0075
/** 小号活塞顶键面（按下量 k） */
const valveTop = (i: number, k: number): V3 => [0, TRUMPET.btnY - 0.0008 - VALVE_TRAVEL * k + 0.003 * (1 - k), TRUMPET.valveZ[i]]
/** 萨克斯主键键面中心与法线（按下量 k） */
function saxKeyFace(i: number, k: number): { p: V3; n: V3 } { const p = saxKeyPos(i); return { p: [p[0], p[1], p[2] + 0.0071 - KEY_TRAVEL * k], n: [0, 0, 1] } }
/** 低音提琴弦 i 上参数 u（0 琴马 … 1 上枕）处的点 + 按下（往面板方向）深度 */
function bassStr(i: number, u: number, dep = 0): V3 { const { a, b } = bassStringEnds(i); const p = addV(a, sclV(subV(b, a), u)); return [p[0], p[1], p[2] - dep] }
/** 钢琴白键 n（中央 C = 0，往右 + / 往左 −；乐手 root 空间，x+ = 角色左；坐着的乐手面朝 +Z，所以右手在 −X）键面上的点 */
const pianoKey = (n: number, k: number): V3 => [-n * JAZZ_PIANO.ww, JAZZ_PIANO.keyY - 0.009 * k, JAZZ_PIANO.keyZ - 0.035]
const TIP_FINGERS: Record<string, FName[]> = {
  valves: ['index', 'middle', 'ring'], saxL: ['index', 'middle', 'ring'], saxR: ['index', 'middle', 'ring'],
  bassL: ['index', 'middle', 'ring'], bassR: ['index', 'middle'], pianoL: ['index', 'middle', 'ring', 'pinky'], pianoR: ['index', 'middle', 'ring', 'pinky'],
}
/** 接触面：圆盘（中心 p、法线 n、半径 r）或线段（p → b，弦）；指尖骨点要落在「面上最近点 + 法线 × 指腹半径」 */
export interface TipSurf { p: V3; n: V3; r: number; b?: V3 }
const tsHead = (H: Xf, p: V3, n: V3, r: number, b?: V3): TipSurf => ({ p: headPt(H, p), n: nz(headDir(H, n)), r, b: b ? headPt(H, b) : undefined })
/** 指尖接触面（root 空间）：H = 头变换（实际或预测） */
export function jazzTipTargets(T: JTips, H: Xf): TipSurf[] {
  const f = TIP_FINGERS[T.set]; if (!f) return []
  const pr = (k: number) => c01(T.press[k] ?? 0)
  switch (T.set) {
    case 'valves': return f.map((_, k) => tsHead(H, valveTop(k, pr(k)), [0, 1, 0], 0.0105))
    case 'saxL': case 'saxR': { const ki = T.set === 'saxL' ? [2, 1, 0] : [5, 4, 3]; return f.map((_, k) => { const F = saxKeyFace(ki[k], pr(k)); return tsHead(H, F.p, F.n, 0.009) }) }
    case 'bassL': { const s0 = clamp(T.a[0] ?? 1, 0, 3), u = T.a[1] ?? 0.6, i0 = Math.floor(s0), i1 = Math.min(3, i0 + 1), w = s0 - i0; const at = (uu: number, d: number) => { const a = bassStr(i0, uu, d), b = bassStr(i1, uu, d); return addV(a, sclV(subV(b, a), w)) }; return f.map((_, k) => { const d = 0.006 * pr(k); return tsHead(H, at(u - 0.055 * k + 0.02, d), [0, 0, 1], 0, at(u - 0.055 * k - 0.02, d)) }) }
    case 'bassR': { const si = T.a[0] ?? 1, u = T.a[1] ?? 0.2; return f.map((_, k) => { const s0 = clamp(si - 0.15 * k, -1, 3); const i0 = clamp(Math.floor(s0), 0, 2), i1 = i0 + 1, w = s0 - i0; const at = (uu: number) => { const a = bassStr(i0, uu), b = bassStr(i1, uu); return addV(a, sclV(subV(b, a), w)) }; return tsHead(H, at(u - 0.05 * k + 0.012), [0, 0, 1], 0, at(u - 0.05 * k - 0.012)) }) }
    case 'pianoL': case 'pianoR': { const base = T.a[0] ?? 0, sp = T.a[1] ?? 1, sg = T.set === 'pianoR' ? 1 : -1; return f.map((_, k) => ({ p: pianoKey(base + sg * k * sp, pr(k)), n: [0, 1, 0] as V3, r: JAZZ_PIANO.ww * 0.38 })) }
  }
  return []
}
/** 接触面上离 x 最近的点 + 法线 × 指腹半径（指尖骨点应在的位置） */
export function jazzTipGoal(S: TipSurf, x: THREE.Vector3 | V3): V3 {
  const X = v3(x as V3)
  let c: THREE.Vector3
  if (S.b) { const a = v3(S.p), ab = v3(S.b).sub(a), t = c01(X.clone().sub(a).dot(ab) / (ab.lengthSq() || 1)); c = a.addScaledVector(ab, t) }
  else { const p = v3(S.p), n = v3(S.n), d = X.clone().sub(p); d.addScaledVector(n, -d.dot(n)); if (d.length() > S.r) d.setLength(S.r); c = p.add(d) }
  return arr(c.addScaledVector(v3(S.n), PAD))
}
const surfCenter = (S: TipSurf): V3 => (S.b ? sclV(addV(S.p, S.b), 0.5) : S.p)

// ---------- 姿态：默认 / 克隆 / 混合 ----------
function restArm(D: WD, s: number): JArmPose {
  const S = D.SH(s), E = D.EL(s), W = D.WR(s)
  const d = nz(subV(W, S)), e = subV(E, S), k = e[0] * d[0] + e[1] * d[1] + e[2] * d[2]
  return { t: [...W], pole: nz(subV(e, sclV(d, k))), hq: [...Q_ID], hw: 0, fl: new Array(15).fill(0), tab: 0, clav: [0, 0, 0], pp: [...W], pw: 0, pk: 0, ht: 0, touch: 0, tips: { set: 'none', w: 0, press: [0, 0, 0, 0, 0], a: [0, 0] } }
}
const INST0: JInstPose = { valve: [0, 0, 0], key: [0, 0, 0, 0, 0, 0], oct: 0, keyS: 0, str: [0, 0, 0, 0], drum: 0, cymL: 0, cymR: 0 }
const PROPS0: JPropsPose = { mug: 0, mugTilt: 0, pour: 0, mist: 0, mistK: 0, mistReal: 0, sheet: 0 }
function restPose(D: WD): JazzAnimPose {
  return {
    root: [0, 0, 0], rootR: [0, 0, 0], hipsP: [0, 0, 0], hipsR: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
    L: restArm(D, 1), R: restArm(D, -1), legL: { p: [D.TOE[0], 0, D.TOE[2]], ph: 0, yw: 0, tf: 1 }, legR: { p: [-D.TOE[0], 0, D.TOE[2]], ph: 0, yw: 0, tf: 1 },
    inst: deepClone(INST0), props: { ...PROPS0 }, headDyn: 1,
  }
}
function deepClone<T>(x: T): T {
  if (Array.isArray(x)) return x.map((v) => deepClone(v)) as unknown as T
  if (x && typeof x === 'object') { const o: Record<string, unknown> = {}; for (const k in x) o[k] = deepClone((x as Record<string, unknown>)[k]); return o as T }
  return x
}
export const cloneJazzPose = (p: JazzAnimPose) => deepClone(p)
function mixAny(a: unknown, b: unknown, k: number, key = ''): unknown {
  if (typeof a === 'number') return a + ((b as number) - a) * k
  if (typeof a === 'string') return k < 0.5 ? a : b
  if (Array.isArray(a)) {
    const bb = b as number[]
    if (key === 'hq' && a.length === 4) {
      const d = a[0] * bb[0] + a[1] * bb[1] + a[2] * bb[2] + a[3] * bb[3], sg = d < 0 ? -1 : 1
      const o = a.map((v: number, i: number) => v + (bb[i] * sg - v) * k), l = Math.hypot(o[0], o[1], o[2], o[3]) || 1
      return o.map((v: number) => v / l)
    }
    return a.map((v: number, i: number) => v + ((bb[i] ?? v) - v) * k)
  }
  const o: Record<string, unknown> = {}; const A = a as Record<string, unknown>, Bb = b as Record<string, unknown>
  for (const kk in A) o[kk] = mixAny(A[kk], Bb[kk], k, kk)
  return o
}
export function mixJazzPose(a: JazzAnimPose, b: JazzAnimPose, k: number): JazzAnimPose {
  if (k <= 0) return deepClone(a)
  if (k >= 1) return deepClone(b)
  const o = mixAny(a, b, k) as JazzAnimPose
  // 接触组：两边不同组时，权重先降到 0 再换组（不把两组目标插值）
  for (const s of ['L', 'R'] as const) {
    const ta = a[s].tips, tb = b[s].tips
    if (ta.set !== tb.set) { o[s].tips = k < 0.5 ? { ...deepClone(ta), w: ta.w * (1 - 2 * k) } : { ...deepClone(tb), w: tb.w * (2 * k - 1) } }
  }
  o.props.mug = k < 0.5 ? a.props.mug : b.props.mug
  return o
}
type DeepPartial<T> = { [K in keyof T]?: T[K] extends number[] ? T[K] : T[K] extends string ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] }
type Part = DeepPartial<JazzAnimPose>
function over(base: JazzAnimPose, p: Part): JazzAnimPose {
  const o = deepClone(base) as unknown as Record<string, unknown>
  const rec = (dst: Record<string, unknown>, src: Record<string, unknown>) => { for (const k in src) { const v = src[k]; if (v === undefined) continue; if (v && typeof v === 'object' && !Array.isArray(v)) rec(dst[k] as Record<string, unknown>, v as Record<string, unknown>); else dst[k] = Array.isArray(v) ? v.slice() : v } }
  rec(o, p as Record<string, unknown>); return o as unknown as JazzAnimPose
}
const merge = (...ps: Part[]): Part => { const o: Record<string, unknown> = {}; const rec = (dst: Record<string, unknown>, src: Record<string, unknown>) => { for (const k in src) { const v = src[k]; if (v && typeof v === 'object' && !Array.isArray(v)) { dst[k] ??= {}; rec(dst[k] as Record<string, unknown>, v as Record<string, unknown>) } else dst[k] = Array.isArray(v) ? v.slice() : v } }; for (const p of ps) rec(o, p as Record<string, unknown>); return o as Part }
/** 关键帧：[[t, partial|函数], …]；段间 smoothstep；重新站位自动抬脚迈小步 */
type KF = [number, Part | ((b: JazzAnimPose) => JazzAnimPose), ((x: number) => number)?]
function keys(t: number, base: JazzAnimPose, ks: KF[]): JazzAnimPose {
  const at = (p: KF[1]) => (typeof p === 'function' ? p(base) : over(base, p))
  if (t <= ks[0][0]) return at(ks[0][1])
  for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) {
    const [t0, a] = ks[i - 1], [t1, b, ez] = ks[i]
    const A = at(a), Bp = at(b), kl = (t - t0) / (t1 - t0)
    const P = mixJazzPose(A, Bp, (ez ?? ss)(kl))
    stepFeet(P, A, Bp, kl)
    return P
  }
  return at(ks[ks.length - 1][1])
}
const STEP_D = 0.012, STEP_YAW = 0.15
function needsStep(a: JLegPose, b: JLegPose) { if (a.p[1] > 0.01 || b.p[1] > 0.01) return false; return Math.hypot(a.p[0] - b.p[0], a.p[2] - b.p[2]) > STEP_D || Math.abs(a.yw - b.yw) > STEP_YAW }
function stepLeg(L: JLegPose, a: JLegPose, b: JLegPose, kl: number, w0: number, w1: number) {
  const u = c01((kl - w0) / (w1 - w0)), e = u * u * u * (u * (6 * u - 15) + 10)
  const d = Math.hypot(a.p[0] - b.p[0], a.p[2] - b.p[2])
  L.p = [mix(a.p[0], b.p[0], e), Math.min(0.06, 0.025 + 0.3 * d) * Math.sin(Math.PI * u), mix(a.p[2], b.p[2], e)]
  L.yw = mix(a.yw, b.yw, e); L.ph = mix(a.ph, b.ph, e) + 0.2 * Math.sin(Math.PI * Math.min(1, u * 1.15)); L.tf = mix(a.tf, b.tf, e)
}
function stepFeet(P: JazzAnimPose, A: JazzAnimPose, B: JazzAnimPose, kl: number) {
  const sL = needsStep(A.legL, B.legL), sR = needsStep(A.legR, B.legR)
  if (sL) stepLeg(P.legL, A.legL, B.legL, kl, 0, sR ? 0.55 : 1)
  if (sR) stepLeg(P.legR, A.legR, B.legR, kl, sL ? 0.45 : 0, 1)
}

// ---------- 手臂摆放小工具（姿态时用预测躯干求目标；都在 root 空间）----------
/** 指尖接触：按预测头算指尖目标 → 以「悬停手形」fl 的指尖平均点对准目标平均点，反推腕位置；手朝向 aDir / dDir 是头局部方向 */
function armTips(D: WD, P: JazzAnimPose, s: number, set: string, press: number[], a: number[], aDirH: V3, dDirH: V3, fl: number[], pole: V3, tab = 0, local = false) {
  const H = trunkFK(D, P).head
  const tips: JTips = { set, w: 1, press: press.slice(), a: a.slice() }
  const T = jazzTipTargets(tips, local ? { p: new THREE.Vector3(), q: new THREE.Quaternion() } : H)
  const fs = TIP_FINGERS[set]
  const aD = local ? aDirH : headDir(H, aDirH), dD = local ? dDirH : headDir(H, dDirH)
  let q = new THREE.Quaternion(...jazzHandQuat(D.who, s, aD, dD))
  // 绕手背法线转一下，让「自然手形的指尖连线」对齐「目标连线」（手指排成一列压在一排键上）
  if (fs.length >= 2) {
    const i0 = FINGERS.indexOf(fs[0]), i1 = FINGERS.indexOf(fs[fs.length - 1])
    const n0 = tipLocal(D, s, fs[0], [0, fl[i0 * 3], fl[i0 * 3 + 1], fl[i0 * 3 + 2]]), n1 = tipLocal(D, s, fs[fs.length - 1], [0, fl[i1 * 3], fl[i1 * 3 + 1], fl[i1 * 3 + 2]])
    const ax = v3(dD).normalize(), rn = n1.sub(n0).applyQuaternion(q), rt = v3(subV(surfCenter(T[fs.length - 1]), surfCenter(T[0])))
    rn.addScaledVector(ax, -rn.dot(ax)); rt.addScaledVector(ax, -rt.dot(ax))
    if (rn.lengthSq() > 1e-8 && rt.lengthSq() > 1e-8) { rn.normalize(); rt.normalize(); const ang = Math.atan2(new THREE.Vector3().crossVectors(rn, rt).dot(ax), rn.dot(rt)); q = new THREE.Quaternion().setFromAxisAngle(ax, ang).multiply(q) }
  }
  const avgL = new THREE.Vector3(), avgT = new THREE.Vector3()
  fs.forEach((f, k) => { const i = FINGERS.indexOf(f); avgL.add(tipLocal(D, s, f, [0, fl[i * 3], fl[i * 3 + 1], fl[i * 3 + 2]])); avgT.add(v3(addV(surfCenter(T[k]), sclV(T[k].n, PAD)))) })
  avgL.multiplyScalar(1 / fs.length).applyQuaternion(q); avgT.multiplyScalar(1 / fs.length)
  const A = s > 0 ? P.L : P.R
  A.t = arr(avgT.sub(avgL)); A.hq = qArr(q); A.hw = 1; A.fl = fl.slice(); A.tab = tab; A.pole = pole; A.pw = 0; A.ht = local ? 0 : 1; A.tips = tips
}
/** 掌心贴在头局部点 lp 上（掌心朝 −dDir） */
function armPalmHead(D: WD, P: JazzAnimPose, s: number, lp: V3, aDirH: V3, dDirH: V3, fl: number[], pole: V3, pk = 0) {
  const H = trunkFK(D, P).head, A = s > 0 ? P.L : P.R
  A.touch = 0; A.pp = headPt(H, lp); A.pw = 1; A.pk = pk; A.hq = jazzHandQuat(D.who, s, headDir(H, aDirH), headDir(H, dDirH)); A.hw = 1; A.fl = fl.slice(); A.tab = 0; A.pole = pole; A.ht = 1
  A.tips = { set: 'none', w: 0, press: [0, 0, 0, 0, 0], a: [0, 0] }
}
/** 掌心贴在 root 空间点上 */
function armPalm(D: WD, P: JazzAnimPose, s: number, pp: V3, aDir: V3, dDir: V3, fl: number[], pole: V3, pk = 0) {
  const A = s > 0 ? P.L : P.R
  A.pp = pp.slice() as V3; A.pw = 1; A.pk = pk; A.touch = 1; A.hq = jazzHandQuat(D.who, s, aDir, dDir); A.hw = 1; A.fl = fl.slice(); A.tab = 0; A.pole = pole; A.ht = 0
  A.tips = { set: 'none', w: 0, press: [0, 0, 0, 0, 0], a: [0, 0] }
}
/** 手腕放在 root 空间点 t，手朝向 aDir / dDir（hw 1）或跟前臂（hw 0） */
function armFree(D: WD, P: JazzAnimPose, s: number, t: V3, pole: V3, fl: number[], aDir?: V3, dDir?: V3, hw = 1) {
  const A = s > 0 ? P.L : P.R
  A.t = t.slice() as V3; A.pole = pole; A.fl = fl.slice(); A.tab = 0; A.pw = 0; A.ht = 0; A.touch = 0
  if (aDir && dDir) { A.hq = jazzHandQuat(D.who, s, aDir, dDir); A.hw = hw } else A.hw = 0
  A.tips = { set: 'none', w: 0, press: [0, 0, 0, 0, 0], a: [0, 0] }
}
/** 垂手时的肘极向（肘尖朝后略外） */
const hangPole = (s: number): V3 => [s * 0.3, 0, -1]
/** [修订 E197 肘] 从垂手过渡到某姿势：极向也从垂手极向渐变过去（原来 k = 0 时就用目标极向——垂着的手肘被拧向外 / 前，
 *  前臂扎进衣身被避让推开，手臂外撇、收手末尾肘部突跳） */
const poleK = (s: number, pole: V3, k: number): V3 => mixV3(hangPole(s), nz(pole), c01(k))
/** 垂手（自然下垂，手在大腿外侧略前） */
function armHang(D: WD, P: JazzAnimPose, s: number, swing = 0, fl = CURL_RELAX) {
  const W = D.WR(s), ch = trunkFK(D, P).chest
  const t = chestPt(ch, D, [W[0] + s * 0.03, W[1] + 0.02 + 0.02 * Math.abs(swing), W[2] + 0.03 + 0.1 * swing])
  armFree(D, P, s, t, hangPole(s), fl, undefined, undefined, 0)
}
/** 手朝向：拇指方向 r（握柄：柄沿 r 轴从拳眼穿出）+ 大致指尖方向 a（投到 r 的法平面） */
function hAR(D: WD, s: number, a: V3, r: V3): Q4 {
  const R = nz(r); let A = nz(a); A = nz(subV(A, sclV(R, A[0] * R[0] + A[1] * R[1] + A[2] * R[2])))
  const Fr = D.F[s], qa = basisQuat(Fr.a, Fr.r, A, R)
  return qArr(qa)
}
/** 四元数 → (指尖方向, 手背方向)，给 armFree */
function dirsOf(q: Q4, D: WD, s: number): [V3, V3] { const Q = new THREE.Quaternion(...q), F = D.F[s]; return [arr(v3(F.a).applyQuaternion(Q)), arr(v3(F.d).applyQuaternion(Q))] }
/** 垂手位置（跟预测胸；不改姿态） */
function hangT(D: WD, P: JazzAnimPose, s: number): V3 { const W = D.WR(s); return chestPt(trunkFK(D, P).chest, D, [W[0] + s * 0.03, W[1] + 0.02, W[2] + 0.03]) }
/** 胸前某点（模型静止坐标）→ 跟着预测胸走 */
const onChest = (D: WD, P: JazzAnimPose, m: V3): V3 => chestPt(trunkFK(D, P).chest, D, m)
/** 静止衣身表面点：从 o（衣身里面）沿 dir 往外找 coatCore 的零点，再外偏 off；返回 [点, 外法线]（静止坐标） */
function surfRest(D: WD, o: V3, dir: V3, off = 0): [V3, V3] {
  const f = coreOf(D), d = nz(dir)
  let lo = 0, hi = 0.6
  for (let k = 0; k < 32; k++) { const m = (lo + hi) / 2, p = addV(o, sclV(d, m)); if (f(p[0], p[1], p[2]) < 0) lo = m; else hi = m }
  const p = addV(o, sclV(d, lo)), e = 0.004
  const n = nz([f(p[0] + e, p[1], p[2]) - f(p[0] - e, p[1], p[2]), f(p[0], p[1] + e, p[2]) - f(p[0], p[1] - e, p[2]), f(p[0], p[1], p[2] + e) - f(p[0], p[1], p[2] - e)])
  return [addV(p, sclV(n, off)), n]
}
/** 静止坐标点 / 方向 → 跟着预测躯干（按静止高度选 hips / spine / chest） */
function onTrunk(D: WD, P: JazzAnimPose, m: V3, dir?: V3): [V3, V3] {
  const X = trunkFK(D, P), n = m[1] < D.JP('spine')[1] - 0.04 ? 'hips' : m[1] > D.JP('chest')[1] - 0.03 ? 'chest' : 'spine'
  const b = X[n], p = arr(v3(subV(m, D.JP(n))).applyQuaternion(b.q).add(b.p))
  return [p, dir ? arr(v3(dir).applyQuaternion(b.q)) : [0, 0, 0]]
}
/** 二次贝塞尔（a → 经 m → b） */
const via = (a: V3, m: V3, b: V3, k: number): V3 => { const u = 1 - k; return [u * u * a[0] + 2 * u * k * m[0] + k * k * b[0], u * u * a[1] + 2 * u * k * m[1] + k * k * b[1], u * u * a[2] + 2 * u * k * m[2] + k * k * b[2]] }
/** 掌心（pk）在 pp、手朝向 hq 时的腕位置 */
const palmToWrist = (D: WD, s: number, pp: V3, hq: Q4, pk = 0): V3 => arr(v3(pp).sub(palmLocal(D, s, pk).applyQuaternion(new THREE.Quaternion(...hq))))
/** 手从「垂手」经 mid 移到掌心贴 pp（k 0..1）：沿贝塞尔走，朝向从跟前臂过渡到 aDir / dDir */
function armPalmVia(D: WD, P: JazzAnimPose, s: number, k: number, pp: V3, aDir: V3, dDir: V3, fl: number[], pole: V3, mid: V3, pk = 0, flFrom = CURL_RELAX, contact = true) {
  armHang(D, P, s)
  const A = s > 0 ? P.L : P.R, start = A.t.slice() as V3
  const hq = jazzHandQuat(D.who, s, aDir, dDir), end = palmToWrist(D, s, pp, hq, pk)
  armFree(D, P, s, via(start, mid, end, ss(k)), poleK(s, pole, ss(k)), mixFl(flFrom, fl, k), aDir, dDir, ss(k))
  if (contact) A.touch = ss(k)
  if (k >= 0.999 && contact) { A.pp = pp.slice() as V3; A.pw = 1; A.pk = pk; A.t = end }
}

// ---------- 站姿 / 呼吸 / 律动 ----------
const BEAT = 0.5 // 120 bpm
function stance(D: WD, w = 1): Part {
  const x = D.TOE[0] * 1.15 * w
  return { legL: { p: [x, 0, D.TOE[2] + 0.01], yw: 0.12, ph: 0, tf: 1 }, legR: { p: [-x, 0, D.TOE[2] - 0.01], yw: -0.1, ph: 0, tf: 1 } }
}
const breathe = (P: JazzAnimPose, u: number, cycles: number, k = 1) => {
  const br = Math.sin(u * TAU * cycles) * k
  P.chest[0] -= 0.012 * br; P.spine[0] -= 0.005 * br; P.hipsP[1] += 0.0015 * br
  P.L.clav = addV(P.L.clav, [0, 0, 0.008 * br]); P.R.clav = addV(P.R.clav, [0, 0, -0.008 * br])
}
/** 随拍律动：膝弹（髋下沉）+ 左右摆 + 头点（点在拍上） */
function groove(P: JazzAnimPose, t: number, k: number, sway = 1, nod = 1) {
  const bp = t / BEAT, b = frac(bp)
  P.hipsP[1] -= 0.016 * k * pulse(b, 2) // 拍点上膝一弹（最低）
  const sw = Math.sin((t / (BEAT * 2)) * Math.PI) * sway * k
  P.hipsP[0] += 0.02 * sw; P.hipsR[2] -= 0.04 * sw; P.spine[2] += 0.03 * sw; P.chest[2] += 0.025 * sw; P.chest[1] += 0.03 * sw
  P.neck[0] += 0.05 * nod * k * pulse(b, 4) - 0.012 * nod * k
}

// ---------- 步态 ----------
interface GaitSpec { D: number; duty: number; lift: number; width: number; heelOff: number; toeOff: number; strike: number; toeOut: number }
function gaitLegs(D: WD, P: JazzAnimPose, u: number, G: GaitSpec) {
  for (const [leg, s, off] of [[P.legL, 1, 0], [P.legR, -1, 0.5]] as [JLegPose, number, number][]) {
    const ph = frac(u + off), sweep = G.D * G.duty
    let z: number, y = 0, pitch = 0
    if (ph < G.duty) { const k = ph / G.duty; z = sweep * (0.5 - k); pitch = -G.strike * (1 - ss(k / 0.16)) + G.heelOff * ss((k - 0.65) / 0.35) }
    else {
      const k = (ph - G.duty) / (1 - G.duty), e = k * k * k * (k * (6 * k - 15) + 10)
      z = -0.5 * sweep + G.D * (e - (1 - G.duty) * k)
      y = G.lift * Math.sin(Math.PI * k) * (k < 0.15 ? 0.6 + 0.4 * (k / 0.15) : 1)
      pitch = G.toeOff * (1 - ss(k / 0.45)) - G.strike * ss((k - 0.6) / 0.4)
    }
    leg.p = [s * G.width, y, D.TOE[2] + z]; leg.ph = pitch; leg.tf = ph < G.duty ? 1 : 1 - 0.6 * ss((ph - G.duty) / (1 - G.duty) / 0.35); leg.yw = s * G.toeOut
  }
}

// ---------- 片段 ----------
export function jazzPose(who: JazzWho, clip: JazzClip, t: number, o: JazzAnimOpts = {}): JazzAnimPose {
  const C0 = JAZZ_CLIPS[clip], D = wd(who)
  t = C0.loop ? frac(t / C0.dur) * C0.dur : clamp(t, 0, C0.dur)
  const u = t / C0.dur, seed = o.seed ?? 1
  const B0 = over(restPose(D), merge(stance(D), { hipsP: [0, -0.012, 0], neck: [0.02, 0, 0], head: [0.0, 0, 0] }))
  let P: JazzAnimPose
  switch (clip) {
    case 'trumpetPlay': P = trumpetPose(D, B0, t, false); break
    case 'trumpetSolo': P = trumpetPose(D, B0, t, true); break
    case 'saxPlay': P = saxPose(D, B0, t, false); break
    case 'saxSolo': P = saxPose(D, B0, t, true); break
    case 'bassPlay': P = bassPose(D, B0, t); break
    case 'drumPlay': P = drumPose(D, B0, t); break
    case 'pianoPlay': P = pianoPose(D, B0, t); break
    case 'bow': P = bowPose(D, B0, t); break
    case 'tuneUp': P = tunePose(D, B0, t); break
    case 'fakeSoulSuck': P = soulPose(D, B0, t); break
    case 'idleSway': P = idlePose(D, B0, t, u, seed); break
    case 'walk': P = walkPose(D, B0, u); break
    case 'drinkBeer': P = beerPose(D, B0, t); break
    case 'holdHead': P = holdPose(D, B0, u); break
    case 'talkGesture': P = talkPose(D, B0, t, u, seed); break
    case 'leanFamiliar': P = leanPose(D, B0, t); break
    case 'pointDirection': P = pointPose(D, B0, t); break
    case 'glanceCamera': P = glancePose(D, B0, t); break
    case 'argueReconcile': P = arguePose(D, B0, t); break
    case 'packUp': P = packPose(D, B0, t); break
    case 'trueSoulSuck': P = trueSoulPose(D, B0, t); break
  }
  return P
}
/** 根运动（root 空间 [dx, dz]）：walk 匀速前进 */
export function jazzRootMotion(clip: JazzClip, t0: number, t1: number): [number, number] {
  const C0 = JAZZ_CLIPS[clip]
  if (!C0.speed) return [0, 0]
  return [0, C0.speed * (t1 - t0)]
}

// ---- 小号（头儿）：右手三指按头顶活塞、左手掌托活塞套管（左侧）----
/** 指法序列（每八分音符一个：三个活塞的按下组合） */
const FINGERING = [[0, 0, 0], [1, 0, 1], [1, 1, 0], [0, 1, 0], [1, 0, 0], [1, 1, 1], [0, 1, 1], [0, 0, 0]]
function valvePress(t: number, rate: number, seed: number): number[] {
  const n = t / rate, i = Math.floor(n), f = n - i
  const cur = FINGERING[(i * 3 + seed) % FINGERING.length], nxt = FINGERING[((i + 1) * 3 + seed) % FINGERING.length]
  // 每个音符：快速按下（20% 时间）→ 停 → 下一个音若松开则在末尾 15% 抬起
  // [修订 E197 肘] 快句（每音 0.125 s）时 15% 只有 19 ms ≈ 1 帧：三个活塞一帧弹起 18 mm，整只手跟着弹、肘一帧突跳 13 mm——换指至少 35 ms
  const w = Math.max(0.15, 0.035 / rate), f0 = 1 - w
  return cur.map((c, k) => { const n2 = nxt[k]; if (c === n2) return c; return c ? 1 - ss((f - f0) / w) : ss((f - f0) / w) })
}
/** 头儿左手托活塞套管左侧：掌心离套管 2.2 cm、手指轻搭（不扣进套管之间） */
const LEADER_LPALM: V3 = [TRUMPET.valveR + 0.03, 0.09, 0.015]
const LEADER_LCURL = C([-1, -0.9, -0.85, -0.75, -0.6])
/** [修订 E197 肘] 左手托套管：指尖朝上偏前（原来朝正前 → 前臂只能从后上方横过来：肘高高往后翘成鸡翅、前臂扭 160°+）；肘尖朝外下前 */
const LEADER_LA: V3 = [0.1, 1, 0.1], LEADER_LD: V3 = [1, 0, -0.1], LEADER_LPOLE: V3 = [0.7, -1, 0.35]
function trumpetPose(D: WD, B0: JazzAnimPose, t: number, solo: boolean): JazzAnimPose {
  let P: JazzAnimPose
  if (!solo) {
    P = over(B0, { chest: [-0.06, 0, 0], spine: [-0.02, 0, 0], neck: [-0.08, 0, 0], head: [-0.12, 0, 0] })
    groove(P, t, 1, 0.8, 0.7)
    breathe(P, t / 4, 2, 0.6)
  } else {
    // 0–1.4 吹着走向前（身体前探）→ 1.4–3.2 后仰、喇叭口朝天（高音）、膝微屈 → 3.2–4.6 顶住长音（轻颤）→ 4.6–6 收、回正
    const LEAN: Part = { hipsP: [0, -0.01, 0.01], hipsR: [0.04, 0, 0], spine: [0.06, 0, 0], chest: [0.08, 0.05, 0], neck: [0.1, 0, 0], head: [0.12, 0, 0] }
    const BACK: Part = { hipsP: [0, -0.06, 0.05], hipsR: [-0.12, 0, 0], spine: [-0.16, 0, 0], chest: [-0.2, -0.04, 0], neck: [-0.25, 0, 0], head: [-0.35, 0, 0.0], legL: { ph: 0 }, legR: { ph: 0 } }
    const HOLD: Part = merge(BACK, { hipsP: [0, -0.075, 0.06], chest: [-0.24, -0.06, 0.03], head: [-0.42, 0, 0.05] })
    P = keys(t, B0, [[0, LEAN], [1.4, LEAN], [2.4, BACK], [3.2, HOLD], [4.6, HOLD], [5.6, { chest: [-0.06, 0, 0], head: [-0.12, 0, 0] }], [6, { chest: [-0.06, 0, 0], head: [-0.12, 0, 0] }]])
    const vib = ramp(t, 3.2, 3.5) * (1 - ramp(t, 4.5, 4.7))
    P.head[0] += 0.012 * vib * Math.sin(t * TAU * 6); P.chest[0] += 0.006 * vib * Math.sin(t * TAU * 6 + 1)
    groove(P, t, 1 - ramp(t, 1.6, 2.4) + ramp(t, 4.8, 5.6), 0.8, 0.7)
    breathe(P, t / 6, 2, 0.5)
  }
  // 右手：从角色右侧伸到头顶，三指自上压活塞（手背朝上、指尖朝 +X）
  const rate = solo ? (t > 1.4 && t < 3.2 ? 0.125 : t >= 3.2 && t < 4.6 ? 1.4 : 0.25) : 0.25
  const pr = solo && t >= 3.2 && t < 4.6 ? [1, 0, 1] : valvePress(t, rate, solo ? 2 : 0)
  armTips(D, P, -1, 'valves', pr, [0, 0], [1, -0.32, 0.05], [0.0, 1, 0.0], CURL_HOVER, [-0.8, -0.45, -0.35], 0.3)
  // 左手：掌心贴活塞套管左侧，四指朝前包住
  // [修订 E197 肘] 独奏后仰（喇叭口朝天）时套管转到肩后，左手还扣着套管 → 腕目标贴到肩头（肩腕距 < 10 cm）、肘在前后两个解之间来回翻（一帧 0.9 m 突跳）。
  // 改：后仰吹高音时左手松开套管、向身侧打开（掌心朝前，独奏亮相），回正后再扶回套管
  armPalmHead(D, P, 1, LEADER_LPALM, LEADER_LA, LEADER_LD, LEADER_LCURL, LEADER_LPOLE)
  const bk = solo ? ramp(t, 1.5, 2.4) * (1 - ramp(t, 4.6, 5.6)) : 0
  if (bk > 0) {
    const A = P.L, start = palmToWrist(D, 1, A.pp, A.hq), q0 = new THREE.Quaternion(...A.hq), k = ss(bk)
    const ch = trunkFK(D, P).chest
    const q1 = new THREE.Quaternion(...jazzHandQuat(D.who, 1, arr(v3([0.75, 0.45, 0.35]).applyQuaternion(ch.q)), arr(v3([0.1, 0.25, -1]).applyQuaternion(ch.q))))
    A.t = via(start, onChest(D, P, [0.34, D.JP('chest')[1] + 0.14, 0.36]), onChest(D, P, [0.44, D.JP('chest')[1] + 0.08, 0.18]), k)
    A.pw = 0; A.ht = 1 - k; A.touch = 0; A.hq = qArr(q0.slerp(q1, k)); A.hw = 1
    A.fl = mixFl(LEADER_LCURL, CURL_OPEN, k); A.pole = mixV3(LEADER_LPOLE, arr(v3([0.35, -0.6, -1]).applyQuaternion(ch.q)), k)
  }
  P.L.clav = [0, -0.05, 0.05]; P.R.clav = [0, 0.06, -0.08]
  P.inst.valve = pr.slice()
  P.headDyn = 0.5
  return P
}

// ---- 萨克斯：头前倾，两手按侧前方按键（左手下组 1–3、右手上组 4–6）----
const SAX_PAT = [[1, 1, 1, 0, 0, 0], [1, 1, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0], [1, 1, 1, 1, 0, 0], [1, 1, 1, 1, 1, 0], [0, 1, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1], [0, 0, 0, 0, 0, 0]]
function saxPress(t: number, rate: number): number[] {
  const n = t / rate, i = Math.floor(n), f = n - i
  const cur = SAX_PAT[(i * 5) % SAX_PAT.length], nxt = SAX_PAT[((i + 1) * 5) % SAX_PAT.length]
  return cur.map((c, k) => { const n2 = nxt[k]; if (c === n2) return c; return c ? 1 - ss((f - 0.85) / 0.15) : ss((f - 0.85) / 0.15) })
}
/** [修订 E197 肘] 萨克斯两手：手背朝前上（手从键上方盖下来按；原来手背正朝前 → 前臂要扭 110°+，腕部拧成糖果纸、右肘被转向身体） */
const SAX_LA: V3 = [-1, 0.05, -0.25], SAX_LD: V3 = [0.15, 0.5, 1], SAX_RA: V3 = [1, 0.05, -0.25], SAX_RD: V3 = [-0.15, 0.15, 1]
function saxPose(D: WD, B0: JazzAnimPose, t: number, solo: boolean): JazzAnimPose {
  // 头前倾（颈 + 头共 ~0.95 rad），胸微含：按键落到胸 / 下巴前
  const PLAY: Part = { chest: [0.12, 0, 0], spine: [0.04, 0, 0], neck: [0.42, 0, 0], head: [0.48, 0, 0], hipsP: [0, -0.01, -0.01] }
  let P: JazzAnimPose
  if (!solo) {
    P = over(B0, PLAY)
    groove(P, t, 1, 1.2, 0.6)
    breathe(P, t / 4, 2, 0.6)
    // 身体随乐句左右转（拿乐器的人常见）
    P.chest[1] += 0.08 * Math.sin((t / 2) * Math.PI); P.hipsR[1] -= 0.03 * Math.sin((t / 2) * Math.PI)
  } else {
    // 0–1.5 演奏 → 1.5–2.6 后仰（喇叭口朝天）→ 2.6–3.4 顶住 → 3.4–4.6 蹲身、上身前压（高潮）→ 4.6–6 起身回演奏
    const BACK: Part = { hipsP: [0, -0.05, 0.05], hipsR: [-0.1, 0, 0], spine: [-0.12, 0, 0], chest: [-0.14, 0, 0], neck: [0.0, 0, 0], head: [-0.2, 0, 0] }
    const CROUCH: Part = {
      hipsP: [0, -0.3, -0.1], hipsR: [0.48, 0, 0], spine: [0.2, 0, 0], chest: [0.16, 0.06, 0], neck: [0.28, 0, 0], head: [0.4, 0, 0],
      legL: { p: [D.TOE[0] * 1.6, 0, D.TOE[2] + 0.06], yw: 0.35 }, legR: { p: [-D.TOE[0] * 1.6, 0, D.TOE[2] + 0.02], yw: -0.3 },
    }
    P = keys(t, B0, [[0, PLAY], [1.5, PLAY], [2.4, BACK], [3.2, BACK], [4.0, CROUCH], [4.7, CROUCH], [5.6, PLAY], [6, PLAY]])
    groove(P, t, 1 - ramp(t, 1.5, 2.2) * (1 - ramp(t, 4.9, 5.6)), 1.2, 0.6)
    const sh = ramp(t, 4.0, 4.2) * (1 - ramp(t, 4.6, 4.9))
    P.chest[0] += 0.03 * sh * Math.sin(t * TAU * 4); P.head[2] += 0.04 * sh * Math.sin(t * TAU * 2)
    breathe(P, t / 6, 2, 0.5)
  }
  const pr = saxPress(t, solo && t > 3.6 && t < 4.8 ? 0.125 : 0.25)
  // 键面法线（头局部 +Z）→ 手背朝外；手指横过琴身（左手指尖朝 −X、右手朝 +X），四指沿琴身排开（拇指侧朝上）
  armTips(D, P, 1, 'saxL', pr.slice(0, 3), [0, 0], SAX_LA, SAX_LD, CURL_HOVER, [0.9, -0.6, -0.2], 0.25)
  armTips(D, P, -1, 'saxR', pr.slice(3, 6), [0, 0], SAX_RA, SAX_RD, CURL_HOVER, [-0.9, -0.6, -0.2], 0.25)
  P.L.clav = [0, -0.1, 0.02]; P.R.clav = [0, 0.1, -0.02]
  P.inst.key = pr.slice(); P.inst.oct = frac(t / 2) > 0.5 ? 1 : 0; P.inst.keyS = Math.max(0, Math.sin(t * 3)) > 0.8 ? 1 : 0
  P.headDyn = 0.6
  return P
}

// ---- 低音提琴：头向左歪（琴颈伸向左手），左手按指板、右手拨弦（走低音线，一拍一下）----
/** [修订 E197 肘] 右手拨弦：食指 / 中指沿同一根弦上下排（原来两指横跨两根弦 → 指尖连线水平，手指只能竖着朝下：腕弯 93°、前臂扭 130°，
 *  而且 si < 0.7 时中指目标夹在 E 弦上、两指连线翻向，右手一帧跳 6 cm）。手指横过弦、手背朝前偏外 */
const BASS_RA: V3 = [1, -0.1, -0.1], BASS_RD: V3 = [-0.5, 0, 1]
/** [修订 E197 肘] 左手按弦：手背朝前外下（原来正朝前 → 前臂扭 130°+；校正极向把肘转到琴身外侧时更扭）*/
const BASS_LD: V3 = [0.6, -0.5, 0.6]
const BASS_LINE: [number, number][] = [[1, 0.55], [1, 0.45], [2, 0.58], [2, 0.5], [0, 0.52], [1, 0.6], [3, 0.5], [2, 0.55]]
function bassPose(D: WD, B0: JazzAnimPose, t: number): JazzAnimPose {
  const P = over(B0, { chest: [0.02, 0.18, 0.04], spine: [0.0, 0.06, 0.02], neck: [0.02, -0.12, -0.12], head: [0.05, -0.06, -0.2], hipsP: [0, -0.012, 0] })
  groove(P, t, 1, 0.7, 0.35)
  breathe(P, t / 4, 2, 0.7)
  const n = t / BEAT, i = Math.floor(n), f = n - i
  const [si, u] = BASS_LINE[i % BASS_LINE.length], [si2, u2] = BASS_LINE[(i + 1) % BASS_LINE.length]
  // 左手：换把在拍末 20% 内滑到下一音
  const sh = ss((f - 0.8) / 0.2), uu = mix(u, u2, sh)
  armTips(D, P, 1, 'bassL', [1 - bump(f, 0.8, 1.0) * 0.6, 1 - bump(f, 0.8, 1.0) * 0.6, 0.6], [mix(si, si2, sh), uu], [-1, -0.15, -0.2], BASS_LD, CURL_HOVER, [0.9, -0.4, -0.3], 0.35)
  // 右手：食指 / 中指交替拨（拍点上指尖从弦上划过：弦参数 si 往外移 0.5）
  const pl = Math.exp(-14 * f), sweep = ss(f / 0.12)
  const rs = f < 0.12 ? si + 0.15 - 0.5 * sweep : mix(si - 0.35, si2 + 0.15, ss((f - 0.65) / 0.3))
  armTips(D, P, -1, 'bassR', [0, 0], [rs, 0.22], BASS_RA, BASS_RD, CURL_HOVER, [-0.9, -0.5, -0.3], 0.2)
  P.R.clav = [0, 0.04, -0.03]; P.L.clav = [0, -0.04, 0.06]
  // 弦振动包络：当前拍拨的那根弦（及前一拍余振）
  const prev = BASS_LINE[(i + BASS_LINE.length - 1) % BASS_LINE.length][0]
  P.inst.str = [0, 1, 2, 3].map((k) => 0.0035 * ((k === si ? pl : 0) + (k === prev ? Math.exp(-14 * (f + 1)) : 0)) + (k === si ? 0.0012 * Math.exp(-3 * f) : 0))
  P.headDyn = 0.4
  return P
}

// ---- 鼓：不碰头——鼓皮在拍上震、镲自颤；身体点头摇摆，两手轮流打响指（右 2 / 4 拍、左 1 / 3 拍）----
function drumPose(D: WD, B0: JazzAnimPose, t: number): JazzAnimPose {
  const P = over(B0, { chest: [-0.03, 0, 0], neck: [0.02, 0, 0] })
  groove(P, t, 1.4, 1.3, 1.6)
  breathe(P, t / 4, 2, 0.6)
  const n = t / BEAT, i = Math.floor(n), f = n - i, back = i % 2 === 1
  // 两手轮流打响指：右手 2、4 拍、左手 1、3 拍——手举在肩前，拍前捏住、拍点甩开（一甩手腕往上弹 1.5 cm）
  const ch = trunkFK(D, P).chest
  for (const s of [1, -1]) {
    const mine = s < 0 ? back : !back, fl = flick(f) * (mine ? 1 : 0)
    const lift = pulse(frac(t / (2 * BEAT)) - (s < 0 ? 0.5 : 0), 2)
    const tgt = chestPt(ch, D, [s * 0.2, D.JP('chest')[1] + 0.06 - 0.03 * (1 - lift), 0.22 + 0.02 * fl])
    armFree(D, P, s, addV(tgt, [0, 0.015 * fl, 0]), [s * 0.9, -0.6, -0.2], mine ? mixFl(CURL_SNAP, CURL_SNAPPED, ss(f / 0.05) * (1 - ss((f - 0.7) / 0.3))) : CURL_SNAP,
      arr(v3([-s * 0.25, 0.85, 0.4]).applyQuaternion(ch.q)), arr(v3([s * 0.35, 0.3, -0.85]).applyQuaternion(ch.q)))
  }
  P.inst.drum = Math.exp(-12 * f) * (back ? 1 : 0.55)
  P.inst.cymL = env(t, [0, 1, 2, 3], 2.5, 4) * 0.9 + 0.15
  P.inst.cymR = env(t, [0.5, 1.5, 2.5, 3.5], 2.5, 4) * 0.9 + 0.15
  P.headDyn = 1.2
  return P
}
const mixFl = (a: number[], b: number[], k: number) => a.map((v, i) => mix(v, b[i], k))
const mixV3 = (a: V3, b: V3, k: number): V3 => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)]

// ---- 钢琴（鼓手坐琴凳）----
function seatedBase(D: WD, B0: JazzAnimPose): JazzAnimPose {
  const dy = JAZZ_BENCH.y + 0.12 - D.JP('hips')[1]
  return over(B0, {
    hipsP: [0, dy, JAZZ_BENCH.z + 0.0], hipsR: [0.06, 0, 0], spine: [0.08, 0, 0], chest: [0.06, 0, 0], neck: [0.1, 0, 0], head: [0.06, 0, 0],
    legL: { p: [D.TOE[0] * 1.6, 0, 0.5], yw: 0.12, ph: 0.12 }, legR: { p: [-D.TOE[0] * 1.6, 0, 0.47], yw: -0.12, ph: 0.15 },
  })
}
const PIANO_R = [[2, 4, 6, 4], [3, 5, 7, 5], [4, 6, 8, 6], [2, 4, 6, 4]]
function pianoPose(D: WD, B0: JazzAnimPose, t: number): JazzAnimPose {
  const P = seatedBase(D, B0)
  const sw = Math.sin((t / 2) * Math.PI)
  P.spine[2] += 0.03 * sw; P.chest[2] += 0.03 * sw; P.chest[1] += 0.06 * sw; P.neck[0] += 0.05 * pulse(frac(t / BEAT), 4); P.head[2] -= 0.04 * sw
  breathe(P, t / 4, 2, 0.6)
  const n = t / (BEAT / 2), i = Math.floor(n), f = n - i
  // 右手：旋律（每八分音符按一指），左手：二、四拍按和弦；每小节（1 s）末 0.25 s 换把（手平移到下一组键）
  const bar = Math.floor(t / 1) % 4, fb0 = frac(t / 1), mel = PIANO_R[bar]
  const fi = mel[i % 4] % 4
  const prR = [0, 1, 2, 3].map((k) => (k === fi ? ss(f / 0.15) * (1 - ss((f - 0.8) / 0.2)) : 0) * (1 - ss((fb0 - 0.72) / 0.1)))
  const mv = ss((fb0 - 0.75) / 0.25), nb1 = (bar + 1) % 4
  const baseR = mix(4 + (bar % 2) * 2, 4 + (nb1 % 2) * 2, mv)
  armTips(D, P, -1, 'pianoR', prR, [baseR, 1], [0, -0.4, 1], [0, 1, 0.35], CURL_HOVER, [-0.8, -0.6, -0.2], 0.15, true)
  const nb = t / BEAT, ib = Math.floor(nb), fb = nb - ib
  const ch = ib % 2 === 1 ? ss(fb / 0.1) * (1 - ss((fb - 0.6) / 0.3)) : 0
  const baseL = mix(-6 - (bar % 2), -6 - (nb1 % 2), mv)
  armTips(D, P, 1, 'pianoL', [ch, 0, ch, ch], [baseL, 1.4], [0, -0.4, 1], [0, 1, 0.35], CURL_HOVER, [0.8, -0.6, -0.2], 0.15, true)
  P.inst.cymL = 0.12 + 0.25 * pulse(frac(t / 2), 6); P.inst.cymR = 0.12 + 0.25 * pulse(frac(t / 2 + 0.5), 6); P.inst.drum = 0.45 * Math.exp(-10 * fb) * (ib % 2) // 鼓在二、四拍自己轻震（跟着打拍）
  P.headDyn = 1
  return P
}

// ---- 谢幕鞠躬：右手按胸、左臂向外打开 → 深鞠躬 → 起身 ----
function bowPose(D: WD, B0: JazzAnimPose, t: number): JazzAnimPose {
  const heavy = D.who === 'bass' ? 0.7 : 1
  const UP: Part = { chest: [-0.04, 0, 0] }
  const BOW: Part = { hipsP: [0, -0.01, -0.06 * heavy], hipsR: [0.5 * heavy, 0, 0], spine: [0.22 * heavy, 0, 0], chest: [0.14 * heavy, 0, 0], neck: [0.15, 0, 0], head: [0.12, 0, 0], legL: { ph: 0 }, legR: { ph: 0 } }
  const P = keys(t, B0, [[0, UP], [0.6, UP], [1.5, BOW], [2.2, BOW], [3.2, UP], [3.6, UP]])
  breathe(P, t / 3.6, 1, 0.6)
  const k = ramp(t, 0.1, 0.8) * (1 - ramp(t, 2.9, 3.55))
  // 右手横在腰前（掌心朝身体、离衣面 9 cm——经典乐队谢幕手势），经身前绕过去（不穿肚子）
  const [cs, cn] = surfRest(D, [0.0, D.JP('spine')[1] + 0.02, 0], [0, 0, 1], 0.09)
  const [pp, pn] = onTrunk(D, P, cs, cn)
  const ch = trunkFK(D, P).chest
  const up = arr(v3([0.95, 0.1, 0.1]).applyQuaternion(ch.q))
  armPalmVia(D, P, -1, k, pp, up, pn, C([0.05, -0.2, -0.15, -0.1, 0.0]), arr(v3([-0.9, -0.35, 0.2]).applyQuaternion(ch.q)), onChest(D, P, [-0.2, D.JP('spine')[1] + 0.05, 0.42]), 0, CURL_RELAX, false)
  // 左臂向外打开（掌心朝前）
  armHang(D, P, 1)
  const L0 = P.L.t.slice() as V3
  armFree(D, P, 1, mixV3(L0, onChest(D, P, [0.4, D.JP('spine')[1] + 0.02, 0.22]), ss(k)), poleK(1, [0.6, -0.6, -0.5], ss(k)), mixFl(CURL_RELAX, CURL_OPEN, k), [0.75, -0.2, 0.55], [0.1, 0.9, -0.3], ss(k))
  P.headDyn = 1.2
  return P
}

// ---- 调音（按人分）----
function tunePose(D: WD, B0: JazzAnimPose, t: number): JazzAnimPose {
  const LISTEN = (z: number): Part => ({ neck: [0.06, 0.1, z], head: [0.04, 0.12, z * 1.2], chest: [0.02, 0.05, 0] })
  if (D.who === 'leader') {
    // 一个个慢慢压活塞（试活塞）→ 歪头听
    const P = keys(t, B0, [[0, { head: [-0.05, 0, 0] }], [2.6, { head: [-0.05, 0, 0] }], [3.4, { neck: [0.06, 0, -0.05], head: [0.04, 0, -0.06] }], [4.8, { neck: [0.06, 0, -0.05], head: [0.04, 0, -0.06] }]])
    const pr = [0, 1, 2].map((k) => bump(t, 0.3 + k * 0.7, 0.9 + k * 0.7)).concat([0])
    armTips(D, P, -1, 'valves', pr, [0, 0], [1, -0.32, 0.05], [0, 1, 0], CURL_HOVER, [-0.8, -0.45, -0.35], 0.3)
    const w = 1 - ramp(t, 2.9, 3.9); P.R.tips.w = w
    if (w < 1) {
      const end = P.R.t.slice() as V3, hq = P.R.hq.slice() as Q4, fl = P.R.fl.slice()
      armHang(D, P, -1)
      const start = P.R.t.slice() as V3
      armFree(D, P, -1, addV(via(start, onChest(D, P, [-0.42, D.JP('chest')[1] + 0.08, 0.32]), end, ss(w)), [0, 0.12 * Math.sin(Math.PI * (1 - ss(w))) * ss(w), 0]), poleK(-1, [-0.8, -0.45, -0.35], ss(w)), mixFl(CURL_RELAX, fl, w))
      P.R.hq = hq; P.R.hw = ss(w); P.R.ht = w; P.R.tips = { set: 'valves', w, press: pr.slice(), a: [0, 0] }
    }
    armPalmHead(D, P, 1, LEADER_LPALM, LEADER_LA, LEADER_LD, LEADER_LCURL, LEADER_LPOLE)
    P.inst.valve = pr.slice(0, 3); P.headDyn = 0.5
    return P
  }
  if (D.who === 'sax') {
    // 按住八度键吹长音、逐个开合按键听音准
    const P = keys(t, B0, [[0, { neck: [0.42, 0, 0], head: [0.48, 0, 0], chest: [0.12, 0, 0] }], [3.0, { neck: [0.42, 0, 0], head: [0.48, 0, 0], chest: [0.12, 0, 0] }], [3.8, merge({ neck: [0.38, 0, 0], head: [0.44, 0, 0], chest: [0.1, 0, 0] }, LISTEN(-0.1))], [4.8, merge({ neck: [0.38, 0, 0], head: [0.44, 0, 0], chest: [0.1, 0, 0] }, LISTEN(-0.1))]])
    const pr = [0, 1, 2, 3, 4, 5].map((k) => (t > 0.3 + k * 0.4 ? 1 : 0) * (1 - ramp(t, 2.8, 3.0)))
    armTips(D, P, 1, 'saxL', pr.slice(0, 3), [0, 0], SAX_LA, SAX_LD, CURL_HOVER, [0.9, -0.6, -0.2], 0.25)
    armTips(D, P, -1, 'saxR', pr.slice(3), [0, 0], SAX_RA, SAX_RD, CURL_HOVER, [-0.9, -0.6, -0.2], 0.25)
    P.inst.key = pr; P.inst.oct = 1; P.headDyn = 0.6
    return P
  }
  if (D.who === 'bass') {
    // 一根根拨空弦、歪头凑过去听（左手托着琴身侧沿）
    const P = keys(t, B0, [[0, { chest: [0.02, 0.18, 0.04], neck: [0.02, -0.12, -0.12], head: [0.05, -0.06, -0.2] }], [4.8, { chest: [0.02, 0.24, 0.06], neck: [0.04, -0.16, -0.18], head: [0.08, -0.08, -0.26] }]])
    const k = Math.min(3, Math.floor(t / 1.2)), f = t / 1.2 - k
    const sk = 3 - k, rs = f < 0.12 ? sk + 0.15 - 0.5 * ss(f / 0.12) : mix(sk - 0.35, Math.max(0, sk - 1) + 0.15, ss((f - 0.65) / 0.3))
    armTips(D, P, -1, 'bassR', [0, 0], [rs, 0.22], BASS_RA, BASS_RD, CURL_HOVER, [-0.9, -0.5, -0.3], 0.2)
    armPalmHead(D, P, 1, [BASS.wUp * 0.92 + 0.012, BASS.y0 + BASS.h * 0.72, BASS.z0], [-0.2, 0.95, 0.1], [1, 0, 0.1], C([0.1, 0.1, 0.15, 0.2, 0.25]), [0.9, -0.5, -0.3])
    P.inst.str = [0, 1, 2, 3].map((i) => (i === 3 - k ? 0.004 * Math.exp(-2.2 * f) : 0.0008 * Math.exp(-1.5 * (f + 1))))
    P.neck[0] += 0.05 * bump(f, 0.1, 0.6); P.head[2] -= 0.04 * bump(f, 0.15, 0.8) // 拨一下、侧耳点头听
    P.headDyn = 0.4
    return P
  }
  // 鼓：指节敲鼓皮两下、侧耳听 → 拧一下张力螺丝 → 再敲
  const P = keys(t, B0, [[0, LISTEN(0)], [0.8, LISTEN(-0.12)], [2.2, LISTEN(-0.12)], [4.8, LISTEN(0.1)]])
  const knock = (te: number) => bump(t, te, te + 0.18)
  const kk = Math.max(knock(0.75), knock(1.05), knock(3.3), knock(3.6))
  // 右手：拳（指节朝鼓皮）敲两下——拳心离鼓皮 3.2 cm（指节厚）+ 抬起 3.5 cm
  const dz = SNARE.c[2] + SNARE.depth / 2
  const kn = ramp(t, 0.0, 0.7) * (1 - ramp(t, 1.3, 2.05)) + ramp(t, 2.55, 3.2) * (1 - ramp(t, 3.85, 4.5)) // [修订 E197 肘] 第一次抬手 0.55 → 0.7 s、收手 0.6 → 0.75 s（肘从后甩到前太急，一帧突跳 15 mm）
  armHang(D, P, -1)
  const rs0 = P.R.t.slice() as V3
  armPalmHead(D, P, -1, [0.035, SNARE.c[1] - 0.02, dz + 0.066 + 0.035 * (1 - kk)], [0.2, 0.15, -1], [-0.2, 0.95, 0.1], CURL_GRIP, [-0.9, -0.6, -0.2], 1)
  if (kn < 1) { const hq = P.R.hq, end = palmToWrist(D, -1, P.R.pp, hq, 1); armFree(D, P, -1, via(rs0, onChest(D, P, [-0.3, D.JP('chest')[1] - 0.05, 0.35]), end, ss(kn)), poleK(-1, [-0.9, -0.6, -0.2], ss(kn)), mixFl(CURL_RELAX, CURL_GRIP, kn), undefined, undefined, 0); P.R.hq = hq; P.R.hw = ss(kn) }
  // 左手：捏住张力螺丝拧一拧
  const turn = ramp(t, 1.2, 1.8) * (1 - ramp(t, 2.3, 3.1))
  armHang(D, P, 1)
  const ls0 = P.L.t.slice() as V3
  armPalmHead(D, P, 1, [SNARE.r + 0.07, SNARE.c[1] + SNARE.r * 0.25, SNARE.c[2] + 0.004 * Math.sin(t * 9) * turn], [-0.2, 0.3, -0.95], [0.95, 0.1, 0.2], C([0.5, 0.75, 0.9, 1, 1]), [0.9, -0.5, -0.3], 1)
  if (turn < 1) { const hq = P.L.hq, end = palmToWrist(D, 1, P.L.pp, hq, 1); armFree(D, P, 1, via(ls0, onChest(D, P, [0.46, D.JP('chest')[1] - 0.02, 0.22]), end, ss(turn)), poleK(1, [0.9, -0.5, -0.3], ss(turn)), mixFl(CURL_RELAX, P.L.fl, turn), undefined, undefined, 0); P.L.hq = hq; P.L.hw = ss(turn) }
  P.inst.drum = Math.max(...[0.84, 1.14, 3.39, 3.69].map((te) => (t >= te ? Math.exp(-10 * (t - te)) : 0)))
  P.inst.cymL = 0.12; P.inst.cymR = 0.12
  return P
}

// ---- 假吸魂：举臂伸向观众、五指张开 → 抓回（吸）→ 上身后仰「吸入」→ 定住 → 松懈、偷看一眼 ----
function soulPose(D: WD, B0: JazzAnimPose, t: number): JazzAnimPose {
  const heavy = D.who === 'bass' ? 0.6 : 1
  const REACH: Part = { hipsP: [0, -0.02, 0.04], hipsR: [0.1, 0, 0], spine: [0.1 * heavy, 0, 0], chest: [0.12 * heavy, 0, 0], neck: [0.12, 0, 0], head: [0.14 * heavy, 0, 0], legL: { p: [D.TOE[0] * 1.3, 0, D.TOE[2] + 0.16] }, legR: { p: [-D.TOE[0] * 1.2, 0, D.TOE[2] - 0.08] } }
  const PULL: Part = { hipsP: [0, -0.03, -0.02], hipsR: [-0.06, 0, 0], spine: [-0.1 * heavy, 0, 0], chest: [-0.16 * heavy, 0, 0], neck: [-0.08, 0, 0], head: [-0.16 * heavy, 0, 0], legL: { p: [D.TOE[0] * 1.3, 0, D.TOE[2] + 0.16] }, legR: { p: [-D.TOE[0] * 1.2, 0, D.TOE[2] - 0.08] } }
  const P = keys(t, B0, [[0, {}], [0.9, REACH], [1.6, REACH], [2.4, PULL], [3.2, PULL], [4.0, {}]])
  const reach = ramp(t, 0.2, 0.9) * (1 - ramp(t, 1.6, 2.3)), pull = ramp(t, 1.6, 2.3) * (1 - ramp(t, 3.2, 3.9))
  const shake = ramp(t, 0.9, 1.1) * (1 - ramp(t, 1.5, 1.6))
  for (const s of [1, -1]) {
    const Rch: V3 = onChest(D, P, [s * 0.36, D.JP('neck')[1] + 0.2, 0.4])
    const Pch: V3 = onChest(D, P, [s * 0.26, D.JP('chest')[1] + 0.12, 0.26])
    armHang(D, P, s)
    const hang = (s > 0 ? P.L : P.R).t.slice() as V3
    const tt = addV(mixV3(mixV3(hang, Rch, reach), Pch, pull), [0.006 * shake * Math.sin(t * 47 + s), 0.006 * shake * Math.sin(t * 53), 0])
    const fl = mixFl(mixFl(CURL_RELAX, CURL_SPREAD, reach), CURL_CLAW, pull)
    armFree(D, P, s, tt, poleK(s, [s * 0.8, -0.5, -0.4], Math.max(reach, pull)), fl, [s * 0.15, 0.55 - 0.9 * pull, 1], [0, -0.3 + 1.2 * pull, -0.9 + 0.9 * pull], Math.max(reach, pull))
    const A = s > 0 ? P.L : P.R; A.clav = [0, -s * 0.12 * reach, s * 0.12 * reach]
  }
  // 偷看一眼（3.3–3.9：头往右后瞟）
  P.head[1] += -0.35 * bump(t, 3.2, 3.95); P.neck[1] += -0.15 * bump(t, 3.2, 3.95)
  P.props.mist = ramp(t, 0.6, 1.4) * (1 - ramp(t, 3.0, 3.7)); P.props.mistK = ramp(t, 1.4, 3.2)
  if (D.who === 'leader') P.inst.valve = [1, 1, 1].map((v) => v * pull)
  if (D.who === 'drum') { P.inst.cymL = 0.2 + 0.8 * pull; P.inst.cymR = 0.2 + 0.8 * pull; P.inst.drum = 0.4 * pull * (0.5 + 0.5 * Math.sin(t * 40)) }
  if (D.who === 'bass') P.inst.str = [0.002, 0.002, 0.002, 0.002].map((v) => v * pull)
  if (D.who === 'sax') P.inst.key = [1, 1, 1, 1, 1, 1].map((v) => v * pull)
  P.headDyn = 1
  return P
}

// ---- [修] 真吸魂（告发之后回来）：僵直——不摇不晃、两臂一直前伸，五指张开 → 一下一下往回抽（像在拽一根线）；头微低、不偷看 ----
function trueSoulPose(D: WD, B0: JazzAnimPose, t: number): JazzAnimPose {
  const heavy = D.who === 'bass' ? 0.6 : 1
  const STIFF: Part = { hipsP: [0, -0.015, 0.03], hipsR: [0.06, 0, 0], spine: [0.06 * heavy, 0, 0], chest: [0.07 * heavy, 0, 0], neck: [0.1, 0, 0], head: [0.12 * heavy, 0, 0], legL: { p: [D.TOE[0] * 1.3, 0, D.TOE[2] + 0.12] }, legR: { p: [-D.TOE[0] * 1.2, 0, D.TOE[2] - 0.06] } }
  const P = keys(t, B0, [[0, STIFF], [4.0, STIFF]])
  // 一下下往回抽：0.6 / 1.6 / 2.6 s 三下（每下 0.7 s）；4 s 重播首尾同姿（reach 1、pull 0）
  const jerk = Math.max(bump(t, 0.6, 1.3), bump(t, 1.6, 2.3), bump(t, 2.6, 3.3)) ** 2 // sin²：起止处速度为 0（肘不突跳）
  P.chest[0] -= 0.07 * heavy * jerk; P.spine[0] -= 0.03 * heavy * jerk; P.head[0] -= 0.06 * heavy * jerk
  for (const s of [1, -1]) {
    const Rch: V3 = onChest(D, P, [s * 0.36, D.JP('neck')[1] + 0.2, 0.4])
    const Pch: V3 = onChest(D, P, [s * 0.26, D.JP('chest')[1] + 0.12, 0.26])
    const tt = mixV3(Rch, Pch, 0.55 * jerk)
    const fl = mixFl(CURL_SPREAD, CURL_CLAW, 0.25 + 0.75 * jerk)
    armFree(D, P, s, tt, poleK(s, [s * 0.8, -0.5, -0.4], 1), fl, [s * 0.15, 0.55 - 0.9 * jerk * 0.55, 1], [0, -0.3 + 1.2 * jerk * 0.55, -0.9 + 0.9 * jerk * 0.55], 1)
    const A = s > 0 ? P.L : P.R; A.clav = [0, -s * 0.12, s * 0.12]
  }
  P.props.mist = 1; P.props.mistK = 0.6 + 0.4 * jerk; P.props.mistReal = 1
  if (D.who === 'leader') P.inst.valve = [1, 1, 1].map((v) => v * (0.3 + 0.7 * jerk))
  if (D.who === 'drum') { P.inst.cymL = 0.3 + 0.7 * jerk; P.inst.cymR = 0.3 + 0.7 * jerk; P.inst.drum = 0.3 * jerk * (0.5 + 0.5 * Math.sin(t * 40)) }
  if (D.who === 'bass') P.inst.str = [0.002, 0.002, 0.002, 0.002].map((v) => v * (0.3 + 0.7 * jerk))
  if (D.who === 'sax') P.inst.key = [1, 1, 1, 1, 1, 1].map((v) => v * (0.3 + 0.7 * jerk))
  P.headDyn = 0.5 // 僵：头几乎不晃
  return P
}
// ---- [修] 收拾离场：0–1.3 瞪你、摇头（注视层负责「瞪」的方向）→ 1.3–2.3 俯身两手伸向谱架收起乐谱 → 2.3–3.3 按在胸前 → 3.3–4.4 收进礼服里、两手放下 ----
function packPose(D: WD, B0: JazzAnimPose, t: number): JazzAnimPose {
  const heavy = D.who === 'bass' ? 0.5 : 1
  const GLARE: Part = { chest: [-0.03, 0, 0], neck: [-0.04, 0, 0], head: [-0.05 * heavy, 0, 0] }
  const BEND: Part = { hipsP: [0, -0.02, 0.02], hipsR: [0.08, 0, 0], spine: [0.1 * heavy, 0, 0], chest: [0.08 * heavy, 0, 0], neck: [0.12, 0, 0], head: [0.14 * heavy, 0, 0] }
  const UP: Part = { chest: [0.0, 0, 0], neck: [0.04, 0, 0], head: [0.04, 0, 0] }
  const P = keys(t, B0, [[0, {}], [0.4, GLARE], [1.3, GLARE], [1.8, BEND], [2.3, BEND], [2.9, UP], [4.4, {}]])
  // 摇头（0.35–1.25：三下）
  const sh = bump(t, 0.35, 1.25)
  P.head[1] += 0.26 * heavy * sh * Math.sin((t - 0.35) * TAU * 1.67); P.neck[1] += 0.08 * heavy * sh * Math.sin((t - 0.35) * TAU * 1.67)
  breathe(P, t / 4.4, 1, 0.8)
  const reach = ramp(t, 1.3, 1.9) * (1 - ramp(t, 2.3, 2.9)), hold = ramp(t, 2.3, 2.9) * (1 - ramp(t, 3.5, 4.2))
  for (const s of [1, -1]) {
    armHang(D, P, s)
    const hang = (s > 0 ? P.L : P.R).t.slice() as V3
    const Sd: V3 = onChest(D, P, [s * 0.16, D.JP('chest')[1] - 0.02, 0.44]) // 谱架的高度、在身前
    const Hc: V3 = onChest(D, P, [s * 0.15, D.JP('chest')[1] + 0.06, 0.27]) // 按在胸前
    const tt = mixV3(mixV3(hang, Sd, reach), Hc, hold)
    const k = Math.max(reach, hold)
    armFree(D, P, s, tt, poleK(s, [s * 0.8, -0.5, -0.4], k), mixFl(CURL_RELAX, CURL_SOFT, k), [s * 0.05, 0.15 + 0.5 * hold, 1], [s * 1, 0.1, -0.2], k)
  }
  P.props.sheet = ramp(t, 1.85, 2.0) * (1 - ramp(t, 3.35, 3.5))
  P.headDyn = 1
  return P
}

// ---- 台下：待着随拍摇 ----
function idlePose(D: WD, B0: JazzAnimPose, t: number, u: number, seed: number): JazzAnimPose {
  const P = over(B0, { chest: [-0.02, 0, 0] })
  const w = Math.sin(u * TAU) // 重心左右换
  P.hipsP[0] += 0.028 * w; P.hipsR[2] -= 0.05 * w; P.spine[2] += 0.035 * w; P.chest[2] += 0.02 * w
  P.legL.p = [D.TOE[0] * 1.15, 0, D.TOE[2] + 0.01]; P.legR.p = [-D.TOE[0] * 1.15, 0, D.TOE[2] - 0.01]
  P.neck[0] += 0.04 * pulse(frac(t / BEAT), 4) * (0.7 + 0.3 * Math.cos(TAU * t / 2))
  P.head[1] += 0.09 * Math.sin(TAU * u + seed) + 0.035 * Math.sin(TAU * 3 * u + 2 * seed); P.head[2] += 0.04 * Math.sin(TAU * 2 * u + 1 + seed) // 东张西望（周期内闭合）
  breathe(P, u, 1, 0.9)
  for (const s of [1, -1]) armHang(D, P, s, 0.06 * Math.sin(u * TAU + (s > 0 ? 0 : Math.PI)))
  // 右手在大腿侧打拍子（指尖轻点）
  P.R.fl = mixFl(CURL_RELAX, C([0.1, -0.3 + 0.4 * pulse(frac(t / BEAT), 4), 0.2, 0.25, 0.3]), 1)
  P.inst.cymL = 0.06; P.inst.cymR = 0.06
  P.headDyn = 1.3
  return P
}

// ---- 走路（低音提琴头重：步子沉、上身稳住、头晃得慢而大）----
function walkPose(D: WD, B0: JazzAnimPose, u: number): JazzAnimPose {
  const P = over(B0, {})
  const heavy = D.who === 'bass'
  const G: GaitSpec = { D: JAZZ_CLIPS.walk.speed! * JAZZ_CLIPS.walk.dur, duty: heavy ? 0.64 : 0.6, lift: 0.065, width: D.TOE[0] * (heavy ? 1.2 : 0.95), heelOff: 0.35, toeOff: 0.4, strike: 0.15, toeOut: 0.1 }
  gaitLegs(D, P, u, G)
  const s1 = Math.sin(u * TAU), c2 = Math.cos(u * TAU * 2)
  const lat = (heavy ? 0.03 : 0.018) * Math.sin((u + 0.2) * TAU)
  P.hipsP = [lat, -0.03 + 0.012 * Math.cos((u - 0.25) * TAU * 2) - 0.008 * Math.pow(0.5 + 0.5 * c2, 4), 0]
  P.hipsR = [0.03, 0.09 * s1, -0.6 * lat]
  P.spine = [0.03, -0.04 * s1, 0.4 * lat]; P.chest = [heavy ? -0.03 : 0.02, -0.07 * s1, 0.3 * lat]
  P.neck = [heavy ? 0.0 : 0.03, 0.04 * s1, 0]; P.head = [0.02, 0.02 * s1, 0]
  for (const s of [1, -1]) armHang(D, P, s, -s * s1 * (heavy ? 0.6 : 1), CURL_SOFT)
  P.headDyn = heavy ? 2.2 : 1.2
  return P
}

// ---- 喝啤酒：吧台上拿杯 → 举到领口前 → 倾倒（酒流进前襟 V 口——乐器头没有嘴）→ 满足地耸肩 → 放回 ----
function beerPose(D: WD, B0: JazzAnimPose, t: number): JazzAnimPose {
  const LEAN: Part = { hipsR: [0.08, 0, 0], spine: [0.05, 0, 0], chest: [0.05, -0.1, 0] }
  const UP: Part = { chest: [-0.06, 0.05, 0], neck: [0.05, 0, 0], head: [0.12, 0, 0] }
  const P = keys(t, B0, [[0, {}], [0.9, LEAN], [1.4, LEAN], [2.2, UP], [3.6, UP], [4.2, { chest: [-0.03, 0.05, 0.05] }], [5.0, LEAN], [5.4, LEAN], [6, {}]])
  breathe(P, t / 6, 2, 0.7)
  // 杯把朝角色右手（杯绕 Y 转 π：把手朝 −X、杯口倾倒一侧朝 +X = 领口方向）
  const grab = ramp(t, 0.35, 1.0) * (1 - ramp(t, 5.0, 5.6)), lift = ramp(t, 1.3, 2.3) * (1 - ramp(t, 4.0, 4.9))
  const tilt = ramp(t, 2.3, 2.9) * (1 - ramp(t, 3.6, 4.1))
  const G1 = addV(JAZZ_MUG_AT, [-MUG_GRIP.x, MUG_GRIP.y, 0])
  const collar = onChest(D, P, [0, D.JP('neck')[1] - 0.01, D.JP('neck')[2] + 0.12])
  const G2 = addV(collar, [-0.07 - 0.02 * tilt, (D.who === 'leader' ? -0.02 : 0.03), 0.17])
  const fist = via(G1, addV(mixV3(G1, G2, 0.5), [-0.08, 0.02, 0.05]), G2, ss(lift))
  // 拳眼轴（拇指）= 杯身轴（随倾角往 +X 倒）；四指朝 +X 穿过杯把
  const tl = 1.6 * tilt * 0.75, mugUp: V3 = [Math.sin(tl), Math.cos(tl), 0]
  const hq = hAR(D, -1, [Math.cos(tl), -Math.sin(tl), 0.35], mugUp)
  armHang(D, P, -1)
  const hang = P.R.t.slice() as V3
  const wristAt = palmToWrist(D, -1, fist, hq, 1)
  armFree(D, P, -1, grab < 1 ? via(hang, [-0.32, JAZZ_BAR.y - 0.12, 0.3], wristAt, ss(grab)) : wristAt, poleK(-1, [-0.9, -0.6, -0.3], ss(grab)), mixFl(CURL_OPEN, CURL_GRIP, ss((grab - 0.75) / 0.25)), ...dirsOf(hq, D, -1), ss(grab))
  if (grab >= 0.999) { P.R.pp = fist; P.R.pw = 1; P.R.pk = 1 }
  const hold = grab >= 0.999 || (t > 1.0 && t < 5.0)
  for (const s of [1]) armHang(D, P, s, 0.04)
  // 满足地抖一下肩（4.2–4.8）
  const shiv = bump(t, 4.2, 4.9); P.L.clav = [0, 0, 0.09 * shiv * (0.5 - 0.5 * Math.cos(t * 30))]; P.chest[2] += 0.025 * shiv * Math.sin(t * 15) // [修订 E197 肘] |sin| 有尖点 → 肘部加速度突跳，改成平滑的 sin²、频率 / 幅度略降
  P.props.mug = hold ? 1 : 2; P.props.mugTilt = 1.6 * tilt * 0.75; P.props.pour = ramp(t, 2.7, 2.9) * (1 - ramp(t, 3.5, 3.7))
  P.headDyn = 1
  return P
}

// ---- 扶头活动脖子（低音提琴）：琴身下沿比肩宽、压在肩上，手够不到后颈：双手从两侧扶住下琴腹侧板，歪头 / 点头活动脖子，手指按揉 ----
function holdPose(D: WD, B0: JazzAnimPose, u: number): JazzAnimPose {
  // 琴身下沿比肩宽、压在肩上，手够不到后颈 / 肩头：改成双手从两侧扶稳琴身下半（下琴腹侧板），
  // 慢慢左右歪头、点头，活动被压酸的脖子；手指在侧板上一下一下地按（像在揉）
  const a = u * TAU
  const P = over(B0, { chest: [-0.03, 0, 0], neck: [0.04 + 0.04 * Math.sin(a * 2), 0, 0.1 * Math.sin(a)], head: [0.03 * Math.sin(a * 2), 0.05 * Math.sin(a), 0.06 * Math.sin(a)] })
  breathe(P, u, 1, 1)
  P.hipsP[0] += 0.015 * Math.sin(a)
  const hw = BASS.wLow / 2 + 0.037, y = BASS.y0 + 0.24, z = BASS.z0 + 0.012
  const kn = (ph: number) => 0.5 + 0.5 * Math.sin(a * 4 + ph)
  const fl = (k: number) => C([-1, -0.95 + 0.25 * k, -0.95 + 0.25 * k, -0.95 + 0.25 * k, -0.9 + 0.2 * k])
  // 掌心离侧板 3.7 cm（掌心点在掌骨里）；拇指伸直贴着侧板往前，不戳进琴身
  // [修订 E197 肘] 指尖改为几乎竖直略朝里（原来朝外 → 前臂从琴身下方里侧上来，袖口插进下琴腹 2 cm），前臂从外下方来；手低 1 cm、离侧板多 1 cm
  armPalmHead(D, P, -1, [-hw, y, z], [0.1, 1, 0.25], [-1, 0, 0], fl(kn(0)), [-1, -0.6, 0.2])
  armPalmHead(D, P, 1, [hw, y + 0.01, z], [-0.1, 1, 0.25], [1, 0, 0], fl(kn(Math.PI)), [1, -0.6, 0.2])
  P.headDyn = 1
  return P
}

// ---- 聊天比划 ----
function talkPose(D: WD, B0: JazzAnimPose, t: number, u: number, seed: number): JazzAnimPose {
  const P = over(B0, { chest: [0.0, 0.1, 0] })
  breathe(P, u, 1, 0.9)
  const g1 = Math.max(0, Math.sin(TAU * u * 2)), g2 = Math.max(0, Math.sin(TAU * u * 1.5 * 2 / 1.5 + 1.2 + seed))
  P.head[0] += 0.06 * pulse(frac(t / 0.8), 4); P.head[1] += 0.1 * Math.sin(TAU * u + seed) + 0.04 * Math.sin(TAU * 3 * u); P.chest[1] += 0.05 * Math.sin(TAU * u)
  const ch = trunkFK(D, P).chest
  for (const [s, g] of [[1, g1], [-1, g2]] as [number, number][]) {
    const T = chestPt(ch, D, [s * (0.2 + 0.06 * g), D.JP('spine')[1] + 0.06 + 0.08 * g, 0.3 + 0.06 * g])
    // [修订 E197 肘] 原手背方向在 g = 0 时与指尖方向几乎反向（退化）→ 手朝向乱翻、前臂扭 110°+、肘部突跳。
    // 改：g = 0 掌心朝内（手背朝外、拇指朝上，前臂中立）→ g = 1 掌心斜朝上摊开（旋后约 60°）
    armFree(D, P, s, T, [s * 0.9, -0.6, -0.3], mixFl(CURL_SOFT, CURL_OPEN, g), arr(v3([-s * 0.25, -0.15 + 0.45 * g, 1]).applyQuaternion(ch.q)), arr(v3([s * (0.9 - 0.6 * g), 0.1 - 0.85 * g, 0.1]).applyQuaternion(ch.q)), 0.8)
  }
  P.headDyn = 1.2
  return P
}

// ---- 「你看着面熟」：凑近、歪头打量、右手食指点点对方 ----
function leanPose(D: WD, B0: JazzAnimPose, t: number): JazzAnimPose {
  const heavy = D.who === 'bass' ? 0.6 : 1
  const IN: Part = { hipsP: [0, -0.015, 0.04], hipsR: [0.12 * heavy, 0, 0], spine: [0.12 * heavy, 0, 0], chest: [0.1 * heavy, 0, 0], neck: [0.14, 0.05, 0.08], head: [0.12, 0.08, 0.16], legL: { p: [D.TOE[0] * 1.1, 0, D.TOE[2] + 0.18] } }
  const P = keys(t, B0, [[0, {}], [0.9, IN], [3.0, merge(IN, { head: [0.1, -0.06, 0.2] })], [4.0, {}]])
  const k = ramp(t, 0.3, 1.0) * (1 - ramp(t, 3.2, 3.9))
  const ch = trunkFK(D, P).chest
  const wag = 0.02 * Math.sin(t * 14) * ramp(t, 1.4, 1.6) * (1 - ramp(t, 2.4, 2.6))
  armFree(D, P, -1, chestPt(ch, D, [-0.12 + wag, D.JP('chest')[1] + 0.05, 0.42]), [-0.9, -0.6, -0.2], mixFl(CURL_RELAX, CURL_POINT, k), arr(v3([0.15, 0.2, 1]).applyQuaternion(ch.q)), arr(v3([-0.2, 0.95, 0.05]).applyQuaternion(ch.q)), k)
  P.R.t = via(hangT(D, P, -1), onChest(D, P, [-0.22, D.JP('spine')[1] + 0.02, 0.3]), P.R.t, k)
  // 左手叉腰
  { const bs = D.who === 'bass'; const [wr0, wn0] = surfRest(D, [0, D.JP('spine')[1] - 0.04, 0.0], [1, 0, 0.1], 0.012); const [wp, wn] = onTrunk(D, P, wr0, wn0) // 低音提琴：肚子太大叉不了腰，左手垂着
    if (bs) armHang(D, P, 1); else armPalmVia(D, P, 1, k, wp, bs ? [-0.9, -0.3, 0.2] : [-0.15, -0.35, 1], wn, C([0.1, -0.5, -0.5, -0.45, -0.4]), [1, 0, -0.6], addV(wp, [0.12, 0.05, 0.04])) }
  P.headDyn = 1.2
  return P
}

// ---- 指方向（出口在左后方）----
function pointPose(D: WD, B0: JazzAnimPose, t: number): JazzAnimPose {
  const TURN: Part = { hipsR: [0, 0.12, 0], spine: [0, 0.12, 0], chest: [-0.02, 0.2, 0], neck: [0, 0.35, 0], head: [-0.05, 0.3, 0], legL: { yw: 0.3 } }
  const P = keys(t, B0, [[0, {}], [0.8, TURN], [2.8, TURN], [3.6, {}]])
  const k = ramp(t, 0.4, 1.1) * (1 - ramp(t, 2.7, 3.4))
  const sh = v3(D.SH(1)), dir = v3(nz(JAZZ_EXIT_DIR))
  const ch = trunkFK(D, P).chest
  const S = v3(chestPt(ch, D, arr(sh)))
  const T = S.clone().addScaledVector(dir, (D.LU + D.LF) * 0.93)
  // [修订 E197 肘] 指的那只手：肘尖朝后下（原来朝正下 → 掌心朝下要前臂扭 100°+）
  armFree(D, P, 1, arr(T), poleK(1, [0.3, -0.45, -1], k), mixFl(CURL_RELAX, CURL_POINT, k), arr(dir), [0, 1, 0.1], k)
  P.L.t = via(hangT(D, P, 1), onChest(D, P, [D.R.P.chestW + 0.22, D.JP('spine')[1] + 0.05, 0.32]), P.L.t, k)
  // 右手摊开（「那边」）
  armFree(D, P, -1, chestPt(ch, D, [-0.3, D.JP('spine')[1] + 0.02, 0.2]), poleK(-1, [-0.9, -0.5, -0.3], k), mixFl(CURL_RELAX, CURL_OPEN, k), [0.2, 0.3, 1], [-0.5, -0.85, 0.1], k)
  P.R.t = via(hangT(D, P, -1), onChest(D, P, [-0.3, D.JP('spine')[1] - 0.02, 0.24]), P.R.t, k)
  P.headDyn = 1.2
  return P
}

// ---- 瞄监控·心虚：抬头盯住墙角探头 → 僵住 → 猛地转回来、立正（手贴裤缝、耸肩、踮一下脚）装没事 ----
function glancePose(D: WD, B0: JazzAnimPose, t: number): JazzAnimPose {
  const LOOK: Part = { chest: [-0.06, -0.22, 0], neck: [-0.12, -0.3, 0], head: [-0.2, -0.32, 0.05] }
  const AWAY: Part = { chest: [0.04, 0.1, 0], neck: [0.1, 0.12, 0], head: [0.12, 0.12, 0] }
  const P = keys(t, B0, [[0, {}], [0.7, LOOK], [1.9, LOOK], [2.15, AWAY, (x) => 1 - Math.pow(1 - ss(x), 2)], [3.3, AWAY], [4.0, {}]])
  P.head[0] += 0.01 * Math.sin(t * 31) * bump(t, 0.9, 1.9) // 僵住时细颤
  breathe(P, t / 4, 1, 0.6)
  // 猛转回来后「立正」装没事：耸肩、两手贴裤缝（手指并拢伸直）
  const k = ramp(t, 2.1, 2.4) * (1 - ramp(t, 3.4, 3.9))
  for (const s of [1, -1]) {
    armHang(D, P, s, 0, mixFl(CURL_RELAX, C([0.0, -0.7, -0.7, -0.65, -0.6]), k))
    const A = s > 0 ? P.L : P.R
    A.t = addV(A.t, [-s * 0.012 * k, -0.012 * k, -0.02 * k]); A.clav = [0, 0, s * 0.1 * k]
  }
  P.headDyn = 1.2
  return P
}

// ---- 吵架·被头儿按肩劝和（三人；按 who 分角色）----
function arguePose(D: WD, B0: JazzAnimPose, t: number): JazzAnimPose {
  if (D.who === 'leader') {
    // 头儿：0–2 抱臂叹气看两人吵 → 2–3 上前半步、两手伸出 → 3–6 按住两人（左手萨克斯右肩、右手低音提琴左上臂），点头
    const STEP: Part = { hipsP: [0, -0.01, 0.04], spine: [0.08, 0, 0], chest: [0.08, 0, 0], neck: [0.1, 0, 0], head: [0.1, 0, 0], legL: { p: [D.TOE[0] * 1.1, 0, D.TOE[2] + 0.1] }, legR: { p: [-D.TOE[0] * 1.1, 0, D.TOE[2] + 0.06] } }
    const P = keys(t, B0, [[0, { head: [0.05, 0.25, 0] }], [1.0, { head: [0.05, -0.25, 0] }], [2.0, { head: [0.1, 0.0, 0] }], [3.0, STEP], [6, STEP]])
    breathe(P, t / 6, 2, 1)
    const k = ramp(t, 2.0, 3.0)
    P.head[0] += 0.08 * bump(t, 3.6, 4.2) + 0.08 * bump(t, 4.4, 5.0)
    for (const s of [1, -1]) {
      const tgt = s > 0 ? JAZZ_ARGUE.shoulderSax : JAZZ_ARGUE.armBass
      armPalm(D, P, s, tgt, s > 0 ? [0.1, -0.2, 1] : [0, -0.6, 0.8], s > 0 ? [0, 1, -0.15] : [-0.95, 0.1, -0.2], C([0.15, 0.3, 0.35, 0.4, 0.45]), [s, -0.6, -0.4])
      // 抱臂（手在对侧肘下）→ 伸出
      const [cr0] = surfRest(D, [-s * 0.1, D.JP('spine')[1] + 0.08, 0], [0, 0, 1], 0.07 + 0.025 * (s > 0 ? 1 : 0))
      const cross = onChest(D, P, cr0)
      const A = s > 0 ? P.L : P.R
      // [修订 E197 肘] 松开抱臂：左手（抱臂时在外侧）往前上绕、右手往前下走——两前臂不再在胸前对穿、肘不突跳
      if (k < 1) { const end = palmToWrist(D, s, A.pp, A.hq); A.t = via(cross, onChest(D, P, s > 0 ? [0.26, D.JP('chest')[1] + 0.17, 0.5] : [-0.3, D.JP('chest')[1] - 0.04, 0.36]), end, ss(k)); A.hq = qArr(new THREE.Quaternion(...jazzHandQuat(D.who, s, [-s, 0.1, 0.1], [0, 0.2, 1])).slerp(new THREE.Quaternion(...A.hq), ss(k))); A.pw = k >= 0.999 ? 1 : 0; A.hw = 1; A.fl = mixFl(CURL_SOFT, A.fl, k); A.pole = mixV3([s * 0.55, -0.6, 0.55], A.pole, ss(k)) } // [修订 E197 肘] 抱臂时肘尖朝前下外（原来朝外后 → 抱臂的前臂被拧进胸口）
    }
    P.headDyn = 0.8
    return P
  }
  // 萨克斯 / 低音提琴：面对面吵（戳手指、摊手、顶胸）→ 3.0 被按住：肩一沉、手放下、头低
  const ANGRY: Part = { hipsP: [0, -0.01, 0.03], spine: [0.06, 0, 0], chest: [0.06, 0, 0], neck: [0.12, 0, 0], head: [0.14, 0, 0] }
  const CALM: Part = { chest: [0.06, 0, 0], neck: [0.16, 0, 0], head: [0.2, 0, 0] }
  const P = keys(t, B0, [[0, ANGRY], [2.8, ANGRY], [3.4, CALM], [6, CALM]])
  const sg = D.who === 'sax' ? 1 : -1
  const ang = 1 - ramp(t, 2.8, 3.4)
  const jab = Math.max(0, Math.sin(t * (sg > 0 ? 5.5 : 4.2) + (sg > 0 ? 0 : 1))) * ang
  P.head[0] += 0.08 * jab; P.chest[0] += 0.05 * jab
  const ch = trunkFK(D, P).chest
  armFree(D, P, -1, chestPt(ch, D, [-0.12, D.JP('chest')[1] + 0.02 + 0.06 * jab, 0.36 + 0.12 * jab]), poleK(-1, [-0.9, -0.6, -0.2], ang), mixFl(CURL_RELAX, CURL_POINT, ang), arr(v3([0.1, 0.1, 1]).applyQuaternion(ch.q)), arr(v3([-0.5, 0.8, 0.1]).applyQuaternion(ch.q)), ang)
  const flap = Math.max(0, Math.sin(t * 3.1 + sg)) * ang
  armFree(D, P, 1, chestPt(ch, D, [0.3 + 0.08 * flap, D.JP('spine')[1] + 0.05 * flap, 0.2 + 0.05 * flap]), poleK(1, [0.9, -0.6, -0.3], ang), CURL_OPEN, [-0.3, 0.3, 1], [0.55, -0.8, 0.2], ang)
  for (const s of [1, -1]) { const A = s > 0 ? P.L : P.R; A.t = via(hangT(D, P, s), onChest(D, P, [s * 0.3, D.JP('spine')[1] + 0.02, 0.3]), A.t, ang); if (ang < 1) A.fl = mixFl(CURL_RELAX, A.fl, ang) }
  // 被按住的那一侧肩沉
  const press = ramp(t, 3.0, 3.3)
  if (sg > 0) P.R.clav = [0, 0, 0.08 * press]; else P.L.clav = [0, 0, -0.08 * press]
  P.headDyn = 1
  return P
}

// ======================================================================
// 骨骼求解（root 空间 FK）
// ======================================================================
function fk(b: THREE.Object3D, root: THREE.Object3D): Xf {
  if (b === root) return { p: new THREE.Vector3(), q: new THREE.Quaternion() }
  const P = fk(b.parent!, root)
  return { p: P.p.clone().add(b.position.clone().applyQuaternion(P.q)), q: P.q.clone().multiply(b.quaternion) }
}
function setRootQ(b: THREE.Object3D, root: THREE.Object3D, q: THREE.Quaternion) { const pq = fk(b.parent!, root).q; b.quaternion.copy(pq.invert().multiply(q)) }
function setE(b: THREE.Object3D, e: V3) { b.rotation.order = 'YXZ'; b.rotation.set(e[0], e[1], e[2]) }
const frameM = (a: THREE.Vector3, n: THREE.Vector3) => { const c = new THREE.Vector3().crossVectors(a, n); return new THREE.Matrix4().makeBasis(a, n, c) }
interface ChainRest { u0: THREE.Vector3; f0: THREE.Vector3; n0: THREE.Vector3 }
const chainRest = (a: V3, b: V3, c: V3): ChainRest => { const u0 = v3(b).sub(v3(a)).normalize(), f0 = v3(c).sub(v3(b)).normalize(); return { u0, f0, n0: new THREE.Vector3().crossVectors(u0, f0).normalize() } }
const CR: Partial<Record<JazzWho, { arm: Record<number, ChainRest>; leg: Record<number, ChainRest> }>> = {}
function chainOf(D: WD) {
  return (CR[D.who] ??= {
    arm: { 1: chainRest(D.SH(1), D.EL(1), D.WR(1)), [-1]: chainRest(D.SH(-1), D.EL(-1), D.WR(-1)) },
    leg: { 1: chainRest(D.JP('thighL'), D.JP('shinL'), D.JP('footL')), [-1]: chainRest(D.JP('thighR'), D.JP('shinR'), D.JP('footR')) },
  })
}
const _res = { arm: 0, leg: 0, tip: 0 }
/** 最近一次 apply 的残差（米）：手腕 / 踝没够到的距离、指尖到接触目标的最大距离（验收用） */
export const jazzIkResidual = () => ({ ..._res })
function twoBone(S: THREE.Vector3, T: THREE.Vector3, L1: number, L2: number, poleV: V3, R: ChainRest, minD: number) {
  const d = T.clone().sub(S); let D = d.length(); const dh = d.clone().normalize()
  const Dc = clamp(D, minD, L1 + L2 - 0.002), miss = D - Dc; D = Dc
  const pole = v3(poleV); pole.addScaledVector(dh, -pole.dot(dh)); if (pole.lengthSq() < 1e-8) pole.set(0, 0, 1); pole.normalize()
  const ca = clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1), sa = Math.sqrt(1 - ca * ca)
  const E = S.clone().addScaledVector(dh, L1 * ca).addScaledVector(pole, L1 * sa), W = S.clone().addScaledVector(dh, D)
  const u1 = E.clone().sub(S).normalize(), f1 = W.clone().sub(E).normalize()
  let n1 = new THREE.Vector3().crossVectors(u1, f1)
  if (n1.lengthSq() < 1e-6) n1 = new THREE.Vector3().crossVectors(dh, pole).multiplyScalar(-1)
  n1.normalize()
  const Ru = new THREE.Quaternion().setFromRotationMatrix(frameM(u1, n1).multiply(frameM(R.u0, R.n0).transpose()))
  const Rf = new THREE.Quaternion().setFromRotationMatrix(frameM(f1, n1).multiply(frameM(R.f0, R.n0).transpose()))
  return { Ru, Rf, miss: Math.max(0, miss) }
}
function setFingers(D: WD, A: JazzArm, fl: number[], tab: number, abd?: number[]) {
  FINGERS.forEach((f, i) => A.fingers[f].forEach((b, k) => {
    b.quaternion.setFromAxisAngle(b.userData.flexAxis as THREE.Vector3, fl[i * 3 + k] ?? 0)
    if (k === 0 && abd && abd[i]) b.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(v3(D.F[A.side].d), abd[i]))
  }))
  if (tab) A.fingers.thumb[0].quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(v3(D.F[A.side].d), tab))
}
/** 抬臂自动耸肩：腕目标高过肩时锁骨上抬（左 z+ / 右 z−）、略前探 */
function autoClav(S: THREE.Vector3, T: THREE.Vector3, s: number): V3 {
  const up = c01((T.y - S.y + 0.05) / 0.35)
  return [0, -s * 0.06 * up, s * 0.22 * up]
}
interface HeadDelta { q: THREE.Quaternion; p: THREE.Vector3; pp: THREE.Vector3 }
// ---------- 避让衣身：手 / 肘不进礼服芯（静止 coatCore，按当前躯干骨换回静止坐标）----------
const CORE: Partial<Record<JazzWho, (x: number, y: number, z: number) => number>> = {}
/** 衣身芯（礼服下摆以下截平——coatCore 本身往下无限延伸，下摆以下是裤腿，不算衣身） */
const coreOf = (D: WD) => (CORE[D.who] ??= (() => { const B = makeJazzBody(D.R), f = B.coatCore, hy = B.hemY; return (x: number, y: number, z: number) => Math.max(f(x, y, z), hy - y) })())
interface TrunkX { hips: Xf; spine: Xf; chest: Xf }
function trunkNow(rig: JazzRig): TrunkX { return { hips: fk(rig.hips, rig.root), spine: fk(rig.spine, rig.root), chest: fk(rig.chest, rig.root) } }
/** root 空间点 → 躯干静止坐标（按静止高度选 hips / spine / chest 骨） */
function toRest(D: WD, X: TrunkX, p: THREE.Vector3): THREE.Vector3 {
  const back = (n: 'hips' | 'spine' | 'chest') => p.clone().sub(X[n].p).applyQuaternion(X[n].q.clone().invert()).add(v3(D.JP(n)))
  const qs = back('spine')
  return qs.y < D.JP('spine')[1] - 0.04 ? back('hips') : qs.y > D.JP('chest')[1] - 0.03 ? back('chest') : qs
}
/** 点 p 到衣身的有符号距离 + root 空间外法线 */
function torsoD(D: WD, X: TrunkX, p: THREE.Vector3): { d: number; n: THREE.Vector3 } {
  const f = coreOf(D), r = toRest(D, X, p), e = 0.004
  const d = f(r.x, r.y, r.z)
  const g = new THREE.Vector3(f(r.x + e, r.y, r.z) - f(r.x - e, r.y, r.z), f(r.x, r.y + e, r.z) - f(r.x, r.y - e, r.z), f(r.x, r.y, r.z + e) - f(r.x, r.y, r.z - e)).normalize()
  // 法线换回 root 空间（用 spine 的转动近似）
  return { d, n: g.applyQuaternion(X.spine.q) }
}
/** 静止时腕 / 肘离衣身的距离（垂手本来就贴着衣身侧面：避让间隙不超过它） */
const REST_CLR: Partial<Record<JazzWho, Record<number, { w: number; e: number }>>> = {}
function restClr(D: WD) {
  if (REST_CLR[D.who]) return REST_CLR[D.who]!
  const f = coreOf(D), o: Record<number, { w: number; e: number }> = {}
  for (const s of [1, -1]) { const w = D.WR(s), e = D.EL(s); o[s] = { w: f(w[0], w[1], w[2]), e: f(e[0], e[1], e[2]) } }
  return (REST_CLR[D.who] = o)
}
// ---------- [修订 E197 肘] 肘极向（swivel）自动校正 + 前臂扭转分配 ----------
/** 肘最大弯曲（关节角限制）：肩腕距不小于对应长度（原来只限 10 cm ≈ 160°，前臂几乎贴上臂） */
const ELBOW_MAX_BEND = (148 * Math.PI) / 180
const armDmin = (D: WD) => Math.sqrt(D.LU * D.LU + D.LF * D.LF + 2 * D.LU * D.LF * Math.cos(ELBOW_MAX_BEND))
/** 前臂扭转由前臂骨分担的比例（其余留在腕） */
const TW_SHARE = 0.5
/** 极向自动校正：片段给的极向为先验，绕「肩 → 腕」轴转 φ，代价 = φ² + 扭转超限² + 肘尖朝向（jazzElbowGoal）不足² + 肘 / 上臂 / 前臂进衣身² +（低音提琴）肘进琴身²。
 *  代价随时间连续 → 极向连续（网格 softmin，|φ| ≤ POLE_MAX；不按帧记状态，预览 / 截图 / 自检同一结果） */
const POLE_MAX = 1.35, POLE_TAU = 0.08, POLE_TW0 = (40 * Math.PI) / 180, POLE_DIR0 = 0.3, POLE_KT = 4, POLE_KD = 24, POLE_KC = 20000
/** 上臂 0.55 / 0.8、肘、前臂 0.3 / 0.6 处的避让间隙：袖半径 + 1.3 cm，不超过静止时离衣身的距离 */
const ARM_CLR: Partial<Record<JazzWho, Record<number, { u: number; u2: number; e: number; f: number; f2: number }>>> = {}
function armClr(D: WD, s: number) {
  const o = (ARM_CLR[D.who] ??= {})
  if (o[s]) return o[s]
  const f = coreOf(D), Sp = v3(D.SH(s)), E = v3(D.EL(s)), W = v3(D.WR(s)), at = (p: THREE.Vector3) => f(p.x, p.y, p.z)
  const ru = D.R.P.armR + 0.013, rf = D.R.P.foreR + 0.013
  const c = (p: THREE.Vector3, r: number) => Math.min(r, at(p) - 0.002)
  return (o[s] = { u: c(Sp.clone().lerp(E, 0.55), ru), u2: c(Sp.clone().lerp(E, 0.8), ru), e: c(E, rf), f: c(E.clone().lerp(W, 0.3), rf), f2: c(E.clone().lerp(W, 0.6), rf) })
}
/** 肘尖期望朝向（胸局部）：手在肩下 / 身前时「外 + 下 + 后」；手举过肩时渐变成「外 + 下 + 前」（端东西到脸旁、托头顶的乐器——肘在身前下方，
 *  不往后上翘成鸡翅）。w = 腕相对肩（胸局部）。自检的「肘向」用同一个函数 */
export function jazzElbowGoal(s: number, w: THREE.Vector3): THREE.Vector3 {
  const h = ss((w.y + 0.05) / 0.2)
  return new THREE.Vector3(s, -0.8 - 0.2 * h, -0.35 + 1.2 * h).normalize()
}
/** 四元数 q 绕单位轴 ax 的扭转角（swing-twist，−π..π） */
function twistAbout(q: THREE.Quaternion, ax: THREE.Vector3): number { let a = 2 * Math.atan2(q.x * ax.x + q.y * ax.y + q.z * ax.z, q.w); if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a }
/** 低音提琴琴身（压在两肩上，下琴腹比肩宽）近似体：头局部圆角盒的有符号距离（只给 bass；其他人返回 1） */
function instSdf(D: WD, H: Xf, p: THREE.Vector3): number {
  if (D.who !== 'bass') return 1
  const q = p.clone().sub(H.p).applyQuaternion(H.q.clone().invert())
  const hw = BASS.wLow / 2 + 0.005, y0 = BASS.y0, y1 = BASS.y0 + BASS.h, zf = BASS_TOPZ, zb = BASS.z0 - BASS.rib / 2
  const a = Math.abs(q.x) - hw * (q.y > y0 + BASS.h * 0.55 ? 0.78 : 1), b = Math.max(y0 - q.y, q.y - y1), c = Math.max(zb - q.z, q.z - zf)
  return Math.min(Math.max(a, b, c), 0) + Math.hypot(Math.max(a, 0), Math.max(b, 0), Math.max(c, 0))
}
function autoPole(D: WD, X: TrunkX, s: number, S: THREE.Vector3, T: THREE.Vector3, poleA: THREE.Vector3, qW: THREE.Quaternion, hw: number, H: Xf): THREE.Vector3 {
  const dh = T.clone().sub(S).normalize()
  const p0 = poleA.clone().addScaledVector(dh, -poleA.dot(dh)); if (p0.lengthSq() < 1e-8) return poleA
  p0.normalize()
  const b = new THREE.Vector3().crossVectors(dh, p0)
  const R = chainOf(D).arm[s], f0 = R.f0, qChI = X.chest.q.clone().invert(), g = jazzElbowGoal(s, T.clone().sub(S).applyQuaternion(qChI))
  // 弯得越少，肘尖朝向越无所谓（直臂时极向只决定上臂自转）
  const Dd = clamp(T.distanceTo(S), armDmin(D), D.LU + D.LF - 0.002), ca = clamp((D.LU * D.LU + D.LF * D.LF - Dd * Dd) / (2 * D.LU * D.LF), -1, 1)
  const bend = Math.PI - Math.acos(ca), wb = ss((bend - 0.2) / 0.5)
  const hwc = c01(hw), pv = new THREE.Vector3(), cl = armClr(D, s)
  const cost = (phi: number) => {
    pv.copy(p0).multiplyScalar(Math.cos(phi)).addScaledVector(b, Math.sin(phi))
    let c = phi * phi
    if (hwc > 0) {
      const { Rf } = twoBone(S, T, D.LU, D.LF, [pv.x, pv.y, pv.z], R, armDmin(D))
      const qF = hwc >= 1 ? qW : Rf.clone().slerp(qW, hwc)
      const tw = Math.abs(twistAbout(Rf.clone().invert().multiply(qF), f0))
      c += POLE_KT * Math.max(0, tw - POLE_TW0) ** 2
    }
    const dd = pv.clone().applyQuaternion(qChI).dot(g)
    c += POLE_KD * wb * Math.max(0, POLE_DIR0 - dd) ** 2
    // 肘 / 上臂中段 / 前臂中段离衣身（袖半径 + 1.3 cm，不超过静止时的距离）：不让校正把肘转进肚子
    const ca2 = clamp((D.LU * D.LU + Dd * Dd - D.LF * D.LF) / (2 * D.LU * Dd), -1, 1)
    const E = S.clone().addScaledVector(dh, D.LU * ca2).addScaledVector(pv, D.LU * Math.sqrt(1 - ca2 * ca2))
    for (const [p, clr] of [[S.clone().lerp(E, 0.55), cl.u], [S.clone().lerp(E, 0.8), cl.u2], [E, cl.e], [E.clone().lerp(T, 0.3), cl.f], [E.clone().lerp(T, 0.6), cl.f2]] as [THREE.Vector3, number][]) {
      const r = toRest(D, X, p), d = coreOf(D)(r.x, r.y, r.z)
      c += POLE_KC * Math.max(0, clr - d) ** 2
    }
    // 肘别插进乐器头（低音提琴琴身）：袖半径 + 1 cm
    if (D.who === 'bass') for (const k of [0.7, 1]) { const d = instSdf(D, H, S.clone().lerp(E, k)); c += POLE_KC * Math.max(0, D.R.P.armR + 0.01 - d) ** 2 }
    return c
  }
  // 软最小（softmin）：在 |φ| ≤ POLE_MAX 的网格上按 exp(−(c − c_min)/τ) 加权平均——输入连续 → 输出连续；
  // 两个谷代价相近时在两谷之间平滑过渡，不像 argmin / 牛顿迭代那样一帧跳到另一个谷（肘前后翻）
  const N = 24, cs: number[] = [], ph: number[] = []
  for (let i = 0; i <= N; i++) { const x = -POLE_MAX + (2 * POLE_MAX * i) / N; ph.push(x); cs.push(cost(x)) }
  const cmin = Math.min(...cs)
  let sw = 0, sp = 0
  for (let i = 0; i <= N; i++) { const w = Math.exp(-(cs[i] - cmin) / POLE_TAU); sw += w; sp += w * ph[i] }
  const phi = sp / sw
  return p0.multiplyScalar(Math.cos(phi)).addScaledVector(b, Math.sin(phi))
}
function solveArm(D: WD, rig: JazzRig, A: JazzArm, s: number, P: JArmPose, hd: HeadDelta | null) {
  const root = rig.root
  const mv = (v: THREE.Vector3) => (hd && P.ht > 0 ? v.clone().lerp(v.clone().sub(hd.pp).applyQuaternion(hd.q).add(hd.p), c01(P.ht)) : v)
  let qWorld = new THREE.Quaternion(...P.hq)
  if (hd && P.ht > 0) qWorld = qWorld.clone().slerp(hd.q.clone().multiply(qWorld), c01(P.ht))
  let T = mv(v3(P.t))
  if (P.pw > 0) T.lerp(mv(v3(P.pp)).sub(palmLocal(D, s, P.pk).applyQuaternion(qWorld)), c01(P.pw))
  // 锁骨：片段给的 + 抬臂自动
  setE(A.clav, [0, 0, 0])
  const S0 = fk(A.shoulder, root).p
  const ac = autoClav(S0, T, s)
  setE(A.clav, addV(P.clav, ac))
  const S = fk(A.shoulder, root).p
  // 避让衣身：腕 / 掌心 / 中指尖不进礼服芯（间隙 2.6 / 2.2 / 1.0 cm，不超过静止垂手时的距离）；肘（2 cm）进了就把肘极向往外推、重解
  const X = trunkNow(rig), rc = restClr(D)[s]
  // [修订 E197 肘] 避让用的手朝向 = 实际会用的朝向：hw < 1 时手部分跟前臂（先按片段极向预解一次取前臂朝向）。
  // 原来一律用 hq——收手回垂手时 hw → 0 而 hq 还是「贴肚子」的朝向，算出来的指尖扎进衣身，把垂手目标往外推十几厘米：手臂外撇、末尾肘部突跳
  const qAvoid = P.hw >= 1 ? qWorld : twoBone(S, T, D.LU, D.LF, P.pole, chainOf(D).arm[s], armDmin(D)).Rf.slerp(qWorld, c01(P.hw))
  const offs: [THREE.Vector3, number][] = [[new THREE.Vector3(), Math.min(0.02, rc.w - 0.002)], [palmLocal(D, s, 0).applyQuaternion(qAvoid), 0.004], ...(['thumb', 'index', 'middle', 'pinky'] as FName[]).map((f): [THREE.Vector3, number] => [v3(D.fing[s][f].j[3]).applyQuaternion(qAvoid), 0.008])]
  // 有意贴着衣身（pw 满）的那几点：间隙不超过它在目标处的距离
  // 有意贴着衣身：间隙按「它在目标处的距离」放宽（touch 连续过渡）
  const tch = c01(P.touch ?? 0)
  if (tch > 0) { const tgt = P.pw > 0.5 ? v3(P.pp).sub(palmLocal(D, s, P.pk).applyQuaternion(qWorld)) : T; for (const oc of offs) oc[1] = mix(oc[1], Math.min(oc[1], torsoD(D, X, tgt.clone().add(oc[0])).d - 0.001), tch) }
  // 连续的避让（固定迭代次数、按陷入量加权求和，不按「最差点」切换——否则会一帧跳变）
  for (let it = 0; it < 4; it++) {
    const push = new THREE.Vector3()
    for (const [o, clr] of offs) { const r = torsoD(D, X, T.clone().add(o)); const def = clr - r.d; if (def > 0) push.addScaledVector(r.n, def) }
    T.addScaledVector(push, 0.9)
  }
  let pole = autoPole(D, X, s, S, T, v3(P.pole), qWorld, P.hw, fk(rig.head, root))
  let sol = twoBone(S, T, D.LU, D.LF, [pole.x, pole.y, pole.z], chainOf(D).arm[s], armDmin(D))
  const sr = D.R.P.foreR + 0.013
  for (let it = 0; it < 3; it++) {
    const E = S.clone().add(new THREE.Vector3(D.EL(s)[0] - D.SH(s)[0], D.EL(s)[1] - D.SH(s)[1], D.EL(s)[2] - D.SH(s)[2]).applyQuaternion(sol.Ru))
    // 前臂袖：肘 → 腕 4 个采样点，袖半径 ≈ 前臂 + 1.3 cm（不超过静止时离衣身的距离；有意贴身时靠腕一端放宽）
    const pp = new THREE.Vector3(), tp = new THREE.Vector3()
    for (const u of [0, 0.25, 0.5, 0.75]) {
      const p = E.clone().lerp(T, u), clr = Math.min(sr * (1 - 0.9 * u * tch), mix(rc.e, rc.w, u) - 0.002), r = torsoD(D, X, p), def = clr - r.d
      if (def > 0) { pp.addScaledVector(r.n, def * (1 - u)); tp.addScaledVector(r.n, def * u) }
    }
    pole.addScaledVector(pp, 12)
    T.addScaledVector(tp, 0.35 * (1 - c01(P.ht)) * (1 - tch))
    sol = twoBone(S, T, D.LU, D.LF, [pole.x, pole.y, pole.z], chainOf(D).arm[s], armDmin(D))
  }
  const { Ru, Rf, miss } = sol
  _res.arm = Math.max(_res.arm, miss)
  setRootQ(A.shoulder, root, Ru)
  const qFinal = P.hw >= 1 ? qWorld : Rf.clone().slerp(qWorld, c01(P.hw))
  // [修订 E197 肘] 前臂扭转分配：手相对「肘铰链中立前臂」的扭转 τ，前臂骨滚 TW_SHARE·τ、腕只剩 (1 − TW_SHARE)·τ（腕部蒙皮过渡不再拧成糖果纸）
  const f0 = chainOf(D).arm[s].f0, tau = twistAbout(Rf.clone().invert().multiply(qFinal), f0)
  const Rf2 = Rf.clone().multiply(new THREE.Quaternion().setFromAxisAngle(f0, TW_SHARE * tau))
  A.elbow.quaternion.copy(Ru.clone().invert().multiply(Rf2))
  A.wrist.quaternion.copy(Rf2.clone().invert().multiply(qFinal))
  // 手指：基础屈曲；指尖接触组按实际手 / 头位置逐指解
  let fl = P.fl, abd: number[] | undefined
  if (P.tips.w > 0.001 && TIP_FINGERS[P.tips.set]) {
    const head = fk(rig.head, root)
    const T2 = jazzTipTargets(P.tips, head)
    const hx = fk(A.wrist, root), qi = hx.q.clone().invert()
    fl = P.fl.slice(); abd = [0, 0, 0, 0, 0]
    TIP_FINGERS[P.tips.set].forEach((f, k) => {
      const i = FINGERS.indexOf(f)
      const nat = tipLocal(D, s, f, [0, P.fl[i * 3], P.fl[i * 3 + 1], P.fl[i * 3 + 2]]).applyQuaternion(hx.q).add(hx.p)
      const loc = v3(jazzTipGoal(T2[k], nat)).sub(hx.p).applyQuaternion(qi)
      const r = solveFinger(D, s, f, loc, [P.fl[i * 3], P.fl[i * 3 + 1]])
      const w = c01(P.tips.w)
      abd![i] = r.ang[0] * w; for (let j = 0; j < 3; j++) fl[i * 3 + j] = mix(P.fl[i * 3 + j], r.ang[j + 1], w)
      if (w >= 0.999) _res.tip = Math.max(_res.tip, r.err)
    })
  }
  setFingers(D, A, fl, P.tab, abd)
}
const _ax = new THREE.Vector3(1, 0, 0), _ay = new THREE.Vector3(0, 1, 0)
function ankleOf(D: WD, L: JLegPose, s: number): THREE.Vector3 {
  const qy = new THREE.Quaternion().setFromAxisAngle(_ay, L.yw)
  const toeJ = v3(L.p).add(new THREE.Vector3(0, D.TOE_H, 0))
  const oA = v3([D.FOOT_A[0] * s, D.FOOT_A[1], D.FOOT_A[2]]).applyQuaternion(qy), oH = v3([D.FOOT_H[0] * s, D.FOOT_H[1], D.FOOT_H[2]]).applyQuaternion(qy)
  const qp = new THREE.Quaternion().setFromAxisAngle(_ax.clone().applyQuaternion(qy), L.ph)
  return L.ph >= 0 ? toeJ.clone().add(oA.applyQuaternion(qp)) : toeJ.clone().add(oH).add(oA.clone().sub(oH).applyQuaternion(qp))
}
function legPole(L: JLegPose, s: number): THREE.Vector3 { return new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(_ay, L.yw * 1.1 + s * 0.05)).add(new THREE.Vector3(0, 0.15, 0)) }
function solveLeg(D: WD, rig: JazzRig, s: number, P: JLegPose) {
  const root = rig.root, Lg = s > 0 ? rig.legL : rig.legR
  const qy = new THREE.Quaternion().setFromAxisAngle(_ay, P.yw)
  const qp = new THREE.Quaternion().setFromAxisAngle(_ax.clone().applyQuaternion(qy), P.ph)
  const ankle = ankleOf(D, P, s), H = fk(Lg.hip, root).p, pole = legPole(P, s)
  const { Ru, Rf, miss } = twoBone(H, ankle, D.LT, D.LS, [pole.x, pole.y, pole.z], chainOf(D).leg[s], 0.2)
  _res.leg = Math.max(_res.leg, miss)
  setRootQ(Lg.hip, root, Ru)
  Lg.knee.quaternion.copy(Ru.clone().invert().multiply(Rf))
  Lg.ankle.quaternion.copy(Rf.clone().invert().multiply(qp.clone().multiply(qy)))
  Lg.toe.quaternion.setFromAxisAngle(_ax, -Math.max(0, P.ph) * P.tf)
}

// ---------- 二阶：头惯性 / 下摆 / 弦 / 镲 / 鼓皮 / 活塞回弹 ----------
interface Spring3 { x: THREE.Vector3; v: THREE.Vector3; last: THREE.Vector3; lastV: THREE.Vector3 }
interface Dyn { init: boolean; ly: number; lp: number; hem: number[]; hemV: number[]; head: Spring3; cym: number[]; cymV: number[]; valve: number[]; valveV: number[]; key: number[]; keyV: number[] }
const sp3 = (): Spring3 => ({ x: new THREE.Vector3(), v: new THREE.Vector3(), last: new THREE.Vector3(), lastV: new THREE.Vector3() })
function dynOf(rig: JazzRig): Dyn {
  const R = rig as JazzRig & { __jdyn?: Dyn }
  return (R.__jdyn ??= { init: false, ly: 0, lp: 0, hem: [0, 0, 0, 0], hemV: [0, 0, 0, 0], head: sp3(), cym: [0, 0, 0, 0], cymV: [0, 0, 0, 0], valve: [0, 0, 0], valveV: [0, 0, 0], key: [0, 0, 0, 0, 0, 0], keyV: [0, 0, 0, 0, 0, 0] })
}
export function resetJazzDynamics(rig: JazzRig) {
  const d = dynOf(rig); d.init = false; d.ly = 0; d.lp = 0
  for (const a of [d.hem, d.hemV, d.cym, d.cymV, d.valve, d.valveV, d.key, d.keyV]) a.fill(0)
  d.head.x.set(0, 0, 0); d.head.v.set(0, 0, 0); d.head.lastV.set(0, 0, 0)
}
/** 下摆骨（礼服下摆后 / 侧）：跟大腿前屈 0.9–1.0 + 弹簧滞后 */
function applyHem(rig: JazzRig, dt: number | undefined) {
  const Dy = dynOf(rig)
  for (const s of [1, -1]) {
    const i = s > 0 ? 0 : 2, th = (s > 0 ? rig.legL : rig.legR).hip
    const dir = new THREE.Vector3(0, -1, 0).applyQuaternion(th.quaternion)
    const flex = Math.atan2(dir.z, -dir.y), abd = Math.atan2(dir.x, Math.hypot(dir.y, dir.z))
    const fx = flex * (flex > 0 ? 0.95 : 0.85), ab = abd * 0.6
    if (dt === undefined || !Dy.init) { Dy.hem[i] = fx; Dy.hem[i + 1] = ab; Dy.hemV[i] = 0; Dy.hemV[i + 1] = 0 }
    else if (dt > 0) {
      const h = Math.min(dt, 0.05), K = 160, Cd = 12
      for (const [j, tg] of [[i, fx], [i + 1, ab]] as [number, number][]) { Dy.hemV[j] += (K * (tg - Dy.hem[j]) - Cd * Dy.hemV[j]) * h; Dy.hem[j] += Dy.hemV[j] * h }
      if (fx > 0) Dy.hem[i] = clamp(Dy.hem[i], fx * 0.85, fx + 0.05)
    }
    const b = s > 0 ? rig.hemL : rig.hemR
    b.rotation.order = 'XYZ'; b.rotation.set(-Dy.hem[i], 0, Dy.hem[i + 1])
  }
}
function stepSpring(S: Spring3, pt: THREE.Vector3, qParent: THREE.Quaternion, dt: number | undefined, init: boolean, f: number, zeta: number, gain: number, lim: number) {
  if (dt && dt > 0 && init) {
    const vel = pt.clone().sub(S.last).divideScalar(dt)
    const acc = vel.clone().sub(S.lastV).divideScalar(dt).clampLength(0, 60).applyQuaternion(qParent.clone().invert())
    const K = (TAU * f) ** 2, Cd = 2 * zeta * Math.sqrt(K)
    const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n
    for (let it = 0; it < n; it++) { S.v.addScaledVector(S.x, -K * h).addScaledVector(S.v, -Cd * h).addScaledVector(acc, -gain * h); S.x.addScaledVector(S.v, h); S.x.clampLength(0, lim) }
    S.lastV.copy(vel)
  } else if (!init || dt === undefined) { S.x.set(0, 0, 0); S.v.set(0, 0, 0); S.lastV.set(0, 0, 0) }
  S.last.copy(pt)
}
/** 头惯性参数：低音提琴头重（低频、大增益、阻尼小） */
const HEAD_DYN: Record<JazzWho, { f: number; z: number; g: number; L: number; c: V3 }> = {
  leader: { f: 2.8, z: 0.3, g: 1.0, L: 0.2, c: [0, 0.15, 0.1] }, sax: { f: 2.4, z: 0.28, g: 1.0, L: 0.3, c: [0, 0.25, 0.03] },
  bass: { f: 1.5, z: 0.18, g: 1.6, L: 0.45, c: [0, 0.4, 0.02] }, drum: { f: 2.6, z: 0.28, g: 1.0, L: 0.25, c: [0, 0.25, 0.03] },
}
function applyHeadDyn(D: WD, rig: JazzRig, P: JazzAnimPose, dt: number | undefined) {
  const Dy = dynOf(rig), hp = HEAD_DYN[D.who]
  const nx = fk(rig.neck, rig.root)
  const pt = fk(rig.head, rig.root), top = v3(hp.c).applyQuaternion(pt.q).add(pt.p)
  stepSpring(Dy.head, top, nx.q, dt, Dy.init, hp.f, hp.z, hp.g * P.headDyn, 0.06 * hp.L / 0.3)
  // 位移 → 绕头关节的小转角（x 前后 → 俯仰；x 左右 → 侧歪）
  const x = Dy.head.x, L = hp.L
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(clamp(x.z / L, -0.25, 0.25), 0, clamp(-x.x / L, -0.25, 0.25), 'XYZ'))
  rig.head.quaternion.premultiply(q)
}
/** [修] 注视层：目标点（root 空间）→ 相对片段当前头朝向的偏航 / 俯仰误差 → 限角（演奏时收小、低音提琴 ×bassK、目标在身后渐弱）→ 指数趋近 + 角速度上限 → 颈 / 头分摊 */
function applyLook(D: WD, rig: JazzRig, P: JazzAnimPose, o: JazzAnimOpts) {
  const Dy = dynOf(rig), L = JAZZ_LOOK, lk = o.look
  let ty = 0, tp = 0
  if (lk && lk.p && (lk.w ?? 1) > 0) {
    const h = fk(rig.head, rig.root), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(h.q)
    const eye = v3(HEAD_DYN[D.who].c).applyQuaternion(h.q).add(h.p), d = v3(lk.p).sub(eye)
    const k = D.who === 'bass' ? L.bassK : 1
    const ey = Math.atan2(Math.sin(Math.atan2(d.x, d.z) - Math.atan2(fwd.x, fwd.z)), Math.cos(Math.atan2(d.x, d.z) - Math.atan2(fwd.x, fwd.z)))
    const behind = ss((2.5 - Math.abs(ey)) / 0.6) // 目标跑到身后：不硬扭
    const w = clamp(lk.w ?? 1, 0, 1) * behind
    const yl = (lk.play ? L.playYaw : L.yaw) * k
    const ep = Math.atan2(-d.y, Math.hypot(d.x, d.z)) - Math.atan2(-fwd.y, Math.hypot(fwd.x, fwd.z))
    ty = clamp(ey, -yl, yl) * w
    tp = clamp(ep, -(lk.play ? L.playPitch : L.pitchUp) * k, (lk.play ? L.playPitch : L.pitchDown) * k) * w
  }
  if (!Dy.init || o.dt === undefined) { if (!Dy.init) { Dy.ly = ty; Dy.lp = tp } }
  else if (o.dt > 0) {
    const a = 1 - Math.exp(-L.rate * o.dt), mx = L.maxSpeed * o.dt
    Dy.ly += clamp((ty - Dy.ly) * a, -mx, mx); Dy.lp += clamp((tp - Dy.lp) * a, -mx, mx)
  }
  if (Math.abs(Dy.ly) + Math.abs(Dy.lp) < 1e-7) return
  const sh = L.neckShare
  setE(rig.neck, [P.neck[0] + Dy.lp * sh, P.neck[1] + Dy.ly * sh, P.neck[2]])
  setE(rig.head, [P.head[0] + Dy.lp * (1 - sh), P.head[1] + Dy.ly * (1 - sh), P.head[2]])
}
/** 验收：注视层当前叠加的偏航 / 俯仰（rad） */
export function jazzLookState(rig: JazzRig) { const d = dynOf(rig); return { yaw: d.ly, pitch: d.lp } }
/** 乐器骨：活塞（按下量带回弹过冲）、萨克斯键、弦振动、鼓皮、镲 */
function applyInst(rig: JazzRig, P: JazzAnimPose, dt: number | undefined, time: number) {
  const Dy = dynOf(rig), I = rig.inst, ip = P.inst
  const spr = (x: number[], v: number[], tg: number[], f: number, z: number) => {
    for (let i = 0; i < x.length; i++) {
      if (dt === undefined || !Dy.init) { x[i] = tg[i]; v[i] = 0; continue }
      const K = (TAU * f) ** 2, Cd = 2 * z * Math.sqrt(K), n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n
      for (let k = 0; k < n; k++) { v[i] += (K * (tg[i] - x[i]) - Cd * v[i]) * h; x[i] += v[i] * h }
      // 按下时跟手（活塞 / 键不能比手指更深 → 按下侧直接取目标；松开时弹簧回弹带过冲）
      if (tg[i] > x[i]) { x[i] = tg[i]; v[i] = 0 }
    }
  }
  if (rig.who === 'leader') {
    spr(Dy.valve, Dy.valveV, ip.valve, 14, 0.25)
    for (let i = 0; i < 3; i++) { const b = I['valve' + (i + 1)]; b.position.y = (b.userData.rest.p as THREE.Vector3).y - VALVE_TRAVEL * clamp(Dy.valve[i], -0.15, 1) }
  } else if (rig.who === 'sax') {
    spr(Dy.key, Dy.keyV, ip.key, 18, 0.3)
    for (let i = 0; i < 6; i++) { const b = I['key' + (i + 1)]; b.position.z = (b.userData.rest.p as THREE.Vector3).z - KEY_TRAVEL * clamp(Dy.key[i], -0.2, 1) }
    I.octKey.rotation.x = 0.22 * ip.oct; I.keyS.position.x = (I.keyS.userData.rest.p as THREE.Vector3).x - 0.003 * ip.keyS
  } else if (rig.who === 'bass') {
    for (let i = 0; i < 4; i++) {
      const b = I['str' + (i + 1)], r = b.userData.rest.p as THREE.Vector3, a = ip.str[i]
      b.position.x = r.x + a * Math.sin(time * TAU * (11.3 + i * 2.7) + i)
      b.position.z = r.z + 0.4 * a * Math.sin(time * TAU * (13.1 + i * 3.1) + 2 * i)
    }
  } else {
    const r = I.drumHead.userData.rest.p as THREE.Vector3
    I.drumHead.position.z = r.z - 0.007 * ip.drum * Math.abs(Math.cos(time * TAU * 9))
    // 镲：阻尼摆（激励 = 包络 × 噪声），两轴
    const tgt = [ip.cymL * 0.16 * Math.sin(time * TAU * 5.3), ip.cymL * 0.1 * Math.sin(time * TAU * 4.1 + 1), ip.cymR * 0.16 * Math.sin(time * TAU * 5.7 + 2), ip.cymR * 0.1 * Math.sin(time * TAU * 4.4 + 3)]
    if (dt === undefined || !Dy.init) for (let i = 0; i < 4; i++) { Dy.cym[i] = tgt[i]; Dy.cymV[i] = 0 }
    else { const K = (TAU * 6) ** 2, Cd = 2 * 0.12 * Math.sqrt(K), n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n; for (let i = 0; i < 4; i++) for (let k = 0; k < n; k++) { Dy.cymV[i] += (K * (tgt[i] - Dy.cym[i]) - Cd * Dy.cymV[i]) * h; Dy.cym[i] += Dy.cymV[i] * h } }
    I.cymL.rotation.set(Dy.cym[0], 0, Dy.cym[1]); I.cymR.rotation.set(Dy.cym[2], 0, Dy.cym[3])
  }
}

// ---------- 道具（本文件自建，挂 root）：啤酒杯 + 酒流、魂雾、乐谱 ----------
interface MistGL { ribbon: THREE.Mesh; motes: THREE.Points; rMat: THREE.ShaderMaterial; pMat: THREE.ShaderMaterial }
interface PropState { mug: THREE.Group; pour: THREE.Mesh; mist: THREE.Group; gl: MistGL; sheet: THREE.Mesh }
/** [修] 魂雾：丝带（每根 segs + 1 个截面 × 2 顶点；顶点着色器按相机把截面横向撑开 = 相机朝向的拉丝）+ 软粒子（点精灵，径向软边）。
 *  都是加性混合、不写深度、按视深淡入（近处 near 以内全透明，免得糊在镜头上）/ 远处淡出；颜色 / 不透明度走 uniform（假 = 冷白蓝，真 = 暖红）。 */
const MIST_VS = `attribute float aSide; attribute vec3 aTan; attribute float aA; attribute float aW; attribute float aU;
varying float vA; varying float vS; varying float vU; varying float vD;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 tv = (modelViewMatrix * vec4(aTan, 0.0)).xyz;
  vec3 sd = cross(normalize(tv + vec3(1e-5)), normalize(-mv.xyz)); float l = length(sd); sd = l > 1e-4 ? sd / l : vec3(1.0, 0.0, 0.0);
  mv.xyz += sd * aSide * aW; vA = aA; vS = aSide; vU = aU; vD = -mv.z; gl_Position = projectionMatrix * mv; }`
const MIST_FS = `uniform vec3 uColor; uniform float uOpacity; uniform float uTime; uniform float uSoft; uniform float uNear; uniform float uFar; uniform float uFlow;
varying float vA; varying float vS; varying float vU; varying float vD;
void main(){ float e = clamp(1.0 - abs(vS), 0.0, 1.0); float soft = pow(e, uSoft);
  float flow = 0.5 + 0.5 * sin(vU * 21.0 - uTime * uFlow); flow = 0.35 + 0.65 * flow * flow;
  float df = smoothstep(uNear, uNear * 3.0, vD) * (1.0 - smoothstep(uFar * 0.6, uFar, vD));
  float a = soft * vA * flow * df * uOpacity; if (a < 0.002) discard; gl_FragColor = vec4(uColor, a); }`
const MOTE_VS = `attribute float aA; attribute float aSize; uniform float uScale; varying float vA; varying float vD;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = aA; vD = -mv.z; gl_PointSize = clamp(aSize * uScale / max(0.2, -mv.z), 1.0, 64.0); gl_Position = projectionMatrix * mv; }`
const MOTE_FS = `uniform vec3 uColor; uniform float uOpacity; uniform float uSoft; uniform float uNear; uniform float uFar; varying float vA; varying float vD;
void main(){ vec2 c = gl_PointCoord * 2.0 - 1.0; float r2 = dot(c, c); if (r2 > 1.0) discard; float soft = pow(1.0 - r2, uSoft);
  float df = smoothstep(uNear, uNear * 3.0, vD) * (1.0 - smoothstep(uFar * 0.6, uFar, vD)); float a = soft * vA * df * uOpacity; if (a < 0.002) discard; gl_FragColor = vec4(uColor, a); }`
function mistMats(): [THREE.ShaderMaterial, THREE.ShaderMaterial] {
  const M = JAZZ_MIST
  const common = { transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false }
  const rMat = new THREE.ShaderMaterial({ ...common, side: THREE.DoubleSide, vertexShader: MIST_VS, fragmentShader: MIST_FS, uniforms: { uColor: { value: new THREE.Color(M.fake) }, uOpacity: { value: M.opacity }, uTime: { value: 0 }, uSoft: { value: M.soft }, uNear: { value: M.near }, uFar: { value: M.far }, uFlow: { value: 4 } } })
  const pMat = new THREE.ShaderMaterial({ ...common, vertexShader: MOTE_VS, fragmentShader: MOTE_FS, uniforms: { uColor: { value: new THREE.Color(M.fake) }, uOpacity: { value: M.opacity }, uSoft: { value: M.moteSoft }, uScale: { value: 420 }, uNear: { value: M.near }, uFar: { value: M.far } } })
  rMat.name = 'jazzMistRibbon'; pMat.name = 'jazzMistMote'
  return [rMat, pMat]
}
function mistGL(): MistGL {
  const M = JAZZ_MIST, nV = M.strands * (M.segs + 1) * 2
  const g = new THREE.BufferGeometry()
  const side = new Float32Array(nV), idx: number[] = []
  for (let k = 0; k < M.strands; k++) for (let j = 0; j <= M.segs; j++) {
    const v = (k * (M.segs + 1) + j) * 2; side[v] = -1; side[v + 1] = 1
    if (j < M.segs) idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2)
  }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nV * 3), 3))
  g.setAttribute('aTan', new THREE.BufferAttribute(new Float32Array(nV * 3), 3))
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1))
  for (const n of ['aA', 'aW', 'aU']) g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(nV), 1))
  g.setIndex(idx)
  const [rMat, pMat] = mistMats()
  const ribbon = new THREE.Mesh(g, rMat); ribbon.name = 'jazzMistRibbons'; ribbon.frustumCulled = false; ribbon.renderOrder = 5
  const pg = new THREE.BufferGeometry()
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M.motes * 3), 3))
  pg.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(M.motes), 1)); pg.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(M.motes), 1))
  const motes = new THREE.Points(pg, pMat); motes.name = 'jazzMistMotes'; motes.frustumCulled = false; motes.renderOrder = 5
  return { ribbon, motes, rMat, pMat }
}
function props(rig: JazzRig, buildMug?: () => THREE.Group): PropState {
  const R = rig as JazzRig & { __jprops?: PropState }
  if (R.__jprops) return R.__jprops
  const mug = buildMug ? buildMug() : new THREE.Group(); mug.name = 'jazzMug'; mug.visible = false
  const pour = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), new THREE.MeshStandardMaterial({ color: '#d68a1a', roughness: 0.2, transparent: true, opacity: 0.8, emissive: '#3a1c00' })); pour.visible = false; pour.name = 'jazzPour'
  const mist = new THREE.Group(); mist.name = 'jazzMist'; mist.visible = false
  const gl = mistGL(); mist.add(gl.ribbon, gl.motes)
  // 一叠乐谱（收拾离场：两手之间；对折的米白纸，上面几道五线）
  const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.3, 0.22), new THREE.MeshStandardMaterial({ color: '#efe6cf', roughness: 0.9 })); sheet.name = 'jazzSheet'; sheet.visible = false
  rig.root.add(mug, pour, mist, sheet)
  return (R.__jprops = { mug, pour, mist, gl, sheet })
}
/** 啤酒杯：外部传入构建函数（jazzProps.buildBeerMug），避免动画模块依赖贴图画布 */
export function attachJazzMug(rig: JazzRig, build: () => THREE.Group) { props(rig, build) }
const MUG_GRIP_LOCAL = new THREE.Vector3(0.068, 0.075, 0) // 杯局部：把手中段（拳心握点）
const MUG_GRIP = MUG_GRIP_LOCAL
function applyProps(D: WD, rig: JazzRig, P: JazzAnimPose, time: number, mistFrom?: V3 | null) {
  const st = props(rig), pr = P.props
  st.mug.visible = pr.mug > 0.5
  const qY = new THREE.Quaternion().setFromAxisAngle(_ay, Math.PI) // 把手朝 −X（朝右手）
  if (pr.mug > 1.5) { st.mug.position.set(...JAZZ_MUG_AT); st.mug.quaternion.copy(qY) }
  else if (pr.mug > 0.5) {
    // 拳心 = 杯把握点；杯身按倾角往 +X（领口方向）倒
    const hx = fk(rig.armR.wrist, rig.root), fistP = palmLocal(D, -1, 1).applyQuaternion(hx.q).add(hx.p)
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -pr.mugTilt).multiply(qY)
    st.mug.quaternion.copy(q)
    st.mug.position.copy(fistP.sub(MUG_GRIP_LOCAL.clone().applyQuaternion(q)))
  }
  st.pour.visible = pr.pour > 0.02 && pr.mug > 0.5 && pr.mug < 1.5
  if (st.pour.visible) {
    const q = st.mug.quaternion, lip = new THREE.Vector3(-0.046, 0.15, 0).applyQuaternion(q).add(st.mug.position)
    const neck = fk(rig.chest, rig.root), collar = v3(D.JP('neck')).sub(v3(D.JP('chest'))).add(new THREE.Vector3(0, -0.01, 0.1)).applyQuaternion(neck.q).add(neck.p)
    const L = lip.distanceTo(collar), r = 0.008 * Math.sqrt(pr.pour)
    st.pour.position.copy(lip).lerp(collar, 0.5); st.pour.quaternion.setFromUnitVectors(_ay, lip.clone().sub(collar).normalize()); st.pour.scale.set(r, L, r)
  }
  st.mist.visible = pr.mist > 0.02
  if (st.mist.visible) updateMist(D, rig, st.gl, pr, time, mistFrom ?? null)
  // 乐谱：两手掌心中点，竖着夹在两掌之间
  st.sheet.visible = pr.sheet > 0.5
  if (st.sheet.visible) {
    const a = jazzPalmPoint(rig, 1, 0), b = jazzPalmPoint(rig, -1, 0)
    st.sheet.position.copy(a).lerp(b, 0.5)
    const ax = a.clone().sub(b); ax.y = 0; if (ax.lengthSq() < 1e-6) ax.set(1, 0, 0)
    st.sheet.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), ax.normalize())
  }
}
/** 魂雾逐帧：每根丝带从源（假 = 观众席一点；真 = 玩家胸口附近散开）沿弧线流向乐器口；两端透明、中段亮；假的流到 85 % 就散开，真的一直抽进口里 */
const _mv = new THREE.Vector3(), _mt = new THREE.Vector3(), _mq = new THREE.Vector3(), _src: THREE.Vector3[] = []
function updateMist(D: WD, rig: JazzRig, gl: MistGL, pr: JPropsPose, time: number, from: V3 | null) {
  const M = JAZZ_MIST, real = pr.mistReal > 0.5
  const head = fk(rig.head, rig.root), mouth = v3(HEAD_DYN[D.who].c).applyQuaternion(head.q).add(head.p).add(new THREE.Vector3(0, 0, 0.15))
  const g = gl.ribbon.geometry, P = g.getAttribute('position') as THREE.BufferAttribute, T = g.getAttribute('aTan') as THREE.BufferAttribute
  const A = g.getAttribute('aA') as THREE.BufferAttribute, Wd = g.getAttribute('aW') as THREE.BufferAttribute, U = g.getAttribute('aU') as THREE.BufferAttribute
  const src0 = real && from ? v3(from) : null
  while (_src.length < M.strands) _src.push(new THREE.Vector3())
  for (let k = 0; k < M.strands; k++) {
    const h1 = hash1(k * 3 + 1), h2 = hash1(k * 5 + 2), h3 = hash1(k * 7 + 3)
    if (src0) _src[k].set(src0.x + (h1 - 0.5) * 0.5, src0.y + (h2 - 0.5) * 0.5, src0.z + (h3 - 0.5) * 0.3)
    else _src[k].set((h1 - 0.5) * 2.4, 0.9 + h2 * 0.6, JAZZ_STAGE.audienceZ + h3 * 1.2)
  }
  const pt = (k: number, u: number, out: THREE.Vector3) => {
    const h2 = hash1(k * 5 + 2)
    const reach = real ? 1 : 0.85
    out.copy(_src[k]).lerp(mouth, u * reach)
    const sw = Math.sin(u * Math.PI) // 弧：中段抬高、左右蛇行（时间流动）
    out.y += sw * (real ? 0.18 : 0.35 + 0.15 * h2) + Math.sin(u * 5 + time * (real ? 3.2 : 1.4) + k * 1.7) * 0.06 * sw
    out.x += Math.sin(u * 4 + time * (real ? 2.6 : 1.1) + k * 2.3) * (real ? 0.05 : 0.1) * sw
    return out
  }
  const segs = M.segs
  for (let k = 0; k < M.strands; k++) {
    const ph = frac(time * (real ? 0.55 : 0.22) + k / M.strands) // 每根丝带自己的「一口气」：长出来 → 被吸走
    const life = Math.sin(Math.PI * ph)
    for (let j = 0; j <= segs; j++) {
      const u = j / segs, v = (k * (segs + 1) + j) * 2
      pt(k, u, _mv); pt(k, Math.min(1, u + 0.02), _mt).sub(_mv); if (j === segs) pt(k, u, _mt).sub(pt(k, u - 0.02, _mq))
      const head = real ? 1 : 1 - 0.7 * ss((u - 0.55) / 0.45) * pr.mistK // 假的：快到乐器口就散
      const ends = Math.sin(Math.PI * u) ** 0.8
      const a = ends * head * life * pr.mist
      const w = (M.width[0] + (M.width[1] - M.width[0]) * (real ? 0.6 + 0.4 * (1 - u) : Math.sin(Math.PI * u))) * (0.6 + 0.4 * life)
      for (const o of [0, 1]) { P.setXYZ(v + o, _mv.x, _mv.y, _mv.z); T.setXYZ(v + o, _mt.x, _mt.y, _mt.z); A.setX(v + o, a); Wd.setX(v + o, w); U.setX(v + o, u + k * 0.37) }
    }
  }
  for (const b of [P, T, A, Wd, U]) b.needsUpdate = true
  // 软粒子：沿丝带漂移的光点
  const pg = gl.motes.geometry, PP = pg.getAttribute('position') as THREE.BufferAttribute, PA = pg.getAttribute('aA') as THREE.BufferAttribute, PS = pg.getAttribute('aSize') as THREE.BufferAttribute
  for (let i = 0; i < M.motes; i++) {
    const u = frac(time * (real ? 0.45 : 0.18) + hash1(i + 40)), k = i % M.strands
    pt(k, u, _mv); _mv.x += (hash1(i + 60) - 0.5) * 0.12; _mv.y += (hash1(i + 70) - 0.5) * 0.12
    PP.setXYZ(i, _mv.x, _mv.y, _mv.z); PA.setX(i, Math.sin(Math.PI * u) * pr.mist * (real ? 1 : 1 - 0.6 * ss((u - 0.6) / 0.4)))
    PS.setX(i, M.moteSize[0] + (M.moteSize[1] - M.moteSize[0]) * hash1(i + 80))
  }
  PP.needsUpdate = PA.needsUpdate = PS.needsUpdate = true
  const col = real ? M.real : M.fake, op = real ? M.realOpacity : M.opacity
  gl.rMat.uniforms.uColor.value.set(col); gl.pMat.uniforms.uColor.value.set(col)
  gl.rMat.uniforms.uOpacity.value = op; gl.pMat.uniforms.uOpacity.value = op * 0.8
  gl.rMat.uniforms.uTime.value = time; gl.rMat.uniforms.uFlow.value = real ? 9 : 4
}
/** 验收：魂雾的绘制件（丝带 + 软粒子） */
export function jazzMistParts(rig: JazzRig) { const st = props(rig); return { group: st.mist, ribbon: st.gl.ribbon, motes: st.gl.motes, sheet: st.sheet } }

// ======================================================================
// 应用
// ======================================================================
export function applyJazzPose(rig: JazzRig, P: JazzAnimPose, o: JazzAnimOpts = {}) {
  const D = wd(rig.who), root = rig.root, time = o.time ?? 0
  _res.arm = 0; _res.leg = 0; _res.tip = 0
  root.position.set(P.root[0], P.root[1], P.root[2]); setE(root, P.rootR)
  const hr = rig.hips.userData.rest as { p: THREE.Vector3 }
  rig.hips.position.set(hr.p.x + P.hipsP[0], hr.p.y + P.hipsP[1], hr.p.z + P.hipsP[2]); setE(rig.hips, P.hipsR)
  setE(rig.spine, P.spine); setE(rig.chest, P.chest); setE(rig.neck, P.neck); setE(rig.head, P.head)
  // 头惯性（之后手按「实际头 ∘ 预测头⁻¹」跟着搬）
  const pred = trunkFK(D, P).head
  // [修] 注视层：叠加在片段的颈 / 头上；预测头不含它 → 扶在头（乐器）上的手跟着实际头一起转，手位不变
  applyLook(D, rig, P, o)
  applyHeadDyn(D, rig, P, o.dt)
  const act = fk(rig.head, root)
  const hd: HeadDelta = { q: act.q.clone().multiply(pred.q.clone().invert()), p: act.p.clone(), pp: pred.p.clone() }
  solveLeg(D, rig, 1, P.legL); solveLeg(D, rig, -1, P.legR)
  applyHem(rig, o.dt)
  solveArm(D, rig, rig.armL, 1, P.L, hd)
  solveArm(D, rig, rig.armR, -1, P.R, hd)
  applyInst(rig, P, o.dt, time)
  applyProps(D, rig, P, time, o.mistFrom)
  dynOf(rig).init = true
}
export function animateJazz(rig: JazzRig, clip: JazzClip, t: number, opts: JazzAnimOpts = {}) {
  const P = jazzPose(rig.who, clip, t, opts)
  applyJazzPose(rig, P, { ...opts, time: opts.time ?? t })
  return P
}
/** 预览 / 截图：从 t − pre 起按 1/60 s 推进二阶，得到与连续播放一致的确定帧（非循环片段最早从 0 起） */
export function animateJazzPreroll(rig: JazzRig, clip: JazzClip, t: number, opts: JazzAnimOpts = {}, pre = 1.0) {
  const C0 = JAZZ_CLIPS[clip], h = 1 / 60
  let t0 = t - pre; if (!C0.loop) t0 = Math.max(0, t0)
  resetJazzDynamics(rig)
  let P: JazzAnimPose | null = null
  for (let x = t0; x <= t + 1e-6; x += h) P = animateJazz(rig, clip, x, { ...opts, time: x, dt: x === t0 ? undefined : h })
  return P!
}
/** 验收用：手指指尖（root 空间）、掌心 / 拳心点 */
export function jazzFingerTip(rig: JazzRig, s: number, f: FName): THREE.Vector3 {
  const D = wd(rig.who), A = s > 0 ? rig.armL : rig.armR, b = A.fingers[f][2], x = fk(b, rig.root)
  const R = D.fing[s][f]
  return v3(subV(R.j[3], R.j[2])).applyQuaternion(x.q).add(x.p)
}
export function jazzPalmPoint(rig: JazzRig, s: number, pk = 0) { const D = wd(rig.who), A = s > 0 ? rig.armL : rig.armR, hx = fk(A.wrist, rig.root); return palmLocal(D, s, pk).applyQuaternion(hx.q).add(hx.p) }
/** 验收用：某接触组当前的接触面（按实际头） */
export function jazzTipTargetsNow(rig: JazzRig, T: JTips): TipSurf[] { return jazzTipTargets(T, fk(rig.head, rig.root)) }
export const JAZZ_TIP_FINGERS = TIP_FINGERS
export { FINGERS as JAZZ_FINGERS }

// ---------- 运行时动画器 ----------
export interface JazzAnimator {
  play(clip: JazzClip, fade?: number): void
  update(dt: number, opts?: JazzAnimOpts): void
  readonly clip: JazzClip; readonly time: number; readonly done: boolean; readonly pose: JazzAnimPose
  readonly rootDelta: [number, number]
}
export function createJazzAnimator(obj: THREE.Object3D, seed = 1): JazzAnimator {
  const rig = obj.userData.jazz as JazzRig
  let clip: JazzClip = 'idleSway', time = 0, gt = 0, fadeT = 1, fadeDur = 0
  let prev = jazzPose(rig.who, 'idleSway', 0, { seed }), last = deepClone(prev), rd: [number, number] = [0, 0]
  return {
    get clip() { return clip }, get time() { return time }, get pose() { return last }, get rootDelta() { return rd },
    get done() { const C0 = JAZZ_CLIPS[clip]; return !C0.loop && time >= C0.dur },
    play(c, fade) { if (c === clip && JAZZ_CLIPS[c].loop) return; prev = deepClone(last); clip = c; time = 0; fadeT = 0; fadeDur = fade ?? JAZZ_CLIPS[c].blend },
    update(dt, opts = {}) {
      rd = jazzRootMotion(clip, time, time + dt)
      time += dt; gt += dt; fadeT += dt
      let P = jazzPose(rig.who, clip, time, { seed, ...opts, time: gt })
      if (fadeT < fadeDur) P = mixJazzPose(prev, P, ss(fadeT / fadeDur))
      last = P
      applyJazzPose(rig, P, { seed, ...opts, time: gt, dt })
    },
  }
}
void saxAxis; void SAX; void BASS_TOPZ; void CURL_GRIP
