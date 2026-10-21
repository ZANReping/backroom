// 牧蛇（Entity 75「Wrangler」）专属 AI——依据中文维基 entity-75 与 ZAN 2026-10-21 确认的设计：
//  · 成体不可被杀死；幼体只能被火油（火油桶爆炸）烧死，但幼体一死，母亲就会循着气味钻来。
//  · 它在岩层里游动，不需要通道：潜行时只有脚下越来越近的隆隆声与震动（预警），
//    破壁前岩面先鼓起 0.9 秒（第二次预警），随后头部切出岩壁，身体始终有一截埋在洞里（可见长度约 30m）。
//  · 催眠：持续盯着它发白的眼睛约 1.5 秒，就会被「拽」过去（失去移动控制、视线被往它那边拖）。
//    移开视线（顶住拖拽把准星甩开）或用手电晃它的眼睛（开关一次手电）可以打断。
//  · 吞咽：头离你 ≤ 4.5m 时后缩蓄力 0.8 秒、张嘴前扑。蓄力期间横向闪开就能躲过。
//    被吞不会立刻死：一阵黑暗之后，你在一处【没去过、附近没有敌对实体】的安全地点以 1 HP 醒来。
//  · 雄性：主动猎食。雌性：大多数时候在岩壁边啃岩，只有你靠太近、或伤到她的卵枝/幼体时才会发难。
//    雌性 30% 受孕：腹部鼓胀，附近岩壁预先长着 1～2 根卵枝，2 只幼体在旁边蹦跳（不做实时孵化）。
//  · L8 为主要栖息地（随层级实体池生成）；L2 偶发一次雄性穿墙事件（短暂现身后缩回、不留下）。L9 不加入。
// 运行时状态挂在 e.wg（不入存档/联机）；每张地图的洞口、卵枝、黑屏等放在 WeakMap。
// 轨迹统一存世界坐标（窗口坐标 + 原点），无限层窗口平移后也不会错位。
import { audio } from '../core/audio'
import { look } from '../core/renderer3d'
import { canOccupy, PLAYER_RADIUS } from '../core/player'
import { floorHeight, groundHeightAt, bandOfPlayerZ, JUMP_REACH } from '../world/mapgen'
import { makeEntity, type Entity } from '../entities'
import type { Engine } from '../engine'

/** 全部规则数值（验收脚本 check:wrangler 直接读取；文档 app/WRANGLER-REMAKE.md 同步） */
export const WR = {
  // 体型（米）
  MALE_R: 0.8, FEMALE_R: 1.0, JUV_R: 0.17, // 半径（粗 1.6 / 2.0 / 0.34）
  VISIBLE_LEN: 30, // 一次最多露出的身长：头沿轨迹最多走这么远，超过就缩回去重新钻
  // 潜行
  UNDER_SPEED: 3.2, // 岩层中逼近速度
  SENSE_R: 34, // 震动感知半径（跑步/巨响能把它从更远处引来）
  RUMBLE_R: 26, // 进入此距离开始隆隆声预警
  RUMBLE_CD: [3.5, 6] as const,
  EMERGE_MIN: 5, EMERGE_MAX: 12, // 切出点离玩家的距离
  EMERGE_T: 2.6, BULGE_T: 0.9, // 切出总时长；其中岩面鼓包（预警）时长
  // 现身追猎
  MALE_SPEED: 2.6, FEMALE_SPEED: 2.0, RAGE_SPEED: 3.2, ROCK_SPEED_K: 0.5, // 头在岩石里穿行时减速
  HEAD_H: 2.4, // 头离地高度（以半径计）
  HUNT_MAX_T: 55, LEASH: 40, // 现身最长时长；玩家离洞口超过此距离就放弃
  // 催眠
  GAZE_FOV: 0.16, // 准星与眼睛夹角（弧度，另加头部视角半径）
  GAZE_R: 18, GAZE_T: 1.5, GAZE_DECAY: 2, // 距离、持续时长、移开后的衰减倍率
  PULL_SPEED: 1.5, // 被拽向它的速度
  DRAG_RATE: 1.6, // 视线被往它那边拖的角速度（rad/s）
  BREAK_ANGLE: 0.5, // 视线甩开超过此角度即挣脱
  GLARE_STUN: 1.4, // 手电晃眼后它缩头的时长
  HYPNO_CD: 6,
  // 吞咽
  STRIKE_R: 4.5, WINDUP: 0.8, LUNGE: 0.28, RECOVER: 1.3, STRIKE_CD: 3.2,
  SWALLOW_R: 1.9, // 前扑结束时头离玩家 ≤ 此距离即被吞
  GULP_T: 2.6, WAKE_FADE: 3.2, // 黑暗时长、醒来后淡入
  WAKE_MIN_D: 30, WAKE_SAFE_R: 20, // 醒来点：离吞咽点至少 30m，20m 内无敌对实体
  WAKE_HP: 1,
  AFTER_SWALLOW_CD: 150, // 吞了人之后很久不再出现
  // 后撤
  RETREAT_SPEED: 4.5,
  UNDER_CD: [22, 40] as const, // 缩回后再次切出的冷却
  HOLE_LIFE: 90, // 洞口存在时长
  // 雌性
  PREGNANT_P: 0.3, EGG_BRANCHES: [1, 2] as const, JUVENILES: 2,
  FEMALE_PROVOKE_R: 6, FEMALE_PROVOKE_T: 2.2, // 贴近她这么久才会被盯上
  GRAZE_T: [25, 50] as const,
  // 幼体
  JUV_HP: 30, JUV_SPEED: 1.6, JUV_LEASH: 7, JUV_FLEE_R: 2.2,
  RAGE_ARRIVE: [4, 7] as const, // 幼体被烧死后母亲赶到的时间
  FIRE_R: 3.2, // 火油爆炸半径（与 combat.ts 一致）
  // L2 事件
  L2_CHECK: [240, 480] as const, L2_P: 0.3, L2_STAY: 35,
  // 身体碰撞
  BODY_LIFT: 3.5, // 颈部这段从头的高度过渡到贴地（与渲染层一致）
  CRUSH_V: 1.2, CRUSH_DMG: 12, CRUSH_CD: 1.4, // 身体以 ≥1.2m/s 扫过你时的撞击伤害
  // 物种比例
  FEMALE_P: 0.45,
} as const

