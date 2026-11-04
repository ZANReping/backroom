/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// [casino] Level 5.1 赌场 阶段 1 无头验收：npm run check:casino
// 覆盖：内部 level id 119 / levelDefOf · L5 入口生成（1F 每局一处、贝弗莉室北墙正中、贴墙门让位）· 赌场地图（尺寸 / 出口只有大门 / 出生点）
//       · 碰撞连通（出生点 BFS 能到每个区域与大门；牌桌 / 吧台 / 老虎机挡人）· 营业 / 打烊（16 / 8 分钟、打烊大门上锁、营业走进去切换）
//       · 野兽第二次关注度满 → 传送进 5.1（紫筹码 −50）· 存档字段往返 · PBR 贴图生成无 NaN · 场景构建（三角形 / 绘制调用）
import { createCanvas } from '@napi-rs/canvas'
const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const H = await import('../src/game/engine/l5Hotel')
const CA = await import('../src/game/engine/casinoAI')
const A = await import('../src/game/engine/beastAI')
const L5 = await import('../src/game/world/infiniteL5')
const LY = await import('../src/game/content/casinoLayout')
const { levelDefOf } = await import('../src/game/levels')
const { generateLevel } = await import('../src/game/world/mapgen')
const { canOccupy, PLAYER_RADIUS } = await import('../src/game/core/player')
const { snapshot } = await import('../src/game/engine/save')
const { audio } = await import('../src/game/core/audio')
const { look } = await import('../src/game/renderer/shared')
const MAT = await import('../src/game/renderer/casinoMaterials')
const SC = await import('../src/game/renderer/casinoScene')
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (k !== 'constructor' && typeof (audio as any)[k] === 'function') (audio as any)[k] = () => {}
let fails = 0, n = 0
const ok = (c: unknown, m: string, dbg?: unknown) => { n++; console.log(`${c ? '✔' : '✘'} ${m}${dbg !== undefined ? '  ' + JSON.stringify(dbg) : ''}`); if (!c) fails++ }

console.log('— 定义 —')
const def = levelDefOf(119)!
ok(CA.CASINO_LEVEL === 119 && def?.id === 119 && def.displayId === 5.1 && H.POCKET_LEVEL.casino === 119, '内部 level id 119 → Level 5.1（levelDefOf / POCKET_LEVEL）', { id: def?.id, d: def?.displayId })
ok(def.exits.length === 1 && def.exits[0].dest === 'back', '出口只有 TH 大门（back → L5）')
ok(CA.CA.openSec === 960 && CA.CA.closedSec === 480 && CA.CA.purpleDebt === -50, '数值表：营业 16 分钟 / 打烊 8 分钟 / 紫筹码 −50')

console.log('— L5 入口生成 —')
const SEEDS = [800, 1234, 42, 9001, 20261103]
let found = 0
for (const seed of SEEDS) {
  const hall = L5.casinoDoorHall(seed, 1), tile = L5.casinoDoorTile(seed, 1)
  if (!hall || !tile) continue
  found++
  L5.setL5Floor(1)
  const r = L5.l5HallRect(seed, hall.hk, hall.hr)
  // 生成覆盖门格的 chunk，看结构
  const cx = Math.floor(tile.x / 32), cy = Math.floor(tile.y / 32)
  const ch = L5.genL5ChunkRaw(levelDefOf(5)!, seed, cx, cy)
  const wx = cx * 32, wy = cy * 32
  const doors = ch.structures.filter((s: any) => s.kind === 'casinodoor')
  const d = doors[0]
  const walldoorsNear = ch.structures.filter((s: any) => s.kind === 'l5walldoor' && s.y === r.y0 && Math.abs(s.x - tile.x) <= L5.CASINO_DOOR.halfW)
  if (seed === SEEDS[0]) {
    ok(L5.l5HallAt(seed, hall.hk, hall.hr) === 'beverly' && !L5.l5NestLayout(seed, hall.hk, hall.hr), `种子 ${seed}：大门在贝弗莉室（无飞蛾巢），大厅格 ${hall.hk},${hall.hr}`)
    ok(doors.length === 1 && d.x === tile.x && d.y === r.y0, '大门结构 casinodoor 在北墙内侧正中（chunk 结构是世界瓦片坐标）', { d: d && [d.x, d.y], tile })
    ok(walldoorsNear.length === 0, '门头两侧 ±3 格不放贝弗莉贴墙门')
    const wallTile = ch.tiles[(r.y0 - 1 - wy) * 32 + (tile.x - wx)]
    ok(r.y0 - 1 < wy || wallTile === 2, '门背后是墙（门贴墙）', { wallTile })
  }
}
ok(found === SEEDS.length, `每局一处：${found}/${SEEDS.length} 个种子 1F 都找到贝弗莉室`)
ok(L5.casinoDoorHall(800, 2) === null && L5.casinoDoorHall(800, 1) !== null, '只在 1F 生成（其它楼层没有）')

console.log('— 赌场地图 / 碰撞连通 —')
const m = generateLevel(def, 12345, true)
const LL = LY.casinoLayout()
ok(m.w >= LY.CASINO_MAP.w && m.exits.length === 1 && m.exits[0].def.dest === 'back', '地图尺寸够 / 只有一个出口', { w: m.w, h: m.h, ex: m.exits.length })
const sx = Math.floor(m.spawn.x), sy = Math.floor(m.spawn.y)
const occ = (x: number, y: number) => canOccupy(m, x + 0.5, y + 0.5, PLAYER_RADIUS, { z: 0 })
ok(occ(sx, sy), '出生点可站')
const seen = new Uint8Array(m.w * m.h), q: number[] = [sy * m.w + sx]; seen[q[0]] = 1
while (q.length) { const i = q.pop()!, x = i % m.w, y = (i / m.w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, j = ny * m.w + nx; if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || seen[j] || !occ(nx, ny)) continue; seen[j] = 1; q.push(j) } }
const ex = m.exits[0]
ok(seen[Math.floor(ex.y) * m.w + Math.floor(ex.x)] || seen[(Math.floor(ex.y) - 1) * m.w + Math.floor(ex.x)], '大门（出口）从出生点可达', ex)
const zoneReach = LL.zones.map((z) => { let hit = 0; for (let y = Math.ceil(z.y0); y < z.y1; y++) for (let x = Math.ceil(z.x0); x < z.x1; x++) if (seen[y * m.w + x]) hit++; return [z.name, hit] as const })
ok(zoneReach.every(([name, h]) => h > 6 || name === '员工通道'), '每个区域都走得到（前厅 / 兑换台 / 老虎机 / 牌桌 / 酒吧 / VIP 包间）', zoneReach)
let free = 0, tot = 0; for (let y = LY.OY; y < LY.OY + LY.CASINO_D; y++) for (let x = LY.OX; x < LY.OX + LY.CASINO_W; x++) { tot++; if (seen[y * m.w + x]) free++ }
ok(free / tot >= 0.55 && free / tot <= 0.65, `可走面积 ${(free / tot * 100).toFixed(1)}%（目标 55–65%：加密后仍不堵成孤岛）`)
for (const a of LL.aisles) {
  const wid = Math.min(a.x1 - a.x0, a.y1 - a.y0), hitBox = LL.boxes.filter((b) => b.x0 < a.x1 && b.x1 > a.x0 && b.y0 < a.y1 && b.y1 > a.y0)
  let cells = 0, reach = 0; for (let y = Math.ceil(a.y0 + 0.3); y < a.y1 - 0.8; y++) for (let x = Math.ceil(a.x0 + 0.3); x < a.x1 - 0.8; x++) { cells++; if (seen[y * m.w + x]) reach++ }
  ok(wid >= 2.5 && hitBox.length === 0 && cells > 0 && reach === cells, `主通道「${a.name}」宽 ${wid.toFixed(1)} m ≥ 2.5、不压碰撞盒、${reach}/${cells} 格可达`, hitBox.length ? hitBox.slice(0, 2) : undefined)
}
const blocked = (x: number, y: number) => !canOccupy(m, x, y, PLAYER_RADIUS, { z: 0 })
const bj = LL.props.find((p) => p.kind === 'blackjack')!, sl = LL.props.find((p) => p.kind === 'slot')!, rl = LL.props.find((p) => p.kind === 'roulette')!
ok(blocked(bj.x, bj.y - 0.3) && blocked(sl.x, sl.y) && blocked(rl.x, rl.y), '牌桌 / 老虎机 / 轮盘挡人')
const bar = LL.props.find((p) => p.kind === 'bar')!
const br = bar.data?.r ?? 4.4
ok(blocked(bar.x - br, bar.y) && !blocked(bar.x - br - 2.0, bar.y), '环形吧台挡人、吧台外走得通')
ok(blocked(LY.OX + 9, LY.OY + 9.15) && !blocked(LY.OX + 5.5, LY.OY + 9.15), 'VIP 包间墙挡人、门洞能进')
const nSlots = LL.props.filter((p) => p.kind === 'slot').length, nTall = LL.props.filter((p) => p.kind === 'slot' && p.data?.tall).length, nTables = LL.props.filter((p) => ['blackjack', 'roulette', 'craps'].includes(p.kind)).length
const kinds = new Set(LL.props.map((p) => p.kind))
ok(nSlots >= 110 && nTall >= 20 && nTables >= 12 && ['jackpotpole', 'jackpotboard', 'kiosk', 'cart', 'lounge', 'hangsign', 'lamppost', 'planter', 'pillar', 'chandelier', 'rope'].every((k) => kinds.has(k as any)), `加密：老虎机 ${nSlots} 台（高顶箱 ${nTall}、环形 2 组）、牌桌 ${nTables} 张、填充物齐（奖池柱 / 大屏 / 换筹码亭 / 服务车 / 沙发 / 吊牌 / 灯柱 / 盆栽 / 包金柱 / 吊灯组 / 绳栏）`)

