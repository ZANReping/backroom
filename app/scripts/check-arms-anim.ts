// 「手臂」第 2 阶段动画数值自检（Node，无 DOM；CPU 蒙皮含 morph 变细）：
//   · 预算：风口 + 3 臂三角面 ≤ 7000、绘制 ≤ 5
//   · 每个片段用动画器按 1/60s 回放，每 0.1s 摆一次姿态，CPU 蒙皮出全部顶点，检查：
//       NaN；格栅关着（<0.85）时有顶点伸出管口；顶点穿进格栅板；顶点穿过可见管壁（管口与天花板之间）；顶点穿地；相邻采样骨骼旋转最大跳变
//   · IK：reach=1、无噪声时 抓握点 / 中爪尖 与目标的误差（多个目标）；远目标时 管口→爪尖 沿体长 ≤ 5m
//   · 伸长变细：k=2.5 时前臂截面半径比 ≈ 1/√2.5
// 用法：npm run check:arms-anim
import * as THREE from 'three'
import { armsBudget, armsRig, armsVent, buildArmsMesh, buildArmsVent, ARMS_VENT_DROP } from '../src/game/renderer/armsMesh'
import { ARMS_CLIPS, ARMS_MAX_REACH, ArmsAnimator, armsClawTip, armsClipPose, armsGripPoint, armsPose, armsState, armsCapsules, armsLightExposure, armsWorldToLocal, poseArms, type ArmsClip, type ArmsClipName } from '../src/game/renderer/armsAnim'

const CEIL = 3.0
const scene = new THREE.Scene()
const vent = buildArmsVent(); vent.position.set(0, CEIL, 0); scene.add(vent)
const arms = buildArmsMesh(3, 3); armsVent(vent)!.anchor.add(arms)
const rig = armsRig(arms)!
const sk = rig.mesh
scene.updateMatrixWorld(true)
const report: Record<string, unknown> = {}
let fail = 0
const bad = (msg: string) => { fail++; console.log('✗', msg) }

// ---- 预算 ----
const bud = armsBudget(vent)
report.budget = bud
if (bud.tris > 7000) bad(`三角面 ${bud.tris} > 7000`)
if (bud.draws > 5) bad(`绘制 ${bud.draws} > 5`)
console.log('预算', JSON.stringify(bud))

const mouthY = CEIL - ARMS_VENT_DROP
const target = new THREE.Vector3(0, 1.23, 2.1) // 玩家胸口（世界）
const tLocal = armsWorldToLocal(rig, target)
const opts = { target: tLocal }
const pos = sk.geometry.attributes.position as THREE.BufferAttribute
const v = new THREE.Vector3(), hl = new THREE.Vector3()
const hinge = armsVent(vent)!.hinge
const inv = new THREE.Matrix4()

function sample(t: number, grate: number) {
  scene.updateMatrixWorld(true); sk.skeleton.update()
  inv.copy(hinge.matrixWorld).invert()
  let nan = 0, outClosed = 0, grateHit = 0, wallHit = 0, floor = 0, minY = Infinity
  for (let i = 0; i < pos.count; i++) {
    sk.getVertexPosition(i, v); v.applyMatrix4(sk.matrixWorld)
    if (!Number.isFinite(v.x + v.y + v.z)) { nan++; continue }
    const ly = v.y - mouthY
    if (v.y < minY) minY = v.y
    if (v.y < -0.005) floor++
    if (grate < 0.85 && ly < -0.03) outClosed++
    hl.copy(v).applyMatrix4(inv)
    if (Math.abs(hl.x) < 0.27 && hl.z > 0.01 && hl.z < 0.54 && hl.y > -0.02 && hl.y < 0.026) { grateHit++; if (process.env.ARMS_DBG && grateHit < 4) console.log('  grate', t.toFixed(2), i, v.x.toFixed(3), ly.toFixed(3), v.z.toFixed(3), (sk.geometry.attributes.armId as THREE.BufferAttribute).getX(i), (sk.geometry.attributes.uv as THREE.BufferAttribute).getY(i).toFixed(3)) }
    if (ly > 0.01 && ly < ARMS_VENT_DROP - 0.01) {
      const ax = Math.abs(v.x), az = Math.abs(v.z)
      if ((ax > 0.276 && ax < 0.31 && az < 0.31) || (az > 0.276 && az < 0.31 && ax < 0.31)) { wallHit++; if (process.env.ARMS_DBG && wallHit < 4) console.log('  wall', t.toFixed(2), i, v.x.toFixed(3), ly.toFixed(3), v.z.toFixed(3), (sk.geometry.attributes.armId as THREE.BufferAttribute).getX(i), (sk.geometry.attributes.uv as THREE.BufferAttribute).getY(i).toFixed(3)) }
    }
  }
  void t
  return { nan, outClosed, grateHit, wallHit, floor, minY }
}

