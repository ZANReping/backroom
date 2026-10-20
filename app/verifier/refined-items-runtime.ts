import { Engine } from '../src/game/engine'
import { look } from '../src/game/renderer'
import { audio } from '../src/game/core/audio'
import { REFINED_ITEM_TYPES } from '../src/game/renderer/refinedItemMesh'
import type { GameMap } from '../src/game/world/mapgen'

/** Uses production single-player inventory/reticle paths, without a run or save. */
export function verifyRefinedItemRuntime() {
  const savedLook = { ...look }, savedSong = audio.onSongPlayed, savedEnd = audio.onOneshotEnd
  const results: string[] = [], check = (ok: unknown, label: string) => { if (!ok) throw Error(label); results.push(label) }
  const e = new Engine(), p = e.player, zero = () => new Uint8Array(64)
  e.map = { w: 8, h: 8, tiles: new Uint8Array(64).fill(1), structures: [], items: [], lights: [], exits: [], entities: [], spawn: { x: 4, y: 4 },
    wet: zero(), elev: zero(), outdoor: zero(), step: zero(), crawl: zero(), ceiling: zero(), up: zero(), upWall: zero(), up2: zero(), upWall2: zero(), stair: new Int32Array(64),
    liquid: zero(), seaFloor: new Float32Array(64), floors: 1, dn: zero(), dnWall: zero(), tint: zero() } satisfies GameMap
  Object.assign(p, { x: 4, y: 4, z: 0, floor: 0, level: 4 })
  p.hotbar.fill(null); p.backpack.fill(null)
  const documents: string[] = []
  e.listeners.push(event => { if (event.kind === 'doc') documents.push(event.text) })
  try {
    for (const type of REFINED_ITEM_TYPES) {
      p.hotbar[0] = { type, count: 1 }; p.selected = 0; e.dropSlot('hotbar', 0)
      const item = e.map.items.at(-1)!
      check(item?.type === type && item.count === 1 && !p.hotbar[0], `${type}: drop preserves ID/count`)
      const dx = item.x - p.x, dy = item.y - p.y, dz = .22 - 1.55
      Object.assign(look, { visualHit: null, yaw: Math.atan2(-dx, -dy), pitch: Math.atan2(dz, Math.hypot(dx, dy)), rayX: dx, rayY: dy, rayZ: dz })
      e.scanInteract(); check(e.interactTarget?.it === item, `${type}: reticle detects dropped item`)
      e.doInteract()
      if (type === 'welcomenote') check(e.countItem(type) === 0 && !e.map.items.includes(item) && documents.filter(id => id === 'welcome_note').length === 1, `${type}: original document archive action`)
      else check(e.countItem(type) === 1 && !e.map.items.includes(item), `${type}: pickup returns exactly one item`)
      p.hotbar.fill(null); p.backpack.fill(null)
    }
    return { passed: results.length, results, scope: 'isolated single-player engine; no saves or running world modified' }
  } finally { Object.assign(look, savedLook); audio.onSongPlayed = savedSong; audio.onOneshotEnd = savedEnd }
}
