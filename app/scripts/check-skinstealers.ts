// v77：窃皮者重制——行为机制无头验收（模拟引擎：空旷平面；wall=true 时 x∈[3,4) 为一堵挡视线的墙）
// 运行：npm run check:skinstealers
import { makeEntity, type Entity } from '../src/game/entities'
import { ENTITIES } from '../src/game/entities'
import { beginSkinStealerFrame, borrowLines, initSkinStealer, resetSkinStealerFrame, skinStealerHit, skinStealerTalk, updateSkinStealer, type SkinPhase } from '../src/game/engine/skinStealerAI'
import { bloodParticles } from '../src/game/engine/combat'
import { NPCS } from '../src/game/content/npcs'
let fails = 0
const ok = (c: boolean, m: string) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
function world(wall = false) {
  resetSkinStealerFrame()
  const msgs: string[] = []
  const eng: any = {
    levelDef: { id: 1 },
    player: { x: 0, y: 0, z: 0, hp: 100, flashlight: false },
    map: { entities: [] as Entity[], items: [] as any[], w: 0, h: 0 },
    npcs: [] as any[], particles: [] as any[],
    input: { sprint: false }, dev: { invisible: false }, camShake: 0, hurt: 0, looking: false,
    msg: (t: string) => msgs.push(t),
    los(x0: number, y0: number, x1: number, y1: number) {
      if (!wall) return true
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 20)
      for (let i = 1; i < n; i++) { const x = x0 + (x1 - x0) * (i / n); if (x >= 3 && x < 4) return false }
      return true
    },
    lookingAt() { return this.looking },
    inView() { return this.visible !== false },
    meleeZOk: () => true,
    wanderTarget(e: Entity) { e.targetX = e.x + 0.3; e.targetY = e.y; e.stateT = 3 },
    stepEntity(e: Entity, sp: number, dt: number) { const dx = e.targetX - e.x, dy = e.targetY - e.y, d = Math.hypot(dx, dy); if (d < 0.05) return true; const k = Math.min(d, sp * dt) / d; e.x += dx * k; e.y += dy * k; return false },
    faceToward(e: Entity, x: number, y: number) { e.facing = Math.atan2(y - e.y, x - e.x) },
    hurtPlayer(dmg: number) { this.hurt += dmg; this.player.hp -= dmg },
  }
  return { eng, msgs }
}
function spawn(eng: any, x: number, y: number, phase: SkinPhase) { const e = makeEntity('skinstealer', x, y); eng.map.entities.push(e); initSkinStealer(eng, e, phase); return e }
function run(eng: any, secs: number, each?: (t: number) => void) {
  const dt = 1 / 30
  for (let t = 0; t < secs; t += dt) {
    each?.(t); beginSkinStealerFrame(eng, dt)
    for (const e of eng.map.entities) { if (e.dead) continue; e.attackCd -= dt; e.stateT -= dt; e.lungeT = Math.max(0, e.lungeT - dt); updateSkinStealer(eng, e, dt, Math.hypot(e.x - eng.player.x, e.y - eng.player.y), 1) }
  }
}
const phases = (e: Entity, eng: any, secs: number, each?: (t: number) => void) => { const seen: string[] = []; run(eng, secs, (t) => { each?.(t); if (seen[seen.length - 1] !== e.ss!.phase) seen.push(e.ss!.phase) }); return seen }

ok(ENTITIES.skinstealer.hp === 80 && ENTITIES.skinstealer.damage === 25 && ENTITIES.skinstealer.speed === 2.6, '数值：血量 80 / 伤害 25 / 速度 2.6')
ok(makeEntity('skinstealer', 0, 0).disguised === undefined, '不再伪装成物品（makeEntity 不带 bandage）')

