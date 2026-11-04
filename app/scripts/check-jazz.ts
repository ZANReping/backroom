/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// [jazz] 爵士脑（Entity 197）阶段 3 无头验收（真实 Engine + 真实无限 L5 地图：种子 800 出生点西边那座厨师餐厅里搭了舞台）。运行：npm run check:jazz
// 覆盖：定义 / 物品 / 员工名录 / 数值表 / 片段时长（= jazzAnim JAZZ_CLIPS）· 舞台摆放（台面 0.45 / 台口 1.2 / 钢琴原点 0.695 / 琴凳 / 吧台近边 0.34 / 监控 / 海报，
//       对齐 jazzAnim 摆放常量；餐桌让出东北角；层高）· 排期（每轮营业两场：上台→调音→演奏（独奏）→终曲→谢幕；打烊不演；露馅罚停）
//       · 四个乐手（生成 / 上下台走台阶 / 地台高度 / 每阶段片段 / 场间吧台 + 钢琴 / 吵架劝和站位 = JAZZ_ARGUE）
//       · 听演出（理智回升 / 整场奖励 / 移动变慢 / 时间加快 / 中途离场）· 假吸魂（站定低头 = 成功 → 好感 / 私下对话；乱动 = 露馅：关注度 / 罚停 / 老板起疑；老板坐后排更难）
//       · 搭话（普通 / 私下线索「墙上印着树的洞」/ E185 一句）· 点歌（菜单 / 下一首 / 增益）· 辣椒酱（低音提琴送 / 使用 / 压住厨师上瘾 / 冷库）
//       · 告发（监控下按住 → 奖励 / 乐队被叫走 / 回来后真吸魂）· 厨师联动（演出时段上菜更快）· 迎宾女郎预告 · 音乐声部空间化 · 打不死 · 存档往返 · HUD · 渲染
import { createCanvas } from '@napi-rs/canvas'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const H = await import('../src/game/engine/l5Hotel')
const J = await import('../src/game/engine/jazzAI')
const C = await import('../src/game/engine/chefAI')
const S = await import('../src/game/engine/spokesAI')
const A = await import('../src/game/engine/beastAI')
const LK = await import('../src/game/engine/jazzLink')
const { specialAction } = await import('../src/game/engine/special')
const { ENTITIES, entitySpawnLevels } = await import('../src/game/entities')
const { snapshot } = await import('../src/game/engine/save')
const { audio } = await import('../src/game/core/audio')
const { L5_STAFF } = await import('../src/game/content/l5Staff')
const { ITEMS } = await import('../src/game/content/items')
const { killCheck } = await import('../src/game/engine/combat')
const LJ = await import('../src/game/content/jazzLayout')
const LC = await import('../src/game/content/chefLayout')
const AN = await import('../src/game/renderer/jazzAnim')
const { look } = await import('../src/game/renderer/shared')
const { WALL_H } = await import('../src/game/world/mapgen').catch(() => ({ WALL_H: null as any }))
const { buildJazz } = await import('../src/game/renderer/jazzMesh')
const { buildL5Architecture } = await import('../src/game/renderer/l5Architecture')
const { canOccupy, PLAYER_RADIUS } = await import('../src/game/core/player')
const { readFileSync } = await import('node:fs')
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (k !== 'constructor' && typeof (audio as any)[k] === 'function') (audio as any)[k] = () => {}
const audioCalls: any[] = []
;(audio as any).jazzBand = (v: any) => { audioCalls.push(v) }
const { JK } = J
const sitP = JK.beastSitP; JK.beastSitP = 0 // 老板随机来不来：只在专门那一项里放开（其余各项确定性）

let fails = 0, n = 0
const ok = (c: unknown, m: string, dbg?: unknown) => { n++; console.log(`${c ? '✔' : '✘'} ${m}${dbg !== undefined ? '  ' + JSON.stringify(dbg) : ''}`); if (!c) fails++ }
const SEED = 800
const msgs: string[] = []
const emits: string[] = []
const prep = (e: any) => {
  e.emit = (ev: any) => { emits.push(ev?.kind) }; e.persist = () => {}
  const m0 = e.msg.bind(e); e.msg = (t: string, k?: any) => { msgs.push(t); return m0(t, k) }
  e.die = () => { e.over = true }
  Object.assign(e.player, { hp: 100, sanity: 50, hunger: 60, thirst: 80, stamina: 50 })
  e.player.hotbar.fill(null); e.player.backpack.fill(null); e.player.equip.pockets.fill(null)
}
const fresh = () => {
  const e: any = new Engine(); e.seed = SEED
  e.hotel = H.freshHotel()
  e.loadLevel(5, { mapSeed: SEED, firstVisit: true }); e.introT = 0
  e.map.entities = []
  prep(e)
  e.hotel = H.freshHotel(); e.hotel.floor = 1
  e.hotelShift = { ...e.hotelShift, phase: 'play', tLeft: 300 }
  return e
}
const ox = (e: any) => e.map.inf.ox, oy = (e: any) => e.map.inf.oy
const W = (e: any, p: { x: number; y: number }) => ({ x: p.x - ox(e), y: p.y - oy(e) })
const at = (e: any, x: number, y: number) => { e.player.x = x; e.player.y = y }
const lookAt = (e: any, x: number, y: number) => { e.player.facing = Math.atan2(y - e.player.y, x - e.player.x); look.yaw = -e.player.facing - Math.PI / 2 }
const stepAll = (e: any, dt = 0.05) => {
  e.time += dt
  J.stepJazzGlobal(e, dt); J.stepJazzWorld(e, dt); J.jazzPress(e)
  C.stepChefGlobal(e, dt)
  for (const x of [...e.map.entities]) { if (x.def.type === 'jazz') J.updateJazz(e, x, dt); else if (x.def.type === 'beast') A.updateBeast(e, x, dt) }
}
const run = (e: any, sec: number, dt = 0.05, each?: (t: number) => boolean | void) => { for (let t = 0; t < sec; t += dt) { if (each?.(t)) return true; stepAll(e, dt) } return false }
const has = (e: any, t: string) => [...e.player.hotbar, ...e.player.backpack].some((s: any) => s?.type === t)
const sv = (e: any) => J.jazzSave(e)
const js = (e: any) => J.jazzSite(e)!
const band = (e: any) => J.findJazz(e)
const who = (e: any, w: string) => J.findJazz(e, w as any)[0]
/** 把时钟拨到这一轮营业第 k 场开演后 t 秒（真实排期，不用 QA 钉子） */
const showAt = (e: any, k: number, t: number) => { const ps = H.hotelPlayStart(e.map.inf.seed, e.time); e.time = ps.t0 + JK.firstAt + k * (JK.showLen + JK.breakLen) + t }
const breakAt = (e: any) => { const ps = H.hotelPlayStart(e.map.inf.seed, e.time); e.time = ps.t0 + 20 }
const audSpot = (e: any) => W(e, js(e).audC)
const inAud = (e: any) => { const p = audSpot(e); at(e, p.x, p.y); lookAt(e, p.x + 5, p.y) }

// ---------------------------------------------------------------------------
console.log('— 定义 / 物品 / 员工名录 / 数值表 / 片段 —')
{
  const d: any = ENTITIES.jazz
  ok(d && d.name === '爵士脑' && d.damage === 0 && d.naturalSpawn === false && d.codex.no.includes('Entity 197'), '实体定义 jazz = Entity 197：不进生成池、不攻击')
  ok(entitySpawnLevels('jazz').some((s: any) => s.id === 5), '图鉴层级归属：L5')
  ok(/四十七年/.test(d.codex.behavior) && /监控/.test(d.codex.behavior) && /辣椒酱/.test(d.codex.behavior) && /谱号/.test(d.codex.behavior) && /钢琴/.test(d.codex.behavior), '图鉴：维基人设（四十七年 / 监控 / 辣椒酱 / 谱号 / 钢琴）')
  ok(d.codex.lore.some((l: string) => l.includes('Entity 185')) && d.codex.lore.filter((l: string) => l.includes('185')).length === 1, 'E185 喜剧演员只留一句台词')
  ok(!JSON.stringify(d.codex).includes('63') && !JSON.stringify(J.PRIVATE).includes('Level 63'), '出口不做：没有 L63')
  ok(!!(ITEMS as any).habanero?.glyph && (ITEMS as any).habanero.use === 'none', `物品定义 habanero（${(ITEMS as any).habanero?.name}）`)
  const st = L5_STAFF.find((s) => s.id === 'jazz')!
  ok(st && st.habits.length >= 6 && st.habits.some((h) => h.includes('低头')) && st.habits.some((h) => h.includes('辣椒酱')) && st.habits.some((h) => h.includes('点名')), '员工名录：习性写明装死 / 辣椒酱 / 点歌')
  ok(Object.entries(J.JAZZ_CLIP_LEN).every(([k, v]) => (AN.JAZZ_CLIPS as any)[k]?.dur === v) && Object.keys(AN.JAZZ_CLIPS).length === Object.keys(J.JAZZ_CLIP_LEN).length, 'AI 片段时长表 = jazzAnim JAZZ_CLIPS（19 段）')
  ok(JK.walkSpeed === AN.JAZZ_CLIPS.walk.speed, 'AI 走路速度 = walk 片段 0.8 m/s')
  ok(JK.firstAt >= C.CK.closeExtra, `第一场排在厨师恢复营业之后（${JK.firstAt} ≥ ${C.CK.closeExtra} s）`)
  ok(JK.firstAt + JK.shows * JK.showLen + (JK.shows - 1) * JK.breakLen <= 480, '最短一轮营业（480 s）也排得下两场')
  ok(J.JAZZ_SONGS.length === 5 && new Set(J.JAZZ_SONGS.map((s) => s.key)).size === 5, '点歌：5 首原创曲，各一种增益')
  ok(JK.suckT >= 8 && JK.timeWarp > 1 && JK.stayMove < 1, '数值表：终曲 ≥ 8 s / 时间加快 / 移动变慢')
}

