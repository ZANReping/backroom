// v66：Level 7 生成检查——海山剖面、固定岩洞、重力交界区、装饰物分布、纯函数一致性。
import { genL7ChunkRaw, l7SeaFloorAt, l7MountCave, l7GravZonesNear, l7GravWallAt, l7RegionExitAnchor, L7_ORIGIN, L7_MOUNT, L7_ARENA } from '../src/game/world/infiniteL7'
import { L7 } from '../src/game/levels/l7'
import { CS, RS } from '../src/game/world/infinite'

let pass = 0, fail = 0
const ok = (c: boolean, msg: string) => { if (c) pass++; else { fail++; console.log('FAIL', msg) } }

for (const seed of [1, 777, 12345, 20261009, 99991]) {
  // 1) 入口海山：台地浅（<12m）；崖外 30m 内跌破 150m；山脚裙带 ~240m
  for (let a = 0; a < 16; a++) {
    const ang = a / 16 * Math.PI * 2
    const at = (r: number) => l7SeaFloorAt(seed, Math.round(L7_ORIGIN.x + Math.cos(ang) * r), Math.round(L7_ORIGIN.y + Math.sin(ang) * r))
    ok(at(10) < 12, `seed ${seed} 台地浅 ang${a} ${at(10).toFixed(1)}`)
    ok(at(L7_MOUNT.edge + L7_MOUNT.cliff + 12) > 150, `seed ${seed} 陡崖 ang${a} ${at(L7_MOUNT.edge + L7_MOUNT.cliff + 12).toFixed(1)}`)
  }
  // 2) 环形场仍是暮色带浅台
  const ad = l7SeaFloorAt(seed, L7_ARENA.x, L7_ARENA.y)
  ok(ad > 40 && ad < 52, `seed ${seed} 环形场深度 ${ad.toFixed(1)}`)
  // 3) 固定岩洞：午夜带底部、在其 chunk 生成中存在
  const mc = l7MountCave(seed)
  ok(mc.depth >= 200 && mc.depth < 260, `seed ${seed} 岩洞深度 ${mc.depth.toFixed(1)}`)
  const ccx = Math.floor(mc.x / CS), ccy = Math.floor(mc.y / CS)
  const ch = genL7ChunkRaw(L7, seed, ccx, ccy)
  ok(ch.exits.some((e) => e.def.kind === 'l7cave' && e.x === mc.x && e.y === mc.y), `seed ${seed} 岩洞出口在 chunk 内`)
  const anchor = l7RegionExitAnchor(seed, Math.floor(ccx / RS), Math.floor(ccy / RS))
  ok(!!anchor && anchor.x === mc.x && anchor.y === mc.y, `seed ${seed} 区域出口指引指向海山岩洞`)
  // 4) 纯函数
  const a1 = genL7ChunkRaw(L7, seed, 3, -2), a2 = genL7ChunkRaw(L7, seed, 3, -2)
  ok(JSON.stringify(a1.structures) === JSON.stringify(a2.structures) && a1.seaFloor.every((v, i) => v === a2.seaFloor[i]), `seed ${seed} 纯函数`)
  // 5) 重力交界区：不在入口 300m 内；墙内判定
  const zs = l7GravZonesNear(seed, 15, 15, 2500)
  ok(zs.length > 0, `seed ${seed} 有重力交界区`)
  for (const z of zs) {
    ok(Math.hypot(z.x - L7_ORIGIN.x, z.y - L7_ORIGIN.y) > 300, `seed ${seed} 交界区远离入口`)
    ok(!!l7GravWallAt(seed, z.x, z.y), `seed ${seed} 墙心判定`)
    ok(!l7GravWallAt(seed, z.x + Math.cos(z.ang + Math.PI / 2) * (z.thick + 2), z.y + Math.sin(z.ang + Math.PI / 2) * (z.thick + 2)), `seed ${seed} 墙外判定`)
  }
  // 6) 装饰物：抽样 64 个 chunk
  const cnt: Record<string, number> = {}
  for (let cy = -4; cy < 4; cy++) for (let cx = -4; cx < 4; cx++) {
    const c = genL7ChunkRaw(L7, seed, cx, cy)
    for (const s of c.structures) cnt[s.kind] = (cnt[s.kind] ?? 0) + 1
    // 装饰物全部无碰撞
    for (const s of c.structures) if (s.kind.startsWith('l7') && s.kind !== 'l7fort') ok(!s.solid, `${s.kind} 无碰撞`)
  }
  ok((cnt.l7debris ?? 0) >= 50, `seed ${seed} 碎屑场 ${cnt.l7debris}`)
  ok((cnt.l7skeleton ?? 0) >= 20, `seed ${seed} 类人骨架 ${cnt.l7skeleton}`)
  console.log(`seed ${seed}`, JSON.stringify(cnt))
}
console.log(`L7 generation: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
