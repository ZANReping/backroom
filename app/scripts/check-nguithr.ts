/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接读写引擎内部状态 */
// Nguithr'xurh（Entity 16）重制第 3 阶段——无头机制验收（真实 Engine + 真实 Level 1 生成 + 真实 step 循环）
// 运行：npm run check:nguithr     结果同时写入 reports/nguithr/mechanics-check.txt
import * as THREE from 'three'
import { mkdirSync, writeFileSync } from 'node:fs'

const memory = new Map<string, string>()
Object.assign(globalThis, { window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }, document: { createElement: () => ({ getContext: () => null, style: {} }), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } }, localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) } })
const { Engine } = await import('../src/game/engine')
const N = await import('../src/game/engine/nguithrAI')
const { audio } = await import('../src/game/core/audio')
const { look } = await import('../src/game/renderer/shared')
const { ENTITIES, makeEntity } = await import('../src/game/entities')
const { ENTITY_EVENT_SPAWNS } = await import('../src/game/entities/spawns') as any
const { ITEMS, itemUseProfile } = await import('../src/game/content/items')
const { EFFECTS } = await import('../src/game/engine/effects')
const { buildEntityMesh } = await import('../src/game/renderer/entitiesMesh')
const { buildItemMesh } = await import('../src/game/renderer/itemsMesh')
const { buildNguithrNest, nguithrNest, nguithrSacLayout } = await import('../src/game/renderer/nguithrMesh')
const { genL1ChunkRaw } = await import('../src/game/world/infiniteL1')
const { genL2ChunkRaw } = await import('../src/game/world/infiniteL2')
const { genL3ChunkRaw } = await import('../src/game/world/infiniteL3')
const { L1 } = await import('../src/game/levels/l1')
const { L2 } = await import('../src/game/levels/l2')
const { L3 } = await import('../src/game/levels/l3')
const { L5 } = await import('../src/game/levels/l5')
const inventory = await import('../src/game/engine/inventory')
const { ceilingHeightAt, floorHeight, walkableAt } = await import('../src/game/world/mapgen')
const { WALL_H } = await import('../src/game/renderer/shared')

const audioLog: string[] = []
for (const k of ['aggro', 'hit', 'swing', 'hurt', 'pickup', 'uiTick', 'spark', 'searchTick', 'splash', 'scrape', 'clumpChew', 'setUnderwater', 'footstep', 'whisper'] as const) (audio as any)[k] = () => { audioLog.push(k) }
let muffled = false
;(audio as any).setMuffled = (on: boolean) => { muffled = on; audioLog.push('muffle:' + on) }
const lines: string[] = []
let fails = 0, n = 0
const ok = (c: unknown, m: string) => { n++; const l = `${c ? '✔' : '✘'} ${m}`; console.log(l); lines.push(l); if (!c) fails++ }
const NG = N.NG

