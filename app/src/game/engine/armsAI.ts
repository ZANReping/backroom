// 「手臂」（Entité 15-FR「Les Bras」）重制——第 3 阶段：AI / 机制（见 app/ARMS-REMAKE.md「第 3 阶段」）。
//
// 设定（ZAN 确认版）：住在 Level 1 室内通风管里的长臂。只在「玩家所在处黑暗（停电 / 该区段没有有效灯光）且发出足够噪音」时出动：
//   管道里先传来金属刮擦声并沿管道向玩家移动 → 从玩家附近最近的连通风口轻轻推开格栅钻出 → 探寻 → 约 0.8s 蓄力后扑抓 →
//   抓住后拖向风口（玩家可挣扎挣脱）→ 拖进风口不会死：重伤、黑屏、管道里的撞击声远去 → 从 15–40m 外另一个风口被吐出来，掉在下方。
//   只能用光赶走：被抓之前被强光（手电/头灯光锥、荧光棒、灯具）累计照射 0.6s 会痉挛哀嚎、烧焦缩回，风口下留下冒烟的焦皮；
//   武器命中扣血并让它吃痛（被抓时松手）；血量清零不会死，只是被赶走 90–120s，之后回满血。来电时立即缩回。
//
// 本模块只持有局内内存状态：实体上的 e.ar（ArmsState），引擎上的 eng.armsRun（被抓/挣扎/黑屏/坠落）。
// 存档格式、联机协议均未改动（effects 表登记 armsRun：resetOnNewRun/resetOnLevel，无 saveKey；实体本就不入存档）。
//
// 坐标：风口 / 临时风口 / 焦皮等都存「世界绝对坐标」（窗口坐标 + m.inf.ox/oy），无限层窗口平移后换算回窗口坐标。
// e.x/e.y 跟随主攻臂的手（缩回时回到风口正下方），供命中判定（canHit）与通用系统使用；e.z = 风口下的地面高度。
// 天花板高度、管口高度为绝对高度（米）：管口 = ceil − ARMS_VENT_DROP（与 armsMesh.buildArmsVent 的 anchor 一致）。
import type { Engine } from '../engine'
import { recordEntityEncounter, type Entity } from '../entities'
import { audio } from '../core/audio'
import { look } from '../core/renderer3d'
import { WALL_H } from '../renderer/shared'
import { ARMS_VENT_DROP } from '../renderer/armsMesh'
import { canOccupy } from '../core/player'
import { bandOfZ, ceilingHeightAt, floorHeight, walkableAt, structBlocksSight, bandOfPlayerZ } from '../world/mapgen'

// ============================================================================
// 全部数值（ARMS-REMAKE.md「第 3 阶段 · 数值表」与此一一对应）
// ============================================================================
export const ARMS = {
  // —— 生成（world/infiniteL1.ts）——
  chunkChance: 0.06, // 每个 L1 chunk 生成风口 + 手臂的概率（maintenance / garden 变体不生成）
  countMin: 1, countMax: 3, // 每个风口显示的臂数（按风口世界坐标哈希；逻辑上仍是一个实体，主臂负责攻击）
  hp: 30, // 血量（武器可扣，清零 = 被赶走，不会死）
  // —— 风口 / 管道 ——
  ductUp: 1.3, // 管内路径：从管口竖直向上 1.3m（高出天花板 0.85m）再转水平
  ductFlatUp: 0.6, // 附近有更高天花板（可能看见天花板以上）时改用的「贴天花板」路径：只上 0.6m（高出天花板 0.15m）就转水平
  ductScanR: 4, // 判定管道水平段会不会露出：沿各方向扫描 4m 内的天花板高度
  ductExposeMargin: 0.8, // 邻格天花板比本风口高出 >0.8m（≈ 默认水平段底面）时改为贴天花板路径
  regionR: 48, // 「同一片区域」的风口视为连通（世界距离 ≤48m）
  ventMaxH: 4.2, // 天花板高于 4.2m（挑高大厅，最高 6.2m）时风口不贴顶：用一截吊管把风口吊在 3.4m（否则手够不到人）
  ventHangH: 3.4,
  // —— 出动条件 ——
  senseR: 9, senseDz: 1.6, // 玩家距风口水平 9m、高差 1.6m 内才可能触发
  noiseMinR: 6, // 响度半径 <6 的声音不计（慢走 4、蹲行 1、掷出动作 4、翻找容器 6 计入一点点）
  noisePerR: 0.1, // 计入量 = (半径 − 5) × 0.1：奔跑一步 0.5、挥击 0.3、开枪 0.5、订书机落地 1.1、破门 1.1
  noiseNeed: 1.0, // 噪音计达到 1.0 触发
  noiseDecay: 0.45, // 每秒衰减
  gunNoiseR: 10, // 巧克力枪开火视为半径 10 的响动（每发 0.5；只给手臂听，不改其它实体的噪音规则）
  glowDarkR: 2.0, // 荧光棒在玩家 2m 内 = 玩家处不算黑暗
  // —— 预警 / 钻出 ——
  stirDur: 2.4, // 管道刮擦声持续（沿管道从 7m 外移到风口）
  stirFrom: 7,
  scrapeEvery: 0.26,
  emergeFrom: 0.6, // emerge 片段从 0.6s 起播（刮擦段已由 stir 完成）；格栅 0.8s 轻轻推开
  emergeTo: 3.6, // 播到 3.6s 转入探寻
  clawsOutT: 1.95, // 爪尖出管口：之后才可被照射 / 命中
  // —— 探寻 / 扑抓 ——
  lungeR: 3.6, // 玩家距风口水平 ≤3.6m（且胸口到管口 ≤4.4m、有视线）开始扑抓
  reachMax: 4.4,
  lungeFrom: 0.4, // lunge 片段从 0.4s 起播 → 到 1.2s 判定：给玩家 0.8s 反应
  lungeLockT: 0.85, // 片段 0.85s 锁定扑击点（此后移动 ≥0.8m 即可闪开）
  lungeHitT: 1.2, grabR: 0.8, lungeEnd: 1.9, missCd: 1.6,
  searchMax: 12, // 探寻最长 12s（期间有新噪音会续上）
  loseR: 11, loseT: 2.5, // 玩家离开风口 11m 超过 2.5s：放弃并缩回
  // —— 抓住 / 拖拽 / 挣扎 ——
  grabHold: 0.7, dragDur: 3.6,
  chestH: 1.25, // 玩家胸口离脚底高度（抓握点挂在这里）
  struggleNeed: 9, struggleDecay: 1.2, tapGap: 0.09, // 挣扎 9 下挣脱；每秒衰减 1.2；两次计数至少间隔 0.09s
  escapeCd: 5, // 挣脱后 5s 内不再扑抓
  minHp: 5, // 手臂的一切伤害都不致命：最多扣到 5 血
  // —— 吞入 / 管道 / 吐出 ——
  swallowDur: 2.6, swallowInside: 1.3, swallowDmg: 30, swallowSanity: 10,
  ductDur: 4.2, thumpEvery: 0.5,
  spitMin: 15, spitMax: 40, // 吐出风口与原风口的距离
  spitDur: 3.2, spitRelease: 1.22, fadeIn: 0.6,
  spitHoldOut: 0.55, spitHoldDrop: 1.05, spitPushOut: 1.35, spitPushDrop: 1.45, // 吐出时手的停顿点 / 推出点（相对吐出风口管口）
  gravity: 9.8,
  dropItemChance: 0.5, // 被拖进风口时，原风口下有 50% 概率掉落背包里的一件东西（另外必留一摊血迹）
  postSpitCd: 75,
  // —— 光 ——
  flashHalf: 0.5, flashRange: 9, flashFull: 6, // 手电/头灯光锥：半角 0.5rad，6m 内满强度，9m 外无效
  glowBurnR: 1.4, glowRate: 0.8, // 荧光棒在臂 1.4m 内：0.8 倍速
  lampRate: 0.8, // 臂伸进灯具照亮的范围：0.8 倍速
  burnNeed: 0.6, // 累计照射 0.6s → 痉挛烧焦缩回
  expoDecay: 0.3,
  burnDur: 3.0, debrisT: 1.5, burnCd: 40,
  // —— 受击 / 驱逐 ——
  flinchDur: 1.8, flinchRelease: 0.15, flinchCd: 2.2,
  banishMin: 90, banishMax: 120, banishAnim: 2.6,
  // —— 来电 / 放弃 ——
  retractSpeed: 1.6, retractDur: 2.6 / 1.6, powerCd: 8, giveUpCd: 10,
  // —— 内存上限 ——
  marksMax: 4, tempMax: 3,
}