export type WgKind = 'male' | 'female' | 'juvenile'
export type WgPhase = 'under' | 'emerge' | 'hunt' | 'graze' | 'hypno' | 'windup' | 'lunge' | 'recover' | 'gulp' | 'retreat' | 'juv'
export interface WgState {
  kind: WgKind
  pregnant: boolean
  phase: WgPhase
  t: number
  /** 世界坐标轨迹：trail[0] = 头，往后直到洞内 */
  trail: { x: number; y: number; z: number }[]
  /** 世界坐标：当前洞口（墙面中心）与法向（指向洞外） */
  hole?: { x: number; y: number; nx: number; ny: number; id: number }
  headZ: number // 头离地高度
  mouth: number // 0..1
  bulge: number // 吞咽鼓包所在弧长（<0 无）
  rock: number // 岩面鼓包 0..1
  gaze: number
  hypnoCd: number
  rumbleCd: number
  coolT: number
  aggro: boolean // 雌性：已被激怒
  provokeT: number
  rage: boolean
  lungeX: number; lungeY: number
  mother?: Entity // 幼体：母亲
  den?: { x: number; y: number } // 世界坐标：卵枝 / 栖息地
  event?: boolean // L2 偶发事件个体：缩回后移除
  stayT: number
  flashWas: boolean
  yawOff: number
  heading: number
  crushCd: number
  clip: 'slither' | 'coil' | 'drill' | 'emerge' | 'hypno' | 'strike' | 'graze' | 'retreat' | 'hop'
  clipT: number
}

export interface WgHole { x: number; y: number; nx: number; ny: number; z: number; r: number; open: number; rock: number; life: number; id: number }
export interface WgEgg { x: number; y: number; z: number; nx: number; ny: number; seed: number; hp: number; burnt: boolean; mother?: Entity }
interface Frame {
  player: Engine['player']
  map: unknown
  holes: WgHole[]
  eggs: WgEgg[]
  told: Set<string>
  /** 0..1 黑屏（被吞） */
  black: number
  captor?: Entity
  wake?: { t: number }
  l2T: number
  holeId: number
  eggsPlaced: boolean
}
const frames = new WeakMap<Engine, Frame>()
function F(eng: Engine): Frame {
  let f = frames.get(eng)
  if (!f || f.map !== eng.map || f.player !== eng.player) {
    const keep = f?.player===eng.player?f:undefined
    f = { player:eng.player, map: eng.map, holes: [], eggs: [], told: keep?.told ?? new Set(), black: 0, wake: undefined, l2T: keep?.l2T ?? rnd(WR.L2_CHECK), holeId: 0, eggsPlaced: false }
    frames.set(eng, f)
  }
  return f
}
const rnd = (r: readonly [number, number]) => r[0] + Math.random() * (r[1] - r[0])
const origin = (eng: Engine) => [eng.map?.inf?.ox ?? 0, eng.map?.inf?.oy ?? 0] as const
const once = (eng: Engine, key: string, text: string, kind: 'system' | 'damage' | 'lore' = 'damage') => { const f = F(eng); if (!f.told.has(key)) { f.told.add(key); eng.msg(text, kind) } }
const radius = (k: WgKind) => k === 'male' ? WR.MALE_R : k === 'female' ? WR.FEMALE_R : WR.JUV_R
const open = (eng: Engine, tx: number, ty: number) => { const m = eng.map!; return tx > 0 && ty > 0 && tx < m.w - 1 && ty < m.h - 1 && eng.entityWalkH(m, tx, ty, 0) !== null }
const ground = (eng: Engine, x: number, y: number) => { const m = eng.map!; const tx = Math.floor(x), ty = Math.floor(y); return tx >= 0 && ty >= 0 && tx < m.w && ty < m.h ? floorHeight(m, x, y) : 0 }

export const isWrangler = (t: string) => t === 'wrangler'

export function initWrangler(eng: Engine, e: Entity, kind?: WgKind, pregnant?: boolean): WgState {
  const k: WgKind = kind ?? e.def.wranglerKind ?? (e.def.name.includes('幼体') ? 'juvenile' : Math.random() < WR.FEMALE_P ? 'female' : 'male')
  const s: WgState = {
    kind: k, pregnant: k === 'female' && (pregnant ?? Math.random() < WR.PREGNANT_P), phase: k === 'juvenile' ? 'juv' : 'under', t: 0,
    trail: [], headZ: 0, mouth: 0, bulge: -1, rock: 0, gaze: 0, hypnoCd: 0, rumbleCd: rnd(WR.RUMBLE_CD), coolT: k === 'juvenile' ? 0 : 4 + Math.random() * 6,
    aggro: k === 'male', provokeT: 0, rage: false, lungeX: 0, lungeY: 0, stayT: 0, flashWas: eng.player.flashlight, yawOff: 0, heading: Math.random() * Math.PI * 2,
    clip: k === 'juvenile' ? 'hop' : 'slither', clipT: 0, crushCd: 0,
  }
  e.wg = s
  e.hidden = k !== 'juvenile' // 岩层里：不渲染头/身体（渲染层再按轨迹画露出的那段）
  if (k === 'juvenile') { e.hp = WR.JUV_HP; e.def = { ...e.def, name: '牧蛇幼体', hp: WR.JUV_HP, passive: true, huge: 1 } }
  if (s.pregnant) placeDen(eng, e, s)
  return s
}

/** 受孕雌性：在附近岩壁上预生成 1～2 根卵枝和 2 只幼体（不做实时孵化） */
function placeDen(eng: Engine, e: Entity, s: WgState) {
  const f = F(eng), m = eng.map!, [ox, oy] = origin(eng)
  const n = Math.round(rnd([WR.EGG_BRANCHES[0], WR.EGG_BRANCHES[1] + 0.99]) - 0.49)
  let placed = 0
  for (let a = 0; a < 200 && placed < n; a++) {
    const tx = Math.floor(e.x + (Math.random() - 0.5) * 16), ty = Math.floor(e.y + (Math.random() - 0.5) * 16)
    if (!open(eng, tx, ty)) continue
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !open(eng, tx + dx, ty + dy))
    if (!dirs.length) continue
    const [dx, dy] = dirs[0]
    const x = tx + 0.5 + dx * 0.48, y = ty + 0.5 + dy * 0.48
    f.eggs.push({ x: x + ox, y: y + oy, z: floorHeight(m, tx + 0.5, ty + 0.5), nx: -dx, ny: -dy, seed: e.id * 7 + placed, hp: 40, burnt: false, mother: e })
    if (!s.den) s.den = { x: tx + 0.5 + ox, y: ty + 0.5 + oy }
    placed++
  }
  if (!s.den) return
  for (let i = 0, tries = 0; i < WR.JUVENILES && tries < 60; tries++) {
    const jx = s.den.x - ox + (Math.random() - 0.5) * 3, jy = s.den.y - oy + (Math.random() - 0.5) * 3
    if (!open(eng, Math.floor(jx), Math.floor(jy))) continue
    i++
    const j = makeEntity('wrangler', jx, jy, floorHeight(m, jx, jy))
    const js = initWrangler(eng, j, 'juvenile'); js.mother = e; js.den = { ...s.den }
    m.entities.push(j)
  }
}

