/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// L5 整层联动无头测试（真实 Engine + 真实无限 L5 地图）：一个存档里依次触发
//   管家 / 看门人 / 行李员（同时在场抢玩家）→ 迎宾女郎前台登记房卡 → 厨师 / 爵士脑 / 野兽（全局步进 + 注视）
//   → 赌场兑换（稀有池命运之骰 + 凭证）→ O18 留声机陷阱 → 房卡开门 / 储物柜 → O666 投骰 → 存档往返
// 检查：状态机互不冲突（同一时刻最多一个员工在「抓 / 拖 / 清理」玩家）、关注度叠加钳制、HUD 情境动作唯一、存档读写往返。
import { createCanvas } from '@napi-rs/canvas'
const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const H = await import('../src/game/engine/l5Hotel')
const O = await import('../src/game/engine/l5Objects')
const { snapshot } = await import('../src/game/engine/save')
const { audio } = await import('../src/game/core/audio')
const { spawnMaid } = await import('../src/game/engine/maidAI')
const { spawnBellhop } = await import('../src/game/engine/bellhopAI')
const { spawnConcierge } = await import('../src/game/engine/conciergeAI')
const { beastSpawnPeripheral } = await import('../src/game/engine/beastAI')
const { casinoBuy, casinoSave } = await import('../src/game/engine/casinoAI')
const { hotelRegisterCard } = H
const A = await import('../src/game/engine/beastAI')
const CA = await import('../src/game/engine/casinoAI')
const J = await import('../src/game/engine/jazzAI')
const { BEAST_CLIPS } = await import('../src/game/renderer/beastAnim')
const { look } = await import('../src/game/renderer/shared')
const { JK } = J; JK.beastSitP = 0
const { CK } = await import('../src/game/engine/chefAI')
const { specialAction: activeSpecial } = await import('../src/game/engine/special')
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (k !== 'constructor' && typeof (audio as any)[k] === 'function') (audio as any)[k] = () => {}

let fails = 0, n = 0
const ok = (c: unknown, m: string, dbg?: unknown) => { n++; console.log(`${c ? '✔' : '✘'} ${m}${dbg !== undefined ? '  ' + JSON.stringify(dbg) : ''}`); if (!c) fails++ }
const msgs: string[] = []
const fresh = (seed: number, floor = 1) => {
  const e: any = new Engine(); e.seed = seed
  e.hotel = H.freshHotel(); e.hotel.floor = floor
  e.loadLevel(5, { mapSeed: seed + floor, firstVisit: true }); e.introT = 0
  e.emit = () => {}; e.persist = () => {}
  const m0 = e.msg.bind(e); e.msg = (t: string, k?: string) => { msgs.push(t); try { m0(t, k) } catch { /* */ } }
  e.map.entities = e.map.entities.filter((x: any) => !['maid', 'bellhop', 'concierge'].includes(x.def?.type))
  Object.assign(e.player, { hp: 100, sanity: 80, hunger: 100, thirst: 100, stamina: 100 })
  return e
}
const GRAB = new Set(['clean', 'tackle', 'bind', 'drag', 'stuff', 'grab', 'carry'])
const grabbers = (e: any) => e.map.entities.filter((x: any) => !x.dead && Object.values(x).some((v: any) => v && typeof v === 'object' && typeof v.mode === 'string' && GRAB.has(v.mode))).map((x: any) => x.def.type)
const step = (e: any, secs: number, each?: (t: number) => void) => { let maxG = 0, err: unknown = null; for (let t = 0; t < secs; t += 1 / 30) { try { each?.(t); e.update(1 / 30) } catch (x) { err = x; break } maxG = Math.max(maxG, grabbers(e).length) } return { maxG, err } }

