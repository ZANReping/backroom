// Nguithr'xurh（Entity 16）重制——第 3 阶段：AI / 机制（见 app/NGUITHR-REMAKE.md）。
// 依据中文维基 entity-16：避日目、16 只附肢；在天花板织球状网囊并注入镇静剂；附近没有猎物时持续补囊；
// 对小型猎物直接喷化学物质再进食；对人类完全静止——流浪者走到陷阱正下方时切下一个球（多数人不会注意到第一个球，
// 只是开始疑惑），镇静生效后一次性放下全部球，使目标对外界完全失去反应，再顺丝降到猎物旁活吃；
// 进食后回到天花板休眠，直到重新布置陷阱。慢、不追逐。应对：留意网囊、绕开、不时摇晃身体。分泌物相对无害，可制药。
//
// 本模块只持有局内内存状态：实体上的 e.ng（NguithrState）、引擎上的 eng.ngRun（玩家镇静/挣脱）。
// 存档格式、联机协议均未改动（effects 表 resetOnNewRun/resetOnLevel，无 saveKey；实体本就不入存档）。
//
// 坐标约定：e.x/e.y = 它身体（胸节）在地面上的投影（窗口坐标）；e.z = 脚下地面高度（不随天花板变化，
// 命中/楼层带判定与其它实体一致）；天花板绝对高度在 ng.ceil。巢中心存世界绝对坐标（nestWX/nestWY），
// 无限层窗口平移后用 m.inf.ox/oy 换算回窗口坐标。
// ng.yaw = 渲染外层组（倒挂）的 rotation.y：天花板上它面朝 yaw；翻身落地后面朝 yaw+π（见 nguithrAnim 的挂载换手说明）。
import type { Engine } from '../engine'
import { recordEntityEncounter, type Entity } from '../entities'
import { audio } from '../core/audio'
import { look, WALL_H } from '../renderer/shared'
import { ceilingHeightAt, bandOfZ, walkableAt,structBlocksSight } from '../world/mapgen'
import { nguithrSacLayout } from '../renderer/nguithrMesh'

// ============================================================================
// 全部数值（NGUITHR-REMAKE.md 的数值表与此一一对应）
// ============================================================================
export const NG = {
  // —— 巢 ——
  sacMin: 3, sacMax: 6, // 每个巢的网囊上限（按巢中心世界坐标哈希确定，3–6）
  scale: [0.85, 1.15] as const, // 个体缩放
  // —— 第一段：切囊 → 轻度镇静 ——
  triggerR: 0.6, // 玩家在某个完整网囊正下方（水平距离 < 0.6m）即触发切囊
  triggerDz: 1.4, // 玩家脚下高度与巢所在楼层高度差上限
  cutLead: 0.35, // 触发→网囊爆开（cut 片段从 NG_CUT_POP_T-cutLead 处起播，伸足/锯丝被压缩成一记快切）
  cutTail: 1.6, // 爆开后收足
  lightR: 1.6, // 爆开洒落半径（水平）
  lightDur: 7, // 轻度镇静时长（s）
  lightSpeed: 0.72, // 轻度镇静移动倍率
  // —— 第二段：窗口 → 全部放下 → 重度镇静 ——
  windowDur: 5, // 第一个球爆开后的判定窗口（s）
  windowGrace: 1.4, // 窗口开头的宽限（让玩家有时间察觉并离开）
  nestR: 2.2, // 「仍在巢下」半径（水平，距巢中心）
  heavyCatchR: 2.6, // 放下全部球的瞬间玩家仍在此半径内才吃满重度剂量
  heavyStagger: 0.12, // 逐个放下的间隔
  heavyDur: 16, // 重度镇静时长（s；进食期间被持续续上）
  heavySanity: 15, // 重度镇静立即理智损失
  heavySanityRate: 1.2, // 重度镇静期间理智每秒损失
  heavyRefresh: 2.5, // 进食中重度镇静至少保持这么久（不挣脱就会一直被吃）
  // —— 挣脱（摇晃身体：跳跃键 / 左右交替）——
  struggleLight: 1, // 轻度：一下就解除
  struggleHeavy: 14, // 重度：需要累计 14 下
  struggleDecay: 1.1, // 挣脱值每秒衰减（必须连续快速地摇）
  freedGroggy: 1.5, // 从重度中挣脱后残留的轻度镇静（s）
  // —— 移动 ——
  ceilCrawl: 0.7, // 天花板上爬行（m/s）
  turnRate: 2.4, // 原地转向（rad/s）
  standOff: 0.75, // 垂降点离猎物的距离
  descendRate: 1.5, // 垂降片段播放倍率（7.5s → 5s）
  climbRate: 1.5, // 爬升片段播放倍率
  groundSpeed: 0.22, // 地面爬行（极慢）
  giveUpR: 4, // 地面上玩家离开 4m 即放弃，爬回天花板
  groundMax: 25, // 地面最长逗留（s）
  // —— 进食 / 撕咬 ——
  feedTick: 1.0, feedDmg: 4, feedSanity: 0.5, // 活食：每秒 4 点（hurtPlayer 另扣理智）
  feedR: 1.6, // 进食距离
  biteR: 1.25, biteDmg: 8, biteCd: 1.8, biteWind: 0.45, biteLight: 1.5, // 地面上被逼近时的撕咬（附带 1.5s 轻度）
  recoil: 1.6, // 被挣脱打断后的僵直
  // —— 休眠 / 重织 ——
  sleepDur: 18, // 进食或放弃后的休眠
  weaveEvery: 22, // 每隔 22s 重织一个网囊
  weaveQuietR: 7, // 玩家在 7m 内时不补囊（附近有猎物）
  weaveDur: 2.2, // 一次补囊的动作时长
  // —— 反制 ——
  projSacPad: 0.14, // 投掷物命中网囊的额外半径
  projBodyR: 0.42, projBodyDmg: 10, // 投掷物命中本体
  spillR: 1.6, spillDur: 2.5, // 被打破的网囊：近处小剂量轻度镇静（远处不受影响）
  cowerDur: 2.6, // 天花板上受击：只缩身，不反击
  glowRange: 9, glowCone: 0.5, // 手电照到网囊会反光（渲染层）
  // —— 喷液捕食小实体 ——
  sprayR: 3.2, sprayDur: 2.4, sprayHitT: 1.6, sprayCd: 20, preyFeedDur: 6, preyScan: 0.5,
  // —— 生成 ——
  spawnL1: 0.04, spawnL2: 0.04, spawnL3: 0.06, // 每 chunk 概率（L1/L2 保持原值，L3 略高）
  colonyChance: 0.18, colonyGap: [2.6, 3.4] as const, // 群居：18% 的巢点会有 2–3 只共享一片天花板
  l5Weight: 2, l8Rarity: 3, // L5 池权重 6→2；L8 巨臂林地槽位再 1/3 概率
  // —— 掉落 ——
  gland: 'sedgland',
} as const

