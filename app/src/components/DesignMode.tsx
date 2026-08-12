// ================= v54：设计模式界面（DESIGN-GUIDE.md 的查看/编辑/导出端）=================
// 开发者模式（br_settings.devMode）下从标题屏进入。左栏条目树（布局 + 图鉴分类），
// 中栏 2D 俯视画布（布局）/ 字段编辑器（图鉴），右栏属性面板。
// 全部编辑只改内存状态、不回写游戏；「导出 JSON」只导出被修改的布局（完整 LayoutEntry）
// 与被修改的图鉴条目（仅改动字段），交 Agent 按 DESIGN-GUIDE 复刻落地。
// v54 第二批：随机/新建 NPC 槽 · 灯具编辑 · 随机生成物 random/chance 标记 · 变体随机样例
// （randomized：换种子重采样，固定编辑只落 random:false 对象）· 地面物品编辑 · 区域矩形范围编辑。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { extractLayouts, resampleVariant } from '@/game/design/extractLayouts'
import { extractCodex } from '@/game/design/extractCodex'
import { buildDesignFile } from '@/game/design/buildDesignFile'
import type { CodexEntry, CodexKind, LayoutEntry, StructEntry, ZoneEntry } from '@/game/design/types'
import { DECOR_REGISTRY } from '@/game/content/decorRegistry'
import { ENTITIES } from '@/game/entities'
import { NPCS } from '@/game/content/npcs'
import { ITEMS } from '@/game/content/items'
import {
  CECS_CLASS_INFO, CECS_HAZARD, CECS_NAMES, CECS_ORDER,
  IOTS_FREQ_COLORS, IOTS_FREQ_VALUES, IOTS_ORIGIN_VALUES, IOTS_UTIL_VALUES,
  type LevelScores,
} from '@/game/content/codexScores'
import { CecsBox, LevelClassBanner } from './CodexWidgets'

// ---------- 结构分类（decorRegistry 聚合：容器 > 可交互 > 实心 > 非实心）----------
const DECOR = new Map(DECOR_REGISTRY.map((e) => [e.id, e]))
// 新增结构可选 kind：注册表中的结构类条目（排除渲染侧贴花/道具）
const STRUCT_KINDS = DECOR_REGISTRY.filter((e) => !e.id.startsWith('decal:') && !e.id.startsWith('prop:'))
const structColor = (s: StructEntry): string => {
  const d = DECOR.get(s.kind)
  if (d?.container) return '#c9a03a' // 容器：琥珀
  if (d?.interactive) return '#6fa8ff' // 可交互：蓝
  return s.solid ? '#8a7a5a' : '#55604f' // 实心：灰褐 / 非实心：灰绿
}
const structName = (kind: string) => DECOR.get(kind)?.name ?? kind

// v54：随机居民池风味（与 extractLayouts.OUTPOST_NPC_FLAVOR 一致；非据点布局缺省 meg）
const OUTPOST_NPC_FLAVOR: Record<string, string> = {
  alpha: 'meg', bntg: 'bntg', ariane: 'ariane', tom: 'mixed', el3a: 'el3a', gamma: 'meg', jerry: 'jerry',
}
const NPC_FLAVORS = ['meg', 'bntg', 'ariane', 'mixed', 'el3a', 'jerry', 'brc'] as const
/** NPC 显示名（random=随机居民槽 / new:=新建固定 NPC / 注册表 id） */
const npcName = (n: { id: string; flavor?: string; newNpc?: { name: string } }) =>
  n.id === 'random' ? `随机居民(${n.flavor ?? 'meg'})` : n.newNpc?.name ?? NPCS[n.id]?.name ?? n.id

// ---------- 选择模型 ----------
type SelType = 'struct' | 'npc' | 'entity' | 'item' | 'exit' | 'light' | 'zone' | 'stair'
interface Sel { type: SelType; index: number }
type Placing =
  | { type: 'struct'; kind: string }
  | { type: 'npc'; id: string; flavor?: string; newNpc?: { name: string; role: string; desc: string } }
  | { type: 'entity'; etype: string }
  | { type: 'item'; item: string }
  | { type: 'light' }
  | { type: 'stair'; dir: number; lo: number; hi: number } // v54：新增楼梯格（dir 1东 2西 3南 4北；lo/hi 米）
  | null
type WallMode = 'off' | 'wall' | 'floor' // 墙壁编辑：wall=墙层（tiles/upWall/upWall2）floor=楼板层（up/up2）

const STAIR_DIR_LABEL: Record<number, string> = { 1: '东', 2: '西', 3: '南', 4: '北' }
const selEq = (a: Sel, b: Sel) => a.type === b.type && a.index === b.index // v54 任务4：多选判等

const btnSt = { border: '1px solid var(--panel-edge)', color: 'var(--text-dim)', padding: '2px 10px' } as const
const inputSt = { background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--panel-edge)', padding: '2px 6px' } as const

// ============================================================ 布局画布 ============================================================
interface CanvasProps {
  entry: LayoutEntry
  floor: number // 当前查看楼层 0/1/2
  sel: Sel | null
  placing: Placing
  wallMode: WallMode
  lockRandom: boolean // v54：randomized 布局——随机对象只选不动
  focus: { x: number; y: number; n: number } | null // 居中请求（列表点选时）
  multi: Sel[] // v54 任务4：多选集合（Shift+点选加选 / 框选）
  onMulti: (sels: Sel[]) => void
  onMoveMulti: (items: { type: SelType; index: number; x: number; y: number }[]) => void // 多选整体拖拽（绝对坐标）
  onSelect: (s: Sel | null, cands?: Sel[]) => void // cands=同位置候选（循环点选序号显示用）
  onMove: (type: SelType, index: number, x: number, y: number) => void
  onZoneRect: (index: number, patch: Partial<ZoneEntry>) => void
  onToggleTile: (x: number, y: number) => void
  onPlace: (x: number, y: number) => void
}

