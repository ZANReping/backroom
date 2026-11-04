/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// L5「恐怖旅馆」第一期 1a 无头验收（真实 Engine + 真实无限 L5 地图）。运行：npm run check:l5hotel
// 覆盖：换班时刻表（确定性 / 时长 / 预警 / 曲目）· 门时钟 / 活门 / 请勿打扰 / 门牌 · 关注度各来源与衰减 · 档位
//       · 换班 ×2 与客房豁免 · 床上休息 · 「先生」注视 · 噪音半径乘子 · 自洁（失物招领、视线判定、上限）
//       · 奥蒂斯取回 · 门扫描（时钟锁、久开自关）· 存档 / 新一局 / 登记簿跨局
import { createCanvas } from '@napi-rs/canvas'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const H = await import('../src/game/engine/l5Hotel')
const { snapshot } = await import('../src/game/engine/save')
const { audio } = await import('../src/game/core/audio')
const { l5RegionAt } = await import('../src/game/world/infiniteL5')
const MG = await import('../src/game/world/mapgen')
const walkableAt = (m: any, x: number, y: number) => MG.walkableAt(m, Math.floor(x), Math.floor(y), 0 as any)
const { HT } = H

const music: string[] = []
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (k !== 'constructor' && typeof (audio as any)[k] === 'function') (audio as any)[k] = () => {}
;(audio as any).hotelMusic = (mode: string) => { music.push(mode) }

let fails = 0, n = 0
const ok = (c: unknown, m: string, dbg?: unknown) => { n++; console.log(`${c ? '✔' : '✘'} ${m}${dbg !== undefined ? '  ' + JSON.stringify(dbg) : ''}`); if (!c) fails++ }
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps

// ---------------------------------------------------------------------------
console.log('— 换班时刻表 —')
{
  const seed = 9137
  const a = H.hotelShift(seed, 3000), b = H.hotelShift(seed, 3000)
  ok(JSON.stringify(a) === JSON.stringify(b), '同种子同时刻结果一致（纯函数）')
  // 扫 6 小时：统计各段长度
  const segs: { phase: string; len: number }[] = []
  let cur = H.hotelShift(seed, 0).phase, t0 = 0
  for (let t = 0; t <= 6 * 3600; t += 0.5) {
    const ph = H.hotelShift(seed, t).phase
    if (ph !== cur) { segs.push({ phase: cur, len: t - t0 }); cur = ph; t0 = t }
  }
  const shifts = segs.filter(s => s.phase === 'shift'), warns = segs.filter(s => s.phase === 'warn'), plays = segs.filter(s => s.phase === 'play')
  ok(shifts.length >= 28 && shifts.length <= 46, `6 小时内换班 ${shifts.length} 次（每 8–12 分钟一次）`)
  ok(shifts.every(s => near(s.len, HT.shiftLen, 0.6)), `每次换班 ${HT.shiftLen} s`)
  ok(warns.every(s => near(s.len, HT.shiftWarn, 0.6)), `跳针预警 ${HT.shiftWarn} s`)
  ok(plays.every(s => s.len >= HT.shiftEvery[0] - HT.shiftWarn - 1 && s.len <= HT.shiftEvery[1] - HT.shiftWarn + 1), '正常营业段长度在 7–11 分钟之间')
  const order = segs.map(s => s.phase).join(',')
  ok(!/shift,warn|play,shift|warn,play/.test(order), '顺序恒为 营业 → 跳针 → 换班 → 营业')
  // 曲目：每首 90–180 s，相邻不重复，5 首都会出现
  const seen = new Set<number>(); let last = -2, tl = 0, lens: number[] = [], bad = 0
  for (let t = 0; t < 3 * 3600; t += 0.5) {
    const s = H.hotelShift(seed, t)
    if (s.phase === 'shift') { last = -2; continue }
    if (s.tune !== last) { if (last >= 0 && s.tune === last) bad++; if (last >= 0) lens.push(t - tl); last = s.tune; tl = t; seen.add(s.tune) }
  }
  ok(seen.size === HT.tunes, `曲库 ${HT.tunes} 首都会播到`, [...seen])
  lens = lens.filter(l => l > 20) // 去掉被换班截断的残段
  ok(bad === 0 && lens.filter(l => l > HT.tuneLen[1] + 1).length === 0, '相邻曲目不重复、每首不超过 180 s')
  ok(H.hotelShift(1, 100).nextShift !== H.hotelShift(2, 100).nextShift, '不同种子换班时间不同')
}

console.log('— 门时钟 / 活门 / 请勿打扰 / 门牌 —')
{
  const seed = 5511
  let open = 0, tot = 0
  for (let d = 0; d < 400; d++) for (let t = 0; t < 7200; t += 30) { tot++; if (H.doorClockOpen(seed, d * 7, d * 3, t)) open++ }
  const frac = open / tot, expect = HT.doorOpenFrac * HT.doorOpenLen / HT.doorCycle
  ok(Math.abs(frac - expect) < 0.025, `上锁门自行解锁的时间占比 ${(frac * 100).toFixed(1)}%（期望约 ${(expect * 100).toFixed(1)}%）`)
  // 每次解锁窗口持续 120 s
  let run = 0, runs: number[] = []
  for (let t = 0; t < 36000; t += 1) { if (H.doorClockOpen(seed, 12, 34, t)) run++; else if (run) { runs.push(run); run = 0 } }
  ok(runs.length > 0 && runs.every(r => r <= HT.doorOpenLen + 1), `解锁窗口 ≤ ${HT.doorOpenLen} s（共 ${runs.length} 次）`)
  let live = 0, dnd = 0, bad13 = 0
  for (let x = 0; x < 200; x++) for (let y = 0; y < 50; y++) { if (H.isLiveDoor(seed, x, y)) live++; if (H.isDndDoor(seed, x, y)) dnd++; if (H.roomNumber(seed, x, y) % 100 === 13) bad13++ }
  ok(Math.abs(live / 10000 - HT.liveDoor) < 0.008, `活门约 ${HT.liveDoor * 100}%（实测 ${(live / 100).toFixed(1)}%）`)
  ok(Math.abs(dnd / 10000 - HT.dnd) < 0.008, `「请勿打扰」约 ${HT.dnd * 100}%（实测 ${(dnd / 100).toFixed(1)}%）`)
  ok(bad13 === 0, '门牌号从不以 13 结尾')
  const rn = H.roomNumber(seed, 3, 4); ok(rn >= 100 && rn <= 999, `门牌三位数（例 ${rn}）`)
  let flips = 0; for (let t = 0; t < 600; t++) if (H.liveDoorWantsOpen(seed, 8, 9, t) !== H.liveDoorWantsOpen(seed, 8, 9, t + 1)) flips++
  ok(flips >= 600 / (HT.liveMin + HT.liveSpan) - 1 && flips <= 600 / HT.liveMin + 1, `活门 10 分钟内开合 ${flips} 次（每 20–60 s 一次）`)
}

console.log('— 档位 —')
ok([0, 24.9, 25, 49, 50, 74, 75, 99, 100].map(H.l5Tier).join('') === '001122334', '五档阈值 25 / 50 / 75 / 100')

