// 攻击优化回归校验（v28）：
// 1) 贴脸实体（与玩家几乎重合、方向退化）也能被攻击命中——修复"近身打不到"
// 2) aimEntity：攻击范围内朝向锥内的实体可被准星锁定，背后/超程为 null
// 3) 可投掷道具：订书机落地可捡回且引怪；汽油罐范围伤害；电容器电击眩晕；氙气玻璃珠引动引路者
;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 800, innerHeight: 600 }
;(globalThis as unknown as Record<string, unknown>).document = {
  createElement: () => ({ width: 1, height: 1, getContext: () => null, style: {} }),
  getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} },
}
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
;(globalThis as unknown as Record<string, unknown>).performance = globalThis.performance ?? { now: () => Date.now() }

const { engine } = await import('../src/game/engine.ts')
const { makeEntity } = await import('../src/game/entities/index.ts')

let fail = 0
const bad = (m: string) => { console.log('  ✗ ' + m); fail++ }
const ok = (m: string) => console.log('  ✓ ' + m)

engine.newRun(20260728, 'normal')
engine.paused = false
engine.devJump(0)
engine.introT = 0
engine.dev.god = true // 只测攻击方，不被实体反杀
if (!engine.devTestField()) { bad('devTestField 失败'); process.exit(1) }
for (let f = 0; f < 5; f++) engine.update(0.02)
const m = engine.map!
const p = engine.player

// ---------- 1) 贴脸命中 ----------
{
  const e = makeEntity('hound', p.x + 0.05, p.y + 0.05) // 几乎与玩家重合
  m.entities.push(e)
  p.facing = Math.PI * 0.7 // 朝向与实体方向无关（退化情形）
  const hp0 = e.hp
  engine.input.attack = true
  engine.update(0.02)
  if (e.hp >= hp0) bad('贴脸实体未被命中（近身打不到的 bug 仍在）')
  else ok(`贴脸实体被命中（HP ${hp0} → ${e.hp}）`)
  e.hp = 0; e.dead = true // 清场
}

// ---------- 2) aimEntity ----------
{
  const e = makeEntity('hound', p.x + 1.5, p.y)
  m.entities.push(e)
  p.facing = 0 // 面向 +x
  if (engine.aimEntity() !== e) bad('前方 1.5m 实体未被 aimEntity 锁定')
  else ok('前方实体可被准星锁定')
  p.facing = Math.PI // 背向
  if (engine.aimEntity() !== null) bad('背后实体被误锁定')
  else ok('背后实体不被锁定')
  p.facing = 0
  e.x = p.x + 5; // 超程
  if (engine.aimEntity() !== null) bad('5m 外实体被误锁定（攻击距离异常）')
  else ok('超程实体不被锁定')
  e.hp = 0; e.dead = true
}

// ---------- 3) 可投掷道具 ----------
function giveAndThrow(type: string) {
  p.hotbar[p.selected] = { type, count: 1 }
  engine.input.attack = true
  engine.update(0.02)
  if (p.hotbar[p.selected]) bad(`${type} 投掷后未消耗`)
  if (engine.projectiles.length !== 1) { bad(`${type} 未生成投掷物（projectiles=${engine.projectiles.length}）`); return }
  let frames = 0
  while (engine.projectiles.length > 0 && frames++ < 300) engine.update(0.02)
  if (frames >= 300) bad(`${type} 投掷物 300 帧未落地`)
}

// 订书机：落地后地上出现该物品，附近实体进入 investigate
{
  const e = makeEntity('hound', p.x + 12, p.y)
  e.state = 'wander'
  m.entities.push(e)
  p.facing = 0
  giveAndThrow('stapler')
  const onGround = m.items.find((it) => it.type === 'stapler')
  if (!onGround) bad('订书机落地后不可捡回')
  else ok(`订书机落地可捡回（落点 +${(onGround.x - p.x).toFixed(1)}m）`)
  if (e.state !== 'investigate') bad(`订书机未引怪（实体状态 ${e.state}）`)
  else ok('订书机声响吸引实体（investigate）')
  e.hp = 0; e.dead = true
}

// 汽油罐：落点 3.2m 内实体掉血
{
  const e = makeEntity('hound', p.x + 7.5, p.y) // 射程约 7.8m，落点附近
  m.entities.push(e)
  p.facing = 0
  const hp0 = e.hp
  giveAndThrow('gas')
  if (e.hp >= hp0) bad(`汽油罐未造成范围伤害（HP ${hp0} → ${e.hp}，落点距实体未知）`)
  else ok(`汽油罐范围伤害生效（HP ${hp0} → ${e.hp}）`)
  e.hp = 0; e.dead = true
}

// 电容器：电击 + 眩晕
{
  const e = makeEntity('hound', p.x + 7.5, p.y)
  m.entities.push(e)
  p.facing = 0
  giveAndThrow('capacitor')
  if (e.stunT <= 0) bad('电容器未造成眩晕')
  else ok(`电容器电击眩晕生效（stunT=${e.stunT.toFixed(1)}s，HP=${e.hp}）`)
  e.hp = 0; e.dead = true
}

// 氙气玻璃珠：引路者被吸引（investigate + stateT=10），其他实体不被专门吸引
{
  const g = makeEntity('lightguide', p.x + 20, p.y)
  g.state = 'wander'
  m.entities.push(g)
  p.facing = 0
  giveAndThrow('xenonmarble')
  const onGround = m.items.find((it) => it.type === 'xenonmarble')
  if (!onGround) bad('氙气玻璃珠落地后不可捡回')
  if (g.state !== 'investigate') bad(`引路者未被玻璃珠吸引（状态 ${g.state}）`)
  else ok('引路者被氙气玻璃珠吸引（investigate）')
  g.hp = 0; g.dead = true
}

console.log(fail === 0 ? '\n✓ 攻击/投掷校验全部通过' : `\n✗ ${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
