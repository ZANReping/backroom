// v29a 冒烟断言：存档 → 退回主界面 → 继续游戏 恢复进度（位置/背包/层级/地图一致）
// 运行：npx tsx verifier/v1/smoke-v29-save.mts

// node 环境无 localStorage：注入内存版垫片（必须在动态 import 引擎之前）
const mem = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
}

let failures = 0
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`)
  else { console.error(`  ✗ ${msg}`); failures++ }
}
const approx = (a: number, b: number) => Math.abs(a - b) < 1e-6

console.log('== v29a 存档/继续游戏冒烟 ==')

const { Engine, SAVE_KEY, loadSaveSnapshot } = await import('../../src/game/engine')

// 地图 tiles 简易哈希（验证读档复现同一张图）
function mapHash(e: InstanceType<typeof Engine>): string {
  const m = e.map!
  let h = 0
  for (let i = 0; i < m.tiles.length; i += 97) h = (h * 31 + m.tiles[i]) >>> 0
  return `${m.w}x${m.h}:${h}`
}

// ---- 1. 开新局并模拟游玩 ----
const SEED = 12345
const e = new Engine()
e.newRun(SEED, 'normal')
// 模拟玩家移动/拾取/状态变化
e.player.x = 10.25; e.player.y = 7.5; e.player.facing = 1.2
e.player.hp = 77; e.player.hunger = 55
e.player.hotbar[0] = { type: 'almond', count: 2 }
e.player.hotbar[2] = { type: 'flashlight', count: 1 }
e.player.backpack[3] = { type: 'tape', count: 1 }
e.player.selected = 2
e.player.kills = 3
// 跑 3.5 秒游戏逻辑，触发引擎周期自动存档
for (let i = 0; i < 70; i++) e.update(0.05)
ok(mem.has(SAVE_KEY), '游玩 3.5 秒后引擎已自动写存档（br_save_state）')

const snap = loadSaveSnapshot()
ok(!!snap && snap.seed === SEED, '存档快照可解析且种子匹配')
ok(!!snap && approx(snap!.player.x, e.player.x) && approx(snap!.player.y, e.player.y), '存档玩家位置与引擎一致')

// ---- 2. 退回主界面（over=true）落盘 ----
e.over = true
e.update(0.016)
const snap2 = loadSaveSnapshot()
ok(!!snap2, '退回主界面后存档仍存在')

// ---- 3. 继续游戏：同种子 newRun 应恢复进度而非重开 ----
const e2 = new Engine()
e2.newRun(SEED, 'normal')
const sp = snap2!.player
ok(approx(e2.player.x, sp.x) && approx(e2.player.y, sp.y), `继续游戏恢复位置 (${e2.player.x.toFixed(2)},${e2.player.y.toFixed(2)})`)
ok(approx(e2.player.z, sp.z), '继续游戏恢复高度 z')
ok(e2.player.level === snap2!.level, `继续游戏恢复层级 L${snap2!.level}`)
ok(approx(e2.player.hp, sp.hp) && approx(e2.player.hunger, sp.hunger), '继续游戏恢复 hp/饥饿')
ok(e2.player.hotbar[0]?.type === 'almond' && e2.player.hotbar[0]?.count === 2, '继续游戏恢复快捷栏（almond×2）')
ok(e2.player.hotbar[2]?.type === 'flashlight', '继续游戏恢复快捷栏（flashlight）')
ok(e2.player.backpack[3]?.type === 'tape', '继续游戏恢复背包（tape）')
ok(e2.player.selected === 2, '继续游戏恢复选中槽位')
ok(e2.player.kills === 3, '继续游戏恢复击杀数')
// 注：游玩中的地图会被 infinite 系统就地改写（窗口平移 stitch），故改与「同 mapSeed 重新生成」的基准图比对
const ef = new Engine()
ef.newRun(999, 'normal') // 不同种子 → 全新局（不会读档）
ef.loadLevel(snap2!.level, { mapSeed: snap2!.mapSeed, firstVisit: snap2!.mapFirstVisit })
ok(mapHash(e2) === mapHash(ef), `读档地图与同种子重生成地图一致（${mapHash(e2)}）`)

// ---- 4. 全新种子 = 新游戏（不读旧档） ----
const e3 = new Engine()
e3.newRun(999, 'normal')
ok(!(approx(e3.player.x, sp.x) && approx(e3.player.y, sp.y)), '新随机种子开新游戏不读旧档')

// ---- 5. 死亡后存档清除 ----
const e4 = new Engine()
e4.newRun(SEED, 'normal')
ok(!!loadSaveSnapshot(), '读档后存档仍有效')
;(e4 as any).die('测试死亡', true)
ok(loadSaveSnapshot() === null, '死亡后存档快照被清除（继续游戏将开新局）')

if (failures > 0) { console.error(`\n${failures} 项断言失败`); process.exit(1) }
console.log('\n全部断言通过')
