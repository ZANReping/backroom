// v53：层级切换与出口（loadLevel/takeExit/可行走灰色阶梯/据点往返/无限窗口平移）——
// 自 engine.ts 拆分，逻辑逐语句搬运；eng 参数即 Engine 实例（公共 API 门面仍在 engine.ts）。
import { bandOfPlayerZ, floorHeight, generateLevel, tileAt } from '../world/mapgen'
import { levelDefOf, levelLabel, NORMAL_LEVELS } from '../levels'
import { canOccupy, PLAYER_RADIUS } from '../core/player'
import { audio } from '../core/audio'
import { NPCS, type NpcDef } from '../content/npcs'
import { OUTPOSTS, isLandmarkStruct } from '../content/outposts'
import { FACTIONS, REP_TIER } from '../content/factions'
import { updateInfinite, l0NearestExit, chunkKey, CS, infiniteImplFor, h32 } from '../world/infinite'
import type { ExitDef, ExitInstance, FloorBand } from '../core/types'
import type { Engine } from '../engine'
import { resetEffects } from './effects'
import { persist as persistSave } from './save'

export function loadLevel(eng: Engine, id: number, restore?: { mapSeed: number; firstVisit: boolean }) {
  const def = levelDefOf(id)!
  // v29：初始物资仅首次到层刷新（重访 L0 不再白嫖出生点补给）
  const firstVisit = !eng.visitedLevels.has(id)
  eng.visitedLevels.add(id)
  // v29：经 L0 灰色阶梯下行 → L1 出生点附近生成返程阶梯（在换图前取走标记）
  const viaStairs = eng.arriveStairs
  eng.arriveStairs = false
  // v51：乘电梯抵达（在换图前取走标记；读档恢复 restore 路径不套用电梯落点——存档以原出生点为准）
  const viaElevator = eng.arriveElevator && !restore
  eng.arriveElevator = false
  // v54：经古典楼梯抵达（同上取走标记；仅 L5 消费——L4→L5 落楼梯 2 格外空旷地板）
  const viaOldstairs = eng.arriveOldstairs && !restore
  eng.arriveOldstairs = false
  const l6Band = id === 6 && !restore ? (eng.arriveL6Band ?? 0) : null
  eng.arriveL6Band = null
  // v29a：读档恢复时复用存档记录的地图种子与首访标记，保证复现同一张图
  const mapSeed = restore?.mapSeed ?? eng.mpMapSeed?.(id) ?? (eng.seed + eng.time * 7 + id * 131) // v58：联机——确定性层级种子（全房间同图，先到先得即同布局）
  const fv = restore?.firstVisit ?? firstVisit
  eng.map = generateLevel(def, mapSeed, fv)
  eng.mapSeed = mapSeed
  eng.mapFirstVisit = fv
  eng.bonusExit = null
  eng.wallMarks = [] // 地图重新生成，旧粉笔记号随之失效
  eng.player.level = id
  eng.player.x = eng.map.spawn.x + 0.5
  eng.player.y = eng.map.spawn.y + 0.5
  // v51：乘电梯抵达——出生点改到本层电梯（elevatorshaft 出口）邻格；找不到可站邻格则保留默认出生点
  if (viaElevator) {
    const elev = eng.map.exits.find((e) => e.def.kind === 'elevatorshaft')
    if (elev) {
      const m = eng.map
      outer: for (let rad = 1; rad <= 4; rad++)
        for (let dy = -rad; dy <= rad; dy++)
          for (let dx = -rad; dx <= rad; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
            const nx = Math.floor(elev.x) + dx, ny = Math.floor(elev.y) + dy
            if (!canOccupy(m, nx + 0.5, ny + 0.5, PLAYER_RADIUS, { z: 0 })) continue
            eng.player.x = nx + 0.5; eng.player.y = ny + 0.5
            break outer
          }
    }
  }
  // v54：经古典楼梯下行抵达 L5——出生点改到本层古典楼梯（oldstairs 出口，出生 chunk 保底 1 部）
  // 2 格外的空旷地板（切比雪夫距 ≥2 的第一圈可站格；找不到则放宽到 4 格，再找不到保留默认出生点）
  if (viaOldstairs && id === 5) {
    const st = eng.map.exits.find((e) => e.def.kind === 'oldstairs')
    if (st) {
      const m = eng.map
      outer: for (let rad = 2; rad <= 4; rad++)
        for (let dy = -rad; dy <= rad; dy++)
          for (let dx = -rad; dx <= rad; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
            const nx = Math.floor(st.x) + dx, ny = Math.floor(st.y) + dy
            if (!canOccupy(m, nx + 0.5, ny + 0.5, PLAYER_RADIUS, { z: 0 })) continue
            eng.player.x = nx + 0.5; eng.player.y = ny + 0.5
            break outer
          }
    }
  }
  eng.player.z = 0
  eng.player.vz = 0
  eng.player.crouching = false
  eng.player.floor = 0
  // v57m：L7 入口舱体位于 2F——出生点按注册的 spawnFloor 落在上层楼板
  if (eng.map.inf) {
    const m2 = eng.map
    const spawnBand = infiniteImplFor(id).spawnFloor ?? 0
    if (spawnBand === 1 && m2.up[Math.floor(eng.player.y) * m2.w + Math.floor(eng.player.x)] === 1) {
      eng.player.z = floorHeight(m2, eng.player.x, eng.player.y, 1)
      eng.player.floor = 1
    }
  }
  if (id === 6 && l6Band !== null) {
    const target = l6Band
    const stair = eng.map.structures.find((s) => s.kind === 'l6stairwell' && (s.floor ?? 0) === target)
    const cx = stair ? stair.x + 0.5 : eng.map.spawn.x + 0.5
    const cy = stair ? stair.y + 0.5 : eng.map.spawn.y + 0.5
    let placed = false
    outer: for (let r = 1; r <= 10; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
      const x = Math.floor(cx) + dx + 0.5, y = Math.floor(cy) + dy + 0.5
      const z = floorHeight(eng.map, x, y, target)
      if (!canOccupy(eng.map, x, y, PLAYER_RADIUS, { z, band: target })) continue
      eng.player.x = x; eng.player.y = y; eng.player.z = z; eng.player.floor = target; placed = true
      break outer
    }
    if (!placed && target === -1) {
      eng.player.z = floorHeight(eng.map, eng.player.x, eng.player.y, -1)
      eng.player.floor = -1
    }
  }
  eng.introT = 0 // 层级切换不播爬起动画
  eng.inLiquid = 0
  eng.submerged = false
  eng.breathT = 0
  eng.wasSubmerged = false
  eng.ride = null
  eng.climb = null
  eng.porchDrop = null // v58：换层中止门廊拖拽演出
  audio.setUnderwater(false)
  eng.explored = new Uint8Array(eng.map.w * eng.map.h)
  eng.visible = new Uint8Array(eng.map.w * eng.map.h)
  if (def.fullMap) eng.explored.fill(1) // v35：据点——进入即获得完整地图
  if (id === 105) eng.el3aReliefClaimed = false // v43：每次进入 EL3A 可领一次免费补给包
  eng.fakes = []
  eng.particles = []
  eng.searching = null
  eng.lootPanel = null
  eng.redAnnounced = new Set()
  // v35：NPC 实例化（据点居民；不是实体；定义 = 静态注册表 + 本图随机生成）
  const npcDefMap = new Map<string, NpcDef>()
  for (const d of Object.values(NPCS)) npcDefMap.set(d.id, d)
  for (const d of eng.map.npcDefs ?? []) npcDefMap.set(d.id, d)
  eng.npcs = (eng.map.npcs ?? [])
    .filter((sp) => npcDefMap.has(sp.id))
    .map((sp) => ({
      id: sp.id, def: npcDefMap.get(sp.id)!,
      x: sp.x, y: sp.y, facing: sp.facing ?? Math.random() * Math.PI * 2,
      floor: sp.floor ?? 0, // v46：多层据点——上层居民（EL3A 夹楼办公区 NPC 在 2F 游荡/交互）
      homeX: sp.x, homeY: sp.y, tx: sp.x, ty: sp.y,
      moveT: 1 + Math.random() * 5, bubbleText: '', bubbleT: 0,
    }))
  for (const n of eng.npcs) if (!eng.knownNpcs.some((k) => k.id === n.id)) eng.knownNpcs.push(n.def)
  // v39：无限层级的 chunk NPC（衔尾段 BRC 员工）——活体对象由 LiveChunk 持有，这里收集为工作列表
  if (eng.map.inf) eng.syncInfNpcs()
  // 持续性效果状态换层重置（EFFECTS 注册表 level 组：停电计时/备份、provoked、植殖癌进展——逐字段语义一致）
  resetEffects(eng, 'level')
  // 现象「孤立效应」：每次进入 Level 0，画面微调色重新随机（极其轻微，一般无法察觉）
  eng.colorGrade = id === 0
    ? {
        hue: (Math.random() * 2 - 1) * 1.5,
        sat: 1 + (Math.random() * 2 - 1) * 0.02,
        con: 1 + (Math.random() * 2 - 1) * 0.015,
        bri: 1 + (Math.random() * 2 - 1) * 0.02,
      }
    : { hue: 0, sat: 1, con: 1, bri: 1 }
  if (id === 1 && viaStairs && eng.map.inf) eng.placeBonusStairs() // v29：返程「向上的灰色阶梯」
  eng.ambientT = 10 + Math.random() * 8
  audio.startHum(id)
  audio.startBGM(id)
  if (id === 6) audio.stopBGM() // L6 除罕见幻听外保持寂静
  if (id === 4) audio.startRain() // v54：L4 常驻雨声（永不止歇的大雨）；离层即停
  else audio.stopRain()
  eng.emit({ kind: 'levelchange' })
  eng.msg(`${levelLabel(id)}「${def.name}」`, 'lore')
  if (def.sd) eng.msg(def.sd, 'system')
  eng.msg(`入口：${def.entrance}`, 'system')
  // 出口类型线索（任务 9）
  const hintKinds: Record<string, string> = {
    firedoor: '某处有一扇漆成红色的消防门。',
    crack: '你感觉某面墙后面「不太对劲」——像是空间本身的裂缝。',
    collapse: '某处地板看起来不结实。',
    freight: '你隐约听见货运电梯绞盘的锈响。',
    hatch: '某处有一个维修通道的方形舱口。',
    stairs: '楼梯井的穿堂风从某个方向吹来。',
    unlockeddoor: '某处有一扇没上锁的门——推开试试。',
    breakerdoor: '主电闸门就在本层，配电声隐隐可闻。',
    shaft: '排水竖井的滴水声在地底回荡。',
    backvent: '回流通风口在本层某处。',
    elevatorshaft: '电梯井在等两枚保险丝。',
    emergstairs: '绿色应急灯应该标着应急楼梯的方向。',
    arcflash: '某处有电弧短路的焦味——那也许能切出本层。',
    stafflift: '员工电梯需要门禁卡。',
    window: '落地窗的方向能感到微弱气流。',
    fireexit: '消防通道的指示牌在黑暗中发着绿光。',
    revolving: '大堂旋转门是离开这里的正门。',
    servicelift: '货运梯藏在本层的服务区。',
    mirror: '本层的某面镜子不是镜子。',
    flickerdoor: '某处有一面墙在规律地闪烁——跟着电流声与气流走。',
    // v23：Level 5–11 与结局层
    boilerdeep: '锅炉房深处的管道后面有一道下行的口子。据说从那里能到 Level 6。',
    darkwooddoor: '某间客房的门颜色深得不对劲——那不是客房门。',
    seastairs: '往下走，仔细听——某个方向传来极微弱的海浪声。',
    seahatch: '苔原某处的井盖下传来极微弱的海浪声。',
    cave8: '地下廊道深处，有一段墙面坍成了天然洞穴。',
    coldgate: '你摸到一扇金属门，冰得手指发麻。',
    wiretrip: '脚踝高度有一根绷紧的细线。别绊到——除非你想去 Level 6.1。',
    l7cave: '午夜带的海床上偶尔会露出一个岩洞洞口。里面很深，深得不像海。',
    notexit: '深水里漂着一扇门，门牌写着「不是出口」。没有墙，也没有门框后面该有的房间。',
    ninthroad: '第九之路的路标每五十米一个，牌子上有 M.E.G. 的标志。跟着走。',
    tarpool: '前面有一池冒着热气的黑色焦油。幸存者说他们在 Level 41 或 91 醒来。',
    ceilclip: '洞顶某处的岩层薄得不正常——可以刻意向上剪辑出去。',
    arrowsign: '路口立着带箭头的路牌。沿着它走一百到两百英里，会到一座城市。',
    grasspath: '街区之间有一条通往草地的步道。',
    streetclip: '这段街面的沥青摸上去是软的。',
    longroad: '双车辙的土路笔直伸向地平线。它通向一座城市。',
    canola: '远处一片刺眼的黄——那是油菜地。它不属于这里的调色板。',
    lakeswim: '湖水清澈见底，底下却没有底。',
    basebeta: 'M.E.G. Base Beta 的档案室在城里。档案员要看齐六盘磁带才肯开门。',
    shopsign: '街上有一排陌生的店招。每一块牌子后面都是另一层。',
    groundclip: '这一段人行道下面是空的。',
    homedoor: '走廊尽头那扇门后面透出暖黄的光。门缝底下摆着一双拖鞋。',
    trueend: '中央那排金属字母底下有一扇门。没有装饰，也没有灯。',
  }
  const ex = eng.map.exits[0]
  if (ex) eng.msg(`出口线索：${hintKinds[ex.def.kind] ?? `找到 ${ex.def.name}。`}`, 'lore')
  // v54：切层自动保存到「自动保存」槽（读档恢复路径不写——避免用出生点状态盖回刚读取的槽位快照）
  if (!restore) persistSave(eng, 'auto')
}
/** v39：无限层级 NPC 同步——从已加载 LiveChunk 收集活体 NPC（窗口平移后重收集：
 *  新 chunk 的员工加入、卸载 chunk 的员工消失；对象身份跨平移保持，状态不丢） */