console.log('— 舞台摆放（对齐 jazzAnim 摆放常量）—')
const e0 = fresh()
{
  const site = js(e0), cs = C.chefSite(e0)!, m = e0.map
  ok(!!site && !!cs, `种子 ${SEED}：窗口里的厨师餐厅搭了舞台（大厅格 ${cs?.hk},${cs?.hr}）`)
  const P = (p: string) => m.structures.filter((q: any) => q.kind === 'jazzprop' && q.data?.prop === p && q.data?.jazz === site.key)
  for (const p of ['stage', 'steps', 'piano', 'rug', 'bar', 'stool', 'cctv', 'poster']) ok(P(p).length > 0, `结构 jazzprop ${p}`)
  const st = P('stage')[0]
  ok(st.solid && st.w === 4 && st.h === 7 && st.x + ox(e0) === site.stage.x0, '舞台：4 × 7 格，实心（观众上不去）')
  ok(LJ.JAZZ_STAGE_H === AN.JAZZ_STAGE.h, `台面 ${LJ.JAZZ_STAGE_H} m = JAZZ_STAGE.h`)
  ok(J.jazzStageH(e0, W(e0, site.play.leader).x, W(e0, site.play.leader).y) === 0.45 && J.jazzStageH(e0, W(e0, site.audC).x, W(e0, site.audC).y) === 0, '地台高度：台上 0.45、观众区 0')
  const foot = W(e0, site.stepFoot), top = W(e0, site.stepTop)
  ok(J.jazzStageH(e0, foot.x, foot.y) === 0 && Math.abs(J.jazzStageH(e0, top.x, top.y) - 0.45) < 1e-6 && Math.abs(J.jazzStageH(e0, top.x, site.stage.y0 - 0.45 - oy(e0)) - 0.225) < 1e-6, '台阶：台下 0 → 台上 0.45 线性过渡')
  // 台口：头儿正前方 1.2 m（JAZZ_STAGE.edgeZ）；观众席从 2.5 m 起（魂雾源）都在观众区
  const L = site.play.leader
  ok(Math.abs((L.x - site.stage.x0) - AN.JAZZ_STAGE.edgeZ) < 1e-6 && L.f === Math.PI, `台口：头儿面朝西，台口在他前方 ${(L.x - site.stage.x0).toFixed(2)} m（= edgeZ）`)
  ok(LJ.inTR(site.aud, L.x - AN.JAZZ_STAGE.audienceZ - 0.1, L.y) && LJ.inTR(site.aud, L.x - AN.JAZZ_STAGE.audienceZ - 1.2, L.y), '假吸魂魂雾的源头（2.5–3.7 m）落在观众区里')
  for (const w of J.JAZZ_WHO_LIST) ok(LJ.inTR(site.stage, site.play[w].x, site.play[w].y), `${J.JAZZ_NAME[w]}的演出站位在台上`)
  // 钢琴：鼓手坐琴凳面朝东，钢琴原点在他前方 0.695 m、琴背离东墙 > 0
  const b = site.bench
  ok(Math.abs(site.piano.ox - b.x - AN.JAZZ_PIANO.origin[2]) < 1e-6 && site.piano.oy === b.y && b.f === 0, `钢琴原点 = 琴凳站位前方 ${AN.JAZZ_PIANO.origin[2]} m（JAZZ_PIANO.origin）`)
  ok(site.piano.ox + 0.3 < site.stage.x1 + 1 && LJ.inTR(site.stage, b.x, b.y), '钢琴背板不进东墙；琴凳在台上')
  // 吧台：台面 1.05、近边 = 南沿，站位在近边外 0.34 m 面朝北
  const bar = P('bar')[0]
  ok(bar.solid && bar.y + oy(e0) === site.bar.y0, '吧台：实心一排')
  for (const w of ['leader', 'sax', 'bass'] as const) { const s = site.barAt[w]; ok(Math.abs(s.y - (site.bar.y0 + 1) - AN.JAZZ_BAR.z) < 1e-6 && s.f === -Math.PI / 2 && s.x >= site.bar.x0 && s.x <= site.bar.x1 + 1, `${J.JAZZ_NAME[w]}的吧台站位：近边外 ${AN.JAZZ_BAR.z} m、面朝北`) }
  ok(site.barAt.drum === site.bench, '鼓手场间去钢琴凳')
  // 监控：高 2.95、在墙角、对着观众区
  ok(site.cctv.z > 2.5 && site.cctv.z < 3.3, `监控探头高 ${site.cctv.z} m（墙角）`)
  // 餐桌让出东北角
  ok(cs.tables.every((t) => !LC.inJazzBlock(cs.hall.x1, cs.sy, t.x, t.y)) && cs.tables.length >= 6, `餐桌让出舞台 / 观众区 / 吧台（剩 ${cs.tables.length} 张）`)
  ok(!m.structures.some((q: any) => q.kind === 'chefprop' && q.data?.prop === 'table' && LJ.inTR(site.aud, q.x + ox(e0) + 0.5, q.y + oy(e0) + 0.5)), '观众区里没有餐桌')
  // 东墙门洞不被舞台挡住；层高
  ok(site.stage.y1 < cs.hall.y1 - 3, '舞台不挡东墙门洞（y1 − 3）')
  const ceil = (WALL_H?.hotel ?? 3.3) * 1.75
  ok(2.44 + 0.45 + 0.3 < ceil, `层高：最高的低音提琴头 2.44 + 台面 0.45 < 餐厅 ${ceil.toFixed(2)} m`)
  // 乐手要走到的点都不在实心格里（台上的点除外）
  const solidAt = (x: number, y: number) => m.structures.some((q: any) => q.solid && Math.floor(x) >= q.x && Math.floor(x) < q.x + (q.w || 1) && Math.floor(y) >= q.y && Math.floor(y) < q.y + (q.h || 1))
  ok(['leader', 'sax', 'bass'].every((w) => { const p = W(e0, (site.barAt as any)[w]); return !solidAt(p.x, p.y) }) && !solidAt(foot.x, foot.y), '吧台站位 / 台阶脚下不是实心格')
  const aud = W(e0, site.audC)
  ok(!solidAt(aud.x, aud.y) && m.tiles[Math.floor(aud.y) * m.w + Math.floor(aud.x)] === 1, '观众区可以站人')
  const ar = J.argueSpot(e0, site, 'sax'), al = J.argueSpot(e0, site, 'leader'), ab = J.argueSpot(e0, site, 'bass')
  const rS = LJ.jazzToRoot({ x: al.x, y: al.y, facing: al.f }, ar.x, ar.y), rB = LJ.jazzToRoot({ x: al.x, y: al.y, facing: al.f }, ab.x, ab.y)
  ok(Math.abs(rS[0] - 0.4) < 1e-6 && Math.abs(rS[1] - 0.55) < 1e-6 && Math.abs(rB[0] + 0.42) < 1e-6 && Math.abs(rB[1] - 0.55) < 1e-6, '吵架劝和站位 = JAZZ_ARGUE（萨克斯 [0.40, 0.55]、低音提琴 [−0.42, 0.55]）')
  const dS = Math.atan2(Math.sin(ar.f - al.f - Math.PI / 2), Math.cos(ar.f - al.f - Math.PI / 2)), dB = Math.atan2(Math.sin(ab.f - al.f + Math.PI / 2), Math.cos(ab.f - al.f + Math.PI / 2))
  ok(Math.abs(dS) < 1e-6 && Math.abs(dB) < 1e-6, '吵架：萨克斯朝 root −X、低音提琴朝 +X（面对面）')
}

console.log('— 排期 —')
{
  const e = fresh()
  const ps = H.hotelPlayStart(e.map.inf.seed, e.time)
  ok(ps.len >= 480 && ps.len <= 720, `一轮营业 ${ps.len.toFixed(0)} s`)
  showAt(e, 0, 1); ok(J.jazzSlot(e).k === 0 && J.jazzSlot(e).phase === 'walkOn', '开门后 firstAt 秒：第一场上台')
  showAt(e, 0, JK.walkOnT + 1); ok(J.jazzSlot(e).phase === 'tune', '调音')
  showAt(e, 0, 40); ok(J.jazzSlot(e).phase === 'set', '演奏')
  showAt(e, 0, JK.showLen - JK.bowT - 2); ok(J.jazzSlot(e).phase === 'finale', '终曲（假吸魂）')
  showAt(e, 0, JK.showLen - 1); ok(J.jazzSlot(e).phase === 'bow', '谢幕')
  showAt(e, 0, JK.showLen + 5); ok(J.jazzSlot(e).k === -1, '场间')
  showAt(e, 1, 30); ok(J.jazzSlot(e).k === 1 && J.jazzSlot(e).phase === 'set', '第二场')
  showAt(e, 1, 30); e.hotelShift = { ...e.hotelShift, phase: 'shift' }; ok(J.jazzSlot(e).k === -1, '打烊（换班）不演'); e.hotelShift = { ...e.hotelShift, phase: 'play' }
  breakAt(e); const sl = J.jazzSlot(e); ok(sl.k === -1 && sl.nextAt > e.time && J.jazzNextShowText(e).includes('分钟后开演'), `预告：「${J.jazzNextShowText(e)}」`)
  const old = S.nextPitch; let hit = 0; for (let i = 0; i < 200; i++) if (S.nextPitch(e).includes('爵士脑')) hit++
  ok(hit > 10, `迎宾女郎的推销会预告演出（200 条里 ${hit} 条）`); void old
}

