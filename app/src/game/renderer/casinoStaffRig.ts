// [casino] Level 5.1 赌场员工 阶段 2：骨架定义（只建模 + 绑定骨架；动画在阶段 3）。
// 模型空间：+Z 正面、+Y 向上、地面 y=0、+X = 角色左侧（与行李员 / 厨师 / 爵士脑 / 野兽同约定）。
//
// 人形（Louie / Billy / 背景员工）沿用爵士脑 jazzRig 的人体骨骼命名与父子顺序：
//   root/hips/spine/chest/neck/head、两臂 clav→upperArm→foreArm→hand（[可选] 手指 thumb/index/middle/ring/pinky ×3）、
//   两腿 thigh→shin→foot→toe、下摆 hemL/hemR —— 这样阶段 3 可以直接复用 jazzAnim / chefAnim 的 IK 与姿势工具。
//   Louie：手 = 台球杆（无手指骨）；右小腿 shinR = 台球杆假肢。追加 jaw、ballEye、tailL/tailR（燕尾）、cueBall1..3（右杆顶三颗球）。
//   Billy：爪手 thumb/index/middle/ring ×3；追加 tongue1..3（舌头链）、heldBall。
//   背景员工：无手指骨（连指手套）；按头型追加 wheel（轮盘脸自转）/ reel1..3 + lever（老虎机头）。
// 蜘蛛式（假肢人 / 酒保 E164）：root/hips/spine/chest/neck/head（E164 无 neck/head，改为 body/eye），
//   8 条腿 leg{L|R}{1..4}{a,b,c,d}：a 基节（髋）→ b 股节（膝上抬）→ c 胫节 → d 跗节（脚尖），每腿 4 节骨（≥3 节，供蜘蛛步）。
//   腿序号 1 = 最前、4 = 最后；L = +X 侧。
//   假肢人另有 jaw、hat、skirt0..3（斗篷下摆四向）与两臂（右臂举杆、左臂垂在斗篷边）。
//   E164 另有 eye（主眼）、mouth（躯干下的口器）、clawL/clawR（前腿当手用的握点，挂在 legL1d/legR1d 下）。
import { add, nrm, scl, sub, lenv, type V3 } from './conciergeRig'
export { add, nrm, scl, sub, lenv, type V3 }

export type StaffWho = 'louie' | 'prosthetic' | 'billy' | 'bartender' | 'dealer' | 'waiter' | 'guard'
export const STAFF_WHO: StaffWho[] = ['louie', 'prosthetic', 'billy', 'bartender', 'dealer', 'waiter', 'guard']
export const STAFF_HERO: StaffWho[] = ['louie', 'prosthetic', 'billy', 'bartender']
export const STAFF_CREW: StaffWho[] = ['dealer', 'waiter', 'guard']
export const STAFF_ZH: Record<StaffWho, string> = {
  louie: '赌场经理 Louie', prosthetic: '假肢人', billy: '台球先生 Billy', bartender: '酒保 E164',
  dealer: '荷官（骰子头）', waiter: '侍应 / 发筹码员（轮盘头）', guard: '保安（老虎机头）',
}
export type StaffKind = 'humanoid' | 'spider'
export const STAFF_KIND: Record<StaffWho, StaffKind> = { louie: 'humanoid', prosthetic: 'spider', billy: 'humanoid', bartender: 'spider', dealer: 'humanoid', waiter: 'humanoid', guard: 'humanoid' }

export interface BoneDef { name: string; parent: number; pos: V3; tail?: V3 }
export interface StaffRigDef {
  who: StaffWho; kind: StaffKind
  BONES: BoneDef[]; B: Record<string, number>
  /** 每根骨的权重线段（自身 → 尾端），自动蒙皮用 */
  seg: { a: V3; b: V3 }[]
  J: Record<string, V3>
  fingers: string[]
}