export function syncInfNpcs(eng: Engine) {
  const m = eng.map
  if (!m?.inf) return
  eng.npcs = []
  for (const c of m.inf.chunks.values()) for (const n of c.npcs) eng.npcs.push(n)
  for (const n of eng.npcs) if (!eng.knownNpcs.some((k) => k.id === n.id)) eng.knownNpcs.push(n.def)
}

export function updateInfiniteWindow(eng: Engine) {
  const m = eng.map!
  const shift = updateInfinite(m, eng.levelDef, eng.player.x, eng.player.y, eng.explored)
  if (!shift) return
  const { dx, dy } = shift
  const p = eng.player
  p.x -= dx; p.y -= dy
  for (const f of eng.fakes) { f.x -= dx; f.y -= dy }
  for (const pt of eng.particles) { pt.x -= dx; pt.y -= dy }
  for (const pr of eng.projectiles) { pr.x -= dx; pr.y -= dy }
  // 窗口重建对象列表：中断进行中的引用型状态
  eng.searching = null
  eng.lootPanel = null
  eng.interactTarget = null
  eng.ride = null
  eng.climb = null
  eng.porchDrop = null // v58：换层中止门廊拖拽演出
  eng.syncInfNpcs() // v39：窗口平移后重收集 chunk NPC（卸载消失/新载加入）
  // v29：返程阶梯（世界坐标固定；stitch 重建 m.exits 后重新注入，并同步所属 chunk 供渲染）
  if (eng.bonusExit && m.inf && !m.exits.some((e) => e.def === eng.bonusExit!.def)) {
    const inf = m.inf
    const exit: ExitInstance = { def: eng.bonusExit.def, x: eng.bonusExit.wx - inf.ox, y: eng.bonusExit.wy - inf.oy, discovered: true }
    m.exits.push(exit)
    const c = inf.chunks.get(chunkKey(Math.floor(eng.bonusExit.wx / CS), Math.floor(eng.bonusExit.wy / CS)))
    if (c && !c.exits.some((e) => e.def === eng.bonusExit!.def)) c.exits.push(exit)
  }
}

