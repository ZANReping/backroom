// [chef] 厨师（Entity 800 / The Chef）骨架定义（阶段 1：只建模）。
// 模型空间：+Z 正面、+Y 向上、地面 y=0、+X = 角色左侧（与看门人 / 行李员 / 野兽 / 迎宾女郎同约定）。
//
// 体型：极胖的人形身体（啤酒肚、双下巴、肥厚人手），写实猪头 + 高褶厨师帽。身高到猪头顶 ≈ 1.82 m，帽顶 ≈ 2.05 m。
// 身体骨骼**名字与顺序**和行李员人体骨架（bellhopRig 前 N_BODY_BONES 根）完全一致：
//   root/hips/spine/chest/neck/head、两臂 clav→upperArm→foreArm→hand→五指×3（thumb/index/middle/ring/pinky）、
//   两腿 thigh→shin→foot→toe、两根下摆骨 hemL/hemR（这里驱动围裙）。
// 关节位置按胖人重新给（肩外移、手臂外张搭在肚子两侧、腿分得更开），手部坐标系 / 指节用同一套 handFrame 算法、
// 手指短粗（长度 ×0.74、半径 ×1.7，香肠指）。所有部件直接在厨师空间里建（不经过行李员空间形变）。
// 之后追加厨师专有骨骼：
//   belly（挂 spine，啤酒肚抖动）、chin（挂 neck，双下巴 / 颈肉）、jaw（挂 head，猪下颌）、
//   ear{L,R}{0,1,2}（挂 head，猪耳 3 节：根 / 中 / 折下的耳尖）、hat（挂 head，厨师帽晃动）
import { add, cross, dot, nrm, rot, scl, sub, lenv, W4, chainWeights, type V3 } from './conciergeRig'

export { add, cross, dot, nrm, rot, scl, sub, lenv, W4, chainWeights, type V3 }
export const side = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]]

// ---------- 主关节（左侧 s=+1；右侧镜像 x）----------
export const J = {
  hips: [0, 0.97, 0] as V3,
  spine: [0, 1.13, 0.0] as V3,
  chest: [0, 1.31, -0.025] as V3,
  neck: [0, 1.47, -0.035] as V3,
  /** 头骨 = 寰椎（颈顶） */
  head: [0, 1.585, -0.02] as V3,
  clav: [0.04, 1.45, -0.035] as V3,
  shoulder: [0.245, 1.425, -0.04] as V3,
  elbow: [0.345, 1.15, -0.05] as V3,
  wrist: [0.378, 0.9, 0.04] as V3,
  hip: [0.13, 0.92, 0.0] as V3,
  knee: [0.142, 0.5, 0.02] as V3,
  ankle: [0.146, 0.092, -0.03] as V3,
  toe: [0.152, 0.024, 0.11] as V3,
}