// ---------- 人形关节表 ----------
export interface HJ {
  hips: V3; spine: V3; chest: V3; neck: V3; head: V3; headTop: V3
  clav: V3; shoulder: V3; elbow: V3; wrist: V3; handTip: V3
  /** 右臂（x<0）可以单独给（Louie / Billy 两臂不对称） */
  shoulderR?: V3; elbowR?: V3; wristR?: V3; handTipR?: V3
  hip: V3; knee: V3; ankle: V3; toe: V3
  kneeR?: V3; ankleR?: V3; toeR?: V3
}
const sd = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]]
/** Billy 的球身：球心 / 半径（台球 = 躯干） */
/** 假肢人右手拳心相对腕关节的偏移（手套几何与烟杆道具共用；第四轮去掉横向 −3 cm 偏移，拳心正对腕 / 袖口轴） */
export const PROS_GRIP_OFF: V3 = [0, 0.068, 0.02]
/** 阶段 3：拳内空腔——掌心肉垫中心（相对拳心 C）与半径；离烟杆轴 ≥ 杆半径 0.012，杆从四指圈里穿过而不穿掌 */
export const PROS_PALM = { off: [0, -0.042, -0.03] as V3, r: [0.043, 0.03, 0.016] as V3 }
export const BILLY_BALL_C: V3 = [0, 0.98, 0], BILLY_BALL_R = 0.4

export const HUMAN_J: Record<'louie' | 'billy' | 'crew' | 'guard', HJ> = {
  // Louie（第三轮）：关节 = 爵士脑 BASE × 0.99（身体直接复用 jazzBody 的人体 / 西装 SDF，见 casinoStaffLouie.LOUIE_JZ）；右臂举起前臂朝上，右腿膝下台球杆假肢
  louie: {
    hips: [0, 0.98, 0], spine: [0, 1.119, -0.008], chest: [0, 1.287, -0.012], neck: [0, 1.485, -0.022], head: [0, 1.569, -0.018], headTop: [0, 1.801, 0],
    clav: [0.028, 1.46, -0.012], shoulder: [0.178, 1.437, -0.022], elbow: [0.222, 1.156, -0.05], wrist: [0.238, 0.903, 0.012], handTip: [0.262, 0.62, 0.05],
    shoulderR: [-0.178, 1.437, -0.022], elbowR: [-0.31, 1.13, 0.07], wristR: [-0.31, 1.41, 0.14], handTipR: [-0.315, 1.79, 0.15],
    hip: [0.088, 0.926, 0], knee: [0.098, 0.505, 0.012], ankle: [0.104, 0.087, -0.03], toe: [0.11, 0.022, 0.1],
    kneeR: [-0.098, 0.505, 0.012], ankleR: [-0.104, 0.06, 0.0], toeR: [-0.106, 0.0, 0.03],
  },
  // Billy（第三轮 ref4）：身体 = 一颗 4 号台球（球心 BILLY_BALL_C、半径 BILLY_BALL_R）。spine / chest / neck / head 只是空骨（保留 jazzRig 命名顺序以复用 IK），
  // 四肢从球面长出：肩 / 髋关节点在球面上；半蹲、右手（x<0）举起托球、左手爪搭左膝
  billy: {
    hips: [0, 0.72, 0], spine: [0, 0.86, 0], chest: [0, 1.0, 0], neck: [0, 1.24, 0], head: [0, 1.3, 0], headTop: [0, 1.38, 0],
    clav: [0.15, 1.1, 0], shoulder: [0.36, 1.15, 0.0], elbow: [0.63, 1.1, 0.03], wrist: [0.6, 0.79, 0.12], handTip: [0.56, 0.64, 0.16],
    shoulderR: [-0.36, 1.12, 0.06], elbowR: [-0.66, 0.92, 0.08], wristR: [-0.68, 1.3, 0.12], handTipR: [-0.68, 1.45, 0.14],
    hip: [0.21, 0.66, 0.02], knee: [0.46, 0.47, 0.1], ankle: [0.47, 0.085, 0.0], toe: [0.55, 0.02, 0.15],
  },
  crew: {
    hips: [0, 0.97, 0], spine: [0, 1.1, -0.006], chest: [0, 1.27, -0.012], neck: [0, 1.47, -0.02], head: [0, 1.53, -0.015], headTop: [0, 1.79, 0],
    clav: [0.03, 1.44, -0.012], shoulder: [0.198, 1.425, -0.02], elbow: [0.215, 1.15, -0.045], wrist: [0.235, 0.9, 0.015], handTip: [0.25, 0.73, 0.03],
    hip: [0.09, 0.92, 0], knee: [0.098, 0.505, 0.012], ankle: [0.102, 0.09, -0.03], toe: [0.11, 0.022, 0.1],
  },
  guard: {
    hips: [0, 0.99, 0], spine: [0, 1.13, -0.008], chest: [0, 1.31, -0.014], neck: [0, 1.52, -0.022], head: [0, 1.58, -0.018], headTop: [0, 1.9, 0],
    clav: [0.035, 1.49, -0.012], shoulder: [0.225, 1.47, -0.022], elbow: [0.27, 1.19, -0.05], wrist: [0.29, 0.93, 0.02], handTip: [0.3, 0.75, 0.04],
    hip: [0.1, 0.94, 0], knee: [0.11, 0.515, 0.012], ankle: [0.112, 0.09, -0.03], toe: [0.12, 0.022, 0.11],
  },
}

