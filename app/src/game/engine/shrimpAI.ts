// v81：旱虾（Entity 20）专属 AI——依据中文维基 Entity 20：
//  · 对流浪者与其他实体完全无害；漫无目的地游荡，不需要食物、水或任何能量。
//  · 两栖：陆地上靠两侧鳍叶「划地」缓慢爬行；进入湿地/积水后离地游动，速度 ×1.6，并偏爱往湿地游荡。
//  · 有丝分裂：每只约 10–15 分钟可能分裂一次，产生一只完全相同的个体；
//    半径 20m 内已有 ≥4 只、或本层旱虾总数达到上限时不分裂（封顶，防止刷满地图）。
//  · 捕食关系：死亡飞蛾与钝人会主动捕食旱虾；猎犬、无面灵、窃皮者、悲尸、肢团对其无敌意（它们本就不把旱虾列为猎物）。
//  · 受惊：被打、或捕食者扑来时短促弹窜一段（仍不反击）。
//  · 活抓（E）：直接把活旱虾装进背包（物品「活旱虾」）；打死仍掉落「旱虾」。
//  · 诱饵：把活旱虾丢在地上它会重新爬走，并在 40 秒内作为「诱饵」——附近的钝人/死亡飞蛾会优先去吃它，哪怕正盯着你。
// 运行时状态保存在 e.sh（不入存档）。
import type { Entity } from '../entities'
import { makeEntity } from '../entities'
import type { Engine } from '../engine'

export type ShrimpPhase = 'crawl' | 'rest' | 'startle' | 'split' | 'held'
export interface ShrimpState {
  phase: ShrimpPhase
  t: number
  /** 距离下一次分裂尝试的秒数 */
  splitIn: number
  /** 分裂动画进度 0..1（仅 split 阶段） */
  split: number
  /** 刚分裂出来/刚分裂完的个体从 0.78 长回 1 */
  grow: number
  /** 平滑后的「在水里」程度 0..1（渲染：上浮、鳍叶大幅波动） */
  swim: number
  wet: boolean
  lastHp: number
  /** 受惊弹窜方向 */
  fx: number; fy: number
  /** >0：作为诱饵的剩余秒数（玩家放生的活旱虾） */
  bait: number
  /** 被捕食：吃掉它的实体（渲染层据此把它缩进捕食者嘴里） */
  eater?: Entity
  /** 被玩家活抓（直接移除，无死亡动画） */
  caught?: boolean
  /** 个体体型（0.88~1.12，由 id 决定，分裂出的个体继承母体） */
  size: number
  /** 平滑速度（渲染：爬行节奏） */
  speed: number
  /** 被捕食者惊走的冷却（秒）：迟钝的旱虾逃开一次后就不再反应 */
  scare: number
}

export const SHRIMP_SPLIT_MIN = 600
export const SHRIMP_SPLIT_MAX = 900
export const SHRIMP_SPLIT_CHANCE = 0.65 // 计时到点后真正分裂的概率（否则重新计时）
export const SHRIMP_SPLIT_TIME = 4 // 分裂动画秒数
export const SHRIMP_LOCAL_CAP = 4 // 半径 20m 内已有 ≥4 只则不分裂
export const SHRIMP_LOCAL_R = 20
export const SHRIMP_LEVEL_CAP = 24 // 本层（活动窗口内）旱虾总数上限
export const SHRIMP_BAIT_TIME = 40
export const SHRIMP_PREDATORS = ['deathmoth', 'duller'] as const

const hash = (n: number) => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296 }
export const shrimpSize = (id: number) => 0.88 + hash(id * 7 + 3) * 0.24

export function initShrimp(e: Entity, inherit?: ShrimpState): ShrimpState {
  const s: ShrimpState = {
    phase: 'crawl', t: 0,
    // 初始分裂计时打散到整个区间，避免同时生成的一批同时分裂
    splitIn: SHRIMP_SPLIT_MIN * 0.25 + hash(e.id * 13 + 1) * SHRIMP_SPLIT_MAX,
    split: 0, grow: 1, swim: 0, wet: false, lastHp: e.hp, fx: 0, fy: 0, bait: 0, scare: 0,
    size: inherit?.size ?? shrimpSize(e.id), speed: 0,
  }
  e.sh = s
  return s
}

