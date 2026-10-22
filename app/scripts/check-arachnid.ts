/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接读写引擎内部状态 */
// L8 蛛形纲重制第 3 阶段——无头机制验收（真实 Engine + 真实 L8 生成 + 真实 step 循环）。
// 运行：npm run check:arachnid      结果同时写入 reports/arachnid/mechanics-check.txt
import { mkdirSync, writeFileSync } from 'node:fs'

const memory = new Map<string, string>()
Object.assign(globalThis, { window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }, document: { createElement: () => ({ getContext: () => null, style: {} }), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } }, localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) } })
const { Engine } = await import('../src/game/engine')
const A = await import('../src/game/engine/arachnidAI')
const S = await import('../src/game/engine/arachnidStats')
const N = await import('../src/game/world/arachnidNest')
const { audio } = await import('../src/game/core/audio')
const { makeEntity } = await import('../src/game/entities')
const { entitySpawnLevels } = await import('../src/game/entities/spawns')
const { LEVELS } = await import('../src/game/levels')
const { genL8ChunkRaw, l8CaveMarginAt, L8_LAKE_CENTER, L8_LAKE_WATER_RADIUS, l8VariantOf } = await import('../src/game/world/infiniteL8')
const { L8 } = await import('../src/game/levels/l8')
const { infiniteImplFor } = await import('../src/game/world/infinite')
const { floorHeight, walkableAt } = await import('../src/game/world/mapgen')
const { ARACHNID_REGROWN, ARACHNID_CLIPS } = await import('../src/game/renderer/arachnidAnim')

for (const k of ['aggro', 'hit', 'swing', 'hurt', 'pickup', 'uiTick', 'spark', 'searchTick', 'splash', 'scrape', 'setUnderwater', 'footstep', 'whisper', 'swim'] as const) (audio as any)[k] = () => {}
const lines: string[] = []
let fails = 0, n = 0
const ok = (c: unknown, m: string) => { n++; const l = `${c ? '✔' : '✘'} ${m}`; console.log(l); lines.push(l); if (!c) fails++ }
const K = S.ARACHNID_KINDS

function fresh(seed = 404) {
  const e: any = new Engine(); e.seed = seed
  e.loadLevel(8, { mapSeed: seed, firstVisit: true }); e.introT = 0
  e.player.hp = 100; e.player.sanity = 100; e.player.thirst = 100; e.player.hunger = 100; e.player.flashlight = false
  e.dev.statLock = false
  return e
}
const W = (e: any) => A.getArachnidWorld(e)
const marginAt = (e: any, x: number, y: number) => l8CaveMarginAt(e.map.inf.seed, x + e.map.inf.ox, y + e.map.inf.oy)
/** 找一块余量 ≥ R、地面平缓、干燥的空地（窗口坐标） */
function openSpot(e: any, R = 3, near?: { x: number; y: number }, maxR = 60, minDist = 0) {
  const m = e.map, c = near ?? e.player
  for (let rad = 0; rad < maxR; rad++) for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
    const x = Math.floor(c.x) + dx + 0.5, y = Math.floor(c.y) + dy + 0.5
    if (x < 6 || y < 6 || x > m.w - 6 || y > m.h - 6 || Math.hypot(x - c.x, y - c.y) < minDist) continue
    if (!walkableAt(m, Math.floor(x), Math.floor(y), 0) || m.liquid[Math.floor(y) * m.w + Math.floor(x)] !== 0) continue
    if (marginAt(e, x, y) < R) continue
    const h0 = floorHeight(m, x, y, 0)
    let flat = true
    for (let a = 0; a < 8 && flat; a++) for (const r of [1, 2, Math.min(R, 3.5)]) {
      const px = x + Math.cos(a * 0.785) * r, py = y + Math.sin(a * 0.785) * r
      if (Math.abs(floorHeight(m, px, py, 0) - h0) > 0.3 * r || m.liquid[Math.floor(py) * m.w + Math.floor(px)] !== 0) flat = false
    }
    if (flat) return { x, y }
  }
  throw Error('找不到空地')
}
let nid = 70000
function spawn(e: any, kind: string, x: number, y: number, extra: any = {}) {
  const q: any = makeEntity('arachnid', x, y, floorHeight(e.map, x, y, 0), `arachnid-${kind}` as any)
  q.id = nid++; q.testKeep = true
  Object.assign(q.def, extra)
  A.ensureArachnid(q, e)
  e.map.entities.push(q); return q
}
function place(e: any, x: number, y: number, z?: number) { const p = e.player; p.x = x; p.y = y; p.z = z ?? floorHeight(e.map, x, y, 0); p.vz = 0 }
function run(e: any, secs: number, each?: (t: number) => void | boolean) {
  const dt = 1 / 30
  for (let t = 0; t < secs; t += dt) {
    if (each?.(t) === true) return
    e.map.entities = e.map.entities.filter((q: any) => q.testKeep)
    e.blackoutT = 0
    e.step(dt)
    if (e.over) return
  }
}
function setup(R = 3, seed = 404) {
  const e = fresh(seed)
  const spot = openSpot(e, R)
  e.map.entities = []
  place(e, spot.x, spot.y)
  return { e, spot }
}
function provoke(q: any) { q.provoked = true; q.arachnid.provokedT = 30; q.arachnid.mode = 'chase'; q.arachnid.modeT = 0 }
const poisonOf = (e: any, k: string) => W(e).poison.filter((q: any) => q.src === k).length

