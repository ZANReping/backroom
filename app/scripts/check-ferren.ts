/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// Ferren（Entity 92）重制·阶段 3——机制无头验收（真实 Engine + 真实商人之家 tradersWorld 地图）。运行：npm run check:ferren
// 覆盖：作息表与时间压缩 · 各时段行为与动画 · 各时段 X 交互（摸摸/打扰/盖被子/只有提示）· 切行带人（接触判定、落点合法、闪白、理智）
//       · 只有 1 只 / 只在商人之家 · 不反击 · 声望变化 · 存档 · 渲染层片段推进/混合/进窝 · 各片段不穿地
import { createCanvas } from '@napi-rs/canvas'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { makeEntity, type Entity } from '../src/game/entities'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256) },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const { ENTITIES } = await import('../src/game/entities')
const { levelDefOf } = await import('../src/game/levels')
const { createTradersMap, ensureTradersAt } = await import('../src/game/world/tradersWorld')
const { tradersZoneAt } = await import('../src/game/content/tradersLayout')
const { FERREN_CAGE } = await import('../src/game/content/ferrenCage')
const { canOccupy, PLAYER_RADIUS } = await import('../src/game/core/player')
const F = await import('../src/game/engine/ferrenAI')
const { specialAction } = await import('../src/game/engine/special')
const { snapshot } = await import('../src/game/engine/save')
const { FERREN_CLIPS, animateFerren } = await import('../src/game/renderer/ferrenAnim')
const { buildFerrenMesh } = await import('../src/game/renderer/ferrenMesh')
const R = await import('../src/game/renderer/ferrenRender')
const { FR, FERREN_SCHEDULE } = F

