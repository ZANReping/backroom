// [jazz] 爵士脑（Entity 197 / Jazz Brain）四人乐队：骨架定义（阶段 1：只建模）。
// 模型空间：+Z 正面、+Y 向上、地面 y=0、+X = 角色左侧（与行李员 / 厨师 / 野兽同约定）。
//
// 四名成员共用**同一套人体骨架**（骨骼名字、父子关系、顺序与行李员人体骨架 bellhopRig 前 N_BODY_BONES 根完全一致：
//   root/hips/spine/chest/neck/head、两臂 clav→upperArm→foreArm→hand→五指×3、两腿 thigh→shin→foot→toe、下摆 hemL/hemR），
// 只是关节位置按体型给（makeJazzRig(who)）：
//   leader 头儿（小号头）：偏瘦、微驼（胸 / 颈 / 头前探），老人手（细、指节突出）
//   sax    萨克斯头：中等身材
//   bass   低音提琴头：偏胖（肩宽、肚子），手指粗；头（琴身）压在两肩上
//   drum   鼓头：结实
// 人体骨骼之后追加各自乐器头的骨骼（都挂 head）：
//   leader：valve1..3（三个活塞，沿 +Y 按下）
//   sax   ：octKey（八度键）、key1..key6（主按键 6 个，左手 1-3 / 右手 4-6）、keyS（侧键组）
//   bass  ：str1..str4（四根弦的振动骨，原点在弦中点；弦上权重为帐篷形，两端 0）
//   drum  ：drumHead（鼓皮中心，鼓皮振动）、cymL / cymR（两片镲，颤动）
import { add, cross, dot, nrm, rot, scl, sub, lenv, W4, chainWeights, type V3 } from './conciergeRig'

export { add, cross, dot, nrm, rot, scl, sub, lenv, W4, chainWeights, type V3 }
export const side = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]]

export type JazzWho = 'leader' | 'sax' | 'bass' | 'drum'
export const JAZZ_WHO: JazzWho[] = ['leader', 'sax', 'bass', 'drum']
export const JAZZ_ZH: Record<JazzWho, string> = { leader: '头儿 · 小号', sax: '萨克斯', bass: '低音提琴', drum: '鼓 / 钢琴' }

/** 体型参数（躯干 / 四肢 / 手） */
export interface BodyP {
  who: JazzWho
  /** 胸廓半宽 / 半深、腰半宽 / 半深、臀半宽 / 半深 */
  chestW: number; chestD: number; waistW: number; waistD: number; hipW: number; hipD: number
  /** 肚子（0 无 … 1 胖） */
  belly: number
  /** 上臂 / 前臂袖半径、大腿 / 小腿裤管半径 */
  armR: number; foreR: number; thighR: number; shinR: number
  /** 手指：长度倍数、半径倍数、指节鼓起倍数（老人手 > 1） */
  fingerL: number; fingerR: number; knuckle: number; old: boolean
  /** 皮肤色（sRGB hex） */
  skin: number
  /** 上衣下摆高度 */
  hemY: number
}

export interface Joints {
  hips: V3; spine: V3; chest: V3; neck: V3; head: V3; clav: V3; shoulder: V3; elbow: V3; wrist: V3; hip: V3; knee: V3; ankle: V3; toe: V3
}

// ---------- 手：局部坐标系（原点在腕；a 指尖方向，r 桡侧 / 拇指侧，d 手背）----------
export interface HandFrame { o: V3; a: V3; r: V3; d: V3; s: number }
function handFrame(J: Joints, s: number): HandFrame {
  const el = side(J.elbow, s), wr = side(J.wrist, s)
  const fore = nrm(sub(wr, el))
  const a = nrm(add(scl(fore, 0.75), [0, -0.25, 0]))
  let r = nrm(sub([0, 0, 1], scl(a, a[2])))
  r = nrm(rot(r, a, -s * 0.15))
  const d = nrm(cross(a, r))
  return { o: wr, a, r, d: s > 0 ? scl(d, -1) : d, s }
}
export const hp = (F: HandFrame, ta: number, tr: number, td: number): V3 => [
  F.o[0] + F.a[0] * ta + F.r[0] * tr + F.d[0] * td,
  F.o[1] + F.a[1] * ta + F.r[1] * tr + F.d[1] * td,
  F.o[2] + F.a[2] * ta + F.r[2] * tr + F.d[2] * td,
]
export const hdir = (F: HandFrame, ta: number, tr: number, td: number): V3 => nrm([
  F.a[0] * ta + F.r[0] * tr + F.d[0] * td, F.a[1] * ta + F.r[1] * tr + F.d[1] * td, F.a[2] * ta + F.r[2] * tr + F.d[2] * td])