{ // 伪装者 + 落单：装作流浪者走近、嘀咕，近身剥皮暴起，徒手撕扯
  const { eng, msgs } = world()
  const e = spawn(eng, 10, 0, 'skinned')
  ok(e.disguised === 'human', '穿着人皮（disguised=human）')
  let bubbles = new Set<string>()
  const seen = phases(e, eng, 12, () => { if (e.ss!.bubbleT > 0) bubbles.add(e.ss!.bubbleText) })
  ok(seen.join('→').startsWith('skinned→reveal→hunt'), `走近后剥皮现形（${seen.join('→')}）`)
  ok(bubbles.size >= 1 && [...bubbles].every((b) => e.ss!.lines.includes(b)), `头顶气泡来自借来的台词（${[...bubbles].join(' | ')}）`)
  ok(msgs.some((m) => m.includes('翻卷脱落')), '提示：人皮翻卷脱落')
  ok(e.disguised === undefined, '现形后不再伪装')
  ok(eng.hurt >= 25, `徒手撕扯造成伤害（${eng.hurt}）`)
  ok(eng.particles.length > 0 && eng.particles.every((p: any) => p.life <= 1.01), '剥落的人皮只是短暂碎屑（不留尸皮）')
}
{ // 身边有同伴：不下手，只在附近游荡嘀咕
  const { eng } = world()
  eng.npcs.push({ x: 1, y: 1, dead: false })
  const e = spawn(eng, 1.5, 0, 'skinned')
  const seen = phases(e, eng, 10)
  ok(!seen.includes('reveal') && eng.hurt === 0, `不落单时不剥皮、不攻击（${seen.join('→')}）`)
  const h = world(); h.eng.npcs.push({ x: 1, y: 0, dead: false })
  const f = spawn(h.eng, 5, 0, 'hunt')
  run(h.eng, 8)
  ok(h.eng.hurt === 0 && Math.hypot(f.x, f.y) > 4, `饥饿真身在有同伴时保持距离（距离 ${Math.hypot(f.x, f.y).toFixed(1)}）`)
}
{ // 伪装中被打伤：透明的血 → 立刻现形
  const { eng, msgs } = world()
  eng.npcs.push({ x: 0, y: 1, dead: false }) // 有同伴在场，本不会下手
  const e = spawn(eng, 2.5, 0, 'skinned')
  run(eng, 0.2)
  skinStealerHit(eng, e); e.hp -= 10
  run(eng, 0.1)
  ok(e.ss!.phase === 'reveal' && !e.disguised, `被打伤即现形（${e.ss!.phase}）`)
  ok(msgs.some((m) => m.includes('透明')), '提示：血是透明的')
  const pts: any[] = []
  bloodParticles({ particles: pts } as any, 0, 0, true); const clear = pts.map((p) => p.color)
  pts.length = 0; bloodParticles({ particles: pts } as any, 0, 0); const red = pts.map((p) => p.color)
  ok(clear.every((c) => c !== '#b3352b') && red.every((c) => c === '#b3352b'), `窃皮者血液半透明、人类鲜红（${[...new Set(clear)].join(',')} vs ${red[0]}）`)
}
{ // 看不见时模仿人声；搭话只会重复借来的话
  const { eng, msgs } = world(true)
  const e = spawn(eng, 12, 0, 'skinned')
  e.ss!.voiceCd = 0.5
  run(eng, 2)
  ok(msgs.some((m) => m.startsWith('远处有人在说：「')), `隔墙模仿人声（${msgs.find((m) => m.startsWith('远处')) ?? '无'}）`)
  const w = world(); w.eng.npcs.push({ x: 0, y: 1, dead: false })
  const f = spawn(w.eng, 1.5, 0, 'skinned')
  const said: string[] = []
  for (let i = 0; i < 5; i++) { skinStealerTalk(w.eng, f); said.push(f.ss!.bubbleText) }
  ok(new Set(said).size <= 3 && said[0] === said[3], `搭话：几句话反复循环（${said.join(' / ')}）`)
  const pool = new Set(Object.values(NPCS).flatMap((n) => n.idle ?? []))
  const lines = borrowLines(12345)
  ok(lines.filter((l) => pool.has(l)).length === 2 && !pool.has(lines[2]), `台词 = 两句 NPC 自言自语 + 一句外语（${lines.join(' / ')}）`)
}
{ // 温顺：慢慢走过不会惊动；近处奔跑 / 贴身逗留 / 手电照脸会激怒
  const { eng } = world()
  const e = spawn(eng, 4, 0, 'docile')
  run(eng, 6, () => { eng.player.x += 0.02 }) // 慢慢走近到 ~0.4 米外再离开前
  ok(e.ss!.phase === 'docile' && eng.hurt === 0, `慢慢经过不会惊动（${e.ss!.phase}）`)
  const a = world(); const ea = spawn(a.eng, 3, 0, 'docile')
  run(a.eng, 1, () => { a.eng.input.sprint = true; a.eng.player.y += 0.2 })
  ok(ea.ss!.phase === 'rage', `近处奔跑 → 激怒（${ea.ss!.phase}）`)
  const b = world(); const eb = spawn(b.eng, 6, 0, 'docile'); b.eng.player.flashlight = true; b.eng.looking = true
  const pb = phases(eb, b.eng, 1.5)
  ok(!pb.includes('rage'), '手电照脸不到 2 秒：还没被激怒')
  run(b.eng, 1)
  ok(eb.ss!.phase === 'rage', `手电持续照脸约 2 秒 → 激怒（${eb.ss!.phase}）`)
  const c = world(); const ec = spawn(c.eng, 1.2, 0, 'docile'); ec.ss!.timer = 999
  run(c.eng, 4, () => { ec.x = 1.2; ec.y = 0 })
  ok(ec.ss!.phase === 'rage', `贴身逗留 3 秒 → 激怒（${ec.ss!.phase}）`)
  run(c.eng, 4)
  ok(c.eng.hurt > 0, '被激怒后攻击')
  const d = world(); const ed = spawn(d.eng, 3, 0, 'docile'); ed.hp -= 5
  run(d.eng, 0.1); ok(ed.ss!.phase === 'rage', '攻击温顺个体 → 激怒')
}
{ // 生命周期：人皮被消化 → 温顺 → 饥饿 → 离屏进食换上新人皮
  const { eng } = world(true)
  const e = spawn(eng, 30, 0, 'skinned')
  e.ss!.timer = 1
  const s0 = e.ss!.skinSeed
  run(eng, 2)
  ok(e.ss!.phase === 'docile' && !e.disguised, `人皮被消化 → 温顺真身（${e.ss!.phase}）`)
  e.ss!.timer = 1
  run(eng, 2)
  ok(e.ss!.phase === 'hunt', `温顺期结束 → 饥饿（${e.ss!.phase}）`)
  e.ss!.timer = 40
  run(eng, 30)
  ok(e.ss!.phase === 'skinned' && e.disguised === 'human' && e.ss!.skinSeed !== s0, `看不见时进食，换上新的人皮（seed ${s0} → ${e.ss!.skinSeed}）`)
  const w = world(); const f = spawn(w.eng, 6, 0, 'skinned'); w.eng.npcs.push({ x: 0, y: 1, dead: false }); f.ss!.timer = 0.5
  run(w.eng, 3)
  ok(f.ss!.phase === 'skinned', '被玩家看着时不会当面消化人皮')
}

