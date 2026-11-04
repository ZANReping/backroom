// [l5map] 小地图：黄铜边框方形罗盘（北向标记 + 玩家箭头）。平面图画进离屏缓存，只在
// 换页 / 锚点区块变化 / 探索记录变化（≥0.5 s 节流）/ 理智档位或房卡变化时重绘；每帧只做一次 drawImage + 少量图标。
import type { Engine } from '../engine'
import { BRASS, INK, L5_ICONS, drawArrow, drawL5Plan, inkBleed, l5MapPage, l5RevealEnabled, mapHeadingFromLookYaw, ownRoomNo, pageKeyOf, visibleStaff, worldOrigin } from './l5Map'

export const MINI_SPAN = 36 // 小地图可见瓦片数（边长）
const CACHE_SPAN = 80, SNAP = 16, MIN_REDRAW_MS = 500
export const MINI_STATS = { redraws: 0, frames: 0, ms: 0, last: 0 }
export interface MiniCache { plan: HTMLCanvasElement | null; frame: HTMLCanvasElement | null; frameSize: number; key: string; revealRev?: string; ax: number; ay: number; ver: number; ink: number; own: number | null; px: number; at: number }
export function createMiniCache(): MiniCache { return { plan: null, frame: null, frameSize: 0, key: '', ax: NaN, ay: NaN, ver: -1, ink: -1, own: null, px: 0, at: -1e9 } }
const mk = (w: number, h: number) => { const c = document.createElement('canvas') as HTMLCanvasElement; c.width = w; c.height = h; return c }

export function drawL5Mini(g: CanvasRenderingContext2D, eng: Engine, c: MiniCache, o: { size: number; dpr: number; yaw: number; now: number }) {
  const t0 = performance.now()
  const key = pageKeyOf(eng); if (!key) return
  const size = o.size, pad = Math.round(size * 0.07), inner = size - pad * 2
  const s = inner / MINI_SPAN // px / 瓦片（CSS 像素）
  const { ox, oy } = worldOrigin(eng)
  const wx = eng.player.x + ox, wy = eng.player.y + oy
  const ax = Math.round(wx / SNAP) * SNAP, ay = Math.round(wy / SNAP) * SNAP
  const ver = l5MapPage(eng, key)?.ver ?? 0
  const ink = Math.round(inkBleed(eng.player.sanity) * 4) / 4
  const own = ownRoomNo(eng, key)
  const px = Math.round(CACHE_SPAN * s * o.dpr)
  const revealRev = l5RevealEnabled(eng, key) ? [eng.mapRev, eng.map?.inf?.rev ?? 0].join(':') : undefined
  const structural = c.revealRev !== revealRev || c.key !== key || c.ax !== ax || c.ay !== ay || c.ink !== ink || c.own !== own || c.px !== px || !c.plan
  if (structural || (ver !== c.ver && o.now - c.at >= MIN_REDRAW_MS)) {
    if (!c.plan || c.px !== px) c.plan = mk(px, px)
    const pg = c.plan.getContext('2d') as CanvasRenderingContext2D
    pg.setTransform(o.dpr, 0, 0, o.dpr, 0, 0)
    drawL5Plan(pg, eng, key, { cx: ax, cy: ay, scale: s, w: CACHE_SPAN * s, h: CACHE_SPAN * s }, { mini: true, sanity: eng.player.sanity })
    Object.assign(c, { key, revealRev, ax, ay, ver, ink, own, px, at: o.now }); MINI_STATS.redraws++
  }
  if (!c.frame || c.frameSize !== size * o.dpr) { c.frame = drawFrame(size, pad, o.dpr); c.frameSize = size * o.dpr }
  // 平面图（缓存）
  g.clearRect(0, 0, size, size)
  g.save(); g.beginPath(); g.rect(pad, pad, inner, inner); g.clip()
  const half = CACHE_SPAN * s / 2
  const dx = pad + inner / 2 - ((wx - ax) * s + half), dy = pad + inner / 2 - ((wy - ay) * s + half)
  g.drawImage(c.plan!, dx, dy, CACHE_SPAN * s, CACHE_SPAN * s)
  // 员工 / 实体（视野内或已知）
  const r = Math.max(3, Math.min(5, s * 1.1))
  for (const e of visibleStaff(eng)) {
    const X = pad + inner / 2 + (e.x - wx) * s, Y = pad + inner / 2 + (e.y - wy) * s
    if (X > pad - r && Y > pad - r && X < pad + inner + r && Y < pad + inner + r) L5_ICONS[e.k].draw(g, X, Y, r)
  }
  drawArrow(g, pad + inner / 2, pad + inner / 2, Math.max(4.5, size * 0.045), mapHeadingFromLookYaw(o.yaw))
  g.restore()
  g.drawImage(c.frame, 0, 0, size, size)
  const dt = performance.now() - t0
  MINI_STATS.frames++; MINI_STATS.ms += dt; MINI_STATS.last = dt
}
/** 黄铜框 + 罗盘刻度 + N（离屏，只在尺寸变化时画） */
function drawFrame(size: number, pad: number, dpr: number) {
  const c = mk(Math.round(size * dpr), Math.round(size * dpr)), g = c.getContext('2d') as CanvasRenderingContext2D
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  const grad = g.createLinearGradient(0, 0, size, size)
  grad.addColorStop(0, '#e6c77a'); grad.addColorStop(0.45, BRASS); grad.addColorStop(1, '#6e5222')
  g.fillStyle = grad; g.beginPath(); g.rect(0, 0, size, size); g.rect(pad, pad, size - pad * 2, size - pad * 2); g.fill('evenodd')
  g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(0.5, 0.5, size - 1, size - 1); g.strokeRect(pad - 0.5, pad - 0.5, size - pad * 2 + 1, size - pad * 2 + 1)
  // 刻度
  g.strokeStyle = 'rgba(43,34,25,0.7)'
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, R = size / 2 - pad * 0.15, L = i % 4 === 0 ? pad * 0.7 : pad * 0.4
    const x = size / 2 + Math.cos(a) * R * 1.0, y = size / 2 + Math.sin(a) * R * 1.0
    const cx = Math.max(1, Math.min(size - 1, x)), cy = Math.max(1, Math.min(size - 1, y))
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx - Math.cos(a) * L, cy - Math.sin(a) * L); g.stroke()
  }
  // 北
  const nx = size / 2, ny = pad / 2
  g.fillStyle = '#7a1f22'; g.beginPath(); g.moveTo(nx, ny - pad * 0.45); g.lineTo(nx + pad * 0.55, ny + pad * 0.45); g.lineTo(nx - pad * 0.55, ny + pad * 0.45); g.closePath(); g.fill()
  g.fillStyle = '#fff3d0'; g.font = `bold ${Math.max(7, pad * 0.7)}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', nx, ny + pad * 0.12)
  // 四角铆钉
  for (const [x, y] of [[pad / 2, pad / 2], [size - pad / 2, pad / 2], [pad / 2, size - pad / 2], [size - pad / 2, size - pad / 2]]) { g.beginPath(); g.arc(x, y, Math.max(1.5, pad * 0.18), 0, Math.PI * 2); g.fillStyle = '#f2dc9a'; g.fill(); g.strokeStyle = INK; g.stroke() }
  return c
}
