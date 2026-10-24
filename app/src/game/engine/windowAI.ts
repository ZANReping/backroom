// [window] 窗户（Entity 2）重制 阶段 3：机制。
// 设定：backrooms-wiki-cn entity-2；ZAN 2026-10-23 的决定：
// - 只在 L2 / L4 / L601 出现：按概率占据该层既有的普通窗户（L2 走廊尽头的钢格窗、L4 外墙雨窗、L601 图书馆外墙木窗），
//   外观沿用该层窗型；安全区/据点层不在这三层之内，所以不另做判断。
// - 三态（维基）：
//   · 附影窗：窗内有模糊人形。人形清晰度 sil 随时间缓慢衰减；吞噬一次 +SIL_FEED。降到 DYING_AT 以下转为衰亡态。
//   · 新生态：玩家情绪极度不稳定（理智低）或正在逃离威胁时，附近一扇普通窗户「醒来」。景色更亮更熟悉，
//     不伸手，只把人往里引；玩家自己走进去（贴到 ENTER_R）= 被吞。无人进入则 NEWBORN_T 后消失；默念会加速它消失。
//     有人进入后变成附影窗（人形 = 最后进入者，sil=1）。
//   · 衰亡态：不再引诱、不再伸手；周围 STRIP_R（维基 5–8m）内有被「从空间中剥离」的风险（同层随机远处，扣理智）。
//     DYING_T 后彻底消失（vanish 动画），这扇窗从此只是墙。
// - 附影窗的行为（维基）：靠近时用低语和手势引诱（lure：扣理智 + 把人往窗边拽）；1–2m 内伸出手臂抓人（reach）→ 拖拽（drag）。
// - 被拖入（ZAN 决定 1）：大幅扣理智、扣一部分生命（不致死，最低留 1），然后出现在本层另一扇普通窗户旁。
// - 挣脱（ZAN 决定 2）：拖拽 DRAG_T 秒内，近战打中那条手臂即松手（窗户本体不可伤害、不可杀）。
// - 默念（ZAN 决定 3）：新的「特殊交互」键（engine/special.ts）在窗户附近显示为「默念」，按住时移动变慢、
//   HUD 循环显示维基的三句自我确认；诱引不再拽人，理智流失 ×MURMUR_SAN，抓取距离缩到 GRAB_R_MURMUR。
// - 维基脚注：窗户吞噬过追逐目击者的派对客——附影窗同样会抓走贴近它的其它实体（GRAB_ENT_TYPES）。
// - 单人运行时状态只在内存里（换层清空）；联机继续封闭，本轮不改动网络。
import type { Engine } from '../engine'
import { makeEntity, recordEntityEncounter, type Entity } from '../entities'
import type { Structure } from '../core/types'
import { audio } from '../core/audio'
import { canOccupy, PLAYER_RADIUS } from '../core/player'
import { floorHeight } from '../world/mapgen'
import { resetSwim } from './swim'

export type WinStyle = 'l2' | 'l4' | 'l601'
export type WinLife = 'occupied' | 'newborn' | 'dying' | 'gone'
export type WinMode = 'idle' | 'lure' | 'reach' | 'drag' | 'release' | 'feed' | 'newborn' | 'dying' | 'vanish'

/** 全部数值（ZAN 调参就改这张表） */
export const WIN = {
  /** 各层「普通窗户被占据」的概率（按世界坐标确定性抽签） */
  SPAWN_P: { 2: 0.3, 4: 0.035, 12: 0.14 } as Record<number, number>,
  /** 实体在玩家多远内生成 / 多远外收起（状态保留在登记表里） */
  SPAWN_R: 42, DESPAWN_R: 64,
  /** 诱引半径（低语+招手）与理智流失（每秒） */
  LURE_R: 7, LURE_SAN: 0.9,
  /** 诱引把玩家往窗边拽的速度（m/s，叠加在玩家移动输入上） */
  PULL: 0.45, PULL_NEW: 0.8,
  /** 伸手距离（维基 1–2m）；默念时缩短 */
  GRAB_R: 1.7, GRAB_R_MURMUR: 0.9,
  /** 伸手扑空后判定还能抓住的额外余量 */
  GRAB_SLACK: 0.6,
  /** 片段时长（与 renderer/windowAnim.ts 的 WINDOW_CLIPS 一致） */
  REACH_T: 0.55, DRAG_T: 2.5, RELEASE_T: 0.7, FEED_T: 2, VANISH_T: 2.5,
  /** 拖拽终点：玩家被拉到离玻璃多近 */
  DRAG_END: 0.35,
  /** 被打松手 / 扑空后的冷却 */
  RELEASE_CD: 9, MISS_CD: 4,
  /** 被拖入的代价：理智、生命（占上限 100 的比例；不致死） */
  FEED_SAN: 45, FEED_HP: 35,
  /** 传送：目标普通窗户离原处的距离范围（m） */
  TP_MIN: 12, TP_MAX: 90,
  /** 人形清晰度：初始范围、衰减（每秒）、吞噬增量、低于多少转衰亡 */
  SIL0: [0.45, 0.95] as [number, number], SIL_DECAY: 1 / 1500, SIL_FEED: 0.4, DYING_AT: 0.1,
  /** 新生态：触发条件（理智低于 / 正被追击），检查间隔、概率、冷却，寿命，生成距离，进入判定 */
  NEW_SAN: 35, NEW_CHECK: 12, NEW_P: 0.35, NEW_CD: 150, NEWBORN_T: 240, NEW_R: [6, 22] as [number, number], ENTER_R: 0.75,
  /** 默念时新生态窗消散加速倍率 */
  NEW_MURMUR_K: 8,
  /** 衰亡态：寿命、剥离半径（维基 5–8m）、每秒剥离概率、剥离代价 */
  DYING_T: 150, STRIP_R: 6.5, STRIP_P: 0.07, STRIP_SAN: 12,
  /** 默念：移动倍率、理智流失倍率、可用半径 */
  MURMUR_SPEED: 0.5, MURMUR_SAN: 0.25, MURMUR_R: 9,
  /** 会被附影窗抓走的其它实体 */
  GRAB_ENT_TYPES: ['partygoer', 'corpserat', 'dryshrimp', 'skinstealer', 'faceling'] as string[],
  GRAB_ENT_R: 1.3,
}

