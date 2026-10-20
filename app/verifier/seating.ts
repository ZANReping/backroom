import * as THREE from 'three'
import type { GameMap } from '../src/game/world/mapgen'
import type { Structure } from '../src/game/core/types'
import { floorHeight } from '../src/game/world/mapgen'
import { canOccupy } from '../src/game/core/player'
import { furnitureSeats } from '../src/game/content/furnitureSeats'
import { seatsFor } from '../src/game/world/seating'
import { buildStructure } from '../src/game/renderer/structures'
import { syncFurnitureSeats } from '../src/game/renderer/furnitureSeats'
import { syncStructureModelColliders } from '../src/game/renderer/renderer'
import { beginSitting, pickSeat, updateSitting, standUp, seatedEyeHeight, seatedEyeOffset, sittingSafePosition } from '../src/game/engine/seating'
import { crosshairRay } from '../src/game/engine/interact'
import { throwHeld } from '../src/game/engine/combat'
import { levelDefOf } from '../src/game/levels'

const check = (condition: unknown, message: string) => { if (!condition) throw Error(message) }
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
async function frames(n = 4) { for (let i = 0; i < n; i++) await frame() }
const neutral = (e: any) => Object.assign(e.input, { mx: 0, my: 0, interact: false, attack: false, jump: false, crouch: false, sprint: false })

function room(): GameMap {
  const w = 24, n = w * w, a = () => new Uint8Array(n), tiles = a().fill(1)
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if (!x || !y || x === w - 1 || y === w - 1) tiles[y * w + x] = 2
  return { w, h: w, tiles, wet: a(), elev: a(), outdoor: a(), step: a(), crawl: a(), ceiling: a(), up: a(), upWall: a(), up2: a(), upWall2: a(), stair: new Int32Array(n), liquid: a(), seaFloor: new Float32Array(n), dn: a(), dnWall: a(), tint: a(), floors: 1, spawn: { x: 12, y: 13 }, structures: [], entities: [], items: [], exits: [], lights: [{ x: 12, y: 12, on: true, intensity: 1.0, color: '#fff2d8', radius: 12 } as any] }
}
function object(kind = 'table', data: Record<string, any> = { chair: 1 }, w = 1, h = 1): Structure {
  return { kind: kind as any, x: 11 - w / 2, y: 11 - h / 2, w, h, solid: true, data }
}
const families: [string, Record<string, any>, number, number, number][] = [
  ['table', { chair: 1 }, 1, 1, 108], ['table', { chair: 1, l0Furniture: 1 }, .6, .6, 0],
  ['officechair', {}, 1, 1, 108], ['officechair', { l4: 1, deg: 90 }, 1, 1, 4],
  ['loungechair', {}, 1, 1, 108], ['bench', { deg: 90 }, 2, 1, 108], ['sofa', { deg: 35 }, 2, 1, 108],
  ['sofa', { deg: 90, l5: 1 }, 2, 1, 5], ['l5_antique_sofa', { deg: 0 }, 2, 1, 108], ['l5_pool_bench', {}, 1, 1, 108],
  ['gymbench', { deg: 90 }, 1, 2, 108], ['l9patiochair', { deg: 90 }, 1, 1, 9],
  ['alpha_chair', {}, .5, .54, 108], ['alpha_swivel', {}, .6, .65, 108], ['alpha_archive_chair', {}, .65, .68, 108],
  ['alpha_executive_chair', {}, .76, .78, 108], ['alpha_hall_seat', {}, .72, .85, 108], ['alpha_reading_chair', {}, .86, .88, 108],
  ['alpha_bench', {}, 2.1, .55, 108], ['alpha_waiting_seats', {}, 3.2, 1.15, 108], ['alpha_executive_sofa', {}, 2.5, .9, 108],
  ['alpha_home_table', {}, 2.3, 1.8, 108], ['l11_task_chair', {}, .65, .65, 108], ['l11_cafe_chair', {}, .5, .55, 108],
  ['l11_dining_chair', {}, .5, .55, 108], ['l11_armchair', {}, .9, .9, 108], ['l11_sofa', {}, 2.2, .9, 108],
  ['l11_park_bench', {}, 1.9, .65, 108], ['l11_gym_bench', {}, 2, .5, 108], ['l11_picnic_table', {}, 2, 1.6, 108],
  ['settlementprop', { height: .55, seatHeight: .55, seatYaw: Math.PI }, .5, .5, 108],
  ['settlementprop', { height: .89, seatHeight: .89, seatYaw: Math.PI/2, seatLabel: '吧凳' }, .4, .4, 108],
  ['settlementprop', { height: .58, seatHeight: .58, seatCount: 4, seatRelaxed: true }, 3, .8, 108],
]
function setRoom(qa: any, s: Structure, level = 108) {
  const e = qa.eng
  e.seating = null; neutral(e)
  e.map = room(); e.map.structures = [s]; e.mapRev++; e.npcs = []; e.player.level = level
  e.introT = 0; e.inLiquid = 0; e.over = false; e.paused = true; e.dev.fly = false; e.dev.bright = true
  Object.assign(e.player, { x: 11, y: 12.3, z: 0, vz: 0, floor: 0, crouching: false, sanity: 100, hp: 100 })
  e.explored = new Uint8Array(e.map.w * e.map.h); e.visible = new Uint8Array(e.map.w * e.map.h)
  qa.look.yaw = 0; qa.look.pitch = -.55
}
function approach(qa: any, s: Structure, index = 0): boolean {
  const e = qa.eng, a = seatsFor(s, e.map, e.player.level)[index]
  for (const offset of [0, .75, -.75, 1.4, -1.4]) for (const radius of [.85, 1.15, 1.5]) {
    const x = a.x + Math.sin(a.yaw + offset) * radius, y = a.y + Math.cos(a.yaw + offset) * radius
    Object.assign(e.player, { x, y, z: floorHeight(e.map, x, y, a.floor), floor: a.floor, vz: 0 })
    if (canOccupy(e.map, x, y, undefined, { z: e.player.z, band: a.floor }) && pickSeat(e, s)) {
      qa.look.yaw = Math.atan2(x - a.x, y - a.y); qa.look.pitch = Math.atan2(a.z + .10 - e.player.z - 1.55, Math.hypot(x - a.x, y - a.y))
      qa.look.visualHit = null
      return true
    }
  }
  return false
}
function advance(qa: any, seconds: number) { for (let t = 0; t < seconds; t += 1 / 60) updateSitting(qa.eng, 1 / 60) }

