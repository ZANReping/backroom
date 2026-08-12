// 引擎冒烟：逐层加载 + 模拟若干秒游戏循环 + 走通 L11 → L601 → 真结局
;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 800, innerHeight: 600 }
;(globalThis as unknown as Record<string, unknown>).document = {
  createElement: () => ({ width: 1, height: 1, getContext: () => null, style: {} }),
  getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} },
}
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
;(globalThis as unknown as Record<string, unknown>).performance = globalThis.performance ?? { now: () => Date.now() }

const { engine } = await import('../src/game/engine.ts')
const { look } = await import('../src/game/core/renderer3d.ts') // v50 起 facing=视角 yaw 每帧覆写：设定朝向需同步 look.yaw
const { LEVELS, levelNo, WIN_TAPES } = await import('../src/game/levels/index.ts')

let fail = 0
const bad = (m: string) => { console.log('  ✗ ' + m); fail++ }

engine.newRun(20260726, 'normal')
engine.paused = false

// 逐层：跳到每一层，跑 400 帧（约 8 秒），确认不崩、玩家仍在合法位置
for (let id = 0; id < LEVELS.length; id++) {
  try {
    engine.devJump(id)
  } catch (e) { bad(`devJump(${id}) 抛异常：${(e as Error).message}`); continue }
  engine.player.hp = 100; engine.player.sanity = 100; engine.player.hunger = 100
  const def = LEVELS[id]
  const startX = engine.player.x, startY = engine.player.y
  let moved = 0
  try {
    for (let f = 0; f < 400; f++) {
      // 每隔一段时间随机换方向，逼实体 AI / 交互扫描 / 液体 / 高度系统都跑一遍
      if (f % 40 === 0) { engine.input.mx = Math.sin(f) ; engine.input.my = Math.cos(f * 1.7) }
      if (f % 97 === 0) engine.input.interact = true
      if (f % 61 === 0) engine.input.attack = true
      if (f % 83 === 0) engine.input.jump = true
      engine.update(0.02)
      if (engine.over) break
    }
    moved = Math.hypot(engine.player.x - startX, engine.player.y - startY)
  } catch (e) { bad(`Level ${levelNo(id)} 运行 400 帧抛异常：${(e as Error).message}\n${(e as Error).stack?.split('\n').slice(1, 4).join('\n')}`) }
  const st = engine.over ? (engine.victory ? '通关' : '死亡') : '存活'
  console.log(`Level ${String(levelNo(id)).padStart(3)} ${def.name.padEnd(6)} 400帧 OK · 位移 ${moved.toFixed(1)}m · ${st} · HP ${Math.round(engine.player.hp)} 理智 ${Math.round(engine.player.sanity)} 电 ${Math.round(engine.player.battery)}`)
  if (engine.over) { engine.newRun(20260726, 'normal'); engine.paused = false }
}

// 据点（独立 id 空间，不在 LEVELS 数组）：enterOutpost 进 Alpha 基地跑 400 帧（NPC tick/对话扫描）
{
  try {
    if (!engine.enterOutpost('alpha')) bad('enterOutpost(alpha) 失败')
    engine.player.hp = 100; engine.player.sanity = 100; engine.player.hunger = 100
    const startX = engine.player.x, startY = engine.player.y
    let moved = 0
    for (let f = 0; f < 400; f++) {
      if (f % 40 === 0) { engine.input.mx = Math.sin(f); engine.input.my = Math.cos(f * 1.7) }
      // 不按 interact：出生点旁就是返程入口，误触会经 dest:'back' 离开据点
      engine.update(0.02)
      if (engine.over) break
      moved = Math.hypot(engine.player.x - startX, engine.player.y - startY)
    }
    if (engine.player.level !== 101) bad(`据点层级 id 异常：${engine.player.level}`)
    console.log(`Alpha 基地（据点） 400帧 OK · 位移 ${moved.toFixed(1)}m · NPC ${engine.npcs.length} 名 · ${engine.over ? '死亡' : '存活'}`)
  } catch (e) { bad(`据点运行抛异常：${(e as Error).message}`) }
  if (engine.over) { engine.newRun(20260726, 'normal'); engine.paused = false }
}

// 据点（独立 id 空间，不在 LEVELS 数组）：enterOutpost 进商人之家跑 300 帧（BNTG NPC tick）
{
  try {
    if (!engine.enterOutpost('bntg')) bad('enterOutpost(bntg) 失败')
    engine.player.hp = 100; engine.player.sanity = 100; engine.player.hunger = 100
    for (let f = 0; f < 300; f++) {
      if (f % 40 === 0) { engine.input.mx = Math.sin(f); engine.input.my = Math.cos(f * 1.7) }
      engine.update(0.02)
      if (engine.over) break
    }
    if (engine.player.level !== 102) bad(`商人之家层级 id 异常：${engine.player.level}`)
    console.log(`商人之家（据点） 300帧 OK · NPC ${engine.npcs.length} 名 · ${engine.over ? '死亡' : '存活'}`)
  } catch (e) { bad(`商人之家运行抛异常：${(e as Error).message}`) }
  if (engine.over) { engine.newRun(20260726, 'normal'); engine.paused = false }
}

// 据点（独立 id 空间，不在 LEVELS 数组）：enterOutpost 进希波克拉底 - 1 跑 300 帧（阿丽亚娜 NPC tick）
{
  try {
    if (!engine.enterOutpost('ariane')) bad('enterOutpost(ariane) 失败')
    engine.player.hp = 100; engine.player.sanity = 100; engine.player.hunger = 100
    for (let f = 0; f < 300; f++) {
      if (f % 40 === 0) { engine.input.mx = Math.sin(f); engine.input.my = Math.cos(f * 1.7) }
      engine.update(0.02)
      if (engine.over) break
    }
    if (engine.player.level !== 103) bad(`希波克拉底 - 1 层级 id 异常：${engine.player.level}`)
    console.log(`希波克拉底 - 1（据点） 300帧 OK · NPC ${engine.npcs.length} 名 · ${engine.over ? '死亡' : '存活'}`)
  } catch (e) { bad(`希波克拉底 - 1 运行抛异常：${(e as Error).message}`) }
  if (engine.over) { engine.newRun(20260726, 'normal'); engine.paused = false }
}

// 据点（独立 id 空间，不在 LEVELS 数组）：enterOutpost 进 Tom 的餐馆跑 300 帧（mixed 食客 NPC tick）
{
  try {
    if (!engine.enterOutpost('tom')) bad('enterOutpost(tom) 失败')
    engine.player.hp = 100; engine.player.sanity = 100; engine.player.hunger = 100
    for (let f = 0; f < 300; f++) {
      if (f % 40 === 0) { engine.input.mx = Math.sin(f); engine.input.my = Math.cos(f * 1.7) }
      engine.update(0.02)
      if (engine.over) break
    }
    if (engine.player.level !== 104) bad(`Tom 的餐馆层级 id 异常：${engine.player.level}`)
    console.log(`Tom 的餐馆（据点） 300帧 OK · NPC ${engine.npcs.length} 名 · ${engine.over ? '死亡' : '存活'}`)
  } catch (e) { bad(`Tom 的餐馆运行抛异常：${(e as Error).message}`) }
  if (engine.over) { engine.newRun(20260726, 'normal'); engine.paused = false }
}

// 据点（独立 id 空间，不在 LEVELS 数组）：enterOutpost 进办公区EL3A 跑 300 帧（v43：首个双层据点；NPC tick + 夹楼/楼梯系统）
{
  try {
    if (!engine.enterOutpost('el3a')) bad('enterOutpost(el3a) 失败')
    engine.player.hp = 100; engine.player.sanity = 100; engine.player.hunger = 100
    for (let f = 0; f < 300; f++) {
      if (f % 40 === 0) { engine.input.mx = Math.sin(f); engine.input.my = Math.cos(f * 1.7) }
      engine.update(0.02)
      if (engine.over) break
    }
    if (engine.player.level !== 105) bad(`办公区EL3A 层级 id 异常：${engine.player.level}`)
    if (engine.map?.floors !== 2) bad(`办公区EL3A floors 异常：${engine.map?.floors}（应为 2）`)
    console.log(`办公区EL3A（据点） 300帧 OK · NPC ${engine.npcs.length} 名 · 双层 ${engine.map?.floors}F · ${engine.over ? '死亡' : '存活'}`)
  } catch (e) { bad(`办公区EL3A 运行抛异常：${(e as Error).message}`) }
  if (engine.over) { engine.newRun(20260726, 'normal'); engine.paused = false }
}

// ---- v46：EL3A 真多层行为——楼梯行走上 2F / 2F 固定 NPC / 多层交界跳跃（2F 正常跳、夹楼下跳被楼板底正确拦截） ----
{
  try {
    if (!engine.enterOutpost('el3a')) bad('enterOutpost(el3a) 失败（楼梯测试）')
    for (let f = 0; f < 80; f++) engine.update(0.02) // 切入动画播完
    const p = engine.player
    // 1) 楼梯行走：从西阶梯坡道底 (20.5,35.2) 持续向南，应走上 2F 走廊
    p.x = 20.5; p.y = 35.2; p.z = 0; p.vz = 0
    engine.input.mx = 0; engine.input.my = 1
    for (let f = 0; f < 500 && p.z < 2.9; f++) engine.update(0.02)
    engine.input.mx = 0; engine.input.my = 0
    if (p.z < 2.5) bad(`[EL3A] 楼梯行走未能上 2F（z=${p.z.toFixed(2)} x=${p.x.toFixed(1)}）`)
    else console.log(`  ✓ EL3A 楼梯行走：从坡道底走上 2F（z=${p.z.toFixed(2)} x=${p.x.toFixed(1)} y=${p.y.toFixed(1)}）`)
    // 2) 2F 固定 NPC（运营主任/老会计在夹楼办公区）
    const upNpcs = engine.npcs.filter((n) => (n.floor ?? 0) === 1)
    if (upNpcs.length < 2) bad(`[EL3A] 2F 固定 NPC 不足（${upNpcs.length} < 2）`)
    else console.log(`  ✓ EL3A 夹楼 2F NPC ×${upNpcs.length}（${upNpcs.map((n) => n.id).join('、')}）`)
    // 3) 多层交界跳跃：2F 走廊跳跃顶点应 ≈4.05（上层天花 5.6 - 头高 1.55）
    p.x = 30.5; p.y = 45.5; p.z = 3.0; p.vz = 0
    let apex = 3.0
    engine.input.jump = true
    for (let f = 0; f < 90; f++) { engine.update(0.02); apex = Math.max(apex, p.z) }
    if (apex < 3.5) bad(`[EL3A] 2F 跳跃异常（顶点 ${apex.toFixed(2)} < 3.5）`)
    else console.log(`  ✓ EL3A 2F 跳跃顶点 ${apex.toFixed(2)}m（多层交界跳跃正常）`)
    // 4) 夹楼下（装卸区）跳跃：顶点应被楼板底 2.65 拦截在 ≈1.10（能跳但不穿楼板）
    p.x = 40.5; p.y = 50.5; p.z = 0; p.vz = 0
    let apex2 = 0
    engine.input.jump = true
    for (let f = 0; f < 90; f++) { engine.update(0.02); apex2 = Math.max(apex2, p.z) }
    if (apex2 < 0.5 || apex2 > 1.3) bad(`[EL3A] 夹楼下跳跃顶点 ${apex2.toFixed(2)} 异常（应 ≈1.10，被楼板底拦截）`)
    else console.log(`  ✓ EL3A 夹楼下跳跃顶点 ${apex2.toFixed(2)}m（楼板底正确拦截，未穿楼板）`)
  } catch (e) { bad(`EL3A 真多层行为测试抛异常：${(e as Error).message}`) }
  if (engine.over) { engine.newRun(20260726, 'normal'); engine.paused = false }
}

// ---- v54e：Gemma 三层跳跃顶板回归——站家具起跳 z 过带界（1.5）band 翻转后仍被 2F 板底拦截 ----
// （修复前：band 随 z 即时翻转、天花判定跳到 3F 5.65，头顶直接穿进 2F 楼板；修复后按板底 2.65 拦截 ≈1.10）
{
  try {
    if (!engine.enterOutpost('gamma')) bad('enterOutpost(gamma) 失败（跳跃顶板测试）')
    for (let f = 0; f < 80; f++) engine.update(0.02) // 切入动画播完
    const p = engine.player
    // 站上补给兑换处兑换柜台（table 顶 0.75 可站立，(46,40) 上方有 2F 板）起跳：0.75+跳跃行程过 1.5 带界
    p.x = 46.5; p.y = 40.5; p.z = 0.75; p.vz = 0
    let apex = 0.75
    engine.input.jump = true
    for (let f = 0; f < 90; f++) { engine.update(0.02); apex = Math.max(apex, p.z) }
    engine.input.jump = false
    if (apex > 1.15) bad(`[Gemma] 站家具起跳顶点 ${apex.toFixed(2)} 穿进 2F 楼板（应被板底拦截在 ≈1.10）`)
    else console.log(`  ✓ Gemma 站家具起跳顶点 ${apex.toFixed(2)}m（2F 板底拦截——band 翻转不再穿板）`)
    // v54e 二轮：2F→3F 同规则——2F 平地跳被 3F 板底 5.65 拦截在 ≈4.10；z 滞留带界区间（4.5..5.65）
    // 不得被「band 地面=上层板面」吸上 3F（gBand 降带修复——修复前从 z=5.0 落放直接传送到 6.0）
    p.x = 39.5; p.y = 23.5; p.z = 3.0; p.vz = 0 // 2F 走廊（up=1、up2=1）
    let apex2f = 3.0
    engine.input.jump = true
    for (let f = 0; f < 90; f++) { engine.update(0.02); apex2f = Math.max(apex2f, p.z) }
    engine.input.jump = false
    if (apex2f < 3.5 || apex2f > 4.15) bad(`[Gemma] 2F 跳跃顶点 ${apex2f.toFixed(2)} 异常（应 ≈4.10，被 3F 板底拦截）`)
    else {
      p.x = 39.5; p.y = 23.5; p.z = 5.0; p.vz = 0 // 板下滞留带（3F 板底 5.65 之下、带界 4.5 之上）
      for (let f = 0; f < 60; f++) engine.update(0.02)
      if (p.z > 4.5) bad(`[Gemma] 2F 板下滞留 z=${p.z.toFixed(2)} 被吸上 3F（gBand 降带失效）`)
      else console.log(`  ✓ Gemma 2F 跳跃顶点 ${apex2f.toFixed(2)}m（3F 板底拦截）· 板下滞留落回 2F（z=${p.z.toFixed(2)}，不穿板）`)
    }
  } catch (e) { bad(`Gemma 跳跃顶板测试抛异常：${(e as Error).message}`) }
  if (engine.over) { engine.newRun(20260726, 'normal'); engine.paused = false }
}

