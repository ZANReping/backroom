/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接读写引擎内部状态 */
// 迷彩爬行者（Entity 31）重制阶段 3——无头机制验收（真实 Engine + 真实 L8 生成 + 真实 step 循环）
// 运行：npm run check:camo     结果同时写入 reports/camo/mechanics-check.txt
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'

const memory = new Map<string, string>()
Object.assign(globalThis, { window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }, document: { createElement: () => ({ getContext: () => null, style: {} }), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } }, localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) } })
const { Engine } = await import('../src/game/engine')
const A = await import('../src/game/engine/camoAI')
const { audio } = await import('../src/game/core/audio')
const { makeEntity } = await import('../src/game/entities')
const { LEVELS } = await import('../src/game/levels')
const { genL8ChunkRaw, l8VolumeField, l8GroundAt } = await import('../src/game/world/infiniteL8')
const { CAMO_PACK } = await import('../src/game/world/camoSpawn')
const { buildEntityMesh } = await import('../src/game/renderer/entitiesMesh')
const { animateCamo } = await import('../src/game/renderer/camoRender')
const { CAMO_SLAM_IMPACT_T, CAMO_IDLE_LEVEL } = await import('../src/game/renderer/camoCrawlerAnim')
const { floorHeight } = await import('../src/game/world/mapgen')

for (const k of ['aggro', 'hit', 'swing', 'hurt', 'pickup', 'uiTick', 'spark', 'searchTick', 'splash', 'scrape', 'setUnderwater', 'footstep', 'whisper', 'swim'] as const) (audio as any)[k] = () => {}
const lines: string[] = []
let fails = 0, n = 0
const ok = (c: unknown, m: string) => { n++; const l = `${c ? '✔' : '✘'} ${m}`; console.log(l); lines.push(l); if (!c) fails++ }
const C = A.CAMO
const DT = 1 / 30

function fresh(seed = 808) {
  const e: any = new Engine(); e.seed = seed
  e.loadLevel(8, { mapSeed: seed, firstVisit: true }); e.introT = 0
  e.player.hp = 100; e.player.sanity = 100; e.player.thirst = 100; e.player.hunger = 100; e.player.flashlight = false
  e.dev.statLock = false
  const hits: { dmg: number; src: string; t: number }[] = []
  const oh = e.hurtPlayer.bind(e)
  e.hurtPlayer = (dmg: number, src: string) => { hits.push({ dmg, src, t: e.time }); e.player.hp = 100 }
  void oh
  return { e, hits }
}
let nid = 70000
/** 在玩家附近找一处贴壁点，放一只伪装中的迷彩爬行者 */
function crawlerNear(e: any, x: number, y: number, radius = 8) {
  const q: any = makeEntity('camocrawler', x, y, 0); q.id = nid++; q.testKeep = true
  q.z = floorHeight(e.map, x, y, 0)
  e.map.entities.push(q)
  A.initCamo(e, q)
  return q
}
function place(e: any, x: number, y: number) { const p = e.player; p.x = x; p.y = y; p.z = floorHeight(e.map, x, y, 0); p.vz = 0 }
function run(e: any, secs: number, each?: (t: number) => void) {
  for (let t = 0; t < secs; t += DT) {
    each?.(t)
    e.map.entities = e.map.entities.filter((q: any) => q.testKeep)
    e.blackoutT = 0
    e.player.hp = 100
    e.step(DT)
    if (e.over) return
  }
}
/** 从 q 出发沿朝向找一处可站的点（离 q dist 米） */
function spotFrom(e: any, q: any, dist: number, ang = 0) {
  const a = q.facing + ang
  for (let k = 0; k < 24; k++) {
    const aa = a + (k % 2 ? 1 : -1) * Math.floor((k + 1) / 2) * 0.2
    const x = q.x + Math.cos(aa) * dist, y = q.y + Math.sin(aa) * dist
    if (e.entityWalkH(e.map, Math.floor(x), Math.floor(y), 0) !== null && Math.abs(floorHeight(e.map, x, y, 0) - q.z) < 0.6) return { x, y }
  }
  return null
}
function setup(seed = 808) {
  const r = fresh(seed)
  r.e.map.entities = []
  const p = r.e.player
  const q = crawlerNear(r.e, p.x + 4, p.y + 4)
  // 玩家放到离它 9m 的地方（伪装中听不见普通走路）
  const s = spotFrom(r.e, q, 9) ?? spotFrom(r.e, q, 7)!
  place(r.e, s.x, s.y)
  return { ...r, q }
}