export type ArmsMode = 'hidden' | 'stir' | 'emerge' | 'search' | 'lunge' | 'grab' | 'drag' | 'swallow' | 'duct' | 'spit' | 'flinch' | 'burnRetreat' | 'retract' | 'banished'
export interface ArmsVentSpot { wx: number; wy: number; ceil: number; roof: number; floorZ: number; yaw: number; ductUp: number; exposed: boolean; id: number }
export interface ArmsMark { kind: 'burn' | 'blood'; wx: number; wy: number; z: number; age: number; seed: number }
export interface ArmsState {
  vent: ArmsVentSpot // 本体风口
  temps: ArmsVentSpot[] // 临时生成的风口（吐出用；局内内存）
  count: number; seed: number
  mode: ArmsMode
  t: number // 本状态已持续
  clipT: number // 当前动画片段内时间
  noise: number // 噪音计
  expo: number // 强光累计照射（s）
  cd: number // 冷却（hidden 时不可触发）
  hpSeen: number
  banishT: number // 被赶走剩余时间
  lose: number // 玩家远离计时
  hand: { wx: number; wy: number; z: number } // 主攻臂手的逻辑位置（世界坐标）
  strike: { wx: number; wy: number; z: number } // 扑击锁定点
  grabFrom: { wx: number; wy: number; z: number } // 抓住时胸口位置
  dragTo: { wx: number; wy: number; z: number } // 拖拽终点（风口正下方）
  spit: { ventId: number; holdWX: number; holdWY: number; holdZ: number; pushWX: number; pushWY: number; pushZ: number; dirX: number; dirY: number } | null // 本体负责吐出时
  spitVent: ArmsVentSpot | null // 当前播放 spit 的风口（本体 / 临时）
  marks: ArmsMark[]
  scrapeT: number; thumpT: number
  debrisDone: boolean
  wasDark: boolean // 上一帧是否停电（来电检测）
  told: number // 已提示过的消息位
  lastHit: number // 最近一次受击（时间戳，HUD/QA）
  stat: { triggers: number; burns: number; grabs: number; escapes: number; swallows: number; banishes: number; flinches: number }
}
export interface ArmsRunState {
  ownDamage?: boolean // Scoped internal non-lethal damage; external damage stays shielded.
  captor: number // 抓着玩家的实体 id（-1 = 无）
  phase: 'none' | 'held' | 'inside' | 'falling'
  struggle: number
  presses: number
  jumpHeld: boolean
  side: number
  lastPress: number // 上次计数的游戏时间
  taps: number // HUD 记录的触屏点击（未消费）
  fallVz: number
  freedT: number
  hint: 'none' | 'escaped' | 'spat'
  landX: number; landY: number // 最近一次吐出落点（窗口坐标，QA）
}
export function freshArmsRun(): ArmsRunState {
  return { captor: -1, phase: 'none', struggle: 0, presses: 0, jumpHeld: false, side: 0, lastPress: -1, taps: 0, fallVz: 0, freedT: 0, hint: 'none', landX: 0, landY: 0 }
}

// ============================================================================
// 工具
// ============================================================================
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const sm = (x: number) => { const k = clamp01(x); return k * k * (3 - 2 * k) }
const ramp = (t: number, a: number, b: number) => sm((t - a) / (b - a))
const easeOut = (x: number) => { const k = 1 - clamp01(x); return 1 - k * k * k }
const hashU = (x: number, y: number, k: number) => {
  let h = (Math.imul(Math.floor(x * 4) | 0, 0x27d4eb2d) ^ Math.imul(Math.floor(y * 4) | 0, 0x165667b1) ^ Math.imul(k, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const OX = (eng: Engine) => eng.map?.inf?.ox ?? 0
const OY = (eng: Engine) => eng.map?.inf?.oy ?? 0
const wallH = (eng: Engine) => WALL_H[eng.levelDef.gen] ?? 3
let ventSeq = 1
/** 管口绝对高度 */
export const armsMouthZ = (v: ArmsVentSpot) => v.ceil - ARMS_VENT_DROP
/** 风口窗口坐标 */
export const armsVentXY = (eng: Engine, v: ArmsVentSpot) => ({ x: v.wx - OX(eng), y: v.wy - OY(eng) })
const chestZ = (eng: Engine) => eng.player.z + ARMS.chestH
const isStateHidden = (m: ArmsMode) => m === 'hidden' || m === 'stir' || m === 'duct' || m === 'banished'

/** 与 entityAI.isLit 相同（复制以免循环依赖）：灯具半径 70% 内算亮 */
function lampLit(eng: Engine, x: number, y: number) {
  if (eng.levelDef.noFlashlight) return false
  for (const l of eng.map!.lights) if (Math.hypot(l.x - x, l.y - y) < l.r * 0.7 && eng.los(l.x,l.y,x,y)) return true
  return false
}
/** 地上 / 飞行中的荧光棒（窗口坐标 + 绝对高度） */
function glowsticks(eng: Engine): { x: number; y: number; z: number }[] {
  const m = eng.map!, out: { x: number; y: number; z: number }[] = []
  if (eng.levelDef.noFlashlight) return out
  for (const it of m.items) if (it.type === 'glowstick' && !(it as { fake?: boolean }).fake) out.push({ x: it.x, y: it.y, z: (it as { z?: number }).z ?? floorHeight(m, it.x, it.y) })
  for (const pr of eng.projectiles) if (pr.type === 'glowstick' && !pr.done) out.push({ x: pr.x, y: pr.y, z: pr.z })
  return out
}
/** 停电中（L1 无限层走 inf.blackout；有限层走 blackoutT） */
export function armsBlackout(eng: Engine) { return (eng.map?.inf?.blackout ?? false) || eng.blackoutT > 0 }
/** 玩家所在处是否「黑暗」：没有灯具照到、身边没有荧光棒（停电时灯具已被熄灭，同样落到这里） */
export function armsDarkAt(eng: Engine, x: number, y: number) {
  if (lampLit(eng, x, y)) return false
  for (const g of glowsticks(eng)) if (Math.hypot(g.x - x, g.y - y) < ARMS.glowDarkR && eng.los(g.x,g.y,x,y)) return false
  return true
}

// ============================================================================
// 风口：初始化、管道朝向、连通、吐出点
// ============================================================================
/** 管道水平段朝向与高度：扫描 8 个方向 4m 内的天花板，选最低的一侧；仍可能露出时改为贴天花板路径 */
export function armsDuctPlan(eng: Engine, x: number, y: number, ceil: number) {
  const m = eng.map!, wh = wallH(eng)
  let best = 0, bestMax = Infinity
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a)
    let mx = -Infinity
    for (let d = 0.6; d <= ARMS.ductScanR; d += 0.4) {
      const tx = x + cx * d, ty = y + cy * d
      if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) continue
      const c = ceilingHeightAt(m, tx, ty, wh, 0)
      // 墙瓦片（不可走）：墙顶与本层天花板齐平，看不见上方；可走瓦片没有天花板 = 露天，视为极高
      const v = Number.isFinite(c) ? c : walkableAt(m, Math.floor(tx), Math.floor(ty), 0) ? 99 : ceil
      if (v > mx) mx = v
    }
    if (mx < bestMax - 1e-6) { bestMax = mx; best = a }
  }
  const flat = bestMax > ceil + ARMS.ductExposeMargin
  // 贴天花板路径的水平段底面 ≈ 天花板以上 0.15m：仍比它高的邻格就记为「仍可能露出」（只计数报告，不再处理）
  return { yaw: best, ductUp: flat ? ARMS.ductFlatUp : ARMS.ductUp, exposed: flat && bestMax > ceil + 0.12, maxNeighbour: bestMax }
}
function makeVent(eng: Engine, x: number, y: number, z: number): ArmsVentSpot {
  const m = eng.map!, wh = wallH(eng), band = bandOfZ(z)
  const floorZ = floorHeight(m, x, y, band)
  let roof = ceilingHeightAt(m, x, y, wh, band)
  if (!Number.isFinite(roof) || roof - floorZ < 2.2 || roof - floorZ > 12) roof = floorZ + wh
  // 挑高处：风口吊在 ventHangH，吊管通到真正的天花板；管内路径一路竖直穿过吊管，到天花板以上才转水平
  const ceil = roof - floorZ > ARMS.ventMaxH ? floorZ + ARMS.ventHangH : roof
  const plan = armsDuctPlan(eng, x, y, roof)
  const ductUp = roof > ceil ? ARMS_VENT_DROP + (roof - ceil) + (plan.ductUp === ARMS.ductFlatUp ? ARMS.ductFlatUp - ARMS_VENT_DROP : ARMS.ductUp - ARMS_VENT_DROP) : plan.ductUp
  return { wx: x + OX(eng), wy: y + OY(eng), ceil, roof, floorZ, yaw: plan.yaw, ductUp, exposed: plan.exposed, id: ventSeq++ }
}
/** 风口显示的臂数（1–3，按风口世界坐标哈希） */
export function armsCountAt(wx: number, wy: number) {
  return ARMS.countMin + Math.min(ARMS.countMax - ARMS.countMin, Math.floor(hashU(wx, wy, 33) * (ARMS.countMax - ARMS.countMin + 1)))
}
/** 取（必要时初始化）实体的手臂状态 */
export function armsState(eng: Engine, e: Entity): ArmsState {
  if (e.ar) return e.ar
  const m = eng.map!
  // 风口在瓦片中心（生成器同格放 ceilvent 结构）；若附近有 ceilvent 结构则对齐它
  let x = Math.floor(e.x) + 0.5, y = Math.floor(e.y) + 0.5
  const sv = m.structures.find((s) => s.kind === 'ceilvent' && Math.abs(s.x + s.w / 2 - e.x) < 0.8 && Math.abs(s.y + s.h / 2 - e.y) < 0.8)
  if (sv) { x = sv.x + sv.w / 2; y = sv.y + sv.h / 2 }
  const vent = makeVent(eng, x, y, e.z)
  const seed = Math.floor(hashU(vent.wx, vent.wy, 15) * 0xffff)
  const count = armsCountAt(vent.wx, vent.wy)
  e.def = { ...e.def, hp: ARMS.hp }
  if (e.hp > ARMS.hp || !Number.isFinite(e.hp)) e.hp = ARMS.hp
  e.x = x; e.y = y; e.z = vent.floorZ; e.hidden = true; e.state = 'idle'
  const P = { wx: vent.wx, wy: vent.wy, z: armsMouthZ(vent) }
  e.ar = {
    vent, temps: [], count, seed, mode: 'hidden', t: 0, clipT: 0, noise: 0, expo: 0, cd: 0, hpSeen: e.hp, banishT: 0, lose: 0,
    hand: { ...P }, strike: { ...P }, grabFrom: { ...P }, dragTo: { ...P }, spit: null, spitVent: null, marks: [],
    scrapeT: 0, thumpT: 0, debrisDone: false, wasDark: armsBlackout(eng), told: 0, lastHit: -1,
    stat: { triggers: 0, burns: 0, grabs: 0, escapes: 0, swallows: 0, banishes: 0, flinches: 0 },
  }
  return e.ar
}
function setMode(s: ArmsState, mode: ArmsMode, clipT = 0) { s.mode = mode; s.t = 0; s.clipT = clipT; s.debrisDone = false }

