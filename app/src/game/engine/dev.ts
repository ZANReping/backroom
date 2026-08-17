// v53：开发者模式 API（召唤/传送/状态控制/层级重建/调试信息）——
// 自 engine.ts 拆分，逻辑逐语句搬运；仅供开发者面板/冒烟测试调用，不改变正常游戏流程。
import { bandOfPlayerZ, floorHeight, tileAt, walkableAt } from '../world/mapgen'
import { LEVELS } from '../levels'
import { ENTITIES, makeEntity, applyL3Variant, type Entity } from '../entities'
import { ITEMS, itemName } from '../content/items'
import { look } from '../core/renderer3d'
import { prefabsForLevel, placePrefabForced } from '../prefabs'
import { RNG, randomSeed, seedString } from '../core/rng'
import { infiniteImplFor, findNearestVariant, l0NearestExit, chunkKey, CS } from '../world/infinite'
import { l5RegionAt } from '../world/infiniteL5' // v55：L5 区域矩形判定（DevPanel 传送落点）
import { l7NearestIsland } from '../world/infiniteL7' // v57t：开发者面板「传送到最近岛屿」
import { CONTAINER_KINDS } from '../decorations/containers'
import { OUTPOSTS, isLandmarkStruct } from '../content/outposts'
import { DECOR_REGISTRY } from '../content/decorRegistry'
import { DIFF } from './shared'
import type { ExitInstance, Structure, StructKind } from '../core/types'
import type { Engine } from '../engine'

// 开发者模式：层级跳转
export function devJump(eng: Engine, id: number) {
  if (id < 0 || id >= LEVELS.length || !eng.map) return
  eng.transition = null
  eng.loadLevel(id)
  eng.emit({ kind: 'transition', anim: 'intro' })
}
/** [DEV] 据点跳转（与 enterOutpost 同路径） */
export function devJumpOutpost(eng: Engine, outpostId: string): boolean {
  const ok = eng.enterOutpost(outpostId, true) // v54：DevPanel 跳转绕过准入门槛（蓝色救赎声望门槛不影响测试）
  if (ok) eng.msg(`[DEV] 已跳转到据点「${OUTPOSTS[outpostId]?.name}」`, 'system')
  return ok
}
// ================= 开发者模式 API（v8 大扩展） =================
// 以下方法仅供开发者面板/冒烟测试调用；不改变正常游戏流程。

// 玩家视线正前方（世界系），与渲染层 look.yaw 保持一致
export function devForward(eng: Engine): { fx: number; fy: number } {
  const fx = -Math.cos(look.yaw), fy = -Math.sin(look.yaw)
  if (Math.abs(fx) < 1e-6 && Math.abs(fy) < 1e-6) return { fx: Math.cos(eng.player.facing), fy: Math.sin(eng.player.facing) }
  return { fx, fy }
}

// 以 (cx,cy) 为中心螺旋搜索最近的可站立点（地板且无实心结构）
export function devFindSpot(eng: Engine, cx: number, cy: number, maxR = 6): { x: number; y: number } | null {
  const m = eng.map
  if (!m) return null
  const solidAt = (x: number, y: number) =>
    m.structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const x = Math.floor(cx) + dx, y = Math.floor(cy) + dy
        if (x < 1 || y < 1 || x >= m.w - 1 || y >= m.h - 1) continue
        if (tileAt(m, x, y) !== 1 || solidAt(x, y)) continue
        if (m.elev[y * m.w + x] === 4) continue // 深坑洞口不可落脚
        return { x: x + 0.5, y: y + 0.5 }
      }
    }
  }
  return null
}

/** 召唤实体：在玩家前方 dist 格（默认 3）生成指定类型实体 */
export function devSpawnEntity(eng: Engine, type: string, dist = 3): boolean {
  const m = eng.map
  if (!m || !ENTITIES[type]) return false
  const p = eng.player
  const { fx, fy } = eng.devForward()
  const spot = eng.devFindSpot(p.x + fx * dist, p.y + fy * dist)
  if (!spot) { eng.msg('附近没有可召唤的空位。', 'system'); return false }
  const ent = makeEntity(type, spot.x, spot.y)
  if (eng.levelDef.id === 3) applyL3Variant(ent) // v53：L3 召唤应用高智能变体（同 chunk raw 标记）
  // v58fix：水生实体召唤到玩家所在水深（否则 z=0 浮在海面，深水玩家看不见）
  if (ent.def.aquatic) ent.z = p.z
  m.entities.push(ent)
  eng.msg(`[DEV] 召唤了 ${ENTITIES[type].name}（${spot.x.toFixed(0)}, ${spot.y.toFixed(0)}）`, 'system')
  return true
}

