// 玩家移动与碰撞（v5 自 engine 抽离，纯逻辑、可无头测试）
// 修复「行走卡顿/回退」的三个要点：
// 1) 固定子步积分（FIXED_STEP accumulator）：高低帧率下每帧位移一致，
//    避免低帧率大步长穿墙后被碰撞系统弹回造成的「位置回退」。
// 2) 轴分离 AABB 碰撞：x/y 分量独立解算，贴墙移动时自然沿墙滑动，不会整段位移被丢弃。
// 3) 碰撞检测与移动在同一子步内完成（先移动→立即解算→再下一子步），顺序确定、无跨帧不同步。
// v7：z 轴高度系统——canOccupy 增加 z/crouch 选项：
//   - 高差 > STEP_UP(0.65m) 的瓦片不可直接踏上（跳跃滞空时 p.z 抬高后可通过）；
//   - 蹲伏低通道（crawl=1）未蹲伏不可进入。
import { l11MapSpace, caveVolumeFieldAt, floorHeight, structBlocksCircle, structBlocksPoint, structEscapePoints, bandOfZ, stairServesBand, walkableAt, STEP_UP, l4CubicleEscapePoints, type GameMap } from '../world/mapgen'
import type { FloorBand } from './types'
import { mangledLegBlocks, mangledLegEscapePoints } from './mangledCollision'

export const PLAYER_RADIUS = 0.32
export const FIXED_STEP = 1 / 120 // 固定物理子步（秒）
const MAX_SUBSTEPS = 16 // 单帧子步上限（约覆盖 0.13s），防止卡顿后「螺旋死亡」

export interface Vec2 { x: number; y: number }

export interface OccupyOpts {
  z?: number // 脚底当前高度（米）
  crouch?: boolean // 是否蹲伏（低通道必需）
  band?: FloorBand
  ignoreStructure?: import('./types').Structure // A sit/stand path may cross only its own seat surface.
  /** 本子步出发点。L7 海床：采样点地面比出发时对应采样点更低或持平就不拦（只拦「越走越高」）。 */
  from?: Vec2
}

