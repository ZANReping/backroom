// [tiny] 小小（Entity 720）+ 石卡祖笛 重制 阶段 3：机制。
// 设定依据 backrooms-wiki-cn trimmed:entity-720 与 ZAN 2026-10-22 的决定：
// - 小小不可杀：没有任何攻击能伤到它（维基「我们试过了。不值得。」）。挨打只会受惊一下——但打它就是肢体接触，立刻翻脸。
// - 它盘踞在 L7 环形场台心门「小小的谎言」上方；它在门心 5m 内时门打不开（level.tinyBlocksLittleDoor）。
// - 它惧怕噪音，但两种噪音的效果相反（同一条「噪音」轴上的两端）：
//     · 断续的响动（快速游泳、投掷物落水、爆炸、撬门……）只会激怒它：记一次「恼怒」，两次就追杀；
//     · 持续的巨响（6 秒内在它 8m 内吹满 4 次石卡祖笛）把它逼退：合死甲壳、抱头逃离门区，25 秒后回来。
//       吹到一半停下（窗口过期时不足 4 次）= 一次断续噪音，同样记恼怒。逼退本身不记恼怒。
//   追杀中的小小同样能被持续笛声逼退——这是维基里「短暂制服它、借此离开水面」的那一招。
// - 肢体接触（贴身、近战、投掷物/爆炸打中它）立刻激怒。交谈里提「出口/门」也会惹恼它（对话动作 scorn）。
// - 听觉：沿用旧版——只把快速游泳、投掷物落水、爆炸、破门等明显响动计入；普通游动/走路不算。
// - 鲨鱼皮只是外观；不做伪装，也不做全局「被注意」值。
//
// 石卡祖笛：
// - 主手使用 = 吹一声（0.55s 举到嘴边的动作结束时结算）。噪音半径 14m，把附近实体引向声源。
// - 水下能吹，但每吹一次耗掉 5 秒屏气。
// - 洞穴里（L8 有机洞穴）：沿视线在平面上打射线，碰到岩壁就在命中点（退回 0.45m）发出回声噪音，用来把实体引开；
//   22m 内没碰到墙、或在开阔水面/其它层级：声音从玩家身上传出。
// - L8 乐器洞的石风铃：带着石卡祖笛去戳它，铃声经久不息（90 秒，每 1.5 秒一次 16m 噪音），是一个持续的诱饵声源。
// 运行时状态不入存档。
import type { Engine } from '../engine'
import { recordEntityEncounter, type Entity } from '../entities'
import type { Structure } from '../core/types'
import { audio } from '../core/audio'
import { look } from '../core/renderer3d'
import { structBlocksPoint, wallAt } from '../world/mapgen'

export const TINY = {
  /** 门被挡的水平半径（与 level.tinyBlocksLittleDoor 一致） */
  doorR: 5,
  /** 听觉：hearing 16 × 2.4（沿用旧版远距听觉） */
  hearR: 38.4,
  /** 计入恼怒的最小噪音半径（奔跑/快速游泳不看半径） */
  loudR: 8,
  /** 同一阵噪音 4 秒内只记一次恼怒（快速游泳每 0.9m 就发一次噪音） */
  annoyGap: 4,
  /** 安静 45 秒，恼怒 -1 */
  annoyDecay: 45,
  /** 恼怒到 2 → 追杀 */
  angerAt: 2,
  /** 第一次被吵：转向声源低鸣，最多离门 3m，2.5 秒后回到门上 */
  glareT: 2.5, leash: 3,
  /** 肢体接触判定（身体半径 0.62 + 玩家 0.35 余量） */
  contactR: 1.0,
  /** 卡祖笛逼退：声源在它 8m 内、6 秒窗口里吹满 4 次 */
  repelR: 8, repelBlows: 4, repelWindow: 6,
  /** 逼退：逃到离门 18m 外，25 秒后游回（回程约 5–6 秒），门期间可通行 */
  repelT: 25, fleeDist: 18,
  /** 追杀：玩家离开水面或远于 45m 持续 6 秒就放弃，回到门上 */
  huntLoseT: 6, huntLoseR: 45, rehuntR: 20,
  /** 回到门上安静待满 120 秒后消气（重新愿意交谈） */
  forgiveT: 120,
  /** 挨打的受惊僵直 */
  flinchT: 0.6,
  /** 盘踞高度：门面（-depth+0.42）之上 0.63m，即原出生点 -depth+1.05 */
  perchLift: 0.63,
} as const