/** 维基原文：遇到无主窗户时默念的三句 */
export const WIN_MANTRA = ['我存在于此，并绝不退缩半步。', '我甘愿身处此地。', '此处并无出路，我接受这一事实。']

const LURE_LINES = [
  '窗里那个人影抬起手，朝你招了招。',
  '你听见有人压低声音叫你的名字——很熟悉，很温柔。',
  '「过来，」低语说，「这边很安全。」',
  '窗外的风景你好像见过。是……家附近？',
  '人影把手贴在玻璃上，等你把手也放上去。',
]
const NEW_LINES = [
  '那扇窗外是你记忆里的街道，连路灯的颜色都一样。',
  '你突然很想回去。只要穿过这扇窗就行了，对吧？',
  '窗外有风吹进来，带着你最想念的那种气味。',
]

export interface WinReg { life: WinLife; sil: number; lifeT: number; seed: number }
export interface WinEntState {
  key: string; style: WinStyle; wx: number; wy: number; yaw: number; nx: number; ny: number
  reg: WinReg; mode: WinMode; modeT: number; cd: number; lineT: number; stripT: number
  /** drag 开始时玩家离玻璃的距离（拖拽按比例收拢） */
  dragD0: number
  /** 被抓走的其它实体（只做动画） */
  prey: number | null
}
export interface WinRunState {
  reg: Map<string, WinReg | null>
  scanT: number; newCheckT: number; newCd: number
  heldBy: number | null
  murmur: boolean; murmurT: number
  blackT: number
  hint: string; hintT: number
}
export function freshWinRun(): WinRunState {
  return { reg: new Map(), scanT: 0, newCheckT: WIN.NEW_CHECK, newCd: 60, heldBy: null, murmur: false, murmurT: 0, blackT: 0, hint: '', hintT: 0 }
}

