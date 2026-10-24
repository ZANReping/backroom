/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// 无面灵（Entity 9）重制 阶段 3——机制无头验收（真实 Engine + 手搭空房间）。运行：npm run check:faceling
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
const { LEVELS } = await import('../src/game/levels')
const F = await import('../src/game/engine/facelingAI')
const { specialAction } = await import('../src/game/engine/special')
const { facelingAge } = await import('../src/game/entities/facelingTraits')
const { FACELING_CLIPS } = await import('../src/game/renderer/facelingAnim')
const { genL2ChunkRaw } = await import('../src/game/world/infiniteL2')
const { FC } = F
let cries = 0;
(audio as any).facelingCry = () => { cries++ }

let fails = 0, n = 0
const ok = (c: unknown, m: string) => { n++; console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
const DT = 1 / 30

/** 40×40 空房间（四周是墙）。level 决定 levelDef（L2 / L3 / L9） */
function world(level = 2) {
  const eng: any = new Engine(), S = 40, N = S * S, zero = () => new Uint8Array(N)
  eng.player.level = level
  eng.map = { w: S, h: S, tiles: zero().fill(1), structures: [], items: [], lights: [], exits: [], entities: [] as Entity[], spawn: { x: 20, y: 20 },
    wet: zero(), elev: zero(), outdoor: zero(), step: zero(), crawl: zero(), ceiling: zero(), up: zero(), upWall: zero(), up2: zero(), upWall2: zero(), stair: new Int32Array(N),
    liquid: zero(), seaFloor: new Float32Array(N).fill(1.7), floors: 1, dn: zero(), dnWall: zero(), tint: zero() }
  const m = eng.map
  for (let i = 0; i < S; i++) { m.tiles[i] = 0; m.tiles[(S - 1) * S + i] = 0; m.tiles[i * S] = 0; m.tiles[i * S + S - 1] = 0 }
  eng.explored = new Uint8Array(N)
  const p = eng.player
  Object.assign(p, { level, x: 20.5, y: 20.5, z: 0, floor: 0, hp: 100, sanity: 80, facing: 0, flashlight: false, battery: 100, stamina: 100 })
  const msgs: string[] = []; const msg0 = eng.msg.bind(eng); eng.msg = (t: string, k?: any) => { msgs.push(t); msg0(t, k) }
  eng.emit = () => {}; eng.persist = () => {}
  const tick = () => { eng.updateEntities(DT, 1); eng.time = (eng.time ?? 0) + DT }
  const run = (secs: number, each?: () => void) => { for (let t = 0; t < secs && !eng.over; t += DT) { each?.(); tick() } }
  const until = (test: () => boolean, secs = 20, each?: () => void) => { for (let t = 0; t < secs && !test() && !eng.over; t += DT) { each?.(); tick() } return test() }
  const add = (x: number, y: number, o: { age?: 'child' | 'adult' | 'elder'; evolved?: boolean; tool?: boolean } = {}) => {
    const e = makeEntity('faceling', x, y)
    if (o.evolved) e.def = { ...e.def, passive: false, l3face: true, ...(o.tool ? { tool: true } : {}) }
    else e.def = { ...e.def, tool: false }
    if (o.age) e.fcAge = o.age
    e.state = 'idle'; e.stateT = 99
    m.entities.push(e); return e
  }
  return { eng, m, p, msgs, tick, run, until, add }
}
const withRandom = <T>(v: number, f: () => T) => { const r = Math.random; Math.random = () => v; try { return f() } finally { Math.random = r } }

// ── 定义 / 图鉴 / 动作表
{
  const d = ENTITIES.faceling
  ok(d.codex.habitat.includes('Level 2') && d.codex.habitat.includes('Level 3'), '图鉴栖息地含 L2（罕见）与 L3（进化种）')
  ok(d.codex.lore.some((l: string) => l.includes('触碰诅咒')), '「触碰诅咒」只写进图鉴 lore')
  ok(d.codex.counter.includes('安抚'), '对策提到安抚幼体')
  ok(Object.values(FACELING_CLIPS).every((c) => c.dur > 0), `动作表 ${Object.keys(FACELING_CLIPS).length} 个片段都有时长`)
  ok([2, 3, 9, 11].every((id) => (LEVELS as any[]).find((l) => l.id === id)?.entities?.some((s: any) => s.type === 'faceling') || id === 2), 'L3 / L9 / L11 生成池保留无面灵')
}

// ── 年龄：渲染与 AI 同源
{
  const { add } = world()
  const a = add(10, 10)
  ok(F.facelingAgeOf(a) === facelingAge(a.id, false), '年龄缺省按实体 id 确定（与模型同一种子）')
  const c = add(11, 10, { age: 'child' })
  ok(F.facelingAgeOf(c) === 'child', '生成标记 fcAge 覆盖年龄')
}

// ── 幼体哭闹 → 理智下降 / 哭声 → 安抚 → 抱腿 → 牵手 → 松手离开
{
  const { eng, p, msgs, run, until, add } = world()
  const c = add(21.6, 20.5, { age: 'child' })
  F.updateFaceling(eng, c, DT); c.fc!.tantrumCd = 0
  ok(withRandom(0, () => until(() => c.fc!.mode === 'tantrum', 1)), '幼体在玩家附近随机发作哭闹')
  ok(c.fc!.gesture === 'tantrum', '哭闹动作 = 躺地踢打')
  const s0 = p.sanity; cries = 0
  run(3)
  ok(p.sanity < s0 - 1, `哭声让附近玩家理智下降（${s0.toFixed(1)} → ${p.sanity.toFixed(1)}）`)
  ok(cries >= 1, `播放闷哭声 ${cries} 次`)
  p.x = 25; ok(!specialAction(eng), '离开 1.8 米外：没有「安抚」')
  p.x = 20.5; const a = specialAction(eng)
  ok(a?.id === 'soothe' && a.hold, `贴近后特殊交互键 = ${a?.label}（按住）`)
  eng.specialHeld = true; run(1); eng.specialHeld = false; run(1.5)
  ok(c.fc!.mode === 'tantrum' && c.fc!.soothe < 1, '中途松手：安抚进度回退')
  const s1 = p.sanity
  eng.specialHeld = true
  ok(until(() => c.fc!.mode === 'soothed', 4), '按住约 2.4 秒：幼体被安抚')
  eng.specialHeld = false
  ok(p.sanity >= s1 + FC.SOOTHE_SAN - 2, `安抚回复理智 +${FC.SOOTHE_SAN}`)
  ok(msgs.some((t) => t.includes('哭声渐渐小了')), '安抚提示文本')
  ok(until(() => c.fc!.mode === 'hug', 5) && c.fc!.gesture === 'hug-leg', '平静后抱住玩家的腿')
  run(1)
  ok(Math.hypot(c.x - p.x, c.y - p.y) < 0.8, '抱腿时贴在玩家身边')
  ok(until(() => c.fc!.mode === 'follow', 5) && c.fc!.gesture === 'hold-hand', '抱完改为牵手跟随')
  // 玩家慢慢走，幼体跟上
  run(6, () => { p.x = Math.min(30, p.x + 0.9 * DT) })
  ok(Math.hypot(c.x - p.x, c.y - p.y) < 1.6, `跟随：与玩家距离 ${Math.hypot(c.x - p.x, c.y - p.y).toFixed(2)} 米`)
  ok(c.state !== 'chase' && c.state !== 'attack', '跟随中不攻击')
  ok(until(() => c.fc!.mode === 'none', FC.FOLLOW_T + 2), '一小段之后自己松手（不领养）')
  ok(c.fc!.tantrumCd > 60, '松手后长冷却，不会马上又哭')
}

// ── 跟随被甩开就松手
{
  const { eng, p, run, add } = world()
  const c = add(21, 20.5, { age: 'child' }); F.updateFaceling(eng, c, DT)
  c.fc!.mode = 'follow'; c.fc!.modeT = 0; c.fc!.gesture = 'hold-hand'
  p.x = 33; run(0.3)
  ok(c.fc!.mode === 'none', '玩家跑出 8 米：幼体松手')
}

// ── 护幼：打幼体 → 10 米内成体激怒；幼体不还手
{
  const { eng, msgs, run, add } = world()
  const c = add(22, 20.5, { age: 'child' }), near = add(26, 22, { age: 'adult' }), far = add(36, 36, { age: 'elder' })
  run(0.2)
  c.provoked = true; c.state = 'chase'
  run(0.2)
  ok(near.provoked && (near.state === 'chase' || near.state === 'attack' || near.fc?.mode === 'rage'), '10 米内的成体被激怒')
  ok(!far.provoked, '远处成体不受影响')
  ok(msgs.some((t) => t.includes('孩子')), '护幼提示')
  ok(c.fc!.mode === 'tantrum' && c.state !== 'chase' && c.state !== 'attack', '被打的幼体倒地哭闹，不还手')
  run(16)
  ok(!c.provoked, '幼体 15 秒后不再算作被激怒')
}

// ── 进化种：幼体不主动攻击；成体每次暴起先暴怒前摇；持锤者抡锤
{
  const { eng, p, run, until, add } = world(3)
  const kid = add(22, 20.5, { age: 'child', evolved: true })
  run(2)
  ok(kid.state !== 'chase' && kid.state !== 'attack', '进化种幼体不追击玩家')
  const a = add(24, 20.5, { age: 'adult', evolved: true }); a.state = 'wander'
  ok(until(() => a.fc?.mode === 'rage', 3), '进化种成体看到玩家：先暴怒')
  ok(a.fc!.gesture === 'rage', '徒手：暴怒捶打动作')
  const x0 = a.x; run(0.5)
  ok(Math.abs(a.x - x0) < 0.05, '暴怒前摇期间原地不动')
  ok(until(() => a.fc!.mode === 'none' && a.state === 'chase', 2), '前摇结束后追击')
  const t = add(18, 20.5, { age: 'adult', evolved: true, tool: true }); t.state = 'wander'
  ok(until(() => t.fc?.mode === 'rage', 3) && t.fc!.gesture === 'smash', '持石锤个体：抡锤前摇')
  ok(until(() => t.fc!.mode === 'none', FC.SMASH_T + 0.3), `抡锤前摇 ${FC.SMASH_T}s`)
  void p
}

// ── 久哭无人理 → 惹恼附近的进化种成体
{
  const { eng, run, add } = world(3)
  const kid = add(22, 20.5, { age: 'child', evolved: true })
  const adult = add(28, 26, { age: 'adult', evolved: true }); adult.def = { ...adult.def, sight: 0.1 }
  F.updateFaceling(eng, kid, DT); kid.fc!.mode = 'tantrum'; kid.fc!.gesture = 'tantrum'; kid.fc!.modeT = 0
  adult.state = 'idle'
  run(FC.IRK_T - 2)
  ok(!adult.provoked, '哭闹 20 秒内：进化种成体还没被惹恼')
  run(3)
  ok(adult.provoked, `哭闹超过 ${FC.IRK_T}s 无人安抚：附近的进化种成体被惹恼`)
}

// ── 哭够了自己停
{
  const { eng, run, add } = world()
  const c = add(30, 30, { age: 'child' }); F.updateFaceling(eng, c, DT)
  c.fc!.mode = 'tantrum'; c.fc!.modeT = 0
  run(FC.TANTRUM_MAX + 1)
  ok(c.fc!.mode === 'none' && c.fc!.tantrumCd > 30, `${FC.TANTRUM_MAX}s 没人管：自己停下，进入冷却`)
}

// ── 普通种社会行为：招手 → 被无视失望；近处点头；指路
{
  const { eng, p, run, add } = world()
  const a = add(23.5, 20.5, { age: 'adult' }); F.updateFaceling(eng, a, DT); a.fc!.greetCd = 0
  withRandom(0, () => run(0.1))
  ok(a.fc!.gesture === 'wave', '玩家 3 米内：招手')
  p.x = 32; run(0.3)
  ok(a.fc!.gesture === 'sad', '被无视（玩家走远）：失望低头')
  run(FACELING_CLIPS.sad.dur * 1.6)
  ok(!a.fc!.gesture, '失望片段播完回到常态')
  p.x = 20.5
  const b = add(22, 20.5, { age: 'elder' }); F.updateFaceling(eng, b, DT); b.fc!.greetCd = 0
  withRandom(0, () => run(0.05))
  ok(b.fc!.gesture === 'nod', '2 米内：点头')
}
{
  const { eng, m, run, add } = world()
  m.items.push({ id: 1, type: 'almondwater', x: 28.5, y: 24.5 })
  const a = add(22, 20.5, { age: 'adult' }); F.updateFaceling(eng, a, DT); a.fc!.greetCd = 99; a.fc!.pointCd = 0
  withRandom(0, () => run(0.05))
  ok(a.fc!.gesture === 'point', '玩家身边站着：指向附近地上的物品')
  const dir = Math.atan2(24.5 - a.y, 28.5 - a.x)
  ok(Math.abs(Math.atan2(Math.sin(a.facing - dir), Math.cos(a.facing - dir))) < 0.2, '指路时朝向物品')
}

// ── 进化种（L3）不会招手
{
  const { eng, run, add } = world(3)
  const a = add(23, 20.5, { age: 'elder', evolved: true }); a.def = { ...a.def, sight: 0.1 }
  F.updateFaceling(eng, a, DT); a.fc!.pointCd = 0
  withRandom(0, () => run(0.05))
  ok(a.fc!.gesture !== 'point', '进化种不指路')
}

// ── L2 生成：卧室罕见、含亲子房
{
  const L2 = (LEVELS as any[]).find((l) => l.id === 2)
  let fac = 0, kids = 0, chunks = 0
  for (let cy = -6; cy <= 6; cy++) for (let cx = -6; cx <= 6; cx++) {
    const c: any = genL2ChunkRaw(L2, 4242, cx, cy); chunks++
    for (const e of c.entities) if (e.type === 'faceling') { fac++; if (e.fcAge === 'child') kids++ }
  }
  ok(fac > 0 && fac / chunks < 0.6, `L2 ${chunks} 个区块里 ${fac} 只无面灵（罕见，每区块 ${(fac / chunks).toFixed(2)}）`)
  ok(kids > 0 && kids < fac, `其中 ${kids} 只是亲子房的幼体`)
}

console.log(`\n${n - fails}/${n} 通过`)
if (fails) process.exit(1)