/** 地块是否湿（湿地减速区或液体）——旱虾在这里游泳 */
export function shrimpWetAt(eng: Engine, x: number, y: number): boolean {
  const m = eng.map
  if (!m || !m.wet || !m.w) return false
  const tx = Math.floor(x), ty = Math.floor(y)
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return false
  const i = ty * m.w + tx
  return m.wet[i] === 1 || (m.liquid?.[i] ?? 0) === 1
}

/** 游荡选点：60% 概率在 6m 内找一块湿地作为目标（偏爱水边），否则交给引擎的随机游荡 */
function pickWander(eng: Engine, e: Entity) {
  eng.wanderTarget(e)
  const m = eng.map
  if (Math.random() < 0.65 && m?.wet && m.w) {
    // 扫描 6m 内的湿地格（最多 13×13 格），随机挑一块看得见的
    const cx = Math.floor(e.x), cy = Math.floor(e.y), cand: number[] = []
    for (let y = Math.max(0, cy - 6); y <= Math.min(m.h - 1, cy + 6); y++)
      for (let x = Math.max(0, cx - 6); x <= Math.min(m.w - 1, cx + 6); x++) {
        const i = y * m.w + x
        if ((m.wet[i] === 1 || (m.liquid?.[i] ?? 0) === 1) && (x - cx) ** 2 + (y - cy) ** 2 <= 36 && (x !== cx || y !== cy)) cand.push(i)
      }
    for (let k = 0; k < 4 && cand.length; k++) {
      const i = cand[Math.floor(Math.random() * cand.length)]
      const x = (i % m.w) + 0.2 + Math.random() * 0.6, y = Math.floor(i / m.w) + 0.2 + Math.random() * 0.6
      if (eng.los(e.x, e.y, x, y)) { e.targetX = x; e.targetY = y; e.stateT = 6; return }
    }
  }
}

const setPhase = (s: ShrimpState, ph: ShrimpPhase) => { if (s.phase !== ph) { s.phase = ph; s.t = 0 } }

/** 附近有没有正在扑向它的捕食者（返回威胁源坐标） */
function threat(eng: Engine, e: Entity): Entity | null {
  for (const q of eng.map!.entities) {
    if (q.dead || q === e || !(SHRIMP_PREDATORS as readonly string[]).includes(q.def.type)) continue
    const d = Math.hypot(q.x - e.x, q.y - e.y)
    if (d < 1.0 || (d < 1.6 && (q.targetEnt === e || q.dl?.prey === e))) return q
  }
  return null
}

function countNear(eng: Engine, x: number, y: number, r: number) {
  let n = 0, all = 0
  for (const q of eng.map!.entities) {
    if (q.dead || q.def.type !== 'dryshrimp') continue
    all++
    if (Math.hypot(q.x - x, q.y - y) < r) n++
  }
  return { n, all }
}

/** 分裂条件：未受惊/未被捕食者盯上，局部与全层均未达上限 */
export function canSplit(eng: Engine, e: Entity): boolean {
  const { n, all } = countNear(eng, e.x, e.y, SHRIMP_LOCAL_R)
  if (n >= SHRIMP_LOCAL_CAP || all >= SHRIMP_LEVEL_CAP) return false
  for (const q of eng.map!.entities) if (!q.dead && (SHRIMP_PREDATORS as readonly string[]).includes(q.def.type) && Math.hypot(q.x - e.x, q.y - e.y) < 6) return false
  return true
}