// ---------------------------------------------------------------------------
const SEED = 777
const fresh = (seed = SEED) => {
  const e: any = new Engine(); e.seed = seed
  e.loadLevel(5, { mapSeed: seed, firstVisit: true }); e.introT = 0
  e.emit = () => {}; e.persist = () => {}
  e.map.entities = []
  Object.assign(e.player, { hp: 100, sanity: 80, hunger: 100, thirst: 100, stamina: 100 })
  e.hotel = H.freshHotel()
  return e
}
/** 在玩家附近找一个满足条件的可走格 */
const findSpot = (e: any, want: (v: string | null) => boolean) => {
  const m = e.map, inf = m.inf
  for (let r = 0; r < 60; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
    const x = Math.floor(e.player.x) + dx + 0.5, y = Math.floor(e.player.y) + dy + 0.5
    if (x < 1 || y < 1 || x >= m.w - 1 || y >= m.h - 1 || !walkableAt(m, x, y)) continue
    const reg = l5RegionAt(inf.seed, x + (inf.ox ?? 0), y + (inf.oy ?? 0))
    if (want(reg?.variant ?? null)) return { x, y }
  }
  return null
}
const quietTime = (e: any) => { // 找一段离换班至少 5 分钟的营业时间
  for (let t = 10; t < 20000; t += 7) { const s = H.hotelShift(e.map.inf.seed, t); if (s.phase === 'play' && s.tLeft > 300) return t }
  return 10
}
const shiftTime = (e: any) => { for (let t = 10; t < 20000; t += 3) { const s = H.hotelShift(e.map.inf.seed, t); if (s.phase === 'shift' && s.tLeft > 20) return t } return 10 }

console.log('— 关注度 —')
{
  const e = fresh(), p = e.player
  ok(e.levelDef.id === 5 && !!e.map.inf, '真实无限 L5 地图已生成')
  const hall = findSpot(e, v => v === null || v === 'mainhall')
  ok(!!hall, '找到走廊 / 主厅落点')
  Object.assign(p, hall); e.time = quietTime(e)
  e.input.sprint = true; e.mv.sprintK = 1; e.mv.speed = 6
  for (let i = 0; i < 60; i++) H.updateHotel(e, 1 / 6)
  ok(near(e.hotel.attn, HT.attnRun * 10, 0.05), `走廊奔跑 10 s → +${(HT.attnRun * 10).toFixed(1)}（实测 ${e.hotel.attn.toFixed(2)}）`)
  e.input.sprint = false; e.mv.sprintK = 0; e.mv.speed = 3.4
  const a0 = e.hotel.attn
  for (let i = 0; i < 24; i++) H.updateHotel(e, 1 / 6)
  ok(near(a0 - e.hotel.attn, HT.attnDecay * 4, 0.02), `安静走路 4 s 衰减 ${HT.attnDecay * 4}`)
  const room = findSpot(e, v => v === 'guestroom')
  if (room) {
    e.hotel.attn = 10; Object.assign(p, room); e.input.sprint = true; e.mv.sprintK = 1; e.mv.speed = 6
    for (let i = 0; i < 30; i++) H.updateHotel(e, 1 / 6)
    ok(e.hotel.attn <= 10, '客房里奔跑不加关注度')
    e.input.sprint = false; e.mv.sprintK = 0
  } else ok(false, '找不到客房落点')
  // 枪声 / 撬锁 / 挥砍（经真实 noiseEvent）
  Object.assign(p, hall); e.hotel.attn = 0
  e.noiseEvent(p.x, p.y, 20, true); ok(near(e.hotel.attn, HT.attnGun), `枪声 +${HT.attnGun}`)
  e.hotel.attn = 0; e.noiseEvent(p.x, p.y, 14, true); ok(near(e.hotel.attn, HT.attnBreak), `撬锁 +${HT.attnBreak}`)
  e.hotel.attn = 0; e.noiseEvent(p.x, p.y, 8, false); ok(near(e.hotel.attn, HT.attnMelee), `挥砍打到东西 +${HT.attnMelee}`)
  e.hotel.attn = 0; e.noiseEvent(p.x, p.y, 4, false); e.noiseEvent(p.x, p.y, 10, true); ok(e.hotel.attn === 0, '普通脚步声不直接计入（奔跑由计时处理）')
  // 换班 ×2，客房豁免
  e.time = shiftTime(e); H.updateHotel(e, 0.01)
  ok(e.hotelShift.phase === 'shift', '进入换班阶段')
  e.hotel.attn = 0; e.noiseEvent(p.x, p.y, 20, true); ok(near(e.hotel.attn, HT.attnGun * HT.shiftMul), `换班时枪声 ×${HT.shiftMul}`)
  if (room) { Object.assign(p, room); e.hotel.attn = 0; e.noiseEvent(p.x, p.y, 20, true); ok(near(e.hotel.attn, HT.attnGun), '待在客房里不受换班加成') }
  Object.assign(p, hall)
  ok(near(H.hotelHearMul(e), HT.hearShift), `换班时实体听觉 ×${HT.hearShift}`)
  e.hotel.attn = 80; ok(near(H.hotelHearMul(e), HT.hearShift * HT.hearClean), `「清理」档再 ×${HT.hearClean}`)
  ok(music.includes('shift'), '换班时唱机停唱（audio.hotelMusic shift）')
  for (let i = 0; i < 40; i++) H.updateHotel(e, 0.1)
  ok(e.hotelLightMul < 0.8 && e.hotelLightMul > 0.65, `换班时灯光压暗到约 ${1 - HT.shiftDim}（实测 ${e.hotelLightMul.toFixed(2)}）`)
  // 维修大厅（员工区）
  let staff = findSpot(e, v => v === 'maintenance'), es = e
  for (let sd = 1; !staff && sd < 40; sd++) { es = fresh(sd * 97); staff = findSpot(es, v => v === 'maintenance') }
  if (staff) { const e = es, p = e.player; e.time = quietTime(e); Object.assign(p, staff); e.hotel.attn = 0; for (let i = 0; i < 60; i++) H.updateHotel(e, 1 / 6); ok(near(e.hotel.attn, (HT.attnStaff - HT.attnDecay) * 10, 0.05), `维修大厅逗留 10 s 净增 ${((HT.attnStaff - HT.attnDecay) * 10).toFixed(1)}`) }
  else ok(false, '40 个种子里都找不到维修大厅')
  // 注视
  Object.assign(p, hall); e.time = quietTime(e); e.hotel.attn = 99.9; p.sanity = 80
  e.noiseEvent(p.x, p.y, 20, true); H.updateHotel(e, 0.01)
  { // [beast] 阶段 3：关注度满不再是全屏注视，改为野兽现身（熄灯 → 背后缠抓 → 拖进办公室）；旧注视保留为退路（hotelGaze 直接调用）
    const BA = await import('../src/game/engine/beastAI')
    ok(BA.beastDebug(e).pun?.reason === 'attn' && e.hotelGazeT <= 0, '关注度满：野兽现身（熄灯，取代旧的全屏注视）')
    const g0 = e.hotelBook.gazes; H.hotelGaze(e)
    ok(near(e.hotel.attn, HT.gazeDrop, 0.01) && near(p.sanity, 80 - HT.gazeSanity, 0.1) && e.hotelGazeT > 2 && e.hotelBook.gazes === g0 + 1, `旧注视（退路）：理智 −${HT.gazeSanity}，回落到 ${HT.gazeDrop}，全屏注视 2 s`)
    e.hotelBook.gazes = g0
  }
  ok(e.hotelBook.gazes === 1, '登记簿记下一次注视')
}

