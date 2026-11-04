/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// [bellhop] 行李员（Entity 135）阶段 3 无头验收（真实 Engine + 真实无限 L5 地图）。运行：npm run check:bellhop
// 覆盖：旧侍者已移除（定义 / 近身暴起 / 内联模型 / 躬身）· 定义 / 图鉴 / 员工名录 / 假守则 / 物品
//       · 生成条件（只在 L5、10F 必出现、走廊尽头 20–40 m / 视线外、孤例、绝对坐标原处重建）
//       · 注视冻结（位置 / 头 / 脸都不变）· 换脸只在视线外（8 张洗牌不重复）· 视线外挪到前方走廊尽头
//       · 寄存 / 取回 / 行李牌编号（递增、不堆叠、错牌）· ≥75 拒收 + 转运 10F 行李房 + 行李房取回（含情书）
//       · 13 楼没收转交 + 领回代价 · 茶免代价 · 情书永久友好 + 图鉴一行 · 恼怒铃关注度 + 引管家 / 看门人
//       · 挨打不伤只退 · 远处铃声来自他 · 死亡遗物（同存档位下一局 10F 取回）· 存档往返 · 渲染（LOD / 冻结 / 换脸）
import { createCanvas } from '@napi-rs/canvas'
import { readFileSync } from 'node:fs'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const H = await import('../src/game/engine/l5Hotel')
const B = await import('../src/game/engine/bellhopAI')
const C = await import('../src/game/engine/conciergeAI')
const M = await import('../src/game/engine/maidAI')
const { specialAction } = await import('../src/game/engine/special')
const { ENTITIES, entitySpawnLevels } = await import('../src/game/entities')
const { snapshot } = await import('../src/game/engine/save')
const { audio } = await import('../src/game/core/audio')
const { L5_STAFF } = await import('../src/game/content/l5Staff')
const { L5_RULE } = await import('../src/game/content/l5Rules')
const { ITEMS } = await import('../src/game/content/items')
const { killCheck } = await import('../src/game/engine/combat')
const bells: string[] = []
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (k !== 'constructor' && typeof (audio as any)[k] === 'function') (audio as any)[k] = () => {}
;(audio as any).bellhopBell = (kind: string) => { bells.push(kind) }
const { BH } = B

let fails = 0, n = 0
const ok = (c: unknown, m: string, dbg?: unknown) => { n++; console.log(`${c ? '✔' : '✘'} ${m}${dbg !== undefined ? '  ' + JSON.stringify(dbg) : ''}`); if (!c) fails++ }
const SEED = 7135
const fresh = (seed = SEED, floor = 1) => {
  const e: any = new Engine(); e.seed = seed
  e.hotel = H.freshHotel()
  e.loadLevel(5, { mapSeed: seed, firstVisit: true }); e.introT = 0
  if (floor !== 1) { e.hotel.floor = floor; e.loadLevel(5, { mapSeed: seed + floor }) }
  e.emit = () => {}; e.persist = () => {}
  e.map.entities = []
  Object.assign(e.player, { hp: 100, sanity: 80, hunger: 100, thirst: 100, stamina: 100 })
  const fl = e.hotel.floor
  e.hotel = H.freshHotel(); e.hotel.floor = fl
  e.hotelShift = { ...e.hotelShift, phase: 'play' }
  e.player.hotbar.fill(null); e.player.backpack.fill(null); e.player.equip.pockets.fill(null)
  return e
}
const step = (e: any, dt = 0.05) => { e.time += dt; B.stepBellhopWorld(e, dt); const b = B.findBellhop(e); if (b) B.updateBellhop(e, b, dt) }
const run = (e: any, sec: number, dt = 0.05, each?: (t: number) => void) => { for (let t = 0; t < sec; t += dt) { each?.(t); step(e, dt) } }
const lookAt = (e: any, x: number, y: number) => { e.player.facing = Math.atan2(y - e.player.y, x - e.player.x) }
const lookAway = (e: any, x: number, y: number) => { e.player.facing = Math.atan2(y - e.player.y, x - e.player.x) + Math.PI }
const walk = (e: any, x: number, y: number) => e.entityWalkH(e.map, Math.floor(x), Math.floor(y), 0) !== null
/** 把行李员放到玩家身边 d 米（找可站点），面朝玩家 */
const placeNear = (e: any, d = 1.4) => {
  const p = e.player
  for (let a = 0; a < Math.PI * 2; a += 0.3) { const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d; if (walk(e, x, y) && e.los(p.x, p.y, x, y)) { const b = B.spawnBellhop(e, { x, y, f: Math.atan2(p.y - y, p.x - x) })!; b.x = x; b.y = y; return b } }
  throw new Error('no spot near player')
}
const press = (e: any) => { e.specialPressed = true; return B.bellhopPress(e) }
const slotsOf = (e: any, type: string) => [...e.player.hotbar, ...e.player.backpack].filter((s: any) => s?.type === type)