// ---------------------------------------------------------------------------
// 感知
// ---------------------------------------------------------------------------
export function wranglerHear(eng: Engine, e: Entity, x: number, y: number, r: number, sprint: boolean) {
  const s = e.wg ?? initWrangler(eng, e)
  if (s.kind === 'juvenile') return
  const d = Math.hypot(e.x - x, e.y - y)
  // 它靠震动捕猎：跑步、巨响在更远处就能被它「听」见
  if (d < Math.max(r * 1.6, sprint ? WR.SENSE_R : WR.SENSE_R * 0.45)) { e.targetX = x; e.targetY = y; e.stateT = 12; if (s.kind === 'female' && sprint && d < 10) s.provokeT += 0.6 }
}

/** 准星对眼睛的夹角（弧度）；头不在视野里返回 Infinity */
function gazeAngle(eng: Engine, e: Entity, s: WgState) {
  const p = eng.player
  const ex = e.x - p.x, ey = e.y - p.y, ez = (e.z + s.headZ) - (p.z + 1.55)
  const L = Math.hypot(ex, ey, ez)
  if (L < 0.01) return 0
  const cp = Math.cos(look.pitch)
  const fx = -Math.sin(look.yaw) * cp, fy = -Math.cos(look.yaw) * cp, fz = Math.sin(look.pitch)
  const dot = (ex * fx + ey * fy + ez * fz) / L
  return Math.acos(Math.max(-1, Math.min(1, dot)))
}

// ---------------------------------------------------------------------------
// 轨迹工具（世界坐标）
// ---------------------------------------------------------------------------
function pushHead(s: WgState, x: number, y: number, z: number) {
  const h = s.trail[0]
  if (!h || Math.hypot(h.x - x, h.y - y) > 0.3) s.trail.unshift({ x, y, z })
  else { h.x = x; h.y = y; h.z = z }
}
function trailLen(s: WgState) { let L = 0; for (let i = 1; i < s.trail.length; i++) L += Math.hypot(s.trail[i].x - s.trail[i - 1].x, s.trail[i].y - s.trail[i - 1].y); return L }

/** 找切出点：玩家周围 5～12m、与开阔格相邻的岩壁格，优先能直接看见玩家的 */
function findEmergence(eng: Engine, cx?: number, cy?: number): { tx: number; ty: number; dx: number; dy: number } | null {
  const p = cx !== undefined && cy !== undefined ? { x: cx, y: cy } : eng.player
  let best: { tx: number; ty: number; dx: number; dy: number } | null = null, bestS = -1
  for (let a = 0; a < 140; a++) {
    const ang = Math.random() * Math.PI * 2, r = WR.EMERGE_MIN + Math.random() * (WR.EMERGE_MAX - WR.EMERGE_MIN)
    const tx = Math.floor(p.x + Math.cos(ang) * r), ty = Math.floor(p.y + Math.sin(ang) * r)
    if (open(eng, tx, ty)) continue
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ax = tx + dx, ay = ty + dy
      if (!open(eng, ax, ay)) continue
      // 洞外至少 3 格开阔，头才伸得出来
      if (!open(eng, ax + dx, ay + dy) || !open(eng, ax + 2 * dx, ay + 2 * dy)) continue
      const sees = eng.los(ax + 0.5, ay + 0.5, p.x, p.y)
      const score = (sees ? 2 : 0) + Math.random()
      if (score > bestS) { bestS = score; best = { tx, ty, dx, dy } }
    }
    if (bestS >= 2) break
  }
  return best
}

function startEmerge(eng: Engine, e: Entity, s: WgState, cx?: number, cy?: number) {
  const em = findEmergence(eng, cx, cy)
  if (!em) { s.coolT = 3; return }
  const f = F(eng), [ox, oy] = origin(eng), m = eng.map!
  const wx = em.tx + 0.5 + em.dx * 0.5, wy = em.ty + 0.5 + em.dy * 0.5 // 墙面中心
  const gz = floorHeight(m, em.tx + 0.5 + em.dx, em.ty + 0.5 + em.dy)
  const R = radius(s.kind)
  s.hole = { x: wx + ox, y: wy + oy, nx: em.dx, ny: em.dy, id: ++f.holeId }
  f.holes.push({ x: wx + ox, y: wy + oy, nx: em.dx, ny: em.dy, z: gz + R * WR.HEAD_H * 0.75, r: R * 1.15, open: 0, rock: 0, life: WR.HOLE_LIFE, id: s.hole.id })
  // 轨迹：从岩层深处水平伸到墙面（这一截永远在石头里）
  s.trail = []
  for (let k = 40; k >= 0; k -= 2) s.trail.push({ x: wx + ox - em.dx * k, y: wy + oy - em.dy * k, z: gz + R * WR.HEAD_H * 0.75 - R }) // z = 身体中线高度 - R（渲染层 +R）
  s.trail.reverse() // [0] = 墙面
  s.headZ = R * WR.HEAD_H * 0.75
  e.x = wx - em.dx * 0.6; e.y = wy - em.dy * 0.6; e.z = gz
  setPhase(s, 'emerge', 'emerge')
  e.hidden = false
  audio.caveThunder?.(1)
  eng.camShake = Math.min(1, eng.camShake + 0.6)
  eng.msg(s.kind === 'male' ? '岩壁上鼓起了一个包——石头正在从里面被顶开！' : '岩壁在呻吟，碎石簌簌往下掉——有什么巨大的东西正贴着石头那一面游过来。', 'damage')
}

function setPhase(s: WgState, ph: WgPhase, clip?: WgState['clip']) { s.phase = ph; s.t = 0; if (clip) { s.clip = clip; s.clipT = 0 } }

// ---------------------------------------------------------------------------
// 玩家被控制（催眠拖拽 / 被吞黑屏）
// ---------------------------------------------------------------------------
export function wranglerControlsPlayer(eng: Engine): boolean {
  const f = frames.get(eng)
  if (!f?.captor) return false
  const e = f.captor, s = e.wg
  if (!s || e.dead || !eng.map?.entities.includes(e) || eng.player.hp <= 0) { f.captor = undefined; return false }
  return s.phase === 'gulp' || s.phase === 'hypno' || s.phase === 'windup' || s.phase === 'lunge'
}
export function wranglerBlackout(eng: Engine) { return frames.get(eng)?.black ?? 0 }
export function wranglerHoles(eng: Engine) { return frames.get(eng)?.holes ?? [] }
export function wranglerEggs(eng: Engine) { return frames.get(eng)?.eggs ?? [] }
export function wranglerOrigin(eng: Engine) { return origin(eng) }

