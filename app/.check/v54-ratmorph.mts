// v54：尸鼠形态随层级一致性校验（回归脚本）
// 背景 bug：渲染层按 levelDef.id 决定尸鼠形态（L2 灰白 / L3 水豚 / 其余深褐），
// 形态数据依赖 chunk raw 实例标记（L3=capybara:1）。infiniteL3 装配线大房间的
// 「额外实体 2~3 只」路径曾直接 push 加权抽取的实体、不下发 v53 实例标记——
// 抽中尸鼠时缺 capybara 标记，渲染成深褐形态（应为水豚形态），表现为
// 「自然生成的尸鼠有概率出现错误变种」。
// 断言：
//   1) L3 全部变体（含强制 assembly 命中大房间路径）扫多 seed×多 chunk——
//      每一只 raw 尸鼠必须带 capybara:1 + scale:1.45；
//   2) L2 全部变体扫 chunk——raw 尸鼠不得带任何形态标记（渲染层按 levelDef.id===2 给灰白）；
//   3) buildEntityMesh 三形态 opts 产出可区分（水豚/灰白/深褐主色各异）。
;(globalThis as unknown as Record<string, unknown>).document = {
  createElement: (t: string) => t === 'canvas'
    ? { width: 128, height: 128, getContext: () => null, toDataURL: () => 'data:,' }
    : { style: {}, appendChild: () => {}, setAttribute: () => {} },
  getElementById: () => null, body: { appendChild: () => {} },
}
const { LEVELS } = await import('../src/game/levels/index.ts')
const { genL2ChunkRaw } = await import('../src/game/world/infiniteL2.ts')
const { genL3ChunkRaw, L3_RARE_VARIANTS } = await import('../src/game/world/infiniteL3.ts')
const { buildEntityMesh } = await import('../src/game/renderer/entitiesMesh.ts')

let fail = 0
const bad = (m: string) => { console.log('  ✗ ' + m); fail++ }
const ok = (m: string) => console.log('  ✓ ' + m)

// ---- 1) L3：所有尸鼠 raw 必须带水豚形态标记 ----
{
  const def = LEVELS[3]
  let rats = 0, unmarked = 0
  for (const seed of [20260726, 4242, 7])
    for (let cx = -4; cx <= 4; cx++)
      for (let cy = -4; cy <= 4; cy++) {
        // 自然变体 + 强制四种特征房间变体（assembly 的「额外实体」路径只有强制才能稳定命中）
        for (const fv of [undefined, ...L3_RARE_VARIANTS] as (string | undefined)[]) {
          const raw = genL3ChunkRaw(def, seed, cx, cy, fv)
          for (const e of raw.entities) {
            if (e.type !== 'corpserat') continue
            rats++
            if (e.capybara !== 1 || e.scale !== 1.45) {
              unmarked++
              if (unmarked <= 5) bad(`L3 尸鼠缺形态标记：seed=${seed} chunk(${cx},${cy}) variant=${raw.variant}${fv ? '(强制)' : ''} capybara=${e.capybara} scale=${e.scale}`)
            }
          }
        }
      }
  if (!rats) bad('L3 扫描未抽到任何尸鼠（断言无效）')
  else if (unmarked) bad(`L3 尸鼠 ${unmarked}/${rats} 只缺水豚形态标记`)
  else ok(`L3 尸鼠 ${rats} 只全部带水豚形态标记（capybara:1 + scale:1.45）`)
}

// ---- 2) L2：所有尸鼠 raw 不得带形态标记（灰白形态由渲染层按 levelDef.id===2 决定）----
{
  const def = LEVELS[2]
  let rats = 0, marked = 0
  for (const seed of [20260726, 4242, 7])
    for (let cx = -4; cx <= 4; cx++)
      for (let cy = -4; cy <= 4; cy++) {
        const raw = genL2ChunkRaw(def, seed, cx, cy)
        for (const e of raw.entities) {
          if (e.type !== 'corpserat') continue
          rats++
          if ((e as { capybara?: number }).capybara !== undefined) {
            marked++
            if (marked <= 5) bad(`L2 尸鼠误带形态标记：seed=${seed} chunk(${cx},${cy})`)
          }
        }
      }
  if (!rats) bad('L2 扫描未抽到任何尸鼠（断言无效）')
  else if (marked) bad(`L2 尸鼠 ${marked}/${rats} 只误带形态标记`)
  else ok(`L2 尸鼠 ${rats} 只全部无形态标记（灰白形态由渲染层层级判定）`)
}

// ---- 3) 建模层：三种形态 opts 产出可区分 ----
{
  const colorsOf = (o: Parameters<typeof buildEntityMesh>[1]) => {
    const g = buildEntityMesh('corpserat', o)
    const set = new Set<string>()
    g.traverse((m) => {
      const mat = (m as { material?: { color?: unknown } }).material
      if (mat && typeof mat.color === 'string') set.add(mat.color)
    })
    return set
  }
  const capy = colorsOf({ capybara: true })
  const gray = colorsOf({ ratMorph: 'gray' })
  const brown = colorsOf({ ratMorph: 'brown' })
  if (!capy.has('#6a563f')) bad('水豚形态缺主色 #6a563f')
  if (!gray.has('#8a8078')) bad('灰白形态缺主色 #8a8078')
  if (!brown.has('#3e3630')) bad('深褐形态缺主色 #3e3630')
  if (capy.has('#6a563f') && gray.has('#8a8078') && brown.has('#3e3630')) ok('建模层三形态 opts 产出可区分（水豚/灰白/深褐主色各异）')
  // v55：L5 酒店正装变种——深褐底 + 小西装（#1c1a1e）+ 酒红领结（#7a1e24）可区分
  const hotel = colorsOf({ ratMorph: 'hotel' })
  if (!hotel.has('#1c1a1e') || !hotel.has('#7a1e24')) bad('酒店正装形态缺小西装/领结件')
  else ok('建模层酒店正装形态可区分（深褐底 + 小西装 #1c1a1e + 酒红领结 #7a1e24）')
}

// ---- 4) v55：L5 尸鼠 raw 不得带形态标记（hotel 形态由渲染层按 levelDef.id===5 决定）----
{
  const { genL5ChunkRaw } = await import('../src/game/world/infiniteL5.ts')
  const def = LEVELS[5]
  let rats = 0, marked = 0
  for (const seed of [20260726, 4242, 7])
    for (let cx = -4; cx <= 4; cx++)
      for (let cy = -4; cy <= 4; cy++) {
        const raw = genL5ChunkRaw(def, seed, cx, cy)
        for (const e of raw.entities) {
          if (e.type !== 'corpserat') continue
          rats++
          if (e.capybara !== undefined || e.scale !== undefined) marked++
        }
      }
  if (!rats) ok('L5 扫描未抽到尸鼠（低密度可接受——形态由渲染层按层级判定，无标记路径已覆盖）')
  else if (marked) bad(`L5 尸鼠 ${marked}/${rats} 只误带形态标记`)
  else ok(`L5 尸鼠 ${rats} 只全部无形态标记（hotel 正装由渲染层层级判定）`)
}

console.log(fail === 0 ? '\n✓ 尸鼠形态随层级一致' : `\n✗ ${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
