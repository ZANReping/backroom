/* eslint-disable @typescript-eslint/no-explicit-any */
// Focused integration regression: real Engine APIs, with the same canvas shim as check-melee.
import { createCanvas } from '@napi-rs/canvas'
const memory = new Map<string, string>()
Object.assign(globalThis, { window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }, document: { createElement: (tag: string) => tag === 'canvas' ? createCanvas(256, 256) : ({ getContext: () => null, style: {} }), createElementNS: () => ({ addEventListener() {}, removeEventListener() {} }), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } }, localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) } })
const { Engine } = await import('../src/game/engine')
const { audio } = await import('../src/game/core/audio')
const M = await import('../src/game/engine/melee')
const C = await import('../src/game/content/melee')
const { ITEMS } = await import('../src/game/content/items')
const { snapshot } = await import('../src/game/engine/save')
const { genL4ChunkRaw } = await import('../src/game/world/infiniteL4')
const { snapshotChunkState } = await import('../src/game/world/infinite')
const { L4 } = await import('../src/game/levels/l4')
const { wranglerAmbient, wranglerForceFrame } = await import('../src/game/engine/wranglerAI')
for (const k of ['aggro','hit','swing','hurt','pickup','uiTick','clang','spark','searchTick','scrape','whisper'] as const) (audio as any)[k] = () => {}
let fails = 0, n = 0
const ok = (v: unknown, m: string) => { n++; console.log(`${v ? '✔' : '✘'} ${m}`); if (!v) fails++ }
function fresh(level = 0) { const e: any = new Engine(); e.seed = 701; e.loadLevel(level, { mapSeed: 701, firstVisit: true }); e.introT = 0; e.dev.god = true; e.dev.frozenAI = true; e.player.hotbar.fill(null); e.player.backpack.fill(null); return e }

// 1. Legacy inventory normalization and independent durability.
{ const e = fresh(); e.player.hotbar[0] = { type: 'timber', count: 1, dur: 2 } as any; e.player.hotbar[1] = { type: 'timber', count: 1, dur: 17 } as any; const moved = e.moveSlot({ w: 'hotbar', i: 0 }, { w: 'hotbar', i: 1 }); const a: any = e.player.hotbar[0], b: any = e.player.hotbar[1]; ok(moved && a?.type === 'timber' && b?.type === 'timber' && a.dur === 17 && b.dur === 2 && a.count === 1 && b.count === 1, 'Engine.moveSlot 交换不同耐久 timber：不合并、不丢失'); e.player.hotbar[2] = { type: 'timber', count: 3 } as any; M.normalizeMeleeInventory(e); const ts = [...e.player.hotbar, ...e.player.backpack].filter((s: any) => s?.type === 'timber'); ok(ts.length === 5 && ts.every((s: any) => s.count === 1), '旧 timber 堆叠展开为每格一件且数量守恒'); ok(M.slotDur({ type: 'crowbar', count: 1 } as any) === C.MELEE.crowbar.maxDur, '旧 InvSlot 缺 dur 按满耐久处理'); ok(ts.some((s: any) => s.dur === 17), '展开保留已有耐久') }

// 2. Drop/pickup through Engine interaction path preserves durability and blood.
{ const e = fresh(); e.player.hotbar[0] = { type: 'axe', count: 1, dur: 0, blood: .73 } as any; e.dropSlot('hotbar', 0); const it: any = e.map.items.find((x: any) => x.type === 'axe'); ok(!!it && it.dur === 0 && it.blood === .73, '真实 dropSlot 保留 dur=0 与 blood'); e.player.x = it.x; e.player.y = it.y; e.player.facing = 0; e.scanInteract(); e.doInteract(); const got = [...e.player.hotbar, ...e.player.backpack].find((s: any) => s?.type === 'axe'); ok(!!got && got.dur === 0 && got.blood === .73, '真实 scan/doInteract 拾取保留残件状态') }

