import assert from 'node:assert/strict'
import { ChunkBuildQueue } from '../src/game/renderer/chunkBuildQueue'

let now = 0
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } })
let checks = 0
const check = (value: unknown, message: string) => { assert.ok(value, message); checks++ }
const queue = new ChunkBuildQueue<{ key: string; iter: Generator<void, void, unknown> }>()
const events: string[] = []
const make = (key: string, steps: number, onStart?: () => void) => {
  function* work() {
    let started = false
    try {
      for (let i = 0; i < steps; i++) {
        if (!started) { started = true; onStart?.() }
        events.push(`${key}:${i}`)
        yield
      }
    } finally { if (started) events.push(`${key}:finally`) }
  }
  return {key, iter: work()}
}

const duplicate = make('duplicate', 1)
queue.add(duplicate); queue.add(make('duplicate', 1))
check(queue.size === 1 && queue.first === duplicate && queue.has('duplicate'), 'add deduplicates and exposes first, size, and has')
queue.advance(100, 1)
check(queue.size === 1, 'a yielded task remains queued')
queue.advance(100, 2)
check(queue.size === 0, 'completed task leaves the queue')

events.length = 0
queue.add(make('a', 3)); queue.add(make('b', 3))
queue.advance(100, 4)
check(events.join(',') === 'a:0,b:0,a:1,b:1', 'advancement alternates between queued generators')
queue.advance(100, 10)
check(events.filter(event => event.endsWith(':2')).length === 2, 'both round-robin tasks complete')

events.length = 0
queue.add(make('limit', 4)); queue.add(make('other', 1))
queue.advance(100, 1)
check(events.join(',') === 'limit:0', 'stepLimit bounds work to one step')
queue.cancelWhere(job => job.key === 'limit')
check(!queue.has('limit') && queue.has('other'), 'cancelWhere only removes matching jobs')
queue.advance(100, 10)
check(events.includes('other:0') && !events.includes('limit:1'), 'canceled work does not publish later steps')

events.length = 0; now = 0
queue.add(make('started', 3)); queue.add(make('never-started', 2))
queue.advance(100, 1)
queue.cancelWhere(job => job.key === 'started' || job.key === 'never-started')
check(events.includes('started:finally'), 'started generator finally runs on cancellation')
check(events.filter(event => event === 'started:finally').length === 1, 'started generator finally runs exactly once')
check(!events.some(event => event.startsWith('never-started')), 'unstarted generator never executes')
check(queue.size === 0, 'cancellation removes all matching work')

now = 0; events.length = 0
function* clockedWork() { for (let i = 0; i < 5; i++) { events.push(`clocked:${i}`); now += 2; yield } }
const clocked = {key: 'clocked', iter: clockedWork()}
queue.add(clocked); queue.advance(3, 20)
check(events.length > 0 && events.length < 5, 'time budget stops work before all steps run')
queue.cancelWhere(() => true)

console.log(JSON.stringify({passed: checks}))
