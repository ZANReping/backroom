// 背包/图鉴/状态/地图 覆盖层
import { useEffect, useRef, useState } from 'react'
import type { Engine, SlotRef, SlotWhere } from '@/game/engine'
import { ITEMS } from '@/game/items'
import { storage } from '@/game/storage'
import { ENTITIES, unlockTier, loadSeen } from '@/game/entities'
import { WIN_TAPES, LEVELS, levelNo } from '@/game/levels'
import { prefabsForLevel } from '@/game/prefabs'
import { RARE_VARIANTS, VARIANT_NAMES, VARIANT_LORE } from '@/game/infinite'
import { ItemGlyph } from './HUD'
import AvatarPreview from './AvatarPreview'
import { loadAvatar } from '@/game/avatar'
import { audio } from '@/game/audio'

const ALL_TABS = ['背包', '图鉴', '状态', '地图'] as const

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
    for (const e of m.exits) {
      if (!e.discovered) continue
      g.fillStyle = '#f5e37a'
      g.beginPath(); g.arc((e.x + 0.5) * s, (e.y + 0.5) * s, 4, 0, 7); g.fill()
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
    </div>
  )
}

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
            <div className="font-mono2 mb-3 text-center text-[11px]" style={{ color: 'var(--text-dim)' }}>
              {it.unique !== undefined ? `B${it.unique} 特有物品` : '通用补给'} · 堆叠上限 {it.stack}
              {it.weapon ? ` · 近战伤害 ${it.weapon}` : ''}
              {it.passive ? ` · 被动：${it.passive}` : ''}
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>{it.desc}</p>
          </div>
        )
      })()}
      {detail.kind === 'level' && (() => {
        const lv = LEVELS[Number(detail.id)]
        // 该层曾经有的固定结构（prefab）与变种房间（无限层 chunk 变体）
        const fixed = lv.infinite ? [] : prefabsForLevel(lv.id).map((x) => x.name)
        const variants = lv.infinite ? RARE_VARIANTS.map((v) => VARIANT_NAMES[v]) : []
        return (
          <div className="hud-panel p-4">
            <div className="font-title mb-1 text-[22px]" style={{ color: 'var(--amber)' }}>Level {levelNo(lv.id)} · {lv.name}</div>
            <p className="mb-3 text-[13px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>{lv.lore ?? lv.flavor}</p>
            <div className="grid gap-2">
              <Row k="入口" v={lv.entrance} />
              {lv.exitDesc && <Row k="出口" v={<span style={{ color: 'var(--exit)' }}>{lv.exitDesc}</span>} />}
              <Row k="实体" v={lv.entities.map((e) => ENTITIES[e.type]?.name ?? e.type).join('、') || '官方未确认'} />
              {fixed.length > 0 && <Row k="固定结构" v={fixed.join('、')} />}
              {variants.length > 0 && <Row k="变种房间" v={variants.join('、')} />}
            </div>
            {variants.length > 0 && (
              <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--panel-edge)' }}>
                <div className="font-mono2 mb-2 text-[11px]" style={{ color: 'var(--amber)' }}>变种房间档案（M.E.G. 结构异常记录）</div>
                {RARE_VARIANTS.map((v) => (
                  <div key={v} className="mb-3">
                    <div className="font-title mb-0.5 text-[15px]" style={{ color: 'var(--text)' }}>{VARIANT_NAMES[v]}</div>
                    {(VARIANT_LORE[v] ?? []).map((para, i) => (
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

interface DragState { from: SlotRef; type: string; count: number; x: number; y: number; target: SlotRef | null }
const isEquipW = (w: SlotWhere) => w === 'offhand' || w === 'body' || w === 'gloves' || w === 'pocket'
const EQUIP_W_LABEL: Record<string, string> = { offhand: '副手', body: '身体', gloves: '手套' }

export default function InventoryOverlay({ engine, onClose, codexOnly, initialTab }: { engine: Engine; onClose: () => void; codexOnly?: boolean; initialTab?: '背包' | '图鉴' | '状态' | '地图' }) {
  const TABS = codexOnly ? (['图鉴'] as const) : ALL_TABS
  const [tab, setTab] = useState<'背包' | '图鉴' | '状态' | '地图'>(codexOnly ? '图鉴' : (initialTab ?? '背包'))
  const [sel, setSel] = useState<SlotRef | null>(null)
  const [detail, setDetail] = useState<{ kind: 'entity' | 'item' | 'level'; id: string } | null>(null)
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
          borderColor: isTarget ? 'var(--amber)' : selected ? 'var(--amber)' : 'var(--panel-edge)',
          background: isTarget ? 'rgba(232,185,60,0.22)' : selected ? 'rgba(232,185,60,0.12)' : 'rgba(0,0,0,0.3)',
          boxShadow: isTarget ? '0 0 10px rgba(232,185,60,0.6), inset 0 0 6px rgba(232,185,60,0.4)' : 'none',
          transform: isTarget ? 'scale(1.08)' : 'none',
          opacity: isSource ? 0.35 : 1,
          transition: 'box-shadow 0.1s, transform 0.1s, opacity 0.1s',
        }}
        onPointerDown={(e) => onSlotPointerDown(e, w, i)}
        onContextMenu={(e) => e.preventDefault()} // 移动端长按禁出系统菜单
        onClick={() => {
          if (clickSuppressed()) return
          audio.uiTick()
          // v15：点击（短按）仅打开/收起物品详情卡，不再触发"选中-再点交换"；交换/移动只能通过拖拽
          if (!s) { setSel(null); return } // 点空格收起详情
          setSel(selected ? null : { w, i })
        }}
      >
        {s && !isSource && (
          <>
            <ItemGlyph type={s.type} size={28} />
            {s.count > 1 && <span className="font-mono2 absolute bottom-0.5 right-1 text-[10px]" style={{ color: 'var(--amber)' }}>{s.count}</span>}
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
              <AvatarPreview avatar={loadAvatar()} gloves={p.hasGloves} suit={p.hasSuit} size={132} />
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
                {(['offhand', 'body', 'gloves'] as const).map((w) => (
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
                  <div className="text-[13px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>{selDef.desc}</div>
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
            <div className="font-mono2 mb-2 text-[12px]" style={{ color: 'var(--text-dim)' }}>
              收集磁带 {p.tapes}/{WIN_TAPES} · 图鉴完成度 {Math.round((Object.keys(codex).length / (Object.keys(ITEMS).length + Object.keys(ENTITIES).length)) * 100)}% · 点击条目查看档案
            </div>
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
            <div className="font-mono2 mb-1 text-[11px]" style={{ color: 'var(--amber)' }}>物品</div>
            <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
              {Object.values(ITEMS).map((it) => (
                <button
                  key={it.type}
                  className="hud-panel flex flex-col items-center gap-1 p-2 transition-transform active:scale-95"
                  style={{ opacity: codex[it.type] ? 1 : 0.45 }}
                  onClick={() => { if (codex[it.type]) { setDetail({ kind: 'item', id: it.type }); audio.uiTick() } }}
                >
                  <ItemGlyph type={it.type} size={24} />
                  <div className="text-[11px]" style={{ color: 'var(--text)' }}>{codex[it.type] ? it.name : '？？？'}</div>
                </button>
              ))}
            </div>
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
          </div>
        )}

        {tab === '地图' && <BigMap engine={engine} />}
      </div>
    </div>
  )
}
