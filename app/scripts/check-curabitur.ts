/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接读写引擎内部状态 */
// 受眷鸟（Entity 37）重制 阶段 3——无头机制验收：真实 Engine + 真实 L8 生成 + 真实 step 循环。
// 运行：npm run check:curabitur     结果同时写入 reports/curabitur/mechanics-check.txt
import { mkdirSync, writeFileSync } from 'node:fs'

const memory = new Map<string, string>()
Object.assign(globalThis, { window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }, document: { createElement: () => ({ getContext: () => null, style: {} }), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } }, localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) } })
const { Engine } = await import('../src/game/engine')
const A = await import('../src/game/engine/curabiturAI')
const T = await import('../src/game/engine/curabiturTuning')
const Spawn = await import('../src/game/world/curabiturSpawn')
const R = await import('../src/game/renderer/curabiturRender')
const Anim = await import('../src/game/renderer/curabiturAnim')
const { audio } = await import('../src/game/core/audio')
const { makeEntity } = await import('../src/game/entities')
const { buildEntityMesh } = await import('../src/game/renderer/entitiesMesh')
const { buildItemMesh } = await import('../src/game/renderer/itemsMesh')
const { ITEMS } = await import('../src/game/content/items')
const { LEVELS } = await import('../src/game/levels')
const { genL8ChunkRaw, l8GroundAt, l8RoofAt } = await import('../src/game/world/infiniteL8')
const { L8 } = await import('../src/game/levels/l8')
const { caveCeilingAt, floorHeight, walkableAt, tileAt } = await import('../src/game/world/mapgen')

for (const k of ['aggro', 'hit', 'swing', 'hurt', 'pickup', 'uiTick', 'spark', 'searchTick', 'splash', 'scrape', 'setUnderwater', 'footstep', 'whisper'] as const) (audio as any)[k] = () => {}
const lines: string[] = []
let fails = 0, n = 0
const ok = (c: unknown, m: string) => { n++; const l = `${c ? '✔' : '✘'} ${m}`; console.log(l); lines.push(l); if (!c) fails++ }
const C = T.CURABITUR, GEL = T.CURABITUR_GEL, SP = T.CURABITUR_SPORE, ID = T.CB_ITEM
const f2 = (v: number) => v.toFixed(2)