console.log('— 乐手：生成 / 上下台 / 片段 —')
const e1 = fresh()
{
  const e = e1, site = js(e)
  breakAt(e); inAud(e); stepAll(e)
  ok(band(e).length === 4 && new Set(band(e).map((x: any) => x.jz.who)).size === 4, '走近餐厅：四个乐手出现（头儿 / 萨克斯 / 低音提琴 / 鼓手）')
  run(e, 3)
  const L = who(e, 'leader'), D = who(e, 'drum')
  const lb = W(e, site.barAt.leader)
  ok(Math.hypot(L.x - lb.x, L.y - lb.y) < 0.35 && L.jz.h === 0, '场间：头儿在吧台')
  ok(D.jz.clip === 'pianoPlay' && Math.abs(D.jz.h - 0.45) < 1e-6, '场间：鼓手在台上弹钢琴（地台 0.45）')
  // 开演：走台阶上台
  showAt(e, 0, 0.5)
  let maxH = 0, sawRamp = false
  run(e, JK.walkOnT - 0.3, 0.05, () => { const h = who(e, 'leader').jz.h; maxH = Math.max(maxH, h); if (h > 0.05 && h < 0.4) sawRamp = true })
  const Lp = W(e, site.play.leader)
  ok(Math.hypot(who(e, 'leader').x - Lp.x, who(e, 'leader').y - Lp.y) < 0.35 && Math.abs(who(e, 'leader').jz.h - 0.45) < 1e-6, '上台：头儿走到台口正中、站在台上')
  ok(sawRamp, '上台走的是台阶（高度经过 0 → 0.45 的过渡）')
  const ok2 = (w: string, c: string) => who(e, w).jz.clip === c
  run(e, 1.5); ok(band(e).every((x: any) => x.jz.clip === 'tuneUp'), '调音：四人 tuneUp')
  showAt(e, 0, JK.walkOnT + JK.tuneT + 1); run(e, 0.5)
  ok(ok2('leader', 'trumpetPlay') && ok2('sax', 'saxPlay') && ok2('bass', 'bassPlay') && ok2('drum', 'drumPlay'), '演奏：小号 / 萨克斯 / 低音提琴 / 鼓各自的片段')
  const r = J.jazzDebug(e); r.pieceT = r.pieceLen + 1; run(e, 0.2)
  const soloWho = r.soloWho
  ok(r.piece === JK.soloPiece && (soloWho === 'leader' || soloWho === 'sax') && ok2(soloWho!, soloWho === 'leader' ? 'trumpetSolo' : 'saxSolo'), `第 ${JK.soloPiece + 1} 首是独奏：${soloWho && J.JAZZ_NAME[soloWho]}`)
  showAt(e, 0, JK.showLen - JK.bowT - JK.suckT + 0.5); run(e, 0.3)
  ok(band(e).every((x: any) => x.jz.clip === 'fakeSoulSuck'), '终曲：四人 fakeSoulSuck')
  run(e, 4.2); ok(band(e).every((x: any) => x.jz.clip === 'fakeSoulSuck' && x.jz.modeT < 1), '终曲里假吸魂片段重播（4 s 一遍）')
  showAt(e, 0, JK.showLen - 1.5); run(e, 0.3)
  ok(band(e).every((x: any) => x.jz.clip === 'bow'), '谢幕：四人鞠躬')
  const ap = JK.argueP; JK.argueP = 0
  showAt(e, 0, JK.showLen + 1); J.jazzDebug(e).argue = null
  run(e, 25); JK.argueP = ap
  const lb2 = W(e, site.barAt.leader), L2 = who(e, 'leader')
  ok(Math.hypot(L2.x - lb2.x, L2.y - lb2.y) < 0.35 && L2.jz.h === 0, '演完：头儿走台阶回吧台')
  ok(['drinkBeer', 'idleSway', 'talkGesture', 'glanceCamera', 'holdHead', 'leanFamiliar'].includes(who(e, 'bass').jz.clip) && who(e, 'drum').jz.clip === 'pianoPlay', `场间：低音提琴 ${who(e, 'bass').jz.clip}、鼓手 pianoPlay`)
  // 吵架劝和
  J.jazzStartArgue(e); run(e, 12)
  ok(['leader', 'sax', 'bass'].every((w) => who(e, w).jz.clip === 'argueReconcile' || J.jazzDebug(e).argue === null), '场间偶尔：三人走到一起吵架、被头儿按肩劝和（argueReconcile）')
}

console.log('— 听演出 —')
{
  const e = fresh(), p = e.player
  breakAt(e); inAud(e); stepAll(e)
  showAt(e, 0, JK.walkOnT + JK.tuneT + 1); stepAll(e)
  p.sanity = 40
  const t0 = e.time
  run(e, 10, 0.05, () => { look.pitch = 0 })
  ok(p.sanity > 40 + JK.listenSan * 10 * 0.9, `在观众区：理智回升（40 → ${p.sanity.toFixed(1)}）`)
  ok(J.jazzMoveMul(e) === JK.stayMove, `不想走：移动 ×${J.jazzMoveMul(e)}`)
  ok(e.time - t0 > 10 * JK.timeWarp * 0.95, `时间过得快：10 s 里时钟走了 ${(e.time - t0).toFixed(1)} s`)
  const san = p.sanity, aw = W(e, { x: js(e).aud.x0 - 2, y: js(e).audC.y })
  at(e, aw.x, aw.y); stepAll(e)
  ok(p.sanity < san - JK.leaveSan + 0.5 && J.jazzMoveMul(e) === 1, `听了 ≥ ${JK.leaveAfter} s 中途离场：−${JK.leaveSan} 理智、脚步恢复`)
  // 整场：从上台听到谢幕
  const e2 = fresh(), p2 = e2.player
  breakAt(e2); inAud(e2); stepAll(e2); showAt(e2, 0, 0.2); stepAll(e2)
  p2.sanity = 20; look.pitch = -0.6
  run(e2, 90, 0.1)
  const before = p2.sanity
  let bonus = false
  run(e2, 60, 0.1, () => { if (J.jazzSave(e2).n.full > 0) bonus = true })
  ok(bonus && J.jazzSave(e2).n.full === 1, `整场听完：谢幕时 +${JK.fullBonus} 理智（${before.toFixed(0)} → ${p2.sanity.toFixed(0)}）`)
  look.pitch = 0
}

console.log('— 假吸魂 —')
const finale = (e: any) => { breakAt(e); inAud(e); stepAll(e); showAt(e, 0, 1); run(e, 20); showAt(e, 0, JK.walkOnT + JK.tuneT + 5); run(e, 1); showAt(e, 0, JK.showLen - JK.bowT - JK.suckT - 0.5); run(e, 0.6) }
{
  // 配合：站定 + 低头
  const e = fresh()
  finale(e)
  ok(J.jazzDebug(e).phase === 'finale' && J.jazzHud(e)?.fake, '终曲开始：HUD 出装死提示（监控在看）')
  look.pitch = -0.6
  run(e, JK.suckT + 0.5, 0.05)
  ok(sv(e).fakeOk === 1 && sv(e).favor === JK.favorGain && sv(e).priv === 1 && sv(e).busted === 0, `站定低头陪完终曲：成功（好感 +${JK.favorGain}，解锁私下对话）`)
  ok(msgs.some((m) => m.includes('私下')), '提示去吧台找他们')
  // 乱动：露馅
  const e2 = fresh()
  finale(e2)
  look.pitch = 0
  const attn0 = e2.hotel.attn
  let k = 0
  run(e2, JK.suckT, 0.05, () => { k++; e2.player.x += (k % 2 ? 0.06 : -0.06); return sv(e2).busted === 1 })
  stepAll(e2)
  ok(band(e2).every((x: any) => x.jz.clip === 'glanceCamera'), '露馅：台上四人一齐看监控', band(e2).map((x: any) => [x.jz.clip, x.jz.mode, +x.jz.modeT.toFixed(2)]))
  ok(sv(e2).busted === 1 && e2.hotel.attn >= attn0 + JK.bustAttn - 1 && sv(e2).fakeOk === 0, `抬着头乱动：露馅（关注度 +${JK.bustAttn}）`)
  ok(A.beastTipped(e2) && sv(e2).sulkT > 0, '露馅：老板起疑（下一次余光无视门槛）、乐队罚停')
  showAt(e2, 1, 30); stepAll(e2); ok(J.jazzSlot(e2).k === -1, '罚停期间下一场取消')
  // 只抬头不动：也会露馅，但慢一些
  const e3 = fresh(); finale(e3); look.pitch = 0
  run(e3, 3); const s6 = J.jazzDebug(e3).sus
  ok(s6 > 0 && s6 < JK.susBust, `站着不动但没低头：露馅值慢慢涨（3 s ${s6.toFixed(0)}）`)
  // 老板坐后排：更难装
  const e4 = fresh(); finale(e4); look.pitch = 0
  A.beastSpawnAudience(e4, W(e4, js(e4).audC).x - 2, W(e4, js(e4).audC).y, 0)
  run(e4, 3); const s6b = J.jazzDebug(e4).sus
  ok(A.beastInAudience(e4) && s6b > s6 * (JK.beastK - 0.1), `老板坐在后排：露馅值涨得快 ×${JK.beastK}（3 s ${s6b.toFixed(0)}）`)
  ok(J.jazzHud(e4)!.fake!.beast, 'HUD：后排坐着老板')
  // 不在观众区：什么都不发生
  const e5 = fresh(); finale(e5); const aw = W(e5, { x: js(e5).aud.x0 - 3, y: js(e5).audC.y }); at(e5, aw.x, aw.y)
  run(e5, JK.suckT + 1); ok(sv(e5).fakeOk === 0 && sv(e5).busted === 0, '不在观众区：终曲与你无关')
  // 老板来去
  JK.beastSitP = sitP
  const e6 = fresh(); breakAt(e6); inAud(e6); stepAll(e6)
  let came = false
  for (let i = 0; i < 40 && !came; i++) { showAt(e6, i % 2, 0.2); J.jazzDebug(e6).showKey = ''; stepAll(e6); if (A.beastInAudience(e6)) came = true; else { showAt(e6, 0, JK.showLen + 10); stepAll(e6) } }
  ok(came, `老板有 ${JK.beastSitP * 100}% 概率坐在后排`); JK.beastSitP = 0
  showAt(e6, 0, JK.showLen + 3); run(e6, 3)
  ok(!A.beastInAudience(e6), '演完老板隐入暗处')
  look.pitch = 0
}

