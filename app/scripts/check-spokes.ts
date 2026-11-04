/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// [spokes] 迎宾女郎（Entity 28）阶段 3 无头验收（真实 Engine + 真实无限 L5 地图 + 真实 118 大堂 / 117 办公室）。运行：npm run check:spokes
// 覆盖：定义 / 物品 / 员工名录 / 数值表 / 片段时长 · 大堂与办公室摆放（路线都在地板上、坐姿 / 写字 / 投递洞 / 放兔子对齐动画约定）
//       · 状态机（迎宾 → 推销 → 邀请；日程：回办公室坐下 → 画海报 → 丢进洞 A/B → 放兔子 → 回前台）· 双字幕（推销 + 心声）与线索正确性（按快照实算方向 / 距离）
//       · 发条兔（大堂里跳向正门、跟出门在 L5 接着带路、终点随机：员工 / 餐厅、到达代价、停下回头 + 关注度、走远停摆、抓住 / 砸坏掉发条零件）
//       · 邀请两分支（接受 = 危险路线 + 关注度；拒绝 = 心声「做得好」）· 照片支线四步（照片 → 证件交给行李员 → 领回 → 办公室里还给她 → 自由 + 奖励 + 代价、自由后兔子去出口）
//       · 向野兽汇报（beastTip → 余光提前）· 老板拍肩（visit 握点 = 她的右肩）· 打她不死 · 海报（读后 L5 浮出大堂门）· 存档往返 · 渲染（LOD / 片段 / 道具 / 音箱 / 兔子 / 办公室道具 / 物品模型）
import { createCanvas } from '@napi-rs/canvas'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const H = await import('../src/game/engine/l5Hotel')
const S = await import('../src/game/engine/spokesAI')
const A = await import('../src/game/engine/beastAI')
const B = await import('../src/game/engine/bellhopAI')
const M = await import('../src/game/engine/maidAI')
const { specialAction } = await import('../src/game/engine/special')
const { ENTITIES, entitySpawnLevels } = await import('../src/game/entities')
const { snapshot } = await import('../src/game/engine/save')
const { audio } = await import('../src/game/core/audio')
const { L5_STAFF } = await import('../src/game/content/l5Staff')
const { ITEMS } = await import('../src/game/content/items')
const { killCheck } = await import('../src/game/engine/combat')
const { SPOKES_LOBBY: LY, SPOKES_ROUTES, spokesSitFrom, inSpokesOffice } = await import('../src/game/content/spokesLayout')
const { SPOKES_CLIPS, WINDUP_CLIPS } = await import('../src/game/renderer/spokesAnim')
const { l5RegionAt } = await import('../src/game/world/infiniteL5')
const { look } = await import('../src/game/renderer/shared')
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (k !== 'constructor' && typeof (audio as any)[k] === 'function') (audio as any)[k] = () => {}
const { SK } = S

let fails = 0, n = 0
const ok = (c: unknown, m: string, dbg?: unknown) => { n++; console.log(`${c ? '✔' : '✘'} ${m}${dbg !== undefined ? '  ' + JSON.stringify(dbg) : ''}`); if (!c) fails++ }
const SEED = 7028
const events: string[] = []
const msgs: string[] = []
const prep = (e: any) => {
  e.emit = (ev: any) => { events.push(ev.kind) }; e.persist = () => {}
  const m0 = e.msg.bind(e); e.msg = (t: string, k?: any) => { msgs.push(t); return m0(t, k) }
  Object.assign(e.player, { hp: 100, sanity: 80, hunger: 100, thirst: 100, stamina: 100 })
  e.player.hotbar.fill(null); e.player.backpack.fill(null); e.player.equip.pockets.fill(null)
}
const fresh = (seed = SEED) => {
  const e: any = new Engine(); e.seed = seed
  e.hotel = H.freshHotel()
  e.loadLevel(5, { mapSeed: seed, firstVisit: true }); e.introT = 0
  e.map.entities = []
  prep(e)
  e.hotel = H.freshHotel(); e.hotel.floor = 1
  e.hotelShift = { ...e.hotelShift, phase: 'play' }
  return e
}
/** 进 118 大堂（不走过场：直接 loadLevel → hotelPocketArrive → spokesLobbyArrive）；先在 L5 拍快照 */
const lobby = (e: any, snap = true) => {
  if (snap && e.levelDef.id === 5) S.spokesSnapshot(e)
  e.hotel.pocket = { kind: 'lobby', floor: e.hotel.floor, mapSeed: e.mapSeed }
  e.loadLevel(118); e.introT = 0
  e.emit = (ev: any) => { events.push(ev.kind) }; e.persist = () => {}
  return e
}
const office117 = (e: any) => { e.hotel.pocket = { kind: 'beast', floor: e.hotel.floor, mapSeed: e.mapSeed }; e.loadLevel(117); e.introT = 0; e.emit = (ev: any) => { events.push(ev.kind) }; return e }
const back5 = (e: any) => { e.loadLevel(5, { mapSeed: e.hotel.pocket?.mapSeed ?? SEED }); e.introT = 0; H.hotelPocketAfterReturn(e); e.map.entities = e.map.entities.filter((x: any) => x.def.type !== 'concierge' && x.def.type !== 'maid' && x.def.type !== 'bellhop'); e.emit = (ev: any) => { events.push(ev.kind) }; return e }
const stepAll = (e: any, dt = 0.05) => {
  e.time += dt
  A.stepBeastGlobal(e, dt); S.stepSpokesGlobal(e, dt); S.spokesPress(e)
  for (const x of [...e.map.entities]) { if (x.def.type === 'greeter') S.updateSpokes(e, x, dt); else if (x.def.type === 'windup') S.updateWindup(e, x, dt); else if (x.def.type === 'beast') A.updateBeast(e, x, dt) }
}
const run = (e: any, sec: number, dt = 0.05, each?: (t: number) => boolean | void) => { for (let t = 0; t < sec; t += dt) { if (each?.(t)) return true; stepAll(e, dt) } return false }
const lookAt = (e: any, x: number, y: number) => { e.player.facing = Math.atan2(y - e.player.y, x - e.player.x); look.yaw = -e.player.facing - Math.PI / 2 }
const has = (e: any, t: string) => [...e.player.hotbar, ...e.player.backpack].some((s: any) => s?.type === t)
const give = (e: any, t: string) => e.addItem(t)
const greeter = (e: any) => S.findSpokes(e)!
const at = (e: any, x: number, y: number) => { e.player.x = x; e.player.y = y }
const floorOk = (e: any, x: number, y: number) => { const m = e.map; const tx = Math.floor(x), ty = Math.floor(y); return m.tiles[ty * m.w + tx] === 1 && !m.structures.some((s: any) => s.solid && tx >= s.x && tx < s.x + (s.w || 1) && ty >= s.y && ty < s.y + (s.h || 1)) }
/** 转着找一个前方能放兔子的朝向 */
const rabbitAhead = (e: any, invite: boolean, follow: boolean) => { for (let a = 0; a < Math.PI * 2; a += 0.4) { lookAt(e, e.player.x + Math.cos(a), e.player.y + Math.sin(a)); const r = S.spawnRabbitAhead(e, invite, follow); if (r) return r } return null }
/** 玩家跟着兔子走（保持 1.4 m 跟随距离）直到它停摆 / 消失 */
const follow = (e: any, rb: any, sec = 120, dt = 0.05) => run(e, sec, dt, () => {
  if (!e.map.entities.includes(rb) || rb.wu.mode === 'spent') return true
  const p = e.player, dx = rb.x - p.x, dy = rb.y - p.y, d = Math.hypot(dx, dy)
  if (d > 1.4) { const k = Math.min(1, (2.6 * dt) / d); const nx = p.x + dx * k, ny = p.y + dy * k; p.x = nx; p.y = ny }
  p.facing = Math.atan2(dy, dx)
})

