/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接读骨骼 / 网格内部 */
// [spokes stage 2] 迎宾女郎（Entity 28）阶段 2 动画数值自检（无头，CPU 求真实蒙皮顶点）。运行：
//   npm run check:spokes-anim [-- clip,…]
// 每个片段从 0 起按 1/60 s 连续推进（循环片段先预跑 1 s），逐帧检查：
//   · 着地脚滑动：脚掌（toe 关节）/ 脚跟两个接触点在「世界」里（含根运动）连续两帧都贴地时的水平位移（每帧 ≤ 3 mm）
//   · 手到目标：IK 残差（腕没够到）+ 捏合点 → g、掌心 → pp 的距离（权重满时，≤ 1.2 cm）
//   · 手臂过渡：肘 / 腕的逐帧速度（≤ 4.5 m/s，过渡里甩臂 / 肘极翻转会冒尖）；腕高过头顶（除 greetSpin 举手段）
//   · 裙摆不穿腿：裙下段顶点（hem/skirt 骨主导）对 大腿 / 膝 胶囊（由骨骼求）的陷入深度，扣掉静止时本来就有的深度（≤ 1.2 cm）
//   · 鞋（E28 鞋修）：鞋底穿地（鞋顶点最低 y ≥ −2 mm）；着地脚（姿态里脚掌目标贴地）鞋不悬空（最低 y ≤ 3 mm）；
//     脚穿鞋：脚部皮肤顶点换回鞋的静止坐标（foot / toe 骨逆蒙皮 + 腿部 warp 逆变换）求鞋 SDF——露在外面的皮肤陷进鞋里、
//     藏在鞋口袋里的皮肤从鞋帮穿出，各 ≤ 3 mm；两只鞋互穿（一只鞋顶点陷进另一只鞋 ≤ 2 mm）。全部片段逐帧
// 末尾打印每段结果与「通过 N / M」；有失败时退出码 1。
import { createCanvas } from '@napi-rs/canvas'
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), devicePixelRatio: 1 },
})
const THREE = await import('three')
const { buildSpokes } = await import('../src/game/renderer/spokesMesh')
const A = await import('../src/game/renderer/spokesAnim')
const { BONES, B, K: RIG_K, warpBH } = await import('../src/game/renderer/spokesRig')
const SB = await import('../src/game/renderer/spokesBody')

const t0 = Date.now()
const man = buildSpokes({ lod: 0 }); man.updateMatrixWorld(true)
const rig = man.userData.spokes as any
const face = rig.root.parent as THREE.Object3D
const sk = rig.body as THREE.SkinnedMesh
const skel = sk.skeleton
console.log('build', Date.now() - t0, 'ms')

const LIM = { slide: 0.003, hand: 0.012, speed: 4.5, skirt: 0.012, skirtAbs: 0.002, ground: 0.002, float: 0.003, footIn: 0.003, shoeX: 0.002 }
const JP = (n: string) => BONES[B[n]].pos as number[]
const TOE_H = JP('toeL')[1]
const HEEL_OFF = (s: number) => { const a = JP('foot' + (s > 0 ? 'L' : 'R')); return new THREE.Vector3(0, -a[1], -0.05) }
const v = new THREE.Vector3()
const loc = (o: THREE.Object3D, off?: THREE.Vector3) => { const p = off ? off.clone().applyMatrix4(o.matrixWorld) : o.getWorldPosition(new THREE.Vector3()); return face.worldToLocal(p) }

