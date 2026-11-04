/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接读骨骼 / 网格内部 */
// [jazz stage 2] 爵士脑（Entity 197）阶段 2 动画数值自检（无头，CPU 求真实蒙皮顶点）。运行：
//   npm run check:jazz-anim [-- clip,… [who,…]]
// 片段带 who 的只查那个人；通用片段（bow / tuneUp / walk …）四个人都查。每段从 0 起按 1/60 s 连续推进（循环片段先预跑 1 s），逐帧检查：
//   · 指尖到目标：接触组（活塞 / 萨克斯键 / 低音弦 / 琴键）权重满时，每根接触指的指尖骨点到目标点距离（≤ 1.0 cm；目标 = 键面 + 指腹半径）
//   · 手到目标：IK 残差 + 掌心 / 拳心 → pp（权重满时，≤ 1.5 cm）
//   · 手穿头：手 + 手指顶点换到头骨局部，对乐器头的近似体（小号：喇叭口锥 + 三个活塞套管 + 顶键；萨克斯：沿琴身的胶囊链 + 喇叭口；
//     低音提琴：琴身圆角盒 + 琴颈；鼓：鼓腔圆柱 + 两片镲盘）的陷入深度（≤ 0.6 cm——按键时指腹本来就贴着面）
//   · 手穿衣身：手顶点换回躯干静止坐标（hips / spine / chest 逆蒙皮按高度选骨）求衣服芯 coatCore 的陷入深度，扣静止（≤ 1.5 cm）
//   · 袖子穿身体：上臂 / 前臂袖子顶点同上（扣静止——垂手时袖子本就贴着衣身，≤ 1.5 cm；上臂袖顶端藏在衣身肩头里的那截不算）
//   衣身芯 = coatCore 在礼服下摆以下截平（下摆以下是裤腿）
//   · 脚：鞋底穿地（最低 y ≥ −2 mm）；着地脚鞋不悬空（≤ 4 mm）；滑步（着地接触点逐帧水平位移 ≤ 3 mm，走路含根运动）
//   · 臂速：肘 / 腕逐帧速度 ≤ 5 m/s
//   · [E197 肘] 肘弯：弯角 0–150°、不过伸（相对上臂当前铰链轴的反向弯 ≤ 5°）
//   · [E197 肘] 肘向：弯 > 30° 时肘尖（肘在「肩→腕」连线外的偏移方向，胸局部）与期望朝向的点积 ≥ 0
//     （期望 = jazzElbowGoal：手在肩下 / 身前「外 + 下 + 后」，手举过肩渐变为「外 + 下 + 前」——查肘朝里 / 朝上翻 / 往后上翘成鸡翅）
//   · [E197 肘] 肘跳：肘位置逐帧二阶差 ≤ 12 mm（突跳 / 两解之间翻转），弯 > 30° 时肘尖朝向逐帧转角 ≤ 15°
//   · [E197 肘] 前臂扭：手相对「肘铰链中立」前臂的总扭转（腕扭转 + 前臂骨滚转）≤ 90°
//   · [E197 肘] 肘穿头：肘部袖子（上臂袖靠肘 35 % + 前臂袖靠肘 35 %）对乐器头近似体的陷入（扣静止，≤ 6 mm）；肘 / 袖穿衣身见上「袖子穿身体」
//   · 循环首尾：循环片段 t = 0 与 t → dur⁻ 的全部骨骼 root 空间位置差（≤ 5 mm）
//   · 二阶：头惯性位移峰值 ≥ 0.4 mm（每段）；演奏 / 调音段另查乐器件：活塞行程 ≥ 12 mm、萨克斯键 ≥ 3 mm、弦振幅 ≥ 1.5 mm、
//     镲转角 ≥ 0.04 rad、鼓皮 ≥ 2 mm；走路另查下摆骨摆角 ≥ 0.05 rad
// 末尾打印每段结果与「通过 N / M」；有失败时退出码 1。
import { createCanvas } from '@napi-rs/canvas'
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), devicePixelRatio: 1 },
})
const THREE = await import('three')
const { buildJazz } = await import('../src/game/renderer/jazzMesh')
const A = await import('../src/game/renderer/jazzAnim')
const { makeJazzRig, TRUMPET, SAX, BASS, SNARE, saxAxis, BASS_TOPZ } = await import('../src/game/renderer/jazzRig')
const { makeJazzBody } = await import('../src/game/renderer/jazzBody')
type Who = 'leader' | 'sax' | 'bass' | 'drum'