// ---- v43：EL3A 物流任务三路径（接取得包裹 → 当面交付得币+声望 / 丢失包裹 → 认定失败 -3 声望）+ 免费救济 ----
{
  const { genEl3aQuest } = await import('../src/game/content/factions.ts')
  engine.newRun(20260804, 'normal'); engine.paused = false
  if (!engine.enterOutpost('el3a')) bad('enterOutpost(el3a) 失败（物流测试）')
  for (let f = 0; f < 60; f++) engine.update(0.02) // 切入动画播完，层级加载
  // 1) 接取：任务入列 + 实体「物流包裹」入包
  const q1 = genEl3aQuest(() => 0.5)
  if (!engine.acceptQuest(q1)) bad('物流委托接取失败')
  else if (!engine.hasItem('parcel')) bad('接取物流委托后背包里没有「物流包裹」')
  else if (!engine.quests.some((q) => q.def.id === q1.id)) bad('接取后任务不在任务列表')
  else console.log(`  ✓ 物流接取：获得「物流包裹」（目标 ${q1.target} · ${q1.title}）`)
  // 2) 交付：到收件 NPC 处当面交付 → 包裹扣除 + 压印币 + BNTG 声望
  const rep0 = engine.rep.bntg ?? 0, coin0 = engine.countItem('presses')
  if (!engine.deliverGoodsTo(q1.target)) bad('物流当面交付被拒绝')
  else if (engine.hasItem('parcel')) bad('交付后包裹未扣除')
  else if ((engine.rep.bntg ?? 0) !== rep0 + q1.rewardRep) bad(`交付声望异常：${engine.rep.bntg}（应 ${rep0 + q1.rewardRep}）`)
  else if (engine.countItem('presses') !== coin0 + q1.rewardCoin) bad(`交付压印币异常：${engine.countItem('presses')}（应 ${coin0 + q1.rewardCoin}）`)
  else console.log(`  ✓ 物流交付：包裹签收，声望 +${q1.rewardRep} · 压印币 +${q1.rewardCoin}`)
  // 3) 丢失：包裹不在背包后回物流主管处认定失败 → 任务移除 + 声望 -3
  const q2 = genEl3aQuest(() => 0.6)
  if (!engine.acceptQuest(q2)) bad('第二单物流委托接取失败')
  while (engine.hasItem('parcel')) engine.consumeItem('parcel') // 模拟丢失
  if (engine.deliverGoodsTo(q2.target)) bad('包裹已丢却仍能交付（应拦截）')
  const rep1 = engine.rep.bntg ?? 0
  if (!engine.failGoodsQuest()) bad('包裹丢失后认定失败被拒绝')
  else if (engine.quests.some((q) => q.def.id === q2.id)) bad('认定失败后任务未移除')
  else if ((engine.rep.bntg ?? 0) !== rep1 - 3) bad(`认定失败声望异常：${engine.rep.bntg}（应 ${rep1 - 3}）`)
  else console.log('  ✓ 物流失败：包裹丢失 → 认栽移除任务，声望 -3')
  // 4) 免费救济：基础物资 <2 时可领补给包（杏仁水+罐装食品），每次进入限一次
  for (const t of ['almond', 'canned', 'bandage', 'battery']) while (engine.countItem(t)) engine.consumeItem(t)
  if (!engine.canClaimEl3aRelief()) bad('物资匮乏时免费救济不可领（应可领）')
  else if (!engine.claimEl3aRelief()) bad('免费补给包领取失败')
  else if (!engine.hasItem('almond') || !engine.hasItem('canned')) bad('补给包内容异常（应杏仁水+罐装食品）')
  else if (engine.claimEl3aRelief()) bad('补给包重复领取未被拦截（每次进入限领一次）')
  else console.log('  ✓ 免费救济：物资匮乏可领补给包（杏仁水×1+罐装食品×1），重复领取被拦截')
}
// ---- v45：杰瑞的信众 / Level 274 教化系统行为链 ----
// 认同+10（每局仅首次，之后选项不再出现）/ 门槛拒入与引路 / 接触+5+教化25+诵咏 / 教化满100拦出口 / 未满离开-5 /
// 驯服清零+见证-10 / 传教+8目标-5 / 借任务离开免罚；信众 approach+传教+敌意阈值
{
  const { jerryFollowerDef } = await import('../src/game/content/npcs.ts')
  // 前序逐层循环残留随机方向输入——本链全部需要定点站位，先清零
  engine.input.mx = 0; engine.input.my = 0; engine.input.sprint = false; engine.input.attack = false; engine.input.interact = false
  // A) L2 信众行为：看见玩家（~8m）主动靠近（approach）→ ~2.5m 停下高频传教；声望 ≤-10 敌对（主动攻击）
  {
    engine.newRun(20260804, 'normal'); engine.paused = false
    engine.devJump(2)
    engine.player.hp = 100000
    for (let f = 0; f < 5; f++) engine.update(0.02)
    const p = engine.player, m2 = engine.map!
    // 玩家与信众放在同一廊道中车道（南北向无实心），信众在南 6m
    const inf = m2.inf!
    p.x = 14.5 - inf.ox
    const defF = jerryFollowerDef(424242, 1, 1, 1, 1)
    const fx = p.x, fy = p.y + 6
    const fol = { id: defF.id, def: defF, x: fx, y: fy, facing: 0, homeX: fx, homeY: fy, tx: fx, ty: fy, moveT: 0, bubbleText: '', bubbleT: 0 }
    engine.npcs.push(fol)
    let minD = 99, preached = false
    for (let f = 0; f < 600; f++) {
      engine.update(0.02)
      const d = Math.hypot(fol.x - p.x, fol.y - p.y)
      if (d < minD) minD = d
      if (fol.bubbleT > 0 && fol.bubbleText) preached = true
    }
    if (minD > 3.2) bad(`信众未主动靠近（最近 ${minD.toFixed(1)}m，应 approach 至 ~2.5m）`)
    else if (!preached) bad('信众靠近后未传教（高频 bubble 失效）')
    else console.log(`  ✓ 信众 approach：看见玩家主动靠近（最近 ${minD.toFixed(1)}m），停下后高频传教`)
    // 敌意规则：≤-10 敌对并主动攻击玩家；恢复 ≥-10 放下敌意
    engine.changeRep('jerry', -15) // 0 → -15
    const hp0 = p.hp
    for (let f = 0; f < 240; f++) engine.update(0.02)
    if (!fol.hostile) bad('jerry 声望 ≤-10 信众未转敌对')
    else if (p.hp >= hp0) bad('敌对信众未主动攻击玩家')
    else {
      engine.changeRep('jerry', 15) // 回 0
      engine.update(0.02)
      if (fol.hostile) bad('声望恢复后信众仍敌对（应放下敌意）')
      else console.log(`  ✓ 敌意规则：声望 ≤-10 信众敌对并主动攻击（HP -${Math.round(hp0 - p.hp)}）；≥-10 恢复交谈`)
    }
    engine.npcs = engine.npcs.filter((n) => n !== fol)
  }
  // B) 认同 +10（v49 每局仅首次：+10 只给一次，之后任何信众处选项不再出现[canAgreeJerry=false]且引擎拦截；
  //    v48 仅野外信众可选，L274 内拦截）+ 进入门槛（<10 拒入 / ≥10 引路切层）
  {
    // 野外（L2 宣传间）信众：认同生效，声望 0 → 10；重复认同被拦截（同一信众与另一名信众都拒）
    engine.newRun(20260804, 'normal'); engine.paused = false
    engine.devJump(2)
    for (let f = 0; f < 60; f++) engine.update(0.02)
    const defW = jerryFollowerDef(424242, 9, 9, 1, 1)
    const pw = engine.player
    const fol2 = { id: defW.id, def: defW, x: pw.x, y: pw.y, facing: 0, homeX: pw.x, homeY: pw.y, tx: pw.x, ty: pw.y, moveT: 0, bubbleText: '', bubbleT: 0 }
    engine.npcs.push(fol2)
    if ((engine.rep.jerry ?? 0) !== 0) bad('jerry 初始声望应天然为 0')
    else if (!engine.canAgreeJerry(defW.id)) bad('首次认同前认同选项应出现（canAgreeJerry 应=true）')
    if (!engine.agreeJerry(defW.id)) bad('野外信众首次认同被拒绝')
    else if ((engine.rep.jerry ?? 0) !== 10) bad(`认同声望异常：${engine.rep.jerry}（应 10）`)
    else if (engine.agreeJerry(defW.id)) bad('重复认同未被拦截（每局仅首次有效）')
    else console.log('  ✓ 认同「杰瑞是最伟大的」：野外信众可认同，声望 +10（v49 起每局仅首次有效）')
    // v49：另一名信众处同样被拦截、声望不涨，且选项不再出现（canAgreeJerry=false——DialogOverlay 同一口径）
    const defW2 = jerryFollowerDef(424242, 8, 8, 1, 1)
    const fol3 = { id: defW2.id, def: defW2, x: pw.x, y: pw.y, facing: 0, homeX: pw.x, homeY: pw.y, tx: pw.x, ty: pw.y, moveT: 0, bubbleText: '', bubbleT: 0 }
    engine.npcs.push(fol3)
    if (engine.canAgreeJerry(defW.id) || engine.canAgreeJerry(defW2.id)) bad('已宣誓后认同选项仍出现（canAgreeJerry 应=false——「你已宣誓过了」）')
    else if (engine.agreeJerry(defW2.id)) bad('另一名信众处的认同未被拦截（每局仅首次有效）')
    else if ((engine.rep.jerry ?? 0) !== 10) bad(`第二次认同后声望异常：${engine.rep.jerry}（应保持 10）`)
    else console.log('  ✓ 认同每局仅一次：另一名信众处选项不再出现且引擎拦截，声望保持 +10（「你已宣誓过了」）')
    engine.npcs = engine.npcs.filter((n) => n !== fol3)
    // v48：L274 内信众的认同被拦截（他们已认可你才带你来——对话不显示该选项，引擎同样拒绝）
    engine.devJumpOutpost('jerry')
    for (let f = 0; f < 60; f++) engine.update(0.02)
    if (engine.agreeJerry('zeph')) bad('L274 内信众不应可认同（应拦截——认同仅野外可选）')
    else console.log('  ✓ 认同仅野外：L274 内信众的认同被引擎拦截（他们已认可你才带你来）')
    // 门槛：新档声望 0 → 拒入；≥10 → 引路
    engine.newRun(20260804, 'normal'); engine.paused = false
    engine.devJumpOutpost('jerry')
    for (let f = 0; f < 60; f++) engine.update(0.02)
    if (engine.gotoJerryRoom('zeph')) bad('声望 0 却被引路（应拒入）')
    else console.log('  ✓ 进入门槛：声望 <10 拒绝带路（「你还不够虔诚。」）')
    engine.changeRep('jerry', 10)
    if (!engine.gotoJerryRoom('zeph')) bad('声望 ≥10 引路被拒绝')
    for (let f = 0; f < 80; f++) engine.update(0.02)
    if (engine.player.level !== 274) bad(`引路后不在 Level 274（${engine.player.level}）`)
    else console.log('  ✓ 进入门槛：声望 ≥10 引路切层到 Level 274「杰瑞的房间」')
  }
  // C) 接触 +5+教化25 / v47 接触冷却 20s / 诵咏 / 教化满 100 拦出口
  {
    engine.newRun(20260804, 'normal'); engine.paused = false
    engine.devJumpOutpost('jerry')
    for (let f = 0; f < 60; f++) engine.update(0.02)
    const p = engine.player
    p.hp = 100000
    const j = engine.map!.entities.find((e) => e.def.type === 'jerry')!
    p.x = j.x - 1.2; p.y = j.y; p.facing = 0; look.yaw = -Math.PI // 同步视角：update 每帧按 yaw 覆写 facing（facing=yaw+π）
    const rep0 = engine.rep.jerry ?? 0
    if (!engine.contactJerry()) bad('接触杰瑞失败（视线/距离判定）')
    else if ((engine.rep.jerry ?? 0) !== rep0 + 5 || engine.indoctrination !== 25)
      bad(`接触异常：声望 ${engine.rep.jerry}（应 ${rep0 + 5}）· 教化 ${engine.indoctrination}（应 25）`)
    else console.log('  ✓ 接触杰瑞：声望 +5（每次）· 教化 +25')
    // v47：20s 内置冷却——冷却中重复接触被拦截并提示剩余秒数（防连点刷声望/教化）
    if (engine.contactJerry()) bad('接触冷却未生效（20s 内重复接触应被拦截）')
    else if (!engine.msgLog.some((mm) => mm.text.includes('接触冷却'))) bad('冷却拦截缺剩余秒数提示')
    else if (engine.indoctrination !== 25) bad('冷却中接触仍积累教化（应被拦截）')
    else console.log('  ✓ 接触冷却：20s 内置冷却，重复接触被拦截并提示剩余秒数')
    engine.jerryContactCd = 0 // 测试旁路：直接清零冷却
    let chanted = false
    for (let f = 0; f < 800 && !chanted; f++) { engine.update(0.02); if (engine.msgLog.some((mm) => mm.text.includes('诵咏'))) chanted = true }
    if (!chanted) bad('教化后未触发诵咏（L274 内应周期性不受控咏出）')
    else console.log('  ✓ 诵咏：接触后周期性不受控咏出崇拜杰瑞的话语（HUD 消息流）')
    engine.jerryContactCd = 0; engine.contactJerry()
    engine.jerryContactCd = 0; engine.contactJerry()
    engine.jerryContactCd = 0; engine.contactJerry() // 25 → 100
    if (engine.indoctrination !== 100) bad(`教化累计异常：${engine.indoctrination}（应 100）`)
    const ex = engine.map!.exits[0]
    p.x = ex.x + 0.5; p.y = ex.y + 0.5
    engine.input.interact = true
    for (let f = 0; f < 60; f++) { engine.update(0.02); engine.input.interact = false }
    if (engine.player.level !== 274) bad('教化满 100 却离开了 L274（应拦出口）')
    else if (!engine.msgLog.some((mm) => mm.text.includes('你属于这里'))) bad('教化满拦出口缺提示语')
    else console.log('  ✓ 教化满 100：出口交互被拦（「你属于这里。鹉主还需要你。」）')
  }
  // D) 未满离开 -5 / v47 传教使命标准委托化（≥30 三选一/接取/借任务免罚/布道达成/交付 +10+物资/对方 -5）
  {
    engine.newRun(20260804, 'normal'); engine.paused = false
    engine.devJumpOutpost('jerry')
    for (let f = 0; f < 60; f++) engine.update(0.02)
    engine.changeRep('jerry', 20) // 凑到 20
    let ex = engine.map!.exits[0]
    engine.player.x = ex.x + 0.5; engine.player.y = ex.y + 0.5
    engine.input.interact = true
    for (let f = 0; f < 120; f++) { engine.update(0.02); engine.input.interact = false }
    if ((engine.rep.jerry ?? 0) !== 15) bad(`未满教化离开声望异常：${engine.rep.jerry}（应 20-5=15）`)
    else if (engine.player.level === 274) bad('未满教化未能离开 L274（应可离开）')
    else console.log('  ✓ 声望惩罚：教化未满主动离开 L274 → 声望 -5')
    // v47：声望 <30 不提供传教委托（入口隐藏）
    if (engine.questOffers('jerry').length !== 0) bad('声望 <30 仍提供传教委托（应空——入口仅 ≥30 显示）')
    else console.log('  ✓ 传教委托门槛：声望 <30 不提供传教委托（入口仅 ≥30 显示）')
    // 委托化：三选一题库（均为 kind preach 且目标互不相同）
    engine.devJumpOutpost('jerry')
    for (let f = 0; f < 60; f++) engine.update(0.02)
    engine.changeRep('jerry', 20) // 15 → 35
    const offers = engine.questOffers('jerry')
    if (offers.length !== 3 || offers.some((o) => o.kind !== 'preach' || o.faction !== 'jerry') || new Set(offers.map((o) => o.target)).size !== offers.length)
      bad(`传教委托三选一异常：${offers.length} 个候选（${offers.map((o) => `${o.kind}:${o.target}`).join('、')}）`)
    else console.log(`  ✓ 传教使命标准委托化：三选一候选 ×3（${offers.map((o) => o.title).join('；')}）`)
    // 接取（避开 Tom 的餐馆——流浪者无声望，-5 无的放矢；极端三选一全是 tom 时重抽一轮）
    let pick = offers.find((o) => o.target !== 'tom')
    for (let g = 0; !pick && g < 20; g++) pick = engine.questOffers('jerry').find((o) => o.target !== 'tom')
    if (!pick) { bad('传教委托题库异常（多轮仍只有 Tom 的餐馆）') }
    if (!engine.acceptQuest(pick)) bad('传教委托接取失败')
    const repP = engine.rep.jerry ?? 0
    ex = engine.map!.exits[0]
    engine.player.x = ex.x + 0.5; engine.player.y = ex.y + 0.5
    engine.input.interact = true
    for (let f = 0; f < 120; f++) { engine.update(0.02); engine.input.interact = false }
    if ((engine.rep.jerry ?? 0) !== repP) bad(`借任务离开被扣声望：${engine.rep.jerry}（应 ${repP} 不变）`)
    else if (engine.player.level === 274) bad('接任务后未能离开 L274')
    else console.log('  ✓ 借任务离开：有进行中的传教委托，离开 L274 不受声望惩罚')
    // 布道达成：目标 NPC 所属团体 -5，委托标记完成（不再当场加 jerry 声望——交付时结算）
    if (!engine.devJumpOutpost(pick.target)) bad(`传教目的地据点 ${pick.target} 跳转失败`)
    for (let f = 0; f < 60; f++) engine.update(0.02)
    const tgtNpc = engine.npcs.find((n) => !n.dead && n.def.faction !== 'jerry')
    if (!tgtNpc) bad('目标据点无 NPC 可传教')
    else {
      const fac = tgtNpc.def.faction ?? 'meg'
      const repJ0 = engine.rep.jerry ?? 0, repF0 = engine.rep[fac] ?? 0
      if (!engine.preachTo(tgtNpc.id)) bad(`对 ${tgtNpc.def.name} 传教被拒绝`)
      else if (!engine.quests.find((q) => q.def.kind === 'preach')?.done) bad('布道后委托未标记完成')
      else if ((engine.rep.jerry ?? 0) !== repJ0) bad('布道当场加了 jerry 声望（应交付时结算）')
      else if ((engine.rep[fac] ?? 0) !== repF0 - 5) bad(`传教代价异常：${fac} ${engine.rep[fac]}（应 ${repF0 - 5}）`)
      else console.log(`  ✓ 布道达成：委托标记完成，${fac} 声望 -5（布道惹人嫌；目的地=${pick.target}）`)
    }
    // 交付：回 L274 侍立信众处 turnInQuest('jerry') → jerry 声望 +10 + 小物资
    engine.devJumpOutpost('jerry')
    for (let f = 0; f < 60; f++) engine.update(0.02)
    const repJ1 = engine.rep.jerry ?? 0
    const rwType = pick.rewardItems[0]
    const rw0 = rwType ? engine.countItem(rwType) : 0
    if (!engine.turnInQuest('jerry')) bad('传教委托交付失败（侍立信众处应可交付）')
    else if ((engine.rep.jerry ?? 0) !== repJ1 + 10) bad(`交付声望异常：${engine.rep.jerry}（应 ${repJ1 + 10}）`)
    else if (engine.quests.some((q) => q.def.kind === 'preach')) bad('交付后传教委托未结清')
    else if (rwType && engine.countItem(rwType) !== rw0 + 1) bad(`交付物资异常：${rwType} 未 +1`)
    else console.log(`  ✓ 委托交付：jerry 声望 +10 · 小物资（${rwType ?? '无'}）——标准委托流程走完`)
  }
  // E) 驯服：给予杏仁水 ×1 → 教化清零 + 此后接触不再积累；被信众看见 → 声望 -10（亵渎）
  {
    engine.newRun(20260804, 'normal'); engine.paused = false
    engine.devJumpOutpost('jerry')
    for (let f = 0; f < 60; f++) engine.update(0.02)
    const p = engine.player
    const j = engine.map!.entities.find((e) => e.def.type === 'jerry')!
    p.x = j.x - 1.2; p.y = j.y; p.facing = 0; look.yaw = -Math.PI // 同步视角：update 每帧按 yaw 覆写 facing（facing=yaw+π）
    engine.contactJerry()
    engine.jerryContactCd = 0; engine.contactJerry() // 教化 50 · 声望 +10
    engine.addItem('almond')
    const repB = engine.rep.jerry ?? 0
    // 走 useSlot 通道（选中背包里的杏仁水使用）——侍立信众在 ~4m 内（见证）
    const slot = p.hotbar.findIndex((sl) => sl?.type === 'almond')
    if (slot < 0) bad('杏仁水未入快捷栏')
    else {
      engine.useSlot('hotbar', slot)
      if (!engine.jerryTamed || engine.indoctrination !== 0) bad(`驯服未生效：tamed=${engine.jerryTamed} 教化=${engine.indoctrination}（应清零）`)
      else if ((engine.rep.jerry ?? 0) !== repB - 10) bad(`见证亵渎声望异常：${engine.rep.jerry}（应 ${repB - 10}）`)
      else if (engine.countItem('almond') !== 0) bad('驯服未消耗杏仁水')
      else console.log('  ✓ 驯服：给予杏仁水 ×1 → 教化清零；被信众看见 → 声望 -10（亵渎）')
      const repC = engine.rep.jerry ?? 0
      engine.jerryContactCd = 0
      engine.contactJerry()
      if ((engine.rep.jerry ?? 0) !== repC + 5) bad('驯服后接触声望未 +5')
      else if (engine.indoctrination !== 0) bad('驯服后接触仍积累教化（应不再积累）')
      else console.log('  ✓ 驯服后接触：声望仍 +5，教化不再积累')
    }
  }
  // F) v47：伤害杰瑞 → 信众哗然 -50（每次）；杀死杰瑞 → 声望直接 -100 敌对
  {
    engine.newRun(20260804, 'normal'); engine.paused = false
    engine.devJumpOutpost('jerry')
    for (let f = 0; f < 60; f++) engine.update(0.02)
    const p = engine.player
    p.hp = 100000
    const j = engine.map!.entities.find((e) => e.def.type === 'jerry')!
    p.x = j.x - 1.2; p.y = j.y; p.facing = 0; look.yaw = -Math.PI // 同步视角：update 每帧按 yaw 覆写 facing（facing=yaw+π）
    const hp0 = j.hp
    engine.input.attack = true
    for (let f = 0; f < 10; f++) engine.update(0.02)
    if (j.hp >= hp0) bad('挥击未命中杰瑞（站位/朝向异常）')
    else if ((engine.rep.jerry ?? 0) !== -50) bad(`伤害杰瑞声望异常：${engine.rep.jerry}（应 -50）`)
    else if (!engine.msgLog.some((mm) => mm.text.includes('信众哗然'))) bad('伤害杰瑞缺「信众哗然」提示')
    else console.log(`  ✓ 伤害杰瑞：jerry 声望立即 -50（信众哗然；HP ${hp0}→${j.hp}）`)
    // 杀死 → 直接 -100 敌对（信众立即转敌对）
    engine.dev.oneHit = true
    engine.input.attack = true
    for (let f = 0; f < 30; f++) engine.update(0.02)
    engine.dev.oneHit = false
    if (!j.dead) bad('一击必杀未能杀死杰瑞')
    else if ((engine.rep.jerry ?? 0) !== -100) bad(`杀死杰瑞声望异常：${engine.rep.jerry}（应直接 -100）`)
    else {
      const zeph = engine.npcs.find((n) => n.id === 'zeph')
      if (!zeph?.hostile) bad('杀死杰瑞后信众未转敌对')
      else console.log('  ✓ 杀死杰瑞：jerry 声望直接 -100（彻底敌对，信众立即攻击玩家）')
    }
  }
  // G) v47：教化攻击约束——教化 >0 无法攻击杰瑞；教化 ≥50 无法攻击信众；驯服清零后解除
  {
    engine.newRun(20260804, 'normal'); engine.paused = false
    engine.devJumpOutpost('jerry')
    for (let f = 0; f < 60; f++) engine.update(0.02)
    const p = engine.player
    p.hp = 100000
    const j = engine.map!.entities.find((e) => e.def.type === 'jerry')!
    p.x = j.x - 1.2; p.y = j.y; p.facing = 0; look.yaw = -Math.PI // 同步视角：update 每帧按 yaw 覆写 facing（facing=yaw+π）
    engine.contactJerry()
    engine.jerryContactCd = 0; engine.contactJerry() // 教化 50
    if (engine.indoctrination !== 50) bad(`教化累计异常：${engine.indoctrination}（应 50）`)
    // 挥击杰瑞：被拦（HP 不变 +「你下不去手」）
    engine.input.attack = true
    for (let f = 0; f < 10; f++) engine.update(0.02)
    if (j.hp !== 30) bad(`教化 >0 挥击仍伤及杰瑞（HP ${j.hp}，应 30 不变）`)
    else if (!engine.msgLog.some((mm) => mm.text.includes('你下不去手'))) bad('教化约束拦击缺「你下不去手」提示')
    else console.log('  ✓ 教化约束：教化值 >0 挥击对鹉主无效（「你下不去手」）')
    // 挥击信众：教化 ≥50 被拦
    const zeph = engine.npcs.find((n) => n.id === 'zeph')!
    p.x = zeph.x - 1.0; p.y = zeph.y; p.facing = 0; look.yaw = -Math.PI // 同步视角：update 每帧按 yaw 覆写 facing（facing=yaw+π）
    engine.input.attack = true
    for (let f = 0; f < 10; f++) engine.update(0.02)
    if ((zeph.hp ?? 45) !== 45) bad(`教化 ≥50 挥击仍伤及信众（HP ${zeph.hp}，应 45 不变）`)
    else if (!engine.msgLog.some((mm) => mm.text.includes('他们是你的兄弟姐妹'))) bad('教化 ≥50 拦击信众缺提示')
    else console.log('  ✓ 教化约束：教化值 ≥50 挥击对信众 NPC 无效（兄弟姐妹）')
    // 驯服清零 → 约束解除（可再次伤害杰瑞）
    engine.addItem('almond')
    p.x = j.x - 1.2; p.y = j.y; p.facing = 0; look.yaw = -Math.PI // 同步视角：update 每帧按 yaw 覆写 facing（facing=yaw+π）
    const slot = p.hotbar.findIndex((sl) => sl?.type === 'almond')
    engine.useSlot('hotbar', slot)
    if (engine.indoctrination !== 0) bad('驯服未清零教化')
    else {
      engine.input.attack = true
      for (let f = 0; f < 10; f++) engine.update(0.02)
      if (j.hp >= 30) bad('驯服后仍无法伤害杰瑞（约束应解除）')
      else console.log('  ✓ 教化约束解除：驯服清零后可再次对鹉主出手（声望再 -50）')
    }
  }
  // H) v47：L274 内信众不主动传教（仅野外 L2 宣传间信众 approach；L274 信众需玩家主动交谈）
  {
    engine.newRun(20260804, 'normal'); engine.paused = false
    engine.devJumpOutpost('jerry')
    for (let f = 0; f < 60; f++) engine.update(0.02)
    const p = engine.player
    p.hp = 100000
    const zeph = engine.npcs.find((n) => n.id === 'zeph')!
    const homeX = zeph.homeX, homeY = zeph.homeY
    p.x = homeX + 7; p.y = homeY // 玩家在信众 ~7m 外（approach 触发半径 8m 内）
    let minD = 99
    for (let f = 0; f < 400; f++) {
      engine.update(0.02)
      const d = Math.hypot(zeph.x - p.x, zeph.y - p.y)
      if (d < minD) minD = d
    }
    if (minD < 3.5) bad(`L274 信众主动靠近玩家（最近 ${minD.toFixed(1)}m——应不 approach，仅游荡）`)
    else if (Math.hypot(zeph.homeX - homeX, zeph.homeY - homeY) > 0.01) bad('L274 信众岗位锚点漂移')
    else console.log(`  ✓ L274 信众不主动传教：最近 ${minD.toFixed(1)}m（仅岗位游荡；主动 approach 仅野外宣传间信众）`)
  }
  engine.newRun(20260804, 'normal') // 复位，避免影响后续冒烟
}

