// v18 冒烟断言：容器持久战利品（内容生成即定/二次搜索免进度条/剩余保留/空容器提示）
// 运行：npx tsx verifier/v1/smoke-v18.mts
import { Engine } from '../../src/game/engine'
import type { Structure } from '../../src/game/types'

let failures = 0
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`)
  else { console.error(`  ✗ ${msg}`); failures++ }
}

const CONTAINER_KINDS = ['crate', 'corpse', 'car', 'cabinet', 'dresser', 'megcrate']

console.log('== v18 容器持久战利品冒烟 ==')

const eng = new Engine()
eng.dev.god = true // 防测试途中被实体击杀
const msgs: string[] = []
eng.on((e) => { if (e.kind === 'msg' && e.text) msgs.push(e.text) })

eng.newRun(20260726, 'normal')
// 找一个 ≥2 件物品的容器层（尸体只有 1 件，优先 crate/megcrate/car/cabinet/dresser）
let struct: Structure | null = null
for (let lvl = 0; lvl < 4 && !struct; lvl++) {
  if (lvl > 0) eng.loadLevel(lvl)
  struct = eng.map!.structures.find((s) => CONTAINER_KINDS.includes(s.kind) && s.kind !== 'corpse') ?? null
}
if (!struct) {
  eng.loadLevel(0)
  struct = eng.map!.structures.find((s) => CONTAINER_KINDS.includes(s.kind)) ?? null
}
ok(!!struct, `找到可搜索容器（L${eng.player.level} ${struct?.kind}）`)
if (!struct) process.exit(1)
let s = struct

// 站到容器旁并面向它
eng.devGiveItem('crowbar') // 防止补给箱「钉死」随机失败
const cx = s.x + s.w / 2, cy = s.y + s.h / 2
eng.player.x = cx + 0.9; eng.player.y = cy + 0.9
eng.player.z = 0; eng.player.vz = 0
eng.player.facing = Math.atan2(cy - eng.player.y, cx - eng.player.x)

const tick = (n = 1, dt = 0.016) => { for (let i = 0; i < n; i++) eng.update(dt) }
const pressInteract = () => { eng.input.interact = true; tick(1) }

// ---- 1. 首次搜索：出现进度条 ----
tick(2) // scanInteract 刷新目标
pressInteract()
ok(!!eng.searching, '首次搜索：出现搜索进度条')
ok(!eng.lootPanel, '首次搜索：进度未完成前不出面板')
// 以搜索目标 sid 解析真实结构（scanInteract 可能选中邻近容器）
if (eng.searching) {
  const real = eng.map!.structures.find((x) => x.data?.sid === eng.searching!.sid)
  if (real) s = real
}
const lootAtStart = s.data?.lootItems as string[] | undefined
ok(Array.isArray(lootAtStart) && lootAtStart.length > 0, `内容物在搜索发起时生成并持久（${lootAtStart?.length} 件）`)

// ---- 2. 完成搜索：面板打开，内容与持久数组同一引用 ----
tick(200) // 3.2s 足够 1.8s 进度
ok(!!eng.lootPanel, '搜索完成：战利品面板打开')
if (eng.lootPanel) {
  const real = eng.map!.structures.find((x) => x.data?.sid === eng.lootPanel!.sid)
  if (real) s = real
}
const firstItems = [...(eng.lootPanel?.items ?? [])]
ok(firstItems.length > 0, `面板显示 ${firstItems.length} 件物品`)
ok(eng.lootPanel?.items === (s.data?.lootItems as unknown), '面板物品与结构持久数组为同一引用（拿取即同步）')
ok(s.data?.searched === 1, '容器标记 searched=1（盖板开启/变暗状态 opened 同步）')
ok(s.data?.opened === 1, '容器标记 opened=1')

// ---- 3. 拿一件后关面板：剩余物品留在容器 ----
const taken = firstItems[0]
ok(eng.takeLoot(0), `拿取一件（${taken}）`)
eng.closeLootPanel()
ok(!eng.lootPanel, '面板已关闭')
const leftovers = s.data?.lootItems as string[]
if (firstItems.length > 1) {
  ok(!s.looted, '未拿完：容器不标记为空')
  ok(leftovers.length === firstItems.length - 1, `容器保留剩余 ${leftovers.length} 件`)
} else {
  ok(s.looted === true, '仅有 1 件：拿完即标记为空')
}

// ---- 4. 二次搜索：免进度条直接开面板，内容不刷新 ----
if (firstItems.length > 1) {
  eng.player.facing = Math.atan2(s.y + s.h / 2 - eng.player.y, s.x + s.w / 2 - eng.player.x)
  tick(2)
  pressInteract()
  ok(!eng.searching, '二次搜索：无搜索进度条')
  ok(!!eng.lootPanel, '二次搜索：直接打开面板')
  ok(JSON.stringify(eng.lootPanel?.items) === JSON.stringify(leftovers), '二次搜索：显示之前没拿完的物品（内容不刷新）')
  // ---- 5. 全部拿完：容器标记为空 ----
  eng.takeAllLoot()
  eng.closeLootPanel()
  ok(s.looted === true, '全部拿完：容器标记为空（外观变暗/盖板状态一致）')
} else {
  eng.closeLootPanel()
}

// ---- 6. 搜索空容器：直接提示，不出面板不出进度条 ----
msgs.length = 0
eng.player.x = s.x + s.w / 2 + 0.9; eng.player.y = s.y + s.h / 2 + 0.9
eng.player.facing = Math.atan2(s.y + s.h / 2 - eng.player.y, s.x + s.w / 2 - eng.player.x)
tick(2)
const tgt = eng.getInteract()
ok(!!tgt && tgt.label.includes('（空）'), `空容器交互提示为「（空）」（实际：${tgt?.label ?? '无'}）`)
pressInteract()
ok(!eng.searching, '空容器：不出进度条')
ok(!eng.lootPanel, '空容器：不出面板')
ok(msgs.some((m) => m.includes('容器是空的')), '空容器：提示「容器是空的」')

// ---- 7. 快捷使用（quickUse = 背包「使用」按钮效果）----
eng.player.hunger = 40
eng.dev.statLock = false
eng.player.hotbar = [{ type: 'canned', count: 1 }, null, null, null, null, null, null, null]
eng.player.selected = 0
eng.quickUse()
ok(eng.player.hunger > 40, 'quickUse：吃掉持有罐头，饥饿恢复')
ok(eng.player.hotbar[0] === null, 'quickUse：消耗掉该物品')

// ---- 8. E 拿取全部 / Esc 关面板的引擎侧语义 ----
const s2 = eng.map!.structures.find((x) => CONTAINER_KINDS.includes(x.kind) && !x.looted && x !== s)
if (s2) {
  const c2x = s2.x + s2.w / 2, c2y = s2.y + s2.h / 2
  eng.player.x = c2x + 0.9; eng.player.y = c2y + 0.9
  eng.player.facing = Math.atan2(c2y - eng.player.y, c2x - eng.player.x)
  tick(2)
  pressInteract()
  tick(200)
  ok(!!eng.lootPanel, '第二个容器：面板打开')
  eng.takeAllLoot()
  ok((eng.lootPanel?.items.length ?? -1) === 0 && s2.looted, 'takeAllLoot：面板清空且容器标记为空')
  eng.closeLootPanel()
} else {
  ok(true, '第二个容器：本层无更多容器，跳过')
}

console.log(failures ? `\n结果：${failures} 项失败` : '\n结果：全部通过')
process.exit(failures ? 1 : 0)