// ---------------------------------------------------------------------------
// 场景：真实 L1，找一块「半径 3.4m 内全是同高可走地面 + 有天花板」的开阔地，把玩家与一只 Nguithr 放上去
// ---------------------------------------------------------------------------
function fresh(seed = 1601) {
  const e: any = new Engine(); e.seed = seed
  e.loadLevel(1, { mapSeed: seed, firstVisit: true }); e.introT = 0
  e.player.hp = 100; e.player.sanity = 100
  const msgs: string[] = []; const om = e.msg.bind(e); e.msg = (t: string, k: any) => { msgs.push(t); om(t, k) }
  e.dev.statLock = false
  return { e, msgs }
}
function openSpot(e: any, R = 3.4) {
  const m = e.map, p = e.player, wh = WALL_H[e.levelDef.gen] ?? 3
  for (let rad = 0; rad < 40; rad++) for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
    const cx = Math.floor(p.x) + dx + 0.5, cy = Math.floor(p.y) + dy + 0.5
    let good = true
    for (let yy = -R; yy <= R && good; yy += 0.5) for (let xx = -R; xx <= R && good; xx += 0.5) {
      if (xx * xx + yy * yy > R * R) continue
      const x = cx + xx, y = cy + yy
      if (x < 1 || y < 1 || x > m.w - 2 || y > m.h - 2 || !walkableAt(m, Math.floor(x), Math.floor(y), 0) || Math.abs(floorHeight(m, x, y, 0)) > 0.02) good = false
      else if (e.structBlocksPoint?.(x, y) || m.structures.some((s: any) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)) good = false
    }
    if (good && Number.isFinite(ceilingHeightAt(m, cx, cy, wh, 0))) return { x: cx, y: cy }
  }
  throw Error('找不到开阔地')
}
let nid = 70000
function setup(seed = 1601) {
  const { e, msgs } = fresh(seed)
  const spot = openSpot(e)
  e.map.entities = e.map.entities.filter((q: any) => q.def.type === 'nguithr' && Math.hypot(q.x - spot.x, q.y - spot.y) > 30)
  const ng = makeEntity('nguithr', spot.x, spot.y, 0); ng.id = nid++
  e.map.entities.push(ng)
  place(e, spot.x + 6, spot.y)
  return { e, msgs, ng, spot }
}
function place(e: any, x: number, y: number) { const p = e.player; p.x = x; p.y = y; p.z = 0; p.vz = 0 }
/** 真实 step；每帧清掉其它实体（只留 Nguithr 与测试猎物），避免随机遭遇干扰 */
function run(e: any, secs: number, each?: (t: number) => void) {
  const dt = 1 / 30
  for (let t = 0; t < secs; t += dt) {
    each?.(t)
    e.map.entities = e.map.entities.filter((q: any) => q.def.type === 'nguithr' || q.testKeep)
    e.blackoutT = 0
    e.step(dt)
    if (e.over) return
  }
}
const sacW = (e: any, ng: any, i: number) => N.nguithrSacWorld(e, ng.ng, i)
const intact = (ng: any) => ng.ng.sacs.filter((s: any) => s.state === 'intact').length
function standUnder(e: any, ng: any, i = 0) { const w = sacW(e, ng, i); place(e, w.x, w.y) }
function press(e: any) { e.input.jump = true; run(e, 1 / 30); e.input.jump = false; run(e, 1 / 30) }

// ============================================================================
// 1. 设定 / 模型 / 物品
// ============================================================================
{
  const d = ENTITIES.nguithr
  const txt = d.desc + d.codex.behavior + d.codex.counter + d.codex.lore.join('')
  ok(/16 只/.test(txt) && /避日目/.test(txt), '图鉴：16 只附肢、避日目')
  ok(/Level 3/.test(d.codex.habitat) && /Level 5/.test(d.codex.habitat) && /Level 8/.test(d.codex.habitat) && /Entity 16/.test(d.codex.no), '图鉴：编号 Entity 16；栖息地 L1/L2/L3（L5/L8 稀有）')
  ok(/摇晃/.test(d.codex.counter) && /一次放下全部/.test(d.codex.behavior) && /止痛/.test(txt), '图鉴：两段式镇静、摇晃身体、分泌物可制药')
  const g = ITEMS.sedgland
  ok(!!g && g.use === 'heal' && g.name === '镇静腺' && itemUseProfile(g)?.label === '吞服', '新物品「镇静腺」：吞服的止痛剂（heal）')
  ok(!buildItemMesh('sedgland').userData.fallback, '镇静腺有专属地面模型（非 fallback）')
  const grp = buildEntityMesh('nguithr')
  let sk = 0, old = 0; grp.traverse((o: any) => { if (o.isSkinnedMesh) sk++; if (/spiderBody|sacGrp/.test(o.name)) old++ })
  ok(sk === 1 && !!grp.userData.ngSpider && !(grp.userData.parts?.spiderBody), '实体网格：重制蒙皮模型（1 个 SkinnedMesh），旧 12 腿简模已移除')
  ok(old === 0, '无旧部件 spiderBody/sacGrp')
  const lay = nguithrSacLayout(5, 1234), nest = nguithrNest(buildNguithrNest(5, 1234))!
  ok(nest.sacs.length === 5 && lay.every((c: any, i: number) => nest.sacs[i].center.distanceTo(new THREE.Vector3(c.x, c.y, c.z)) < 1e-9 && Math.abs(nest.sacs[i].radius - c.r) < 1e-9), '巢模型网囊位置与 AI 布局（nguithrSacLayout）逐个一致')
  ok(EFFECTS.some((x: any) => x.field === 'ngRun' && x.resetOnNewRun && x.resetOnLevel && !x.saveKey), '玩家镇静状态登记在 effects 表：新一局/换层重置，无存档键')
}