// ---- v39：BRC（后室装修公司）行为链：模仿装修 +2（冷却生效）/
//      攻击不立即降声望且员工不停手 / 坦白结清并转敌对 / 敌对可反击杀死 ----
{
  const { findNearestVariant, CS: ICS } = await import('../src/game/world/infinite.ts')
  const { l1VariantOf } = await import('../src/game/world/infiniteL1.ts')
  engine.newRun(20260803, 'normal'); engine.paused = false
  engine.devJump(1)
  engine.player.hp = 100000; engine.player.sanity = 100; engine.player.hunger = 100
  const inf = engine.map!.inf!
  const w = findNearestVariant(inf.seed, inf.ox + engine.player.x, inf.oy + engine.player.y, 'ouroboros', 80, l1VariantOf)
  if (!w) bad('80 chunk 内未找到衔尾段')
  else {
    engine.player.x = w.cx * ICS - inf.ox + 16
    engine.player.y = w.cy * ICS - inf.oy + 16
    for (let f = 0; f < 10; f++) engine.update(0.02) // 窗口平移 + chunk NPC 同步
    const worker = engine.npcs.find((n) => n.def.faction === 'brc')
    if (!worker) bad('衔尾段 chunk 未同步出 BRC 员工（engine.npcs）')
    else {
      const crew = engine.npcs.filter((n) => n.def.faction === 'brc')
      if (crew.length < 1) bad(`衔尾段 BRC 员工数异常：${crew.length}`)
      else console.log(`衔尾段 BRC 员工同步 OK：${crew.map((n) => `${n.def.name}(${n.def.workLoop})`).join('、')}（窗口内 ${crew.length} 名，单 chunk 1~2 名见 l1inf-smoke）`)
      // 模仿装修：动作播完 +2 声望；~90s 冷却内不再加
      const rep0 = engine.rep.brc ?? 0
      if (!engine.mimicBrc()) bad('首次模仿装修被拒绝')
      for (let f = 0; f < 60; f++) engine.update(0.02) // 1.2s：挥臂动画播完结算
      if ((engine.rep.brc ?? 0) !== rep0 + 2) bad(`模仿装修声望异常：${engine.rep.brc}（应 ${rep0 + 2}）`)
      else console.log('  ✓ 模仿装修：声望 +2（动作播完结算）')
      const rep1 = engine.rep.brc ?? 0
      if (engine.mimicBrc()) bad('冷却内模仿装修未被拦截')
      for (let f = 0; f < 60; f++) engine.update(0.02)
      if ((engine.rep.brc ?? 0) !== rep1) bad('冷却内模仿仍加了声望')
      else console.log('  ✓ 模仿装修：全局冷却生效（冷却内不再加声望）')
      // 攻击员工：不立即降声望、不转敌对不停手、记未告发伤害
      engine.player.x = worker.x + 1.0; engine.player.y = worker.y
      engine.player.facing = Math.atan2(worker.y - engine.player.y, worker.x - engine.player.x); look.yaw = engine.player.facing - Math.PI // 同步视角（facing=yaw+π）
      engine.input.attack = true
      engine.update(0.02)
      if (engine.brcSin.hurt !== 1) bad(`攻击员工未告发伤害计数异常：${engine.brcSin.hurt}（应 1）`)
      else if ((engine.rep.brc ?? 0) !== rep1) bad('攻击员工立即降了声望（应跳过 changeRep 改记未告发）')
      else if (worker.hostile || worker.dead) bad('员工被攻击后行为改变（应不受影响继续干活）')
      else console.log(`  ✓ 攻击员工：声望不变、员工继续干活（未告发伤害 ×${engine.brcSin.hurt}）`)
      // 坦白：按计数结清降声望（伤害×1 → -10）+ 该员工转敌对
      if (!engine.confessBrc(worker.id)) bad('坦白失败（有未告发记录却被拒）')
      if ((engine.rep.brc ?? 0) !== rep1 - 10) bad(`坦白后声望异常：${engine.rep.brc}（应 ${rep1 - 10}）`)
      else if (engine.brcSin.hurt + engine.brcSin.killed !== 0) bad('坦白后未告发记录未结清')
      else if (!worker.hostile) bad('坦白后该员工未转敌对')
      else console.log(`  ✓ 坦白：声望 ${rep1} → ${engine.rep.brc}（伤害×1 结清 -10），该员工转敌对`)
      // 测试隔离：把另一名（未被坦白的）员工挪远，反击阶段只结算敌对员工
      for (const n2 of crew) if (n2 !== worker) { n2.x -= 50; n2.y -= 50; n2.homeX -= 50; n2.homeY -= 50 }
      // 敌对员工追击并攻击玩家（拉远 2.5m 验证追击）
      engine.player.x = worker.x + 2.5; engine.player.y = worker.y
      const d0 = Math.hypot(worker.x - engine.player.x, worker.y - engine.player.y)
      const hp0 = engine.player.hp
      for (let f = 0; f < 120; f++) engine.update(0.02)
      const d1 = Math.hypot(worker.x - engine.player.x, worker.y - engine.player.y)
      if (worker.dead) bad('敌对员工莫名死亡')
      else if (!(d1 < d0 - 0.8 || engine.player.hp < hp0)) bad(`敌对员工未追击/攻击玩家（距离 ${d0.toFixed(1)} → ${d1.toFixed(1)}，HP ${hp0} → ${engine.player.hp}）`)
      else console.log(`  ✓ 敌对员工追击并攻击玩家（距离 ${d0.toFixed(1)} → ${d1.toFixed(1)}，HP -${Math.round(hp0 - engine.player.hp)}）`)
      // 玩家反击杀死敌对员工：不另记未告发杀死（已坦白结清）、声望不再变化
      for (let f = 0; f < 60 && !worker.dead; f++) {
        engine.player.x = worker.x + 1.0; engine.player.y = worker.y
        engine.player.facing = Math.atan2(worker.y - engine.player.y, worker.x - engine.player.x); look.yaw = engine.player.facing - Math.PI // 同步视角（facing=yaw+π）
        engine.input.attack = true
        engine.update(0.02)
      }
      if (!worker.dead) bad('敌对员工无法被反击杀死')
      else if (engine.brcSin.killed !== 0) bad('杀死敌对员工另记了未告发杀死（已坦白结清不应再记）')
      else if ((engine.rep.brc ?? 0) !== rep1 - 10) bad('杀死敌对员工后声望又变了')
      else console.log('  ✓ 反击杀死敌对员工：不再记罪、声望不再变化')
      engine.player.hp = 100000
    }
  }
  if (engine.over) { engine.newRun(20260726, 'normal'); engine.paused = false }
}