/** 可被喷液捕食的小实体 */
export function isNguithrPrey(q: Entity): boolean {
  if (q.dead || q.hidden) return false
  if (q.def.type === 'dryshrimp') return !q.sh?.caught
  if (q.def.type === 'corpserat') return !q.def.capybara && !q.def.ceilingCrawler && q.rt?.morph !== 'capybara'
  return false
}

// ============================================================================
// 状态
// ============================================================================
export type SacState = 'intact' | 'popped' | 'hidden'
export interface NgSac { ox: number; oy: number; oz: number; r: number; state: SacState }
export type NgMode =
  | 'ceiling' // 天花板静伏（对人类完全静止）
  | 'cut' // 切下一个网囊
  | 'watch' // 窗口中：静伏观察
  | 'release' // 一次放下全部网囊
  | 'position' // 天花板上挪到猎物上方
  | 'descend' // 顺丝垂降
  | 'feed' // 进食
  | 'ground' // 地面（极慢、不追击）
  | 'climb' // 爬回天花板
  | 'return' // 天花板上爬回巢中心
  | 'sleep' // 休眠
  | 'weave' // 重织一个网囊
  | 'cower' // 天花板上受击缩身
  | 'spray' // 喷液捕食小实体
export interface NguithrState {
  mode: NgMode
  t: number // 当前模式计时
  seed: number
  scale: number
  nestWX: number; nestWY: number // 巢中心（世界绝对坐标）
  ceil: number // 巢处天花板绝对高度
  floorZ: number // 巢所在楼层地面高度
  sacs: NgSac[]
  sacIdx: number // 正在切/补的网囊
  windowT: number // 第一个球爆开后经过的时间（<0 = 不在窗口中）
  released: number // release 模式已放下的个数
  yaw: number
  speed: number; turn: number // 本帧实际爬行速度/转向（渲染层据此驱动步态，足尖不打滑）
  clip: string; clipT: number // 渲染层播放的片段与片段时间
  target: 'player' | Entity | null
  tx: number; ty: number // 垂降/爬行目标（窗口坐标）
  fed: boolean
  feedT: number; tickT: number
  biteCd: number; biteT: number
  recoilT: number
  weaveT: number
  sprayCd: number; scanT: number
  hpSeen: number
  groundT: number
  colony: number // 共享天花板的同伴数（含自己）
}
export interface NguithrRunState {
  level: 'none' | 'light' | 'heavy'
  t: number // 剩余时间
  src: number // 施加者实体 id（-1 = 无）
  struggle: number
  presses: number // 本次镇静累计按键（QA/HUD）
  jumpHeld: boolean
  side: number // 上一次左右摇晃方向
  muffled: boolean
  hint: string
  freedT: number // 刚挣脱的提示计时
}
export function freshNgRun(): NguithrRunState {
  return { level: 'none', t: 0, src: -1, struggle: 0, presses: 0, jumpHeld: false, side: 0, muffled: false, hint: '', freedT: 0 }
}

