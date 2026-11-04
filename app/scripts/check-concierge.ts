/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// [concierge] 看门人（Entity 131）阶段 3 无头验收（真实 Engine + 真实无限 L5 地图）。运行：npm run check:concierge
// 覆盖：定义 / 图鉴 / 员工名录 / 437 钥匙物品 · 前台（1F 主厅，孤例，柜台碰撞）· 出口判定只对真出口生效（电梯 / 背向出口 / 远处不算）
//       · 关注度「清理」档追踪 · 眨眼瞬移只在不被注视时发生（被看着 = 抬前臂站定）· 搭话 → X 跟他走（领路 → 放行）
//       · 拒绝 → 追逐 → 扑倒 → 挣开 / 捆绑 → 挣脱 / 拖行 → 升降梯 → 13 楼后果（钥匙类丢失 / 关注度 / HP / 理智 / 换层 / 员工通道醒来）
//       · 金属分心（啃完才继续）· 茶歇不拦人（换班回岗）· 躲着发抖 / 睡觉不管 · 挂眼提示频率 · 不可击杀 · 交还 437 · 存档 · 渲染
import { createCanvas } from '@napi-rs/canvas'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const H = await import('../src/game/engine/l5Hotel')
const C = await import('../src/game/engine/conciergeAI')
const { specialAction } = await import('../src/game/engine/special')
const { ENTITIES, entitySpawnLevels } = await import('../src/game/entities')
const { snapshot } = await import('../src/game/engine/save')
const { audio } = await import('../src/game/core/audio')
const { L5_STAFF } = await import('../src/game/content/l5Staff')
const { ITEMS } = await import('../src/game/content/items')
const { l5RegionAt } = await import('../src/game/world/infiniteL5')
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (k !== 'constructor' && typeof (audio as any)[k] === 'function') (audio as any)[k] = () => {}
const { CC } = C

let fails = 0, n = 0
const ok = (c: unknown, m: string, dbg?: unknown) => { n++; console.log(`${c ? '✔' : '✘'} ${m}${dbg !== undefined ? '  ' + JSON.stringify(dbg) : ''}`); if (!c) fails++ }

const SEED = 4242
const fresh = (seed = SEED) => {
  const e: any = new Engine(); e.seed = seed
  e.hotel = H.freshHotel()
  e.loadLevel(5, { mapSeed: seed, firstVisit: true }); e.introT = 0
  e.emit = () => {}; e.persist = () => {}
  e.map.entities = []
  Object.assign(e.player, { hp: 100, sanity: 80, hunger: 100, thirst: 100, stamina: 100 })
  e.hotel = H.freshHotel()
  return e
}
const walk = (e: any, x: number, y: number) => e.entityWalkH(e.map, Math.floor(x), Math.floor(y), 0) !== null
const faceTo = (e: any, x: number, y: number) => { e.player.facing = Math.atan2(y - e.player.y, x - e.player.x) }
/** 一步：世界 + 实体 + 玩家接管 */
const step = (e: any, dt = 0.05) => { e.time += dt; C.stepConciergeWorld(e, dt); const c = C.findConcierge(e); if (c) C.updateConcierge(e, c, dt); C.conciergeControlsPlayer(e) }
const run = (e: any, sec: number, dt = 0.05, each?: (t: number) => void, stopOnTransition = false) => { for (let t = 0; t < sec; t += dt) { each?.(t); if (stopOnTransition && e.transition) break; step(e, dt) } }
/** 玩家离开前台到一个开阔点（与前台无视线干扰的远处） */
const spotFar = (e: any, from: { x: number; y: number }, r0: number, r1: number) => {
  for (let r = r0; r <= r1; r += 0.5) for (let a = 0; a < Math.PI * 2; a += 0.15) {
    const x = Math.floor(from.x + Math.cos(a) * r) + 0.5, y = Math.floor(from.y + Math.sin(a) * r) + 0.5
    if (walk(e, x, y) && e.los(from.x, from.y, x, y)) return { x, y }
  }
  return null
}
/** 把看门人直接放在某处并进入某状态 */
const placeAt = (e: any, x: number, y: number, mode: any, clip: any = 'walk') => { let c = C.findConcierge(e); if (!c) c = C.spawnConcierge(e, { x, y, f: 0 }, mode)!; c.x = x; c.y = y; const s = C.ensureConcierge(c); s.mode = mode; s.clip = clip; s.modeT = 0; return c }