// 8 点采样（四角 + 四边中点）判断半径 r 的圆能否位于 (x,y)，防止角落穿透
export function canOccupy(m: GameMap, x: number, y: number, r = PLAYER_RADIUS, opts: OccupyOpts = {}): boolean {
  const z = opts.z ?? 0
  if(mangledLegBlocks(m,x,y,r,z,opts.crouch?.88:1.48))return false
  const band: FloorBand = opts.band ?? bandOfZ(z)
  // 先做完整圆-AABB 相交：细柱可能完全处于玩家圆内部，单纯采样圆周永远碰不到它。
  if (structBlocksCircle(m, x, y, r, z, band,opts.crouch?.88:1.48,undefined,opts.ignoreStructure)) return false
  if(l11MapSpace(m,x,y,band,z)){
    for(const [ox,oy]of [[0,0],[-r,0],[r,0],[0,-r],[0,r]]){
      const sx=x+ox,sy=y+oy;if(sx<0||sy<0||sx>=m.w||sy>=m.h)return false
      const space=l11MapSpace(m,sx,sy,band,z)
      if(!space||space.blocked||!space.walkable&&z<=space.height+.1||space.height-z>STEP_UP)return false
    }
    return true
  }
  // v46：中心格是否为楼梯坡道（爬楼梯途中 z≥1.5 换带时，身体悬出坡道边缘属正常，见下方溢出放行）
  const ctx = Math.floor(x), cty = Math.floor(y)
  const centerStair = ctx >= 0 && cty >= 0 && ctx < m.w && cty < m.h && (m.stair[cty * m.w + ctx] & 7) !== 0
  const offs = [
    [-r, -r], [r, -r], [-r, r], [r, r],
    [-r, 0], [r, 0], [0, -r], [0, r],
  ]
  let fromMax: number | undefined
  for (const [ox, oy] of offs) {
    // Structures already use an exact circular test above. The four legacy
    // terrain corner probes lie outside that circle and must not enlarge props.
    const bodyProbe=ox*ox+oy*oy<=r*r+1e-9
    const sx = x + ox, sy = y + oy
    const tx = Math.floor(sx), ty = Math.floor(sy)
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return false
    const i = ty * m.w + tx
    let spill = false // 本采样格为「楼梯溢出格」（中心在坡道、身体悬到主层地板上空）
    if (m.stair[i] & 7) {
      // 楼梯坡道：坡道到达的楼层带均可通行（连续爬升）；实心结构按楼层过滤（v26：精细碰撞盒亚瓦片判定）
      // v54 跌井守卫：从非坡道格（楼板）踏入不到达本层带的坡道段=跌进楼梯井，拦截；
      // 中心已在坡道上（centerStair）则不受限——3F 沿 2F→3F 坡道连续下行时坡道中段本就不服务 band2
      if (!centerStair && !stairServesBand(m.stair[i], band)) return false
      if (bodyProbe&&structBlocksPoint(m, sx, sy, z, band,opts.ignoreStructure)) return false
    } else if (band >= 1) {
      if (!walkableAt(m, tx, ty, band)) {
        // v46 楼梯溢出放行：中心在坡道、采样格是普通主层地板（上空无物）→ 放行
        // （此前一律按「上层无楼板」拦截——爬坡到 z≥1.5 换带瞬间，半径采样扫到坡道旁的
        // 一层地板即卡死，是「阶梯边缘移动卡死 / 多层交界处无法跳跃」的根因）；
        // 跌落保护不变：中心不在坡道时，悬出夹楼边缘仍被拦截
        if (!centerStair || m.tiles[i] !== 1) return false
        if (bodyProbe&&(structBlocksPoint(m, sx, sy, z, 0,opts.ignoreStructure) || structBlocksPoint(m, sx, sy, z, 1,opts.ignoreStructure) || structBlocksPoint(m, sx, sy, z, 2,opts.ignoreStructure))) return false // v54：三个层带结构都挡（主层立柱/楼梯口实心侧挡）
        spill = true
      } else if (bodyProbe&&structBlocksPoint(m, sx, sy, z, band,opts.ignoreStructure)) return false
    } else {
      if (band === 0 && m.caveVolumeId !== undefined) {
        // 洞穴类层级按真实三维岩体表面碰撞，不再把整块「墙瓦片」当成 1m 方盒。
        const ground = floorHeight(m, sx, sy, 0)
        const head = opts.crouch ? 0.88 : 1.48
        if (caveVolumeFieldAt(m, sx, ground + 0.10, sy) <= 0.025
          || caveVolumeFieldAt(m, sx, ground + head * 0.55, sy) <= 0.025
          || caveVolumeFieldAt(m, sx, ground + head, sy) <= 0.025) return false
      } else if (!walkableAt(m, tx, ty, band)) return false
      if (bodyProbe&&structBlocksPoint(m, sx, sy, z, band,opts.ignoreStructure)) return false
      // 蹲伏低通道：头顶风道，未蹲伏不可进入
      if (band === 0 && m.crawl && m.crawl[i] === 1 && !opts.crouch) return false
    }
    // 高度档：目标地面高于脚底 STEP_UP 以上不可直接踏上（跳跃抬高 z 后放行）
    // （溢出格按主层地面计——悬在一层上空时一层地面远低于脚底，不再误拦）
    const g = floorHeight(m, sx, sy, spill ? 0 : band)
    if (g - z > STEP_UP) {
      // L7 陡崖防卡死：贴在陡坡上时，半径 0.32m 的上坡一侧采样点高出脚底远超 STEP_UP，
      // 旧逻辑连沿坡横移、往下坡退都会被拦，玩家只能原地上浮。海床瓦片改为「不变差就放行」。
      // 判据取「出发时身体下最高的海床」：只要新位置每个采样点都不超过它（容差 3cm/子步）就放行——
      // 沟底、凹角里也总能朝某个方向挪出去；嵌入深度不会比出发时更深。
      const f = opts.from
      if (!(f && m.l7SeaTerrain && m.liquid[i] === 1 && band === 0)) return false
      if (fromMax === undefined) {
        fromMax = -Infinity
        for (const [qx, qy] of offs) fromMax = Math.max(fromMax, floorHeight(m, f.x + qx, f.y + qy, 0))
      }
      if (g > fromMax + 0.03) return false
    }
  }
  return true
}

/** Bounded recovery for late model colliders or a body embedded by vertical
 * motion. Never changes height, crosses floors, or rescues a fall into void. */
export function resolvePlayerPenetration(m:GameMap,pos:Vec2,r=PLAYER_RADIUS,opts:OccupyOpts={}):Vec2 {
 const zero={x:0,y:0},z=opts.z??0,band=opts.band??bandOfZ(z)
 if(!Number.isFinite(pos.x+pos.y+z)||canOccupy(m,pos.x,pos.y,r,opts))return zero
 const tx=Math.floor(pos.x),ty=Math.floor(pos.y),wall=tx>=0&&ty>=0&&tx<m.w&&ty<m.h&&m.tiles[ty*m.w+tx]===2
 const legs=mangledLegEscapePoints(m,pos.x,pos.y,r,z,opts.crouch?.88:1.48)
 if(!wall&&!legs.length&&!structBlocksCircle(m,pos.x,pos.y,r,z,band,opts.crouch?.88:1.48,undefined,opts.ignoreStructure))return zero
 const candidates=[...legs,...structEscapePoints(m,pos.x,pos.y,z,band,r)],pad=r+.003
 if(wall)for(let y=ty-1;y<=ty+1;y++)for(let x=tx-1;x<=tx+1;x++)if(x>=0&&y>=0&&x<m.w&&y<m.h&&m.tiles[y*m.w+x]===2)candidates.push({x:x-pad,y:pos.y},{x:x+1+pad,y:pos.y},{x:pos.x,y:y-pad},{x:pos.x,y:y+1+pad})
 const distance=(p:Vec2)=>(p.x-pos.x)**2+(p.y-pos.y)**2
 candidates.sort((a,b)=>distance(a)-distance(b))
 for(const p of candidates){
  if(distance(p)>(legs.length?16:4)||!canOccupy(m,p.x,p.y,r,opts))continue
  const d={x:p.x-pos.x,y:p.y-pos.y};pos.x=p.x;pos.y=p.y;return d
 }return zero
}

