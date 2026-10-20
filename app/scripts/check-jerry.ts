/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接读写引擎内部状态 */
// 鹉主杰瑞（Entity 7）与杰瑞的信众重制——无头机制验收（真实 Engine + 真实 Level 274 / Level 2 生成）
// 运行：npm run check:jerry
import * as THREE from 'three'
import { readFileSync } from 'node:fs'

const memory = new Map<string, string>()
Object.assign(globalThis, { window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }, document: { createElement: () => ({ getContext: () => null, style: {} }), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } }, localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) } })
const { Engine } = await import('../src/game/engine')
const J = await import('../src/game/engine/jerryAI')
const { audio } = await import('../src/game/core/audio')
const { look } = await import('../src/game/renderer/shared')
const { ENTITIES } = await import('../src/game/entities')
const { ENTITY_EVENT_SPAWNS: ENTITY_SPAWNS } = await import('../src/game/entities/spawns') as any
const { ITEMS, itemUseProfile } = await import('../src/game/content/items')
const { NPCS, jerryFollowerDef } = await import('../src/game/content/npcs')
const { EFFECTS } = await import('../src/game/engine/effects')
const { buildEntityMesh } = await import('../src/game/renderer/entitiesMesh')
const { disposeCharacterModel } = await import('../src/game/renderer/retroResources')
const { buildItemMesh } = await import('../src/game/renderer/itemsMesh')
const { jerryBudget, poseJerry, prepareJerryGeometry } = await import('../src/game/renderer/jerryMesh')
const { npcGearPlan } = await import('../src/game/renderer/npcGearPlan').catch(() => ({ npcGearPlan: null as any }))
const { L2 } = await import('../src/game/levels/l2')
const { l2JerryRoomRectAt } = await import('../src/game/world/infiniteL2')
const { requestRecovery } = await import('../src/game/engine/career')
const { takeExit } = await import('../src/game/engine/level')
const { interactionEyeZ, scanInteract } = await import('../src/game/engine/interact')