// ---------------------------------------------------------------------------
{
  const { makeEntity } = await import('../src/game/entities')
  const { walkHotelStaff } = await import('../src/game/engine/hotelStaffWalk')
  const { canOccupy } = await import('../src/game/core/player')
  const e = fresh()
  e.loadLevel(117)
  const m = e.map
  m.structures.length = 0
  m.tiles.fill(1); m.stair.fill(0); m.liquid.fill(0); m.elev.fill(0); m.crawl.fill(0)
  for (let y = 4; y <= 12; y++) m.tiles[y * m.w + 9] = 2
  const c = makeEntity('concierge', 7.5, 8.5), goal = { x: 11.5, y: 8.5 }
  let clear = true, detour = false
  for (let i = 0; i < 400; i++) {
    walkHotelStaff(e, c, goal, 1.8, .025)
    detour ||= c.y < 4 || c.y >= 13
    clear &&= canOccupy(m, c.x, c.y, .34)
  }
  ok(detour && clear && Math.hypot(c.x - goal.x, c.y - goal.y) < .15, '看门人绕过墙端，全程保持身体净空并抵达目标', { x: c.x, y: c.y })
}

console.log('— 定义 / 图鉴 / 员工名录 —')
{
  const d = ENTITIES.concierge
  ok(d && d.naturalSpawn === false && d.damage === 0, '实体定义 concierge：不进生成池、无普通攻击')
  ok(entitySpawnLevels('concierge').some((s) => s.id === 5 && s.event), '图鉴层级归属：L5（事件生成）')
  ok(d.codex.no.includes('131') && d.codex.lore.some((l: string) => l.includes('437')) && d.codex.lore.some((l: string) => l.includes('左前臂上有四只眼，右前臂上有五只')), '图鉴：Entity 131、437 钥匙、前臂眼左 4 右 5')
  const st = L5_STAFF.find((s) => s.id === 'concierge')
  ok(!!st && st.no === 'Entity 131' && st.habits.some((h) => h.includes('银餐具')) && !L5_STAFF.some((s) => s.id === 'doorman'), '员工名录：doorman → concierge，习性写明金属 / 437')
  ok(ITEMS.key437?.equip === 'pocket' && !ITEMS.key437.keyItem, '物品：437 号房钥匙（口袋，可丢）')
  ok(C.isConciergeKey('key437') && C.isConciergeKey('skeleton') && C.isConciergeKey('keycard') && C.isConciergeKey('carkey') && !C.isConciergeKey('silverware'), '钥匙类判定')
}

console.log('— 前台（1F 主厅）—')
const e0 = fresh()
{
  const e = e0
  const desk = C.conciergeDesk(e)
  ok(!!desk, '1F 出生主厅找到前台位置', desk)
  run(e, 1)
  const c = C.findConcierge(e)
  ok(!!c && c.cg!.mode === 'desk', '进 1F 后看门人在前台待机')
  if (c && desk) {
    ok(Math.hypot(c.x - (desk.ax - e.map.inf.ox), c.y - (desk.ay - e.map.inf.oy)) < 0.05 && Math.abs(c.facing - desk.f) < 1e-6, '站在柜台后、面朝大厅')
    run(e, 5)
    ok(e.map.entities.filter((x: any) => x.def.type === 'concierge').length === 1, '全楼只有一位')
    // 柜台碰撞：把玩家放进柜台中央 → 被推出去
    const [cx, cy] = C.cgLocal(desk.f, C.CG_DESK.center[0], C.CG_DESK.center[1])
    const sx = e.player.x, sy = e.player.y
    e.player.x = c.x + cx; e.player.y = c.y + cy; step(e)
    const u = Math.abs((e.player.x - c.x - cx) * Math.sin(desk.f) - (e.player.y - c.y - cy) * Math.cos(desk.f)), v = Math.abs((e.player.x - c.x - cx) * Math.cos(desk.f) + (e.player.y - c.y - cy) * Math.sin(desk.f))
    ok(u >= C.CG_DESK.half[0] - 1e-3 || v >= C.CG_DESK.half[1] - 1e-3, '柜台挡人（玩家被推出柜台矩形）')
    e.player.x = sx; e.player.y = sy
  }
  const e2 = fresh(); e2.hotel.floor = 3; e2.loadLevel(5, { mapSeed: SEED + 1, firstVisit: true }); e2.map.entities = []; e2.hotel.floor = 3
  run(e2, 2)
  ok(!C.conciergeDesk(e2) && !C.findConcierge(e2), '别的楼层平时没有前台、他也不在')
}

