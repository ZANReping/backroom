;(globalThis as any).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
;(globalThis as any).document = { createElement: () => ({ width: 1, height: 1, getContext: () => null, style: {} }), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } }
;(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
const { engine } = await import('../src/game/engine.ts')
engine.newRun(20260726, 'normal')
engine.paused = false
engine.enterOutpost('gamma')
for (let f = 0; f < 80; f++) engine.update(0.02)
const p = engine.player
const m = engine.map!
function test(x: number, y: number, label: string) {
  p.x = x; p.y = y; p.z = 5.0; p.vz = 0 // 从高处落到家具上
  for (let f = 0; f < 60; f++) engine.update(0.02)
  const settled = p.z
  let apex = settled
  engine.input.jump = true
  for (let f = 0; f < 100; f++) { engine.update(0.02); apex = Math.max(apex, p.z) }
  engine.input.jump = false
  console.log(`${label}: 落定 z=${settled.toFixed(2)} → 跳 apex=${apex.toFixed(2)}（板底 5.65 拦截应 ≤4.10）`)
  p.x = 39.5; p.y = 23.5; p.z = 3.0; p.vz = 0
  for (let f = 0; f < 30; f++) engine.update(0.02)
}
test(67.5, 19.5, '2F宿舍B desk')
test(13.5, 19.5, '2F会议A? (13,19) table')
test(30.5, 19.5, '2F宿舍A libshelf(30,19)?')
test(51.5, 38.5, '2F储备角 binshelf?')