const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a }
const hashU = (x: number, y: number, k: number) => {
  let h = (Math.imul(Math.floor(x * 4) | 0, 0x27d4eb2d) ^ Math.imul(Math.floor(y * 4) | 0, 0x165667b1) ^ Math.imul(k, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const ox = (eng: Engine) => eng.map?.inf?.ox ?? 0
const oy = (eng: Engine) => eng.map?.inf?.oy ?? 0
/** 巢中心（窗口坐标） */
export function nguithrNestXY(eng: Engine, s: NguithrState) { return { x: s.nestWX - ox(eng), y: s.nestWY - oy(eng) } }
/** 第 i 个网囊的世界位置（窗口坐标 + 绝对高度） */
export function nguithrSacWorld(eng: Engine, s: NguithrState, i: number) {
  const n = nguithrNestXY(eng, s), c = s.sacs[i]
  return { x: n.x + c.ox, y: n.y + c.oy, z: s.ceil + c.oz, r: c.r }
}

/** 取（必要时初始化）实体的 Nguithr 状态 */
export function nguithrState(eng: Engine, e: Entity): NguithrState {
  if (e.ng) return e.ng
  const m = eng.map!
  const wx = e.x + ox(eng), wy = e.y + oy(eng)
  const seed = Math.floor(hashU(wx, wy, 16) * 0xffff)
  const count = NG.sacMin + Math.floor(hashU(wx, wy, 61) * (NG.sacMax - NG.sacMin + 1))
  const wallH = WALL_H[eng.levelDef.gen] ?? 3
  let ceil = ceilingHeightAt(m, e.x, e.y, wallH, bandOfZ(e.z))
  if (!Number.isFinite(ceil) || ceil - e.z < 2.1 || ceil - e.z > 6) ceil = e.z + wallH
  const sacs: NgSac[] = nguithrSacLayout(count, seed).map((c) => ({ ox: c.x, oy: c.z, oz: c.y, r: c.r, state: 'intact' as SacState }))
  e.ng = {
    mode: 'ceiling', t: 0, seed, scale: NG.scale[0] + hashU(wx, wy, 7) * (NG.scale[1] - NG.scale[0]),
    nestWX: wx, nestWY: wy, ceil, floorZ: e.z, sacs, sacIdx: -1, windowT: -1, released: 0,
    yaw: hashU(wx, wy, 3) * Math.PI * 2, speed: 0, turn: 0, clip: 'idle', clipT: 0,
    target: null, tx: e.x, ty: e.y, fed: false, feedT: 0, tickT: 0, biteCd: 0, biteT: 0, recoilT: 0,
    weaveT: NG.weaveEvery, sprayCd: 0, scanT: hashU(wx, wy, 9) * NG.preyScan, hpSeen: e.hp, groundT: 0, colony: 1,
  }
  e.webX = e.x; e.webY = e.y // 旧字段保持语义（结囊处）
  let mates = 1
  for (const q of m.entities) if (q !== e && q.def.type === 'nguithr' && !q.dead && Math.hypot(q.x - e.x, q.y - e.y) < 4) mates++
  e.ng.colony = mates
  return e.ng
}

const onCeilingModes: NgMode[] = ['ceiling', 'cut', 'watch', 'release', 'position', 'return', 'sleep', 'weave', 'cower', 'spray']
/** 它是否挂在天花板上（含切囊/喷液/缩身等天花板动作） */
export function nguithrOnCeiling(s: NguithrState) { return onCeilingModes.includes(s.mode) }
/** 身体中心的绝对高度（命中判定用） */
export function nguithrBodyZ(e: Entity, s: NguithrState) {
  if (nguithrOnCeiling(s)) return s.ceil - 0.16 * s.scale
  if (s.mode === 'descend' || s.mode === 'climb') {
    const k = Math.min(1, s.clipT / 7.5)
    const f = s.mode === 'descend' ? k : 1 - k
    return s.ceil - 0.16 * s.scale + (e.z + 0.16 - s.ceil) * f
  }
  return e.z + 0.16 * s.scale
}

function setMode(s: NguithrState, mode: NgMode, clip?: string) {
  s.mode = mode; s.t = 0; s.clipT = 0; s.speed = 0; s.turn = 0
  if (clip) s.clip = clip
}

// ============================================================================
// 玩家：镇静 / 挣脱
// ============================================================================
function setMuffle(eng: Engine, on: boolean) {
  if (eng.ngRun.muffled === on) return
  eng.ngRun.muffled = on
  audio.setMuffled(on)
}

const LIGHT_HINTS = ['头顶好像有什么……啪的一声？', '空气里有股甜腻的、像药水的味道。', '你忽然想不起自己刚才要往哪儿走。', '是不是有点困……？']
/** 轻度镇静（只会延长，不会把重度降成轻度） */
export function applyNguithrLight(eng: Engine, dur: number, src = -1, quiet = false) {
  if (eng.dev.invisible) return
  const r = eng.ngRun
  if (r.level === 'heavy') return
  if (r.level === 'none') { r.struggle = 0; r.presses = 0; r.side = 0 }
  r.level = 'light'; r.t = Math.max(r.t, dur); r.src = src
  r.hint = LIGHT_HINTS[Math.floor(Math.random() * LIGHT_HINTS.length)]
  setMuffle(eng, true)
  // 含糊的提示：受害者自己并不清楚发生了什么（多数人注意不到第一个球）
  if (!quiet) eng.msg(r.hint, 'system')
}
/** 重度镇静：无法移动、画面变暗、理智下降 */
export function applyNguithrHeavy(eng: Engine, src: number) {
  if (eng.dev.invisible) return
  const r = eng.ngRun, p = eng.player
  const was = r.level
  r.level = 'heavy'; r.t = NG.heavyDur; r.src = src
  if (was !== 'heavy') { r.struggle = 0; r.presses = 0; r.side = 0 }
  if (!eng.dev.statLock) p.sanity = Math.max(0, p.sanity - NG.heavySanity)
  r.hint = '摇晃身体——【空格】或【A/D 交替】'
  setMuffle(eng, true)
  eng.camShake = Math.min(1, eng.camShake + 0.3)
  eng.msg('一连串湿漉漉的爆裂声。四肢不再听你使唤，周围的一切都在远去……（重度镇静 · 连按空格 / A·D 交替摇晃身体挣脱）', 'damage')
}
function clearRun(eng: Engine) {
  const r = eng.ngRun
  r.level = 'none'; r.t = 0; r.src = -1; r.struggle = 0; r.hint = ''
  setMuffle(eng, false)
}
/** 重度镇静时锁定移动/攻击/跳跃（与杰瑞木僵同一入口 introLock） */
export function nguithrInputLock(eng: Engine) { return eng.ngRun?.level === 'heavy' }
/** 移动倍率（movement.ts） */
export function nguithrSpeedMult(eng: Engine) { return eng.ngRun?.level === 'light' ? NG.lightSpeed : 1 }

/** 每帧（移动结算之前）：计时、理智、挣脱输入 */
export function nguithrPlayerTick(eng: Engine, dt: number) {
  const r = eng.ngRun, p = eng.player
  if (r.freedT > 0) r.freedT -= dt
  if (r.level === 'none') { r.jumpHeld = !!eng.input.jump; if (r.muffled) setMuffle(eng, false); return }
  // —— 摇晃身体：跳跃键上升沿 + 左右交替（输入在本帧已被视角旋到世界系，这里转回屏幕系取横移分量）——
  let shakes = 0
  const jump = !!eng.input.jump
  if (jump && !r.jumpHeld) shakes++
  r.jumpHeld = jump
  const sy = Math.sin(look.yaw), cy = Math.cos(look.yaw)
  const strafe = cy * eng.input.mx - sy * eng.input.my
  const side = strafe > 0.5 ? 1 : strafe < -0.5 ? -1 : 0
  if (side !== 0 && r.side !== 0 && side !== r.side) shakes++ // 只有「换向」才算一次摇晃（单纯横移不算）
  if (side !== 0) r.side = side
  if (shakes) {
    r.struggle += shakes; r.presses += shakes
    if (r.level === 'heavy') { audio.swing(); eng.camShake = Math.min(1, eng.camShake + 0.08) }
  }
  const need = r.level === 'heavy' ? NG.struggleHeavy : NG.struggleLight
  if (r.struggle < need - 1e-6) r.struggle = Math.max(0, r.struggle - NG.struggleDecay * dt)
  if (r.struggle >= need - 1e-6) {
    if (r.level === 'heavy') {
      const src = r.src, presses = r.presses
      clearRun(eng)
      applyNguithrLight(eng, NG.freedGroggy, -1, true)
      r.presses = presses; r.freedT = 2.5
      eng.msg('你拼命扭动、甩动身体——黏在身上的丝和药液被甩开，你踉跄着挣脱了！', 'loot')
      const e = eng.map?.entities.find((q) => q.id === src && q.def.type === 'nguithr')
      if (e?.ng) nguithrInterrupt(eng, e)
    } else {
      clearRun(eng)
      eng.msg('你甩了甩头，用力晃了晃身体——那股昏沉感散了。', 'system')
    }
    return
  }
  r.t -= dt
  if (r.level === 'heavy' && !eng.dev.statLock) p.sanity = Math.max(0, p.sanity - NG.heavySanityRate * dt)
  if (r.t <= 0) {
    const wasHeavy = r.level === 'heavy'
    clearRun(eng)
    eng.msg(wasHeavy ? '知觉一点点回到身体里。' : '那股昏沉感慢慢退去了。', 'system')
  }
}

/** HUD 叠加层参数 */
export function nguithrOverlay(eng: Engine) {
  const r = eng.ngRun
  if (r.level === 'none') return { level: 'none' as const, fog: 0, dark: 0, blur: 0, hint: '', struggle: 0, need: 0, freed: r.freedT > 0 }
  const heavy = r.level === 'heavy'
  const fade = Math.min(1, r.t / 1.2) // 快结束时淡出
  const pulse = 0.5 + 0.5 * Math.sin(eng.time * 1.7)
  return {
    level: r.level,
    fog: (heavy ? 0.55 : 0.32 + pulse * 0.08) * fade,
    dark: heavy ? 0.58 * fade : 0.08 * fade,
    blur: (heavy ? 4.5 : 2.2) * fade,
    hint: r.hint,
    struggle: r.struggle,
    need: heavy ? NG.struggleHeavy : NG.struggleLight,
    freed: false,
  }
}

// ============================================================================
// 实体
// ============================================================================
function spillParticles(eng: Engine, x: number, y: number, z: number, n = 12) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 0.2 + Math.random() * 0.9
    eng.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.7 + Math.random() * 0.4, color: i % 3 ? '#d8c46a' : '#efe3a8', size: 0.035 + Math.random() * 0.04, z, vz: -1.6 - Math.random() * 1.8 })
  }
}
function sprayParticles(eng: Engine, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  const T = 0.45
  for (let i = 0; i < 16; i++) {
    const j = () => (Math.random() - 0.5) * 0.5
    eng.particles.push({ x: x0, y: y0, vx: (x1 - x0) / T + j(), vy: (y1 - y0) / T + j(), t: 0, life: T * (0.8 + Math.random() * 0.4), color: i % 2 ? '#cfe08a' : '#e6eab0', size: 0.03 + Math.random() * 0.03, z: z0, vz: (z1 - z0) / T + j() })
  }
}

