import { L10 } from '../src/game/levels/l10'
import { CS } from '../src/game/world/infinite'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  genL10ChunkRaw, l10BiomeMixAt, l10RegionExitPoint, l10VariantOf,
  L10_L11_SPAWN, L10_L9_SPAWN, type L10Variant,
} from '../src/game/world/infiniteL10'

const ok = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(`[L10 check] ${message}`)
}
const seed = 0x10f00d

function hashNumbers(a: ArrayLike<number>, h = 0x811c9dc5) {
  for (let i = 0; i < a.length; i++) {
    const v = Math.round(Number(a[i]) * 100000) | 0
    h = Math.imul(h ^ v, 0x01000193)
  }
  return h >>> 0
}
function chunkSignature(cx: number, cy: number, forced?: string) {
  const c = genL10ChunkRaw(L10, seed, cx, cy, forced)
  let h = 0x811c9dc5
  for (const a of [c.tiles, c.wet, c.elev, c.tint, c.outdoor!, c.liquid!, c.seaFloor!, c.terrain!]) h = hashNumbers(a, h)
  return `${c.variant}|${h}|${JSON.stringify([c.structures, c.items, c.exits, c.entities])}`
}

// 同种子、同世界坐标必须完全确定。
for (const [cx, cy] of [[0, 0], [1, 0], [-7, 11], [23, -19], [255, 91]])
  ok(chunkSignature(cx, cy) === chunkSignature(cx, cy), `chunk ${cx},${cy} 非确定性`)

// 宏区块权重接受小量哈希采样误差，但必须维持方案中的 44/20/18/10/5/2/1。
const counts = new Map<L10Variant, number>()
const total = 14400
for (let i = 0; i < total; i++) {
  const mx = 4 + (i % 120), my = 4 + Math.floor(i / 120)
  const v = l10VariantOf(seed, mx * 2, my * 2)
  counts.set(v, (counts.get(v) ?? 0) + 1)
}
const expected: Record<L10Variant, number> = {
  wheatfield: .44, barleyfield: .20, mixedfield: .18, lowland: .10,
  farmstead: .05, worksite: .02, deeplake: .01,
}
for (const [v, p] of Object.entries(expected) as [L10Variant, number][]) {
  const actual = (counts.get(v) ?? 0) / total
  ok(Math.abs(actual - p) < (p >= .1 ? .018 : p >= .05 ? .012 : .007), `${v} 权重异常：${actual.toFixed(4)}`)
}

// 作物生态与非作物生态的边界必须连续过渡；边界两侧的权重相同，10m 外才回到各自主体。
const cropBiome = (v: L10Variant) => v === 'wheatfield' || v === 'barleyfield' || v === 'mixedfield'
let biomeSeam: { cx: number; cy: number; left: L10Variant; right: L10Variant } | null = null
for (let cy = 6; cy < 80 && !biomeSeam; cy++) for (let cx = 6; cx < 80; cx++) {
  const left = l10VariantOf(seed, cx, cy), right = l10VariantOf(seed, cx + 1, cy)
  if (cropBiome(left) !== cropBiome(right)) { biomeSeam = { cx, cy, left, right }; break }
}
ok(biomeSeam, '样本中未找到作物/非作物生态边界')
{
  const boundary = (biomeSeam.cx + 1) * CS, wy = biomeSeam.cy * CS + CS / 2
  const a = l10BiomeMixAt(seed, boundary - .001, wy)
  const b = l10BiomeMixAt(seed, boundary + .001, wy)
  ok(Math.abs(a.crop - b.crop) < .002, `生态边界作物权重不连续：${a.crop.toFixed(3)}/${b.crop.toFixed(3)}`)
  let maxStep = 0
  for (let x = boundary - 10; x < boundary + 10; x += .5) {
    const p0 = l10BiomeMixAt(seed, x, wy).crop, p1 = l10BiomeMixAt(seed, x + .5, wy).crop
    maxStep = Math.max(maxStep, Math.abs(p1 - p0))
  }
  ok(maxStep < .09, `生态过渡权重变化过陡：${maxStep.toFixed(3)}`)
  const nonCropCx = cropBiome(biomeSeam.left) ? biomeSeam.cx + 1 : biomeSeam.cx
  const transitionChunk = genL10ChunkRaw(L10, seed, nonCropCx, biomeSeam.cy)
  const edge = cropBiome(biomeSeam.left) ? nonCropCx * CS : (nonCropCx + 1) * CS
  const transitionCrops = transitionChunk.structures.filter(s => s.kind === 'wheatpatch' && Math.abs((s.x + s.w / 2) - edge) < 9)
  ok(transitionCrops.length > 0, '非作物侧过渡带没有渐疏麦簇')
  ok(transitionCrops.some(s => Number(s.data?.density ?? 1) < .75), '过渡麦簇没有降低密度')
}

