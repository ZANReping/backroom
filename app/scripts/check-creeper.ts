/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// 爬菌（Entity 17）重制·阶段 3——机制无头验收（真实 Engine + 真实 Level 2 地图）。运行：npm run check:creeper
// 覆盖：孢子负荷累计与回落 / 包扎减半 / 近战溅射 / 吃肉 · 环境系数 · 病程约 12 分钟（含环境快慢）· X 烧灼只在 1 阶且物品条件满足
//       · 感染体阶段与速度 / 攻击间隔 / 攻击性（含真实 AI：1–3 阶不主动攻击、4 阶追击咬人、被打会记仇）· 生成层级与比例 · 传染
//       · 爬菌人扑击根位移（AI 与动画同一条曲线）· 图鉴登记 · 存档 · LOD 三档三角形数 / 绘制次数
import { createCanvas } from '@napi-rs/canvas'
import { mkdirSync, writeFileSync } from 'node:fs'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const { ENTITIES, makeEntity, entitySpawnLevels, entityForms } = await import('../src/game/entities')
const C = await import('../src/game/engine/creeperAI')
const { specialAction } = await import('../src/game/engine/special')
const { snapshot } = await import('../src/game/engine/save')
const { audio } = await import('../src/game/core/audio')
const { creeperLungeRoot: animLungeRoot, CREEP_LUNGE, CREEPER_CLIPS } = await import('../src/game/renderer/creeperAnim')
const R = await import('../src/game/renderer/creeperRender')
const { walkableAt } = await import('../src/game/world/mapgen')
const { CR } = C
for (const k of ['aggro', 'hit', 'swing', 'hurt', 'pickup', 'uiTick', 'whisper', 'stomach', 'armsSfx', 'ratVoice', 'updateHeartbeat', 'updateWhispers', 'setSanityDistort'] as const) (audio as any)[k] = () => {}

const lines: string[] = []
let fails = 0, n = 0
const ok = (c: unknown, m: string) => { n++; const l = `${c ? '✔' : '✘'} ${m}`; console.log(l); lines.push(l); if (!c) fails++ }
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps
const sect = (t: string) => { console.log('\n== ' + t); lines.push('', '== ' + t) }

// ---------------------------------------------------------------------------
sect('孢子负荷：累计 / 确诊 / 回落 / 包扎减半')
{
  const r = C.freshCreepRun()
  ok(C.creepAddLoad(r, 'bite') === 25 && r.load === 25, '被咬一口 +25')
  ok(C.creepAddLoad(r, 'splash') === 15 && r.load === 40, '近战溅射 +15')
  C.creepAddLoad(r, 'bite'); C.creepAddLoad(r, 'bite')
  ok(r.load === 90 && !r.infected, '25+15+25+25 = 90：未确诊')
  C.creepAddLoad(r, 'eat')
  ok(r.infected && r.load === 0 && r.courseT === 0 && !r.aware, '吃感染体的肉 +40 → 满 100 确诊（负荷清零、病程从 0 开始、尚未察觉）')
  const r2 = C.freshCreepRun(); r2.load = 50; r2.contactT = 0
  for (let t = 0; t < 5; t += 0.1) C.creepDecayLoad(r2, 0.1)
  ok(near(r2.load, 50), `最后一次接触后 ${CR.CONTACT_GRACE} s 内不回落（5 s 后仍 50）`)
  for (let t = 0; t < 65; t += 0.1) C.creepDecayLoad(r2, 0.1)
  const dropped = 50 - r2.load
  ok(Math.abs(dropped - CR.DECAY_PER_MIN * (70 - CR.CONTACT_GRACE) / 60) < 0.05, `之后每分钟回落 5（脱离接触 70 s → 回落 ${dropped.toFixed(2)}，期望 ${(5 * 60 / 60).toFixed(2)}）`)
  for (let t = 0; t < 1200; t += 0.5) C.creepDecayLoad(r2, 0.5)
  ok(r2.load === 0, '一直不接触 → 回落到 0 为止（不为负）')
  const r3 = C.freshCreepRun(); r3.bandageT = CR.BANDAGE_T
  ok(C.creepAddLoad(r3, 'bite') === 12.5 && r3.load === 12.5, '包扎后 3 分钟内被咬：这一口减半（+12.5）')
  ok(C.creepAddLoad(r3, 'splash') === 15, '包扎只减咬伤，不减溅射')
  for (let t = 0; t < CR.BANDAGE_T + 1; t += 0.5) C.creepDecayLoad(r3, 0.5)
  ok(r3.bandageT === 0 && C.creepAddLoad(r3, 'bite') === 25, '包扎 3 分钟后窗口结束：咬一口回到 +25')
  const r4 = C.freshCreepRun(); r4.load = 30; r4.contactT = 999
  C.creepAddLoad(r4, 'spore', 0.04)
  C.creepDecayLoad(r4, 1)
  ok(r4.load > 30, '站在孢子团旁（持续接触）不会触发回落')
}