// ---------------------------------------------------------------------------
console.log('— 旧侍者已移除 / 定义 / 图鉴 / 员工名录 / 物品 —')
{
  const d: any = ENTITIES.bellhop
  ok(d && d.name === '行李员' && d.damage === 0 && !d.feignNeutral && d.naturalSpawn === false && d.codex.no.includes('135') && d.codex.no.includes('Bellhopper'), '实体定义 bellhop = Entity 135 行李员：无攻击、无 feignNeutral、不进生成池')
  ok(!d.codex.lore.some((l: string) => l.includes('1930 年代酒店行李员制服，推着一辆行李车。行李车上从未见过行李')) && !d.desc.includes('微笑着'), '旧「侍者」图鉴文字已替换')
  const src = (f: string) => readFileSync(new URL('../src/game/' + f, import.meta.url), 'utf8')
  ok(!src('engine/entityAI.ts').includes('侍者不笑了') && !/def\.feignNeutral && d <= 2\.4/.test(src('engine/entityAI.ts')), '通用 feignNeutral 近身暴起分支已删除')
  ok(!src('renderer/entitiesMesh.ts').includes("case 'bellhop': {") && src('renderer/entitiesMesh.ts').includes('buildBellhopEntityMesh'), '旧内联模型已删，改走 buildBellhopEntityMesh')
  ok(!src('renderer/renderer.ts').includes('殷勤微躬'), '旧躬身逻辑已删')
  ok(entitySpawnLevels('bellhop').some((s) => s.id === 5 && s.event), '图鉴层级归属：L5（事件生成）')
  const st = L5_STAFF.find((s) => s.id === 'bellhop')
  ok(!!st && st.no === 'Entity 135' && st.habits.some((h) => h.includes('行李牌')) && st.habits.some((h) => h.includes('10F')), '员工名录：习性写明行李牌 / 10F 行李房')
  ok(L5_RULE.bellhop.truth === false, '假守则「请将贵重物品交由行李员保管」保持 truth:false（半真半假）')
  ok(ITEMS.bagTag && ITEMS.roomtea && ITEMS.gentletter && !ITEMS.bagTag.keyItem && ITEMS.gentletter.desc.includes('致行李员'), '物品：行李牌 / 客房茶 / 绅士的情书')
}

console.log('— 生成条件 —')
{
  const e0: any = new Engine(); e0.seed = 1; e0.loadLevel(1, { mapSeed: 1, firstVisit: true }); e0.emit = () => {}; e0.map.entities = []
  for (let i = 0; i < 400; i++) { e0.time += 0.1; B.stepBellhopWorld(e0, 0.1) }
  ok(!B.findBellhop(e0), '非 L5 不生成')
  const e = fresh(SEED, 10)
  run(e, BH.firstDelay - 1)
  ok(!B.findBellhop(e), `进层 ${BH.firstDelay} s 内不出现`)
  let atSpawn: any = null
  run(e, 8, 0.05, () => { const b = B.findBellhop(e); if (b && !atSpawn) atSpawn = { d: Math.hypot(b.x - e.player.x, b.y - e.player.y), seen: B.bellhopWatched(e, b.x, b.y) } })
  const b = B.findBellhop(e)
  ok(!!b, '10F 行李层：一定出现（进层 10 s 后、一次没找到位置则 1 s 后再找）')
  ok(!!atSpawn && atSpawn.d >= BH.spawnLoose[0] - 0.01 && atSpawn.d <= BH.spawnLoose[1] + 0.01 && !atSpawn.seen, `出现在走廊尽头、视线外（距 ${atSpawn?.d.toFixed(1)} m）`, atSpawn)
  run(e, 20)
  ok(e.map.entities.filter((x: any) => x.def.type === 'bellhop').length === 1, '孤例：全楼只有一位')
  const sv = B.bellhopSave(e)
  ok(sv.placed === 1 && sv.floor === 10 && Math.abs(sv.ax - (b!.x + e.map.inf.ox)) < 1e-6, '存档记下他的绝对坐标')
  // 模拟 chunk 卸载 / 窗口平移：实体没了 → 原处（绝对坐标）重建
  const ax = sv.ax, ay = sv.ay
  e.map.entities = e.map.entities.filter((x: any) => x.def.type !== 'bellhop')
  lookAway(e, ax - e.map.inf.ox, ay - e.map.inf.oy)
  run(e, 0.2)
  const b2 = B.findBellhop(e)
  ok(!!b2 && Math.hypot(b2.x + e.map.inf.ox - ax, b2.y + e.map.inf.oy - ay) < 1e-3, '实体丢失后在原绝对坐标重建')
  // 其他楼层：按概率（多次统计）
  let hit = 0
  for (let k = 0; k < 12; k++) { const ek = fresh(SEED + 100 + k, 3); run(ek, BH.firstDelay + 1, 0.25); if (B.findBellhop(ek)) hit++ }
  ok(hit > 0 && hit < 12, `其他楼层按概率出现（12 次里 ${hit} 次；10F 必出现）`)
}