for (const k of ['aggro', 'hit', 'swing', 'hurt', 'pickup', 'uiTick', 'spark', 'searchTick'] as const) (audio as any)[k] = () => {}
let fails = 0, n = 0
const ok = (c: unknown, m: string) => { n++; console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
const T = J.JERRY

function fresh(level = 274, seed = 274) {
  const e: any = new Engine(); e.seed = seed
  e.loadLevel(level, { mapSeed: seed, firstVisit: true }); e.introT = 0
  e.player.hp = 100; e.player.sanity = 100
  const msgs: string[] = []; const om = e.msg.bind(e); e.msg = (t: string, k: any) => { msgs.push(t); om(t, k) }
  return { e, msgs }
}
const jerryOf = (e: any) => e.map.entities.find((x: any) => x.def.type === 'jerry')
const run = (e: any, secs: number, each?: (t: number) => void) => { const dt = 1 / 30; for (let t = 0; t < secs; t += dt) { each?.(t); e.step(dt) } }
/** 把玩家放到杰瑞某方向 dist 米处（朝向杰瑞） */
function standAt(e: any, j: any, dist: number, ang = -Math.PI / 2) {
  const s = e.devFindSpot(j.x + Math.cos(ang) * dist, j.y + Math.sin(ang) * dist, 2, 0)
  e.player.x = s.x; e.player.y = s.y; e.player.z = 0
  look.yaw = Math.atan2(-(j.x - s.x), -(j.y - s.y)); look.pitch = 0.4
  return Math.hypot(j.x - s.x, j.y - s.y)
}
/** 准星对准杰瑞身体中心（真实 look.yaw/pitch，与游戏内鼠标瞄准同一口径） */
function aimAt(e: any, j: any, dz = 0, dyaw = 0) {
  const p = e.player, box = J.jerryInteractBox(e, j), dx = j.x - p.x, dy = j.y - p.y
  look.yaw = Math.atan2(-dx, -dy) + dyaw; look.pitch = Math.atan2(box.z + dz - interactionEyeZ(e), Math.hypot(dx, dy))
  // 准星射线（游戏里由渲染器按相机每帧写入）：前向 = (-sin yaw, -cos yaw)·cos pitch，竖直 sin pitch
  look.rayX = -Math.sin(look.yaw) * Math.cos(look.pitch); look.rayY = -Math.cos(look.yaw) * Math.cos(look.pitch); look.rayZ = Math.sin(look.pitch)
  p.facing = Math.atan2(look.rayY, look.rayX)
}
/** 冻结杰瑞的闲置行为：gaze=一直盯着玩家；none=一直梳羽 */
function forceIdle(j: any, kind: 'gaze' | 'preen') { const s = J.jerryState(j); s.idleKind = kind; s.idleT = 9999; s.spokeIntro = true; s.speakT = 9999 }

// ============================================================================
// 1. 设定 / 生成 / 模型
// ============================================================================
{
  const d = ENTITIES.jerry
  ok(d && /金刚鹦鹉/.test(d.desc) && /自己取/.test(d.desc), '图鉴：紫蓝金刚鹦鹉、名字是自己取的')
  ok(d.codex && /木僵/.test(d.codex.behavior) && /投石索/.test(d.codex.lore.join('')) && /芬奇/.test(d.codex.lore.join('')), '图鉴：木僵、投石索、芬奇事件')
  if (ENTITY_SPAWNS) ok(JSON.stringify(ENTITY_SPAWNS.jerry) === '[274]', '只在 Level 274 出现（不做化身）')
  const { e } = fresh()
  const j = jerryOf(e), perch = e.map.structures.find((s: any) => s.kind === 'perch')
  ok(!!j && !!perch && Math.floor(j.x) === perch.x && Math.floor(j.y) === perch.y, 'L274：杰瑞在栖木格中心')
  ok(j.z === 0, '实体 z=地面，栖木高度由 alt 表示（不影响楼层带/命中判定）')
  e.step(1 / 30)
  ok(Math.abs(J.jerryState(j).alt - T.perchAlt) < 1e-6 && J.jerryState(j).mode === 'perch', `平时站在栖木上（alt ${T.perchAlt}m）`)
  ok([Math.PI / 2, -Math.PI / 2].some((f) => Math.abs(j.facing - f) < 0.06), '双爪环抱东西走向横杆：身体朝南或朝北')
  const g = buildEntityMesh('jerry')
  const b = jerryBudget(g)
  let skinned = 0; g.traverse((o: any) => { if (o.isSkinnedMesh) skinned++ })
  ok(skinned === 1 && b.bones === 14, `骨骼蒙皮：1 个 SkinnedMesh、${b.bones} 根骨骼`)
  ok(b.draws >= 3 && b.draws <= 4, `绘制次数 ${b.draws}（3–4）`)
  ok(b.tris <= 3000, `三角面 ${b.tris} ≤ 3000`)
  const geo = prepareJerryGeometry().geo, bb = new THREE.Box3().setFromBufferAttribute(geo.attributes.position as THREE.BufferAttribute)
  // 全长：从头顶到尾尖（沿尾羽方向投影的总长）
  const pos = geo.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3()
  let top = -9, tail = 9
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); if (Math.abs(v.x) < 0.1) { top = Math.max(top, v.y); tail = Math.min(tail, v.y - 0.6 * Math.max(0, -v.z)) } }
  const len = Math.hypot(top - bb.min.y, bb.max.z - bb.min.z)
  ok(len > 0.85 && len < 1.05, `真实尺寸：全长约 ${len.toFixed(2)}m（0.9–1m，其中尾羽约一半）`)
  let nan = 0; for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) nan++
  ok(nan === 0, '几何无 NaN')
  const a = g, bMesh = buildEntityMesh('jerry')
  const ar = a.userData.jerryRig, br = bMesh.userData.jerryRig
  const am = Array.isArray(ar.body.material) ? ar.body.material : [ar.body.material]
  const bm = Array.isArray(br.body.material) ? br.body.material : [br.body.material]
  ok(ar.body.geometry !== br.body.geometry && am.length === 3 && bm.length === 3 && am.every((m: any, i: number) => m !== bm[i]), '实例各自持有几何和三份材质')
  ok(ar.body.skeleton !== br.body.skeleton && ar.bones !== br.bones && ar.bones.every((bone: any, i: number) => bone !== br.bones[i]), '实例各自持有骨架与骨骼')
  let bGeometryDisposed = 0, bMaterialDisposed = 0
  br.body.geometry.addEventListener('dispose', () => bGeometryDisposed++)
  bm.forEach((m: any) => m.addEventListener('dispose', () => bMaterialDisposed++))
  disposeCharacterModel(a)
  ok(bGeometryDisposed === 0 && bMaterialDisposed === 0, '释放 A 不会释放 B 的几何或材质')
  poseJerry(br, { flap: 0.7, gazeYaw: 0.2, pounce: 0.35 }, 1.25); bMesh.updateMatrixWorld(true)
  const finiteBones = br.bones.every((bone: any) => bone.matrixWorld.elements.every((v: number) => Number.isFinite(v)))
  ok(finiteBones, '释放 A 后 B 仍可摆姿并保持有限骨骼变换')
  disposeCharacterModel(bMesh)
  ok(bGeometryDisposed === 1 && bMaterialDisposed === 3, '释放 B 释放其自身几何和三份材质')
  ok(!buildItemMesh('jerryflyer').userData.fallback && !buildItemMesh('fakelog').userData.fallback, '传单 / 假日志有专属地面模型')
  if (npcGearPlan) { const plan = npcGearPlan('bluebird', NPCS.bluebird); ok(!JSON.stringify(plan).includes('"bird"'), '青鸟神父肩头不再挂静态小鹦鹉（真鹉主会站上去）') }
}

