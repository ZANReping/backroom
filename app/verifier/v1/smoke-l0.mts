// v17：Level 0「教学关卡」无限生成冒烟断言
// 运行：npx tsx verifier/v1/smoke-l0.mts
import { generateLevel, tileAt } from '../../src/game/mapgen'
import { LEVELS } from '../../src/game/levels'
import {
  CS, WIN_R, WIN_CHUNKS, RS, GEN_ITEM_BASE,
  updateInfinite, variantOf, regionHost, l0NearestExit, h32,
  type InfiniteState,
} from '../../src/game/infinite'

let failures = 0
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`)
  else { console.error(`  ✗ ${msg}`); failures++ }
}
const L0 = LEVELS[0]
const SEED = 20260726

console.log('== v17 L0 无限生成冒烟 ==')

// ---- 0. 定义层断言：显示名/无限标记/零实体/唯一闪烁门出口 ----
ok(L0.name === '教学关卡', `L0 显示名「教学关卡」（内部 id=${L0.id} 不变）`)
ok(L0.infinite === true, 'L0 infinite=true（无限 chunk 模式）')
ok(L0.entities.length === 0, 'L0 定义零实体（实体绝迹）')
ok(L0.exits.length === 1 && L0.exits[0].kind === 'flickerdoor' && L0.exits[0].dest === 1, 'L0 唯一出口=闪烁门→L1')

// ---- 1. 同种子同 chunk 生成一致（确定性）----
{
  const a = generateLevel(L0, SEED)
  const b = generateLevel(L0, SEED)
  const sig = (m: typeof a) => {
    const inf = m.inf!
    const parts: string[] = []
    for (const [k, c] of [...inf.chunks.entries()].sort()) {
      parts.push(k + ':' + c.variant + ':' + Array.from(c.tiles).join('') + ':' +
        c.structures.map((s) => `${s.kind}@${s.x},${s.y}${s.solid ? 'S' : ''}${s.data?.sid ?? ''}`).join('|') +
        ':' + c.items.map((i) => `${i.type}@${i.x.toFixed(1)},${i.y.toFixed(1)}#${i.id}`).join('|') +
        ':' + c.lights.map((l) => `${l.x.toFixed(1)},${l.y.toFixed(1)},${l.r.toFixed(2)},${l.color}`).join('|') +
        ':' + c.exits.map((e) => `${e.x},${e.y}`).join('|'))
    }
    return parts.join(';')
  }
  ok(sig(a) === sig(b), '同种子初始窗口 25 chunk 内容完全一致（瓦片/结构/物品/灯光/出口）')
  // 平移后重访一致性：走出 3 chunk 再走回，中心 chunk 瓦片应与初始一致
  const m = generateLevel(L0, SEED)
  const explored = new Uint8Array(m.w * m.h)
  const centerTiles = (mm: typeof m) => {
    const inf = mm.inf!
    const c = inf.chunks.get('0,0')
    return c ? Array.from(c.tiles).join('') : ''
  }
  const before = centerTiles(m)
  let px = m.spawn.x, py = m.spawn.y
  for (let i = 0; i < 3; i++) { px += CS; const sh = updateInfinite(m, L0, px, py, explored); if (sh) px -= sh.dx }
  ok(!m.inf!.chunks.has('0,0'), '走出后原中心 chunk 已卸载')
  for (let i = 0; i < 3; i++) { px -= CS; const sh = updateInfinite(m, L0, px, py, explored); if (sh) px -= sh.dx }
  ok(centerTiles(m) === before, '重访原 chunk 内容逐瓦片一致（确定性重生成）')
}

