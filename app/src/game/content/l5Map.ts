import type { DevMapCell } from '../engine/devMap'
// [l5map] L5 恐怖旅馆专属地图：上世纪酒店楼层导览图风格（米黄纸 / 墨线墙 / 房间淡色块 / 走廊暗红描边）。
// 模型（探索记录 → 楼层分页存档）+ 统一矢量图标集（大小地图共用）+ 平面图绘制。其他层级不走这里。
// 探索记录：每页（B1 / 1F–12F / 大堂 / 赌场）按 32×32 区块存「瓦片类别」，进 HotelState.map（随存档往返）；
// 未记录 = 雾。要素（门 / 电梯 / 房间名…）只在其瓦片已探索时记录，记录后跨楼层保留。
import type { Engine } from '../engine'
import type { Structure } from '../core/types'
import { CS } from '../world/infinite'
import { l5RegionAt, L5_FLOORS, getL5Floor } from '../world/infiniteL5'
import { casinoLayout, type CasinoLayout } from './casinoLayout'
import { roomNumber } from '../engine/l5Hotel' // 门牌号与 updateHotel 同一函数（运行时调用，循环引用安全）

export const L5MAP_LEVELS = { hotel: 5, lobby: 118, casino: 119 } as const
export function isL5MapLevel(id: number) { return id === 5 || id === 118 || id === 119 }

// ---------------- 瓦片类别 ----------------
export const TC = { unknown: 0, wall: 1, corridor: 2, guest: 3, hall: 4, beverly: 5, dining: 6, maint: 7, lounge: 8, gym: 9, pool: 10, boiler: 11, nest: 12, floor: 13, casino: 14 } as const
export type TC = (typeof TC)[keyof typeof TC]
const VAR_TC: Record<string, TC> = { mainhall: TC.hall, beverly: TC.beverly, maintenance: TC.maint, dining: TC.dining, guestroom: TC.guest, lounge: TC.lounge, gym: TC.gym, pool: TC.pool, boilerroom: TC.boiler, mothnest: TC.nest }
/** 房间淡色块（纸面上的水彩填充） */
export const TC_FILL: Record<number, string> = {
  [TC.corridor]: '#ead2c0', [TC.guest]: '#efe2c4', [TC.hall]: '#f2dfae', [TC.beverly]: '#e3d0e6', [TC.dining]: '#f0d0b0',
  [TC.maint]: '#d8d6cc', [TC.lounge]: '#d6e2c8', [TC.gym]: '#d2dde6', [TC.pool]: '#c6dfe8', [TC.boiler]: '#d9c7b4', [TC.nest]: '#cfc3b8',
  [TC.floor]: '#ecdfc2', [TC.casino]: '#e6d2d8',
}
export const PAPER = '#efe4c8', PAPER_DARK = '#e2d4b0', INK = '#2b2219', CARPET_EDGE = '#7a1f22', BRASS = '#b48a3c'

// ---------------- 图标集 ----------------
export type L5Icon =
  | 'guestDoor' | 'ownRoom' | 'elevator' | 'serviceLift' | 'stairs' | 'lobbyDoor' | 'blackDoor' | 'beverly' | 'dining' | 'kitchen' | 'boiler'
  | 'puddle' | 'lounge' | 'phono' | 'casinoDoor' | 'cashier' | 'slot' | 'blackjack' | 'roulette' | 'craps' | 'exit' | 'player'
  | 'maid' | 'bellhop' | 'greeter' | 'chef' | 'beast' | 'jazz'