const OX = (eng: Engine) => eng.map?.inf?.ox ?? 0
const OY = (eng: Engine) => eng.map?.inf?.oy ?? 0
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
/** 世界坐标的确定性哈希 → [0,1) */
export function winHash(seed: number, wx: number, wy: number, salt = 0): number {
  let h = (seed | 0) ^ Math.imul(wx | 0, 0x27d4eb2d) ^ Math.imul(wy | 0, 0x165667b1) ^ Math.imul(salt + 1, 0x9e3779b9)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export const winStyleOf = (level: number): WinStyle | null => level === 2 ? 'l2' : level === 4 ? 'l4' : level === 12 ? 'l601' : null

/** 本层的「普通窗户」结构 */
export function isOrdinaryWindow(level: number, s: Structure): boolean {
  if ((s.floor ?? 0) !== 0) return false // 只做地面层（楼上的窗户高度不同）
  if (level === 2) return s.kind === 'windowtrap' && !s.data?.l4
  if (level === 4) return s.kind === 'glasswin' && !!s.data?.l4Facade && !s.data?.partition && s.data?.deg !== undefined
  if (level === 12) return s.kind === 'libwindow' // Level 601 在 LEVELS 里的内部 id 是 12
  return false
}

/** 窗户的挂墙位姿：wx/wy 是玻璃面中心（贴地）的世界坐标，yaw 是 three.js rotation.y（让模型 +Z 朝屋内），n 是朝屋内的单位法线 */
export function windowMount(eng: Engine, s: Structure): { wx: number; wy: number; yaw: number; nx: number; ny: number } | null {
  const m = eng.map!
  const cx = s.x + 0.5 + OX(eng), cy = s.y + 0.5 + OY(eng)
  if (s.kind === 'glasswin') {
    const th = (Number(s.data?.deg) || 0) * Math.PI / 180
    // l4Meshes：玻璃在局部 z=0.39（朝窗外），屋内一侧是 -Z；实体放在内侧墙面 z=0.30
    const yaw = th + Math.PI
    return { wx: cx + Math.sin(th) * 0.3, wy: cy + Math.cos(th) * 0.3, yaw, nx: Math.sin(yaw), ny: Math.cos(yaw) }
  }
  let d: number | null = typeof s.data?.l2WallDir === 'number' ? Number(s.data.l2WallDir) : typeof s.data?.winDir === 'number' ? Number(s.data.winDir) : null
  if (d === null) {
    const nb: [number, number, number][] = [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]]
    for (const [dx, dy, k] of nb) { const x = s.x + dx, y = s.y + dy; if (x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[y * m.w + x] !== 1) { d = k; break } }
  }
  if (d === null) return null
  // structures.ts 的贴墙窗：d=0 北墙（玻璃朝南）…；off=0.04，实体再往屋内让 0.02，避免与普通窗户的窗框打架
  const o = 0.5 - 0.04 - 0.02
  const tab: [number, number, number][] = [[0, -o, 0], [o, 0, -Math.PI / 2], [0, o, Math.PI], [-o, 0, Math.PI / 2]]
  const [ox, oy, yaw] = tab[d & 3]
  return { wx: cx + ox, wy: cy + oy, yaw, nx: Math.sin(yaw), ny: Math.cos(yaw) }
}

const keyOf = (level: number, wx: number, wy: number) => `${level}:${Math.round(wx * 4)}:${Math.round(wy * 4)}`
const winOf = (e: Entity) => e.win as WinEntState | undefined
/** 玩家到玻璃面的距离（沿法线方向的前方距离 + 横向偏移合成） */
function distToGlass(eng: Engine, w: WinEntState): number {
  const p = eng.player
  return Math.hypot(p.x + OX(eng) - w.wx, p.y + OY(eng) - w.wy)
}
function inFront(eng: Engine, w: WinEntState): boolean {
  const p = eng.player
  return (p.x + OX(eng) - w.wx) * w.nx + (p.y + OY(eng) - w.wy) * w.ny > 0.05
}
function seesPlayer(eng: Engine, w: WinEntState): boolean {
  if (eng.dev.invisible) return false
  const p = eng.player
  if (Math.abs(p.z) > 1.6) return false
  return inFront(eng, w) && eng.los(w.wx + w.nx * 0.6 - OX(eng), w.wy + w.ny * 0.6 - OY(eng), p.x, p.y)
}
function setMode(w: WinEntState, mode: WinMode) { w.mode = mode; w.modeT = 0 }
function hint(eng: Engine, text: string, t = 3) { const r = eng.winRun; r.hint = text; r.hintT = t }

/** 被抓住的玩家正在被哪扇窗拖（movement 读它接管位置） */
export function windowCaptor(eng: Engine): Entity | null {
  const id = eng.winRun?.heldBy
  if (id === null || id === undefined) return null
  return eng.map?.entities.find((e) => e.id === id && !e.dead) ?? null
}

// ---------------------------------------------------------------- 世界层：登记表 / 生成 / 新生态