const LIM = { elbowBend: 150, elbowHyper: 5, elbowDir: 0.0, elbowJump: 0.012, elbowFlip: 15, twist: 90, tip: 0.01, hand: 0.015, headIn: 0.006, bodyIn: 0.015, sleeveIn: 0.015, ground: 0.002, float: 0.004, slide: 0.003, speed: 5, loop: 0.005, headDyn: 0.0004, valve: 0.012, key: 0.003, str: 0.0015, cym: 0.04, drum: 0.002, hem: 0.05 }
const t00 = Date.now()
const argv = process.argv.slice(2)
const CLIPS = (argv[0] ? argv[0].split(',') : Object.keys(A.JAZZ_CLIPS)) as any[]
const WHO_F = argv[1] ? argv[1].split(',') : null
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const len2 = (x: number, y: number) => Math.hypot(x, y)
/** 头近似体 SDF（头关节局部坐标，静止朝向） */
function headSdf(who: Who): (p: THREE.Vector3) => number {
  const cap = (p: THREE.Vector3, a: number[], b: number[], r: number) => { const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), ap = new THREE.Vector3(p.x - a[0], p.y - a[1], p.z - a[2]); const t = Math.min(1, Math.max(0, ap.dot(ab) / ab.lengthSq())); return ap.sub(ab.multiplyScalar(t)).length() - r }
  const cylY = (p: THREE.Vector3, c: number[], r: number, y0: number, y1: number) => { const d = len2(p.x - c[0], p.z - c[2]) - r, h = Math.max(y0 - p.y, p.y - y1); return Math.min(Math.max(d, h), 0) + len2(Math.max(d, 0), Math.max(h, 0)) }
  if (who === 'leader') return (p) => {
    // 喇叭口：从 z 0.05（半径 0.016）到 z 0.235（半径 0.104），壁厚——只算外壳（手不会伸进喇叭口里）
    const T = TRUMPET, z = p.z, k = Math.min(1, Math.max(0, (z - T.bellZ0) / (T.bellC[2] - T.bellZ0)))
    const rr = 0.016 + (T.bellR - 0.016) * Math.pow(k, 2.2)
    const dr = len2(p.x - T.bellC[0], p.y - T.bellC[1]) - rr, dz = Math.max(T.bellZ0 - z, z - T.bellC[2])
    let d = Math.min(Math.max(dr, dz), 0) + len2(Math.max(dr, 0), Math.max(dz, 0))
    for (const vz of T.valveZ) d = Math.min(d, cylY(p, [0, 0, vz], T.valveR, T.valveY0, T.capY))
    return d
  }
  if (who === 'sax') return (p) => { let d = 1; const P = SAX.path; for (let i = 0; i < P.length - 1; i++) d = Math.min(d, cap(p, P[i], P[i + 1], Math.min(SAX.r[i], SAX.r[i + 1]))); return d }
  if (who === 'bass') return (p) => {
    const hw = BASS.wLow / 2 + 0.005, y0 = BASS.y0, y1 = BASS.y0 + BASS.h, zf = BASS_TOPZ, zb = BASS.z0 - BASS.rib / 2
    const q = [Math.abs(p.x) - hw * (p.y > y0 + BASS.h * 0.55 ? 0.78 : 1), Math.max(y0 - p.y, p.y - y1), Math.max(zb - p.z, p.z - zf)]
    let d = Math.min(Math.max(q[0], q[1], q[2]), 0) + Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0))
    d = Math.min(d, cap(p, [0, y1 - 0.04, zf + 0.02], [0, y1 + BASS.neckL, zf + 0.02], 0.022))
    return d
  }
  return (p) => {
    const S = SNARE
    const dr = len2(p.x - S.c[0], p.y - S.c[1]) - S.r, dz = Math.abs(p.z - S.c[2]) - S.depth / 2
    let d = Math.min(Math.max(dr, dz), 0) + len2(Math.max(dr, 0), Math.max(dz, 0))
    for (const s of [1, -1]) { const c = new THREE.Vector3(s * S.cymX, S.cymY, S.c[2] - 0.01), n = new THREE.Vector3(s * 0.42, 1, 0.28).normalize(), v = p.clone().sub(c), h = v.dot(n), rad = v.addScaledVector(n, -h).length(); const dc = Math.max(Math.abs(h) - 0.004, rad - S.cymR); d = Math.min(d, dc) }
    return d
  }
}
void saxAxis

