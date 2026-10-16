// v78：悲尸重制——行为机制无头验收（模拟引擎：空旷平面；可放一扇门 x∈[3,3.2) 挡路/挡视线）
// 运行：npm run check:wretches
import { makeEntity, ENTITIES, type Entity } from '../src/game/entities'
import { initWretch, resetWretchFrame, updateWretch, wretchHear, wretchKind, wretchLook, wretchCanBash, WRETCH_STATS, type WretchKind } from '../src/game/engine/wretchAI'
import { bloodParticles } from '../src/game/engine/combat'
import { LEVELS } from '../src/game/levels'
const originalRandom = Math.random
let randomSeed = 7815
Math.random = () => { randomSeed = Math.imul(randomSeed, 1664525) + 1013904223 | 0; return (randomSeed >>> 0) / 4294967296 }
let fails = 0
const ok = (c: boolean, m: string) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
function world(door?: Record<string, unknown>, kind = 'hoteldoor') {
  resetWretchFrame()
  const msgs: string[] = []
  const structures: any[] = door ? [{ kind, x: 3, y: -1, w: 0.2, h: 2, solid: true, data: { ...door } }] : []
  const blocked = (x: number) => structures.some((s) => s.solid && x >= s.x - 0.3 && x < s.x + s.w + 0.3)
  const eng: any = {
    levelDef: { id: 1 },
    player: { x: 0, y: 0, z: 0, hp: 100, flashlight: false },
    map: { entities: [] as Entity[], items: [] as any[], structures, w: 0, h: 0 },
    npcs: [] as any[], particles: [] as any[], events: [] as any[],
    input: { sprint: false }, dev: { invisible: false }, camShake: 0, hurt: 0, looking: false,
    msg: (t: string) => msgs.push(t),
    emit(ev: any) { this.events.push(ev) },
    los(x0: number, _y0: number, x1: number) {
      const n = 40
      for (let i = 1; i < n; i++) { const x = x0 + (x1 - x0) * (i / n); if (structures.some((s) => s.solid && x >= s.x && x < s.x + s.w)) return false }
      return true
    },
    lookingAt() { return this.looking },
    meleeZOk: () => true,
    wanderTarget(e: Entity) { e.targetX = e.x + 0.3; e.targetY = e.y; e.stateT = 3 },
    stepEntity(e: Entity, sp: number, dt: number) {
      const dx = e.targetX - e.x, dy = e.targetY - e.y, d = Math.hypot(dx, dy); if (d < 0.05) return true
      const k = Math.min(d, sp * dt) / d, nx = e.x + dx * k
      if (blocked(nx) && !blocked(e.x)) return true
      e.x = nx; e.y += dy * k; return false
    },
    faceToward(e: Entity, x: number, y: number) { e.facing = Math.atan2(y - e.y, x - e.x) },
    hurtPlayer(dmg: number) { this.hurt += dmg; this.player.hp -= dmg },
  }
  return { eng, msgs }
}
const idOf = (k: WretchKind, skip = 0) => { let n = 0; for (let id = 1; ; id++) if (wretchKind(id) === k && n++ === skip) return id }
function spawn(eng: any, kind: WretchKind, x: number, y: number, skip = 0) { const e = makeEntity('wretch', x, y); e.id = idOf(kind, skip); eng.map.entities.push(e); initWretch(eng, e); return e }
function run(eng: any, secs: number, each?: (t: number) => void) {
  const dt = 1 / 30
  for (let t = 0; t < secs; t += dt) {
    each?.(t)
    for (const e of eng.map.entities) { if (e.dead) continue; e.attackCd -= dt; e.stateT -= dt; e.lungeT = Math.max(0, e.lungeT - dt); updateWretch(eng, e, dt, Math.hypot(e.x - eng.player.x, e.y - eng.player.y), 1) }
  }
}

