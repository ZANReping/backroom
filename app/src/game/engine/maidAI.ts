import { walkHotelStaff } from './hotelStaffWalk'
// [maid] 管家（Entity 111）阶段 3：L5 恐怖旅馆的清洁员工。设计见 /workspace/work/maid/plan.md（ZAN 10-30 定稿）。
//   · 孤例：每张 L5 地图最多 1 个；进层 MD.enterDelay 秒后（关注度「关照」档以上 ×0.6）在玩家视线外出现，推着清洁车巡楼。
//   · 不可击杀；攻击她 = 打扰值直接拉满。
//   · 打扰值（0–100，不显示）：响动按距离衰减累加（隔墙也听得见），安静 MD.quietDelay 秒后每秒 −MD.decay。
//     ≥ 30 警告（转头 → 「嘘」+ 字幕）；≥ 60 叹气、把车停下、缓步走向噪音源；接触时仍 ≥ 60 → 打扫。
//     途中打扰值降回 30 以下 → 她回去推车。
//   · 打扫 = 重伤（不致死）+ 背包里的东西全部进她的失物车；之后可以对平静的她按 X 一件件要回来（关注度 +3/件）。
//   · 安静的住客：视而不见；首遇欠身「您好，酒店服务！」。巡逻途中会捡走住客丢在地上的东西（进失物车）。
//   · 不做：低理智尖叫、黑猫（ZAN 定）。
import { chefStainFor, chefStartWipe } from './chefAI' // [chef]
import type { Engine } from '../engine'
import type { Entity } from '../entities'
import { makeEntity } from '../entities'
import type { MaidClip } from '../renderer/maidAnim'
import { hotelAddAttn, hotelUnseen, l5Tier, hotelStaffSkip, type HotelLostItem } from './l5Hotel'
import { isKeyItem } from '../content/items'
import type { SpecialAction } from './special'
import { audio } from '../core/audio'
import { floorHeight } from '../world/mapgen'

// ---------- 调参表 ----------
export const MD = {
  enterDelay: 90, tierDelayK: 0.6, respawnGap: 60, spawnR: [14, 24] as const,
  walk: 1.1, approach: 1.3, back: 1.1,
  warnAt: 30, actAt: 60, tierK: 0.7, // 关注度 ≥ 2 档：阈值 ×0.7
  quietDelay: 1.0, decay: 6, // 安静 1 s 后每秒 −6：60 → 30 约 6 s
  hearMax: 30, zSame: 2.5,
  // 一次响动的打扰量（按响度半径分档；再乘距离衰减 1 − 0.6·d/听距）
  amtGun: 70, amtBreak: 45, amtLoudMelee: 28, amtMelee: 18, amtSprintStep: 7,
  warnCd: 14, contact: 1.15, cartAhead: 1.02, cartReach: 0.9,
  greetR: 7, choreEvery: [18, 34] as const, pickR: 8, reclaimR: 2.4,
  grace: 30, // 打扫后这么久不再计打扰
  hurtHp: 10, hurtSanity: 18, hurtSlow: 8, // 重伤：HP 压到 10（已低于 10 则只扣到 1）、理智 −18、拖着走 8 s
  cartCap: 80, attnReclaim: 3,
  rel: { warn: -4, clean: -15, reclaim: 2, greet: 3 },
}
const LINES = {
  greet: '「您好，酒店服务！」',
  warn: '「现在您能安静一下了吗？您这样对大家都没好处。」',
  sigh: '「……唉。」',
  clean: '「好了。干净了。」',
  reclaim: '「请收好。下次可别再弄丢了。」',
}
export type MaidMode = 'patrol' | 'chore' | 'pickup' | 'greet' | 'warn' | 'sigh' | 'approach' | 'clean' | 'return' | 'serve'
export interface MaidEntState {
  mode: MaidMode; modeT: number
  clip: MaidClip; seq: number // 渲染层：clip 或 seq 变了就重播
  dist: number; quietT: number; nx: number; ny: number // 打扰值 / 安静计时 / 最近噪音位置
  warnCd: number; grace: number; choreT: number; choreDur: number
  cart: { x: number; y: number; f: number } | null // null = 推在手里；否则停在世界坐标
  pick: { x: number; y: number } | null; picked: boolean; cleaned: boolean
  look: [number, number]; speed: number; lastHp: number
}
/** 每局存档里的管家数据（放在 eng.hotel.maid） */
export interface MaidSave { cart: HotelLostItem[]; warn: number; clean: number; reclaim: number; greeted?: boolean }
export function freshMaidSave(): MaidSave { return { cart: [], warn: 0, clean: 0, reclaim: 0 } }
export function restoreMaidSave(raw: unknown): MaidSave {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<MaidSave>
  return { cart: Array.isArray(r.cart) ? r.cart.slice(-MD.cartCap) : [], warn: Number(r.warn) || 0, clean: Number(r.clean) || 0, reclaim: Number(r.reclaim) || 0, ...(r.greeted ? { greeted: true } : {}) }
}
export function maidSave(eng: Engine): MaidSave { return (eng.hotel.maid ??= freshMaidSave()) }

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
function setMode(s: MaidEntState, m: MaidMode, clip: MaidClip) { s.mode = m; s.modeT = 0; if (clip !== s.clip || !LOOP.has(clip)) s.seq++; s.clip = clip }
const LOOP = new Set<MaidClip>(['idle', 'push', 'sweep', 'wipe', 'approach'])
export const CLIP_LEN: Partial<Record<MaidClip, number>> = { greet: 2.4, shush: 2.0, sigh: 2.4, clean: 2.6, pick: 2.0, watch: 3.0, tidy: 3.2, park: 1.5 }

