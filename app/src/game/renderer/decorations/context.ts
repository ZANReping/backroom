// v53：层级装饰构建上下文——rng / 墙面与地面取点 / 贴花与道具合批桶。
// 由 index.ts 的 buildDecorations 创建；decals.ts（仅贴图贴花）与 props.ts（无碰撞低模道具）
// 的各摆放函数全部接收本上下文。rng 是唯一顺序流：各摆放函数的调用顺序必须与拆分前一致，
// 否则同一种子摆位变化（纯视觉，但仍视为生成结果）。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { UNDER_FLOOR, type GameMap } from '../../world/mapgen'
import type { LevelDef, LightSource } from '../../core/types'
import { col, mulberry } from '../shared'

// 墙面收集：d 0=北墙 1=东墙 2=南墙 3=西墙（墙在对应方向的邻居）
export interface WSpot { x: number; y: number; d: number }

export interface DecorCtx {
  g: THREE.Group
  H: number // 墙高
  variant?: string // v17：无限模式 chunk 变体
  rng: () => number
  ri: (a: number, b: number) => number // 随机整数 [a,b]
  rf: (a: number, b: number) => number // 随机浮点 [a,b)
  ns: () => number // 贴图种子流
  pickWall: () => WSpot | null
  pickFloor: () => { x: number; y: number } | null
  wallPropSpot: () => { x: number; z: number; ry: number } | null // 墙边道具摆放点（靠墙 0.32m，朝向房内）
  wallDecal: (spot: WSpot, tex: THREE.Texture, w: number, h: number, cy: number, opacity?: number) => THREE.Mesh
  floorDecal: (fx: number, fz: number, tex: THREE.Texture, size: number, rot?: number) => void
  pBox: (color: string, w: number, h: number, d: number, x: number, y: number, z: number, ry?: number, rz?: number, rx?: number) => void
  pCyl: (color: string, rt: number, rb: number, h: number, x: number, y: number, z: number, ry?: number, rz?: number, seg?: number) => void
  glowBox: (color: string, w: number, h: number, d: number, x: number, y: number, z: number, ry?: number, rz?: number, flicker?: boolean) => THREE.Mesh
  // 合批桶（flushDecor 统一落地）
  floorBuckets: Map<THREE.Texture, THREE.BufferGeometry[]>
  propBuckets: Map<string, THREE.BufferGeometry[]>
}