console.log('— 床上休息 —')
{
  const e = fresh(), p = e.player
  const bed = e.map.structures.find((s: any) => s.kind === 'bed' && Math.hypot(s.x - p.x, s.y - p.y) < 80)
  ok(!!bed, '附近有客房木床')
  if (bed) {
    ok(H.hotelCanRest(e, bed), '床可以躺下')
    e.time = quietTime(e); e.hotel.attn = 40; p.sanity = 50
    H.hotelToggleRest(e, bed); ok(H.hotelResting(e), '躺下')
    for (let i = 0; i < 100; i++) H.updateHotel(e, 0.1)
    ok(near(e.hotel.attn, 40 - HT.attnRest * 10, 0.05) && near(p.sanity, 50 + HT.restSanity * 10, 0.05), `休息 10 s：关注度 −${HT.attnRest * 10}、理智 +${HT.restSanity * 10}`)
    p.x += 1; H.updateHotel(e, 0.1); ok(!H.hotelResting(e), '一走动就起身')
  }
}

console.log('— 自洁 / 失物招领 —')
{
  const e = fresh(), p = e.player
  const hall = findSpot(e, v => v === null || v === 'mainhall')!
  Object.assign(p, hall, { facing: 0 }); e.time = quietTime(e)
  e.player.hotbar[0] = { type: 'silverware', count: 2 }; e.player.selected = 0
  e.dropSlot('hotbar', 0)
  const it = e.map.items.find((i: any) => i.type === 'silverware' && i.dropped !== undefined)
  ok(!!it && near(it.dropped, e.time), '丢下的物品带 dropped 时间戳')
  // 站在旁边看着：不清
  for (let i = 0; i < 4 * 200; i++) { e.time += 0.25; H.updateHotel(e, 0.25) }
  ok(e.map.items.includes(it), '在旁边看着时 200 s 也不清除')
  // 走开 30 m 背对：180 s 后进失物招领
  const far = findSpot(e, v => v === null)
  let away: any = null
  for (const s of [far]) if (s) away = s
  // 找一个离物品 > 12 m 的点
  for (let k = 0; k < 400 && (!away || Math.hypot(away.x - it.x, away.y - it.y) < 12); k++) { const x = it.x + (Math.random() - 0.5) * 60, y = it.y + (Math.random() - 0.5) * 60; if (x > 1 && y > 1 && x < e.map.w - 1 && y < e.map.h - 1 && walkableAt(e.map, x, y)) away = { x, y } }
  Object.assign(p, away); p.facing = Math.atan2(p.y - it.y, p.x - it.x) // 背对物品
  for (let i = 0; i < 4 * 170; i++) { e.time += 0.25; H.updateHotel(e, 0.25) }
  ok(e.map.items.includes(it), '没人看 170 s：还在')
  for (let i = 0; i < 4 * 20; i++) { e.time += 0.25; H.updateHotel(e, 0.25) }
  ok(!e.map.items.includes(it) && e.hotel.lost.some((l: any) => l.type === 'silverware' && l.count === 2), '没人看 180 s：收进失物招领（数量保留）')
  // 生成物品不受影响
  const gen = e.map.items.filter((i: any) => i.dropped === undefined).length
  ok(gen > 0, `地图生成的物品（${gen} 件）不带 dropped，不会被收走`)
  // 上限
  for (let i = 0; i < 50; i++) H.hotelLose(e, { id: i, type: 'sedative', x: 0, y: 0 } as any)
  ok(e.hotel.lost.length === HT.lostCap && e.hotel.lost[0].type === 'sedative', `失物上限 ${HT.lostCap} 件，先进先出`)
  // 取回
  e.hotel.lost = [{ type: 'silverware', count: 2, t: 1 }]
  e.player.hotbar = e.player.hotbar.map(() => null); e.player.backpack = e.player.backpack.map(() => null)
  const r0 = H.hotelReclaim(e, 0)
  ok(e.hotel.lost.length === 1 && /杏仁水/.test(r0), '没有杏仁水：奥蒂斯不给')
  e.player.hotbar[0] = { type: 'almond', count: 1 }
  H.hotelReclaim(e, 0)
  ok(e.hotel.lost.length === 0 && e.countItem('silverware') === 2 && e.countItem('almond') === 0, '付 1 瓶杏仁水取回 ×2')
}

console.log('— 门扫描 —')
{
  let e = fresh(), doors: any[] = []
  for (let sd = 0; sd < 40; sd++) {
    if (sd) e = fresh(sd * 131)
    e.time = quietTime(e); H.updateHotel(e, 0.3)
    doors = e.map.structures.filter((s: any) => s.kind === 'hoteldoor' && s.data?.hotelInit === 1)
    if (doors.some((s: any) => s.data.baseLock === 1) && doors.some((s: any) => !s.data.baseLock && !s.data.live)) break
  }
  const p = e.player, m = e.map, inf = m.inf
  ok(doors.length > 0, `附近 ${doors.length} 扇房门已挂上门牌`)
  ok(doors.every((s: any) => typeof s.data.room === 'number'), '每扇门都有号码')
  const lock = doors.find((s: any) => s.data.baseLock === 1)
  if (lock) {
    const wx = Math.floor(lock.x + (inf.ox ?? 0)), wy = Math.floor(lock.y + (inf.oy ?? 0))
    let agree = 0, tot = 0
    for (let t0 = e.time, t = t0; t < t0 + 1800; t += 13) { e.time = t; H.updateHotel(e, 0.3); tot++; if ((lock.data.locked === 0) === H.doorClockOpen(inf.seed, wx, wy, t)) agree++ }
    ok(agree === tot, `原上锁门按门时钟锁 / 解锁（${tot} 个时刻全部一致）`)
  } else ok(false, '40 个种子里附近都没有上锁门')
  const plain = doors.find((s: any) => !s.data.baseLock && !s.data.live)
  if (plain) {
    plain.data = { ...plain.data, open: 1 }; plain.solid = false
    // 离门远一点并背对
    Object.assign(p, { x: plain.x + 0.5, y: plain.y + 0.5 })
    let away: any = null
    for (let k = 0; k < 2000 && !away; k++) { const x = plain.x + (Math.random() - 0.5) * 50, y = plain.y + (Math.random() - 0.5) * 50; if (x > 1 && y > 1 && x < m.w - 1 && y < m.h - 1 && walkableAt(m, x, y) && Math.hypot(x - plain.x, y - plain.y) > 10 && Math.hypot(x - plain.x, y - plain.y) < 22) away = { x, y } }
    Object.assign(p, away); p.facing = Math.atan2(p.y - plain.y, p.x - plain.x)
    for (let i = 0; i < 4 * 290; i++) { e.time += 0.25; H.updateHotel(e, 0.25) }
    ok(plain.data.open === 1, '开着的门 290 s：还开着')
    for (let i = 0; i < 4 * 20; i++) { e.time += 0.25; H.updateHotel(e, 0.25) }
    ok(plain.data.open === 0 && plain.solid === true, '没人看 300 s 后门自己关上')
  }
}

console.log('— 存档 / 新一局 / 登记簿 —')
{
  const e = fresh()
  e.hotel.attn = 42; e.hotel.lost = [{ type: 'silverware', count: 1, t: 1 }]
  const snap: any = snapshot(e)
  ok(snap.hotel?.attn === 42 && snap.hotel.lost.length === 1, '快照包含酒店局内状态')
  const e2: any = new Engine(); e2.hotel = H.restoreHotel(JSON.parse(JSON.stringify(snap.hotel)))
  ok(e2.hotel.attn === 42 && e2.hotel.lost[0].type === 'silverware', '读档恢复关注度与失物')
  ok(H.restoreHotel({ attn: 999 }).attn === 100 && H.restoreHotel(null).attn === 0, '异常存档被钳制 / 回落默认')
  e.time = quietTime(e); H.updateHotel(e, 0.1)
  const book = JSON.parse(memory.get('br_hotel_book') ?? '{}')
  ok(book.firstEntry > 0 && book.floors.includes(1), '登记簿写入 localStorage（首次入住、到访 1F）')
  e.newRun?.()
  ok(e.hotel.attn === 0 && e.hotel.lost.length === 0, '新一局：关注度与失物清零')
  ok(H.loadBook().firstEntry === book.firstEntry, '登记簿跨局保留')
}