/** 每种实体各召唤一只，环绕玩家排开 */
export function devSpawnAllEntities(eng: Engine): number {
  let n = 0
  const types = Object.keys(ENTITIES)
  const p = eng.player
  types.forEach((t, i) => {
    const ang = (i / types.length) * Math.PI * 2
    const spot = eng.devFindSpot(p.x + Math.cos(ang) * 4, p.y + Math.sin(ang) * 4, 8)
    if (spot && eng.map) {
      const ent = makeEntity(t, spot.x, spot.y)
      if (eng.levelDef.id === 3) applyL3Variant(ent) // v53：L3 召唤应用高智能变体
      if (ent.def.aquatic) ent.z = p.z // v58fix：水生实体生成在玩家水深
      eng.map.entities.push(ent); n++
    }
  })
  eng.msg(`[DEV] 召唤了全部 ${n} 种实体（各一只）`, 'system')
  return n
}

/** 给予物品：默认进背包；toGround=true 时生成在玩家脚下 */
export function devGiveItem(eng: Engine, type: string, toGround = false): boolean {
  const m = eng.map
  if (!m || !ITEMS[type]) return false
  const p = eng.player
  if (toGround) {
    m.items.push({ id: Math.random(), type, x: p.x + 0.2, y: p.y + 0.2 })
    eng.msg(`[DEV] ${itemName(type)} 已生成在脚下`, 'system')
    return true
  }
  if (!eng.addItem(type)) { eng.msg('[DEV] 背包已满。', 'system'); return false }
  eng.msg(`[DEV] 获得 ${itemName(type)}`, 'system')
  eng.emit({ kind: 'toast', text: `+1 ${itemName(type)}` })
  return true
}

/** 一键全套补给：杏仁水×5 罐头×5 电池×3（放不下的掉到脚下） */
export function devGiveSupplies(eng: Engine) {
  const give = (t: string, n: number) => {
    for (let i = 0; i < n; i++) if (!eng.addItem(t)) eng.map?.items.push({ id: Math.random(), type: t, x: eng.player.x + Math.random() - 0.5, y: eng.player.y + Math.random() - 0.5 })
  }
  give('almond', 5); give('canned', 5); give('battery', 3)
  eng.msg('[DEV] 全套补给已发放（杏仁水×5 罐头×5 电池×3）', 'loot')
}

/** 状态控制：设置单项数值（0-100；infection 为 0-500 的隐藏感染值）。会自动解除状态锁定使数值生效。 */
export function devSetStat(eng: Engine, key: 'hp' | 'sanity' | 'hunger' | 'thirst' | 'stamina' | 'battery' | 'infection', v: number) {
  const p = eng.player
  p[key] = Math.max(0, Math.min(key === 'infection' ? 500 : 100, v))
  eng.dev.statLock = false // 解除每帧锁满，否则下一帧被覆盖
  if (key === 'battery' && p.battery > 0 && !p.flashlight) p.flashlight = true
}

/** 全部补满 */
export function devFillStats(eng: Engine) {
  const p = eng.player
  p.hp = p.sanity = p.hunger = p.thirst = p.stamina = p.battery = 100
  p.infection = 0 // v55：补满=健康，顺带清除感染
  eng.msg('[DEV] 状态已全部补满', 'system')
}

/** 全部清空（HP 保留 1 防死亡） */
export function devDrainStats(eng: Engine) {
  eng.devSetStat('hp', 1)
  eng.devSetStat('sanity', 0)
  eng.devSetStat('hunger', 0)
  eng.devSetStat('thirst', 0)
  eng.devSetStat('stamina', 0)
  eng.devSetStat('battery', 0)
  eng.msg('[DEV] 状态已清空', 'system')
}