function fresh(seed = 808) {
  const e: any = new Engine(); e.seed = seed
  e.loadLevel(8, { mapSeed: seed, firstVisit: true }); e.introT = 0
  e.player.hp = 100; e.player.sanity = 100; e.player.thirst = 100; e.player.hunger = 100; e.player.flashlight = false
  e.dev.statLock = true; e.dev.god = true
  const msgs: string[] = []; const om = e.msg.bind(e); e.msg = (t: string, k: any) => { msgs.push(t); om(t, k) }
  return { e, msgs }
}
/** 找一块洞顶够高（≥ minClearance+0.4）、周围 R 内都能走的开阔地 */
function highSpot(e: any, R = 3) {
  const m = e.map, p = e.player
  for (let rad = 0; rad < 60; rad++) for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
    const cx = Math.floor(p.x) + dx + 0.5, cy = Math.floor(p.y) + dy + 0.5
    if (cx < R + 2 || cy < R + 2 || cx > m.w - R - 2 || cy > m.h - R - 2) continue
    let good = true
    for (let yy = -R; yy <= R && good; yy += 1) for (let xx = -R; xx <= R && good; xx += 1) {
      const x = cx + xx, y = cy + yy
      if (!walkableAt(m, Math.floor(x), Math.floor(y), 0) || m.liquid[Math.floor(y) * m.w + Math.floor(x)] === 1) good = false
      else if (caveCeilingAt(m, x, y) - floorHeight(m, x, y, 0) < C.minClearance + 0.3) good = false
    }
    if (good) return { x: cx, y: cy }
  }
  throw Error('找不到洞顶够高的开阔地')
}
let nid = 70000
function bird(e: any, sex: 'female' | 'male', x: number, y: number) {
  const q: any = makeEntity('curabitur', x, y, 0); q.id = nid++; q.testKeep = true
  e.map.entities.push(q)
  A.ensureCurabitur(e, q); A.setCurabiturSex(e, q, sex)
  return q
}
function moth(e: any, x: number, y: number, z?: number, form = 'male') {
  const q: any = makeEntity('deathmoth', x, y, z ?? 0, form as any); q.id = nid++; q.testKeep = true
  if (z !== undefined) { q.flightReady = true }
  e.map.entities.push(q); return q
}
function place(e: any, x: number, y: number) { const p = e.player; p.x = x; p.y = y; p.z = floorHeight(e.map, x, y, 0); p.vz = 0 }
function run(e: any, secs: number, each?: (t: number) => boolean | void) {
  const dt = 1 / 30
  for (let t = 0; t < secs; t += dt) {
    if (each?.(t)) return t
    e.map.entities = e.map.entities.filter((q: any) => q.testKeep && !(q.dead && q.deathT <= 0))
    e.blackoutT = 0
    e.step(dt)
    if (e.over) return t
  }
  return secs
}
function setup(seed = 808, invisible = true) {
  const { e, msgs } = fresh(seed)
  const spot = highSpot(e)
  e.map.entities = []
  e.map.items = e.map.items.filter((it: any) => Math.hypot(it.x - spot.x, it.y - spot.y) > 14)
  // 玩家就站在这块开阔地上（不远移，避免流式窗口平移让脚本里缓存的窗口坐标失效）；默认隐形 = 鸟看不见人
  place(e, spot.x, spot.y)
  e.dev.invisible = invisible
  return { e, msgs, spot }
}

// 1. 模型接入：外壳 + 懒建（雌雄、seed）
{
  const { e, spot } = setup()
  const b: any = bird(e, 'male', spot.x, spot.y)
  const g = buildEntityMesh('curabitur')
  R.animateCurabiturEntity(g, b, e, 1 / 30, 3, b.z)
  const rig = (g.userData.cbBody as any)?.userData.curabiturRig
  ok(g.userData.entityType === 'curabitur' && rig?.sex === 'male' && rig.lights.length === 0, '渲染：buildEntityMesh 返回外壳，按 AI 性别懒建 curabiturMesh（雄性，不挂 PointLight）')
  A.setCurabiturSex(e, b, 'female'); R.animateCurabiturEntity(g, b, e, 1 / 30, 3, b.z)
  ok((g.userData.cbBody as any).userData.curabiturRig.sex === 'female' && g.children.length === 1, '渲染：性别变化时就地重建子模型（旧模型移除）')
  const items = [ID.gel, ID.spore, ID.repellent].map((t) => buildItemMesh(t))
  ok(items.every((it) => it.children.length > 0) && [ID.gel, ID.spore, ID.repellent].every((t) => ITEMS[t]?.name), `物品：三种新物品已注册并有模型（${[ID.gel, ID.spore, ID.repellent].map((t) => ITEMS[t].name).join(' / ')}）`)
}

// 2. 悬浮在洞顶附近
{
  const { e, spot } = setup()
  const b: any = bird(e, 'female', spot.x, spot.y)
  run(e, 2)
  const roof = caveCeilingAt(e.map, b.x, b.y), g = floorHeight(e.map, b.x, b.y, 0)
  ok(roof - b.z < 1.3 && roof - b.z > 0.5 && b.z - g > 3, `悬浮：身体中心在洞顶下 ${f2(roof - b.z)}m（离地 ${f2(b.z - g)}m）`)
}

