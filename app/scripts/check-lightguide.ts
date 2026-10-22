/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接读写引擎内部状态 */
// 微光向导（Entity 35）重制第 3 阶段——机制验收：纯逻辑单测 + 真实 Engine / 真实 L8 关卡生成 / 真实 step 循环。
// 运行：npm run check:lightguide     结果同时写入 reports/lightguide/mechanics-check.txt
import { mkdirSync, writeFileSync } from 'node:fs'

const memory = new Map<string, string>()
Object.assign(globalThis, { window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }, document: { createElement: () => ({ getContext: () => null, style: {} }), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } }, localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) } })
const { Engine } = await import('../src/game/engine')
const A = await import('../src/game/engine/lightguideAI')
const Anim = await import('../src/game/renderer/lightguideAnim')
const R = await import('../src/game/renderer/lightguideRender')
const { audio } = await import('../src/game/core/audio')
const { makeEntity } = await import('../src/game/entities')
const { buildEntityMesh } = await import('../src/game/renderer/entitiesMesh')
const { LEVELS } = await import('../src/game/levels')
const { genL8ChunkRaw, l8VariantOf } = await import('../src/game/world/infiniteL8')
const { L8 } = await import('../src/game/levels/l8')
const { infiniteImplFor } = await import('../src/game/world/infiniteRegistry')
const { combat } = await (async () => ({ combat: await import('../src/game/engine/combat') }))()

for (const k of ['aggro', 'hit', 'swing', 'hurt', 'pickup', 'uiTick', 'spark', 'searchTick', 'splash', 'scrape', 'setUnderwater', 'footstep', 'whisper'] as const) (audio as any)[k] = () => {}
const lines: string[] = []
let fails = 0, n = 0
const ok = (c: unknown, m: string) => { n++; const l = `${c ? '✔' : '✘'} ${m}`; console.log(l); lines.push(l); if (!c) fails++ }
const L = A.LIGHTGUIDE