// =====================================================================
// 1b 空间
// =====================================================================
const IL5 = await import('../src/game/world/infiniteL5')
const EV = await import('../src/game/engine/l5Elevator')
const { nextMapSeed } = await import('../src/game/engine/level')

console.log('— 楼层权重 —')
{
  const tally = (floor: number) => {
    IL5.setL5Floor(floor)
    const c: Record<string, number> = {}
    for (let hk = -30; hk <= 30; hk++) for (let hr = -30; hr <= 30; hr++) { const v = IL5.l5HallAt(4242, hk, hr) ?? 'block'; c[v] = (c[v] ?? 0) + 1 }
    for (let k = -40; k <= 40; k++) for (let r = -40; r <= 40; r++) { if (IL5.l5HallAt(4242, k >> 1, r >> 1)) continue; const v = IL5.l5BlockBiome(4242, k, r); c[v] = (c[v] ?? 0) + 1 }
    return c
  }
  // 1F 与原公式逐格一致
  IL5.setL5Floor(1)
  const { h32 } = await import('../src/game/world/infinite')
  const f01 = (...n: number[]) => h32(...n) / 4294967296
  let same = 0, tot = 0
  for (let hk = -20; hk <= 20; hk++) for (let hr = -20; hr <= 20; hr++) {
    if (hk === 0 && hr === 0) continue
    tot++
    const old = f01(4242, 0x5b20, hk, hr) >= 0.5 ? null : (v => v < 0.5 ? 'mainhall' : v < 0.75 ? 'dining' : v < 0.8 ? 'maintenance' : 'beverly')(f01(4242, 0x5b21, hk, hr))
    if (old === IL5.l5HallAt(4242, hk, hr)) same++
  }
  ok(same === tot, `1F 区域分布与改动前逐格一致（${same}/${tot}）`)
  const c1 = tally(1), c2 = tally(2), c3 = tally(3), c4 = tally(4), c0 = tally(0), c5 = tally(5)
  const frac = (c: Record<string, number>, k: string, of: string[]) => (c[k] ?? 0) / of.reduce((s, x) => s + (c[x] ?? 0), 0)
  const rooms = ['guestroom', 'lounge', 'gym', 'pool'], halls = ['mainhall', 'dining', 'maintenance', 'beverly']
  ok(frac(c2, 'guestroom', rooms) > frac(c1, 'guestroom', rooms) * 1.3, `2F 客房层：客房占比 ${(frac(c2, 'guestroom', rooms) * 100).toFixed(0)}% > 1F ${(frac(c1, 'guestroom', rooms) * 100).toFixed(0)}%`)
  ok(frac(c3, 'dining', halls) > frac(c1, 'dining', halls) * 1.8, `3F 餐饮层：餐厅 ${(frac(c3, 'dining', halls) * 100).toFixed(0)}%（1F ${(frac(c1, 'dining', halls) * 100).toFixed(0)}%）`)
  ok(frac(c4, 'beverly', halls) > frac(c1, 'beverly', halls) * 2, `4F 宴会层：贝弗莉室 ${(frac(c4, 'beverly', halls) * 100).toFixed(0)}%（1F ${(frac(c1, 'beverly', halls) * 100).toFixed(0)}%）`)
  ok(frac(c5, 'pool', rooms) + frac(c5, 'gym', rooms) > (frac(c1, 'pool', rooms) + frac(c1, 'gym', rooms)) * 1.5, '5F 休闲层：泳池 + 健身房明显增多')
  ok(frac(c0, 'maintenance', halls) > 0.45, `B1：维修大厅（含锅炉房）占大厅 ${(frac(c0, 'maintenance', halls) * 100).toFixed(0)}%`)
  ok(Object.keys(IL5.L5_FLOORS).length === 13 && IL5.L5_FLOORS[11].silent === true, '共 13 层（B1 + 1–12），11F 是静默层')
  IL5.setL5Floor(1)
}

console.log('— 电梯 —')
{
  const e = fresh(4242), p = e.player
  e.emit = () => {}
  ok(e.hotel.floor === 1 && IL5.getL5Floor() === 1, '从别的层级进来：1F')
  ok(e.map.exits.some((x: any) => x.def.kind === 'oldstairs'), '1F 有古典楼梯（→L4）')
  const elev = e.map.exits.find((x: any) => x.def.kind === 'elevatorshaft')
  ok(!!elev, '出生主厅有电梯')
  EV.openElevator(e, 'main', elev.def)
  ok(!!EV.elevatorView(e) && EV.elevatorView(e)!.floorName === '1F', '打开黄铜面板')
  EV.elevatorGo(e, 0); ok(/没有地下一层/.test(EV.elevatorView(e)!.msg), '主电梯没有 B1')
  EV.elevatorGo(e, 1); ok(/已经在/.test(EV.elevatorView(e)!.msg), '按本层：提示已在本层')
  EV.elevatorKey(e, '5'); ok(EV.elevatorView(e)!.entry === '5', '键盘输入 5')
  EV.elevatorKey(e, 'OK')
  ok(e.hotel.floor === 5 && e.transition?.dest === 5 && e.arriveElevator, '确认后去 5F（同层级切图，电梯落点）')
  ok(!EV.elevatorView(e), '面板关闭')
  const s5 = nextMapSeed(e, 5), s5b = nextMapSeed(e, 5)
  ok(s5 === s5b, '同一局里 5F 的地图种子固定（回访是同一层）')
  e.transition = null
  e.loadLevel(5); e.introT = 0
  ok(IL5.getL5Floor() === 5 && e.hotel.floor === 5, '载入 5F')
  ok(!e.map.exits.some((x: any) => x.def.kind === 'oldstairs'), '5F 没有古典楼梯')
  const el5 = e.map.exits.find((x: any) => x.def.kind === 'elevatorshaft')
  ok(!!el5 && Math.hypot(el5.x - p.x, el5.y - p.y) < 5, '出生在本层电梯旁')
  e.time = quietTime(e); H.updateHotel(e, 0.1)
  ok(e.hotelBook.floors.includes(5), '登记簿记下到访 5F')
  // 维护电梯
  EV.openElevator(e, 'service')
  EV.elevatorGo(e, 3); ok(/只停/.test(EV.elevatorView(e)!.msg), '维护电梯不停 3F')
  const rnd = Math.random; (Math as any).random = () => 0.05
  const hp0 = p.hp; EV.elevatorGo(e, 6); (Math as any).random = rnd
  ok(e.hotel.floor !== 6 && p.hp === hp0 - EV.EL.serviceFailDmg, `维护电梯故障（15%）：落到 ${e.hotel.floor}F、掉 ${EV.EL.serviceFailDmg} 血`)
  e.transition = null
  // 13 楼
  let died = ''; e.die = (c: string) => { died = c }
  EV.openElevator(e, 'main', el5?.def); EV.elevatorGo(e, 13)
  ok(e.hotelVanishT > 3 - 0.01, '按 13：电梯上升，开始失踪倒计时')
  for (let i = 0; i < 40; i++) H.updateHotel(e, 0.1)
  ok(/13 楼失踪/.test(died), `3 秒后按普通死亡处理：「${died}」`)
  e.hotelVanishT = 0; died = ''
  EV.openElevator(e, 'main', el5?.def); EV.elevatorKey(e, '2'); EV.elevatorKey(e, '0'); EV.elevatorKey(e, 'OK')
  ok(e.hotelVanishT > EV.EL.climbT, '输入 20：先无尽上升')
  for (let i = 0; i < 100; i++) H.updateHotel(e, 0.1)
  ok(/20 楼失踪/.test(died), '同样失踪')
  e.hotelVanishT = 0
  // 11F 静默
  e.hotel.floor = 11
  ok(near(H.hotelHearMul(e, 4), 0.5) && near(H.hotelHearMul(e, 20), 1), '11F：脚步声半径 ×0.5，枪声不变')
  e.hotel.floor = 5
  ok(H.restoreHotel({ floor: 99 }).floor === 1 && H.restoreHotel({ floor: 0 }).floor === 0, '存档楼层钳制（B1 合法）')
}