console.log('— 搭话 / 点歌 / 辣椒酱 —')
{
  const e = fresh(), site = js(e)
  breakAt(e); inAud(e); stepAll(e); run(e, 2)
  const B = who(e, 'bass'), bp = W(e, site.barAt.bass)
  at(e, bp.x, bp.y + 1.2); lookAt(e, B.x, B.y)
  const a = specialAction(e)
  ok(a?.id === 'jazz-talk' && a.label.includes('低音提琴'), `吧台 X：「${a?.label}」`)
  e.specialPressed = true; stepAll(e)
  ok(has(e, 'habanero') && sv(e).n.sauce === 1, '低音提琴送你一瓶哈瓦那辣椒酱')
  ok(J.jazzDebug(e).subs.some((s: any) => s.who === '低音提琴'), '字幕：低音提琴说话')
  const subsBefore = J.jazzDebug(e).subs.length; void subsBefore
  run(e, 1.5); e.specialPressed = true; stepAll(e)
  ok([...e.player.hotbar, ...e.player.backpack].filter((s: any) => s?.type === 'habanero').length === 1, `辣椒酱有冷却（${JK.sauceCd} s）`)
  // 萨克斯：点歌菜单
  const X = who(e, 'sax'), xp = W(e, site.barAt.sax)
  at(e, xp.x, xp.y + 1.2); run(e, 1.5); e.specialPressed = true; stepAll(e)
  ok(J.jazzHud(e)?.menu?.songs.length === 5, '萨克斯：「你点名，我来吹。」——点歌菜单 5 首')
  ok(J.jazzRequest(e, 2) && J.jazzDebug(e).request === 2 && !J.jazzHud(e)?.menu, '点「哈瓦那辣椒」：菜单收起')
  showAt(e, 0, JK.walkOnT + JK.tuneT + 0.5); stepAll(e); stepAll(e)
  ok(J.jazzDebug(e).song === 2 && sv(e).buff === 2, '下一场第一首就是你点的歌；增益生效')
  const h0 = e.player.hunger; run(e, 4)
  ok(sv(e).buff === 2 && sv(e).buffT > 0, `增益：「${J.JAZZ_SONGS[2].name}」${J.JAZZ_SONGS[2].buff}（剩 ${sv(e).buffT.toFixed(0)} s）`); void h0
  // 演出中台口点歌
  const edge = W(e, { x: site.stage.x0 - 0.6, y: site.play.sax.y }); at(e, edge.x, edge.y)
  ok(specialAction(e)?.id === 'jazz-request', '演出中站在台口：X 向萨克斯点歌')
  J.jazzRequest(e, 0); const r = J.jazzDebug(e); stepAll(e); run(e, 3.5)
  ok(r.song === 0, '演出中点歌：这首收尾，下一首就是')
  void X
  // 用辣椒酱：耐力 / 理智 / 口渴；压住厨师上瘾
  const e2 = fresh(); e2.addItem('habanero')
  C.chefSave(e2).addictT = 400
  const p = e2.player; p.stamina = 20; p.thirst = 50
  ok(C.chefHungerMul(e2) > 1, '吃过厨师的菜：饿得更快')
  ok(J.jazzUseItem(e2, 'habanero') && !has(e2, 'habanero'), '使用辣椒酱')
  ok(p.stamina === 20 + JK.sauceStam && p.thirst === 50 - JK.sauceThirst, `耐力 +${JK.sauceStam}、口渴 −${JK.sauceThirst}`)
  ok(C.chefSave(e2).addictT === 400 - JK.sauceCut && C.chefHungerMul(e2) === 1 && LK.jazzSauceWarm(e2), `压住「再来一份」：上瘾 −${JK.sauceCut} s、饥饿不再加快`)
  C.chefDebug(e2).thoughtT = 0; const subs0 = C.chefDebug(e2).subs.length; C.stepChefGlobal(e2, 0.1)
  ok(C.chefDebug(e2).subs.length === subs0, '暖身期间不冒「再来一份」的念头')
  ok(J.jazzHud(e2)!.sauce > 0.9, 'HUD：辣椒酱暖身小牌')
}

console.log('— 私下对话 / 线索 —')
{
  const e = fresh(), site = js(e)
  sv(e).priv = 1; sv(e).favor = 30
  breakAt(e); inAud(e); stepAll(e); run(e, 2)
  const lp = W(e, site.barAt.leader); at(e, lp.x, lp.y + 1.2); lookAt(e, lp.x, lp.y)
  e.specialPressed = true; stepAll(e)
  ok(sv(e).clue === 1 && msgs.some((m) => m.includes('墙上印着树的洞')), '私下对话：第一句是线索「墙上印着树的洞」')
  ok(who(e, 'leader').jz.clip === 'pointDirection', '说线索时 pointDirection（指方向）')
  ok(J.PRIVATE.leader.some((l) => l.includes('讲笑话')) || J.TALK.leader.some((l) => l.includes('讲笑话')), 'E185：头儿一句「楼上那个讲笑话的」')
  ok(Object.values(J.TALK).flat().some((l) => l.includes('减点肥')) && Object.values(J.TALK).flat().some((l) => l.includes('谱号')) && Object.values(J.TALK).flat().some((l) => l.includes('老四')) && Object.values(J.PRIVATE).flat().some((l) => l.includes('监控')), '人设台词：减肥 / 谱号 / 欠老四 / 讨厌监控')
  // 萨克斯「你看着面熟」
  const e2 = fresh(); breakAt(e2); inAud(e2); stepAll(e2); run(e2, 2)
  const xs = who(e2, 'sax'); at(e2, xs.x, xs.y + 1.6); stepAll(e2); stepAll(e2)
  ok(xs.jz.clip === 'leanFamiliar', '走近萨克斯：他凑过来「你看着面熟」（leanFamiliar）')
}

console.log('— 告发 —')
{
  const e = fresh(), site = js(e), p = e.player
  breakAt(e); inAud(e); stepAll(e); run(e, 1)
  const c = W(e, { x: site.cctv.x - 0.6, y: site.cctv.y + 1.6 }); at(e, c.x, c.y)
  ok(specialAction(e)?.id !== 'jazz-report', '没看过终曲：不知道把戏，不能告发')
  sv(e).sawFinale = 1
  ok(specialAction(e)?.id === 'jazz-report' && specialAction(e)?.hold, '看过终曲：监控下按住 X「对着监控揭穿乐队」')
  e.hotel.attn = 60; A.beastSave(e).strikes = 2; p.sanity = 40
  e.specialHeld = true; run(e, JK.reportHold + 0.2); e.specialHeld = false
  ok(sv(e).reported === 1 && sv(e).n.report === 1, '告发成功')
  ok(e.hotel.attn <= 60 - JK.reportAttnCut + 1 && A.beastSave(e).strikes === 1 && p.sanity >= 40 + JK.reportSan - 0.5, `奖励：关注度 −${JK.reportAttnCut}、冒犯 −${JK.reportStrike}、理智 +${JK.reportSan}`)
  run(e, 0.5); ok(band(e).length === 4 && band(e).every((x: any) => x.jz.clip === 'packUp' && x.jz.leave?.phase === 'pack') && !specialAction(e)?.id?.startsWith('jazz'), '[修] 告发后：四人没有直接消失——一齐瞪你、摇头、收谱（packUp），这时不能再搭话 / 告发')
  run(e, JK.leaveTimeout, 0.05, () => band(e).length === 0); stepAll(e)
  ok(band(e).length === 0 && !J.jazzDebug(e).leave, '乐队收拾完、从后场门走了（四人不见了）')
  showAt(e, 0, 40); stepAll(e); ok(J.jazzSlot(e).k === -1, `离开期间没有演出（${JK.reportGone} s）`)
  sv(e).goneT = 0; breakAt(e); inAud(e); stepAll(e); stepAll(e)
  ok(band(e).length === 4, '回来了')
  const L = who(e, 'leader'); const lp = W(e, site.barAt.leader); run(e, 3); at(e, lp.x, lp.y + 1.2); e.specialPressed = true; stepAll(e)
  ok(J.jazzDebug(e).subs.some((s: any) => J.COLD.leader.includes(s.text)) && !J.jazzOpenMenu(e), '回来以后：冷冰冰，不点歌'); void L
  inAud(e); showAt(e, 0, JK.walkOnT + JK.tuneT + 2); stepAll(e); p.sanity = 60
  run(e, 10); ok(p.sanity < 60 - JK.realSan * 8, `回来以后吸魂是真的：听演出理智流失（60 → ${p.sanity.toFixed(1)}）`)
  look.pitch = -0.6; showAt(e, 0, JK.showLen - JK.bowT - JK.suckT + 0.2); stepAll(e); const s0 = p.sanity; run(e, JK.suckT + 0.5)
  ok(p.sanity < s0 - JK.realFinaleSan + 1, `终曲在场：−${JK.realFinaleSan} 理智（装也没用）`)
  look.pitch = 0
  // 后排老板身边告发
  const e2 = fresh(); breakAt(e2); inAud(e2); stepAll(e2); sv(e2).sawFinale = 1
  showAt(e2, 0, 30); stepAll(e2)
  const bz = A.beastSpawnAudience(e2, W(e2, js(e2).audC).x - 2, W(e2, js(e2).audC).y, 0)!
  at(e2, bz.x + 1, bz.y); ok(specialAction(e2)?.label === '告诉老板他们在装', '老板坐后排时：在他身边按住 X 告诉他')
}

console.log('— 联动 / 音乐 / 打不死 / 存档 / HUD —')
{
  const e = fresh(); breakAt(e); inAud(e); stepAll(e)
  ok(!LK.jazzLive(e), '场间：厨师照常上菜')
  showAt(e, 0, 1); run(e, 20)
  ok(LK.jazzLive(e), '演出时段：厨师餐厅营业、上菜更快（jazzLink.live）')
  // 音乐声部空间化
  audioCalls.length = 0; stepAll(e)
  const v = audioCalls[audioCalls.length - 1]
  ok(v && v.mode === 'set' && v.parts.leader.g > 0 && v.parts.drum.g > 0 && v.parts.piano.g > 0, '演出：五个声部都有声（小号 / 萨克斯 / 低音 / 鼓 / 钢琴）')
  const gNear = v.parts.leader.g
  const far = W(e, { x: js(e).aud.x0 - 8, y: js(e).audC.y }); at(e, far.x, far.y); lookAt(e, far.x + 5, far.y); stepAll(e)
  const v2 = audioCalls[audioCalls.length - 1]
  ok(v2.parts.leader.g < gNear * 0.6, `离舞台越远越小（${gNear.toFixed(2)} → ${v2.parts.leader.g.toFixed(2)}）`)
  const sp = W(e, js(e).audC); at(e, sp.x, sp.y); lookAt(e, sp.x, sp.y - 5); stepAll(e) // 面朝北：舞台在右手边
  const v3 = audioCalls[audioCalls.length - 1]
  ok(v3.parts.leader.pan > 0.3, `方位：面朝北时舞台在右边（pan ${v3.parts.leader.pan.toFixed(2)}）`)
  ok(v3.parts.sax.pan !== v3.parts.bass.pan, '每个乐手各自的方位')
  ok(v3.duck > 0.3, `离乐队近：唱机让位（duck ${v3.duck.toFixed(2)}）`)
  showAt(e, 0, JK.showLen + 20); run(e, 25); stepAll(e)
  const v4 = audioCalls[audioCalls.length - 1]
  ok(v4.mode === 'break' && v4.parts.leader.g === 0 && v4.parts.piano.g > 0, '场间：只有钢琴（鼓手在弹）')
  // 合成数据
  const AU = await import('../src/game/core/audio')
  ok(AU.JAZZ_SONGS_SYN.length === 5 && AU.JAZZ_SONGS_SYN.every((s: any) => s.chords.length >= 4 && s.head.length >= 16 && s.bpm > 50), '5 首原创曲的合成数据（和弦 / 主题 / 速度）')
  // 打不死
  const Lz = who(e, 'leader'); Lz.hp = -5; Lz.dead = true; const f0 = sv(e).favor
  killCheck(e, Lz)
  ok(!Lz.dead && Lz.hp === Lz.def.hp && sv(e).favor === f0 - JK.hitFavor, `打不死：挨打只让他们失望（好感 −${JK.hitFavor}）`)
  // 存档往返
  sv(e).favor = 33; sv(e).priv = 1; sv(e).sauceT = 99; sv(e).buff = 3; sv(e).buffT = 20; sv(e).n.fake = 2
  const snap = JSON.parse(JSON.stringify(snapshot(e)))
  const h2 = H.restoreHotel(snap.hotel ?? e.hotel)
  ok(h2.jazz && h2.jazz.favor === 33 && h2.jazz.priv === 1 && h2.jazz.sauceT === 99 && h2.jazz.buff === 3 && h2.jazz.n.fake === 2, '存档往返：hotel.jazz')
  const bad = J.restoreJazzSave({ favor: 900, buff: 77, sauceT: -3, reported: 'x', n: { fake: -2 } })
  ok(bad.favor === 100 && bad.buff === -1 && bad.sauceT === 0 && bad.reported === 1 && bad.n.fake === 0, '坏存档钳到合法范围')
  // HUD
  showAt(e, 0, 40); stepAll(e); inAud(e); stepAll(e)
  const hv = J.jazzHud(e)!
  ok(hv.show && hv.show.phase === 'set' && hv.show.listen && hv.show.song.length > 0, `HUD：演出进度（第 ${hv.show!.k + 1} 场 · 「${hv.show!.song}」· 在听）`)
  breakAt(e); stepAll(e); ok(!!J.jazzHud(e)?.next, `HUD：场间预告「${J.jazzHud(e)?.next}」`)
  ok(!!e.hotelBook.met.includes('jazz'), '登记簿：遇见过爵士脑')
}