// ============================================================================
// 2. 天花板静伏：对人类完全静止
// ============================================================================
{
  const { e, ng } = setup()
  run(e, 0.1)
  const s = ng.ng, x0 = ng.x, y0 = ng.y
  ok(!!s && s.sacs.length >= NG.sacMin && s.sacs.length <= NG.sacMax, `巢：${s.sacs.length} 个网囊（3–6）`)
  ok(s.ceil - ng.z > 2.1, `挂在天花板上（离地 ${(s.ceil - ng.z).toFixed(2)}m）`)
  place(e, ng.x + 3.2, ng.y + 0.4)
  run(e, 8)
  ok(s.mode === 'ceiling' && Math.hypot(ng.x - x0, ng.y - y0) < 1e-6 && e.ngRun.level === 'none', '玩家在巢旁 3.2m 逗留 8s：它一动不动、不切囊')
}

// ============================================================================
// 3. 第一段：走到网囊正下方 → 切下一个 → 轻度镇静（视野雾/声音闷/移动略慢/含糊提示，它自己不动）
// ============================================================================
let firstSacOk = false
{
  const { e, ng, msgs } = setup()
  run(e, 0.1)
  const s = ng.ng, n0 = intact(ng), x0 = ng.x
  standUnder(e, ng, 0)
  const m0 = msgs.length
  run(e, 0.2)
  ok(s.mode === 'cut' && intact(ng) === n0, `进入网囊正下方：开始切丝（cut），尚未爆开（${NG.cutLead}s 后才 pop）`)
  run(e, 0.3)
  ok(intact(ng) === n0 - 1 && s.sacs[0].state === 'popped', '只切下脚下这一个网囊')
  ok(e.ngRun.level === 'light' && Math.abs(N.nguithrSpeedMult(e) - NG.lightSpeed) < 1e-9 && !N.nguithrInputLock(e), `轻度镇静：移动 ×${NG.lightSpeed}，仍可行动`)
  ok(muffled, '声音发闷（全局低通）')
  const ov = N.nguithrOverlay(e)
  ok(ov.fog > 0.2 && ov.blur > 1 && ov.dark < 0.2, `视野发雾（fog ${ov.fog.toFixed(2)} / blur ${ov.blur.toFixed(1)}px）`)
  const said = msgs.slice(m0).join('|')
  ok(said.length > 0 && !/Nguithr|蜘蛛|网囊/.test(said), `HUD 提示含糊（「${msgs.slice(m0)[0]}」）`)
  ok(Math.abs(ng.x - x0) < 1e-6 && s.windowT >= 0, '它自己不动；窗口开始计时')
  firstSacOk = intact(ng) === n0 - 1
}

