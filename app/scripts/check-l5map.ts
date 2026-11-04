/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// [l5map] L5 楼层导览图（大小地图 / 图例）无头验收。运行：npm run check:l5map
// ① 每种图例图标有绘制函数且能在地图上找到 ② 雾 = 探索记录，存档往返不变 ③ 自己房间高亮 = 房卡绑定
// ④ 大堂门 / 黑门按规则显示 ⑤ 楼层分页 ⑥ 小地图重绘次数受限 + 每帧 < 1 ms ⑦ 低理智墨迹保守
import { createCanvas } from '@napi-rs/canvas'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), devicePixelRatio: 1 },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const H = await import('../src/game/engine/l5Hotel')
const M = await import('../src/game/content/l5Map')
const MM = await import('../src/game/content/l5MapMini')
const { snapshot } = await import('../src/game/engine/save')
const { audio } = await import('../src/game/core/audio')
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (k !== 'constructor' && typeof (audio as any)[k] === 'function') (audio as any)[k] = () => {}

let fails = 0, n = 0
const ok = (c: unknown, m: string, dbg?: unknown) => { n++; console.log(`${c ? '✔' : '✘'} ${m}${dbg !== undefined ? '  ' + JSON.stringify(dbg) : ''}`); if (!c) fails++ }
const mk = (floor: number, sd: number, hotel?: any) => {
  const e: any = new Engine(); e.seed = sd * 313; e.emit = () => {}
  if (hotel) e.hotel = hotel
  e.hotel.floor = floor
  e.loadLevel(5, { mapSeed: sd * 313 + floor, firstVisit: true }); e.introT = 0
  e.map.entities = []
  Object.assign(e.player, { hp: 100, sanity: 80, hunger: 100, thirst: 100, stamina: 100 })
  return e
}
const reveal = (e: any, cx: number, cy: number, r: number) => { const m = e.map; for (let y = Math.max(0, cy - r); y < Math.min(m.h, cy + r); y++) for (let x = Math.max(0, cx - r); x < Math.min(m.w, cx + r); x++) e.explored[y * m.w + x] = 1 }
const revealAll = (e: any) => e.explored.fill(1)
const fullView = (e: any): any => { const { ox, oy } = M.worldOrigin(e); return { cx: e.map.w / 2 + ox, cy: e.map.h / 2 + oy, scale: 3, w: e.map.w * 3, h: e.map.h * 3 } }
const drawStats = (e: any, key: string, view = fullView(e), opts: any = {}) => { const c = createCanvas(view.w, view.h); return M.drawL5Plan(c.getContext('2d') as any, e, key, view, opts) }

// ① 图标绘制函数
{
  const missing: string[] = [], blank: string[] = []
  for (const k of M.L5_ICON_KINDS) {
    const ic = (M.L5_ICONS as any)[k]
    if (!ic || typeof ic.draw !== 'function' || !ic.label) { missing.push(k); continue }
    const c = createCanvas(32, 32), g = c.getContext('2d') as any; ic.draw(g, 16, 16, 11)
    const d = g.getImageData(0, 0, 32, 32).data; let px = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) px++
    if (px < 30) blank.push(k)
  }
  ok(M.L5_ICON_KINDS.length >= 28 && !missing.length, `图例 ${M.L5_ICON_KINDS.length} 种图标，每种都有绘制函数 + 中文标签`, missing)
  ok(!blank.length, '每个图标都画出了可见像素（≥30 px @ 32²）', blank)
  const needed = ['guestDoor', 'ownRoom', 'elevator', 'serviceLift', 'stairs', 'lobbyDoor', 'blackDoor', 'beverly', 'dining', 'kitchen', 'boiler', 'puddle', 'lounge', 'phono', 'casinoDoor', 'cashier', 'slot', 'blackjack', 'roulette', 'craps', 'exit', 'maid', 'bellhop', 'greeter', 'chef', 'beast', 'jazz']
  ok(needed.every((k) => (M.L5_ICONS as any)[k]), '需求清单里的要素全部在图标集中', needed.filter((k) => !(M.L5_ICONS as any)[k]))
  const labels = M.L5_ICON_KINDS.map((k) => (M.L5_ICONS as any)[k].label as string)
  ok(labels.every((l) => /[\u4e00-\u9fff]/.test(l)), '图例标签全部中文')
}