/** 找一个有某种结构的楼层地图 */
const mapWith = (floor: number, test: (e: any) => boolean) => {
  for (let sd = 1; sd < 60; sd++) {
    const e: any = new Engine(); e.seed = sd * 313
    e.emit = () => {}
    e.hotel.floor = floor
    e.loadLevel(5, { mapSeed: sd * 313 + floor, firstVisit: true }); e.introT = 0
    e.map.entities = []
    Object.assign(e.player, { hp: 100, sanity: 80, hunger: 100, thirst: 100, stamina: 100 })
    if (test(e)) return e
  }
  return null
}

console.log('— 贝弗莉室 —')
{
  const e = mapWith(4, e => e.map.structures.some((s: any) => s.kind === 'l5walldoor') && e.map.structures.some((s: any) => s.kind === 'oddtable'))
  ok(!!e, '4F 找到贝弗莉室')
  if (e) {
    const p = e.player, walls = e.map.structures.filter((s: any) => s.kind === 'l5walldoor'), floors = e.map.structures.filter((s: any) => s.kind === 'l5floordoor')
    ok(walls.length >= 20, `门墙：${walls.length} 扇贴墙门；活板门 ${floors.length} 扇；倒挂门 ${e.map.structures.filter((s: any) => s.kind === 'l5ceildoor').length} 扇`)
    const goFrac = walls.filter((s: any) => s.data.go).length / walls.length
    ok(goFrac > 0.05 && goFrac < 0.32, `约 1/6 能推开（实测 ${(goFrac * 100).toFixed(0)}%）`)
    ok(walls.every((s: any) => MG.walkableAt(e.map, s.x, s.y, 0 as any)), '墙门都贴在可站的地板格上（不压墙）')
    const shut = walls.find((s: any) => !s.data.go), go = walls.find((s: any) => s.data.go) ?? floors.find((s: any) => s.data.go)
    Object.assign(p, { x: shut.x + 0.5, y: shut.y + 0.5 })
    H.hotelBevDoor(e, shut); ok(near(p.x, shut.x + 0.5), '打不开的门：门后是砖墙，人不动')
    if (go) {
      const x0 = go.x + 0.5, y0 = go.y + 0.5; Object.assign(p, { x: x0, y: y0 })
      H.hotelBevDoor(e, go)
      const moved = Math.hypot(p.x - x0, p.y - y0)
      const v = IL5.l5RegionAt(e.map.inf.seed, p.x + e.map.inf.ox, p.y + e.map.inf.oy)?.variant
      ok(moved > 12 && ['mainhall', 'boilerroom', 'lounge'].includes(String(v)) && e.photoFlashT > 0, `能开的门：白闪后到了 ${v}（${moved.toFixed(0)} m 外）`)
      ok(walkableAt(e.map, p.x, p.y), '落点可站')
    }
    // 麻将桌
    const tb = e.map.structures.find((s: any) => s.kind === 'oddtable')
    Object.assign(p, { x: tb.x + 0.5 + 1.0, y: tb.y + 0.5, sanity: 80 })
    const d0 = Math.hypot(p.x - tb.x - 0.5, p.y - tb.y - 0.5)
    e.time = quietTime(e)
    for (let i = 0; i < 10; i++) H.updateHotel(e, 0.1)
    const d1 = Math.hypot(p.x - tb.x - 0.5, p.y - tb.y - 0.5)
    ok(near(d1 - d0, H.HT.mahjongPush, 0.15) && p.sanity < 80 - 1.5, `麻将桌 2.5 m 内：1 s 被推开 ${(d1 - d0).toFixed(2)} m，理智 −${(80 - p.sanity).toFixed(1)}`)
    // 取牌：硬顶着（每帧抵消推力）按住 4 s
    Object.assign(p, { x: tb.x + 0.5 + 1.2, y: tb.y + 0.5 }); e.specialHeld = true
    const fixX = p.x
    for (let i = 0; i < 45; i++) { p.x = fixX; H.updateHotel(e, 0.1) }
    ok(e.hotel.tile === 1 && e.countItem('mahjongtile') === 1, '顶着推力按住 4 s：拿到麻将牌（理智 −15、关注度 +10）')
    for (let i = 0; i < 45; i++) { p.x = fixX; H.updateHotel(e, 0.1) }
    ok(e.countItem('mahjongtile') === 1, '每局只能拿一次')
    e.specialHeld = false
  }
}

console.log('— 肖像 —')
{
  const e = mapWith(1, e => e.map.structures.some((s: any) => s.kind === 'bigpainting' && s.data?.gaze))
  ok(!!e, '主厅墙上有会看人的肖像')
  if (e) {
    const ps = e.map.structures.filter((s: any) => s.kind === 'bigpainting' && s.data?.gaze)
    ok(ps.every((s: any) => s.data.face >= 0 && s.data.face < 9), `9 张面孔（l5tails 由 6 张扩到 9 张）（本图 ${new Set(ps.map((s: any) => s.data.face)).size} 种）`)
    const s = ps[0], p = e.player
    // 站到画前 3 m 正对
    let spot: any = null
    for (const [dx, dy] of [[0, 3], [0, -3], [3, 0], [-3, 0]]) if (!spot && walkableAt(e.map, s.x + 0.5 + dx, s.y + 0.5 + dy) && e.los(s.x + 0.5 + dx, s.y + 0.5 + dy, s.x + 0.5, s.y + 0.5)) spot = { x: s.x + 0.5 + dx, y: s.y + 0.5 + dy }
    ok(!!spot, '画前有站位')
    if (spot) {
      Object.assign(p, spot, { sanity: 80 }); p.facing = Math.atan2(s.y + 0.5 - p.y, s.x + 0.5 - p.x)
      e.time = quietTime(e); e.hotel.attn = 0
      for (let i = 0; i < 25; i++) H.updateHotel(e, 0.1)
      ok(e.hotel.attn === 0 && p.sanity === 80, '盯 2.5 s：还没事')
      for (let i = 0; i < 20; i++) H.updateHotel(e, 0.1)
      ok(e.hotel.attn > 1.5 && p.sanity < 79, `盯满 3 s 后：关注度 +${e.hotel.attn.toFixed(1)}、理智 −${(80 - p.sanity).toFixed(1)}`)
      e.interactTarget = { kind: 'bigpainting', label: '', s }
      ok(H.hotelSpecial(e)?.id === 'hotelFlip', 'X 情境：「翻过去」')
      const a0 = e.hotel.attn; e.specialPressed = true; H.updateHotel(e, 0.01)
      ok(s.data.flipped === 1 && e.hotel.attn >= a0 + 2.9, '翻过去：关注度 +3')
      const a1 = e.hotel.attn, s1 = p.sanity
      for (let i = 0; i < 50; i++) H.updateHotel(e, 0.1)
      ok(p.sanity === s1 && e.hotel.attn <= a1, '翻过去的画不再起作用')
    }
  }
}