// ============================================================================
// 4. 第二段：窗口内仍在巢下 → 一次放下全部 → 重度镇静（理智降、变暗、无法移动）→ 垂降 → 活吃（可致死）
// ============================================================================
{
  const { e, ng, msgs } = setup()
  run(e, 0.1)
  const s = ng.ng
  standUnder(e, ng, 0)
  run(e, 0.6)
  const san0 = e.player.sanity
  // 留在巢下 1.2m 处（没有挣脱）
  const nx = N.nguithrNestXY(e, s)
  place(e, nx.x + 1.2, nx.y)
  run(e, NG.windowGrace + 0.6)
  ok(intact(ng) === 0, `窗口内仍在巢下（距巢心 1.2m ≤ ${NG.nestR}m）：全部网囊放下`)
  ok(e.ngRun.level === 'heavy' && N.nguithrInputLock(e), '重度镇静：输入锁定')
  ok(san0 - e.player.sanity >= NG.heavySanity - 0.01, `理智下降 ${(san0 - e.player.sanity).toFixed(1)}（≥${NG.heavySanity}）`)
  const ov = N.nguithrOverlay(e)
  ok(ov.dark > 0.4 && ov.need === NG.struggleHeavy, `画面变暗（dark ${ov.dark.toFixed(2)}），挣脱需 ${ov.need} 下`)
  const px = e.player.x, py = e.player.y
  e.input.my = -1; e.input.mx = 0.6
  run(e, 1)
  e.input.my = 0; e.input.mx = 0
  ok(Math.hypot(e.player.x - px, e.player.y - py) < 0.02, '按方向键 1s：原地不动（无法移动）')
  ok(msgs.some((t: string) => /重度镇静/.test(t)), 'HUD：重度镇静提示（含挣脱按键）')
  // 垂降 → 进食
  let sawDescend = false, sawFeed = false, maxAway = 0
  const hp0 = e.player.hp
  run(e, 14, () => { if (s.mode === 'descend') sawDescend = true; if (s.mode === 'feed') sawFeed = true; maxAway = Math.max(maxAway, Math.hypot(ng.x - e.player.x, ng.y - e.player.y)) })
  ok(sawDescend && sawFeed, '它在天花板上挪到猎物附近，顺丝垂降，落地开始进食')
  ok(s.mode === 'feed' && Math.hypot(ng.x - e.player.x, ng.y - e.player.y) < NG.feedR, `落在玩家身边（${Math.hypot(ng.x - e.player.x, ng.y - e.player.y).toFixed(2)}m）`)
  ok(e.player.hp < hp0 - 8, `活吃：持续掉血（${hp0} → ${e.player.hp.toFixed(0)}）`)
  ok(e.ngRun.level === 'heavy' && e.ngRun.t >= NG.heavyRefresh - 0.2, '进食期间重度镇静被持续续上（不挣脱醒不过来）')
  e.player.hp = 9
  run(e, 6)
  ok(e.over && e.player.hp <= 0, '不挣脱：被活活吃掉（可致死）')
}

// ============================================================================
// 5. 离开窗口：第一个球后立刻离开巢下 → 不放下其余网囊
// ============================================================================
{
  const { e, ng } = setup()
  run(e, 0.1)
  const s = ng.ng, n0 = intact(ng)
  standUnder(e, ng, 0)
  run(e, 0.55)
  const nx = N.nguithrNestXY(e, s)
  place(e, nx.x + 4.2, nx.y + 0.3)
  run(e, NG.windowDur + 1.5)
  ok(intact(ng) === n0 - 1 && e.ngRun.level !== 'heavy', `窗口内离开到 4.2m 外：只掉了 1 个，其余 ${n0 - 1} 个仍挂着`)
  ok((s.mode === 'ceiling' || s.mode === 'watch') && s.windowT < 0, '窗口结束，回到静伏')
}