// ---------------------------------------------------------------------------
console.log('— 定义 / 物品 / 员工名录 / 数值表 —')
{
  const g: any = ENTITIES.greeter, w: any = ENTITIES.windup
  ok(g && g.name === '迎宾女郎' && g.damage === 0 && g.naturalSpawn === false && g.codex.no.includes('Entity 28'), '实体定义 greeter = Entity 28：不攻击、不进生成池')
  ok(w && w.name === '发条兔' && w.damage === 0 && w.hp === SK.rabbitHp, '实体定义 windup（发条兔）：可砸坏、不攻击')
  ok(entitySpawnLevels('greeter').some((s: any) => s.id === 118) && entitySpawnLevels('windup').some((s: any) => s.id === 5), '图鉴层级归属：迎宾女郎 118 大堂、发条兔 L5 / 118')
  ok(/跑吧/.test(g.codex.behavior) && /洞 A/.test(g.codex.behavior) && /心声/.test(g.codex.counter), '图鉴：中文维基 entity-28 的口吻（「跑吧！」、洞 A/B、心声）')
  for (const t of ['spokesposter', 'spokesphoto', 'detbadge', 'windupgear']) ok(!!(ITEMS as any)[t]?.glyph, `物品定义 ${t}（${(ITEMS as any)[t]?.name}）`)
  ok((ITEMS as any).spokesposter.use === 'sanity', '迎宾海报：阅读类（READ_ITEMS，读完消耗）')
  const st = L5_STAFF.find((s) => s.id === 'greeter')!
  ok(st.habits.length >= 6 && st.habits.some((h) => h.includes('心声')) && st.habits.some((h) => h.includes('兔')) && st.habits.some((h) => h.includes('洞')), '员工名录：习性写明心声 / 发条兔 / 投递洞')
  ok(Object.entries(S.SPOKES_CLIP_LEN).every(([k, v]) => (SPOKES_CLIPS as any)[k]?.dur === v), 'AI 片段时长表 = spokesAnim SPOKES_CLIPS')
  ok(S.WINDUP_LEN.rabbitHop === WINDUP_CLIPS.rabbitHop.dur && S.WINDUP_ANIM_SPEED === WINDUP_CLIPS.rabbitHop.speed, '发条兔片段时长 / 速度 = WINDUP_CLIPS')
  ok(SK.reportAttn === 60 && SK.freeAttnMax === 40 && SK.inviteAttn === 8 && SK.stopAttn === 2, '数值表：汇报 60 / 解放门槛 40 / 邀请 +8 / 停下回头 +2')
  ok(S.PITCH.length >= 20 && S.INNER.length >= 15, `文案池：推销 ${S.PITCH.length} 条、心声 ${S.INNER.length} 条`)
}

console.log('— 118 大堂 + 她的办公室：摆放 —')
{
  const e = lobby(fresh()); prep(e)
  const g = greeter(e), m = e.map
  ok(!!g && Math.abs(g.x - LY.front.x) < 1e-6 && Math.abs(g.facing - LY.front.f) < 1e-6 && g.gr.mode === 'desk', '进大堂：她站在前台后面，面朝正门')
  ok(!m.structures.some((s: any) => s.kind === 'officechair' && s.data?.empty && s.x === 20 && s.y === 10), '前台后面不再是空椅')
  const fd = m.structures.find((s: any) => s.kind === 'frontdesk')
  ok(!!fd && fd.y - g.y > 0.4 && fd.y - g.y < 0.7, `前台桌沿在她正前方 ${(fd.y - g.y).toFixed(2)} m`)
  ok(m.tiles[9 * m.w + 16] === 1 && m.tiles[8 * m.w + 16] === 1 && m.tiles[10 * m.w + 16] === 1, '大堂北墙 x16 门洞通往办公室')
  const office = m.structures.find((s: any) => s.kind === 'spokesprop' && s.data?.prop === 'office'), holes = m.structures.find((s: any) => s.kind === 'spokesprop' && s.data?.prop === 'holes')
  ok(!!office && office.solid && office.x === LY.deskTile.x && !!holes && !holes.solid, '办公室道具：书桌（碰撞）+ 北墙投递洞面板')
  ok(m.tiles[1 * m.w + 22] !== 1 && m.tiles[2 * m.w + 22] === 1, '投递洞面板贴着北墙（y 1 是墙、y 2 是地板）')
  // 坐姿：桌近沿 = 她正前方 0.24 m（桌子 1 × 1 碰撞格在 y 4–5，模型桌近边 seat.y + 0.24）
  ok(Math.abs(LY.draw.y - LY.seat.y - 0.04) < 1e-6, '站写位置比坐姿前 0.04 m（桌近边 0.24 → 0.2）')
  const fromSit = spokesSitFrom(); ok(Math.abs(fromSit.x - (LY.seat.x + 0.9)) < 1e-6 && Math.abs(fromSit.y - (LY.seat.y - 0.05)) < 1e-6, 'sitDesk 起点 = 座位左手边 0.9 m（root [0.9, 0, −0.05]）')
  // 投递洞：站位正前方 0.5 m、root x +0.02 = 洞口中心
  for (const [k, sp] of [['A', LY.dropA], ['B', LY.dropB]] as const) {
    const hole = S.spokesFromRoot({ x: sp.x, y: sp.y, facing: sp.f }, 0.02, 0.5)
    const hx = LY.holes.x + (k === 'A' ? -0.21 : 0.21)
    ok(Math.abs(hole.x - hx) < 0.005 && Math.abs(hole.y - (LY.holes.y + 0.04)) < 0.01, `洞 ${k}：dropPoster 的洞口 [0.02, 0.8, 0.5] 落在面板洞 ${k} 上`, { hole, hx })
  }
  // 路线：每段折线采样都在地板上（不穿墙 / 不穿桌）
  let bad = ''
  const starts: Record<string, any> = { frontToOffice: LY.front, seatToDrop: LY.seat, dropToWind: LY.dropA, windToFront: LY.wind, frontToWind: LY.front, frontToDoor: LY.front, officeToDoor: LY.draw }
  for (const [k, rt] of Object.entries(SPOKES_ROUTES)) {
    let cur = starts[k]
    for (const p of rt as any[]) { for (let i = 1; i <= 20; i++) { const x = cur.x + (p.x - cur.x) * i / 20, y = cur.y + (p.y - cur.y) * i / 20; if (Math.hypot(x - starts[k].x, y - starts[k].y) > 0.35 && !floorOk(e, x, y)) bad ||= `${k} @ ${x.toFixed(2)},${y.toFixed(2)}` } cur = p }
  }
  ok(!bad, '所有路线都走在地板上（不穿墙、不穿桌；起点 0.35 m 内除外——坐 / 写字的位置本来就挨着书桌）', bad || undefined)
  ok(inSpokesOffice(LY.seat.x, LY.seat.y) && inSpokesOffice(LY.dropA.x, LY.dropA.y) && !inSpokesOffice(LY.front.x, LY.front.y), '办公室范围：座位 / 投递洞在内，前台在外')
  ok(m.items.some((i: any) => i.type === 'spokesphoto' && inSpokesOffice(i.x, i.y)), '侦探照片：她办公室桌边的地上')
}

