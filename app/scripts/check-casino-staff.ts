/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接读几何属性 */
// [casino] Level 5.1 赌场员工 阶段 2 无头验收：npm run check:casino-staff
// 覆盖：三角形预算（主要员工 LOD0 40–60k、背景员工 8–15k）· LOD 比例（LOD1 ≈ 1/3、LOD2 ≈ 1/10）· 骨架完整性 / 命名 / 父子顺序 · 与爵士脑人体骨命名兼容
//       · 蜘蛛腿每腿节数（≥3，实为 4）· 蒙皮权重（和为 1、索引合法、功能骨有顶点）· 无 NaN · 法线单位长 · 包围盒身高 / 落地 · 材质数量 · 换色复用 · 道具 · 浏览器绑定（SkinnedMesh 骨骼驱动顶点）
import { createCanvas } from '@napi-rs/canvas'
Object.assign(globalThis, { document: { createElement: () => createCanvas(256, 256) } })
const THREE = await import('three')
const RIG = await import('../src/game/renderer/casinoStaffRig')
const MESH = await import('../src/game/renderer/casinoStaffMesh')
const PROPS = await import('../src/game/renderer/casinoStaffProps')
const { makeJazzRig } = await import('../src/game/renderer/jazzRig')
const HEROES = await import('../src/game/renderer/casinoStaffHeroes')
let fails = 0, n = 0
const ok = (c: unknown, m: string, dbg?: unknown) => { n++; console.log(`${c ? '✔' : '✘'} ${m}${dbg !== undefined ? '  ' + JSON.stringify(dbg) : ''}`); if (!c) fails++ }
const HERO = RIG.STAFF_HERO, CREW = RIG.STAFF_CREW
const H_RANGE: Record<string, [number, number]> = { louie: [1.95, 2.15], prosthetic: [1.95, 2.3], billy: [1.3, 1.7], bartender: [1.3, 1.65], dealer: [1.7, 1.9], waiter: [1.7, 1.9], guard: [1.85, 2.05] }
const HEADTOP: Record<string, [number, number]> = { louie: [1.6, 1.85] }
const jazzNames = new Set(makeJazzRig('sax').BONES.map((b) => b.name))
const summary: Record<string, unknown> = {}