let fails = 0, n = 0
const ok = (c: unknown, m: string) => { n++; console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
const DT = 1 / 30
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps

const MAP = createTradersMap(levelDefOf(102)!, 4242)
ensureTradersAt(MAP, FERREN_CAGE.spawn.x, FERREN_CAGE.spawn.y, 40)
const baseEntities = MAP.entities.slice()
function world(phaseKind?: string, at = 0.5, opts: { level?: number } = {}) {
  const eng: any = new Engine()
  eng.player.level = opts.level ?? 102
  MAP.entities = baseEntities.map((e) => { const c = makeEntity('ferren', FERREN_CAGE.spawn.x, FERREN_CAGE.spawn.y); c.id = e.id; return c })
  eng.map = MAP
  eng.explored = new Uint8Array(MAP.w * MAP.h).fill(1)
  const p = eng.player
  Object.assign(p, { x: 330, y: 158, z: 0, floor: 0, hp: 100, sanity: 70, facing: 0, flashlight: false, battery: 100, stamina: 100 })
  eng.rep = { meg: 0, bntg: 0 }
  const msgs: string[] = []; const msg0 = eng.msg.bind(eng); eng.msg = (t: string, k?: any) => { msgs.push(t); msg0(t, k) }
  eng.emit = () => {}; eng.persist = () => {}
  if (phaseKind) setPhase(eng, phaseKind, at)
  const tick = () => { eng.updateEntities(DT, 1); F.stepFerrenWorld(eng, DT); eng.time = (eng.time ?? 0) + DT }
  const run = (secs: number, each?: () => void) => { for (let t = 0; t < secs; t += DT) { each?.(); tick() } }
  const until = (test: () => boolean, secs = 30, each?: () => void) => { for (let t = 0; t < secs && !test(); t += DT) { each?.(); tick() } return test() }
  const fer = () => MAP.entities.find((e) => e.def.type === 'ferren' && !e.dead) as Entity
  const press = () => { eng.specialHeld = true; tick(); eng.specialHeld = false; tick() }
  return { eng, p, msgs, tick, run, until, fer, press }
}
/** 把作息时钟拨到某类时段（第 idx 个同类段）的 at 比例处 */
function setPhase(eng: any, kind: string, at = 0.5, idx = 0, cycle = 3) {
  const ph = FERREN_SCHEDULE.filter((p) => p.kind === kind)[idx]
  const [a, b] = F.phaseSeconds(ph)
  eng.ferrenRun.clock = cycle * FR.CYCLE + a + (b - a) * at
}
const inCage = (x: number, y: number) => x > FERREN_CAGE.x0 && x < FERREN_CAGE.x1 && y > FERREN_CAGE.y0 && y < FERREN_CAGE.y1

// ── 作息表：维基 16 段、一轮 20 分钟、等比缩放
{
  let prev = 0, contiguous = true
  for (const p of FERREN_SCHEDULE) { if (p.from !== prev) contiguous = false; prev = p.to }
  ok(contiguous && prev === 1440 && FERREN_SCHEDULE.length === 16, '作息表 16 段首尾相接，覆盖整天 1440 维基分钟（7:00 → 次日 7:00）')
  const kinds = new Set(FERREN_SCHEDULE.map((p) => p.kind))
  ok(['wake', 'meal', 'exercise', 'play', 'train', 'nap', 'walk', 'bedtime', 'sleep'].every((k) => kinds.has(k as any)), '时段：唤醒 / 进食 / 晨练锻炼 / 娱乐 / 训练 / 午睡 / 散步 / 上床 / 睡觉 都有')
  ok(FERREN_SCHEDULE.filter((p) => p.kind === 'meal').map((p) => p.zh).join() === '早餐,午餐,晚餐', '进食分早 / 午 / 晚三顿')
  ok(FR.CYCLE === 1200, '一轮作息 = 1200 游戏秒（20 分钟）')
  const sec = (zh: string) => { const p = FERREN_SCHEDULE.find((q) => q.zh === zh)!; const [a, b] = F.phaseSeconds(p); return b - a }
  ok(near(sec('娱乐'), 100) && near(sec('睡觉'), 500) && near(sec('午睡'), 50) && near(sec('晨练'), 25) && near(sec('晚餐'), 75) && near(sec('上床'), 100), `等比缩放：娱乐 2h→${sec('娱乐')}s · 睡觉 10h→${sec('睡觉')}s · 午睡 1h→${sec('午睡')}s · 晨练 30min→${sec('晨练')}s · 晚餐 90min→${sec('晚餐')}s`)
  ok(F.ferrenClockText(0) === '07:00' && F.ferrenClockText(F.freshFerrenRun().clock) === '08:00' && F.ferrenClockText(FR.CYCLE * 0.5) === '19:00', '时钟文字：0 → 07:00，新开局 08:00，半轮 → 19:00')
  ok(F.ferrenPhase(0).zh === '唤醒' && F.ferrenPhase(FR.CYCLE - 1).zh === '睡觉' && F.ferrenPhase(FR.CYCLE + 1).zh === '唤醒', '一轮结束接下一轮（睡到 7:00 被唤醒）')
  const e: any = { ferrenRun: { clock: 0 } }; setPhase(e, 'bedtime'); const kb = F.sleepSessionKey(e.ferrenRun.clock); setPhase(e, 'sleep'); const ks = F.sleepSessionKey(e.ferrenRun.clock); setPhase(e, 'nap'); const kn = F.sleepSessionKey(e.ferrenRun.clock)
  ok(kb === ks && kn !== ks && kb !== null && F.sleepSessionKey(10) === null, '上床 + 夜间睡眠算同一段睡眠，午睡另算一段，白天没有睡眠段')
}

// ── 只有 1 只、只在商人之家
{
  const m = createTradersMap(levelDefOf(102)!, 99)
  const fs = m.entities.filter((e) => e.def.type === 'ferren')
  ok(fs.length === 1 && inCage(fs[0].x, fs[0].y), `商人之家（tradersWorld）只有 1 只 Ferren，出生在雪貂笼里（${fs[0]?.x}, ${fs[0]?.y}）`)
  const kinds = m.structures.filter((s) => s.kind.startsWith('ferren')).map((s) => s.kind)
  ok(kinds.filter((k) => k === 'ferrennest').length === 1 && kinds.filter((k) => k === 'ferrenbowl').length === 1 && kinds.filter((k) => k === 'ferrencage').length === 5, '笼里一个窝、一个食盆，四面铁丝围栏（北面留笼门）')
  ok(tradersZoneAt(FERREN_CAGE.spawn.x, FERREN_CAGE.spawn.y)?.id === 'visitor_center', '笼子在「迎新与路线中心」')
  const src = readFileSync(new URL('../src/game/world/mapgenOutpost.ts', import.meta.url), 'utf8')
  ok((src.match(/makeEntity\('ferren'/g) ?? []).length === 1 && src.includes("kind: 'ferrennest'") && src.includes("kind: 'ferrenbowl'"), '旧版 mapgenOutpost 商人之家笼子也只放 1 只 + 窝 + 食盆')
  const W = world('play'); const extra = makeEntity('ferren', 336.5, 149.5); extra.id = 1e6; MAP.entities.push(extra)
  W.run(0.2)
  ok(extra.dead && MAP.entities.filter((e) => e.def.type === 'ferren' && !e.dead).length === 1, '地图上多出来的第二只会被移除（始终只有 1 只）')
  const W2 = world('play', 0.5, { level: 2 })
  W2.run(0.2)
  ok(W2.fer() === undefined, '不在商人之家的层级出现时立即移除')
  ok(!JSON.stringify(levelDefOf(102)!.entities ?? []).includes('ferren'), '不进任何生成池（定点放置）')
}

// ── 各时段行为与动画
{
  const W = world('sleep', 0.3); W.p.x = 320; W.p.y = 160
  W.until(() => W.fer().fr?.act === 'nestSleep', 30)
  const e = W.fer(); W.run(1)
  ok(e.fr!.inNest && e.fr!.clip === 'sleep' && Math.hypot(e.x - FERREN_CAGE.nest.x, e.y - FERREN_CAGE.nest.y) < 0.1, '睡觉：回窝蜷睡（sleep 片段，在窝中心）')
  setPhase(W.eng, 'nap', 0.2); W.until(() => W.fer().fr?.act === 'nestSleep', 30); W.run(0.5)
  ok(e.fr!.clip === 'sleep' && e.fr!.inNest && F.ferrenPhase(W.eng.ferrenRun.clock).zh === '午睡', '午睡：同样回窝睡')
  setPhase(W.eng, 'wake', 0.02, 1); W.run(0.4)
  ok(e.fr!.clip === 'stretch' && e.fr!.inNest, '唤醒：先在窝里伸懒腰')
  W.run(3); ok(e.fr!.clip === 'stand', '伸完懒腰后站起来张望')
  setPhase(W.eng, 'meal', 0.1, 1)
  W.until(() => W.fer().fr?.act === 'eat', 20); W.run(1)
  ok(e.fr!.clip === 'eat' && Math.hypot(e.x - FERREN_CAGE.bowl.x, e.y - FERREN_CAGE.bowl.y) < FR.BOWL_OFF + 0.08, `进食：走到食盆边埋头吃（eat，离食盆 ${Math.hypot(e.x - FERREN_CAGE.bowl.x, e.y - FERREN_CAGE.bowl.y).toFixed(2)} m）`)
  const spont = FR.SPONT_RATE; (FR as any).SPONT_RATE = 0
  setPhase(W.eng, 'exercise', 0.05)
  let maxV = 0, out = false, runs = 0, frames = 0
  W.run(8, () => { const s = W.fer().fr!; maxV = Math.max(maxV, s.speed); frames++; if (s.clip === 'run') runs++; if (!inCage(W.fer().x, W.fer().y)) out = true })
  ok(runs / frames > 0.8 && maxV > 1.8 && maxV <= FR.RUN + 0.05 && !out, `晨练：在笼里绕圈飞奔（run 占 ${(100 * runs / frames).toFixed(0)}%，最高 ${maxV.toFixed(2)} m/s，没出笼）`)
  setPhase(W.eng, 'walk', 0.05); W.run(0.2)
  maxV = 0; out = false; let walks = 0; frames = 0
  W.run(8, () => { const s = W.fer().fr!; maxV = Math.max(maxV, s.speed); frames++; if (s.clip === 'walk') walks++; if (!inCage(W.fer().x, W.fer().y)) out = true })
  ok(walks / frames > 0.8 && maxV <= FR.WALK + 0.02 && !out, `散步：笼内绕圈慢走（walk 占 ${(100 * walks / frames).toFixed(0)}%，≤ ${FR.WALK} m/s）`)
  setPhase(W.eng, 'play', 0.05)
  const clips = new Set<string>()
  W.run(40, () => clips.add(W.fer().fr!.clip))
  ok(clips.has('wardance') && clips.has('roll') && clips.has('walk'), `娱乐：战舞 / 打滚 / 撒欢（出现片段 ${[...clips].join(' ')}）`)
  W.p.x = 336.6; W.p.y = 148.2
  const rub = W.until(() => W.fer().fr?.act === 'rub', 12)
  ok(rub && W.fer().fr!.clip === 'pet' && Math.hypot(W.fer().x - W.p.x, W.fer().y - W.p.y) < FR.RUB_R + 0.2, '娱乐：玩家进笼就跟过来在脚边蹭（pet 片段）')
  setPhase(W.eng, 'train', 0.02); W.p.x = 320; W.p.y = 160
  const tclips = new Set<string>(); let hop: { from: [number, number]; to: [number, number] } | null = null
  W.run(20, () => { const f = W.fer(); tclips.add(f.fr!.clip); if (f.fr!.noclip && f.fr!.noclip.t < DT * 1.5) hop = { from: [f.x, f.y], to: [f.fr!.noclip.dx, f.fr!.noclip.dy] } })
  ok(['stand', 'sniff', 'stretch', 'noclip'].every((c) => tclips.has(c)), `训练：站立 / 嗅 / 伸展 + 切行练习（出现片段 ${[...tclips].join(' ')}）`)
  const h = hop as { from: [number, number]; to: [number, number] } | null
  ok(!!h && inCage(...h.to) && Math.hypot(h.to[0] - h.from[0], h.to[1] - h.from[1]) >= FR.TRAIN_HOP_MIN, '训练切行：落在笼内另一侧（≥ 1.4 m）')
  setPhase(W.eng, 'bedtime', 0.05); W.p.x = 320; W.p.y = 160
  const bclips: string[] = []
  W.until(() => W.fer().fr?.act === 'nestSleep', 40, () => { const c = W.fer().fr!.clip; if (bclips.at(-1) !== c) bclips.push(c) })
  ok(bclips.join(' ').includes('sniff stretch') && W.fer().fr!.inNest, `上床：回窝 → 嗅一嗅 → 伸个懒腰 → 躺下（${bclips.join('→')}）`)
  ;(FR as any).SPONT_RATE = spont
}

// ── X 交互（按时段）
{
  const W = world('play', 0.3); const e = () => W.fer()
  const spont0 = FR.SPONT_RATE; (FR as any).SPONT_RATE = 0
  W.run(0.5)
  const settle = () => W.until(() => !e().fr!.noclip && inCage(e().x, e().y), 20, () => { W.p.x = 320; W.p.y = 160 })
  const put = () => { W.p.x = e().x + 0.9; W.p.y = e().y }
  put()
  const a = specialAction(W.eng)
  ok(a?.id === 'ferren-pet' && !a.hold, '娱乐：X = 摸摸 Ferren（点按，通过 special.ts 情境提供，移动端同一个情境按钮）')
  const pn = FR.PET_NOCLIP_P; (FR as any).PET_NOCLIP_P = 0
  const san0 = W.p.sanity, rep0 = W.eng.rep.bntg
  W.press()
  ok(W.p.sanity === san0 + FR.PET_SAN && W.eng.rep.bntg === rep0 + FR.PET_REP && e().fr!.act === 'pet' && e().fr!.clip === 'pet', `摸摸：pet 动画，理智 +${FR.PET_SAN}，B.N.T.G. 好感 +${FR.PET_REP}`)
  put(); W.press()
  ok(W.eng.rep.bntg === rep0 + FR.PET_REP && W.p.sanity === san0 + FR.PET_SAN && W.msgs.at(-1)!.includes('刚被摸过'), `冷却 ${FR.PET_CD}s 内再摸：没有加成，只有提示`)
  W.eng.specialHeld = true; W.run(1); const r1 = W.eng.rep.bntg; W.run(25); W.eng.specialHeld = false
  ok(W.eng.rep.bntg === r1, '按住不放不会连发（取上升沿）')
  for (let i = 0; i < 5; i++) { W.eng.ferrenRun.petCd = 0; put(); W.press() }
  ok(W.eng.rep.bntg === rep0 + FR.PET_REP_MAX, `每轮作息摸摸好感最多 +${FR.PET_REP_MAX}`)
  ;(FR as any).PET_NOCLIP_P = pn
  setPhase(W.eng, 'walk', 0.3); W.run(0.3); settle(); put(); W.eng.ferrenRun.petCd = 0
  ok(specialAction(W.eng)?.id === 'ferren-pet', '散步：也可以摸')
  setPhase(W.eng, 'train', 0.5); W.run(0.3); settle(); put()
  const t = specialAction(W.eng)
  ok(t?.id === 'ferren-disturb' && t.hint.includes('打扰'), '训练：X 会打扰（提示写明声望 −）')
  const r2 = W.eng.rep.bntg; W.press()
  ok(W.eng.rep.bntg === r2 + FR.DISTURB_REP && W.msgs.some((m) => m.includes('训练时请勿打扰')), `训练时打扰：B.N.T.G. 声望 ${FR.DISTURB_REP} + 警告`)
  put(); W.press(); ok(W.eng.rep.bntg === r2 + FR.DISTURB_REP, '警告冷却内重复按只再警告一次，不重复扣')
  setPhase(W.eng, 'sleep', 0.3); W.p.x = 320; W.p.y = 160
  W.until(() => e().fr?.act === 'nestSleep', 30); W.p.x = e().x + 0.8; W.p.y = e().y - 0.6
  const s1 = specialAction(W.eng)
  ok(s1?.id === 'ferren-tuck', '睡觉：X = 盖被子')
  const r3 = W.eng.rep.bntg; W.press()
  ok(W.eng.rep.bntg === r3 + FR.TUCK_REP && W.eng.ferrenRun.tuck === F.sleepSessionKey(W.eng.ferrenRun.clock), `盖被子：好感 +${FR.TUCK_REP}，记下这段睡眠`)
  ok(specialAction(W.eng) === null && F.ferrenOverlay(W.eng).hint.includes('盖着小被子'), '同一段睡眠只能盖一次（按钮消失，提示「盖着小被子」）')
  W.press(); ok(W.eng.rep.bntg === r3 + FR.TUCK_REP, '再按没有效果')
  setPhase(W.eng, 'nap', 0.3, 0, 4); W.until(() => e().fr?.act === 'nestSleep', 30); W.p.x = e().x + 0.8; W.p.y = e().y - 0.6; W.run(0.1)
  ok(specialAction(W.eng)?.id === 'ferren-tuck' && W.eng.ferrenRun.tuck === null, '下一段睡眠（午睡）又可以盖')
  // 只有提示文字的时段
  const hints: string[] = []
  for (const kind of ['wake', 'meal', 'exercise']) {
    setPhase(W.eng, kind, 0.5); W.run(0.3); W.p.x = e().x + 0.9; W.p.y = e().y
    hints.push(F.ferrenOverlay(W.eng).hint)
    ok(specialAction(W.eng) === null && F.ferrenOverlay(W.eng).hint.includes(F.ferrenPhase(W.eng.ferrenRun.clock).zh), `${F.ferrenPhase(W.eng.ferrenRun.clock).zh}：没有 X 动作，只有提示「${F.ferrenOverlay(W.eng).hint}」`)
  }
  const all = FERREN_SCHEDULE.map((ph) => { W.eng.ferrenRun.clock = 5 * FR.CYCLE + F.phaseSeconds(ph)[0] + 1; const s = F.ferrenStatusText(W.eng, e()); return s.includes(ph.zh) && s.length > 12 })
  ok(all.every(Boolean), '16 个时段都有提示文字（带时刻和时段名，说明 Ferren 在做什么）')
  W.p.x = e().x + 7; W.p.y = e().y
  ok(F.ferrenOverlay(W.eng).hint === '', `离开 ${FR.HINT_R} m 不再显示提示`)
  ;(FR as any).SPONT_RATE = spont0
}

// ── 切行带人
{
  const W = world('play', 0.2); const e = () => W.fer()
  W.run(0.5)
  const noclipNow = () => { e().fr!.spontCd = 0; (FR as any).SPONT_RATE = 1e6; W.tick(); (FR as any).SPONT_RATE = 0.012; return !!e().fr!.noclip }
  // 1) 贴身 0.5 m：一起被带走
  W.p.x = e().x + 0.5; W.p.y = e().y
  const started = noclipNow()
  const n0 = e().fr!.noclip!, dest = [n0.dx, n0.dy]
  let preFlash = 0
  W.until(() => e().fr!.noclip?.done === true, 5, () => { W.p.x = e().x + 0.5; W.p.y = e().y; if (!e().fr!.noclip?.done) preFlash = Math.max(preFlash, W.eng.ferrenRun.flash) })
  const san0 = 70
  ok(started && e().fr!.noclip?.carry === true, '娱乐时自发切行，身边 0.5 m 的玩家被一起带走')
  ok(near(e().x, dest[0]) && near(e().y, dest[1]) && Math.hypot(W.p.x - e().x, W.p.y - e().y) < 1.0, `落在他旁边（玩家离他 ${Math.hypot(W.p.x - e().x, W.p.y - e().y).toFixed(2)} m）`)
  ok(!inCage(e().x, e().y) && Math.hypot(dest[0] - FERREN_CAGE.spawn.x, dest[1] - FERREN_CAGE.spawn.y) <= FR.OUT_MAX + 1, '自发切行：站内短距离，切到笼外不远处')
  ok(preFlash > 0.6 && W.eng.ferrenRun.flash > 0.95, `传送前屏幕渐白（${preFlash.toFixed(2)}），换位那一刻全白`)
  ok(W.p.sanity === san0 + FR.NOCLIP_SAN, `理智小幅下降 ${FR.NOCLIP_SAN}`)
  W.run(FR.NOCLIP_SAN_BACK_T + 0.1)
  ok(W.p.sanity === san0 + FR.NOCLIP_SAN + FR.NOCLIP_SAN_BACK && W.eng.ferrenRun.flash < 0.05, `回过神：理智 +${FR.NOCLIP_SAN_BACK}，闪白褪去`)
  ok(canOccupy(MAP, W.p.x, W.p.y, PLAYER_RADIUS, { z: 0, band: 0 }) && canOccupy(MAP, e().x, e().y, 0.22, { z: 0, band: 0 }), '玩家与 Ferren 都没有落进墙 / 结构里')
  // 过一会儿自己切行回笼
  const home = W.until(() => inCage(e().x, e().y) && !e().fr!.noclip, FR.OUT_T + FR.OUT_T_RAND + 6, () => { W.p.x = 300; W.p.y = 160 })
  ok(home, '在笼外逗留一会儿后，自己切行回笼')
  // 2) 1.2 m、没在摸：不带
  W.run(1); W.p.x = e().x + 1.2; W.p.y = e().y
  const px = W.p.x, py = W.p.y
  noclipNow(); W.until(() => !e().fr!.noclip, 5)
  ok(W.p.x === px && W.p.y === py && W.eng.ferrenRun.flash === 0, '1.2 m 外、没碰他：不被带走、不闪白')
  // 3) 正在摸他（1.2 m）：带走
  W.until(() => inCage(e().x, e().y) && !e().fr!.noclip, 30, () => { W.p.x = 300; W.p.y = 160 })
  W.run(0.5); W.eng.ferrenRun.petCd = 0; W.p.x = e().x + 1.2; W.p.y = e().y
  const pn = FR.PET_NOCLIP_P; (FR as any).PET_NOCLIP_P = 1; e().fr!.spontCd = 0
  W.press(); (FR as any).PET_NOCLIP_P = pn
  const c0 = W.eng.ferrenRun.carried
  W.until(() => !e().fr!.noclip, 5)
  ok(W.eng.ferrenRun.carried === c0 + 1, '正在摸他时他淘气地切行：摸着的人（1.2 m）也被带走')
  // 4) 训练切行带人
  setPhase(W.eng, 'train', 0.02)
  W.until(() => inCage(e().x, e().y) && !e().fr!.noclip, 30, () => { W.p.x = 300; W.p.y = 160 })
  const c1 = W.eng.ferrenRun.carried
  const tr = W.until(() => !!e().fr!.noclip, 40, () => { W.p.x = e().x + 0.45; W.p.y = e().y + 0.1 })
  W.until(() => !e().fr!.noclip, 5, () => { if (!e().fr!.noclip?.done) { W.p.x = e().x + 0.45; W.p.y = e().y + 0.1 } })
  ok(tr && W.eng.ferrenRun.carried === c1 + 1 && inCage(W.p.x, W.p.y), '训练的切行练习：贴着他的玩家被带到笼子另一侧')
  // 5) 落点全部合法（200 次）
  const reach = F.ferrenReach(W.eng)
  let bad = 0, outside = 0, maxD = 0
  for (let i = 0; i < 200; i++) {
    const f = e(); f.x = FERREN_CAGE.spawn.x + (Math.random() - 0.5) * 2.5; f.y = FERREN_CAGE.spawn.y + (Math.random() - 0.5) * 2.5
    const d = F.pickNoclipDest(W.eng, f, i % 3 === 0 ? 'train' : 'spont')
    if (!d) continue
    const land = F.playerLanding(W.eng, d.x, d.y, 0)
    const zone = tradersZoneAt(d.x, d.y)?.kind
    const why = !reach.has(Math.floor(d.y) * MAP.w + Math.floor(d.x)) ? 'reach' : !canOccupy(MAP, d.x, d.y, 0.22, { z: 0, band: 0 }) ? 'occ' : !land ? 'land' : zone === 'vault' ? 'vault' : MAP.tiles[Math.floor(d.y) * MAP.w + Math.floor(d.x)] !== 1 ? 'tile' : ''
    if (why) { bad++; if (bad < 4) console.log('   bad dest', why, d.x.toFixed(2), d.y.toFixed(2), 'from', f.x.toFixed(2), f.y.toFixed(2)) }
    if (!inCage(d.x, d.y)) outside++
    maxD = Math.max(maxD, Math.hypot(d.x - f.x, d.y - f.y))
  }
  ok(bad === 0 && outside > 50 && maxD <= FR.OUT_MAX + 0.01, `200 次切行落点全部合法：连通区域内、不进墙 / 结构、不进保险库、玩家有地方站（笼外 ${outside} 次，最远 ${maxD.toFixed(1)} m）`)
  let viaDoor = 0
  for (const i of reach.keys()) { const x = i % MAP.w + 0.5, y = Math.floor(i / MAP.w) + 0.5; if (MAP.structures.some((s) => s.data?.tradersDoor && x > s.x - 1 && x < s.x + s.w + 1 && y > s.y - 1 && y < s.y + s.h + 1)) viaDoor++ }
  ok(viaDoor === 0 && [...reach.keys()].every((i) => tradersZoneAt(i % MAP.w + 0.5, Math.floor(i / MAP.w) + 0.5) !== undefined), `可切行区域（${reach.size} 格）不过门、都在商人之家的分区里`)
}

// ── 不反击、声望
{
  const W = world('play', 0.4); const e = () => W.fer()
  W.run(0.5); W.p.x = e().x + 0.8; W.p.y = e().y
  const hp0 = W.p.hp
  e().hp -= 5; e().stunT = 0.35
  const states = new Set<string>()
  W.run(4, () => states.add(e().state))
  ok(!states.has('chase') && !states.has('attack') && W.p.hp === hp0 && ENTITIES.ferren.noRetaliate && ENTITIES.ferren.damage === 0, '被打不反击（不进 chase / attack，玩家不掉血）')
  const combatSrc = readFileSync(new URL('../src/game/engine/combat.ts', import.meta.url), 'utf8')
  ok(combatSrc.includes("if (e.def.type === 'ferren') eng.changeRep('bntg', -15)"), '攻击 Ferren：B.N.T.G. 声望 −15（combat.ts 保持原状）')
  const r0 = W.eng.rep.bntg, victim = e(); victim.hp = 0; W.eng.killCheck(victim)
  ok(W.eng.rep.bntg === r0 - 50 && victim.dead, '杀死 Ferren：B.N.T.G. 声望 −50')
  ok(!/\.items|addItem|removeItem|countItem|inventory|hotbar|backpack/.test(readFileSync(new URL('../src/game/engine/ferrenAI.ts', import.meta.url), 'utf8')), 'ferrenAI 不碰地上物品和背包（不偷东西、不带回资源）')
}

// ── 存档
{
  const W = world('sleep', 0.4)
  W.until(() => W.fer().fr?.act === 'nestSleep', 30); W.p.x = W.fer().x + 0.8; W.p.y = W.fer().y - 0.6; W.press()
  W.eng.ferrenRun.petGain = 2; W.eng.ferrenRun.petCycle = Math.floor(W.eng.ferrenRun.clock / FR.CYCLE); W.eng.ferrenRun.petCd = 7
  const snap = JSON.parse(JSON.stringify(snapshot(W.eng)))
  ok(snap.ferren && near(snap.ferren.clock, W.eng.ferrenRun.clock) && snap.ferren.tuck === W.eng.ferrenRun.tuck, `存档写入作息时间轴（clock ${snap.ferren?.clock.toFixed(1)}s · ${F.ferrenClockText(snap.ferren?.clock)}）与被子`)
  const back = F.restoreFerren(snap.ferren)
  ok(F.ferrenPhase(back.clock).zh === F.ferrenPhase(W.eng.ferrenRun.clock).zh && back.tuck === W.eng.ferrenRun.tuck && back.petGain === 2 && back.petCd === 7, '读档恢复：同一时段、已盖被子、摸摸计数与冷却')
  const old = F.restoreFerren(undefined)
  ok(F.ferrenClockText(old.clock) === '08:00' && old.tuck === null, '旧档没有 ferren 字段：从 08:00 开始')
  const junk = F.restoreFerren({ clock: NaN, tuck: 3 as any, petGain: -1 })
  ok(Number.isFinite(junk.clock) && junk.tuck === null && junk.petGain === 0, '损坏字段回落默认值')
  const W3: any = new Engine(); W3.ferrenRun.clock = 999; const { resetEffects } = await import('../src/game/engine/effects'); resetEffects(W3, 'newRun')
  ok(F.ferrenClockText(W3.ferrenRun.clock) === '08:00', '新一局重置作息（effects 表 resetOnNewRun）')
  const engSrc = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8')
  ok(engSrc.includes('this.ferrenRun = restoreFerren(snap.ferren)'), '继续游戏读档路径恢复 ferrenRun')
  // 时钟在其它层级也走
  const W4 = world('play', 0.1, { level: 1 }); const c0 = W4.eng.ferrenRun.clock; W4.run(2)
  ok(near(W4.eng.ferrenRun.clock - c0, 2, 0.05), '不在商人之家时作息时钟照样走')
}

// ── 渲染层：片段推进 / 步频同步 / 混合 / 进窝；各片段不穿地
{
  const fake: any = { fr: { clip: 'walk', clipT: 0, speed: 0.9, inNest: false } }
  const st: any = { clip: 'walk', t: 0, prev: null, prevT: 0, k: 1, lift: 0 }
  R.stepFerrenAnim(st, fake, 0.5)
  ok(near(st.t, 0.5 * 0.9 / FERREN_CLIPS.walk.speed, 1e-6), `走路步频按速度同步（0.9 m/s → 片段 ${(0.9 / FERREN_CLIPS.walk.speed).toFixed(1)}× 速）`)
  fake.fr.clip = 'run'; fake.fr.speed = 2.2; R.stepFerrenAnim(st, fake, 0.1)
  ok(st.prev === 'walk' && st.clip === 'run' && st.k > 0 && st.k < 0.5, '切换片段：从上一片段开始混合')
  for (let i = 0; i < 10; i++) R.stepFerrenAnim(st, fake, 0.03)
  ok(st.prev === null && st.k === 1, `${R.FERREN_RENDER.BLEND}s 内混合完成`)
  fake.fr.clip = 'noclip'; fake.fr.clipT = 1.37; R.stepFerrenAnim(st, fake, 0.03); fake.fr.clipT = 1.4; R.stepFerrenAnim(st, fake, 0.03)
  ok(st.t === 1.4, '切行片段直接用 AI 的片段时间（消失与换位同一帧）')
  fake.fr.clip = 'sleep'; fake.fr.inNest = true; for (let i = 0; i < 60; i++) R.stepFerrenAnim(st, fake, 1 / 30)
  ok(Math.abs(st.lift - R.FERREN_RENDER.NEST_BED_Y) < 0.002, `进窝：整只抬到窝垫面（${R.FERREN_RENDER.NEST_BED_Y} m，窝放大 ${R.FERREN_RENDER.NEST_SCALE}×）`)
  const g = buildFerrenMesh(), v = new THREE.Vector3()
  const worst: Record<string, number> = {}
  for (const clip of Object.keys(FERREN_CLIPS) as (keyof typeof FERREN_CLIPS)[]) {
    let lo = 1
    for (let i = 0; i < 48; i++) {
      animateFerren(g, clip, (i / 48) * FERREN_CLIPS[clip].dur); g.updateMatrixWorld(true)
      g.traverse((o: any) => { if (!o.isMesh) return; for (let p = o; p; p = p.parent) if (!p.visible) return; const pa = o.geometry.attributes.position; for (let k = 0; k < pa.count; k += 2) { v.fromBufferAttribute(pa, k).applyMatrix4(o.matrixWorld); if (v.y < lo) lo = v.y } })
    }
    worst[clip] = lo
  }
  const pen = Object.entries(worst).filter(([, y]) => y < -0.002)
  ok(pen.length === 0, `12 个片段都不穿地（最低点：${['walk', 'run', 'stretch', 'roll'].map((c) => `${c} ${(worst[c] * 1000).toFixed(1)}mm`).join(' · ')}）`)
}

console.log(`\n${n - fails}/${n} 通过`)
if (fails) process.exit(1)