export const KAZOO = {
  /** 水下每吹一次消耗的屏气秒数（L7 屏气上限 35s，戴潜水面罩 60s） */
  o2Cost: 5,
  noiseR: 14,
  echoMax: 22, echoBack: 0.45,
  /** 石风铃：持续 90 秒，每 1.5 秒发一次 16m 噪音 */
  chimeT: 90, chimeEvery: 1.5, chimeNoiseR: 16,
  /** 用使用动作结算吹奏的时长（举到嘴边→吹→放下） */
  useT: 0.55,
} as const

export type TinyPhase = 'perch' | 'glare' | 'repel' | 'return' | 'hunt'
export interface TinyState {
  phase: TinyPhase; t: number
  /** 自身时钟（秒）：卡祖笛计数按它算，与 eng.time 无关 */
  clock: number
  /** 恼怒计数（0..angerAt） */
  anger: number
  lastAnnoy: number; quietT: number
  /** 当前连吹窗口里每一声的时刻 */
  blows: number[]
  /** 渲染侧：每一声笛响让它缩一下（秒） */
  cringeT: number
  huntLost: number; forgive: number
  originX?: number; originY?: number
  homeX: number; homeY: number; homeZ: number
  fleeX: number; fleeY: number
  glareX: number; glareY: number
  repels: number
  farMsg: boolean
  /** 追杀卡住检测：每 0.5s 看一次离玩家的距离有没有缩短；通用追击在石台/水管旁挪不动时自己游 1s */
  chkT: number; chkD: number; selfT: number
}

export const isTiny = (e: Entity) => e.def.type === 'tiny'
export function tinyState(e: Entity): TinyState {
  return e.tiny ??= {
    phase: 'perch', t: 0, clock: 0, anger: 0, lastAnnoy: -99, quietT: 0, blows: [], cringeT: 0,
    huntLost: 0, forgive: 0, homeX: e.x, homeY: e.y, homeZ: e.z, fleeX: e.x, fleeY: e.y, glareX: e.x, glareY: e.y, repels: 0, farMsg: false, chkT: 0, chkD: 0, selfT: 0,
  }
}
/** Keep local targets aligned when the streamed map origin shifts. */
function runtime(eng: Engine, e: Entity): TinyState {
  const s = tinyState(e), ox = eng.map?.inf?.ox ?? 0, oy = eng.map?.inf?.oy ?? 0
  const dx = ox - (s.originX ?? ox), dy = oy - (s.originY ?? oy)
  s.homeX -= dx; s.homeY -= dy; s.fleeX -= dx; s.fleeY -= dy; s.glareX -= dx; s.glareY -= dy
  s.originX = ox; s.originY = oy
  return s
}
function go(s: TinyState, phase: TinyPhase) { s.phase = phase; s.t = 0 }

/** 卡祖笛噪音正在广播：tinyHear 不把它当成「断续的响动」 */
let kazooBroadcast = false

