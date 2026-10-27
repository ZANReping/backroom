// 阵营寄存仓库界面 v2 验收：分量存取、同类一键、整理、满仓/满包原子性、件数守恒、界面接线与两套皮肤。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ITEMS } from '../src/game/content/items'
import { NPCS } from '../src/game/content/npcs'
import { L11_PEOPLE } from '../src/game/content/l11People'
import { audio } from '../src/game/core/audio'
import { slotGet, slotSet, countItem } from '../src/game/engine/inventory'
import * as W from '../src/game/engine/warehouse'
import type { Engine, InvSlot } from '../src/game/engine'
audio.uiTick = () => {}; audio.pickup = () => {}
const checks: string[] = []
const ok = (c: unknown, m: string) => { assert(c, m); checks.push(m) }

function mk(): Engine {
  const e = {
    player: { hotbar: new Array(7).fill(null), backpack: new Array(24).fill(null), equip: { offhand: null, body: null, gloves: null, head: null, pocket: null } },
    warehouses: W.freshWarehouses(), warehouseTempUnlock: new Set(), rep: { meg: 20, bntg: 0 },
    msg() {}, syncPassives() {},
  } as unknown as Engine
  e.slotGet = (r) => slotGet(e, r); e.slotSet = (r, v) => slotSet(e, r, v); e.countItem = (t) => countItem(e, t)
  return e
}
const total = (e: Engine, t: string) => countItem(e, t) + e.warehouses.meg.reduce((n, s) => n + (s && s.type === t ? s.count : 0), 0)
const stackable = Object.values(ITEMS).find((d) => d.stack >= 10)!.type
const single = Object.values(ITEMS).find((d) => d.stack === 1 && !d.equip)!.type

