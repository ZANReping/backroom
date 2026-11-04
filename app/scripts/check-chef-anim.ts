/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接读骨骼 / 网格内部 */
// [chef stage 2] 厨师（Entity 800）阶段 2 动画数值自检（无头，CPU 求真实蒙皮顶点）。运行：
//   npm run check:chef-anim [-- clip,…]
// 每个片段从 0 起按 1/60 s 连续推进（循环片段先预跑 1 s），逐帧检查：
//   · 滑步：脚掌（toe 关节）/ 脚跟两个接触点在「世界」里（含根运动 / root 骨位移）连续两帧都贴地时的水平位移（每帧 ≤ 3 mm）
//   · 手到目标：IK 残差 + 掌心 / 拳心 → pp、捏合点 → g 的距离（权重满时，≤ 1.5 cm）
//   · 臂速：肘 / 腕逐帧速度 ≤ 4.5 m/s（potSwing 挥击窗 1.3–1.6 s 放宽到 14 m/s——那一下就是要快）；腕高过头顶（> 1.85 m，potSwing 蓄力段除外）
//   · 围裙穿腿：围裙顶点对 大腿 / 小腿 胶囊（厨裤半径）的陷入深度，扣掉静止时已有的深度（≤ 1.5 cm，每 3 帧）
//   · 衣摆 / 肚子穿腿：厨师服下半（肚子 + 下摆；围裙挡住的前片不算）顶点陷进腿胶囊的深度（扣静止）；以及静止时藏在衣摆里的厨裤顶点从衣服芯里冒出来的距离（≤ 1.5 cm）
//   · 手穿肚子：手 + 前臂袖顶点换回躯干静止坐标（hips / spine / chest / belly 逆蒙皮，按高度 + 肚子权重选骨）求衣服芯 SDF 的陷入深度（扣静止，≤ 1.5 cm）
//   · 鞋：鞋底穿地（最低 y ≥ −2 mm）；着地脚（姿态里脚掌点贴地）鞋不悬空（最低 y ≤ 4 mm）；两鞋互穿（一只鞋顶点陷进另一只鞋 SDF ≤ 3 mm）
//   · 手与道具：汤锅 / 雕刻刀 / 汤勺柄轴与拳眼轴夹角（≤ 35°）；紫甘蓝：手指骨点陷进甘蓝球芯 ≤ 1 cm、掌心离甘蓝心 ≤ 12 cm；
//     盘子 / 门闩 / 后领 / 刀墙取刀由「手到目标」覆盖
//   · 二阶：每段肚子位移峰值（位移 + 缩放 × 0.2 m）≥ 2 mm、双下巴 ≥ 0.6 mm、耳根转角变化 ≥ 0.03 rad（确认每段都有二级运动）
// 末尾打印每段结果与「通过 N / M」；有失败时退出码 1。
import { createCanvas } from '@napi-rs/canvas'
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), devicePixelRatio: 1 },
})
const THREE = await import('three')
const { buildChef } = await import('../src/game/renderer/chefMesh')
const A = await import('../src/game/renderer/chefAnim')
const { BONES, B, BELLY_C } = await import('../src/game/renderer/chefRig')
const CB = await import('../src/game/renderer/chefBody')

const t0 = Date.now()
const man = buildChef({ lod: 0 }); man.updateMatrixWorld(true)
const rig = man.userData.chef as any
const face = rig.root.parent as THREE.Object3D
const sk = rig.body as THREE.SkinnedMesh
const skel = sk.skeleton
const st = man.userData.chefStats as Record<string, number>
console.log('build', Date.now() - t0, 'ms')