// 单个子步的移动：先 x 分量后 y 分量（轴分离 → 沿墙滑动），返回实际位移
export function moveStep(m: GameMap, pos: Vec2, dx: number, dy: number, r = PLAYER_RADIUS, opts: OccupyOpts = {}): Vec2 {
  let mx = 0, my = 0
  const sea = !!m.l7SeaTerrain
  if (dx !== 0 && canOccupy(m, pos.x + dx, pos.y, r, sea ? { ...opts, from: { x: pos.x, y: pos.y } } : opts)) { pos.x += dx; mx = dx }
  if (dy !== 0 && canOccupy(m, pos.x, pos.y + dy, r, sea ? { ...opts, from: { x: pos.x, y: pos.y } } : opts)) { pos.y += dy; my = dy }
  // [thing] L7 海床沿等高线滑移：两轴都被陡坡挡住时，把这一步转 ±25°/±50°/±75° 再试（长度按 cos 缩短），
  // 贴着崖面横移时不会一顿一顿地停住。
  if (sea && !mx && !my && (dx || dy)) {
    const ti = Math.floor(pos.y) * m.w + Math.floor(pos.x)
    if (m.liquid[ti] === 1 && (opts.band ?? 0) === 0) {
      for (const deg of [25, -25, 50, -50, 75, -75]) {
        const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
        const rx = (dx * c - dy * s) * c, ry = (dx * s + dy * c) * c
        if (canOccupy(m, pos.x + rx, pos.y + ry, r, { ...opts, from: { x: pos.x, y: pos.y } })) { pos.x += rx; pos.y += ry; return { x: rx, y: ry } }
      }
    }
  }
  if(!mx&&!my&&(dx||dy))resolvePlayerPenetration(m,pos,r,opts)
  if(!mx&&!my&&(dx||dy)&&m.tint[Math.floor(pos.y)*m.w+Math.floor(pos.x)]===51&&!canOccupy(m,pos.x,pos.y,r,opts)){
    const escape=l4CubicleEscapePoints(m,pos.x,pos.y,opts.z??0,r).find(p=>canOccupy(m,p.x,p.y,r,opts))
    if(escape){pos.x=escape.x;pos.y=escape.y}
  }
  return { x: mx, y: my }
}

// 帧间累余时间的积分器状态（调用方持有，跨帧保留余数保证长程位移精确）
export interface MoveIntegrator { acc: number }
export function createIntegrator(): MoveIntegrator { return { acc: 0 } }

/**
 * 以固定子步推进一帧移动。
 * @param dirX/dirY 已归一化（可乘以摇杆力度 ≤1）的移动方向（世界系）
 * @param frameDt   本帧时间（外部已 clamp）
 * @returns 本帧实际位移（用于脚步声/统计，撞墙时不虚增）
 */
export function integrateMove(
  m: GameMap,
  pos: Vec2,
  dirX: number,
  dirY: number,
  speed: number,
  frameDt: number,
  it: MoveIntegrator,
  opts: { noclip?: boolean; radius?: number; z?: number; crouch?: boolean; band?: FloorBand } = {},
): Vec2 {
  const r = opts.radius ?? PLAYER_RADIUS
  it.acc = Math.min(it.acc + frameDt, FIXED_STEP * MAX_SUBSTEPS)
  let tx = 0, ty = 0
  while (it.acc >= FIXED_STEP - 1e-9) {
    it.acc = Math.max(0, it.acc - FIXED_STEP)
    const dx = dirX * speed * FIXED_STEP
    const dy = dirY * speed * FIXED_STEP
    if (opts.noclip) { pos.x += dx; pos.y += dy; tx += dx; ty += dy; continue }
    const d = moveStep(m, pos, dx, dy, r, { z: opts.z, crouch: opts.crouch, band: opts.band })
    tx += d.x; ty += d.y
  }
  return { x: tx, y: ty }
}
