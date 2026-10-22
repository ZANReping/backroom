import assert from 'node:assert/strict'
import { buildMangledRig } from '../src/game/renderer/mangledMesh'
import { syncMangledLegColliders } from '../src/game/renderer/watchRender'
import { canOccupy, resolvePlayerPenetration, PLAYER_RADIUS } from '../src/game/core/player'

const n = 64
const map: any = {
  w: n, h: n, tiles: new Uint8Array(n * n).fill(1), structures: [], entities: [],
  wet: new Uint8Array(n * n), tint: new Uint8Array(n * n), elev: new Uint8Array(n * n), outdoor: new Uint8Array(n * n),
  step: new Uint8Array(n * n), crawl: new Uint8Array(n * n), ceiling: new Uint8Array(n * n),
  up: new Uint8Array(n * n), upWall: new Uint8Array(n * n), up2: new Uint8Array(n * n), upWall2: new Uint8Array(n * n),
  stair: new Int32Array(n * n), liquid: new Uint8Array(n * n), seaFloor: new Float32Array(n * n), floors: 1,
}
const e: any = { id: 1, x: 32, y: 32, z: 0, hp: 100, dead: false, def: { type: 'mangled' } }
map.entities.push(e)
const grp = buildMangledRig(1)
grp.position.set(e.x, 0, e.y)
grp.updateMatrixWorld(true)
syncMangledLegColliders(grp, e)
assert.equal(e.mangledLegs?.length, 24, '残缺者应同步 8 腿 × 3 段碰撞胶囊')

const foot = e.mangledLegs!.reduce((a: any, b: any) => Math.min(b.az, b.bz) < Math.min(a.az, a.bz) ? b : a)
const footEnd = foot.az < foot.bz ? { x: foot.ax, y: foot.ay } : { x: foot.bx, y: foot.by }
const fx = e.x + footEnd.x, fy = e.y + footEnd.y
assert.equal(canOccupy(map, fx, fy, PLAYER_RADIUS, { z: 0 }), false, '足端应阻挡玩家')
assert.equal(canOccupy(map, e.x, e.y, PLAYER_RADIUS, { z: 0 }), true, '腿间中心应可通过')

// Move the actual lower leg bones upward, then resync; the floor below should clear.
const rig = grp.userData.mangledRig
for (let i = 0; i < 8; i++) for (let j = 2; j < 4; j++) rig.byName[`leg${i}_${j}`].position.y += 8
grp.updateMatrixWorld(true); syncMangledLegColliders(grp, e)
assert.equal(canOccupy(map, fx, fy, PLAYER_RADIUS, { z: 0 }), true, '抬腿高于玩家时应允许从下方通过')

e.dead = true; e.hp = 100
assert.equal(canOccupy(map, fx, fy, PLAYER_RADIUS, { z: 0 }), true, '死亡残缺者不应继续阻挡')
e.dead = false
for (let i = 0; i < 8; i++) for (let j = 2; j < 4; j++) rig.byName[`leg${i}_${j}`].position.y -= 8
grp.updateMatrixWorld(true); syncMangledLegColliders(grp, e)

// Rotation, scale and stream-origin changes are represented in world placement;
// local collider offsets remain valid after the origin is rebased.
grp.rotation.y = Math.PI / 2; grp.scale.setScalar(1.2); grp.updateMatrixWorld(true); syncMangledLegColliders(grp, e)
assert.equal(e.mangledLegs!.length, 24, '旋转/缩放后仍应保留 24 段碰撞')
const beforeRebase = e.mangledLegs!.map((c: any) => [c.ax, c.ay, c.az, c.bx, c.by, c.bz])
grp.position.x += 32; grp.position.z -= 32; grp.updateMatrixWorld(true); syncMangledLegColliders(grp, e)
const afterRebase = e.mangledLegs!.map((c: any) => [c.ax, c.ay, c.az, c.bx, c.by, c.bz])
assert.ok(afterRebase.every((row: number[], i: number) => row.every((v, j) => Math.abs(v - beforeRebase[i][j]) < 1e-5)), '流式原点平移不应改变局部碰撞数据')
const currentFoot = e.mangledLegs!.reduce((a: any, b: any) => Math.min(b.az, b.bz) < Math.min(a.az, a.bz) ? b : a)
const currentEnd = currentFoot.az < currentFoot.bz ? { x: currentFoot.ax, y: currentFoot.ay } : { x: currentFoot.bx, y: currentFoot.by }
const p = { x: e.x + currentEnd.x, y: e.y + currentEnd.y }
const d = resolvePlayerPenetration(map, p, PLAYER_RADIUS, { z: 0 })
assert.ok(d.x !== 0 || d.y !== 0, '嵌入足端时应产生脱困位移')

console.log('Mangled leg capsule count, leg-gap passage, raised-foot clearance, dead cleanup and escape: PASS')
