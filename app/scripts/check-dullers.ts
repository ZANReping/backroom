// v63：钝人重制——行为机制无头验收（模拟引擎：x∈[1,2) 为一堵墙，玩家在左侧走廊，钝人从右侧走廊下手）
// 运行：npx esbuild scripts/check-dullers.ts --bundle --platform=node --format=esm --outfile=.cache/check-dullers.mjs && node .cache/check-dullers.mjs
import { makeEntity, type Entity } from '../src/game/entities'
import { beginDullerFrame, dullerAlmondScent, dullerDrop, dullerSquirted, initDuller, resetDullerFrame, updateDuller } from '../src/game/engine/dullerAI'
let fails = 0
const ok = (c: boolean, m: string) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
const inWall = (x: number) => x >= 1 && x < 2
function world(wall = true) {
  resetDullerFrame()
  const msgs: string[] = []
  const eng: any = {
    levelDef: { id: 1 },
    player: { x: 0.5, y: 0, z: 0, hp: 100, stamina: 100, sanity: 100, slowT: 0, crouching: false }, playerNoiseT: 0,
    map: { entities: [] as Entity[], items: [] as any[], w: 0, h: 0 },
    input: { sprint: false }, dev: { invisible: false }, camShake: 0,
    yaw: Math.PI, hurt: 0, almond: 0,
    msg: (t: string) => msgs.push(t),
    los(x0: number, y0: number, x1: number, y1: number) {
      if (!wall) return true
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 20)
      for (let i = 1; i < n; i++) { const t = i / n; if (inWall(x0 + (x1 - x0) * t)) return false }
      return true
    },
    viewAngle(x: number, y: number) { const a = Math.atan2(y - this.player.y, x - this.player.x); let d = Math.abs(a - this.yaw); if (d > Math.PI) d = 2 * Math.PI - d; return d },
    hasItem(t: string) { return t === 'almond' && this.almond > 0 },
    entityWalkH: (_m: unknown, tx: number) => (wall && tx === 1 ? null : 0),
    wanderTarget(e: Entity) { e.targetX = e.x + 0.5; e.targetY = e.y; e.stateT = 3 },
    stepEntity(e: Entity, sp: number, dt: number) { const dx = e.targetX - e.x, dy = e.targetY - e.y, d = Math.hypot(dx, dy); if (d < 0.3) return true; const k = Math.min(d, sp * dt) / d; e.x += dx * k; e.y += dy * k; return false },
    faceToward(e: Entity, x: number, y: number) { e.facing = Math.atan2(y - e.y, x - e.x) },
    hurtPlayer(dmg: number) { this.hurt += dmg; this.player.hp -= dmg },
  }
  return { eng, msgs }
}
function spawn(eng: any, x: number, y: number, carry: string | null = null) { const e = makeEntity('duller', x, y); eng.map.entities.push(e); initDuller(eng, e, carry); return e }
function run(eng: any, secs: number, each?: (t: number) => void) {
  const dt = 1 / 30
  for (let t = 0; t < secs; t += dt) {
    each?.(t); beginDullerFrame(eng, dt)
    for (const e of eng.map.entities) { if (e.dead) continue; e.attackCd -= dt; e.stateT -= dt; updateDuller(eng, e, dt, Math.hypot(e.x - eng.player.x, e.y - eng.player.y), 1) }
  }
}
const phases = (e: Entity, eng: any, secs: number) => { const seen = new Set<string>(); run(eng, secs, () => seen.add(e.dl!.phase)); return seen }