console.log('— 锅炉房 —')
{
  const P = H.HT.steam
  let jet = 0, hiss = 0, idle = 0
  for (let t = 0; t < 900; t += 0.05) { const ph = H.steamPhase(77, 3, 4, t); if (ph === 'jet') jet++; else if (ph === 'hiss') hiss++; else idle++ }
  const T = jet + hiss + idle
  ok(near(idle / T, P[0] / 9, 0.01) && near(hiss / T, P[1] / 9, 0.01) && near(jet / T, P[2] / 9, 0.01), '蒸汽阀循环 静止 6 s → 嘶声 1 s → 喷射 2 s')
  ok(H.inSteamCone(11.5, 10, 10, 10, 1) && !H.inSteamCone(8.5, 10, 10, 10, 1) && !H.inSteamCone(13, 10, 10, 10, 1) && !H.inSteamCone(11, 11.5, 10, 10, 1), '2.5 m 锥形：只烫正前方')
  const e = mapWith(0, e => e.map.structures.some((s: any) => s.kind === 'pipes' && s.data?.steam === 1) && e.map.structures.some((s: any) => s.kind === 'valve'))
  ok(!!e, 'B1 找到带蒸汽阀口的锅炉房')
  if (e) {
    const p = e.player, pipe = e.map.structures.find((s: any) => s.kind === 'pipes' && s.data?.steam === 1)
    const inf = e.map.inf, dir = pipe.data.dir
    Object.assign(p, { x: pipe.x + 0.5 + dir * 1.2, y: pipe.y + 0.5, hp: 100 })
    let t = 0; while (H.steamPhase(inf.seed, Math.floor(pipe.x + inf.ox), Math.floor(pipe.y + inf.oy), t) !== 'jet') t += 0.05
    e.time = t + 0.05
    for (let i = 0; i < 10; i++) { e.time += 0.1; H.updateHotel(e, 0.1) }
    const v = IL5.l5RegionAt(inf.seed, p.x + inf.ox, p.y + inf.oy)?.variant
    ok(p.hp < 100 - H.HT.steamDmg * 0.8 && p.hp > 100 - H.HT.steamDmg * 1.2 - 2, `站在喷口前 1 s：−${(100 - p.hp).toFixed(1)} 生命（${v}）`)
    // 高温
    const th0 = p.thirst; Object.assign(p, { hp: 100 })
    if (v === 'boilerroom') {
      e.time = 0; for (let i = 0; i < 100; i++) H.updateHotel(e, 0.1)
      ok(near(th0 - p.thirst, 0.28 * (H.HT.heatThirst - 1) * 10, 0.05), `锅炉房高温：10 s 额外口渴 ${(th0 - p.thirst).toFixed(2)}`)
    } else console.log('  （喷口落在锅炉房外，跳过高温项）')
    // 杏仁水排气阀
    const valve = e.map.structures.find((s: any) => s.kind === 'valve')
    e.time = 5000; e.player.hotbar = e.player.hotbar.map(() => null); e.player.backpack = e.player.backpack.map(() => null)
    ok(H.hotelValveAlmond(e, valve) && e.countItem('almond') === 1, '拧开排气阀：接到 1 瓶杏仁水')
    H.hotelValveAlmond(e, valve); ok(e.countItem('almond') === 1, '10 分钟内再拧：没有')
    e.time += 601; H.hotelValveAlmond(e, valve); ok(e.countItem('almond') === 2, '10 分钟后又有一瓶')
  }
}

// ===========================================================================
// 1c：住客须知 / 灯光同时闪烁 → 木门 / 口袋房间（野兽办公室、大堂）
// ===========================================================================
const R = await import('../src/game/content/l5Rules')
console.log('— 住客须知 —')
{
  ok(R.L5_RULES.filter((r) => r.truth).length === 8 && R.L5_RULES.filter((r) => !r.truth).length === 5, '守则池：8 条真 + 5 条假')
  let allOk = true, distinct = new Set<string>()
  for (let sd = 1; sd < 40; sd++) for (let f = 0; f <= 12; f++) {
    const rs = R.floorRules(sd, f)
    const t = rs.filter((id) => R.L5_RULE[id].truth).length
    if (rs.length !== 8 || t !== 6 || new Set(rs).size !== 8) allOk = false
    distinct.add(rs.slice().sort().join())
  }
  ok(allOk, '每层 8 条：6 真 2 假，不重复')
  ok(distinct.size > 50, `不同种子/楼层抽到不同组合（${distinct.size} 种）`)
  ok(JSON.stringify(R.floorRules(5, 3)) === JSON.stringify(R.floorRules(5, 3)), '楼层守则是纯函数')
  let tellOk = true, fakeN = 0, trueN = 0, no13 = true
  for (let x = 0; x < 300; x++) {
    const c = R.ruleCardAt(77, 2, x, x * 7 % 53)
    if (c.fake) { fakeN++; if (!(c.tellName || c.tellRoom)) tellOk = false; if (c.tellRoom && c.room.length !== 4) tellOk = false }
    else { trueN++; if (c.tellName || c.tellRoom || c.room.length !== 3) tellOk = false }
    if (!c.tellRoom && c.room.endsWith('13')) no13 = false
  }
  ok(tellOk, `假卡必有破绽（旅舘 / 四位数房号），真卡没有（真 ${trueN} 张、假 ${fakeN} 张）`)
  ok(fakeN > 30 && trueN > 150, '真假比例约 3:1')
  ok(no13, '真卡房号不以 13 结尾')
  ok(JSON.stringify(R.ruleCardAt(1, 1, 10, 20)) === JSON.stringify(R.ruleCardAt(1, 1, 10, 20)), '同一张卡每次读都一样')
  // 生成：走廊卡 + 客房桌卡
  let wall = 0, table = 0, okWall = true
  for (let sd = 1; sd < 6; sd++) {
    const e = fresh(sd * 101)
    for (const s of e.map.structures) if (s.kind === 'l5rule') {
      if (s.data?.ontable) { table++; if (!e.map.structures.some((q: any) => q.kind === 'table' && q.x === s.x && q.y === s.y)) okWall = false }
      else { wall++; const inf = e.map.inf; if (IL5.l5RegionAt(inf.seed, s.x + inf.ox, s.y + inf.oy)?.variant != null) okWall = false }
    }
  }
  ok(wall > 10 && table > 5, `地图里有走廊守则卡 ${wall} 张、客房桌卡 ${table} 张`)
  ok(okWall, '走廊卡只贴走廊墙，桌卡都在客房桌上')
  // 阅读
  const e = fresh(4242), memo: any[] = []
  e.emit = (x: any) => memo.push(x)
  const cards = e.map.structures.filter((s: any) => s.kind === 'l5rule')
  const inf = e.map.inf
  const cardOf = (s: any) => R.ruleCardAt(inf.seed, e.hotel.floor, s.data.wx, s.data.wy)
  const tc = cards.find((s: any) => !cardOf(s).fake), fc = cards.find((s: any) => cardOf(s).fake)
  ok(!!tc, '找到一张真卡')
  if (tc) {
    e.hotel.attn = 20
    const c = H.hotelReadRule(e, tc)!
    ok(memo.some((x) => x.kind === 'hotelnotice' && JSON.parse(x.text).rule === c.rule), '阅读弹出住客须知卡视图（卡面内容一致）')
    ok(near(e.hotel.attn, 20 - HT.attnRuleTrue), `首次读到真规则：关注度 −${HT.attnRuleTrue}`)
    ok(e.hotelBook.rules[c.rule] === 'seen', '登记簿记为「未核实」')
    H.hotelReadRule(e, tc); ok(near(e.hotel.attn, 20 - HT.attnRuleTrue), '再读同一条不再减')
  }
  if (fc) {
    const a0 = e.hotel.attn
    const c = H.hotelReadRule(e, fc)!
    ok(c.fake && near(e.hotel.attn, a0) && e.hotelBook.rules[c.rule] === 'seen', '读到假规则：不减关注度，同样记「未核实」')
  } else console.log('  （本图没有假卡，跳过）')
  // 验证
  const e2 = fresh(4243)
  ok(!H.hotelRuleProve(e2, 'gaze'), '没读过的守则不会被「验证」')
  e2.hotelBook.rules.gaze = 'seen'
  ok(H.hotelRuleProve(e2, 'gaze') && e2.hotelBook.rules.gaze === 'true', '读过后被实际判定验证 → 已核实为真')
  e2.hotelBook.rules.desk13 = 'seen'
  H.hotelRuleProve(e2, 'desk13'); ok(e2.hotelBook.rules.desk13 === 'false', '假规则被证伪 → 已核实为假')
  // 奔跑验证
  e2.hotelBook.rules.run = 'seen'; e2.hotel.attn = 30
  const sp = findSpot(e2, (v) => v === null)
  if (sp) {
    Object.assign(e2.player, { x: sp.x, y: sp.y })
    e2.input.sprint = true; e2.mv.sprintK = 1; e2.mv.speed = 6; e2.time = quietTime(e2)
    H.updateHotel(e2, 0.2)
    ok(e2.hotelBook.rules.run === 'true', '读过「请勿奔跑」后在走廊奔跑（关注度 ≥25）→ 已核实')
    e2.input.sprint = false
  }
  // 存档
  const h = H.restoreHotel({ read: ['run', 3, 'gaze'], pocket: { kind: 'lobby', floor: 4, mapSeed: 99 } })
  ok(h.read.join() === 'run,gaze' && h.pocket?.kind === 'lobby' && h.pocket.floor === 4, '存档：已读条目与口袋房间返程可恢复')
}