export type RestorePlacementResult = 'exact' | 'nearby' | 'spawn' | 'legacy-spawn'

/**
 * 恢复存档落点。
 *
 * 无限层的 player.x/y 是流式窗口局部坐标，窗口平移后不能跨会话直接复用；新存档先用
 * worldPos 把窗口移回对应世界区块，再验证碰撞。旧存档没有绝对坐标，安全回退到入口。
 * 有限层也做碰撞校验，以兼容地图更新后原落点被新墙体/家具占用的存档。
 */
export function restoreSavedPlayerPosition(
  eng: Engine,
  worldPos?: { x: number; y: number },
): RestorePlacementResult {
  const m = eng.map!
  const p = eng.player

  const findSafe = (cx: number, cy: number, band: FloorBand, maxR: number) => {
    for (let r = 0; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          const x = Math.floor(cx) + dx + 0.5
          const y = Math.floor(cy) + dy + 0.5
          const tx = Math.floor(x), ty = Math.floor(y)
          if (tx < 1 || ty < 1 || tx >= m.w - 1 || ty >= m.h - 1) continue
          const i = ty * m.w + tx
          // 自动挪位不把玩家放进深坑、深水或楼梯半坡；这些位置虽可能可通行，但不是稳定读档点。
          if (m.elev[i] === 4 || m.liquid[i] === 1 || (m.stair[i] & 7) !== 0) continue
          const z = floorHeight(m, x, y, band)
          if (!canOccupy(m, x, y, PLAYER_RADIUS, { z, crouch: false, band })) continue
          return { x, y, z, band }
        }
      }
    }
    return null
  }

  const place = (spot: { x: number; y: number; z: number; band: FloorBand }) => {
    p.x = spot.x
    p.y = spot.y
    p.z = spot.z
    p.vz = 0
    p.floor = spot.band
    p.crouching = false
  }

  if (m.inf) {
    const validWorld = worldPos && Number.isFinite(worldPos.x) && Number.isFinite(worldPos.y)
    if (!validWorld) {
      const spawn = findSafe(m.spawn.x + 0.5, m.spawn.y + 0.5, 0, 12)
        ?? findSafe(m.w / 2, m.h / 2, 0, Math.floor(m.w / 2) - 2)
      if (spawn) place(spawn)
      else { p.x = m.spawn.x + 0.5; p.y = m.spawn.y + 0.5; p.z = 0; p.vz = 0; p.floor = 0; p.crouching = false }
      return 'legacy-spawn'
    }

    // 先把绝对坐标换算到初始窗口，再复用正常流式平移逻辑加载正确的世界区块。
    p.x = worldPos.x - m.inf.ox
    p.y = worldPos.y - m.inf.oy
    updateInfiniteWindow(eng)
  }

  const finitePosition = Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)
  const band = finitePosition ? bandOfPlayerZ(m, p.z) : 0
  p.floor = band
  p.vz = 0 // 不恢复暂停瞬间的下落速度，避免载入首帧再次穿入地面/楼板。
  if (finitePosition && canOccupy(m, p.x, p.y, PLAYER_RADIUS, { z: p.z, crouch: p.crouching, band })) return 'exact'

  const nearby = Number.isFinite(p.x) && Number.isFinite(p.y) ? findSafe(p.x, p.y, band, 16) : null
  if (nearby) { place(nearby); return 'nearby' }

  // 上层附近若已无有效楼板，回到本地图（或当前无限窗口）中心附近的主层安全地面。
  const spawn = findSafe(m.inf ? m.w / 2 : m.spawn.x + 0.5, m.inf ? m.h / 2 : m.spawn.y + 0.5, 0, Math.floor(Math.max(m.w, m.h) / 2) - 2)
  if (spawn) place(spawn)
  else { p.x = m.spawn.x + 0.5; p.y = m.spawn.y + 0.5; p.z = 0; p.vz = 0; p.floor = 0; p.crouching = false }
  return 'spawn'
}
export function nearestExit(eng: Engine) {
  const p = eng.player, m = eng.map!
  // v17 无限模式：解析式最近保底出口（窗口外也可指向，适配出口提示/气流/音效）
  if (m.inf) {
    const inf = m.inf
    // 优先窗口内已加载出口（可交互实例）
    let best: { x: number; y: number } | null = null, bd = 1e9
    for (const e of m.exits) {
      if ((e.floor ?? 0) !== bandOfPlayerZ(m, p.z)) continue
      const d = Math.hypot(e.x + 0.5 - p.x, e.y + 0.5 - p.y)
      if (d < bd) { bd = d; best = e }
    }
    if (best && bd < 40) return { x: best.x, y: best.y, d: bd }
    const w = l0NearestExit(m, eng.levelDef, inf.ox + p.x, inf.oy + p.y, bandOfPlayerZ(m, p.z))
    if (w && (!best || w.d < bd)) return w
    return best ? { x: best.x, y: best.y, d: bd } : w
  }
  let best: { x: number; y: number } | null = null, bd = 1e9
  for (const e of m.exits) {
    if ((e.floor ?? 0) !== bandOfPlayerZ(m, p.z)) continue
    const d = Math.hypot(e.x + 0.5 - p.x, e.y + 0.5 - p.y)
    if (d < bd) { bd = d; best = e }
  }
  return best ? { x: best.x, y: best.y, d: bd } as { x: number; y: number; d: number } | null : null
}

