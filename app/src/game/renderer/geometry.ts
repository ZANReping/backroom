// 地形几何：地面/台阶坡道/高差接缝/天花板/风道/多层楼板/墙体（静态合并 + 顶点色）
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ELEV_H, type GameMap } from '../mapgen'
import type { LevelDef } from '../types'
import { col, rampGeo, levelTexture, noiseTexture, OUTDOOR_FLOOR } from './shared'

// v17：range 限定构建范围（无限模式按 chunk 构建；坐标读取全图，跨 chunk 接缝一致）
export interface TerrainRange { x0: number; y0: number; x1: number; y1: number }
// 确定性瓦片哈希噪声（替代 Math.random：同瓦片重建着色一致）
const hv = (x: number, y: number, s: number) => {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(s, 0x9e3779b9)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}
// v17：tint 着色（1=马尼拉米色墙纸 2=红室 3=熄灯区仅雾/无灯）
// v20：马尼拉墙面色改为确定的马尼拉文件夹暖米色 #e5c88f，且墙面走独立无纹理网格
// （顶点色 × L0 黄色墙纸纹理永远发黄——v19 的蓝通道补偿也无法把黄纸变成米色）
const TINT_FLOOR: Record<number, string> = { 1: '#c9ad74', 2: '#8a1e14' }
const TINT_WALL: Record<number, string> = { 1: '#e5c88f', 2: '#a82318' }
const TINT_CEIL: Record<number, string> = { 1: '#c9b185', 2: '#5e120b' }
export function buildTerrain(m: GameMap, def: LevelDef, wallH: number, g: THREE.Group, range?: TerrainRange) {
  const pal = def.palette
  const H = wallH
  const RX0 = range?.x0 ?? 0, RY0 = range?.y0 ?? 0
  const RX1 = range?.x1 ?? m.w, RY1 = range?.y1 ?? m.h
// 第二套 CC0 纹理（随机分区增加同层变化；键 = 层级 id，文件需存在于 public/textures/）
const TEX2: Partial<Record<number, { wall?: string; floor?: string }>> = {
  0: { wall: 'l0_wall2' }, 1: { wall: 'l1_wall2' }, 2: { floor: 'l2_floor2' },
  3: { wall: 'l3_wall2' }, 4: { wall: 'l4_wall2', floor: 'l4_floor2' },
  5: { wall: 'l5_wall2', floor: 'l5_floor2' },
}
// v16：L0 墙纸改为**世界空间 UV**——UV 由世界坐标推导（侧面 u=x+z、v=y，顶/底面 u=x、v=z），
// 图案跨 1m 墙盒连续流动，盒间几何接缝处纹理相位无跳变、接缝不可见；
// 侧面 u 统一取 x+z：±x 面 x 恒定仅作相位偏移，转角处两面 u 在角点相等 → 图案绕角自然转折；
// v=y 使竖条纹始终竖直；per = 每米平铺次数（一图覆盖 1/per 米）。
// v16 任务3：玩家要求图案更大——一图覆盖 0.5m→1.0m（源图≈13 列条纹，列宽 3.8cm→7.7cm，
// 更接近经典后室照片近距观感）；世界空间 UV 下任意比例均无缝。
const WALL_UV_PER_M: Partial<Record<number, number>> = { 0: 1 }
const worldWallUV = (geo: THREE.BufferGeometry, per: number) => {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const ny = Math.abs(nor.getY(i))
    let u: number, v: number
    if (ny > 0.5) { u = pos.getX(i); v = pos.getZ(i) } // 顶/底面
    else { u = pos.getX(i) + pos.getZ(i); v = pos.getY(i) } // 四个侧面：绕角连续、条纹竖直
    uv.setXY(i, u * per, v * per)
  }
}
// 新墙纸本身已是黄色底，顶点色用暖调叠乘——原橄榄色 #c9b458 叠乘会发绿/过暗；
// v16：近白 #f5efdd 在手电直射下整面过曝饱和、冲掉图案对比度，降至 #d8cbab 保持图案可辨
const WALL_TINT: Partial<Record<number, string>> = { 0: '#d8cbab' }
const tex2 = TEX2[def.id] ?? {}
const wuv = WALL_UV_PER_M[def.id]
// 4×4 区块哈希分区（约 1/5 区域用变体纹理）
const zoneB = (x: number, y: number) => (((x >> 2) * 31 + (y >> 2) * 17 + def.id * 7) % 5) === 0