export function ensureMaid(e: Entity): MaidEntState {
  return (e.md ??= { mode: 'patrol', modeT: 0, clip: 'push', seq: 0, dist: 0, quietT: 99, nx: e.x, ny: e.y, warnCd: 0, grace: 0, choreT: rnd(MD.choreEvery[0], MD.choreEvery[1]), choreDur: 0, cart: null, pick: null, picked: false, cleaned: false, look: [0, 0], speed: 0, lastHp: e.def.hp })
}
const thK = (eng: Engine) => (l5Tier(eng.hotel.attn) >= 2 ? MD.tierK : 1)
export const maidWarnAt = (eng: Engine) => MD.warnAt * thK(eng)
export const maidActAt = (eng: Engine) => MD.actAt * thK(eng)

/** 一次响动的打扰量（不含距离衰减） */
export function maidNoiseAmt(radius: number, sprint: boolean): number {
  if (radius >= 18) return MD.amtGun
  if (radius >= 14) return MD.amtBreak
  if (radius >= 11) return MD.amtLoudMelee
  if (radius >= 8 && !sprint) return MD.amtMelee
  if (sprint && radius >= 8) return MD.amtSprintStep
  return 0 // 走路、蹲行：不算打扰
}
/** noiseEvent 钩子（entityAI）：听觉不看视线 */
export function maidHear(eng: Engine, e: Entity, x: number, y: number, radius: number, sprint: boolean) {
  if (e.dead || eng.over) return
  if (hotelStaffSkip(eng)) return // [l5items] 房卡：你在自己房间睡觉，她不来打扰
  const s = ensureMaid(e)
  if (s.grace > 0 || s.mode === 'clean') return
  const amt = maidNoiseAmt(radius, sprint); if (amt <= 0) return
  const d = Math.hypot(e.x - x, e.y - y), cut = Math.min(MD.hearMax, Math.max(radius * 1.6, 6))
  if (d > cut || Math.abs((e.z ?? 0) - eng.player.z) > MD.zSame) return
  addDist(eng, e, s, amt * (1 - 0.6 * d / cut), x, y)
}
function addDist(eng: Engine, e: Entity, s: MaidEntState, amt: number, x: number, y: number) {
  const before = s.dist
  s.dist = Math.min(100, s.dist + amt); s.quietT = 0; s.nx = x; s.ny = y
  void before; void eng; void e
}
/** combat.killCheck 钩子：不可击杀；挨打 = 打扰值拉满 */
export function maidKillGuard(eng: Engine, e: Entity): boolean {
  if (e.def.type !== 'maid') return false
  const s = ensureMaid(e)
  e.hp = e.def.hp; e.dead = false
  if (s.mode !== 'clean') { s.grace = 0; addDist(eng, e, s, 100, eng.player.x, eng.player.y); if (s.mode !== 'approach' && s.mode !== 'sigh') { parkCart(e, s); setMode(s, 'approach', 'approach') } }
  return true
}
function parkCart(e: Entity, s: MaidEntState) { if (!s.cart) s.cart = { x: e.x + Math.cos(e.facing) * MD.cartAhead, y: e.y + Math.sin(e.facing) * MD.cartAhead, f: e.facing } }
function face(e: Entity, tx: number, ty: number, dt: number, rate: number) {
  const want = Math.atan2(ty - e.y, tx - e.x); let d = want - e.facing; d = Math.atan2(Math.sin(d), Math.cos(d))
  e.facing += Math.sign(d) * Math.min(Math.abs(d), rate * dt)
}
function lookAt(e: Entity, s: MaidEntState, x: number, y: number) {
  let d = Math.atan2(y - e.y, x - e.x) - e.facing; d = Math.atan2(Math.sin(d), Math.cos(d))
  // 渲染层约定：look 偏航正 = 向她的左边（模型 +X 朝前、左手 +Z → 世界里逆时针 = 负 facing 方向）
  s.look = [Math.max(-1.3, Math.min(1.3, -d)), 0]
}
function move(eng: Engine, e: Entity, s: MaidEntState, speed: number, dt: number) {
  s.speed = walkHotelStaff(eng, e, { x: e.targetX, y: e.targetY }, speed, dt)
}

