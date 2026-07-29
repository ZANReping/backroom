// 粉笔头（chalkstub）回归校验：
// 1) 右键在面前墙上画出记号（wallMarks +1，消耗 1 支）
// 2) 同一墙面重复画：不新增、不消耗
// 3) 面前无墙：不消耗并提示
// 4) 换层（地图重新生成）后记号清空
;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 800, innerHeight: 600 }
;(globalThis as unknown as Record<string, unknown>).document = {
  createElement: () => ({ width: 1, height: 1, getContext: () => null, style: {} }),
  getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} },
}
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
;(globalThis as unknown as Record<string, unknown>).performance = globalThis.performance ?? { now: () => Date.now() }

const { engine } = await import('../src/game/engine.ts')
const { tileAt } = await import('../src/game/mapgen.ts')

let fail = 0
const bad = (m: string) => { console.log('  ✗ ' + m); fail++ }
const ok = (m: string) => console.log('  ✓ ' + m)

engine.newRun(20260728, 'normal')
engine.paused = false
engine.devJump(0)
engine.introT = 0
engine.dev.god = true
if (!engine.devTestField()) { bad('devTestField 失败'); process.exit(1) }
for (let f = 0; f < 5; f++) engine.update(0.02)
const m = engine.map!
const p = engine.player
p.selected = 0
p.hotbar[0] = { type: 'chalkstub', count: 2 }

// 找 +x 方向最近的墙，站到它面前
let wx = -1
for (let x = Math.floor(p.x) + 1; x < m.w; x++) if (tileAt(m, x, Math.floor(p.y)) !== 1) { wx = x; break }
if (wx < 0) { bad('测试场地 +x 方向找不到墙（用例失效）'); process.exit(1) }
p.x = wx - 1.2
p.facing = 0

// 1) 画记号
engine.quickUse()
if (engine.wallMarks.length !== 1) bad(`画记号后 wallMarks=${engine.wallMarks.length}`)
else ok(`墙上留下记号（tile ${engine.wallMarks[0].wx},${engine.wallMarks[0].wy} dir=${engine.wallMarks[0].dir}）`)
if (p.hotbar[0]?.count !== 1) bad(`画记号后粉笔数量应为 1，实际 ${p.hotbar[0]?.count}`)
else ok('消耗 1 支粉笔')

// 2) 同一墙面重复画：不新增不消耗
engine.quickUse()
if (engine.wallMarks.length !== 1 || p.hotbar[0]?.count !== 1) bad('同一墙面重复画时仍消耗/新增')
else ok('同一墙面不重复消耗')

// 3) 面向空地（测试场地内 80×80 无墙）：不消耗
p.facing = Math.PI
engine.quickUse()
if (engine.wallMarks.length !== 1 || p.hotbar[0]?.count !== 1) bad('面向空地时误画了记号')
else ok('面前无墙时不消耗')

// 4) 换层清空
engine.devJump(1)
if (engine.wallMarks.length !== 0) bad('换层后粉笔记号未清空')
else ok('换层后记号随地图重新生成而清空')

console.log(fail === 0 ? '\n✓ 粉笔头校验全部通过' : `\n✗ ${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
