/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// [maid] 管家（Entity 111）阶段 3 无头验收（真实 Engine + 真实无限 L5 地图）。运行：npm run check:maid
// 覆盖：孤例生成（90 s / 关照档 ×0.6 / 只 1 个）· 打扰值（各档响动、距离衰减、走路不算、隔墙听得见）· 安静衰减
//       · 阈值 30 / 60 与关照档 ×0.7 · 警告 → 叹气停车 → 逼近 → 打扫 / 回车 · 不可击杀 · 打扫 = 重伤不致死 + 背包进失物车
//       · 关键物品保留 · 宽限期 · X 要回失物（关注度 +3）· 捡地上的东西 · 首遇问候 · 存档 · 渲染（模型 / 停车换算 / 片段重播）
import { createCanvas } from '@napi-rs/canvas'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const H = await import('../src/game/engine/l5Hotel')
const M = await import('../src/game/engine/maidAI')
const { specialAction } = await import('../src/game/engine/special')
const { ENTITIES, entitySpawnLevels } = await import('../src/game/entities')
const { snapshot } = await import('../src/game/engine/save')
const { audio } = await import('../src/game/core/audio')
const MG = await import('../src/game/world/mapgen')
const { L5_STAFF } = await import('../src/game/content/l5Staff')
const { ITEMS, isKeyItem } = await import('../src/game/content/items')
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (k !== 'constructor' && typeof (audio as any)[k] === 'function') (audio as any)[k] = () => {}
const { MD } = M

let fails = 0, n = 0
const ok = (c: unknown, m: string, dbg?: unknown) => { n++; console.log(`${c ? '✔' : '✘'} ${m}${dbg !== undefined ? '  ' + JSON.stringify(dbg) : ''}`); if (!c) fails++ }
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps

const SEED = 4242
const msgs: string[] = []
const fresh = (seed = SEED) => {
  const e: any = new Engine(); e.seed = seed
  e.loadLevel(5, { mapSeed: seed, firstVisit: true }); e.introT = 0
  e.emit = () => {}; e.persist = () => {}
  e.map.entities = []
  Object.assign(e.player, { hp: 100, sanity: 80, hunger: 100, thirst: 100, stamina: 100 })
  e.hotel = H.freshHotel()
  const m0 = e.msg.bind(e); e.msg = (t: string, k?: any) => { msgs.push(t); m0(t, k) }
  return e
}
const walk = (e: any, x: number, y: number) => MG.walkableAt(e.map, Math.floor(x), Math.floor(y), 0 as any) && e.entityWalkH(e.map, Math.floor(x), Math.floor(y), 0) !== null
/** 在玩家附近找一个和玩家视线相通、相距 dmin–dmax 的可走点 */
const spotNear = (e: any, dmin: number, dmax: number, o?: { x: number; y: number }) => {
  const p = o ?? e.player
  for (let r = dmin; r <= dmax; r += 0.25) for (let a = 0; a < Math.PI * 2; a += 0.2) {
    const x = Math.floor(p.x + Math.cos(a) * r) + 0.5, y = Math.floor(p.y + Math.sin(a) * r) + 0.5
    if (walk(e, x, y) && e.los(p.x, p.y, x, y)) return { x, y }
  }
  return null
}
const maidAt = (e: any, d0 = 3, d1 = 6) => { const s = spotNear(e, d0, d1)!; const m = M.spawnMaid(e, s)!; m.facing = Math.atan2(e.player.y - m.y, e.player.x - m.x); return m }
const run = (e: any, m: any, sec: number, dt = 0.05, each?: () => void) => { for (let t = 0; t < sec; t += dt) { M.updateMaid(e, m, dt); each?.() } }

// ---------------------------------------------------------------------------
console.log('— 定义 / 图鉴 / 员工名录 —')
{
  const d = ENTITIES.maid
  ok(d && d.naturalSpawn === false && d.damage === 0, '实体定义 maid：不进生成池、无普通攻击')
  ok(entitySpawnLevels('maid').some((s) => s.id === 5 && s.event), '图鉴层级归属：L5（事件生成）')
  ok(d.codex.lore.some((l) => l.includes('您好，酒店服务')), '图鉴引用维基台词')
  ok(L5_STAFF.find((s) => s.id === 'maid')!.habits.some((h) => h.includes('清洁车')), '员工名录习性写明失物在清洁车上')
}

