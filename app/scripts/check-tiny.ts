/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// [tiny] 小小（Entity 720）+ 石卡祖笛 重制 阶段 3——机制无头验收（真实 Engine + 手搭地图）。运行：npm run check:tiny
import { createCanvas } from '@napi-rs/canvas'
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
const { levelDefOf } = await import('../src/game/levels')
const { ITEMS, itemUseProfile } = await import('../src/game/content/items')
const { ENTITIES } = await import('../src/game/entities')
const { NPCS } = await import('../src/game/content/npcs')
const { breathLimit } = await import('../src/game/engine/movement')
const L8 = await import('../src/game/world/infiniteL8')
const { CS } = await import('../src/game/world/infinite')
const T = await import('../src/game/engine/tinyAI')
const { updateMeleeInput } = await import('../src/game/engine/melee')
const { TINY, KAZOO } = T
for (const k of Object.keys(audio)) if (typeof (audio as any)[k] === 'function') (audio as any)[k] = () => {}

let fails = 0, n = 0
const ok = (c: unknown, m: string) => { n++; console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
const DT = 1 / 30
const DOOR = { x: 40, y: 40 }, DEPTH = 46

/** L7 环形场：80×80 全是深水，门在 (40,40) 的海床石台上，小小盘踞在门上方 */
function world(opts: { cave?: boolean; level?: number } = {}) {
  const eng: any = new Engine(), S = 80, N = S * S, zero = () => new Uint8Array(N)
  const level = opts.level ?? (opts.cave ? 8 : 7)
  eng.player.level = level
  eng.map = { w: S, h: S, tiles: zero().fill(1), structures: [], items: [], lights: [], exits: [], entities: [] as Entity[], spawn: { x: 20, y: 40 },
    wet: zero(), elev: zero(), outdoor: zero(), step: zero(), crawl: zero(), ceiling: zero(), up: zero(), upWall: zero(), up2: zero(), upWall2: zero(), stair: new Int32Array(N),
    liquid: opts.cave ? zero() : zero().fill(1), seaFloor: new Float32Array(N).fill(opts.cave ? 1.7 : DEPTH), floors: 1, dn: zero(), dnWall: zero(), tint: zero(),
    organicCave: opts.cave ? true : undefined }
  const m = eng.map
  for (let i = 0; i < S; i++) { m.tiles[i] = 0; m.tiles[(S - 1) * S + i] = 0; m.tiles[i * S] = 0; m.tiles[i * S + S - 1] = 0 }
  eng.explored = new Uint8Array(N)
  const p = eng.player
  Object.assign(p, { level, x: 30.5, y: 40.5, z: opts.cave ? 0 : -DEPTH + 0.5, floor: 0, hp: 100, sanity: 100, facing: 0, flashlight: false, battery: 100, stamina: 100 })
  look.yaw = 0; look.pitch = 0
  const msgs: string[] = []; const msg0 = eng.msg.bind(eng); eng.msg = (t: string, k?: any) => { msgs.push(t); msg0(t, k) }
  eng.emit = () => {}
  eng.persist = () => {}
  const doorDef = levelDefOf(7)!.exits.find((x) => x.kind === 'littledoor')!
  if (!opts.cave) m.exits.push({ def: doorDef, x: DOOR.x, y: DOOR.y, z: -DEPTH + 0.42, discovered: true })
  const tick = () => { T.kazooAmbient(eng, DT); eng.updateEntities(DT, 1); eng.time = (eng.time ?? 0) + DT }
  const run = (secs: number, each?: () => void) => { for (let t = 0; t < secs && !eng.over; t += DT) { each?.(); tick() } }
  const until = (test: () => boolean, secs = 20, each?: () => void) => { for (let t = 0; t < secs && !test() && !eng.over; t += DT) { each?.(); tick() } return test() }
  const spawnTiny = () => {
    const e = makeEntity('tiny', DOOR.x + 0.5, DOOR.y + 0.5, -DEPTH + 1.05)
    e.def = { ...e.def, passive: true } // 生成器的 calm: true
    m.entities.push(e); return e
  }
  /** 主手吹一声（走完整的使用动作） */
  const blow = () => {
    p.hotbar[0] = p.hotbar[0] ?? { type: 'stonekazoo', count: 1 }; p.selected = 0
    eng.useSlot('hotbar', 0)
    for (let t = 0; t < 1 && eng.usingItem; t += DT) { eng.updateItemUse(DT); tick() }
  }
  return { eng, m, p, msgs, tick, run, until, spawnTiny, blow, doorDef }
}
const blocked = (eng: any) => eng.tinyBlocksLittleDoor()

// ===== 定义、物品、图鉴 =====
{
  const k = ITEMS.stonekazoo
  ok(k.use === 'kazoo', `石卡祖笛 use 由 'none' 改为 'kazoo'（${k.use}）`)
  const prof = itemUseProfile(k)
  ok(prof?.anim === 'blow' && Math.abs(prof.duration - KAZOO.useT) < 1e-6, `使用动作：举到嘴边吹奏 ${prof?.duration}s（anim=${prof?.anim}）`)
  const lore = ENTITIES.tiny.codex!.lore.join('')
  ok(lore.includes('2019 年 6 月') && !lore.includes('4 月 18'), '图鉴：首次发现改为 2019 年 6 月（去掉 4 月 18 日）')
  ok(/不值得/.test(lore) && /契约/.test(lore), '图鉴：补上「我们试过了。不值得。」与 Entity 20 的契约')
  ok(ENTITIES.tiny.codex!.counter.includes('石卡祖笛'), '图鉴应对：写明用石卡祖笛逼退')
}

// ===== 不可杀、无掉落 =====
{
  const { eng, m, spawnTiny, run } = world()
  const e = spawnTiny()
  run(0.2)
  const items0 = m.items.length
  e.hp -= 99999; eng.killCheck(e)
  ok(!e.dead && e.hp === e.def.hp, `致命伤害无效：没死，血量回满（${e.hp}）`)
  ok(m.items.length === items0, '没有任何掉落物')
  ok(e.provoked && e.tiny?.phase === 'hunt', '挨打 = 肢体接触：立刻激怒并追杀')
  ok(e.stunT > 0, '挨打只让它受惊一下（短暂僵直）')
  run(3)
  ok(!e.dead && m.entities.includes(e), '几秒后依然活着')
}
{
  const { eng, p, spawnTiny, run, msgs } = world()
  const e = spawnTiny(); run(0.1)
  p.x = e.x - 1.1; p.y = e.y; p.z = e.z; p.facing = 0; look.yaw = -Math.PI / 2
  eng.player.hotbar[0] = { type: 'crowbar', count: 1 }; eng.player.selected = 0
  eng.dev.oneHit = true
  for (let i = 0; i < 4; i++) { eng.attackCooldownT = 0; eng.attack(); run(0.4, () => updateMeleeInput(eng, DT, false)) }
  ok(!e.dead && e.hp === e.def.hp, `开发者一击必杀的近战也打不死它（hp ${e.hp}）`)
  ok(e.provoked && msgs.some((t) => t.includes('碰到了它')), '近战命中按肢体接触处理（激怒）')
}

// ===== 门被挡 / 卡祖笛逼退 / 门放行 / 它会回来 =====
{
  const { eng, p, spawnTiny, run, until, blow, doorDef, msgs } = world()
  const e = spawnTiny()
  run(1)
  ok(blocked(eng), '小小在门上方：门被挡')
  const lvl = p.level
  eng.takeExit(doorDef)
  ok(p.level === lvl && msgs.some((t) => t.includes('盘踞')), '被挡时进不了门')
  p.x = DOOR.x - 4.5; p.y = DOOR.y + 0.5; p.z = -DEPTH + 1 // 游到门边 4.5m
  eng.submerged = false
  for (let i = 0; i < 3; i++) { blow(); run(1.0) }
  ok(e.tiny!.phase !== 'repel' && blocked(eng), `只吹 3 声（${e.tiny!.blows.length}/${TINY.repelBlows}）：还没被逼退`)
  ok(!e.provoked && e.tiny!.anger === 0, '吹奏中途不算激怒')
  blow()
  ok(e.tiny!.phase === 'repel', `6 秒窗口内第 ${TINY.repelBlows} 声：被逼退`)
  ok(!e.provoked && e.tiny!.anger === 0, '逼退本身不记恼怒、不激怒')
  ok(until(() => !blocked(eng), 4), '逼退开始后几秒内离开门心 5m：门可通行')
  run(2)
  const away = Math.hypot(e.x - (DOOR.x + 0.5), e.y - (DOOR.y + 0.5))
  ok(away > 10, `逃到远处（离门 ${away.toFixed(1)}m）`)
  ok(T.tinyRefusesTalk(e) !== null, '被逼退时拒绝交谈')
  ok(e.tiny!.phase === 'repel' && !blocked(eng), `逼退持续（${TINY.repelT}s 内门一直可通行）`)
  run(TINY.repelT - 6.5)
  ok(!blocked(eng), `${TINY.repelT - 0.5}s 时门仍可通行`)
  ok(until(() => blocked(eng), 12), '逼退结束后它会游回来，门再次被挡')
  ok(until(() => e.tiny!.phase === 'perch', 6), '回到门上方继续盘踞')
  // 放行窗口：从门边开始吹，门心 5m 内再无小小
  const w2 = world(); const e2 = w2.spawnTiny(); w2.run(0.5)
  w2.p.x = DOOR.x - 4; w2.p.y = DOOR.y + 0.5; w2.p.z = -DEPTH + 1
  for (let i = 0; i < TINY.repelBlows; i++) { w2.blow(); w2.run(0.6) }
  ok(w2.until(() => !blocked(w2.eng), 4) && e2.tiny!.phase === 'repel', '放行窗口：tinyBlocksLittleDoor()=false（level.takeExit 不再拦截）')
}

// ===== 卡祖笛计数：太远不算 / 半途而废 = 断续噪音 =====
{
  const { p, spawnTiny, run, blow, msgs } = world()
  const e = spawnTiny(); run(0.5)
  p.x = DOOR.x - 12; p.y = DOOR.y + 0.5; p.z = -DEPTH + 1
  for (let i = 0; i < 5; i++) { blow(); run(0.6) }
  ok(e.tiny!.phase !== 'repel' && e.tiny!.blows.length === 0, `声源离它 > ${TINY.repelR}m：不计数`)
  ok(msgs.some((t) => t.includes('离它还太远')), '提示笛声离它太远')
  p.x = DOOR.x - 3
  blow(); run(0.6); blow()
  ok(e.tiny!.blows.length === 2, '近处吹了 2 声')
  run(TINY.repelWindow + 0.5)
  ok(e.tiny!.anger === 1 && !e.provoked && e.tiny!.blows.length === 0, '停下来（窗口过期不足 4 声）：算一次断续噪音，恼怒 1')
  ok(msgs.some((t) => t.includes('断断续续')), '提示「断断续续的笛声只让它更烦躁了」')
  blow(); run(TINY.repelWindow + 0.5)
  ok(e.provoked && e.tiny!.phase === 'hunt', '再半途而废一次：恼怒 2 → 追杀')
}

// ===== 听觉：快速游泳/落水响动记恼怒（同一阵只记一次），普通游动不算；第二次追杀 =====
{
  const { eng, p, spawnTiny, run } = world()
  const e = spawnTiny(); run(0.5)
  p.x = DOOR.x - 20
  eng.noiseEvent(p.x, p.y, 4, false)
  ok(e.tiny!.anger === 0, '普通游动（半径 4、非奔跑）：不计')
  eng.noiseEvent(p.x, p.y, 10, true)
  ok(e.tiny!.anger === 1 && e.tiny!.phase === 'glare' && !e.provoked, '20m 外快速游泳：恼怒 1，只转向低鸣')
  eng.noiseEvent(p.x, p.y, 10, true)
  ok(e.tiny!.anger === 1, `同一阵噪音 ${TINY.annoyGap}s 内只记一次`)
  run(1)
  ok(Math.hypot(e.x - (DOOR.x + 0.5), e.y - (DOOR.y + 0.5)) <= TINY.leash + 0.1 && blocked(eng), `低鸣时最多离门 ${TINY.leash}m：门照样被挡`)
  run(TINY.annoyGap)
  // 投掷物落水（L7）
  eng.landProjectile({ type: 'canned', x: p.x, y: p.y, z: 0, vx: 0, vy: 0, vz: 0, floorZ: -DEPTH, done: true } as any, DOOR.x - 25, DOOR.y)
  ok(e.provoked && e.tiny!.phase === 'hunt', '第二次（投掷物落水）：恼怒 2 → 追杀')
}
{
  const { eng, spawnTiny, run } = world()
  const e = spawnTiny(); run(0.5)
  eng.noiseEvent(DOOR.x - 20, DOOR.y, 10, true)
  run(TINY.annoyDecay + 1)
  ok(e.tiny!.anger === 0, `安静 ${TINY.annoyDecay}s：恼怒 -1`)
  eng.noiseEvent(DOOR.x - TINY.hearR - 2, DOOR.y, 10, true)
  ok(e.tiny!.anger === 0, `超出听觉 ${TINY.hearR}m：听不见`)
}

// ===== 肢体接触 / 对话里提门 =====
{
  const { p, spawnTiny, run } = world()
  const e = spawnTiny(); run(0.5)
  p.x = e.x - 0.8; p.y = e.y; p.z = e.z
  run(0.1)
  ok(e.provoked, `贴身 ${TINY.contactR}m 内 = 肢体接触：激怒`)
}
{
  const { eng, p, spawnTiny, run } = world()
  const e = spawnTiny(); run(0.5)
  p.x = e.x - 2; p.y = e.y; p.z = e.z
  ok(T.tinyRefusesTalk(e) === null, '盘踞时可以交谈')
  T.tinyScorn(eng)
  ok(e.tiny!.anger === 1 && !e.provoked, '对话里提门：第一次警告（恼怒 1）')
  T.tinyScorn(eng)
  ok(e.provoked && T.tinyRefusesTalk(e) !== null, '再提一次：激怒，拒绝对话')
}

// ===== 追杀：离水就放弃；笛声能逼退追杀中的它；回门 120 秒后消气 =====
{
  const { eng, p, m, spawnTiny, run, until, blow } = world()
  const e = spawnTiny(); run(0.3)
  T.tinyProvoke(eng, e, 'noise')
  p.x = DOOR.x - 6; p.y = DOOR.y + 0.5; p.z = -DEPTH + 1
  run(0.5)
  ok(e.state === 'chase' || e.state === 'attack', '追杀：交给通用追击')
  for (let i = 0; i < TINY.repelBlows; i++) { blow(); run(0.3) }
  ok(e.tiny!.phase === 'repel' && e.provoked, '追杀中的小小也能被持续笛声逼退（仍处于激怒）')
  // 玩家趁机离开水面（站上陆地）
  const ti = Math.floor(p.y) * m.w + Math.floor(p.x)
  m.liquid[ti] = 0
  run(TINY.repelT + 0.5)
  ok(e.tiny!.phase === 'return' || e.tiny!.phase === 'perch', '逼退结束时玩家已离水：不再追，游回门上')
  ok(until(() => e.tiny!.phase === 'perch', 15), '回到门上方')
  ok(T.tinyRefusesTalk(e) !== null, '激怒期间拒绝对话')
  run(TINY.forgiveT + 1)
  ok(!e.provoked && e.tiny!.anger === 0 && T.tinyRefusesTalk(e) === null, `回门安静 ${TINY.forgiveT}s 后消气，重新愿意交谈`)
}
{
  const { eng, p, spawnTiny, run } = world()
  const e = spawnTiny(); run(0.3)
  T.tinyProvoke(eng, e, 'noise')
  p.x = DOOR.x - TINY.huntLoseR - 5
  run(TINY.huntLoseT + 0.5)
  ok(e.tiny!.phase !== 'hunt', `追杀中玩家远于 ${TINY.huntLoseR}m 持续 ${TINY.huntLoseT}s：放弃`)
}

// ===== 水下吹奏耗氧 =====
{
  const { eng, p, blow, spawnTiny, run } = world()
  spawnTiny(); run(0.2)
  p.x = 10; eng.submerged = true; eng.breathT = 3
  blow()
  ok(Math.abs(eng.breathT - (3 + KAZOO.o2Cost) - 0) < 0.6, `水下吹一声：屏气 +${KAZOO.o2Cost}s（${eng.breathT.toFixed(2)}，含动作期间 updateItemUse 不计时）`)
  ok(breathLimit(eng) === 35, 'L7 屏气上限 35s → 满屏气最多吹 7 声')
  eng.submerged = false; eng.breathT = 0
  blow()
  ok(eng.breathT === 0, '水面上吹：不耗氧')
}

// ===== 洞穴回声点 / 开阔水面从玩家身上传出 =====
{
  const { eng, m, p } = world({ cave: true })
  for (let y = 0; y < m.h; y++) m.tiles[y * m.w + 50] = 2 // x=50 一整面岩壁
  p.x = 30.5; p.y = 40.5; p.z = 0
  look.yaw = -Math.PI / 2 // 面朝 +x
  const lured = makeEntity('carrier', 49, 30.5, 0); m.entities.push(lured) // 离玩家 >20m，离回声点 ~10m
  const src = T.blowKazoo(eng)
  ok(src.echo && Math.abs(src.x - (50 - KAZOO.echoBack)) < 0.25 && Math.abs(src.y - 40.5) < 0.01, `洞穴：射线打到岩壁，回声点在命中点前 ${KAZOO.echoBack}m（x=${src.x.toFixed(2)}）`)
  ok(lured.state === 'investigate' && Math.hypot(lured.targetX - src.x, lured.targetY - src.y) < 0.01, '回声点附近的实体被引向回声点（而不是玩家）')
  look.yaw = Math.PI / 2 // 面朝 -x：离 x=50 的岩壁 25.5m，超出 22m
  p.x = 75.5
  const far = T.blowKazoo(eng)
  ok(!far.echo && far.x === p.x, `${KAZOO.echoMax}m 内没碰到墙：从玩家身上传出`)
  const w = world()
  w.p.x = 30.5; look.yaw = -Math.PI / 2
  const open = T.blowKazoo(w.eng)
  ok(!open.echo && open.x === w.p.x && open.y === w.p.y, 'L7 开阔水面：从玩家身上传出')
}

// ===== L8 乐器洞：生成规则、唯一、可达 =====
{
  const def8 = levelDefOf(8)!
  const seeds = [1, 2, 3, 777, 4242, 123456, 987654321, 0x5eed]
  let reach = 0, once = 0, open = 0, layout = 0
  for (const seed of seeds) {
    const c = L8.l8InstrumentCave(seed)
    const a = L8.l8AvenuePoint(seed, L8.L8_INSTRUMENT_CAVE.anchorSeq)
    if (Math.abs(Math.hypot(c.x - a.x, c.y - a.y) - L8.L8_INSTRUMENT_CAVE.offset) < 1e-6) layout++
    const r = L8.l8InstrumentCaveReachable(seed)
    if (r.ok) reach++
    else console.log('  不可达', seed, JSON.stringify(r))
    const cx = Math.floor(c.x / CS), cy = Math.floor(c.y / CS)
    let count = 0, chimes = 0, kazoos = 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const g = L8.genL8ChunkRaw(def8, seed, cx + dx, cy + dy)
      count += g.structures.filter((s) => s.kind === 'stoneinstruments').length
      chimes += g.structures.filter((s) => s.kind === 'stonechime').length
      kazoos += g.items.filter((it) => it.type === 'stonekazoo' && Math.hypot(it.x - c.x, it.y - c.y) < 3).length
      if (dx === 0 && dy === 0) {
        const i = Math.floor(c.y - cy * CS) * CS + Math.floor(c.x - cx * CS)
        if (g.tiles[i] === 1 && g.liquid[i] === 0) open++
      }
    }
    if (count === 1 && chimes === 1 && kazoos === 1) once++
  }
  ok(layout === seeds.length, `规则：锚在第九大道 ${L8.L8_INSTRUMENT_CAVE.anchorSeq} 号路标，沿法线偏 ${L8.L8_INSTRUMENT_CAVE.offset}m（${layout}/${seeds.length} 个种子）`)
  ok(reach === seeds.length, `从路标沿洞管走到洞心：余量 >0.9m、净高 >1.9m、坡度 <0.3m/0.25m（${reach}/${seeds.length}）`)
  ok(open === seeds.length, `洞心是干燥可走的洞底（${open}/${seeds.length}）`)
  ok(once === seeds.length, `每层恰好一处：1 组石乐器 + 1 个石风铃 + 断口下 1 支石卡祖笛（${once}/${seeds.length}）`)
  const seed = 4242, c = L8.l8InstrumentCave(seed), roof = L8.l8RoofAt(seed, c.x, c.y) - L8.l8GroundAt(seed, c.x, c.y)
  ok(roof > 2.3 && roof < 3.4, `洞厅低矮：洞心净高 ${roof.toFixed(2)}m（风铃伸手可及）`)
  ok(def8.structures.includes('stoneinstruments') && def8.structures.includes('stonechime'), 'L8 层级定义登记了两种新结构')
}