console.log('— 出口判定：只对真出口 —')
const exitCase = (kind: string, approach = true, dist = 9) => {
  const e = fresh()
  const ex = e.map.exits.find((x: any) => x.def.kind === kind)
  if (!ex) return { skipped: true }
  e.map.exits = e.map.exits.filter((x: any) => x.def.kind === kind) // 只留这一种出口（出生大厅里古典楼梯和电梯挨得很近）
  run(e, 0.5)
  // 从出口外 dist 米处朝 / 背向出口走
  let start: any = null
  for (let a = 0; a < Math.PI * 2 && !start; a += 0.1) { const x = ex.x + Math.cos(a) * dist, y = ex.y + Math.sin(a) * dist; if (walk(e, x, y) && e.los(x, y, ex.x, ex.y)) start = { x, y } }
  if (!start) return { skipped: true }
  e.player.x = start.x; e.player.y = start.y
  const c = C.findConcierge(e); if (c) { c.x = start.x + 30; c.y = start.y + 30 } // 前台离得远也无所谓
  let triggered = false
  run(e, 3.5, 0.05, () => {
    const dx = ex.x - e.player.x, dy = ex.y - e.player.y, d = Math.hypot(dx, dy), sgn = approach ? 1 : -1
    if (d > 4.2 || !approach) { e.player.x += sgn * dx / d * 1.6 * 0.05; e.player.y += sgn * dy / d * 1.6 * 0.05 }
    faceTo(e, e.player.x + sgn * dx, e.player.y + sgn * dy)
    const k = C.findConcierge(e); if (k?.cg && (k.cg.mode === 'blink' || k.cg.mode === 'talk') && k.cg.after === 'talk') triggered = true
  })
  return { triggered }
}
{
  const a = exitCase('oldstairs'); ok(!a.skipped && a.triggered, '朝古典楼梯（真出口）走 → 眨眼拦截搭话', a)
  const b = exitCase('oldstairs', false); ok(!b.skipped && !b.triggered, '背向出口走（正确方向）→ 不拦', b)
  const c = exitCase('elevatorshaft'); ok(!c.skipped && !c.triggered, '朝电梯走 → 不拦（电梯不算真出口）', c)
  // 人工放一个电梯出口与一个深色木门，各走一遍
  const e = fresh(); run(e, 0.3)
  const p = e.player, sp = spotFar(e, p, 8, 9)!
  const fake = { def: { kind: 'elevatorshaft', name: '电梯', dest: 3 }, x: sp.x, y: sp.y, discovered: false }
  e.map.exits = [fake]
  let trig = false
  run(e, 3, 0.05, () => { const dx = sp.x - p.x, dy = sp.y - p.y, d = Math.hypot(dx, dy); if (d > 1) { p.x += dx / d * 0.08; p.y += dy / d * 0.08 } faceTo(e, sp.x, sp.y); const k = C.findConcierge(e); if (k?.cg?.mode === 'blink' || k?.cg?.mode === 'talk') trig = true })
  ok(!trig, '贴到电梯门口也不拦')
  fake.def.kind = 'darkwooddoor'; p.x = sp.x + (p.x - sp.x) * 3; p.y = sp.y + (p.y - sp.y) * 3
  const e3 = fresh(); run(e3, 0.3); const p3 = e3.player, sp3 = spotFar(e3, p3, 8, 9)!
  e3.map.exits = [{ def: { kind: 'darkwooddoor', name: '深色木门', dest: 9 }, x: sp3.x, y: sp3.y, discovered: false }]
  let trig3 = false
  run(e3, 3, 0.05, () => { const dx = sp3.x - p3.x, dy = sp3.y - p3.y, d = Math.hypot(dx, dy); if (d > 1) { p3.x += dx / d * 0.08; p3.y += dy / d * 0.08 } faceTo(e3, sp3.x, sp3.y); const k = C.findConcierge(e3); if (k?.cg?.mode === 'blink' || k?.cg?.mode === 'talk') trig3 = true })
  ok(trig3, '同样走向深色木门（真出口）→ 拦截')
  ok(C.isTrueExit('boilerdeep') && C.isTrueExit('oldstairs') && C.isTrueExit('darkwooddoor') && !C.isTrueExit('elevatorshaft'), '真出口表：古典楼梯 / 完全黑暗的门 / 深色木门；电梯不算')
}

