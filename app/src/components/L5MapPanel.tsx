import { requestDevMapPreview, type DevMapPreview } from '@/game/engine/devMap'
// [l5map] L5 恐怖旅馆：黄铜罗盘小地图 + 纸质楼层导览大地图（分页 / 拖动 / 双指缩放 / 可折叠图例）
import { useEffect, useRef, useState } from 'react'
import type { Engine } from '@/game/engine'
import { look } from '@/game/core/renderer3d'
import { L5_ICONS, L5_ICON_KINDS, drawArrow, drawL5Plan, l5MapPages, l5RevealEnabled, mapHeadingFromLookYaw, pageKeyOf, pageTitle, visibleStaff, worldOrigin, l5MapPage, BRASS, INK, PAPER, type L5Icon } from '@/game/content/l5Map'
import { createMiniCache, drawL5Mini, MINI_STATS } from '@/game/content/l5MapMini'
import './L5MapPanel.css'

export function L5Minimap({ engine, size }: { engine: Engine; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const node = ref.current; if (!node) return
    const cache = createMiniCache()
    let raf = 0
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const dpr = Math.min(window.devicePixelRatio || 1, 2), px = Math.round(size * dpr)
      if (node.width !== px) { node.width = px; node.height = px }
      const g = node.getContext('2d'); if (!g) return
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawL5Mini(g, engine, cache, { size, dpr, yaw: look.yaw, now: performance.now() })
      node.dataset.redraws = String(MINI_STATS.redraws); node.dataset.page = pageKeyOf(engine) ?? ''
    }
    frame()
    return () => cancelAnimationFrame(raf)
  }, [engine, size])
  const key = pageKeyOf(engine) ?? 'f1'
  return <canvas ref={ref} data-minimap data-l5-minimap className="l5-minimap" style={{ width: size, height: size }} role="img" aria-label={`L5 楼层导览小地图：${pageTitle(key).no}，红色箭头为你，北向上`} />
}