export function setup(qa: any) { qa.hide(); qa.r.resize(1920, 1080, 1); return ['chair-sitting-down', 'chair-seated', 'chair-first-person', 'chair-look-down', 'sofa-seated', 'bench-seated', 'office-seated', 'chair-standing-up', 'manila', 'settlement'] }

export async function view(qa: any, id: string) {
  const e = qa.eng, r = qa.r
  if (id === 'manila' || id === 'settlement') {
    e.dev.bright = false; await qa.scene(id === 'manila' ? 0 : 103, 'manila'); await qa.warm()
    const s = e.map.structures.find((s: Structure) => id === 'manila' ? s.data?.l0Furniture && s.data?.chair && !s.data?.fallen : s.data?.seatHeight && approach(qa, s))
    check(s, `${id}: generated furniture has a seat`)
    check(approach(qa, s), `${id}: generated chair has a safe approach`)
    await frames(); e.scanInteract(); check(e.interactTarget?.kind === 'sit', `${id}: real scene selects seat`)
    e.doInteract(); check(e.seating, `${id}: real scene sits`); advance(qa, .7)
  } else {
    const s = id.startsWith('sofa') ? object('sofa', { deg: 30 }, 2, 1) : id.startsWith('bench') ? object('bench', { deg: 25 }, 2, 1) : id.startsWith('office') ? object('officechair', { l4: 1, deg: 25 }) : object()
    setRoom(qa, s, 108)
    await qa.warm(); check(approach(qa, s), `${id}: safe approach`)
    await frames(); e.scanInteract(); check(e.interactTarget?.kind === 'sit', `${id}: live interaction selects seat, got ${e.interactTarget?.kind}`)
    e.doInteract(); check(e.seating, `${id}: E starts sitting`)
    advance(qa, id.endsWith('sitting-down') ? .32 : .7)
    if (id.endsWith('standing-up')) { check(standUp(e), 'stand starts'); advance(qa, .26) }
  }
  qa.look.pitch = id === 'chair-look-down' ? -1.35 : id.endsWith('first-person') ? -.95 : -.12
  await frames(10)
  const system = r.seatedPlayer
  const firstPerson = id.endsWith('first-person') || id === 'chair-look-down' || id === 'manila' || id === 'settlement'
  system.firstPerson = firstPerson; system.update(e, 20)
  let captureData: string | undefined
  if (!firstPerson) {
    const a = e.seating.anchor, o = e.map.inf, x = a.x - (o?.ox ?? 0), y = a.y - (o?.oy ?? 0)
    const camera = new THREE.PerspectiveCamera(47, 1920 / 1080, .03, 120)
    camera.position.set(x + 2.5, e.player.z + 1.65, y + 2.7); camera.lookAt(x, e.player.z + .77, y)
    const vm = [r.vm, r.vmFlash, r.vmLighter], visible = vm.map(g => g.visible); vm.forEach(g => g.visible = false)
    const tone = r.three.toneMapping; r.three.toneMapping = THREE.ACESFilmicToneMapping
    r.three.setRenderTarget(null); r.three.render(r.scene, camera)
    captureData = r.three.domElement.toDataURL('image/png')
    r.three.toneMapping = tone; vm.forEach((g, i) => g.visible = visible[i]); system.firstPerson = true
  }
  return { captureData, level: e.player.level, state: e.seating?.phase, blend: e.seating?.blend, seat: e.seating?.anchor, player: { x: e.player.x, y: e.player.y, z: e.player.z }, eyeHeight: seatedEyeHeight(e), stats: qa.stats() }
}

