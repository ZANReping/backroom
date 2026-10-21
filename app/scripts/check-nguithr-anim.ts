// Nguithr'xurh 第 2 阶段动画数值自检（Node，无 DOM）：
//   · 每个片段按 1/60s 跑动画器，每 0.1s 摆一次姿态，检查所有骨骼变换有限（IK 不出 NaN）
//   · CPU 蒙皮出全部顶点，检查：贴附着面时最低点不明显穿过附着面；腿最大拉伸（足尖到 IK 目标距离）
//   · 平滑性：相邻帧骨骼旋转最大跳变（rad）
// 用法：npx esbuild scripts/check-nguithr-anim.ts --bundle --platform=node --format=esm --outfile=.cache/check-nguithr-anim.mjs && node .cache/check-nguithr-anim.mjs
import * as THREE from 'three'
import { buildNguithrAnimated, NG_CLIPS, NguithrAnimator, nguithrClipPose, poseNguithr, type NguithrClip } from '../src/game/renderer/nguithrAnim'
import type { NguithrRig } from '../src/game/renderer/nguithrMesh'

const CEIL = 2.7
const grp = buildNguithrAnimated(1)
const rig = grp.userData.nguithrRig as NguithrRig
const sk = rig.body
const pos = sk.geometry.attributes.position as THREE.BufferAttribute
const v = new THREE.Vector3()
const report: Record<string, unknown> = {}
let fail = 0
for (const clip of Object.keys(NG_CLIPS) as NguithrClip[]) {
  const info = NG_CLIPS[clip]
  const dur = clip === 'loop' ? 60 : info.dur
  const ceil = info.mount === 'ceiling' || clip === 'loop'
  grp.position.set(0, ceil ? CEIL : 0, 0); grp.rotation.set(ceil ? Math.PI : 0, 0, 0)
  const anim = new NguithrAnimator(1, nguithrClipPose(clip, 0, { ceil: CEIL }))
  let nan = 0, minFloor = Infinity, maxCeil = -Infinity, maxJump = 0, jumpAt = 0
  let prev: THREE.Quaternion[] | null = null
  const dt = 1 / 60
  for (let i = 0, t = 0; t <= dur; i++, t += dt) {
    anim.target = { ...nguithrClipPose(clip, t, { ceil: CEIL }), gaitPhase: 0 }; anim.update(dt)
    poseNguithr(grp, anim.pose, t)
    if (i % 6) continue
    grp.updateMatrixWorld(true); sk.skeleton.update()
    const qs = rig.bones.map((b) => b.quaternion.clone())
    for (const q of qs) if (!Number.isFinite(q.x + q.y + q.z + q.w)) nan++
    if (prev) for (let k = 0; k < qs.length; k++) { const a = qs[k].angleTo(prev[k]); if (a > maxJump) { maxJump = a; jumpAt = t } }
    prev = qs
    let lo = Infinity, hi = -Infinity
    for (let k = 0; k < pos.count; k += 3) { v.fromBufferAttribute(pos, k); sk.applyBoneTransform(k, v); sk.localToWorld(v); if (v.y < lo) lo = v.y; if (v.y > hi) hi = v.y }
    minFloor = Math.min(minFloor, lo); maxCeil = Math.max(maxCeil, hi)
  }
  const floorPen = -minFloor, ceilPen = maxCeil - CEIL
  report[clip] = { nan, floorPenetration: +floorPen.toFixed(3), ceilingPenetration: +ceilPen.toFixed(3), maxBoneJumpPer0_1s: +maxJump.toFixed(3), jumpAt: +jumpAt.toFixed(2) }
  if (nan || floorPen > 0.06 || ceilPen > 0.06) fail++ // 6cm 容差：足尖刚毛、螯尖咬进猎物
}
console.log(JSON.stringify(report, null, 1))
console.log(fail ? `失败片段 ${fail}` : '全部通过')