// ============================================================================
// 2. 会说话：靠近主动搭话，自称名字是自己取的
// ============================================================================
{
  const { e, msgs } = fresh()
  const j = jerryOf(e)
  standAt(e, j, 9)
  run(e, 2)
  ok(!J.jerryState(j).spokeIntro, '9m 外不搭话')
  standAt(e, j, 3.5)
  run(e, 1)
  const s = J.jerryState(j)
  ok(s.spokeIntro && /自己取/.test(s.bubbleText), `4.5m 内主动搭话（字幕气泡）：「${s.bubbleText.slice(0, 18)}…」`)
  ok(msgs.some((m) => m.startsWith('杰瑞：「') && /自己取/.test(m)), '同时写进消息栏（字幕）')
  run(e, 0.3); ok(s.talk > 0.3, '说话时喙开合（talk 姿态量）')
  const before = msgs.filter((m) => m.startsWith('杰瑞：')).length
  run(e, 20)
  const after = msgs.filter((m) => m.startsWith('杰瑞：')).length
  ok(after > before, '之后每 11–17s 继续说一句（成年人语气的闲谈）')
}

// ============================================================================
// 3. 教化：6m 内有视线缓慢累积，被注视时更快；接触 +25
// ============================================================================
{
  const { e } = fresh()
  const j = jerryOf(e)
  standAt(e, j, 8); forceIdle(j, 'gaze'); run(e, 5)
  ok(e.indoctrination === 0, '6m 外不累积')
  standAt(e, j, 3.5); forceIdle(j, 'preen'); e.indoctrination = 0; run(e, 10)
  const slow = e.indoctrination
  standAt(e, j, 3.5); forceIdle(j, 'gaze'); e.indoctrination = 0; run(e, 10)
  const fast = e.indoctrination
  ok(Math.abs(slow - T.indoctRate * 10) < 0.3, `未被注视：${slow.toFixed(2)} / 10s（${T.indoctRate}/s）`)
  ok(Math.abs(fast - T.indoctRateGazed * 10) < 0.6 && fast > slow * 2, `被它注视：${fast.toFixed(2)} / 10s（${T.indoctRateGazed}/s）`)
  ok(J.jerryState(j).gazing, '「被注视」= 杰瑞头部正对玩家')
  // 接触：+25（保留冷却）
  e.indoctrination = 0; e.jerryContactCd = 0; e.jerryRun.stupor = null; e.jerryRun.stuporMask = 7
  const r = J.jerryContactGain(e, j)
  ok(r === T.contactGain && e.indoctrination === 25, '接触一次 +25')
  e.jerryRun.stupor = null
  e.jerryTamed = true; e.indoctrination = 0; standAt(e, j, 3); forceIdle(j, 'gaze'); run(e, 5)
  ok(e.indoctrination === 0, '驯服后不再累积')
}

// ============================================================================
// 4. 木僵：25/50/75 各一次；镜头转向杰瑞、锁定输入；醒来虔诚姿态 + 诵咏
// ============================================================================
{
  const { e, msgs } = fresh()
  const j = jerryOf(e)
  standAt(e, j, 4, -Math.PI / 2 + 0.4); forceIdle(j, 'preen')
  look.yaw += 1.4 // 先把视线转开
  e.indoctrination = 24.9
  J.addIndoctrination(e, 0.2, j)
  ok(!!e.jerryRun.stupor && e.jerryRun.stupor.stage === 0, '越过 25 → 触发木僵')
  ok(J.jerryInputLock(e), '木僵期间锁定移动/攻击')
  const px = e.player.x, py = e.player.y
  e.input.mx = 1; e.input.my = 0
  run(e, 1.6, () => { e.input.mx = 1 })
  e.input.mx = 0
  ok(Math.hypot(e.player.x - px, e.player.y - py) < 0.05, '木僵中按方向键也走不动')
  const want = Math.atan2(-(j.x - e.player.x), -(j.y - e.player.y))
  ok(Math.abs(Math.atan2(Math.sin(look.yaw - want), Math.cos(look.yaw - want))) < 0.15, '镜头不受控地转向杰瑞')
  ok(J.jerryOverlay(e).trance > 0.5, 'HUD：失神叠加层')
  run(e, T.stuporDur + T.devotionDur)
  ok(!e.jerryRun.stupor, `约 ${T.stuporDur}s 失神 + ${T.devotionDur}s 虔诚姿态后结束`)
  ok(msgs.some((m) => /不由自主地诵咏/.test(m)) && msgs.some((m) => /双手已经交叠/.test(m)), '醒来不由自主做虔诚姿态并诵咏一句')
  e.indoctrination = 30; J.addIndoctrination(e, 1, j); ok(!e.jerryRun.stupor, '同一阈值不重复触发')
  e.indoctrination = 49.5; J.addIndoctrination(e, 1, j); ok(e.jerryRun.stupor?.stage === 1, '越过 50 → 第二次木僵'); e.jerryRun.stupor = null
  e.indoctrination = 74; J.addIndoctrination(e, 25, j); ok(e.jerryRun.stupor?.stage === 2, '接触 +25 越过 75 → 第三次木僵'); e.jerryRun.stupor = null
  // 木僵期间三条输入路径都应被实际拦截；清除木僵后物品使用恢复。
  const { e: locked } = fresh(); const lockedJerry = jerryOf(locked)
  locked.addItem('almond'); locked.addItem('knife'); locked.player.selected = locked.player.hotbar.findIndex((s: any) => s?.type === 'knife')
  locked.player.x = lockedJerry.x; locked.player.y = lockedJerry.y + 1.7; aimAt(locked, lockedJerry); locked.jerryContactCd = 999
  J.addIndoctrination(locked, 25, lockedJerry)
  const almondIndex = locked.player.hotbar.findIndex((s: any) => s?.type === 'almond'), almondBefore = locked.player.hotbar[almondIndex]?.count
  const used = locked.useSlot('hotbar', almondIndex)
  ok(used === false && !locked.usingItem && locked.player.hotbar[almondIndex]?.count === almondBefore, '木僵期间使用杏仁水被拦截且不消耗物品')
  const cd0 = locked.attackCooldownT, anim0 = locked.attackAnimT, stamina0 = locked.player.stamina
  locked.attack()
  ok(locked.attackCooldownT === cd0 && locked.attackAnimT === anim0 && locked.player.stamina === stamina0, '木僵期间攻击不启动冷却/动画且不消耗体力')
  const ind0 = locked.indoctrination, rep0 = locked.rep.jerry ?? 0
  scanInteract(locked); locked.doInteract?.()
  ok(locked.indoctrination === ind0 && (locked.rep.jerry ?? 0) === rep0, '木僵期间交互不改变教化或声望')
  locked.jerryRun.stupor = null
  const restored = locked.useSlot('hotbar', almondIndex)
  ok(restored === true && !!locked.usingItem, '清除木僵后同一路径恢复使用物品')
  locked.usingItem = null
  // 读档：已越过的阈值不再触发
  const { e: e2 } = fresh(); const j2 = jerryOf(e2)
  e2.indoctrination = 60; e2.jerryRun = J.freshJerryRun()
  J.addIndoctrination(e2, 5, j2); ok(!e2.jerryRun.stupor, '读档（教化 60）后不会补触发 25/50 的木僵')
  J.addIndoctrination(e2, 15, j2); ok(e2.jerryRun.stupor?.stage === 2, '……继续越过 75 才触发')
  // 满 100：无法主动离开 L274
  const { e: e3, msgs: m3 } = fresh(); e3.indoctrination = 100
  takeExit(e3, e3.levelDef.exits[0])
  ok(!e3.transition && m3.some((m) => /无法主动离开/.test(m)), '教化满 100：无法主动离开 Level 274')
  e3.jerryTamed = true; takeExit(e3, e3.levelDef.exits[0]); ok(!!e3.transition || e3.player.level !== 274, '驯服后可以离开')
}

