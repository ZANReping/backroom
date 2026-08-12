// 地形几何：地面/台阶坡道/高差接缝/天花板/风道/多层楼板/墙体（静态合并 + 顶点色）
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ELEV_H, FLOOR_H, tallCeilH, wallBaseTopAt, ceilingSteps, type GameMap } from '../world/mapgen'
import type { LevelDef } from '../core/types'
import { col, rampGeo, levelTexture, noiseTexture, OUTDOOR_FLOOR, manilaWallTexture, makeCanvasCtx, toTex, litMaterial, texLevelId } from './shared'

// v17：range 限定构建范围（无限模式按 chunk 构建；坐标读取全图，跨 chunk 接缝一致）
export interface TerrainRange { x0: number; y0: number; x1: number; y1: number; variant?: string }
// 确定性瓦片哈希噪声（替代 Math.random：同瓦片重建着色一致）
const hv = (x: number, y: number, s: number) => {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(s, 0x9e3779b9)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}
// v17：tint 着色（1=马尼拉米色墙纸 2=红室 3=熄灯区仅雾/无灯 5=维护通廊白 6=花园段青翠 7=跃金段高饱和金）
// v20：马尼拉墙面色改为确定的马尼拉文件夹暖米色 #e5c88f，且墙面走独立无纹理网格
// （顶点色 × L0 黄色墙纸纹理永远发黄——v19 的蓝通道补偿也无法把黄纸变成米色）
// v17：tint 着色（1=马尼拉米色墙纸 2=红室 3=熄灯区仅雾/无灯 5=维护通廊白 6=花园段青翠 7=跃金段高饱和金 8=民居木墙暖棕）
// v39：衔尾段施工化——10=毛坯混凝土（灰地表/铲到一半的墙/深色裸露吊顶） 11=施工补丁（地面新浇水泥/墙面残存粉刷补丁）
const TINT_FLOOR: Record<number, string> = { 1: '#c9ad74', 2: '#8a1e14', 5: '#8a887e', 6: '#5a7a44', 7: '#8a6d24', 8: '#6a5340', 9: '#787c78', 10: '#6f6f6b', 11: '#5b5b57', 12: '#463227', 13: '#3a3a38', 14: '#34302b', 15: '#3c3a2e', 16: '#5c5548', 17: '#aab2d8', 18: '#565450', 19: '#403e3a', 20: '#6e6a5e', 21: '#cfc4bc', 22: '#7a3a36', 23: '#e8f0ee', 24: '#3c3430', 25: '#6e7272', 26: '#4a5560' }
const TINT_WALL: Record<number, string> = { 1: '#e5c88f', 2: '#a82318', 5: '#b8b4a8', 6: '#8fae7a', 7: '#c99a2e', 8: '#9a7048', 9: '#c4c7c2', 10: '#8b887f', 11: '#a8a294', 12: '#6e4630', 13: '#555552', 14: '#544a40', 15: '#565244', 16: '#8f8a7c', 17: '#ccd2ee', 18: '#7d7166', 19: '#564d44', 20: '#7a7264' }
const TINT_CEIL: Record<number, string> = { 1: '#c9b185', 2: '#5e120b', 5: '#c8c4b8', 6: '#c4d9ae', 7: '#a8842a', 8: '#6a4e38', 9: '#b2b6b0', 10: '#3a3b3e', 11: '#3a3b3e', 12: '#3a2a20', 13: '#2e2e2c', 14: '#332d26', 15: '#2e2c24', 16: '#6e6a5c', 17: '#8a92c8', 18: '#8a8880', 19: '#5a5852', 20: '#5e5a50', 21: '#4a3230', 22: '#4a3632', 23: '#5a6a6c', 24: '#2e2a26', 25: '#5a5e60', 26: '#3c4650' }
// v41：12=L2 肮脏的廊道（锈橙棕）13=晦暗的廊道（积灰灰暗）14=整洁的廊道（洁净深色）
//     15=扭曲的廊道（病绿灰）16=办公走廊（L4 废弃办公室风）
// v51：18=L3 照明廊道（砖墙暖灰）19=L3 晦暗廊道（积灰暗棕）20=L3 圣所（苍白圣石；实体畏惧不入）
// v55：21=L5 走廊（红金华丽地毯，l5_carpet 贴图独立网格）22=L5 大厅/休息室/客房（暖红织毯调）
//     23=L5 游泳池（奶白青瓷砖，l5_tile 贴图独立网格）24=L5 锅炉房（深色）25=L5 维修大厅（灰金属）26=L5 健身房（现代灰蓝）
// v30：门类出口（楼梯井/未上锁的门）在墙上开门洞——渲染层几何共用名单（buildTerrain 内 holeMap 消费；
// v55d：导出供离线断言；boilerdeep = L5 锅炉房黑门嵌墙门洞）
export const DOOR_EXIT_KINDS = ['stairs', 'unlockeddoor', 'fireexit', 'officedoor', 'elevatorshaft', 'boilerdeep']
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
  101: { wall: 'l101_wall2' }, // v35：Alpha 基地（据点）
}
// v16：L0 墙纸改为**世界空间 UV**——UV 由世界坐标推导（侧面 u=x+z、v=y，顶/底面 u=x、v=z），
// 图案跨 1m 墙盒连续流动，盒间几何接缝处纹理相位无跳变、接缝不可见；
// 侧面 u 统一取 x+z：±x 面 x 恒定仅作相位偏移，转角处两面 u 在角点相等 → 图案绕角自然转折；
// v=y 使竖条纹始终竖直；per = 每米平铺次数（一图覆盖 1/per 米）。
// v16 任务3：玩家要求图案更大——一图覆盖 0.5m→1.0m（源图≈13 列条纹，列宽 3.8cm→7.7cm，
// 更接近经典后室照片近距观感）；世界空间 UV 下任意比例均无缝。
const WALL_UV_PER_M: Partial<Record<number, number>> = { 0: 1, 3: 1 } // v51：L3 砖墙同走世界 UV——贴图按实测砖周期裁剪（4 砖×12 层/重复），1 重复=1m，砖约 25×8.3cm 横砌
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
const tex2 = TEX2[texLevelId(def.id)] ?? {} // v55：贴图别名（L5 三据点沿用 l5_wall2/l5_floor2 变体区）
const wuv = WALL_UV_PER_M[def.id]
// 4×4 区块哈希分区（约 1/5 区域用变体纹理）
const zoneB = (x: number, y: number) => (((x >> 2) * 31 + (y >> 2) * 17 + def.id * 7) % 5) === 0