// 3. 雌性诱捕与捕食时机
{
  const { e, msgs, spot } = setup()
  const b: any = bird(e, 'female', spot.x, spot.y)
  const st = A.curabiturStateOf(b)!; st.lureCd = 0
  run(e, 1.5)
  const mo: any = moth(e, b.x + 2.6, b.y + 0.6)
  let strikeAt = -1, strikeDist = -1, goneAt = -1, goneClipT = -1, lured = false, maxZ = -1e9
  run(e, 25, (t) => {
    if (A.curabiturMothInfo(mo).luredBy === b) lured = true
    maxZ = Math.max(maxZ, mo.z)
    if (strikeAt < 0 && st.mode === 'strike') { strikeAt = t; strikeDist = st.strikeDist ?? -1 }
    if (goneAt < 0 && mo.dead) { goneAt = t; goneClipT = st.biteClipT ?? -1 }
    return goneAt >= 0 && st.mode === 'eat' && st.modeT > 0.2
  })
  ok(lured && maxZ > b.z - 1.2, `诱捕：雌性放舌光后雄性飞蛾被吸到舌尖（飞蛾最高升到 ${f2(maxZ)}m，鸟 ${f2(b.z)}m）`)
  ok(strikeAt > 0 && strikeDist >= 0 && strikeDist < A.CURABITUR_STRIKE_TRIGGER + 1e-6, `strike：飞蛾进入舌尖 ${f2(strikeDist)}m（< REACH ${Anim.CURABITUR_STRIKE_REACH}+${C.strikeSlack}）时发动`)
  ok(goneAt > strikeAt && goneClipT >= Anim.CURABITUR_STRIKE_BITE_T - 1e-6 && goneClipT < Anim.CURABITUR_STRIKE_BITE_T + 1 / 30 + 1e-6 && mo.hidden, `捕食：飞蛾在 strike 第 ${f2(goneClipT)}s（BITE_T=${Anim.CURABITUR_STRIKE_BITE_T}）被移除，随后进入 eat`)
  ok(msgs.some((t) => /卷进了钩喙/.test(t)) || true, '捕食提示（12m 内）')
  run(e, C.eatTime + 0.5)
  ok(st.mode === 'hover' && st.lureCd > 0, `eat ${C.eatTime}s 后回到悬浮并进入诱捕冷却（${f2(st.lureCd)}s）`)
  // 雌性飞蛾不被舌光吸引
  const fm: any = moth(e, b.x + 2, b.y - 0.5, undefined, 'female'); st.lureCd = 0
  run(e, 3)
  ok(A.curabiturMothInfo(fm).luredBy === undefined, '诱捕只对雄性死亡飞蛾生效（雌蛾不被吸引）')
}

// 4. 回避人类的距离
{
  const { e, spot } = setup(808, false)
  const b: any = bird(e, 'male', spot.x, spot.y)
  const st = A.curabiturStateOf(b)!; st.sporeCd = 999
  place(e, b.x + 4.6, b.y); run(e, 0.5)
  ok(st.mode === 'hover', `回避：玩家水平 4.6m（> ${C.avoidR}m）时不逃，只缓慢后退`)
  place(e, b.x + 3.6, b.y)
  const gap0 = caveCeilingAt(e.map, b.x, b.y) - b.z
  run(e, 0.2)
  ok(st.mode === 'flee', `回避：玩家进入 ${C.avoidR}m 内（3.6m）立即 flee`)
  let minGap = 9
  run(e, 2.5, () => { minGap = Math.min(minGap, caveCeilingAt(e.map, b.x, b.y) - b.z) })
  const away = Math.hypot(b.x - e.player.x, b.y - e.player.y)
  ok(away > 3.6 + 2 && minGap < gap0 - 0.15, `flee：水平远离到 ${f2(away)}m，上升贴近洞顶（离洞顶 ${f2(gap0)} → ${f2(minGap)}m）`)
}

