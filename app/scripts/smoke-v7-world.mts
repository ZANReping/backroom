/**
 * v7-world 冒烟（node --experimental-strip-types 或 esbuild 打包后运行）
 * 覆盖：
 *  1. 数据契约字段（GameMap.elev/outdoor、PlayerState.z/vz/crouching、input.jump/crouch）
 *  2. 高度档生成（各层级主题：L1 沟+高台、L2 低通道+高台、L3 电缆沟+高台、L4 跳跃孤岛、L5 下沉舞池、L0 平地）
 *  3. 台阶连通 BFS（含台阶/跳跃通行规则，全部室内地板可达）
 *  4. 跳跃上高台（引擎模拟：起跳后能上 +1.2m 高台；不起跳上不去）
 *  5. 蹲伏过低通道（未蹲伏被风道阻挡，蹲伏可通过）
 *  6. 室外场景存在（L1 小巷/L2 通风井/L4 窗景/L5 庭院+客房窗）且 L4 窗区不可达
 *  7. 出生/出口/实体强制正常高度室内可达区
 */
import { generateLevel, tileH, tileAt, groundHeightAt, ELEV_H, JUMP_REACH, type GameMap } from '../src/game/mapgen'
import { LEVELS } from '../src/game/levels'
import { Engine } from '../src/game/engine'

let fail = 0
const assert = (c: boolean, s: string) => { if (!c) { fail++; console.error('✗', s) } else console.log('✓', s) }

const OPENABLE = ['hoteldoor', 'rollerdoor', 'glassdoor']
const openableAt = (m: GameMap, x: number, y: number) =>
  m.structures.some((s) => s.solid && OPENABLE.includes(s.kind) && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
// v13：实心结构按楼层高度带过滤——上层（floor=1）家具不阻挡主层 2D BFS（引擎碰撞同规则）
const solidAt = (m: GameMap, x: number, y: number) =>
  m.structures.some((s) => s.solid && (s.floor ?? 0) === 0 && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
const passFloor = (m: GameMap, x: number, y: number) =>
  x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[y * m.w + x] === 1 && (!solidAt(m, x, y) || openableAt(m, x, y))

function bfsReach(m: GameMap): Uint8Array {
  const reach = new Uint8Array(m.w * m.h)
  const q: [number, number][] = [[m.spawn.x, m.spawn.y]]
  reach[m.spawn.y * m.w + m.spawn.x] = 1
  while (q.length) {
    const [x, y] = q.pop()!
    const h0 = tileH(m, x, y)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy, ii = ny * m.w + nx
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || reach[ii]) continue
      if (!passFloor(m, nx, ny)) continue
      if (tileH(m, nx, ny) - h0 > JUMP_REACH) continue // 台阶 0.6 / 跳跃 1.2 通行规则
      reach[ii] = 1; q.push([nx, ny])
    }
  }
  return reach
}

// ---------- 1. 数据契约 ----------
{
  const m = generateLevel(LEVELS[1], 42)
  assert(m.elev instanceof Uint8Array && m.elev.length === m.w * m.h, '契约：GameMap.elev Uint8Array')
  assert(m.outdoor instanceof Uint8Array && m.outdoor.length === m.w * m.h, '契约：GameMap.outdoor Uint8Array')
  const eng = new Engine()
  const p = eng.player as unknown as Record<string, unknown>
  assert(typeof p.z === 'number' && typeof p.vz === 'number' && typeof p.crouching === 'boolean', '契约：PlayerState.z/vz/crouching')
  const inp = eng.input as unknown as Record<string, unknown>
  assert(typeof inp.jump === 'boolean' && typeof inp.crouch === 'boolean', '契约：input.jump/crouch')
}