console.log('— 追踪：眨眼瞬移只在不被注视时 —')
{
  const e = fresh(); run(e, 0.5)
  const c = C.findConcierge(e)!
  const sp = spotFar(e, { x: c.x, y: c.y }, 10, 14)!
  e.player.x = sp.x; e.player.y = sp.y
  e.hotel.attn = 80
  let blinkWatched = 0, blinks = 0, armWatch = 0, frames = 0
  run(e, 12, 0.05, () => {
    faceTo(e, c.x, c.y) // 一直盯着他
    frames++
    if (c.cg!.mode === 'blink') { if (C.playerWatching(e, c.x, c.y)) blinkWatched++; blinks++ }
    if (c.cg!.clip === 'armWatch') armWatch++
  })
  const d1 = Math.hypot(c.x - e.player.x, c.y - e.player.y)
  ok(c.cg!.mode === 'track' || c.cg!.mode === 'talk', '关注度「清理」档 → 离开前台追踪', c.cg!.mode)
  ok(blinks === 0, '一直被注视：一次也没有眨眼瞬移', { blinks })
  ok(armWatch > frames * 0.4, '被注视时站定、抬起前臂看你（armWatch）', { armWatch, frames })
  // 转过身去：不被注视 → 眨眼靠近
  const d0 = Math.hypot(c.x - e.player.x, c.y - e.player.y)
  let landedSeen = 0, blinkN = 0, firstBlinkT = -1, tt = 0
  run(e, 8, 0.05, (t) => {
    tt = t
    e.player.facing = Math.atan2(c.y - e.player.y, c.x - e.player.x) + Math.PI // 背对
    const s = c.cg!
    if (s.mode === 'blink' && s.modeT < 0.06) { blinkN++; if (firstBlinkT < 0) firstBlinkT = t }
    if (s.mode === 'blink' && s.blinkDone && s.modeT < C.CONCIERGE_BLINK_AT + 0.1) { if (C.playerWatching(e, c.x, c.y)) landedSeen++ }
  })
  void tt
  const d2 = Math.hypot(c.x - e.player.x, c.y - e.player.y)
  ok(blinkN >= 1 && firstBlinkT <= CC.blinkEvery[1] + 0.2, '背过身去 → 眨眼瞬移靠近', { blinkN, firstBlinkT })
  ok(landedSeen === 0, '落点都在玩家视线外')
  ok(d2 < d0 - 2 || c.cg!.mode === 'talk', '距离明显缩短 / 已到身边搭话', { d0: +d0.toFixed(1), d1: +d1.toFixed(1), d2: +d2.toFixed(1), mode: c.cg!.mode })
}

console.log('— 搭话 → X 跟他走 —')
{
  const e = fresh(); run(e, 0.3)
  const p = e.player
  const c = C.conciergeIntercept(e)!
  run(e, 1.7, 0.05, () => { p.facing += 0 })
  ok(c.cg!.mode === 'talk', '眨眼到身后 → 搭话', c.cg!.mode)
  ok(Math.hypot(c.x - p.x, c.y - p.y) < 3 && !C.playerWatching(e, c.x, c.y) || c.cg!.mode === 'talk', '出现在玩家身后')
  const sa = specialAction(e)
  ok(sa?.id === 'concierge-follow', 'X 提示「跟他走」', sa)
  e.specialPressed = true; C.conciergePress(e)
  ok(c.cg!.mode === 'lead' && !!c.cg!.lead, '按 X → 他领路')
  const rel0 = e.hotel.staff.concierge ?? 0
  run(e, 30, 0.05, () => { const dx = c.x - p.x, dy = c.y - p.y, d = Math.hypot(dx, dy); if (d > 2) { p.x += dx / d * 0.07; p.y += dy / d * 0.07 } })
  ok(C.conciergePassed(e) && (e.hotel.staff.concierge ?? 0) > rel0, '到了 → 放行一段时间、关系 +', { rel: e.hotel.staff.concierge })
  ok(C.conciergeSave(e).follows === 1 && C.conciergeSave(e).talks === 1, '前台记录：搭话 1 · 跟他走 1')
}