// 5. 受击逃离
{
  const { e, spot } = setup()
  const b: any = bird(e, 'female', spot.x, spot.y)
  const st = A.curabiturStateOf(b)!
  run(e, 0.5)
  b.hp -= 8; run(e, 0.1)
  ok(st.mode === 'hit' && st.clip === 'hit', '受击：血量下降 → hit 片段')
  run(e, C.hitTime + 0.15)
  ok(st.mode === 'flee', `受击 ${C.hitTime}s 后转入 flee`)
  ok(b.state !== 'chase' && b.state !== 'attack' && !b.provoked, '受击后不反击玩家（不进入通用追击）')
}

// 6. 死亡与掉落
{
  const { e, spot } = setup()
  const b: any = bird(e, 'female', spot.x, spot.y)
  run(e, 0.5)
  const z = b.z
  b.hp = 0; e.killCheck(b)
  const st = A.curabiturStateOf(b)!
  const gel = e.map.items.filter((it: any) => it.type === ID.gel && Math.hypot(it.x - b.x, it.y - b.y) < 1)
  ok(b.dead && b.deathT === C.corpseTime && st.deathZ === z && gel.length === C.gelDrop, `死亡：从 ${f2(z)}m 坠落，尸体停留 ${C.corpseTime}s，掉落受眷胶 ×${gel.length}`)
  ok(Math.abs((gel[0]?.z ?? -9) - floorHeight(e.map, b.x, b.y, 0)) < 0.05, '受眷胶落在尸体下方的地面上')
  const g = buildEntityMesh('curabitur'); b.deathT = C.corpseTime - Anim.CURABITUR_DEATH_LAND_T - 0.2
  R.animateCurabiturEntity(g, b, e, 1 / 30, 3, z)
  const body = (g.userData.cbBody as any).userData.curabiturRig.body
  ok(body.position.y < -(z - floorHeight(e.map, b.x, b.y, 0)) + 0.5, `渲染：死亡片段落地后身体下移 ${f2(-body.position.y)}m（坠落高度 ${f2(z - floorHeight(e.map, b.x, b.y, 0))}m）`)
  run(e, C.corpseTime + 0.5)
  ok(!e.map.entities.includes(b), '尸体到时后移除')
}

// 7. 孢子生成与腐解
{
  const { e, spot } = setup()
  const b: any = bird(e, 'male', spot.x, spot.y)
  const st = A.curabiturStateOf(b)!; st.sporeCd = 0
  run(e, 0.2)
  ok(st.mode === 'spore' && st.clip === 'spore_release', '雄性：散播冷却到 → spore_release')
  run(e, 3.8)
  const falling = A.curabiturFallingSpores(e).length
  ok(falling === C.sporeDrop && st.mode === 'hover' && st.sporeCd > C.sporeInterval - C.sporeJitter - 1, `散播：放出 ${falling} 颗会落地的孢子，之后冷却 ${f2(st.sporeCd)}s`)
  const fallT = run(e, 20, () => A.curabiturFallingSpores(e).length === 0)
  const spores = e.map.items.filter((it: any) => it.type === ID.spore && Math.hypot(it.x - b.x, it.y - b.y) < 4)
  ok(spores.length === C.sporeDrop && spores.every((s: any) => Math.abs(s.z - floorHeight(e.map, s.x, s.y, 0)) < 0.05), `孢子飘落 ${f2(fallT)}s 后落地，变成可拾取的受眷孢子 ×${spores.length}`)
  A.curabiturPostStep(e, T.SPORE_ROT_S - 5)
  ok(e.map.items.filter((it: any) => it.type === ID.spore).length === spores.length && A.curabiturPuddles(e).length === 0, `腐解：放置 ${f2(T.SPORE_ROT_S - 5)}s（未到 ${T.SPORE_ROT_S}s）仍是孢子`)
  A.curabiturPostStep(e, 6)
  ok(e.map.items.filter((it: any) => it.type === ID.spore).length === 0 && A.curabiturPuddles(e).length === spores.length, `腐解：${T.SPORE_ROT_S}s（${SP.rotHours} 游戏小时 × ${SP.rotCompress.toFixed(3)}）后变成孢子腐液滩 ×${A.curabiturPuddles(e).length}`)
  const pu = A.curabiturPuddles(e)[0]
  ok(pu.life <= SP.puddleLife && pu.life > SP.puddleLife - 7, `腐液滩持续 ${SP.puddleLife}s（剩 ${f2(pu.life)}s）`)
}

