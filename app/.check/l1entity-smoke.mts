// v33：Level 1 实体特性验证——肢团循声冲撞/蹲行规避、猎犬直视威慑、笑魇停电生成与趋光、
// 手臂停电伸出、钝人穿墙
;(globalThis as unknown as Record<string, unknown>).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
;(globalThis as unknown as Record<string, unknown>).document = { createElement: () => ({ getContext: () => null, style: {} }), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } }
const { engine } = await import('../src/game/engine.ts')
const { makeEntity } = await import('../src/game/entities/index.ts')
const { tileAt } = await import('../src/game/mapgen.ts')
const { look } = await import('../src/game/renderer/shared.ts')

let fail = 0
const bad = (m: string) => { console.log('  ✗ ' + m); fail++ }
const ok = (m: string) => console.log('  ✓ ' + m)
const run = (frames: number) => { for (let f = 0; f < frames; f++) engine.update(0.02) }
const eng = engine as unknown as {
  noiseEvent: (x: number, y: number, r: number, s: boolean) => void
  applyBlackout: () => void
  los: (x0: number, y0: number, x1: number, y1: number) => boolean
}

const setup = (seed: number) => {
  engine.newRun(seed, 'normal'); engine.paused = false
  engine.devJump(1)
  engine.player.hp = 100
  engine.player.flashlight = false; engine.player.battery = 100; engine.player.flashJamT = 0
  engine.input.mx = 0; engine.input.my = 0; engine.input.sprint = false; engine.input.crouch = false
  engine.map!.entities.length = 0 // 清场，只留测试实体
  return engine.map!
}

// ---- 1) 肢团：失明，听见声音高速冲向声源 ----
{
  const m = setup(777)
  const p = engine.player
  const clump = makeEntity('clump', p.x + 6, p.y)
  m.entities.push(clump)
  eng.noiseEvent(p.x + 2, p.y, 6, false) // 玩家侧 2 格处发出声响
  if (clump.state === 'chase' && Math.abs(clump.targetX - (p.x + 2)) < 0.01) ok('肢团：听见声音即进入 chase 并锁定声源点')
  else bad(`肢团未循声冲撞：state=${clump.state}`)
  run(30)
  if (clump.state === 'chase' || clump.state === 'attack') ok('肢团：chase 不被「丢失视野」打断（sight=0 仍持续冲向声源）')
  else bad(`肢团 chase 被错误降级：state=${clump.state}`)
}

// ---- 2) 蹲行无声：蹲走经过的肢团不被惊动；站立行走则会 ----
{
  const hear = (crouch: boolean) => {
    const m = setup(778)
    const p = engine.player
    engine.dev.noclip = true // 保证移动不被地形阻断
    const clump = makeEntity('clump', p.x + 3, p.y)
    m.entities.push(clump)
    engine.input.crouch = crouch
    engine.input.mx = 0; engine.input.my = 1 // 横向走过（不逼近肢团），距离保持 ≥3 格
    let heard = false
    for (let f = 0; f < 80; f++) { // 走 ~1.6s，触发多次脚步噪音；逐帧观察避免错过 chase 窗口
      engine.update(0.02)
      if (clump.state === 'chase' || clump.state === 'attack' || clump.state === 'investigate') { heard = true; break }
    }
    engine.input.my = 0; engine.input.crouch = false
    engine.dev.noclip = false
    return heard
  }
  const loud = hear(false), quiet = hear(true)
  if (loud && !quiet) ok('肢团：站立行走被听见，蹲行无声规避')
  else bad(`蹲行规避异常：站立=${loud}（应 true）蹲行=${quiet}（应 false）`)
}

