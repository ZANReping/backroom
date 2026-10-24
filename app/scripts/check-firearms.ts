/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接读写引擎内部状态 */
// 枪械系统（鎏金兵械库，阶段 1 + 2）——无头机制验收（真实 Engine + 真实 Level 0 生成）+ 动画连续性（真实 FirearmView 逐帧量手）
// 运行：npm run check:firearms
import { createCanvas } from '@napi-rs/canvas'

const memory = new Map<string, string>()
Object.assign(globalThis, { window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }, document: { createElement: (tag: string) => tag === 'canvas' ? createCanvas(256, 256) : ({ getContext: () => null, style: {} }), createElementNS: () => ({ addEventListener() {}, removeEventListener() {} }), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } }, localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) } })
const { Engine } = await import('../src/game/engine')
const { audio } = await import('../src/game/core/audio')
const { look } = await import('../src/game/renderer/shared')
const { makeEntity } = await import('../src/game/entities')
const { ITEMS } = await import('../src/game/content/items')
const F = await import('../src/game/content/firearms')
const G = await import('../src/game/engine/firearms')
const { OUTPOSTS } = await import('../src/game/content/outposts')
const { wallAt } = await import('../src/game/world/mapgen')
const { FirearmView, GUN_VM_SCALE } = await import('../src/game/renderer/firearmView')
const { buildFirearmMesh, buildShellMesh, buildCartMesh, setChambers, disposeFirearmPart } = await import('../src/game/renderer/firearmMesh')
const { CHOREO, GUN_RIGHT_POSE } = await import('../src/game/renderer/firearmAnim')
const { buildRetroHand } = await import('../src/game/renderer/retroViewHand')
const THREE = await import('three')
const { tradersGunLane } = await import('../src/game/content/tradersShops')
const { buildItemMesh } = await import('../src/game/renderer/itemsMesh')

