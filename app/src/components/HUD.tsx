// 游戏 HUD（桌面 + 移动端自适应）
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Engine } from '@/game/engine'
import { ITEMS } from '@/game/content/items'
import { ENTITIES, entitySpawnLevels } from '@/game/entities'
import { WIN_TAPES, LEVELS, levelNo, levelLabel } from '@/game/levels'
import { seedString } from '@/game/core/rng'
import { look } from '@/game/core/renderer3d'
import { exitArrowRotation } from '@/game/content/guide'
import { CS, infiniteImplFor } from '@/game/world/infinite'
import { l5RegionAt } from '@/game/world/infiniteL5' // v55：L5 区域名按大厅/房间矩形判定
import { stairServesBand } from '@/game/world/mapgen'
import { CONTAINER_KINDS } from '@/game/decorations/containers'
import { DOCS } from '@/game/content/docs'
import { OUTPOSTS, isLandmarkStruct } from '@/game/content/outposts'
import { NPCS } from '@/game/content/npcs'
import { FACTIONS } from '@/game/content/factions'
import { DECOR_REGISTRY, DECOR_LEVEL_ORDER } from '@/game/content/decorRegistry'
import { storage } from '@/game/core/storage'
import { audio } from '@/game/core/audio'
import { MUSIC_LIBRARY } from '@/game/core/midi' // v56 六轮：图鉴全开同步解锁电台音乐
import { bindLabelFor } from '@/game/core/keybinds'
import { IconHP, IconStamina, IconHunger, IconThirst, IconSanity, IconBattery, IconPause, IconMap, IconInteract, IconCrouch, IconIsolation, IconPlant } from './icons'
import { PHENOMENA, rarityText } from '@/game/content/phenomena'

