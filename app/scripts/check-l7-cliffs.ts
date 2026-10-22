/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// [thing] L7 陡崖防卡死验收：在入口海山崖壁与远海陡坡上逐点放置玩家（贴着海床），
// 比较旧判定（无出发点）与新判定（海床「不变差就放行」）下 8 个方向是否都走不动。运行：npm run check:l7-cliffs
import { createCanvas } from '@napi-rs/canvas'
const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256) },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const { audio } = await import('../src/game/core/audio')
const { canOccupy, moveStep } = await import('../src/game/core/player')
const { floorHeight } = await import('../src/game/world/mapgen')
const L7 = await import('../src/game/world/infiniteL7')
for (const k of Object.keys(audio)) if (typeof (audio as any)[k] === 'function') (audio as any)[k] = () => {}

let fails = 0, n = 0
const ok = (c: unknown, m: string) => { n++; console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
const DIRS = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)])

for (const seed of [1, 777, 12345, 20261009]) {
  const eng: any = new Engine(); eng.seed = seed; eng.emit = () => {}; eng.persist = () => {}
  eng.loadLevel(7, { mapSeed: seed, firstVisit: false })
  const m = eng.map
  let pts = 0, oldTrap = 0, newTrap = 0, steep = 0
  const basins: { x: number; y: number }[] = []
  const O = L7.L7_ORIGIN
  for (let a = 0; a < 96; a++) for (let rr = 0; rr < 14; rr++) {
    const ang = a / 96 * Math.PI * 2, r = L7.L7_MOUNT.edge - 6 + rr * 2.6
    const x = O.x + Math.cos(ang) * r - m.inf.ox + 0.37, y = O.y + Math.sin(ang) * r - m.inf.oy + 0.21
    const tx = Math.floor(x), ty = Math.floor(y)
    if (tx < 2 || ty < 2 || tx >= m.w - 2 || ty >= m.h - 2 || m.liquid[ty * m.w + tx] !== 1 || m.up[ty * m.w + tx] === 1) continue
    const z = floorHeight(m, x, y, 0)
    const g = Math.max(...DIRS.map(([dx, dy]) => floorHeight(m, x + dx * 0.32, y + dy * 0.32, 0) - z))
    if (g > 0.65) steep++
    pts++
    const opts = { z, band: 0 as const }
    if (DIRS.every(([dx, dy]) => !canOccupy(m, x + dx * 0.05, y + dy * 0.05, 0.32, opts))) oldTrap++
    if (DIRS.every(([dx, dy]) => { const p = { x, y }; const d = moveStep(m, p, dx * 0.05, dy * 0.05, 0.32, opts); return !d.x && !d.y })) { newTrap++; basins.push({ x: x + m.inf.ox, y: y + m.inf.oy }) }
  }
  console.log(`seed ${seed}: 崖带 ${pts} 点，陡于 STEP_UP ${steep}，旧判定困死 ${oldTrap}，新判定困死 ${newTrap}`)
  ok(pts > 300 && steep > 50, `seed ${seed} 崖带采样有效（${pts} 点 / 陡点 ${steep}）`)
  ok(newTrap <= pts * 0.01, `seed ${seed} 新判定：静态困点降到 1% 以内（${newTrap}/${pts}，旧 ${oldTrap}）`)
  // 剩下的是真正的沟底凹坑（往哪走都上坡）：真实引擎里按前进，贴崖上攀会把人带出来
  const p0 = eng.player
  let freed = 0
  for (const b of basins) {
    const wx0 = b.x, wy0 = b.y
    p0.x = wx0 - m.inf.ox; p0.y = wy0 - m.inf.oy; p0.z = floorHeight(m, p0.x, p0.y, 0); p0.vz = 0; eng.dev.god = true
    const z0 = p0.z
    for (let k = 0; k < 90; k++) { eng.input.mx = 1; eng.input.my = 0.3; eng.step(1 / 30) }
    eng.input.mx = 0; eng.input.my = 0
    if (p0.z > z0 + 2 || Math.hypot(p0.x + m.inf.ox - wx0, p0.y + m.inf.oy - wy0) > 1) freed++
  }
  ok(freed === basins.length, `seed ${seed} 凹坑困点只按前进 3s 都能脱出（${freed}/${basins.length}）`)

  // 真实引擎：贴在崖面上，只按「前进」朝台地方向游，6s 内应沿崖壁上攀并回到台地（不按上浮键）
  const p = eng.player
  let climbOk = 0, tries = 0, slideOk = 0
  for (let a = 0; a < 8; a++) {
    const ang = a / 8 * Math.PI * 2 + 0.2
    const r = L7.L7_MOUNT.edge + 9
    p.x = O.x + Math.cos(ang) * r - m.inf.ox + 0.4; p.y = O.y + Math.sin(ang) * r - m.inf.oy + 0.4
    if (m.liquid[Math.floor(p.y) * m.w + Math.floor(p.x)] !== 1) continue
    tries++
    p.z = floorHeight(m, p.x, p.y, 0); p.vz = 0
    eng.dev.god = true; eng.breathT = 0
    const z0 = p.z, wx0 = p.x + m.inf.ox, wy0 = p.y + m.inf.oy
    // 朝台地（圆心）方向：mx/my 为世界系方向
    const dx = O.x - m.inf.ox - p.x, dy = O.y - m.inf.oy - p.y, dl = Math.hypot(dx, dy)
    for (let k = 0; k < 180; k++) { eng.input.mx = dx / dl; eng.input.my = dy / dl; eng.input.jump = false; eng.input.crouch = false; eng.input.sprint = false; eng.step(1 / 30) }
    // 上攀 6m，或者翻过一道小脊后已经横向游出 5m（海床在前方又下落，人自然悬浮前进）
    if (p.z > z0 + 6 || Math.hypot(p.x + m.inf.ox - wx0, p.y + m.inf.oy - wy0) > 5) climbOk++
    // 回到起点贴崖，沿崖横移 2s：至少挪动 1m
    p.x = wx0 - m.inf.ox; p.y = wy0 - m.inf.oy; p.z = floorHeight(m, p.x, p.y, 0); p.vz = 0
    const x0 = p.x + m.inf.ox, y0 = p.y + m.inf.oy
    for (let k = 0; k < 60; k++) { eng.input.mx = -dy / dl; eng.input.my = dx / dl; eng.step(1 / 30) }
    const sd = Math.hypot(p.x + m.inf.ox - x0, p.y + m.inf.oy - y0)
    if (sd > 1.0) slideOk++; else console.log(`  横移不足 seed ${seed} a${a}: ${sd.toFixed(2)}m z ${p.z.toFixed(1)} floor ${floorHeight(m, p.x, p.y, 0).toFixed(1)} 结构 ${m.structures.filter((q: any) => q.solid && Math.hypot(q.x - p.x, q.y - p.y) < 2).map((q: any) => q.kind).join(',')}`)
    eng.input.mx = 0; eng.input.my = 0
  }
  ok(tries >= 4 && climbOk === tries, `seed ${seed} 贴崖只按前进：${climbOk}/${tries} 次沿崖壁上攀 >6m 或翻脊游出 >5m`)
  ok(tries >= 4 && slideOk === tries, `seed ${seed} 贴崖横移：${slideOk}/${tries} 次 2s 内挪动 >1m（边横移边沿崖上攀）`)
}
console.log(`L7 cliffs: ${n - fails}/${n} passed`)
if (fails) process.exit(1)
