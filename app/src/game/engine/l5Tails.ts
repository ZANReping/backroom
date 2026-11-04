// L5「恐怖旅馆」第一期小尾巴（L5-HOTEL.md「未做」）：
//   ① 低理智肖像换章鱼头（level-design §4：理智 < 40，每幅画在视线外 2%/分钟 概率换脸，被看到 1 帧后恢复）
//   ② 墙纸人脸（ZAN 任务口径：低理智时墙纸偶尔浮出人脸，被注视即消失；设计稿「≤ 4 m」保留为浮现距离）
//   ④ 锅炉房管道下滴落水洼（§9：直接喝，理智 +5，每洼一次）
//   ⑤ 贝弗莉邀请函 → 原住民（§8：读过邀请函后，贝弗莉门墙能推开的门改为通往原住民据点）
// 纯函数部分（octoStep / wallFaceStep / pickWallFaceSpot）供 check:l5tails 直接验证；运行时状态挂在 WeakMap 上，不进存档
// （水洼 / 邀请函进 hotel.tails 存档）。
import type { Engine } from '../engine'
import type { Structure } from '../core/types'
import { audio } from '../core/audio'

export const TT = {
  octoSan: 40, // 理智低于此值肖像开始换章鱼头
  octoPerMin: 0.02, // 每幅画每分钟换脸概率（视线外）
  octoRevertFrames: 1, // 被看到后几帧恢复
  faceSan: 40, // 墙纸人脸：理智阈值
  facePerMin: 1.5, // 每分钟浮现次数期望（理智越低越多：× (1 + (40 − 理智)/40)）
  faceMin: 1.6, faceMax: 4, // 浮现距离（m）
  faceConeMin: 0.55, faceConeMax: 1.25, // 浮现在余光里（偏离视线 0.55–1.25 rad）
  faceLook: 0.32, // 视线落在它 0.32 rad 内 = 被注视 → 消失
  faceIn: 1.6, faceOut: 0.25, faceLife: 9, // 浮现 / 消失（s），最长停留
  puddleSan: 5, // 水洼：理智 +5
  puddleThirst: 6, // 顺带解一点渴
}

// ---------- ① 章鱼头肖像（每幅画一个小状态机，渲染层逐帧调用） ----------
export interface OctoState { octo: boolean; seenF: number }
/** u = [0,1) 随机数；返回新状态。looking = 这一帧有人看着这幅画 */
export function octoStep(st: OctoState, lowSan: boolean, looking: boolean, u: number, dt: number): OctoState {
  if (st.octo) {
    if (!looking) return { octo: true, seenF: 0 }
    const f = st.seenF + 1
    return f > TT.octoRevertFrames ? { octo: false, seenF: 0 } : { octo: true, seenF: f }
  }
  if (!lowSan || looking) return { octo: false, seenF: 0 }
  const p = 1 - Math.pow(1 - TT.octoPerMin, dt / 60)
  return u < p ? { octo: true, seenF: 0 } : st
}
export const hotelLowSanity = (eng: Engine) => eng.levelDef.id === 5 && eng.player.sanity < TT.octoSan