console.log('— 渲染 —')
{
  const R = await import('../src/game/renderer/jazzRender')
  const IM = await import('../src/game/renderer/jazzItemModels')
  const { buildItemMesh } = await import('../src/game/renderer/itemsMesh')
  const { buildHeldItem } = await import('../src/game/renderer/viewmodel')
  const THREE = await import('three')
  const grp = R.buildJazzEntityMesh()
  const ent: any = { id: 3, x: 0, y: 0, z: 0, facing: 0, def: ENTITIES.jazz, jz: J.ensureJazz({} as any, 'bass') }
  ent.jz.clip = 'bassPlay'; ent.jz.seq = 1; ent.jz.h = 0.45
  R.animateJazzEntity(grp, ent, 1 / 30, 30)
  ok(!!grp.userData.lod2 && !grp.userData.lod1 && grp.userData.lod2.visible && grp.userData.rig2.who === 'bass', '实体网格：首帧按 e.jz.who 建 LOD2（低音提琴）')
  ok(Math.abs(grp.userData.lod2.position.y - 0.45) < 1e-6, '模型抬到台面 0.45')
  R.animateJazzEntity(grp, ent, 1 / 30, 15)
  ok(!!grp.userData.lod1 && grp.userData.lod1.visible, '< 22 m 建 LOD1；15 m 用 LOD1')
  R.animateJazzEntity(grp, ent, 1 / 30, 4)
  ok(!!grp.userData.lod0 && grp.userData.lod0.visible, '< 11 m 建 LOD0；4 m 用 LOD0')
  ent.jz.clip = 'drinkBeer'; ent.jz.seq = 2; ent.jz.modeT = 2.5; ent.jz.h = 0
  for (let i = 0; i < 10; i++) R.animateJazzEntity(grp, ent, 1 / 30, 4)
  let mug: any = null; grp.userData.lod0.traverse((o: any) => { if (o.name === 'jazzMug') mug = o })
  ok(mug && mug.visible, 'drinkBeer：手里有啤酒杯（attachJazzMug）')
  ent.jz.clip = 'fakeSoulSuck'; ent.jz.seq = 3; ent.jz.modeT = 2.0
  for (let i = 0; i < 10; i++) R.animateJazzEntity(grp, ent, 1 / 30, 4)
  let mist: any = null; grp.userData.lod0.traverse((o: any) => { if (o.name === 'jazzMist') mist = o })
  ok(mist && mist.visible, 'fakeSoulSuck：观众席升起魂雾')
  for (let i = 0; i < 4; i++) { const a = R.buildJazzEntityMesh(i); let sk = 0; a.traverse((o: any) => { if (o.isSkinnedMesh) sk++ }); ok(a.userData.archive && sk > 0, `图鉴定格 ${R.JAZZ_ARCHIVE_POSES[i].label}`) }
  const bx = (o: any) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o) }
  const stg = R.buildJazzProp({ kind: 'jazzprop', x: 10, y: 4, w: 4, h: 7, solid: true, data: { prop: 'stage' } } as any)
  const sb = bx(stg); ok(sb.min.x >= 9.9 && sb.max.x <= 14.1 && sb.max.y > 3, `舞台模型：在格子里、背后有幕布（${sb.max.y.toFixed(2)} m）`)
  const pia = R.buildJazzProp({ kind: 'jazzprop', x: 20, y: 5, w: 1, h: 2, solid: false, data: { prop: 'piano', ox: 0.575, oy: 0.9 } } as any)
  let pianoObj: any = null, benchObj: any = null; pia.traverse((o: any) => { if (o.name === 'uprightPiano') pianoObj = o; if (o.name === 'jazzBench') benchObj = o })
  pia.updateMatrixWorld(true)
  const pw = new THREE.Vector3(); pianoObj.getWorldPosition(pw); const bw = new THREE.Vector3(); benchObj.getWorldPosition(bw)
  ok(Math.abs(pw.x - 20.575) < 1e-6 && Math.abs(pw.y - 0.45) < 1e-6 && Math.abs(pw.x - bw.x - (0.695 - AN.JAZZ_BENCH.z)) < 1e-6, `钢琴在台上（0.45），琴凳在钢琴原点西边 ${(pw.x - bw.x).toFixed(3)} m（= 0.695 − JAZZ_BENCH.z）`)
  const pb = bx(pianoObj); ok(pb.max.x < 21.0 && pb.min.x > 20.0, `钢琴背板不进东墙（${pb.min.x.toFixed(2)}–${pb.max.x.toFixed(2)}）`)
  const kb = new THREE.Vector3(); pianoObj.localToWorld(kb.set(0, AN.JAZZ_PIANO.keyY, AN.JAZZ_PIANO.keyZ))
  ok(Math.abs(kb.x - (20.575 - AN.JAZZ_PIANO.keyZ)) < 1e-6, '琴键朝西（朝着鼓手）')
  const barS = R.buildJazzProp({ kind: 'jazzprop', x: 30, y: 1, w: 5, h: 1, solid: true, data: { prop: 'bar' } } as any)
  const bb = bx(barS); ok(Math.abs(bb.max.z - 2.0) < 0.04 && bb.max.z <= 2.001, `吧台近边 = 格子南沿（${bb.max.z.toFixed(3)}）`)
  let top = -1; barS.traverse((o: any) => { if (o.isMesh && o.geometry?.parameters?.depth === 0.74) top = new THREE.Box3().setFromObject(o).max.y }); ok(Math.abs(top - AN.JAZZ_BAR.y) < 1e-6, `吧台台面 ${top.toFixed(2)} = JAZZ_BAR.y`)
  for (const p of ['steps', 'rug', 'stool', 'cctv', 'poster']) { const o = R.buildJazzProp({ kind: 'jazzprop', x: 2, y: 2, w: 2, h: 2, solid: false, data: { prop: p, ox: 0.5, oy: 0.5, z: 2.95, ax: -1, ay: 1 } } as any); let ms = 0; o.traverse((x: any) => { if (x.isMesh) ms++ }); ok(ms > 0, `场景件 ${p}`) }
  const cam = R.buildJazzProp({ kind: 'jazzprop', x: 2, y: 2, w: 1, h: 1, solid: false, data: { prop: 'cctv', ox: 0.82, oy: 0.18, z: 2.95, ax: -5, ay: 7 } } as any)
  const piv = cam.userData.pivot; const fwd = new THREE.Vector3(0, 0, 1).applyEuler(piv.rotation)
  ok(Math.abs(Math.atan2(fwd.z, fwd.x) - Math.atan2(7, -5)) < 1e-6, '监控探头对着观众区')
  ok(R.JAZZ_DYN_PROPS.has('cctv'), '监控探头是动态件（转头盯人 / 红灯）')
  const it = buildItemMesh('habanero', { halo: false } as any); let tris = 0; it.traverse((o: any) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.getAttribute('position').count) / 3 })
  ok(!it.userData.fallback && tris > 50 && tris < 3000 && IM.isJazzItemType('habanero'), `物品模型 habanero：${tris} 面`)
  const hd = buildHeldItem('habanero'); ok(new THREE.Box3().setFromObject(hd).getSize(new THREE.Vector3()).length() > 0.05, '手持模型：辣椒酱')
}


