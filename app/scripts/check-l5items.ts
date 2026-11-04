/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本拨动引擎内部字段 */
// [l5items] L5 第三期物品无头检查：O18 留声机状态机 / 房卡 / O666 结果表 / 物品条目 / 图标 / 存档往返
import { readFileSync } from 'node:fs'
import { O18T, O666T, O666_FACE_NAME, o18Step, newO18Run, o666Roll, cardOpens, restoreObj, freshObj, LOCKER_SLOTS, type O666Face } from '../src/game/engine/l5Objects'
import { ITEMS } from '../src/game/content/items'
import { L5_ITEM_TYPES, buildL5ItemMesh, syncRoomCardLabel, roomCardLabel } from '../src/game/renderer/l5ItemModels'
import { createCanvas } from '@napi-rs/canvas'
import * as THREE from 'three'
import { buildPhonograph, applyPhonographState } from '../src/game/renderer/phonographModel'
import { triCount } from '../src/game/renderer/pbrCanvas'
import { buildCasinoItemMesh } from '../src/game/renderer/casinoItemModels'
import { simulateDieThrow, upFace, qrot, FACE_AXES, RESULT_FACE, spinRate, dieWallPlanes } from '../src/game/engine/fateDieSim'
import { dieVisual, drawDieIcon, DIE_HALF } from '../src/game/renderer/fateDieFx'
import { phonoSyncData } from '../src/game/engine/l5Objects'
let pass = 0, fail = 0
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.log('✗', m) } }
const run = (fn: (r: ReturnType<typeof newO18Run>, i: { holdX: boolean; meleeHit: boolean; bang: boolean; sanity: number; rnd: number }) => void, secs: number, base: Partial<{ holdX: boolean; meleeHit: boolean; bang: boolean; sanity: number }> = {}) => {
  const r = newO18Run('1:0,0'); let san = base.sanity ?? 80, locked = false, ev: string[] = []
  for (let t = 0; t < secs && !r.done; t += 0.1) { const i = { holdX: false, meleeHit: false, bang: false, rnd: 0.5, ...base, sanity: san }; fn(r, i); const o = o18Step(r, 0.1, i); san += o.sanity; locked = locked || o.locked; if (o.event) ev.push(o.event) }
  return { r, san, locked, ev }
}
// ---- O18 ----
{ const a = run(() => {}, 3.9); ok(!a.locked, 'O18：4 s 内门不锁') }
{ const a = run(() => {}, 10); ok(a.locked, 'O18：4 s 后门锁死'); ok(Math.abs(80 - a.san - 0.4 * 10) < 0.2, `O18：理智 −0.4/s（${(80 - a.san).toFixed(2)}）`) }
{ const a = run((r, i) => { i.holdX = r.t >= 5 }, 20); ok(a.r.done === 'lift', 'O18：长按 X 3 s 抬唱针脱身'); ok(a.r.t > 7.9 && a.r.t < 8.3, `O18：抬针用时 3 s（t=${a.r.t.toFixed(1)}）`) }
{ const a = run((r, i) => { i.holdX = r.t >= 5 && !(r.t > 6.5 && r.t < 6.7) }, 20); ok(a.ev.includes('liftReset') && a.r.done === 'lift' && a.r.t > 9.5, 'O18：抬针中断后重来') }
{ const k = run((r, i) => { i.holdX = r.t >= 5 }, 20); const n = run(() => {}, 8); ok(n.san - k.san > 2.5, 'O18：抬针期间理智额外 −1/s') }
{ let h = 0; const a = run((r, i) => { i.meleeHit = r.t > 5 && h++ % 10 === 0 }, 20); ok(a.r.done === 'smash' && a.r.hits === O18T.smashHits, 'O18：近战 4 下砸烂') }
{ let b = 0; const a = run((r, i) => { i.bang = r.t > 5 && b++ === 0 }, 200); ok(a.r.done === 'rescue' && a.r.t >= 65 && a.r.t <= 125, `O18：砸门 60–120 s 后员工开门（t=${a.r.t.toFixed(0)}）`) }
{ let b = 0; const a = run((r, i) => { i.bang = r.t > 5 && b++ === 0 }, 200, { sanity: 45 }); ok(a.r.done === 'clean', 'O18：理智 <20 被当尸体清理（13 楼）') }
{ const r = newO18Run('k'); const o = o18Step(r, 0.1, { holdX: false, meleeHit: false, bang: false, sanity: 50, rnd: 0 }); ok(o.needMul === 2 && o.clockJitter, 'O18：饥渴 ×2 + 时钟乱跳') }
// ---- O666 ----
const faces: Record<string, number> = {}
for (let i = 0; i < 2000; i++) { const f = o666Roll(i / 2000, false); faces[f] = (faces[f] ?? 0) + 1 }
ok(!faces.weapon, 'O666：开放空间投不出武器面')
const allF: O666Face[] = ['rare', 'sanity', 'teleport', 'squid', 'hotel', 'gambler', 'blank', 'edge']
ok(allF.every((f) => faces[f] > 0), `O666：其余各面都可能出现 ${JSON.stringify(faces)}`)
{ let w = 0; for (let i = 0; i < 2000; i++) if (o666Roll(i / 2000, true) === 'weapon') w++; ok(w > 0, 'O666：封闭房间才可能出武器面') }
ok(O666T.cooldown === 600 && O666T.spin === 300 && O666T.freeze === 10 && O666T.price === 150 && O666T.bigWin === 100, 'O666：冷却 10 min / 转 5 min / 定身 10 s / 150 筹码 / 赢 ≥100 送')
// ---- 房卡 ----
ok(!cardOpens(undefined, 1, 101), '房卡：没卡打不开')
ok(!cardOpens({ no: 101, floor: 1 }, 1, 101), '房卡：未绑定前 cardOpens=false（第一次刷卡绑定）')
ok(cardOpens({ no: 101, floor: 1, dx: 3, dy: 4 }, 1, 101), '房卡：开自己的门')
ok(!cardOpens({ no: 101, floor: 1, dx: 3, dy: 4 }, 1, 102) && !cardOpens({ no: 101, floor: 1, dx: 3, dy: 4 }, 2, 101), '房卡：只开自己房门（别的门 / 别的楼层不开）')
// ---- 存档往返 ----
{ const o = freshObj(); o.card = { no: 412, floor: 4, dx: 5, dy: 6 }; o.locker = Array.from({ length: 12 }, () => ({ type: 'almondwater', count: 1 })); o.smashed = ['4:1,2']; o.dieCd = 99; o.bigWinGiven = 1; o.receipt = 1
  const b = restoreObj(JSON.parse(JSON.stringify(o)))
  ok(b.card?.no === 412 && b.card.dx === 5 && b.smashed[0] === '4:1,2' && b.dieCd === 99 && b.bigWinGiven === 1, '存档：往返保留')
  ok(b.locker.length === LOCKER_SLOTS, '存档：储物柜 8 格上限')
  ok(restoreObj(null).locker.length === 0, '存档：空存档 = 新局清空') }