console.log('— 拒绝 → 追逐 → 扑倒 → 捆绑 → 挣脱 / 升降梯 → 13 楼 —')
{
  const e = fresh(); run(e, 0.3)
  const p = e.player
  const c = C.conciergeIntercept(e)!
  run(e, 1.7)
  // 走开 = 拒绝
  const away = spotFar(e, p, 6, 8)!
  run(e, 2, 0.05, () => { const dx = away.x - p.x, dy = away.y - p.y, d = Math.hypot(dx, dy); if (d > 0.3) { p.x += dx / d * 0.12; p.y += dy / d * 0.12 } })
  ok(c.cg!.mode === 'chase' || c.cg!.mode === 'tackle' || c.cg!.mode === 'blink', '走开 = 拒绝 → 追逐', c.cg!.mode)
  ok(CC.run > 6.0, `追逐速度 ${CC.run} m/s 比玩家冲刺（6.0）快`)
  // 站着不动 → 被扑倒
  let tackled = false
  run(e, 6, 0.05, () => { if (c.cg!.mode === 'tackle' && c.cg!.phase === 1) tackled = true })
  ok(tackled || c.cg!.mode === 'bind', '追上 → 扑倒', c.cg!.mode)
  ok(p.hp < 100, '扑倒造成伤害', p.hp)
  ok(C.conciergeCaptured(e), '被扑倒 / 捆住时玩家被接管（movement 钩子）')
  // 捆绑中连按挣脱
  run(e, 3, 0.05, () => { if (c.cg!.mode === 'bind') C.conciergeStrugglePress(e, 1) })
  ok(c.cg!.mode === 'stagger' || c.cg!.mode === 'chase', '捆绑时连按 → 挣脱，他愣一下', c.cg!.mode)
  ok(C.conciergeSave(e).escapes === 1 && !C.conciergeCaptured(e), '挣脱计数 + 解除接管')
  // 第二次：不挣扎 → 拖行 → 升降梯 → 黑屏 → 13 楼
  p.equip.pockets[0] = { type: 'keycard', count: 1 }; p.equip.pockets[1] = { type: 'key437', count: 1 }; p.backpack[0] = { type: 'skeleton', count: 1 }; p.backpack[1] = { type: 'silverware', count: 2 }
  const attn0 = e.hotel.attn, floor0 = e.hotel.floor
  let hpB = 0, sanB = 0
  let sawDrag = false, sawStuff = false, sawBlack = false, sawPull = false, ropeEvents = 0
  ;(audio as any).conciergeRope = () => { ropeEvents++ }
  run(e, 75, 0.05, () => {
    const s = c.cg!
    if (s.mode === 'drag') sawDrag = true
    if (s.mode === 'stuff') sawStuff = true
    if (s.clip === 'pullRope') sawPull = true
    if (C.conciergeBlackout(e)?.phase === 'lift' && !sawBlack) { sawBlack = true; hpB = p.hp; sanB = p.sanity }
  }, true)
  ok(sawDrag && sawStuff && sawPull, '不挣扎 → 拖到升降梯 → 塞进去 → 拉绳', { sawDrag, sawStuff, sawPull })
  ok(sawBlack && ropeEvents >= 4, '黑屏 + 拉绳声', { ropeEvents })
  ok(e.hotel.floor !== floor0 && e.hotel.floor >= 1 && e.hotel.floor <= 12 && (e.hotel as any).cgWake === 1 && e.transition?.dest === 5, '换到随机楼层（1–12、不是原楼层），等待员工通道醒来', { floor: e.hotel.floor })
  ok(!p.equip.pockets[0] && !p.equip.pockets[1] && !p.backpack[0] && p.backpack[1]?.type === 'silverware', '钥匙类（门禁卡 / 437 / 万能钥匙）全丢，别的东西还在')
  ok(e.hotel.attn >= attn0 + CC.liftAttn - 1e-6, `关注度 +${CC.liftAttn}`, { attn0, attn: e.hotel.attn })
  ok(p.hp === Math.max(1, hpB - CC.liftHp) && p.sanity === Math.max(0, sanB - CC.liftSanity), `HP −${CC.liftHp} / 理智 −${CC.liftSanity}`, { hpB, hp: p.hp, sanB, san: p.sanity })
  ok(C.conciergeSave(e).lifts === 1 && C.conciergeSave(e).binds >= 1, '前台记录：13 楼 1 次')
  // 抵达：真的重新生成楼层 → 员工通道
  const fl = e.hotel.floor
  e.transition = null
  e.loadLevel(5, { mapSeed: SEED + 7, firstVisit: true })
  const reg = l5RegionAt(e.map.inf.seed, p.x + e.map.inf.ox, p.y + e.map.inf.oy)
  const exD = e.map.exits.filter((x: any) => C.isTrueExit(x.def.kind)).reduce((a: number, x: any) => Math.min(a, Math.hypot(x.x - p.x, x.y - p.y)), 99)
  ok(e.hotel.floor === fl && !(e.hotel as any).cgWake && walk(e, p.x, p.y), '抵达新楼层，醒来位置可站')
  ok(reg?.variant === 'maintenance' || exD >= 12, '在员工通道（维修区）醒来；没有维修区时离真出口 ≥ 12 m', { variant: reg?.variant, exD: +exD.toFixed(1) })
}