// 裙下段顶点
const idxOf = (n: string) => skel.bones.indexOf(rig.bones[n])
const skirtBones = new Set(['hemL', 'hemR', 'skirtL', 'skirtR'].map(idxOf))
const pos = sk.geometry.attributes.position, si = sk.geometry.attributes.skinIndex, sw = sk.geometry.attributes.skinWeight
const skirtIdx: number[] = []
for (let i = 0; i < pos.count; i++) {
  let best = -1, bw = -1
  for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k) } }
  if (skirtBones.has(best) && pos.getY(i) < 0.75) skirtIdx.push(i)
}
const skirtIdxPre = () => skirtIdx
const SKT = await import('../src/game/renderer/spokesSkirt')
const aSkirt = sk.geometry.attributes.aSkirt
if (!aSkirt) throw new Error('身体网格缺 aSkirt（裙摆推出未安装）')
const caps = SKT.newSkirtCaps()
/** 蒙皮 + 裙摆推出（与 GPU 着色器 GLSL_SKIRT_PUSH 同一算法） */
const skinned = (i: number) => { v.fromBufferAttribute(pos, i); sk.applyBoneTransform(i, v); SKT.skirtPushLocal(v, SKT.updateSkirtCaps(sk, rig.bones, caps), aSkirt.getX(i)); v.applyMatrix4(sk.matrixWorld); return face.worldToLocal(v.clone()) }
{ const bad = skirtIdxPre().filter((i) => aSkirt.getX(i) < 0.999); if (bad.length) throw new Error('裙下段顶点 aSkirt < 1：' + bad.length) }
/** 锥形胶囊（a 端半径 ra → b 端 rb）的陷入深度（> 0 = 在里面） */
const coneD = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number) => { const ab = b.clone().sub(a), t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / ab.lengthSq())); return ra + (rb - ra) * t - p.distanceTo(a.clone().addScaledVector(ab, t)) }
/** 腿网格只建到行李员空间 y 0.72（× K）：大腿胶囊从该高度起算 */
const LEG_TOP = 0.72 * 0.925, F0 = (JP('thighL')[1] - LEG_TOP) / (JP('thighL')[1] - JP('shinL')[1])
function legDepth(p: THREE.Vector3) {
  let d = -1
  for (const S of ['L', 'R']) {
    const k0 = loc(rig.bones['thigh' + S]), k = loc(rig.bones['shin' + S]), f = loc(rig.bones['foot' + S])
    const k2 = k.clone().lerp(f, 0.3), h = k0.clone().lerp(k, F0)
    // 半径取 spokesBody.legSdf（行李员空间 0.07 → 0.042 膝、膝 0.043、小腿 0.038）× 0.925
    d = Math.max(d, coneD(p, h, k, 0.052, 0.04), coneD(p, k, k2, 0.041, 0.036))
  }
  return d
}
const skirtD0 = skirtIdx.map((i) => Math.max(0, legDepth(skinned(i))))
console.log('skirt verts', skirtIdx.length)

// ---------- 鞋 / 脚 ----------
// 腿 / 鞋部件（warp 'trunk'）在脚部（行李员空间 y < 0.55）是仿射的：X = K·(c + 0.89·(x − c))，c = ±0.09；Y = K·y；Z = K·z
const LEG_C = (s: number) => s * 0.09
const unwarpFoot = (p: THREE.Vector3, s: number) => [LEG_C(s) + (p.x / RIG_K - LEG_C(s)) / 0.89, p.y / RIG_K, p.z / RIG_K] as [number, number, number]
for (const s of [1, -1]) { const q = warpBH([0.1 * s, 0.05, 0.02], 'trunk'), u = unwarpFoot(new THREE.Vector3(...q), s); if (Math.hypot(u[0] - 0.1 * s, u[1] - 0.05, u[2] - 0.02) > 1e-6) throw new Error('脚部 warp 逆变换不成立') }
const st = man.userData.spokesStats as Record<string, number>
const SS = [1, -1], SN = (s: number) => (s > 0 ? 'L' : 'R')
const range = (n: string) => { const a = st[n + '_v0'], b = st[n + '_v1']; if (!(b > a)) throw new Error('缺部件顶点区间 ' + n); return Array.from({ length: b - a }, (_, i) => a + i) }
const solid: Record<number, (x: number, y: number, z: number) => number> = {}, hull: Record<number, (x: number, y: number, z: number) => number> = {}
for (const s of SS) { solid[s] = SB.shoeSolid(s); hull[s] = SB.shoeHull(s) }
const shoeV: Record<number, number[]> = {}, footV: Record<number, number[]> = {}, footD0: Record<number, number[]> = {}
const restP = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, i)
for (const s of SS) {
  shoeV[s] = range('shoe' + SN(s))
  footV[s] = range('leg' + SN(s)).filter((i) => pos.getY(i) < 0.13)
  footD0[s] = footV[s].map((i) => solid[s](...unwarpFoot(restP(i), s)))
}
const bindI = sk.bindMatrixInverse, bindM = sk.bindMatrix
/** 骨 b 的蒙皮矩阵（网格局部）及其逆 */
const boneM = (b: THREE.Bone) => { const bi = skel.bones.indexOf(b); return new THREE.Matrix4().multiplyMatrices(bindI, new THREE.Matrix4().multiplyMatrices(b.matrixWorld, skel.boneInverses[bi])).multiply(bindM) }
const skinnedL = (i: number) => sk.applyBoneTransform(i, new THREE.Vector3().fromBufferAttribute(pos, i))
/** 网格局部的一个点 → 鞋 s 的静止坐标（行李员空间）：foot / toe 骨逆蒙皮，按 footToeF 取主导骨 */
function toShoeRest(p: THREE.Vector3, s: number, inv: { foot: THREE.Matrix4; toe: THREE.Matrix4 }) {
  const qf = p.clone().applyMatrix4(inv.foot), uf = unwarpFoot(qf, s)
  if (SB.footToeF(s, uf[2]) < 0.5) return uf
  return unwarpFoot(p.clone().applyMatrix4(inv.toe), s)
}