/** 分裂完成：母体留在前半，子体出现在身后半个身长处，两者都从 0.78 体型长回 1 */
function finishSplit(eng: Engine, e: Entity, s: ShrimpState) {
  // Several parents can start together; recheck before adding each child.
  if (!canSplit(eng, e)) {
    s.splitIn = 60 + Math.random() * 120
    setPhase(s, 'rest')
    return
  }
  const len = 0.52 * s.size
  const bx = -Math.cos(e.facing), by = -Math.sin(e.facing)
  let cx = e.x + bx * len * 0.55, cy = e.y + by * len * 0.55
  if (!eng.los(e.x, e.y, cx, cy)) { cx = e.x; cy = e.y } // 身后是墙：原地分出
  e.x -= bx * len * 0.25; e.y -= by * len * 0.25
  const c = makeEntity('dryshrimp', cx, cy, e.z)
  c.facing = e.facing + (Math.random() - 0.5) * 0.9
  const cs = initShrimp(c, s)
  cs.grow = 0.78; cs.splitIn = SHRIMP_SPLIT_MIN + Math.random() * (SHRIMP_SPLIT_MAX - SHRIMP_SPLIT_MIN)
  c.state = 'idle'; c.stateT = 1.5
  eng.map!.entities.push(c)
  s.grow = 0.78
  s.splitIn = SHRIMP_SPLIT_MIN + Math.random() * (SHRIMP_SPLIT_MAX - SHRIMP_SPLIT_MIN)
  setPhase(s, 'rest')
  if (Math.hypot(e.x - eng.player.x, e.y - eng.player.y) < 8)
    eng.msg('旱虾的身体从中间慢慢缢缩、拉长，最后一分为二——地上多了一只一模一样的旱虾。', 'lore')
}

export function updateShrimp(eng: Engine, e: Entity, dt: number, d: number) {
  const s = e.sh ?? initShrimp(e)
  const def = e.def
  s.t += dt
  s.bait = Math.max(0, s.bait - dt)
  s.scare = Math.max(0, s.scare - dt)
  if (s.grow < 1) s.grow = Math.min(1, s.grow + dt / 3)
  s.wet = shrimpWetAt(eng, e.x, e.y)
  s.swim += ((s.wet ? 1 : 0) - s.swim) * Math.min(1, dt * 3)
  const hurt = e.hp < s.lastHp
  s.lastHp = e.hp
  let speed = 0

  if (s.phase === 'held') { // 被钝人按住：只剩挣扎（渲染）；按住它的钝人死了/走了就挣脱
    e.state = 'idle'; s.speed = 0
    if (s.t < 3 && eng.map!.entities.some((q) => !q.dead && q.dl?.prey === e)) return
    s.fx = Math.cos(e.facing); s.fy = Math.sin(e.facing); setPhase(s, 'startle')
  }

  // 受惊：被打 / 捕食者扑来 → 短促弹窜（分裂中被打会中断分裂）
  const q = s.phase === 'startle' || s.scare > 0 ? null : threat(eng, e)
  if (q) s.scare = 8
  if (hurt || q) {
    const sx = q ? q.x : eng.player.x, sy = q ? q.y : eng.player.y
    const a = Math.atan2(e.y - sy, e.x - sx) + (Math.random() - 0.5) * 0.8
    s.fx = Math.cos(a); s.fy = Math.sin(a)
    s.split = 0
    setPhase(s, 'startle')
  }

  switch (s.phase) {
    case 'crawl': {
      e.state = 'wander'
      if (e.stateT <= 0 || Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.3) {
        // 偶尔停下来「发呆」——鳍叶慢慢张合
        if (Math.random() < 0.35) { setPhase(s, 'rest'); e.stateT = 2 + Math.random() * 4; break }
        pickWander(eng, e)
      }
      speed = def.speed * 0.45 * (s.wet ? 1.6 : 1)
      break
    }
    case 'rest': {
      e.state = 'idle'
      if (s.t > 1.2 && e.stateT <= 0) { setPhase(s, 'crawl'); pickWander(eng, e) }
      break
    }
    case 'startle': {
      e.state = 'wander'
      e.targetX = e.x + s.fx * 2; e.targetY = e.y + s.fy * 2
      speed = def.speed * 2.6 * (s.wet ? 1.3 : 1)
      if (s.t > 1.3) { setPhase(s, 'crawl'); pickWander(eng, e) }
      break
    }
    case 'split': {
      e.state = 'idle'
      s.split = Math.min(1, s.t / SHRIMP_SPLIT_TIME)
      if (s.split >= 1) { s.split = 0; finishSplit(eng, e, s) }
      break
    }
  }

  // 有丝分裂计时
  if (s.phase === 'crawl' || s.phase === 'rest') {
    s.splitIn -= dt
    if (s.splitIn <= 0) {
      if (Math.random() < SHRIMP_SPLIT_CHANCE && canSplit(eng, e)) { setPhase(s, 'split'); s.split = 0 }
      else s.splitIn = 60 + Math.random() * 120 // 条件不满足：1–3 分钟后再试
    }
  }

  if (speed > 0) {
    const stuck = eng.stepEntity(e, speed, dt)
    if (stuck && s.phase === 'crawl') {
      if (Math.hypot(e.targetX - e.x, e.targetY - e.y) > 0.3 && eng.wanderDeflect) eng.wanderDeflect(e)
      else pickWander(eng, e)
    }
    eng.faceToward(e, e.targetX, e.targetY, dt, s.phase === 'startle' ? 9 : 3)
    e.animT += dt * speed
  }
  s.speed += (speed - s.speed) * Math.min(1, dt * 5)
  void d
}