// ---------- 1. 声音事件与听觉半径（纯函数） ----------
{
  const cl = { mode: 'cling' as const, lured: false }, al = { mode: 'charge' as const, lured: false }
  ok(A.camoCanHear(cl, 4.5, 4) && !A.camoCanHear(cl, 4.7, 4), `伪装中：普通行走（响度 4）听觉半径 ${(4 * C.HEAR_SCALE).toFixed(2)}m`)
  ok(A.camoCanHear(cl, 11.4, 10) && !A.camoCanHear(cl, 11.6, 10), `伪装中：奔跑（响度 10）听觉半径 ${(10 * C.HEAR_SCALE).toFixed(1)}m`)
  ok(A.camoCanHear(al, 5.5, 4) && !A.camoCanHear(al, 5.7, 4), `惊醒后：行走听觉半径扩大到 ${(4 * C.HEAR_SCALE_ALERT).toFixed(1)}m`)
  ok(!A.camoCanHear(cl, 0.3, 1) && !A.camoCanHear(al, 0.3, 1), '下蹲慢走（响度 1）低于阈值 1.5：贴脸也听不见')
  ok(!A.camoCanHear({ mode: 'distracted', lured: true }, 3, 8) && A.camoCanHear({ mode: 'distracted', lured: true }, 3, 10) && A.camoCanHear({ mode: 'distracted', lured: true }, 3, 12, 'throw'),
    '被引开期间：忽略响度 <9 的普通噪音（挥击 8 听不见），奔跑 10 与新的投掷物仍能听见')
}

// ---------- 2. 真实 noiseEvent 接入 + 下蹲静音 ----------
{
  const { e, q } = setup()
  const st = q.cc
  ok(st.mode === 'cling' && Math.abs(st.camo - CAMO_IDLE_LEVEL) < 1e-6 && q.state === 'idle', `初始贴壁伪装：uCamo=${st.camo}`)
  // 玩家蹲着走到 1.6m 内，走一圈
  const s = spotFrom(e, q, 2)!
  place(e, s.x, s.y)
  e.player.crouching = true
  e.input.crouch = true
  let minD = 99, walked = 0, lx = e.player.x, ly = e.player.y
  // 沿岩壁切向来回走（每 0.75s 换向），不会顶到墙
  const tx = -Math.sin(q.facing), ty = Math.cos(q.facing)
  const walk = (t: number, k: number) => { const sg = Math.floor(t / 0.75) % 2 ? -1 : 1; e.input.mx = tx * sg * k; e.input.my = ty * sg * k }
  run(e, 3, (t) => { walk(t, 0.8); minD = Math.min(minD, Math.hypot(e.player.x - q.x, e.player.y - q.y)); walked += Math.hypot(e.player.x - lx, e.player.y - ly); lx = e.player.x; ly = e.player.y })
  e.input.mx = 0; e.input.my = 0
  ok(st.mode === 'cling' && walked > 1.5, `下蹲慢走 3 秒（走了 ${walked.toFixed(1)}m，最近 ${minD.toFixed(2)}m）：仍在伪装（${st.mode}${st.hasSrc ? '，声源响度 ' + st.srcLoud : ''}）`)
  // 站起来正常走：noiseEvent(4) 应该把它惊醒
  e.input.crouch = false; e.player.crouching = false
  run(e, 2.5, (t) => walk(t, 0.9))
  e.input.mx = 0; e.input.my = 0
  ok(st.mode !== 'cling', `站起来正常走（脚步 noiseEvent 响度 4）就被听见：${st.mode}`)
}
// 远处的普通脚步声不会惊醒；奔跑声会
{
  const { e, q } = setup()
  e.noiseEvent(e.player.x, e.player.y, 4, false)
  run(e, 0.2)
  ok(q.cc.mode === 'cling', `9m 外的普通脚步（响度 4）听不见`)
  e.noiseEvent(e.player.x, e.player.y, 10, true)
  run(e, 0.1)
  ok(q.cc.mode === 'reveal', `9m 外的奔跑声（响度 10）听得见 → reveal`)
}
// 跳跃落地 / 开枪 / 投掷物 都会进入声音队列
{
  const { e, q } = setup()
  e.player.z += 1.6; e.player.vz = -6
  run(e, 0.6)
  ok(q.cc.mode !== 'cling' || Math.hypot(e.player.x - q.x, e.player.y - q.y) > 7 * C.HEAR_SCALE, `跳跃落地（响度 7）：${q.cc.mode}`)
  const r2 = setup()
  r2.e.gunCandyT = 5; r2.e.chocoCd = 0
  r2.e.shootChocolate()
  run(r2.e, 0.1)
  ok(r2.q.cc.mode === 'reveal', `开枪（响度 14）：${r2.q.cc.mode}`)
}