// ---- 1. 三个员工同时在场 + 高关注度：不同时抓玩家 ----
console.log('— 员工同时在场 —')
{
  const e: any = fresh(5151)
  const p = e.player
  spawnMaid(e, { x: p.x + 2, y: p.y }); spawnBellhop(e, { x: p.x - 2, y: p.y }); spawnConcierge(e, { x: p.x, y: p.y + 3 }, 'chase')
  e.hotel.attn = 95
  const r = step(e, 40, () => { e.hotel.attn = Math.min(100, e.hotel.attn + 0.5) })
  ok(!r.err, '40 s 联动步进无异常', r.err ? String(r.err).slice(0, 160) : undefined)
  ok(r.maxG <= 1, `同一时刻最多一个员工在抓 / 拖 / 清理玩家（峰值 ${r.maxG}）`)
  ok(e.hotel.attn >= 0 && e.hotel.attn <= 100, '关注度叠加后仍钳制在 0–100', e.hotel.attn)
}
// ---- 2. 房卡登记 / 补办 / 关注度 ----
console.log('— 房卡 —')
const e: any = fresh(7300, 2)
{
  e.hotel.attn = 10
  ok(hotelRegisterCard(e) === 'new' && e.countItem('roomcard') === 1, '前台登记：拿到房卡')
  ok(hotelRegisterCard(e) === null, '已有房卡不重复发')
  e.consumeItem('roomcard')
  const a0 = e.hotel.attn
  ok(hotelRegisterCard(e) === 'reissue' && Math.abs(e.hotel.attn - a0 - 5) < 1e-6, '丢卡补办：关注度 +5')
  // 找同层一扇上锁的客房门
  H.updateHotel(e, 0.1)
  const doors = e.map.structures.filter((s: any) => s.kind === 'hoteldoor' && s.data?.locked && s.data?.room && s.data?.staff !== 1)
  ok(doors.length >= 2, `本层有上锁客房门（${doors.length}）`)
  if (doors.length >= 2) {
    ok(H.hotelCardCan(e, doors[0]) && H.hotelCardSwipe(e, doors[0]), '第一次刷卡：绑定并打开')
    const card = O.objSave(e).card!
    ok(card.dx === doors[0].x && card.no === doors[0].data.room, '房卡绑定那扇门的房号')
    const other = doors.find((d: any) => d.data.room !== card.no && d.data.locked)
    ok(!other || !H.hotelCardCan(e, other), '房卡只开自己的门（别的门不可刷）')
    e.hotel.floor = 3; ok(!H.hotelCardCan(e, doors[0]), '别的楼层不可刷'); e.hotel.floor = 2
  }
}
// ---- 3. 野兽 / 厨师 / 爵士脑 全局步进 + 赌场兑换 ----
console.log('— 野兽 / 赌场 —')
{
  let err: unknown = null
  try { beastSpawnPeripheral(e) } catch (x) { err = x }
  ok(!err, '野兽余光注视可在 L5 触发', err ? String(err).slice(0, 120) : undefined)
  const r = step(e, 5); ok(!r.err, '野兽 / 厨师 / 爵士脑全局步进 5 s 无异常', r.err ? String(r.err).slice(0, 160) : undefined)
  const cs: any = casinoSave(e); cs.chips = 400; cs.purple = 0
  const before = e.countItem('fatedie')
  ok(casinoBuy(e, 'fatedie') && e.countItem('fatedie') === before + 1 && e.countItem('diereceipt') >= 1 && cs.chips === 250, 'Louie 稀有池：150 筹码换命运之骰 + 购买凭证')
  e.consumeItem('fatedie'); e.addItem('brokendie')
  const chips = cs.chips
  ok(casinoBuy(e, 'fatedie') && e.countItem('fatedie') === 1 && cs.chips === chips && e.countItem('brokendie') === 0, '碎骰子 + 凭证：免费换新')
}
// ---- 4. O666 ----
console.log('— O666 —')
{
  const o = O.objSave(e), hk = H.l5Hooks(e)
  const land = (room: string | null) => { for (let i = 0; i < 400 && o.pend; i++) { e.time += 0.05; O.stepFateDie(e, o, room, 0.05, hk) } } // [l5items 收尾] 结果等骰子停下、图案浮现完才生效
  const f = O.rollFateDie(e, o, null, hk, 0.05); land(null)
  ok(f === 'rare' && e.hotel.attn >= 20, '投出宝箱：稀有物品 + 关注度 +20（停下后生效）', { f, attn: e.hotel.attn })
  ok(O.rollFateDie(e, o, null, hk) === null, '冷却 10 min 内不能再投')
  o.dieCd = 0; e.player.sanity = 30
  ok(O.rollFateDie(e, o, null, hk, 0.25) === 'sanity' && e.player.sanity === 30 && (land(null), e.player.sanity === 100) && o.hallu === 300, '心：理智回满 + 300 s 幻听（停下前不生效）')
  o.dieCd = 0
  const face = O.rollFateDie(e, o, null, hk, 0.62); land(null) // squid 区间
  ok(['squid', 'hotel', 'gambler'].includes(face!) && o.die?.freeze === 10, '乌贼 / 旅馆 / 赌徒：原地不动 10 s', face)
  e.player.x += 1
  O.stepFateDie(e, o, null, 0.1, { ...hk, beastGaze: () => { msgs.push('GAZE') } })
  ok(!o.die && msgs.includes('GAZE'), '动了 → 野兽注视')
  e.player.x -= 1
  o.dieCd = 0
  const wf = O.rollFateDie(e, o, 'room-A', hk, 0.6); land('room-A'); ok(wf === 'weapon' && o.die?.spin! >= 300, '封闭房间投出枪面：落地后转 5 min', wf)
  O.stepFateDie(e, o, 'room-B', 0.1, hk)
  ok(!o.die, '转动期间离开房间 → 作废')
}
// ---- 5. O18：找一间 3% 的留声机客房 ----
console.log('— O18 —')
{
  let g: any = null, ph: any = null
  for (let sd = 1; sd < 80 && !ph; sd++) for (const fl of [1, 2, 4]) {
    const t: any = fresh(sd * 977, fl); const s = t.map.structures.find((x: any) => x.kind === 'phonograph' && x.data?.o18)
    if (s) { g = t; ph = s; break }
  }
  ok(!!ph, '生成：能找到带 O18 留声机的客房')
  if (ph) {
    const p = g.player; const cand = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]].map(([dx, dy]) => ({ x: ph.x + 0.5 + dx, y: ph.y + 0.5 + dy })).find((q) => !g.map.structures.some((s: any) => s.solid && Math.floor(q.x) >= s.x && Math.floor(q.x) < s.x + (s.w || 1) && Math.floor(q.y) >= s.y && Math.floor(q.y) < s.y + (s.h || 1)))!
    p.x = cand.x; p.y = cand.y
    g.addItem('roomcard'); hotelRegisterCard(g)
    const s0 = p.sanity
    for (let i = 0; i < 60; i++) H.updateHotel(g, 0.1)
    ok(H.hotelDoorBlocked(g), '进门 4 s 后门锁死（O18）')
    ok(p.sanity < s0 - 2, '理智持续下降', { s0, s: p.sanity })
    ok(Math.abs(O.o18ClockOffset(g)) >= 0, 'HUD 时钟偏移可读')
    g.specialHeld = true
    for (let i = 0; i < 34; i++) H.updateHotel(g, 0.1)
    g.specialHeld = false
    ok(!H.hotelDoorBlocked(g) && ph.data.on === 0, '长按 X 3 s 抬唱针：门开 + 留声机停')
    for (let i = 0; i < 20; i++) H.updateHotel(g, 0.1)
    ok(!H.hotelDoorBlocked(g), '停下的留声机本局不再触发')
    const snap: any = snapshot(g)
    const back = H.restoreHotel(JSON.parse(JSON.stringify(snap.hotel)))
    ok(back.objs?.smashed.length === 1 && back.objs.card?.no === O.objSave(g).card?.no, '存档往返：O18 已停 / 房卡保留')
  }
}

