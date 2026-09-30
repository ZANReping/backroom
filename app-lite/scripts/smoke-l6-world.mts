import assert from 'node:assert/strict'
import { L6 } from '../src/game/levels/l6.ts'
import { canOccupy } from '../src/game/core/player.ts'
import { floorHeight, generateLevel, UNDER_CEIL, UNDER_FLOOR, walkableAt, wallAt } from '../src/game/world/mapgen.ts'
import { CS, l0RegionExitPos, regionHost } from '../src/game/world/infinite.ts'
import { genL6ChunkRaw, l6UndergroundAt } from '../src/game/world/infiniteL6.ts'
import { Engine } from '../src/game/engine.ts'
import { look } from '../src/game/renderer/shared.ts'

assert.equal(L6.infinite, true)
assert.deepEqual(L6.entities, [])
assert.equal(L6.noFlashlight, true)

const raw = genL6ChunkRaw(L6, 60606, 0, 0)
assert.equal(raw.tiles.length, CS * CS)
assert.ok(raw.tiles.every((v) => v === 1), 'L6 surface must be tundra floor')
assert.ok(raw.outdoor?.every((v) => v === 1), 'L6 surface must be outdoor')
assert.ok(raw.dn?.some((v) => v === 1), 'L6 underground must contain corridors')
assert.ok(raw.dnWall?.some((v) => v === 1), 'L6 underground must contain walls')
assert.equal(raw.entities.length, 0)
assert.equal(raw.lights.length, 0)
assert.ok(raw.structures.some((s) => s.kind === 'l6stairwell' && s.floor === 0))
assert.ok(raw.structures.some((s) => s.kind === 'l6stairwell' && s.floor === -1))

const forestRaw = genL6ChunkRaw(L6, 60606, 5, 5, 'deadwood')
assert.ok(forestRaw.tint?.every((v) => v === 27), 'dead forest must use ash-brown ground')
assert.ok(forestRaw.structures.some((s) => s.kind === 'deadshrub' && s.data?.tree === true && Number(s.data.scale) >= 1), 'dead forest must contain large dead trees')
const grassRaw = genL6ChunkRaw(L6, 60606, 7, 5, 'stinkfield')
assert.ok(grassRaw.tint?.every((v) => v === 28), 'stink field must use olive grassland ground')
assert.ok(grassRaw.structures.some((s) => s.kind === 'stinkgrass' && s.w >= 2.8), 'stink field must contain broad grass patches')

// 稀疏出口区域的宿主 chunk 必须稳定生成地表 L7 与地下 L8 两个出口。
const host = regionHost(60606, 0, 0)
const exitRaw = genL6ChunkRaw(L6, 60606, host.cx, host.cy)
assert.ok(exitRaw.exits.some((e) => e.def.kind === 'seahatch' && e.floor === 0))
assert.ok(exitRaw.exits.some((e) => e.def.kind === 'cave8' && e.floor === -1))

// 世界坐标纯函数在 chunk 接缝两侧连续，且纵横主廊相交形成全局网络。
const east = genL6ChunkRaw(L6, 60606, 1, 0)
for (let y = 0; y < CS; y++) {
  assert.equal(raw.dn![y * CS + 31] === 1, l6UndergroundAt(31, y))
  assert.equal(east.dn![y * CS] === 1, l6UndergroundAt(32, y))
}

const m = generateLevel(L6, 60606, true)
assert.ok(m.inf, 'L6 must use the infinite streaming framework')
assert.equal(m.hasUnderground, true)
assert.equal(m.entities.length, 0)
const sx = m.spawn.x, sy = m.spawn.y
assert.equal(walkableAt(m, sx, sy, 0), true)
assert.equal(walkableAt(m, sx, sy, -1), true)
assert.equal(wallAt(m, sx, sy, -1), false)
assert.equal(floorHeight(m, sx + 0.5, sy + 0.5, -1), UNDER_FLOOR)
assert.equal(UNDER_CEIL - UNDER_FLOOR, 3)
assert.equal(canOccupy(m, sx + 0.5, sy + 0.5, 0.32, { z: UNDER_FLOOR, band: -1 }), true)
assert.ok(m.terrain?.some((v) => Math.abs(v) > 0.01), 'surface must contain gentle terrain undulation')
assert.ok(l0RegionExitPos(m, 0, 0, L6, 0), 'surface exit locator must resolve its host chunk')
assert.ok(l0RegionExitPos(m, 0, 0, L6, -1), 'underground exit locator must resolve its host chunk')

// 地下层脚底为 -5m，静止/跳落都不得再命中普通层的“z < -4.5 深坑死亡”规则。
const eng = new Engine()
eng.newRun(60606, 'normal')
eng.loadLevel(6)
assert.equal(eng.switchL6Floor(-1, 'stairs'), true)
for (let i = 0; i < 120; i++) eng.update(1 / 60)
assert.equal(eng.over, false, 'L6 underground must not trigger pit death settlement')
assert.equal(eng.player.floor, -1)
assert.equal(eng.player.z, UNDER_FLOOR)

// 夜视镜始终启用但使用通用电池，L6 的 noFlashlight 不应免除其耗电。
eng.player.equip.head = { type: 'nightvision', count: 1 }
eng.player.flashlight = false
eng.player.battery = 100
for (let i = 0; i < 20; i++) eng.update(0.05)
assert.ok(eng.player.battery <= 99.75 && eng.player.battery > 99.7, 'night vision must drain 0.25 battery per second')

// 地表深坑必须切到地下，而不是先/后触发死亡结算。
eng.loadLevel(6)
const pitI = eng.map!.elev.findIndex((v) => v === 4)
assert.ok(pitI >= 0, 'loaded L6 window must contain a collapse pit')
eng.player.x = (pitI % eng.map!.w) + 0.5
eng.player.y = Math.floor(pitI / eng.map!.w) + 0.5
eng.player.z = -3.7
eng.player.vz = -1
eng.update(1 / 60)
assert.equal(eng.over, false, 'L6 collapse pit must not open death settlement')
assert.equal(eng.player.floor, -1)
assert.equal(eng.player.z, UNDER_FLOOR)

// 跨类别准星优先：较近但偏离准星的出口，不能抢走稍远但准星正对的结构。
eng.loadLevel(6)
const im = eng.map!
const px = im.spawn.x + 0.5, py = im.spawn.y + 0.5
eng.player.x = px; eng.player.y = py; eng.player.z = floorHeight(im, px, py, 0); eng.player.floor = 0; eng.player.facing = 0
im.items = []; im.entities = []; im.structures = []; im.exits = []
eng.npcs = []
const aimed = { kind: 'obelisk' as const, x: px + 1.6, y: py - 0.5, w: 1, h: 1, solid: false, floor: 0 as const }
im.structures.push(aimed)
im.exits.push({ def: L6.exits[0], x: px + 0.1, y: py + 0.1, floor: 0, discovered: false })
const aimedCx = aimed.x + aimed.w / 2, aimedCy = aimed.y + aimed.h / 2
const aimedZ = floorHeight(im, aimedCx, aimedCy, 0) + Math.min(1.15, 0.55 + Math.max(aimed.w, aimed.h) * 0.18)
look.pitch = Math.atan2(aimedZ - (eng.player.z + 1.55), Math.hypot(aimedCx - px, aimedCy - py))
eng.scanInteract()
assert.equal(eng.getInteract()?.kind, 'obelisk', 'crosshair-aimed structure must beat closer off-axis exit')

console.log('L6 smoke passed: infinite dual floor, safe descent, crosshair-first interaction')