console.log('— 注视冻结 / 换脸只在视线外 / 走廊尽头候命 —')
{
  const e = fresh(SEED + 1)
  const p = e.player
  const b = placeNear(e, 5)
  const s = B.ensureBellhop(b)
  // 先移开视线 → 头拧向你、换脸
  lookAway(e, b.x, b.y); s.headYaw = 0; s.turned = true
  lookAt(e, b.x, b.y); run(e, 0.2) // 看一眼（重置 turned）
  const f0 = s.face
  // 玩家横跨一步，让方向变化
  p.facing += Math.PI; run(e, 1.0)
  ok(s.face !== f0 && s.turned, `移开视线 ${BH.turnAfter} s 后换了一张脸（${f0} → ${s.face}）`)
  const want = -Math.atan2(Math.sin(Math.atan2(p.y - b.y, p.x - b.x) - b.facing), Math.cos(Math.atan2(p.y - b.y, p.x - b.x) - b.facing))
  ok(Math.abs(s.headYaw - want) < 1e-6, '头已拧向你（视线外持续跟随）')
  // 看着他：冻结
  lookAt(e, b.x, b.y)
  const st = { x: b.x, y: b.y, yaw: s.headYaw, face: s.face }
  const p0 = { x: p.x, y: p.y }
  let moved = false, faceChg = false
  let unw = 0
  run(e, 4, 0.05, () => { lookAt(e, b.x, b.y); if (!s.watched) unw++; if (Math.hypot(b.x - st.x, b.y - st.y) > 1e-9 || Math.abs(s.headYaw - st.yaw) > 1e-9) moved = true; if (s.face !== st.face) faceChg = true })
  void p0
  ok(!moved && s.mode === 'still' && s.clip === 'stillWatch', '被看着时一动不动（位置 / 拧头角不变，stillWatch）', { moved, mode: s.mode, unw, d: Math.hypot(b.x - p.x, b.y - p.y) })
  ok(!faceChg, '被看着时不换脸')
  // 8 张洗牌不重复
  const sv = B.bellhopSave(e); sv.bag = []; sv.face = 0
  const seq: number[] = []; for (let i = 0; i < 7; i++) seq.push(B.bellhopNextFace(sv))
  ok(new Set(seq).size === 7 && !seq.includes(0), '换脸：8 张一轮洗牌、不重复（7 次换脸各不相同）', seq)
  // 换脸只在视线外：统计一段随机看 / 不看的过程
  let bad = 0, lastFace = s.face, watchedPrev = false
  for (let i = 0; i < 400; i++) {
    if (i % 40 === 0) { if ((i / 40) % 2) lookAt(e, b.x, b.y); else lookAway(e, b.x, b.y) }
    step(e, 0.05)
    if (s.face !== lastFace && (s.watched || watchedPrev)) bad++
    watchedPrev = s.watched; lastFace = s.face
  }
  ok(bad === 0, '换脸从不发生在被注视时（400 帧随机看 / 不看）', { bad })
  // 视线外、落在你身后 → 挪到你前方的走廊尽头（你朝前走、往侧面看）
  const e2 = fresh(SEED + 2)
  const p2 = e2.player
  const w = B.bellhopDebug(e2)
  let jumped: any = null, tried = 0
  for (let k = 0; k < 16 && !jumped; k++) {
    const hd = (k / 16) * Math.PI * 2
    const bx = p2.x - Math.cos(hd) * 3, by = p2.y - Math.sin(hd) * 3
    if (!walk(e2, bx, by)) continue
    tried++
    e2.map.entities = []
    const b2 = B.spawnBellhop(e2, { x: bx, y: by, f: hd })!
    w.heading = hd; p2.facing = hd + Math.PI / 2 // 侧着看
    w.lastPx = p2.x; w.lastPy = p2.y
    run(e2, BH.relocateT + 2, 0.05, () => { w.heading = hd; if (!jumped && Math.hypot(b2.x - bx, b2.y - by) > 2) jumped = { d: Math.hypot(b2.x - p2.x, b2.y - p2.y), seen: B.bellhopWatched(e2, b2.x, b2.y), ahead: Math.cos(Math.atan2(b2.y - p2.y, b2.x - p2.x) - hd) } })
  }
  ok(!!jumped && !jumped.seen && jumped.ahead > -0.1 && jumped.d >= BH.spawnLoose[0] - 0.01, `视线外 ${BH.relocateT} s 且落在你身后 → 瞬移到你前方的走廊尽头（瞬移瞬间不在视野内）`, { jumped, tried })
}

