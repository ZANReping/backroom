/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// [chef] 厨师（Entity 800）阶段 3 无头验收（真实 Engine + 真实无限 L5 地图：种子 800 的出生点西边就有一座带后场的餐厅）。运行：npm run check:chef
// 覆盖：定义 / 物品 / 员工名录 / 数值表 / 片段时长与关键时刻 · 后场与餐厅摆放（墙 / 门 / 灶 / 刀墙 / 正门 / 餐桌 / 铁管，对齐 chefAnim 摆放常量；路线连通）
//       · 看不见他（默认融进环境、不看他不进厨房不碰你）· 被看见六种触发（盯着看 / 相机 / 进厨房 / 关注度 / 乱摇铃 / 动手）
//       · 盯上后靠近 → 绕到桌子对面敲桌（−理智）→ 背对 / 看出口 → 冲上来抡锅（1.41 s 判定、跑开能躲）→ 黑屏拖走 → 冷库
//       · 冷库限时脱身（万能钥匙 / 撬棍按住开铐、连按扯管子 + 提前回来、超时取刀进门 = 死亡、体温）· 夜晚闩门（换班 → 走到正门 barricade → 正门实心 + 侧门上锁 → 营业后解开）
//       · 铃声引开（earTwitch → 去铃台 → 厨房空了不被发现）· 偷锅（暴怒只抓不砸、停供、抓到收回、丢在餐厅他捡回）· 关灶 / 砸灶（守灶不出、停供、计时恢复）
//       · 食物（三道菜、回血回饱、上瘾：饥饿 ×1.6 + 念头字幕 + 变暖 + 盯他不涨）· 真相（理智高时端详 / 档案员遗物 → 描述变成真相、再吃掉理智）
//       · 档案员物品（冷库 / 餐桌边、相机闪光）· 兔子联动（终点 = 他的餐厅 → 盯上）· 野兽联动（关注度满 → 交给厨师）· 管家擦血迹 · 血量 · 打不死 · 存档往返 · 渲染
import { createCanvas } from '@napi-rs/canvas'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const H = await import('../src/game/engine/l5Hotel')
const C = await import('../src/game/engine/chefAI')
const S = await import('../src/game/engine/spokesAI')
const A = await import('../src/game/engine/beastAI')
const MD = await import('../src/game/engine/maidAI')
const { specialAction } = await import('../src/game/engine/special')
const { ENTITIES, entitySpawnLevels } = await import('../src/game/entities')
const { snapshot } = await import('../src/game/engine/save')
const { audio } = await import('../src/game/core/audio')
const { L5_STAFF } = await import('../src/game/content/l5Staff')
const { ITEMS } = await import('../src/game/content/items')
const { killCheck } = await import('../src/game/engine/combat')
const L = await import('../src/game/content/chefLayout')
const AN = await import('../src/game/renderer/chefAnim')
const { look } = await import('../src/game/renderer/shared')
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (k !== 'constructor' && typeof (audio as any)[k] === 'function') (audio as any)[k] = () => {}
const { CK } = C

