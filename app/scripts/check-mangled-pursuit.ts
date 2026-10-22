/* Focused regression for the L9 Mangled pursuit/re-attack contract. */
import { makeEntity } from '../src/game/entities'
import { initNW, updateNW, nwCaptor, nwControlsPlayer, mangledGrowth, NW } from '../src/game/engine/watchAI'
import { audio } from '../src/game/core/audio'

let total = 0, failed = 0
const ok = (value: boolean, message: string) => { total++; if (!value) failed++; console.log(`${value ? '✔' : '✘'} ${message}`) }
for (const k of ['aggro', 'whisper', 'caveThunder', 'hurt']) (audio as any)[k] = () => {}

const W = 64, H = 40
function world() {
  const outdoor = new Uint8Array(W * H).fill(1)
  // A solid vertical wall with a gap at y=7, forcing the route planner to detour.
  for (let y = 2; y < H - 2; y++) if (y !== 7) outdoor[y * W + 20] = 0
  const eng: any = {
    levelDef: { id: 9 }, player: { x: 10, y: 20, z: 0, vz: 0, hp: 100, sanity: 100, flashlight: false, hasPockets: false, equip: { pockets: [null, null] } },
    map: { w: W, h: H, outdoor, entities: [], items: [], inf: { ox: 0, oy: 0, chunks: new Map() } },
    input: { jump: false, attack: false, interact: false }, dev: { invisible: false, god: false }, camShake: 0, dead: '', msgs: [],
    msg(t: string) { this.msgs.push(t) }, los() { return true },
    entityWalkH(_m: any, tx: number, ty: number) { return tx < 0 || ty < 0 || tx >= W || ty >= H || outdoor[ty * W + tx] !== 1 ? null : 0 },
    stepEntity(e: any, speed: number, dt: number) {
      const dx = e.targetX - e.x, dy = e.targetY - e.y, d = Math.hypot(dx, dy); if (d < .3) return true
      const k = Math.min(d, speed * dt) / d, nx = e.x + dx * k, ny = e.y + dy * k
      if (this.entityWalkH(this.map, Math.floor(nx), Math.floor(ny)) === null) return true
      e.x = nx; e.y = ny; e.facing = Math.atan2(dy, dx); return false
    },
    die(_cause: string) { if (this.dev.god) { this.player.hp = 20; return } this.dead = 'dead'; this.player.hp = 0 },
  }
  return eng
}
function tick(eng: any, e: any, seconds: number) {
  for (let i = 0; i < seconds * 30; i++) { nwControlsPlayer(eng); e.attackCd -= 1 / 30; e.stateT -= 1 / 30; updateNW(eng, e, 1 / 30, Math.hypot(e.x - eng.player.x, e.y - eng.player.y)) }
}

{
  const eng = world(), e = makeEntity('mangled', 30, 20); eng.map.entities.push(e); initNW(e)
  tick(eng, e, 24)
  ok(e.x < 21 || e.y < 8, '手动生成的残缺者会绕过墙体追踪，而不是直线卡住')
  const before = e.x; eng.player.x = 12; eng.player.y = 10; tick(eng, e, 4)
  ok(Math.abs(e.x - before) > .1 || Math.abs(e.y - 20) > .1, '玩家移动后追踪目标会重新规划')
}
{
  const eng = world(), e = makeEntity('mangled', 10, 20); eng.map.entities.push(e); initNW(e)
  for (let y = 0; y < H; y++) for (let x = 21; x < W; x++) eng.map.outdoor[y * W + x] = 0
  eng.player.x = 25; eng.player.y = 20
  tick(eng, e, 12)
  ok(e.x < 20.5, '玩家进入室内后，残缺者只沿室外通路追到门外，不穿入室内')
}
{
  const eng = world(), e = makeEntity('mangled', 30, 20); eng.map.entities.push(e); initNW(e)
  tick(eng, e, 2)
  const beforeWorldX = e.x + eng.map.inf.ox
  eng.map.inf.ox += 17; eng.player.x -= 17; e.x -= 17
  tick(eng, e, 2)
  ok(Math.abs((e.x + eng.map.inf.ox) - beforeWorldX) < 8, '流式原点平移并同步局部坐标后，追踪仍保持真实世界位置')
}
{
  const eng = world(), e = makeEntity('mangled', 11.5, 20); eng.map.entities.push(e); initNW(e)
  eng.dev.god = true
  // Let the first attack reach its protected die() call.
  tick(eng, e, 20)
  ok(!eng.dead && !nwCaptor(eng), '无敌/拦截死亡时会释放玩家，不会永久卡在抓取状态')
  ok(e.nw!.phase === 'stalk', '一次未致死攻击结束后返回追踪状态')
  eng.player.hp = 100; e.x = 10.5; e.y = 20; e.attackCd = 0; e.nw!.phase = 'warn'; e.nw!.t = NW.M_WARN; tick(eng, e, .1)
  ok(e.nw!.phase === 'stalk' && !nwCaptor(eng), '幸存后保持可再次追踪的空闲状态')
  ok(mangledGrowth(eng) === 1, '未真正死亡时不会错误增长残缺者体型')
}
console.log(`mangled pursuit checks: ${total - failed}/${total}`)
if (failed) process.exitCode = 1
