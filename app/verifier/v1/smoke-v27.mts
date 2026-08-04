// v27 新系统冒烟：L1 无限模式（chunk 生成/缝合/栖息地契约）、档案/笔记本事件、现象触发不崩溃
// 运行：npx tsx verifier/v1/smoke-v27.mts
import { Engine } from '../../src/game/engine'
import { LEVELS } from '../../src/game/levels'
import { generateLevel } from '../../src/game/mapgen'
import { updateInfinite, CS } from '../../src/game/infinite'
import { DOCS } from '../../src/game/docs'
import { PHENOMENA, rarityText } from '../../src/game/phenomena'

let failures = 0
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`)
  else { console.error(`  ✗ ${msg}`); failures++ }
}

console.log('== v27-A L1 无限模式：chunk 生成 / 窗口平移缝合 ==')
{
  const L1 = LEVELS.find((l) => l.id === 1)!
  ok(L1.infinite === true, 'L1 定义 infinite=true（宜居地带无限化）')
  const m = generateLevel(L1, 777)
  ok(!!m.inf, 'L1 运行时携带无限模式状态（inf）')
  ok(m.inf!.chunks.size === 25, `初始窗口 5×5=25 chunk（实际 ${m.inf!.chunks.size}）`)
  ok(m.w === CS * 5 && m.h === CS * 5, `窗口尺寸 ${m.w}×${m.h} = 5 chunk 见方`)
  const floors = m.tiles.reduce((a, t) => a + (t === 1 ? 1 : 0), 0)
  ok(floors > m.w * m.h * 0.3, `可行走地板占比充足（${floors}/${m.w * m.h}）`)
  // 出口按超区域（RS×RS chunk）稀有刷新，单个 5×5 窗口可能不含出口——扫一片超区域验证生成
  {
    const { infiniteImplFor } = await import('../../src/game/infinite')
    const impl = infiniteImplFor(1)
    let exCount = 0
    for (let cx = 0; cx < 8 && exCount === 0; cx++)
      for (let cy = 0; cy < 8; cy++) exCount += impl.genRaw(L1, 777, cx, cy).exits.length
    ok(exCount > 0, `超区域扫描含出口实例（${exCount} 个，单窗口稀有刷新属预期）`)
  }
  ok(m.habitatFallback !== undefined, '栖息地降级计数表已接线（habitatFallback 存在）')

  // 生成确定性：同种子同坐标两次生成瓦片一致
  const m2 = generateLevel(L1, 777)
  let same = 0
  for (let i = 0; i < m.tiles.length; i += 97) if (m.tiles[i] === m2.tiles[i]) same++
  const probes = Math.ceil(m.tiles.length / 97)
  ok(same === probes, `同种子重生成瓦片一致（${same}/${probes} 采样点）`)

  // 窗口平移：玩家走出 2 个 chunk → updateInfinite 触发平移缝合
  const px = m.w / 2, py = m.h / 2
  let shifted = 0
  let r: { dx: number; dy: number } | null = null
  for (let step = 0; step < 8; step++) {
    r = updateInfinite(m, L1, px + step * CS, py)
    if (r) { shifted++; break }
  }
  ok(shifted > 0 && !!r, `玩家移动后窗口平移缝合（dx=${r?.dx ?? 0},dy=${r?.dy ?? 0}）`)
  ok(m.inf!.chunks.size === 25, `平移后窗口仍为 25 chunk（实际 ${m.inf!.chunks.size}）`)
  let oob = 0
  for (const e of m.entities) {
    if (e.x < 0 || e.y < 0 || e.x >= m.w || e.y >= m.h) oob++
  }
  ok(oob === 0, `平移后全部实体在窗口内（越界 ${oob}）`)
  const floors2 = m.tiles.reduce((a, t) => a + (t === 1 ? 1 : 0), 0)
  ok(floors2 > m.w * m.h * 0.3, `平移缝合后地板完整（${floors2}/${m.w * m.h}）`)
}

console.log('== v27-B 档案 / 笔记本系统 ==')
{
  const docIds = Object.keys(DOCS)
  ok(docIds.length >= 1, `档案库 DOCS 含 ${docIds.length} 条（v27 用户版当前 1 条，可扩展）`)
  ok(!!DOCS['meg_levels'], '默认档案 meg_levels 存在（引擎拾取档案兜底 id）')
  for (const [id, d] of Object.entries(DOCS)) {
    if (!d.title || !d.body) { ok(false, `档案 ${id} 缺 title/body`); continue }
  }
  ok(true, '全部档案条目 title/body 完整')

  // 笔记本：给予 → 使用 → 引擎发 notebook 事件（App 打开 NotebookOverlay）
  const eng = new Engine()
  eng.dev.god = true
  const evts: string[] = []
  eng.on((e) => evts.push(e.kind))
  eng.newRun(20260727, 'normal')
  ok(eng.devGiveItem('notebook'), 'devGiveItem(notebook) 成功')
  const slot = eng.player.hotbar.findIndex((s) => s?.type === 'notebook')
  ok(slot >= 0, `笔记本进入快捷栏 slot=${slot}`)
  eng.useSlot('hotbar', slot)
  ok(evts.includes('notebook'), '使用笔记本触发 notebook 事件（UI 打开覆盖层）')
}

console.log('== v27-C 现象系统：定义完整 + 触发不崩溃 ==')
{
  for (const id of ['isolation', 'plantcancer', 'flicker']) {
    ok(!!PHENOMENA[id], `现象定义存在：${id}（${PHENOMENA[id]?.name ?? '缺失'}）`)
  }
  for (const d of Object.values(PHENOMENA)) {
    const rt = rarityText(d)
    if (!rt) { ok(false, `现象 ${d.id} rarityText 为空`); continue }
  }
  ok(true, '全部现象 rarityText 可用')

  const eng = new Engine()
  eng.dev.god = false // 现象需真实理智流失路径（防 god 屏蔽）
  eng.dev.statLock = false
  eng.newRun(20260727, 'normal')
  const tick = (n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) eng.update(dt) }

  // 孤立效应（L0 非马尼拉区域）
  eng.dev.phenOn.add('isolation')
  const san0 = eng.player.sanity
  tick(10)
  ok(eng.activePhenomena.includes('isolation'), '孤立效应触发（activePhenomena 含 isolation）')
  ok(eng.player.sanity < san0, `孤立效应理智流失（${san0.toFixed(1)} → ${eng.player.sanity.toFixed(1)}）`)
  eng.dev.phenOn.delete('isolation')

  // 植殖癌（强制开）
  eng.dev.phenOn.add('plantcancer')
  tick(10)
  ok(eng.activePhenomena.includes('plantcancer'), '植殖癌触发（activePhenomena 含 plantcancer）')
  eng.dev.phenOn.delete('plantcancer')

  // 闪烁（L1 停电/闪烁；强制开后 activePhenomena 含 flicker）
  eng.loadLevel(1)
  eng.dev.phenOn.add('flicker')
  tick(10)
  ok(eng.activePhenomena.includes('flicker'), '闪烁触发（activePhenomena 含 flicker）')
  ok(eng.map!.inf!.chunks.size === 25, '现象触发期间 L1 无限窗口保持 25 chunk（无崩溃）')
}

console.log(failures === 0 ? '\n结果：全部通过' : `\n结果：${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
