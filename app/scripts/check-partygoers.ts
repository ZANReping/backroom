/* eslint-disable @typescript-eslint/no-explicit-any -- 测试桩用简化的引擎替身，不进生产包 */
// 派对客（Entity 67）重制——行为机制 + 模型预算无头验收（模拟引擎，空旷平面）
// 运行：npm run check:partygoers
import * as THREE from 'three'
import { readFileSync } from 'node:fs'
import { makeEntity, ENTITIES, type Entity } from '../src/game/entities'
import { audio } from '../src/game/core/audio'
import {
  PARTY, WHISPERS, beginPartygoerFrame, initPartygoer, partygoerHear, updatePartygoer, partygoerDamage, partygoerKillGuard,
  partygoerAimPart, addPartyConversion, partyConvK, partyPainK,
} from '../src/game/engine/partygoerAI'
import { hurtPlayer, landProjectile } from '../src/game/engine/combat'
import { useSlot as applyInventorySlot, updateItemUse } from '../src/game/engine/inventory'
import { EFFECTS } from '../src/game/engine/effects'
import { ITEMS } from '../src/game/content/items'
import { ALL_LEVEL_DEFS } from '../src/game/levels'
import { L601 } from '../src/game/levels/l601'
import { generateLevel } from '../src/game/world/mapgen'
import { buildEntityMesh } from '../src/game/renderer/entitiesMesh'
import { buildItemMesh } from '../src/game/renderer/itemsMesh'
import { animatePartygoer, partygoerBudget, preparePartygoerGeometry, type PartygoerRig } from '../src/game/renderer/partygoerMesh'
import { partygoerLook } from '../src/game/entities/partygoerLook'