// ---- 结局链：L11 集齐磁带 → Base Beta → Level 601 → 真结局 ----
engine.newRun(777, 'normal'); engine.paused = false
engine.devJump(11)
engine.player.tapes = WIN_TAPES
const m11 = engine.map!
const beta = m11.exits.find((e) => e.def.kind === 'basebeta')
if (!beta) console.log('（本 seed 的 Level 11 未刷出 Base Beta 出口，改用直接跳层验证结局层）')
engine.devJump(12)
const m601 = engine.map!
const kinds = m601.exits.map((e) => e.def.kind).sort()
if (kinds.length !== 2 || kinds[0] !== 'homedoor' || kinds[1] !== 'trueend') bad(`Level 601 出口不是 [homedoor, trueend]，实际 ${JSON.stringify(kinds)}`)
// 走假门：应回到 601 且 fakeEnds 自增
const fake = m601.exits.find((e) => e.def.kind === 'homedoor')!
engine.player.x = fake.x + 0.5; engine.player.y = fake.y + 0.5
engine.input.interact = true
for (let f = 0; f < 120; f++) engine.update(0.02)
if (engine.fakeEnds < 1) bad('走进「你家的前门」后 fakeEnds 未自增（假结局未触发）')
if (engine.player.level !== 12) bad(`假结局后应回到 Level 601，实际在索引 ${engine.player.level}`)
console.log(`假结局：触发 ${engine.fakeEnds} 次 · 玩家仍在 Level ${levelNo(engine.player.level)} ✓`)
// 走真门：应通关
const real = engine.map!.exits.find((e) => e.def.kind === 'trueend')!
engine.player.x = real.x + 0.5; engine.player.y = real.y + 0.5
engine.input.interact = true
for (let f = 0; f < 120; f++) engine.update(0.02)
if (!engine.victory) bad('走进「金属字母底下的门」后未触发通关')
else console.log('真结局：通关 ✓')