console.log('— 灯光同时闪烁 → 木门 —')
{
  ok(near(H.flickerRate(0, 1), 1 / 1200) && near(H.flickerRate(60, 1), 3 / 1200) && near(H.flickerRate(0, 8), 2 / 1200) && near(H.flickerRate(60, 8), 6 / 1200), '触发率：基础 1/20 分钟，「关照」×3，8F ×2')
  const e = fresh(5151)
  const sp = findSpot(e, (v) => v === null)
  let door: any = null
  if (sp) {
    Object.assign(e.player, { x: sp.x, y: sp.y })
    for (let k = 0; k < 16 && !door; k++) { e.player.facing = k * Math.PI / 8; door = H.hotelFlickerEvent(e) }
  }
  ok(!!door && door.kind === 'l5pocketdoor' && door.data.pocket === 'beast', '闪烁后墙上浮出一扇木门')
  if (door) {
    const p = e.player, d = Math.hypot(door.x + 0.5 - p.x, door.y + 0.5 - p.y)
    ok(d >= H.HT1C.doorMin - 0.01 && d <= H.HT1C.doorMax + 0.01 && e.los(p.x, p.y, door.x + 0.5, door.y + 0.5), `门在视野里、${d.toFixed(1)} m 外`)
    ok(e.map.structures.includes(door) && !e.map.inf.redo && e.hotelEventDoor?.wall === door.data.wall, '门进入交互结构表，不触发 chunk 重建（模型单独画）')
    ok(e.hotelFlicker && H.flickerMul(e, p.x + 3, p.y) !== undefined && H.flickerMul(e, p.x + 40, p.y) === 1, '15 m 内的灯同步闪，远处不受影响')
    let darkN = 0; for (let t = 0; t < 30; t++) { e.hotelFlicker.t = 3 - t * 0.1; if (H.flickerMul(e, p.x, p.y) < 1) darkN++ }
    ok(darkN > 6 && darkN < 24, `3 秒方波明灭（${darkN}/30 帧暗）`)
    e.hotel.stay = 0; e.time = quietTime(e)
    for (let i = 0; i < 40; i++) H.updateHotel(e, 0.1)
    ok(!e.hotelFlicker, '3 秒后闪烁结束')
    ok(e.map.structures.includes(door), '木门还在')
    for (let i = 0; i < 580; i++) H.updateHotel(e, 0.1)
    ok(!e.map.structures.includes(door) && !e.hotelEventDoor, '60 秒后木门消失')
  }
  // 出生安全区 / 刚进层不触发
  const e3 = fresh(5152); const rnd = Math.random; (Math as any).random = () => 0
  e3.hotel.stay = 10; H.updateHotel(e3, 0.1); ok(!e3.hotelFlicker, '进层 60 s 内不触发')
  e3.hotel.stay = 100; Object.assign(e3.player, { x: e3.map.spawn.x, y: e3.map.spawn.y }); H.updateHotel(e3, 0.1); ok(!e3.hotelFlicker, '出生安全区不触发')
  ;(Math as any).random = rnd
}