/** 当前地图里所有手臂实体（含本体） */
function armsEntities(eng: Engine) { return eng.map!.entities.filter((q) => q.def.type === 'arms' && !q.dead) }
/** 与本体连通的风口（同一片区域：本体风口 48m 内的其它手臂风口 + 本体的临时风口） */
export function armsConnectedVents(eng: Engine, e: Entity): { vent: ArmsVentSpot; owner: Entity; temp: boolean }[] {
  const s = armsState(eng, e), out: { vent: ArmsVentSpot; owner: Entity; temp: boolean }[] = [{ vent: s.vent, owner: e, temp: false }]
  for (const t of s.temps) out.push({ vent: t, owner: e, temp: true })
  for (const q of armsEntities(eng)) {
    if (q === e) continue
    const qs = armsState(eng, q)
    if (Math.hypot(qs.vent.wx - s.vent.wx, qs.vent.wy - s.vent.wy) <= ARMS.regionR) out.push({ vent: qs.vent, owner: q, temp: false })
  }
  return out
}

/** 吐出落点是否合法：可走、不在墙里 / 实心结构里、与风口下地面同高、风口与落点之间没有墙 */
export function armsLandingOk(eng: Engine, x: number, y: number, floorZ: number, fromX?: number, fromY?: number) {
  const m = eng.map!
  if (x < 1 || y < 1 || x > m.w - 2 || y > m.h - 2) return false
  const band = bandOfZ(floorZ)
  if (!walkableAt(m, Math.floor(x), Math.floor(y), band)) return false
  const h = eng.entityWalkH(m, Math.floor(x), Math.floor(y), band)
  if (h === null || Math.abs(floorHeight(m, x, y, band) - floorZ) > 0.3) return false
  for (const [dx, dy] of [[0.32, 0], [-0.32, 0], [0, 0.32], [0, -0.32]]) if (!walkableAt(m, Math.floor(x + dx), Math.floor(y + dy), band)) return false
  if (!canOccupy(m, x, y, undefined, { z: floorZ, band })) return false
  if (fromX !== undefined && fromY !== undefined && !eng.los(fromX, fromY, x, y)) return false
  return true
}
/** 给某个风口找一个吐出方向（8 个方向里第一个落点合法的；返回推出方向的单位向量），没有返回 null */
function spitDir(eng: Engine, v: ArmsVentSpot, salt: number) {
  const p = armsVentXY(eng, v)
  for (let k = 0; k < 8; k++) {
    const a = ((k + salt) % 8) / 8 * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a)
    const lx = p.x + dx * ARMS.spitPushOut, ly = p.y + dy * ARMS.spitPushOut
    if (armsLandingOk(eng, lx, ly, v.floorZ, p.x, p.y)) return { dx, dy }
  }
  return null
}
/** 临时风口：在原风口 15–40m 的环带里找一块有天花板、可走、离灯远、非维护/花园段的地方 */
function spawnTempVent(eng: Engine, from: ArmsVentSpot): ArmsVentSpot | null {
  const m = eng.map!, wh = wallH(eng), c0 = armsVentXY(eng, from)
  const inf = m.inf
  for (let tries = 0; tries < 260; tries++) {
    const a = Math.random() * Math.PI * 2, r = ARMS.spitMin + 1 + Math.random() * (ARMS.spitMax - ARMS.spitMin - 2)
    const x = Math.floor(c0.x + Math.cos(a) * r) + 0.5, y = Math.floor(c0.y + Math.sin(a) * r) + 0.5
    if (x < 2 || y < 2 || x > m.w - 3 || y > m.h - 3) continue
    if (!walkableAt(m, Math.floor(x), Math.floor(y), 0)) continue
    const f = floorHeight(m, x, y, 0), c = ceilingHeightAt(m, x, y, wh, 0)
    if (!Number.isFinite(c) || c - f < 2.3 || c - f > 4.6) continue
    if (m.structures.some((s) => (s.solid || s.kind === 'ceilvent') && x > s.x - 0.6 && x < s.x + s.w + 0.6 && y > s.y - 0.6 && y < s.y + s.h + 0.6)) continue
    if (m.lights.some((l) => Math.hypot(l.x - x, l.y - y) < 1.0)) continue
    if (inf) {
      const ch = inf.chunks.get(`${Math.floor((x + inf.ox) / 32)},${Math.floor((y + inf.oy) / 32)}`) as { variant?: string } | undefined
      if (ch?.variant === 'maintenance' || ch?.variant === 'garden') continue
    }
    if (!canOccupy(m, x, y, undefined, { z: f, band: 0 })) continue
    const v = makeVent(eng, x, y, f)
    if (Math.hypot(v.wx - from.wx, v.wy - from.wy) < ARMS.spitMin || Math.hypot(v.wx - from.wx, v.wy - from.wy) > ARMS.spitMax) continue
    if (!spitDir(eng, v, tries)) continue
    return v
  }
  return null
}
/** QA / 截图：按 AI 规则给某个风口找一个临时吐出风口与吐出方向（不登记到任何实体） */
export function armsTempSpitFor(eng: Engine, from: ArmsVentSpot) {
  const v = spawnTempVent(eng, from)
  if (!v) return null
  return { vent: v, dir: spitDir(eng, v, 0)! }
}
/** 选吐出风口：先找 15–40m 内空闲的其它手臂风口 / 本体临时风口，没有就临时生成一个 */
function chooseSpit(eng: Engine, e: Entity): { owner: Entity; vent: ArmsVentSpot; dir: { dx: number; dy: number } } | null {
  const s = armsState(eng, e)
  const cands = armsConnectedVents(eng, e).filter((c) => {
    const d = Math.hypot(c.vent.wx - s.vent.wx, c.vent.wy - s.vent.wy)
    if (c.vent === s.vent || d < ARMS.spitMin || d > ARMS.spitMax) return false
    if (c.owner !== e) { const qs = armsState(eng, c.owner); if (qs.mode !== 'hidden') return false }
    const p = armsVentXY(eng, c.vent)
    return p.x > 1 && p.y > 1 && p.x < eng.map!.w - 2 && p.y < eng.map!.h - 2
  })
  for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]] }
  for (const c of cands) { const dir = spitDir(eng, c.vent, Math.floor(Math.random() * 8)); if (dir) return { owner: c.owner, vent: c.vent, dir } }
  const tv = spawnTempVent(eng, s.vent)
  if (!tv) return null
  s.temps.push(tv); if (s.temps.length > ARMS.tempMax) s.temps.shift()
  return { owner: e, vent: tv, dir: spitDir(eng, tv, 0)! }
}

