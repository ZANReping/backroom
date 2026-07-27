// 游戏 HUD（桌面 + 移动端自适应）
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Engine } from '@/game/engine'
import { ITEMS } from '@/game/items'
import { ENTITIES } from '@/game/entities'
import { WIN_TAPES, LEVELS, levelNo } from '@/game/levels'
import { seedString } from '@/game/rng'
import { look } from '@/game/renderer3d'
import { exitArrowRotation } from '@/game/guide'
import { CS } from '@/game/infinite'
import { audio } from '@/game/audio'
import { bindLabelFor } from '@/game/keybinds'
import { IconHP, IconStamina, IconHunger, IconSanity, IconBattery, IconPause, IconMap, IconInteract, IconCrouch } from './icons'

export interface LogEntry { id: number; text: string; kind: string; t: number }
export interface Toast { id: number; text: string }

interface Props {
  engine: Engine
  isMobile: boolean
  log: LogEntry[]
  toasts: Toast[]
  devMode: boolean
  fxScale: number // 减闪烁设置 0-1
  onPause: () => void
  onInventory: () => void
  onSelectSlot: (i: number) => void
  onUseSlot: (i: number) => void
}

function Bar({ color, value, icon, label, compact, critical }: { color: string; value: number; icon: React.ReactNode; label: string; compact: boolean; critical?: boolean }) {
  const low = value < 25
  return (
    <div className={`flex items-center gap-1.5 max-md:landscape:w-[76px] ${critical ? 'anim-shatter' : ''}`}>
      <span style={{ color, width: 14, height: 14, display: 'inline-flex' }}>{icon}</span>
      {!compact && <span className="font-mono2 w-8 text-[10px]" style={{ color: 'var(--text-dim)' }}>{label}</span>}
      <div className="relative h-[6px] flex-1 overflow-hidden rounded-sm" style={{ background: 'rgba(0,0,0,0.5)' }}>
        <div
          className={`h-full ${low ? 'anim-barPulse' : ''}`}
          style={{ width: `${value}%`, background: color, transition: 'width 0.3s ease' }}
        />
      </div>
      {!compact && <span className="font-mono2 w-9 text-right text-[10px]" style={{ color: 'var(--text-dim)' }}>{Math.round(value)}/100</span>}
    </div>
  )
}

// v7 高度/室外分档配色（防御性读取 engine.map.elev / engine.map.outdoor，缺省时按现状渲染）
export const MINIMAP_COLORS = { normal: '#3a3423', low: '#222b3d', high: '#5c4d24', outdoor: '#1d3a3a' }

/** 防御性读取 v7 地图扩展字段（长度校验，坏数据直接降级） */
function mapZData(m: Engine['map']): { elev?: Uint8Array; outdoor?: Uint8Array } {
  if (!m) return {}
  const n = m.w * m.h
  const mm = m as unknown as { elev?: unknown; outdoor?: unknown }
  const elev = mm.elev instanceof Uint8Array && mm.elev.length >= n ? mm.elev : undefined
  const outdoor = mm.outdoor instanceof Uint8Array && mm.outdoor.length >= n ? mm.outdoor : undefined
  return { elev, outdoor }
}

function Minimap({ engine, size }: { engine: Engine; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    const m = engine.map
    if (!c || !m) return
    const g = c.getContext('2d')!
    const k = size / 140 // 标记随尺寸缩放
    c.width = size; c.height = size
    // ---- v17：无限模式（L0）——以玩家为中心显示已探索 chunk（窗口内读实时探索，窗口外读持久位图）----
    if (m.inf) {
      const inf = m.inf
      const span = 80, half = span / 2
      const s = size / span
      const px = engine.player.x, py = engine.player.y
      const wx0 = Math.floor(inf.ox + px), wy0 = Math.floor(inf.oy + py)
      const mod = (v: number, n: number) => ((v % n) + n) % n
      g.fillStyle = '#0a0908'; g.fillRect(0, 0, size, size)
      for (let dy = -half; dy < half; dy++)
        for (let dx = -half; dx < half; dx++) {
          const wx = wx0 + dx, wy = wy0 + dy
          const vx = wx - inf.ox, vy = wy - inf.oy
          let ex = 0, el = 0, tnt = 0, floor = false
          if (vx >= 0 && vy >= 0 && vx < m.w && vy < m.h) {
            const idx = vy * m.w + vx
            ex = engine.explored[idx]; floor = m.tiles[idx] === 1
            el = m.elev[idx]; tnt = m.tint[idx]
          } else {
            const bm = inf.explored.get(`${Math.floor(wx / CS)},${Math.floor(wy / CS)}`)
            if (bm && bm[mod(wy, CS) * CS + mod(wx, CS)]) { ex = 1; floor = true }
          }
          if (!ex || !floor) continue
          g.fillStyle = tnt === 2 ? '#7a1a12' : tnt === 1 ? '#8a7a4a' : el === 4 ? '#050505' : el === 1 ? MINIMAP_COLORS.low : MINIMAP_COLORS.normal
          g.fillRect((dx + half) * s, (dy + half) * s, Math.ceil(s), Math.ceil(s))
        }
      // chunk 网格细线（每 32 瓦片）
      g.strokeStyle = 'rgba(232,185,60,0.07)'
      g.lineWidth = 1
      for (let i = -half; i <= half; i++) {
        if (mod(wx0 + i, CS) !== 0) continue
        g.beginPath(); g.moveTo((i + half) * s, 0); g.lineTo((i + half) * s, size); g.stroke()
        if (mod(wy0 + i, CS) === 0) { g.beginPath(); g.moveTo(0, (i + half) * s); g.lineTo(size, (i + half) * s); g.stroke() }
      }
      for (const e of m.exits) {
        if (!e.discovered) continue
        const ex2 = (e.x + 0.5 - px + half) * s, ey2 = (e.y + 0.5 - py + half) * s
        if (ex2 < 0 || ey2 < 0 || ex2 > size || ey2 > size) continue
        g.fillStyle = '#f5e37a'
        g.shadowColor = '#f5e37a'; g.shadowBlur = 5 * k
        g.beginPath(); g.arc(ex2, ey2, 2.5 * k, 0, 7); g.fill()
        g.shadowBlur = 0
      }
      g.fillStyle = '#e8b93c'
      g.beginPath(); g.arc(size / 2, size / 2, 2 * k, 0, 7); g.fill()
      return
    }
    const s = size / m.w
    g.fillStyle = '#0a0908'; g.fillRect(0, 0, size, size)
    const { elev, outdoor } = mapZData(m)
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const idx = y * m.w + x
        if (!engine.explored[idx] || m.tiles[idx] !== 1) continue
        const out = outdoor ? outdoor[idx] === 1 : false
        const el = elev ? elev[idx] : 0
        // 0=正常 1=低洼(偏蓝更深) 2=高台(偏黄更亮) 3=室外地面；outdoor 优先按室外色
        const fill = out || el === 3 ? MINIMAP_COLORS.outdoor : el === 1 ? MINIMAP_COLORS.low : el === 2 ? MINIMAP_COLORS.high : MINIMAP_COLORS.normal
        g.fillStyle = fill
        g.fillRect(x * s, y * s, Math.ceil(s), Math.ceil(s))
        if (out || el === 3) {
          // 室外区域：斜纹纹理区分
          g.strokeStyle = 'rgba(120,205,195,0.4)'
          g.lineWidth = Math.max(1, s * 0.18)
          g.beginPath()
          g.moveTo(x * s, (y + 1) * s)
          g.lineTo((x + 1) * s, y * s)
          g.stroke()
        }
      }
    for (const e of m.exits) {
      if (!e.discovered) continue
      g.fillStyle = '#f5e37a'
      g.shadowColor = '#f5e37a'; g.shadowBlur = 5 * k
      g.beginPath(); g.arc((e.x + 0.5) * s, (e.y + 0.5) * s, 2.5 * k, 0, 7); g.fill()
      g.shadowBlur = 0
    }
    // 玩家标记：高度指示（低洼变暗+↓，高台↑）+ 蹲伏缩小
    const pz = engine.player as unknown as { crouching?: boolean }
    const pIdx = Math.floor(engine.player.y) * m.w + Math.floor(engine.player.x)
    const pEl = elev && pIdx >= 0 && pIdx < elev.length ? elev[pIdx] : 0
    const r = 2 * k * (pz.crouching ? 0.65 : 1)
    g.fillStyle = pEl === 1 ? '#93792a' : '#e8b93c'
    g.beginPath(); g.arc(engine.player.x * s, engine.player.y * s, r, 0, 7); g.fill()
    if (pEl === 1 || pEl === 2 || pEl === 3) {
      g.font = `${Math.max(7, Math.round(8 * k))}px monospace`
      g.textAlign = 'center'
      g.fillStyle = pEl === 1 ? '#8fa3c9' : '#ffe37a'
      g.fillText(pEl === 1 ? '↓' : '↑', engine.player.x * s, engine.player.y * s - 3.2 * k)
    }
  })
  return <canvas ref={ref} style={{ width: size, height: size, imageRendering: 'pixelated' }} />
}