// 1. 分量寄存 / 取回
{
  const e = mk(); e.player.backpack[0] = { type: stackable, count: 9 }
  ok(W.warehouseDepositN(e, 'meg', { w: 'backpack', i: 0 }, 4), '分量寄存成功')
  ok(e.player.backpack[0]?.count === 5 && e.warehouses.meg.filter(Boolean).length === 1 && e.warehouses.meg[0]?.count === 4, '寄存 4 件：背包剩 5，仓库 1 格 4 件')
  ok(W.warehouseDepositN(e, 'meg', { w: 'backpack', i: 0 }, 3) && e.warehouses.meg[0]?.count === 7 && e.warehouses.meg.filter(Boolean).length === 1, '再存 3 件并进同一格')
  ok(W.warehouseWithdrawN(e, 'meg', 0, 2) && e.warehouses.meg[0]?.count === 5 && countItem(e, stackable) === 4, '分量取回 2 件：先并摞进背包已有格')
  ok(total(e, stackable) === 9, '分量存取件数守恒')
  ok(W.warehouseDepositN(e, 'meg', { w: 'backpack', i: 0 }) && !e.player.backpack[0], 'n 缺省 = 整格寄存')
}
// 2. 满仓 / 满包原子性
{
  const e = mk()
  for (let i = 0; i < W.WAREHOUSE_SIZE; i++) e.warehouses.meg[i] = { type: single, count: 1 }
  e.player.backpack[0] = { type: stackable, count: 6 }
  const snap = JSON.stringify([e.warehouses, e.player.backpack])
  ok(!W.warehouseDepositN(e, 'meg', { w: 'backpack', i: 0 }, 3) && JSON.stringify([e.warehouses, e.player.backpack]) === snap, '满仓时分量寄存失败且两边都不变')
  const f = mk(); f.warehouses.meg[0] = { type: stackable, count: 6 }
  for (let i = 0; i < 7; i++) f.player.hotbar[i] = { type: single, count: 1 }
  for (let i = 0; i < 24; i++) f.player.backpack[i] = { type: single, count: 1 }
  const snap2 = JSON.stringify([f.warehouses, f.player])
  ok(!W.warehouseWithdrawN(f, 'meg', 0, 2) && JSON.stringify([f.warehouses, f.player]) === snap2, '满包时分量取回失败且两边都不变')
  ok(!W.warehouseDepositN(f, 'meg', { w: 'body', i: 0 }, 1), '装备位物品不能寄存')
}
// 3. 同类一键
{
  const e = mk(); e.player.hotbar[2] = { type: stackable, count: 3 }; e.player.backpack[5] = { type: stackable, count: 4 }; e.player.backpack[6] = { type: single, count: 1 }
  ok(W.warehouseDepositAllOf(e, 'meg', stackable) === 7 && countItem(e, stackable) === 0 && countItem(e, single) === 1, '同类一键寄存：只动这一类，7 件全进库')
  ok(W.warehouseWithdrawAllOf(e, 'meg', stackable) === 7 && countItem(e, stackable) === 7 && !e.warehouses.meg.some((s) => s?.type === stackable), '同类一键取回：7 件全部回到身上')
}
// 4. 整理：并摞 + 分类排序 + 守恒
{
  const e = mk(); const wh = e.warehouses.meg
  const types = Object.values(ITEMS).slice(0, 40).map((d) => d.type)
  types.forEach((t, i) => { wh[i] = { type: t, count: 1 } as InvSlot })
  wh[45] = { type: stackable, count: 2 }; wh[47] = { type: stackable, count: 3 }
  const before = new Map<string, number>(); wh.forEach((s) => s && before.set(s.type, (before.get(s.type) ?? 0) + s.count))
  W.warehouseSort(e, 'meg')
  const after = new Map<string, number>(); wh.forEach((s) => s && after.set(s.type, (after.get(s.type) ?? 0) + s.count))
  ok(JSON.stringify([...before].sort()) === JSON.stringify([...after].sort()), '整理前后每种物品件数不变')
  ok(wh.filter((s) => s?.type === stackable).length === 1, '整理会把同类并成一摞')
  const firstNull = wh.findIndex((s) => !s)
  ok(firstNull < 0 || wh.slice(firstNull).every((s) => !s), '整理后空栏都在最后')
  const order = ['weapon', 'med', 'food', 'power', 'gear', 'misc']
  const cats = wh.filter(Boolean).map((s) => order.indexOf(W.warehouseCat(s!.type)))
  ok(cats.every((c, i) => i === 0 || c >= cats[i - 1]), '整理后按 武器→医疗→食水→电源→装备→杂项 排列')
}
// Additional edge cases found while integrating with the current inventory/gun system.
const snapshot = (e: Engine) => JSON.stringify([e.player, e.warehouses])
{
  const e=mk(),stack=ITEMS[stackable].stack
  e.warehouses.meg.fill(null);e.warehouses.meg.forEach((_,i)=>e.warehouses.meg[i]={type:single,count:1})
  e.warehouses.meg[0]={type:stackable,count:stack-1};e.player.backpack[0]={type:stackable,count:6}
  const before=snapshot(e)
  ok(!W.warehouseDeposit(e,'meg',{w:'backpack',i:0})&&snapshot(e)===before,'整格寄存也保持原子性：只有 1 件并摞余量时不先移动 1 件')
  ok(!W.warehouseDepositN(e,'meg',{w:'backpack',i:0},3)&&snapshot(e)===before,'分量超过剩余并摞容量时，两边完全不变')
  const f=mk();f.player.hotbar.fill(null);f.player.hotbar.forEach((_,i)=>f.player.hotbar[i]={type:single,count:1});f.player.backpack.fill(null);f.player.backpack.forEach((_,i)=>f.player.backpack[i]={type:single,count:1})
  f.player.hotbar[0]={type:stackable,count:stack-1};f.warehouses.meg[0]={type:stackable,count:6}
  const original=snapshot(f)
  ok(!W.warehouseWithdraw(f,'meg',0)&&snapshot(f)===original,'整格取回在并摞余量不足时不先移动一部分')
}
{
  const e=mk();e.player.backpack[0]={type:stackable,count:9};e.warehouses.meg[0]={type:stackable,count:9}
  for(const n of [NaN,Infinity,-1,0,1.5]){
    const before=snapshot(e)
    ok(!W.warehouseDepositN(e,'meg',{w:'backpack',i:0},n)&&!W.warehouseWithdrawN(e,'meg',0,n)&&snapshot(e)===before,`非法数量 ${String(n)} 不改变数量`)
  }
}
{
  const e=mk(),stack=ITEMS[stackable].stack
  e.warehouses.meg.forEach((_,i)=>e.warehouses.meg[i]={type:single,count:1});e.warehouses.meg[0]={type:stackable,count:stack-2};e.player.hotbar[0]={type:stackable,count:9}
  ok(W.warehouseDepositAllOf(e,'meg',stackable)===2&&e.player.hotbar[0]?.count===7&&e.warehouses.meg[0]?.count===stack,'同类一键精确存入仍能放下的 2 件')
  const f=mk();f.player.hotbar.forEach((_,i)=>f.player.hotbar[i]={type:single,count:1});f.player.backpack.forEach((_,i)=>f.player.backpack[i]={type:single,count:1});f.player.hotbar[0]={type:stackable,count:stack-2};f.warehouses.meg[0]={type:stackable,count:9}
  ok(W.warehouseWithdrawAllOf(f,'meg',stackable)===2&&f.warehouses.meg[0]?.count===7,'同类一键精确取回仍能放下的 2 件')
}
{
  const e=mk();const gun:InvSlot={type:'revolver',count:1,mag:['cart_4440','spent','','cart_4440','',''],ammoSel:'cart_4440',stage:2,cyl:3}
  e.player.backpack[0]=gun
  ok(W.warehouseDeposit(e,'meg',{w:'backpack',i:0})&&JSON.stringify(e.warehouses.meg[0])===JSON.stringify(gun),'已装弹枪械寄存保留弹仓、选弹、装填阶段及转轮位置')
  gun.mag![0]='';ok(e.warehouses.meg[0]?.mag?.[0]==='cart_4440','寄存后的枪械弹仓数组独立于已移除的原引用')
  const expected=JSON.stringify(e.warehouses.meg[0]);ok(W.warehouseWithdraw(e,'meg',0)&&JSON.stringify(e.player.hotbar[0])===expected,'枪械取回不丢失任何已保存字段')
  e.player.backpack[0]={type:'outdoorkit',count:1,dur:1};W.warehouseDeposit(e,'meg',{w:'backpack',i:0});W.warehouseSort(e,'meg');W.warehouseWithdraw(e,'meg',e.warehouses.meg.findIndex(s=>s?.type==='outdoorkit'))
  ok([...e.player.hotbar,...e.player.backpack].find(s=>s?.type==='outdoorkit')?.dur===1,'用过的医疗箱存取与整理保留剩余次数')
}
{
  const e=mk();e.warehouses.meg[0]={type:'warpberry',count:1,tag:0};e.warehouses.meg[1]={type:'warpberry',count:1,tag:11};e.warehouses.meg[2]={type:stackable,count:2,dur:1};e.warehouses.meg[3]={type:stackable,count:3,dur:2}
  ok(W.warehouseSort(e,'meg')&&e.warehouses.meg.filter(s=>s?.type==='warpberry').length===2,'不同来源层级的迁跃浆果整理后仍分开')
  ok(e.warehouses.meg.filter(s=>s?.type===stackable&&s.dur!==undefined).length===2,'带不同状态的堆叠物品不因整理合并丢失状态')
  ok(e.warehouses.bntg.every(s=>!s),'整理 M.E.G. 不改动 B.N.T.G. 库存')
}
{
  const e=mk();e.warehouses.meg[0]={type:stackable,count:ITEMS[stackable].stack*49};const before=snapshot(e)
  ok(!W.warehouseSort(e,'meg')&&snapshot(e)===before,'旧数据超过容量时整理失败，不截断或丢弃物品')
}