/** 每帧（effects post）：扫描普通窗户 → 按概率生成实体；新生态触发；默念与黑屏计时 */
export function stepWindowWorld(eng: Engine, dt: number): void {
  const r = eng.winRun, m = eng.map
  if (!r || !m || eng.over) return
  r.hintT = Math.max(0, r.hintT - dt)
  r.blackT = Math.max(0, r.blackT - dt)
  const level = eng.levelDef.id, style = winStyleOf(level)
  if (!style) { r.murmur = false; r.murmurT = 0; return }
  // 登记表里的时间推进（含未生成实体的窗：衰减照常）
  for (const [, g] of r.reg) if (g) tickReg(eng, g, dt)
  r.scanT -= dt
  if (r.scanT <= 0) { r.scanT = 0.5; scan(eng, style) }
  // 默念放在扫描之后：刚生成的窗户同一帧就要认得「你在默念」
  r.murmur = !!eng.specialHeld && murmurAvailable(eng)
  r.murmurT = r.murmur ? r.murmurT + dt : 0
  // 新生态：情绪极度不稳定 / 逃离威胁时
  r.newCd = Math.max(0, r.newCd - dt)
  r.newCheckT -= dt
  if (r.newCheckT <= 0) {
    r.newCheckT = WIN.NEW_CHECK
    if (r.newCd <= 0 && (eng.player.sanity < WIN.NEW_SAN || chased(eng)) && Math.random() < WIN.NEW_P && spawnNewborn(eng, style)) r.newCd = WIN.NEW_CD
  }
}
function chased(eng: Engine): boolean {
  const p = eng.player
  return !!eng.map?.entities.some((e) => !e.dead && (e.state === 'chase' || e.state === 'attack') && e.def.type !== 'windowent' && Math.hypot(e.x - p.x, e.y - p.y) < 15)
}
function tickReg(eng: Engine, g: WinReg, dt: number) {
  if (g.life === 'occupied') {
    g.sil -= WIN.SIL_DECAY * dt
    if (g.sil < WIN.DYING_AT) { g.life = 'dying'; g.lifeT = WIN.DYING_T; g.sil = 0 }
  } else if (g.life === 'newborn') {
    g.lifeT -= dt * (eng.winRun.murmur && nearestWindowD(eng, 'newborn') < WIN.MURMUR_R ? WIN.NEW_MURMUR_K : 1)
  } else if (g.life === 'dying') g.lifeT -= dt
}
function nearestWindowD(eng: Engine, life?: WinLife): number {
  let best = Infinity
  for (const e of eng.map?.entities ?? []) {
    const w = winOf(e); if (!w || e.dead || (life && w.reg.life !== life)) continue
    best = Math.min(best, distToGlass(eng, w))
  }
  return best
}
function scan(eng: Engine, style: WinStyle) {
  const m = eng.map!, r = eng.winRun, p = eng.player, level = eng.levelDef.id
  const P = WIN.SPAWN_P[level] ?? 0
  const live = new Map<string, Entity>()
  for (const e of m.entities) { const w = winOf(e); if (w && !e.dead) live.set(w.key, e) }
  // 收起远处的实体 / 已消失的窗
  for (const [k, e] of live) {
    const w = winOf(e)!
    if (w.reg.life === 'gone' || distToGlass(eng, w) > WIN.DESPAWN_R || (w.reg.life === 'newborn' && w.reg.lifeT <= 0 && distToGlass(eng, w) > 6)) {
      if (w.reg.life === 'newborn' && w.reg.lifeT <= 0) r.reg.set(k, null) // 新生态没人进来：回到普通窗户
      if (r.heldBy === e.id) r.heldBy = null
      e.dead = true; e.deathT = 0; live.delete(k)
    }
  }
  const seed = eng.mapSeed | 0
  for (const s of m.structures) {
    if (!isOrdinaryWindow(level, s)) continue
    if (Math.abs(s.x + 0.5 - p.x) > WIN.SPAWN_R || Math.abs(s.y + 0.5 - p.y) > WIN.SPAWN_R) continue
    const mt = windowMount(eng, s); if (!mt) continue
    const k = keyOf(level, mt.wx, mt.wy)
    let g = r.reg.get(k)
    if (g === undefined) {
      g = winHash(seed, Math.floor(s.x + OX(eng)), Math.floor(s.y + OY(eng)), level) < P
        ? { life: 'occupied', sil: WIN.SIL0[0] + (WIN.SIL0[1] - WIN.SIL0[0]) * winHash(seed, Math.floor(s.x + OX(eng)), Math.floor(s.y + OY(eng)), 7), lifeT: 0, seed: Math.floor(winHash(seed, Math.floor(s.x + OX(eng)), Math.floor(s.y + OY(eng)), 3) * 997) + 1 }
        : null
      r.reg.set(k, g)
    }
    const gone = g?.life === 'gone'
    if (!!s.data?.windowGone !== gone) {
      s.data = { ...s.data, windowGone: gone ? 1 : 0 }
      // The host has a small independent lifecycle rig; never rebuild the world here.
    }
    if (!g || gone || live.has(k)) continue
    if (Math.hypot(mt.wx - p.x - OX(eng), mt.wy - p.y - OY(eng)) > WIN.SPAWN_R) continue
    live.set(k, spawnWindow(eng, k, style, mt, g))
  }
}
function spawnWindow(eng: Engine, key: string, style: WinStyle, mt: { wx: number; wy: number; yaw: number; nx: number; ny: number }, reg: WinReg): Entity {
  const m = eng.map!
  const e = makeEntity('windowent', mt.wx + mt.nx * 0.25 - OX(eng), mt.wy + mt.ny * 0.25 - OY(eng), 0)
  e.hidden = false // Ambusher hides only its arm, never the window and its scenery.
  e.facing = Math.atan2(mt.ny, mt.nx)
  const w: WinEntState = { key, style, ...mt, reg, mode: reg.life === 'newborn' ? 'newborn' : reg.life === 'dying' ? 'dying' : 'idle', modeT: 0, cd: 0, lineT: 2, stripT: 1, dragD0: 1, prey: null }
  e.win = w
  m.entities.push(e)
  return e
}
/** 新生态：在玩家附近挑一扇还没被占据的普通窗户「醒来」 */
function spawnNewborn(eng: Engine, style: WinStyle): boolean {
  const m = eng.map!, r = eng.winRun, p = eng.player, level = eng.levelDef.id
  const cands: { s: Structure; mt: NonNullable<ReturnType<typeof windowMount>>; k: string }[] = []
  for (const s of m.structures) {
    if (!isOrdinaryWindow(level, s)) continue
    const mt = windowMount(eng, s); if (!mt) continue
    const d = Math.hypot(mt.wx - p.x - OX(eng), mt.wy - p.y - OY(eng))
    if (d < WIN.NEW_R[0] || d > WIN.NEW_R[1]) continue
    const k = keyOf(level, mt.wx, mt.wy)
    const g = r.reg.get(k)
    if (g) continue
    // 必须在玩家能看见的一侧（不然没人知道它醒了）
    if ((p.x + OX(eng) - mt.wx) * mt.nx + (p.y + OY(eng) - mt.wy) * mt.ny <= 0.3) continue
    if (!eng.los(mt.wx + mt.nx * 0.6 - OX(eng), mt.wy + mt.ny * 0.6 - OY(eng), p.x, p.y)) continue
    cands.push({ s, mt, k })
  }
  if (!cands.length) return false
  const c = cands[Math.floor(Math.random() * cands.length)]
  const g: WinReg = { life: 'newborn', sil: 0, lifeT: WIN.NEWBORN_T, seed: Math.floor(Math.random() * 997) + 1 }
  r.reg.set(c.k, g)
  for (const e of m.entities) if (winOf(e)?.key === c.k) { e.dead = true; e.deathT = 0 }
  spawnWindow(eng, c.k, style, c.mt, g)
  eng.msg(NEW_LINES[Math.floor(Math.random() * NEW_LINES.length)], 'lore')
  return true
}