// ───────── 1. 纯函数 ─────────
{
  ok(A.LG_CLIP.BECKON_ADVANCE === Anim.LIGHTGUIDE_BECKON_ADVANCE && A.LG_CLIP.BECKON_LEN === Anim.LIGHTGUIDE_CLIPS.beckon.len && A.LG_CLIP.FLEE_GONE_T === Anim.LIGHTGUIDE_FLEE_GONE_T
    && A.LG_CLIP.PHASE_WALL_T === Anim.LIGHTGUIDE_PHASE_WALL_T && A.LG_CLIP.PHASE_LEN === Anim.LIGHTGUIDE_CLIPS.phase.len && A.LG_CLIP.WARN_FADE === Anim.LIGHTGUIDE_WARN_FADE,
  'AI 侧片段常量与 lightguideAnim 一致（beckon 3.6s/前移 0.9m、flee 1.5s、phase 1.2s/0.6s、warn 0.5s）')
  const sizes = Array.from({ length: 200 }, (_, i) => A.lightguideSize(i))
  ok(Math.min(...sizes) >= 0.05 && Math.max(...sizes) <= 0.15 && Math.max(...sizes) - Math.min(...sizes) > 0.07 && A.lightguideSize(42) === A.lightguideSize(42), `光球直径按 id 确定性落在 5–15cm（${(Math.min(...sizes) * 100).toFixed(1)}–${(Math.max(...sizes) * 100).toFixed(1)}cm）`)
  const sup = [{ kind: 'supply' as const, x: 30, y: 0, label: '罐头', key: 'a' }, { kind: 'supply' as const, x: 12, y: 5, label: '绷带', key: 'b' }]
  const ex = [{ kind: 'exit' as const, x: 3, y: 0, label: '出口', key: 'x' }]
  ok(A.pickLightguideTarget(sup, ex, 0, 0)?.key === 'b', '目标选择：60m 内有补给时补给优先（即使出口更近），取最近的补给')
  ok(A.pickLightguideTarget([], ex, 0, 0)?.key === 'x', '目标选择：没有补给时选最近的出口')
  ok(A.pickLightguideTarget([{ kind: 'supply', x: 70, y: 0, label: '远', key: 'f' }], ex, 0, 0)?.key === 'x', '目标选择：60m 以外的补给不算，转去出口')
  ok(A.pickLightguideTarget([], [], 0, 0) === null, '目标选择：都没有时返回 null')
  ok(['canned', 'almond', 'bandage', 'driedfruit', 'disinfectant'].every(A.isLightguideSupplyItem) && !['xenonmarble', 'battery', 'stonekazoo', 'uvlamp'].some(A.isLightguideSupplyItem), '补给物品判定：食物/水/医疗算，电池/氙弹珠/工具不算')
  // 带路距离保持
  const a = A.lightguideLeadStep(0, 1, 40, 0.1, 1.4)
  const b = A.lightguideLeadStep(0, 4, 40, 0.1, 1.4)
  const c = A.lightguideLeadStep(0, 7, 40, 0.1, 0)
  const c2 = A.lightguideLeadStep(0, 4.05, 40, 0.1, 0)
  ok(a.sub === 'travel' && a.sg > 1 && a.sg <= 4, `领先不足 3m：追到前方（travel，${a.sg.toFixed(2)}m）`)
  ok(b.sub === 'beckon' && b.sg === 4, '领先 3–5m：原地 beckon 等待，锚点不动（根位移由片段回绕同步）')
  ok(c.sub === 'return' && c.sg < 7 && c.sg >= 4 && c2.sub === 'beckon', '领先超过 5m（玩家停下/落后）：回头，停在玩家前方 4m 处')
  ok(A.lightguideLeadStep(36.5, 40, 40, 0.1).sub === 'beckon' && A.lightguideLeadStep(36.5, 40, 40, 0.1).sg === 40, '路径终点：不再前进，原地等')
  ok(A.lightguideMoodFor('guide') === 'guide' && A.lightguideMoodFor('approach') === 'guide' && A.lightguideMoodFor('warn') === 'warn' && A.lightguideMoodFor('nest') === 'nest' && A.lightguideMoodFor('idle') === 'idle' && A.lightguideMoodFor('avoid') === 'idle', '情绪色：带路/靠近=青白 guide，警示=粉白 warn，守巢=淡金 nest，闲逛/回避=暖白 idle')
  const ent = (type: string, extra: any = {}) => { const q: any = makeEntity(type, 0, 0, 0); Object.assign(q.def = { ...q.def }, extra); return q }
  ok(A.isLightguideDanger(ent('camocrawler')) && A.isLightguideDanger(ent('arachnid')) && A.isLightguideDanger(ent('wretch')), '危险判定：迷彩爬行者、蛛形纲、悲尸算危险')
  ok(!A.isLightguideDanger(ent('arachnid', { herbivore: true, passive: true })) && !A.isLightguideDanger(ent('lightguide')) && !A.isLightguideDanger(ent('dryshrimp')), '危险判定：食草蛛形纲、同类、旱虾不算危险')
  const rat = ent('corpserat'); const rat2 = ent('corpserat'); rat2.provoked = true
  ok(!A.isLightguideDanger(rat) && A.isLightguideDanger(rat2), '危险判定：被动实体只有被激怒后才算危险')
}

