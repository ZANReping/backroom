/* eslint-disable @typescript-eslint/no-explicit-any -- 测试桩/原型页用简化的引擎替身，不进生产包 */
// v64：肢团（Entity 5）重制——行为机制 + 模型预算无头验收（模拟引擎，空旷平面）
// 运行：npm run check:clumps
import * as THREE from 'three'
import { createCanvas } from '@napi-rs/canvas'
import { makeEntity, applyL3Variant, type Entity } from '../src/game/entities'
import { audio } from '../src/game/core/audio'
import { CLUMP, beginClumpFrame, clumpHear, clumpControlsPlayer, clumpCaptor, clumpFastingFor, clumpWeaponFor, initClump, rollSquirt, updateClump } from '../src/game/engine/clumpAI'
import { genL3ChunkRaw } from '../src/game/world/infiniteL3'
import { L3 } from '../src/game/levels/l3'
import { L1 } from '../src/game/levels/l1'
import { L2 } from '../src/game/levels/l2'
import { buildEntityMesh } from '../src/game/renderer/entitiesMesh'
import { animateClump, type ClumpRig } from '../src/game/renderer/clumpMesh'

let fails = 0
const ok = (c: boolean, m: string) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
let runs = 0, chews = 0
audio.clumpRun = () => { runs++ }
audio.clumpChew = () => { chews++ }

function world(levelId = 2) {
  const msgs: string[] = []
  const eng: any = {
    levelDef: { id: levelId },
    player: { x: 0, y: 0, z: 0, vz: 0, hp: 100, stamina: 100, sanity: 100, thirst: 80, slowT: 0, crouching: false },
    map: { entities: [] as Entity[], items: [] as any[], inf: { ox: 0, oy: 0 } },
    particles: [] as any[],
    input: { sprint: false, jump: false, attack: false, interact: false },
    dev: { invisible: false },
    camShake: 0, hurt: 0,
    msg: (t: string) => msgs.push(t),
    los: () => true,
    entityWalkH: () => 0,
    wanderTarget(e: Entity) { e.targetX = e.x + 1; e.targetY = e.y; e.stateT = 3 },
    stepEntity(e: Entity, sp: number, dt: number) { const dx = e.targetX - e.x, dy = e.targetY - e.y, d = Math.hypot(dx, dy); if (d < 0.3) return true; const k = Math.min(d, sp * dt) / d; e.x += dx * k; e.y += dy * k; return false },
    faceToward(e: Entity, x: number, y: number) { e.facing = Math.atan2(y - e.y, x - e.x) },
    meleeZOk: () => true,
    bloodParticles() {},
    hurtPlayer(dmg: number) { this.hurt += dmg; this.player.hp -= dmg; if (this.player.hp <= 0) this.dead = true },
  }
  return { eng, msgs }
}
/** 生成一只肢团；fasting=是否强制绝食（默认强制饥饿，排除 id 哈希的随机性） */
function spawn(eng: any, x: number, y: number, o: { l3?: boolean; fasting?: boolean; weapon?: any } = {}) {
  const e = makeEntity('clump', x, y)
  if (o.l3) applyL3Variant(e)
  eng.map.entities.push(e)
  const s = initClump(eng, e)
  s.fasting = !!o.fasting; s.phase = o.fasting ? 'fasting' : 'roam'
  if (o.weapon) s.weapon = o.weapon
  return e
}
function run(eng: any, secs: number, each?: (t: number) => void) {
  const dt = 1 / 30
  for (let t = 0; t < secs; t += dt) {
    each?.(t); beginClumpFrame(eng, dt)
    clumpControlsPlayer(eng)
    for (const e of eng.map.entities) { if (e.dead) continue; e.attackCd -= dt; e.stateT -= dt; updateClump(eng, e, dt, Math.hypot(e.x - eng.player.x, e.y - eng.player.y), 1) }
  }
}
const mash = (eng: any) => { let n = 0; return () => { eng.input.jump = (n++ % 2) === 0 } }