// ---------- 主更新（entityAI 分派） ----------
export function updateMaid(eng: Engine, e: Entity, dt: number) {
  const s = ensureMaid(e), p = eng.player, ms = maidSave(eng)
  s.modeT += dt; s.warnCd -= dt; s.grace -= dt; s.quietT += dt; s.speed = 0
  if (s.quietT > MD.quietDelay) s.dist = Math.max(0, s.dist - MD.decay * dt)
  if (e.hp < e.def.hp) maidKillGuard(eng, e)
  const d = Math.hypot(p.x - e.x, p.y - e.y), sameZ = Math.abs((e.z ?? 0) - p.z) < MD.zSame
  const sees = sameZ && d < 14 && eng.los(e.x, e.y, p.x, p.y)
  const W = maidWarnAt(eng), A = maidActAt(eng)
  const calm = s.mode === 'patrol' || s.mode === 'chore' || s.mode === 'pickup'
  // —— 升级判定（从任意平静状态打断）——
  if (calm || s.mode === 'greet' || s.mode === 'serve') {
    if (s.dist >= A && !eng.over) { parkCart(e, s); setMode(s, 'sigh', 'sigh'); lookAt(e, s, s.nx, s.ny); eng.msg(`管家：${LINES.sigh}`, 'lore'); audio.hotelCreak?.(0.2) }
    else if (s.dist >= W && s.warnCd <= 0) { s.warnCd = MD.warnCd; setMode(s, 'warn', 'watch'); lookAt(e, s, s.nx, s.ny); ms.warn++; rel(eng, MD.rel.warn) }
  }
  switch (s.mode) {
    case 'patrol': {
      e.state = 'wander'
      if (!ms.greeted && sees && d < MD.greetR && s.dist < W) { ms.greeted = true; meet(eng); setMode(s, 'greet', 'greet'); rel(eng, MD.rel.greet); eng.msg(`管家：${LINES.greet}`, 'lore'); break }
      // 地上的失物：住客丢下的东西
      if (!s.pick) for (const it of eng.map!.items) if (it.dropped !== undefined && Math.hypot(it.x - e.x, it.y - e.y) < MD.pickR && Math.abs(floorHeight(eng.map!, it.x, it.y) - (e.z ?? 0)) < 1 && eng.los(e.x, e.y, it.x, it.y)) { s.pick = { x: it.x, y: it.y }; s.picked = false; setMode(s, 'pickup', 'push'); break }
      if (s.mode !== 'patrol') break
      // [chef] 餐厅地毯上的血迹：走过去跪下擦（CK.wipeT 秒后消失）
      { const st = chefStainFor(eng, e); if (st) { e.targetX = st.x; e.targetY = st.y; if (Math.hypot(st.x - e.x, st.y - e.y) > 0.8) { move(eng, e, s, MD.walk, dt); break } chefStartWipe(eng, e, st.x, st.y); s.choreDur = 4.2; setMode(s, 'chore', 'wipe'); break } }
      s.choreT -= dt
      if (s.choreT <= 0) { s.choreT = rnd(MD.choreEvery[0], MD.choreEvery[1]); const c = (['sweep', 'wipe', 'tidy', 'idle'] as MaidClip[])[(Math.random() * 4) | 0]; s.choreDur = c === 'tidy' ? 3.2 : rnd(4, 7); setMode(s, 'chore', c); break }
      if (e.stateT <= 0 || Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.4) eng.wanderTarget(e)
      move(eng, e, s, MD.walk, dt)
      break
    }
    case 'chore':
      e.state = 'idle'
      if (s.modeT >= s.choreDur) setMode(s, 'patrol', 'push')
      break
    case 'pickup': {
      e.state = 'wander'
      const pk = s.pick!
      const reach = Math.hypot(pk.x - e.x, pk.y - e.y)
      if (s.clip === 'push') {
        e.targetX = pk.x; e.targetY = pk.y
        if (reach > 0.75 && s.modeT < 15) move(eng, e, s, MD.walk, dt)
        else { setMode(s, 'pickup', 'pick'); face(e, pk.x, pk.y, 1, 9) }
      } else {
        if (!s.picked && s.modeT >= 0.8) { s.picked = true; takeGround(eng, pk.x, pk.y) }
        if (s.modeT >= CLIP_LEN.pick!) { s.pick = null; setMode(s, 'patrol', 'push') }
      }
      break
    }
    case 'greet':
      e.state = 'idle'; face(e, p.x, p.y, dt, 3); lookAt(e, s, p.x, p.y)
      if (s.modeT >= CLIP_LEN.greet!) setMode(s, 'patrol', 'push')
      break
    case 'serve':
      e.state = 'idle'; face(e, p.x, p.y, dt, 3)
      if (s.modeT >= 2.0) setMode(s, 'patrol', 'push')
      break
    case 'warn':
      e.state = 'idle'
      if (s.clip === 'watch' && s.modeT >= 0.9) { setMode(s, 'warn', 'shush'); eng.msg(`管家：${LINES.warn}`, 'lore'); meet(eng) }
      else if (s.clip === 'shush') { face(e, s.nx, s.ny, dt, 2.5); if (s.modeT >= CLIP_LEN.shush!) setMode(s, 'patrol', 'push') }
      break
    case 'sigh':
      e.state = 'idle'; face(e, s.nx, s.ny, dt, 2)
      if (s.modeT >= CLIP_LEN.sigh!) setMode(s, 'approach', 'approach')
      break
    case 'approach': {
      e.state = 'chase'
      if (s.dist < W) { setMode(s, 'return', 'approach'); break }
      const tx = sees || d < 4 ? p.x : s.nx, ty = sees || d < 4 ? p.y : s.ny
      e.targetX = tx; e.targetY = ty; lookAt(e, s, p.x, p.y)
      if (d < MD.contact && sameZ && s.dist >= A) { setMode(s, 'clean', 'clean'); s.cleaned = false; face(e, p.x, p.y, 1, 99); break }
      if (Math.hypot(tx - e.x, ty - e.y) > 0.6) move(eng, e, s, MD.approach, dt)
      else face(e, p.x, p.y, dt, 3)
      break
    }
    case 'clean':
      e.state = 'attack'; face(e, p.x, p.y, dt, 4)
      if (!s.cleaned && s.modeT >= 0.7) { s.cleaned = true; maidCleanPlayer(eng, e) }
      if (s.modeT >= CLIP_LEN.clean!) { s.dist = 0; s.grace = MD.grace; setMode(s, 'return', 'approach') }
      break
    case 'return': {
      e.state = 'wander'
      if (s.dist >= A && s.grace <= 0) { setMode(s, 'approach', 'approach'); break }
      const c = s.cart
      if (!c) { setMode(s, 'patrol', 'push'); break }
      const bx = c.x - Math.cos(c.f) * MD.cartAhead, by = c.y - Math.sin(c.f) * MD.cartAhead
      e.targetX = bx; e.targetY = by; s.look = [0, 0]
      if (Math.hypot(bx - e.x, by - e.y) > MD.cartReach && s.modeT < 25) move(eng, e, s, MD.back, dt)
      else { if (s.modeT >= 25) { e.x = bx; e.y = by } e.facing = c.f; s.cart = null; setMode(s, 'patrol', 'push') }
      break
    }
  }
  s.lastHp = e.hp
}

