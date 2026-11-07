import type { Engine } from '../engine'
import { L5_STAFF } from '../content/l5Staff'
import { chefSiteAt } from '../content/chefLayout'
import { jazzSiteOf } from '../content/jazzLayout'
import { look } from '../renderer/shared'
import { casinoDoorTile, CASINO_DOOR, genL5ChunkRaw, l5HallRect, l5LobbyDoorCandidate, l5SpawnElevSlot } from '../world/infiniteL5'
import { CS, chunkKey } from '../world/infinite'
import { tileAt } from '../world/mapgen'
import { casinoEnter } from './casinoAI'
import { conciergeDesk, spawnConcierge } from './conciergeAI'
import { devMapTeleport } from './devMap'
import { nextMapSeed } from './level'
import { hotelEnterPocket, hotelRevealLobbyDoor, POCKET_LEVEL } from './l5Hotel'
import { spokesSave } from './spokesAI'

export type DevHotelTarget = 'elevator' | 'casinoDoor' | 'lobbyDoor' | 'casino'
export type DevHotelArrival = 'casinoDoor' | 'concierge' | 'greeter' | 'beast'

type Point = { x: number; y: number }
const DIRECTIONS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const world = (eng: Engine, point: Point): Point => ({ x: point.x + (eng.map?.inf?.ox ?? 0), y: point.y + (eng.map?.inf?.oy ?? 0) })
const local = (eng: Engine, point: Point): Point => ({ x: point.x - (eng.map?.inf?.ox ?? 0), y: point.y - (eng.map?.inf?.oy ?? 0) })
const available = (eng: Engine) => eng.devEnabled && eng.levelDef.id === 5 && !!eng.map?.inf && !eng.transition && !eng.over
const fail = (eng: Engine, message: string) => { eng.msg('[DEV] ' + message, 'system'); return false }

export function devHotelSetAttention(eng: Engine, value: number) {
  if (available(eng) && Number.isFinite(value)) eng.hotel.attn = Math.max(0, Math.min(100, Math.round(value)))
}
export function devHotelToggleAttentionLock(eng: Engine) {
  if (available(eng)) eng.dev.hotelAttentionLock = !eng.dev.hotelAttentionLock
}

async function goNear(eng: Engine, point: Point, preferred: Point, label: string, accept: (p: Point) => boolean) {
  const moved = await devMapTeleport(eng, { ...preferred, floor: 0 }, (x, y) => {
    const map = eng.map!, i = Math.floor(y) * map.w + Math.floor(x)
    return map.elev[i] !== 4 && !(map.stair[i] & 7) && accept(world(eng, { x, y }))
  })
  if (!moved) return false
  eng.seating = eng.ride = eng.climb = eng.porchDrop = null
  eng.searching = eng.lootPanel = eng.interactTarget = null
  eng.onStairs = false
  eng.moveIt.acc = 0
  const p = world(eng, eng.player), dx = point.x - p.x, dy = point.y - p.y
  look.yaw = Math.atan2(-dx, -dy); look.pitch = 0
  eng.player.facing = Math.atan2(dy, dx)
  eng.msg('[DEV] 已传送到' + label, 'system')
  return true
}

function goDoor(eng: Engine, point: Point, facing: Point | undefined, label: string) {
  const toward = facing ?? { x: 0, y: 0 }
  const preferred = { x: point.x + toward.x * 1.1, y: point.y + toward.y * 1.1 }
  return goNear(eng, point, preferred, label, p => {
    if (distance(point, p) > 2.25 || distance(point, p) < .55) return false
    if (facing && (p.x - point.x) * facing.x + (p.y - point.y) * facing.y < .5) return false
    const a = local(eng, p), b = local(eng, point)
    // Stop the visibility check just in front of the door's solid panel.
    const endX = b.x + (a.x - b.x) * .37, endY = b.y + (a.y - b.y) * .37
    return eng.los(a.x, a.y, endX, endY)
  })
}

function wallFacing(at: Point, isWall: (x: number, y: number) => boolean) {
  const wall = DIRECTIONS.find(d => isWall(at.x + d.x, at.y + d.y))
  return wall && { x: -wall.x, y: -wall.y }
}

function nearest<T extends Point>(items: T[], point: Point) {
  return items.reduce<T | undefined>((best, item) => !best || distance(item, point) < distance(best, point) ? item : best, undefined)
}

