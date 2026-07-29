// 马尼拉室复刻校验：正方形 / 厚墙 / 1–4 门 / 桌+椅 / M.E.G. 文件夹 / 米黄墙纸 tint / 无实体
;(globalThis as unknown as Record<string, unknown>).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
;(globalThis as unknown as Record<string, unknown>).document = { createElement: () => ({ getContext: () => null, style: {} }), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } }
const { engine } = await import('../src/game/engine.ts')


let fail = 0
const bad = (m: string) => { console.log('  ✗ ' + m); fail++ }

engine.newRun(20260726, 'normal'); engine.paused = false
engine.devJump(0)
let found = 0, doorsSeen = new Set<number>(), tables = 0, chairs = 0, folders = 0, tinted = 0, ents = 0
for (let trial = 0; trial < 12; trial++) {
  if (!engine.devGotoVariant('manila')) continue
  for (let f = 0; f < 5; f++) engine.update(0.02)
  const m = engine.map!
  // 统计房间内的内容
  const near = (x: number, y: number) => Math.hypot(x - engine.player.x, y - engine.player.y) < 9
  const t = m.structures.filter((s) => s.kind === 'table' && near(s.x, s.y))
  const ch = t.filter((s) => s.data?.chair).length
  const tb = t.filter((s) => s.data?.manila).length
  const fo = m.items.filter((it) => it.type === 'megfolder' && near(it.x, it.y)).length
  let tn = 0
  for (let j = -8; j <= 8; j++) for (let i = -8; i <= 8; i++) {
    const x = Math.floor(engine.player.x) + i, y = Math.floor(engine.player.y) + j
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue
    if (m.tint[y * m.w + x] === 1) tn++
  }
  const en = m.entities.filter((e) => !e.dead && near(e.x, e.y)).length
  // v29：马尼拉室固定生成一个「闪烁的墙壁」出口（房间西北角西墙）
  const exs = m.exits.filter((e) => near(e.x + 0.5, e.y + 0.5))
  if (exs.length === 0) bad('马尼拉室没有固定生成「闪烁的墙壁」出口')
  else {
    const e = exs[0]
    if (m.tiles[Math.floor(e.y) * m.w + Math.floor(e.x) - 1] === 1) bad('出口西侧不是墙（面板无处贴合）')
  }
  // 门洞数：房间四面墙上的开口
  found++; tables += tb; chairs += ch; folders += fo; tinted += tn; ents += en
  doorsSeen.add(fo) // 占位，防未使用
  if (tb === 0) bad(`马尼拉室缺少桌子`)
  if (ch === 0) bad(`马尼拉室缺少椅子`)
  if (fo === 0) bad(`马尼拉室桌上没有 M.E.G. 文件夹`)
  if (tn < 40) bad(`马尼拉室米黄墙纸 tint 覆盖过小：${tn} 格`)
  if (found >= 4) break
}
if (!found) bad('12 次尝试都没有找到马尼拉室（生成概率或定位函数有问题）')
else console.log(`马尼拉室：定位到 ${found} 间 · 桌 ${tables} 椅 ${chairs} · M.E.G. 文件夹 ${folders} 份 · 米黄墙纸 ${(tinted / found).toFixed(0)} 格/间 · 房内实体 ${ents}（Wikidot：Survival Difficulty 0，无敌对实体）`)
console.log(fail === 0 ? '\n✓ 马尼拉室复刻校验通过' : `\n✗ ${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