/** 打破/切下一个网囊：爆开洒药 */
function popSac(eng: Engine, e: Entity, s: NguithrState, i: number, dose: 'cut' | 'spill' | 'release') {
  const c = s.sacs[i]
  if (c.state !== 'intact') return
  c.state = 'popped'
  const w = nguithrSacWorld(eng, s, i)
  spillParticles(eng, w.x, w.y, w.z, dose === 'release' ? 8 : 14)
  const p = eng.player
  const dh = Math.hypot(p.x - w.x, p.y - w.y), dz = Math.abs(p.z - s.floorZ)
  audio.splash(dh < 6 ? 0.55 : 0.2)
  if (dz > NG.triggerDz + 0.6||!eng.los(p.x,p.y,w.x,w.y)) return
  if (dose === 'cut' && dh < NG.lightR) applyNguithrLight(eng, NG.lightDur, e.id)
  if (dose === 'spill' && dh < NG.spillR) applyNguithrLight(eng, NG.spillDur, -1)
}

/** 挣脱打断 */
export function nguithrInterrupt(_eng: Engine, e: Entity) {
  const s = e.ng
  if (!s) return
  if (s.mode === 'feed' || s.mode === 'ground') { s.mode = 'ground'; s.t = 0; s.recoilT = NG.recoil; s.target = null; s.speed = 0 }
  else if (s.mode === 'position' || s.mode === 'release') { setMode(s, 'return', 'idle') }
  // 垂降中被挣脱：落地后由 ground 判定（玩家走远就爬回去）
  audio.hit()
}

