/**
 * v13-world 冒烟：多层结构 + 液体系统
 *  A. 地图生成（4 种子 × 6 层）：
 *     1. L4 办公室双层：floors=2、有楼梯跑道(≥5 格)与电梯(lift)、bfs3D 全部上层可走格跨层可达
 *     2. L5 酒店：大堂回廊可行走(up 格≥20)+楼梯、布草间夹层+攀爬梯；泳池 liquid=1(≥20 格)
 *     3. L3 电站：至少部分种子有维修平台+梯子
 *     4. L2：浅水洼 liquid=2(≥8 格)
 *     5. 通用：上层实体/物品/灯必须落在 up=1 可达格；lift 格两层可达；梯子 top/bottom 可达
 *  B. 引擎模拟（无头）：
 *     6. L4 走楼梯：z 从 0 连续爬升至 3.0，floor 0→1
 *     7. L4 电梯：交互后 ride 送达上层（z=3，floor=1），再乘回
 *     8. L5 泳池：入水下沉至池底、inLiquid=1、移动减速；跳跃划水上浮；岸边爬出
 *     9. L5 布草间梯子：贴近按住前进攀至夹层（z=3）
 */
import { generateLevel, bfs3D, bandOfZ, FLOOR_H, POOL_DEPTH, tileH, type GameMap } from '../src/game/mapgen'
import { LEVELS } from '../src/game/levels'
import { Engine } from '../src/game/engine'

let fail = 0
const assert = (c: boolean, s: string) => { if (!c) { fail++; console.error('✗', s) } else console.log('✓', s) }
const idx = (m: GameMap, x: number, y: number) => y * m.w + x
const SEEDS = [7, 42, 1337, 9021]