// ---- 地面（合并 + 顶点色 + 噪点纹理；v7：高度档分档地面 + 坡道楔形）----
const floorGeos: THREE.BufferGeometry[] = []
const floorGeos2: THREE.BufferGeometry[] = []
const marbleGeos: THREE.BufferGeometry[] = [] // v51：圣所大理石地面（tint 20，独立材质网格）
const carpetGeos: THREE.BufferGeometry[] = [] // v55：L5 走廊红金华丽地毯（tint 21，l5_carpet 贴图独立网格）
const poolTileGeos: THREE.BufferGeometry[] = [] // v55：L5 游泳池瓷砖地面（tint 23，l5_tile 贴图独立网格）
const wedgeGeos: THREE.BufferGeometry[] = [] // 台阶/坡道（双面材质）
const riserGeos: THREE.BufferGeometry[] = [] // 高差侧壁
const abyssGeos: THREE.BufferGeometry[] = [] // 深坑洞底（纯黑无光照，望不见底）
const fB = col(pal.floor), fA = col(pal.floorAlt)
// v53：L0 地板/天花板改「仅贴图」渲染——底色（pal.floor / pal.wallTop×0.55）已烘焙进
// l0_floor.jpg / l0_ceil.jpg（scripts/gen-l0-bake.py，线性空间叠乘与着色器一致）；
// 顶点色只保留调制因子（每瓦片明暗噪点 / 湿地 0.62 暗化 / tint 相对底色的折算），输出与改造前逐点一致
const bakeL0 = def.id === 0
const fBinv = new THREE.Color(1 / fB.r, 1 / fB.g, 1 / fB.b) // 地板底色倒数：tint 瓦片折算相对调制因子
const grayC = (v: number) => new THREE.Color(v, v, v)
// v50：湿地毯=地板色的暗化版（0.62）——保留「浸水变深」的辨识度但大幅收敛与干地的色差（原独立灰绿 #3a4a3a）
const wetC = fB.clone().multiplyScalar(0.62)
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
    // v54：L4 窗景区窗外虚空条带——不生成地板几何（天花板本就不画）：真虚空，只见雾灰天空
    if (isOut && def.id === 4) continue
    const tnt = m.tint[ti]
    const tBase = tnt && TINT_FLOOR[tnt] ? col(TINT_FLOOR[tnt]) : null
    // v34：L0 与 L1 天鹰段取消规律棋盘格（统一底色 + 保留随机明暗噪点）
    const flatFloor = def.id === 0 || (def.id === 1 && range?.variant === 'parking')
    const c = isWet && !isOut ? (bakeL0 ? grayC(0.62) : wetC) : isOut
      ? (isWet ? poolC : outC).clone().multiplyScalar(0.9 + hv(x, y, 1) * 0.2)
      : bakeL0 // v53：L0 仅贴图——tint 折算相对底色因子，普通瓦片只留明暗噪点
        ? (tBase ? tBase.clone().multiply(fBinv) : grayC(0.92 + hv(x, y, 2) * 0.16))
        : (tBase ?? (flatFloor || (x + y) % 2 === 0 ? fB : fA)).clone().multiplyScalar(0.92 + hv(x, y, 2) * 0.16)
    const st = m.step[ti]
    const s2 = m.stair[ti]
    if (s2 & 7) {
      // v13 楼梯坡道：任意高度连续爬升，实心到地面（侧面不穿帮）
      const lo = ((s2 >> 3) & 0x3fff) / 100, hi = ((s2 >> 17) & 0x3fff) / 100
      const dir = s2 & 7
      // v54c：高基带坡道（2F→3F，lo≥FLOOR_H）楔体底托到下层板底（FLOOR_H-0.35），不再实心到主层地面——
      // 此前 base=0：2F→3F 楼梯间在 1F 空间里是一坨实心楔体（Gemma 楼梯间串层的根因）；
      // 楔体底=2F 板底，1F 仰视只见悬空楼梯构件，不侵占了 1F 空间
      const rampBase = lo >= FLOOR_H - 0.01 ? FLOOR_H - 0.35 : 0
      // v46：同向连续坡道格的相邻侧面跳过——此前两格在接缝处各画一面全高侧墙（同面片叠色闪）；
      // 外侧与首末端的侧面保留：阶梯下方仍是平滑完整斜面 + 落地侧墙
      const stAt = (tx2: number, ty2: number) => (tx2 < 0 || ty2 < 0 || tx2 >= m.w || ty2 >= m.h ? 0 : m.stair[ty2 * m.w + tx2])
      const skip = {
        px: dir <= 2 && (stAt(x + 1, y) & 7) === dir,
        nx: dir <= 2 && (stAt(x - 1, y) & 7) === dir,
        pz: dir >= 3 && (stAt(x, y + 1) & 7) === dir,
        nz: dir >= 3 && (stAt(x, y - 1) & 7) === dir,
      }
      wedgeGeos.push(rampGeo(dir, lo, hi, x, y, c, rampBase, skip))
      // v46 真阶梯：每格坡道加三级薄踏步（顶面微凸坡面、侧缘沉入坡体——侧看是台阶轮廓，碰撞仍走平滑坡道）
      for (let k = 0; k < 3; k++) {
        const t0 = k / 3, t1 = (k + 1) / 3
        const hTop = lo + (hi - lo) * t1 + 0.015
        const hBot = Math.min(rampBase, hTop - 0.04) // v54c：高基带坡道踏步不垂到主层地面（同楔体底）
        const tread = new THREE.BoxGeometry(dir <= 2 ? t1 - t0 + 0.02 : 1, hTop - hBot, dir <= 2 ? 1 : t1 - t0 + 0.02).toNonIndexed() // 必须与 rampGeo/seamQuad 同为非索引（真实 three 索引混并 mergeGeometries 返回 null，Mesh(null) 直接抛异常——整层渲染崩）
        const tcx = dir === 1 ? x + (t0 + t1) / 2 : dir === 2 ? x + 1 - (t0 + t1) / 2 : x + 0.5
        const tcz = dir === 3 ? y + (t0 + t1) / 2 : dir === 4 ? y + 1 - (t0 + t1) / 2 : y + 0.5
        tread.translate(tcx, (hTop + hBot) / 2, tcz)
        const tn = tread.attributes.position.count
        const tcarr = new Float32Array(tn * 3)
        const topC = c.clone().multiplyScalar(0.82), sideC = c.clone().multiplyScalar(0.5) // 踏面略暗（防滑条观感）
        const tpos = tread.attributes.position
        for (let vi = 0; vi < tn; vi++) {
          const cc3 = tpos.getY(vi) > hTop - 0.001 ? topC : sideC
          tcarr[vi * 3] = cc3.r; tcarr[vi * 3 + 1] = cc3.g; tcarr[vi * 3 + 2] = cc3.b
        }
        tread.setAttribute('color', new THREE.BufferAttribute(tcarr, 3))
        wedgeGeos.push(tread)
      }
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
    // v52：L0 地板与墙壁统一走世界空间 UV（u=x、v=z，1 重复=1m）——跨瓦片连续无相位跳变；
    // 平面 rotateX(-π/2) 后默认 UV 的 v 与世界 z 反向，l0_floor.jpg 已垂直翻转补偿，视觉不变
    if (def.id === 0) worldWallUV(geo, 1)
    // v55：L5 走廊地毯/泳池瓷砖——世界空间 UV（地毯 3m 一重复=团花周期；瓷砖 2m 一重复≈12.5cm 小方砖）
    if (def.id === 5 && (tnt === 21 || tnt === 23)) worldWallUV(geo, tnt === 21 ? 1 / 3 : 0.5)
    const n = geo.attributes.position.count
    const carr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { carr[i * 3] = c.r; carr[i * 3 + 1] = c.g; carr[i * 3 + 2] = c.b }
    geo.setAttribute('color', new THREE.BufferAttribute(carr, 3))
    ;(isOut ? outFloorGeos : tnt === 20 ? marbleGeos : def.id === 5 && tnt === 21 ? carpetGeos : def.id === 5 && tnt === 23 ? poolTileGeos : tex2.floor && !isWet && zoneB(x, y) ? floorGeos2 : floorGeos).push(geo)
  }
}
if (floorGeos.length) {
  const floorMat = litMaterial({ vertexColors: true, envBase: 0.35, roughness: 0.8, map: levelTexture(`l${texLevelId(def.id)}_floor`, () => noiseTexture(pal.floor, pal.floorAlt)) })
  g.add(new THREE.Mesh(mergeGeometries(floorGeos)!, floorMat))
}
if (abyssGeos.length) {
  g.add(new THREE.Mesh(mergeGeometries(abyssGeos)!, new THREE.MeshBasicMaterial({ color: '#000000' })))
}
if (floorGeos2.length) {
  const floorMat2 = litMaterial({ vertexColors: true, envBase: 0.35, roughness: 0.8, map: levelTexture(tex2.floor!, () => noiseTexture(pal.floor, pal.floorAlt)) })
  g.add(new THREE.Mesh(mergeGeometries(floorGeos2)!, floorMat2))
}
// v51：圣所大理石地面（tint 20，l3_marble 贴图；顶点色 TINT_FLOOR[20] 叠乘保持与砖墙/环境协调）
if (marbleGeos.length) {
  const marbleMat = litMaterial({ vertexColors: true, envBase: 0.38, roughness: 0.55, map: levelTexture('l3_marble', () => noiseTexture('#c8c4bc', '#b0aca4')) })
  g.add(new THREE.Mesh(mergeGeometries(marbleGeos)!, marbleMat))
}
// v55：L5 走廊红金华丽地毯（tint 21，l5_carpet 贴图；3m 团花周期世界 UV）+ 泳池瓷砖（tint 23，l5_tile 贴图）
if (carpetGeos.length) {
  const carpetMat = litMaterial({ vertexColors: true, envBase: 0.36, roughness: 0.92, map: levelTexture('l5_carpet.png', () => noiseTexture('#7a2a2e', '#5e1f24')) })
  g.add(new THREE.Mesh(mergeGeometries(carpetGeos)!, carpetMat))
}
if (poolTileGeos.length) {
  const poolTileMat = litMaterial({ vertexColors: true, envBase: 0.4, roughness: 0.35, map: levelTexture('l5_tile.png', () => noiseTexture('#d0dcda', '#b8c4c2')) })
  g.add(new THREE.Mesh(mergeGeometries(poolTileGeos)!, poolTileMat))
}
// v12：室外地面材质——较高自发光模拟夜空环境光（月光/城市光污染），
// 保证黑暗层级中室外地板始终可辨，不再被误认成虚空；不受雾影响程度与室内一致。
if (outFloorGeos.length) {
  const outFloorMat = litMaterial({
    vertexColors: true, envBase: 0.45, roughness: 0.7,
    map: levelTexture(`l${texLevelId(def.id)}_floor`, () => noiseTexture(pal.floor, pal.floorAlt)),
    emissive: outC.clone().multiplyScalar(0.38),
  })
  g.add(new THREE.Mesh(mergeGeometries(outFloorGeos)!, outFloorMat))
}
// 高差侧壁/接缝裙边：相邻地板瓦片（含坡道）共享边逐角比较高度，
// 任一角高差 >0.01 即生成封闭立面（低洼沟壁/高台壁/坡道侧边三角缝，消除地板洞）
const riserC = col(pal.wall).multiplyScalar(0.55)
if (bakeL0) riserC.multiply(fBinv) // v53：高差侧壁走（已烘焙底色的）地板贴图——折算相对因子，保持原 tex×wall×0.55 输出
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
    const slopeMat = litMaterial({ vertexColors: true, side: THREE.DoubleSide, map: levelTexture(`l${texLevelId(def.id)}_floor`, () => noiseTexture(pal.floor, pal.floorAlt)) })
    g.add(new THREE.Mesh(mergeGeometries(slopeGeos)!, slopeMat))
  }
}