// ===== [tiny 收尾] 乐器按洞穴场的真实表面贴合：不悬空、不埋太深 =====
{
  const THREE = await import('three')
  const { seatInstrumentCave, chimeHang, SEAT_EMBED, BACK_ZONE } = await import('../src/game/renderer/instrumentCave')
  const { stoneInstrumentGeometry } = await import('../src/game/renderer/stoneInstrumentsMesh')
  const seeds = [1, 2, 3, 777, 4242, 123456, 987654321, 0x5eed]
  const bad: string[] = []
  let wallN = 0, floorN = 0, worstWall = 0, worstFloor = 0, worstGap = 0
  let chimeOk = 0, colOk = 0, colN = 0
  for (const seed of seeds) {
    const c = L8.l8InstrumentCave(seed)
    const S = { field: (x: number, y: number, z: number) => L8.l8VolumeField(seed, x, y, z), ground: (x: number, z: number) => L8.l8GroundAt(seed, x, z), roof: (x: number, z: number) => L8.l8RoofAt(seed, x, z) }
    const fit = seatInstrumentCave(c, S)
    for (const st of fit.seats) {
      if (st.on === 'roof') continue
      const g = stoneInstrumentGeometry(st.kind), pa = g.attributes.position
      g.computeBoundingBox()
      const v = new THREE.Vector3(); let mn = Infinity, inside = 0
      const back: number[] = [] // 岩壁乐器背面（局部 z 最靠后的 20%）离岩面的距离：中位数大 = 整件悬空
      const zCut = g.boundingBox!.min.z + (g.boundingBox!.max.z - g.boundingBox!.min.z) * BACK_ZONE
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i); const lz = v.z; v.applyMatrix4(st.matrix)
        const f = S.field(v.x, v.y, v.z); mn = Math.min(mn, f); if (f < 0) inside++
        if (st.on === 'wall' && lz <= zCut) back.push(f)
      }
      back.sort((a, b) => a - b)
      const gap = back.length ? back[Math.floor(back.length / 2)] : 0
      const frac = inside / pa.count
      const depthLim = st.on === 'wall' ? 0.09 : 0.045
      const okSeat = st.ok && mn < -0.003 && mn > -depthLim && gap < 0.12
      if (st.on === 'wall') { wallN++; worstWall = Math.min(worstWall, mn); worstGap = Math.max(worstGap, gap) } else { floorN++; worstFloor = Math.min(worstFloor, mn) }
      if (!okSeat) bad.push(`${seed}/${st.kind}: fit=${st.ok} 最深 ${mn.toFixed(3)} 岩内 ${(frac * 100).toFixed(0)}% 背面中位间隙 ${gap.toFixed(3)}`)
    }
    // 石风铃：石链顶端插进洞顶、铃盘和石管悬在空气里、离地够高
    const L = L8.l8InstrumentLayout(c), ch = chimeHang(S, L.chime.x, L.chime.y, 2.05)
    const rodsLow = ch.hangY - 0.04 - 0.62
    if (S.field(L.chime.x, ch.chainTop - 0.01, L.chime.y) < 0 && S.field(L.chime.x, ch.hangY, L.chime.y) > 0.05 && S.field(L.chime.x, rodsLow, L.chime.y) > 0.05 && rodsLow - ch.ground > 1.0) chimeOk++
    else bad.push(`${seed}/风铃 挂点 ${ch.hangY.toFixed(2)} 链顶场值 ${S.field(L.chime.x, ch.chainTop - 0.01, L.chime.y).toFixed(3)}`)
    // 断口钟乳石的补柱：整圈柱顶都插进洞顶
    if (fit.column) {
      colN++
      const k = fit.column
      let inRoof = true
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; if (S.field(k.x + Math.cos(a) * 0.17, k.y1 - 0.02, k.z + Math.sin(a) * 0.17) >= 0) inRoof = false }
      if (inRoof && k.y0 - S.ground(k.x, k.z) > 1.8) colOk++
      else bad.push(`${seed}/钟乳石补柱 柱顶未插进洞顶或断口太低`)
    }
  }
  for (const b of bad) console.log('  ' + b)
  ok(bad.filter((b) => !b.includes('风铃') && !b.includes('补柱')).length === 0, `${seeds.length} 个种子：${wallN} 件岩壁乐器贴着岩面（最深 ${(-worstWall).toFixed(3)}m < 0.09m，背面中位间隙 ≤ ${worstGap.toFixed(3)}m < 0.12m），${floorN} 件马桶/邦戈鼓压进洞底 ≤ ${(-worstFloor).toFixed(3)}m（目标 ${SEAT_EMBED.wall}/${SEAT_EMBED.floor}m）`)
  ok(chimeOk === seeds.length, `石风铃：石链插进洞顶、铃盘和石管悬空、离地 > 1m（${chimeOk}/${seeds.length}）`)
  ok(colOk === colN, `断口钟乳石补柱整圈插进洞顶、断口离地 > 1.8m（${colOk}/${colN}）`)
}