// ---- v44 杂项：尸体击退墙体校验 / 被动漫游撞墙转向 / 笑魇听觉察觉 ----
{
  const { makeEntity } = await import('../src/game/entities/index.ts')
  const { tileAt } = await import('../src/game/world/mapgen.ts')
  engine.newRun(20260804, 'normal'); engine.paused = false
  engine.devJump(0)
  engine.player.hp = 100000; engine.player.sanity = 100; engine.player.hunger = 100
  engine.input.mx = 0; engine.input.my = 0
  for (let f = 0; f < 5; f++) engine.update(0.02) // 层级稳定
  const m0 = engine.map!
  // 测试位：三连地板 (x-2..x, y)，x+1 为墙；(x, y±4) 均为地板且无实心结构（撞墙偏转候选落点）。
  // 必须取在玩家附近：远距离传送玩家会触发无限窗口平移，注入实体的坐标会被重映射
  const solidAt = (x: number, y: number) => m0.structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
  const findSpot = (cx: number, cy: number, r: number) => {
    for (let y = Math.max(6, cy - r); y < Math.min(m0.h - 7, cy + r); y++)
      for (let x = Math.max(2, cx - r); x < Math.min(m0.w - 3, cx + r); x++) {
        if (tileAt(m0, x, y) !== 1 || tileAt(m0, x - 1, y) !== 1 || tileAt(m0, x - 2, y) !== 1) continue
        if (tileAt(m0, x + 1, y) === 1) continue
        if (tileAt(m0, x, y - 4) !== 1 || tileAt(m0, x, y + 4) !== 1) continue
        if (solidAt(x, y - 4) || solidAt(x, y + 4)) continue
        return { x, y }
      }
    return null
  }
  const spot = findSpot(Math.floor(engine.player.x), Math.floor(engine.player.y), 14)
  if (!spot) bad('v44：出生点附近未找到「三连地板尽头是墙」的测试位')
  else {
    // 1) 尸体击退墙体校验：击退落点不可走则不位移（尸体不可被打进墙里）
    engine.dev.oneHit = true
    const rat0 = makeEntity('corpserat', spot.x + 0.7, spot.y + 0.5)
    m0.entities.push(rat0)
    engine.player.x = spot.x + 0.7 - 1.2; engine.player.y = spot.y + 0.5; engine.player.facing = 0; look.yaw = -Math.PI // 同步视角（facing=yaw+π）
    engine.input.attack = true
    engine.update(0.02)
    engine.input.attack = false
    engine.dev.oneHit = false
    if (!rat0.dead) bad('击退测试：一击必杀未击杀尸鼠')
    else if (tileAt(m0, Math.floor(rat0.x), Math.floor(rat0.y)) !== 1)
      bad(`尸体被打进墙里：落点 (${rat0.x.toFixed(2)},${rat0.y.toFixed(2)}) 不可走`)
    else console.log('  ✓ 尸体击退墙体校验：落点夹回可走位置，尸体未嵌入墙')
    m0.entities = m0.entities.filter((e) => e !== rat0)

    // 3) 被动漫游撞墙转向：目标定在墙内，卡住后偏转 ±60°~120° 另选可走目标
    const fl = makeEntity('faceling', spot.x + 0.5, spot.y + 0.5)
    fl.state = 'wander'; fl.targetX = spot.x + 1.6; fl.targetY = spot.y + 0.5; fl.stateT = 4
    m0.entities.push(fl)
    // 玩家留在击退测试位置（1m 外）：安静不移动，不干扰漫游
    const rnd0 = Math.random
    Math.random = () => 0.5 // 定数：偏转取 -90°（首个候选即正北 4m，目标瓦片已确保为地板）
    let firstDeflect: { tx: number; ty: number; fx: number; fy: number } | null = null
    for (let f = 0; f < 80; f++) {
      engine.update(0.02)
      if (!firstDeflect && (fl.targetX !== spot.x + 1.6 || fl.targetY !== spot.y + 0.5))
        firstDeflect = { tx: fl.targetX, ty: fl.targetY, fx: fl.x, fy: fl.y } // 捕获首次卡住偏转瞬间
    }
    Math.random = rnd0
    if (!firstDeflect) bad('撞墙后 80 帧内未发生偏转（wanderDeflect 未触发）')
    else {
      const devDeg = Math.abs(Math.atan2(firstDeflect.ty - firstDeflect.fy, firstDeflect.tx - firstDeflect.fx)) * 180 / Math.PI
      if (devDeg < 55 || devDeg > 125) bad(`撞墙偏转角度异常：${devDeg.toFixed(0)}°（应 ±60°~120°）`)
      else if (tileAt(m0, Math.floor(firstDeflect.tx), Math.floor(firstDeflect.ty)) !== 1) bad('撞墙偏转后的新目标瓦片不可走')
      else console.log(`  ✓ 被动漫游撞墙转向：卡住后偏转 ${devDeg.toFixed(0)}° 另选可走目标`)
    }
    m0.entities = m0.entities.filter((e) => e !== fl)

    // 4) 笑魇听觉：关灯 + 噪音 → 进入追击；关灯 + 安静 → 不追击
    const sm = makeEntity('smiler', spot.x - 2 + 0.5, spot.y + 0.5)
    m0.entities.push(sm)
    engine.player.x = spot.x + 0.5; engine.player.y = spot.y + 0.5
    engine.player.flashlight = false
    for (let f = 0; f < 10; f++) engine.update(0.02)
    if (sm.state === 'chase' || sm.state === 'attack') bad('笑魇在玩家关灯且安静时进入追击（不应）')
    else {
      engine.input.attack = true // 挥击制造噪音（attack 内 noiseEvent 刷新玩家噪音残余）
      engine.update(0.02)
      engine.input.attack = false
      if (sm.state !== 'chase' && sm.state !== 'attack') bad(`笑魇未察觉关灯噪音（state=${sm.state}，听觉通道失效）`)
      else console.log('  ✓ 笑魇听觉：关灯靠近发出声音即被察觉（进入追击），安静时不追击')
    }
    m0.entities = m0.entities.filter((e) => e !== sm)
  }
}

// ---- v54：口渴值系统（流失规则 / 归零扣血 / 物品效果）----
{
  // A) 与饥饿同率自然流失（野外静止：两者同乘 ×0.5）
  engine.newRun(20260811, 'normal'); engine.paused = false
  engine.devJump(0)
  engine.input.mx = 0; engine.input.my = 0; engine.input.sprint = false
  for (let f = 0; f < 5; f++) engine.update(0.02)
  {
    const p = engine.player
    p.hp = 10000; p.hunger = 80; p.thirst = 80; p.stamina = 100
    for (let f = 0; f < 100; f++) engine.update(0.02)
    const dH = 80 - p.hunger, dT = 80 - p.thirst
    if (dH <= 0 || dT <= 0) bad(`口渴/饥饿未自然流失（饥饿 -${dH.toFixed(2)} 口渴 -${dT.toFixed(2)}）`)
    else if (Math.abs(dH - dT) > 0.05) bad(`口渴未与饥饿同率流失（饥饿 -${dH.toFixed(3)} 口渴 -${dT.toFixed(3)}）`)
    else console.log(`  ✓ 口渴与饥饿同率流失（2s 各 -${dT.toFixed(2)}）`)
  }
  // B) 体力耗尽（stamina 归零）时口渴流失 ×2
  {
    const p = engine.player
    p.hp = 100; p.hunger = 80; p.thirst = 80
    for (let f = 0; f < 100; f++) { p.stamina = 0; engine.update(0.02) } // 每帧钉住体力归零（否则自然恢复）
    const dH = 80 - p.hunger, dT = 80 - p.thirst
    const ratio = dT / dH
    if (Math.abs(ratio - 2) > 0.15) bad(`体力耗尽时口渴流失未加倍（口渴/饥饿 = ${ratio.toFixed(2)}，应 ≈2）`)
    else console.log(`  ✓ 体力耗尽口渴流失 ×2（实测 ${ratio.toFixed(2)}）`)
    p.stamina = 100
  }
  // C) 据点中流失变缓（与饥饿同规则：×1/3，静止再 ×1/2）
  {
    engine.devJump(0)
    const p = engine.player
    p.hp = 10000; p.thirst = 80; p.stamina = 100
    engine.input.mx = 0; engine.input.my = 0
    for (let f = 0; f < 150; f++) engine.update(0.02)
    const wild = 80 - p.thirst
    if (!engine.enterOutpost('alpha')) bad('enterOutpost(alpha) 失败（口渴测试）')
    for (let f = 0; f < 60; f++) engine.update(0.02) // 切入动画播完
    p.thirst = 80; p.hp = 10000; p.stamina = 100
    engine.input.mx = 0; engine.input.my = 0
    for (let f = 0; f < 150; f++) engine.update(0.02)
    const base = 80 - p.thirst
    const ratio = base / wild
    if (Math.abs(ratio - 1 / 3) > 0.1) bad(`据点中口渴流失未减缓（据点/野外 = ${ratio.toFixed(2)}，应 ≈0.33）`)
    else console.log(`  ✓ 据点口渴流失减缓（实测为野外 ${(ratio * 100).toFixed(0)}%，规则 1/3×1/2）`)
  }
  // D) 归零持续扣血 + 死亡文案「渴死了」
  {
    engine.newRun(20260812, 'normal'); engine.paused = false
    engine.devJump(0)
    for (let f = 0; f < 5; f++) engine.update(0.02)
    const p = engine.player
    p.thirst = 0; p.hp = 50; p.stamina = 100
    engine.input.mx = 0; engine.input.my = 0
    for (let f = 0; f < 50; f++) engine.update(0.02)
    if (p.hp >= 50) bad(`口渴归零未持续扣血（HP ${p.hp}）`)
    else console.log(`  ✓ 口渴归零持续扣血（HP 50 → ${p.hp.toFixed(1)}）`)
    let death = ''
    const off = engine.on((e) => { if (e.kind === 'dead') death = e.text ?? '' })
    p.hp = 0.5; p.thirst = 0
    for (let f = 0; f < 50 && !engine.over; f++) engine.update(0.02)
    off()
    if (!engine.over) bad('口渴归零且 HP 耗尽后未死亡')
    else if (death !== '渴死了') bad(`渴死文案异常：「${death}」（应「渴死了」）`)
    else console.log('  ✓ 口渴归零致死：死亡原因「渴死了」')
  }
  // E) 物品口渴效果（杏仁水+30 / 咖啡+10 / 液态痛苦-30 / 腰果水-10 / 幸运豆奶+30 / 市政自来水+30 且不恢复饥饿 / 番茄浓汤+10）
  {
    engine.newRun(20260813, 'normal'); engine.paused = false
    engine.devJump(0)
    for (let f = 0; f < 5; f++) engine.update(0.02)
    const p = engine.player
    const giveAndUse = (type: string) => {
      if (!engine.devGiveItem(type)) { bad(`devGiveItem(${type}) 失败`); return false }
      let i = p.hotbar.findIndex((s) => s?.type === type)
      if (i >= 0) { engine.useSlot('hotbar', i); return true }
      i = p.backpack.findIndex((s) => s?.type === type)
      if (i >= 0) { engine.useSlot('backpack', i); return true }
      bad(`物品 ${type} 未入包`)
      return false
    }
    const resetStats = () => { p.hp = 100; p.sanity = 50; p.hunger = 50; p.thirst = 50; p.stamina = 50 }
    resetStats(); giveAndUse('almond')
    if (p.thirst !== 80) bad(`杏仁水口渴异常：${p.thirst}（应 80）`)
    else console.log('  ✓ 杏仁水：口渴 +30（理智 +30 不变）')
    resetStats(); giveAndUse('coffee')
    if (p.thirst !== 60) bad(`咖啡口渴异常：${p.thirst}（应 60）`)
    else console.log('  ✓ 咖啡：口渴 +10（体力回满不变）')
    resetStats(); giveAndUse('liquidpain')
    if (p.thirst !== 20 || p.hp !== 65 || p.sanity !== 0) bad(`液态痛苦异常：口渴 ${p.thirst} HP ${p.hp} 理智 ${p.sanity}（应 20/65/0）`)
    else console.log('  ✓ 液态痛苦：口渴 -30（生命 -35 · 理智 -55 不变）')
    resetStats(); giveAndUse('cashew')
    if (p.thirst !== 40 || p.sanity !== 20) bad(`腰果水异常：口渴 ${p.thirst} 理智 ${p.sanity}（应 40/20）`)
    else console.log('  ✓ 腰果水：口渴 -10（理智 -30 不变）')
    resetStats(); giveAndUse('luckymilk')
    if (p.thirst !== 80 || p.sanity !== 90 || p.hunger !== 70) bad(`幸运豆奶异常：口渴 ${p.thirst} 理智 ${p.sanity} 饥饿 ${p.hunger}（应 80/90/70）`)
    else console.log('  ✓ 幸运豆奶：口渴 +30（理智 +40 · 饥饿 +20 不变）')
    resetStats(); giveAndUse('citywater')
    if (p.thirst !== 80) bad(`市政自来水口渴异常：${p.thirst}（应 80）`)
    else if (p.hunger !== 50) bad(`市政自来水不应恢复饥饿（饥饿 ${p.hunger}，应保持 50）`)
    else console.log('  ✓ 市政自来水：口渴 +30 且不恢复饥饿')
    resetStats(); giveAndUse('tomatosoup')
    if (p.thirst !== 60 || p.hunger !== 95) bad(`番茄浓汤异常：口渴 ${p.thirst} 饥饿 ${p.hunger}（应 60/95）`)
    else console.log('  ✓ 番茄浓汤：口渴 +10（饥饿 +45 不变）')
    // 人制品：效应生效（恒显口渴画面特效的引擎侧依据 manmadeT）
    resetStats(); giveAndUse('manmade')
    if (engine.manmadeT !== 300) bad(`人制品效应未生效（manmadeT=${engine.manmadeT}，应 300）`)
    else console.log('  ✓ 人制品：效应 5 分钟生效（manmadeT=300，期间恒显饥饿+口渴画面特效）')
  }
}

