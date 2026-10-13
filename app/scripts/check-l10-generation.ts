// Level 10 v64 生成验收：确定性、跨区块连续、田块/树篱、湖泊、农舍、出口。
import { L10 } from '../src/game/levels/l10'
import { CS } from '../src/game/world/infinite'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  genL10ChunkRaw, l10DeepLakeExit, l10FarmsteadOf, l10LakeDepth, l10PlotAt, l10RegionExitPoint, l10RoadInfo,
  l10VariantOf, l10Wetness, L10_L9_SPAWN, L10_LAKE_T,
} from '../src/game/world/infiniteL10'

let pass = 0
const ok = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(`[L10 check] ${message}`)
  pass++
}
const seed = 0x10f00d

function hashNumbers(a: ArrayLike<number>, h = 0x811c9dc5) {
  for (let i = 0; i < a.length; i++) h = Math.imul(h ^ (Math.round(Number(a[i]) * 100000) | 0), 0x01000193)
  return h >>> 0
}
function chunkSignature(cx: number, cy: number, forced?: string) {
  const c = genL10ChunkRaw(L10, seed, cx, cy, forced)
  let h = 0x811c9dc5
  for (const a of [c.tiles, c.wet, c.elev, c.tint, c.outdoor!, c.liquid!, c.seaFloor!, c.terrain!]) h = hashNumbers(a, h)
  return `${c.variant}|${h}|${JSON.stringify([c.structures, c.items, c.exits, c.entities])}`
}

// 1. 确定性
for (const [cx, cy] of [[0, 0], [1, 0], [-7, 11], [23, -19], [255, 91]])
  ok(chunkSignature(cx, cy) === chunkSignature(cx, cy), `chunk ${cx},${cy} 非确定性`)

// 2. 区域构成：作物田为主，湖区约 5~12%，农舍/作业点/深湖为稀有
{
  const counts: Record<string, number> = {}
  let n = 0
  for (let cy = -40; cy < 40; cy++) for (let cx = -40; cx < 40; cx++) { const v = l10VariantOf(seed, cx, cy); counts[v] = (counts[v] ?? 0) + 1; n++ }
  const p = (k: string) => (counts[k] ?? 0) / n
  ok(p('wheatfield') + p('barleyfield') + p('mixedfield') > .62, `作物田占比过低 ${JSON.stringify(counts)}`)
  ok(p('wheatfield') > p('barleyfield'), '小麦应多于大麦')
  ok(p('farmstead') > .01 && p('farmstead') < .09, `农舍占比异常 ${p('farmstead')}`)
  ok(p('deeplake') > 0 && p('deeplake') < .02, `深湖占比异常 ${p('deeplake')}`)
  let lake = 0, N = 0
  for (let y = -2000; y < 2000; y += 23) for (let x = -2000; x < 2000; x += 23) { N++; if (l10LakeDepth(seed, x, y) > 0) lake++ }
  ok(lake / N > .04 && lake / N < .13, `湖面面积占比异常 ${(lake / N).toFixed(3)}`)
}

// 3. 田块：同一田块内用途与方向一致；边界上有树篱节点，且节点只出现在边界附近
{
  let hedges = 0, offEdge = 0, roadHedge = 0
  for (let cy = -3; cy <= 3; cy++) for (let cx = -3; cx <= 3; cx++) {
    const c = genL10ChunkRaw(L10, seed, cx, cy)
    for (const s of c.structures) {
      if (s.kind !== 'hedgerow') continue
      hedges++
      const p = l10PlotAt(seed, s.x + .5, s.y + .5)
      if (p.edge > .7) offEdge++
      if (l10RoadInfo(seed, s.x + .5, s.y + .5).d < 4.5) roadHedge++
      ok(s.data?.node === 1 && s.w === 1 && s.h === 1 && s.solid, '树篱节点格式错误')
    }
  }
  ok(hedges > 200, `树篱节点过少 ${hedges}`)
  ok(offEdge === 0, `树篱偏离田块边界 ${offEdge}`)
  ok(roadHedge === 0, `树篱堵住了土路 ${roadHedge}`)
}

