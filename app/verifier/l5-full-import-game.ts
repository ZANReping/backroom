import { floorHeight } from '../src/game/world/mapgen'
import { canOccupy, PLAYER_RADIUS } from '../src/game/core/player'
import { levelDefOf } from '../src/game/levels'
import { CASINO_DOOR, casinoDoorTile, genL5ChunkRaw, l5SpawnElevSlot } from '../src/game/world/infiniteL5'
import { look } from '../src/game/renderer/shared'
import { openElevator } from '../src/game/engine/l5Elevator'
import { hotelEnterPocket } from '../src/game/engine/l5Hotel'
import { casinoCanLeave, casinoCloseMenu, casinoOpenMenu, casinoPhase, casinoSave, casinoSlot } from '../src/game/engine/casinoAI'
import { staffList } from '../src/game/engine/casinoStaff'

export function mount(api: any) {
  const e = api.engine, r = api.renderer()
  const checks: string[] = []
  const ok = (value: unknown, message: string) => {
    if (!value) throw Error(message)
    checks.push(message)
  }
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  const point = () => ({
    x: e.player.x + (e.map.inf?.ox ?? 0), y: e.player.y + (e.map.inf?.oy ?? 0),
    z: e.player.z, seed: e.mapSeed, floor: e.hotel.floor,
  })
  const summary = () => ({
    level: e.player.level, point: point(), checks: [...checks],
    draws: r.three.info.render.calls, triangles: r.three.info.render.triangles,
  })
  const control = () => {
    e.dev.god = true
    e.dev.statLock = true
    e.dev.frozenAI = true
    e.introT = 0
    e.handsStowed = true
  }
  const ready = async () => {
    const until = performance.now() + 90000
    while (!r.isNearWorldReady(e) || e.transition || document.querySelector('.loading-screen')) {
      if (performance.now() > until) throw Error('World not ready')
      await sleep(120)
    }
    await sleep(400)
  }
  const verifyFloor = async (floor: number) => {
    control()
    await ready()
    const m = e.map, def = levelDefOf(5, floor)!
    ok(e.player.level === 5 && e.hotel.floor === floor && m.inf.l5Floor === floor, 'Correct loaded hotel floor ' + floor)
    const chunk = [...m.inf.chunks.values()][0] as any
    const raw = genL5ChunkRaw(def, e.mapSeed, chunk.cx, chunk.cy)
    ok(raw.tiles.every((tile, i) => tile === chunk.tiles[i]), 'Streamed tiles match floor-specific generation ' + floor)
    ok(!!document.querySelector('[data-l5-minimap]'), 'L5 minimap rendered ' + floor)
    if (floor !== 1) {
      const slot = l5SpawnElevSlot(e.mapSeed)!, position = point()
      ok(Math.hypot(position.x - slot.x - .5, position.y - slot.y - .5) <= 3.1, 'Elevator arrives next to the start elevator ' + floor)
    }
    return summary()
  }
  let origin: ReturnType<typeof point>
  const saveOrigin = () => { origin = point() }
  const verifyReturn = async () => {
    await ready()
    const p = point()
    ok(e.player.level === 5 && p.floor === origin.floor && p.seed === origin.seed, 'Returns to same hotel floor and seed')
    ok(Math.hypot(p.x - origin.x, p.y - origin.y, p.z - origin.z) < .06, 'Returns to same entrance coordinates')
    ok(canOccupy(e.map, e.player.x, e.player.y, PLAYER_RADIUS, { z: p.z }), 'Return collision clear')
    return summary()
  }
  const takeBack = () => {
    const exit = e.map.exits.find((s: any) => s.def.dest === 'back')
    if (!exit) throw Error('No generated return exit')
    e.takeExit(exit.def)
  }
  const setCasinoTime = (open: boolean) => {
    for (let t = 0; t < 1440; t += 5) {
      const phase = casinoPhase(e.seed, t)
      if (phase.open === open && phase.left > 120) { e.time = t; return }
    }
    throw Error('No casino schedule phase')
  }
  return {
    summary,
    one: () => verifyFloor(1), six: () => verifyFloor(6), basement: () => verifyFloor(0), four: () => verifyFloor(4),
    elevator: (service = false) => { openElevator(e, service ? 'service' : 'main'); return true },
    upperOutpost: () => { saveOrigin(); ok(e.enterOutpost('housekeeping', true), 'Enter outpost from 6F'); return true },
    takeBack, verifyReturn,
    casinoDoor: async () => {
      const q = casinoDoorTile(e.mapSeed, CASINO_DOOR.floor)
      ok(q, 'Generated casino door on configured floor')
      const inf = e.map.inf
      look.yaw = Math.PI; look.pitch = 0
      Object.assign(e.player, {x:q!.x+.5-inf.ox, y:q!.y+.58-inf.oy, z:0, vz:0})
      e.updateInfiniteWindow()
      const p = e.player
      p.z = floorHeight(e.map, p.x, p.y)
      const door = e.map.structures.find((s: any) => s.kind === 'casinodoor' && s.x + e.map.inf.ox === q!.x && s.y + e.map.inf.oy === q!.y)
      ok(door, 'Casino door loaded in actual game')
      ok(canOccupy(e.map, p.x, p.y, PLAYER_RADIUS, { z: p.z }), 'Casino entrance approach is safe')
      await ready()
      setCasinoTime(false); look.yaw = 0
      await sleep(600)
      ok(!e.transition && e.player.level === 5, 'Casino door blocks entry outside opening hours')
      saveOrigin()
      return summary()
    },
    openCasino: () => { setCasinoTime(true); return true },
    casino: async () => {
      await ready()
      ok(e.player.level === 119 && staffList(e).length >= 10, 'Casino opens with staff')
      ok(!!document.querySelector('[data-casino-hud]'), 'Casino HUD visible')
      return summary()
    },
    slot: async () => {
      const state = casinoSave(e)
      state.chips = 50
      ok(casinoOpenMenu(e, 'slot'), 'Slot opens in gameplay')
      const spin = casinoSlot(e, 5)
      ok(spin && state.chips === 45 + spin.win, 'Slot settles the visible wager once')
      await sleep(900)
      return summary()
    },
    reloadCasino: async () => {
      casinoCloseMenu(e, true)
      const chips = casinoSave(e).chips
      e.persist()
      e.newRun(e.seed, 'normal', e.saveSlot, false)
      control()
      await ready()
      ok(e.player.level === 119 && staffList(e).length >= 10, 'Casino staff restored after save and reload')
      ok(casinoSave(e).chips === chips, 'Casino balance restored')
      ok(e.career.returnAnchor?.hotelFloor === origin.floor && e.career.returnAnchor?.mapSeed === origin.seed, 'Hotel return anchor survives save and reload')
      return summary()
    },
    casinoExit: () => {
      const state = casinoSave(e)
      state.purple = -5
      takeBack()
      ok(!casinoCanLeave(e) && !e.transition, 'Negative purple balance blocks the real exit')
      state.purple = 0
      takeBack()
      ok(e.transition?.dest === 5, 'Cleared balance allows exit')
      return true
    },

    enterOffice: () => {
      const { x, y, z } = e.player
      const space = [[0, 3], [3, 0], [-3, 0]].find(([dx, dy]) =>
        canOccupy(e.map, x + dx, y + dy, PLAYER_RADIUS, { z }))
      ok(space, 'Safe office approach away from casino door')
      e.player.x += space![0]; e.player.y += space![1]
      saveOrigin()
      ok(hotelEnterPocket(e, 'beast'), 'Enter hotel pocket office')
      return true
    },
    office: async () => {
      await ready()

      const beast = e.map.entities.find((x: any) => x.def.type === 'beast')
      ok(e.player.level === 117 && beast, 'Pocket office and Beast loaded')
      look.yaw = Math.atan2(e.player.x - beast.x, e.player.y - beast.y)
      look.pitch = -.04
      await sleep(1400)
      return summary()
    },
  }
}