// ---------------------------------------------------------------------------
sect('环境系数（干燥明亮减慢；潮湿温暖黑暗加快；各层级基础值）')
{
  const f = C.creepEnvFactor
  const dryLit = { lit: true, wet: false, warm: false }, dark = { lit: false, wet: false, warm: false }, wet = { lit: false, wet: true, warm: false }, hot = { lit: false, wet: true, warm: true }
  ok(f(1, dryLit) < 1 && f(0, dryLit) < 1 && f(4, dryLit) < 1, `干燥明亮：L0 ${f(0, dryLit).toFixed(2)} / L1 ${f(1, dryLit).toFixed(2)} / L4 ${f(4, dryLit).toFixed(2)}（都 < 1）`)
  ok(f(2, wet) > 1 && f(3, wet) > 1 && f(8, wet) > 1, `潮湿黑暗：L2 ${f(2, wet).toFixed(2)} / L3 ${f(3, wet).toFixed(2)} / L8 ${f(8, wet).toFixed(2)}（都 > 1）`)
  ok(f(5, hot) > f(5, wet) && f(5, wet) > f(5, dark) && f(5, dark) > f(5, dryLit), `L5：锅炉旁 ${f(5, hot).toFixed(2)} > 潮湿 ${f(5, wet).toFixed(2)} > 黑暗 ${f(5, dark).toFixed(2)} > 明亮 ${f(5, dryLit).toFixed(2)}`)
  ok(near(f(8, hot), CR.ENV_MAX) && near(f(11, dryLit), CR.ENV_MIN), `夹在 [${CR.ENV_MIN}, ${CR.ENV_MAX}]：L8 锅炉潮湿黑暗 = ${f(8, hot)}，L11 明亮干燥 = ${f(11, dryLit)}`)
  ok([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 37].every((lv) => [dryLit, dark, wet, hot].every((s) => { const v = f(lv, s); return v >= CR.ENV_MIN && v <= CR.ENV_MAX })), '所有层级 × 所有环境都落在 [0.3, 2]')
  ok(CR.ENV_LEVEL[2] > 1 && CR.ENV_LEVEL[3] > 1 && CR.ENV_LEVEL[8] > 1 && CR.ENV_LEVEL[11] < 1 && CR.ENV_LEVEL[4] < 1, '层级基础：L2/L3/L8（热湿暗）> 1，L4 办公室 / L11 城市（干燥明亮）< 1')
}

// ---------------------------------------------------------------------------
sect('病程：约 12 分钟、阶段时长、环境快慢')
{
  ok(C.CREEP_COURSE === 720, `四阶基准时长 ${CR.STAGE_DUR.slice(1).join(' + ')} = ${C.CREEP_COURSE} s = 12 min`)
  const runTo5 = (k: number) => { let t = 0, ct = 0; const dt = 0.25; const marks: number[] = []; let last = 1; while (C.creepStageAt(ct) < 5 && t < 1e5) { ct += dt * k; t += dt; const s = C.creepStageAt(ct); if (s !== last) { marks.push(t); last = s } } return { t, marks } }
  const a = runTo5(1)
  ok(Math.abs(a.t - 720) < 0.5 && Math.abs(a.marks[0] - 180) < 0.5 && Math.abs(a.marks[1] - 240) < 0.5 && Math.abs(a.marks[2] - 270) < 0.5, `环境系数 1：1→2 阶 ${a.marks[0]} s，2→3 阶 ${a.marks[1]} s，3→4 阶 ${a.marks[2]} s，死亡 ${a.t} s`)
  const b = runTo5(2), c = runTo5(0.3)
  ok(Math.abs(b.t - 360) < 0.5 && Math.abs(c.t - 2400) < 1, `潮湿温暖黑暗（×2）${b.t} s = 6 min；干燥明亮（×0.3）${c.t.toFixed(0)} s = 40 min`)
}

