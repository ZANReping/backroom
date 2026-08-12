// 触屏按键布局编辑器：拖拽移动控件、双指缩放（0.8–1.5×），按竖屏/横屏分别存 localStorage
import { useEffect, useMemo, useRef, useState } from 'react'
import { storage } from '@/game/core/storage'
import { IconFlashlight, IconBackpack, IconSprint, IconAttack, IconPause, IconJump, IconCrouch } from './icons'

export type TouchControlId = 'stick' | 'attack' | 'sprint' | 'flashlight' | 'backpack' | 'pause' | 'jump' | 'crouch'

/** 控件中心点（相对视口 0~1）与缩放 */
export interface TouchLayoutItem {
  x: number
  y: number
  scale: number
}

export type TouchLayoutMap = Partial<Record<TouchControlId, TouchLayoutItem>>

export interface TouchLayoutStore {
  portrait: TouchLayoutMap
  landscape: TouchLayoutMap
}

export const TOUCH_LAYOUT_KEY = 'br_touch_layout'
export const LAYOUT_MIN_SCALE = 0.8
export const LAYOUT_MAX_SCALE = 1.5

/** 控件基础直径（px）；stick 运行时会被 settings.stickSize 覆盖 */
export const CONTROL_SIZES: Record<TouchControlId, number> = {
  stick: 120,
  attack: 72,
  sprint: 56,
  flashlight: 56,
  backpack: 56,
  pause: 44,
  jump: 56,
  crouch: 56,
}

export const CONTROL_LABELS: Record<TouchControlId, string> = {
  stick: '摇杆',
  attack: '攻击/交互',
  sprint: '冲刺',
  flashlight: '手电',
  backpack: '背包',
  pause: '暂停',
  jump: '跳跃',
  crouch: '蹲伏',
}

export function loadTouchLayout(): TouchLayoutStore {
  try {
    const raw = storage.get(TOUCH_LAYOUT_KEY)
    if (!raw) return { portrait: {}, landscape: {} }
    const o = JSON.parse(raw) as Partial<TouchLayoutStore>
    return { portrait: o.portrait ?? {}, landscape: o.landscape ?? {} }
  } catch {
    return { portrait: {}, landscape: {} }
  }
}

export function saveTouchLayout(store: TouchLayoutStore): void {
  storage.set(TOUCH_LAYOUT_KEY, JSON.stringify(store))
}

/** 默认布局：与 TouchControls/HUD 的默认排布一致（右手模式；左撇子整体镜像） */
export function defaultTouchLayout(
  w: number,
  h: number,
  landscape: boolean,
  leftHanded: boolean,
): Record<TouchControlId, TouchLayoutItem> {
  const bottomEdge = h - (landscape ? 24 : 76) // 按钮组底边（对应 TouchControls 的 bottom 偏移）
  const p = (cx: number, cy: number): TouchLayoutItem => ({ x: cx / w, y: cy / h, scale: 1 })
  const map: Record<TouchControlId, TouchLayoutItem> = {
    backpack: p(w - (landscape ? 146 : 82), bottomEdge - 248),
    flashlight: p(w - (landscape ? 178 : 82), bottomEdge - (landscape ? 188 : 180)),
    crouch: p(w - (landscape ? 178 : 82), bottomEdge - (landscape ? 120 : 112)),
    sprint: p(w - 192, bottomEdge - (landscape ? 52 : 36)),
    jump: p(w - 124, bottomEdge - (landscape ? 44 : 36)),
    attack: p(w - 48, bottomEdge - 36),
    stick: { x: landscape ? 0.13 : 0.22, y: landscape ? 0.7 : 0.76, scale: 1 },
    pause: p(w - 42, 42), // HUD 右上暂停键中心
  }
  if (leftHanded) {
    for (const k of Object.keys(map) as TouchControlId[]) map[k] = { ...map[k], x: 1 - map[k].x }
  }
  return map
}

/** 约束在安全区内：控件整体不出屏幕（留 10px 边距） */
export function clampLayoutItem(item: TouchLayoutItem, size: number, w: number, h: number): TouchLayoutItem {
  const scale = Math.min(LAYOUT_MAX_SCALE, Math.max(LAYOUT_MIN_SCALE, item.scale))
  const r = (size * scale) / 2 + 10
  return {
    x: Math.min(Math.max(item.x, r / w), 1 - r / w),
    y: Math.min(Math.max(item.y, r / h), 1 - r / h),
    scale,
  }
}

