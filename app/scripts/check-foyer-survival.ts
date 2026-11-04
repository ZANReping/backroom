import assert from 'node:assert/strict'
import { Engine } from '../src/game/engine'
import { updateSurvival } from '../src/game/engine/survival'
import { FOYER_ID } from '../src/game/world/foyerLayout'

const checks: string[] = []
const ok = (value: unknown, message: string) => { assert(value, message); checks.push(message) }
const tick = (level: number, movement = 1) => {
  const e = new Engine()
  e.newRun(424243, 'normal', `survival-${level}`, true, level)
  e.player.level = level
  e.player.hunger = 53
  e.player.thirst = 47
  e.player.hp = 100
  e.player.battery = 80
  e.player.flashlight = true
  e.player.sanity = 82
  e.player.stamina = 1
  const before = { hunger: e.player.hunger, thirst: e.player.thirst, battery: e.player.battery, sanity: e.player.sanity }
  updateSurvival(e, 10, { dmg: 1, drain: 1 }, movement)
  return { e, before }
}

const foyer = tick(FOYER_ID)
ok(foyer.e.player.hunger === foyer.before.hunger, 'foyer hunger stays fixed')
ok(foyer.e.player.thirst === foyer.before.thirst, 'foyer thirst stays fixed')
ok(foyer.e.player.battery < foyer.before.battery, 'foyer battery still drains normally')
ok(foyer.e.player.sanity !== foyer.before.sanity, 'foyer sanity systems still run')

const depleted = new Engine()
depleted.newRun(424243, 'normal', 'survival-depleted-foyer', true, FOYER_ID)
depleted.player.hunger = 0
depleted.player.thirst = 0
depleted.player.hp = 100
depleted.statusMsgT.hunger = 0
depleted.statusMsgT.thirst = 0
const depletedResult = updateSurvival(depleted, 10, { dmg: 1, drain: 1 }, 1)
ok(!depletedResult && depleted.player.hp === 100, 'foyer zero survival values do not cause starvation or dehydration damage')
ok(depleted.statusMsgT.hunger === 0 && depleted.statusMsgT.thirst === 0, 'foyer zero survival values do not issue warnings')

const idle = tick(FOYER_ID, 0)
const moving = tick(FOYER_ID)
moving.e.player.stamina = 1
updateSurvival(moving.e, 10, { dmg: 1, drain: 1 }, 1)
ok(idle.e.player.hunger === moving.e.player.hunger && idle.e.player.thirst === moving.e.player.thirst, 'foyer idle and movement ticks preserve values equally')

const backrooms = tick(0)
ok(backrooms.e.player.hunger < backrooms.before.hunger, 'backrooms hunger still drains')
ok(backrooms.e.player.thirst < backrooms.before.thirst, 'backrooms thirst still drains')

const tom = tick(104)
const tomFull = tom.before.hunger
const tomExpected = tomFull - 0.28 * (1 / 3) * 10
ok(Math.abs(tom.e.player.hunger - tomExpected) < 1e-6, 'Tom outpost keeps exact one-third hunger drain multiplier')
tom.e.player.stamina = 1
const thirstBefore = tom.e.player.thirst
updateSurvival(tom.e, 10, { dmg: 1, drain: 1 }, 1)
const thirstExpected = thirstBefore - 0.28 * (1 / 3) * 2 * 10
ok(Math.abs(tom.e.player.thirst - thirstExpected) < 1e-6, 'Tom outpost keeps low-stamina thirst doubling')

const ff = new Engine()
ff.newRun(424243, 'normal', 'survival-fast-forward', true, FOYER_ID)
ff.player.hunger = 61
ff.player.thirst = 39
const h = ff.player.hunger, t = ff.player.thirst
const { devFastForward } = await import('../src/game/engine/dev')
devFastForward(ff, 120)
ok(ff.player.hunger === h && ff.player.thirst === t, 'developer fast-forward keeps foyer survival values')
const resumed = new Engine()
resumed.newRun(424243, 'normal', 'survival-resumed', true, 0)
resumed.player.hunger = 61
resumed.player.thirst = 39
const resumedH = resumed.player.hunger
const resumedT = resumed.player.thirst
devFastForward(resumed, 120)
ok(resumed.player.hunger < resumedH && resumed.player.thirst < resumedT, 'developer fast-forward resumes consumption after leaving foyer')

console.log(JSON.stringify({ ok: true, checks: checks.length }))