// ---------------------------------------------------------------- 0. 数值表
{
  ok(K.length === 17 && K.every((k) => S.ARACHNID_STATS[k].hp > 0 && S.ARACHNID_STATS[k].speed > 0 && S.ARACHNID_STATS[k].ability.length > 6), '数值表：17 个变种都有生命/速度/伤害/感知/能力描述')
  ok(K.every((k) => ARACHNID_CLIPS[k as 'wolf']), '每个变种都有动画片段表（阶段 2 片段）')
  const S2 = S.ARACHNID_STATS
  ok(S2.colossus.hp > 4 * S2.wolf.hp && S2.colossus.weight < 1 && K.filter((k) => S2[k].flags.runic).every((k) => S2[k].weight <= 1), '大型/符文变种血厚且野外权重 ≤1（稀有）')
}
// ---------------------------------------------------------------- 1. 水体甩脱规则
{
  const keep = K.filter((k) => !S.arachnidLosesTargetInWater(k))
  ok(keep.length === 2 && keep.includes('diving') && keep.includes('anoxic'), `水体甩脱：甩不掉的只有 ${keep.join('、')}；其余 ${K.length - keep.length} 种跳水可甩脱`)
}
// 深水场景：玩家在地下湖里，岸上放一只狼蛛 / 水蛛 / 无氧蛛
function lakeScene(kind: string) {
  const e = fresh()
  e.map.entities = []
  const inf = e.map.inf
  const lx = L8_LAKE_CENTER.x - inf.ox, ly = L8_LAKE_CENTER.y - inf.oy
  // 岸上：沿湖心向外找第一块离水线 ≥1.2m 的干地
  let shore: any = null
  for (let a = 0; a < 64 && !shore; a++) {
    const ang = a / 64 * Math.PI * 2
    for (let r = L8_LAKE_WATER_RADIUS + 1.2; r < L8_LAKE_WATER_RADIUS + 4; r += 0.5) {
      const x = lx + Math.cos(ang) * r, y = ly + Math.sin(ang) * r
      if (walkableAt(e.map, Math.floor(x), Math.floor(y), 0) && e.map.liquid[Math.floor(y) * e.map.w + Math.floor(x)] === 0 && marginAt(e, x, y) > 1.2) { shore = { x, y, ang }; break }
    }
  }
  const wx = lx + Math.cos(shore.ang) * (L8_LAKE_WATER_RADIUS - 4), wy = ly + Math.sin(shore.ang) * (L8_LAKE_WATER_RADIUS - 4)
  place(e, wx, wy, -0.6)
  const q = spawn(e, kind, shore.x, shore.y)
  provoke(q)
  return { e, q }
}
{
  const { e, q } = lakeScene('wolf')
  let deep = false, hp0 = e.player.hp
  run(e, 4, () => { if (e.map.liquid[Math.floor(q.y) * e.map.w + Math.floor(q.x)] === 1) deep = true })
  ok(e.inLiquid === 1 && q.arachnid.mode === 'shore' && !deep && e.player.hp === hp0, `跳水甩脱：狼蛛追到岸边停下（mode=${q.arachnid.mode}），没下水，玩家未受伤`)
  run(e, 10)
  ok(q.arachnid.mode === 'wander' || q.arachnid.mode === 'idle', `跳水甩脱：在岸边徘徊 ${A.ARACHNID.shoreGiveUp}s 后放弃（mode=${q.arachnid.mode}）`)
}
for (const k of ['diving', 'anoxic']) {
  const { e, q } = lakeScene(k)
  let deep = false
  run(e, 8, () => { if (e.map.liquid[Math.floor(q.y) * e.map.w + Math.floor(q.x)] === 1) deep = true })
  ok(deep && q.arachnid.mode !== 'shore', `${k === 'diving' ? '水蛛' : '无氧蛛'}：跳水甩不掉，追进湖里（mode=${q.arachnid.mode}，z=${q.z.toFixed(2)}）`)
}
{
  // 不会游泳的掉进水里：挣扎
  const { e } = lakeScene('wolf')
  const inf = e.map.inf
  const q = spawn(e, 'jumper', L8_LAKE_CENTER.x - inf.ox + 1, L8_LAKE_CENTER.y - inf.oy)
  run(e, 0.3)
  ok(q.arachnid.mode === 'flail' && q.arachnid.clip === 'flail', `落水：跳蛛掉进深水播 flail 挣扎（mode=${q.arachnid.mode}）`)
  const b = spawn(e, 'broodswarm', L8_LAKE_CENTER.x - inf.ox - 1, L8_LAKE_CENTER.y - inf.oy)
  run(e, 0.2)
  ok(b.dead, '落水：幼蛛潮入水即被冲散')
}
// ---------------------------------------------------------------- 2. 洞穴狼蛛：伏击 + 轻毒
{
  const { e, spot } = setup(4.5)
  const q = spawn(e, 'wolf', spot.x + 6, spot.y)
  place(e, spot.x - 0.5, spot.y)
  run(e, 2)
  ok(q.arachnid.mode === 'ambush' && Math.hypot(q.x - spot.x - 6, q.y - spot.y) < 0.05, `狼蛛：6m 外静伏不动（mode=${q.arachnid.mode}）`)
  place(e, q.x - 3.4, q.y)
  run(e, 4)
  ok(e.player.hp < 100 && poisonOf(e, 'wolf') > 0, `狼蛛：4.5m 内暴起 lunge 扑咬并带轻毒（生命 ${e.player.hp.toFixed(0)}，中毒 ${poisonOf(e, 'wolf')} 层）`)
}
// ---------------------------------------------------------------- 3. 织网蛛：织网、蛛网减速、挣脱
{
  const { e, spot } = setup(2)
  const inf = e.map.inf
  const web = A.spinArachnidWeb(e, spot.x + inf.ox + 1.5, spot.y + inf.oy, 1, 0)
  place(e, spot.x + 1.5, spot.y)
  run(e, 0.1)
  ok(W(e).webT > 0 && A.arachnidMoveMul(e) === A.ARACHNID.webSlow, `蛛网：撞进网被缠住，移速 ×${A.arachnidMoveMul(e)}`)
  let t1 = 0
  run(e, 4, (t) => { if (W(e).webT <= 0) { t1 = t; return true } })
  const e2 = fresh(); e2.map.entities = []; place(e2, spot.x + 1.5, spot.y)
  A.spinArachnidWeb(e2, spot.x + inf.ox + 1.5, spot.y + inf.oy, 1, 0)
  let t2 = 0
  run(e2, 4, (t) => { e2.input.mx = 1; e2.input.my = 0; if (t > 0.1 && A.getArachnidWorld(e2).webT <= 0) { t2 = t; return true } })
  ok(t1 > 2.7 && t2 > 0 && t2 < t1 * 0.7 && !A.arachnidWebs(e).some((w: any) => w.id === web.id), `蛛网：站着不动 ${t1.toFixed(1)}s 挣脱，挣扎只要 ${t2.toFixed(1)}s；挣脱后网被扯断`)
  // 织网蛛自己在通道里织网
  const e3 = fresh(); e3.map.entities = []
  let wv: any = null
  for (let tries = 0; tries < 40 && !wv; tries++) {
    const s = openSpot(e3, 1.2, { x: e3.player.x + (tries % 7) * 6 - 18, y: e3.player.y + Math.floor(tries / 7) * 6 - 18 }, 20)
    if (marginAt(e3, s.x, s.y) < 2.4) wv = spawn(e3, 'weaver', s.x, s.y)
  }
  place(e3, wv.x + 30, wv.y + 30)
  wv.arachnid.specialCd = 0
  run(e3, 25, () => { if (A.arachnidWebs(e3).some((w: any) => w.owner === wv.id)) return true })
  ok(A.arachnidWebs(e3).some((w: any) => w.owner === wv.id), `织网蛛：在家附近的通道里 web_spin 织出一张网（共 ${A.arachnidWebs(e3).filter((w: any) => w.owner === wv.id).length} 张）`)
}
// ---------------------------------------------------------------- 4. 跳蛛：3–5m 跳扑，根位移
{
  const { e, spot } = setup(4)
  const q = spawn(e, 'jumper', spot.x + 2, spot.y)
  place(e, spot.x - 2.2, spot.y)
  provoke(q); q.arachnid.specialCd = 0; q.facing = Math.PI
  let start: any = null, land: any = null, D = 0, sawNoBlend = false
  run(e, 3, () => {
    if (q.arachnid.mode === 'jump' && !start) { start = { x: q.x, y: q.y }; D = q.arachnid.jump.D }
    if (start && !land && q.arachnid.mode !== 'jump') { land = { x: q.x, y: q.y }; sawNoBlend = q.arachnid.noBlend; return true }
  })
  const moved = start && land ? Math.hypot(land.x - start.x, land.y - start.y) : 0
  ok(start && land && Math.abs(moved - D) < 0.35 && sawNoBlend, `跳蛛：4.2m 处起跳，空中补足 ${(D - 0.9).toFixed(2)}m + 落地交出根位移 0.9m，总位移 ${moved.toFixed(2)}m（目标 ${D.toFixed(2)}m），落地硬切片段`)
  ok(e.player.hp < 100, `跳蛛：落点 1.2m 内命中（生命 ${e.player.hp.toFixed(0)}）`)
}
// ---------------------------------------------------------------- 5. 盲眼洞蛛：只听震动，蹲走可以躲开
{
  const { e, spot } = setup(3)
  const q = spawn(e, 'blindcave', spot.x + 2.5, spot.y)
  place(e, spot.x, spot.y)
  run(e, 2, () => { e.noiseEvent(e.player.x, e.player.y, 1, false) })
  ok(q.arachnid.mode !== 'chase' && q.arachnid.mode !== 'investigate' && q.arachnid.heardT > 1, `盲眼洞蛛：玩家在 2.5m 外蹲走（声响半径 1），它毫无察觉（mode=${q.arachnid.mode}）`)
  run(e, 0.5, () => { e.noiseEvent(e.player.x, e.player.y, 4, false) })
  ok(q.arachnid.mode === 'investigate' || q.arachnid.mode === 'chase' || q.arachnid.mode === 'attack', `盲眼洞蛛：正常走路的脚步声让它扑向声源（mode=${q.arachnid.mode}）`)
}
// ---------------------------------------------------------------- 6. 幼蛛潮：持续小伤害、单体打不完、火驱散
{
  const { e, spot } = setup(3)
  const q = spawn(e, 'broodswarm', spot.x + 0.5, spot.y)
  place(e, spot.x, spot.y)
  run(e, 2)
  const hp1 = e.player.hp
  ok(hp1 < 100 && hp1 > 90, `幼蛛潮：贴身持续啃咬（2s 掉 ${(100 - hp1).toFixed(1)} 血，单次都很小）`)
  for (let i = 0; i < 60; i++) { q.arachnid.lastHp = q.hp; q.hp -= 8; e.killCheck(q) }
  ok(!q.dead && q.hp >= S.ARACHNID_STATS.broodswarm.hp * A.ARACHNID.swarmFloor - 1e-6, `幼蛛潮：挨 60 次 8 点拍打后仍未死（剩 ${q.hp.toFixed(1)}），单体打不完`)
  A.arachnidFireHit(e, q, 20)
  ok(q.dead, '幼蛛潮：一次汽油罐火焰就被烧散')
}
// ---------------------------------------------------------------- 7. 长脚盲蛛：受惊就跑，基本无害
{
  const { e, spot } = setup(4)
  const q = spawn(e, 'harvestman', spot.x + 1.8, spot.y)
  place(e, spot.x, spot.y)
  const d0 = Math.hypot(q.x - e.player.x, q.y - e.player.y)
  run(e, 2)
  const d1 = Math.hypot(q.x - e.player.x, q.y - e.player.y)
  ok(d1 > d0 + 1 && e.player.hp === 100, `长脚盲蛛：受惊逃开（${d0.toFixed(1)}m → ${d1.toFixed(1)}m），没有伤人`)
  const h = spawn(e, 'wolf', spot.x - 2, spot.y, { herbivore: true, arachnidVariant: 'wolf' })
  h.arachnid = undefined; A.ensureArachnid(h, e)
  run(e, 3)
  ok(h.arachnid.herb && e.player.hp === 100, '旧「食草被动型」标志：食草狼蛛贴身也不主动攻击')
  h.arachnid.lastHp = h.hp; h.hp -= 5; e.killCheck(h)
  run(e, 3)
  ok(e.player.hp < 100, `食草型被打后反击防卫（生命 ${e.player.hp.toFixed(0)}）`)
}
// ---------------------------------------------------------------- 8. 极巨蛛：威吓 → 重伤；窄道过不去
{
  const { e, spot } = setup(4.5)
  const q = spawn(e, 'colossus', spot.x + 3.5, spot.y)
  place(e, spot.x, spot.y)
  let reared = false, bigHit = 0, prev = 100
  run(e, 8, () => { if (q.arachnid.mode === 'rear') reared = true; if (prev - e.player.hp > bigHit) bigHit = prev - e.player.hp; prev = e.player.hp; if (bigHit > 20) return true })
  ok(reared && e.player.sanity < 100, `极巨蛛：首次交战先 rear 威吓（理智 ${e.player.sanity.toFixed(0)}）`)
  ok(bigHit >= 25, `极巨蛛：lunge 一击重伤 ${bigHit.toFixed(0)}`)
  // 窄道：玩家躲进余量 <1.9 的洞管
  const e2 = fresh(); e2.map.entities = []
  let pair: any = null
  for (let y = 8; y < e2.map.h - 8 && !pair; y += 2) for (let x = 8; x < e2.map.w - 8 && !pair; x += 2) {
    const mg = marginAt(e2, x + 0.5, y + 0.5)
    if (mg < 1.2 || mg > 1.8 || !walkableAt(e2.map, x, y, 0) || e2.map.liquid[y * e2.map.w + x]) continue
    for (let r = 4; r < 11 && !pair; r++) for (let a = 0; a < 16; a++) {
      const bx = x + 0.5 + Math.cos(a * 0.39) * r, by = y + 0.5 + Math.sin(a * 0.39) * r
      if (marginAt(e2, bx, by) >= 3.1 && walkableAt(e2.map, Math.floor(bx), Math.floor(by), 0) && !e2.map.liquid[Math.floor(by) * e2.map.w + Math.floor(bx)]) { pair = { nx: x + 0.5, ny: y + 0.5, bx, by }; break }
    }
  }
  place(e2, pair.nx, pair.ny)
  const c = spawn(e2, 'colossus', pair.bx, pair.by)
  c.arachnid.reared = true; provoke(c)
  let minM = 99
  run(e2, 10, () => { minM = Math.min(minM, marginAt(e2, c.x, c.y)) })
  ok(minM >= 2.4, `极巨蛛：追到窄道口就进不去（途经最小洞穴余量 ${minM.toFixed(2)}m ≥ 2.4；玩家所在 ${marginAt(e2, pair.nx, pair.ny).toFixed(2)}m）`)
}
// ---------------------------------------------------------------- 9. 寡妇毒蛛：强毒叠层
{
  const { e } = setup(2)
  for (let i = 0; i < 5; i++) A.addPoison(e, 'widow')
  const dps = W(e).poison.reduce((s: number, q: any) => s + q.dps, 0)
  ok(poisonOf(e, 'widow') === 3 && dps === 6, `寡妇毒蛛：中毒最多叠 3 层（${dps}/s）`)
  const hp0 = e.player.hp
  run(e, 5)
  ok(hp0 - e.player.hp > 25, `寡妇毒蛛：5s 持续中毒扣 ${(hp0 - e.player.hp).toFixed(0)} 血`)
}
// ---------------------------------------------------------------- 10. 再生蛛：回血 + 断肢再生
{
  const { e, spot } = setup(3)
  const q = spawn(e, 'regen', spot.x, spot.y)
  place(e, spot.x + 40, spot.y + 40)
  q.arachnid.regrow = ARACHNID_REGROWN
  q.hp = 10; q.arachnid.lastHp = 10
  run(e, 3)
  ok(q.hp >= 17, `再生蛛：3s 回血 10 → ${q.hp.toFixed(1)}`)
  q.arachnid.lastHp = q.hp; q.hp -= 12; e.killCheck(q)
  ok(q.arachnid.regrow === 1, '再生蛛：单次 ≥8 伤害断肢（新肢缩回 1）')
  let sawRegen = false
  run(e, 6, () => { if (q.arachnid.mode === 'regen') sawRegen = true })
  ok(sawRegen && q.arachnid.regrow === ARACHNID_REGROWN, `再生蛛：脱战后播 regen 片段，新肢长回 ${ARACHNID_REGROWN}`)
}
// ---------------------------------------------------------------- 11. 不死蛛：复活一次；火 / 重击处决
{
  const { e, spot } = setup(3)
  const q = spawn(e, 'undying', spot.x, spot.y)
  place(e, spot.x + 40, spot.y + 40)
  q.hp = 8; q.arachnid.lastHp = 8; q.hp -= 10; e.killCheck(q)
  ok(!q.dead && q.arachnid.mode === 'dormant', '不死蛛：第一次「死亡」翻倒假死，没有真正死去')
  q.arachnid.lastHp = q.hp; q.hp -= 5; e.killCheck(q)
  ok(!q.dead, '不死蛛：假死时轻击（5）杀不死')
  run(e, A.ARACHNID.undyingWait + 3.2)
  ok(q.arachnid.revived && !q.dead && Math.round(q.hp) === Math.round(S.ARACHNID_STATS.undying.hp * A.ARACHNID.undyingRevive) && q.def.speed < S.ARACHNID_STATS.undying.speed, `不死蛛：4s 后 revive，以 ${q.hp} 血复活、跛行（速度 ${q.def.speed.toFixed(2)}）`)
  q.arachnid.lastHp = q.hp; q.hp -= 20; e.killCheck(q)
  ok(q.dead, '不死蛛：复活只有一次，再次打死就彻底死了')
  const r = spawn(e, 'undying', spot.x + 1, spot.y)
  r.hp = 6; r.arachnid.lastHp = 6; r.hp -= 8; e.killCheck(r)
  r.arachnid.lastHp = r.hp; r.hp -= 16; e.killCheck(r)
  ok(r.dead, '不死蛛：假死时 ≥15 的重击处决')
  const f = spawn(e, 'undying', spot.x - 1, spot.y)
  A.arachnidFireHit(e, f, 45)
  ok(f.dead, '不死蛛：火焰直接烧死，不会假死')
}
// ---------------------------------------------------------------- 12. 抗火蛛：免疫火焰、不怕打火机
{
  const { e, spot } = setup(4)
  const q = spawn(e, 'fireproof', spot.x + 1.6, spot.y)
  const wv = spawn(e, 'wolf', spot.x - 1.6, spot.y)
  const hp0 = q.hp
  A.arachnidFireHit(e, q, 45)
  ok(q.hp === hp0 && !q.dead, '抗火蛛：汽油罐火焰 45 伤害完全免疫')
  place(e, spot.x, spot.y); e.player.hasLighter = true
  provoke(q); provoke(wv)
  let wolfRecoil = false, fpRecoil = false
  run(e, 1, () => { if (wv.arachnid.mode === 'recoil') wolfRecoil = true; if (q.arachnid.mode === 'recoil') fpRecoil = true; e.player.hasLighter = true })
  ok(wolfRecoil && !fpRecoil, '火焰驱赶：拿着打火机时狼蛛畏缩退开，抗火蛛照样逼近')
}
// ---------------------------------------------------------------- 13. 洞蝎：尾刺毒 + 螯夹
{
  const { e, spot } = setup(3)
  const q = spawn(e, 'cavescorpion', spot.x + 1.3, spot.y)
  place(e, spot.x, spot.y)
  provoke(q); q.arachnid.cd = 0
  const clips = new Set<string>()
  run(e, 1.2, () => { clips.add(q.arachnid.clip); place(e, q.x - 1.3, q.y) })
  ok(clips.has('sting') && poisonOf(e, 'cavescorpion') > 0, `洞蝎：1.3m 用 sting 尾刺并中毒（${poisonOf(e, 'cavescorpion')} 层）`)
  q.arachnid.cd = 0; q.arachnid.mode = 'chase'
  run(e, 1, () => { clips.add(q.arachnid.clip); place(e, q.x - 0.8, q.y) })
  ok(clips.has('pinch'), '洞蝎：贴身 0.8m 改用 pinch 螯夹')
}
// ---------------------------------------------------------------- 14. 鞭蝎：锥形酸雾 + 腐蚀视野
{
  const fake = { x: 0, y: 0, z: 0, facing: 0 }
  ok(A.arachnidSprayHits(fake, 3, 0.5, 0) && !A.arachnidSprayHits(fake, 2, 2.5, 0) && !A.arachnidSprayHits(fake, 6, 0, 0), '鞭蝎：酸雾 35° 锥形判定（正前 3m 中、侧面 50° 不中、6m 外不中）')
  const { e, spot } = setup(4.5)
  const q = spawn(e, 'whipscorpion', spot.x + 3.4, spot.y)
  place(e, spot.x, spot.y)
  provoke(q); q.arachnid.specialCd = 0; q.facing = Math.PI
  let sprayed = false
  run(e, 3, () => { if (q.arachnid.mode === 'spray') sprayed = true })
  ok(sprayed && W(e).acidT > 0 && e.player.hp < 100 && W(e).fx.some((f: any) => f.kind === 'spray'), `鞭蝎：3.4m 喷酸，伤害 + 腐蚀视野（剩 ${W(e).acidT.toFixed(1)}s），并发出 spray 特效事件`)
}
// ---------------------------------------------------------------- 15. 吸附蜱：吸附、吸血膨胀、拔除、打下、吸饱脱落
{
  const { e, spot } = setup(3)
  const q = spawn(e, 'tick', spot.x + 0.6, spot.y)
  place(e, spot.x, spot.y)
  run(e, 4, () => { if (q.arachnid.latched) return true })
  ok(q.arachnid.latched && W(e).latchedId === q.id, '吸附蜱：latch 咬住玩家')
  const hp0 = e.player.hp
  run(e, 4)
  ok(hp0 - e.player.hp > 3 && q.arachnid.engorge > 0.15 && Math.hypot(q.x - e.player.x, q.y - e.player.y) < 0.5, `吸附蜱：4s 吸血 ${(hp0 - e.player.hp).toFixed(1)}、膨胀到 ${(q.arachnid.engorge * 100).toFixed(0)}%，挂在玩家身上`)
  const hp1 = e.player.hp
  ok(A.arachnidInteract(e) && !q.arachnid.latched && W(e).latchedId === null && hp1 - e.player.hp === A.ARACHNID.tickPull, '吸附蜱：交互键拔下（撕掉 2 血）')
  q.arachnid.cd = 0; place(e, q.x - 0.5, q.y)
  run(e, 5, () => { if (q.arachnid.latched) return true })
  ok(q.arachnid.latched, '吸附蜱：又咬上了')
  q.arachnid.lastHp = q.hp; q.hp -= 1; e.killCheck(q)
  ok(!q.arachnid.latched && W(e).latchedId === null, '吸附蜱：打一下就从身上拍下来')
  const q2 = spawn(e, 'tick', e.player.x + 0.4, e.player.y)
  A.latchTick(e, W(e), q2, q2.arachnid)
  run(e, A.ARACHNID.tickFull + 1)
  ok(!q2.arachnid.latched && q2.arachnid.mode === 'sated' && q2.arachnid.engorge >= 1, '吸附蜱：约 20s 吸饱后自己脱落（mode=sated）')
}
// ---------------------------------------------------------------- 16. 螨群：瘙痒、水冲掉、泼水散开
{
  const { e, spot } = setup(3)
  const q = spawn(e, 'mitecloud', spot.x + 0.5, spot.y)
  place(e, spot.x, spot.y)
  run(e, 1.5)
  ok(W(e).mitesT > 0, '螨群：碰到就钻进衣服（瘙痒状态）')
  const s0 = e.player.sanity
  q.testKeep = false
  run(e, 3)
  ok(e.player.sanity < s0 - 2, `螨群：瘙痒持续扣理智（${s0.toFixed(1)} → ${e.player.sanity.toFixed(1)}）`)
  const inf = e.map.inf
  place(e, L8_LAKE_CENTER.x - inf.ox, L8_LAKE_CENTER.y - inf.oy, -0.6)
  run(e, 0.3)
  ok(W(e).mitesT === 0, '螨群：跳进水里，钻进衣服的螨被冲散')
  const m2 = spawn(e, 'mitecloud', spot.x, spot.y)
  ok(A.arachnidSquirted(e, m2, 'water') && m2.dead, '螨群：被滋水枪泼清水就散了')
}
// ---------------------------------------------------------------- 17. 符文蛛巢区：稀有、种群、危险区查询、拆茧
{
  let found = 0, tried = 0
  const nests: any[] = []
  for (let cy = -20; cy < 20; cy++) for (let cx = -20; cx < 20; cx++) {
    tried++
    const d = N.arachnidNestOfChunk(404, cx, cy)
    if (d) { found++; nests.push(d) }
  }
  ok(found > 0 && found / tried < 0.04, `蛛巢区稀有：${found}/${tried} 个 chunk（${(found / tried * 100).toFixed(1)}%）`)
  const nd = nests[0]
  const raw: any = genL8ChunkRaw(L8 as any, 404, nd.cx, nd.cy)
  const pop = raw.entities.filter((q: any) => q.arachnidNest === nd.id)
  ok(pop.some((q: any) => S.ARACHNID_STATS[q.arachnidVariant as 'wolf'].flags.runic) && pop.some((q: any) => q.arachnidVariant === 'weaver') && pop.some((q: any) => q.arachnidVariant === 'broodswarm' && q.arachnidMother), `蛛巢种群：${pop.map((q: any) => q.arachnidVariant).join('、')}`)
  ok(nd.cocoons.length >= 2 && nd.webs.length >= 1, `蛛巢：${nd.cocoons.length} 个人形茧 + ${nd.webs.length} 张巢区网`)
  // 真实引擎：传送到最近的巢
  const e = fresh(); e.map.entities = []
  const inf = e.map.inf
  const n0 = N.findNearestArachnidNest(inf.seed, e.player.x + inf.ox, e.player.y + inf.oy)!
  e.player.x = n0.zx - inf.ox; e.player.y = n0.zy - inf.oy
  e.updateInfiniteWindow()
  const inf2 = e.map.inf
  place(e, n0.zx - inf2.ox, n0.zy - inf2.oy)
  e.map.entities = e.map.entities.filter((q: any) => q.def.type === 'arachnid')
  for (const q of e.map.entities) (q as any).testKeep = true
  e.dev.god = true
  run(e, 0.2)
  const zone = A.isArachnidDangerZone({ x: e.player.x, y: e.player.y })
  const far = A.isArachnidDangerZone({ x: e.player.x + 25, y: e.player.y + 25 })
  const near = A.getArachnidsNear({ x: e.player.x, y: e.player.y }, 8)
  ok(zone && !far && A.arachnidDangerZones(e).some((z) => z.id === n0.id), `危险区查询：巢心 isArachnidDangerZone=true，25m 外 false`)
  ok(near.some((q) => q.runic), `getArachnidsNear：巢心 8m 内查到符文守卫（${near.map((q) => q.kind).join('、')}）`)
  ok(A.arachnidWebs(e).some((w: any) => w.nest === n0.id), '蛛巢网登记为减速陷阱')
  const c = n0.cocoons[0]
  place(e, c.x - inf2.ox - 0.6, c.y - inf2.oy)
  e.player.facing = 0
  const items0 = e.map.items.length
  const did = A.arachnidInteract(e)
  ok(did && W(e).cocoonsTaken.has(c.id) && e.map.items.length >= items0, `拆茧：交互拆开人形茧（掉落 ${e.map.items.length - items0} 件，用尸体掉落表）`)
  e.dev.god = false
}
// ---------------------------------------------------------------- 18. 只在 L8 生成 + 生成权重
{
  const lv = entitySpawnLevels('arachnid').map((s) => s.id)
  ok(lv.length === 1 && lv[0] === 8 && LEVELS.filter((l) => l.entities.some((q) => q.type === 'arachnid')).length === 1, `生成池：只有 Level 8 有蛛形纲（${lv.join(',')}）`)
  let other = 0, otherChunks = 0
  for (const id of [2, 3, 4, 5, 9]) {
    const impl = (() => { try { return infiniteImplFor(id) } catch { return null } })()
    const def = LEVELS.find((l) => l.id === id)
    if (!impl || !def) continue
    for (let i = 0; i < 6; i++) { try { const r: any = impl.genRaw(def as any, 404, 3 + i, -2 + i); otherChunks++; other += r.entities.filter((q: any) => q.type === 'arachnid').length } catch { /* 个别层级需要额外上下文，跳过 */ } }
  }
  ok(otherChunks > 10 && other === 0, `其它层级 ${otherChunks} 个 chunk 不生成蛛形纲`)
  const cnt: Record<string, number> = {}
  let total = 0, wild = 0, wildRunic = 0
  for (let cy = -12; cy < 12; cy++) for (let cx = -12; cx < 12; cx++) {
    const raw: any = genL8ChunkRaw(L8 as any, 404, cx, cy)
    for (const q of raw.entities) {
      if (q.type !== 'arachnid') continue
      total++
      const k = q.arachnidVariant ?? `legacy-${q.arachnidMorph}`
      cnt[k] = (cnt[k] ?? 0) + 1
      if (q.arachnidVariant && !q.arachnidNest) { wild++; if (S.ARACHNID_STATS[q.arachnidVariant as 'wolf'].flags.runic) wildRunic++ }
    }
  }
  const kinds = Object.keys(cnt).filter((k) => !k.startsWith('legacy')).length
  ok(kinds >= 10 && wildRunic / Math.max(1, wild) < 0.06, `L8 576 个 chunk：${total} 只，${kinds} 个变种；野外符文个体占 ${(wildRunic / Math.max(1, wild) * 100).toFixed(1)}%（稀有）`)
  void l8VariantOf
}
// ---------------------------------------------------------------- 19. 远处降频
{
  const { e, spot } = setup(3)
  const q = spawn(e, 'wolf', spot.x, spot.y)
  place(e, spot.x + 35, spot.y + 20)
  let updates = 0, lastMode = -1
  run(e, 1, () => { if (q.arachnid.modeT !== lastMode) { updates++; lastMode = q.arachnid.modeT } })
  ok(updates <= 6, `远处降频：35m 外的个体 1s 内只步进 ${updates} 次`)
}

mkdirSync('reports/arachnid', { recursive: true })
writeFileSync('reports/arachnid/mechanics-check.txt', lines.join('\n') + `\n\n${n - fails}/${n}\n`)
console.log(`\n${n - fails}/${n}`)
if (fails) process.exit(1)
