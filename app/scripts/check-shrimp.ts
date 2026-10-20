// v81：旱虾（Entity 20）重制——行为机制 + 模型无头验收（模拟引擎：空旷平面，可选一片湿地 / 一堵墙）
// 运行：npm run check:shrimp
import * as THREE from 'three'
import { makeEntity, ENTITIES, type Entity } from '../src/game/entities'
import {
  initShrimp, updateShrimp, canSplit, findShrimpPrey, devourShrimp, catchShrimp, releaseShrimp, shrimpWetAt, shrimpSize,
  SHRIMP_BAIT_TIME, SHRIMP_LOCAL_CAP, SHRIMP_LEVEL_CAP, SHRIMP_SPLIT_TIME,
} from '../src/game/engine/shrimpAI'
import { beginDullerFrame, initDuller, resetDullerFrame, updateDuller } from '../src/game/engine/dullerAI'
import { ITEMS } from '../src/game/content/items'
import { NPCS } from '../src/game/content/npcs'
import { buildShrimpMesh, buildShrimpItemMesh, animateShrimp, animateShrimpDeath, type ShrimpRig } from '../src/game/renderer/shrimpMesh'
let fails = 0, checks = 0
const ok = (c: boolean, m: string) => { checks++; console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
const W = 40
function world(opts: { wet?: [number, number, number, number]; wall?: number } = {}) {
  resetDullerFrame()
  const msgs: string[] = []
  const wet = new Uint8Array(W * W), liquid = new Uint8Array(W * W)
  if (opts.wet) { const [x0, y0, x1, y1] = opts.wet; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) wet[y * W + x] = 1 }
  const inv: string[] = []
  const eng: any = {
    levelDef: { id: 1 },
    player: { x: 2, y: 2, z: 0, hp: 100, stamina: 100, sanity: 100, slowT: 0, yaw: 0 },
    map: { entities: [] as Entity[], items: [] as any[], w: W, h: W, wet, liquid },
    input: { sprint: false }, dev: { invisible: false }, camShake: 0, hurt: 0, yaw: Math.PI,
    inv, invCap: 10,
    msg: (t: string) => msgs.push(t),
    los(x0: number, y0: number, x1: number, y1: number) {
      if (opts.wall === undefined) return true
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 20)
      for (let i = 1; i < n; i++) { const x = x0 + (x1 - x0) * i / n; if (x >= opts.wall && x < opts.wall + 1) return false }
      return true
    },
    viewAngle(x: number, y: number) { const a = Math.atan2(y - this.player.y, x - this.player.x); let d = Math.abs(a - this.yaw); if (d > Math.PI) d = 2 * Math.PI - d; return d },
    hasItem: () => false,
    addItem(t: string) { if (inv.length >= this.invCap) return false; inv.push(t); return true },
    entityWalkH: () => 0,
    wanderTarget(e: Entity) { const a = Math.random() * 6.28; e.targetX = Math.min(W - 1, Math.max(1, e.x + Math.cos(a) * 2)); e.targetY = Math.min(W - 1, Math.max(1, e.y + Math.sin(a) * 2)); e.stateT = 3 },
    wanderDeflect(e: Entity) { this.wanderTarget(e) },
    stepEntity(e: Entity, sp: number, dt: number) { const dx = e.targetX - e.x, dy = e.targetY - e.y, d = Math.hypot(dx, dy); if (d < 0.05) return true; const k = Math.min(d, sp * dt) / d; e.x += dx * k; e.y += dy * k; return false },
    faceToward(e: Entity, x: number, y: number) { e.facing = Math.atan2(y - e.y, x - e.x) },
    hurtPlayer(dmg: number) { this.hurt += dmg; this.player.hp -= dmg },
  }
  return { eng, msgs }
}
let nid = 1000
const spawn = (eng: any, x: number, y: number, type = 'dryshrimp') => {
  const e = makeEntity(type, x, y); e.id = nid++; eng.map.entities.push(e)
  if (type === 'dryshrimp') initShrimp(e)
  if (type === 'duller') initDuller(eng, e, null)
  return e
}
function run(eng: any, secs: number, each?: (t: number) => void) {
  const dt = 1 / 30
  for (let t = 0; t < secs; t += dt) {
    each?.(t); beginDullerFrame(eng, dt)
    for (const e of [...eng.map.entities]) {
      if (e.dead) { e.deathT -= dt; continue }
      e.stateT -= dt; e.attackCd -= dt
      const d = Math.hypot(e.x - eng.player.x, e.y - eng.player.y)
      if (e.def.type === 'dryshrimp') updateShrimp(eng, e, dt, d)
      if (e.def.type === 'duller') updateDuller(eng, e, dt, d, 1)
    }
    eng.map.entities = eng.map.entities.filter((e: Entity) => !(e.dead && e.deathT <= 0))
  }
}
const shrimps = (eng: any) => eng.map.entities.filter((e: Entity) => e.def.type === 'dryshrimp' && !e.dead)