/** 召唤指定出口：仅限本层可生成的种类（levelDef.exits）；在玩家附近邻墙地板生成一个并标记已发现 */
export function devSummonExit(eng: Engine, kind: string): boolean {
  const m = eng.map
  if (!m) return false
  const def = eng.levelDef.exits.find((e) => e.kind === kind)
  if (!def) { eng.msg('[DEV] 本层不会生成该出口。', 'system'); return false }
  const p = eng.player
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? 0 : m.tiles[y * m.w + x])
  const solidAt = (x: number, y: number) => m.structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
  // 可行走阶梯：走向需 4 格畅通（真实走下去/走上去的通道）
  const stairKind = kind === 'graystairs' || kind === 'graystairsup' || kind === 'oldstairs' // v54：L4 古典楼梯同为可行走阶梯
  const runOk = (x: number, y: number) => {
    if (!stairKind) return true
    for (const [wx, wy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (at(x + wx, y + wy) === 1) continue
      let clear = true
      for (let k = 1; k <= 4; k++) if (at(x - wx * k, y - wy * k) !== 1 || solidAt(x - wx * k, y - wy * k)) { clear = false; break }
      if (clear) return true
    }
    return false
  }
  let best: { x: number; y: number; score: number } | null = null
  for (let ty = Math.floor(p.y) - 7; ty <= Math.floor(p.y) + 7; ty++)
    for (let tx = Math.floor(p.x) - 7; tx <= Math.floor(p.x) + 7; tx++) {
      if (at(tx, ty) !== 1 || solidAt(tx, ty) || !runOk(tx, ty)) continue
      if (at(tx + 1, ty) === 1 && at(tx - 1, ty) === 1 && at(tx, ty + 1) === 1 && at(tx, ty - 1) === 1) continue // 需邻墙
      const d = Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y)
      if (d < 1.6 || d > 8) continue
      if (m.exits.some((e) => Math.floor(e.x) === tx && Math.floor(e.y) === ty)) continue
      const ang = Math.abs(Math.atan2(ty + 0.5 - p.y, tx + 0.5 - p.x) - p.facing)
      const score = d + Math.min(ang, Math.PI * 2 - ang) * 2 // 优先朝向侧
      if (!best || score < best.score) best = { x: tx, y: ty, score }
    }
  if (!best) { eng.msg('[DEV] 附近没有可放置出口的邻墙地板。', 'system'); return false }
  const exit: ExitInstance = { def, x: best.x, y: best.y, discovered: true }
  m.exits.push(exit)
  // 无限模式：同步进所属 LiveChunk，窗口重缝合后不丢（chunk 卸载后失效，dev 工具可接受）
  const inf = m.inf
  if (inf) {
    const c = inf.chunks.get(chunkKey(Math.floor((inf.ox + best.x) / CS), Math.floor((inf.oy + best.y) / CS)))
    c?.exits.push(exit)
    // 下行阶梯：走向 3 格标为深渊洞口（视觉开洞；同步 chunk 局部数组防 stitch 还原）
    if ((kind === 'graystairs' || kind === 'oldstairs') && c) { // v54：下行阶梯（含 L4 古典楼梯）走向标深渊洞口
      for (const [wx, wy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (at(best.x + wx, best.y + wy) === 1) continue
        let clear = true
        for (let k = 1; k <= 3; k++) if (at(best.x - wx * k, best.y - wy * k) !== 1) { clear = false; break }
        if (!clear) continue
        for (let k = 1; k <= 3; k++) {
          const hx = best.x - wx * k, hy = best.y - wy * k
          m.elev[hy * m.w + hx] = 4
          const lx = hx - (c.cx * CS - inf.ox), ly = hy - (c.cy * CS - inf.oy)
          if (lx >= 0 && ly >= 0 && lx < CS && ly < CS) c.elev[ly * CS + lx] = 4
        }
        break
      }
    }
    inf.redo = (inf.redo ?? 0) + 1 // 出口网格只在 chunk 构建时生成——强制重建以渲染新召唤的出口
  }
  eng.mapRev++ // 有限层：触发渲染层重建静态几何（含新出口）
  eng.msg(`[DEV] 已在附近召唤出口「${def.name}」（${best.x},${best.y}）`, 'system')
  return true
}

/** v54：召唤装饰物（DevPanel 召唤页「装饰物」标签；数据源 decorRegistry 结构类条目）。
 *  落位玩家面前 1 格；无限层同步写底层 LiveChunk（生成后修改约定，窗口平移不丢失）并触发几何重建 */
export function devSpawnDecor(eng: Engine, kind: string): boolean {
  const m = eng.map
  if (!m) return false
  const entry = DECOR_REGISTRY.find((e) => e.id === kind)
  if (!entry || entry.id.startsWith('decal:') || entry.id.startsWith('prop:')) {
    eng.msg('[DEV] 该装饰物不是可放置的结构类型。', 'system')
    return false
  }
  const p = eng.player
  const f = devForward(eng)
  const tx = Math.floor(p.x + f.fx * 1.5), ty = Math.floor(p.y + f.fy * 1.5)
  const s: Structure = { kind: kind as StructKind, x: tx, y: ty, w: 1, h: 1, solid: entry.cat === 'solid', floor: p.floor }
  m.structures.push(s)
  const inf = m.inf
  if (inf) {
    // 无限层：同步写入所属 LiveChunk（坐标窗口系，与 m.structures 共享引用）
    const c = inf.chunks.get(chunkKey(Math.floor((inf.ox + tx) / CS), Math.floor((inf.oy + ty) / CS)))
    c?.structures.push(s)
    inf.redo = (inf.redo ?? 0) + 1 // 渲染层只认 redo——重建全部已烘焙 chunk 几何
  }
  eng.mapRev++ // 有限层：触发渲染层重建静态几何
  eng.msg(`[DEV] 已在面前生成「${entry.name}」（${tx},${ty}${p.floor > 0 ? ` · ${p.floor + 1}F` : ''}）`, 'system')
  return true
}

/** v54：传送到本层已生成的指定种类出口（召唤出口「已存在则传送」；不存在返回 false，由调用方走生成） */
export function devGotoExitKind(eng: Engine, kind: string): boolean {
  const m = eng.map
  if (!m) return false
  const e = m.exits.find((x) => x.def.kind === kind)
  if (!e) return false
  const p = eng.player
  const spot = eng.devFindSpot(e.x, e.y, 3)
  if (!spot) { eng.msg('[DEV] 该出口附近没有落脚点。', 'system'); return false }
  const band = (e.floor ?? 0) as 0 | 1 | 2
  p.x = spot.x; p.y = spot.y; p.z = (e.z ?? floorHeight(m, p.x, p.y, band)) + 0.02; p.vz = 0; p.floor = band // v57t：传送带 z 轴
  eng.msg(`[DEV] 已传送到出口「${e.def.name}」`, 'system')
  return true
}

