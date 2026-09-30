/** Level 8 生态分区冒烟：专属生成、地面限制与罗特尼斯群落密度。 */
import '../src/game/world/mapgen'
import { L8 } from '../src/game/levels/l8'
import { ENTITIES } from '../src/game/entities'

const { genL8ChunkRaw, l8VariantOf, l8CaveMarginAt, l8CeilingAt, l8FloorAt } = await import('../src/game/world/infiniteL8')
const variants = ['hyperspace', 'rottnest', 'movile', 'handyland', 'hive', 'phreatic'] as const
let failed = 0
const ok = (value: boolean, text: string) => {
  if (value) console.log('✓', text)
  else { failed++; console.error('✗', text) }
}

const generated = new Map<string, ReturnType<typeof genL8ChunkRaw>[]>()
for (const variant of variants) {
  const chunks: ReturnType<typeof genL8ChunkRaw>[] = []
  for (let cy = -60; cy <= 60 && chunks.length < 24; cy++) for (let cx = -60; cx <= 60 && chunks.length < 24; cx++) {
    if (l8VariantOf(94117, cx, cy) === variant) chunks.push(genL8ChunkRaw(L8, 94117, cx, cy))
  }
  generated.set(variant, chunks)
}
const hyperspace = generated.get('hyperspace')!
const rottnest = generated.get('rottnest')!
const movile = generated.get('movile')!
const outsideHyperspace = [...generated.entries()].filter(([v]) => v !== 'hyperspace').flatMap(([, chunks]) => chunks)

ok(hyperspace.every((c) => c.structures.some((s) => s.kind === 'caveglowpoints')), '多维之路每区块都有移动洞顶光点')
ok(hyperspace.every((c) => c.structures.some((s) => s.kind === 'cavebacteria')), '多维之路每区块都有溪流微光细菌场')
ok(hyperspace.reduce((n, c) => n + c.entities.filter((e) => e.type === 'lightguide').length, 0) > 0, '微光向导可在多维之路生成')
ok(outsideHyperspace.every((c) => c.entities.every((e) => e.type !== 'lightguide')), '微光向导不会在其他生态生成')
ok(hyperspace.reduce((n, c) => n + c.items.filter((e) => e.type === 'xenonmarble').length, 0) > 0, '氙弹珠可在多维之路生成')
ok(outsideHyperspace.every((c) => c.items.every((e) => e.type !== 'xenonmarble')), '氙弹珠不会在其他生态生成')
ok(rottnest.reduce((n, c) => n + c.entities.filter((e) => e.type === 'corpserat').length, 0) / rottnest.length >= 5, '罗特尼斯平均每区块至少五只尸鼠')
ok(rottnest.filter((c) => c.entities.some((e) => e.type === 'corpserat' && e.ceilingCrawler === 1)).length >= rottnest.length * .8, '罗特尼斯绝大多数区块生成洞顶尸鼠变种')
ok(rottnest.every((c) => c.structures.filter((s) => s.kind === 'cavefern').length === 1 && c.structures.filter((s) => s.kind === 'cavemoss').length === 1), '罗特尼斯蕨类和苔藓均为每区块一批实例')
ok(rottnest.reduce((n, c) => n + c.lights.filter((l) => l.intensityMul === .2 && l.noFix === 1).length, 0) >= rottnest.length * 1.5, '罗特尼斯荧光蘑菇使用聚合真实光源且不生成灯具盒')
ok(movile.every((c) => c.entities.every((e) => e.type !== 'dryshrimp')), '新莫维勒窟不生成旱虾')
ok(generated.get('hive')!.every((c) => c.entities.every((e) => e.type !== 'dryshrimp')), '蜂巢不生成旱虾')
ok(rottnest.every((c) => c.entities.every((e) => e.type !== 'dryshrimp')), '罗特尼斯不生成旱虾')
ok(['rottnest', 'movile', 'handyland', 'hive'].every((v) => generated.get(v)!.some((c) => c.entities.some((e) => e.type === 'arachnid'))), '四个指定生态均可生成蛛形纲')
ok(hyperspace.every((c) => c.entities.every((e) => e.type !== 'arachnid')), '多维之路不生成蛛形纲')
ok(movile.every((c) => c.structures.some((s) => s.kind === 'fungalmat')), '新莫维勒窟每区块铺设批量菌毯')
ok(movile.every((c) => c.entities.filter((e) => e.type === 'arachnid').every((e) => e.arachnidMorph === 'spider')), '新莫维勒窟的蛛形纲自然生成限定为蜘蛛')
ok(ENTITIES.curabitur.passive === true && ENTITIES.curabitur.avoidsHumans === true && ENTITIES.curabitur.hunts?.includes('deathmoth') === true, '受眷鸟避开人类并自动捕食死亡飞蛾')