function IconSwatch({ k, size = 22 }: { k: L5Icon; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2); c.width = size * dpr; c.height = size * dpr
    const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, size, size)
    L5_ICONS[k].draw(g, size / 2, size / 2, size * 0.36)
  }, [k, size])
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />
}
export function L5Legend({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const groups = ['通行', '房间与设施', '赌场', '员工 / 实体', '标记'] as const
  return <aside className={`l5map-legend${open ? ' is-open' : ''}`} data-l5-legend={open ? 'open' : 'closed'}>
    <button className="l5map-legend-toggle" onClick={onToggle} aria-expanded={open}>{open ? '图例 ▸ 收起' : '◂ 图例'}</button>
    {open && <div className="l5map-legend-body">
      {groups.map((gname) => <section key={gname}><h4>{gname}</h4>
        {L5_ICON_KINDS.filter((k) => L5_ICONS[k].group === gname).map((k) => <div className="l5map-key" key={k} data-icon={k}><IconSwatch k={k} /><span>{L5_ICONS[k].label}</span></div>)}
      </section>)}
      <section><h4>底图</h4>
        <div className="l5map-key"><i className="sw" style={{ background: '#ead2c0', borderColor: '#7a1f22' }} /><span>走廊（红地毯）</span></div>
        <div className="l5map-key"><i className="sw" style={{ background: '#efe2c4' }} /><span>客房 / 房间</span></div>
        <div className="l5map-key"><i className="sw" style={{ background: INK }} /><span>墙</span></div>
        <div className="l5map-key"><i className="sw sw-fog" /><span>未探索</span></div>
      </section>
      <p className="l5map-note">员工 / 实体只在视野内或已认识时显示。</p>
    </div>}
  </aside>
}

interface ViewState { key: string; cx: number; cy: number; scale: number }
export default function L5MapPanel({ engine, compact = false }: { engine: Engine; compact?: boolean }) {
  const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null)
  const curKey = pageKeyOf(engine) ?? 'f1'
  const pages = l5MapPages(engine)
  const [legend, setLegend] = useState(!compact)
  const [view, setView] = useState<ViewState>(() => centerOn(engine, curKey, compact ? 7 : 9))
  const [preview, setPreview] = useState<{ key: string; map: Engine['map']; data: DevMapPreview }>()
  const reveal = l5RevealEnabled(engine, view.key)
  const map = engine.map
  const viewRef = useRef(view); viewRef.current = view
  const [, tick] = useState(0)
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 400); return () => clearInterval(t) }, [])
  useEffect(() => {
    if (!reveal || !map?.inf) return
    const el = host.current
    if (!el) return
    const abort = new AbortController()
    const timeout = window.setTimeout(() => {
      const publish = (data: DevMapPreview) => {
        if (!abort.signal.aborted) setPreview({ key: view.key, map, data })
      }
      void requestDevMapPreview(engine, {
        x: view.cx, y: view.cy, span: Math.max(el.clientWidth, el.clientHeight) / view.scale, floor: 0,
      }, abort.signal, publish).catch(() => { /* The loaded floor stays available when a preview is cancelled. */ })
    }, 45)
    return () => { clearTimeout(timeout); abort.abort() }
  }, [engine, map, reveal, view])
  // 绘制
  useEffect(() => {
    const c = canvas.current, h = host.current; if (!c || !h) return
    const w = Math.max(200, h.clientWidth), hh = Math.max(200, h.clientHeight), dpr = Math.min(window.devicePixelRatio || 1, 2)
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hh * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr) }
    const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0)
    const v = { cx: view.cx, cy: view.cy, scale: view.scale, w, h: hh }
    const stats = drawL5Plan(g, engine, view.key, v, { sanity: engine.player.sanity, preview: reveal && preview?.map === map && preview.key === view.key ? preview.data.cells : undefined })
    if (view.key === curKey) {
      const { ox, oy } = worldOrigin(engine), sx = (x: number) => (x - v.cx) * v.scale + w / 2, sy = (y: number) => (y - v.cy) * v.scale + hh / 2
      const r = Math.max(6, Math.min(12, v.scale * 0.9))
      for (const e of visibleStaff(engine)) { L5_ICONS[e.k].draw(g, sx(e.x), sy(e.y), r); stats[e.k] = (stats[e.k] ?? 0) + 1 }
      drawArrow(g, sx(engine.player.x + ox), sy(engine.player.y + oy), r * 1.2, mapHeadingFromLookYaw(look.yaw))
    }
    c.dataset.page = view.key; c.dataset.stats = JSON.stringify(stats)
  })
  // 拖动 / 双指缩放 / 滚轮
  useEffect(() => {
    const c = canvas.current; if (!c) return
    const pts = new Map<number, { x: number; y: number }>()
    let pinch0 = 0, scale0 = 0
    const down = (e: PointerEvent) => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); scale0 = viewRef.current.scale } }
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId); if (!p) return
      if (pts.size === 1) { const dx = e.clientX - p.x, dy = e.clientY - p.y; setView((v) => ({ ...v, cx: v.cx - dx / v.scale, cy: v.cy - dy / v.scale })) }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 2 && pinch0 > 0) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); setView((v) => ({ ...v, scale: clampScale(scale0 * d / pinch0) })) }
    }
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0 }
    const wheel = (e: WheelEvent) => { e.preventDefault(); setView((v) => ({ ...v, scale: clampScale(v.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)) })) }
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up); c.addEventListener('wheel', wheel, { passive: false })
    return () => { c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up); c.removeEventListener('wheel', wheel) }
  }, [])
  const t = pageTitle(view.key)
  return <div className={`l5map${compact ? ' l5map--compact' : ''}`} data-l5-map>
    <header className="l5map-head">
      <div className="l5map-deco"><span className="l5map-rule" /><h2><b>{t.no}</b><small>{t.name}</small></h2><span className="l5map-rule" /></div>
      <div className="l5map-sub">THE HOTEL · 楼层导览 · 北向上</div>
    </header>
    <nav className="l5map-tabs" aria-label="楼层分页">
      {pages.map((k) => <button key={k} data-page={k} className={`${k === view.key ? 'is-on' : ''}${k === curKey ? ' is-here' : ''}`} onClick={() => setView(centerOn(engine, k, view.scale))}>{pageTitle(k).no}</button>)}
    </nav>
    <div className="l5map-body">
      <div className="l5map-canvas" ref={host}>
        <canvas ref={canvas} data-l5-bigmap role="img" aria-label={`L5 楼层导览：${t.no}`} />
        <div className="l5map-zoom">
          <button aria-label="放大" onClick={() => setView((v) => ({ ...v, scale: clampScale(v.scale * 1.25) }))}>＋</button>
          <button aria-label="缩小" onClick={() => setView((v) => ({ ...v, scale: clampScale(v.scale / 1.25) }))}>－</button>
          <button aria-label="回到我的位置" onClick={() => setView(centerOn(engine, curKey, view.scale))}>◎</button>
        </div>
      </div>
      <L5Legend open={legend} onToggle={() => setLegend((o) => !o)} />
    </div>
  </div>
}
const clampScale = (s: number) => Math.max(2.5, Math.min(28, s))
function centerOn(engine: Engine, key: string, scale: number): ViewState {
  if (key === pageKeyOf(engine)) { const { ox, oy } = worldOrigin(engine); return { key, cx: engine.player.x + ox, cy: engine.player.y + oy, scale } }
  if (key === 'casino') return { key, cx: 29, cy: 24, scale }
  const pg = l5MapPage(engine, key)
  const poi = pg ? [...pg.pois.values()].find((p) => p.k === 'elevator') ?? [...pg.pois.values()][0] : undefined
  if (poi) return { key, cx: poi.x, cy: poi.y, scale }
  const first = pg ? [...pg.cells.keys()][0] : undefined
  if (first) { const [cx, cy] = first.split(',').map(Number); return { key, cx: cx * 32 + 16, cy: cy * 32 + 16, scale } }
  return { key, cx: 0, cy: 0, scale }
}
export const L5_PAPER = PAPER, L5_BRASS = BRASS