function playerInWater(eng: Engine): boolean {
  const m = eng.map!, p = eng.player
  const tx = Math.floor(p.x), ty = Math.floor(p.y)
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return false
  return m.liquid[ty * m.w + tx] === 1
}
function updateHome(eng: Engine, s: TinyState) {
  const door = eng.map!.exits.find((x) => x.def.kind === 'littledoor')
  if (!door) return
  s.homeX = door.x + 0.5; s.homeY = door.y + 0.5
  if (door.z !== undefined) s.homeZ = door.z + TINY.perchLift
}
function swimZ(eng: Engine, e: Entity, want: number, dt: number) {
  const m = eng.map!, ti = Math.floor(e.y) * m.w + Math.floor(e.x)
  const bottom = -(m.seaFloor?.[ti] || 1.7)
  const target = Math.max(bottom + 0.4, Math.min(-0.3, want))
  const k = 4.4 * dt
  e.z += Math.max(-k, Math.min(k, target - e.z))
}
function moveTo(eng: Engine, e: Entity, x: number, y: number, speed: number, dt: number): boolean {
  e.targetX = x; e.targetY = y
  if (Math.hypot(x - e.x, y - e.y) < 0.3) return true
  return swimStraight(eng, e, x, y, speed, dt)
}
/**
 * [tiny 收尾] 实机发现：小小盘踞的门在场心 3×3 的实心石台（seadais）上，通用寻路把整块台面当成不可走格，
 * 它游在台面上方 0.6m 也一步都挪不动（stepEntity 此时返回「受阻」true）——被逼退时原地上浮、门永远不放行；
 * 回门时又会在外环水管/石柱旁被通用绕障来回弹（每帧 ±9cm 原地抖动）。所以小小自己的游动（盘踞/低鸣/逼退/回门）
 * 一律走这里：先照直，挡住就按 ±30°/60°/90°/120° 绕开；
 * 只要下一步仍是水体、不是墙、在它当前高度上没有结构挡着即可。返回是否已到目标 0.3m 内。
 */
function swimStraight(eng: Engine, e: Entity, x: number, y: number, speed: number, dt: number): boolean {
  const m = eng.map!, d = Math.hypot(x - e.x, y - e.y)
  if (d < 0.3) return true
  const step = Math.min(d, speed * dt), a0 = Math.atan2(y - e.y, x - e.x)
  for (const da of [0, 0.52, -0.52, 1.05, -1.05, 1.57, -1.57, 2.09, -2.09]) {
    const a = a0 + da, nx = e.x + Math.cos(a) * step, ny = e.y + Math.sin(a) * step
    const tx = Math.floor(nx), ty = Math.floor(ny)
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) continue
    if (m.liquid[ty * m.w + tx] !== 1 || wallAt(m, tx, ty, 0) || structBlocksPoint(m, nx, ny, e.z, 0)) continue
    // 绕障时探一探前方 0.8m，别一头扎进柱子和墙的夹角里
    if (da !== 0) { const fx = e.x + Math.cos(a) * 0.8, fy = e.y + Math.sin(a) * 0.8; if (structBlocksPoint(m, fx, fy, e.z, 0) || wallAt(m, Math.floor(fx), Math.floor(fy), 0)) continue }
    e.facing = a
    e.x = nx; e.y = ny
    return Math.hypot(x - e.x, y - e.y) < 0.3
  }
  return false
}
/** 离开声源方向、离门 fleeDist 的水域点；落在石柱/陆地上就按 ±30° 旋转重找 */
function fleePoint(eng: Engine, s: TinyState, fromX: number, fromY: number): { x: number; y: number } {
  const m = eng.map!
  let a = Math.atan2(s.homeY - fromY, s.homeX - fromX)
  if (Math.hypot(s.homeY - fromY, s.homeX - fromX) < 0.5) a = Math.atan2(s.homeY - eng.player.y, s.homeX - eng.player.x) || 0
  for (let k = 0; k < 12; k++) {
    const aa = a + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6)
    const x = s.homeX + Math.cos(aa) * TINY.fleeDist, y = s.homeY + Math.sin(aa) * TINY.fleeDist
    const tx = Math.floor(x), ty = Math.floor(y)
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) continue
    if (m.liquid[ty * m.w + tx] === 1 && !wallAt(m, tx, ty, 0)) return { x, y }
  }
  return { x: s.homeX + Math.cos(a) * TINY.fleeDist, y: s.homeY + Math.sin(a) * TINY.fleeDist }
}

