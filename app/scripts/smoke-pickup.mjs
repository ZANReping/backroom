// 拾取与容器搜索冒烟断言（node + esbuild bundle）
// 用法: node scripts/smoke-pickup.mjs
import { build } from 'esbuild'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const out = await build({
  stdin: {
    contents: "export { Engine } from './src/game/engine.ts'; export { look } from './src/game/renderer/shared.ts'",
    resolveDir: process.cwd(),
    sourcefile: 'smoke-pickup-entry.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
})
const bundlePath = join(tmpdir(), 'backroom-engine-bundle.mjs')
writeFileSync(bundlePath, out.outputFiles[0].text)
const { Engine, look } = await import(pathToFileURL(bundlePath).href)

let pass = 0, fail = 0
const assert = (cond, name) => {
  if (cond) { pass++; console.log('  PASS', name) }
  else { fail++; console.error('  FAIL:', name) }
}

const eng = new Engine()
eng.newRun(12345, 'normal')
const p = eng.player
const m = eng.map
const aimAt = (x, y, z) => {
  p.facing = Math.atan2(y - p.y, x - p.x)
  look.yaw = p.facing - Math.PI
  look.pitch = Math.atan2(z - (p.z + 1.55), Math.max(0.05, Math.hypot(x - p.x, y - p.y)))
}
const placeWithItemInCrosshair = (it, distance) => {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    p.x = it.x + dx * distance; p.y = it.y + dy * distance; p.z = it.z ?? 0
    aimAt(it.x, it.y, p.z + 0.22)
    eng.scanInteract()
    if (eng.interactTarget?.it === it) return true
  }
  return false
}

// 1. 地图上必有地面物品
assert(m.items.length > 5, `生成物品数量 ${m.items.length} > 5`)

// 2. 前 6 个物品：靠近 + 面向后提示出现，按交互可拾取
let picked = 0
for (const it of m.items.slice(0, 6)) {
  if (!placeWithItemInCrosshair(it, 0.8)) { assert(false, `物品 ${it.type} 在 0.8m 内存在无遮挡站位`); continue }
  eng.update(0.016)
  const t = eng.getInteract()
  if (!t || t.kind !== 'item') { assert(false, `物品 ${it.type} 在 0.8m 内出现拾取提示`); continue }
  assert(true, `物品 ${it.type} 提示出现（${t.label}）`)
  const before = eng.countItem(it.type)
  eng.input.interact = true
  eng.update(0.016)
  if (eng.countItem(it.type) > before || !m.items.includes(it)) picked++
  else assert(false, `物品 ${it.type} 交互后入包或消失`)
}
assert(picked >= 5, `6 个物品中至少 5 个成功拾取（实际 ${picked}）`)

// 3. 1.9m 距离仍可拾取（半径 >=2m 容差内）
{
  const it = m.items.find((candidate) => placeWithItemInCrosshair(candidate, 1.9))
  if (it) {
    eng.update(0.016)
    const t = eng.getInteract()
    assert(t && t.kind === 'item', '1.9m 距离拾取提示仍出现')
  } else assert(false, '找到 1.9m 内无遮挡的物品测试站位')
}

// 4. 背后物品不给提示（视线角过滤）
{
  const it = m.items[1]
  if (it) {
    p.x = it.x + 1.5; p.y = it.y
    p.z = it.z ?? 0
    p.facing = 0 // 面向 +x，物品在 -x 背后
    look.yaw = -Math.PI
    look.pitch = Math.atan2((p.z + 0.22) - (p.z + 1.55), 1.5)
    eng.update(0.016)
    const t = eng.getInteract()
    assert(!t || t.kind !== 'item', '背后 1.5m 的物品不出现拾取提示')
  }
}

// 5. 容器搜索：开始 → 进度 → 战利品面板 → 全部拿取
{
  const crate = m.structures.find((s) => s.kind === 'crate' && !s.looted)
  assert(!!crate, '地图存在补给箱')
  if (crate) {
    p.x = crate.x + 0.5; p.y = crate.y + 1.2
    p.z = (crate.floor ?? 0) * 3
    aimAt(crate.x + 0.5, crate.y + 1, p.z + 0.73)
    eng.addItem('crowbar') // 保证不被「钉死」挡住（概率分支）
    eng.update(0.016)
    const t = eng.getInteract()
    assert(t && t.kind === 'crate', '补给箱搜索提示出现')
    eng.input.interact = true
    eng.update(0.016)
    assert(!!eng.searching, '交互后进入搜索进度')
    for (let i = 0; i < 200 && !eng.lootPanel; i++) eng.update(0.016)
    assert(!!eng.lootPanel, '搜索完成弹出战利品面板')
    const items = eng.lootPanel?.items.length ?? 0
    eng.takeAllLoot()
    assert((eng.lootPanel?.items.length ?? -1) === 0, `全部拿取后面板清空（拿到 ${items} 件）`)
    eng.closeLootPanel()
    assert(crate.looted === true, '面板关闭后容器标记为已搜空')
  }
}

// 6. 出口提示：层级加载后消息日志包含出口线索
{
  let got = false
  const eng2 = new Engine()
  eng2.on((e) => { if (e.kind === 'msg' && e.text?.includes('出口线索')) got = true })
  eng2.newRun(777, 'normal')
  assert(got, '出生时提示出口线索')
}

// 7. 开发者模式：无敌
{
  eng.dev.god = true
  const hp = p.hp
  eng.hurtPlayer(50, '测试')
  assert(p.hp === hp, '开发者模式不掉血')
  eng.dev.god = false
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail ? 1 : 0)