// ================= 捕食 =================

/** 找一只可吃的旱虾：诱饵在 baitR 内优先（不看是否正在追玩家），其余普通旱虾在 r 内 */
export function findShrimpPrey(eng: Engine, pred: Entity, r: number, baitR: number, baitOnly = false): Entity | null {
  let best: Entity | null = null, bd = 1e9
  for (const q of eng.map!.entities) {
    if (q.dead || q.def.type !== 'dryshrimp' || q.sh?.eater || q.sh?.phase === 'held') continue
    const isBait = (q.sh?.bait ?? 0) > 0
    if (baitOnly && !isBait) continue
    const dd = Math.hypot(q.x - pred.x, q.y - pred.y)
    const lim = isBait ? baitR : r
    if (dd > lim || Math.abs(q.z - pred.z) > 1.8) continue
    const score = dd - (isBait ? 6 : 0) // 诱饵优先
    if (score < bd && eng.los(pred.x, pred.y, q.x, q.y)) { best = q; bd = score }
  }
  return best
}

/** 吃掉一只旱虾：不掉落物品，渲染层把它缩进捕食者嘴里 */
export function devourShrimp(eng: Engine, pred: Entity, prey: Entity) {
  const s = prey.sh ?? initShrimp(prey)
  const bait = s.bait > 0
  s.eater = pred
  prey.dead = true; prey.deathT = 1.4; prey.hp = 0
  const d = Math.hypot(prey.x - eng.player.x, prey.y - eng.player.y)
  if (d < 10) {
    if (pred.def.type === 'duller') eng.msg(bait
      ? '钝人被那只旱虾吸引了过去——它用长手把旱虾捞起来按进灰色的身体里，暂时把你忘了。'
      : '钝人用修长的手捞起一只旱虾，旱虾的鳍叶在它指缝间扑腾了两下就不动了。', 'system')
    else eng.msg(bait
      ? '死亡飞蛾调头扑向了地上的旱虾——诱饵起作用了。'
      : '一只死亡飞蛾扑到旱虾身上，几口就把它啃得只剩一截尾扇。', 'system')
  }
}

/** 玩家活抓：直接移除（无死亡动画），成功返回 true */
export function catchShrimp(eng: Engine, e: Entity): boolean {
  if (e.dead || e.def.type !== 'dryshrimp') return false
  if (!eng.addItem('liveshrimp')) { eng.msg('背包已满，装不下这只旱虾。', 'system'); return false }
  const s = e.sh ?? initShrimp(e)
  s.caught = true
  e.dead = true; e.deathT = 0
  eng.msg('你一把捞起了旱虾。它在手里慢吞吞地划着两排鳍叶，一点也不挣扎。（获得 活旱虾 ×1）', 'loot')
  return true
}

/** 放生/诱饵：把活旱虾丢在地上，它变回实体并作为诱饵 40 秒 */
export function releaseShrimp(eng: Engine, x: number, y: number, z: number, facing = Math.random() * Math.PI * 2): Entity {
  const e = makeEntity('dryshrimp', x, y, z)
  e.facing = facing
  const s = initShrimp(e)
  s.bait = SHRIMP_BAIT_TIME
  s.splitIn = SHRIMP_SPLIT_MIN + Math.random() * (SHRIMP_SPLIT_MAX - SHRIMP_SPLIT_MIN)
  e.state = 'idle'; e.stateT = 0.8
  setPhase(s, 'rest')
  eng.map!.entities.push(e)
  return e
}
