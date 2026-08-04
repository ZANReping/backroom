// 生成器冒烟测试：13 个层级（据点走独立 id 空间，另有 outpost-smoke 覆盖）× 多种子，校验可生成、出生点合法、出口/物品/实体落点合法
import { generateLevel, tileAt } from '../src/game/mapgen.ts'
import { CONTAINER_KINDS } from '../src/game/containers.ts'
import { LEVELS, levelNo } from '../src/game/levels/index.ts'
import { ITEMS } from '../src/game/items.ts'
import { ENTITIES } from '../src/game/entities/index.ts'

let fail = 0
const bad = (msg: string) => { console.log('  ✗ ' + msg); fail++ }

// 1) 定义完整性
for (const def of LEVELS) {
  for (const e of def.entities) if (!ENTITIES[e.type]) bad(`L${def.id} 引用了不存在的实体 ${e.type}`)
  for (const it of def.items) if (!ITEMS[it.type]) bad(`L${def.id} 引用了不存在的物品 ${it.type}`)
  if (def.id !== LEVELS.indexOf(def)) bad(`L${def.id} 的 id 与数组索引不一致`)
  if (!def.exits.length) bad(`L${def.id} 没有出口`)
  for (const x of def.exits) {
    if (typeof x.dest === 'number' && !LEVELS[x.dest]) bad(`L${def.id} 出口 ${x.kind} 指向不存在的层级 ${x.dest}`)
  }
}
// 物品定义自洽
for (const [k, v] of Object.entries(ITEMS)) if (k !== v.type) bad(`物品键 ${k} 与 type ${v.type} 不一致`)
for (const [k, v] of Object.entries(ENTITIES)) if (k !== v.type) bad(`实体键 ${k} 与 type ${v.type} 不一致`)

// 2) 逐层生成
const SEEDS = [1, 7, 12345, 99991, 424242]
for (const def of LEVELS) {
  const t0 = Date.now()
  let items = 0, ents = 0, exits = 0, contItems = 0, conts = 0
  for (const seed of SEEDS) {
    let m
    try { m = generateLevel(def, seed) } catch (err) { bad(`L${levelNo(def.id)} seed=${seed} 生成抛异常：${(err as Error).message}`); continue }
    // 出生点
    if (tileAt(m, m.spawn.x, m.spawn.y) !== 1) bad(`L${levelNo(def.id)} seed=${seed} 出生点不是可走地板`)
    // L0 为无限 chunk 模式：出口按窗口流式生成，不在此校验
    if (!def.infinite && !m.exits.length) bad(`L${levelNo(def.id)} seed=${seed} 没有生成出口`)
    if (def.allExits && m.exits.length !== def.exits.length) bad(`L${levelNo(def.id)} seed=${seed} 结局层出口数 ${m.exits.length} ≠ ${def.exits.length}`)
    for (const e of m.exits) if (tileAt(m, e.x, e.y) !== 1) bad(`L${levelNo(def.id)} seed=${seed} 出口落在非地板`)
    for (const it of m.items) if (!ITEMS[it.type]) bad(`L${levelNo(def.id)} seed=${seed} 地面物品未知类型 ${it.type}`)
    for (const e of m.entities) if (!ENTITIES[e.def.type]) bad(`L${levelNo(def.id)} seed=${seed} 未知实体`)
    let floorN = 0
    for (let i = 0; i < m.w * m.h; i++) if (m.tiles[i] === 1) floorN++
    if (floorN < 200) bad(`L${levelNo(def.id)} seed=${seed} 可走地板过少：${floorN}`)
    for (const s of m.structures) {
      if (CONTAINER_KINDS.includes(s.kind) && s.data?.loot === 1) {
        conts++
        const li = s.data?.lootItems
        if (Array.isArray(li)) { contItems += li.length; for (const t of li as string[]) if (!ITEMS[t]) bad(`L${levelNo(def.id)} 容器内未知物品 ${t}`) }
      }
    }
    items += m.items.length; ents += m.entities.length; exits += m.exits.length
  }
  const n = SEEDS.length
  console.log(`Level ${String(levelNo(def.id)).padStart(3)} ${def.name.padEnd(6)} gen=${def.gen.padEnd(9)} `
    + `地面物品 ${(items / n).toFixed(1)} · 容器 ${(conts / n).toFixed(1)}(内含 ${(contItems / n).toFixed(1)}) `
    + `· 实体 ${(ents / n).toFixed(1)} · 出口 ${(exits / n).toFixed(1)} · ${Date.now() - t0}ms/${n}seed`)
}
console.log(fail === 0 ? '\n✓ 全部通过' : `\n✗ ${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