console.log('— 寄存 / 取回 / 行李牌编号 —')
{
  const e = fresh(SEED + 3)
  const p = e.player
  const b = placeNear(e, 1.4); lookAt(e, b.x, b.y)
  p.hotbar[0] = { type: 'crowbar', count: 1, dur: 33 }; p.hotbar[1] = { type: 'flashlight', count: 1 }; p.selected = 0
  let sa = specialAction(e)
  ok(sa?.id === 'bellhop-deposit' && sa.label === '寄存', '2 m 内 X：寄存（移动端按钮文案「寄存」）', sa)
  press(e)
  const t1 = slotsOf(e, 'bagTag')
  const sv = B.bellhopSave(e)
  ok(!p.hotbar[0] || p.hotbar[0].type === 'bagTag', '撬棍交了出去')
  ok(t1.length === 1 && t1[0].tag === BH.tagStart && sv.deposits.length === 1 && sv.deposits[0].tag === BH.tagStart && sv.deposits[0].item.dur === 33, `得到 No.${BH.tagStart} 行李牌，寄存物保留耐久`, t1)
  ok(b.bh!.clip === 'takeItem' && b.bh!.queue.includes('tagHand') && bells.at(-1) === 'friendly', '双手接物 → 递行李牌 + 友好铃')
  run(e, 8) // 播完服务片段
  p.selected = 1
  press(e)
  const t2 = slotsOf(e, 'bagTag')
  ok(t2.length === 2 && t2.some((s: any) => s.tag === BH.tagStart + 1), '第二件 → No.136（编号递增，不同编号不堆叠）', t2.map((s: any) => s.tag))
  run(e, 8)
  // 选中 No.136 取回 → 手电回来
  const i136 = p.hotbar.findIndex((s: any) => s?.tag === BH.tagStart + 1); p.selected = i136
  sa = specialAction(e)
  ok(sa?.id === 'bellhop-claim' && sa.label === '取回', 'X：出示行李牌取回', sa)
  press(e)
  ok(slotsOf(e, 'flashlight').length === 1 && !slotsOf(e, 'bagTag').some((s: any) => s.tag === BH.tagStart + 1) && sv.deposits.length === 1, '按编号取回对应那件（手电），牌子交还')
  run(e, 8)
  // 错牌：伪造 No.999
  const iT = p.hotbar.findIndex((s: any) => s?.type === 'bagTag'); p.hotbar[iT]!.tag = 999; p.selected = iT
  press(e)
  ok(sv.deposits.length === 1 && !slotsOf(e, 'bagTag').length, '对不上号的牌子：被他收走，什么也不给')
  ok(B.bellhopSave(e).n.deposit === 2 && B.bellhopSave(e).n.claim === 1, '寄存 / 取回计数')
  // 寄存物不受看门人 13 楼没收影响（钥匙类寄存后没收不到）
  run(e, 8)
  p.hotbar.fill(null); p.hotbar[0] = { type: 'skeleton', count: 1 }; p.selected = 0
  press(e)
  ok(sv.deposits.some((d) => d.item.type === 'skeleton'), '万能钥匙寄存给他')
  run(e, 8)
  const before = sv.held.length
  C.conciergeLiftFinish(e)
  ok(sv.deposits.some((d) => d.item.type === 'skeleton') && sv.held.length === before, '13 楼后果：寄存的钥匙不受影响')
}