console.log('— 口袋房间 —')
{
  const LV = await import('../src/game/levels')
  ok(LV.levelDefOf(117)?.name === '办公室' && LV.levelDefOf(118)?.name === '大堂', '野兽办公室 117 / 大堂 118 已注册')
  ok(!LV.ALL_LEVEL_DEFS.some((d: any) => d.id === 117 || d.id === 118), '不进图鉴与路线审计')
  // 生成大堂门：统计
  let lobbyN = 0, chunks = 0
  for (let sd = 1; sd < 30; sd++) { const e = fresh(sd * 977); chunks += e.map.inf.chunks.size; lobbyN += e.map.structures.filter((s: any) => s.kind === 'l5pocketdoor' && s.data?.pocket === 'lobby').length }
  ok(lobbyN <= Math.max(3, chunks * 0.05), `大堂门很稀有（${chunks} 个 chunk 里 ${lobbyN} 扇）`)
  // 进野兽办公室
  const e = fresh(6161)
  e.hotel.floor = 4; e.loadLevel(5, { mapSeed: 6161 + 4, firstVisit: true }); e.introT = 0; e.map.entities = []
  const sp = findSpot(e, (v) => v === null)!
  Object.assign(e.player, { x: sp.x, y: sp.y }); e.hotel.attn = 10; e.hotelBook.rules.flicker = 'seen'
  const seed4 = e.mapSeed
  ok(H.hotelEnterPocket(e, 'beast') && e.transition?.dest === 117, '推开木门：过场去办公室')
  const anchor = { ...e.career.returnAnchor }
  ok(near(e.hotel.attn, 10 + H.HT1C.attnBeastDoor) && e.hotelBook.rules.flicker === 'true', `关注度 +${H.HT1C.attnBeastDoor}，验证「请勿开启新出现的门」`)
  e.transition = null; e.loadLevel(117); e.introT = 0
  ok(e.player.level === 117 && e.map.structures.some((s: any) => s.kind === 'officechair') && e.map.structures.some((s: any) => s.kind === 'bigpainting' && s.data?.gaze), '办公室：书桌、空椅、画像')
  e.takeExit(e.map.exits[0].def); e.transition = null; e.loadLevel(5); e.introT = 0
  ok(e.player.level === 5 && e.hotel.floor === 4 && e.mapSeed === seed4, '回到原楼层、原地图')
  const back = Math.hypot(e.player.x + e.map.inf.ox - anchor.x, e.player.y + e.map.inf.oy - anchor.y)
  ok(!e.hotel.pocket, '返程记录已清空')
  ok(back < 1.5, `回到门前（偏差 ${back.toFixed(2)} m）`, anchor)
  // 大堂
  const g = fresh(6162); g.player.sanity = 30
  const gs = findSpot(g, (v) => v === null)!; Object.assign(g.player, { x: gs.x, y: gs.y })
  g.msg('你看见一扇门牌写着「大堂」的门。', 'lore')
  H.hotelEnterPocket(g, 'lobby'); g.transition = null; g.loadLevel(118); g.introT = 0
  ok(g.player.sanity === 100, '进大堂：理智回满')
  { const gifts = g.map.items.filter((i: any) => i.type !== 'spokesphoto'); ok(gifts.length === 1 && (await import('../src/game/world/mapgenOutpost')).LOBBY_GIFTS.includes(gifts[0].type), `桌上一件稀有物品（${gifts[0]?.type}；[spokes] 迎宾女郎办公室桌边的侦探照片另计）`) }
  g.explored = new Uint8Array(0)
  g.takeExit(g.map.exits[0].def); g.transition = null; g.loadLevel(5); g.introT = 0
  ok(g.hotelBook.rooms.includes('lobby'), '登记簿只记下「???」（rooms 有 lobby）')
  ok(!g.msgLog.some((m: any) => m.text.includes('大堂')) && g.msgLog.some((m: any) => m.text === '你不该知道这些。'), '日志里关于大堂的记录被改写为「你不该知道这些」')
  // 迷雾抹除
  const m = g.map; g.explored = new Uint8Array(m.w * m.h).fill(1); g.hotel.pocket = { kind: 'lobby', floor: 1, mapSeed: 1 }
  H.hotelPocketAfterReturn(g)
  const P = g.player, idx = (x: number, y: number) => Math.floor(y) * m.w + Math.floor(x)
  ok(g.explored[idx(P.x, P.y)] === 0 && (P.x + 70 < m.w ? g.explored[idx(P.x + 70, P.y)] === 1 : true), '离开后 60 m 内迷雾重置，更远处不动')
}

console.log('— 住客登记簿（面板数据）—')
{
  const e = fresh(7171)
  const card = e.map.structures.find((s: any) => s.kind === 'l5rule')
  e.hotelBook = H.freshBook()
  H.hotelReadRule(e, card)
  const id = Object.keys(e.hotelBook.rules)[0]
  ok(!!id && /^1F · (走廊|客房桌上)$/.test(e.hotelBook.src[id]), `守则出处记下：「${e.hotelBook.src[id]}」`)
  H.hotelPencil(e, id, 'true'); ok(e.hotelBook.marks[id] === 'true', '铅笔标「真？」')
  H.hotelPencil(e, id, 'true'); ok(e.hotelBook.marks[id] === undefined, '再点一次擦掉')
  H.hotelPencil(e, id, 'false'); ok(e.hotelBook.marks[id] === 'false', '改标「假？」')
  const sp = findSpot(e, (v) => v === 'guestroom' || v === 'lounge')
  if (sp) { Object.assign(e.player, { x: sp.x, y: sp.y }); e.time = quietTime(e); H.updateHotel(e, 0.1) }
  ok(Object.keys(e.hotelBook.seen).length >= 1, `区域发现记录（${Object.keys(e.hotelBook.seen).join('/')}）`)
  const saved = JSON.stringify(e.hotelBook)
  const back = (memory.set('br_hotel_book', saved), H.loadBook())
  ok(back.src[id] === e.hotelBook.src[id] && back.marks[id] === 'false' && JSON.stringify(back.seen) === JSON.stringify(e.hotelBook.seen), '登记簿存取：出处 / 铅笔标记 / 发现记录')
  memory.set('br_hotel_book', JSON.stringify({ v: 1, rules: { run: 'seen' } }))
  const old = H.loadBook()
  ok(old.src && old.seen && old.marks && Array.isArray(old.floors), '旧版登记簿迁移：缺的字段补默认值')
  e.hotelShift = { phase: 'warn', cycle: 0, tLeft: 30, tune: 0, nextShift: 0 }
  ok(H.hotelShiftHint(e) === '唱片在跳针。', '换班提示：预警档文案')
  e.hotelShift = { phase: 'shift', cycle: 0, tLeft: 30, tune: -1, nextShift: 0 }
  ok(/音乐停了/.test(H.hotelShiftHint(e)), '换班提示：换班中文案')
  const S = await import('../src/game/content/l5Staff')
  ok(S.L5_STAFF.length === 7 && S.L5_STAFF.filter((x) => x.stage).length === 1, '员工名录：6 名员工 + 爵士脑')
  ok([-100, -40, 0, 50, 100].map(S.relationTier).join('') === '01234', '关系档：敌视 / 冷淡 / 寻常 / 熟客 / 贵宾')
}

console.log('— 1d 收尾：大堂门不被注视才出现 / 闪烁 —')
{
  const e = fresh(4242)
  const sp = findSpot(e, (v) => v === 'mainhall' || v === 'maintenance') ?? { x: e.player.x, y: e.player.y }
  Object.assign(e.player, { x: sp.x, y: sp.y }); e.hotel.stay = 0
  const door = { kind: 'l5pocketdoor', x: Math.floor(sp.x) + 3, y: Math.floor(sp.y), w: 1, h: 1, solid: false, data: { l5: 1, pocket: 'lobby' } }
  e.map.structures.push(door)
  e.los = () => true
  e.player.facing = 0 // 正对着门
  for (let i = 0; i < 40; i++) H.updateHotel(e, 0.1)
  ok(!H.hotelLobbyShown(e, door), '一直看着那面墙：大堂门不出现（4 s）')
  e.player.facing = Math.PI // 背过身
  for (let i = 0; i < 10; i++) H.updateHotel(e, 0.1)
  ok(!H.hotelLobbyShown(e, door), '刚转身 1 s：还没出现')
  for (let i = 0; i < 8; i++) H.updateHotel(e, 0.1)
  ok(H.hotelLobbyShown(e, door), '背对 1.5 s 后：门出现')
  e.player.facing = 0; H.updateHotel(e, 0.1)
  ok(H.hotelLobbyShown(e, door), '再回头：门还在（出现后不再消失）')
  const beast = { kind: 'l5pocketdoor', x: 1, y: 1, w: 1, h: 1, solid: false, data: { l5: 1, pocket: 'beast' } }
  ok(H.hotelLobbyShown(e, beast), '野兽木门不受这条规则影响')
  e.hotelFlicker = { x: 0, y: 0, t: 3 }
  const seq = [2.95, 2.85, 2.7, 2.5, 1.5, 0.5].map((t) => { e.hotelFlicker.t = t; return H.flickerMul(e, 1, 1) })
  ok(seq.includes(0.08) && seq.includes(1), `闪烁方波（${seq.join('/')}），渲染层灯具 + 自发光共用`)
  ok(H.flickerMul(e, 40, 40) === 1, '闪烁半径外不受影响')
}

console.log(`\n${n - fails}/${n} 通过`)
if (fails) process.exit(1)