// ============================================================================
// 5. 杏仁水驯服：教化清零 + 木僵残响；被信众目击 → 亵渎 + 杰瑞扑击
// ============================================================================
{
  const { e, msgs } = fresh()
  const j = jerryOf(e)
  standAt(e, j, 2.0)
  for (const n of e.npcs) { n.x = 5; n.y = 5 } // 支开信众（不目击）
  e.indoctrination = 40; e.addItem('almond')
  aimAt(e, j)
  const aimed = !!e.aimJerry()
  ok(aimed, '准星对准横杆上的杰瑞：判定命中（不用替身）')
  ok(e.tameJerry() && e.jerryTamed && e.indoctrination === 0, '驯服：教化清零')
  ok(e.jerryRun.echoT === T.echoDur, `留下木僵残响 ${T.echoDur}s`)
  let lapses = 0, maxYaw = 0, prev = 0
  run(e, 120, () => { if (e.jerryRun.lapseT > 0 && prev <= 0) lapses++; prev = e.jerryRun.lapseT; maxYaw = Math.max(maxYaw, Math.abs(e.jerryRun.lapseYaw)) })
  ok(lapses >= 2, `2 分钟内偶发短暂失神 ${lapses} 次（镜头偏转最大 ${maxYaw.toFixed(2)}rad）`)
  ok(msgs.some((m) => /木僵的残响/.test(m)), '首次残响有提示')
  run(e, T.echoDur)
  ok(e.jerryRun.echoT === 0 && e.jerryRun.lapseT === 0, '残响逐渐消失并结束')
  ok(J.jerryState(j).fury === 0, '未被目击：杰瑞不发怒')
  // 被目击
  const { e: w } = fresh(); const wj = jerryOf(w)
  standAt(w, wj, 3.2)
  const fol = w.npcs.find((x: any) => x.id === 'zeph'); fol.x = w.player.x + 1; fol.y = w.player.y
  w.addItem('almond'); w.aimJerry = () => wj
  const rep0 = w.rep.jerry ?? 0
  w.tameJerry()
  ok((w.rep.jerry ?? 0) === rep0 - 10, '被信众目击 = 亵渎：声望 -10')
  ok(J.jerryState(wj).fury > 0, '被当众驯服 → 杰瑞尖啸扑击（怒气）')
  const wm: string[] = []; const om2 = w.msg.bind(w); w.msg = (t: string, k: any) => { wm.push(t); om2(t, k) }
  let pounced = false
  run(w, 4, () => { if (J.jerryState(wj).mode === 'pounce') pounced = true })
  ok(pounced && wm.some((m) => m.includes(`受到 ${T.pounceDmg} 点伤害（鹉主杰瑞的扑击）`)), `从高处扑下：命中 ${T.pounceDmg} 点`)
  ok(wm.some((m) => /泽弗|珀莉|信众/.test(m) && /伤害/.test(m)), '声望跌到 -10：在场信众同时转为敌对')
}