console.log('— ≥75 拒收 + 转运 10F 行李房 —')
{
  const e = fresh(SEED + 4)
  const p = e.player, b = placeNear(e, 1.4); lookAt(e, b.x, b.y)
  p.hotbar[0] = { type: 'crowbar', count: 1 }; p.selected = 0
  press(e); run(e, 8)
  const sv = B.bellhopSave(e)
  ok(sv.deposits.length === 1, '先寄存一件')
  e.hotel.attn = 80
  p.hotbar[1] = { type: 'knife', count: 1 }; p.selected = 1
  const a0 = e.hotel.attn
  ok(B.bellhopAct(e) === 'deposit', '≥75 时 X 仍然可以「寄存」（尝试）')
  press(e)
  ok(p.hotbar[1]?.type === 'knife' && sv.n.refuse === 1, '关注度 ≥ 75：拒收（东西还在你手上）')
  ok(bells.at(-1) === 'annoyed' && e.hotel.attn >= Math.min(100, a0 + BH.annoyAttn) - 1e-6, `恼怒铃：关注度 +${BH.annoyAttn}`, { a0, a: e.hotel.attn })
  ok(sv.deposits.length === 0 && sv.room.length === 1 && sv.room[0].type === 'crowbar', '已寄存的东西被送到 10F 行李房')
  // 取回失败的牌
  const iT = p.hotbar.findIndex((s: any) => s?.type === 'bagTag'); p.selected = iT
  run(e, 8); press(e)
  ok(!slotsOf(e, 'bagTag').length && sv.room.length === 1, '凭牌取回：他指了指楼上（东西在 10F）')
  // 去 10F 行李房自己取
  const keep = JSON.parse(JSON.stringify(e.hotel))
  const e10 = fresh(SEED + 5, 10)
  e10.hotel = H.restoreHotel(keep); e10.hotel.floor = 10
  const room = B.bellhopRoom(e10)
  ok(!!room && walk(e10, room.x, room.y), '10F 有行李房（主厅角落的行李寄存处）', room)
  e10.player.x = room!.x + 0.8; e10.player.y = room!.y
  const sa = specialAction(e10)
  ok(sa?.id === 'bellhop-room', 'X：翻找行李房', sa)
  press(e10)
  const sv10 = B.bellhopSave(e10)
  ok(slotsOf(e10, 'crowbar').length === 1 && slotsOf(e10, 'gentletter').length === 1 && sv10.room.length === 0 && sv10.letter === 1, '行李房：取回撬棍 + 最底下压着「绅士的情书」')
  // 关注度一过线就自动转运
  const e2 = fresh(SEED + 6); const b2 = placeNear(e2, 1.4); lookAt(e2, b2.x, b2.y)
  e2.player.hotbar[0] = { type: 'crowbar', count: 1 }; press(e2); run(e2, 1)
  e2.hotel.attn = 90; run(e2, 0.2)
  ok(B.bellhopSave(e2).deposits.length === 0 && B.bellhopSave(e2).room.length === 1, '关注度过 75 → 寄存物自动送去 10F')
}