function LayoutCanvas({ entry, floor, sel, multi, placing, wallMode, lockRandom, focus, onMulti, onMoveMulti, onSelect, onMove, onZoneRect, onToggleTile, onPlace }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(8) // 像素/瓦片
  const [center, setCenter] = useState({ x: entry.size[0] / 2, y: entry.size[1] / 2 }) // 视野中心（瓦片坐标）
  const [hover, setHover] = useState<{ text: string; px: number; py: number } | null>(null)
  const drag = useRef<
    | { pan: true; px: number; py: number; cx: number; cy: number }
    | { pan: false; type: SelType; index: number; gx: number; gy: number }
    | { pan: false; zoneEdge: number; edge: 'w' | 'e' | 'n' | 's' }
    | { pan: false; box: true; x0: number; y0: number } // 框选（Shift+空处拖拽）
    | { pan: false; multiDrag: true; sx: number; sy: number; snap: { type: SelType; index: number; x: number; y: number }[]; lx: number; ly: number } // 多选整体拖拽
    | null
  >(null)
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null) // 框选矩形（瓦片坐标）
  const inMulti = (t: SelType, i: number) => multi.some((m2) => m2.type === t && m2.index === i)
  const [size, setSize] = useState({ w: 600, h: 400 })

  // 画布尺寸跟随容器
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // 切换布局（或换种子重采样）：视野适配整图（仅 id/seed 变化时——编辑产生的对象身份变化不重置视野）
  useEffect(() => {
    const [w, h] = entry.size
    setCenter({ x: w / 2, y: h / 2 })
    setZoom(Math.max(2, Math.min((size.w - 40) / w, (size.h - 40) / h)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id, entry.seed, size.w, size.h]) // size：容器首次真实测量后重新适配（编辑不改尺寸，不会打断拖拽）
  // 居中请求（右栏列表点选结构等）
  useEffect(() => {
    if (focus) setCenter({ x: focus.x, y: focus.y })
  }, [focus])

  // 屏幕 ↔ 瓦片坐标
  const toScreen = useCallback((tx: number, ty: number) => ({
    sx: size.w / 2 + (tx - center.x) * zoom,
    sy: size.h / 2 + (ty - center.y) * zoom,
  }), [size, center, zoom])
  const toTile = useCallback((px: number, py: number) => ({
    tx: center.x + (px - size.w / 2) / zoom,
    ty: center.y + (py - size.h / 2) / zoom,
  }), [size, center, zoom])

  // 当前楼层的地板/墙行（0F=tiles；1F=up/upWall；2F=up2/upWall2）
  const floorRows = useMemo((): { floorRows?: string[]; wallRows?: string[] } => {
    if (floor === 1) return { floorRows: entry.up, wallRows: entry.upWall }
    if (floor === 2) return { floorRows: entry.up2, wallRows: entry.upWall2 }
    return { floorRows: entry.tiles, wallRows: undefined } // 0F：'#' 即墙
  }, [entry, floor])

  // 选中区域（zones）的矩形范围——仅选中时叠加显示（v54 任务7）
  const selZone = sel?.type === 'zone' ? entry.zones?.[sel.index] : undefined
  const selZoneRect = selZone && selZone.x0 !== undefined && (selZone.z ?? 0) === floor
    ? { x0: selZone.x0, y0: selZone.y0 ?? selZone.y, x1: selZone.x1 ?? selZone.x0, y1: selZone.y1 ?? selZone.y0 ?? selZone.y }
    : null

  // ---------- 绘制 ----------
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    cv.width = size.w; cv.height = size.h
    const g = cv.getContext('2d')
    if (!g) return
    const [W, H] = entry.size
    g.fillStyle = '#14110b'
    g.fillRect(0, 0, size.w, size.h)
    // 瓦片
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const f = floorRows.floorRows?.[y]?.[x]
        const wch = floorRows.wallRows?.[y]?.[x]
        let color: string | null = null
        if (floor === 0) color = f === '.' ? '#7a6c42' : '#241f14'
        else {
          if (wch === '#') color = '#4a5a50' // 上层墙体
          else if (f === '#') color = '#31423a' // 上层楼板
        }
        if (!color) continue
        const { sx, sy } = toScreen(x, y)
        if (sx > size.w || sy > size.h || sx + zoom < 0 || sy + zoom < 0) continue
        g.fillStyle = color
        g.fillRect(sx, sy, zoom + 0.5, zoom + 0.5)
      }
    }
    // 楼梯坡道（各楼层视图都画，橙色 + 方向箭头指向坡上行方向；悬停显示 lo/hi）
    ;(entry.stair ?? []).forEach((st, i) => {
      if (st.remove) return
      const { sx, sy } = toScreen(st.x, st.y)
      g.fillStyle = '#c97a3a'
      g.fillRect(sx, sy, zoom, zoom)
      // 方向箭头：dir 1东 2西 3南 4北（箭头指向坡上行方向）
      const cx0 = sx + zoom / 2, cy0 = sy + zoom / 2, r = zoom * 0.32
      const a = st.dir === 1 ? 0 : st.dir === 2 ? Math.PI : st.dir === 3 ? Math.PI / 2 : -Math.PI / 2
      const ux = Math.cos(a), uy = Math.sin(a)
      g.fillStyle = '#14110b'
      g.beginPath()
      g.moveTo(cx0 + ux * r, cy0 + uy * r)
      g.lineTo(cx0 - uy * r * 0.7 - ux * r * 0.4, cy0 + ux * r * 0.7 - uy * r * 0.4)
      g.lineTo(cx0 + uy * r * 0.7 - ux * r * 0.4, cy0 - ux * r * 0.7 - uy * r * 0.4)
      g.closePath(); g.fill()
      const isSel = sel?.type === 'stair' && sel.index === i
      if (isSel) { g.strokeStyle = '#f5e37a'; g.lineWidth = 2; g.strokeRect(sx - 1, sy - 1, zoom + 2, zoom + 2); g.lineWidth = 1 }
    })
    // 结构（按楼层过滤；deg 画朝向刻线；random=虚线框 + 「随」角标）
    ;(entry.structures ?? []).forEach((s, i) => {
      if (s.remove || (s.floor ?? 0) !== floor) return
      const { sx, sy } = toScreen(s.x, s.y)
      g.fillStyle = structColor(s)
      g.globalAlpha = 0.85
      g.fillRect(sx, sy, s.w * zoom, s.h * zoom)
      g.globalAlpha = 1
      const isSel = (sel?.type === 'struct' && sel.index === i) || inMulti('struct', i)
      g.strokeStyle = isSel ? '#f5e37a' : 'rgba(0,0,0,0.55)'
      g.lineWidth = isSel ? 2 : 1
      g.setLineDash(s.random ? [3, 2] : [])
      g.strokeRect(sx, sy, s.w * zoom, s.h * zoom)
      g.setLineDash([])
      if (s.random && zoom >= 7) { g.fillStyle = '#f5e37a'; g.font = '9px monospace'; g.fillText('随', sx + 1, sy + 8) }
      if (s.deg !== undefined && zoom >= 5) {
        const cx0 = sx + (s.w * zoom) / 2, cy0 = sy + (s.h * zoom) / 2
        const a = (-s.deg * Math.PI) / 180 // deg 逆时针；canvas y 向下故取负
        g.strokeStyle = '#f5e37a'
        g.beginPath()
        g.moveTo(cx0, cy0)
        g.lineTo(cx0 + Math.cos(a) * zoom * 0.45, cy0 + Math.sin(a) * zoom * 0.45)
        g.stroke()
      }
    })
    // 灯（黄圈 + 半径光晕随 r 缩放；仅主层视图——灯位未带楼层信息）
    ;(entry.lights ?? []).forEach((l, i) => {
      if (l.remove || floor !== 0) return
      const { sx, sy } = toScreen(l.x, l.y)
      g.fillStyle = 'rgba(245,227,122,0.12)'
      g.beginPath(); g.arc(sx, sy, l.r * zoom * 0.4, 0, Math.PI * 2); g.fill()
      const isSel = (sel?.type === 'light' && sel.index === i) || inMulti('light', i)
      g.strokeStyle = isSel ? '#ffffff' : 'rgba(245,227,122,0.85)'
      g.lineWidth = isSel ? 2 : 1
      g.beginPath(); g.arc(sx, sy, Math.max(2.5, zoom * 0.22), 0, Math.PI * 2); g.stroke()
      g.lineWidth = 1
    })
    // 出口（亮黄三角 + 名称）
    ;(entry.exits ?? []).forEach((x, i) => {
      if (x.remove) return
      const { sx, sy } = toScreen(x.x + 0.5, x.y + 0.5)
      const r = Math.max(4, zoom * 0.45)
      g.fillStyle = '#f5e37a'
      g.beginPath()
      g.moveTo(sx, sy - r); g.lineTo(sx + r, sy + r); g.lineTo(sx - r, sy + r)
      g.closePath(); g.fill()
      if ((sel?.type === 'exit' && sel.index === i) || inMulti('exit', i)) { g.strokeStyle = '#fff'; g.stroke() }
      if (zoom >= 4) {
        g.fillStyle = '#f5e37a'
        g.font = '10px monospace'
        g.fillText(x.name, sx + r + 2, sy + 3)
      }
    })
    // 物品（蓝点；random 带「随」角标；仅主层）
    if (floor === 0)
      (entry.items ?? []).forEach((it, i) => {
        if (it.remove) return
        const { sx, sy } = toScreen(it.x, it.y)
        g.fillStyle = '#4aa8e8'
        g.beginPath(); g.arc(sx, sy, Math.max(2, zoom * 0.16), 0, Math.PI * 2); g.fill()
        if ((sel?.type === 'item' && sel.index === i) || inMulti('item', i)) { g.strokeStyle = '#fff'; g.stroke() }
        if (it.random && zoom >= 7) { g.fillStyle = '#f5e37a'; g.font = '9px monospace'; g.fillText('随', sx + 3, sy - 3) }
      })
    // 实体（红点 + 类型名；random 带「随」角标）
    ;(entry.entities ?? []).forEach((en, i) => {
      if (en.remove) return
      const { sx, sy } = toScreen(en.x, en.y)
      g.fillStyle = '#d9534a'
      g.beginPath(); g.arc(sx, sy, Math.max(3, zoom * 0.28), 0, Math.PI * 2); g.fill()
      if ((sel?.type === 'entity' && sel.index === i) || inMulti('entity', i)) { g.strokeStyle = '#fff'; g.stroke() }
      if (en.random && zoom >= 7) { g.fillStyle = '#f5e37a'; g.font = '9px monospace'; g.fillText('随', sx + 4, sy - 4) }
      if (zoom >= 5) { g.fillStyle = '#e8a09a'; g.font = '10px monospace'; g.fillText(en.type, sx + 5, sy - 5) }
    })
    // NPC（绿点 + 名字；按楼层过滤）
    ;(entry.npcs ?? []).forEach((n, i) => {
      if (n.remove || n.floor !== floor) return
      const { sx, sy } = toScreen(n.x, n.y)
      g.fillStyle = '#6ad97a'
      g.beginPath(); g.arc(sx, sy, Math.max(3, zoom * 0.28), 0, Math.PI * 2); g.fill()
      if ((sel?.type === 'npc' && sel.index === i) || inMulti('npc', i)) { g.strokeStyle = '#fff'; g.stroke() }
      if (zoom >= 5) {
        g.fillStyle = '#9ae8a5'
        g.font = '10px monospace'
        g.fillText(npcName(n), sx + 5, sy - 5)
      }
    })
    // 区域名标注（按楼层带过滤）
    for (const z of entry.zones ?? []) {
      if ((z.z ?? 0) !== floor) continue
      const { sx, sy } = toScreen(z.x, z.y)
      g.fillStyle = 'rgba(230,220,190,0.85)'
      g.font = `${Math.max(10, zoom * 0.9)}px monospace`
      g.textAlign = 'center'
      g.fillText(z.name, sx, sy)
      g.textAlign = 'left'
    }
    // 框选矩形（Shift+空处拖拽）
    if (box) {
      const a = toScreen(Math.min(box.x0, box.x1), Math.min(box.y0, box.y1))
      const b2 = toScreen(Math.max(box.x0, box.x1), Math.max(box.y0, box.y1))
      g.fillStyle = 'rgba(245,227,122,0.06)'
      g.fillRect(a.sx, a.sy, b2.sx - a.sx, b2.sy - a.sy)
      g.strokeStyle = 'rgba(245,227,122,0.7)'
      g.setLineDash([3, 3])
      g.strokeRect(a.sx, a.sy, b2.sx - a.sx, b2.sy - a.sy)
      g.setLineDash([])
    }
    // 选中区域的矩形范围（半透明填充 + 虚线描边 + 四边中点手柄）
    if (selZoneRect) {
      const a = toScreen(selZoneRect.x0, selZoneRect.y0)
      const b2 = toScreen(selZoneRect.x1 + 1, selZoneRect.y1 + 1)
      g.fillStyle = 'rgba(245,227,122,0.08)'
      g.fillRect(a.sx, a.sy, b2.sx - a.sx, b2.sy - a.sy)
      g.strokeStyle = '#f5e37a'
      g.setLineDash([4, 3])
      g.strokeRect(a.sx, a.sy, b2.sx - a.sx, b2.sy - a.sy)
      g.setLineDash([])
      g.fillStyle = '#f5e37a'
      for (const [hx, hy] of [[(a.sx + b2.sx) / 2, a.sy], [(a.sx + b2.sx) / 2, b2.sy], [a.sx, (a.sy + b2.sy) / 2], [b2.sx, (a.sy + b2.sy) / 2]] as const)
        g.fillRect(hx - 3, hy - 3, 6, 6)
    }
  }, [entry, floor, sel, multi, box, zoom, center, size, toScreen, floorRows, hover, selZoneRect])

  // ---------- 命中测试 ----------
  const near = (tx: number, ty: number, x: number, y: number) => Math.abs(tx - x) < 0.7 && Math.abs(ty - y) < 0.7
  // 区域矩形边缘（选中且本层显示时优先）：返回边代号
  const zoneEdgeAt = (tx: number, ty: number): 'w' | 'e' | 'n' | 's' | null => {
    if (!selZoneRect || sel?.type !== 'zone') return null
    const { x0, y0, x1, y1 } = selZoneRect
    const T = 0.4
    if (ty > y0 - T && ty < y1 + 1 + T) {
      if (Math.abs(tx - x0) < T) return 'w'
      if (Math.abs(tx - (x1 + 1)) < T) return 'e'
    }
    if (tx > x0 - T && tx < x1 + 1 + T) {
      if (Math.abs(ty - y0) < T) return 'n'
      if (Math.abs(ty - (y1 + 1)) < T) return 's'
    }
    return null
  }
  /** 同位置全部可选对象（v54 任务3：循环点选；remove 墓碑对象不可选） */
  const hitTestAll = (tx: number, ty: number): Sel[] => {
    const out: Sel[] = []
    const structs = entry.structures ?? []
    for (let i = structs.length - 1; i >= 0; i--) {
      const s = structs[i]
      if (s.remove || (s.floor ?? 0) !== floor) continue
      if (tx >= s.x && tx < s.x + s.w && ty >= s.y && ty < s.y + s.h) out.push({ type: 'struct', index: i })
    }
    const npcs = entry.npcs ?? []
    for (let i = npcs.length - 1; i >= 0; i--) if (!npcs[i].remove && npcs[i].floor === floor && near(tx, ty, npcs[i].x, npcs[i].y)) out.push({ type: 'npc', index: i })
    const ents = entry.entities ?? []
    for (let i = ents.length - 1; i >= 0; i--) if (!ents[i].remove && near(tx, ty, ents[i].x, ents[i].y)) out.push({ type: 'entity', index: i })
    if (floor === 0) {
      const items = entry.items ?? []
      for (let i = items.length - 1; i >= 0; i--) if (!items[i].remove && near(tx, ty, items[i].x, items[i].y)) out.push({ type: 'item', index: i })
      const lights = entry.lights ?? []
      for (let i = lights.length - 1; i >= 0; i--) if (!lights[i].remove && near(tx, ty, lights[i].x, lights[i].y)) out.push({ type: 'light', index: i })
    }
    const exits = entry.exits ?? []
    for (let i = exits.length - 1; i >= 0; i--) if (!exits[i].remove && near(tx, ty, exits[i].x + 0.5, exits[i].y + 0.5)) out.push({ type: 'exit', index: i })
    const stairs = entry.stair ?? []
    for (let i = stairs.length - 1; i >= 0; i--) if (!stairs[i].remove && tx >= stairs[i].x && tx < stairs[i].x + 1 && ty >= stairs[i].y && ty < stairs[i].y + 1) out.push({ type: 'stair', index: i })
    return out
  }
  const hitTest = (tx: number, ty: number): Sel | null => hitTestAll(tx, ty)[0] ?? null
  /** 命中对象是否随机生成物（randomized 布局中随机对象只调生成率，不拖拽/删除） */
  const isRandomObj = (s: Sel): boolean => {
    if (s.type === 'struct') return !!entry.structures?.[s.index]?.random
    if (s.type === 'entity') return !!entry.entities?.[s.index]?.random
    if (s.type === 'item') return !!entry.items?.[s.index]?.random
    if (s.type === 'npc') return !!entry.npcs?.[s.index]?.random
    return false
  }
  // v54 任务3：同位置重复点击循环切换候选（点击别处重置循环）
  const lastClick = useRef<{ tx: number; ty: number; cands: Sel[] } | null>(null)

  const onMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const px = e.clientX - rect.left, py = e.clientY - rect.top
    const { tx, ty } = toTile(px, py)
    // v54：鼠标中键拖动=直接平移视图（不影响当前选中状态、不触发点选/框选）
    if (e.button === 1) {
      drag.current = { pan: true, px: e.clientX, py: e.clientY, cx: center.x, cy: center.y }
      e.preventDefault()
      return
    }
    if (placing) { onPlace(Math.floor(tx), Math.floor(ty)); return }
    if (wallMode !== 'off') { onToggleTile(Math.floor(tx), Math.floor(ty)); return }
    // v54 任务4：Shift+点选=加选/减选；Shift+空处拖拽=框选
    if (e.shiftKey) {
      const hit0 = hitTest(tx, ty)
      if (hit0) {
        onMulti(inMulti(hit0.type, hit0.index) ? multi.filter((m2) => !selEq(m2, hit0)) : [...multi, hit0])
        lastClick.current = null
      } else {
        drag.current = { pan: false, box: true, x0: tx, y0: ty }
        setBox({ x0: tx, y0: ty, x1: tx, y1: ty })
      }
      return
    }
    // 区域矩形边缘拖拽（选中区域时优先于一切对象）
    if (sel?.type === 'zone') {
      const edge = zoneEdgeAt(tx, ty)
      if (edge) { drag.current = { pan: false, zoneEdge: sel.index, edge }; return }
    }
    const cands = hitTestAll(tx, ty)
    let hit: Sel | null = cands[0] ?? null
    // 同一位置再次点击：循环到下一个候选（当前选中必须在候选里才循环，否则取第一个）
    const lc = lastClick.current
    if (lc && cands.length > 1 && Math.hypot(lc.tx - tx, lc.ty - ty) < 0.6 && sel) {
      const idx = cands.findIndex((c) => c.type === sel.type && c.index === sel.index)
      if (idx >= 0) hit = cands[(idx + 1) % cands.length]
    }
    lastClick.current = { tx, ty, cands }
    // 多选整体拖拽：命中对象在多选集合内（≥2）→ 整组移动（瓦片位移，快照 + 增量）
    if (hit && multi.length > 1 && inMulti(hit.type, hit.index)) {
      const snap: { type: SelType; index: number; x: number; y: number }[] = []
      for (const m2 of multi) {
        const o =
          m2.type === 'struct' ? entry.structures?.[m2.index] : m2.type === 'npc' ? entry.npcs?.[m2.index]
            : m2.type === 'entity' ? entry.entities?.[m2.index] : m2.type === 'item' ? entry.items?.[m2.index]
              : m2.type === 'light' ? entry.lights?.[m2.index] : m2.type === 'exit' ? entry.exits?.[m2.index] : undefined
        if (o && !(lockRandom && (o as { random?: boolean }).random)) snap.push({ type: m2.type, index: m2.index, x: o.x, y: o.y })
      }
      drag.current = { pan: false, multiDrag: true, sx: tx, sy: ty, snap, lx: 0, ly: 0 }
      return
    }
    onSelect(hit, cands)
    if (multi.length && (!hit || !inMulti(hit.type, hit.index))) onMulti([]) // 点选集合外对象/空处=退出多选
    if (hit) {
      if (lockRandom && isRandomObj(hit)) return // 随机对象：只选中（右栏调生成率），不拖拽
      let ox = tx, oy = ty
      if (hit.type === 'struct') { const s = entry.structures![hit.index]; ox = tx - s.x; oy = ty - s.y }
      else if (hit.type === 'npc') { const n = entry.npcs![hit.index]; ox = tx - n.x; oy = ty - n.y }
      else if (hit.type === 'entity') { const n = entry.entities![hit.index]; ox = tx - n.x; oy = ty - n.y }
      else if (hit.type === 'exit') { const n = entry.exits![hit.index]; ox = tx - n.x; oy = ty - n.y }
      else if (hit.type === 'item') { const n = entry.items![hit.index]; ox = tx - n.x; oy = ty - n.y }
      else if (hit.type === 'light') { const n = entry.lights![hit.index]; ox = tx - n.x; oy = ty - n.y }
      else if (hit.type === 'stair') { const n = entry.stair![hit.index]; ox = tx - n.x; oy = ty - n.y }
      drag.current = { pan: false, type: hit.type, index: hit.index, gx: ox, gy: oy }
    } else {
      drag.current = { pan: true, px: e.clientX, py: e.clientY, cx: center.x, cy: center.y }
    }
  }
  const onMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const px = e.clientX - rect.left, py = e.clientY - rect.top
    const { tx, ty } = toTile(px, py)
    const d = drag.current
    if (d) {
      if (d.pan) {
        setCenter({ x: d.cx - (e.clientX - d.px) / zoom, y: d.cy - (e.clientY - d.py) / zoom })
      } else if ('box' in d) {
        setBox({ x0: d.x0, y0: d.y0, x1: tx, y1: ty })
      } else if ('multiDrag' in d) {
        const dx = Math.round(tx - d.sx), dy = Math.round(ty - d.sy)
        if (dx !== d.lx || dy !== d.ly) {
          d.lx = dx; d.ly = dy
          onMoveMulti(d.snap.map((o) => ({ type: o.type, index: o.index, x: o.x + dx, y: o.y + dy })))
        }
      } else if ('zoneEdge' in d) {
        // 区域矩形边缘拖拽（瓦片对齐；保持 x0<=x1 / y0<=y1）
        const z = entry.zones?.[d.zoneEdge]
        if (z && z.x0 !== undefined) {
          const v = d.edge === 'w' || d.edge === 'e' ? Math.round(tx) : Math.round(ty)
          const cur = { x0: z.x0, y0: z.y0 ?? z.y, x1: z.x1 ?? z.x0, y1: z.y1 ?? z.y0 ?? z.y }
          if (d.edge === 'w') onZoneRect(d.zoneEdge, { x0: Math.min(v, cur.x1) })
          if (d.edge === 'e') onZoneRect(d.zoneEdge, { x1: Math.max(v - 1, cur.x0) })
          if (d.edge === 'n') onZoneRect(d.zoneEdge, { y0: Math.min(v, cur.y1) })
          if (d.edge === 's') onZoneRect(d.zoneEdge, { y1: Math.max(v - 1, cur.y0) })
        }
      } else {
        // 结构/出口按瓦片对齐取整；NPC/实体/物品对齐瓦片中心（x.5）；灯自由两位小数
        const snap = d.type === 'npc' || d.type === 'entity' || d.type === 'item'
        const nx = d.type === 'light' ? Math.round((tx - d.gx) * 100) / 100 : snap ? Math.floor(tx - d.gx) + 0.5 : Math.round(tx - d.gx)
        const ny = d.type === 'light' ? Math.round((ty - d.gy) * 100) / 100 : snap ? Math.floor(ty - d.gy) + 0.5 : Math.round(ty - d.gy)
        onMove(d.type, d.index, nx, ny)
      }
      return
    }
    // 悬停提示
    const hit = hitTest(tx, ty)
    if (hit) {
      let text = ''
      if (hit.type === 'struct') { const s = entry.structures![hit.index]; text = `${structName(s.kind)} (${s.kind}) ${s.w}×${s.h}${s.solid ? ' 实心' : ''}${s.random ? ` 随${s.chance !== undefined ? ` ${s.chance}` : ''}` : ''}` }
      else if (hit.type === 'npc') { const n = entry.npcs![hit.index]; text = `NPC ${npcName(n)} (${n.id})` }
      else if (hit.type === 'entity') { const en = entry.entities![hit.index]; text = `实体 ${ENTITIES[en.type]?.name ?? en.type}${en.random ? ' 随' : ''}` }
      else if (hit.type === 'exit') text = `出口 ${entry.exits![hit.index].name} → ${entry.exits![hit.index].dest}`
      else if (hit.type === 'item') { const it = entry.items![hit.index]; text = `物品 ${ITEMS[it.type]?.name ?? it.type}${it.random ? ' 随' : ''}` }
      else if (hit.type === 'light') { const l = entry.lights![hit.index]; text = `灯 r=${l.r} ${l.color}` }
      else if (hit.type === 'stair') { const st = entry.stair![hit.index]; text = `楼梯 坡向${STAIR_DIR_LABEL[st.dir] ?? st.dir} · 高 ${st.lo}→${st.hi}m` }
      setHover({ text, px, py })
    } else if (wallMode !== 'off') setHover({ text: `${wallMode === 'wall' ? '墙' : '楼板'}编辑：(${Math.floor(tx)}, ${Math.floor(ty)})`, px, py })
    else setHover(null)
  }
  const onMouseUp = () => {
    const d = drag.current
    if (d && !d.pan && 'box' in d && box) {
      // 框选定案：结构按矩形重叠、点对象按中心包含（均限当前楼层视图）
      const x0 = Math.min(box.x0, box.x1), x1 = Math.max(box.x0, box.x1)
      const y0 = Math.min(box.y0, box.y1), y1 = Math.max(box.y0, box.y1)
      const sels: Sel[] = []
      ;(entry.structures ?? []).forEach((st, i) => {
        if (st.remove || (st.floor ?? 0) !== floor) return
        if (st.x < x1 && st.x + st.w > x0 && st.y < y1 && st.y + st.h > y0) sels.push({ type: 'struct', index: i })
      })
      const pin = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1
      ;(entry.npcs ?? []).forEach((n, i) => { if (!n.remove && n.floor === floor && pin(n.x, n.y)) sels.push({ type: 'npc', index: i }) })
      ;(entry.entities ?? []).forEach((n, i) => { if (!n.remove && pin(n.x, n.y)) sels.push({ type: 'entity', index: i }) })
      if (floor === 0) {
        ;(entry.items ?? []).forEach((n, i) => { if (!n.remove && pin(n.x, n.y)) sels.push({ type: 'item', index: i }) })
        ;(entry.lights ?? []).forEach((n, i) => { if (!n.remove && pin(n.x, n.y)) sels.push({ type: 'light', index: i }) })
      }
      ;(entry.exits ?? []).forEach((n, i) => { if (!n.remove && pin(n.x + 0.5, n.y + 0.5)) sels.push({ type: 'exit', index: i }) })
      onMulti(sels)
      setBox(null)
    }
    drag.current = null
  }

  // v54：WASD/方向键持续平移视图（输入框/下拉聚焦时不劫持；Ctrl/Meta 组合键放行给复制粘贴等）
  useEffect(() => {
    const keys = new Set<string>()
    const PAN_PER_TICK = 0.22 // 每 tick 平移瓦片数（~60 tick/s ≈ 13 瓦片/秒）
    const ticker = setInterval(() => {
      if (!keys.size) return
      let dx = 0, dy = 0
      if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= PAN_PER_TICK
      if (keys.has('KeyS') || keys.has('ArrowDown')) dy += PAN_PER_TICK
      if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= PAN_PER_TICK
      if (keys.has('KeyD') || keys.has('ArrowRight')) dx += PAN_PER_TICK
      if (dx || dy) setCenter((c) => ({ x: c.x + dx, y: c.y + dy }))
    }, 16)
    const down = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (/^(KeyW|KeyA|KeyS|KeyD|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(e.code)) {
        keys.add(e.code)
        // 立即平移一步（首次按下与系统自动重复都触发；setInterval 节流环境下也能跟手）
        const dx = e.code === 'KeyA' || e.code === 'ArrowLeft' ? -0.5 : e.code === 'KeyD' || e.code === 'ArrowRight' ? 0.5 : 0
        const dy = e.code === 'KeyW' || e.code === 'ArrowUp' ? -0.5 : e.code === 'KeyS' || e.code === 'ArrowDown' ? 0.5 : 0
        setCenter((c) => ({ x: c.x + dx, y: c.y + dy }))
        e.preventDefault() // 方向键默认滚动页面，拦下
      }
    }
    const up = (e: KeyboardEvent) => keys.delete(e.code)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { clearInterval(ticker); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // 滚轮缩放（光标锚点；原生监听以便 preventDefault）
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = cv.getBoundingClientRect()
      const px = e.clientX - rect.left, py = e.clientY - rect.top
      setZoom((z0) => {
        const z1 = Math.max(2, Math.min(40, z0 * (e.deltaY < 0 ? 1.2 : 1 / 1.2)))
        if (z1 !== z0) setCenter((c0) => {
          const wx = c0.x + (px - size.w / 2) / z0
          const wy = c0.y + (py - size.h / 2) / z0
          return { x: wx - (px - size.w / 2) / z1, y: wy - (py - size.h / 2) / z1 }
        })
        return z1
      })
    }
    cv.addEventListener('wheel', onWheel, { passive: false })
    return () => cv.removeEventListener('wheel', onWheel)
  }, [size])

  return (
    <div ref={boxRef} className="relative h-full w-full overflow-hidden" style={{ background: '#14110b' }}
      data-zoom={zoom.toFixed(2)} data-cx={center.x.toFixed(2)} data-cy={center.y.toFixed(2)}>
      <canvas
        ref={canvasRef}
        style={{ cursor: placing ? 'crosshair' : wallMode !== 'off' ? 'cell' : drag.current ? 'grabbing' : 'grab', display: 'block' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { drag.current = null; setBox(null); setHover(null) }}
      />
      {hover && (
        <div className="font-mono2 pointer-events-none absolute z-10 border px-2 py-0.5 text-[11px]"
          style={{ left: hover.px + 12, top: hover.py + 12, background: 'var(--panel)', borderColor: 'var(--panel-edge)', color: 'var(--text)' }}>
          {hover.text}
        </div>
      )}
      {/* 图例 */}
      <div className="font-mono2 pointer-events-none absolute bottom-2 left-2 flex flex-col gap-0.5 text-[10px]" style={{ color: 'var(--text-dim)' }}>
        <span><span style={{ color: '#c9a03a' }}>■</span> 容器 <span style={{ color: '#6fa8ff' }}>■</span> 可交互 <span style={{ color: '#8a7a5a' }}>■</span> 实心 <span style={{ color: '#55604f' }}>■</span> 非实心 <span style={{ color: '#f5e37a' }}>随</span>=随机生成物</span>
        <span><span style={{ color: '#6ad97a' }}>●</span> NPC <span style={{ color: '#d9534a' }}>●</span> 实体 <span style={{ color: '#4aa8e8' }}>●</span> 物品 <span style={{ color: '#f5e37a' }}>▲</span> 出口 <span style={{ color: 'rgba(245,227,122,0.85)' }}>◯</span> 灯 <span style={{ color: '#c97a3a' }}>■</span> 楼梯</span>
      </div>
    </div>
  )
}

