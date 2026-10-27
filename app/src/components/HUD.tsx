import { GunHud } from './GunHud'
import { isGun } from '../game/content/firearms'
import {drawL7Map} from '@/game/content/l7Map'
import {drawL23Map} from '@/game/content/l23Map'
// 游戏 HUD（桌面 + 移动端自适应）
import { isMelee } from '../game/content/melee'
import { slotDur, slotMaxDur, slotName } from '../game/engine/melee'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Engine } from '@/game/engine'
import { l11MapMarks } from '@/game/engine/l11State'
import { partyConvK } from '@/game/engine/partygoerAI'
import { ITEMS } from '@/game/content/items'
import { ENTITIES } from '@/game/entities'
import DevEntitySpawner from './DevEntitySpawner'
import { WIN_TAPES, LEVELS, levelNo } from '@/game/levels'
import { seedString } from '@/game/core/rng'
import { look } from '@/game/core/renderer3d'
import { exitArrowRotation } from '@/game/content/guide'
import { CS, infiniteImplFor } from '@/game/world/infinite'
import { l5CorridorAt, l5RegionAt } from '@/game/world/infiniteL5' // v55：L5 区域名按大厅/房间矩形判定
import { l7ZoneOfDepth } from '@/game/world/infiniteL7' // v57q：L7 深度带按玩家当前下潜深度显示
import { l1StyleAt } from '@/game/world/l1Architecture'
import { stairServesBand, bandOfPlayerZ } from '@/game/world/mapgen'
import { CONTAINER_KINDS } from '@/game/decorations/containers'
import { DOCS } from '@/game/content/docs'
import { OUTPOSTS, isLandmarkStruct } from '@/game/content/outposts'
import { NPCS } from '@/game/content/npcs'
import { FACTIONS } from '@/game/content/factions'
import { DECOR_REGISTRY, DECOR_LEVEL_ORDER } from '@/game/content/decorRegistry'
import { storage } from '@/game/core/storage'
import { audio } from '@/game/core/audio'
import { MUSIC_LIBRARY } from '@/game/core/midi' // v56 六轮：图鉴全开同步解锁电台音乐
import { drawAlphaMap } from '@/game/content/alphaMap'
import { levelTitleTheme } from './levelTitleTheme'
import './LevelTitleTheme.css'
import { bindLabelFor } from '@/game/core/keybinds'
import { IconHP, IconStamina, IconHunger, IconThirst, IconSanity, IconBattery, IconPause, IconMap, IconInteract, IconCrouch, IconIsolation, IconPlant } from './icons'
import { PHENOMENA, rarityText } from '@/game/content/phenomena'
import MegQuestTracker from './MegQuestTracker'
import MobileQuestChip from './MobileQuestChip'
import LevelQuestPanel from './LevelQuestPanel'
import { L0_SUBLEVELS, l0SublevelName } from '@/game/content/l0Sublevels'
import AlphaMapPanel from './AlphaMapPanel'
import TradersMapPanel from './TradersMapPanel'
import {drawTradersMap} from '@/game/content/tradersMap'
import L11MapPanel, { L11Minimap } from './L11MapPanel'
import DevExitTools from './DevExitTools'
import {drawL0Map} from '@/game/content/l0Map'
import {drawL1Map} from '@/game/content/l1Map'
import {drawL4Map} from '@/game/content/l4Map'
import { drawMapPlayer } from '@/game/content/mapPlayer'
import { mapSight } from '@/game/world/mapSight'
import { jerryOverlay, jerryLureMarks } from '@/game/engine/jerryAI'
import ArachnidHud from './arachnidHud' // [L8-arachnid]
import HoundPinHud from './houndPinHud' // [hound] 扑倒压制挣脱进度条
import { armsOverlay, armsStruggleTap } from '@/game/engine/armsAI'
import { nguithrOverlay } from '@/game/engine/nguithrAI'
import { windowOverlay } from '@/game/engine/windowAI' // [window]
import { specialAction } from '@/game/engine/special' // [window] 特殊交互键
import { ferrenOverlay } from '@/game/engine/ferrenAI' // [ferren] 切行闪白 / 作息提示
import { creepOverlay } from '@/game/engine/creeperAI' // [creeper] 爬菌病程的画面症状（无数值）
import { hudAllowed, hudRevealing, type HudKey } from '@/game/engine/hud'
import { foyerQuest } from '@/game/engine/foyer'
import { landingQuest } from '@/game/engine/foyerLanding'
import { foyerFadeView } from '@/game/engine/foyerStreet'
import { clockText, carriesPhone } from '@/game/engine/phone'
import { FOYER_ID } from '@/game/world/foyerLayout'

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
  /** 打开手机界面（副手装着手机时）。 */
  onPhone?: () => void
}