console.log('— 状态机：迎宾 → 推销（双字幕）→ 邀请 —')
{
  const e = lobby(fresh(SEED + 1)); prep(e)
  const g = greeter(e)
  at(e, 20.0, 16); lookAt(e, g.x, g.y)
  run(e, 1)
  ok(g.gr.mode === 'desk', '你在 5.5 m 外：她站在前台')
  at(e, 20.0, 14.6); lookAt(e, g.x, g.y); run(e, 0.1)
  ok(g.gr.mode === 'greet' && g.gr.clip === 'greetSpin', '走近：脚尖旋转迎宾（greetSpin）')
  const h = S.spokesHud(e)
  ok(!!h?.top && !!h.inner && h.top.includes('欢迎来到恐怖旅馆') && h.inner.includes('跑吧'), '双字幕：上行音箱推销、下行心声「跑吧！」', h)
  ok(e.hotelBook.met.includes('greeter'), '遇见：登记簿员工名录点亮')
  run(e, SK.subPair)
  ok(g.gr.mode === 'talk' || g.gr.mode === 'desk', '转完圈：按着音箱说话（speakerTalk）')
  run(e, 6)
  at(e, 20.0, 13.2); lookAt(e, g.x, g.y)
  S.spokesDebug(e).inviteCd = 0; g.gr.mode = 'desk'
  events.length = 0
  run(e, 0.1)
  ok(g.gr.mode === 'invite' && g.gr.clip === 'bowInvite', '走到前台前：鞠躬伸手邀请「参观」（bowInvite）')
  ok(S.spokesHud(e)!.inner === '不要！拒绝我！', '邀请时心声：「不要！拒绝我！」')
  run(e, 2.5)
  ok(S.spokesInviteOpen(e) && events.includes('greeterinvite'), '伸出手：弹出邀请（接受 / 婉拒）')
  const attn0 = e.hotel.attn
  ok(S.spokesDeclineInvite(e) && !S.spokesInviteOpen(e), '拒绝')
  ok(g.gr.mode === 'talk' && S.spokesHud(e)!.inner!.includes('做得好') && e.hotel.attn === attn0 && S.spokesSave(e).n.decline === 1, '拒绝：她继续推销，心声说「做得好」，关注度不变')
}

console.log('— 线索正确性：心声里的方向 / 距离 = 快照实算 —')
{
  const e = fresh(SEED + 2)
  // 找一个能拍到出口和危险房间的位置：出生点
  const p = e.player
  lookAt(e, p.x + 1, p.y) // 朝东看着大堂门 → 出门后朝西
  const md = M.spawnMaid(e, { x: p.x + 0.5, y: p.y + 8.5 })
  S.spokesSnapshot(e)
  const sv = S.spokesSave(e), sn = sv.snap!
  const { ox, oy } = e.map.inf
  ok(!!sn && Math.abs(sn.ax - (p.x + ox)) < 1e-6 && Math.abs(Math.cos(sn.f) - -1) < 1e-6, '快照：返回点 = 推门位置，出门后朝向 = 转身背对大门', { f: sn?.f })
  const ex = e.map.exits.reduce((b: any, x: any) => (!b || Math.hypot(x.x - p.x, x.y - p.y) < Math.hypot(b.x - p.x, b.y - p.y) ? x : b), null)
  ok(!!sn.exit && !!ex && Math.abs(sn.exit.wx - (ex.x + 0.5 + ox)) < 1e-6 && sn.exit.name === ex.def.name, `快照出口 = 窗口里最近的出口（${ex?.def.name}）`)
  ok(!!sn.maid && Math.abs(sn.maid.wx - (md!.x + ox)) < 1e-6, '快照：管家位置')
  if (sn.danger) ok(['mothnest', 'boilerroom'].includes(l5RegionAt(e.map.inf.seed, Math.floor(sn.danger.wx), Math.floor(sn.danger.wy))?.variant as string), `快照：危险房间（${sn.danger.v}）在那个位置确实是`)
  // 独立实算：右手边 = 叉积 > 0（地图 y 朝南）
  const word = (wx: number, wy: number) => { const fx = Math.cos(sn.f), fy = Math.sin(sn.f), dx = wx - sn.ax, dy = wy - sn.ay, L = Math.hypot(dx, dy); const c = (fx * dx + fy * dy) / L, x = fx * dy - fy * dx; return c >= Math.SQRT1_2 ? '正前方' : c <= -Math.SQRT1_2 ? '身后' : x > 0 ? '右手边' : '左手边' }
  const dist = (wx: number, wy: number) => Math.max(5, Math.round(Math.hypot(wx - sn.ax, wy - sn.ay) / 5) * 5)
  const clues = S.spokesClues(e)
  const exitClue = clues.find((c) => c.startsWith(sn.exit!.name))!
  ok(!!exitClue && exitClue.includes(word(sn.exit!.wx, sn.exit!.wy)) && exitClue.includes(`${dist(sn.exit!.wx, sn.exit!.wy)} 米`), '出口线索：方向词与距离 = 实算', exitClue)
  const maidClue = clues.find((c) => c.startsWith('管家'))!
  ok(!!maidClue && maidClue.includes(word(sn.maid!.wx, sn.maid!.wy)) && word(sn.maid!.wx, sn.maid!.wy) === '左手边', '管家线索：在你南边 8.5 m、出门朝西 → 「左手边」', maidClue)
  if (sn.danger) { const dc = clues.find((c) => c.startsWith('别去'))!; ok(!!dc && dc.includes(word(sn.danger.wx, sn.danger.wy)), '危险房间线索：方向 = 实算', dc) }
  ok(clues.includes(S.FOOD_TRUTH), '厨师食物的真相（固定真话）')
  ok(clues.some((c) => c.includes('照片')), '照片支线未开始：心声提到他办公室里的照片')
  ok(!clues.some((c) => c.includes('签了约')), '没有契约：不提契约')
  A.beastSave(e).contracts.push({ id: 1, boon: 'calm', task: 'still', limit: 720, left: 300, prog: 0, base: 0, state: 'active' })
  ok(S.spokesClues(e).some((c) => c.includes('签了约') && c.includes('5 分钟')), '有契约：心声说还剩几分钟（= 契约剩余时间）')
  e.hotel.attn = 55
  ok(S.spokesClues(e).some((c) => c.includes('酒店已经在看你')), '关注度 ≥ 50：心声提醒')
  // 心声节奏：每 2 条一条真线索
  const r = S.spokesDebug(e); r.innerN = 0
  const seq = [S.nextInner(e), S.nextInner(e), S.nextInner(e), S.nextInner(e)]
  const cl = S.spokesClues(e)
  ok(!cl.includes(seq[0]) && cl.includes(seq[1]) && !cl.includes(seq[2]) && cl.includes(seq[3]), '心声：每两条里一条是真线索')
  ok(S.relDir(0, 1, 0) === '正前方' && S.relDir(0, 0, 1) === '右手边' && S.relDir(0, 0, -1) === '左手边' && S.relDir(0, -1, 0.1) === '身后', '方向词：朝东时南 = 右手边')
}