// ============================================================================
// 声音
// ============================================================================
function panOf(eng: Engine, x: number, y: number) {
  const p = eng.player, dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy) || 1
  return Math.max(-1, Math.min(1, (dx * Math.cos(look.yaw) - dy * Math.sin(look.yaw)) / d))
}
function sfx(eng: Engine, kind: Parameters<typeof audio.armsSfx>[0], wx: number, wy: number, vol = 1) {
  const x = wx - OX(eng), y = wy - OY(eng), d = Math.hypot(x - eng.player.x, y - eng.player.y)
  const v = vol * clamp01(1.15 - d / 16)
  if (v > 0.02) audio.armsSfx(kind, v, panOf(eng, x, y))
}
const TOLD = { first: 1, light: 2, grab: 4 }
function tellOnce(eng: Engine, s: ArmsState, bit: number, text: string, kind: 'system' | 'damage' = 'system') { if (!(s.told & bit)) { s.told |= bit; eng.msg(text, kind) } }

// ============================================================================
// 噪音（entityAI.noiseEvent 钩子 + 开枪）
// ============================================================================
/** 一次响动：半径 ≥6 的声音在风口听得见的范围内累计到噪音计 */
export function armsHear(eng: Engine, x: number, y: number, radius: number, sprint: boolean) {
  const m = eng.map
  if (!m) return
  const r = sprint ? Math.max(radius, 10) : radius
  if (r < ARMS.noiseMinR) return
  for (const e of m.entities) {
    if (e.def.type !== 'arms' || e.dead) continue
    const s = armsState(eng, e), v = armsVentXY(eng, s.vent)
    if (Math.hypot(v.x - x, v.y - y) > Math.max(r, ARMS.senseR)) continue
    s.noise = Math.min(3, s.noise + (r - 5) * ARMS.noisePerR)
  }
}
/** 开枪（巧克力枪 / 滋水枪）：只通知手臂 */
export function armsGunshot(eng: Engine) { const p = eng.player; armsHear(eng, p.x, p.y, ARMS.gunNoiseR, false) }

// ============================================================================
// 强光照射
// ============================================================================
const _pts: { x: number; y: number; z: number }[] = Array.from({ length: 6 }, () => ({ x: 0, y: 0, z: 0 }))
/** 主臂的逻辑采样点（管口 → 手，窗口坐标）：光照判定用 */
function armSamples(eng: Engine, s: ArmsState) {
  const v = armsVentXY(eng, s.vent), mz = armsMouthZ(s.vent) - 0.15
  const hx = s.hand.wx - OX(eng), hy = s.hand.wy - OY(eng)
  for (let i = 0; i < _pts.length; i++) { const k = (i + 0.5) / _pts.length; _pts[i].x = v.x + (hx - v.x) * k; _pts[i].y = v.y + (hy - v.y) * k; _pts[i].z = mz + (s.hand.z - mz) * k }
  return _pts
}
/** 手电 / 头灯是否亮着 */
export function armsBeamOn(eng: Engine) {
  const p = eng.player
  return !!p.flashlight && p.battery > 0 && p.flashJamT <= 0 && !eng.levelDef.noFlashlight
}
/** 准星方向（与 combat.crosshairDirection 一致；游戏坐标 x/y 平面 + z 向上） */
function lightVisible(eng: Engine, x: number, y: number, z: number, tx: number, ty: number, tz: number) {
 const m=eng.map!,steps=Math.max(1,Math.ceil(Math.hypot(tx-x,ty-y,tz-z)*5))
 for(let i=1;i<steps;i++){const t=i/steps,px=x+(tx-x)*t,py=y+(ty-y)*t,pz=z+(tz-z)*t;
  if(structBlocksSight(m,px,py,pz,bandOfPlayerZ(m,pz,px,py))||!walkableAt(m,Math.floor(px),Math.floor(py),bandOfPlayerZ(m,pz,px,py)))return false
 }
 return true
}

function aimDir() {
  const n = Math.hypot(look.rayX, look.rayY, look.rayZ)
  if (n > 0.5) return { x: look.rayX / n, y: look.rayY / n, z: look.rayZ / n }
  const cp = Math.cos(look.pitch)
  return { x: -Math.sin(look.yaw) * cp, y: -Math.cos(look.yaw) * cp, z: Math.sin(look.pitch) }
}
/** 本帧强光照射速率（1 = 每秒累计 1s）：光锥照到的采样比例 × 距离衰减 + 荧光棒 + 灯具 */
export function armsLightRate(eng: Engine, s: ArmsState) {
  const p = eng.player, pts = armSamples(eng, s)
  let rate = 0
  if (armsBeamOn(eng)) {
    const eye = { x: p.x, y: p.y, z: p.z + (p.crouching ? 0.95 : 1.55) }, dir = aimDir()
    let hit = 0, dmin = 1e9
    for (const q of pts) {
      const vx = q.x - eye.x, vy = q.y - eye.y, vz = q.z - eye.z, d = Math.hypot(vx, vy, vz)
      if (d < 1e-3 || d > ARMS.flashRange) continue
      const ang = Math.acos(Math.max(-1, Math.min(1, (vx * dir.x + vy * dir.y + vz * dir.z) / d))) - Math.atan2(0.08, d)
      if (ang > ARMS.flashHalf) continue
      if (!lightVisible(eng,eye.x,eye.y,eye.z,q.x,q.y,q.z)) continue
      hit++; dmin = Math.min(dmin, d)
    }
    if (hit) rate += Math.min(1, (hit / pts.length) * 2.5) * (dmin <= ARMS.flashFull ? 1 : clamp01((ARMS.flashRange - dmin) / (ARMS.flashRange - ARMS.flashFull)))
  }
  const gs = glowsticks(eng)
  if (gs.length) for (const q of pts) if (gs.some((g) => Math.hypot(g.x - q.x, g.y - q.y, g.z - q.z) < ARMS.glowBurnR && lightVisible(eng,g.x,g.y,g.z+0.05,q.x,q.y,q.z))) { rate += ARMS.glowRate; break }
  const hx = s.hand.wx - OX(eng), hy = s.hand.wy - OY(eng)
  if (lampLit(eng, hx, hy)) rate += ARMS.lampRate
  return rate
}

