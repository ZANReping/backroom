// 背包/图鉴/状态/地图 覆盖层
import { useEffect, useRef, useState } from 'react'
import type { Engine, SlotRef, SlotWhere } from '@/game/engine'
import { ITEMS } from '@/game/items'
import { storage } from '@/game/storage'
import { ENTITIES, unlockTier, loadSeen } from '@/game/entities'
import { WIN_TAPES, LEVELS, levelNo } from '@/game/levels'
import { prefabsForLevel } from '@/game/prefabs'
import { infiniteImplFor } from '@/game/infinite'
import { CONTAINER_KINDS } from '@/game/mapgen'
import { ItemGlyph } from './HUD'
import AvatarPreview from './AvatarPreview'
import { loadAvatar } from '@/game/avatar'
import { audio } from '@/game/audio'
import { getKeybinds } from '@/game/keybinds'
import { DOCS } from '@/game/docs'
import DocOverlay from './DocOverlay'
import { ITEM_RARITY_LABEL, ITEM_RARITY_COLOR, type ItemRarity } from '@/game/items'
import { PHENOMENA, rarityText } from '@/game/phenomena'
import { IconIsolation, IconPlant, IconStamina } from './icons'

// 现象图标映射（phenomena.ts 中 def.icon → 具体 SVG 组件）
const PHEN_ICON = { isolation: IconIsolation, plant: IconPlant, flicker: IconStamina } as const

const ALL_TABS = ['背包', '图鉴', '状态', '地图', '日志'] as const
type InvTab = (typeof ALL_TABS)[number]

// 图鉴发现记录（持久化）
export function loadCodex(): Record<string, boolean> {
  try { return JSON.parse(storage.get('br_codex') ?? '{}') } catch { return {} }
}
export function saveCodex(c: Record<string, boolean>) {
  storage.set('br_codex', JSON.stringify(c))
}
export function discoverFromEngine(eng: Engine) {
  const c = loadCodex()
  c[`level_${eng.player.level}`] = true
  if (eng.map) {
    for (const e of eng.map.entities) c[e.def.type] = true
    for (const it of eng.map.items) c[it.type] = true
  }
  for (const s of [...eng.player.hotbar, ...eng.player.backpack]) if (s) c[s.type] = true
  saveCodex(c)
}

function BigMap({ engine }: { engine: Engine }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [zoom, setZoom] = useState(4)
  // v13 楼层契约（防御性读取，缺省不显示）
  const pf = (engine.player as unknown as { floor?: unknown }).floor
  const mf = (engine.map as unknown as { floors?: unknown } | null)?.floors
  const floorText = typeof pf === 'number' && Number.isFinite(pf) && typeof mf === 'number' && mf > 1
    ? `当前 ${Math.max(0, Math.floor(pf)) + 1}F / 共${Math.floor(mf)}层`
    : null
  useEffect(() => {
    const c = ref.current
    const m = engine.map
    if (!c || !m) return
    const size = Math.min(c.parentElement?.clientWidth ?? 400, 480)
    c.width = size; c.height = size
    const g = c.getContext('2d')!
    g.fillStyle = '#0a0908'; g.fillRect(0, 0, size, size)
    const s = zoom
    const px = engine.player.x, py = engine.player.y
    g.save()
    g.translate(size / 2 - px * s, size / 2 - py * s)
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++)
        if (engine.explored[y * m.w + x] && m.tiles[y * m.w + x] === 1) {
          g.fillStyle = '#3a3423'
          g.fillRect(x * s, y * s, s, s)
        }
    // ---- 标注（v32）：已探索区域内的容器 / 地面物品 / 出口（含名称）----
    // 容器：方框（亮=未搜刮，暗=已搜刮）
    for (const st of m.structures) {
      if (!CONTAINER_KINDS.includes(st.kind)) continue
      const idx = Math.floor(st.y + st.h / 2) * m.w + Math.floor(st.x + st.w / 2)
      if (idx < 0 || idx >= m.w * m.h || !engine.explored[idx]) continue
      g.fillStyle = st.looted ? 'rgba(160,140,90,0.35)' : '#c9a03a'
      g.fillRect((st.x + st.w / 2) * s - 2.5, (st.y + st.h / 2) * s - 2.5, 5, 5)
    }
    // 地面物品：小青点
    for (const it of m.items) {
      const idx = Math.floor(it.y) * m.w + Math.floor(it.x)
      if (idx < 0 || idx >= m.w * m.h || !engine.explored[idx]) continue
      g.fillStyle = '#6ad9c9'
      g.fillRect(it.x * s - 1, it.y * s - 1, 2.5, 2.5)
    }
    // 出口：金点 + 名称（楼梯类出口始终可见，其余需已发现）
    g.font = '9px monospace'
    g.textAlign = 'left'
    for (const e of m.exits) {
      const isStairs = e.def.kind === 'graystairs' || e.def.kind === 'graystairsup' || e.def.kind === 'stairs'
      if (!e.discovered && !isStairs) continue
      const ex = (e.x + 0.5) * s, ey = (e.y + 0.5) * s
      g.fillStyle = e.discovered ? '#f5e37a' : 'rgba(245,227,122,0.45)'
      g.beginPath(); g.arc(ex, ey, 3, 0, 7); g.fill()
      g.fillText(e.def.name, ex + 5, ey + 3)
    }
    g.fillStyle = '#e8b93c'
    g.beginPath(); g.arc(px * s, py * s, 4, 0, 7); g.fill()
    g.restore()
  }, [engine, zoom])
  return (
    <div className="flex flex-col items-center gap-2">
      <canvas ref={ref} style={{ imageRendering: 'pixelated', border: '1px solid var(--panel-edge)' }} />
      {floorText && <div className="font-mono2 text-[12px]" style={{ color: 'var(--amber)' }}>{floorText}</div>}
      <div className="flex gap-2">
        <button className="menu-btn px-4 py-1" onClick={() => setZoom((z) => Math.max(2, z - 1))}>－</button>
        <button className="menu-btn px-4 py-1" onClick={() => setZoom((z) => Math.min(10, z + 1))}>＋</button>
      </div>
      {/* 图例（v32） */}
      <div className="font-mono2 grid grid-cols-2 gap-x-5 gap-y-0.5 self-center text-[10px] md:grid-cols-3" style={{ color: 'var(--text-dim)' }}>
        <span><span style={{ color: '#e8b93c' }}>●</span> 玩家</span>
        <span><span style={{ color: '#f5e37a' }}>●</span> 出口（亮=已发现）</span>
        <span><span style={{ color: '#c9a03a' }}>■</span> 容器（未搜刮）</span>
        <span><span style={{ color: 'rgba(160,140,90,0.5)' }}>■</span> 容器（已搜刮）</span>
        <span><span style={{ color: '#6ad9c9' }}>·</span> 地面物品</span>
        <span><span style={{ color: '#3a3423' }}>■</span> 已探索地板</span>
      </div>
    </div>
  )
}