// ===== 石风铃：要用卡祖笛戳；铃声经久不息，持续把实体引过去 =====
{
  const { eng, m, p, run } = world({ cave: true })
  const chime: any = { kind: 'stonechime', x: 39.5, y: 39.5, w: 1, h: 1, solid: false, data: { hang: 2.05, ring: 0 } }
  m.structures.push(chime)
  p.x = 38.5; p.y = 40.5
  p.hotbar[0] = null; for (let i = 0; i < p.hotbar.length; i++) p.hotbar[i] = null
  ok(!T.pokeChime(eng, chime) && !T.chimeRinging(chime), '徒手拨不响')
  p.hotbar[0] = { type: 'stonekazoo', count: 1 }
  ok(T.pokeChime(eng, chime) && chime.data.ring === 1, '用石卡祖笛一戳：铃声响起')
  const lured = makeEntity('carrier', 55.5, 40.5, 0); m.entities.push(lured)
  p.x = 10.5 // 玩家走远
  run(2)
  ok(lured.state === 'investigate' && Math.hypot(lured.targetX - 40, lured.targetY - 40) < 0.01, '附近的实体被铃声引向风铃')
  run(KAZOO.chimeT - 4)
  ok(T.chimeRinging(chime), `${KAZOO.chimeT - 2}s 时铃声还在`)
  run(3)
  ok(!T.chimeRinging(chime) && chime.data.ring === 0, `约 ${KAZOO.chimeT}s 后归于安静`)
}