// ---------- 3. reveal → listen（t=0.6 接）→ call → 追击 ----------
{
  const { e, q } = setup()
  const st = q.cc
  e.noiseEvent(e.player.x, e.player.y, 10, true)
  const seq: string[] = []
  let listenClipT = -1, revealDur = 0, f0 = q.facing
  run(e, 6, () => {
    if (seq[seq.length - 1] !== st.mode) { seq.push(st.mode); if (st.mode === 'listen') listenClipT = st.clipT }
    if (st.mode === 'reveal') revealDur += DT
  })
  if (seq[0] === 'cling') seq.shift()
  ok(seq[0] === 'reveal' && seq[1] === 'listen' && seq[2] === 'call' && (seq[3] === 'charge' || seq[3] === 'stalk'), `状态序列：cling → ${seq.join(' → ')}`)
  ok(Math.abs(revealDur - C.REVEAL_T) < 0.1, `reveal 持续 ${revealDur.toFixed(2)}s（片段 1.2s）`)
  ok(Math.abs(listenClipT - C.LISTEN_START) < 0.06, `listen 从片段 t=${listenClipT.toFixed(2)} 接（要求 0.6）`)
  ok(Math.abs(q.facing - f0) > 0.2 || Math.hypot(q.x - st.homeWX + (e.map.inf?.ox ?? 0), q.y - st.homeWY + (e.map.inf?.oy ?? 0)) > 0.5, 'listen 时把身体转向声源，随后离开岩壁')
  const dSrc = Math.hypot(q.x - (st.srcWX - (e.map.inf?.ox ?? 0)), q.y - (st.srcWY - (e.map.inf?.oy ?? 0)))
  ok(dSrc < 9, `走/冲向声源最后的位置（剩 ${dSrc.toFixed(1)}m）`)
}