type Draw = (g: CanvasRenderingContext2D, x: number, y: number, r: number) => void
const circ = (g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke = INK, lw = 1) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); g.lineWidth = lw; g.strokeStyle = stroke; g.stroke() }
const rect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, stroke = INK, lw = 1) => { g.fillStyle = fill; g.fillRect(x, y, w, h); g.lineWidth = lw; g.strokeStyle = stroke; g.strokeRect(x, y, w, h) }
const glyph = (g: CanvasRenderingContext2D, x: number, y: number, r: number, t: string, col = INK) => { g.fillStyle = col; g.font = `bold ${Math.max(6, r * 1.25)}px Georgia, "Noto Serif CJK SC", serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y + r * 0.06) }
const badge = (fill: string, t: string, col = '#fff8e6'): Draw => (g, x, y, r) => { circ(g, x, y, r, fill, INK, Math.max(1, r * 0.14)); glyph(g, x, y, r, t, col) }
const staff = (fill: string, t: string): Draw => (g, x, y, r) => {
  g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath()
  g.fillStyle = fill; g.fill(); g.lineWidth = Math.max(1, r * 0.14); g.strokeStyle = INK; g.stroke(); glyph(g, x, y, r * 0.85, t, '#fff8e6')
}
export const L5_ICONS: Record<L5Icon, { label: string; group: '房间与设施' | '通行' | '赌场' | '员工 / 实体' | '标记'; draw: Draw }> = {
  guestDoor: { label: '客房门', group: '通行', draw: (g, x, y, r) => { rect(g, x - r * 0.45, y - r * 0.7, r * 0.9, r * 1.4, '#c9a46a', INK, Math.max(1, r * 0.12)); circ(g, x + r * 0.22, y, r * 0.1, INK) } },
  ownRoom: { label: '我的房间（房卡已绑定）', group: '标记', draw: (g, x, y, r) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) } g.closePath(); g.fillStyle = '#e8b93c'; g.fill(); g.lineWidth = Math.max(1, r * 0.14); g.strokeStyle = INK; g.stroke() } },
  elevator: { label: '电梯', group: '通行', draw: (g, x, y, r) => { rect(g, x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6, '#d8b46a', INK, Math.max(1, r * 0.14)); g.fillStyle = INK; g.beginPath(); g.moveTo(x - r * 0.4, y - r * 0.1); g.lineTo(x, y - r * 0.55); g.lineTo(x + r * 0.4, y - r * 0.1); g.fill(); g.beginPath(); g.moveTo(x - r * 0.4, y + r * 0.1); g.lineTo(x, y + r * 0.55); g.lineTo(x + r * 0.4, y + r * 0.1); g.fill() } },
  serviceLift: { label: '维护电梯（B1 · 1 · 6）', group: '通行', draw: (g, x, y, r) => { rect(g, x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6, '#9a9a8c', INK, Math.max(1, r * 0.14)); g.strokeStyle = INK; g.lineWidth = Math.max(1, r * 0.1); for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(x + i * r * 0.4, y - r * 0.7); g.lineTo(x + i * r * 0.4, y + r * 0.7); g.stroke() } } },
  stairs: { label: '楼梯', group: '通行', draw: (g, x, y, r) => { rect(g, x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6, '#e9d9b2', INK, Math.max(1, r * 0.14)); g.beginPath(); for (let i = 0; i < 4; i++) { g.moveTo(x - r * 0.8, y - r * 0.8 + (i + 1) * r * 0.32); g.lineTo(x + r * 0.8, y - r * 0.8 + (i + 1) * r * 0.32) } g.lineWidth = Math.max(1, r * 0.1); g.stroke() } },
  lobbyDoor: { label: '大堂门（出现后才标）', group: '通行', draw: (g, x, y, r) => { rect(g, x - r * 0.75, y - r * 0.8, r * 1.5, r * 1.6, '#d9a441', INK, Math.max(1, r * 0.14)); g.beginPath(); g.moveTo(x, y - r * 0.8); g.lineTo(x, y + r * 0.8); g.stroke(); glyph(g, x, y - r * 1.25, r * 0.55, '◆', '#7a1f22') } },
  blackDoor: { label: '黑门（只在 B1）', group: '通行', draw: (g, x, y, r) => { rect(g, x - r * 0.6, y - r * 0.85, r * 1.2, r * 1.7, '#0a0806', '#6b5a3a', Math.max(1, r * 0.16)) } },
  beverly: { label: '贝弗莉室', group: '房间与设施', draw: badge('#7c4a8c', 'B') },
  dining: { label: '餐厅', group: '房间与设施', draw: (g, x, y, r) => { circ(g, x, y, r, '#b0532e', INK, Math.max(1, r * 0.14)); g.strokeStyle = '#fff8e6'; g.lineWidth = Math.max(1, r * 0.14); g.beginPath(); g.moveTo(x - r * 0.35, y - r * 0.55); g.lineTo(x - r * 0.35, y + r * 0.55); g.moveTo(x + r * 0.35, y - r * 0.55); g.lineTo(x + r * 0.35, y + r * 0.55); g.stroke() } },
  kitchen: { label: '厨房', group: '房间与设施', draw: (g, x, y, r) => { rect(g, x - r * 0.8, y - r * 0.6, r * 1.6, r * 1.2, '#6d6a62', INK, Math.max(1, r * 0.14)); for (const dx of [-0.38, 0.38]) circ(g, x + dx * r, y, r * 0.26, '#d8492c', INK, Math.max(0.5, r * 0.08)) } },
  boiler: { label: '锅炉房', group: '房间与设施', draw: (g, x, y, r) => { circ(g, x, y, r, '#8a4a2a', INK, Math.max(1, r * 0.14)); g.fillStyle = '#ffb04a'; g.beginPath(); g.moveTo(x, y - r * 0.6); g.quadraticCurveTo(x + r * 0.55, y, x, y + r * 0.5); g.quadraticCurveTo(x - r * 0.55, y, x, y - r * 0.6); g.fill() } },
  puddle: { label: '水洼', group: '房间与设施', draw: (g, x, y, r) => { g.beginPath(); g.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); g.fillStyle = '#7fb6c8'; g.fill(); g.strokeStyle = '#2f5a6a'; g.lineWidth = Math.max(1, r * 0.12); g.stroke() } },
  lounge: { label: '休息室', group: '房间与设施', draw: badge('#4f7a46', 'L') },
  phono: { label: '留声机房（探索或触发后标）', group: '房间与设施', draw: (g, x, y, r) => { circ(g, x, y, r, '#2e2a26', INK, Math.max(1, r * 0.14)); g.beginPath(); g.moveTo(x - r * 0.15, y + r * 0.1); g.lineTo(x + r * 0.75, y - r * 0.6); g.lineTo(x + r * 0.75, y + r * 0.2); g.closePath(); g.fillStyle = '#e8b93c'; g.fill(); circ(g, x - r * 0.3, y + r * 0.35, r * 0.25, '#7a1f22', INK, Math.max(0.5, r * 0.08)) } },
  casinoDoor: { label: '赌场入口（Level 5.1）', group: '通行', draw: (g, x, y, r) => { rect(g, x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6, '#5b2a6e', '#e8b93c', Math.max(1, r * 0.16)); glyph(g, x, y, r * 0.9, '♠', '#e8b93c') } },
  cashier: { label: '兑换台', group: '赌场', draw: (g, x, y, r) => { rect(g, x - r * 0.85, y - r * 0.55, r * 1.7, r * 1.1, '#b48a3c', INK, Math.max(1, r * 0.14)); glyph(g, x, y, r * 0.8, '¤') } },
  slot: { label: '老虎机', group: '赌场', draw: (g, x, y, r) => { rect(g, x - r * 0.6, y - r * 0.85, r * 1.2, r * 1.7, '#3a7ab8', INK, Math.max(1, r * 0.14)); rect(g, x - r * 0.4, y - r * 0.4, r * 0.8, r * 0.45, '#fff8e6', INK, Math.max(0.5, r * 0.08)) } },
  blackjack: { label: '二十一点桌', group: '赌场', draw: (g, x, y, r) => { g.beginPath(); g.arc(x, y - r * 0.3, r, 0, Math.PI); g.closePath(); g.fillStyle = '#2f6e3c'; g.fill(); g.lineWidth = Math.max(1, r * 0.14); g.strokeStyle = INK; g.stroke(); glyph(g, x, y + r * 0.1, r * 0.6, '21', '#fff8e6') } },
  roulette: { label: '轮盘桌', group: '赌场', draw: (g, x, y, r) => { circ(g, x, y, r, '#2f6e3c', INK, Math.max(1, r * 0.14)); circ(g, x, y, r * 0.55, '#7a1f22', INK, Math.max(0.5, r * 0.08)); circ(g, x, y, r * 0.15, '#e8b93c', INK, 0.5) } },
  craps: { label: '骰子桌', group: '赌场', draw: (g, x, y, r) => { rect(g, x - r * 0.9, y - r * 0.6, r * 1.8, r * 1.2, '#2f6e3c', INK, Math.max(1, r * 0.14)); rect(g, x - r * 0.3, y - r * 0.3, r * 0.6, r * 0.6, '#fff8e6', INK, Math.max(0.5, r * 0.08)) } },
  exit: { label: '出口', group: '通行', draw: (g, x, y, r) => { circ(g, x, y, r, '#2f8a5a', INK, Math.max(1, r * 0.14)); g.fillStyle = '#fff8e6'; g.beginPath(); g.moveTo(x - r * 0.45, y - r * 0.2); g.lineTo(x + r * 0.05, y - r * 0.2); g.lineTo(x + r * 0.05, y - r * 0.55); g.lineTo(x + r * 0.6, y); g.lineTo(x + r * 0.05, y + r * 0.55); g.lineTo(x + r * 0.05, y + r * 0.2); g.lineTo(x - r * 0.45, y + r * 0.2); g.closePath(); g.fill() } },
  player: { label: '你的位置（箭头朝向）', group: '标记', draw: (g, x, y, r) => drawArrow(g, x, y, r, -Math.PI / 2) },
  maid: { label: '管家', group: '员工 / 实体', draw: staff('#5a6a7a', '管') },
  bellhop: { label: '行李员', group: '员工 / 实体', draw: staff('#a0322a', '李') },
  greeter: { label: '迎宾女郎', group: '员工 / 实体', draw: staff('#c0607a', '迎') },
  chef: { label: '厨师', group: '员工 / 实体', draw: staff('#8a6a3a', '厨') },
  beast: { label: '野兽', group: '员工 / 实体', draw: staff('#1e1a16', '兽') },
  jazz: { label: '爵士脑', group: '员工 / 实体', draw: staff('#3a4a8a', '爵') },
}
export const L5_ICON_KINDS = Object.keys(L5_ICONS) as L5Icon[]
export const STAFF_ICON: Record<string, L5Icon> = { maid: 'maid', bellhop: 'bellhop', greeter: 'greeter', chef: 'chef', beast: 'beast', jazz: 'jazz' }
export function drawArrow(g: CanvasRenderingContext2D, x: number, y: number, r: number, ang: number) {
  g.save(); g.translate(x, y); g.rotate(ang + Math.PI / 2)
  g.beginPath(); g.moveTo(0, -r); g.lineTo(r * 0.7, r * 0.75); g.lineTo(0, r * 0.35); g.lineTo(-r * 0.7, r * 0.75); g.closePath()
  g.fillStyle = '#c0282a'; g.fill(); g.lineWidth = Math.max(1, r * 0.16); g.strokeStyle = '#fff8e6'; g.stroke(); g.restore()
}
export function mapHeadingFromLookYaw(yaw: number) { return -yaw - Math.PI / 2 }

// ---------------- 分页 / 存档 ----------------
export interface L5Poi { k: L5Icon; x: number; y: number; n?: number } // 世界瓦片坐标（大堂 / 赌场即地图坐标）
export interface L5MapPageSave { s: number; c: [string, string][]; p: L5Poi[] }
export interface L5MapSave { v: 1; pages: Record<string, L5MapPageSave> }
interface Page { key: string; seed: number; cells: Map<string, Uint8Array>; pois: Map<string, L5Poi>; ver: number }
interface Runtime { pages: Map<string, Page>; dirty: Set<string>; acc: number; full: number }
const RT = new WeakMap<object, Runtime>()
/** 页键：f0（B1）… f12、lobby、casino */
export function pageKeyOf(eng: Engine): string | null {
  const id = eng.levelDef.id
  if (id === 5) return `f${eng.map?.inf?.l5Floor ?? getL5Floor()}` // 当前地图实际生成的楼层（换层过场中 hotel.floor 已改、地图还是旧的）
  if (id === 118) return 'lobby'
  if (id === 119) return 'casino'
  return null
}
export function pageTitle(key: string): { no: string; name: string } {
  if (key === 'lobby') return { no: '大堂', name: 'LOBBY · 前台' }
  if (key === 'casino') return { no: '5.1', name: 'CASINO · 赌场' }
  const f = Number(key.slice(1)), d = L5_FLOORS[f]
  return { no: d?.name ?? key, name: d?.theme ?? '' }
}
/** 分页顺序：B1、1F…12F（到访过的）、大堂、赌场（到访过才有）。13 楼不是可到达楼层（电梯按 13 = 消失事件），不出页。 */
export function l5MapPages(eng: Engine): string[] {
  const rt = runtime(eng), have = new Set(rt.pages.keys())
  for (const f of eng.hotelBook?.floors ?? []) if (L5_FLOORS[f]) have.add(`f${f}`)
  const cur = pageKeyOf(eng); if (cur) have.add(cur)
  const out: string[] = []
  for (let f = 0; f <= 12; f++) if (have.has(`f${f}`)) out.push(`f${f}`)
  if (have.has('lobby')) out.push('lobby')
  if (have.has('casino')) out.push('casino')
  return out
}
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s) }
const unb64 = (s: string) => { const t = atob(s), u = new Uint8Array(CS * CS); for (let i = 0; i < Math.min(t.length, u.length); i++) u[i] = t.charCodeAt(i) & 15; return u }
const PAGE_CHUNK_CAP = 400, PAGE_POI_CAP = 1500
function runtime(eng: Engine): Runtime {
  const h = eng.hotel as unknown as { map?: L5MapSave }
  let rt = RT.get(eng.hotel)
  if (!rt) {
    rt = { pages: new Map(), dirty: new Set(), acc: 0, full: 0 }
    for (const [key, ps] of Object.entries(h.map?.pages ?? {})) {
      const pg: Page = { key, seed: ps.s >>> 0, cells: new Map(), pois: new Map(), ver: 1 }
      for (const [ck, s] of ps.c ?? []) pg.cells.set(ck, unb64(s))
      for (const p of ps.p ?? []) if (L5_ICONS[p.k]) pg.pois.set(`${p.k}@${p.x},${p.y}`, { ...p })
      rt.pages.set(key, pg)
    }
    RT.set(eng.hotel, rt)
  }
  return rt
}
export function l5MapPage(eng: Engine, key: string): Page | undefined { return runtime(eng).pages.get(key) }
/** 把运行时记录写回 eng.hotel.map（可 JSON 往返）。只编码脏区块。 */
export function flushL5Map(eng: Engine) {
  const rt = runtime(eng), h = eng.hotel as unknown as { map?: L5MapSave }
  if (!rt.dirty.size && h.map) return
  const save: L5MapSave = h.map ?? { v: 1, pages: {} }
  for (const key of rt.dirty.size ? rt.dirty : rt.pages.keys()) {
    const pg = rt.pages.get(key); if (!pg) continue
    const old = new Map(save.pages[key]?.s === pg.seed ? save.pages[key].c : [])
    for (const [ck, cell] of pg.cells) old.set(ck, b64(cell))
    save.pages[key] = { s: pg.seed, c: [...old].slice(-PAGE_CHUNK_CAP), p: [...pg.pois.values()].slice(-PAGE_POI_CAP) }
  }
  rt.dirty.clear(); h.map = save
}
export function restoreL5MapSave(raw: unknown): L5MapSave | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Partial<L5MapSave>, pages: Record<string, L5MapPageSave> = {}
  for (const [k, p] of Object.entries(r.pages ?? {})) {
    if (!/^(f([0-9]|1[0-2])|lobby|casino)$/.test(k) || !p || typeof p !== 'object') continue
    pages[k] = { s: Number(p.s) >>> 0, c: Array.isArray(p.c) ? p.c.filter((e) => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string').slice(-PAGE_CHUNK_CAP) : [], p: Array.isArray(p.p) ? p.p.filter((q) => q && L5_ICONS[q.k as L5Icon] && Number.isFinite(q.x) && Number.isFinite(q.y)).slice(-PAGE_POI_CAP) : [] }
  }
  return { v: 1, pages }
}

// ---------------- 记录 ----------------
function pageFor(eng: Engine, rt: Runtime): Page | null {
  const key = pageKeyOf(eng), m = eng.map; if (!key || !m) return null
  const seed = (m.inf?.seed ?? eng.levelDef.id) >>> 0
  let pg = rt.pages.get(key)
  if (!pg || pg.seed !== seed) { pg = { key, seed, cells: new Map(), pois: new Map(), ver: 1 }; rt.pages.set(key, pg); rt.dirty.add(key) }
  return pg
}
export function worldOrigin(eng: Engine) { const inf = eng.map?.inf; return { ox: inf?.ox ?? 0, oy: inf?.oy ?? 0 } }
function classifyTile(level: number, seed: number | undefined, tile: number, wx: number, wy: number): TC {
  if (tile !== 1) return TC.wall
  if (level === 119) return TC.casino
  if (level !== 5 || seed === undefined) return TC.floor
  const reg = l5RegionAt(seed, wx, wy)
  return reg?.variant ? VAR_TC[reg.variant] ?? TC.floor : TC.corridor
}
function classify(eng: Engine, i: number): TC {
  const m = eng.map!, inf = m.inf
  return classifyTile(eng.levelDef.id, inf?.seed, m.tiles[i], i % m.w + (inf?.ox ?? 0), Math.floor(i / m.w) + (inf?.oy ?? 0))
}

export function l5RevealEnabled(eng: Engine, key: string) {
  return eng.devEnabled && eng.dev.mapReveal && key === pageKeyOf(eng)
}

export function l5TileReader(eng: Engine, key: string, preview?: readonly DevMapCell[]) {
  const pg = l5MapPage(eng, key), m = eng.map
  if (!m || !l5RevealEnabled(eng, key)) return (x: number, y: number) => cellAt(pg, x, y)
  const level = eng.levelDef.id, inf = m.inf, ox = inf?.ox ?? 0, oy = inf?.oy ?? 0
  const distant = new Map(preview?.map(c => [`${c.cx},${c.cy}`, c]))
  return (wx: number, wy: number): TC => {
    const x = wx - ox, y = wy - oy
    if (x >= 0 && x < m.w && y >= 0 && y < m.h) return classifyTile(level, inf?.seed, m.tiles[y * m.w + x], wx, wy)
    const cx = Math.floor(wx / CS), cy = Math.floor(wy / CS)
    const cell = distant.get(`${cx},${cy}`)
    return cell ? classifyTile(level, inf?.seed, cell.tiles[(wy - cy * CS) * CS + wx - cx * CS], wx, wy) : cellAt(pg, wx, wy)
  }
}
function setCell(pg: Page, wx: number, wy: number, c: TC): boolean {
  const cx = Math.floor(wx / CS), cy = Math.floor(wy / CS), ck = `${cx},${cy}`
  let cell = pg.cells.get(ck)
  if (!cell) { if (pg.cells.size >= PAGE_CHUNK_CAP) return false; cell = new Uint8Array(CS * CS); pg.cells.set(ck, cell) }
  const j = (wy - cy * CS) * CS + (wx - cx * CS)
  if (cell[j] === c) return false
  if (cell[j] !== TC.unknown && c === TC.wall) return false
  cell[j] = c; return true
}
export function cellAt(pg: Page | undefined, wx: number, wy: number): TC {
  if (!pg) return TC.unknown
  const cx = Math.floor(wx / CS), cy = Math.floor(wy / CS), cell = pg.cells.get(`${cx},${cy}`)
  return cell ? cell[(wy - cy * CS) * CS + (wx - cx * CS)] as TC : TC.unknown
}
const isExplored = (eng: Engine, i: number) => eng.explored[i] === 1 || (eng.levelDef.fullMap === true)
/** 扫描窗口（r = 半径瓦片；省略 = 整个窗口），新探索瓦片写类别；返回是否有变化 */
export function recordL5Map(eng: Engine, r?: number): boolean {
  const m = eng.map; if (!m || !isL5MapLevel(eng.levelDef.id)) return false
  const rt = runtime(eng), pg = pageFor(eng, rt); if (!pg) return false
  const { ox, oy } = worldOrigin(eng)
  const px = Math.floor(eng.player.x), py = Math.floor(eng.player.y)
  const x0 = r === undefined ? 0 : Math.max(0, px - r), x1 = r === undefined ? m.w - 1 : Math.min(m.w - 1, px + r)
  const y0 = r === undefined ? 0 : Math.max(0, py - r), y1 = r === undefined ? m.h - 1 : Math.min(m.h - 1, py + r)
  let changed = false
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * m.w + x
    if (!isExplored(eng, i)) continue
    if (cellAt(pg, x + ox, y + oy) !== TC.unknown) continue
    if (setCell(pg, x + ox, y + oy, classify(eng, i))) changed = true
  }
  if (recordPois(eng, pg, ox, oy)) changed = true
  if (changed) { pg.ver++; rt.dirty.add(pg.key) }
  return changed
}
function addPoi(pg: Page, k: L5Icon, x: number, y: number, n?: number) {
  const id = `${k}@${x},${y}`; if (pg.pois.has(id)) return false
  if (pg.pois.size >= PAGE_POI_CAP) return false
  pg.pois.set(id, n === undefined ? { k, x, y } : { k, x, y, n }); return true
}
/** 结构 → 图标（不含「我的房间」：按房卡实时判定） */
export function structIcon(_eng: Engine, s: Structure): L5Icon | null {
  const d = s.data as Record<string, unknown> | undefined
  switch (s.kind) {
    case 'hoteldoor': return d?.staff || d?.serviceEntry || d?.mothNest ? null : 'guestDoor'
    case 'elevdoor': return 'elevator'
    case 'hotelwindow': return d?.profile === 'serviceLift' ? 'serviceLift' : null
    case 'l5pocketdoor': return d?.pocket === 'lobby' ? 'lobbyDoor' : null
    case 'casinodoor': return 'casinoDoor'
    case 'l5puddle': return 'puddle'
    case 'phonograph': return d?.o18 ? 'phono' : null
    case 'chefprop': return d?.prop === 'stove' ? 'kitchen' : null
    default: return null
  }
}
const REGION_ICON: Partial<Record<number, L5Icon>> = { [TC.beverly]: 'beverly', [TC.dining]: 'dining', [TC.boiler]: 'boiler', [TC.lounge]: 'lounge' }
function exitIcon(eng: Engine, kind: string): L5Icon | null {
  if (kind === 'boilerdeep') return eng.levelDef.id === 5 && pageKeyOf(eng) === 'f0' ? 'blackDoor' : null // 黑门：只在 B1
  if (kind === 'elevatorshaft') return 'elevator'
  if (kind === 'oldstairs') return 'stairs'
  return 'exit'
}
function recordPois(eng: Engine, pg: Page, ox: number, oy: number): boolean {
  const m = eng.map!; let ch = false
  const seen = (x: number, y: number) => { const i = Math.floor(y) * m.w + Math.floor(x); return i >= 0 && i < m.tiles.length && isExplored(eng, i) }
  for (const s of m.structures) {
    const k = structIcon(eng, s); if (!k) continue
    const cx = Math.floor(s.x + s.w / 2), cy = Math.floor(s.y + s.h / 2)
    if (!seen(cx, cy)) continue
    const room = k === 'guestDoor' ? (s.data?.room ? Number(s.data.room) : m.inf ? roomNumber(m.inf.seed, Math.floor(s.x + ox), Math.floor(s.y + oy)) : undefined) : undefined
    if (addPoi(pg, k, cx + ox, cy + oy, room)) ch = true
  }
  for (const e of m.exits) {
    const k = exitIcon(eng, e.def.kind); if (!k || !seen(e.x, e.y)) continue
    if (addPoi(pg, k, Math.floor(e.x) + ox, Math.floor(e.y) + oy)) ch = true
  }
  if (eng.levelDef.id === 5 && m.inf) {
    // 房间名徽记：区域第一次被看到时记一次（中心点）
    const px = Math.floor(eng.player.x), py = Math.floor(eng.player.y)
    for (let dy = -6; dy <= 6; dy += 3) for (let dx = -6; dx <= 6; dx += 3) {
      const x = px + dx, y = py + dy; if (!seen(x, y)) continue
      const reg = l5RegionAt(m.inf.seed, x + ox, y + oy); if (!reg?.variant) continue
      const k = REGION_ICON[VAR_TC[reg.variant] ?? TC.unknown]; if (!k) continue
      if (addPoi(pg, k, Math.floor((reg.x0 + reg.x1) / 2), Math.floor((reg.y0 + reg.y1) / 2))) ch = true
    }
  }
  if (eng.levelDef.id === 119) for (const p of casinoPois()) if (addPoi(pg, p.k, p.x, p.y)) ch = true
  return ch
}
let CASINO: CasinoLayout | null = null
export function casinoLayoutCached() { return (CASINO ??= casinoLayout()) }
export function casinoPois(): L5Poi[] {
  const L = casinoLayoutCached(), out: L5Poi[] = []
  const map: Partial<Record<string, L5Icon>> = { cashier: 'cashier', slot: 'slot', blackjack: 'blackjack', roulette: 'roulette', craps: 'craps' }
  for (const p of L.props) { const k = map[p.kind]; if (k) out.push({ k, x: Math.floor(p.x), y: Math.floor(p.y) }) }
  out.push({ k: 'exit', x: Math.floor(L.door.x), y: Math.floor(L.door.y) })
  return out
}
/** 每帧挂在 updateHotel：0.25 s 扫玩家半径 24，4 s 扫整窗；2 s 编码脏区块进存档 */
export function stepL5Map(eng: Engine, dt: number) {
  if (!eng.map || !isL5MapLevel(eng.levelDef.id) || eng.transition) return // 过场中不记（防止旧地图写进新楼层页）
  const rt = runtime(eng)
  rt.acc += dt; rt.full += dt
  if (rt.acc < 0.25) return
  rt.acc = 0
  recordL5Map(eng, rt.full >= 4 ? undefined : 24)
  if (rt.full >= 4) { rt.full = 0; flushL5Map(eng) }
}

// ---------------- 绘制 ----------------
export interface L5View { cx: number; cy: number; scale: number; w: number; h: number } // 世界瓦片中心 + px/瓦片
export interface L5DrawOpts { mini?: boolean; sanity?: number; fog?: boolean; dpr?: number; preview?: readonly DevMapCell[] }
export function ownRoomNo(eng: Engine, key: string): number | null {
  const card = (eng.hotel as unknown as { objs?: { card?: { no: number; floor: number; dx?: number } } }).objs?.card
  if (!card || card.dx === undefined || key !== `f${card.floor}`) return null
  return card.no
}
/** 绘制平面图主体（纸 / 房间 / 墙 / 地毯描边 / 雾 / 要素图标）。返回绘制的图标统计（供自检）。 */
export function drawL5Plan(g: CanvasRenderingContext2D, eng: Engine, key: string, v: L5View, o: L5DrawOpts = {}): Record<string, number> {
  const pg = l5MapPage(eng, key), s = v.scale
  const wx0 = Math.floor(v.cx - v.w / 2 / s) - 1, wy0 = Math.floor(v.cy - v.h / 2 / s) - 1
  const wx1 = Math.ceil(v.cx + v.w / 2 / s) + 1, wy1 = Math.ceil(v.cy + v.h / 2 / s) + 1
  const sx = (wx: number) => (wx - v.cx) * s + v.w / 2, sy = (wy: number) => (wy - v.cy) * s + v.h / 2
  // 纸
  g.fillStyle = PAPER; g.fillRect(0, 0, v.w, v.h)
  const source = l5TileReader(eng, key, o.preview)
  const stride = wx1 - wx0 + 3, rows = wy1 - wy0 + 3
  const colors = new Uint8Array(stride * rows).fill(255)
  const read = (x: number, y: number): TC => {
    const i = (y - wy0 + 1) * stride + x - wx0 + 1
    if (colors[i] === 255) colors[i] = source(x, y)
    return colors[i] as TC
  }
  const casino = key === 'casino'
  // 赌场：布局本身就是导览图（营业时整张公开）
  if (casino) drawCasinoBase(g, v, sx, sy)
  else if (pg || l5RevealEnabled(eng, key)) {
    // 房间填充（按颜色批量）
    const byCol = new Map<string, number[]>()
    for (let y = wy0; y <= wy1; y++) for (let x = wx0; x <= wx1; x++) {
      const c = read(x, y); if (c === TC.unknown || c === TC.wall) continue
      const col = TC_FILL[c] ?? TC_FILL[TC.floor]; let a = byCol.get(col); if (!a) byCol.set(col, a = []); a.push(x, y)
    }
    for (const [col, a] of byCol) { g.fillStyle = col; g.beginPath(); for (let i = 0; i < a.length; i += 2) g.rect(sx(a[i]), sy(a[i + 1]), s + 0.6, s + 0.6); g.fill() }
    // 走廊地毯：暗红描边（走廊格与非走廊格交界处）
    g.strokeStyle = CARPET_EDGE; g.lineWidth = Math.max(1, s * 0.22); g.beginPath()
    const inset = s * 0.18
    for (let y = wy0; y <= wy1; y++) for (let x = wx0; x <= wx1; x++) {
      if (read(x, y) !== TC.corridor) continue
      const X = sx(x), Y = sy(y)
      if (read(x, y - 1) !== TC.corridor) { g.moveTo(X, Y + inset); g.lineTo(X + s, Y + inset) }
      if (read(x, y + 1) !== TC.corridor) { g.moveTo(X, Y + s - inset); g.lineTo(X + s, Y + s - inset) }
      if (read(x - 1, y) !== TC.corridor) { g.moveTo(X + inset, Y); g.lineTo(X + inset, Y + s) }
      if (read(x + 1, y) !== TC.corridor) { g.moveTo(X + s - inset, Y); g.lineTo(X + s - inset, Y + s) }
    }
    g.stroke()
    // 墙：墨线（墙格只画贴着已探索地面的一侧，像描出来的线）
    const wallPass = (dx: number, dy: number, alpha: number) => {
      g.globalAlpha = alpha; g.fillStyle = INK; g.beginPath()
      for (let y = wy0; y <= wy1; y++) for (let x = wx0; x <= wx1; x++) if (read(x, y) === TC.wall) g.rect(sx(x) + dx, sy(y) + dy, s + 0.5, s + 0.5)
      g.fill(); g.globalAlpha = 1
    }
    const ink = inkBleed(o.sanity)
    if (ink > 0) wallPass(ink * s * 0.35, -ink * s * 0.2, 0.18) // 低理智：墨迹错位（淡、细，不遮挡）
    wallPass(0, 0, 0.88)
    // 雾：未探索格 = 斜线雾
    if (o.fog !== false) drawFog(g, read, wx0, wy0, wx1, wy1, sx, sy, s, o.mini === true)
    if (ink > 0) inkBlots(g, v, ink, key)
  } else {
    if (o.fog !== false) { g.fillStyle = PAPER_DARK; g.fillRect(0, 0, v.w, v.h); hatch(g, 0, 0, v.w, v.h, 10) }
  }
  // 要素图标
  const stats: Record<string, number> = {}
  const own = ownRoomNo(eng, key)
  const r = o.mini ? Math.max(3, Math.min(5, s * 1.1)) : Math.max(5, Math.min(12, s * 0.9))
  const pois = pg ? [...pg.pois.values()] : casino ? casinoPois() : []
  const order = (k: L5Icon) => (k === 'guestDoor' ? 0 : k === 'puddle' ? 1 : 2)
  pois.sort((a, b) => order(a.k) - order(b.k))
  for (const p of pois) {
    if (!visiblePoi(eng, key, p)) continue
    const X = sx(p.x + 0.5), Y = sy(p.y + 0.5)
    if (X < -r * 2 || Y < -r * 2 || X > v.w + r * 2 || Y > v.h + r * 2) continue
    let k: L5Icon = p.k
    if (k === 'guestDoor' && own !== null && p.n === own) k = 'ownRoom'
    const rr = k === 'guestDoor' ? r * (o.mini ? 0.55 : 0.6) : k === 'ownRoom' ? r * 1.35 : r
    if (k === 'ownRoom') { g.save(); g.shadowColor = '#e8b93c'; g.shadowBlur = rr; L5_ICONS[k].draw(g, X, Y, rr); g.restore() } else L5_ICONS[k].draw(g, X, Y, rr)
    if (!o.mini && k === 'ownRoom') { g.font = `bold ${Math.round(r * 1.1)}px Georgia, serif`; g.fillStyle = '#7a1f22'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(String(p.n), X, Y - rr - 3) }
    stats[k] = (stats[k] ?? 0) + 1
  }
  return stats
}
/** 显示规则：黑门只在 B1；大堂门只在出现后（已记录）；留声机房记录即已探索或触发 */
export function visiblePoi(_eng: Engine, key: string, p: L5Poi) {
  if (p.k === 'blackDoor') return key === 'f0'
  return true
}
function drawFog(g: CanvasRenderingContext2D, read: (x: number, y: number) => TC, wx0: number, wy0: number, wx1: number, wy1: number, sx: (n: number) => number, sy: (n: number) => number, s: number, mini: boolean) {
  g.fillStyle = PAPER_DARK; g.beginPath()
  // 按行合并未知格
  for (let y = wy0; y <= wy1; y++) {
    let run: number | null = null // 世界坐标可为负：不能用 -1 当哨兵
    for (let x = wx0; x <= wx1 + 1; x++) {
      const unk = x <= wx1 && read(x, y) === TC.unknown
      if (unk && run === null) run = x
      if (!unk && run !== null) { g.rect(sx(run), sy(y), (x - run) * s + 0.5, s + 0.5); run = null }
    }
  }
  g.fill()
  g.save(); g.clip(); hatch(g, sx(wx0), sy(wy0), (wx1 - wx0 + 1) * s, (wy1 - wy0 + 1) * s, mini ? 6 : 9); g.restore()
}
function hatch(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, step: number) {
  g.strokeStyle = 'rgba(120,96,60,0.22)'; g.lineWidth = 1; g.beginPath()
  for (let t = -h; t < w; t += step) { g.moveTo(x + t, y + h); g.lineTo(x + t + h, y) }
  g.stroke()
}
/** 理智 < 40 才有；0..1（保守：最多 1 格的 35% 错位） */
export function inkBleed(sanity?: number) { return sanity === undefined || sanity >= 40 ? 0 : Math.min(1, (40 - sanity) / 40) }
function inkBlots(g: CanvasRenderingContext2D, v: L5View, k: number, key: string) {
  let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const n = Math.round(2 + k * 4)
  g.save(); g.globalAlpha = 0.12 + 0.1 * k; g.fillStyle = INK
  for (let i = 0; i < n; i++) {
    h = (h * 1103515245 + 12345) >>> 0; const x = (h % 1000) / 1000 * v.w
    h = (h * 1103515245 + 12345) >>> 0; const y = (h % 1000) / 1000 * v.h
    if (Math.hypot(x - v.w / 2, y - v.h / 2) < Math.min(v.w, v.h) * 0.22) continue // 不压玩家与正前方
    const rr = (4 + (h % 7)) * (v.w / 300 + 0.6)
    g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.arc(x + rr * 0.8, y + rr * 0.3, rr * 0.45, 0, Math.PI * 2); g.fill()
  }
  g.restore()
}
function drawCasinoBase(g: CanvasRenderingContext2D, v: L5View, sx: (n: number) => number, sy: (n: number) => number) {
  const L = casinoLayoutCached(), s = v.scale
  const carpet: Record<string, string> = { carpetFoyer: '#efd9b8', carpetCashier: '#ecd8a8', carpetSlots: '#e6cfd8', carpetTables: '#d8e2cc', carpetBar: '#ead0b8', carpetVip: '#e0cce6' }
  for (const f of L.floors) { g.fillStyle = carpet[f.carpet] ?? TC_FILL[TC.casino]; g.fillRect(sx(f.x0), sy(f.y0), (f.x1 - f.x0) * s, (f.y1 - f.y0) * s) }
  g.strokeStyle = CARPET_EDGE; g.lineWidth = Math.max(1, s * 0.15)
  for (const a of L.aisles) g.strokeRect(sx(a.x0), sy(a.y0), (a.x1 - a.x0) * s, (a.y1 - a.y0) * s)
  g.fillStyle = INK; g.globalAlpha = 0.88
  for (const w of L.walls) g.fillRect(sx(w.x0), sy(w.y0), Math.max(1.5, (w.x1 - w.x0) * s), Math.max(1.5, (w.y1 - w.y0) * s))
  g.globalAlpha = 1
  g.fillStyle = 'rgba(43,34,25,0.55)'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.font = `${Math.max(9, Math.min(15, s * 1.1))}px "Noto Serif CJK SC", Georgia, serif`
  if (s >= 6) for (const z of L.zones) g.fillText(z.name, sx((z.x0 + z.x1) / 2), sy(z.y0) + Math.max(9, s * 1.1))
}
/** 视野内 / 已知的员工与实体（只画当前页） */
export function visibleStaff(eng: Engine): { k: L5Icon; x: number; y: number }[] {
  const m = eng.map; if (!m) return []
  const { ox, oy } = worldOrigin(eng), out: { k: L5Icon; x: number; y: number }[] = []
  const met = new Set(eng.hotelBook?.met ?? [])
  for (const e of m.entities) {
    const k = STAFF_ICON[e.def.type]; if (!k || e.dead) continue
    const d = Math.hypot(e.x - eng.player.x, e.y - eng.player.y)
    const i = Math.floor(e.y) * m.w + Math.floor(e.x)
    const inSight = d < 10 && eng.explored[i] === 1
    const known = met.has(e.def.type) && d < 18 && eng.explored[i] === 1
    if (inSight || known) out.push({ k, x: e.x + ox, y: e.y + oy })
  }
  return out
}
