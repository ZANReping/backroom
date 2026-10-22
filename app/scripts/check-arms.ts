/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接读写引擎内部状态 */
// 手臂（Entité 15-FR）重制第 3 阶段——无头机制验收（真实 Engine + 真实 Level 1 生成 + 真实 step 循环）
// 运行：npm run check:arms     结果同时写入 reports/arms/mechanics-check.txt
import * as THREE from 'three'
import { mkdirSync, writeFileSync } from 'node:fs'

const memory = new Map<string, string>()
Object.assign(globalThis, { window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }, document: { createElement: () => ({ getContext: () => null, style: {} }), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } }, localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) } })
const { Engine } = await import('../src/game/engine')
const AI = await import('../src/game/engine/armsAI')
const { audio } = await import('../src/game/core/audio')
const { look } = await import('../src/game/core/renderer3d')
const { ENTITIES, makeEntity } = await import('../src/game/entities')
const { ENTITY_EVENT_SPAWNS } = await import('../src/game/entities/spawns') as any
const { EFFECTS } = await import('../src/game/engine/effects')
const { buildEntityMesh } = await import('../src/game/renderer/entitiesMesh')
const { buildStructure } = await import('../src/game/renderer/structures')
const { genL1ChunkRaw } = await import('../src/game/world/infiniteL1')
const { genL2ChunkRaw } = await import('../src/game/world/infiniteL2')
const { genL3ChunkRaw } = await import('../src/game/world/infiniteL3')
const { L1 } = await import('../src/game/levels/l1')
const { L2 } = await import('../src/game/levels/l2')
const { L3 } = await import('../src/game/levels/l3')
const { LEVELS } = await import('../src/game/levels')
const { ceilingHeightAt, floorHeight, walkableAt } = await import('../src/game/world/mapgen')
const { WALL_H } = await import('../src/game/renderer/shared')
const { ARMS_VENT_DROP } = await import('../src/game/renderer/armsMesh')

const audioLog: string[] = []
for (const k of ['aggro', 'hit', 'swing', 'hurt', 'pickup', 'uiTick', 'spark', 'searchTick', 'splash', 'scrape', 'clumpChew', 'setUnderwater', 'footstep', 'whisper', 'armsSfx'] as const) (audio as any)[k] = (...a: any[]) => { audioLog.push(k === 'armsSfx' ? `arms:${a[0]}` : k) }
const lines: string[] = []
let fails = 0, n = 0
const ok = (c: unknown, m: string) => { n++; const l = `${c ? '✔' : '✘'} ${m}`; console.log(l); lines.push(l); if (!c) fails++ }
const info = (m: string) => { console.log('  · ' + m); lines.push('  · ' + m) }
const A = AI.ARMS

// 基线 002514e + 项目既有 tradersWorld、bntgBank 可选字段；手臂与衔尾接入不增加存档键。
const BASE_SNAP = { top: ['alphaLayout', 'avenueHintSeq', 'avenueMarks', 'bntgBank', 'bntgLayout', 'brcMimicCd', 'brcSin', 'career', 'difficulty', 'glowProjectiles', 'heardSongs', 'homelyApplied', 'indoctrination', 'jerryAgreed', 'jerryOath', 'jerryTamed', 'l0SharedWorld', 'l0World', 'l10Weather', 'l11Weather', 'l11World', 'l1World', 'l5MothAlerts', 'level', 'mapFirstVisit', 'mapSeed', 'outpostReturn', 'player', 'profile', 'quests', 'radio', 'rep', 'seed', 'settlementLayout', 'time', 'tradersWorld', 'v', 'visited', 'warehouses', 'worldPos'], player: ['aliveTime', 'backpack', 'battery', 'coffeeT', 'crouching', 'equip', 'facing', 'flashJamT', 'flashlight', 'floor', 'hasGloves', 'hasLighter', 'hasPockets', 'hasRabbit', 'hasSuit', 'hotbar', 'hp', 'hunger', 'infection', 'kills', 'level', 'leverPulled', 'sanity', 'selected', 'slowT', 'stamina', 'startTime', 'steps', 'tapes', 'thirst', 'vz', 'x', 'y', 'z'], l1World: ['dynamics', 'generation', 'migration', 'runtime', 'seed', 'taken', 'version'], saveKeys: ['brcMimicCd', 'brcSin', 'indoctrination', 'jerryAgreed', 'jerryOath', 'jerryTamed', 'warehouses'] }