// ---- 地面（合并 + 顶点色 + 噪点纹理；v7：高度档分档地面 + 坡道楔形）----
const floorGeos: THREE.BufferGeometry[] = []
const floorGeos2: THREE.BufferGeometry[] = []
const wedgeGeos: THREE.BufferGeometry[] = [] // 台阶/坡道（双面材质）
const riserGeos: THREE.BufferGeometry[] = [] // 高差侧壁
const abyssGeos: THREE.BufferGeometry[] = [] // 深坑洞底（纯黑无光照，望不见底）
const fB = col(pal.floor), fA = col(pal.floorAlt), wetC = col('#3a4a3a')
const outC = col(OUTDOOR_FLOOR[def.gen] ?? '#333638')
const poolC = col('#6e8a96') // v12：泳池底浅色池砖（半透明水面下可辨，不再像深渊）
// v12：室外地面独立合并网格（自带「夜空环境光」自发光材质，黑暗中也可辨，
//       修复庭院/小巷地面融进天空色被当成虚空的报告）
const outFloorGeos: THREE.BufferGeometry[] = []
for (let y = RY0; y < RY1; y++) {
  for (let x = RX0; x < RX1; x++) {
    const ti = y * m.w + x
    if (m.tiles[ti] !== 1) continue
    const isWet = m.wet[ti] === 1
    const isOut = m.outdoor[ti] === 1
    const tnt = m.tint[ti]
    const tBase = tnt && TINT_FLOOR[tnt] ? col(TINT_FLOOR[tnt]) : null
    const c = isWet && !isOut ? wetC : isOut
      ? (isWet ? poolC : outC).clone().multiplyScalar(0.9 + hv(x, y, 1) * 0.2)
      : (tBase ?? ((x + y) % 2 === 0 ? fB : fA)).clone().multiplyScalar(0.92 + hv(x, y, 2) * 0.16)
    const st = m.step[ti]
    const s2 = m.stair[ti]
    if (s2 & 7) {
      // v13 楼梯坡道：任意高度连续爬升，实心到地面（侧面不穿帮）
      const lo = ((s2 >> 3) & 0x3fff) / 100, hi = ((s2 >> 17) & 0x3fff) / 100
      wedgeGeos.push(rampGeo(s2 & 7, lo, hi, x, y, c, 0))
      continue
    }
    if (st & 7) {
      // 坡道瓦片：楔形（顶面斜坡 + 侧面封闭）
      wedgeGeos.push(rampGeo(st & 7, ELEV_H[(st >> 3) & 3], ELEV_H[(st >> 5) & 3], x, y, c))
      continue
    }
    // 深坑洞口：洞底纯黑平面（不受光照，往下望一片漆黑）
    if (m.elev[ti] === 4) {
      const geo = new THREE.PlaneGeometry(1, 1)
      geo.rotateX(-Math.PI / 2)
      geo.translate(x + 0.5, ELEV_H[4], y + 0.5)
      abyssGeos.push(geo)
      continue
    }
    // v13：深水池底 -1.7m / 浅水洼 -0.25m
    const fh = m.liquid[ti] === 1 ? -1.7 : m.liquid[ti] === 2 ? -0.25 : ELEV_H[m.elev[ti]]
    const geo = new THREE.PlaneGeometry(1, 1)
    geo.rotateX(-Math.PI / 2)
    geo.translate(x + 0.5, fh, y + 0.5)
    const n = geo.attributes.position.count
    const carr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { carr[i * 3] = c.r; carr[i * 3 + 1] = c.g; carr[i * 3 + 2] = c.b }
    geo.setAttribute('color', new THREE.BufferAttribute(carr, 3))
    ;(isOut ? outFloorGeos : tex2.floor && !isWet && zoneB(x, y) ? floorGeos2 : floorGeos).push(geo)
  }
}
if (floorGeos.length) {
  const floorMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: levelTexture(`l${def.id}_floor`, () => noiseTexture(pal.floor, pal.floorAlt)), emissive: col(pal.floor).multiplyScalar(0.06) })
  g.add(new THREE.Mesh(mergeGeometries(floorGeos)!, floorMat))
}
if (abyssGeos.length) {
  g.add(new THREE.Mesh(mergeGeometries(abyssGeos)!, new THREE.MeshBasicMaterial({ color: '#000000' })))
}
if (floorGeos2.length) {
  const floorMat2 = new THREE.MeshLambertMaterial({ vertexColors: true, map: levelTexture(tex2.floor!, () => noiseTexture(pal.floor, pal.floorAlt)), emissive: col(pal.floor).multiplyScalar(0.06) })
  g.add(new THREE.Mesh(mergeGeometries(floorGeos2)!, floorMat2))
}
// v12：室外地面材质——较高自发光模拟夜空环境光（月光/城市光污染），
// 保证黑暗层级中室外地板始终可辨，不再被误认成虚空；不受雾影响程度与室内一致。
if (outFloorGeos.length) {
  const outFloorMat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    map: levelTexture(`l${def.id}_floor`, () => noiseTexture(pal.floor, pal.floorAlt)),
    emissive: outC.clone().multiplyScalar(0.38),
  })
  g.add(new THREE.Mesh(mergeGeometries(outFloorGeos)!, outFloorMat))
}
// 高差侧壁/接缝裙边：相邻地板瓦片（含坡道）共享边逐角比较高度，
// 任一角高差 >0.01 即生成封闭立面（低洼沟壁/高台壁/坡道侧边三角缝，消除地板洞）
const riserC = col(pal.wall).multiplyScalar(0.55)
// 瓦片内任意归一化位置的地面高度（v13：楼梯坡道/液体深度/台阶坡道/高度档统一）
const hAtTile = (tx: number, ty: number, fx: number, fy: number): number => {
  const i = ty * m.w + tx
  const s2 = m.stair[i]
  if (s2 & 7) {
    const dir = s2 & 7, lo = ((s2 >> 3) & 0x3fff) / 100, hi = ((s2 >> 17) & 0x3fff) / 100
    const t = dir === 1 ? fx : dir === 2 ? 1 - fx : dir === 3 ? fy : 1 - fy
    return lo + (hi - lo) * t
  }
  const st = m.step[i]
  if (st & 7) {
    const dir = st & 7, lo = ELEV_H[(st >> 3) & 3], hi = ELEV_H[(st >> 5) & 3]
    const t = dir === 1 ? fx : dir === 2 ? 1 - fx : dir === 3 ? fy : 1 - fy
    return lo + (hi - lo) * t
  }
  if (m.liquid[i] === 1) return -1.7
  if (m.liquid[i] === 2) return -0.25
  return ELEV_H[m.elev[i]]
}
// 瓦片指定边的两端角高度（edge: 1=东 2=南；坡道按楔形插值，平地两端同高）
const edgeH = (tx: number, ty: number, edge: 1 | 2): [number, number] =>
  edge === 1 ? [hAtTile(tx, ty, 1, 0), hAtTile(tx, ty, 1, 1)] : [hAtTile(tx, ty, 0, 1), hAtTile(tx, ty, 1, 1)]