// 4. 作物块：带品种/方向/四角覆盖度；跨区块边界不再是硬切（相邻块覆盖度连续）
{
  let pcx = 3, crops: ReturnType<typeof genL10ChunkRaw>['structures'] = []
  for (; pcx < 40; pcx++) {
    const a = genL10ChunkRaw(L10, seed, pcx, 2), b = genL10ChunkRaw(L10, seed, pcx + 1, 2)
    crops = [...a.structures, ...b.structures].filter(s => s.kind === 'wheatpatch')
    if (crops.length > 60) break
  }
  ok(crops.length > 20, '作物块过少')
  for (const s of crops) {
    ok(typeof s.data?.dir === 'number' && typeof s.data?.q0 === 'number', '作物块缺少方向/四角覆盖度')
    ok(Number(s.data?.density) > 0 && Number(s.data?.density) <= 1, '作物密度越界')
  }
  // 区块边界两侧覆盖度：若两边同一田块，应同为作物或同为非作物
  const boundary = (pcx + 1) * CS
  let mismatch = 0, checked = 0
  for (let y = 2 * CS + 2; y < 3 * CS; y += 4) {
    const left = crops.find(s => s.x === boundary - 4 && s.y === y - 2)
    const right = crops.find(s => s.x === boundary && s.y === y - 2)
    const pl = l10PlotAt(seed, boundary - 2, y), pr = l10PlotAt(seed, boundary + 2, y)
    if (pl.id !== pr.id) continue
    checked++
    if (!!left !== !!right && Math.abs(Number(left?.data?.density ?? 0) - Number(right?.data?.density ?? 0)) > .45) mismatch++
  }
  ok(mismatch <= 1, `区块边界作物突变 ${mismatch}/${checked}`)
}

// 5. Level 11 终点：每个 16×16 超区域恰有一个，原点路线约 480~640m
for (let ry = -2; ry <= 2; ry++) for (let rx = -2; rx <= 2; rx++) {
  const p = l10RegionExitPoint(seed, rx, ry)
  const host = genL10ChunkRaw(L10, seed, Math.floor(p.x / CS), Math.floor(p.y / CS))
  const exits = host.exits.filter(e => e.def.kind === 'longroad')
  ok(exits.length === 1, `超区域 ${rx},${ry} 缺少唯一 Level 11 终点`)
  ok(Math.hypot(exits[0].x - p.x, exits[0].y - p.y) < .01, `超区域 ${rx},${ry} 终点坐标漂移`)
}
{
  const e = l10RegionExitPoint(seed, 0, 0)
  const d = Math.hypot(e.x - L10_L9_SPAWN.x, e.y - L10_L9_SPAWN.y)
  ok(d >= 480 && d <= 640, `首条 Level 11 路线距离 ${d.toFixed(1)}m`)
  ok(l10Wetness(seed, e.x, e.y) > L10_LAKE_T + .05, 'Level 11 终点落在湖里')
}

// 6. 湖泊：道路与出生点不被淹没；湖底写进 terrain；只有深湖带 Level 7 出口
for (let x = -300; x < 300; x += 3) {
  const y = l10RoadInfo(seed, x, 16).mainY
  ok(l10LakeDepth(seed, x, y) === 0, `主路 x=${x} 被湖水淹没`)
}
ok(l10LakeDepth(seed, L10_L9_SPAWN.x, L10_L9_SPAWN.y) === 0, '出生点在湖里')
{
  let deepestLake = 0, lakeTiles = 0, minDepth = Infinity
  for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
    const c = genL10ChunkRaw(L10, seed, cx, cy, 'deeplake')
    for (let i = 0; i < c.liquid!.length; i++) {
      if (c.liquid![i] !== 1) continue
      lakeTiles++
      ok(Math.abs(c.terrain![i] + c.seaFloor![i]) < 1e-5, '湖底 terrain 与水深不一致')
      deepestLake = Math.min(deepestLake, c.terrain![i]); minDepth = Math.min(minDepth, c.seaFloor![i])
    }
  }
  ok(lakeTiles > 300, `强制深湖面积异常 ${lakeTiles}`)
  ok(deepestLake < -5.5, `深湖不够深 ${deepestLake.toFixed(2)}`)
  ok(minDepth < .35, `湖岸第一圈过深 ${minDepth.toFixed(2)}`)
  for (let cy = -2; cy <= 2; cy++) for (let cx = -2; cx <= 2; cx++)
    ok(!genL10ChunkRaw(L10, seed, cx, cy, 'lowland').exits.some(e => e.def.kind === 'lakeswim'), '普通湖泊错误生成 Level 7 出口')
  // 自然深湖：出口点水深 > 4.6m，且所在区块恰好生成一次
  let found = false
  for (let lb = -12; lb < 12 && !found; lb++) for (let la = -12; la < 12 && !found; la++) {
    const p = l10DeepLakeExit(seed, la, lb)
    if (!p) continue
    found = true
    const c = genL10ChunkRaw(L10, seed, Math.floor(p.x / CS), Math.floor(p.y / CS))
    ok(c.exits.filter(e => e.def.kind === 'lakeswim').length >= 1, '深湖出口没有生成')
    ok(l10LakeDepth(seed, p.x, p.y) > 4.6, '深湖出口水深不足')
  }
  ok(found, '样本范围内没有自然深湖')
}