// ---------------------------------------------------------------------------
// 场景：真实 L1，找一块「半径 4.5m 内同高可走 + 有天花板」的开阔地，放一只手臂；停电与灯光由测试控制
// ---------------------------------------------------------------------------
function fresh(seed = 1601) {
  const e: any = new Engine(); e.seed = seed
  e.loadLevel(1, { mapSeed: seed, firstVisit: true }); e.introT = 0
  e.player.hp = 100; e.player.sanity = 100
  const msgs: string[] = []; const om = e.msg.bind(e); e.msg = (t: string, k: any) => { msgs.push(t); om(t, k) }
  e.dev.statLock = false
  return { e, msgs }
}
function openSpot(e: any, R = 4.5, avoid?: { x: number; y: number; r: number }) {
  const m = e.map, p = e.player, wh = WALL_H[e.levelDef.gen] ?? 3
  for (let rad = 0; rad < 60; rad++) for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
    const cx = Math.floor(p.x) + dx + 0.5, cy = Math.floor(p.y) + dy + 0.5
    if (avoid && Math.hypot(cx - avoid.x, cy - avoid.y) < avoid.r) continue
    let good = true
    for (let yy = -R; yy <= R && good; yy += 0.5) for (let xx = -R; xx <= R && good; xx += 0.5) {
      if (xx * xx + yy * yy > R * R) continue
      const x = cx + xx, y = cy + yy
      if (x < 2 || y < 2 || x > m.w - 3 || y > m.h - 3 || !walkableAt(m, Math.floor(x), Math.floor(y), 0) || Math.abs(floorHeight(m, x, y, 0)) > 0.02) good = false
      else if (m.structures.some((s: any) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)) good = false
    }
    const c = ceilingHeightAt(m, cx, cy, wh, 0)
    if (good && Number.isFinite(c) && c > 2.5 && c < 4.2) return { x: cx, y: cy }
  }
  throw Error('找不到开阔地')
}
let nid = 81000
function addArms(e: any, x: number, y: number) {
  const a = makeEntity('arms', x, y, 0); a.id = nid++
  e.map.entities.push(a)
  AI.armsState(e, a)
  return a
}
function setup(seed = 1601) {
  const { e, msgs } = fresh(seed)
  const spot = openSpot(e)
  e.map.entities = e.map.entities.filter((q: any) => q.def.type !== 'arms')
  const arms = addArms(e, spot.x, spot.y)
  place(e, spot.x + 4, spot.y)
  return { e, msgs, arms, spot }
}
function place(e: any, x: number, y: number) { const p = e.player; p.x = x; p.y = y; p.z = 0; p.vz = 0 }
/** 停电：熄灭层级灯，再清掉现场 14m 内残余灯（测试要一块确定的黑暗） */
function darken(e: any, spot: { x: number; y: number }) {
  if (!AI.armsBlackout(e)) { e.blackoutPendingDur = 999; e.applyBlackout() }
  e.blackoutT = 999
  e.map.lights = e.map.lights.filter((l: any) => Math.hypot(l.x - spot.x, l.y - spot.y) > 14 + l.r)
}
let keepDark: { x: number; y: number } | null = null
/** 真实 step；每帧只留手臂与测试实体；停电状态按 keepDark 维持（或保持来电、不让随机停电打扰） */
function run(e: any, secs: number, each?: (t: number) => void | boolean) {
  const dt = 1 / 30
  for (let t = 0; t < secs; t += dt) {
    if (each?.(t) === true) return t
    e.map.entities = e.map.entities.filter((q: any) => q.def.type === 'arms' || q.testKeep)
    if (keepDark) darken(e, keepDark)
    else { e.blackoutWarnT = 0; if (AI.armsBlackout(e)) e.endBlackout() }
    e.step(dt)
    if (e.over) return t
  }
  return secs
}
const S = (a: any) => a.ar as import('../src/game/engine/armsAI').ArmsState
function aimAt(e: any, x: number, y: number, z: number) {
  const p = e.player, dx = x - p.x, dy = y - p.y
  look.yaw = Math.atan2(-dx, -dy)
  look.pitch = Math.atan2(z - (p.z + 1.55), Math.hypot(dx, dy))
  ;(look as any).rayX = 0; (look as any).rayY = 0; (look as any).rayZ = 0
}
function sprintAround(e: any, spot: { x: number; y: number }, secs: number, stop: () => boolean) {
  // 在风口旁 4m 处来回奔跑（真实移动 + 真实脚步噪音）
  let dir = 1
  return run(e, secs, () => {
    const p = e.player
    if (p.y > spot.y + 2) dir = -1; else if (p.y < spot.y - 2) dir = 1
    e.input.mx = 0; e.input.my = dir; e.input.sprint = true; p.stamina = 100
    if (stop()) { e.input.my = 0; e.input.sprint = false; return true }
  })
}
function triggerToSearch(e: any, arms: any, spot: { x: number; y: number }) {
  keepDark = spot
  place(e, spot.x + 4, spot.y)
  sprintAround(e, spot, 8, () => S(arms).mode !== 'hidden')
  e.input.my = 0; e.input.sprint = false
  run(e, 6, () => S(arms).mode === 'search')
}
function freshSearch(seed = 1601) {
  const st = setup(seed)
  triggerToSearch(st.e, st.arms, st.spot)
  return st
}
function grabbed(seed = 1601, hp = 100) {
  const st = freshSearch(seed), { e, arms, spot } = st
  e.player.hp = hp
  place(e, spot.x + 2.0, spot.y) // 站在扑抓范围内不动
  run(e, 6, () => S(arms).mode === 'grab')
  return st
}