// ---- v54：存档槽位（3 手动槽 + 1 自动槽；旧档迁移）----
{
  // 本段起启用内存 localStorage（此前各段 localStorage=undefined，存储静默降级不干扰既有断言）
  const store = new Map<string, string>()
  ;(globalThis as unknown as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
  }
  const saveMod = await import('../src/game/engine/save.ts')
  const readRaw = (k: string) => { const r = store.get(k); return r ? JSON.parse(r) as { seed?: number; level?: number; savedAt?: number; player?: { tapes?: number; thirst?: number } } : null }

  // 1) 新开局：写入绑定手动槽（newRun 末尾落盘）+ 自动槽（loadLevel 切层落盘）
  engine.newRun(20260814, 'normal', 'slot2'); engine.paused = false
  const s2 = readRaw('br_save_slot2'), sa = readRaw('br_save_auto')
  if (!s2 || s2.seed !== 20260814) bad('新开局未写入绑定槽位 br_save_slot2')
  else if (!sa || sa.seed !== 20260814) bad('新开局未写入自动槽 br_save_auto（切层落盘）')
  else if (typeof s2.savedAt !== 'number' || typeof sa.savedAt !== 'number') bad('槽位快照缺 savedAt 时间戳')
  else console.log('  ✓ 新开局四槽读写：绑定槽 slot2 与自动槽均已写入（含 savedAt）')
  // 2) 周期自动保存：每 60 秒写自动槽（手动槽不被周期覆盖）
  engine.player.tapes = 3
  engine.autosaveT = 59.99
  engine.update(0.02)
  const sa2 = readRaw('br_save_auto')
  if (!sa2 || sa2.player?.tapes !== 3) bad('60 秒周期自动保存未写入自动槽（tapes 未同步）')
  else if (readRaw('br_save_slot2')?.player?.tapes === 3) bad('周期自动保存错误覆盖了手动槽')
  else console.log('  ✓ 周期自动保存：60s 写自动槽，不覆盖手动槽')
  // 3) 切层自动保存
  engine.devJump(1)
  const sa3 = readRaw('br_save_auto')
  if (!sa3 || sa3.level !== 1) bad(`切层未自动保存（自动槽 level=${sa3?.level}，应 1）`)
  else console.log('  ✓ 切层自动保存：进入 Level 1 即写自动槽')
  // 4) 其余手动槽读写
  saveMod.persist(engine, 'slot1'); saveMod.persist(engine, 'slot3')
  if (!saveMod.readSaveSlot('slot1') || !saveMod.readSaveSlot('slot3')) bad('slot1/slot3 写入后读取失败')
  else {
    const list = saveMod.listSaveSlots()
    if (list.length !== 4 || list[3].id !== 'auto' || !list[3].auto) bad(`槽位列表异常：${list.map((l) => l.id).join(',')}`)
    else if (list.some((l) => !l.snap)) bad('槽位列表有空槽（四槽应均有内容）')
    else console.log('  ✓ 四槽读写与列表：slot1/2/3 + auto 全部可读（auto 标记只读）')
  }
  // 5) 继续游戏：从 slot2 读档恢复（thirst 随 player 快照持久）
  engine.player.tapes = 5; engine.player.thirst = 77
  saveMod.persist(engine, 'slot2')
  engine.newRun(20260814, 'normal', 'slot2'); engine.paused = false
  if (engine.player.tapes !== 5) bad(`读档恢复异常：tapes=${engine.player.tapes}（应 5）`)
  else if (engine.player.thirst !== 77) bad(`口渴未随存档恢复：thirst=${engine.player.thirst}（应 77）`)
  else if (engine.player.level !== 1) bad(`读档层级异常：${engine.player.level}（应 1）`)
  else console.log('  ✓ 继续游戏：从 slot2 恢复层级/磁带/口渴值')
  // 6) 旧档迁移：br_save_state → 槽 1，旧键清除
  store.clear()
  const legacy = JSON.parse(JSON.stringify(saveMod.snapshot(engine))) as Record<string, unknown>
  store.set('br_save_state', JSON.stringify(legacy))
  store.set('br_save', JSON.stringify({ seed: engine.seed }))
  const migrated = saveMod.listSaveSlots()
  if (store.has('br_save_state') || store.has('br_save')) bad('旧档键未在迁移后清除')
  else if (!migrated[0].snap || migrated[0].snap.seed !== engine.seed) bad('旧 br_save_state 未迁移为槽 1')
  else console.log('  ✓ 旧档迁移：br_save_state → 存档槽 1，旧键已清除')
  // 7) 死亡清槽：本局绑定槽 + 自动槽失效，其余槽位不受影响
  saveMod.persist(engine, 'slot3') // 模拟另一局的存档
  engine.die('测试死亡', true)
  if (store.has('br_save_slot2') || store.has('br_save_auto')) bad('死亡后绑定槽/自动槽未清空')
  else if (!store.has('br_save_slot1') || !store.has('br_save_slot3')) bad('死亡误清了其他槽位')
  else console.log('  ✓ 死亡清槽：绑定槽 + 自动槽失效，其他槽位保留')
  // 收尾：恢复无存储环境，避免影响可能的后续段落
  ;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
  engine.newRun(20260726, 'normal'); engine.paused = false
}

// ---- v54：据点寄存仓库（声望门槛/存取并摞/阵营互通/48 栏上限/装备位拦截/存档持久）+ DevPanel 多层 NPC 传送 ----
{
  engine.newRun(20260815, 'normal'); engine.paused = false
  // 1) 声望门槛：对应团体声望 ≥10 开放（含等于；MEG 初始 30）
  if (engine.warehouseOfNpc('suanpan') !== 'meg') bad('suanpan（Alpha 军需官）未标记为 MEG 寄存 NPC')
  else if (!engine.canUseWarehouse('suanpan')) bad('声望 30 时寄存不可用（应 ≥10 开放）')
  else {
    engine.rep.meg = 10
    if (!engine.canUseWarehouse('suanpan')) bad('声望 =10 时寄存不可用（v54 二轮起 ≥10 即开放）')
    else {
      engine.rep.meg = 9
      if (engine.canUseWarehouse('suanpan')) bad('声望 9 时寄存仍可用（应 ≥10 才开放）')
      else console.log('  ✓ 寄存声望门槛：≥10 开放（=10 解锁），9 拦截（suanpan/brandt/hobbs=meg，vesper/dorian=bntg）')
    }
    engine.rep.meg = 30
  }
  // 1b) BNTG 付费通道：声望不足付 5 压印币临时使用（仅本次对话）；MEG 无付费通道
  {
    engine.rep.bntg = 0
    if (engine.canUseWarehouse('vesper')) bad('BNTG 声望 0 时寄存可用（应锁定）')
    for (let i = 0; i < 5; i++) engine.devGiveItem('presses')
    if (engine.payWarehouseAccess('meg')) bad('MEG 侧开放了付费通道（应纯声望门槛）')
    else if (!engine.payWarehouseAccess('bntg')) bad('BNTG 付费通道支付失败（持有 5 压印币）')
    else if (engine.countItem('presses') !== 0) bad(`付费未扣压印币（剩 ${engine.countItem('presses')}，应 0）`)
    else if (!engine.canUseWarehouse('vesper')) bad('付费后 BNTG 仓库仍不可用')
    else if (!engine.canUseWarehouse('dorian')) bad('付费未覆盖同阵营另一据点（存储设施 dorian）')
    else {
      engine.warehouseTempUnlock.clear() // 模拟离开对话
      if (engine.canUseWarehouse('vesper')) bad('离开对话后付费解锁未失效（应恢复锁定）')
      else console.log('  ✓ BNTG 付费通道：5 压印币临时使用（同阵营两据点放行）；离开对话恢复锁定；MEG 无付费通道')
    }
  }
  if (engine.warehouseOfNpc('kat') !== null) bad('非寄存 NPC（kat）被误判为寄存 NPC')
  // 2) 寄存与并摞：杏仁水 ×2 入 MEG 仓，再寄存 1 瓶并摞为 ×3
  engine.devGiveItem('almond'); engine.devGiveItem('almond')
  const aIdx = engine.player.hotbar.findIndex((s) => s?.type === 'almond')
  if (aIdx < 0 || engine.player.hotbar[aIdx]!.count !== 2) bad('杏仁水入包并摞异常（前置）')
  else if (!engine.warehouseDeposit('meg', { w: 'hotbar', i: aIdx })) bad('寄存杏仁水失败')
  else if (engine.countItem('almond') !== 0) bad('寄存后背包仍有杏仁水')
  else {
    engine.devGiveItem('almond')
    const a2 = engine.player.hotbar.findIndex((s) => s?.type === 'almond')
    engine.warehouseDeposit('meg', { w: 'hotbar', i: a2 })
    const occupied = engine.warehouses.meg.filter(Boolean)
    if (occupied.length !== 1 || occupied[0]!.type !== 'almond' || occupied[0]!.count !== 3)
      bad(`仓库并摞异常：${JSON.stringify(occupied)}（应单格 almond×3）`)
    else console.log('  ✓ 寄存与并摞：杏仁水 ×3 入 MEG 仓（同类同 tag 合并，背包已清空）')
  }
  // 3) 阵营互通：Gemma 基地（brandt）与 Omega（hobbs）同属 MEG 仓——Alpha 寄存、Gemma 取回
  if (engine.warehouseOfNpc('brandt') !== 'meg' || engine.warehouseOfNpc('hobbs') !== 'meg') bad('Gemma/Omega 寄存 NPC 阵营标记异常')
  else if (engine.warehouseOfNpc('vesper') !== 'bntg' || engine.warehouseOfNpc('dorian') !== 'bntg') bad('EL3A/存储设施寄存 NPC 阵营标记异常')
  else {
    engine.devJumpOutpost('gamma')
    for (let f = 0; f < 30; f++) engine.update(0.02)
    const wi = engine.warehouses.meg.findIndex((s) => s?.type === 'almond')
    if (wi < 0) bad('Gemma 访问不到 Alpha 寄存的库存（阵营互通失效）')
    else if (!engine.warehouseWithdraw('meg', wi)) bad('Gemma 取回失败')
    else if (engine.countItem('almond') !== 3) bad(`取回数量异常：${engine.countItem('almond')}（应 3）`)
    else console.log('  ✓ 阵营互通：Alpha 寄存 → Gemma 基地取回（同一 MEG 库存）')
  }
  // 4) 存档持久：仓库库存随槽位快照读写（内存 localStorage mock）
  {
    const store = new Map<string, string>()
    ;(globalThis as unknown as Record<string, unknown>).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, String(v)) },
      removeItem: (k: string) => { store.delete(k) },
    }
    engine.devGiveItem('canned')
    const cIdx = engine.player.hotbar.findIndex((s) => s?.type === 'canned')
    engine.warehouseDeposit('bntg', { w: 'hotbar', i: cIdx })
    engine.saveSlot = 'slot1'
    engine.persist()
    engine.newRun(engine.seed, 'normal', 'slot1'); engine.paused = false
    const restored = engine.warehouses.bntg.some((s) => s?.type === 'canned')
    const restoredMeg = engine.warehouses.meg.filter(Boolean).length === 0 // 杏仁水已取回，MEG 仓应为空
    if (!restored) bad('读档后 BNTG 仓库库存丢失（罐装食品不在）')
    else if (!restoredMeg) bad('读档后 MEG 仓库状态异常（应为空——杏仁水已在 Gemma 取回）')
    else console.log('  ✓ 存档持久：寄存仓库库存随槽位快照恢复')
    ;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
  }
  // 5) 48 栏上限 + 装备位拦截
  {
    for (let i = 0; i < 48; i++) engine.warehouses.bntg[i] = { type: 'knife', count: 1 }
    engine.devGiveItem('axe')
    const xIdx = engine.player.hotbar.findIndex((s) => s?.type === 'axe')
    if (engine.warehouseDeposit('bntg', { w: 'hotbar', i: xIdx })) bad('满仓（48 栏）寄存未被拦截')
    else console.log('  ✓ 48 栏上限：满仓寄存被拦截并提示')
    if (engine.warehouseDeposit('bntg', { w: 'body', i: 0 })) bad('装备位直接寄存未被拦截')
    else console.log('  ✓ 装备位拦截：身体/手套等装备位物品需先卸下才能寄存')
  }
  // 6) DevPanel 多层 NPC 传送：按 NPC 楼层带设置玩家 z/floor（EL3A 2F 运营主任 / Gemma 3F 主管）
  {
    engine.newRun(20260816, 'normal'); engine.paused = false
    engine.devJumpOutpost('el3a')
    for (let f = 0; f < 60; f++) engine.update(0.02)
    const wf = engine.npcs.find((n) => n.id === 'whitfield')
    if (!wf || (wf.floor ?? 0) !== 1) bad(`EL3A 运营主任楼层异常（floor=${wf?.floor}，应 1）`)
    else if (!engine.devGotoNpc('whitfield')) bad('devGotoNpc(whitfield) 失败')
    else if (engine.player.floor !== 1 || engine.player.z < 2.5)
      bad(`传送 2F NPC 落点异常：floor=${engine.player.floor} z=${engine.player.z.toFixed(2)}（应 floor=1、z≈3.05）`)
    else {
      for (let f = 0; f < 60; f++) engine.update(0.02)
      if (engine.player.z < 2.4) bad(`传送 2F NPC 后玩家跌回 1F（z=${engine.player.z.toFixed(2)}）`)
      else console.log(`  ✓ DevPanel 多层传送：EL3A 2F 运营主任（落点 z=${engine.player.z.toFixed(2)}，不再落 1F）`)
    }
    engine.devJumpOutpost('gamma')
    for (let f = 0; f < 60; f++) engine.update(0.02)
    const hp3 = engine.npcs.find((n) => n.id === 'harper')
    if (!hp3 || (hp3.floor ?? 0) !== 2) bad(`Gemma 主管楼层异常（floor=${hp3?.floor}，应 2）`)
    else if (!engine.devGotoNpc('harper')) bad('devGotoNpc(harper) 失败')
    else if (engine.player.floor !== 2 || engine.player.z < 5.5)
      bad(`传送 3F NPC 落点异常：floor=${engine.player.floor} z=${engine.player.z.toFixed(2)}（应 floor=2、z≈6.05）`)
    else {
      for (let f = 0; f < 60; f++) engine.update(0.02)
      if (engine.player.z < 4.5) bad(`传送 3F NPC 后玩家跌下 3F（z=${engine.player.z.toFixed(2)}）`)
      else console.log(`  ✓ DevPanel 多层传送：Gemma 3F 主管（落点 z=${engine.player.z.toFixed(2)}，楼层带 2）`)
    }
  }
  // 7) DevPanel 装饰物召唤（面前落位 + 无限层写回 LiveChunk）与召唤出口「已存在则传送」
  {
    engine.newRun(20260817, 'normal'); engine.paused = false
    engine.devJump(0) // L0 无限层
    for (let f = 0; f < 5; f++) engine.update(0.02)
    const m0 = engine.map!
    const nBefore = m0.structures.length
    if (!engine.devSpawnDecor('crate')) bad('devSpawnDecor(crate) 失败')
    else {
      const s = m0.structures[m0.structures.length - 1]
      if (m0.structures.length !== nBefore + 1 || s.kind !== 'crate') bad('装饰物未落位到 m.structures')
      else {
        const inf = m0.inf!
        const c = inf.chunks.get(`${Math.floor((inf.ox + s.x) / 32)},${Math.floor((inf.oy + s.y) / 32)}`)
        if (!c?.structures.includes(s)) bad('无限层装饰物未同步写入所属 LiveChunk（窗口平移会丢失）')
        else console.log(`  ✓ 装饰物召唤：crate 落位 (${s.x},${s.y}) 并写回 LiveChunk（solid=${s.solid}）`)
      }
    }
    // 已存在则传送：L0 保底出口已生成 → devGotoExitKind 直接传送，不重复生成
    const kind0 = m0.exits[0]?.def.kind
    const nExits = m0.exits.length
    if (!kind0) bad('L0 无已生成出口（前置异常）')
    else if (!engine.devGotoExitKind(kind0)) bad('devGotoExitKind 传送失败（出口已存在）')
    else if (m0.exits.length !== nExits) bad('「已存在则传送」却重复生成了出口')
    else {
      const e = m0.exits.find((x) => x.def.kind === kind0)!
      const d = Math.hypot(engine.player.x - e.x, engine.player.y - e.y)
      if (d > 5) bad(`传送落点离出口过远（${d.toFixed(1)}m）`)
      else console.log(`  ✓ 召唤出口「已存在则传送」：未重复生成，玩家落点距出口 ${d.toFixed(1)}m`)
    }
    // 不存在则仍走生成（devGotoExitKind false → devSummonExit）
    const missing = engine.levelDef.exits.find((e) => !m0.exits.some((x) => x.def.kind === e.kind))
    if (missing) {
      if (engine.devGotoExitKind(missing.kind)) bad('未生成的出口 devGotoExitKind 应返回 false')
      else console.log(`  ✓ 未生成的出口（${missing.name}）devGotoExitKind 返回 false，回退生成路径`)
    }
  }
  // 8) 手动保存覆盖（覆盖确认窗的底层机制：同槽再 persist 即覆盖，摘要反映最新进度）
  {
    const store = new Map<string, string>()
    ;(globalThis as unknown as Record<string, unknown>).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, String(v)) },
      removeItem: (k: string) => { store.delete(k) },
    }
    engine.saveSlot = 'slot1'
    engine.player.tapes = 1
    engine.persist()
    const first = JSON.parse(store.get('br_save_slot1')!) as { level: number; player: { tapes: number } }
    engine.player.tapes = 4
    engine.persist() // 确认覆盖 = 同槽再次写盘
    const second = JSON.parse(store.get('br_save_slot1')!) as { level: number; player: { tapes: number } }
    if (first.player.tapes !== 1) bad(`覆盖前摘要异常（tapes=${first.player.tapes}，应 1）`)
    else if (second.player.tapes !== 4) bad(`覆盖写入未生效（tapes=${second.player.tapes}，应 4）`)
    else console.log('  ✓ 手动保存覆盖：同槽再次写盘即覆盖，槽位摘要（层级/磁带/时间）反映最新进度')
    ;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
  }
  engine.newRun(20260726, 'normal'); engine.paused = false
}