// ======================= 激怒 / 恼怒 / 逼退 =======================
export type TinyProvokeWhy = 'contact' | 'noise' | 'talk'
export function tinyProvoke(eng: Engine, e: Entity, why: TinyProvokeWhy) {
  const s = runtime(eng, e), p = eng.player
  const was = e.provoked
  e.provoked = true
  s.anger = TINY.angerAt; s.blows = []; s.huntLost = 0; s.forgive = 0
  if (s.phase !== 'repel') { go(s, 'hunt'); e.state = 'chase'; e.targetX = p.x; e.targetY = p.y; e.stateT = 8 }
  if (was) return
  audio.aggro()
  eng.msg(why === 'contact' ? '你碰到了它。焦油下的荧光斑骤然亮起——小小的长矛已经转向你。'
    : why === 'talk' ? '「我说过，别跟我提那个。」甲壳裂开一线，露出里面的尖牙——它朝你扑了过来。'
    : '噪音在水下炸开——小小的耐心耗尽了。它不再掩饰恶意。', 'damage')
}
/** 记一次恼怒（断续噪音 / 半途而废的笛声 / 话不投机）。到 angerAt 就追杀，否则转向声源低鸣。 */
export function tinyAnnoy(eng: Engine, e: Entity, x: number, y: number, why: 'noise' | 'broken' | 'talk') {
  const s = runtime(eng, e)
  if (s.phase === 'repel' || s.phase === 'hunt' || e.provoked) return
  if (why === 'noise' && s.clock - s.lastAnnoy < TINY.annoyGap) return
  s.lastAnnoy = s.clock; s.quietT = 0
  s.anger++
  if (s.anger >= TINY.angerAt) { tinyProvoke(eng, e, why === 'talk' ? 'talk' : 'noise'); return }
  s.glareX = x; s.glareY = y; go(s, 'glare')
  e.state = 'investigate'
  const near = Math.hypot(eng.player.x - e.x, eng.player.y - e.y) < 60
  if (near) eng.msg(why === 'broken' ? '断断续续的笛声只让它更烦躁了——水下传来一声不悦的低鸣。'
    : why === 'talk' ? '「别跟我提那个。」它的声音直接在你脑子里响起，冷得像这片海。再提一次试试。'
    : '水下传来一声不悦的低鸣——噪音把它惹恼了。再吵一次，它就不会只是低鸣了。', 'system')
}
function tinyRepel(eng: Engine, e: Entity, fromX: number, fromY: number) {
  const s = runtime(eng, e)
  const f = fleePoint(eng, s, fromX, fromY)
  s.fleeX = f.x; s.fleeY = f.y; s.blows = []; s.repels++
  go(s, 'repel')
  e.state = 'wander'; e.stunT = 0; e.lungeT = 0
  audio.aggro()
  eng.msg(`持续的尖啸在水中炸开——小小合死甲壳、抱住头，猛蹬着逃离了门区！（约 ${TINY.repelT} 秒后它会回来）`, 'system')
}
/** 一声卡祖笛传到小小这里（声源 ox/oy） */
export function tinyKazoo(eng: Engine, e: Entity, ox: number, oy: number) {
  const s = runtime(eng, e)
  const d = Math.hypot(e.x - ox, e.y - oy)
  if (d > TINY.repelR) {
    if (d < 30 && !s.farMsg) { s.farMsg = true; eng.msg('远处的小小抬起头，听了一会儿——笛声离它还太远。', 'system') }
    return
  }
  if (s.phase === 'repel') return
  s.cringeT = 0.6
  s.blows = s.blows.filter((t) => s.clock - t <= TINY.repelWindow)
  s.blows.push(s.clock)
  const n = s.blows.length
  if (n >= TINY.repelBlows) { tinyRepel(eng, e, ox, oy); return }
  eng.msg(n === 1 ? `小小猛地一缩，甲壳合拢了一半。（持续吹奏：${n}/${TINY.repelBlows}）`
    : `它抱住头，在门上方不安地扭动。（${n}/${TINY.repelBlows}——别停）`, 'system')
}

/** 挨打/被炸/被投掷物打中：不掉血，受惊一下，算肢体接触 */
export function tinyStruck(eng: Engine, e: Entity) {
  const s = runtime(eng, e)
  e.hp = e.def.hp
  e.stunT = Math.max(e.stunT, TINY.flinchT)
  s.cringeT = 0.6
  if (!e.provoked) tinyProvoke(eng, e, 'contact')
  else eng.msg('攻击落在它橡胶般的皮肤上——像打在一块轮胎上。它毫发无伤。', 'system')
}
/** combat.killCheck 钩子：小小永远不会死，也不掉任何东西 */
export function tinyKillGuard(eng: Engine, e: Entity): boolean {
  if (!isTiny(e)) return false
  if (e.hp < e.def.hp && !e.dead) tinyStruck(eng, e)
  e.hp = e.def.hp; e.dead = false
  return true
}