export interface Finger { name: string; joints: V3[]; radii: number[]; flex: V3 }
/** 五指：每指 4 点（基节根、近节间、远节间、指尖）+ 半径。静止：自然微屈。L / R 倍数按体型 */
function handFingers(F: HandFrame, P: BodyP): Finger[] {
  const out: Finger[] = []
  const kl = P.fingerL, kr = P.fingerR
  const spec: [string, number, number, number[], number, number, number[]][] = [
    ['index', 0.027, 0.098, [0.05, 0.031, 0.024], 0.0088, 0.07, [0.18, 0.3, 0.18]],
    ['middle', 0.0085, 0.102, [0.055, 0.035, 0.026], 0.0091, 0.015, [0.22, 0.34, 0.2]],
    ['ring', -0.0105, 0.099, [0.051, 0.033, 0.025], 0.0086, -0.045, [0.27, 0.38, 0.22]],
    ['pinky', -0.0275, 0.091, [0.04, 0.025, 0.021], 0.0076, -0.12, [0.32, 0.42, 0.24]],
  ]
  const ws = 0.85 + 0.15 * kr // 掌宽随手指粗细
  for (const [name, tr, ta, L, r0, spread, flex] of spec) {
    let p: V3 = hp(F, ta * (0.9 + 0.1 * kl), tr * ws, 0.002)
    let dir = hdir(F, Math.cos(spread), Math.sin(spread), 0)
    const flexAxis = nrm(cross(dir, scl(F.d, -1)))
    const joints: V3[] = [p], radii = [r0 * kr]
    for (let k = 0; k < 3; k++) {
      // 老人手：[修订] 关节更弯（近节 / 远节自然屈）、越靠小指越弯
      dir = rot(dir, flexAxis, flex[k] * (P.old ? [1.45, 1.6, 1.45][k] * (1 + 0.06 * out.length) : 1))
      p = add(p, scl(dir, L[k] * kl)); joints.push(p); radii.push(r0 * kr * [0.88, 0.8, 0.68][k])
    }
    out.push({ name, joints, radii, flex: flexAxis })
  }
  {
    let p: V3 = hp(F, 0.022, 0.025 * ws, -0.01)
    let dir = hdir(F, 0.95, 0.26, -0.24)
    const flexAxis = nrm(cross(dir, hdir(F, 0, -0.3, -0.95)))
    const L = [0.043, 0.033, 0.027].map((v) => v * kl), fl = [0.05, 0.16, 0.2]
    const joints: V3[] = [p], radii = [0.0125 * kr]
    for (let k = 0; k < 3; k++) { dir = rot(dir, flexAxis, fl[k]); p = add(p, scl(dir, L[k])); joints.push(p); radii.push([0.011, 0.0098, 0.0082][k] * kr) }
    out.unshift({ name: 'thumb', joints, radii, flex: flexAxis })
  }
  return out
}

export interface BoneDef { name: string; parent: number; pos: V3; flex?: V3 }