// ---- 天花板（v7：室外无天花板；挑高区域层高提升）----
const ceilGeos: THREE.BufferGeometry[] = []
const cc = col(pal.wallTop).multiplyScalar(0.55)
const ccInv = new THREE.Color(1 / cc.r, 1 / cc.g, 1 / cc.b) // v53：L0 天花板烘焙底色（cc）倒数——tint 瓦片折算相对调制因子
for (let y = RY0; y < RY1; y++) {
  for (let x = RX0; x < RX1; x++) {
    const ti = y * m.w + x
    if (m.tiles[ti] !== 1 || m.outdoor[ti] === 1) continue
    if (m.up[ti] === 1 || m.up2[ti] === 1) continue // 上层楼板底面即本层天花板（楼板盒自带底面）；v54c：3F 板可独立于 2F 存在（多层解耦——任意上层板/屋面板墙兜底当天花）
    const ch = m.ceiling[ti] === 1 ? tallCeilH(m, H) : H // v46：多层挑高与上层天花拉平（消除漂浮错层）
    const tnt = m.tint[ti]
    // v53：L0 仅贴图——普通瓦片纯白（底色已烘焙进 l0_ceil.jpg），tint 瓦片折算相对底色因子
    const ccTile = tnt && TINT_CEIL[tnt]
      ? (bakeL0 ? col(TINT_CEIL[tnt]).multiplyScalar(0.85).multiply(ccInv) : col(TINT_CEIL[tnt]).multiplyScalar(0.85))
      : (bakeL0 ? grayC(1) : cc)
    const geo = new THREE.PlaneGeometry(1, 1)
    geo.rotateX(Math.PI / 2)
    geo.translate(x + 0.5, ch, y + 0.5)
    // v52：L0 天花板同走世界空间 UV（rotateX(+π/2) 后默认 UV 本就和 u=x、v=z 一致，贴图无需调整）
    if (def.id === 0) worldWallUV(geo, 1)
    const n = geo.attributes.position.count
    const carr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { carr[i * 3] = ccTile.r; carr[i * 3 + 1] = ccTile.g; carr[i * 3 + 2] = ccTile.b }
    geo.setAttribute('color', new THREE.BufferAttribute(carr, 3))
    ceilGeos.push(geo)
  }
}
if (ceilGeos.length) {
  // v53：L0 天花板离线回退改用烘焙底色等效色（wallTop×0.55 线性折算 #685c25），避免回退态过亮
  const ceilMat = litMaterial({ vertexColors: true, map: levelTexture(`l${texLevelId(def.id)}_ceil`, bakeL0 ? () => noiseTexture('#685c25', '#685c25') : () => noiseTexture(pal.wallTop, pal.wallTop)) })
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
  g.add(new THREE.Mesh(mergeGeometries(ductGeos)!, litMaterial({ vertexColors: true })))
}

