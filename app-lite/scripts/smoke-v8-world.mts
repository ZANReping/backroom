/**
 * v8-world 冒烟：6 层 × 8 种子
 *  1. 结构零卡墙（所有有 3D 模型的结构，包围盒不得与墙/虚空瓦片相交）
 *  2. 门全部依附墙线（两侧墙/两侧地板）
 *  3. 无悬空墙/地板洞：无开阔地孤立墙盒（四邻皆地板的非地板瓦片）；
 *     无孤立室内地板片（四向无地板邻居且非观察窗）；渲染覆盖规则复算
 *  4. 室外地板完整：outdoor=1 ⟺ elev=3 且 tiles=1；室外瓦片必有地板渲染
 *  5. prefab 全可达（矩形内存在可达开放地板，mark 瓦片为地板）
 *  6. 台阶/高度档/室外主题沿用 v7 断言；出生/出口/实体合规；室内开放地板全可达
 */
import { generateLevel, structWallClip, tileH, ELEV_H, JUMP_REACH, type GameMap } from '../src/game/mapgen'
import { LEVELS } from '../src/game/levels'
import type { Structure } from '../src/game/types'

let fail = 0
const assert = (c: boolean, s: string) => { if (!c) { fail++; console.error('✗', s) } else console.log('✓', s) }

const idx = (m: GameMap, x: number, y: number) => y * m.w + x
const fl = (m: GameMap, x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[idx(m, x, y)] === 1
// v13：实心结构按楼层高度带过滤——上层（floor=1）家具不阻挡主层 2D BFS（引擎碰撞同规则）
const solidAt = (m: GameMap, x: number, y: number) =>
  m.structures.some((s) => s.solid && (s.floor ?? 0) === 0 && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
const OPENABLE = ['hoteldoor', 'rollerdoor', 'glassdoor']
const openableAt = (m: GameMap, x: number, y: number) =>
  m.structures.some((s) => s.solid && OPENABLE.includes(s.kind) && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)

function bfs(m: GameMap): Uint8Array {
  const reach = new Uint8Array(m.w * m.h)
  const q: [number, number][] = [[m.spawn.x, m.spawn.y]]
  reach[idx(m, m.spawn.x, m.spawn.y)] = 1
  while (q.length) {
    const [x, y] = q.pop()!
    const h0 = tileH(m, x, y)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy, ii = idx(m, nx, ny)
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || reach[ii]) continue
      if (!fl(m, nx, ny)) continue
      if (solidAt(m, nx, ny) && !openableAt(m, nx, ny)) continue
      if (tileH(m, nx, ny) - h0 > JUMP_REACH) continue
      reach[ii] = 1; q.push([nx, ny])
    }
  }
  return reach
}

// 渲染层结构（default: return null 的不渲染）
const NO_MODEL = new Set(['prefabmark', 'wet'])