// 7. 湖岸未开垦：水线外 1~2m 内不种作物
{
  let violations = 0, shoreCrops = 0
  for (let cy = -8; cy <= 8; cy++) for (let cx = -8; cx <= 8; cx++) {
    const c = genL10ChunkRaw(L10, seed, cx, cy)
    for (const s of c.structures) if (s.kind === 'wheatpatch') {
      const wl = l10Wetness(seed, s.x + 2, s.y + 2)
      if (wl < L10_LAKE_T + .01) violations++
      if (wl < L10_LAKE_T + .05) shoreCrops += Number(s.data?.density ?? 0) > .6 ? 1 : 0
    }
  }
  ok(violations === 0, `作物种进了湖里 ${violations}`)
  ok(shoreCrops === 0, `湖岸未开垦带出现密集作物 ${shoreCrops}`)
}

// 8. 区块边缘高度连续
{
  let maxSeam = 0
  for (let cy = -4; cy <= 4; cy++) for (let cx = -4; cx <= 4; cx++) {
    const a = genL10ChunkRaw(L10, seed, cx, cy), bx = genL10ChunkRaw(L10, seed, cx + 1, cy), by = genL10ChunkRaw(L10, seed, cx, cy + 1)
    for (let t = 0; t < CS; t++) maxSeam = Math.max(maxSeam,
      Math.abs(a.terrain![t * CS + CS - 1] - bx.terrain![t * CS]), Math.abs(a.terrain![(CS - 1) * CS + t] - by.terrain![t]))
  }
  ok(maxSeam < .55, `区块边缘高度跳变 ${maxSeam.toFixed(3)}`)
}

// 9. 农舍：建筑互不重叠、不落水、地基平整、室内不露天、每栋只在中心所在区块生成一次
{
  let farmsChecked = 0
  for (let fb = -6; fb <= 6; fb++) for (let fa = -6; fa <= 6; fa++) {
    const f = l10FarmsteadOf(seed, fa, fb)
    if (!f || f.worksite) continue
    farmsChecked++
    ok(f.buildings.some(b => b.kind === 'barn'), '农舍缺少谷仓')
    for (let i = 0; i < f.buildings.length; i++) for (let j = i + 1; j < f.buildings.length; j++) {
      const a = f.buildings[i], b = f.buildings[j]
      ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `农舍建筑重叠 ${a.kind}/${b.kind}`)
    }
    for (const b of f.buildings) {
      ok(l10LakeDepth(seed, b.x + b.w / 2, b.y + b.h / 2) === 0, '建筑落在湖里')
      ok(l10RoadInfo(seed, b.x + b.w / 2, b.y + b.h / 2).d > 3.5, `建筑压在土路上 ${b.kind}`)
    }
    if (farmsChecked <= 3) {
      const barn = f.buildings.find(b => b.kind === 'barn')!
      const cx = Math.floor((barn.x + barn.w / 2) / CS), cy = Math.floor((barn.y + barn.h / 2) / CS)
      let owners = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const c = genL10ChunkRaw(L10, seed, cx + dx, cy + dy)
        owners += c.structures.filter(s => s.kind === 'barn' && Math.abs(s.x - barn.x) < .01 && Math.abs(s.y - barn.y) < .01).length
        // 地基平整 + 室内不露天（逐瓦片检查与该区块相交的部分）
        let lo = Infinity, hi = -Infinity
        for (let y = 0; y < CS; y++) for (let x = 0; x < CS; x++) {
          const wx = (cx + dx) * CS + x + .5, wy = (cy + dy) * CS + y + .5
          if (wx < barn.x + .3 || wx > barn.x + barn.w - .3 || wy < barn.y + .3 || wy > barn.y + barn.h - .3) continue
          const i = y * CS + x
          lo = Math.min(lo, c.terrain![i]); hi = Math.max(hi, c.terrain![i])
          ok(c.outdoor![i] === 0, '谷仓室内被标记为露天')
        }
        if (hi > -Infinity) ok(hi - lo < 1e-4, `谷仓地基不平 ${(hi - lo).toFixed(4)}`)
      }
      ok(owners === 1, `谷仓应只生成一次，实际 ${owners}`)
    }
  }
  ok(farmsChecked >= 4, `样本内农舍过少 ${farmsChecked}`)
}

// 10. v64 新增贴图存在
for (const f of ['l10_leafcard.png', 'l10_canola_clump.png', 'l10_corrugated_normal.png', 'l10_siding_diff.jpg', 'l10_hay_diff.jpg'])
  ok(existsSync(resolve('public/textures', f)), `缺少贴图 ${f}`)

console.log(`L10 generation checks passed: ${pass}`)