// —— 变体分布与外观 ——
{
  const n: Record<string, number> = { shambler: 0, sprinter: 0, smart: 0, mutant: 0 }
  for (let id = 1; id <= 20000; id++) n[wretchKind(id)]++
  const pct = (k: string) => n[k] / 200
  ok(Math.abs(pct('shambler') - 70) < 2 && Math.abs(pct('sprinter') - 20) < 2 && Math.abs(pct('smart') - 5) < 1 && Math.abs(pct('mutant') - 5) < 1, `变体分布 蹒跚 ${pct('shambler')}% / 疾行 ${pct('sprinter')}% / 有智 ${pct('smart')}% / 突变 ${pct('mutant')}%`)
  let bad = 0
  for (let id = 1; id <= 20000; id++) { const L = wretchLook(id); if (L.kind === 'mutant') { const m = L.mutant!; if ((m.eyes ? 1 : 0) + (m.arm ? 1 : 0) + (m.wings ? 1 : 0) + (m.jaw ? 1 : 0) < 2) bad++ } if ((L.kind === 'smart') !== L.pipe) bad++ }
  ok(bad === 0, '突变个体至少两处突变；只有有智型拿铁管')
  ok(wretchKind(1234) === wretchKind(1234), '变体由 id 决定')
}
// —— 数值 ——
{
  const { eng } = world()
  const hp = (['shambler', 'sprinter', 'smart', 'mutant'] as WretchKind[]).map((k) => spawn(eng, k, 30, 0).hp)
  ok(hp.join('/') === '75/50/85/110', `各变体血量（${hp.join('/')}）`)
  ok(ENTITIES.wretch.hp === 75 && ENTITIES.wretch.damage === 20, '图鉴基础数值：血量 75 / 伤害 20')
}
// —— 蹒跚型：看见就追、抓挠伤人；低沉叫声提示 ——
{
  const { eng, msgs } = world()
  const e = spawn(eng, 'shambler', 5, 0)
  run(eng, 8)
  ok(e.state === 'chase', '蹒跚型看见玩家后追上来')
  ok(eng.hurt >= 20, `抓挠造成伤害（${eng.hurt}）`)
  ok(msgs.some((m) => m.includes('低沉')), '低沉的咯咯声 → 提示是迟缓的悲尸')
}
// —— 视距：迟缓型 10m 外看不见；听见响动后循声而来 ——
{
  const { eng } = world()
  const e = spawn(eng, 'shambler', 10, 0)
  run(eng, 2)
  ok(e.state === 'wander', '迟缓型 10m 外没注意到玩家（视距 7m）')
  wretchHear(eng, e, 0, 0, 12, true)
  run(eng, 3)
  ok(e.state === 'investigate' || e.state === 'chase', `听见奔跑的响动循声而来（${e.state}）`)
}
// —— 疾行型比蹒跚型快得多，冲刺—喘息节奏 ——
{
  const { eng } = world()
  eng.player.x = -40
  const a = spawn(eng, 'shambler', 0, 2), b = spawn(eng, 'sprinter', 0, -2)
  a.wr!.lostT = 0; b.wr!.lostT = 0; a.wr!.lastX = -40; b.wr!.lastX = -40; a.wr!.alertT = b.wr!.alertT = 30
  run(eng, 4)
  ok(-b.x > -a.x * 2, `疾行型 4 秒跑出 ${(-b.x).toFixed(1)}m，蹒跚型 ${(-a.x).toFixed(1)}m`)
}
// —— 蜂巢呼应：一只看见，附近同伴一齐得知位置 ——
{
  const { eng } = world()
  const seer = spawn(eng, 'shambler', 5, 0, 1), mate = spawn(eng, 'shambler', 14, 5, 2)
  run(eng, 0.2)
  ok(mate.wr!.alertT > 0 && mate.wr!.lostT < 2, '同群同伴被呼应（16m 内）')
  ok(mate.wr!.lastX === eng.player.x && mate.wr!.lastY === eng.player.y, '呼应传递刚刚看见的玩家位置')
  run(eng, 3)
  ok(mate.x < 14, `同伴朝玩家方向移动（x ${mate.x.toFixed(1)}）`)
  void seer
}
// —— 撞门：能打开的门撞开、锁住的门撞不开 ——
{
  const { eng, msgs } = world({})
  const e = spawn(eng, 'shambler', 6, 0)
  e.wr!.lastX = 0; e.wr!.lastY = 0; e.wr!.lostT = 0; e.wr!.alertT = 30
  let bashing = false
  run(eng, 10, () => { if (e.wr!.bashS) bashing = true })
  const door = eng.map.structures[0]
  ok(bashing && door.data.open === 1 && !door.solid, '追猎中被普通房门挡住 → 撞开')
  ok(msgs.some((m) => m.includes('撞开')), '提示：门被撞开')
}
{
  const { eng, msgs } = world({ locked: 1 })
  const e = spawn(eng, 'mutant', 6, 0)
  e.wr!.lastX = 0; e.wr!.lostT = 0; e.wr!.alertT = 30
  run(eng, 10)
  ok(eng.map.structures[0].solid && !eng.map.structures[0].data.open, '上锁的门撞不开（突变型也不行）')
  ok(msgs.some((m) => m.includes('锁死')), '提示：撞不开锁死的门')
}
{
  const { eng } = world({ sealed: 1 })
  ok(!wretchCanBash(eng.map.structures[0]), '封死的门不在可撞之列')
  ok(wretchCanBash({ kind: 'bargate', x: 0, y: 0, w: 1, h: 1, solid: true, data: {} } as any) && wretchCanBash({ kind: 'inkdoor', x: 0, y: 0, w: 1, h: 1, solid: true, data: {} } as any), '铁栅门、墨黑金属门可撞开')
  ok(!wretchCanBash({ kind: 'rollerdoor', x: 0, y: 0, w: 1, h: 1, solid: true, data: { locked: 1 } } as any) && !wretchCanBash({ kind: 'hoteldoor', x: 0, y: 0, w: 1, h: 1, solid: true, data: { careerDoor: 1 } } as any), '锁住的卷帘门、需要资格的门不可撞')
}
{
  const { eng, msgs } = world({})
  const e = spawn(eng, 'smart', 6, 0)
  e.wr!.lastX = 0; e.wr!.lostT = 0; e.wr!.alertT = 30
  let t0 = -1
  run(eng, 6, (t) => { if (t0 < 0 && !eng.map.structures[0].solid) t0 = t })
  ok(t0 > 0 && t0 < 3.5, `有智型直接拧开门（${t0.toFixed(1)}s）`)
  ok(msgs.some((m) => m.includes('会开门')), '提示：它会开门')
}
// —— 有智型：躲手电、铁管重击、高音节奏的叫声 ——
{
  const { eng, msgs } = world()
  eng.player.flashlight = true; eng.looking = true
  const e = spawn(eng, 'smart', 6, 0)
  let dodged = false
  run(eng, 10, () => { if (e.wr!.dodgeT > 0) dodged = true })
  ok(dodged, '有智型被手电照到会闪到侧面')
  ok(eng.hurt >= 26, `铁管重击（${eng.hurt}）`)
  ok(msgs.some((m) => m.includes('有智慧')), '有节奏的高音叫声 → 提示有智慧')
}
// —— 丢失目标：去最后位置找，找不到就回到徘徊 ——
{
  const { eng } = world()
  const e = spawn(eng, 'shambler', 5, 0)
  run(eng, 0.5)
  eng.player.x = 200
  run(eng, 25)
  ok(e.state === 'wander', '跟丢后回到漫无目的的徘徊')
}
// —— 血液与栖息地 ——
{
  const { eng } = world()
  bloodParticles(eng, 0, 0, 'wretch')
  ok(eng.particles.length > 8 && eng.particles.every((p: any) => p.color === '#6e2a1c' || p.color === '#5a3a16'), '受击溅出红褐稠液（混着棕色淤泥）')
  const habitat = (id: number) => (LEVELS.find((l) => l.id === id) as any)?.entities?.find((s: any) => s.type === 'wretch')
  const want: Record<number, number> = { 1: 10, 2: 6, 3: 1, 8: 9, 9: 9 }
  ok(Object.entries(want).every(([id, w]) => habitat(+id)?.w === w), '栖息地与权重不变（L1/L2/L3/L8/L9）')
}
ok(WRETCH_STATS.sprinter.voice[0] > 1 && WRETCH_STATS.smart.voice[0] > 1 && WRETCH_STATS.shambler.voice[0] < 1, '叫声音高：迟缓型低沉，疾行/有智型高音')

