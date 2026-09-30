import assert from 'node:assert/strict'
import { Engine } from '../src/game/engine'
import { generateLevel } from '../src/game/world/mapgen'
import { levelDefOf } from '../src/game/levels'
import { doInteract, scanInteract } from '../src/game/engine/interact'
import { look } from '../src/game/renderer/shared'
import type { Structure } from '../src/game/core/types'

const make = (data: Record<string, number | string | boolean> = {}) => {
  const eng = new Engine()
  eng.map = generateLevel(levelDefOf(5)!, 424242, true)
  eng.player.level = 5
  eng.player.x = eng.map.spawn.x
  eng.player.y = eng.map.spawn.y
  eng.player.facing = 0
  eng.player.equip.pockets[0] = { type: 'keycard', count: 1 }
  eng.player.backpack[0] = { type: 'axe', count: 1 }
  const s: Structure = { kind: 'hoteldoor', x: eng.player.x + .35, y: eng.player.y - .5, w: 1, h: 1, solid: true, data: { locked: 1, open: 0, staff: 1, ...data } }
  eng.map.structures.push(s)
  eng.map.tiles[Math.floor(eng.player.y) * eng.map.w + Math.floor(eng.player.x)] = 1
  eng.map.tiles[Math.floor(s.y) * eng.map.w + Math.floor(s.x)] = 1
  look.visualHit = null
  return { eng, s }
}

const messages: string[] = []
const capture = (eng: Engine) => {
  eng.msg = ((text: string) => messages.push(text)) as Engine['msg']
  const events: unknown[] = []
  eng.emit = ((event: unknown) => events.push(event)) as Engine['emit']
  return events
}

{
  const { eng, s } = make()
  const events = capture(eng)
  scanInteract(eng)
  assert.equal(eng.interactTarget?.s, s, 'staff door should be selected')
  assert.match(eng.interactTarget?.label ?? '', /刷员工卡 打开员工门/)
  assert.equal(eng.hasItem('axe'), true, 'fixture must carry an axe')
  eng.axeDur = 4
  doInteract(eng)
  assert.equal(s.data?.locked, 0)
  assert.equal(s.data?.open, 1)
  assert.equal(s.solid, false)
  assert.equal(eng.hasPocket('keycard'), true, 'staff card must remain equipped')
  assert.equal(eng.axeDur, 4, 'staff card must not consume axe durability')
  const door = events.find((e: any) => e?.kind === 'mpevent') as any
  assert.deepEqual(door?.mp, { t: 'door', x: s.x + (eng.map!.inf?.ox ?? 0), y: s.y + (eng.map!.inf?.oy ?? 0), open: true })
}
{
  const { eng, s } = make()
  s.data = { ...s.data, staff: 0 }
  scanInteract(eng)
  assert.match(eng.interactTarget?.label ?? '', /需要撬棍\/万能钥匙\/斧头/)
  doInteract(eng)
  assert.equal(s.data?.locked, 1)
  assert.equal(s.solid, true)
}
{
  const { eng, s } = make({ sealed: 1 })
  scanInteract(eng)
  assert.match(eng.interactTarget?.label ?? '', /锁死的门/)
  doInteract(eng)
  assert.equal(s.data?.locked, 1, 'sealed staff door must remain locked')
  assert.equal(s.solid, true)
}
console.log('L5 staff access checks passed: keycard unlock, inventory/axe preservation, ordinary-door rejection, sealed-door rejection, and world-space door event.')
