;(globalThis as any).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
;(globalThis as any).document = { createElement: () => ({ width: 1, height: 1, getContext: () => null, style: {} }), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } }
;(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
const { engine } = await import('../src/game/engine.ts')
engine.newRun(20260726, 'normal')
engine.paused = false
if (!engine.enterOutpost('gamma')) { console.log('enterOutpost 失败'); process.exit(1) }
for (let f = 0; f < 80; f++) engine.update(0.02)
const p = engine.player
const m = engine.map!
const flat = (x: number, y: number, z0: number, label: string) => {
  p.x = x; p.y = y; p.z = z0; p.vz = 0
  let apex = z0
  engine.input.jump = true
  for (let f = 0; f < 90; f++) { engine.update(0.02); apex = Math.max(apex, p.z) }
  engine.input.jump = false
  const i = Math.floor(y) * m.w + Math.floor(x)
  console.log(`${label}: apex=${apex.toFixed(2)} z=${p.z.toFixed(2)} up=${m.up[i]} up2=${m.up2[i]} stair=${m.stair[i] & 7}（5.65 板底拦截应 apex≤4.10）`)
}
flat(39.5, 23.5, 3.0, '2F走廊平地')
flat(39.5, 23.5, 3.75, '2F站桌高度')
flat(67.5, 19.5, 3.77, '2F宿舍B桌')