// Integration guards: keep reinitialization, restricted doors and skinstealer blood intact.
{
 const {eng}=world({}); const e=spawn(eng,'mutant',4,0)
 e.hp=75;initWretch(eng,e)
 ok(e.hp===75&&e.def.hp===110&&ENTITIES.wretch.hp===75,'重建运行时状态不治疗残血，基础图鉴定义不被污染')
 const door=eng.map.structures[0]
 e.wr!.bashS=door;e.wr!.bashT=3;e.wr!.alertT=30;door.data.locked=1
 run(eng,.1);ok(door.solid&&!door.data.open&&!e.wr!.bashS,'撞门期间上锁立即阻止开门')
 for(const kind of ['hoteldoor','bargate','inkdoor','glassdoor','rollerdoor'])for(const flag of ['locked','sealed','careerDoor','tradeDoor','l7porch','mothNest']){
  ok(!wretchCanBash({...door,kind,data:{[flag]:1}}),`${kind} 尊重 ${flag}`)
 }
 const {eng:upper}=world({},'hoteldoor');upper.map.structures[0].floor=1
 const below=spawn(upper,'shambler',4,0);below.wr!.lastX=0;below.wr!.alertT=30
 run(upper,3);ok(upper.map.structures[0].solid&&!below.wr!.bashS,'不同楼层的门不会被隔层撞开')
 eng.particles=[];bloodParticles(eng,0,0,true)
 ok(eng.particles.length===8&&eng.particles.every((p:any)=>p.opacity===.28),'窃皮者透明血液保留')
}

console.log(fails ? `\n${fails} 项失败` : '\n全部通过')
Math.random = originalRandom
process.exit(fails ? 1 : 0)
