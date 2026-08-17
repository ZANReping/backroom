// 暂停页「脱离卡死」：3 秒实际移动 + 几何逃生路径双重确认，随后传送到最近的开阔连通地块。
import { bandOfPlayerZ, groundHeightAt, JUMP_REACH } from '../world/mapgen'
import { canOccupy, PLAYER_RADIUS } from '../core/player'
import type { Engine } from '../engine'
import type { FloorBand } from '../core/types'

const CHECK_SECONDS = 3
const MIN_ATTEMPT_SECONDS = 0.45
const MOVED_ENOUGH = 0.45
const ESCAPE_RADIUS = 0.6
const ESCAPE_STEP = 0.04

export interface UnstuckCheckState {
  elapsed: number
  attempted: number
  moved: number
  lastX: number
  lastY: number
  level: number
  countdown: number
}

export interface UnstuckDestination {
  x: number
  y: number
  z: number
  band: FloorBand
  openness: number
  componentSize: number
}

function worldPos(eng: Engine): { x: number; y: number } {
  const inf = eng.map?.inf
  return { x: eng.player.x + (inf?.ox ?? 0), y: eng.player.y + (inf?.oy ?? 0) }
}

/** 当前位置能否沿连续碰撞合法的小步路径离开至少 0.6m；防止站在正常位置朝墙按键误触发脱困。 */
export function canEscapeCurrentPosition(eng: Engine): boolean {
  const m = eng.map
  if (!m) return true
  const p = eng.player
  const band = bandOfPlayerZ(m, p.z)
  const span = Math.ceil(ESCAPE_RADIUS / ESCAPE_STEP)
  const side = span * 2 + 1
  const seen = new Uint8Array(side * side)
  const qx = new Int16Array(side * side)
  const qy = new Int16Array(side * side)
  let head = 0, tail = 1
  qx[0] = 0; qy[0] = 0
  seen[span * side + span] = 1
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

  while (head < tail) {
    const gx = qx[head], gy = qy[head++]
    if (Math.hypot(gx, gy) * ESCAPE_STEP >= ESCAPE_RADIUS) return true
    for (const [dx, dy] of dirs) {
      const nx = gx + dx, ny = gy + dy
      if (Math.abs(nx) > span || Math.abs(ny) > span) continue
      const si = (ny + span) * side + nx + span
      if (seen[si]) continue
      const x = p.x + nx * ESCAPE_STEP, y = p.y + ny * ESCAPE_STEP
      if (!canOccupy(m, x, y, PLAYER_RADIUS, { z: p.z, crouch: p.crouching, band })) continue
      seen[si] = 1
      qx[tail] = nx; qy[tail] = ny; tail++
    }
  }
  return false
}

/**
 * 搜索最近的安全落点。候选必须位于足够大的四向连通块内；优先 3×3 邻域至少 5 格可走的开阔处，
 * 若层级本身只有狭廊则逐级放宽，但始终不会落入深水、深坑、楼梯中段或小型孤岛。
 */
export function findUnstuckDestination(eng: Engine): UnstuckDestination | null {
  const m = eng.map
  if (!m) return null
  const currentBand = bandOfPlayerZ(m, eng.player.z)
  const bands = [currentBand, 0, 1, 2].filter((v, i, a) => v < (m.floors ?? 1) && a.indexOf(v) === i) as (0 | 1 | 2)[]
  const originX = Number.isFinite(eng.player.x) ? eng.player.x : m.w / 2
  const originY = Number.isFinite(eng.player.y) ? eng.player.y : m.h / 2

  for (const band of bands) {
    const n = m.w * m.h
    const walk = new Uint8Array(n)
    const height = new Float32Array(n)
    let totalWalkable = 0
    for (let y = 1; y < m.h - 1; y++) {
      for (let x = 1; x < m.w - 1; x++) {
        const i = y * m.w + x
        if (m.elev[i] === 4 || m.liquid[i] === 1) continue
        const z = groundHeightAt(m, x + 0.5, y + 0.5, band)
        if (!canOccupy(m, x + 0.5, y + 0.5, PLAYER_RADIUS, { z, crouch: false, band })) continue
        walk[i] = 1; height[i] = z; totalWalkable++
      }
    }
    if (!totalWalkable) continue

    const comp = new Int32Array(n).fill(-1)
    const sizes: number[] = []
    const queue = new Int32Array(n)
    const dirs = [1, -1, m.w, -m.w]
    for (let start = 0; start < n; start++) {
      if (!walk[start] || comp[start] >= 0) continue
      const id = sizes.length
      let head = 0, tail = 1
      queue[0] = start; comp[start] = id
      while (head < tail) {
        const cur = queue[head++]
        const cx = cur % m.w
        for (const d of dirs) {
          const next = cur + d
          if (next < 0 || next >= n || !walk[next] || comp[next] >= 0) continue
          if ((d === 1 && cx === m.w - 1) || (d === -1 && cx === 0)) continue
          if (Math.abs(height[next] - height[cur]) > JUMP_REACH) continue
          comp[next] = id; queue[tail++] = next
        }
      }
      sizes.push(tail)
    }

    const opennessAt = (x: number, y: number) => {
      let count = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (walk[(y + dy) * m.w + x + dx]) count++
      return count
    }
    const policies = [
      { open: 5, component: Math.min(16, totalWalkable) },
      { open: 3, component: Math.min(12, totalWalkable) },
      { open: 1, component: Math.min(8, totalWalkable) },
    ]
    for (const policy of policies) {
      let best: UnstuckDestination | null = null
      let bestD = Infinity
      for (let y = 1; y < m.h - 1; y++) {
        for (let x = 1; x < m.w - 1; x++) {
          const i = y * m.w + x
          if (!walk[i] || (m.stair[i] & 7) !== 0) continue
          const componentSize = sizes[comp[i]] ?? 0
          if (componentSize < policy.component) continue
          const openness = opennessAt(x, y)
          if (openness < policy.open) continue
          const px = x + 0.5, py = y + 0.5
          const d = Math.hypot(px - originX, py - originY)
          if (d > bestD + 1e-6 || (Math.abs(d - bestD) <= 1e-6 && best && openness <= best.openness)) continue
          bestD = d
          best = { x: px, y: py, z: height[i], band, openness, componentSize }
        }
      }
      if (best) return best
    }
  }
  return null
}