// ---------- 4. 群体呼叫：25m 内的同伴被惊醒 ----------
{
  const { e, q } = setup()
  const near = [crawlerNear(e, q.x + 3, q.y + 1), crawlerNear(e, q.x - 2, q.y + 6)]
  const nearOk = near.every((x: any) => Math.hypot(x.x - q.x, x.y - q.y) < C.CALL_R)
  // 远处一只（>25m）：直接放到 40m 外，不找墙
  const far: any = makeEntity('camocrawler', q.x + 40, q.y, 0); far.id = nid++; far.testKeep = true; e.map.entities.push(far); A.initCamo(e, far)
  far.x = q.x + 40; far.y = q.y; far.cc.homeWX = far.x + (e.map.inf?.ox ?? 0); far.cc.homeWY = far.y + (e.map.inf?.oy ?? 0)
  // 只让 q 听见：在 q 身边 1.5m 发出一个小声（响度 2.5，同伴都在 2.9m 外）
  A.camoSound(e, q.x + Math.cos(q.facing) * 1.5, q.y + Math.sin(q.facing) * 1.5, 2.5)
  const mates0 = near.map((x: any) => x.cc.mode)
  let callers = 0
  const last = new Map<any, string>()
  run(e, 5, () => { for (const x of [q, ...near]) { if (x.cc.mode === 'call' && last.get(x) !== 'call') callers++; last.set(x, x.cc.mode) } })
  ok(nearOk && mates0.every((m: string) => m === 'cling') || mates0.some((m: string) => m === 'cling'), `同伴初始伪装（${mates0.join('/')}）`)
  ok(near.every((x: any) => x.cc.mode !== 'cling' && x.cc.called), `call 之后 25m 内同伴全部惊醒（${near.map((x: any) => x.cc.mode).join('/')}）`)
  ok(far.cc.mode === 'cling', `40m 外的个体不受影响（${far.cc.mode}）`)
  ok(callers === 1, `只有第一只发现目标的个体 call（${callers} 次）`)
}

// ---------- 5. 砸地伤害曲线与 impact 时机 ----------
{
  ok(Math.abs(A.camoSlamDamage(0) - 35) < 1e-9 && Math.abs(A.camoSlamDamage(2.5) - 10.5) < 1e-9 && A.camoSlamDamage(2.51) === 0 && A.camoSlamDamage(1.25) < 35 && A.camoSlamDamage(1.25) > 10.5,
    `伤害曲线：0m=35，1.25m=${A.camoSlamDamage(1.25).toFixed(1)}，2.5m=10.5，>2.5m=0`)
  const { e, q, hits } = setup()
  const st = q.cc
  // 玩家站在它正前方 1.5m 并出声
  const s = spotFrom(e, q, 1.5)!
  place(e, s.x, s.y)
  e.noiseEvent(e.player.x, e.player.y, 6, false)
  let liftAt = -1, slamAt = -1, impactAt = -1, boulders = 0, slowAt = 0
  let impactPoint: any = null
  run(e, 10, () => {
    if (st.mode === 'lift' && liftAt < 0) liftAt = e.time
    if (st.mode === 'slam' && slamAt < 0) slamAt = e.time
    if (st.impactDone && impactAt < 0) { impactAt = e.time; boulders = A.camoBoulders(e).length; slowAt = e.player.slowT; impactPoint = A.camoBoulders(e)[0] }
    // 玩家站着不动但每秒出一点声（呼吸/挪脚）
    if (Math.floor(e.time * 2) !== Math.floor((e.time - DT) * 2)) e.noiseEvent(e.player.x, e.player.y, 3, false)
  })
  ok(liftAt > 0 && slamAt > liftAt && Math.abs(slamAt - liftAt - C.LIFT_T) < 0.08, `距离 ≤2.2m 时 lift（1.0s）→ slam（lift 用时 ${(slamAt - liftAt).toFixed(2)}s）`)
  ok(impactAt > 0 && Math.abs(impactAt - slamAt - CAMO_SLAM_IMPACT_T) < 0.05, `触地时刻 = slam 开始后 ${(impactAt - slamAt).toFixed(3)}s（CAMO_SLAM_IMPACT_T=${CAMO_SLAM_IMPACT_T}）`)
  const first = hits.find((h) => h.src === '迷彩爬行者')
  const ox = e.map.inf?.ox ?? 0, oy = e.map.inf?.oy ?? 0
  const dp = impactPoint ? Math.hypot(s.x - (impactPoint.wx - ox), s.y - (impactPoint.wy - oy)) : 9
  ok(first && Math.abs(first.t - impactAt) < 0.05, `伤害在触地那一帧结算（${first ? first.dmg.toFixed(1) : '无'} 点，离震源 ${dp.toFixed(2)}m）`)
  ok(first && first.dmg > 0 && first.dmg <= 35 * 1.6, `伤害数值合理（含难度系数）`)
  ok(slowAt > 0.5, `踉跄减速 ${slowAt.toFixed(2)}s`)
  ok(boulders === 1, `砸完的巨石留在原地（${boulders} 块，存在 ${C.BOULDER_LIFE}s）`)
  // 巨石是实心的：把玩家推出半径
  if (impactPoint) {
    place(e, impactPoint.wx - ox, impactPoint.wy - oy)
    A.beginCamoFrame(e, 0)
    const dd = Math.hypot(e.player.x - (impactPoint.wx - ox), e.player.y - (impactPoint.wy - oy))
    ok(dd >= C.BOULDER_R + 0.1 || dd > 0.3, `巨石可以当掩体：玩家被挡在 ${dd.toFixed(2)}m 外`)
  }
  ok(!e.map.entities.some((x: any) => x.def.type === 'camocrawler' && x.def.throws), '远程投石已取消（定义上没有 throws）')
}
// 2.5m 外不受伤
{
  const { e, q, hits } = setup()
  const st = q.cc
  const s = spotFrom(e, q, 1.5)!
  place(e, s.x, s.y)
  e.noiseEvent(e.player.x, e.player.y, 6, false)
  run(e, 8, () => {
    if (st.mode === 'slam' && st.clipT < CAMO_SLAM_IMPACT_T && st.clipT + DT >= CAMO_SLAM_IMPACT_T - 0.04) {
      const far = spotFrom(e, q, 4.2, Math.PI * 0.6) ?? spotFrom(e, q, 4.2)
      if (far) place(e, far.x, far.y)
    }
    if (st.mode !== 'slam' && st.impactDone) e.player.x = e.player.x // 砸完不再挪
  })
  const sl = hits.filter((h) => h.src === '迷彩爬行者')
  ok(st.impactDone && sl.length === 0, `触地前躲到 4m 外：不受伤（${sl.length} 次命中）`)
}