// ───────── 2. 生成：只在 L8，稀有，单只或 2–3 只一组 ─────────
{
  const holders = LEVELS.filter((lv: any) => lv.entities.some((q: any) => q.type === 'lightguide')).map((lv: any) => lv.id)
  ok(holders.length === 1 && holders[0] === 8, `生成池：只有 L8 的实体表里有微光向导（${holders.join(',')}）`)
  // 其他无限层的区块生成器抽样，均不应出现向导
  let other = 0, sampled = 0
  for (const id of [0, 1, 2, 3, 4, 5, 6, 7, 9, 10]) {
    let impl: any; try { impl = infiniteImplFor(id) } catch { continue }
    const def = LEVELS.find((q: any) => q.id === id)
    if (!impl?.genRaw || !def) continue
    for (let k = 0; k < 6; k++) { try { const raw = impl.genRaw(def, 777 + k, k - 3, 2 - k); sampled++; other += raw.entities.filter((q: any) => q.type === 'lightguide').length } catch { /* 个别层需要运行时上下文，跳过 */ } }
  }
  ok(other === 0 && sampled > 10, `其他层区块生成抽样 ${sampled} 个，向导 0 只`)
  const seed = 20261022
  let hyper = 0, none = 0, single = 0, group = 0, outside = 0, spread = 0, total = 0
  for (let cy = -14; cy <= 14; cy++) for (let cx = -14; cx <= 14; cx++) {
    const variant = l8VariantOf(seed, cx, cy)
    const raw = genL8ChunkRaw(L8 as any, seed, cx, cy)
    const g = raw.entities.filter((q: any) => q.type === 'lightguide')
    total += g.length
    if (variant !== 'hyperspace') { outside += g.length; continue }
    hyper++
    if (g.length === 0) none++; else if (g.length === 1) single++; else group++
    if (g.length > 3) spread += 100
    for (const q of g) spread = Math.max(spread, Math.hypot(q.x - g[0].x, q.y - g[0].y) > 1.7 && g.length > 1 ? spread + 0 : spread)
  }
  // 组内间距
  let maxGap = 0
  for (let cy = -14; cy <= 14; cy++) for (let cx = -14; cx <= 14; cx++) {
    if (l8VariantOf(seed, cx, cy) !== 'hyperspace') continue
    const g = genL8ChunkRaw(L8 as any, seed, cx, cy).entities.filter((q: any) => q.type === 'lightguide')
    for (const q of g) maxGap = Math.max(maxGap, Math.hypot(q.x - g[0].x, q.y - g[0].y))
  }
  ok(hyper > 10 && outside === 0, `L8 生成：只在多维之路区块（${hyper} 个），其余区块 0 只`)
  ok(none > 0 && single > 0 && group > 0 && spread === 0, `L8 生成：无 ${none} / 单只 ${single} / 2–3 只一组 ${group}，每区块不超过 3 只`)
  ok(maxGap <= 1.7, `L8 生成：同组个体相距不超过 1.7m（最大 ${maxGap.toFixed(2)}m）`)
  ok(total / (29 * 29) < 0.6, `L8 生成：稀有（平均每区块 ${(total / (29 * 29)).toFixed(3)} 只）`)
  // 确定性：同一区块两次生成结果一致（未打乱随机序列）
  const hx = (() => { for (let cy = -14; cy <= 14; cy++) for (let cx = -14; cx <= 14; cx++) if (l8VariantOf(seed, cx, cy) === 'hyperspace') return [cx, cy]; return [0, 0] })()
  const r1 = genL8ChunkRaw(L8 as any, seed, hx[0], hx[1]), r2 = genL8ChunkRaw(L8 as any, seed, hx[0], hx[1])
  ok(JSON.stringify(r1.entities) === JSON.stringify(r2.entities) && JSON.stringify(r1.items) === JSON.stringify(r2.items), '生成确定性：同一区块重复生成，实体与物品完全一致')
}

// ───────── 3. 真实引擎：带路 ─────────
function fresh(seed = 808) {
  const e: any = new Engine(); e.seed = seed
  e.loadLevel(8, { mapSeed: seed, firstVisit: true }); e.introT = 0
  e.player.hp = 100; e.player.sanity = 100; e.player.thirst = 100; e.player.hunger = 100; e.player.flashlight = false
  e.dev.statLock = false
  const msgs: string[] = []; const om = e.msg.bind(e); e.msg = (t: string, k: any) => { msgs.push(t); om(t, k) }
  return { e, msgs }
}
let nid = 70000
function guide(e: any, x: number, y: number) { const q: any = makeEntity('lightguide', x, y, 0); q.id = nid++; q.testKeep = true; e.map.entities.push(q); return q }
const OX = (e: any) => e.map.inf?.ox ?? 0, OY = (e: any) => e.map.inf?.oy ?? 0
function place(e: any, x: number, y: number) { const p = e.player; p.x = x; p.y = y; p.vz = 0 }
function run(e: any, secs: number, each?: (t: number) => unknown) {
  const dt = 1 / 30
  for (let t = 0; t < secs; t += dt) {
    if (each?.(t) === true) return
    e.map.entities = e.map.entities.filter((q: any) => q.testKeep)
    e.blackoutT = 0
    e.step(dt)
    if (e.over) return
  }
}
/** 从玩家位置在可走格子里找一个 BFS 路程约 len 的点 */
function reachable(e: any, sx: number, sy: number, minLen: number, maxLen: number) {
  const m = e.map
  for (let r = 40; r >= 6; r -= 2) for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2, x = sx + Math.cos(a) * r, y = sy + Math.sin(a) * r
    if (!A.lightguideWalkable(m, Math.floor(x), Math.floor(y))) continue
    const res = A.findLightguidePath(m, sx, sy, x, y, false)
    if (!res) continue
    let len = 0; for (let i = 1; i < res.pts.length; i++) len += Math.hypot(res.pts[i].x - res.pts[i - 1].x, res.pts[i].y - res.pts[i - 1].y)
    if (len >= minLen && len <= maxLen && res.pts.length >= 3) return { x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5, len, pts: res.pts }
  }
  return null
}
function clearSupplies(e: any) {
  e.map.items = e.map.items.filter((it: any) => !A.isLightguideSupplyItem(it.type) && it.type !== 'xenonmarble')
  for (const s of e.map.structures) if (A.LIGHTGUIDE_SUPPLY_CONTAINERS.has(s.kind)) s.looted = true
}
function setup(seed = 808) {
  const { e, msgs } = fresh(seed)
  e.map.entities = []
  clearSupplies(e)
  return { e, msgs }
}