function rel(eng: Engine, v: number) { const h = eng.hotel; h.staff.maid = Math.max(-100, Math.min(100, (h.staff.maid ?? 0) + v)) }
function meet(eng: Engine) { const b = eng.hotelBook; if (!b.met.includes('maid')) b.met.push('maid') }

/** 捡起 (x, y) 附近住客丢下的一件东西 → 失物车 */
function takeGround(eng: Engine, x: number, y: number) {
  const m = eng.map!
  let bi = -1, bd = 0.9
  for (let i = 0; i < m.items.length; i++) { const it = m.items[i]; if (it.dropped === undefined) continue; const dd = Math.hypot(it.x - x, it.y - y); if (dd < bd) { bd = dd; bi = i } }
  if (bi < 0) return
  const it = m.items.splice(bi, 1)[0]
  pushCart(eng, it as never)
}
function pushCart(eng: Engine, it: { type: string; count?: number; dur?: number; blood?: number; mag?: string[]; ammoSel?: string; stage?: number; cyl?: number }) {
  const c = maidSave(eng).cart
  c.push({ type: it.type, count: it.count ?? 1, t: Date.now(), ...(it.dur !== undefined ? { dur: it.dur } : {}), ...(it.blood ? { blood: it.blood } : {}), ...(it.mag ? { mag: [...it.mag] } : {}), ...(it.ammoSel ? { ammoSel: it.ammoSel } : {}), ...(it.stage ? { stage: it.stage } : {}), ...(it.cyl ? { cyl: it.cyl } : {}) })
  while (c.length > MD.cartCap) c.shift()
}