const seamQuad = (ax: number, az: number, bx: number, bz: number, ha0: number, ha1: number, hb0: number, hb1: number): THREE.BufferGeometry | null => {
  const t0 = Math.max(ha0, hb0), t1 = Math.max(ha1, hb1)
  const b0 = Math.min(ha0, hb0), b1 = Math.min(ha1, hb1)
  if (t0 - b0 < 0.01 && t1 - b1 < 0.01) return null
  const pos = new Float32Array([
    ax, b0, az, bx, b1, bz, bx, t1, bz,
    ax, b0, az, bx, t1, bz, ax, t0, az,
  ])
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const n = geo.attributes.position.count
  const carr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { carr[i * 3] = riserC.r; carr[i * 3 + 1] = riserC.g; carr[i * 3 + 2] = riserC.b }
  geo.setAttribute('color', new THREE.BufferAttribute(carr, 3))
  const uv = new Float32Array(n * 2)
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.computeVertexNormals()
  return geo
}
for (let y = RY0; y < RY1; y++) {
  for (let x = RX0; x < RX1; x++) {
    if (m.tiles[y * m.w + x] !== 1) continue
    // 东接缝
    if (x + 1 < m.w && m.tiles[y * m.w + x + 1] === 1) {
      const [a0, a1] = edgeH(x, y, 1)
      const b0 = hAtTile(x + 1, y, 0, 0), b1 = hAtTile(x + 1, y, 0, 1)
      const geo = seamQuad(x + 1, y, x + 1, y + 1, a0, a1, b0, b1)
      if (geo) riserGeos.push(geo)
    }
    // 南接缝
    if (y + 1 < m.h && m.tiles[(y + 1) * m.w + x] === 1) {
      const [a0, a1] = edgeH(x, y, 2)
      const b0 = hAtTile(x, y + 1, 0, 0), b1 = hAtTile(x, y + 1, 1, 0)
      const geo = seamQuad(x, y + 1, x + 1, y + 1, a0, a1, b0, b1)
      if (geo) riserGeos.push(geo)
    }
  }
}
{
  const slopeGeos = [...wedgeGeos, ...riserGeos]
  if (slopeGeos.length) {
    const slopeMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: levelTexture(`l${def.id}_floor`, () => noiseTexture(pal.floor, pal.floorAlt)), emissive: col(pal.floor).multiplyScalar(0.06) })
    g.add(new THREE.Mesh(mergeGeometries(slopeGeos)!, slopeMat))
  }
}