// ---------------------------------------------------------------- 实体层：附影 / 新生 / 衰亡

/** entityAI 主循环里调用（替代通用 stationary 分支） */
export function updateWindowEntity(eng: Engine, e: Entity, dt: number): void {
  const w = winOf(e)
  if (!w) { e.dead = true; e.deathT = 0; return }
  const r = eng.winRun, p = eng.player, g = w.reg
  e.hidden = false
  e.hp = e.def.hp // 窗户本体不可伤害
  e.stunT = 0
  w.modeT += dt; w.cd = Math.max(0, w.cd - dt); w.lineT -= dt
  const d = distToGlass(eng, w)
  const sees = seesPlayer(eng, w)
  if (!e.encountered && sees && d < 8) recordEntityEncounter(e)
  e.state = w.mode === 'reach' || w.mode === 'drag' ? 'attack' : w.mode === 'lure' ? 'chase' : 'idle'
  // 生命周期变化（登记表在 world 层推进）
  if (g.life === 'dying' && w.mode !== 'dying' && w.mode !== 'vanish' && w.mode !== 'drag') setMode(w, 'dying')
  if (g.life === 'dying' && g.lifeT <= 0 && w.mode === 'dying') setMode(w, 'vanish')

  switch (w.mode) {
    case 'idle': case 'lure': {
      if (g.life !== 'occupied') break
      if (tryGrabEntity(eng, e, w)) break
      const luring = sees && d < WIN.LURE_R
      if (luring && w.mode === 'idle') { setMode(w, 'lure'); w.lineT = 0.8 }
      if (!luring && w.mode === 'lure' && w.modeT > 1.5) setMode(w, 'idle')
      if (w.mode === 'lure') {
        lureTick(eng, w, dt, false)
        const grabR = r.murmur ? WIN.GRAB_R_MURMUR : WIN.GRAB_R
        if (d < grabR && w.cd <= 0 && r.heldBy === null && !eng.dev.invisible) { setMode(w, 'reach'); audio.aggro(); eng.camShake = Math.min(1, eng.camShake + 0.25) }
      }
      break
    }
    case 'reach': {
      if (w.modeT >= WIN.REACH_T) {
        if (w.prey !== null) { setMode(w, 'feed'); break }
        const grabR = (r.murmur ? WIN.GRAB_R_MURMUR : WIN.GRAB_R) + WIN.GRAB_SLACK
        if (d < grabR && r.heldBy === null && sees) {
          setMode(w, 'drag'); r.heldBy = e.id; w.dragD0 = Math.max(WIN.DRAG_END + 0.1, d)
          eng.msg('一条漆黑的手臂从玻璃里伸出来，攥住了你的衣领！——用近战武器砍它！', 'damage')
          audio.hurt(); eng.camShake = Math.min(1, eng.camShake + 0.5)
          eng.emit({ kind: 'sanityhit' })
        } else { setMode(w, 'release'); w.cd = WIN.MISS_CD }
      }
      break
    }
    case 'drag': {
      if (r.heldBy !== e.id) { setMode(w, 'release'); w.cd = WIN.RELEASE_CD; break }
      p.sanity = Math.max(0, p.sanity - 3 * dt)
      if (w.modeT >= WIN.DRAG_T) { swallowPlayer(eng, e, w); setMode(w, 'feed') }
      break
    }
    case 'release': if (w.modeT >= WIN.RELEASE_T) setMode(w, 'idle'); break
    case 'feed': if (w.modeT >= WIN.FEED_T) { w.prey = null; setMode(w, g.life === 'occupied' ? 'idle' : 'newborn') } break
    case 'newborn': {
      if (g.life === 'occupied') { setMode(w, 'idle'); break }
      if (sees && d < WIN.LURE_R + 2) {
        lureTick(eng, w, dt, true)
        if (d < WIN.ENTER_R && r.heldBy === null && inFront(eng, w)) {
          eng.msg('你没多想，就跨过了窗台——', 'damage')
          swallowPlayer(eng, e, w)
          g.life = 'occupied'; g.sil = 1 // 人形 = 最后进入者
          setMode(w, 'feed')
        }
      }
      break
    }
    case 'dying': {
      if (d < WIN.STRIP_R && Math.abs(p.z) < 1.6) {
        w.stripT -= dt
        if (w.lineT <= 0) { w.lineT = 7; eng.msg('空气在这扇破碎的窗户周围起皱，像一张被揉过的纸。离远点。', 'damage') }
        if (w.stripT <= 0) {
          w.stripT = 1
          if (Math.random() < WIN.STRIP_P && !eng.dev.invisible) stripPlayer(eng, w)
        }
      }
      break
    }
    case 'vanish':
      if (w.modeT >= WIN.VANISH_T) { g.life = 'gone'; if (d < 12) eng.msg('那扇窗户消失了。墙上只剩一块颜色略浅的方形。', 'system'); e.dead = true; e.deathT = 0 }
      break
  }
}
function lureTick(eng: Engine, w: WinEntState, dt: number, newborn: boolean) {
  const r = eng.winRun, p = eng.player
  p.sanity = Math.max(0, p.sanity - WIN.LURE_SAN * (r.murmur ? WIN.MURMUR_SAN : 1) * dt)
  if (w.lineT <= 0) {
    w.lineT = r.murmur ? 9 : 5.5 + Math.random() * 2
    const pool = newborn ? NEW_LINES : LURE_LINES
    eng.msg(r.murmur ? '你在心里一遍遍默念。窗里的声音变远了。' : pool[Math.floor(Math.random() * pool.length)], 'lore')
    if (!r.murmur) hint(eng, '按住【特殊交互】默念，抵抗它的诱引', 4)
  }
}
/** 诱引：叠加在玩家移动输入上的拽力（movement 读它；默念时为 0） */
export function windowPull(eng: Engine): { x: number; y: number } {
  const r = eng.winRun, m = eng.map
  if (!r || !m || r.murmur || r.heldBy !== null) return { x: 0, y: 0 }
  let x = 0, y = 0
  for (const e of m.entities) {
    const w = winOf(e); if (!w || e.dead) continue
    const k = w.mode === 'lure' ? WIN.PULL : w.mode === 'newborn' ? WIN.PULL_NEW : 0
    if (!k || !seesPlayer(eng, w)) continue
    const p = eng.player
    const dx = w.wx - OX(eng) - p.x, dy = w.wy - OY(eng) - p.y, d = Math.hypot(dx, dy)
    if (d < 0.2 || d > WIN.LURE_R + 2) continue
    const f = k * clamp01(1.2 - d / (WIN.LURE_R + 2)) / 3.4 // 输入单位：1 = 走路速度 3.4m/s
    x += dx / d * f; y += dy / d * f
  }
  return { x, y }
}
/** 移动速度倍率（默念时变慢） */
export function windowSpeedMul(eng: Engine): number { return eng.winRun?.murmur ? WIN.MURMUR_SPEED : 1 }