const clips = Object.keys(ARMS_CLIPS) as ArmsClip[]
for (const clip of [...clips, 'loop' as ArmsClipName]) {
  const dur = clip === 'loop' ? 62 : ARMS_CLIPS[clip as ArmsClip].dur
  const an = new ArmsAnimator(3, armsClipPose(clip, 0, opts))
  const dt = 1 / 60
  const agg = { nan: 0, outClosed: 0, grateHit: 0, wallHit: 0, floor: 0, minY: Infinity, maxJump: 0, jumpAt: 0, jumpBone: '', maxK: 1, grateHitAt: -1, wallHitAt: -1, outClosedAt: -1 }
  let prev: THREE.Quaternion[] | null = null, prevVis: boolean[] = []
  const step = clip === 'loop' ? 12 : 6
  for (let i = 0; i * dt <= dur + 1e-6; i++) {
    const t = i * dt
    if (i > 0) { an.target = armsClipPose(clip, t, opts); an.update(dt) }
    poseArms(rig, an.pose, t)
    // 平滑性：逐帧（1/60s）比较骨骼局部旋转，最大单帧跳变（不含爪）
    const qs = sk.skeleton.bones.map((b) => b.quaternion.clone())
    // 只统计露出管口（或在管口上方 0.6m 可见管段内）的骨骼；藏在天花板里的水平风管段里的骨骼怎么转都看不见
    const vis = qs.map((_, k) => { if (k === 0) return false; const a = Math.floor((k - 1) / 26), l = (k - 1) % 26; return l <= 16 && armsState(rig, a)!.jointX[l] > -0.6 })
    if (prev) for (let k = 0; k < qs.length; k++) { if (!vis[k] && !prevVis[k]) continue; const ang = qs[k].angleTo(prev[k]); if (ang > agg.maxJump && !sk.skeleton.bones[k].name.includes('claw')) { agg.maxJump = ang; agg.jumpAt = t; agg.jumpBone = sk.skeleton.bones[k].name } }
    prev = qs; prevVis = vis
    if (i % step) continue
    const r = sample(t, an.pose.grate)
    agg.nan += r.nan; agg.floor += r.floor; agg.minY = Math.min(agg.minY, r.minY)
    if (r.outClosed && agg.outClosedAt < 0) agg.outClosedAt = +t.toFixed(2)
    if (r.grateHit && agg.grateHitAt < 0) agg.grateHitAt = +t.toFixed(2)
    if (r.wallHit && agg.wallHitAt < 0) agg.wallHitAt = +t.toFixed(2)
    agg.outClosed += r.outClosed; agg.grateHit += r.grateHit; agg.wallHit += r.wallHit
    for (let a = 0; a < 3; a++) agg.maxK = Math.max(agg.maxK, armsState(rig, a)!.k)
  }
  const out = { ...agg, minY: +agg.minY.toFixed(3), maxJump: +agg.maxJump.toFixed(3), jumpAt: +agg.jumpAt.toFixed(2), maxK: +agg.maxK.toFixed(2) }
  report[clip] = out
  console.log(clip.padEnd(12), JSON.stringify(out))
  if (agg.nan) bad(`${clip}: NaN 顶点 ${agg.nan}`)
  if (agg.outClosed) bad(`${clip}: 格栅未开时有顶点伸出管口（${agg.outClosed}，首次 t=${agg.outClosedAt}）`)
  if (agg.grateHit > 0) bad(`${clip}: 顶点穿进格栅板（${agg.grateHit}，首次 t=${agg.grateHitAt}）`)
  if (agg.wallHit > 0) bad(`${clip}: 顶点穿过可见管壁（${agg.wallHit}，首次 t=${agg.wallHitAt}）`)
  if (agg.floor > 0) bad(`${clip}: 顶点穿地（${agg.floor}）`)
  if (agg.maxJump > 0.5) bad(`${clip}: 骨骼单帧旋转跳变 ${agg.maxJump.toFixed(2)} rad（${agg.jumpBone} @ ${agg.jumpAt.toFixed(2)}s）`)
}