/** 被吞：黑屏 → 在没去过的安全地点以 1 HP 醒来 */
function swallow(eng: Engine, e: Entity, s: WgState) {
  const f = F(eng)
  setPhase(s, 'gulp', 'strike'); s.clipT = WR.WINDUP + WR.LUNGE + 0.25
  f.captor = e
  audio.stomach?.()
  eng.camShake = 1
  eng.msg(s.kind === 'male' ? '那张笑着的嘴合了上来。湿热、黑暗、四面八方都在收紧——' : '口器钳夹住了你，把你往那片漆黑里送——', 'damage')
}

/** 醒来点：探索图里没去过、开阔、与大片区域连通、20m 内没有敌对实体、离吞咽点 ≥30m */
export function findWakeSpot(eng: Engine, fromX: number, fromY: number): { x: number; y: number; z: number } | null {
  const m = eng.map!
  const band = bandOfPlayerZ(m, eng.player.z, eng.player.x, eng.player.y)
  const n = m.w * m.h, walk = new Uint8Array(n), height = new Float32Array(n)
  for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) {
    const i = y * m.w + x
    if (m.elev[i] === 4 || m.liquid[i] === 1 || (m.stair[i] & 7) !== 0) continue
    const z = groundHeightAt(m, x + 0.5, y + 0.5, band)
    if (!canOccupy(m, x + 0.5, y + 0.5, PLAYER_RADIUS, { z, crouch: false, band })) continue
    walk[i] = 1; height[i] = z
  }
  // 连通分量
  const comp = new Int32Array(n).fill(-1), sizes: number[] = [], q = new Int32Array(n)
  for (let st = 0; st < n; st++) {
    if (!walk[st] || comp[st] >= 0) continue
    const id = sizes.length; let h = 0, t = 1; q[0] = st; comp[st] = id
    while (h < t) { const c = q[h++], cx = c % m.w; for (const d of [1, -1, m.w, -m.w]) { const nx = c + d; if (nx < 0 || nx >= n || !walk[nx] || comp[nx] >= 0) continue; if ((d === 1 && cx === m.w - 1) || (d === -1 && cx === 0)) continue; if (Math.abs(height[nx] - height[c]) > JUMP_REACH) continue; comp[nx] = id; q[t++] = nx } }
    sizes.push(t)
  }
  const big = Math.max(0, ...sizes)
  const hostiles = m.entities.filter((q2) => !q2.dead && !q2.def.passive && !q2.def.friendly && q2.def.type !== 'wrangler')
  const tries: { unexplored: boolean }[] = [{ unexplored: true }, { unexplored: false }]
  for (const pol of tries) {
    const cand: number[] = []
    for (let i = 0; i < n; i++) {
      if (!walk[i] || sizes[comp[i]] < Math.min(200, big * 0.5)) continue
      if (pol.unexplored && eng.explored?.[i]) continue
      const x = i % m.w, y = (i - x) / m.w
      let openN = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (walk[(y + dy) * m.w + x + dx]) openN++
      if (openN < 8) continue
      if (Math.hypot(x + 0.5 - fromX, y + 0.5 - fromY) < WR.WAKE_MIN_D) continue
      cand.push(i)
    }
    // 随机挑，挑到附近没有敌对实体的
    for (let k = 0; k < 80 && cand.length; k++) {
      const i = cand[Math.floor(Math.random() * cand.length)], x = i % m.w + 0.5, y = Math.floor(i / m.w) + 0.5
      if (hostiles.some((h2) => Math.hypot(h2.x - x, h2.y - y) < WR.WAKE_SAFE_R)) continue
      if (m.entities.some((w) => !w.dead && w.def.type === 'wrangler' && w.wg && w.wg.kind !== 'juvenile' && Math.hypot(w.x - x, w.y - y) < WR.WAKE_SAFE_R * 1.5)) continue
      return { x, y, z: height[i] }
    }
  }
  return null
}

function wakeUp(eng: Engine, e: Entity) {
  const f = F(eng), p = eng.player
  const spot = findWakeSpot(eng, e.x, e.y)
  if (spot) {
    p.x = spot.x; p.y = spot.y; p.z = spot.z; p.vz = 0; p.crouching = false
    eng.moveIt.acc = 0; eng.slipVx = 0; eng.slipVy = 0; eng.onStairs = false
    eng.searching = null; eng.usingItem = null; eng.lootPanel = null; eng.interactTarget = null
    eng.ride = null; eng.climb = null
    eng.updateInfiniteWindow()
  }
  if (!eng.dev.god) p.hp = WR.WAKE_HP
  f.captor = undefined
  f.wake = { t: 0 }
  eng.msg('你在冰冷的石头上醒来，浑身裹着发臭的黏液。这里你从没来过。它把你吐了出来——还是你从它身体的某处被挤了出来？你只剩最后一口气了。', 'damage')
  eng.emit({ kind: 'toast', text: '被牧蛇吞下——你以 1 HP 醒来' })
  eng.persist?.()
}

/** 渲染层/引擎每帧：黑屏的淡入淡出（被吞 → 醒来） */
function tickFrame(eng: Engine, dt: number) {
  const f = F(eng)
  if (f.captor?.wg?.phase === 'gulp') f.black = Math.min(1, f.black + dt / 0.6)
  else if (f.wake) { f.wake.t += dt; f.black = Math.max(0, 1 - f.wake.t / WR.WAKE_FADE); if (f.black <= 0) f.wake = undefined }
  else f.black = Math.max(0, f.black - dt * 2)
  for (const h of f.holes) h.life -= dt
  f.holes = f.holes.filter((h) => h.life > 0)
}