export default function HUD({ engine, isMobile, log, toasts, devMode, fxScale, onPause, onInventory, onSelectSlot, onUseSlot }: Props) {
  const p = engine.player
  const def = engine.levelDef
  const interact = engine.getInteract()
  const now = Date.now()
  // 移动端横屏：小地图默认折叠，点击展开为半透明大地图浮层
  const landscape = isMobile && typeof window !== 'undefined' && window.innerWidth > window.innerHeight
  const [mapOpen, setMapOpen] = useState(false)
  const bigMapSize = Math.max(180, Math.floor(Math.min(window.innerHeight - 96, window.innerWidth * 0.45, 360)))

  // 出口方向指引（有限层 20 格内；v17 无限 L0 全距离——保底出口再远也有气流指引）
  const exit = engine.nearestExit()
  const isInfMap = !!engine.map?.inf
  let exitArrow: { rel: number; d: number } | null = null
  if (exit && (exit.d < 20 || isInfMap)) {
    exitArrow = { rel: exitArrowRotation(p.x, p.y, look.yaw, exit.x + 0.5, exit.y + 0.5), d: exit.d }
  }

  // v13 楼层契约（防御性读取：另一 agent 实现中——player.floor 0 起始 / map.floors 总层数，缺省或多层数据不存在则不显示）
  const pf = (p as unknown as { floor?: unknown }).floor
  const mf = (engine.map as unknown as { floors?: unknown } | null)?.floors
  const floorInfo = typeof pf === 'number' && Number.isFinite(pf) && typeof mf === 'number' && mf > 1
    ? { cur: Math.max(0, Math.floor(pf)), total: Math.floor(mf) }
    : null
  const floorText = floorInfo ? `${floorInfo.cur + 1}F/共${floorInfo.total}层` : null

  const vitals = (
    <div className={`flex flex-col gap-1 ${isMobile ? 'w-[120px] max-md:landscape:w-auto max-md:landscape:flex-row max-md:landscape:gap-2.5' : 'w-[200px]'}`}>
      <Bar color="var(--blood)" value={p.hp} icon={<IconHP width={14} height={14} />} label="HP" compact={isMobile} critical={p.hp <= 30} />
      <Bar color="var(--stamina)" value={p.stamina} icon={<IconStamina width={14} height={14} />} label="体力" compact={isMobile} critical={p.stamina <= 5} />
      <Bar color="var(--hunger)" value={p.hunger} icon={<IconHunger width={14} height={14} />} label="饥饿" compact={isMobile} critical={p.hunger <= 25} />
      <Bar color="var(--sanity)" value={p.sanity} icon={<IconSanity width={14} height={14} />} label="理智" compact={isMobile} critical={p.sanity <= 20} />
    </div>
  )

  const hotbar = (
    <div className="flex gap-1 overflow-x-auto">
      {p.hotbar.map((s, i) => (
        <button
          key={i}
          className="relative flex shrink-0 items-center justify-center border"
          style={{
            width: isMobile ? 40 : 44, height: isMobile ? 40 : 44,
            borderColor: p.selected === i ? 'var(--amber)' : 'var(--panel-edge)',
            boxShadow: p.selected === i ? 'inset 0 0 6px rgba(232,185,60,0.5)' : 'none',
            background: 'color-mix(in srgb, var(--panel) 85%, transparent)',
          }}
          onClick={() => onSelectSlot(i)}
          onContextMenu={(e) => { e.preventDefault(); onUseSlot(i) }}
          onDoubleClick={() => onUseSlot(i)}
        >
          <span className="font-mono2 absolute left-0.5 top-0 text-[8px]" style={{ color: 'var(--text-dim)' }}>{i + 1}</span>
          {s && (
            <>
              <ItemGlyph type={s.type} />
              {s.count > 1 && <span className="font-mono2 absolute bottom-0 right-0.5 text-[9px]" style={{ color: 'var(--amber)' }}>{s.count}</span>}
            </>
          )}
        </button>
      ))}
    </div>
  )

  return (
    <div className="pointer-events-none fixed inset-0 z-30" style={{ padding: 'calc(env(safe-area-inset-top) + 8px) calc(env(safe-area-inset-right) + 8px) calc(env(safe-area-inset-bottom) + 8px) calc(env(safe-area-inset-left) + 8px)' }}>
      {/* 左上：状态 */}
      <div className="hud-panel pointer-events-auto absolute left-3 top-3 p-2">{vitals}</div>

      {/* 顶部中央：位置 + 消息（移动端；v10 修复与状态栏/开发者面板重叠——
          移动端改为左右留白锚定，为左上状态条与右上按钮让位，日志限宽限高且纯展示） */}
      <div
        className={isMobile ? 'absolute top-3 text-center' : 'absolute left-1/2 top-3 -translate-x-1/2 text-center'}
        style={isMobile ? { left: landscape ? 378 : 156, right: landscape ? 118 : 110, pointerEvents: 'none' } : undefined}
      >
        <div className="hud-panel font-mono2 inline-block max-w-full truncate px-3 py-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
          {isMobile
            ? `L${def.id} ${def.name}${floorText ? ` · ${floorText}` : ''} · 磁带 ${p.tapes}/${WIN_TAPES}`
            : `LEVEL ${def.id} · ${def.name} · B${def.id}${floorText ? ` · ${floorText}` : ''} · 磁带 ${p.tapes}/${WIN_TAPES}`}
        </div>
        {isMobile && (
          <div className="pointer-events-none mx-auto mt-1 max-h-[3.6em] space-y-0.5 overflow-hidden" style={{ maxWidth: '100%' }}>
            {log.slice(-2).map((l) => (
              <div key={l.id} className="font-mono2 truncate text-[11px]" style={{ color: l.kind === 'loot' ? 'var(--amber)' : l.kind === 'damage' ? 'var(--blood)' : l.kind === 'lore' ? 'var(--sanity)' : 'var(--text-dim)', opacity: Math.min(1, (now - l.t) / 4000 > 1 ? 0.4 : 1), textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
                {l.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 右上 */}
      <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
        {isMobile ? (
          <>
            {/* 横屏：折叠小地图，点击展开大地图浮层（竖屏保持现状） */}
            {landscape && (
              <button
                className="hud-panel pointer-events-auto p-1"
                aria-label="展开地图"
                onClick={() => { audio.uiTick(); setMapOpen(true) }}
              >
                <Minimap engine={engine} size={64} />
              </button>
            )}
            <div className="flex gap-2">
              <button className="hud-panel pointer-events-auto flex h-11 w-11 items-center justify-center" style={{ color: 'var(--text)' }} onClick={onInventory}><IconMap width={20} height={20} /></button>
              <button className="hud-panel pointer-events-auto flex h-11 w-11 items-center justify-center" style={{ color: 'var(--text)' }} onClick={onPause}><IconPause width={20} height={20} /></button>
            </div>
          </>
        ) : (
          <div className="hud-panel pointer-events-auto p-1.5"><Minimap engine={engine} size={140} /></div>
        )}
        <div className="hud-panel flex items-center gap-2 px-2 py-1">
          {/* 蹲伏状态提示（防御性读取 v7 字段） */}
          {((p as unknown as { crouching?: boolean }).crouching || (engine.input as unknown as { crouch?: boolean }).crouch) && (
            <span style={{ color: 'var(--amber)', width: 14, height: 14 }} title="蹲伏中"><IconCrouch width={14} height={14} /></span>
          )}
          <span style={{ color: 'var(--amber)', width: 14, height: 14 }}><IconBattery width={14} height={14} /></span>
          <span className="font-mono2 text-[10px]" style={{ color: 'var(--text-dim)' }}>{Math.round(p.battery)}%</span>
          {/* 噪音指示 */}
          <span className="flex items-end gap-[2px]">
            {[0.33, 0.66, 1].map((th, i) => (
              <span key={i} className="w-[3px] rounded-sm" style={{ height: 4 + i * 3, background: engine.noise > th ? 'var(--blood)' : 'var(--panel-edge)' }} />
            ))}
          </span>
        </div>
      </div>

      {/* 左下：消息日志（桌面；开发者面板展开时右移让位，v10） */}
      {!isMobile && (
        <div className="pointer-events-none absolute bottom-3 max-w-[320px] space-y-0.5" style={{ left: devMode ? 384 : 12 }}>
          {log.slice(-4).map((l) => (
            <div key={l.id} className="font-mono2 truncate text-[12px]" style={{ color: l.kind === 'loot' ? 'var(--amber)' : l.kind === 'damage' ? 'var(--blood)' : l.kind === 'lore' ? 'var(--sanity)' : 'var(--text-dim)', opacity: now - l.t > 4000 ? 0.4 : 1, textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
              {l.text}
            </div>
          ))}
        </div>
      )}

      {/* 底部中央：快捷栏 + 拾取提示 */}
      <div className={`absolute left-1/2 -translate-x-1/2 ${isMobile ? 'bottom-[8px] max-md:landscape:bottom-2' : 'bottom-3'} flex flex-col items-center gap-2`}>
        <div className="relative h-6">
          {toasts.map((t) => (
            <div key={t.id} className="anim-toast font-mono2 whitespace-nowrap text-[12px]" style={{ color: 'var(--amber)' }}>{t.text}</div>
          ))}
        </div>
        <div className="pointer-events-auto">{hotbar}</div>
      </div>

      {/* 右下：情境提示（桌面） */}
      {!isMobile && (
        <div className="absolute bottom-3 right-3 space-y-1 text-right">
          {interact && (
            <div className="hud-panel anim-slideUp font-mono2 inline-block px-3 py-1.5 text-[12px]" style={{ color: 'var(--amber)' }}>
              [{bindLabelFor('interact')}] {interact.label}
            </div>
          )}
          <div className="hud-panel font-mono2 block px-3 py-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
            [{bindLabelFor('attack')}] 攻击　[{bindLabelFor('jump')}] 跳跃　[{bindLabelFor('crouch')}] 蹲伏　[{bindLabelFor('flashlight')}] 手电 {Math.round(p.battery)}%　[{bindLabelFor('quickuse')}] 使用　[{bindLabelFor('quickdrop')}] 丢弃
          </div>
        </div>
      )}
      {isMobile && interact && (
        <div className="hud-panel absolute bottom-[170px] right-4 px-3 py-1.5" style={{ color: 'var(--amber)' }}>
          <span className="font-mono2 flex items-center gap-1 text-[12px]"><IconInteract width={14} height={14} />{interact.label}</span>
        </div>
      )}

      {/* ---- 状态低下画面效果（受减闪烁设置缩放）---- */}
      {/* 饥饿 ≤25：边缘发黄收缩脉冲 */}
      {p.hunger <= 25 && (
        <div className="pointer-events-none fixed inset-0 z-[31] anim-hungerPulse" style={{ boxShadow: `inset 0 0 ${90 + 60 * fxScale}px 30px rgba(201,138,61,${0.35 + 0.3 * fxScale})` }} />
      )}
      {/* 理智 ≤40：紫边呼吸扭曲；≤20 加强 + 角落黑影 */}
      {p.sanity <= 40 && (
        <div
          className="pointer-events-none fixed inset-0 z-[31] anim-sanityBreathe"
          style={{ boxShadow: `inset 0 0 ${p.sanity <= 20 ? 160 : 100}px 40px rgba(122,111,208,${(p.sanity <= 20 ? 0.5 : 0.28) * (0.5 + 0.5 * fxScale)})`, animationDuration: p.sanity <= 20 ? '1.6s' : '3.2s' }}
        />
      )}
      {p.sanity <= 20 && fxScale > 0.15 && (
        <div className="pointer-events-none fixed right-0 top-0 z-[31] h-40 w-40 anim-cornerShadow" style={{ background: 'radial-gradient(circle at top right, rgba(0,0,0,0.85), transparent 70%)' }} />
      )}
      {/* HP ≤30：红色暗角脉冲 */}
      {p.hp <= 30 && p.hp > 0 && (
        <div className="pointer-events-none fixed inset-0 z-[31] anim-hpPulse" style={{ boxShadow: `inset 0 0 140px 40px rgba(179,53,43,${0.3 + 0.25 * fxScale})` }} />
      )}
      {/* 电池 ≤15：顶部警告 */}
      {p.flashlight && p.battery <= 15 && p.battery > 0 && (
        <div className="hud-panel font-mono2 absolute left-1/2 top-14 -translate-x-1/2 px-3 py-1 text-[11px] anim-barPulse" style={{ color: 'var(--amber)' }}>⚡ 电池电量低 {Math.round(p.battery)}%</div>
      )}
      {/* 手电瘫痪提示 */}
      {p.flashJamT > 0 && (
        <div className="hud-panel font-mono2 absolute left-1/2 top-14 -translate-x-1/2 px-3 py-1 text-[11px]" style={{ color: 'var(--sanity)' }}>⚡ 手电瘫痪 {p.flashJamT.toFixed(1)}s</div>
      )}

      {/* 出口方向指引 */}
      {exitArrow && (
        <div
          className="pointer-events-none fixed z-[31] font-mono2 flex flex-col items-center text-[12px]"
          style={{
            color: 'var(--exit)',
            left: '50%', top: '18%',
            transform: `translateX(-50%) rotate(${exitArrow.rel}rad)`,
            opacity: 0.75,
          }}
        >
          <div style={{ fontSize: 26, textShadow: '0 0 8px var(--exit)' }}>➤</div>
        </div>
      )}
      {exitArrow && (
        <div className="pointer-events-none fixed left-1/2 top-[24%] z-[31] -translate-x-1/2 font-mono2 text-[11px]" style={{ color: 'var(--exit)', opacity: 0.7 }}>
          你感觉到{exitArrow.d < 8 ? '明显的' : exitArrow.d > 60 ? '一丝遥远的' : '一丝'}气流（{Math.round(exitArrow.d)}m）
        </div>
      )}

      {/* 容器搜索进度 */}
      {engine.searching && (
        <div className="pointer-events-none fixed left-1/2 top-1/2 z-[35] w-[220px] -translate-x-1/2 translate-y-10">
          <div className="hud-panel p-2 text-center">
            <div className="font-mono2 mb-1 text-[12px]" style={{ color: 'var(--amber)' }}>搜索{engine.searching.label}中…</div>
            <div className="h-[8px] w-full overflow-hidden rounded-sm" style={{ background: 'rgba(0,0,0,0.6)' }}>
              <div className="h-full" style={{ width: `${(engine.searching.t / engine.searching.dur) * 100}%`, background: 'var(--amber)', transition: 'width 0.1s linear' }} />
            </div>
          </div>
        </div>
      )}

      {/* 移动端横屏：展开的大地图浮层（半透明，点空白或关闭键收起；portal 脱出 HUD 层叠上下文） */}
      {mapOpen && isMobile && createPortal(
        <div
          className="pointer-events-auto fixed inset-0 z-[62] flex items-center justify-center"
          style={{ background: 'rgba(5,4,3,0.72)' }}
          onClick={() => setMapOpen(false)}
        >
          <div
            className="hud-panel anim-lootPop relative flex flex-col items-center gap-2 p-3"
            style={{ background: 'color-mix(in srgb, var(--panel) 88%, transparent)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <Minimap engine={engine} size={bigMapSize} />
            {/* v13：当前楼层标注（多楼层契约存在时） */}
            {floorInfo && (
              <div className="font-mono2 text-[12px]" style={{ color: 'var(--amber)' }}>
                L{def.id} · {def.name} · 当前 {floorInfo.cur + 1}F / 共{floorInfo.total}层
              </div>
            )}
            <div className="font-mono2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
              <span><span style={{ color: 'var(--amber)' }}>●</span> 你的位置</span>
              <span><span style={{ color: 'var(--exit)' }}>●</span> 出口</span>
              {mapZData(engine.map).elev && <span><span style={{ color: MINIMAP_COLORS.high }}>■</span> 高台</span>}
              {mapZData(engine.map).elev && <span><span style={{ color: MINIMAP_COLORS.low }}>■</span> 低洼</span>}
              {(mapZData(engine.map).outdoor || mapZData(engine.map).elev) && <span><span style={{ color: MINIMAP_COLORS.outdoor }}>■</span> 室外</span>}
              <span style={{ opacity: 0.7 }}>点击空白处关闭</span>
            </div>
            <button
              className="hud-panel font-mono2 absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center text-[13px]"
              style={{ color: 'var(--text)', background: 'var(--panel)' }}
              aria-label="关闭地图"
              onClick={() => { audio.uiTick(); setMapOpen(false) }}
            >
              ✕
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* 开发者面板 + 水印 */}
      {devMode && (
        <div
          className="pointer-events-none fixed left-1/2 top-1/2 z-[29] -translate-x-1/2 -translate-y-1/2 select-none font-title"
          style={{ transform: 'translate(-50%,-50%) rotate(-18deg)', color: 'var(--amber)', opacity: 0.07, fontSize: isMobile ? 44 : 72, letterSpacing: 8, whiteSpace: 'nowrap' }}
        >
          开发者模式
        </div>
      )}
      {devMode && <DevPanel engine={engine} isMobile={isMobile} />}
    </div>
  )
}

// ================= 开发者模式面板（v8 大扩展） =================
// 分类页签：召唤 / 状态 / 传送 / 世界 / 信息；移动端可滚动、大触点；自带水印提示。

const DEV_TABS = [
  ['spawn', '召唤'],
  ['state', '状态'],
  ['teleport', '传送'],
  ['world', '世界'],
  ['info', '信息'],
] as const
type DevTab = (typeof DEV_TABS)[number][0]

const DEV_STATES: Record<string, string> = {
  idle: '待机', wander: '游荡', investigate: '调查', chase: '追击', attack: '攻击',
  stunned: '硬直', dead: '死亡', hidden: '埋伏', disguised: '伪装',
}

// 面板本地 FPS 计（渲染层未暴露帧率，rAF 统计 500ms 窗口）
function useFps(): number {
  const [fps, setFps] = useState(0)
  useEffect(() => {
    let frames = 0, last = performance.now(), raf = 0
    const loop = (t: number) => {
      frames++
      if (t - last >= 500) { setFps(Math.round((frames * 1000) / (t - last))); frames = 0; last = t }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return fps
}

function DevBtn({ onClick, children, active, wide, title }: { onClick: () => void; children: React.ReactNode; active?: boolean; wide?: boolean; title?: string }) {
  return (
    <button
      className={`border px-2 py-1.5 ${wide ? 'w-full' : ''}`}
      style={{
        borderColor: active ? 'var(--amber)' : 'var(--panel-edge)',
        color: active ? 'var(--amber)' : 'var(--text-dim)',
        background: 'color-mix(in srgb, var(--panel) 80%, transparent)',
        minHeight: 32, // 移动端触点
      }}
      title={title}
      onClick={() => { onClick(); audio.uiTick() }}
    >
      {children}
    </button>
  )
}

function DevSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="mb-1" style={{ color: 'var(--amber)' }}>{label}</div>
      {children}
    </div>
  )
}

function DevPanel({ engine, isMobile }: { engine: Engine; isMobile: boolean }) {
  const p = engine.player
  const [tab, setTab] = useState<DevTab>('spawn')
  const [collapsed, setCollapsed] = useState(isMobile)
  const fps = useFps()
  const info = tab === 'info' || tab === 'teleport' ? engine.devInfo() : null

  const stats: { key: 'hp' | 'sanity' | 'hunger' | 'stamina' | 'battery'; label: string; color: string }[] = [
    { key: 'hp', label: '生命', color: 'var(--blood)' },
    { key: 'sanity', label: '理智', color: 'var(--sanity)' },
    { key: 'hunger', label: '饥饿', color: 'var(--hunger)' },
    { key: 'stamina', label: '体力', color: 'var(--stamina)' },
    { key: 'battery', label: '电池', color: 'var(--amber)' },
  ]

  return (
    // v11 修复：面板为明确的 flex 列结构（标题栏/页签栏/内容区各就各位）；
    // overflow 只发生在内容区，标题栏与页签栏 shrink-0 且不被内容覆盖。
    <div
      className={`hud-panel pointer-events-auto absolute z-[45] flex flex-col overflow-hidden font-mono2 text-[11px] ${isMobile ? 'left-2' : 'bottom-3 left-3'}`}
      style={{
        color: 'var(--text)',
        width: isMobile ? 'min(58vw, 300px)' : 360,
        maxHeight: collapsed ? undefined : isMobile ? '38dvh' : '62dvh',
        background: 'color-mix(in srgb, var(--panel) 92%, transparent)',
        ...(isMobile ? { top: 'calc(env(safe-area-inset-top, 0px) + 148px)' } : {}),
      }}
    >
      {/* 头部：水印式标题 + 折叠 */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-2 py-1.5" style={{ borderColor: 'var(--panel-edge)' }}>
        <span style={{ color: 'var(--amber)', textShadow: '0 0 6px rgba(232,185,60,0.4)' }}>🛠 开发者模式 · DEV</span>
        <button
          className="border px-2"
          style={{ borderColor: 'var(--panel-edge)', color: 'var(--text-dim)', minHeight: 24 }}
          onClick={() => { setCollapsed((c) => !c); audio.uiTick() }}
          aria-label={collapsed ? '展开开发者面板' : '收起开发者面板'}
        >
          {collapsed ? '▴' : '▾'}
        </button>
      </div>
      {!collapsed && (
        <>
          {/* 页签（v11：独立行不参与压缩，未选中页签正常亮度、触点 ≥32px） */}
          <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b px-1 pt-1" style={{ borderColor: 'var(--panel-edge)' }}>
            {DEV_TABS.map(([k, label]) => (
              <button
                key={k}
                className="flex-1 shrink-0 px-2 py-1.5"
                style={{
                  color: tab === k ? 'var(--amber)' : 'var(--text)',
                  borderBottom: tab === k ? '2px solid var(--amber)' : '2px solid transparent',
                  minHeight: 32,
                }}
                onClick={() => { setTab(k); audio.uiTick() }}
              >
                {label}
              </button>
            ))}
          </div>
          {/* 内容区：唯一允许 overflow 的区域（min-h-0 使其在 flex 列内可收缩滚动，不再顶起页签栏） */}
          <div className="min-h-0 flex-1 overflow-y-auto p-2" style={{ touchAction: 'pan-y' }}>
            {tab === 'spawn' && (
              <>
                <DevSection label={`召唤实体（前方 3 格 · 共 ${Object.keys(ENTITIES).length} 种）`}>
                  <div className="grid grid-cols-3 gap-1">
                    {Object.values(ENTITIES).map((d) => (
                      <DevBtn key={d.type} title={d.desc} onClick={() => engine.devSpawnEntity(d.type)}>
                        <span style={{ color: d.color }}>●</span> {d.name}
                      </DevBtn>
                    ))}
                  </div>
                  <div className="mt-1">
                    <DevBtn wide onClick={() => engine.devSpawnAllEntities()}>⚠ 每种一只（环绕召唤）</DevBtn>
                  </div>
                </DevSection>
                <DevSection label={`给予物品（共 ${Object.keys(ITEMS).length} 种 · 点名称入包 / ▾ 脚下）`}>
                  <div className="grid grid-cols-2 gap-1">
                    {Object.values(ITEMS).map((d) => (
                      <div key={d.type} className="flex gap-0.5">
                        <DevBtn onClick={() => engine.devGiveItem(d.type)} title={d.desc}>
                          <span className="inline-block align-middle" style={{ transform: 'scale(0.75)', transformOrigin: 'left center' }}><ItemGlyph type={d.type} size={16} /></span>
                          {d.name}
                        </DevBtn>
                        <DevBtn onClick={() => engine.devGiveItem(d.type, true)} title={`${d.name} 生成在脚下`}>▾</DevBtn>
                      </div>
                    ))}
                  </div>
                  <div className="mt-1">
                    <DevBtn wide onClick={() => engine.devGiveSupplies()}>🎁 全套补给（杏仁水×5 罐头×5 电池×3）</DevBtn>
                  </div>
                </DevSection>
              </>
            )}

            {tab === 'state' && (
              <>
                <DevSection label="状态控制（调整后自动解除锁定）">
                  <div className="mb-1 flex gap-1">
                    <DevBtn active={engine.dev.statLock} onClick={() => { engine.dev.statLock = !engine.dev.statLock }} title="开启后每帧锁满全部状态（默认开发者行为）">
                      状态锁定{engine.dev.statLock ? '：开' : '：关'}
                    </DevBtn>
                    <DevBtn onClick={() => engine.devFillStats()}>全部补满</DevBtn>
                    <DevBtn onClick={() => engine.devDrainStats()}>全部清空</DevBtn>
                  </div>
                  {stats.map((s) => (
                    <div key={s.key} className="mb-1 flex items-center gap-1.5">
                      <span className="w-8 shrink-0" style={{ color: s.color }}>{s.label}</span>
                      <input
                        type="range" min={0} max={100} value={Math.round(p[s.key])}
                        className="min-w-0 flex-1 accent-[#e8b93c]"
                        style={{ height: 28 }}
                        onChange={(e) => engine.devSetStat(s.key, Number(e.target.value))}
                      />
                      <span className="w-7 shrink-0 text-right" style={{ color: 'var(--text-dim)' }}>{Math.round(p[s.key])}</span>
                      <DevBtn onClick={() => engine.devSetStat(s.key, 100)}>满</DevBtn>
                      <DevBtn onClick={() => engine.devSetStat(s.key, s.key === 'hp' ? 1 : 0)}>空</DevBtn>
                    </div>
                  ))}
                </DevSection>
                <DevSection label="时间控制">
                  <div className="flex gap-1">
                    <DevBtn onClick={() => engine.devFastForward(60)}>⏩ 快进 60 秒</DevBtn>
                    <DevBtn active={engine.dev.frozenAI} onClick={() => { engine.dev.frozenAI = !engine.dev.frozenAI }}>
                      冻结实体 AI{engine.dev.frozenAI ? '：开' : '：关'}
                    </DevBtn>
                  </div>
                </DevSection>
              </>
            )}

            {tab === 'teleport' && (
              <>
                <DevSection label="传送到…">
                  <div className="grid grid-cols-2 gap-1">
                    <DevBtn onClick={() => engine.devTeleport('exit')}>🚪 最近出口</DevBtn>
                    <DevBtn onClick={() => engine.devTeleport('entity')}>👁 最近实体</DevBtn>
                    <DevBtn onClick={() => engine.devTeleport('container')}>📦 最近容器</DevBtn>
                    <DevBtn onClick={() => engine.devTeleport('spawn')}>⌂ 出生点</DevBtn>
                  </div>
                </DevSection>
                {info && (
                  <DevSection label="出口方位">
                    {info.exits.length === 0 && <div style={{ color: 'var(--text-dim)' }}>本层无出口</div>}
                    {info.exits.map((e, i) => (
                      <div key={i} style={{ color: e.discovered ? 'var(--exit)' : 'var(--text-dim)' }}>
                        {e.name} · {e.d.toFixed(1)}m {e.discovered ? '（已发现）' : ''}
                      </div>
                    ))}
                  </DevSection>
                )}
                {(() => {
                  const ls = engine.devLevelStructures()
                  if (!ls.prefabs.length && !ls.variants.length) return null
                  return (
                    <DevSection label="本层固定结构 / 变种房间（●已生成 ○未生成→强制生成）">
                      <div className="grid grid-cols-2 gap-1">
                        {ls.prefabs.map((f) => (
                          <DevBtn
                            key={f.id}
                            title={f.found ? '已生成：传送到该固定结构' : '已生成区域中没有：点击强制生成一个并传送'}
                            onClick={() => engine.devGotoPrefab(f.id)}
                          >
                            {f.found ? '●' : '○'} {f.name}
                          </DevBtn>
                        ))}
                        {ls.variants.map((v) => (
                          <DevBtn
                            key={v.id}
                            title={v.found ? '已生成：传送到该变种房间' : '已生成区域中没有：点击生成新区域并传送'}
                            onClick={() => engine.devGotoVariant(v.id)}
                          >
                            {v.found ? '●' : '○'} {v.name}
                          </DevBtn>
                        ))}
                      </div>
                    </DevSection>
                  )
                })()}
              </>
            )}

            {tab === 'world' && (
              <>
                <DevSection label="层级跳转">
                  <div className="flex gap-1">
                    {LEVELS.map((lv) => (
                      <DevBtn key={lv.id} active={p.level === lv.id} onClick={() => engine.devJump(lv.id)}>L{levelNo(lv.id)}</DevBtn>
                    ))}
                  </div>
                </DevSection>
                <DevSection label="开关">
                  <div className="grid grid-cols-3 gap-1">
                    <DevBtn active={engine.dev.noclip} onClick={() => { engine.dev.noclip = !engine.dev.noclip }}>穿墙</DevBtn>
                    <DevBtn active={engine.dev.speed} onClick={() => { engine.dev.speed = !engine.dev.speed }}>加速</DevBtn>
                    <DevBtn active={engine.dev.oneHit} onClick={() => { engine.dev.oneHit = !engine.dev.oneHit }} title="近战攻击直接击杀任意实体">一击必杀</DevBtn>
                    <DevBtn active={engine.dev.invisible} onClick={() => { engine.dev.invisible = !engine.dev.invisible }} title="实体不会索敌/追击/触发特殊行为">隐形</DevBtn>
                    <DevBtn active={engine.dev.frozenAI} onClick={() => { engine.dev.frozenAI = !engine.dev.frozenAI }} title="实体 AI 完全冻结">冻结AI</DevBtn>
                    <DevBtn active={engine.dev.god} onClick={() => { engine.dev.god = !engine.dev.god }} title="无敌（默认随开发者模式开启）">无敌</DevBtn>
                  </div>
                </DevSection>
                <DevSection label="层级事件">
                  <div className="grid grid-cols-2 gap-1">
                    <DevBtn onClick={() => engine.devTriggerEvent()}>🎲 触发随机事件</DevBtn>
                    <DevBtn onClick={() => engine.devForceBlackout(20)}>🔌 强制停电 20s</DevBtn>
                    <DevBtn onClick={() => engine.devKillAllEntities()}>💀 清场（杀光实体）</DevBtn>
                    <DevBtn onClick={() => engine.devFastForward(60)}>⏩ 快进 60 秒</DevBtn>
                    <DevBtn onClick={() => engine.devRegenLevel(false)}>♻ 重生成（同种子）</DevBtn>
                    <DevBtn onClick={() => engine.devRegenLevel(true)}>🎲 重生成（新种子）</DevBtn>
                  </div>
                </DevSection>
              </>
            )}

            {tab === 'info' && info && (
              <>
                <DevSection label="位置">
                  <div style={{ color: 'var(--text-dim)' }}>
                    瓦片 ({info.tx}, {info.ty}) · 精确 ({info.x.toFixed(2)}, {info.y.toFixed(2)}) · z {info.z.toFixed(2)}
                  </div>
                  <div style={{ color: 'var(--text-dim)' }}>
                    elev {info.elev === undefined ? '?' : ['正常', '低洼↓', '高台↑', '室外', '深渊'][info.elev] ?? info.elev}
                    {info.outdoor ? ' · 室外' : ''} · FPS {fps}
                  </div>
                  <div style={{ color: 'var(--text-dim)' }}>
                    L{levelNo(info.level)} · 种子 {seedString(info.seed)} · t {info.time.toFixed(1)}s
                    {info.blackout > 0 ? ` · 停电剩余 ${info.blackout.toFixed(0)}s` : ''}
                  </div>
                  <div style={{ color: 'var(--text-dim)' }}>
                    容器 {info.containers.unlooted}/{info.containers.total} 未搜 · 出口 {info.exits.length}
                  </div>
                </DevSection>
                <DevSection label={`实体列表（${info.entities.filter((e) => e.state !== 'dead').length} 存活 / ${info.entities.length} 总数）`}>
                  <div className="space-y-0.5" style={{ maxHeight: 160, overflowY: 'auto' }}>
                    {info.entities.length === 0 && <div style={{ color: 'var(--text-dim)' }}>本层无实体</div>}
                    {info.entities.slice(0, 30).map((e, i) => (
                      <div key={i} className="flex justify-between gap-2" style={{ color: e.state === 'dead' ? 'var(--panel-edge)' : e.state === 'chase' || e.state === 'attack' ? 'var(--blood)' : 'var(--text-dim)' }}>
                        <span>{e.name}</span>
                        <span>{e.d.toFixed(1)}m · {DEV_STATES[e.state] ?? e.state} · hp{Math.max(0, Math.round(e.hp))}</span>
                      </div>
                    ))}
                    {info.entities.length > 30 && <div style={{ color: 'var(--panel-edge)' }}>… 其余 {info.entities.length - 30} 只省略</div>}
                  </div>
                </DevSection>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// 物品小图标（每件专属配色与造型，一眼可辨）
const GLYPH_COLOR: Record<string, string> = {
  almond: '#8fd98f', canned: '#c98a3d', bandage: '#e8e2d2', battery: '#e8b93c',
  crowbar: '#d96a4a', tape: '#ffd94d', lighter: '#d9a05a', rabbit: '#c9a0d0',
  wallpaper: '#c9b458', glowstick: '#a8e0a0', carkey: '#7fb0c9', gas: '#d94a3a',
  wrench: '#9aa0a8', gloves: '#b89a2e', suit: '#5a8a5a', fuse: '#e8c93d',
  capacitor: '#4a8ac9', coffee: '#a06a3e', stapler: '#6a7078', keycard: '#7fb0c9',
  skeleton: '#b08d46', silverware: '#d8d8e0', sedative: '#9adfff', flashlight: '#f0d060',
}
// v14：网络素材贴图图标（game-icons.net，CC BY 3.0，见 public/textures/icons/SOURCES.md）；
// 不在表内或加载失败的物品回退手绘 SVG。
const ICON_IMG: Record<string, true> = {
  almond: true, bandage: true, battery: true, crowbar: true, tape: true, lighter: true,
  rabbit: true, carkey: true, gas: true, wrench: true, gloves: true, suit: true,
  fuse: true, coffee: true, keycard: true, skeleton: true, silverware: true, sedative: true,
  flashlight: true, // v20：game-icons.net Delapouite flashlight（替换手绘 SVG）
  canned: true, stapler: true, capacitor: true, glowstick: true, wallpaper: true, // v21：用户提供图标素材
}
export function ItemGlyph({ type, size = 24 }: { type: string; size?: number }) {
  const [imgErr, setImgErr] = useState(false)
  const def = ITEMS[type]
  const g = def?.glyph ?? 'box'
  const color = GLYPH_COLOR[type] ?? 'var(--text)'
  if (ICON_IMG[type] && !imgErr) {
    const base = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/')
    return (
      <img
        src={`${base}textures/icons/${type}.png`}
        width={size} height={size} alt={def?.name ?? type}
        draggable={false}
        onError={() => setImgErr(true)}
        style={{ display: 'inline-block', verticalAlign: 'middle', filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.9))' }}
      />
    )
  }
  const s = { stroke: 'currentColor', strokeWidth: 1.6, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const f = { fill: 'currentColor', stroke: 'none' as const }
  const inner = (() => {
    switch (g) {
      case 'bottle': return <><rect x="9" y="6" width="6" height="13" rx="1" {...s} /><path d="M10.5 3h3v3h-3z" {...f} /><path d="M9 12h6" {...s} /></>
      case 'can': return <><rect x="7" y="5" width="10" height="14" rx="2" {...s} /><ellipse cx="12" cy="5.5" rx="5" ry="1" {...s} /><path d="M7 12h10" {...s} /></>
      case 'bandage': return <><rect x="3" y="9" width="18" height="7" rx="3.5" {...s} /><circle cx="9" cy="12.5" r="0.8" {...f} /><circle cx="12" cy="12.5" r="0.8" {...f} /><circle cx="15" cy="12.5" r="0.8" {...f} /></>
      case 'battery': return <><rect x="9" y="6" width="6" height="14" rx="1" {...s} /><path d="M10.5 3.5h3v2h-3z" {...f} /><path d="M12 9l-1.5 3h3L12 15" {...s} /></>
      case 'crowbar': return <path d="M5 19 15 8m1-4a3.5 3.5 0 0 1 4 4M14 7l3 3" {...s} />
      case 'tape': return <><rect x="3" y="6" width="18" height="12" rx="1.5" {...s} /><circle cx="8.5" cy="12" r="2.2" {...s} /><circle cx="15.5" cy="12" r="2.2" {...s} /><circle cx="8.5" cy="12" r="0.6" {...f} /><circle cx="15.5" cy="12" r="0.6" {...f} /><path d="M10.7 12h2.6" {...s} /></>
      case 'lighter': return <><rect x="9" y="9" width="6" height="11" rx="1" {...s} /><path d="M12 3c1.5 1.5 1.5 3 0 4.5-1.5-1.5-1.5-3 0-4.5z" {...f} /></>
      case 'rabbit': return <><ellipse cx="12" cy="15" rx="3.5" ry="4" {...s} /><path d="M10 11 8.5 4m5.5 7L15.5 4" {...s} /><path d="M12 19v2.5" {...s} /></>
      case 'stick': return <><rect x="10.5" y="4" width="3" height="15" rx="1.5" {...s} /><path d="M10.5 8h3" {...s} /><circle cx="12" cy="19" r="1" {...f} /></>
      case 'flashlight': return <><rect x="9" y="8" width="6" height="12" rx="1.5" {...s} /><path d="M8 8h8L10 4h4L16 8z" {...s} /><circle cx="12" cy="12" r="1.2" {...f} /><path d="M12 1v2M7 2.5l1 1.7M17 2.5l-1 1.7" {...s} /></>
      case 'key': case 'carkey': return <><circle cx="8" cy="8" r="3.5" {...s} /><path d="M10.5 10.5 18 18m-2.5-1 1.5-1.5m-4-1L14.5 13" {...s} /></>
      case 'gas': return <><rect x="6" y="8" width="11" height="12" rx="1" {...s} /><path d="M14 4h5v4l-2 2M8 12h7" {...s} /></>
      case 'wrench': return <path d="M14.5 5a4.2 4.2 0 0 0-5.6 5.6L4 15.5 8.5 20l4.9-4.9A4.2 4.2 0 0 0 19 9.5L16 12l-3-1-1-3 2.5-3z" {...s} />
      case 'gloves': return <path d="M7 13V6a1.5 1.5 0 0 1 3 0v4m0-6a1.5 1.5 0 0 1 3 0v6m0-5a1.5 1.5 0 0 1 3 0v8a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5v-2" {...s} />
      case 'suit': return <path d="M9 3h6l1 4 3 2-2 12h-4l-1-7-1 7H7L5 9l3-2 1-4z" {...s} />
      case 'fuse': return <><rect x="9" y="6" width="6" height="12" rx="1" {...s} /><path d="M8 3h8M8 21h8M9 6V3m6 3V3m-6 18v-3m6 3v-3" {...s} /></>
      case 'cap': return <><rect x="6" y="10" width="12" height="9" rx="1" {...s} /><path d="M9 10V4m6 6V4M9 14h6" {...s} /></>
      case 'coffee': return <><rect x="7" y="5" width="10" height="14" rx="2" {...s} /><path d="M7 9h10M9 13c1 1.5 5 1.5 6 0" {...s} /></>
      case 'stapler': return <path d="M3 15h18v4H3zM3 15V9l12-3 6 3v6" {...s} />
      case 'card': return <><rect x="3" y="6" width="18" height="12" rx="1.5" {...s} /><rect x="5.5" y="9" width="5" height="3.5" {...s} /><path d="M14 9h5m-5 3h5" {...s} /></>
      case 'skeleton': return <><circle cx="8" cy="7" r="3.5" {...s} /><path d="M10.5 9.5 19 18m-3 0 2-2m-5-1 2-2" {...s} /></>
      case 'silver': return <path d="M8 3v7a2 2 0 0 0 4 0V3m-2 0v18m6-15c0 4-1 5-1 5v10" {...s} />
      case 'syringe': return <><path d="M4 20l6-6m0 0L17 7m-9 5 3 3" {...s} /><path d="M15 5l4 4m-7-2 4 4" {...s} /></>
      case 'scrap': return <><path d="M5 4h14v13l-4 3H5z" {...s} /><path d="M15 20v-3h4" {...s} /><path d="M8 8h8M8 12h5" {...s} /></>
      default: return <rect x="7" y="7" width="10" height="10" {...s} />
    }
  })()
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ color }}>
      {inner}
    </svg>
  )
}