// ============================================================================
// 玩家：被抓 / 挣扎 / 黑屏 / 坠落
// ============================================================================
function hurtNonLethal(eng: Engine, dmg: number, src: string) {
  const d = Math.min(dmg, Math.max(0, eng.player.hp - ARMS.minHp))
  if (d > 0.01) { const r=eng.armsRun;r.ownDamage=true;try { eng.hurtPlayer(d,src) } finally { r.ownDamage=false } }
}
function captor(eng: Engine): Entity | undefined {
  const r = eng.armsRun
  if (!r || r.captor < 0) return undefined
  return eng.map?.entities.find((q) => q.id === r.captor && q.def.type === 'arms')
}
/** 把玩家放回脚下可站立处（挣脱 / 松手 / 中断） */
function dropPlayer(eng: Engine, how: 'escaped' | 'released') {
  const r = eng.armsRun, p = eng.player, m = eng.map!
  const band = 0
  const fz = floorHeight(m, p.x, p.y, band)
  if (!armsLandingOk(eng, p.x, p.y, fz)) {
    // 找最近的合法落点（半径 2m）
    let best: { x: number; y: number } | null = null, bd = 1e9
    for (let dy = -2; dy <= 2; dy += 0.25) for (let dx = -2; dx <= 2; dx += 0.25) {
      const x = p.x + dx, y = p.y + dy, d = Math.hypot(dx, dy)
      if (d < bd && armsLandingOk(eng, x, y, fz)) { bd = d; best = { x, y } }
    }
    if (best) { p.x = best.x; p.y = best.y }
  }
  r.captor = -1
  r.phase = 'falling'; r.fallVz = 0
  r.struggle = 0
  r.hint = how === 'escaped' ? 'escaped' : 'none'
  if (how === 'escaped') r.freedT = 2.5
}
/** 抓住玩家 */
function seize(eng: Engine, e: Entity) {
  const r = eng.armsRun, p = eng.player
  r.captor = e.id; r.phase = 'held'; r.struggle = 0; r.presses = 0; r.side = 0; r.jumpHeld = !!eng.input.jump; r.taps = 0; r.hint = 'none'
  p.crouching = false; p.vz = 0
  eng.seating = null
  eng.usingItem = null
}
/** 触屏「点屏幕任意处」（HUD 在被抓时登记 touchstart） */
export function armsStruggleTap(eng: Engine) { if (eng.armsRun?.phase === 'held') eng.armsRun.taps++ }
/** HUD：是否正被抓（显示挣扎提示与进度） */
export function armsOverlay(eng: Engine) {
  const r = eng.armsRun ?? freshArmsRun(), e = captor(eng), s = e?.ar
  let black = 0
  if (s && r.phase !== 'none') {
    if (s.mode === 'swallow') black = ramp(s.clipT, 0.9, ARMS.swallowInside)
    else if (s.mode === 'duct') black = 1
  }
  // 吐出：由吐出风口所属实体播放（captor 已换成它）
  if (s && s.mode === 'spit') black = 1 - ramp(s.clipT, 0, ARMS.fadeIn)
  const grabbed = r.phase === 'held' && !!s && (s.mode === 'grab' || s.mode === 'drag')
  return { grabbed, struggle: r.struggle, need: ARMS.struggleNeed, black, freed: r.freedT > 0 && r.hint === 'escaped', spat: r.freedT > 0 && r.hint === 'spat' }
}
/** 被吞入后（管道里 / 正在吞）：别的东西伤不到玩家 */
export function armsInputLock(eng: Engine) { return armsPlayerShielded(eng) }
export function armsPlayerShielded(eng: Engine) {
  const r = eng.armsRun
  if (!r || r.ownDamage) return false
  if (r.phase === 'inside') return true
  const s = captor(eng)?.ar
  return r.phase === 'held' && !!s && ((s.mode === 'swallow' && s.clipT > 0.5) || (s.mode === 'spit' && s.clipT < ARMS.spitRelease))
}
/** 胸口（抓握点）当前应在的位置（世界坐标）；null = 不由手臂控制 */
export function armsHeldChest(_eng: Engine, e: Entity): { wx: number; wy: number; z: number } | null {
  const s = e.ar
  if (!s) return null
  const L = (a: { wx: number; wy: number; z: number }, b: { wx: number; wy: number; z: number }, k: number, lift = 0) => ({ wx: a.wx + (b.wx - a.wx) * k, wy: a.wy + (b.wy - a.wy) * k, z: a.z + (b.z - a.z) * k + lift })
  const v = s.vent, mz = armsMouthZ(v)
  switch (s.mode) {
    case 'grab': return L(s.grabFrom, s.grabFrom, 0, 0.12 * ramp(s.clipT, 0.15, 0.6))
    case 'drag': { const u = sm((s.clipT - 0.15) / 3.25); return L({ ...s.grabFrom, z: s.grabFrom.z + 0.12 }, s.dragTo, u, 0.18 * Math.sin(Math.PI * u)) }
    case 'swallow': {
      const top = { wx: v.wx, wy: v.wy, z: mz - 0.55 }
      if (s.clipT < 0.5) return L(s.dragTo, top, sm(s.clipT / 0.5))
      return L(top, { wx: v.wx, wy: v.wy, z: mz + 0.4 }, ramp(s.clipT, 0.5, ARMS.swallowInside))
    }
    case 'spit': {
      const sp = s.spit, sv = s.spitVent
      if (!sp || !sv) return null
      const smz = armsMouthZ(sv)
      if (s.clipT < 0.95) return L({ wx: sv.wx, wy: sv.wy, z: smz + 0.2 }, { wx: sp.holdWX, wy: sp.holdWY, z: sp.holdZ }, easeOut(ramp(s.clipT, 0.3, 0.95)))
      return L({ wx: sp.holdWX, wy: sp.holdWY, z: sp.holdZ }, { wx: sp.pushWX, wy: sp.pushWY, z: sp.pushZ }, easeOut(ramp(s.clipT, 0.95, 1.25)))
    }
    case 'flinch': return null
    default: return null
  }
}