// ---- 3) 猎犬：实时直视 + 持续噪音 → 持续定身；停止发声或移开视线即恢复 ----
{
  const m = setup(779)
  const p = engine.player
  const hound = makeEntity('hound', p.x + 5, p.y)
  m.entities.push(hound)
  const ang = Math.atan2(hound.y - p.y, hound.x - p.x)
  look.yaw = ang + Math.PI // 引擎前向 = (-cos yaw, -sin yaw)，正对猎犬
  if (!eng.los(p.x, p.y, hound.x, hound.y)) {
    bad('猎犬测试：生成点视线被墙挡，换 seed')
  } else {
    // a) 持续直视 + 持续发声（每 10 帧补一次噪音模拟奔踏/挥击）→ 冻结且纹丝不动
    const hx = hound.x, hy = hound.y
    for (let f = 0; f < 60; f++) {
      if (f % 10 === 0) eng.noiseEvent(p.x, p.y, 8, false)
      engine.update(0.02)
    }
    if (hound.stunT > 0 && Math.hypot(hound.x - hx, hound.y - hy) < 0.01) ok('猎犬：直视+持续噪音 → 持续定身（位置不变）')
    else bad(`猎犬持续威慑失败：stunT=${hound.stunT.toFixed(2)} 位移=${Math.hypot(hound.x - hx, hound.y - hy).toFixed(2)}`)
    // b) 停止发声（保持直视）→ 噪音残余 0.8s 耗尽后恢复行动
    for (let f = 0; f < 70; f++) engine.update(0.02) // 1.4s，不再制造噪音
    if (hound.stunT <= 0 && (hound.state === 'chase' || hound.state === 'attack' || Math.hypot(hound.x - hx, hound.y - hy) > 0.05)) ok('猎犬：停止发声后恢复行动')
    else bad(`猎犬未恢复：stunT=${hound.stunT.toFixed(2)} state=${hound.state}`)
    // c) 只发声、移开视线 → 不定身
    hound.stunT = 0; hound.state = 'wander'; hound.x = p.x + 5; hound.y = p.y
    look.yaw = ang // 背对（前向反转 180°）
    for (let f = 0; f < 30; f++) {
      if (f % 10 === 0) eng.noiseEvent(p.x, p.y, 8, false)
      engine.update(0.02)
    }
    if (hound.stunT <= 0) ok('猎犬：移开视线后噪音不再威慑')
    else bad('猎犬被背对威慑，视线判定失效')
  }
}

// ---- 4) 笑魇：停电生成 → 趋光（关灯不索敌）→ 复电消散 ----
{
  const m = setup(780)
  engine.blackoutPendingDur = 20
  eng.applyBlackout()
  const smilers = m.entities.filter((e) => e.def.type === 'smiler' && e.blackoutSpawn)
  if (smilers.length >= 2) ok(`笑魇：停电生成 ${smilers.length} 只（打标 blackoutSpawn）`)
  else bad(`笑魇停电生成失败：${smilers.length} 只`)
  // 关灯时不索敌
  const p = engine.player
  const s0 = smilers[0]
  s0.x = p.x + 3; s0.y = p.y; s0.state = 'wander'
  engine.player.flashlight = false
  run(60)
  if (s0.state !== 'chase' && s0.state !== 'attack') ok('笑魇：玩家关灯时不靠近（趋光性）')
  else bad(`笑魇关灯仍索敌：state=${s0.state}`)
  // 开灯后可索敌（需要视线——若被墙挡则跳过此断言）
  engine.player.flashlight = true; engine.player.battery = 100
  run(60)
  engine.endBlackout()
  if (smilers.every((e) => e.dead)) ok('笑魇：灯光恢复后全部退散')
  else bad('笑魇复电后未退散')
  engine.player.flashlight = false
}

