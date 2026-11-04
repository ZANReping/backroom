/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// [beast] 第五层的野兽（Entity 18）阶段 3 无头验收（真实 Engine + 真实无限 L5 地图 + 真实 117 办公室）。运行：npm run check:beast
// 覆盖：定义 / 图鉴 / 员工名录 / 数值表（好处池只有三项）· 办公室（坐在书桌后、起身招手、谈生意、倒茶、三份契约、推契约递笔、握手即签、真实握点）
//       · 三项好处（关注度清零 / 理智回满 10 分钟不降 / 稀有物品）· 四种任务（情书交给行李员 / 不奔跑 / 翻画像 / 请行李员喝茶）· 契约未了不给新的
//       · 婉拒（关注度 +10、闪色）· 怀疑（doubtFreeze → colorFlash → reveal → tentacleGrab → 强签）· 动手 = 怀疑
//       · 违约（L5 熄灯 → 背后缠抓 → 拖进办公室 → 强签苛刻契约：交出物品 / 理智上限 −20）· 第二次再犯死亡 · 别的层违约回 L5 后执行
//       · 关注度 100 = 野兽现身（取代旧注视）· 余光（门槛、角度 35°–70°、被看见 −3 理智 +3 关注、正视即 vanish、离开余光悄悄消失、频率随理智 / 契约）
//       · 画像换脸门槛 · 存档往返 · 渲染（LOD、握点、vanish 淡出、真身形态）
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
const A = await import('../src/game/engine/beastAI')
const B = await import('../src/game/engine/bellhopAI')
const { specialAction } = await import('../src/game/engine/special')
const { ENTITIES, entitySpawnLevels } = await import('../src/game/entities')
const { snapshot } = await import('../src/game/engine/save')
const { audio } = await import('../src/game/core/audio')
const { L5_STAFF } = await import('../src/game/content/l5Staff')
const { ITEMS } = await import('../src/game/content/items')
const { killCheck } = await import('../src/game/engine/combat')
const { BEAST_CLIPS } = await import('../src/game/renderer/beastAnim')
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (k !== 'constructor' && typeof (audio as any)[k] === 'function') (audio as any)[k] = () => {}
const { BE } = A