// ---------------------------------------------------------------------------
// 主循环
// ---------------------------------------------------------------------------
export function updateWrangler(eng: Engine, e: Entity, dt: number, d: number) {
  const s = e.wg ?? initWrangler(eng, e)
  s.t += dt; s.clipT += dt
  s.hypnoCd -= dt; s.coolT -= dt
  if (s.kind === 'juvenile') { updateJuvenile(eng, e, s, dt, d); return }
  const p = eng.player, [ox, oy] = origin(eng), m = eng.map!
  const R = radius(s.kind)
  const speed = s.rage ? WR.RAGE_SPEED : s.kind === 'male' ? WR.MALE_SPEED : WR.FEMALE_SPEED
  e.state = s.phase === 'under' || s.phase === 'graze' ? 'wander' : 'chase'
  if (s.phase !== 'under') { const h = s.trail[0]; if (h) { e.x = h.x - ox; e.y = h.y - oy } }
  const f = F(eng)
  const hole = s.hole ? f.holes.find((h) => h.id === s.hole!.id) : undefined
  const holeLocal = s.hole ? { x: s.hole.x - ox, y: s.hole.y - oy } : null
  switch (s.phase) {
    case 'under': {
      e.hidden = true; s.mouth = 0; s.rock = 0
      // 在岩层里朝最后感知到的震动/玩家游过去
      const tx = e.stateT > 0 ? e.targetX : p.x, ty = e.stateT > 0 ? e.targetY : p.y
      const dx = tx - e.x, dy = ty - e.y, L = Math.hypot(dx, dy)
      const want = s.kind === 'male' || s.aggro || s.rage
      if (L > 1 && want) { const v = Math.min(L, WR.UNDER_SPEED * (s.rage ? 1.6 : 1) * dt); e.x += (dx / L) * v; e.y += (dy / L) * v }
      if (d < WR.RUMBLE_R && (s.rumbleCd -= dt) <= 0) {
        s.rumbleCd = rnd(WR.RUMBLE_CD) * (d < 14 ? 0.6 : 1)
        audio.caveThunder?.(0.4 + 0.6 * (1 - d / WR.RUMBLE_R))
        eng.camShake = Math.min(1, eng.camShake + 0.12 + 0.3 * (1 - d / WR.RUMBLE_R))
        eng.msg(d < 14 ? '脚下的隆隆声越来越近，石缝里的小石子在跳——它就在附近的岩层里。' : '远处的岩层深处传来低沉的隆隆声。', 'system')
      }
      if (s.event && s.t > WR.L2_STAY + 20) { e.dead = true; e.deathT = 0; return }
      if (eng.dev.invisible || p.hp <= 0) break
      // 切出：雄性/被激怒/暴怒的雌性靠近时；平静的雌性随机找岩壁啃
      if (s.coolT <= 0 && ((want && d < 14) || (!want && Math.random() < dt / 10 && d < 30))) {
        if (!want) {
          // 平静的雌性在自己附近切出啃岩
          startEmerge(eng, e, s, e.x, e.y)
          if ((s.phase as WgPhase) === 'emerge') s.stayT = rnd(WR.GRAZE_T)
        } else startEmerge(eng, e, s)
      }
      break
    }
    case 'emerge': {
      // 0–0.9s：岩面鼓包（头还在石头里）；之后破壁，头沿洞口法向伸出 3m 并下垂
      const n = s.hole!, u = s.t / WR.EMERGE_T
      s.rock = Math.min(1, s.t / WR.BULGE_T)
      if (hole) { hole.open = s.t > WR.BULGE_T ? 1 : 0; hole.rock = s.rock }
      if (s.t > WR.BULGE_T && s.t - dt <= WR.BULGE_T) { audio.scrape?.(1); eng.camShake = Math.min(1, eng.camShake + 0.5); for (let i = 0; i < 16; i++) eng.particles?.push({ x: n.x - ox, y: n.y - oy, z: (hole?.z ?? 1.5), vx: n.nx * 2 + (Math.random() - 0.5) * 2, vy: n.ny * 2 + (Math.random() - 0.5) * 2, vz: Math.random() * 2, t: 0, life: 1.2, color: '#6a6052', size: 0.08 }) }
      const out = Math.max(0, (u - WR.BULGE_T / WR.EMERGE_T) / (1 - WR.BULGE_T / WR.EMERGE_T)) * 3
      const hx = n.x + n.nx * (out - 0.6), hy = n.y + n.ny * (out - 0.6)
      s.headZ = R * WR.HEAD_H * (0.75 + 0.25 * Math.min(1, out / 3))
      pushHead(s, hx, hy, ground(eng, hx - ox, hy - oy))
      if (s.t >= WR.EMERGE_T) {
        if (!s.aggro && !s.rage && s.kind === 'female') setPhase(s, 'graze', 'graze')
        else { setPhase(s, 'hunt', 'slither'); s.stayT = s.event ? WR.L2_STAY : WR.HUNT_MAX_T }
        once(eng, 'first-' + s.kind, s.kind === 'male' ? '一颗灰黑的巨头从石洞里探了出来：一张拉长的人脸，两只斜吊的白眼睛在发光，嘴角一直裂到耳根——它在笑。别盯着它的眼睛看。' : '一颗披着节肢甲壳的巨头探出石洞，两只圆眼发着白光，下颚的钳子一开一合。', 'damage')
      }
      break
    }
    case 'graze': {
      // 雌性啃岩：原地不动、钳子一开一合；你贴太近太久才会被盯上
      s.mouth = 0.5 + 0.5 * Math.sin(s.t * 7.8); s.rock = 0
      if (Math.random() < dt * 0.6) audio.clumpChew?.()
      if (d < WR.FEMALE_PROVOKE_R && !eng.dev.invisible) s.provokeT += dt; else s.provokeT = Math.max(0, s.provokeT - dt * 0.5)
      if (s.provokeT > WR.FEMALE_PROVOKE_T * 0.5) once(eng, 'female-notice-' + e.id, '啃岩的声音停了。那颗头慢慢转了过来。', 'damage')
      if (s.provokeT > WR.FEMALE_PROVOKE_T || s.rage) { s.aggro = true; setPhase(s, 'hunt', 'slither'); s.stayT = WR.HUNT_MAX_T; audio.aggro(); break }
      if (s.t > s.stayT) startRetreat(s)
      break
    }
    case 'hunt': {
      s.mouth = 0.06; s.rock = 0
      s.stayT -= dt
      const holeD = holeLocal ? Math.hypot(p.x - holeLocal.x, p.y - holeLocal.y) : 0
      if (s.stayT <= 0 || holeD > WR.LEASH || eng.dev.invisible || p.hp <= 0) { startRetreat(s); break }
      // 头朝玩家蜿蜒前进（航向左右摆 → 身体自然成 S 形）；能穿岩，但在石头里慢
      const tx = p.x, ty = p.y
      const want = Math.atan2(ty - e.y, tx - e.x)
      let dh = ((want - s.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      s.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, dh))
      const wig = Math.sin(s.t * 1.9) * 0.55
      const inRock = !open(eng, Math.floor(e.x), Math.floor(e.y))
      // 离洞口的轨迹长度到上限就不再前进（身体不会整条露出来）
      const used = trailLen(s) - 40
      const v = used > WR.VISIBLE_LEN - 2 ? 0 : speed * (inRock ? WR.ROCK_SPEED_K : 1) * dt
      if (d > 2.5) { const hx = e.x + Math.cos(s.heading + wig) * v, hy = e.y + Math.sin(s.heading + wig) * v; e.x = hx; e.y = hy }
      if (used > WR.VISIBLE_LEN - 2 && d > WR.STRIKE_R + 2) { startRetreat(s); break }
      s.headZ = R * WR.HEAD_H
      e.z = ground(eng, e.x, e.y)
      pushHead(s, e.x + ox, e.y + oy, e.z)
      e.facing = s.heading
      tryHypno(eng, e, s, dt)
      if (s.phase !== 'hunt') break
      if (d < WR.STRIKE_R && e.attackCd <= 0 && eng.los(e.x, e.y, p.x, p.y)) startWindup(eng, e, s)
      break
    }
    case 'hypno': {
      // 被催眠：玩家被拖向它（wranglerControlsPlayer 让移动失效，这里推玩家），视线被往眼睛上拖
      s.mouth = 0.1
      const ang = gazeAngle(eng, e, s)
      const flashOn = eng.player.flashlight && eng.player.battery > 0
      if (flashOn !== s.flashWas && s.t > 0.15) { // 手电晃眼
        s.flashWas = flashOn
        endHypno(eng, s, '手电的光晃过那双白眼睛——它猛地缩了一下头。你的身体又是你的了！快跑！')
        e.stunT = WR.GLARE_STUN; s.coolT = 0; e.attackCd = WR.GLARE_STUN + 0.5
        break
      }
      if (ang > WR.BREAK_ANGLE) { endHypno(eng, s, '你硬生生把视线从它眼睛上扯开了。双腿重新听使唤。'); break }
      // 拖拽视线
      dragLook(eng, e, s, dt)
      // 拖动玩家
      const dx = e.x - p.x, dy = e.y - p.y, L = Math.hypot(dx, dy)
      if (L > 1.2) {
        const step = Math.min(L - 1.2, WR.PULL_SPEED * dt), nx = p.x + (dx / L) * step, ny = p.y + (dy / L) * step
        if (canOccupy(m, nx, ny, PLAYER_RADIUS, { z: p.z, crouch: false, band: bandOfPlayerZ(m, p.z, p.x, p.y) })) { p.x = nx; p.y = ny; p.z = Math.max(p.z, ground(eng, nx, ny)) }
      }
      if (L < WR.STRIKE_R && e.attackCd <= 0) startWindup(eng, e, s)
      break
    }
    case 'windup': {
      // 后缩蓄力 + 张嘴；玩家此时可以闪开（催眠中的玩家仍被控制，只能靠手电/移开视线）
      s.mouth = Math.min(1, s.t / WR.WINDUP)
      s.clipT = s.t / WR.WINDUP * 0.45 * 1.8
      if (s.t >= WR.WINDUP) { setPhase(s, 'lunge'); if (F(eng).captor === e) { s.lungeX = p.x; s.lungeY = p.y } audio.hit() }
      // 被催眠的人仍在被拖
      if (F(eng).captor === e) { dragLook(eng, e, s, dt); const flashOn = eng.player.flashlight && eng.player.battery > 0; if (flashOn !== s.flashWas) { s.flashWas = flashOn; endHypno(eng, s, '手电的光晃进它张开的嘴里——它闭眼甩头。快跑！'); e.stunT = WR.GLARE_STUN; setPhase(s, 'recover'); e.attackCd = WR.STRIKE_CD } }
      break
    }
    case 'lunge': {
      s.mouth = 1
      const k = Math.min(1, s.t / WR.LUNGE)
      const tx = s.lungeX, ty = s.lungeY, dx = tx - e.x, dy = ty - e.y, L = Math.hypot(dx, dy)
      if (L > 0.3) { const v = Math.min(L, (WR.STRIKE_R + 1.5) / WR.LUNGE * dt); e.x += (dx / L) * v; e.y += (dy / L) * v; pushHead(s, e.x + ox, e.y + oy, ground(eng, e.x, e.y)) }
      s.headZ = R * WR.HEAD_H * (1 - 0.4 * k)
      if (s.t >= WR.LUNGE) {
        const hit = Math.hypot(p.x - e.x, p.y - e.y) < WR.SWALLOW_R && Math.abs(p.z - e.z) < 2.4 && !eng.dev.invisible
        if (hit && !eng.dev.god) swallow(eng, e, s)
        else { setPhase(s, 'recover'); e.attackCd = WR.STRIKE_CD; if (F(eng).captor === e) F(eng).captor = undefined; eng.msg('那张嘴在你身边重重合上，石头被啃掉了一大块。', 'system'); eng.camShake = Math.min(1, eng.camShake + 0.5) }
      }
      break
    }
    case 'recover': {
      s.mouth = Math.max(0, 1 - s.t / 0.4)
      s.headZ = R * WR.HEAD_H * (0.6 + 0.4 * Math.min(1, s.t / WR.RECOVER))
      if (s.t >= WR.RECOVER) setPhase(s, 'hunt', 'slither')
      break
    }
    case 'gulp': {
      s.mouth = Math.max(0, 1 - s.t / 0.3)
      s.bulge = s.t < 0.3 ? -1 : Math.min(18, (s.t - 0.3) * 8)
      if (s.t >= WR.GULP_T) { wakeUp(eng, e); s.bulge = -1; startRetreat(s); s.coolT = WR.AFTER_SWALLOW_CD }
      break
    }
    case 'retreat': {
      // 沿来路倒退回洞里（头一路踩着轨迹往回走）
      s.mouth = 0; s.rock = 0; s.gaze = 0
      if (F(eng).captor === e && s.t < 0.05) F(eng).captor = undefined
      let v = WR.RETREAT_SPEED * dt
      while (v > 0 && s.trail.length > 22) {
        const a = s.trail[0], b = s.trail[1], seg = Math.hypot(b.x - a.x, b.y - a.y)
        if (seg <= v) { s.trail.shift(); v -= seg } else { a.x += (b.x - a.x) / seg * v; a.y += (b.y - a.y) / seg * v; v = 0 }
      }
      const h = s.trail[0]; e.x = h.x - ox; e.y = h.y - oy
      if (s.trail.length <= 22) {
        // 头回到墙面：再往里缩 2m 后进入岩层
        s.trail.shift()
        setPhase(s, 'under')
        e.hidden = true
        s.trail = []
        if (s.coolT < 0) s.coolT = rnd(WR.UNDER_CD)
        if (s.event) { e.dead = true; e.deathT = 0 }
        if (!s.rage && s.kind === 'female') s.aggro = false
      }
      break
    }
  }
  s.crushCd -= dt
  if (s.phase !== 'under' && s.phase !== 'gulp' && !e.dead) bodyCollide(eng, e, s)
  // 雌性：卵枝/幼体被伤 → 暴怒，直奔玩家
  if (s.rage && s.phase === 'under') s.coolT = Math.min(s.coolT, 0.5)
}