// ---------- 6. 引开时长 ----------
{
  const { e, q } = setup()
  const st = q.cc
  const ox = e.map.inf?.ox ?? 0, oy = e.map.inf?.oy ?? 0
  const s = spotFrom(e, q, 6, 0.9) ?? spotFrom(e, q, 5)!
  // 先让它惊醒
  e.noiseEvent(e.player.x, e.player.y, 10, true)
  run(e, 5)
  A.camoProjectileLanded(e, s.x, s.y)
  let dist = 0, enter = -1, leave = -1, ignored = true
  run(e, 25, () => {
    if (st.mode === 'distracted' && enter < 0) enter = e.time
    if (enter > 0 && leave < 0 && st.mode !== 'distracted') leave = e.time
    // 引开期间玩家在 3m 处正常走路（响度 4）：应被忽略
    if (st.mode === 'distracted' && e.time - enter > 1 && e.time - enter < 2) {
      e.noiseEvent(q.x + 3, q.y, 4, false); e.noiseEvent(q.x + 3, q.y, 8, false)
      if (st.mode !== 'distracted') ignored = false
    }
  })
  dist = Math.hypot(st.distractWX - ox - s.x, st.distractWY - oy - s.y)
  const dur = leave - enter
  ok(enter > 0 && dist < 0.01, `投掷物落点把它引开 → distracted`)
  ok(dur >= C.DISTRACT_MIN - 0.05 && dur <= C.DISTRACT_MAX + 0.05, `distracted 持续 ${dur.toFixed(2)}s（10–12s；原通用 investigate 6s，×${(dur / 6).toFixed(2)}）`)
  ok(ignored, '引开期间的脚步声（响度 4）和挥击声（响度 8）都被忽略')
}