let fails = 0, n = 0
const ok = (c: unknown, m: string, dbg?: unknown) => { n++; console.log(`${c ? '✔' : '✘'} ${m}${dbg !== undefined ? '  ' + JSON.stringify(dbg) : ''}`); if (!c) fails++ }
const SEED = 7018
const events: string[] = []
const prep = (e: any) => {
  e.emit = (ev: any) => { events.push(ev.kind) }; e.persist = () => {}
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
/** 进 117 办公室（不走过场：直接 loadLevel，和 level.ts 一样会调 hotelPocketArrive → beastOfficeArrive） */
const office = (e: any) => {
  e.hotel.pocket = { kind: 'beast', floor: e.hotel.floor, mapSeed: e.mapSeed }
  e.loadLevel(117); e.introT = 0
  e.emit = (ev: any) => { events.push(ev.kind) }; e.persist = () => {}
  return e
}
const stepAll = (e: any, dt = 0.05) => { e.time += dt; A.stepBeastGlobal(e, dt); const b = A.findBeast(e); if (b) A.updateBeast(e, b, dt); A.beastControlsPlayer(e) }
const run = (e: any, sec: number, dt = 0.05, each?: (t: number) => void) => { for (let t = 0; t < sec; t += dt) { each?.(t); stepAll(e, dt) } }
const lookAt = (e: any, x: number, y: number) => { e.player.facing = Math.atan2(y - e.player.y, x - e.player.x) }
/** 余光生成（转着找一个两侧有地方站的朝向） */
const spawnPeri = (e: any) => { for (let a = 0; a < Math.PI * 2; a += 0.25) { e.player.facing = a; const g = A.beastSpawnPeripheral(e); if (g) return g } throw new Error('no peripheral spot') }
const press = (e: any) => { e.specialPressed = true; return A.beastPress(e) }
/** 走到书桌前（他正前方 1.5 m）、面朝他 */
const toDesk = (e: any, b: any, d = 1.55) => { e.player.x = b.x + Math.cos(b.facing) * d; e.player.y = b.y + Math.sin(b.facing) * d; lookAt(e, b.x, b.y) }
const has = (e: any, t: string) => [...e.player.hotbar, ...e.player.backpack].some((s: any) => s?.type === t)
/** 办公室里签下第 i 份（谈生意 → 倒茶 → 选 → 推契约递笔 → 握手） */
const signDeal = (e: any, pick: (o: any) => boolean) => {
  const b = A.findBeast(e)!; toDesk(e, b)
  press(e); run(e, BEAST_CLIPS.pourTea.dur + 0.2)
  const v = A.beastDealView(e)!
  const i = v.offers.findIndex(pick)
  A.beastChoose(e, i); run(e, BEAST_CLIPS.signContract.dur + BEAST_CLIPS.handshake.dur + 0.3)
  return v.offers[i]
}

// ---------------------------------------------------------------------------
console.log('— 定义 / 图鉴 / 员工名录 / 数值表 —')
{
  const d: any = ENTITIES.beast
  ok(d && d.name === '第五层的野兽' && d.damage === 0 && d.naturalSpawn === false && d.codex.no.includes('Entity 18'), '实体定义 beast = Entity 18：无攻击、不进生成池')
  ok(entitySpawnLevels('beast').some((s: any) => s.id === 5 && s.event), '图鉴层级归属：L5（事件生成）')
  const st = L5_STAFF.find((s) => s.id === 'beast')
  ok(!!st && st.no === 'Entity 18' && st.habits.some((h) => h.includes('契约')) && st.habits.some((h) => h.includes('余光')) && st.habits.some((h) => h.includes('情书')), '员工名录：习性写明契约 / 余光 / 情书')
  const offers = A.beastMakeOffers(fresh())
  ok(offers.length === 3 && new Set(offers.map((o: any) => o.boon)).size === 3 && offers.every((o: any) => ['calm', 'fearless', 'rare'].includes(o.boon)), '好处池只有三项：关注度清零 / 理智回满 10 分钟不降 / 稀有物品（每次各一份）', offers.map((o: any) => o.boon))
  const src = readFileSync(new URL('../src/game/engine/beastAI.ts', import.meta.url), 'utf8')
  ok(!/boon.*(免死|exit|出口方向)/.test(src.split('export const BOON_TEXT')[1].split('export const TASK_TEXT')[0]), '「免死一次」「指出本层出口」不在好处池里')
  ok(new Set(offers.map((o: any) => o.task)).size === 3, '三份契约各配一个不同的任务', offers.map((o: any) => o.task))
  ok(BE.rare.every((t) => !!(ITEMS as any)[t]), '稀有物品池都是存在的物品', BE.rare)
  ok(BE.periAttn === 50 && BE.periSan === 40 && Math.abs(BE.periCone[0] - 35 * Math.PI / 180) < 0.01 && Math.abs(BE.periCone[1] - 70 * Math.PI / 180) < 0.01 && BE.boonFearless === 600 && BE.deathAt === 2 && BE.harshSanCut === 20, '数值表：余光门槛 50 / 40、35°–70°、理智锁 600 s、第二次死亡、理智上限 −20')
}

console.log('— 117 办公室：坐在书桌后 / 起身招手 / 谈生意 —')
{
  const e = office(fresh(SEED + 1)); prep(e)
  const b = A.findBeast(e)
  const seat = A.beastOfficeSeat(e)!
  ok(!!b && b.bst!.mode === 'seat' && b.bst!.clip === 'seatedIdle', '进办公室：他坐在书桌后（seatedIdle），不再是空椅')
  const door = e.map.exits[0]
  ok(!!b && Math.abs(b.x - seat.x) < 1e-6 && Math.cos(b.facing - Math.atan2(door.y - b.y, door.x - b.x)) > 0.7, '面朝门口', { f: b?.facing })
  const desk = e.map.structures.find((s: any) => s.kind === 'table' && s.data?.office)
  ok(!!desk && b!.y < desk.y && desk.y - b!.y < 0.35, `书桌近沿在他正前方 ${(desk.y - b!.y).toFixed(2)} m（坐姿桌面道具落在桌上）`)
  ok(e.hotelBook.met.includes('beast') && A.beastSave(e).n.visit === 1, '遇见：登记簿员工名录点亮、来访计数')
  // 玩家在门口（出生点离他 > greetR）
  run(e, 1)
  ok(b!.bst!.mode === 'seat', '你还在门口：他坐着')
  e.player.x = b!.x + Math.cos(b!.facing) * 4.5; e.player.y = b!.y + Math.sin(b!.facing) * 4.5; lookAt(e, b!.x, b!.y)
  run(e, 0.2)
  ok(b!.bst!.mode === 'greet' && b!.bst!.clip === 'beckon' && b!.bst!.blend >= 0.8, '走近：起身招手（beckon，0.8 s 起身混合）')
  ok(!!A.beastHud(e).sub && A.beastHud(e).sub!.includes('请进'), '只用字幕：「啊，请进。快请进。」', A.beastHud(e).sub)
  run(e, BEAST_CLIPS.beckon.dur + 0.1)
  ok(b!.bst!.mode === 'talk' && b!.bst!.clip === 'talk', '招完手：说话（talk）')
  ok(!specialAction(e) || specialAction(e)!.id !== 'beast-deal', '离书桌远：没有「谈生意」')
  toDesk(e, b); run(e, 0.1)
  ok(b!.bst!.mode === 'seat', '走到书桌前：他坐回去')
  const sa = specialAction(e)
  ok(sa?.id === 'beast-deal' && sa.label === '谈生意', 'X 情境：谈生意', sa)
  events.length = 0
  press(e)
  ok(b!.bst!.mode === 'tea' && b!.bst!.clip === 'pourTea', '第一次：先倒茶推杯（pourTea）')
  run(e, BEAST_CLIPS.pourTea.dur + 0.1)
  const v = A.beastDealView(e)
  ok(!!v && !v.forced && v.offers.length === 3 && events.includes('beastdeal'), '倒完茶：契约界面（三份）', v?.offers.map((o: any) => o.title))
  A.beastCloseDeal(e)
  ok(!A.beastDealView(e), 'Esc：再想想（普通交易界面可以关）')
  press(e)
  ok(!!A.beastDealView(e) && b!.bst!.mode === 'seat', '第二次谈：不再倒茶，直接打开')
  const v2 = A.beastDealView(e)!
  ok(JSON.stringify(v2.offers) === JSON.stringify(v!.offers), '同一次来访：契约不重掷')
}

console.log('— 签约：推契约递笔 → 握手（真实握点）→ 好处兑现 —')
{
  const e = office(fresh(SEED + 2)); prep(e)
  const b = A.findBeast(e)!
  e.hotel.attn = 64
  toDesk(e, b); press(e); run(e, BEAST_CLIPS.pourTea.dur + 0.2)
  const v = A.beastDealView(e)!
  const i = v.offers.findIndex((o: any) => o.boon === 'calm')
  A.beastChoose(e, i)
  ok(!A.beastDealView(e) && b.bst!.mode === 'sign' && b.bst!.clip === 'signContract', '选一份：推契约递笔（signContract）')
  run(e, BEAST_CLIPS.signContract.dur + 0.05)
  ok(b.bst!.mode === 'shake' && b.bst!.clip === 'handshake' && !!b.bst!.shakeP, '递完笔：握手（handshake），AI 给出握点')
  ok(e.hotel.attn > 50, '握住之前好处还没兑现')
  const sp1 = [...b.bst!.shakeP!]
  e.player.x += Math.cos(b.facing + Math.PI / 2) * 0.4; e.player.y += Math.sin(b.facing + Math.PI / 2) * 0.4
  run(e, 0.1)
  const sp2 = [...b.bst!.shakeP!]
  ok(Math.abs(sp1[0] - sp2[0]) > 0.05, '握点跟着你的手走（你往一侧挪 0.4 m，他的手也偏过去）', { sp1, sp2 })
  ok(sp2[2] >= 0.32 && sp2[2] <= BE.shakeReach + 1e-9 && sp2[1] >= 0.95 && sp2[1] <= 1.2, '握点夹在他够得着的范围（越过书桌）', sp2)
  run(e, BE.shakeGrip)
  ok(e.hotel.attn === 0, '握住的瞬间：关注度清零')
  const c = A.beastActive(A.beastSave(e))[0]
  ok(!!c && c.state === 'active' && c.left > 0 && c.boon === 'calm', `契约 No.${c?.id} 生效（任务：${c?.task}，${Math.round((c?.limit ?? 0) / 60)} 分钟）`)
  run(e, BEAST_CLIPS.handshake.dur)
  ok(b.bst!.mode === 'seat', '握完手：坐回去')
  press(e)
  ok(!A.beastDealView(e) || A.beastDealView(e)!.offers.length === 0 || A.beastActive(A.beastSave(e)).length === 1, '契约未了：不给新的')
  ok(!A.beastDealView(e) && A.beastDebug(e).subs.some((x: any) => x.text.includes('没了结')), '他说「先把它办完」（字幕队列）', A.beastDebug(e).subs.map((x: any) => x.text))
  ok((A.beastHud(e).contract ?? '').includes(`No.${c.id}`), 'HUD：契约倒计时小条', A.beastHud(e).contract)
}

console.log('— 好处：理智回满且 10 分钟不降 / 稀有物品 —')
{
  const e = office(fresh(SEED + 3)); prep(e)
  e.player.sanity = 31
  signDeal(e, (o) => o.boon === 'fearless')
  ok(e.player.sanity === 100 && A.beastSave(e).fearT > 590, '理智回满，理智锁 600 s', { san: e.player.sanity, fearT: A.beastSave(e).fearT })
  let minSan = 100
  run(e, 300, 0.25, () => { e.player.sanity -= 5; A.stepBeastGlobal(e, 0); minSan = Math.min(minSan, e.player.sanity) })
  ok(minSan >= 100 - 1e-9 && e.player.sanity === 100, '锁定期间任何掉理智都被顶回 100（300 s 内每 0.25 s −5）', minSan)
  ok((A.beastHud(e).fear ?? 0) > 0, 'HUD：「再也不会感到恐惧」剩余时间')
  run(e, 305, 0.5)
  e.player.sanity -= 10; A.stepBeastGlobal(e, 0.05)
  ok(A.beastSave(e).fearT === 0 && e.player.sanity < 95, '10 分钟后到期：理智又会下降了')
  const e2 = office(fresh(SEED + 4)); prep(e2)
  const o = signDeal(e2, (x) => x.boon === 'rare')
  ok(!!o.item && has(e2, o.item), `稀有物品：「${o.item}」进了背包`)
}

console.log('— 任务：情书交给行李员（对接行李员 E135）/ 请茶 / 翻画像 / 不奔跑 —')
{
  // 情书：只在行李员还没收到时出现；签约时他把信交给你（10F 行李房那封就此被取走）
  let e: any = null, o: any = null
  for (let k = 0; k < 40 && !o; k++) {
    e = office(fresh(SEED + 10 + k)); prep(e)
    const b = A.findBeast(e)!; toDesk(e, b); press(e); run(e, BEAST_CLIPS.pourTea.dur + 0.2)
    const v = A.beastDealView(e)!, i = v.offers.findIndex((x: any) => x.task === 'letter')
    if (i < 0) { A.beastCloseDeal(e); continue }
    A.beastChoose(e, i); run(e, BEAST_CLIPS.signContract.dur + BEAST_CLIPS.handshake.dur + 0.3); o = v.offers[i]
  }
  ok(!!o, '情书任务会出现在契约里')
  ok(has(e, 'gentletter') && B.bellhopSave(e).letter === 1, '签约：他把「绅士的情书」交给你（10F 行李房那封不再重复给）')
  // 回到 L5，把信交给行李员
  const back = fresh(SEED + 60); back.hotel = e.hotel; back.player.hotbar = e.player.hotbar; back.player.backpack = e.player.backpack
  const p = back.player
  let bh: any = null
  for (let a = 0; a < Math.PI * 2 && !bh; a += 0.3) { const x = p.x + Math.cos(a) * 1.4, y = p.y + Math.sin(a) * 1.4; if (back.entityWalkH(back.map, Math.floor(x), Math.floor(y), 0) !== null) bh = B.spawnBellhop(back, { x, y }) }
  lookAt(back, bh.x, bh.y)
  back.specialPressed = true; B.bellhopPress(back)
  A.stepBeastGlobal(back, 0.05)
  const c = A.beastSave(back).contracts.find((x) => x.task === 'letter')
  ok(B.bellhopSave(back).loved === 1 && c?.state === 'done', '把信交给行李员：行李员永久友好 + 契约履行')
  ok(!A.beastTasksAvail(back).includes('letter'), '信送到之后：情书任务不再出现')
  // 请茶
  const et = fresh(SEED + 61)
  const ct = { id: 9, boon: 'calm', task: 'tea', limit: 900, left: 900, prog: 0, base: B.bellhopSave(et).n.tea, state: 'active' }
  A.beastSave(et).contracts.push(ct as any)
  B.bellhopSave(et).n.tea++; A.stepBeastGlobal(et, 0.05)
  ok(ct.state === 'done', '请行李员喝茶：契约履行')
  // 翻画像
  const ef = fresh(SEED + 62)
  const cf = { id: 10, boon: 'calm', task: 'flip', limit: 600, left: 600, prog: 0, base: A.beastSave(ef).flips, state: 'active' }
  A.beastSave(ef).contracts.push(cf as any)
  const pt = ef.map.structures.find((s: any) => s.kind === 'bigpainting' && s.data?.gaze)
  if (pt) { ef.interactTarget = { s: pt }; ef.specialPressed = true; H.updateHotel(ef, 0.05) } else A.beastNoteFlip(ef)
  A.stepBeastGlobal(ef, 0.05)
  ok(cf.state === 'done', `把一幅画像翻过去：契约履行${pt ? '（真实 X 翻画）' : '（地图里没有画像，直接记一次）'}`)
  // 不奔跑：奔跑清零进度
  const es = fresh(SEED + 63)
  const cs = { id: 11, boon: 'calm', task: 'still', limit: 720, left: 720, prog: 0, base: 0, state: 'active' }
  A.beastSave(es).contracts.push(cs as any)
  run(es, 100, 0.5)
  const p1 = cs.prog
  es.input.sprint = true; es.mv.sprintK = 1; es.mv.speed = 6; A.stepBeastGlobal(es, 0.5); es.input.sprint = false; es.mv.sprintK = 0; es.mv.speed = 0
  ok(p1 >= 99 && cs.prog === 0, `不奔跑：静静待着累计（${p1.toFixed(0)} s），一奔跑就清零`)
  run(es, BE.task.still.need + 1, 0.5)
  ok(cs.state === 'done', `连续 ${BE.task.still.need} s 不奔跑：契约履行`)
}

console.log('— 婉拒 / 怀疑 / 动手 —')
{
  const e = office(fresh(SEED + 70)); prep(e)
  const b = A.findBeast(e)!; toDesk(e, b); press(e); run(e, BEAST_CLIPS.pourTea.dur + 0.2)
  e.hotel.attn = 20
  const sanityBefore = e.player.sanity
  A.beastDecline(e)
  ok(e.player.sanity === sanityBefore - BE.declineSanity && !A.beastDecline(e) && !A.beastExitBlocked(e), '婉拒立即扣理智，只结算一次，可以离开')
  ok(e.hotel.attn === 20 + BE.declineAttn && b.bst!.flash > 0.9 && !A.beastDealView(e), `婉拒：关注度 +${BE.declineAttn}、他恼怒闪色（colorFlash 叠加）`)
  const e2 = office(fresh(SEED + 71)); prep(e2)
  const b2 = A.findBeast(e2)!; toDesk(e2, b2); press(e2); run(e2, BEAST_CLIPS.pourTea.dur + 0.2)
  A.beastDoubt(e2)
  e2.takeExit(e2.map.exits[0].def)
  ok(!e2.transition && A.beastExitBlocked(e2), '怀疑开始后立即锁住真实出口')
  const resumed = office(fresh(SEED + 171)); prep(resumed)
  resumed.hotel.beast = A.restoreBeastSave(JSON.parse(JSON.stringify(A.beastSave(e2))))
  A.beastOfficeArrive(resumed)
  ok(A.findBeast(resumed)?.bst?.mode === 'doubt' && A.beastExitBlocked(resumed), '重建办公室后怀疑事件和门锁继续')
  run(resumed, 15)
  ok(A.beastSave(resumed).strikes === 1 && A.beastDealView(resumed)?.forced && A.beastExitBlocked(resumed), '重建后强签只结算一次')
  ok(b2.bst!.mode === 'doubt' && b2.bst!.clip === 'doubtFreeze', '怀疑他：僵住（doubtFreeze）')
  const subs = A.beastDebug(e2).subs.map((s: any) => s.text)
  ok(subs[0] === '你为何要怀疑我？' && subs[1] === '哦。' && subs[2] === '呃…？', '字幕：「你为何要怀疑我？」「哦。」「呃…？」', subs)
  const seen: string[] = []
  run(e2, BEAST_CLIPS.doubtFreeze.dur + BEAST_CLIPS.colorFlash.dur + BEAST_CLIPS.reveal.dur + 0.4, 0.05, () => { if (seen[seen.length - 1] !== b2.bst!.clip) seen.push(b2.bst!.clip) })
  ok(seen.join('>') === 'doubtFreeze>colorFlash>reveal>tentacleGrab', '然后：恼怒变色 → 变真身 → 触腕缠抓', seen)
  ok(A.beastControlsPlayer(e2), '缠抓期间接管玩家')
  run(e2, BEAST_CLIPS.tentacleGrab.dur)
  const fv = A.beastDealView(e2)
  ok(A.beastSave(e2).strikes === 1 && !!fv?.forced && fv.harsh.some((h: any) => h.clause === 'mind'), '第一次冒犯：强签苛刻契约（界面不可关）')
  ok(!A.beastCloseDeal(e2) && !!A.beastDealView(e2), 'Esc 关不掉强签界面')
  A.beastForcedSign(e2, 'mind')
  ok(A.beastExitBlocked(e2), '签字演出期间门仍锁定')
  run(e2, BEAST_CLIPS.signContract.dur + BE.shakeGrip + .2)
  ok(!A.beastExitBlocked(e2) && A.beastSave(e2).sanCut === 20, '握手执行代价后解除门锁')
  // 动手
  const e3 = office(fresh(SEED + 72)); prep(e3)
  const b3 = A.findBeast(e3)!; toDesk(e3, b3)
  b3.hp -= 50; killCheck(e3, b3)
  ok(b3.hp === b3.def.hp && !b3.dead && b3.bst!.mode === 'doubt', '动手打他：不受伤，算怀疑他')
}

console.log('— 强签：交出一件物品 / 理智上限 −20；第二次再犯死亡 —')
{
  const e = office(fresh(SEED + 80)); prep(e)
  A.beastSave(e).strikes = 1; A.beastSave(e).forced = 1
  e.player.hotbar[0] = { type: 'crowbar', count: 1 }; e.player.selected = 0
  A.beastOfficeArrive(e)
  const v = A.beastDealView(e)!
  ok(v.forced && v.harsh.length === 2 && v.harsh[0].item === 'crowbar', '强签：两份二选一（交出「撬棍」/ 理智上限 −20）', v.harsh.map((h: any) => h.clause))
  A.beastForcedSign(e, 'item'); run(e, BEAST_CLIPS.signContract.dur + BE.shakeGrip + 0.1)
  ok(!has(e, 'crowbar') && A.beastSave(e).harsh.some((h) => h.clause === 'item' && h.item === 'crowbar') && !A.beastSave(e).forced, '交出物品：撬棍归他了')
  const e2 = office(fresh(SEED + 81)); prep(e2)
  A.beastSave(e2).forced = 1; A.beastOfficeArrive(e2)
  ok(A.beastDealView(e2)!.harsh.length === 1 && A.beastDealView(e2)!.harsh[0].clause === 'mind', '身上没有可拿的东西：只剩理智上限')
  e2.hotel.attn = 95
  A.beastForcedSign(e2, 'mind'); run(e2, BEAST_CLIPS.signContract.dur + BE.shakeGrip + 0.1)
  ok(A.beastSave(e2).sanCut === 20 && A.beastSanMax(e2) === 80 && e2.player.sanity <= 80 && e2.hotel.attn <= BE.afterAttn, '理智上限永久 −20（80），强签后关注度落到 60')
  e2.player.sanity = 100; A.stepBeastGlobal(e2, 0.05)
  ok(e2.player.sanity === 80, '之后任何回复都顶不过 80')
  // 第二次
  const e3 = office(fresh(SEED + 82)); prep(e3)
  A.beastSave(e3).strikes = 1
  const b3 = A.findBeast(e3)!; toDesk(e3, b3); press(e3); run(e3, BEAST_CLIPS.pourTea.dur + 0.2)
  A.beastDoubt(e3); run(e3, 15)
  ok(e3.over && A.beastSave(e3).strikes === 2, '第二次再犯：死亡', { over: e3.over, strikes: A.beastSave(e3).strikes, mode: A.findBeast(e3)?.bst?.mode, god: e3.dev?.god })
}

console.log('— 违约：L5 熄灯 → 背后缠抓 → 拖进办公室 —')
{
  const e = fresh(SEED + 90)
  const p = e.player
  const c = { id: 3, boon: 'calm', task: 'flip', limit: 600, left: 0.2, prog: 0, base: 999, state: 'active' }
  A.beastSave(e).contracts.push(c as any)
  run(e, 0.5)
  ok(c.state === 'breach' && !!A.beastDebug(e).pun && A.beastDebug(e).pun!.phase === 'black', '到期没做到：违约 → 熄灯')
  ok(A.beastHud(e).veil > 0.5 && A.beastControlsPlayer(e), 'HUD 黑幕、玩家被接管')
  run(e, BE.blackLen - 0.2)
  const b = A.findBeast(e)!
  const behind = b && Math.cos(Math.atan2(b.y - p.y, b.x - p.x) - p.facing) < -0.7
  ok(!!b && b.bst!.clip === 'tentacleGrab' && behind && Math.hypot(b.x - p.x, b.y - p.y) < 1.6, '他出现在你身后，触腕缠抓（tentacleGrab，真身）', { d: b && Math.hypot(b.x - p.x, b.y - p.y) })
  ok(!!b.bst!.grabP && Math.abs(b.bst!.grabP![1] - 1.2) < 0.3 && b.bst!.grabP![2] > 0.5, '缠抓点 = 你的躯干（root 空间）', b.bst!.grabP)
  const d0 = Math.hypot(b.x - p.x, b.y - p.y)
  run(e, BEAST_CLIPS.tentacleGrab.dur + 0.1)
  ok(A.beastSave(e).strikes === 1 && A.beastSave(e).forced === 1 && e.transition?.dest === 117 && e.hotel.pocket?.kind === 'beast', '缠完：拖进 117 办公室（口袋返程记下原楼层原地图）')
  void d0
  office(e); prep(e)
  ok(!!A.beastDealView(e)?.forced, '一到办公室：强签界面')
  // 别的层违约
  const eo: any = new Engine(); eo.seed = 3; eo.loadLevel(1, { mapSeed: 3, firstVisit: true }); prep(eo); eo.map.entities = []
  const co = { id: 4, boon: 'calm', task: 'flip', limit: 600, left: 0.1, prog: 0, base: 999, state: 'active' }
  A.beastSave(eo).contracts.push(co as any)
  run(eo, 0.3)
  ok(co.state === 'breach' && A.beastSave(eo).pending === 1 && !A.beastDebug(eo).pun, '在别的层违约：记下，回到 L5 再执行')
  const e5 = fresh(SEED + 91); e5.hotel = eo.hotel
  run(e5, BE.pendingDelay + 0.2)
  ok(!!A.beastDebug(e5).pun && !A.beastSave(e5).pending, `回到 L5 ${BE.pendingDelay} s 后：熄灯`)
}

console.log('— 关注度 100 = 野兽现身 —')
{
  const e = fresh(SEED + 100)
  const gz0 = e.hotelGazeT
  H.hotelAddAttn(e, 200)
  ok(!!A.beastDebug(e).pun && A.beastDebug(e).pun!.reason === 'attn' && e.hotelGazeT === gz0, '关注度满：不再是全屏注视，改为熄灯 → 他从背后出现')
  run(e, BE.blackLen + BEAST_CLIPS.tentacleGrab.dur + 0.3)
  ok(A.beastSave(e).strikes === 1 && e.transition?.dest === 117, '同样拖进办公室、记一次冒犯')
}

console.log('— 余光 —')
{
  const e = fresh(SEED + 110)
  e.hotel.attn = 0; e.player.sanity = 90
  run(e, 240, 0.25, () => { e.hotel.attn = 0 })
  ok(!A.findBeast(e) && A.beastSave(e).n.peri === 0, '关注度 < 50 且理智 ≥ 40（没有契约）：不出现')
  ok(A.beastPeriGate({ ...e, hotel: { ...e.hotel, attn: 50 } } as any) && A.beastPeriGate({ ...e, player: { ...e.player, sanity: 39 } } as any), '门槛：关注度 ≥ 50 或理智 < 40')
  const r1 = A.beastPeriRate({ ...e, hotel: { ...e.hotel, attn: 55 } } as any), r2 = A.beastPeriRate({ ...e, hotel: { ...e.hotel, attn: 55 }, player: { ...e.player, sanity: 10 } } as any)
  ok(r2 > r1 * 1.8, `理智越低出现越频繁（理智 90 → 10：${(r1 * 60).toFixed(2)} → ${(r2 * 60).toFixed(2)} 次/分）`)
  const sv = A.beastSave(e); sv.contracts.push({ id: 1, boon: 'calm', task: 'flip', limit: 1e6, left: 1e6, prog: 0, base: 1e9, state: 'active' } as any)
  ok(A.beastPeriGate(e) && A.beastPeriRate(e) > (1 / ((BE.periEvery[0] + BE.periEvery[1]) / 2)) * 1.5, '隐藏代价：契约未了时门槛失效、频率 ×1.6')
  sv.contracts.length = 0
  // 统计出现位置（先让玩家面朝一条开阔的方向：两侧 35°–70° 有地方站）
  e.hotel.attn = 60
  { let best = -1, bf = 0; for (let a = 0; a < Math.PI * 2; a += 0.2) { e.player.facing = a; let c = 0; for (let k = 0; k < 20; k++) if (A.beastPeriSpot(e)) c++; if (c > best) { best = c; bf = a } } e.player.facing = bf }
  const angs: number[] = [], ds: number[] = []
  for (let k = 0; k < 30; k++) { const s = A.beastPeriSpot(e); if (s) { angs.push(Math.abs(Math.atan2(Math.sin(Math.atan2(s.y - e.player.y, s.x - e.player.x) - e.player.facing), Math.cos(Math.atan2(s.y - e.player.y, s.x - e.player.x) - e.player.facing)))); ds.push(Math.hypot(s.x - e.player.x, s.y - e.player.y)) } }
  ok(angs.length > 0 && angs.every((a) => a >= BE.periCone[0] - 1e-6 && a <= BE.periCone[1] + 1e-6) && ds.every((d) => d >= BE.periR[0] - 1e-6 && d <= BE.periR[1] + 1e-6), `出现在视线 35°–70°、6–14 m（${angs.length} 个样本）`)
  // 真实生成
  let got: any = null
  for (let t = 0; t < 400 && !got; t += 0.25) { e.hotel.attn = 60; stepAll(e, 0.25); got = A.findBeast(e) }
  ok(!!got && got.bst.mode === 'peri' && got.bst.clip === 'peripheralStill', `关注度 60：他出现在余光里（peripheralStill，进图 ${A.beastDebug(e).mapT.toFixed(0)} s）`)
  ok(A.beastDebug(e).mapT >= BE.periFirst, `进图 ${BE.periFirst} s 内不会出现`)
  const san0 = e.player.sanity, attn0 = e.hotel.attn
  // 保持他在余光（不正视）：转身让他在 45°
  const a0 = Math.atan2(got.y - e.player.y, got.x - e.player.x)
  e.player.facing = a0 - 0.8
  run(e, 0.4, 0.05, () => { e.player.facing = Math.atan2(got.y - e.player.y, got.x - e.player.x) - 0.8 })
  ok(got.bst.seen && Math.abs(e.player.sanity - (san0 - BE.seenSan)) < 1e-6 && e.hotel.attn > attn0 + BE.seenAttn - 0.5, `被余光看见：理智 −${BE.seenSan}、关注度 +${BE.seenAttn}`, { san: e.player.sanity, attn: e.hotel.attn })
  ok(got.bst.lookP && got.bst.lookP[2] > 0, '他盯着你（头眼目标 = 你，root 空间正前方）')
  // 正视
  lookAt(e, got.x, got.y); run(e, 0.1)
  ok(got.bst.mode === 'vanish' && got.bst.clip === 'vanish', '一转头正视：后退隐入暗处（vanish）')
  run(e, BEAST_CLIPS.vanish.dur + 0.1)
  ok(!A.findBeast(e) && A.beastSave(e).n.vanish === 1, 'vanish 结束（beastVanishState done）：移除')
  // 离开余光：悄悄消失
  const g2 = spawnPeri(e)
  e.player.facing = Math.atan2(g2.y - e.player.y, g2.x - e.player.x) + Math.PI
  run(e, BE.periLost + 0.2, 0.05, () => { e.player.facing = Math.atan2(g2.y - e.player.y, g2.x - e.player.x) + Math.PI })
  ok(!A.findBeast(e) && A.beastSave(e).n.vanish === 1, `离开余光 ${BE.periLost} s：悄悄消失（不播 vanish）`)
  // 余光里动手 = 怀疑
  const g3 = spawnPeri(e)
  g3.hp -= 10; killCheck(e, g3)
  ok(g3.hp === g3.def.hp && !!A.beastDebug(e).pun, '在余光里打他：隐去，然后熄灯')
}

console.log('— 画像换脸门槛 —')
{
  const e = fresh(SEED + 120)
  e.hotel.attn = 10; ok(!A.beastPortraitActive(e), '关注度 < 25：画像还是普通人')
  e.hotel.attn = 30; ok(A.beastPortraitActive(e), '关注度 ≥ 25：画像换成他的脸')
  e.hotel.attn = 0; A.beastSave(e).contracts.push({ id: 1, boon: 'calm', task: 'flip', limit: 99, left: 99, prog: 0, base: 1e9, state: 'active' } as any)
  ok(A.beastPortraitActive(e), '契约未了：画像也是他')
  const a0 = e.hotel.attn; A.beastPortraitStare(e, 1)
  ok(e.hotel.attn - a0 >= BE.portraitStareAttn - 1e-6, `盯他的画像：每秒额外 +${BE.portraitStareAttn}`)
}

console.log('— 字幕 / 预热 / 办公室文案 —')
{
  const e = fresh(SEED + 125)
  A.beastSay(e, 'a', 3); A.beastSay(e, 'b', 3); A.beastSay(e, 'c', 3, true)
  ok(A.beastDebug(e).subs.length === 1 && A.beastHud(e).sub === 'c', '状态变了的台词清掉旧字幕队列（字幕不落后于动作）')
  A.stepBeastGlobal(e, 3.1); ok(A.beastHud(e).sub === null, '字幕按时长消失')
  e.hotel.attn = 39; e.player.sanity = 80; ok(!A.beastWarmHint(e), '预热提示：离门槛远时不预热')
  e.hotel.attn = 41; ok(A.beastWarmHint(e), `预热提示：关注度 ≥ ${BE.periAttn - 10} 提前建 LOD1（在他第一次出现之前）`)
  const { levelDefOf } = await import('../src/game/levels') as any
  const d = levelDefOf?.(117)
  ok(!d || (!d.flavor.includes('空椅') && !d.sd.includes('主人不在')), '117 办公室文案：不再是「空椅 / 主人不在」')
}

console.log('— 存档往返 —')
{
  const e = office(fresh(SEED + 130)); prep(e)
  signDeal(e, (o) => o.boon === 'fearless')
  const sv = A.beastSave(e); sv.strikes = 1; sv.sanCut = 20; sv.harsh.push({ clause: 'mind', t: 1 }); sv.pending = 1
  const snap: any = snapshot(e)
  const back = H.restoreHotel(JSON.parse(JSON.stringify(snap.hotel ?? e.hotel)))
  const bs = back.beast!
  ok(!!bs && bs.strikes === 1 && bs.sanCut === 20 && bs.harsh.length === 1 && bs.pending === 1 && bs.contracts.length === 1 && bs.contracts[0].state === 'active' && Math.abs(bs.fearT - sv.fearT) < 1e-6 && bs.n.deal === 1, '存档：冒犯次数 / 契约与计时 / 苛刻契约 / 理智锁 / 上限扣减 / 待执行惩罚 随 hotel 保存与恢复')
  ok(A.restoreBeastSave({ contracts: [{ boon: 'x' }, null], strikes: 'a', sanCut: 999 }).sanCut === BE.sanCutMax && A.restoreBeastSave(undefined).strikes === 0, '坏数据 / 旧档不报错（上限扣减夹到 40）')
  ok(!H.restoreHotel({ attn: 10 }).beast, '旧存档没有野兽数据：照常读取')
}

console.log('— 渲染 —')
{
  const THREE = await import('three')
  const R = await import('../src/game/renderer/beastRender')
  const { buildEntityMesh } = await import('../src/game/renderer/entitiesMesh') as any
  const t0 = performance.now()
  const g = R.buildBeastEntityMesh()
  const ms1 = performance.now() - t0
  const box = new THREE.Box3().setFromObject(g.userData.lod1)
  ok(box.max.y > 1.8 && box.max.y < 2.1, `LOD1 模型高约 1.95 m（${box.max.y.toFixed(2)}，构建 ${ms1.toFixed(0)} ms）`)
  ok(buildEntityMesh('beast')?.userData.entityType === 'beast', 'entitiesMesh：beast → beastRender')
  const e = office(fresh(SEED + 140)); prep(e)
  const b = A.findBeast(e)!, s = b.bst!
  let threw = ''
  try { for (const m of ['seatedIdle', 'beckon', 'talk', 'pourTea', 'signContract', 'handshake', 'doubtFreeze', 'colorFlash', 'reveal', 'tentacleGrab', 'peripheralStill', 'vanish'] as const) { s.clip = m; s.seq++; s.modeT = 0.8; R.animateBeastEntity(g, b, 0.05, 20) } } catch (er) { threw = String(er) }
  ok(!threw, '全部机制片段在实体里播放不报错', threw || undefined)
  // 余光：不建 LOD0
  s.mode = 'peri'; s.clip = 'peripheralStill'; s.seq++; R.animateBeastEntity(g, b, 0.05, 5, { fear: 0.8 })
  ok(!g.userData.lod0, '余光（再近）也不为它建 LOD0')
  // vanish 淡出
  s.mode = 'vanish'; s.clip = 'vanish'; s.seq++; s.modeT = 2.3; for (let i = 0; i < 6; i++) R.animateBeastEntity(g, b, 0.05, 30)
  ok(g.userData.beastFade < 0.05 && g.userData.shadowOn === false, 'vanish 末尾：淡出到透明、关阴影', g.userData.beastFade)
  // 握手：握点进入姿态
  s.mode = 'shake'; s.clip = 'handshake'; s.seq++; s.modeT = 1.9; s.shakeP = [0.05, 1.12, 0.45] // 1.9 s：上下摇的相位为 0
  for (let i = 0; i < 12; i++) R.animateBeastEntity(g, b, 0.05, 12)
  const rig = g.userData.rig1
  const { beastPalmPoint } = await import('../src/game/renderer/beastAnim')
  const pp = beastPalmPoint(rig, -1, 0.3)
  ok(Math.hypot(pp.x - 0.05, pp.y - 1.12, pp.z - 0.45) < 0.02, `握手：右手掌心到了 AI 给的握点（误差 ${(Math.hypot(pp.x - 0.05, pp.y - 1.12, pp.z - 0.45) * 100).toFixed(1)} cm）`)
  // 真身
  s.mode = 'grab'; s.clip = 'tentacleGrab'; s.seq++; s.modeT = 1.5; s.grabP = [0.1, 1.2, 1.3]
  for (let i = 0; i < 8; i++) R.animateBeastEntity(g, b, 0.05, 12)
  ok(g.userData.beastForm > 0.99 && rig.headTrueMesh.visible && !rig.headMesh.visible, '缠抓：真身形态（裂开露喙）')
  const g0 = R.buildBeastEntityMesh(); const t1 = performance.now(); R.animateBeastEntity(g0, b, 0.05, 4); const ms0 = performance.now() - t1
  ok(!!g0.userData.lod0 && g0.userData.lod0.visible, `办公室：14 m 内构建 LOD0（几何按 LOD 缓存，第二个实例 ${ms0.toFixed(0)} ms）`)
  s.mode = 'seat'; s.clip = 'seatedIdle'; s.seq++; R.animateBeastEntity(g, b, 0.05, 4)
  ok(!!g.userData.lod0 && g.userData.lod0.visible && !g.userData.lod1.visible, `办公室里走近（< ${R.BEAST_LOD.near} m）切到 LOD0`)
  R.animateBeastEntity(g, b, 0.05, 10); ok(g.userData.lod0.visible, '9–11 m 保持（防抖）')
  R.animateBeastEntity(g, b, 0.05, 12); ok(!g.userData.lod0.visible && g.userData.lod1.visible, '11 m 外回到 LOD1')
}

console.log(`\n${n - fails}/${n} 通过`)
process.exit(fails ? 1 : 0)