// ---------- 2/3/6/7. 生成与连通（多种子） ----------
for (const seed of [42, 7, 1234, 999]) {
  for (let lvl = 0; lvl <= 5; lvl++) {
    const m = generateLevel(LEVELS[lvl], seed)
    const cnt = [0, 0, 0, 0]
    let crawl = 0, step = 0, outdoor = 0
    for (let i = 0; i < m.w * m.h; i++) {
      cnt[m.elev[i]]++
      if (m.crawl[i]) crawl++
      if (m.step[i] & 7) step++
      if (m.outdoor[i]) outdoor++
    }
    if (lvl === 0) { assert(cnt[1] === 0 && cnt[2] === 0 && outdoor === 0, `[${seed}] L0 平地无室外`) }
    if (lvl === 1) assert(cnt[1] > 5 && cnt[2] > 5 && step >= 4, `[${seed}] L1 下沉检修沟+高台车位+台阶`)
    if (lvl === 2) assert(crawl >= 4 && cnt[2] > 3, `[${seed}] L2 蹲伏低通道+高维修平台`)
    if (lvl === 3) assert(cnt[1] > 5 && cnt[2] > 5 && step >= 4, `[${seed}] L3 电缆沟+发电机高台`)
    if (lvl === 4) assert(cnt[2] >= 2, `[${seed}] L4 高文件柜顶（跳跃孤岛）`)
    if (lvl === 5) assert(cnt[1] > 20, `[${seed}] L5 下沉舞池`)
    assert(m.elev[m.spawn.y * m.w + m.spawn.x] === 0, `[${seed}] L${lvl} 出生点正常高度`)
    // 室外存在性
    if (lvl === 1) assert(outdoor > 25 && m.structures.some((s) => s.kind === 'rollerdoor'), `[${seed}] L1 卷帘门外小巷`)
    if (lvl === 2) assert(outdoor >= 8, `[${seed}] L2 通风井露天`)
    if (lvl === 4) assert(outdoor > 10 && m.structures.filter((s) => s.kind === 'glasswin').length >= 3, `[${seed}] L4 雾中城市观察窗`)
    if (lvl === 5) assert(outdoor > 28 && m.structures.some((s) => s.kind === 'glassdoor') && m.structures.filter((s) => s.kind === 'glasswin').length >= 2, `[${seed}] L5 庭院泳池+客房夜景窗`)
    assert(outdoor === cnt[3], `[${seed}] L${lvl} outdoor=1 ⟺ elev=3`)
    // 连通 BFS（含台阶/跳跃规则）：室内无结构地板全可达
    const reach = bfsReach(m)
    let unreach = 0
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const ii = y * m.w + x
        if (m.tiles[ii] === 1 && !reach[ii] && m.outdoor[ii] === 0 && !m.structures.some((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)) unreach++
      }
    assert(unreach === 0, `[${seed}] L${lvl} 台阶连通 BFS：室内地板全可达（不可达 ${unreach}）`)
    // 出口/实体在正常高度室内可达区
    assert(m.exits.every((e) => m.elev[e.y * m.w + e.x] === 0 && m.outdoor[e.y * m.w + e.x] === 0 && reach[e.y * m.w + e.x] === 1), `[${seed}] L${lvl} 出口强制正常高度可达区`)
    assert(m.entities.every((e) => m.elev[Math.floor(e.y) * m.w + Math.floor(e.x)] === 0 && m.outdoor[Math.floor(e.y) * m.w + Math.floor(e.x)] === 0), `[${seed}] L${lvl} 实体强制正常高度区`)
    // L4 窗区不可达（仅观察）
    if (lvl === 4) {
      let outReach = 0
      for (let i = 0; i < m.w * m.h; i++) if (m.outdoor[i] === 1 && reach[i]) outReach++
      assert(outReach === 0, `[${seed}] L4 窗外城市不可达（${outReach}）`)
    }
    // L1 小巷经卷帘门可达；L5 庭院经玻璃门可达
    if (lvl === 1) {
      let outReach = 0
      for (let i = 0; i < m.w * m.h; i++) if (m.outdoor[i] === 1 && reach[i]) outReach++
      assert(outReach > 20, `[${seed}] L1 小巷经卷帘门可达（${outReach}）`)
    }
    if (lvl === 5) {
      let outReach = 0
      for (let i = 0; i < m.w * m.h; i++) if (m.outdoor[i] === 1 && reach[i]) outReach++
      assert(outReach >= 18, `[${seed}] L5 庭院经玻璃门可达（${outReach}）`)
    }
  }
}

// ---------- 4. 跳跃上高台（引擎模拟；L4 无台阶跳跃孤岛） ----------
{
  let jumped = 0, blocked = 0, tried = 0
  for (const seed of [42, 7, 1234, 999, 555, 31337]) {
    if (tried >= 6) break
    const eng0 = new Engine()
    eng0.newRun(seed, 'normal')
    eng0.devJump(4)
    const m = eng0.map!
    for (let y = 2; y < m.h - 2 && tried < 6; y++) {
      for (let x = 2; x < m.w - 2 && tried < 6; x++) {
        if (m.elev[y * m.w + x] !== 2) continue
        // 找孤岛西侧相邻正常地板作为起跳点
        if (m.tiles[y * m.w + x - 1] !== 1 || m.elev[y * m.w + x - 1] !== 0 || tileAt(m, x - 1, y) !== 1) continue
        if (m.tiles[y * m.w + x - 2] !== 1 || m.elev[y * m.w + x - 2] !== 0 || tileAt(m, x - 2, y) !== 1) continue
        tried++
        // (a) 不起跳：直接走应被 1.2m 高差挡住
        {
          const eng = new Engine()
          eng.newRun(seed, 'normal')
          eng.devJump(4)
          eng.player.x = x - 1.5; eng.player.y = y + 0.5; eng.player.z = 0; eng.player.vz = 0
          eng.input.mx = 1; eng.input.my = 0
          for (let i = 0; i < 90; i++) eng.step(1 / 60)
          eng.input.mx = 0
          if (eng.player.z < 0.2 && Math.floor(eng.player.x) !== x) blocked++
        }
        // (b) 起跳：跳跃滞空中应能上高台
        {
          const eng = new Engine()
          eng.newRun(seed, 'normal')
          eng.devJump(4)
          eng.player.x = x - 1.2; eng.player.y = y + 0.5; eng.player.z = 0; eng.player.vz = 0
          eng.input.mx = 1; eng.input.my = 0
          eng.input.jump = true
          for (let i = 0; i < 150; i++) {
            eng.step(1 / 60)
            if (i === 20) eng.input.jump = true // 落地后补跳一次兜底
            // 上到台面即停（孤岛仅 1 格宽；须在台面上方而非起跳途中）
            if (groundHeightAt(eng.map!, eng.player.x, eng.player.y) > 0.9 && eng.player.z > 1.1) eng.input.mx = 0
          }
          eng.input.mx = 0
          if (Math.floor(eng.player.x) === x && eng.player.z > 1.1) jumped++
        }
      }
    }
  }
  assert(tried >= 3, `跳跃测试找到 ${tried} 个跳跃孤岛`)
  assert(blocked >= tried - 1, `不起跳无法攀上高台（${blocked}/${tried}）`)
  assert(jumped >= 1, `跳跃可上 +1.2m 高台（成功 ${jumped}/${tried}）`)
}