// ---- 物品 / 模型 / 图标 / 接线 ----
for (const t of ['roomcard', 'fatedie', 'brokendie', 'diereceipt', 'brokenrecord']) {
  ok(ITEMS[t]?.unique === 5 && ITEMS[t].desc.length > 20, `物品：${t} 条目`)
  ok((L5_ITEM_TYPES as readonly string[]).includes(t), `模型：${t} 在 l5ItemModels`)
}
const hud = readFileSync('src/components/HUD.tsx', 'utf8')
for (const g of ['roomcard', 'fatedie', 'receipt', 'record']) ok(hud.includes(`case '${g}'`), `图标：${g}`)
const src = (f: string) => readFileSync(f, 'utf8')
ok(src('src/game/world/infiniteL5.ts').includes("o18: 1"), '生成：客房区 O18 留声机')
ok(src('src/game/engine/interact.ts').includes('hotelDoorBlocked(eng)'), '接线：O18 门锁（撬 / 万能钥匙无效）')
ok(src('src/game/engine/casinoAI.ts').includes('fatedie: 150') && src('src/game/engine/casinoAI.ts').includes('o666BigWin'), '接线：赌场送骰 / 稀有池 150')
ok(src('src/game/engine/spokesAI.ts').includes("act: 'card'"), '接线：118 前台登记')
ok(src('src/game/engine/inventory.ts').includes('hotelUseFateDie'), '接线：X 投骰')
// ---- [l5items v2] 模型细化 / 骰子动画 ----
{
  Object.defineProperty(globalThis, 'document', { value: { createElement: () => createCanvas(128, 128), createElementNS: () => { throw new Error('headless') } }, configurable: true })
  const meshesOf = (o: THREE.Object3D) => { const a: THREE.Mesh[] = []; o.traverse((x) => { if ((x as THREE.Mesh).isMesh) a.push(x as THREE.Mesh) }); return a }
  const uvStats = (o: THREE.Object3D) => { // UV 范围 + 拉伸（每三角形 UV 面积 / 3D 面积，相对该网格中位数的 p95 比值）
    let out = 0, worst = 1, worstName = ''; const tmp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
    for (const m of meshesOf(o)) {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry, uv = g.getAttribute('uv'), pos = g.getAttribute('position'); if (!uv) { out++; continue }
      const r: number[] = []
      for (let i = 0; i < uv.count; i++) if (uv.getX(i) < -1e-4 || uv.getX(i) > 1.0001 || uv.getY(i) < -1e-4 || uv.getY(i) > 1.0001) out++
      for (let i = 0; i + 2 < pos.count; i += 3) {
        for (let k = 0; k < 3; k++) tmp[k].fromBufferAttribute(pos, i + k)
        // 各向异性：UV→3D 雅可比的两个奇异值之比（1 = 无拉伸）
        const e1 = tmp[1].clone().sub(tmp[0]), e2 = tmp[2].clone().sub(tmp[0])
        const du1 = uv.getX(i + 1) - uv.getX(i), dv1 = uv.getY(i + 1) - uv.getY(i), du2 = uv.getX(i + 2) - uv.getX(i), dv2 = uv.getY(i + 2) - uv.getY(i), det = du1 * dv2 - du2 * dv1
        if (Math.abs(det) < 1e-12 || e1.clone().cross(e2).length() < 1e-10) continue
        const Ju = e1.clone().multiplyScalar(dv2).sub(e2.clone().multiplyScalar(dv1)).divideScalar(det), Jv = e2.clone().multiplyScalar(du1).sub(e1.clone().multiplyScalar(du2)).divideScalar(det)
        const a = Ju.dot(Ju), b = Ju.dot(Jv), c = Jv.dot(Jv), tr = a + c, dd = Math.sqrt(Math.max(0, (a - c) * (a - c) / 4 + b * b)), s1 = Math.sqrt(tr / 2 + dd), s2 = Math.sqrt(Math.max(1e-30, tr / 2 - dd))
        r.push(s1 / s2)
      }
      if (r.length > 8) { r.sort((a, b) => a - b); const w = r[Math.floor(r.length * .95)]; if (w > worst) { worst = w; worstName = `${m.geometry.type}` } }
    }
    return { out, worst, worstName }
  }
  const budget: Record<string, number> = {}
  for (const v of ['new', 'old'] as const) {
    const ph = buildPhonograph(v), [l0, l1] = ph.userData.levels as THREE.Group[]
    const t0 = triCount(l0), t1 = triCount(l1); budget[`留声机 ${v} LOD0`] = t0; budget[`留声机 ${v} LOD1`] = t1
    ok(t0 > 3000 && t0 <= 12000, `留声机 ${v}：LOD0 ${t0} 面（预算 ≤12,000）`)
    ok(t1 <= 2000 && t1 < t0 / 4, `留声机 ${v}：LOD1 ${t1} 面（预算 ≤2,000）`)
    const mats = new Set<THREE.MeshStandardMaterial>(); meshesOf(l0).forEach((m) => mats.add(m.material as THREE.MeshStandardMaterial))
    ok([...mats].every((m) => m.map && (m.map.image as { width: number }).width >= 256) && [...mats].filter((m) => m.normalMap).length >= 5, `留声机 ${v}：全部材质带颜色贴图（≥256²），≥5 种带法线（${[...mats].filter((m) => m.normalMap).length}）`)
    const u = uvStats(l0); ok(u.out === 0, `留声机 ${v}：UV 全在 0–1（越界 ${u.out}）`); ok(u.worst < 4, `留声机 ${v}：UV 拉伸（UV→3D 奇异值比 p95，1=无拉伸）最差 ${u.worst.toFixed(2)}（${u.worstName}，<4；车削件 p95 3.49，收口处周长趋零）`)
    // 唱臂：arm=1 唱头升起 ≥4 cm；砸烂换碎唱片、喇叭下垂
    const tip = () => { ph.updateMatrixWorld(true); const p = l0.userData.parts as { lift: THREE.Group }; return new THREE.Vector3(0, -.05, -.27).applyMatrix4(p.lift.matrixWorld).y }
    applyPhonographState(ph, { arm: 0 }); const y0 = tip(); applyPhonographState(ph, { arm: 1 }); const y1 = tip()
    ok(y1 - y0 > .04 && y0 < .81, `留声机 ${v}：抬唱针时唱臂升起 ${((y1 - y0) * 100).toFixed(1)} cm，落针时唱针在唱片面（y=${y0.toFixed(3)}）`)
    applyPhonographState(ph, { broke: 1 }); const pp = l0.userData.parts as { rec: THREE.Mesh; shards: THREE.Group; horn: THREE.Group }
    ok(!pp.rec.visible && pp.shards.visible && pp.horn.rotation.x < .5, `留声机 ${v}：砸烂状态（唱片碎、喇叭瘪垂）`)
  }
  // O18 交互 → 模型状态
  { const r = newO18Run('k'); let last: 'lift' | 'smash' | undefined; let arms: number[] = []
    for (let t = 0; t < 12 && !r.done; t += .1) { o18Step(r, .1, { holdX: t > 5, meleeHit: false, bang: false, sanity: 80, rnd: .5 }); arms.push(phonoSyncData(r.done ? null : r, null).arm) }
    last = r.done as 'lift'
    ok(arms.some((a) => a > .3 && a < .7) && phonoSyncData(null, last).arm === 1, 'O18↔模型：长按抬针过程唱臂逐步抬起，抬针完成停在最高')
    const r2 = newO18Run('k'); let h = 0; const dents: number[] = []
    for (let t = 0; t < 20 && !r2.done; t += .1) { o18Step(r2, .1, { holdX: false, meleeHit: t > 5 && h++ % 10 === 0, bang: false, sanity: 80, rnd: .5 }); dents.push(phonoSyncData(r2.done ? null : r2, null).dent) }
    const s2 = phonoSyncData(null, r2.done as 'smash')
    ok(Math.max(...dents) >= 3 && s2.broke === 1, `O18↔模型：每下近战喇叭凹一点（最多 ${Math.max(...dents)}），第 4 下换碎裂模型`)
    ok(phonoSyncData(null, null, { arm: 0 }).arm === 0 && phonoSyncData(null, null, { broke: 1 }).broke === 1, 'O18↔模型：离开房间保持最后状态')
    ok(src('src/game/engine/l5Hotel.ts').includes('phonoSyncData(run, last') && src('src/game/renderer/renderer.ts').includes('applyPhonographState(ph'), 'O18↔模型：接线（l5Hotel 写 data.arm/broke/dent → updateStructs 摆姿态）') }
  // 物品模型
  for (const t of ['roomcard', 'fatedie', 'brokendie', 'brokenrecord', 'diereceipt', 'mahjongtile'] as const) {
    const g = buildL5ItemMesh(t), n = triCount(g); budget[t] = n
    const m = meshesOf(g)[0].material as THREE.MeshStandardMaterial
    if (t !== 'mahjongtile') ok(m.normalMap && (m.map!.image as { width: number }).width === 1024 && (m.normalMap.image as { width: number }).width === 1024, `${t}：颜色 + 法线 + 粗糙度三张 1024² 图集`)
    ok(n <= 1200, `${t}：${n} 面（≤1,200）`)
  }
  syncRoomCardLabel({ floor: 4, no: 412, dx: 1 }); ok(roomCardLabel().no === 412 && roomCardLabel().floor === 4, '房卡：卡面随绑定写楼层 4 / 房号 412')
  syncRoomCardLabel({ floor: 3, no: 300 }); ok(roomCardLabel().no === 0 && roomCardLabel().floor === 3, '房卡：未刷门前房号空着（———）')
  { const ph = buildCasinoItemMesh('silencejuice'), eg = buildCasinoItemMesh('mysteryegg'); budget.silencejuice = triCount(ph); budget.mysteryegg = triCount(eg); ok(budget.silencejuice <= 1500 && budget.mysteryegg <= 1500, `赌场奖品：寂静汁液 ${budget.silencejuice} / 神秘蛋 ${budget.mysteryegg} 面`) }
  // 骰子动画
  let bad = 0, maxSettle = 0, maxB = 0
  for (let i = 0; i < 400; i++) {
    const face = (['rare', 'sanity', 'teleport', 'squid', 'hotel', 'gambler', 'blank'] as const)[i % 7], top = RESULT_FACE[face]
    const d = simulateDieThrow({ seed: 7000 + i, topFace: top, mode: 'flat', yaw: i * .37, half: DIE_HALF })
    const f = d.frames[d.frames.length - 1], u = upFace(f.q)
    if (u.face !== top || u.cos < .9999 || Math.abs(f.p[1] - DIE_HALF) > 2e-4) bad++
    maxSettle = Math.max(maxSettle, d.settleT); maxB = Math.max(maxB, d.bounces)
  }
  ok(bad === 0, `骰子：400 次投掷最终朝上面 = 结果（bad ${bad}），最长 ${maxSettle.toFixed(2)} s 停稳`)
  { let air = 0; for (let i = 0; i < 50; i++) { const d = simulateDieThrow({ seed: i, topFace: 0, mode: 'flat', half: DIE_HALF }); if (Math.max(...d.frames.map((f) => f.p[1])) > 1.15 && d.frames.some((f, k) => k > 4 && f.p[1] < DIE_HALF * 1.8)) air++ } ok(air === 50, `骰子：抛物线出手（高于出手点）并落地弹跳（${air}/50）`) }
  { let eb = 0; for (let i = 0; i < 100; i++) { const d = simulateDieThrow({ seed: 9000 + i, topFace: RESULT_FACE.edge, mode: 'edge', yaw: i, half: DIE_HALF }); const f = d.frames[d.frames.length - 1], g2 = d.frames[d.frames.length - 2]
      const ys = FACE_AXES.map((a) => qrot(f.q, a)[1]).sort((a, b) => b - a), still = Math.abs(f.q[3] - g2.q[3]) + Math.abs(f.q[0] - g2.q[0]) < 1e-3
      if (Math.abs(ys[0] - Math.SQRT1_2) > 1e-4 || Math.abs(ys[1] - Math.SQRT1_2) > 1e-4 || Math.abs(f.p[1] - DIE_HALF * Math.SQRT2) > 1e-4 || !still) eb++ }
    ok(eb === 0, `骰子：「立在棱上」100 次都停在棱上精确平衡（两侧面各 45°、重心高 h√2、末帧静止；bad ${eb}）`) }
  { const d = simulateDieThrow({ seed: 5, topFace: RESULT_FACE.weapon, mode: 'spin', half: DIE_HALF }), S = d.settleT
    const a = dieVisual(d, 'weapon', S + 10, { dieAlive: true }), b = dieVisual(d, 'weapon', S + 200, { dieAlive: true }), c = dieVisual(d, 'weapon', S + O666T.spin + .5, { dieAlive: false, endT: S + O666T.spin }), e = dieVisual(d, 'weapon', S + O666T.spin + 2, { dieAlive: false, endT: S + O666T.spin })
    ok(a.spin > 30 && b.spin > 30 && Math.hypot(a.p[0] - b.p[0], a.p[2] - b.p[2]) < 1e-6 && a.reveal === 0, `骰子：封闭房间原地高速旋转（${b.spin.toFixed(0)} rad/s，位置不动，转动中无图案）`)
    ok(spinRate(O666T.spin + .1) === 0 && c.reveal > 0 && e.crack === 1, '骰子：5 min 满 → 停下浮现「枪」→ 裂成两半')
    const f = dieVisual(d, 'weapon', S + 60, { dieAlive: false, endT: S + 50 }); ok(f.fade === 1, '骰子：转动中离开房间 → 作废（倒下消失）') }
  { const d = simulateDieThrow({ seed: 3, topFace: 0, mode: 'flat', half: DIE_HALF }); const v0 = dieVisual(d, 'rare', d.settleT - .2, { dieAlive: true }), v1 = dieVisual(d, 'rare', d.settleT + .45, { dieAlive: true }), v2 = dieVisual(d, 'rare', d.settleT + 1, { dieAlive: true })
    ok(v0.reveal === 0 && v1.reveal > 0 && v1.reveal < 1 && v2.reveal === 1, '骰子：停下前无图案，停下后 0.9 s 显现动画') }
  { const walls = dieWallPlanes((tx, ty) => tx >= 0 && tx <= 1 && ty >= 0 && ty <= 1, 1, 1); let esc = 0
    for (let i = 0; i < 100; i++) { const d = simulateDieThrow({ seed: i, topFace: 0, mode: 'flat', yaw: i, walls, half: DIE_HALF }); if (d.frames.some((f) => f.p[0] < -1 - .01 || f.p[0] > 1 + .01 || f.p[2] < -1 - .01 || f.p[2] > 1 + .01)) esc++ }
    ok(walls.length === 4 && esc === 0, `骰子：碰撞用场景墙体（2×2 房间 100 次无穿墙，墙面 ${walls.length}）`) }
  { const svg = new Set<string>(); for (const f of ['rare', 'sanity', 'teleport', 'weapon', 'squid', 'hotel', 'gambler', 'blank'] as const) { const c = createCanvas(64, 64); drawDieIcon(c.getContext('2d') as unknown as CanvasRenderingContext2D, f, 64); svg.add(Buffer.from(c.toBuffer('image/png')).toString('base64').slice(-40)) } ok(svg.size === 8, '骰子：8 种结果图标各不相同') }
  ok(src('src/game/engine/l5Objects.ts').includes('o.anim = {') && src('src/game/renderer/renderer.ts').includes('new FateDieFx(this.scene)'), '接线：投骰写 anim → 渲染层 FateDieFx')
  console.log('三角形预算：' + Object.entries(budget).map(([k, v]) => `${k} ${v}`).join(' · '))
}
// ---- [l5items 收尾] 挥臂出手点 / 结果时序 / 原点平移 / 嗡鸣 / 存档恢复 ----
{
  const S = await import('../src/game/engine/fateDieSim')
  const O = await import('../src/game/engine/l5Objects')
  const { vmAnimPose, buildHeldItem } = await import('../src/game/renderer/viewmodel')
  const { FateDieFx } = await import('../src/game/renderer/fateDieFx')
  const { FateDieHum } = await import('../src/game/core/fateDieHum')
  const { audio } = await import('../src/game/core/audio')
  const { look } = await import('../src/game/renderer/shared')
  for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (k !== 'constructor' && k !== 'fxNodes' && typeof (audio as any)[k] === 'function') (audio as any)[k] = () => {}
  // ① 挥臂：松手那一帧，第一人称手里骰子的世界位置 = 逻辑出手点 = 轨迹第一帧
  { let worst = 0, fwdOk = 0, n = 0
    for (const [yaw, pitch] of [[0, 0], [1.1, -.3], [-2.4, .25], [3, -.6], [.4, .5]]) {
      const cam = new THREE.Object3D(); cam.rotation.order = 'YXZ'; cam.rotation.set(pitch, yaw, 0); cam.position.set(0, S.EYE_H, 0)
      const vm = new THREE.Group(); vm.rotation.order = 'YXZ'; cam.add(vm); const it = buildHeldItem('fatedie'); vm.add(it)
      const at = (pr: number) => { const q = vmAnimPose({ mx: 0, my: 0, bobPhase: 0, time: 0, attackAnimT: S.THROW_DUR * (1 - pr), attackAnimDur: S.THROW_DUR, attackAnimKind: 'dieThrow' as any }); vm.position.set(q.px, q.py, q.pz); vm.rotation.set(q.rx, q.ry, q.rz); cam.updateMatrixWorld(true); return new THREE.Box3().setFromObject(it).getCenter(new THREE.Vector3()) }
      const rel = S.THROW_REL / S.THROW_DUR, h = at(rel), lp = S.dieHandPoint(yaw, pitch)
      worst = Math.max(worst, Math.hypot(h.x - lp[0], h.y - lp[1], h.z - lp[2]))
      const L = (v: THREE.Vector3) => cam.worldToLocal(v.clone()), cock = L(at(.38)), after = L(at(rel + .05)), rest = L(at(0)), hl = L(at(rel))
      if (cock.y > rest.y + .05 && cock.z > rest.z && after.z < hl.z && hl.z < cock.z) fwdOk++ // 相机局部：-z 为前 // 抬手（高 + 后撤）→ 松手时正向前挥
      const facing = Math.atan2(-Math.cos(yaw), -Math.sin(yaw)), d = S.simulateDieThrow({ seed: 11, topFace: 0, mode: 'flat', yaw: facing, from: lp, half: DIE_HALF })
      if (Math.hypot(d.frames[0].p[0] - lp[0], d.frames[0].p[2] - lp[2]) < .05 && Math.abs(S.lookYawOfFacing(facing) - yaw) < 1e-9 || Math.abs(Math.abs(S.lookYawOfFacing(facing) - yaw) - Math.PI * 2) < 1e-9) n++ }
    ok(worst < .005, `挥臂：松手帧第一人称手中骰子位置 = 逻辑出手点（5 个视角最大偏差 ${(worst * 1000).toFixed(2)} mm）`)
    ok(fwdOk === 5, `挥臂：抬手（抬高 + 后撤）→ 前挥中松手（${fwdOk}/5）`)
    ok(n === 5, `挥臂：刚体轨迹从手部出手点开始（${n}/5），不再是胸前 0.35 m`) }
  // 假引擎（无限层窗口 ox/oy 可平移）
  const mkMap = () => ({ w: 64, h: 64, tiles: new Uint8Array(64 * 64).fill(1), structures: [], inf: { ox: 0, oy: 0 } })
  const mkEng = () => { const e: any = { time: 1000, player: { x: 32.5, y: 32.5, z: 0, facing: .7, sanity: 50 }, map: mkMap(), hotel: { objs: O.freshObj(), attn: 0, floor: 3 }, hotelBook: { src: {} }, consumeItem: () => true }; return e }
  const mkHooks = (log: { t: number; k: string; v?: string }[], e: any) => ({ msg: (v: string) => log.push({ t: e.time, k: 'msg', v }), addAttn: (n: number) => { e.hotel.attn += n; log.push({ t: e.time, k: 'attn' }) }, addItem: (v: string) => { log.push({ t: e.time, k: 'item', v }); return true }, beastGaze: () => log.push({ t: e.time, k: 'gaze' }), lift13() {}, teleport: () => log.push({ t: e.time, k: 'tp' }), randomEvent: () => log.push({ t: e.time, k: 'rnd' }), phono() {} })
  // ② 时序 + 400 次结果：文字 / 效果在骰子停下（+ 图案浮现完）之前一律不触发；之后按结果正确生效
  { let early = 0, wrong = 0, faceBad = 0, n = 0; const seen = new Set<string>()
    for (let i = 0; i < 400; i++) {
      const e = mkEng(), log: { t: number; k: string; v?: string }[] = [], hk = mkHooks(log, e), o = e.hotel.objs, room = i % 2 ? 'R1' : null
      look.pitch = ((i % 7) - 3) * .1; e.player.facing = i * .61
      const face = O.rollFateDie(e, o, room, hk as any, ((i * 0.618034) % 1))!
      seen.add(face); const a = o.anim!, sim = S.simulateDieThrow({ seed: a.seed, topFace: S.RESULT_FACE[face], mode: face === 'edge' ? 'edge' : face === 'weapon' ? 'spin' : 'flat', yaw: a.yaw, from: a.from, walls: a.walls, half: DIE_HALF })
      const stopT = a.t0 + a.rel + sim.settleT, doneT = stopT + (sim.mode === 'flat' ? S.REVEAL_FLAT : 0)
      if (sim.mode === 'flat') { const u = S.upFace(sim.frames[sim.frames.length - 1].q); if (u.face !== S.RESULT_FACE[face] || u.cos < .9999) faceBad++ }
      const san0 = e.player.sanity
      for (let k = 0; k < 400 && (o.pend || e.time < doneT + .1); k++) { e.time += 1 / 30; O.stepFateDie(e, o, room, 1 / 30, hk as any) }
      if (log.some((l) => l.t < doneT - 1e-6) || (log[0] && log[0].t > doneT + .05)) early++
      const has = (k: string, v?: string) => log.some((l) => l.k === k && (v === undefined || (l.v ?? '').includes(v)))
      const okFace = face === 'rare' ? has('item') && has('attn') && e.hotel.attn === 20 : face === 'sanity' ? e.player.sanity === 100 && o.hallu === O666T.hallucinate : face === 'teleport' ? has('tp') : face === 'blank' ? Math.abs(e.player.sanity - (san0 - 8)) < 1e-9 : face === 'weapon' ? o.die?.spin! > O666T.spin && !has('item') : face === 'edge' ? o.die?.ex !== undefined && Math.hypot(o.die.ex - (a.x + sim.frames[sim.frames.length - 1].p[0]), o.die.ey! - (a.y + sim.frames[sim.frames.length - 1].p[2])) < 1e-9 && has('msg', '棱') : o.die?.freeze! > O666T.freeze - .2 && o.die!.freeze <= O666T.freeze
      const okText = face === 'weapon' ? has('msg', '越转越快') : face === 'edge' ? has('msg', '立在一条棱上') : has('msg', `「${O666_FACE_NAME[face]}」`)
      if (!okFace || !okText) wrong++
      n++ }
    ok(early === 0, `时序：400 次投掷，提示文字 / 效果都在骰子停下${'（平躺：停稳 + 图案浮现 0.9 s 完）'}后才触发（提前 ${early}）`)
    ok(wrong === 0 && faceBad === 0 && seen.size === 9, `时序：400 次结果正确生效（错 ${wrong}，朝上面不符 ${faceBad}，覆盖 ${seen.size}/9 种）`) }
  { // 按 X 当帧：只挥臂、不出字
    const e = mkEng(), log: any[] = [], hk = mkHooks(log, e); O.rollFateDie(e, e.hotel.objs, null, hk as any, .25)
    ok(log.length === 0 && e.attackAnimKind === 'dieThrow' && e.attackAnimT === S.THROW_DUR && e.player.sanity === 50, '时序：按 X 当帧只触发第一人称挥臂（0.6 s），不出结果文字、理智不变') }
  { // 转 5 min：枪在 5 min 满 + 「枪」浮现完才给；棱上：平衡达成那一刻出字
    const e = mkEng(), log: any[] = [], hk = mkHooks(log, e), o = e.hotel.objs; O.rollFateDie(e, o, 'R', hk as any, .6)
    const a = o.anim!; const sim = S.simulateDieThrow({ seed: a.seed, topFace: S.RESULT_FACE.weapon, mode: 'spin', yaw: a.yaw, from: a.from, walls: a.walls, half: DIE_HALF }), land = a.t0 + a.rel + sim.settleT
    let gunT = -1; for (let k = 0; k < 400 * 30 && gunT < 0; k++) { e.time += 1 / 30; O.stepFateDie(e, o, 'R', 1 / 30, hk as any); if (log.some((l: any) => l.k === 'item' && l.v === 'shotgun')) gunT = e.time }
    const vis = dieVisual(sim, 'weapon', gunT - a.t0 - a.rel, { dieAlive: true })
    ok(gunT - land >= O666T.spin + S.REVEAL_SPIN - .05 && gunT - land < O666T.spin + S.REVEAL_SPIN + .1 && vis.reveal >= .99, `时序：转 5 min 满 → 「枪」浮现完（+${S.REVEAL_SPIN} s）才给枪（落地后 ${(gunT - land).toFixed(2)} s）`) }
  // ③ 无限层原点平移：飞行中 / 停下后的骰子跟随世界，不跟窗口
  { const e = mkEng(), log: any[] = [], hk = mkHooks(log, e), o = e.hotel.objs, scene = new THREE.Scene(), fx = new FateDieFx(scene)
    O.rollFateDie(e, o, null, hk as any, .62) // 乌贼区间：停下后 10 s 定身
    const relPos = () => { fx.update(e); return [fx.group.position.x - e.player.x, fx.group.position.z - e.player.y] }
    let jump = 0, prev: number[] | null = null, shifted = 0
    for (let k = 0; k < 120; k++) { e.time += 1 / 30; O.stepFateDie(e, o, null, 1 / 30, hk as any)
      if (k === 25 || k === 70) { e.map.inf.ox += 32; e.map.inf.oy -= 16; e.player.x -= 32; e.player.y += 16; shifted++ } // 引擎平移窗口：玩家等动态坐标反向平移
      const r = relPos(); if (prev && fx.group.visible) jump = Math.max(jump, Math.hypot(r[0] - prev[0], r[1] - prev[1])); prev = fx.group.visible ? r : null }
    ok(shifted === 2 && jump < .25, `原点平移：投掷中的骰子随世界平移（两次平移，相对玩家位置单帧最大变化 ${jump.toFixed(3)} m，无跳变）`)
    ok(o.die?.freeze! > 0 && !log.some((l: any) => l.k === 'gaze'), '原点平移：定身判定用世界坐标（平移不算「动了」）')
    e.map.inf.ox -= 64; e.player.x += 64; for (let k = 0; k < 3; k++) { e.time += 1 / 30; O.stepFateDie(e, o, null, 1 / 30, hk as any) }
    ok(o.die?.freeze! > 0, '原点平移：再平移一次仍不误判') }
  { // 换层 / 换地图（掉落、传送、电梯）：投掷中作废，不生效、骰子模型隐藏
    const e = mkEng(), log: any[] = [], hk = mkHooks(log, e), o = e.hotel.objs, fx = new FateDieFx(new THREE.Scene())
    O.rollFateDie(e, o, null, hk as any, .25); for (let k = 0; k < 20; k++) { e.time += 1 / 30; O.stepFateDie(e, o, null, 1 / 30, hk as any); fx.update(e) }
    const vis0 = fx.group.visible; e.map = mkMap(); for (let k = 0; k < 200; k++) { e.time += 1 / 30; O.stepFateDie(e, o, null, 1 / 30, hk as any) } fx.update(e)
    ok(vis0 && !fx.group.visible && e.player.sanity === 50 && !o.pend && log.length === 1 && /没看清/.test(log[0].v), '换地图：飞行中的骰子作废（不生效、模型隐藏、一句提示）')
    const e2 = mkEng(), l2: any[] = [], h2 = mkHooks(l2, e2); O.rollFateDie(e2, e2.hotel.objs, null, h2 as any, .25); e2.time += .5; e2.hotel.floor = 4; for (let k = 0; k < 200; k++) { e2.time += 1 / 30; O.stepFateDie(e2, e2.hotel.objs, null, 1 / 30, h2 as any) }
    ok(e2.player.sanity === 50 && !e2.hotel.objs.pend, '换楼层：飞行中的骰子作废') }
  // ④ 嗡鸣：mock AudioContext 验证节点启停与状态同步
  { const made: any[] = []
    const P = (v = 0) => ({ value: v, setTargetAtTime(x: number) { this.value = x }, setValueAtTime(x: number) { this.value = x }, linearRampToValueAtTime(x: number) { this.value = x }, exponentialRampToValueAtTime(x: number) { this.value = x }, cancelScheduledValues() {} })
    const node = (kind: string, extra: any = {}) => { const n: any = { kind, started: false, stopped: false, connected: 0, connect(d: any) { this.connected++; return d }, disconnect() { this.connected = 0 }, start() { this.started = true }, stop() { this.stopped = true }, ...extra }; made.push(n); return n }
    const ctx: any = { currentTime: 0, sampleRate: 8000, createOscillator: () => node('osc', { frequency: P(440), type: 'sine' }), createGain: () => node('gain', { gain: P(1) }), createBiquadFilter: () => node('filter', { frequency: P(350), Q: P(1), type: 'lowpass' }), createBuffer: (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) }), createBufferSource: () => node('buf', { buffer: null }) }
    ;(audio as any).fxNodes = () => ({ ctx, sfx: node('dest'), amb: node('dest') })
    const e = mkEng(), log: any[] = [], hk = mkHooks(log, e), o = e.hotel.objs, fx = new FateDieFx(new THREE.Scene()), hum = () => (fx as any).hum as InstanceType<typeof FateDieHum> | null
    O.rollFateDie(e, o, 'R', hk as any, .6)
    const a = o.anim!, sim = S.simulateDieThrow({ seed: a.seed, topFace: S.RESULT_FACE.weapon, mode: 'spin', yaw: a.yaw, from: a.from, walls: a.walls, half: DIE_HALF }), land = a.t0 + a.rel + sim.settleT
    const ear = new THREE.Vector3(e.player.x, 1.55, e.player.y)
    const run = (secs: number, room: string, dt = 1 / 30) => { for (let t = 0; t < secs; t += dt) { e.time += dt; ctx.currentTime += dt; O.stepFateDie(e, o, room, dt, hk as any); fx.update(e, null, ear) } }
    run(land - e.time - .05, 'R'); const before = !hum()?.running
    run(4, 'R'); const h = hum(); const oscOn = made.filter((n) => n.kind === 'osc' && n.started && !n.stopped).length, g1 = (h as any)?.nodes?.out.gain.value ?? 0
    ok(before && h?.running && oscOn === 4, `嗡鸣：骰子落地开始转才起（落地前无节点；转动中 ${oscOn} 个振荡器在跑）`)
    ear.copy(fx.group.position).add(new THREE.Vector3(0, 1.5, .6)); run(.5, 'R'); const gN = (h as any)?.nodes?.out.gain.value ?? 0
    ear.copy(fx.group.position).add(new THREE.Vector3(8, 1.5, 0)); run(.5, 'R'); const g8 = (h as any)?.nodes?.out.gain.value ?? 0; ear.set(e.player.x, 1.55, e.player.y)
    ok(g1 > 0 && gN > 0 && g8 < gN * .1, `嗡鸣：3D 距离衰减（1.6 m 处 ${gN.toFixed(3)} → 8 m 外 ${g8.toFixed(3)}）`)
    const f1 = (h as any).nodes.h1.frequency.value; ok(Math.abs(f1 - (38 / (Math.PI * 2)) * 4) < 1, `嗡鸣：谐波随转速（${f1.toFixed(1)} Hz = 每秒掠过面数）`)
    run(.2, 'R-out'); const fading = h!.running && h!.stopAt > 0; run(1, 'R-out')
    ok(fading && !h!.running && made.filter((n) => n.kind === 'osc' && n.started && !n.stopped).length === 0 && !o.die, '嗡鸣：离开房间（作废）→ 淡出 0.35 s → 振荡器全部停止，与骰子状态同步')
    // 第二颗：转满 5 min → 停 → 裂开一声脆响（只响一次）
    o.dieCd = 0; e.time += 1; O.rollFateDie(e, o, 'R', hk as any, .6); const n0 = h!.cracks
    run(O666T.spin + 20, 'R', .1); ok(h!.cracks === n0 + 1 && !h!.running && log.some((l: any) => l.v === 'shotgun'), `嗡鸣：转满 5 min 骤停 → 裂开一声脆响（${h!.cracks - n0} 次）→ 停止`)
    const h2 = new FateDieHum(ctx, node('dest')); h2.update(S.dieHumTarget(38, 0, 1)); h2.update(S.dieHumTarget(38, .5, 1)); ctx.currentTime += 1; h2.update(S.dieHumTarget(38, .5, 1))
    ok(!h2.running, '嗡鸣：作废淡出（fade>0）即停') }
  // ⑤ 存档往返：留声机砸烂 / 抬臂 / 凹陷 / 停转 + 待生效结果
  { const o = O.freshObj(); o.phono = { '3:10,12': { arm: 1, broke: 0, dent: 0, on: 0 }, '3:40,8': { arm: 0, broke: 1, dent: 4, on: 0 } }; o.die = { face: 'edge', rollT: 1, spin: 0, spinRoom: '', freeze: 0, fx: 1, fy: 2, ex: 3, ey: 4, w: 1 }; o.pend = { face: 'rare', at: 5, room: null, ex: 0, ey: 0 }; o.anim = { t0: 1 } as any
    const b = O.restoreObj(JSON.parse(JSON.stringify(o)))
    ok(JSON.stringify(b.phono) === JSON.stringify(o.phono) && b.die?.ex === 3 && b.pend?.face === 'rare' && !b.anim, '存档：留声机状态 / 骰子（世界坐标）/ 待生效结果往返；动画瞬态不存')
    ok(!O.restoreObj({ die: { face: 'edge', fx: 1, fy: 1 } }).die, '存档：旧档窗口坐标的骰子读档丢弃（坐标已失效）') }
}
// ---- [l5items 收尾] 真实引擎：留声机砸烂 / 抬臂 → 存档 → 读档（新引擎、同一层重新生成）→ 模型状态恢复 ----
{
  const memory = new Map<string, string>()
  Object.defineProperty(globalThis, 'document', { value: { createElement: () => createCanvas(256, 256), createElementNS: () => { throw new Error('headless') }, getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } }, configurable: true })
  Object.assign(globalThis, { window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }, localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) } })
  const { Engine } = await import('../src/game/engine')
  const H = await import('../src/game/engine/l5Hotel')
  const O = await import('../src/game/engine/l5Objects')
  const { snapshot } = await import('../src/game/engine/save')
  const fresh = (seed: number, floor: number, hotel?: unknown) => { const e: any = new Engine(); e.seed = seed; e.hotel = hotel ?? H.freshHotel(); e.hotel.floor = floor; e.loadLevel(5, { mapSeed: seed + floor, firstVisit: true }); e.introT = 0; e.emit = () => {}; e.persist = () => {}; e.msg = () => {}; e.map.entities = e.map.entities.filter((x: any) => !['maid', 'bellhop', 'concierge'].includes(x.def?.type)); Object.assign(e.player, { hp: 100, sanity: 80, hunger: 100, thirst: 100, stamina: 100 }); return e }
  const found: { sd: number; fl: number }[] = []
  for (let sd = 1; sd < 120 && found.length < 2; sd++) for (const fl of [1, 2, 4]) { const t: any = fresh(sd * 977, fl); if (t.map.structures.some((x: any) => x.kind === 'phonograph' && x.data?.o18)) { found.push({ sd, fl }); break } }
  const stand = (g: any, ph: any) => { const c = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]].map(([dx, dy]) => ({ x: ph.x + .5 + dx, y: ph.y + .5 + dy })).find((q) => !g.map.structures.some((s: any) => s.solid && Math.floor(q.x) >= s.x && Math.floor(q.x) < s.x + (s.w || 1) && Math.floor(q.y) >= s.y && Math.floor(q.y) < s.y + (s.h || 1)))!; g.player.x = c.x; g.player.y = c.y }
  const phOf = (g: any) => g.map.structures.find((x: any) => x.kind === 'phonograph' && x.data?.o18)
  ok(found.length === 2, `存档恢复：找到 ${found.length} 间 O18 留声机客房（真实 L5 生成）`)
  for (const [i, f] of found.entries()) {
    const mode = i === 0 ? 'smash' : 'lift'
    const g: any = fresh(f.sd * 977, f.fl), ph = phOf(g); stand(g, ph)
    for (let k = 0; k < 60; k++) H.updateHotel(g, .1)
    if (mode === 'smash') for (let h = 0; h < 4; h++) { H.hotelHear(g, 10, false); for (let k = 0; k < 5; k++) H.updateHotel(g, .1) }
    else { g.specialHeld = true; for (let k = 0; k < 34; k++) H.updateHotel(g, .1); g.specialHeld = false; for (let k = 0; k < 5; k++) H.updateHotel(g, .1) }
    const want = { arm: Number(ph.data.arm) || 0, broke: Number(ph.data.broke) || 0, dent: Number(ph.data.dent) || 0, on: ph.data.on }
    ok(mode === 'smash' ? want.broke === 1 && want.dent === 4 && want.on === 0 : want.arm === 1 && want.broke === 0 && want.on === 0, `存档恢复（${mode === 'smash' ? '砸烂' : '抬臂'}）：本局留声机状态 ${JSON.stringify(want)}`)
    const snap: any = JSON.parse(JSON.stringify(snapshot(g)))
    const back = H.restoreHotel(snap.hotel)
    const g2: any = fresh(f.sd * 977, f.fl, back), ph2 = phOf(g2)
    const before = { arm: Number(ph2.data.arm) || 0, broke: Number(ph2.data.broke) || 0, on: ph2.data.on }
    stand(g2, ph2); for (let k = 0; k < 3; k++) H.updateHotel(g2, .1)
    const got = { arm: Number(ph2.data.arm) || 0, broke: Number(ph2.data.broke) || 0, dent: Number(ph2.data.dent) || 0, on: ph2.data.on }
    ok(before.broke === 0 && before.arm === 0 && JSON.stringify(got) === JSON.stringify(want), `存档恢复（${mode === 'smash' ? '砸烂' : '抬臂'}）：读档重新生成后（生成时 ${JSON.stringify(before)}）恢复为 ${JSON.stringify(got)}`)
    ok(!H.hotelDoorBlocked(g2) && !O.objSave(g2).o18, `存档恢复（${mode === 'smash' ? '砸烂' : '抬臂'}）：读档后不再触发 O18（门不锁）`)
    // 渲染：按 data 摆姿态（碎裂模型 / 喇叭压扁 / 唱臂抬起 / 转盘停转）
    const m = buildPhonograph('new'); applyPhonographState(m, { arm: got.arm, broke: got.broke, dent: got.dent }); const l0 = (m.userData.levels as THREE.Group[])[0].userData.parts as any
    const spinning = got.on !== 0 && !got.broke && !(got.arm > 0)
    ok(mode === 'smash' ? l0.shards.visible && !l0.rec.visible && l0.horn.scale.x < .8 && !spinning : l0.lift.rotation.x > .2 && l0.rec.visible && !spinning, `存档恢复（${mode === 'smash' ? '砸烂' : '抬臂'}）：模型 ${mode === 'smash' ? `碎裂 + 喇叭压扁到 ${l0.horn.scale.x.toFixed(2)}` : `唱臂抬起 ${l0.lift.rotation.x.toFixed(2)} rad`}，转盘停转`)
    // 离开再回来（窗口重建）也保持
    if (i === 0) { const key = Object.keys(O.objSave(g2).phono ?? {}); ok(key.length === 1, `存档恢复：按楼层 + 世界坐标记录（${key[0]}）`) }
  }
}
console.log(`check:l5items ${fail ? '未过' : '全过'}：${pass} 通过 / ${fail} 失败`)
if (fail) process.exit(1)