{
  const { e, msgs } = setup()
  const p = e.player
  const goal = reachable(e, p.x, p.y, 18, 45)
  ok(!!goal, `测试场地：从出生点找到一处需要绕行的补给点（路程 ${goal?.len.toFixed(1)}m，${goal?.pts.length} 个路点）`)
  if (goal) {
    e.map.items.push({ id: 991, type: 'canned', x: goal.x, y: goal.y })
    const goalW = { x: goal.x + (e.map.inf?.ox ?? 0), y: goal.y + (e.map.inf?.oy ?? 0) }
    const gl = () => ({ x: goalW.x - (e.map.inf?.ox ?? 0), y: goalW.y - (e.map.inf?.oy ?? 0) })
    // 向导放在玩家 6m 内的可走点
    let gx = p.x + 1, gy = p.y
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, x = p.x + Math.cos(a) * 5.5, y = p.y + Math.sin(a) * 5.5; if (A.lightguideWalkable(e.map, Math.floor(x), Math.floor(y)) && e.los(p.x, p.y, x, y)) { gx = x; gy = y; break } }
    const g = guide(e, gx, gy)
    run(e, 0.2)
    ok(g.lg?.mode === 'approach' && g.lg.mood === 'guide', `玩家进入 8m：向导靠近并切换青白色（mode=${g.lg?.mode} mood=${g.lg?.mood}）`)
    run(e, 4.5)
    ok(g.lg?.mode === 'guide' && g.lg.target?.kind === 'supply' && g.lg.target.label === '罐装食品', `开始带路：目标是最近的补给（${g.lg?.target?.label}）`)
    ok(msgs.some((t) => /微光/.test(t)), '带路提示消息')
    // 路径每段都可走（不穿墙）
    const m = e.map
    let wallHits = 0
    const path = g.lg!.path
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], k = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4)
      for (let j = 0; j <= k; j++) { const x = a.x + (b.x - a.x) * j / k - OX(e), y = a.y + (b.y - a.y) * j / k - OY(e); if (!A.lightguideWalkable(m, Math.floor(x), Math.floor(y))) wallHits++ }
    }
    ok(path.length >= 2 && wallHits === 0, `带路路径沿可走格子（${path.length} 个路点，穿墙采样 ${wallHits}）`)
    // 玩家站着不动：向导停在前方 3–5m 处 beckon / 等待，不会自己飞走
    const leads: number[] = [], clips = new Set<string>()
    run(e, 8, () => { if (g.lg?.mode === 'guide') { const pr = A.projectOnPath(g.lg.path, g.lg.pathLen, p.x + OX(e), p.y + OY(e)); leads.push(g.lg.pathS - pr.s); clips.add(g.lg.clip) } })
    const lmax = Math.max(...leads.slice(30))
    ok(leads.length > 100 && lmax <= L.LEAD_MAX + 1.0 && Math.min(...leads.slice(60)) >= L.LEAD_MIN - 0.6, `玩家停下：向导保持在前方 ${Math.min(...leads.slice(60)).toFixed(2)}–${lmax.toFixed(2)}m（沿路径），不会独自飞走`)
    ok(clips.has('beckon'), `等待时播放 beckon（片段：${[...clips].join('/')}）`)
    // beckon 根位移同步：锚点在回绕时前移 0.9m，且视觉连续
    {
      const S = g.lg!
      const before = S.pathS
      S.pathS = A.projectOnPath(S.path, S.pathLen, p.x + OX(e), p.y + OY(e)).s + 3.2; S.clip = 'beckon'; S.clipT = 3.55
      const pt = A.pathPointAt(S.path, S.pathLen, S.pathS); g.x = pt.x - OX(e); g.y = pt.y - OY(e)
      const s0 = S.pathS
      run(e, 0.1)
      ok(Math.abs(S.pathS - s0 - A.LG_CLIP.BECKON_ADVANCE) < 0.05, `beckon 循环回绕：锚点同步沿路径前移 ${(S.pathS - s0).toFixed(2)}m（= BECKON_ADVANCE）`)
      void before
    }
    // 玩家跟着走：向导一直保持领先
    const follow: number[] = []
    let arrived = false
    run(e, 60, (t) => {
      const S = g.lg
      if (!S || arrived) return
      if (S.mode === 'arrive') { arrived = true; return true }
      if (S.mode !== 'guide' || S.path.length < 2) return
      const pr = A.projectOnPath(S.path, S.pathLen, p.x + OX(e), p.y + OY(e))
      follow.push(Math.hypot(g.x - p.x, g.y - p.y))
      // 玩家以 1.8m/s 沿向导路径走（只走到向导身后 1.5m）
      const target = Math.min(pr.s + 1.8 / 30, S.pathS - 1.5)
      if (target > pr.s) { const q = A.pathPointAt(S.path, S.pathLen, target); place(e, q.x - OX(e), q.y - OY(e)) }
      void t
    })
    ok(follow.length > 30 && Math.max(...follow.slice(10)) < 7.5, `玩家跟随：向导始终在前方 ${Math.min(...follow.slice(10)).toFixed(1)}–${Math.max(...follow.slice(10)).toFixed(1)}m（直线距离）`)
    ok(arrived, '到达目标：进入 arrive（目标上方绕圈）')
    place(e, gl().x - 1, gl().y)
    run(e, 0.5)
    ok(g.lg?.mode === 'arrive' && g.lg.clip === 'nest_orbit' && Math.hypot(g.x - gl().x, g.y - gl().y) < 1.2, `到达后在补给上方绕圈（距补给 ${Math.hypot(g.x - gl().x, g.y - gl().y).toFixed(2)}m，片段 ${g.lg?.clip}）`)
    run(e, L.ARRIVE_ORBIT_T + 1)
    ok(g.lg?.mode === 'leave' || g.lg?.mode === 'idle', `绕圈结束后离开 / 变回 idle（${g.lg?.mode}，颜色 ${g.lg?.mood}）`)
    run(e, 3)
    ok(g.lg?.mode !== 'approach' && g.lg?.mode !== 'guide', '离开后一段时间内不会马上重新找玩家（不带同一处补给）')
  }
}