console.log('— 日程：回办公室坐下 → 画海报 → 丢进洞 → 放兔子 → 回前台 —')
{
  const e = lobby(fresh(SEED + 3)); prep(e)
  const g = greeter(e)
  at(e, 27.5, 21.5); lookAt(e, 28, 23) // 大堂东南角，背对她
  g.gr.phaseLen = 1
  const seen = new Set<string>(), seenClip = new Set<string>()
  let sitAt: any = null, dropAt: any = null, rbAt: any = null, windSpot: any = null
  run(e, 200, 0.05, () => {
    seen.add(g.gr.mode); seenClip.add(g.gr.clip)
    if (g.gr.mode === 'seat' && !sitAt) sitAt = { x: g.x, y: g.y, f: g.facing }
    if (g.gr.mode === 'drop' && !dropAt) dropAt = { x: g.x, y: g.y, f: g.facing, hole: g.gr.hole }
    if (g.gr.mode === 'wind' && !windSpot) windSpot = { x: g.x, y: g.y, f: g.facing }
    const rb = S.findWindups(e)[0]; if (rb && !rbAt) rbAt = { x: rb.x, y: rb.y, lobby: rb.wu.lobby, path: rb.wu.path }
    return !!rbAt && g.gr.mode === 'desk'
  })
  ok(['walk', 'sit', 'seat', 'draw', 'drop', 'wind', 'desk'].every((k) => seen.has(k)), '日程走完一轮：walk → sit → seat → draw → drop → wind → desk', [...seen])
  ok(['walk', 'sitDesk', 'seatedIdle', 'drawPoster', 'dropPoster', 'windRabbit'].every((k) => seenClip.has(k)), '片段：walk / sitDesk / seatedIdle / drawPoster / dropPoster / windRabbit')
  ok(!!sitAt && Math.hypot(sitAt.x - LY.seat.x, sitAt.y - LY.seat.y) < 1e-6 && Math.abs(sitAt.f - LY.seat.f) < 1e-6, '坐下：正好在皮椅上、面朝书桌（桌近沿 0.24 m）')
  const dSpot = dropAt?.hole === 'A' ? LY.dropA : LY.dropB
  ok(!!dropAt && Math.hypot(dropAt.x - dSpot.x, dropAt.y - dSpot.y) < 1e-6 && Math.abs(dropAt.f - dSpot.f) < 1e-6, `丢海报：站在洞 ${dropAt?.hole} 前 0.5 m、面朝北墙`)
  ok(!!windSpot && Math.hypot(windSpot.x - LY.wind.x, windSpot.y - LY.wind.y) < 1e-6, '放兔子：前台南面的地毯上')
  const expect = S.spokesFromRoot({ x: LY.wind.x, y: LY.wind.y, facing: LY.wind.f }, S.WIND_X, S.WIND_END_Z)
  ok(!!rbAt && Math.hypot(rbAt.x - expect.x, rbAt.y - expect.y) < 1e-6 && rbAt.lobby, '发条兔出现在 windRabbit 片段末道具兔子的位置（root [−0.17, 0, 1.15]）', rbAt && { x: rbAt.x, y: rbAt.y })
  const last = rbAt?.path[rbAt.path.length - 1]
  ok(!!last && Math.hypot(last.x - LY.lobbyDoor.x, last.y - LY.lobbyDoor.y) < 1e-6 && rbAt.path.every((p: any) => floorOk(e, p.x, p.y)), '大堂里的兔子：寻路跳向大堂正门（路点都在地板上）')
  ok(g.gr.mode === 'desk' && Math.hypot(g.x - LY.front.x, g.y - LY.front.y) < 1e-6, '回到前台')
  const rb = S.findWindups(e)[0]
  run(e, 40)
  ok(!e.map.entities.includes(rb) && !!S.spokesDebug(e).doorRb, '没人跟：兔子自己跳出了大堂正门')
}