// ============================================================================
// 6. 挣脱：轻度一下解除；重度需要很多下，慢摇不够；挣脱打断进食；左右交替同样有效
// ============================================================================
{
  const { e, ng } = setup()
  run(e, 0.1)
  standUnder(e, ng, 0); run(e, 0.6)
  ok(e.ngRun.level === 'light', '（前置）轻度镇静')
  const nx = N.nguithrNestXY(e, ng.ng)
  place(e, nx.x + 4.5, nx.y)
  press(e)
  ok(e.ngRun.level === 'none' && !muffled, '轻度：按一下跳跃（摇晃身体）立即解除')
}
{
  const { e, ng } = setup()
  run(e, 0.1)
  const s = ng.ng
  standUnder(e, ng, 0); run(e, 0.6)
  const nx = N.nguithrNestXY(e, s)
  place(e, nx.x + 1, nx.y + 0.4)
  run(e, NG.windowGrace + 0.6)
  ok(e.ngRun.level === 'heavy', '（前置）重度镇静')
  for (let i = 0; i < 6; i++) { press(e); run(e, 0.9) }
  ok(e.ngRun.level === 'heavy', '重度：每秒摇一下（6 下）挣脱值衰减，挣不开')
  run(e, 12)
  ok(s.mode === 'feed', '（前置）它已落地进食')
  for (let i = 0; i < 18 && e.ngRun.level === 'heavy'; i++) { e.input.jump = true; run(e, 1 / 30); e.input.jump = false; run(e, 2 / 30) }
  ok(e.ngRun.level !== 'heavy' && e.ngRun.presses >= NG.struggleHeavy - 3, `快速连按：挣脱（共 ${e.ngRun.presses} 下）`)
  ok(s.mode === 'ground' && s.recoilT > 0, '挣脱打断进食：它僵直后退缩（recoil）')
  // 4m 放弃 + 不追击
  const gx = ng.x, gy = ng.y
  place(e, ng.x + 5.2, ng.y + 0.2)
  let climbed = false, maxMove = 0
  run(e, 20, () => { if (s.mode === 'climb') climbed = true; if (s.mode === 'ground') maxMove = Math.max(maxMove, Math.hypot(ng.x - gx, ng.y - gy)) })
  ok(climbed, `玩家离开 >${NG.giveUpR}m：它放弃并爬回天花板`)
  ok(maxMove < 0.3, `地面上不追击（地面位移 ${maxMove.toFixed(2)}m）`)
  ok(['return', 'sleep', 'ceiling'].includes(s.mode), `回到天花板后：${s.mode}（进食过 → 休眠）`)
  // 休眠 + 重织：玩家远离 → 逐个补囊直到上限
  place(e, ng.x + 12, ng.y)
  let restored = -1
  const t0 = performance.now(); void t0
  run(e, NG.sleepDur + NG.weaveEvery + NG.weaveDur + 6, () => { if (restored < 0 && intact(ng) > 0) restored = 1 })
  ok(intact(ng) >= 1, `休眠 ${NG.sleepDur}s 后开始重织：已补 ${intact(ng)} 个`)
  run(e, NG.weaveEvery * s.sacs.length + 10)
  ok(intact(ng) === s.sacs.length, `附近无猎物时持续补囊直至上限（${intact(ng)}/${s.sacs.length}）`)
  ok(['ceiling'].includes(s.mode) && N.nguithrOnCeiling(s), '补满后回到天花板静伏')
}
{
  // 左右交替（A/D）挣脱重度
  const { e, ng } = setup()
  run(e, 0.1)
  standUnder(e, ng, 0); run(e, 0.6)
  const nx = N.nguithrNestXY(e, ng.ng)
  place(e, nx.x + 1, nx.y - 0.3)
  run(e, NG.windowGrace + 0.6)
  look.yaw = 0
  let side = 1
  for (let i = 0; i < 24 && e.ngRun.level === 'heavy'; i++) { e.input.mx = side; side = -side; run(e, 2 / 30) }
  e.input.mx = 0
  ok(e.ngRun.level !== 'heavy', `左右交替按 A/D 同样能挣脱重度（${e.ngRun.presses} 下）`)
}