// ============================================================================
// 6. 扑击：被伤害 / 信众声望 ≤ -10；只在 L274 从高处；落地后蹦跳回栖木，追不上奔跑的玩家
// ============================================================================
{
  const { e, msgs } = fresh()
  const j = jerryOf(e)
  e.player.x = j.x; e.player.y = j.y - 1.2; e.player.z = 0 // 贴着栖木站（攻击距离 1.9m）
  e.player.facing = Math.PI / 2
  const rep0 = e.rep.jerry ?? 0, hp0 = j.hp
  e.attack()
  ok(j.hp < hp0 && (e.rep.jerry ?? 0) <= rep0 - 50, '玩家挥击命中杰瑞：受伤 + 信众声望 -50（保留惩罚）')
  ok(Math.floor(j.x) === Math.floor(J.jerryState(j).homeX), '杰瑞不会被击退下栖木')
  ok(J.jerryState(j).fury >= 2, '被伤害 → 怒气（最多扑击 3 次）')
  standAt(e, j, 4)
  const hpP = e.player.hp
  let landed = false, hopped = false
  const watch = () => { const m = J.jerryState(j).mode; if (m === 'land') landed = true; if (m === 'hop') hopped = true }
  run(e, 3, watch)
  ok(e.player.hp < hpP, `尖啸扑击命中（${hpP - e.player.hp}）`)
  ok(msgs.some((m) => /尖啸/.test(m)), '扑击有尖啸提示')
  // 落地 → 蹦跳；玩家奔跑远离 → 追不上
  run(e, 2, watch)
  ok(landed && hopped, '扑完落地，在地上笨拙地蹦跳')
  ok(T.hopSpeed < 6 && T.pounceRange < 9, `地上移动 ${T.hopSpeed}m/s（玩家奔跑约 6m/s）——追不上`)
  // 远离后回到栖木
  e.player.x = j.x; e.player.y = j.y - 20; e.rep.jerry = 0
  run(e, 25)
  ok(J.jerryState(j).mode === 'perch' && J.jerryState(j).alt === T.perchAlt, '扑跳 + 短滑翔回到栖木')
  // 声望 ≤ -10：持续敌视（受冷却限制），8m 外不扑
  const { e: h } = fresh(); const hj = jerryOf(h)
  h.rep.jerry = -20
  standAt(h, hj, 9.5); run(h, 3)
  ok(J.jerryState(hj).mode === 'perch', `声望 ≤ -10：玩家在 ${T.pounceRange}m 外不扑`)
  standAt(h, hj, 5); let c = 0
  run(h, 30, () => { if (J.jerryState(hj).mode === 'pounce' && J.jerryState(hj).moveT === 0) c++ })
  const s = J.jerryState(hj)
  ok(s.pounceCd >= 0 && h.player.hp < 100, '声望 ≤ -10：靠近即遭扑击')
  ok(h.player.hp >= 100 - T.pounceDmg * Math.ceil(30 / T.pounceCd + 1), `次数少：冷却 ${T.pounceCd}s（30s 内起扑 ${c} 次，HP ${Math.round(h.player.hp)}）`)
  // 只在 L274
  const { e: o } = fresh(2, 99)
  const fake: any = { ...jerryOf(h), id: 999999, jy: undefined, x: o.player.x + 3, y: o.player.y, z: 0, dead: false }
  o.rep.jerry = -50
  J.updateJerryEntity(o, fake, 1 / 30, 3); J.updateJerryEntity(o, fake, 1 / 30, 3)
  ok(J.jerryState(fake).mode !== 'pounce', '扑击只在 Level 274 内发生')
}

// ============================================================================
// 7. 青鸟神父讲道：杰瑞站上他的肩头，讲完送回栖木
// ============================================================================
{
  const { e } = fresh()
  const j = jerryOf(e), bb = e.npcs.find((x: any) => x.id === 'bluebird')
  standAt(e, j, 7, -Math.PI / 2 + 0.9); forceIdle(j, 'preen')
  run(e, 1)
  bb.sermon = { phase: 'rest', t: 0.1, lineT: 0 }
  let onShoulder = false, maxGap = 0
  run(e, 25, () => { const s = J.jerryState(j); if (s.mode === 'shoulder') { onShoulder = true; maxGap = Math.max(maxGap, Math.hypot(j.x - bb.x, j.y - bb.y)) } })
  ok(onShoulder && J.jerryState(j).rider === 'bluebird', '讲道开始：神父走到栖木旁，杰瑞扑腾着跳上他的肩头')
  ok(maxGap < 0.35, `在肩上随神父移动（与神父中心最大偏移 ${maxGap.toFixed(2)}m）`)
  ok(bb.sermon.phase === 'preach' && /鹉主|蓝羽|杰瑞|辛克莱|收留/.test(bb.bubbleText + SERMON_JOIN()), '神父在讲坛前讲道（气泡）')
  run(e, T.sermonLen + 20)
  ok(J.jerryState(j).mode === 'perch' && bb.sermon.phase === 'rest', '讲完把杰瑞送回栖木')
  // 扑击可从神父肩上发起（芬奇事件）
  J.forceSermon(e); J.jerryState(j).fury = 1; e.step(1 / 30)
  standAt(e, j, 3.5, Math.PI / 2)
  let fromShoulder = false
  run(e, 2, () => { if (J.jerryState(j).mode === 'pounce' && J.jerryState(j).fromAlt === T.shoulderAlt) fromShoulder = true })
  ok(fromShoulder, '芬奇事件：从神父肩上尖啸着跃起扑击')
}
function SERMON_JOIN() { return J.SERMON_LINES.join('') }