console.log('— 金属分心 —')
{
  const e = fresh(); run(e, 0.3)
  const p = e.player
  const sp = spotFar(e, p, 6, 8)!
  const c = placeAt(e, sp.x, sp.y, 'chase', 'run')
  e.map.items.push({ id: 1.5, type: 'silverware', count: 1, x: (p.x + sp.x) / 2 + 0.3, y: (p.y + sp.y) / 2, dropped: e.time })
  let gnawT = 0, tackled = false
  run(e, 20, 0.05, () => { if (c.cg!.mode === 'gnaw') gnawT += 0.05; if (c.cg!.mode === 'tackle' || c.cg!.mode === 'bind') tackled = true; p.facing = Math.atan2(sp.y - p.y, sp.x - p.x) + Math.PI })
  ok(gnawT >= CC.gnawT.silverware - 0.2, `丢下银餐具 → 他去啃（约 ${CC.gnawT.silverware} s）`, { gnawT: +gnawT.toFixed(1) })
  ok(!e.map.items.some((it: any) => it.id === 1.5), '餐具被啃掉了')
  ok(C.conciergeSave(e).gnaws === 1, '啃金属计数')
  const e2 = fresh(); run(e2, 0.3)
  const c2 = placeAt(e2, e2.player.x + 4, e2.player.y, 'desk', 'idle')
  e2.map.items.push({ id: 2.5, type: 'bread', count: 1, x: c2.x + 1, y: c2.y, dropped: e2.time })
  step(e2)
  ok(c2.cg!.mode !== 'goMetal', '不是金属的东西他不理')
  void tackled
}

console.log('— 茶歇 / 不管的人 —')
{
  const e = fresh(); run(e, 0.3)
  const w = C.conciergeDebug(e); w.teaUntil = e.time + 60; w.teaNext = e.time + 9999
  run(e, 1)
  const c = C.findConcierge(e)!
  ok(c.cg!.mode === 'tea' && c.cg!.clip === 'teaBreak', '茶歇：在前台后喝茶', c.cg!.mode)
  const ex = e.map.exits.find((x: any) => C.isTrueExit(x.def.kind))
  if (ex) { e.player.x = ex.x + 2.5; e.player.y = ex.y; if (!walk(e, e.player.x, e.player.y)) { e.player.x = ex.x; e.player.y = ex.y + 2.5 } }
  run(e, 3)
  ok(c.cg!.mode === 'tea' && C.conciergeOnTea(e), '茶歇时贴着真出口也不拦')
  e.hotelShift = { ...e.hotelShift, phase: 'shift' }; step(e); run(e, 7)
  ok(!C.conciergeOnTea(e), '换班开始 → 茶歇结束，回到岗位')
  // 睡觉 / 躲着发抖
  const e2 = fresh(); run(e2, 0.3)
  e2.hotel.attn = 90
  const p2 = e2.player
  p2.crouching = true
  const w2 = C.conciergeDebug(e2); w2.hideT = CC.hideT + 1
  ok(C.conciergeIgnores(e2), '蹲着不动躲在客房里（2 s）→ 他不管')
  w2.hideT = 0
  ok(!C.conciergeIgnores(e2), '站起来就又被盯上')
}