// ───────── 4. 没有补给：带去出口 ─────────
{
  const { e } = setup(809)
  const p = e.player
  const g = guide(e, p.x + 1.5, p.y)
  run(e, 5)
  ok(g.lg?.mode === 'guide' && g.lg.target?.kind === 'exit' && /第九大道/.test(g.lg.target.label), `附近没有补给：带去 L8 出口（${g.lg?.target?.label}，路线 ${g.lg?.target?.via}）`)
  ok((g.lg?.path.length ?? 0) >= 2, `出口路线有可走路径（${g.lg?.path.length} 个路点）`)
  // 补给优先：此时出现补给，重新靠近时会选补给（新个体）
  e.map.items.push({ id: 992, type: 'bandage', x: p.x + 2.5, y: p.y + 0.5 })
  const g2 = guide(e, p.x - 1.5, p.y)
  g.lg!.mode = 'idle'; g.lg!.ignoreUntil = e.time + 999
  run(e, 5)
  ok(g2.lg?.target?.kind === 'supply' || g2.lg?.mode === 'arrive', `有补给时优先补给（${g2.lg?.target?.label ?? g2.lg?.mode}）`)
}

// ───────── 5. 危险：警示与恢复 ─────────
{
  const { e, msgs } = setup(810)
  const p = e.player
  const g = guide(e, p.x + 1.5, p.y)
  run(e, 5)
  const was = g.lg?.mode
  const mesh: any = buildEntityMesh('lightguide', { seed: g.id })
  const camo: any = makeEntity('camocrawler', p.x + 11, p.y, 0); camo.id = nid++; camo.testKeep = true; camo.def = { ...camo.def, speed: 0 }; camo.stunT = 999
  e.map.entities.push(camo)
  const gpos = { x: g.x, y: g.y }
  run(e, 0.6, () => R.animateLightguideEntity(mesh, g, 1 / 30))
  ok(was === 'guide' && g.lg?.mode === 'warn' && g.lg.mood === 'warn' && g.lg.clip === 'warn', `敌对实体 15m 内：切换 warn（粉白、warn 片段），之前是 ${was}`)
  ok(Math.hypot(g.x - gpos.x, g.y - gpos.y) < 0.3, '警示时停在原地')
  ok(msgs.some((t) => /粉白/.test(t)), '警示提示消息')
  // 渲染：颜色真的渐变到粉白（halo 偏红偏蓝，绿分量低）
  run(e, 0.5, () => R.animateLightguideEntity(mesh, g, 1 / 30))
  const halo = mesh.userData.lgRender.col.halo
  ok(halo[0] > halo[1] + 0.15 && halo[2] > halo[1], `渲染：光晕颜色渐变到粉白（halo rgb ${halo.map((v: number) => v.toFixed(2)).join(',')}）`)
  e.map.entities = e.map.entities.filter((q: any) => q !== camo)
  run(e, 2.2, () => R.animateLightguideEntity(mesh, g, 1 / 30))
  ok(g.lg?.mode === 'guide' && g.lg.mood === 'guide', `危险解除后恢复带路（${g.lg?.mode}）`)
  run(e, 1, () => R.animateLightguideEntity(mesh, g, 1 / 30))
  const halo2 = mesh.userData.lgRender.col.halo
  ok(halo2[2] > halo2[0] + 0.2, `渲染：颜色回到青白（halo rgb ${halo2.map((v: number) => v.toFixed(2)).join(',')}）`)
  // 危险区域：符文蛛巢结构
  const g3 = guide(e, p.x - 1.2, p.y + 0.4); g3.lg = undefined
  e.map.structures.push({ kind: 'runenest', x: Math.floor(p.x) + 3, y: Math.floor(p.y), w: 2, h: 2, solid: false, data: {} })
  run(e, 0.6)
  ok(g.lg?.mode === 'warn' && g.lg.danger?.what === '危险区域', `前方是危险区域（符文蛛巢）：同样 warn（${g.lg?.danger?.what}）`)
}