// ===== [tiny 收尾] 真实 L7 环形场（loadLevel(7)）：场心石台 seadais 是实心结构，外环有石柱/水管 =====
// 实机截图时发现：通用寻路把整块台面当不可走格，小小被逼退后一步都挪不动（门永远不放行），回门时又在水管旁原地抖。
{
  const { createCanvas: _cc } = await import('@napi-rs/canvas'); void _cc
  const L7 = await import('../src/game/world/infiniteL7')
  const eng: any = new Engine(); eng.seed = 720; eng.emit = () => {}; eng.persist = () => {}
  eng.loadLevel(7, { mapSeed: 720, firstVisit: false })
  const m = eng.map, p = eng.player, A = L7.L7_ARENA
  const put = () => { p.x = A.x + 0.5 - 4.6 - m.inf.ox; p.y = A.y + 0.5 - m.inf.oy; p.z = -A.depth + 0.8 }
  put(); eng.updateInfiniteWindow(); put()
  eng.dev.god = true; eng.dev.statLock = false
  const t = m.entities.find((q: Entity) => q.def.type === 'tiny')!, door = m.exits.find((x: any) => x.def.kind === 'littledoor')!
  const dais = m.structures.find((q: any) => q.kind === 'seadais')
  ok(!!t && !!door && !!dais && Math.hypot(t.x - door.x - 0.5, t.y - door.y - 0.5) < 0.1, '真实 L7：门在场心实心石台上，小小出生在门上方')
  const st = (n: number) => { for (let k = 0; k < n; k++) eng.step(DT) }
  st(30)
  p.hotbar[0] = { type: 'stonekazoo', count: 1 }; p.selected = 0
  const b0 = eng.breathT
  for (let i = 0; i < 4; i++) { eng.useSlot('hotbar', 0); for (let k = 0; k < 40 && eng.usingItem; k++) eng.step(DT); st(6) }
  ok(t.tiny?.phase === 'repel', '真实 L7：主手使用连吹 4 声 → repel')
  ok(eng.breathT - b0 >= 4 * KAZOO.o2Cost, `真实 L7：水下 4 声屏气至少 +${4 * KAZOO.o2Cost}s（实际 +${(eng.breathT - b0).toFixed(1)}s，含吹奏动作本身的时间）`)
  let freeAt = -1
  for (let k = 0; k < 90 && freeAt < 0; k++) { eng.step(DT); if (!eng.tinyBlocksLittleDoor()) freeAt = k * DT }
  ok(freeAt >= 0 && freeAt < 2.5, `真实 L7：被逼退后 ${freeAt.toFixed(2)}s 离开门区 5m（游下实心石台），门放行`)
  st(Math.round(TINY.repelT / DT))
  let homeAt = -1
  for (let k = 0; k < 400 && homeAt < 0; k++) { eng.step(DT); if (t.tiny?.phase === 'perch') homeAt = k * DT }
  ok(homeAt >= 0 && eng.tinyBlocksLittleDoor(), `真实 L7：${TINY.repelT}s 后游回门上（回程 ${homeAt.toFixed(1)}s，没被外环水管/石柱卡住），门重新被挡`)
  T.tinyProvoke(eng, t, 'contact')
  const d0 = Math.hypot(t.x - p.x, t.y - p.y)
  st(45)
  const d1 = Math.hypot(t.x - p.x, t.y - p.y)
  ok(t.tiny?.phase === 'hunt' && d1 < d0 - 1.5, `真实 L7：激怒后能从门上冲下来追人（1.5s 内 ${d0.toFixed(1)}m → ${d1.toFixed(1)}m）`)
}