// =====================================================================
// [修 E197 阶段 3 已知问题] 魂雾 / 立柱 / 走位避让 / 注视 / 告发离场·真吸魂 / 点歌菜单
// =====================================================================
console.log('— [修] 魂雾：半透明软边拉丝 + 软粒子（不是实心球）—')
{
  const THREE = await import('three')
  const man = buildJazz('leader', { lod: 0 }); const rig = man.userData.jazz
  AN.resetJazzDynamics(rig)
  for (let t = 0; t <= 2.0; t += 1 / 30) AN.applyJazzPose(rig, AN.jazzPose('leader', 'fakeSoulSuck', t), { time: t, dt: 1 / 30 })
  const M = AN.jazzMistParts(rig), MI = AN.JAZZ_MIST
  let spheres = 0, meshes = 0; M.group.traverse((o: any) => { if (o.isMesh || o.isPoints) meshes++; if (o.geometry?.type === 'SphereGeometry') spheres++ })
  ok(M.group.visible && spheres === 0 && meshes === 2, `魂雾 = 丝带 1 次绘制 + 软粒子 1 次绘制，没有球体（${meshes} 件，球 ${spheres}）`)
  const rm: any = M.ribbon.material, pm: any = M.motes.material
  ok(rm.isShaderMaterial && pm.isShaderMaterial && rm.blending === THREE.AdditiveBlending && pm.blending === THREE.AdditiveBlending && rm.transparent && !rm.depthWrite && !pm.depthWrite, '加性混合、半透明、不写深度（软粒子）')
  ok(rm.uniforms.uOpacity.value <= 0.3 && pm.uniforms.uOpacity.value <= 0.3 && MI.opacity <= 0.3, `不透明度 ≤ 0.3（丝带 ${rm.uniforms.uOpacity.value} / 粒子 ${pm.uniforms.uOpacity.value.toFixed(2)}）`)
  ok(rm.uniforms.uSoft.value >= 1.5 && /pow\(e, uSoft\)/.test(rm.fragmentShader) && pm.uniforms.uSoft.value >= 2 && /gl_PointCoord/.test(pm.fragmentShader) && /pow\(1\.0 - r2, uSoft\)/.test(pm.fragmentShader), `软边：丝带横向 pow(1−|s|, ${MI.soft})、粒子径向 pow(1−r², ${MI.moteSoft})`)
  ok(/smoothstep\(uNear/.test(rm.fragmentShader) && /smoothstep\(uNear/.test(pm.fragmentShader) && MI.near >= 0.3 && MI.far > 10, `按视深淡出（近 ${MI.near} m 内透明、远 ${MI.far} m 淡出）`)
  ok(/cross\(/.test(rm.vertexShader) && !!M.ribbon.geometry.getAttribute('aSide'), '丝带在顶点着色器里按相机撑开（相机朝向的拉丝）')
  const g = M.ribbon.geometry, P = g.getAttribute('position'), Aa = g.getAttribute('aA'), Wd = g.getAttribute('aW'), segs = MI.segs
  let endMax = 0, midMax = 0, wMax = 0, lenMin = 1e9
  for (let k = 0; k < MI.strands; k++) {
    const v0 = k * (segs + 1) * 2, v1 = (k * (segs + 1) + segs) * 2
    endMax = Math.max(endMax, Aa.getX(v0), Aa.getX(v1)); for (let j = 1; j < segs; j++) midMax = Math.max(midMax, Aa.getX(v0 + j * 2))
    let L = 0; for (let j = 0; j < segs; j++) L += Math.hypot(P.getX(v0 + j * 2 + 2) - P.getX(v0 + j * 2), P.getY(v0 + j * 2 + 2) - P.getY(v0 + j * 2), P.getZ(v0 + j * 2 + 2) - P.getZ(v0 + j * 2)); lenMin = Math.min(lenMin, L)
    for (let j = 0; j <= segs; j++) wMax = Math.max(wMax, Wd.getX(v0 + j * 2))
  }
  ok(endMax < 1e-6 && midMax > 0.2 && midMax <= 1, `丝带两端透明、中段可见（端 ${endMax.toFixed(3)} / 中 ${midMax.toFixed(2)}）`)
  ok(lenMin / (2 * wMax) > 10, `拉丝：长 / 宽 > 10（最短丝带 ${lenMin.toFixed(2)} m、最宽 ${(2 * wMax).toFixed(3)} m）`)
  ok(g.getAttribute('position').count <= 300 && M.motes.geometry.getAttribute('position').count <= 24, `开销小：丝带 ${g.getAttribute('position').count} 顶点、粒子 ${M.motes.geometry.getAttribute('position').count} 个（每人两次绘制）`)
  const head = new THREE.Vector3(); rig.head.getWorldPosition(head); const mouthZ = head.z
  let fakeReach = 0; for (let k = 0; k < MI.strands; k++) { const v1 = (k * (segs + 1) + segs) * 2; fakeReach = Math.max(fakeReach, P.getZ(v1)) }
  ok(fakeReach > mouthZ + 0.1, `假吸魂：雾流到乐器口前就散了（丝带最远到 z ${fakeReach.toFixed(2)}，乐器口 ${mouthZ.toFixed(2)}）`)
  const fakeCol = rm.uniforms.uColor.value.getHexString()
  // 真吸魂：源 = 玩家胸口，流进乐器口；暖红
  const from: [number, number, number] = [0.4, 1.15, 3.2]
  AN.resetJazzDynamics(rig)
  for (let t = 0; t <= 2.0; t += 1 / 30) AN.applyJazzPose(rig, AN.jazzPose('leader', 'trueSoulSuck', t), { time: t, dt: 1 / 30, mistFrom: from })
  let srcD = 0, endD = 0
  const hx = (AN as any).jazzMistParts(rig)
  for (let k = 0; k < MI.strands; k++) { const v0 = k * (segs + 1) * 2, v1 = (k * (segs + 1) + segs) * 2; srcD = Math.max(srcD, Math.hypot(P.getX(v0) - from[0], P.getY(v0) - from[1], P.getZ(v0) - from[2])); endD = Math.max(endD, P.getZ(v1)) }
  ok(srcD < 0.5 && rm.uniforms.uColor.value.getHexString() !== fakeCol && rm.uniforms.uColor.value.getHexString() === new THREE.Color(MI.real).getHexString(), `真吸魂：雾从你胸口抽出（源偏 ≤ ${srcD.toFixed(2)} m）、颜色 #${rm.uniforms.uColor.value.getHexString()}（假 #${fakeCol}）`)
  ok(endD < fakeReach - 0.1, `真吸魂：方向不同——一直抽进乐器口（丝带末端 z ${endD.toFixed(2)}）`); void hx
}

console.log('— [修] 立柱：舞台 / 吧台 / 观众区没有穿模 —')
{
  const e = e0, site = js(e), m = e.map, X = ox(e), Y = oy(e)
  const props = m.structures.filter((q: any) => q.kind === 'jazzprop' && ['stage', 'steps', 'bar', 'piano', 'cctv', 'poster'].includes(q.data?.prop)).map((q: any) => ({ x0: q.x, y0: q.y, x1: q.x + (q.w ?? 1) - 1, y1: q.y + (q.h ?? 1) - 1 }))
  const H = (WALL_H?.hotel ?? 3.3) * 1.75
  const floor = (x: number, y: number) => m.tiles[y * m.w + x] === 1, wall = (x: number, y: number) => m.tiles[y * m.w + x] !== 1
  const mod = (n: number, d: number) => ((n % d) + d) % d
  const boxes: any[] = []; let skipped = 0
  for (let y = site.bar.y0 - Y; y <= site.stage.y1 + 2 - Y; y++) for (let x = site.aud.x0 - 2 - X; x <= site.stage.x1 - X; x++) {
    if (!floor(x, y)) continue
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!wall(x + dx, y + dy)) continue
      const axis = dx ? y + Y : x + X
      if (mod(axis, 3) !== 0) continue
      if (LJ.jazzWallClear(props, x, y)) { skipped++; continue }
      boxes.push(LJ.l5PilasterBox(x, y, dx, dy, H))
    }
  }
  const S = site.stage, B = site.bar
  const vols = [
    { n: '舞台（台面 + 幕布 + 台口柱）', x0: S.x0 - X, x1: S.x1 + 1 - X, y0: S.y0 - Y, y1: S.y1 + 1 - Y },
    { n: '吧台（柜身 + 酒架）', x0: B.x0 - X, x1: B.x1 + 1 - X, y0: B.y0 - Y, y1: B.y0 + 1 - Y },
    { n: '台阶', x0: Math.floor(site.stepTop.x - 0.8) - X, x1: Math.floor(site.stepTop.x - 0.8) + 2 - X, y0: S.y0 - 1 - Y, y1: S.y0 - Y },
    { n: '观众区', x0: site.aud.x0 - X, x1: site.aud.x1 + 1 - X, y0: site.aud.y0 - Y, y1: site.aud.y1 + 1 - Y },
  ]
  for (const v of vols) { const hit = boxes.filter((b) => b.x0 < v.x1 && b.x1 > v.x0 && b.y0 < v.y1 && b.y1 > v.y0); ok(hit.length === 0, `壁柱 × ${v.n}：0 处相交（附近壁柱 ${boxes.length} 根）`, hit.length ? hit : undefined) }
  ok(skipped >= 3, `舞台 / 吧台 / 钢琴 / 监控 / 海报背后原有的 ${skipped} 根壁柱不做（jazzWallClear）`)
  // 真实构建一遍 l5Architecture（这片的墙面线脚），查顶点有没有进舞台 / 吧台体内
  const root = new (await import('three')).Group()
  const gen = buildL5Architecture(m, WALL_H?.hotel ?? 3.3, root, { x0: Math.max(0, site.aud.x0 - 3 - X), y0: Math.max(0, site.bar.y0 - 2 - Y), x1: Math.min(m.w, site.stage.x1 + 3 - X), y1: Math.min(m.h, site.stage.y1 + 3 - Y) })
  for (let it = gen.next(); !it.done; it = gen.next()) { /* 跑完 */ }
  let inStage = 0, inBar = 0, verts = 0
  root.traverse((o: any) => {
    if (!o.isMesh) return
    const p = o.geometry.getAttribute('position')
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), yy = p.getY(i), z = p.getZ(i); verts++
      if (x > S.x0 - X + 0.02 && x < S.x1 + 1 - X - 0.09 && z > S.y0 - Y + 0.02 && z < S.y1 + 1 - Y - 0.02 && yy > 0.01 && yy < 0.44) inStage++
      if (x > B.x0 - X && x < B.x1 + 1 - X && ((z > B.y0 - Y + 0.09 && z < B.y0 - Y + 0.71 && yy > 0.01 && yy < 1.04) || (z > B.y0 - Y + 0.03 && z < B.y0 - Y + 0.24 && yy > 1.55 && yy < 1.9))) inBar++
    }
  })
  ok(verts > 1000 && inStage === 0, `实际构建的墙面线脚（${verts} 顶点）没有一点进舞台台面体内（${inStage}）`)
  ok(inBar === 0, `没有一点进吧台柜身 / 酒架（${inBar}）`)
  // 台口装饰柱：在台上、不挡站位和谱架
  ok(site.columns.length === 2 && site.columns.every((c) => LJ.inTR(S, c.x, c.y) && Object.values(site.play).every((p) => Math.hypot(p.x - c.x, p.y - c.y) > 0.8) && site.stands.every((q) => Math.hypot(q.x - c.x, q.y - c.y) > 0.5)), '舞台的柱子 = 台口两侧装饰柱（在台面上，离乐手站位 > 0.8 m、离谱架 > 0.5 m）')
  const pillarKinds = new Set(['redpillar', 'pillar', 'column', 'dtable', 'table'])
  ok(!m.structures.some((q: any) => (pillarKinds.has(q.kind) || (q.kind === 'chefprop' && q.data?.prop === 'table')) && q.x + X + (q.w ?? 1) > site.aud.x0 && q.x + X <= site.stage.x1 && q.y + Y + (q.h ?? 1) > site.bar.y0 && q.y + Y <= site.stage.y1), '观众区 / 吧台 / 舞台这一角没有别的立柱、餐桌')
  ok(readFileSync('src/game/renderer/l5Architecture.ts', 'utf8').includes('!jazzWallClear(jazzProps,x,y)'), 'l5Architecture 的壁柱分支用同一个 jazzWallClear 判断')
}