export async function runtime(qa: any) {
  const e = qa.eng, results: any[] = []
  for (const [kind, data, w, h, level] of families) {
    const s = object(kind, data, w, h)
    setRoom(qa, s, level)
    const model = buildStructure(s, levelDefOf(level)!, e.map, 3)
    if (model) { syncStructureModelColliders(s, model, 0); syncFurnitureSeats(s, model, 0, level) }
    check(furnitureSeats(s, level).length > 0, `${kind}: registered`)
    check(approach(qa, s), `${kind}/${level}: safe approach`)
    check(beginSitting(e, s), `${kind}/${level}: begin`); advance(qa, .72)
    check(e.seating?.phase === 'seated', `${kind}: sitting reaches stable pose`)
    const initial = [e.player.x, e.player.y, e.player.z]
    const snapshot = e.snapshot(), safe = sittingSafePosition(e)
    check(safe && canOccupy(e.map, snapshot.player.x, snapshot.player.y, undefined, { z: snapshot.player.z, band: s.floor ?? 0 }), `${kind}: save outside furniture`)
    e.input.jump = true; updateSitting(e, 1 / 60); advance(qa, .6)
    check(!e.seating && canOccupy(e.map, e.player.x, e.player.y, undefined, { z: e.player.z }), `${kind}: jump exits to safe floor`)
    check(e.player.vz === 0, `${kind}: exit does not launch jump`)
    results.push({ kind, level, seats: furnitureSeats(s, level).length, initial, saved: safe })
    model?.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.isMesh && !mesh.geometry.userData?.shared) mesh.geometry.dispose() })
  }
  const s = object(), m = room(); setRoom(qa, s); e.map = m; m.structures.push(s)
  check(approach(qa, s), 'chair front reachable')
  const before = { x: e.player.x, y: e.player.y }
  const obstruction = object('pillar', {}, 3, .15); obstruction.y = 11.5
  m.structures.push(obstruction)
  check(!pickSeat(e, s), 'thin wall blocks approach')
  check(!beginSitting(e, s) && e.player.x === before.x && e.player.y === before.y, 'failed sit leaves player in place')
  m.structures.pop()
  check(beginSitting(e, s), 'moving obstruction test begins')
  m.structures.push(obstruction); advance(qa, .3)
  check(e.player.x === before.x && e.player.y === before.y, 'obstacle appearing during sit pauses approach')
  m.structures.pop(); advance(qa, .7)
  const previousSlot = e.player.hotbar[e.player.selected]
  e.player.hotbar[e.player.selected] = { type: 'glowstick', count: 1 }; qa.look.pitch = 0
  qa.look.rayX = 0; qa.look.rayY = 1; qa.look.rayZ = 0
  throwHeld(e, 'glowstick')
  const projectile = e.projectiles.pop()
  check(projectile && Math.abs(projectile.z - e.player.z - seatedEyeHeight(e)) < .0001, 'throw originates at seated eye height')
  const ray = crosshairRay(e), offset = seatedEyeOffset(e)
  check(Math.abs(ray.ox - e.player.x - offset.x) < .0001 && Math.abs(ray.oy - e.player.y - offset.y) < .0001 && Math.abs(ray.oz - projectile.z) < .0001, 'interaction and throw share seated eye origin')
  e.player.hotbar[e.player.selected] = previousSlot
  check(standUp(e), 'moving obstruction test stands'); advance(qa, .6)
  const fallen = object('table', { chair: 1, fallen: 1 }); check(!furnitureSeats(fallen, 0).length, 'fallen chair excluded')
  check(!furnitureSeats(object('table', {}), 108).length, 'ordinary table excluded')
  check(!furnitureSeats(object('labbench', {}), 108).length, 'workbench excluded')
  check(approach(qa, s) && beginSitting(e, s), 'cancel test begins'); advance(qa, .7)
  e.player.x += 5; const teleported = e.player.x; updateSitting(e, .016)
  check(!e.seating && e.player.x === teleported, 'teleport cancels seat without snapping back')
  check(approach(qa, s) && beginSitting(e, s), 'repeat sit begins'); advance(qa, .7)
  const blocker = object('pillar', {}, 6, 6); m.structures.push(blocker)
  check(!standUp(e) && e.seating?.phase === 'seated', 'blocked stand stays seated')
  m.structures.pop(); check(standUp(e), 'stand succeeds after obstruction removed'); advance(qa, .6)
  // The production movement/interaction loop, including hunger and pause, rather than just the state helper.
  check(approach(qa, s) && beginSitting(e, s), 'live loop sit begins')
  e.dev.statLock = false; e.dev.god = false; e.paused = false; e.player.hunger = 80
  const hunger = e.player.hunger
  for (let i = 0; i < 100; i++) e.step(1 / 60)
  check(e.seating?.phase === 'seated' && e.player.hunger < hunger, 'seated player remains subject to survival')
  const t = e.time; e.paused = true; e.step(.05); check(e.time === t, 'pause freezes state')
  e.paused = false; e.input.mx = 1
  for (let i = 0; i < 38; i++) e.step(1 / 60)
  check(!e.seating, 'movement input stands up through live engine')
  e.dev.god = true; e.dev.statLock = true; e.paused = true; neutral(e)
  // One cached avatar across repeated use; no cumulative mesh/material allocations.
  await qa.warm()
  check(approach(qa, s) && beginSitting(e, s), 'resource test sit'); advance(qa, .7); await frames(12)
  const identity = qa.r.seatedPlayer.model
  const beforeMemory = { ...qa.r.three.info.memory }
  for (let i = 0; i < 20; i++) { standUp(e); advance(qa, .6); approach(qa, s); beginSitting(e, s); advance(qa, .7); qa.r.seatedPlayer.update(e, i) }
  await frames(12)
  check(identity === qa.r.seatedPlayer.model, 'twenty sit/stand cycles reuse one avatar')
  const memory = { ...qa.r.three.info.memory }
  check(memory.geometries === beforeMemory.geometries && memory.textures === beforeMemory.textures, 'twenty cycles leave GPU geometry/texture counts stable')
  standUp(e); advance(qa, .6); await frames(12)
  const upper = object(); upper.floor = 1; setRoom(qa, upper)
  e.map.floors = 2; e.map.up.fill(1)
  check(approach(qa, upper) && beginSitting(e, upper), 'upper-floor seat reachable'); advance(qa, .7)
  const height = e.player.z
  check(height > 2 && e.seating.anchor.z > height + .4, 'upper-floor pose includes floor elevation')
  check(standUp(e), 'upper-floor stand'); advance(qa, .6)
  check(e.player.floor === 1 && e.player.z === height && !e.seating, 'upper-floor stand preserves floor band')
  return { ok: true, families: results, safeguards: ['walls', 'moving-obstacle', 'seated-throw', 'eye-origin', 'fallen-chair', 'non-seat-props', 'safe-save', 'jump-exit', 'blocked-exit', 'teleport', 'survival', 'pause', 'movement-exit', 'avatar-cache', 'upper-floor'], beforeMemory, memory }
}