/** v35：最近的定居点地标（出口提示的替代目标——附近无出口时指向它） */
export function nearestLandmark(eng: Engine): { x: number; y: number; d: number } | null {
  const p = eng.player, m = eng.map
  if (!m) return null
  let best: { x: number; y: number } | null = null, bd = 1e9
  for (const s of m.structures) {
    if (!isLandmarkStruct(s)) continue // v55c：通用地标判定（含邀请函）
    const d = Math.hypot(s.x + s.w / 2 - p.x, s.y + s.h / 2 - p.y)
    if (d < bd) { bd = d; best = { x: s.x + s.w / 2, y: s.y + s.h / 2 } }
  }
  return best ? { ...best, d: bd } : null
}
// ---------- v58：联机出生（槽位偏移 + 全槽位确定性物资散射） ----------
/** 槽位出生点（窗口坐标，确定性）：默认出生点以东/西 40、南北交错——初始 5×5 chunk 窗口内 */
export function mpSlotPoint(eng: Engine, slot: number): { x: number; y: number } {
  const m = eng.map!
  const ox = [0, 40, -40, 40][slot % 4], oy = [0, -32, 32, 32][slot % 4]
  const cx = m.spawn.x + ox, cy = m.spawn.y + oy
  // 就近螺旋找可走地板（确定性扫描，各端同图同解）
  for (let rad = 0; rad <= 24; rad++)
    for (let dy = -rad; dy <= rad; dy++)
      for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
        const x = Math.floor(cx + dx), y = Math.floor(cy + dy)
        if (x < 1 || y < 1 || x >= m.w - 1 || y >= m.h - 1) continue
        if (tileAt(m, x, y) !== 1) continue
        if (!canOccupy(m, x + 0.5, y + 0.5, PLAYER_RADIUS, { z: 0 })) continue
        return { x, y }
      }
  return { x: m.spawn.x, y: m.spawn.y }
}