/** v57t：传送到最近的 L7 荒岛（窗口内已有则直达；否则用解析式岛核搜索窗口外的最近岛屿并流式生成） */
export function devGotoIsland(eng: Engine): boolean {
  const m = eng.map
  if (!m?.inf || eng.levelDef.id !== 7) { eng.msg('[DEV] 最近岛屿传送仅在 Level 7 开放海洋可用。', 'system'); return false }
  const inf = m.inf
  const p = eng.player
  let tx = -1, ty = -1, td = 1e9
  for (let y = 1; y < m.h - 1; y++) {
    for (let x = 1; x < m.w - 1; x++) {
      const i = y * m.w + x
      if (m.tiles[i] !== 1 || m.liquid[i] !== 0 || m.outdoor[i] !== 1 || (m.seaFloor?.[i] ?? 1) > 0.01) continue
      const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y)
      if (d < td) { td = d; tx = x; ty = y }
    }
  }
  if (tx < 0) {
    const w = l7NearestIsland(inf.seed, inf.ox + p.x, inf.oy + p.y)
    if (!w) { eng.msg('[DEV] 附近没有找到荒岛（稀有海床抬升点）。', 'system'); return false }
    p.x = w.x - inf.ox + 0.5
    p.y = w.y - inf.oy + 0.5
    p.vz = 0
    eng.updateInfiniteWindow()
    td = 1e9
    for (let y = Math.max(0, Math.floor(p.y) - 8); y <= Math.min(m.h - 1, Math.floor(p.y) + 8); y++) {
      for (let x = Math.max(0, Math.floor(p.x) - 8); x <= Math.min(m.w - 1, Math.floor(p.x) + 8); x++) {
        const i = y * m.w + x
        if (m.tiles[i] !== 1 || m.liquid[i] !== 0 || m.outdoor[i] !== 1 || (m.seaFloor?.[i] ?? 1) > 0.01) continue
        const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y)
        if (d < td) { td = d; tx = x; ty = y }
      }
    }
    if (tx < 0) { eng.msg('[DEV] 荒岛生成失败。', 'system'); return false }
  }
  p.x = tx + 0.5; p.y = ty + 0.5; p.vz = 0; p.floor = 0
  p.z = floorHeight(m, p.x, p.y, 0) + 0.05
  eng.msg(`[DEV] 已传送到最近荒岛（${(p.z > 0.5 ? '岛心高地' : '岸线')}，z=${p.z.toFixed(2)}m）`, 'system')
  return true
}

/** 传送：exit=最近出口 / entity=最近实体 / container=最近未搜容器 / spawn=出生点 / landmark=最近定居点地标 */
export function devTeleport(eng: Engine, target: 'exit' | 'entity' | 'container' | 'spawn' | 'landmark' | 'island'): boolean {
  const m = eng.map
  if (!m) return false
  const p = eng.player
  const go = (x: number, y: number, label: string, z?: number, band: 0 | 1 | 2 = 0) => {
    const spot = eng.devFindSpot(x, y, 3)
    if (!spot) { eng.msg(`[DEV] ${label}附近没有落脚点。`, 'system'); return false }
    p.x = spot.x; p.y = spot.y; p.z = (z ?? floorHeight(m, p.x, p.y, band)) + 0.02; p.vz = 0; p.floor = band // v57t：全部 dev 传送都落到目标高度带的地面上
    eng.msg(`[DEV] 已传送到${label}`, 'system')
    return true
  }
  if (target === 'island') return devGotoIsland(eng)
  if (target === 'spawn') return go(m.spawn.x, m.spawn.y, '出生点', undefined, eng.levelDef.id === 7 ? 1 : 0)
  if (target === 'landmark') {
    let bl: import('../core/types').Structure | null = null, bd = 1e9
    for (const s of m.structures) {
      if (!isLandmarkStruct(s)) continue // v55c：通用地标判定（含邀请函）
      const d = Math.hypot(s.x + 0.5 - p.x, s.y + 0.5 - p.y)
      if (d < bd) { bd = d; bl = s }
    }
    if (!bl) { eng.msg('[DEV] 本层没有定居点地标。', 'system'); return false }
    return go(bl.x + 0.5, bl.y + 1, `最近定居点地标（${bd.toFixed(1)}m）`, undefined, (bl.floor ?? 0) as 0 | 1 | 2)
  }
  if (target === 'exit') {
    const n = eng.nearestExit()
    if (!n) { eng.msg('[DEV] 本层没有出口。', 'system'); return false }
    const cand = m.exits.find((q) => Math.abs(q.x - n.x) < 1 && Math.abs(q.y - n.y) < 1)
    return go(n.x + 0.5, n.y + 0.5, '出口', cand ? cand.z ?? floorHeight(m, cand.x + 0.5, cand.y + 0.5, cand.floor ?? 0) : undefined)
  }
  if (target === 'entity') {
    let best: Entity | null = null, bd = 1e9
    for (const e of m.entities) {
      if (e.dead) continue
      const d = Math.hypot(e.x - p.x, e.y - p.y)
      if (d < bd) { bd = d; best = e }
    }
    if (!best) { eng.msg('[DEV] 本层没有存活实体。', 'system'); return false }
    return go(best.x + 1, best.y + 1, `最近实体（${best.def.name}，${bd.toFixed(1)}m）`)
  }
  // container（kind 统一走 containers.ts 注册表）
  let bs: import('../core/types').Structure | null = null, bd = 1e9
  for (const s of m.structures) {
    if (!CONTAINER_KINDS.includes(s.kind) || s.looted) continue
    const d = Math.hypot(s.x + s.w / 2 - p.x, s.y + s.h / 2 - p.y)
    if (d < bd) { bd = d; bs = s }
  }
  if (!bs) { eng.msg('[DEV] 本层没有未搜索的容器。', 'system'); return false }
  return go(bs.x + bs.w / 2, bs.y + bs.h / 2 + 1, `最近容器（${bd.toFixed(1)}m）`)
}