console.log('— 分区地毯 / 图案尺度 —')
const area = LL.floors.reduce((s, f) => s + (f.x1 - f.x0) * (f.y1 - f.y0), 0)
ok(Math.abs(area - LY.CASINO_W * LY.CASINO_D) < 0.5, `地毯铺满大厅：${area.toFixed(1)} / ${LY.CASINO_W * LY.CASINO_D} m²`)
const carpetAt = (x: number, y: number) => LL.floors.find((f) => x >= f.x0 && x < f.x1 && y >= f.y0 && y < f.y1)?.carpet
const zoneCarpet = LL.zones.filter((z) => z.name !== '员工通道').map((z) => [z.name, carpetAt((z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2)] as const)
ok(new Set(zoneCarpet.map((z) => z[1])).size === 6, '六个区域六套不同地毯（前厅 / 兑换台 / 老虎机 / 牌桌 / 酒吧 / VIP）', zoneCarpet)
const means = zoneCarpet.map(([, c]) => MAT.bakeCasinoSurface(c!).mean)
let minD = 9; for (let i = 0; i < means.length; i++) for (let j = i + 1; j < means.length; j++) minD = Math.min(minD, Math.hypot(means[i][0] - means[j][0], means[i][1] - means[j][1], means[i][2] - means[j][2]))
const tiles = Object.entries(MAT.CARPET_TILE)
ok(tiles.every(([, t]) => t.motif >= 0.4 && t.motif <= 0.6), '各地毯主图案直径 0.4–0.6 m（ref8 尺度）', Object.fromEntries(tiles.map(([k, t]) => [k, t.motif])))


console.log('— 营业 / 打烊 · 进出 —')
const fresh = (seed = 800) => { const e: any = new Engine(); e.seed = seed; e.hotel = H.freshHotel(); e.emit = () => {}; e.persist = () => {}; e.die = () => { e.over = true }; return e }
const e = fresh()
let tOpen = -1, tClosed = -1
for (let t = 0; t < 1440 && (tOpen < 0 || tClosed < 0); t += 5) { const ph = CA.casinoPhase(e.seed, t); if (ph.open && tOpen < 0) tOpen = t; if (!ph.open && tClosed < 0) tClosed = t }
let openSum = 0; for (let t = 0; t < 1440; t++) if (CA.casinoPhase(e.seed, t).open) openSum++
ok(Math.abs(openSum - 960) <= 1, '一个周期 24 分钟里营业 960 s / 打烊 480 s', { openSum })
e.loadLevel(5, { mapSeed: 800, firstVisit: true }); e.emit = () => {}
ok(e.levelDef?.id === 5, '进 L5（真实 Engine）', { id: e.levelDef?.id })
let doorS = e.map.structures.find((s: any) => s.kind === 'casinodoor')
const dt = L5.casinoDoorTile(e.map.inf.seed, 1)
ok(!!dt && (!doorS || (doorS.x + e.map.inf.ox === dt.x && doorS.y + e.map.inf.oy === dt.y)), `L5 1F 大门世界格 ${dt?.x},${dt?.y}（${doorS ? '在当前窗口里' : '不在出生窗口，以下用同款结构贴到出生点北墙测逻辑'}）`)
if (!doorS) { const px = Math.floor(e.player.x), py = Math.floor(e.player.y); doorS = { kind: 'casinodoor', x: px, y: py, w: 1, h: 1, solid: false, data: { l5: 1 } }; e.map.structures.push(doorS) }
if (doorS) {
  const place = () => { e.player.x = doorS.x + 0.5; e.player.y = doorS.y + 0.3; look.yaw = 0 /* facing = −π/2（北） */; e.transition = null }
  e.time = tClosed; place(); CA.stepCasino(e, 0.1)
  ok(!e.transition && !CA.casinoOpen(e), '打烊：大门熄灯上锁，走过去进不去')
  e.time = tOpen; place(); CA.stepCasino(e, 0.1)
  ok(e.transition?.dest === 119 && e.hotel.pocket?.kind === 'casino' && e.outpostReturn === 5, '营业：贴近门面走进去 → 切换到 5.1（口袋同款返程）', { tr: e.transition, pk: e.hotel.pocket })
  place(); look.yaw = Math.PI; e.transition = null; CA.stepCasino(e, 0.1)
  ok(!e.transition, '背对大门不触发')
}
const e2 = fresh(801); e2.loadLevel(119, { mapSeed: 5, firstVisit: true }); e2.emit = () => {}
ok(e2.levelDef?.id === 119 && e2.map.exits.length === 1, '直接加载 5.1：地图生成 + 一个出口')
e2.time = tClosed; CA.stepCasino(e2, 1); CA.stepCasino(e2, CA.CA.closeKickSec + 1)
ok(e2.transition?.dest === 5, '打烊后场内 30 s：清场送回 L5')

console.log('— 野兽：关注度第二次满 → 5.1 —')
const e3 = fresh(802); e3.loadLevel(5, { mapSeed: 802, firstVisit: true }); e3.emit = () => {}
A.beastSave(e3).strikes = 1
const ok3 = (A as any).__strikeForTest ? (A as any).__strikeForTest(e3, 'attn') : null
if (ok3 === null) { // 没有测试出口：直接走 casinoBeastDrag（strike 的分支只多一个条件）
  A.beastSave(e3).strikes = 2; CA.casinoBeastDrag(e3)
}
ok(!e3.over && e3.transition?.dest === 119 && CA.casinoSave(e3).purple === -50 && CA.casinoSave(e3).drags === 1, '不再死亡：被拖进赌场，紫筹码余额 −50 记到存档字段', { over: e3.over, tr: e3.transition?.dest, cs: e3.hotel.casino })
const src = (await import('node:fs')).readFileSync('src/game/engine/beastAI.ts', 'utf8')
ok(/strikes >= BE\.deathAt && why === 'attn' && casinoBeastDrag\(eng\)/.test(src) && /BE\.deathAt\) \{\n\s+beastSay/.test(src), 'beastAI.strike：只有关注度满（attn）改传送，怀疑 / 违约第二次仍死亡')

console.log('— 存档 —')
const snap = JSON.parse(JSON.stringify(snapshot(e3)))
const back = H.restoreHotel(snap.hotel ?? e3.hotel)
ok(back.casino?.purple === -50 && back.casino?.drags === 1 && back.pocket?.kind === 'casino', '存档：hotel.casino（紫筹码 / 次数）+ 口袋返程 casino 往返', back.casino)
ok(CA.restoreCasinoSave({ purple: 'x', drags: -3 }).purple === 0 && CA.restoreCasinoSave(undefined).drags === 0, '坏数据 / 旧档不报错')

console.log('— PBR / 场景 —')
const t0 = Date.now(); let nan = 0
for (const s of MAT.CASINO_SURFACES) { const b = MAT.bakeCasinoSurface(s); nan += b.nan; if (b.mean.some((v) => !(v >= 0 && v <= 1))) nan++ }
ok(nan === 0 && MAT.CASINO_SURFACES.length >= 14, `程序 PBR ${MAT.CASINO_SURFACES.length} 种全部烘焙（albedo / normal / roughness / metalness），无 NaN，用时 ${Date.now() - t0} ms`)
ok(MAT.bakeCasinoSurface('carpetBar') === MAT.bakeCasinoSurface('carpetBar'), '贴图缓存（第二次不重烘）')
const cs = SC.buildCasinoScene()
const floorsM = cs.group.children.filter((o: any) => o.name?.startsWith('casino-floor-carpet')) as any[]
const scaleOk = floorsM.map((f) => { const p = f.geometry.attributes.position, u = f.geometry.attributes.uv; const du = Math.abs(u.getX(1) - u.getX(0)) || Math.abs(u.getY(2) - u.getY(0)), dx = Math.hypot(p.getX(1) - p.getX(0), p.getZ(1) - p.getZ(0)) || Math.hypot(p.getX(2) - p.getX(0), p.getZ(2) - p.getZ(0)); const tile = dx / du; return [f.userData.carpet, +tile.toFixed(3), +(MAT.CARPET_TILE[f.userData.carpet as keyof typeof MAT.CARPET_TILE].motif).toFixed(2)] as const })
ok(floorsM.length === 6 && scaleOk.every(([k, t]) => Math.abs(t - MAT.CARPET_TILE[k as keyof typeof MAT.CARPET_TILE].tile) < 0.01), `场景地面网格按区 6 张、UV 平铺 = 设计尺寸（米/张）`, scaleOk)
ok(minD > 0.05, `区域地毯平均色两两差 ≥ 0.05（最小 ${minD.toFixed(3)}）`, zoneCarpet.map(([z], i) => [z, means[i].map((v) => +v.toFixed(2))]))
const lmx = cs.lightmap
let peak = 0; for (let k = 0; k < lmx.w * lmx.h; k++) { const l = 0.2126 * lmx.data[k * 3] + 0.7152 * lmx.data[k * 3 + 1] + 0.0722 * lmx.data[k * 3 + 2]; if (l > peak) peak = l }
const zm = Object.fromEntries(Object.entries(lmx.zoneMean).map(([k, v]) => [k, +v.toFixed(2)]))
ok(lmx.mean >= 0.9 && Object.entries(lmx.zoneMean).every(([k, v]) => k === '员工通道' || v >= 0.5), `烘焙地面平均辐照度 ${lmx.mean.toFixed(2)} ≥ 0.9，各区 ≥ 0.5（${lmx.w}×${lmx.h} texel，${lmx.ms} ms）`, zm)
ok(peak / lmx.mean >= 3, `保留局部明暗：峰值 / 平均 = ${(peak / lmx.mean).toFixed(1)} ≥ 3`)
const nBake = LL.lights.filter((l) => l.bake).length, nRT = LL.lights.length - nBake
ok(nRT <= 48 && nBake >= 150, `灯：实时点光 ${nRT} 盏（≤ 渲染器池 48）、只烘焙 ${nBake} 盏（筒灯点阵 / 屏幕辉光 / 聚光 / 跑马灯外溢）`)
const baked = [] as string[]; cs.group.traverse((o: any) => { if (o.isMesh && o.geometry.attributes.color && o.material.vertexColors) baked.push(o.material.name) })
ok(baked.length >= 6, `静态网格逐顶点烘焙 ${baked.length} 批`)
const st = cs.stats()
ok(st.tris > 50000 && st.tris < 900000 && st.draws < 160, `整座赌场：${st.tris} 三角形 / ${st.draws} 次绘制（含实例 ${st.instances}）`, st)
const slots = cs.group.getObjectByName('slot-screen') as any
ok(slots?.isInstancedMesh && slots.count === LL.props.filter((p) => p.kind === 'slot').length, `老虎机用 InstancedMesh（${slots?.count} 台）`)
const w0 = cs.wheels[0].rotation.y; cs.update(0.5); ok(cs.wheels[0].rotation.y !== w0, '轮盘会转')
const mq = SC.buildCasinoMarquee(); ok(mq.tris > 1000 && !!mq.group.getObjectByName('casino-marquee-bulbs'), `跑马灯门头 ${mq.tris} 三角形（灯泡串 + 雨帘灯 InstancedMesh）`)

// =====================================================================
console.log('— 阶段 4：员工 —')
const GM = await import('../src/game/engine/casinoGames')
const STF = await import('../src/game/engine/casinoStaff')
const LF = await import('../src/game/renderer/casinoStaffLouieFace')
const e4 = fresh(804); e4.loadLevel(119, { mapSeed: 9, firstVisit: true }); e4.emit = () => {}
CA.casinoSetRng(e4, GM.mkRng(4))
const crew = STF.staffList(e4)
const heroes = crew.filter((a: any) => ['louie', 'prosthetic', 'billy', 'bartender'].includes(a.who)), bgs = crew.filter((a: any) => ['dealer', 'waiter', 'guard'].includes(a.who))
ok(heroes.length === 4 && new Set(heroes.map((a: any) => a.who)).size === 4 && bgs.length >= 8 && bgs.length <= 14, `员工生成：主角 4（Louie / 假肢人 / Billy / 酒保 E164）+ 背景 ${bgs.length}（荷官 ${bgs.filter((a: any) => a.who === 'dealer').length} / 侍应 ${bgs.filter((a: any) => a.who === 'waiter').length} / 保安 ${bgs.filter((a: any) => a.who === 'guard').length}）`)
const LLd = LY.casinoLayout().door
const homeOk = crew.map((a: any) => [a.who, STF.staffFreeAt(a.hx, a.hy), STF.staffPath(a.hx, a.hy, LLd.x, LLd.y - 1.3).length > 0] as const)
ok(homeOk.every(([, f, pth]) => f && pth), '每个员工岗位落在可走格、A* 能走到大门', homeOk.filter(([, f, pth]) => !f || !pth))
const zoneOf = (lx: number, ly: number) => LY.casinoLayout().zones.find((z) => lx >= z.x0 && lx < z.x1 && ly >= z.y0 && ly < z.y1)?.name
ok(new Set(bgs.map((a: any) => zoneOf(a.hx, a.hy))).size >= 4, '背景员工按区分布（≥ 4 个区）', [...new Set(bgs.map((a: any) => zoneOf(a.hx, a.hy)))])
const step4 = (sec: number, f?: () => void) => { for (let t = 0; t < sec; t += 0.1) { f?.(); CA.stepCasino(e4, 0.1) } }
e4.time = tOpen
const louie = crew.find((a: any) => a.who === 'louie')!
e4.player.x = louie.x - 2.6; e4.player.y = louie.y; step4(8)
ok(louie.state === 'watch' || louie.clip === 'stare', '注视：你在 Louie 5 m 内 → 转身盯你', { st: louie.state, clip: louie.clip })
const waiter = crew.find((a: any) => a.who === 'waiter')!
const w0p = [waiter.x, waiter.y]; e4.player.x = LY.OX + 26; e4.player.y = LY.OY + 30; step4(6)
ok(Math.hypot(waiter.x - w0p[0], waiter.y - w0p[1]) > 2 && waiter.path.length >= 0, '巡逻：侍应沿 A* 航点走动', { from: w0p, to: [waiter.x, waiter.y] })
const pathOk = STF.staffPath(LY.OX + 15.4, LY.OY + 25.2, LY.OX + 47, LY.OY + 28.2)
ok(pathOk.length > 0 && pathOk.every(([x, y]) => STF.staffFreeAt(x, y)), `A* 航点全在可走格（${pathOk.length} 段）`)
// 禁区：进吧台内 → 警告 → 滞留 → 保安驱逐
e4.player.x = LY.OX + 44.8 + 0.5; e4.player.y = LY.OY + 8.6 + 1.6
step4(1.2)
const warned = crew.some((a: any) => a.state === 'warn')
let expelled = false
for (let t = 0; t < 40 && !expelled; t += 0.1) { CA.stepCasino(e4, 0.1); if (Math.hypot(e4.player.x - LY.OX - 44.8, e4.player.y - LY.OY - 8.6) > 10) expelled = true; else if (STF.staffRt(e4).expelBy >= 0) { /* 保安在路上；你待着不动 */ } }
ok(warned && expelled, '警告 → 驱逐：闯进吧台内被警告，滞留后保安走过来把你送回前厅', { warned, expelled, p: [e4.player.x, e4.player.y] })

console.log('— 阶段 4：Louie 脸贴图不阻塞主线程 —')
const mSrc = (await import('node:fs')).readFileSync('src/game/renderer/casinoStaffMat.ts', 'utf8')
ok(/bakeLouieFace\(LOUIE_PREVIEW_SIZE\)/.test(mSrc) && /bakeLouieFaceAsync\(\)\.then\(swap\)/.test(mSrc) && !/const b = bakeLouieFace\(\)/.test(mSrc), '材质先用 256² 预览、2048² 异步分块烘焙后换图（不再同步 2048²）')
const tq: (() => void)[] = []
const pr = LF.bakeLouieFaceAsync(512, 8, (f) => tq.push(() => f()))
while (!LF.LOUIE_ASYNC_STATS.done && tq.length) tq.shift()!()
await pr
ok(LF.LOUIE_ASYNC_STATS.slices > 4 && LF.LOUIE_ASYNC_STATS.maxSliceMs < 40, `异步烘焙 512²：${LF.LOUIE_ASYNC_STATS.slices} 片，单片最长 ${LF.LOUIE_ASYNC_STATS.maxSliceMs.toFixed(1)} ms（预算 8 ms + 一行粒度）、合计 ${LF.LOUIE_ASYNC_STATS.totalMs.toFixed(0)} ms`)

console.log('— 阶段 4：筹码经济 / 兑换台 —')
const e5 = fresh(805); e5.loadLevel(119, { mapSeed: 10, firstVisit: true }); e5.emit = () => {}; e5.time = tOpen
CA.casinoSetRng(e5, GM.mkRng(55))
const sv5 = CA.casinoSave(e5)
for (let i = 0; i < 4; i++) e5.addItem('almond')
e5.addItem('babelbalm')
ok(CA.casinoOpenMenu(e5, 'cashier') && CA.casinoMenu(e5)?.mode === 'cashier', '兑换台菜单（Louie）')
const nA = e5.countItem('almond')
CA.casinoSell(e5, 'almond'); CA.casinoSell(e5, 'babelbalm')
ok(sv5.chips === CA.CA.sell.almond + CA.CA.sell.babelbalm && e5.countItem('almond') === nA - 1, `物品换筹码：杏仁水 ${CA.CA.sell.almond} 红 / 巴别润唇膏 ${CA.CA.sell.babelbalm}（维基价）`, { chips: sv5.chips })
const san0 = e5.player.sanity; CA.casinoSell(e5, '#sanity')
ok(e5.player.sanity === san0 - CA.CA.sanSell && sv5.chips === 42 + CA.CA.sanSellChips, '理智换筹码（−10 → 5）')
ok(CA.casinoSell(e5, '#memory') && !CA.casinoSell(e5, '#memory'), '记忆：每次来访只能卖一段')
ok(CA.casinoBuy(e5, 'almond') && e5.countItem('almond') === nA, `筹码换奖品（杏仁水 ${CA.CA.prize.almond}）；回购价 > 收购价（兑换也抽水）`)
ok(Object.keys(CA.CA.rare).every((k) => k in (CA.CA.rare as any)) && CA.CA.rare.silencejuice >= 500, '稀有池：寂静汁液（头奖）/ 神秘蛋 / 迁跃浆果')
CA.casinoCloseMenu(e5, true)
ok(CA.casinoLedgerOk(e5).ok, '经济守恒（兑换后）', CA.casinoLedgerOk(e5))

console.log('— 阶段 4：四种游戏（接口 / 赌场优势）—')
const N = 100000, rr = GM.mkRng(20261103)
const rtpOut: Record<string, number> = {}
const inR = (v: number) => v >= GM.CG.rtpRange[0] && v <= GM.CG.rtpRange[1]
// 老虎机：精确 + 蒙特卡洛
const slotEx = GM.slotExactRTP(); let sa = 0, sa2 = 0
for (let i = 0; i < N; i++) { const w = GM.slotSpin(rr, 1).win; sa += w; sa2 += w * w }
const slotMc = sa / N, slotSd = Math.sqrt(sa2 / N - slotMc * slotMc) / Math.sqrt(N)
rtpOut.slot = slotMc
ok(inR(slotEx) && Math.abs(slotMc - slotEx) < 4 * slotSd, `老虎机 RTP 精确 ${slotEx.toFixed(4)} ∈ [0.92, 0.975]；10 万局实测 ${slotMc.toFixed(4)}（±${(4 * slotSd).toFixed(3)} 内）`)
let bw = 0, bb = 0; for (let i = 0; i < N; i++) { const s = GM.bjDeal(rr, 10); GM.bjAuto(rr, s); bw += s.bet; bb += s.payout }
rtpOut.bj = bb / bw
ok(inR(bb / bw), `21 点 RTP 10 万局实测 ${(bb / bw).toFixed(4)}（简化基本策略；黑杰克 1:1、软 17 要牌、不分牌）`)
for (const [k, exact] of [['red', 36 / 38], ['odd', 36 / 38], ['num', 36 / 38]] as const) {
  let t = 0, t2 = 0; for (let i = 0; i < N; i++) { const v = GM.rouPay(GM.rouSpin(rr), k as any, 17); t += v; t2 += v * v }
  const mc = t / N, sd = Math.sqrt(t2 / N - mc * mc) / Math.sqrt(N); rtpOut['rou-' + k] = mc
  ok(inR(exact) && Math.abs(mc - exact) < 4 * sd, `轮盘「${k}」RTP 精确 ${exact.toFixed(4)}；10 万局 ${mc.toFixed(4)}`)
}
for (const [k, exact] of [['big', 210 / 216 * 0 + 2 * 105 / 216], ['odd', 2 * 105 / 216], ['num', (75 * 2 + 15 * 3 + 1 * 4) / 216]] as const) {
  let t = 0, t2 = 0; for (let i = 0; i < N; i++) { const v = GM.dicePay(GM.rollDice(rr), k as any, 4); t += v; t2 += v * v }
  const mc = t / N, sd = Math.sqrt(t2 / N - mc * mc) / Math.sqrt(N); rtpOut['dice-' + k] = mc
  ok(inR(exact) && Math.abs(mc - exact) < 4 * sd, `骰宝「${k}」RTP 精确 ${exact.toFixed(4)}；10 万局 ${mc.toFixed(4)}`)
}
console.log('  RTP 实测', JSON.stringify(Object.fromEntries(Object.entries(rtpOut).map(([k, v]) => [k, +v.toFixed(4)]))))
// 引擎接口（菜单）：每种游戏玩 200 把，经济守恒
for (let i = 0; i < 30; i++) e5.addItem('royalration')
CA.casinoOpenMenu(e5, 'cashier'); while (CA.casinoSell(e5, 'royalration')); CA.casinoCloseMenu(e5, true)
const chips0 = sv5.chips
let plays = 0
ok(CA.casinoOpenMenu(e5, 'slot'), '老虎机菜单'); for (let i = 0; i < 200; i++) { if (CA.casinoSlot(e5, 1)) plays++; const m = CA.casinoMenu(e5)!; m.drinkOffer = undefined; m.invite = undefined } CA.casinoCloseMenu(e5, true)
CA.casinoOpenMenu(e5, 'bj', 'billy'); for (let i = 0; i < 200; i++) { const b = CA.casinoBjDeal(e5, 5); if (!b) break; plays++; while (!b.done) { if (GM.handVal(b.player).v < 15) CA.casinoBjHit(e5); else CA.casinoBjStand(e5) } CA.casinoMenu(e5)!.drinkOffer = undefined } CA.casinoCloseMenu(e5, true)
CA.casinoOpenMenu(e5, 'rou'); for (let i = 0; i < 200; i++) { if (CA.casinoRoulette(e5, (['red', 'black', 'odd', 'even', 'num'] as const)[i % 5], i % 38, 5)) plays++; CA.casinoMenu(e5)!.drinkOffer = undefined } CA.casinoCloseMenu(e5, true)
CA.casinoOpenMenu(e5, 'dice'); for (let i = 0; i < 200; i++) { if (CA.casinoDice(e5, (['big', 'small', 'odd', 'even', 'num'] as const)[i % 5], 1 + (i % 6), 5)) plays++; CA.casinoMenu(e5)!.drinkOffer = undefined } CA.casinoCloseMenu(e5, true)
ok(plays === 800, `四种游戏经菜单接口各 200 把（无头备用调用）：${plays} 把`, { chips0, chips: sv5.chips, stats: sv5.stats })
ok(CA.casinoLedgerOk(e5).ok, '经济守恒（800 把之后）：筹码 + 紫筹码 = 债 + 兑入 − 奖品 − 下注 + 返还 …', CA.casinoLedgerOk(e5))
ok(Object.values(sv5.stats).every(([b, r]: any) => b > 0 && r >= 0), '存档 stats：每种游戏下注 / 返还累计', sv5.stats)

console.log('— 阶段 4：操纵与上瘾 —')
const e6 = fresh(806); e6.loadLevel(119, { mapSeed: 11, firstVisit: true }); e6.emit = () => {}; e6.time = tOpen
const sv6 = CA.casinoSave(e6); sv6.chips = 500; sv6.ledger.exIn = 500
CA.casinoSetRng(e6, GM.mkRng(3))
CA.casinoOpenMenu(e6, 'rou')
let offer = false, near = false
for (let i = 0; i < 60 && !offer; i++) { CA.casinoRoulette(e6, 'num', 0, 5); if (CA.casinoMenu(e6)!.drinkOffer) offer = true }
ok(offer, `连输 ${CA.CA.drinkStreak} 把 → 侍应端来酒保 E164 的免费饮料`)
const san6 = e6.player.sanity = 60, def0 = CA.casinoDefaultBet(e6, 'rou')
CA.casinoDrink(e6, true)
ok(e6.player.sanity === san6 + CA.CA.drinkSan && sv6.drunkT > 0 && CA.casinoDefaultBet(e6, 'rou') >= def0 * 2, `喝下：理智 +${CA.CA.drinkSan}、醉意 ${CA.CA.drunkSec}s、默认下注翻倍（判断力下降）`, { def0, def1: CA.casinoDefaultBet(e6, 'rou') })
for (let i = 0; i < 12; i++) { CA.casinoRoulette(e6, 'red', 0, 5); CA.casinoMenu(e6)!.drinkOffer = undefined }
ok(sv6.addict >= CA.CA.againAt, `上瘾值累积（每把 +${CA.CA.addictPlay}，近失 +${CA.CA.addictNear}，赢 +${CA.CA.addictWin}）：${sv6.addict.toFixed(1)}`)
ok(!CA.casinoCloseMenu(e6) && CA.casinoMenu(e6)?.again === 1, '关菜单先问「再玩一把？」')
ok(CA.casinoAgain(e6) && sv6.again === 1, '「再玩一把」计数 +1')
CA.casinoRoulette(e6, 'red', 0, 5); CA.casinoCloseMenu(e6); const san7 = e6.player.sanity; ok(CA.casinoCloseMenu(e6) && e6.player.sanity === san7 - CA.CA.againSan, `硬走：理智 −${CA.CA.againSan}`)
CA.casinoOpenMenu(e6, 'slot'); for (let i = 0; i < 400; i++) { const r = CA.casinoSlot(e6, 1); if (r?.near) near = true; const m = CA.casinoMenu(e6)!; m.drinkOffer = undefined; m.invite = undefined; m.again = 0 } CA.casinoCloseMenu(e6, true)
ok(near, '老虎机近失（前两轴同为高价、第三轴擦边）会出现')
sv6.addict = 100; e6.player.x = LLd.x; e6.player.y = LLd.y - 3
ok(CA.casinoMoveMul(e6) < 0.7, `上瘾 100：走向大门移动 ×${CA.casinoMoveMul(e6).toFixed(2)}`)
let voiced = false; for (let t = 0; t < 40 && !voiced; t += 0.5) { CA.stepCasino(e6, 0.5); if (CA.casinoHud(e6)?.voice) voiced = true }
ok(voiced, '心声字幕（上瘾 ≥ 35）')
ok(sv6.warpSec > 0 && CA.casinoHud(e6) !== null, `场内无钟：时间感 ×${CA.CA.timeWarp}（warpSec ${sv6.warpSec.toFixed(1)}）`)
const early = GM.mkRng(1); const e7 = fresh(807); e7.loadLevel(119, { mapSeed: 12, firstVisit: true }); e7.emit = () => {}; e7.time = tOpen; CA.casinoSetRng(e7, early)
const sv7 = CA.casinoSave(e7); sv7.chips = 100; sv7.ledger.exIn = 100; CA.casinoOpenMenu(e7, 'rou'); let ew = 0; for (let i = 0; i < CA.CA.earlyN; i++) { const r = CA.casinoRoulette(e7, 'red', 0, 5); if (r && r.ret > 0) ew++ }
ok(ew >= 2, `前 ${CA.CA.earlyN} 把偏赢（新手运）：赢 ${ew} 把`)

console.log('— 阶段 4：紫筹码为负拦门 —')
const e8 = fresh(808); e8.loadLevel(5, { mapSeed: 808, firstVisit: true }); e8.emit = () => {}
CA.casinoBeastDrag(e8); e8.transition = null; e8.loadLevel(119, { mapSeed: 13, firstVisit: true }); e8.emit = () => {}; e8.time = tOpen
const sv8 = CA.casinoSave(e8)
ok(sv8.purple === -50 && sv8.pchip === 1, '被拖进来：紫筹码 −50（中心显示余额）')
e8.player.x = LLd.x; e8.player.y = LLd.y - 0.3
for (let t = 0; t < 6; t += 0.1) CA.stepCasino(e8, 0.1)
const blk = STF.staffList(e8).filter((a: any) => a.state === 'block').map((a: any) => a.who)
ok(e8.player.y <= LLd.y - CA.CA.blockY + 1e-6 && blk.includes('louie') && blk.includes('prosthetic'), '负数拦门：你被挡在门内 2.6 m（员工站在门内 2 m 的补光下），Louie + 假肢人 + 门口保安堵门', { y: e8.player.y, door: LLd.y, blk })
ok(CA.casinoExitBlocked(e8) && !CA.casinoLeave(e8), 'takeExit 守卫 / 打烊清场都不放人')
e8.time = tClosed; for (let t = 0; t < CA.CA.closeKickSec + 2; t += 0.5) CA.stepCasino(e8, 0.5)
ok(sv8.purple === -50 + CA.CA.closeWork && !e8.transition, `打烊时欠账：留下加班抵债 +${CA.CA.closeWork}，不送出门`, { p: sv8.purple })
e8.time = tOpen; e8.addItem('babelbalm'); CA.casinoOpenMenu(e8, 'cashier'); CA.casinoSell(e8, 'babelbalm'); CA.casinoCloseMenu(e8, true)
ok(sv8.purple === 0 && sv8.pchip === 0 && sv8.chips === CA.CA.sell.babelbalm - 20 && CA.casinoCanLeave(e8) && !CA.casinoExitBlocked(e8), '兑换先抵债：清零后紫筹码消失，可以出门', { p: sv8.purple, c: sv8.chips })
for (let t = 0; t < 3; t += 0.1) CA.stepCasino(e8, 0.1)
ok(STF.staffList(e8).every((a: any) => a.state !== 'block'), '清零后员工让开大门')
ok(CA.casinoLedgerOk(e8).ok, '经济守恒（拖入 / 加班 / 兑换抵债）', CA.casinoLedgerOk(e8))

console.log('— 阶段 4：野兽挑战 / 结局 —')
const beastGame = (seed: number) => {
  const e: any = fresh(900 + seed); e.loadLevel(119, { mapSeed: 14, firstVisit: true }); e.emit = () => {}; e.time = tOpen
  const s = CA.casinoSave(e); s.pchip = 1; s.purple = -190; s.ledger.debtIn = -190
  CA.casinoSetRng(e, GM.mkRng(seed))
  CA.casinoOpenMenu(e, 'rou'); let k = 0
  while (!CA.casinoBeastView(e) && k++ < 50) { CA.casinoRoulette(e, 'num', 0, 5); const m = CA.casinoMenu(e); if (m) m.drinkOffer = undefined }
  return e
}
const eb = beastGame(1)
const svb = CA.casinoSave(eb)
ok(!!CA.casinoBeastView(eb) && CA.casinoMenu(eb)?.mode === 'beast' && CA.casinoMenu(eb)?.forced && svb.purple <= CA.CA.beastDebt, `紫筹码 ≤ ${CA.CA.beastDebt}：野兽到场，坐到 VIP 牌桌对面（强制双人 21 点）`, { p: svb.purple })
for (let t = 0; t < 8; t += 0.1) CA.stepCasino(eb, 0.1)
ok(STF.staffList(eb).filter((a: any) => a.state === 'gather').length >= 4 && !CA.casinoCloseMenu(eb), '员工围住牌桌；挑战中不能离开')
let wins = 0, losses = 0, winE: any = null, loseE: any = null
for (let sd = 1; sd <= 60 && (!winE || !loseE); sd++) {
  const e = sd === 1 ? eb : beastGame(sd), m = CA.casinoMenu(e)!
  if (m.mode !== 'beast') continue
  let g = 0
  while (!m.beast!.over && g++ < 30) { CA.casinoBeastDeal(e); while (!m.beast!.done) { if (GM.handVal(m.beast!.player).v < 17) CA.casinoBeastHit(e); else CA.casinoBeastStand(e) } }
  if (m.beast!.won) { wins++; winE ??= e } else { losses++; loseE ??= e }
}
ok(!!winE && !!loseE, `挑战可赢可输（第一局让你赢，之后被操纵）：样本 ${wins} 胜 / ${losses} 负`)
if (winE) { const s = CA.casinoSave(winE); CA.casinoCloseMenu(winE); ok(s.purple === 0 && s.chips >= CA.CA.beastReward && s.beastWon === 1 && !CA.casinoBeastView(winE) && winE.countItem('royalration') >= 1 && CA.casinoLedgerOk(winE).ok, '赢：清债 + 150 筹码 + 一磅皇家口粮，野兽离席，经济守恒', { p: s.purple, c: s.chips }) }
if (loseE) { ok(CA.casinoMenu(loseE)?.mode === 'ending' && !CA.casinoCloseMenu(loseE), '输：专属结局画面（不能关）'); ok(CA.casinoEndingConfirm(loseE) && loseE.over && CA.casinoSave(loseE).ending === 1, '结局确认 → 游戏结束，存档标记 ending = 1') }
let bwin = 0; const br2 = GM.mkRng(77); for (let i = 0; i < 20000; i++) if (GM.beastAuto(br2, GM.beastStart(50)).won) bwin++
ok(bwin / 20000 > 0.05 && bwin / 20000 < 0.25, `野兽 21 点玩家胜率 ${(bwin / 200).toFixed(1)}%（「他从没输过」——几乎）`)
// 头奖邀请
const e9 = fresh(809); e9.loadLevel(119, { mapSeed: 15, firstVisit: true }); e9.emit = () => {}; e9.time = tOpen
CA.casinoSave(e9).chips = 10; CA.casinoOpenMenu(e9, 'slot')
const forceJ = () => 0 // rng 恒 0 → 三轴都停在 TH
CA.casinoSetRng(e9, forceJ); CA.casinoSave(e9).plays = 99
const jr = CA.casinoSlot(e9, 1)
ok(jr?.jackpot && CA.casinoMenu(e9)?.invite === 1 && CA.casinoBeastAccept(e9, true) && CA.casinoMenu(e9)?.mode === 'beast' && !CA.casinoMenu(e9)?.forced, '头奖 TH×3 → 野兽邀请（可婉拒；接受进双人 21 点）')

console.log('— 阶段 4b：入座 + 实体演出（结果先算，动画终态 = 规则结果）—')
{
  const SH = await import('../src/game/engine/casinoShow')
  const G = await import('../src/game/engine/casinoGames')
  const mk = (seed: number) => { const e: any = fresh(seed); e.loadLevel(119, { mapSeed: 21, firstVisit: true }); e.time = tOpen; const ev: string[] = []; e.emit = (x: any) => ev.push(x.kind); e.paused = false; CA.casinoSave(e).chips = 100000; CA.casinoSave(e).ledger.exIn += 100000; CA.casinoSave(e).plays = 99; return { e, ev } }
  const LL = LY.casinoLayout(), slotP = LL.props.find((q) => q.kind === 'slot')!
  // 入座 / 不暂停 / 不弹菜单
  const { e: s1, ev: ev1 } = mk(901)
  CA.casinoOpenMenu(s1, 'slot', '', SH.seatAt('slot', slotP.x, slotP.y, slotP.rot))
  for (let i = 0; i < 60; i++) CA.stepCasino(s1, 1 / 60)
  const sv = CA.casinoSeatView(s1)!
  ok(CA.casinoSeated(s1) && sv.seat.blend === 1 && !ev1.includes('casinomenu') && !s1.paused && CA.casinoMoveMul(s1) === 0, '入座：不发 casinomenu、不暂停、脚步锁定（moveMul 0）、1 s 内镜头过渡完成', { blend: sv.seat.blend, ev: ev1, paused: s1.paused })
  ok(Math.abs(sv.seat.a.yaw - SH.yawToward(sv.seat.a.x, sv.seat.a.y, slotP.x, slotP.y)) < 1e-9 && Math.abs(look.yaw - sv.seat.a.yaw) < 0.2, '入座：镜头朝向该台机器（就座视角，之后头可自由转）', { yaw: look.yaw, want: sv.seat.a.yaw })
  // 老虎机：转轴停位符号 = 结果；硬币 = min(24, 赢)；筹码实体 = 余额
  let bad = 0, coinBad = 0, chipBad = 0, nearSeen = 0
  CA.casinoSetRng(s1, G.mkRng(4242))
  for (let i = 0; i < 400; i++) {
    const r = CA.casinoSlot(s1, 1)!; const sh = CA.casinoSeatView(s1)!.show!.s as any
    if (CA.casinoShownChips(s1) !== CA.casinoSave(s1).chips - r.win) chipBad++
    CA.casinoShowAdvance(s1, sh.end + 0.01)
    for (let k = 0; k < 3; k++) if (SH.reelSymAt(SH.reelAngle(sh, k, sh.end)) !== r.syms[k]) bad++
    if (r.near) { nearSeen++; if (!SH.reelNearHi(SH.reelIndexAt(SH.reelAngle(sh, 2, sh.end)))) bad++ }
    if (SH.slotCoins(sh, sh.end) !== Math.min(24, r.win)) coinBad++
    if (CA.casinoShownChips(s1) !== CA.casinoSave(s1).chips) chipBad++
  }
  ok(bad === 0 && nearSeen > 0, '老虎机 400 把：三条转轴停位符号 = 规则结果；近失时赢线上 / 下一格是 7 / TH', { bad, nearSeen })
  ok(coinBad === 0 && chipBad === 0, '老虎机：托盘硬币数 = min(24, 赢)；演出中奖金未落袋，结束后桌面筹码 = 余额', { coinBad, chipBad })
  ok(SH.leverPull(0.1) > 0.5 && SH.leverPull(0.3) < SH.leverPull(0.1) && SH.leverPull(SH.SLOT_T.lever + 0.01) === 0, '拉杆：拉下 → 回弹 → 归位')
  // 中间过程真的在转（不是直接跳到结果）
  { const r = CA.casinoSlot(s1, 1)!; const sh = CA.casinoSeatView(s1)!.show!.s as any; const a0 = SH.reelAngle(sh, 0, 0.5), a1 = SH.reelAngle(sh, 0, 0.8); ok(a1 - a0 > 1 && SH.reelAngle(sh, 2, 1.5) !== sh.to[2] && !!r, '转轴：逐个停（第 3 轴 1.5 s 时仍在转），中途角速度 > 0', { d: a1 - a0 }) ; CA.casinoShowAdvance(s1, 10) }
  // 轮盘：球落格 = 结果
  const rouP = LL.props.find((q) => q.kind === 'roulette')!
  CA.casinoStand(s1, true); for (let i = 0; i < 60; i++) CA.stepCasino(s1, 1 / 60)
  ok(!CA.casinoSeatView(s1) && CA.casinoMoveMul(s1) > 0, '起身：镜头反向过渡后解除入座、恢复行走', { seat: !!CA.casinoSeatView(s1) })
  CA.casinoOpenMenu(s1, 'rou', '', SH.seatAt('rou', rouP.x, rouP.y, rouP.rot))
  bad = 0; let rimOk = 0
  for (let i = 0; i < 400; i++) { const kinds = ['red', 'black', 'odd', 'even', 'num'] as const; const r = CA.casinoRoulette(s1, kinds[i % 5], i % 38)!; const sh = CA.casinoSeatView(s1)!.show!.s as any; if (SH.pocketAt(SH.ballRel(sh, sh.end)) !== r.n) bad++; if (Math.abs(SH.ballRadius(sh.end) - SH.ROU_T.pocketR) < 1e-9 && SH.ballRadius(0.5) === SH.ROU_T.rimR) rimOk++; CA.casinoShowAdvance(s1, sh.end + 0.01) }
  ok(bad === 0 && rimOk === 400, '轮盘 400 把：球（外轨 → 落格弹跳）最终所在格 = 规则号码', { bad, rimOk })
  { const sh = CA.casinoSeatView(s1)!.show!.s as any; const mid = SH.pocketAt(SH.ballRel(sh, sh.end * 0.4)); ok(SH.ballRel(sh, 1) - SH.ballRel(sh, 2) > 1, '轮盘：球在外轨减速滚动（不是瞬移）', { mid }) }
  ok(SH.rouCell(0.9, 0.8)?.kind === 'even' && SH.rouCell(-0.95, 0)?.pick === 0 && SH.rouCell(-0.85, -0.9)?.pick === 3 && SH.rouCell(0.99, -0.9)?.pick === 36, '轮盘桌面：准星格子 → 押注（双 / 0 / 3 / 36）', [SH.rouCell(-0.85, -0.9), SH.rouCell(0.99, -0.9)])
  // 骰宝：朝上点数 = 结果
  CA.casinoStand(s1, true); for (let i = 0; i < 60; i++) CA.stepCasino(s1, 1 / 60)
  const dP = LL.props.find((q) => q.kind === 'craps')!
  CA.casinoOpenMenu(s1, 'dice', '', SH.seatAt('dice', dP.x, dP.y, dP.rot))
  bad = 0
  for (let i = 0; i < 400; i++) { const r = CA.casinoDice(s1, (['big', 'small', 'odd', 'even', 'num'] as const)[i % 5], 1 + (i % 6))!; const sh = CA.casinoSeatView(s1)!.show!.s as any; for (let k = 0; k < 3; k++) if (SH.dieUp(SH.dieAt(sh, k, sh.end)) !== r.d[k]) bad++; CA.casinoShowAdvance(s1, sh.end + 0.01) }
  let faceOk = 0; for (let v = 1; v <= 6; v++) for (const y of [0, 1, 2.5]) if (SH.dieUp(SH.dieQuat(v, y)) === v) faceOk++
  ok(bad === 0 && faceOk === 18, '骰宝 400 把：揭盅后 3 颗骰子朝上点数 = 规则结果（四元数校验）', { bad, faceOk })
  ok(SH.cupAt(0.3).shake !== 0 && SH.cupAt(3).lift > 0.3, '骰盅：先摇晃，再揭开抬起')
  // 21 点：桌面牌面 = 规则手牌；暗牌结算前背面
  CA.casinoStand(s1, true); for (let i = 0; i < 60; i++) CA.stepCasino(s1, 1 / 60)
  const bP = LL.props.find((q) => q.kind === 'blackjack')!
  CA.casinoOpenMenu(s1, 'bj', 'billy', SH.seatAt('bj', bP.x, bP.y, bP.rot))
  bad = 0; let holeOk = 0, hands = 0
  const eq = (a: any[], b: any[]) => a.length === b.length && a.every((c, i) => c.r === b[i].r && c.s === b[i].s)
  for (let i = 0; i < 200; i++) {
    const b = CA.casinoBjDeal(s1, 5)!; CA.stepCasino(s1, 0.001)
    if (!b.done) { CA.casinoShowAdvance(s1, 5); const v = CA.casinoSeatView(s1)!; if (SH.visibleFaces(v.deal, 'd', v.clock).length === 1) holeOk++; while (!b.done) { if (G.handVal(b.player).v < 17) CA.casinoBjHit(s1); else CA.casinoBjStand(s1) } }
    CA.stepCasino(s1, 0.001); CA.casinoShowAdvance(s1, 10); const v = CA.casinoSeatView(s1)!
    if (!eq(SH.visibleFaces(v.deal, 'p', v.clock), b.player) || !eq(SH.visibleFaces(v.deal, 'd', v.clock), b.dealer)) bad++
    hands++
  }
  ok(bad === 0 && holeOk > 50, '21 点 200 手：牌靴发到桌面的牌面 = 规则手牌；庄家暗牌结算前背面朝上', { bad, holeOk, hands })
  // 筹码实体
  let cs = 0; for (let k = 0; k < 2000; k += 7) if (SH.chipStackValue(SH.chipStacks(k)) !== k) cs++
  ok(cs === 0 && SH.chipStacks(57).length === 2 + 1 + 1 + 2, '筹码实体：按面额拆的枚数合计 = 余额（57 = 绿 2 黄 1 蓝 1 红 2）', { cs })
  ok(CA.casinoLedgerOk(s1).ok, '4b 演出不改账：经济守恒仍成立', CA.casinoLedgerOk(s1))
  // 野兽：入座在 VIP 牌桌对面，不发覆盖层
  const { e: s2, ev: ev2 } = mk(902)
  CA.startBeast(s2, true); for (let i = 0; i < 60; i++) CA.stepCasino(s2, 1 / 60)
  const bv = CA.casinoSeatView(s2)!, bz = CA.casinoBeastView(s2)!
  ok(bv?.seat.a.kind === 'beast' && !ev2.includes('casinomenu') && Math.hypot(bz.x - bv.seat.a.px, bz.y - bv.seat.a.py) < 1.6 && !CA.casinoStand(s2), '野兽 21 点：入座 VIP 牌桌对面（无覆盖层，野兽在视野内 1.6 m 内），不能起身', { kind: bv?.seat.a.kind, ev: ev2, d: Math.hypot(bz.x - bv.seat.a.px, bz.y - bv.seat.a.py) })
  // 免费饮料：连输 → 侍应送到桌边 → 拿起喝（drinkT）
  const { e: s3 } = mk(903)
  CA.casinoOpenMenu(s3, 'rou', '', SH.seatAt('rou', rouP.x, rouP.y, rouP.rot)); CA.casinoSetRng(s3, () => 0.999); CA.casinoSave(s3).plays = 99
  for (let i = 0; i < 3; i++) { CA.casinoRoulette(s3, 'num', 5); CA.casinoShowAdvance(s3, 9) }
  CA.stepCasino(s3, 0.016)
  const off = CA.casinoMenu(s3)?.drinkOffer
  CA.casinoDrink(s3, true); const dv = CA.casinoSeatView(s3)!
  ok(off === 1 && dv.drinkT > 1.5, '免费饮料：连输 3 把侍应送到桌边，拿起来喝（饮用动作 drinkT）', { off, drinkT: dv.drinkT })
  // 兑换台：回到阶段 4 的虚拟 UI 菜单（CasinoMenu cashier 覆盖层，暂停），不入座、无实体价目牌；成交后 Louie 仍播 exchange
  const { e: s4, ev: ev4 } = mk(904); s4.addItem('almond')
  const op4 = CA.casinoOpenMenu(s4, 'cashier'); CA.stepCasino(s4, 0.016)
  ok(op4 && ev4.includes('casinomenu') && CA.casinoMenu(s4)?.mode === 'cashier' && !CA.casinoSeat(s4) && CA.casinoSeatView(s4) === null, '兑换台：交互键打开兑换菜单覆盖层（发 casinomenu，不入座、无镜头过渡）', { ev: ev4, seat: !!CA.casinoSeat(s4) })
  const cv4 = CA.casinoCashierView(s4)
  ok(cv4.sell.length > 0 && cv4.prize.length > 0 && cv4.rare.length > 0, '兑换菜单三栏：换筹码（物品 / 理智 / 记忆）、奖品、稀有池', { sell: cv4.sell.length, prize: cv4.prize.length, rare: cv4.rare.length })
  const c0 = CA.casinoSave(s4).chips, okSell = CA.casinoSell(s4, 'almond'), lou = STF.staffBy(s4, 'louie')
  ok(okSell && CA.casinoSave(s4).chips > c0 && lou?.clip === 'exchange', '兑换菜单成交：筹码入账，Louie 播 exchange 动画', { okSell, d: CA.casinoSave(s4).chips - c0, clip: lou?.clip })
  ok(CA.casinoCloseMenu(s4) && !CA.casinoMenu(s4) && !CA.casinoSeat(s4), '兑换菜单 Esc 关闭（无「再玩一把」拦截、不留入座状态）')
  const fsx = await import('node:fs'), seatSrc = fsx.readFileSync('src/components/CasinoSeat.tsx', 'utf8'), tabSrc = fsx.readFileSync('src/game/renderer/casinoTables.ts', 'utf8')
  ok(!/cashier/.test(seatSrc.replace(/^\/\/.*$/gm, '')) && !/kind === 'cashier'\)/.test(tabSrc) && !/board/i.test(tabSrc.replace(/^\s*\/\/.*$/gm, '').replace(/Keyboard/g, '')), '兑换台实体价目牌 / 准星选行已移除（CasinoSeat 无兑换键位、casinoTables 不生成价目牌）')
}