// ============================================================================
// 1. 设定 / 图鉴 / 编码 / 模型 / 结构
// ============================================================================
{
  const d = ENTITIES.arms
  ok(/Entity 15-FR/.test(d.codex.no) && /手臂/.test(d.codex.no) && /Les Bras/.test(d.codex.no), '图鉴编号：Entity 15-FR / 手臂 / Les Bras')
  ok(/Level 1/.test(d.codex.habitat) && /通风管/.test(d.codex.habitat) && /中高威胁/.test(d.codex.danger), '图鉴：L1 室内通风管、中高威胁')
  const txt = d.desc + d.codex.behavior + d.codex.counter + d.codex.lore.join('') + d.codex.sighting
  ok(/漆黑|黑暗/.test(txt) && /动静|响动/.test(txt) && /拖/.test(txt) && /吐出来/.test(txt), '图鉴内容：黑暗 + 噪音诱发、抓人拖走、从别处吐出')
  ok(/安静/.test(d.codex.counter) && /强光|手电/.test(d.codex.counter) && /刮擦声/.test(d.codex.counter), '图鉴对策：保持安静、用强光、别忽略刮擦声')
  ok(d.hp === 30 && A.hp === 30 && d.stationary, '血量 30，stationary')
  ok(JSON.stringify(ENTITY_EVENT_SPAWNS.arms) === '[1]' && !LEVELS.some((l: any) => l.entities.some((x: any) => x.type === 'arms')), '生成归属只有 Level 1（不在任何层级随机池）')
  ok(EFFECTS.some((x: any) => x.field === 'armsRun' && x.resetOnNewRun && x.resetOnLevel && !x.saveKey), '玩家被抓状态登记在 effects 表：新一局/换层重置，无存档键')
  const grp = buildEntityMesh('arms')
  let sk = 0, vent = 0; grp.traverse((o: any) => { if (o.isSkinnedMesh) sk++; if (o.name === 'armsVent' || o.name === 'armsHome') vent++ })
  ok(sk === 1 && vent >= 1 && !grp.userData.parts, '实体网格：新风口 + 蒙皮长臂（旧方块长臂 armL/hand 部件已移除）')
  const m0: any = { w: 4, h: 4, tiles: new Uint8Array(16).fill(1), ceiling: new Uint8Array(16), up: new Uint8Array(16), stair: new Uint8Array(16), crawl: new Uint8Array(16), dn: new Uint8Array(16), up2: new Uint8Array(16), tint: new Uint8Array(16), elev: new Uint8Array(16), structures: [] }
  const host = buildStructure({ kind: 'ceilvent', x: 1, y: 1, w: 1, h: 1, solid: false, data: { arms: 1 } } as any, L1 as any, m0, 3) as any
  const plain = buildStructure({ kind: 'ceilvent', x: 1, y: 1, w: 1, h: 1, solid: false } as any, L1 as any, m0, 3) as any
  let pv: any = null; plain?.traverse((o: any) => { if (o.name === 'armsVent') pv = o })
  ok(host && host.children.length === 0, 'ceilvent（有手臂入住）不再画旧管体：风口由手臂实体渲染（不重叠）')
  ok(pv && Math.abs(pv.position.y - 3) < 1e-6, '无手臂的 ceilvent 改画同一个新风口模型，管口 = 天花板 − ARMS_VENT_DROP（不再写死 2.55）')
}