/** 联机开局：把玩家放到自己槽位出生点，并按 4 个槽位各撒一份初始物资（id 确定性——各端一致，先到先得共享） */
export function applyMpSpawn(eng: Engine, slot: number) {
  const m = eng.map
  if (!m || !m.inf) return
  const inf = m.inf
  // 物资散射到「拥有该瓦片的 LiveChunk」的 items（窗口坐标；随窗口平移/缝合/卸载持久化）
  const pool = ['almond', 'canned', 'bandage', 'battery', 'glowstick']
  for (let s = 0; s < 4; s++) {
    const base = mpSlotPoint(eng, s)
    let placed = 0
    for (let k = 0; placed < 5 && k < 40; k++) {
      const a = (h32(eng.seed, 0x5eed, s, k) / 4294967296) * Math.PI * 2
      const r = 1.3 + (h32(eng.seed, 0x5eee, s, k) / 4294967296) * 1.8
      const x = base.x + 0.5 + Math.cos(a) * r, y = base.y + 0.5 + Math.sin(a) * r
      if (tileAt(m, Math.floor(x), Math.floor(y)) !== 1) continue
      const ccx = Math.floor((x + inf.ox) / CS), ccy = Math.floor((y + inf.oy) / CS)
      const chunk = inf.chunks.get(chunkKey(ccx, ccy))
      if (!chunk) continue
      chunk.items.push({ id: 700000000 + s * 1000 + k, type: pool[(s + k) % pool.length], x, y })
      placed++
    }
  }
  if (slot > 0) {
    const spot = mpSlotPoint(eng, slot)
    eng.player.x = spot.x + 0.5
    eng.player.y = spot.y + 0.5
    eng.msg('孤立效应把你们冲散了——其他人应该也在这一层某处。', 'lore')
  }
}