// ============================================================ 主组件 ============================================================
// v54 任务2：新建条目的字段模板（玩家自定义模式=全部字段手写；键名与 DESIGN-GUIDE §3 一致）
const NEW_TEMPLATES: Record<CodexKind, string[]> = {
  entity: ['name', 'desc', 'codex.no', 'codex.danger', 'codex.habitat', 'codex.behavior', 'codex.counter', 'codex.lore.0', 'codex.sighting'],
  item: ['name', 'desc'],
  level: ['name', 'label', 'flavor', 'lore', 'sd', 'entrance', 'exitDesc'],
  phenomenon: ['name', 'desc'],
  faction: ['name', 'fullName', 'desc'],
  outpost: ['name', 'intro.0', 'landmarkText.0'],
  npc: ['name', 'role', 'personality', 'backstory', 'lines.0.npc', 'idle.0'],
  doc: ['title', 'no', 'body.0.head', 'body.0.paras.0'],
}

const CODEX_GROUPS: { label: string; kind: CodexKind }[] = [
  { label: '实体', kind: 'entity' }, { label: '物品', kind: 'item' }, { label: '层级', kind: 'level' },
  { label: '现象', kind: 'phenomenon' }, { label: '团体', kind: 'faction' }, { label: '据点', kind: 'outpost' },
  { label: 'NPC', kind: 'npc' }, { label: '文档', kind: 'doc' },
]