// ---- 天花板（v7：室外无天花板；挑高区域层高提升）----
const ceilGeos: THREE.BufferGeometry[] = []
const cc = col(pal.wallTop).multiplyScalar(0.55)
for (let y = RY0; y < RY1; y++) {
  for (let x = RX0; x < RX1; x++) {
    const ti = y * m.w + x
    if (m.tiles[ti] !== 1 || m.outdoor[ti] === 1) continue
    if (m.up[ti] === 1) continue // v13：上层楼板底面即本层天花板（楼板盒自带底面）
    const ch = m.ceiling[ti] === 1 ? H * 1.75 : H
    const tnt = m.tint[ti]
    const ccTile = tnt && TINT_CEIL[tnt] ? col(TINT_CEIL[tnt]).multiplyScalar(0.85) : cc
    const geo = new THREE.PlaneGeometry(1, 1)
    geo.rotateX(Math.PI / 2)
    geo.translate(x + 0.5, ch, y + 0.5)
    const n = geo.attributes.position.count
    const carr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { carr[i * 3] = ccTile.r; carr[i * 3 + 1] = ccTile.g; carr[i * 3 + 2] = ccTile.b }
    geo.setAttribute('color', new THREE.BufferAttribute(carr, 3))
    ceilGeos.push(geo)
  }
}
if (ceilGeos.length) {
  const ceilMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: levelTexture(`l${def.id}_ceil`, () => noiseTexture(pal.wallTop, pal.wallTop)), emissive: col(pal.wallTop).multiplyScalar(0.05) })
  g.add(new THREE.Mesh(mergeGeometries(ceilGeos)!, ceilMat))
}

// ---- 蹲伏低通道头顶风道（低通道强制蹲伏的视觉依据）----
const ductGeos: THREE.BufferGeometry[] = []
const ductC = col('#22262b'), ductEdge = col('#3a3f46')
for (let y = RY0; y < RY1; y++) {
  for (let x = RX0; x < RX1; x++) {
    if (m.crawl[y * m.w + x] !== 1) continue
    const geo = new THREE.BoxGeometry(1, H - 1.15, 1)
    geo.translate(x + 0.5, 1.15 + (H - 1.15) / 2, y + 0.5)
    const pos = geo.attributes.position
    const carr = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const cc2 = pos.getY(i) < 1.2 ? ductEdge : ductC // 底缘亮色描边提示限高
      carr[i * 3] = cc2.r; carr[i * 3 + 1] = cc2.g; carr[i * 3 + 2] = cc2.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(carr, 3))
    ductGeos.push(geo)
  }
}
if (ductGeos.length) {
  g.add(new THREE.Mesh(mergeGeometries(ductGeos)!, new THREE.MeshLambertMaterial({ vertexColors: true })))
}