// ============================================================================
// 2. 生成：只在 L1、每 chunk 6%、maintenance/garden 不生成、风口与实体同格；臂数 1–3
// ============================================================================
{
  let chunks = 0, withArms = 0, bad = 0, misaligned = 0
  const byVar: Record<string, [number, number]> = {}
  for (let cy = -14; cy < 14; cy++) for (let cx = -14; cx < 14; cx++) {
    const c: any = genL1ChunkRaw(L1 as any, 4242, cx, cy)
    chunks++
    const arms = c.entities.filter((q: any) => q.type === 'arms'), vents = c.structures.filter((s: any) => s.kind === 'ceilvent')
    const v = (byVar[c.variant] ??= [0, 0]); v[0]++
    if (arms.length) { withArms++; v[1]++ }
    if ((c.variant === 'maintenance' || c.variant === 'garden') && arms.length) bad++
    for (const a of arms) if (!vents.some((s: any) => s.data?.arms && Math.abs(s.x + 0.5 - a.x) < 1e-6 && Math.abs(s.y + 0.5 - a.y) < 1e-6)) misaligned++
  }
  const elig = Object.entries(byVar).filter(([k]) => k !== 'maintenance' && k !== 'garden').reduce((s, [, v]) => s + v[0], 0)
  const rate = withArms / Math.max(1, elig)
  info(`L1 ${chunks} 个 chunk：${withArms} 个有手臂（可生成 chunk 中 ${(rate * 100).toFixed(1)}%）；变体分布 ${JSON.stringify(byVar)}`)
  ok(rate > 0.035 && rate < 0.09, `每 chunk 生成率约 6%（实测 ${(rate * 100).toFixed(1)}%）`)
  ok(bad === 0, 'maintenance / garden 变体不生成手臂')
  ok(misaligned === 0, '手臂实体与 ceilvent（data.arms=1）同格对齐')
  let other = 0
  for (let cy = -6; cy < 6; cy++) for (let cx = -6; cx < 6; cx++) {
    for (const c of [genL2ChunkRaw(L2 as any, 77, cx, cy), genL3ChunkRaw(L3 as any, 77, cx, cy)] as any[]) other += c.entities.filter((q: any) => q.type === 'arms').length + c.structures.filter((s: any) => s.kind === 'ceilvent').length
  }
  ok(other === 0, 'L2 / L3 生成器不产出手臂或天花板风口')
  // 臂数分布 + 管道规划（真实窗口里的全部手臂）
  const counts = new Set<number>(); let vents = 0, flat = 0, exposed = 0, ups = 0, hung = 0
  for (let cy = -14; cy < 14; cy++) for (let cx = -14; cx < 14; cx++) for (const a of (genL1ChunkRaw(L1 as any, 4242, cx, cy) as any).entities) if (a.type === 'arms') counts.add(AI.armsCountAt(a.x, a.y))
  // 真实窗口：种子 4242 下，把玩家依次传送到原始生成里的风口附近（窗口随之平移），检查每个风口的管道规划与管口高度
  const checkVent = (e: any, a: any) => {
    const s = AI.armsState(e, a); vents++
    const plan = AI.armsDuctPlan(e, a.x, a.y, s.vent.roof)
    if (plan.ductUp === A.ductFlatUp) flat++
    if (s.vent.exposed) exposed++
    if (s.vent.roof > s.vent.ceil) hung++
    const c = ceilingHeightAt(e.map, a.x, a.y, WALL_H[e.levelDef.gen] ?? 3, 0)
    const wantCeil = c - s.vent.floorZ > A.ventMaxH ? s.vent.floorZ + A.ventHangH : c
    if (Math.abs(s.vent.roof - c) > 1e-6 || Math.abs(AI.armsMouthZ(s.vent) - (wantCeil - ARMS_VENT_DROP)) > 1e-6) badMouth++
    // 吊管风口：管内竖直段要穿过吊管、高出真正的天花板
    if (s.vent.roof > s.vent.ceil && AI.armsMouthZ(s.vent) + s.vent.ductUp < s.vent.roof + 0.1) badMouth++
    if (process.env.ARMS_DBG) console.log('vent', a.x.toFixed(1), a.y.toFixed(1), 'ceil', s.vent.ceil.toFixed(2), 'roof', s.vent.roof.toFixed(2), 'up', s.vent.ductUp.toFixed(2), 'exp', s.vent.exposed, 'max', plan.maxNeighbour.toFixed(2))
  }
  let badMouth = 0
  {
    const { e } = fresh(4242)
    const raw: { x: number; y: number }[] = []
    for (let cy = -14; cy < 14; cy++) for (let cx = -14; cx < 14; cx++) for (const a of (genL1ChunkRaw(L1 as any, 4242, cx, cy) as any).entities) if (a.type === 'arms') raw.push({ x: a.x, y: a.y })
    const seen = new Set<any>()
    for (const w of raw.slice(0, 18)) {
      const p = e.player; p.x = w.x - (e.map.inf?.ox ?? 0) + 2; p.y = w.y - (e.map.inf?.oy ?? 0); p.z = 0
      e.updateInfiniteWindow()
      for (const a of e.map.entities.filter((q: any) => q.def.type === 'arms' && !seen.has(q))) { seen.add(a); checkVent(e, a) }
      ups += e.map.up.reduce((s2: number, v: number) => s2 + v, 0) + e.map.stair.reduce((s2: number, v: number) => s2 + (v & 7 ? 1 : 0), 0)
    }
  }
  for (const seed of [1601, 2024]) {
    const { e } = fresh(seed)
    ups += e.map.up.reduce((s: number, v: number) => s + v, 0) + e.map.stair.reduce((s: number, v: number) => s + (v & 7 ? 1 : 0), 0)
    for (const a of e.map.entities.filter((q: any) => q.def.type === 'arms')) checkVent(e, a)
  }
  info(`臂数取值（784 个 chunk 的全部风口）${[...counts].sort().join('/')}；真实窗口内检查 ${vents} 个风口：挑高大厅吊管风口 ${hung} 个；改为贴天花板管道 ${flat} 个；贴天花板后仍可能露出 ${exposed} 个；L1 楼梯/上层瓦片 ${ups}`)
  ok([...counts].every((c) => c >= 1 && c <= 3) && counts.size >= 2, '每个风口 1–3 条臂（按风口坐标哈希）')
  ok(badMouth === 0, '管口高度跟随风口 anchor：天花板 − 0.45m（挑高 >4.2m 处吊管吊在 3.4m，管内竖直段穿过吊管）')
  ok(exposed === 0, `管内路径不会从更高的邻格露出（${flat} 个风口已改为贴天花板路径）`)
  ok(ups === 0, 'L1 没有上层楼板 / 楼梯瓦片：天花板以上的管内路径不会在上层或楼梯处露出')
}