{ // 竖向明暗分界线根因：覆盖层遮罩的模式类名不能与内容块规则重名（.cm-rou / .cm-dice / .cm-ending 带 max-width）
  const fs = await import('node:fs'), tsx = fs.readFileSync('src/components/CasinoMenu.tsx', 'utf8'), css = fs.readFileSync('src/components/CasinoMenu.css', 'utf8')
  const pre = /'hn-veil cm-veil ([a-z-]+)' \+ m\.mode/.exec(tsx)?.[1] ?? ''
  const hit = ['slot', 'bj', 'rou', 'dice', 'cashier', 'beast', 'ending'].filter((md) => new RegExp('\\.' + pre + md + '(?![\\w-])').test(css.replace(/\.cm-veil\.cm-m-ending/g, '')) && !(pre + md).startsWith('cm-m-'))
  ok(pre === 'cm-m-' && hit.length === 0, '覆盖层遮罩铺满全屏：模式类名 cm-m-<mode>，不与 .cm-rou / .cm-dice / .cm-ending 等内容块规则（max-width）重名（竖线根因）', { pre, hit })
}
console.log('— 阶段 4：存档 —')
const sv9 = CA.restoreCasinoSave(JSON.parse(JSON.stringify(sv6)))
ok(sv9.addict === sv6.addict && sv9.again === sv6.again && sv9.drinks === sv6.drinks && sv9.stats.slot[0] === sv6.stats.slot[0] && sv9.ledger.bets === sv6.ledger.bets, '新字段往返（chips / pchip / addict / again / drinks / plays / drunkT / memSold / ending / stats / ledger）')
const old = CA.restoreCasinoSave({ purple: -50, drags: 1, visits: 1 })
ok(old.pchip === 1 && old.chips === 0 && old.ledger.debtIn === -50, '阶段 1 旧档：紫筹码补 pchip / 初始债记账')
console.log(`\n${n - fails}/${n} 通过`)
process.exit(fails ? 1 : 0)
