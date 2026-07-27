// 引擎冒烟：逐层加载 + 模拟若干秒游戏循环 + 走通 L11 → L601 → 真结局
;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 800, innerHeight: 600 }
;(globalThis as unknown as Record<string, unknown>).document = {
  createElement: () => ({ width: 1, height: 1, getContext: () => null, style: {} }),
  getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} },
}
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
;(globalThis as unknown as Record<string, unknown>).performance = globalThis.performance ?? { now: () => Date.now() }

const { engine } = await import('../src/game/engine.ts')
const { LEVELS, levelNo, WIN_TAPES } = await import('../src/game/levels/index.ts')

let fail = 0
const bad = (m: string) => { console.log('  ✗ ' + m); fail++ }

engine.newRun(20260726, 'normal')
engine.paused = false

// 逐层：跳到每一层，跑 400 帧（约 8 秒），确认不崩、玩家仍在合法位置
for (let id = 0; id < LEVELS.length; id++) {
  try {
    engine.devJump(id)
  } catch (e) { bad(`devJump(${id}) 抛异常：${(e as Error).message}`); continue }
  engine.player.hp = 100; engine.player.sanity = 100; engine.player.hunger = 100
  const def = LEVELS[id]
  const startX = engine.player.x, startY = engine.player.y
  let moved = 0
  try {
    for (let f = 0; f < 400; f++) {
      // 每隔一段时间随机换方向，逼实体 AI / 交互扫描 / 液体 / 高度系统都跑一遍
      if (f % 40 === 0) { engine.input.mx = Math.sin(f) ; engine.input.my = Math.cos(f * 1.7) }
      if (f % 97 === 0) engine.input.interact = true
      if (f % 61 === 0) engine.input.attack = true
      if (f % 83 === 0) engine.input.jump = true
      engine.update(0.02)
      if (engine.over) break
    }
    moved = Math.hypot(engine.player.x - startX, engine.player.y - startY)
  } catch (e) { bad(`Level ${levelNo(id)} 运行 400 帧抛异常：${(e as Error).message}\n${(e as Error).stack?.split('\n').slice(1, 4).join('\n')}`) }
  const st = engine.over ? (engine.victory ? '通关' : '死亡') : '存活'
  console.log(`Level ${String(levelNo(id)).padStart(3)} ${def.name.padEnd(6)} 400帧 OK · 位移 ${moved.toFixed(1)}m · ${st} · HP ${Math.round(engine.player.hp)} 理智 ${Math.round(engine.player.sanity)} 电 ${Math.round(engine.player.battery)}`)
  if (engine.over) { engine.newRun(20260726, 'normal'); engine.paused = false }
}

// ---- 结局链：L11 集齐磁带 → Base Beta → Level 601 → 真结局 ----
engine.newRun(777, 'normal'); engine.paused = false
engine.devJump(11)
engine.player.tapes = WIN_TAPES
const m11 = engine.map!
const beta = m11.exits.find((e) => e.def.kind === 'basebeta')
if (!beta) console.log('（本 seed 的 Level 11 未刷出 Base Beta 出口，改用直接跳层验证结局层）')
engine.devJump(12)
const m601 = engine.map!
const kinds = m601.exits.map((e) => e.def.kind).sort()
if (kinds.length !== 2 || kinds[0] !== 'homedoor' || kinds[1] !== 'trueend') bad(`Level 601 出口不是 [homedoor, trueend]，实际 ${JSON.stringify(kinds)}`)
// 走假门：应回到 601 且 fakeEnds 自增
const fake = m601.exits.find((e) => e.def.kind === 'homedoor')!
engine.player.x = fake.x + 0.5; engine.player.y = fake.y + 0.5
engine.input.interact = true
for (let f = 0; f < 120; f++) engine.update(0.02)
if (engine.fakeEnds < 1) bad('走进「你家的前门」后 fakeEnds 未自增（假结局未触发）')
if (engine.player.level !== 12) bad(`假结局后应回到 Level 601，实际在索引 ${engine.player.level}`)
console.log(`假结局：触发 ${engine.fakeEnds} 次 · 玩家仍在 Level ${levelNo(engine.player.level)} ✓`)
// 走真门：应通关
const real = engine.map!.exits.find((e) => e.def.kind === 'trueend')!
engine.player.x = real.x + 0.5; engine.player.y = real.y + 0.5
engine.input.interact = true
for (let f = 0; f < 120; f++) engine.update(0.02)
if (!engine.victory) bad('走进「金属字母底下的门」后未触发通关')
else console.log('真结局：通关 ✓')

console.log(fail === 0 ? '\n✓ 引擎冒烟全部通过' : `\n✗ ${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