console.log('— 孤例生成 —')
{
  const e = fresh()
  for (let i = 0; i < 89 * 4; i++) M.stepMaidWorld(e, 0.25)
  ok(!M.findMaid(e), '进层 89 s：还没有出现')
  for (let i = 0; i < 12; i++) M.stepMaidWorld(e, 0.25)
  const m = M.findMaid(e)
  ok(!!m, '进层 90 s 后出现')
  if (m) {
    const dd = Math.hypot(m.x - e.player.x, m.y - e.player.y)
    ok(dd >= MD.spawnR[0] - 1 && dd <= MD.spawnR[1] + 1.5, `在 ${MD.spawnR[0]}–${MD.spawnR[1]} m 外出现（${dd.toFixed(1)} m）`)
    ok(H.hotelUnseen(e, m.x, m.y), '出现在玩家视线外')
  }
  for (let i = 0; i < 400; i++) M.stepMaidWorld(e, 0.5)
  ok(e.map.entities.filter((x: any) => x.def.type === 'maid').length === 1, '同一张地图只有 1 个')
  const e2 = fresh(SEED + 1); e2.hotel.attn = 55
  for (let i = 0; i < 56 * 4; i++) M.stepMaidWorld(e2, 0.25)
  ok(!!M.findMaid(e2), '「关照」档以上：54 s 就出现（×0.6）')
  const e3 = fresh(SEED + 2); e3.loadLevel(1, { firstVisit: true }); for (let i = 0; i < 200; i++) M.stepMaidWorld(e3, 1)
  ok(!e3.map.entities.some((x: any) => x.def.type === 'maid'), '别的层级不会生成')
}

console.log('— 打扰值 —')
{
  ok(M.maidNoiseAmt(4, false) === 0 && M.maidNoiseAmt(1, false) === 0, '走路 / 蹲行不算打扰')
  ok(M.maidNoiseAmt(10, true) === MD.amtSprintStep, `冲刺脚步 ${MD.amtSprintStep}/步`)
  ok(M.maidNoiseAmt(20, true) === MD.amtGun && M.maidNoiseAmt(16, true) === MD.amtBreak && M.maidNoiseAmt(8, false) === MD.amtMelee, '开枪 / 破门 / 近战分档')
  const e = fresh(), m = maidAt(e, 3, 5), s = M.ensureMaid(m)
  e.noiseEvent(e.player.x, e.player.y, 4, false)
  ok(s.dist === 0, '正常走路的脚步声：打扰值 0')
  e.noiseEvent(e.player.x, e.player.y, 10, true)
  const one = s.dist
  ok(one > MD.amtSprintStep * 0.6 && one <= MD.amtSprintStep, `近处冲刺一步 +${one.toFixed(1)}（noiseEvent 接入）`)
  s.dist = 0
  e.noiseEvent(m.x + 25, m.y, 20, true)
  ok(s.dist > 0 && s.dist < MD.amtGun * 0.6, `25 m 外的枪声按距离衰减（+${s.dist.toFixed(1)}）`)
  s.dist = 0; e.noiseEvent(m.x + 40, m.y, 20, true)
  ok(s.dist === 0, '超出听距（30 m）听不见')
  // 隔墙：找一个看不见但 12 m 内的点
  s.dist = 0
  let wall: any = null
  for (let a = 0; a < Math.PI * 2 && !wall; a += 0.1) for (let r = 4; r < 12 && !wall; r += 0.5) { const x = m.x + Math.cos(a) * r, y = m.y + Math.sin(a) * r; if (walk(e, x, y) && !e.los(m.x, m.y, x, y)) wall = { x, y } }
  if (wall) { M.maidHear(e, m, wall.x, wall.y, 20, true); ok(s.dist > 20, '隔着墙也听得见枪声', +s.dist.toFixed(1)) }
  // 安静衰减
  s.dist = 60; s.quietT = 0; s.warnCd = 99
  run(e, m, 1.0); const a = s.dist
  run(e, m, 5.0)
  ok(near(a, 60, 0.5) && near(s.dist, 30, 1.2), `安静 1 s 内不降，之后每秒 −${MD.decay}：6 s 后 ≈30（${s.dist.toFixed(1)}）`)
  ok(near(M.maidWarnAt(e), 30) && near(M.maidActAt(e), 60), '阈值 30 / 60')
  e.hotel.attn = 52
  ok(near(M.maidWarnAt(e), 21) && near(M.maidActAt(e), 42), '「关照」档：阈值 ×0.7 → 21 / 42')
}