// 物品用途分类（图鉴筛选用）：投掷物 / 装备 / 消耗品 / 其他
const usageOf = (it: (typeof ITEMS)[string]): 'throw' | 'equip' | 'use' | 'other' =>
  it.throw ? 'throw' : it.equip ? 'equip' : it.use && it.use !== 'none' ? 'use' : 'other'

// 物品数值/属性/实际效果芯片（物品信息页专用 UI 元素，与描述文本分离）
function itemStatChips(it: (typeof ITEMS)[string], engine?: Engine): string[] {
  const chips: string[] = []
  if (it.weapon) chips.push(`近战伤害 ${it.weapon}`)
  if (it.use && it.use !== 'none') {
    const v = it.value ?? 0
    if (it.use === 'eat') chips.push(`饥饿 +${v}`)
    else if (it.use === 'heal') chips.push(`生命 +${v}`)
    else if (it.use === 'sanity') chips.push(`理智 ${v >= 0 ? '+' : ''}${v}`)
    else if (it.use === 'bigsanity') chips.push(`理智 +${v}`)
    else if (it.use === 'battery') chips.push(`电池 +${v}%`)
    else if (it.use === 'stamina') chips.push('体力回满 · 恢复翻倍 60s')
    else if (it.use === 'light') chips.push('放置临时光源')
  }
  if (it.throw) chips.push(`投掷：${{ explode: '范围伤害', shock: '电击+眩晕', noise: '声响引怪', lure: '引路者诱饵' }[it.throw]}`)
  if (it.passive) chips.push(`被动：${it.passive}`)
  if (it.equip) chips.push(`装备位：${{ offhand: '副手', body: '身体', gloves: '手套', head: '头饰', pocket: '口袋' }[it.equip]}`)
  // 特殊机制
  if (it.type === 'axe' && engine) chips.push(`耐久 ${engine.axeDur}/5`)
  if (it.type === 'squirtgun' && engine) chips.push(`储罐 ${engine.squirtAmmo}/27`)
  if (it.type === 'royalration') chips.push('成瘾 +180s/次', '25% 触发「全部吃光」：理智急速崩塌')
  if (it.type === 'warpberry') chips.push('食用后传送：首次发现层级')
  if (it.type === 'notebook') chips.push('使用：打开书写')
  chips.push(`堆叠 ×${it.stack}`)
  return chips
}

const FILTER_SEL_STYLE = { background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--panel-edge)', padding: '2px 4px' } as const