// ───────── 6. 受击：逃离、扣理智、冷却 ─────────
{
  const { e, msgs } = setup(811)
  const p = e.player
  const g = guide(e, p.x + 1.5, p.y), mate = guide(e, p.x + 2.4, p.y + 0.6)
  run(e, 3)
  const san = p.sanity
  g.hp -= 50
  e.killCheck(g)
  ok(!g.dead && g.hp === g.def.hp && g.lg?.mode === 'flee' && g.lg.clip === 'flee', '玩家命中：不会被打死，进入 flee 片段')
  ok(Math.abs(san - p.sanity - L.HIT_SANITY) < 0.5, `玩家理智 -${(san - p.sanity).toFixed(1)}`)
  ok(msgs.some((t) => /理智 -10/.test(t)), '受击提示消息')
  ok(Math.abs(A.lightguideCooldown(e) - L.COOLDOWN_T) < 0.1, `进入冷却 ${A.lightguideCooldown(e).toFixed(0)}s`)
  ok(combat.bloodKind(g) === true, '受击粒子：半透明碎光，不溅红血')
  ok(mate.lg?.mode === 'avoid', `同组个体看见了：转为回避（${mate.lg?.mode}）`)
  run(e, 1.7)
  ok(!e.map.entities.includes(g), '逃离片段播完后消失（实体移除）')
  // 冷却期内：新出现的向导回避玩家，不带路
  const n2 = guide(e, p.x + 2, p.y)
  const d0 = Math.hypot(n2.x - p.x, n2.y - p.y)
  run(e, 3)
  ok(n2.lg?.mode !== 'guide' && n2.lg?.mode !== 'approach' && Math.hypot(n2.x - p.x, n2.y - p.y) > d0 + 2, `冷却期内向导回避玩家（${d0.toFixed(1)}m → ${Math.hypot(n2.x - p.x, n2.y - p.y).toFixed(1)}m，${n2.lg?.mode}）`)
  // 冷却结束：恢复正常
  A.lightguideWorld(e).cooldownUntil = e.time
  const n3 = guide(e, p.x + 2, p.y - 0.5)
  run(e, 0.3)
  ok(n3.lg?.mode === 'approach' || n3.lg?.mode === 'guide', `冷却结束后向导重新靠近带路（${n3.lg?.mode}）`)
}

