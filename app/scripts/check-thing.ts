/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// [thing] 七层之物（Entity 20（旧））重制 阶段 3——机制无头验收（真实 Engine + 手搭深水地图）。运行：npm run check:thing
import { createCanvas } from '@napi-rs/canvas'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { makeEntity, type Entity } from '../src/game/entities'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256) },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const { look } = await import('../src/game/core/renderer3d')
const { audio } = await import('../src/game/core/audio')
const { ITEMS } = await import('../src/game/content/items')
const { L7 } = await import('../src/game/levels/l7')
const { genL7ChunkRaw } = await import('../src/game/world/infiniteL7')
const T = await import('../src/game/engine/thingAI')
const { THINGM } = T
const { TAR_WORDS, TAR_WORDS_CUT } = await import('../src/game/content/thingTar')
const { devKillAllEntities } = await import('../src/game/engine/dev')
const { updateMeleeInput } = await import('../src/game/engine/melee')
const { MELEE } = await import('../src/game/content/melee')
for (const k of Object.keys(audio)) if (typeof (audio as any)[k] === 'function') (audio as any)[k] = () => {}

let fails = 0, n = 0
const ok = (c: unknown, m: string, dbg?: unknown) => { n++; console.log(`${c ? '✔' : '✘'} ${m}${!c && dbg !== undefined ? ' ⟵ ' + JSON.stringify(dbg) : ''}`); if (!c) fails++ }
const DT = 1 / 30
const DEPTH = 120, S = 260, C = { x: 130, y: 130 }

/** 260×260 全深水（海床 120m）；七层之物头心在 (130,130)、面朝 +x、离底 20m */
function world(opts: { dormant?: boolean } = {}) {
  const eng: any = new Engine(), N = S * S, zero = () => new Uint8Array(N)
  eng.player.level = 7
  eng.map = { w: S, h: S, tiles: zero().fill(1), structures: [], items: [], lights: [], exits: [], entities: [] as Entity[], spawn: { x: 20, y: 20 },
    wet: zero(), elev: zero(), outdoor: zero(), step: zero(), crawl: zero(), ceiling: zero(), up: zero(), upWall: zero(), up2: zero(), upWall2: zero(), stair: new Int32Array(N),
    liquid: zero().fill(1), seaFloor: new Float32Array(N).fill(DEPTH), floors: 1, dn: zero(), dnWall: zero(), tint: zero() }
  const m = eng.map
  for (let i = 0; i < S; i++) { m.tiles[i] = 0; m.tiles[(S - 1) * S + i] = 0; m.tiles[i * S] = 0; m.tiles[i * S + S - 1] = 0 }
  eng.explored = new Uint8Array(N)
  const p = eng.player
  Object.assign(p, { level: 7, x: 30.5, y: 30.5, z: -DEPTH + 20, floor: 0, hp: 100, sanity: 100, hunger: 30, facing: 0, flashlight: false, battery: 100, stamina: 100 })
  look.yaw = 0; look.pitch = 0
  const msgs: string[] = []; const msg0 = eng.msg.bind(eng); eng.msg = (t: string, k?: any) => { msgs.push(t); msg0(t, k) }
  eng.emit = () => {}
  eng.persist = () => {}
  const e = makeEntity('thething', C.x, C.y, -DEPTH + 20)
  e.facing = 0
  m.entities.push(e)
  const r0 = Math.random
  Math.random = () => (opts.dormant === false ? 0.99 : 0.01) // 生成时休眠概率 0.7
  const tick = () => { if (eng.hitStopT > 0) eng.hitStopT = Math.max(0, eng.hitStopT - DT); if (eng.attackCooldownT > 0) eng.attackCooldownT = Math.max(0, eng.attackCooldownT - DT); updateMeleeInput(eng, DT, false); eng.updateEntities(DT, 1); T.stepThingWorld(eng, DT); eng.time = (eng.time ?? 0) + DT; for (const k of ['thingMeatCd', 'thingBreathT'] as const) if (eng[k] > 0) eng[k] -= DT }
  tick()
  Math.random = r0
  const run = (secs: number, each?: () => void) => { for (let t = 0; t < secs && !eng.over; t += DT) { each?.(); tick() } }
  /** 把玩家放在第 k 节躯干侧面、离表面 gap 米，面朝身体 */
  const besideBody = (k: number, gap = 1) => {
    const c = e.th!.chain[k], c2 = e.th!.chain[k + 1]
    const mx = (c.x + c2.x) / 2, my = (c.y + c2.y) / 2
    p.x = mx; p.y = my + THINGM.BODY_R0 + gap; p.z = e.z; p.facing = -Math.PI / 2
    look.yaw = 0
  }
  const hold = (type: string) => { p.hotbar[0] = { type, count: 1 }; p.selected = 0 }
  const swing = () => { eng.attackCd = 0; eng.attackCooldownT = 0; eng.meleePending = null; eng.meleePress = null; eng.meleeCharge = 0; p.stamina = 100; const held = p.hotbar[p.selected]; eng.attack(); const tm = held && MELEE[held.type as keyof typeof MELEE]?.light; run((tm?.windup ?? 0.7) * (tm?.dur ?? 0.5) + 2 * DT) }
  const meat = () => [...p.hotbar, ...(p.inventory ?? [])].filter(Boolean).reduce((a: number, s: any) => a + (s.type === 'thingmeat' ? s.count : 0), 0)
  return { eng, m, p, e, msgs, tick, run, besideBody, hold, swing, meat }
}