// ---------- 蜘蛛腿 ----------
/** 腿 i（0..3 = 1..4 号）在 L 侧的四个关节点（髋 / 膝 / 踝 / 脚尖）；R 侧取 x 镜像 */
export interface SpiderLegSpec { hip: V3; knee: V3; ankle: V3; foot: V3; tip: V3 }
function spiderLegs(azDeg: number[], hipR: number, hipY: number, kneeR: number, kneeY: number, ankleR: number, ankleY: number, footR: number, tipR: number): SpiderLegSpec[] {
  return azDeg.map((d) => {
    const a = (d * Math.PI) / 180, dx = Math.sin(a), dz = Math.cos(a)
    const P = (r: number, y: number): V3 => [dx * r, y, dz * r]
    return { hip: P(hipR, hipY), knee: P(kneeR, kneeY), ankle: P(ankleR, ankleY), foot: P(footR, 0.11), tip: P(tipR, 0.0) }
  })
}
/** 假肢人：斗篷下 8 条细杆腿，前后张开（方位角从正前方量，L 侧 x>0） */
export const PROS_LEGS = spiderLegs([22, 62, 112, 152], 0.17, 0.9, 0.42, 0.66, 0.47, 0.3, 0.5, 0.52)
/** E164：毛团两侧 6 条步行腿（2..4 号）+ 1 号前腿抬起当手（单独给） */
export const E164_LEGS: SpiderLegSpec[] = (() => {
  const L = spiderLegs([30, 72, 112, 150], 0.24, 0.92, 0.56, 1.06, 0.66, 0.42, 0.7, 0.72)
  // 1 号腿：向前上抬、末节朝内，像两只手端在吧台上
  L[0] = { hip: [0.17, 1.0, 0.18], knee: [0.36, 1.12, 0.34], ankle: [0.24, 1.0, 0.56], foot: [0.13, 0.98, 0.6], tip: [0.09, 0.98, 0.6] }
  return L
})()

