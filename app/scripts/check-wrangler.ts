/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// 牧蛇（Entity 75）重制——机制无头验收（真实 Engine + 手搭地图）。运行：npm run check:wrangler
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
const W = await import('../src/game/engine/wranglerAI')
const { WR } = W
for (const k of ['aggro', 'whisper', 'caveThunder', 'hurt', 'scrape', 'stomach', 'hit', 'clumpChew']) (audio as any)[k] = () => {}

let fails = 0, n = 0
const ok = (c: unknown, m: string) => { n++; console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
const DT = 1 / 30

function world(level = 8) {
  const eng: any = new Engine(), S = 64, N = S * S, zero = () => new Uint8Array(N)
  eng.player.level = level
  eng.map = { w: S, h: S, tiles: zero().fill(1), structures: [], items: [], lights: [], exits: [], entities: [] as Entity[], spawn: { x: 32, y: 32 },
    wet: zero(), elev: zero(), outdoor: zero(), step: zero(), crawl: zero(), ceiling: zero(), up: zero(), upWall: zero(), up2: zero(), upWall2: zero(), stair: new Int32Array(N),
    liquid: zero(), seaFloor: new Float32Array(N), floors: 1, dn: zero(), dnWall: zero(), tint: zero() }
  const m = eng.map
  for (let i = 0; i < S; i++) { m.tiles[i] = 0; m.tiles[(S - 1) * S + i] = 0; m.tiles[i * S] = 0; m.tiles[i * S + S - 1] = 0 }
  for (let y = 20; y < 45; y++) m.tiles[y * S + 40] = 0 // 玩家东侧 8m 一道岩壁
  eng.explored = new Uint8Array(N)
  const p = eng.player
  Object.assign(p, { level, x: 32.5, y: 32.5, z: 0, floor: 0, hp: 100, sanity: 100, facing: 0, flashlight: false, battery: 100 })
  look.yaw = 0; look.pitch = 0
  const msgs: string[] = []; const msg0 = eng.msg.bind(eng); eng.msg = (t: string, k?: any) => { msgs.push(t); msg0(t, k) }
  eng.persist = () => {}
  const tick = () => { W.wranglerAmbient(eng, DT); eng.updateEntities(DT, 1) }
  const run = (secs: number, each?: () => void) => { for (let t = 0; t < secs && !eng.over; t += DT) { each?.(); tick() } }
  const until = (test: () => boolean, secs = 20, each?: () => void) => { for (let t = 0; t < secs && !test() && !eng.over; t += DT) { each?.(); tick() } return test() }
  const spawn = (kind: 'male' | 'female' | 'juvenile', x = 46, y = 32.5) => { const e = makeEntity('wrangler', x, y, 0); m.entities.push(e); W.initWrangler(eng, e, kind); e.wg!.coolT = 0; return e }
  /** 让准星对准牧蛇眼睛 */
  const stare = (e: Entity) => () => { const s = e.wg!; const ex = e.x - p.x, ey = e.y - p.y, ez = e.z + s.headZ - (p.z + 1.55); look.yaw = Math.atan2(-ex, -ey); look.pitch = Math.atan2(ez, Math.hypot(ex, ey)) }
  const away = () => { look.yaw = Math.PI; look.pitch = -1.5 } // 低头看脚下：不与眼睛对视
  return { eng, m, p, msgs, tick, run, until, spawn, stare, away }
}

// ===== 岩层潜行预警 → 鼓包 → 切出 =====
{
  const { eng: E0, p, msgs, until, spawn, away } = world()
  const e = spawn('male', 52, 32.5); e.wg!.coolT = 6
  const rumbled = until(() => msgs.some((t) => t.includes('隆隆')), 8, away)
  ok(rumbled, '岩层里逼近时先有隆隆声 / 震动预警')
  ok(e.hidden && e.wg!.phase === 'under', '潜行中不可见')
  ok(until(() => e.wg!.phase === 'emerge', 10, away), `冷却结束、距离 <14m 时切出（${e.wg!.phase}）`)
  const holes = W.wranglerHoles(E0)
  ok(holes.length === 1 && holes[0].open === 0, '切出前 0.9s：岩面先鼓包，洞还没破')
  until(() => (W.wranglerHoles(E0)[0]?.open ?? 0) > 0.5, 2, away)
  ok(e.wg!.t > WR.BULGE_T - 0.05, `鼓包 ${WR.BULGE_T}s 后破洞（${e.wg!.t.toFixed(2)}s）`)
  ok(until(() => e.wg!.phase === 'hunt', 3, away), '头完全探出后开始追猎')
  const h = W.wranglerHoles(E0)[0]
  const tl = e.wg!.trail
  ok(tl.length > 10 && Math.hypot(tl[tl.length - 1].x - h.x, tl[tl.length - 1].y - h.y) > 30, '身体轨迹的尾端一直埋在岩壁深处（不会整条露出）')
  ok(Math.hypot(e.x - p.x, e.y - p.y) < 14, '切出点在玩家附近')
}
const engines = new Map<any, any>()

// ===== 催眠：盯 1.5s → 被拖；开关手电打断 =====
{
  const w = world(); engines.set(w.m, w.eng)
  const { p, until, spawn, stare, run } = w
  const e = spawn('male', 52, 32.5)
  until(() => e.wg!.phase === 'hunt', 12, w.away)
  e.attackCd = 99 // 先不让它咬
  const t0 = performance.now(); void t0
  let gazeT = 0
  const hyp = until(() => e.wg!.phase === 'hypno', 4, () => { stare(e)(); gazeT += DT })
  ok(hyp && Math.abs(gazeT - WR.GAZE_T) < 0.25, `持续盯视约 ${WR.GAZE_T}s 后被催眠（${gazeT.toFixed(2)}s）`)
  ok(W.wranglerControlsPlayer(w.eng), '催眠中失去移动控制')
  const d0 = Math.hypot(e.x - p.x, e.y - p.y)
  run(1, stare(e))
  ok(Math.hypot(e.x - p.x, e.y - p.y) < d0 - 0.8, `被往它那边拖（${d0.toFixed(1)}m → ${Math.hypot(e.x - p.x, e.y - p.y).toFixed(1)}m）`)
  p.flashlight = !p.flashlight
  w.tick()
  ok(e.wg!.phase !== 'hypno' && !W.wranglerControlsPlayer(w.eng), '开关手电晃眼 → 立刻挣脱')
  ok(e.stunT > 0.5, '被晃到的牧蛇会缩头僵住一下')
}
{
  const w = world(); engines.set(w.m, w.eng)
  const { until, spawn, stare } = w
  const e = spawn('male', 52, 32.5)
  until(() => e.wg!.phase === 'hunt', 12, w.away)
  e.attackCd = 99
  until(() => e.wg!.phase === 'hypno', 4, stare(e))
  let k = 0
  const broke = until(() => e.wg!.phase !== 'hypno', 3, () => { k++; if (k > 10) { look.yaw += 0.2 } })
  ok(broke && e.wg!.hypnoCd > 0, '顶着拖拽把视线甩开 → 挣脱，且有冷却')
}
{
  const w = world(); engines.set(w.m, w.eng)
  const { until, spawn } = w
  const e = spawn('male', 52, 32.5)
  until(() => e.wg!.phase === 'hunt', 12, w.away)
  e.attackCd = 99
  let hyp = false
  w.run(4, () => { w.away(); if (e.wg!.phase === 'hypno') hyp = true })
  ok(!hyp, '不看它的眼睛就不会被催眠')
}

// ===== 吞咽：不躲 → 被吞 → 在没去过的安全地点以 1 HP 醒来 =====
{
  const w = world(); engines.set(w.m, w.eng)
  const { eng: E, m, p, until, spawn, msgs } = w
  // 已探索：玩家所在的西半边
  for (let y = 0; y < 64; y++) for (let x = 0; x < 34; x++) E.explored[y * 64 + x] = 1
  const e = spawn('male', 52, 32.5)
  until(() => e.wg!.phase === 'hunt', 12, w.away)
  ok(until(() => e.wg!.phase === 'windup', 25, w.away), '靠近到 4.5m 内 → 后缩蓄力、张嘴')
  ok(msgs.some((t) => t.includes('闪')), '蓄力时提示往旁边闪')
  const sx = p.x, sy = p.y
  ok(until(() => e.wg!.phase === 'gulp', 2, w.away), '站着不躲 → 被吞')
  ok(!E.over && p.hp > 0, '被吞不会立刻死')
  until(() => W.wranglerBlackout(E) > 0.99, 1.5)
  ok(W.wranglerBlackout(E) > 0.99, '被吞后全黑')
  ok(until(() => e.wg!.phase === 'retreat' || e.wg!.phase === 'under', 4), '吞完缩回岩层')
  ok(p.hp === WR.WAKE_HP, `醒来只剩 ${WR.WAKE_HP} HP（${p.hp}）`)
  ok(Math.hypot(p.x - sx, p.y - sy) >= WR.WAKE_MIN_D, `醒来点离吞咽点 ≥${WR.WAKE_MIN_D}m（${Math.hypot(p.x - sx, p.y - sy).toFixed(1)}m）`)
  ok(!E.explored[Math.floor(p.y) * 64 + Math.floor(p.x)], '醒来点是没去过的地方')
  ok(m.tiles[Math.floor(p.y) * 64 + Math.floor(p.x)] === 1, '醒来点是可站立的地面')
  ok(e.wg!.coolT > 100, '吞了人之后很久不会再来')
  w.run(WR.WAKE_FADE + 0.2)
  ok(W.wranglerBlackout(E) < 0.01, '醒来后画面逐渐恢复')
}
{
  const w = world(); engines.set(w.m, w.eng)
  const { eng: E, p, until, spawn } = w
  const hostile = makeEntity('hound', 10, 10, 0); w.m.entities.push(hostile)
  const e = spawn('male', 52, 32.5); void e
  const spot = W.findWakeSpot(E, p.x, p.y)
  ok(spot && Math.hypot(spot.x - 10, spot.y - 10) >= WR.WAKE_SAFE_R, '醒来点 20m 内没有敌对实体')
  void until
}
// ===== 闪避 =====
{
  const w = world(); engines.set(w.m, w.eng)
  const { p, until, spawn } = w
  const e = spawn('male', 52, 32.5)
  until(() => e.wg!.phase === 'hunt', 12, w.away)
  until(() => e.wg!.phase === 'windup', 25, w.away)
  // 蓄力期间横向闪开 3.5m
  const dir = Math.atan2(p.y - e.y, p.x - e.x) + Math.PI / 2
  for (let i = 0; i < 10; i++) { p.x += Math.cos(dir) * 0.35; p.y += Math.sin(dir) * 0.35; w.tick() }
  until(() => e.wg!.phase !== 'windup' && e.wg!.phase !== 'lunge', 2, w.away)
  ok(e.wg!.phase === 'recover' && p.hp === 100, `蓄力 ${WR.WINDUP}s 内闪开就能躲过（${e.wg!.phase}）`)
}

// ===== 身体碰撞 =====
{
  const w = world(); engines.set(w.m, w.eng)
  const { eng: E, p, until, spawn } = w
  const e = spawn('male', 52, 32.5)
  until(() => e.wg!.phase === 'hunt', 12, w.away)
  e.attackCd = 99
  w.run(3, w.away)
  const s = e.wg!
  // 找一段离头 8m 左右、在开阔地上的身体
  let acc = 0, q = s.trail[0]
  for (let i = 1; i < s.trail.length && acc < 8; i++) { acc += Math.hypot(s.trail[i].x - s.trail[i - 1].x, s.trail[i].y - s.trail[i - 1].y); q = s.trail[i] }
  ok(w.m.tiles[Math.floor(q.y) * 64 + Math.floor(q.x)] === 1, '身体中段躺在开阔地上')
  p.x = q.x + 0.1; p.y = q.y; p.z = 0
  s.phase = 'graze' as any; s.t = 0 // 静止：只推不撞
  const pushed = W.bodyCollide(E, e, s)
  const R = WR.MALE_R
  ok(pushed > 0.5, `站进身体里会被推出来（${pushed.toFixed(2)}m）`)
  ok(Math.hypot(p.x - q.x, p.y - q.y) >= R + 0.3 - 0.05, '推出后人在管体外')
  ok(p.hp === 100, '静止的身体只挡路不伤人')
  p.x = q.x; p.y = q.y; s.phase = 'hunt' as any; s.crushCd = 0
  W.bodyCollide(E, e, s)
  ok(p.hp === 100 - WR.CRUSH_DMG, `移动中的身体扫过 → 撞击 ${WR.CRUSH_DMG} 伤害`)
  p.x = q.x; p.y = q.y; W.bodyCollide(E, e, s)
  ok(p.hp === 100 - WR.CRUSH_DMG, `撞击有 ${WR.CRUSH_CD}s 冷却`)
  // 走路穿不过去：朝身体另一侧走 3 秒
  p.hp = 100; s.phase = 'graze' as any
  const h = s.trail[0]; void h
  const sx = q.x + 2.2, sy = q.y
  p.x = sx; p.y = sy
  let crossed = false
  for (let i = 0; i < 90; i++) { p.x -= 0.06; W.bodyCollide(E, e, s); if (p.x < q.x - R) crossed = true }
  ok(!crossed || Math.abs(p.y - sy) > R, '不能直接从身体中间走过去（会被推开/挤到旁边）')
}

// ===== 不可杀 / 幼体只怕火 / 母亲 =====
{
  const w = world(); engines.set(w.m, w.eng)
  const { eng: E, run, spawn } = w
  const male = spawn('male', 52, 32.5)
  male.hp = 0; E.killCheck(male)
  ok(!male.dead && male.hp === male.def.hp, '成体不可杀：血量清零也不会死')
  const mom = spawn('female', 20, 20)
  const juv = spawn('juvenile', 28, 32.5); juv.wg!.mother = mom
  juv.hp = 0; E.killCheck(juv)
  ok(!juv.dead, '幼体挨刀不会死')
  W.wranglerFire(E, mom, 1)
  ok(!mom.dead, '火油对成体无效')
  W.wranglerFire(E, juv, 1)
  ok(juv.dead, '幼体被火油烧死')
  ok(mom.wg!.rage && mom.wg!.aggro, '幼体被烧死 → 母亲暴怒')
  ok(until2(w, () => mom.wg!.phase !== 'under', 12), `母亲很快切出赶来（${mom.wg!.phase}）`)
  void run
}
function until2(w: any, f: () => boolean, s: number) { return w.until(f, s, w.away) }

// ===== 雌性：平时啃岩，贴近太久才会被盯上；受孕 =====
{
  const w = world(); engines.set(w.m, w.eng)
  const { p, until, spawn } = w
  const f = spawn('female', 39, 32.5)
  f.wg!.aggro = false
  until(() => f.wg!.phase === 'graze', 120, w.away)
  ok(f.wg!.phase === 'graze', '平静的雌性切出后在岩壁边啃岩')
  p.x = f.x - 12
  w.run(3, w.away)
  ok(f.wg!.phase === 'graze', '离她 >6m：她不理你')
  p.x = f.x - 4; p.y = f.y
  ok(until(() => f.wg!.phase === 'hunt', 4, w.away), `贴近 ${WR.FEMALE_PROVOKE_R}m 内 ${WR.FEMALE_PROVOKE_T}s → 被盯上`)
}
{
  const w = world(); engines.set(w.m, w.eng)
  let tries = 0, pregnant = 0
  for (; tries < 400; tries++) { const e = makeEntity('wrangler', 36, 32.5, 0); const s = W.initWrangler(w.eng, e, 'female'); if (s.pregnant) pregnant++ }
  ok(Math.abs(pregnant / tries - WR.PREGNANT_P) < 0.07, `雌性受孕比例约 ${WR.PREGNANT_P * 100}%（${(pregnant / tries * 100).toFixed(0)}%）`)
  const w2 = world(); engines.set(w2.m, w2.eng)
  const e = makeEntity('wrangler', 38.5, 32.5, 0)
  w2.m.entities.push(e); W.initWrangler(w2.eng, e, 'female', true)
  ok(e.wg!.pregnant, '受孕雌性')
  const eggs = W.wranglerEggs(w2.eng)
  ok(eggs.length >= 1 && eggs.length <= 2, `附近岩壁预生成 ${eggs.length} 根卵枝`)
  ok(w2.m.entities.filter((q: Entity) => q.wg?.kind === 'juvenile').length === WR.JUVENILES, `并有 ${WR.JUVENILES} 只幼体`)
  W.wranglerFireEggs(w2.eng, eggs[0].x, eggs[0].y)
  ok(eggs[0].burnt && e.wg!.rage, '烧卵枝也会激怒母亲')
}

// ===== 层级 =====
{
  const l8 = levelDefOf(8)!, l2 = levelDefOf(2)!, l9 = levelDefOf(9)!
  ok(l8.entities.some((x: any) => x.type === 'wrangler' && x.w === 3), 'L8 随实体池生成（权重 3）')
  ok(!l9.entities.some((x: any) => x.type === 'wrangler'), 'L9 不加入')
  ok(!l2.entities.some((x: any) => x.type === 'wrangler'), 'L2 不常驻，只有偶发事件')
  const w = world(2); engines.set(w.m, w.eng)
  const f = W.wranglerForceFrame(w.eng); f.l2T = 0
  const rnd = Math.random; Math.random = () => 0.1
  try { W.wranglerAmbient(w.eng, DT) } finally { Math.random = rnd }
  const ev = w.m.entities.find((q: Entity) => q.def.type === 'wrangler')
  ok(ev && ev.wg?.kind === 'male' && ev.wg.event, 'L2 偶发事件：一只雄性')
  ok(f.l2T >= WR.L2_CHECK[0], `之后 ${WR.L2_CHECK[0] / 60}–${WR.L2_CHECK[1] / 60} 分钟才会再判定`)
  ev!.wg!.coolT = 0
  w.until(() => ev!.wg!.phase === 'hunt', 15, w.away)
  ev!.attackCd = 99
  w.run(WR.L2_STAY + 6, w.away)
  ok(ev!.dead || ev!.wg!.phase === 'retreat' || ev!.wg!.phase === 'under', 'L2 事件个体短暂现身后缩回、离开')
}

// ===== 渲染接线（无 GPU：只验证建模/摆位/道具同步不抛错）=====
{
  const THREE = await import('three')
  const { buildEntityMesh } = await import('../src/game/renderer/entitiesMesh')
  const { animateWrangler, syncWranglerProps } = await import('../src/game/renderer/wranglerRender')
  const w = world(); engines.set(w.m, w.eng)
  const e = w.spawn('male', 52, 32.5)
  w.until(() => e.wg!.phase === 'hunt', 12, w.away)
  const g = buildEntityMesh('wrangler', { wranglerKind: 'male' })
  animateWrangler(g, e, w.eng, 1)
  const rig = g.userData.wranglerRig
  ok(g.visible && rig.pts.length > 10, '游戏内：追猎中的雄性按轨迹摆出身体')
  const head = rig.pts[0]
  ok(Math.hypot(head.x - e.x, head.z - e.y) < 0.8 && head.y > e.z + 1, `头在实体位置上方抬起（${head.y.toFixed(2)}m）`)
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera()
  syncWranglerProps(scene, cam, w.eng)
  ok(scene.children.length >= 2, '岩壁洞口与鼓包已挂进场景')
  const j = w.spawn('juvenile', 30, 30)
  const gj = buildEntityMesh('wrangler', { wranglerKind: 'juvenile' })
  animateWrangler(gj, j, w.eng, 1.3)
  ok(gj.userData.wranglerKind === 'juvenile' && gj.visible, '幼体模型 + 蹦跳片段')
  const gf = buildEntityMesh('wrangler', { wranglerKind: 'female', wranglerPregnant: true })
  ok(gf.userData.wranglerPregnant === true, '受孕雌性模型')
}

console.log(`\n${n - fails}/${n} 通过`)
if (fails) process.exit(1)