function Bar({ color, value, icon, label, compact, critical }: { color: string; value: number; icon: React.ReactNode; label: string; compact: boolean; critical?: boolean }) {
  const low = value < 25
  // 2026-10 UI：满值行降低存在感（is-full），低值/危急行点亮；轨道带 25% 刻度，数值去掉冗余的「/100」
  const full = value >= 99.5
  return (
    <div className={`hud-bar flex items-center gap-1.5 max-md:landscape:w-[76px] ${full ? 'is-full' : ''} ${low ? 'is-low' : ''} ${critical ? 'anim-shatter' : ''}`} style={{ ['--bar-c' as string]: color }}>
      <span style={{ color, width: 14, height: 14, display: 'inline-flex' }}>{icon}</span>
      {!compact && <span className="hud-bar-label font-mono2 w-8 text-[10px]">{label}</span>}
      <div className="hud-bar-track relative h-[6px] flex-1 overflow-hidden">
        <div
          className={`hud-bar-fill h-full ${low ? 'anim-barPulse' : ''}`}
          style={{ width: `${value}%`, background: color, transition: 'width 0.3s ease' }}
        />
      </div>
      {!compact && <span className="hud-bar-value font-mono2 w-7 text-right text-[11px]">{Math.round(value)}</span>}
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

function LegacyMinimap({ engine, size }: { engine: Engine; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    const m = engine.map
    if (!c || !m) return
    const g = c.getContext('2d')!
    if(engine.levelDef.id!==7)delete c.dataset.l7Bathymetry
    const k = size / 140 // 标记随尺寸缩放
    c.width = size; c.height = size
    if (m.traders) { drawTradersMap(g,m,{width:size,height:size,centerX:engine.player.x,centerY:engine.player.y,scale:size/72,playerX:engine.player.x,playerY:engine.player.y,yaw:look.yaw,sight:mapSight(engine,look.yaw),mini:true}); return }
    if (m.settlement?.blueprint.id === 'alpha') { drawAlphaMap(g, size, engine.player, { mini: true, yaw: look.yaw, sight: mapSight(engine, look.yaw) }); return }
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
      if(inf.l0||m.l1Architecture||[2,3,4,7].includes(engine.levelDef.id)){
        g.save();g.translate((half-px)*s,(half-py)*s)
        const view={x0:px-half,y0:py-half,x1:px+half,y1:py+half,scale:s}
        if(inf.l0)drawL0Map(g,engine,view);else if(engine.levelDef.id===2||engine.levelDef.id===3)drawL23Map(g,engine,view);else if(engine.levelDef.id===4)drawL4Map(g,engine,view);else if(engine.levelDef.id===7)c.dataset.l7Bathymetry=JSON.stringify(drawL7Map(g,engine,{...view,mini:size<=180}));else drawL1Map(g,engine,view)
        g.restore()
      }else{
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
          if (!(engine.devEnabled&&engine.dev.mapReveal)&&!ex || !floor) continue
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
      // L8 第九大道地图标记：只要被路标揭示就显示，不受当前视野/探索位图限制。
      for(const mark of l11MapMarks(engine)){
        const sx=Math.max(5,Math.min(size-5,(mark.x-inf.ox-px+half)*s)),sy=Math.max(5,Math.min(size-5,(mark.y-inf.oy-py+half)*s))
        g.save();g.fillStyle='#b7d2c6';g.fillRect(sx-2,sy-2,4,4);g.font='8px monospace';g.textAlign='center';g.fillText(mark.name,sx,sy-5);g.restore()
      }
      // 重制杰瑞：信众诱导材料标出的「据点」（蓝色方框；到达后变灰）——不受探索位图限制，贴边显示方向
      for (const mark of jerryLureMarks(engine)) {
        const sx = Math.max(6, Math.min(size - 6, (mark.x - px + half) * s)), sy = Math.max(6, Math.min(size - 6, (mark.y - py + half) * s))
        g.save(); g.strokeStyle = mark.found ? 'rgba(140,150,180,0.7)' : '#5f86ff'; g.lineWidth = 1.6; g.strokeRect(sx - 3 * k, sy - 3 * k, 6 * k, 6 * k)
        g.fillStyle = mark.found ? 'rgba(140,150,180,0.7)' : '#9fb6ff'; g.font = `${Math.max(7, Math.round(8 * k))}px monospace`; g.textAlign = 'center'; g.fillText(mark.name, sx, sy - 5 * k); g.restore()
      }
      // 历史标记保留为暗金菱形；最新标记为青蓝发光菱形，且是 HUD 唯一会指向的路线点。
      if (engine.player.level === 8) for (const mark of engine.avenueMarks) {
        const sx = (mark.wx - (inf.ox + px) + half) * s
        const sy = (mark.wy - (inf.oy + py) + half) * s
        if (sx < -6 || sy < -6 || sx > size + 6 || sy > size + 6) continue
        const active = mark.seq === engine.avenueHintSeq
        const r = (active ? 3.8 : 2.6) * k
        g.save()
        g.fillStyle = active ? '#55e6ff' : 'rgba(232,185,60,0.68)'
        if (active) { g.shadowColor = '#55e6ff'; g.shadowBlur = (5.5 + Math.sin(engine.time * 4) * 1.5) * k }
        g.beginPath()
        g.moveTo(sx, sy - r); g.lineTo(sx + r, sy); g.lineTo(sx, sy + r); g.lineTo(sx - r, sy)
        g.closePath(); g.fill()
        if (size >= 120) {
          g.shadowBlur = 0
          g.font = `${Math.max(7, Math.round(8 * k))}px monospace`
          g.textAlign = 'center'
          g.fillStyle = active ? '#bdf8ff' : '#d8b85b'
          g.fillText(mark.kind === 'exit' ? '出' : String(mark.seq + 1), sx, sy - r - 2 * k)
        }
        g.restore()
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
      drawMapPlayer(g, size / 2, size / 2, look.yaw, { scale: s, radius: 3.5, color: '#e8b93c', sight: mapSight(engine, look.yaw) })
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
        if (!(engine.devEnabled&&engine.dev.mapReveal)&&!engine.explored[idx]) continue
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
      if (n.def.ambient) continue // 前厅街景路人不标点
      if ((m.floors ?? 1) > 1 && (n.floor ?? 0) !== pBand) continue
      g.fillStyle = '#7ac97a'
      g.beginPath(); g.arc(n.x * s, n.y * s, 2 * k, 0, 7); g.fill()
    }
    // 玩家标记：高度指示（低洼变暗+↓，高台↑）+ 蹲伏缩小
    const pIdx = Math.floor(engine.player.y) * m.w + Math.floor(engine.player.x)
    const pEl = elev && pIdx >= 0 && pIdx < elev.length ? elev[pIdx] : 0
    drawMapPlayer(g, engine.player.x * s, engine.player.y * s, look.yaw, { scale: s, radius: 3.5, color: pEl === 1 ? '#93792a' : '#e8b93c', sight: mapSight(engine, look.yaw) })
    if (pEl === 1 || pEl === 2 || pEl === 3) {
      g.font = `${Math.max(7, Math.round(8 * k))}px monospace`
      g.textAlign = 'center'
      g.fillStyle = pEl === 1 ? '#8fa3c9' : '#ffe37a'
      g.fillText(pEl === 1 ? '↓' : '↑', engine.player.x * s, engine.player.y * s - 3.2 * k)
    }
  }, [engine, size, engine.devEnabled, engine.dev.mapReveal, look.yaw, engine.player.x, engine.player.y, engine.player.z, engine.player.floor, engine.player.crouching, engine.mapRev, engine.map?.inf?.rev, Math.floor(engine.time * 8)])
  return <canvas data-minimap aria-label={engine.levelDef.id===7?'Level 7 等深线小地图':undefined} ref={ref} style={{ width: size, height: size, imageRendering: 'pixelated' }} />
}

// Level 11 uses the city-plan map while all other levels keep the legacy minimap.
function Minimap({ engine, size }: { engine: Engine; size: number }) {
  return engine.player.level === 11 && engine.map?.inf
    ? <L11Minimap engine={engine} size={size} />
    : <LegacyMinimap engine={engine} size={size} />
}

export default function HUD({ engine, isMobile, log, toasts, devMode, fxScale, onPause, onInventory, onSelectSlot, onUseSlot, onPhone }: Props) {
  const p = engine.player
  // HUD 权限（前厅逐步解锁；缺省全开；设置「始终显示全部 HUD」覆盖）+ 首次解锁的胶片刻度浮现动画
  const H = (k: HudKey) => hudAllowed(p, k, engine.hudShowAll)
  const perfNow = performance.now()
  const rv = (k: HudKey) => (hudRevealing(engine, k, perfNow) && !engine.hudShowAll ? ' hud-reveal' : '')
  const inFoyer = p.level === FOYER_ID
  const tut = engine.tutorial?.current ? engine.tutorial.view(engine, isMobile) : null
  const fq = H('quest') ? (foyerQuest(engine) ?? landingQuest(engine)) : null
  const phoneOn = !!p.phone && carriesPhone(p)
  const tutSide = engine.tutorial ? engine.tutorial.sideViews(engine, isMobile) : []
  const tutTouch = [...(tut?.touch ?? []), ...tutSide.flatMap((v) => v.touch)].join(' ')
  useEffect(() => {
    if (tutTouch) document.body.dataset.tutTouch = tutTouch
    else delete document.body.dataset.tutTouch
    return () => { delete document.body.dataset.tutTouch }
  }, [tutTouch])
  const def = engine.levelDef
  const swim = engine.swimInfo()
  // v40：据点是主层级的子层级——顶部信息栏的层级号显示主层级（如 Alpha 基地显示 LEVEL 1 而非 LEVEL 101）
  const outpostDef = Object.values(OUTPOSTS).find((o) => o.levelId === p.level)
  const dispId = outpostDef?.parent ?? levelNo(def.id) // Level 0.2：内部 id 902 → 显示 0.2
  const titleTheme = levelTitleTheme(p.level)
  const interact = engine.getInteract()
  const now = Date.now()
  // 移动端横屏：小地图默认折叠，点击展开为半透明大地图浮层
  const landscape = isMobile && typeof window !== 'undefined' && window.innerWidth > window.innerHeight
  // 任务追踪：桌面在右上列；移动端主线清单收成可展开的一行，横屏与 MEG/阵营追踪叠成一列放到顶部中间，不再压住右侧按钮
  const questStack = <>
    {H('quest') && !inFoyer && <LevelQuestPanel engine={engine} isMobile={isMobile} />}
    {H('quest') && <MegQuestTracker engine={engine} mobileLandscape={isMobile && landscape} collapsible={isMobile} />}
    {fq && (isMobile ? <MobileQuestChip quest={fq} reveal={rv('quest')} /> : (
          <div className={`hud-panel hud-foyer-quest font-mono2 px-2.5 py-1.5 text-[11px]${rv('quest')}`} data-foyer-quest style={{ maxWidth: isMobile ? 190 : 230 }}>
            <div className="mb-0.5 text-[10px] tracking-widest" style={{ color: 'var(--amber)' }}>任务 · {fq.title}</div>
            {fq.items.map((it, i) => (
              <div key={i} className="flex items-start gap-1.5" style={{ color: it.done ? 'var(--text-dim)' : 'var(--text)', textDecoration: it.done ? 'line-through' : 'none', opacity: it.done ? 0.6 : 1 }}>
                <span>{it.done ? '■' : '□'}</span><span>{it.text}</span>
              </div>
            ))}
          </div>
    ))}
  </>
  const shortLandscape = isMobile && landscape && typeof window !== 'undefined' && window.innerHeight < 376
  // 状态条竖排（横屏宽度 ≥768，Tailwind md）时，任务列放进左上状态条与顶部关卡名之间；状态条横排时仍在关卡名下方偏右
  const questBeside = isMobile && landscape && typeof window !== 'undefined' && window.innerWidth >= 768
  const questColStyle: React.CSSProperties = questBeside
    ? { position: 'fixed', top: 12, left: 156, width: 'min(214px, calc(100vw - 630px))', minWidth: 150 }
    : { position: 'fixed', top: 48, right: shortLandscape ? 256 : 208, width: shortLandscape ? 'clamp(110px, calc(100vw - 430px), 200px)' : 'min(220px, 35vw)' }
  const [mapOpen, setMapOpen] = useState(false)
  // v29b：快捷栏 touchstart 直触后抑制紧随其后的合成 click（React 根委托为 passive，不能 preventDefault）
  const hotbarTouchT = useRef(0)
  // 手臂（Entité 15-FR）：被抓时触屏「点屏幕任意处」也算一次挣扎（捕获阶段、passive，不拦截摇杆/按钮本身的触摸）
  useEffect(() => {
    if (!isMobile) return
    const onTouch = () => armsStruggleTap(engine)
    window.addEventListener('touchstart', onTouch, { capture: true, passive: true })
    return () => window.removeEventListener('touchstart', onTouch, { capture: true })
  }, [isMobile, engine])
  const bigMapSize = Math.max(180, Math.floor(Math.min(window.innerHeight - 96, window.innerWidth * 0.45, 360)))

  // 当前区域名（无限层=所在区段/变种房间；据点=所在区域；其余层级不显示）
  let areaName: string | null = null
  let curVariant: string | null = null // v41：当前区段变体（衔尾段=ouroboros，BRC 声望显示用）
  const infMap = engine.map?.inf
  if (infMap) {
    const impl = infiniteImplFor(engine.levelDef.id)
    if (engine.levelDef.id === 1) {
      curVariant = l1StyleAt(engine.map!, p.x, p.y) ?? null
      areaName = curVariant ? impl.variantNames[curVariant] ?? null : null
    } else if (engine.levelDef.id === 7) {
      // v57q：光带只由玩家当前下潜深度决定，与水平位置/海床位置无关
      const z = p.z >= 3 ? 'entry' : l7ZoneOfDepth(Math.max(0, -p.z))
      curVariant = z
      areaName = z === 'entry' ? '入口房间' : impl.variantNames?.[z] ?? null
    } else if (engine.levelDef.id === 3 && engine.map!.tint[Math.floor(p.y)*engine.map!.w+Math.floor(p.x)]===51) {
      curVariant='narrow'; areaName='狭窄廊道'
    } else if (engine.levelDef.id === 5) {
      // v55：L5 区域名按大厅/房间矩形判定；走廊按同一世界坐标取外观变体
      const reg = l5RegionAt(infMap.seed, Math.floor(infMap.ox + p.x), Math.floor(infMap.oy + p.y))
      curVariant = reg?.variant ?? null
      const corridor = l5CorridorAt(infMap.seed, Math.floor(infMap.ox + p.x), Math.floor(infMap.oy + p.y))
      areaName = reg?.variant ? (impl.variantNames?.[reg.variant] ?? null) : corridor.plain ? '白墙客房走廊' : '红金长廊'
    } else if (engine.levelDef.id === 6 && bandOfPlayerZ(engine.map!, p.z) === -1) {
      // v58：L6 地下层（FloorBand -1）全部统一显示为「地下廊道」区域，不再跟随地表变体名
      curVariant = 'underground'
      areaName = '地下廊道'
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
  let exitArrow: { rel: number; d: number; target?: 'landmark' | 'avenue' } | null = null
  if (exit && exit.d <= hintDist) {
    exitArrow = { rel: exitArrowRotation(p.x, p.y, look.yaw, exit.x + 0.5, exit.y + 0.5), d: exit.d }
  } else {
    const lm = engine.nearestLandmark()
    if (lm && lm.d <= hintDist) {
      exitArrow = { rel: exitArrowRotation(p.x, p.y, look.yaw, lm.x, lm.y), d: lm.d, target: 'landmark' }
    } else {
      // 附近无出口/定居点时，第九大道的最新地图标记接管提示；
      // 与出口/定居点共用同一个 hintDist 门槛（默认 30m，开发者面板可调）。
      const avenue = engine.avenueHintTarget()
      if (avenue && avenue.d <= hintDist) exitArrow = {
        rel: exitArrowRotation(p.x, p.y, look.yaw, avenue.x, avenue.y),
        d: avenue.d,
        target: 'avenue',
      }
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
      {H('hp') && <div className={rv('hp').trim() || undefined}><Bar color="var(--blood)" value={p.hp} icon={<IconHP width={14} height={14} />} label="HP" compact={isMobile} critical={p.hp <= 30} /></div>}
      {H('status') && <div className={`flex flex-col gap-1 ${isMobile ? 'max-md:landscape:flex-row max-md:landscape:gap-2.5' : ''}${rv('status')}`}>
      <Bar color="var(--stamina)" value={p.stamina} icon={<IconStamina width={14} height={14} />} label="体力" compact={isMobile} critical={p.stamina <= 5} />
      <Bar color="var(--hunger)" value={p.hunger} icon={<IconHunger width={14} height={14} />} label="饥饿" compact={isMobile} critical={p.hunger <= 25} />
      <Bar color="var(--thirst)" value={p.thirst} icon={<IconThirst width={14} height={14} />} label="口渴" compact={isMobile} critical={p.thirst <= 25} />
      <Bar color="var(--sanity)" value={p.sanity} icon={<IconSanity width={14} height={14} />} label="理智" compact={isMobile} critical={p.sanity <= 20} />
      </div>}
    </div>
  )

  const hotbar = (
    <div className="flex flex-col items-center gap-1">
      {/* 选中物品名（快捷栏上方） */}
      {p.hotbar[p.selected] && (
        <div
          className="hud-hotbar-name font-mono2 px-2 py-0.5 text-[11px]"
        >
          {slotName(p.hotbar[p.selected]!)}
          {isMelee(p.hotbar[p.selected]!.type) && <span style={{ color: 'var(--text-dim)' }}> {slotDur(p.hotbar[p.selected]!)}/{slotMaxDur(p.hotbar[p.selected]!)}</span>}
        </div>
      )}
      <div className="hud-hotbar-row flex gap-1">
      {p.hotbar.map((s, i) => (
        <button
          key={i}
          className={`hud-slot relative flex shrink-0 items-center justify-center border ${p.selected === i ? 'is-selected' : ''}`}
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
              {ITEMS[s.type]?.charges && (() => { // 批发市场 v2：医疗箱剩余次数条
                const max = ITEMS[s.type].charges!, left = Math.max(0, Math.min(max, s.dur ?? max)), k = left / max
                return <span role="meter" aria-label="剩余使用次数" aria-valuemin={0} aria-valuemax={max} aria-valuenow={left} className="absolute bottom-0.5 left-1 right-1 h-[3px]" style={{ background: 'rgba(0,0,0,.45)' }}>
                  <span className="block h-full" style={{ width: `${k * 100}%`, background: k <= .25 ? '#c0392b' : '#e8e2d2' }} />
                </span>
              })()}
              {isMelee(s.type) && (() => { // 近战重制：耐久条（≤25% 变红，残件灰）
                const k = slotDur(s) / slotMaxDur(s)
                return <span role="meter" aria-label="剩余耐久" aria-valuemin={0} aria-valuemax={slotMaxDur(s)} aria-valuenow={slotDur(s)} className="absolute bottom-0.5 left-1 right-1 h-[3px]" style={{ background: 'rgba(0,0,0,.45)' }}>
                  <span className="block h-full" style={{ width: `${Math.max(k > 0 ? 6 : 100, k * 100)}%`, background: k <= 0 ? '#5a5650' : k <= .25 ? '#c0392b' : k <= .5 ? '#d9a13a' : '#8fbf6a' }} />
                </span>
              })()}
            </>
          )}
        </button>
      ))}
      </div>
    </div>
  )

  return (
    <div className="game-hud pointer-events-none fixed inset-0 z-30" style={{ padding: 'calc(env(safe-area-inset-top) + 8px) calc(env(safe-area-inset-right) + 8px) calc(env(safe-area-inset-bottom) + 8px) calc(env(safe-area-inset-left) + 8px)' }}>
      {/* 左上：状态 + 当前现象 */}
      <div className="hud-vitals-cluster absolute left-3 top-3 flex flex-col items-start gap-1.5">
        {(H('hp') || H('status') || swim || engine.swim.bendsT > 0) && <div className="hud-panel pointer-events-auto p-2">
          {vitals}
          {swim && (
            <div className="mt-2 border-t pt-1.5" style={{ borderColor: 'var(--panel-edge)' }}>
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span style={{ color: swim.submerged ? '#79b8d8' : 'var(--text-dim)' }}>
                  {swim.submerged ? '水下' : '水面'} · 水深 {swim.depth.toFixed(1)}m
                </span>
                <span className={engine.swim.stage >= 2 ? 'anim-thirstPulse' : ''} style={{ color: engine.swim.stage === 0 ? 'var(--amber)' : 'var(--blood)' }}>
                  {engine.swim.stage === 3 ? '缺氧！' : `氧气 ${Math.max(0, swim.limit - swim.breath).toFixed(0)}s`}
                </span>
              </div>
              <div className="mt-1 h-[4px] w-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--ink) 80%, transparent)' }}>
                <div style={{
                  width: `${Math.max(0, Math.min(100, ((swim.limit - swim.breath) / swim.limit) * 100))}%`,
                  height: '100%',
                  background: engine.swim.stage >= 1 ? 'var(--blood)' : swim.submerged ? '#79b8d8' : 'var(--amber)',
                  transition: 'width 0.12s linear',
                }} />
              </div>
              {/* [swim] 升降指示 + L7 深度计（150m 起水压伤害） */}
              <div className="mt-1 flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-dim)' }}>
                <span style={{ minWidth: 64, color: Math.abs(engine.swim.vz) > 0.2 ? '#79b8d8' : 'var(--text-dim)' }}>
                  {engine.swim.vz > 0.2 ? '▲ 上浮' : engine.swim.vz < -0.2 ? '▼ 下潜' : '— 悬停'} {Math.abs(engine.swim.vz).toFixed(1)}m/s
                </span>
                {def.id === 7 && (
                  <span className="relative h-[3px] flex-1" style={{ background: 'linear-gradient(90deg, #2b5f78 0%, #173246 70%, #6b1f1a 75%, #3a0d0b 100%)' }}>
                    <span className="absolute top-[-3px] h-[9px] w-[2px]" style={{ left: `${Math.min(100, swim.depth / 200 * 100)}%`, background: swim.depth > 150 ? 'var(--blood)' : '#d8eef8' }} />
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[9px]" style={{ color: 'var(--text-dim)' }}>
                {engine.swimMode === 'view' ? '[前进] 沿视线游　' : ''}[蹲伏] 下潜　[跳跃] 上浮　[冲刺] 划水{swim.edge ? '　[跳跃] 撑上岸' : ''}
              </div>
            </div>
          )}
          {/* [swim 阶段 3] 减压病状态 */}
          {engine.swim.bendsT > 0 && (
            <div className="mt-1.5 text-[11px] anim-thirstPulse" style={{ color: 'var(--blood)' }}>
              减压病 {Math.ceil(engine.swim.bendsT)}s{swim && swim.depth >= 15 ? ' · 再加压中' : ''}
            </div>
          )}
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
        </div>}
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
        className={`hud-location-cluster ${isMobile ? 'absolute top-3 text-center' : 'absolute left-1/2 top-3 -translate-x-1/2 text-center'}`}
        style={isMobile ? { left: landscape ? 378 : 156, right: landscape ? 118 : 110, pointerEvents: 'none' } : undefined}
      >
        {(!inFoyer || H('clock') || H('quest')) && <div className={`hud-panel hud-loc font-mono2 inline-block max-w-full truncate px-3 py-1 text-[11px]${inFoyer ? rv('clock') : ''}`} style={{ color: 'var(--text-dim)' }}>
          {isMobile
            ? (
              <span className={`hud-loc-mobile${titleTheme !== 'default' ? ' level-title-themed' : ''}`} data-title-theme={titleTheme}>
                <span className="hud-loc-level level-title__eyebrow" style={{ color: 'var(--title-accent, inherit)' }}>{def.id === 900 ? '前厅' : `L${dispId}`}</span>{' '}
                <span className="hud-loc-name level-title__name" style={{ color: 'var(--title-ink, inherit)' }}>{def.name}</span>{floorText ? ` · ${floorText}` : ''}{inFoyer ? (H('clock') ? ` · ${clockText(engine)}` : '') : ` · 磁带 ${p.tapes}/${WIN_TAPES}`}
              </span>
            )
            : (
              <span className={`hud-loc-row${titleTheme !== 'default' ? ' level-title-themed' : ''}`} data-title-theme={titleTheme}>
                <span className="hud-loc-level level-title__eyebrow" style={{ color: 'var(--title-accent, inherit)' }}>{def.id === 900 ? 'FOYER' : `LEVEL ${dispId}`}</span>
                <span className="hud-loc-name level-title__name" style={{ color: 'var(--title-ink, inherit)' }}>{def.name}</span>
                <span className="hud-loc-meta" data-hud-clock={inFoyer ? '' : undefined}>{inFoyer ? (H('clock') ? clockText(engine) : '') : `B${dispId}`}{floorText ? ` · ${floorText}` : ''}</span>
                {!inFoyer && <span className="hud-loc-tapes" title={`磁带 ${p.tapes}/${WIN_TAPES}`}>
                  磁带
                  {Array.from({ length: WIN_TAPES }, (_, i) => <i key={i} className={i < p.tapes ? 'on' : ''} />)}
                  <b>{p.tapes}/{WIN_TAPES}</b>
                </span>}
              </span>
            )}
        </div>}
        {isMobile && H('log') && (
          <div className={`pointer-events-none mx-auto mt-1 max-h-[3.6em] space-y-0.5 overflow-hidden${rv('log')}`} style={{ maxWidth: '100%' }}>
            {log.slice(-2).map((l) => (
              <div key={l.id} className="hud-log-line font-mono2 truncate text-[11px]" style={{ color: l.kind === 'loot' ? 'var(--amber)' : l.kind === 'damage' ? 'var(--blood)' : l.kind === 'lore' ? 'var(--sanity)' : 'var(--text-dim)', opacity: Math.min(1, (now - l.t) / 4000 > 1 ? 0.4 : 1), textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
                {l.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 右上 */}
      <div className="hud-navigation-cluster absolute right-3 top-3 flex flex-col items-end gap-2">
        {isMobile ? (
          <>
            {/* 横屏：折叠小地图，点击展开大地图浮层（竖屏保持现状） */}
            {landscape && H('minimap') && (
              <button
                className={`hud-panel pointer-events-auto p-1${rv('minimap')}`}
                aria-label="展开地图"
                onClick={() => { audio.uiTick(); setMapOpen(true) }}
              >
                <Minimap engine={engine} size={64} />
              </button>
            )}
            <div className="flex gap-2">
              {phoneOn && onPhone && <button data-touch-id="phone" aria-label="手机" className="hud-panel pointer-events-auto flex h-11 w-11 items-center justify-center" style={{ color: 'var(--text)' }} onClick={onPhone}><PhoneGlyph /></button>}
              {H('inventory') && <button data-touch-id="backpack-top" className={`hud-panel pointer-events-auto flex h-11 w-11 items-center justify-center${rv('inventory')}`} style={{ color: 'var(--text)' }} onClick={onInventory}><IconMap width={20} height={20} /></button>}
              <button className="hud-panel pointer-events-auto flex h-11 w-11 items-center justify-center" style={{ color: 'var(--text)' }} onClick={onPause}><IconPause width={20} height={20} /></button>
            </div>
          </>
        ) : (
          H('minimap') ? <div className={`hud-panel pointer-events-auto p-1.5${rv('minimap')}`}><Minimap engine={engine} size={140} /></div> : null
        )}
        {/* 当前区域名（区段/变种房间/据点区域） */}
        {areaName && H('minimap') && (
          <div className="hud-panel font-mono2 px-2 py-0.5 text-[10px]" style={{ color: 'var(--amber)' }}>{areaName}</div>
        )}
        {H('battery') && <div className={`hud-panel flex items-center gap-2 px-2 py-1${rv('battery')}`}>
          {/* 蹲伏状态提示（防御性读取 v7 字段） */}
          {((p as unknown as { crouching?: boolean }).crouching || (engine.input as unknown as { crouch?: boolean }).crouch) && (
            <span style={{ color: 'var(--amber)', width: 14, height: 14 }} title="蹲伏中"><IconCrouch width={14} height={14} /></span>
          )}
          {(!inFoyer || !!engine.player.prologue?.flags.got_flashlight || p.equip.offhand?.type === 'flashlight') && <>
          <span style={{ color: p.battery <= 15 ? 'var(--blood)' : 'var(--amber)', width: 14, height: 14 }}><IconBattery width={14} height={14} /></span>
          <span className={`hud-battery ${p.battery <= 15 ? 'is-low' : ''}`} aria-hidden><i style={{ width: `${Math.max(0, Math.min(100, p.battery))}%` }} /></span>
          <span className="font-mono2 text-[10px]" style={{ color: p.battery <= 15 ? 'var(--blood)' : 'var(--text-dim)' }}>{Math.round(p.battery)}%</span>
          </>}
          {/* 手机电量（独立电池；放在充电座上时显示充电中） */}
          {p.phone && (phoneOn || p.phone.docked) && (inFoyer ? !!engine.player.prologue?.flags.got_phone : true) && (
            <span className="hud-phone-batt font-mono2 flex items-center gap-1 text-[10px]" data-hud-phone-battery style={{ color: p.phone.battery <= 15 ? 'var(--blood)' : 'var(--text-dim)' }} title="手机电量">
              <PhoneGlyph size={13} />
              <span className={`hud-battery ${p.phone.battery <= 15 ? 'is-low' : ''}`} aria-hidden><i style={{ width: `${Math.max(0, Math.min(100, p.phone.battery))}%` }} /></span>
              {Math.round(p.phone.battery)}%{p.phone.docked ? ' ⚡' : ''}{p.phone.torch ? ' ☀' : ''}
            </span>
          )}
          {/* 噪音指示 */}
          <span className="flex items-end gap-[2px]">
            {[0.33, 0.66, 1].map((th, i) => (
              <span key={i} className="w-[3px] rounded-sm" style={{ height: 4 + i * 3, background: engine.noise > th ? 'var(--blood)' : 'var(--panel-edge)' }} />
            ))}
          </span>
        </div>}
        {!(isMobile && landscape) && questStack}
      </div>
      {isMobile && landscape && (H('quest') || fq) && (
        <div className="hud-mobile-quests pointer-events-none flex flex-col gap-1" data-mobile-quests data-quest-col={questBeside ? 'beside' : 'below'} style={questColStyle}>
          {questStack}
        </div>
      )}

      {/* 左下：消息日志（桌面；开发者面板展开时右移让位，v10） */}
      {!isMobile && H('log') && (
        <div className="pointer-events-none absolute bottom-3 max-w-[320px] space-y-0.5" style={{ left: devMode ? 384 : 12 }}><div className={rv('log').trim() || undefined}>
          {log.slice(-4).map((l) => (
            <div key={l.id} className="hud-log-line font-mono2 truncate text-[12px]" style={{ color: l.kind === 'loot' ? 'var(--amber)' : l.kind === 'damage' ? 'var(--blood)' : l.kind === 'lore' ? 'var(--sanity)' : 'var(--text-dim)', opacity: now - l.t > 4000 ? 0.4 : 1, textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
              {l.text}
            </div>
          ))}
        </div></div>
      )}

      {/* 底部中央：快捷栏 + 拾取提示 */}
      <div className={`hud-hotbar-cluster absolute left-1/2 -translate-x-1/2 ${isMobile ? 'bottom-[8px] max-md:landscape:bottom-2' : 'bottom-3'} flex flex-col items-center gap-2`}>
        {/* 旁支提示（如手机低电量）：独立小提示，不占主线纸带、无序号 */}
        {tutSide.map((v) => (
          <div key={v.id} className="hud-tutorial-side font-mono2" data-tutorial-side={v.id} role="status">
            <span className="hud-tutorial-side__dot" aria-hidden>!</span>
            <span>{v.text}</span>
          </div>
        ))}
        {/* 教程纸带（TutorialDirector；不弹窗，跟随自定义键位/移动端控件） */}
        {tut && (
          <div key={tut.id} className="hud-tutorial-strip font-mono2" data-tutorial-step={tut.id} role="status">
            <span className="hud-tutorial-strip__no">{String(tut.index).padStart(2, '0')}/{String(tut.total).padStart(2, '0')}</span>
            <span className="hud-tutorial-strip__text">{tut.text}</span>
          </div>
        )}
        <div className="relative h-6">
          {toasts.map((t) => (
            <div key={t.id} className="anim-toast font-mono2 whitespace-nowrap text-[12px]" style={{ color: 'var(--amber)' }}>{t.text}</div>
          ))}
        </div>
        {H('hotbar') && <GunHud engine={engine} />}
        {H('hotbar') && <div className={`pointer-events-auto${rv('hotbar')}`}>{hotbar}</div>}
      </div>

      {/* 右下：情境提示（桌面） */}
      {!isMobile && (
        <div className="hud-context-cluster absolute bottom-3 right-3 space-y-1 text-right">
          {interact && (
            <div className="hud-panel anim-slideUp font-mono2 inline-block px-3 py-1.5 text-[12px]" style={{ color: 'var(--amber)' }}>
              <kbd className="hud-kbd-accent">{bindLabelFor('interact')}</kbd> {interact.label}
            </div>
          )}
          {/* 2026-10 UI：按键提示改为可换行的键帽列表并限宽，不再横跨半屏压住快捷栏 */}
          {H('hotbar') && <div className="hud-panel hud-keyhints font-mono2 text-[11px]" style={{ color: 'var(--text-dim)' }}>
            {([
              ...(!engine.handsStowed ? [['attack', isGun(p.hotbar[p.selected]?.type) ? '开火' : '攻击']] : []),
              ['jump', '跳跃'], ['crouch', '蹲伏'], ['flashlight', '手电'],
              ...(!engine.handsStowed ? (isGun(p.hotbar[p.selected]?.type) ? [['quickuse', '瞄准（按住）'], ['reload', '装填 / 选弹（按住）'], ['quickdrop', '丢弃']] : [['quickuse', '使用'], ['quickdrop', '丢弃'], ['inspect', '检视']]) : []),
              ['holster', engine.handsStowed ? '取出主手' : '收起主手'],
              ...(!engine.handsStowed && p.hotbar[p.selected]?.type === 'squirtgun' ? [['reload', '装填/轮盘']] : []),
            ] as [string, string][]).map(([k, t]) => (
              <span key={k} className="hud-keyhint"><kbd>{bindLabelFor(k)}</kbd>{t}</span>
            ))}
          </div>}
        </div>
      )}
      {isMobile && interact && (
        <div className="hud-panel absolute bottom-[170px] right-4 px-3 py-1.5" style={{ color: 'var(--amber)' }}>
          <span className="font-mono2 flex items-center gap-1 text-[12px]"><IconInteract width={14} height={14} />{interact.label}</span>
        </div>
      )}

      {/* 手机相机快门闪白 */}
      {p.level === 902 && (engine.l02?.dust ?? 0) > 0.02 && <div data-l02-dust className="pointer-events-none fixed inset-0 z-[31]" style={{ background: 'radial-gradient(ellipse at center, rgba(205,198,182,.55) 0%, rgba(176,168,150,.85) 100%)', opacity: Math.min(0.55, (engine.l02?.dust ?? 0) * 0.75) }} />}
      {engine.photoFlashT > 0 && <div className="pointer-events-none fixed inset-0 z-[45]" style={{ background: '#fff', opacity: Math.min(0.85, engine.photoFlashT / 0.35 * 0.85) }} />}
      {(() => { const fd = inFoyer ? foyerFadeView(engine) : null; return fd ? <div data-foyer-fade className="pointer-events-none fixed inset-0 z-[46] flex items-center justify-center" style={{ background: `rgba(0,0,0,${fd.k})` }}><span className="text-sm tracking-[0.3em] text-neutral-300" style={{ opacity: fd.k }}>{fd.text}</span></div> : null })()}
      {/* v57o：水下视野额外蓝绿晕影（与渲染层雾/低通叠加） */}
      {swim?.submerged && (
        <div className="pointer-events-none fixed inset-0 z-[31]" style={{ boxShadow: 'inset 0 0 140px 34px rgba(13,74,110,0.32)' }} />
      )}
      {/* 屏气晕影、缺氧褪色与黑屏由 PhotoFinishShader 处理，不遮盖状态和交互 UI。 */}
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
      {/* [creeper] 爬菌（Entity 17）病程：HUD 不显示病程，只有画面症状——1 阶伤口抽痛时边缘一下暗红搏动；3 阶高烧：暖色热浪浸染 + 轻微晃动模糊；
          4 阶：血红暗角常驻并随心跳搏动（另见第一人称手臂菌斑 / 手指痉挛） */}
      {(() => {
        const co = creepOverlay(engine)
        if (co.throb <= 0.01 && co.heat <= 0 && co.vignette <= 0) return null
        const t = engine.time
        const wob = co.heat > 0 ? (0.6 + 0.6 * Math.sin(t * 2.3)) * co.heat : 0
        return <>
          {co.throb > 0.01 && <div data-creep-throb={co.throb.toFixed(2)} className="pointer-events-none fixed inset-0 z-[31]" style={{ boxShadow: `inset 0 0 ${120 + 80 * co.throb}px ${30 + 40 * co.throb}px rgba(120,10,6,${(0.55 * co.throb).toFixed(3)})` }} />}
          {co.heat > 0 && <div data-creep-heat className="pointer-events-none fixed inset-0 z-[30]" style={{ background: `rgba(255,120,40,${(0.06 + 0.05 * Math.sin(t * 1.7)) * co.heat})`, backdropFilter: `blur(${wob.toFixed(2)}px) saturate(${(1 + 0.25 * co.heat).toFixed(2)})`, WebkitBackdropFilter: `blur(${wob.toFixed(2)}px)`, transform: `translate(${(Math.sin(t * 3.1) * 1.5 * co.heat).toFixed(2)}px, ${(Math.sin(t * 2.4 + 1) * 1.2 * co.heat).toFixed(2)}px)` }} />}
          {co.vignette > 0 && <div data-creep-vignette className="pointer-events-none fixed inset-0 z-[31]" style={{ boxShadow: `inset 0 0 ${200 + 30 * Math.sin(t * 5.2)}px ${70 + 12 * Math.sin(t * 5.2)}px rgba(110,0,0,0.62)` }} />}
        </>
      })()}
      {/* 派对客转化：视力变差（近视模糊，越往视野边缘越糊）+ 视野边缘泛起金黄的皮革色；没有数值，只有画面表现 */}
      {(() => {
        const ck = partyConvK(engine)
        if (ck <= 0) return null
        const blur = (0.8 + ck * 3.2).toFixed(2)
        return (
          <>
            <div className="pointer-events-none fixed inset-0 z-[30]" style={{
              backdropFilter: `blur(${blur}px)`, WebkitBackdropFilter: `blur(${blur}px)`,
              maskImage: `radial-gradient(ellipse at center, transparent ${Math.round(42 - ck * 34)}%, black ${Math.round(78 - ck * 30)}%)`,
              WebkitMaskImage: `radial-gradient(ellipse at center, transparent ${Math.round(42 - ck * 34)}%, black ${Math.round(78 - ck * 30)}%)`,
            }} />
            <div className="pointer-events-none fixed inset-0 z-[31]" style={{ boxShadow: `inset 0 0 ${Math.round(90 + ck * 120)}px ${Math.round(20 + ck * 40)}px rgba(214,170,40,${(0.12 + ck * 0.32).toFixed(3)})` }} />
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
      {/* 杰瑞木僵、虔诚姿态、击晕与驯服残响。 */}
      {(() => {
        const jo=jerryOverlay(engine)
        if(!jo.trance&&!jo.black&&!jo.devotion&&!jo.lapse)return null
        const t=Math.max(jo.trance,jo.lapse*.55)
        return <>
          {t>0&&<div data-jerry-trance className="pointer-events-none fixed inset-0 z-[32]" style={{boxShadow:`inset 0 0 ${Math.round(160+t*260)}px ${Math.round(40+t*140)}px rgba(18,36,120,${(.35+t*.5).toFixed(3)})`,backdropFilter:`saturate(${(1-t*.7).toFixed(2)}) blur(${(t*1.6).toFixed(2)}px)`,WebkitBackdropFilter:`saturate(${(1-t*.7).toFixed(2)}) blur(${(t*1.6).toFixed(2)}px)`}}/>}
          {jo.trance>.6&&<div className="pointer-events-none fixed inset-x-0 bottom-[22%] z-[33] text-center font-mono2 text-[15px] tracking-[0.5em]" style={{color:'rgba(190,206,255,0.85)',textShadow:'0 0 12px rgba(40,80,220,0.9)'}}>……</div>}
          {jo.devotion>.05&&<div className="pointer-events-none fixed inset-x-0 bottom-[24%] z-[33] text-center text-[16px]" style={{color:`rgba(226,232,255,${jo.devotion.toFixed(2)})`,textShadow:'0 1px 6px #000'}}>你低下头，双手交叠在胸前。</div>}
          {jo.black>0&&<div data-jerry-ko className="pointer-events-none fixed inset-0 z-[40]" style={{background:`rgba(0,0,0,${Math.min(1,jo.black).toFixed(3)})`}}>{jo.black>.9&&<div className="absolute inset-x-0 top-1/2 text-center text-[14px]" style={{color:'rgba(200,200,210,0.7)'}}>……有人拖着你的脚踝。</div>}</div>}
        </>
      })()}
      {/* HP ≤30：红色暗角脉冲（派对客转化越深，痛觉越弱，暗角越淡；高转化时消失） */}
      {p.hp <= 30 && p.hp > 0 && partyConvK(engine) < 0.85 && (
        <div className="pointer-events-none fixed inset-0 z-[31] anim-hpPulse" style={{ boxShadow: `inset 0 0 140px 40px rgba(179,53,43,${(0.3 + 0.25 * fxScale) * (1 - partyConvK(engine))})` }} />
      )}
      {/* 电池 ≤15：顶部警告 */}
      {p.flashlight && p.battery <= 15 && p.battery > 0 && (
        <div className="hud-panel font-mono2 absolute left-1/2 top-14 -translate-x-1/2 px-3 py-1 text-[11px] anim-barPulse" style={{ color: 'var(--amber)' }}>⚡ 电池电量低 {Math.round(p.battery)}%</div>
      )}
      {/* 手电瘫痪提示 */}
      {p.flashJamT > 0 && (
        <div className="hud-panel font-mono2 absolute left-1/2 top-14 -translate-x-1/2 px-3 py-1 text-[11px]" style={{ color: 'var(--sanity)' }}>⚡ 手电瘫痪 {p.flashJamT.toFixed(1)}s</div>
      )}
      {/* [window] 窗户 Entity 2：诱引暖晕 / 被抓（近战砍手臂挣脱，倒计时条）/ 默念三句 / 被拖入的白屏 / 特殊交互提示 */}
      {(() => {
        const wo = windowOverlay(engine)
        const sa = specialAction(engine)
        return <>
          {wo.lure > 0.02 && <div data-window-lure={wo.lure.toFixed(2)} className="pointer-events-none fixed inset-0 z-[30]" style={{ background: `radial-gradient(ellipse at center, rgba(255,220,170,0) 40%, rgba(255,214,160,${(0.32 * wo.lure).toFixed(3)}) 100%)` }} />}
          {wo.black > 0.01 && <div data-window-black={wo.black.toFixed(2)} className="pointer-events-none fixed inset-0 z-[34]" style={{ background: '#f2efe8', opacity: Math.min(1, wo.black) }} />}
          {wo.grabbed && <>
            <div className="pointer-events-none fixed inset-0 z-[31]" style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(10,10,14,0.6) 100%)' }} />
            <div data-window-grab className="pointer-events-none fixed inset-x-0 top-[60%] z-[35] text-center text-[15px]" style={{ color: 'rgba(240,226,200,0.92)', textShadow: '0 1px 6px #000' }}>
              {isMobile ? '窗户里的手臂把你往里拖！对准窗户按「攻击」砍它' : `窗户里的手臂把你往里拖！对准窗户按【${bindLabelFor('attack')}】砍它`}
            </div>
            <div className="pointer-events-none fixed left-1/2 top-[65%] z-[35] h-[7px] w-[220px] -translate-x-1/2 overflow-hidden rounded-sm" style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(220,200,170,0.35)' }}><div style={{ width: `${(100 * wo.left / wo.dragT).toFixed(1)}%`, height: '100%', background: 'rgba(214,150,96,0.9)' }} /></div>
          </>}
          {wo.murmur && <div data-window-murmur className="pointer-events-none fixed inset-x-0 top-[70%] z-[33] text-center text-[16px] italic" style={{ color: 'rgba(236,232,220,0.92)', textShadow: '0 1px 6px #000', letterSpacing: '0.08em' }}>「{wo.line}」</div>}
          {!wo.murmur && !wo.grabbed && wo.hint && <div className="pointer-events-none fixed inset-x-0 top-[70%] z-[33] text-center text-[13px]" style={{ color: 'rgba(230,226,200,0.8)', textShadow: '0 1px 6px #000' }}>{wo.hint.replace('【特殊交互】', isMobile ? '「' + (sa?.label ?? '默念') + '」按钮' : '【' + bindLabelFor('special') + '】')}</div>}
          {!isMobile && sa && sa.id !== 'houndPin' && !wo.murmur && !wo.grabbed && <div data-special-prompt={sa.id} className="hud-panel pointer-events-none fixed left-1/2 top-[76%] z-[33] -translate-x-1/2 px-3 py-1 text-[12px]" style={{ color: 'var(--text)' }}>【{bindLabelFor('special')}】{sa.hold ? '按住 ' : ''}{sa.label}<span style={{ color: 'var(--text-dim)' }}> · {sa.hint}</span></div>}
        </>
      })()}
      {/* [ferren] Ferren（Entity 92）：切行带人的闪白 + 走近时的作息提示（他此刻在做什么） */}
      {(() => {
        const fo = ferrenOverlay(engine)
        return <>
          {fo.flash > 0.01 && <div data-ferren-flash={fo.flash.toFixed(2)} className="pointer-events-none fixed inset-0 z-[34]" style={{ background: '#f7f6ff', opacity: Math.min(1, fo.flash) }} />}
          {fo.hint && <div data-ferren-hint className="pointer-events-none fixed inset-x-0 top-[66%] z-[33] text-center text-[13px]" style={{ color: 'rgba(236,230,206,0.86)', textShadow: '0 1px 6px #000' }}>{fo.hint}</div>}
        </>
      })()}
      {/* 手臂（Entité 15-FR）：被拖进风口的黑屏 / 被抓时的挣扎提示（按设备区分，桌面键位取自自定义绑定）/ 挣脱提示 */}
      {(() => {
        const ao = armsOverlay(engine)
        return <>
          {ao.black > 0.01 && <div data-arms-black={ao.black.toFixed(2)} className="pointer-events-none fixed inset-0 z-[34]" style={{ background: '#000', opacity: Math.min(1, ao.black) }} />}
          {ao.grabbed && <>
            <div className="pointer-events-none fixed inset-0 z-[31]" style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(70,8,4,0.55) 100%)' }} />
            <div data-arms-struggle className="pointer-events-none fixed inset-x-0 top-[60%] z-[35] text-center text-[15px]" style={{ color: 'rgba(240,226,200,0.92)', textShadow: '0 1px 6px #000' }}>
              {isMobile ? '它在把你往风口里拖！连点屏幕任意处、按「跳」或左右甩动摇杆挣扎' : `它在把你往风口里拖！连按【${bindLabelFor('jump')}】或交替按【${bindLabelFor('left')}】【${bindLabelFor('right')}】挣扎`}
            </div>
            <div className="pointer-events-none fixed left-1/2 top-[65%] z-[35] h-[7px] w-[220px] -translate-x-1/2 overflow-hidden rounded-sm" style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(220,200,170,0.35)' }}><div style={{ width: `${Math.min(100, ao.struggle / ao.need * 100).toFixed(1)}%`, height: '100%', background: '#d98a5a' }} /></div>
          </>}
          {ao.freed && <div className="pointer-events-none fixed inset-x-0 top-[30%] z-[33] text-center text-[15px]" style={{ color: 'rgba(230,226,200,0.85)', textShadow: '0 1px 6px #000' }}>你挣脱了——快离开风口下面，或者用光照它。</div>}
        </>
      })()}
      {/* Nguithr'xurh 重制：轻度镇静（视野发雾、含糊提示）/ 重度镇静（画面变暗、无法移动、摇晃身体挣脱） */}
      {(() => {
        const no = nguithrOverlay(engine)
        if (no.level === 'none') return no.freed ? <div className="pointer-events-none fixed inset-x-0 top-[30%] z-[33] text-center text-[15px]" style={{ color: 'rgba(230,226,200,0.85)', textShadow: '0 1px 6px #000' }}>你挣脱了——快离开天花板下面。</div> : null
        const heavy = no.level === 'heavy'
        return <>
          <div data-nguithr-sedation={no.level} className="pointer-events-none fixed inset-0 z-[30]" style={{ backdropFilter: `blur(${no.blur.toFixed(2)}px) brightness(${(1 - no.dark).toFixed(3)}) saturate(${heavy ? 0.45 : 0.8})`, WebkitBackdropFilter: `blur(${no.blur.toFixed(2)}px) brightness(${(1 - no.dark).toFixed(3)}) saturate(${heavy ? 0.45 : 0.8})`, background: `radial-gradient(ellipse at center, rgba(222,214,180,${(no.fog * 0.35).toFixed(3)}) 0%, rgba(206,198,160,${(no.fog * 0.6).toFixed(3)}) 70%, rgba(${heavy ? '10,8,4' : '190,182,150'},${(heavy ? 0.75 : no.fog * 0.7).toFixed(3)}) 100%)` }} />
          <div className="pointer-events-none fixed inset-x-0 top-[62%] z-[33] text-center text-[14px]" style={{ color: heavy ? 'rgba(236,228,196,0.9)' : 'rgba(220,214,190,0.55)', textShadow: '0 1px 6px #000', filter: heavy ? 'none' : 'blur(0.6px)' }}>{no.hint}</div>
          {heavy && <div className="pointer-events-none fixed left-1/2 top-[67%] z-[33] h-[7px] w-[220px] -translate-x-1/2 overflow-hidden rounded-sm" style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(220,210,170,0.35)' }}><div style={{ width: `${Math.min(100, no.struggle / no.need * 100).toFixed(1)}%`, height: '100%', background: '#d9c46a' }} /></div>}
        </>
      })()}
      {/* 缠丝麻痹（死亡飞蛾守卫）——视野模糊（毛玻璃覆盖层） */}
      <ArachnidHud engine={engine} />
      {/* [hound] 猎犬扑倒压制：挣脱进度 / 被咬红闪 / 剩余压制时间（只在被压住时显示） */}
      <HoundPinHud engine={engine} isMobile={isMobile} />
      {engine.webbedT > 0 && (
        <div className="pointer-events-none fixed inset-0 z-[30]" style={{ backdropFilter: 'blur(3px) brightness(0.92)', WebkitBackdropFilter: 'blur(3px) brightness(0.92)' }} />
      )}

      {/* 出口方向指引（蓝色=定居点地标） */}
      {exitArrow && (
        <div
          className="pointer-events-none fixed z-[31] font-mono2 flex flex-col items-center text-[12px]"
          style={{
            color: exitArrow.target === 'avenue' ? '#55e6ff' : exitArrow.target === 'landmark' ? '#6abfff' : 'var(--exit)',
            left: '50%', top: '18%',
            transform: `translateX(-50%) rotate(${exitArrow.rel}rad)`,
            opacity: 0.75,
          }}
        >
          <div style={{ fontSize: 26, textShadow: exitArrow.target === 'avenue' ? '0 0 8px #55e6ff' : exitArrow.target === 'landmark' ? '0 0 8px #6abfff' : '0 0 8px var(--exit)' }}>➤</div>
        </div>
      )}
      {exitArrow && (
        <div className="pointer-events-none fixed left-1/2 top-[24%] z-[31] -translate-x-1/2 font-mono2 text-[11px]" style={{ color: exitArrow.target === 'avenue' ? '#55e6ff' : exitArrow.target === 'landmark' ? '#6abfff' : 'var(--exit)', opacity: 0.7 }}>
          {exitArrow.target === 'avenue'
            ? `地图上最新的第九大道地标（${Math.round(exitArrow.d)}m）`
            : exitArrow.target === 'landmark'
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

      {/* Level 10 持续交互：饮水、局部挖掘、深湖下潜。 */}
      {engine.l10Action && (
        <div className="pointer-events-none fixed left-1/2 top-1/2 z-[35] w-[240px] -translate-x-1/2 translate-y-10">
          <div className="hud-panel p-2 text-center">
            <div className="font-mono2 mb-1 text-[12px]" style={{ color: 'var(--amber)' }}>
              {engine.l10Action.kind === 'drink' ? '饮用湖水中…' : engine.l10Action.kind === 'dig' ? '挖掘旧土坑中…' : '向深湖中心下潜中…'}
            </div>
            <div className="h-[8px] w-full overflow-hidden rounded-sm" style={{ background: 'rgba(0,0,0,0.6)' }}>
              <div className="h-full" style={{ width: `${Math.min(100, engine.l10Action.t / engine.l10Action.dur * 100)}%`, background: 'var(--amber)', transition: 'width 0.08s linear' }} />
            </div>
          </div>
        </div>
      )}

      {/* 消耗品使用进度：效果与扣除只在进度完整结束时发生 */}
      {engine.usingItem && (
        <div className="pointer-events-none fixed left-1/2 top-1/2 z-[35] w-[240px] -translate-x-1/2 translate-y-10">
          <div className="hud-panel p-2 text-center">
            <div className="font-mono2 mb-1 text-[12px]" style={{ color: 'var(--amber)' }}>
              {engine.usingItem.label}{ITEMS[engine.usingItem.type]?.name ?? engine.usingItem.type}中…
            </div>
            <div className="h-[8px] w-full overflow-hidden rounded-sm" style={{ background: 'rgba(0,0,0,0.6)' }}>
              <div className="h-full" style={{ width: `${Math.min(100, engine.usingItem.t / engine.usingItem.dur * 100)}%`, background: 'var(--amber)', transition: 'width 0.08s linear' }} />
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
            style={{ background: 'color-mix(in srgb, var(--panel) 88%, transparent)', ...(engine.player.level === 11 && engine.map?.inf ? { width: 'min(960px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto', padding: 8 } : {}) }}
            onClick={(e) => e.stopPropagation()}
          >
            {engine.player.level === 11 && engine.map?.inf
              ? <L11MapPanel engine={engine} compact />
              : engine.map?.traders
                ? <TradersMapPanel engine={engine} compact />
                : engine.map?.settlement?.blueprint.id === 'alpha'
                  ? <AlphaMapPanel engine={engine} compact />
                : <Minimap engine={engine} size={bigMapSize} />}
            {/* v13：当前楼层标注（多楼层契约存在时） */}
            {floorInfo && !(engine.player.level === 11 && engine.map?.inf) && (
              <div className="font-mono2 text-[12px]" style={{ color: 'var(--amber)' }}>
                L{dispId} · {def.name} · 当前 {floorInfo.cur + 1}F / 共{floorInfo.total}层
              </div>
            )}
            {!engine.map?.traders && engine.map?.settlement?.blueprint.id !== 'alpha' && engine.levelDef.id !== 4 && !(engine.player.level === 11 && engine.map?.inf) && <div className="font-mono2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
              <span><span style={{ color: 'var(--amber)' }}>●</span> 你的位置</span>
              <span><span style={{ color: 'var(--exit)' }}>●</span> 出口</span>
              {mapZData(engine.map).elev && <span><span style={{ color: MINIMAP_COLORS.high }}>■</span> 高台</span>}
              {mapZData(engine.map).elev && <span><span style={{ color: MINIMAP_COLORS.low }}>■</span> 低洼</span>}
              {(mapZData(engine.map).outdoor || mapZData(engine.map).elev) && <span><span style={{ color: MINIMAP_COLORS.outdoor }}>■</span> 室外</span>}
              <span style={{ opacity: 0.7 }}>点击空白处关闭</span>
            </div>}
            <button
              className={`hud-panel font-mono2 absolute ${engine.player.level === 11 && engine.map?.inf ? 'right-1 top-1' : '-right-2 -top-2'} flex h-7 w-7 items-center justify-center text-[13px]`}
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
      aria-pressed={active}
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
        width: isMobile ? 'min(88vw, 360px)' : 400,
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
                {spawnSub === 'entity' && <DevEntitySpawner engine={engine} />}
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
                    <DevBtn active={engine.dev.statLock} onClick={() => { engine.dev.statLock = !engine.dev.statLock }} title="开启后每帧锁满生存状态和手机电量（默认开发者行为）">
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
                    {engine.levelDef.id === 7 && <DevBtn onClick={() => engine.devGotoIsland()}>🏝 最近岛屿</DevBtn>}
                    <DevBtn onClick={() => engine.devTeleport('spawn')}>⌂ 出生点</DevBtn>
                    {engine.levelDef.id === 0 && (
                      <DevBtn onClick={() => engine.devTestField()} title="仅教学关卡：生成 80×80 无墙空旷测试场地并传送（不会自然生成）">⬜ 测试场地（L0）</DevBtn>
                    )}
                  </div>
                </DevSection>
                {engine.levelDef.exits.length > 0 && <DevExitTools engine={engine} />}
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
                    <DevSection label="本层固定结构 / 区域 / 自然地形（●已生成 ○未生成→流式定位）">
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
                            title={v.found ? '传送到该区域或固定自然地形' : '已生成区域中没有：点击生成新区域并安全传送'}
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
                {/* 层级任务调试：模拟发现事件（天顶站／冰室仍为占位；真实 L0.2 入口见下方）+ 任务进度一览 */}
                {p.level === 0 && (
                  <DevSection label={`L0 子层级（模拟进入 · 当前：${p.levelQuests?.sublevel ? l0SublevelName(p.levelQuests.sublevel) : '主体'}）`}>
                    <div className="flex flex-wrap gap-1" data-dev-sublevels>
                      {L0_SUBLEVELS.map((sl) => (
                        <DevBtn key={sl.id} active={p.levelQuests?.sublevel === sl.id} onClick={() => engine.enterL0Sublevel(sl.id)}>{sl.name}</DevBtn>
                      ))}
                      <DevBtn onClick={() => engine.leaveL0Sublevel()}>回到主体</DevBtn>
                    </div>
                    <div className="mt-1 font-mono2 text-[10px] leading-snug" style={{ color: 'var(--text-dim)' }}>
                      {engine.levelQuests.debug(engine).map((q) => (
                        <div key={q.id}>{q.id}：{q.done ? '完成' : q.revealed ? '进行中' : '未出现'}{q.rewarded ? '（已领奖）' : ''} · {q.obj.map((o) => `${o.done ? '■' : o.visible ? '□' : '·'}${o.id}${o.progress !== undefined ? `(${o.progress})` : ''}`).join(' ')}</div>
                      ))}
                    </div>
                  </DevSection>
                )}
                {/* 施工许可 / Level 0.2「重塑的混乱」调试（engine/remodel.ts）：第五轮改为默认收起的可展开分区，标题「Level 0.2」 */}
                <details className="mb-2" data-dev-l02-section>
                  <summary className="cursor-pointer select-none" style={{ color: 'var(--amber)' }}>Level 0.2</summary>
                  <div className="mb-1 mt-1 text-[10px] text-neutral-400" style={{ overflowWrap: 'anywhere' }}>施工许可：BRC 声望 {engine.rep.brc ?? 0} · 许可{p.remodel?.permitIssued ? (p.remodel.armed ? '可用' : '冷却中') : '未发放'} · 施工点 {p.remodel?.sites.length ?? 0}</div>
                  <div className="flex flex-wrap gap-1" data-dev-remodel>
                    <DevBtn onClick={() => engine.devRemodel('rep')}>声望设为 61</DevBtn>
                    <DevBtn onClick={() => engine.devRemodel('permit')}>发放许可</DevBtn>
                    <DevBtn onClick={() => engine.devRemodel('rearm')}>重置冷却</DevBtn>
                    <DevBtn onClick={() => engine.devRemodel('clear')}>清除施工点</DevBtn>
                    <DevBtn active={p.level === 902} onClick={() => engine.devRemodel('enter')}>直接进 L0.2</DevBtn>
                    <DevBtn onClick={() => engine.devRemodel('back')}>回 L0 施工门旁</DevBtn>
                  </div>
                  {p.level === 902 && engine.l02 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1" data-dev-l02-stage>
                      <span className="text-[10px] text-neutral-400">崩塌 t={Math.round(engine.l02.t)}s · 阶段 {engine.l02.stage}{engine.l02.stopped ? '（已停止）' : engine.l02.lull ? '（喘息）' : ''} · 粉尘 {engine.l02.dust.toFixed(2)}：</span>
                      {[0, 1, 2, 3, 4].map((n) => <DevBtn key={n} active={engine.l02?.stage === n} onClick={() => engine.devL02Stage(n)}>跳到崩塌阶段 {n}</DevBtn>)}
                      <DevBtn onClick={() => engine.devL02Stage(-1)}>停止崩塌</DevBtn>
                    </div>
                  )}
                </details>
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
                  <p className="mb-2 leading-relaxed" style={{ color: 'var(--text-dim)' }}>飞行：按住跳跃上升、蹲下降低，松开悬停。关闭穿墙时保留碰撞。</p>
                  <div className="grid grid-cols-3 gap-1">
                    <DevBtn active={engine.dev.fly} onClick={() => engine.devSetFlight(!engine.dev.fly)} title="跳跃上升，蹲下下降；碰撞由穿墙开关控制">飞行</DevBtn>
                    <DevBtn active={engine.dev.noclip} onClick={() => { engine.dev.noclip = !engine.dev.noclip }}>穿墙</DevBtn>
                    <DevBtn active={engine.dev.speed} onClick={() => { engine.dev.speed = !engine.dev.speed }}>加速</DevBtn>
                    <DevBtn active={engine.dev.oneHit} onClick={() => { engine.dev.oneHit = !engine.dev.oneHit }} title="近战攻击直接击杀任意实体">一击必杀</DevBtn>
                    <DevBtn active={engine.dev.invisible} onClick={() => { engine.dev.invisible = !engine.dev.invisible }} title="实体不会索敌/追击/触发特殊行为">隐形</DevBtn>
                    <DevBtn active={engine.dev.frozenAI} onClick={() => { engine.dev.frozenAI = !engine.dev.frozenAI }} title="实体 AI 完全冻结">冻结AI</DevBtn>
                    <DevBtn active={engine.dev.god} onClick={() => { engine.dev.god = !engine.dev.god }} title="无敌（默认随开发者模式开启）">无敌</DevBtn>
                    <DevBtn active={engine.dev.bright} onClick={() => { engine.dev.bright = !engine.dev.bright }} title="一键照明：层级全局增亮——灯光强度拉满、环境光常亮，无视停电/熄灯区/层级光照系数">一键照明</DevBtn>
                    <DevBtn active={engine.dev.noAttackCooldown} onClick={() => { engine.dev.noAttackCooldown = !engine.dev.noAttackCooldown; engine.attackCooldownT = 0 }} title="关闭所有武器与空手攻击间隔；体力消耗仍然保留">攻击无冷却</DevBtn>
                    <DevBtn active={codexAll} onClick={toggleCodexAll} title="图鉴全开：实体/物品/层级/文档全部解锁（关闭后恢复到开启前的图鉴进度）">图鉴全开</DevBtn>
                    <DevBtn active={engine.dev.mapReveal} onClick={() => { engine.dev.mapReveal = !engine.dev.mapReveal }} title="临时显示原版大地图和小地图的全部地形，关闭后恢复探索迷雾，不改写探索记录">地图全开</DevBtn>
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
  thingmeat: '#c95a6a', ratmeat: '#b0645a', creepmeat:'#d1cbbb', velvetcake: '#b3243c', oddbook: '#8a6ac9', cavingsuit: '#d97a2e', xenonmarble: '#66e0d0',
  driedfruit: '#b86a2e', uvlamp: '#b48aff', stonekazoo: '#9a8a72', pockets: '#78cfcc',
  housekey: '#c9c9d2', wheatgrain: '#d9c25a', nails: '#7d8896', timber: '#96682e',
  presses: '#cfa12e', pamphlet: '#7ac9b0', jerryflyer:'#4268d6', fakelog:'#b8a77a', citywater: '#3aa0d8', endnote: '#8a7a6a',
  // ===== v32：后室扩展物品 =====
  cashew: '#c9a05a',
  knife: '#c9cdd4', axe: '#d96a3a', headlamp: '#f0d060', nightvision: '#78b886', notebook: '#8a6a4a',
  fuyouyu: '#788f59', squirtgun: '#4ac9e8', warpberry: '#b06ae0', royalration: '#e8c93d',
  leverrifle: '#b48a3c', revolver: '#3a3d42', musket: '#9ea2a4', trapdoor: '#2a3038', cart_4440: '#c9a45a', cart_paper: '#d8ccb0', cart_4570: '#c9a45a',
  dbshotgun: '#6e3c24', shell_buck: '#a8322a', shell_bird: '#3f6a3a', shell_clump: '#d4a62a', // 鎏金兵械库
  // ===== v38：Tom 的餐馆菜肴 =====
  tomatosoup: '#d95a3a', gardensalad: '#7ac97a', garlicbread: '#d9a85a', pasta: '#e8b93c',
  meatstew: '#c96a4a', pizza: '#e08a4a', lasagna: '#d9a03d', tomsspecial: '#c95a4a',
  grilledsteak: '#a86a3e', jambread: '#c98a6a',
  // ===== v40：此前缺专属色的两件（像素图已补齐，此处仅作 404 兜底配色） =====
  disinfectant: '#9fd0d8', welcomenote: '#f0e6c0',
  sedgland: '#d9c46a', // Nguithr'xurh 掉落的镇静腺
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
  liveshrimp: true, // v81 活旱虾
  bento: true, // v83 自制便当（Object 70）
  memoryjuice: true, laughrepellent: true, babelbalm: true, outdoorkit: true, traumakit: true, saltbox: true, // 批发市场 v2
  dbshotgun: true, shell_buck: true, shell_bird: true, shell_clump: true, // 鎏金兵械库
  leverrifle: true, revolver: true, musket: true, trapdoor: true, cart_4440: true, cart_paper: true, cart_4570: true,
  ratmeat: true, creepmeat:true, // 尸鼠肉与长白毛的尸鼠肉
  firesalt: true, liquidpain: true, // v50 火盐晶体 / 液态痛苦
  // v51：Object 5 糖果（散装 + 袋装）
  candysilver: true, candybullet: true, candygun: true, candystanley: true,
  candywaste: true, candygenius: true, candymint: true,
  candysilver_bag: true, candybullet_bag: true, candygun_bag: true, candystanley_bag: true,
  candywaste_bag: true, candygenius_bag: true, candymint_bag: true,
  manmade: true, // v51 人制品
  luckymilk: true, // v54 幸运豆奶（Object 28）
  velvetcake: true,
  jerryflyer: true, fakelog: true,
  sedgland: true, // Nguithr'xurh 镇静腺（gen-item-icons.py draw_sedgland）
  acidcallus: true, ashpile: true, // 2026-10-23：酸性胼胝 / 一捧细灰
  curabiturgel: true, curabiturspore: true, curabiturrepellent: true, // 2026-10-23：受眷鸟三件
  phone: true, bottledwater: true, snackbar: true, foyerpack: true, // 前厅随身物品（gen-item-icons.py draw_phone 等，打磨轮）
  brc_permit: true, // 施工许可（gen-item-icons.py draw_brc_permit）
  dustmask: true, // 防尘口罩（gen-item-icons.py draw_dustmask）
  tape_l0: true, // 层级专属磁带（外观表 content/levelTapes.json，gen-item-icons.py draw_level_tape）
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
      case 'milk':
      case 'bottle': return type === 'luckymilk'
        ? <><path d="M9 9.5V7.2c0-.7.5-1.2 1.1-1.2h3.8c.6 0 1.1.5 1.1 1.2v2.3l1.1 2.1v5.8a2 2 0 0 1-2 2H9.9a2 2 0 0 1-2-2v-5.8z" {...s} /><path d="M10.2 4h3.6v2h-3.6z" {...s} /><path d="M8.2 12h7.6v4.2H8.2z" {...s} /></>
        : <><rect x="9" y="6" width="6" height="13" rx="1" {...s} /><path d="M10.5 3h3v3h-3z" {...f} /><path d="M9 12h6" {...s} /></>
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
      case 'phone': return <><rect x="7" y="2.5" width="10" height="19" rx="2" {...s} /><path d="M10.5 5h3" {...s} /><circle cx="12" cy="18.5" r="0.9" {...f} /></>
      case 'card': return <><rect x="3" y="6" width="18" height="12" rx="1.5" {...s} /><rect x="5.5" y="9" width="5" height="3.5" {...s} /><path d="M14 9h5m-5 3h5" {...s} /></>
      case 'skeleton': return <><circle cx="8" cy="7" r="3.5" {...s} /><path d="M10.5 9.5 19 18m-3 0 2-2m-5-1 2-2" {...s} /></>
      case 'silver': return <path d="M8 3v7a2 2 0 0 0 4 0V3m-2 0v18m6-15c0 4-1 5-1 5v10" {...s} />
      case 'gland': return <><ellipse cx="12" cy="13.5" rx="6.5" ry="5.5" {...s} /><circle cx="12" cy="13.5" r="2" {...f} /><path d="M16 9l2-4" {...s} /></>
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
      {/* 彼物之肉：带骨肉的腿肉 */}
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
      {/* 一些口袋：双叶蛋白石胸针；其他 pocket 类保留通用布袋符号 */}
      case 'pocket': return type === 'pockets'
        ? <><path d="M9 11 7 6 4 5l1 3-3-1 2 3-3 1 5 4 3-1M15 13l2 5 3 1-1-3 3 1-2-3 3-1-5-4-3 1" {...s} /><path d="m4 9 4 3m8 0 4 3" {...s} /><ellipse cx="12" cy="12" rx="3.2" ry="2.8" {...s} /><ellipse cx="12" cy="12" rx="1.5" ry="1.3" {...f} /></>
        : <><path d="M8.5 8.5C6.5 10.5 5 12.7 5 15a7 5.6 0 0 0 14 0c0-2.3-1.5-4.5-3.5-6.5" {...s} /><path d="M9 8.5l1.2-3.6h3.6L15 8.5M9.3 6.3h5.4" {...s} /></>
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

/** 手机图标（HUD 电量行 / 移动端手机按钮）。 */
export function PhoneGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ display: 'inline-block' }}>
      <rect x="7" y="2.5" width="10" height="19" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="12" cy="18.5" r="0.9" fill="currentColor" />
    </svg>
  )
}