// ============================================================================
// 3. 出动条件：安静不触发 / 黑暗 + 噪音触发 / 有灯不触发
// ============================================================================
{
  const { e, arms, spot } = setup()
  keepDark = spot
  // 慢走从风口正下方经过（真实脚步：半径 4），再蹲行经过（半径 1）
  place(e, spot.x, spot.y - 4)
  run(e, 3.5, () => { e.input.mx = 0; e.input.my = 1; e.input.sprint = false; e.input.crouch = false })
  const walked = Math.abs(e.player.y - (spot.y - 4))
  place(e, spot.x + 0.3, spot.y + 4)
  run(e, 5, () => { e.input.my = -1; e.input.crouch = true })
  e.input.my = 0; e.input.crouch = false
  run(e, 1)
  ok(walked > 2 && S(arms).mode === 'hidden' && S(arms).stat.triggers === 0, `停电中慢走 / 蹲行从风口下经过不会触发（走了 ${walked.toFixed(1)}m，噪音计 ${S(arms).noise.toFixed(2)}）`)
  // 奔跑 → 刮擦 → 钻出
  place(e, spot.x + 4, spot.y)
  const tTrig = sprintAround(e, spot, 8, () => S(arms).mode === 'stir')
  e.input.my = 0; e.input.sprint = false
  ok(S(arms).mode === 'stir', `黑暗 + 奔跑噪音触发（奔跑 ${tTrig.toFixed(2)}s 后）`)
  const scr0 = audioLog.filter((x) => x === 'arms:scrape').length
  run(e, A.stirDur + 0.1, () => S(arms).mode !== 'stir')
  const scr = audioLog.filter((x) => x === 'arms:scrape').length - scr0
  ok(scr >= 5 && S(arms).mode === 'emerge', `预警：管道刮擦声 ${scr} 次（${A.stirDur}s，沿管道移向风口）后推开格栅钻出`)
  ok(audioLog.includes('arms:grate'), '格栅推开有一声很轻的铰链声')
  run(e, 4, () => S(arms).mode === 'search')
  ok(S(arms).mode === 'search' && !arms.hidden, '钻出后进入探寻，可见')
  // 开枪 / 物品落地也算噪音
  {
    const st = setup(); keepDark = st.spot; place(st.e, st.spot.x + 3, st.spot.y)
    for (let i = 0; i < 3; i++) { AI.armsGunshot(st.e); run(st.e, 0.2) }
    ok(S(st.arms).mode !== 'hidden', '开枪（3 发巧克力子弹）也会把它引出来')
    const st2 = setup(); keepDark = st2.spot; place(st2.e, st2.spot.x + 3, st2.spot.y)
    st2.e.noiseEvent(st2.spot.x + 3.5, st2.spot.y, 16, true) // 订书机落地
    run(st2.e, 0.2)
    ok(S(st2.arms).mode !== 'hidden', '物品落地（订书机砸地 r16）会把它引出来')
  }
  // 有灯不触发：来电状态、玩家站在灯下奔跑
  {
    const st = setup(); keepDark = null
    st.e.map.lights.push({ x: st.spot.x + 3, y: st.spot.y, r: 7, color: '#fff', flickerSeed: 0 })
    place(st.e, st.spot.x + 4, st.spot.y)
    sprintAround(st.e, st.spot, 5, () => false)
    st.e.input.my = 0; st.e.input.sprint = false
    ok(S(st.arms).mode === 'hidden' && S(st.arms).noise > A.noiseNeed * 0.5, `有灯光照到玩家：再吵也不触发（噪音计 ${S(st.arms).noise.toFixed(2)}）`)
    // 停电但身边有荧光棒：同样算有光
    const st2 = setup(); keepDark = st2.spot
    place(st2.e, st2.spot.x + 4, st2.spot.y)
    st2.e.map.items.push({ id: 991, type: 'glowstick', x: st2.spot.x + 4, y: st2.spot.y, z: 0 })
    run(st2.e, 0.1, () => { st2.e.noiseEvent(st2.e.player.x, st2.e.player.y, 10, true) })
    for (let i = 0; i < 20; i++) { st2.e.noiseEvent(st2.e.player.x, st2.e.player.y, 10, true); run(st2.e, 0.1) }
    ok(S(st2.arms).mode === 'hidden', '停电中但玩家身边有荧光棒：不触发')
  }
}

// ============================================================================
// 4. 来电立即缩回
// ============================================================================
{
  const { e, arms } = freshSearch()
  ok(S(arms).mode === 'search', '（准备）停电中已钻出探寻')
  keepDark = null
  e.endBlackout()
  run(e, 1 / 30)
  ok(S(arms).mode === 'retract' && S(arms).cd >= A.powerCd - 0.2, '来电：同一帧立即缩回（retract），并冷却 8s')
  run(e, 2)
  ok(S(arms).mode === 'hidden' && arms.hidden, '缩回完成（hidden）')
}

// ============================================================================
// 5. 只能用光赶走：累计照射 0.6s → 痉挛烧焦缩回 + 焦皮 + 冷却
// ============================================================================
{
  const { e, arms, spot } = freshSearch()
  const p = e.player
  place(e, spot.x + 3.2, spot.y + 0.4)
  p.equip.offhand = { type: 'flashlight', count: 1 }; p.flashlight = true; p.battery = 100; p.flashJamT = 0
  let lit = 0
  const tBurn = run(e, 3, () => {
    const s = S(arms), hx = s.hand.wx - (e.map.inf?.ox ?? 0), hy = s.hand.wy - (e.map.inf?.oy ?? 0)
    aimAt(e, (hx + spot.x) / 2, (hy + spot.y) / 2, (s.hand.z + AI.armsMouthZ(s.vent)) / 2)
    if (AI.armsLightRate(e, s) > 0) lit += 1 / 30
    if (s.mode === 'burnRetreat') return true
  })
  ok(S(arms).mode === 'burnRetreat', `手电光锥照住：${tBurn.toFixed(2)}s 后痉挛缩回（累计照射 ${lit.toFixed(2)}s）`)
  ok(lit >= A.burnNeed - 0.1 && lit <= A.burnNeed + 0.15, `所需累计照射约 0.6s（实测 ${lit.toFixed(2)}s）`)
  ok(audioLog.includes('arms:wail') && audioLog.includes('arms:sizzle'), '哀嚎 + 灼烧嘶声')
  p.flashlight = false
  run(e, A.debrisT + 0.1)
  ok(S(arms).marks.some((m) => m.kind === 'burn' && Math.abs(m.wx - S(arms).vent.wx) < 1e-6), '风口下留下冒烟的焦皮碎片（燃烧痕迹记录在风口正下方）')
  run(e, A.burnDur)
  ok(S(arms).mode === 'hidden' && S(arms).cd > A.burnCd - 3, `缩回后冷却 ${A.burnCd}s`)
  // 冷却中再吵也不出来
  keepDark = spot
  for (let i = 0; i < 10; i++) { e.noiseEvent(e.player.x, e.player.y, 12, true); run(e, 0.1) }
  ok(S(arms).mode === 'hidden', '冷却期间再吵也不出来')
  // 背对 / 关灯：不累计
  const st = freshSearch()
  st.e.player.equip.offhand = { type: 'flashlight', count: 1 }; st.e.player.flashlight = true; st.e.player.battery = 100
  place(st.e, st.spot.x + 3.2, st.spot.y)
  run(st.e, 1.5, () => { aimAt(st.e, st.spot.x + 12, st.spot.y, 1.5) })
  ok(S(st.arms).mode !== 'burnRetreat' && S(st.arms).expo < 0.05, '手电背对着它：不累计照射')
  // 荧光棒丢到它身下也算强光
  const st3 = freshSearch()
  const s3 = S(st3.arms), ox = st3.e.map.inf?.ox ?? 0, oy = st3.e.map.inf?.oy ?? 0
  place(st3.e, st3.spot.x + 6, st3.spot.y)
  st3.e.map.items.push({ id: 992, type: 'glowstick', x: s3.hand.wx - ox, y: s3.hand.wy - oy, z: s3.hand.z - 0.8 })
  run(st3.e, 2, () => S(st3.arms).mode === 'burnRetreat')
  ok(S(st3.arms).mode === 'burnRetreat', '荧光棒丢到它身下（1.4m 内）同样会把它烧退')
}