let fails = 0, n = 0
const ok = (c: boolean, m: string) => { n++; console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
for (const k of ['aggro', 'hit', 'swing', 'hurt', 'pickup', 'uiTick', 'spark'] as const) (audio as any)[k] = () => {}

function world() {
  const msgs: string[] = [], emits: string[] = []
  const eng: any = {
    levelDef: { id: 12 }, time: 0, over: false, partyConv: 0, manmadeT: 0, royalAddictT: 0, usingItem: null, searching: null,
    player: { x: 0, y: 0, z: 0, vz: 0, hp: 100, stamina: 100, sanity: 100, hunger: 50, thirst: 80, slowT: 0, crouching: false, level: 12, hotbar: [null, null, null], backpack: [], infection: 0, facing: 0 },
    map: { entities: [] as Entity[], items: [] as any[], lights: [] as any[] },
    particles: [] as any[], projectiles: [] as any[],
    dev: { invisible: false, god: false },
    camShake: 0, hurt: 0, dead: false, deathCause: '',
    blocked: new Set<string>(), // 'a|b'：两只实体之间无视线
    msg: (t: string) => msgs.push(t),
    emit: (e: any) => emits.push(e.kind),
    los(x0: number, y0: number, x1: number, y1: number) {
      for (const k of this.blocked) { const [a, b] = k.split('|').map(Number); const ea = this.map.entities.find((q: Entity) => q.id === a), eb = this.map.entities.find((q: Entity) => q.id === b); if (!ea || !eb) continue
        const hit = (p: Entity, x: number, y: number) => Math.hypot(p.x - x, p.y - y) < 1e-6
        if ((hit(ea, x0, y0) && hit(eb, x1, y1)) || (hit(eb, x0, y0) && hit(ea, x1, y1))) return false }
      return true
    },
    entityWalkH: () => 0,
    wanderTarget(e: Entity) { e.targetX = e.x + 1; e.targetY = e.y; e.stateT = 3 },
    stepEntity(e: Entity, sp: number, dt: number) { const dx = e.targetX - e.x, dy = e.targetY - e.y, d = Math.hypot(dx, dy); if (d < 0.3) return true; const k = Math.min(d, sp * dt) / d; e.x += dx * k; e.y += dy * k; e.facing = Math.atan2(dy, dx); return false },
    faceToward(e: Entity, x: number, y: number) { e.facing = Math.atan2(y - e.y, x - e.x) },
    meleeZOk: () => true,
    bloodParticles() {},
    noiseEvent() {},
    hurtPlayer(dmg: number, src: string) { hurtPlayer(this, dmg, src) },
    die(cause: string) { this.dead = true; this.over = true; this.deathCause = cause },
    killCheck(e: Entity) { if (partygoerKillGuard(this, e)) return; if (e.hp <= 0 && !e.dead) { e.dead = true; e.deathT = 1.4 } },
    slotGet(r: any) { return this.player.hotbar[r.i] }, slotSet(r: any, v: any) { this.player.hotbar[r.i] = v }, syncPassives() {}, aimJerry: () => false,
  }
  return { eng, msgs, emits }
}
function spawn(eng: any, x: number, y: number, phase?: string) {
  const e = makeEntity('partygoer', x, y)
  e.facing = Math.atan2(-y, -x)
  eng.map.entities.push(e)
  const s = initPartygoer(eng, e)
  if (phase) s.phase = phase as any
  return e
}
function run(eng: any, secs: number, each?: (t: number) => void) {
  const dt = 1 / 30
  for (let t = 0; t < secs; t += dt) {
    each?.(t); eng.time += dt
    beginPartygoerFrame(eng, dt)
    for (const e of eng.map.entities) { if (e.dead) continue; e.attackCd -= dt; e.stateT -= dt; if (e.stunT > 0) { e.stunT -= dt; continue } updatePartygoer(eng, e, dt, Math.hypot(e.x - eng.player.x, e.y - eng.player.y), 1) }
  }
}
const dist = (e: Entity, eng: any) => Math.hypot(e.x - eng.player.x, e.y - eng.player.y)

// ---------- 生成范围：只在 L601，一群 2–4 只 ----------
{
  const where = ALL_LEVEL_DEFS.filter((d) => d.entities?.some((s) => s.type === 'partygoer'))
  ok(where.length === 1 && where[0].id === L601.id, `派对客只在 L601 生成（${where.map((d) => d.id).join(',')}）`)
  const sp = L601.entities.find((s) => s.type === 'partygoer')!
  ok(sp.min === 2 && sp.max === 4, '每次 2–4 只')
  let packed = 0, maps = 0, cakes = 0, posters = 0, flags = 0
  for (const seed of [11, 22, 33, 44, 55, 66]) {
    const m = generateLevel(L601, seed)
    const pg = m.entities.filter((e) => e.def.type === 'partygoer')
    maps++
    if (pg.length >= 2 && pg.every((e) => Math.hypot(e.x - pg[0].x, e.y - pg[0].y) <= 3.2)) packed++
    cakes += m.items.filter((i) => i.type === 'velvetcake' && Math.hypot(i.x - pg[0].x, i.y - pg[0].y) < 4.5).length
    posters += m.structures.filter((s) => s.kind === 'megposter' && s.data?.party).length
    flags += m.structures.filter((s) => s.kind === 'partyflag').length
  }
  ok(packed === maps, `L601 生成的派对客聚成一群（${packed}/${maps} 张地图全员在领头者 3.2 格内）`)
  ok(cakes >= maps, `派对客群附近地上有「丝绒蛋糕」（${cakes} 块 / ${maps} 张图）`)
  ok(posters >= maps && flags >= maps * 0.8, `L601 布置了派对海报（${posters}）与大红旗（${flags}）诱饵`)
  const a = generateLevel(L601, 77), b = generateLevel(L601, 77)
  ok(JSON.stringify(a.entities.map((e) => [e.def.type, e.x, e.y])) === JSON.stringify(b.entities.map((e) => [e.def.type, e.x, e.y])), '同种子生成结果一致（群体/诱饵用确定性小 RNG）')
}

// ---------- 近视：视距 6m；以听觉为主 ----------
{
  const { eng } = world()
  const e = spawn(eng, 6.6, 0)
  run(eng, 0.5)
  ok(e.pg!.heardT > 1 && e.pg!.seeT > 1, `安静的玩家在 6.6m（视距外）不被看见（heardT=${e.pg!.heardT.toFixed(1)}）`)
  const { eng: eng2 } = world()
  const f = spawn(eng2, 5.4, 0)
  run(eng2, 0.2)
  ok(f.pg!.seeT < 0.5, '5.4m 内被看见')
  ok(PARTY.SIGHT === 6 && ENTITIES.partygoer.sight === 6, 'SIGHT 常量 = 6m，图鉴定义同步')
  const { eng: eng3 } = world()
  const h = spawn(eng3, 6, 0)
  partygoerHear(eng3, h, 0, 0, 1, false)
  ok(h.pg!.heardT > 50, '3m 外的蹲行声（半径 1）听不见——6m 处更听不见')
  partygoerHear(eng3, h, 0, 0, 4, false)
  ok(h.pg!.heardT === 0, '6m 处的步行脚步声（半径 4）被听见')
  const k = spawn(eng3, 10, 0)
  partygoerHear(eng3, k, 0, 0, 10, true)
  ok(k.pg!.heardT === 0, '10m 处的奔跑声被听见')
}

// ---------- 慢：追击速度低于玩家奔跑 ----------
{
  ok(PARTY.CHASE_SPEED > 3.4 && PARTY.CHASE_SPEED < 6 && PARTY.BERSERK_SPEED < 6, `追击 ${PARTY.CHASE_SPEED} / 狂战士 ${PARTY.BERSERK_SPEED} m/s：快于步行 3.4、慢于奔跑 6.0`)
  const { eng } = world()
  const e = spawn(eng, 3, 0, 'hunt')
  e.pg!.heardT = 0; e.pg!.lastX = 0; e.pg!.lastY = 0
  eng.player.x = -1
  const d0 = dist(e, eng)
  run(eng, 4, () => { eng.player.x -= 6 / 30 }) // 玩家以 6m/s 向 -x 奔跑
  const d1 = dist(e, eng)
  ok(d1 > d0 + 3, `奔跑能甩开它（${d0.toFixed(1)} → ${d1.toFixed(1)}m）`)
  ok(e.pg!.phase === 'search' || e.pg!.heardT > 1, `甩开后失去目标（${e.pg!.phase}）`)
}

// ---------- 假装办派对：友善靠近、递蛋糕；2.4m 内暴起 ----------
{
  const { eng, msgs } = world()
  const e = spawn(eng, 5, 0)
  let hurtWhileFriendly = false
  run(eng, 1.0, () => { if (eng.player.hp < 100 && dist(e, eng) > PARTY.FEIGN_RANGE) hurtWhileFriendly = true })
  ok(e.pg!.phase === 'party' && e.state === 'wander', `未被激怒：保持派对伪装（${e.pg!.phase}）`)
  ok(dist(e, eng) < 5 && dist(e, eng) > PARTY.FEIGN_RANGE, `友善地走近（${dist(e, eng).toFixed(2)}m）`)
  ok(e.pg!.offer > 0.3 || e.pg!.wave > 0.3, `挥手 / 递蛋糕（wave=${e.pg!.wave.toFixed(2)} offer=${e.pg!.offer.toFixed(2)}）`)
  ok(!hurtWhileFriendly && eng.player.hp === 100, '伪装期间不攻击')
  run(eng, 2.5)
  ok(e.pg!.phase !== 'party', `进入 ${PARTY.FEIGN_RANGE}m 后暴起（${e.pg!.phase}）`)
  ok(msgs.some((m: string) => m.includes('不再假装') && m.includes('=)')) && !msgs.some((m: string) => m.includes('侍者')), '暴起提示是派对客专属（不再显示「侍者不笑了」）')
  const src = readFileSync('src/game/engine/entityAI.ts', 'utf8')
  ok(src.includes("def.type === 'partygoer') { updatePartygoer") && src.includes('侍者不笑了'), '派对客走专属 AI；通用 feignNeutral 分支只剩侍者使用')
  const { eng: e2 } = world()
  const g = spawn(e2, 4, 0)
  partygoerDamage(e2, g, 8, 'melee', 'body')
  ok(g.pg!.phase === 'hunt' && g.provoked === true, '被攻击立即撕下伪装')
}

// ---------- 群体：心灵感应共享目标；分头包抄 ----------
{
  const { eng } = world()
  const a = spawn(eng, 4, 0), b = spawn(eng, 4, 10), c = spawn(eng, 4, -10)
  eng.blocked.add(`${a.id}|${c.id}`) // c 与 a 之间没有视线
  // 视距内只有 a 看得见玩家；b/c 远在 10m 外
  eng.los = ((orig) => function (this: any, x0: number, y0: number, x1: number, y1: number) {
    const isPlayer = (x: number, y: number) => Math.hypot(x - eng.player.x, y - eng.player.y) < 1e-6
    if ((isPlayer(x0, y0) || isPlayer(x1, y1)) && Math.hypot(x0 - x1, y0 - y1) > PARTY.SIGHT) return false
    return orig.call(this, x0, y0, x1, y1)
  })(eng.los)
  run(eng, 0.1)
  ok(a.pg!.heardT < 0.2, 'a 亲眼看见玩家')
  ok(b.pg!.heardT < 0.5 && b.pg!.shareT < 1, `与 a 互相有视线的 b 通过心灵感应得知玩家位置（heardT=${b.pg!.heardT.toFixed(2)}）`)
  ok(c.pg!.heardT > 50, '与 a 之间没有视线的 c 收不到')
  a.pg!.phase = 'hunt'
  run(eng, 0.1)
  ok(b.pg!.phase === 'hunt' && c.pg!.phase === 'party', `a 撕下伪装后，看着它的 b 也一同暴起（b=${b.pg!.phase}，c=${c.pg!.phase}）`)
  const { eng: e2 } = world()
  const h = [spawn(e2, 8, 0, 'hunt'), spawn(e2, 8, 2, 'hunt'), spawn(e2, 8, -2, 'hunt')]
  for (const q of h) { q.pg!.heardT = 0; q.pg!.lastX = 0; q.pg!.lastY = 0 }
  run(e2, 0.05)
  const fl = new Set(h.map((q) => q.pg!.flank.toFixed(2)))
  ok(fl.size === 3, `追击时分到不同的包抄角（${[...fl].join(' / ')}）`)
  const tg = h.map((q) => Math.atan2(q.targetY, q.targetX))
  ok(Math.max(...tg) - Math.min(...tg) > 0.4, '各自的逼近点分散在玩家两侧（分头包抄）')
  ok(PARTY.TELEPATHY_RANGE >= 12, '心灵感应范围 ≥12m（需要互相有视线）')
}

// ---------- 面条臂抓咬：咬中增加转化值 ----------
{
  const { eng, msgs } = world()
  const e = spawn(eng, 1.4, 0, 'hunt'); e.pg!.heardT = 0
  eng.stepEntity = () => false
  run(eng, 0.05)
  ok(e.pg!.phase === 'windup', `1.4m 内甩出面条臂（${e.pg!.phase}）`)
  run(eng, 0.9)
  ok(eng.partyConv === PARTY.BITE_CONV && eng.player.hp < 100, `咬中：转化值 +${PARTY.BITE_CONV}，扣血（hp=${eng.player.hp.toFixed(0)}）`)
  ok(msgs.some((m: string) => m.includes('吸盘口')), '提示被吸盘口咬住')
  run(eng, 60)
  ok(eng.partyConv % PARTY.BITE_CONV === 0 && eng.partyConv >= PARTY.BITE_CONV, `转化值只增不减（${eng.partyConv}）`)
}
// ---------- 转化：不消退、无解药、痛觉减弱、视力变差；满值加入派对并原地生成新个体；不写进存档 ----------
{
  const { eng } = world()
  addPartyConversion(eng, 40, 'bite')
  const before = eng.partyConv
  for (let i = 0; i < 600; i++) beginPartygoerFrame(eng, 0.1)
  ok(eng.partyConv === before, '转化值不会自然消退')
  ok(partyPainK(eng) < 0.75 && partyConvK(eng) === 0.4, `转化 40%：痛觉系数 ${partyPainK(eng).toFixed(2)}`)
  const shake0 = (() => { const { eng: q } = world(); hurtPlayer(q, 10, 't'); return q.camShake })()
  eng.partyConv = 80; eng.camShake = 0; hurtPlayer(eng, 10, 't')
  ok(eng.camShake < shake0 * 0.5, `高转化时受伤镜头震动减弱（${eng.camShake.toFixed(2)} < ${shake0.toFixed(2)}）`)
  const { eng: q, emits } = world(); q.partyConv = 80; hurtPlayer(q, 10, 't')
  ok(!emits.includes('damage'), '高转化时不再有受伤红闪')
  const inv = readFileSync('src/game/engine/inventory.ts', 'utf8') + readFileSync('src/game/engine/npc.ts', 'utf8') + readFileSync('src/game/engine/career.ts', 'utf8')
  ok(!/partyConv\s*=\s*0/.test(inv), '没有解药：消毒液/医疗/求治都不清除转化值')
  const hud = readFileSync('src/components/HUD.tsx', 'utf8'), rd = readFileSync('src/game/renderer/renderer.ts', 'utf8')
  ok(hud.includes('partyConvK(engine)') && hud.includes('blur(') && rd.includes('partyConvK(engine)') && rd.includes('fog.far = far + (7 - far)'), '视力变差：HUD 边缘模糊 + 渲染雾距收拢到 ~7m')
  eng.player.x = 3; eng.player.y = 4
  addPartyConversion(eng, 100, 'bite')
  ok(eng.dead && eng.deathCause.includes('加入了派对'), `转化值满：「加入派对」死亡结局（${eng.deathCause}）`)
  const born = eng.map.entities.find((e: Entity) => e.def.type === 'partygoer')
  ok(!!born && Math.hypot(born.x - 3, born.y - 4) < 1e-6 && born.pg?.balloon, '并在原地生成一只新的派对客（拴红气球的实习生）')
  const fx = EFFECTS.find((f) => f.field === 'partyConv')
  ok(!!fx && fx.resetOnNewRun === true && !fx.saveKey && !fx.resetOnLevel, '转化值是引擎当局字段：新一局清零、换层保留、无存档键')
  const save = readFileSync('src/game/engine/save.ts', 'utf8'), ps = readFileSync('src/game/core/player.ts', 'utf8')
  ok(!save.includes('partyConv') && !ps.includes('partyConv'), '存档快照与 PlayerState 都不含转化值（不改存档格式）')
}
// ---------- 丝绒蛋糕：吃了增加转化值；codex 写着「切勿食用」 ----------
{
  const { eng, msgs } = world()
  const cake = ITEMS.velvetcake
  ok(!!cake && cake.desc.includes('切勿食用') && cake.use === 'eat', '物品「丝绒蛋糕」：图鉴写着「切勿食用」')
  eng.player.hotbar[0] = { type: 'velvetcake', count: 1 }
  applyInventorySlot(eng, 'hotbar', 0)
  for (let i = 0; i < 40; i++) updateItemUse(eng, 0.1)
  ok(eng.partyConv === PARTY.CAKE_CONV && !eng.player.hotbar[0], `吃下蛋糕：转化值 +${PARTY.CAKE_CONV}，蛋糕被吃掉`)
  ok(msgs.some((m: string) => m.includes('=)')), '吃蛋糕的提示带 =)')
  const g = buildItemMesh('velvetcake')
  ok(!g.userData.fallback, '丝绒蛋糕有专属地面模型（非通用方块兜底）')
}

// ---------- 击杀流程 ①：面条臂各有独立血量；胸甲闭合时躯体减伤 90% ----------
{
  const { eng } = world()
  const e = spawn(eng, 1.5, 0, 'hunt')
  const hp0 = e.hp
  const dealt = partygoerDamage(eng, e, 25, 'melee', 'body')
  ok(Math.abs(dealt - 25 * (1 - PARTY.CHEST_DR)) < 1e-6 && PARTY.CHEST_DR === 0.9, `胸甲闭合：躯干 25 → ${dealt.toFixed(1)}（减伤 90%）`)
  const dh = partygoerDamage(eng, e, 25, 'melee', 'head')
  ok(Math.abs(dh - 2.5) < 1e-6, '胸甲闭合时头部同样被皮革护住')
  for (let i = 0; i < 400; i++) partygoerDamage(eng, e, 99, 'melee', 'body')
  ok(e.hp >= hp0 * PARTY.CLOSED_HP_FLOOR - 1e-6 && !e.dead && e.pg!.phase !== 'down', `不断臂就打不倒：躯体血量停在 ${e.hp.toFixed(0)}/${hp0}`)
  e.hp = 0; eng.killCheck(e)
  ok(!e.dead && e.hp > 0, '其他来源把血量打到 0 也不会死（killCheck 守卫按击杀顺序）')
  partygoerDamage(eng, e, 20, 'melee', 'armL')
  ok(e.pg!.armHp[0] === PARTY.ARM_HP - 20 && !e.pg!.berserk, `左臂独立血量 ${PARTY.ARM_HP} → ${e.pg!.armHp[0]}`)
  partygoerDamage(eng, e, 20, 'melee', 'armL')
  ok(e.pg!.armHp[0] <= 0 && !e.pg!.berserk, '左臂断了，仍未进入狂战士（右臂还能转化）')
  const { eng: e2 } = world(); const one = spawn(e2, 1.4, 0, 'hunt'); one.pg!.armHp[0] = 0; one.pg!.heardT = 0; e2.stepEntity = () => false
  run(e2, 1.2)
  ok(e2.partyConv > 0, '只剩一条面条臂也能咬人转化')
  partygoerDamage(eng, e, 30, 'melee', 'armR')
  ok(e.pg!.berserk && e.pg!.armHp[1] <= 0, '双臂都断 → 狂战士形态')
  run(eng, 1.0)
  ok(e.pg!.open > 0.9, `胸甲两扇门弹开（open=${e.pg!.open.toFixed(2)}）`)
  // 双臂断后无法再转化：让它在面前连续攻击
  eng.stepEntity = () => false; e.x = 1.2; e.y = 0
  const conv0 = eng.partyConv, hp1 = eng.player.hp
  let clawed = false
  run(eng, 3, () => { if (e.pg!.phase === 'claw') clawed = true })
  ok(eng.partyConv === conv0, '双臂都断后再也无法转化玩家')
  ok(clawed && eng.player.hp < hp1 - 20, `狂战士改用蜈蚣爪快速连续抓挠，伤害高（3 秒 -${(hp1 - eng.player.hp).toFixed(0)}）`)
  // ② 狂战士：头/脸是弱点
  const b0 = partygoerDamage(eng, e, 20, 'melee', 'body'), h0 = partygoerDamage(eng, e, 20, 'melee', 'head')
  ok(h0 > b0 * 3 && h0 === 20 * PARTY.HEAD_MULT, `胸口洞开：头/脸 20 → ${h0}，躯干 20 → ${b0}`)
  for (let i = 0; i < 20 && e.pg!.phase !== 'down'; i++) partygoerDamage(eng, e, 20, 'melee', 'head')
  ok(e.pg!.phase === 'down' && !e.dead && e.hp > 0, '打到阈值后倒地静止（没有死）')
  // ③ 静止 → 面朝下爬走 → 复苏
  const hpCorpse = e.hp
  partygoerDamage(eng, e, 99, 'melee', 'head')
  ok(e.hp === hpCorpse && !e.dead, '倒地后刀砍无效')
  eng.player.x = 0; eng.player.y = 0
  eng.stepEntity = world().eng.stepEntity
  const dDown = dist(e, eng)
  run(eng, PARTY.DOWN_T + 0.2)
  ok(e.pg!.phase === 'crawl', `静止 ${PARTY.DOWN_T}s 后面朝下靠蜈蚣步足爬走（${e.pg!.phase}）`)
  run(eng, 6)
  ok(dist(e, eng) > dDown + 1.5, `爬离玩家（${dDown.toFixed(1)} → ${dist(e, eng).toFixed(1)}m）`)
  run(eng, PARTY.REVIVE_T)
  ok(e.pg!.phase !== 'down' && e.pg!.phase !== 'crawl' && Math.abs(e.hp - e.def.hp * PARTY.REVIVE_HP) < 1e-6, `不处理的话一段时间后复苏（${e.pg!.phase}，hp=${e.hp.toFixed(0)}）`)
}
// ---------- 防御：防火、免疫电击；只有火盐/火油桶能烧尽倒地的它 ----------
for (const fuel of ['firesalt', 'gas'] as const) {
  const { eng, msgs } = world()
  const e = spawn(eng, 2, 0, 'hunt')
  const hp0 = e.hp
  landProjectile(eng, { id: 1, type: fuel, x: 2, y: 0, z: 0, floorZ: 0, vx: 0, vy: 0, vz: 0 } as any, 2, 0)
  ok(e.hp === hp0 && !e.dead, `${ITEMS[fuel].name}：站着的派对客皮肤防火，不掉血`)
  landProjectile(eng, { id: 2, type: 'capacitor', x: 2, y: 0, z: 0, floorZ: 0, vx: 0, vy: 0, vz: 0 } as any, 2, 0)
  ok(e.hp === hp0 && e.stunT < 1, '瓶装闪电：免疫电击，不掉血也不被电僵')
  // 打倒
  e.pg!.armHp = [0, 0]; e.pg!.berserk = true; e.hp = 1
  partygoerDamage(eng, e, 50, 'melee', 'head')
  ok(e.pg!.phase === 'down', '已倒地')
  const p0 = eng.particles.length
  landProjectile(eng, { id: 3, type: fuel, x: 2.5, y: 0.5, z: 0, floorZ: 0, vx: 0, vy: 0, vz: 0 } as any, 2.5, 0.5)
  ok(e.pg!.phase === 'burn', `${ITEMS[fuel].name}点燃倒地的派对客`)
  run(eng, PARTY.BURN_T + 0.1)
  ok(e.dead, `${ITEMS[fuel].name}把它烧尽（死亡）`)
  const smoke = eng.particles.slice(p0).filter((p: any) => p.color === '#141210' || p.color === '#2a2622').length
  ok(smoke > 10 && msgs.some((m: string) => m.includes('黑烟') && m.includes('硫磺')), `黑烟（${smoke} 个烟粒）与硫磺味提示`)
}
{
  const { eng } = world()
  const e = spawn(eng, 2, 0, 'hunt'); e.pg!.armHp = [0, 0]; e.pg!.berserk = true; e.hp = 1
  partygoerDamage(eng, e, 50, 'melee', 'head')
  run(eng, PARTY.DOWN_T + 1)
  landProjectile(eng, { id: 4, type: 'firesalt', x: e.x, y: e.y, z: 0, floorZ: 0, vx: 0, vy: 0, vz: 0 } as any, e.x, e.y)
  ok(e.pg!.phase === 'burn', '正在爬走的「尸体」同样能被点燃')
  const items = readFileSync('src/game/content/items.ts', 'utf8')
  ok(!items.includes("type: 'incendiary'") && ITEMS.firesalt.throw === 'explode' && ITEMS.gas.throw === 'explode', '复用现有火盐晶体/火油桶的投掷爆炸逻辑，没有新增武器物品')
}
// ---------- 心灵低语 ----------
{
  const { eng, msgs } = world()
  const e = spawn(eng, 3, 0, 'hunt'); e.pg!.heardT = 0
  eng.stepEntity = () => false
  run(eng, 25)
  const w = msgs.filter((m: string) => m.includes('熟人的声音'))
  ok(w.length >= 1 && w.every((m: string) => m.includes('=)')), `注视着玩家时弹出「熟人的声音」（${w.length} 次，结尾带 =)）`)
  ok(WHISPERS.includes('他们都死啦，你就是下一个！=)'), '台词包含维基原句「他们都死啦，你就是下一个！」')
  const { eng: e2, msgs: m2 } = world()
  const g = spawn(e2, 3, 0, 'hunt'); g.pg!.heardT = 0; g.facing = Math.PI * 0 // 背对玩家（玩家在 -x）
  e2.stepEntity = () => false; e2.faceToward = () => {}
  run(e2, 25)
  ok(!m2.some((m: string) => m.includes('熟人的声音')), '背对玩家（没有注视）时不会低语')
}
// ---------- 部位判定与模型左右一致 ----------
{
  const { eng } = world()
  const e = spawn(eng, 1.6, 0, 'hunt'); e.facing = Math.PI // 面朝玩家（玩家在原点）
  const g = buildEntityMesh('partygoer', { seed: e.id })
  const r = g.userData.pgRig as PartygoerRig
  g.position.set(e.x, 0, e.y); g.rotation.y = -e.facing; g.updateMatrixWorld(true)
  const wp = r.bones[r.B.arm[0][3]].getWorldPosition(new THREE.Vector3())
  const aim = (tx: number, ty: number, tz: number) => { const ox = 0, oy = 0, oz = 1.6, dx = tx - ox, dy = ty - oy, dz = tz - oz, l = Math.hypot(dx, dy, dz); return partygoerAimPart(eng, e, { ox, oy, oz, dx: dx / l, dy: dy / l, dz: dz / l }) }
  ok(aim(wp.x, wp.z, wp.y) === 'armL', `瞄准模型左面条臂（${wp.x.toFixed(2)}, ${wp.z.toFixed(2)}）判定为 armL`)
  const wr = r.bones[r.B.arm[1][3]].getWorldPosition(new THREE.Vector3())
  ok(aim(wr.x, wr.z, wr.y) === 'armR', '瞄准右面条臂判定为 armR')
  ok(aim(e.x, e.y, 2.0) === 'head', '瞄准 2.0m 高判定为头/脸')
  ok(aim(e.x, e.y, 1.2) === 'body', '瞄准胸口判定为躯干')
}
// ---------- 模型：预算、缓存、颜色变体、实习生气球、各形态 ----------
{
  const t0 = performance.now(); preparePartygoerGeometry(); const t1 = performance.now()
  let worst = { meshes: 0, draws: 0, tris: 0 }
  const colors = new Set<string>(); let interns = 0
  for (let id = 1; id <= 200; id++) { const l = partygoerLook(id); colors.add(l.color); if (l.intern) interns++ }
  ok(colors.size === 5, `颜色变体：${[...colors].join('/')}`)
  const yellow = [...Array(400).keys()].filter((i) => partygoerLook(i).color === 'yellow').length
  ok(yellow > 280 && yellow < 360, `大多数是金黄（${yellow}/400）`)
  ok(interns > 40 && interns < 100, `约三分之一是拴红气球的实习生（${interns}/200）`)
  const t2 = performance.now()
  for (let id = 1; id <= 12; id++) {
    const g = buildEntityMesh('partygoer', { seed: id })
    const e: any = { id, def: { hp: 130 }, hp: 130, pg: { phase: 'party', offer: 1, wave: 0, speed: 0, gait: 0, reach: 0, bite: 0, open: 1, claw: 0.3, down: 0, crawl: 0, burn: 0, armHp: [26, 26], armCut: [0, 0], balloon: partygoerLook(id).intern, balloonArm: partygoerLook(id).balloonArm, balloonFly: 0 } }
    animatePartygoer(g, e, 1, 0, 1 / 60)
    const b = partygoerBudget(g)
    if (b.draws > worst.draws || b.tris > worst.tris) worst = b
    const r = g.userData.pgRig as PartygoerRig
    ok(r.intern === partygoerLook(id).intern && (r.balloon !== null) === r.intern, `#${id} ${r.color}${r.intern ? ' · 红气球' : ''}`)
  }
  const per = (performance.now() - t2) / 12
  ok(worst.draws <= 6 && worst.draws >= 4, `单只最多 ${worst.draws} 次绘制（≤6，含递蛋糕与气球）`)
  ok(worst.tris <= 8000, `单只最多 ${worst.tris} 三角面（≤8k）`)
  ok(per < 40, `形态几何缓存：首次 ${(t1 - t0).toFixed(0)}ms，之后每只 ${per.toFixed(1)}ms`)
  const g = buildEntityMesh('partygoer', { seed: 3 })
  g.updateMatrixWorld(true)
  const crown = new THREE.Raycaster(new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, -1, 0)).intersectObject(g, true)[0]
  ok(!!crown && crown.point.y > 2.2, '头顶真实封闭：从正上方的射线命中穹顶而非穿入空壳')
  let nonIntern = 1
  while (partygoerLook(nonIntern).intern) nonIntern++
  const converted = buildEntityMesh('partygoer', { seed: nonIntern, partygoerIntern: true })
  ok(!!converted.userData.pgRig.balloon, '强制实习生状态能覆盖随机外貌并生成红气球')
  let face = false; g.traverse((o) => { if (o.userData.face) face = true })
  ok(face, '血刻笑脸贴花打了 face 标记')
  const r = g.userData.pgRig as PartygoerRig
  ok(r.bones.length >= 35 && r.B.arm[0].length === 7 && r.B.cent[0].length >= 6, `面条臂 7 节骨骼、蜈蚣臂 ${r.B.cent[0].length}/${r.B.cent[1].length} 节、共 ${r.bones.length} 根骨骼`)
  // 胸甲闭合时蜈蚣臂缩成一点藏在胸腔里；打开后弹出
  const e: any = { id: 3, def: { hp: 130 }, hp: 130, pg: { open: 0, armHp: [26, 26], armCut: [0, 0] } }
  animatePartygoer(g, e, 1, 0, 0)
  ok(r.bones[r.B.cent[0][0]].scale.x < 0.01, '胸甲闭合：蜈蚣爪臂收起')
  e.pg.open = 1; animatePartygoer(g, e, 1, 0, 0)
  const doorAng = 2 * Math.acos(Math.min(1, Math.abs(r.bones[r.B.door[0]].quaternion.w)))
  ok(r.bones[r.B.cent[0][0]].scale.x > 0.99 && doorAng > 1.5, `狂战士：两扇门弹开（${doorAng.toFixed(2)} rad）、蜈蚣爪臂弹出`)
  e.pg.armHp = [0, 26]; e.pg.armCut = [1, 0]; animatePartygoer(g, e, 1, 0, 0)
  ok(r.bones[r.B.arm[0][1]].scale.x < 0.01 && r.bones[r.B.arm[1][1]].scale.x > 0.9, '断掉的面条臂塌缩成肩上残桩')
  e.pg.down = 1; animatePartygoer(g, e, 1, 0, 0)
  ok(Math.abs(r.pose.rotation.x - Math.PI / 2) < 1e-6, '倒地：面朝下趴着')
  e.pg.burn = 1; animatePartygoer(g, e, 1, 0, 0)
  ok(r.skinMat.color.getHSL({ h: 0, s: 0, l: 0 }).l < 0.15, '火烧：皮肤烧焦发黑')
}

console.log(`\n${n - fails}/${n} 项通过`)
if (fails) { console.error(`✘ ${fails} 项失败`); process.exit(1) }