// ===== 对话节点完整 =====
{
  const tiny = NPCS.tiny, L = tiny.lines
  ok(L.length >= 8, `对话 ${L.length} 节`)
  const badNext = L.flatMap((nd, i) => nd.opts.filter((o) => o.next !== undefined && (o.next < 0 || o.next >= L.length)).map(() => i))
  ok(badNext.length === 0 && L.every((nd) => nd.opts.length > 0 && nd.npc.length > 10), '每节都有台词和选项，跳转都落在树内')
  const seen = new Set([0]), q = [0]
  while (q.length) { const i = q.shift()!; for (const o of L[i].opts) if (o.next !== undefined && !seen.has(o.next)) { seen.add(o.next); q.push(o.next) } }
  ok(seen.size === L.length, `从开场能走到全部 ${L.length} 节（${seen.size}）`)
  ok(L.every((nd) => nd.opts.some((o) => o.action === 'leave' || o.next !== undefined)), '每节都能离开或继续')
  ok(!L.some((nd) => nd.npc.includes('出口')), '小小自己从不提「出口」')
  const scorn = L.flatMap((nd) => nd.opts.filter((o) => o.action === 'scorn'))
  ok(scorn.length >= 2 && scorn.every((o) => /门|出路|离开/.test(o.text)), `玩家提门/出路的选项走 scorn（${scorn.length} 个）`)
  const all = L.map((nd) => nd.npc).join('')
  ok(all.includes('2019 年 6 月') && /契约/.test(all) && /案板上的鱼肉/.test(all) && /游得更快/.test(all), '台词参照维基访谈：外号来历（2019 年 6 月）、契约、案板上的鱼肉、游得更快')
  ok(/碰/.test(all) && /吵/.test(all) && /道理/.test(all), '厌恶肢体接触与噪音、讨厌听人讲道理')
}