// ============================================================================
// 6. 武器：扣血 + 吃痛（被抓时松手）；血量清零 → 被赶走、回满、不移除、不计击杀
// ============================================================================
function swingAt(e: any, arms: any) {
  const p = e.player
  aimAt(e, arms.x, arms.y, 1.4)
  p.facing = Math.atan2(arms.y - p.y, arms.x - p.x)
  e.attackCooldownT = 0
  e.attack()
}
{
  const { e, arms } = freshSearch()
  const p = e.player
  const kills0 = p.kills
  place(e, arms.x + 1.0, arms.y + 0.2)
  const hp0 = arms.hp
  swingAt(e, arms)
  run(e, 1 / 30)
  ok(arms.hp === hp0 - 8 && S(arms).mode === 'flinch', `空手挥击命中：扣 8 血（${hp0}→${arms.hp}）并吃痛 flinch`)
  // 缩在管内时打不到
  const st = setup(); place(st.e, st.spot.x + 0.6, st.spot.y)
  swingAt(st.e, st.arms)
  ok(st.arms.hp === 30, '缩在管内（hidden）时打不到')
  // 被抓时命中 → 松手
  const g = grabbed()
  ok(S(g.arms).mode === 'grab' && g.e.armsRun.phase === 'held', '（准备）被抓住')
  swingAt(g.e, g.arms)
  run(g.e, 1 / 30)
  ok(S(g.arms).mode === 'flinch' && g.e.armsRun.captor === -1, '被抓时武器命中：它吃痛松手')
  run(g.e, 1.5)
  ok(g.e.armsRun.phase === 'none' && Math.abs(g.e.player.z - floorHeight(g.e.map, g.e.player.x, g.e.player.y, 0)) < 0.05, '松手后玩家落回地面、恢复控制')
  // 血量清零
  run(e, 2.5)
  arms.hp = 6; S(arms).hpSeen = 6
  if (S(arms).mode !== 'search') { (S(arms) as any).mode = 'search'; S(arms).t = 0 }
  e.armsRun.phase = 'none'
  place(e, arms.x + 1.0, arms.y + 0.2)
  swingAt(e, arms)
  run(e, 1 / 30)
  ok(S(arms).mode === 'banished' && !arms.dead && e.map.entities.includes(arms), '血量清零：不死亡、不移除，转为被赶走（banished）')
  ok(p.kills === kills0, '不计入击杀')
  ok(S(arms).banishT >= A.banishMin && S(arms).banishT <= A.banishMax, `被赶走时长 ${S(arms).banishT.toFixed(0)}s（${A.banishMin}–${A.banishMax}s）`)
  run(e, 3)
  ok(arms.hidden && !AI.armsHittable(arms), '被赶走期间缩在管内、打不到')
  for (let i = 0; i < 10; i++) { e.noiseEvent(e.player.x, e.player.y, 12, true); run(e, 0.1) }
  ok(S(arms).mode === 'banished', '被赶走期间再吵也不出来')
  S(arms).banishT = 0.3; S(arms).noise = 0; keepDark = null
  run(e, 0.5)
  ok(S(arms).mode === 'hidden' && arms.hp === 30 && !arms.dead, '被赶走结束：回满 30 血，回到风口待机')
  // 兜底：其它系统直接写 dead
  arms.dead = true; arms.deathT = 1.4
  run(e, 1 / 30)
  ok(!arms.dead && e.map.entities.includes(arms) && S(arms).mode === 'banished', '其它系统直接写 dead：也会复活为「被赶走」，实体不被移除')
  // 爆炸 / 电击走 killCheck：同样不死
  const st2 = freshSearch(); st2.arms.hp = 3; st2.e.killCheck(st2.arms); st2.arms.hp = -20; st2.e.killCheck(st2.arms)
  ok(!st2.arms.dead && S(st2.arms).mode === 'banished', '任意伤害源经 killCheck：血量见底也只是被赶走')
}