/** entityAI.noiseEvent 钩子：只把明显的响动计入恼怒（快速游泳、投掷物落水、爆炸、破门…） */
export function tinyHear(eng: Engine, e: Entity, x: number, y: number, radius: number, sprint: boolean) {
  if (kazooBroadcast) return
  if (!sprint && radius < TINY.loudR) return
  const d0 = Math.hypot(e.x - x, e.y - y)
  if (d0 >= Math.max(radius, TINY.hearR)) return
  tinyAnnoy(eng, e, x, y, 'noise')
}

/** 对话里提到「出口/门」 */
export function tinyScorn(eng: Engine) {
  const m = eng.map; if (!m) return
  const p = eng.player
  let best: Entity | undefined, bd = 8
  for (const e of m.entities) if (!e.dead && isTiny(e)) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e } }
  if (best) tinyAnnoy(eng, best, p.x, p.y, 'talk')
}
/** 交互层：现在能不能和它说话（null=能；否则是拒绝的理由） */
export function tinyRefusesTalk(e: Entity): string | null {
  const s = tinyState(e)
  if (e.provoked) return '它不再回答。焦油层下的荧光斑冷冷地亮着，只剩毫不掩饰的恶意。'
  if (s.phase === 'repel') return '它抱着头蜷在远处的水里，根本不理你。'
  if (s.phase === 'return') return '它正慢慢游回门上方，眼睛一直盯着你手里的东西。'
  return null
}