/** 打扫：重伤（不致死）+ 背包全部进失物车（关键物品除外） */
export function maidCleanPlayer(eng: Engine, _e: Entity) {
  const p = eng.player, ms = maidSave(eng)
  let n = 0
  for (let i = 0; i < p.backpack.length; i++) {
    const sl = p.backpack[i]; if (!sl || isKeyItem(sl.type)) continue
    pushCart(eng, sl); n += sl.count ?? 1; p.backpack[i] = null
  }
  eng.syncPassives?.()
  if (!eng.dev.god) {
    p.hp = p.hp > MD.hurtHp ? MD.hurtHp : Math.max(1, p.hp - 1)
    p.sanity = Math.max(0, p.sanity - MD.hurtSanity)
    p.stamina = 0
    p.slowT = Math.max(p.slowT, MD.hurtSlow)
  }
  eng.camShake = 1
  audio.hurt()
  eng.emit({ kind: 'damage' })
  ms.clean++; rel(eng, MD.rel.clean); meet(eng)
  eng.msg('她把你按在地毯上，用力地擦、擦、擦……等你回过神来，浑身火辣辣地疼，背包轻得可怕。', 'damage')
  if (n > 0) eng.msg(`背包里的 ${n} 件东西不见了——大概都在她的清洁车上。`, 'system')
  eng.msg(`管家：${LINES.clean}`, 'lore')
}