/** movement 钩子：被抓 / 在管道里 / 被吐出下落时手臂接管玩家位置（返回 true 跳过本帧移动），并统计挣扎输入 */
export function armsControlsPlayer(eng: Engine, dt = 1 / 60): boolean {
  const r = eng.armsRun, p = eng.player
  if (!r) return false
  if (r.phase === 'none') { r.jumpHeld = !!eng.input.jump; return false }
  const m = eng.map!
  if (r.phase === 'falling') {
    // 被松开 / 被吐出后的自由落体（只管竖直；落地即交还控制）
    const fz = floorHeight(m, p.x, p.y, bandOfZ(Math.max(0, p.z - 0.5)))
    r.fallVz -= ARMS.gravity * dt
    p.z += r.fallVz * dt
    if (p.z <= fz + 1e-3) {
      p.z = fz; p.vz = 0; r.phase = 'none'; r.fallVz = 0
      eng.camShake = Math.min(1, eng.camShake + 0.35)
      audio.hurt()
    }
    return true
  }
  const e = captor(eng), s = e?.ar
  if (!e || !s || eng.dev.invisible || p.hp <= 0) { dropPlayer(eng, 'released'); return true }
  if (r.phase === 'inside') { p.vz = 0; return true }
  // —— held ——
  const c = armsHeldChest(eng, e)
  if (c) {
    p.x = c.wx - OX(eng); p.y = c.wy - OY(eng); p.z = c.z - ARMS.chestH; p.vz = 0
  }
  // 挣扎：跳跃键上升沿（桌面空格 / 移动端「跳」按钮）、左右换向（A/D 或摇杆左右甩动）、触屏点击；两次计数至少间隔 tapGap
  if (s.mode === 'grab' || s.mode === 'drag') {
    let shakes = 0
    const jump = !!eng.input.jump
    if (jump && !r.jumpHeld) shakes++
    r.jumpHeld = jump
    const sy = Math.sin(look.yaw), cy = Math.cos(look.yaw)
    const strafe = cy * eng.input.mx - sy * eng.input.my
    const side = strafe > 0.5 ? 1 : strafe < -0.5 ? -1 : 0
    if (side !== 0 && r.side !== 0 && side !== r.side) shakes++
    if (side !== 0) r.side = side
    shakes += r.taps; r.taps = 0
    if (shakes && eng.time - r.lastPress >= ARMS.tapGap) {
      r.lastPress = eng.time
      r.struggle += 1; r.presses += 1
      audio.swing(); eng.camShake = Math.min(1, eng.camShake + 0.06)
    }
  } else { r.taps = 0; r.jumpHeld = !!eng.input.jump }
  return true
}
/** 每帧（实体 AI 之前）：挣扎衰减 / 挣脱判定 */
export function armsPlayerTick(eng: Engine, dt: number) {
  const r = eng.armsRun
  if (!r) return
  if (r.freedT > 0) r.freedT -= dt
  if (r.phase !== 'held') return
  const e = captor(eng), s = e?.ar
  if (!e || !s) return
  if (s.mode !== 'grab' && s.mode !== 'drag') return
  if (r.struggle >= ARMS.struggleNeed) {
    dropPlayer(eng, 'escaped')
    s.stat.escapes++
    eng.msg('你拼命扭动、踢蹬——那几根钩爪终于松开了！你摔回地上。', 'loot')
    setMode(s, 'flinch'); s.clipT = ARMS.flinchRelease
    e.attackCd = ARMS.escapeCd
    sfx(eng, 'wail', s.vent.wx, s.vent.wy, 0.6)
    return
  }
  r.struggle = Math.max(0, r.struggle - ARMS.struggleDecay * dt)
}

// ============================================================================
// 受击 / 驱逐（combat.killCheck 钩子）
// ============================================================================
/** 可被命中：露出管口的阶段（hidden / 管内 / 被赶走 / 吐出风口在别处时不可） */
export function armsHittable(e: Entity) {
  const s = e.ar
  if (!s) return false
  if (s.mode === 'emerge') return s.clipT >= ARMS.clawsOutT
  return s.mode === 'search' || s.mode === 'lunge' || s.mode === 'grab' || s.mode === 'drag' || s.mode === 'flinch' || (s.mode === 'swallow' && s.clipT < 0.6)
}
function banish(eng: Engine, e: Entity, s: ArmsState) {
  if (eng.armsRun.captor === e.id && eng.armsRun.phase === 'held') dropPlayer(eng, 'released')
  setMode(s, 'banished')
  s.banishT = ARMS.banishMin + hashU(s.vent.wx, s.vent.wy, 7 + s.stat.banishes) * (ARMS.banishMax - ARMS.banishMin)
  s.stat.banishes++
  s.expo = 0; s.noise = 0
  e.hidden = true
  sfx(eng, 'wail', s.vent.wx, s.vent.wy, 1)
  eng.msg('那条手臂发出一声撕裂般的哀嚎，抽搐着缩回了管道深处。（它被赶走了——暂时）', 'loot')
}
/** killCheck 钩子：手臂永远不会死、不计击杀。血量清零 → 被赶走。返回 true = 已处理（killCheck 直接返回） */
export function armsKillGuard(eng: Engine, e: Entity): boolean {
  if (e.def.type !== 'arms') return false
  e.dead = false; e.deathT = 0
  const s = armsState(eng, e)
  if (e.hp <= 0 && s.mode !== 'banished') { e.hp = 0; banish(eng, e, s) }
  return true
}
/** 死亡标记兜底（其它系统直接写 e.dead 时）：复活为「被赶走」 */
export function armsRevive(eng: Engine, e: Entity) {
  e.dead = false; e.deathT = 0
  const s = armsState(eng, e)
  if (s.mode !== 'banished') { e.hp = 0; banish(eng, e, s) }
}

// ============================================================================
// 主状态机
// ============================================================================
function retract(eng: Engine, e: Entity, s: ArmsState, cd: number) {
  if (eng.armsRun.captor === e.id && eng.armsRun.phase === 'held') dropPlayer(eng, 'released')
  setMode(s, 'retract'); s.cd = Math.max(s.cd, cd)
}
function startSwallowDuct(_eng: Engine, e: Entity, s: ArmsState) {
  // 管道里：选吐出风口；伤害与血迹在吞入瞬间结算
  setMode(s, 'duct')
  e.hidden = true
}
function beginSpit(eng: Engine, from: Entity, fs: ArmsState) {
  const pick = chooseSpit(eng, from)
  const r = eng.armsRun, p = eng.player
  if (!pick) {
    // 实在找不到：从原风口吐回来（极少见；落点仍校验）
    const dir = spitDir(eng, fs.vent, 0)
    const pv = armsVentXY(eng, fs.vent)
    const lx = dir ? pv.x + dir.dx * ARMS.spitPushOut : pv.x, ly = dir ? pv.y + dir.dy * ARMS.spitPushOut : pv.y
    p.x = lx; p.y = ly; p.z = fs.vent.floorZ; r.captor = -1; r.phase = 'none'; r.hint = 'spat'; r.freedT = 3
    setMode(fs, 'hidden'); fs.cd = ARMS.postSpitCd
    return
  }
  const { owner, vent, dir } = pick
  const os = armsState(eng, owner)
  const smz = armsMouthZ(vent)
  os.spit = {
    ventId: vent.id,
    holdWX: vent.wx + dir.dx * ARMS.spitHoldOut, holdWY: vent.wy + dir.dy * ARMS.spitHoldOut, holdZ: smz - ARMS.spitHoldDrop,
    pushWX: vent.wx + dir.dx * ARMS.spitPushOut, pushWY: vent.wy + dir.dy * ARMS.spitPushOut, pushZ: smz - ARMS.spitPushDrop,
    dirX: dir.dx, dirY: dir.dy,
  }
  os.spitVent = vent
  setMode(os, 'spit')
  owner.hidden = true
  if (owner !== from) { setMode(fs, 'hidden'); fs.cd = ARMS.postSpitCd }
  // 传送：玩家先到吐出风口下方（窗口随之平移），再由 armsControlsPlayer 挂到抓握点
  p.x = vent.wx - OX(eng); p.y = vent.wy - OY(eng); p.z = vent.floorZ; p.vz = 0
  r.captor = owner.id; r.phase = 'held'
  eng.updateInfiniteWindow()
}