export function takeExit(eng: Engine, def: ExitDef) {  const p = eng.player
  // v45：Level 274 教化规则——教化满（≥100）成为信众一员：无法主动离开（开发者传送除外）；
  // 未满时主动离开 → jerry 声望 -5；有进行中的传教委托（v47 标准委托化）离开不受声望惩罚
  if (p.level === 274 && def.dest === 'back') {
    if (eng.indoctrination >= 100) {
      eng.msg('你属于这里。鹉主还需要你。', 'lore')
      audio.uiTick()
      return
    }
    if (eng.quests.some((q) => q.def.kind === 'preach' && !q.done)) eng.msg('你肩负传教使命离开圣地——鹉主允许你为祂远行。（免于声望惩罚）', 'system')
    else {
      eng.changeRep('jerry', -5)
      eng.msg('你转身离开了圣地。信众的目光在你背后发凉。（杰瑞的信众 声望 -5）', 'damage')
    }
  }
  if (def.req) {
    if (def.req.tapes && p.tapes < def.req.tapes) {
      eng.msg(`${def.name}没有反应。${def.reqText ?? ''}（当前 ${p.tapes}/${def.req.tapes}）`, 'system')
      return
    }
    // v23：Level 7 的木门在水下 150 米——没有绳索，下得去也上不来
    if (def.req.rope && !eng.hasPocket('rope') && !eng.hasItem('rope')) {
      eng.msg(`${def.reqText ?? '需要一卷绳索。'}`, 'system')
      return
    }
    if (def.req.fuses) {
      let cnt = eng.countItem('fuse')
      if (cnt < def.req.fuses) { eng.msg(`电梯井没有反应。${def.reqText}（当前 ${cnt}/${def.req.fuses}）`, 'system'); return }
      for (let i = 0; i < def.req.fuses; i++) eng.consumeItem('fuse')
    }
    if (def.req.keycard && !eng.hasPocket('keycard')) { eng.msg(`门锁红灯闪烁。${def.reqText}（门禁卡需放在口袋栏）`, 'system'); return }
    if (def.req.lever && !p.leverPulled) { eng.msg(`电梯没有电。${def.reqText}（找找收费亭）`, 'system'); return }
  }
  // v23：Level 601「The End」——它会为闯入者制造个人化的假现实，让人以为自己已经安全到家
  if (def.kind === 'homedoor') {
    eng.fakeEnds++
    const lines = [
      ['你推开门。玄关的灯是开着的，鞋摆得整整齐齐，钥匙在门口的小碟子里。', '你在图书馆的地板上醒来。手里攥着一把不属于任何一扇门的钥匙。'],
      ['厨房有饭的香味。有人在里面喊你的名字，用的是你最熟悉的那个称呼。', '你在同一排书架之间醒来。金属字母还在那儿：the end is near。'],
      ['这一次你没有回头。你走过玄关，走过走廊，走到了自己的房门口——', '门后面是图书馆。你数过了：你家的走廊没有这么长。'],
    ]
    const L = lines[Math.min(eng.fakeEnds - 1, lines.length - 1)]
    eng.msg(L[0], 'lore')
    eng.msg(L[1], 'damage')
    p.sanity = Math.max(0, p.sanity - 18)
    eng.emit({ kind: 'sanityhit' })
    if (eng.fakeEnds >= 2) eng.msg('中央那排金属字母底下还有一扇门。没有装饰，也没有灯。', 'system')
    audio.pickup()
    eng.transition = { anim: 'bloom', t: 0, dest: def.dest as number } // homedoor 的 dest 恒为数字（Level 601 假门循环）
    eng.emit({ kind: 'transition', anim: 'bloom' })
    return
  }
  audio.pickup()
  // v29：经 L0「向下的灰色阶梯」下行 → 在 L1 出生点附近生成返程阶梯
  if (def.kind === 'graystairs' && def.dest === 1) eng.arriveStairs = true
  // v51：乘电梯 → 抵达层出生点改到该层电梯旁（L3↔L4/L5 双向）
  if (def.kind === 'elevatorshaft') eng.arriveElevator = true
  // v54：经古典楼梯 → 抵达 L5 时出生点改到该层保底楼梯 2 格外空旷地板（L4↔L5 双向链）
  if (def.kind === 'oldstairs') eng.arriveOldstairs = true
  if (def.dest === 6) eng.arriveL6Band = p.level === 5 && def.kind === 'boilerdeep' ? -1 : 0
  // v23：立刻解析 random 目标——过场演出需要知道「切入」的是哪一层
  // v35：'back' 解析为进入据点前的层级（据点入口的返程）
  const resolved = def.dest === 'back' ? (eng.outpostReturn ?? 1) : def.dest
  const dest: number | 'win' = resolved === 'random' ? Math.floor(Math.random() * NORMAL_LEVELS) : resolved
  if (def.dest === 'back') eng.outpostReturn = null // 返程后清空（下次进据点重新记录）
  const cutIn = dest === 'win' ? undefined : (def.cutIn ?? levelDefOf(dest)?.entryAnim)
  eng.transition = { anim: def.anim, t: 0, dest, fallDamage: def.fallDamage }
  eng.emit({ kind: 'transition', anim: def.anim, fallDamage: def.fallDamage, cutIn, dest })
  // v58：联机——出口使用广播（其他玩家收到提示并各自独立换层）
  if (typeof dest === 'number') eng.emit({ kind: 'mpevent', mp: { t: 'exit', dest } })
}