// ---------- 世界：生成（l5Hotel.updateHotel 末尾调用）----------
interface MaidWorld { map: unknown; floorT: number; gap: number }
const WORLD = new WeakMap<Engine, MaidWorld>()
export function stepMaidWorld(eng: Engine, dt: number) {
  const m = eng.map
  if (!m || eng.levelDef.id !== 5) return
  let w = WORLD.get(eng); if (!w) { w = { map: m, floorT: 0, gap: 0 }; WORLD.set(eng, w) }
  if (w.map !== m) { w.map = m; w.floorT = 0; w.gap = 0 }
  w.floorT += dt; w.gap -= dt
  if (m.entities.some((e) => e.def.type === 'maid' && !e.dead)) return
  const need = MD.enterDelay * (l5Tier(eng.hotel.attn) >= 2 ? MD.tierDelayK : 1)
  if (w.floorT < need || w.gap > 0) return
  w.gap = MD.respawnGap
  spawnMaid(eng)
}
export function spawnMaid(eng: Engine, force?: { x: number; y: number }): Entity | null {
  const m = eng.map!, p = eng.player
  let at = force ?? null
  for (let t = 0; !at && t < 60; t++) {
    const a = Math.random() * Math.PI * 2, r = rnd(MD.spawnR[0], MD.spawnR[1])
    const tx = Math.floor(p.x + Math.cos(a) * r), ty = Math.floor(p.y + Math.sin(a) * r)
    if (eng.entityWalkH(m, tx, ty, 0) === null) continue
    if (!hotelUnseen(eng, tx + 0.5, ty + 0.5)) continue
    at = { x: tx + 0.5, y: ty + 0.5 }
  }
  if (!at) return null
  const e = makeEntity('maid', at.x, at.y, floorHeight(m, at.x, at.y))
  ensureMaid(e)
  m.entities.push(e)
  return e
}
export function findMaid(eng: Engine): Entity | null { return eng.map?.entities.find((e) => e.def.type === 'maid' && !e.dead) ?? null }

// ---------- X：向平静的她要回失物 ----------
function reclaimable(eng: Engine): Entity | null {
  if (eng.levelDef.id !== 5) return null
  const e = findMaid(eng); if (!e?.md) return null
  const s = e.md, p = eng.player
  if (!(s.mode === 'patrol' || s.mode === 'chore' || s.mode === 'serve' || s.mode === 'greet')) return null
  if (Math.hypot(p.x - e.x, p.y - e.y) > MD.reclaimR || !maidSave(eng).cart.length) return null
  return e
}
export function maidSpecial(eng: Engine): SpecialAction | null {
  if (!reclaimable(eng)) return null
  return { id: 'maid-reclaim', label: `向管家要回失物（${maidSave(eng).cart.length}）`, hint: '她会从清洁车里取出一件还给你（酒店关注度 +3）', hold: false }
}
/** 按下 X（engine.step 里由 updateHotel 之后调用；消费 specialPressed） */
export function maidPress(eng: Engine): boolean {
  if (!eng.specialPressed) return false
  const e = reclaimable(eng); if (!e) return false
  eng.specialPressed = false
  const ms = maidSave(eng), it = ms.cart[0]
  const extra = { ...(it.dur !== undefined ? { dur: it.dur } : {}), ...(it.blood ? { blood: it.blood } : {}), ...(it.mag ? { mag: [...it.mag] } : {}), ...(it.ammoSel ? { ammoSel: it.ammoSel } : {}), ...(it.stage ? { stage: it.stage } : {}), ...(it.cyl ? { cyl: it.cyl } : {}) } as never
  let got = 0
  while (got < it.count && eng.addItem(it.type, extra)) got++
  if (!got) { eng.msg('背包满了。管家把东西放回了车上。', 'system'); return true }
  if (got < it.count) it.count -= got; else ms.cart.shift()
  ms.reclaim++; rel(eng, MD.rel.reclaim); hotelAddAttn(eng, MD.attnReclaim)
  const s = e.md!; setMode(s, 'serve', 'pick'); s.picked = true
  eng.msg(`管家：${LINES.reclaim}`, 'lore'); audio.uiTick()
  return true
}