// ---------- A. 地图生成 ----------
let l3Built = 0
for (const seed of SEEDS) {
  for (const def of LEVELS) {
    const m = generateLevel(def, seed + def.id * 131)
    assert(m.floors === 1 || m.floors === 2, `[${seed}] L${def.id} floors 字段合法 (${m.floors})`)
    // 液体
    let deep = 0, shallow = 0, upTiles = 0
    for (let i = 0; i < m.w * m.h; i++) {
      if (m.liquid[i] === 1) deep++
      if (m.liquid[i] === 2) shallow++
      if (m.up[i] === 1 && m.upWall[i] !== 1 && m.stair[i] === 0) upTiles++
    }
    if (def.id === 5) assert(deep >= 20, `[${seed}] L5 泳池深水 ${deep} 格 ≥20`)
    else assert(deep === 0, `[${seed}] L${def.id} 无深水`)
    if (def.id === 2) assert(shallow >= 8, `[${seed}] L2 浅水洼 ${shallow} 格 ≥8`)
    // 多层
    if (m.floors === 2) {
      const reach = bfs3D(m)
      const solidUp = (x: number, y: number) =>
        m.structures.some((s) => s.solid && (s.floor ?? 0) === 1 && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
      let bad = 0
      for (let y = 0; y < m.h; y++)
        for (let x = 0; x < m.w; x++) {
          const i = idx(m, x, y)
          // 上层可走格（排除实心家具占位）全部跨层可达
          if (m.up[i] === 1 && m.upWall[i] !== 1 && m.stair[i] === 0 && !solidUp(x, y) && !reach[i * 2 + 1]) bad++
        }
      assert(bad === 0, `[${seed}] L${def.id} 上层可走格全部跨层可达（不可达 ${bad}）`)
      // lift 格两层可达
      for (const s of m.structures) {
        if (s.kind !== 'lift') continue
        const i = idx(m, Math.floor(s.x), Math.floor(s.y))
        assert(reach[i * 2] === 1 && reach[i * 2 + 1] === 1, `[${seed}] L${def.id} 电梯格(${s.x},${s.y}) 两层可达`)
      }
      // 梯子 base/top 可达
      for (const s of m.structures) {
        if (s.kind !== 'ladder' || !s.data?.climb) continue
        const bi = idx(m, Math.floor(s.x), Math.floor(s.y))
        const ti = idx(m, s.data.tx as number, s.data.ty as number)
        assert(reach[bi * 2] === 1 && reach[ti * 2 + 1] === 1, `[${seed}] L${def.id} 攀爬梯(${s.x},${s.y})→(${s.data.tx},${s.data.ty}) 两端可达`)
      }
      // 上层实体/物品落在 up=1 格
      for (const e of m.entities) {
        if (e.z < 1.5) continue
        const i = idx(m, Math.floor(e.x), Math.floor(e.y))
        assert(m.up[i] === 1 && reach[i * 2 + 1] === 1, `[${seed}] L${def.id} 上层实体 ${e.def.type} 落在上层可达格`)
      }
      for (const it of m.items) {
        if ((it.z ?? 0) < 1.5) continue
        const i = idx(m, Math.floor(it.x), Math.floor(it.y))
        assert(m.up[i] === 1 && reach[i * 2 + 1] === 1, `[${seed}] L${def.id} 上层物品 ${it.type} 落在上层可达格`)
      }
      // 出生点不在楼梯/液体上
      const si = idx(m, m.spawn.x, m.spawn.y)
      assert(m.stair[si] === 0 && m.liquid[si] === 0, `[${seed}] L${def.id} 出生点不在楼梯/液体上`)
    }
    if (def.id === 4) {
      assert(m.floors === 2, `[${seed}] L4 生成双层办公室`)
      if (m.floors === 2) {
        const lifts = m.structures.filter((s) => s.kind === 'lift').length
        let stairs = 0
        for (let i = 0; i < m.w * m.h; i++) if (m.stair[i] & 7) stairs++
        assert(lifts >= 1, `[${seed}] L4 有电梯（${lifts}）`)
        assert(stairs >= 5, `[${seed}] L4 有楼梯跑道（${stairs} 格）`)
      }
    }
    if (def.id === 5) {
      assert(m.floors === 2, `[${seed}] L5 生成可行走回廊/夹层`)
      if (m.floors === 2) {
        assert(upTiles >= 20, `[${seed}] L5 大堂回廊上层格 ${upTiles} ≥20`)
        assert(m.structures.some((s) => s.kind === 'ladder' && s.data?.climb), `[${seed}] L5 布草间攀爬梯存在`)
        let stairs = 0
        for (let i = 0; i < m.w * m.h; i++) if (m.stair[i] & 7) stairs++
        assert(stairs >= 5, `[${seed}] L5 大堂楼梯跑道（${stairs} 格）`)
      }
    }
    if (def.id === 3 && m.floors === 2) l3Built++
  }
}
assert(l3Built >= 2, `L3 维修平台：4 种子中 ${l3Built} 个生成（≥2）`)

// ---------- B. 引擎模拟 ----------
const mkEngine = (level: number, seed = 1337) => {
  const e = new Engine()
  e.newRun(seed, 'normal')
  e.loadLevel(level)
  e.dev.god = true
  return e
}
const runFrames = (e: Engine, n: number, input?: { mx?: number; my?: number; jump?: boolean; interact?: boolean }) => {
  for (let i = 0; i < n; i++) {
    e.input.mx = input?.mx ?? 0
    e.input.my = input?.my ?? 0
    if (input?.jump) e.input.jump = true
    if (input?.interact) e.input.interact = true
    e.update(1 / 60)
  }
  e.input.mx = 0; e.input.my = 0
}

// 6. L4 走楼梯跨层
{
  const e = mkEngine(4)
  const m = e.map!
  assert(m.floors === 2, '模拟 L4 为双层')
  // 找楼梯底格（lo=0 的跑道起点）
  let sx = -1, sy = -1, sdir = 0
  for (let y = 0; y < m.h && sx < 0; y++)
    for (let x = 0; x < m.w; x++) {
      const v = m.stair[idx(m, x, y)]
      if ((v & 7) && ((v >> 3) & 0x3fff) === 0) { sx = x; sy = y; sdir = v & 7; break }
    }
  assert(sx >= 0, 'L4 找到楼梯底格')
  const p = e.player
  p.x = sx + 0.5; p.y = sy + 0.5; p.z = 0; p.vz = 0
  const mv = sdir === 1 ? { mx: 1, my: 0 } : sdir === 2 ? { mx: -1, my: 0 } : sdir === 3 ? { mx: 0, my: 1 } : { mx: 0, my: -1 }
  let maxZ = -1
  for (let k = 0; k < 40; k++) {
    runFrames(e, 10, mv)
    maxZ = Math.max(maxZ, p.z)
    if (p.floor === 1 && p.z > 2.9) break
  }
  runFrames(e, 30)
  assert(maxZ > 2.9 && Math.abs(p.z - FLOOR_H) < 0.05 && p.floor === 1, `L4 走楼梯 z→${p.z.toFixed(2)} floor=${p.floor}（期望 3.00/1）`)

  // 7. L4 电梯乘降
  const lift = m.structures.find((s) => s.kind === 'lift')!
  assert(!!lift, 'L4 电梯存在')
  // 先回主层：直接放到电梯口主层
  p.x = lift.x + 0.5; p.y = lift.y + 0.5; p.z = 0; p.vz = 0
  runFrames(e, 10) // 稳定 + scanInteract
  const tgt = e.getInteract()
  assert(tgt?.kind === 'lift', `电梯交互目标（实际 ${tgt?.kind ?? 'null'}）`)
  runFrames(e, 1, { interact: true })
  assert(!!e.ride, '电梯乘降开始')
  runFrames(e, 140) // 1.7s 行程 + 余量
  assert(!e.ride && Math.abs(p.z - FLOOR_H) < 0.05 && p.floor === 1, `电梯送达上层 z=${p.z.toFixed(2)} floor=${p.floor}`)
  // 乘回主层
  runFrames(e, 10)
  runFrames(e, 1, { interact: true })
  runFrames(e, 140)
  assert(!e.ride && Math.abs(p.z) < 0.05 && p.floor === 0, `电梯送回主层 z=${p.z.toFixed(2)} floor=${p.floor}`)
  // 上层有独立房间/物品/实体
  const upItems = m.items.filter((it) => (it.z ?? 0) >= 1.5).length
  const upEnts = m.entities.filter((en) => en.z >= 1.5).length
  assert(upItems >= 1, `L4 上层物品 ${upItems} 件`)
  assert(upEnts >= 1, `L4 上层实体 ${upEnts} 只`)
}

// 8. L5 泳池深水
{
  const e = mkEngine(5)
  const p = e.player
  p.x = 49.5; p.y = 27.5; p.z = 0; p.vz = 0 // 池中央
  // 下沉（不划水会沉到池底）
  runFrames(e, 240)
  assert(e.inLiquid === 1, `入水 inLiquid=${e.inLiquid}`)
  assert(p.z <= -POOL_DEPTH + 0.01, `下沉至池底 z=${p.z.toFixed(2)}（=-${POOL_DEPTH}）`)
  assert(e.submerged, '头没入水下（submerged）')
  assert(e.breathT > 0, '屏气计时开始')
  const bubbles = e.particles.some((pt) => pt.color === '#9fd4f0')
  assert(bubbles, '水下气泡粒子触发')
  // 移动减速：对比位移
  p.x = 49.5; p.y = 27.5
  const x0 = p.x
  runFrames(e, 60, { mx: 1, my: 0 })
  const movedWet = p.x - x0
  runFrames(e, 60)
  p.x = 44.5; p.y = 22.5; p.z = 0; p.vz = 0 // 庭院干地
  const x1 = p.x
  runFrames(e, 60, { mx: 1, my: 0 })
  const movedDry = p.x - x1
  assert(movedWet < movedDry * 0.7, `水中减速（湿 ${movedWet.toFixed(2)}m vs 干 ${movedDry.toFixed(2)}m）`)
  // 划水上浮 + 岸边爬出
  p.x = 47.5; p.y = 27.5; p.z = -POOL_DEPTH; p.vz = 0
  for (let k = 0; k < 30; k++) {
    runFrames(e, 6, { mx: -1, my: 0, jump: true })
    if (e.inLiquid === 0 && Math.abs(p.z) < 0.05) break
  }
  runFrames(e, 20)
  assert(e.inLiquid === 0 && Math.abs(p.z) < 0.05, `划水爬出泳池 z=${p.z.toFixed(2)} inLiquid=${e.inLiquid}`)
  assert(!e.submerged && e.breathT === 0, '出水后恢复呼吸')
}

// 9. L5 布草间梯子攀爬
{
  const e = mkEngine(5)
  const m = e.map!
  const lad = m.structures.find((s) => s.kind === 'ladder' && s.data?.climb)
  assert(!!lad, 'L5 攀爬梯存在')
  if (lad) {
    const p = e.player
    p.x = lad.x + 0.5; p.y = lad.y - 0.4; p.z = 0; p.vz = 0
    p.facing = Math.PI / 2 // 面向 +y（梯子中心方向）
    for (let k = 0; k < 20; k++) {
      runFrames(e, 10, { mx: 0, my: 1 })
      if (p.floor === 1 && !e.climb) break // 攀爬完成（送达顶格）才停
    }
    assert(Math.abs(p.z - FLOOR_H) < 0.01 && p.floor === 1, `梯子攀至夹层 z=${p.z.toFixed(2)} floor=${p.floor}`)
    // 送达点在顶格附近（送达后余帧可能继续行走，允许 1.2m 容差），且落脚格为上层楼板
    const dTop = Math.hypot(p.x - ((lad.data!.tx as number) + 0.5), p.y - ((lad.data!.ty as number) + 0.5))
    assert(dTop < 1.2 && m.up[idx(m, Math.floor(p.x), Math.floor(p.y))] === 1, `送达夹层顶格（距顶格 ${dTop.toFixed(2)}m）`)
  }
}

console.log(fail === 0 ? '\n== v13-world 冒烟全部通过 ==' : `\n== v13-world 冒烟 ${fail} 项失败 ==`)
process.exit(fail ? 1 : 0)