// ============================================================================
// 7. 扑抓：0.8s 反应时间、可闪开；抓住 → 拖拽 → 挣扎挣脱
// ============================================================================
{
  const { e, arms, spot } = freshSearch()
  place(e, spot.x + 2.0, spot.y)
  run(e, 3, () => S(arms).mode === 'lunge')
  ok(S(arms).mode === 'lunge', '玩家进入 3.6m 扑抓范围：开始蓄力扑抓')
  ok(Math.abs(A.lungeHitT - A.lungeFrom - 0.8) < 1e-6, `扑抓判定在蓄力开始后 ${(A.lungeHitT - A.lungeFrom).toFixed(2)}s（复用 lunge 片段蓄力）`)
  // 锁定扑击点（片段 0.85s）之后快速后撤 → 闪开
  run(e, A.lungeLockT - A.lungeFrom + 0.05)
  place(e, spot.x + 3.6, spot.y + 1.2)
  run(e, 1.2)
  ok(e.armsRun.phase === 'none' && S(arms).stat.grabs === 0, '蓄力期间移开：扑空（没被抓）')
  // 站着不动 → 被抓
  const g = grabbed(1601, 100)
  const hp1 = g.e.player.hp
  ok(S(g.arms).mode === 'grab' && g.e.armsRun.phase === 'held' && hp1 < 100, `站着不动被抓住（受 ${100 - hp1} 伤害）`)
  run(g.e, A.grabHold + 0.4)
  const z0 = g.e.player.z
  ok(S(g.arms).mode === 'drag' && z0 > 0.05, `开始拖向风口（玩家被提离地面 ${z0.toFixed(2)}m）`)
  // 挣扎：空格上升沿 / A·D 换向 / 触屏点击
  const r = g.e.armsRun
  const s0 = r.struggle
  g.e.input.jump = true; run(g.e, 1 / 30); g.e.input.jump = false; run(g.e, 0.1)
  const s1 = r.struggle
  look.yaw = 0
  g.e.input.mx = 1; run(g.e, 0.1); g.e.input.mx = -1; run(g.e, 0.1); g.e.input.mx = 0
  const s2 = r.struggle
  AI.armsStruggleTap(g.e); run(g.e, 0.1)
  const s3 = r.struggle
  ok(s1 > s0 + 0.8 && s2 > s1 + 0.6 && s3 > s2 + 0.6, `挣扎输入各计一次：跳跃 ${(s1 - s0).toFixed(2)} / 左右换向 ${(s2 - s1).toFixed(2)} / 触屏点击 ${(s3 - s2).toFixed(2)}`)
  for (let i = 0; i < 12 && r.phase === 'held'; i++) { g.e.input.jump = true; run(g.e, 1 / 30); g.e.input.jump = false; run(g.e, 0.1) }
  ok(r.phase !== 'held' && S(g.arms).stat.escapes === 1 && S(g.arms).mode === 'flinch', '连按挣扎：挣脱（它吃痛松手）')
  run(g.e, 1.5)
  const p = g.e.player
  ok(r.phase === 'none' && AI.armsLandingOk(g.e, p.x, p.y, 0) && Math.abs(p.z) < 0.05, '挣脱后落在合法可走的地面上')
  ok(g.arms.attackCd > 0, `挣脱后 ${A.escapeCd}s 内不再扑抓`)
}

// ============================================================================
// 8. 拖进风口：重伤不死、黑屏、撞击声远去、从 15–40m 外另一个风口吐出、落点合法；原风口下留下血迹
// ============================================================================
function swallowFlow(seed: number, hp: number, second?: (e: any, spot: any) => any) {
  const st = setup(seed), { e, arms, spot } = st
  const B = second?.(e, spot)
  triggerToSearch(e, arms, spot)
  e.player.hp = hp
  place(e, spot.x + 2.0, spot.y)
  run(e, 6, () => S(arms).mode === 'grab')
  const v0 = { x: S(arms).vent.wx, y: S(arms).vent.wy }
  let sawInside = false, black = 0, shieldOk = true, ductThumps = 0, minHp = 999, overT = -1
  const thump0 = audioLog.filter((x) => x === 'arms:thump').length
  run(e, 20, (t) => {
    const ao = AI.armsOverlay(e)
    black = Math.max(black, ao.black)
    minHp = Math.min(minHp, e.player.hp)
    if (e.armsRun.phase === 'inside') {
      if (!sawInside) { const h = e.player.hp; e.hurtPlayer(50, '测试'); if (e.player.hp !== h) shieldOk = false }
      sawInside = true
    }
    if (e.over && overT < 0) overT = t
    if (sawInside && e.armsRun.phase === 'none') return true
  })
  ductThumps = audioLog.filter((x) => x === 'arms:thump').length - thump0
  const p = e.player, ox = e.map.inf?.ox ?? 0, oy = e.map.inf?.oy ?? 0
  const dist = Math.hypot(p.x + ox - v0.x, p.y + oy - v0.y)
  return { st, e, arms, B, sawInside, black, shieldOk, ductThumps, minHp, dist, p, ox, oy, v0 }
}
{
  const R = swallowFlow(1601, 40)
  const { e, arms, p } = R
  ok(R.sawInside && R.black >= 0.99, '拖进风口：黑屏')
  ok(!e.over && p.hp > 0 && R.minHp >= A.minHp - 1e-6, `拖进风口不会死（血量最低 ${R.minHp.toFixed(1)}，下限 ${A.minHp}）`)
  ok(R.shieldOk, '在管道里时外界伤害无效')
  ok(R.ductThumps >= 6, `管道里的撞击声 ${R.ductThumps} 次（逐渐远去）`)
  ok(R.dist >= A.spitMin - 0.6 && R.dist <= A.spitMax + 2.5, `从另一个风口被吐出：离原风口 ${R.dist.toFixed(1)}m（15–40m）`)
  ok(e.armsRun.phase === 'none' && AI.armsLandingOk(e, p.x, p.y, floorHeight(e.map, p.x, p.y, 0)) && Math.abs(p.z - floorHeight(e.map, p.x, p.y, 0)) < 0.05, `吐出落点合法：可走、不在墙里、落到地面（${p.x.toFixed(2)}, ${p.y.toFixed(2)}）`)
  ok(S(arms).temps.length === 1, '附近没有别的风口：临时生成了一个吐出风口（局内内存）')
  ok(S(arms).marks.some((m) => m.kind === 'blood' && Math.abs(m.wx - R.v0.x) < 1e-6), '原风口下留下血迹')
  run(e, 2.5)
  ok(e.map.entities.includes(arms) && !arms.dead && S(arms).mode === 'hidden' && S(arms).cd > 30, '吐完缩回、长时间冷却；实体仍在')
  ok(audioLog.includes('arms:spit'), '吐出 + 落地音效')
  // 有另一只手臂在 25m 外：从它的风口吐出
  const R2 = swallowFlow(1601, 100, (e2: any, spot: any) => {
    const sp = openSpot(e2, 2.5, { x: spot.x, y: spot.y, r: 18 })
    const d = Math.hypot(sp.x - spot.x, sp.y - spot.y)
    if (d < 16 || d > 39) return null
    return addArms(e2, sp.x, sp.y)
  })
  if (R2.B) {
    const bs = S(R2.B), bx = bs.vent.wx - R2.ox, by = bs.vent.wy - R2.oy
    ok(Math.hypot(R2.p.x - bx, R2.p.y - by) < 2.2 && S(R2.arms).temps.length === 0 && bs.stat.swallows === 0, `15–40m 内有空闲的另一个风口：从它吐出（距原风口 ${R2.dist.toFixed(1)}m）`)
  } else info('（另一个风口用例：附近找不到 16–39m 的开阔地，跳过）')
}