// ---- v54：图鉴遭遇计数按个体去重（玩家看见 / 实体索敌 / 攻击命中——每只实体只计一次）----
{
  const { makeEntity } = await import('../src/game/entities/index.ts')
  const { loadSeen } = await import('../src/game/entities/codex.ts')
  // 遭遇计数写 br_codex_seen——启用内存 localStorage mock
  const store = new Map<string, string>()
  ;(globalThis as unknown as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
  }
  const seenOf = (t: string) => loadSeen()[t] ?? 0
  engine.newRun(20260818, 'normal'); engine.paused = false
  engine.devJump(0)
  engine.input.mx = 0; engine.input.my = 0
  for (let f = 0; f < 5; f++) engine.update(0.02)
  const p = engine.player
  p.hp = 100000
  const m0 = engine.map!
  m0.entities = [] // 清场：只统计本段注入的实体
  // 实体与玩家放同一格（d≈0：视线/朝向判定稳过，不受墙面随机性影响）
  // 1) 看见：同一只反复看见只计 1 次；同层第二只同类型各计 1 次
  const fl0 = seenOf('faceling')
  const f1 = makeEntity('faceling', p.x + 0.4, p.y)
  m0.entities.push(f1)
  for (let f = 0; f < 30; f++) engine.update(0.02)
  if (seenOf('faceling') !== fl0 + 1) bad(`看见计数异常：${seenOf('faceling') - fl0}（应 +1）`)
  else {
    for (let f = 0; f < 80; f++) engine.update(0.02) // 持续同一只
    if (seenOf('faceling') !== fl0 + 1) bad('同一只实体被重复计数（个体去重失效）')
    else console.log('  ✓ 看见计数：同一只无面灵反复看见只计 1 次')
  }
  const f2 = makeEntity('faceling', p.x - 0.4, p.y)
  m0.entities.push(f2)
  for (let f = 0; f < 30; f++) engine.update(0.02)
  if (seenOf('faceling') !== fl0 + 2) bad(`同层第二只同类型未计数（应 +2，实 +${seenOf('faceling') - fl0}）`)
  else console.log('  ✓ 个体去重：同层两只同类型实体各计 1 次')
  m0.entities = m0.entities.filter((e) => e !== f1 && e !== f2)
  // 2) 索敌计数：肢团失明（sight 0，看见路径永不触发）——噪音引动进入 chase 计一次
  const cl0 = seenOf('clump')
  const cl = makeEntity('clump', p.x + 4, p.y)
  m0.entities.push(cl)
  for (let f = 0; f < 30; f++) engine.update(0.02)
  if (seenOf('clump') !== cl0) bad('失明肢团未被引动却被计数（看见路径对 sight 0 应不生效）')
  else {
    engine.noiseEvent(p.x, p.y, 8, false) // 玩家制造噪音 → 肢团冲撞声源
    for (let f = 0; f < 30; f++) engine.update(0.02)
    if (seenOf('clump') !== cl0 + 1) bad(`实体索敌未计数（应 +1，实 +${seenOf('clump') - cl0}）`)
    else console.log('  ✓ 索敌计数：肢团被噪音引动进入追击，计 1 次（看见路径对失明实体不生效）')
  }
  m0.entities = m0.entities.filter((e) => e !== cl)
  p.stamina = 100; p.slowT = 0
  // 3) 攻击命中计数：新一只无面灵（先移远防止看见路径先计数，再拉回贴身挥击）
  const fl2 = seenOf('faceling')
  const f3 = makeEntity('faceling', p.x + 30, p.y)
  m0.entities.push(f3)
  for (let f = 0; f < 5; f++) engine.update(0.02)
  if (seenOf('faceling') !== fl2) bad('远处实体被误计数（前置异常）')
  f3.x = p.x + 0.5; f3.y = p.y // 拉到贴身（d<0.9 免朝向锥）
  engine.input.attack = true
  engine.update(0.02)
  engine.input.attack = false
  if (seenOf('faceling') !== fl2 + 1) bad(`攻击命中未计数（应 +1，实 +${seenOf('faceling') - fl2}）`)
  else console.log('  ✓ 攻击命中计数：挥击命中即计 1 次')
  // 4) 换层后新个体可再计（新实例无 encountered 标记）
  engine.devJump(1)
  for (let f = 0; f < 30; f++) engine.update(0.02)
  const m1 = engine.map!
  m1.entities = []
  const fl3 = seenOf('faceling')
  const f4 = makeEntity('faceling', engine.player.x + 0.4, engine.player.y)
  m1.entities.push(f4)
  for (let f = 0; f < 30; f++) engine.update(0.02)
  if (seenOf('faceling') !== fl3 + 1) bad('换层后新个体未计数')
  else console.log('  ✓ 换层新个体：L1 新刷无面灵可再计 1 次（不受旧个体影响）')
  ;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
  engine.newRun(20260726, 'normal'); engine.paused = false
}

