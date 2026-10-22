/* eslint-disable @typescript-eslint/no-explicit-any -- 测试桩用简化的引擎替身，不进生产包 */
// 邻里守望（观察者 / 挺进者）+ 残缺者 重制——机制无头验收（模拟引擎）。运行：npm run check:watch
import { makeEntity, type Entity } from '../src/game/entities'
import { audio } from '../src/game/core/audio'
import { NW, initNW, nwControlsPlayer, nwCaptor, nwHear, nwInvulnerable, nwKilled, updateNW, mangledGrowth, mangledOmen } from '../src/game/engine/watchAI'

let fails = 0, n = 0
const ok = (c: boolean, m: string) => { n++; console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
for (const k of ['aggro', 'whisper', 'caveThunder', 'hurt']) (audio as any)[k] = () => {}

function world(o: { indoorFrom?: number } = {}) {
  const W = 80, H = 40, msgs: string[] = []
  const outdoor = new Uint8Array(W * H).fill(1)
  if (o.indoorFrom !== undefined) for (let y = 0; y < H; y++) for (let x = o.indoorFrom; x < W; x++) outdoor[y * W + x] = 0
  const eng: any = {
    levelDef: { id: 9 },
    player: { x: 10, y: 20, z: 0, vz: 0, hp: 100, sanity: 100, slowT: 0, flashlight: false, hasPockets: false, equip: { pockets: [null, null] } },
    map: { w: W, h: H, outdoor, entities: [] as Entity[], items: [] as any[], inf: { ox: 0, oy: 0, chunks: new Map() } },
    particles: [] as any[], input: { jump: false, attack: false, interact: false }, dev: { invisible: false, god: false },
    camShake: 0, hurt: 0, dead: '', wall: false,
    msg: (t: string) => msgs.push(t),
    los() { return !this.wall },
    entityWalkH(_m: any, tx: number, ty: number) {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return null
      return this.map.outdoor[ty * W + tx] === 1 ? 0 : null
    },
    wanderTarget(e: Entity) { e.targetX = e.x; e.targetY = e.y; e.stateT = 3 },
    stepEntity(e: Entity, sp: number, dt: number) { const dx = e.targetX - e.x, dy = e.targetY - e.y, d = Math.hypot(dx, dy); if (d < 0.3) return true; const k = Math.min(d, sp * dt) / d; const nx = e.x + dx * k, ny = e.y + dy * k; if (this.map.outdoor[Math.floor(ny) * this.map.w + Math.floor(nx)] !== 1) return true; e.x = nx; e.y = ny; e.facing = Math.atan2(dy, dx); this.lastSpeed = sp; return false },
    hurtPlayer(dmg: number) { this.hurt += dmg; this.player.hp -= dmg; if (this.player.hp <= 0 && !this.dead) this.dead = 'hurt' },
    die(c: string) { this.dead = c; this.player.hp = 0 },
    syncPassives() { this.player.hasPockets = this.player.equip.pockets.some((s: any) => s?.type === 'pockets') },
  }
  return { eng, msgs }
}
function spawn(eng: any, type: string, x: number, y: number) { const e = makeEntity(type, x, y); e.facing = Math.atan2(eng.player.y - y, eng.player.x - x); eng.map.entities.push(e); initNW(e); return e }
function run(eng: any, secs: number, each?: (t: number) => void) {
  const dt = 1 / 30
  for (let t = 0; t < secs && !eng.dead; t += dt) {
    each?.(t)
    nwControlsPlayer(eng)
    for (const e of eng.map.entities) { if (e.dead) continue; e.attackCd -= dt; e.stateT -= dt; updateNW(eng, e, dt, Math.hypot(e.x - eng.player.x, e.y - eng.player.y)) }
  }
}
const masher = (eng: any) => { let k = 0; return () => { eng.input.jump = (k++ % 2) === 0 } }

// ================= 观察者 =================
{
  const { eng } = world()
  const w = spawn(eng, 'watcher', 30, 20)
  run(eng, NW.W_LOCK + 0.1)
  ok(w.nw!.phase === 'charge', `20m 内看见玩家 → 锁定 ${NW.W_LOCK}s 后进入蓄力（${w.nw!.phase}）`)
  ok(eng.hurt === 0, '蓄力期间不造成伤害')
  run(eng, NW.W_CHARGE)
  ok(w.nw!.phase === 'beam', `蓄力 ${NW.W_CHARGE}s 后发射光束（${w.nw!.phase}）`)
  run(eng, 0.6)
  ok(!eng.dead && eng.player.hp > 60, `光束不立即致死：照射 0.6s 后仍有 ${eng.player.hp.toFixed(0)} 血`)
  eng.wall = true
  const hp0 = eng.player.hp
  run(eng, 0.8)
  ok(w.nw!.phase === 'cool' || w.nw!.phase === 'patrol', `躲到墙后（丢失视线 ${NW.W_LOSE}s）光束中断（${w.nw!.phase}）`)
  ok(hp0 - eng.player.hp <= NW.W_BEAM_DPS * (NW.W_LOSE + NW.W_BEAM_TICK) + 0.1, `中断前最多再吃 ${(hp0 - eng.player.hp).toFixed(1)} 伤害`)
}
{
  const { eng } = world()
  const w = spawn(eng, 'watcher', 30, 20)
  w.attackCd = 0
  let beamT = 0
  run(eng, 12, () => { if (w.nw!.phase === 'beam') beamT += 1 / 30 })
  ok(eng.dead.includes('细灰'), `站着不躲会被持续照死并化为细灰（${eng.dead}）`)
  ok(beamT > 2, `从开始照射到死亡用了 ${beamT.toFixed(1)}s（>2s 躲避窗口）`)
  ok(eng.map.items.some((i: any) => i.type === 'ashpile'), '原地留下一捧细灰（ashpile）')
}
{
  const { eng } = world()
  const w = spawn(eng, 'watcher', 30, 20)
  const rat = spawn(eng, 'strider', 0, 0); rat.dead = true
  const victim = makeEntity('hound', 20, 20); eng.map.entities.push(victim)
  run(eng, NW.W_LOCK + NW.W_CHARGE + 0.4)
  ok(victim.dead && eng.map.items.filter((i: any) => i.type === 'ashpile').length >= 1, '光束路径上的其他实体也化为灰堆')
  ok(nwInvulnerable('watcher') && nwInvulnerable('mangled') && !nwInvulnerable('strider'), '观察者、残缺者不可杀；挺进者可杀')
  void w
}
{
  const { eng, msgs } = world()
  eng.player.flashlight = true
  spawn(eng, 'watcher', 25, 20)
  run(eng, 0.2)
  ok(!eng.player.flashlight && msgs.some((m) => m.includes('手电')), `观察者 ${NW.EMP_R}m 内手电闪烁熄灭（电子干扰）`)
}

// ================= 挺进者 =================
{
  const { eng } = world({ indoorFrom: 20 })
  eng.player.x = 21.5; eng.player.y = 20
  const s = spawn(eng, 'strider', 19.6, 20) // 室外，离玩家 1.9m
  run(eng, NW.S_REACH_WIND + 0.2)
  ok(nwCaptor(eng) === s, `玩家在屋内、离门窗 1.9m（≤${NW.S_REACH}m）→ 附肢伸进来抓住`)
}
{
  const { eng } = world({ indoorFrom: 20 })
  eng.player.x = 23; eng.player.y = 20
  spawn(eng, 'strider', 19.6, 20) // 3.4m
  run(eng, 3)
  ok(!nwCaptor(eng), '退到房间深处（3.4m）就够不着')
}
{
  const { eng } = world({ indoorFrom: 20 })
  eng.player.x = 21.5; eng.player.y = 20; eng.player.z = 3
  spawn(eng, 'strider', 19.6, 20)
  run(eng, 3)
  ok(!nwCaptor(eng), '二楼（脚底 3m）安全')
}
{
  const { eng } = world({ indoorFrom: 20 })
  eng.player.x = 21.5; eng.player.y = 20
  spawn(eng, 'strider', 19.6, 20)
  run(eng, NW.S_REACH_WIND + 0.2)
  const grabbed = !!nwCaptor(eng)
  const m = masher(eng)
  run(eng, 1.2, m)
  ok(eng.hurt === 0 && !nwCaptor(eng) && grabbed, `被抓后连按 ${NW.S_MASH} 下挣脱，不受伤`)
}
{
  const { eng } = world({ indoorFrom: 20 })
  eng.player.x = 21.5; eng.player.y = 20
  const s = spawn(eng, 'strider', 19.6, 20)
  run(eng, NW.S_REACH_WIND + 0.2 + NW.S_GRAB_T + 1.0)
  ok(eng.hurt >= NW.S_SLAM_DMG - 0.1 && !nwCaptor(eng), `不挣扎 → ${NW.S_GRAB_T}s 后抡起砸地（${eng.hurt} 伤害）`)
  ok(eng.player.x < 21, `被从门窗里拖出到室外（x=${eng.player.x.toFixed(2)}）`)
  void s
}
{
  const { eng, msgs } = world({ indoorFrom: 20 })
  eng.player.x = 21.5; eng.player.y = 20
  spawn(eng, 'strider', 19.6, 20)
  const w = spawn(eng, 'watcher', 8, 20); eng.wall = false
  w.attackCd = 99 // 先让它看不到/不攻击，验证是挺进者的递交触发锁定
  run(eng, NW.S_REACH_WIND + 0.2 + NW.S_GRAB_T + 0.1)
  ok(msgs.some((m) => m.includes('举起')), '附近有观察者 → 改为把猎物举起来递交')
  ok(w.nw!.phase === 'lock' || w.nw!.phase === 'charge', `观察者随即锁定被举着的猎物（${w.nw!.phase}）`)
}
{
  const { eng } = world({ indoorFrom: 20 })
  eng.player.x = 21.5; eng.player.y = 20
  eng.player.equip.pockets[0] = { type: 'pockets' }; eng.player.hasPockets = true
  const s = spawn(eng, 'strider', 19.6, 20)
  run(eng, NW.S_REACH_WIND + 0.2)
  ok(!eng.player.hasPockets, '挺进者抓住时扯走「一些口袋」')
  run(eng, 1.2, masher(eng))
  run(eng, 16)
  const it = eng.map.items.find((i: any) => i.type === 'pockets')
  ok(!!it && Math.hypot(it.x - 19.6, it.y - 20) > 10, `然后把口袋放回街区远处（${it ? Math.hypot(it.x - 19.6, it.y - 20).toFixed(1) : '无'}m）`)
  void s
}
{
  const { eng } = world()
  eng.player.x = 10
  const s = spawn(eng, 'strider', 20, 20)
  let maxSp = 0
  run(eng, 2, () => { maxSp = Math.max(maxSp, eng.lastSpeed ?? 0) })
  ok(maxSp <= NW.S_SPRINT && maxSp >= 6, `短冲刺速度 ${maxSp} m/s（不按 90 mph）`)
  void s
}
{
  const { eng } = world()
  const s = spawn(eng, 'strider', 14, 20)
  nwHear(eng, s, 10, 20, 6, false)
  ok(s.nw!.phase === 'patrol', '听觉很弱：4m 外半径 6 的响动听不见')
  nwHear(eng, s, 13, 20, 6, false)
  ok(s.nw!.phase === 'hunt', '1m 处的响动听得见')
}
{
  const { eng } = world()
  eng.wall = true
  const s = spawn(eng, 'strider', 8.5, 20) // 已在 1.5m 伸手范围内，但完整墙体遮挡
  s.nw!.phase = 'reach'; s.nw!.t = 0
  run(eng, NW.S_REACH_WIND + 0.25)
  ok(!nwCaptor(eng), '完整墙体遮挡时，即使挺进者已在伸手范围内也不会抓人')
}
{
  const { eng } = world({ indoorFrom: 10 })
  eng.player.x = 10
  const m = spawn(eng, 'mangled', 16, 20)
  run(eng, 3)
  ok(!nwCaptor(eng) && m.nw!.phase === 'stalk', '残缺者与屋内玩家同处室内时不会越过室内限制抓取')
}
{
  const { eng } = world()
  const s = spawn(eng, 'strider', 14, 20)
  s.nw!.pocketX = 40; s.nw!.pocketY = 20
  const before = eng.map.items.filter((i: any) => i.type === 'pockets').length
  nwKilled(eng, s)
  const onceCount = eng.map.items.filter((i: any) => i.type === 'pockets').length
  nwKilled(eng, s)
  const twiceCount = eng.map.items.filter((i: any) => i.type === 'pockets').length
  ok(onceCount === before + 1 && twiceCount === onceCount, '挺进者死亡时仅掉落一次被扯走的「一些口袋」')
}
{
  const { eng } = world()
  eng.wall = true
  const a = spawn(eng, 'strider', 14, 20), b = spawn(eng, 'strider', 40, 20)
  a.facing = Math.PI; eng.wall = false
  eng.los = (x1: number) => x1 < 20 // 只有 a 看得见
  run(eng, 0.1)
  ok(b.nw!.seenT < 1 && b.nw!.phase === 'hunt', '共享感知：一只发现你，附近的都知道')
}

// ================= 残缺者 =================
{
  const { eng, msgs } = world()
  const m = spawn(eng, 'mangled', 16, 20)
  run(eng, 0.2)
  ok(m.nw!.phase === 'warn' && eng.hurt === 0, `进入触须范围 → ${NW.M_WARN}s 预警（${m.nw!.phase}）`)
  run(eng, NW.M_WARN + NW.M_LIFT_T + 0.2)
  ok(nwCaptor(eng) === m && eng.player.z > NW.M_LIFT - 1, `预警结束仍在范围内 → 被卷起吊到 ${eng.player.z.toFixed(1)}m`)
  run(eng, 1.5, masher(eng))
  const expect = (NW.M_LIFT - NW.M_FALL_SAFE) * NW.M_FALL_DMG
  ok(!nwCaptor(eng) && Math.abs(eng.hurt - expect) < 4, `挣脱后坠落受伤 ${eng.hurt.toFixed(1)}（约 ${expect.toFixed(1)}）`)
  ok(!eng.dead, '挣脱后存活')
  ok(msgs.some((t) => t.includes('预警') || t.includes('垂下')), '有触须下落预警提示')
}
{
  const { eng } = world()
  spawn(eng, 'mangled', 16, 20)
  const g0 = mangledGrowth(eng)
  run(eng, 12)
  ok(eng.dead.includes('同化'), `不挣扎 → 被同化（${eng.dead}）`)
  ok(mangledGrowth(eng) > g0, `同化后体型增长 ${g0.toFixed(2)} → ${mangledGrowth(eng).toFixed(2)}`)
}
{
  const { eng } = world()
  eng.player.x = 10
  spawn(eng, 'mangled', 10, 20)
  run(eng, 0.1)
  eng.player.x = 30 // 预警期间跑出范围
  run(eng, NW.M_WARN + 0.3)
  ok(!nwCaptor(eng), '预警期间跑出范围 → 躲开')
}
{
  const { eng, msgs } = world()
  eng.player.x = 0
  const m = spawn(eng, 'mangled', 30, 20); m.nw!.lureCd = 0
  run(eng, 0.1)
  ok(msgs.some((t) => t.includes('雾里传来')), '熟人声音诱骗')
  const { eng: e2, msgs: m2 } = world()
  for (let i = 0; i < 40; i++) mangledOmen(e2, 0.5, 0.6)
  ok(m2.some((t) => t.includes('气温骤降')) && m2.some((t) => t.includes('震') || t.includes('雷')), '浓雾预警期：气温骤降 + 震动 / 雷声')
}

console.log(`\n${n - fails}/${n} 通过`)
if (fails) process.exit(1)