// —— 设定不变项 ——
{
  const d = ENTITIES.dryshrimp
  ok(d.hp === 10 && d.damage === 0 && d.passive && d.noRetaliate, '基础设定不变：血量 10 / 无伤害 / 被动 / 不反击')
  ok(ITEMS.liveshrimp?.use === 'eat' && ITEMS.liveshrimp.value === ITEMS.dryshrimp.value, `新物品「活旱虾」可生吃（饥饿 +${ITEMS.liveshrimp?.value}，与旱虾相同）`)
  const tom: any = (NPCS as any).tom
  ok(!!tom?.barter?.some((b: any) => b.give === 'liveshrimp' && b.get === 'friedshrimp') && tom.barter.some((b: any) => b.give === 'dryshrimp' && b.get === 'friedshrimp'), 'Tom：旱虾 / 活旱虾都能换酥炸旱虾')
  ok(ENTITIES.duller.hunts?.includes('dryshrimp') && ENTITIES.deathmoth.hunts?.includes('dryshrimp'), '捕食者：钝人、死亡飞蛾')
  ok(['hound', 'faceling', 'skinstealer', 'wretch', 'clump'].every((t) => !ENTITIES[t]?.hunts?.includes('dryshrimp')), '猎犬 / 无面灵 / 窃皮者 / 悲尸 / 肢团不把旱虾当猎物')
  const sz = [1, 2, 3, 50, 99].map(shrimpSize)
  ok(sz.every((s) => s >= 0.88 && s <= 1.12) && new Set(sz.map((s) => s.toFixed(3))).size > 3, `个体体型 0.88–1.12（${sz.map((s) => s.toFixed(2)).join(' / ')}）`)
}
// —— 无害游荡 ——
{
  const { eng } = world()
  const e = spawn(eng, 10, 10); eng.player.x = 10.6; eng.player.y = 10
  const x0 = e.x, y0 = e.y; let phases = new Set<string>()
  run(eng, 60, () => phases.add(e.sh!.phase))
  ok(eng.hurt === 0, '贴身 60 秒：对玩家零伤害')
  ok(Math.hypot(e.x - x0, e.y - y0) > 0.3 && phases.has('crawl') && phases.has('rest'), `漫无目的地爬行，偶尔停下发呆（${[...phases].join('/')}）`)
}
// —— 两栖：湿地游泳更快、偏爱湿地 ——
{
  const { eng } = world({ wet: [20, 20, 30, 30] })
  ok(shrimpWetAt(eng, 25.5, 25.5) && !shrimpWetAt(eng, 5, 5), '湿地判定（m.wet / m.liquid）')
  const a = spawn(eng, 25, 25), b = spawn(eng, 5, 5)
  let sa = 0, sb = 0
  run(eng, 8, () => { if (a.sh!.phase === 'crawl') sa = Math.max(sa, a.sh!.speed); if (b.sh!.phase === 'crawl') sb = Math.max(sb, b.sh!.speed) })
  ok(a.sh!.swim > 0.9 && b.sh!.swim < 0.1, `湿地里离地游动（swim ${a.sh!.swim.toFixed(2)} / 陆地 ${b.sh!.swim.toFixed(2)}）`)
  ok(sa > sb * 1.45, `游泳速度约为爬行 1.6 倍（${sa.toFixed(2)} vs ${sb.toFixed(2)} m/s）`)
  const { eng: e2 } = world({ wet: [14, 10, 16, 12] })
  let wetHits = 0, picks = 0
  const c = spawn(e2, 11, 11)
  for (let i = 0; i < 200; i++) { c.x = 11; c.y = 11; c.stateT = 0; c.sh!.phase = 'crawl'; run(e2, 1 / 30); if (Math.hypot(c.targetX - 11, c.targetY - 11) > 0.2) { picks++; if (shrimpWetAt(e2, c.targetX, c.targetY)) wetHits++ } }
  ok(wetHits / picks > 0.3, `游荡选点偏爱附近湿地（${wetHits}/${picks}）`)
}
// —— 有丝分裂（封顶） ——
{
  const { eng, msgs } = world()
  const e = spawn(eng, 10, 10); e.facing = 0; eng.player.x = 12; eng.player.y = 10
  e.sh!.splitIn = 0
  const rnd = Math.random; Math.random = () => 0.1
  run(eng, 0.1); Math.random = rnd
  ok(e.sh!.phase === 'split', '分裂计时到点 → 进入分裂')
  let maxPinch = 0
  run(eng, SHRIMP_SPLIT_TIME + 0.3, () => { if (e.sh!.phase === 'split') maxPinch = Math.max(maxPinch, e.sh!.split) })
  const all = shrimps(eng)
  ok(all.length === 2, `约 ${SHRIMP_SPLIT_TIME} 秒后一分为二（现有 ${all.length} 只）`)
  const c = all.find((q: Entity) => q !== e)!
  ok(!!c && Math.abs(c.sh!.size - e.sh!.size) < 1e-9, '子体与母体完全相同（体型继承）')
  ok(!!c && c.sh!.grow < 1 && c.sh!.splitIn > 500, '子体从 0.78 体型长回 1，并重新计时（≥10 分钟）')
  ok(msgs.some((m) => m.includes('一分为二')), '近处提示：缢缩、拉长、一分为二')
  run(eng, 4); ok(e.sh!.grow === 1 && c.sh!.grow === 1, '3 秒后都长回原体型')
  // 局部封顶
  const w = world()
  for (let i = 0; i < SHRIMP_LOCAL_CAP; i++) spawn(w.eng, 10 + i, 10)
  ok(!canSplit(w.eng, w.eng.map.entities[0]), `半径 20m 内已有 ${SHRIMP_LOCAL_CAP} 只 → 不分裂`)
  const w2 = world()
  for (let i = 0; i < SHRIMP_LEVEL_CAP; i++) spawn(w2.eng, 1 + (i % 8) * 25 / 8 * 1.2 + (i >= 8 ? 0 : 0), 1 + Math.floor(i / 8) * 18)
  const lone = w2.eng.map.entities[0]
  ok(!canSplit(w2.eng, lone), `本层总数达到 ${SHRIMP_LEVEL_CAP} 只 → 不分裂`)
  const simultaneous = world()
  for (let i = 0; i < 3; i++) {
    const parent = spawn(simultaneous.eng, 10 + i, 10)
    parent.sh!.phase = 'split'; parent.sh!.t = SHRIMP_SPLIT_TIME - .001
  }
  run(simultaneous.eng, 1 / 30)
  ok(shrimps(simultaneous.eng).length === SHRIMP_LOCAL_CAP, '多只同时完成分裂也不突破局部上限')
  const w4 = world(); const h = spawn(w4.eng, 10, 10); spawn(w4.eng, 11, 10, 'duller')
  ok(!canSplit(w4.eng, h), '捕食者在旁边时不分裂')
  // 长时间封顶：一只旱虾 2 小时后不超过局部上限
  const w5 = world(); spawn(w5.eng, 20, 20)
  for (const q of w5.eng.map.entities) q.sh!.splitIn = 1
  run(w5.eng, 7200, () => { for (const q of w5.eng.map.entities) if (q.sh && q.sh.splitIn > 60 && Math.random() < 0.001) q.sh.splitIn = 1 })
  const n5 = shrimps(w5.eng).length
  ok(n5 >= 2 && n5 <= SHRIMP_LEVEL_CAP, `一只旱虾 2 小时（加速分裂）后 ${n5} 只：会繁殖但不超过全层上限 ${SHRIMP_LEVEL_CAP}`)
}
// —— 受惊：被打弹窜，不反击 ——
{
  const { eng } = world()
  const e = spawn(eng, 10, 10); eng.player.x = 9; eng.player.y = 10
  e.hp -= 3; run(eng, 1 / 30)
  ok(e.sh!.phase === 'startle', '被打 → 受惊弹窜')
  const x0 = e.x; run(eng, 1)
  ok(e.x - x0 > 1.2, `弹窜方向背离威胁、速度快（1 秒 ${(e.x - x0).toFixed(2)} 米）`)
  ok(eng.hurt === 0, '受惊也不反击')
  const w = world(); const s2 = spawn(w.eng, 10, 10); s2.sh!.phase = 'split'; s2.sh!.split = 0.5; s2.sh!.t = 2
  s2.hp -= 2; run(w.eng, 1 / 30)
  ok(s2.sh!.phase === 'startle' && s2.sh!.split === 0, '分裂中被打 → 中断分裂')
}
// —— 活抓 ——
{
  const { eng, msgs } = world()
  const e = spawn(eng, 3, 2)
  ok(catchShrimp(eng, e) && eng.inv.includes('liveshrimp'), '活抓：背包获得「活旱虾」')
  ok(e.dead && e.deathT === 0 && e.sh!.caught && eng.map.items.length === 0, '活抓直接移除实体，不播死亡动画、不掉落')
  ok(msgs.some((m) => m.includes('活旱虾')), '提示：捞起了旱虾')
  const w = world(); w.eng.invCap = 0; const f = spawn(w.eng, 3, 2)
  ok(!catchShrimp(w.eng, f) && !f.dead, '背包满：抓不了，旱虾留在原地')
}
// —— 诱饵 + 捕食 ——
{
  const { eng } = world()
  const bait = releaseShrimp(eng, 10, 10, 0)
  ok(bait.sh!.bait === SHRIMP_BAIT_TIME && bait.state === 'idle', `放生的活旱虾作为诱饵 ${SHRIMP_BAIT_TIME} 秒`)
  run(eng, SHRIMP_BAIT_TIME + 1)
  ok(bait.sh!.bait === 0 && !bait.dead, '诱饵时效过后变回普通旱虾')
  const w = world()
  const pred = spawn(w.eng, 5, 5, 'deathmoth')
  const far = releaseShrimp(w.eng, 13, 5, 0), near = spawn(w.eng, 8, 5)
  ok(findShrimpPrey(w.eng, pred, 9, 12) === far, '诱饵优先于更近的普通旱虾')
  ok(findShrimpPrey(w.eng, pred, 9, 12, true) === far && findShrimpPrey(w.eng, pred, 9, 6, true) === null, 'baitOnly：只认诱饵，且受诱饵半径限制')
  devourShrimp(w.eng, pred, near)
  ok(near.dead && near.sh!.eater === pred && w.eng.map.items.length === 0, '被捕食：整只吃掉、不掉落、记下捕食者（渲染缩进嘴里）')
  ok(findShrimpPrey(w.eng, spawn(w.eng, 8, 6, 'deathmoth'), 9, 12) !== near, '已被吃掉的不再被争抢')
}
// —— 钝人捕食 ——
{
  const { eng, msgs } = world(); eng.player.x = 12; eng.player.y = 15; eng.yaw = Math.PI
  const du = spawn(eng, 10, 10, 'duller'), q = spawn(eng, 14, 10)
  const seen = new Set<string>(); let held = false, spookAfter = 0
  run(eng, 10, () => { seen.add(du.dl!.phase); if (q.sh?.phase === 'held') held = true; if (q.dead && !spookAfter) spookAfter = du.dl!.spook })
  ok(seen.has('feed'), `钝人游荡时发现 8m 内旱虾 → 捕食（${[...seen].join('→')}）`)
  ok(held && q.dead && q.sh!.eater === du, '走到跟前按住（旱虾挣扎）后吃掉')
  ok(spookAfter > 3, `吃完后约 4 秒不打玩家主意（${spookAfter.toFixed(1)}）`)
  ok(msgs.some((m) => m.includes('钝人')), '近处提示：钝人捞起旱虾')
  // 诱饵：潜伏中的钝人被放生的活旱虾引开
  const w = world({ wall: 15 }); w.eng.player.x = 14; w.eng.player.y = 10; w.eng.yaw = Math.PI
  const d2 = spawn(w.eng, 18, 12, 'duller')
  run(w.eng, 0.6)
  const lurking = d2.dl!.phase === 'lurk'
  const b = releaseShrimp(w.eng, 20, 12, 0)
  const ph = new Set<string>(); run(w.eng, 6, () => ph.add(d2.dl!.phase))
  ok(lurking && ph.has('feed') && b.dead, `潜伏的钝人被诱饵引开并吃掉它（${lurking ? 'lurk' : d2.dl!.phase}→${[...ph].join('→')}）`)
  ok(w.eng.hurt === 0 && d2.dl!.spook >= 10, `吃诱饵后约 14 秒不再下手（spook ${d2.dl!.spook.toFixed(1)}）`)
  // 钝人被打：放开按住的旱虾
  const w2 = world(); w2.eng.player.x = 30; w2.eng.player.y = 30
  const d3 = spawn(w2.eng, 10, 10, 'duller'), q3 = spawn(w2.eng, 11, 10)
  run(w2.eng, 8, (t) => { if (q3.sh!.phase === 'held' && d3.hp === d3.def.hp) d3.hp -= 5 })
  run(w2.eng, 0.2); ok(d3.hp < d3.def.hp && !q3.dead && q3.sh!.phase !== 'held', `钝人挨打逃走 → 旱虾挣脱逃开（${q3.sh!.phase}）`)
}
// —— 模型 ——
{
  const tris = (o: THREE.Object3D) => { let t = 0, n = 0; o.traverse((m: any) => { if (m.isMesh) { n++; const g = m.geometry; t += (g.index ? g.index.count : g.attributes.position.count) / 3 } }); return { t: Math.round(t), n } }
  const g = buildShrimpMesh(3)
  const rig = g.userData.shrimpRig as ShrimpRig
  const st = tris(g)
  ok(st.n === 8, `实体 8 个网格（壳 / 鳍 / 2 眼柄 / 2 眼球 / 2 前附肢）：${st.n}`)
  ok(st.t > 3000 && st.t < 9000, `三角面 ${st.t}（预算 < 9000）`)
  const box = new THREE.Box3().setFromObject(g), sz = box.getSize(new THREE.Vector3())
  ok(sz.x > 0.6 && sz.x < 0.85 && sz.y < 0.2 && sz.z > 0.25 && sz.z < 0.45, `体长 ${sz.x.toFixed(2)}m（含尾叉与前附肢）· 高 ${sz.y.toFixed(2)}m · 翼展 ${sz.z.toFixed(2)}m`)
  ok(box.min.y > -0.02 && box.min.y < 0.03, `贴地（最低点 ${box.min.y.toFixed(3)}m）`)
  const fins = g.getObjectByName('shrimpFins') as THREE.Mesh
  ok(!!fins.geometry.getAttribute('aFin') && fins.geometry.attributes.position.count / 3 >= 22 * 18, '11 对鳍片 + 6 片尾扇合并为单个网格（aFin 转轴/相位属性）')
  let key = ''
  try { key = (fins.material as THREE.Material).customProgramCacheKey() } catch { key = '' }
  ok(key.includes('shrimpFin'), '鳍片材质挂上划水着色器')
  const e: any = { id: 3, state: 'wander', animT: 0, sh: { phase: 'crawl', speed: 0.36, swim: 0, size: 1, grow: 1, split: 0 } }
  animateShrimp(g, e, 1, 0); animateShrimp(g, e, 1.5, 0)
  const flapCrawl = rig.u!.sFlap.value
  e.sh.swim = 1; animateShrimp(g, e, 2, 0)
  ok(rig.u!.sFlap.value > flapCrawl && rig.root.position.y > 0.03, `游泳：划水幅度更大（${flapCrawl.toFixed(2)}→${rig.u!.sFlap.value.toFixed(2)}）并离地上浮 ${rig.root.position.y.toFixed(3)}m`)
  e.sh = { phase: 'split', split: 0.8, speed: 0, swim: 0, size: 1, grow: 1 }; animateShrimp(g, e, 2.5, 0)
  ok(rig.u!.sPinch.value > 0.7 && rig.root.scale.x > 1.4, `分裂：中段缢缩 ${rig.u!.sPinch.value.toFixed(2)} · 拉长 ×${rig.root.scale.x.toFixed(2)}`)
  const pred: any = { x: 1, y: 0, z: 0, def: { type: 'duller' } }
  const dead: any = { x: 0, y: 0, sh: { eater: pred } }
  animateShrimpDeath(g, dead, 0.9, 0)
  ok(g.scale.x < 0.2 && g.position.x > 0.7 && g.position.y > 0.6, '被钝人吃掉：缩小并被送到它手里/嘴边的高度')
  const g2 = buildShrimpMesh(4); animateShrimpDeath(g2, { x: 0, y: 0, sh: {} } as any, 1, 0)
  ok(Math.abs((g2.userData.shrimpRig as ShrimpRig).root.rotation.x - Math.PI) < 1e-6, '被打死：翻肚')
  for (const t of ['dryshrimp', 'liveshrimp', 'friedshrimp']) {
    const it = buildShrimpItemMesh(t), s = tris(it), b = new THREE.Box3().setFromObject(it).getSize(new THREE.Vector3())
    ok(s.n === 3 && s.t < 9000 && b.x > 0.2 && b.x < 0.45, `物品「${ITEMS[t].name}」：${s.n} 网格 / ${s.t} 面 / 长 ${Math.max(b.x, b.z).toFixed(2)}m`)
  }
}
console.log(`\n${checks - fails}/${checks} passed`)
if (fails) process.exit(1)
