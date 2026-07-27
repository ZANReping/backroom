// 玩家移动与碰撞（v5 自 engine 抽离，纯逻辑、可无头测试）
// 修复「行走卡顿/回退」的三个要点：
// 1) 固定子步积分（FIXED_STEP accumulator）：高低帧率下每帧位移一致，
//    避免低帧率大步长穿墙后被碰撞系统弹回造成的「位置回退」。
// 2) 轴分离 AABB 碰撞：x/y 分量独立解算，贴墙移动时自然沿墙滑动，不会整段位移被丢弃。
// 3) 碰撞检测与移动在同一子步内完成（先移动→立即解算→再下一子步），顺序确定、无跨帧不同步。
// v7：z 轴高度系统——canOccupy 增加 z/crouch 选项：
//   - 高差 > STEP_UP(0.65m) 的瓦片不可直接踏上（跳跃滞空时 p.z 抬高后可通过）；
//   - 蹲伏低通道（crawl=1）未蹲伏不可进入。
import { groundHeightAt, solidStructAtFloor, STEP_UP, type GameMap } from './mapgen'

export const PLAYER_RADIUS = 0.32
export const FIXED_STEP = 1 / 120 // 固定物理子步（秒）
const MAX_SUBSTEPS = 16 // 单帧子步上限（约覆盖 0.13s），防止卡顿后「螺旋死亡」

export interface Vec2 { x: number; y: number }

export interface OccupyOpts {
  z?: number // 脚底当前高度（米）
  crouch?: boolean // 是否蹲伏（低通道必需）
  band?: 0 | 1 // v13：所在楼层高度带（缺省按 z 推断）；1=上层走 up 楼板，0=主层走 tiles
}

// 8 点采样（四角 + 四边中点）判断半径 r 的圆能否位于 (x,y)，防止角落穿透
export function canOccupy(m: GameMap, x: number, y: number, r = PLAYER_RADIUS, opts: OccupyOpts = {}): boolean {
  const z = opts.z ?? 0
  const band: 0 | 1 = opts.band ?? (z >= 1.5 ? 1 : 0)
  const offs = [
    [-r, -r], [r, -r], [-r, r], [r, r],
    [-r, 0], [r, 0], [0, -r], [0, r],
  ]
  for (const [ox, oy] of offs) {
    const sx = x + ox, sy = y + oy
    const tx = Math.floor(sx), ty = Math.floor(sy)
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return false
    const i = ty * m.w + tx
    if (m.stair[i] & 7) {
      // 楼梯坡道：两层带均可通行（连续爬升）；实心结构按楼层过滤
      if (solidStructAtFloor(m, tx, ty, band)) return false
    } else if (band === 1) {
      // 上层：须有上层楼板且非上层墙；实心结构按上层过滤
      if (m.up[i] !== 1 || m.upWall[i] === 1) return false
      if (solidStructAtFloor(m, tx, ty, 1)) return false
    } else {
      if (m.tiles[i] !== 1) return false
      if (solidStructAtFloor(m, tx, ty, 0)) return false
      // 蹲伏低通道：头顶风道，未蹲伏不可进入
      if (m.crawl && m.crawl[i] === 1 && !opts.crouch) return false
    }
    // 高度档：目标地面高于脚底 STEP_UP 以上不可直接踏上（跳跃抬高 z 后放行）
    const g = groundHeightAt(m, sx, sy, band)
    if (g - z > STEP_UP) return false
  }
  return true
}

// 单个子步的移动：先 x 分量后 y 分量（轴分离 → 沿墙滑动），返回实际位移
export function moveStep(m: GameMap, pos: Vec2, dx: number, dy: number, r = PLAYER_RADIUS, opts: OccupyOpts = {}): Vec2 {
  let mx = 0, my = 0
  if (dx !== 0 && canOccupy(m, pos.x + dx, pos.y, r, opts)) { pos.x += dx; mx = dx }
  if (dy !== 0 && canOccupy(m, pos.x, pos.y + dy, r, opts)) { pos.y += dy; my = dy }
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
  opts: { noclip?: boolean; radius?: number; z?: number; crouch?: boolean; band?: 0 | 1 } = {},
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
