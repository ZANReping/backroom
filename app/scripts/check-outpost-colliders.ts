import assert from 'node:assert/strict'
import { ALPHA_DEFS, alphaParts, isAlphaKind } from '../src/game/content/alphaDecor'
import { TRADE_DEFS, isTradeKind, tradeParts } from '../src/game/content/tradeDecor'
import { settlementColliders } from '../src/game/world/settlementColliders'
import type { Structure } from '../src/game/core/types'
import type { ColliderBox } from '../src/game/world/mapgen'

let checks = 0
const check = (condition: unknown, message: string): void => {
  checks++
  assert(condition, message)
}

function expected(s: Structure): ColliderBox[] | null {
  const alpha = isAlphaKind(s.kind)
  if (!alpha && !isTradeKind(s.kind)) return null
  const boxes: ColliderBox[] = []
  const radians = Number(s.data?.deg ?? 0) * Math.PI / 180
  const c = Math.cos(radians), sn = Math.sin(radians)
  if (!alpha || s.solid) {
    for (const p of (alpha ? alphaParts(s) : tradeParts(s))) {
      if (!p.solid) continue
      const points = [[p.x, p.y], [p.x + p.w, p.y], [p.x, p.y + p.d], [p.x + p.w, p.y + p.d]].map(([x, y]) => {
        x -= s.w / 2
        y -= s.h / 2
        return [s.x + s.w / 2 + x * c + y * sn, s.y + s.h / 2 - x * sn + y * c]
      })
      const stand = alpha && 'stand' in p && !!p.stand
      boxes.push({
        x0: Math.min(...points.map(point => point[0])), x1: Math.max(...points.map(point => point[0])),
        y0: Math.min(...points.map(point => point[1])), y1: Math.max(...points.map(point => point[1])),
        ...(stand ? {} : { bottom: p.z }), top: p.z + p.h, stand,
      })
    }
  }
  return boxes
}

function structure(kind: string, x: number, y: number, w: number, h: number, solid: boolean, data: Structure['data'] = {}): Structure {
  return { kind: kind as Structure['kind'], x, y, w, h, solid, data }
}

for (const def of ALPHA_DEFS) {
  for (const deg of [0, 37, 90, -25]) {
    const s = structure(def.id, 13.25, -8.5, def.w * 1.17, def.d * 0.83, def.solid, { height: def.height + 0.35, z: 0.27, deg })
    check(JSON.stringify(settlementColliders(s)) === JSON.stringify(expected(s)), `alpha geometry ${def.id} at ${deg} degrees`)
    const first = settlementColliders(s)
    check(first === settlementColliders(s), `alpha cache identity ${def.id} at ${deg} degrees`)
  }
}

for (const def of TRADE_DEFS) {
  for (const deg of [0, 37, 90, -25]) {
    const s = structure(def.id, -21.5, 17.75, def.w * 1.11, def.d * 0.91, def.solid, { height: def.height + 0.2, z: 0.41, deg })
    check(JSON.stringify(settlementColliders(s)) === JSON.stringify(expected(s)), `trade geometry ${def.id} at ${deg} degrees`)
    check(settlementColliders(s) === settlementColliders(s), `trade cache identity ${def.id} at ${deg} degrees`)
  }
}

const mutable = structure('alpha_bed', 4, 5, 2.1, 1, true, { height: 0.8, z: 0.1, deg: 37, tags: ['initial'] })
let previous = settlementColliders(mutable)
check(previous === settlementColliders(mutable), 'unchanged object reuses cached array')
const refresh = (label: string, mutate: () => void): void => {
  mutate()
  const next = settlementColliders(mutable)
  check(next !== previous, `${label} invalidates cache identity`)
  check(JSON.stringify(next) === JSON.stringify(expected(mutable)), `${label} matches reference geometry`)
  previous = next
}
refresh('x', () => { mutable.x += 3 })
refresh('y', () => { mutable.y -= 2 })
refresh('dimensions', () => { mutable.w += 0.4; mutable.h += 0.2 })
refresh('kind', () => { mutable.kind = 'alpha_bedside' })
refresh('solid', () => { mutable.solid = false })
refresh('solid restore', () => { mutable.solid = true })
refresh('scalar data edit', () => { mutable.data!.height = 1.1 })
refresh('array data edit', () => {
  const tags = mutable.data!.tags
  if (!Array.isArray(tags)) throw new Error('expected tags array')
  tags.push('edited')
})
refresh('data key addition', () => { mutable.data!.extra = 'added' })
refresh('data key deletion', () => { delete mutable.data!.extra; delete mutable.data!.tags })
refresh('data replacement', () => { mutable.data = { height: 1.3, z: 0.55, deg: -25, tags: ['replacement'] } })

const other = structure('pillar', 0, 0, 2, 2, true)
check(settlementColliders(other) === null, 'non alpha/trade structure returns null')

console.log(`Outpost collider checks passed: ${checks} checks across ${ALPHA_DEFS.length} alpha and ${TRADE_DEFS.length} trade prototypes.`)