/** 被抓：玩家位置由窗户接管（向玻璃按缓入曲线收拢）；返回 true = 本帧不走普通移动。攻击不锁（用来砍手臂挣脱） */
export function windowControlsPlayer(eng: Engine, dt: number): boolean {
  const e = windowCaptor(eng); const r = eng.winRun
  if (!e) { if (r && r.heldBy !== null) r.heldBy = null; return false }
  const w = winOf(e)!, p = eng.player
  if (w.mode !== 'drag') { r.heldBy = null; return false }
  const k = clamp01(w.modeT / WIN.DRAG_T)
  const want = w.dragD0 + (WIN.DRAG_END - w.dragD0) * k ** 2.2
  // 玩家相对玻璃中心：法线方向按曲线收拢到 want，横向偏移逐渐归零（被拉到窗户正前方）
  const gx = w.wx - OX(eng), gy = w.wy - OY(eng)
  const tx = -w.ny, ty = w.nx
  const lat = ((p.x - gx) * tx + (p.y - gy) * ty) * (1 - Math.min(1, dt * 3))
  p.x = gx + w.nx * want + tx * lat
  p.y = gy + w.ny * want + ty * lat
  p.vz = 0
  eng.seating = null
  return true
}
/** 近战命中判定：只有伸出来的手臂能被打中（reach/drag 中、离玩家够近、大致朝向窗户） */
export function windowHittable(eng: Engine, e: Entity): boolean {
  const w = winOf(e); if (!w) return false
  if (w.mode !== 'drag' && w.mode !== 'reach') return false
  const p = eng.player
  const d = distToGlass(eng, w)
  if (d > 2.6) return false
  const ang = Math.atan2(w.wy - OY(eng) - p.y, w.wx - OX(eng) - p.x)
  let diff = Math.abs(ang - p.facing); if (diff > Math.PI) diff = Math.PI * 2 - diff
  return diff < 1.3
}
/** killCheck 前置：窗户永不死亡；手臂被打中 = 松手缩回。返回 true 表示已处理 */
export function windowKillGuard(eng: Engine, e: Entity): boolean {
  const w = winOf(e); if (!w) return false
  e.hp = e.def.hp
  if (w.mode === 'drag' || w.mode === 'reach') {
    const wasHeld = eng.winRun.heldBy === e.id
    eng.winRun.heldBy = null
    setMode(w, 'release'); w.cd = WIN.RELEASE_CD
    audio.aggro(); eng.camShake = Math.min(1, eng.camShake + 0.3)
    eng.msg(wasHeld ? '你一下砍在那条手臂上——它猛地松开你，缩回了玻璃里。快走！' : '你砍中了伸出来的手臂，它缩了回去。', 'system')
    hint(eng, '离开它的视线范围，别回头', 3)
  }
  return true
}