console.log('— 邀请：接受 → 危险路线 —')
{
  const e = fresh(SEED + 4)
  lookAt(e, e.player.x + 1, e.player.y)
  lobby(e); prep(e)
  const g = greeter(e)
  at(e, 20.0, 13.2); lookAt(e, g.x, g.y)
  S.spokesDebug(e).greeted = true; S.spokesDebug(e).inviteCd = 0
  run(e, 2.6)
  ok(S.spokesInviteOpen(e), '邀请弹出')
  const attn0 = e.hotel.attn
  ok(S.spokesAcceptInvite(e), '接受')
  ok(e.hotel.attn === attn0 + SK.inviteAttn && S.spokesHud(e)!.inner!.includes('不'), `接受：关注度 +${SK.inviteAttn}，心声「不……」`)
  ok(g.gr.mode === 'walk' && g.gr.invited, '她绕出前台去放兔子')
  at(e, 22.5, 15.5)
  let rb: any = null
  run(e, 40, 0.05, () => { rb = S.findWindups(e)[0]; return !!rb })
  ok(!!rb && rb.wu.invite, '放出的兔子带着「参观」标记')
  // 跟着它出门
  follow(e, rb, 60, 0.05)
  ok(!!S.spokesDebug(e).doorRb || !!S.spokesDebug(e).nearRb, '跟着兔子走到大堂门口')
  back5(e)
  const p = e.player
  lookAt(e, p.x + 1, p.y)
  run(e, 1.2)
  const rb5 = S.findWindups(e)[0]
  ok(!!rb5 && rb5.wu.invite && rb5.wu.mode === 'lead', '回到 L5：兔子从你脚边跳出来，接着带路（危险路线）', rb5?.wu && { mode: rb5.wu.mode, dest: rb5.wu.dest })
  ok(!!rb5 && rb5.wu.dest !== 'dining' && rb5.wu.dest !== 'exit', '接受邀请的终点一定是员工', rb5?.wu.dest)
  if (rb5?.wu.danger) {
    const seed = e.map.inf.seed
    ok(rb5.wu.path.some((q: any) => ['mothnest', 'boilerroom'].includes(l5RegionAt(seed, Math.floor(q.x), Math.floor(q.y))?.variant as string)), '危险路线：路上经过死亡飞蛾巢穴 / 锅炉房')
  } else ok(true, '（这个种子附近 45 m 内没有危险房间：直接去员工）')
}

console.log('— 发条兔：终点随机 / 到达代价 / 停下回头 / 停摆 / 抓住 / 砸坏 —')
{
  // 终点分布（不强制）：员工三种 + 餐厅都会出现
  const e = fresh(SEED + 5)
  const kinds = new Set<string>()
  for (let i = 0; i < 40; i++) {
    const rb = rabbitAhead(e, false, false); if (!rb) continue
    if (S.planRoute(e, rb)) kinds.add(rb.wu.dest)
    e.map.entities = e.map.entities.filter((x: any) => x.def.type !== 'windup')
  }
  ok(kinds.size >= 3 && !kinds.has('exit') && [...kinds].every((k) => ['concierge', 'maid', 'bellhop', 'dining'].includes(k)), '没自由之前：终点随机（员工 / 餐厅），不会是出口', [...kinds])
  // 每种终点：跟到底 → 到达效果
  for (const dest of ['maid', 'bellhop', 'concierge', 'dining'] as const) {
    const e2 = fresh(SEED + 6); prep(e2)
    const p = e2.player; lookAt(e2, p.x + 1, p.y)
    const rb = rabbitAhead(e2, false, false)
    if (!rb || !S.planRoute(e2, rb, dest)) { ok(!!rb && (dest === 'dining' || dest === 'concierge'), `终点 ${dest}：这一窗口里没有（餐厅 / 前台只在部分楼层）——跳过`); continue }
    rb.wu.mode = 'lead'
    const attn0 = e2.hotel.attn, hunger0 = e2.player.hunger
    msgs.length = 0
    follow(e2, rb, 150)
    ok(rb.wu.mode === 'spent', `终点 ${dest}：跟到底，兔子停摆`, { mode: rb.wu.mode, pi: rb.wu.pi, n: rb.wu.path.length })
    ok(e2.hotel.attn > attn0, `终点 ${dest}：关注度 +（${(e2.hotel.attn - attn0).toFixed(1)}）`)
    if (dest === 'maid') ok(msgs.some((t) => t.includes('清洁车')) && !!M.findMaid(e2), '交给管家：清洁车后面的人转过头来（她听见了你）')
    if (dest === 'bellhop') ok(msgs.some((t) => t.includes('长铃')) && B.bellhopSave(e2).n.annoyed >= 1, '交给行李员：他摇响那声恼怒的长铃')
    if (dest === 'concierge') ok(msgs.some((t) => t.includes('皮鞋')) && e2.map.entities.some((x: any) => x.def.type === 'concierge'), '交给看门人：他出现在你身后')
    if (dest === 'dining') ok(msgs.some((t) => t.includes('烤肉')) && e2.player.hunger < hunger0, '带进餐厅：烤肉香味，饥饿下降')
  }
  // 停下回头
  {
    const e3 = fresh(SEED + 7); prep(e3)
    lookAt(e3, e3.player.x + 1, e3.player.y)
    const rb = rabbitAhead(e3, false, true)!
    ok(!!rb && rb.wu.mode === 'lead', '跟出来的兔子：直接开始带路')
    const attn0 = e3.hotel.attn
    run(e3, 3.2) // 你站着不动
    ok(rb.wu.mode === 'stop' && rb.wu.clip === 'rabbitStop' && e3.hotel.attn === attn0 + SK.stopAttn, `你停下：兔子停住回头（rabbitStop），关注度 +${SK.stopAttn}`)
    // 走近 → 继续
    run(e3, 1.5, 0.05, () => { const p = e3.player; const dx = rb.x - p.x, dy = rb.y - p.y, d = Math.hypot(dx, dy); if (d > 1.2) { p.x += dx / d * 0.12; p.y += dy / d * 0.12 } })
    ok(rb.wu.mode === 'lead', '你重新跟上：它继续跳')
    // 反向走
    const a0 = e3.hotel.attn
    rb.wu.stopCd = 0
    run(e3, 1.4, 0.05, () => { const p = e3.player; const dx = rb.x - p.x, dy = rb.y - p.y, d = Math.hypot(dx, dy); p.x -= dx / d * 0.12; p.y -= dy / d * 0.12 })
    ok(rb.wu.mode === 'stop' && e3.hotel.attn > a0, '你往回走：兔子停住回头，关注度小涨')
    // 走远：停摆
    e3.player.x = rb.x + 30; e3.player.y = rb.y
    rb.wu.lastPx = e3.player.x; rb.wu.lastPy = e3.player.y
    run(e3, SK.giveUp + 1)
    ok(rb.wu.mode === 'spent', `你在 ${SK.lostR} m 外超过 ${SK.giveUp} s：发条走完，停摆`)
  }
  // 抓住 / 砸坏
  {
    const e4 = fresh(SEED + 8); prep(e4)
    lookAt(e4, e4.player.x + 1, e4.player.y)
    const rb = rabbitAhead(e4, false, true)!
    at(e4, rb.x - 1, rb.y)
    const sa = specialAction(e4)
    ok(sa?.id === 'spokes-catch', 'X 情境：抓住发条兔', sa)
    const a0 = e4.hotel.attn
    e4.specialPressed = true; S.spokesPress(e4)
    ok(has(e4, 'windupgear') && !e4.map.entities.includes(rb) && e4.hotel.attn === a0 + SK.catchAttn, `抓住：得到「发条零件」，关注度 +${SK.catchAttn}`)
    const rb2 = rabbitAhead(e4, false, false)!
    rb2.hp = 0; killCheck(e4, rb2)
    ok(!e4.map.entities.includes(rb2) && e4.map.items.some((i: any) => i.type === 'windupgear' && Math.hypot(i.x - rb2.x, i.y - rb2.y) < 1e-6), '砸坏：铁皮壳裂开，发条零件掉在原地')
    ok(S.spokesSave(e4).n.caught === 1 && S.spokesSave(e4).n.broken === 1, '统计：抓住 1 / 砸坏 1')
  }
  // L5 迷路太久：遇到一只
  {
    const e5 = fresh(SEED + 9); prep(e5)
    lookAt(e5, e5.player.x + 1, e5.player.y)
    run(e5, 1)
    const r = S.spokesDebug(e5); r.wildNext = r.l5T + 0.5
    let rb: any = null
    for (let k = 0; k < 16 && !rb; k++) { lookAt(e5, e5.player.x + Math.cos(k), e5.player.y + Math.sin(k)); run(e5, 2.1); rb = S.findWindups(e5)[0] }
    ok(!!rb && rb.wu.mode === 'wait', '迷路太久：前方出现一只发条兔，停下来回头看你')
    if (rb) { at(e5, rb.x - 2, rb.y); run(e5, 0.2); ok(rb.wu.mode === 'lead' || rb.wu.mode === 'spent', '你走近：它开始带路') }
  }
}