// ---- 5) 手臂：平时蛰伏（hidden），停电且玩家靠近时伸出并抓击，复电缩回 ----
{
  const m = setup(781)
  const p = engine.player
  const arm = makeEntity('arms', p.x + 1.5, p.y)
  m.entities.push(arm)
  if (arm.hidden === true) ok('手臂：初始蛰伏于通风管内（hidden）')
  else bad('手臂初始未蛰伏')
  run(30)
  if (arm.hidden === true) ok('手臂：电力正常时不伸出')
  else bad('手臂未停电即伸出')
  m.inf!.blackout = true // 模拟「闪烁」停电
  run(30)
  if (arm.hidden === undefined) ok('手臂：停电且玩家靠近 → 伸出猎捕')
  else bad('手臂停电时未伸出')
  const hp0 = engine.player.hp
  run(120) // 站在臂展内 2.4s
  if (engine.player.hp < hp0) ok(`手臂：抓击命中（HP ${hp0} → ${engine.player.hp.toFixed(0)}）`)
  else bad('手臂未发动抓击')
  m.inf!.blackout = false
  engine.player.x += 8 // 玩家远离
  run(30)
  if (arm.hidden === true) ok('手臂：复电/远离后缩回管内')
  else bad('手臂复电后未缩回')
}

// ---- 6) 钝人：穿墙行动 ----
{
  const m = setup(782)
  const p = engine.player
  // 找一面「玩家侧是地板、背面也是地板」的墙
  let wall: { x: number; y: number } | null = null
  for (let ty = 1; ty < m.h - 1 && !wall; ty++)
    for (let tx = 1; tx < m.w - 1 && !wall; tx++)
      if (tileAt(m, tx, ty) !== 1 && tileAt(m, tx - 1, ty) === 1 && tileAt(m, tx + 1, ty) === 1) wall = { x: tx, y: ty }
  if (!wall) {
    bad('未找到可测试穿墙的墙瓦片')
  } else {
    const duller = makeEntity('duller', wall.x - 0.5, wall.y + 0.5)
    m.entities.push(duller)
    duller.state = 'investigate'
    duller.targetX = wall.x + 1.5; duller.targetY = wall.y + 0.5
    duller.stateT = 10
    run(150) // 3s，0.7×1.3≈0.9 格/s —— 足够穿过 1 格墙
    if (duller.x > wall.x + 0.5) ok(`钝人：穿墙行动（x ${(wall.x - 0.5).toFixed(1)} → ${duller.x.toFixed(2)}，墙在 ${wall.x}）`)
    else bad(`钝人被墙挡住：x=${duller.x.toFixed(2)}，墙在 ${wall.x}`)
  }
}

// ---- 7) 无限窗口平移：追击实体不消失、不瞬移 ----
{
  const m = setup(783)
  const p = engine.player
  const inf = m.inf!
  const hound = makeEntity('hound', p.x + 3, p.y)
  m.entities.push(hound)
  // 挂到当前所在 chunk（模拟正常的 chunk 生成实体——消失 bug 的受害者）
  const homeKey = `${Math.floor((inf.ox + hound.x) / 32)},${Math.floor((inf.oy + hound.y) / 32)}`
  inf.chunks.get(homeKey)?.entities.push(hound)
  const wx0 = inf.ox + hound.x, wy0 = inf.oy + hound.y // 世界坐标
  // 玩家与追击实体一起移动 3 个 chunk——原归属 chunk 必定掉出窗口被卸载
  engine.dev.noclip = true
  engine.player.x += 96; hound.x += 96
  const wxE = wx0 + 96, wyE = wy0 // 手动移动后的世界坐标基准
  run(2)
  engine.dev.noclip = false
  if (!m.entities.includes(hound)) bad('窗口平移后追击实体被随原 chunk 卸载消失')
  else {
    const wx1 = inf.ox + hound.x, wy1 = inf.oy + hound.y
    // 容差 0.5：2 帧内实体 AI 自身会移动一小段
    if (Math.abs(wx1 - wxE) > 0.5 || Math.abs(wy1 - wyE) > 0.5) bad(`窗口平移后实体瞬移：世界坐标 (${wxE.toFixed(1)},${wyE.toFixed(1)}) → (${wx1.toFixed(1)},${wy1.toFixed(1)})`)
    else ok('窗口平移：追击实体改挂当前 chunk 存活，世界坐标保持（不消失、不瞬移）')
  }
}

console.log(fail === 0 ? '\n✓ L1 实体特性校验全部通过' : `\n✗ ${fail} 项失败`)
process.exit(fail ? 1 : 0)
