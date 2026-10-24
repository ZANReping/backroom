/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// 售货机重制 阶段 3（普通售货机 + Entity 36）——机制无头验收（真实 Engine + 手搭空房间）。运行：npm run check:vending
import { createCanvas } from '@napi-rs/canvas'
import { makeEntity, type Entity } from '../src/game/entities'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256) },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const { audio } = await import('../src/game/core/audio')
const { ENTITIES } = await import('../src/game/entities')
const V = await import('../src/game/engine/vendingAI')
const L = await import('../src/game/content/vendingLayout')
const { VENDING_CLIPS } = await import('../src/game/renderer/vendingAnim')
const { VM } = V
let cries = 0, whispers = 0
;(audio as any).facelingCry = () => { cries++ }
;(audio as any).whisper = () => { whispers++ }

let fails = 0, n = 0
const ok = (c: unknown, m: string) => { n++; console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
const DT = 1 / 30
const withRandom = <T>(v: number, f: () => T) => { const r = Math.random; Math.random = () => v; try { return f() } finally { Math.random = r } }

function world() {
  const eng: any = new Engine(), S = 48, N = S * S, zero = () => new Uint8Array(N)
  eng.player.level = 2
  eng.map = { w: S, h: S, tiles: zero().fill(1), structures: [], items: [], lights: [], exits: [], entities: [] as Entity[], spawn: { x: 20, y: 20 },
    wet: zero(), elev: zero(), outdoor: zero(), step: zero(), crawl: zero(), ceiling: zero(), up: zero(), upWall: zero(), up2: zero(), upWall2: zero(), stair: new Int32Array(N),
    liquid: zero(), seaFloor: new Float32Array(N).fill(1.7), floors: 1, dn: zero(), dnWall: zero(), tint: zero() }
  const m = eng.map
  for (let i = 0; i < S; i++) { m.tiles[i] = 0; m.tiles[(S - 1) * S + i] = 0; m.tiles[i * S] = 0; m.tiles[i * S + S - 1] = 0 }
  eng.explored = new Uint8Array(N).fill(1)
  const p = eng.player
  Object.assign(p, { level: 2, x: 20.5, y: 20.5, z: 0, floor: 0, hp: 100, sanity: 80, facing: 0, flashlight: false, battery: 100, stamina: 100 })
  const msgs: string[] = []; const msg0 = eng.msg.bind(eng); eng.msg = (t: string, k?: any) => { msgs.push(t); msg0(t, k) }
  const events: string[] = []; eng.emit = (e: any) => events.push(e.kind); eng.persist = () => {}
  const tick = () => { eng.updateEntities(DT, 1); V.stepVending(eng, DT); eng.time = (eng.time ?? 0) + DT }
  const run = (secs: number, each?: () => void) => { for (let t = 0; t < secs && !eng.over; t += DT) { each?.(); tick() } }
  const until = (test: () => boolean, secs = 20, each?: () => void) => { for (let t = 0; t < secs && !test() && !eng.over; t += DT) { each?.(); tick() } return test() }
  const vending = (x: number, y: number, data: any = { trade: 1 }) => { const s = { kind: 'vending', x, y, w: 1, h: 1, solid: true, data } as any; m.structures.push(s); return s }
  const e36 = (x: number, y: number, facing = Math.PI) => { const e = makeEntity('vendingmachine', x, y); e.facing = facing; e.state = 'idle'; m.entities.push(e); return e }
  const count = (t: string) => eng.countItem(t)
  return { eng, m, p, msgs, events, tick, run, until, vending, e36, count }
}

// ── 布局：渲染 / 引擎 / 界面共用
{
  const a = L.vendingLayout('normal', 123), b = L.vendingLayout('normal', 123)
  ok(JSON.stringify(a) === JSON.stringify(b), '同一种子得出同一品牌 / 商品 / 库存（渲染与界面一致）')
  ok(L.NORMAL_BRANDS.includes(a.brand) && a.products.length === 8 && a.products.every((p) => (L.NORMAL_PRODUCTS as readonly string[]).includes(p)), `普通机：虚构品牌 ${a.brand}，8 格都是五种现成货`)
  ok(a.stock.every((s) => s >= 1 && s <= 3), '普通机每格库存 1–3')
  const e = L.vendingLayout('e36', 9)
  ok(e.brand === 'kindred' && new Set(e.products).size === 8 && e.products.every((p) => (L.E36_PRODUCTS as readonly string[]).includes(p)), 'E36：品牌 KINDRED，8 格是维基十种产品里不重复的 8 种')
  ok(e.stock.every((s) => s === L.VENDING_E36_STOCK), 'E36 每格库存 2')
  const seeds = new Set<string>(); for (let i = 1; i < 40; i++) seeds.add(L.vendingLayout('normal', i).brand)
  ok(seeds.size === 4, '四个普通品牌都会出现')
  ok(Object.keys(VENDING_CLIPS).length === 12 && VM.COIL_T === VENDING_CLIPS.coil.dur && VM.HAND_T === VENDING_CLIPS.hand.dur && VM.JAM_T === VENDING_CLIPS.jam.dur, '机制时长与动画片段时长一致')
}

// ── 普通售货机：界面选格 → 螺旋线出货 → 取货口
{
  const W = world()
  const s = W.vending(21, 20)
  V.openVending(W.eng, { s })
  ok(W.events.includes('vending') && W.eng.vendUi?.s === s, 'E 打开售货界面（emit vending）')
  const st = V.structMachine(W.eng, s)
  const want = st.products[0], before = st.stock[0], have = W.count(want)
  V.vendingPress(W.eng, '3')
  ok(V.vendingView(W.eng)!.display === 'A-B?', '先按数字：数码屏提示先选字母')
  withRandom(0.9, () => { V.vendingPress(W.eng, 'A'); V.vendingPress(W.eng, '1') })
  ok(st.input === 'A1' && st.anim?.clip === 'coil' && st.anim.slot === 0, 'A + 1 → 数码屏显示 A1，A1 格螺旋线出货')
  ok(st.stock[0] === before - 1, '库存 -1')
  ok(V.vendingView(W.eng)!.busy && !st.bin, '出货中：取货口还是空的')
  W.run(VM.BIN_AT_COIL - 0.1)
  ok(!st.bin, '货还在落货通道里')
  W.run(0.2)
  ok(st.bin?.product === want, `${VM.BIN_AT_COIL}s：货落进取货口（${L.PRODUCT_NAME[want]}）`)
  const rs = V.vendStructRender(W.eng, s, 0)!
  ok(rs.clip === 'coil' && rs.slot === 0, '渲染：播放 coil 片段')
  W.run(1)
  const hold = V.vendStructRender(W.eng, s, 0)!
  ok(!st.anim && hold.clip === 'coil' && hold.t === VM.COIL_T, '没拿走之前：停在片段最后一帧（货躺在取货斗里）')
  V.vendingPress(W.eng, 'A'); V.vendingPress(W.eng, '2')
  ok(!st.anim && st.flash === 'TAKE', '取货口有货时不能再出货')
  V.vendingTake(W.eng)
  ok(W.count(want) === have + 1 && !st.bin, '点取货口：拿到现成物品')
  // 卖光
  st.stock[1] = 0
  V.vendingPress(W.eng, 'A'); V.vendingPress(W.eng, '2')
  ok(st.flash === 'SOLD' && !st.anim, '卖光的格子：数码屏 SOLD')
  ok(V.vendingView(W.eng)!.slots[1].stock === 0, '界面同步显示售罄')
  const rs2 = V.vendStructRender(W.eng, s, 0)!
  ok(rs2.stock[1] === 0, '渲染读到库存 0（藏货 + 红灯）')
  // 离开机器 → 界面关闭
  W.p.x = 30
  W.tick()
  ok(W.eng.vendUi === null, '走远：界面自动关闭')
}

// ── 卡货 / 拍打
{
  const W = world()
  const s = W.vending(21, 20)
  V.openVending(W.eng, { s })
  const st = V.structMachine(W.eng, s)
  withRandom(0.1, () => { V.vendingPress(W.eng, 'B'); V.vendingPress(W.eng, '2') })
  ok(st.anim?.clip === 'jam' && st.jamSlot === 5 && st.jammed, '25%：卡货（jam 片段，B2 那件斜挂在格口）')
  ok(s.data.jammed === 1 && s.data.jamSlot === 5, '卡死写进 s.data（随存档）')
  W.run(2)
  ok(!st.bin, '卡住的那件不会掉进取货口')
  ok(V.vendStructRender(W.eng, s, 0)!.clip === 'jam', '渲染：一直停在卡货姿势')
  V.vendingPress(W.eng, 'A'); V.vendingPress(W.eng, '1')
  ok(st.flash === 'Err' && !st.anim, '卡死后再选：Err，拒绝出货')
  withRandom(0.9, () => V.vendingKick(W.eng))
  ok(st.jamSlot === 5, '拍打（运气差）：没掉')
  W.run(VM.KICK_CD + 0.1)
  withRandom(0.1, () => V.vendingKick(W.eng))
  ok(st.anim?.clip === 'coil' && st.anim.t >= 0.8 && st.jamSlot === -1, '拍打（35%）：卡住的那件从格口掉下去')
  W.run(1.2)
  ok(st.bin?.product === st.products[5], '掉进取货口')
  ok(st.jammed && V.vendingView(W.eng)!.jammed, '机器本身仍然罢工')
  // 生成时就卡着的旧机器
  const s2 = W.vending(23, 20, { trade: 1, jammed: 1 })
  V.openVending(W.eng, { s: s2 })
  const st2 = V.structMachine(W.eng, s2)
  ok(st2.jammed && st2.jamSlot === -1 && V.vendingView(W.eng)!.display === 'Err', '地图生成的卡死机器：Err')
  withRandom(0.1, () => V.vendingKick(W.eng))
  ok(!!st2.bin && s2.data.jamFreed === 1, '旧机器拍下来的那件直接进取货口（模型上的卡货隐藏）')
}

// ── 只收磁带的旧机器
{
  const W = world()
  const s = W.vending(21, 20, {})
  V.openVending(W.eng, { s })
  const st = V.structMachine(W.eng, s)
  V.vendingPress(W.eng, 'A'); V.vendingPress(W.eng, '1')
  ok(st.flash === 'TAPE' && !st.anim, '没额度：TAPE（只收磁带）')
  W.eng.addItem('tape'); W.p.tapes = 1
  V.vendingInsertTape(W.eng)
  ok(st.credit === VM.TAPE_CREDIT && W.p.tapes === 0, '投一盘磁带 = 2 次额度')
  withRandom(0.9, () => { V.vendingPress(W.eng, 'A'); V.vendingPress(W.eng, '1') })
  ok(st.anim?.clip === 'coil' && st.credit === 1, '用掉一次额度出货')
}

// ── Entity 36：背面安全 / 白骨手出货 / 人制品
{
  const W = world()
  const e = W.e36(22.5, 20.5, Math.PI) // 正面朝 -X（朝玩家）
  W.run(1)
  ok(e.vm?.mode === 'dormant' && e.def.type === 'vendingmachine', '休眠')
  W.p.x = 25; W.p.facing = 0 // 绕到背面，背对它
  W.run(10)
  ok(e.vm!.mode === 'dormant', '看背面 / 背对它都不会活化（旧版背对激活已取消）')
  W.p.x = 21
  V.openVending(W.eng, { e })
  const v = e.vm!
  const prod = v.products[2]
  V.vendingPress(W.eng, 'A'); V.vendingPress(W.eng, '3')
  ok(v.anim?.clip === 'hand' && v.stock[2] === 1, 'A3：白骨手推货（hand 片段），库存 2→1')
  ok(cries > 0 && V.vendingView(W.eng)!.cry !== '', '出货时机器里传出哭声（界面字幕）')
  ok(V.vm36Render(e, 0).clip === 'hand', '渲染：hand 片段')
  W.run(VM.BIN_AT_HAND + 0.1)
  ok(v.bin?.product === prod, '货被推进取货口')
  const mm = W.count('manmade')
  V.vendingTake(W.eng)
  ok(W.count('manmade') === mm + 1, `取出「${L.PRODUCT_NAME[prod]}」= 物品人制品`)
  // 补货
  v.stock.fill(0); v.restockT = 0.05; cries = 0
  const san = W.p.sanity
  W.run(0.2)
  ok(v.stock.every((s) => s === L.VENDING_E36_STOCK) && v.anim?.clip === 'restock', '定时一瞬间全部补满（restock 片段）')
  ok(cries > 0 && W.p.sanity < san, '补货时附近听见哭声（理智 -3）')
}

// ── 成瘾
{
  const W = world()
  W.eng.useItem ? 0 : 0
  for (let i = 0; i < 2; i++) V.vendingAte(W.eng)
  ok(W.eng.vendRun.addict >= VM.T1 && W.eng.vendRun.addict < VM.T2, '吃两份：依赖度 ≥25')
  const s0 = W.p.sanity
  W.run(5)
  ok(W.p.sanity < s0 - 0.4, '附近没有售货机：理智持续流失')
  const e = W.e36(24.5, 20.5)
  const s1 = W.p.sanity
  W.run(5)
  ok(Math.abs(W.p.sanity - s1) < 0.05, '待在售货机旁边：不再流失')
  void e
  for (let i = 0; i < 3; i++) V.vendingAte(W.eng)
  ok(W.eng.vendRun.addict >= VM.T2, '依赖度 ≥50')
  ok(withRandom(0.0, () => V.vendingRefuseFood(W.eng)) && !withRandom(0.99, () => V.vendingRefuseFood(W.eng)), '≥50：有概率吃不下别的食物')
  V.vendingAte(W.eng)
  ok(W.eng.vendRun.victim && W.eng.vendRun.addict === VM.VICTIM, '依赖度满：成为受害者')
  W.eng.vendRun.wipeT = 0.05
  W.run(0.2)
  ok(W.eng.explored.every((x: number) => x === 0), '受害者：定时抹掉地图探索记忆')
  W.eng.vendRun.addict = VM.VICTIM_LOSE - 1
  W.run(0.1)
  ok(!W.eng.vendRun.victim, '依赖度降到 60 以下：不再是受害者')
  W.eng.vendRun.addict = 10; W.eng.manmadeT = 0
  W.run(3)
  ok(W.eng.vendRun.addict < 10, '不吃会慢慢戒断')
}

// ── 激怒 → 站起 → 爬行 → 开顶门 → 劈砍
{
  const W = world()
  const e = W.e36(26.5, 20.5)
  W.run(0.5)
  const hp0 = e.hp
  V.vm36Struck(W.eng, e, 30)
  ok(Math.abs(hp0 - e.hp - 30 * VM.RESIST) < 0.01, '普通武器只打掉 12%')
  ok(e.vm!.mode === 'emerge' && e.def.type === 'vmad', '被攻击：活化（底门伸腿站起）')
  ok(V.vm36Render(e, 0).clip === 'stand', '渲染：stand 片段')
  const x0 = e.x
  W.run(VM.EMERGE_T - 0.2)
  ok(e.x === x0, '站起过程中不移动')
  W.run(0.5)
  ok(e.vm!.mode === 'chase' && V.vm36Render(e, 0).clip === 'crawl', '站起后爬行追击（crawl）')
  W.run(1.5)
  ok(e.x < x0 - 1, '朝玩家爬过来')
  ok(W.until(() => e.vm!.mode === 'open', 8), '进入劈砍距离：先打开顶门伸出巨臂（open）')
  const hp = W.p.hp
  ok(W.until(() => e.vm!.mode === 'chop', 3), '然后劈砍（chop）')
  W.run(VM.CHOP_HIT_AT + 0.1)
  ok(W.p.hp <= hp - VM.CHOP_DMG + 0.01, `劈中 -${VM.CHOP_DMG}`)
  ok(W.until(() => e.vm!.mode === 'chase', 3) && e.vm!.armOut, '劈完回到追击，巨臂保持伸出（下次直接劈）')
  // 瓶装闪电
  V.vm36Shocked(W.eng, e)
  ok(e.vm!.mode === 'stun' && V.vm36Render(e, 0).clip === 'stun', '瓶装闪电：电晕')
  const hpS = e.hp
  ok(hpS <= 200 - VM.SHOCK_DMG - 30 * VM.RESIST + 0.01, `瓶装闪电重创 -${VM.SHOCK_DMG}`)
  const xs = e.x
  W.run(VM.SHOCK_STUN - 0.3)
  ok(e.x === xs && e.vm!.mode === 'stun', '电晕 8 秒内不动')
  W.run(0.6)
  ok(['chase', 'open', 'chop', 'grab'].includes(e.vm!.mode), '醒来继续追（' + e.vm!.mode + '）')
  // 跟丢 → 爬回原位 → 休眠
  W.p.x = 2.5; W.p.y = 2.5; W.eng.dev.invisible = true
  ok(W.until(() => e.vm!.mode === 'return', 2), '跟丢：爬回原位')
  W.eng.dev.invisible = false; W.p.x = 3; W.p.y = 40
  ok(W.until(() => e.vm!.mode === 'settle', 40), '回到原位')
  ok(W.until(() => e.vm!.mode === 'dormant', 3) && e.def.type === 'vendingmachine' && Math.abs(e.x - 26.5) < 0.01 && Math.abs(e.facing - Math.PI) < 1e-6, '收腿、重新休眠，朝向复原')
}

// ── 受害者打它不会被追
{
  const W = world()
  const e = W.e36(23.5, 20.5)
  W.run(0.2)
  W.eng.vendRun.victim = true; W.eng.vendRun.addict = 100
  V.vm36Struck(W.eng, e, 30)
  ok(e.vm!.mode === 'dormant', '受害者攻击它：它不计较（不活化）')
}

// ── 打坏 → 后部暗格
{
  const W = world()
  const e = W.e36(23.5, 20.5)
  W.run(0.2)
  e.hp = 1
  V.vm36Struck(W.eng, e, 50)
  ok(!e.dead && e.vm!.mode === 'broken' && e.def.type === 'vendingmachine', '血量见底：瘫倒，不算死亡')
  ok(V.vm36Render(e, 0).dark, '渲染：灯箱熄灭')
  V.openVending(W.eng, { e })
  V.vendingPress(W.eng, 'A'); V.vendingPress(W.eng, '1')
  ok(!e.vm!.anim, '坏掉后不再出货')
  const san = W.p.sanity
  V.vm36OpenBack(W.eng, e)
  ok(e.vm!.opened && W.p.sanity === san - VM.OPEN_SAN, '撬开后部暗格：三具艾里克尸体（理智 -15）')
  ok(W.msgs.some((m) => m.includes('亨利·艾里克') && m.includes('马文·艾里克')), '额头写着名字')
  ok(V.vm36Render(e, 1).clip === 'whisper', '渲染：暗格低语片段')
  const w0 = whispers
  V.vm36OpenBack(W.eng, e)
  ok(whispers > w0, '再听：低语')
}

// ── 杂项
{
  const W = world()
  const e = W.e36(23.5, 20.5)
  ;(W.eng as any).updateVendingMachines()
  W.run(30)
  ok(e.vm!.mode === 'dormant' && !e.activated, '旧的 updateVendingMachines 已是空操作')
  ok(ENTITIES.vendingmachine.codex!.behavior.includes('背面') && !ENTITIES.vendingmachine.codex!.behavior.includes('别背对'), '图鉴：背面是辨认方式，没有背对激活')
}

console.log(`\n${n - fails}/${n} 通过`)
if (fails) process.exit(1)
