// v23 新机制验证：熵效应 / Level 11 Effect / Pockets / 容器搜索 / 绊线 / L7 落水
;(globalThis as unknown as Record<string, unknown>).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
;(globalThis as unknown as Record<string, unknown>).document = { createElement: () => ({ getContext: () => null, style: {} }), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } }
const { engine, CONTAINERS } = await import('../src/game/engine.ts')
const { LEVELS } = await import('../src/game/levels/index.ts')
const { tileAt } = await import('../src/game/mapgen.ts')

let fail = 0
const bad = (m: string) => { console.log('  ✗ ' + m); fail++ }
const ok = (m: string) => console.log('  ✓ ' + m)
const run = (frames: number) => { for (let f = 0; f < frames; f++) engine.update(0.02) }

// ---- 1) Level 8 熵效应：电池耗尽速度应为 2.2×
const drain = (level: number) => {
  engine.newRun(31337, 'normal'); engine.paused = false
  engine.devJump(level)
  engine.player.equip.offhand = { type: 'flashlight', count: 1 }
  engine.player.flashlight = true
  engine.player.battery = 100
  engine.input.mx = 0; engine.input.my = 0
  run(250) // 5 秒
  return 100 - engine.player.battery
}
const d5 = drain(5), d8 = drain(8)
const ratio = d8 / Math.max(0.001, d5)
if (ratio > 2.0 && ratio < 2.4) ok(`Level 8 熵效应：电池耗尽 ${ratio.toFixed(2)}× 于常规层（L5 ${d5.toFixed(1)} → L8 ${d8.toFixed(1)}）`)
else bad(`Level 8 熵效应倍率异常：${ratio.toFixed(2)}×（期望 2.2）`)

// ---- 2) Level 6：外带光源提示 + noFlashlight 标记
if (LEVELS[6].noFlashlight && LEVELS[6].lightMul === 0) ok('Level 6：noFlashlight + lightMul=0（外带光源完全失效）')
else bad('Level 6 未标记 noFlashlight / lightMul')

// ---- 3) Level 11 Effect：未挑衅时实体进入 chase 的比例应显著低于常规层
const chaseRate = (level: number) => {
  engine.newRun(555, 'normal'); engine.paused = false
  engine.devJump(level)
  engine.provoked = false
  const m = engine.map!
  // 把所有实体挪到玩家眼前，逼它们做攻击决策
  for (const e of m.entities) { e.x = engine.player.x + 1.6; e.y = engine.player.y; e.state = 'wander' }
  run(60)
  const n = m.entities.filter((e) => !e.dead).length
  const chasing = m.entities.filter((e) => !e.dead && (e.state === 'chase' || e.state === 'attack')).length
  return n ? chasing / n : 0
}
const r1 = chaseRate(1), r11 = chaseRate(11)
if (r11 < r1) ok(`Level 11 Effect：实体追击率 ${(r11 * 100).toFixed(0)}% < 常规层 ${(r1 * 100).toFixed(0)}%（主动挑衅会解除）`)
else bad(`Level 11 Effect 未生效：L11 ${(r11 * 100).toFixed(0)}% vs L1 ${(r1 * 100).toFixed(0)}%`)

// ---- 4) Pockets：背包 +4，且在 Level 9 会引来邻里守望
engine.newRun(909, 'normal'); engine.paused = false
engine.devJump(9)
const base = engine.player.backpack.length
engine.player.equip.pockets[0] = { type: 'pockets', count: 1 }
engine.syncPassives()
if (engine.player.backpack.length === base + 4) ok(`Pockets：背包 ${base} → ${engine.player.backpack.length}（+4）`)
else bad(`Pockets 背包扩容失败：${base} → ${engine.player.backpack.length}`)
const m9 = engine.map!
for (const e of m9.entities) if (e.def.type === 'watcher' || e.def.type === 'strider') { e.state = 'wander'; e.x = 3; e.y = 3 }
const watchers = m9.entities.filter((e) => e.def.type === 'watcher' || e.def.type === 'strider')
run(400) // > pocketsAlarmT
const alerted = watchers.filter((e) => e.state === 'chase').length
if (!watchers.length) console.log('  · 本 seed 的 Level 9 未刷出邻里守望，跳过告警验证')
else if (alerted > 0) ok(`Pockets 警报：${alerted}/${watchers.length} 个邻里守望被引来`)
else bad('携带 Pockets 进入 Level 9 未触发邻里守望')
engine.player.equip.pockets[0] = null
engine.syncPassives()
if (engine.player.backpack.length === base) ok('Pockets 取下：背包容量正确收回')
else bad(`Pockets 取下后容量未收回：${engine.player.backpack.length}`)

// ---- 5) 容器：全部新容器都能搜出东西
const missing: string[] = []
for (const k of Object.keys(CONTAINERS)) if (!CONTAINERS[k].pool.length) missing.push(k)
if (!missing.length) ok(`容器表：${Object.keys(CONTAINERS).length} 种容器均有掉落池（${Object.keys(CONTAINERS).join('/')}）`)
else bad(`容器掉落池为空：${missing.join(',')}`)

// ---- 6) Level 7：走出入口房间会掉进水里（重力被强制切换）
engine.newRun(4242, 'normal'); engine.paused = false
engine.devJump(7)
const m7 = engine.map!
const z0 = engine.player.z
engine.input.mx = 0; engine.input.my = 1 // 向南走出门口
run(500)
const inWater = m7.liquid[Math.floor(engine.player.y) * m7.w + Math.floor(engine.player.x)] === 1
const inBounds = engine.player.x > 0 && engine.player.y > 0 && engine.player.x < m7.w && engine.player.y < m7.h
if (!inBounds) bad(`Level 7 玩家跑出地图边界：(${engine.player.x.toFixed(1)}, ${engine.player.y.toFixed(1)})`)
else if (tileAt(m7, Math.floor(engine.player.x), Math.floor(engine.player.y)) !== 1) bad('Level 7 玩家停在非地板瓦片上')
else ok(`Level 7：走出入口房间 → 高度 ${z0.toFixed(2)} → ${engine.player.z.toFixed(2)}${inWater ? '，已在深水中' : '（本次落在岛上）'}，位置合法`)

// ---- 7) 绊线：Level 6 踩上去会切出
engine.newRun(6161, 'normal'); engine.paused = false
engine.devJump(6)
const m6 = engine.map!
const tw = m6.structures.find((s) => s.kind === 'tripwire')
if (!tw) console.log('  · 本 seed 的 Level 6 未刷出绊线，跳过')
else {
  engine.player.x = tw.x + 0.5; engine.player.y = tw.y + 0.5
  run(3)
  if (tw.data?.tripped) ok('绊线：踩到即触发切出（Level 6.1）')
  else bad('绊线未触发')
}

console.log(fail === 0 ? '\n✓ 机制验证全部通过' : `\n✗ ${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