// ===== 不再自然生成 =====
{
  const src = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const q = join(dir, f); return statSync(q).isDirectory() ? src(q) : q.endsWith('.ts') ? [q] : [] })
  const gen = [...src('src/game/world'), ...src('src/game/levels'), ...src('src/game/decorations'), 'src/game/entities/deep.ts']
  const hits = gen.filter((f) => /['"]thingmeat['"]/.test(readFileSync(f, 'utf8').replace(/WATER_SINK = new Set\([^)]*\)/, '')))
  ok(hits.length === 0, `生成代码（world / levels / decorations / deep.ts）里没有任何 thingmeat 掉落或生成（命中 ${hits.join(', ') || '无'}）`)
  ok(!L7.items.some((q) => q.type === 'thingmeat'), 'L7 掉落池里没有彼物之肉')
  const npcSrc = readFileSync('src/game/content/npcs.ts', 'utf8')
  ok(!/get:\s*'thingmeat'/.test(npcSrc) && /give:\s*'thingmeat'/.test(npcSrc), 'NPC 配方只「收」彼物之肉，没有任何 NPC「给」彼物之肉')
  ok(ITEMS.thingmeat.use === 'eat' && ITEMS.thingmeat.name === '彼物之肉', '物品仍是可食用的「彼物之肉」')
}

// ===== 不可杀 =====
{
  const { eng, e, run } = world({ dormant: false })
  e.hp -= 99999; eng.killCheck(e)
  ok(!e.dead && e.hp === e.def.hp, `扣 99999 血后 killCheck：不死、血量回满（${e.hp}）`)
  const n0 = devKillAllEntities(eng)
  ok(!e.dead && n0 === 0, '开发者「清场」也杀不死它')
  e.hp = 1; run(0.1)
  ok(e.hp === e.def.hp, '每帧再生回满')
}
{
  const { eng, e, besideBody, hold, swing, msgs } = world({ dormant: false })
  besideBody(2); hold('crowbar'); eng.dev.oneHit = true
  for (let i = 0; i < 4; i++) swing()
  ok(!e.dead && e.hp === e.def.hp, '开发者一击必杀的近战也打不死它')
  ok((e.turnSlowT ?? 0) > 0 && msgs.some((t) => t.includes('伤不到它分毫')), '普通武器打中躯干：不掉血、转头迟滞')
}

// ===== 割肉 =====
{
  const { eng, e, p, besideBody, hold, swing, meat, msgs, run } = world({ dormant: true })
  ok(e.th!.dormant && e.state === 'idle', '生成时休眠（漂流装死）')
  besideBody(3); hold('knife')
  swing(); swing()
  ok(meat() === 0 && e.th!.cut === 2, '锯两刀：还没割下来')
  swing()
  ok(meat() === 1, '同一处锯第三刀：割下 1 块彼物之肉')
  ok(e.th!.dormant, '睡着时割它，它不醒')
  swing(); swing(); swing()
  ok(meat() === 1 && msgs.some((t) => t.includes('手还在抖')), `两块之间有 ${THINGM.MEAT_CD}s 冷却`)
  run(THINGM.MEAT_CD + 0.5)
  for (let i = 0; i < 3; i++) swing()
  run(THINGM.MEAT_CD + 0.5)
  for (let i = 0; i < 3; i++) swing()
  ok(meat() === 3 && e.th!.meat === 0, `每只身上最多同时割 ${THINGM.MEAT_CAP} 块`)
  run(THINGM.MEAT_CD + 0.5)
  for (let i = 0; i < 3; i++) swing()
  ok(meat() === 3 && msgs.some((t) => t.includes('刚愈合的新肉')), '割光后：刀吃不进去')
  run(THINGM.MEAT_REGEN + 1)
  ok(e.th!.meat === 1, `伤口 ${THINGM.MEAT_REGEN}s 长好一块`)
  // 头上也能割
  p.x = e.x + 0.5 * Math.cos(e.facing); p.y = e.y + THINGM.HEAD_R + 1; p.z = e.z; p.facing = -Math.PI / 2
  for (let i = 0; i < 3; i++) swing()
  ok(meat() === 4 && msgs.some((t) => t.includes('它在装死')), '头上也能割（它还是装死）', { meat: meat(), last: msgs.slice(-3), cd: eng.thingMeatCd, th: e.th!.meat })
  besideBody(3, 6)
  for (let i = 0; i < 3; i++) swing()
  ok(meat() === 4, `离表面超过 ${THINGM.MELEE}m 割不到`)
  eng.dev.oneHit = false
}
{
  // 醒着割：惊逃甩身（水墙伤人、推开）
  const { eng, e, p, besideBody, hold, swing, run } = world({ dormant: false })
  besideBody(2, 0.8); hold('knife')
  const r0 = Math.random; Math.random = () => 0.1
  const hp0 = p.hp
  swing(); swing(); swing()
  Math.random = r0
  ok(e.th!.fleeT > 0, '醒着时割下肉：惊逃（FLEE_P 命中）')
  ok(p.hp < hp0, `甩身掀起的水墙伤人（${hp0} → ${Math.round(p.hp)}）`)
  const d0 = Math.hypot(e.x - p.x, e.y - p.y)
  run(3)
  ok(Math.hypot(e.x - p.x, e.y - p.y) > d0 + 10, '惊逃时背离玩家高速游走')
  run(THINGM.FLEE_T)
  ok(e.th!.fleeT <= 0 && !e.activated, '惊逃结束后平静下来')
  void eng
}
{
  // 醒着割：直接扑过来
  const { e, besideBody, hold, swing } = world({ dormant: false })
  besideBody(2, 0.8); hold('knife')
  const r0 = Math.random; Math.random = () => 0.9
  swing(); swing(); swing()
  Math.random = r0
  ok(e.activated && e.th!.fleeT <= 0 && e.state !== 'idle' && e.state !== 'wander', '醒着时割下肉：另一半概率直接扑咬（激怒）', { a: e.activated, s: e.state, flee: e.th!.fleeT })
}
{
  // 普通武器把睡着的打醒
  const { e, besideBody, hold, swing } = world({ dormant: true })
  besideBody(1); hold('crowbar'); swing()
  ok(!e.th!.dormant && e.activated && e.state !== 'idle', '用普通武器打睡着的它：醒来（激怒）', { d: e.th!.dormant, a: e.activated, s: e.state })
}

// ===== 休眠 / 唤醒 / 重新睡去 =====
{
  const { eng, e, p, run } = world({ dormant: true })
  p.x = e.x - 30; p.y = e.y
  eng.noiseEvent(p.x, p.y, 6, false); run(0.2)
  ok(e.th!.dormant, '30m 外的普通游动声：不醒')
  p.x = e.x - 9
  eng.noiseEvent(p.x, p.y, 6, true); run(0.2)
  ok(!e.th!.dormant && (e.state === 'investigate' || e.state === 'chase'), `${THINGM.WAKE_R}m 内冲刺游动：吵醒它，朝声源游来`, { d: e.th!.dormant, s: e.state })
}
{
  const { e, p, run } = world({ dormant: true })
  p.x = e.x + 15; p.y = e.y; p.z = e.z; p.flashlight = true; look.yaw = Math.PI / 2 // 面朝 -x（对着头）
  run(0.8)
  ok(e.th!.dormant, '手电扫过一下：不醒')
  run(1.2)
  ok(!e.th!.dormant, `强光停在头上超过 ${THINGM.WAKE_LIGHT_T}s：醒`)
}
{
  const { e, p, run } = world({ dormant: false })
  e.state = 'wander'; p.x = e.x - 80; p.y = e.y
  run(THINGM.RESLEEP_T + 2)
  ok(e.th!.dormant && e.state === 'idle', `玩家在 ${THINGM.RESLEEP_D}m 外 ${THINGM.RESLEEP_T}s：重新睡去`)
}

// ===== 只追踪运动中的物体 =====
{
  const { e, p, run, msgs } = world({ dormant: false })
  p.x = e.x + 13.5; p.y = e.y; p.z = e.z
  e.activated = true; e.state = 'chase'; e.stateT = 0
  p.flashlight = false
  // 站着不动（不按任何键）
  let lost = false
  run(THINGM.STILL_T + 1, () => { if (e.state === 'wander') lost = true; p.hp = 100 })
  ok(lost && e.th!.lost && p.hp === 100, `关灯静止 ${THINGM.STILL_T}s：它丢失目标，游过去`, { s: e.state, still: e.th!.still, hp: p.hp })
  run(5, () => { p.hp = 100 })
  ok(e.th!.lost && e.state !== 'chase' && e.state !== 'attack', '保持关灯静止不会被通用近距索敌立即重新锁定')
}
{
  const { e, p, run } = world({ dormant: false })
  p.x = e.x + 14; p.y = e.y; p.z = e.z
  e.activated = true; e.state = 'chase'; e.stateT = 0
  let t = 0, lost = false
  run(THINGM.STILL_T + 1, () => { t += DT; p.y = e.y + Math.sin(t * 3) * 2; p.hp = 100; if (e.state === 'wander') lost = true })
  ok(!lost, '一直在动：它不会丢失目标')
}

// ===== 体型：碰撞、咬合距离 =====
{
  const { e, p, run } = world({ dormant: true })
  p.x = e.x + 1; p.y = e.y + 1; p.z = e.z
  run(0.6)
  const s = T.thingSurface({ player: p } as any, e)
  ok(s.d > -0.2, `游进头里会被推出来（离表面 ${s.d.toFixed(2)}m）`)
  T.thingState(e)!.chain.length === THINGM.SEGS + 1 ? ok(true, `简化跟随链 ${THINGM.SEGS} 节、节距 ${THINGM.SEG.toFixed(2)}m`) : ok(false, '跟随链长度')
}
{
  const { e, p, run } = world({ dormant: false })
  p.x = e.x + 7.5; p.y = e.y; p.z = e.z
  e.activated = true; e.state = 'chase'; e.stateT = 0
  const hp0 = p.hp
  let bit = false
  run(4, () => { p.y = e.y + Math.sin(e.animT) * 0.5; if (e.state === 'attack') bit = true })
  ok(bit && p.hp < hp0, `口在头心前约 6.6m：7.5m 处就会被咬（咬合距离 ${THINGM.BITE_REACH}m，${hp0} → ${Math.round(p.hp)}）`)
}

// ===== 食用 / 口臭 / 吸引 =====
{
  const { eng, e, p, run, msgs } = world({ dormant: true })
  p.x = e.x - 120; p.y = e.y
  p.hotbar[0] = { type: 'thingmeat', count: 1 }; p.selected = 0
  const h0 = p.hunger
  eng.useSlot('hotbar', 0)
  for (let t = 0; t < 3 && eng.usingItem; t += DT) { eng.updateItemUse(DT); run(DT) }
  ok(p.hunger >= h0 + 54 && eng.thingBreathT > 590, `吃下：饥饿 +55（${h0} → ${p.hunger}），口臭 ${Math.round(eng.thingBreathT)}s`)
  ok(msgs.some((t) => t.includes('硫磺')), '提示硫磺味')
  run(5)
  ok(!e.th!.dormant && (e.state === 'investigate' || e.state === 'chase') && msgs.some((t) => t.includes('闻到了自己的肉味')), `${THINGM.BREATH_THING_R}m 内的七层之物闻到自己的肉味：醒来朝你游来`, { d: e.th!.dormant, s: e.state })
  ok(!!T.thingBreathRemark(eng, '技术员'), 'NPC 交谈时嫌弃你的口气')
  eng.thingBreathT = 0
  ok(T.thingBreathRemark(eng, '技术员') === null, '口臭散了就不再提')
}
{
  const { eng, e, p, run } = world({ dormant: true })
  p.x = e.x - 200; p.y = e.y
  eng.thingBreathT = 600; eng.thingBreathPingT = 0.1
  run(1)
  ok(e.th!.dormant, `${THINGM.BREATH_THING_R}m 外闻不到`)
  // 气味像一次噪音：近处的普通实体会被引过来
  const h = makeEntity('hound', p.x + 10, p.y, p.z); eng.map.entities.push(h); h.state = 'wander'
  eng.thingBreathPingT = 0.05; run(0.3)
  ok(h.state === 'investigate' || h.state === 'chase', `口臭气味（${THINGM.BREATH_NOISE_R}m）把附近实体引过来（hound → ${h.state}）`)
}

// ===== 焦油写字 =====
{
  const { eng, m, p, run, msgs } = world({ dormant: true })
  p.x = 60; p.y = 60
  const s = T.writeTar(eng, true)!
  ok(!!s && s.kind === 'tarwriting' && (TAR_WORDS_CUT as readonly string[]).includes(String(s.data!.text)), `割过它之后写下新字「${s?.data?.text}」`)
  ok(m.structures.includes(s) && eng.mapRev > 0, '写进地图并触发几何重建')
  const san0 = p.sanity
  p.x = s.x + 2; p.y = s.y + 1; p.z = -(m.seaFloor[Math.floor(s.y) * S + Math.floor(s.x)] ?? DEPTH) + 1.35; run(0.1)
  ok(msgs.some((t) => t.includes(`「${s.data!.text}」`)) && p.sanity < san0, '游近读到：理智下降')
  const k = msgs.length; run(0.5)
  ok(msgs.length === k, '同一行字只读一次')
  p.z += 20; p.x = s.x; p.y = s.y; const beforeHigh = msgs.length; run(0.2)
  ok(msgs.length === beforeHigh, '同 xy 但高出海床 20m 不会读到焦油字')
}
{
  const { e, besideBody, hold, swing, eng } = world({ dormant: true })
  besideBody(3); hold('knife')
  const r0 = Math.random; Math.random = () => 0.05
  swing(); swing(); swing()
  Math.random = r0
  ok(e.th!.tarT > 0, `割下肉后有 ${THINGM.TAR_P * 100}% 概率在 ${THINGM.TAR_DELAY}s 后写字`)
  void eng
}
{
  let total = 0, cnt = 0
  const words = new Set<string>()
  for (const seed of [1, 777, 20261022]) for (let cx = -14; cx <= 14; cx += 2) for (let cy = -14; cy <= 14; cy += 2) {
    const ch = genL7ChunkRaw(L7, seed, cx, cy); total++
    for (const s of ch.structures) if (s.kind === 'tarwriting') { cnt++; words.add(String(s.data?.text)) }
  }
  ok(cnt > 0 && cnt < total * 0.2 && [...words].every((w) => (TAR_WORDS as readonly string[]).includes(w)), `海床原本就有的焦油字：${total} 个 chunk 里 ${cnt} 处（${[...words].join(' / ')}）`)
  const a = genL7ChunkRaw(L7, 777, 4, 6), b = genL7ChunkRaw(L7, 777, 4, 6)
  ok(JSON.stringify(a.structures) === JSON.stringify(b.structures), 'L7 生成仍是纯函数')
}

// ===== 与渲染尺寸一致 =====
{
  const { THING } = await import('../src/game/renderer/thingMesh')
  ok(Math.abs(THING.spacing - THINGM.SEG) < 1e-9 && THING.segs === THINGM.SEGS && Math.abs(THING.S * 1.6 - THINGM.BODY_R0) < 1e-9, '引擎侧跟随链与渲染模型同节距、同节数、同半径')
}


// ===== Current streaming origin and projectile compatibility =====
{
  const {eng,e,p}=world({dormant:true})
  eng.map.inf={ox:0,oy:0,chunks:new Map(),seed:424242} as any
  p.x=e.x+25;p.y=e.y;p.z=e.z
  T.updateThing(eng,e,.1,25,false,false)
  const before=e.th!.chain.map(q=>({...q})),lastX=e.th!.lastPx,lastY=e.th!.lastPy
  eng.map.inf.ox=32;eng.map.inf.oy=-64;e.x-=32;e.y+=64;p.x-=32;p.y+=64
  T.thingSurface(eng,e)
  ok(e.th!.chain.every((q,i)=>Math.hypot(q.x+32-before[i].x,q.y-64-before[i].y,q.z-before[i].z)<1e-7),'streamed collision chain preserves world coordinates for all 29 nodes')
  ok(Math.abs(e.th!.lastPx+32-lastX)<1e-7&&Math.abs(e.th!.lastPy-64-lastY)<1e-7,'streamed previous player position preserves world coordinates')
  e.th!.dormant=false;e.state='chase';const still=e.th!.still
  T.updateThing(eng,e,.1,25,false,false)
  ok(e.th!.still>still,'window movement does not count as active player motion')
}
{
  const {eng,e}=world({dormant:true});e.hp-=25;eng.killCheck(e)
  ok(!e.th!.dormant&&e.hp===e.def.hp&&!e.dead,'non-melee damage wakes sleeping Thing while keeping it invulnerable')
}

console.log(`\ncheck:thing ${n - fails}/${n}${fails ? '' : ' 全部通过'}`)
process.exit(fails ? 1 : 0)