// ======================= 每帧 =======================
/** entityAI.updateEntities 钩子。返回 true = 本帧已处理完（不走通用状态机）；追杀时返回 false 交给通用追击/攻击。 */
export function updateTiny(eng: Engine, e: Entity, dt: number, d: number): boolean {
  const s = runtime(eng, e), p = eng.player, def = e.def
  s.clock += dt; s.t += dt
  s.cringeT = Math.max(0, s.cringeT - dt)
  e.hp = def.hp // 不可杀
  if (!def.passive && !e.provoked) e.provoked = true // 开发者召唤的非温顺个体：一出生就在追杀
  updateHome(eng, s)
  if (!e.encountered && d < def.sight && eng.los(p.x, p.y, e.x, e.y)) recordEntityEncounter(e)
  // 安静就消气
  if (s.anger > 0 && !e.provoked) { s.quietT += dt; if (s.quietT >= TINY.annoyDecay) { s.anger--; s.quietT = 0 } }
  // 连吹中断：窗口过期时不足 4 次 = 一次断续噪音
  if (s.blows.length && s.clock - s.blows[s.blows.length - 1] > TINY.repelWindow) {
    const n = s.blows.length; s.blows = []
    if (n < TINY.repelBlows) tinyAnnoy(eng, e, p.x, p.y, 'broken')
  }
  const homeD = Math.hypot(e.x - s.homeX, e.y - s.homeY)
  const dz = Math.abs(p.z - e.z)
  // 肢体接触
  if (s.phase !== 'repel' && s.phase !== 'hunt' && !eng.dev.invisible && d < TINY.contactR && dz < 2.2) tinyProvoke(eng, e, 'contact')
  if (s.phase !== 'hunt' && e.stunT > 0) { e.stunT -= dt; return true }
  const canHunt = () => e.provoked && playerInWater(eng) && !eng.dev.invisible
  switch (s.phase) {
    case 'perch': {
      e.state = 'idle'
      if (homeD > 0.3) moveTo(eng, e, s.homeX, s.homeY, def.speed * 0.3, dt)
      swimZ(eng, e, s.homeZ, dt)
      if (d < 14) eng.faceToward(e, p.x, p.y, dt, 1.5)
      if (e.provoked) {
        if (canHunt() && d < TINY.rehuntR) { go(s, 'hunt'); s.huntLost = 0; e.state = 'chase'; break }
        s.forgive += dt
        if (s.forgive >= TINY.forgiveT) { e.provoked = false; s.anger = 0; s.forgive = 0 }
      }
      return true
    }
    case 'glare': {
      e.state = 'investigate'
      const a = Math.atan2(s.glareY - s.homeY, s.glareX - s.homeX)
      const reach = Math.min(TINY.leash, Math.hypot(s.glareY - s.homeY, s.glareX - s.homeX))
      moveTo(eng, e, s.homeX + Math.cos(a) * reach, s.homeY + Math.sin(a) * reach, def.speed * 0.5, dt)
      swimZ(eng, e, s.homeZ + 0.6, dt)
      eng.faceToward(e, s.glareX, s.glareY, dt, 4)
      if (s.t >= TINY.glareT) go(s, 'return')
      return true
    }
    case 'repel': {
      e.state = 'wander'
      moveTo(eng, e, s.fleeX, s.fleeY, def.speed * 1.3, dt)
      swimZ(eng, e, s.homeZ + 5, dt)
      if (s.t >= TINY.repelT) {
        if (canHunt() && d < TINY.huntLoseR) { go(s, 'hunt'); s.huntLost = 0; e.state = 'chase' }
        else go(s, 'return')
      }
      return true
    }
    case 'return': {
      e.state = 'wander'
      const arrived = moveTo(eng, e, s.homeX, s.homeY, def.speed * 0.8, dt)
      swimZ(eng, e, s.homeZ, dt)
      if (canHunt() && d < TINY.rehuntR) { go(s, 'hunt'); s.huntLost = 0; e.state = 'chase'; break }
      if (arrived || homeD < 0.4) go(s, 'perch')
      return true
    }
    case 'hunt': break
  }
  // ---- 追杀：交给通用追击/攻击；这里只负责「何时放弃」 ----
  if (!e.provoked) { go(s, 'return'); return true }
  const lost = !playerInWater(eng) || d > TINY.huntLoseR || eng.dev.invisible
  s.huntLost = lost ? s.huntLost + dt : 0
  if (s.huntLost >= TINY.huntLoseT) {
    go(s, 'return'); s.forgive = 0; e.state = 'wander'
    if (d < 40) eng.msg('小小在水面下停住了，盯了你很久，然后慢慢游回了门上方。', 'system')
    return true
  }
  if (e.state !== 'chase' && e.state !== 'attack') { e.state = 'chase'; e.stateT = 8 }
  // 通用追击挪不动（台面/水管旁原地抖）且玩家还够不着：自己游 1 秒（攻击仍交给通用逻辑）
  s.chkT += dt
  if (s.chkT >= 0.5) { if (d > 1.4 && s.chkD - d < 0.3) s.selfT = 1; s.chkT = 0; s.chkD = d }
  if (s.selfT > 0 && d > 1.4) { s.selfT -= dt; swimStraight(eng, e, p.x, p.y, def.speed, dt); swimZ(eng, e, p.z, dt); return true }
  return false
}