/**
 * 身体碰撞：露出的那段身体（含颈部和头）是实心的，会把玩家从管体里推出去；
 * 身体在动（追猎、后撤、前扑、切出）时扫到你，会把你撞开并造成伤害。颈部抬得够高时可以从下面钻过去。
 * 返回本帧推开的距离（验收用）。
 */
export function bodyCollide(eng: Engine, e: Entity, s: WgState): number {
  const p = eng.player, m = eng.map!, [ox, oy] = origin(eng), R = radius(s.kind)
  if (s.trail.length < 2 || eng.dev.invisible || p.hp <= 0) return 0
  const rr = R + PLAYER_RADIUS, feet = p.z, top = p.z + (p.crouching ? 1.1 : 1.7)
  const headY = e.z + s.headZ
  let best = 0, bx = 0, by = 0, acc = 0, seg = 0
  for (let i = 0; i < s.trail.length - 1; i++) {
    if (acc > WR.VISIBLE_LEN + 6) break
    const a = s.trail[i], b = s.trail[i + 1]
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    const ax = a.x - ox, ay = a.y - oy, bx2 = b.x - ox, by2 = b.y - oy
    const t = L > 1e-4 ? Math.max(0, Math.min(1, ((p.x - ax) * (bx2 - ax) + (p.y - ay) * (by2 - ay)) / (L * L))) : 0
    const cx = ax + (bx2 - ax) * t, cy = ay + (by2 - ay) * t
    const d = Math.hypot(p.x - cx, p.y - cy)
    const arc = acc + L * t; acc += L
    if (d >= rr) continue
    const g = a.z + (b.z - a.z) * t + R, lift = 1 - Math.min(1, arc / WR.BODY_LIFT), k = lift * lift * (3 - 2 * lift)
    const mid = g + (headY - g) * k
    if (mid - R > top || mid + R < feet + 0.25) continue // 从颈下钻过 / 站在背上
    const pen = rr - d
    if (pen > best) {
      best = pen; seg = i
      if (d > 1e-4) { bx = (p.x - cx) / d; by = (p.y - cy) / d } else { bx = -(by2 - ay) / (L || 1); by = (bx2 - ax) / (L || 1) }
    }
  }
  if (best <= 0) return 0
  const band = bandOfPlayerZ(m, p.z, p.x, p.y)
  const tryMove = (dx: number, dy: number, k: number) => { const nx = p.x + dx * k, ny = p.y + dy * k; if (canOccupy(m, nx, ny, PLAYER_RADIUS, { z: p.z, crouch: !!p.crouching, band })) { p.x = nx; p.y = ny; return true } return false }
  if (!tryMove(bx, by, best + 0.02)) {
    // 被夹在身体和岩壁之间：沿身体切向挤出去
    const a = s.trail[seg], b = s.trail[seg + 1], L = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const tx = (a.x - b.x) / L, ty = (a.y - b.y) / L
    if (!tryMove(tx, ty, best + 0.3)) tryMove(-tx, -ty, best + 0.3)
  }
  const v = s.phase === 'retreat' ? WR.RETREAT_SPEED : s.phase === 'lunge' ? 8 : s.phase === 'hunt' || s.phase === 'emerge' ? (s.rage ? WR.RAGE_SPEED : s.kind === 'male' ? WR.MALE_SPEED : WR.FEMALE_SPEED) : 0
  if (v >= WR.CRUSH_V && s.crushCd <= 0 && best > 0.15 && !eng.dev.god) {
    s.crushCd = WR.CRUSH_CD
    eng.hurtPlayer(WR.CRUSH_DMG, '牧蛇的身体')
    eng.camShake = Math.min(1, eng.camShake + 0.45)
    once(eng, 'crush', '那截冰冷滑腻的身体从你身上碾了过去，把你撞翻在石头上。别挡在它要走的路上。', 'damage')
  }
  return best
}