// ---- 7. 三条大流程逐项真正触发：野兽签约 / 关注度第二次满拖进赌场 + 正余额出门 / 爵士听一场 ----
// 每条都带着前面攒下的 O18 已停 / 房卡 / 骰子冷却状态进场，结束后核对这些状态原样保留、员工不抢玩家。
console.log('— 联动：野兽签约 / 赌场拖入出门 / 爵士听一场 —')
{
  const keep = (g: any) => JSON.stringify({ card: O.objSave(g).card, smashed: O.objSave(g).smashed, cd: O.objSave(g).dieCd, locker: O.objSave(g).locker })
  const seed = (g: any) => { const o = O.objSave(g); o.card = { no: 214, floor: 2, dx: 3, dy: 4 }; o.smashed = ['o18-test']; o.dieCd = 9999; o.locker = [{ type: 'almondwater', count: 1 }] }
  const upd = (g: any, sec: number, until?: () => boolean) => { let maxG = 0, err: unknown = null; for (let t = 0; t < sec; t += 1 / 30) { if (until?.()) break; try { g.update(1 / 30) } catch (x) { err = x; break } maxG = Math.max(maxG, grabbers(g).length) } return { maxG, err } }
  // 7a 野兽交易：117 办公室谈生意 → 倒茶 → 选一份 → 推契约递笔 → 握手
  {
    const g: any = fresh(7017, 1); seed(g); const k0 = keep(g)
    g.hotel.pocket = { kind: 'beast', floor: 1, mapSeed: g.mapSeed }; g.loadLevel(117); g.introT = 0
    const b = A.findBeast(g)
    ok(!!b, '117 办公室：野兽在书桌后')
    if (b) {
      g.player.x = b.x + Math.cos(b.facing) * 1.55; g.player.y = b.y + Math.sin(b.facing) * 1.55; g.player.facing = Math.atan2(b.y - g.player.y, b.x - g.player.x)
      g.specialPressed = true; A.beastPress(g)
      const st = (sec: number) => { for (let t = 0; t < sec; t += 0.05) { g.time += 0.05; A.stepBeastGlobal(g, 0.05); A.updateBeast(g, b, 0.05); A.beastControlsPlayer(g); O.stepObjects(g, O.objSave(g), { inO18Room: null, holdX: false, meleeHit: false, bang: false, moved: 0, enclosedRoom: null }, 0.05, H.l5Hooks(g)) } }
      st(BEAST_CLIPS.pourTea.dur + 0.2)
      const v = A.beastDealView(g)
      ok(!!v && v.offers.length > 0, '谈生意：倒茶后打开契约（带着房卡 / 骰子冷却）')
      if (v) {
        A.beastChoose(g, 0); st(BEAST_CLIPS.signContract.dur + BEAST_CLIPS.handshake.dur + 0.5)
        ok(A.beastActive(A.beastSave(g)).length === 1, '签约完成：有一份生效契约', A.beastActive(A.beastSave(g)).length)
      }
      ok(keep(g) === k0, '签约前后：房卡 / O18 已停 / 骰子冷却 / 储物柜原样')
    }
  }
  // 7b 关注度第二次满 → 拖进 5.1（不死亡）→ 兑换抵债后正余额出门
  {
    const g: any = fresh(802, 1); seed(g); g.die = () => { g.over = true }; const k0 = keep(g)
    A.beastSave(g).strikes = 1; g.hotel.attn = 100
    const hp0 = CK.beastHandoffP; (CK as any).beastHandoffP = 0 // 餐厅附近关注度满有概率改交给厨师（不记冒犯，设计分支）；这里固定走赌场分支
    const full = A.beastAttnFull(g)
    const r = upd(g, 25, () => g.levelDef?.id === 119); (CK as any).beastHandoffP = hp0
    ok(full && !r.err && !g.over && g.levelDef?.id === 119, '关注度第二次满：黑灯 → 被拖进赌场（真实 beastAttnFull → strike 流程）', { full, err: r.err ? String(r.err).slice(0, 140) : null, lvl: g.levelDef?.id, over: g.over })
    const cs: any = CA.casinoSave(g)
    ok(cs.purple === -50 && cs.drags === 1, '紫筹码 −50，拖入次数记档', { p: cs.purple, d: cs.drags })
    ok(keep(g) === k0, '拖入后：房卡 / O18 / 骰子冷却 / 储物柜原样')
    ok(CA.casinoExitBlocked(g) && !CA.casinoLeave(g), '负余额：出不了门')
    cs.purple = 0; cs.pchip = 0; cs.chips = 120
    ok(CA.casinoCanLeave(g) && !CA.casinoExitBlocked(g) && CA.casinoLeave(g) && g.transition?.dest === 5, '正余额：可以出门，回 L5')
    const r2 = upd(g, 8, () => g.levelDef?.id === 5)
    ok(!r2.err && g.levelDef?.id === 5 && keep(g) === k0, '回到 L5：房卡 / O18 / 骰子状态仍在', { lvl: g.levelDef?.id, err: r2.err ? String(r2.err).slice(0, 140) : null })
    ok(r.maxG <= 1 && r2.maxG <= 1, '拖入 / 出门全程最多一个员工在抓玩家')
  }
  // 7c 爵士脑：观众区听一场（理智回升、脚步变慢），房卡 / 骰子 / O18 不受影响，员工不抢人
  {
    const g: any = fresh(799, 1); g.hotelShift = { ...g.hotelShift, phase: 'play', tLeft: 300 }; seed(g); const k0 = keep(g)
    const site = J.jazzSite(g)
    ok(!!site, '本层有爵士演出场地')
    if (site) {
      const ox = g.map.inf.ox, oy = g.map.inf.oy, ps = H.hotelPlayStart(g.map.inf.seed, g.time)
      const st = (sec: number) => { for (let t = 0; t < sec; t += 0.05) { g.time += 0.05; J.stepJazzGlobal(g, 0.05); J.stepJazzWorld(g, 0.05); J.jazzPress(g); for (const x of [...g.map.entities]) if (x.def.type === 'jazz') J.updateJazz(g, x, 0.05); look.pitch = 0 } }
      g.time = ps.t0 + 20; g.player.x = site.audC.x - ox; g.player.y = site.audC.y - oy; g.player.facing = 0; look.yaw = -Math.PI / 2; st(0.05)
      g.time = ps.t0 + JK.firstAt + JK.walkOnT + JK.tuneT + 1; st(0.05)
      g.player.sanity = 40
      st(10)
      ok(J.jazzShowOn(g) && g.player.sanity > 40 + JK.listenSan * 10 * 0.9, `听演出：理智回升（40 → ${g.player.sanity.toFixed(1)}）`)
      ok(J.jazzMoveMul(g) === JK.stayMove, '听演出：脚步变慢')
      ok(keep(g) === k0, '听完：房卡 / O18 / 骰子冷却 / 储物柜原样')
      ok(grabbers(g).length === 0, '演出期间没有员工在抓玩家')
    }
  }
}
// ---- 6. 存档往返 + 情境动作唯一 ----
console.log('— 存档 / HUD —')
{
  const snap: any = snapshot(e)
  const back = H.restoreHotel(JSON.parse(JSON.stringify(snap.hotel)))
  ok(JSON.stringify(back.objs?.card) === JSON.stringify(O.objSave(e).card), '房卡存档往返一致')
  ok(back.objs?.dieCd === O.objSave(e).dieCd && back.objs?.hallu === O.objSave(e).hallu, '骰子冷却 / 幻听往返一致')
  if (activeSpecial) { let err: unknown = null; try { activeSpecial(e) } catch (x) { err = x } ok(!err, '情境动作（X）判定无异常') }
}
console.log(`\ncheck:l5-integration ${fails ? '未过' : '全过'}：${n - fails}/${n}`)
process.exit(fails ? 1 : 0)