export function clampLayoutMap(map: TouchLayoutMap, stickSize: number, w: number, h: number): TouchLayoutMap {
  const out: TouchLayoutMap = {}
  for (const k of Object.keys(map) as TouchControlId[]) {
    const it = map[k]
    if (!it) continue
    const size = k === 'stick' ? stickSize : CONTROL_SIZES[k]
    if (!size) continue // 未知控件 id（旧/新版本存档）：忽略，走默认位
    out[k] = clampLayoutItem(it, size, w, h)
  }
  return out
}

interface EditorProps {
  leftHanded: boolean
  stickSize: number
  onClose: (changed: boolean) => void
}

interface DragState {
  pointers: Map<number, { x: number; y: number }>
  pinchDist: number | null
  startScale: number
}

export default function LayoutEditor({ leftHanded, stickSize, onClose }: EditorProps) {
  const [, force] = useState(0)
  useEffect(() => {
    const fn = () => force((n) => n + 1)
    window.addEventListener('resize', fn)
    window.addEventListener('orientationchange', fn)
    return () => {
      window.removeEventListener('resize', fn)
      window.removeEventListener('orientationchange', fn)
    }
  }, [])

  const w = window.innerWidth
  const h = window.innerHeight
  const landscape = w > h
  const orientKey: keyof TouchLayoutStore = landscape ? 'landscape' : 'portrait'

  const defaults = useMemo(
    () => defaultTouchLayout(w, h, landscape, leftHanded),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [w, h, landscape, leftHanded],
  )

  const [map, setMap] = useState<Record<TouchControlId, TouchLayoutItem>>(() => {
    const saved = loadTouchLayout()[orientKey]
    // 过滤未知控件 id，避免旧/新存档破坏渲染（未知项走默认位）
    const known: TouchLayoutMap = {}
    for (const k of Object.keys(saved) as TouchControlId[]) if (CONTROL_SIZES[k]) known[k] = saved[k]
    const merged = { ...defaults, ...known }
    return clampLayoutMap(merged, stickSize, w, h) as Record<TouchControlId, TouchLayoutItem>
  })
  // cleared=true 表示“当前等于默认、保存时应清除自定义项”（初始无自定义或点了恢复默认）
  const [cleared, setCleared] = useState(() => Object.keys(loadTouchLayout()[orientKey]).length === 0)
  // 只持久化用户实际拖/缩过的控件；未改动的走默认排布
  const dirty = useRef<Set<TouchControlId>>(new Set())

  const gestures = useRef<Partial<Record<TouchControlId, DragState>>>({})

  const update = (id: TouchControlId, fn: (it: TouchLayoutItem) => TouchLayoutItem) => {
    dirty.current.add(id)
    setCleared(false)
    setMap((m) => {
      const size = id === 'stick' ? stickSize : CONTROL_SIZES[id]
      return { ...m, [id]: clampLayoutItem(fn(m[id]), size, window.innerWidth, window.innerHeight) }
    })
  }

  const onPointerDown = (id: TouchControlId) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    const g = gestures.current[id] ?? { pointers: new Map(), pinchDist: null, startScale: map[id].scale }
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (g.pointers.size === 2) {
      const [a, b] = [...g.pointers.values()]
      g.pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
      g.startScale = map[id].scale
    }
    gestures.current[id] = g
  }

  const onPointerMove = (id: TouchControlId) => (e: React.PointerEvent) => {
    const g = gestures.current[id]
    if (!g || !g.pointers.has(e.pointerId)) return
    e.preventDefault()
    const prev = g.pointers.get(e.pointerId)!
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (g.pointers.size >= 2) {
      // 双指捏合：缩放 0.8–1.5 倍
      const [a, b] = [...g.pointers.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (g.pinchDist && g.pinchDist > 0) {
        const ratio = dist / g.pinchDist
        const s0 = g.startScale
        update(id, (it) => ({ ...it, scale: Math.min(LAYOUT_MAX_SCALE, Math.max(LAYOUT_MIN_SCALE, s0 * ratio)) }))
      }
      return
    }
    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y
    update(id, (it) => ({ ...it, x: it.x + dx / window.innerWidth, y: it.y + dy / window.innerHeight }))
  }

  const onPointerUp = (id: TouchControlId) => (e: React.PointerEvent) => {
    const g = gestures.current[id]
    if (!g) return
    g.pointers.delete(e.pointerId)
    if (g.pointers.size < 2) g.pinchDist = null
    if (g.pointers.size === 0) delete gestures.current[id]
  }

  const persist = (next: TouchLayoutMap | null) => {
    const store = loadTouchLayout()
    if (next === null) delete store[orientKey]
    else store[orientKey] = next
    saveTouchLayout(store)
  }

  const handleSave = () => {
    const store = loadTouchLayout()
    if (cleared) {
      delete store[orientKey]
    } else {
      // 合并：已保存的自定义项 + 本次改动项
      const next: TouchLayoutMap = { ...(store[orientKey] ?? {}) }
      for (const id of dirty.current) {
        const size = id === 'stick' ? stickSize : CONTROL_SIZES[id]
        next[id] = clampLayoutItem(map[id], size, window.innerWidth, window.innerHeight)
      }
      if (Object.keys(next).length > 0) store[orientKey] = next
      else delete store[orientKey]
    }
    saveTouchLayout(store)
    onClose(true)
  }

  const handleReset = () => {
    persist(null) // 立即生效：游戏中回到默认排布
    dirty.current.clear()
    setMap(defaultTouchLayout(window.innerWidth, window.innerHeight, window.innerWidth > window.innerHeight, leftHanded))
    setCleared(true)
    force((n) => n + 1)
  }

  const renderControl = (id: TouchControlId) => {
    const it = map[id]
    const size = (id === 'stick' ? stickSize : CONTROL_SIZES[id]) * it.scale
    const iconPx = Math.round(size * 0.4)
    return (
      <div
        key={id}
        data-layout-id={id}
        className="absolute flex flex-col items-center"
        style={{
          left: it.x * w,
          top: it.y * h,
          transform: 'translate(-50%, -50%)',
          touchAction: 'none',
          zIndex: 10,
        }}
        onPointerDown={onPointerDown(id)}
        onPointerMove={onPointerMove(id)}
        onPointerUp={onPointerUp(id)}
        onPointerCancel={onPointerUp(id)}
      >
        <div
          className="flex items-center justify-center rounded-full border-2 border-dashed"
          style={{
            width: size,
            height: size,
            borderColor: 'var(--amber)',
            background: 'color-mix(in srgb, var(--panel) 72%, transparent)',
            color: 'var(--amber)',
            boxShadow: '0 0 12px rgba(232,185,60,0.35)',
          }}
        >
          {id === 'stick' && <div className="rounded-full" style={{ width: size * 0.4, height: size * 0.4, background: 'var(--panel-edge)' }} />}
          {id === 'attack' && <IconAttack width={iconPx} height={iconPx} />}
          {id === 'sprint' && <IconSprint width={iconPx} height={iconPx} />}
          {id === 'flashlight' && <IconFlashlight width={iconPx} height={iconPx} />}
          {id === 'backpack' && <IconBackpack width={iconPx} height={iconPx} />}
          {id === 'pause' && <IconPause width={iconPx} height={iconPx} />}
          {id === 'jump' && <IconJump width={iconPx} height={iconPx} />}
          {id === 'crouch' && <IconCrouch width={iconPx} height={iconPx} />}
        </div>
        <div className="font-mono2 mt-1 text-[11px]" style={{ color: 'var(--amber)', textShadow: '0 1px 2px #000' }}>
          {CONTROL_LABELS[id]}
        </div>
      </div>
    )
  }

  const btnStyle: React.CSSProperties = {
    borderColor: 'var(--panel-edge)',
    background: 'color-mix(in srgb, var(--panel) 88%, transparent)',
    color: 'var(--text)',
    touchAction: 'manipulation',
  }

  return (
    <div className="fixed inset-0 z-[60]" style={{ background: 'rgba(6,5,4,0.45)', touchAction: 'none' }}>
      {/* 顶部工具栏 */}
      <div
        className="absolute inset-x-0 top-0 z-20 flex flex-wrap items-center justify-between gap-2 px-3 py-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)', background: 'linear-gradient(rgba(6,5,4,0.85), transparent)', pointerEvents: 'none' }}
      >
        <div>
          <div className="font-title text-[17px]" style={{ color: 'var(--amber)' }}>
            自定义按键布局{landscape ? '（横屏）' : '（竖屏）'}
          </div>
          <div className="font-mono2 text-[11px]" style={{ color: 'var(--text-dim)' }}>
            拖动调整位置 · 双指缩放大小（0.8–1.5×）
          </div>
        </div>
        <div className="flex gap-2" style={{ pointerEvents: 'auto' }}>
          <button data-layout-action="reset" className="border px-3 py-2 text-[13px]" style={btnStyle} onClick={handleReset}>
            恢复默认
          </button>
          <button data-layout-action="cancel" className="border px-3 py-2 text-[13px]" style={{ ...btnStyle, color: 'var(--text-dim)' }} onClick={() => onClose(false)}>
            取消
          </button>
          <button data-layout-action="save" className="border px-3 py-2 text-[13px]" style={{ ...btnStyle, borderColor: 'var(--amber)', color: 'var(--amber)' }} onClick={handleSave}>
            保存
          </button>
        </div>
      </div>
      {(Object.keys(map) as TouchControlId[]).map(renderControl)}
    </div>
  )
}