/** 开发者：传送到本层指定 NPC 身旁（DevPanel 传送页 NPC 列表） */
export function devGotoNpc(eng: Engine, id: string): boolean {
  const m = eng.map
  if (!m) return false
  const n = eng.npcs.find((x) => x.id === id)
  if (!n) { eng.msg('[DEV] 没有找到这名 NPC。', 'system'); return false }
  const p = eng.player
  const spot = eng.devFindSpot(n.x, n.y, 3)
  if (!spot) { eng.msg(`[DEV] ${n.def.name} 附近没有落脚点。`, 'system'); return false }
  // v54：多层据点修复——按 NPC 所在楼层带设置玩家 z 与 floor（此前只设 x/y，传到 2F/3F NPC 会落在 1F）
  const fl = (n.floor ?? 0) as 0 | 1 | 2
  p.x = spot.x; p.y = spot.y; p.z = fl * 3.0 + 0.05; p.vz = 0; p.floor = fl
  eng.msg(`[DEV] 已传送到 ${n.def.name}（${n.def.role}）身旁${fl > 0 ? `（${fl + 1}F）` : ''}`, 'system')
  return true
}

/** 时间快进：模拟 sec 秒的生存消耗（饥饿/口渴/理智/电池），不触发伤害死亡 */
export function devFastForward(eng: Engine, sec = 60) {
  const p = eng.player
  const dm = DIFF[eng.difficulty]
  const wasLocked = eng.dev.statLock
  eng.dev.statLock = false
  p.hunger = Math.max(0, p.hunger - 0.28 * dm.drain * sec)
  p.thirst = Math.max(0, p.thirst - 0.28 * dm.drain * sec)
  if (p.flashlight) p.battery = Math.max(0, p.battery - 0.5 * sec)
  const lit = eng.map ? eng.isLit(p.x, p.y) : true
  if (!lit) p.sanity = Math.max(0, p.sanity - (p.flashlight ? 0.5 : 1.5) * dm.drain * sec)
  eng.time += sec
  eng.msg(`[DEV] 快进 ${sec}s：饥饿 ${Math.round(p.hunger)} 口渴 ${Math.round(p.thirst)} 理智 ${Math.round(p.sanity)} 电池 ${Math.round(p.battery)}${wasLocked ? '（已解除状态锁定）' : ''}`, 'system')
}

/** 立即触发一次本层随机氛围事件 */
export function devTriggerEvent(eng: Engine) {
  eng.rollAmbientEvent()
}

/** 强制停电 dur 秒（已在停电中则先恢复再触发） */
export function devForceBlackout(eng: Engine, dur = 20) {
  if (eng.blackoutT > 0) eng.endBlackout()
  eng.startBlackout(dur)
}

/** v17：传送到无限 L0 最近的指定变体 chunk 中心（截图/冒烟测试用）。
 *  优先已加载窗口内的变体 chunk；没有则定位最近未生成 chunk（传送即触发流式生成）。 */