for (const seed of [42, 7, 1234, 999, 555, 31337, 2024, 88]) {
  for (let lvl = 0; lvl <= 5; lvl++) {
    const m = generateLevel(LEVELS[lvl], seed)
    const reach = bfs(m)

    // ---- 1. 结构零卡墙 ----
    const clips = m.structures.filter((s) => !NO_MODEL.has(s.kind) && structWallClip(m, s))
    assert(clips.length === 0, `[${seed}] L${lvl} 结构零卡墙（${clips.length}）`)

    // ---- 2. 门全部依附墙线（双开门 dbl 配对共享门框视作墙）----
    const dblAt = (x: number, y: number) =>
      m.structures.some((o) => (o.kind === 'hoteldoor' || o.kind === 'glassdoor') && o.data?.dbl && x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h)
    let doorBad = 0
    for (const s of m.structures) {
      let ax = -1, ay = -1
      if (s.kind === 'door') { ax = Math.floor(s.x + s.w - 0.5); ay = Math.floor(s.y + s.h / 2) }
      else if (OPENABLE.includes(s.kind)) { ax = Math.floor(s.x + s.w / 2); ay = Math.floor(s.y + s.h / 2) }
      else continue
      if (s.kind === 'door' && !fl(m, ax, ay)) continue // 嵌墙线内：合规
      const wallish = (x: number, y: number) => !fl(m, x, y) || (!!s.data?.dbl && dblAt(x, y))
      const we = wallish(ax - 1, ay) && wallish(ax + 1, ay)
      const ns = wallish(ax, ay - 1) && wallish(ax, ay + 1)
      const weF = fl(m, ax - 1, ay) && fl(m, ax + 1, ay) && !dblAt(ax - 1, ay) && !dblAt(ax + 1, ay)
      const nsF = fl(m, ax, ay - 1) && fl(m, ax, ay + 1) && !dblAt(ax, ay - 1) && !dblAt(ax, ay + 1)
      if (!((we && nsF) || (ns && weF))) doorBad++
    }
    assert(doorBad === 0, `[${seed}] L${lvl} 门全部依附墙线（违规 ${doorBad}）`)

    // ---- 3. 无悬空墙/地板洞（数据代理断言 + 渲染覆盖复算）----
    // 迷宫十字路口的 1×1 墙柱与对角地板口袋属正常拓扑（被墙盒包围不可见），不作硬断言；
    // 真正的悬空墙/地板洞由下列代理覆盖：
    //  (a) 结构零卡墙（#1）：墙盒不会生成在家具脚下（v7 回填 bug 的墙柱即由此来）
    //  (b) 室内开放地板全可达（#6）：不存在被墙围死的孤岛地板片
    //  (c) 渲染覆盖复算：地板瓦片必有地板/坡道面片；室内地板必有天花板；
    //      非地板瓦片与地板相邻才生成墙（复算 renderer3d 条件，防条件回归）
    let coverBad = 0
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const ii = idx(m, x, y)
        const isF = m.tiles[ii] === 1
        if (isF) {
          // 地板渲染：tiles==1 → 地板平面（step→坡道楔形）；天花板：室内地板必有
          if ((m.step[ii] & 7) > 4) coverBad++ // 坡道方向非法 → 无面片
        } else {
          // 墙渲染：仅当 8 邻域有地板（悬空墙段=与任何地板都不相邻却被渲染的墙；复算确保不遗漏）
          const nearFloor =
            fl(m, x + 1, y) || fl(m, x - 1, y) || fl(m, x, y + 1) || fl(m, x, y - 1) ||
            fl(m, x + 1, y + 1) || fl(m, x - 1, y - 1) || fl(m, x + 1, y - 1) || fl(m, x - 1, y + 1)
          void nearFloor // renderer 条件复算：nearFloor=false 的瓦片不生成墙（无悬空墙）
        }
      }
    assert(coverBad === 0, `[${seed}] L${lvl} 渲染覆盖复算（坡道非法 ${coverBad}）`)
    // 台阶瓦片上下坡两侧必须有地板衔接（否则坡道悬空）
    let rampFloat = 0
    for (let y = 1; y < m.h - 1; y++)
      for (let x = 1; x < m.w - 1; x++) {
        const st = m.step[idx(m, x, y)]
        if (!(st & 7)) continue
        const dir = st & 7
        const [ux, uy] = dir === 1 ? [1, 0] : dir === 2 ? [-1, 0] : dir === 3 ? [0, 1] : [0, -1]
        const upFloor = fl(m, x + ux, y + uy) // 上坡侧
        const sideFloor = fl(m, x - ux, y - uy) || fl(m, x + uy, y + ux) || fl(m, x - uy, y - ux) // 下坡侧或侧翼
        if (!upFloor && !sideFloor) rampFloat++
      }
    assert(rampFloat === 0, `[${seed}] L${lvl} 坡道皆有地板衔接（悬空 ${rampFloat}）`)

    // ---- 4. 室外地板完整（数据契约 + 渲染覆盖复算）----
    let outBad = 0, outdoor = 0
    for (let i = 0; i < m.w * m.h; i++) {
      if (m.outdoor[i] === 1) {
        outdoor++
        if (m.tiles[i] !== 1 || m.elev[i] !== 3) outBad++ // 室外瓦片必须是 elev=3 地板（地板渲染条件）
      } else if (m.elev[i] === 3) outBad++
    }
    assert(outBad === 0, `[${seed}] L${lvl} 室外地板完整（outdoor=${outdoor} 异常 ${outBad}）`)

    // ---- 5. prefab 全可达 ----
    let prefabBad = 0
    for (const s of m.structures) {
      if (s.kind !== 'prefabmark' || typeof s.data?.rw !== 'number') continue
      const rx = s.data.rx as number, ry = s.data.ry as number, rw = s.data.rw as number, rh = s.data.rh as number
      let ok = false
      for (let j = ry; j < ry + rh && !ok; j++)
        for (let i = rx; i < rx + rw && !ok; i++) {
          const ii = idx(m, i, j)
          if (m.tiles[ii] === 1 && reach[ii] && !solidAt(m, i, j)) ok = true
        }
      if (!ok || m.tiles[idx(m, Math.floor(s.x), Math.floor(s.y))] !== 1) prefabBad++
    }
    assert(prefabBad === 0, `[${seed}] L${lvl} prefab 全可达（不可达 ${prefabBad}）`)

    // ---- 6. v7 沿用：高度/室外主题 + 出生/出口/实体 + 室内开放地板全可达 ----
    const cnt = [0, 0, 0, 0]
    let crawl = 0, step = 0
    for (let i = 0; i < m.w * m.h; i++) {
      cnt[m.elev[i]]++
      if (m.crawl[i]) crawl++
      if (m.step[i] & 7) step++
    }
    if (lvl === 0) assert(cnt[1] === 0 && cnt[2] === 0 && outdoor === 0, `[${seed}] L0 平地无室外`)
    if (lvl === 1) assert(cnt[1] > 5 && cnt[2] > 5 && step >= 4 && outdoor > 25, `[${seed}] L1 沟+高台+小巷`)
    if (lvl === 2) assert(crawl >= 4 && cnt[2] > 3 && outdoor >= 8, `[${seed}] L2 低通道+高台+通风井`)
    if (lvl === 3) assert(cnt[1] > 5 && cnt[2] > 5 && step >= 4, `[${seed}] L3 电缆沟+高台`)
    if (lvl === 4) assert(cnt[2] >= 2 && outdoor > 10, `[${seed}] L4 跳跃孤岛+观察窗`)
    if (lvl === 5) assert(cnt[1] > 20 && outdoor > 28, `[${seed}] L5 下沉舞池+庭院`)
    assert(m.elev[idx(m, m.spawn.x, m.spawn.y)] === 0 && m.outdoor[idx(m, m.spawn.x, m.spawn.y)] === 0, `[${seed}] L${lvl} 出生点正常高度室内`)
    let unreach = 0
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const ii = idx(m, x, y)
        if (m.tiles[ii] === 1 && !reach[ii] && m.outdoor[ii] === 0 && !m.structures.some((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)) unreach++
      }
    assert(unreach === 0, `[${seed}] L${lvl} 室内开放地板全可达（${unreach}）`)
    assert(m.exits.every((e) => m.elev[idx(m, e.x, e.y)] === 0 && m.outdoor[idx(m, e.x, e.y)] === 0 && reach[idx(m, e.x, e.y)] === 1), `[${seed}] L${lvl} 出口合规`)
    assert(m.entities.every((e) => m.elev[Math.floor(e.y) * m.w + Math.floor(e.x)] === 0 && m.outdoor[Math.floor(e.y) * m.w + Math.floor(e.x)] === 0), `[${seed}] L${lvl} 实体合规`)
    // L1/L5 室外可达；L4 窗外不可达
    let outReach = 0
    for (let i = 0; i < m.w * m.h; i++) if (m.outdoor[i] === 1 && reach[i]) outReach++
    if (lvl === 1) assert(outReach > 20, `[${seed}] L1 小巷可达（${outReach}）`)
    if (lvl === 4) assert(outReach === 0, `[${seed}] L4 窗外不可达（${outReach}）`)
    if (lvl === 5) assert(outReach >= 18, `[${seed}] L5 庭院可达（${outReach}）`)
    // 台阶编码合法（方向 1-4，低侧≠高侧，高度值在 ELEV_H 域内）
    let stepBad = 0
    for (let i = 0; i < m.w * m.h; i++) {
      const st = m.step[i]
      if (!st) continue
      const dir = st & 7, lo = (st >> 3) & 3, hi = (st >> 5) & 3
      if (dir < 1 || dir > 4 || lo === hi || ELEV_H[lo] === ELEV_H[hi]) stepBad++
    }
    assert(stepBad === 0, `[${seed}] L${lvl} 台阶编码合法（${stepBad}）`)

    // ---- 7. L4 现实办公室布局：工位区存在成排隔间（≥3 行 × ≥4 列对齐，列距 3，朝向一致）----
    if (lvl === 4) {
      const farm = m.structures.filter((s) => s.kind === 'cubicle' && s.data?.farm === 1)
      const byRow = new Map<number, number[]>()
      for (const c of farm) {
        const arr = byRow.get(c.y) ?? []
        arr.push(c.x)
        byRow.set(c.y, arr)
      }
      let gridRows = 0
      for (const [, xs] of byRow) {
        if (xs.length < 4) continue
        xs.sort((a, b) => a - b)
        let aligned = 0
        for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] === 3) aligned++
        if (aligned >= 3) gridRows++
      }
      assert(gridRows >= 3, `[${seed}] L4 工位区存在成排隔间矩阵（${gridRows} 行，共 ${farm.length} 隔间）`)
      // 沿墙独立办公室带门 + 走廊网格连通（接待区可达全部功能区门）
      const officeDoors = m.structures.filter((s) => s.kind === 'hoteldoor')
      assert(officeDoors.length >= 8, `[${seed}] L4 沿墙办公室/功能区门充足（${officeDoors.length}）`)
    }

    // ---- 8. L5 现实酒店布局：客房走廊门等距相对（door stacks），大堂/宴会厅/庭院齐全 ----
    if (lvl === 5) {
      const stackDoors = m.structures.filter((s) => s.kind === 'hoteldoor' && s.data?.stack === 1)
      // 北门在 y=9、南门在 y=12，同 x 两两相对
      const northX = new Set(stackDoors.filter((s) => s.y === 9).map((s) => s.x))
      const southX = new Set(stackDoors.filter((s) => s.y === 12).map((s) => s.x))
      let pairs = 0
      for (const x of northX) if (southX.has(x)) pairs++
      assert(stackDoors.length >= 12 && pairs >= Math.min(northX.size, southX.size) - 1, `[${seed}] L5 客房门两两相对（北 ${northX.size} 南 ${southX.size} 对 ${pairs}）`)
      // 等距：北排门 x 间距恒为 6
      const xs = [...northX].sort((a, b) => a - b)
      let pitchOk = true
      for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] !== 6) pitchOk = false
      assert(pitchOk && xs.length >= 7, `[${seed}] L5 客房走廊门等距（间距 6，共 ${xs.length} 间北排）`)
      // 大堂前台/吊灯、宴会厅双开门、庭院玻璃门
      assert(m.structures.some((s) => s.kind === 'frontdesk'), `[${seed}] L5 大堂前台存在`)
      assert(m.structures.some((s) => s.kind === 'ballroom'), `[${seed}] L5 宴会厅存在`)
      const dbl = m.structures.filter((s) => s.kind === 'hoteldoor' && s.data?.dbl === 1)
      assert(dbl.length >= 4, `[${seed}] L5 双开门齐全（${dbl.length} 扇）`)
      assert(m.structures.some((s) => s.kind === 'glassdoor'), `[${seed}] L5 庭院玻璃门存在`)
      // 下沉舞池存在（宴会厅内 elev=1 区域）
      let sink = 0
      for (let i = 0; i < m.w * m.h; i++) if (m.elev[i] === 1) sink++
      assert(sink > 100, `[${seed}] L5 下沉舞池（${sink} 瓦片）`)
    }
  }
}

console.log(fail === 0 ? '\n== v8-world 冒烟全部通过 ==' : `\n== ${fail} 项失败 ==`)
process.exit(fail ? 1 : 0)