// ---------- 构建 ----------
const cache: Partial<Record<StaffWho, StaffRigDef>> = {}
export function makeStaffRig(who: StaffWho): StaffRigDef {
  if (cache[who]) return cache[who]!
  const BONES: BoneDef[] = [], B: Record<string, number> = {}, J: Record<string, V3> = {}
  const addBone = (name: string, parent: string | null, pos: V3, tail?: V3) => { B[name] = BONES.length; BONES.push({ name, parent: parent === null ? -1 : B[parent], pos, tail }) }
  let fingers: string[] = []
  const kind = STAFF_KIND[who]
  if (kind === 'humanoid') {
    const H = who === 'louie' ? HUMAN_J.louie : who === 'billy' ? HUMAN_J.billy : who === 'guard' ? HUMAN_J.guard : HUMAN_J.crew
    Object.assign(J, H)
    addBone('root', null, [0, 0, 0], [0, 0.1, 0])
    addBone('hips', 'root', H.hips, H.spine)
    addBone('spine', 'hips', H.spine, H.chest)
    addBone('chest', 'spine', H.chest, H.neck)
    addBone('neck', 'chest', H.neck, H.head)
    addBone('head', 'neck', H.head, H.headTop)
    fingers = who === 'billy' ? ['thumb', 'index', 'middle', 'ring'] : who === 'louie' ? [] : ['thumb', 'index', 'middle', 'ring', 'pinky']
    for (const s of [1, -1]) {
      const S = s > 0 ? 'L' : 'R'
      const sh = s < 0 && H.shoulderR ? H.shoulderR : sd(H.shoulder, s), el = s < 0 && H.elbowR ? H.elbowR : sd(H.elbow, s)
      const wr = s < 0 && H.wristR ? H.wristR : sd(H.wrist, s), tip = s < 0 && H.handTipR ? H.handTipR : sd(H.handTip, s)
      J['shoulder' + S] = sh; J['elbow' + S] = el; J['wrist' + S] = wr; J['handTip' + S] = tip
      addBone('clav' + S, 'chest', sd(H.clav, s), sh)
      addBone('upperArm' + S, 'clav' + S, sh, el)
      addBone('foreArm' + S, 'upperArm' + S, el, wr)
      addBone('hand' + S, 'foreArm' + S, wr, tip)
      if (fingers.length) {
        // Billy 爪手：四指沿手的方向扇开（拇指偏内前），每指 3 节
        const a = nrm(sub(tip, wr)), fwd: V3 = [0, 0, 1], side = nrm([a[1] * fwd[2] - a[2] * fwd[1], a[2] * fwd[0] - a[0] * fwd[2], a[0] * fwd[1] - a[1] * fwd[0]])
        if (who === 'billy') fingers.forEach((f, fi) => {
          const spread = f === 'thumb' ? 0.55 : (fi - 2) * 0.28
          const base = add(wr, add(scl(a, f === 'thumb' ? 0.035 : 0.075), add(scl(side, s * (f === 'thumb' ? 0.035 : (fi - 2) * 0.022)), [0, 0, f === 'thumb' ? 0.03 : 0])))
          const dir = nrm(add(a, add(scl(side, s * spread), [0, 0, f === 'thumb' ? 0.3 : 0.05])))
          const L = f === 'thumb' ? [0.04, 0.035, 0.035] : [0.045, 0.04, 0.045]
          let p = base
          for (let k = 0; k < 3; k++) { const q = add(p, scl(dir, L[k])); addBone(`${f}${k + 1}${S}`, k === 0 ? 'hand' + S : `${f}${k}${S}`, p, q); p = q }
        })
        else fingers.forEach((f, fi) => {
          // 写实五指（背景员工）：掌骨端在腕下 0.09 m，四指按真实长度、自然微屈（每节向掌心再屈 0.32 rad），拇指自鱼际斜出
          const th = f === 'thumb', off = th ? 0 : (fi - 2.5) * 0.019
          const L = ({ thumb: [0.042, 0.032, 0.027], index: [0.044, 0.026, 0.021], middle: [0.049, 0.03, 0.022], ring: [0.046, 0.028, 0.021], pinky: [0.036, 0.021, 0.019] } as Record<string, number[]>)[f]
          const med: V3 = [-s, 0, 0], palm = nrm(add(med, [0, 0, 0.3]))
          let p = add(wr, add(scl(a, th ? 0.032 : 0.088 - Math.abs(off) * 0.4), th ? add(scl(med, 0.014), [0, 0, 0.03]) : [0, 0, -off]))
          let dir = nrm(add(a, th ? add(scl(fwd, 0.55), scl(med, 0.35)) : [0, 0, -off * 2.5]))
          for (let k = 0; k < 3; k++) { const q = add(p, scl(dir, L[k])); addBone(`${f}${k + 1}${S}`, k === 0 ? 'hand' + S : `${f}${k}${S}`, p, q); p = q; const c = th ? 0.2 : 0.3; dir = nrm(add(scl(dir, Math.cos(c)), scl(th ? nrm(add(med, [0, 0, -0.4])) : palm, Math.sin(c)))) }
        })
      }
    }
    for (const s of [1, -1]) {
      const S = s > 0 ? 'L' : 'R'
      const kn = s < 0 && H.kneeR ? H.kneeR : sd(H.knee, s), an = s < 0 && H.ankleR ? H.ankleR : sd(H.ankle, s), to = s < 0 && H.toeR ? H.toeR : sd(H.toe, s)
      J['hip' + S] = sd(H.hip, s); J['knee' + S] = kn; J['ankle' + S] = an; J['toe' + S] = to
      addBone('thigh' + S, 'hips', sd(H.hip, s), kn)
      addBone('shin' + S, 'thigh' + S, kn, an)
      addBone('foot' + S, 'shin' + S, an, to)
      addBone('toe' + S, 'foot' + S, to, add(to, [0, 0, 0.05]))
    }
    for (const s of [1, -1]) addBone('hem' + (s > 0 ? 'L' : 'R'), 'hips', sd(H.hip, s), add(sd(H.hip, s), [0, -0.25, 0]))
    const hd = H.head
    if (who === 'louie') {
      addBone('jaw', 'head', [0, 1.62, 0.0], [0, 1.6, 0.08])
      addBone('ballEye', 'head', [0.035, 1.677, 0.07], [0.035, 1.677, 0.12])
      addBone('tailL', 'hips', [0.08, 0.92, -0.14], [0.09, 0.5, -0.15]); addBone('tailR', 'hips', [-0.08, 0.92, -0.14], [-0.09, 0.5, -0.15])
      const tip = J.handTipR
      for (let i = 0; i < 3; i++) addBone('cueBall' + (i + 1), 'handR', add(tip, [0.004 * i, 0.012 + i * 0.098, 0]), add(tip, [0.004 * i, 0.06 + i * 0.098, 0]))
      // 阶段 3：头发二级动画骨（左 / 右 / 后三片，弹簧链；发根以上仍随 head）
      for (const [n, x, z] of [['hairL', 0.075, -0.01], ['hairR', -0.075, -0.01], ['hairB', 0, -0.075]] as [string, number, number][]) addBone(n, 'head', [x, 1.71, z], [x * 1.3, 1.5, z * 1.3 - 0.01])
    } else if (who === 'billy') {
      J.ball = BILLY_BALL_C
      addBone('ball', 'hips', BILLY_BALL_C, add(BILLY_BALL_C, [0, BILLY_BALL_R, 0]))
      let p: V3 = [-0.045, 1.0, 0.44] // 第四轮：舌头缩短（舌尖停在下移后的蝴蝶结之上）
      for (let i = 0; i < 3; i++) { const q = add(p, [0.006, -0.068, [0.06, 0.012, -0.012][i]]); addBone('tongue' + (i + 1), i === 0 ? 'ball' : 'tongue' + i, p, q); p = q }
      addBone('heldBall', 'handR', add(J.handTipR, [0, 0.03, 0.0]), add(J.handTipR, [0, 0.1, 0]))
      // 阶段 3：大蝴蝶结弹簧骨（结心在球下缘前方，见 casinoStaffHeroes BILLY_BOW_DIR）
      { const d = nrm([0, -0.62, 0.785]), c = add(BILLY_BALL_C, scl(d, BILLY_BALL_R + 0.05)); addBone('bow', 'ball', add(BILLY_BALL_C, scl(d, BILLY_BALL_R * 0.8)), c) }
    } else if (who === 'waiter') {
      addBone('wheel', 'head', add(hd, [0, 0.13, 0.05]), add(hd, [0, 0.13, 0.12]))
    } else if (who === 'guard') {
      for (let i = 0; i < 3; i++) addBone('reel' + (i + 1), 'head', add(hd, [(i - 1) * 0.075, 0.17, 0.1]), add(hd, [(i - 1) * 0.075, 0.17, 0.15]))
      addBone('lever', 'head', add(hd, [0.17, 0.12, 0.0]), add(hd, [0.17, 0.3, 0.0]))
    }
  } else if (who === 'prosthetic') {
    const hd: V3 = [0, 1.6, 0.01]
    Object.assign(J, { hips: [0, 0.98, 0], spine: [0, 1.18, 0], chest: [0, 1.38, 0.005], neck: [0, 1.52, 0.01], head: hd })
    addBone('root', null, [0, 0, 0], [0, 0.1, 0])
    addBone('hips', 'root', J.hips, J.spine)
    addBone('spine', 'hips', J.spine, J.chest)
    addBone('chest', 'spine', J.chest, J.neck)
    addBone('neck', 'chest', J.neck, hd)
    addBone('head', 'neck', hd, add(hd, [0, 0.3, 0]))
    addBone('jaw', 'head', add(hd, [0, 0.06, 0.04]), add(hd, [0, 0.04, 0.17]))
    addBone('hat', 'head', [0.1, 1.86, 0.0], [0.12, 2.12, 0.0])
    // 右臂（x<0）：从斗篷上部伸出，弯上来，手在嘴边横握杆；左臂垂在斗篷边
    // 第四轮：肘移到斗篷外前侧（原肘 [-0.3, 1.08, 0.12] 在钟形斗篷里，前臂从斗篷里穿出）
    const armR: V3[] = [[-0.12, 1.4, 0.04], [-0.2, 1.37, 0.07], [-0.33, 1.27, 0.18], [-0.31, 1.47, 0.2], [-0.31, 1.56, 0.22]]
    const armL: V3[] = [[0.12, 1.38, 0.0], [0.2, 1.33, 0.0], [0.27, 1.1, 0.02], [0.29, 0.9, 0.06], [0.3, 0.8, 0.08]]
    for (const [S, A] of [['L', armL], ['R', armR]] as const) {
      addBone('clav' + S, 'chest', A[0], A[1]); addBone('upperArm' + S, 'clav' + S, A[1], A[2]); addBone('foreArm' + S, 'upperArm' + S, A[2], A[3]); addBone('hand' + S, 'foreArm' + S, A[3], A[4])
      J['shoulder' + S] = A[1]; J['elbow' + S] = A[2]; J['wrist' + S] = A[3]; J['handTip' + S] = A[4]
    }
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; addBone('skirt' + i, 'hips', [Math.sin(a) * 0.2, 1.0, Math.cos(a) * 0.2], [Math.sin(a) * 0.4, 0.82, Math.cos(a) * 0.4]) }
    addSpider(addBone, PROS_LEGS, 'hips', J)
  } else {
    // bartender E164
    Object.assign(J, { hips: [0, 0.98, 0], spine: [0, 1.18, 0], eye: [0, 1.2, 0.2] })
    addBone('root', null, [0, 0, 0], [0, 0.1, 0])
    addBone('hips', 'root', J.hips, J.spine)
    addBone('spine', 'hips', J.spine, [0, 1.46, 0])
    addBone('eye', 'spine', J.eye, [0, 1.2, 0.4])
    addBone('mouth', 'hips', [0, 0.84, 0.02], [0, 0.78, 0.1])
    addSpider(addBone, E164_LEGS, 'hips', J)
    addBone('clawL', 'legL1d', E164_LEGS[0].tip, add(E164_LEGS[0].tip, [-0.04, 0, 0.02]))
    addBone('clawR', 'legR1d', sd(E164_LEGS[0].tip, -1), add(sd(E164_LEGS[0].tip, -1), [0.04, 0, 0.02]))
    // 阶段 3：毛团底部垂毛缕的弹簧骨（4 片，按方位）
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; addBone('tuft' + i, 'hips', [Math.sin(a) * 0.2, 0.92, -0.02 + Math.cos(a) * 0.18], [Math.sin(a) * 0.24, 0.72, -0.02 + Math.cos(a) * 0.22]) }
  }
  const seg = BONES.map((b, i) => {
    if (b.tail) return { a: b.pos, b: b.tail }
    const ch = BONES.findIndex((c) => c.parent === i)
    return { a: b.pos, b: ch >= 0 ? BONES[ch].pos : add(b.pos, [0, 0.05, 0]) }
  })
  return (cache[who] = { who, kind, BONES, B, seg, J, fingers })
}