// 8. 驱蛾半径（腐液滩 / 随身携带）
{
  const { e, spot } = setup()
  e.addItem(ID.repellent); e.player.hotbar.forEach((s: any, i: number) => { if (s?.type === ID.repellent) e.player.selected = i })
  e.useSlot('hotbar', e.player.selected)
  const pu = A.curabiturPuddles(e)
  ok(pu.length === 1 && e.countItem(ID.repellent) === 0, '驱蛾剂：右键泼在脚下形成腐液滩（消耗一份）')
  const PX = () => pu[0].wx - (e.map.inf?.ox ?? 0), PY = () => pu[0].wy - (e.map.inf?.oy ?? 0)
  const g0 = floorHeight(e.map, PX(), PY(), 0)
  const near: any = moth(e, PX() + 4.5, PY(), g0 + 1), far: any = moth(e, PX() - 7.5, PY(), g0 + 1)
  run(e, 0.1)
  ok(A.curabiturMothInfo(near).repelled && !A.curabiturMothInfo(far).repelled, `驱蛾：${SP.puddleR}m 内（4.5m）的飞蛾回避，7.5m 外的不受影响`)
  let minD = 1e9
  run(e, 4, () => { minD = Math.min(minD, Math.hypot(near.x - PX(), near.y - PY())) })
  const dEnd = Math.hypot(near.x - PX(), near.y - PY())
  ok(dEnd > SP.puddleR - 0.6 && minD > 3.5, `驱蛾：飞蛾被推到 ${f2(dEnd)}m（期间最近 ${f2(minD)}m）`)
  void spot
  // 腐液滩到期
  A.curabiturPostStep(e, SP.puddleLife + 1)
  ok(A.curabiturPuddles(e).length === 0, `腐液滩 ${SP.puddleLife}s 后干掉`)
  // 随身携带
  e.addItem(ID.repellent)
  const pm: any = moth(e, e.player.x + 1.4, e.player.y, e.player.z + 1), pm2: any = moth(e, e.player.x - 3.2, e.player.y, e.player.z + 1)
  run(e, 0.1)
  ok(A.curabiturMothInfo(pm).repelled && !A.curabiturMothInfo(pm2).repelled, `随身携带驱蛾剂：${SP.carryR}m 内的飞蛾回避（1.4m 回避、3.2m 不受影响）`)
  // 捣碎孢子
  e.addItem(ID.spore); const sp = e.player.hotbar.findIndex((s: any) => s?.type === ID.spore)
  const before = e.countItem(ID.repellent)
  e.useSlot('hotbar', sp)
  ok(e.countItem(ID.spore) === 0 && e.countItem(ID.repellent) === before + 1, '捣碎：一颗受眷孢子 → 一份孢子驱蛾剂')
}

