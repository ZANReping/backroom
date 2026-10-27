// 猎犬阶段 2 动画验收：每个片段跑两个周期（dt=1/60），检查
//  · 支撑脚（姿态 lock=1）在世界里不滑：同一段支撑期内 paw 关节的世界位移 ≤ 1.5 cm（移动片段整只按名义速度前进）
//  · 支撑脚贴地：paw 关节高度与静止时相差 ≤ 2 cm（death 倒地、pin 前爪踩在玩家身上除外）
//  · 所有骨矩阵有限；二阶摆动不发散（|θ| 有上限）
//  · sit / wag 三形态后爪贴地（指趾网格最低点 0–3 cm）
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { buildHoundMesh } from '../src/game/renderer/houndMesh'
import { animateHoundClip, sampleHoundPose, HOUND_CLIPS, type HoundClip } from '../src/game/renderer/houndAnim'

const out: Record<string, { slipCm: number; groundCm: number }> = {}
const v = new THREE.Vector3()
for (const clip of Object.keys(HOUND_CLIPS) as HoundClip[]) {
  const kind = clip === 'sit' || clip === 'wag' ? 'neutral' : 'hostile'
  const g = buildHoundMesh(kind === 'neutral', 3, kind)
  const r = g.userData.houndRig
  const C = HOUND_CLIPS[clip], speed = C.speed ?? 0
  const span = C.loop ? C.dur * 2 : C.dur
  const dt = 1 / 60
  const start: (THREE.Vector3 | null)[] = [null, null, null, null]
  let slip = 0, ground = 0
  for (let t = 0; t <= span + 1e-9; t += dt) {
    g.position.x = speed * t
    g.updateMatrixWorld(true)
    animateHoundClip(g, clip, t, kind, dt)
    g.updateMatrixWorld(true)
    g.traverse((o: any) => { if (o.isBone || o.isMesh) assert(o.matrixWorld.elements.every(Number.isFinite), `${clip}: finite matrices`) })
    const P = sampleHoundPose(r, clip, t)
    r.legs.forEach((L: any, i: number) => {
      L.paw.getWorldPosition(v)
      const planted = P.feet[i].lock > 0.99 && clip !== 'death' && !(clip === 'pin' && L.front)
      if (planted) {
        if (!start[i]) start[i] = v.clone()
        else slip = Math.max(slip, Math.hypot(v.x - start[i]!.x, v.z - start[i]!.z))
        ground = Math.max(ground, Math.abs(v.y - L.pawY))
      } else start[i] = null
    })
  }
  out[clip] = { slipCm: +(slip * 100).toFixed(2), groundCm: +(ground * 100).toFixed(2) }
  assert(slip <= 0.015, `${clip}: 支撑脚滑动 ${(slip * 100).toFixed(1)} cm`)
  assert(ground <= 0.02, `${clip}: 支撑脚离地 ${(ground * 100).toFixed(1)} cm`)
  const D = g.userData.hdDyn
  if (D) for (const x of D.th) assert(Math.abs(x) <= 1.11, `${clip}: 摆动有界`)
}
// 坐姿后爪贴地（三形态）
const sitFeet: Record<string, number[]> = {}
for (const kind of ['hostile', 'neutral', 'ambusher'] as const) for (const clip of ['sit', 'wag'] as const) {
  const g = buildHoundMesh(kind === 'neutral', 3, kind)
  for (let t = 0; t <= 2.4; t += 1 / 30) { g.updateMatrixWorld(true); animateHoundClip(g, clip, t, kind, 1 / 30) }
  g.updateMatrixWorld(true)
  const bottoms = g.userData.houndRig.legs.map((L: any) => { let b = Infinity; L.paw.traverse((m: any) => { if (!m.isMesh) return; const p = m.geometry.getAttribute('position'); for (let n = 0; n < p.count; n++) { v.fromBufferAttribute(p, n).applyMatrix4(m.matrixWorld); b = Math.min(b, v.y) } }); return b })
  sitFeet[`${kind}/${clip}`] = bottoms.map((b: number) => +(b * 100).toFixed(1))
  for (const b of bottoms) assert(b >= -0.01 && b <= 0.03, `${kind} ${clip}: 爪离地 ${(b * 100).toFixed(1)} cm`)
}
console.log(JSON.stringify({ houndAnim: 'passed', clips: out, sitPawBottomCm: sitFeet }, null, 1))