/** 被击杀：掉落镇静腺；释放被它镇静的玩家 */
export function nguithrKilled(eng: Engine, e: Entity) {
  const m = eng.map!
  const item = { id: Math.random(), type: NG.gland, x: e.x, y: e.y, z: e.z }
  m.items.push(item)
  const inf = m.inf
  if (inf) inf.chunks.get(`${Math.floor((item.x + inf.ox) / 32)},${Math.floor((item.y + inf.oy) / 32)}`)?.items.push(item)
  if (eng.ngRun.src === e.id && eng.ngRun.level === 'heavy') { clearRun(eng); applyNguithrLight(eng, NG.freedGroggy, -1, true) }
  eng.msg('它蜷起十六只附肢翻倒了。腹部下方鼓着一枚半透明的腺体——镇静腺。', 'loot')
}

/** 天花板爬行：转向目标点再前进；到达返回 true */
function crawlCeil(eng:Engine,e: Entity, s: NguithrState, tx: number, ty: number, dt: number, speed: number = NG.ceilCrawl): boolean {
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy)
  if (d < 0.06) { s.speed = 0; s.turn = 0; return true }
  const diff = wrap(Math.atan2(dy, dx) - s.yaw)
  const step = Math.max(-NG.turnRate * dt, Math.min(NG.turnRate * dt, diff))
  s.yaw = wrap(s.yaw + step); s.turn = dt > 0 ? step / dt : 0 // 天花板：pose.turn = d(yaw)/dt
  const v = Math.abs(diff) < 0.6 ? Math.min(speed, d / Math.max(dt, 1e-3)) * (1 - Math.abs(diff) / 0.6 * 0.6) : 0
  const nx=e.x+Math.cos(s.yaw)*v*dt,ny=e.y+Math.sin(s.yaw)*v*dt,band=bandOfZ(s.floorZ),m=eng.map!
  // Ceiling motion still respects the same actual walls/columns as the player.
  // No pathfinder: a blocked body waits rather than crossing solid geometry.
  const r=.18*s.scale,z=s.ceil-.16*s.scale
  for(const [dx,dy]of [[0,0],[r,0],[-r,0],[0,r],[0,-r]]){
    if(!walkableAt(m,Math.floor(nx+dx),Math.floor(ny+dy),band)||structBlocksSight(m,nx+dx,ny+dy,z,band)){s.speed=0;return false}
  }
  e.x=nx;e.y=ny
  s.speed = v
  return false
}
/** 原地转到 yaw；对齐返回 true（ceiling=true 时按天花板转向号约定） */
function turnTo(s: NguithrState, want: number, dt: number, ceiling: boolean): boolean {
  const diff = wrap(want - s.yaw)
  const step = Math.max(-NG.turnRate * dt, Math.min(NG.turnRate * dt, diff))
  s.yaw = wrap(s.yaw + step)
  s.turn = dt > 0 ? (ceiling ? step : -step) / dt : 0
  s.speed = 0
  return Math.abs(diff) < 0.1
}