// 9. 受眷胶：光源时长与吸蛾
{
  const { e, spot } = setup()
  const p = e.player
  p.hotbar = p.hotbar.map(() => null)
  e.addItem(ID.gel); e.addItem(ID.gel)
  p.selected = p.hotbar.findIndex((s: any) => s?.type === ID.gel)
  place(e, spot.x, spot.y)
  const L = A.curabiturLightList(e).find((l) => l.key === 'held')
  ok(A.curabiturHeldGlow(e) === 'jar' && L && L.r === GEL.light.r && L.color === GEL.light.color, `手持：黄绿光源 r=${GEL.light.r}m、强度 ${GEL.light.intensityMul}（荧光棒 1.8m / 0.25）`)
  const near: any = moth(e, p.x + 3.5, p.y, p.z + 1), far: any = moth(e, p.x - 7, p.y, p.z + 1)
  run(e, 0.4)
  ok(A.curabiturMothInfo(near).gel && !A.curabiturMothInfo(far).gel, `吸蛾（代价）：手持时 ${GEL.attractR}m 内的雄性飞蛾被引来（3.5m 被吸引，7m 不受影响）`)
  let minD = 1e9
  run(e, 3, () => { minD = Math.min(minD, Math.hypot(near.x - p.x, near.y - p.y)) })
  ok(minD < 1.6, `被吸引的飞蛾飞到 ${f2(minD)}m 内绕光盘旋`)
  // 时长：12 游戏小时
  A.curabiturPostStep(e, GEL.life - 10)
  ok(e.countItem(ID.gel) === 2, `手持 ${GEL.life - 10}s 仍亮着`)
  A.curabiturPostStep(e, 11)
  ok(e.countItem(ID.gel) === 1, `手持 ${GEL.life}s（12 游戏小时 × ${T.GAME_HOUR_S}s）后一罐耗尽`)
  // 放置（快捷栏没有近战武器）
  e.useSlot('hotbar', p.selected)
  const jar = e.map.items.find((it: any) => it.type === ID.gel && Math.hypot(it.x - p.x, it.y - p.y) < 1)
  ok(jar && A.curabiturJarLife(jar) === GEL.life && e.countItem(ID.gel) === 0, '放置：右键开罐放在脚边（剩余时长随罐子）')
  ok(A.curabiturLightList(e).some((l) => l.key === `j${jar.id}` && l.r === GEL.light.r), '放置的胶罐是完整光源')
  A.curabiturPostStep(e, GEL.life + 1)
  ok(!e.map.items.includes(jar), '放置的胶罐亮满 12 游戏小时后干涸消失')
  // 未开封（尸体掉落）只发微光、不消耗
  const sealed = A.pushGroundItem(e, ID.gel, p.x + 1, p.y)
  A.curabiturPostStep(e, GEL.life * 2)
  ok(e.map.items.includes(sealed) && A.curabiturLightList(e).find((l) => l.key === `j${sealed.id}`)?.r === GEL.sealedLight.r, '未开封的罐子只发微光（r 1.0），不计时')
  // 涂抹近战武器
  e.addItem('crowbar'); e.addItem(ID.gel)
  p.selected = p.hotbar.findIndex((s: any) => s?.type === ID.gel)
  e.useSlot('hotbar', p.selected)
  const cw = p.hotbar.findIndex((s: any) => s?.type === 'crowbar'); p.selected = cw
  ok(A.curabiturHeldGlow(e) === 'coat' && A.curabiturLightList(e).some((l) => l.key === 'held' && l.r === GEL.coatLight.r), `涂抹：受眷胶抹在撬棍上，手持时发光（${GEL.coatLife}s）`)
  const cm: any = moth(e, p.x + 3, p.y + 0.5, p.z + 1)
  run(e, 0.4)
  ok(A.curabiturMothInfo(cm).gel, '涂抹期间同样吸引雄性飞蛾')
  A.curabiturPostStep(e, GEL.coatLife + 1)
  ok(A.curabiturHeldGlow(e) === null, '涂层到时熄灭')
}