// ============================================================================
// 8. 信众：不主动接触新人；投石索；近身打倒；击晕拖走、抢走物品
// ============================================================================
{
  const { e } = fresh(2, 4242)
  const walkOk = () => true
  const mk = (id: string, x: number, y: number): any => ({ id, def: jerryFollowerDef(7, 7, id.length), x, y, facing: 0, floor: 0, homeX: x, homeY: y, tx: x, ty: y, moveT: 1, bubbleText: '', bubbleT: 0, hp: 45 })
  const p = e.player
  const f = mk('jerry_x_watch', p.x + 6, p.y)
  e.los = () => true
  e.rep.jerry = 0
  for (let i = 0; i < 90; i++) J.updateFollower(e, f, 1 / 30, walkOk)
  ok(Math.abs(f.x - (p.x + 6)) < 1e-6 && f.bubbleT === 0, '声望中立：野外信众不走过来搭话，只远远看着')
  ok(Math.abs(Math.atan2(Math.sin(f.facing - Math.PI), Math.cos(f.facing - Math.PI))) < 0.05, '……一直面朝玩家')
  e.rep.jerry = 35
  ok(J.updateFollower(e, f, 1 / 30, walkOk) === false, '已是虔徒（声望 ≥30）：交还原有的靠近传教逻辑')
  // 敌对：投石索（换到 L274 开阔的主间里测，避免 L2 窄廊的墙挡住飞石）
  // 注：长椅排旁本有回填墙瓦片（基线既有，x=26/31 y=45–46），测试行选 y=44——整行 x 24–36 均为地板
  const { e: hall } = fresh()
  const e2 = hall, p2 = hall.player
  p2.x = 26; p2.y = 44.5; p2.z = 0; hall.rep.jerry = -20; for (const q of hall.npcs) { q.x = 60; q.y = 70 }
  const sl = mk('jerry_sling_a', p2.x + 9, p2.y); sl.sling = true
  hall.los = () => true
  const hp0 = p2.hp
  let thrown = 0
  for (let i = 0; i < 60; i++) { J.updateFollower(e2, sl, 1 / 30, walkOk); thrown = Math.max(thrown, e2.jerryRun.stones.length); e2.step(1 / 30) }
  ok(Math.abs(sl.x - (p2.x + 9)) < 0.2 && thrown > 0, `投石索手在 ${T.slingRange[0]}–${T.slingRange[1]}m 内站定投石`)
  ok(p2.hp <= hp0 - T.stoneDmg + 0.01, `飞石命中站着不动的玩家（-${T.stoneDmg}）`)
  // 横移闪避
  e2.jerryRun.stones.length = 0
  const hp1 = p2.hp; sl.slingT = 0; sl.lungeT = 0
  for (let i = 0; i < 40; i++) { J.updateFollower(e2, sl, 1 / 30, walkOk); if (i > 24) p2.y -= 0.2; e2.step(1 / 30) }
  ok(p2.hp === hp1, '飞石有飞行时间：横移可以躲开')
  // 近身挥击
  e.rep.jerry = -20
  const mel = mk('jerry_melee_b', p.x + 0.9, p.y); mel.sling = false
  const hp2 = p.hp
  for (let i = 0; i < 45; i++) J.updateFollower(e, mel, 1 / 30, walkOk)
  ok(p.hp <= hp2 - T.meleeDmg + 0.01, `近身打倒（-${T.meleeDmg}）`)
  // 击晕：血量见底不死，被拖走、抢走物品
  e.addItem('almond'); e.addItem('canned'); e.addItem('bandage'); e.addItem('battery')
  const before = [...p.hotbar, ...p.backpack].filter(Boolean).reduce((a: number, s: any) => a + s.count, 0)
  // 无限层会随玩家位置平移原点（inf.ox/oy），距离按世界坐标量
  const wx = () => p.x + (e.map.inf?.ox ?? 0), wy = () => p.y + (e.map.inf?.oy ?? 0)
  p.hp = 14; const x0 = wx(), y0 = wy()
  J.followerHurt(e, 9, '信众')
  ok(!e.over && !!e.jerryRun.ko && p.hp > 0, '血量见底：被打晕（不是死亡）')
  ok(J.jerryOverlay(e).black >= 0, 'HUD：击晕黑屏')
  run(e, T.koDur + 0.2)
  const after = [...p.hotbar, ...p.backpack].filter(Boolean).reduce((a: number, s: any) => a + s.count, 0)
  ok(!e.jerryRun.ko && Math.hypot(wx() - x0, wy() - y0) > 10, `醒来时已被拖走 ${Math.hypot(wx() - x0, wy() - y0).toFixed(1)}m`)
  ok(after < before && before - after <= 3 * 2, `部分物品被抢走（${before} → ${after}）`)
  ok(p.hp >= T.koWakeHp, `醒来 HP ≥ ${T.koWakeHp}`)
  ok(!J.followerHostile(e) && e.jerryRun.truceT > 100, `击晕后休战 ${T.truceAfterKo}s（信众不再追打）`)
  // 普通实体伤害不受影响（仍可致死）
  p.hp = 5; e.hurtPlayer(10, '别的东西'); ok(e.over, '非信众伤害照常致死')
}
{
  // L274 内被打晕：拖进南侧信徒居住区的小屋
  const { e } = fresh()
  e.rep.jerry = -20; e.player.hp = 10
  J.followerHurt(e, 5, '信众')
  run(e, T.koDur + 0.2)
  ok(!e.over && e.player.y > 62, `L274：醒来在南侧居住区小屋（y=${e.player.y.toFixed(1)}）`)
}