export function devGotoVariant(eng: Engine, kind: string): boolean {
  const m = eng.map
  if (!m?.inf) { eng.msg('[DEV] 当前不是无限层级。', 'system'); return false }
  const inf = m.inf
  const p = eng.player
  const impl = infiniteImplFor(eng.levelDef.id)
  const name = impl.variantNames[kind] ?? kind
  // 已生成区域内已有该变体 → 直接传送（同一窗口内无需流式加载）
  const loaded = [...inf.chunks.values()].find((c) => c.variant === kind)
  if (loaded) {
    // v55：L5 按区域矩形中心落点（大厅跨多 chunk——chunk 中心可能落在邻接走廊/房间）
    let tx = loaded.cx * CS + CS / 2, ty = loaded.cy * CS + CS / 2
    if (eng.levelDef.id === 5) {
      const reg = l5RegionAt(inf.seed, loaded.cx * CS + CS / 2, loaded.cy * CS + CS / 2)
      if (reg?.variant === kind) { tx = (reg.x0 + reg.x1) / 2; ty = (reg.y0 + reg.y1) / 2 }
    }
    const cx = tx - inf.ox, cy = ty - inf.oy
    const spot = eng.devFindSpot(cx, cy, 14)
    if (!spot) { eng.msg(`[DEV] 变种房间「${name}」附近没有落脚点。`, 'system'); return false }
    const band = eng.levelDef.id === 7 && kind === 'entry' ? 1 : 0 // L7 入口区域=2F 舱室
    p.x = spot.x; p.y = spot.y; p.z = floorHeight(m, p.x, p.y, band) + 0.02; p.vz = 0; p.floor = band // v57t：区域传送也带 z 轴
    eng.msg(`[DEV] 已传送到变种房间「${name}」（已在生成区域内）`, 'system')
    return true
  }
  // 未生成：搜索最近的目标变体 chunk 并传送（窗口平移即强制生成该新区域）
  const hit = findNearestVariant(inf.seed, inf.ox + p.x, inf.oy + p.y, kind, 120, impl.variantOf)
  if (!hit) { eng.msg(`[DEV] 附近没有变体 ${name}。`, 'system'); return false }
  // 世界坐标目标（chunk 中心）；直接改写玩家窗口坐标，由窗口平移完成流式加载
  let wcx = hit.cx * CS + CS / 2, wcy = hit.cy * CS + CS / 2
  if (eng.levelDef.id === 5) { // v55：L5 按区域矩形中心落点（同上）
    const reg = l5RegionAt(inf.seed, wcx, wcy)
    if (reg?.variant === kind) { wcx = (reg.x0 + reg.x1) / 2; wcy = (reg.y0 + reg.y1) / 2 }
  }
  p.x = wcx - inf.ox; p.y = wcy - inf.oy; p.z = 0; p.vz = 0
  eng.updateInfiniteWindow()
  const spot = eng.devFindSpot(p.x, p.y, 12)
  if (spot) { p.x = spot.x; p.y = spot.y }
  const band = eng.levelDef.id === 7 && kind === 'entry' ? 1 : 0
  p.z = floorHeight(m, p.x, p.y, band) + 0.02; p.floor = band // v57t：区域传送也带 z 轴（L7 入口=2F；ocean=海床/荒岛表面）
  eng.msg(`[DEV] 已传送到变种房间「${name}」（已生成新区域，chunk ${hit.cx},${hit.cy}）`, 'system')
  return true
}

/** 当前层级可能生成的固定结构（prefab）与变种房间清单，标注是否已出现在已生成区域 */
export function devLevelStructures(eng: Engine): {
  prefabs: { id: string; name: string; found: boolean }[]
  variants: { id: string; name: string; found: boolean }[]
} {
  const m = eng.map
  const def = eng.levelDef
  // 无限层级不走 prefab 生成路径，只有变种房间；有限层级只有固定结构
  const prefabs = m?.inf ? [] : prefabsForLevel(def.id, def.skipPrefabs).map((pf) => ({
    id: pf.id,
    name: pf.name,
    found: !!m?.structures.some((s) => s.kind === 'prefabmark' && s.data?.prefab === pf.id),
  }))
  const variants = m?.inf
    ? infiniteImplFor(def.id).rareVariants.map((v) => ({
        id: v,
        name: infiniteImplFor(def.id).variantNames[v] ?? v,
        found: [...m.inf!.chunks.values()].some((c) => c.variant === v),
      }))
    : []
  return { prefabs, variants }
}

/** 传送到指定固定结构；已生成区域没有时先在墙区开洞强制生成一个再传送 */
export function devGotoPrefab(eng: Engine, id: string): boolean {
  const m = eng.map
  if (!m || m.inf) { eng.msg('[DEV] 当前层级没有固定结构。', 'system'); return false }
  const def = prefabsForLevel(eng.levelDef.id, eng.levelDef.skipPrefabs).find((x) => x.id === id)
  if (!def) return false
  const findMark = () => m.structures.find((s) => s.kind === 'prefabmark' && s.data?.prefab === id)
  let mark = findMark()
  let forced = false
  if (!mark) {
    if (!placePrefabForced(m, new RNG(randomSeed()), id)) {
      eng.msg(`[DEV] 无法生成「${def.name}」：本图没有合适的放置空间。`, 'system')
      return false
    }
    forced = true
    eng.mapRev++ // 开洞/新结构 → 通知渲染层重建静态几何
    mark = findMark()
  }
  if (!mark?.data) return false
  const d = mark.data
  const cx = (d.rx as number) + (d.rw as number) / 2
  const cy = (d.ry as number) + (d.rh as number) / 2
  const spot = eng.devFindSpot(cx, cy, Math.max(def.w, def.h))
  if (!spot) { eng.msg('[DEV] 结构附近没有落脚点。', 'system'); return false }
  const p = eng.player
  p.x = spot.x; p.y = spot.y; p.z = 0; p.vz = 0
  eng.msg(`[DEV] 已传送到固定结构「${def.name}」${forced ? '（本图原本未生成，已强制生成）' : ''}`, 'system')
  return true
}

