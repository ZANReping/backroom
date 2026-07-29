// 测试场地（devTestField）回归校验：
// 1) 生成后场地范围内全部为地板、无结构/物品/光源/出口
// 2) 传送触发窗口平移 + stitch 后场地不被原始迷宫还原（修复前会在此失败）
// 3) 玩家落脚点为地板
;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 800, innerHeight: 600 }
;(globalThis as unknown as Record<string, unknown>).document = {
  createElement: () => ({ width: 1, height: 1, getContext: () => null, style: {} }),
  getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} },
}
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
;(globalThis as unknown as Record<string, unknown>).performance = globalThis.performance ?? { now: () => Date.now() }

const { engine } = await import('../src/game/engine.ts')

let fail = 0
const bad = (m: string) => { console.log('  ✗ ' + m); fail++ }
const ok = (m: string) => console.log('  ✓ ' + m)

engine.newRun(20260727, 'normal')
engine.paused = false
engine.devJump(0) // Level 0 无限模式
const m = engine.map!
if (!m.inf) { bad('Level 0 不是无限模式'); process.exit(1) }
const W = m.w

// 记录生成前场地区域内有墙的样本（确认测试有效：该区域原本确有迷宫内容）
const px = engine.player.x, py = engine.player.y
const fcx = Math.max(42, Math.min(W - 42, Math.round(px + 48)))
const fcy = Math.max(42, Math.min(W - 42, Math.round(py)))
let wallsBefore = 0
for (let y = fcy - 40; y <= fcy + 40; y++)
  for (let x = fcx - 40; x <= fcx + 40; x++) if (m.tiles[y * W + x] !== 1) wallsBefore++
if (wallsBefore === 0) console.log('  （提示：场地区域原本就无墙，用例退化）')

if (!engine.devTestField()) { bad('devTestField 返回 false'); process.exit(1) }

// 校验 1：生成即生效
let walls = 0
for (let y = fcy - 40; y <= fcy + 40; y++)
  for (let x = fcx - 40; x <= fcx + 40; x++) if (m.tiles[y * W + x] !== 1) walls++
if (walls > 0) bad(`生成后场地区域仍有 ${walls} 格非地板`)
else ok(`生成后 80×80 区域全为地板（原本有 ${wallsBefore} 格墙）`)
const inR = (x: number, y: number) => x >= fcx - 40 && x <= fcx + 40 && y >= fcy - 40 && y <= fcy + 40
// 场地照明为生成时按 8 格网格刻意补的灯（不属于「残留」）；其余内容物应为 0
const fieldLights = m.lights.filter((l) => inR(l.x, l.y)).length
const leftovers =
  m.structures.filter((s) => inR(s.x + s.w / 2, s.y + s.h / 2)).length +
  m.items.filter((i) => inR(i.x, i.y)).length +
  m.exits.filter((e) => inR(e.x, e.y)).length
if (leftovers > 0) bad(`场地区域残留 ${leftovers} 个结构/物品/出口`)
else ok('区域内结构/物品/出口已清空')
if (fieldLights < 10) bad(`场地补灯不足（${fieldLights} 盏，应 ≥10）`)
else ok(`场地照明已补齐（${fieldLights} 盏灯）`)
if (engine.player.x !== fcx || engine.player.y !== fcy) bad(`未传送到场地中心 (${fcx},${fcy})，实际 (${engine.player.x},${engine.player.y})`)
else ok('已传送到场地中心')

// 校验 2：跑 200 帧（窗口平移 + stitch 发生于此），场地不得被还原
const genOx = m.inf!.ox, genOy = m.inf!.oy // 生成时窗口原点（平移后 ox/oy 会变，须先记录）
try {
  for (let f = 0; f < 200; f++) engine.update(0.02)
} catch (e) { bad(`平移模拟抛异常：${(e as Error).message}`) }
let revWalls = 0, covered = 0
for (let y = fcy - 40; y <= fcy + 40; y++)
  for (let x = fcx - 40; x <= fcx + 40; x++) {
    const wx = genOx + x, wy = genOy + y // 生成时的世界坐标
    const nx = wx - m.inf!.ox, ny = wy - m.inf!.oy // 当前窗口坐标
    if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue
    covered++
    if (m.tiles[ny * W + nx] !== 1) revWalls++
  }
if (covered === 0) bad('窗口平移后场地区域完全移出窗口（用例失效）')
else if (revWalls > 0) bad(`窗口平移 stitch 后场地被还原：${revWalls}/${covered} 格恢复为墙`)
else ok(`窗口平移 + stitch 后场地保持空旷（${covered} 格在校验范围内）`)

// 校验 3：玩家落点仍是地板
const ptx = Math.floor(engine.player.x), pty = Math.floor(engine.player.y)
if (m.tiles[pty * W + ptx] !== 1) bad('玩家当前位置不是地板')
else ok('玩家落脚点为地板')

console.log(fail === 0 ? '\n✓ 测试场地校验全部通过' : `\n✗ ${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