console.log('— [修] 走位：绕开 / 推开玩家，不穿桌椅、立柱 —')
{
  // 静态：规划出来的路线全程可走（不穿高脚凳 / 谱架 / 台口柱 / 钢琴 / 餐桌 / 实心格；上下台只经台阶）
  const e = fresh(), site = js(e)
  let bad = 0, n2 = 0
  for (const w of ['leader', 'sax', 'bass', 'drum'] as const) {
    for (const [a, b] of [[site.barAt[w], site.play[w]], [site.play[w], site.barAt[w]], [site.play[w], site.exit.out]] as const) {
      const pts = J.jazzPlan(e, site, a, b); if (!pts) { bad += 100; continue }
      let c = { x: a.x, y: a.y }
      for (const q of pts) { const L = Math.hypot(q.x - c.x, q.y - c.y); for (let t = 0; t <= L; t += 0.05) { const x = c.x + (q.x - c.x) * t / L, y = c.y + (q.y - c.y) * t / L; n2++; const nearEnd = Math.hypot(x - b.x, y - b.y) < 0.6 || Math.hypot(x - a.x, y - a.y) < 0.6; if (!nearEnd && !J.jazzWalkable(e, site, x, y, 0.2)) bad++ } c = q }
    }
  }
  ok(bad === 0, `吧台 ↔ 台上 / 台上 → 后场门：路线 ${n2} 个采样点全在可走区（半径 0.2 m 不碰障碍）`, bad)
  const O = LJ.jazzObstacles(site)
  ok(O.circles.length >= 2 + 3 + 2 && O.boxes.length === 2, `障碍：高脚凳 ×2 / 谱架 ×3 / 台口柱 ×2 / 餐桌 ×${site.tables.length} + 钢琴 / 琴凳`)
  // 动态：你站在台阶脚下（上台必经之路）
  const run2 = (spot: { x: number; y: number }, label: string) => {
    const e2 = fresh(), s2 = js(e2)
    breakAt(e2); inAud(e2); stepAll(e2); run(e2, 2)
    const P = W(e2, spot); at(e2, P.x, P.y)
    const r = J.jazzDebug(e2); r.yieldN = { wait: 0, replan: 0, nudge: 0, detour: 0 }
    showAt(e2, 0, 0.2)
    let minD = 9, solidHit = 0
    const t0 = e2.time
    run(e2, JK.walkOnT + 25, 0.05, () => {
      for (const x of band(e2)) {
        const d = Math.hypot(x.x - e2.player.x, x.y - e2.player.y); if (x.jz.mode === 'walk') minD = Math.min(minD, d)
        const w = { x: x.x + ox(e2), y: x.y + oy(e2) }
        if (x.jz.mode === 'walk' && !J.jazzWalkable(e2, s2, w.x, w.y, 0.15) && Math.hypot(w.x - s2.bench.x, w.y - s2.bench.y) > 0.6) solidHit++
      }
      return band(e2).every((x: any) => { const q = W(e2, s2.play[x.jz.who as 'leader']); return Math.hypot(x.x - q.x, x.y - q.y) < 0.35 }) && e2.time - t0 > 3
    })
    const allUp = band(e2).every((x: any) => { const q = W(e2, s2.play[x.jz.who as 'leader']); return Math.hypot(x.x - q.x, x.y - q.y) < 0.35 })
    return { minD, solidHit, allUp, y: { ...r.yieldN }, said: J.jazzDebug(e2).subs.some((x: any) => /借过|劳驾/.test(x.text)) || msgs.some((m) => /挤到一边/.test(m)), moved: Math.hypot(e2.player.x - P.x, e2.player.y - P.y), label }
  }
  const foot = run2(site.stepFoot, '台阶脚下')
  ok(foot.allUp, `你堵在${foot.label}：四人最后都上了台`, foot)
  ok(foot.minD >= JK.yieldGap - 0.03 && foot.minD > 2 * PLAYER_RADIUS, `走位时离你始终 ≥ ${(JK.yieldGap - 0.03).toFixed(2)} m（最近 ${foot.minD.toFixed(2)} m，不穿过你）`)
  ok(foot.y.nudge === 0, `台阶脚下有一条以上的路：规划时就绕开你，不用挤你（停下等 ${foot.y.wait} 次）`)
  ok(foot.solidHit === 0, '走位全程不进实心格 / 不碰高脚凳、谱架、台口柱、钢琴')
  const mid = run2({ x: (site.barAt.sax.x + site.stepFoot.x) / 2, y: (site.barAt.sax.y + site.stepFoot.y) / 2 + 0.1 }, '吧台和台阶之间')
  ok(mid.allUp && mid.minD >= JK.yieldGap - 0.03 && mid.solidHit === 0 && mid.y.detour + mid.y.replan > 0 && mid.y.nudge === 0, `你站在${mid.label}：绕开你上台（最近 ${mid.minD.toFixed(2)} m，绕路 ${mid.y.detour + mid.y.replan} 次、没挤你）`, mid)
  const onSteps = run2({ x: site.stepTop.x, y: site.stage.y0 - 0.45 }, '台阶上（唯一的上台通道）')
  ok(onSteps.allUp && onSteps.y.wait > 0 && onSteps.y.nudge > 0 && onSteps.moved > 0.3 && onSteps.said, `你堵在${onSteps.label}：停下等、说「借过」、绕不过去就侧身把你挤开 ${onSteps.moved.toFixed(2)} m，然后上台`, onSteps)
  ok(onSteps.minD >= JK.yieldGap - 0.03 && onSteps.solidHit === 0, `挤你的时候也没贴上来（最近 ${onSteps.minD.toFixed(2)} m）`)
}

console.log('— [修] 注视：头 / 颈单独转（限角 + 平滑，演奏时幅度小、不破坏手位）—')
{
  const L = AN.JAZZ_LOOK
  const mk = (who: string) => { const man = buildJazz(who as any, { lod: 0 }); return man.userData.jazz }
  const runLook = (rig: any, who: string, clip: string, p: [number, number, number] | null, play: boolean, sec = 3) => { AN.resetJazzDynamics(rig); let maxStep = 0, prev = 0; for (let t = 0, i = 0; t <= sec; t += 1 / 60, i++) { AN.applyJazzPose(rig, AN.jazzPose(who as any, clip as any, t), { time: t, dt: i ? 1 / 60 : undefined, look: { p, play } }); const y = AN.jazzLookState(rig).yaw; if (i > 1) maxStep = Math.max(maxStep, Math.abs(y - prev)); prev = y } return { ...AN.jazzLookState(rig), maxStep } }
  const rl = mk('leader')
  const side = runLook(rl, 'leader', 'idleSway', [6, 1.7, 1.5], false)
  ok(Math.abs(side.yaw) <= L.yaw + 1e-6 && Math.abs(side.yaw) > 0.85 * L.yaw && side.yaw > 0, `看左侧远处的你：转头 ${side.yaw.toFixed(2)} rad（限 ${L.yaw}）`)
  ok(side.maxStep <= L.maxSpeed / 60 + 1e-6, `平滑：每帧最多转 ${(side.maxStep * 60).toFixed(2)} rad/s（上限 ${L.maxSpeed}）`)
  const down = runLook(rl, 'leader', 'idleSway', [0.2, 0.0, 1.2], false)
  ok(down.pitch > 0 && down.pitch <= L.pitchDown + 1e-6, `低头看近处的你：俯 ${down.pitch.toFixed(2)} rad（限 ${L.pitchDown}）`)
  const back = runLook(rl, 'leader', 'idleSway', [0, 1.7, -5], false)
  ok(Math.abs(back.yaw) < 0.1, `你在身后：不硬扭头（${back.yaw.toFixed(3)}）`)
  const none = runLook(rl, 'leader', 'idleSway', null, false)
  ok(none.yaw === 0 && none.pitch === 0, '没有目标：注视层为 0（片段原样——check:jazz-anim 不受影响）')
  // 演奏：幅度小、手位不坏（小号三指按活塞：指尖到活塞目标 ≤ 1 cm）
  const tipErr = (rig: any, who: string, clip: string, p: any) => { AN.resetJazzDynamics(rig); let worst = 0, n3 = 0; for (let t = 0, i = 0; t <= 3; t += 1 / 60, i++) { const P = AN.jazzPose(who as any, clip as any, t); AN.applyJazzPose(rig, P, { time: t, dt: i ? 1 / 60 : undefined, look: { p, play: true } }); rig.root.parent.updateMatrixWorld(true); if (t < 1) continue; for (const s of [1, -1]) { const AP = s > 0 ? P.L : P.R; if (AP.tips.w < 0.999 || !(AN.JAZZ_TIP_FINGERS as any)[AP.tips.set]) continue; const tg = AN.jazzTipTargetsNow(rig, AP.tips); (AN.JAZZ_TIP_FINGERS as any)[AP.tips.set].forEach((f: any, k: number) => { const x = AN.jazzFingerTip(rig, s, f); const g2 = AN.jazzTipGoal(tg[k], x); worst = Math.max(worst, Math.hypot(x.x - g2[0], x.y - g2[1], x.z - g2[2])); n3++ }) } } return { worst, n3, ...AN.jazzLookState(rig) } }
  const tp = tipErr(rl, 'leader', 'trumpetPlay', [6, 1.7, 1.5])
  ok(Math.abs(tp.yaw) <= L.playYaw + 1e-6 && Math.abs(tp.yaw) > 0.8 * L.playYaw, `演奏时注视幅度小：${tp.yaw.toFixed(3)} rad（限 ${L.playYaw}）`)
  ok(tp.n3 > 100 && tp.worst <= 0.01, `演奏时转头：活塞指尖跟着走（最大误差 ${(tp.worst * 1000).toFixed(1)} mm ≤ 10 mm，${tp.n3} 次）`)
  const rs = mk('sax'), sp = tipErr(rs, 'sax', 'saxPlay', [-6, 1.7, 1.5])
  ok(sp.n3 > 100 && sp.worst <= 0.01, `萨克斯按键指尖跟着走（${(sp.worst * 1000).toFixed(1)} mm）`)
  const rb = mk('bass'), bb = tipErr(rb, 'bass', 'bassPlay', [6, 1.7, 1.5])
  ok(Math.abs(bb.yaw) <= L.playYaw * L.bassK + 1e-6 && bb.worst <= 0.01, `低音提琴（头是一把琴）幅度再 ×${L.bassK}：${bb.yaw.toFixed(3)} rad、按弦指尖 ${(bb.worst * 1000).toFixed(1)} mm`)
  // AI：搭话 / 路过 / 终曲时看你
  const e = fresh(), site = js(e)
  breakAt(e); inAud(e); stepAll(e); run(e, 2)
  const lp2 = W(e, site.barAt.leader); at(e, lp2.x, lp2.y + 1.2); run(e, 1.3); e.specialPressed = true; stepAll(e)
  ok(!!who(e, 'leader').jz.lookAt && Math.abs(who(e, 'leader').jz.lookAt.z - 1.55) < 0.01, '搭话：看着你（眼高 1.55 m）')
  inAud(e); showAt(e, 0, 0.2); let sawWalkLook = false
  run(e, JK.walkOnT, 0.05, () => { for (const x of band(e)) if (x.jz.mode === 'walk' && x.jz.lookAt) sawWalkLook = true })
  ok(sawWalkLook, '上台路过你：转头看你')
  showAt(e, 0, JK.showLen - JK.bowT - JK.suckT + 1); run(e, 0.5)
  ok(band(e).every((x: any) => x.jz.clip === 'fakeSoulSuck' && !!x.jz.lookAt), '终曲：四人都看着观众区里的你')
  // 渲染：自己管头的片段（瞄监控）注视层回正
  const R = await import('../src/game/renderer/jazzRender')
  const grp = R.buildJazzEntityMesh(); const ent: any = { id: 5, x: 0, y: 0, z: 0, facing: 0, def: ENTITIES.jazz, jz: J.ensureJazz({} as any, 'leader') }
  ent.jz.clip = 'idleSway'; ent.jz.seq = 1; ent.jz.lookAt = { x: 2, y: 4, z: 1.6 }
  for (let i = 0; i < 90; i++) R.animateJazzEntity(grp, ent, 1 / 30, 4)
  const y1 = Math.abs(AN.jazzLookState(grp.userData.rig0).yaw)
  ent.jz.clip = 'glanceCamera'; ent.jz.seq = 2; ent.jz.modeT = 0
  for (let i = 0; i < 90; i++) { ent.jz.modeT += 1 / 30; R.animateJazzEntity(grp, ent, 1 / 30, 4) }
  ok(y1 > 0.2 && Math.abs(AN.jazzLookState(grp.userData.rig0).yaw) < 0.02, `渲染接入：待着时看你（${y1.toFixed(2)} rad），瞄监控片段自己管头、注视层回正`)
}