/** 测试场地：仅 L0 无限模式、开发者模式专用——在附近开辟 80×80 无墙空旷区域并传送（不会自然生成） */
export function devTestField(eng: Engine): boolean {
  const m = eng.map
  if (!m?.inf || eng.levelDef.id !== 0) { eng.msg('[DEV] 测试场地仅在教学关卡（Level 0）可用。', 'system'); return false }
  const p = eng.player
  const W = m.w
  // 场地中心：玩家前方 48 格（限制在当前 chunk 窗口内）
  const cx = Math.max(42, Math.min(W - 42, Math.round(p.x + 48)))
  const cy = Math.max(42, Math.min(W - 42, Math.round(p.y)))
  const R = 40
  const x0 = cx - R, y0 = cy - R, x1 = cx + R, y1 = cy + R
  const inR = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1
  // 关键：无限模式的窗口数组（m.tiles 等）只是已加载 chunk 的缝合副本，
  // 窗口平移时 stitch() 会用 chunk 数据覆盖它们——必须同步改写底层 LiveChunk，
  // 否则传送触发平移后场地立刻被原始迷宫还原；渲染层也只认 inf.redo，不认 mapRev
  const inf = m.inf!
  for (const c of inf.chunks.values()) {
    const wx0 = c.cx * CS - inf.ox, wy0 = c.cy * CS - inf.oy
    const lx0 = Math.max(x0, wx0) - wx0, ly0 = Math.max(y0, wy0) - wy0
    const lx1 = Math.min(x1, wx0 + CS - 1) - wx0, ly1 = Math.min(y1, wy0 + CS - 1) - wy0
    if (lx0 > lx1 || ly0 > ly1) continue
    for (let ly = ly0; ly <= ly1; ly++)
      for (let lx = lx0; lx <= lx1; lx++) {
        const i = ly * CS + lx
        c.tiles[i] = 1; c.elev[i] = 0; c.tint[i] = 0; c.wet[i] = 0
      }
    c.structures = c.structures.filter((s) => !inR(s.x + s.w / 2, s.y + s.h / 2))
    c.items = c.items.filter((it) => !inR(it.x, it.y))
    c.lights = c.lights.filter((l) => !inR(l.x, l.y))
    c.exits = c.exits.filter((e) => !inR(e.x, e.y))
    c.entities = c.entities.filter((e) => !inR(e.x, e.y))
  }
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x
      m.tiles[i] = 1; m.elev[i] = 0; m.step[i] = 0; m.crawl[i] = 0
      m.liquid[i] = 0; m.outdoor[i] = 0; m.tint[i] = 0; m.wet[i] = 0
      m.up[i] = 0; m.upWall[i] = 0; m.stair[i] = 0; m.ceiling[i] = 0
      m.up2[i] = 0; m.upWall2[i] = 0 // v54：三层数组同步重置
    }
  // 清空区域内结构/物品/实体/光源/出口（空旷无阻挡）
  m.structures = m.structures.filter((s) => !inR(s.x + s.w / 2, s.y + s.h / 2))
  m.items = m.items.filter((it) => !inR(it.x, it.y))
  m.entities = m.entities.filter((e) => !inR(e.x, e.y))
  m.lights = m.lights.filter((l) => !inR(l.x, l.y))
  m.exits = m.exits.filter((e) => !inR(e.x, e.y))
  // 场地照明：按 8 格网格补灯，同时写入窗口数组与底层 LiveChunk——
  // 窗口平移 stitch 从 chunk 重建 m.lights 后灯仍在（清空 gen 灯后场地不能是黑场）
  for (let y = y0 + 4; y <= y1; y += 8)
    for (let x = x0 + 4; x <= x1; x += 8) {
      const L = { x: x + 0.5, y: y + 0.5, r: 5, color: '#d9c39a', flickerSeed: Math.random() * 100, gen: 1 as const }
      m.lights.push(L)
      for (const c of inf.chunks.values()) {
        const wx0 = c.cx * CS - inf.ox, wy0 = c.cy * CS - inf.oy
        if (L.x >= wx0 && L.x < wx0 + CS && L.y >= wy0 && L.y < wy0 + CS) { c.lights.push(L); break }
      }
    }
  p.x = cx; p.y = cy; p.z = 0; p.vz = 0
  eng.mapRev++ // 有限层渲染重建用（无限层忽略，保留无害）
  inf.redo = (inf.redo ?? 0) + 1 // 无限层：通知渲染层重建全部已烘焙 chunk 几何
  eng.msg('[DEV] 已生成「测试场地」（80×80 空旷区域）并传送。', 'system')
  return true
}