// ---------- 体型 ----------
const BASE: Joints = {
  hips: [0, 0.99, 0], spine: [0, 1.13, -0.008], chest: [0, 1.3, -0.012], neck: [0, 1.5, -0.022], head: [0, 1.585, -0.018],
  clav: [0.028, 1.475, -0.012], shoulder: [0.18, 1.452, -0.022], elbow: [0.224, 1.168, -0.05], wrist: [0.24, 0.912, 0.012],
  hip: [0.088, 0.935, 0.0], knee: [0.098, 0.51, 0.012], ankle: [0.104, 0.088, -0.03], toe: [0.11, 0.022, 0.1],
}
function bodyOf(who: JazzWho): { J: Joints; P: BodyP } {
  const J: Joints = JSON.parse(JSON.stringify(BASE))
  const scaleY = (k: number) => { for (const key of Object.keys(J) as (keyof Joints)[]) { const p = J[key]; if (key !== 'toe') p[1] = p[1] * k; else p[1] = 0.022 } }
  const P: BodyP = { who, chestW: 0.165, chestD: 0.112, waistW: 0.14, waistD: 0.1, hipW: 0.165, hipD: 0.11, belly: 0, armR: 0.056, foreR: 0.047, thighR: 0.082, shinR: 0.06, fingerL: 1, fingerR: 1, knuckle: 1, old: false, skin: 0xc79a80, hemY: 0.8 }
  if (who === 'leader') {
    scaleY(0.965)
    // 微驼：胸往后上弓、颈 / 头前探下沉；肩前扣
    J.chest[2] -= 0.012; J.neck[2] += 0.03; J.neck[1] -= 0.012; J.head[2] += 0.058; J.head[1] -= 0.03
    J.clav[2] += 0.012; J.shoulder[2] += 0.024; J.shoulder[0] = 0.172; J.elbow[0] = 0.212; J.elbow[2] -= 0.01; J.wrist[0] = 0.226; J.wrist[2] += 0.02
    Object.assign(P, { chestW: 0.152, chestD: 0.104, waistW: 0.128, waistD: 0.094, hipW: 0.15, hipD: 0.1, armR: 0.05, foreR: 0.042, thighR: 0.074, shinR: 0.055, fingerL: 0.9, fingerR: 0.86, knuckle: 1.35, old: true, skin: 0xd4ab94, hemY: 0.78 })
  } else if (who === 'sax') {
    scaleY(0.99)
    Object.assign(P, { skin: 0xb98a6c })
  } else if (who === 'bass') {
    scaleY(0.985)
    J.shoulder[0] = 0.205; J.clav[0] = 0.032; J.elbow[0] = 0.27; J.elbow[2] -= 0.02; J.wrist[0] = 0.295; J.wrist[2] += 0.03
    J.hip[0] = 0.105; J.knee[0] = 0.118; J.ankle[0] = 0.124; J.toe[0] = 0.13
    Object.assign(P, { chestW: 0.198, chestD: 0.135, waistW: 0.2, waistD: 0.15, hipW: 0.196, hipD: 0.13, belly: 1, armR: 0.066, foreR: 0.056, thighR: 0.098, shinR: 0.07, fingerL: 0.95, fingerR: 1.3, knuckle: 1.05, skin: 0xd09a84, hemY: 0.79 })
  } else {
    scaleY(0.975)
    J.shoulder[0] = 0.19; J.elbow[0] = 0.236; J.wrist[0] = 0.252
    Object.assign(P, { chestW: 0.176, chestD: 0.118, waistW: 0.152, waistD: 0.106, hipW: 0.17, hipD: 0.114, armR: 0.06, foreR: 0.05, thighR: 0.086, shinR: 0.063, fingerR: 1.08, skin: 0x8a5c42, hemY: 0.79 })
  }
  return { J, P }
}

// ---------- 乐器头的几何锚点（相对 head 骨原点；head 局部坐标与模型坐标同向）----------
/** 小号（头儿）：喇叭口中心 / 朝向 / 口半径；活塞（x=0，z 位置）与顶键高度 */
export const TRUMPET = { bellC: [0, 0.135, 0.235] as V3, bellR: 0.104, bellZ0: 0.05, tubeY: 0.135, tubeR: 0.0118, valveZ: [-0.012, 0.03, 0.072], valveY0: 0.06, valveY1: 0.17, valveR: 0.0205, capY: 0.205, btnY: 0.236 }
/** 萨克斯：琴身中轴（自颈管底到喇叭口）关键点、喇叭口法线 */
export const SAX = {
  path: [[0, -0.05, -0.012], [0, 0.02, -0.02], [0, 0.07, -0.03], [0, 0.14, -0.03], [0, 0.24, -0.022], [0, 0.32, -0.006], [0, 0.38, 0.03], [0, 0.415, 0.085], [0, 0.428, 0.135]] as V3[],
  r: [0.012, 0.0135, 0.018, 0.025, 0.032, 0.039, 0.046, 0.057, 0.068],
  bellC: [0, 0.432, 0.15] as V3, bellN: nrm([0, 0.32, 1]), bellR: 0.1,
}
/** 低音提琴：琴身（下沿压在两肩上）——底中心、高、上 / 中 / 下宽、侧板厚；琴颈 / 卷轴 */
export const BASS = { y0: -0.02, z0: 0.0, h: 0.56, wLow: 0.315, wUp: 0.24, wWaist: 0.19, rib: 0.13, arch: 0.022, neckL: 0.2, scrollH: 0.15 }
/** 军鼓：鼓心、半径、深（鼓皮朝 +Z）；镲（左右） */
export const SNARE = { c: [0, 0.2, 0.03] as V3, r: 0.18, depth: 0.14, cymY: 0.39, cymX: 0.17, cymR: 0.15 }