// 图鉴详情卡（实体渐进解锁 / 物品 / 层级）
function CodexDetail({ detail, onBack }: { detail: { kind: 'entity' | 'item' | 'level'; id: string }; onBack: () => void }) {
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex gap-2 text-[12px] leading-relaxed">
      <span className="font-mono2 w-16 shrink-0" style={{ color: 'var(--amber)' }}>{k}</span>
      <span style={{ color: 'var(--text-dim)' }}>{v}</span>
    </div>
  )
  return (
    <div className="anim-slideUp">
      <button className="font-mono2 mb-3 border px-3 py-1 text-[12px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--text-dim)' }} onClick={onBack}>← 返回图鉴</button>
      {detail.kind === 'entity' && (() => {
        const e = ENTITIES[detail.id]
        const tier = unlockTier(detail.id)
        const n = loadSeen()[detail.id] ?? 0
        return (
          <div className="hud-panel p-4">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="font-title text-[22px]" style={{ color: 'var(--blood)' }}>{e.name}</span>
              <span className="font-mono2 text-[11px]" style={{ color: 'var(--text-dim)' }}>{e.codex.no} · 遭遇 {n} 次</span>
            </div>
            <div className="mb-3 text-[13px] leading-relaxed" style={{ color: 'var(--text)' }}>{e.desc}</div>
            <div className="grid gap-2">
              <Row k="危害等级" v={e.codex.danger} />
              <Row k="栖息地" v={e.codex.habitat} />
              <Row k="行为" v={tier >= 2 ? e.codex.behavior : `【未解锁：再遭遇 ${3 - n} 次】`} />
              <Row k="应对方法" v={tier >= 3 ? e.codex.counter : `【未解锁：再遭遇 ${6 - n} 次】`} />
            </div>
            <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--panel-edge)' }}>
              <div className="font-mono2 mb-2 text-[11px]" style={{ color: 'var(--amber)' }}>M.E.G. 档案记录</div>
              {e.codex.lore.map((para, i) => (
                <p key={i} className="mb-2 text-[12px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>{para}</p>
              ))}
              <p className="mt-2 border-l-2 pl-2 text-[12px] italic" style={{ borderColor: 'var(--blood)', color: 'var(--text)' }}>{e.codex.sighting}</p>
            </div>
          </div>
        )
      })()}
      {detail.kind === 'item' && (() => {
        const it = ITEMS[detail.id]
        return (
          <div className="hud-panel p-4">
            <div className="mb-2 flex justify-center" style={{ color: 'var(--amber)' }}><ItemGlyph type={it.type} size={72} /></div>
            <div className="font-title mb-1 text-center text-[22px]" style={{ color: 'var(--amber)' }}>{it.name}</div>
            <div className="font-mono2 mb-2 text-center text-[11px]" style={{ color: 'var(--text-dim)' }}>
              <span style={{ color: it.anomalous ? 'var(--sanity)' : undefined }}>
                {it.anomalous ? '后室物品' : '普通物品'}
              </span>
              {' · '}<span style={{ color: ITEM_RARITY_COLOR[it.rarity ?? 'common'] }}>{ITEM_RARITY_LABEL[it.rarity ?? 'common']}</span>
              {' · '}{it.unique !== undefined ? `B${it.unique} 特有物品` : '通用补给'}
            </div>
            {/* 数值/属性/实际效果芯片（与描述分离） */}
            <div className="mb-3 flex flex-wrap justify-center gap-1">
              {itemStatChips(it).map((c) => (
                <span key={c} className="font-mono2 border px-1.5 py-0.5 text-[10px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--amber)', background: 'rgba(0,0,0,0.3)' }}>{c}</span>
              ))}
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>{it.desc}</p>
          </div>
        )
      })()}
      {detail.kind === 'level' && (() => {
        const lv = LEVELS[Number(detail.id)]
        // 该层曾经有的固定结构（prefab）与变种房间（无限层 chunk 变体，按层级取注册表）
        const fixed = lv.infinite ? [] : prefabsForLevel(lv.id).map((x) => x.name)
        const vimpl = lv.infinite ? infiniteImplFor(lv.id) : null
        const variants = vimpl ? vimpl.rareVariants : []
        return (
          <div className="hud-panel p-4">
            <div className="font-title mb-1 text-[22px]" style={{ color: 'var(--amber)' }}>Level {levelNo(lv.id)} · {lv.name}</div>
            <p className="mb-3 text-[13px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>{lv.lore ?? lv.flavor}</p>
            <div className="grid gap-2">
              <Row k="入口" v={lv.entrance} />
              {lv.exitDesc && <Row k="出口" v={<span style={{ color: 'var(--exit)' }}>{lv.exitDesc}</span>} />}
              <Row k="实体" v={lv.entities.map((e) => ENTITIES[e.type]?.name ?? e.type).join('、') || '官方未确认'} />
              {fixed.length > 0 && <Row k="固定结构" v={fixed.join('、')} />}
              {variants.length > 0 && <Row k="变种房间" v={variants.map((v) => vimpl!.variantNames[v] ?? v).join('、')} />}
            </div>
            {variants.length > 0 && (
              <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--panel-edge)' }}>
                <div className="font-mono2 mb-2 text-[11px]" style={{ color: 'var(--amber)' }}>变种房间档案（M.E.G. 结构异常记录）</div>
                {variants.map((v) => (
                  <div key={v} className="mb-3">
                    <div className="font-title mb-0.5 text-[15px]" style={{ color: 'var(--text)' }}>{vimpl!.variantNames[v] ?? v}</div>
                    {(vimpl!.variantLore[v] ?? []).map((para, i) => (
                      <p key={i} className="mb-1 text-[12px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>{para}</p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

// 日志页：本局全部播报的完整记录（HUD 只显示最近几条且单行截断，这里完整换行展示）
const LOG_KIND_COLOR: Record<string, string> = { loot: 'var(--amber)', damage: 'var(--blood)', lore: 'var(--sanity)', system: 'var(--text-dim)' }
const LOG_KIND_LABEL: Record<string, string> = { loot: '拾取', damage: '危险', lore: '档案', system: '系统' }
function LogTab({ engine }: { engine: Engine }) {
  const ref = useRef<HTMLDivElement>(null)
  // 打开时滚到底部（最新一条）
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight }, [])
  const logs = engine.msgLog
  if (logs.length === 0)
    return <div className="py-8 text-center text-[13px]" style={{ color: 'var(--text-dim)' }}>暂无播报。</div>
  return (
    <div ref={ref} className="max-h-[55dvh] space-y-1.5 overflow-y-auto pr-1">
      {logs.map((l, i) => (
        <div key={i} className="font-mono2 flex gap-2 text-[12px] leading-relaxed" style={{ color: LOG_KIND_COLOR[l.kind] ?? 'var(--text-dim)' }}>
          <span className="shrink-0" style={{ color: 'var(--text-dim)' }}>[{LOG_KIND_LABEL[l.kind] ?? l.kind}]</span>
          <span className="min-w-0" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>{l.text}</span>
        </div>
      ))}
    </div>
  )
}

interface DragState { from: SlotRef; type: string; count: number; x: number; y: number; target: SlotRef | null }
const isEquipW = (w: SlotWhere) => w === 'offhand' || w === 'body' || w === 'gloves' || w === 'head' || w === 'pocket'
const EQUIP_W_LABEL: Record<string, string> = { offhand: '副手', body: '身体', gloves: '手套', head: '头饰' }

export default function InventoryOverlay({ engine, onClose, codexOnly, initialTab }: { engine: Engine; onClose: () => void; codexOnly?: boolean; initialTab?: InvTab }) {
  const TABS = codexOnly ? (['图鉴'] as const) : ALL_TABS
  const [tab, setTab] = useState<InvTab>(codexOnly ? '图鉴' : (initialTab ?? '背包'))
  const [sel, setSel] = useState<SlotRef | null>(null)
  const [detail, setDetail] = useState<{ kind: 'entity' | 'item' | 'level'; id: string } | null>(null)
  // 图鉴分类子页面（实体/层级/物品/现象/文档）
  const [codexCat, setCodexCat] = useState<'实体' | '层级' | '物品' | '现象' | '文档'>('实体')
  // 图鉴「文档」分类的阅读视图（已解锁文档可重读）
  const [readingDoc, setReadingDoc] = useState<string | null>(null)
  // 图鉴物品筛选：类别（后室/普通）/ 来源（通用或 B 层特有）/ 用途 / 稀有度
  const [fAnom, setFAnom] = useState<'all' | 'anom' | 'norm'>('all')
  const [fSrc, setFSrc] = useState<string>('all')
  const [fUse, setFUse] = useState<'all' | 'use' | 'throw' | 'equip' | 'other'>('all')
  const [fRar, setFRar] = useState<'all' | ItemRarity>('all')
  const [, force] = useState(0)
  const p = engine.player
  const codex = loadCodex()
  const seen = loadSeen()
  const refresh = () => force((n) => n + 1)

  // ---- v13：拖拽交换（桌面鼠标 + 移动端触摸，统一走 Pointer Events）----
  // 点击判定：按下 <200ms 且位移 <10px 视为点击（保留原选中/使用逻辑），否则进入拖拽。
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const suppressClickUntil = useRef(0) // 拖拽/长按结束后短暂屏蔽 click（防止误触发选中或关闭遮罩）
  // dragRef 必须与 setDrag 同步更新（React flush 是异步的，否则快速连续的 拖拽→点击 会读到过期状态）
  const setDragSync = (d: DragState | null) => { dragRef.current = d; setDrag(d) }
  useEffect(() => () => { dragRef.current = null }, [])

  // 桌面端悬浮格（PC：悬浮即显示物品信息；悬浮时可用快捷丢弃/快捷使用/交互键直接操作该物品）
  const hoverRef = useRef<SlotRef | null>(null)
  // PC 左键锁定选中：锁定后鼠标移开仍保持选中（槽位带 ◈ 标记），再次左键同一物品取消锁定
  const [locked, setLocked] = useState<SlotRef | null>(null)
  const lockedRef = useRef<SlotRef | null>(null)
  const setLockedSync = (l: SlotRef | null) => { lockedRef.current = l; setLocked(l) }
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (codexOnly || tab !== '背包') return
      const h = hoverRef.current
      if (!h) return
      const s = engine.slotGet(h)
      if (!s) return
      const binds = getKeybinds()
      if (e.code === binds.quickdrop) {
        e.preventDefault()
        engine.dropSlot(h.w, h.i)
        audio.uiTick()
        refresh()
      } else if (e.code === binds.quickuse || e.code === binds.interact) {
        e.preventDefault()
        engine.useSlot(h.w, h.i)
        audio.uiTick()
        refresh()
      }
    }
    window.addEventListener('keydown', kd)
    return () => window.removeEventListener('keydown', kd)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, codexOnly, engine])

  const getSlot = (w: SlotWhere, i: number) => engine.slotGet({ w, i })

  const onSlotPointerDown = (e: React.PointerEvent, w: SlotWhere, i: number) => {
    const s = getSlot(w, i)
    if (!s) return // 空格无物可拖（v15：点击空格仅收起详情，不再作为交换目标）
    const start = { from: { w, i } as SlotRef, x: e.clientX, y: e.clientY, t: performance.now(), type: s.type, count: s.count }
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 10) return
        setSel(null)
        setDragSync({ from: start.from, type: start.type, count: start.count, x: ev.clientX, y: ev.clientY, target: null })
        return
      }
      // 命中检测：利用格子上的 data 属性定位目标格（非法目标=非格子区域，不响应）
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const slotEl = el?.closest?.('[data-inv-slot]') as HTMLElement | null
      let target: SlotRef | null = null
      if (slotEl) {
        const tw = slotEl.dataset.w as SlotWhere
        const ti = Number(slotEl.dataset.i)
        if (tw && !(tw === start.from.w && ti === start.from.i)) target = { w: tw, i: ti }
      }
      setDragSync({ ...d, x: ev.clientX, y: ev.clientY, target })
    }
    const finish = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      const d = dragRef.current
      if (d) {
        if (d.target && engine.moveSlot(d.from, d.target)) audio.pickup()
        refresh()
        setDragSync(null)
        // 仅屏蔽同一手势 pointerup 后立即派生的合成 click（不阻碍用户的下一次快速点击）
        suppressClickUntil.current = Date.now() + 120
      } else if (performance.now() - start.t >= 200) {
        suppressClickUntil.current = Date.now() + 120 // 长按不视为点击
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }
  const clickSuppressed = () => Date.now() < suppressClickUntil.current

  const slotBtn = (s: { type: string; count: number } | null, w: SlotWhere, i: number) => {
    const selected = sel && sel.w === w && sel.i === i
    const isLocked = !!(locked && locked.w === w && locked.i === i)
    const isTarget = !!drag?.target && drag.target.w === w && drag.target.i === i
    const isSource = !!drag && drag.from.w === w && drag.from.i === i
    return (
      <button
        key={`${w}${i}`}
        data-inv-slot="" data-w={w} data-i={i}
        className="relative flex items-center justify-center border"
        style={{
          width: 56, height: 56,
          touchAction: 'none', // 拖拽手势不从格子滚动页面（移动端 preventDefault 等效）
          borderColor: isTarget ? 'var(--amber)' : isLocked ? 'var(--amber)' : selected ? 'var(--amber)' : 'var(--panel-edge)',
          background: isTarget ? 'rgba(232,185,60,0.22)' : isLocked ? 'rgba(232,185,60,0.18)' : selected ? 'rgba(232,185,60,0.12)' : 'rgba(0,0,0,0.3)',
          boxShadow: isTarget ? '0 0 10px rgba(232,185,60,0.6), inset 0 0 6px rgba(232,185,60,0.4)' : isLocked ? '0 0 8px rgba(232,185,60,0.5), inset 0 0 6px rgba(232,185,60,0.35)' : 'none',
          transform: isTarget ? 'scale(1.08)' : 'none',
          opacity: isSource ? 0.35 : 1,
          transition: 'box-shadow 0.1s, transform 0.1s, opacity 0.1s',
        }}
        onPointerDown={(e) => onSlotPointerDown(e, w, i)}
        onMouseEnter={() => { if (s && !dragRef.current) { hoverRef.current = { w, i }; setSel({ w, i }) } }} // PC 悬浮即显示物品信息
        onMouseLeave={() => {
          if (hoverRef.current?.w === w && hoverRef.current?.i === i) hoverRef.current = null
          if (lockedRef.current) setSel(lockedRef.current) // 有锁定选中时，移开鼠标仍显示锁定物品
        }}
        onContextMenu={(e) => {
          e.preventDefault() // 移动端长按禁出系统菜单
          // PC：快捷使用键（默认右键）悬浮点击即快速使用该物品
          if (s && getKeybinds().quickuse === 'Mouse2') { engine.useSlot(w, i); audio.uiTick(); refresh() }
        }}
        onClick={() => {
          if (clickSuppressed()) return
          audio.uiTick()
          if (!s) { setSel(null); setLockedSync(null); return } // 点空格收起详情并解除锁定
          // 左键锁定选中；再次左键同一物品取消锁定
          if (lockedRef.current?.w === w && lockedRef.current?.i === i) setLockedSync(null)
          else { setLockedSync({ w, i }); setSel({ w, i }) }
        }}
      >
        {s && !isSource && (
          <>
            <ItemGlyph type={s.type} size={28} />
            {s.count > 1 && <span className="font-mono2 absolute bottom-0.5 right-1 text-[10px]" style={{ color: 'var(--amber)' }}>{s.count}</span>}
            {isLocked && <span className="font-mono2 absolute right-0.5 top-0 text-[9px]" style={{ color: 'var(--amber)' }}>◈</span>}
          </>
        )}
      </button>
    )
  }

  const selSlot = sel ? getSlot(sel.w, sel.i) : null
  const selDef = selSlot ? ITEMS[selSlot.type] : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: 'rgba(10,9,8,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => { if (!clickSuppressed()) onClose() }}>
      {/* 拖拽浮动图标：跟随指针，半透明放大，不拦截命中检测 */}
      {drag && (
        <div
          className="pointer-events-none fixed z-[70] flex items-center justify-center"
          style={{
            left: drag.x, top: drag.y,
            transform: 'translate(-50%, -50%) scale(1.25)',
            opacity: 0.85,
            filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.7))',
          }}
        >
          <div className="relative flex items-center justify-center border" style={{ width: 52, height: 52, borderColor: 'var(--amber)', background: 'rgba(20,17,12,0.85)' }}>
            <ItemGlyph type={drag.type} size={30} />
            {drag.count > 1 && <span className="font-mono2 absolute bottom-0.5 right-1 text-[10px]" style={{ color: 'var(--amber)' }}>{drag.count}</span>}
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-10">
        <span className="font-mono2 text-[40px]" style={{ color: 'var(--text)' }}>PAUSED</span>
      </div>
      <div
        className="hud-panel anim-slideUp max-h-[88dvh] w-full max-w-[720px] overflow-y-auto p-4 lg:max-w-[1024px] max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[85dvh] max-md:max-w-none"
        style={{ background: 'var(--panel)', minHeight: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex gap-4">
            {TABS.map((t) => (
              <button
                key={t}
                className="pb-1 text-[15px]"
                style={{ color: tab === t ? 'var(--amber)' : 'var(--text-dim)', borderBottom: tab === t ? '2px solid var(--amber)' : '2px solid transparent' }}
                onClick={() => { setTab(t); audio.uiTick() }}
              >
                {t}
              </button>
            ))}
          </div>
          <button className="font-mono2 border px-3 py-1 text-[12px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--text-dim)' }} onClick={onClose}>关闭</button>
        </div>

        {tab === '背包' && (
          // v20 修复：三栏仅在 lg（≥1024px）启用——720px 面板下中栏仅 ~226px，背包 8 列（476px）严重挤压重叠；
          // md 改两栏（详情面板下移整行），lg 面板加宽到 1024 后中栏 ~506px 才容得下 8×56px 格
          <div className="grid gap-4 md:grid-cols-[190px_1fr] lg:grid-cols-[200px_1fr_230px]">
            {/* 左栏：装备可视化（玩家模型实时反映手套/服饰；拖拽到装备位穿戴） */}
            <div className="hud-panel flex flex-col items-center gap-1 p-2">
              <div className="font-mono2 text-[11px]" style={{ color: 'var(--amber)' }}>装备</div>
              <AvatarPreview avatar={loadAvatar()} gloves={p.hasGloves} suit={p.hasSuit} divemask={p.equip.head?.type === 'divemask'} size={132} />
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {/* 主手：展示快捷栏当前选中项（非独立槽位，不可拖放） */}
                <div className="flex flex-col items-center gap-0.5">
                  <div
                    className="relative flex items-center justify-center border"
                    style={{ width: 56, height: 56, borderColor: 'var(--amber)', background: 'rgba(232,185,60,0.10)' }}
                    title="主手 = 快捷栏当前选中物品（数字键/滚轮切换）"
                  >
                    {p.hotbar[p.selected] && (
                      <>
                        <ItemGlyph type={p.hotbar[p.selected]!.type} size={28} />
                        {p.hotbar[p.selected]!.count > 1 && <span className="font-mono2 absolute bottom-0.5 right-1 text-[10px]" style={{ color: 'var(--amber)' }}>{p.hotbar[p.selected]!.count}</span>}
                      </>
                    )}
                  </div>
                  <span className="font-mono2 text-[9px]" style={{ color: 'var(--amber)' }}>主手</span>
                </div>
                {(['head', 'offhand', 'body', 'gloves'] as const).map((w) => (
                  <div key={w} className="flex flex-col items-center gap-0.5">
                    {slotBtn(getSlot(w, 0), w, 0)}
                    <span className="font-mono2 text-[9px]" style={{ color: 'var(--text-dim)' }}>{EQUIP_W_LABEL[w]}</span>
                  </div>
                ))}
                {p.equip.pockets.map((s, i) => (
                  <div key={`pk${i}`} className="flex flex-col items-center gap-0.5">
                    {slotBtn(s, 'pocket', i)}
                    <span className="font-mono2 text-[9px]" style={{ color: 'var(--text-dim)' }}>口袋{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="font-mono2 mb-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>快捷栏</div>
              <div className="mb-3 flex flex-wrap gap-1.5">{p.hotbar.map((s, i) => slotBtn(s, 'hotbar', i))}</div>
              <div className="font-mono2 mb-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>背包</div>
              {/* v20：移动端 4 列（242px 适配 390px 屏；原 6 列 366px 溢出），md 起 8 列×2 行 */}
              <div className="grid grid-cols-4 gap-1.5 md:grid-cols-8">{p.backpack.map((s, i) => slotBtn(s, 'backpack', i))}</div>
            </div>
            <div className="hud-panel p-3 md:col-span-2 lg:col-span-1">
              {selDef && selSlot && sel ? (
                <div className="flex flex-col gap-2">
                  <div className="flex justify-center" style={{ color: 'var(--amber)' }}><ItemGlyph type={selSlot.type} size={64} /></div>
                  <div className="font-title text-center text-[18px]" style={{ color: 'var(--text)' }}>{selDef.name}</div>
                  <div className="font-mono2 text-center text-[10px]" style={{ color: selDef.anomalous ? 'var(--sanity)' : 'var(--text-dim)' }}>
                    {selDef.anomalous ? '后室物品' : '普通物品'} · <span style={{ color: ITEM_RARITY_COLOR[selDef.rarity ?? 'common'] }}>{ITEM_RARITY_LABEL[selDef.rarity ?? 'common']}</span>
                  </div>
                  {/* 数值/属性/实际效果芯片（与描述分离） */}
                  <div className="flex flex-wrap justify-center gap-1">
                    {itemStatChips(selDef, engine).map((c) => (
                      <span key={c} className="font-mono2 border px-1.5 py-0.5 text-[10px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--amber)', background: 'rgba(0,0,0,0.3)' }}>{c}</span>
                    ))}
                  </div>
                  <div className="text-[13px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>{selDef.desc}</div>
                  {/* 滋水枪：储罐状态 + 装入液体（清水无需物品，杏仁水/腰果水消耗背包对应物品） */}
                  {selDef.type === 'squirtgun' && (
                    <div className="flex flex-col gap-1.5 border-t pt-2" style={{ borderColor: 'var(--panel-edge)' }}>
                      <div className="font-mono2 text-center text-[11px]" style={{ color: 'var(--amber)' }}>
                        储罐：{engine.squirtTank === 'none'
                          ? '空（0/27）'
                          : `${{ water: '清水', almond: '杏仁水', cashew: '腰果水' }[engine.squirtTank as 'water' | 'almond' | 'cashew']} ${engine.squirtAmmo}/27（约 ${Math.ceil(engine.squirtAmmo / 3)} 瓶）`}
                      </div>
                      <div className="font-mono2 text-center text-[10px]" style={{ color: 'var(--text-dim)' }}>
                        装入 1 瓶 = 3 份喷射 · 储罐只能装一种液体 · 右键/使用 = 自己喝一口
                      </div>
                      <div className="flex gap-1">
                        <button className="menu-btn flex-1 py-1 text-center text-[11px]" onClick={() => { engine.loadSquirt('water'); refresh() }}>装清水</button>
                        <button
                          className="menu-btn flex-1 py-1 text-center text-[11px]"
                          style={{ opacity: engine.hasItem('almond') ? 1 : 0.4 }}
                          onClick={() => { engine.loadSquirt('almond'); refresh() }}
                        >装杏仁水×{engine.countItem('almond')}</button>
                        <button
                          className="menu-btn flex-1 py-1 text-center text-[11px]"
                          style={{ opacity: engine.hasItem('cashew') ? 1 : 0.4 }}
                          onClick={() => { engine.loadSquirt('cashew'); refresh() }}
                        >装腰果水×{engine.countItem('cashew')}</button>
                      </div>
                    </div>
                  )}
                  {isEquipW(sel.w) && (
                    <div className="font-mono2 text-center text-[11px]" style={{ color: 'var(--amber)' }}>
                      已装备在【{sel.w === 'pocket' ? `口袋${sel.i + 1}` : EQUIP_W_LABEL[sel.w]}】{selDef.passive ? `——${selDef.passive}生效中` : ''}
                    </div>
                  )}
                  <div className="mt-auto flex gap-2">
                    {selDef.use && selDef.use !== 'none' && !isEquipW(sel.w) && (
                      <button className="menu-btn flex-1 py-1.5 text-center text-[13px]" onClick={() => { engine.useSlot(sel.w, sel.i); refresh() }}>使用</button>
                    )}
                    {isEquipW(sel.w) ? (
                      <button className="menu-btn flex-1 py-1.5 text-center text-[13px]" onClick={() => { engine.unequipSlot(sel.w, sel.i); setSel(null); refresh() }}>卸下</button>
                    ) : (
                      selDef.equip && (
                        <button
                          className="menu-btn flex-1 py-1.5 text-center text-[13px]"
                          onClick={() => { engine.equipItem(sel.w, sel.i); setSel(null); refresh() }}
                        >装备</button>
                      )
                    )}
                    <button className="menu-btn flex-1 py-1.5 text-center text-[13px]" onClick={() => { engine.dropSlot(sel.w, sel.i); setSel(null); refresh() }}>丢弃</button>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-[13px]" style={{ color: 'var(--text-dim)' }}>
                  点击物品查看详情<br />（拖拽物品到另一格可交换位置）
                </div>
              )}
            </div>
          </div>
        )}

        {tab === '图鉴' && (
          detail ? (
            <CodexDetail detail={detail} onBack={() => setDetail(null)} />
          ) : (
          <div>
            {/* 分类子页面切换：实体 / 层级 / 物品 / 现象 */}
            <div className="font-mono2 mb-2 flex gap-1 text-[11px]">
              {(['实体', '层级', '物品', '现象', '文档'] as const).map((c) => (
                <button
                  key={c}
                  className="border px-3 py-1"
                  style={{
                    borderColor: codexCat === c ? 'var(--amber)' : 'var(--panel-edge)',
                    color: codexCat === c ? 'var(--amber)' : 'var(--text-dim)',
                    background: 'color-mix(in srgb, var(--panel) 80%, transparent)',
                  }}
                  onClick={() => { setCodexCat(c); audio.uiTick() }}
                >
                  {c}
                </button>
              ))}
              <span className="ml-auto self-center text-[10px]" style={{ color: 'var(--text-dim)' }}>
                磁带 {p.tapes}/{WIN_TAPES} · 完成度 {Math.round((Object.keys(codex).length / (Object.keys(ITEMS).length + Object.keys(ENTITIES).length)) * 100)}%
              </span>
            </div>
            {codexCat === '实体' && (<>
            <div className="font-mono2 mb-1 text-[11px]" style={{ color: 'var(--amber)' }}>实体（按遭遇次数解锁档案）</div>
            <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              {Object.values(ENTITIES).map((e) => {
                const tier = unlockTier(e.type)
                const n = seen[e.type] ?? 0
                return (
                  <button
                    key={e.type}
                    className="hud-panel p-2 text-left transition-transform active:scale-95"
                    style={{ opacity: tier >= 1 ? 1 : 0.45, cursor: tier >= 1 ? 'pointer' : 'default' }}
                    onClick={() => { if (tier >= 1) { setDetail({ kind: 'entity', id: e.type }); audio.uiTick() } }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-title text-[15px]" style={{ color: tier >= 1 ? 'var(--blood)' : 'var(--text-dim)' }}>{tier >= 1 ? e.name : '？？？'}</div>
                      {tier >= 1 && <span className="font-mono2 text-[9px]" style={{ color: 'var(--text-dim)' }}>遭遇 {n}</span>}
                    </div>
                    <div className="text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>
                      {tier >= 1 ? e.desc : '尚未遭遇'}
                    </div>
                    {tier >= 1 && (
                      <div className="font-mono2 mt-1 flex gap-1 text-[9px]" style={{ color: 'var(--text-dim)' }}>
                        <span style={{ color: tier >= 1 ? 'var(--amber)' : undefined }}>外形</span>
                        <span style={{ color: tier >= 2 ? 'var(--amber)' : undefined }}>· 行为{tier < 2 ? `(${n}/3)` : ''}</span>
                        <span style={{ color: tier >= 3 ? 'var(--amber)' : undefined }}>· 应对{tier < 3 ? `(${n}/6)` : ''}</span>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
            </>)}
            {codexCat === '层级' && (<>
            <div className="font-mono2 mb-1 text-[11px]" style={{ color: 'var(--amber)' }}>层级档案</div>
            <div className="mb-3 grid gap-2">
              {LEVELS.map((lv) => {
                const unlocked = p.level >= lv.id || codex[`level_${lv.id}`]
                return (
                  <button
                    key={lv.id}
                    className="hud-panel p-2 text-left transition-transform active:scale-95"
                    style={{ opacity: unlocked ? 1 : 0.55 }}
                    onClick={() => { if (unlocked) { setDetail({ kind: 'level', id: String(lv.id) }); audio.uiTick() } }}
                  >
                    <div className="font-title text-[15px]" style={{ color: 'var(--amber)' }}>Level {levelNo(lv.id)} · {lv.name}</div>
                    <div className="text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>{lv.lore ?? lv.flavor}</div>
                    {unlocked && lv.exitDesc && <div className="mt-1 text-[11px]" style={{ color: 'var(--exit)' }}>{lv.exitDesc}</div>}
                  </button>
                )
              })}
            </div>
            </>)}
            {codexCat === '物品' && (<>
            <div className="font-mono2 mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span style={{ color: 'var(--amber)' }}>物品</span>
              <select value={fAnom} onChange={(e) => setFAnom(e.target.value as typeof fAnom)} style={FILTER_SEL_STYLE}>
                <option value="all">全部类别</option>
                <option value="anom">后室物品</option>
                <option value="norm">普通物品</option>
              </select>
              <select value={fSrc} onChange={(e) => setFSrc(e.target.value)} style={FILTER_SEL_STYLE}>
                <option value="all">全部来源</option>
                <option value="generic">通用</option>
                {[...new Set(Object.values(ITEMS).map((i) => i.unique).filter((u): u is number => u !== undefined))].sort((a, b) => a - b).map((u) => (
                  <option key={u} value={String(u)}>B{u} 特有</option>
                ))}
              </select>
              <select value={fUse} onChange={(e) => setFUse(e.target.value as typeof fUse)} style={FILTER_SEL_STYLE}>
                <option value="all">全部用途</option>
                <option value="use">消耗品</option>
                <option value="throw">投掷物</option>
                <option value="equip">装备</option>
                <option value="other">其他</option>
              </select>
              <select value={fRar} onChange={(e) => setFRar(e.target.value as typeof fRar)} style={FILTER_SEL_STYLE}>
                <option value="all">全部稀有度</option>
                <option value="common">常见</option>
                <option value="uncommon">少见</option>
                <option value="rare">稀有</option>
                <option value="epic">珍稀</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
              {Object.values(ITEMS)
                .filter((it) =>
                  (fAnom === 'all' || (fAnom === 'anom') === !!it.anomalous) &&
                  (fSrc === 'all' || (fSrc === 'generic' ? it.unique === undefined : it.unique === Number(fSrc))) &&
                  (fUse === 'all' || usageOf(it) === fUse) &&
                  (fRar === 'all' || (it.rarity ?? 'common') === fRar))
                .map((it) => (
                <button
                  key={it.type}
                  className="hud-panel flex flex-col items-center gap-1 p-2 transition-transform active:scale-95"
                  style={{ opacity: codex[it.type] ? 1 : 0.45, borderColor: codex[it.type] ? ITEM_RARITY_COLOR[it.rarity ?? 'common'] : undefined }}
                  onClick={() => { if (codex[it.type]) { setDetail({ kind: 'item', id: it.type }); audio.uiTick() } }}
                >
                  <ItemGlyph type={it.type} size={24} />
                  <div className="text-[11px]" style={{ color: 'var(--text)' }}>{codex[it.type] ? it.name : '？？？'}</div>
                  {codex[it.type] && (
                    <div className="font-mono2 text-[9px]" style={{ color: ITEM_RARITY_COLOR[it.rarity ?? 'common'] }}>{ITEM_RARITY_LABEL[it.rarity ?? 'common']}</div>
                  )}
                </button>
              ))}
            </div>
            {Object.values(ITEMS).filter((it) =>
              (fAnom === 'all' || (fAnom === 'anom') === !!it.anomalous) &&
              (fSrc === 'all' || (fSrc === 'generic' ? it.unique === undefined : it.unique === Number(fSrc))) &&
              (fUse === 'all' || usageOf(it) === fUse) &&
              (fRar === 'all' || (it.rarity ?? 'common') === fRar)).length === 0 && (
              <div className="font-mono2 py-4 text-center text-[11px]" style={{ color: 'var(--text-dim)' }}>没有符合筛选条件的物品</div>
            )}
            </>)}
            {codexCat === '现象' && (
            <div className="grid gap-2">
              <div className="font-mono2 mb-1 text-[11px]" style={{ color: 'var(--amber)' }}>现象（发生于后室内的种种怪诞而超自然的事件）</div>
              {Object.values(PHENOMENA).map((d) => {
                const Icon = PHEN_ICON[d.icon]
                const activeNow = engine.activePhenomena.includes(d.id)
                return (
                  <div key={d.id} className="hud-panel p-2">
                    <div className="flex items-center gap-2">
                      <span style={{ color: 'var(--sanity)' }}><Icon width={16} height={16} /></span>
                      <div className="font-title text-[15px]" style={{ color: 'var(--amber)' }}>{d.name}</div>
                      <span className="font-mono2 text-[10px]" style={{ color: 'var(--text-dim)' }}>罕见度：{rarityText(d)}</span>
                      {activeNow && <span className="font-mono2 ml-auto text-[10px]" style={{ color: 'var(--sanity)' }}>● 正在生效</span>}
                    </div>
                    <div className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>{d.desc}</div>
                  </div>
                )
              })}
            </div>
            )}
            {codexCat === '文档' && (
            <div className="grid gap-2">
              <div className="font-mono2 mb-1 text-[11px]" style={{ color: 'var(--amber)' }}>文档（查看过的 M.E.G. 文档会保存在这里，可反复阅读）</div>
              {Object.values(DOCS).map((d) => {
                const unlocked = !!codex[`doc_${d.id}`]
                return (
                  <button
                    key={d.id}
                    className="hud-panel p-2 text-left transition-transform active:scale-95"
                    style={{ opacity: unlocked ? 1 : 0.45, cursor: unlocked ? 'pointer' : 'default' }}
                    onClick={() => { if (unlocked) { setReadingDoc(d.id); audio.uiTick() } }}
                  >
                    <div className="flex items-baseline justify-between">
                      <div className="font-title text-[15px]" style={{ color: unlocked ? 'var(--amber)' : 'var(--text-dim)' }}>
                        {unlocked ? d.title : '？？？'}
                      </div>
                      <span className="font-mono2 text-[10px]" style={{ color: 'var(--text-dim)' }}>文档 {d.no}</span>
                    </div>
                    <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-dim)' }}>
                      {unlocked ? `${d.body.length} 个章节 · 点击阅读` : '尚未发现这份文档'}
                    </div>
                  </button>
                )
              })}
            </div>
            )}
          </div>
          )
        )}

        {tab === '状态' && (
          <div className="font-mono2 grid gap-x-8 gap-y-2 text-[13px] md:grid-cols-2" style={{ color: 'var(--text)' }}>
            <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>生命</span><span>{Math.round(p.hp)}/100</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>体力</span><span>{Math.round(p.stamina)}/100</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>饥饿</span><span>{Math.round(p.hunger)}/100</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>理智</span><span>{Math.round(p.sanity)}/100</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>深度</span><span>Level {levelNo(p.level)} · {LEVELS[p.level].name}</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>击杀数</span><span>{p.kills}</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>行走距离</span><span>{Math.round(p.steps)} 步</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-dim)' }}>存活时间</span><span>{Math.floor(p.aliveTime / 60)}分{Math.floor(p.aliveTime % 60)}秒</span></div>
            <div className="md:col-span-2">
              <span style={{ color: 'var(--text-dim)' }}>被动效果：</span>
              {[
                p.hasGloves && '隔热（免疫蒸汽）',
                p.hasSuit && '绝缘（免疫电弧）',
                p.hasLighter && '微光照明',
                p.hasRabbit && '幸运提升',
                p.coffeeT > 0 && `咖啡（${Math.ceil(p.coffeeT)}s）`,
              ].filter(Boolean).join('、') || '无'}
            </div>
            {/* 现象：当前层或玩家身上正在发生的超自然事件 */}
            <div className="md:col-span-2">
              <span style={{ color: 'var(--text-dim)' }}>现象：</span>
              {engine.activePhenomena.length === 0 && '无'}
            </div>
            {engine.activePhenomena.map((id) => {
              const d = PHENOMENA[id]
              if (!d) return null
              const Icon = PHEN_ICON[d.icon]
              return (
                <div key={id} className="flex items-start gap-2 md:col-span-2">
                  <span className="mt-0.5 shrink-0" style={{ color: 'var(--sanity)' }}><Icon width={14} height={14} /></span>
                  <span>
                    {d.name}
                    <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>（罕见度：{rarityText(d)}）</span>
                    <span className="block text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>{d.desc}</span>
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {tab === '地图' && <BigMap engine={engine} />}

        {tab === '日志' && <LogTab engine={engine} />}
      </div>
      {/* 图鉴「文档」阅读视图（盖在覆盖层之上；阻止点击冒泡误关背包） */}
      {readingDoc && (
        <div onClick={(e) => e.stopPropagation()}>
          <DocOverlay docId={readingDoc} onClose={() => setReadingDoc(null)} />
        </div>
      )}
    </div>
  )
}