export function createDecorCtx(
  m: GameMap,
  def: LevelDef,
  wallH: number,
  g: THREE.Group,
  fixtures: { mat: THREE.MeshBasicMaterial; seed: number; src?: LightSource }[],
  range?: { x0: number; y0: number; x1: number; y1: number; variant?: string }, // v17：无限模式按 chunk 范围构建（含 chunk 变体）
): DecorCtx {
  const rng = mulberry(def.id * 7919 + m.w * 131 + m.h * 17 + (range ? range.x0 * 911 + range.y0 * 557 : 0))
  const H = wallH
  const ri = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1))
  const rf = (a: number, b: number) => a + rng() * (b - a)
  const RX0 = range?.x0 ?? 1, RY0 = range?.y0 ?? 1
  const RX1 = range?.x1 ?? m.w - 1, RY1 = range?.y1 ?? m.h - 1
  // L6 的 darkhall 装饰属于 -1F 廊道。此前仍从地表 tiles 取点且使用 y=0，
  // 于是废弃手电等小物会悬在起伏苔原和区块接缝上。
  const underground = def.id === 6 && m.hasUnderground
  const baseY = underground ? UNDER_FLOOR : 0
  const walkableAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return false
    const i = y * m.w + x
    return underground ? m.dn[i] === 1 && m.dnWall[i] !== 1 : m.tiles[i] === 1
  }

  // 占用：实体/物品/出口/出生点附近不摆
  const solidAt = (x: number, y: number) => m.structures.some((s) => s.solid && (s.floor ?? 0) === (underground ? -1 : 0) && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
  const nearImportant = (x: number, y: number) => {
    if (Math.hypot(x - m.spawn.x, y - m.spawn.y) < 2) return true
    for (const it of m.items) if (Math.abs(it.x - x - 0.5) < 0.8 && Math.abs(it.y - y - 0.5) < 0.8) return true
    for (const e of m.exits) if (Math.abs(e.x - x) <= 1 && Math.abs(e.y - y) <= 1) return true
    for (const e of m.entities) if (Math.hypot(e.x - x - 0.5, e.y - y - 0.5) < 1.6) return true
    return false
  }
  const wallSpots: WSpot[] = []
  const floorTiles: { x: number; y: number }[] = []
  for (let y = RY0; y < RY1; y++) for (let x = RX0; x < RX1; x++) {
    if (!walkableAt(x, y) || solidAt(x, y)) continue
    floorTiles.push({ x, y })
    if (!walkableAt(x, y - 1)) wallSpots.push({ x, y, d: 0 })
    if (!walkableAt(x + 1, y)) wallSpots.push({ x, y, d: 1 })
    if (!walkableAt(x, y + 1)) wallSpots.push({ x, y, d: 2 })
    if (!walkableAt(x - 1, y)) wallSpots.push({ x, y, d: 3 })
  }
  const usedWall = new Set<string>()
  const usedFloor = new Set<string>()
  const pickWall = (): WSpot | null => {
    for (let t = 0; t < 60; t++) {
      const s = wallSpots[Math.floor(rng() * wallSpots.length)]
      if (!s) return null
      const k = `${s.x},${s.y},${s.d}`
      if (usedWall.has(k) || nearImportant(s.x, s.y)) continue
      usedWall.add(k)
      return s
    }
    return null
  }
  const pickFloor = (): { x: number; y: number } | null => {
    for (let t = 0; t < 60; t++) {
      const s = floorTiles[Math.floor(rng() * floorTiles.length)]
      if (!s) return null
      const k = `${s.x},${s.y}`
      if (usedFloor.has(k) || nearImportant(s.x, s.y)) continue
      usedFloor.add(k)
      return s
    }
    return null
  }

  // 贴墙贴花（离墙 2cm 防 z-fighting）
  const wallDecal = (spot: WSpot, tex: THREE.Texture, w: number, h: number, cy: number, opacity = 1) => {
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, opacity })
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
    const off = 0.02, cx = spot.x + 0.5, cz = spot.y + 0.5
    if (spot.d === 0) p.position.set(cx, baseY + cy, spot.y + off)
    else if (spot.d === 2) { p.position.set(cx, baseY + cy, spot.y + 1 - off); p.rotation.y = Math.PI }
    else if (spot.d === 3) { p.position.set(spot.x + off, baseY + cy, cz); p.rotation.y = Math.PI / 2 }
    else { p.position.set(spot.x + 1 - off, baseY + cy, cz); p.rotation.y = -Math.PI / 2 }
    g.add(p)
    return p
  }
  // 地面贴花（同贴图合并，控制 drawcall）
  const floorBuckets = new Map<THREE.Texture, THREE.BufferGeometry[]>()
  const floorDecal = (fx: number, fz: number, tex: THREE.Texture, size: number, rot = 0) => {
    const geo = new THREE.PlaneGeometry(size, size)
    geo.rotateX(-Math.PI / 2)
    if (rot) geo.rotateY(rot)
    geo.translate(fx, baseY + 0.012 + rng() * 0.004, fz)
    if (!floorBuckets.has(tex)) floorBuckets.set(tex, [])
    floorBuckets.get(tex)!.push(geo)
  }
  // 低模道具：按颜色合并为少量 mesh（Lambert）
  const propBuckets = new Map<string, THREE.BufferGeometry[]>()
  const pBox = (color: string, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rz = 0, rx = 0) => {
    const geo = new THREE.BoxGeometry(w, h, d)
    if (rz) geo.rotateZ(rz)
    if (rx) geo.rotateX(rx)
    if (ry) geo.rotateY(ry)
    geo.translate(x, baseY + y, z)
    if (!propBuckets.has(color)) propBuckets.set(color, [])
    propBuckets.get(color)!.push(geo)
  }
  const pCyl = (color: string, rt: number, rb: number, h: number, x: number, y: number, z: number, ry = 0, rz = 0, seg = 8) => {
    const geo = new THREE.CylinderGeometry(rt, rb, h, seg)
    if (rz) geo.rotateZ(rz)
    if (ry) geo.rotateY(ry)
    geo.translate(x, baseY + y, z)
    if (!propBuckets.has(color)) propBuckets.set(color, [])
    propBuckets.get(color)!.push(geo)
  }
  // 自发光道具（可加入 fixtures 闪烁）
  const glowBox = (color: string, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rz = 0, flicker = false) => {
    const mat = new THREE.MeshBasicMaterial({ color })
    mat.userData.base = col(color)
    const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    mm.position.set(x, baseY + y, z)
    if (ry) mm.rotation.y = ry
    if (rz) mm.rotation.z = rz
    g.add(mm)
    if (flicker) fixtures.push({ mat, seed: rng() * 100 })
    return mm
  }
  // 墙边道具摆放点（地板瓦片靠墙 0.32m 处，朝向房内）
  const wallPropSpot = (): { x: number; z: number; ry: number } | null => {
    const s = pickWall()
    if (!s) return null
    const inward: [number, number, number][] = [[0, 1, Math.PI], [-1, 0, Math.PI / 2], [0, -1, 0], [1, 0, -Math.PI / 2]]
    const [ix, iz, ry] = inward[s.d]
    return { x: s.x + 0.5 - ix * 0.32, z: s.y + 0.5 - iz * 0.32, ry }
  }

  let seed = def.id * 1000
  const ns = () => (seed += 37)

  return {
    g, H, variant: range?.variant, rng, ri, rf, ns,
    pickWall, pickFloor, wallPropSpot,
    wallDecal, floorDecal, pBox, pCyl, glowBox,
    floorBuckets, propBuckets,
  }
}

// flush：合并地面贴花 / 道具桶
export function flushDecor(c: DecorCtx) {
  for (const [tex, geos] of c.floorBuckets) {
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false })
    c.g.add(new THREE.Mesh(mergeGeometries(geos)!, mat))
  }
  for (const [color, geos] of c.propBuckets) {
    c.g.add(new THREE.Mesh(mergeGeometries(geos)!, new THREE.MeshLambertMaterial({ color })))
  }
}