function startRetreat(s: WgState) { setPhase(s, 'retreat', 'retreat'); s.gaze = 0 }

function tryHypno(eng: Engine, e: Entity, s: WgState, dt: number) {
  if (s.hypnoCd > 0 || eng.dev.invisible) { s.gaze = Math.max(0, s.gaze - dt * WR.GAZE_DECAY); return }
  const p = eng.player, d = Math.hypot(e.x - p.x, e.y - p.y)
  const R = radius(s.kind)
  const ang = gazeAngle(eng, e, s), fov = WR.GAZE_FOV + Math.atan(R * 0.9 / Math.max(1, d))
  const sees = d < WR.GAZE_R && ang < fov && eng.los(p.x, p.y, e.x, e.y)
  if (sees) s.gaze += dt; else s.gaze = Math.max(0, s.gaze - dt * WR.GAZE_DECAY)
  if (s.gaze > WR.GAZE_T * 0.4) once(eng, 'gaze-warn', '那双发白的眼睛像是在往你脑子里钻——别一直盯着它看！', 'damage')
  if (s.gaze >= WR.GAZE_T) {
    setPhase(s, 'hypno', 'hypno')
    s.flashWas = p.flashlight && p.battery > 0
    F(eng).captor = e
    audio.whisper?.()
    eng.msg('你移不开视线了。腿自己在往前走——朝着那张笑脸。（把视线甩开，或者开关一下手电晃它的眼睛！）', 'damage')
  }
}
function endHypno(eng: Engine, s: WgState, text: string) {
  s.gaze = 0; s.hypnoCd = WR.HYPNO_CD
  if (F(eng).captor?.wg === s) F(eng).captor = undefined
  if (s.phase === 'hypno') setPhase(s, 'hunt', 'slither')
  eng.msg(text, 'system')
}
/** 把相机往它的眼睛上拖：玩家顶着鼠标才能甩开 */
function dragLook(eng: Engine, e: Entity, s: WgState, dt: number) {
  const p = eng.player
  const ex = e.x - p.x, ey = e.y - p.y, ez = (e.z + s.headZ) - (p.z + 1.55)
  const yaw = Math.atan2(-ex, -ey), pitch = Math.atan2(ez, Math.hypot(ex, ey))
  const dy = ((yaw - look.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  const k = Math.min(1, WR.DRAG_RATE * dt)
  look.yaw += Math.sign(dy) * Math.min(Math.abs(dy), WR.DRAG_RATE * dt * 1.2)
  look.pitch += (pitch - look.pitch) * k
}

function startWindup(eng: Engine, _e: Entity, s: WgState) {
  setPhase(s, 'windup', 'strike')
  s.lungeX = eng.player.x; s.lungeY = eng.player.y // 扑向蓄力开始时你所在的位置：蓄力期间闪开就能躲过
  audio.aggro()
  eng.msg(s.kind === 'male' ? '它的下颌整个脱开了——那张嘴大得能装下一个人！快往旁边闪！' : '口器钳张到了最大——它要扑过来了！往旁边闪！', 'damage')
}

// ---------------------------------------------------------------------------
// 幼体：在卵枝附近蹦跳，怕人；只能被火烧死，死了会把母亲引来
// ---------------------------------------------------------------------------
function updateJuvenile(eng: Engine, e: Entity, s: WgState, dt: number, d: number) {
  const [ox, oy] = origin(eng), p = eng.player
  e.hidden = false; e.state = 'wander'
  const den = s.den ? { x: s.den.x - ox, y: s.den.y - oy } : { x: e.x, y: e.y }
  if (d < WR.JUV_FLEE_R) { const a = Math.atan2(e.y - p.y, e.x - p.x); e.targetX = e.x + Math.cos(a) * 3; e.targetY = e.y + Math.sin(a) * 3; e.stateT = 1.2 }
  else if (e.stateT <= 0 || Math.hypot(e.targetX - den.x, e.targetY - den.y) > WR.JUV_LEASH) { const a = Math.random() * Math.PI * 2, r = Math.random() * WR.JUV_LEASH * 0.7; e.targetX = den.x + Math.cos(a) * r; e.targetY = den.y + Math.sin(a) * r; e.stateT = 2 + Math.random() * 3 }
  const moving = !eng.stepEntity(e, WR.JUV_SPEED * (d < WR.JUV_FLEE_R ? 1.6 : 1), dt)
  s.clip = moving ? 'hop' : 'coil'
}

/** 火油爆炸波及（combat.ts explode）：返回 true 表示已由这里处理 */
export function wranglerFire(eng: Engine, e: Entity, dist: number): boolean {
  const s = e.wg ?? initWrangler(eng, e)
  if (s.kind !== 'juvenile') {
    once(eng, 'fire-adult-' + e.id, '火焰在它湿冷的皮上舔了一下就熄了。成年牧蛇根本不怕这点火。', 'system')
    if (s.kind === 'female') { s.aggro = true; s.provokeT = 99 }
    return true
  }
  e.hp -= dist < 2.2 ? 45 : 22
  if (e.hp <= 0) {
    e.dead = true; e.deathT = 1.4
    eng.msg('幼体在火里尖叫着蜷成一团，半透明的皮下面的东西一下子全黑了。……脚下，整片岩层都震了一下。', 'damage')
    summonMother(eng, s.mother)
  } else eng.msg('幼体被火燎得满地乱蹦，发出刺耳的尖叫。', 'damage')
  return true
}
/** 火油烧到卵枝 */
export function wranglerFireEggs(eng: Engine, x: number, y: number) {
  const f = F(eng), [ox, oy] = origin(eng)
  for (const g of f.eggs) {
    if (g.burnt || Math.hypot(g.x - ox - x, g.y - oy - y) > WR.FIRE_R) continue
    g.burnt = true
    eng.msg('卵枝上的囊一颗颗爆开，焦臭的汁液流了一地。远处的岩层里传来一声闷吼。', 'damage')
    summonMother(eng, g.mother)
  }
}
function summonMother(eng: Engine, mother?: Entity) {
  const m = eng.map!, p = eng.player
  let mo = mother && !mother.dead && m.entities.includes(mother) ? mother : undefined
  if (!mo) {
    // 母亲不在这片区域：从远处的岩层里赶来
    mo = makeEntity('wrangler', p.x + 30, p.y, 0)
    initWrangler(eng, mo, 'female')
    m.entities.push(mo)
  }
  const s = mo.wg ?? initWrangler(eng, mo, 'female')
  s.rage = true; s.aggro = true
  if (s.phase === 'graze' || s.phase === 'hunt') { setPhase(s, 'hunt', 'slither'); s.stayT = WR.HUNT_MAX_T }
  else if (s.phase === 'under') { s.coolT = rnd(WR.RAGE_ARRIVE); mo.x = p.x + (Math.random() - 0.5) * 20; mo.y = p.y + (Math.random() - 0.5) * 20 }
  audio.caveThunder?.(1)
  eng.camShake = Math.min(1, eng.camShake + 0.8)
  once(eng, 'rage', '整片岩层都在震——它的母亲来了。', 'damage')
}

/** 成体不可被杀死：近战命中只会被弹开 */
export function wranglerMelee(eng: Engine, e: Entity): boolean {
  const s = e.wg ?? initWrangler(eng, e)
  if (s.kind === 'juvenile') { eng.msg('刀刃从幼体滑溜的半透明皮上滑开了——它疼得乱蹦，却毫发无伤。只有火能伤到它。', 'system'); e.targetX = e.x * 2 - eng.player.x; e.targetY = e.y * 2 - eng.player.y; e.stateT = 1.5; return true }
  if ((e.turnSlowT ?? 0) <= 0) eng.msg(s.kind === 'male' ? '刀砍在它身上像砍在湿透的轮胎上。那张笑脸甚至没有变。' : '刀刃在甲壳上刮出一串火星。', 'system')
  e.turnSlowT = 2
  if (s.kind === 'female') { s.aggro = true; s.provokeT = 99 }
  return true
}
/** killCheck 守卫：除了被火烧死的幼体，牧蛇永远不会因血量归零而死 */
export function wranglerKillGuard(e: Entity) { if (e.dead) return true; e.hp = Math.max(1, e.hp, e.wg?.kind === 'juvenile' ? 1 : e.def.hp); return true }

// ---------------------------------------------------------------------------
// L2 偶发事件：一只雄性在附近岩壁里游过、切出、短暂追猎后缩回（不留在层里）
// ---------------------------------------------------------------------------
export function wranglerAmbient(eng: Engine, dt: number) {
  if (!eng.map) return
  if (frames.has(eng)) tickFrame(eng, dt)
  if (eng.levelDef.id !== 2 || eng.over) return
  const f = F(eng), m = eng.map, p = eng.player
  if (m.entities.some((e) => !e.dead && e.def.type === 'wrangler')) return
  f.l2T -= dt
  if (f.l2T > 0) return
  f.l2T = rnd(WR.L2_CHECK)
  if (Math.random() > WR.L2_P) return
  const a = Math.random() * Math.PI * 2
  const e = makeEntity('wrangler', p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22, 0)
  const s = initWrangler(eng, e, 'male')
  s.event = true; s.coolT = 6 + Math.random() * 4
  m.entities.push(e)
}

/** 验收用：当前状态（check:wrangler 读取） */
export function wranglerDebug(eng: Engine) {
  const f = frames.get(eng)
  return { black: f?.black ?? 0, captor: f?.captor?.id, holes: f?.holes.length ?? 0, eggs: f?.eggs.length ?? 0 }
}
export function wranglerSetCaptor(eng: Engine, e?: Entity) { F(eng).captor = e }
export function wranglerForceFrame(eng: Engine) { return F(eng) }