// ---------- 5. 蹲伏过低通道（引擎模拟；L2） ----------
{
  let passOk = 0, blockOk = 0, tried = 0
  for (const seed of [42, 7, 1234, 999, 555, 31337]) {
    if (tried >= 4) break
    const eng0 = new Engine()
    eng0.newRun(seed, 'normal')
    eng0.devJump(2)
    const m = eng0.map!
    for (let y = 2; y < m.h - 2 && tried < 4; y++) {
      for (let x = 2; x < m.w - 2 && tried < 4; x++) {
        const ii = y * m.w + x
        if (m.crawl[ii] !== 1) continue
        // 找水平低通道入口：西侧相邻是正常地板
        if (m.tiles[ii - 1] !== 1 || m.crawl[ii - 1] !== 0 || tileAt(m, x - 1, y) !== 1) continue
        if (m.tiles[ii - 2] !== 1 || tileAt(m, x - 2, y) !== 1) continue
        tried++
        // (a) 未蹲伏：被头顶风道挡住
        {
          const eng = new Engine()
          eng.newRun(seed, 'normal')
          eng.devJump(2)
          eng.player.x = x - 1.5; eng.player.y = y + 0.5; eng.player.z = 0; eng.player.vz = 0
          eng.input.mx = 1; eng.input.my = 0
          for (let i = 0; i < 90; i++) eng.step(1 / 60)
          eng.input.mx = 0
          if (Math.floor(eng.player.x) !== x) blockOk++
        }
        // (b) 蹲伏：可通过
        {
          const eng = new Engine()
          eng.newRun(seed, 'normal')
          eng.devJump(2)
          eng.player.x = x - 1.5; eng.player.y = y + 0.5; eng.player.z = 0; eng.player.vz = 0
          eng.input.crouch = true
          eng.input.mx = 1; eng.input.my = 0
          for (let i = 0; i < 150; i++) eng.step(1 / 60)
          eng.input.mx = 0; eng.input.crouch = false
          if (Math.floor(eng.player.x) >= x) passOk++
        }
      }
    }
  }
  assert(tried >= 2, `蹲伏测试找到 ${tried} 段低通道`)
  assert(blockOk === tried, `未蹲伏被风道阻挡（${blockOk}/${tried}）`)
  assert(passOk >= 1, `蹲伏可通过低通道（${passOk}/${tried}）`)
}

// ---------- 高度函数一致性 ----------
{
  const m = generateLevel(LEVELS[1], 42)
  let ramps = 0
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const st = m.step[y * m.w + x]
      if (!(st & 7)) continue
      ramps++
      // 坡道两端高度应与两侧高度档衔接
      const lo = ELEV_H[(st >> 3) & 3], hi = ELEV_H[(st >> 5) & 3]
      const dir = st & 7
      const eps = 0.02
      let a = 0, b = 0
      if (dir === 1) { a = groundHeightAt(m, x + eps, y + 0.5); b = groundHeightAt(m, x + 1 - eps, y + 0.5) }
      if (dir === 2) { a = groundHeightAt(m, x + eps, y + 0.5); b = groundHeightAt(m, x + 1 - eps, y + 0.5) }
      if (dir === 3) { a = groundHeightAt(m, x + 0.5, y + eps); b = groundHeightAt(m, x + 0.5, y + 1 - eps) }
      if (dir === 4) { a = groundHeightAt(m, x + 0.5, y + eps); b = groundHeightAt(m, x + 0.5, y + 1 - eps) }
      const loEnd = Math.min(a, b), hiEnd = Math.max(a, b)
      assert(Math.abs(loEnd - lo) < 0.15 && Math.abs(hiEnd - hi) < 0.15, `坡道(${x},${y}) 端部高度衔接 (${loEnd.toFixed(2)}~${hiEnd.toFixed(2)} vs ${lo}~${hi})`)
    }
  assert(ramps >= 4, `L1 坡道数量 ${ramps}`)
}

console.log(fail === 0 ? '\n== v7-world 冒烟全部通过 ==' : `\n== ${fail} 项失败 ==`)
process.exit(fail ? 1 : 0)