// ---- v13 多层：上层楼板（兼作下层天花板）/ 上层墙 / 上层天花板 / 临边栏杆 ----
if (m.floors > 1) {
  const FLOOR_H = 3.0
  const liftTiles = new Set<number>()
  for (const s of m.structures) if (s.kind === 'lift') liftTiles.add(Math.floor(s.y) * m.w + Math.floor(s.x))
  const slabGeos: THREE.BufferGeometry[] = []
  const upWallGeos: THREE.BufferGeometry[] = []
  const upCeilGeos: THREE.BufferGeometry[] = []
  const railGeos: THREE.BufferGeometry[] = []
  const wSideU = col(WALL_TINT[def.id] ?? pal.wall), wTopU = col(pal.wallTop)
  const setVC = (geo: THREE.BufferGeometry, cFn: (py: number) => THREE.Color) => {
    const pos = geo.attributes.position
    const carr = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) { const cc2 = cFn(pos.getY(i)); carr[i * 3] = cc2.r; carr[i * 3 + 1] = cc2.g; carr[i * 3 + 2] = cc2.b }
    geo.setAttribute('color', new THREE.BufferAttribute(carr, 3))
    const uv = new Float32Array(pos.count * 2)
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  }
  for (let y = RY0; y < RY1; y++) {
    for (let x = RX0; x < RX1; x++) {
      const ti = y * m.w + x
      if (m.up[ti] !== 1) continue
      if (m.stair[ti] & 7) continue // 楼梯坡道由楔形渲染
      const uwTop = m.ceiling[ti] === 1 ? H * 1.75 : FLOOR_H + 2.6
      if (m.upWall[ti] === 1) {
        // 上层墙：从楼板底下沿到上层天花板（覆盖与下层墙顶之间的缝）
        const geo = new THREE.BoxGeometry(1, uwTop - (FLOOR_H - 0.35), 1)
        geo.translate(x + 0.5, (uwTop + FLOOR_H - 0.35) / 2, y + 0.5)
        setVC(geo, (py) => py > uwTop - 0.01 ? wTopU : wSideU)
        if (wuv) worldWallUV(geo, wuv) // v16：上层墙同样世界空间 UV（setVC 清零的 uv 被覆盖）
        upWallGeos.push(geo)
        continue
      }
      if (!liftTiles.has(ti)) {
        // 上层楼板盒（顶面=上层地板 z=3.0；底面 z=2.65=下层天花板）
        const geo = new THREE.BoxGeometry(1, 0.35, 1)
        geo.translate(x + 0.5, FLOOR_H - 0.175, y + 0.5)
        const fc = ((x + y) % 2 === 0 ? fB : fA).clone().multiplyScalar(0.9 + ((x * 7 + y * 13) % 5) * 0.03)
        const fSide = fc.clone().multiplyScalar(0.45)
        setVC(geo, (py) => py > FLOOR_H - 0.01 ? fc : fSide)
        slabGeos.push(geo)
        // 上层天花板（室外上空无顶）
        if (m.outdoor[ti] !== 1) {
          const cg = new THREE.PlaneGeometry(1, 1)
          cg.rotateX(Math.PI / 2)
          cg.translate(x + 0.5, uwTop, y + 0.5)
          setVC(cg, () => cc)
          upCeilGeos.push(cg)
        }
      }
      // 临边栏杆：邻居无上层楼板且非楼梯/电梯口 → 防跌落栏杆（碰撞层同样拦截）
      const rail = (nx: number, ny: number, horiz: boolean, off: number) => {
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) return
        const ni = ny * m.w + nx
        if (m.up[ni] === 1 || (m.stair[ni] & 7) !== 0 || liftTiles.has(ni)) return
        const rg = horiz ? new THREE.BoxGeometry(1, 1.05, 0.07) : new THREE.BoxGeometry(0.07, 1.05, 1)
        rg.translate(horiz ? x + 0.5 : x + off, FLOOR_H + 0.5, horiz ? y + off : y + 0.5)
        railGeos.push(rg)
      }
      rail(x, y - 1, true, 0.035)
      rail(x, y + 1, true, 0.965)
      rail(x - 1, y, false, 0.035)
      rail(x + 1, y, false, 0.965)
    }
  }
  if (slabGeos.length) {
    g.add(new THREE.Mesh(mergeGeometries(slabGeos)!, new THREE.MeshLambertMaterial({ vertexColors: true, map: levelTexture(`l${def.id}_floor`, () => noiseTexture(pal.floor, pal.floorAlt)), emissive: col(pal.floor).multiplyScalar(0.06) })))
  }
  if (upWallGeos.length) {
    g.add(new THREE.Mesh(mergeGeometries(upWallGeos)!, new THREE.MeshLambertMaterial({ vertexColors: true, map: levelTexture(`l${def.id}_wall`, () => noiseTexture(pal.wall, pal.wallTop)), emissive: col(pal.wall).multiplyScalar(0.06) })))
  }
  if (upCeilGeos.length) {
    g.add(new THREE.Mesh(mergeGeometries(upCeilGeos)!, new THREE.MeshLambertMaterial({ vertexColors: true, map: levelTexture(`l${def.id}_ceil`, () => noiseTexture(pal.wallTop, pal.wallTop)), emissive: col(pal.wallTop).multiplyScalar(0.05) })))
  }
  if (railGeos.length) {
    g.add(new THREE.Mesh(mergeGeometries(railGeos)!, new THREE.MeshLambertMaterial({ color: '#43484f' })))
  }
}

