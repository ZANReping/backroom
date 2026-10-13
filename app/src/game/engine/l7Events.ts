// v66：Level 7 特殊事件（每帧在玩家移动前调用一次；只在 L7 生效）。
//
// 1) 七层之物涌浪（Fandom：楼层海面仅存的涌浪源自这一实体的活动）——
//    玩家在远离入口的开阔海面时，每 2~5 分钟一次：远处 90~130m 浮出一段巨大的背脊，
//    沿切向缓慢游过约 24s 后下沉；它推开的环形涌浪传到玩家处时，玩家被抬起并被推离波源。
// 2) 比普综合症 + 骨粉雾（Fandom）——在远海水面停留越久（halluc 0→1），蜃楼船越清晰；
//    明明海水完全静止，人却像被洋流悄悄往后拉（逆着移动方向的缓慢漂移）；耳边出现幻听。
//    回到入口附近或长时间潜在水下会慢慢消退。
// 3) 重力交界区水墙（Fandom：竖直的水墙）——位于水墙投影内时，水面上限抬高到墙顶，
//    可以「侧着」顺着水墙游上去；墙内重力偏向墙体中面（轻微横向拉力）。离开墙体时若高于海面，则坠落回海。
import type { Engine } from '../engine'
import { audio } from '../core/audio'
import { L7_ORIGIN, l7GravWallAt, l7GravDistance } from '../world/infiniteL7'
import { l7SurgeHeight } from '../renderer/water'

export interface L7Surge {
  /** 背脊当前世界坐标（瓦片） */
  wx: number; wy: number
  /** 游动方向（单位向量） */
  dx: number; dy: number
  t: number; dur: number; amp: number
}
export interface L7Fx {
  surge: L7Surge | null
  /** 涌浪环形波前半径（米） */
  surgeR: number
  nextSurge: number
  farT: number
  halluc: number
  whisperT: number
  /** 本帧玩家所在水墙（null=不在） */
  wall: { top: number; nx: number; ny: number; perp: number } | null
  /** 到最近水墙的水平距离（米） */
  gravDist: number
  gravT: number
  /** 离开水墙时仍高于海面、正在坠落 */
  wallFall: boolean
  /** 本帧玩家处涌浪海面偏移（米） */
  surgeH: number
  mapRef: unknown
}
export const newL7Fx = (): L7Fx => ({ surge: null, surgeR: 0, nextSurge: 140, farT: 0, halluc: 0, whisperT: 10, wall: null, gravDist: Infinity, gravT: 0, wallFall: false, surgeH: 0, mapRef: null })

const SURGE_SPEED = 9 // 涌浪波前传播速度（m/s）

/** 当前涌浪着色器参数（场景坐标）。供渲染器写入 l7SurgeUniforms。 */
export function l7SurgeShaderParams(eng: Engine): { x: number; y: number; z: number; w: number } {
  const fx = eng.l7fx, m = eng.map
  if (!fx.surge || !m?.inf) return { x: 0, y: 0, z: 0, w: 0 }
  const s = fx.surge
  const env = Math.min(1, s.t / 4) * (1 - Math.max(0, (s.t - s.dur) / 14))
  return { x: s.wx - m.inf.ox, y: s.wy - m.inf.oy, z: s.amp * Math.max(0, env), w: fx.surgeR }
}