function playerUnder(eng: Engine, s: NguithrState): number {
  const p = eng.player
  if (eng.dev.invisible || Math.abs(p.z - s.floorZ) > NG.triggerDz) return -1
  let best = -1, bd: number = NG.triggerR
  for (let i = 0; i < s.sacs.length; i++) {
    if (s.sacs[i].state !== 'intact') continue
    const w = nguithrSacWorld(eng, s, i)
    const d = Math.hypot(p.x - w.x, p.y - w.y)
    if (d < bd&&eng.los(p.x,p.y,w.x,w.y)) { bd = d; best = i }
  }
  return best
}
function distNest(eng: Engine, s: NguithrState) {
  const n = nguithrNestXY(eng, s), p = eng.player
  if (eng.dev.invisible || Math.abs(p.z - s.floorZ) > NG.triggerDz) return 1e9
  return Math.hypot(p.x - n.x, p.y - n.y)
}
/** 垂降点：猎物旁 standOff 处（地面可走），落地后面朝猎物 */
function pickDropPoint(eng: Engine, e: Entity, s: NguithrState, px: number, py: number) {
  const m = eng.map!
  let dx = e.x - px, dy = e.y - py
  const d = Math.hypot(dx, dy)
  if (d < 0.05) { dx = Math.cos(s.yaw); dy = Math.sin(s.yaw) } else { dx /= d; dy /= d }
  let tx = px + dx * NG.standOff, ty = py + dy * NG.standOff
  if (!walkableAt(m, Math.floor(tx), Math.floor(ty), bandOfZ(e.z))) { tx = px + dx * 0.35; ty = py + dy * 0.35 }
  s.tx = tx; s.ty = ty
}

