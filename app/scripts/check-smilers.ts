// v61：笑魇重制——行为机制无头验收（模拟引擎，空旷平面，无墙）。
// 运行：npx esbuild scripts/check-smilers.ts --bundle --platform=node --format=esm --outfile=.cache/check-smilers.mjs && node .cache/check-smilers.mjs
import { makeEntity, type Entity } from '../src/game/entities'
import { beginSmilerFrame, flushSmilerSpawns, initSmiler, smilerHear, updateSmiler } from '../src/game/engine/smilerAI'
import { SMILER_KINDS, pickSmilerKind, type SmilerKind } from '../src/game/entities/smilers'

let fails = 0
const ok = (c: boolean, m: string) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }

function world(levelId = 2) {
  const msgs: string[] = []
  const w = 32, h = 32, cells = w * h
  const eng: any = {
    levelDef: { id: levelId },
    player: { x: 0, y: 0, z: 0, hp: 100, stamina: 100, sanity: 100, slowT: 0 },
    // Keep this a roofless open plane while satisfying the GameMap arrays used
    // by smiler headroom/ceiling queries.
    map: {
      w, h, tiles: new Uint8Array(cells), tint: new Uint8Array(cells),
      ceiling: new Uint8Array(cells), floors: 1, stair: new Int32Array(cells),
      up: new Uint8Array(cells), up2: new Uint8Array(cells), dn: new Uint8Array(cells),
      crawl: new Uint8Array(cells), outdoor: new Uint8Array(cells),
      elev: new Uint8Array(cells), step: new Uint8Array(cells),
      liquid: new Uint8Array(cells), seaFloor: new Float32Array(cells),
      structures: [], lights: [], exits: [], spawn: { x: 0, y: 0 },
      entities: [] as Entity[], items: [] as any[]
    },
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
function spawn(eng: any, kind: SmilerKind, x: number, y: number) {
  const e = makeEntity('smiler', x, y)
  eng.map.entities.push(e)
  initSmiler(eng, e, kind)
  return e
}
function run(eng: any, secs: number, light: boolean, each?: (t: number) => void) {
  const dt = 1 / 30
  for (let t = 0; t < secs; t += dt) {
    each?.(t)
    beginSmilerFrame(eng, dt, light)
    for (const e of eng.map.entities) { if (e.dead) continue; e.attackCd -= dt; e.stateT -= dt; if (e.stunT > 0) { e.stunT -= dt; continue } updateSmiler(eng, e, dt, Math.hypot(e.x - eng.player.x, e.y - eng.player.y), 1, eng.levelDef.id === 3) }
    flushSmilerSpawns(eng)
  }
}

// 1) 分布
{
  const c: Record<string, number> = {}
  for (let i = 0; i < 4000; i++) { const k = pickSmilerKind(3, false); c[k] = (c[k] ?? 0) + 1 }
  ok(Object.keys(c).length === 5, `L3 出现全部 5 种变种：${JSON.stringify(c)}`)
  ok(pickSmilerKind(0, false) === 'common', '未配置层级只出普通笑魇')
}
// 2) 趋光：亮灯被引来，关灯不靠近
{
  const { eng } = world(2)
  const e = spawn(eng, 'common', 9, 0)
  eng.yaw = Math.PI // 背对
  run(eng, 2, false)
  ok(Math.hypot(e.x, e.y) > 8, `关灯：笑魇未靠近（距离 ${Math.hypot(e.x, e.y).toFixed(1)}）`)
  run(eng, 2.5, true)
  ok(e.sm!.aware > 0 && Math.hypot(e.x, e.y) < 7, `亮灯：笑魇察觉并逼近（距离 ${Math.hypot(e.x, e.y).toFixed(1)}，阶段 ${e.sm!.phase}）`)
}
// 3) 对峙：直视时停住；黑暗中对视会让它退去
{
  const { eng, msgs } = world(2)
  const e = spawn(eng, 'common', 4, 0)
  eng.yaw = 0 // 直视
  run(eng, 1, true)
  const d0 = Math.hypot(e.x, e.y)
  ok(e.sm!.phase === 'standoff', `直视 → 对峙（${e.sm!.phase}）`)
  run(eng, 4.5, false, (t) => { if (process.env.DBG && Math.abs(t % 0.5) < 0.034) console.log('S', t.toFixed(1), e.sm!.phase, e.x.toFixed(2), e.sm!.aware.toFixed(2), e.sm!.gaze.toFixed(2)) })
  ok(e.sm!.phase === 'retreat' || e.sm!.phase === 'drift', `关灯继续对视 → 退回黑暗（${e.sm!.phase}）`)
  ok(eng.hurt === 0 && d0 > 2, '对峙期间没有受到攻击')
  ok(msgs.some((m) => m.includes('沉回黑暗')), '提示：它沉回黑暗')
}
// 4) 恐慌：近距离奔跑 → 扑击并命中扼颈
{
  const { eng } = world(2)
  const e = spawn(eng, 'common', 4, 0)
  eng.yaw = 0
  run(eng, 0.5, true)
  eng.input.sprint = true
  run(eng, 0.4, true, () => { eng.player.x -= 0.2 }) // 6m/s 转身逃跑
  ok(e.sm!.phase === 'pounce', `奔跑触发扑击（${e.sm!.phase}）`)
  eng.input.sprint = false
  run(eng, 2.5, true) // 体力耗尽停下
  ok(eng.hurt > 0, `转身奔跑被扑中（伤害 ${eng.hurt}）`)
  ok(eng.player.slowT > 0 || eng.player.stamina < 100, '扼颈：减速/体力被抽空')
  void e
}
// 5) 移开视线：对峙中背过身会加速逼近
{
  const { eng } = world(2)
  const e = spawn(eng, 'common', 5, 0)
  eng.yaw = 0
  run(eng, 1, true)
  eng.yaw = Math.PI
  run(eng, 0.2, true)
  ok((e.sm!.brokeGaze ?? 0) > 0 && e.sm!.phase === 'stalk', `移开视线 → 加速逼近（${e.sm!.phase}）`)
}
// 6) 荧光棒诱饵：被引开并咬碎
{
  const { eng, msgs } = world(2)
  const e = spawn(eng, 'common', 6, 0)
  eng.yaw = Math.PI
  eng.map.items.push({ id: 77, type: 'glowstick', x: 9, y: 4, z: 0 })
  run(eng, 12, false)
  ok(!eng.map.items.some((i: any) => i.id === 77), '荧光棒被笑魇咬碎')
  ok(msgs.some((m) => m.includes('咬碎了荧光棒')), '提示：咬碎荧光棒')
  void e
}
// 7) 幽影笑魇：开手电瞬间扑击；远处几乎不可见
{
  const { eng } = world(1)
  const e = spawn(eng, 'phantom', 6, 0)
  eng.yaw = Math.PI
  run(eng, 1.5, false)
  ok(Math.hypot(e.x, e.y) > 4.5 && e.sm!.vis < 0.3, `幽影笑魇远处不可见（vis ${e.sm!.vis.toFixed(2)}）`)
  run(eng, 0.1, true)
  ok(e.sm!.phase === 'pounce', `开手电瞬间扑击（${e.sm!.phase}）`)
}
// 8) 饥饿笑魇：循声锁定；地上食物能拖住它
{
  const { eng } = world(2)
  const e = spawn(eng, 'starved', 8, 0)
  smilerHear(eng, e, 0, 0, 10, true)
  ok(e.sm!.aware > 5, '听见奔跑声后长时间锁定')
  eng.map.items.push({ id: 5, type: 'canned', x: 6, y: 2, z: 0 })
  run(eng, 13, false, (t) => { if (process.env.DBG && Math.abs(t % 1) < 0.034) console.log(t.toFixed(1), e.sm!.phase, e.x.toFixed(2), e.y.toFixed(2), e.sm!.aware.toFixed(1)) })
  ok(!eng.map.items.some((i: any) => i.id === 5), '饥饿笑魇吃掉了地上的罐头')
}
// 9) 犬形：成群出现
{
  const { eng } = world(3)
  spawn(eng, 'canid', 6, 0)
  run(eng, 0.1, false)
  const pack = eng.map.entities.filter((q: Entity) => q.sm?.kind === 'canid')
  ok(pack.length >= 2 && new Set(pack.map((q: Entity) => q.sm!.packId)).size === 1, `犬形笑魇成群（${pack.length} 只，同一 packId）`)
}
// 10) 巨笑魇：手电持续直射 → 踉跄
{
  const { eng, msgs } = world(3)
  const e = spawn(eng, 'great', 6, 0)
  eng.yaw = 0
  run(eng, 2.2, true)
  ok(e.stunT > 0 || e.sm!.phase === 'stagger' || msgs.some((m) => m.includes('踉跄')), `巨笑魇被强光灼眼踉跄（${e.sm!.phase}）`)
  ok(e.def.hp === SMILER_KINDS.great.hp && (e.def.scale ?? 1) > 1.5, '巨笑魇数值与体型')
}
// 11) 受伤过重 → 退缩
{
  const { eng } = world(2)
  const e = spawn(eng, 'common', 3, 0)
  run(eng, 0.2, true)
  e.hp = 10
  run(eng, 0.1, true)
  ok(e.sm!.phase === 'retreat', `重伤后退回黑暗（${e.sm!.phase}）`)
}

if (fails) { console.error(`\n${fails} 项未通过`); process.exit(1) }
console.log('\n笑魇行为验收全部通过')