// ① 要素能在地图上找到（真实生成的楼层 / 赌场 + 绘制统计）
const found: Record<string, string> = {}
const note = (k: string, where: string) => { if (!found[k]) found[k] = where }
{
  for (let sd = 1; sd <= 10; sd++) for (let f = 0; f <= 12; f++) {
    if (sd > 3 && ['phono', 'kitchen', 'casinoDoor', 'lobbyDoor', 'serviceLift', 'stairs', 'dining', 'beverly', 'lounge', 'boiler'].every((k) => found[k])) break
    const e = mk(f, sd); revealAll(e); M.recordL5Map(e)
    const st = drawStats(e, `f${f}`)
    for (const k of Object.keys(st)) note(k, `f${f}/s${sd}`)
  }
  // 自己房间：绑一扇门
  const e = mk(2, 1); revealAll(e); M.recordL5Map(e)
  const door = [...M.l5MapPage(e, 'f2')!.pois.values()].find((p: any) => p.k === 'guestDoor' && p.n)
  if (door) { e.hotel.objs = { ...(e.hotel.objs ?? {}), card: { no: door.n, floor: 2, dx: 1, dy: 1 } }; const st = drawStats(e, 'f2'); if (st.ownRoom) note('ownRoom', 'f2 房卡绑定') }
  // 员工 / 实体：放进视野内
  for (const t of ['maid', 'bellhop', 'greeter', 'chef', 'beast', 'jazz']) {
    const e2 = mk(1, 2); reveal(e2, Math.floor(e2.player.x), Math.floor(e2.player.y), 12)
    e2.map.entities.push({ def: { type: t }, x: e2.player.x + 3, y: e2.player.y, dead: false })
    const vis = M.visibleStaff(e2); if (vis.some((v: any) => v.k === (M.STAFF_ICON as any)[t])) note((M.STAFF_ICON as any)[t], '视野内注入')
    e2.map.entities[0].x = e2.player.x + 40 // 视野外且没见过 → 不显示
    if (M.visibleStaff(e2).length) ok(false, `${t} 视野外不该显示`)
  }
  // 赌场
  const c: any = new Engine(); c.seed = 313; c.emit = () => {}; c.loadLevel(119, { firstVisit: true })
  M.recordL5Map(c)
  const cst = drawStats(c, 'casino', { cx: 29, cy: 24, scale: 6, w: 58 * 6, h: 50 * 6 })
  for (const k of Object.keys(cst)) note(k, 'casino')
  note('player', 'drawArrow（大小地图都画）')
  const all = M.L5_ICON_KINDS.filter((k) => k !== 'player')
  const miss = all.filter((k) => !found[k])
  ok(!miss.length, `每种图例要素都在实际地图上画出（${all.length - miss.length}/${all.length}）`, miss.length ? miss : undefined)
  console.log('   来源：', JSON.stringify(found))
}

