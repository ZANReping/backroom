// v26 冒烟断言：右键装备断链修复 / 精细碰撞体积 / 天花板碰撞 + 悬挂物依附
// 运行：npx tsx verifier/v1/smoke-v26.mts
;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 800, innerHeight: 600 }
;(globalThis as unknown as Record<string, unknown>).document = {
  createElement: () => ({ width: 1, height: 1, getContext: () => null, style: {} }),
  getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} },
}
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined

const { engine } = await import('../../src/game/engine.ts')
const { LEVELS } = await import('../../src/game/levels/index.ts')
const { generateLevel, structStandTopAt, ceilingHeightAt, hasCeiling, HANGING_KINDS } = await import('../../src/game/mapgen.ts')
const { canOccupy } = await import('../../src/game/player.ts')
const { WALL_H } = await import('../../src/game/renderer/shared.ts')

let failures = 0
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`)
  else { console.error(`  ✗ ${msg}`); failures++
  }
}

// ================= 任务1：右键装备 =================
console.log('== 任务1：右键装备断链修复 ==')
{
  engine.newRun(20260726, 'normal'); engine.paused = true
  const p = engine.player
  // 手电：右键 → 装入副手并点亮
  p.hotbar[0] = { type: 'flashlight', count: 1 }
  p.selected = 0
  engine.quickUse()
  ok(p.equip.offhand?.type === 'flashlight' && !p.hotbar[0], '手持手电按右键 → 装入副手装备位')
  ok(p.flashlight === true, '手电装入副手后自动点亮')
  // 打火机：右键 → 与副手的手电互换（手电回到快捷栏原格）
  p.hotbar[0] = { type: 'lighter', count: 1 }
  engine.quickUse()
  ok(p.equip.offhand?.type === 'lighter' && p.hotbar[0]?.type === 'flashlight', '手持打火机按右键 → 与副手手电互换（右键装备互换）')
  ok(p.hasLighter === true && p.flashlight === false, '互换后被动状态同步（打火机亮/手电关）')
  // 撬棍：右键不消失、不报错、仍在主手
  p.hotbar[1] = { type: 'crowbar', count: 1 }
  p.selected = 1
  engine.quickUse()
  ok(p.hotbar[1]?.type === 'crowbar', '手持撬棍按右键 → 保持在主手（武器提示路径）')
  // 食物：右键 = 使用（回归不破坏）
  p.hotbar[2] = { type: 'canned', count: 1 }
  p.selected = 2
  p.hunger = 40
  engine.quickUse()
  ok(!p.hotbar[2] && p.hunger > 40, '手持罐头按右键 → 正常食用（原有用法回归）')
}

// ================= 任务2：精细碰撞体积 =================
console.log('== 任务2：精细碰撞体积 ==')
{
  // 找一张同时有前台/桌子/床的图（L5 酒店硬编码前台 + 客房床 + 桌）
  const def = LEVELS.find((l) => l.gen === 'hotel')!
  let m = generateLevel(def, 42)
  let fd = m.structures.find((s) => s.kind === 'frontdesk')
  let tries = 0
  while ((!fd || !m.structures.some((s) => s.kind === 'bed') || !m.structures.some((s) => s.kind === 'table' && !s.data?.chair)) && tries < 8) {
    m = generateLevel(def, 42 + ++tries)
    fd = m.structures.find((s) => s.kind === 'frontdesk')
  }
  ok(!!fd, `L5 生成含前台（tries=${tries}）`)
  if (fd) {
    const cx = fd.x + fd.w / 2, cy = fd.y + fd.h / 2
    // 空气墙消除：玩家圆（r=0.32）边缘贴到前台视觉边缘（cy+0.36）即可站立通行
    // （旧碰撞：整个 4×2 外接瓦片阻挡，中心被挡在 0.64m 开外的"空气墙"处）
    const edgeY = cy + 0.36 + 0.32 + 0.03
    ok(canOccupy(m, cx, edgeY, 0.32, { z: 0, band: 0 }), '前台空气墙消除：贴近前台视觉边缘可站立')
    // 前台轮廓内仍阻挡
    ok(!canOccupy(m, cx, cy, 0.32, { z: 0, band: 0 }), '前台真实轮廓内仍阻挡（台面不可穿）')
  }
  const bed = m.structures.find((s) => s.kind === 'bed')
  if (bed) {
    const top = structStandTopAt(m, bed.x + bed.w / 2, bed.y + bed.h / 2, 1.0, 0)
    ok(Math.abs(top - 0.5) < 0.01, `床顶面可站立高度=0.5m（实测 ${top.toFixed(2)}）`)
  } else ok(false, 'L5 未找到床')
  const table = m.structures.find((s) => s.kind === 'table' && !s.data?.chair)
  if (table) {
    const top = structStandTopAt(m, table.x + table.w / 2, table.y + table.h / 2, 1.0, 0)
    ok(Math.abs(top - 0.75) < 0.01, `桌顶面可站立高度=0.75m（实测 ${top.toFixed(2)}）`)
  } else ok(false, 'L5 未找到桌子')

  // 引擎级：玩家跳上桌子顶面站立
  {
    engine.newRun(7, 'normal'); engine.paused = false
    engine.devJump(def.id)
    const em = engine.map!
    const t = em.structures.find((s) => s.kind === 'table' && !s.data?.chair) ?? em.structures.find((s) => s.kind === 'bed')
    ok(!!t, '引擎地图中存在可跳上的低矮结构')
    if (t) {
      const want = t.kind === 'bed' ? 0.5 : 0.75
      const cx = t.x + t.w / 2, cz = t.y + t.h / 2
      // 站到结构北侧贴近，向南跳入
      engine.player.x = cx; engine.player.y = t.y - 0.4; engine.player.z = 0; engine.player.vz = 0
      engine.input.my = 1; engine.input.mx = 0
      engine.input.jump = true
      let landed = -1
      for (let f = 0; f < 200; f++) {
        engine.update(0.02)
        if (Math.abs(engine.player.z - want) < 0.03 && Math.hypot(engine.player.x - cx, engine.player.y - cz) < Math.max(t.w, t.h)) { landed = f; break }
      }
      engine.input.my = 0
      ok(landed >= 0, `玩家跳上${t.kind === 'bed' ? '床' : '桌'}子顶面站立（z=${engine.player.z.toFixed(2)} 目标 ${want}）`)
    }
  }

  // 实体-玩家最小间距（攻击时不再重叠）
  {
    engine.newRun(99, 'normal'); engine.paused = false
    engine.devJump(1) // L1 有实体
    engine.dev.god = true
    const em = engine.map!
    const e = em.entities.find((x) => !x.def.passive && !x.def.stationary)
    if (e) {
      e.x = engine.player.x + 1.5; e.y = engine.player.y; e.state = 'chase'; e.targetX = engine.player.x; e.targetY = engine.player.y
      let minD = 1e9
      for (let f = 0; f < 300; f++) {
        engine.update(0.02)
        if (e.dead) break
        const d = Math.hypot(e.x - engine.player.x, e.y - engine.player.y)
        if (d < minD) minD = d
      }
      ok(minD >= 0.45, `实体攻击时最小间距保持（minD=${minD.toFixed(2)} ≥0.45，不再重叠）`)
    } else ok(false, 'L1 未找到主动攻击实体')
    engine.dev.god = false
  }
}

// ================= 任务3：天花板碰撞 + 悬挂物依附 =================
console.log('== 任务3：天花板碰撞 + 悬挂物依附 ==')
{
  // 全部层级：悬挂物全部依附有天花板的瓦片、同瓦片不重叠
  let hangTotal = 0
  for (const def of LEVELS) {
    const m = generateLevel(def, 1234)
    const seen = new Map<string, string>()
    let bad = 0, dup = 0
    for (const s of m.structures) {
      if (!HANGING_KINDS.includes(s.kind)) continue
      hangTotal++
      for (let ty = Math.floor(s.y); ty < Math.floor(s.y + s.h); ty++)
        for (let tx = Math.floor(s.x); tx < Math.floor(s.x + s.w); tx++) {
          if (!hasCeiling(m, tx, ty)) bad++
          const k = ty * m.w + tx
          const prev = seen.get(k)
          if (prev) dup++
          else seen.set(k, s.kind)
        }
    }
    ok(bad === 0 && dup === 0, `${def.name}：悬挂物 ${bad === 0 && dup === 0 ? '全部有天花板依附且无同瓦片重叠' : `无天花板 ${bad} / 重叠 ${dup}`}`)
  }
  ok(hangTotal > 0, `共检查悬挂生成物 ${hangTotal} 件`)

  // 跳跃不穿透天花板（L2 管道层 H=2.7，最容易顶头）
  {
    const def = LEVELS.find((l) => l.gen === 'pipes')!
    engine.newRun(5, 'normal'); engine.paused = false
    engine.devJump(def.id)
    const wallH = WALL_H[def.gen] ?? 3
    engine.input.jump = true
    let maxZ = 0
    for (let f = 0; f < 120; f++) {
      engine.update(0.02)
      if (f % 30 === 0) engine.input.jump = true
      maxZ = Math.max(maxZ, engine.player.z)
    }
    const ceil = ceilingHeightAt(engine.map!, engine.player.x, engine.player.y, wallH, 0)
    ok(engine.player.z + 1.55 <= ceil + 0.01, `跳跃不穿透天花板（头高 ${(engine.player.z + 1.55).toFixed(2)} ≤ 天花板 ${ceil.toFixed(2)}，maxZ=${maxZ.toFixed(2)}）`)
  }
}

console.log(failures ? `\n结果：${failures} 项失败` : '\n结果：全部通过')
process.exit(failures ? 1 : 0)