// ---------------------------------------------------------------------------
// 真实引擎 + 真实 L2 地图
const seed = 4242
const fresh = () => {
  const e: any = new Engine(); e.seed = seed
  e.loadLevel(2, { mapSeed: seed, firstVisit: true }); e.introT = 0
  e.emit = () => {}; e.persist = () => {}
  const msgs: string[] = []; const m0 = e.msg.bind(e); e.msg = (t: string, k?: any) => { msgs.push(t); m0(t, k) }
  e.map.entities = []
  Object.assign(e.player, { hp: 100, sanity: 80, hunger: 100, stamina: 100 })
  return { e, p: e.player, msgs }
}
/** 玩家周围 dist 米处、可走且有视线的点（沿四个方向找） */
const spot = (e: any, dist: number) => {
  const p = e.player
  for (const [ux, uy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const x = p.x + ux * dist, y = p.y + uy * dist
    if (walkableAt(e.map, Math.floor(x), Math.floor(y), 0) && e.los(p.x, p.y, x, y)) return { x, y }
  }
  throw Error('no spot at ' + dist)
}
const give = (e: any, type: string, count = 1) => { const i = e.player.hotbar.findIndex((s: any) => !s); e.player.hotbar[i >= 0 ? i : 0] = { type, count } }
const clearInv = (e: any) => { e.player.hotbar = e.player.hotbar.map(() => null); e.player.backpack = e.player.backpack.map(() => null); e.player.equip.offhand = null; e.player.hasLighter = false }

sect('X 烧灼：只在 1 阶、已察觉、身上有火盐晶体或打火机')
{
  const { e, p, msgs } = fresh()
  clearInv(e)
  ok(!C.creepCauterizeAvailable(e) && specialAction(e)?.id !== 'creep-cauterize', '未感染：X 没有烧灼')
  C.creepEat(e); C.creepEat(e); C.creepEat(e)
  ok(e.creepRun.infected && C.creepStage(e.creepRun) === 1, '确诊 → 1 阶')
  give(e, 'firesalt', 2)
  ok(!C.creepCauterizeAvailable(e), '1 阶但还没出现剧痛（未察觉）：不可烧灼')
  for (let t = 0; t < CR.AWARE_T + 0.5; t += 0.1) C.stepCreepWorld(e, 0.1)
  ok(e.creepRun.aware && msgs.some((m) => m.includes('剧痛')), `确诊后 ${CR.AWARE_T} s 第一次剧痛提示 → 已察觉`)
  ok(C.creepCauterizeAvailable(e) && specialAction(e)?.id === 'creep-cauterize', '1 阶 + 已察觉 + 火盐晶体：X 情境动作 = 烧灼伤口（移动端情境按钮同源）')
  clearInv(e)
  ok(!C.creepCauterizeAvailable(e) && specialAction(e)?.id !== 'creep-cauterize', '1 阶 + 已察觉 但身上没有火盐晶体 / 打火机：不可烧灼')
  give(e, 'firesalt', 2)
  const hp0 = p.hp
  e.specialPressed = true; e.specialHeld = true; C.stepCreepWorld(e, 0.016); e.specialHeld = false; C.stepCreepWorld(e, 0.016)
  ok(!e.creepRun.infected && e.creepRun.load === 0, '按 X：感染清除、负荷清零')
  ok(Math.abs(hp0 - p.hp - CR.CAUTERIZE_HP) < 0.5, `扣血 ${CR.CAUTERIZE_HP}（${hp0.toFixed(1)} → ${p.hp.toFixed(1)}）`)
  ok(e.countItem('firesalt') === 1, '没有打火机时消耗 1 颗火盐晶体')
  ok(!e.specialPressed, 'X 点按被烧灼消费（不会再触发后面的 Ferren 等情境）')
  // 打火机：不消耗
  C.creepEat(e); C.creepEat(e); C.creepEat(e)
  for (let t = 0; t < CR.AWARE_T + 0.5; t += 0.1) C.stepCreepWorld(e, 0.1)
  clearInv(e); p.equip.offhand = { type: 'lighter', count: 1 }; p.hasLighter = true
  ok(C.creepCauterize(e) && !e.creepRun.infected && p.equip.offhand?.type === 'lighter', '副手打火机：烧灼成功，打火机不消耗')
  p.hp = 10
  C.creepEat(e); C.creepEat(e); C.creepEat(e); e.creepRun.aware = true
  C.creepCauterize(e)
  ok(p.hp === 1, '血量不足 25 时烧灼不致死（留 1 点）')
  // 2 阶：有物品也不行
  C.creepEat(e); C.creepEat(e); C.creepEat(e); e.creepRun.aware = true
  e.creepRun.courseT = CR.STAGE_DUR[1] + 1
  ok(C.creepStage(e.creepRun) === 2 && !C.creepCauterizeAvailable(e) && !C.creepCauterize(e) && e.creepRun.infected, '2 阶：有打火机也无法烧灼（无法挽回）')
  e.creepRun.courseT = CR.STAGE_DUR[1] + CR.STAGE_DUR[2] + CR.STAGE_DUR[3] + 1
  ok(C.creepStage(e.creepRun) === 4 && !C.creepCauterizeAvailable(e), '4 阶：同样不行')
}

sect('病程症状（引擎）与 5 阶死亡转化')
{
  const { e, p, msgs } = fresh()
  C.creepEat(e); C.creepEat(e); C.creepEat(e)
  e.creepRun.courseT = CR.STAGE_DUR[1] + 0.5; p.hunger = 80
  C.stepCreepWorld(e, 1)
  ok(C.creepHandStage(e) === 2 && msgs.some((m) => m.includes('绒毛痘')), '2 阶：手臂菌斑阶段 2（第一人称）+ 绒毛痘提示')
  ok(p.hunger < 80 - 0.28 * 1.5, '2 阶：饥饿额外流失（×3）')
  e.creepRun.courseT = CR.STAGE_DUR[1] + CR.STAGE_DUR[2] + 0.5; p.stamina = 100
  C.stepCreepWorld(e, 0.5)
  ok(p.stamina <= CR.STAMINA_CAP3 && C.creepOverlay(e).heat > 0 && C.creepHandStage(e) === 3, `3 阶：耐力上限 ${CR.STAMINA_CAP3}、高烧热浪、手臂覆盖`)
  e.creepRun.courseT = CR.STAGE_DUR[1] + CR.STAGE_DUR[2] + CR.STAGE_DUR[3] + 0.5
  C.stepCreepWorld(e, 0.5)
  ok(C.creepFistMult(e) === CR.FIST_K4 && C.creepOverlay(e).vignette > 0 && C.creepHandStage(e) === 4, `4 阶：徒手伤害 ×${CR.FIST_K4}、血红暗角、长指甲手臂`)
  ok(C.creepNpcRefuse(e, '流浪者'), '4 阶：NPC 拒绝交易')
  e.creepRun.courseT = C.CREEP_COURSE - 0.1
  C.stepCreepWorld(e, 1)
  const h = e.map.entities.find((q: any) => q.def.type === 'creeper' && q.cr?.host === 'human')
  ok(e.over && h && Math.hypot(h.x - p.x, h.y - p.y) < 0.01, '5 阶：死亡，原地爬出一只爬菌人')
  const snap = JSON.stringify(Object.keys(C.creepOverlay(e)))
  ok(!/load|stage|course/.test(snap), 'HUD 画面症状只给 throb / heat / vignette 三个强度，不含负荷 / 阶段数值')
}

sect('近战溅射 / 远程安全 / 孢子团 / 存档')
{
  const { e, p } = fresh()
  const s1 = spot(e, 1.2), s3 = spot(e, 3)
  const ent = C.spawnCreeper('rat', 2, s1.x, s1.y, p.z, 2); e.map.entities.push(ent)
  ent.hp = 0; e.killCheck(ent); C.creeperMeleeKill(e, ent)
  ok(e.creepRun.load === CR.SPLASH, '近战打死 2 m 内的感染体：+15')
  ok(e.creepRun.spores.length === 1 && ent.deathT === CR.CORPSE_T, `死后原地留孢子团、尸体停留 ${CR.CORPSE_T} s`)
  const far = C.spawnCreeper('rat', 2, s3.x, s3.y, p.z, 2); e.map.entities.push(far)
  far.hp = 0; e.killCheck(far); C.creeperMeleeKill(e, far)
  ok(e.creepRun.load === CR.SPLASH, '2 m 外近战击杀 / 远程击杀（不走 creeperMeleeKill）不加负荷')
  const sp = e.creepRun.spores[0], ox = e.map.inf?.ox ?? 0, oy = e.map.inf?.oy ?? 0
  p.x = sp.wx - ox - 0.5; p.y = sp.wy - oy; p.z = sp.z // 另一团在 +1.8 m 处：站在 -0.5 只碰到这一团
  const l0 = e.creepRun.load
  for (let t = 0; t < 2; t += 0.1) C.stepCreepWorld(e, 0.1)
  ok(Math.abs(e.creepRun.load - l0 - CR.SPORE_RATE * 2) < 0.3, `站在孢子团旁 2 s：负荷 +${(e.creepRun.load - l0).toFixed(2)}（${CR.SPORE_RATE}/s）`)
  ok(C.creepBurnAt(e, p.x, p.y) >= 1 && e.creepRun.spores.length === 0, '火盐晶体爆开：烧掉附近的孢子团')
  C.creepBandage(e)
  const s = snapshot(e) as any
  ok(s.creep && Math.abs(s.creep.load - e.creepRun.load) < 1e-9 && s.creep.bandageT === CR.BANDAGE_T, '存档写入 creep（负荷 / 包扎窗口 / 病程 / 孢子团）')
  const back = C.restoreCreep(JSON.parse(JSON.stringify(s.creep)))
  ok(back.load === e.creepRun.load && back.bandageT === CR.BANDAGE_T && !back.infected, '读档还原')
}

// ---------------------------------------------------------------------------
sect('感染体：阶段 → 速度 / 攻击间隔 / 攻击性')
{
  const T = [1, 2, 3, 4].map(C.creepHostTraits)
  ok(T.every((t, i) => i === 0 || t.speedK < T[i - 1].speedK), `阶段越高越慢：speedK ${T.map((t) => t.speedK).join(' > ')}`)
  ok(T.every((t, i) => i === 0 || t.attackGap > T[i - 1].attackGap), `攻击越慢：attackGap ${T.map((t) => t.attackGap).join(' < ')} s`)
  ok(T.every((t, i) => i === 0 || t.aggression > T[i - 1].aggression) && T.every((t, i) => i === 0 || t.grudge > T[i - 1].grudge), `攻击性越强：aggression ${T.map((t) => t.aggression).join(' < ')}，记仇 ${T.map((t) => t.grudge.toFixed(1)).join(' < ')} s`)
  const A = [1, 2, 3, 4].map(C.creepHostAttackTiming)
  ok(A.every((a, i) => i === 0 || a.dur > A[i - 1].dur), `攻击片段（前摇）越来越长：${A.map((a) => a.dur.toFixed(2)).join(' < ')} s`)
  ok(['rat', 'arachnid'].every((h) => [2, 3, 4].every((s) => (CR.HOST.damage as any)[h][s] > (CR.HOST.damage as any)[h][s - 1])), '下口越来越狠（伤害随阶段上升）')
  ok(T.map((t) => t.chase).join() === 'false,false,false,true', '只有 4 阶主动追击')
  const W = CR.HOST_STAGE_W, tot = W[1] + W[2] + W[3] + W[4]
  const cnt = [0, 0, 0, 0, 0]; for (let i = 0; i < 10000; i++) cnt[C.creepPickStage((i + 0.5) / 10000)]++
  ok(Math.abs(cnt[4] / 10000 - W[4] / tot) < 0.01 && cnt[4] < cnt[3] && cnt[1] > cnt[4] * 3, `野外阶段分布：1 阶 ${(cnt[1] / 100).toFixed(0)}% / 2 阶 ${(cnt[2] / 100).toFixed(0)}% / 3 阶 ${(cnt[3] / 100).toFixed(0)}% / 4 阶 ${(cnt[4] / 100).toFixed(0)}%（多为 1–3 阶）`)
}

sect('感染体 AI（真实地图）：1–3 阶不主动攻击，4 阶追击咬人，被打会记仇')
{
  const sim = (stage: number, dx: number, secs: number, provoke = false) => {
    const { e, p } = fresh()
    const s = spot(e, dx)
    const q = C.spawnCreeper('rat', stage as any, s.x, s.y, p.z, 2); e.map.entities.push(q)
    if (provoke) q.hp -= 1
    const hp0 = p.hp
    let maxD = 0
    for (let t = 0; t < secs; t += 1 / 30) { e.updateEntities(1 / 30, 1); C.stepCreepWorld(e, 1 / 30); maxD = Math.max(maxD, Math.hypot(q.x - s.x, q.y - s.y)) }
    return { e, p, q, lost: hp0 - p.hp, load: e.creepRun.load + (e.creepRun.infected ? 100 : 0), maxD, d: Math.hypot(q.x - p.x, q.y - p.y) }
  }
  for (const st of [1, 2, 3]) { const r = sim(st, 0.9, 12); ok(r.lost === 0 && r.load === 0, `${st} 阶贴在身边 12 s：不主动攻击（掉血 ${r.lost.toFixed(1)}，负荷 ${r.load}）`) }
  const r4 = sim(4, 4, 20)
  ok(r4.lost > 0 && r4.load >= CR.BITE, `4 阶在 4 m 外看见玩家：追上来咬（20 s 掉血 ${r4.lost.toFixed(1)}，累计负荷 ${r4.load}${r4.e.creepRun.infected ? '，已确诊' : ''}）`)
  const r1p = sim(1, 0.9, 6, true)
  ok(r1p.lost > 0, `1 阶被打一下：记仇反击（掉血 ${r1p.lost.toFixed(1)}）`)
  // 速度：同样追 8 s，1 阶记仇 vs 4 阶
  const v1 = sim(1, 6, 3, true), v4 = sim(4, 6, 3)
  ok(v1.maxD > v4.maxD, `追击速度 1 阶（记仇）${(v1.maxD / 3).toFixed(2)} m/s > 4 阶 ${(v4.maxD / 3).toFixed(2)} m/s`)
}

sect('传染：感染体把身边未感染的尸鼠 / 蛛形纲变成 1 阶')
{
  const { e, p } = fresh()
  const src = C.spawnCreeper('rat', 3, p.x + 0.5, p.y, p.z, 2); src.cr!.spreadT = 0
  e.map.entities.push(src)
  const rats = Array.from({ length: 30 }, (_, i) => makeEntity('corpserat', p.x + 0.5 + Math.cos(i) * 0.6, p.y + Math.sin(i) * 0.6, p.z))
  e.map.entities.push(...rats)
  for (let k = 0; k < 6; k++) { src.cr!.spreadT = 0; C.updateCreeper(e, src, 0.016, 99, 1) }
  const got = rats.filter((r: any) => r.def.type === 'creeper')
  ok(got.length > 0 && got.every((r: any) => r.cr.stage === 1 && r.cr.host === 'rat'), `6 次检查后 ${got.length}/30 只被传染（每次 ${CR.SPREAD_P * 100}%，期望约 ${(30 * (1 - (1 - CR.SPREAD_P) ** 6)).toFixed(1)}），都是 1 阶尸鼠感染体`)
}

// ---------------------------------------------------------------------------
sect('生成：层级与比例（按世界坐标确定性哈希替换已有尸鼠 / 蛛形纲）')
{
  const count = (lv: number, type: 'corpserat' | 'arachnid', boiler?: (x: number, y: number) => boolean) => {
    let conv = 0, tot = 0, st4 = 0, humans = 0, chunks = 0
    const tiles = new Uint8Array(32 * 32).fill(1)
    for (let cx = -40; cx < 40; cx++) for (let cy = -10; cy < 10; cy++) {
      chunks++
      const ents = Array.from({ length: 4 }, (_, i) => makeEntity(type, cx * 32 + 3 + i * 7.3, cy * 32 + 5 + i * 5.1))
      const before = ents.length
      C.creeperChunkSpawns(lv, 99, cx, cy, 32, tiles, ents, 0, 0, boiler)
      for (const q of ents.slice(0, before)) { tot++; if (q.def.type === 'creeper') { conv++; if (q.cr!.stage === 4) st4++ } }
      humans += ents.slice(before).filter((q) => q.cr?.host === 'human').length
    }
    return { rate: conv / tot, conv, st4, humans, chunks }
  }
  for (const [lv, type] of [[2, 'corpserat'], [3, 'corpserat'], [8, 'corpserat'], [8, 'arachnid']] as const) {
    const r = count(lv, type), want = (CR.SPAWN[lv] as any)[type]
    ok(Math.abs(r.rate - want) < 0.03, `L${lv} ${type === 'arachnid' ? '蛛形纲' : '尸鼠'}：替换比例 ${(r.rate * 100).toFixed(1)}%（表 ${want * 100}%），其中 4 阶 ${(r.st4 / r.conv * 100).toFixed(1)}%`)
  }
  const l5out = count(5, 'corpserat', () => false), l5in = count(5, 'corpserat', () => true)
  ok(l5out.conv === 0 && Math.abs(l5in.rate - (CR.SPAWN[5].corpserat ?? 0)) < 0.03, `L5：锅炉房外 0 只；锅炉房里 ${(l5in.rate * 100).toFixed(1)}%（锅炉房里本来很少尸鼠 → 罕见）`)
  ok([0, 1, 4, 6, 7, 9, 10, 11].every((lv) => count(lv, 'corpserat').conv === 0), '其它层级（L0/L1/L4/L6/L7/L9/L10/L11）不替换')
  const h = count(8, 'corpserat'), hw = count(2, 'corpserat')
  ok(h.humans / h.chunks < 0.012 && hw.humans / hw.chunks < 0.01, `爬菌人极罕见：L8 ${h.humans}/${h.chunks} chunk，L2 ${hw.humans}/${hw.chunks} chunk`)
  const ents = [makeEntity('corpserat', 100.2, 50.7), makeEntity('arachnid', 300.1, 80.3)]
  const a = ents.map((q) => ({ ...q, def: { ...q.def } }))
  C.creeperChunkSpawns(8, 7, 3, 1, 32, new Uint8Array(1024).fill(1), ents, 0, 0)
  const b = a.map((q: any) => makeEntity(q.def.type, q.x, q.y))
  C.creeperChunkSpawns(8, 7, 3, 1, 32, new Uint8Array(1024).fill(1), b, 0, 0)
  ok(ents.map((q) => q.def.type + (q.cr?.stage ?? '')).join() === b.map((q) => q.def.type + (q.cr?.stage ?? '')).join(), 'chunk 重载结果一致（同种子同坐标同阶段）')
  const ceil = makeEntity('corpserat', 10, 10); ceil.def = { ...ceil.def, ceilingCrawler: true }
  let ceilConv = 0; for (let i = 0; i < 200; i++) { const c = makeEntity('corpserat', 10 + i * 3.1, 10); c.def = { ...c.def, ceilingCrawler: true }; C.creeperChunkSpawns(8, 1, 0, 0, 32, new Uint8Array(1024).fill(1), [c], 0, 0); if (c.def.type === 'creeper') ceilConv++ }
  ok(ceilConv === 0, 'L8 洞顶倒挂的尸鼠不替换（感染体不会倒挂）')
  // 真实 L2 地图上确有感染体
  const { e } = fresh(); e.loadLevel(2, { mapSeed: 31, firstVisit: true })
  const all = [...e.map.inf.chunks.values()].flatMap((c: any) => c.entities)
  ok(all.some((q: any) => q.def.type === 'creeper') || all.filter((q: any) => q.def.type === 'corpserat').length < 4, `真实 L2 窗口：尸鼠 ${all.filter((q: any) => q.def.type === 'corpserat').length} 只 / 感染体 ${all.filter((q: any) => q.def.type === 'creeper').length} 只`)
}

// ---------------------------------------------------------------------------
sect('爬菌人：扑击根位移（AI 与动画同一条曲线）')
{
  const same = [0, 0.3, 0.55, 0.7, 0.85, 1, 1.15, 1.5].every((t) => near(C.creeperLungeRoot(t), animLungeRoot(t), 1e-9))
  ok(same && CR.HUMAN.lungeDist === CREEP_LUNGE.dist && CR.HUMAN.lungeHit === CREEPER_CLIPS.human.lunge.hit, `creeperAI.creeperLungeRoot ≡ creeperAnim.creeperLungeRoot（扑出 ${CR.HUMAN.lungeDist} m，命中 ${CR.HUMAN.lungeHit} s = 双手拍地）`)
  const { e, p } = fresh()
  const hs = spot(e, 2)
  const h = C.spawnCreeper('human', 5, hs.x, hs.y, p.z, 2); h.facing = Math.atan2(p.y - hs.y, p.x - hs.x)
  e.map.entities.push(h); h.cr!.screamCd = 99; h.cr!.alertT = 10
  // 把玩家挪开一点，避免实体撞上
  let started = false, x0 = 0
  for (let t = 0; t < 2.2; t += 1 / 60) { e.updateEntities(1 / 60, 1); if (!started && h.cr!.mode === 'attack') { started = true; x0 = h.x + (h.cr!.lungeD ? 0 : 0) } }
  ok(started, `靠近 ${CR.HUMAN.lungeR} m 内：扑击`)
  ok(h.cr!.lungeD > CR.HUMAN.lungeDist * 0.9, `扑击中整只往前挪（根位移 ${h.cr!.lungeD.toFixed(2)} m）`)
  ok(p.hp < 100 && e.creepRun.load >= CR.BITE, `从 2 m 外扑中：玩家血 ${p.hp.toFixed(0)}，负荷 +${e.creepRun.load}`)
  void x0
}

// ---------------------------------------------------------------------------
sect('图鉴 / 实体表')
{
  const d = ENTITIES.creeper
  ok(d && /Entity 17/.test(d.codex.no) && d.codex.no.includes('爬菌'), `ENTITIES.creeper：${d?.codex.no}`)
  ok(d.codex.lore.length >= 3 && !!d.codex.behavior && !!d.codex.counter, '图鉴条目齐全（行为 / 应对 / 档案 ≥3 段 / 目击）')
  ok(entityForms('creeper').map((f) => f.id).join() === 'creeper-rat,creeper-spider,creeper-human', '子形态：尸鼠感染体 / 蛛形纲感染体 / 爬菌人')
  ok(entitySpawnLevels('creeper').map((s) => s.id).join() === '2,3,5,8', '图鉴层级：L2 / L3 / L5 / L8')
  ok(d.naturalSpawn === false, '不进生成池（只走替换 / 注入）')
}

// ---------------------------------------------------------------------------
sect('渲染：片段推进 / LOD 三档（近 / 中 / 远）')
const lodRows: string[] = []
{
  // 片段推进：走路按速度同步、一次性片段取 AI 时间、尸体播 death
  const q = C.spawnCreeper('rat', 2, 0, 0, 0, 2)
  const st = { clip: '', t: 0 }
  q.cr!.clip = 'walk'; q.cr!.speed = 0.2; R.stepCreepAnim(st, q, 0.5)
  const t1 = st.t; q.cr!.speed = 0.1; R.stepCreepAnim(st, q, 0.5)
  ok(st.clip === 'walk' && t1 > st.t - t1, '走路片段按实际速度同步推进率（快走推进更快）')
  q.cr!.clip = 'attack'; q.cr!.clipT = 0.33; R.stepCreepAnim(st, q, 0.016)
  ok(st.clip === 'attack' && st.t === 0.33, '攻击片段直接用 AI 的片段时间（命中帧对齐）')
  q.dead = true; q.deathT = 1.2; R.stepCreepAnim(st, q, 0.016)
  ok(st.clip === 'death' && near(st.t, CR.CORPSE_T - 1.2), '尸体播 death 片段')
  const kinds: [string, any][] = [['尸鼠 2 阶', { host: 'rat', stage: 2, morph: 'common', seed: 3 }], ['尸鼠 4 阶', { host: 'rat', stage: 4, morph: 'common', seed: 3 }], ['蛛形纲 2 阶', { host: 'arachnid', stage: 2, variant: 'wolf', seed: 2 }], ['蛛形纲 4 阶', { host: 'arachnid', stage: 4, variant: 'wolf', seed: 2 }], ['爬菌人', { host: 'human', stage: 5, seed: 0 }]]
  lodRows.push('| 模型 | 近（<6 m）三角形 / 绘制 | 中（6–14 m） | 远（>14 m） |', '| --- | --- | --- | --- |')
  for (const [name, o] of kinds) {
    const g = R.buildCreeperEntityMesh(o)
    const s = [0, 1, 2].map((l) => { R.applyCreepLod(g, l as any); return R.creepMeshStats(g) })
    lodRows.push(`| ${name} | ${s[0].tris} / ${s[0].draws} | ${s[1].tris} / ${s[1].draws} | ${s[2].tris} / ${s[2].draws} |`)
    ok(s[0].tris > s[1].tris && s[1].tris > s[2].tris && s[0].draws > s[1].draws && s[1].draws >= s[2].draws, `${name}：三角形 ${s.map((x) => x.tris).join(' → ')}，绘制 ${s.map((x) => x.draws).join(' → ')}`)
  }
  const sp = R.buildSporeClusterMesh(1), ss = R.creepMeshStats(sp)
  ok(ss.draws <= 5, `孢子团：${ss.tris} 三角形 / ${ss.draws} 次绘制`)
  console.log(lodRows.join('\n'))
}

mkdirSync('reports/creeper', { recursive: true })
writeFileSync('reports/creeper/check-creeper.txt', lines.join('\n') + '\n\n' + lodRows.join('\n') + `\n\n${n - fails}/${n} passed\n`)
console.log(`\n${n - fails}/${n} passed`)
if (fails) process.exit(1)