const LIM = { slide: 0.003, hand: 0.015, speed: 4.5, speedHit: 14, apron: 0.015, coat: 0.015, handIn: 0.015, ground: 0.002, float: 0.004, shoeX: 0.003, grip: 0.61, cab: 0.01, cabFar: 0.12, belly: 0.002, chin: 0.0006, ear: 0.03 }
const JP = (n: string) => BONES[B[n]].pos as number[]
const TOE_H = JP('toeL')[1]
const HEEL_OFF = (s: number) => { const a = JP('foot' + (s > 0 ? 'L' : 'R')); return new THREE.Vector3(0, -a[1], -0.065) }
const loc = (o: THREE.Object3D, off?: THREE.Vector3) => { const p = off ? off.clone().applyMatrix4(o.matrixWorld) : o.getWorldPosition(new THREE.Vector3()); return face.worldToLocal(p) }
const pos = sk.geometry.attributes.position
const range = (n: string) => { const a = st[n + '_v0'], b = st[n + '_v1']; if (!(b > a)) throw new Error('缺部件顶点区间 ' + n + '：' + Object.keys(st).filter((k) => k.endsWith('_v0')).join(',')); return Array.from({ length: b - a }, (_, i) => a + i) }
const restP = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, i)
const skinnedL = (i: number) => sk.applyBoneTransform(i, new THREE.Vector3().fromBufferAttribute(pos, i))
const bindI = sk.bindMatrixInverse, bindM = sk.bindMatrix
/** 骨 b 的蒙皮矩阵（网格局部） */
const boneM = (b: THREE.Bone) => { const bi = skel.bones.indexOf(b); return new THREE.Matrix4().multiplyMatrices(bindI, new THREE.Matrix4().multiplyMatrices(b.matrixWorld, skel.boneInverses[bi])).multiply(bindM) }
// 网格局部 = 厨师 root 空间？（face 组里 SkinnedMesh 不带位移）——静止时核对
{ const i = range('coat')[0], a = restP(i), b = skinnedL(i); if (a.distanceTo(b) > 1e-5) throw new Error('静止蒙皮不等于静止位置') }
const sub = (arr: number[], k: number) => arr.filter((_, j) => j % k === 0)

// ---------- 腿胶囊（厨裤）----------
const coneD = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number) => { const ab = b.clone().sub(a), t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / ab.lengthSq())); return ra + (rb - ra) * t - p.distanceTo(a.clone().addScaledVector(ab, t)) }
let LEGS: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = []
const legBones = () => { LEGS = ['L', 'R'].map((S) => [skinPt(rig.bones['thigh' + S]), skinPt(rig.bones['shin' + S]), skinPt(rig.bones['foot' + S])] as [THREE.Vector3, THREE.Vector3, THREE.Vector3]) }
/** 骨原点（网格局部） */
const skinPt = (b: THREE.Bone) => new THREE.Vector3(...(BONES[B[b.name]].pos as [number, number, number])).applyMatrix4(boneM(b))
function legDepth(p: THREE.Vector3) {
  let d = -1
  for (const [h, k, f] of LEGS) {
    // 大腿从髋关节下 6 cm 起算（再往上是骨盆，被衣摆盖住）
    const h2 = h.clone().lerp(k, 0.14)
    d = Math.max(d, coneD(p, h2, k, 0.12, 0.095), coneD(p, k, f, 0.095, 0.08))
  }
  return d
}
legBones()
const aMat = sk.geometry.attributes.aMat
// 厨师服下半：围裙挡住的前片（y < 0.89、z > −0.01）不算（看不见，围裙另查）
const apronV = Array.from({ length: pos.count }, (_, i) => i).filter((i) => Math.abs(aMat.getX(i) - CB.MAT.apron) < 0.5), coatV = range('coat').filter((i) => pos.getY(i) < 1.12 && pos.getZ(i) > -0.12 && !(pos.getY(i) < 0.89 && pos.getZ(i) > -0.01))
const apronS = sub(apronV, 3), coatS = sub(coatV, 3)
const apronD0 = apronS.map((i) => Math.max(0, legDepth(restP(i)))), coatD0 = coatS.map((i) => Math.max(0, legDepth(restP(i))))
// 静止时藏在衣摆里的厨裤顶点
const pantsHid = sub(range('pants').filter((i) => { const p = restP(i); return p.y > 0.86 && CB.coatCore(p.x, p.y, p.z) < -0.006 }), 3)
console.log('apron', apronV.length, 'coat(lower)', coatV.length, 'pants(hidden)', pantsHid.length)

// ---------- 躯干（手穿肚子）----------
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const handV = sub([...range('handL'), ...range('handR'), ...range('sleeveL'), ...range('sleeveR')], 4)
function torsoInv() { const o: Record<string, THREE.Matrix4> = {}; for (const n of ['hips', 'spine', 'chest', 'belly']) o[n] = boneM(rig.bones[n]).invert(); return o }
function torsoDepth(p: THREE.Vector3, inv: Record<string, THREE.Matrix4>) {
  const qs = p.clone().applyMatrix4(inv.spine)
  const bk = 0.9 * Math.exp(-((Math.hypot(qs.x / 1.2, qs.y - 1.01, (qs.z - 0.2) * 0.8) / 0.18) ** 2) / 2) * sstep(0.02, 0.14, qs.z)
  const n = bk > 0.35 ? 'belly' : qs.y < 1.06 ? 'hips' : qs.y > 1.27 ? 'chest' : 'spine'
  const q = n === 'spine' ? qs : p.clone().applyMatrix4(inv[n])
  return -CB.coatCore(q.x, q.y, q.z)
}
const inv0 = torsoInv()
const handD0 = handV.map((i) => Math.max(0, torsoDepth(restP(i), inv0)))

