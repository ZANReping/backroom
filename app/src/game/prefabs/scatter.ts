// 层级特色散点生成物（门/窗/桌/吊灯/柜等，贴墙或空地）
import { RNG } from '../rng'
import type { GameMap } from '../mapgen'
import type { Structure, StructKind } from '../types'
import { idx, isFloor } from './shared'

// ---------- 层级特色散点生成物（门/窗/桌/吊灯/柜等，贴墙或空地） ----------
export function scatterFeatures(m: GameMap, rng: RNG, level: number) {
  const wallHug = (kind: StructKind, data?: Structure['data']): boolean => {
    for (let t = 0; t < 200; t++) {
      const x = rng.int(1, m.w - 2)
      const y = rng.int(1, m.h - 2)
      if (m.tiles[idx(m, x, y)] !== 1 || m.outdoor[idx(m, x, y)] === 1) continue
      if (m.structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)) continue
      let hasWall = false
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
        if (!isFloor(m, x + dx, y + dy)) { hasWall = true; break }
      if (!hasWall) continue
      m.structures.push({ kind, x, y, w: 1, h: 1, solid: false, data })
      return true
    }
    return false
  }
  const freeStand = (kind: StructKind, w: number, h: number, solid: boolean, data?: Structure['data']): boolean => {
    for (let t = 0; t < 200; t++) {
      const x = rng.int(1, m.w - w - 1)
      const y = rng.int(1, m.h - h - 1)
      let ok = true
      for (let j = y - 1; j <= y + h && ok; j++)
        for (let i = x - 1; i <= x + w && ok; i++)
          if (m.tiles[idx(m, i, j)] !== 1) ok = false
      for (let j = y; j < y + h && ok; j++)
        for (let i = x; i < x + w && ok; i++)
          if (m.outdoor[idx(m, i, j)] === 1) ok = false // v8：室内家具不进室外
      if (!ok) continue
      if (m.structures.some((s) => s.solid && x < s.x + s.w && x + w > s.x && y < s.y + s.h && y + h > s.y)) continue
      m.structures.push({ kind, x, y, w, h, solid, data })
      return true
    }
    return false
  }

  switch (level) {
    case 0:
      // 荧光灯吊线版（wiki：嗡鸣荧光灯）
      for (let i = 0; i < 5; i++) {
        if (freeStand('hanglight', 1, 1, false)) {
          const s = m.structures[m.structures.length - 1]
          m.lights.push({ x: s.x + 0.5, y: s.y + 0.5, r: 3.5, color: '#fff6d8', flickerSeed: rng.next() * 100 })
        }
      }
      break
    case 2:
      // 维护桌（检修台）
      for (let i = 0; i < 3; i++) freeStand('table', 1, 1, true)
      break
    case 4:
      // 涂黑窗户（安全）+ 少量未涂黑窗户（陷阱）沿墙分布
      for (let i = 0; i < 8; i++) wallHug('windowblack')
      for (let i = 0; i < 2; i++) wallHug('windowtrap')
      break
    case 5:
      // 酒店窗 + 客房桌 + 大堂/走廊吊灯 + 额外柜子
      for (let i = 0; i < 6; i++) wallHug('hotelwindow')
      for (let i = 0; i < 3; i++) freeStand('table', 1, 1, true)
      for (let i = 0; i < 3; i++) {
        if (freeStand('chandelier', 1, 1, false)) {
          const s = m.structures[m.structures.length - 1]
          m.lights.push({ x: s.x + 0.5, y: s.y + 0.5, r: 4.5, color: '#ffd9a0', flickerSeed: rng.next() * 100 })
        }
      }
      for (let i = 0; i < 2; i++) freeStand('dresser', 1, 1, true, { loot: 1 })
      break
  }
}