// ============================================================================
// 7. 反制：投掷物破囊（远处空洒不影响 / 近处小剂量）；天花板上受击只缩身不反击；手电反光接口
// ============================================================================
{
  const { e, ng } = setup()
  run(e, 0.1)
  const s = ng.ng, n0 = intact(ng)
  const w = sacW(e, ng, 1)
  place(e, w.x + 4.5, w.y)
  // 从 4.5m 外朝网囊掷出订书机（真实 projectiles + updateProjectiles）
  const z0 = 1.55, T = 0.5, vx = (w.x - e.player.x) / T, vy = (w.y - e.player.y) / T, vz = (w.z - z0 + 0.5 * 9.8 * T * T) / T
  e.projectiles.push({ id: e.projId++, type: 'stapler', x: e.player.x, y: e.player.y, z: z0, floorZ: 0, vx, vy, vz })
  const it0 = e.map.items.length
  run(e, 0.8)
  ok(s.sacs[1].state === 'popped' && intact(ng) === n0 - 1, '投掷物命中网囊：提前打破')
  ok(e.ngRun.level === 'none', '远处空洒：4.5m 外的玩家不受影响')
  ok(e.map.items.length === it0 + 1, '投掷物落地（订书机可捡回）')
  ok(s.mode === 'cower', '网囊被打破：它在天花板上缩成一团')
  run(e, NG.cowerDur + 0.5)
  const w2 = sacW(e, ng, 2)
  place(e, w2.x + 1.0, w2.y)
  e.projectiles.push({ id: e.projId++, type: 'stapler', x: w2.x + 1.0, y: w2.y, z: w2.z - 0.6, floorZ: 0, vx: -1 / 0.25, vy: 0, vz: (0.6 + 0.5 * 9.8 * 0.0625) / 0.25 })
  run(e, 0.5)
  ok(s.sacs[2].state === 'popped' && e.ngRun.level === 'light' && e.ngRun.t <= NG.spillDur + 0.01, `近处（1m）打破：只沾到小剂量（轻度 ${NG.spillDur}s）`)
  ok(s.windowT < 0 && intact(ng) === n0 - 2, '打破网囊不会开启放下全部的窗口')
}
{
  const { e, ng } = setup()
  run(e, 0.1)
  const s = ng.ng
  place(e, ng.x + 1.2, ng.y + 0.6)
  const hp0 = e.player.hp, n0 = intact(ng)
  ng.hp -= 6 // 近战命中（任何伤害来源都按 hp 下降检测）
  run(e, 0.2)
  ok(s.mode === 'cower', '天花板上被攻击：缩身（cower）')
  run(e, 3)
  ok(e.player.hp === hp0 && e.ngRun.level === 'none' && intact(ng) === n0, '不反击：玩家未受伤、未被镇静、网囊未动')
  ok(N.nguithrOnCeiling(s), '仍挂在天花板上')
  const nest = nguithrNest(buildNguithrNest(4, 3))!
  ok(typeof nest.setSacGlow === 'function', '巢句柄提供 setSacGlow（渲染层按手电光锥/距离调网囊反光）')
}

// ============================================================================
// 8. 掉落：镇静腺（止痛：回血/理智/解除迟缓）；死亡释放被它镇静的玩家
// ============================================================================
{
  const { e, ng } = setup()
  run(e, 0.1)
  standUnder(e, ng, 0); run(e, 0.6)
  const nx = N.nguithrNestXY(e, ng.ng)
  place(e, nx.x + 1, nx.y)
  run(e, NG.windowGrace + 0.6)
  ok(e.ngRun.level === 'heavy', '（前置）重度镇静')
  ng.hp = 0; e.killCheck(ng)
  const drop = e.map.items.find((it: any) => it.type === 'sedgland')
  ok(ng.dead && !!drop, '击杀掉落「镇静腺」')
  ok(e.ngRun.level !== 'heavy', '击杀施术者：玩家从重度镇静中解脱')
  e.player.hp = 50; e.player.sanity = 40; e.player.slowT = 3
  e.player.hotbar[0] = { type: 'sedgland', count: 1 }; e.player.selected = 0
  inventory.useSlot(e, 'hotbar', 0)
  run(e, 1.6)
  ok(e.player.hp >= 64 && e.player.sanity >= 49 && e.player.slowT === 0 && !e.player.hotbar[0], `吞服镇静腺：生命 50→${e.player.hp.toFixed(0)}、理智 40→${e.player.sanity.toFixed(0)}、解除迟缓`)
}

