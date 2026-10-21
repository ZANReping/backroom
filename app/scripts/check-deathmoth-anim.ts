// 死亡飞蛾第 2 阶段动画自检：每个片段在 24 个时刻采样，检查数值有效、骨骼未拉伸、禁卫级行走时支撑足贴地、非循环片段末帧稳定。
import * as THREE from 'three'
import { buildDeathmothMesh } from '../src/game/renderer/deathmothMesh'
import { MOTH_CLIPS, poseMoth, sampleMoth, mixMothPose, applyMothPose, type MothClip } from '../src/game/renderer/deathmothAnim'
import type { MothForm } from '../src/game/entities/types'
let pass = 0, fail = 0
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log('✗', m) } }
for (const form of ['male', 'female', 'guard', 'larva'] as MothForm[]) {
  const g = buildDeathmothMesh(form)
  const rig = g.userData.mothRig
  for (const [clip, info] of Object.entries(MOTH_CLIPS[form])) {
    let finite = true, stretch = 0
    for (let k = 0; k < 24; k++) {
      const p = poseMoth(g, clip as MothClip, (k / 24) * info.len * (info.loop ? 1 : 1.2))
      p.q.forEach((q) => { if (![q.x, q.y, q.z, q.w].every(Number.isFinite) || Math.abs(q.length() - 1) > 1e-3) finite = false })
      p.dp.forEach((d) => { stretch = Math.max(stretch, d.length()) })
    }
    ok(finite, `${form}.${clip} 四元数有效`)
    ok(stretch < (form === 'guard' ? 0.5 : 0.12), `${form}.${clip} 位移合理 (${stretch.toFixed(3)})`)
    if (!info.loop) { const a = sampleMoth(g, clip as MothClip, info.len), b = sampleMoth(g, clip as MothClip, info.len + 5); ok(a.q.every((q, i) => q.angleTo(b.q[i]) < 0.35), `${form}.${clip} 末帧保持`) }
  }
  // 混合
  const names = Object.keys(MOTH_CLIPS[form]); const m = mixMothPose(sampleMoth(g, names[0] as MothClip, 0.3), sampleMoth(g, names[1] as MothClip, 0.3), 0.5)
  applyMothPose(g, m); ok(m.q.every((q) => Number.isFinite(q.w)), `${form} 混合有效`)
  void rig
}
// 禁卫级：行走支撑相足尖贴地（y < 0.05m），立起时前足抬离地面 > 0.2m
{
  const g = buildDeathmothMesh('guard'), rig = g.userData.mothRig, v = new THREE.Vector3()
  let maxStance = 0
  for (let k = 0; k < 20; k++) { poseMoth(g, 'walk', k / 20 * 1.1); g.updateMatrixWorld(true); let low = 9; for (const n of ['legL1_e', 'legR0_e', 'legL2_e', 'legR3_e', 'legR1_e', 'legL0_e', 'legR2_e', 'legL3_e']) { rig.byName[n].getWorldPosition(v); low = Math.min(low, v.y) } maxStance = Math.max(maxStance, low) }
  ok(maxStance < 0.05, `禁卫级行走时始终有足贴地（最低足尖最高 ${maxStance.toFixed(3)}m）`)
  poseMoth(g, 'rear', 1.2); g.updateMatrixWorld(true); rig.byName.legL0_e.getWorldPosition(v)
  ok(v.y > 0.2, `禁卫级立起时前足抬起（${v.y.toFixed(2)}m）`)
  poseMoth(g, 'death', 1.8); g.updateMatrixWorld(true); rig.byName.thorax.getWorldPosition(v)
  ok(v.y < 0.2, `禁卫级死亡后胸部落地（${v.y.toFixed(2)}m）`)
}
console.log(`check:deathmoth-anim ${pass}/${pass + fail}`)
if (fail) process.exit(1)