/** v17：传送到最近的保底出口「闪烁的墙壁」（窗口外也可达） */
export function devGotoExit(eng: Engine): boolean {
  const m = eng.map
  if (!m?.inf) return eng.devTeleport('exit')
  const inf = m.inf
  const p = eng.player
  const band = bandOfPlayerZ(m, p.z)
  const w = l0NearestExit(m, eng.levelDef, inf.ox + p.x, inf.oy + p.y, band)
  if (!w) { eng.msg('[DEV] 未找到保底出口。', 'system'); return false }
  // 出口世界坐标 → 站到出口旁 1 格
  const wex = w.x + inf.ox + 0.5, wey = w.y + inf.oy + 0.5
  p.x = wex - inf.ox + 1; p.y = wey - inf.oy; p.vz = 0
  eng.updateInfiniteWindow()
  // 平移后精确站在出口相邻地板瓦片上（交互半径内）
  const e = m.exits.find((q) => (q.floor ?? 0) === band)
  if (e) {
    let placed = false
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const tx = Math.floor(e.x) + dx, ty = Math.floor(e.y) + dy
      if (walkableAt(m, tx, ty, band)) {
        p.x = tx + 0.5; p.y = ty + 0.5; placed = true; break
      }
    }
    if (!placed) {
      const spot = eng.devFindSpot(e.x + 0.5, e.y + 1.5, 4)
      if (spot) { p.x = spot.x; p.y = spot.y }
    }
  }
  p.z = (e?.z ?? floorHeight(m, p.x, p.y, band)) + 0.02 // v57t：漂浮门等出口用自身 z
  p.floor = band
  eng.msg(`[DEV] 已传送到出口「闪烁的墙壁」（约 ${w.d.toFixed(0)}m 外）`, 'system')
  return true
}

/** 重新生成当前层级：newSeed=true 换随机种子，否则同种子重建 */
export function devRegenLevel(eng: Engine, newSeed: boolean) {
  if (!eng.map) return
  if (newSeed) eng.seed = Math.floor(Math.random() * 0x7fffffff)
  eng.transition = null
  eng.loadLevel(eng.player.level)
  eng.emit({ kind: 'transition', anim: 'intro' })
  eng.msg(`[DEV] 层级已重新生成（${newSeed ? '新' : '同'}种子 ${seedString(eng.seed)}）`, 'system')
}

/** 清场：击杀本层全部实体 */
export function devKillAllEntities(eng: Engine): number {
  const m = eng.map
  if (!m) return 0
  let n = 0
  for (const e of m.entities) {
    if (e.dead) continue
    e.hp = 0; e.dead = true; e.deathT = 1.4; n++
    eng.bloodParticles(e.x, e.y)
  }
  eng.player.kills += n
  eng.msg(`[DEV] 清场：击杀 ${n} 只实体`, 'system')
  return n
}

/** 调试信息快照（信息页签展示用） */
export function devInfo(eng: Engine) {
  const m = eng.map
  const p = eng.player
  const tx = Math.floor(p.x), ty = Math.floor(p.y)
  const idx = m ? ty * m.w + tx : -1
  const mm = m as unknown as { elev?: Uint8Array; outdoor?: Uint8Array } | null
  const elev = m && mm?.elev && idx >= 0 && idx < mm.elev.length ? mm.elev[idx] : undefined
  const outdoor = m && mm?.outdoor && idx >= 0 && idx < mm.outdoor.length ? mm.outdoor[idx] === 1 : undefined
  const ents = (m?.entities ?? [])
    .map((e) => ({
      type: e.def.type, name: e.def.name,
      d: Math.hypot(e.x - p.x, e.y - p.y),
      state: e.dead ? 'dead' : e.hidden ? 'hidden' : e.disguised ? 'disguised' : e.state,
      hp: e.hp,
    }))
    .sort((a, b) => a.d - b.d)
  const containers = (m?.structures ?? []).filter((s) => CONTAINER_KINDS.includes(s.kind))
  return {
    x: p.x, y: p.y, z: p.z, tx, ty, elev, outdoor,
    level: p.level, seed: eng.seed, time: eng.time,
    entities: ents,
    containers: { total: containers.length, unlooted: containers.filter((s) => !s.looted).length },
    exits: (m?.exits ?? []).map((e) => ({ name: e.def.name, d: Math.hypot(e.x + 0.5 - p.x, e.y + 0.5 - p.y), discovered: e.discovered })),
    landmarks: (m?.structures ?? [])
      .filter((s) => isLandmarkStruct(s)) // v55c：通用地标判定（含邀请函）
      .map((s) => ({ name: OUTPOSTS[(s.data?.outpost as string) ?? '']?.name ?? '定居点地标', d: Math.hypot(s.x + 0.5 - p.x, s.y + 0.5 - p.y) })),
    blackout: eng.blackoutT > 0 ? eng.blackoutT : 0,
  }
}
