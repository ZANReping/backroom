// v62：猎犬重制——行为机制无头验收（模拟引擎，空旷平面）
// 运行：npx esbuild scripts/check-hounds.ts --bundle --platform=node --format=esm --outfile=.cache/check-hounds.mjs && node .cache/check-hounds.mjs
import { makeEntity, type Entity } from '../src/game/entities'
import { beginHoundFrame, initHound, updateHound } from '../src/game/engine/houndAI'
let fails = 0
const ok = (c: boolean, m: string) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
function world(levelId = 2) {
  const msgs: string[] = []
  const eng: any = {
    levelDef: { id: levelId },
    player: { x: 0, y: 0, z: 0, hp: 100, stamina: 100, sanity: 100, slowT: 0, crouching: false }, playerNoiseT: 0,
    map: { entities: [] as Entity[], items: [] as any[] },
    projectiles: [] as any[],
    input: { sprint: false },
    dev: { invisible: false },
    camShake: 0,
    yaw: 0, // 玩家朝向（弧度，游戏 x/y 平面）
    hurt: 0,
    msg: (t: string) => msgs.push(t),
    los: () => true,
    lookingAt(e: Entity) { const a = Math.atan2(e.y - this.player.y, e.x - this.player.x); let d = Math.abs(a - this.yaw); if (d > Math.PI) d = 2 * Math.PI - d; return d < 0.4 },
    viewAngle(x: number, y: number) { const a = Math.atan2(y - this.player.y, x - this.player.x); let d = Math.abs(a - this.yaw); if (d > Math.PI) d = 2 * Math.PI - d; return d },
    entityWalkH: () => 0,
    wanderTarget(e: Entity) { e.targetX = e.x + 1; e.targetY = e.y; e.stateT = 3 },
    stepEntity(e: Entity, sp: number, dt: number) { const dx = e.targetX - e.x, dy = e.targetY - e.y, d = Math.hypot(dx, dy); if (d < 0.3) return true; const k = Math.min(d, sp * dt) / d; e.x += dx * k; e.y += dy * k; return false },
    faceToward(e: Entity, x: number, y: number) { e.facing = Math.atan2(y - e.y, x - e.x) },
    meleeZOk: () => true,
    hurtPlayer(dmg: number) { this.hurt += dmg; this.player.hp -= dmg },
  }
  return { eng, msgs }
}
function spawn(eng: any, x: number, y: number, neutral = false) { const e = makeEntity('hound', x, y); eng.map.entities.push(e); initHound(eng, e, neutral); return e }
function run(eng: any, secs: number, each?: (t: number) => void) {
  const dt = 1 / 30
  for (let t = 0; t < secs; t += dt) {
    each?.(t); beginHoundFrame(eng, dt)
    for (const e of eng.map.entities) { if (e.dead) continue; e.attackCd -= dt; e.stateT -= dt; updateHound(eng, e, dt, Math.hypot(e.x - eng.player.x, e.y - eng.player.y), 1, false) }
  }
}
{ // 目击→嚎叫召集
  const { eng, msgs } = world(1); eng.yaw = Math.PI
  const a = spawn(eng, 5, 0), b = spawn(eng, 18, 6)
  run(eng, 0.2)
  ok(a.hd!.phase === 'howl' && a.hd!.howled === true, `目击后仰头嚎叫（${a.hd!.phase}）`)
  ok(b.hd!.alert > 0 && b.hd!.phase === 'search', `远处同类被召集搜寻（${b.hd!.phase}）`)
  ok(msgs.some((m: string) => m.includes('嚎叫')), '提示：嚎叫')
}
{ // 直视：伏低后退，约 4s 后失效并冲锋
  const { eng, msgs } = world(1); eng.yaw = 0
  const e = spawn(eng, 4.5, 0); e.hd!.howled = true
  run(eng, 1)
  ok(e.hd!.phase === 'cower', `直视 → 伏低后退（${e.hd!.phase}）`)
  const x1 = e.x; run(eng, 2); ok(e.x > x1, '伏低时向后退')
  run(eng, 2)
  ok(e.hd!.phase === 'charge' || e.hd!.strikeT !== undefined || eng.hurt > 0, `目光失效后重新扑来（${e.hd!.phase}）`)
  ok(msgs.some((m: string) => m.includes('习惯了你的目光')), '提示：习惯目光')
}
{ // 看见就逃跑 → 冲锋，扑击命中
  const { eng } = world(1); eng.yaw = Math.PI
  const e = spawn(eng, 4.5, 0); e.hd!.howled = true
  eng.input.sprint = true
  run(eng, 0.5, () => { eng.player.x -= 0.2 })
  ok(e.hd!.phase === 'charge', `逃跑触发冲锋（${e.hd!.phase}）`)
  eng.input.sprint = false
  run(eng, 3)
  ok(eng.hurt > 0 && eng.player.slowT > 0, `扑击命中并减速（伤害 ${eng.hurt}）`)
}
{ // L11 中立：观察、坐下、不攻击；被攻击后转敌对并带动同类
  const { eng } = world(11); eng.yaw = Math.PI
  const e = spawn(eng, 5, 0, true), f = spawn(eng, 7, 3, true)
  run(eng, 6)
  ok(eng.hurt === 0 && (e.hd!.phase === 'sit' || e.hd!.phase === 'watch'), `中立猎犬只观察不攻击（${e.hd!.phase}）`)
  e.hp -= 5
  run(eng, 0.1)
  ok(!e.hd!.neutral && !f.hd!.neutral, '被攻击后转为敌对，附近中立同类一起转变')
  eng.yaw = Math.PI; run(eng, 4)
  ok(eng.hurt > 0, '转敌对后会攻击')
}
{ // 中立：近处奔跑会被吓跑
  const { eng } = world(11)
  const e = spawn(eng, 3, 0, true)
  run(eng, 1)
  eng.input.sprint = true; run(eng, 0.3, () => { eng.player.y += 0.2 })
  ok(e.hd!.phase === 'flee' || Math.hypot(e.x, e.y) > 3.5, `中立猎犬被奔跑吓跑（${e.hd!.phase}）`)
}
if (fails) { console.error(`\n${fails} 项未通过`); process.exit(1) }
console.log('\n猎犬行为验收全部通过')
