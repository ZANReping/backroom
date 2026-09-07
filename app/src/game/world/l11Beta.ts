import type { GameMap } from './mapgen'
import { FLOOR_H, stampStairRun } from './mapgen'
import type { LevelDef, StructKind } from '../core/types'
import type { RNG } from '../core/rng'

/** Fixed M.E.G. Beta/Camp Amber layout: courtyard, two wings, and an elevated bridge. */
export function genL11Beta(m: GameMap, _rng: RNG, def: LevelDef): { cx: number; cy: number }[] {
  const idx = (x: number, y: number) => y * m.w + x
  const floor = (x: number, y: number) => { m.tiles[idx(x, y)] = 1; m.outdoor[idx(x, y)] = 1; m.elev[idx(x, y)] = 0 }
  const inside = (x: number, y: number) => { m.tiles[idx(x, y)] = 1; m.outdoor[idx(x, y)] = 0; m.elev[idx(x, y)] = 0 }
  const wall = (x: number, y: number) => { m.tiles[idx(x, y)] = 2; m.outdoor[idx(x, y)] = 0 }
  for (let y = 12; y <= 83; y++) for (let x = 12; x <= 83; x++) floor(x, y)
  const wing = (x0: number, x1: number) => {
    for (let y = 25; y <= 66; y++) for (let x = x0; x <= x1; x++) inside(x, y)
    for (let x = x0; x <= x1; x++) { wall(x, 25); wall(x, 66) }
    for (let y = 25; y <= 66; y++) { wall(x0, y); wall(x1, y) }
  }
  wing(18, 41); wing(54, 77)
  // Ground-floor doors and open central bridge approaches.
  for (const [x, y] of [[29, 25], [30, 25], [29, 66], [30, 66], [65, 25], [66, 25], [65, 66], [66, 66], [41, 45], [54, 45]] as const) inside(x, y)
  // Upper floors occupy the same wing footprints, with aligned doors and bridge.
  for (const [x0, x1] of [[18, 41], [54, 77]] as const) {
    for (let y = 25; y <= 66; y++) for (let x = x0; x <= x1; x++) m.up[idx(x, y)] = 1
    for (let x = x0; x <= x1; x++) { m.upWall[idx(x, 25)] = 1; m.upWall[idx(x, 66)] = 1 }
    for (let y = 25; y <= 66; y++) { m.upWall[idx(x0, y)] = 1; m.upWall[idx(x1, y)] = 1 }
  }
  for (const [x, y] of [[29, 25], [30, 25], [65, 25], [66, 25], [29, 66], [30, 66], [65, 66], [66, 66]] as const) m.upWall[idx(x, y)] = 0
  for (let y = 43; y <= 46; y++) for (let x = 41; x <= 54; x++) { m.up[idx(x, y)] = 1; m.upWall[idx(x, y)] = 0; m.outdoor[idx(x, y)] = 1 }
  stampStairRun(m, 35, 43, 3, 5)
  stampStairRun(m, 60, 43, 3, 5)
  m.floors = 2
  m.spawn = { x: 47, y: 74 }
  m.exits.push({ def: def.exits[0], x: 47, y: 74, discovered: true })
  m.exits.push({ def: def.exits[1], x: 66, y: 30, floor: 1, discovered: false })
  const S = (kind: StructKind, x: number, y: number, floorBand: 0 | 1 = 0, w = 1, h = 1) => m.structures.push({ kind, x, y, w, h, solid: true, ...(floorBand ? { floor: floorBand } : {}) })
  S('locker', 21, 30); S('desk', 25, 34); S('desk', 31, 57); S('bunkbed', 35, 60); S('vending', 37, 29)
  S('locker', 57, 30); S('desk', 61, 35); S('desk', 69, 55); S('bunkbed', 73, 60); S('vending', 75, 29)
  S('locker', 21, 30, 1); S('desk', 26, 35, 1); S('bunkbed', 34, 58, 1)
  S('locker', 57, 30, 1); S('desk', 62, 35, 1); S('bunkbed', 71, 58, 1)
  m.npcs = [
    { id: 'l11_archivist', x: 65, y: 33, floor: 1 },
    { id: 'l11_quartermaster', x: 29, y: 55, floor: 0 },
    { id: 'l11_tutor', x: 30, y: 33, floor: 0 },
  ]
  // Static interior lighting: four always-on fixtures per wing and floor.
  for (const [x0, x1] of [[18, 41], [54, 77]] as const) {
    for (const x of [x0 + 6, x1 - 6]) for (const y of [35.5, 56.5]) {
      m.lights.push({ x: x + 0.5, y, z: 0, r: 5.5, color: def.palette.light, flickerSeed: 0 })
      m.lights.push({ x: x + 0.5, y, z: 3, r: 5.5, color: def.palette.light, flickerSeed: 0 })
    }
  }
  // Elevated bridge edge rails; leave both endpoints open for the wing doorways.
  for (let x = 42; x <= 53; x++) {
    m.structures.push({ kind: 'handrail', x, y: 43, w: 1, h: 1, solid: true, floor: 1, data: { deg: 180 } })
    m.structures.push({ kind: 'handrail', x, y: 46, w: 1, h: 1, solid: true, floor: 1, data: { deg: 0 } })
  }
  m.zones = [{ name: 'Beta基地庭院', x: 47, y: 20 }, { name: '研究档案翼', x: 30, y: 45 }, { name: '琥珀营地翼', x: 66, y: 45 }, { name: '高架步道', x: 47, y: 44, z: FLOOR_H }]
  return [{ cx: 47, cy: 47 }]
}