// ---- 墙体（所有与地板相邻的非地板瓦片都生成墙，含虚空，合并；
//      v7：低洼延伸墙=底部下探到相邻最低地面；挑高/室外邻接=顶部提升）----
const wallGeos: THREE.BufferGeometry[] = []
const wallGeos2: THREE.BufferGeometry[] = []
const manilaWallGeos: THREE.BufferGeometry[] = [] // v20：马尼拉室墙面独立合并（无纹理纯色米色）
const wSide = col(WALL_TINT[def.id] ?? pal.wall), wTop = col(pal.wallTop)
const isFloor = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[y * m.w + x] === 1
for (let y = RY0; y < RY1; y++) {
  for (let x = RX0; x < RX1; x++) {
    if (m.tiles[y * m.w + x] === 1) continue
    if (!(isFloor(x + 1, y) || isFloor(x - 1, y) || isFloor(x, y + 1) || isFloor(x, y - 1) || isFloor(x + 1, y + 1) || isFloor(x - 1, y - 1) || isFloor(x + 1, y - 1) || isFloor(x - 1, y + 1))) continue
    // 相邻地板决定墙体底/顶；只邻室外地板的外墙降为 1.1m 护墙（露出天空与远景剪影）
    let base = 0, top = H
    let nearIndoor = false, nearOutdoor = false
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
      const nx = x + dx, ny = y + dy
      if (!isFloor(nx, ny)) continue
      const ni = ny * m.w + nx
      if (m.outdoor[ni] === 1) nearOutdoor = true; else nearIndoor = true
      const st = m.step[ni]
      const s2 = m.stair[ni]
      const nh = (s2 & 7) ? ((s2 >> 3) & 0x3fff) / 100
        : (st & 7) ? Math.min(ELEV_H[(st >> 3) & 3], ELEV_H[(st >> 5) & 3])
          : m.liquid[ni] === 1 ? -1.7 : m.liquid[ni] === 2 ? -0.25 : ELEV_H[m.elev[ni]]
      base = Math.min(base, nh)
      if (m.ceiling[ni] === 1 && m.outdoor[ni] !== 1) top = Math.max(top, H * 1.75)
      if (m.up[ni] === 1 && m.outdoor[ni] !== 1) top = Math.max(top, 3 + 2.6) // v13：邻上层楼板→墙体接到上层天花板
    }
    if (nearOutdoor && !nearIndoor) top = Math.min(top, 1.1) // 室外护墙/围栏
    const tnt = m.tint[y * m.w + x]
    const wSideT = tnt && TINT_WALL[tnt] ? col(TINT_WALL[tnt]) : wSide
    const wTopT = tnt && TINT_CEIL[tnt] ? col(TINT_CEIL[tnt]) : wTop
    const geo = new THREE.BoxGeometry(1, top - base, 1)
    geo.translate(x + 0.5, (top + base) / 2, y + 0.5)
    if (wuv) worldWallUV(geo, wuv) // v16：世界空间 UV，跨盒无缝
    const pos = geo.attributes.position
    const carr = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const top2 = pos.getY(i) > top - 0.01
      const c = top2 ? wTopT : wSideT
      carr[i * 3] = c.r; carr[i * 3 + 1] = c.g; carr[i * 3 + 2] = c.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(carr, 3))
    ;(tnt === 1 ? manilaWallGeos : tex2.wall && zoneB(x, y) ? wallGeos2 : wallGeos).push(geo)
  }
}
// v20：马尼拉室墙面——纯色米色材质（不叠 L0 黄墙纸纹理，保证肉眼可辨的米色系）
if (manilaWallGeos.length) {
  const manilaMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: col(TINT_WALL[1]).multiplyScalar(0.1) })
  g.add(new THREE.Mesh(mergeGeometries(manilaWallGeos)!, manilaMat))
}
if (wallGeos.length) {
  const wallMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: levelTexture(`l${def.id}_wall`, () => noiseTexture(pal.wall, pal.wallTop)), emissive: col(pal.wall).multiplyScalar(0.06) })
  g.add(new THREE.Mesh(mergeGeometries(wallGeos)!, wallMat))
}
if (wallGeos2.length) {
  const wallMat2 = new THREE.MeshLambertMaterial({ vertexColors: true, map: levelTexture(tex2.wall!, () => noiseTexture(pal.wall, pal.wallTop)), emissive: col(pal.wall).multiplyScalar(0.06) })
  g.add(new THREE.Mesh(mergeGeometries(wallGeos2)!, wallMat2))
}
}