console.log('— 向野兽汇报 / 老板拍肩 / 打她 —')
{
  const e = fresh(SEED + 10); prep(e)
  lookAt(e, e.player.x + 1, e.player.y)
  e.hotel.attn = 70
  const rb = rabbitAhead(e, false, true)!
  run(e, 0.2)
  ok(A.beastTipped(e) && S.spokesSave(e).n.report === 1 && msgs.some((t) => t.includes('红光')), '关注度 ≥ 60、兔子看见你：向老板汇报（beastTip）')
  const bd: any = A.beastDebug(e)
  ok(bd.periNext <= bd.mapT + A.BE.tipDelay + 1e-6, `汇报：下一次余光提前到 ${A.BE.tipDelay} s 内（无视门槛）`, { next: bd.periNext, t: bd.mapT })
  let seenB = false
  for (let k = 0; k < 24 && !seenB; k++) { lookAt(e, e.player.x + Math.cos(k * 0.7), e.player.y + Math.sin(k * 0.7)); run(e, 0.5); seenB = A.findBeast(e)?.bst?.mode === 'peri' }
  ok(seenB && !A.beastTipped(e), '他出现在你的余光里（汇报用掉）')
  void rb
  // 大堂：老板拍肩
  const e2 = lobby(fresh(SEED + 11)); prep(e2)
  const g = greeter(e2)
  at(e2, 20, 15); lookAt(e2, g.x, g.y)
  S.spokesDebug(e2).greeted = true
  S.spokesDebug(e2).tapNext = 0.01
  run(e2, 0.1)
  const b = A.findBeast(e2)
  ok(!!b && b.bst!.mode === 'visit' && b.bst!.clip === 'handshake' && g.gr.mode === 'tap' && g.gr.clip === 'shoulderTap', '老板来了：他站在她右后方（visit / handshake），她 shoulderTap')
  ok(S.spokesHud(e2)!.top!.includes('老板好') && S.spokesHud(e2)!.inner!.includes('别碰我'), '音箱「老板好！」，心声「别碰我」')
  run(e2, 0.5)
  // 握点：root 空间 → world，应在她右肩（root [−0.13, 1.375, −0.03]）
  const sp = b!.bst!.shakeP!, c = Math.cos(b!.facing), s = Math.sin(b!.facing)
  const wx = b!.x + sp[0] * s + sp[2] * c, wy = b!.y - sp[0] * c + sp[2] * s
  const sh = S.spokesShoulder(g)
  ok(Math.hypot(wx - sh.x, wy - sh.y) < 0.005 && Math.abs(sp[1] - 1.375) < 0.005, `握点 = 她的右肩（误差 ${(Math.hypot(wx - sh.x, wy - sh.y) * 100).toFixed(2)} cm）`)
  ok(Math.hypot(sp[0], sp[2]) < 0.7, `她的肩在他够得着的范围（${Math.hypot(sp[0], sp[2]).toFixed(2)} m）`)
  run(e2, 6)
  ok(!A.findBeast(e2) && g.gr.mode === 'desk', '拍完：他隐入暗处，她回到前台')
  // 关注度高：她当面汇报
  e2.hotel.attn = 65; S.spokesDebug(e2).reportCd = 0
  run(e2, 0.1)
  ok(A.beastTipped(e2) && S.spokesHud(e2)!.inner!.includes('告诉他'), '关注度 ≥ 60、她看见你：「我得告诉他你在这儿」')
  // 打她
  const a0 = e2.hotel.attn; g.gr.mode = 'desk'
  g.hp = 0; killCheck(e2, g)
  ok(!g.dead && g.hp === g.def.hp && g.gr.mode === 'freeze' && e2.hotel.attn === Math.min(100, a0 + SK.hitAttn) && S.spokesHud(e2)!.inner!.includes('再用力'), '打她：不死、不还手，innerFreeze，心声「再用力一点」，关注度 +')
}