export function stepL7Events(eng: Engine, dt: number) {
  const m = eng.map
  if (!m?.inf || eng.levelDef.id !== 7) return
  const fx = eng.l7fx
  if (fx.mapRef !== m) { Object.assign(fx, newL7Fx()); fx.mapRef = m }
  const p = eng.player
  const seed = m.inf.seed
  const wx = p.x + m.inf.ox, wy = p.y + m.inf.oy
  const r = Math.hypot(wx - L7_ORIGIN.x, wy - L7_ORIGIN.y)
  const inSea = eng.inLiquid === 1
  const nearSurface = inSea && p.z > -2.5

  // ---- 重力交界区 ----
  fx.gravT -= dt
  if (fx.gravT <= 0) { fx.gravT = 0.25; fx.gravDist = r > 250 ? l7GravDistance(seed, wx, wy) : Infinity }
  const w = fx.gravDist < 8 ? l7GravWallAt(seed, wx, wy) : null
  fx.wall = w ? { top: w.top, nx: w.nx, ny: w.ny, perp: w.perp } : null

  // ---- 七层之物涌浪 ----
  if (fx.surge) {
    const s = fx.surge
    s.t += dt
    s.wx += s.dx * 6 * dt; s.wy += s.dy * 6 * dt
    fx.surgeR += SURGE_SPEED * dt
    if (s.t > s.dur + 16) { fx.surge = null; fx.surgeR = 0; fx.nextSurge = 120 + Math.random() * 180 }
  } else if (nearSurface && r > 80 && !eng.dev.frozenAI) {
    fx.nextSurge -= dt
    if (fx.nextSurge <= 0) {
      const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 40
      const sgn = Math.random() < 0.5 ? -1 : 1
      fx.surge = { wx: wx + Math.cos(a) * d, wy: wy + Math.sin(a) * d, dx: -Math.sin(a) * sgn, dy: Math.cos(a) * sgn, t: 0, dur: 22 + Math.random() * 8, amp: 0.75 + Math.random() * 0.45 }
      fx.surgeR = 0
      audio.leviathanGroan(1, d)
      eng.msg('远处的海面隆起了一道漫长的弧——有什么东西在水下翻了个身。', 'system')
    }
  }
  fx.surgeH = 0
  if (fx.surge) {
    const sp = l7SurgeShaderParams(eng)
    fx.surgeH = l7SurgeHeight(p.x, p.y, sp)
    if (nearSurface && Math.abs(fx.surgeH) > 0.05) {
      // 推离波源：只在波峰（h>0）推，力度与浪高成正比
      const ddx = p.x - sp.x, ddy = p.y - sp.y, L = Math.hypot(ddx, ddy) || 1
      const push = Math.max(0, fx.surgeH) * 1.5 * dt
      moveIfWater(eng, (ddx / L) * push, (ddy / L) * push)
      fx.surgeH = l7SurgeHeight(p.x, p.y, sp)
    }
  }

  // ---- 比普综合症 / 骨粉雾致幻 ----
  const far = nearSurface && r > 180
  if (far) fx.farT += dt
  else fx.farT = Math.max(0, fx.farT - dt * (r < 60 ? 3 : inSea && p.z < -4 ? 1 : 0.4))
  const target = Math.min(1, Math.max(0, (fx.farT - 120) / 480))
  fx.halluc += (target - fx.halluc) * Math.min(1, dt * 0.5)
  if (fx.halluc > 0.25 && nearSurface) {
    // 「如同洋流正在悄悄地将自己向后方拉去，尽管海水完全没有运动」
    const mx = eng.input.mx, my = eng.input.my
    const mag = Math.hypot(mx, my)
    if (mag > 0.1) {
      const k = (fx.halluc - 0.25) * 0.55 * dt
      // input.mx/my 已是世界方向（integrateMove 直接使用）；逆着移动方向缓慢漂移
      moveIfWater(eng, -mx / mag * k, -my / mag * k)
    }
    fx.whisperT -= dt
    if (fx.whisperT <= 0) {
      fx.whisperT = 7 + Math.random() * 14 * (1.3 - fx.halluc)
      audio.whisper(0.45 + fx.halluc * 0.6)
      if (fx.halluc > 0.55 && Math.random() < 0.25) eng.msg('雾里有船。很近。你游了很久，它还是那么近。', 'system')
    }
  }
}

function moveIfWater(eng: Engine, dx: number, dy: number) {
  const m = eng.map!, p = eng.player
  const nx = p.x + dx, ny = p.y + dy
  const tx = Math.floor(nx), ty = Math.floor(ny)
  if (tx < 1 || ty < 1 || tx >= m.w - 1 || ty >= m.h - 1) return
  if (m.liquid[ty * m.w + tx] !== 1 || m.up?.[ty * m.w + tx] === 1) return
  p.x = nx; p.y = ny
}

/** 开发者/预览：立刻在玩家前方触发一次涌浪（angleDeg=背脊相对玩家的世界方位）。 */
export function triggerL7Surge(eng: Engine, angleDeg = 0, dist = 70) {
  const m = eng.map
  if (!m?.inf) return
  const p = eng.player, a = angleDeg * Math.PI / 180
  const wx = p.x + m.inf.ox, wy = p.y + m.inf.oy
  eng.l7fx.surge = { wx: wx + Math.cos(a) * dist, wy: wy + Math.sin(a) * dist, dx: -Math.sin(a), dy: Math.cos(a), t: 6, dur: 40, amp: 1.0 }
  eng.l7fx.surgeR = 40
}