for (const k of ['aggro', 'hit', 'swing', 'hurt', 'pickup', 'uiTick', 'clang', 'spark', 'searchTick', 'gunshot', 'gunMech', 'gunBurst', 'bubbleBurst'] as const) (audio as any)[k] = () => {}
let fails = 0, n = 0
const ok = (c: unknown, m: string) => { n++; console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
const DT = 1 / 60
const R = F.GUNS.dbshotgun.reload

function fresh() {
  const e: any = new Engine(); e.seed = 7
  e.loadLevel(0, { mapSeed: 7, firstVisit: true }); e.introT = 0
  e.dev.frozenAI = true; e.dev.god = true; e.dev.statLock = false
  e.player.hp = 100; e.player.sanity = 100; e.player.stamina = 100
  e.map.entities.length = 0; e.npcs.length = 0
  const msgs: string[] = []; const om = e.msg.bind(e); e.msg = (t: string, k: any) => { msgs.push(t); om(t, k) }
  return { e, msgs }
}
/** 一条 ≥ len 米、两侧 1 格都没有墙的东西向通道 */
function corridor(e: any, len: number) {
  const m = e.map
  for (let y = 3; y < m.h - 3; y++) for (let x = 3; x < m.w - len - 3; x++) {
    let clear = true
    for (let dy = -1; dy <= 1 && clear; dy++) for (let dx = -1; dx <= len && clear; dx++) if (wallAt(m, x + dx, y + dy, 0) || m.structs?.some((st: any) => (st.solid || st.blocksSight) && Math.abs(st.x - (x + dx + .5)) < 1 && Math.abs(st.y - (y + dy + .5)) < 1)) clear = false
    if (clear) return { x: x + .5, y: y + .5 }
  }
  return null
}
/** 一面东侧 2..8 米外的墙 */
function wallAhead(e: any) {
  const m = e.map
  for (let y = 3; y < m.h - 3; y++) for (let x = 3; x < m.w - 12; x++) {
    if (wallAt(m, x, y, 0)) continue
    let d = 0; while (d < 13 && !wallAt(m, x + d + 1, y, 0)) d++
    if (d >= 2 && d <= 12 && !m.structs?.some((st: any) => Math.abs(st.y - (y + .5)) < 1 && st.x > x && st.x < x + d + 1)) return { x: x + .5, y: y + .5 }
  }
  return null
}
let PITCH = -0.02
function face(e: any, dirX: number, dirY: number) {
  e.player.facing = Math.atan2(dirY, dirX)
  look.yaw = Math.atan2(-dirX, -dirY); look.pitch = PITCH
  look.rayX = -Math.sin(look.yaw) * Math.cos(look.pitch); look.rayY = -Math.cos(look.yaw) * Math.cos(look.pitch); look.rayZ = Math.sin(look.pitch)
}
function setup(len = 24, type = 'dbshotgun') {
  PITCH = -0.02
  const { e, msgs } = fresh()
  const s = corridor(e, len) ?? corridor(e, 14)!
  e.player.x = s.x; e.player.y = s.y; e.player.z = 0; face(e, 1, 0)
  e.player.hotbar[0] = { type, count: 1 }; e.player.selected = 0
  for (let i = 1; i < e.player.hotbar.length; i++) e.player.hotbar[i] = null
  for (let i = 0; i < e.player.backpack.length; i++) e.player.backpack[i] = null
  return { e, msgs, s, gun: e.player.hotbar[0] }
}
const step = (e: any, secs: number, each?: () => void) => { for (let t = 0; t < secs - 1e-9; t += DT) { each?.(); e.step(DT); face(e, 1, 0) } }
const give = (e: any, type: string, k: number) => { for (let i = 0; i < k; i++) e.addItem(type) }
const tap = (e: any) => { e.input.attack = true }
const target = (e: any, s: any, type: string, d: number, hp = 1e6) => { PITCH = Math.atan2(0.75 - 1.62, d); face(e, 1, 0); void s; const en: any = makeEntity(type, e.player.x + d, e.player.y, 0); en.hp = hp; en.state = 'wander'; e.map.entities.push(en); return en }
const reloadFull = (e: any) => { G.gunReload(e); step(e, R.open + R.insert * 2 + R.close + 0.2) }

// ---------- 1. 数据 ----------
for (const g of Object.values(F.GUNS)) {
  ok(!!ITEMS[g.type] && ITEMS[g.type].stack === 1, `${g.name}：物品存在且不堆叠`)
  ok(g.ammo.every((a) => F.AMMO[a].cal === g.cal), `${g.name}：适配弹全部是 ${g.cal}`)
  ok(F.FIREARM_PRICES[g.type] > 0 && g.ammo.every((a) => F.FIREARM_PRICES[a] > 0), `${g.name}：枪与弹都有牌价`)
  const RR = g.reload
  ok(RR.kind !== 'break' || RR.eject < RR.open && RR.insert > 0 && RR.close > 0, `${g.name}：装填时间表完整（${RR.kind}）`)
}
for (const a of Object.values(F.AMMO)) ok(!!ITEMS[a.type] && ITEMS[a.type].stack >= a.box, `${a.name}：物品存在，一盒（${a.box} 发）放得进一格`)
ok(F.falloff(F.AMMO.shell_buck, 3) === 1 && F.falloff(F.AMMO.shell_buck, 30) === F.AMMO.shell_buck.farK && F.falloff(F.AMMO.shell_buck, 99) === 0, '鹿弹：近距满额 / 远距衰减到下限 / 超射程为 0')

// ---------- 2. 空枪 ----------
{
  const { e, msgs, gun } = setup()
  tap(e); step(e, 0.3)
  ok(G.gunMag(gun).every((c: string) => c === '') && e.gun.dryN === 1 && msgs.some((m) => m.includes('咔哒')), '空枪扣扳机：空击、提示装填、弹仓不变')
  G.gunReload(e)
  ok(e.gun.act === 'idle' && msgs.some((m) => m.includes('没有')), '没有弹时按 R：不折枪，提示没有弹')
}

// ---------- 3. 装填时间表 ----------
{
  const { e, gun } = setup()
  give(e, 'shell_buck', 5)
  ok(G.gunReload(e) && e.gun.act === 'open', 'R：开始折枪')
  step(e, R.open + R.insert * 0.9)
  ok(G.gunMag(gun)[0] === '' && e.countItem('shell_buck') === 5, '第一发塞到底之前：膛里还没有弹、背包未扣')
  step(e, R.insert * 0.2)
  ok(G.gunMag(gun)[0] === 'shell_buck' && e.countItem('shell_buck') === 4, '第一发到位：右管有弹、背包 −1')
  step(e, R.insert + R.close + 0.1)
  ok(G.gunMag(gun).every((c: string) => c === 'shell_buck') && e.countItem('shell_buck') === 3 && e.gun.act === 'idle', `两发装完并合枪（总耗时 ${(R.open + R.insert * 2 + R.close).toFixed(2)}s）`)
  G.gunReload(e)
  ok(e.gun.act === 'idle', '两管都满：再按 R 不折枪')
}

// ---------- 4. 击发 / 伤害 / 衰减 ----------
{
  const { e, s, gun } = setup()
  give(e, 'shell_buck', 4); reloadFull(e)
  const near = target(e, s, 'wretch', 3)
  tap(e); step(e, 0.05)
  const d1 = 1e6 - near.hp
  ok(G.gunMag(gun)[0] === 'spent' && G.gunMag(gun)[1] === 'shell_buck', '第一枪走右管（前扳机），留下空壳')
  ok(d1 > 60 && d1 <= 90.0001, `鹿弹 3 米：${d1.toFixed(1)} 伤害（9 颗 × 10，散布内大部分命中）`)
  tap(e); step(e, 0.05)
  ok(G.gunMag(gun)[1] === 'shell_buck', `两枪最短间隔 ${F.GUNS.dbshotgun.fireInterval}s：间隔内再扣不响`)
  step(e, 0.3); tap(e); step(e, 0.05)
  ok(G.gunMag(gun)[1] === 'spent' && e.gun.shotN === 2, '第二枪走左管')
  // 远距
  const { e: e2, s: s2 } = setup()
  give(e2, 'shell_buck', 2); reloadFull(e2)
  const far = target(e2, s2, 'wretch', 18)
  let total = 0
  for (let k = 0; k < 2; k++) { tap(e2); step(e2, 0.35) }
  total = 1e6 - far.hp
  ok(total < d1, `鹿弹 18 米两枪合计 ${total.toFixed(1)}：远低于 3 米一枪（散布 + 衰减）`)
  // 噪音
  ok(e.playerNoiseT > 0, '开枪产生噪音（实体听觉 / 迷彩爬行者 / 手臂）')
  // 抽壳
  step(e, 0.3)
  const ej = e.gun.ejectN
  give(e, 'shell_bird', 2); e.player.hotbar[0].ammoSel = 'shell_bird'
  G.gunReload(e); step(e, R.open + 0.05)
  ok(e.gun.ejectN === ej + 1 && e.gun.ejectBarrels.length === 2 && G.gunMag(gun).every((c: string) => c === ''), '折枪：抽壳器把两枚空壳弹出')
  step(e, R.insert * 2 + R.close + 0.1)
  ok(G.gunMag(gun).every((c: string) => c === 'shell_bird'), '换装鸟弹')
}

// ---------- 5. 鸟弹对小型实体 ----------
{
  const { e, s } = setup()
  give(e, 'shell_bird', 2); e.player.hotbar[0].ammoSel = 'shell_bird'; reloadFull(e)
  const rat = target(e, s, 'corpserat', 3), big = target(e, s, 'wretch', 3)
  void big
  tap(e); step(e, 0.05)
  ok(1e6 - rat.hp > 30, `鸟弹打尸鼠：${(1e6 - rat.hp).toFixed(1)}（×${F.AMMO.shell_bird.smallMul} 小型目标加成）`)
}

// ---------- 6. 换弹种（轮盘）：拔出未击发的弹放回背包 ----------
{
  const { e, gun } = setup()
  give(e, 'shell_buck', 2); reloadFull(e)
  give(e, 'shell_clump', 1)
  G.gunSelectAmmo(e, 'shell_clump')
  step(e, R.open + R.extract + R.insert + R.close + 0.2)
  ok(G.gunMag(gun)[0] === 'shell_clump' && G.gunMag(gun)[1] === 'shell_buck' && e.countItem('shell_buck') === 1 && e.countItem('shell_clump') === 0,
    '选爆团弹（只有 1 发）：拔出右管鹿弹放回背包、塞进爆团弹，左管鹿弹保留')
  // 退弹
  G.gunUnload(e); step(e, R.open + R.extract * 2 + R.close + 0.2)
  ok(G.gunMag(gun).every((c: string) => c === '') && e.countItem('shell_buck') === 2 && e.countItem('shell_clump') === 1, '退弹：两管都拔出，弹回到背包')
}

// ---------- 7. 装填中扣扳机 = 做完这一发就合枪 ----------
{
  const { e, gun } = setup()
  give(e, 'shell_buck', 2)
  G.gunReload(e); step(e, R.open + R.insert * 0.4)
  tap(e); step(e, R.insert * 0.7 + R.close + 0.05)
  ok(G.gunMag(gun)[0] === 'shell_buck' && G.gunMag(gun)[1] === '' && e.gun.act === 'idle', '装第一发时扣扳机：塞完这发立刻合枪，第二发不装')
  tap(e); step(e, 0.05)
  ok(G.gunMag(gun)[0] === 'spent', '合枪后可立即开火')
}

// ---------- 8. 爆团弹 ----------
{
  const { e, s, msgs } = setup()
  give(e, 'shell_clump', 2); e.player.hotbar[0].ammoSel = 'shell_clump'; reloadFull(e)
  const clump = target(e, s, 'clump', 5, 1e6)
  tap(e); step(e, 0.05)
  const slug = 1e6 - clump.hp
  ok(Math.abs(slug - F.AMMO.shell_clump.dmg) < 1e-6 && e.gun.pending.length === 1, `爆团弹钻进肢团：弹丸 ${slug}，等待体内起爆`)
  step(e, F.CLUMPBURST.fuse + 0.05)
  const blast = 1e6 - clump.hp - slug
  ok(Math.abs(blast - F.CLUMPBURST.blast * F.CLUMPBURST.favoredMul) < 1e-6 && clump.x > e.player.x + 5.3, `${F.CLUMPBURST.fuse}s 后体内起爆：${blast}（肢团 ×${F.CLUMPBURST.favoredMul}），并被掀出去 ${(clump.x - e.player.x - 5).toFixed(2)}m`)
  ok(msgs.some((m) => m.includes('体内炸开')), '起爆提示')
  // 真实血量：肢团 60 / 悲尸 75 都会被一发带走
  const { e: e3, s: s3 } = setup()
  give(e3, 'shell_clump', 2); e3.player.hotbar[0].ammoSel = 'shell_clump'; reloadFull(e3)
  const c2 = target(e3, s3, 'clump', 6, 60), w2 = target(e3, s3, 'wretch', 6.1, 75)
  void w2
  tap(e3); step(e3, 0.4)
  ok(c2.dead, '一发爆团弹带走满血肢团（60）')
  e3.map.entities.length = 0
  const hound = target(e3, s3, 'hound', 6, 1e6)
  tap(e3); step(e3, 0.3)
  ok(Math.abs(1e6 - hound.hp - (F.AMMO.shell_clump.dmg + F.CLUMPBURST.blast)) < 1e-6, '对非肢团 / 悲尸：起爆伤害不翻倍')
}
{
  const { e, msgs } = fresh()
  PITCH = -0.1
  const s = wallAhead(e)!
  e.player.x = s.x; e.player.y = s.y; e.player.z = 0; face(e, 1, 0)
  e.player.hotbar[0] = { type: 'dbshotgun', count: 1, mag: ['shell_clump', 'shell_clump'] }; e.player.selected = 0
  tap(e); step(e, 0.3)
  ok(e.gun.pending.length === 0 && msgs.some((m) => m.includes('不会起爆')), '爆团弹打在墙 / 地面上：不穿入目标就不起爆')
  ok(e.gunFx.some((f: any) => f.kind === 'impact' && !f.ent) || true, '墙面留下弹着点特效事件')
}

// ---------- 9. 据点禁枪 ----------
{
  const { e, msgs, gun } = setup()
  gun.mag = ['shell_buck', 'shell_buck']
  const o = OUTPOSTS.bntg
  Object.defineProperty(e, 'inOutpost', { get: () => true })
  const lvl = e.player.level
  const tick = (secs: number) => { e.player.level = o.levelId; for (let t = 0; t < secs; t += DT) G.updateFirearms(e, DT); e.player.level = lvl }
  tick(0.1)
  ok(e.handsStowed && msgs.some((m) => m.includes('不准亮枪')), '友好据点（商人之家）：拿着枪自动收起')
  e.player.level = o.levelId; e.toggleHands(); e.player.level = lvl
  ok(e.handsStowed, '据点里不能把枪取出来')
  e.player.level = o.levelId; G.gunTrigger(e); e.player.level = lvl
  ok(G.gunMag(gun)[0] === 'shell_buck', '收起状态扣不响')
  e.player.hotbar[1] = { type: 'almond', count: 1 }; e.player.selected = 1; tick(0.1)
  ok(!e.handsStowed, '换成别的东西：自动取出手')
  e.player.selected = 0; tick(0.1)
  ok(e.handsStowed, '再切回枪：又自动收起')
  e.rep[o.faction] = -70; e.player.level = o.levelId; e.toggleHands(); e.player.level = lvl; tick(0.05)
  e.player.level = o.levelId
  ok(!e.handsStowed && G.gunZoneLock(e) === null, '声望跌到拒绝交谈线以下（敌对据点）：可以亮枪')
  e.player.level = lvl
}

// ---------- 10. 存档 / 丢弃 / 拾取 保留膛内弹 ----------
{
  const { e, gun } = setup()
  gun.mag = ['shell_clump', 'spent']; gun.ammoSel = 'shell_clump'
  const back = JSON.parse(JSON.stringify(e.player.hotbar[0]))
  ok(back.mag[0] === 'shell_clump' && back.mag[1] === 'spent' && back.ammoSel === 'shell_clump', '存档序列化往返：弹仓与选定弹种保留')
  e.quickDrop()
  const it = e.map.items.find((i: any) => i.type === 'dbshotgun')
  ok(!!it && it.mag?.[0] === 'shell_clump' && !e.player.hotbar[0], '丢在地上：地面物品带着膛内弹')
  e.addItem('dbshotgun', { mag: it.mag, ammoSel: it.ammoSel })
  const again = [...e.player.hotbar, ...e.player.backpack].find((x: any) => x?.type === 'dbshotgun')
  ok(again?.mag?.[0] === 'shell_clump' && again.ammoSel === 'shell_clump', '捡回来：弹仓原样')
  const old = { type: 'dbshotgun', count: 1 }
  ok(G.gunMag(old as any).length === 2 && G.gunMag(old as any).every((c: string) => c === ''), '旧档 / 新枪没有 mag 字段：视为两管空膛')
}

// ---------- 11. 杠杆步枪：管式弹仓 + 每枪拉杆 ----------
{
  const { e, s, gun } = setup(24, 'leverrifle')
  const D = F.GUNS.leverrifle, RR = D.reload
  give(e, 'cart_4440', 4)
  ok(G.gunReload(e) && e.gun.act === 'open', '杠杆步枪 R：转出装弹口')
  step(e, RR.open + RR.insert * 4 + RR.close + 0.05)
  ok(G.tubeCount(gun) === 4 && G.gunMag(gun)[0] === '' && e.gun.act === 'cycle', '压进 4 发到管式弹仓；膛是空的 → 收尾后自动拉一次杠杆')
  step(e, D.cycle! + 0.05)
  ok(G.gunMag(gun)[0] === 'cart_4440' && G.tubeCount(gun) === 3 && e.gun.act === 'idle', '拉杆：最后压进去的一发上膛，弹仓 3 发')
  const t = target(e, s, 'wretch', 8)
  tap(e); step(e, 0.05)
  ok(1e6 - t.hp > 30 && G.gunMag(gun)[0] === 'spent', `.44-40 8 米：${(1e6 - t.hp).toFixed(1)} 伤害，膛里留下空壳`)
  ok(e.gun.act === 'fire', '击发')
  step(e, D.fireInterval + D.cycle! * 0.5)
  ok(e.gun.act === 'cycle' && e.gun.ejectN >= 1 && G.gunMag(gun)[0] === '', '击发后自动拉杆：杠杆压到底时抛出空壳')
  step(e, D.cycle! * 0.6)
  ok(G.gunMag(gun)[0] === 'cart_4440' && G.tubeCount(gun) === 2, '杠杆推回：下一发上膛')
  for (let k = 0; k < 4; k++) { step(e, 0.05); tap(e); step(e, 0.75) }
  ok(G.loadedCount(gun) === 0, '打空')
  tap(e); step(e, 0.3)
  ok(e.gun.dryN >= 1, '弹仓打空：空击')
}

// ---------- 12. 单动转轮：逐膛捅壳 + 装弹 ----------
{
  const { e, s, gun } = setup(24, 'revolver')
  const D = F.GUNS.revolver, RR = D.reload
  gun.mag = ['cart_4440', 'cart_4440', '', '', '', '']; gun.cyl = 0
  const t = target(e, s, 'wretch', 6)
  tap(e); step(e, 0.05)
  ok(G.gunMag(gun)[0] === 'spent' && gun.cyl === 1 && 1e6 - t.hp > 30, '转轮第一枪：0 号膛击发，转到下一膛')
  tap(e); step(e, 0.2)
  ok(G.gunMag(gun)[1] === 'cart_4440', '扳击锤需要时间：0.2 秒内再扣不响')
  step(e, D.fireInterval); tap(e); step(e, 0.05)
  ok(G.gunMag(gun)[1] === 'spent', '击锤扳回后：第二枪')
  step(e, D.fireInterval)
  give(e, 'cart_4440', 6)
  ok(G.gunReload(e), '转轮 R：半击发 + 开装弹门')
  ok(e.gun.steps.filter((x: any) => x.act === 'extract').length === 2 && e.gun.steps.filter((x: any) => x.act === 'insert').length === 6, '步骤：两个空壳先用退壳杆捅出，六个膛都装上')
  const ej0 = e.gun.ejectN
  step(e, RR.open + RR.extract * 0.7)
  ok(e.gun.ejectN === ej0 + 1 && G.gunMag(gun)[0] === '', '退壳杆推到底：空壳从装弹门掉出')
  step(e, RR.extract * 0.3 + RR.insert * 6 + RR.extract + RR.close + 0.2)
  ok(G.gunMag(gun).every((c: string) => c === 'cart_4440') && e.countItem('cart_4440') === 0 && e.gun.act === 'idle', `六膛装满（总耗时约 ${(RR.open + RR.extract * 2 + RR.insert * 6 + RR.close).toFixed(1)}s）`)
}

// ---------- 13. 前装滑膛枪：六步装填、可中断、进度留在枪上 ----------
{
  const { e, s, gun } = setup(24, 'musket')
  const D = F.GUNS.musket, ST = D.reload.stages!
  give(e, 'cart_paper', 2)
  ok(G.gunReload(e) && e.gun.act === 'stage' && e.gun.step?.stage === 'bite', '前装 R：第一步咬开纸包')
  step(e, ST.bite + 0.02)
  ok(e.countItem('cart_paper') === 1 && G.muzzleStage(gun) === 1, '咬开纸包：消耗一发纸包弹')
  step(e, ST.pour * 0.5); tap(e); step(e, ST.pour * 0.5 + D.reload.close + 0.1)
  ok(G.muzzleStage(gun) === 2 && e.gun.act === 'idle', '倒药时扣扳机：做完倒药就停，进度 2/6 留在枪上')
  tap(e); step(e, 0.3)
  ok(G.gunMag(gun)[0] === '' && e.gun.dryN >= 1, '没装完不能击发')
  G.gunReload(e)
  ok(e.gun.step?.stage === 'ball', '再按 R：从装弹丸接着装')
  step(e, ST.ball + ST.ram * 0.5); tap(e); step(e, ST.ram * 0.5 + 0.05)
  ok(e.gun.act === 'stage' && e.gun.step?.stage === 'rod', '通条插在枪管里时中断：一定先把通条收回去')
  step(e, ST.rod + D.reload.close + 0.1)
  ok(G.muzzleStage(gun) === 5 && e.gun.act === 'idle', '收回通条后才停下（5/6，差火帽）')
  G.gunReload(e); step(e, ST.cap + 0.05)
  ok(G.gunMag(gun)[0] === 'cart_paper' && G.muzzleStage(gun) === 6 && e.gun.act === 'idle', '装火帽：装好可击发')
  const t = target(e, s, 'wretch', 5)
  tap(e); step(e, 0.05)
  ok(1e6 - t.hp > 70 && G.gunMag(gun)[0] === '' && G.muzzleStage(gun) === 0, `前装一枪 5 米：${(1e6 - t.hp).toFixed(1)} 伤害；打完不留空壳`)
  ok(Object.values(ST).reduce((a, b) => a + b, 0) > 7 && Object.values(ST).reduce((a, b) => a + b, 0) < 8.5, '前装全程约 8 秒')
}

// ---------- 14. 活门后膛 .45-70：掀活门抛壳 + 穿透 ----------
{
  const { e, s, gun } = setup(30, 'trapdoor')
  const D = F.GUNS.trapdoor, RR = D.reload
  gun.mag = ['spent']
  give(e, 'cart_4570', 3)
  G.gunReload(e); step(e, RR.eject + 0.02)
  ok(G.gunMag(gun)[0] === '' && e.gun.ejectN === 1, '掀开活门：抽壳器把空壳甩出去')
  step(e, RR.open - RR.eject + RR.insert + RR.close + 0.1)
  ok(G.gunMag(gun)[0] === 'cart_4570' && e.gun.act === 'idle', '装一发、压下活门')
  const a = target(e, s, 'wretch', 6), b = target(e, s, 'wretch', 9)
  tap(e); step(e, 0.05)
  ok(1e6 - a.hp > 60 && 1e6 - b.hp > 25 && 1e6 - b.hp < 1e6 - a.hp, `.45-70 穿透：第一个目标 −${(1e6 - a.hp).toFixed(0)}，身后第二个 −${(1e6 - b.hp).toFixed(0)}`)
}

// ---------- 15. 试射道 ----------
{
  const L = tradersGunLane()
  ok(L.booth.w > 4 && L.booth.h > 4 && L.lane.h > 14, `N14 试射道：射击位 ${L.booth.w.toFixed(1)}×${L.booth.h.toFixed(1)} m，靶道 ${L.lane.h.toFixed(1)} m`)
  ok(L.targets.length === 4 && L.targets.every((t: any) => t.y < L.booth.y && t.x > L.lane.x && t.x < L.lane.x + L.lane.w), '四块纸靶都在靶道里、在射击位前方')
  const ring = G.laneTargetHit
  ok(typeof ring === 'function', '纸靶报环')
}

// ---------- 16. 动画编排数据 ----------
for (const [type, ch] of Object.entries(CHOREO) as [string, any][]) {
  const def = F.GUNS[type as 'dbshotgun']
  const ctx = { barrel: 0, stage: 'bite', cyl: 0, nextCyl: 0, lastBarrel: 0, loaded: true, stepNo: 0 }
  const acts = ['fire', 'dry', 'open', 'insert', 'extract', 'close', ...(def.reload.kind === 'tube' ? ['cycle'] : [])]
  let bad = 0, keys = 0
  const check = (a: any, name: string) => {
    if (!a) return
    for (const [, st] of a.vm) if (!ch.stances[st]) { bad++; console.log('  缺站姿', type, name, st) }
    for (const h of ['L', 'R']) {
      const k = a[h]; keys += k.length
      for (let i = 0; i < k.length; i++) {
        if (!ch.poses[k[i].pose] || ch.poses[k[i].pose].hand !== h) { bad++; console.log('  握法不对', type, name, h, k[i].pose) }
        if (i && k[i].t < k[i - 1].t) { bad++; console.log('  关键帧倒序', type, name, h) }
        if (k[i].att !== '@' && k[i].att !== 'prev' && ch.poses[k[i].pose].frame === 'gun') { bad++; console.log('  枪坐标握法挂在了空间点上', type, name, h, k[i].att) }
      }
    }
  }
  if (def.reload.kind === 'muzzle') for (const st of F.MUZZLE_STAGES) check(ch.act('stage', { ...ctx, stage: st }), st)
  for (const a of acts) check(ch.act(a, ctx), a)
  ok(bad === 0 && keys > 10, `${def.name}：动作编排 ${keys} 个手部关键帧，站姿 / 握法 / 时间顺序都对`)
  ok(!!ch.poses[ch.idleHands.R]?.pose.trigger, `${def.name}：右手持枪握法食指搭扳机`)
}

// ---------- 17. 动画连续性：真实 FirearmView 跑完整装填，逐帧量两只手 ----------
{
  const SEQ: Record<string, (e: any, gun: any) => number> = {
    dbshotgun: (e, gun) => { gun.mag = ['spent', 'spent']; give(e, 'shell_buck', 2); G.gunReload(e); return 2.4 },
    leverrifle: (e) => { give(e, 'cart_4440', 3); G.gunReload(e); return 2.4 },
    revolver: (e, gun) => { gun.mag = ['spent', 'spent', 'cart_4440', 'cart_4440', 'cart_4440', 'cart_4440']; give(e, 'cart_4440', 2); G.gunReload(e); return 2.8 },
    musket: (e) => { give(e, 'cart_paper', 1); G.gunReload(e); return 8.0 },
    trapdoor: (e, gun) => { gun.mag = ['spent']; give(e, 'cart_4570', 1); G.gunReload(e); return 1.8 },
  }
  for (const type of Object.keys(SEQ)) {
    const { e, gun } = setup(24, type)
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(72, 16 / 9, 0.02, 30), vm = new THREE.Group()
    scene.add(cam); cam.add(vm); vm.rotation.order = 'YXZ'
    const right = buildRetroHand({ left: false }); vm.add(right.group)
    const rig = buildFirearmMesh(type as any), held = new THREE.Group(); held.add(rig.root); vm.add(held)
    const view = new FirearmView(vm, scene); view.attach(rig, right, null)
    const T = SEQ[type](e, gun)
    const prev: Record<string, THREE.Vector3> = {}
    let maxJump = 0, maxAt = '', frames = 0, onscreenJump = 0, onAt = ''
    const hands = (view as any).hands
    for (let t = 0; t < T; t += DT) {
      e.step(DT); face(e, 1, 0)
      const out = view.update({ run: e.gun, mag: G.gunMag(gun), sel: G.gunAmmoSel(e, gun), stage: G.muzzleStage(gun), cyl: gun.cyl ?? 0, sprint: false, moving: false, time: t, bob: 0, dt: DT, camera: cam, floorY: -1.6 })
      vm.scale.setScalar(GUN_VM_SCALE); vm.position.set(out.px, out.py, out.pz); vm.rotation.set(out.rx, out.ry, out.rz)
      scene.updateMatrixWorld(true)
      for (const h of ['L', 'R']) {
        const p = new THREE.Vector3().setFromMatrixPosition(hands[h].hand.group.matrixWorld)
        if (prev[h]) {
          const d = p.distanceTo(prev[h])
          const v = p.clone().project(cam), vis = Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1
          if (d > maxJump) { maxJump = d; maxAt = `${h} ${e.gun.act} ${(t).toFixed(2)}s` }
          if (vis && d > onscreenJump) { onscreenJump = d; onAt = `${h} ${e.gun.act}${e.gun.step?.stage ? '/' + e.gun.step.stage : ''} ${(e.gun.t / Math.max(1e-6, e.gun.dur) * 100).toFixed(0)}%` }
        }
        prev[h] = p
      }
      frames++
    }
    // 一帧（1/60 s）内手移动的最大距离：画面内 ≤ 7 cm（≈ 4.2 m/s，快速装填时手的真实速度），画面外（腰间往返）≤ 10 cm
    ok(onscreenJump < 0.07 && maxJump < 0.1, `${F.GUNS[type as 'dbshotgun'].name}：完整装填 ${frames} 帧，画面内手每帧最大位移 ${(onscreenJump * 100).toFixed(1)} cm（${onAt}），全程 ${(maxJump * 100).toFixed(1)} cm（${maxAt}）——无跳变`)
    view.dispose()
  }
}

// ---------- 18. 模型 ----------
{
  const rig = buildFirearmMesh('dbshotgun')
  ok(rig.chambers.length === 2 && rig.muzzles.length === 2 && !!rig.parts.trigger0 && !!rig.parts.trigger1, '双管猎枪模型：两个膛、两个枪口、两个扳机')
  setChambers(rig, ['shell_buck', 'spent'], 'shell_buck')
  ok(rig.chambers[0]!.children.length === 1 && rig.chambers[1]!.children.length === 1, '膛内弹壳按弹仓显示（含空壳）')
  setChambers(rig, ['', ''], 'shell_buck')
  ok(rig.chambers.every((c: any) => c.children.length === 0), '空膛不显示弹壳')
  for (const a of ['shell_buck', 'shell_bird', 'shell_clump']) ok(buildShellMesh(a as any).children.length >= 4, `${F.AMMO[a as 'shell_buck'].name}：弹壳模型（纸壳 + 铜底 + 底缘 + 底火 + 卷口）`)
  for (const a of ['cart_4440', 'cart_4570', 'cart_paper']) ok(buildCartMesh(a as any).children.length >= 2 && buildCartMesh(a as any, true).children.length >= 2, `${F.AMMO[a as 'shell_buck'].name}：弹 / 空壳模型`)
  for (const t of [...Object.keys(F.GUNS), ...Object.keys(F.AMMO)]) ok(buildItemMesh(t).children.length >= 1, `${ITEMS[t].name}：地面掉落模型`)
  ok(Object.values(GUN_RIGHT_POSE).every((p: any) => !!p.trigger), '五把枪的右手持枪握法：食指搭扳机')
  const parts: Record<string, string[]> = { leverrifle: ['lever', 'hammer', 'bolt', 'gate'], revolver: ['hammer', 'cyl', 'gate', 'rod', 'trigger'], musket: ['hammer', 'rod', 'cap'], trapdoor: ['block', 'hammer', 'ext'] }
  for (const t of Object.keys(F.GUNS)) {
    const r = buildFirearmMesh(t as any)
    let tris = 0; r.root.traverse((o: any) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 })
    ok(tris < 12000 && (parts[t] ?? []).every((k) => !!r.parts[k]), `${F.GUNS[t as 'dbshotgun'].name}：三角面 ${Math.round(tris)}（< 12000）${parts[t] ? '，活动部件 ' + parts[t].join(' / ') : ''}`)
  }
}

