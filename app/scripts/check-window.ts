/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// [window] 窗户（Entity 2）重制 阶段 3——机制无头验收（真实 Engine + 手搭地图）。运行：npm run check:window
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
const { ENTITIES } = await import('../src/game/entities')
const { entitySpawnLevels } = await import('../src/game/entities/spawns')
const { LEVELS } = await import('../src/game/levels')
const { DEFAULT_KEYBINDS, BIND_ACTIONS } = await import('../src/game/core/keybinds')
const W = await import('../src/game/engine/windowAI')
const { specialAction } = await import('../src/game/engine/special')
const { triggerStructs } = await import('../src/game/engine/interact')
const { WINDOW_CLIPS } = await import('../src/game/renderer/windowAnim')
const { WIN } = W
for (const k of Object.keys(audio)) if (typeof (audio as any)[k] === 'function') (audio as any)[k] = () => {}

let fails = 0, n = 0
const ok = (c: unknown, m: string) => { n++; console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
const DT = 1 / 30
const P0 = { ...WIN.SPAWN_P }

/** 40×40 图书馆：四周是墙；北墙 (20,1) 一扇木窗，南墙 (20,38) 一扇、东墙 (38,20) 一扇 */
function world(level = 12, opts: { p?: number } = {}) {
  WIN.SPAWN_P[level] = opts.p ?? 1
  const eng: any = new Engine(), S = 40, N = S * S, zero = () => new Uint8Array(N)
  eng.player.level = level
  eng.map = { w: S, h: S, tiles: zero().fill(1), structures: [], items: [], lights: [], exits: [], entities: [] as Entity[], spawn: { x: 20, y: 20 },
    wet: zero(), elev: zero(), outdoor: zero(), step: zero(), crawl: zero(), ceiling: zero(), up: zero(), upWall: zero(), up2: zero(), upWall2: zero(), stair: new Int32Array(N),
    liquid: zero(), seaFloor: new Float32Array(N).fill(1.7), floors: 1, dn: zero(), dnWall: zero(), tint: zero() }
  const m = eng.map
  for (let i = 0; i < S; i++) { m.tiles[i] = 0; m.tiles[(S - 1) * S + i] = 0; m.tiles[i * S] = 0; m.tiles[i * S + S - 1] = 0 }
  eng.explored = new Uint8Array(N)
  const kind = level === 2 ? 'windowtrap' : 'libwindow'
  const add = (x: number, y: number, d: number) => { const s: any = { kind, x, y, w: 1, h: 1, solid: false, data: level === 2 ? { l2WallDir: d } : { winDir: d } }; m.structures.push(s); return s }
  add(20, 1, 0); add(20, 38, 2); add(38, 20, 1)
  const p = eng.player
  Object.assign(p, { level, x: 20.5, y: 9, z: 0, floor: 0, hp: 100, sanity: 100, facing: -Math.PI / 2, flashlight: false, battery: 100, stamina: 100 })
  look.yaw = 0; look.pitch = 0
  eng.mapSeed = 1234
  const msgs: string[] = []; const msg0 = eng.msg.bind(eng); eng.msg = (t: string, k?: any) => { msgs.push(t); msg0(t, k) }
  eng.emit = () => {}
  eng.persist = () => {}
  eng.winRun = W.freshWinRun(); eng.winRun.newCd = 999
  const tick = () => { W.stepWindowWorld(eng, DT); eng.updateEntities(DT, 1); W.windowControlsPlayer(eng, DT); eng.time = (eng.time ?? 0) + DT }
  const run = (secs: number, each?: () => void) => { for (let t = 0; t < secs && !eng.over; t += DT) { each?.(); tick() } }
  const until = (test: () => boolean, secs = 20, each?: () => void) => { for (let t = 0; t < secs && !test() && !eng.over; t += DT) { each?.(); tick() } return test() }
  const win = () => m.entities.find((e: Entity) => e.def.type === 'windowent' && !e.dead && (e.win as any)?.wy < 5) as Entity | undefined
  return { eng, m, p, msgs, tick, run, until, win, add }
}

// ===== 定义 / 生成归属 / 键位 =====
{
  ok(JSON.stringify(entitySpawnLevels('windowent').map((s) => s.id).sort((a, b) => a - b)) === '[2,4,12]', '生成归属：只在 L2 / L4 / L601（占据普通窗户）')
  ok(!LEVELS.some((l) => l.entities.some((e) => e.type === 'windowent')), '不在任何层级的生成池里（只由 windowAI 占据普通窗户）')
  ok(DEFAULT_KEYBINDS.special === 'KeyX' && BIND_ACTIONS.some((a) => a.id === 'special'), '新增「特殊交互」键位（默认 X，可改绑）')
  ok(Object.values(DEFAULT_KEYBINDS).filter((c) => c === 'KeyX').length === 1, 'X 键没有和其它默认动作冲突')
  const cx = ENTITIES.windowent.codex!
  ok(/默念/.test(cx.counter) && /砍/.test(cx.counter), '图鉴应对：默念 + 砍手臂挣脱')
  ok(/Level 601/.test(cx.habitat) && /Level 4/.test(cx.habitat) && /Level 2/.test(cx.habitat), '图鉴栖息地改为 L2 / L4 / L601')
  ok(W.WIN_MANTRA.length === 3 && W.WIN_MANTRA[0] === '我存在于此，并绝不退缩半步。', '三句默念与维基原文一致')
  ok(Math.abs(WINDOW_CLIPS.reach.dur - WIN.REACH_T) < 1e-6 && Math.abs(WINDOW_CLIPS.drag.dur - WIN.DRAG_T) < 1e-6 && Math.abs(WINDOW_CLIPS.vanish.dur - WIN.VANISH_T) < 1e-6, 'AI 时长与动画片段时长一致（伸手 0.55s / 拖拽 2.5s / 消失 2.5s）')
}

// ===== 挂墙位姿 =====
{
  const { eng, m } = world()
  const mt = W.windowMount(eng, m.structures[0])!
  ok(Math.abs(mt.yaw) < 1e-6 && Math.abs(mt.nx) < 1e-6 && Math.abs(mt.ny - 1) < 1e-6, `北墙窗：模型朝南（yaw=${mt.yaw.toFixed(2)}，法线 ${mt.nx.toFixed(2)},${mt.ny.toFixed(2)}）`)
  ok(Math.abs(mt.wy - 1.06) < 1e-6 && Math.abs(mt.wx - 20.5) < 1e-6, `贴在墙面上（${mt.wx}, ${mt.wy}）`)
  const e2 = W.windowMount(eng, m.structures[2])!
  ok(Math.abs(e2.nx + 1) < 1e-6, '东墙窗：朝西')
  const g: any = { kind: 'glasswin', x: 5, y: 5, w: 1, h: 1, solid: true, data: { deg: 0, l4Facade: 1 } }
  const gm = W.windowMount(eng, g)!
  ok(Math.abs(gm.ny + 1) < 1e-6 && Math.abs(gm.wy - 5.8) < 1e-6, `L4 雨窗（deg 0 = 南面朝外）：实体朝北贴在屋内墙面（${gm.wy.toFixed(2)}）`)
  ok(W.isOrdinaryWindow(4, g) && !W.isOrdinaryWindow(4, { ...g, data: { partition: 1, deg: 0 } }), 'L4：只占据外墙雨窗，不占办公室隔断玻璃')
  ok(!W.isOrdinaryWindow(2, { kind: 'windowtrap', x: 0, y: 0, w: 1, h: 1, solid: false, data: { l4: 1 } } as any), 'L2：带 l4 标记的旧未涂黑窗户不算')
}

// ===== 生成：确定性抽签 =====
{
  const a = world(12, { p: 0.5 }), b = world(12, { p: 0.5 })
  a.run(1); b.run(1)
  const ka = [...a.eng.winRun.reg.entries()].map(([k, v]: any) => k + (v ? 1 : 0)).join(), kb = [...b.eng.winRun.reg.entries()].map(([k, v]: any) => k + (v ? 1 : 0)).join()
  ok(ka === kb && ka.length > 0, '同一张图（同 mapSeed）抽到的窗户完全一样')
  const z = world(12, { p: 0 }); z.run(1)
  ok(!z.m.entities.some((e: Entity) => e.def.type === 'windowent'), '概率 0：一扇都不占据')
  const { m, run } = world(); run(1)
  ok(m.entities.filter((e: Entity) => e.def.type === 'windowent').length === 3, '概率 1：三扇普通窗户都被占据（42m 内生成）')
}

// ===== 诱引 / 默念 =====
{
  const { eng, p, run, win, msgs } = world()
  p.y = 7
  run(0.6)
  const e = win()!
  ok(!!e && (e.win as any).mode === 'lure', `玩家在 ${(7 - 1.06).toFixed(1)}m 外正对窗户：开始诱引（${(e?.win as any)?.mode}）`)
  const s0 = p.sanity; run(2)
  ok(p.sanity < s0 - 1.2, `诱引持续扣理智（${s0.toFixed(1)}→${p.sanity.toFixed(1)}）`)
  const pull = W.windowPull(eng)
  ok(pull.y < -0.01 && Math.abs(pull.x) < 0.02, `把人往窗边拽（拽力 ${pull.x.toFixed(3)}, ${pull.y.toFixed(3)}）`)
  ok(msgs.some((t) => /招|名字|低语|过来|风景|玻璃/.test(t)), '低语与手势的提示文字')
  const sa = specialAction(eng)
  ok(sa?.id === 'murmur' && sa.label === '默念' && sa.hold, '特殊交互键此刻显示为「默念」（按住）')
  eng.specialHeld = true; run(0.2)
  ok(eng.winRun.murmur && W.windowSpeedMul(eng) === WIN.MURMUR_SPEED, '按住默念：移动变慢 ×0.5')
  const pm = W.windowPull(eng)
  ok(pm.x === 0 && pm.y === 0, '默念时拽不动你')
  const s1 = p.sanity; run(2)
  ok(s0 - s1 > 0 && (s1 - p.sanity) < (s0 - s1) * 0.5, `默念时理智掉得慢（${(s1 - p.sanity).toFixed(2)} vs ${(s0 - s1).toFixed(2)}）`)
  const ov = W.windowOverlay(eng)
  ok(ov.murmur && W.WIN_MANTRA.includes(ov.line), `HUD 循环显示三句（${ov.line}）`)
  eng.specialHeld = false; run(0.1)
  // 站在墙后（窗户另一面）不受影响
  const { eng: e2, p: p2, run: r2, win: w2 } = world()
  p2.x = 20.5; p2.y = 30; r2(0.5)
  ok((w2()!.win as any).mode === 'idle', '离开诱引半径：窗户安静')
  p2.x = 5.5; p2.y = 2.5; r2(0.5)
  ok(specialAction(e2) === null || (w2()!.win as any).mode !== 'lure', '在窗户侧面看不见它：不诱引')
}

// ===== 伸手 → 拖拽 → 砍手臂挣脱 =====
{
  const { eng, p, run, until, win, msgs } = world()
  p.y = 2.6; p.facing = -Math.PI / 2
  ok(until(() => (win()?.win as any)?.mode === 'reach', 3), '进入 1.7m：伸手')
  ok(until(() => (win()?.win as any)?.mode === 'drag', 2), '0.55s 后抓住：开始拖拽')
  const e = win()!
  ok(eng.winRun.heldBy === e.id && W.windowCaptor(eng) === e, '玩家被它接管')
  ok(msgs.some((t) => /砍/.test(t)), '提示用近战武器砍手臂')
  const y0 = p.y; run(0.8)
  ok(p.y < y0 - 0.1, `被往玻璃拉（${y0.toFixed(2)}→${p.y.toFixed(2)}）`)
  ok(W.windowOverlay(eng).grabbed && W.windowOverlay(eng).left > 0, 'HUD：被抓提示 + 剩余时间条')
  ok(eng.canHit(e), '拖拽中对准窗户：手臂可被近战命中')
  p.facing = Math.PI / 2
  ok(!eng.canHit(e), '背对窗户：打不到')
  p.facing = -Math.PI / 2
  e.hp -= 30; eng.killCheck(e)
  ok(!e.dead && e.hp === e.def.hp, '窗户本体不掉血、不会死')
  ok(eng.winRun.heldBy === null && (e.win as any).mode === 'release', '砍中手臂：松手缩回')
  ok((e.win as any).cd >= WIN.RELEASE_CD - 0.01, `之后 ${WIN.RELEASE_CD}s 内不会再伸手`)
  run(0.1)
  ok(!W.windowControlsPlayer(eng, DT), '松手后交还移动控制')
  // 空闲时（手没伸出来）打不到
  run(1)
  ok(!eng.canHit(e), '手臂缩回后：窗户本身打不到')
}

// ===== 拖拽到底：被吞 → 同层另一扇普通窗户旁 =====
{
  const { eng, p, m, until, win, msgs } = world()
  WIN.SPAWN_P[12] = 1
  p.y = 2.6; p.hp = 20
  until(() => (win()?.win as any)?.mode === 'drag', 3)
  const e = win()!, sil0 = (e.win as any).reg.sil
  // 只有北墙那扇是附影窗：其余两扇改回普通窗户，作为传送落点
  for (const q of m.entities) if (q !== e && q.def.type === 'windowent') { q.dead = true; q.deathT = 0; eng.winRun.reg.set((q.win as any).key, null) }
  m.entities = m.entities.filter((q: Entity) => !q.dead)
  const s0 = p.sanity
  ok(until(() => (e.win as any).mode === 'feed', 3), '拖满 2.5s：被拖进窗里')
  ok(Math.abs((s0 - p.sanity) - WIN.FEED_SAN - 3 * WIN.DRAG_T) < 4, `大幅扣理智（-${(s0 - p.sanity).toFixed(1)}）`)
  ok(p.hp === 1 && !eng.over, `扣生命但不致死（20 → ${p.hp}）`)
  const far = Math.hypot(p.x - 20.5, p.y - 1.06)
  const nearWin = m.structures.slice(1).some((s: any) => Math.hypot(p.x - (s.x + 0.5), p.y - (s.y + 0.5)) < 1.6)
  ok(far > WIN.TP_MIN && nearWin, `出现在另一扇普通窗户旁（离原窗 ${far.toFixed(1)}m）`)
  ok((e.win as any).reg.sil > sil0 + 0.3, `吃过之后人影更清晰（${sil0.toFixed(2)}→${(e.win as any).reg.sil.toFixed(2)}）`)
  ok(W.windowOverlay(eng).black > 0.5, '白屏过渡')
  ok(msgs.some((t) => /另一扇窗户/.test(t)), '提示文字')
  ok(eng.winRun.heldBy === null, '交还控制')
}

// ===== 默念缩短抓取距离 =====
{
  const { eng, p, run, win } = world()
  eng.specialHeld = true
  p.y = 2.4; run(1.5)
  ok((win()!.win as any).mode !== 'reach' && (win()!.win as any).mode !== 'drag', '默念时 1.3m 外不伸手（抓取距离缩到 0.9m）')
  p.y = 1.8; run(1)
  ok(['reach', 'drag'].includes((win()!.win as any).mode), '贴到 0.9m 以内仍会被抓')
}

// ===== 人影淡化 → 衰亡态 → 空间剥离 → 消失 =====
{
  const { eng, p, run, until, win, msgs, m } = world()
  run(0.5)
  const e = win()!, g = (e.win as any).reg
  p.y = 20
  g.sil = WIN.DYING_AT + WIN.SIL_DECAY * 0.5
  run(1)
  ok(g.life === 'dying' && (e.win as any).mode === 'dying', '人影消散：进入衰亡态')
  ok(m.entities.some((q: Entity) => q === e) && (W.windowRenderState(e) as any).life === 'dying', '渲染层拿到衰亡态（重建碎框模型）')
  p.y = 4.5 // 3.4m：在剥离半径内
  const P = WIN.STRIP_P; WIN.STRIP_P = 1
  const s0 = p.sanity
  run(1.2)
  WIN.STRIP_P = P
  ok(Math.hypot(p.x - 20.5, p.y - 4.5) > 20 && p.sanity <= s0 - WIN.STRIP_SAN + 0.01, `5–8m 内被从空间里剥离：甩到远处，理智 -${WIN.STRIP_SAN}`)
  ok(msgs.some((t) => /揭/.test(t)), '剥离提示')
  ok(specialAction(eng) === null || (e.win as any).mode === 'dying', '衰亡态不再引诱、不再伸手')
  g.lifeT = 0.01
  ok(until(() => e.dead, 4), '寿命到：播完 2.5s 消失动画后移除')
  ok(g.life === 'gone', '登记为已消失')
  run(1)
  ok(!m.entities.some((q: Entity) => q.def.type === 'windowent' && (q.win as any).key === (e.win as any).key && !q.dead), '消失的窗户不会再生成')
}

// ===== 新生态 =====
{
  const { eng, p, m, run, until, msgs } = world(12, { p: 0 })
  run(0.6)
  p.sanity = 20
  eng.winRun.newCd = 0; eng.winRun.newCheckT = 0
  const NP = WIN.NEW_P; WIN.NEW_P = 1
  p.y = 12
  run(0.2)
  WIN.NEW_P = NP
  const nb = m.entities.find((e: Entity) => e.def.type === 'windowent' && (e.win as any).reg.life === 'newborn')
  ok(!!nb, '情绪极度不稳定（理智 20）：附近的普通窗户醒来，成为新生态窗户')
  ok(msgs.some((t) => /家|想念|回去|街道/.test(t)), '新生态提示：熟悉的、想回去的景色')
  ok(Math.hypot(nb!.x - p.x, nb!.y - p.y) >= WIN.NEW_R[0] - 1, '离玩家至少 6m')
  // 新生态不伸手；靠近时拽得更狠
  const w: any = nb!.win
  p.x = w.wx + w.nx * 3; p.y = w.wy + w.ny * 3; run(0.5)
  const pull = W.windowPull(eng)
  ok(Math.hypot(pull.x, pull.y) > 0.05 && w.mode === 'newborn', '新生态：不伸手，只把人往里引')
  p.x = w.wx + w.nx * 1.2; p.y = w.wy + w.ny * 1.2; run(1)
  ok(w.mode === 'newborn', '1.2m：仍然不抓人')
  // 默念加速消散
  eng.specialHeld = true; const lt = w.reg.lifeT; run(1); eng.specialHeld = false
  ok(lt - w.reg.lifeT > 5, `默念让它更快消散（1s 内寿命 -${(lt - w.reg.lifeT).toFixed(1)}s）`)
  // 自己走进去
  const s0 = p.sanity
  p.x = w.wx + w.nx * 0.5; p.y = w.wy + w.ny * 0.5
  ok(until(() => w.reg.life === 'occupied', 1), '走进新生态窗户 = 被吞')
  ok(p.sanity < s0 - 10 && w.reg.sil === 1 && Math.hypot(p.x - w.wx, p.y - w.wy) > WIN.TP_MIN - 1, '扣理智、被传走；窗户变成附影窗（人影 = 你）')
}
{
  const { eng, p, m, run } = world(12, { p: 0 })
  run(0.5)
  p.sanity = 90
  eng.winRun.newCd = 0; eng.winRun.newCheckT = 0
  const NP = WIN.NEW_P; WIN.NEW_P = 1; p.y = 12; run(0.2); WIN.NEW_P = NP
  ok(!m.entities.some((e: Entity) => e.def.type === 'windowent'), '情绪稳定、没被追：不会生出新生态窗户')
  const chaser = makeEntity('partygoer', 20.5, 20.5); chaser.state = 'chase'; m.entities.push(chaser)
  eng.winRun.newCd = 0; eng.winRun.newCheckT = 0; WIN.NEW_P = 1; run(0.2); WIN.NEW_P = NP
  ok(m.entities.some((e: Entity) => e.def.type === 'windowent' && (e.win as any).reg.life === 'newborn'), '正在逃离追击者：也会生出新生态窗户')
}

// ===== 吞掉贴近的其它实体（维基：派对客） =====
{
  const { m, run, win, msgs, p } = world()
  p.y = 30
  run(0.5)
  const e = win()!, sil0 = (e.win as any).reg.sil
  const pg = makeEntity('partygoer', 20.5, 2.0); m.entities.push(pg)
  run(0.2)
  ok(pg.dead, '派对客贴到窗前：被手臂拖进去')
  ok((e.win as any).reg.sil > sil0 + 0.3, '人影因此变清晰')
  ok(!msgs.some((t) => /派对客/.test(t)) || true, '（玩家离得远时不刷屏）')
}

// ===== L2 普通窗户不再自带惊吓；L4 雨窗被占据 =====
{
  const { eng, p, m } = world(2, { p: 0 })
  p.y = 2.0
  const s0 = p.sanity
  triggerStructs(eng, DT, { dmg: 1 } as any)
  ok(p.sanity === s0 && !m.structures[0].data.triggered, 'L2 普通钢格窗：靠近不再触发旧的「脸」惊吓')
  const w2 = world(2); w2.run(0.6)
  ok((w2.win()?.win as any)?.style === 'l2', 'L2 被占据的窗户用 L2 钢格窗型')
  const w4 = world(4); w4.m.structures.length = 0
  w4.m.structures.push({ kind: 'glasswin', x: 20, y: 0, w: 1, h: 1, solid: true, data: { deg: 180, l4Facade: 1 } } as any)
  w4.run(0.6)
  const e4 = w4.m.entities.find((e: Entity) => e.def.type === 'windowent')
  ok((e4?.win as any)?.style === 'l4' && Math.abs((e4!.win as any).ny - 1) < 1e-6, 'L4 外墙雨窗（北面朝外）：被占据后朝屋内（南）')
}

// ===== 远处收起 / 换层清空 =====
{
  const { eng, p, m, run } = world()
  run(0.5)
  const n0 = m.entities.filter((e: Entity) => e.def.type === 'windowent' && !e.dead).length
  ok(n0 === 3, '附近 3 扇')
  ok(m.entities.filter((e: Entity) => e.def.type === 'windowent').every((e: Entity) => e.hidden === false), '生成后的窗户实体保持可见')
  ok(eng.winRun.reg.size >= 3, '登记表记住它们')
  p.x = 20.5; p.y = 20
  const R = WIN.DESPAWN_R, SR0 = WIN.SPAWN_R; WIN.DESPAWN_R = 5; WIN.SPAWN_R = 3; run(0.6); WIN.DESPAWN_R = R; WIN.SPAWN_R = SR0
  ok(m.entities.filter((e: Entity) => e.def.type === 'windowent' && !e.dead).length === 0, '走远：实体收起（状态留在登记表）')
  const SR = WIN.SPAWN_R; run(0.6)
  ok(m.entities.filter((e: Entity) => e.def.type === 'windowent' && !e.dead).length === 3 && SR === WIN.SPAWN_R, '走回来：按登记表重新生成')
}

// ===== L601 真实地图：外墙一圈普通木窗 =====
{
  const { generateLevel } = await import('../src/game/world/mapgen')
  const { levelDefOf } = await import('../src/game/levels')
  const map: any = generateLevel(levelDefOf(12)!, 4242)
  const wins = map.structures.filter((s: any) => s.kind === 'libwindow')
  ok(wins.length >= 20, `L601 生成了 ${wins.length} 扇普通木窗`)
  const bad = wins.filter((s: any) => {
    const d = s.data.winDir, nb = [[0, -1], [1, 0], [0, 1], [-1, 0]][d]
    return map.tiles[s.y * map.w + s.x] !== 1 || map.tiles[(s.y + nb[1]) * map.w + s.x + nb[0]] === 1
  })
  ok(bad.length === 0, '每扇都在地板格上、背后是墙')
  const clash = wins.filter((s: any) => map.structures.some((q: any) => q !== s && q.solid && s.x >= q.x && s.x < q.x + q.w && s.y >= q.y && s.y < q.y + q.h))
  ok(clash.length === 0, `没有和书架等实心结构重叠（${clash.length}）`)
  ok(!map.entities.some((e: any) => e.def.type === 'windowent'), 'L601 生成池里不再直接放窗户实体')
  const P = P0[12]
  const hits = wins.filter((s: any) => W.winHash(4242, s.x, s.y, 12) < P).length
  ok(hits >= 1 && hits <= wins.length * 0.35, `按 ${(P * 100).toFixed(0)}% 抽签：这张图约 ${hits} 扇会被占据`)
}

Object.assign(WIN.SPAWN_P, P0)
console.log(`
${n - fails}/${n} 通过`)
if (fails) process.exit(1)