{ // 隔墙潜伏 → 伸臂 → 拖穿墙壁
  const { eng, msgs } = world(); eng.yaw = Math.PI // 背对墙
  const e = spawn(eng, 6, 1)
  const seen = phases(e, eng, 8)
  ok(seen.has('lurk') && seen.has('reach'), `潜伏到墙后并伸臂（${[...seen].join('→')}）`)
  ok(seen.has('drag') && eng.player.x >= 2, `把玩家拖穿墙壁到另一侧走廊（x=${eng.player.x.toFixed(2)}）`)
  ok(eng.hurt > 0 && eng.player.sanity < 100, `抓取/拖拽造成伤害与理智损失（${eng.hurt}）`)
  ok(msgs.some((m: string) => m.includes('拖')), '提示：被拖进墙')
  ok(seen.has('flee'), '得手后被看清，随即逃离')
}
{ // 伸臂时被注意到 → 缩回、无声逃离
  const { eng, msgs } = world(); eng.yaw = Math.PI
  const e = spawn(eng, 6, 1)
  run(eng, 8, () => { if (e.dl!.phase === 'reach' && e.dl!.reach > 0.3) eng.yaw = Math.atan2(e.y - eng.player.y, e.x - eng.player.x) })
  ok(eng.hurt === 0 && eng.player.x < 1, `回头看见伸出的手臂 → 未被抓（hurt=${eng.hurt}）`)
  ok(msgs.some((m: string) => m.includes('缩了回去')), '提示：被盯住后缩回')
}
{ // 空旷处被直视 → 逃离；刻意走向它 → 逃离
  const { eng } = world(false); eng.yaw = 0
  const e = spawn(eng, 6, 0)
  run(eng, 0.3)
  ok(e.dl!.phase === 'flee', `视线内被直视即逃（${e.dl!.phase}）`)
  const x0 = e.x; run(eng, 1); ok(e.x - x0 > 1.3 * 2, `逃离时急速奔跑（1 秒 ${(e.x - x0).toFixed(2)} 米）`)
  const w2 = world(false); w2.eng.yaw = Math.PI / 2
  const f = spawn(w2.eng, 5, 0)
  run(w2.eng, 1, () => { w2.eng.player.x += 0.07 }) // 侧着身子朝它走（不直视）
  ok(f.dl!.phase === 'flee', `刻意靠近 → 逃离（${f.dl!.phase}）`)
}
{ // 喝杏仁水：不会被抓；正在被拖时立即挣脱
  const { eng } = world(); eng.yaw = Math.PI
  spawn(eng, 6, 1)
  dullerAlmondScent(eng)
  run(eng, 8)
  ok(eng.hurt === 0, '饮用杏仁水后不会被抓')
  const w = world(); w.eng.yaw = Math.PI
  const e = spawn(w.eng, 6, 1)
  run(w.eng, 8, () => { if (e.dl!.phase === 'drag' && e.dl!.t > 0.3) dullerAlmondScent(w.eng) })
  ok(w.eng.player.x < 1 && e.dl!.phase !== 'drag', `拖拽中喝杏仁水 → 挣脱并回到墙这一侧（x=${w.eng.player.x.toFixed(2)}）`)
}
{ // 杏仁水滋中 → 逃离 + 长时间不再狩猎
  const { eng } = world()
  const e = spawn(eng, 3, 1)
  dullerSquirted(eng, e)
  ok(e.dl!.phase === 'flee' && e.dl!.spook >= 30, '杏仁水滋中 → 缩回墙里逃走')
}
{ // 地上的杏仁水：玩家站在旁边就不会被伸手
  const { eng } = world(); eng.yaw = Math.PI
  eng.map.items.push({ id: 1, type: 'almond', x: 0.6, y: 0.3 })
  spawn(eng, 6, 1)
  run(eng, 8)
  ok(eng.hurt === 0, '玩家站在地上的杏仁水旁 → 钝人不伸手')
}
{ // 身上带杏仁水：伸臂前摇更长
  const a = world(); a.eng.yaw = Math.PI
  const e1 = spawn(a.eng, 6, 1); let t1 = 0
  run(a.eng, 8, () => { if (e1.dl!.phase === 'reach') t1 = Math.max(t1, e1.dl!.t) })
  const b = world(); b.eng.yaw = Math.PI; b.eng.almond = 1
  const e2 = spawn(b.eng, 6, 1); let t2 = 0
  run(b.eng, 8, () => { if (e2.dl!.phase === 'reach') t2 = Math.max(t2, e2.dl!.t) })
  ok(t2 > t1 + 0.25, `带着杏仁水时它伸手前会犹豫（${t1.toFixed(2)}s → ${t2.toFixed(2)}s）`)
}
{ // 拖拽中被攻击 → 松手，玩家回到原处
  const { eng } = world(); eng.yaw = Math.PI
  const e = spawn(eng, 6, 1)
  run(eng, 8, () => { if (e.dl!.phase === 'drag' && e.dl!.t > 0.3 && e.hp === e.def.hp) e.hp -= 10 })
  ok(eng.player.x < 1 && e.dl!.phase !== 'drag', `挨打即松手（x=${eng.player.x.toFixed(2)}）`)
}
{ // 携物：按 id 确定性约四成携带，击杀掉落
  const { eng } = world()
  let n = 0
  for (let i = 0; i < 200; i++) { const e = makeEntity('duller', 0, 0); if (initDuller(eng, e).carry) n++ }
  ok(n > 40 && n < 120, `约四成钝人攥着随机物品（${n}/200）`)
  const e = spawn(eng, 3, 0, 'canned')
  ok(dullerDrop(e) === 'canned' && !e.dl!.carry, '被杀时掉落携带物')
}
console.log(fails ? `\n${fails} 项失败` : '\n全部通过')
process.exit(fails ? 1 : 0)