function lobbyDoor(eng: Engine) {
  const map = eng.map!, inf = map.inf!, p = world(eng, eng.player)
  const isDoor = (s: { kind: string; data?: { pocket?: unknown } }) => s.kind === 'l5pocketdoor' && s.data?.pocket === 'lobby'
  const live = nearest(map.structures.filter(isDoor), eng.player)
  if (live) {
    const at = world(eng, live)
    const wall = live.data?.event ? DIRECTIONS[(Number(live.data.wall) + 1) & 3] : undefined
    return { at, facing: wall ? { x: -wall.x, y: -wall.y } : wallFacing(live, (x, y) => tileAt(map, x, y) !== 1) }
  }

  // Only build raw data for chunks that passed the same sparse door roll as generation.
  const cx = Math.floor(p.x / CS), cy = Math.floor(p.y / CS)
  for (let r = 0; r <= 12; r++) {
    const found: { at: Point; facing?: Point }[] = []
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || inf.chunks.has(chunkKey(x, y)) ||
        !l5LobbyDoorCandidate(inf.seed, x, y, inf.l5Floor ?? eng.hotel.floor)) continue
      const raw = genL5ChunkRaw(eng.levelDef, inf.seed, x, y)
      const at = raw.structures.find(isDoor)
      if (at) found.push({ at, facing: wallFacing(at, (wx, wy) => raw.tiles[(wy - y * CS) * CS + wx - x * CS] !== 1) })
    }
    if (found.length) return found.sort((a, b) => distance(a.at, p) - distance(b.at, p))[0]
  }
  return undefined
}

function goCasinoDoor(eng: Engine) {
  const inf = eng.map?.inf
  const tile = inf && casinoDoorTile(inf.seed, inf.l5Floor ?? eng.hotel.floor)
  if (!tile) return fail(eng, '本局 1F 未找到赌场门。可使用「直接进入赌场」。')
  return goDoor(eng, { x: tile.x + .5, y: tile.y }, { x: 0, y: 1 }, '赌场门口')
}

function goFirstFloor(eng: Engine, arrival: 'casinoDoor' | 'concierge') {
  const from = eng.hotel.floor
  eng.hotel.floor = CASINO_DOOR.floor
  const seed = nextMapSeed(eng, 5)
  if (arrival === 'casinoDoor' && !casinoDoorTile(seed, CASINO_DOOR.floor)) {
    eng.hotel.floor = from
    return fail(eng, '1F 未找到赌场门。可使用「直接进入赌场」。')
  }
  eng.transition = { anim: 'shutter', t: 0, dest: 5, mapSeed: seed, devHotelArrival: arrival }
  eng.emit({ kind: 'transition', anim: 'shutter', dest: 5 })
  return true
}

export async function devHotelGo(eng: Engine, target: DevHotelTarget): Promise<boolean> {
  if (!available(eng)) return false
  const map = eng.map!, inf = map.inf!, floor = inf.l5Floor ?? eng.hotel.floor
  if (target === 'casino') return casinoEnter(eng)
  if (target === 'casinoDoor') return floor === CASINO_DOOR.floor ? goCasinoDoor(eng) : goFirstFloor(eng, 'casinoDoor')
  if (target === 'lobbyDoor') {
    const door = lobbyDoor(eng)
    if (!door) return fail(eng, '附近未找到大堂门。')
    const { at, facing } = door
    const moved = await goDoor(eng, { x: at.x + .5, y: at.y + .5 }, facing, '大堂门口')
    if (moved && eng.map === map) hotelRevealLobbyDoor(eng, at.x, at.y)
    return moved
  }
  const service = floor === 0 && nearest(map.structures.filter(s => s.kind === 'hotelwindow' && s.data?.profile === 'serviceLift'), eng.player)
  if (service) {
    const at = world(eng, service), facing = wallFacing(service, (x, y) => tileAt(map, x, y) !== 1)
    return goDoor(eng, { x: at.x + .5, y: at.y + .5 }, facing, '维护电梯')
  }
  const live = nearest(map.exits.filter(e => e.def.kind === 'elevatorshaft'), eng.player)
  const slot = l5SpawnElevSlot(inf.seed)
  const at = live ? world(eng, live) : slot
  if (!at) return fail(eng, '本楼层未找到电梯。')
  const facing = slot && distance(at, slot) < .1 ? { x: slot.x - slot.bx, y: slot.y - slot.by } : undefined
  return goDoor(eng, { x: at.x + .5, y: at.y + .5 }, facing, '电梯')
}