// Stream-origin changes preserve the same world targets and animation velocity.
{
  const { eng, m, p, spawnTiny } = world()
  m.inf = { ox: 0, oy: 0, chunks: new Map() }
  const e = spawnTiny(); e.encountered = true
  T.updateTiny(eng, e, 0, 5)
  const s = T.tinyState(e); s.phase = 'repel'; s.fleeX = s.homeX + 18; s.fleeY = s.homeY
  const target = { x: s.fleeX, y: s.fleeY }, home = { x: s.homeX, y: s.homeY }
  const dx = 16, dy = 16
  m.inf.ox += dx; m.inf.oy += dy
  e.x -= dx; e.y -= dy; p.x -= dx; p.y -= dy
  for (const d of m.exits) { d.x -= dx; d.y -= dy }
  T.updateTiny(eng, e, 0, 5)
  ok(Math.abs(s.fleeX + m.inf.ox - target.x) < 1e-6 && Math.abs(s.fleeY + m.inf.oy - target.y) < 1e-6, '流式窗口平移后，退避目标世界坐标不变')
  ok(Math.abs(s.homeX + m.inf.ox - home.x) < 1e-6 && Math.abs(s.homeY + m.inf.oy - home.y) < 1e-6, '流式窗口平移后，回门目标世界坐标不变')
}

console.log(`\ncheck:tiny ${n - fails}/${n}${fails ? ` —— ${fails} 项失败` : ' 全部通过'}`)
if (fails) process.exit(1)