// ---- v13 多层：上层楼板（兼作下层天花板）/ 上层墙 / 上层天花板 / 临边栏杆 ----
// v54：三层泛化——逐楼层带 f=1..floors-1 绘制（f=1 用 up/upWall，f=2 用 up2/upWall2）：
// 板顶=f×FLOOR_H、板底=f×FLOOR_H-0.35（=下一层天花）；本层天花在更上层楼板存在时不另画（上层板底担当）；
// 坡道格只在不穿破本层顶（stairHi≤板顶）时画本层天花——2F→3F 坡道段上方留井，由上一层顶封。
if (m.floors > 1) {
  const liftTiles = new Set<number>()
  for (const s of m.structures) if (s.kind === 'lift') liftTiles.add(Math.floor(s.y) * m.w + Math.floor(s.x))
  const slabGeos: THREE.BufferGeometry[] = []
  const slabBotGeos: THREE.BufferGeometry[] = [] // v46：楼板底面独立几何（统一吊顶贴图，不随地板纹理）
  const upWallGeos: THREE.BufferGeometry[] = []
  const upCeilGeos: THREE.BufferGeometry[] = []
  const railGeos: THREE.BufferGeometry[] = []
  const wSideU = col(WALL_TINT[def.id] ?? pal.wall), wTopU = col(pal.wallTop)
  // v54：踢脚线白名单（同主层墙循环）——上层墙踢脚线只对 L0/L5 与据点多层生效（L4 不变）；v55c：L5 三据点（110/111/112）同享
  const SKIRT = def.id === 0 || def.id === 5 || def.id === 110 || def.id === 111 || def.id === 112 || def.id === 101 || def.id === 102 || def.id === 103 || def.id === 104 || def.id === 105 || def.id === 106 || def.id === 109
  // v46：只写顶点色、保留原 UV（楼板底面需要盒面原 UV 平铺吊顶贴图）
  const setVCKeepUV = (geo: THREE.BufferGeometry, cFn: (py: number) => THREE.Color) => {
    const pos = geo.attributes.position
    const carr = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) { const cc2 = cFn(pos.getY(i)); carr[i * 3] = cc2.r; carr[i * 3 + 1] = cc2.g; carr[i * 3 + 2] = cc2.b }
    geo.setAttribute('color', new THREE.BufferAttribute(carr, 3))
  }
  // v46：把楼板盒按面法线拆成「非底面」与「底面」两份（底面独立走吊顶贴图网格）
  const splitSlabBottom = (geo: THREE.BufferGeometry): [THREE.BufferGeometry | null, THREE.BufferGeometry | null] => {
    const pos = geo.attributes.position, uv = geo.attributes.uv
    const rest: number[] = [], restUV: number[] = [], bot: number[] = [], botUV: number[] = []
    const a = new THREE.Vector3(), b2 = new THREE.Vector3(), c3 = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3()
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i); b2.fromBufferAttribute(pos, i + 1); c3.fromBufferAttribute(pos, i + 2)
      n.copy(e1.subVectors(b2, a).cross(e2.subVectors(c3, a)))
      const isBot = n.y < -0.5
      const P = isBot ? bot : rest, U = isBot ? botUV : restUV
      for (const v of [a, b2, c3]) P.push(v.x, v.y, v.z)
      for (let k = 0; k < 3; k++) U.push(uv.getX(i + k), uv.getY(i + k))
    }
    const mk = (P: number[], U: number[]): THREE.BufferGeometry | null => {
      if (!P.length) return null
      const g2 = new THREE.BufferGeometry()
      g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3))
      g2.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(U), 2))
      g2.computeVertexNormals()
      return g2
    }
    return [mk(rest, restUV), mk(bot, botUV)]
  }
  for (let f = 1; f < m.floors; f++) { // v54：逐楼层带
    const upA = f === 1 ? m.up : m.up2
    const upWA = f === 1 ? m.upWall : m.upWall2
    const upNext = f + 1 < m.floors ? m.up2 : null // 更上层楼板数组（仅 f=1 且三层时=up2；顶层=null）
    const slabTop = f * FLOOR_H
    for (let y = RY0; y < RY1; y++) {
      for (let x = RX0; x < RX1; x++) {
        const ti = y * m.w + x
        if (upA[ti] !== 1) continue
        const uwTop = m.ceiling[ti] === 1 ? tallCeilH(m, H) : slabTop + 2.6 // v46：挑高与上层天花拉平
        const s2 = m.stair[ti]
        if (s2 & 7) {
          // v46：楼梯坡道格——坡道由楔形渲染（无楼板盒/栏杆），但楼梯口正上方的上层天花板仍要画
          // （此前直接跳过：从一层沿楼梯往上看是贯穿到虚空的黑洞——真多层不该有这层洞）
          // v54：坡道穿破本层顶（stairHi>板顶）时不画——井道贯通到上一层；上方有更层楼板时也不画（板底担当）
          const sHi = ((s2 >> 17) & 0x3fff) / 100
          if (m.outdoor[ti] !== 1 && sHi <= slabTop + 0.01 && !(upNext && upNext[ti] === 1)) {
            const cg = new THREE.PlaneGeometry(1, 1)
            cg.rotateX(Math.PI / 2)
            cg.translate(x + 0.5, uwTop, y + 0.5)
            setVCKeepUV(cg, () => cc) // v54：保留平面 UV（setVC 清零会让上层天花贴图只采样单个纹素）
            upCeilGeos.push(cg)
          } else if (f === 1 && m.floors >= 3 && m.outdoor[ti] !== 1 && m.up2[ti] !== 1 && sHi > slabTop + 0.01 && sHi <= 2 * FLOOR_H + 0.01) {
            // v54e：三层图井道上空封口——2F→3F 坡道下段（up2=0、坡顶破 2F 顶）上方补顶板
            // （Gamma B 井：2F 平台/坡道上抬头原是镂空黑洞；uwTop 随 ceiling=1 挑高标记取屋面 8.6）
            const cg = new THREE.PlaneGeometry(1, 1)
            cg.rotateX(Math.PI / 2)
            cg.translate(x + 0.5, uwTop, y + 0.5)
            setVCKeepUV(cg, () => cc)
            upCeilGeos.push(cg)
          }
          continue
        }
        if (upWA[ti] === 1) {
          // 上层墙：从楼板底下沿到本层天花板（覆盖与下层墙顶之间的缝）；
          // v54：上方有更层楼板/墙时墙顶接到更上层板底（2F/3F 对位隔墙无错层缝）
          const wTop = upNext && upNext[ti] === 1 ? slabTop + FLOOR_H - 0.35 : uwTop
          const geo = new THREE.BoxGeometry(1, wTop - (slabTop - 0.35), 1)
          geo.translate(x + 0.5, (wTop + slabTop - 0.35) / 2, y + 0.5)
          // v54 纹理修复：保留 UV + 全层级世界空间 UV（此前 setVC 清零 UV，仅 L0/L3 靠 wuv 恢复——
          // 其余多层层级[105/106/L4/L5/L274]上层墙 UV 全零，贴图只采样单个纹素=无纹理）
          setVCKeepUV(geo, (py) => py > wTop - 0.01 ? wTopU : wSideU)
          worldWallUV(geo, 1)
          upWallGeos.push(geo)
          // v54c：上层墙格的下层天花面——墙盒底面是墙贴图（低层天花上显出与墙位对应的异色斑），
          // 用吊顶贴图薄片盖在墙盒底下沿（-4mm 防共面闪；slabBotGeos=统一吊顶贴图）
          if (m.outdoor[ti] !== 1) {
            const cb = new THREE.PlaneGeometry(1, 1).toNonIndexed() // 非索引——slabBotGeos 里 splitSlabBottom 产物无索引，混并 mergeGeometries 返回 null
            cb.rotateX(Math.PI / 2)
            cb.translate(x + 0.5, slabTop - 0.354, y + 0.5)
            setVCKeepUV(cb, () => cc)
            slabBotGeos.push(cb)
          }
          // v54：上层踢脚线——贴本层地板边（slabTop）、面向本层房间的侧面；楼梯口/栏杆边缘不加
          if (SKIRT) {
            const bb2 = wSideU.clone().multiplyScalar(0.45)
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
              const nx = x + dx, ny = y + dy
              if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue
              const ni = ny * m.w + nx
              if (upA[ni] !== 1 || upWA[ni] === 1 || (m.stair[ni] & 7) !== 0) continue
              const bd = 0.05, bw = 0.16
              const bg = dx !== 0 ? new THREE.BoxGeometry(bd, bw, 1) : new THREE.BoxGeometry(1, bw, bd)
              bg.translate(x + 0.5 + dx * 0.5, slabTop + bw / 2, y + 0.5 + dy * 0.5)
              const pos2 = bg.attributes.position
              const carr2 = new Float32Array(pos2.count * 3)
              for (let i = 0; i < pos2.count; i++) { carr2[i * 3] = bb2.r; carr2[i * 3 + 1] = bb2.g; carr2[i * 3 + 2] = bb2.b }
              bg.setAttribute('color', new THREE.BufferAttribute(carr2, 3))
              upWallGeos.push(bg)
            }
          }
          continue
        }
        if (!liftTiles.has(ti)) {
          // 上层楼板盒（顶面=本层地板 f×FLOOR_H；底面=下一层天花板 f×FLOOR_H-0.35）
          const geo = new THREE.BoxGeometry(1, 0.35, 1).toNonIndexed()
          geo.translate(x + 0.5, slabTop - 0.175, y + 0.5)
          const fc = ((x + y) % 2 === 0 ? fB : fA).clone().multiplyScalar(0.9 + ((x * 7 + y * 13) % 5) * 0.03)
          const fSide = fc.clone().multiplyScalar(0.45)
          // v46：底面拆出独立几何——统一吊顶贴图（l{id}_ceil），不再随地板贴图（此前底面即地板纹理，
          // 从一层抬头看楼板底像「地板铺在天上」）
          const [rest, bot] = splitSlabBottom(geo)
          if (rest) { setVCKeepUV(rest, (py) => py > slabTop - 0.01 ? fc : fSide); slabGeos.push(rest) }
          if (bot) { setVCKeepUV(bot, () => cc); slabBotGeos.push(bot) }
          // 上层天花板（室外上空无顶；v54：上方有更层楼板时不画——板底即本层天花）
          if (m.outdoor[ti] !== 1 && !(upNext && upNext[ti] === 1)) {
            const cg = new THREE.PlaneGeometry(1, 1)
            cg.rotateX(Math.PI / 2)
            cg.translate(x + 0.5, uwTop, y + 0.5)
            setVCKeepUV(cg, () => cc) // v54：保留平面 UV（同楼梯口天花）
            upCeilGeos.push(cg)
          }
        }
        // 临边栏杆：邻居无本层楼板且非楼梯/电梯口 → 防跌落栏杆（碰撞层同样拦截）
        const rail = (nx: number, ny: number, horiz: boolean, off: number) => {
          if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) return
          const ni = ny * m.w + nx
          if (upA[ni] === 1 || (m.stair[ni] & 7) !== 0 || liftTiles.has(ni)) return
          const rg = horiz ? new THREE.BoxGeometry(1, 1.05, 0.07) : new THREE.BoxGeometry(0.07, 1.05, 1)
          rg.translate(horiz ? x + 0.5 : x + off, slabTop + 0.5, horiz ? y + off : y + 0.5)
          railGeos.push(rg)
        }
        rail(x, y - 1, true, 0.035)
        rail(x, y + 1, true, 0.965)
        rail(x - 1, y, false, 0.035)
        rail(x + 1, y, false, 0.965)
      }
    }
  }
  if (slabGeos.length) {
    // v53：EL3A(105) 夹楼板上表面=二层办公区地板 → 专用办公地毯贴图 l105_upfloor；其他多层层级不变
    g.add(new THREE.Mesh(mergeGeometries(slabGeos)!, litMaterial({ vertexColors: true, map: levelTexture(def.id === 105 ? 'l105_upfloor' : `l${texLevelId(def.id)}_floor`, () => noiseTexture(pal.floor, pal.floorAlt)) })))
  }
  if (slabBotGeos.length) {
    // v46：楼板底面=一层天花（2.65）——独立统一吊顶贴图（与挑高/普通天花同族，不随地板纹理变化）
    g.add(new THREE.Mesh(mergeGeometries(slabBotGeos)!, litMaterial({ vertexColors: true, map: levelTexture(`l${texLevelId(def.id)}_ceil`, () => noiseTexture(pal.wallTop, pal.wallTop)) })))
  }
  if (upWallGeos.length) {
    // v53：EL3A(105) 二层隔墙 → 专用办公粉刷贴图 l105_upwall；其他多层层级不变
    g.add(new THREE.Mesh(mergeGeometries(upWallGeos)!, litMaterial({ vertexColors: true, map: levelTexture(def.id === 105 ? 'l105_upwall' : `l${texLevelId(def.id)}_wall`, () => noiseTexture(pal.wall, pal.wallTop)) })))
  }
  if (upCeilGeos.length) {
    // v53：EL3A(105) 二层天花 → 专用办公吊顶贴图 l105_upceil；其他多层层级不变
    g.add(new THREE.Mesh(mergeGeometries(upCeilGeos)!, litMaterial({ vertexColors: true, map: levelTexture(def.id === 105 ? 'l105_upceil' : `l${texLevelId(def.id)}_ceil`, () => noiseTexture(pal.wallTop, pal.wallTop)) })))
  }
  if (railGeos.length) {
    g.add(new THREE.Mesh(mergeGeometries(railGeos)!, litMaterial({ color: '#43484f' })))
  }
}

