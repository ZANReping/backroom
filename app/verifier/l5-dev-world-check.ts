import type { Engine } from '../src/game/engine'
import { canOccupy, PLAYER_RADIUS } from '../src/game/core/player'
import { casinoDoorTile } from '../src/game/world/infiniteL5'
import { openElevator, elevatorGo } from '../src/game/engine/l5Elevator'
import { hotelAddAttn, hotelSetAttn, hotelLobbyShown } from '../src/game/engine/l5Hotel'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const ok = (condition: unknown, label: string) => { if (!condition) throw Error(label) }
export function mount(api: { engine: Engine }) {
  const e = api.engine
  const sec = () => document.querySelector('[data-dev-l5-section]')
  const btn = (label: string, root: ParentNode = document) => [...root.querySelectorAll('button')].find(b => b.textContent?.trim() === label)
  const click = (label: string, root: ParentNode = sec() ?? document) => {
    const b = btn(label, root)
    ok(b, 'Missing action ' + label)
    b!.click()
  }
  const wx = () => e.player.x + (e.map?.inf?.ox ?? 0), wy = () => e.player.y + (e.map?.inf?.oy ?? 0)
  const loc = () => ({ x: wx(), y: wy(), level: e.player.level, floor: e.map?.inf?.l5Floor })
  const safe = () => canOccupy(e.map!, e.player.x, e.player.y, PLAYER_RADIUS, { z: e.player.z, band: e.player.floor })
  const checkScope = (l5: boolean, l02: boolean) => {
    ok(!!sec() === l5 && !!document.querySelector('[data-dev-l02-section]') === l02, 'Incorrect world section visibility ' + JSON.stringify(loc()))
    return loc()
  }
  const nearest = (xs: { x: number; y: number }[], dx = .5, dy = .5) =>
    Math.min(...xs.map(s => Math.hypot(s.x + dx - e.player.x, s.y + dy - e.player.y)))
  return {
    checkScope, click, loc,
    async showWorld() {
      if (btn('世界')) click('世界', document)
      else { document.querySelector<HTMLButtonElement>('[aria-label="展开开发者面板"]')?.click(); await sleep(180); click('世界', document) }
      await sleep(180)
      return true
    },
    async attention() {
      checkScope(true, false)
      click('关注度锁定：关'); click('设为 100')
      const i = sec()?.querySelector<HTMLInputElement>('[data-dev-l5-attention]')
      ok(i && e.hotel.attn === 100 && e.dev.hotelAttentionLock, 'Attention max and lock')
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(i, '64'); i!.dispatchEvent(new Event('input', { bubbles: true }))
      ok(e.hotel.attn === 64, 'Attention slider')
      hotelAddAttn(e, 60); hotelSetAttn(e, 8)
      await sleep(650)
      ok(e.hotel.attn === 64 && !e.hotelGazeT, 'Lock should preserve attention through gain and decay')
      click('关注度锁定：开')
      hotelAddAttn(e, -20)
      ok(e.hotel.attn < 45 && !e.dev.hotelAttentionLock, 'Unlocked attention did not change')
      click('清零')
      return { value: e.hotel.attn, editsWhileLocked: true, lockedAboveThreshold: true }
    },
    async elevator() {
      click('传送到电梯')
      await sleep(220)
      ok(nearest(e.map!.exits.filter(s => s.def.kind === 'elevatorshaft')) < 2.3 && safe(), 'Missing or unsafe elevator arrival')
      return loc()
    },
    async casinoDoor() {
      const m = e.map!, inf = m.inf!, tile = casinoDoorTile(inf.seed, inf.l5Floor)
      ok(tile, 'No authored casino entrance')
      const delta = Math.hypot(wx() - tile!.x - .5, wy() - tile!.y)
      ok(delta < 2.3 && wy() > tile!.y + .5 && safe(), 'Did not arrive on correct side of casino door')
      return { ...loc(), distance: delta }
    },
    async lobbyDoor() {
      click('传送到大堂门口')
      await sleep(260)
      const door = e.map!.structures.find(s => s.kind === 'l5pocketdoor' && s.data?.pocket === 'lobby' && nearest([s]) < 2.3)
      ok(door && hotelLobbyShown(e, door) && safe(), 'Did not arrive at a visible lobby door')
      return loc()
    },
    async staff(type: string, label?: string) {
      if (label) { click(label); await sleep(480) }
      const entities = e.map!.entities.filter(x => !x.dead && x.def.type === type)
      const d = nearest(entities, 0, 0)
      ok(safe() && d < 3.2 && d > .8, 'Missing or unsafe staff arrival ' + type + ' ' + d + ' ' + JSON.stringify(loc()))
      return { ...loc(), distance: d }
    },
    floor(n: number) {
      openElevator(e, 'main'); elevatorGo(e, n)
      ok(e.transition?.dest === 5, 'Elevator did not start floor change')
      return true
    },
    leavePocket() {
      const back = e.levelDef.exits.find(x => x.dest === 'back')
      ok(back, 'Missing back exit')
      e.takeExit(back!)
      ok(e.transition?.dest === 5, 'Pocket return not scheduled')
      return true
    },
    returned(from: { x: number; y: number; floor: number }) {
      ok(e.map?.inf?.l5Floor === from.floor && Math.hypot(wx() - from.x, wy() - from.y) < 1.5 && safe(), 'Pocket return did not preserve floor and position')
      return loc()
    },
  }
}