interface Man { who: Who; man: THREE.Group; rig: any; sk: THREE.SkinnedMesh; st: Record<string, number>; face: THREE.Object3D; Bd: ReturnType<typeof makeJazzBody>; R: ReturnType<typeof makeJazzRig> }
const MEN: Partial<Record<Who, Man>> = {}
function manOf(who: Who): Man {
  if (MEN[who]) return MEN[who]!
  const t0 = Date.now()
  const man = buildJazz(who, { lod: 0 }); man.updateMatrixWorld(true)
  const rig = man.userData.jazz
  const R = makeJazzRig(who)
  console.log('build', who, Date.now() - t0, 'ms')
  return (MEN[who] = { who, man, rig, sk: rig.body, st: man.userData.jazzStats, face: rig.root.parent, Bd: makeJazzBody(R), R })
}
const sub = (arr: number[], k: number) => arr.filter((_, j) => j % k === 0)

const out: Record<string, any> = {}
let pass = 0, total = 0
const failList: string[] = []
const DEF_WHO: Who[] = ['leader', 'sax', 'bass', 'drum']
for (const clip of CLIPS) {
  const C = (A.JAZZ_CLIPS as any)[clip]
  if (!C) { console.log('no clip', clip); continue }
  let whos: Who[] = C.who ? [C.who] : DEF_WHO
  if (WHO_F) whos = whos.filter((w) => WHO_F.includes(w))
  for (const who of whos) {
    const M = manOf(who), { rig, sk, st, face, Bd, R } = M
    const skel = sk.skeleton, pos = sk.geometry.attributes.position
    const range = (n: string) => { const a = st[n + '_v0'], b = st[n + '_v1']; if (!(b > a)) throw new Error('缺部件顶点区间 ' + n); return Array.from({ length: b - a }, (_, i) => a + i) }
    const restP = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, i)
    const skinnedL = (i: number) => sk.applyBoneTransform(i, new THREE.Vector3().fromBufferAttribute(pos, i))
    const bindI = sk.bindMatrixInverse, bindM = sk.bindMatrix
    const boneM = (b: THREE.Bone) => { const bi = skel.bones.indexOf(b); return new THREE.Matrix4().multiplyMatrices(bindI, new THREE.Matrix4().multiplyMatrices(b.matrixWorld, skel.boneInverses[bi])).multiply(bindM) }
    const loc = (o: THREE.Object3D) => face.worldToLocal(o.getWorldPosition(new THREE.Vector3()))
    const JP = (n: string) => R.BONES[R.B[n]].pos as number[]
    const handV = sub([...range('handL'), ...range('handR')], 3)
    // 袖子：上臂袖顶端藏在衣身肩头里（upT < SLEEVE_CAP_T + 0.1 的那截被衣身盖住，看不见），不算
    const sleeveV = sub([...range('upSleeveL'), ...range('upSleeveR'), ...range('sleeveL'), ...range('sleeveR')], 4).filter((i) => { const p = restP(i), s = p.x >= 0 ? 1 : -1; return Bd.upT(s, p.x, p.y, p.z) > Bd.SLEEVE_CAP_T + 0.1 })
    const shoeV: Record<number, number[]> = { 1: sub(range('shoeL'), 2), [-1]: sub(range('shoeR'), 2) }
    const hs = headSdf(who)
    function torsoInv() { const o: Record<string, THREE.Matrix4> = {}; for (const n of ['hips', 'spine', 'chest']) o[n] = boneM(rig.bones[n]).invert(); return o }
    const torsoDepth = (p: THREE.Vector3, inv: Record<string, THREE.Matrix4>) => { const qs = p.clone().applyMatrix4(inv.spine); const n = qs.y < JP('spine')[1] - 0.04 ? 'hips' : qs.y > JP('chest')[1] - 0.03 ? 'chest' : 'spine'; const q = n === 'spine' ? qs : p.clone().applyMatrix4(inv[n]); return -Math.max(Bd.coatCore(q.x, q.y, q.z), Bd.hemY - q.y) }
    // 静止（建模姿态）深度
    for (const b of Object.values(rig.bones) as THREE.Bone[]) { const r = b.userData.rest; b.position.copy(r.p); b.quaternion.copy(r.q) }
    M.man.updateMatrixWorld(true)
    const inv0 = torsoInv()
    const handD0 = handV.map((i) => Math.max(0, torsoDepth(restP(i), inv0))), sleeveD0 = sleeveV.map((i) => Math.max(0, torsoDepth(restP(i), inv0)))
    const headRestP = (() => { const p = JP('head'); return new THREE.Vector3(p[0], p[1], p[2]) })()
    const handH0 = handV.map((i) => Math.max(0, -hs(restP(i).sub(headRestP))))
    // 肘部袖子（上臂袖靠肘 35 % + 前臂袖靠肘 35 %）：查肘穿乐器头
    const elbowV = sleeveV.filter((i) => { const p = restP(i), s = p.x >= 0 ? 1 : -1; return Bd.upT(s, p.x, p.y, p.z) > 0.65 && Bd.foreT(s, p.x, p.y, p.z) < 0.35 })
    const elbowH0 = elbowV.map((i) => Math.max(0, -hs(restP(i).sub(headRestP))))

    A.resetJazzDynamics(rig)
    const h = 1 / 60, start = C.loop ? -1 : 0
    const prevC: Record<string, THREE.Vector3 | null> = {}
    let prevEl: THREE.Vector3[] | null = null, prevWr: THREE.Vector3[] | null = null
    const r = { tip: 0, tipAt: 0, tipF: '', tipN: 0, hand: 0, handAt: 0, headIn: 0, headInAt: 0, bodyIn: 0, bodyInAt: 0, sleeveIn: 0, sleeveInAt: 0, ground: 0, groundAt: 0, float: 0, floatAt: 0, slide: 0, slideAt: 0, speed: 0, speedAt: 0, headDyn: 0, valveMin: 9, valveMax: -9, keyMin: 9, keyMax: -9, str: 0, cym: 0, drum: 0, hemMin: 9, hemMax: -9 }
    let n = 0
    // 肘：静止链（模型静止坐标）
    const E0: Record<number, { u0: THREE.Vector3; f0: THREE.Vector3; n0: THREE.Vector3 }> = {}
    for (const s of [1, -1]) { const S = s > 0 ? 'L' : 'R', a = new THREE.Vector3(...JP('upperArm' + S)), b = new THREE.Vector3(...JP('foreArm' + S)), c = new THREE.Vector3(...JP('hand' + S)); const u0 = b.clone().sub(a).normalize(), f0 = c.clone().sub(b).normalize(); E0[s] = { u0, f0, n0: new THREE.Vector3().crossVectors(u0, f0).normalize() } }
    const eb = { bend: 0, bendAt: 0, hyper: 0, hyperAt: 0, dir: 9, dirAt: 0, dirE: '', jump: 0, jumpAt: 0, flip: 0, flipAt: 0, twist: 0, twistAt: 0, roll: 0, headIn: 0, headInAt: 0 }
    const ePrev: Record<number, THREE.Vector3[]> = { 1: [], [-1]: [] }, dPrev: Record<number, THREE.Vector3 | null> = { 1: null, [-1]: null }
    const twistOf = (q: THREE.Quaternion, ax: THREE.Vector3) => { const p = q.x * ax.x + q.y * ax.y + q.z * ax.z; let a = 2 * Math.atan2(p, q.w); if (a > Math.PI) a -= 2 * Math.PI; if (a < -Math.PI) a += 2 * Math.PI; return a * 180 / Math.PI }
    const qFace = () => face.getWorldQuaternion(new THREE.Quaternion()).invert()
    const restInst: Record<string, THREE.Vector3> = {}; for (const [k, b] of Object.entries(rig.inst) as [string, THREE.Bone][]) restInst[k] = (b.userData.rest.p as THREE.Vector3).clone()
    for (let t = start; t <= C.dur + 1e-6; t += h, n++) {
      const P = A.animateJazz(rig, clip, t, { time: t, dt: t === start ? undefined : h })
      M.man.updateMatrixWorld(true)
      if (t < 0) continue
      const rm = A.jazzRootMotion(clip, 0, t)[1]
      // 指尖
      const res = A.jazzIkResidual()
      for (const s of [1, -1]) {
        const AP = s > 0 ? P.L : P.R
        if (AP.tips.w >= 0.999 && (A.JAZZ_TIP_FINGERS as any)[AP.tips.set]) {
          const tg = A.jazzTipTargetsNow(rig, AP.tips)
          ;(A.JAZZ_TIP_FINGERS as any)[AP.tips.set].forEach((f: any, k: number) => { const d = (()=>{ const x = A.jazzFingerTip(rig, s, f); return x.distanceTo(new THREE.Vector3(...A.jazzTipGoal(tg[k], x))) })(); r.tipN++; if (d > r.tip) { r.tip = d; r.tipAt = t; r.tipF = (s > 0 ? 'L' : 'R') + f } })
        }
        let d = res.arm
        if (AP.pw >= 0.99) d = Math.max(d, A.jazzPalmPoint(rig, s, AP.pk).distanceTo(new THREE.Vector3(...AP.pp)))
        if (d > r.hand && (AP.pw >= 0.99 || AP.tips.w >= 0.99 || AP.hw >= 0.99)) { r.hand = d; r.handAt = t }
      }
      // 滑步 + 鞋
      for (const s of [1, -1]) {
        const S = s > 0 ? 'L' : 'R'
        const W = (p: THREE.Vector3) => p.add(new THREE.Vector3(0, 0, rm))
        const ball = W(loc(rig.bones['toe' + S])), heel = W(face.worldToLocal(new THREE.Vector3(0, -JP('foot' + S)[1], -0.062).applyMatrix4(rig.bones['foot' + S].matrixWorld)))
        for (const [nm, p, gy] of [['b' + S, ball, JP('toeL')[1] + 0.006], ['h' + S, heel, 0.006]] as [string, THREE.Vector3, number][]) {
          const on = p.y < gy, q = prevC[nm]
          if (on && q) { const dd = Math.hypot(p.x - q.x, p.z - q.z); if (dd > r.slide) { r.slide = dd; r.slideAt = t } }
          prevC[nm] = on ? p.clone() : null
        }
        let mn = 9
        for (const i of shoeV[s]) { const p = skinnedL(i); if (p.y < mn) mn = p.y }
        if (-mn > r.ground) { r.ground = -mn; r.groundAt = t }
        const LP = s > 0 ? P.legL : P.legR
        if (LP.p[1] < 0.002 && mn > r.float) { r.float = mn; r.floatAt = t }
      }
      // 臂速
      const el = [loc(rig.bones.foreArmL), loc(rig.bones.foreArmR)], wr = [loc(rig.bones.handL), loc(rig.bones.handR)]
      if (prevEl && prevWr && t > 0) for (let k = 0; k < 2; k++) { const sp = Math.max(el[k].distanceTo(prevEl[k]), wr[k].distanceTo(prevWr[k])) / h; if (sp > r.speed) { r.speed = sp; r.speedAt = t } }
      prevEl = el; prevWr = wr
      // 肘：弯角 / 过伸 / 肘尖朝向（胸局部：外 + 下 + 后）/ 逐帧突跳（位置二阶差、朝向翻转）/ 前臂扭转（腕 + 肘滚转）
      {
        const qf = qFace(), qCh = qf.clone().multiply(rig.bones.chest.getWorldQuaternion(new THREE.Quaternion())), qChI = qCh.clone().invert()
        for (const s of [1, -1]) {
          const S = s > 0 ? 'L' : 'R', k = s > 0 ? 0 : 1
          const Sp = loc(rig.bones['upperArm' + S]), Ep = el[k], Wp = wr[k]
          const u = Ep.clone().sub(Sp).normalize(), f = Wp.clone().sub(Ep).normalize()
          const qU = qf.clone().multiply(rig.bones['upperArm' + S].getWorldQuaternion(new THREE.Quaternion()))
          const hinge = E0[s].n0.clone().applyQuaternion(qU)
          const bend = Math.acos(Math.min(1, Math.max(-1, u.dot(f)))) * 180 / Math.PI
          const sgn = new THREE.Vector3().crossVectors(u, f).dot(hinge)
          if (sgn >= 0 && bend > eb.bend) { eb.bend = bend; eb.bendAt = t }
          if (sgn < 0 && bend > eb.hyper) { eb.hyper = bend; eb.hyperAt = t }
          const dl = Wp.clone().sub(Sp).normalize(), e = Ep.clone().sub(Sp); e.addScaledVector(dl, -e.dot(dl))
          const ec = e.clone().normalize().applyQuaternion(qChI)
          if (bend > 30) {
            const g = A.jazzElbowGoal(s, Wp.clone().sub(Sp).applyQuaternion(qChI)), dd = ec.dot(g)
            if (dd < eb.dir) { eb.dir = dd; eb.dirAt = t; eb.dirE = S + ec.toArray().map((x) => x.toFixed(2)).join(',') }
            const q = dPrev[s]; if (q) { const a = Math.acos(Math.min(1, Math.max(-1, q.dot(ec)))) * 180 / Math.PI; if (a > eb.flip) { eb.flip = a; eb.flipAt = t } }
            dPrev[s] = ec.clone()
          } else dPrev[s] = null
          const H = ePrev[s]; H.push(Ep.clone()); if (H.length > 3) H.shift()
          if (H.length === 3 && t > 2 * h) { const j = H[2].clone().sub(H[1].clone().multiplyScalar(2)).add(H[0]).length(); if (j > eb.jump) { eb.jump = j; eb.jumpAt = t } }
          const tw = twistOf(rig.bones['hand' + S].quaternion, E0[s].f0), rl = twistOf(rig.bones['foreArm' + S].quaternion, E0[s].f0)
          // 前臂总扭转 = 腕扭转 + 前臂滚转（手相对「肘铰链中立」前臂）
          const tot = Math.abs(tw + rl); if (tot > eb.twist) { eb.twist = tot; eb.twistAt = t; eb.roll = Math.abs(rl) }
        }
      }
      // 二阶 / 乐器
      { const d = rig.__jdyn?.head?.x?.length?.() ?? 0; r.headDyn = Math.max(r.headDyn, d) }
      if (who === 'leader') for (let i = 1; i <= 3; i++) { const y = rig.inst['valve' + i].position.y - restInst['valve' + i].y; r.valveMin = Math.min(r.valveMin, y); r.valveMax = Math.max(r.valveMax, y) }
      if (who === 'sax') for (let i = 1; i <= 6; i++) { const z = rig.inst['key' + i].position.z - restInst['key' + i].z; r.keyMin = Math.min(r.keyMin, z); r.keyMax = Math.max(r.keyMax, z) }
      if (who === 'bass') for (let i = 1; i <= 4; i++) r.str = Math.max(r.str, rig.inst['str' + i].position.distanceTo(restInst['str' + i]))
      if (who === 'drum') { r.cym = Math.max(r.cym, Math.abs(rig.inst.cymL.rotation.x), Math.abs(rig.inst.cymR.rotation.x)); r.drum = Math.max(r.drum, Math.abs(rig.inst.drumHead.position.z - restInst.drumHead.z)) }
      { const x = rig.hemL.rotation.x; r.hemMin = Math.min(r.hemMin, x); r.hemMax = Math.max(r.hemMax, x) }
      // 穿插（每 3 帧）
      if (n % 3 === 0) {
        const inv = torsoInv()
        const hi = boneM(rig.bones.head).invert()
        handV.forEach((i, j) => {
          const p = skinnedL(i)
          const d = torsoDepth(p, inv) - handD0[j]; if (d > r.bodyIn) { r.bodyIn = d; r.bodyInAt = t; (r as any).bv = [i, restP(i).toArray().map((x) => +x.toFixed(3))] }
          const q = p.clone().applyMatrix4(hi).sub(headRestP), dh = -hs(q) - handH0[j]; if (dh > r.headIn) { r.headIn = dh; r.headInAt = t; (r as any).hv = [i, q.toArray().map((x) => +x.toFixed(3))] }
        })
        elbowV.forEach((i, j) => { const p = skinnedL(i), q = p.clone().applyMatrix4(hi).sub(headRestP), dh = -hs(q) - elbowH0[j]; if (dh > eb.headIn) { eb.headIn = dh; eb.headInAt = t; (eb as any).shv = [restP(i).toArray().map((x) => +x.toFixed(3)), q.toArray().map((x) => +x.toFixed(3))] } })
        sleeveV.forEach((i, j) => { const p = skinnedL(i); const d = torsoDepth(p, inv) - sleeveD0[j]; if (d > r.sleeveIn) { r.sleeveIn = d; r.sleeveInAt = t; (r as any).sv = restP(i).toArray().map((x) => +x.toFixed(3)) } })
      }
    }
    // 循环首尾
    let loopD = 0
    if (C.loop) {
      const snap = (t: number) => { A.resetJazzDynamics(rig); A.animateJazz(rig, clip, t, { time: t }); M.man.updateMatrixWorld(true); return (Object.values(rig.bones) as THREE.Bone[]).map((b) => loc(b)) }
      const a = snap(0), b = snap(C.dur - 1 / 600)
      a.forEach((p, i) => { loopD = Math.max(loopD, p.distanceTo(b[i])) })
    }
    const play = /Play|Solo|tuneUp/.test(clip)
    const instOk = !play ? true : who === 'leader' ? -r.valveMin >= LIM.valve : who === 'sax' ? -r.keyMin >= LIM.key : who === 'bass' ? r.str >= LIM.str : r.cym >= LIM.cym && r.drum >= LIM.drum
    const checks: Record<string, boolean> = {
      指尖: r.tip <= LIM.tip, 手到目标: r.hand <= LIM.hand, 手穿头: r.headIn <= LIM.headIn, 手穿衣身: r.bodyIn <= LIM.bodyIn, 袖穿身: r.sleeveIn <= LIM.sleeveIn,
      脚: r.ground <= LIM.ground && r.float <= LIM.float && r.slide <= LIM.slide, 臂速: r.speed <= LIM.speed, 循环: loopD <= LIM.loop,
      肘弯: eb.bend <= LIM.elbowBend && eb.hyper <= LIM.elbowHyper, 肘向: eb.dir >= LIM.elbowDir, 肘跳: eb.jump <= LIM.elbowJump && eb.flip <= LIM.elbowFlip, 前臂扭: eb.twist <= LIM.twist, 肘穿头: eb.headIn <= LIM.headIn,
      二阶: r.headDyn >= LIM.headDyn && instOk && (clip !== 'walk' || r.hemMax - r.hemMin >= LIM.hem),
    }
    const f2 = (x: number) => +x.toFixed(2), mm = (x: number) => (x * 1000).toFixed(1) + 'mm'
    const key = clip + '@' + who
    out[key] = {
      指尖: r.tipN ? `${mm(r.tip)}${r.tipF}@${f2(r.tipAt)}s(${r.tipN})` : '-', 手: `${mm(r.hand)}@${f2(r.handAt)}`, 穿头: `${mm(r.headIn)}@${f2(r.headInAt)}`, 穿身: `${mm(r.bodyIn)}@${f2(r.bodyInAt)}`, 袖: `${mm(r.sleeveIn)}@${f2(r.sleeveInAt)}`,
      脚: `地${mm(r.ground)} 悬${mm(r.float)}@${f2(r.floatAt)} 滑${mm(r.slide)}@${f2(r.slideAt)}`, 臂速: `${r.speed.toFixed(2)}@${f2(r.speedAt)}`, 循环: C.loop ? mm(loopD) : '-',
      肘: `弯${eb.bend.toFixed(0)}°@${f2(eb.bendAt)} 过伸${eb.hyper.toFixed(0)}° 向${eb.dir.toFixed(2)}@${f2(eb.dirAt)}(${eb.dirE}) 跳${mm(eb.jump)}@${f2(eb.jumpAt)} 翻${eb.flip.toFixed(0)}°@${f2(eb.flipAt)} 扭${eb.twist.toFixed(0)}°(滚${eb.roll.toFixed(0)})@${f2(eb.twistAt)} 肘穿头${mm(eb.headIn)}@${f2(eb.headInAt)}`,
      二阶: `头${mm(r.headDyn)}` + (who === 'leader' ? ` 活塞${mm(-r.valveMin)}` : who === 'sax' ? ` 键${mm(-r.keyMin)}` : who === 'bass' ? ` 弦${mm(r.str)}` : ` 镲${r.cym.toFixed(3)} 鼓皮${mm(r.drum)}`) + (clip === 'walk' ? ` 下摆${(r.hemMax - r.hemMin).toFixed(3)}` : ''),
    }
    if (process.env.J_DBG) console.log('  dbg head', JSON.stringify((r as any).hv), 'body', JSON.stringify((r as any).bv), 'sleeve', JSON.stringify((r as any).sv), 'elbowHead', JSON.stringify((eb as any).shv), 'handL', st.handL_v0, st.handL_v1, 'handR', st.handR_v0, st.handR_v1)
    const np = Object.values(checks).filter(Boolean).length
    pass += np; total += Object.keys(checks).length
    const bad = Object.entries(checks).filter(([, x]) => !x).map(([k]) => k)
    if (bad.length) failList.push(key + ':' + bad.join('/'))
    console.log(`${key.padEnd(24)} ${np}/${Object.keys(checks).length}${bad.length ? ' ✗ ' + bad.join(',') : ' ✓'}  ${JSON.stringify(out[key])}`)
  }
}
console.log(`通过 ${pass} / ${total}（限值：指尖 ${LIM.tip * 100} cm、手到目标 ${LIM.hand * 100} cm、手穿头 ${LIM.headIn * 1000} mm、手 / 袖穿衣身 ${LIM.bodyIn * 100} cm、鞋：穿地 ${LIM.ground * 1000} / 悬空 ${LIM.float * 1000} mm、滑步 ${LIM.slide * 1000} mm/帧、臂速 ${LIM.speed} m/s、循环首尾 ${LIM.loop * 1000} mm、头惯性 ≥ ${LIM.headDyn * 1000} mm；肘：弯 ≤ ${LIM.elbowBend}°、过伸 ≤ ${LIM.elbowHyper}°、朝向 ≥ ${LIM.elbowDir}、二阶突跳 ≤ ${LIM.elbowJump * 1000} mm / 翻转 ≤ ${LIM.elbowFlip}°、前臂扭 ≤ ${LIM.twist}°、肘穿头 ≤ ${LIM.headIn * 1000} mm）  ${Date.now() - t00} ms`)
if (failList.length) console.log('失败：' + failList.join('  '))
if (pass < total) process.exitCode = 1