// ---------- 手：局部坐标系（原点在腕；a 指尖方向，r 桡侧 / 拇指侧，d 手背）----------
export interface HandFrame { o: V3; a: V3; r: V3; d: V3; s: number }
export function handFrame(s: number): HandFrame {
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
/** 五指（肥厚人手：掌宽厚、手指短粗、指根肉垫）：每指 4 个点（基节根、近节间、远节间、指尖）+ 每点半径。静止：自然微屈 */
export function handFingers(F: HandFrame): Finger[] {
  const out: Finger[] = []
  const spec: [string, number, number, number[], number, number, number[]][] = [
    ['index', 0.0405, 0.094, [0.038, 0.024, 0.02], 0.016, 0.09, [0.2, 0.3, 0.18]],
    ['middle', 0.0135, 0.098, [0.041, 0.026, 0.021], 0.0168, 0.02, [0.24, 0.34, 0.2]],
    ['ring', -0.0135, 0.095, [0.039, 0.025, 0.02], 0.016, -0.05, [0.29, 0.38, 0.22]],
    ['pinky', -0.0395, 0.087, [0.031, 0.02, 0.017], 0.0145, -0.14, [0.34, 0.42, 0.24]],
  ]
  for (const [name, tr, ta, L, r0, spread, flex] of spec) {
    let p: V3 = hp(F, ta, tr, 0.002)
    let dir = hdir(F, Math.cos(spread), Math.sin(spread), 0)
    const flexAxis = nrm(cross(dir, scl(F.d, -1)))
    const joints: V3[] = [p], radii = [r0]
    for (let k = 0; k < 3; k++) {
      dir = rot(dir, flexAxis, flex[k])
      p = add(p, scl(dir, L[k])); joints.push(p); radii.push(r0 * [0.95, 0.9, 0.8][k])
    }
    out.push({ name, joints, radii, flex: flexAxis })
  }
  {
    let p: V3 = hp(F, 0.024, 0.03, -0.012)
    let dir = hdir(F, 0.92, 0.32, -0.24)
    const flexAxis = nrm(cross(dir, hdir(F, 0, -0.3, -0.95)))
    const L = [0.038, 0.028, 0.022], fl = [0.05, 0.16, 0.2]
    const joints: V3[] = [p], radii = [0.021]
    for (let k = 0; k < 3; k++) { dir = rot(dir, flexAxis, fl[k]); p = add(p, scl(dir, L[k])); joints.push(p); radii.push([0.0196, 0.018, 0.015][k]) }
    out.unshift({ name: 'thumb', joints, radii, flex: flexAxis })
  }
  return out
}

// ---------- 猪头几何锚点（厨师空间，静止姿态）----------
/** 颅（耳后到额）：椭球 */
export const SKULL = { c: [0, 1.7, -0.025] as V3, r: [0.104, 0.104, 0.118] as V3 }
/** 吻部：根部 A（额前下方、鞍形凹弧底）→ 末端 E（鼻盘中心），半径 rA → rE；吻轴（近水平：吻背平、下沿由颌下肉垂圆弧接住） */
export const SNOUT = (() => {
  const A: V3 = [0, 1.607, 0.15], E: V3 = [0, 1.594, 0.3]
  return { A, E, rA: 0.072, rE: 0.054, ax: nrm(sub(E, A)), L: lenv(sub(E, A)) }
})()
/** 鼻盘：中心、法线（略朝前下，约 15°，与吻轴分开）、半宽 / 半高、厚 */
export const DISC = (() => { const n = nrm([0, -0.27, 1]); return { c: add(SNOUT.E, scl(n, 0.012)), n, rx: 0.058, ry: 0.05, th: 0.022 } })()
/** 小眼（深陷）：球心（左眼 x>0）、朝向、半径 */
export const EYE = { c: [0.079, 1.712, 0.0985] as V3, dir: nrm([0.66, 0.14, 0.74]), r: 0.0124 }
export const eyeC = (s: number): V3 => [EYE.c[0] * s, EYE.c[1], EYE.c[2]]
export const eyeDir = (s: number): V3 => [EYE.dir[0] * s, EYE.dir[1], EYE.dir[2]]
/** 猪耳（半折竖耳，从帽沿下两侧伸出）：根部（左）、主轴（向上外、略前）、长、最大半宽、内侧朝向、折线（沿耳长比例）与折角 */
export const EAR = { base: [0.09, 1.738, -0.035] as V3, dir: nrm([0.86, 0.42, 0.26]), len: 0.2, w: 0.084, open: nrm([0.2, 0.25, 0.95]), fold: 0.5, foldA: 1.2 }
export const earBase = (s: number): V3 => [EAR.base[0] * s, EAR.base[1], EAR.base[2]]
export const earDir = (s: number): V3 => [EAR.dir[0] * s, EAR.dir[1], EAR.dir[2]]
export const earOpen = (s: number): V3 => [EAR.open[0] * s, EAR.open[1], EAR.open[2]]
/** 耳骨沿耳长的位置（比例；第 3 节在折线上） */
export const EAR_T = [0, 0.3, EAR.fold]
/** 厨师帽（高褶帽）：帽箍底面中心、帽箍半径（x / z）、帽箍高、帽身高、帽顶最大半径、后仰 */
export const HAT = { c: [0, 1.758, -0.034] as V3, rx: 0.106, rz: 0.12, band: 0.06, h: 0.21, rTop: 0.162, tiltX: -0.09, tiltZ: 0.04 }
/** 下颌铰点（口角后上方）、獠牙根（左） */
export const JAW_P: V3 = [0, 1.585, 0.17]
export const TUSK = { base: [0.05, 1.551, 0.252] as V3, dir: nrm([0.9, 0.45, 0.45]), len: 0.03, r: 0.0058 }

// ---------- 骨骼表（前 N_BODY_BONES 根与行李员同名同序）----------
export interface BoneDef { name: string; parent: number; pos: V3; flex?: V3 }
export const B: Record<string, number> = {}
export const BONES: BoneDef[] = []
function addBone(name: string, parent: string | null, pos: V3, flex?: V3) { B[name] = BONES.length; BONES.push({ name, parent: parent === null ? -1 : B[parent], pos, flex }) }
addBone('root', null, [0, 0, 0])
addBone('hips', 'root', J.hips)
addBone('spine', 'hips', J.spine)
addBone('chest', 'spine', J.chest)
addBone('neck', 'chest', J.neck)
addBone('head', 'neck', J.head)
export const HANDS: Record<number, { F: HandFrame; fingers: Finger[] }> = {}
for (const s of [1, -1]) {
  const S = s > 0 ? 'L' : 'R'
  addBone('clav' + S, 'chest', side(J.clav, s))
  addBone('upperArm' + S, 'clav' + S, side(J.shoulder, s))
  addBone('foreArm' + S, 'upperArm' + S, side(J.elbow, s))
  addBone('hand' + S, 'foreArm' + S, side(J.wrist, s))
  const F = handFrame(s), fingers = handFingers(F)
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
export const N_BODY_BONES = BONES.length
// —— 厨师专有 ——
/** 啤酒肚中心（belly 骨原点；肚皮蒙在它上面，阶段 2 做二阶抖动） */
export const BELLY_C: V3 = [0, 1.02, 0.2]
addBone('belly', 'spine', BELLY_C)
/** 双下巴 / 颈肉（chin 骨原点） */
export const CHIN_C: V3 = [0, 1.5, 0.07]
addBone('chin', 'neck', CHIN_C)
addBone('jaw', 'head', JAW_P)
export const earPoint = (s: number, t: number): V3 => add(earBase(s), scl(earDir(s), EAR.len * t))
for (const s of [1, -1]) { const S = s > 0 ? 'L' : 'R'; for (let k = 0; k < 3; k++) addBone(`ear${S}${k}`, k === 0 ? 'head' : `ear${S}${k - 1}`, earPoint(s, EAR_T[k])) }
addBone('hat', 'head', HAT.c)
// [chef stage 2 修订] 下腹托起骨 + 围裙两节下摆骨（深蹲 / 坐下不互穿）：
//   tuck{L,R}（挂 belly）：大腿抬起时把下腹 / 腰带前沿沿大腿「前」方向托起（肚子压在腿上被托起），动画里按腿胶囊逐帧求位移
//   apU{L,R} / apD{L,R}（都挂 hips、平级，动画里显式摆位 / 转 / 沿节伸缩）：围裙前片上节（腰带 → 膝前）搭在大腿上，
//   下节（膝前 → 下沿）在膝前按重力下垂；围裙两侧仍跟 hem（贴大腿外侧）
export const TUCK_C = (s: number): V3 => [s * 0.12, 0.9, 0.26]
export const AP_PIV = { x: 0.11, yU: 0.862, yD: 0.57, z: 0.325 }
for (const s of [1, -1]) addBone('tuck' + (s > 0 ? 'L' : 'R'), 'belly', TUCK_C(s))
for (const s of [1, -1]) addBone('apU' + (s > 0 ? 'L' : 'R'), 'hips', [s * AP_PIV.x, AP_PIV.yU, AP_PIV.z])
for (const s of [1, -1]) addBone('apD' + (s > 0 ? 'L' : 'R'), 'hips', [s * AP_PIV.x, AP_PIV.yD, AP_PIV.z])
void dot