// 每个 16×16 chunk 超区域恰有一个主路终点，且原点路线长度符合约 480～640m。
for (let ry = -2; ry <= 2; ry++) for (let rx = -2; rx <= 2; rx++) {
  const p = l10RegionExitPoint(seed, rx, ry)
  const host = genL10ChunkRaw(L10, seed, Math.floor(p.x / CS), Math.floor(p.y / CS))
  const exits = host.exits.filter(e => e.def.kind === 'longroad')
  ok(exits.length === 1, `超区域 ${rx},${ry} 缺少唯一 Level 11 终点`)
  ok(Math.hypot(exits[0].x - p.x, exits[0].y - p.y) < .01, `超区域 ${rx},${ry} 终点坐标漂移`)
}
const originEnd = l10RegionExitPoint(seed, 0, 0)
const routeDistance = Math.hypot(originEnd.x - L10_L9_SPAWN.x, originEnd.y - L10_L9_SPAWN.y)
ok(routeDistance >= 480 && routeDistance <= 640, `首条 Level 11 路线距离 ${routeDistance.toFixed(1)}m`)

// 只有深湖可带 Level 7 出口，普通低洼湖绝不带出口。
let deepMacro: { mx: number; my: number } | null = null
for (let my = 2; my < 180 && !deepMacro; my++) for (let mx = 2; mx < 180; mx++) {
  if (l10VariantOf(seed, mx * 2, my * 2) === 'deeplake') { deepMacro = { mx, my }; break }
}
ok(deepMacro, '样本中未找到深湖')
let lakeExits = 0
for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++)
  lakeExits += genL10ChunkRaw(L10, seed, deepMacro.mx * 2 + dx, deepMacro.my * 2 + dy).exits.filter(e => e.def.kind === 'lakeswim').length
ok(lakeExits === 1, `深湖宏区块应有且仅有一个 Level 7 出口，实际 ${lakeExits}`)
for (let cy = -3; cy <= 3; cy++) for (let cx = -3; cx <= 3; cx++)
  ok(!genL10ChunkRaw(L10, seed, cx, cy, 'lowland').exits.some(e => e.def.kind === 'lakeswim'), '普通湖泊错误生成 Level 7 出口')

// 湖底必须实际写进连续 terrain，而不是只改水深数据后仍渲染成水平地面。
let deepestLake = 0, shallowestLake = Infinity, lakeTiles = 0
for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
  const c = genL10ChunkRaw(L10, seed, cx, cy, 'deeplake')
  for (let i = 0; i < c.liquid!.length; i++) {
    if (c.liquid![i] !== 1) continue
    lakeTiles++
    const bottom = c.terrain![i], depth = c.seaFloor![i]
    ok(Math.abs(bottom + depth) < 1e-5, `湖底 terrain 与水深不一致：${bottom}/${depth}`)
    deepestLake = Math.min(deepestLake, bottom)
    shallowestLake = Math.min(shallowestLake, depth)
  }
}
ok(lakeTiles > 300, `深湖面积异常：${lakeTiles} tiles`)
ok(deepestLake < -5.5, `深湖没有平滑凹入足够深：${deepestLake.toFixed(2)}m`)
ok(shallowestLake < .3, `湖岸第一圈水底过深：${shallowestLake.toFixed(2)}m`)

// 相邻区块的连续高度函数不允许在边界跳变；道路/湖岸的最大单格坡差保持温和。
let maxSeamDelta = 0
for (let cy = -4; cy <= 4; cy++) for (let cx = -4; cx <= 4; cx++) {
  const a = genL10ChunkRaw(L10, seed, cx, cy), bx = genL10ChunkRaw(L10, seed, cx + 1, cy), by = genL10ChunkRaw(L10, seed, cx, cy + 1)
  for (let t = 0; t < CS; t++) {
    maxSeamDelta = Math.max(maxSeamDelta,
      Math.abs(a.terrain![t * CS + CS - 1] - bx.terrain![t * CS]),
      Math.abs(a.terrain![(CS - 1) * CS + t] - by.terrain![t]))
  }
}
// 深湖中心需要在约 20m 半径内下凹 5.5m 以上，因此合法坡面允许约 0.5m/m；
// 渲染与碰撞通过共享角点插值连续化，这里拦截的是真正突跳而不是湖盆本身的坡度。
ok(maxSeamDelta < .55, `区块边缘高度跳变过大：${maxSeamDelta.toFixed(3)}m`)