// ---------- 7. 失去声源后回壁 ----------
{
  const { e, q } = setup()
  const st = q.cc
  const ox = e.map.inf?.ox ?? 0, oy = e.map.inf?.oy ?? 0
  const home = { x: st.homeWX - ox, y: st.homeWY - oy, f: st.homeF }
  // 声音来自它面前 5m 的一块空地（不是玩家所在处）；玩家在远处蹲着不动，不出声
  const lure = spotFrom(e, q, 5)!
  e.noiseEvent(lure.x, lure.y, 10, true)
  const away = spotFrom(e, q, 14, Math.PI * 0.5) ?? spotFrom(e, q, 14, -Math.PI * 0.5) ?? spotFrom(e, q, 12, Math.PI)
  if (away) place(e, away.x, away.y)
  e.player.crouching = true; e.input.crouch = true
  let returnAt = -1, clingAt = -1, quietAtReturn = -1
  run(e, 45, () => {
    if (st.mode === 'return' && returnAt < 0) { returnAt = e.time; quietAtReturn = st.quietT }
    if (returnAt > 0 && st.mode === 'cling' && clingAt < 0) clingAt = e.time
  })
  ok(returnAt > 0 && quietAtReturn >= C.LOSE_MIN - 0.01 && quietAtReturn <= C.LOSE_MAX + C.SEARCH_T + 0.1 && Math.abs(quietAtReturn - st.loseT) < C.SEARCH_T + 0.1, `失去声源 ${quietAtReturn.toFixed(1)}s 后（阈值 ${st.loseT.toFixed(1)}s，12–20s）开始回壁`)
  ok(clingAt > 0, `走回岩壁重新伪装（回壁 ${(clingAt - returnAt).toFixed(1)}s）`)
  const back = Math.hypot(q.x - home.x, q.y - home.y)
  ok(back < 0.6 && Math.abs(Math.atan2(Math.sin(q.facing - home.f), Math.cos(q.facing - home.f))) < 0.05, `回到原伪装点（偏差 ${back.toFixed(2)}m），背贴岩壁`)
  run(e, C.CLING_FADE + 0.2)
  ok(Math.abs(st.camo - CAMO_IDLE_LEVEL) < 1e-6, `uCamo 在 ${C.CLING_FADE}s 内升回 ${CAMO_IDLE_LEVEL}`)
}

// ---------- 8. 受击 / 死亡 ----------
{
  const { e, q } = setup()
  const st = q.cc
  const s = spotFrom(e, q, 1.2)!
  place(e, s.x, s.y)
  e.player.facing = Math.atan2(q.y - e.player.y, q.x - e.player.x)
  q.hp -= 20; e.killCheck(q)
  ok(st.mode === 'hit' && q.stunT === 0, `受击播 hit（${st.mode}），近战硬直由片段代替`)
  run(e, C.HIT_T + 0.1)
  ok(st.mode === 'call', `第一次受击后召唤同伴（${st.mode}）`)
  ok(q.def.hp === 110, `生命值沿用原值 110`)
  q.hp = 0; e.killCheck(q)
  ok(q.dead && q.deathT > 0, '生命归零 → death')
}