console.log('— 挂眼提示 —')
{
  const e = fresh(); run(e, 0.3)
  const c = C.findConcierge(e)!
  const n0 = C.conciergeEyeCount(e)
  run(e, 60)
  ok(C.conciergeEyeCount(e) === n0, '在前台待机（没盯上你）：不闪眼')
  const sp = spotFar(e, { x: c.x, y: c.y }, 12, 15)!
  e.player.x = sp.x; e.player.y = sp.y; e.hotel.attn = 80
  const T = 200, n1 = C.conciergeEyeCount(e)
  let maxOn = 0, cur = 0, shown = 0
  run(e, T, 0.05, () => {
    e.player.facing = Math.atan2(c.y - e.player.y, c.x - e.player.x) // 盯着他，免得他贴上来搭话结束追踪
    const f = C.conciergeEyeFlash(e)
    if (f) { cur += 0.05; shown++; if (f.x < 2 || f.x > 98 || f.y < 2 || f.y > 98) maxOn = 99 } else { maxOn = Math.max(maxOn, cur); cur = 0 }
    if (c.cg!.mode === 'talk') { c.cg!.mode = 'track'; c.cg!.clip = 'walk' }
    if (Math.hypot(c.x - e.player.x, c.y - e.player.y) < 5) { c.x = sp.x + (c.x - sp.x) * 3; c.y = sp.y + (c.y - sp.y) * 3; if (!walk(e, c.x, c.y)) { c.x = sp.x + 8; c.y = sp.y } }
  })
  const k = C.conciergeEyeCount(e) - n1
  ok(k >= Math.floor(T / CC.eyeEvery[1]) - 1 && k <= Math.ceil(T / CC.eyeEvery[0]) + 1, `被盯上 ${T} s 闪眼 ${k} 次（每 ${CC.eyeEvery[0]}–${CC.eyeEvery[1]} s 一次）`)
  ok(maxOn <= CC.eyeShow + 0.06, `每次只闪 ${CC.eyeShow} s 左右，位置在屏幕边缘`, { maxOn: +maxOn.toFixed(2) })
}

console.log('— 不可击杀 / 437 钥匙 / 存档 —')
{
  const e = fresh(); run(e, 0.3)
  const c = C.findConcierge(e)!
  c.hp = -50; ok(C.conciergeKillGuard(e, c) && c.hp === c.def.hp && !c.dead, '打不死')
  ok(c.cg!.mode === 'chase' && c.cg!.rageT > 0, '挨打 → 立刻追你，而且更快')
  const e2 = fresh(); run(e2, 0.5)
  const c2 = C.findConcierge(e2)!
  e2.player.x = c2.x + Math.cos(c2.facing) * 1.4; e2.player.y = c2.y + Math.sin(c2.facing) * 1.4
  e2.player.hotbar[0] = { type: 'key437', count: 1 }
  const sa = specialAction(e2)
  ok(sa?.id === 'concierge-key', '前台 X：交还 437 号钥匙', sa)
  e2.specialPressed = true; C.conciergePress(e2)
  ok(!e2.player.hotbar[0] && C.conciergeSave(e2).key437 === 1 && (e2.hotel.staff.concierge ?? 0) >= CC.rel.key && C.conciergePassed(e2), '钥匙交出 → 关系大幅 +、长时间放行')
  ok(c2.cg!.clip === 'giveKey' && c2.cg!.rev, '他收下钥匙挂回墙上（giveKey 倒放）')
  const snap: any = snapshot(e2)
  const back = H.restoreHotel(JSON.parse(JSON.stringify(snap.hotel ?? e2.hotel)))
  ok(back.concierge?.key437 === 1 && back.concierge.talks === C.conciergeSave(e2).talks, '存档：前台记录随 hotel 保存 / 恢复')
}