function addSpider(addBone: (n: string, p: string | null, pos: V3, tail?: V3) => void, legs: SpiderLegSpec[], parent: string, J: Record<string, V3>) {
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R'
    legs.forEach((L, i) => {
      const n = `leg${S}${i + 1}`
      const hip = sd(L.hip, s), knee = sd(L.knee, s), ankle = sd(L.ankle, s), foot = sd(L.foot, s), tip = sd(L.tip, s)
      addBone(n + 'a', parent, hip, knee); addBone(n + 'b', n + 'a', knee, ankle); addBone(n + 'c', n + 'b', ankle, foot); addBone(n + 'd', n + 'c', foot, tip)
      Object.assign(J, { [n + 'Hip']: hip, [n + 'Knee']: knee, [n + 'Ankle']: ankle, [n + 'Foot']: foot, [n + 'Tip']: tip })
    })
  }
}

/** 必须存在的骨骼（check 用）：人形骨 + 各角色追加骨 */
export function requiredBones(who: StaffWho): string[] {
  const body = ['root', 'hips', 'spine', 'chest', 'neck', 'head']
  const arms = ['L', 'R'].flatMap((S) => ['clav', 'upperArm', 'foreArm', 'hand'].map((n) => n + S))
  const legs = ['L', 'R'].flatMap((S) => ['thigh', 'shin', 'foot', 'toe'].map((n) => n + S))
  const spider = ['L', 'R'].flatMap((S) => [1, 2, 3, 4].flatMap((i) => ['a', 'b', 'c', 'd'].map((k) => `leg${S}${i}${k}`)))
  switch (who) {
    case 'louie': return [...body, ...arms, ...legs, 'hemL', 'hemR', 'jaw', 'ballEye', 'tailL', 'tailR', 'cueBall1', 'cueBall2', 'cueBall3', 'hairL', 'hairR', 'hairB']
    case 'billy': return [...body, ...arms, ...legs, 'hemL', 'hemR', 'ball', 'tongue1', 'tongue2', 'tongue3', 'heldBall', 'bow', ...['L', 'R'].flatMap((S) => ['thumb', 'index', 'middle', 'ring'].flatMap((f) => [1, 2, 3].map((k) => f + k + S)))]
    case 'prosthetic': return [...body, ...arms, 'jaw', 'hat', 'skirt0', 'skirt1', 'skirt2', 'skirt3', ...spider]
    case 'bartender': return ['root', 'hips', 'spine', 'eye', 'mouth', 'clawL', 'clawR', 'tuft0', 'tuft1', 'tuft2', 'tuft3', ...spider]
    case 'waiter': return [...body, ...arms, ...legs, 'hemL', 'hemR', 'wheel']
    case 'guard': return [...body, ...arms, ...legs, 'hemL', 'hemR', 'reel1', 'reel2', 'reel3', 'lever']
    default: return [...body, ...arms, ...legs, 'hemL', 'hemR']
  }
}