console.log('— 警告 / 叹气 / 逼近 / 回车 —')
{
  const e = fresh(), m = maidAt(e, 6, 9), s = M.ensureMaid(m), ms = M.maidSave(e)
  ms.greeted = true; msgs.length = 0
  s.dist = 35; s.quietT = 0
  M.updateMaid(e, m, 0.05)
  ok(s.mode === 'warn' && s.clip === 'watch', '打扰值 ≥30：先转头注视')
  run(e, m, 1.0, 0.05, () => { s.quietT = 0 })
  ok(s.clip === 'shush' && msgs.some((t) => t.includes('现在您能安静一下了吗')), '然后「嘘」+ 字幕「现在您能安静一下了吗？您这样对大家都没好处。」')
  ok(ms.warn === 1 && (e.hotel.staff.maid ?? 0) < 0, '登记簿：被警告 1 次、关系下降')
  run(e, m, 2.2, 0.05, () => { s.quietT = 0 })
  ok(s.mode === 'patrol', '警告完回去推车')
  s.dist = 35; s.quietT = 0; M.updateMaid(e, m, 0.05)
  ok(s.mode === 'patrol', `警告冷却 ${MD.warnCd} s 内不重复警告`)
  // 叹气 + 停车
  msgs.length = 0; s.dist = 70; s.quietT = 0
  M.updateMaid(e, m, 0.05)
  ok(s.mode === 'sigh' && !!s.cart && msgs.some((t) => t.includes('唉')), '≥60：叹气「唉。」并把车停下')
  const cart = { ...s.cart! }
  run(e, m, 2.5, 0.05, () => { s.quietT = 0 })
  ok(s.mode === 'approach' && s.clip === 'approach', '叹完气缓步走向噪音源')
  const d0 = Math.hypot(m.x - e.player.x, m.y - e.player.y)
  s.dist = 100; run(e, m, 1.0, 0.05, () => { s.quietT = 0 })
  const d1 = Math.hypot(m.x - e.player.x, m.y - e.player.y)
  ok(d1 < d0 && s.speed > 0 && s.speed <= MD.approach + 0.05, `逼近速度 ≤ ${MD.approach} m/s（从不跑）`, { d0: +d0.toFixed(2), d1: +d1.toFixed(2) })
  // 安静下来 → 回车
  s.dist = M.maidWarnAt(e) - 1
  M.updateMaid(e, m, 0.05)
  ok(s.mode === 'return', '途中打扰值降到 30 以下：转身回去推车')
  let at: any = null
  run(e, m, 30, 0.05, () => { if (!at && s.mode === 'patrol') at = { x: m.x, y: m.y, f: m.facing }; if (s.mode === 'patrol' || s.mode === 'chore') s.choreT = 99 })
  ok((s.mode === 'patrol' || s.mode === 'chore') && s.cart === null, '回到车旁，接着推车巡楼')
  ok(at && Math.hypot(at.x - (cart.x - Math.cos(cart.f) * MD.cartAhead), at.y - (cart.y - Math.sin(cart.f) * MD.cartAhead)) < 1.0 && near(at.f, cart.f, 1e-6), '回到停车位置、朝向车头', at)
}