// 刚性建筑占地必须被整平成同一地基高度；压缩干草必须作为实心结构生成并拥有完整 PBR 贴图。
let foundationChecked = false
for (let cy = -6; cy <= 6 && !foundationChecked; cy++) for (let cx = -6; cx <= 6; cx++) {
  const c = genL10ChunkRaw(L10, seed, cx, cy, 'farmstead')
  const rigid = c.structures.find(s => ['l10shed', 'l10stable', 'l10outhouse', 'barn'].includes(s.kind))
  if (!rigid) continue
  const lx0 = Math.max(0, Math.floor(rigid.x - cx * CS)), ly0 = Math.max(0, Math.floor(rigid.y - cy * CS))
  const lx1 = Math.min(CS, Math.ceil(rigid.x + rigid.w - cx * CS)), ly1 = Math.min(CS, Math.ceil(rigid.y + rigid.h - cy * CS))
  let lo = Infinity, hi = -Infinity
  for (let y = ly0; y < ly1; y++) for (let x = lx0; x < lx1; x++) {
    const h = c.terrain![y * CS + x]
    lo = Math.min(lo, h); hi = Math.max(hi, h)
  }
  ok(hi - lo < 1e-5, `农舍地基仍随地面起伏：${(hi - lo).toFixed(5)}m`)
  foundationChecked = true
}
ok(foundationChecked, '未找到可验证的农舍地基')

let hayCount = 0
for (let cy = -4; cy <= 4; cy++) for (let cx = -4; cx <= 4; cx++) {
  const c = genL10ChunkRaw(L10, seed, cx, cy, 'wheatfield')
  for (const s of c.structures.filter(s => s.kind === 'l10haybale')) {
    hayCount++
    ok(s.solid, '压缩干草块缺少实心碰撞标记')
    ok(Number(s.data?.height ?? 0) >= .42, '压缩干草块高度数据无效')
    const tx = Math.floor(s.x + s.w / 2 - cx * CS), ty = Math.floor(s.y + s.h / 2 - cy * CS)
    ok(c.liquid![ty * CS + tx] === 0, '压缩干草块生成在湖水中')
  }
}
ok(hayCount > 10, `压缩干草块生成过少：${hayCount}`)
for (const channel of ['diff', 'normal', 'rough']) {
  ok(existsSync(resolve(process.cwd(), `public/textures/l10_hay_${channel}.jpg`)), `缺少干草 PBR ${channel} 贴图`)
}

// 禁用内容和安全入口。
const forbidden = new Set(['corpse', 'canolaplot'])
for (let cy = -8; cy <= 8; cy++) for (let cx = -8; cx <= 8; cx++) {
  const c = genL10ChunkRaw(L10, seed, cx, cy)
  ok(c.entities.length === 0, `chunk ${cx},${cy} 自然生成实体`)
  ok(!c.structures.some(s => forbidden.has(s.kind)), `chunk ${cx},${cy} 生成禁用结构`)
}
for (const p of [L10_L9_SPAWN, L10_L11_SPAWN]) {
  const cx = Math.floor(p.x / CS), cy = Math.floor(p.y / CS), c = genL10ChunkRaw(L10, seed, cx, cy)
  const x = Math.floor(p.x - cx * CS), y = Math.floor(p.y - cy * CS), i = y * CS + x
  ok(c.tiles[i] === 1 && c.liquid![i] === 0, `入口 ${p.x},${p.y} 不是安全干燥地面`)
  ok(!c.structures.some(s => s.solid && p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h), `入口 ${p.x},${p.y} 被结构阻挡`)
}

// 原始 chunk 生成基准：平均耗时应低于一帧；偶发 GC 峰值仅报告。
const times: number[] = []
for (let i = 0; i < 160; i++) {
  const t0 = performance.now()
  genL10ChunkRaw(L10, seed, (i % 20) - 10, Math.floor(i / 20) - 4)
  times.push(performance.now() - t0)
}
const avg = times.reduce((a, b) => a + b, 0) / times.length, max = Math.max(...times)
ok(avg < 16.7, `平均 chunk 生成 ${avg.toFixed(2)}ms，超过一帧预算`)
console.log(`[L10 check] OK · route=${routeDistance.toFixed(1)}m · seam=${maxSeamDelta.toFixed(3)}m · raw avg=${avg.toFixed(2)}ms max=${max.toFixed(2)}ms`)