// ======================= 石卡祖笛 =======================
export interface KazooBlow { x: number; y: number; echo: boolean; dist: number; o2: boolean }
/** 声源：洞穴里沿视线找岩壁回声点；其它情况从玩家身上传出 */
export function kazooSource(eng: Engine): KazooBlow {
  const m = eng.map!, p = eng.player
  const self = { x: p.x, y: p.y, echo: false, dist: 0, o2: false }
  if (!m.organicCave) return self
  const dx = -Math.sin(look.yaw), dy = -Math.cos(look.yaw)
  for (let t = 0.2; t <= KAZOO.echoMax; t += 0.2) {
    const x = p.x + dx * t, y = p.y + dy * t
    if (!wallAt(m, Math.floor(x), Math.floor(y), 0)) continue
    const k = Math.max(0, t - KAZOO.echoBack)
    return { x: p.x + dx * k, y: p.y + dy * k, echo: true, dist: k, o2: false }
  }
  return self
}
/** 一声笛响在 (x, y) 炸开：普通实体当诱饵噪音，小小按连吹计数 */
function resolveKazoo(eng: Engine, x: number, y: number) {
  const m = eng.map!
  kazooBroadcast = true
  try { eng.noiseEvent(x, y, KAZOO.noiseR, true) } finally { kazooBroadcast = false }
  for (const e of m.entities) if (!e.dead && isTiny(e)) tinyKazoo(eng, e, x, y)
}
function echoDust(eng: Engine, x: number, y: number, z: number) {
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2
    eng.particles.push({ x, y, vx: Math.cos(a) * 1.4, vy: Math.sin(a) * 1.4, t: 0, life: 0.5, color: '#d8d0bc', size: 1.6 + Math.random(), z: z + 1.3 })
  }
}
/** 吹一声石卡祖笛（主手使用结算） */
export function blowKazoo(eng: Engine): KazooBlow {
  const m = eng.map!
  const src = kazooSource(eng)
  if (eng.submerged) {
    src.o2 = true
    eng.breathT += KAZOO.o2Cost
  }
  audio.kazoo(eng.submerged, src.echo ? src.dist : 0)
  resolveKazoo(eng, src.x, src.y)
  if (src.echo) echoDust(eng, src.x, src.y, eng.player.z)
  const nearTiny = m.entities.some((e) => !e.dead && isTiny(e) && Math.hypot(e.x - src.x, e.y - src.y) <= TINY.repelR)
  if (!nearTiny) {
    eng.msg(src.echo ? `笛声撞上 ${Math.round(src.dist)} 米外的岩壁，回声从那边炸开——附近的东西会循声过去。`
      : src.o2 ? '你在水下吹响石卡祖笛：一串气泡和一声闷闷的尖鸣。这一口很费气。'
      : '石卡祖笛发出一声刺耳的长鸣，比你预想的响得多。', 'system')
  } else if (src.o2) eng.msg(`这一口很费气（屏气 -${KAZOO.o2Cost} 秒）。`, 'system')
  return src
}

// ---- L8 乐器洞石风铃：持续声源 ----
const chimes = new WeakMap<Structure, { left: number; next: number }>()
export function pokeChime(eng: Engine, s: Structure): boolean {
  if (!eng.hasItem('stonekazoo')) {
    eng.msg('风铃的石管又粗又沉，用手拨只发出几声闷响。也许需要一根细长坚硬的东西去戳它。', 'system')
    audio.uiTick()
    return false
  }
  ringChime(s)
  eng.msg(`你用石卡祖笛的笛尖戳了一下风铃。石管互相撞击——铃声在洞穴里一圈圈回荡，经久不息。（约 ${KAZOO.chimeT} 秒，持续把附近的实体引向这里）`, 'lore')
  return true
}
function ringChime(s: Structure) { chimes.set(s, { left: KAZOO.chimeT, next: 0 }); s.data = { ...s.data, ring: 1 } }
export function chimeRinging(s: Structure): boolean { return (chimes.get(s)?.left ?? 0) > 0 }
/** 每帧（ambient）：风铃回响 */
export function kazooAmbient(eng: Engine, dt: number) {
  const m = eng.map
  if (!m) return
  for (const s of m.structures) {
    if (s.kind !== 'stonechime') continue
    const c = chimes.get(s)
    if (!c) continue
    c.left -= dt; c.next -= dt
    if (c.left <= 0) { chimes.delete(s); s.data = { ...s.data, ring: 0 }; continue }
    if (c.next <= 0) {
      c.next = KAZOO.chimeEvery
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2
      const dist = Math.hypot(cx - eng.player.x, cy - eng.player.y)
      audio.stoneChime(Math.max(0, 1 - dist / 30) * (0.35 + 0.65 * c.left / KAZOO.chimeT))
      const keep = eng.playerNoiseT // 风铃不是玩家本人在出声：不刷新猎犬威慑用的「玩家噪音」
      eng.noiseEvent(cx, cy, KAZOO.chimeNoiseR, false)
      eng.playerNoiseT = keep
    }
  }
}