console.log('— 渲染 —')
{
  const THREE = await import('three')
  const { buildConciergeEntityMesh, animateConciergeEntity, CONCIERGE_LOD } = await import('../src/game/renderer/conciergeRender')
  const g = buildConciergeEntityMesh()
  const box = new THREE.Box3().setFromObject(g.userData.lod1)
  ok(box.max.y > 1.9 && box.max.y < 2.15, `模型高约 2 m（${box.max.y.toFixed(2)}）`)
  const e = fresh(); run(e, 0.5)
  const c = C.findConcierge(e)!, dk = C.conciergeDesk(e)!
  const ctx = { desk: { x: dk.ax - e.map.inf.ox, y: dk.ay - e.map.inf.oy, f: dk.f }, distance: 30 }
  g.position.set(c.x, 0, c.y); g.rotation.y = -c.facing
  let threw = ''
  try { for (let i = 0; i < 10; i++) animateConciergeEntity(g, c, 0.05, 0, ctx) } catch (er) { threw = String(er) }
  ok(!threw, '前台待机：动画 / 前台道具每帧更新不报错', threw || undefined)
  g.updateMatrixWorld(true)
  const deskSet = g.children.find((o: any) => o.name === 'conciergeDeskSet')!
  const wp = new THREE.Vector3(); deskSet.getWorldPosition(wp)
  ok(Math.hypot(wp.x - c.x, wp.z - c.y) < 0.05 && deskSet.visible, '前台挂在世界坐标的站位上')
  // 转身：柜台不跟着转
  c.facing += 1; g.rotation.y = -c.facing; animateConciergeEntity(g, c, 0.05, 0, ctx); g.updateMatrixWorld(true)
  const q = new THREE.Quaternion(); deskSet.getWorldQuaternion(q); const yaw = new THREE.Euler().setFromQuaternion(q, 'YXZ').y
  ok(Math.abs(Math.atan2(Math.sin(yaw - (-dk.f + Math.PI / 2)), Math.cos(yaw - (-dk.f + Math.PI / 2)))) < 1e-4, '实体转身时前台不跟着转')
  ok(!g.userData.lod0, `${CONCIERGE_LOD.build} m 外不建 LOD0`)
  try {
    const clips: any[] = ['walk', 'run', 'armWatch', 'blinkTeleport', 'talk', 'trip', 'bind', 'drag', 'stuffLift', 'pullRope', 'wipeHands', 'teaBreak', 'gnawMetal', 'phone', 'giveKey']
    for (const cl of clips) { c.cg!.clip = cl; c.cg!.seq++; c.cg!.modeT = 0.5; c.cg!.speed = 2; animateConciergeEntity(g, c, 0.05, 0, { ...ctx, distance: 20 }) }
  } catch (er) { threw = String(er) }
  ok(!threw, '全部片段在实体里播放不报错', threw || undefined)
  c.cg!.lift = { x: c.x + 4, y: c.y, f: Math.PI }; c.cg!.mode = 'stuff'; c.cg!.phase = 0; c.cg!.modeT = 1
  animateConciergeEntity(g, c, 0.05, 0, { desk: null, distance: 20 })
  const lift = g.children.find((o: any) => o.name === 'dumbwaiter' && o.visible)
  ok(!!lift, '别的楼层抓到人：墙上出现送菜升降梯')
  const t0 = performance.now(); animateConciergeEntity(g, c, 0.05, 0, { ...ctx, distance: 5 }); const ms = performance.now() - t0
  ok(!!g.userData.lod0 && g.userData.lod0.visible && !g.userData.lod1.visible, `走近（< ${CONCIERGE_LOD.near} m）切到 LOD0（首次构建 ${ms.toFixed(0)} ms）`)
  animateConciergeEntity(g, c, 0.05, 0, { ...ctx, distance: 10 })
  ok(g.userData.lod0.visible, '9–11 m 之间保持当前 LOD（防抖）')
  animateConciergeEntity(g, c, 0.05, 0, { ...ctx, distance: 12 })
  ok(!g.userData.lod0.visible && g.userData.lod1.visible, '11 m 外回到 LOD1')
}

console.log(`\n${n - fails}/${n} 通过`)
if (fails) process.exit(1)