// ───────── 7. 氙弹珠：守巢 ─────────
{
  const { e } = setup(812)
  const p = e.player
  const gs = [guide(e, p.x + 5, p.y), guide(e, p.x + 6, p.y + 1), guide(e, p.x + 4, p.y - 1.5)]
  for (const g of gs) { g.lg = undefined }
  run(e, 0.1)
  // 投出的弹珠：combat 的 lure 分支（真实投掷结算）
  const mx = p.x + 3, my = p.y + 0.5
  ;(combat as any).landProjectile(e, { id: 5, type: 'xenonmarble', x: mx, y: my, z: 0.1, floorZ: 0, vx: 0, vy: 0, vz: 0 }, mx, my)
  const n0 = 3
  const land = true
  ok((land || n0 === 3) && gs.every((g) => g.lg?.mode === 'nest'), `投出氙弹珠：附近 ${gs.length} 只全部进入 nest（淡金）`)
  run(e, 4)
  const idx = gs.map((g) => g.lg!.orbit.i).sort().join(',')
  ok(gs.every((g) => Math.hypot(g.x - mx, g.y - my) < 0.8 && g.lg?.clip === 'nest_orbit' && g.lg.mood === 'nest') && idx === '0,1,2', `守巢：围着弹珠 nest_orbit，轨道编号 ${idx}`)
  ok(gs.every((g) => g.z - (e.map.inf ? 0 : 0) < 1.2), '守巢高度贴近溪底（低空绕珠）')
  // 投出的弹珠保持期内不离巢带路
  ok(gs.every((g) => g.lg?.mode === 'nest'), '投出的弹珠：保持期内玩家在旁也不离巢')
  // 弹珠被捡走：散开
  e.map.items = e.map.items.filter((it: any) => it.type !== 'xenonmarble')
  run(e, 0.5)
  ok(gs.every((g) => g.lg?.mode !== 'nest'), `弹珠被捡走：不再守巢（${gs.map((g) => g.lg?.mode).join('/')}）`)
  // 自然巢：地上的弹珠吸引闲逛的向导；玩家靠近时编号最小的那只出来带路
  const { e: e2 } = setup(813)
  const p2 = e2.player
  const nx = p2.x + 14, ny = p2.y
  e2.map.items.push({ id: 994, type: 'xenonmarble', x: nx, y: ny })
  const w = [guide(e2, nx + 1, ny), guide(e2, nx - 1, ny + 0.5)]
  e2.player.x -= 30
  run(e2, 3)
  ok(w.every((g) => g.lg?.mode === 'nest' && !g.lg.nest?.thrown), '自然散落的氙弹珠：闲逛的向导守着它')
  const o2 = () => ({ ox: e2.map.inf?.ox ?? 0, oy: e2.map.inf?.oy ?? 0 })
  const nest0 = w[0].lg!.nest!
  // 玩家走到巢旁 5m、视线通畅的位置
  let px2 = nest0.x - o2().ox - 5, py2 = nest0.y - o2().oy
  for (let k = 0; k < 24; k++) { const a = k / 24 * 6.283, x = nest0.x - o2().ox + Math.cos(a) * 5, y = nest0.y - o2().oy + Math.sin(a) * 5; if (A.lightguideWalkable(e2.map, Math.floor(x), Math.floor(y)) && e2.los(x, y, nest0.x - o2().ox, nest0.y - o2().oy)) { px2 = x; py2 = y; break } }
  place(e2, px2, py2)
  run(e2, 1.5)
  ok(w.some((g) => g.lg?.mode === 'approach' || g.lg?.mode === 'guide') && w.some((g) => g.lg?.mode === 'nest' || g.lg?.mode === 'escort'), `自然巢：玩家靠近时一只离巢带路（${w.map((g) => g.lg?.mode).join('/')}）`)
}

