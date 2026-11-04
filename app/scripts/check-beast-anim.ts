/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接读骨骼 / 网格内部 */
// [beast stage 2] 第五层的野兽 阶段 2 动画数值自检（无头，CPU 蒙皮真实顶点）。运行：
//   npx esbuild scripts/check-beast-anim.ts --bundle --platform=node --format=esm --external:@napi-rs/canvas --outfile=.cache/check-beast-anim.mjs && node .cache/check-beast-anim.mjs [clip,…]
// 每个片段从 0 起按 1/60 s 连续推进（循环片段先预跑 1 s），每 0.2 s 采样一次，检查：
//   · IK 残差（手腕 / 踝没够到的距离）
//   · 肘：肘尖相对「肩→腕」连线的偏移方向——朝内（指向身体中线）分量、朝上分量（> 0.5 视为外翻 / 别扭）；腕相对前臂的扭转角
//   · 手臂穿身体：手臂 / 手顶点映射回胸骨（或髋骨）静止空间，对西装躯干芯 jacketCore 求深度（扣掉绑定时本来就有的接缝深度）
//   · 触须穿衬衫 / 领带 / 领口：触须顶点映射回胸骨静止空间，对 身体 SDF + 领口环 求深度（同样扣掉绑定深度）
//   · 坐姿片段：全身顶点对椅子 / 书桌占位盒（与 proto-beast 相同尺寸）求最大陷入深度；臀部压椅面单列
import { createCanvas } from '@napi-rs/canvas'
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), devicePixelRatio: 1 },
})
const THREE = await import('three')
const { buildBeast } = await import('../src/game/renderer/beastMesh')
const A = await import('../src/game/renderer/beastAnim')
const { bodySdf, jacketCore, NECK_HOLE } = await import('../src/game/renderer/beastBody')
const { bhSdfW, warpBH } = await import('../src/game/renderer/beastRig')

const t0 = Date.now()
const man = buildBeast({ lod: Number(process.env.B_LOD ?? 0) }); man.rotation.set(0, 0, 0); man.updateMatrixWorld(true)
const rig = man.userData.beast as any
console.log('build', Date.now() - t0, 'ms')
const BODY_W = bhSdfW(bodySdf), CORE_W = bhSdfW(jacketCore)
const len2 = (a: number, b: number) => Math.hypot(a, b)
const NECK_C = (() => { const w = warpBH(NECK_HOLE.c as any); return [w[0], 1.535, w[2]] })()
const collarRing = (X: number, Y: number, Z: number) => len2(len2(X - NECK_C[0], Z - NECK_C[2]) - 0.07, (Y - NECK_C[1]) * 0.7) - 0.016
const clearBody = (p: THREE.Vector3) => Math.min(BODY_W(p.x, p.y, p.z), collarRing(p.x, p.y, p.z))
const core = (p: THREE.Vector3) => CORE_W(p.x, p.y, p.z)

// 骨骼索引 → 顶点分类
const skel = (rig.body as THREE.SkinnedMesh).skeleton
const idxOf = (b: THREE.Bone) => skel.bones.indexOf(b)
const armBones = new Set<number>()
for (const S of ['L', 'R']) for (const n of ['upperArm', 'foreArm', 'hand', 'thumb1', 'thumb2', 'thumb3', 'index1', 'index2', 'index3', 'middle1', 'middle2', 'middle3', 'ring1', 'ring2', 'ring3', 'pinky1', 'pinky2', 'pinky3']) { const b = rig.bones[n + S]; if (b) armBones.add(idxOf(b)) }
const chestI = idxOf(rig.chest), hipsI = idxOf(rig.hips)
function domBone(m: THREE.SkinnedMesh, i: number) {
  const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight
  let best = -1, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k) } }
  return best
}
const STRIDE = Number(process.env.B_STRIDE ?? 2)
const bodyPos = rig.body.geometry.attributes.position, tentPos = rig.tentMesh.geometry.attributes.position
const armIdx: number[] = []; for (let i = 0; i < bodyPos.count; i += 1) if (armBones.has(domBone(rig.body, i))) armIdx.push(i)
const tentIdx: number[] = []; for (let i = 0; i < tentPos.count; i += STRIDE) tentIdx.push(i)
const allIdx: number[] = []; for (let i = 0; i < bodyPos.count; i += STRIDE) allIdx.push(i)
// 绑定深度（静止）
const v = new THREE.Vector3()
const armD0 = armIdx.map((i) => core(v.fromBufferAttribute(bodyPos, i)))
const tentD0 = tentIdx.map((i) => clearBody(v.fromBufferAttribute(tentPos, i)))
// 骨的「当前 → 静止（野兽空间）」映射：bindMatrix⁻¹ · boneInverse⁻¹ · boneWorld⁻¹（man 在原点、不旋转）
const bindInv = new THREE.Matrix4().copy((rig.body as THREE.SkinnedMesh).bindMatrix).invert() // 绑定时外层组带 rotation.y = π/2
const toBind = (bi: number) => bindInv.clone().multiply(new THREE.Matrix4().copy(skel.boneInverses[bi]).invert()).multiply(new THREE.Matrix4().copy(skel.bones[bi].matrixWorld).invert())

