import { coalesceL1Runs } from '../src/game/renderer/l1ServiceRuns'

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const input = [
  { key: 'b', start: 0, end: 1 },
  { key: 'a', start: -2, end: -1 },
  { key: 'a', start: -1, end: 0 },
  { key: 'a', start: 0.5, end: 1 },
  { key: 'a', start: 1.00000005, end: 2 },
  { key: 'a', start: 3, end: 4 },
  { key: 'b', start: 1, end: 2 },
]
const before = JSON.stringify(input)
const merged = coalesceL1Runs(input)
if (!same(merged, [
  { key: 'a', start: -2, end: 0 },
  { key: 'a', start: 0.5, end: 2 },
  { key: 'a', start: 3, end: 4 },
  { key: 'b', start: 0, end: 2 },
])) throw new Error(`unexpected merge: ${JSON.stringify(merged)}`)
if (JSON.stringify(input) !== before) throw new Error('input was modified')
if (coalesceL1Runs([]).length !== 0) throw new Error('empty input failed')
for (const bad of [{ key: 'x', start: NaN, end: 1 }, { key: 'x', start: 0, end: Infinity }, { key: 'x', start: 1, end: 1 }]) {
  try { coalesceL1Runs([bad]); throw new Error('invalid run accepted') } catch (e) { if (!(e instanceof RangeError)) throw e }
}
console.log('L1 service run checks passed')