// ---------- 鞋 ----------
const SS = [1, -1], SN = (s: number) => (s > 0 ? 'L' : 'R')
const shoeSdf: Record<number, (x: number, y: number, z: number) => number> = { 1: CB.shoeSdf(1), [-1]: CB.shoeSdf(-1) }
const shoeV: Record<number, number[]> = { 1: range('shoeL'), [-1]: range('shoeR') }
const shoeVS: Record<number, number[]> = { 1: sub(shoeV[1], 2), [-1]: sub(shoeV[-1], 2) }
/** 网格局部点 → 鞋 s 的静止坐标：按该点相对脚趾关节的前后选 foot / toe 骨逆蒙皮 */
function toShoeRest(p: THREE.Vector3, s: number, inv: { foot: THREE.Matrix4; toe: THREE.Matrix4 }) {
  const qf = p.clone().applyMatrix4(inv.foot)
  if (qf.z < JP('toe' + SN(s))[2]) return qf
  return p.clone().applyMatrix4(inv.toe)
}

// ---------- 甘蓝 ----------
const CAB_R = 0.075 * 1.03
const fingerPts = () => { const o: THREE.Vector3[] = []; for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) for (let k = 1; k <= 3; k++) o.push(loc(rig.bones[f + k + 'R'])); return o }