/** 被拖入：大扣理智 + 扣部分生命（不致死）→ 出现在本层另一扇普通窗户旁 */
function swallowPlayer(eng: Engine, e: Entity, w: WinEntState) {
  const r = eng.winRun, p = eng.player
  r.heldBy = null
  r.blackT = 2.2
  p.sanity = Math.max(0, p.sanity - WIN.FEED_SAN)
  if (!eng.dev.god) p.hp = Math.max(1, p.hp - WIN.FEED_HP)
  eng.emit({ kind: 'damage' }); eng.emit({ kind: 'sanityhit' })
  audio.hurt(); eng.camShake = 1
  w.reg.sil = Math.min(1, w.reg.sil + WIN.SIL_FEED)
  const to = teleportTarget(eng, w)
  if (to) placePlayer(eng, to.x, to.y)
  eng.seating = null
  eng.msg('窗外的风景扑面而来——温暖、熟悉，然后碎成一片白。你在另一扇窗户下醒来，浑身发冷，像被什么东西尝过一口。（理智-' + WIN.FEED_SAN + '，生命-' + WIN.FEED_HP + '）', 'damage')
  void e
}
/** 传送目标：本层另一扇普通窗户（12–90m，屋内一侧可站）；找不到就随便一处远处的空地 */
function teleportTarget(eng: Engine, from: WinEntState): { x: number; y: number; z: number } | null {
  const m = eng.map!, level = eng.levelDef.id, p = eng.player
  const opts: { x: number; y: number }[] = []
  for (const s of m.structures) {
    if (!isOrdinaryWindow(level, s)) continue
    const mt = windowMount(eng, s); if (!mt) continue
    const g = eng.winRun.reg.get(keyOf(level, mt.wx, mt.wy)); if (g) continue // 已占据或消失的窗户都不能作为普通窗户落点
    const dd = Math.hypot(mt.wx - from.wx, mt.wy - from.wy)
    if (dd < WIN.TP_MIN || dd > WIN.TP_MAX) continue
    const x = mt.wx + mt.nx * 0.9 - OX(eng), y = mt.wy + mt.ny * 0.9 - OY(eng)
    if (standable(eng, x, y)) opts.push({ x, y })
  }
  if (opts.length) { const o = opts[Math.floor(Math.random() * opts.length)]; return { ...o, z: floorHeight(m, o.x, o.y, 0) } }
  for (let i = 0; i < 300; i++) {
    const x = 2 + Math.random() * (m.w - 4), y = 2 + Math.random() * (m.h - 4)
    if (Math.hypot(x - p.x, y - p.y) < WIN.TP_MIN || !standable(eng, x, y)) continue
    return { x, y, z: floorHeight(m, x, y, 0) }
  }
  return null
}
function standable(eng: Engine, x: number, y: number): boolean {
  const m = eng.map!
  const tx = Math.floor(x), ty = Math.floor(y)
  if (tx < 1 || ty < 1 || tx >= m.w - 1 || ty >= m.h - 1) return false
  if (m.tiles[ty * m.w + tx] !== 1) return false
  const z = floorHeight(m, x, y, 0)
  return Number.isFinite(z) && z > -1 && !m.liquid[ty * m.w + tx] && canOccupy(m, x, y, PLAYER_RADIUS, { z: z + .02, band: 0, crouch: false })
}
/** Clear the previous locomotion owner before a window displacement. */
function placePlayer(eng: Engine, x: number, y: number) {
  const p = eng.player
  Object.assign(p, { x, y, z: floorHeight(eng.map!, x, y, 0) + .02, vz: 0, floor: 0, crouching: false })
  eng.seating = eng.ride = eng.climb = eng.porchDrop = null; eng.onStairs = false
  eng.moveIt.acc = 0; resetSwim(eng.swim)
}
/** 衰亡态的空间剥离：被甩到本层远处（不走窗户），扣理智 */
function stripPlayer(eng: Engine, w: WinEntState) {
  const p = eng.player, m = eng.map!
  for (let i = 0; i < 300; i++) {
    const x = 2 + Math.random() * (m.w - 4), y = 2 + Math.random() * (m.h - 4)
    if (Math.hypot(x - p.x, y - p.y) < 25 || !standable(eng, x, y)) continue
    placePlayer(eng, x, y)
    break
  }
  p.sanity = Math.max(0, p.sanity - WIN.STRIP_SAN)
  eng.winRun.blackT = 1.4
  eng.camShake = 1; audio.hurt(); eng.emit({ kind: 'sanityhit' })
  eng.msg('世界像一层皮一样从你身上被揭了下来——再睁眼，你站在一个完全陌生的角落。（理智-' + WIN.STRIP_SAN + '）', 'damage')
  void w
}
/** 附影窗抓走贴近它的其它实体（维基：吞掉了追逐目击者的派对客） */
function tryGrabEntity(eng: Engine, e: Entity, w: WinEntState): boolean {
  if (w.cd > 0) return false
  const gx = w.wx - OX(eng), gy = w.wy - OY(eng)
  for (const q of eng.map!.entities) {
    if (q === e || q.dead || !WIN.GRAB_ENT_TYPES.includes(q.def.type)) continue
    if (Math.hypot(q.x - gx, q.y - gy) > WIN.GRAB_ENT_R) continue
    if ((q.x - gx) * w.nx + (q.y - gy) * w.ny <= 0) continue
    q.dead = true; q.deathT = 0
    w.prey = q.id; w.reg.sil = Math.min(1, w.reg.sil + WIN.SIL_FEED)
    setMode(w, 'reach'); w.cd = WIN.RELEASE_CD
    if (Math.hypot(eng.player.x - gx, eng.player.y - gy) < 16) eng.msg(`一条漆黑的手臂从窗户里伸出来，把${q.def.name}拖了进去。窗里的人影清晰了一些。`, 'damage')
    return true
  }
  return false
}