// ② 雾与探索记录一致 + 存档往返
{
  const e = mk(1, 4), px = Math.floor(e.player.x), py = Math.floor(e.player.y)
  reveal(e, px, py, 14); reveal(e, px + 30, py - 10, 6)
  for (let i = 0; i < 20; i++) H.updateHotel(e, 0.25) // 真实挂点：stepL5Map
  M.recordL5Map(e)
  const pg = M.l5MapPage(e, 'f1')!, { ox, oy } = M.worldOrigin(e), m = e.map
  let bad = 0, ex = 0
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { const exp = e.explored[y * m.w + x] === 1; if (exp) ex++; if (exp !== (M.cellAt(pg, x + ox, y + oy) !== 0)) bad++ }
  ok(ex > 300 && bad === 0, `雾 = 未探索：${m.w}×${m.h} 窗口逐格一致（已探索 ${ex} 格，不一致 ${bad}）`)
  { // 画面上的雾：负世界坐标也要画（回归：曾用 -1 当行程哨兵，窗口左上的负坐标雾整片漏画）
    const v = { cx: px + ox, cy: py + oy, scale: 4, w: 640, h: 640 }, c = createCanvas(640, 640), g = c.getContext('2d') as any
    M.drawL5Plan(g, e, 'f1', v, {})
    let fogPx = 0, unk = 0
    for (let y = 0; y < 640; y += 8) for (let x = 0; x < 640; x += 8) {
      const wx = Math.floor((x - 320) / 4 + v.cx), wy = Math.floor((y - 320) / 4 + v.cy)
      if (M.cellAt(pg, wx, wy) !== 0) continue
      unk++; const d = g.getImageData(x, y, 1, 1).data; if (!(d[0] === 0xef && d[1] === 0xe4 && d[2] === 0xc8)) fogPx++
    }
    ok(unk > 100 && fogPx === unk, `未探索格在画面上全部是雾色（${fogPx}/${unk}，含负世界坐标区）`, { ox, oy })
  }
  const snap: any = snapshot(e)
  const back = H.restoreHotel(JSON.parse(JSON.stringify(snap.hotel)))
  const e2 = mk(1, 4, back), pg2 = M.l5MapPage(e2, 'f1')
  let diff = 0
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (M.cellAt(pg, x + ox, y + oy) !== M.cellAt(pg2, x + ox, y + oy)) diff++
  const poisA = [...pg.pois.keys()].sort().join('|'), poisB = [...(pg2?.pois.keys() ?? [])].sort().join('|')
  ok(!!pg2 && diff === 0 && poisA === poisB, `存档往返：区块类别 0 差异、要素 ${pg.pois.size} 个一致`, { diff })
  const sz = JSON.stringify(snap.hotel.map ?? {}).length
  ok(sz > 0 && sz < 400000, `导览图存档体积合理（${(sz / 1024).toFixed(1)} KB）`)
  // 换楼层再回来：旧页保留，新页从雾开始
  e.hotel.floor = 2; e.loadLevel(5, { mapSeed: 4 * 313 + 2 }); e.map.entities = []
  M.recordL5Map(e)
  ok(M.l5MapPage(e, 'f1')!.cells.size === pg.cells.size, '换到 2F 后 1F 页的探索记录原样保留')
  const pf2 = M.l5MapPage(e, 'f2'); let k2 = 0; if (pf2) for (const cell of pf2.cells.values()) for (const v of cell) if (v) k2++
  let e2x = 0; for (const v of e.explored) if (v) e2x++
  ok(k2 === e2x, `2F 新页只记录 2F 已探索的格（${k2} = ${e2x}）`)
}

// ③ 自己房间高亮 = 房卡绑定
{
  const e = mk(3, 2); revealAll(e); M.recordL5Map(e)
  const pois = [...M.l5MapPage(e, 'f3')!.pois.values()].filter((p: any) => p.k === 'guestDoor' && p.n)
  const pick = pois[3] ?? pois[0]
  ok(!!pick, '3F 找到带房号的客房门')
  const same = pois.filter((p: any) => p.n === pick.n).length
  ok(!drawStats(e, 'f3').ownRoom, '未持房卡：没有「我的房间」')
  e.hotel.objs = { ...(e.hotel.objs ?? {}), card: { no: pick.n, floor: 3 } }
  ok(!drawStats(e, 'f3').ownRoom, '房卡未绑定（dx 未定）：不高亮')
  e.hotel.objs.card.dx = 5; e.hotel.objs.card.dy = 5
  const st = drawStats(e, 'f3')
  ok(st.ownRoom === same && M.ownRoomNo(e, 'f3') === pick.n, `绑定 ${pick.n} 号：高亮 ${st.ownRoom} 扇（该房号的门数 ${same}）`)
  ok(!drawStats(e, 'f2').ownRoom && M.ownRoomNo(e, 'f2') === null, '别的楼层不高亮')
}