const CLIPS = (process.argv[2] ? process.argv[2].split(',') : Object.keys(A.CHEF_CLIPS)) as any[]
const ARMS_UP_OK: Record<string, [number, number]> = { potSwing: [0.9, 1.5] }
const FAST_OK: Record<string, [number, number]> = { potSwing: [1.3, 1.62] }
const out: Record<string, any> = {}
let pass = 0, total = 0
const bellyRest = rig.belly.position.clone(), chinRest = rig.chin.position.clone()
for (const clip of CLIPS) {
  const C = A.CHEF_CLIPS[clip as keyof typeof A.CHEF_CLIPS], h = 1 / 60
  A.resetChefDynamics(rig)
  const start = C.loop ? -1 : 0
  const prevC: Record<string, THREE.Vector3 | null> = {}
  let prevEl: THREE.Vector3[] | null = null, prevWr: THREE.Vector3[] | null = null
  const r = { slide: 0, slideAt: 0, slideN: 0, hand: 0, handAt: 0, handS: '', ik: 0, speed: 0, speedR: 0, speedAt: 0, overHead: 0, overAt: 0, apron: 0, apronAt: 0, coat: 0, coatAt: 0, coatK: '', handIn: 0, handInAt: 0, ground: 0, groundAt: 0, float: 0, floatAt: 0, shoeX: 0, shoeXAt: 0, grip: 0, gripAt: 0, gripN: '', cab: 0, cabFar: 0, belly: 0, chin: 0, earMin: 9, earMax: -9 }
  let n = 0
  for (let t = start; t <= C.dur + 1e-6; t += h, n++) {
    const P = A.animateChef(rig, clip, t, { time: t, dt: t === start ? undefined : h })
    man.updateMatrixWorld(true)
    if (t < 0) continue
    const rm = A.chefRootMotion(clip, 0, t)[1]
    const W = (p: THREE.Vector3) => p.add(new THREE.Vector3(0, 0, rm))
    // 滑步
    for (const s of SS) {
      const S = SN(s)
      const ball = W(loc(rig.bones['toe' + S])), heel = W(loc(rig.bones['foot' + S], HEEL_OFF(s)))
      for (const [nm, p, gy] of [['b' + S, ball, TOE_H + 0.006], ['h' + S, heel, 0.006]] as [string, THREE.Vector3, number][]) {
        const on = p.y < gy, q = prevC[nm]
        if (on && q) { const d = Math.hypot(p.x - q.x, p.z - q.z); if (d > r.slide) { r.slide = d; r.slideAt = t } if (d > LIM.slide) r.slideN++ }
        prevC[nm] = on ? p.clone() : null
      }
    }
    // 手到目标
    const ik = A.chefIkResidual().arm; r.ik = Math.max(r.ik, ik)
    for (const s of SS) {
      const AP = s > 0 ? P.L : P.R
      let d = 0
      if (AP.pw >= 0.99) d = A.chefPalmPoint(rig, s, AP.pk).distanceTo(new THREE.Vector3(...AP.pp))
      else if (AP.gw >= 0.99) d = A.chefPinchPoint(rig, s).distanceTo(new THREE.Vector3(...AP.g))
      d = Math.max(d, ik)
      if (d > r.hand) { r.hand = d; r.handAt = t; r.handS = SN(s) }
    }
    // 臂速 / 过头顶
    const el = [loc(rig.bones.foreArmL), loc(rig.bones.foreArmR)], wr = [loc(rig.bones.handL), loc(rig.bones.handR)]
    const fast = FAST_OK[clip], fastNow = fast && t >= fast[0] && t <= fast[1]
    if (prevEl && prevWr && t > 0) for (let k = 0; k < 2; k++) {
      const sp = Math.max(el[k].distanceTo(prevEl[k]), wr[k].distanceTo(prevWr[k])) / h
      const lim = fastNow ? LIM.speedHit : LIM.speed
      if (sp / lim > r.speedR) { r.speedR = sp / lim; r.speed = sp; r.speedAt = t }
    }
    if (process.env.C_TRACE && n % Number(process.env.C_TRACE) === 0) console.log('  t', t.toFixed(2), 'ik', (ik * 100).toFixed(1), 'wrL', wr[0].toArray().map((x) => x.toFixed(2)).join(','), 'wrR', wr[1].toArray().map((x) => x.toFixed(2)).join(','))
    prevEl = el; prevWr = wr
    const ok = ARMS_UP_OK[clip]
    if (!(ok && t >= ok[0] && t <= ok[1])) for (const w of wr) if (w.y > 1.85) { r.overHead++; r.overAt = t }
    // 鞋
    {
      const inv: Record<number, { foot: THREE.Matrix4; toe: THREE.Matrix4 }> = {}
      for (const s of SS) inv[s] = { foot: boneM(rig.bones['foot' + SN(s)]).invert(), toe: boneM(rig.bones['toe' + SN(s)]).invert() }
      const shoeP: Record<number, THREE.Vector3[]> = {}
      for (const s of SS) {
        let mn = 9
        shoeP[s] = shoeVS[s].map((i) => { const p = skinnedL(i); if (p.y < mn) mn = p.y; return p })
        // root 骨位移（standFromChair）已在蒙皮里；地面 y = 0
        if (-mn > r.ground) { r.ground = -mn; r.groundAt = t }
        const LP = s > 0 ? P.legL : P.legR
        if (LP.p[1] < 0.002 && mn > r.float) { r.float = mn; r.floatAt = t }
      }
      const fa = rig.bones.toeL.getWorldPosition(new THREE.Vector3()), fb = rig.bones.toeR.getWorldPosition(new THREE.Vector3())
      if (fa.distanceTo(fb) < 0.4) for (const s of SS) for (const p of shoeP[s]) {
        const d = -shoeSdf[-s](...toShoeRest(p, -s, inv[-s]).toArray() as [number, number, number])
        if (d > r.shoeX) { r.shoeX = d; r.shoeXAt = t }
      }
    }
    // 道具
    for (const nm of ['pot', 'knife', 'ladle'] as const) if (rig.props[nm].visible) { const a = A.chefGripAngle(rig, nm); if (a > r.grip) { r.grip = a; r.gripAt = t; r.gripN = nm } }
    if (rig.props.cabbage.visible) {
      const c = loc(rig.props.cabbage)
      for (const p of fingerPts()) r.cab = Math.max(r.cab, CAB_R - p.distanceTo(c))
      r.cabFar = Math.max(r.cabFar, A.chefPalmPoint(rig, -1, 0).distanceTo(c))
    }
    // 二阶
    // 肚子：位移 + 缩放（表面半径约 0.2 m）都算；双下巴：总位移
    r.belly = Math.max(r.belly, rig.belly.position.clone().sub(bellyRest).length() + 0.2 * Math.abs(rig.belly.scale.z - 1))
    r.chin = Math.max(r.chin, rig.chin.position.clone().sub(chinRest).length())
    { const e = 2 * Math.acos(Math.min(1, Math.abs(rig.earL[2].quaternion.w))) + 2 * Math.acos(Math.min(1, Math.abs(rig.earL[0].quaternion.w))); r.earMin = Math.min(r.earMin, e); r.earMax = Math.max(r.earMax, e) }
    // 穿插（每 3 帧）
    if (n % 3 === 0) {
      legBones()
      apronS.forEach((i, j) => { const d = legDepth(skinnedL(i)) - apronD0[j]; if (d > r.apron) { r.apron = d; r.apronAt = t } })
      coatS.forEach((i, j) => { const d = legDepth(skinnedL(i)) - coatD0[j]; if (d > r.coat) { r.coat = d; r.coatAt = t; r.coatK = '肚子陷进腿'; (r as any).coatV = i } })
      const inv = torsoInv()
      const ih = boneM(rig.bones.hips).invert()
      for (const i of pantsHid) { const q = skinnedL(i).applyMatrix4(ih), d = CB.coatCore(q.x, q.y, q.z); if (d > r.coat) { r.coat = d; r.coatAt = t; r.coatK = '厨裤顶出衣摆' } }
      handV.forEach((i, j) => { const d = torsoDepth(skinnedL(i), inv) - handD0[j]; if (d > r.handIn) { r.handIn = d; r.handInAt = t; (r as any).handV = i } })
    }
  }
  const ear = r.earMax - r.earMin
  if (process.env.C_DBG && (r as any).handV !== undefined) console.log('  worst hand vert rest', restP((r as any).handV).toArray().map((x) => +x.toFixed(3)))
  if (process.env.C_DBG && (r as any).coatV !== undefined) console.log('  worst coat vert rest', restP((r as any).coatV).toArray().map((x) => +x.toFixed(3)))
  const checks: Record<string, boolean> = {
    滑步: r.slide <= LIM.slide, 手到目标: r.hand <= LIM.hand, 臂速: r.speedR <= 1, 过头顶: r.overHead === 0,
    围裙穿腿: r.apron <= LIM.apron, 衣摆肚子穿腿: r.coat <= LIM.coat, 手穿肚子: r.handIn <= LIM.handIn,
    鞋: r.ground <= LIM.ground && r.float <= LIM.float && r.shoeX <= LIM.shoeX,
    道具: r.grip <= LIM.grip && r.cab <= LIM.cab && r.cabFar <= LIM.cabFar,
    二阶: r.belly >= LIM.belly && r.chin >= LIM.chin && ear >= LIM.ear,
  }
  const f2 = (x: number) => +x.toFixed(2), mm = (x: number) => (x * 1000).toFixed(1) + 'mm', cm = (x: number) => (x * 100).toFixed(2) + 'cm'
  out[clip] = {
    滑步: `${mm(r.slide)}@${f2(r.slideAt)}s(${r.slideN}帧超)`, 手到目标: `${cm(r.hand)}${r.handS}@${f2(r.handAt)}s`, 臂速: `${r.speed.toFixed(2)}m/s@${f2(r.speedAt)}s`,
    过头顶: r.overHead ? `${r.overHead}帧@${f2(r.overAt)}s` : 0, 围裙: `${cm(r.apron)}@${f2(r.apronAt)}s`, 衣摆: `${cm(r.coat)}${r.coatK}@${f2(r.coatAt)}s`, 手穿: `${cm(r.handIn)}@${f2(r.handInAt)}s`,
    鞋: `地${mm(r.ground)}@${f2(r.groundAt)} 悬${mm(r.float)}@${f2(r.floatAt)} 互${mm(r.shoeX)}@${f2(r.shoeXAt)}`,
    道具: `${r.gripN ? r.gripN + ' ' + (r.grip * 57.3).toFixed(0) + '°@' + f2(r.gripAt) : '-'}${r.cabFar ? ` 甘蓝陷${mm(r.cab)} 掌距${cm(r.cabFar)}` : ''}`,
    二阶: `肚${mm(r.belly)} 下巴${mm(r.chin)} 耳${ear.toFixed(3)}`,
  }
  const np = Object.values(checks).filter(Boolean).length
  pass += np; total += Object.keys(checks).length
  const bad = Object.entries(checks).filter(([, x]) => !x).map(([k]) => k)
  console.log(`${clip.padEnd(15)} ${np}/${Object.keys(checks).length}${bad.length ? ' ✗ ' + bad.join(',') : ' ✓'}  ${JSON.stringify(out[clip])}`)
}
void BELLY_C
console.log(`通过 ${pass} / ${total}（限值：滑步 ${LIM.slide * 1000} mm/帧、手到目标 ${LIM.hand * 100} cm、臂速 ${LIM.speed}（挥击 ${LIM.speedHit}）m/s、围裙 / 衣摆 / 手穿肚子 ${LIM.apron * 100} cm、鞋：穿地 ${LIM.ground * 1000} / 悬空 ${LIM.float * 1000} / 互穿 ${LIM.shoeX * 1000} mm、握柄夹角 ${(LIM.grip * 57.3).toFixed(0)}°、甘蓝陷入 ${LIM.cab * 100} cm）  ${Date.now() - t0} ms`)
if (pass < total) process.exitCode = 1