const CLIPS = (process.argv[2] ? process.argv[2].split(',') : Object.keys(A.SPOKES_CLIPS)) as any[]
const ARMS_UP_OK: Record<string, [number, number]> = { greetSpin: [0.85, 2.4] }
const out: Record<string, any> = {}
let pass = 0, total = 0
for (const clip of CLIPS) {
  const C = A.SPOKES_CLIPS[clip as keyof typeof A.SPOKES_CLIPS], h = 1 / 60
  A.resetSpokesDynamics(rig)
  const start = C.loop ? -1 : 0
  const prevC: Record<string, THREE.Vector3 | null> = {}
  let prevEl: THREE.Vector3[] | null = null, prevWr: THREE.Vector3[] | null = null
  const r = { slide: 0, slideAt: 0, slideN: 0, hand: 0, handAt: 0, ik: 0, speed: 0, speedAt: 0, overHead: 0, overAt: 0, skirt: 0, skirtAt: 0, skirtV: -1, skirtAbs: 0, ground: 0, groundAt: 0, float: 0, floatAt: 0, footIn: 0, footInAt: 0, footInV: -1, shoeX: 0, shoeXAt: 0 }
  let n = 0
  for (let t = start; t <= C.dur + 1e-6; t += h, n++) {
    const P = A.animateSpokes(rig, clip, t, { time: t, dt: t === start ? undefined : h })
    man.updateMatrixWorld(true)
    if (t < 0) continue
    const rm = A.spokesRootMotion(clip, 0, t)[1]
    const W = (p: THREE.Vector3) => p.add(new THREE.Vector3(0, 0, rm))
    // 着地脚滑动
    for (const s of [1, -1]) {
      const S = s > 0 ? 'L' : 'R'
      const ball = W(loc(rig.bones['toe' + S])), heel = W(loc(rig.bones['foot' + S], HEEL_OFF(s)))
      for (const [nm, p, gy] of [['b' + S, ball, TOE_H + 0.006], ['h' + S, heel, 0.006]] as [string, THREE.Vector3, number][]) {
        const on = p.y < gy, q = prevC[nm]
        if (process.env.S_FEET && t >= Number(process.env.S_FEET) - 0.06 && t <= Number(process.env.S_FEET) + 0.06) console.log('   ', t.toFixed(3), nm, p.toArray().map((x) => x.toFixed(4)).join(','), on ? 'on' : '')
        if (on && q) { const d = Math.hypot(p.x - q.x, p.z - q.z); if (d > r.slide) { r.slide = d; r.slideAt = t } if (d > LIM.slide) r.slideN++ }
        prevC[nm] = on ? p.clone() : null
      }
    }
    // 手到目标
    const ik = A.spokesIkResidual().arm; r.ik = Math.max(r.ik, ik)
    for (const s of [1, -1]) {
      const AP = s > 0 ? P.L : P.R
      let d = 0
      if (AP.pw >= 0.99) d = A.spokesPalmPoint(rig, s, AP.pk).distanceTo(new THREE.Vector3(...AP.pp))
      else if (AP.gw >= 0.99 && !(s < 0 && P.press > 0.01)) d = A.spokesPinchPoint(rig, s).distanceTo(new THREE.Vector3(...AP.g))
      d = Math.max(d, ik)
      if (d > r.hand) { r.hand = d; r.handAt = t }
    }
    // 肘 / 腕速度、腕过头顶
    const el = [loc(rig.bones.foreArmL), loc(rig.bones.foreArmR)], wr = [loc(rig.bones.handL), loc(rig.bones.handR)]
    if (prevEl && prevWr && t > 0) for (let k = 0; k < 2; k++) { const sp = Math.max(el[k].distanceTo(prevEl[k]), wr[k].distanceTo(prevWr[k])) / h; if (sp > r.speed) { r.speed = sp; r.speedAt = t } }
    if (process.env.S_TRACE && n % Number(process.env.S_TRACE) === 0) {
      const sp = prevEl ? [0, 1].map((k) => (Math.max(el[k].distanceTo(prevEl![k]), wr[k].distanceTo(prevWr![k])) / h).toFixed(2)) : []
      console.log('  t', t.toFixed(2), 'ik', (ik * 100).toFixed(1), 'speed', sp.join('/'), 'elL', el[0].toArray().map((x) => x.toFixed(2)).join(','), 'elR', el[1].toArray().map((x) => x.toFixed(2)).join(','), 'wrL', wr[0].toArray().map((x) => x.toFixed(2)).join(','), 'wrR', wr[1].toArray().map((x) => x.toFixed(2)).join(','))
    }
    prevEl = el; prevWr = wr
    const ok = ARMS_UP_OK[clip]
    if (!(ok && t >= ok[0] && t <= ok[1])) for (const w of wr) if (w.y > 1.72) { r.overHead++; r.overAt = t }
    // 鞋：穿地 / 悬空 / 脚穿鞋 / 两鞋互穿（逐帧）
    {
      const inv: Record<number, { foot: THREE.Matrix4; toe: THREE.Matrix4 }> = {}
      for (const s of SS) inv[s] = { foot: boneM(rig.bones['foot' + SN(s)]).invert(), toe: boneM(rig.bones['toe' + SN(s)]).invert() }
      const shoeP: Record<number, THREE.Vector3[]> = {}
      for (const s of SS) {
        let mn = 9
        shoeP[s] = shoeV[s].map((i) => { const p = skinnedL(i); if (p.y < mn) mn = p.y; return p })
        if (-mn > r.ground) { r.ground = -mn; r.groundAt = t }
        const LP = s > 0 ? P.legL : P.legR
        if (LP.p[1] < 0.002 && mn > r.float) { r.float = mn; r.floatAt = t }
        if (process.env.S_SHOE && n % Number(process.env.S_SHOE) === 0) console.log('  shoe', t.toFixed(3), SN(s), 'p', LP.p.map((x) => x.toFixed(3)).join(','), 'ph', LP.ph.toFixed(2), 'tf', LP.tf.toFixed(2), 'minY', (mn * 1000).toFixed(1), 'legIK', (A.spokesIkResidual().leg * 1000).toFixed(1))
        footV[s].forEach((i, k) => {
          const q = toShoeRest(skinnedL(i), s, inv[s])
          const d0 = footD0[s][k]
          let pen = 0
          if (d0 > 0.0006) pen = -solid[s](...q) // 露在外面的皮肤陷进鞋里
          else pen = hull[s](...q) // 鞋口袋里的皮肤从鞋帮穿出
          if (pen > r.footIn) { r.footIn = pen; r.footInAt = t; r.footInV = i }
        })
      }
      // 两鞋互穿：两只脚掌骨相距 > 30 cm 时跳过
      const fa = rig.bones.toeL.getWorldPosition(new THREE.Vector3()), fb = rig.bones.toeR.getWorldPosition(new THREE.Vector3())
      if (fa.distanceTo(fb) < 0.3) for (const s of SS) for (let j = 0; j < shoeP[s].length; j += 2) {
        const d = -solid[-s](...toShoeRest(shoeP[s][j], -s, inv[-s]))
        if (d > r.shoeX) { r.shoeX = d; r.shoeXAt = t }
        if (process.env.S_SHOEX && d > 0.002 && j % 40 === 0) console.log('  shoeX', t.toFixed(3), SN(s), (d * 1000).toFixed(1))
      }
    }
    // 裙摆不穿腿（每 0.1 s）
    if (n % 6 === 0) for (let j = 0; j < skirtIdx.length; j++) { const dd = legDepth(skinned(skirtIdx[j])); if (dd > r.skirtAbs) r.skirtAbs = dd; const d = dd - skirtD0[j]; if (d > r.skirt) { r.skirt = d; r.skirtAt = t; r.skirtV = skirtIdx[j] } }
  }
  const checks = { slide: r.slide <= LIM.slide, hand: r.hand <= LIM.hand, speed: r.speed <= LIM.speed, overHead: r.overHead === 0, skirt: r.skirt <= LIM.skirt && r.skirtAbs < LIM.skirtAbs, shoe: r.ground <= LIM.ground && r.float <= LIM.float && r.footIn <= LIM.footIn && r.shoeX <= LIM.shoeX }
  const f3 = (x: number) => +x.toFixed(4), f2 = (x: number) => +x.toFixed(2)
  out[clip] = {
    滑步: `${(r.slide * 1000).toFixed(1)}mm@${f2(r.slideAt)}s (${r.slideN} 帧超限)`, 手到目标: `${(r.hand * 100).toFixed(2)}cm@${f2(r.handAt)}s`, 臂速: `${r.speed.toFixed(2)}m/s@${f2(r.speedAt)}s`,
    过头顶: r.overHead ? `${r.overHead} 帧@${f2(r.overAt)}s` : 0, 裙穿腿: `${(r.skirt * 100).toFixed(2)}cm@${f2(r.skirtAt)}s`, 裙最大穿透: `${(Math.max(0, r.skirtAbs) * 1000).toFixed(2)}mm`, ik: f3(r.ik),
    鞋穿地: `${(r.ground * 1000).toFixed(1)}mm@${f2(r.groundAt)}s`, 着地悬空: `${(r.float * 1000).toFixed(1)}mm@${f2(r.floatAt)}s`, 脚穿鞋: `${(r.footIn * 1000).toFixed(1)}mm@${f2(r.footInAt)}s`, 两鞋互穿: `${(r.shoeX * 1000).toFixed(1)}mm@${f2(r.shoeXAt)}s`,
  }
  if (process.env.S_DBG && r.footInV >= 0) { const i = r.footInV; console.log('  worst foot vert rest', [pos.getX(i), pos.getY(i), pos.getZ(i)].map((x) => +x.toFixed(3)), 'bones', [0, 1, 2, 3].map((k) => skel.bones[si.getComponent(i, k)].name + ':' + sw.getComponent(i, k).toFixed(2)).join(' ')) }
  if (process.env.S_DBG && r.skirtV >= 0) { const i = r.skirtV; console.log('  worst skirt vert rest', [pos.getX(i), pos.getY(i), pos.getZ(i)].map((x) => +x.toFixed(3)), 'bones', [0, 1, 2, 3].map((k) => skel.bones[si.getComponent(i, k)].name + ':' + sw.getComponent(i, k).toFixed(2)).join(' ')) }
  const np = Object.values(checks).filter(Boolean).length
  pass += np; total += Object.keys(checks).length
  const bad = Object.entries(checks).filter(([, x]) => !x).map(([k]) => k)
  console.log(`${clip.padEnd(12)} ${np}/${Object.keys(checks).length}${bad.length ? ' ✗ ' + bad.join(',') : ' ✓'}  ${JSON.stringify(out[clip])}`)
}
console.log(`通过 ${pass} / ${total}（限值：滑步 ${LIM.slide * 1000} mm/帧、手到目标 ${LIM.hand * 100} cm、臂速 ${LIM.speed} m/s、裙穿腿 ${LIM.skirt * 100} cm 且绝对穿透 < ${LIM.skirtAbs * 1000} mm、鞋：穿地 ${LIM.ground * 1000} / 悬空 ${LIM.float * 1000} / 脚穿鞋 ${LIM.footIn * 1000} / 两鞋互穿 ${LIM.shoeX * 1000} mm）  ${Date.now() - t0} ms`)
if (pass < total) process.exitCode = 1