console.log('— [修] 告发：离场状态机 / 回来后的真吸魂 —')
{
  // 演出中在后排老板身边告发：台上四人收拾 → 走台阶下台 → 后场门
  const e = fresh(), site = js(e)
  breakAt(e); inAud(e); stepAll(e); sv(e).sawFinale = 1
  showAt(e, 0, 1); run(e, 20); showAt(e, 0, 40); run(e, 0.5)
  ok(band(e).every((x: any) => x.jz.h > 0.4), '告发前：四人在台上演奏')
  const c = W(e, { x: site.cctv.x - 0.6, y: site.cctv.y + 1.6 }); at(e, c.x, c.y)
  e.specialHeld = true; run(e, JK.reportHold + 0.2); e.specialHeld = false
  ok(sv(e).reported === 1 && J.jazzDebug(e).leave && band(e).length === 4, '告发：乐队没有消失，进入离场')
  const phases: Record<string, Set<string>> = {}; let ramp = false, minD = 9
  const lastPos: Record<string, any> = {}
  run(e, JK.leaveTimeout, 0.05, () => {
    for (const x of band(e)) { (phases[x.jz.who] ??= new Set()).add(x.jz.leave?.phase + ':' + x.jz.clip); if (x.jz.h > 0.05 && x.jz.h < 0.4) ramp = true; if (x.jz.mode === 'walk') minD = Math.min(minD, Math.hypot(x.x - e.player.x, x.y - e.player.y)); lastPos[x.jz.who] = { x: x.x + ox(e), y: x.y + oy(e) } }
    return band(e).length === 0
  })
  stepAll(e)
  const seq = Object.values(phases)
  ok(seq.length === 4 && seq.every((p) => p.has('pack:packUp') && [...p].some((q) => q.startsWith('walk:')) && [...p].some((q) => q.startsWith('door:'))), '每人：收拾（packUp）→ 走（walk）→ 穿门（door）', Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, [...v]])))
  ok(ramp, '下台走的是台阶（高度 0.45 → 0 过渡）')
  ok(Object.values(lastPos).every((p: any) => Math.hypot(p.x - site.exit.door.x, p.y - site.exit.door.y) < 0.6), '最后都从后场门（弹簧门）出去')
  ok(band(e).length === 0 && !J.jazzDebug(e).leave, '走完收起实体')
  ok(minD >= JK.yieldGap - 0.03, `离场路上也不穿过你（最近 ${minD.toFixed(2)} m）`)
  ok(J.jazzDebug(e).yieldN !== undefined && msgs.some((m) => m.includes('收拾东西')), '提示：乐队收拾东西，被叫走了')
  // 回来以后：真吸魂
  sv(e).goneT = 0; breakAt(e); inAud(e); stepAll(e); stepAll(e)
  ok(band(e).length === 4, '1800 s 后回来了')
  showAt(e, 0, 1); run(e, 20); look.pitch = -0.6
  showAt(e, 0, JK.showLen - JK.bowT - JK.suckT + 0.3); run(e, 2)
  ok(band(e).every((x: any) => x.jz.clip === 'trueSoulSuck'), '真吸魂：终曲换成专属片段 trueSoulSuck（僵直前伸、一下下往回抽）')
  ok(band(e).every((x: any) => x.jz.mistFrom && Math.hypot(x.jz.mistFrom.x - e.player.x, x.jz.mistFrom.y - e.player.y) < 1e-6), '雾的源 = 你的胸口（从你身上被抽走）')
  ok(J.jazzGrade(e) > 0.8 && J.jazzHud(e)!.grade > 0.8, `画面压暗发冷：grade ${J.jazzGrade(e).toFixed(2)}（曝光 ×${(1 - 0.42 * J.jazzGrade(e)).toFixed(2)} + HUD 冷色罩 / 边缘抽动）`)
  ok(readFileSync('src/game/renderer/renderer.ts', 'utf8').includes('1-.42*jazzGrade(engine)') && readFileSync('src/components/JazzHud.tsx', 'utf8').includes('jz-realfx'), '渲染曝光 / HUD 屏幕效果接入')
  const s0 = e.player.sanity; run(e, JK.suckT); look.pitch = 0
  ok(e.player.sanity < s0 - JK.realFinaleSan + 3, `终曲在场：理智 ${s0.toFixed(0)} → ${e.player.sanity.toFixed(0)}`)
  showAt(e, 0, JK.showLen + 30); run(e, 4)
  ok(J.jazzGrade(e) < 0.2, '演完画面恢复')
  // 对照：没告发 = 假吸魂，画面不变
  const e2 = fresh(); finale(e2); run(e2, 2)
  ok(band(e2).every((x: any) => x.jz.clip === 'fakeSoulSuck' && !x.jz.mistFrom) && J.jazzGrade(e2) === 0, '没告发：假吸魂（fakeSoulSuck，雾从观众席来、画面不变）')
}

console.log('— [修] 点歌菜单：暂停 / 数字键归还 / 鼠标触屏 / Esc —')
{
  const e = fresh(); finale(e); look.pitch = 0
  const edge = W(e, { x: js(e).stage.x0 - 0.6, y: js(e).play.sax.y }); at(e, edge.x, edge.y) // 台口（萨克斯面前）
  emits.length = 0
  ok(J.jazzOpenMenu(e) && emits.includes('jazzmenu') && J.jazzMenuOpen(e), '打开：发 jazzmenu 事件（App 切到覆盖层）')
  const sus0 = J.jazzDebug(e).sus, t0 = e.time
  let k = 0; run(e, 3, 0.05, () => { k++; e.player.x += (k % 2 ? 0.06 : -0.06) })
  ok(J.jazzDebug(e).sus === sus0 && Math.abs(e.time - t0 - 3) < 0.06, `菜单开着：露馅 / 演出时间冻结（露馅 ${sus0} → ${J.jazzDebug(e).sus}，时钟只走了 ${(e.time - t0).toFixed(2)} s——没有 ×${JK.timeWarp}）`)
  const app = readFileSync('src/App.tsx', 'utf8')
  const pausedLine = app.split('\n').find((l) => l.includes('const paused = overlayRef.current')) ?? ''
  ok(/'greeterinvite' \| 'jazzmenu'/.test(app) && /case 'jazzmenu':[\s\S]{0,120}setOverlay\('jazzmenu'\)/.test(app) && pausedLine.length > 0 && !pausedLine.includes('jazzmenu'), '覆盖层 jazzmenu：和 BeastDeal / GreeterInvite 一样暂停游戏（不在不暂停名单里）')
  ok(/overlayRef\.current === 'jazzmenu'\) return/.test(app) && app.includes("<JazzMenu onClose="), '全局按键：菜单开着时游戏收不到按键（数字键不切快捷栏），Esc 交给菜单')
  const menu = readFileSync('src/components/JazzMenu.tsx', 'utf8'), hud = readFileSync('src/components/JazzHud.tsx', 'utf8')
  ok(/\(\?:Digit\|Numpad\)\(\[1-5\]\)/.test(menu) && /Escape/.test(menu) && /onClick=\{\(\) => pick\(i\)\}/.test(menu) && /data-jazz-menu-close/.test(menu), '菜单：1–5 / 小键盘 1–5、鼠标 / 触屏点一行、「算了」按钮、Esc 关')
  ok(!/addEventListener\('keydown', k, true\)/.test(menu + hud) && !/stopImmediatePropagation/.test(menu + hud) && !/keydown/.test(hud), '不再在捕获阶段截获数字键；HUD 不再监听按键（关掉菜单后 1–5 照常切快捷栏）')
  ok(J.jazzRequest(e, 1) && !J.jazzMenuOpen(e) && J.jazzMenuView(e) === null, '点一首：菜单关、覆盖层跟着关（JazzMenu 轮询 jazzMenuView）')
  J.jazzOpenMenu(e); J.jazzCloseMenu(e); ok(!J.jazzMenuOpen(e), 'Esc / 算了：关菜单')
  const sus1 = J.jazzDebug(e).sus; k = 0; run(e, 1, 0.05, () => { k++; e.player.x += (k % 2 ? 0.06 : -0.06) })
  ok(J.jazzDebug(e).sus > sus1, '关掉以后计时恢复')
}

console.log(`\n${n - fails}/${n} 通过`)
if (fails) process.exit(1)