function goStaff(eng: Engine, type: string) {
  const person = nearest(eng.map!.entities.filter(e => e.def.type === type && !e.dead && !e.hidden), eng.player)
  if (!person) return undefined
  const at = world(eng, person)
  const preferred = { x: at.x + Math.cos(person.facing) * 1.8, y: at.y + Math.sin(person.facing) * 1.8 }
  return goNear(eng, at, preferred, person.def.name + '身旁', p => {
    const d = distance(p, at), a = local(eng, p), b = local(eng, at)
    return d >= 1.45 && d <= 3 && eng.los(a.x, a.y, b.x, b.y)
  })
}

async function goRestaurant(eng: Engine, type: 'chef' | 'jazz') {
  const inf = eng.map!.inf!, p = world(eng, eng.player)
  const sites = []
  const cx = Math.floor(p.x / 40), cy = Math.floor(p.y / 40)
  for (let y = cy - 5; y <= cy + 5; y++) for (let x = cx - 5; x <= cx + 5; x++) {
    const site = chefSiteAt(inf.seed, x, y)
    if (site) sites.push(site)
  }
  const site = sites.sort((a, b) => distance(a.front, p) - distance(b.front, p))[0]
  if (!site) return fail(eng, '附近未找到有员工的餐厅。')
  const jazz = type === 'jazz' ? jazzSiteOf(site) : undefined
  const at = jazz?.stageC ?? site.at.stove
  const preferred = jazz?.audC ?? { x: at.x, y: at.y + 1.75 }
  const label = type === 'chef' ? '厨师值班的灶台旁' : '爵士脑所在餐厅的舞台前'
  return goNear(eng, at, preferred, label, p => distance(p, preferred) <= 2)
}

export async function devHotelGotoStaff(eng: Engine, type: string): Promise<boolean> {
  if (!available(eng)) return false
  const staff = L5_STAFF.find(s => s.id === type)
  if (!staff) return false
  const nearby = goStaff(eng, type)
  if (nearby) return nearby
  if (type === 'chef' || type === 'jazz') return goRestaurant(eng, type)
  if (type === 'concierge') {
    if (eng.hotel.floor !== 1) return goFirstFloor(eng, 'concierge')
    const map = eng.map!, hall = l5HallRect(map.inf!.seed, 0, 0)
    const top = local(eng, { x: hall.x0, y: hall.y0 }), bottom = local(eng, { x: hall.x1, y: hall.y1 })
    if (top.x < 1 || top.y < 1 || bottom.x >= map.w - 1 || bottom.y >= map.h - 1) {
      const center = { x: (hall.x0 + hall.x1 + 1) / 2, y: (hall.y0 + hall.y1 + 1) / 2 }
      if (!await goNear(eng, center, center, '1F 主厅', p => distance(p, center) <= 2) || !available(eng)) return false
    }
    if (conciergeDesk(eng) && spawnConcierge(eng)) return goStaff(eng, type) ?? false
  }
  if (type === 'beast' || (type === 'greeter' && !spokesSave(eng).freed)) {
    if (!hotelEnterPocket(eng, type === 'greeter' ? 'lobby' : 'beast', { dev: true })) return false
    eng.transition!.devHotelArrival = type
    return true
  }
  return fail(eng, staff.name + '当前未出现。')
}

export async function devFinishHotelArrival(eng: Engine, arrival: DevHotelArrival): Promise<boolean> {
  if (!eng.devEnabled || !eng.map) return false
  if (arrival === 'casinoDoor' && eng.levelDef.id === 5) return goCasinoDoor(eng)
  if (arrival === 'concierge' && eng.levelDef.id === 5) return devHotelGotoStaff(eng, arrival)
  if ((arrival === 'greeter' && eng.levelDef.id === POCKET_LEVEL.lobby) || (arrival === 'beast' && eng.levelDef.id === POCKET_LEVEL.beast))
    return goStaff(eng, arrival) ?? fail(eng, '员工当前未出现。')
  return false
}