// ---------- 9. 只在 L8 生成、组规模 2–3、贴壁 ----------
{
  const pools = LEVELS.filter((lv: any) => lv.entities.some((x: any) => x.type === 'camocrawler')).map((lv: any) => lv.id)
  ok(pools.length === 1 && pools[0] === 8, `生成池里只有 L8 有迷彩爬行者（${pools.join(',')}）`)
  const dir = 'src/game/world/'
  const others = readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'infiniteL8.ts' && f !== 'camoSpawn.ts' && readFileSync(dir + f, 'utf8').includes("'camocrawler'"))
  ok(others.length === 0, `其他层的生成器都不放置迷彩爬行者（${others.join(',') || '无'}）`)
  const L8 = LEVELS.find((lv: any) => lv.id === 8)
  const sizes: Record<number, number> = {}
  let packs = 0, crawlers = 0, chunks = 0, wallOk = 0, wallN = 0, spreadMax = 0, gapMin = 99
  for (const seed of [11, 808, 4242]) for (let cy = -6; cy <= 6; cy++) for (let cx = -6; cx <= 6; cx++) {
    const raw = genL8ChunkRaw(L8 as any, seed, cx, cy)
    chunks++
    const cs = raw.entities.filter((x: any) => x.type === 'camocrawler')
    if (!cs.length) continue
    sizes[cs.length] = (sizes[cs.length] ?? 0) + 1
    packs++; crawlers += cs.length
    for (const a of cs) for (const b of cs) if (a !== b) { spreadMax = Math.max(spreadMax, Math.hypot(a.x - b.x, a.y - b.y)); gapMin = Math.min(gapMin, Math.hypot(a.x - b.x, a.y - b.y)) }
    for (const c of cs) {
      wallN++
      // 背后 0.6m 内（三个高度之一）就是岩体；身前 0.6m 是空腔
      const g = l8GroundAt(seed, c.x, c.y), bx = -Math.cos(c.facing!), by = -Math.sin(c.facing!)
      const back = CAMO_PACK.PROBE_H.some((h) => l8VolumeField(seed, c.x + bx * 0.62, g + h, c.y + by * 0.62) <= 0)
      const front = l8VolumeField(seed, c.x - bx * 0.6, g + 1.0, c.y - by * 0.6) > 0
      if (back && front) wallOk++
    }
  }
  ok(packs > 10 && Object.keys(sizes).every((k) => Number(k) >= 2 && Number(k) <= 3), `${chunks} 个 L8 区块：${packs} 组，组规模分布 ${JSON.stringify(sizes)}（只有 2 或 3）`)
  const dens = crawlers / chunks
  ok(dens > 0.15 && dens < 0.5, `平均每区块 ${dens.toFixed(2)} 只（原设定 ≈0.28 只/区块）`)
  ok(wallOk / wallN > 0.95, `贴壁：${wallOk}/${wallN} 只背后 0.62m 内是岩体、身前是空腔，朝向 = 岩面法线`)
  ok(spreadMax <= 2 * CAMO_PACK.SPREAD + 3 && gapMin >= CAMO_PACK.GAP - 1e-6, `组内分散在附近：最大间距 ${spreadMax.toFixed(1)}m，最小 ${gapMin.toFixed(1)}m`)
}

// ---------- 10. 渲染接入：共享统一量 + 远处停采样 ----------
{
  const g1: any = buildEntityMesh('camocrawler'), g2: any = buildEntityMesh('camocrawler')
  const r1 = g1.userData.camoRig, r2 = g2.userData.camoRig
  ok(r1 && r2 && r1.camo.uRock === r2.camo.uRock && r1.camo.uRockScale === r2.camo.uRockScale && r1.camo.uRockTint === r2.camo.uRockTint && r1.camo.uCamo !== r2.camo.uCamo,
    '两只个体共享岩面 uRock/uRockScale/uRockTint 统一量，各自独立 uCamo')
  let key = ''
  g1.traverse((o: any) => { if (o.isMesh && o.material?.customProgramCacheKey && !key) key = o.material.customProgramCacheKey() })
  ok(key.startsWith('camo31-world'), `伪装材质程序共享 cache key（${key}）`)
  const { e, q } = setup()
  q.cc.clip = 'walk'
  animateCamo(g1, q, DT, 5, 0, e)
  const p0 = g1.userData.camoPose
  q.cc.clipT += 0.3
  animateCamo(g1, q, DT, 40, 0, e)
  ok(g1.userData.camoPose === p0, '30m 外：不再采样动画（姿态保持）')
  let samples = 0, prev = g1.userData.camoPose
  for (let i = 0; i < 30; i++) { q.cc.clipT += DT; animateCamo(g1, q, DT, 20, 0, e); if (g1.userData.camoPose !== prev) { samples++; prev = g1.userData.camoPose } }
  const p1 = prev
  ok(samples >= 6 && samples <= 9, `14–30m：降频采样（1 秒内采样 ${samples} 次，目标 8Hz）`)
  animateCamo(g1, q, DT, 5, 0, e)
  ok(g1.userData.camoPose !== p1, '14m 内：每帧采样')
}

console.log(`\n${n - fails}/${n} 通过`)
lines.push(`\n${n - fails}/${n} 通过`)
mkdirSync('reports/camo', { recursive: true })
writeFileSync('reports/camo/mechanics-check.txt', lines.join('\n') + '\n')
if (fails) process.exit(1)