// 3. Repair cancellation and completion use real Engine methods.
{ const e = fresh(); const s: any = e.player.hotbar[0] = { type: 'timber', count: 1, dur: 1 }; e.player.backpack[0] = { type: 'nails', count: 1 }; e.quickUse(); ok(e.usingItem?.label === '修理', 'quickUse 开始修理'); e.player.selected = 1; e.updateItemUse(10); ok(s.dur === 1 && e.player.backpack[0]?.count === 1, '切换槽位中断修理且不耗材料'); e.player.selected = 0; e.quickUse(); e.updateItemUse(C.REPAIR_TIME + .01); ok(s.dur === Math.ceil(C.MELEE.timber.maxDur * C.REPAIR_TO) && !e.player.backpack[0], '正常完成修理到 50% 且消耗一件材料') }
{ const e = fresh(); const a: any = e.player.hotbar[0] = { type: 'timber', count: 1, dur: 1 }; const b: any = { type: 'timber', count: 1, dur: 0 }; e.player.backpack[0] = { type: 'nails', count: 1 }; e.quickUse(); e.player.hotbar[0] = b; e.updateItemUse(C.REPAIR_TIME + 1); ok(a.dur === 1 && b.dur === 0 && e.player.backpack[0]?.count === 1 && !e.usingItem, '修理同槽位替换为另一件残件：按对象身份取消、不耗钉子') }

// 4. Locked/stowed input cancels pending swing before damage.
{ const e: any = fresh(); e.player.hotbar[0] = { type: 'crowbar', count: 1 }; e.player.selected = 0; e.meleePending = { t: 0, kind: 'crowbar', heavy: false, charge: 0, slot: e.player.hotbar[0] }; e.meleePress = true; M.updateMeleeInput(e, 1 / 60, true); ok(!e.meleePending && !e.meleePress && e.meleeCharge === 0, 'locked 取消前摇 pending'); e.meleePending = { t: 0, kind: 'crowbar', heavy: false, charge: 0, slot: e.player.hotbar[0] }; e.handsStowed = true; M.updateMeleeInput(e, 1 / 60, false); ok(!e.meleePending, 'handsStowed 取消前摇 pending') }

// 5. Snapshot is JSON round-trippable and preserves melee fields/version.
{ const e: any = fresh(); e.player.hotbar[0] = { type: 'axe', count: 1, dur: 0, blood: .42 }; const s: any = JSON.parse(JSON.stringify(snapshot(e))); const p = s.player.hotbar[0]; ok(s.v === 1 && p.dur === 0 && p.blood === .42, 'snapshot/JSON 恢复保留 player dur、blood 且 v=1') }

// 6. L4 raw generation exposes watercooler state; chunk snapshot retains interaction state.
{ let cool: any = null, raw: any = null; for (let cy = -3; cy <= 3 && !cool; cy++) for (let cx = -3; cx <= 3 && !cool; cx++) { raw = genL4ChunkRaw(L4 as any, 701, cx, cy); cool = raw.structures?.find((s: any) => s.kind === 'watercooler') } ok(!!cool && cool.data?.water === 4, 'L4 chunk 生成饮水机并带 water 剩余量'); if (cool) { cool.data.water = 2; const m: any = { structures: [cool], items: [], entities: [], inf: { ox: 0, oy: 0 }, w: 32, h: 32 }; const c: any = { structures: [cool], items: [], entities: [], lights: [], exits: [], cx: 0, cy: 0, key: '0,0' }; const st: any = snapshotChunkState(m, c); ok(st.structs.some((x: any) => x.data?.water === 2), 'snapshotChunkState 保存饮水机 water 状态') } }

// 7. Wrangler frame helpers are callable on a real Engine after player/map changes.
{ const e: any = fresh(2); const before: any = wranglerForceFrame(e); before.black = 1; before.captor = 123; before.holes.push({ id: 1 }); before.eggs.push({ id: 1 }); e.player = { ...e.player }; e.map = { ...e.map }; const after: any = wranglerForceFrame(e); ok(after !== before && after.black === 0 && after.captor === undefined && after.holes.length === 0 && after.eggs.length === 0, '牧蛇换 player/map 后重建新 frame：清理黑屏、捕获、洞口与卵枝') }

console.log(`check:l4-melee-wrangler-integration ${n - fails}/${n}`)
if (fails) process.exit(1)