// ④ 大堂门 / 黑门规则
{
  let e: any = null, s: any = null
  for (let sd = 1; sd < 400 && !s; sd++) { e = mk(1, sd); s = e.map.structures.find((q: any) => q.kind === 'l5pocketdoor' && q.data?.pocket === 'lobby') }
  ok(!!s, '找到出现了大堂门的 1F')
  if (s) {
    const { ox, oy } = M.worldOrigin(e)
    e.explored.fill(0); e.explored[Math.floor(e.player.y) * e.map.w + Math.floor(e.player.x)] = 1; M.recordL5Map(e)
    const has = () => [...M.l5MapPage(e, 'f1')!.pois.values()].some((p: any) => p.k === 'lobbyDoor' && p.x === Math.floor(s.x + 0.5) + ox && p.y === Math.floor(s.y + 0.5) + oy)
    ok(!has(), '大堂门所在格未探索：地图上不标')
    reveal(e, Math.floor(s.x), Math.floor(s.y), 2); M.recordL5Map(e)
    ok(has(), '看到（探索到）之后才标出大堂门')
  }
  const noLobby = mk(1, 2); noLobby.map.structures = noLobby.map.structures.filter((q: any) => q.kind !== 'l5pocketdoor'); revealAll(noLobby); M.recordL5Map(noLobby)
  ok(![...M.l5MapPage(noLobby, 'f1')!.pois.values()].some((p: any) => p.k === 'lobbyDoor'), '大堂门没出现的楼层：不标')
  let blackOther = 0
  for (let f = 1; f <= 12; f++) { const q = mk(f, 3); revealAll(q); M.recordL5Map(q); blackOther += drawStats(q, `f${f}`).blackDoor ?? 0 }
  ok(blackOther === 0, '1F–12F 全部楼层没有黑门图标')
  const b = mk(0, 3), bdoor = b.map.exits.find((x: any) => x.def.kind === 'boilerdeep')
  b.explored.fill(0); M.recordL5Map(b)
  ok(!drawStats(b, 'f0').blackDoor, 'B1 黑门未探索：不标')
  revealAll(b); M.recordL5Map(b)
  ok(!!bdoor && (drawStats(b, 'f0').blackDoor ?? 0) >= 1, `B1 探索后标出黑门（${drawStats(b, 'f0').blackDoor ?? 0} 扇）`)
  ok(!M.visiblePoi(b, 'f5', { k: 'blackDoor', x: 0, y: 0 }), '即使记录错页，黑门也只在 B1 页显示')
}

// ⑤ 楼层分页
{
  const e = mk(1, 5); M.recordL5Map(e)
  e.hotel.floor = 0; e.loadLevel(5, { mapSeed: 5 * 313 }); M.recordL5Map(e)
  e.hotel.floor = 6; e.loadLevel(5, { mapSeed: 5 * 313 + 6 }); M.recordL5Map(e)
  e.loadLevel(119, { firstVisit: true }); M.recordL5Map(e)
  const pages = M.l5MapPages(e)
  ok(JSON.stringify(pages.slice(0, 3)) === '["f0","f1","f6"]' && pages[pages.length - 1] === 'casino', `分页顺序 B1 → 1F → 6F → 赌场：${pages.join(' / ')}`)
  ok(M.pageTitle('f0').no === 'B1' && M.pageTitle('f1').no === '1F' && M.pageTitle('f12').no === '12F' && M.pageTitle('casino').no === '5.1' && M.pageTitle('lobby').no === '大堂', '页标题：B1 / 1F / 12F / 大堂 / 5.1')
  ok(M.pageKeyOf(e) === 'casino' && !pages.includes('f13'), '赌场单独一页；没有 13F 页（13 楼是消失事件，不是可到达楼层）')
  const l: any = new Engine(); l.seed = 1; l.emit = () => {}; l.loadLevel(118, { firstVisit: true })
  ok(M.pageKeyOf(l) === 'lobby', '大堂（118）单独一页')
  const bk = H.restoreHotel(JSON.parse(JSON.stringify((snapshot(e) as any).hotel)))
  ok(Object.keys(bk.map?.pages ?? {}).sort().join() === ['casino', 'f0', 'f1', 'f6'].sort().join(), '分页随存档往返', Object.keys(bk.map?.pages ?? {}))
}

// ⑤b 换层过场：hotel.floor 已改、地图还是旧楼层 → 不写进新楼层页
{
  const e = mk(1, 8); reveal(e, Math.floor(e.player.x), Math.floor(e.player.y), 12); M.recordL5Map(e)
  e.hotel.floor = 2; e.transition = { anim: 'shutter', t: 0, dest: 5 }
  for (let i = 0; i < 40; i++) M.stepL5Map(e, 0.25)
  ok(!M.l5MapPage(e, 'f2') && M.pageKeyOf(e) === 'f1', '电梯过场中不记录，页键按地图实际楼层（f1），不污染 2F 页')
  e.transition = null; M.recordL5Map(e)
  ok(!M.l5MapPage(e, 'f2'), '过场结束前地图仍是 1F：记录仍进 1F 页')
}