console.log('— 打扫 —')
{
  const e = fresh(), p = e.player
  p.backpack = p.backpack.map(() => null)
  const key = Object.keys(ITEMS).find((k) => isKeyItem(k))
  e.addItem('almond'); e.addItem('almond'); e.addItem('bandage')
  // 塞进背包（快捷栏不动）
  p.backpack[0] = { type: 'almond', count: 2 }; p.backpack[1] = { type: 'bandage', count: 1 }; if (key) p.backpack[2] = { type: key, count: 1 }
  const hotbar = JSON.stringify(p.hotbar)
  const m = maidAt(e, 0.6, 1.0), s = M.ensureMaid(m), ms = M.maidSave(e); ms.greeted = true
  s.dist = 90; s.quietT = 0; s.mode = 'approach'; s.clip = 'approach'
  M.updateMaid(e, m, 0.05)
  ok(s.mode === 'clean', '接触时打扰值仍 ≥60 → 打扫')
  run(e, m, 0.8, 0.05)
  ok(!e.over && p.hp === MD.hurtHp && p.hp > 0, `重伤不致死：HP 压到 ${MD.hurtHp}`, p.hp)
  ok(p.backpack[0] === null && p.backpack[1] === null, '背包里的东西被收走')
  ok(!key || p.backpack[2]?.type === key, '关键物品留在背包里（不会卡关）', key)
  ok(JSON.stringify(p.hotbar) === hotbar, '快捷栏不动')
  ok(ms.cart.some((i) => i.type === 'almond' && i.count === 2) && ms.cart.some((i) => i.type === 'bandage'), '收走的东西全部进她的失物车', ms.cart.map((i) => i.type))
  ok(ms.clean === 1 && e.hotelBook.met.includes('maid'), '登记簿：被打扫 1 次、员工名录解锁')
  run(e, m, 2.0)
  ok((s.mode === 'return' || s.mode === 'patrol') && s.dist === 0 && s.grace > 20, `打扫完回去推车，${MD.grace} s 宽限`)
  e.noiseEvent(p.x, p.y, 20, true)
  ok(s.dist === 0, '宽限期内的响动不计')
  // 低血量：不会被打死
  const e2 = fresh(); e2.player.hp = 4
  const m2 = maidAt(e2, 0.6, 1.0), s2 = M.ensureMaid(m2); M.maidSave(e2).greeted = true
  s2.dist = 90; s2.mode = 'approach'; s2.clip = 'approach'; run(e2, m2, 1.0)
  ok(!e2.over && e2.player.hp === 3, '本来只剩 4 HP：只扣到 3，不会死')
}

console.log('— 不可击杀 —')
{
  const e = fresh(), m = maidAt(e, 3, 6), s = M.ensureMaid(m); M.maidSave(e).greeted = true
  m.hp -= 5000; e.killCheck(m)
  ok(!m.dead && m.hp === m.def.hp, '打掉 5000 HP：不死、血量回满')
  ok(s.dist === 100 && s.mode === 'approach' && !!s.cart, '挨打 = 打扰值拉满，直接放下车走过来')
}

console.log('— X 要回失物 —')
{
  const e = fresh(), p = e.player, ms = M.maidSave(e); ms.greeted = true
  p.backpack = p.backpack.map(() => null); p.hotbar = p.hotbar.map(() => null)
  ms.cart.push({ type: 'bandage', count: 1, t: 1 }, { type: 'almond', count: 2, t: 2 })
  const m = maidAt(e, 1.0, 1.8), s = M.ensureMaid(m)
  const sa = specialAction(e)
  ok(sa?.id === 'maid-reclaim' && sa.label.includes('2'), 'X 情境：「向管家要回失物（2）」', sa?.label)
  const a0 = e.hotel.attn
  e.specialPressed = true; ok(M.maidPress(e), '按 X')
  ok(e.countItem('bandage') === 1 && ms.cart.length === 1, '先还最早收走的一件')
  ok(near(e.hotel.attn - a0, MD.attnReclaim, 0.01), `关注度 +${MD.attnReclaim}`)
  ok(s.mode === 'serve' && ms.reclaim === 1, '她停下来递东西；登记簿领回 1 件')
  run(e, m, 2.1)
  e.specialPressed = true; M.maidPress(e)
  ok(e.countItem('almond') === 2 && ms.cart.length === 0, '再按一次：两瓶杏仁水一起还')
  ok(!specialAction(e) || specialAction(e)!.id !== 'maid-reclaim', '车空了就不再提示')
  ms.cart.push({ type: 'bandage', count: 1, t: 3 }); s.mode = 'approach'
  ok(!M.maidSpecial(e), '她不平静（逼近中）时不能要')
}