console.log('— 照片解放支线：照片 → 证件 → 领回 → 还给她 → 自由 —')
{
  const e = fresh(SEED + 12)
  lookAt(e, e.player.x + 1, e.player.y)
  const sn0 = (S.spokesSnapshot(e), S.spokesSave(e).snap!)
  // ① 117 野兽办公室：照片在书桌前的地上
  office117(e)
  ok(e.map.items.some((i: any) => i.type === 'spokesphoto'), '① 侦探照片：117 野兽办公室书桌前的地上')
  // 进大堂
  e.hotel.pocket = { kind: 'lobby', floor: 1, mapSeed: SEED + 12 }
  S.spokesSave(e).snap = sn0
  e.loadLevel(118); e.introT = 0; prep(e)
  const g = greeter(e)
  give(e, 'spokesphoto')
  at(e, 20, 12.6); lookAt(e, g.x, g.y); S.spokesDebug(e).greeted = true; S.spokesDebug(e).inviteCd = 99
  run(e, 0.1)
  const sa = specialAction(e)
  ok(sa?.id === 'spokes-photo' && sa.label === '给她看照片', 'X 情境：给她看照片', sa)
  e.specialPressed = true; S.spokesPress(e)
  ok(g.gr.mode === 'recall' && g.gr.clip === 'photoRecall' && g.gr.photo === 1 && !has(e, 'spokesphoto') && S.spokesSave(e).photo === 1, '② 给她看：photoRecall（照片收走）')
  const hud = S.spokesHud(e)!
  ok(hud.clear && hud.inner!.includes('那是我'), '② 心声第一次清晰（HUD 白字）')
  run(e, SK.subPair - 0.9)
  const hint = S.spokesHud(e)!.inner!
  const ex = sn0.exit!, fx = Math.cos(sn0.f), fy = Math.sin(sn0.f), dx = ex.wx - sn0.ax, dy = ex.wy - sn0.ay
  const cc = (fx * dx + fy * dy) / Math.hypot(dx, dy), cr = fx * dy - fy * dx
  const want = cc >= Math.SQRT1_2 ? '正前方' : cc <= -Math.SQRT1_2 ? '身后' : cr > 0 ? '右手边' : '左手边'
  ok(hint.includes(ex.name) && hint.includes(want) && hint === S.spokesKeyHint(e), '② 一次关键提示：出了大堂门，出口在哪个方向、多远（= 快照实算）', hint)
  ok(B.bellhopSave(e).held.some((i: any) => i.type === 'detbadge'), '③ 她的证件：看门人没收 → 行李员代管（bellhop.held）')
  run(e, 8)
  ok(g.gr.mode === 'desk' && S.spokesClues(e).every((c) => !c.includes('照片')), '回到前台；心声不再提照片')
  // ③ 领回：回 L5 找行李员
  back5(e)
  const bh = B.spawnBellhop(e, { x: e.player.x + 1.2, y: e.player.y, f: Math.PI })!
  ok(!!bh, '行李员')
  B.bellhopSave(e).free = 1
  const sp = (lookAt(e, bh.x, bh.y), specialAction(e))
  ok(sp?.id === 'bellhop-keys' && sp.label === '领回代管的东西', 'X 情境（行李员）：领回代管的东西', sp)
  B.bellhopClaimKeys(e, bh)
  ok(has(e, 'detbadge') && !B.bellhopSave(e).held.length, '③ 领回：侦探证件到手')
  // ④ 还给她：前台不行 / 关注度高不行 / 办公室里关注度低可以
  lobby(e, false)
  const g2 = greeter(e)
  at(e, 20, 12.6); lookAt(e, g2.x, g2.y); S.spokesDebug(e).greeted = true; S.spokesDebug(e).inviteCd = 99
  e.hotel.attn = 10
  run(e, 0.1)
  ok(specialAction(e)?.id === 'spokes-badge', 'X 情境：把证件还给她')
  e.specialPressed = true; S.spokesPress(e)
  ok(g2.gr.mode === 'freeze' && has(e, 'detbadge') && S.spokesHud(e)!.inner!.includes('办公室'), '④ 在前台：不行（「到我的办公室来——这里太多眼睛了」）')
  run(e, 6)
  // 带她到办公室：等她进入日程（坐下）
  g2.gr.phaseLen = 0; at(e, 27, 21)
  run(e, 60, 0.05, () => g2.gr.mode === 'seat' || g2.gr.mode === 'draw')
  ok(inSpokesOffice(g2.x, g2.y), '她回到办公室')
  at(e, LY.seat.x, LY.seat.y + 1.6); lookAt(e, g2.x, g2.y)
  e.hotel.attn = 45
  e.specialPressed = true; S.spokesPress(e)
  ok(g2.gr.mode === 'freeze' && S.spokesSave(e).photo === 1 && S.spokesHud(e)!.inner!.includes('他在看'), `④ 关注度 ≥ ${SK.freeAttnMax}：不行（「他在看。等酒店安静下来」）`)
  run(e, 5.2)
  e.hotel.attn = 12
  at(e, g2.x, g2.y + 1.6); lookAt(e, g2.x, g2.y)
  e.specialPressed = true; S.spokesPress(e)
  ok(g2.gr.mode === 'recall' && g2.gr.photo === 2 && !has(e, 'detbadge') && S.spokesSave(e).photo === 2, '④ 办公室、关注度低、老板不在：她接过证件（photoRecall）')
  run(e, S.SPOKES_CLIP_LEN.photoRecall + 0.2)
  const sv = S.spokesSave(e)
  ok(sv.freed === 1 && sv.photo === 3 && g2.gr.speakerOff && has(e, SK.freeGift), '自由：她摘下领口的音箱，把幸运兔脚放进你手里')
  ok(g2.gr.mode === 'walk' && g2.gr.then === 'free', '她自己走向大堂正门')
  run(e, 80)
  ok(!S.findSpokes(e), '她走出了大堂正门')
  // 再进大堂：她不在了，空椅子回来
  lobby(e, false)
  ok(!S.findSpokes(e) && e.map.structures.some((s: any) => s.kind === 'officechair' && s.data?.empty), '再来：前台后面只剩那把空椅子')
  // 代价：回 L5 关注度 +20；之后的兔子去出口
  back5(e)
  const a0 = e.hotel.attn
  run(e, 0.2)
  ok(e.hotel.attn >= a0 + SK.freeCost - 1e-6 && msgs.some((t) => t.includes('账簿')), `代价：回到 L5，关注度 +${SK.freeCost}（老板知道了）`)
  lookAt(e, e.player.x + 1, e.player.y)
  const rb = rabbitAhead(e, false, false)!
  ok(!!rb && S.planRoute(e, rb) && rb.wu.dest === 'exit', '自由之后：发条兔把你带去最近的出口')
}