// ---- 墙体（所有与地板相邻的非地板瓦片都生成墙，含虚空，合并；
//      v7：低洼延伸墙=底部下探到相邻最低地面；挑高/室外邻接=顶部提升）----
const wallGeos: THREE.BufferGeometry[] = []
const wallGeos2: THREE.BufferGeometry[] = []
const manilaWallGeos: THREE.BufferGeometry[] = [] // v20/v26：马尼拉室墙面独立合并（米色竖纹墙纸，与世界 UV 对齐）
const wSide = col(WALL_TINT[def.id] ?? pal.wall), wTop = col(pal.wallTop)
const isFloor = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[y * m.w + x] === 1
// v30：门类出口（楼梯井/未上锁的门）在墙上开门洞——记录墙格 → 门洞朝向（优先级同渲染层 orientDoor）
// v41：L2 消防出口/办公走廊尽头同走门洞通道
const holeMap = new Map<number, number>() // 墙格 index → 门洞朝向（0=+x 1=-x 2=+y 3=-y，指向出口格）
for (const e of m.exits ?? []) {
  if (!DOOR_EXIT_KINDS.includes(e.def.kind)) continue
  // v54c：L4 电梯壁龛背面封死——不在背面墙格开门洞（否则从房内能看见壁龛里的电梯门透出）；
  // v54：L5 主厅电梯壁龛同构造（门洞格雕开 + 房内背面格回砌成墙）——同样豁免
  if ((def.id === 4 || def.id === 5) && e.def.kind === 'elevatorshaft') continue
  const ex = Math.floor(e.x), ey = Math.floor(e.y)
  const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
  for (let s = 0; s < 4; s++) {
    const [wx, wy] = sides[s]
    const hx = ex + wx, hy = ey + wy
    if (hx < 0 || hy < 0 || hx >= m.w || hy >= m.h) continue
    if (m.tiles[hy * m.w + hx] === 1) continue
    holeMap.set(hy * m.w + hx, s)
    break
  }
}
for (let y = RY0; y < RY1; y++) {
  for (let x = RX0; x < RX1; x++) {
    // 墙体底/顶（v49 起由 mapgen.wallBaseTopAt 统一计算——相邻地板决定：低洼下探 / 邻挑高→挑高顶 /
    // 邻上层楼板→上层天花；只邻室外地板的外墙降为 1.1m 护墙，露出天空与远景剪影）
    const bt = wallBaseTopAt(m, x, y, H)
    if (!bt) continue
    const base = bt.base, top = bt.top
    const tnt = m.tint[y * m.w + x]
    const wSideT = tnt && TINT_WALL[tnt] ? col(TINT_WALL[tnt]) : wSide
    const wTopT = tnt && TINT_CEIL[tnt] ? col(TINT_CEIL[tnt]) : wTop
    const pushWallGeo = (geo: THREE.BoxGeometry) => {
      if (tnt === 1) worldWallUV(geo, 1) // v26：马尼拉墙纸恒定世界空间 UV（任意层级生效，不依赖 L0 的 wuv 开关）
      else if (wuv) worldWallUV(geo, wuv) // v16：世界空间 UV，跨盒无缝
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
    const holeSide = holeMap.get(y * m.w + x)
    if (holeSide !== undefined) {
      // v30：门洞墙——两侧窄柱 + 门楣（门洞宽 0.84m 高 2.3m，出口内腔模型嵌在洞中，从外往里看镂空）
      const OW = 0.84, OH = 2.3, mg = (1 - OW) / 2
      if (holeSide <= 1) { // 门洞开在 ±x 面：沿 z 向分两侧
        for (const zs of [-1, 1]) {
          const g2 = new THREE.BoxGeometry(1, top - base, mg)
          g2.translate(x + 0.5, (top + base) / 2, y + 0.5 + zs * (OW / 2 + mg / 2))
          pushWallGeo(g2)
        }
      } else { // 门洞开在 ±y 面：沿 x 向分两侧
        for (const xs of [-1, 1]) {
          const g2 = new THREE.BoxGeometry(mg, top - base, 1)
          g2.translate(x + 0.5 + xs * (OW / 2 + mg / 2), (top + base) / 2, y + 0.5)
          pushWallGeo(g2)
        }
      }
      const gl = new THREE.BoxGeometry(1, top - (base + OH), 1) // 门楣（门洞上方封口）
      gl.translate(x + 0.5, (top + base + OH) / 2, y + 0.5)
      pushWallGeo(gl)
      continue
    }
    const geo = new THREE.BoxGeometry(1, top - base, 1)
    geo.translate(x + 0.5, (top + base) / 2, y + 0.5)
    pushWallGeo(geo)
    // v35：踢脚线（L0 与据点墙面：墙根深色饰条，门洞墙不加；v46：EL3A 加入；v53b：Gamma 基地加入；v55：L5 酒店加入；v55c：L5 三据点 110/111/112 同享）
    if (def.id === 0 || def.id === 5 || def.id === 110 || def.id === 111 || def.id === 112 || def.id === 101 || def.id === 102 || def.id === 103 || def.id === 104 || def.id === 105 || def.id === 106 || def.id === 109) {
      const bb = wSideT.clone().multiplyScalar(def.id === 0 ? 0.62 : 0.45) // v50：L0 踢脚线提亮（0.45→0.62）
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (!isFloor(x + dx, y + dy)) continue
        const bd = 0.05, bw = 0.16
        const bg = dx !== 0
          ? new THREE.BoxGeometry(bd, bw, 1)
          : new THREE.BoxGeometry(1, bw, bd)
        bg.translate(x + 0.5 + dx * 0.5, base + bw / 2, y + 0.5 + dy * 0.5)
        const pos2 = bg.attributes.position
        const carr2 = new Float32Array(pos2.count * 3)
        for (let i = 0; i < pos2.count; i++) { carr2[i * 3] = bb.r; carr2[i * 3 + 1] = bb.g; carr2[i * 3 + 2] = bb.b }
        bg.setAttribute('color', new THREE.BufferAttribute(carr2, 3))
        ;(tex2.wall && zoneB(x, y) ? wallGeos2 : wallGeos).push(bg)
      }
      // v54：多层——地面起算的高墙在上层楼板贴墙处补踢脚线（邻格有该层楼板且非上层墙/坡道）；
      // 此前踢脚线只按主层 tiles 判定，2F/3F 地板边的墙面上没有任何饰条
      for (let f = 1; f < (m.floors ?? 1); f++) {        const upA = f === 1 ? m.up : m.up2, upWA = f === 1 ? m.upWall : m.upWall2
        // v54c 串层修复：该墙格须真的延伸到本层——本格有上层墙（upWA，其饰条由上层墙循环负责，跳过防重）
        // 或本墙顶确实达到本层（结构墙穿板，top ≥ f×FLOOR_H）；否则 1F 墙的饰条会浮在挑空/无墙处
        if (upWA[y * m.w + x] === 1 || top < f * FLOOR_H + 0.05) continue
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue
          const ni = ny * m.w + nx
          if (upA[ni] !== 1 || upWA[ni] === 1 || (m.stair[ni] & 7) !== 0) continue // 楼梯口/栏杆边缘不加
          const bd = 0.05, bw = 0.16
          const bg = dx !== 0
            ? new THREE.BoxGeometry(bd, bw, 1)
            : new THREE.BoxGeometry(1, bw, bd)
          bg.translate(x + 0.5 + dx * 0.5, f * FLOOR_H + bw / 2, y + 0.5 + dy * 0.5)
          const pos2 = bg.attributes.position
          const carr2 = new Float32Array(pos2.count * 3)
          for (let i = 0; i < pos2.count; i++) { carr2[i * 3] = bb.r; carr2[i * 3 + 1] = bb.g; carr2[i * 3 + 2] = bb.b }
          bg.setAttribute('color', new THREE.BufferAttribute(carr2, 3))
          ;(tex2.wall && zoneB(x, y) ? wallGeos2 : wallGeos).push(bg)
        }
      }
    }
    // v55：L5 酒店墙裙分色——奶白下板（踢脚线上方至 0.85m，贴墙面）+ 金色腰线（0.85~0.92m 微凸）
    // （防 z-fight：墙裙板凸出墙面 5mm、腰线凸出 2cm——几何与墙面微错开，交汇处不闪；
    // v55c：texLevelId 别名判定——L5 三据点（110/111/112）与主层级同款墙裙腰线）
    if (texLevelId(def.id) === 5) {
      const wainsC = col('#e2d6bc'), railC = col('#b8924a')
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (!isFloor(x + dx, y + dy)) continue
        const wb = dx !== 0 ? new THREE.BoxGeometry(0.03, 0.69, 1) : new THREE.BoxGeometry(1, 0.69, 0.03)
        wb.translate(x + 0.5 + dx * 0.49, base + 0.16 + 0.345, y + 0.5 + dy * 0.49)
        const wp = wb.attributes.position
        const wc = new Float32Array(wp.count * 3)
        for (let i = 0; i < wp.count; i++) { wc[i * 3] = wainsC.r; wc[i * 3 + 1] = wainsC.g; wc[i * 3 + 2] = wainsC.b }
        wb.setAttribute('color', new THREE.BufferAttribute(wc, 3))
        wallGeos.push(wb)
        const rb = dx !== 0 ? new THREE.BoxGeometry(0.05, 0.07, 1) : new THREE.BoxGeometry(1, 0.07, 0.05)
        rb.translate(x + 0.5 + dx * 0.495, base + 0.885, y + 0.5 + dy * 0.495)
        const rp = rb.attributes.position
        const rc2 = new Float32Array(rp.count * 3)
        for (let i = 0; i < rp.count; i++) { rc2[i * 3] = railC.r; rc2[i * 3 + 1] = railC.g; rc2[i * 3 + 2] = railC.b }
        rb.setAttribute('color', new THREE.BufferAttribute(rc2, 3))
        wallGeos.push(rb)
      }
    }
    // v38：希波克拉底 - 1 墙面扶手带（仅 103——医院走廊参考图：腰高主扶手带[白-蓝-白三层，
    // 蓝色微凸出墙面] + 下方辅助细条[同蓝白]；与踢脚线同处追加，门洞墙随上方 continue 跳过）
    if (def.id === 103) {
      const HR_W = col('#f2f2f4'), HR_B = col('#3a6ab0')
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (!isFloor(x + dx, y + dy)) continue
        // 主扶手带 y 0.86~0.96（白 0.86-0.88 / 蓝 0.88-0.94 凸出 0.06m / 白 0.94-0.96）+ 辅助细条 y≈0.30
        const strips: [number, number, number, THREE.Color][] = [
          [0.86, 0.02, 0.03, HR_W], [0.88, 0.06, 0.06, HR_B], [0.94, 0.02, 0.03, HR_W], // 主扶手带
          [0.28, 0.015, 0.025, HR_W], [0.295, 0.03, 0.045, HR_B], [0.325, 0.015, 0.025, HR_W], // 辅助细条
        ]
        for (const [sy, sh, dep, cc] of strips) {
          const sg = dx !== 0
            ? new THREE.BoxGeometry(dep, sh, 1)
            : new THREE.BoxGeometry(1, sh, dep)
          sg.translate(x + 0.5 + dx * (0.5 + dep / 2 - 0.025), base + sy + sh / 2, y + 0.5 + dy * (0.5 + dep / 2 - 0.025))
          const pos3 = sg.attributes.position
          const carr3 = new Float32Array(pos3.count * 3)
          for (let i = 0; i < pos3.count; i++) { carr3[i * 3] = cc.r; carr3[i * 3 + 1] = cc.g; carr3[i * 3 + 2] = cc.b }
          sg.setAttribute('color', new THREE.BufferAttribute(carr3, 3))
          ;(tex2.wall && zoneB(x, y) ? wallGeos2 : wallGeos).push(sg)
        }
      }
    }
  }
}
// ---- v49 檐口填墙：低顶地板与挑高（ceiling=1）地板直接相邻的边界（廊口/门廊口——低层屋顶
//      到挑高顶之间原本是虚空，从挑高侧能看见低顶房间/走廊屋顶上方的黑洞），
//      在分界线上从低顶到挑高顶填一段薄墙（墙色/墙贴图，并入墙体合并网格；全层级通用规则）----
for (const cs of ceilingSteps(m, H)) {
  if (cs.x < RX0 || cs.x >= RX1 || cs.y < RY0 || cs.y >= RY1) continue // 无限模式按 chunk 过滤（低顶格归属块）
  const t = 0.14 // 薄墙厚（跨分界线，两侧各探 0.07 防缝）
  const vert = cs.dir === 1 || cs.dir === 3 // 挑高侧在东/西 → 墙沿 z 向
  const geo = new THREE.BoxGeometry(vert ? t : 1.02, cs.hi - cs.lo, vert ? 1.02 : t)
  const ex = cs.x + 0.5 + (cs.dir === 1 ? 0.5 : cs.dir === 3 ? -0.5 : 0)
  const ez = cs.y + 0.5 + (cs.dir === 2 ? 0.5 : cs.dir === 0 ? -0.5 : 0)
  geo.translate(ex, (cs.lo + cs.hi) / 2, ez)
  const pos = geo.attributes.position
  const carr = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const c = pos.getY(i) > cs.hi - 0.01 ? wTop : wSide
    carr[i * 3] = c.r; carr[i * 3 + 1] = c.g; carr[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(carr, 3))
  ;(tex2.wall && zoneB(cs.x, cs.y) ? wallGeos2 : wallGeos).push(geo)
}
// v26：马尼拉室墙面——v29 起换用真实米色锦缎墙纸贴图（public/textures/manila_wallpaper.png，
// 加载失败回退程序化米色竖纹）。贴图本身已是马尼拉文件夹暖米色 → 不再叠乘顶点色；
// repeat 0.67：1 个图案循环 ≈1.5m（单个菱形纹样 ≈30cm，与真实墙纸比例一致）
if (manilaWallGeos.length) {
  const manilaTex = levelTexture('manila_wallpaper.png', manilaWallTexture)
  manilaTex.repeat.set(0.67, 0.67)
  const manilaMat = litMaterial({ map: manilaTex })
  g.add(new THREE.Mesh(mergeGeometries(manilaWallGeos)!, manilaMat))
}
if (wallGeos.length) {
  const wallMat = litMaterial({ vertexColors: true, map: levelTexture(`l${texLevelId(def.id)}_wall`, () => noiseTexture(pal.wall, pal.wallTop)) })
  g.add(new THREE.Mesh(mergeGeometries(wallGeos)!, wallMat))
}
if (wallGeos2.length) {
  const wallMat2 = litMaterial({ vertexColors: true, map: levelTexture(tex2.wall!, () => noiseTexture(pal.wall, pal.wallTop)) })
  g.add(new THREE.Mesh(mergeGeometries(wallGeos2)!, wallMat2))
}
// ---- v31：花园段（tint=6）立体草地——每瓦片 2 丛交叉面片草叶（程序纹理 + alphaTest 剪裁），
// 确定性哈希散布（同瓦片重建位置一致），铺满整个地面 ----
{
  const grassGeos: THREE.BufferGeometry[] = []
  for (let y = RY0; y < RY1; y++)
    for (let x = RX0; x < RX1; x++) {
      const ti = y * m.w + x
      if (m.tiles[ti] !== 1 || m.tint[ti] !== 6) continue
      for (let k = 0; k < 2; k++) {
        const px = x + 0.2 + hv(x, y, 11 + k) * 0.6
        const pz = y + 0.2 + hv(x, y, 21 + k) * 0.6
        const gh = 0.26 + hv(x, y, 31 + k) * 0.22
        const gw = 0.4 + hv(x, y, 41 + k) * 0.2
        const yaw = hv(x, y, 51 + k) * Math.PI
        for (const a of [yaw, yaw + Math.PI / 2]) {
          const gq = new THREE.PlaneGeometry(gw, gh)
          gq.rotateY(a)
          gq.translate(px, ELEV_H[m.elev[ti]] + gh / 2, pz)
          grassGeos.push(gq)
        }
      }
    }
  if (grassGeos.length) {
    g.add(new THREE.Mesh(mergeGeometries(grassGeos)!, litMaterial({
      map: grassTexture(), alphaTest: 0.35, side: THREE.DoubleSide, color: '#7fae5a',
    })))
  }
}
}

// 草叶程序纹理：透明底 + 带渐变的弯曲草茎笔触（alphaTest 剪出草形；levelTexture 全局缓存）
function grassTexture(): THREE.Texture {
  return levelTexture('grass_tuft_v1.png', () => {
    const [cv, c] = makeCanvasCtx(64, 64)
    c.clearRect(0, 0, 64, 64)
    let s = 7
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
    for (let i = 0; i < 26; i++) {
      const x0 = 4 + rnd() * 56, w = 1.5 + rnd() * 2, h = 30 + rnd() * 34, lean = (rnd() - 0.5) * 14
      const grad = c.createLinearGradient(0, 64, 0, 64 - h)
      grad.addColorStop(0, '#3f6b2a')
      grad.addColorStop(1, '#8fc464')
      c.strokeStyle = grad
      c.lineWidth = w
      c.beginPath()
      c.moveTo(x0, 64)
      c.quadraticCurveTo(x0 + lean * 0.4, 64 - h * 0.6, x0 + lean, 64 - h)
      c.stroke()
    }
    return toTex(cv)
  })
}
