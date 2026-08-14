import assert from 'node:assert/strict'
import { Engine } from '../src/game/engine.ts'
import { makeEntity } from '../src/game/entities/index.ts'
import {
  interactionLos3D,
  interactionProbe,
  structureInteractionProfile,
  structureInteractionVolume,
  structureSurfacePoint,
} from '../src/game/engine/interact.ts'
import { floorHeight, FLOOR_H, UNDER_FLOOR } from '../src/game/world/mapgen.ts'
import { look } from '../src/game/renderer/shared.ts'
import type { FloorBand, GroundItem, Structure } from '../src/game/core/types.ts'

const eng = new Engine()
eng.newRun(570057, 'normal')
eng.loadLevel(6)
const m = eng.map!
const p = eng.player
const px = Math.floor(m.w / 2) + 0.5
const py = Math.floor(m.h / 2) + 0.5

// 把流式窗口改成一块可重复控制的平地；每次结构变化都使无限层空间索引失效。
m.tiles.fill(1); m.elev.fill(0); m.dn.fill(1); m.dnWall.fill(0)
m.up.fill(1); m.upWall.fill(0); m.floors = 2; m.hasUnderground = true
if (m.terrain) m.terrain.fill(0)
m.items = []; m.exits = []; m.entities = []; m.structures = []; eng.npcs = []
const refreshStructs = () => { if (m.inf) m.inf.rev++ }
const setBand = (band: FloorBand) => {
  p.x = px; p.y = py; p.z = band === -1 ? UNDER_FLOOR : band * FLOOR_H; p.floor = band
}
const aimAt = (x: number, y: number, z: number) => {
  p.facing = Math.atan2(y - p.y, x - p.x)
  look.pitch = Math.atan2(z - (p.z + 1.55), Math.max(0.05, Math.hypot(x - p.x, y - p.y)))
}
const clearTargets = () => {
  m.items = []; m.exits = []; m.entities = []; m.structures = []; eng.npcs = []; refreshStructs()
}
const targetZ = (s: Structure, band: FloorBand = 0) =>
  floorHeight(m, s.x, s.y + s.h / 2, band) + structureInteractionProfile(s).centerZ

// 正常距离必须真正瞄准：高大物体的可见表面可用，但约 40° 的余光和明显错误俯仰仍不能出现提示。
setBand(0)
const marker: Structure = { kind: 'landmark', x: px + 1.5, y: py - 0.5, w: 1, h: 1, solid: false, floor: 0, data: { outpost: 'alpha' } }
m.structures = [marker]; refreshStructs()
aimAt(marker.x, py, 1.68) // 布面上缘附近，不是旧版统一的 0.73m 目标点
eng.scanInteract()
assert.equal(eng.getInteract()?.kind, 'landmark', 'visible upper area of a tall landmark should be interactable')
p.facing += 40 * Math.PI / 180
eng.scanInteract()
assert.equal(eng.getInteract(), null, 'large off-axis error must fail the hard crosshair threshold')
aimAt(marker.x, py, 2.6) // 明显高于整个地标及其边界容差
eng.scanInteract()
assert.equal(eng.getInteract(), null, 'large pitch error must fail the hard crosshair threshold')

// A close crate uses its visible 3D volume: aiming at the lid must not require aiming through its center.
clearTargets(); setBand(0)
const crate: Structure = { kind: 'crate', x: px + 0.65, y: py - 0.5, w: 1, h: 1, solid: true, floor: 0 }
m.structures = [crate]; refreshStructs()
const crateProfile = structureInteractionProfile(crate)
const crateSurface = structureSurfacePoint(crate, p.x, p.y)
const crateBase = floorHeight(m, crate.x + 0.5, crate.y + 0.5, 0)
p.facing = 0
look.pitch = Math.atan2(crateBase + 0.7 - (p.z + 1.55), 1.0)
const crateProbe = interactionProbe(
  eng, crateSurface.x, crateSurface.y, crateBase + crateProfile.centerZ, 0, 2.2,
  crateProfile.horizontalRadius, structureInteractionVolume(eng, crate, 0), crate,
  crateSurface.d, crateProfile.verticalRadius,
)
assert.equal(crateProbe?.direct, true, 'crosshair ray should directly hit the visible crate lid')
eng.scanInteract()
assert.equal(eng.getInteract()?.kind, 'crate', 'a close crate lid under the crosshair must show interaction')
look.pitch = 0.25
eng.scanInteract()
assert.equal(eng.getInteract(), null, 'being close alone must not bypass the crosshair gate')
look.visualHit = {
  kind: 'structure',
  structure: crate,
  x: px + 1.0,
  y: py,
  z: crateBase + 0.7,
  rayT: 1.2,
  yaw: look.yaw,
  pitch: look.pitch,
  playerX: p.x,
  playerY: p.y,
  playerZ: p.z,
  at: Date.now(),
}
eng.scanInteract()
assert.equal(eng.getInteract()?.kind, 'crate', 'renderer mesh hit should override the approximate center-angle miss')
look.visualHit = null