/** 主更新（entityAI 分派） */
export function updateNguithrEntity(eng: Engine, e: Entity, dt: number) {
  const s = nguithrState(eng, e)
  const p = eng.player, m = eng.map!
  s.t += dt
  if (s.biteCd > 0) s.biteCd -= dt
  // 图鉴遭遇：看见它（6m 内有视线），或被它镇静
  if (!e.encountered && !eng.dev.invisible && (Math.hypot(p.x - e.x, p.y - e.y) < 6 && eng.los(p.x, p.y, e.x, e.y) || eng.ngRun.src === e.id)) recordEntityEncounter(e)
  if (s.sprayCd > 0) s.sprayCd -= dt
  // —— 受击检测（任何伤害来源）——
  if (e.hp < s.hpSeen - 1e-6) {
    s.hpSeen = e.hp
    if (nguithrOnCeiling(s) && s.mode !== 'cower') {
      // 在天花板上被攻击：只缩成一团，不反击；切囊窗口随之作废
      s.windowT = -1
      setMode(s, 'cower', 'cower')
      audio.scrape(0.35)
    }
  }
  s.hpSeen = e.hp
  if (s.windowT >= 0) s.windowT += dt
  const n = nguithrNestXY(eng, s)
  switch (s.mode) {
    case 'ceiling': case 'watch': {
      s.clip = 'idle'; s.speed = 0; s.turn = 0
      // 窗口：第一个球爆开后 grace..windowDur 内玩家仍在巢下方 → 放下全部
      if (s.windowT >= 0) {
        if (s.windowT >= NG.windowGrace && s.windowT <= NG.windowDur && distNest(eng, s) <= NG.nestR) {
          s.windowT = -1; s.released = 0; setMode(s, 'release', 'release'); break
        }
        if (s.windowT > NG.windowDur) { s.windowT = -1; s.mode = 'ceiling' }
      }
      // 回到巢中心的静息点（被击退或刚补完囊后可能有偏差）
      if (Math.hypot(n.x - e.x, n.y - e.y) > 0.05) crawlCeil(eng,e, s, n.x, n.y, dt, 0.25)
      // 第一段：玩家走到某个完整网囊正下方 → 切下它
      const hit = playerUnder(eng, s)
      if (hit >= 0) { s.sacIdx = hit; setMode(s, 'cut', 'cut'); s.clipT = CUT_POP_T - NG.cutLead; break }
      // 喷液捕食小实体
      s.scanT -= dt
      if (s.scanT <= 0) {
        s.scanT = NG.preyScan
        if (s.sprayCd <= 0) {
          let best: Entity | null = null, bd: number = NG.sprayR
          for (const q of m.entities) {
            if (!isNguithrPrey(q)) continue
            const d = Math.hypot(q.x - e.x, q.y - e.y)
            if (d < bd && Math.abs(q.z - s.floorZ) < 1.2&&eng.los(e.x,e.y,q.x,q.y)) { bd = d; best = q }
          }
          if (best) { s.target = best; setMode(s, 'spray', 'spray'); break }
        }
      }
      // 附近没有猎物时持续补囊
      const missing = s.sacs.findIndex((c) => c.state !== 'intact')
      if (missing >= 0 && s.windowT < 0 && Math.hypot(p.x - e.x, p.y - e.y) > NG.weaveQuietR) {
        s.weaveT -= dt
        if (s.weaveT <= 0) { s.sacIdx = missing; setMode(s, 'weave', 'weave') }
      }
      break
    }
    case 'cut': {
      s.clipT += dt
      if (s.t >= NG.cutLead && s.sacs[s.sacIdx]?.state === 'intact') {
        popSac(eng, e, s, s.sacIdx, 'cut')
        s.windowT = 0
      }
      // 窗口在切囊收足期间同样计时（ceiling/watch 分支里判定）
      if (s.windowT >= NG.windowGrace && distNest(eng, s) <= NG.nestR) { s.windowT = -1; s.released = 0; setMode(s, 'release', 'release'); break }
      if (s.t >= NG.cutLead + NG.cutTail) { s.mode = 'watch'; s.t = 0; s.clip = 'idle' }
      break
    }
    case 'release': {
      s.clipT += dt
      const want = Math.min(s.sacs.length, Math.floor(s.t / NG.heavyStagger) + 1)
      for (let i = 0; i < s.sacs.length && s.released < want; i++) {
        if (s.sacs[i].state !== 'intact') continue
        if (s.released === 0) {
          // 第一颗落下的同时结算剂量：玩家仍在巢下 → 重度；刚好跑出去 → 只沾到一点
          const dn = distNest(eng, s)
          if (dn <= NG.heavyCatchR) { applyNguithrHeavy(eng, e.id); s.target = 'player' }
          else { s.target = null; if (dn < NG.heavyCatchR + 1.5) applyNguithrLight(eng, 2.5, e.id) }
          audio.aggro()
        }
        popSac(eng, e, s, i, 'release'); s.released++
      }
      if (s.sacs.every((c) => c.state !== 'intact') && s.t > NG.heavyStagger * 2) {
        if (s.target === 'player' && eng.ngRun.level === 'heavy') { pickDropPoint(eng, e, s, p.x, p.y); setMode(s, 'position', 'idle') }
        else setMode(s, 'ceiling', 'idle')
      }
      break
    }
    case 'position': {
      s.clip = 'idle'
      // 猎物（玩家/小实体）仍在：天花板上挪到其上方附近，再转身背对它（翻身落地后正好面朝猎物）
      let px: number, py: number
      if (s.target === 'player') {
        if (eng.ngRun.level !== 'heavy') { setMode(s, 'return', 'idle'); break }
        px = p.x; py = p.y
      } else if (s.target) { px = s.target.x; py = s.target.y } else { setMode(s, 'return', 'idle'); break }
      if (crawlCeil(eng,e, s, s.tx, s.ty, dt)) {
        const face = Math.atan2(py - e.y, px - e.x)
        if (turnTo(s, face + Math.PI, dt, true)) {
          const toPlayer = s.target === 'player'
          setMode(s, 'descend', 'descend'); audio.scrape(0.45)
          if (toPlayer) eng.msg('有什么东西顺着一根丝，从天花板上倒挂着降了下来……', 'damage')
        }
      }
      if (s.t > 8) setMode(s, 'descend', 'descend')
      break
    }
    case 'descend': {
      s.clipT += dt * NG.descendRate; s.speed = 0; s.turn = 0
      if (s.clipT >= 7.5) {
        s.clipT = 7.5
        const feedable = s.target === 'player' ? eng.ngRun.level === 'heavy' && Math.hypot(p.x - e.x, p.y - e.y) < NG.feedR : !!s.target
        s.groundT = 0
        if (feedable) { setMode(s, 'feed', 'feed'); s.tickT = 0.3; s.feedT = 0 } else { setMode(s, 'ground', 'crawl') }
      }
      break
    }
    case 'feed': {
      s.clipT += dt; s.speed = 0; s.turn = 0
      if (s.target === 'player') {
        const d = Math.hypot(p.x - e.x, p.y - e.y)
        if (eng.ngRun.level !== 'heavy' || d > NG.feedR || eng.dev.invisible) { setMode(s, 'ground', 'crawl'); s.target = null; break }
        eng.ngRun.t = Math.max(eng.ngRun.t, NG.heavyRefresh) // 分泌物持续注入：不挣脱就一直醒不过来
        s.tickT -= dt
        if (s.tickT <= 0) {
          s.tickT = NG.feedTick
          s.fed = true
          audio.clumpChew(0.7)
          if (!eng.dev.statLock) p.sanity = Math.max(0, p.sanity - NG.feedSanity)
          eng.hurtPlayer(NG.feedDmg, "Nguithr'xurh")
        }
      } else {
        s.feedT += dt
        if (s.feedT > 0.8 && Math.floor(s.feedT) !== Math.floor(s.feedT - dt) && Math.hypot(p.x - e.x, p.y - e.y) < 8) audio.clumpChew(0.35)
        if (s.feedT >= NG.preyFeedDur) { s.fed = true; s.target = null; setMode(s, 'climb', 'climb') }
      }
      break
    }
    case 'ground': {
      s.groundT += dt
      if (s.recoilT > 0) { s.recoilT -= dt; s.clip = 'recoil'; s.clipT += dt; s.speed = 0; s.turn = 0; break }
      // 地面上：若玩家被（别的巢）重度镇静且就在身边——进食
      const d = eng.dev.invisible || Math.abs(p.z - e.z) > 1.6 ? 1e9 : Math.hypot(p.x - e.x, p.y - e.y)
      if (eng.ngRun.level === 'heavy' && d < NG.feedR) { s.target = 'player'; setMode(s, 'feed', 'feed'); s.tickT = 0.3; break }
      if (d > NG.giveUpR || s.groundT > NG.groundMax) { setMode(s, 'climb', 'climb'); break }
      // 撕咬（被逼近时）
      if (s.biteT > 0) {
        s.biteT -= dt; s.clip = 'bite'; s.clipT += dt; s.speed = 0; s.turn = 0
        if (s.biteT <= 0 && d < NG.biteR + 0.2 && !eng.dev.invisible) {
          eng.hurtPlayer(NG.biteDmg, "Nguithr'xurh")
          applyNguithrLight(eng, NG.biteLight, e.id, true)
          s.biteCd = NG.biteCd
        }
        break
      }
      if (d < NG.biteR && s.biteCd <= 0) { s.biteT = NG.biteWind; s.clipT = 0; break }
      // 极慢地朝玩家挪（不追远）：外层组 yaw = 视觉朝向 + π
      s.clip = 'crawl'
      const F = s.yaw + Math.PI
      const want = Math.atan2(p.y - e.y, p.x - e.x)
      const diff = wrap(want - F)
      const step = Math.max(-NG.turnRate * 0.6 * dt, Math.min(NG.turnRate * 0.6 * dt, diff))
      s.yaw = wrap(s.yaw + step); s.turn = dt > 0 ? -step / dt : 0
      if (d > 0.9 && Math.abs(diff) < 0.7) {
        const x0 = e.x, y0 = e.y
        e.targetX = p.x; e.targetY = p.y
        const fz = e.facing
        eng.stepEntity(e, NG.groundSpeed, dt)
        e.facing = fz
        s.speed = dt > 0 ? Math.hypot(e.x - x0, e.y - y0) / dt : 0
      } else s.speed = 0
      break
    }
    case 'climb': {
      s.clipT += dt * NG.climbRate; s.speed = 0; s.turn = 0
      if (s.clipT >= 7.5) setMode(s, 'return', 'idle')
      break
    }
    case 'return': {
      s.clip = 'idle'
      if (crawlCeil(eng,e, s, n.x, n.y, dt)) {
        if (s.fed) { s.fed = false; setMode(s, 'sleep', 'sleep') } else setMode(s, 'ceiling', 'idle')
        s.weaveT = NG.weaveEvery
      }
      break
    }
    case 'sleep': {
      s.clip = 'sleep'; s.speed = 0; s.turn = 0
      if (s.t >= NG.sleepDur) setMode(s, 'ceiling', 'idle')
      break
    }
    case 'weave': {
      s.clipT += dt
      if (playerUnder(eng, s) >= 0) { setMode(s, 'ceiling', 'idle'); break } // 猎物来了：立刻恢复静伏
      if (s.t >= NG.weaveDur) {
        const c = s.sacs[s.sacIdx]
        if (c) c.state = 'intact'
        s.weaveT = NG.weaveEvery
        setMode(s, 'ceiling', 'idle')
      }
      break
    }
    case 'cower': {
      s.clipT += dt; s.speed = 0; s.turn = 0
      if (s.t >= NG.cowerDur) setMode(s, 'ceiling', 'idle')
      break
    }
    case 'spray': {
      s.clipT += dt; s.speed = 0; s.turn = 0
      const q = s.target && s.target !== 'player' ? s.target : null
      if (s.t >= NG.sprayHitT && q && !q.dead) {
        const bz = nguithrBodyZ(e, s)
        sprayParticles(eng, e.x, e.y, bz - 0.15, q.x, q.y, q.z + 0.1)
        q.dead = true; q.deathT = 1.4; q.hp = 0
        audio.splash(Math.hypot(p.x - e.x, p.y - e.y) < 8 ? 0.35 : 0.1)
        if (Math.hypot(p.x - e.x, p.y - e.y) < 10) eng.msg(`天花板上传来一声轻微的「嘶」——一股雾状液体喷在${q.def.name}身上，它抽搐了两下就不动了。`, 'system')
        s.sprayCd = NG.sprayCd
      }
      if (s.t >= NG.sprayDur) {
        if (q) { pickDropPoint(eng, e, s, q.x, q.y); setMode(s, 'position', 'idle') }
        else setMode(s, 'ceiling', 'idle')
      }
      break
    }
  }
  e.facing = nguithrOnCeiling(s) || s.mode === 'descend' && s.clipT < 3.75 ? s.yaw : wrap(s.yaw + Math.PI)
  e.state = s.mode === 'feed' || s.mode === 'ground' ? 'attack' : 'idle'
  e.animT += dt * (s.speed > 0.01 ? 1 : 0)
}
// cut 片段里网囊 pop 的时刻（与 renderer/nguithrAnim.ts 的 NG_CUT_POP_T 相同；此处不 import 渲染动画模块）
const CUT_POP_T = 2.7