console.log('— 迎宾海报：读后指向 L5 → 大堂门浮出 —')
{
  const e = fresh(SEED + 13)
  e.loadLevel(1, { mapSeed: 99 }); e.introT = 0; prep(e)
  give(e, 'spokesposter')
  const slot = e.player.hotbar.findIndex((s: any) => s?.type === 'spokesposter')
  e.useSlot('hotbar', slot)
  for (let t = 0; t < 3; t += 0.05) e.updateItemUse?.(0.05)
  ok(S.spokesSave(e).poster === 1 && msgs.some((t) => t.includes('Level 4') && t.includes('别来')), '读海报：指向 L5（L4 古典楼梯 / L3 电梯），背面铅笔字「别来」', msgs.filter((t) => t.includes('Level')).slice(-1))
  e.loadLevel(5, { mapSeed: SEED + 13 }); e.introT = 0; e.map.entities = []; prep(e)
  lookAt(e, e.player.x + 1, e.player.y)
  run(e, 0.1)
  S.spokesDebug(e).posterT = S.spokesDebug(e).l5T + 0.2
  let door: any = null
  for (let k = 0; k < 14 && !door; k++) { lookAt(e, e.player.x + Math.cos(k * 0.5), e.player.y + Math.sin(k * 0.5)); run(e, 2.1); door = e.map.structures.find((s: any) => s.kind === 'l5pocketdoor' && s.data?.pocket === 'lobby' && s.data?.event) }
  ok(!!door && e.hotelEventDoor?.pocket === 'lobby' && H.hotelLobbyShown(e, door) && S.spokesSave(e).posterDone === 1, '回到 L5：视野里的墙上浮出一扇「大堂」门（一推就开）')
}

console.log('— 存档往返 —')
{
  const e = fresh(SEED + 14)
  S.spokesSnapshot(e)
  const sv = S.spokesSave(e); sv.photo = 2; sv.poster = 1; sv.n.caught = 3; sv.n.report = 2
  const snap: any = snapshot(e)
  const back = H.restoreHotel(JSON.parse(JSON.stringify(snap.hotel)))
  const canon = (o: any): any => Array.isArray(o) ? o.map(canon) : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, canon(o[k])])) : o
  ok(JSON.stringify(canon(back.spokes)) === JSON.stringify(canon(sv)), '存档往返：快照 / 支线进度 / 海报 / 统计一致')
  const bad = H.restoreHotel({ spokes: { photo: 9, n: { caught: -3 }, snap: { ax: 'x', exit: { wx: 1 } } } } as any)
  ok(bad.spokes!.photo === 3 && bad.spokes!.n.caught === 0 && !bad.spokes!.snap!.exit, '坏存档：钳到合法范围')
}

console.log('— 渲染 —')
{
  const R = await import('../src/game/renderer/spokesRender')
  const THREE = await import('three')
  const grp = R.buildGreeterEntityMesh()
  ok(!!grp.userData.lod1 && !grp.userData.lod0, '实体网格：先只建 LOD1')
  const ent: any = { id: 1, x: 0, y: 0, z: 0, facing: 0, def: ENTITIES.greeter, gr: S.ensureSpokes({} as any) }
  ent.gr.clip = 'greetSpin'; ent.gr.seq = 1; ent.gr.modeT = 1.0
  R.animateGreeterEntity(grp, ent, 1 / 30, 3)
  ok(!!grp.userData.lod0 && grp.userData.lod0.visible && !grp.userData.lod1.visible, '走近 < 7 m：建 LOD0 并切过去')
  R.animateGreeterEntity(grp, ent, 1 / 30, 12)
  ok(grp.userData.lod1.visible && !grp.userData.lod0.visible, '> 9 m：切回 LOD1')
  ent.gr.speakerOff = true
  R.animateGreeterEntity(grp, ent, 1 / 30, 3)
  const rig: any = grp.userData.rig0
  ok(rig && rig.speaker && !rig.speaker.visible, '自由：领口的音箱不见了')
  // windRabbit 末尾道具兔子藏起来（交给实体兔子）
  ent.gr.clip = 'windRabbit'; ent.gr.seq = 2; ent.gr.modeT = 7.0; ent.gr.speakerOff = false
  R.animateGreeterEntity(grp, ent, 1 / 30, 3)
  let propRb: any = null; grp.traverse((o: any) => { if (o.name === 'windupRabbit' && o.visible && o.parent?.isBone) propRb = o })
  ok(!propRb, 'windRabbit 片段末：她手边的道具兔子在实体兔子出现的那一刻藏起来')
  const wg = R.buildWindupEntityMesh(), went: any = { id: 2, x: 0, y: 0, facing: 0, def: ENTITIES.windup, wu: S.ensureWindup({} as any) }
  went.wu.clip = 'rabbitHop'; went.wu.hopT = 0.2
  R.animateWindupEntity(wg, went, 1 / 30)
  ok(wg.children.length > 0 && wg.userData.windupT === 0.2, '发条兔实体网格：跳行时间 = AI hopT（速度换算后的片段时间）')
  const off = R.buildSpokesProp({ kind: 'spokesprop', x: 20, y: 4, w: 1, h: 1, solid: true, data: { prop: 'office' } } as any)!
  const names: string[] = []; off.traverse((o: any) => names.push(o.name))
  ok(['spokesNameplate', 'spokesRadio', 'spokesDesk', 'spokesChair'].every((k) => names.includes(k)), '办公室道具：书桌 / 皮椅 / 铭牌 / 收音机', names.filter((k) => k.startsWith('spokes')))
  const box = new THREE.Box3()
  off.updateMatrixWorld(true); off.traverse((o: any) => { if (o.name === 'spokesDeskTop') box.setFromObject(o) })
  ok(Math.abs(box.max.y - 0.74) < 0.005 && Math.abs(box.min.z - (LY.seat.y + 0.24)) < 0.01, `桌面 0.74 m、桌近边 = 座位 + 0.24 m（${box.min.z.toFixed(3)}）`)
  const ho = R.buildSpokesProp({ kind: 'spokesprop', x: 22, y: 2, w: 1, h: 1, solid: false, data: { prop: 'holes' } } as any)!
  ho.updateMatrixWorld(true); const hb = new THREE.Box3(); ho.traverse((o: any) => { if (o.name === 'dropPanel') hb.expandByObject(o) })
  ok(Math.abs(hb.min.y - 0.49) < 0.02 && hb.min.z > 1.99 && hb.min.z < 2.03, `投递洞面板：底边 0.49 m（洞口 0.8 m）、贴北墙（z ${hb.min.z.toFixed(3)}）`)
  const IM = await import('../src/game/renderer/spokesItemModels')
  for (const t of IM.SPOKES_ITEM_TYPES) {
    const m = IM.buildSpokesItemMesh(t); m.updateMatrixWorld(true)
    let tris = 0, tex = 0; m.traverse((o: any) => { if (o.isMesh) { tris += (o.geometry.index ? o.geometry.index.count : o.geometry.getAttribute('position').count) / 3; if (o.material.map) tex++ } })
    const sz = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3())
    ok(tris > 0 && tris <= 2000 && tex > 0 && Math.max(sz.x, sz.y, sz.z) < 0.6, `物品模型 ${t}：${tris} 面、${tex} 张贴图、${sz.toArray().map((v: number) => v.toFixed(2))}`)
  }
}

console.log(`\n${n - fails}/${n} 通过`)
if (fails) process.exit(1)