// Ground items use the same rendered-mesh bridge: a rotated/flat model hit wins over its approximate pickup box.
clearTargets(); setBand(0)
const flashlight: GroundItem = { id: 570057, type: 'flashlight', x: px + 0.9, y: py, z: 0 }
m.items = [flashlight]
p.facing = 0
look.pitch = 0.2
eng.scanInteract()
assert.equal(eng.getInteract(), null, 'the deliberately wrong fallback pitch should miss the item approximation')
look.visualHit = {
  kind: 'item',
  item: flashlight,
  x: flashlight.x,
  y: flashlight.y,
  z: 0.5,
  rayT: 1.1,
  yaw: look.yaw,
  pitch: look.pitch,
  playerX: p.x,
  playerY: p.y,
  playerZ: p.z,
  at: Date.now(),
}
eng.scanInteract()
assert.equal(eng.getInteract()?.kind, 'item', 'a ground item mesh under the crosshair must show pickup interaction')
look.visualHit = null

// 贴近也不能穿过全高结构；但同一条视线应能从低桌上方通过，验证 LOS 确实是三维的。
const pillar: Structure = { kind: 'redpillar', x: px + 0.45, y: py - 0.5, w: 1, h: 1, solid: true, floor: 0 }
m.structures = [marker, pillar]; refreshStructs()
aimAt(marker.x, py, targetZ(marker))
eng.scanInteract()
assert.equal(eng.getInteract(), null, 'close target behind a solid structure must not bypass LOS')
const lowTable: Structure = { kind: 'table', x: px + 0.45, y: py - 0.5, w: 1, h: 1, solid: true, floor: 0 }
m.structures = [marker, lowTable]; refreshStructs()
eng.scanInteract()
assert.equal(eng.getInteract()?.kind, 'landmark', 'eye ray should pass above a low table in 3D LOS')

// 地表、二层和地下分别读取自己的墙体数组，不串层也不漏层。
clearTargets()
const wallI = Math.floor(py) * m.w + Math.floor(px + 1)
for (const band of [-1, 0, 1] as const) {
  setBand(band)
  m.tiles[wallI] = 1; m.up[wallI] = 1; m.upWall[wallI] = 0; m.dn[wallI] = 1; m.dnWall[wallI] = 0
  if (band === -1) m.dnWall[wallI] = 1
  else if (band === 0) m.tiles[wallI] = 0
  else m.upWall[wallI] = 1
  assert.equal(
    interactionLos3D(eng, px + 2.2, py, p.z + 0.9, band),
    false,
    `floor band ${band} must use its own solid wall data`,
  )
}
m.tiles[wallI] = 1; m.upWall[wallI] = 0; m.dnWall[wallI] = 0

// 大物体按最近表面：中心远超 2.2m，只要边缘在范围内且准星指向边缘仍可交互。
setBand(0)
const desk: Structure = { kind: 'frontdesk', x: px + 1.6, y: py - 0.5, w: 6, h: 1, solid: true, floor: 0 }
m.structures = [desk]; refreshStructs()
assert.ok(Math.hypot(desk.x + desk.w / 2 - p.x, desk.y + desk.h / 2 - p.y) > 2.2)
aimAt(desk.x, py, targetZ(desk))
eng.scanInteract()
assert.equal(eng.getInteract()?.kind, 'frontdesk', 'large object edge must be usable when its center is out of range')

// 杰瑞和人制品售货机必须处在玩家当前高度带；杰瑞的辅助瞄准也走同一规则。
clearTargets()
const jerry = makeEntity('jerry', px + 1.5, py, FLOOR_H)
m.entities = [jerry]
setBand(0); aimAt(jerry.x, jerry.y, jerry.z + 0.8)
eng.scanInteract()
assert.equal(eng.getInteract(), null, 'Jerry on another floor must not be scanned')
assert.equal(eng.aimJerry(), null, 'Jerry helper must also reject another floor')
setBand(1); aimAt(jerry.x, jerry.y, jerry.z + 0.8)
eng.scanInteract()
assert.equal(eng.getInteract()?.kind, 'jerry')
assert.equal(eng.aimJerry(), jerry)

const machine = makeEntity('vendingmachine', px + 1.5, py, FLOOR_H)
m.entities = [machine]
setBand(0); aimAt(machine.x, machine.y, machine.z + 0.95)
eng.scanInteract()
assert.equal(eng.getInteract(), null, 'vending machine on another floor must not be scanned')
setBand(1); aimAt(machine.x, machine.y, machine.z + 0.95)
eng.scanInteract()
assert.equal(eng.getInteract()?.kind, 'vendingmachine')

// 执行前若距离/LOS/准星已变化，旧扫描目标必须作废，不能继续触发拉杆等效果。
clearTargets(); setBand(0); p.leverPulled = false
const booth: Structure = { kind: 'booth', x: px + 1.5, y: py - 0.5, w: 1, h: 1, solid: false, floor: 0 }
m.structures = [booth]; refreshStructs()
aimAt(booth.x, py, targetZ(booth))
eng.scanInteract()
assert.equal(eng.getInteract()?.kind, 'lever')
m.structures.push(pillar); refreshStructs()
eng.doInteract()
assert.equal(p.leverPulled, false, 'execution must revalidate LOS and reject a stale scanned target')

console.log('Strict interaction smoke passed: aim, 3D LOS, floor bands, surface range, execution revalidation')
