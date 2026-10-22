/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// 爆酸者（Entity 11）重制——机制无头验收（真实 Engine + 手搭地图）。运行：npm run check:burster
import { createCanvas } from '@napi-rs/canvas'
import { makeEntity, type Entity } from '../src/game/entities'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256) },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const { look } = await import('../src/game/core/renderer3d')
const { audio } = await import('../src/game/core/audio')
const { levelDefOf } = await import('../src/game/levels')
const { ITEMS } = await import('../src/game/content/items')
const { ENTITIES } = await import('../src/game/entities')
const W = await import('../src/game/engine/bursterAI')
const { BURSTER: B } = W
for (const k of Object.keys(audio)) if (typeof (audio as any)[k] === 'function') (audio as any)[k] = () => {}

let fails = 0, n = 0
const ok = (c: unknown, m: string) => { n++; console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
const DT = 1 / 30

function world() {
  const eng: any = new Engine(), S = 48, N = S * S, zero = () => new Uint8Array(N)
  eng.player.level = 3
  eng.map = { w: S, h: S, tiles: zero().fill(1), structures: [], items: [], lights: [], exits: [], entities: [] as Entity[], spawn: { x: 24, y: 24 },
    wet: zero(), elev: zero(), outdoor: zero(), step: zero(), crawl: zero(), ceiling: zero(), up: zero(), upWall: zero(), up2: zero(), upWall2: zero(), stair: new Int32Array(N),
    liquid: zero(), seaFloor: new Float32Array(N), floors: 1, dn: zero(), dnWall: zero(), tint: zero() }
  const m = eng.map
  for (let i = 0; i < S; i++) { m.tiles[i] = 0; m.tiles[(S - 1) * S + i] = 0; m.tiles[i * S] = 0; m.tiles[i * S + S - 1] = 0 }
  eng.explored = new Uint8Array(N)
  const p = eng.player
  Object.assign(p, { level: 3, x: 20.5, y: 24.5, z: 0, floor: 0, hp: 100, sanity: 100, facing: 0, flashlight: false, battery: 100 })
  look.yaw = 0; look.pitch = 0
  const msgs: string[] = []; const msg0 = eng.msg.bind(eng); eng.msg = (t: string, k?: any) => { msgs.push(t); msg0(t, k) }
  let deathCause = ''
  eng.emit = (ev: any) => { if (ev.kind === 'dead') deathCause = ev.text }
  eng.persist = () => {}
  const tick = () => { W.bursterAmbient(eng, DT); eng.updateEntities(DT, 1); eng.time = (eng.time ?? 0) + DT }
  const run = (secs: number, each?: () => void) => { for (let t = 0; t < secs && !eng.over; t += DT) { each?.(); tick() } }
  const until = (test: () => boolean, secs = 20, each?: () => void) => { for (let t = 0; t < secs && !test() && !eng.over; t += DT) { each?.(); tick() } return test() }
  const spawn = (x = 30.5, y = 24.5) => { const e = makeEntity('burster', x, y, 0); e.facing = Math.PI; m.entities.push(e); return e }
  const acid = () => W.bursterFrame(eng).acid
  return { eng, m, p, msgs, tick, run, until, spawn, acid, death: () => deathCause }
}

// ===== 定义与生成 =====
{
  ok(ENTITIES.burster?.name === '爆酸者' && ENTITIES.burster.hp === B.hp, '实体定义：爆酸者 120 血')
  const l3 = levelDefOf(3)!.entities.find((x) => x.type === 'burster')
  ok(l3 && l3.min === 1 && l3.max === 1, 'L3 生成池：单只出现（min=max=1）')
  const others = [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11].filter((id) => levelDefOf(id)?.entities.some((x) => x.type === 'burster'))
  ok(others.length === 0, `只在 L3 生成（其它层级：${others.join(',') || '无'}）`)
  ok(ITEMS.acidcallus?.name === '酸性胼胝', '新物品：酸性胼胝')
}

// ===== 休眠 → 惊醒 → 喷酸（不秒杀）→ 等待 → 再喷 =====
{
  const { p, run, until, spawn, acid, eng } = world()
  p.x = 14.5 // 16m 外
  const e = spawn()
  run(3)
  ok(e.bu?.phase === 'sleep' && Math.abs(e.x - 30.5) < 0.01, '远处休眠：蜷着不动')
  p.x = 27.0 // 3.5m
  ok(until(() => e.bu!.phase === 'wake', 1), '活物进入 4m 视野就惊醒')
  ok(until(() => e.bu!.phase === 'burst', 2), '惊醒 1.4s 后弓背准备喷酸')
  const hp0 = p.hp
  ok(until(() => e.bu!.phase === 'wait', 3), '一轮喷完转入等待')
  ok(e.bu!.fired === B.globs, `一轮射出 ${B.globs} 滴酸液（${e.bu!.fired}）`)
  run(0.6)
  const instant = hp0 - p.hp, total = instant + acid().burn
  ok(total > 10 && total < 25 && p.hp > 50, `不秒杀：一轮约 15 点（直接 ${instant.toFixed(1)} + 灼烧余量 ${acid().burn.toFixed(1)}）`)
  ok(acid().blind > 0.5, `酸液糊脸：视野模糊（失明 ${acid().blind.toFixed(2)}）`)
  ok(e.hp === B.hp - B.selfHurt, `喷酸自伤 ${B.selfHurt}（${e.hp}）`)
  const hpWait = p.hp
  run(2)
  ok(p.hp < hpWait - 2, '持续灼烧：等待中血量继续下降')
  ok(Math.abs(e.x - 30.5) < 0.01, '喷完原地等待，不追上来')
  ok(until(() => e.bu!.phase === 'burst', 4), '水泡回涨后再喷一轮')
  void eng
}

// ===== 躲避：酸液按出手瞬间的位置瞄准，横移能躲开 =====
{
  const { p, until, spawn, acid } = world()
  p.x = 27.0
  const e = spawn()
  until(() => e.bu?.phase === 'burst' && e.bu.fired > 0, 5)
  p.y += 2.5
  until(() => e.bu!.phase === 'wait', 3)
  ok(acid().blind === 0 && p.hp > 97, `侧移 2.5m 躲开酸液（血 ${p.hp.toFixed(1)}）`)
}

// ===== 护脸：面罩挡 70%、夜视镜挡 40%，会被腐蚀 =====
const volley = (head?: string, dur?: number) => {
  const w = world()
  if (head) w.p.equip.head = { type: head, count: 1, dur }
  w.p.x = 27.0
  const e = w.spawn()
  w.until(() => e.bu?.phase === 'wait', 6)
  w.run(0.5)
  return { w, dmg: 100 - w.p.hp + w.acid().burn, blind: w.acid().blind }
}
{
  const bare = volley(), mask = volley('divemask'), nv = volley('nightvision')
  ok(Math.abs(mask.blind / bare.blind - 0.3) < 0.03, `潜水面罩：失明只剩 30%（${mask.blind.toFixed(2)} / ${bare.blind.toFixed(2)}）`)
  ok(Math.abs(nv.blind / bare.blind - 0.6) < 0.03, `夜视镜：失明只剩 60%（${nv.blind.toFixed(2)}）`)
  ok(mask.dmg < bare.dmg * 0.4 && nv.dmg < bare.dmg * 0.7, `伤害同样被挡（裸 ${bare.dmg.toFixed(1)} / 面罩 ${mask.dmg.toFixed(1)} / 夜视 ${nv.dmg.toFixed(1)}）`)
  const d = mask.w.p.equip.head?.dur
  ok(d === B.guardMax - B.guardWear * B.globs, `面罩被腐蚀：每滴 -${B.guardWear} 耐久（${d}）`)
  const worn = volley('divemask', 8)
  ok(worn.w.p.equip.head === null && worn.w.msgs.some((t) => t.includes('报废')), '耐久归零：面罩被蚀穿报废')
}

// ===== 洗眼 =====
{
  const { eng, p, until, spawn, acid, msgs } = world()
  p.hotbar[0] = { type: 'citywater', count: 2 }
  p.x = 27.0
  const e = spawn()
  until(() => e.bu?.phase === 'wait', 6)
  ok(acid().blind > 0.3, '先被糊眼')
  ok(W.bursterWash(eng, 'citywater') && acid().blind === 0 && acid().burn === 0, '市政自来水洗眼：失明与灼烧清零')
  ok(p.hotbar[0]?.count === 1, '洗眼消耗 1 瓶水')
  ok(!W.bursterWash(eng, 'citywater'), '没被糊眼时喝水照常是喝水')
  eng.squirtTank = 'water'; eng.squirtAmmo = 3; acid().blind = 0.5
  ok(W.bursterWash(eng, 'squirtgun') && eng.squirtAmmo === 2, '滋水枪里的清水也能洗眼（消耗 1 份）')
  void msgs
}

// ===== 休克与消化 =====
{
  const { eng, p, until, spawn, acid, death } = world()
  p.x = 27.0
  const e = spawn()
  until(() => e.bu?.phase === 'wait', 6)
  p.hp = 22; acid().blind = 0.9
  until(() => acid().shockT > 0, 1)
  ok(acid().shockT > 0 && W.bursterControlsPlayer(eng), '低血量且大半失明 → 休克倒地，无法移动')
  ok(until(() => e.bu!.phase === 'stalk', 4), '它爬过来准备消化')
  acid().burn = 0
  ok(until(() => eng.over, 8, () => { acid().burn = 0; p.hp = 22 }), '5 秒内没洗眼 → 死亡')
  ok(death().includes('消化'), `死因：${death()}`)
}
{
  const { eng, p, until, spawn, acid, run } = world()
  p.hotbar[0] = { type: 'almond', count: 1 }
  p.x = 27.0
  const e = spawn()
  until(() => e.bu?.phase === 'wait', 6)
  p.hp = 22; acid().blind = 0.9
  until(() => acid().shockT > 0, 1)
  run(2, () => { acid().burn = 0 })
  ok(W.bursterWash(eng, 'almond') && !W.bursterControlsPlayer(eng), '休克中用杏仁水洗眼：重新站起来')
  run(3, () => { acid().burn = 0; p.hp = Math.max(p.hp, 22) })
  ok(!eng.over, '洗过眼就不会被消化')
  void e
}

// ===== 水 =====
{
  const { eng, p, until, spawn, msgs } = world()
  p.x = 27.0
  const e = spawn()
  until(() => e.bu?.phase === 'burst' && e.bu.t > 0.2, 5)
  W.bursterSquirt(eng, e, 'water')
  ok(e.stunT >= B.waterStun - 0.01 && e.bu!.phase === 'wait' && e.bu!.fired === 0, '清水喷中鼓胀中的它：僵直，这一轮作废')
  ok(msgs.some((t) => t.includes('泡沫')), '清水反应提示')
  const hp0 = e.hp
  W.bursterSquirt(eng, e, 'almond')
  ok(hp0 - e.hp === B.almondDmg && e.bu!.scar, `杏仁水重度灼伤：-${B.almondDmg} 并留疤`)
}

// ===== 近战、结茧、重击破茧 =====
{
  const { eng, p, until, spawn, run, m, msgs } = world()
  p.x = 15
  const e = spawn(16.4, 24.5)
  W.bursterMelee(eng, e, 20, false)
  ok(e.bu!.phase === 'burst' && e.bu!.t > B.fireFrom - 0.3, '打休眠中的它：立刻爆一轮，几乎没有前摇')
  W.bursterMelee(eng, e, 70, false)
  ok(!e.dead && e.bu!.phase === 'cocoon', `血量降到 30% 以下：结茧而不是死亡（${e.hp}）`)
  until(() => e.bu!.phase === 'shell', 3)
  ok(e.bu!.phase === 'shell', '2.2s 后茧壳硬化完成')
  const hp1 = e.hp
  W.bursterMelee(eng, e, 80, false)
  ok(e.hp === hp1 && e.bu!.crack === 0 && msgs.some((t) => t.includes('弹开')), '普攻打茧：弹开，无效')
  // 通过真实 strike 路径走一次重击
  look.yaw = 0; p.facing = Math.atan2(e.y - p.y, e.x - p.x)
  eng.strike(30, { kind: 'pipe', heavy: true, broken: false, targets: 1, stun: 0.3, reach: 2 })
  ok(e.bu!.crack > 0.2, `重击（真实 strike 路径）在茧上砸出裂纹（${e.bu!.crack.toFixed(2)}）`)
  const kills = p.kills
  W.bursterMelee(eng, e, 30, true); W.bursterMelee(eng, e, 30, true)
  ok(e.dead && e.bu!.phase === 'broken', '重击打碎茧 → 死亡')
  ok(p.kills === kills + 1 && m.items.some((it: any) => it.type === 'acidcallus'), '计入击杀并掉落酸性胼胝')
  run(0.5)
  void run
}
{
  const { eng, until, spawn, run } = world()
  const e = spawn()
  e.hp = 30; W.bursterKillGuard(eng, e)
  until(() => e.bu!.phase === 'shell', 3)
  run(B.hatchT + 0.5)
  ok(e.bu!.phase === 'hatch' || e.bu!.phase === 'wait', '茧放着 90 秒不管：重新孵出来')
  ok(Math.abs(e.hp - B.hp * 0.6) < 1, `孵化后 60% 血（${e.hp}）`)
  const e2 = spawn(10, 10); e2.bu = undefined; W.bursterSquirt(eng, e2, 'almond'); e2.hp = 20; W.bursterKillGuard(eng, e2)
  until(() => e2.bu!.phase === 'shell', 3); run(B.hatchT + 0.5)
  ok(Math.abs(e2.hp - B.hp * 0.4) < 1, `被杏仁水烧伤留疤的，孵化后只有 40% 血（${e2.hp}）`)
}

// ===== 近身打爆水泡会溅酸 =====
{
  let splashed = 0
  for (let i = 0; i < 40; i++) {
    const { eng, p, spawn, acid } = world()
    p.x = 15
    const e = spawn(16.4, 24.5)
    W.bursterHear(e, 0, 0, 0); e.bu!.phase = 'wait'
    W.bursterMelee(eng, e, 5, false)
    if (acid().burn > 0) splashed++
  }
  ok(splashed > 6 && splashed < 28, `近身打醒着的它：约 40% 概率打爆水泡溅酸（${splashed}/40）`)
}

// ===== 地面酸液、噪声、脱离 =====
{
  const { eng, p, spawn, run, acid, until } = world()
  W.bursterFrame(eng).puddles.push({ x: p.x, y: p.y, z: 0, t: 0 })
  run(2)
  ok(acid().burn > 0 || p.hp < 100, '踩在地面酸液上会灼脚')
  W.bursterFrame(eng).puddles.length = 0
  const e = spawn(24.5, 24.5)
  p.x = 14
  eng.noiseEvent(22, 24.5, 8, true)
  ok(e.bu!.phase === 'wake', '5m 内的响动把它吵醒')
  p.x = 5; p.y = 5
  ok(until(() => e.bu!.phase === 'sleep', B.lose + 8), '看不见猎物 12 秒后重新蜷起来休眠')
}

// ===== 滋水枪酸液弹 =====
{
  const { eng, p, m, msgs, run, spawn } = world()
  p.hotbar[0] = { type: 'squirtgun', count: 1 }; p.hotbar[1] = { type: 'acidcallus', count: 1 }; p.selected = 0
  ok(eng.loadSquirt('acid') && eng.squirtTank === 'acid' && eng.squirtAmmo === 3 && !p.hotbar[1], '一块酸性胼胝挤进储罐 = 3 份酸液')
  const f = makeEntity('faceling', p.x + 2, p.y, 0); f.hp = 200; (f as any).def = { ...f.def, hp: 200 }; m.entities.push(f)
  const aimAt = (e: Entity) => { const dx = e.x - p.x, dy = e.y - p.y; look.yaw = Math.atan2(-dx, -dy); look.pitch = -0.15; (look as any).rayX = 0; (look as any).rayY = 0; (look as any).rayZ = 0; p.facing = Math.atan2(dy, dx) }
  aimAt(f); eng.squirt()
  ok(200 - f.hp === B.acidShot && eng.squirtAmmo === 2, `酸线命中：直接 ${B.acidShot} 伤害（${(200 - f.hp).toFixed(0)}）`)
  const h1 = f.hp
  eng.dev.frozenAI = true
  run(B.acidDotT + 1)
  ok(Math.abs(h1 - f.hp - B.acidDot * B.acidDotT) < 0.5, `之后持续腐蚀 ${B.acidDot}/s × ${B.acidDotT}s（${(h1 - f.hp).toFixed(1)}）`)
  eng.dev.frozenAI = false
  m.entities.length = 0
  const b = spawn(p.x + 2, p.y); W.bursterHear(b, 0, 0, 0); b.bu!.phase = 'wait'
  aimAt(b); eng.squirt()
  ok(b.hp === B.hp && msgs.some((t) => t.includes('对它没用')), '酸液对爆酸者无效')
  const hp0 = p.hp
  const A = W.bursterFrame(eng).acid
  W.acidDrink(eng)
  ok(p.hp <= hp0 - 25 && A.blind > 0.3, '自饮酸液：重创并糊眼')
  ok(!W.bursterWash(eng, 'squirtgun'), '储罐里是酸液时不能拿来洗眼')
}

// Public L3 discovery and sanctuary protection also apply to the dedicated AI.
{const v=world(),e=v.spawn(v.p.x+2,v.p.y);v.tick();ok(e.encountered,'公共遭遇记录：发现爆酸者会解锁图鉴')}
{const v=world(),e=v.spawn(v.p.x+2,v.p.y);v.m.tint[Math.floor(e.y)*v.m.w+Math.floor(e.x)]=20;v.tick();ok(!e.bu&&e.state==='wander','圣所内先执行公共驱离，不开始喷酸')}
console.log(`\n${n - fails}/${n} 通过`)
if (fails) process.exit(1)