// 椅子 / 书桌（与 beastProto animMode 相同）
const BOXES: [string, number[], number[]][] = [
  ['椅面', [0, 0.425, -0.06], [0.56, 0.06, 0.46]], ['椅背', [0, 0.83, -0.33], [0.56, 0.75, 0.06]],
  ['桌面', [0, 0.73, 0.56], [1.5, 0.04, 0.78]], ['桌前挡板', [0, 0.56, 0.93], [1.5, 0.3, 0.03]],
  ['桌腿L', [-0.72, 0.355, 0.56], [0.05, 0.71, 0.74]], ['桌腿R', [0.72, 0.355, 0.56], [0.05, 0.71, 0.74]],
]
const boxDepth = (p: THREE.Vector3, c: number[], s: number[]) => Math.min(s[0] / 2 - Math.abs(p.x - c[0]), s[1] / 2 - Math.abs(p.y - c[1]), s[2] / 2 - Math.abs(p.z - c[2]))

const want = (process.argv[2] ?? '').split(',').filter(Boolean)
const clips = (want.length ? want : Object.keys(A.BEAST_CLIPS)) as any[]
const out: Record<string, any> = {}
const h = 1 / 60
for (const clip of clips) {
  const C = A.BEAST_CLIPS[clip as keyof typeof A.BEAST_CLIPS]
  A.resetBeastDynamics(rig, 0)
  const opts: any = clip === 'portraitGaze' || clip === 'peripheralStill' ? { target: [0.9, 1.6, 2.2] } : {}
  const R = { ik: 0, ikAt: '', elbowIn: -9, elbowUp: -9, elbowAt: '', twist: 0, twistAt: '', armPen: 0, armPenAt: '', armPenN: 0, tentPen: 0, tentPenAt: '', tentDeepN: 0, tentPush: 0, box: {} as Record<string, number>, boxWho: {} as Record<string, string>, seatSink: 0, handMinY: 9, handMinWho: '' }
  const tStart = C.loop ? -1 : 0
  let next = 0
  for (let k = 0, t = tStart; t <= C.dur + 1e-6; k++, t = tStart + k * h) {
    A.animateBeast(rig, clip, t, { ...opts, time: t, dt: k === 0 ? undefined : h })
    if (t < next - 1e-6) continue
    next += 0.2
    man.updateMatrixWorld(true)
    const at = t.toFixed(1) + 's'
    { const r = A.beastIkResidual(), m = Math.max(r.arm, r.leg); if (m > R.ik) { R.ik = m; R.ikAt = at + (r.arm >= r.leg ? ' 臂' : ' 腿') } }
    // 肘 / 腕
    const el = A.beastElbows()
    for (const [s, Ar] of [[1, rig.armL], [-1, rig.armR]] as [number, any][]) {
      const S = new THREE.Vector3().setFromMatrixPosition(Ar.shoulder.matrixWorld), E = s > 0 ? el.L : el.R, W = new THREE.Vector3().setFromMatrixPosition(Ar.wrist.matrixWorld)
      const d = W.clone().sub(S).normalize(), o = E.clone().sub(S); o.addScaledVector(d, -o.dot(d))
      if (o.length() > 0.015) {
        o.normalize()
        const inn = -o.x * s, up = o.y
        if (inn > R.elbowIn) { R.elbowIn = inn; R.elbowAt = at + (s > 0 ? ' L' : ' R') }
        if (up > R.elbowUp) R.elbowUp = up
      }
      // 腕扭转：手骨局部旋转绕前臂轴（= 手骨在前臂里的位置方向）的扭转分量
      const ax = Ar.wrist.position.clone().normalize(), q = Ar.wrist.quaternion
      const pr = ax.clone().multiplyScalar(ax.dot(new THREE.Vector3(q.x, q.y, q.z)))
      const tw = new THREE.Quaternion(pr.x, pr.y, pr.z, q.w).normalize(), ang = Math.abs(2 * Math.acos(Math.min(1, Math.abs(tw.w))))
      if (ang > R.twist) { R.twist = ang; R.twistAt = at + (s > 0 ? ' L' : ' R') }
    }
    // 手臂穿身体
    const mC = toBind(chestI), mH = toBind(hipsI)
    let n = 0
    armIdx.forEach((i, j) => {
      rig.body.getVertexPosition(i, v)
      const a = core(v.clone().applyMatrix4(mC)), b = core(v.clone().applyMatrix4(mH)), d = Math.max(a, b)
      const pen = Math.min(armD0[j], 0) - d
      if (d < -0.012 && pen > 0.012) { n++; if (pen > R.armPen) { R.armPen = pen; R.armPenAt = at + ' ' + skel.bones[domBone(rig.body, i)].name } }
    })
    R.armPenN = Math.max(R.armPenN, n)
    // 触须穿衬衫 / 领带 / 领口
    let nd = 0
    tentIdx.forEach((i, j) => {
      rig.tentMesh.getVertexPosition(i, v)
      const d = clearBody(v.applyMatrix4(mC)), pen = Math.min(tentD0[j], 0) - d
      if (d < -0.004 && pen > 0.004) { if (pen > 0.01) nd++; R.tentPush = Math.max(R.tentPush, A.beastTentPush()); if (pen > R.tentPen) { R.tentPen = pen; R.tentPenAt = at + ' @' + [v.x, v.y, v.z].map((x) => x.toFixed(3)).join(',') + ' u?' + i } }
    })
    R.tentDeepN = Math.max(R.tentDeepN, nd)
    // 坐姿：桌椅
    if (C.seated) {
      for (const i of armIdx) {
        rig.body.getVertexPosition(i, v)
        if (Math.abs(v.x) < 0.75 && v.z > 0.17 && v.z < 0.95 && v.y < R.handMinY) { R.handMinY = v.y; R.handMinWho = skel.bones[domBone(rig.body, i)].name + '@' + at }
      }
      for (const i of allIdx) {
        rig.body.getVertexPosition(i, v)
        for (const [nm, c, s] of BOXES) {
          const dp = boxDepth(v, c, s)
          if (dp > 0) { if (nm === '椅面') R.seatSink = Math.max(R.seatSink, dp); else if (dp > (R.box[nm] ?? 0)) { R.box[nm] = dp; R.boxWho[nm] = skel.bones[domBone(rig.body, i)].name + '@' + at } }
        }
      }
    }
  }
  const r3 = (x: number) => Math.round(x * 1000) / 1000
  out[clip] = { ik: r3(R.ik), ikAt: R.ikAt, elbowIn: r3(R.elbowIn), elbowUp: r3(R.elbowUp), elbowAt: R.elbowAt, twistDeg: Math.round(R.twist * 57.3), twistAt: R.twistAt, armPenCm: r3(R.armPen * 100), armPenAt: R.armPenAt, armPenVerts: R.armPenN, tentPenCm: r3(R.tentPen * 100), tentPenAt: R.tentPenAt, tentDeepVerts: R.tentDeepN, ...(C.seated ? { seatSinkCm: r3(R.seatSink * 100), handBelowDeskCm: r3((0.75 - R.handMinY) * 100) + ' ' + R.handMinWho, boxCm: Object.fromEntries(Object.entries(R.box).map(([k, x]) => [k, r3(x * 100) + ' ' + R.boxWho[k]])) } : {}) }
  console.log(clip.padEnd(16), JSON.stringify(out[clip]))
}
const { writeFileSync } = await import('node:fs')
writeFileSync('reports/beast/check-anim.json', JSON.stringify(out, null, 1))
console.log('total', Date.now() - t0, 'ms')