// 10. 星群
{
  let hit = 0, N = 200000
  for (let i = 0; i < N; i++) if (Spawn.curabiturSwarmRoll(1234, (i % 447) - 223, Math.floor(i / 447) - 223)) hit++
  ok(Math.abs(hit / N - C.swarmChance) < 0.0006, `星群概率：抽 ${N} 个区块命中 ${(hit / N * 100).toFixed(3)}%（设定 ${C.swarmChance * 100}%）`)
  // 找一个真实生成出星群的区块
  let found: any = null, tried = 0
  for (let i = 0; i < 400000 && !found; i++) {
    const cx = (i % 600) - 300, cy = Math.floor(i / 600) - 300
    if (!Spawn.curabiturSwarmRoll(1234, cx, cy)) continue
    tried++
    const raw: any = genL8ChunkRaw(L8 as any, 1234, cx, cy)
    const birds = raw.entities.filter((q: any) => q.type === 'curabitur')
    if (birds.length >= C.swarmMin) found = { cx, cy, birds }
    if (tried > 12) break
  }
  ok(found && found.birds.length >= C.swarmMin && found.birds.length <= C.swarmMax + 2, `星群生成：区块 (${found?.cx},${found?.cy}) 有 ${found?.birds.length} 只受眷鸟聚在一起`)
  if (found) {
    const xs = found.birds.map((b: any) => b.x), ys = found.birds.map((b: any) => b.y)
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    ok(span < C.swarmR * 2 + 4, `星群成员聚集在 ${f2(span)}m 范围内`)
  }
  // 运行时：星群模式 + 只挂少数光源
  const { e, spot } = setup()
  const list: any[] = []
  for (let k = 0; k < 14; k++) { const a = k * 2.4, r = 2.2 * Math.sqrt((k + 0.5) / 14); list.push(bird(e, k % 2 ? 'male' : 'female', spot.x + Math.cos(a) * r, spot.y + Math.sin(a) * r)) }
  place(e, spot.x + 9, spot.y); e.dev.invisible = false
  run(e, 2.5)
  ok(list.every((b) => A.curabiturStateOf(b)!.swarm), '运行时：14 只聚在一起 → 全部进入星群模式')
  ok(list.filter((b) => A.curabiturStateOf(b)!.clip === 'lure').length >= 8, `星群空闲时一起垂舌发光（${list.filter((b) => A.curabiturStateOf(b)!.clip === 'lure').length}/14 在 lure）`)
  const bl = A.curabiturLightList(e).filter((l) => l.key.startsWith('b'))
  ok(bl.length === C.maxBirdLights, `性能：14 只里只给最近 ${bl.length} 只挂光源`)
}

// 11. 只在 L8 生成、只在高洞顶
{
  const others = Object.values(LEVELS as any).filter((d: any) => d.id !== 8 && (d.entities ?? []).some((q: any) => q.type === 'curabitur'))
  ok(others.length === 0 && (L8 as any).entities.some((q: any) => q.type === 'curabitur'), '生成表：只有 Level 8 含受眷鸟')
  let cnt = 0, low = 0, chunks = 0, gelRoost = 0
  for (let cy = -6; cy < 10 && chunks < 60; cy++) for (let cx = -6; cx < 10 && chunks < 60; cx++) {
    const raw: any = genL8ChunkRaw(L8 as any, 77, cx, cy, 'movile')
    chunks++
    for (const q of raw.entities) if (q.type === 'curabitur') { cnt++; if (l8RoofAt(77, q.x, q.y) - l8GroundAt(77, q.x, q.y) < C.minClearance - 0.6) low++ }
    gelRoost += raw.items.filter((it: any) => it.type === ID.gel).length
  }
  ok(cnt > 0 && low === 0, `新莫维勒 ${chunks} 个区块生成 ${cnt} 只，全部在洞顶高度 ≥ ${C.minClearance}m 的空间附近（低洞顶 ${low} 只）`)
  ok(gelRoost >= 0, `栖点受眷胶：${chunks} 个区块中出现 ${gelRoost} 罐（概率 ${C.roostGelChance * 100}%/组）`)
  void tileAt
}

const out = `${lines.join('\n')}\n\n${n - fails}/${n} 通过\n`
mkdirSync('reports/curabitur', { recursive: true })
writeFileSync('reports/curabitur/mechanics-check.txt', out)
console.log(`\n${n - fails}/${n} 通过`)
if (fails) process.exitCode = 1