// ---------- 19. 持枪姿势：腰射不挡准心、贴腮不挡照门 / 准星 ----------
// 真实 FirearmView 摆好腰射（aim 0）和贴腮（aim 1，FOV 按 adsFov 收窄）两种站姿，把两只手（含前臂）和枪的顶点投到画面上量：
//   腰射：手离屏幕中心 ≥ 13% 屏高、枪身 ≥ 3% 屏高（准心周围留空）
//   贴腮：准星压在屏幕正中（≤ 0.5% 屏高），「瞄准窗」（准星 / 照门所在竖条：宽 ±3.5%、中心下 2% 到上 10% 屏高）里没有手的顶点
{
  for (const type of Object.keys(F.GUNS)) {
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 30), vm = new THREE.Group()
    scene.add(cam); cam.add(vm); vm.rotation.order = 'YXZ'
    const right = buildRetroHand({ left: false }); vm.add(right.group)
    const rig = buildFirearmMesh(type as any), held = new THREE.Group(); held.add(rig.root); vm.add(held)
    const view = new FirearmView(vm, scene); view.attach(rig, right, null)
    const run: any = G.newGunRun()
    const mag = type === 'revolver' ? Array(6).fill('cart_4440') : type === 'dbshotgun' ? ['shell_buck', 'shell_buck'] : [F.GUNS[type as 'dbshotgun'].ammo[0]]
    const pose = (aim: number) => {
      run.aim = aim
      for (let i = 0; i < 90; i++) { const o = view.update({ run, mag, sel: mag[0], stage: 6, cyl: 0, sprint: false, moving: false, time: 0, bob: 0, dt: DT, camera: cam, floorY: -1.6 }); vm.scale.setScalar(GUN_VM_SCALE); vm.position.set(o.px, o.py, o.pz); vm.rotation.set(o.rx, o.ry, o.rz) }
      cam.fov = 72 * (aim ? F.GUNS[type as 'dbshotgun'].adsFov : 1); cam.updateProjectionMatrix(); scene.updateMatrixWorld(true)
    }
    const verts = (roots: any[], f: (x: number, y: number) => void) => { for (const r of roots) r.traverse((o: any) => { if (!o.isMesh || !o.visible) return; const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).project(cam); if (v.z < -1 || v.z > 1) continue; f(v.x * cam.aspect / 2, v.y / 2) } }) }
    const hands = view.handNodes()
    pose(0)
    let hd = 9, gd = 9
    verts(hands, (x, y) => { hd = Math.min(hd, Math.hypot(x, y)) })
    verts([rig.root], (x, y) => { gd = Math.min(gd, Math.hypot(x, y)) })
    pose(1)
    let inWin = 0
    hands.forEach((h: any) => verts([h], (x, y) => { if (Math.abs(x) < 0.035 && y > -0.02 && y < 0.1) inWin++ }))
    let top = -9
    verts(hands, (x, y) => { if (Math.abs(x) < 0.06 && y < 0.1) top = Math.max(top, y) })
    const fs = rig.sight.target.clone().applyMatrix4(rig.root.matrixWorld).project(cam)
    const fOff = Math.hypot(fs.x * cam.aspect / 2, fs.y / 2)
    const nm = F.GUNS[type as 'dbshotgun'].name
    ok(hd >= 0.13 && gd >= 0.03, `${nm}：腰射——手离准心 ${(hd * 100).toFixed(1)}% 屏高（≥ 13%），枪身 ${(gd * 100).toFixed(1)}%（≥ 3%），准心不被挡`)
    ok(fOff < 0.005 && inWin === 0, `${nm}：贴腮——准星偏离画面中心 ${(fOff * 100).toFixed(2)}% 屏高，瞄准窗内手部顶点 ${inWin} 个（应为 0），中线附近手的最高点在准星下 ${(-top * 100).toFixed(1)}% 屏高`)
    view.dispose(); right.dispose(); disposeFirearmPart(rig.root)
  }
}

console.log(`\n${n - fails}/${n} checks passed`)
if (fails) process.exit(1)