// 新莫维勒种群按整座 3×3 地质带限额，避免每区块复制一套高细节实体导致载入卡顿。
let movileZoneChunks: ReturnType<typeof genL8ChunkRaw>[] = []
for (let gy = -40; gy <= 40 && !movileZoneChunks.length; gy++) for (let gx = -40; gx <= 40 && !movileZoneChunks.length; gx++) {
  if (l8VariantOf(94117, gx * 3 + 1, gy * 3 + 1) !== 'movile') continue
  movileZoneChunks = Array.from({ length: 9 }, (_, i) => genL8ChunkRaw(L8, 94117, gx * 3 + i % 3, gy * 3 + Math.floor(i / 3)))
}
const zoneEntities = movileZoneChunks.flatMap((c) => c.entities)
const zoneBirds = zoneEntities.filter((e) => e.type === 'curabitur').length
const zoneMoths = zoneEntities.filter((e) => e.type === 'deathmoth').length
const zoneSpiders = zoneEntities.filter((e) => e.type === 'arachnid').length
ok(zoneBirds === 1, '每座新莫维勒窟只生成一只高细节受眷鸟')
ok(zoneMoths >= 5 && zoneMoths <= 8, '每座新莫维勒窟生成 5–8 只死亡飞蛾')
ok(zoneSpiders >= 4 && zoneSpiders <= 6, '每座新莫维勒窟生成 4–6 只蜘蛛')
ok(zoneEntities.length <= 15, '新莫维勒整座生态的动画实体总量受性能预算约束')

// 罕见率和空间形态：按 3×3 地质带采样，避免把同一带的九个 chunk 重复计数。
let movileZones = 0, sampledZones = 0
type TerrainStat = { openRatio: number; floorRelief: number; ceilingRelief: number; meanSpan: number }
let rottnestTerrain: TerrainStat | null = null, movileTerrain: TerrainStat | null = null
for (let gy = -28; gy <= 28; gy++) for (let gx = -28; gx <= 28; gx++) {
  const v = l8VariantOf(94117, gx * 3 + 1, gy * 3 + 1)
  sampledZones++; if (v === 'movile') movileZones++
  if ((v === 'movile' && !movileTerrain) || (v === 'rottnest' && !rottnestTerrain)) {
    const cx = (gx + .5) * 96, cy = (gy + .5) * 96
    let open = 0, total = 0, minFloor = Infinity, maxFloor = -Infinity, minSpan = Infinity, maxSpan = -Infinity, sumSpan = 0
    for (let dy = -40; dy <= 40; dy += 5) for (let dx = -40; dx <= 40; dx += 5) {
      const x = cx + dx, y = cy + dy, margin = l8CaveMarginAt(94117, x, y)
      const floor = l8FloorAt(94117, x, y), span = l8CeilingAt(94117, x, y) - floor
      if (margin > 0) open++
      total++; minFloor = Math.min(minFloor, floor); maxFloor = Math.max(maxFloor, floor)
      minSpan = Math.min(minSpan, span); maxSpan = Math.max(maxSpan, span); sumSpan += span
    }
    const stat = { openRatio: open / total, floorRelief: maxFloor - minFloor, ceilingRelief: maxSpan - minSpan, meanSpan: sumSpan / total }
    if (v === 'movile') movileTerrain = stat
    else rottnestTerrain = stat
  }
}
ok(movileZones / sampledZones >= .035 && movileZones / sampledZones <= .065, '新莫维勒窟地质带生成率约为 5%')
const terrainOk = (s: TerrainStat | null) => !!s && s.openRatio >= .58 && s.openRatio <= .94 && s.floorRelief >= .7 && s.ceilingRelief >= 1.1
ok(terrainOk(rottnestTerrain), `罗特尼斯保留少量岩墙及洞底/洞顶起伏 ${JSON.stringify(rottnestTerrain)}`)
ok(terrainOk(movileTerrain), `新莫维勒保留少量岩墙及洞底/洞顶起伏 ${JSON.stringify(movileTerrain)}`)
ok(!!rottnestTerrain && !!movileTerrain && movileTerrain.meanSpan > rottnestTerrain.meanSpan, '新莫维勒平均净空仍高于罗特尼斯，但不再是空盒')
if (failed) process.exit(1)
console.log('L8 ecology smoke passed')
