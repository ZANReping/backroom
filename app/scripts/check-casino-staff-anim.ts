/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本 */
// [casino] Level 5.1 赌场员工 阶段 3 动画数值自检（无头）。运行：npm run check:casino-staff-anim [-- who[,who] [clip,…]]
// 每个片段 1/60 s 连续推进（循环片段先预跑 1 s，弹簧链进入稳态），逐帧（由姿态 W + 偏移重算关节 FK）检查：
//   · NaN：四元数 / 偏移 / 道具
//   · IK 残差（够不到目标）≤ 1 cm
//   · 关节限位：肘 / 膝夹角 ≤ 172°、蜘蛛腿膝角 ≤ 175°；头相对胸转角 ≤ 85°；手指 / 舌等弹簧骨偏离父骨 ≤ 70°
//   · 肘极：肘偏离「肩-腕」连线的方向（换到胸 / 父骨坐标）与静止弯曲方向夹角 < 100°（不反关节）；膝同理
//   · 脚滑（walk 类）：着地点连续两帧的水平位移 ≤ 2 mm/帧，着地点不穿地（y ≥ −5 mm）
//   · 手-道具：pose.chk 记录的接触对距离 ≤ tol
//   · 穿模（关节胶囊近似，扣除静止姿态本来的深度 ≤ 2 cm）：手 / 前臂 / 杆臂 对躯干胶囊；Billy 四肢 / 舌尖 对球身；
//     假肢人腿在斗篷下摆以上不穿出斗篷壁；E164 腿 对毛团椭球
import { createCanvas } from '@napi-rs/canvas'
Object.assign(globalThis, { document: { createElement: () => createCanvas(64, 64), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } }, window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), devicePixelRatio: 1 } })
const THREE = await import('three')
const A = await import('../src/game/renderer/casinoStaffAnim')
const { makeStaffRig, STAFF_WHO, PROS_GRIP_OFF, PROS_PALM } = await import('../src/game/renderer/casinoStaffRig')
const { prosCloakRadius } = await import('../src/game/renderer/casinoStaffHeroes')

const argWho = process.argv[2]?.split(',').filter(Boolean), argClip = process.argv[3]?.split(',').filter(Boolean)
const V = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2])
let pass = 0, total = 0
const fails: string[] = []
const ok = (c: boolean, msg: string) => { total++; if (c) pass++; else fails.push(msg); console.log((c ? '✔ ' : '✘ ') + msg) }

function fk(R: any, P: any) {
  const n = R.BONES.length, W: any[] = [], pos: any[] = []
  for (let i = 0; i < n; i++) {
    W[i] = new THREE.Quaternion(P.W[i * 4], P.W[i * 4 + 1], P.W[i * 4 + 2], P.W[i * 4 + 3])
    const d = R.BONES[i], o = P.off[d.name]
    pos[i] = d.parent < 0 ? V(d.pos) : pos[d.parent].clone().add(V(d.pos).sub(V(R.BONES[d.parent].pos)).applyQuaternion(W[d.parent]))
    if (o) pos[i].add(V(o))
  }
  const J = (b: string) => pos[R.B[b]], Q = (b: string) => W[R.B[b]]
  const tail = (b: string) => { const i = R.B[b]; return pos[i].clone().add(V(R.seg[i].b).sub(V(R.seg[i].a)).applyQuaternion(W[i])) }
  return { W, pos, J, Q, tail }
}
const segPt = (p: any, a: any, b: any) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return a.clone().addScaledVector(ab, t) }
type Probe = { name: string; depth: (F: ReturnType<typeof fk>) => number }
function probes(who: string, R: any): Probe[] {
  const out: Probe[] = []
  const has = (b: string) => R.B[b] !== undefined
  if (who === 'billy') {
    const pts = ['foreArmL', 'handL', 'foreArmR', 'handR', 'shinL', 'footL', 'shinR', 'footR', 'index3L', 'index3R', 'tongue3']
    for (const b of pts) out.push({ name: `${b}→球身`, depth: (F) => { const c = F.J('ball'), p = b.startsWith('index') || b === 'tongue3' ? F.tail(b) : F.J(b); return A._BALL.r - p.distanceTo(c) } })
    for (const s of ['L', 'R']) out.push({ name: `upperArm${s}中点→球身`, depth: (F) => A._BALL.r - F.J('upperArm' + s).clone().lerp(F.J('foreArm' + s), 0.6).distanceTo(F.J('ball')) })
  } else if (who === 'prosthetic') {
    for (const s of ['L', 'R']) for (let i = 1; i <= 4; i++) out.push({ name: `leg${s}${i}a→斗篷壁`, depth: (F) => {
      // 斗篷随 hips：把腿 a 段采样点换到 hips 坐标，下摆（y 0.84）以上的点到斗篷轴的径向距离不能超过斗篷半径
      const hq = F.Q('hips').clone().invert(), h0 = F.J('hips'), hr = V(R.BONES[R.B.hips].pos)
      let d = -1
      for (let k = 0.2; k <= 1.0001; k += 0.2) {
        const p = F.J(`leg${s}${i}a`).clone().lerp(F.J(`leg${s}${i}b`), k).sub(h0).applyQuaternion(hq).add(hr)
        if (p.y < 0.88) continue
        const [rx, rz] = prosCloakRadius(p.y), e = Math.hypot(p.x / rx, p.z / rz)
        d = Math.max(d, (e - 1) * Math.min(rx, rz))
      }
      return d
    } })
  } else if (who === 'bartender') {
    const Bc = new THREE.Vector3(0, 1.16, -0.02), BR = [0.32, 0.34, 0.3]
    for (const s of ['L', 'R']) for (let i = 1; i <= 4; i++) for (const j of ['b', 'c']) out.push({ name: `leg${s}${i}${j}→毛团`, depth: (F) => {
      const hq = F.Q('hips').clone().invert(), p = F.J(`leg${s}${i}${j}`).clone().sub(F.J('hips')).applyQuaternion(hq).add(V(R.BONES[R.B.hips].pos)).sub(Bc)
      return (1 - Math.hypot(p.x / BR[0], p.y / BR[1], p.z / BR[2])) * 0.3
    } })
  } else {
    const r = who === 'guard' ? 0.135 : 0.125
    const pts = who === 'louie' ? ['handL@0.5', 'handL@1', 'foreArmL', 'handR@0.3'] : ['handL', 'handR', 'foreArmL', 'foreArmR', 'index3L', 'index3R']
    for (const pn of pts) out.push({ name: `${pn}→躯干`, depth: (F) => {
      const [b, k] = pn.split('@'); let p = has(b) ? F.J(b) : null
      if (!p) return -1
      if (k) p = F.J(b).clone().lerp(F.tail(b), Number(k)); else if (b.startsWith('index')) p = F.tail(b)
      const a = F.J('hips').clone().add(new THREE.Vector3(0, 0.1, 0)), c = F.J('neck')
      return r - p.distanceTo(segPt(p, a, c))
    } })
  }
  return out
}