let fails = 0, n = 0
const ok = (c: unknown, m: string, dbg?: unknown) => { n++; console.log(`${c ? '✔' : '✘'} ${m}${dbg !== undefined ? '  ' + JSON.stringify(dbg) : ''}`); if (!c) fails++ }
const SEED = 800
const msgs: string[] = []
const deaths: string[] = []
const prep = (e: any) => {
  e.emit = () => {}; e.persist = () => {}
  const m0 = e.msg.bind(e); e.msg = (t: string, k?: any) => { msgs.push(t); return m0(t, k) }
  e.die = (cause: string) => { deaths.push(cause); e.over = true }
  Object.assign(e.player, { hp: 100, sanity: 70, hunger: 50, thirst: 80, stamina: 100 })
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
const site = (e: any) => C.chefSite(e)!
const at = (e: any, x: number, y: number) => { e.player.x = x; e.player.y = y }
const lookAt = (e: any, x: number, y: number) => { e.player.facing = Math.atan2(y - e.player.y, x - e.player.x); look.yaw = -e.player.facing - Math.PI / 2 }
const stepAll = (e: any, dt = 0.05) => {
  e.time += dt
  C.stepChefGlobal(e, dt); C.stepChefWorld(e, dt); C.chefPress(e); C.chefControlsPlayer(e, dt)
  for (const x of [...e.map.entities]) { if (x.def.type === 'chef') C.updateChef(e, x, dt); else if (x.def.type === 'maid') MD.updateMaid(e, x, dt) }
}
const run = (e: any, sec: number, dt = 0.05, each?: (t: number) => boolean | void) => { for (let t = 0; t < sec; t += dt) { if (each?.(t)) return true; stepAll(e, dt) } return false }
const has = (e: any, t: string) => [...e.player.hotbar, ...e.player.backpack].some((s: any) => s?.type === t)
const chef = (e: any) => C.findChef(e)!
const sv = (e: any) => C.chefSave(e)
/** 玩家站进餐厅（正门内几步）并生成他 */
const inDining = (e: any) => { const s = site(e); const p = W(e, { x: s.front.x + 1, y: s.hall.y1 - 1.5 }); at(e, p.x, p.y); lookAt(e, p.x, p.y + 5); stepAll(e); return chef(e) }
const floorOk = (e: any, x: number, y: number) => { const m = e.map; const tx = Math.floor(x), ty = Math.floor(y); return m.tiles[ty * m.w + tx] === 1 && !m.structures.some((s: any) => s.solid && tx >= s.x && tx < s.x + (s.w || 1) && ty >= s.y && ty < s.y + (s.h || 1)) }
const toRoot = (e: { x: number; y: number; facing: number }, wx: number, wy: number) => C.chefToRoot(e, wx, wy)

// ---------------------------------------------------------------------------
console.log('— 定义 / 物品 / 员工名录 / 数值表 / 片段 —')
{
  const d: any = ENTITIES.chef
  ok(d && d.name === '厨师' && d.damage === 0 && d.naturalSpawn === false && d.codex.no.includes('Entity 800'), '实体定义 chef = Entity 800：不进生成池、伤害走自己的抡锅')
  ok(entitySpawnLevels('chef').some((s: any) => s.id === 5), '图鉴层级归属：L5')
  ok(/看不见|视而不见/.test(d.codex.behavior) && /锅/.test(d.codex.behavior) && /冰柜|冷库/.test(d.codex.behavior) && /铃声/.test(d.codex.counter), '图鉴：维基叙事（顾客看不见他、唯一带把手的锅、冰柜铁管、铃声）')
  ok(!/肠子|内脏|开膛/.test(JSON.stringify(d.codex)), '图鉴避开过度血腥描写')
  for (const t of ['chefpot', 'megcamera', 'megmic', 'megform', 'chefphoto']) ok(!!(ITEMS as any)[t]?.glyph, `物品定义 ${t}（${(ITEMS as any)[t]?.name}）`)
  ok((ITEMS as any).chefpot.weapon > 0, '带把手的锅：可以当钝器')
  const st = L5_STAFF.find((s) => s.id === 'chef')!
  ok(st.habits.length >= 6 && st.habits.some((h) => h.includes('敲')) && st.habits.some((h) => h.includes('冷库')) && st.habits.some((h) => h.includes('铃')), '员工名录：习性写明敲桌 / 冷库 / 铃声')
  ok(Object.entries(C.CHEF_CLIP_LEN).every(([k, v]) => (AN.CHEF_CLIPS as any)[k]?.dur === v), 'AI 片段时长表 = chefAnim CHEF_CLIPS')
  ok(Object.entries(C.CHEF_CLIP_SPEED).every(([k, v]) => (AN.CHEF_CLIPS as any)[k]?.speed === v), 'AI 片段速度 = CHEF_CLIPS.speed')
  const P0 = AN.chefPose('takeKnife', C.KNIFE_TAKE - 0.02), P1 = AN.chefPose('takeKnife', C.KNIFE_TAKE + 0.02)
  ok(P0.props.knife === 0 && P1.props.knife === 1 && P0.props.wallKnife === 1 && P1.props.wallKnife === 0, `takeKnife：${C.KNIFE_TAKE} s 刀从墙上到手里`)
  const b0 = AN.chefPose('barricade', C.BAR_BOLT - 0.4).props.boltX, b1 = AN.chefPose('barricade', C.BAR_BOLT).props.boltX
  ok(b1 <= AN.CHEF_DOOR.boltTo + 0.02 && b0 > b1, `barricade：${C.BAR_BOLT} s 门闩推到位（${b1.toFixed(3)}）`)
  // 抡锅：1.41 s 时锅在前方、出手很快（1.35→1.47）
  ok(C.TAP_TIMES.length === 3 && CK.swingHit > 1.35 && CK.swingHit < 1.47, '抡锅判定落在 0.12 s 出手窗口里')
  ok(CK.coldLimit === 75 && CK.addictK === 0.6 && CK.truthSan === 80 && CK.stareT === 3, '数值表：冷库 75 s / 饥饿 ×1.6 / 真相理智 80 / 盯 3 s')
  ok(C.CRAVE.length >= 6 && C.CRAVE_TRUE.length >= 3, `念头文案：${C.CRAVE.length} + ${C.CRAVE_TRUE.length} 条`)
}

console.log('— 后场与餐厅：摆放 —')
const e0 = fresh()
{
  const s = site(e0), m = e0.map
  ok(!!s && s.hall.x1 - s.hall.x0 >= 25, `种子 ${SEED}：窗口里有一座带后场的餐厅（大厅格 ${s?.hk},${s?.hr}）`)
  const tile = (x: number, y: number) => m.tiles[(y - oy(e0)) * m.w + (x - ox(e0))]
  ok([...Array(s.hall.x1 - s.hall.x0 + 1).keys()].every((i) => { const x = s.hall.x0 + i; return s.swing.some((d: any) => d.x === x) ? tile(x, s.sy) === 1 : tile(x, s.sy) !== 1 }), '后场南墙：只在弹簧门两格开口')
  ok(tile(s.pantryDoor.x, s.pantryDoor.y) === 1 && tile(s.coldDoor.x, s.coldDoor.y) === 1 && tile(s.pantryDoor.x, s.pantryDoor.y - 2) !== 1, '储藏室 / 冷库隔墙：各一道门')
  ok(tile(s.front.x, s.front.y) === 1 && tile(s.front.x + 1, s.front.y) === 1, '餐厅南墙正中：双开正门两格')
  ok(tile(s.hall.x0 + 3, s.hall.y0 - 1) !== 1 && tile(s.hall.x1 - 3, s.hall.y0 - 1) !== 1 && tile(s.hall.x0 - 1, s.hall.y0 + 3) !== 1, '北面 / 侧面靠北的原门洞封死（不会直接走进后场）')
  const S0 = (p: string) => m.structures.filter((q: any) => q.kind === 'chefprop' && q.data?.prop === p && q.x + ox(e0) >= s.hall.x0 - 1 && q.x + ox(e0) <= s.hall.x1 + 1 && q.y + oy(e0) >= s.hall.y0 - 1 && q.y + oy(e0) <= s.hall.y1 + 1)
  for (const p of ['stove', 'knives', 'counter', 'sink', 'shelf', 'coldshelf', 'carcass', 'pipe', 'swing', 'front', 'bell', 'table', 'tabledyn', 'wallpaper']) ok(S0(p).length > 0, `结构 chefprop ${p}`)
  {
    // 天鹅绒壁纸：餐厅四面墙的每一格实墙都贴上（门洞断开）；长段跨 chunk 时按 chunk 裁剪，不能整段丢
    const dH = s.dining, cov = new Map<string, number>()
    for (const q of m.structures) if (q.kind === 'chefprop' && q.data?.prop === 'wallpaper') for (let i = 0; i < q.w; i++) for (let j = 0; j < q.h; j++) { const k = `${q.data.side}:${q.x + ox(e0) + i},${q.y + oy(e0) + j}`; cov.set(k, (cov.get(k) ?? 0) + 1) }
    const want: [string, number, number, number, number][] = []
    for (let y = dH.y0; y <= dH.y1; y++) { want.push(['w', dH.x0, y, dH.x0 - 1, y]); want.push(['e', dH.x1, y, dH.x1 + 1, y]) }
    for (let x = dH.x0; x <= dH.x1; x++) { want.push(['n', x, dH.y0, x, dH.y0 - 1]); want.push(['s', x, dH.y1, x, dH.y1 + 1]) }
    let wall = 0, hit = 0, dup = 0, onDoor = 0
    for (const [sd, x, y, wx, wy] of want) { const c = cov.get(`${sd}:${x},${y}`) ?? 0; if (c > 1) dup++; if (tile(wx, wy) !== 1) { wall++; if (c) hit++ } else if (c) onDoor++ }
    const miss = want.filter(([sd, x, y, wx, wy]) => tile(wx, wy) !== 1 && !cov.get(`${sd}:${x},${y}`)).map((w) => w.slice(0, 3).join(":"))
    ok(wall > 100 && hit === wall && dup === 0 && onDoor === 0, `天鹅绒壁纸：餐厅四面实墙 ${hit}/${wall} 格贴上、门洞 ${onDoor} 格、重叠 ${dup}`, miss.length ? miss.slice(0, 60) : undefined)
  }
  const cold = C.chefColdDoor(e0)
  ok(!!cold && cold.x + ox(e0) === s.coldDoor.x && cold.solid, '冷库门：一扇厚门（hoteldoor chefCold，关着）')
  // 灶：站位 root 空间里前沿 z 0.50、台面 0.90；炖锅底心 z 0.78
  const st = S0('stove')[0], sp = W(e0, s.at.stove)
  const front = toRoot({ ...sp, facing: s.at.stove.f }, sp.x, st.y + st.h)
  ok(st.solid && st.w === 2 && Math.abs(front[2] - AN.CHEF_STOVE.z) < 1e-6 && Math.abs(toRoot({ ...sp, facing: s.at.stove.f }, st.x + 1, st.y + st.h)[0]) < 1e-6, `燃气灶：前沿在灶前站位正前方 ${front[2].toFixed(2)} m（= CHEF_STOVE.z），居中`)
  ok(Math.abs(sp.y - 0.78 - (st.y + 0.72)) < 1e-6, '炖锅底心 = 站位前方 0.78 m（灶模型局部 z 0.72）')
  // 刀墙：墙面 z 0.54、那把刀在 root x −0.12
  const kp = W(e0, s.at.knife), kw = S0('knives')[0]
  const wallZ = toRoot({ ...kp, facing: s.at.knife.f }, kp.x, kw.y)[2], knifeX = toRoot({ ...kp, facing: s.at.knife.f }, kw.x + 0.5, kw.y)[0]
  ok(Math.abs(wallZ - AN.CHEF_KNIFE_WALL.z) < 1e-6 && Math.abs(knifeX - AN.CHEF_KNIFE_WALL.knifeX) < 1e-6, `刀墙：墙面 z ${wallZ.toFixed(2)}、那把刀 root x ${knifeX.toFixed(2)}`)
  // 正门：门面 z 0.60、门缝在 root x 0
  const bp = W(e0, s.at.barricade), fr = S0('front')[0]
  const doorZ = toRoot({ ...bp, facing: s.at.barricade.f }, bp.x, fr.y)[2], seamX = toRoot({ ...bp, facing: s.at.barricade.f }, fr.x + 1, fr.y)[0]
  ok(Math.abs(doorZ - AN.CHEF_DOOR.z) < 1e-6 && Math.abs(seamX) < 1e-6 && floorOk(e0, bp.x, bp.y), `正门：门面 z ${doorZ.toFixed(2)}、门缝 x ${seamX.toFixed(2)}（把手 ±0.09）`)
  // 餐桌：敲桌站位 → 桌近边 z 0.42、指尖落在桌子中线
  const tb = S0('table')[0], spots = L.tapSpots({ x: tb.x + ox(e0), y: tb.y + oy(e0) })
  for (const q of spots) {
    const w = W(e0, q), near = toRoot({ ...w, facing: q.f }, tb.x + 0.5, tb.y + 0.5 + (q.f < 0 ? 0.65 : -0.65))
    const tap = C.chefFromRoot({ ...w, facing: q.f }, AN.CHEF_TAP_AT[0], AN.CHEF_TAP_AT[2])
    ok(Math.abs(near[2] - AN.CHEF_TABLE.z) < 1e-6 && Math.abs(tap.x - (tb.x + 0.5)) < 1e-6, `敲桌站位（${q.f < 0 ? '南' : '北'}侧）：桌近边 z ${near[2].toFixed(2)}、指尖 x 偏 ${(tap.x - tb.x - 0.5).toFixed(3)}`)
  }
  // 铁管 + 被铐的人
  const cu = W(e0, s.at.cuff)
  ok(floorOk(e0, cu.x, cu.y) && L.inRect(s.cold, s.at.cuff.x, s.at.cuff.y), '被铐的位置在冷库里、地板上（背靠东墙）')
  // 连通：灶前 → 弹簧门 → 正门 / 冷库门 / 铃台
  const st0 = W(e0, s.at.stove)
  for (const [nm, p] of [['正门内', W(e0, s.at.barricade)], ['铃台', W(e0, s.at.bellStand)], ['刀墙', W(e0, s.at.knife)], ['餐厅中央', W(e0, { x: s.bcx + 1, y: (s.dining.y0 + s.dining.y1) / 2 })]] as const) ok(!!C.bfs(e0, st0.x, st0.y, p.x, p.y), `路线：灶前 → ${nm}`)
  const cd = cold!; cd.solid = false
  ok(!!C.bfs(e0, st0.x, st0.y, cu.x - 0.6, cu.y), '路线：灶前 → 冷库（门开着时）'); cd.solid = true
  const relics = m.items.filter((it: any) => L.inHall(s, it.x + ox(e0), it.y + oy(e0))).map((it: any) => it.type)
  ok(relics.includes('megform') && relics.includes('megmic'), '档案员遗物：冷库地上有表单和胸麦', relics)
}

console.log('— 看不见他 —')
{
  const e = fresh(); const ch = inDining(e)
  ok(!!ch && ch.ck.mode === 'cook' && ch.ck.vis === 0, '走近餐厅：他出现在灶前（孤例），清晰度 0（融进环境）')
  const sp = W(e, site(e).at.stove)
  ok(Math.abs(ch.x - sp.x) < 1e-6 && Math.abs(ch.facing - site(e).at.stove.f) < 1e-6, '站位 = 灶前、面朝灶台')
  // 你在餐厅里四处看（不看他）、不进厨房：30 s 不被发现
  let t0 = 0
  run(e, 30, 0.05, () => { t0 += 0.05; lookAt(e, e.player.x + Math.cos(t0), e.player.y + 2); return false })
  ok(!sv(e).marked && C.findChef(e)!.ck.vis < 0.05, '不看他、不进厨房：30 s 他都不碰你')
  // 别处看不到他：远离 → 收起
  const old = site(e), chOld = C.findChef(e), cx = (old.hall.x0 + old.hall.x1) / 2 - ox(e), cy = (old.hall.y0 + old.hall.y1) / 2 - oy(e)
  let moved = false
  for (let y = 3; y < e.map.h - 3 && !moved; y += 2) for (let x = 3; x < e.map.w - 3 && !moved; x += 2) if (Math.hypot(x - cx, y - cy) > CK.despawnR + 10 && floorOk(e, x + 0.5, y + 0.5)) { at(e, x + 0.5, y + 0.5); moved = true }
  C.chefDebug(e).siteScan = 0; stepAll(e)
  ok(moved && !e.map.entities.includes(chOld), '走远（> 75 m）/ 换到另一座餐厅附近：原来那位收起来')
}

console.log('— 被看见：六种触发 —')
{
  // ① 盯着他看
  const e = fresh(); const ch = inDining(e); const s = site(e)
  const p0 = W(e, { x: s.bcx + 1.5, y: s.sy + 3 }); at(e, p0.x, p0.y)
  // 后场墙挡着看不见：站到弹簧门口
  const pd = W(e, { x: s.bcx + 1, y: s.sy + 0.6 }); at(e, pd.x, pd.y)
  let maxVis = 0
  const marked = run(e, 6, 0.05, () => { lookAt(e, ch.x, ch.y); maxVis = Math.max(maxVis, C.chefDebug(e).stare); return !!sv(e).marked })
  ok(marked && sv(e).n.seen === 1, `① 盯着他看 ${CK.stareT} s → 被盯上`)
  ok(ch.ck.mode === 'stalk' && ch.ck.vis === 1, '盯上之后：他变清楚、开始走过来')
}
{
  // ② 相机
  const e = fresh(); const ch = inDining(e); const s = site(e)
  const pd = W(e, { x: s.bcx + 1, y: s.sy + 0.6 }); at(e, pd.x, pd.y); lookAt(e, ch.x, ch.y)
  e.addItem('megcamera')
  ok(C.chefUseItem(e, 'megcamera') && ch.ck.mode === 'freeze' && ch.ck.clip === 'flashFreeze', '② 档案员的相机：闪光 → flashFreeze 僵住')
  ok(C.chefHud(e)!.flash > 0.5, 'HUD：白色闪光')
  run(e, CK.flashCd + 0.1); ok(C.chefUseItem(e, 'megcamera') && msgs.some((t) => t.includes('还在充电')) === false, '闪光冷却 3 s')
  run(e, 4.2)
  ok(sv(e).marked === 1 && ch.ck.vis === 1, '僵住之后 → 盯上拍照的人')
}
{
  // 相机没对准：他耳朵抽一下过来看
  const e = fresh(); const ch = inDining(e)
  lookAt(e, e.player.x, e.player.y + 5); e.addItem('megcamera')
  C.chefUseItem(e, 'megcamera')
  ok(ch.ck.mode === 'twitch' && ch.ck.clip === 'earTwitch' && !sv(e).marked, '闪光没对准他：earTwitch 耳朵抽搐，过来看看（还没盯上）')
}
{
  // ③ 进厨房（他在厨房、看得见）
  const e = fresh(); const ch = inDining(e); const s = site(e)
  const pk = W(e, { x: s.bcx + 1, y: s.sy - 1.5 }); at(e, pk.x, pk.y); lookAt(e, pk.x, pk.y + 3)
  stepAll(e)
  ok(sv(e).marked === 1 && C.chefZone(e) === 'kitchen', '③ 推开弹簧门进厨房 → 被盯上（就算你背对着他）')
}
{
  // ④ 关注度
  const e = fresh(); inDining(e)
  e.hotel.attn = CK.attnMark + 1; stepAll(e)
  ok(sv(e).marked === 1, `④ 关注度 ≥ ${CK.attnMark} 时出现在餐厅 → 被盯上`)
}
{
  // ⑤ 乱摇服务铃
  const e = fresh(); inDining(e); const s = site(e)
  const bs = W(e, s.at.bellAt); at(e, bs.x + 0.6, bs.y - 0.6)
  ok(C.chefAct(e)?.act === 'bell' && specialAction(e)?.id === 'chef-bell', '铃台旁：X = 摇服务铃')
  C.chefRingBell(e); C.chefRingBell(e)
  ok(!sv(e).marked, '摇两下还不算')
  C.chefRingBell(e)
  ok(sv(e).marked === 1, `⑤ ${CK.bellWin} s 内摇 ${CK.bellSpam} 次 → 被盯上`)
}
{
  // ⑥ 动手：打不死，只顿一下
  const e = fresh(); const ch = inDining(e)
  ch.hp = -5; killCheck(e, ch)
  ok(!ch.dead && ch.hp === ch.def.hp && ch.ck.mode === 'stun' && sv(e).marked === 1, '⑥ 打他：打不死、只顿一下（stun），然后盯上你')
}

console.log('— 盯上之后：靠近 → 敲桌 → 背对 / 看出口 → 抡锅 —')
{
  const e = fresh(); const ch = inDining(e); const s = site(e)
  // 你站在一张桌子南边 1.0 m、面朝他
  const tb = s.tables.find((t: any) => t.y > s.sy + 4)!
  const pt = W(e, { x: tb.x + 0.5, y: tb.y + 0.5 + 1.25 }); at(e, pt.x, pt.y)
  C.chefMark(e, 'stare')
  const san0 = e.player.sanity
  let tapped = false
  run(e, 120, 0.05, () => { lookAt(e, ch.x, ch.y); if (ch.ck.mode === 'tap' && ch.ck.taps >= 3) { tapped = true; return true } return false })
  ok(tapped, '他慢慢走过来，绕到桌子对面敲桌（tapTable）')
  const tw = W(e, { x: tb.x, y: tb.y })
  ok(Math.abs(ch.y - (tw.y + 0.5 - 1.07)) < 0.05 && Math.abs(ch.facing - Math.PI / 2) < 0.05, `敲桌站位：桌子北沿外 0.42 m、面朝桌子（他在你对面）`, { ch: [ch.x, ch.y, ch.facing], tw })
  ok(e.player.sanity <= san0 - 3 * CK.tapSan + 0.01 && sv(e).n.tap >= 3, `敲三下：理智 −${3 * CK.tapSan}`)
  // 你背过身去 → 冲上来抡锅（第二次：跑开躲掉）
  lookAt(e, e.player.x, e.player.y + 5)
  stepAll(e)
  ok(ch.ck.mode === 'lunge', '你背对他的那一刻：冲上来（lunge）')
  run(e, 1.2, 0.05, () => ch.ck.mode === 'swing')
  ok(ch.ck.mode === 'swing' && ch.ck.clip === 'potSwing', 'potSwing 抡锅')
  // 躲：出手前跑出 1.9 m
  const ang = Math.atan2(e.player.y - ch.y, e.player.x - ch.x)
  let dodged = false
  run(e, 2.5, 0.05, () => { if (ch.ck.modeT > 0.9 && !dodged) { const nx = ch.x + Math.cos(ang) * 2.8, ny = ch.y + Math.sin(ang) * 2.8; if (floorOk(e, nx, ny)) { at(e, nx, ny); dodged = true } } return !!C.chefDebug(e).drag || ch.ck.mode !== 'swing' })
  ok(dodged && !C.chefDebug(e).drag && !C.chefDebug(e).cuff, '蓄力慢：出手前跑出 1.9 m 就躲开了')
}
{
  // 看向出口也算；这次站着挨
  const e = fresh(); const ch = inDining(e); const s = site(e)
  const fd = W(e, { x: s.front.x + 1, y: s.front.y + 0.5 })
  at(e, fd.x, fd.y - 3.2); C.chefMark(e, 'stare')
  ch.x = e.player.x; ch.y = e.player.y - 2.2; ch.facing = Math.PI / 2
  lookAt(e, ch.x, ch.y); stepAll(e)
  ok(ch.ck.mode === 'stalk', '面对着他：他只是站着、等')
  lookAt(e, fd.x, fd.y)
  ok(C.awayCheck(e, ch, Math.hypot(ch.x - e.player.x, ch.y - e.player.y)), '你看向正门（出口）→ 也算转身')
  stepAll(e)
  let hit = false
  run(e, 3, 0.05, () => { lookAt(e, fd.x, fd.y); if (C.chefDebug(e).drag) { hit = true; return true } return false })
  const hp = e.player.hp
  ok(hit && hp <= 100 - CK.swingDmg + 0.01 && C.chefDebug(e).ko > 0, `被砸中：−${CK.swingDmg} 血、黑屏`)
  ok(ch.ck.mode === 'drag' && ch.ck.clip === 'grabDrag' && C.chefControlsPlayer(e), '黑屏 → grabDrag 拖走（玩家被接管）')
  run(e, CK.koT + CK.dragShow + 0.3)
  const cu = W(e, s.at.cuff)
  ok(!!C.chefDebug(e).cuff && Math.hypot(e.player.x - cu.x, e.player.y - cu.y) < 0.05 && C.chefZone(e) === 'cold', '醒在冷库：铐在东墙的铁管上')
  const cd = C.chefColdDoor(e)
  ok(cd.solid && !cd.data.open && ch.ck.mode === 'cook', '冷库门关上；他回到灶前哼小调')
  ok(sv(e).stains.length >= 1, '餐厅地毯上留下一摊血迹')
}

console.log('— 冷库：限时脱身 —')
const toCold = (e: any) => { const ch = inDining(e); C.capture(e, ch, 'pot'); run(e, CK.koT + CK.dragShow + 0.3); return ch }
{
  // 方法一：万能钥匙（按住 X）
  const e = fresh(); toCold(e)
  e.player.equip.pockets[0] = { type: 'skeleton', count: 1 }
  ok(C.chefAct(e)?.act === 'unlock' && specialAction(e)?.hold === true, '有万能钥匙 / 撬棍：X = 按住开铐')
  e.specialHeld = true
  run(e, CK.keyHold + 0.2)
  e.specialHeld = false
  ok(!C.chefDebug(e).cuff && sv(e).n.escKey === 1, `万能钥匙：按住 ${CK.keyHold} s 打开手铐`)
  const cd = C.chefColdDoor(e)
  ok(!cd.data.locked, '冷库门没从外面锁：能自己推开')
}
{
  const e = fresh(); toCold(e)
  e.addItem('crowbar'); e.specialHeld = true; run(e, CK.keyHold + 0.2); e.specialHeld = false
  ok(!C.chefDebug(e).cuff && sv(e).n.escKey === 1, '撬棍：同样按住撬开（很响）')
}
{
  // 方法二：连按扯管子（QTE），每 25% 他提前回来
  const e = fresh(); toCold(e)
  ok(C.chefAct(e)?.act === 'yank', '没工具：X = 扯铁管（连按）')
  let k = 0
  run(e, 4, 0.05, () => { if (++k % 40 === 0) C.chefYank(e, 1); return false })
  ok(!!C.chefDebug(e).cuff && C.chefDebug(e).cuff!.yank < CK.yankNeed, '慢慢按：会回落，扯不下来')
  const early0 = C.chefDebug(e).cuff!.early
  for (let i = 0; i < 20 && C.chefDebug(e).cuff; i++) { C.chefYank(e, 1); stepAll(e, 0.05) }
  ok(!C.chefDebug(e).cuff && sv(e).n.escYank === 1, '快速连按：铁管卡箍崩开，脱身')
  ok(early0 === 0 && msgs.some((t) => t.includes('自由')), '扯管子脱身')
}
{
  const e = fresh(); toCold(e)
  for (let i = 0; i < 9; i++) C.chefYank(e, 1)
  ok(C.chefDebug(e).cuff!.early >= CK.yankEarly * 2 - 0.01, `扯管子很响：每过 25% 他提前 ${CK.yankEarly} s 回来`, C.chefDebug(e).cuff!.early)
}
{
  // 超时：取刀 → 进门 → 黑屏关门 = 死亡；体温
  const e = fresh(); const ch = toCold(e)
  const t0 = C.chefDebug(e).cuff!.temp
  run(e, 20)
  ok(C.chefDebug(e).cuff!.temp < t0 - 15, `体温持续下降（${C.chefDebug(e).cuff!.temp.toFixed(0)}%）`)
  run(e, CK.coldLimit - 20 + 0.2)
  ok(C.chefDebug(e).cuff!.phase === 'knife' && ch.ck.clip === 'takeKnife' && msgs.length >= 0, '时限到：门外他从刀墙上取下雕刻刀（takeKnife）')
  ok(C.chefHud(e)!.subs.some((s) => s.text.includes('刀')), '字幕：刀从磁条上取下的声音')
  run(e, 6.6)
  ok(ch.ck.knife === true && C.chefDebug(e).cuff!.phase === 'enter', '冷库门开了：他拿着刀进来')
  run(e, 8, 0.05, () => deaths.length > 0)
  ok(deaths.length === 1 && /炖菜/.test(deaths[0]) && C.chefDebug(e).ko > 0 && sv(e).victims === 1, '走到你面前：黑屏、门关上——死亡（不演吃人）', deaths)
  deaths.length = 0
}

console.log('— 夜晚循环：打烊闩门 —')
{
  const e = fresh(); const ch = inDining(e); const s = site(e)
  // 躲在餐厅西南角（离他的路线远）、面朝墙
  const corner = W(e, { x: s.hall.x0 + 1.5, y: s.hall.y1 - 6.5 }); at(e, corner.x, corner.y); lookAt(e, corner.x - 3, corner.y)
  e.hotelShift = { ...e.hotelShift, phase: 'shift', tLeft: 45 }
  stepAll(e)
  ok(C.chefClosed(e) && sv(e).nights === 1, '音乐一停（换班）：打烊')
  ok(ch.ck.mode === 'walk' && ch.ck.then === 'barricade', '他走向正门')
  const tb = s.tables[0]
  ok(!C.plateReady(e, tb.x, tb.y), '打烊后不上菜')
  run(e, 120, 0.05, () => !!C.chefDebug(e).barred)
  const bp = W(e, s.at.barricade)
  ok(C.chefDebug(e).barred && Math.hypot(ch.x - bp.x, ch.y - bp.y) < 0.05 && ch.ck.clip === 'barricade', '在正门里面 barricade：绳绑把手、推上门闩')
  const fr = e.map.structures.find((q: any) => q.kind === 'chefprop' && q.data?.prop === 'front' && q.x === W(e, s.front).x)
  const side = e.map.structures.filter((q: any) => q.kind === 'hoteldoor' && q.data?.chefLock)
  ok(fr.solid && fr.data.bar === 1 && side.length >= 4 && side.every((d: any) => d.data.locked && d.solid), `正门实心 + 餐厅 ${side.length} 扇侧门全部上锁`)
  // 撬开一扇侧门：不会被重新锁上
  const d0 = side[0]; d0.data = { ...d0.data, locked: 0, open: 1 }; d0.solid = false
  run(e, 1)
  ok(!d0.data.locked, '撬开 / 劈开的侧门不会被重新锁上')
  run(e, CK.closeExtra * 0)
  // 打烊后：餐厅里被他看见（8 m 内）= 盯上
  run(e, 10)
  ok(ch.ck.mode === 'patrol' || ch.ck.mode === 'walk' || ch.ck.mode === 'lean' || ch.ck.mode === 'sniff' || ch.ck.mode === 'cook', '闩完门回后场巡（stoveLean / 嗅 / 刀墙）', ch.ck.mode)
  const pk = W(e, { x: s.bcx - 2, y: s.hall.y0 + 5 }); at(e, pk.x, pk.y); lookAt(e, pk.x, pk.y + 5); run(e, CK.nightSniff + 0.2)
  ok(sv(e).marked === 1 && C.chefZone(e) === 'kitchen', `打烊后进后场：看不见也闻得到（${CK.nightSniff} s）→ 被盯上`)
  // 营业
  e.hotelShift = { ...e.hotelShift, phase: 'play', tLeft: 400 }; stepAll(e)
  ok(C.chefClosed(e), `恢复营业后还有 ${CK.closeExtra} s 才开门`)
  run(e, CK.closeExtra + 0.5)
  ok(!C.chefClosed(e) && !fr.solid && !fr.data.bar && e.map.structures.filter((q: any) => q.kind === 'hoteldoor' && q.data?.chefLock).length === 0, '开门：绳子解开、侧门开锁')
}
{
  // vomitPot：只在你远远地、在他身后时演
  const e = fresh(); const ch = inDining(e); const s = site(e)
  const back = W(e, { x: s.bcx + 1, y: s.sy + 6 }); at(e, back.x, back.y); lookAt(e, back.x + 5, back.y)
  C.chefDebug(e).vomitT = 0; stepAll(e)
  ok(ch.ck.mode === 'vomit' && ch.ck.clip === 'vomitPot', `你在 ${CK.vomitMinD} m 外、在他背后：他对着大锅吐（远景背身）`)
  const e2 = fresh(); const ch2 = inDining(e2); const s2 = site(e2)
  const fr2 = W(e2, { x: s2.bcx + 1, y: s2.hall.y0 + 3.5 }); ch2.x = fr2.x; ch2.y = fr2.y + 0; at(e2, W(e2, s2.at.stove).x - 1.5, W(e2, s2.at.stove).y - 0.4)
  C.chefDebug(e2).vomitT = 0; C.updateChef(e2, ch2, 0.05)
  ok(ch2.ck.mode !== 'vomit', '你在他面前 / 太近：不演')
}

console.log('— 铃声引开 · 偷锅 · 关灶 —')
{
  const e = fresh(); const ch = inDining(e); const s = site(e)
  const bs = W(e, s.at.bellAt); at(e, bs.x + 0.6, bs.y - 0.6)
  C.chefRingBell(e)
  ok(ch.ck.mode === 'twitch' && ch.ck.clip === 'earTwitch', '在餐厅另一头摇铃：earTwitch 耳朵抽搐、转头')
  run(e, 4)
  ok(ch.ck.mode === 'walk' && ch.ck.then === 'bell', '他走出后厨去应铃')
  // 等他走出弹簧门进了餐厅，你溜进厨房
  run(e, 60, 0.05, () => C.chefZone(e, ch.x, ch.y) === 'dining' && ch.y - W(e, { x: 0, y: s.sy }).y > 4)
  const pk = W(e, { x: s.bcx + 2, y: s.hall.y0 + 2 }); at(e, pk.x, pk.y); lookAt(e, pk.x, pk.y - 1)
  run(e, 1)
  ok(!sv(e).marked && C.chefZone(e) === 'kitchen' && C.chefZone(e, ch.x, ch.y) !== 'kitchen', '厨房空了：进厨房不被发现')
  const hk = W(e, s.at.hook); at(e, hk.x, hk.y + 0.9)
  ok(C.chefAct(e)?.act === 'steal', '灶东侧挂钩：X = 偷走带把手的锅')
  C.chefStealPot(e)
  ok(has(e, 'chefpot') && sv(e).potStolen === 1 && !C.chefCooking(e), '锅到手：后厨停产（不上菜）')
  ok(!C.plateReady(e, s.tables[0].x, s.tables[0].y), '餐桌上不再有菜')
  // 他回来看见你 → 暴怒，只抓不砸
  C.chefMark(e, 'kitchen')
  ok(ch.ck.mode === 'rage', '他发现锅不见了：暴怒赤手追')
  ch.x = e.player.x + 0.8; ch.y = e.player.y
  run(e, 1, 0.05, () => ch.ck.mode === 'grab' || !!C.chefDebug(e).drag)
  ok(ch.ck.mode === 'grab' || !!C.chefDebug(e).drag, '没有锅：不抡锅，伸手抓（grabDrag）')
  run(e, 1, 0.05, () => !!C.chefDebug(e).drag)
  ok(!!C.chefDebug(e).drag && !has(e, 'chefpot') && sv(e).potStolen === 0, '被他抓住：锅被拿回去')
  ok(e.player.hp === 100, '赤手抓：不砸你（不掉血）')
}
{
  // 锅丢在餐厅里：他捡回来
  const e = fresh(); const ch = inDining(e); const s = site(e)
  sv(e).potStolen = 1; ch.ck.pot = false
  const dp = W(e, { x: s.bcx + 4.5, y: s.sy + 3.5 })
  e.map.items.push({ id: 99, type: 'chefpot', count: 1, x: dp.x, y: dp.y, dropped: 0 })
  at(e, W(e, s.at.bellAt).x + 1, W(e, s.at.bellAt).y - 1); lookAt(e, e.player.x, e.player.y + 3)
  run(e, 90, 0.05, () => sv(e).potStolen === 0)
  ok(sv(e).potStolen === 0 && !e.map.items.some((it: any) => it.type === 'chefpot'), '锅丢在餐厅里：他走过去蹲下捡回来，恢复供餐')
}
{
  const e = fresh(); const ch = inDining(e); const s = site(e)
  ch.ck.mode = 'bell'; ch.x = W(e, s.at.bellStand).x; ch.y = W(e, s.at.bellStand).y
  const sp = W(e, { x: s.stove.x + 1, y: s.stove.y + 1.3 }); at(e, sp.x, sp.y)
  sv(e).potStolen = 1 // 只测关灶（锅不在钩子上）
  ok(C.chefAct(e)?.act === 'stove', '灶前：X = 关掉燃气灶'); sv(e).potStolen = 0
  C.chefStoveOff(e, false)
  ok(sv(e).stoveT === CK.stoveOffT && !C.chefCooking(e), `关灶：停产 ${CK.stoveOffT} s`)
  ok(ch.ck.mode === 'walk' && ch.ck.then === 'guard', '他赶回来守着灶')
  at(e, W(e, s.at.bellAt).x + 1, W(e, s.at.bellAt).y - 1)
  run(e, 60, 0.05, () => ch.ck.mode === 'guard')
  ok(ch.ck.mode === 'guard' && ch.ck.clip === 'stoveLean', '守灶（stoveLean），哪儿也不去')
  run(e, 20); ok(ch.ck.mode === 'guard', '你在餐厅里：他不出来')
  // 靠近守着的灶 → 动手
  const near = W(e, { x: s.at.stove.x, y: s.at.stove.y + 1.6 }); at(e, near.x, near.y); lookAt(e, ch.x, ch.y); stepAll(e)
  ok(ch.ck.mode === 'lunge' || ch.ck.mode === 'swing', `走进 ${CK.guardR} m：他冲上来`)
  sv(e).stoveT = 0.1; run(e, 0.3)
  ok(C.chefCooking(e), '计时结束：灶又点着了')
  // 砸灶
  const e2 = fresh(); inDining(e2); const s2 = site(e2)
  e2.player.hotbar[0] = { type: 'crowbar', count: 1 }; e2.player.selected = 0
  const sp2 = W(e2, { x: s2.stove.x + 1, y: s2.stove.y + 1.3 }); at(e2, sp2.x, sp2.y)
  ok(C.chefAct(e2)?.act === 'break', '拿着撬棍：X = 砸坏燃气灶')
  C.chefStoveOff(e2, true)
  ok(sv(e2).stoveBroken === 1 && sv(e2).stoveT === CK.stoveBrokenT, `砸坏：停产 ${CK.stoveBrokenT} s`)
}

console.log('— 食物：上瘾与真相 —')
{
  const e = fresh(); const ch = inDining(e); const s = site(e)
  const tb = s.tables.find((t: any) => t.y > s.sy + 4)!, tw = W(e, tb)
  at(e, tw.x + 0.5, tw.y + 0.5 + 1.2); lookAt(e, tw.x + 0.5, tw.y + 0.5)
  e.player.sanity = 60
  const a = C.chefAct(e) as any
  ok(a?.act === 'eat' && specialAction(e)?.id === 'chef-eat', `营业中：X = 吃一份${CK.food[a?.dish ?? 0].name}`)
  ok(specialAction(e)?.hint === CK.food[a.dish].look, '提示：菜看起来很香（不知道真相时）')
  const h0 = e.player.hunger, hp0 = e.player.hp = 70
  C.chefStartEat(e, a.table)
  ok(C.chefHud(e)!.warm === 1, '吃的时候：屏幕边缘变暖')
  // 吃的时候盯他也不涨
  const st0 = C.chefDebug(e).stare
  run(e, CK.eatT + 0.1, 0.05, () => { lookAt(e, ch.x, ch.y); return false })
  ok(C.chefDebug(e).stare <= st0 + 1e-6, '吃的时候：注意不到他（盯他的进度不涨）')
  ok(e.player.hunger >= h0 + CK.food[a.dish].hunger - 0.5 && e.player.hp > hp0, `吃完：饱食 +${CK.food[a.dish].hunger}、回血 +${CK.food[a.dish].hp}`)
  ok(sv(e).addictT >= CK.addictT - 1 && C.chefHungerMul(e) === 1 + CK.addictK, `上瘾：${CK.addictT} s 内饥饿 ×${1 + CK.addictK}`)
  ok(!C.plateReady(e, tb.x, tb.y), '这一桌的盘子空了')
  run(e, CK.refill + 1)
  ok(C.plateReady(e, tb.x, tb.y), `${CK.refill} s 后又端上一份`)
  // 离开餐厅后冒出念头
  const out = W(e, { x: s.front.x + 1, y: s.front.y + 8 }); at(e, out.x, out.y); C.chefDebug(e).thoughtT = 0.01
  run(e, 0.2)
  ok(C.chefHud(e)?.subs.some((x) => x.kind === 'thought' && C.CRAVE.includes(x.text)) ?? false, 'HUD 偶尔冒出「再来一份」的念头')
  // 真相：理智高时先端详
  at(e, tw.x + 0.5, tw.y + 0.5 + 1.2); e.player.sanity = 90
  const b = C.chefAct(e) as any
  ok(b?.act === 'inspect', `理智 ≥ ${CK.truthSan}：X 先是「端详这盘菜」`)
  C.chefPress(Object.assign(e, { specialPressed: true }))
  ok(sv(e).truth === 1 && C.chefHud(e)!.subs.some((x) => x.text === CK.food[b.dish].truth), '看清了：菜的描述变成真相')
  ok(specialAction(e)?.hint === CK.food[b.dish].truth, '之后的提示都是真相')
  const san = e.player.sanity
  C.chefStartEat(e, b.table); run(e, CK.eatT + 0.1)
  ok(e.player.sanity <= san - CK.truthSanHit + 0.01, `知道真相还吃：理智 −${CK.truthSanHit}`)
  C.chefDebug(e).thoughtT = 0.01; at(e, out.x, out.y); run(e, 0.2)
  ok(C.chefHud(e)?.subs.some((x) => C.CRAVE_TRUE.includes(x.text)) ?? false, '念头也变了（你知道那是什么）')
  ok(S.FOOD_TRUTH.includes('别吃') && S.FOOD_TRUTH.includes('厨师'), '与迎宾女郎心声「食物真相」一致')
}

console.log('— 档案员物品 —')
for (const t of ['megform', 'megmic', 'chefphoto'] as const) {
  const e = fresh(); e.addItem(t)
  ok(C.chefUseItem(e, t) && sv(e).truth === 1 && sv(e).relics.includes(t), `读「${(ITEMS as any)[t].name}」→ 知道食物真相（不消耗）`)
}

console.log('— 联动：兔子 / 野兽 / 管家 / 血 —')
{
  const e = fresh(); inDining(e); const s = site(e)
  at(e, W(e, { x: s.front.x + 1, y: s.front.y + 6 }).x, W(e, { x: s.front.x + 1, y: s.front.y + 6 }).y)
  const dp = C.chefDiningSpot(e)!
  const dw = { x: dp.x + ox(e), y: dp.y + oy(e) }
  ok(!!dp && L.inDining(s, dw.x, dw.y) && !L.inService(s, dw.x, dw.y), '发条兔「带进餐厅」的终点：他餐厅正门里面的地毯上（不会进后场）')
  let rb: any = null
  for (let a = 0; a < Math.PI * 2 && !rb; a += 0.4) { lookAt(e, e.player.x + Math.cos(a), e.player.y + Math.sin(a)); rb = S.spawnRabbitAhead(e, false, true) }
  ok(!!rb && S.planRoute(e, rb, 'dining') && Math.hypot(rb.wu.destP.x - dw.x, rb.wu.destP.y - dw.y) < 1.2, '兔子路线终点 = 他的餐厅')
  if (rb) { S.rabbitArrive(e, rb, rb.wu); ok(sv(e).marked === 1 && sv(e).n.rabbit === 1 && C.chefHud(e)!.subs.some((x) => x.text.includes('弹簧门')), '兔子把你带到：他看见你了（盯上）') }
}
{
  const e = fresh(); inDining(e)
  const p0 = CK.beastHandoffP; (CK as any).beastHandoffP = 1
  ok(C.chefBeastHandoff(e) && sv(e).n.beast === 1, '关注度满、野兽熄灯缠抓：把「送来的人」交给厨师')
  run(e, CK.koT + 1)
  ok(!!C.chefDebug(e).cuff && C.chefZone(e) === 'cold', '醒在冷库，铐着')
  ;(CK as any).beastHandoffP = 0
  const e2 = fresh(); inDining(e2)
  ok(!C.chefBeastHandoff(e2), '概率没中：照旧拖去野兽办公室')
  ;(CK as any).beastHandoffP = p0
  const e3 = fresh(); ok(!C.chefBeastHandoff(e3), '不在餐厅附近（他没出现）：不交接')
}
{
  // 管家擦血
  const e = fresh(); inDining(e); const s = site(e)
  const sp = W(e, { x: s.bcx + 4.5, y: s.sy + 6.5 })
  at(e, sp.x, sp.y); C.addStain(e, sp.x, sp.y)
  at(e, sp.x + 3, sp.y + 3)
  const md = MD.spawnMaid(e, { x: sp.x - 4, y: sp.y })
  ok(!!md && !!C.chefStainFor(e, md), '管家巡到餐厅：看见地毯上的血迹')
  run(e, 25, 0.05, () => sv(e).stains.length === 0)
  ok(sv(e).stains.length === 0 && sv(e).n.wiped === 1, '她跪下来擦掉了血迹')
  // 没人擦：过一阵自己没了
  C.addStain(e, sp.x, sp.y); sv(e).stains[0].t = 0.05; C.stepChefGlobal(e, 0.1)
  ok(sv(e).stains.length === 0, `没人擦的血迹 ${CK.stainLife} s 后不见`)
}
{
  const e = fresh(); const b0 = C.chefBloodLevel(e)
  sv(e).victims = 2; sv(e).nights = 3
  ok(C.chefBloodLevel(e) > b0 + 0.25 && C.chefBloodLevel(e) <= 1, `血量随受害者 / 夜晚加深：${b0.toFixed(2)} → ${C.chefBloodLevel(e).toFixed(2)}`)
}

console.log('— 存档往返 —')
{
  const e = fresh(); inDining(e)
  Object.assign(sv(e), { marked: 1, markT: 100, eat: 3, addictT: 400, truth: 1, potStolen: 1, stoveT: 50, stoveBroken: 1, nights: 2, victims: 1, relics: ['megform'] })
  C.addStain(e, e.player.x, e.player.y); sv(e).n.meal = 3; sv(e).n.caught = 2
  const snap: any = snapshot(e)
  const back = H.restoreHotel(JSON.parse(JSON.stringify(snap.hotel)))
  const canon = (o: any) => JSON.parse(JSON.stringify(o))
  ok(JSON.stringify(canon(back.chef)) === JSON.stringify(canon(sv(e))), '存档往返：盯上 / 上瘾 / 真相 / 锅 / 灶 / 夜晚 / 受害者 / 血迹 / 统计一致')
  const bad = H.restoreHotel({ chef: { addictT: 99999, n: { tap: -3 }, stains: [{ x: 'a' }, { x: 1, y: 2 }] } } as any)
  ok(bad.chef!.addictT === CK.addictMax && bad.chef!.n.tap === 0 && bad.chef!.stains.length === 1, '坏存档：钳到合法范围')
  ok(C.chefHungerMul({ hotel: H.freshHotel() } as any) === 1, '没有存档字段：饥饿倍率 1')
}

console.log('— 渲染 —')
{
  const R = await import('../src/game/renderer/chefRender')
  const MM = await import('../src/game/renderer/chefMesh')
  const THREE = await import('three')
  const grp = R.buildChefEntityMesh()
  ok(!!grp.userData.lod2 && !grp.userData.lod1 && !grp.userData.lod0, '实体网格：先只建 LOD2')
  const ent: any = { id: 1, x: 0, y: 0, z: 0, facing: 0, def: ENTITIES.chef, ck: C.ensureChef({} as any) }
  ent.ck.clip = 'idle'; ent.ck.seq = 1; ent.ck.vis = 0
  R.animateChefEntity(grp, ent, 1 / 30, 15)
  ok(!!grp.userData.lod1 && grp.userData.lod1.visible && !grp.userData.lod0, '< 22 m 建 LOD1；15 m 用 LOD1')
  R.animateChefEntity(grp, ent, 1 / 30, 4)
  ok(!!grp.userData.lod0 && grp.userData.lod0.visible, '< 11 m 建 LOD0；4 m 用 LOD0')
  R.animateChefEntity(grp, ent, 1 / 30, 30)
  ok(grp.userData.lod2.visible && !grp.userData.lod0.visible, '> 18.5 m 回 LOD2')
  for (let i = 0; i < 60; i++) R.animateChefEntity(grp, ent, 1 / 30, 4)
  ok(MM.CHEF_UNI.uFade.value > 0.95, `融进环境：清晰度 0 → uFade ${MM.CHEF_UNI.uFade.value.toFixed(2)}`)
  let shadow = false; grp.userData.lod0.traverse((o: any) => { if (o.isMesh && o.castShadow) shadow = true })
  ok(!shadow, '融进环境时不投影')
  {
    // 每实例溶解：图鉴模型画之前 uFade = 0，游戏里的厨师画之前写回他自己的值
    const arc = R.buildChefEntityMesh(0)
    let ab: any = null, gb: any = null
    arc.traverse((o: any) => { if (!ab && o.isSkinnedMesh) ab = o }); grp.userData.lod0.traverse((o: any) => { if (!gb && o.isSkinnedMesh) gb = o })
    ab.onBeforeRender(); const fa = MM.CHEF_UNI.uFade.value
    gb.onBeforeRender(); const fg = MM.CHEF_UNI.uFade.value
    ok(fa === 0 && fg > 0.95, `溶解按实例：图鉴模型 uFade ${fa}、游戏实例 ${fg.toFixed(2)}`)
    // 溶解补丁装到 Lambert / Basic 上：展开 #include 后 vViewPosition 只声明一次（Basic 用无掠射角版）
    const exp = (src: string, d = 0): string => d > 6 ? src : src.replace(/#include <(\w+)>/g, (_: string, n: string) => exp((THREE.ShaderChunk as any)[n] ?? '', d + 1))
    for (const [k, mat] of [['lambert', new THREE.MeshLambertMaterial()], ['standard', new THREE.MeshStandardMaterial()], ['basic', new THREE.MeshBasicMaterial()]] as const) {
      MM.chefFadePatch(mat as any)
      const L = (THREE.ShaderLib as any)[k], sh: any = { uniforms: {}, vertexShader: L.vertexShader, fragmentShader: L.fragmentShader }
      ;(mat as any).onBeforeCompile(sh, null)
      const f = exp(sh.fragmentShader), decl = (f.match(/varying vec3 vViewPosition;/g) ?? []).length
      ok(f.includes('discard') && decl === (k === 'basic' ? 0 : 1), `溶解补丁 ${k}：vViewPosition 声明 ${decl} 次`)
    }
  }
  ent.ck.vis = 1; ent.ck.clip = 'tapTable'; ent.ck.seq = 2; ent.ck.modeT = 1.4
  for (let i = 0; i < 40; i++) R.animateChefEntity(grp, ent, 1 / 30, 4)
  ok(MM.CHEF_UNI.uFade.value < 0.05, '被看见：变清楚（uFade → 0）')
  // 身体 / 道具材质都装了溶解补丁
  let patched = 0, total = 0
  grp.userData.lod0.traverse((o: any) => { if (o.isMesh && o.visible !== undefined) { total++; const ms = Array.isArray(o.material) ? o.material : [o.material]; if (ms.every((m: any) => m.__chefFade)) patched++ } })
  ok(patched === total, `溶解补丁：${patched}/${total} 个网格`)
  ent.ck.clip = 'grabDrag'; ent.ck.seq = 3; R.animateChefEntity(grp, ent, 1 / 30, 4)
  let vic: any = null; grp.traverse((o: any) => { if (o.name === 'chefVictim') vic = o })
  ok(!vic || !vic.visible, '游戏里不显示被拖的灰色假人（被拖的是你）')
  ent.ck.clip = 'waddle'; ent.ck.seq = 4; ent.ck.knife = true
  R.animateChefEntity(grp, ent, 1 / 30, 4)
  ok(grp.userData.rig0.props.knife.visible, '进冷库：手里拿着那把雕刻刀')
  R.animateChefEntity(grp, ent, 1 / 30, 4, 0.9)
  ok(Math.abs(MM.CHEF_UNI.uBlood.value - 0.9) < 1e-6, 'setChefBlood 跟血量')
  // 场景件
  const bx = (o: any, name: string) => { o.updateMatrixWorld(true); const b = new THREE.Box3(); o.traverse((x: any) => { if (x.name === name) b.expandByObject(x) }); return b }
  const stv = R.buildChefProp({ kind: 'chefprop', x: 10, y: 4, w: 2, h: 1, solid: true, data: { prop: 'stove' } } as any)!
  const top = bx(stv, 'stoveTop'), body = bx(stv, 'stoveBody')
  ok(Math.abs(top.max.y - AN.CHEF_STOVE.y) < 0.005 && Math.abs(body.max.z - 5.0) < 0.005, `燃气灶模型：台面 ${top.max.y.toFixed(3)}、前沿 z ${body.max.z.toFixed(3)}（= 结构南沿）`)
  ok(!!stv.getObjectByName('hookPot') && !!stv.getObjectByName('flames') && !!stv.getObjectByName('chefStewPot'), '灶：火苗 / 炖锅 / 钩子上的锅')
  const tbl = R.buildChefProp({ kind: 'chefprop', x: 6, y: 9, w: 1, h: 1, solid: true, data: { prop: 'table', diners: 2, dish: 0 } } as any)!
  const tbb = new THREE.Box3().setFromObject(tbl)
  ok(Math.abs(tbb.max.y - (AN.CHEF_TABLE.y + 0.19)) < 0.05 || tbb.max.y > AN.CHEF_TABLE.y, '餐桌模型：含桌椅 + 顾客（合批一张网格）')
  const kn = R.buildChefProp({ kind: 'chefprop', x: 3, y: 2, w: 1, h: 1, solid: false, data: { prop: 'knives' } } as any)!
  const slot = kn.getObjectByName('slotKnife')!; kn.updateMatrixWorld(true)
  const wp = new THREE.Vector3().setFromMatrixPosition(slot.matrixWorld)
  ok(Math.abs(wp.x - 3.5) < 1e-6 && Math.abs(wp.y - AN.CHEF_WALL_KNIFE_GRIP[1]) < 1e-6 && Math.abs(wp.z - (2 + 0.54 - AN.CHEF_WALL_KNIFE_GRIP[2])) < 1e-6, '刀墙：那把刀 = CHEF_WALL_KNIFE_GRIP（站位 +0.12、高 1.63、离墙 1.5 cm）')
  const fr = R.buildChefProp({ kind: 'chefprop', x: 20, y: 30, w: 2, h: 1, solid: false, data: { prop: 'front' } } as any)!
  const hb = bx(fr, 'handle')
  ok(Math.abs((hb.min.y + hb.max.y) / 2 - AN.CHEF_DOOR.handleY) < 0.01 && Math.abs(hb.min.z - (30 - (AN.CHEF_DOOR.z - AN.CHEF_DOOR.handleZ))) < 0.02, '正门：把手高 1.00、伸出门面 0.07（= CHEF_DOOR）')
  for (const p of ['counter', 'island', 'sink', 'shelf', 'sacks', 'coldshelf', 'carcass', 'pipe', 'swing', 'bell', 'tabledyn']) ok(!!R.buildChefProp({ kind: 'chefprop', x: 1, y: 1, w: 2, h: 2, solid: true, data: { prop: p, diners: 2, axis: 'x' } } as any), `场景件 ${p}`)
  const IM = await import('../src/game/renderer/chefItemModels')
  for (const t of IM.CHEF_ITEM_TYPES) {
    const m = IM.buildChefItemMesh(t); m.updateMatrixWorld(true)
    let tris = 0, tex = 0; m.traverse((o: any) => { if (o.isMesh) { tris += (o.geometry.index ? o.geometry.index.count : o.geometry.getAttribute('position').count) / 3; if (o.material.map) tex++ } })
    const sz = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3())
    ok(tris > 0 && tex > 0 && Math.max(sz.x, sz.y, sz.z) < 1.2, `物品模型 ${t}：${tris | 0} 面、${tex} 张贴图、${sz.toArray().map((v: number) => v.toFixed(2))}`)
  }
}

console.log(`\n${n - fails}/${n} 通过`)
if (fails) process.exit(1)