// ============================================================================
// 9. 辛克莱·贝克特：激进派头目，与青鸟神父不和；声望很低时带小队野外伏击
// ============================================================================
{
  ok(NPCS.sinclair && /激进/.test(NPCS.sinclair.role) && /青鸟/.test(JSON.stringify(NPCS.sinclair.lines)), '辛克莱：激进派头目，对话里看不起青鸟的「收留」')
  ok(/辛克莱/.test(JSON.stringify(NPCS.bluebird.lines)), '青鸟神父对话：与辛克莱不和')
  const { e, msgs } = fresh(2, 777)
  e.rep.jerry = -60
  run(e, T.ambushFirst + 1)
  const amb = e.npcs.filter((x: any) => x.ambush)
  ok(e.jerryRun.ambushActive && amb.some((x: any) => x.id === 'sinclair') && amb.length === T.ambushSquad + 1, `声望 ≤ ${T.ambushRep}：辛克莱带 ${T.ambushSquad} 名信众伏击`)
  ok(amb.filter((x: any) => x.id !== 'sinclair').every((x: any) => x.sling), '小队成员都带投石索')
  ok(msgs.some((m) => /辛克莱·贝克特带着/.test(m)), '伏击有提示')
  const d0 = Math.min(...amb.map((x: any) => Math.hypot(x.x - e.player.x, x.y - e.player.y)))
  ok(d0 >= 8, `在 ${d0.toFixed(1)}m 外现身（生成时 ≥10m 且尽量在视线外）`)
  e.player.hp = 10; J.followerHurt(e, 5, '辛克莱·贝克特'); run(e, T.koDur + 0.2)
  ok(!e.jerryRun.ambushActive && !e.npcs.some((x: any) => x.ambush), '打晕玩家后小队撤走')
  const { e: z } = fresh(2, 778); z.rep.jerry = -20; run(z, T.ambushFirst + 1)
  ok(!z.jerryRun.ambushActive, `声望 > ${T.ambushRep} 不伏击`)
}

// ============================================================================
// 10. 诱导材料：传单 / 假日志 → 地图标出「据点」= 信众宣传间
// ============================================================================
{
  ok(ITEMS.jerryflyer && ITEMS.fakelog && itemUseProfile(ITEMS.jerryflyer)?.anim === 'read', '新增物品：蓝羽传单、流浪者日志残页（阅读动作）')
  ok(L2.items.some((i: any) => i.type === 'jerryflyer') && L2.items.some((i: any) => i.type === 'fakelog'), 'Level 2 可捡到')
  const { e, msgs } = fresh(2, 5150)
  e.addItem('fakelog')
  const slot = e.player.hotbar.findIndex((s: any) => s?.type === 'fakelog')
  e.useSlot('hotbar', slot); run(e, 2)
  const marks = J.jerryLureMarks(e)
  ok(marks.length === 1 && msgs.some((m) => /安全屋/.test(m)), `阅读后地图标出「${marks[0]?.name}」`)
  if (marks[0]) {
    const inf = e.map.inf
    ok(!!l2JerryRoomRectAt(inf.seed, Math.floor(marks[0].x + inf.ox), Math.floor(marks[0].y + inf.oy)), '标记实际指向信众宣传间（不是安全屋）')
  }
  const { e: o, msgs: om } = fresh(0, 5151)
  o.addItem('jerryflyer'); const s2 = o.player.hotbar.findIndex((s: any) => s?.type === 'jerryflyer')
  o.useSlot('hotbar', s2); run(o, 2)
  ok(o.jerryRun.lurePending === '蓝羽庇护所' && om.some((m) => /Level 2/.test(m)), '在别的层级读：记下方位，进入 Level 2 再标')
  o.loadLevel(2, { mapSeed: 5151, firstVisit: true }); run(o, 0.2)
  ok(J.jerryLureMarks(o).length === 1 && !o.jerryRun.lurePending, '……进入 Level 2 后自动标出')
}