const whos = (argWho ?? STAFF_WHO).filter((w) => { try { A.staffPose(w as any, 'idle', 0); return true } catch { return false } })
const t0 = Date.now()
for (const who of whos as any[]) {
  const R = makeStaffRig(who), clips = A.staffClips(who).filter((c) => !argClip || argClip.includes(c))
  const PB = probes(who, R), rest = fk(R, A.staffPose(who, 'idle', 0)), restDepth = PB.map((p) => Math.max(0, p.depth(rest)))
  const humanoid = R.kind === 'humanoid'
  for (const clip of clips) {
    const info = A.STAFF_CLIPS[who][clip], dyn = A.newStaffDyn(), dt = 1 / 60
    let ikName = '', nan = 0, ikMax = 0, slideMax = 0, under = 0, limb = 0, pole = 0, headMax = 0, chkMax = 0, chkName = '', pen = 0, penName = '', springMax = 0
    let prevG: Record<string, any> = {}
    const start = info.loop ? -1 : 0
    for (let t = start; t <= info.dur + 1e-9; t += dt) {
      const P = A.staffPose(who, clip, info.loop ? t + 10 : Math.max(0, t), { dyn, dt })
      if ([...P.W].some((x) => !Number.isFinite(x)) || Object.values(P.off).flat().some((x) => !Number.isFinite(x as number)) || Object.values(P.props).some((p: any) => [...p.p, ...p.q].some((x) => !Number.isFinite(x)))) { nan++; continue }
      if (t < 0) { prevG = {}; for (const g of P.ground) prevG[g.name] = g; continue }
      const F = fk(R, P)
      for (const r of P.ik) if (r.res > ikMax) { ikMax = r.res; ikName = r.name + '@' + t.toFixed(2) }
      if (info.walk) for (const g of P.ground) {
        const pg = prevG[g.name]
        if (g.g && pg?.g) slideMax = Math.max(slideMax, Math.hypot(g.p[0] - pg.p[0], g.p[2] - pg.p[2]))
        if (g.g) under = Math.min(under, g.p[1])
      }
      prevG = {}; for (const g of P.ground) prevG[g.name] = g
      // 肘 / 膝 / 蜘蛛膝
      const chains: [string, string, string, string, number][] = []
      if (humanoid) for (const s of ['L', 'R']) { chains.push(['upperArm' + s, 'foreArm' + s, 'hand' + s, 'chest', 172]); chains.push(['thigh' + s, 'shin' + s, 'foot' + s, 'hips', 172]) }
      else { for (const s of ['L', 'R']) for (let i = 1; i <= 4; i++) chains.push([`leg${s}${i}a`, `leg${s}${i}b`, `leg${s}${i}c`, 'hips', 175]); if (who === 'prosthetic') chains.push(['upperArmR', 'foreArmR', 'handR', 'chest', 172]) }
      for (const [u, l, e, par, lim] of chains) {
        const a = F.J(u), b = F.J(l), c = F.J(e), flex = (b.clone().sub(a).angleTo(c.clone().sub(b)) * 180) / Math.PI
        if (flex > lim) limb = Math.max(limb, flex)
        const d = c.clone().sub(a).normalize(), off = b.clone().sub(a).addScaledVector(d, -b.clone().sub(a).dot(d))
        if (off.length() > 0.01) {
          const ra = V(R.BONES[R.B[u]].pos), rb = V(R.BONES[R.B[l]].pos), rc = V(R.BONES[R.B[e]].pos), rd = rc.clone().sub(ra).normalize()
          let roff = rb.clone().sub(ra).addScaledVector(rd, -rb.clone().sub(ra).dot(rd))
          if (roff.length() < 0.02) roff = (u.startsWith('thigh') ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 0, -1)).addScaledVector(rd, -(u.startsWith('thigh') ? rd.z : -rd.z))
          const loc = off.clone().applyQuaternion(F.Q(par).clone().invert()), deg = (loc.angleTo(roff) * 180) / Math.PI
          pole = Math.max(pole, deg)
        }
      }
      if (R.B.head !== undefined && R.B.chest !== undefined) headMax = Math.max(headMax, (F.Q('head').angleTo(F.Q('chest')) * 180) / Math.PI)
      for (const sb of ['tongue1', 'tongue2', 'tongue3', 'hairL', 'hairR', 'hairB', 'tuft0', 'tuft1', 'tuft2', 'tuft3', 'skirt0', 'skirt1', 'skirt2', 'skirt3', 'bow']) if (R.B[sb] !== undefined) { const pa = R.BONES[R.B[sb]].parent; springMax = Math.max(springMax, (F.W[R.B[sb]].angleTo(F.W[pa]) * 180) / Math.PI) }
      for (const c of P.chk) { const d = V(c.a).distanceTo(V(c.b)) - c.tol; if (d > chkMax) { chkMax = d; chkName = c.name } }
      PB.forEach((pb, k) => { const d = pb.depth(F) - restDepth[k]; if (d > pen) { pen = d; penName = pb.name } })
    }
    const tag = `${who}.${clip}（${info.zh}）`
    ok(nan === 0, `${tag} 无 NaN（${nan} 帧）`)
    ok(ikMax <= 0.01, `${tag} IK 残差 ${(ikMax * 100).toFixed(2)} cm ≤ 1${ikMax > 0.01 ? '（' + ikName + '）' : ''}`)
    ok(limb === 0 && headMax <= 85 && springMax <= 70, `${tag} 关节限位：超限肘 / 膝 ${limb.toFixed(1)}°、头-胸 ${headMax.toFixed(1)}° ≤ 85、弹簧骨偏角 ${springMax.toFixed(1)}° ≤ 70`)
    ok(pole < 100, `${tag} 肘 / 膝极向偏离静止弯向 ${pole.toFixed(1)}° < 100（不反关节）`)
    if (info.walk) ok(slideMax <= 0.002 && under >= -0.005, `${tag} 着地点滑动 ${(slideMax * 1000).toFixed(2)} mm/帧 ≤ 2、最低 ${(under * 1000).toFixed(1)} mm ≥ −5`)
    ok(chkMax <= 0, `${tag} 手-道具 超差 ${(chkMax * 100).toFixed(2)} cm${chkName ? '（' + chkName + '）' : ''}`)
    ok(pen <= 0.02, `${tag} 穿模（胶囊近似，较静止增加）${(pen * 100).toFixed(2)} cm ≤ 2${penName ? '（' + penName + '）' : ''}`)
  }
}
// 几何：假肢人拳内空腔（掌垫离烟杆轴 ≥ 杆半径）
{
  const R = makeStaffRig('prosthetic'), Cg = V(R.J.wristR).add(V(PROS_GRIP_OFF)), a = Cg.clone().add(new THREE.Vector3(0.06, 0.004, 0)), b = Cg.clone().add(new THREE.Vector3(-0.3, 0.02, -0.01))
  let dmin = 1
  for (let i = 0; i < 400; i++) { const u = (i % 20) / 20 * Math.PI * 2, v = (Math.floor(i / 20) / 19 - 0.5) * Math.PI, d = new THREE.Vector3(Math.cos(v) * Math.sin(u), Math.sin(v), Math.cos(v) * Math.cos(u)); const p = Cg.clone().add(V(PROS_PALM.off)).add(new THREE.Vector3(d.x * PROS_PALM.r[0], d.y * PROS_PALM.r[1], d.z * PROS_PALM.r[2])); dmin = Math.min(dmin, p.distanceTo(segPt(p, a, b))) }
  ok(dmin >= 0.012, `假肢人掌垫到烟杆轴最近 ${(dmin * 1000).toFixed(1)} mm ≥ 12（杆从拳内穿过、不穿掌）`)
}
console.log(`\n${pass}/${total} 通过（${((Date.now() - t0) / 1000).toFixed(1)} s）`)
if (fails.length) { console.log('失败：\n' + fails.join('\n')); process.exit(1) }