// ---------- ② 墙纸人脸 ----------
export interface WallFace { x: number; y: number; wall: number; wx: number; wy: number; a: number; t: number; out: boolean; face: number }
const WF = new WeakMap<Engine, { f: WallFace | null; map: object | null }>()
const wfr = (eng: Engine) => { let r = WF.get(eng); if (!r) { r = { f: null, map: null }; WF.set(eng, r) } return r }
/** 渲染层读：当前浮现的人脸（世界坐标 wx/wy + 墙侧 wall + 透明度 a） */
export function hotelWallFace(eng: Engine): WallFace | null { const r = WF.get(eng); return r && r.map === eng.map ? r.f : null }
const angTo = (px: number, py: number, facing: number, x: number, y: number) => { const d = Math.atan2(y - py, x - px) - facing; return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) }
/** 挑一面在余光里、朝向玩家、1.6–4 m 的墙（返回贴墙地板格 + 墙侧 0E 1S 2W 3N） */
export function pickWallFaceSpot(eng: Engine, u: () => number): { x: number; y: number; wall: number } | null {
  const m = eng.map; if (!m) return null
  const p = eng.player
  const solid = (x: number, y: number) => x < 0 || y < 0 || x >= m.w || y >= m.h || m.tiles[y * m.w + x] !== 1
  const D = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const
  const cands: { x: number; y: number; wall: number }[] = []
  const R = Math.ceil(TT.faceMax)
  for (let y = Math.floor(p.y) - R; y <= Math.floor(p.y) + R; y++) for (let x = Math.floor(p.x) - R; x <= Math.floor(p.x) + R; x++) {
    if (solid(x, y)) continue
    for (let w = 0; w < 4; w++) {
      const [dx, dy] = D[w]
      if (!solid(x + dx, y + dy)) continue
      const fx = x + 0.5 + dx * 0.5, fy = y + 0.5 + dy * 0.5, d = Math.hypot(fx - p.x, fy - p.y)
      if (d < TT.faceMin || d > TT.faceMax) continue
      if ((p.x - fx) * dx + (p.y - fy) * dy > -0.3) continue // 墙面朝向玩家
      const a = angTo(p.x, p.y, p.facing, fx, fy)
      if (a < TT.faceConeMin || a > TT.faceConeMax) continue
      if (m.structures.some((s) => s.x === x && s.y === y)) continue
      if (!eng.los(p.x, p.y, x + 0.5, y + 0.5)) continue
      cands.push({ x, y, wall: w })
    }
  }
  return cands.length ? cands[Math.floor(u() * cands.length) % cands.length] : null
}
/** 单步：浮现 / 停留 / 被注视消失。纯状态推进（spot 由调用方给） */
export function wallFaceStep(f: WallFace, watched: boolean, dt: number): WallFace | null {
  const n = { ...f, t: f.t + dt }
  if (watched || n.t > TT.faceLife) n.out = true
  n.a = n.out ? Math.max(0, f.a - dt / TT.faceOut) : Math.min(1, f.a + dt / TT.faceIn)
  return n.out && n.a <= 0 ? null : n
}
export function wallFaceWatched(eng: Engine, f: WallFace) {
  const D = [[1, 0], [0, 1], [-1, 0], [0, -1]][f.wall & 3], p = eng.player
  const fx = f.x + 0.5 + D[0] * 0.5, fy = f.y + 0.5 + D[1] * 0.5
  return angTo(p.x, p.y, p.facing, fx, fy) < TT.faceLook && Math.hypot(fx - p.x, fy - p.y) < TT.faceMax + 3
}
function stepWallFace(eng: Engine, dt: number) {
  const r = wfr(eng), m = eng.map
  if (r.map !== m) { r.map = m; r.f = null }
  if (r.f) { r.f = wallFaceStep(r.f, wallFaceWatched(eng, r.f), dt); return }
  const san = eng.player.sanity
  if (eng.levelDef.id !== 5 || san >= TT.faceSan) return
  const rate = (TT.facePerMin / 60) * (1 + (TT.faceSan - san) / TT.faceSan)
  if (Math.random() >= 1 - Math.exp(-rate * dt)) return
  const s = pickWallFaceSpot(eng, Math.random)
  if (!s) return
  const ox = m?.inf?.ox ?? 0, oy = m?.inf?.oy ?? 0
  r.f = { ...s, wx: s.x + ox, wy: s.y + oy, a: 0, t: 0, out: false, face: Math.floor(Math.random() * 4) }
}
/** 测试 / 截图用：立刻在给定墙上放一张脸 */
export function hotelForceWallFace(eng: Engine, s: { x: number; y: number; wall: number }, a = 1) {
  const r = wfr(eng), m = eng.map
  r.map = m
  r.f = { ...s, wx: s.x + (m?.inf?.ox ?? 0), wy: s.y + (m?.inf?.oy ?? 0), a, t: 0, out: false, face: 0 }
  return r.f
}

// ---------- ④ 水洼 / ⑤ 邀请函（存档 hotel.tails） ----------
export interface TailsSave { invite?: 1; puddles?: string[] }
export function restoreTails(raw: unknown): TailsSave {
  const r = (raw && typeof raw === 'object' ? raw : {}) as TailsSave
  return { ...(r.invite ? { invite: 1 as const } : {}), puddles: Array.isArray(r.puddles) ? r.puddles.filter((x) => typeof x === 'string').slice(-400) : [] }
}
const tails = (eng: Engine) => (eng.hotel.tails ??= { puddles: [] })
export const puddleKey = (eng: Engine, s: Structure) => `${eng.hotel.floor}:${eng.mapSeed}:${s.x + (eng.map?.inf?.ox ?? 0)},${s.y + (eng.map?.inf?.oy ?? 0)}`
export const puddleDrunk = (eng: Engine, s: Structure) => !!s.data?.drunk || (tails(eng).puddles ?? []).includes(puddleKey(eng, s))
/** X：趴下喝管道下的水洼（理智 +5，每洼一次） */
export function hotelDrinkPuddle(eng: Engine, s: Structure) {
  const t = tails(eng), k = puddleKey(eng, s)
  if (puddleDrunk(eng, s)) { eng.msg('水洼只剩一层湿印子。管道还在滴，但要很久才能再积起来。', 'system'); return false }
  ;(t.puddles ??= []).push(k); if (t.puddles.length > 400) t.puddles.shift()
  s.data = { ...(s.data ?? {}), drunk: 1 }
  const p = eng.player
  p.sanity = Math.min(100, p.sanity + TT.puddleSan)
  const pp = p as unknown as { thirst?: number }
  if (typeof pp.thirst === 'number') pp.thirst = Math.min(100, pp.thirst + TT.puddleThirst)
  audio.uiTick()
  eng.msg(`你跪下来喝了几口管道滴下的水——温的，带一点苦杏仁味。理智 +${TT.puddleSan}`, 'lore')
  return true
}
/** 读到贝弗莉室的烫金邀请函：记住它（之后贝弗莉门墙能推开的门通往原住民据点） */
export function hotelReadInvite(eng: Engine) {
  if (eng.levelDef.id !== 5) return false
  const t = tails(eng), first = !t.invite
  t.invite = 1
  if (first) eng.msg('邀请函背面有一行小字：「持此函者，舞厅的任何一扇门都为你敞开。」', 'lore')
  return first
}
export const hotelHasInvite = (eng: Engine) => !!eng.hotel.tails?.invite

/** 每帧（updateEvents 里调用） */
export function stepTails(eng: Engine, dt: number) { stepWallFace(eng, dt) }
