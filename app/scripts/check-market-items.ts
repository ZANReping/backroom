/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// 批发市场 v2 新物品——机制无头验收（真实 Engine）。运行：npm run check:market-items
import { createCanvas } from '@napi-rs/canvas'
const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256) },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const { audio } = await import('../src/game/core/audio')
const { ITEMS, itemUseProfile } = await import('../src/game/content/items')
const { SQUIRT_CAP } = await import('../src/game/engine/combat')
for (const k of Object.keys(audio)) if (typeof (audio as any)[k] === 'function') (audio as any)[k] = () => {}
let fails = 0, n = 0
const ok = (c: unknown, m: string) => { n++; console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
function fresh() {
  const eng: any = new Engine()
  eng.emit = () => {}; eng.persist = () => {}
  const msgs: string[] = []; eng.msg = (t: string) => { msgs.push(t) }
  const p = eng.player
  p.hotbar = p.hotbar.map(() => null); p.backpack = p.backpack.map(() => null)
  p.hp = 20; p.sanity = 80
  const useNow = (i: number) => { const started = eng.useSlot('hotbar', i); if (started) { for (let t = 0; t < 4 && eng.usingItem; t += .1) eng.updateItemUse(.1) } }
  return { eng, p, msgs, useNow }
}
// 医疗箱：多次使用、每次回血止血、次数用完才移除、不与同类堆叠
for (const [type, uses, heal] of [['outdoorkit', 4, 30], ['traumakit', 8, 40]] as const) {
  const { eng, p, msgs, useNow } = fresh()
  eng.addItem(type); eng.addItem(type)
  ok(p.hotbar[0]?.type === type && p.hotbar[1]?.type === type && p.hotbar[0].count === 1, `${ITEMS[type].name}：两只各占一格（不堆叠）`)
  ok(itemUseProfile(ITEMS[type])?.anim === 'medical', `${ITEMS[type].name}：医疗动作`)
  p.player = p; p.selected = 0
  useNow(0)
  ok(p.hp === 20 + heal && p.hotbar[0]?.dur === uses - 1, `${ITEMS[type].name}：第 1 次生命 +${heal}，剩 ${p.hotbar[0]?.dur}/${uses}`)
  for (let k = 1; k < uses - 1; k++) { p.hp = 10; useNow(0) }
  ok(p.hotbar[0]?.dur === 1, `${ITEMS[type].name}：用到剩 1 次仍在原格`)
  p.hp = 10; useNow(0)
  ok(!p.hotbar[0] && p.hotbar[1]?.type === type && msgs.some(m => m.includes('用完')), `${ITEMS[type].name}：第 ${uses} 次后移除，另一只不受影响`)
  // 丢下再捡起保留剩余次数
  p.hp = 10; useNow(1)
  const left = p.hotbar[1].dur
  eng.map = { items: [], inf: null } as any
  eng.dropSlot('hotbar', 1)
  const g = eng.map.items[0]
  ok(g?.dur === left, `${ITEMS[type].name}：丢在地上保留剩余次数 ${g?.dur}`)
  eng.addItem(type, { dur: g.dur })
  ok(p.hotbar.find((s: any) => s?.type === type)?.dur === left, `${ITEMS[type].name}：捡回后剩余次数不变`)
}
// 盒装火盐：分解为 5 份火盐；空间不足时不拆
{
  const { eng, p, msgs } = fresh()
  eng.addItem('saltbox'); eng.addItem('saltbox')
  ok(p.hotbar[0]?.type === 'saltbox' && p.hotbar[0].count === 2, '盒装火盐：可堆叠')
  ok(eng.unpackSaltBox('hotbar', 0) && eng.countItem('firesalt') === 5 && p.hotbar[0]?.count === 1, '分解 1 盒 → 5 份火盐晶体，剩 1 盒')
  eng.useSlot('hotbar', 0)
  ok(eng.countItem('firesalt') === 10 && eng.countItem('saltbox') === 0, '「使用」同样分解；共 10 份火盐')
  // 塞满背包后不拆
  const r = fresh(); for (let i = 0; i < r.p.hotbar.length; i++) r.p.hotbar[i] = { type: 'canned', count: 3 }
  for (let i = 0; i < r.p.backpack.length; i++) r.p.backpack[i] = { type: 'canned', count: 3 }
  r.p.hotbar[0] = { type: 'saltbox', count: 2 }
  ok(!r.eng.unpackSaltBox('hotbar', 0) && r.p.hotbar[0].count === 2 && r.msgs.some(m => m.includes('空间不足')), '背包放不下 5 份时拒绝分解，盒子不丢')
  void msgs
}
// 记忆汁液 / 驱笑剂：装入滋水枪等效清水
for (const liquid of ['memoryjuice', 'laughrepellent'] as const) {
  const { eng, p } = fresh()
  eng.addItem('squirtgun'); eng.addItem(liquid); eng.addItem(liquid)
  ok(eng.loadSquirt(liquid) && eng.squirtTank === liquid && eng.squirtAmmo === 3 && eng.countItem(liquid) === 1, `${ITEMS[liquid].name}：装入消耗 1 瓶，储罐 3 份`)
  ok(!eng.loadSquirt('almond'), `${ITEMS[liquid].name}：储罐不能混装其它液体`)
  const s0 = p.sanity, h0 = p.hp
  eng.useSlot('hotbar', 0); for (let t = 0; t < 3 && eng.usingItem; t += .1) eng.updateItemUse(.1)
  ok(p.sanity === s0 && p.hp === h0 && eng.squirtAmmo === 2, `${ITEMS[liquid].name}：自饮无效果（同清水）`)
  ok(eng.squirtAmmo <= SQUIRT_CAP, '储罐容量不变')
}
// 巴别润唇膏：暂无功能
{
  const { eng, msgs } = fresh(); eng.addItem('babelbalm'); eng.useSlot('hotbar', 0)
  ok(eng.countItem('babelbalm') === 1 && msgs.some(m => m.includes('无法直接使用')), '巴别润唇膏：暂无功能，使用不消耗')
}
console.log(`\nmarket items: ${n - fails}/${n} passed`)
if (fails) process.exit(1)