console.log('— 13 楼没收转交 / 茶 / 情书 —')
{
  const e = fresh(SEED + 7)
  const p = e.player
  p.equip.pockets[0] = { type: 'skeleton', count: 1 }; p.hotbar[0] = { type: 'keycard', count: 1 }; p.hotbar[1] = { type: 'crowbar', count: 1 }
  C.conciergeLiftFinish(e)
  const sv = B.bellhopSave(e)
  ok(!p.equip.pockets[0] && !p.hotbar[0] && p.hotbar[1]?.type === 'crowbar', '13 楼后果：钥匙类照样被没收（撬棍留着）')
  ok(sv.held.length === 2 && sv.held.some((h) => h.type === 'skeleton') && sv.held.some((h) => h.type === 'keycard'), '没收的钥匙转交行李员保管')
  const e1 = fresh(SEED + 8); e1.hotel = H.restoreHotel(JSON.parse(JSON.stringify(e.hotel))); e1.hotel.floor = 1
  const b = placeNear(e1, 1.4); lookAt(e1, b.x, b.y)
  e1.player.hotbar[3] = { type: 'crowbar', count: 1 }; e1.player.selected = 3
  e1.hotel.attn = 10
  ok(B.bellhopAct(e1) === 'keys' && specialAction(e1)?.label === '领回钥匙', 'X：领回钥匙（优先于寄存）')
  press(e1)
  ok(slotsOf(e1, 'skeleton').length === 1 && slotsOf(e1, 'keycard').length === 1 && B.bellhopSave(e1).held.length === 0, '领回两件钥匙')
  ok(Math.abs(e1.hotel.attn - (10 + BH.keyClaimAttn)) < 1e-6, `代价：关注度 +${BH.keyClaimAttn}`, e1.hotel.attn)
  run(e1, 8)
  // 茶：免下一次
  const sv1 = B.bellhopSave(e1); sv1.held.push({ type: 'carkey', count: 1, t: 0 })
  e1.player.backpack[0] = { type: 'roomtea', count: 1 }
  ok(B.bellhopAct(e1) === 'tea' && specialAction(e1)?.label === '递茶', 'X：递茶（优先）')
  press(e1)
  ok(!slotsOf(e1, 'roomtea').length && sv1.free === 1 && b.bh!.queue.includes('teaSip') && bells.at(-1) === 'friendly', '递茶 → 友好铃 + 饮茶，攒一次免代价')
  run(e1, 12)
  const a1 = e1.hotel.attn
  press(e1)
  ok(slotsOf(e1, 'carkey').length === 1 && e1.hotel.attn <= a1 + 1e-6 && sv1.free === 0, '有茶：领回免代价（次数用掉）')
  run(e1, 8)
  // 咖啡也行
  e1.player.backpack[1] = { type: 'coffee', count: 1 }; press(e1)
  ok(sv1.free === 1 && !slotsOf(e1, 'coffee').length, '咖啡也算茶')
  run(e1, 12)
  // 情书
  e1.player.backpack[2] = { type: 'gentletter', count: 1 }
  ok(specialAction(e1)?.label === '递信', 'X：递信（最优先）')
  press(e1)
  ok(sv1.loved === 1 && (e1.hotelBook as any).bhLove === 1 && (e1.hotel.staff.bellhop ?? 0) >= BH.rel.letter - 20, '情书 → 本局永久友好 + 图鉴（跨局）解锁一行')
  run(e1, 10)
  sv1.free = 0; sv1.held.push({ type: 'carkey', count: 1, t: 0 }, { type: 'housekey', count: 1, t: 0 })
  const a2 = e1.hotel.attn; press(e1)
  ok(slotsOf(e1, 'carkey').reduce((a: number, x: any) => a + x.count, 0) === 2 && slotsOf(e1, 'housekey').length === 1 && e1.hotel.attn <= a2 + 1e-6, '情书之后：领回不再有代价', { car: slotsOf(e1, 'carkey').length, a2, a: e1.hotel.attn, held: sv1.held.length, act: B.bellhopAct(e1) })
  ok(B.bellhopAct(e1) !== 'letter', '情书只送一次')
}