// 现象图标映射（phenomena.ts 中 def.icon → 具体 SVG 组件）
const PHEN_ICON = { isolation: IconIsolation, plant: IconPlant, flicker: IconStamina } as const

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
      // v54c：wallwindow 格按墙绘制（瓦片虽雕成地板，渲染/碰撞均为整格墙）——窗口内格不画地板色
      const wwSet = new Set<number>()
      for (const st of m.structures) if (st.kind === 'wallwindow') wwSet.add(Math.floor(st.y + st.h / 2) * m.w + Math.floor(st.x + st.w / 2))
      const span = 80, half = span / 2
      const s = size / span
      const px = engine.player.x, py = engine.player.y
      const pBand = engine.player.floor
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
            ex = engine.explored[idx]
            floor = pBand === -1 ? m.dn[idx] === 1 && m.dnWall[idx] !== 1 : m.tiles[idx] === 1 && !wwSet.has(idx)
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
        if (!e.discovered || (e.floor ?? 0) !== pBand) continue
        const ex2 = (e.x + 0.5 - px + half) * s, ey2 = (e.y + 0.5 - py + half) * s
        if (ex2 < 0 || ey2 < 0 || ex2 > size || ey2 > size) continue
        g.fillStyle = '#f5e37a'
        g.shadowColor = '#f5e37a'; g.shadowBlur = 5 * k
        g.beginPath(); g.arc(ex2, ey2, 2.5 * k, 0, 7); g.fill()
        g.shadowBlur = 0
      }
      // 标注（v32）：已探索区域内的容器（亮=未搜刮 暗=已搜刮）与地面物品
      for (const st of m.structures) {
        if ((st.floor ?? 0) !== pBand) continue
        if (!CONTAINER_KINDS.includes(st.kind)) continue
        const idx = Math.floor(st.y + st.h / 2) * m.w + Math.floor(st.x + st.w / 2)
        if (idx < 0 || idx >= m.w * m.h || !engine.explored[idx]) continue
        const sx = (st.x + st.w / 2 - px + half) * s, sy = (st.y + st.h / 2 - py + half) * s
        if (sx < 0 || sy < 0 || sx > size || sy > size) continue
        g.fillStyle = st.looted ? 'rgba(160,140,90,0.35)' : '#c9a03a'
        g.fillRect(sx - 1.5 * k, sy - 1.5 * k, 3 * k, 3 * k)
      }
      // 定居点地标：鲜黄三角（v35，探索过即显示；v55c 通用地标判定——含邀请函等 data.outpost 形态）
      for (const st of m.structures) {
        if (!isLandmarkStruct(st)) continue
        const idx = Math.floor(st.y + st.h / 2) * m.w + Math.floor(st.x + st.w / 2)
        if (idx < 0 || idx >= m.w * m.h || !engine.explored[idx]) continue
        const sx = (st.x + st.w / 2 - px + half) * s, sy = (st.y + st.h / 2 - py + half) * s
        if (sx < 0 || sy < 0 || sx > size || sy > size) continue
        g.fillStyle = '#ffd94d'
        g.beginPath()
        g.moveTo(sx, sy - 3 * k); g.lineTo(sx + 2.6 * k, sy + 2 * k); g.lineTo(sx - 2.6 * k, sy + 2 * k)
        g.closePath(); g.fill()
      }
      for (const it of m.items) {
        const idx = Math.floor(it.y) * m.w + Math.floor(it.x)
        if (idx < 0 || idx >= m.w * m.h || !engine.explored[idx]) continue
        const sx = (it.x - px + half) * s, sy = (it.y - py + half) * s
        if (sx < 0 || sy < 0 || sx > size || sy > size) continue
        g.fillStyle = '#6ad9c9'
        g.fillRect(sx - 0.75 * k, sy - 0.75 * k, 1.5 * k, 1.5 * k)
      }
      g.fillStyle = '#e8b93c'
      g.beginPath(); g.arc(size / 2, size / 2, 2 * k, 0, 7); g.fill()
      return
    }
    const s = size / m.w
    g.fillStyle = '#0a0908'; g.fillRect(0, 0, size, size)
    const { elev, outdoor } = mapZData(m)
    // v54c：wallwindow 格按墙绘制（瓦片虽雕成地板，渲染/碰撞均为整格墙）
    const wwSet = new Set<number>()
    for (const st of m.structures) if (st.kind === 'wallwindow') wwSet.add(Math.floor(st.y + st.h / 2) * m.w + Math.floor(st.x + st.w / 2))
    // v43：多层地图只画玩家当前层（band1=上层 up 楼板，band0=主层 tiles；v54：band2=三层 up2 楼板），别让几层叠着画
    const pBand = (m.floors ?? 1) > 1 ? ((engine.player.z ?? 0) >= 4.5 ? 2 : (engine.player.z ?? 0) >= 1.5 ? 1 : 0) : 0
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const idx = y * m.w + x
        if (!engine.explored[idx]) continue
        if (pBand >= 1) {
          const upA = pBand === 2 ? m.up2 : m.up // v54：三层视图读 up2
          const wallA = pBand === 2 ? m.upWall2 : m.upWall
          if (upA[idx] !== 1 && wallA[idx] !== 1) continue
          // v54：该层内部墙格画墙体色（与大地图同色 #1d2b25，楼板色深一档）——上层房间格局可读
          g.fillStyle = wallA[idx] === 1 ? '#1d2b25' : '#31423a' // 上层楼板：灰绿底色区分
          g.fillRect(x * s, y * s, Math.ceil(s), Math.ceil(s))
          continue
        }
        if (m.tiles[idx] !== 1 || wwSet.has(idx)) continue // v54c：wallwindow 格按墙绘制（不画地板色）
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
    // v54：楼梯坡道标记（仅多层地图）——亮青小三角指向上行方向（与大地图同款简化版）；
    // 按玩家当前层过滤：坡道格在该层有地面/楼板才显示（band0 看 tiles，band1 看 up，band2 看 up2），未探索不显示
    if ((m.floors ?? 1) > 1) {
      g.fillStyle = '#4de3ff'
      for (let y = 0; y < m.h; y++)
        for (let x = 0; x < m.w; x++) {
          const i = y * m.w + x
          const sv = m.stair[i]
          if ((sv & 7) === 0 || !engine.explored[i]) continue
          // v54c：按服务楼层带过滤（stairServesBand）——2F→3F 坡道不再出现在 1F 视图，1F→2F 不出现在 3F
          if (!stairServesBand(sv, pBand as 0 | 1 | 2)) continue
          if ((pBand === 2 ? m.up2[i] : pBand === 1 ? m.up[i] : m.tiles[i]) !== 1) continue
          const cx = (x + 0.5) * s, cy = (y + 0.5) * s, r = 1.8 * k
          const d = sv & 7
          g.beginPath()
          if (d === 1) { g.moveTo(cx + r, cy); g.lineTo(cx - r, cy - r); g.lineTo(cx - r, cy + r) }
          else if (d === 2) { g.moveTo(cx - r, cy); g.lineTo(cx + r, cy - r); g.lineTo(cx + r, cy + r) }
          else if (d === 3) { g.moveTo(cx, cy + r); g.lineTo(cx - r, cy - r); g.lineTo(cx + r, cy - r) }
          else { g.moveTo(cx, cy - r); g.lineTo(cx - r, cy + r); g.lineTo(cx + r, cy + r) }
          g.closePath(); g.fill()
        }
    }
    for (const e of m.exits) {
      if (pBand !== 0 || !e.discovered) continue // v43：出口都在主层，上层视图不画
      g.fillStyle = '#f5e37a'
      g.shadowColor = '#f5e37a'; g.shadowBlur = 5 * k
      g.beginPath(); g.arc((e.x + 0.5) * s, (e.y + 0.5) * s, 2.5 * k, 0, 7); g.fill()
      g.shadowBlur = 0
    }
    // 标注（v32）：已探索区域内的容器（亮=未搜刮 暗=已搜刮）与地面物品；v43：按层过滤
    for (const st of m.structures) {
      if (!CONTAINER_KINDS.includes(st.kind)) continue
      if (pBand !== (st.floor ?? 0)) continue
      const idx = Math.floor(st.y + st.h / 2) * m.w + Math.floor(st.x + st.w / 2)
      if (idx < 0 || idx >= m.w * m.h || !engine.explored[idx]) continue
      g.fillStyle = st.looted ? 'rgba(160,140,90,0.35)' : '#c9a03a'
      g.fillRect((st.x + st.w / 2) * s - 1.5 * k, (st.y + st.h / 2) * s - 1.5 * k, 3 * k, 3 * k)
    }
    for (const it of m.items) {
      if (pBand !== ((it.z ?? 0) >= 4.5 ? 2 : (it.z ?? 0) >= 1.5 ? 1 : 0)) continue // v54：三层高度带
      const idx = Math.floor(it.y) * m.w + Math.floor(it.x)
      if (idx < 0 || idx >= m.w * m.h || !engine.explored[idx]) continue
      g.fillStyle = '#6ad9c9'
      g.fillRect(it.x * s - 0.75 * k, it.y * s - 0.75 * k, 1.5 * k, 1.5 * k)
    }
    // NPC：软绿点（据点居民位置；v46：多层按 NPC 所在楼层带过滤——夹楼居民在上层视图显示）
    for (const n of engine.npcs) {
      if ((m.floors ?? 1) > 1 && (n.floor ?? 0) !== pBand) continue
      g.fillStyle = '#7ac97a'
      g.beginPath(); g.arc(n.x * s, n.y * s, 2 * k, 0, 7); g.fill()
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
  // v40：据点是主层级的子层级——顶部信息栏的层级号显示主层级（如 Alpha 基地显示 LEVEL 1 而非 LEVEL 101）
  const outpostDef = Object.values(OUTPOSTS).find((o) => o.levelId === p.level)
  const dispId = outpostDef?.parent ?? def.id
  const interact = engine.getInteract()
  const now = Date.now()
  // 移动端横屏：小地图默认折叠，点击展开为半透明大地图浮层
  const landscape = isMobile && typeof window !== 'undefined' && window.innerWidth > window.innerHeight
  const [mapOpen, setMapOpen] = useState(false)
  // v29b：快捷栏 touchstart 直触后抑制紧随其后的合成 click（React 根委托为 passive，不能 preventDefault）
  const hotbarTouchT = useRef(0)
  const bigMapSize = Math.max(180, Math.floor(Math.min(window.innerHeight - 96, window.innerWidth * 0.45, 360)))

  // 当前区域名（无限层=所在区段/变种房间；据点=所在区域；其余层级不显示）
  let areaName: string | null = null
  let curVariant: string | null = null // v41：当前区段变体（衔尾段=ouroboros，BRC 声望显示用）
  const infMap = engine.map?.inf
  if (infMap) {
    const impl = infiniteImplFor(engine.levelDef.id)
    if (engine.levelDef.id === 5) {
      // v55：L5 区域名按大厅/房间矩形判定（l5RegionAt——区域间以走廊为界；走廊瓦片显示「红地毯走廊」）
      const reg = l5RegionAt(infMap.seed, Math.floor(infMap.ox + p.x), Math.floor(infMap.oy + p.y))
      curVariant = reg?.variant ?? null
      areaName = reg?.variant ? (impl.variantNames?.[reg.variant] ?? null) : '红地毯走廊'
    } else if (impl?.variantOf) {
      const v = impl.variantOf(infMap.seed, Math.floor((infMap.ox + p.x) / CS), Math.floor((infMap.oy + p.y) / CS))
      curVariant = v
      areaName = impl.variantNames?.[v] ?? null
    }
  } else if (engine.map?.zones?.length) {
    // v43：多层据点——区域名只取玩家所在楼层带（z 缺省 0=主层；v54：三层带 2）
    const zBand = (engine.map.floors ?? 1) > 1 ? ((p.z ?? 0) >= 4.5 ? 2 : (p.z ?? 0) >= 1.5 ? 1 : 0) : 0
    // v54：矩形区域优先——玩家落在带 x0/y0/x1/y1 的范围矩形内（同楼层带）直接取该区域名；否则维持最近点逻辑
    let rectHit: string | null = null
    for (const z of engine.map.zones) {
      if ((z.z ?? 0) !== zBand || z.x0 === undefined) continue
      if (p.x >= z.x0 && p.x <= (z.x1 ?? z.x0) && p.y >= (z.y0 ?? z.y) && p.y <= (z.y1 ?? z.y)) { rectHit = z.name; break }
    }
    if (rectHit) areaName = rectHit
    else {
      let bd = 1e9
      for (const z of engine.map.zones) {
        if ((z.z ?? 0) !== zBand) continue
        const d = Math.hypot(z.x - p.x, z.y - p.y)
        if (d < bd) { bd = d; areaName = z.name }
      }
    }
  }

  // 出口方向指引（默认 30m 内，DevPanel 可增大；附近无出口但有定居点地标时改为蓝色地标指引）
  const exit = engine.nearestExit()
  const hintDist = engine.dev.hintDist
  let exitArrow: { rel: number; d: number; landmark?: boolean } | null = null
  if (exit && exit.d <= hintDist) {
    exitArrow = { rel: exitArrowRotation(p.x, p.y, look.yaw, exit.x + 0.5, exit.y + 0.5), d: exit.d }
  } else {
    const lm = engine.nearestLandmark()
    if (lm && lm.d <= hintDist) {
      exitArrow = { rel: exitArrowRotation(p.x, p.y, look.yaw, lm.x, lm.y), d: lm.d, landmark: true }
    }
  }

  // v13 楼层契约（防御性读取：另一 agent 实现中——player.floor 0 起始 / map.floors 总层数，缺省或多层数据不存在则不显示）
  const pf = (p as unknown as { floor?: unknown }).floor
  const mf = (engine.map as unknown as { floors?: unknown } | null)?.floors
  const floorInfo = typeof pf === 'number' && Number.isFinite(pf) && (engine.map?.hasUnderground || (typeof mf === 'number' && mf > 1))
    ? { cur: Math.floor(pf), total: Math.floor(typeof mf === 'number' ? mf : 1), underground: !!engine.map?.hasUnderground }
    : null
  const floorText = floorInfo ? (floorInfo.underground ? (floorInfo.cur === -1 ? '地下层' : '地表') : `${floorInfo.cur + 1}F/共${floorInfo.total}层`) : null

  // 当前生效的现象（engine.step 每帧重算；本组件由 App 的 0.12s tick 驱动重渲染）
  const phenomena = engine.activePhenomena.map((id) => PHENOMENA[id]).filter(Boolean)

  const vitals = (
    <div className={`flex flex-col gap-1 ${isMobile ? 'w-[120px] max-md:landscape:w-auto max-md:landscape:flex-row max-md:landscape:gap-2.5' : 'w-[200px]'}`}>
      <Bar color="var(--blood)" value={p.hp} icon={<IconHP width={14} height={14} />} label="HP" compact={isMobile} critical={p.hp <= 30} />
      <Bar color="var(--stamina)" value={p.stamina} icon={<IconStamina width={14} height={14} />} label="体力" compact={isMobile} critical={p.stamina <= 5} />
      <Bar color="var(--hunger)" value={p.hunger} icon={<IconHunger width={14} height={14} />} label="饥饿" compact={isMobile} critical={p.hunger <= 25} />
      <Bar color="var(--thirst)" value={p.thirst} icon={<IconThirst width={14} height={14} />} label="口渴" compact={isMobile} critical={p.thirst <= 25} />
      <Bar color="var(--sanity)" value={p.sanity} icon={<IconSanity width={14} height={14} />} label="理智" compact={isMobile} critical={p.sanity <= 20} />
    </div>
  )

  const hotbar = (
    <div className="flex flex-col items-center gap-1">
      {/* 选中物品名（快捷栏上方） */}
      {p.hotbar[p.selected] && (
        <div
          className="font-mono2 px-2 py-0.5 text-[11px]"
          style={{ color: 'var(--amber)', background: 'color-mix(in srgb, var(--panel) 85%, transparent)', border: '1px solid var(--panel-edge)' }}
        >
          {ITEMS[p.hotbar[p.selected]!.type]?.name ?? p.hotbar[p.selected]!.type}
        </div>
      )}
      <div className="flex gap-1 overflow-x-auto">
      {p.hotbar.map((s, i) => (
        <button
          key={i}
          className="relative flex shrink-0 items-center justify-center border"
          style={{
            width: isMobile ? 40 : 44, height: isMobile ? 40 : 44,
            borderColor: p.selected === i ? 'var(--amber)' : 'var(--panel-edge)',
            boxShadow: p.selected === i ? 'inset 0 0 6px color-mix(in srgb, var(--amber) 50%, transparent)' : 'none',
            background: 'color-mix(in srgb, var(--panel) 85%, transparent)',
            // v29b：多点触控下快捷栏必须可点——touchstart 直触（合成 click 用时间戳抑制），
            // touchAction:none 防止浏览器把第二指触摸当作手势吃掉；摇杆/视角层不覆盖此热区（HUD z-30 在上）
            touchAction: 'none',
            WebkitTouchCallout: 'none',
          }}
          onTouchStart={isMobile ? (e) => { e.stopPropagation(); hotbarTouchT.current = Date.now(); onSelectSlot(i) } : undefined}
          onClick={() => { if (Date.now() - hotbarTouchT.current < 600) return; onSelectSlot(i) }}
          onContextMenu={(e) => { e.preventDefault(); onUseSlot(i) }}
          onDoubleClick={() => onUseSlot(i)}
        >
          <span className="font-mono2 absolute left-0.5 top-0 text-[8px]" style={{ color: 'var(--text-dim)' }}>{i + 1}</span>
          {s && (
            <>
              <ItemGlyph type={s.type} count={s.count} />
              {s.count > 1 && <span className="font-mono2 absolute bottom-0 right-0.5 text-[9px]" style={{ color: 'var(--amber)' }}>{s.count}</span>}
            </>
          )}
        </button>
      ))}
      </div>
    </div>
  )

  return (
    <div className="pointer-events-none fixed inset-0 z-30" style={{ padding: 'calc(env(safe-area-inset-top) + 8px) calc(env(safe-area-inset-right) + 8px) calc(env(safe-area-inset-bottom) + 8px) calc(env(safe-area-inset-left) + 8px)' }}>
      {/* 左上：状态 + 当前现象 */}
      <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
        <div className="hud-panel pointer-events-auto p-2">
          {vitals}
          {/* 福友玉（口袋栏）：实体感应——随最近实体距离改变温度提示 */}
          {p.equip.pockets.some((s) => s?.type === 'fuyouyu') && (() => {
            let best = Infinity
            for (const e of engine.map?.entities ?? []) {
              if (e.dead || e.hidden) continue
              best = Math.min(best, Math.hypot(e.x - p.x, e.y - p.y))
            }
            const [txt, c] = best < 6 ? ['发烫——实体近在咫尺', 'var(--blood)']
              : best < 15 ? ['微温——实体就在附近', 'var(--amber)']
                : best < 30 ? ['温润——实体在远处游荡', 'var(--text-dim)']
                  : ['平静——四周暂无实体', 'var(--text-dim)']
            return <div className="font-mono2 mt-1.5 border-t pt-1.5 text-[10px]" style={{ color: c, borderColor: 'var(--panel-edge)' }}>◈ 福友玉：{txt}</div>
          })()}
        </div>
        {phenomena.length > 0 && (
          <div className="hud-panel pointer-events-auto flex flex-col gap-1 px-2 py-1.5">
            {phenomena.map((d) => {
              const Icon = PHEN_ICON[d.icon]
              return (
                <div key={d.id} className="flex items-center gap-1.5" title={`${d.name}（罕见度：${rarityText(d)}）\n${d.desc}`}>
                  <span style={{ color: 'var(--sanity)', width: 14, height: 14 }}><Icon width={14} height={14} /></span>
                  <span className="font-mono2 text-[10px]" style={{ color: 'var(--text-dim)' }}>{d.name}</span>
                </div>
              )
            })}
          </div>
        )}
        {/* v35：身处据点时显示与该据点团体的声望；v41：衔尾段（BRC 领域）显示 BRC 声望；v45：信众宣传间（信众领地）显示 jerry 声望 */}
        {(() => {
          const o = outpostDef
          const factionId = o ? o.faction : curVariant === 'ouroboros' ? 'brc' : engine.jerryTerritory ? 'jerry' : null
          const fac = factionId ? FACTIONS[factionId] : null
          if (!fac?.hasRep) return null
          const rep = engine.rep[fac.id] ?? 0
          return (
            <div className="hud-panel pointer-events-auto px-2 py-1" title={`与${fac.name}的声望（图鉴「团体」页查看详情）`}>
              <span className="font-mono2 text-[10px]" style={{ color: fac.sub ?? fac.color }}>
                {fac.en} 声望 {rep > 0 ? '+' : ''}{rep}
                {/* v45：Level 274 内显示教化值（接触鹉主积累；满 100 无法主动离开） */}
                {p.level === 274 && engine.indoctrination > 0 ? ` · 教化 ${Math.round(engine.indoctrination)}/100` : ''}
              </span>
            </div>
          )
        })()}
      </div>

      {/* 顶部中央：位置 + 消息（移动端；v10 修复与状态栏/开发者面板重叠——
          移动端改为左右留白锚定，为左上状态条与右上按钮让位，日志限宽限高且纯展示） */}
      <div
        className={isMobile ? 'absolute top-3 text-center' : 'absolute left-1/2 top-3 -translate-x-1/2 text-center'}
        style={isMobile ? { left: landscape ? 378 : 156, right: landscape ? 118 : 110, pointerEvents: 'none' } : undefined}
      >
        <div className="hud-panel font-mono2 inline-block max-w-full truncate px-3 py-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
          {isMobile
            ? `L${dispId} ${def.name}${floorText ? ` · ${floorText}` : ''} · 磁带 ${p.tapes}/${WIN_TAPES}`
            : `LEVEL ${dispId} · ${def.name} · B${dispId}${floorText ? ` · ${floorText}` : ''} · 磁带 ${p.tapes}/${WIN_TAPES}`}
        </div>
        {isMobile && (
          <div className="pointer-events-none mx-auto mt-1 max-h-[3.6em] space-y-0.5 overflow-hidden" style={{ maxWidth: '100%' }}>
            {log.slice(-2).map((l) => (
              <div key={l.id} className="hud-log-line font-mono2 truncate text-[11px]" style={{ color: l.kind === 'loot' ? 'var(--amber)' : l.kind === 'damage' ? 'var(--blood)' : l.kind === 'lore' ? 'var(--sanity)' : 'var(--text-dim)', opacity: Math.min(1, (now - l.t) / 4000 > 1 ? 0.4 : 1), textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
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
        {/* 当前区域名（区段/变种房间/据点区域） */}
        {areaName && (
          <div className="hud-panel font-mono2 px-2 py-0.5 text-[10px]" style={{ color: 'var(--amber)' }}>{areaName}</div>
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
            <div key={l.id} className="hud-log-line font-mono2 truncate text-[12px]" style={{ color: l.kind === 'loot' ? 'var(--amber)' : l.kind === 'damage' ? 'var(--blood)' : l.kind === 'lore' ? 'var(--sanity)' : 'var(--text-dim)', opacity: now - l.t > 4000 ? 0.4 : 1, textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
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
      {/* v51：人制品效应中始终显示饥饿画面特效（哪怕刚吃饱） */}
      {(p.hunger <= 25 || engine.manmadeT > 0) && (
        <div className="pointer-events-none fixed inset-0 z-[31] anim-hungerPulse" style={{ boxShadow: `inset 0 0 ${90 + 60 * fxScale}px 30px rgba(201,138,61,${0.35 + 0.3 * fxScale})` }} />
      )}
      {/* 口渴 ≤25：边缘干涩发黄 + 轻微模糊（口干眼涩）；v54：人制品效应中始终显示（与饥饿特效并列） */}
      {(p.thirst <= 25 || engine.manmadeT > 0) && (
        <div
          className="pointer-events-none fixed inset-0 z-[31] anim-thirstPulse"
          style={{
            boxShadow: `inset 0 0 ${80 + 50 * fxScale}px 26px rgba(214,186,110,${0.3 + 0.25 * fxScale})`,
            backdropFilter: 'blur(1.2px)',
            WebkitBackdropFilter: 'blur(1.2px)',
          }}
        />
      )}
      {/* v55：疫疾感染特效（隐藏数值——只有风味画面表现，不出现任何数值/提示文本）。
          一阶平和期：边缘微弱病绿时有时无；二阶潜藏期：叠加间歇性轻微模糊（咳嗽走引擎噪音事件）；
          三阶并发期：全视野病绿浸染常驻；四阶坏死期：更强的搏动浸染 */}
      {(() => {
        const st = Math.min(4, Math.floor(p.infection / 100))
        if (st <= 0) return null
        const t = engine.time
        return (
          <>
            {(st >= 3 || t % 6 < 2) && (
              <div
                className={`pointer-events-none fixed inset-0 z-[31] ${st >= 4 ? 'anim-hpPulse' : ''}`}
                style={{
                  boxShadow: st >= 3
                    ? `inset 0 0 ${st >= 4 ? 190 : 150}px 50px rgba(122,154,74,${st >= 4 ? 0.5 : 0.38})`
                    : 'inset 0 0 90px 24px rgba(122,154,74,0.16)',
                  background: st >= 3 ? 'rgba(96,128,54,0.08)' : undefined,
                }}
              />
            )}
            {st === 2 && t % 11 < 1.6 && (
              <div className="pointer-events-none fixed inset-0 z-[30]" style={{ backdropFilter: 'blur(1.6px)', WebkitBackdropFilter: 'blur(1.6px)' }} />
            )}
          </>
        )
      })()}
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
      {/* v51：Nguithr'xurh 镇静剂麻痹——视野模糊（毛玻璃覆盖层） */}
      {engine.webbedT > 0 && (
        <div className="pointer-events-none fixed inset-0 z-[30]" style={{ backdropFilter: 'blur(3px) brightness(0.92)', WebkitBackdropFilter: 'blur(3px) brightness(0.92)' }} />
      )}

      {/* 出口方向指引（蓝色=定居点地标） */}
      {exitArrow && (
        <div
          className="pointer-events-none fixed z-[31] font-mono2 flex flex-col items-center text-[12px]"
          style={{
            color: exitArrow.landmark ? '#6abfff' : 'var(--exit)',
            left: '50%', top: '18%',
            transform: `translateX(-50%) rotate(${exitArrow.rel}rad)`,
            opacity: 0.75,
          }}
        >
          <div style={{ fontSize: 26, textShadow: exitArrow.landmark ? '0 0 8px #6abfff' : '0 0 8px var(--exit)' }}>➤</div>
        </div>
      )}
      {exitArrow && (
        <div className="pointer-events-none fixed left-1/2 top-[24%] z-[31] -translate-x-1/2 font-mono2 text-[11px]" style={{ color: exitArrow.landmark ? '#6abfff' : 'var(--exit)', opacity: 0.7 }}>
          {exitArrow.landmark
            ? `你瞥见一抹鲜亮的颜色——那是定居点地标的方向（${Math.round(exitArrow.d)}m）`
            : `你感觉到${exitArrow.d < 8 ? '明显的' : exitArrow.d > 60 ? '一丝遥远的' : '一丝'}气流（${Math.round(exitArrow.d)}m）`}
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
                L{dispId} · {def.name} · 当前 {floorInfo.cur + 1}F / 共{floorInfo.total}层
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
  // 给予物品翻页（物品总数固定，无需重置页码）
  const [itemPage, setItemPage] = useState(0)
  const allItems = Object.values(ITEMS)
  const perPage = 16
  const itemPages = Math.max(1, Math.ceil(allItems.length / perPage))
  const pageItems = allItems.slice(itemPage * perPage, (itemPage + 1) * perPage)
  // 召唤实体按层分页（默认页=玩家当前所在层；「其他」=无自然生成层级的事件实体；
  // v54：末页「全部层」=全部实体一页列出，含事件生成与无生成路径的）
  const entPages = [
    ...LEVELS.map((lv) => ({
      label: `${levelLabel(lv.id)} · ${lv.name}`,
      // v34：生成池 + 特殊事件归属（如 L1 的笑魇/手臂）都计入本层
      ents: Object.values(ENTITIES).filter((d) => entitySpawnLevels(d.type).some((s) => s.id === lv.id)),
    })),
    { label: '其他（无任何生成路径）', ents: Object.values(ENTITIES).filter((d) => entitySpawnLevels(d.type).length === 0) },
    { label: '全部层', ents: Object.values(ENTITIES) },
  ]
  const [entPage, setEntPage] = useState(() => {
    const i = LEVELS.findIndex((lv) => lv.id === engine.player.level)
    return i >= 0 ? i : 0
  })
  const curEntPage = entPages[Math.min(entPage, entPages.length - 1)]
  // v54：召唤页子页切换（实体 / 物品 / 装饰物）
  const [spawnSub, setSpawnSub] = useState<'entity' | 'item' | 'decor'>('entity')
  // v54：召唤装饰物（decorRegistry 结构类条目，按生成层级分页；decal:/prop: 为渲染侧贴花/道具，不可放置；
  // 末页「全部层」=全部层级分组合并一页列出）
  const decorPages = [
    ...DECOR_LEVEL_ORDER.map((lv) => ({
      label: lv,
      items: DECOR_REGISTRY.filter((d) => !d.id.startsWith('decal:') && !d.id.startsWith('prop:') && d.levels.includes(lv)),
    })).filter((g) => g.items.length > 0),
    {
      label: '全部层',
      items: DECOR_REGISTRY.filter((d) => !d.id.startsWith('decal:') && !d.id.startsWith('prop:') && d.levels.length > 0),
    },
  ]
  const [decorPage, setDecorPage] = useState(() => {
    const cur = p.level === 274 ? 'L274' : p.level >= 100 ? `据点${p.level}` : `L${levelNo(p.level)}`
    const i = decorPages.findIndex((g) => g.label === cur)
    return i >= 0 ? i : 0
  })
  const curDecorPage = decorPages[Math.min(decorPage, decorPages.length - 1)]
  // 图鉴全开（世界页开关）：开启时备份 br_codex/br_codex_seen 再全开；关闭时从备份原样恢复
  const [codexAll, setCodexAll] = useState(() => storage.get('br_codex_devbak') !== null)
  const toggleCodexAll = () => {
    if (!codexAll) {
      if (storage.get('br_codex_devbak') === null) {
        storage.set('br_codex_devbak', storage.get('br_codex') ?? '{}')
        storage.set('br_codex_seen_devbak', storage.get('br_codex_seen') ?? '{}')
      }
      const c: Record<string, boolean> = {}
      for (const t of Object.keys(ITEMS)) c[t] = true
      for (const t of Object.keys(ENTITIES)) c[t] = true
      for (const lv of LEVELS) c[`level_${lv.id}`] = true
      for (const id of Object.keys(DOCS)) c[`doc_${id}`] = true
      // v41：全开扩展到据点/固定 NPC（团体页本就不设限；随机 NPC 只显示遇见过的——其 npc_ 键已在图鉴中）
      for (const o of Object.values(OUTPOSTS)) c[`outpost_${o.id}`] = true
      for (const id of Object.keys(NPCS)) c[`npc_${id}`] = true
      storage.set('br_codex', JSON.stringify(c))
      const seen: Record<string, number> = {}
      for (const t of Object.keys(ENTITIES)) seen[t] = 6
      storage.set('br_codex_seen', JSON.stringify(seen))
      // v56 六轮：图鉴全开同时解锁全部电台音乐（heardSongs 补全，随存档持久）
      engine.heardSongs = MUSIC_LIBRARY.map((e) => e.id)
      setCodexAll(true)
    } else {
      const bak = storage.get('br_codex_devbak')
      const bakSeen = storage.get('br_codex_seen_devbak')
      if (bak !== null) storage.set('br_codex', bak)
      if (bakSeen !== null) storage.set('br_codex_seen', bakSeen)
      storage.remove('br_codex_devbak')
      storage.remove('br_codex_seen_devbak')
      setCodexAll(false)
    }
  }
  const fps = useFps()
  const info = tab === 'info' || tab === 'teleport' ? engine.devInfo() : null

  const stats: { key: 'hp' | 'sanity' | 'hunger' | 'thirst' | 'stamina' | 'battery'; label: string; color: string }[] = [
    { key: 'hp', label: '生命', color: 'var(--blood)' },
    { key: 'sanity', label: '理智', color: 'var(--sanity)' },
    { key: 'hunger', label: '饥饿', color: 'var(--hunger)' },
    { key: 'thirst', label: '口渴', color: 'var(--thirst)' },
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
                {/* v54：召唤页子页切换（实体 / 物品 / 装饰物），排在召唤页顶部 */}
                <div className="mb-2 flex gap-1">
                  {([['entity', '实体'], ['item', '物品'], ['decor', '装饰物']] as const).map(([k, label]) => (
                    <DevBtn key={k} wide active={spawnSub === k} onClick={() => setSpawnSub(k)}>{label}</DevBtn>
                  ))}
                </div>
                {spawnSub === 'entity' && (
                <DevSection label={`召唤实体（前方 3 格 · 共 ${Object.keys(ENTITIES).length} 种 · 按层分页，末页全部层）`}>
                  <div className="mb-1 flex items-center gap-1">
                    <DevBtn onClick={() => setEntPage((n) => (n - 1 + entPages.length) % entPages.length)}>‹</DevBtn>
                    <span className="flex-1 text-center" style={{ color: 'var(--text-dim)' }}>{curEntPage.label}（{curEntPage.ents.length} 种）</span>
                    <DevBtn onClick={() => setEntPage((n) => (n + 1) % entPages.length)}>›</DevBtn>
                  </div>
                  {curEntPage.ents.length === 0 && (
                    <div className="mb-1" style={{ color: 'var(--text-dim)' }}>本层无自然生成实体</div>
                  )}
                  <div className="grid grid-cols-3 gap-1">
                    {curEntPage.ents.map((d) => (
                      <DevBtn key={d.type} title={entitySpawnLevels(d.type).some((s) => s.event) ? `${d.desc}（特殊事件生成）` : d.desc} onClick={() => engine.devSpawnEntity(d.type)}>
                        <span style={{ color: d.color }}>●</span> {d.name}
                      </DevBtn>
                    ))}
                  </div>
                  <div className="mt-1">
                    <DevBtn wide onClick={() => engine.devSpawnAllEntities()}>⚠ 每种一只（环绕召唤）</DevBtn>
                  </div>
                </DevSection>
                )}
                {spawnSub === 'item' && (
                <DevSection label={`给予物品（第 ${itemPage + 1}/${itemPages} 页 · 共 ${allItems.length} 种 · 点名称入包 / ▾ 脚下）`}>
                  <div className="grid grid-cols-2 gap-1">
                    {pageItems.map((d) => (
                      <div key={d.type} className="flex gap-0.5">
                        <DevBtn onClick={() => engine.devGiveItem(d.type)} title={d.desc}>
                          <span className="inline-block align-middle" style={{ transform: 'scale(0.75)', transformOrigin: 'left center' }}><ItemGlyph type={d.type} size={16} /></span>
                          {d.name}
                        </DevBtn>
                        <DevBtn onClick={() => engine.devGiveItem(d.type, true)} title={`${d.name} 生成在脚下`}>▾</DevBtn>
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <DevBtn onClick={() => setItemPage((n) => Math.max(0, n - 1))}>‹ 上一页</DevBtn>
                    <span className="flex-1 text-center" style={{ color: 'var(--text-dim)' }}>{itemPage + 1} / {itemPages}</span>
                    <DevBtn onClick={() => setItemPage((n) => Math.min(itemPages - 1, n + 1))}>下一页 ›</DevBtn>
                  </div>
                  <div className="mt-1">
                    <DevBtn wide onClick={() => engine.devGiveSupplies()}>🎁 全套补给（杏仁水×5 罐头×5 电池×3）</DevBtn>
                  </div>
                </DevSection>
                )}
                {spawnSub === 'decor' && (
                /* v54：召唤装饰物（decorRegistry 结构类，按层级分类分页；■实心 □非实心） */
                <DevSection label={`召唤装饰物（面前 1 格 · 按层级分页，末页全部层）`}>
                  <div className="mb-1 flex items-center gap-1">
                    <DevBtn onClick={() => setDecorPage((n) => (n - 1 + decorPages.length) % decorPages.length)}>‹</DevBtn>
                    <span className="flex-1 text-center" style={{ color: 'var(--text-dim)' }}>{curDecorPage.label}（{curDecorPage.items.length} 种）</span>
                    <DevBtn onClick={() => setDecorPage((n) => (n + 1) % decorPages.length)}>›</DevBtn>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {curDecorPage.items.map((d) => (
                      <DevBtn key={d.id} title={d.note ?? d.name} onClick={() => engine.devSpawnDecor(d.id)}>
                        {d.cat === 'solid' ? '■' : '□'} {d.name}
                      </DevBtn>
                    ))}
                  </div>
                </DevSection>
                )}
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
                        className="min-w-0 flex-1 accent-[var(--amber)]"
                        style={{ height: 28 }}
                        onChange={(e) => engine.devSetStat(s.key, Number(e.target.value))}
                      />
                      <span className="w-7 shrink-0 text-right" style={{ color: 'var(--text-dim)' }}>{Math.round(p[s.key])}</span>
                      <DevBtn onClick={() => engine.devSetStat(s.key, 100)}>满</DevBtn>
                      <DevBtn onClick={() => engine.devSetStat(s.key, s.key === 'hp' ? 1 : 0)}>空</DevBtn>
                    </div>
                  ))}
                  {/* v55：感染值（疫疾，游戏内隐藏——仅 DevPanel 可见可调；0-450 覆盖四阶段） */}
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className="w-8 shrink-0" style={{ color: '#7a9a4a' }}>感染</span>
                    <input
                      type="range" min={0} max={450} value={Math.round(p.infection)}
                      className="min-w-0 flex-1 accent-[#7a9a4a]"
                      style={{ height: 28 }}
                      onChange={(e) => engine.devSetStat('infection', Number(e.target.value))}
                    />
                    <span className="w-7 shrink-0 text-right" style={{ color: 'var(--text-dim)' }}>{Math.round(p.infection)}</span>
                    <DevBtn onClick={() => engine.devSetStat('infection', 0)}>清零</DevBtn>
                  </div>
                </DevSection>
                <DevSection label="团体声望（点击调整）">
                  {Object.values(FACTIONS).filter((f) => f.hasRep).map((f) => (
                    <div key={f.id} className="mb-1 flex items-center gap-1.5">
                      <span className="w-14 shrink-0 font-mono2" style={{ color: f.sub ?? f.color }}>{f.en}</span>
                      <DevBtn onClick={() => engine.changeRep(f.id, -10)}>−10</DevBtn>
                      <DevBtn onClick={() => engine.changeRep(f.id, -1)}>−1</DevBtn>
                      <span className="flex-1 text-center" style={{ color: f.sub ?? f.color }}>{engine.rep[f.id] ?? 0}</span>
                      <DevBtn onClick={() => engine.changeRep(f.id, 1)}>＋1</DevBtn>
                      <DevBtn onClick={() => engine.changeRep(f.id, 10)}>＋10</DevBtn>
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
                    <DevBtn onClick={() => engine.devTeleport('landmark')}>🚩 最近地标</DevBtn>
                    <DevBtn onClick={() => engine.devTeleport('spawn')}>⌂ 出生点</DevBtn>
                    {engine.levelDef.id === 0 && (
                      <DevBtn onClick={() => engine.devTestField()} title="仅教学关卡：生成 80×80 无墙空旷测试场地并传送（不会自然生成）">⬜ 测试场地（L0）</DevBtn>
                    )}
                  </div>
                </DevSection>
                {engine.levelDef.exits.length > 0 && (
                  <DevSection label="召唤出口（仅本层可生成；已生成的 ⇢ 直接传送）">
                    <div className="grid grid-cols-2 gap-1">
                      {engine.levelDef.exits.map((e) => {
                        // v54：本层已生成该出口时不再重复生成，点击改为直接传送
                        const existing = engine.map?.exits.some((x) => x.def.kind === e.kind)
                        return (
                          <DevBtn
                            key={e.kind}
                            title={existing ? `出口「${e.name}」已生成——点击直接传送` : `在附近召唤出口「${e.name}」`}
                            onClick={() => { if (!engine.devGotoExitKind(e.kind)) engine.devSummonExit(e.kind) }}
                          >
                            {existing ? '⇢' : '🚪'} {e.name}{existing ? '（传送）' : ''}
                          </DevBtn>
                        )
                      })}
                    </div>
                  </DevSection>
                )}
                {info && (
                  <DevSection label="出口与地标方位">
                    {info.exits.length === 0 && <div style={{ color: 'var(--text-dim)' }}>本层无出口</div>}
                    {info.exits.map((e, i) => (
                      <div key={i} style={{ color: e.discovered ? 'var(--exit)' : 'var(--text-dim)' }}>
                        {e.name} · {e.d.toFixed(1)}m {e.discovered ? '（已发现）' : ''}
                      </div>
                    ))}
                    {info.landmarks.map((l, i) => (
                      <div key={`lm${i}`} style={{ color: '#6abfff' }}>
                        🚩 {l.name} · {l.d.toFixed(1)}m
                      </div>
                    ))}
                  </DevSection>
                )}
                {(() => {
                  const alive = engine.npcs.filter((n) => !n.dead)
                  if (!alive.length) return null
                  return (
                    <DevSection label="传送到 NPC（本层已生成）">
                      <div className="grid grid-cols-2 gap-1">
                        {alive.map((n) => (
                          <DevBtn key={n.id} title={`传送到 ${n.def.name}（${n.def.role}）身旁`} onClick={() => engine.devGotoNpc(n.id)}>
                            🧑 {n.def.name}
                          </DevBtn>
                        ))}
                      </div>
                    </DevSection>
                  )
                })()}
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
                  <div className="flex flex-wrap gap-1">
                    {LEVELS.map((lv) => (
                      <DevBtn key={lv.id} active={p.level === lv.id} onClick={() => engine.devJump(lv.id)}>L{levelNo(lv.id)}</DevBtn>
                    ))}
                  </div>
                </DevSection>
                <DevSection label="据点跳转">
                  <div className="grid grid-cols-2 gap-1">
                    {Object.values(OUTPOSTS).map((o) => {
                      // v54：去 emoji；左侧小框显示所属主层级（parent=自身 levelId 的独立层显示「–」）；
                      // 按钮应用所属团体主题色（边框+底色叠乘，与图鉴据点卡一致）
                      const fc = FACTIONS[o.faction]?.color ?? 'var(--amber)'
                      const parentLabel = o.parent === o.levelId ? '–' : `L${o.parent}`
                      return (
                        <button
                          key={o.id}
                          className="flex items-center gap-1.5 border px-2 py-1.5"
                          title={o.intro[0]}
                          style={{
                            borderColor: fc,
                            background: `color-mix(in srgb, ${fc} 14%, var(--panel))`,
                            color: p.level === o.levelId ? 'var(--amber)' : 'var(--text)',
                            minHeight: 32,
                          }}
                          onClick={() => { engine.devJumpOutpost(o.id); audio.uiTick() }}
                        >
                          <span className="font-mono2 flex shrink-0 items-center justify-center border px-0.5 text-[9px]" style={{ borderColor: fc, color: fc, minWidth: 24, height: 16 }}>{parentLabel}</span>
                          <span className="min-w-0 flex-1 truncate text-left">{o.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </DevSection>
                <DevSection label={`出口提示距离：${engine.dev.hintDist}m（默认 30m）`}>
                  <div className="flex items-center gap-1">
                    <DevBtn onClick={() => { engine.dev.hintDist = Math.max(10, engine.dev.hintDist - 10) }}>−10m</DevBtn>
                    <DevBtn onClick={() => { engine.dev.hintDist = Math.min(500, engine.dev.hintDist + 10) }}>＋10m</DevBtn>
                    <DevBtn onClick={() => { engine.dev.hintDist = Math.min(500, engine.dev.hintDist + 50) }}>＋50m</DevBtn>
                    <DevBtn onClick={() => { engine.dev.hintDist = 30 }}>重置</DevBtn>
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
                    <DevBtn active={engine.dev.bright} onClick={() => { engine.dev.bright = !engine.dev.bright }} title="一键照明：层级全局增亮——灯光强度拉满、环境光常亮，无视停电/熄灯区/层级光照系数">一键照明</DevBtn>
                    <DevBtn active={codexAll} onClick={toggleCodexAll} title="图鉴全开：实体/物品/层级/文档全部解锁（关闭后恢复到开启前的图鉴进度）">图鉴全开</DevBtn>
                  </div>
                </DevSection>
                <DevSection label="现象（当前层可触发）">
                  {(() => {
                    const lvl = engine.levelDef.id
                    const list = Object.values(PHENOMENA).filter((d) => !d.levels || d.levels.includes(lvl))
                    if (!list.length) return <div style={{ color: 'var(--text-dim)' }}>本层无可触发的现象</div>
                    return (
                      <div className="space-y-1">
                        {list.map((d) => {
                          const on = engine.dev.phenOn.has(d.id)
                          const off = engine.dev.phenOff.has(d.id)
                          const activeNow = engine.activePhenomena.includes(d.id)
                          return (
                            <div key={d.id} className="flex items-center gap-1">
                              <span className="flex-1" style={{ color: activeNow ? 'var(--amber)' : 'var(--text-dim)' }} title={`${d.name}（罕见度：${rarityText(d)}）\n${d.desc}`}>
                                {activeNow ? '●' : '○'} {d.name}
                              </span>
                              <DevBtn
                                active={on}
                                title="强制开启（无视触发条件，再次点击恢复自动）"
                                onClick={() => {
                                  if (on) engine.dev.phenOn.delete(d.id)
                                  else { engine.dev.phenOn.add(d.id); engine.dev.phenOff.delete(d.id) }
                                }}
                              >开</DevBtn>
                              <DevBtn
                                active={off}
                                title="强制关闭（即使满足触发条件也不生效，再次点击恢复自动）"
                                onClick={() => {
                                  if (off) engine.dev.phenOff.delete(d.id)
                                  else { engine.dev.phenOff.add(d.id); engine.dev.phenOn.delete(d.id) }
                                }}
                              >关</DevBtn>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
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
  // ===== v25：v23/v25 新增物品专属配色（各自独特，一眼可辨） =====
  chalkstub: '#f0f0f8', megfolder: '#bf9b5f', rope: '#a8854e', divemask: '#4ac9c9',
  thingmeat: '#c95a6a', oddbook: '#8a6ac9', cavingsuit: '#d97a2e', xenonmarble: '#66e0d0',
  driedfruit: '#b86a2e', uvlamp: '#b48aff', stonekazoo: '#9a8a72', pockets: '#d96ac9',
  housekey: '#c9c9d2', wheatgrain: '#d9c25a', nails: '#7d8896', timber: '#96682e',
  presses: '#cfa12e', pamphlet: '#7ac9b0', citywater: '#3aa0d8', endnote: '#8a7a6a',
  // ===== v32：后室扩展物品 =====
  cashew: '#c9a05a',
  knife: '#c9cdd4', axe: '#d96a3a', headlamp: '#f0d060', nightvision: '#78b886', notebook: '#8a6a4a',
  fuyouyu: '#6ad9a8', squirtgun: '#4ac9e8', warpberry: '#b06ae0', royalration: '#e8c93d',
  // ===== v38：Tom 的餐馆菜肴 =====
  tomatosoup: '#d95a3a', gardensalad: '#7ac97a', garlicbread: '#d9a85a', pasta: '#e8b93c',
  meatstew: '#c96a4a', pizza: '#e08a4a', lasagna: '#d9a03d', tomsspecial: '#c95a4a',
  grilledsteak: '#a86a3e', jambread: '#c98a6a',
  // ===== v40：此前缺专属色的两件（像素图已补齐，此处仅作 404 兜底配色） =====
  disinfectant: '#9fd0d8', welcomenote: '#f0e6c0',
}
// v28：全部 66 件物品的原创像素画图标（128×128 RGBA，32×32 原稿放大，内部原创、无外部版权，
// 见 public/textures/icons/SOURCES.md；v40 补齐消毒液/欢迎纸条/Tom 餐馆 10 道菜，
// 由 scripts/gen-item-icons.py 批量生成）。优先于下方 v14/v21 旧贴图；贴图 404/加载失败时
// 依次回退旧贴图 → 手绘 SVG 兜底。
const PIXEL_ICON: Record<string, true> = {
  almond: true, axe: true, bandage: true, battery: true, canned: true, capacitor: true,
  carkey: true, cashew: true, cavingsuit: true, chalkstub: true, citywater: true, coffee: true,
  crowbar: true, divemask: true, driedfruit: true, endnote: true, flashlight: true, fuse: true,
  fuyouyu: true, gas: true, gloves: true, glowstick: true, headlamp: true, nightvision: true, housekey: true,
  keycard: true, knife: true, lighter: true, megfolder: true, nails: true, notebook: true,
  oddbook: true, pamphlet: true, pockets: true, presses: true, rabbit: true, rope: true,
  royalration: true, sedative: true, silverware: true, skeleton: true, squirtgun: true,
  stapler: true, stonekazoo: true, suit: true, tape: true, thingmeat: true, timber: true,
  uvlamp: true, wallpaper: true, warpberry: true, wheatgrain: true, wrench: true, xenonmarble: true,
  eaglecoin: true, // v35：天鹰币（像素手绘硬币）
  // ===== v40：此前无像素图的 12 件（gen-item-icons.py 批量生成） =====
  disinfectant: true, welcomenote: true,
  tomatosoup: true, gardensalad: true, garlicbread: true, pasta: true, meatstew: true,
  pizza: true, lasagna: true, tomsspecial: true, grilledsteak: true, jambread: true,
  parcel: true, // v43 物流包裹（像素手绘纸箱）
  dryshrimp: true, friedshrimp: true, // v50 旱虾 / 酥炸旱虾
  firesalt: true, liquidpain: true, // v50 火盐晶体 / 液态痛苦
  // v51：Object 5 糖果（散装 + 袋装）
  candysilver: true, candybullet: true, candygun: true, candystanley: true,
  candywaste: true, candygenius: true, candymint: true,
  candysilver_bag: true, candybullet_bag: true, candygun_bag: true, candystanley_bag: true,
  candywaste_bag: true, candygenius_bag: true, candymint_bag: true,
  manmade: true, // v51 人制品
  luckymilk: true, // v54 幸运豆奶（Object 28）
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
export function ItemGlyph({ type, size = 24, count }: { type: string; size?: number; count?: number }) {
  const [imgErr, setImgErr] = useState(false)
  const [pixelErr, setPixelErr] = useState(false)
  const def = ITEMS[type]
  const g = def?.glyph ?? 'box'
  const color = GLYPH_COLOR[type] ?? 'var(--text)'
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/')
  // v51：糖果堆叠 ≥4 显示袋装版本（糖果贩/图鉴等无 count 场景默认袋装）；<4 散装单颗
  const key = `${type}_bag`
  const bagged = (count ?? 8) >= 4 && PIXEL_ICON[key]
  // v28：原创像素画贴图优先；imageRendering: pixelated 保证小格子内像素锐利不糊
  const iconKey = bagged ? key : type
  if (PIXEL_ICON[iconKey] && !pixelErr) {
    return (
      <img
        className="pixel-icon"
        src={`${base}textures/icons/pixel/item_${iconKey}.png`}
        width={size} height={size} alt={def?.name ?? type}
        draggable={false}
        onError={() => setPixelErr(true)}
        style={{ display: 'inline-block', verticalAlign: 'middle', imageRendering: 'pixelated', filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.9))' }}
      />
    )
  }
  if (ICON_IMG[type] && !imgErr) {
    return (
      <img
        src={`${base}textures/icons/${type}.png`}
        width={size} height={size} alt={def?.name ?? type}
        draggable={false}
        onError={() => setImgErr(true)}
        style={{ display: 'inline-block', verticalAlign: 'middle', imageRendering: 'pixelated', filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.9))' }}
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
      {/* ===== v25：v23/v25 新增物品专属图标（此前全部落到默认 box） ===== */}
      {/* 粉笔头：斜放的短粉笔，带一道环纹 */}
      case 'chalk': return <><path d="M5 16.5 14.5 7l2.5 2.5L7.5 19H5z" {...s} /><path d="M12 9.5l2.5 2.5" {...s} /></>
      {/* M.E.G. 文件夹：带标签页的牛皮纸文件夹 */}
      case 'folder': return <><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" {...s} /><path d="M3 10.5h18" {...s} /></>
      {/* 尼龙绳：双圈绳卷 + 垂下的绳头 */}
      case 'rope': return <><ellipse cx="10.5" cy="10" rx="6.5" ry="5" {...s} /><ellipse cx="10.5" cy="10" rx="3" ry="2.2" {...s} /><path d="M14 14.2c2 1 3.5 2.8 4 5.3" {...s} /></>
      {/* 潜水面罩：大镜窗 + 呼吸管 */}
      case 'mask': return <><path d="M4 10a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-1.5l-1.5-1.5L9.5 15H7a3 3 0 0 1-3-3z" {...s} /><path d="M4 11H2m17-1v5a2 2 0 0 1-2 2h-1.5M19 10V4" {...s} /></>
      {/* 巨兽之肉：带骨肉的腿肉 */}
      case 'meat': return <><ellipse cx="10" cy="14.5" rx="6.5" ry="4.8" {...s} /><path d="M14.8 11 18.5 6.5" {...s} /><circle cx="18.3" cy="4.8" r="1.3" {...s} /><circle cx="20" cy="6.6" r="1.3" {...s} /></>
      {/* 书本：封面 + 书脊带 + 书名行（oddbook/pamphlet） */}
      case 'book': return <><rect x="5" y="3" width="14" height="18" rx="1.5" {...s} /><path d="M9 3v18" {...s} /><path d="M12.5 7.5h4M12.5 10.5h2.5" {...s} /></>
      {/* 氙气玻璃珠：带高光与内芯的弹珠 */}
      case 'marble': return <><circle cx="12" cy="12" r="7" {...s} /><path d="M8 10.5a4.8 4.8 0 0 1 5-3.2" {...s} /><circle cx="14" cy="14" r="1.4" {...s} /></>
      {/* 干果与干菜：两颗皱缩干果 + 果柄 */}
      case 'fruit': return <><circle cx="9" cy="14.5" r="4.5" {...s} /><circle cx="16.8" cy="12" r="3.4" {...s} /><path d="M9 10V7" {...s} /><path d="M9 7.6c0-2 1.4-2.8 3-2.6 0 2-1.4 2.8-3 2.6z" {...s} /><circle cx="8" cy="13.5" r="0.7" {...f} /><circle cx="10.5" cy="15.8" r="0.7" {...f} /><circle cx="16.3" cy="11.8" r="0.7" {...f} /></>
      {/* 人工紫外灯：灯管 + 上下紫外线 */}
      case 'uv': return <><rect x="3.5" y="10" width="17" height="4.5" rx="2.2" {...s} /><path d="M7 7.5V5m5 2.5V4m5 3.5V5M7 17v2.5m5-2.5V19m5-2v2.5" {...s} /></>
      {/* 石卡祖笛：锥形笛身 + 顶部振膜孔 */}
      case 'kazoo': return <><path d="M3 11.5h10.5L20 9v7.5l-6.5-1.5H3z" {...s} /><circle cx="9" cy="9.2" r="1.7" {...s} /><path d="M9 10.9v.6" {...s} /></>
      {/* Pockets 布袋：束口袋（袋身 + 扎口 + 绳结） */}
      case 'pocket': return <><path d="M8.5 8.5C6.5 10.5 5 12.7 5 15a7 5.6 0 0 0 14 0c0-2.3-1.5-4.5-3.5-6.5" {...s} /><path d="M9 8.5l1.2-3.6h3.6L15 8.5M9.3 6.3h5.4" {...s} /></>
      {/* 割下的小麦：麦秆 + 左右麦粒 + 芒 */}
      case 'wheat': return <><path d="M12 21V6.5" {...s} /><path d="M12 9 9.5 7M12 9l2.5-2M12 12.5l-2.5-2M12 12.5l2.5-2M12 16l-2.5-2M12 16l2.5-2M12 6.5V3m-2 1.4L11.2 6M14 4.4 12.8 6" {...s} /></>
      {/* 一把钉子：三枚扇开的铁钉 */}
      case 'nails': return <><path d="M7 5.5 9.5 19M5.6 6.3l3.2-.8M12.5 5l1.5 13.7M11.1 5.6l3.2-.6M17.5 5.5 15.7 19m.4-13.7 3.2.5" {...s} /></>
      {/* 木板：两块错开的板材 + 木纹 + 钉孔 */}
      case 'timber': return <><rect x="4" y="6.5" width="16" height="4.6" rx="0.8" {...s} /><rect x="5" y="13" width="15" height="4.6" rx="0.8" {...s} /><path d="M7 8.8h6M9.5 15.3h7" {...s} /><circle cx="17.6" cy="8.8" r="0.7" {...f} /><circle cx="7" cy="15.3" r="0.7" {...f} /></>
      {/* presses 压印币：外圈齿纹 + 内圈 + P 字压印 */}
      case 'coin': return <><circle cx="12" cy="12" r="7.5" {...s} /><circle cx="12" cy="12" r="5.2" {...s} /><path d="M10.6 15.8V8.6h2.6a1.9 1.9 0 0 1 0 3.8h-2.6" {...s} /></>
      {/* ===== v32：后室扩展物品图标 ===== */}
      {/* 刀：斜置刀刃 + 护手 + 柄 */}
      case 'knife': return <><path d="M4 20 14 10l5-7 2 2-6 6-9 9z" {...s} /><path d="M12.5 11.5l2.2 2.2" {...s} /></>
      {/* 斧头：斜柄 + 斧刃 */}
      case 'axe': return <><path d="M7 21 15 7" {...s} /><path d="M13.5 4.5c2.8-2.2 6-1.6 7.5 1-1.6.4-2.8 1.4-3.4 3-1.6-1-3.2-2.5-4.1-4z" {...s} /></>
      {/* 头灯：头带弧线 + 灯体 + 光束 */}
      case 'headlamp': return <><path d="M3 12c0-4.5 4-8 9-8s9 3.5 9 8" {...s} /><rect x="9" y="9" width="6" height="6" rx="1" {...s} /><circle cx="12" cy="12" r="1.6" {...s} /><path d="M12 16v3m-3-1 1 1m5-1-1 1" {...s} /></>
      {/* 笔记本和笔：皮面本 + 斜放的笔 */}
      case 'notebook': return <><rect x="4" y="4" width="12" height="16" rx="1" {...s} /><path d="M8 4v16" {...s} /><path d="M15.5 16.5l4.5-4.5 1.5 1.5-4.5 4.5-2 .5z" {...s} /></>
      {/* 福友玉：玉环 + 挂绳 */}
      case 'jade': return <><circle cx="12" cy="14.5" r="5.5" {...s} /><circle cx="12" cy="14.5" r="1.8" {...s} /><path d="M12 9V4m-2 2 2-2 2 2" {...s} /></>
      {/* 滋水枪：枪身 + 顶部储罐 + 枪口 */}
      case 'watergun': return <><path d="M3 11h11l4 2v3h-5l-1 4H9l1-4H6a3 3 0 0 1-3-3z" {...s} /><rect x="7" y="4.5" width="6" height="5" rx="1.5" {...s} /><path d="M18.5 13H21" {...s} /></>
      {/* 迁跃浆果：双果 + 叶片 + 涟漪 */}
      case 'berry': return <><circle cx="9" cy="14" r="4.5" {...s} /><circle cx="16.5" cy="12" r="3.5" {...s} /><path d="M11.5 9.5c0-3 2-5 5-5 0 3-2 5-5 5z" {...s} /><path d="M4 6c1-1 2.5-1 3.5 0" {...s} /></>
      {/* 皇家口粮：餐盒 + 小皇冠 */}
      case 'ration': return <><rect x="5" y="10" width="14" height="10" rx="1.5" {...s} /><path d="M8 10V8l2 1.5L12 7l2 2.5L16 8v2" {...s} /><path d="M8.5 14.5h7" {...s} /></>
      {/* ===== v38：Tom 的餐馆菜肴图标 ===== */}
      {/* 碗（番茄浓汤/炖肉煲/招牌炖菜/沙拉）：半球碗身 + 两缕热气 */}
      case 'bowl': return <><path d="M3.5 11.5h17a8.5 6.5 0 0 1-17 0z" {...s} /><path d="M3.5 11.5h17" {...s} /><path d="M9 8c0-1.6 2-1.6 2-3.2M13.5 8c0-1.6 2-1.6 2-3.2" {...s} /></>
      {/* 盘（意面/披萨/千层面）：平盘 + 内圈 + 中央点缀 */}
      case 'plate': return <><ellipse cx="12" cy="14" rx="8.5" ry="5" {...s} /><ellipse cx="12" cy="14" rx="4.8" ry="2.6" {...s} /><circle cx="12" cy="13.4" r="0.8" {...f} /></>
      {/* 面包（蒜香烤面包/果酱面包）：椭圆面包 + 两道割口 */}
      case 'bread': return <><ellipse cx="12" cy="14.5" rx="8" ry="5.5" {...s} /><path d="M7.5 13c1-1.3 2-1.3 3 0M12.5 13c1-1.3 2-1.3 3 0" {...s} /></>
      default: return <rect x="7" y="7" width="10" height="10" {...s} />
    }
  })()
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ color }}>
      {inner}
    </svg>
  )
}