{
  const e=mk();e.rep.meg=10;e.rep.bntg=10
  const defs=[...Object.values(NPCS),...L11_PEOPLE].filter(n=>n.warehouse)
  ok(defs.every(n=>W.warehouseOfNpc(n.id)===n.warehouse&&W.canUseWarehouse(e,n.id)),'七位已注册仓管均识别权限，包含 L11 Beta 与新时代广场')
  e.rep.meg=0;e.rep.bntg=0
  ok(defs.every(n=>!W.canUseWarehouse(e,n.id)),'低声望且无临时通行时，各仓管均拒绝权限')
  e.warehouseTempUnlock.add('bntg')
  ok(defs.filter(n=>n.warehouse==='bntg').every(n=>W.canUseWarehouse(e,n.id))&&defs.filter(n=>n.warehouse==='meg').every(n=>!W.canUseWarehouse(e,n.id)),'BNTG 临时通行不能打开 MEG 仓库')
  ok(W.warehouseCat('cart_4440')==='weapon'&&W.warehouseCat('revolver')==='weapon','枪械与弹药归入武器分类')
}

// 5. 界面接线
const dlg = readFileSync('src/components/DialogOverlay.tsx', 'utf8')
const ui = readFileSync('src/components/warehouse/WarehouseOverlay.tsx', 'utf8')
const css = readFileSync('src/components/warehouse/WarehouseOverlay.css', 'utf8')
ok(/mode === 'warehouse' && def\.warehouse\) return <WarehouseOverlay/.test(dlg), '对话里的「寄存物品」打开整屏仓库页面')
ok(!dlg.includes('点下方背包物品寄存'), '旧的对话框内仓库面板已移除')
ok(dlg.includes('warehouseTempUnlock.clear()'), '临时通行仍随对话窗卸载清空')
ok(ui.includes('warehouseDepositN') && ui.includes('warehouseWithdrawN') && ui.includes('onDrop') && ui.includes('onDoubleClick'), '界面支持分量、拖拽、双击')
ok(/\.wh--meg /.test(css) && /\.wh--bntg /.test(css), '两套阵营皮肤（M.E.G. 物资库 / B.N.T.G. 保管箱）')
ok(/@media \(max-width:860px\)/.test(css), '窄屏（手机）单列布局')
const whNpcs = [...Object.values(NPCS), ...L11_PEOPLE].filter((d) => d.warehouse)
ok(whNpcs.some((d) => d.warehouse === 'meg') && whNpcs.some((d) => d.warehouse === 'bntg'), `寄存 NPC 两个阵营都有（${whNpcs.length} 人）`)

console.log(checks.map((c) => '✓ ' + c).join('\n'))
console.log(`\n${checks.length}/${checks.length} checks passed`)