// ---- 2. chunk 边缘缝合：边界瓦片开/闭两侧一致（无断墙）----
{
  let checked = 0, mismatch = 0
  const m = generateLevel(L0, SEED)
  const explored = new Uint8Array(m.w * m.h)
  let px = m.spawn.x, py = m.spawn.y
  // 走一圈（含对角）后校验窗口内所有相邻 chunk 边界
  for (const [dx, dy] of [[3, 0], [0, 3], [-3, 0], [0, -3], [2, 2]] as const) {
    px += dx * CS; py += dy * CS
    const sh = updateInfinite(m, L0, px, py, explored)
    if (sh) { px -= sh.dx; py -= sh.dy }
  }
  const inf = m.inf!
  for (const c of inf.chunks.values()) {
    const r = inf.chunks.get(`${c.cx + 1},${c.cy}`)
    if (r) for (let y = 0; y < CS; y++) {
      checked++
      if ((c.tiles[y * CS + CS - 1] === 1) !== (r.tiles[y * CS] === 1)) mismatch++
    }
    const d = inf.chunks.get(`${c.cx},${c.cy + 1}`)
    if (d) for (let x = 0; x < CS; x++) {
      checked++
      if ((c.tiles[(CS - 1) * CS + x] === 1) !== (d.tiles[x] === 1)) mismatch++
    }
  }
  ok(checked > 1000 && mismatch === 0, `chunk 边缘缝合：${checked} 对边界瓦片 0 处断墙`)
  // 每条边至少 1 个开口（保证连通）
  let edgeOk = true
  for (const c of inf.chunks.values()) {
    let e = 0, w = 0, s = 0, n = 0
    for (let y = 0; y < CS; y++) { if (c.tiles[y * CS + CS - 1] === 1) e++; if (c.tiles[y * CS] === 1) w++ }
    for (let x = 0; x < CS; x++) { if (c.tiles[(CS - 1) * CS + x] === 1) s++; if (c.tiles[x] === 1) n++ }
    if (!e || !w || !s || !n) edgeOk = false
  }
  ok(edgeOk, '每个 chunk 四边均有走廊开口（全局连通）')
}

// ---- 3. 走 100+ chunk：窗口有界、状态有界、不报错（内存/drawcall 受控）----
{
  const m = generateLevel(L0, SEED)
  const explored = new Uint8Array(m.w * m.h)
  let px = m.spawn.x, py = m.spawn.y
  let shifts = 0
  const rng = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff })()
  for (let i = 0; i < 140; i++) {
    const ang = Math.floor(rng() * 4) * Math.PI / 2
    px += Math.round(Math.cos(ang)) * CS
    py += Math.round(Math.sin(ang)) * CS
    const sh = updateInfinite(m, L0, px, py, explored)
    if (sh) { shifts++; px -= sh.dx; py -= sh.dy }
    if (tileAt(m, Math.floor(px), Math.floor(py)) !== 1) {
      // 玩家应始终站在地板上（平移保持相对世界一致）
      ok(false, `第 ${i} 步后玩家瓦片非地板`)
      break
    }
  }
  const inf = m.inf as InfiniteState
  ok(shifts >= 100, `完成 ${shifts} 次窗口平移（>100 chunk 行程）`)
  ok(inf.chunks.size <= WIN_CHUNKS * WIN_CHUNKS, `已加载 chunk=${inf.chunks.size} ≤ ${WIN_CHUNKS * WIN_CHUNKS}（卸载生效）`)
  ok(inf.state.size <= 600 && inf.explored.size <= 800, `持久状态有界（state=${inf.state.size}, explored=${inf.explored.size}）`)
  ok(m.structures.length < 25 * 40 && m.lights.length < 25 * 20, `对象列表有界（结构=${m.structures.length}, 灯=${m.lights.length}）`)
}