// ───────── 8. 分组随行、灯光上限、穿墙 ─────────
{
  const { e } = setup(814)
  const p = e.player
  const lead = guide(e, p.x + 1.6, p.y), f1 = guide(e, p.x + 2.3, p.y + 0.5)
  run(e, 0.4)
  ok(lead.lg?.group === f1.lg?.group && f1.lg?.mode === 'escort' && f1.lg.follow === lead.id, `2–3 只一组：组内一只带路，其余随行（${lead.lg?.mode}/${f1.lg?.mode}）`)
  for (let k = 0; k < 5; k++) guide(e, p.x - 2 - k * 0.7, p.y + 3)
  run(e, 0.2)
  ok(R.lightguideLights(e).length === R.LIGHTGUIDE_LIGHT_CAP && R.LIGHTGUIDE_LIGHT_CAP === 3, `点光源上限：同屏 ${e.map.entities.filter((q: any) => q.def.type === 'lightguide').length} 只，只有 ${R.lightguideLights(e).length} 盏光`)
  {
    const keep = e.map.entities
    e.map.entities = [0, 1, 2].map((k) => { const q: any = makeEntity('lightguide', p.x + 3 + Math.cos(k * 2.1) * 0.35, p.y + Math.sin(k * 2.1) * 0.35, 0); q.id = nid++; return q })
    ok(R.lightguideLights(e).length === 1, `守巢 / 挤在一起的 3 只只合并成 1 盏光（${R.lightguideLights(e).length}）`)
    // 网格还在预热（renderer 把它藏着）时不发光：光与光球本体同时出现
    for (const q of e.map.entities) q.presentationPending = true
    ok(R.lightguideLights(e).length === 0, `网格预热中（光球未显示）不往灯光池送光（${R.lightguideLights(e).length}）`)
    for (const q of e.map.entities) q.presentationPending = false
    e.map.entities = keep
  }
  // 穿墙：把一只放进岩体里 → phase 计时开始，渲染可见度下降
  const m = e.map
  let wx = -1, wy = -1
  for (let r = 1; r < 30 && wx < 0; r++) for (let k = 0; k < 16; k++) { const x = Math.floor(p.x + Math.cos(k / 16 * 6.283) * r), y = Math.floor(p.y + Math.sin(k / 16 * 6.283) * r); if (!A.lightguideWalkable(m, x, y) && m.tiles[y * m.w + x] !== 1) { wx = x; wy = y; break } }
  const ph = guide(e, wx + 0.5, wy + 0.5); ph.lg = A.lightguideState(e, ph); ph.lg.mode = 'leave'; ph.lg.leaveTo = { x: wx + 0.5 + (m.inf?.ox ?? 0), y: wy + 0.5 + (m.inf?.oy ?? 0) }
  const mesh: any = buildEntityMesh('lightguide', { seed: ph.id })
  run(e, 0.7, () => R.animateLightguideEntity(mesh, ph, 1 / 30))
  const alpha = R.lightguideEntityPose(mesh, ph).alpha
  ok(wx >= 0 && (ph.lg?.phaseT ?? -1) >= 0 && alpha < 0.3, `穿墙：在岩体内播放 phase（phaseT=${ph.lg?.phaseT?.toFixed(2)}，可见度 ${alpha.toFixed(2)}）`)
  // 渲染：重制模型（不再是旧的宝石星星，无自带点光源）
  const g0: any = buildEntityMesh('lightguide', { seed: 3 })
  let lights = 0; g0.traverse((o: any) => { if (o.isLight) lights++ })
  ok(!!g0.userData.lightguideRig && lights === 0 && Math.abs(g0.userData.lightguideRig.size - A.lightguideSize(3)) < 1e-9, `渲染接入：buildEntityMesh 返回重制光球（直径 ${(g0.userData.lightguideRig.size * 100).toFixed(1)}cm），点光源走灯光池`)
}

mkdirSync('reports/lightguide', { recursive: true })
writeFileSync('reports/lightguide/mechanics-check.txt', lines.join('\n') + `\n\ncheck:lightguide ${n - fails}/${n}\n`)
console.log(`check:lightguide ${n - fails}/${n}`)
if (fails) process.exit(1)