export interface JazzRigDef {
  who: JazzWho; J: Joints; P: BodyP
  BONES: BoneDef[]; B: Record<string, number>; N_BODY_BONES: number
  HANDS: Record<number, { F: HandFrame; fingers: Finger[] }>
  /** 乐器头骨骼（名字 → 头局部原点） */
  headBones: string[]
}
const cache: Partial<Record<JazzWho, JazzRigDef>> = {}
export function makeJazzRig(who: JazzWho): JazzRigDef {
  if (cache[who]) return cache[who]!
  const { J, P } = bodyOf(who)
  const B: Record<string, number> = {}, BONES: BoneDef[] = []
  const addBone = (name: string, parent: string | null, pos: V3, flex?: V3) => { B[name] = BONES.length; BONES.push({ name, parent: parent === null ? -1 : B[parent], pos, flex }) }
  addBone('root', null, [0, 0, 0])
  addBone('hips', 'root', J.hips)
  addBone('spine', 'hips', J.spine)
  addBone('chest', 'spine', J.chest)
  addBone('neck', 'chest', J.neck)
  addBone('head', 'neck', J.head)
  const HANDS: JazzRigDef['HANDS'] = {}
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R'
    addBone('clav' + S, 'chest', side(J.clav, s))
    addBone('upperArm' + S, 'clav' + S, side(J.shoulder, s))
    addBone('foreArm' + S, 'upperArm' + S, side(J.elbow, s))
    addBone('hand' + S, 'foreArm' + S, side(J.wrist, s))
    const F = handFrame(J, s), fingers = handFingers(F, P)
    HANDS[s] = { F, fingers }
    for (const f of fingers) for (let k = 0; k < 3; k++) addBone(`${f.name}${k + 1}${S}`, k === 0 ? 'hand' + S : `${f.name}${k}${S}`, f.joints[k], f.flex)
  }
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R'
    addBone('thigh' + S, 'hips', side(J.hip, s))
    addBone('shin' + S, 'thigh' + S, side(J.knee, s))
    addBone('foot' + S, 'shin' + S, side(J.ankle, s))
    addBone('toe' + S, 'foot' + S, side(J.toe, s))
  }
  for (const s of [1, -1]) addBone('hem' + (s > 0 ? 'L' : 'R'), 'hips', side(J.hip, s))
  const N_BODY_BONES = BONES.length
  const H = J.head, hb: string[] = []
  const addHead = (name: string, local: V3) => { addBone(name, 'head', add(H, local)); hb.push(name) }
  if (who === 'leader') { const T = TRUMPET; for (let i = 0; i < 3; i++) addHead('valve' + (i + 1), [0, T.btnY, T.valveZ[i]]) }
  else if (who === 'sax') {
    addHead('octKey', [0, 0.25, -0.05])
    for (let i = 0; i < 6; i++) { const p = saxKeyPos(i); addHead('key' + (i + 1), p) }
    addHead('keyS', [0.04, 0.2, -0.01])
  } else if (who === 'bass') { for (let i = 0; i < 4; i++) addHead('str' + (i + 1), bassStringMid(i)) }
  else { addHead('drumHead', [SNARE.c[0], SNARE.c[1], SNARE.c[2] + SNARE.depth / 2]); for (const s of [1, -1]) addHead(s > 0 ? 'cymL' : 'cymR', [s * SNARE.cymX, SNARE.cymY, SNARE.c[2] - 0.01]) }
  return (cache[who] = { who, J, P, BONES, B, N_BODY_BONES, HANDS, headBones: hb })
}

// ---------- 乐器头辅助：萨克斯按键位置 / 低音提琴弦 ----------
/** 萨克斯中轴上 t∈[0,1] 的点（按 SAX.path 折线弧长）与半径 */
export function saxAxis(t: number): { p: V3; r: number; tan: V3 } {
  const P = SAX.path, L: number[] = [0]
  for (let i = 1; i < P.length; i++) L.push(L[i - 1] + lenv(sub(P[i], P[i - 1])))
  const s = Math.max(0, Math.min(1, t)) * L[L.length - 1]
  let i = 1; while (i < P.length - 1 && L[i] < s) i++
  const u = (s - L[i - 1]) / (L[i] - L[i - 1] || 1)
  const p = add(P[i - 1], scl(sub(P[i], P[i - 1]), u))
  return { p, r: SAX.r[i - 1] + (SAX.r[i] - SAX.r[i - 1]) * u, tan: nrm(sub(P[i], P[i - 1])) }
}
/** 主按键 i（0..5）：琴身前面（+Z）一列音孔垫盖的中心（头局部） */
export function saxKeyPos(i: number): V3 {
  const t = 0.3 + i * 0.075
  const a = saxAxis(t)
  return add(a.p, [0, 0, a.r + 0.012])
}
/** 低音提琴：琴身面板 z（正面），弦 i 在琴马 / 上枕处的位置 */
export const BASS_TOPZ = BASS.z0 + BASS.rib / 2 + BASS.arch
export function bassStringEnds(i: number): { a: V3; b: V3 } {
  const x0 = (i - 1.5) * 0.024, x1 = (i - 1.5) * 0.011
  const bridgeY = BASS.y0 + BASS.h * 0.38
  const a: V3 = [x0, bridgeY, BASS_TOPZ + 0.075]
  const nutY = BASS.y0 + BASS.h + BASS.neckL
  const b: V3 = [x1, nutY, BASS_TOPZ + 0.045]
  return { a, b }
}
export function bassStringMid(i: number): V3 { const { a, b } = bassStringEnds(i); return scl(add(a, b), 0.5) }
void dot