export default function DesignMode({ onBack }: { onBack: () => void }) {
  // 数据（进入界面时提取一次；布局生成较慢，放 effect 里先亮加载提示）
  const [layouts, setLayouts] = useState<LayoutEntry[] | null>(null)
  const [codex, setCodex] = useState<CodexEntry[] | null>(null)
  useEffect(() => {
    const t = setTimeout(() => { setLayouts(extractLayouts()); setCodex(extractCodex()) }, 30)
    return () => clearTimeout(t)
  }, [])

  // 选择：布局 id 或 图鉴（kind+id）
  const [selLayout, setSelLayout] = useState<string | null>(null)
  const [selCodex, setSelCodex] = useState<{ kind: CodexKind; id: string } | null>(null)
  const [search, setSearch] = useState('')

  // 编辑状态：布局=整条工作副本；图鉴=仅改动字段
  const [layoutEdits, setLayoutEdits] = useState<Record<string, LayoutEntry>>({})
  const [codexEdits, setCodexEdits] = useState<Record<string, Record<string, string | number>>>({})
  // v54 任务5：变体随机样例重采样（samples[id] 覆盖提取基准；换种子即重新采样查看）
  const [samples, setSamples] = useState<Record<string, LayoutEntry>>({})
  const [seedText, setSeedText] = useState('424242')
  // 画布交互状态
  const [floor, setFloor] = useState(0)
  const [sel, setSel] = useState<Sel | null>(null)
  const [multi, setMulti] = useState<Sel[]>([]) // v54 任务4：多选集合
  const clipboard = useRef<{ type: SelType; obj: Record<string, unknown> }[]>([]) // Ctrl+C 剪贴板
  const pasteN = useRef(0) // 连续粘贴计数（每次 +1 格偏移）
  const [placing, setPlacing] = useState<Placing>(null)
  const [wallMode, setWallMode] = useState<WallMode>('off')
  const [focus, setFocus] = useState<{ x: number; y: number; n: number } | null>(null)
  const [addKind, setAddKind] = useState(STRUCT_KINDS[0]?.id ?? 'crate')
  const [addNpc, setAddNpc] = useState(Object.keys(NPCS)[0] ?? '')
  const [addEnt, setAddEnt] = useState(Object.keys(ENTITIES)[0] ?? '')
  const [addItem, setAddItem] = useState('almond')
  const [stairForm, setStairForm] = useState({ dir: 1, lo: 0, hi: 3 }) // v54：新增楼梯格默认参数
  const [cycle, setCycle] = useState<{ pos: number; total: number } | null>(null) // v54 任务3：同位候选序号
  const [newNpcForm, setNewNpcForm] = useState({ name: '', role: '', desc: '' }) // v54：布局内新建固定 NPC
  const [newEntries, setNewEntries] = useState<CodexEntry[]>([]) // v54 任务2：新建图鉴条目（导出带 new:true）
  const [newEntryForm, setNewEntryForm] = useState<CodexKind | null>(null) // 新建条目表单（kind）
  const [hint, setHint] = useState('') // 操作提示（随机布局禁固定编辑等）

  const baseLayout = layouts ? (samples[selLayout ?? ''] ?? layouts.find((e) => e.id === selLayout) ?? null) : null
  const entry = (selLayout && layoutEdits[selLayout]) || baseLayout // 工作副本（有编辑取编辑）
  const baseCodex = (selCodex && newEntries.find((e) => e.kind === selCodex.kind && e.id === selCodex.id))
    ?? codex?.find((e) => selCodex && e.kind === selCodex.kind && e.id === selCodex.id) ?? null
  const lockRandom = !!entry?.randomized // v54 任务5：纯随机布局——固定编辑只落 random:false 对象

  /** 布局变更统一入口：克隆工作副本 → 变更 → 记入 edits */
  const mutate = useCallback((fn: (e: LayoutEntry) => void) => {
    if (!entry) return
    const copy = JSON.parse(JSON.stringify(entry)) as LayoutEntry
    fn(copy)
    setLayoutEdits((prev) => ({ ...prev, [copy.id]: copy }))
  }, [entry])

  // 切换布局时重置画布交互状态
  const pickLayout = (id: string) => {
    setSelLayout(id); setSelCodex(null)
    setSel(null); setMulti([]); setPlacing(null); setWallMode('off'); setFloor(0); setFocus(null); setHint('')
    const base = samples[id] ?? layouts?.find((e) => e.id === id)
    if (base?.randomized) setSeedText(String(base.seed ?? 424242))
  }
  const pickCodex = (kind: CodexKind, id: string) => { setSelCodex({ kind, id }); setSelLayout(null); setNewEntryForm(null) }

  // v54 任务5：换种子重采样（丢弃该布局未导出的固定编辑——它们针对旧样例）
  const doResample = () => {
    if (!entry) return
    const seed = Number(seedText)
    if (!Number.isFinite(seed)) return
    const fresh = resampleVariant(entry.id, seed)
    if (!fresh) return
    setSamples((prev) => ({ ...prev, [entry.id]: fresh }))
    setLayoutEdits((prev) => { const n = { ...prev }; delete n[entry.id]; return n })
    setSel(null); setHint(`已按种子 ${seed} 重采样（随机对象的坐标调整无效——请改生成率）`)
  }

  // ---------- 画布回调 ----------
  const onMove = (type: SelType, index: number, x: number, y: number) => mutate((e) => {
    const obj =
      type === 'struct' ? e.structures?.[index] : type === 'npc' ? e.npcs?.[index]
        : type === 'entity' ? e.entities?.[index] : type === 'exit' ? e.exits?.[index]
          : type === 'item' ? e.items?.[index] : type === 'light' ? e.lights?.[index]
            : type === 'stair' ? e.stair?.[index] : undefined
    if (!obj) return
    obj.x = x; obj.y = y
    // v54 任务5：随机样例上被移动的固定对象 → onRandomSample 标记（复刻时写进生成器保证必出）
    if (e.randomized) obj.onRandomSample = true
  })
  // v54 任务4：多选整体拖拽（绝对坐标批量落位；随机样例上移动的对象打 onRandomSample）
  const onMoveMulti = (items: { type: SelType; index: number; x: number; y: number }[]) => mutate((e) => {
    for (const it of items) {
      const obj =
        it.type === 'struct' ? e.structures?.[it.index] : it.type === 'npc' ? e.npcs?.[it.index]
          : it.type === 'entity' ? e.entities?.[it.index] : it.type === 'exit' ? e.exits?.[it.index]
            : it.type === 'item' ? e.items?.[it.index] : it.type === 'light' ? e.lights?.[it.index] : undefined
      if (!obj) continue
      obj.x = it.x; obj.y = it.y
      if (e.randomized) obj.onRandomSample = true
    }
  })
  const onZoneRect = (index: number, patch: Partial<ZoneEntry>) => mutate((e) => {
    const z = e.zones?.[index]
    if (!z) return
    Object.assign(z, patch)
    // 点标注锚点跟随矩形中心（HUD 最近点兜底逻辑用）
    if (z.x0 !== undefined) { z.x = (z.x0 + (z.x1 ?? z.x0) + 1) / 2; z.y = ((z.y0 ?? z.y) + (z.y1 ?? z.y0 ?? z.y) + 1) / 2 }
  })
  const onToggleTile = (x: number, y: number) => {
    if (lockRandom) { setHint('随机样例的墙体由生成器决定——不能改瓦片，请调生成率') ; return }
    mutate((e) => {
      const [W, H] = e.size
      if (x < 0 || y < 0 || x >= W || y >= H) return
      const flip = (rows: string[] | undefined): string[] => {
        const r = rows ?? Array.from({ length: H }, () => '.'.repeat(W))
        r[y] = r[y].slice(0, x) + (r[y][x] === '#' ? '.' : '#') + r[y].slice(x + 1)
        return r
      }
      if (floor === 0) {
        const row = e.tiles[y]
        e.tiles[y] = row.slice(0, x) + (row[x] === '#' ? '.' : '#') + row.slice(x + 1)
      } else if (floor === 1) {
        if (wallMode === 'wall') e.upWall = flip(e.upWall)
        else e.up = flip(e.up)
      } else {
        if (wallMode === 'wall') e.upWall2 = flip(e.upWall2)
        else e.up2 = flip(e.up2)
      }
    })
  }
  const onPlace = (x: number, y: number) => {
    if (!placing) return
    // v54 任务5：随机样例允许加固定对象——导出带 onRandomSample 标记（复刻=写进生成器保证必出）
    mutate((e) => {
      const onR = e.randomized ? { onRandomSample: true as const } : {}
      if (placing.type === 'struct') {
        const d = DECOR.get(placing.kind)
        const s: StructEntry = { kind: placing.kind, x, y, w: 1, h: 1, solid: d?.cat === 'solid', ...onR }
        if ((e.floors ?? 1) > 1) s.floor = floor
        ;(e.structures ??= []).push(s)
        if (e.randomized) setHint('已放置并标记 onRandomSample——复刻时写进生成器保证必出')
      } else if (placing.type === 'npc') {
        (e.npcs ??= []).push({
          id: placing.id, x: x + 0.5, y: y + 0.5, floor, ...onR,
          ...(placing.flavor ? { flavor: placing.flavor } : {}),
          ...(placing.newNpc ? { newNpc: placing.newNpc } : {}),
        })
      } else if (placing.type === 'entity') {
        (e.entities ??= []).push({ type: placing.etype, x: x + 0.5, y: y + 0.5, ...onR })
      } else if (placing.type === 'item') {
        (e.items ??= []).push({ type: placing.item, x: x + 0.5, y: y + 0.5, ...onR })
      } else if (placing.type === 'light') {
        (e.lights ??= []).push({ x: x + 0.5, y: y + 0.5, r: 5, color: '#fff2d8', ...onR })
      } else if (placing.type === 'stair') {
        (e.stair ??= []).push({ x, y, dir: placing.dir, lo: placing.lo, hi: placing.hi, ...onR })
      }
    })
    setPlacing(null)
  }

  // Delete 删除选中（多选=批量）；Ctrl+C/V 复制粘贴（+1 格偏移，连续粘贴连续偏移）——输入框聚焦时不拦截
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      // Ctrl+C：复制当前多选（无多选=单选）对象
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'c' || ev.key === 'C')) {
        const targets = multi.length ? multi : sel && sel.type !== 'zone' && sel.type !== 'stair' ? [sel] : []
        if (!entry || !targets.length) return
        clipboard.current = []
        for (const t of targets) {
          const obj =
            t.type === 'struct' ? entry.structures?.[t.index] : t.type === 'npc' ? entry.npcs?.[t.index]
              : t.type === 'entity' ? entry.entities?.[t.index] : t.type === 'item' ? entry.items?.[t.index]
                : t.type === 'light' ? entry.lights?.[t.index] : t.type === 'exit' ? entry.exits?.[t.index] : undefined
          if (obj) clipboard.current.push({ type: t.type, obj: JSON.parse(JSON.stringify(obj)) as Record<string, unknown> })
        }
        if (clipboard.current.length) setHint(`已复制 ${clipboard.current.length} 个对象`)
        ev.preventDefault()
        return
      }
      // Ctrl+V：粘贴（+1 格偏移；随机样例上粘贴的对象按规则带 onRandomSample）
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'v' || ev.key === 'V')) {
        if (!entry || !clipboard.current.length) return
        pasteN.current++
        const off = pasteN.current
        const added: Sel[] = []
        mutate((e) => {
          for (const c of clipboard.current) {
            const obj = JSON.parse(JSON.stringify(c.obj)) as Record<string, unknown> & { x: number; y: number; onRandomSample?: boolean }
            obj.x += off; obj.y += off
            if (e.randomized) obj.onRandomSample = true
            if (c.type === 'struct') { (e.structures ??= []).push(obj as never); added.push({ type: 'struct', index: e.structures!.length - 1 }) }
            if (c.type === 'npc') { (e.npcs ??= []).push(obj as never); added.push({ type: 'npc', index: e.npcs!.length - 1 }) }
            if (c.type === 'entity') { (e.entities ??= []).push(obj as never); added.push({ type: 'entity', index: e.entities!.length - 1 }) }
            if (c.type === 'item') { (e.items ??= []).push(obj as never); added.push({ type: 'item', index: e.items!.length - 1 }) }
            if (c.type === 'light') { (e.lights ??= []).push(obj as never); added.push({ type: 'light', index: e.lights!.length - 1 }) }
            if (c.type === 'exit') { (e.exits ??= []).push(obj as never); added.push({ type: 'exit', index: e.exits!.length - 1 }) }
          }
        })
        setMulti(added); setSel(null)
        setHint(`已粘贴 ${added.length} 个对象（+${off} 格）`)
        ev.preventDefault()
        return
      }
      if (ev.key !== 'Delete') return
      const targets = (multi.length ? multi : sel ? [sel] : []).filter((t) => t.type !== 'zone')
      if (!targets.length) return
      mutate((e) => {
        // v54 任务5：随机样例上删除决定性对象 → 墓碑标记（remove + onRandomSample），样例坐标不可照抄故以标记表达
        const tomb = e.randomized
        let skipped = 0
        // 同类型按 index 降序删（splice 不移位）；随机对象在随机布局中不可删（调生成率表达）
        const byType = new Map<SelType, number[]>()
        for (const t of targets) byType.set(t.type, [...(byType.get(t.type) ?? []), t.index])
        const del = <T extends { remove?: boolean; onRandomSample?: boolean; random?: boolean }>(arr: T[] | undefined, idxs: number[]) => {
          if (!arr) return
          for (const i of idxs.sort((a, b) => b - a)) {
            const o = arr[i]
            if (!o) continue
            if (e.randomized && o.random) { skipped++; continue }
            if (tomb) { o.remove = true; o.onRandomSample = true } else arr.splice(i, 1)
          }
        }
        del(e.structures, byType.get('struct') ?? [])
        del(e.npcs, byType.get('npc') ?? [])
        del(e.entities, byType.get('entity') ?? [])
        del(e.exits, byType.get('exit') ?? [])
        del(e.items, byType.get('item') ?? [])
        del(e.lights, byType.get('light') ?? [])
        del(e.stair, byType.get('stair') ?? [])
        if (skipped) setHint(`${skipped} 个随机生成物不能删除——请把生成率改为 0`)
      })
      setSel(null); setMulti([])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, multi, mutate, lockRandom, entry])

  // ---------- 导出 ----------
  const modifiedLayouts = Object.values(layoutEdits)
  const modifiedCodex = Object.entries(codexEdits)
    .filter(([, f]) => Object.keys(f).length > 0)
    .map(([key, fields]) => {
      const [kind, ...rest] = key.split('|')
      return { kind: kind as CodexKind, id: rest.join('|'), fields }
    })
  modifiedCodex.push(...newEntries) // v54 任务2：新建条目（new:true / generate 模式）整体随 codex 导出
  const modifiedCount = modifiedLayouts.length + modifiedCodex.length
  const doExport = () => {
    const file = buildDesignFile(modifiedLayouts, modifiedCodex)
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `backroom-design-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // ---------- 左栏条目树 ----------
  const q = search.trim().toLowerCase()
  const matchQ = (id: string, name?: string) => !q || id.toLowerCase().includes(q) || (name ?? '').toLowerCase().includes(q)
  const layoutGroups = useMemo(() => {
    const ls = layouts ?? []
    return [
      { label: '据点', items: ls.filter((e) => e.kind === 'outpost') },
      { label: 'L0 变体', items: ls.filter((e) => e.id.startsWith('l0:')) },
      { label: 'L1 区段', items: ls.filter((e) => e.id.startsWith('l1:')) },
      { label: 'L2 廊道变体', items: ls.filter((e) => e.id.startsWith('l2:')) },
      { label: 'L3 变体', items: ls.filter((e) => e.id.startsWith('l3:')) },
      { label: '预制件', items: ls.filter((e) => e.kind === 'prefab') },
    ]
  }, [layouts])

  // ---------- 渲染 ----------
  if (!layouts || !codex) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--text-dim)' }}>
        <div className="font-mono2 text-[13px]">正在提取布局与图鉴数据…</div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      {/* 顶栏 */}
      <div className="flex shrink-0 items-center gap-3 border-b px-3 py-2" style={{ borderColor: 'var(--panel-edge)', background: 'var(--panel)' }}>
        <button className="font-mono2 text-[12px]" style={btnSt} onClick={onBack}>← 返回标题</button>
        <span className="font-title text-[16px]" style={{ color: 'var(--amber)' }}>设计模式</span>
        <span className="font-mono2 text-[11px]" style={{ color: 'var(--blood)' }}>未生效——导出 JSON 交给 Agent 复刻</span>
        <div className="flex-1" />
        <span className="font-mono2 text-[11px]" style={{ color: 'var(--text-dim)' }}>已修改 {modifiedCount} 项</span>
        <button
          className="font-mono2 text-[12px]"
          style={{ ...btnSt, color: modifiedCount ? 'var(--amber)' : 'var(--text-dim)', opacity: modifiedCount ? 1 : 0.45 }}
          disabled={!modifiedCount}
          onClick={doExport}
        >
          导出 JSON
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 左栏：条目树 */}
        <div className="flex w-[240px] shrink-0 flex-col border-r" style={{ borderColor: 'var(--panel-edge)', background: 'var(--panel)' }}>
          <div className="border-b p-2" style={{ borderColor: 'var(--panel-edge)' }}>
            <input
              className="font-mono2 w-full text-[12px] outline-none"
              style={inputSt}
              placeholder="搜索 id / 名称…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {layoutGroups.map((g) => {
              const items = g.items.filter((e) => matchQ(e.id, e.name))
              if (!items.length) return null
              return (
                <div key={g.label} className="mb-1">
                  <div className="font-mono2 px-2 py-1 text-[10px]" style={{ color: 'var(--text-dim)' }}>{g.label}（{items.length}）</div>
                  {items.map((e) => (
                    <button
                      key={e.id}
                      className="font-mono2 block w-full truncate px-2 py-0.5 text-left text-[12px]"
                      style={{
                        color: selLayout === e.id ? 'var(--amber)' : 'var(--text)',
                        background: selLayout === e.id ? 'rgba(200,160,58,0.12)' : undefined,
                      }}
                      onClick={() => pickLayout(e.id)}
                    >
                      {layoutEdits[e.id] ? <span style={{ color: 'var(--blood)' }}>● </span> : null}
                      {e.name} <span style={{ color: 'var(--text-dim)' }}>{e.id}</span>
                    </button>
                  ))}
                </div>
              )
            })}
            {CODEX_GROUPS.map((g) => {
              const items = [
                ...newEntries.filter((e) => e.kind === g.kind),
                ...codex.filter((e) => e.kind === g.kind),
              ].filter((e) => matchQ(e.id, String(e.fields.name ?? e.fields.title ?? '')))
              if (!items.length) return null
              return (
                <div key={g.kind} className="mb-1">
                  <div className="font-mono2 flex items-center justify-between px-2 py-1 text-[10px]" style={{ borderTop: '1px solid var(--panel-edge)', color: 'var(--text-dim)' }}>
                    <span>图鉴 · {g.label}（{items.length}）</span>
                    <button className="font-mono2 text-[10px]" style={{ color: 'var(--amber)' }}
                      onClick={() => { setNewEntryForm(g.kind); setSelCodex(null); setSelLayout(null) }}>+ 新建</button>
                  </div>
                  {items.map((e) => {
                    const key = `${e.kind}|${e.id}`
                    const edited = Object.keys(codexEdits[key] ?? {}).length > 0
                    const active = selCodex?.kind === e.kind && selCodex?.id === e.id
                    return (
                      <button
                        key={e.id}
                        className="font-mono2 block w-full truncate px-2 py-0.5 text-left text-[12px]"
                        style={{ color: active ? 'var(--amber)' : 'var(--text)', background: active ? 'rgba(200,160,58,0.12)' : undefined }}
                        onClick={() => pickCodex(e.kind, e.id)}
                      >
                        {e.new ? <span style={{ color: 'var(--amber)' }}>新 </span> : edited ? <span style={{ color: 'var(--blood)' }}>● </span> : null}
                        {String(e.fields.name ?? e.fields.title ?? e.id)} <span style={{ color: 'var(--text-dim)' }}>{e.id}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {/* 中栏 */}
        <div className="flex min-w-0 flex-1 flex-col">
          {entry ? (
            <>
              {/* 楼层切换 + 编辑模式开关 + 随机样例重采样 */}
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-2 py-1" style={{ borderColor: 'var(--panel-edge)' }}>
                {(entry.floors ?? 1) > 1 && [0, 1, 2].slice(0, entry.floors).map((f) => (
                  <button key={f} className="font-mono2 text-[11px]"
                    style={{ ...btnSt, color: floor === f ? 'var(--amber)' : 'var(--text-dim)', borderColor: floor === f ? 'var(--amber)' : 'var(--panel-edge)' }}
                    onClick={() => { setFloor(f); setSel(null) }}>
                    {f + 1}F
                  </button>
                ))}
                {!entry.randomized && (
                  <button className="font-mono2 text-[11px]"
                    style={{ ...btnSt, color: wallMode !== 'off' ? 'var(--amber)' : 'var(--text-dim)' }}
                    onClick={() => setWallMode(wallMode === 'off' ? 'wall' : 'off')}>
                    {wallMode !== 'off' ? '退出墙壁编辑' : '墙壁编辑'}
                  </button>
                )}
                {wallMode !== 'off' && floor > 0 && (
                  <>
                    <button className="font-mono2 text-[11px]" style={{ ...btnSt, color: wallMode === 'wall' ? 'var(--amber)' : 'var(--text-dim)' }} onClick={() => setWallMode('wall')}>墙</button>
                    <button className="font-mono2 text-[11px]" style={{ ...btnSt, color: wallMode === 'floor' ? 'var(--amber)' : 'var(--text-dim)' }} onClick={() => setWallMode('floor')}>楼板</button>
                  </>
                )}
                {entry.randomized && (
                  <>
                    <span className="font-mono2 text-[11px]" style={{ color: 'var(--amber)' }}>随机样例（种子</span>
                    <input className="font-mono2 w-20 text-[11px] outline-none" style={inputSt} value={seedText}
                      placeholder="种子" onChange={(e) => setSeedText(e.target.value)} />
                    <button className="font-mono2 text-[11px]" style={{ ...btnSt, color: 'var(--amber)' }} onClick={doResample}>重采样</button>
                    <span className="font-mono2 text-[11px]" style={{ color: 'var(--amber)' }}>）</span>
                  </>
                )}
                <span className="font-mono2 text-[10px]" style={{ color: 'var(--text-dim)' }}>
                  {entry.name} · {entry.size[0]}×{entry.size[1]} · 拖拽平移 / 滚轮缩放 / 点选对象
                </span>
                {hint && <span className="font-mono2 text-[10px]" style={{ color: 'var(--blood)' }}>{hint}</span>}
              </div>
              <div className="min-h-0 flex-1">
                <LayoutCanvas
                  entry={entry}
                  floor={floor}
                  sel={sel}
                  multi={multi}
                  onMulti={setMulti}
                  onMoveMulti={onMoveMulti}
                  placing={placing}
                  wallMode={wallMode}
                  lockRandom={lockRandom}
                  focus={focus}
                  onSelect={(s2, cands) => {
                    setSel(s2)
                    if (s2 && cands && cands.length > 1) {
                      const idx = cands.findIndex((c) => c.type === s2.type && c.index === s2.index)
                      setCycle({ pos: idx + 1, total: cands.length })
                    } else setCycle(null)
                  }}
                  onMove={onMove}
                  onZoneRect={onZoneRect}
                  onToggleTile={onToggleTile}
                  onPlace={onPlace}
                />
              </div>
            </>
          ) : newEntryForm ? (
            <NewEntryForm
              kind={newEntryForm}
              onCancel={() => setNewEntryForm(null)}
              onCreate={(ne) => {
                setNewEntries((prev) => [...prev, ne])
                setNewEntryForm(null)
                setSelCodex({ kind: ne.kind, id: ne.id })
              }}
            />
          ) : baseCodex ? (
            <>
              {baseCodex.new && (
                <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1" style={{ borderColor: 'var(--panel-edge)' }}>
                  <span className="font-mono2 text-[11px]" style={{ color: 'var(--amber)' }}>
                    新建条目 · {baseCodex.generate === 'auto' ? 'Agent 自动生成' : baseCodex.generate === 'fromDescription' ? 'Agent 依描述生成' : '玩家自定义'}
                  </span>
                  <div className="flex-1" />
                  <button className="font-mono2 text-[10px]" style={{ ...btnSt, color: 'var(--blood)' }}
                    onClick={() => { setNewEntries((prev) => prev.filter((e) => e !== baseCodex)); setSelCodex(null) }}>删除该新条目</button>
                </div>
              )}
              <CodexEditor
                entry={baseCodex}
                edits={baseCodex.new ? {} : codexEdits[`${baseCodex.kind}|${baseCodex.id}`] ?? {}}
                onEdit={baseCodex.new
                  ? (k, v) => setNewEntries((prev) => prev.map((e) => {
                      if (e !== baseCodex) return e
                      const fields = { ...e.fields }
                      if (v === null) delete fields[k]; else fields[k] = v
                      return { ...e, fields }
                    }))
                  : (k, v) => setCodexEdits((prev) => {
                      const key = `${baseCodex.kind}|${baseCodex.id}`
                      const cur = { ...(prev[key] ?? {}) }
                      // v===null 或改回原文 = 撤销该字段的修改标记
                      if (v === null || String(baseCodex.fields[k] ?? '') === String(v)) delete cur[k]
                      else cur[k] = v
                      return { ...prev, [key]: cur }
                    })}
              />
            </>
          ) : (
            <div className="font-mono2 flex h-full items-center justify-center text-[12px]" style={{ color: 'var(--text-dim)' }}>
              ← 从左栏选择布局或图鉴条目
            </div>
          )}
        </div>

        {/* 右栏：属性面板 */}
        {entry && (
          <div className="w-[300px] shrink-0 overflow-y-auto border-l p-2" style={{ borderColor: 'var(--panel-edge)', background: 'var(--panel)' }}>
            <LayoutPanel
              entry={entry}
              floor={floor}
              sel={sel}
              edited={!!layoutEdits[entry.id]}
              lockRandom={lockRandom}
              placing={placing}
              addKind={addKind} setAddKind={setAddKind}
              addNpc={addNpc} setAddNpc={setAddNpc}
              addEnt={addEnt} setAddEnt={setAddEnt}
              addItem={addItem} setAddItem={setAddItem}
              newNpcForm={newNpcForm} setNewNpcForm={setNewNpcForm}
              stairForm={stairForm} setStairForm={setStairForm}
              cycle={cycle}
              multi={multi}
              onSelect={(s, fx, fy) => { setSel(s); if (fx !== undefined && fy !== undefined) setFocus({ x: fx, y: fy, n: (focus?.n ?? 0) + 1 }) }}
              onPlacing={setPlacing}
              onMutate={mutate}
              onRevert={() => setLayoutEdits((prev) => { const n = { ...prev }; delete n[entry.id]; return n })}
              onClearSel={() => setSel(null)}
              onHint={setHint}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================ 图鉴字段编辑器 ============================================================
// 评分字段（cecs.*/scores.*/iots.*）不走通用文本域：entity 内嵌 CECS 区（CecsBox 预览 + 形态下拉/性质 chips/威胁）、
// level 内嵌层级三维评分（LevelClassBanner 预览 + 0-5 数字）、item 内嵌 IOTS 三栏（彩色预览 + 标准词下拉）。
const SCORE_KEY = /^(cecs|scores|iots)\./ // 评分字段键（通用文本域跳过，走专用编辑区）

function CodexEditor({ entry, edits, onEdit }: {
  entry: CodexEntry
  edits: Record<string, string | number>
  onEdit: (key: string, value: string | number | null) => void // null=撤销该字段修改
}) {
  const val = (k: string) => (k in edits ? edits[k] : entry.fields[k])
  const dirty = (k: string) => k in edits
  // 0-5 评分数字输入
  const num05 = (k: string, label: string) => (
    <label key={k} className="font-mono2 mb-1 flex items-center gap-2 text-[12px]" style={{ color: dirty(k) ? 'var(--blood)' : 'var(--text-dim)' }}>
      <span className="w-28">{label}{dirty(k) ? '（已修改）' : ''}</span>
      <input type="number" min={0} max={5} step={1} className="w-16 outline-none" style={inputSt}
        value={Number(val(k) ?? 0)}
        onChange={(e) => {
          const n = Math.max(0, Math.min(5, Math.round(Number(e.target.value) || 0)))
          onEdit(k, n === Number(entry.fields[k] ?? 0) ? null : n)
        }} />
      <span className="text-[10px]">0~5</span>
    </label>
  )
  // 标准词下拉
  const sel = (k: string, label: string, options: readonly string[], labelOf?: (v: string) => string) => (
    <label key={k} className="font-mono2 mb-1 flex items-center gap-2 text-[12px]" style={{ color: dirty(k) ? 'var(--blood)' : 'var(--text-dim)' }}>
      <span className="w-28">{label}{dirty(k) ? '（已修改）' : ''}</span>
      <select className="outline-none" style={inputSt} value={String(val(k) ?? '')}
        onChange={(e) => onEdit(k, e.target.value === String(entry.fields[k] ?? '') ? null : e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{labelOf ? labelOf(o) : o}</option>)}
      </select>
    </label>
  )

  // ---- entity：CECS 区（预览=原图鉴 CecsBox，编辑值实时生效）----
  const renderCecs = () => {
    const props0 = Object.keys(entry.fields)
      .filter((k) => /^cecs\.props\.\d+$/.test(k))
      .sort((a, b) => Number(a.split('.')[2]) - Number(b.split('.')[2]))
      .map((k) => String(entry.fields[k]))
    const curProps = 'cecs.props' in edits ? String(edits['cecs.props']).split(',').filter(Boolean) : props0
    const cls = String(val('cecs.class') ?? 'Enigmatic')
    const intel = String(val('cecs.intel') ?? 'C')
    const threat = Number(val('cecs.threat') ?? 0)
    return (
      <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--panel-edge)' }}>
        <div className="font-mono2 mb-1 text-[10px]" style={{ color: 'var(--text-dim)' }}>CECS 统合实体分类（预览与原图鉴一致，编辑实时生效）</div>
        <CecsBox
          entityType={entry.id}
          no={String(val('codex.no') ?? '')}
          habitat={String(val('codex.habitat') ?? '')}
          danger={threat}
          override={{ class: cls, intel, props: curProps }}
        />
        {sel('cecs.class', '形态 cecs.class', Object.keys(CECS_CLASS_INFO), (v) => `${v}（${CECS_CLASS_INFO[v]?.zh ?? v}）`)}
        {sel('cecs.intel', '智能 cecs.intel', ['A', 'B', 'C', 'C-', 'D', 'E'])}
        {num05('cecs.threat', '威胁 cecs.threat')}
        <div className="font-mono2 mb-1 mt-2 text-[11px]" style={{ color: dirty('cecs.props') ? 'var(--blood)' : 'var(--text-dim)' }}>
          性质 cecs.props{dirty('cecs.props') ? '（已修改）' : ''}（点击切换，整组替换）
        </div>
        <div className="flex flex-wrap gap-1">
          {CECS_ORDER.map((c) => {
            const on = curProps.includes(c)
            const hazard = CECS_HAZARD.has(c)
            return (
              <button key={c} className="font-mono2 border px-1.5 py-0.5 text-[10px]"
                title={CECS_NAMES[c] ?? c}
                style={on
                  ? hazard
                    ? { borderColor: 'var(--blood)', color: 'var(--blood)', background: 'color-mix(in srgb, var(--blood) 12%, transparent)' }
                    : { borderColor: 'var(--amber)', color: 'var(--amber)', background: 'color-mix(in srgb, var(--amber) 12%, transparent)' }
                  : { borderColor: 'var(--panel-edge)', color: 'var(--text-dim)', opacity: 0.45 }}
                onClick={() => {
                  const next = on ? curProps.filter((x) => x !== c) : [...curProps, c]
                  onEdit('cecs.props', next.join(',') === props0.join(',') ? null : next.join(','))
                }}>
                {c}
              </button>
            )
          })}
        </div>
      </div>
    )
  }
  // ---- level：层级三维评分（预览=原图鉴 LevelClassBanner）----
  const renderScores = () => {
    const sc: LevelScores = {
      ext: Number(val('scores.ext') ?? 0), env: Number(val('scores.env') ?? 0), ent: Number(val('scores.ent') ?? 0),
      ...(val('scores.cls') !== undefined && String(val('scores.cls')) !== '' ? { cls: String(val('scores.cls')) } : {}),
    }
    return (
      <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--panel-edge)' }}>
        <div className="font-mono2 mb-1 text-[10px]" style={{ color: 'var(--text-dim)' }}>层级生存难度（预览与原图鉴一致，编辑实时生效）</div>
        <LevelClassBanner levelNo={Number(entry.id)} override={sc} />
        {num05('scores.ext', '逃离 scores.ext')}
        {num05('scores.env', '环境 scores.env')}
        {num05('scores.ent', '实体 scores.ent')}
        <label className="font-mono2 mb-1 flex items-center gap-2 text-[12px]" style={{ color: dirty('scores.cls') ? 'var(--blood)' : 'var(--text-dim)' }}>
          <span className="w-28">等级覆盖 scores.cls{dirty('scores.cls') ? '（已修改）' : ''}</span>
          <input className="w-32 outline-none" style={inputSt} value={String(val('scores.cls') ?? '')} placeholder="缺省=三维平均"
            onChange={(e) => onEdit('scores.cls', e.target.value === String(entry.fields['scores.cls'] ?? '') ? null : e.target.value)} />
        </label>
      </div>
    )
  }
  // ---- item：IOTS 三栏（彩色预览 + 标准词下拉）----
  const renderIots = () => {
    const freq = String(val('iots.frequency') ?? '未知')
    const util = String(val('iots.utility') ?? '未知')
    const orig = String(val('iots.origin') ?? '未知')
    return (
      <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--panel-edge)' }}>
        <div className="font-mono2 mb-1 text-[10px]" style={{ color: 'var(--text-dim)' }}>IOTS 统合物品分类（编辑实时生效）</div>
        <div className="hud-panel mb-2 p-3 text-[12px]">
          <div className="flex gap-2"><span className="font-mono2 w-16 shrink-0" style={{ color: 'var(--text-dim)' }}>罕见度</span><span style={{ color: IOTS_FREQ_COLORS[freq] ?? 'var(--text)' }}>{freq}</span></div>
          <div className="flex gap-2"><span className="font-mono2 w-16 shrink-0" style={{ color: 'var(--text-dim)' }}>实用性</span><span style={{ color: 'var(--text)' }}>{util}</span></div>
          <div className="flex gap-2"><span className="font-mono2 w-16 shrink-0" style={{ color: 'var(--text-dim)' }}>产地</span><span style={{ color: 'var(--text)' }}>{orig}</span></div>
        </div>
        {sel('iots.frequency', '罕见度 iots.frequency', IOTS_FREQ_VALUES)}
        {sel('iots.utility', '实用性 iots.utility', IOTS_UTIL_VALUES)}
        {sel('iots.origin', '产地 iots.origin', IOTS_ORIGIN_VALUES)}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-title text-[18px]" style={{ color: 'var(--amber)' }}>{String(entry.fields.name ?? entry.fields.title ?? entry.id)}</span>
        <span className="font-mono2 text-[11px]" style={{ color: 'var(--text-dim)' }}>{entry.kind}:{entry.id}</span>
        {entry.new && <span className="font-mono2 text-[11px]" style={{ color: 'var(--amber)' }}>新建条目{entry.generate ? `（${entry.generate === 'auto' ? 'Agent 自动生成' : 'Agent 依描述生成'}）` : '（玩家自定义）'}</span>}
        {Object.keys(edits).length > 0 && <span className="font-mono2 text-[11px]" style={{ color: 'var(--blood)' }}>已修改 {Object.keys(edits).length} 字段</span>}
      </div>
      {Object.entries(entry.fields).filter(([k]) => !SCORE_KEY.test(k)).map(([k, v]) => {
        const editedF = k in edits
        const cur = editedF ? String(edits[k]) : String(v)
        return (
          <div key={k} className="mb-2">
            <div className="font-mono2 mb-0.5 text-[10px]" style={{ color: editedF ? 'var(--blood)' : 'var(--text-dim)' }}>
              {k}{editedF ? '（已修改）' : ''}
            </div>
            <textarea
              className="font-mono2 w-full resize-y text-[12px] outline-none"
              style={{ ...inputSt, minHeight: String(v).length > 60 ? 64 : 28, borderColor: editedF ? 'var(--blood)' : 'var(--panel-edge)' }}
              value={cur}
              rows={Math.min(10, Math.max(1, Math.ceil(String(v).length / 60)))}
              onChange={(e) => onEdit(k, e.target.value)}
            />
          </div>
        )
      })}
      {entry.kind === 'entity' && renderCecs()}
      {entry.kind === 'level' && renderScores()}
      {entry.kind === 'item' && renderIots()}
    </div>
  )
}

// ============================================================ 布局属性面板 ============================================================
function LayoutPanel(props: {
  entry: LayoutEntry
  floor: number
  sel: Sel | null
  edited: boolean
  lockRandom: boolean
  placing: Placing
  addKind: string; setAddKind: (v: string) => void
  addNpc: string; setAddNpc: (v: string) => void
  addEnt: string; setAddEnt: (v: string) => void
  addItem: string; setAddItem: (v: string) => void
  newNpcForm: { name: string; role: string; desc: string }; setNewNpcForm: (v: { name: string; role: string; desc: string }) => void
  stairForm: { dir: number; lo: number; hi: number }; setStairForm: (v: { dir: number; lo: number; hi: number }) => void
  cycle: { pos: number; total: number } | null
  multi: Sel[] // v54 任务4：多选集合（>1 时隐藏单对象编辑器）
  onSelect: (s: Sel | null, fx?: number, fy?: number) => void
  onPlacing: (p: Placing) => void
  onMutate: (fn: (e: LayoutEntry) => void) => void
  onRevert: () => void
  onClearSel: () => void
  onHint: (s: string) => void
}) {
  const { entry, floor, sel, edited, lockRandom, placing, onSelect, onPlacing, onMutate } = props
  const num = (v: string, fallback: number) => { const n = Number(v); return Number.isFinite(n) ? n : fallback }

  // 选中对象
  const selStruct = sel?.type === 'struct' ? entry.structures?.[sel.index] : undefined
  const selNpc = sel?.type === 'npc' ? entry.npcs?.[sel.index] : undefined
  const selEnt = sel?.type === 'entity' ? entry.entities?.[sel.index] : undefined
  const selExit = sel?.type === 'exit' ? entry.exits?.[sel.index] : undefined
  const selItem = sel?.type === 'item' ? entry.items?.[sel.index] : undefined
  const selLight = sel?.type === 'light' ? entry.lights?.[sel.index] : undefined
  const selZone = sel?.type === 'zone' ? entry.zones?.[sel.index] : undefined
  const selStair = sel?.type === 'stair' ? entry.stair?.[sel.index] : undefined
  // 随机对象（randomized 布局中固定编辑禁用，仅可调生成率）
  const selRandom = lockRandom && !!(selStruct?.random || selEnt?.random || selItem?.random || selNpc?.random)
  // 选中对象带 chance（随机生成率可直接编辑）
  const selChanceObj = selStruct?.random ? selStruct : selEnt?.random ? selEnt : selItem?.random ? selItem : undefined

  // data 文本域本地状态（随选中结构切换重置）
  const [dataText, setDataText] = useState('')
  const [dataErr, setDataErr] = useState('')
  const selKey = sel ? `${sel.type}:${sel.index}` : ''
  useEffect(() => {
    setDataText(selStruct?.data ? JSON.stringify(selStruct.data, null, 2) : '{}')
    setDataErr('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey])

  /** v54 任务5：删除对象——随机样例上删除决定性对象落墓碑标记（remove + onRandomSample） */
  const delObj = (arr: 'structures' | 'npcs' | 'entities' | 'items' | 'lights' | 'exits' | 'stair', i: number) => {
    onMutate((m) => {
      const a = m[arr] as { remove?: boolean; onRandomSample?: boolean }[] | undefined
      const o = a?.[i]
      if (!o) return
      if (m.randomized) { o.remove = true; o.onRandomSample = true }
      else a!.splice(i, 1)
    })
    props.onClearSel()
  }

  const sec = (title: string) => (
    <div className="font-mono2 mb-1 mt-3 border-t pt-2 text-[10px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--text-dim)' }}>{title}</div>
  )
  const numInput = (label: string, v: number, fn: (n: number) => void, step = 1, disabled = false) => (
    <label className="font-mono2 mb-1 flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
      <span className="w-8">{label}</span>
      <input type="number" className="w-20 outline-none" style={{ ...inputSt, opacity: disabled ? 0.45 : 1 }} value={v} step={step} disabled={disabled}
        onChange={(e) => fn(num(e.target.value, v))} />
    </label>
  )

  return (
    <div>
      {/* 布局信息 */}
      <div className="flex items-baseline justify-between">
        <span className="font-title text-[15px]" style={{ color: 'var(--amber)' }}>{entry.name}</span>
        {edited && (
          <button className="font-mono2 text-[10px]" style={{ ...btnSt, color: 'var(--blood)' }} onClick={props.onRevert}>放弃修改</button>
        )}
      </div>
      <div className="font-mono2 text-[10px]" style={{ color: 'var(--text-dim)' }}>
        {entry.kind}:{entry.id} · L{entry.level} · {entry.size[0]}×{entry.size[1]} · {entry.floors ?? 1} 层
        {entry.randomized ? <span style={{ color: 'var(--amber)' }}> · 随机样例（种子 {entry.seed}）</span> : null}
        {edited ? <span style={{ color: 'var(--blood)' }}> · 已修改</span> : null}
      </div>
      {lockRandom && (
        <div className="font-mono2 mt-1 text-[10px]" style={{ color: 'var(--text-dim)' }}>
          纯随机布局：新增/修改的固定对象带 onRandomSample 标记（复刻=写进生成器保证必出）；「随」对象只调生成率
        </div>
      )}
      {props.cycle && (
        <div className="font-mono2 mt-1 text-[10px]" style={{ color: 'var(--amber)' }}>
          同位对象 {props.cycle.pos}/{props.cycle.total}（再点同一位置切换到下一个）
        </div>
      )}
      {props.multi.length > 1 && (
        <div className="font-mono2 mt-1 border p-1 text-[10px]" style={{ borderColor: 'var(--amber)', color: 'var(--amber)' }}>
          多选 {props.multi.length} 个对象 · Shift+点选加选/减选 · 框选 · 整体拖拽 · Ctrl+C 复制 / Ctrl+V 粘贴(+1 格) / Delete 批量删除
        </div>
      )}
      {/* v54 任务5：自定义修改要求（自由文本，随导出条目携带） */}
      <textarea
        className="font-mono2 mt-1 w-full resize-y text-[11px] outline-none"
        style={{ ...inputSt, minHeight: 30 }}
        placeholder="自定义修改要求（customNote，如「圣所大门改成双开」）"
        value={entry.customNote ?? ''}
        onChange={(e) => onMutate((m) => { if (e.target.value) m.customNote = e.target.value; else delete m.customNote })}
      />

      {/* 选中对象属性（多选 >1 时隐藏） */}
      {props.multi.length > 1 ? null : (<>
      {selRandom && <div className="font-mono2 mt-1 text-[10px]" style={{ color: 'var(--blood)' }}>随机生成物——坐标锁定，只能调生成率</div>}
      {selStruct && sel && (
        <>
          {sec(`结构 #${sel.index} — ${structName(selStruct.kind)}${selStruct.random ? '（随）' : ''}`)}
          {numInput('x', selStruct.x, (n) => onMutate((e) => { e.structures![sel.index].x = Math.round(n) }), 1, selRandom)}
          {numInput('y', selStruct.y, (n) => onMutate((e) => { e.structures![sel.index].y = Math.round(n) }), 1, selRandom)}
          {numInput('w', selStruct.w, (n) => onMutate((e) => { e.structures![sel.index].w = Math.max(1, Math.round(n)) }), 1, selRandom)}
          {numInput('h', selStruct.h, (n) => onMutate((e) => { e.structures![sel.index].h = Math.max(1, Math.round(n)) }), 1, selRandom)}
          <div className="font-mono2 mb-1 flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
            <span className="w-8">deg</span>
            <input type="number" className="w-16 outline-none" style={{ ...inputSt, opacity: selRandom ? 0.45 : 1 }} value={selStruct.deg ?? ''} placeholder="—" disabled={selRandom}
              onChange={(e) => onMutate((m) => { const s = m.structures![sel.index]; if (e.target.value === '') delete s.deg; else s.deg = num(e.target.value, 0) })} />
            {[0, 90, 180, 270].map((d) => (
              <button key={d} className="font-mono2 text-[10px]" style={{ ...btnSt, opacity: selRandom ? 0.45 : 1 }} disabled={selRandom}
                onClick={() => onMutate((m) => { m.structures![sel.index].deg = d })}>{d}°</button>
            ))}
          </div>
          <label className="font-mono2 mb-1 flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
            <input type="checkbox" checked={selStruct.solid} disabled={selRandom}
              onChange={(e) => onMutate((m) => { m.structures![sel.index].solid = e.target.checked })} />
            实心（碰撞）
          </label>
          {(entry.floors ?? 1) > 1 && (
            <label className="font-mono2 mb-1 flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
              <span className="w-8">楼层</span>
              <select className="outline-none" style={inputSt} value={selStruct.floor ?? 0} disabled={selRandom}
                onChange={(e) => onMutate((m) => { m.structures![sel.index].floor = Number(e.target.value) })}>
                {[0, 1, 2].slice(0, entry.floors).map((f) => <option key={f} value={f}>{f + 1}F</option>)}
              </select>
            </label>
          )}
          <div className="font-mono2 mb-0.5 text-[10px]" style={{ color: 'var(--text-dim)' }}>data（JSON）</div>
          <textarea
            className="font-mono2 h-24 w-full resize-y text-[11px] outline-none"
            style={{ ...inputSt, borderColor: dataErr ? 'var(--blood)' : 'var(--panel-edge)', opacity: selRandom ? 0.45 : 1 }}
            value={dataText}
            disabled={selRandom}
            onChange={(e) => setDataText(e.target.value)}
            spellCheck={false}
          />
          {dataErr && <div className="font-mono2 text-[10px]" style={{ color: 'var(--blood)' }}>{dataErr}</div>}
          <div className="mt-1 flex gap-1">
            <button className="font-mono2 text-[10px]" style={{ ...btnSt, opacity: selRandom ? 0.45 : 1 }} disabled={selRandom} onClick={() => {
              try {
                const d = JSON.parse(dataText || '{}') as StructEntry['data']
                onMutate((m) => { const s = m.structures![sel.index]; delete s.data; if (d && Object.keys(d).length) s.data = d })
                setDataErr('')
              } catch (err) { setDataErr(`JSON 解析失败：${(err as Error).message}`) }
            }}>应用 data</button>
            <button className="font-mono2 text-[10px]" style={{ ...btnSt, color: 'var(--blood)', opacity: selRandom ? 0.45 : 1 }} disabled={selRandom}
              onClick={() => delObj('structures', sel.index)}>删除</button>
          </div>
        </>
      )}
      {selNpc && sel && (
        <>
          {sec(`NPC #${sel.index} — ${npcName(selNpc)}`)}
          {selNpc.id === 'random' && (
            <label className="font-mono2 mb-1 flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
              <span className="w-12">池风味</span>
              <select className="outline-none" style={inputSt} value={selNpc.flavor ?? 'meg'}
                onChange={(e) => onMutate((m) => { m.npcs![sel.index].flavor = e.target.value })}>
                {NPC_FLAVORS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
          )}
          {selNpc.newNpc && (
            <>
              {(['name', 'role', 'desc'] as const).map((k) => (
                <label key={k} className="font-mono2 mb-1 flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
                  <span className="w-12">{k === 'name' ? '姓名' : k === 'role' ? '职业' : '描述'}</span>
                  <input className="min-w-0 flex-1 outline-none" style={inputSt} value={selNpc.newNpc![k]}
                    onChange={(e) => onMutate((m) => {
                      const n = m.npcs![sel.index]
                      n.newNpc = { ...n.newNpc!, [k]: e.target.value }
                      if (k === 'name') n.id = `new:${e.target.value}`
                    })} />
                </label>
              ))}
            </>
          )}
          {numInput('x', selNpc.x, (n) => onMutate((e) => { e.npcs![sel.index].x = n }), 0.5, selRandom)}
          {numInput('y', selNpc.y, (n) => onMutate((e) => { e.npcs![sel.index].y = n }), 0.5, selRandom)}
          {(entry.floors ?? 1) > 1 && numInput('层', selNpc.floor, (n) => onMutate((e) => { e.npcs![sel.index].floor = Math.max(0, Math.min((entry.floors ?? 1) - 1, Math.round(n))) }), 1, selRandom)}
          <button className="font-mono2 mt-1 text-[10px]" style={{ ...btnSt, color: 'var(--blood)', opacity: selRandom ? 0.45 : 1 }} disabled={selRandom}
            onClick={() => delObj('npcs', sel.index)}>删除</button>
        </>
      )}
      {selEnt && sel && (
        <>
          {sec(`实体 #${sel.index} — ${ENTITIES[selEnt.type]?.name ?? selEnt.type}${selEnt.random ? '（随）' : ''}`)}
          {numInput('x', selEnt.x, (n) => onMutate((e) => { e.entities![sel.index].x = n }), 0.5, selRandom)}
          {numInput('y', selEnt.y, (n) => onMutate((e) => { e.entities![sel.index].y = n }), 0.5, selRandom)}
          {selEnt.marks && <div className="font-mono2 text-[10px]" style={{ color: 'var(--text-dim)' }}>marks: {JSON.stringify(selEnt.marks)}</div>}
          <button className="font-mono2 mt-1 text-[10px]" style={{ ...btnSt, color: 'var(--blood)', opacity: selRandom ? 0.45 : 1 }} disabled={selRandom}
            onClick={() => delObj('entities', sel.index)}>删除</button>
        </>
      )}
      {selItem && sel && (
        <>
          {sec(`物品 #${sel.index} — ${ITEMS[selItem.type]?.name ?? selItem.type}${selItem.random ? '（随）' : ''}`)}
          {numInput('x', selItem.x, (n) => onMutate((e) => { e.items![sel.index].x = n }), 0.5, selRandom)}
          {numInput('y', selItem.y, (n) => onMutate((e) => { e.items![sel.index].y = n }), 0.5, selRandom)}
          <button className="font-mono2 mt-1 text-[10px]" style={{ ...btnSt, color: 'var(--blood)', opacity: selRandom ? 0.45 : 1 }} disabled={selRandom}
            onClick={() => delObj('items', sel.index)}>删除</button>
        </>
      )}
      {selLight && sel && (
        <>
          {sec(`灯 #${sel.index}`)}
          {numInput('x', selLight.x, (n) => onMutate((e) => { e.lights![sel.index].x = n }), 0.5)}
          {numInput('y', selLight.y, (n) => onMutate((e) => { e.lights![sel.index].y = n }), 0.5)}
          {numInput('r', selLight.r, (n) => onMutate((e) => { e.lights![sel.index].r = Math.max(0.5, n) }), 0.5)}
          <label className="font-mono2 mb-1 flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
            <span className="w-8">颜色</span>
            <input type="color" value={selLight.color} style={{ width: 40, height: 22, border: '1px solid var(--panel-edge)', background: 'var(--panel)' }}
              onChange={(e) => onMutate((m) => { m.lights![sel.index].color = e.target.value })} />
            <span>{selLight.color}</span>
          </label>
          <button className="font-mono2 mt-1 text-[10px]" style={{ ...btnSt, color: 'var(--blood)' }}
            onClick={() => delObj('lights', sel.index)}>删除</button>
        </>
      )}
      {selExit && sel && (
        <>
          {sec(`出口 #${sel.index} — ${selExit.kind}`)}
          <label className="font-mono2 mb-1 flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
            <span className="w-8">名称</span>
            <input className="w-36 outline-none" style={inputSt} value={selExit.name}
              onChange={(e) => onMutate((m) => { m.exits![sel.index].name = e.target.value })} />
          </label>
          <label className="font-mono2 mb-1 flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
            <span className="w-8">dest</span>
            <input className="w-24 outline-none" style={inputSt} value={String(selExit.dest)}
              onChange={(e) => onMutate((m) => {
                const v = e.target.value
                m.exits![sel.index].dest = v === 'random' || v === 'win' || v === 'back' ? v : Number.isFinite(Number(v)) ? Number(v) : m.exits![sel.index].dest
              })} />
          </label>
          {numInput('x', selExit.x, (n) => onMutate((e) => { e.exits![sel.index].x = Math.round(n) }))}
          {numInput('y', selExit.y, (n) => onMutate((e) => { e.exits![sel.index].y = Math.round(n) }))}
        </>
      )}
      {selStair && sel && (
        <>
          {sec(`楼梯 #${sel.index}（坡向${STAIR_DIR_LABEL[selStair.dir] ?? selStair.dir}）`)}
          {numInput('x', selStair.x, (n) => onMutate((e) => { e.stair![sel.index].x = Math.round(n) }))}
          {numInput('y', selStair.y, (n) => onMutate((e) => { e.stair![sel.index].y = Math.round(n) }))}
          <div className="font-mono2 mb-1 flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
            <span className="w-8">坡向</span>
            <button className="font-mono2 text-[10px]" style={btnSt}
              onClick={() => onMutate((m) => { const st = m.stair![sel.index]; st.dir = (st.dir % 4) + 1 })}>
              {STAIR_DIR_LABEL[selStair.dir] ?? selStair.dir}（点击切换）
            </button>
          </div>
          {numInput('lo', selStair.lo, (n) => onMutate((e) => { e.stair![sel.index].lo = Math.max(0, n) }), 0.1)}
          {numInput('hi', selStair.hi, (n) => onMutate((e) => { e.stair![sel.index].hi = Math.max(0, n) }), 0.1)}
          <button className="font-mono2 mt-1 text-[10px]" style={{ ...btnSt, color: 'var(--blood)' }}
            onClick={() => delObj('stair', sel.index)}>删除</button>
        </>
      )}
      {/* 随机生成物的生成率（chance）编辑——随机对象唯一允许的数值调整 */}
      {selChanceObj && sel && (
        <label className="font-mono2 mb-1 flex items-center gap-1 text-[11px]" style={{ color: 'var(--amber)' }}>
          <span className="w-16">生成率</span>
          <input type="number" className="w-20 outline-none" style={inputSt} value={selChanceObj.chance ?? ''} placeholder="次数随机"
            step={0.01} min={0} max={1}
            onChange={(e) => onMutate((m) => {
              const arr = sel.type === 'struct' ? m.structures : sel.type === 'entity' ? m.entities : m.items
              const o = arr?.[sel.index] as { chance?: number } | undefined
              if (!o) return
              if (e.target.value === '') delete o.chance
              else o.chance = Math.max(0, Math.min(1, num(e.target.value, 0)))
            })} />
          <span style={{ color: 'var(--text-dim)' }}>0~1；空=次数随机</span>
        </label>
      )}
      {selZone && sel && (
        <>
          {sec(`区域 #${sel.index}`)}
          <label className="font-mono2 mb-1 flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
            <span className="w-8">名称</span>
            <input className="min-w-0 flex-1 outline-none" style={inputSt} value={selZone.name}
              onChange={(e) => onMutate((m) => { m.zones![sel.index].name = e.target.value })} />
          </label>
          {selZone.x0 === undefined ? (
            <button className="font-mono2 text-[10px]" style={btnSt}
              onClick={() => onMutate((m) => {
                const z = m.zones![sel.index]
                z.x0 = Math.round(z.x - 3); z.y0 = Math.round(z.y - 3); z.x1 = Math.round(z.x + 2); z.y1 = Math.round(z.y + 2)
              })}>改为矩形范围</button>
          ) : (
            <>
              <div className="font-mono2 mb-1 text-[10px]" style={{ color: 'var(--text-dim)' }}>矩形范围（画布虚线框四边可拖拽）</div>
              {(['x0', 'y0', 'x1', 'y1'] as const).map((k) => (
                <label key={k} className="font-mono2 mb-1 flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
                  <span className="w-8">{k}</span>
                  <input type="number" className="w-20 outline-none" style={inputSt} value={selZone[k] ?? 0}
                    onChange={(e) => onMutate((m) => {
                      const z = m.zones![sel.index]
                      z[k] = num(e.target.value, z[k] ?? 0)
                      if ((z.x0 ?? 0) > (z.x1 ?? 0)) [z.x0, z.x1] = [z.x1, z.x0]
                      if ((z.y0 ?? 0) > (z.y1 ?? 0)) [z.y0, z.y1] = [z.y1, z.y0]
                      z.x = ((z.x0 ?? 0) + (z.x1 ?? 0) + 1) / 2; z.y = ((z.y0 ?? 0) + (z.y1 ?? 0) + 1) / 2
                    })} />
                </label>
              ))}
              <button className="font-mono2 text-[10px]" style={btnSt}
                onClick={() => onMutate((m) => { const z = m.zones![sel.index]; delete z.x0; delete z.y0; delete z.x1; delete z.y1 })}>改回点标注</button>
            </>
          )}
        </>
      )}

      </>)}

      {/* 新增对象（v54 任务5：随机样例也可放置——对象带 onRandomSample 标记，复刻=写进生成器保证必出） */}
      {sec('新增')}
      {lockRandom && <div className="font-mono2 mb-1 text-[10px]" style={{ color: 'var(--amber)' }}>随机样例：新放置的对象将标记 onRandomSample</div>}
      <div className="mb-1 flex gap-1">
        <select className="font-mono2 min-w-0 flex-1 text-[11px] outline-none" style={inputSt}
          value={props.addKind} onChange={(e) => props.setAddKind(e.target.value)}>
          {STRUCT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.name} ({k.id})</option>)}
        </select>
        <button className="font-mono2 shrink-0 text-[10px]" style={{ ...btnSt, color: placing?.type === 'struct' ? 'var(--amber)' : 'var(--text-dim)' }}
          onClick={() => onPlacing(placing?.type === 'struct' ? null : { type: 'struct', kind: props.addKind })}>
          {placing?.type === 'struct' ? '取消' : '放置'}
        </button>
      </div>
      <div className="mb-1 flex gap-1">
        <select className="font-mono2 min-w-0 flex-1 text-[11px] outline-none" style={inputSt}
          value={props.addNpc} onChange={(e) => props.setAddNpc(e.target.value)}>
          {Object.values(NPCS).map((n) => <option key={n.id} value={n.id}>{n.name} ({n.id})</option>)}
          <option value="__random__">随机居民（按据点池）</option>
          <option value="__new__">新建固定 NPC…</option>
        </select>
        <button className="font-mono2 shrink-0 text-[10px]" style={{ ...btnSt, color: placing?.type === 'npc' ? 'var(--amber)' : 'var(--text-dim)', opacity: (props.addNpc === '__new__' && !props.newNpcForm.name.trim()) ? 0.45 : 1 }}
          disabled={props.addNpc === '__new__' && !props.newNpcForm.name.trim()}
          onClick={() => {
            if (placing?.type === 'npc') { onPlacing(null); return }
            if (props.addNpc === '__random__') onPlacing({ type: 'npc', id: 'random', flavor: OUTPOST_NPC_FLAVOR[entry.id] ?? 'meg' })
            else if (props.addNpc === '__new__') onPlacing({ type: 'npc', id: `new:${props.newNpcForm.name.trim()}`, newNpc: { ...props.newNpcForm, name: props.newNpcForm.name.trim() } })
            else onPlacing({ type: 'npc', id: props.addNpc })
          }}>
          {placing?.type === 'npc' ? '取消' : 'NPC'}
        </button>
      </div>
      {props.addNpc === '__new__' && (
        <div className="mb-1 border p-1" style={{ borderColor: 'var(--panel-edge)' }}>
          {(['姓名', '职业', '描述'] as const).map((label) => {
            const k = label === '姓名' ? 'name' : label === '职业' ? 'role' : 'desc'
            return (
              <input key={k} className="font-mono2 mb-1 w-full text-[11px] outline-none" style={inputSt}
                placeholder={label}
                value={props.newNpcForm[k]}
                onChange={(e) => props.setNewNpcForm({ ...props.newNpcForm, [k]: e.target.value })} />
            )
          })}
          <div className="font-mono2 text-[9px]" style={{ color: 'var(--text-dim)' }}>导出后由 Agent 在 content/npcs.ts 注册（对话树按描述编写）再落位</div>
        </div>
      )}
      <div className="mb-1 flex gap-1">
        <select className="font-mono2 min-w-0 flex-1 text-[11px] outline-none" style={inputSt}
          value={props.addEnt} onChange={(e) => props.setAddEnt(e.target.value)}>
          {Object.values(ENTITIES).map((n) => <option key={n.type} value={n.type}>{n.name} ({n.type})</option>)}
        </select>
        <button className="font-mono2 shrink-0 text-[10px]" style={{ ...btnSt, color: placing?.type === 'entity' ? 'var(--amber)' : 'var(--text-dim)' }}
          onClick={() => onPlacing(placing?.type === 'entity' ? null : { type: 'entity', etype: props.addEnt })}>
          {placing?.type === 'entity' ? '取消' : '实体'}
        </button>
      </div>
      <div className="mb-1 flex gap-1">
        <select className="font-mono2 min-w-0 flex-1 text-[11px] outline-none" style={inputSt}
          value={props.addItem} onChange={(e) => props.setAddItem(e.target.value)}>
          {Object.values(ITEMS).map((n) => <option key={n.type} value={n.type}>{n.name} ({n.type})</option>)}
        </select>
        <button className="font-mono2 shrink-0 text-[10px]" style={{ ...btnSt, color: placing?.type === 'item' ? 'var(--amber)' : 'var(--text-dim)' }}
          onClick={() => onPlacing(placing?.type === 'item' ? null : { type: 'item', item: props.addItem })}>
          {placing?.type === 'item' ? '取消' : '物品'}
        </button>
      </div>
      <div className="mb-1 flex gap-1">
        <button className="font-mono2 text-[10px]" style={{ ...btnSt, color: placing?.type === 'light' ? 'var(--amber)' : 'var(--text-dim)' }}
          onClick={() => onPlacing(placing?.type === 'light' ? null : { type: 'light' })}>
          {placing?.type === 'light' ? '取消' : '+ 灯'}
        </button>
        {/* v54：新增楼梯格（dir 坡向 + lo/hi 高度） */}
        <select className="font-mono2 text-[10px] outline-none" style={inputSt} value={props.stairForm.dir}
          onChange={(e) => props.setStairForm({ ...props.stairForm, dir: Number(e.target.value) })}>
          {[1, 2, 3, 4].map((d) => <option key={d} value={d}>坡向{STAIR_DIR_LABEL[d]}</option>)}
        </select>
        <input type="number" className="font-mono2 w-12 text-[10px] outline-none" style={inputSt} title="lo（坡低高度，米）" step={0.1}
          value={props.stairForm.lo} onChange={(e) => props.setStairForm({ ...props.stairForm, lo: Number(e.target.value) || 0 })} />
        <input type="number" className="font-mono2 w-12 text-[10px] outline-none" style={inputSt} title="hi（坡高高度，米）" step={0.1}
          value={props.stairForm.hi} onChange={(e) => props.setStairForm({ ...props.stairForm, hi: Number(e.target.value) || 0 })} />
        <button className="font-mono2 text-[10px]" style={{ ...btnSt, color: placing?.type === 'stair' ? 'var(--amber)' : 'var(--text-dim)' }}
          onClick={() => onPlacing(placing?.type === 'stair' ? null : { type: 'stair', ...props.stairForm })}>
          {placing?.type === 'stair' ? '取消' : '+ 楼梯'}
        </button>
      </div>
      {placing && <div className="font-mono2 text-[10px]" style={{ color: 'var(--amber)' }}>点击画布放置…</div>}

      {/* 结构列表（点选定位） */}
      {sec(`结构（${(entry.structures ?? []).filter((s) => (s.floor ?? 0) === floor).length} / 共 ${entry.structures?.length ?? 0}）`)}
      <div className="max-h-40 overflow-y-auto">
        {(entry.structures ?? []).map((s, i) => (s.floor ?? 0) !== floor ? null : (
          <button key={i} className="font-mono2 block w-full truncate px-1 py-0 text-left text-[10px]"
            style={{ color: sel?.type === 'struct' && sel.index === i ? 'var(--amber)' : 'var(--text-dim)' }}
            onClick={() => onSelect({ type: 'struct', index: i }, s.x + s.w / 2, s.y + s.h / 2)}>
            #{i} {structName(s.kind)} ({s.x},{s.y}) {s.w}×{s.h}{s.random ? ' 随' : ''}
          </button>
        ))}
      </div>

      {/* spawnRules */}
      {(entry.spawnRules?.length ?? 0) > 0 && (
        <>
          {sec(`生成概率规则（${entry.spawnRules!.length}）`)}
          {entry.spawnRules!.map((r, i) => (
            <div key={r.key} className="mb-1">
              <div className="flex items-center gap-1">
                <span className="font-mono2 min-w-0 flex-1 truncate text-[10px]" style={{ color: 'var(--text)' }}>{r.key}</span>
                <input className="font-mono2 w-16 shrink-0 text-[11px] outline-none" style={inputSt} value={String(r.value)}
                  onChange={(e) => onMutate((m) => {
                    const v = e.target.value
                    m.spawnRules![i].value = typeof r.value === 'number' && Number.isFinite(Number(v)) && v !== '' ? Number(v) : v
                  })} />
              </div>
              <div className="font-mono2 text-[9px]" style={{ color: 'var(--text-dim)' }}>{r.note}</div>
            </div>
          ))}
        </>
      )}

      {/* 出口 */}
      {(entry.exits?.length ?? 0) > 0 && (
        <>
          {sec(`出口（${entry.exits!.length}）`)}
          {entry.exits!.map((x, i) => (
            <div key={i} className="mb-1 flex items-center gap-1">
              <input className="font-mono2 min-w-0 flex-1 text-[11px] outline-none" style={inputSt} value={x.name}
                onChange={(e) => onMutate((m) => { m.exits![i].name = e.target.value })} />
              <input className="font-mono2 w-16 shrink-0 text-[11px] outline-none" style={inputSt} value={String(x.dest)} title="dest"
                onChange={(e) => onMutate((m) => {
                  const v = e.target.value
                  m.exits![i].dest = v === 'random' || v === 'win' || v === 'back' ? v : Number.isFinite(Number(v)) ? Number(v) : m.exits![i].dest
                })} />
            </div>
          ))}
        </>
      )}

      {/* 区域名（点选后画布叠加矩形范围；名称/矩形可编辑） */}
      {(entry.zones?.length ?? 0) > 0 && (
        <>
          {sec(`区域名（${entry.zones!.length}）`)}
          {entry.zones!.map((z, i) => (
            <div key={i} className="mb-1 flex items-center gap-1">
              <button className="font-mono2 min-w-0 flex-1 truncate px-1 text-left text-[11px]"
                style={{ color: sel?.type === 'zone' && sel.index === i ? 'var(--amber)' : 'var(--text)' }}
                onClick={() => onSelect({ type: 'zone', index: i }, z.x, z.y)}>
                {z.name}{z.x0 !== undefined ? ' ▭' : ''}
              </button>
              <span className="font-mono2 shrink-0 text-[9px]" style={{ color: 'var(--text-dim)' }}>{(z.z ?? 0) + 1}F</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}


// ============================================================ 新建图鉴条目表单（v54 任务2）============================================================
// 三种来源模式：custom=玩家自定义（全部字段手写）/ fromDescription=Agent 依名称+描述生成 / auto=Agent 完全自动生成。
// 导出为 codex 数组中带 "new": true 的条目；落地注册流程见 DESIGN-GUIDE §3「新建条目注册流程」。
function NewEntryForm({ kind, onCreate, onCancel }: {
  kind: CodexKind
  onCreate: (e: CodexEntry) => void
  onCancel: () => void
}) {
  const [mode, setMode] = useState<'custom' | 'fromDescription' | 'auto'>('fromDescription')
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const needId = mode === 'custom' // 玩家自定义必须给注册 id；生成模式可由 Agent 定名
  const canCreate = (!needId || id.trim().length > 0) && (mode === 'auto' || name.trim().length > 0)
  const labelOf: Record<CodexKind, string> = { entity: '实体', item: '物品', level: '层级', phenomenon: '现象', faction: '团体', outpost: '据点', npc: 'NPC', doc: '文档' }
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="font-title mb-3 text-[18px]" style={{ color: 'var(--amber)' }}>新建{labelOf[kind]}条目</div>
      <div className="font-mono2 mb-2 text-[11px]" style={{ color: 'var(--text-dim)' }}>来源模式（单选）</div>
      {([
        ['custom', '玩家自定义', '全部字段由你手写（创建后在字段编辑器逐条填写）'],
        ['fromDescription', 'Agent 依描述生成', '只写名称 + 描述，设定由 Agent 按描述补全'],
        ['auto', 'Agent 自动生成', '只给名称或完全留空，Agent 自行补全全部设定'],
      ] as const).map(([m, label, hint]) => (
        <label key={m} className="font-mono2 mb-1 flex items-start gap-2 text-[12px]" style={{ color: mode === m ? 'var(--amber)' : 'var(--text-dim)' }}>
          <input type="radio" className="mt-1" checked={mode === m} onChange={() => setMode(m)} />
          <span>{label}<span className="text-[10px]">——{hint}</span></span>
        </label>
      ))}
      <div className="mt-3 flex flex-col gap-2" style={{ maxWidth: 420 }}>
        <input className="font-mono2 text-[12px] outline-none" style={inputSt} disabled={mode === 'auto'}
          placeholder={needId ? '注册 id（英文小写，必填）' : '注册 id（可选，缺省由 Agent 定）'}
          value={id} onChange={(e) => setId(e.target.value)} />
        <input className="font-mono2 text-[12px] outline-none" style={inputSt} disabled={mode === 'auto'}
          placeholder={mode === 'auto' ? '名称（可选，留空=完全自动）' : '名称'}
          value={name} onChange={(e) => setName(e.target.value)} />
        {mode !== 'auto' && (
          <textarea className="font-mono2 resize-y text-[12px] outline-none" style={{ ...inputSt, minHeight: 90 }}
            placeholder={mode === 'fromDescription' ? '描述（Agent 按此生成全部设定）' : '简述（填入 desc 字段）'}
            value={desc} onChange={(e) => setDesc(e.target.value)} />
        )}
        <div className="flex gap-2">
          <button className="font-mono2 text-[12px]" style={{ ...btnSt, color: canCreate ? 'var(--amber)' : 'var(--text-dim)', opacity: canCreate ? 1 : 0.45 }}
            disabled={!canCreate}
            onClick={() => {
              const nm = name.trim()
              const fid = id.trim() || (mode === 'auto' ? 'tbd' : `new:${nm}`)
              let fields: Record<string, string> = {}
              if (mode === 'custom') {
                for (const k of NEW_TEMPLATES[kind]) fields[k] = ''
                if ('name' in fields) fields.name = nm
                if ('title' in fields) fields.title = nm
                if ('desc' in fields) fields.desc = desc
              } else {
                fields = nm ? { name: nm, desc } : { desc }
              }
              onCreate({
                kind, id: fid, fields, new: true,
                ...(mode === 'fromDescription' ? { generate: 'fromDescription' as const } : mode === 'auto' ? { generate: 'auto' as const } : {}),
              })
            }}>
            创建
          </button>
          <button className="font-mono2 text-[12px]" style={btnSt} onClick={onCancel}>取消</button>
        </div>
        <div className="font-mono2 text-[10px]" style={{ color: 'var(--text-dim)' }}>
          导出后由 Agent 按 DESIGN-GUIDE「新建条目注册流程」落地（注册表 / 建模 / 图标 / 生成池）
        </div>
      </div>
    </div>
  )
}