// ⑥ 小地图重绘受限 + 每帧开销
{
  const e = mk(1, 6); reveal(e, Math.floor(e.player.x), Math.floor(e.player.y), 10); M.recordL5Map(e)
  const cv = createCanvas(140, 140), g = cv.getContext('2d') as any
  const cache = MM.createMiniCache()
  MM.MINI_STATS.redraws = 0; MM.MINI_STATS.frames = 0; MM.MINI_STATS.ms = 0
  let dir = [1, 0], walked = 0
  const frames = 600; let noRedrawMs = 0, noRedrawN = 0, maxNo = 0
  const m = e.map
  for (let f = 0; f < frames; f++) {
    const t = f / 60
    // 沿可走格前进（3 m/s，按行走方向找地板）
    const fl = (x: number, y: number) => m.tiles[Math.floor(y) * m.w + Math.floor(x)] === 1
    let tries = 0
    while (!fl(e.player.x + dir[0] * 0.6, e.player.y + dir[1] * 0.6) && tries++ < 4) dir = [-dir[1], dir[0]]
    e.player.x += dir[0] * 0.05; e.player.y += dir[1] * 0.05; walked += 0.05
    reveal(e, Math.floor(e.player.x), Math.floor(e.player.y), 6)
    M.stepL5Map(e, 1 / 60)
    const r0 = MM.MINI_STATS.redraws
    MM.drawL5Mini(g, e, cache, { size: 140, dpr: 1, yaw: 0, now: t * 1000 })
    if (MM.MINI_STATS.redraws === r0 && f > 5) { noRedrawMs += MM.MINI_STATS.last; noRedrawN++; maxNo = Math.max(maxNo, MM.MINI_STATS.last) }
  }
  const red = MM.MINI_STATS.redraws
  ok(red >= 2 && red <= frames / 30 + 4 && walked > 25, `小地图 600 帧（行走 ${walked.toFixed(0)} m）只重绘 ${red} 次（上限 ${frames / 30 + 4}：0.5 s 节流 + 锚点区块）`)
  const avg = noRedrawMs / Math.max(1, noRedrawN)
  ok(avg < 1, `缓存命中帧平均 ${avg.toFixed(3)} ms < 1 ms（最大 ${maxNo.toFixed(2)} ms，Node 画布）`)
  // 静止不动：0 次重绘
  M.stepL5Map(e, 1); MM.drawL5Mini(g, e, cache, { size: 140, dpr: 1, yaw: 0, now: 19000 }) // 走动时最后一次记录的延迟重绘落在这里
  const r1 = MM.MINI_STATS.redraws
  for (let f = 0; f < 120; f++) { M.stepL5Map(e, 1 / 60); MM.drawL5Mini(g, e, cache, { size: 140, dpr: 1, yaw: f * 0.05, now: 20000 + f * 16 }) }
  ok(MM.MINI_STATS.redraws === r1, '原地转身 120 帧：0 次重绘')
}

// ⑦ 低理智墨迹（保守、不遮挡导航）
{
  const e = mk(1, 7); reveal(e, Math.floor(e.player.x), Math.floor(e.player.y), 16); M.recordL5Map(e)
  ok(M.inkBleed(80) === 0 && M.inkBleed(40) === 0 && M.inkBleed(20) > 0 && M.inkBleed(0) <= 1, '理智 ≥ 40 无效果；< 40 才渐进')
  const { ox, oy } = M.worldOrigin(e), v = { cx: e.player.x + ox, cy: e.player.y + oy, scale: 6, w: 240, h: 240 }
  const shot = (san: number) => { const c = createCanvas(240, 240), g = c.getContext('2d') as any; M.drawL5Plan(g, e, 'f1', v, { sanity: san }); return g.getImageData(0, 0, 240, 240).data }
  const a = shot(90), b = shot(5)
  let ch = 0, chC = 0
  for (let i = 0; i < a.length; i += 4) { const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); if (d > 30) { ch++; const p = i / 4, x = p % 240, y = (p / 240) | 0; if (Math.hypot(x - 120, y - 120) < 40) chC++ } }
  const frac = ch / (240 * 240)
  ok(frac > 0.005 && frac < 0.25, `理智 5：画面变化 ${(frac * 100).toFixed(1)}%（有效果但 < 25%）`)
  ok(chC / (Math.PI * 40 * 40) < 0.2, `玩家周围 40 px 内变化 ${(chC / (Math.PI * 1600) * 100).toFixed(1)}%（墨点避开中心）`)
}

console.log(`\n通过 ${n - fails} / ${n}`)
process.exit(fails ? 1 : 0)