{ // Integration corrections: view direction, cooldown reset and immediate hit response.
  const {eng}=world();const e=spawn(eng,8,0,'skinned')
  eng.npcs.push({x:0,y:1,floor:0});e.ss!.timer=.01
  run(eng,.1);ok(e.ss!.phase==='skinned','被注视时保留人皮')
  eng.visible=false;run(eng,.1);ok(e.ss!.phase==='docile','视线之外才消化人皮')
  initSkinStealer(eng,e,'rage');eng.dev.invisible=true;run(eng,10.2)
  ok(e.ss!.phase==='docile'&&e.ss!.timer>140,'脱离激怒后重新获得完整温顺期')
  eng.dev.invisible=false;initSkinStealer(eng,e,'skinned');e.hp-=2;e.stunT=.6;skinStealerHit(eng,e)
  ok(e.ss!.phase==='reveal'&&!e.disguised,'受击钩子立即揭露受眩晕的伪装')
  const pts:any[]=[];bloodParticles({particles:pts} as any,0,0,true)
  ok(pts.length===8&&pts.every(p=>p.opacity>0&&p.opacity<.5),'透明血液具有低于 0.5 的实际 alpha')
}

console.log(fails ? `\n${fails} 项失败` : '\n全部通过')
if (fails) process.exit(1)