// ============================================================================
// 投掷物：命中网囊提前打破（安全排雷）/ 命中本体
// ============================================================================
/** 投掷物逐段步进时调用：命中返回 true（调用方让投掷物落地） */
export function nguithrProjectileHit(eng: Engine, x: number, y: number, z: number): boolean {
  const m = eng.map
  if (!m) return false
  for (const e of m.entities) {
    if (e.dead || e.def.type !== 'nguithr' || !e.ng) continue
    const s = e.ng
    if (Math.hypot(e.x - x, e.y - y) > 3) continue
    for (let i = 0; i < s.sacs.length; i++) {
      if (s.sacs[i].state !== 'intact') continue
      const w = nguithrSacWorld(eng, s, i)
      if (Math.hypot(w.x - x, w.y - y, w.z - z) < w.r + NG.projSacPad) {
        popSac(eng, e, s, i, 'spill')
        eng.msg('投掷物砸中了天花板下的球状网囊——它「啪」地爆开，淡黄色的液体洒了一地。', 'system')
        if (nguithrOnCeiling(s) && s.mode !== 'cower' && s.mode !== 'release') { s.windowT = -1; setMode(s, 'cower', 'cower') }
        return true
      }
    }
    const bz = nguithrBodyZ(e, s)
    if (Math.hypot(e.x - x, e.y - y, bz - z) < NG.projBodyR * s.scale) {
      e.hp -= NG.projBodyDmg
      eng.bloodParticles(e.x, e.y, true)
      audio.hit()
      eng.killCheck(e)
      return true
    }
  }
  return false
}