// ---- IK 精度 ----
const ik: Record<string, number>[] = []
const targets = [new THREE.Vector3(0, -1.3, 2.1), new THREE.Vector3(1.2, -2.0, 0.8), new THREE.Vector3(-0.8, -0.9, 1.6), new THREE.Vector3(0.3, -2.3, 3.2), new THREE.Vector3(0, -1.0, 0.5)]
for (const T of targets) for (const tipAim of [0, 1]) for (const curl of [-1, 1]) {
  const P = armsPose(3, { grate: 1, arms: [{ out: 1, reach: 1, tx: T.x, ty: T.y, tz: T.z, tipAim, curl, wave: 0.35 }] })
  poseArms(rig, P, 1.234); scene.updateMatrixWorld(true)
  const eff = tipAim ? armsClawTip(rig, 0, 1) : armsGripPoint(rig, 0)
  const err = armsWorldToLocal(rig, eff).distanceTo(T)
  ik.push({ x: T.x, y: T.y, z: T.z, tipAim, curl, err: +err.toFixed(4), k: +armsState(rig, 0)!.k.toFixed(2) })
  if (err > 0.01) bad(`IK 误差 ${err.toFixed(4)}m（目标 ${T.toArray().map((x) => x.toFixed(2))}, tipAim=${tipAim}, curl=${curl}）`)
}
report.ik = ik
console.log('IK 最大误差', Math.max(...ik.map((r) => r.err)).toFixed(4), 'm')
// 远目标：5m 上限
{
  const P = armsPose(3, { grate: 1, arms: [{ out: 1, reach: 1, tx: 0, ty: -2.0, tz: 7.5, tipAim: 1, curl: 0 }] })
  poseArms(rig, P, 0); scene.updateMatrixWorld(true)
  const st = armsState(rig, 0)!, tip = armsWorldToLocal(rig, armsClawTip(rig, 0, 1))
  report.maxReach = { tipArc: +st.tipArc.toFixed(3), straight: +tip.length().toFixed(3), k: +st.k.toFixed(2) }
  console.log('远目标 5m 上限', JSON.stringify(report.maxReach))
  if (st.tipArc > ARMS_MAX_REACH + 0.02) bad(`沿体长度 ${st.tipArc} > 5m`)
  if (tip.length() > ARMS_MAX_REACH + 0.02) bad(`爪尖直线距离 ${tip.length()} > 5m`)
}
// ---- 伸长变细 ----
{
  const ring = (k: number) => {
    poseArms(rig, armsPose(3, { grate: 1 }), 0) // 先归位
    rig.arms.forEach((A) => { A.chain.forEach((b) => b.quaternion.identity()); A.hand.quaternion.identity() })
    rig.arms[0].chain[0].position.copy(rig.arms[0].rest.joints[0]) // 回到静止
    for (let a = 0; a < 3; a++) rig.setStretch(a, a === 0 ? k : 1)
    scene.updateMatrixWorld(true); sk.skeleton.update()
    // 第 0 臂、弧长 70% 处的环：取 armId=0 且 uv.y≈0.7·0.84 的顶点，求到环心的平均距离
    const uv = sk.geometry.attributes.uv as THREE.BufferAttribute, id = sk.geometry.attributes.armId as THREE.BufferAttribute
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < pos.count; i++) if (id.getX(i) === 0 && Math.abs(uv.getY(i) - 0.588) < 0.006 && uv.getX(i) < 0.999) pts.push(sk.getVertexPosition(i, new THREE.Vector3()))
    const c = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length)
    return pts.reduce((s, p) => s + p.distanceTo(c), 0) / pts.length
  }
  const r1 = ring(1), r25 = ring(2.5)
  report.thin = { r1: +r1.toFixed(4), r25: +r25.toFixed(4), ratio: +(r25 / r1).toFixed(3), expect: +(1 / Math.sqrt(2.5)).toFixed(3) }
  console.log('伸长变细', JSON.stringify(report.thin))
  if (Math.abs(r25 / r1 - 1 / Math.sqrt(2.5)) > 0.06) bad('伸长变细比例不对')
}
// ---- 光照胶囊 ----
{
  const P = armsClipPose('search', 1, opts); poseArms(rig, P, 1); scene.updateMatrixWorld(true)
  const caps = armsCapsules(rig)
  const eye = new THREE.Vector3(0, 1.6, 2.3), dir = new THREE.Vector3(0, mouthY - 0.9, 0).sub(eye).normalize()
  const ex = armsLightExposure(rig, eye, dir, 0.35, 12, caps)
  const exAway = armsLightExposure(rig, eye, dir.clone().negate(), 0.35, 12, caps)
  report.light = { capsules: caps.length, toward: ex.map((x) => +x.toFixed(2)), away: exAway.map((x) => +x.toFixed(2)) }
  console.log('光照胶囊', JSON.stringify(report.light))
  if (caps.length < 30) bad('胶囊数量过少')
  if (Math.max(...ex) < 0.2 || Math.max(...exAway) > 0.01) bad('光锥照射量不合理')
}
import('node:fs').then((fs) => { fs.mkdirSync('reports/arms', { recursive: true }); fs.writeFileSync('reports/arms/check-anim.json', JSON.stringify(report, null, 2) + '\n') })
console.log(fail ? `\n✗ ${fail} 项未通过` : '\n✓ 全部通过')
if (fail) process.exitCode = 1