/** 每帧：手臂实体（entityAI.updateEntities 分派） */
export function updateArmsEntity(eng: Engine, e: Entity, dt: number, dmgMult: number) {
  const s = armsState(eng, e), p = eng.player, m = eng.map!
  const ox = OX(eng), oy = OY(eng)
  s.t += dt
  s.clipT += dt * (s.mode === 'retract' ? ARMS.retractSpeed : 1)
  if (s.cd > 0) s.cd -= dt
  s.noise = Math.max(0, s.noise - ARMS.noiseDecay * dt)
  for (const mk of s.marks) mk.age += dt
  // —— 受击：扣血 → 吃痛（被抓时松手）；清零由 killCheck 钩子转为被赶走 ——
  if (e.hp < s.hpSeen - 1e-6 && s.mode !== 'banished') {
    s.lastHit = eng.time
    if (e.hp <= 0) banish(eng, e, s)
    else if (armsHittable(e) && s.mode !== 'flinch') {
      if (eng.armsRun.captor === e.id && eng.armsRun.phase === 'held') { dropPlayer(eng, 'released'); eng.msg('它吃痛猛地一缩——钩爪松开了！你摔了下来。', 'loot') }
      setMode(s, 'flinch'); s.stat.flinches++
      e.attackCd = Math.max(e.attackCd, ARMS.flinchCd)
      sfx(eng, 'wail', s.vent.wx, s.vent.wy, 0.7)
    }
  }
  s.hpSeen = e.hp
  // —— 来电：立即缩回 ——
  const dark = armsBlackout(eng)
  if (s.wasDark && !dark && !isStateHidden(s.mode) && s.mode !== 'retract' && s.mode !== 'burnRetreat' && s.mode !== 'spit' && s.mode !== 'swallow') {
    retract(eng, e, s, ARMS.powerCd)
    sfx(eng, 'slam', s.vent.wx, s.vent.wy, 0.6)
    if (Math.hypot(e.x - p.x, e.y - p.y) < 14) eng.msg('灯光一亮，那条手臂像被烫到一样缩回了风口。', 'system')
  } else if (s.wasDark && !dark && s.mode === 'hidden') s.cd = Math.max(s.cd, ARMS.powerCd)
  s.wasDark = dark
  const v = armsVentXY(eng, s.vent), mz = armsMouthZ(s.vent)
  const dv = Math.hypot(p.x - v.x, p.y - v.y), dz = Math.abs(p.z - s.vent.floorZ)
  const cz = chestZ(eng)
  const chestDist = Math.hypot(dv, mz - cz)
  const playerFree = eng.armsRun.phase === 'none' && !eng.dev.invisible && p.hp > 0
  const losV = playerFree && dv < ARMS.loseR + 2 && eng.los(v.x, v.y, p.x, p.y)
  const P = { wx: p.x + ox, wy: p.y + oy, z: cz }
  const M = { wx: s.vent.wx, wy: s.vent.wy, z: mz }
  const aimHand = (k = 1) => {
    // 探寻时手悬在管口与玩家之间（离管口最多 1.2m，比管口低 1.4m）
    const dx = P.wx - M.wx, dy = P.wy - M.wy, d = Math.hypot(dx, dy) || 1, r = Math.min(1.2, d) * k
    s.hand.wx = M.wx + dx / d * r; s.hand.wy = M.wy + dy / d * r; s.hand.z = mz - 1.4 * k
  }
  const exposeLight = (): boolean => {
    const rate = armsLightRate(eng, s)
    if (rate > 0) s.expo += rate * dt
    else s.expo = Math.max(0, s.expo - ARMS.expoDecay * dt)
    if (s.expo >= ARMS.burnNeed) {
      setMode(s, 'burnRetreat'); s.expo = 0; s.stat.burns++
      sfx(eng, 'wail', s.vent.wx, s.vent.wy, 1); sfx(eng, 'sizzle', s.vent.wx, s.vent.wy, 1)
      if (dv < 16) eng.msg('强光照上去的一瞬间，那条手臂剧烈痉挛、发出刺耳的哀嚎——皮肤冒着烟卷曲发黑，它飞快地缩回了风口。', 'loot')
      return true
    }
    return false
  }

  switch (s.mode) {
    case 'hidden': {
      s.hand = { ...M }
      s.expo = 0
      if (s.cd > 0 || !playerFree) break
      if (dv > ARMS.senseR || dz > ARMS.senseDz) break
      if (!armsDarkAt(eng, p.x, p.y)) break
      if (s.noise < ARMS.noiseNeed) break
      // 连通风口里由离玩家最近的那个出动（同一片区域只出动一次）
      let nearest = true
      for (const c of armsConnectedVents(eng, e)) {
        if (c.owner === e || c.temp) continue
        const qs = armsState(eng, c.owner), q = armsVentXY(eng, c.vent)
        if (qs.mode !== 'hidden' || qs.cd > 0) { if (qs.mode !== 'hidden' && qs.mode !== 'banished') nearest = false; continue }
        if (Math.hypot(p.x - q.x, p.y - q.y) < dv - 1e-6) nearest = false
      }
      if (!nearest) break
      setMode(s, 'stir'); s.scrapeT = 0; s.stat.triggers++
      break
    }
    case 'stir': {
      // 管道刮擦声沿管道从 7m 外移向风口
      const k = clamp01(s.t / ARMS.stirDur)
      const sx = s.vent.wx + Math.cos(s.vent.yaw) * ARMS.stirFrom * (1 - k), sy = s.vent.wy + Math.sin(s.vent.yaw) * ARMS.stirFrom * (1 - k)
      s.scrapeT -= dt
      if (s.scrapeT <= 0) { s.scrapeT = ARMS.scrapeEvery * (0.7 + Math.random() * 0.6); sfx(eng, 'scrape', sx, sy, 0.55 + 0.45 * k) }
      if (k >= 1) {
        if (!playerFree || dv > ARMS.loseR) { setMode(s, 'hidden'); s.cd = 3; break }
        setMode(s, 'emerge', ARMS.emergeFrom)
        sfx(eng, 'grate', s.vent.wx, s.vent.wy, 0.45) // 格栅推开的声音很轻
      }
      break
    }
    case 'emerge': {
      const out = clamp01((s.clipT - 1.1) / 2.7)
      aimHand(Math.max(0.05, out))
      if (s.clipT >= ARMS.clawsOutT) {
        e.hidden = false
        if (dv < 12) { recordEntityEncounter(e); tellOnce(eng, s, TOLD.first, '头顶的风口里，一条灰白、长得不成比例的手臂慢慢垂了下来……', 'damage') }
        if (exposeLight()) break
      }
      if (s.clipT >= ARMS.emergeTo) { setMode(s, 'search'); s.lose = 0 }
      break
    }
    case 'search': {
      aimHand()
      if (exposeLight()) break
      if (s.noise > 0.3) s.t = Math.min(s.t, ARMS.searchMax * 0.5)
      if (!playerFree || dv > ARMS.loseR) s.lose += dt; else s.lose = 0
      if (s.lose > ARMS.loseT || s.t > ARMS.searchMax) { retract(eng, e, s, ARMS.giveUpCd); break }
      if (playerFree && losV && dv <= ARMS.lungeR && chestDist <= ARMS.reachMax && dz < ARMS.senseDz && e.attackCd <= 0) {
        setMode(s, 'lunge', ARMS.lungeFrom)
        s.strike = { ...P }
        sfx(eng, 'scrape', s.vent.wx, s.vent.wy, 0.5)
      }
      break
    }
    case 'lunge': {
      if (exposeLight()) break
      if (s.clipT < ARMS.lungeLockT) s.strike = { ...P }
      // 手：蓄力时收回到管口附近，扑出时沿直线冲向锁定点
      const go = ramp(s.clipT, 0.98, 1.24)
      const back = { wx: M.wx + (s.strike.wx - M.wx) * 0.25, wy: M.wy + (s.strike.wy - M.wy) * 0.25, z: mz - 0.7 }
      s.hand = { wx: back.wx + (s.strike.wx - back.wx) * go, wy: back.wy + (s.strike.wy - back.wy) * go, z: back.z + (s.strike.z - back.z) * go }
      if (s.clipT - dt < ARMS.lungeHitT && s.clipT >= ARMS.lungeHitT) {
        const miss = Math.hypot(P.wx - s.strike.wx, P.wy - s.strike.wy, P.z - s.strike.z)
        if (playerFree && miss <= ARMS.grabR && losV) {
          seize(eng, e)
          s.grabFrom = { ...P }
          const gd = Math.hypot(P.wx - M.wx, P.wy - M.wy) || 1
          s.dragTo = { wx: M.wx + (P.wx - M.wx) / gd * 0.32, wy: M.wy + (P.wy - M.wy) / gd * 0.32, z: mz - 1.0 }
          setMode(s, 'grab'); s.stat.grabs++
          hurtNonLethal(eng, e.def.damage * dmgMult, e.def.name)
          eng.camShake = Math.min(1, eng.camShake + 0.7)
          sfx(eng, 'grab', s.vent.wx, s.vent.wy, 1)
          tellOnce(eng, s, TOLD.grab, '三根钩爪扣住了你的胸口——它要把你拖进风口！拼命挣扎！', 'damage')
          break
        }
        e.attackCd = ARMS.missCd
      }
      if (s.clipT >= ARMS.lungeEnd) setMode(s, 'search')
      break
    }
    case 'grab': {
      s.hand = { wx: P.wx, wy: P.wy, z: P.z }
      if (eng.armsRun.captor !== e.id) { setMode(s, 'search'); break }
      if (s.t >= ARMS.grabHold) setMode(s, 'drag', 0)
      break
    }
    case 'drag': {
      s.hand = { wx: P.wx, wy: P.wy, z: P.z }
      if (eng.armsRun.captor !== e.id) { setMode(s, 'search'); break }
      s.thumpT -= dt
      if (s.thumpT <= 0) { s.thumpT = 0.62; sfx(eng, 'thump', s.vent.wx, s.vent.wy, 0.5) }
      if (s.clipT >= ARMS.dragDur) setMode(s, 'swallow')
      break
    }
    case 'swallow': {
      if (eng.armsRun.captor !== e.id) { setMode(s, 'retract', 0.6); break }
      s.hand = { wx: P.wx, wy: P.wy, z: P.z }
      if (s.clipT >= ARMS.swallowInside && eng.armsRun.phase === 'held') {
        // 吞进去了：重伤（不致命）、理智、原风口下留下血迹（以及可能掉落的东西）
        eng.armsRun.phase = 'inside'
        s.stat.swallows++
        hurtNonLethal(eng, ARMS.swallowDmg * dmgMult, e.def.name)
        if (!eng.dev.statLock) p.sanity = Math.max(0, p.sanity - ARMS.swallowSanity)
        p.x = v.x; p.y = v.y; p.z = s.vent.floorZ
        s.marks.push({ kind: 'blood', wx: s.vent.wx, wy: s.vent.wy, z: s.vent.floorZ, age: 0, seed: Math.floor(Math.random() * 1e5) })
        if (s.marks.length > ARMS.marksMax) s.marks.shift()
        eng.bloodParticles(v.x, v.y)
        if (Math.random() < ARMS.dropItemChance) {
          const bp = p.backpack, idx = bp.map((it, i) => (it ? i : -1)).filter((i) => i >= 0)
          if (idx.length) {
            const i = idx[Math.floor(Math.random() * idx.length)], it = bp[i]!
            const item = { id: Math.random(), type: it.type, count: 1, x: v.x + (Math.random() - 0.5) * 0.4, y: v.y + (Math.random() - 0.5) * 0.4 }
            if ((it.count ?? 1) > 1) it.count = (it.count ?? 1) - 1; else bp[i] = null
            m.items.push(item)
            const inf = m.inf
            if (inf) inf.chunks.get(`${Math.floor((item.x + inf.ox) / 32)},${Math.floor((item.y + inf.oy) / 32)}`)?.items.push(item)
            eng.syncPassives()
          }
        }
        sfx(eng, 'slam', s.vent.wx, s.vent.wy, 1)
        eng.msg('你被一把拽进了黑漆漆的风口——铁皮刮过肋骨，四周只剩下撞击声。', 'damage')
      }
      if (s.clipT >= ARMS.swallowDur) { startSwallowDuct(eng, e, s); s.thumpT = 0 }
      break
    }
    case 'duct': {
      // 黑屏中：管道里的撞击声逐渐远去
      s.hand = { ...M }
      s.thumpT -= dt
      if (s.thumpT <= 0) {
        s.thumpT = ARMS.thumpEvery * (0.8 + Math.random() * 0.5)
        const k = clamp01(s.t / ARMS.ductDur)
        audio.armsSfx('thump', 0.9 * (1 - k * 0.85), (Math.random() - 0.5) * 0.6, 1 - k * 0.8)
        if (Math.random() < 0.5) audio.armsSfx('scrape', 0.5 * (1 - k * 0.8), (Math.random() - 0.5) * 0.6, 1 - k * 0.8)
      }
      if (eng.armsRun.captor !== e.id) { setMode(s, 'hidden'); s.cd = ARMS.postSpitCd; break }
      if (s.t >= ARMS.ductDur) {
        beginSpit(eng, e, s)
        if (s.mode === 'duct') { setMode(s, 'hidden'); s.cd = ARMS.postSpitCd }
      }
      break
    }
    case 'spit': {
      const sv = s.spitVent, sp = s.spit
      if (!sv || !sp) { setMode(s, 'hidden'); break }
      const r = eng.armsRun
      if (r.captor === e.id && r.phase === 'held') {
        s.hand = armsHeldChest(eng, e) ?? { wx: sv.wx, wy: sv.wy, z: armsMouthZ(sv) }
        if (s.t - dt < 0.02) sfx(eng, 'grate', sv.wx, sv.wy, 0.8)
        if (s.clipT >= ARMS.spitRelease) {
          // 松爪：从推出点自由落下（落点 = 推出点正下方，已校验合法）
          p.x = sp.pushWX - ox; p.y = sp.pushWY - oy; p.z = sp.pushZ - ARMS.chestH
          r.captor = -1; r.phase = 'falling'; r.fallVz = 0; r.hint = 'spat'; r.freedT = 3.5
          r.landX = p.x; r.landY = p.y
          sfx(eng, 'spit', sv.wx, sv.wy, 1)
          eng.msg('……一阵天旋地转之后，你被另一个风口「吐」了出来，重重摔在地上。浑身是伤，但还活着。', 'damage')
        }
      } else s.hand = { wx: sv.wx, wy: sv.wy, z: armsMouthZ(sv) - 0.5 * clamp01(1 - (s.clipT - 1.6) / 0.8) }
      if (s.clipT >= ARMS.spitDur) { setMode(s, 'hidden'); s.cd = ARMS.postSpitCd; s.spit = null; s.spitVent = null; s.hand = { ...M } }
      break
    }
    case 'flinch': {
      // 吃痛：猛地回缩、余悸抽动；结束后回到探寻（血量 >0）
      s.hand.z = Math.min(mz - 0.4, s.hand.z + dt * 0.8)
      if (s.clipT >= ARMS.flinchDur) { setMode(s, 'search'); e.attackCd = Math.max(e.attackCd, ARMS.flinchCd) }
      break
    }
    case 'burnRetreat': {
      s.hand.z = Math.min(mz, s.hand.z + dt * 1.2)
      if (!s.debrisDone && s.clipT >= ARMS.debrisT) {
        s.debrisDone = true
        s.marks.push({ kind: 'burn', wx: s.vent.wx, wy: s.vent.wy, z: s.vent.floorZ, age: 0, seed: Math.floor(Math.random() * 1e5) })
        if (s.marks.length > ARMS.marksMax) s.marks.shift()
        // The debris renderer owns the soft smoke sprites; avoid duplicate generic square particles.
      }
      if (s.clipT >= ARMS.burnDur) { setMode(s, 'hidden'); s.cd = ARMS.burnCd; s.hand = { ...M } }
      break
    }
    case 'retract': {
      s.hand.z = Math.min(mz, s.hand.z + dt * 1.6)
      if (s.clipT >= ARMS.swallowDur) { setMode(s, 'hidden'); s.hand = { ...M } }
      break
    }
    case 'banished': {
      s.hand = { ...M }
      s.banishT -= dt
      if (s.banishT <= 0) { e.hp = ARMS.hp; s.hpSeen = e.hp; setMode(s, 'hidden'); s.cd = 0 }
      break
    }
  }
  // —— 实体位置 / 可见：跟随主臂的手（缩回时回到风口正下方）——
  const out = !isStateHidden(s.mode) && !(s.mode === 'emerge' && s.clipT < ARMS.clawsOutT)
  e.hidden = !out || (s.mode === 'spit' && eng.armsRun.captor !== e.id && s.clipT > 2.4)
  const hx = s.hand.wx - ox, hy = s.hand.wy - oy
  if (out && Number.isFinite(hx) && Number.isFinite(hy)) { e.x = hx; e.y = hy } else { e.x = v.x; e.y = v.y }
  e.z = s.vent.floorZ
  e.state = 'idle'
  e.animT += dt
}