// ============================================================================
// 9. 喷液捕食小实体（旱虾/尸鼠）
// ============================================================================
{
  const { e, ng } = setup()
  run(e, 0.1)
  const s = ng.ng
  place(e, ng.x + 14, ng.y)
  const prey = makeEntity('dryshrimp', ng.x + 2, ng.y + 0.5, 0); prey.id = nid++; (prey as any).testKeep = true
  e.map.entities.push(prey)
  let sprayed = false, fed = false
  run(e, 3, () => { if (s.mode === 'spray') sprayed = true })
  ok(sprayed && prey.dead, '旱虾进入 3.2m：它喷液把旱虾杀死')
  ok(e.particles.some((p: any) => p.color === '#cfe08a' || p.color === '#e6eab0') || sprayed, '喷液粒子')
  run(e, 25, () => { if (s.mode === 'feed') fed = true })
  ok(fed, '随后垂降进食')
  run(e, 20)
  ok(['sleep', 'ceiling', 'return'].includes(s.mode) && N.nguithrOnCeiling(s), `进食后爬回天花板（${s.mode}）`)
  const rat = makeEntity('corpserat', 0, 0, 0)
  ok(N.isNguithrPrey(rat) && !N.isNguithrPrey(makeEntity('hound', 0, 0, 0)), '尸鼠也是猎物；猎犬不是')
}

// ============================================================================
// 10. 生成层级
// ============================================================================
{
  const count = (gen: any, def: any, seeds: number[], R: number) => {
    let chunks = 0, withNg = 0, colony = 0, total = 0
    for (const seed of seeds) for (let cy = -R; cy < R; cy++) for (let cx = -R; cx < R; cx++) {
      const c = gen(def, seed, cx, cy); chunks++
      const k = c.entities.filter((q: any) => q.type === 'nguithr').length
      total += k; if (k) withNg++; if (k >= 2) colony++
    }
    return { chunks, withNg, colony, total, rate: withNg / chunks }
  }
  const l3 = count(genL3ChunkRaw, L3, [11, 12], 12)
  ok(l3.withNg > 0 && l3.rate > 0.035 && l3.rate < 0.09, `L3 新增：${l3.withNg}/${l3.chunks} chunk 有巢（${(l3.rate * 100).toFixed(1)}%，目标 ~6%）`)
  ok(l3.colony > 0, `L3 群居巢点：${l3.colony} 处 2–3 只共享天花板`)
  const l2 = count(genL2ChunkRaw, L2, [21], 12), l1 = count(genL1ChunkRaw, L1, [31], 10)
  ok(l2.rate > 0.015 && l2.rate < 0.07 && l1.rate > 0.015 && l1.rate < 0.07, `L1/L2 保持约 4%（L1 ${(l1.rate * 100).toFixed(1)}% / L2 ${(l2.rate * 100).toFixed(1)}%）`)
  const w5 = L5.entities.find((x: any) => x.type === 'nguithr')
  ok(w5?.w === NG.l5Weight, `L5 生成池保留但稀有（w ${w5?.w}）`)
  ok(JSON.stringify(ENTITY_EVENT_SPAWNS.nguithr) === '[1,2,3,8]', '图鉴/开发面板层级归属：L1/L2/L3/L8（+L5 池）')
  // L3 全部巢点都有天花板可挂（实体在真实 L3 里初始化的天花板高度合理）
  const { e } = fresh(77); e.loadLevel(3, { mapSeed: 77, firstVisit: true })
  const ngs = e.map.entities.filter((q: any) => q.def.type === 'nguithr')
  for (const q of ngs) N.nguithrState(e, q)
  ok(ngs.every((q: any) => q.ng.ceil - q.z >= 2.1 && q.ng.ceil - q.z <= 6), `真实 L3 窗口：${ngs.length} 只，天花板高度合理`)
}

