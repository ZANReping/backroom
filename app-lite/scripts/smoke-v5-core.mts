// v5-core 冒烟测试：移动平滑断言 + 6 层生成/实体池/掉落校验
// 运行：node_modules/.bin/esbuild scripts/smoke-v5-core.mts --bundle --format=esm --platform=node --outfile=/tmp/smoke-v5-core.mjs && node /tmp/smoke-v5-core.mjs
import { Engine } from '../src/game/engine'
import { generateLevel, tileAt, type GameMap } from '../src/game/mapgen'
import { LEVELS, LEVEL_EVENTS, WIN_TAPES } from '../src/game/levels'
import { integrateMove, createIntegrator, canOccupy, FIXED_STEP } from '../src/game/player'
import { look } from '../src/game/renderer3d'
import { UNIVERSAL_ITEMS } from '../src/game/items'

let failures = 0
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  ✓ ${label}`)
  else { failures++; console.error(`  ✗ ${label}`) }
}

// 合成地图：w×h 全地板、外墙（可选竖/横内墙）
function syntheticMap(w: number, h: number, wall?: { axis: 'x' | 'y'; at: number; from: number; to: number }): GameMap {
  const tiles = new Uint8Array(w * h).fill(1)
  for (let x = 0; x < w; x++) { tiles[x] = 2; tiles[(h - 1) * w + x] = 2 }
  for (let y = 0; y < h; y++) { tiles[y * w] = 2; tiles[y * w + w - 1] = 2 }
  if (wall) {
    for (let i = wall.from; i <= wall.to; i++) {
      if (wall.axis === 'y') tiles[wall.at * w + i] = 2 // 水平墙（y=at）
      else tiles[i * w + wall.at] = 2
    }
  }
  return {
    w, h, tiles,
    structures: [], items: [], lights: [], exits: [], entities: [],
    spawn: { x: 2, y: 2 }, wet: new Uint8Array(w * h),
  }
}

// 渲染器 applyView 的同款就地旋转（模拟真实主循环）
function applyViewLikeRenderer(input: { mx: number; my: number }) {
  const s = Math.sin(look.yaw), c = Math.cos(look.yaw)
  const mx0 = input.mx, my0 = input.my
  if (Math.abs(mx0) < 1e-4 && Math.abs(my0) < 1e-4) return
  input.mx = c * mx0 + s * my0
  input.my = -s * mx0 + c * my0
}

// ---------- 1. 纯移动积分：单调前进 + 帧率无关 ----------
console.log('[1] 固定子步移动积分')
{
  const speed = 3.4, seconds = 8
  const runProfile = (frameDt: number) => {
    const m = syntheticMap(400, 5)
    const pos = { x: 2.5, y: 2.5 }
    const it = createIntegrator()
    const n = Math.round(seconds / frameDt)
    let prevX = pos.x, monotone = true
    for (let i = 0; i < n; i++) {
      integrateMove(m, pos, 1, 0, speed, frameDt, it)
      if (pos.x < prevX - 1e-9) monotone = false
      prevX = pos.x
    }
    return { x: pos.x, monotone }
  }
  const a = runProfile(1 / 30) // 低帧率
  const b = runProfile(1 / 60)
  const c = runProfile(1 / 144) // 高帧率
  assert(a.monotone && b.monotone && c.monotone, '1000+ 步移动位置单调前进、无回退')
  const expect = 2.5 + speed * seconds
  for (const [name, r] of [['30fps', a], ['60fps', b], ['144fps', c]] as const) {
    assert(Math.abs(r.x - expect) < speed * FIXED_STEP * 2, `${name} 位移 ≈ 理论值（${r.x.toFixed(3)} vs ${expect.toFixed(3)}）`)
  }
  assert(Math.abs(a.x - c.x) < 0.05, `高低帧率位移一致（Δ=${Math.abs(a.x - c.x).toFixed(4)}）`)
}

// ---------- 2. 沿墙滑动不卡 ----------
console.log('[2] 沿墙滑动')
{
  // 水平墙 y=6（x 从 0 到 39），玩家在墙北侧 y=5.5，朝东南 45° 顶着墙走
  const m = syntheticMap(40, 12, { axis: 'y', at: 6, from: 0, to: 39 })
  const pos = { x: 2.5, y: 5.5 }
  const it = createIntegrator()
  const d = Math.SQRT1_2
  for (let i = 0; i < 600; i++) integrateMove(m, pos, d, d, 3.4, 1 / 60, it)
  assert(pos.x > 2.5 + 3.4 * d * 9, `沿墙 x 方向持续滑动（x=${pos.x.toFixed(2)}）`)
  assert(canOccupy(m, pos.x, pos.y), '滑动全程未穿墙')
  assert(Math.abs(pos.y - (6 - 0.32 - 0.001)) < 0.35, `贴墙稳定（y=${pos.y.toFixed(3)}）`)
  // 顶墙斜走 1000 步 x 单调
  const pos2 = { x: 2.5, y: 5.5 }
  const it2 = createIntegrator()
  let prev = pos2.x, mono = true
  for (let i = 0; i < 1000; i++) {
    integrateMove(m, pos2, d, d, 6.0, 1 / 60, it2)
    if (pos2.x < prev - 1e-9) mono = false
    prev = pos2.x
  }
  assert(mono, '冲刺顶墙 1000 步 x 单调无回退')
}

// ---------- 3. 引擎集成：input 旋转复原（按住键盘不重置也不漂移） ----------
console.log('[3] 引擎移动方向一致性')
{
  const eng = new Engine()
  eng.newRun(42, 'normal')
  eng.dev.god = true
  // 换成开阔合成地图，排除墙体滑动对方向断言的干扰
  eng.map = syntheticMap(200, 200)
  eng.explored = new Uint8Array(200 * 200)
  eng.visible = new Uint8Array(200 * 200)
  eng.player.x = 100.5; eng.player.y = 100.5
  look.yaw = Math.PI / 3 // 相机朝向 60°
  // 期望世界方向 = R(yaw)·(0,-1)（W 键前进）
  const ex = Math.sin(look.yaw) * -1, ey = Math.cos(look.yaw) * -1
  const x0 = eng.player.x, y0 = eng.player.y
  let dotMin = 1
  // 模拟「按住 W 不松开」：只在第 0 帧设置一次屏幕系输入（键盘无 repeat 的极端情况）
  eng.input.mx = 0; eng.input.my = -1
  for (let i = 0; i < 600; i++) {
    applyViewLikeRenderer(eng.input) // 每帧就地把 input 旋到世界系
    const px = eng.player.x, py = eng.player.y
    eng.update(1 / 60)
    const dx = eng.player.x - px, dy = eng.player.y - py
    const len = Math.hypot(dx, dy)
    if (len > 1e-6) dotMin = Math.min(dotMin, (dx * ex + dy * ey) / len)
  }
  const totX = eng.player.x - x0, totY = eng.player.y - y0
  const totLen = Math.hypot(totX, totY)
  assert(dotMin > 0.995, `每帧移动方向与相机前向一致（min cos=${dotMin.toFixed(4)}）`)
  assert(totLen > 20 && (totX * ex + totY * ey) / totLen > 0.995, `总位移沿相机前向（${totLen.toFixed(1)}m）`)
  // 按键事件重写（屏幕系）→ 方向仍正确
  eng.input.mx = -1; eng.input.my = 0 // A 键左移
  const lx = -Math.cos(look.yaw), ly = Math.sin(look.yaw) // R(yaw)·(-1,0)
  applyViewLikeRenderer(eng.input)
  const ax = eng.player.x, ay = eng.player.y
  eng.update(1 / 60)
  const adx = eng.player.x - ax, ady = eng.player.y - ay
  const alen = Math.hypot(adx, ady)
  assert(alen < 1e-9 || (adx * lx + ady * ly) / alen > 0.99, '按键切换后方向立即正确')
  look.yaw = 0
}

// ---------- 4. 六层生成 / 实体池 / 掉落 ----------
console.log('[4] 六层生成与 wiki 设定校验')
{
  assert(LEVELS.length === 6, '共 6 个层级')
  for (const def of LEVELS) {
    const m = generateLevel(def, 20240501 + def.id)
    assert(m.entities.length > 0, `L${def.id} ${def.name} 生成 ${m.entities.length} 实体`)
    assert(m.exits.length >= 1, `L${def.id} 至少 1 个出口`)
    const poolTypes = new Set(def.entities.map((e) => e.type))
    assert(m.entities.every((e) => poolTypes.has(e.def.type)), `L${def.id} 实体类型全部来自本层池`)
    assert(tileAt(m, m.spawn.x, m.spawn.y) === 1, `L${def.id} 出生点可站立`)
    assert(m.items.length >= def.itemCount[0], `L${def.id} 物品数 ≥ 下限（${m.items.length} ≥ ${def.itemCount[0]}）`)
    assert(m.items.some((i) => i.type === 'tape'), `L${def.id} 保底 1 盘磁带`)
    assert(LEVEL_EVENTS[def.id]?.length >= 2, `L${def.id} 有 ≥2 条氛围事件文本`)
  }
  // wiki 逐项设定
  const l0pool = LEVELS[0].entities.reduce((s, e) => s + e.max, 0)
  assert(l0pool <= 1, 'L0 几乎无实体（最大生成数 ≤1）')
  assert(LEVELS[0].exits.some((e) => e.kind === 'crack' || e.kind === 'firedoor'), 'L0 有 noclip 类出口到 L1')
  const l1types = LEVELS[1].entities.map((e) => e.type)
  assert(['duller', 'hound', 'faceling'].every((t) => l1types.includes(t)), 'L1 含钝人/猎犬/无面灵')
  const l2types = LEVELS[2].entities.map((e) => e.type)
  assert(l2types.includes('smiler') && l2types.includes('pipeworm'), 'L2 含笑魇与管道蠕虫（生物管道）')
  assert(LEVELS[2].itemCount[1] <= 10, 'L2 补给极度匮乏（物品上限 ≤10）')
  const l3items = LEVELS[3].items.map((i) => i.type)
  assert(l3items.includes('fuse') && l3items.includes('battery'), 'L3 保险丝/电池高掉率')
  assert(LEVELS[3].itemCount[0] >= LEVELS[2].itemCount[0], 'L3 资源多于 L2')
  const l4types = LEVELS[4].entities.map((e) => e.type).sort()
  assert(l4types.length === 2 && l4types.includes('hound') && l4types.includes('duller'), 'L4 仅猎犬+钝人')
  const l4almond = LEVELS[4].items.find((i) => i.type === 'almond')?.w ?? 0
  const uniAlmond = UNIVERSAL_ITEMS.find((i) => i.type === 'almond')!.w
  assert(l4almond >= uniAlmond, `L4 杏仁水额外权重 ${l4almond} ≥ 通用 ${uniAlmond}（全后室最富集）`)
  const l5 = LEVELS[5].entities.find((e) => e.type === 'deathmoth')!
  assert(l5.min >= 4, 'L5 死亡飞蛾主巢（min ≥4）')
  assert(WIN_TAPES === 6, '通关磁带数 = 6')
}

// ---------- 5. L1 停电事件 ----------
console.log('[5] L1 停电事件')
{
  const eng = new Engine()
  eng.newRun(7, 'normal')
  eng.dev.god = true
  eng.devJump(1)
  const before = eng.map!.lights.length
  ;(eng as unknown as { startBlackout(d: number): void }).startBlackout(1.0)
  const during = eng.map!.lights.length
  assert(during < before, `停电后光源减少（${before} → ${during}）`)
  assert(eng.blackoutT > 0, '停电计时启动')
  for (let i = 0; i < 90; i++) eng.update(1 / 60) // 1.5s
  assert(eng.blackoutT <= 0 && eng.map!.lights.length >= before, '供电恢复且光源还原')
}

console.log(failures === 0 ? '\n全部通过 ✓' : `\n${failures} 项失败 ✗`)
process.exit(failures === 0 ? 0 : 1)