console.log('— 恼怒铃引员工 / 挨打 / 远处铃声 —')
{
  const e = fresh(SEED + 9)
  const b = placeNear(e, 6)
  // 管家在附近
  const mx = b.x + 1.5, my = b.y
  const md = M.spawnMaid(e, walk(e, mx, my) ? { x: mx, y: my } : { x: b.x, y: b.y })!
  const ms = M.ensureMaid(md)
  e.hotel.attn = 20
  B.bellhopRing(e, b, 'annoyed', false)
  ok(e.hotel.attn >= 30 - 1e-6, '恼怒铃：关注度 +10')
  ok(ms.dist >= M.maidActAt(e) && Math.hypot(ms.nx - b.x, ms.ny - b.y) < 1e-6, '管家被引向铃声的位置（打扰值到「走过来」阈值）', { dist: ms.dist })
  const a = e.hotel.attn; B.bellhopRing(e, b, 'annoyed', false)
  ok(e.hotel.attn === a, `冷却 ${BH.annoyCd} s 内不重复加关注度`)
  // 看门人（1F 前台）被引到铃声附近
  const e2 = fresh(SEED + 10)
  for (let i = 0; i < 20; i++) { e2.time += 0.05; C.stepConciergeWorld(e2, 0.05) }
  const cg = C.findConcierge(e2)
  const b2 = placeNear(e2, 6); lookAway(e2, b2.x, b2.y)
  if (cg) { cg.cg!.mode = 'desk'; B.bellhopRing(e2, b2, 'annoyed', false) }
  ok(!!cg && cg.cg!.mode === 'blink' && !!cg.cg!.blinkTo && Math.hypot(cg.cg!.blinkTo.x - b2.x, cg.cg!.blinkTo.y - b2.y) < 4.5 && cg.cg!.after === 'wipe', '看门人眨眼到铃声附近（之后擦手、回岗）', cg?.cg?.mode)
  // 挨打
  const e3 = fresh(SEED + 11); const b3 = placeNear(e3, 1.4)
  const x0 = b3.x, y0 = b3.y; e3.hotel.attn = 5
  b3.hp = -30; killCheck(e3, b3)
  ok(b3.hp === b3.def.hp && !b3.dead && Math.hypot(b3.x - x0, b3.y - y0) <= BH.hitBack + 1e-6 && b3.bh!.clip === 'ringAnnoyed' && e3.hotel.attn >= 15 - 1e-6, '挨打：不受伤，只后退一步、摇恼怒铃（关注度 +10）')
  ok(b3.def.damage === 0, '他本人从不攻击')
  // 远处铃声
  bells.length = 0
  ok(B.bellhopDistantBell(e3, 0.35) && bells.at(-1) === 'friendly', '「关照」档远处铃声：他在同层时由他发出')
  const e4 = fresh(SEED + 12)
  ok(!B.bellhopDistantBell(e4, 0.35), '他不在同层：仍用原来的随机声像远铃')
}

console.log('— 死亡遗物（同存档位）—')
{
  const e = fresh(SEED + 13); e.saveSlot = 'slot2'
  e.player.hotbar[0] = { type: 'crowbar', count: 1 }; e.player.backpack[0] = { type: 'almond', count: 2 }
  B.bellhopOnDeath(e)
  ok(!!memory.get('br_bellhop_legacy_slot2'), 'L5 死亡：遗物按存档位记下')
  const e10 = fresh(SEED + 14, 10); e10.saveSlot = 'slot2'
  run(e10, 0.2)
  const sv = B.bellhopSave(e10)
  ok(sv.room.some((r) => r.type === 'crowbar') && sv.room.some((r) => r.type === 'almond' && r.count === 2) && !memory.get('br_bellhop_legacy_slot2'), '同存档位下一局：10F 行李房里取回（只取一次）')
  const eo = fresh(SEED + 15, 10); eo.saveSlot = 'slot3'; run(eo, 0.2)
  ok(B.bellhopSave(eo).room.length === 0, '别的存档位拿不到')
}

console.log('— 存档往返 —')
{
  const e = fresh(SEED + 16)
  const b = placeNear(e, 1.4); lookAt(e, b.x, b.y)
  e.player.hotbar[0] = { type: 'crowbar', count: 1 }; press(e); run(e, 1)
  const sv = B.bellhopSave(e); sv.room.push({ type: 'knife', count: 1, t: 1 }); sv.held.push({ type: 'skeleton', count: 1, t: 2 }); sv.free = 2; sv.loved = 1
  const snap: any = snapshot(e)
  const back = H.restoreHotel(JSON.parse(JSON.stringify(snap.hotel ?? e.hotel)))
  const bs = back.bellhop!
  ok(!!bs && bs.deposits.length === 1 && bs.deposits[0].tag === BH.tagStart && bs.next === BH.tagStart + 1 && bs.room[0].type === 'knife' && bs.held[0].type === 'skeleton' && bs.free === 2 && bs.loved === 1 && Math.abs(bs.ax - sv.ax) < 1e-9 && bs.face === sv.face, '存档：寄存 / 编号 / 行李房 / 代管钥匙 / 茶 / 情书 / 位置 / 脸 随 hotel 保存与恢复')
  ok(B.restoreBellhopSave({ deposits: [{ tag: 'x' }, null], room: 5, n: null, face: 99 }).face === 3 && B.restoreBellhopSave(undefined).next === BH.tagStart, '坏数据 / 旧档（无 bellhop 字段）不报错')
  ok(!H.restoreHotel({ attn: 10 }).bellhop, '旧存档没有行李员数据：照常读取')
  // 旧档里背包有无编号的行李牌（tag 丢失）：取回最早的一件
  const e2 = fresh(SEED + 17); const b2 = placeNear(e2, 1.4); lookAt(e2, b2.x, b2.y)
  B.bellhopSave(e2).deposits.push({ tag: 140, item: { type: 'knife', count: 1, t: 0 } })
  e2.player.hotbar[0] = { type: 'bagTag', count: 1 }; e2.player.selected = 0
  press(e2)
  ok(slotsOf(e2, 'knife').length === 1, '没有编号的旧行李牌：取回最早的一件')
}