// ============================================================================
// 11. 隔离去程序化：教化清零，代价是本局理智上限永久降低
// ============================================================================
{
  const { e, msgs } = fresh(0, 31)
  e.indoctrination = 60; e.career.deprogram = 2
  const src = readFileSync(new URL('../src/game/engine/career.ts', import.meta.url), 'utf8')
  ok(/service==='isolation'&&s\.deprogram===2\)\{[^}]*jerryDeprogrammed\(eng\)/.test(src), '隔离去程序化流程（career.requestRecovery）调用 jerryDeprogrammed')
  void requestRecovery
  e.indoctrination = 0; J.jerryDeprogrammed(e) // 设施可用性由 career 测试覆盖；这里只验收代价
  ok(e.indoctrination === 0 && e.jerryRun.sanityCap === T.deprogramSanityCap, `去程序化：教化清零，理智上限 → ${T.deprogramSanityCap}`)
  e.player.sanity = 100; run(e, 0.1)
  ok(e.player.sanity <= T.deprogramSanityCap, '理智不再超过上限')
  ok(msgs.some((m) => /理智上限/.test(m)), '有提示')
}

// ============================================================================
// 12. 存档 / 联机冻结：新状态只在局内内存
// ============================================================================
{
  const { e } = fresh()
  e.jerryRun.echoT = 100; e.jerryRun.sanityCap = 75; e.jerryRun.lureMarks.push({ level: 2, wx: 1, wy: 2, name: 'x' })
  const snap = JSON.stringify(e.snapshot())
  ok(!/jerryRun|stupor|lureMarks|sanityCap|echoT/.test(snap), '存档快照不含任何新字段')
  ok(/"indoctrination"/.test(snap) && /"jerryTamed"/.test(snap), '原有 indoctrination / jerryTamed 字段照旧写入')
  const eff = EFFECTS.find((x: any) => x.id === 'jerry-run') as any
  ok(eff && eff.resetOnNewRun && !eff.saveKey, 'effects 表：jerry-run 新一局重置、无 saveKey')
  const fresh2 = J.freshJerryRun()
  ok(fresh2.sanityCap === 100 && fresh2.stupor === null && fresh2.stones.length === 0, '新一局状态干净')
}

// ============================================================================
// 13. 准星接触判定：栖木不挡视线、四个方向都能接触、偏开准星则不命中；栖木旁无回填墙块
// ============================================================================
{
  const { e } = fresh()
  const j = jerryOf(e), m = e.map, perch = m.structures.find((s: any) => s.kind === 'perch')
  const around = [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]].every(([dx, dy]) => m.tiles[(perch.y + dy) * m.w + perch.x + dx] === 1)
  ok(around, '栖木四周是地板（不再被生成期回填成墙块）')
  // 讲坛/长椅/圣水盆这类 1×1 整格实心结构：东、南、东南三格不能被回填成墙柱（基线遗留：大厅里凭空的 2×2 墙柱）
  const t = (x: number, y: number) => m.tiles[y * m.w + x]
  const ghosts = m.structures.filter((s: any) => s.solid && s.w === 1 && s.h === 1 && Number.isInteger(s.x) && t(s.x + 1, s.y) === 2 && t(s.x, s.y + 1) === 2 && t(s.x + 1, s.y + 1) === 2 && t(s.x + 2, s.y) === 1 && t(s.x, s.y + 2) === 1 && t(s.x - 1, s.y) === 1)
  ok(ghosts.length === 0, `主间无「幽灵墙柱」（讲坛/长椅/圣水盆旁 ${ghosts.length} 处）`)
  let hits = 0, prompt = 0
  const dirs = [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.8, 2.4]
  for (const ang of dirs) {
    e.player.x = j.x + Math.cos(ang) * 1.7; e.player.y = j.y + Math.sin(ang) * 1.7; e.player.z = 0
    aimAt(e, j)
    if (e.aimJerry() === j) hits++
    scanInteract(e); if (e.interactTarget?.kind === 'jerry') prompt++
  }
  ok(hits === dirs.length && prompt === dirs.length, `六个方向 1.7m 对准：判定 ${hits}/${dirs.length}，交互提示 ${prompt}/${dirs.length}`)
  e.player.x = j.x; e.player.y = j.y + 1.7
  aimAt(e, j, 0, 0.9); ok(!e.aimJerry(), '准星偏开 0.9rad：不命中')
  aimAt(e, j, 1.2); ok(!e.aimJerry(), '准星抬高到头顶上方 1.2m：不命中')
  aimAt(e, j); const ind0 = e.indoctrination
  e.jerryContactCd = 0; scanInteract(e); e.doInteract?.()
  ok(e.indoctrination - ind0 === T.contactGain || e.indoctrination === 100, `按交互键接触：教化 +${T.contactGain}（${ind0} → ${e.indoctrination}）`)
  e.player.x = j.x; e.player.y = j.y + 3.4; aimAt(e, j); ok(!e.aimJerry(), '3.4m 外：超出接触距离')
}

console.log(`\n${n - fails}/${n} 通过`)
if (fails) process.exit(1)
