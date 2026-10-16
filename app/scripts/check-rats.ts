// v79：尸鼠重制——行为机制无头验收（模拟引擎：空旷平面；可放一段铁栅栏 barfence）
// 运行：npm run check:rats
import { makeEntity, ENTITIES, applyL3Variant, type Entity } from '../src/game/entities'
import { initRat, resetRatFrame, updateRat, updateRatGear, ratMorphFor, placeGear, CAPY_HP, CAPY_LINES, type RatMorph } from '../src/game/engine/ratAI'
import { ITEMS } from '../src/game/content/items'
import { LEVELS } from '../src/game/levels'
import { buildRatMesh, animateRat, type RatRig } from '../src/game/renderer/ratMesh'
let fails = 0
let checks = 0
const ok = (c: boolean, m: string) => { checks++; console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
function world(levelId = 9, fence = false) {
  resetRatFrame()
  const msgs: string[] = []
  const structures: any[] = fence ? [{ kind: 'barfence', x: 4, y: -3, w: 0.3, h: 6, solid: true }] : []
  const eng: any = {
    levelDef: { id: levelId },
    player: { x: 0, y: 0, z: 0, hp: 100, slowT: 0, flashJamT: 0, flashlight: false },
    map: { entities: [] as Entity[], items: [] as any[], structures, w: 0, h: 0 },
    particles: [] as any[], events: [] as any[], noises: [] as any[],
    input: { sprint: false }, dev: { invisible: false }, camShake: 0, hurt: 0,
    msg: (t: string) => msgs.push(t),
    emit(ev: any) { this.events.push(ev) },
    blind: false,
    los(x0: number, y0: number, x1: number, y1: number) { return !(this.blind && (Math.hypot(x0 - this.player.x, y0 - this.player.y) < 0.01 || Math.hypot(x1 - this.player.x, y1 - this.player.y) < 0.01)) },
    meleeZOk: () => true,
    bloodParticles() {},
    noiseEvent(x: number, y: number, r: number) { this.noises.push({ x, y, r }) },
    wanderTarget(e: Entity) { e.targetX = e.x + (Math.random() - 0.5) * 2; e.targetY = e.y + (Math.random() - 0.5) * 2; e.stateT = 3 },
    stepEntity(e: Entity, sp: number, dt: number) {
      const dx = e.targetX - e.x, dy = e.targetY - e.y, d = Math.hypot(dx, dy); if (d < 0.05) return true
      const k = Math.min(d, sp * dt) / d; e.x += dx * k; e.y += dy * k; return false
    },
    faceToward(e: Entity, x: number, y: number) { e.facing = Math.atan2(y - e.y, x - e.x) },
    hurtPlayer(dmg: number) { this.hurt += dmg; this.player.hp -= dmg },
  }
  return { eng, msgs }
}
let nid = 100
function spawn(eng: any, x: number, y: number, capy = false, type = 'corpserat') {
  const e = makeEntity(type, x, y); e.id = nid++
  if (capy) applyL3Variant(e)
  eng.map.entities.push(e)
  if (type === 'corpserat') initRat(eng, e)
  return e
}
function run(eng: any, secs: number, each?: (t: number) => void) {
  const dt = 1 / 30
  for (let t = 0; t < secs; t += dt) {
    each?.(t)
    updateRatGear(eng, dt, 1)
    for (const e of eng.map.entities) {
      if (e.dead) continue
      e.attackCd -= dt; e.stateT -= dt; e.lungeT = Math.max(0, e.lungeT - dt)
      if (e.stunT > 0) { e.stunT -= dt; continue }
      if (e.def.type === 'corpserat') updateRat(eng, e, dt, Math.hypot(e.x - eng.player.x, e.y - eng.player.y), 1)
    }
  }
}

// —— 层级种群 ——
{
  const m = (id: number, def: any = {}) => ratMorphFor(id, def)
  const got: RatMorph[] = [m(2), m(3, { capybara: true }), m(5), m(8), m(8, { ceilingCrawler: true }), m(9)]
  ok(got.join('/') === 'hairless/capybara/hotel/cave/cave/common', `种群：L2 无毛 / L3 水豚 / L5 酒店正装 / L8 穴顶 / L9 常见（${got.join('/')}）`)
  ok(m(3, { ratMorph: 'hairless' }) === 'hairless' && m(2, { ratMorph: 'capybara' }) === 'capybara', '显式 ratMorph 优先于层级与派生标记')
  ok(m(9, { ratMorph: 'brown' }) === 'common' && m(9, { ratMorph: 'gray' }) === 'hairless', '旧 brown/gray 映射到 common/hairless')
  const w = (lv: number) => (LEVELS as any[]).find((l) => l.id === lv)?.entities?.find((e: any) => e.type === 'corpserat')?.w ?? 0
  ok(w(2) === 12 && w(3) === 5 && w(5) === 8 && w(8) === 14 && w(9) === 8, `栖息地权重未变（L2 ${w(2)} / L3 ${w(3)} / L5 ${w(5)} / L8 ${w(8)} / L9 ${w(9)}）`)
  ok(w(1) === 0, '不加入 Level 1')
  ok(ENTITIES.corpserat.hp === 26 && ENTITIES.corpserat.damage === 9, '基础数值：血量 26 / 伤害 9')
}
// —— 不惹它就不惹你 ——
{
  const { eng } = world()
  const e = spawn(eng, 4, 0)
  run(eng, 12)
  ok(eng.hurt === 0 && !e.provoked, '未激怒的尸鼠不攻击玩家')
}
// —— 冲刺靠近 → 四散逃开；慢慢靠近 → 站起来盯着你 ——
{
  const { eng, msgs } = world()
  const e = spawn(eng, 2.5, 0)
  eng.input.sprint = true
  run(eng, 0.2)
  const fled = e.rt!.phase === 'flee'
  run(eng, 1.5)
  ok(fled && Math.hypot(e.x, e.y) > 4, `冲刺靠近 → 四散逃开（距离 ${Math.hypot(e.x, e.y).toFixed(1)}m）`)
  ok(msgs.some((m) => m.includes('四散')), '逃开时提示「它们怕人」')
  const w2 = world(); const r2 = spawn(w2.eng, 2.6, 0)
  r2.rt!.phase = 'roam'
  let watched = false
  run(w2.eng, 4, () => { if (r2.rt!.phase === 'watch') watched = true; w2.eng.player.x = Math.min(0.2, w2.eng.player.x); })
  ok(watched, '慢慢走近 3m 内 → 站起来盯着你')
}
// —— 捕食死亡飞蛾，叼回墙缝 ——
{
  const { eng, msgs } = world()
  eng.player.x = 2; eng.player.y = -6; eng.blind = true
  const r = spawn(eng, 0, 0)
  const moth = spawn(eng, 5, 0, false, 'deathmoth'); moth.hp = 10
  let carried = false
  run(eng, 8, () => { if ((r.rt!.carry ?? 0) > 0) carried = true })
  ok(moth.dead, '扑杀死亡飞蛾')
  ok(carried && msgs.some((m) => m.includes('叼着')), '杀死后叼着猎物拖走')
}
// —— 激怒：整群记仇围攻，轮流咬，咬住脚踝减速 ——
{
  const { eng } = world()
  const a = spawn(eng, 3, 0), b = spawn(eng, 3.5, 1), c = spawn(eng, 3.2, -1)
  a.hp -= 5 // 被玩家打了一下
  const hitTimes: number[] = []
  let last = 0
  run(eng, 20, (t) => { if (eng.hurt > last) { hitTimes.push(t); last = eng.hurt } })
  ok(a.provoked && b.provoked && c.provoked, '一只被打 → 4m 内的同伴一同激怒')
  ok(hitTimes.length >= 6, `围攻咬伤玩家（${hitTimes.length} 口）`)
  let burst = 0
  for (let i = 1; i < hitTimes.length; i++) if (hitTimes[i] - hitTimes[i - 1] < 0.2) burst++
  ok(burst <= 1, '轮流上嘴（同一瞬间不会三只一起咬）')
  ok(eng.player.slowT > 0 || hitTimes.length > 0, '咬住脚踝拖慢移动')
  run(eng, 30)
  ok(a.provoked && a.rt!.phase === 'chase', '记仇：30 秒后仍不消气')
}
// —— 水豚种：数值、保持距离指挥、自言自语气泡 ——
{
  const { eng, msgs } = world(3)
  const k = spawn(eng, 7, 0, true)
  ok(k.rt!.morph === 'capybara' && k.hp === CAPY_HP, `水豚种血量 ${k.hp}`)
  let minD = 99, maxD = 0, bubbles = new Set<string>()
  run(eng, 20, (t) => { if (t > 3) { const d = Math.hypot(k.x, k.y); minD = Math.min(minD, d); maxD = Math.max(maxD, d) } if (k.rt!.bubbleT > 0) bubbles.add(k.rt!.bubbleText) })
  ok(k.rt!.phase === 'command', '看见玩家 → 进入指挥')
  ok(minD > 4.5 && maxD < 11, `保持距离（${minD.toFixed(1)}~${maxD.toFixed(1)}m），不正面纠缠`)
  ok(eng.noises.length >= 2, `用合成音把附近实体引向玩家（${eng.noises.length} 次）`)
  ok([...bubbles].some((b) => CAPY_LINES.command.includes(b)), `头顶气泡：${[...bubbles].slice(0, 2).join(' / ')}`)
  ok(eng.hurt === 0, '玩家不贴脸时它不咬人')
  ok(msgs.some((m) => m.includes('音箱')), '首次听见：提示胸前的自制音箱')
  // 被逼到身边才咬
  eng.player.x = k.x - 0.8; eng.player.y = k.y
  let bit = false
  run(eng, 1.5, () => { eng.player.x = k.x - 0.8; eng.player.y = k.y; if (eng.hurt > 0) bit = true })
  ok(bit, '被逼到身边才会咬一口')
}
// —— 水豚种：抱着栅栏磨牙 ——
{
  const { eng, msgs } = world(3, true)
  eng.player.x = -6; eng.blind = true
  const k = spawn(eng, 1, 0, true)
  let ground = false, gx = 0
  for (let i = 0; i < 6 && !ground; i++) { k.rt!.phaseT = 0; run(eng, 12, () => { if (!ground && k.rt!.phase === 'grind' && (k.rt!.grindT ?? 0) > 1) { ground = true; gx = k.x } }) }
  ok(ground && Math.abs(gx - 4.15) < 1.5, `走到坚不可摧的栅栏边磨牙（x=${gx.toFixed(2)}）`)
  ok(msgs.some((m) => m.includes('磨牙')), '磨牙的刮擦声提示')
}
// —— 水豚种：玩家不在附近时布雷（陷阱 + 炸弹，每只至多 3 件、炸弹 1 件）——
{
  const { eng } = world(3)
  eng.player.x = 60
  const k = spawn(eng, 0, 0, true)
  k.rt!.plantCd = 0
  run(eng, 240, () => { if (k.rt!.plantCd > 5 && k.rt!.phase === 'roam') k.rt!.plantCd = Math.min(k.rt!.plantCd, 1) })
  const gear = eng.map.ratGear ?? []
  ok(gear.length >= 2 && gear.length <= 3, `布下 ${gear.length} 件装置`)
  ok(gear.filter((g: any) => g.kind === 'bomb').length <= 1, '每只至多 1 枚炸弹')
}
// —— 电击陷阱 ——
{
  const { eng, msgs } = world(3)
  const owner = spawn(eng, 30, 0, true); const near = spawn(eng, 6, 0)
  eng.player.x = 0
  const g = placeGear(eng, { ...owner, x: 2, y: 0, z: 0 } as Entity, undefined, 'trap'); g.dud = false
  run(eng, 0.1)
  eng.player.x = 2
  run(eng, 0.1)
  ok(g.sprung && eng.hurt >= 8, `踩中电击陷阱：伤害 ${eng.hurt}`)
  ok(eng.player.slowT > 0 && eng.player.flashJamT > 0, '夹住减速 + 电弧让手电熄灭')
  ok(near.provoked, '附近尸鼠把你当成猎物')
  ok(msgs.some((m) => m.includes('电弧')), '提示文字')
  const w2 = world(3)
  const g2 = placeGear(w2.eng, { ...owner, x: 2, y: 0, z: 0 } as Entity, undefined, 'trap'); g2.dud = true
  w2.eng.player.x = 2; run(w2.eng, 0.1)
  ok(g2.sprung && w2.eng.hurt === 0 && w2.msgs.some((m) => m.includes('没接好')), '拙劣仿制：有的陷阱不生效')
  // 实体踩中：被夹住，尸鼠一拥而上
  const w3 = world(3); w3.eng.player.x = 50
  const hound = spawn(w3.eng, 8, 0, false, 'hound')
  const rat = spawn(w3.eng, 10, 0)
  const g3 = placeGear(w3.eng, { ...owner, x: 8, y: 0, z: 0 } as Entity, undefined, 'trap'); g3.dud = false
  run(w3.eng, 0.1)
  ok(g3.sprung && hound.stunT > 0 && rat.targetEnt === hound, '实体踩中 → 被夹住，尸鼠盯上它')
}
// —— 土制炸弹 ——
{
  const { eng, msgs } = world(3)
  const owner = spawn(eng, 30, 0, true)
  const g = placeGear(eng, { ...owner, x: 2, y: 0, z: 0 } as Entity, undefined, 'bomb'); g.dud = false
  eng.player.x = 0.8
  run(eng, 0.1)
  ok(g.fuse > 0 && msgs.some((m) => m.includes('嘀')), '靠近 1.8m → 「嘀嘀」倒计时')
  run(eng, 1.6)
  ok(eng.hurt >= 20 && !(eng.map.ratGear ?? []).includes(g), `留在原地被炸：伤害 ${eng.hurt.toFixed(0)}`)
  const w2 = world(3)
  const g2 = placeGear(w2.eng, { ...owner, x: 2, y: 0, z: 0 } as Entity, undefined, 'bomb'); g2.dud = false
  w2.eng.player.x = 0.8; run(w2.eng, 0.1)
  w2.eng.player.x = -4; run(w2.eng, 1.6)
  ok(w2.eng.hurt === 0, '听见嘀声立刻跑开 → 躲过')
  const w3 = world(3)
  const g3 = placeGear(w3.eng, { ...owner, x: 2, y: 0, z: 0 } as Entity, undefined, 'bomb'); g3.dud = true
  w3.eng.player.x = 1.5; run(w3.eng, 2)
  ok(w3.eng.hurt === 0 && w3.msgs.some((m) => m.includes('哑弹')), '哑弹只冒烟')
}
// —— 尸鼠肉 ——
{
  const it = ITEMS.ratmeat
  ok(!!it && it.use === 'eat' && it.value === 18, '「尸鼠肉」可食用（饥饿 +18）')
}
// —— v80：毛发壳层 + 水豚坐姿 ——
{
  const rig = (m: RatMorph) => buildRatMesh(m, 3).userData.ratRig as RatRig
  const tri = (ms: any[]) => ms.reduce((a, x) => a + x.geometry.attributes.position.count / 3, 0)
  const c = rig('common'), h = rig('hairless'), cp = rig('capybara')
  ok(c.fur.length >= 3 && h.fur.length === 0, `有毛种带毛壳（常见种 ${c.fur.length} 块），L2 无毛种没有`)
  ok(c.fur.every((f: any) => f.geometry.attributes.color.itemSize === 4 && f.material.alphaTest === 0.5 && !f.castShadow), '毛壳：顶点 alpha 分层裁切、不投影')
  ok(tri(cp.fur) > tri(c.fur) * 1.3, `水豚种毛更长更密（${tri(cp.fur) | 0} vs ${tri(c.fur) | 0} 面）`)
  ok(tri(c.fur) < 7000, `常见种毛壳三角面 ${tri(c.fur) | 0} < 7000（10m 外隐藏）`)
  const g = buildRatMesh('capybara', 4), r = g.userData.ratRig as RatRig
  const e = spawn(world(3).eng, 0, 0, true); e.rt!.phase = 'command'; e.state = 'investigate'
  animateRat(g, e, 1, 0); animateRat(g, e, 1.1, 0)
  ok(r.body.rotation.z > 0.5, `水豚种停下指挥时坐在后腿上（前身抬 ${r.body.rotation.z.toFixed(2)} rad）`)
  e.animT += 0.3; animateRat(g, e, 1.2, 0)
  ok(r.body.rotation.z < 0.3, '一走动就放下前身')
}

// —— 水豚种受伤初始化统一属性但不恢复伤势 ——
{
  const { eng } = world(3)
  const e = makeEntity('corpserat', 0, 0); e.id = 9999; e.def.ratMorph = 'capybara'; e.hp = 7; eng.map.entities.push(e)
  initRat(eng, e)
  ok(e.def.hp === 45 && e.def.damage === 10 && e.def.speed === 2.8 && e.hp === 7, '受伤水豚统一最大血量45、伤害10、速度2.8且不恢复生命')
}
// —— 同 XY 的上层实体不能踩中下层装置，也不会被隔层炸伤 ——
{
  const { eng } = world(3)
  eng.player.x = 20
  const rat = spawn(eng, 0, 0, true), above = spawn(eng, 0, 0, false, 'hound')
  above.z = 4; const hp = above.hp
  const trap = placeGear(eng, rat, undefined, 'trap'); trap.dud = false
  updateRatGear(eng, 1 / 30, 1)
  ok(!trap.sprung && above.hp === hp, '上层实体不会踩中下层电击陷阱')
  eng.map.ratGear = []
  const bomb = placeGear(eng, rat, undefined, 'bomb'); bomb.dud = false
  updateRatGear(eng, 1 / 30, 1)
  ok(bomb.fuse === -1, '上层实体不会触发下层炸弹')
  bomb.fuse = .01; updateRatGear(eng, 1 / 30, 1)
  ok(above.hp === hp && rat.hp < CAPY_HP, '炸弹仅伤害同层附近实体')
}
console.log(fails ? `\n${fails}/${checks} 项未通过` : `\n${checks} 项全部通过`)
process.exit(fails ? 1 : 0)