// ---- 4. 变体稀有度分布（1600 chunk 统计）----
{
  const counts: Record<string, number> = {}
  const N = 40
  for (let cy = -N / 2; cy < N / 2; cy++)
    for (let cx = -N / 2; cx < N / 2; cx++) {
      const v = variantOf(SEED, cx, cy)
      counts[v] = (counts[v] ?? 0) + 1
    }
  const total = N * N
  const frac = (v: string) => (counts[v] ?? 0) / total
  console.log('  变体分布:', JSON.stringify(counts))
  const inRange = (v: string, lo: number, hi: number, label: string) =>
    ok(frac(v) >= lo && frac(v) <= hi, `${label}「${v}」频率 ${(frac(v) * 100).toFixed(1)}% ∈ [${(lo * 100).toFixed(1)}%, ${(hi * 100).toFixed(1)}%]`)
  inRange('arch', 0.04, 0.18, '较稀有')
  inRange('pillarhall', 0.04, 0.18, '较稀有')
  inRange('pit', 0.04, 0.18, '较稀有')
  inRange('blackout', 0.012, 0.08, '稀有')
  inRange('manila', 0.01, 0.08, '稀有')
  inRange('red', 0.003, 0.04, '极稀有')
  ok((counts['maze'] ?? 0) + (counts['pillars'] ?? 0) + (counts['open'] ?? 0) > total * 0.4, '常规迷宫/柱群/开阔区为主体')
}

// ---- 5. 零实体：生成/平移后均无实体 ----
{
  const m = generateLevel(L0, SEED)
  const explored = new Uint8Array(m.w * m.h)
  let px = m.spawn.x, py = m.spawn.y
  for (let i = 0; i < 10; i++) { px += CS; const sh = updateInfinite(m, L0, px, py, explored); if (sh) px -= sh.dx }
  ok(m.entities.length === 0, 'L0 生成+平移后实体数=0')
}

// ---- 6. 出口保底：半径 500m 内 ≥1 闪烁门，且出口瓦片可交互（地板+邻墙）----
{
  const m = generateLevel(L0, SEED)
  let allOk = true, minD = 1e9, maxD = 0
  for (let t = 0; t < 24; t++) {
    const wx = (h32(SEED, t, 1) % 4000) - 2000, wy = (h32(SEED, t, 2) % 4000) - 2000
    const e = l0NearestExit(m, L0, wx, wy)
    if (!e || e.d > 500) { allOk = false; break }
    minD = Math.min(minD, e.d); maxD = Math.max(maxD, e.d)
  }
  ok(allOk, `24 个随机世界点 500m 内均有保底闪烁门（最近 ${minD.toFixed(0)}m / 最远 ${maxD.toFixed(0)}m）`)
  // 超区域宿主 chunk 生成的出口实例：位于地板瓦片且邻墙（门贴墙）、可被窗口加载
  {
    const host = regionHost(SEED, 0, 0)
    const m2 = generateLevel(L0, SEED)
    const explored2 = new Uint8Array(m2.w * m2.h)
    // 传送玩家到宿主 chunk 中心（世界坐标 → 窗口坐标），触发窗口平移加载
    const inf2 = m2.inf!
    let px2 = host.cx * CS + CS / 2 - inf2.ox
    let py2 = host.cy * CS + CS / 2 - inf2.oy
    const sh = updateInfinite(m2, L0, px2, py2, explored2)
    if (sh) { px2 -= sh.dx; py2 -= sh.dy }
    const ex = m2.exits[0]
    ok(!!ex, '宿主 chunk 加载后窗口内存在闪烁门出口实例')
    if (ex) {
      const tx = Math.floor(ex.x), ty = Math.floor(ex.y)
      const floor = tileAt(m2, tx, ty) === 1
      const nearWall = !(tileAt(m2, tx + 1, ty) === 1 && tileAt(m2, tx - 1, ty) === 1 && tileAt(m2, tx, ty + 1) === 1 && tileAt(m2, tx, ty - 1) === 1)
      ok(floor && nearWall, `出口瓦片 (${tx},${ty}) 为地板且邻墙（贴墙门，可交互）`)
      ok(ex.def.kind === 'flickerdoor' && ex.def.dest === 1, '出口实例为闪烁门且目的地 L1')
    }
  }
}

// ---- 7. 生成器物品 id 与玩家掉落物 id 不冲突 ----
{
  ok(GEN_ITEM_BASE > 100001, '生成器物品 id 基线高于掉落物 id 区间')
}

console.log(failures === 0 ? '\n全部冒烟断言通过 ✓' : `\n${failures} 项失败 ✗`)
process.exit(failures === 0 ? 0 : 1)