console.log('— 捡地上的东西 / 首遇问候 —')
{
  const e = fresh(), m = maidAt(e, 4, 7), s = M.ensureMaid(m), ms = M.maidSave(e)
  msgs.length = 0
  M.updateMaid(e, m, 0.05)
  ok(s.mode === 'greet' && msgs.some((t) => t.includes('您好，酒店服务')), '首次看见安静的住客：欠身「您好，酒店服务！」')
  ok(e.hotelBook.met.includes('maid') && ms.greeted, '员工名录解锁、本局不再重复问候')
  run(e, m, 2.6)
  ok(s.mode === 'patrol', '问候完接着巡楼')
  const sp = spotNear(e, 1.5, 3, m)!
  e.map.items.push({ type: 'bandage', count: 1, x: sp.x, y: sp.y, dropped: e.time })
  run(e, m, 6)
  ok(!e.map.items.some((i: any) => i.type === 'bandage' && i.dropped !== undefined) && ms.cart.some((i) => i.type === 'bandage'), '住客丢在地上的东西：走过去捡起来放进失物车')
}

console.log('— 存档 —')
{
  const e = fresh(), ms = M.maidSave(e)
  ms.cart.push({ type: 'almond', count: 3, t: 1 }); ms.warn = 2; ms.clean = 1; ms.reclaim = 4; ms.greeted = true
  const snap: any = snapshot(e)
  const r = H.restoreHotel(JSON.parse(JSON.stringify(snap.hotel)))
  ok(r.maid?.cart[0]?.count === 3 && r.maid.warn === 2 && r.maid.clean === 1 && r.maid.reclaim === 4 && r.maid.greeted, '失物车与次数随存档保存 / 读取')
  ok(H.restoreHotel({}).maid === undefined, '旧存档没有管家数据也能读')
}

console.log('— 渲染 —')
{
  const THREE = await import('three')
  const { buildMaidEntityMesh, animateMaidEntity } = await import('../src/game/renderer/maidRender')
  const g = buildMaidEntityMesh()
  const box = new THREE.Box3().setFromObject(g.userData.maidModel)
  ok(box.max.y > 1.9 && box.max.y < 2.1, `模型高约 2 m（${box.max.y.toFixed(2)}）`)
  ok(box.max.x - (box.min.x + box.max.x) / 2 >= 0, '实体组正面 +X')
  const e = fresh(), m = maidAt(e, 3, 6), s = M.ensureMaid(m)
  g.position.set(m.x, 0, m.y); g.rotation.y = -m.facing
  animateMaidEntity(g, m, 0.1, 0)
  const cart = g.userData.maidCart
  ok(near(cart.position.x, MD.cartAhead) && near(cart.position.z, 0), '推车时车挂在身前')
  s.cart = { x: m.x + 2, y: m.y - 1, f: 0.7 }; m.facing += 1.1; g.rotation.y = -m.facing
  animateMaidEntity(g, m, 0.1, 0); g.updateMatrixWorld(true)
  const w = new THREE.Vector3(); cart.getWorldPosition(w)
  ok(near(w.x, m.x + 2, 1e-4) && near(w.z, m.y - 1, 1e-4), '停车后车固定在世界坐标（转身也不跟着走）')
  const seq0 = g.userData.maidView.seq; s.seq++; s.clip = 'sigh'; animateMaidEntity(g, m, 0.1, 0)
  ok(g.userData.maidView.seq === seq0 + 1 && g.userData.maidView.an.clip === 'sigh', '片段按 seq 重播')
}

console.log(`\n${n - fails}/${n} 通过`)
process.exit(fails ? 1 : 0)