// ---- v55：疫疾（Entity 19）——隐藏感染值系统 ----
{
  const { loadSeen: loadSeen2 } = await import('../src/game/entities/codex.ts')
  const seenM = () => loadSeen2()['malady'] ?? 0
  const store = new Map<string, string>()
  ;(globalThis as unknown as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
  }
  engine.newRun(20260819, 'normal'); engine.paused = false
  engine.manmadeT = 0 // 前序段落遗留的人制品效应会干扰体力恢复/治疗/进食断言——本段一律清零
  engine.devJump(0)
  engine.input.mx = 0; engine.input.my = 0
  for (let f = 0; f < 5; f++) engine.update(0.02)
  let p = engine.player // 注意：移速测试在独立新局中进行，回到本段时需重新抓取 engine.player
  const m0 = engine.map!
  p.hp = 100000
  const ti0 = () => Math.floor(p.y) * m0.w + Math.floor(p.x)
  // 1) 积累：干地板不积累 → 湿地 +1/s → 水中（liquid）不积累 → L0 锅炉房旁不积累（层级门控）
  {
    for (let f = 0; f < 100; f++) engine.update(0.02)
    if (p.infection !== 0) bad(`干地板积累了感染值（${p.infection}）`)
    m0.wet[ti0()] = 1
    for (let f = 0; f < 100; f++) engine.update(0.02)
    if (Math.abs(p.infection - 2) > 0.15) bad(`湿地积累速率异常：${p.infection.toFixed(2)}（应 ≈2，每秒 +1）`)
    else console.log('  ✓ 感染积累：潮湿地板站立每秒 +1（2s → +2）')
    m0.liquid[ti0()] = 1 // 同一格变水域——水里不算
    const w0 = p.infection
    for (let f = 0; f < 100; f++) engine.update(0.02)
    if (p.infection > w0 + 0.01) bad(`水中仍在积累感染（+${(p.infection - w0).toFixed(2)}）`)
    else console.log('  ✓ 感染积累：液态水中不积累')
    m0.liquid[ti0()] = 0
    m0.structures.push({ kind: 'sphboiler', x: Math.floor(p.x) - 1, y: Math.floor(p.y) - 1, w: 2, h: 2, solid: true })
    m0.wet[ti0()] = 0
    const b0 = p.infection
    for (let f = 0; f < 60; f++) engine.update(0.02)
    if (p.infection > b0 + 0.01) bad('L0 锅炉旁积累了感染（锅炉房规则应仅 L3/L5 生效）')
    else console.log('  ✓ 感染积累：L0 锅炉旁不积累（锅炉房规则仅 L3/L5）')
    m0.structures = m0.structures.filter((s) => s.kind !== 'sphboiler')
  }
  // 2) 阶段阈值与升阶遭遇计数（每次进入新阶段计一次；退阶后再升重新计）
  {
    const mBase = seenM()
    p.infection = 99
    for (let f = 0; f < 5; f++) engine.update(0.02)
    if (seenM() !== mBase) bad('未满一阶却计了遭遇')
    p.infection = 100
    for (let f = 0; f < 5; f++) engine.update(0.02)
    if (seenM() !== mBase + 1) bad('进入阶段1 未计遭遇')
    p.infection = 250
    for (let f = 0; f < 5; f++) engine.update(0.02)
    if (seenM() !== mBase + 2) bad('进入阶段2 未计遭遇')
    p.infection = 0
    for (let f = 0; f < 5; f++) engine.update(0.02) // 退阶
    p.infection = 120
    for (let f = 0; f < 5; f++) engine.update(0.02)
    if (seenM() !== mBase + 3) bad(`退阶后再次升阶未重新计数（实 +${seenM() - mBase}，应 +3）`)
    else console.log('  ✓ 升阶遭遇计数：每次进入新阶段计 1 次（退阶后重新升阶再计）')
    // 阶段2 咳嗽：计时归零即咳 + 噪音事件
    p.infection = 250
    engine.coughT = 0.01
    for (let f = 0; f < 5; f++) engine.update(0.02)
    if (!engine.msgLog.some((mm) => mm.text.includes('咳嗽'))) bad('阶段2 未触发咳嗽')
    else console.log('  ✓ 阶段2 潜藏期：周期咳嗽（走噪音事件，可吸引实体）')
  }
  // 3) 阶段效果：一阶体力恢复 -10% / 三阶治疗减半 / 三阶移速降低
  {
    p.infection = 150; p.stamina = 50
    for (let f = 0; f < 50; f++) engine.update(0.02)
    const regen = p.stamina - 50
    if (Math.abs(regen - 10.8) > 0.9) bad(`一阶体力恢复异常：+${regen.toFixed(1)}（应 ≈10.8 = 12×0.9）`)
    else console.log(`  ✓ 阶段1：体力恢复 -10%（1s 回 ${regen.toFixed(1)}）`)
    p.infection = 350; p.hp = 50
    engine.devGiveItem('bandage')
    const bi = p.hotbar.findIndex((s) => s?.type === 'bandage')
    engine.useSlot('hotbar', bi)
    if (Math.abs(p.hp - 65) > 0.5) bad(`三阶治疗减半异常：HP ${p.hp}（应 65）`)
    else console.log('  ✓ 阶段3：治疗减半（绷带 +30 → +15）')
    p.hp = 100000
    // 移速：感染 0 vs 350 位移比 ≈0.8（独立新局测量，避免本段遗留状态[湿地/液体/咳嗽引怪]干扰；
    // noclip 穿墙取纯位移；devTestField 远距传送会触发无限窗口平移污染坐标，不用）
    {
      engine.newRun(20260820, 'normal'); engine.paused = false
      engine.manmadeT = 0
      engine.devJump(0)
      for (let f = 0; f < 5; f++) engine.update(0.02)
      const p2 = engine.player
      p2.hp = 100000
      engine.dev.noclip = true
      const run = () => {
        const x0 = p2.x, y0 = p2.y
        // 每帧重写输入：update 末尾的 unwindInput 会按 look.yaw 反转输入（yaw=-π 时逐帧翻转 mx），
        // 只设一次会被来回反转原地抖——真实链路有 renderer.applyView 抵消，离线 smoke 没有
        for (let f = 0; f < 30; f++) { engine.input.mx = 1; engine.input.my = 0; engine.update(0.02) }
        engine.input.mx = 0
        return Math.hypot(p2.x - x0, p2.y - y0)
      }
      p2.infection = 0
      const d1 = run()
      p2.infection = 350
      const d2 = run()
      engine.dev.noclip = false
      const ratio = d2 / d1
      if (!Number.isFinite(ratio) || Math.abs(ratio - 0.8) > 0.12) bad(`三阶移速异常：比值 ${ratio}（应 ≈0.8）[d1=${d1.toFixed(2)} d2=${d2.toFixed(2)}]`)
      else console.log(`  ✓ 阶段3：移速降低（位移比 ${ratio.toFixed(2)}）`)
      engine.newRun(20260819, 'normal'); engine.paused = false
      engine.manmadeT = 0
      engine.devJump(0)
      for (let f = 0; f < 5; f++) engine.update(0.02)
      p = engine.player // 新局替换了 player 对象——重新抓取
      p.hp = 100000
    }
  }
  // 4) 物品规则（v55 二轮「恢复」buff 版）：未满一阶——杏仁水/幸运豆奶不再直接 -30，改为 60s buff
  //    （期间不增长 + 非感染区每 5s -1）；消毒液/皇家口粮保留清除效果并同样给 buff
  const mw = engine.map! // 移速测试换过局——重新取当前地图（m0 已失效）
  const ti4 = () => Math.floor(p.y) * mw.w + Math.floor(p.x)
  {
    const use = (type: string) => {
      engine.devGiveItem(type)
      let i = p.hotbar.findIndex((s) => s?.type === type)
      if (i >= 0) return engine.useSlot('hotbar', i), true
      i = p.backpack.findIndex((s) => s?.type === type)
      if (i >= 0) return engine.useSlot('backpack', i), true
      bad(`物品 ${type} 未入包`); return false
    }
    // 杏仁水：不直接降感染，给 60s buff
    p.infection = 50; engine.infectionRecoverT = 0; use('almond')
    if (p.infection !== 50 || engine.infectionRecoverT !== 60) bad(`杏仁水 buff 异常：感染 ${p.infection}（应 50 不变）· buff ${engine.infectionRecoverT}（应 60）`)
    // buff 期间湿地不增长
    mw.wet[ti4()] = 1
    for (let f = 0; f < 100; f++) engine.update(0.02)
    if (p.infection !== 50) bad(`buff 期间湿地仍增长（${p.infection}）`)
    else console.log('  ✓ 恢复 buff：杏仁水给 60s，期间湿地不再增长感染')
    // 非感染区自然消退（每 5s -1；10s → -2）
    mw.wet[ti4()] = 0
    for (let f = 0; f < 500; f++) engine.update(0.02)
    if (Math.abs(p.infection - 48) > 0.3) bad(`buff 自然消退异常：${p.infection.toFixed(2)}（10s 应 ≈48）`)
    else console.log('  ✓ 恢复 buff：非感染区每 5s -1（10s → -2）')
    // 重复服用重置 60s 计时（不叠加）
    engine.infectionRecoverT = 10; use('luckymilk')
    if (engine.infectionRecoverT !== 60) bad(`重复服用未重置 buff 计时（${engine.infectionRecoverT}，应 60）`)
    else console.log('  ✓ 恢复 buff：重复服用重置 60s（幸运豆奶同规则）')
    // 60s 到期后湿地恢复增长
    engine.infectionRecoverT = 0.05
    mw.wet[ti4()] = 1
    const exp0 = p.infection
    for (let f = 0; f < 100; f++) engine.update(0.02)
    if (!(engine.infectionRecoverT <= 0 && p.infection > exp0 + 1)) bad('buff 到期后湿地未恢复增长')
    else console.log('  ✓ 恢复 buff：60s 到期后湿地恢复增长')
    mw.wet[ti4()] = 0
    // 清除类物品 + buff 共存
    p.infection = 50; engine.infectionRecoverT = 0; use('royalration')
    if (p.infection !== 0 || engine.infectionRecoverT !== 60) bad(`皇家口粮异常：感染 ${p.infection}（应 0）· buff ${engine.infectionRecoverT}（应 60）`)
    p.infection = 150; engine.infectionRecoverT = 0; use('disinfectant')
    if (p.infection !== 0 || engine.infectionRecoverT !== 60) bad(`一阶消毒液异常：感染 ${p.infection}（应 0）· buff ${engine.infectionRecoverT}（应 60）`)
    p.infection = 250; engine.infectionRecoverT = 0; use('disinfectant')
    if (p.infection !== 50 || engine.infectionRecoverT !== 60) bad(`二阶消毒液异常：感染 ${p.infection}（应 50）· buff ${engine.infectionRecoverT}（应 60）`)
    p.infection = 350; engine.infectionRecoverT = 0; use('disinfectant')
    if (p.infection !== 350 || engine.infectionRecoverT !== 0) bad(`三阶消毒液应无效（感染 ${p.infection} · buff ${engine.infectionRecoverT}）`)
    else console.log('  ✓ 物品规则：皇家口粮/消毒液清除效果保留并同给 buff；二阶退 50；三阶无效也无 buff')
  }
  // 4b) 状态锁定覆盖感染值（dev.statLock：锁满=健康，infection 每帧锁回 0）
  {
    engine.dev.god = true; engine.dev.statLock = true
    p.infection = 100
    mw.wet[ti4()] = 1
    for (let f = 0; f < 50; f++) engine.update(0.02)
    mw.wet[ti4()] = 0
    if (p.infection !== 0) bad(`状态锁定未覆盖感染值（${p.infection}，应锁 0）`)
    else console.log('  ✓ 状态锁定：statLock 开启时 infection 每帧锁回 0（湿地也不染病）')
    engine.dev.god = false
    engine.dev.statLock = false
  }
  // 5) 医生治疗：三阶以上仅医疗身份 NPC 可清除
  {
    p.infection = 350
    if (engine.cureInfection('kat')) bad('非医疗 NPC 能治疗感染（应拦截）')
    else if (!engine.cureInfection('dupont')) bad('主任医师杜邦治疗失败')
    else if (p.infection !== 0) bad(`治疗后感染未清零（${p.infection}）`)
    else {
      p.infection = 150
      if (engine.cureInfection('saira')) bad('未满三阶医生也受理（应仅阶段≥3 可求治）')
      else console.log('  ✓ 医生治疗：三阶以上杜邦/萨伊拉等医疗 NPC 清除感染；非医疗 NPC 与未满三阶均拦截')
    }
  }
  // 6) 阶段4 坏死期：持续扣血致死
  {
    p.infection = 400; p.hp = 3
    let death = ''
    const off = engine.on((e) => { if (e.kind === 'dead') death = e.text ?? '' })
    for (let f = 0; f < 200 && !engine.over; f++) engine.update(0.02)
    off()
    if (!engine.over) bad('阶段4 未持续扣血致死')
    else if (death !== '疫疾恶化而亡') bad(`阶段4 死亡文案异常：「${death}」`)
    else console.log('  ✓ 阶段4 坏死期：持续扣血致死（「疫疾恶化而亡」）')
  }
  ;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
  engine.newRun(20260726, 'normal'); engine.paused = false
}

// ---- v55：LLM 对话 prompt 组装（离线桩验证 buildNpcPrompt 五段注入 + 历史原型）----
{
  const { buildNpcPrompt } = await import('../src/game/core/llm.ts')
  const { NPCS } = await import('../src/game/content/npcs.ts')
  const kat = buildNpcPrompt(NPCS.kat, 101) // Alpha 基地（据点环境）
  if (!kat.includes('Kat') || !kat.includes(NPCS.kat.personality) || !kat.includes(NPCS.kat.background))
    bad('prompt 角色卡缺段（姓名/性格/经历）')
  else if (!kat.includes('Alpha 基地')) bad('prompt 缺所处环境（据点 Alpha 基地）')
  else if (!kat.includes('探险者总署')) bad('prompt 缺所属团体（探险者总署）')
  else if (!kat.includes('杏仁水') || !kat.includes('切出') || !kat.includes('层级')) bad('prompt 缺后室常识包')
  else console.log('  ✓ LLM prompt：角色卡 + 据点环境 + 团体简介 + 后室常识包 全注入')
  const katL0 = buildNpcPrompt(NPCS.kat, 0) // 层级环境（非据点）
  if (!katL0.includes('Level 0')) bad('prompt 层级环境缺失（Level 0）')
  else console.log('  ✓ LLM prompt：非据点时注入层级名与氛围（Level 0）')
  const am = buildNpcPrompt(NPCS.amelia, 112) // 原住民居所
  if (!am.includes('1300~1940')) bad('原住民 prompt 缺时代谈吐指令')
  else if (!am.includes('1937') || !am.includes('传奇飞行员阿梅莉亚·埃尔哈特本人')) bad('埃尔哈特历史原型未注入')
  else console.log('  ✓ LLM prompt：原住民时代谈吐 + 埃尔哈特历史原型（1937 传奇飞行员）')
  const sm = buildNpcPrompt(NPCS.smith, 112)
  if (!sm.includes('泰坦尼克号') || !sm.includes('船长爱德华·史密斯本人')) bad('史密斯船长历史原型未注入')
  else console.log('  ✓ LLM prompt：史密斯船长历史原型（泰坦尼克号）')
  const wh = buildNpcPrompt(NPCS.white, 112)
  if (!wh.includes('1587') || !wh.includes('罗阿诺克失踪殖民队的总督约翰·怀特本人')) bad('约翰·怀特历史原型未注入')
  else console.log('  ✓ LLM prompt：约翰·怀特历史原型（1587 罗阿诺克殖民队总督）')
  const no = buildNpcPrompt(NPCS.northup, 112)
  if (!no.includes('被掳为奴十二年') || !no.includes('所罗门·诺瑟普本人')) bad('所罗门·诺瑟普历史原型未注入')
  else console.log('  ✓ LLM prompt：所罗门·诺瑟普历史原型（为奴十二年的自由作家/小提琴手）')
  // 长度预算与分错重试（v55 长输入修复；fetch 桩离线验证）
  {
    const { trimHistory, LLM_LIMITS, npcChat } = await import('../src/game/core/llm.ts')
    const hist = [
      { role: 'user', content: 'x'.repeat(800) },
      { role: 'assistant', content: 'y'.repeat(800) },
      { role: 'user', content: 'z'.repeat(100) },
    ] as { role: 'user' | 'assistant'; content: string }[]
    const tr = trimHistory(hist, LLM_LIMITS.historyChars)
    // 从最新往回装：100 + 800 = 900 装下，最旧的 800 超预算丢弃
    if (tr.length !== 2 || tr[0].content[0] !== 'y' || tr[1].content[0] !== 'z')
      bad(`历史装窗异常：${tr.map((m) => m.content.length).join(',')}`)
    else console.log('  ✓ LLM 长度预算：聊天记录按字符窗口装填，超预算丢弃最旧')
    // fetch 桩：第一次 400（内容过长）→ 裁剪重发成功；输入截断到上限
    const store = new Map<string, string>()
    store.set('br_settings', JSON.stringify({ llmEndpoint: 'http://stub.local', llmModel: 'stub' }))
    ;(globalThis as unknown as Record<string, unknown>).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, String(v)) },
      removeItem: (k: string) => { store.delete(k) },
    }
    const realFetch = globalThis.fetch
    let calls = 0
    const bodies: { messages: { role: string; content: string }[] }[] = []
    ;(globalThis as unknown as Record<string, unknown>).fetch = async (_u: string, o: { body: string }) => {
      calls++
      bodies.push(JSON.parse(o.body))
      if (calls === 1) return { ok: false, status: 400, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '收到。' } }] }) }
    }
    const longText = '长'.repeat(800)
    let reply = ''
    try { reply = await npcChat(NPCS.kat, hist, longText, 101) } catch { /* 见下方断言 */ }
    const u1 = bodies[0]?.messages.at(-1)?.content.length ?? 0
    const u2 = bodies[1]?.messages.at(-1)?.content.length ?? 0
    const h2 = bodies[1]?.messages.slice(1, -1).reduce((s, m) => s + m.content.length, 0)
    if (calls !== 2 || reply !== '收到。') bad(`400 裁剪重发失败（calls=${calls} reply=${reply}）`)
    else if (u1 !== LLM_LIMITS.userChars + 1) bad(`用户输入未截断到上限（首发 ${u1} 字符，应 ${LLM_LIMITS.userChars}+1）`)
    else if (u2 > LLM_LIMITS.userCharsRetry + 1 || h2 > LLM_LIMITS.historyCharsRetry)
      bad(`重发未按更紧预算裁剪（输入 ${u2} / 历史 ${h2}）`)
    else console.log('  ✓ LLM 长输入：输入截断 500 字；HTTP 400 自动裁剪（历史 400/输入 200）重发成功')
    // 网络失败：原样重试一次，仍败则抛错（调用方回退预制回复）
    calls = 0
    ;(globalThis as unknown as Record<string, unknown>).fetch = async () => { calls++; throw new TypeError('network down') }
    let threw = false
    try { await npcChat(NPCS.kat, [], '测试', 101) } catch { threw = true }
    if (!threw || calls !== 2) bad(`网络失败重试异常（threw=${threw} calls=${calls}，应抛错且 calls=2）`)
    else console.log('  ✓ LLM 重试：网络失败原样重试一次后抛错（回退预制回复）')
    ;(globalThis as unknown as Record<string, unknown>).fetch = realFetch
    ;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
  }
}

console.log(fail === 0 ? '\n✓ 引擎冒烟全部通过' : `\n✗ ${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