// ---------------------------------------------------------------- 默念 / 特殊交互 / HUD

/** 附近有附影窗（诱引中）或新生态窗：特殊交互键可用作「默念」 */
export function murmurAvailable(eng: Engine): boolean {
  const m = eng.map
  if (!m || !winStyleOf(eng.levelDef.id)) return false
  for (const e of m.entities) {
    const w = winOf(e); if (!w || e.dead) continue
    if ((w.reg.life === 'occupied' || w.reg.life === 'newborn') && distToGlass(eng, w) < WIN.MURMUR_R && inFront(eng, w)) return true
  }
  return false
}
/** HUD：被抓 / 默念 / 黑屏 / 诱引暖晕 */
export function windowOverlay(eng: Engine) {
  const r = eng.winRun
  const e = windowCaptor(eng), w = e ? winOf(e) : undefined
  let lure = 0
  for (const q of eng.map?.entities ?? []) {
    const ww = winOf(q); if (!ww || q.dead) continue
    if (ww.mode === 'lure' || ww.mode === 'newborn') lure = Math.max(lure, clamp01(1 - distToGlass(eng, ww) / (WIN.LURE_R + 2)))
  }
  return {
    grabbed: !!w && w.mode === 'drag',
    left: w && w.mode === 'drag' ? Math.max(0, WIN.DRAG_T - w.modeT) : 0,
    dragT: WIN.DRAG_T,
    murmur: !!r?.murmur,
    line: r?.murmur ? WIN_MANTRA[Math.floor(r.murmurT / 2.4) % WIN_MANTRA.length] : '',
    black: r ? clamp01(r.blackT / 1.2) : 0,
    lure: r?.murmur ? lure * 0.3 : lure,
    hint: r && r.hintT > 0 ? r.hint : '',
  }
}

/** 渲染层需要的状态（renderer/windowRender.ts） */
export function windowRenderState(e: Entity) {
  const w = winOf(e); if (!w) return null
  return { style: w.style, life: w.reg.life, mode: w.mode, modeT: w.modeT, sil: w.reg.sil, seed: w.reg.seed, wx: w.wx, wy: w.wy, yaw: w.yaw, decayK: w.reg.life === 'dying' ? 1 : 0 }
}