export function startUnstuckCheck(eng: Engine): boolean {
  if (!eng.map || eng.over || eng.victory) return false
  if (eng.transition || eng.ride || eng.climb) {
    eng.msg('当前正在进行层级切换或攀爬，暂时不能检测卡死。', 'system')
    return false
  }
  const pos = worldPos(eng)
  eng.unstuckCheck = {
    elapsed: 0, attempted: 0, moved: 0,
    lastX: pos.x, lastY: pos.y,
    level: eng.player.level, countdown: CHECK_SECONDS,
  }
  eng.emit({ kind: 'toast', text: '脱困检测开始：请在 3 秒内持续尝试移动' })
  eng.msg('正在确认是否卡死——请持续尝试向不同方向移动。', 'system')
  return true
}

export function updateUnstuckCheck(eng: Engine, frameDt: number) {
  const state = eng.unstuckCheck
  if (!state || !eng.map || eng.paused || eng.over) return
  if (eng.player.level !== state.level || eng.transition || eng.ride || eng.climb) {
    eng.unstuckCheck = null
    return
  }
  const dt = Math.min(frameDt, 0.05)
  state.elapsed += dt
  if (Math.hypot(eng.input.mx, eng.input.my) > 0.2) state.attempted += dt
  const pos = worldPos(eng)
  state.moved += Math.hypot(pos.x - state.lastX, pos.y - state.lastY)
  state.lastX = pos.x; state.lastY = pos.y

  const remaining = Math.max(0, Math.ceil(CHECK_SECONDS - state.elapsed))
  if (remaining > 0 && remaining < state.countdown) {
    state.countdown = remaining
    eng.emit({ kind: 'toast', text: `脱困检测：还剩 ${remaining} 秒` })
  }
  if (state.elapsed < CHECK_SECONDS) return
  eng.unstuckCheck = null

  if (state.attempted < MIN_ATTEMPT_SECONDS) {
    eng.msg('未检测到足够的移动尝试，脱困已取消。请再次点击并持续按住移动方向。', 'system')
    eng.emit({ kind: 'toast', text: '脱困取消：请持续尝试移动' })
    return
  }
  if (state.moved >= MOVED_ENOUGH || canEscapeCurrentPosition(eng)) {
    eng.msg('检测到当前位置仍可移动，未执行传送。', 'system')
    eng.emit({ kind: 'toast', text: '当前位置可以脱出，无需传送' })
    return
  }

  const target = findUnstuckDestination(eng)
  if (!target) {
    eng.msg('没有找到安全且连通的脱困地块，未执行传送。', 'system')
    eng.emit({ kind: 'toast', text: '脱困失败：附近没有安全落点' })
    return
  }
  const p = eng.player
  const distance = Math.hypot(target.x - p.x, target.y - p.y)
  p.x = target.x; p.y = target.y; p.z = target.z; p.vz = 0; p.floor = target.band; p.crouching = false
  eng.moveIt.acc = 0
  eng.slipVx = 0; eng.slipVy = 0
  eng.onStairs = false
  eng.inLiquid = 0; eng.submerged = false; eng.wasSubmerged = false; eng.breathT = 0
  eng.searching = null; eng.lootPanel = null; eng.interactTarget = null
  eng.ride = null; eng.climb = null; eng.porchDrop = null // v58
  eng.updateInfiniteWindow()
  eng.persist() // 立即覆盖卡死坐标，重新进入游戏也会从安全点恢复。
  eng.msg(`已确认无法移动，已脱困至最近的开阔连通地块（${distance.toFixed(1)} 米）。`, 'system')
  eng.emit({ kind: 'toast', text: '脱困成功：已移动到安全地块' })
}