/** Level 6 内部换层：楼梯井双向，地表塌陷坑仅向下。 */
export function switchL6Floor(eng: Engine, target: -1 | 0, reason: 'stairs' | 'pit' = 'stairs'): boolean {
  if (!eng.map || eng.levelDef.id !== 6) return false
  const m = eng.map, p = eng.player
  let best: { x: number; y: number; z: number } | null = null
  for (let r = 0; r <= (reason === 'pit' ? 18 : 8) && !best; r++) {
    for (let dy = -r; dy <= r && !best; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
      const x = Math.floor(p.x) + dx + 0.5, y = Math.floor(p.y) + dy + 0.5
      const z = floorHeight(m, x, y, target)
      if (canOccupy(m, x, y, PLAYER_RADIUS, { z, band: target, crouch: false })) best = { x, y, z }
    }
  }
  if (!best) return false
  p.x = best.x; p.y = best.y; p.z = best.z; p.vz = 0; p.floor = target; p.crouching = false
  eng.inLiquid = 0; eng.submerged = false
  eng.emit({ kind: 'floorchange', text: reason === 'pit' ? '冻土崩塌——你坠入地下廊道' : target === -1 ? '沿废弃楼梯井进入地下' : '你重新推开通往苔原的井盖' })
  eng.msg(reason === 'pit' ? '地面在脚下塌陷。短暂失重后，你撞进一条发霉的地下廊道。' : target === -1 ? '你沿着生锈的楼梯下行。最后一点天光消失了。' : '井盖被推开，近黑天空的微光重新落在冻土上。', 'lore')
  return true
}
// ---------- v29：可行走灰色阶梯（走下去→L1 / 走上去→L0，自动换层，无需按 E）----------
export function updateStairs(eng: Engine, dt: number) {
  const m = eng.map, p = eng.player
  eng.onStairs = false
  if (!m || eng.transition || eng.ride || eng.climb) return
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? 0 : m.tiles[y * m.w + x])
  for (const e of m.exits) {
    // v54：L4 古典楼梯（oldstairs，下行 L5）并入可行走阶梯
    const up = e.def.kind === 'graystairsup'
    if (!up && e.def.kind !== 'graystairs' && e.def.kind !== 'oldstairs') continue
    const tx = Math.floor(e.x), ty = Math.floor(e.y)
    // 阶梯走向 = 邻墙且反侧 4 格畅通（地板且无实心结构；优先级同渲染层 orientStairs；兜底取第一面墙）
    let dx = 0, dy = 0
    const solidAtT = (x: number, y: number) => m.structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
    const sides: [number, number][] = []
    for (const [wx, wy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (at(tx + wx, ty + wy) === 1) continue
      sides.push([wx, wy])
      let clear = true
      for (let k = 1; k <= 4; k++) if (at(tx - wx * k, ty - wy * k) !== 1 || solidAtT(tx - wx * k, ty - wy * k)) { clear = false; break }
      if (clear) { dx = -wx; dy = -wy; break }
    }
    if (!dx && !dy) {
      if (!sides.length) continue
      dx = -sides[0][0]; dy = -sides[0][1]
    }
    const cx = tx + 0.5, cy = ty + 0.5
    const s = (p.x - cx) * dx + (p.y - cy) * dy // 沿走向距离（入口≈0，深入为正）
    const latS = (p.x - cx) * dy - (p.y - cy) * dx // 横向偏移（带符号）
    // v54c：古典楼梯收紧——进入井口段（s>0.45）后必须在护栏内侧（|latS|≤0.5），
    // 隔着护栏走近不再被吸上楼梯；楼梯格上（s≤0.45）保持侧向登梯宽容
    const latMax = e.def.kind === 'oldstairs' && s > 0.45 ? 0.5 : 1.0
    if (s < -0.8 || s > 3.1 || Math.abs(latS) > latMax) continue
    eng.onStairs = true // 碰撞 z 按地面处理、跳过重力贴地（本帧由这里接管垂直位置）
    // 在阶梯上：高度沿走向绑定（下行 -3.2m / 上行 +3.2m，坡道与可见踏步严格一致），横向限位防跌落
    const t = Math.max(0, Math.min(1, s / 2.6))
    const targetZ = (up ? 3.2 : -3.2) * t
    p.z += (targetZ - p.z) * Math.min(1, dt * 12)
    p.vz = 0
    // v29a 碰撞修正：横向限位对齐护栏碰撞盒——护栏内沿 |lat|=0.56，减去玩家半径 0.32 → 0.24
    // （旧值 0.55 让玩家身体直接穿进护栏模型）；入口处（s≤0.4，脚底未低于地面）保持开阔不夹挤
    const latLimit = s > 0.4 ? 0.24 : 0.55
    if (s > -0.1 && Math.abs(latS) > latLimit) {
      const over = Math.abs(latS) - latLimit, sgn = latS > 0 ? 1 : -1
      p.x -= dy * over * sgn
      p.y += dx * over * sgn
    }
    if (t >= 0.93) eng.takeExit(e.def) // 走到尽头：自动换层
    return // 同帧只处理一个阶梯
  }
}