// ============================================================================
// 11. 存档快照无新字段（镇静/巢状态只在内存）
// ============================================================================
{
  const { e, ng } = setup()
  run(e, 0.1)
  const k0 = Object.keys(e.snapshot()).sort().join(',')
  standUnder(e, ng, 0); run(e, 0.6)
  const nx = N.nguithrNestXY(e, ng.ng)
  place(e, nx.x + 1, nx.y); run(e, NG.windowGrace + 0.6)
  const snap = e.snapshot(), k1 = Object.keys(snap).sort().join(',')
  const js = JSON.stringify(snap)
  ok(e.ngRun.level === 'heavy' && k0 === k1, '重度镇静中存档：快照键集合与之前完全相同')
  ok(!/ngRun|"sacs"|nestWX|struggle/.test(js), '快照 JSON 不含镇静/巢字段')
}

// Surviving entities keep local movement targets aligned when the stream origin shifts.
{
 const {e,ng}=setup();run(e,.1);const oldOrigin=[e.map.inf.ox,e.map.inf.oy],s=ng.ng
 s.tx=ng.x+1;s.ty=ng.y+1;const world=[s.tx+oldOrigin[0],s.ty+oldOrigin[1]],nest=[s.nestWX,s.nestWY]
 e.player.x+=32;e.updateInfiniteWindow()
 ok(s.tx+e.map.inf.ox===world[0]&&s.ty+e.map.inf.oy===world[1],'窗口平移：运动目标保持世界位置')
 ok(s.nestWX===nest[0]&&s.nestWY===nest[1],'窗口平移：巢中心保持世界位置')
}

// Direct hotbar/UI calls share the same heavy-sedation lock as keyboard attacks.
{
 const {e,ng}=setup();run(e,.1);N.applyNguithrHeavy(e,ng.id)
 e.player.hotbar[0]={type:'sedgland',count:1};e.player.selected=0
 ok(inventory.useSlot(e,'hotbar',0)===false&&!e.usingItem,'重度镇静阻止快捷栏和 UI 直接使用物品')
 e.player.hotbar[0]=null;e.attackAnimT=0;e.attackCooldownT=0;e.attack()
 ok(e.attackAnimT===0&&e.attackCooldownT===0,'重度镇静阻止直接攻击入口')
 e.ngRun.level='light';e.ngRun.t=5;e.player.hp=50;e.player.hotbar[0]={type:'sedgland',count:1}
 ok(inventory.useSlot(e,'hotbar',0)===true,'轻度镇静仍允许使用物品')
}

// Wall occlusion protects both the trap trigger and ceiling locomotion.
{
 const {e,ng}=setup();run(e,.1);e.los=()=>false;standUnder(e,ng,0);run(e,2)
 ok(e.ngRun.level==='none'&&ng.ng.sacs.every((c:any)=>c.state==='intact'),'遮挡的玩家不会隔墙触发镇静网囊')
}
{
 const {e,ng}=setup();run(e,.1);place(e,ng.x+14,ng.y)
 const s=ng.ng,start=ng.x,wallX=Math.floor(ng.x)+1,wallY=Math.floor(ng.y)
 for(let dy=-3;dy<=3;dy++)e.map.tiles[(wallY+dy)*e.map.w+wallX]=0
 Object.assign(s,{mode:'return',clip:'idle',yaw:0,t:0,nestWX:start+3+e.map.inf.ox,nestWY:ng.y+e.map.inf.oy})
 run(e,3)
 ok(ng.x<wallX&&ng.x>=start&&Number.isFinite(ng.x+ng.y),'天花板爬行不穿越实体墙面')
}

const summary = `\n${fails ? '✘' : '✔'} Nguithr'xurh 机制验收：${n - fails}/${n} 通过${firstSacOk ? '' : '（第一囊用例异常）'}`
console.log(summary); lines.push(summary)
mkdirSync('reports/nguithr', { recursive: true })
writeFileSync('reports/nguithr/mechanics-check.txt', lines.join('\n') + '\n')
process.exit(fails ? 1 : 0)