// ---------- 感知：视距 3m，以听觉为主 ----------
{
  const { eng } = world(2)
  const e = spawn(eng, 3.6, 0)
  run(eng, 0.5)
  ok(e.cl!.phase === 'roam', `安静的玩家在 3.6m（视距外）不被察觉（${e.cl!.phase}）`)
  const { eng: eng2 } = world(2)
  const f = spawn(eng2, 2.8, 0)
  run(eng2, 0.1)
  ok(f.cl!.phase !== 'roam', `2.8m（视距内）被看见（${f.cl!.phase}）`)
  ok(CLUMP.SIGHT === 3, 'SIGHT 常量 = 3m')
}
{
  const { eng } = world(2)
  const e = spawn(eng, 9, 0)
  clumpHear(eng, e, 0, 0, 3, false) // 蹲行/慢走的小声响
  ok(e.cl!.phase === 'roam', '9m 外的小声响（半径 3）听不见')
  clumpHear(eng, e, 0, 0, 6, true) // 奔跑：按 hearing=14 放大
  ok(e.cl!.phase === 'hunt' && Math.abs(e.cl!.lastX) < 1e-6, `9m 外的奔跑声被听见并循声追击（${e.cl!.phase}）`)
}
// ---------- 甩肢移动：静止起步慢，起势后爆发；L3 更快且无混乱期 ----------
function speedProfile(l3: boolean) {
  const { eng, msgs } = world(l3 ? 3 : 2)
  eng.los = () => false // 只靠听觉追向远处声源
  const e = spawn(eng, 0, 0, { l3, weapon: l3 ? 'brick' : undefined })
  if (l3) eng.player.x = -60; else eng.player.y = 8 // 两种个体都只循声冲向声源（L3 在 12m 内会直接追踪玩家本人）
  e.cl!.phase = 'hunt'; e.cl!.lastX = 400; e.cl!.lastY = 0; e.cl!.heardT = 0
  const sp: number[] = []
  run(eng, 4, () => { e.cl!.heardT = 0; sp.push(e.cl!.speed) })
  return { sp, msgs, e }
}
{
  const n = speedProfile(false), L = speedProfile(true)
  const early = Math.max(...n.sp.slice(1, 9)), peakN = Math.max(...n.sp), peakL = Math.max(...L.sp)
  ok(early < 1.6, `普通肢团起步慢（前 0.3s 最高 ${early.toFixed(2)} m/s）`)
  ok(peakN > 4.3, `起势后爆发（峰值 ${peakN.toFixed(2)} m/s）`)
  ok(peakL > peakN + 0.6, `L3 更快（峰值 ${peakL.toFixed(2)} > ${peakN.toFixed(2)}）`)
  const dips = n.sp.filter((v, i) => i > 30 && v < 1.6).length
  ok(dips > 0 && n.msgs.some((m: string) => m.includes('缠成一团')), `普通肢团跑动中有「肢体缠成一团」的混乱期（${dips} 帧失速）`)
  ok(L.sp.slice(40).every((v) => v > 3.5), 'L3 肢团起势后没有混乱期')
  ok(runs > 0 && n.msgs.some((m: string) => m.includes('好几个人')), `移动时发出「多人奔跑」脚步声（${runs} 次）`)
}
// ---------- 抓取：8 英尺（2.4m）内蓄力；甩出主臂 ----------
{
  const { eng } = world(2)
  const e = spawn(eng, 2.6, 0); e.cl!.phase = 'hunt'
  eng.stepEntity = () => false // 固定距离
  run(eng, 0.1)
  ok(e.cl!.phase === 'hunt', `2.6m 不蓄力（${e.cl!.phase}）`)
  e.x = 2.3; run(eng, 0.05)
  ok(e.cl!.phase === 'windup', `2.3m（<2.4m）开始蓄力（${e.cl!.phase}）`)
  ok(CLUMP.GRAB_RANGE === 2.4 && CLUMP.ARM_REACH >= 2.4 && CLUMP.ARM_REACH <= 3.05, '抓取距离 2.4m，主臂 8–10 英尺')
  run(eng, 0.7)
  ok(e.cl!.phase === 'grab' && clumpCaptor(eng) === e, `蓄力结束甩出主臂抓住玩家（${e.cl!.phase}）`)
  const d0 = Math.hypot(eng.player.x - e.x, eng.player.y - e.y)
  run(eng, 0.8)
  const d1 = Math.hypot(eng.player.x - e.x, eng.player.y - e.y)
  ok(d1 < d0 - 0.5, `玩家被拖向中心（${d0.toFixed(2)} → ${d1.toFixed(2)}m）`)
  ok(clumpControlsPlayer(eng), '被抓期间肢团接管玩家移动')
}
// ---------- 连按挣脱 ----------
{
  const { eng, msgs } = world(2)
  const e = spawn(eng, 2.2, 0); e.cl!.phase = 'hunt'
  eng.stepEntity = () => false
  run(eng, 0.75)
  const hp = eng.player.hp
  const tick = mash(eng)
  run(eng, 1.0, tick)
  ok(e.cl!.phase !== 'grab' && e.cl!.phase !== 'devour' && !clumpCaptor(eng), `连按挣脱（${e.cl!.phase}）`)
  ok(eng.player.hp === hp && msgs.some((m: string) => m.includes('挣开')), '挣脱后不再受吞食伤害')
}
// ---------- 吞食：重伤但不致死 ----------
for (const startHp of [100, 25, 6, 1.5]) {
  const { eng } = world(2)
  eng.player.hp = startHp
  const e = spawn(eng, 2.2, 0); e.cl!.phase = 'hunt'
  eng.stepEntity = () => false
  run(eng, 6)
  ok(!eng.dead && eng.player.hp >= 1 && eng.player.hp <= Math.max(CLUMP.DEVOUR_HP_LEFT, 1) + 1e-6, `吞食不致死（${startHp} → ${eng.player.hp.toFixed(2)} 血）`)
  if (startHp === 100) {
    ok(e.cl!.phase === 'sated' && !clumpCaptor(eng) && eng.player.slowT > 1, `吞食后吐出、玩家减速，肢团饱足（${e.cl!.phase}）`)
    ok(chews > 0, '齿口咀嚼声')
    const hp = eng.player.hp
    run(eng, 8)
    ok(eng.player.hp === hp, '饱足期间无视玩家（不会连续吞食）')
  }
}
// ---------- 绝食个体：比例与挑衅 ----------
{
  let n = 0, l3n = 0
  for (let id = 1; id <= 5000; id++) { if (clumpFastingFor(id, false)) n++; if (clumpFastingFor(id, true)) l3n++ }
  ok(Math.abs(n / 5000 - CLUMP.FASTING_CHANCE) < 0.025 && CLUMP.FASTING_CHANCE === 0.4, `普通层绝食比例 ${(n / 50).toFixed(1)}%（目标 40%）`)
  ok(l3n === 0, 'L3 绝食比例 0%')
  const { eng } = world(2)
  const e = spawn(eng, 2, 0, { fasting: true })
  run(eng, 4, () => { eng.player.y = 0.2 })
  ok(e.cl!.phase === 'fasting' && eng.hurt === 0 && !clumpCaptor(eng), '绝食个体无视 2m 外走过的流浪者')
  eng.player.x = 1.0; run(eng, 0.1)
  ok((e.cl!.phase === 'hunt' || e.cl!.phase === 'windup') && !e.cl!.fasting, `近距离撞上 → 转为敌对（${e.cl!.phase}）`)
  const w2 = world(2), f2 = spawn(w2.eng, 2.5, 0, { fasting: true })
  w2.eng.input.sprint = true
  run(w2.eng, 0.6, () => { w2.eng.player.y += 0.18 })
  ok(!f2.cl!.fasting, '贴身奔跑 → 转为敌对')
  const w3 = world(2), f3 = spawn(w3.eng, 6, 0, { fasting: true })
  f3.hp -= 5; run(w3.eng, 0.05)
  ok(!f3.cl!.fasting && f3.cl!.phase === 'hunt', '被攻击 → 转为敌对')
  const w4 = world(2), f4 = spawn(w4.eng, 6, 0, { fasting: true })
  clumpHear(w4.eng, f4, 0, 0, 12, true)
  ok(f4.cl!.fasting && f4.cl!.phase === 'fasting', '绝食个体不循声追击')
}
// ---------- L3 标记与子变种 ----------
{
  let found = 0, bad = 0
  for (let cx = -6; cx <= 6 && found < 4; cx++) for (let cy = -6; cy <= 6; cy++) {
    const raw = genL3ChunkRaw(L3, 424242, cx, cy)
    for (const en of raw.entities) if (en.type === 'clump') { found++; if (!(en as any).l3clump || (en as any).scale !== CLUMP.L3_SCALE) bad++ }
  }
  ok(found > 0 && bad === 0, `L3 chunk 中的肢团都带 l3clump 标记、scale=${CLUMP.L3_SCALE}（${found} 只）`)
  const d = makeEntity('clump', 0, 0); applyL3Variant(d)
  ok(!!d.def.l3clump, 'L3 召唤（applyL3Variant）同样带 l3clump')
  ok(!makeEntity('clump', 0, 0).def.l3clump, '普通层肢团不带 l3clump')
  const spawnLv = (def: any) => def.entities?.some((s: any) => s.type === 'clump')
  ok(spawnLv(L1) && spawnLv(L2) && spawnLv(L3), '生成范围维持 L1/L2/L3')
  const { eng } = world(3)
  const e = spawn(eng, 0, 0, { l3: true })
  ok(e.def.hp === 90 && e.hp === 90 && e.cl!.l3, `L3 肢团更壮（生命 ${e.def.hp}）`)
}
// ---------- L3 武器比例、滋水枪（腰果水）命中率与效果 ----------
{
  const cnt: Record<string, number> = {}
  for (let id = 1; id <= 8000; id++) { const w = clumpWeaponFor(id, true); cnt[w] = (cnt[w] ?? 0) + 1 }
  const sq = (cnt.squirt ?? 0) / 8000
  ok(Math.abs(sq - CLUMP.SQUIRT_CHANCE) < 0.012 && CLUMP.SQUIRT_CHANCE === 0.05, `L3 持滋水枪比例 ${(sq * 100).toFixed(1)}%（目标 5%）`)
  ok((cnt.brick ?? 0) > 3000 && (cnt.stone ?? 0) > 3000 && !cnt.none, `其余持砖块/石器（砖 ${cnt.brick} / 石 ${cnt.stone}）`)
  ok(clumpWeaponFor(7, false) === 'none', '普通肢团不持械')
  const rate = (d: number) => { let h = 0; for (let i = 0; i < 20000; i++) if (rollSquirt(d, (i + 0.5) / 20000)) h++; return h / 20000 }
  const r3 = rate(3), r6 = rate(6)
  ok(r3 < 0.5 && r3 > 0.2, `滋水枪 3m 命中率 ${(r3 * 100).toFixed(0)}%（明显散布）`)
  ok(r6 < 0.25, `滋水枪 6m 命中率 ${(r6 * 100).toFixed(0)}%`)
  const { eng } = world(3)
  const e = spawn(eng, 5, 0, { l3: true, weapon: 'squirt' }); e.cl!.phase = 'hunt'; e.cl!.heardT = 0; e.cl!.squirtCd = 0
  eng.stepEntity = () => false
  const rnd = Math.random; Math.random = () => 0.5 // 正中
  run(eng, 0.1)
  Math.random = rnd
  ok(eng.player.sanity === 100 - CLUMP.SQUIRT_SANITY && eng.player.hp === 100 && eng.player.thirst === 80 - CLUMP.SQUIRT_THIRST, `腰果水命中：理智 -10、口渴 -5、不扣血（理智 ${eng.player.sanity}）`)
  ok(eng.particles.some((p: any) => p.color === '#c9a05a'), '褐色腰果水水线粒子')
}
// ---------- L3：持械近战、缴械后骨刺、贴顶俯扑 ----------
{
  const { eng, msgs } = world(3)
  const e = spawn(eng, 1.2, 0, { l3: true, weapon: 'brick' }); e.cl!.phase = 'hunt'
  eng.stepEntity = () => false
  run(eng, 0.6)
  ok(eng.hurt > 0, `持砖近战命中（伤害 ${eng.hurt.toFixed(0)}）`)
  const rnd = Math.random; Math.random = () => 0.01
  e.hp -= 4; run(eng, 0.05)
  Math.random = rnd
  ok(e.cl!.phase === 'selfharm' && msgs.some((m: string) => m.includes('骨刺')), '被缴械 → 自残')
  run(eng, 1.3)
  ok(e.cl!.weapon === 'bone', `自残后以骨刺为武器（${e.cl!.weapon}）`)
}
{
  const { eng, msgs } = world(3)
  const e = spawn(eng, 7, 0, { l3: true, weapon: 'stone' }); e.cl!.phase = 'hunt'; e.cl!.heardT = 0
  let onCeil = false
  run(eng, 4, () => { if (e.cl!.onCeil) onCeil = true })
  ok(onCeil && msgs.some((m: string) => m.includes('天花板')), 'L3 追击时贴着天花板移动')
  ok(msgs.some((m: string) => m.includes('砸了下来')) || eng.hurt > 0, `从头顶俯扑下来（伤害 ${eng.hurt.toFixed(0)}）`)
}
{
  const { eng } = world(3)
  const e = spawn(eng, 2.3, 0, { l3: true }); e.cl!.phase = 'hunt'
  eng.stepEntity = () => false
  run(eng, 0.45)
  ok(e.cl!.phase === 'grab', `L3 蓄力更短（${CLUMP.WINDUP_L3}s）`)
}
// ---------- 模型：预算、姿态、贴图 ----------
{
  Object.assign(globalThis, { document: { createElement: () => createCanvas(256, 256) } })
  for (const l3 of [false, true]) for (const seed of [1, 2]) {
    const g = buildEntityMesh('clump', { seed, l3clump: l3 })
    const meshes: THREE.Mesh[] = []
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh) })
    const rig = g.userData.clumpRig as ClumpRig
    let tris = 0, visible = 0
    for (const m of meshes) { const n = m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; tris += n / 3 }
    const e: any = makeEntity('clump', 0, 0); if (l3) applyL3Variant(e)
    initClump({ map: { inf: { ox: 0, oy: 0 } }, player: {} } as any, e)
    for (const ph of ['roam', 'hunt', 'windup', 'grab', 'devour', 'fasting', 'pounce', 'pullup', 'selfharm'] as const) {
      Object.assign(e.cl, { phase: ph, speed: ph === 'hunt' ? 5 : 0.5, arm: ph === 'grab' ? 1 : 0, armLen: 1.6, mouth: ph === 'devour' ? 1 : 0, wind: ph === 'windup' ? 1 : 0, sit: ph === 'fasting' ? 1 : 0, ceil: ph === 'pounce' ? 0.6 : 0 })
      animateClump(g, e, 1.3, 0, 2.8)
    }
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible) visible++ })
    const skinned = meshes.filter((m) => (m as THREE.SkinnedMesh).isSkinnedMesh)
    ok(meshes.length <= 24 && visible <= 8 && tris <= (l3 ? 13000 : 12000), `${l3 ? 'L3' : '普通'} seed${seed}：${meshes.length} 网格（可见 ${visible}），${Math.round(tris)} 三角面`)
    if (seed === 1) {
      ok(skinned.length === 1 && !!(skinned[0].geometry.attributes.uv) && !!(skinned[0].geometry.attributes.skinWeight), '躯体为带 UV/蒙皮权重的单个 SkinnedMesh')
      ok(!!(rig.mat.map) && rig.mat.vertexColors, '程序化 Canvas 皮肤贴图 + 顶点色 AO/肤色')
      ok(rig.weapons.squirt.visible === false || l3, '普通肢团不显示武器')
      // 抓取时主臂伸到玩家附近
      Object.assign(e.cl, { phase: 'grab', arm: 1, armLen: 2.6, mouth: 0, wind: 0, ceil: 0, speed: 0 })
      animateClump(g, e, 2, 0, 3); g.updateMatrixWorld(true)
      const wrist = rig.main.b[rig.main.b.length - 1]
      const hand = new THREE.Vector3(); wrist.getWorldPosition(hand)
      const sc = e.def.scale ?? 1
      ok(Math.abs(hand.x - 2.6 / sc) < 0.6 && hand.y > 0.2, `主臂甩出约 ${(hand.x * sc).toFixed(2)}m（目标 2.6m）`)
      Object.assign(e.cl, { phase: 'roam', arm: 0 }); animateClump(g, e, 2, 0, 3); g.updateMatrixWorld(true)
      wrist.getWorldPosition(hand)
      ok(hand.x < 0.7, `主臂平时盘在团块里（腕部 x=${hand.x.toFixed(2)}）`)
    }
  }
}

if (fails) { console.error(`\n${fails} 项未通过`); process.exit(1) }
console.log('\n肢团行为与模型验收全部通过')