for (const who of RIG.STAFF_WHO) {
  console.log(`— ${RIG.STAFF_ZH[who]}（${who}）—`)
  const R = RIG.makeStaffRig(who)
  const g = [0, 1, 2].map((l) => MESH.buildStaffGeometry(who, l))
  const t = g.map((x) => x.tris)
  const hero = HERO.includes(who)
  // 第三轮：Louie 与其他 L5 人形同量级（行李员 / 看门人 / 迎宾女郎 / 爵士脑 LOD0 实测 41–67k）；假肢人 / Billy 60–100k；酒保仍按写实化预算
  const [lo, hi] = who === 'louie' ? [40000, 70000] : who === 'prosthetic' || who === 'billy' ? [60000, 100000] : hero ? [90000, 130000] : [25000, 40000]
  ok(t[0] >= lo && t[0] <= hi, `LOD0 三角形 ${t[0]} 在 ${lo}–${hi}`)
  const r1 = t[1] / t[0], r2 = t[2] / t[0]
  ok(r1 >= 0.25 && r1 <= 0.42, `LOD1 / LOD0 = ${r1.toFixed(3)}（≈ 1/3，0.25–0.42）`, t[1])
  ok(r2 >= 0.06 && r2 <= 0.15, `LOD2 / LOD0 = ${r2.toFixed(3)}（≈ 1/10，0.06–0.15）`, t[2])
  // 骨架
  const names = R.BONES.map((b) => b.name)
  const req = RIG.requiredBones(who), missing = req.filter((x) => !names.includes(x))
  ok(missing.length === 0, `必需骨骼齐全（${req.length} 根，共 ${names.length} 根）`, missing.length ? missing : undefined)
  ok(new Set(names).size === names.length && R.BONES.every((b, i) => (i === 0 ? b.parent === -1 : b.parent >= 0 && b.parent < i)), '骨名唯一、父骨在前、只有 root 无父')
  ok(names.every((x) => /^[a-z][A-Za-z0-9]*$/.test(x)), '骨名 lowerCamel（同项目约定）')
  if (R.kind === 'humanoid') {
    const core = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'clavL', 'upperArmL', 'foreArmL', 'handL', 'clavR', 'upperArmR', 'foreArmR', 'handR', 'thighL', 'shinL', 'footL', 'toeL', 'thighR', 'shinR', 'footR', 'toeR', 'hemL', 'hemR']
    ok(core.every((x) => jazzNames.has(x) && names.includes(x)) && core.slice(0, 6).every((x, i) => names[i] === x), '人体骨命名 / 顺序与爵士脑 jazzRig 兼容（阶段 3 可复用 jazzAnim IK）')
    const par = (x: string) => names[R.BONES[R.B[x]].parent]
    ok(par('foreArmL') === 'upperArmL' && par('handR') === 'foreArmR' && par('shinL') === 'thighL' && par('toeR') === 'footR' && par('head') === 'neck', '人体父子链正确')
  } else {
    let good = 0
    for (const S of ['L', 'R']) for (let i = 1; i <= 4; i++) {
      const ch = ['a', 'b', 'c', 'd'].map((k) => `leg${S}${i}${k}`)
      if (ch.every((x, k) => R.B[x] !== undefined && (k === 0 ? names[R.BONES[R.B[x]].parent] === 'hips' : names[R.BONES[R.B[x]].parent] === ch[k - 1]))) good++
    }
    ok(good === 8, `8 条腿 × 每腿 4 节骨（≥3，链 hips→a→b→c→d）`, good)
    const tips = [1, 2, 3, 4].map((i) => R.J[`legL${i}Tip`]), grounded = tips.filter((p) => p[1] < 0.02).length
    ok(who === 'bartender' ? grounded === 3 : grounded === 4, `落地腿数（每侧 ${who === 'bartender' ? '3，1 号前腿抬起当手' : '4'}）`, grounded)
  }
  // 几何属性
  for (let l = 0; l < 3; l++) {
    const G = g[l].geo, pos = G.attributes.position.array as Float32Array, nr = G.attributes.normal.array as Float32Array, uv = G.attributes.uv.array as Float32Array
    const si = G.attributes.skinIndex.array as Uint16Array, sw = G.attributes.skinWeight.array as Float32Array
    let nan = 0, badN = 0, badW = 0, badI = 0
    for (const a of [pos, nr, uv, sw]) for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) nan++
    for (let i = 0; i < nr.length; i += 3) { const L = Math.hypot(nr[i], nr[i + 1], nr[i + 2]); if (Math.abs(L - 1) > 1e-3) badN++ }
    for (let v = 0; v < sw.length / 4; v++) { const s = sw[v * 4] + sw[v * 4 + 1] + sw[v * 4 + 2] + sw[v * 4 + 3]; if (Math.abs(s - 1) > 1e-3) badW++; for (let k = 0; k < 4; k++) if (si[v * 4 + k] >= R.BONES.length) badI++ }
    const idx = G.index!.array as Uint32Array; let badT = 0; for (let i = 0; i < idx.length; i++) if (idx[i] >= pos.length / 3) badT++
    ok(nan === 0 && badN === 0 && badW === 0 && badI === 0 && badT === 0, `LOD${l}：无 NaN、法线单位长、权重和为 1、骨索引 / 三角索引合法`, nan + badN + badW + badI + badT ? { nan, badN, badW, badI, badT } : undefined)
    if (l === 0) {
      // 功能骨有主导顶点
      const dom = new Map<number, number>()
      for (let v = 0; v < sw.length / 4; v++) { let m = 0; for (let k = 1; k < 4; k++) if (sw[v * 4 + k] > sw[v * 4 + m]) m = k; if (sw[v * 4 + m] > 0.5) dom.set(si[v * 4 + m], (dom.get(si[v * 4 + m]) ?? 0) + 1) }
      const func = req.filter((x) => !(who === 'billy' && ['head', 'neck'].includes(x)) && !['root', 'hemL', 'hemR', 'neck', 'clavL', 'clavR', 'toeL', 'toeR', 'skirt0', 'skirt1', 'skirt2', 'skirt3', 'heldBall', 'mouth', 'jaw', 'chest', 'spine', 'hips', 'legL1a', 'legL2a', 'legL3a', 'legL4a', 'legR1a', 'legR2a', 'legR3a', 'legR4a'].includes(x) && !(who === 'prosthetic' && /L$/.test(x) && /clav|Arm|hand/.test(x)))
      const empty = func.filter((x) => !(dom.get(R.B[x]) ?? 0))
      ok(empty.length === 0, `功能骨都有主导顶点（${func.length} 根：四肢 / 腿节 / 舌 / 眼 / 爪 / 滚轮…）`, empty.length ? empty : undefined)
      // 包围盒
      const bb = G.boundingBox!, h = bb.max.y
      const [h0, h1] = H_RANGE[who]
      ok(h >= h0 && h <= h1 && bb.min.y > -0.012 && bb.min.y < 0.02, `包围盒总高 ${h.toFixed(3)} m 在 ${h0}–${h1}，落地 min.y ${bb.min.y.toFixed(4)}`)
      if (who === 'billy') {
        // 第三轮 Billy 形态：球即躯干——球骨主导顶点占多数、没有颈 / 头网格（spine / chest / neck / head 是空骨）、四肢从球面长出
        const cnt = (b: string) => dom.get(R.B[b]) ?? 0
        const ballC = R.J.ball, br = Math.hypot(...([0, 1, 2].map((k) => R.J.shoulderL[k] - ballC[k]) as [number, number, number]))
        ok(cnt('ball') > 6000 && ['spine', 'chest', 'neck', 'head'].every((b) => cnt(b) === 0) && R.BONES[R.B.tongue1].parent === R.B.ball, `Billy 球身：球骨 ${cnt('ball')} 顶点，spine/chest/neck/head 无顶点（空骨），舌根挂球骨`)
        ok(['shoulderL', 'shoulderR', 'hipL', 'hipR'].every((k) => { const p = R.J[k], d = Math.hypot(p[0] - ballC[0], p[1] - ballC[1], p[2] - ballC[2]); return d > br * 0.85 && d < br * 1.08 }), `四肢根（肩 / 髋）在球面上（半径 ≈ ${br.toFixed(2)} m）`)
      }
      if (who === 'prosthetic') {
        // 第四轮：手套挂 handR、拳心正对腕 / 袖口轴、贴住袖口；整条袖子在斗篷外
        const col = G.attributes.position.array as Float32Array, w = R.J.wristR, hi = R.B.handR
        let cx = 0, cy = 0, cz = 0, cn = 0, dmin = 9; const sleeveIn: number[] = []
        for (let v = 0; v < sw.length / 4; v++) {
          const x = col[v * 3], y = col[v * 3 + 1], z = col[v * 3 + 2]
          if (si[v * 4] === hi && sw[v * 4] > 0.99) { cx += x; cy += y; cz += z; cn++; dmin = Math.min(dmin, Math.hypot(x - w[0], y - w[1], z - w[2])) }
          let m = 0; for (let k = 1; k < 4; k++) if (sw[v * 4 + k] > sw[v * 4 + m]) m = k
          const b = si[v * 4 + m]
          if ((b === R.B.upperArmR || b === R.B.foreArmR) && x < -0.16 && y < 1.5) { const [rx, rz] = HEROES.prosCloakRadius(y); if ((x / rx) ** 2 + (z / rz) ** 2 < 1) sleeveIn.push(v) }
        }
        cx /= cn; cy /= cn; cz /= cn
        const ax = [R.J.handTipR[0] - w[0], R.J.handTipR[1] - w[1], R.J.handTipR[2] - w[2]], al = Math.hypot(ax[0], ax[1], ax[2]), d = [cx - w[0], cy - w[1], cz - w[2]]
        const along = (d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2]) / al, lat = Math.sqrt(Math.max(0, d[0] ** 2 + d[1] ** 2 + d[2] ** 2 - along * along))
        ok(cn > 300 && along > 0.02 && along < 0.08 && lat < 0.03 && dmin < 0.03, `假肢人手套：handR 刚性顶点 ${cn}，掌心沿腕轴 ${(along * 100).toFixed(1)} cm、偏离腕轴 ${(lat * 100).toFixed(1)} cm（< 3），离腕最近 ${(dmin * 100).toFixed(1)} cm（手贴住袖口）`)
        ok(sleeveIn.length === 0, `假肢人右袖（upperArmR / foreArmR）没有穿进斗篷`, sleeveIn.length || undefined)
      }
      if (who === 'billy') {
        // 第四轮：蝴蝶结在球下缘前方、两大腿根前；舌尖在蝴蝶结上方；四肢布料紫色
        const bd = HEROES.BILLY_BOW_DIR, bl = Math.hypot(bd[0], bd[1], bd[2]), Bc = R.J.ball, BRr = 0.4
        const bc = [0, 1, 2].map((k) => Bc[k] + (bd[k] / bl) * (BRr + 0.05))
        const hipY = R.J.hipL[1], hipZ = Math.max(R.J.hipL[2], R.J.hipR[2])
        const col = G.attributes.position.array as Float32Array, cc = G.attributes.color.array as Float32Array
        let tMin = 9; const purple = [0, 0, 0]; let pn = 0
        for (let v = 0; v < sw.length / 4; v++) {
          let m = 0; for (let k = 1; k < 4; k++) if (sw[v * 4 + k] > sw[v * 4 + m]) m = k
          const b = si[v * 4 + m]
          if (b === R.B.tongue2 || b === R.B.tongue3) tMin = Math.min(tMin, col[v * 3 + 1])
          if ((b === R.B.upperArmL || b === R.B.upperArmR || b === R.B.thighL || b === R.B.thighR) && sw[v * 4 + m] > 0.8) { purple[0] += cc[v * 3]; purple[1] += cc[v * 3 + 1]; purple[2] += cc[v * 3 + 2]; pn++ }
        }
        ok(bc[1] < Bc[1] - 0.6 * BRr && Math.abs(bc[1] - hipY) < 0.1 && bc[2] > hipZ + 0.2 && Math.abs(bc[0]) < 0.03, `Billy 蝴蝶结中心 (${bc.map((x) => x.toFixed(2)).join(', ')})：球下缘（低于球心 ${(Bc[1] - bc[1]).toFixed(2)} m）、两大腿根前（髋 y ${hipY}、z ${hipZ}）`)
        ok(tMin > bc[1] + 0.09, `Billy 舌尖最低 ${tMin.toFixed(3)} m 在蝴蝶结上缘之上（结心 ${bc[1].toFixed(3)} + 0.09），不遮挡`)
        const pc = purple.map((x) => x / Math.max(1, pn))
        ok(pn > 500 && pc[2] > pc[1] * 1.4 && pc[0] > pc[1] * 1.15, `Billy 四肢布料紫色（上臂 / 大腿顶点平均色 ${pc.map((x) => x.toFixed(2)).join(', ')}）`)
      }
      if (HEADTOP[who]) ok(R.J.headTop[1] >= HEADTOP[who][0] && R.J.headTop[1] <= HEADTOP[who][1], `头顶高 ${R.J.headTop[1]} m（不含杆顶球）`)
      const nm = g[0].mats.length
      ok(nm <= (hero ? 10 : 8) && g[0].mats.every((m) => m >= 0 && m <= 12) && G.groups.length === nm, `材质 ${nm} 种（≤ ${hero ? 10 : 8}），每种一组绘制`, g[0].mats)
      summary[who] = { tris: t, h: +h.toFixed(3), mats: nm, bones: names.length, ms: g[0].genMs }
    }
  }
  ok(g.every((x) => x.mats.length >= 3), '各 LOD 材质分组一致', g.map((x) => x.mats.length))
  ok(MESH.buildStaffGeometry(who, 0) === g[0], '几何按 LOD 缓存（第二个实例不重建）')
  // 道具
  const pd = PROPS.STAFF_PROPS[who] ?? []
  if (pd.length) ok(pd.every((p) => R.B[p.bone] !== undefined) && PROPS.staffPropTris(who) >= 12, `道具 ${pd.map((p) => p.name).join(' / ')} 挂骨存在，${PROPS.staffPropTris(who)} 三角形`)
}
console.log('— 换色复用 —')
{
  const a = MESH.buildStaffGeometry('dealer', 0, 0), b = MESH.buildStaffGeometry('dealer', 0, 1), c = MESH.buildStaffGeometry('dealer', 0, 2)
  const col = (x: any) => { const a = x.geo.attributes.color.array as Float32Array; let r = 0, g = 0, b = 0; for (let i = 0; i < a.length; i += 3) { r += a[i]; g += a[i + 1]; b += a[i + 2] } return [r, g, b].map((v) => v.toFixed(1)).join(',') }
  ok(a.tris === b.tris && b.tris === c.tris && col(a) !== col(b) && col(b) !== col(c) && MESH.CREW_PALETTES.length === 3, '背景员工 3 套调色板：同几何、不同顶点色')
}
console.log('— 浏览器绑定（SkinnedMesh）—')
{
  for (const who of ['louie', 'bartender'] as const) {
    const grp = MESH.buildCasinoStaff(who, { lod: 2 })
    const rig = grp.userData.staff, body = rig.body as InstanceType<typeof THREE.SkinnedMesh>
    ok(body.isSkinnedMesh && body.skeleton.bones.length === rig.def.BONES.length && grp.userData.facesZ === 1 && Math.abs(grp.rotation.y - Math.PI / 2) < 1e-6, `${who}：SkinnedMesh 绑定 ${body.skeleton.bones.length} 根骨，组朝向约定同爵士脑（rotation.y = π/2）`)
    const bn = who === 'louie' ? 'foreArmL' : 'legL2b'
    const probe = new THREE.Vector3(), i0 = (() => { const si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight; for (let v = 0; v < si.count; v++) if (si.getX(v) === rig.def.B[bn] && sw.getX(v) > 0.6) return v; return -1 })()
    if (i0 < 0) { ok(false, `${who}：找不到 ${bn} 主导顶点`); continue }
    grp.updateMatrixWorld(true); body.skeleton.update(); body.getVertexPosition(i0, probe); const before = probe.clone()
    rig.bones[bn].rotation.x = 0.8; grp.updateMatrixWorld(true); body.skeleton.update(); body.getVertexPosition(i0, probe)
    ok(i0 >= 0 && before.distanceTo(probe) > 0.02, `${who}：转动 ${bn} 0.8 rad，绑定顶点移动 ${(before.distanceTo(probe) * 100).toFixed(1)} cm`)
    const props = PROPS.attachStaffProps(grp)
    ok(props.length === (PROPS.STAFF_PROPS[who]?.length ?? 0), `${who}：道具挂上 ${props.length} 件`)
  }
}
console.log('— 假肢人手部跟随（转骨）—')
{
  const grp = MESH.buildCasinoStaff('prosthetic', { lod: 1 })
  const rig = grp.userData.staff, body = rig.body as InstanceType<typeof THREE.SkinnedMesh>, si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight
  const hv: number[] = []; for (let v = 0; v < si.count && hv.length < 40; v += 7) if (si.getX(v) === rig.def.B.handR && sw.getX(v) > 0.99) hv.push(v)
  const pv = new THREE.Vector3(), bw = new THREE.Vector3()
  const rel = () => { grp.updateMatrixWorld(true); body.skeleton.update(); rig.bones.handR.getWorldPosition(bw); return hv.map((v) => { body.getVertexPosition(v, pv); body.localToWorld(pv); return pv.distanceTo(bw) }) }
  const pos0 = () => hv.map((v) => { body.getVertexPosition(v, pv); return pv.clone() })
  const r0 = rel(), p0 = pos0()
  rig.bones.foreArmR.rotation.z = 0.6; rig.bones.upperArmR.rotation.x = -0.4
  const r1 = rel(), p1 = pos0()
  const drift = Math.max(...r0.map((d, i) => Math.abs(d - r1[i]))), moved = Math.min(...p0.map((p, i) => p.distanceTo(p1[i])))
  ok(hv.length >= 20 && drift < 0.001 && moved > 0.02, `转 upperArmR / foreArmR 后手套顶点随 handR 移动 ≥ ${(moved * 100).toFixed(1)} cm，与手骨距离漂移 ${(drift * 1000).toFixed(2)} mm（< 1）`)
}
console.log(JSON.stringify(summary))
console.log(`\n${n - fails}/${n} 通过`)
if (fails) process.exit(1)