console.log('— 渲染 —')
{
  const THREE = await import('three')
  const R = await import('../src/game/renderer/bellhopRender')
  const { buildEntityMesh } = await import('../src/game/renderer/entitiesMesh') as any
  const g = R.buildBellhopEntityMesh()
  const box = new THREE.Box3().setFromObject(g.userData.lod1)
  ok(box.max.y > 1.8 && box.max.y < 1.98, `模型高约 1.9 m（含帽 ${box.max.y.toFixed(2)}）`)
  ok(typeof buildEntityMesh !== 'function' || buildEntityMesh('bellhop')?.userData.entityType === 'bellhop', 'entitiesMesh：bellhop → 新模型')
  const e = fresh(SEED + 18); const b = placeNear(e, 6)
  const s = B.ensureBellhop(b)
  let threw = ''
  try { for (const cl of ['idle', 'ringFriendly', 'ringAnnoyed', 'takeItem', 'giveBack', 'tagHand', 'teaSip', 'bow', 'stillWatch'] as const) { s.clip = cl; s.seq++; s.modeT = 0.6; R.animateBellhopEntity(g, b, 0.05, 20) } } catch (er) { threw = String(er) }
  ok(!threw, '服务片段在实体里播放不报错', threw || undefined)
  // 冻结：stillWatch 期间骨骼完全不动
  s.clip = 'idle'; s.seq++; for (let i = 0; i < 10; i++) R.animateBellhopEntity(g, b, 0.05, 20)
  s.clip = 'stillWatch'; s.seq++; R.animateBellhopEntity(g, b, 0.05, 20)
  const rig = g.userData.rig1
  const snapQ = () => rig.bones ? Object.values(rig.bones).map((x: any) => x.quaternion.toArray().join(',')).join(';') : ''
  const q0 = snapQ(); for (let i = 0; i < 20; i++) R.animateBellhopEntity(g, b, 0.05, 20)
  ok(q0 === snapQ() && q0.length > 0, 'stillWatch：骨骼姿态完全冻结（连呼吸都停）')
  s.face = 5; R.animateBellhopEntity(g, b, 0.05, 20)
  ok(rig.faceIndex === 5, '脸跟着 AI 的 e.bh.face 换')
  const t0 = performance.now(); R.animateBellhopEntity(g, b, 0.05, 5); const ms = performance.now() - t0
  ok(!!g.userData.lod0 && g.userData.lod0.visible && !g.userData.lod1.visible && g.userData.rig0.faceIndex === 5, `走近（< ${R.BELLHOP_LOD.near} m）切到 LOD0（首次构建 ${ms.toFixed(0)} ms），脸一致`)
  R.animateBellhopEntity(g, b, 0.05, 10); ok(g.userData.lod0.visible, '9–11 m 保持（防抖）')
  R.animateBellhopEntity(g, b, 0.05, 12); ok(!g.userData.lod0.visible && g.userData.lod1.visible, '11 m 外回到 LOD1')
  const scene = new THREE.Scene()
  R.syncBellhopRoom(scene, { x: 10, y: 20 }, 3)
  const rg = scene.children.find((o: any) => o.name === 'bellhopLuggageRoom') as any
  ok(!!rg && Math.abs(rg.position.x - 10) < 1e-9 && Math.abs(rg.position.z - 20) < 1e-9 && rg.getObjectByName('pile').children.filter((c: any) => c.visible).length > 0, '10F 行李房摆在世界坐标上（行李堆按件数显示）')
  R.syncBellhopRoom(scene, null, 0)
  ok(!scene.children.some((o: any) => o.name === 'bellhopLuggageRoom'), '离开 10F：行李房移除')
}

console.log(`\n${n - fails}/${n} 通过`)
process.exit(fails ? 1 : 0)