// v29：在 L1 出生点附近放置返程「向上的灰色阶梯」（邻墙地板格，就近搜索）
export function placeBonusStairs(eng: Engine) {
  const m = eng.map!, inf = m.inf!, W = m.w
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= W ? 0 : m.tiles[y * W + x])
  const solidAt = (x: number, y: number) => m.structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
  // 可行走阶梯：走向需 4 格畅通（地板且无实心结构）
  const runOk = (x: number, y: number) => {
    for (const [wx, wy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (at(x + wx, y + wy) === 1) continue
      let clear = true
      for (let k = 1; k <= 4; k++) if (at(x - wx * k, y - wy * k) !== 1 || solidAt(x - wx * k, y - wy * k)) { clear = false; break }
      if (clear) return true
    }
    return false
  }
  for (let r = 1; r <= 6; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.floor(m.spawn.x) + dx, y = Math.floor(m.spawn.y) + dy
        if (x < 1 || y < 1 || x >= W - 1 || y >= W - 1) continue
        if (m.tiles[y * W + x] !== 1 || !runOk(x, y)) continue
        if (m.tiles[y * W + x + 1] === 1 && m.tiles[y * W + x - 1] === 1 && m.tiles[(y + 1) * W + x] === 1 && m.tiles[(y - 1) * W + x] === 1) continue // 需邻墙
        const def: ExitDef = { kind: 'graystairsup', name: '向上的灰色阶梯', dest: 0, anim: 'bloom' }
        eng.bonusExit = { def, wx: inf.ox + x, wy: inf.oy + y }
        const exit: ExitInstance = { def, x, y, discovered: true }
        m.exits.push(exit)
        // 渲染层按 chunk 出口列表构建网格——必须同步进所属 LiveChunk 才会被渲染
        const c = inf.chunks.get(chunkKey(Math.floor((inf.ox + x) / CS), Math.floor((inf.oy + y) / CS)))
        c?.exits.push(exit)
        eng.msg('不远处有一段向上的灰色阶梯——可以循原路返回 Level 0。', 'lore')
        return
      }
}
/** v55：家常酒店入住申请（地标卡「提交流浪者信息申请」办理；姓名自动取玩家形象名，永久解锁，随存档持久） */
export function applyHomelyStay(eng: Engine) {
  if (eng.homelyApplied) return
  eng.homelyApplied = true
  eng.msg('你在登记簿上写下名字。墨迹干了之后，远处某个前台铃「叮」地响了一声。', 'lore')
  eng.msg('家常酒店：入住申请已受理。随时欢迎。', 'system')
  persistSave(eng, 'auto')
}

/** v35：前往据点（地标弹窗「前往」/DevPanel 据点跳转共用）：记录返程层级后切入 */
export function enterOutpost(eng: Engine, outpostId: string, dev = false) {
  const o = OUTPOSTS[outpostId]
  if (!o || !eng.map) return false
  // v54：蓝色救赎（信众圣所）准入门槛——jerry 声望 >30 才放行；DevPanel 据点跳转（dev=true）不受限
  if (!dev && outpostId === 'bluesalvation' && (eng.rep.jerry ?? 0) <= 30) {
    eng.msg('你还不够虔诚。蓝色救赎只向真正的兄弟姐妹敞开。（杰瑞的信众 声望需 >30）', 'damage')
    audio.uiTick()
    return false
  }
  // v55：家常酒店（L5）入住申请门槛——先在地标卡提交「流浪者信息申请」才放行（永久解锁；dev 跳转不受限）
  if (!dev && outpostId === 'homely' && !eng.homelyApplied) {
    eng.msg('前台的微笑纹丝不动：「非登记住客免进——请先在门口的标志牌处提交入住申请。」', 'damage')
    audio.uiTick()
    return false
  }
  // v55b：原住民（L5）邀请函改为地标式可交互装饰——阅读即弹地标卡可「前往拜访」，无物品门槛
  // v35：声望过低被其团体禁止进入据点（<=-90）
  const rep = eng.rep[o.faction] ?? 0
  if (FACTIONS[o.faction]?.hasRep && rep <= REP_TIER.banned) {
    eng.msg(`守卫拦下了你——${FACTIONS[o.faction]!.name}拒绝你进入。（声望 ${rep}）`, 'damage')
    return false
  }
  eng.outpostReturn = eng.player.level
  eng.transition = { anim: 'bloom', t: 0, dest: o.levelId }
  eng.emit({ kind: 'transition', anim: 'bloom', cutIn: 'outpost', dest: o.levelId })
  return true
}