// ============================================================================
// 9. 同一片区域只出动最近的风口；存档字段无变化；实体从不被移除
// ============================================================================
{
  const { e, arms, spot } = setup()
  const far = addArms(e, spot.x + 6.5, spot.y) // 另一个风口离玩家更远
  keepDark = spot
  place(e, spot.x - 1.5, spot.y)
  for (let i = 0; i < 12; i++) { e.noiseEvent(e.player.x, e.player.y, 10, true); run(e, 0.1) }
  ok(S(arms).mode !== 'hidden' && S(far).mode === 'hidden', '连通的两个风口：只有离玩家最近的那个出动')
  const snap = e.snapshot(), js = JSON.stringify(snap)
  const keys = { top: Object.keys(snap).sort(), player: Object.keys(snap.player).sort(), l1World: Object.keys(snap.l1World ?? {}).sort(), saveKeys: EFFECTS.filter((x: any) => x.saveKey).map((x: any) => x.saveKey).sort() }
  ok(JSON.stringify(keys) === JSON.stringify(BASE_SNAP), '存档快照字段与项目现有格式一致（含 tradersWorld、bntgBank）（顶层 / player / l1World / effects 存档键）')
  ok(!/armsRun|"ar"|"marks"|"temps"/.test(js), '存档里没有手臂的任何运行时状态')
}

// ============================================================================
// 10. 动画驱动 + 管道朝向（渲染层数据）
// ============================================================================
{
  const { e, arms } = setup()
  const s = S(arms)
  const plan = AI.armsDuctPlan(e, arms.x, arms.y, s.vent.ceil)
  ok(Math.abs(plan.yaw - s.vent.yaw) < 1e-9 && (s.vent.ductUp === A.ductUp || s.vent.ductUp === A.ductFlatUp), `管道规划：水平段朝向 ${(s.vent.yaw * 180 / Math.PI).toFixed(0)}°、竖直段 ${s.vent.ductUp}m（邻格最高天花板 ${plan.maxNeighbour.toFixed(2)}m，本处 ${s.vent.ceil.toFixed(2)}m）`)
  const v = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI - s.vent.yaw)
  ok(Math.abs(-v.x - Math.cos(s.vent.yaw)) < 1e-9 && Math.abs(v.z - Math.sin(s.vent.yaw)) < 1e-9, '渲染层 rotation.y = π − yaw：臂空间 −X（管道水平段）指向规划方向')
}

// Integration regressions: own damage must bypass only the duct shield; input stays locked there.
{
  const {e,arms,spot}=setup();const s=S(arms);keepDark=spot
  s.mode='swallow';s.clipT=A.swallowInside-.02;s.t=s.clipT;e.armsRun.captor=arms.id;e.armsRun.phase='held';e.player.hp=100
  run(e,.07)
  ok(e.armsRun.phase==='inside'&&Math.abs(e.player.hp-70)<.01,'管道内自身伤害正确结算30点，不被外部伤害屏蔽吞掉')
  const hp=e.player.hp;e.hurtPlayer(20,'测试外部伤害');ok(e.player.hp===hp,'自身伤害结算后仍阻止外部伤害')
  e.handsStowed=false;e.player.backpack[0]={type:'sedgland',count:1};e.usingItem=null
  ok(AI.armsInputLock(e)&&!e.useSlot('backpack',0)&&e.player.backpack[0]?.count===1,'管道中UI直接使用物品被拦截且不消耗')
  e.armsRun.phase='held';s.mode='grab';s.clipT=.2
  ok(!AI.armsInputLock(e)&&e.useSlot('backpack',0),'被抓住时仍允许使用物品反抗')
  e.usingItem=null;keepDark=null
}

mkdirSync('reports/arms', { recursive: true })
lines.push('', `${n - fails}/${n} 通过`)
writeFileSync('reports/arms/mechanics-check.txt', lines.join('\n') + '\n')
console.log(`\n${n - fails}/${n} 通过`)
if (fails) process.exit(1)
