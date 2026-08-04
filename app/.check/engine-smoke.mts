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

// ---- v43：EL3A 物流任务三路径（接取得包裹 → 当面交付得币+声望 / 丢失包裹 → 认定失败 -3 声望）+ 免费救济 ----
{
  const { genEl3aQuest } = await import('../src/game/factions.ts')
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
  const { jerryFollowerDef } = await import('../src/game/npcs.ts')
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
    p.x = j.x - 1.2; p.y = j.y; p.facing = 0
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
    p.x = j.x - 1.2; p.y = j.y; p.facing = 0
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
    p.x = j.x - 1.2; p.y = j.y; p.facing = 0
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
    p.x = j.x - 1.2; p.y = j.y; p.facing = 0
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
    p.x = zeph.x - 1.0; p.y = zeph.y; p.facing = 0
    engine.input.attack = true
    for (let f = 0; f < 10; f++) engine.update(0.02)
    if ((zeph.hp ?? 45) !== 45) bad(`教化 ≥50 挥击仍伤及信众（HP ${zeph.hp}，应 45 不变）`)
    else if (!engine.msgLog.some((mm) => mm.text.includes('他们是你的兄弟姐妹'))) bad('教化 ≥50 拦击信众缺提示')
    else console.log('  ✓ 教化约束：教化值 ≥50 挥击对信众 NPC 无效（兄弟姐妹）')
    // 驯服清零 → 约束解除（可再次伤害杰瑞）
    engine.addItem('almond')
    p.x = j.x - 1.2; p.y = j.y; p.facing = 0
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
  const { findNearestVariant, CS: ICS } = await import('../src/game/infinite.ts')
  const { l1VariantOf } = await import('../src/game/infiniteL1.ts')
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
      engine.player.facing = Math.atan2(worker.y - engine.player.y, worker.x - engine.player.x)
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
        engine.player.facing = Math.atan2(worker.y - engine.player.y, worker.x - engine.player.x)
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
  const { tileAt } = await import('../src/game/mapgen.ts')
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
    engine.player.x = spot.x + 0.7 - 1.2; engine.player.y = spot.y + 0.5; engine.player.facing = 0
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

console.log(fail === 0 ? '\n✓ 引擎冒烟全部通过' : `\n✗ ${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
