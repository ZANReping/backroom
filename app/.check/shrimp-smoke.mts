// 旱虾（Entity 20）离线校验：
// 1) 注册表/猎食关系/数据完整性；2) 湿地生成（L0 chunk 约 1/4 概率落在 wet 瓦片上）；
// 3) 玩家击杀必掉「旱虾」物品；4) 被敌方实体（钝人 hunts）击杀不掉落
;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 800, innerHeight: 600 }
;(globalThis as unknown as Record<string, unknown>).document = {
  createElement: () => ({ width: 1, height: 1, getContext: () => null, style: {} }),
  getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} },
}
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined

const { engine } = await import('../src/game/engine.ts')
const { ENTITIES } = await import('../src/game/entities/index.ts')
const { generateInfinite, CS } = await import('../src/game/infinite.ts')
const { LEVELS } = await import('../src/game/levels/index.ts')
const { ITEMS } = await import('../src/game/items.ts')

let fail = 0
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++ }

// 1) 注册表与设定
const d = ENTITIES.dryshrimp
ok(!!d, '旱虾已注册进 ENTITIES')
ok(d?.passive === true && d?.noRetaliate === true && d?.damage === 0, '善意无害：passive + noRetaliate + 零伤害')
ok(ENTITIES.deathmoth?.hunts?.includes('dryshrimp') === true, '死亡飞蛾 hunts 旱虾')
ok(ENTITIES.duller?.hunts?.includes('dryshrimp') === true, '钝人 hunts 旱虾')
ok(!!ITEMS.dryshrimp && ITEMS.dryshrimp.use === 'eat', '物品「旱虾」可生吃')
ok(!!ITEMS.friedshrimp && ITEMS.friedshrimp.use === 'eat', '菜品「酥炸旱虾」存在')

// 2) 湿地生成：多个种子里统计旱虾落点必须全部在 wet 瓦片（LiveChunk 实体类型在 def.type 上）
{
  let spawns = 0, onWet = 0
  for (const seed of [1, 7, 42, 20260728, 999]) {
    const m = generateInfinite(LEVELS[0], seed)
    for (const c of m.inf!.chunks.values()) {
      for (const e of c.entities) {
        if (e.def.type !== 'dryshrimp') continue
        spawns++
        const lx = Math.floor(e.x - (c.cx * CS - m.inf!.ox)), ly = Math.floor(e.y - (c.cy * CS - m.inf!.oy))
        if (lx >= 0 && ly >= 0 && lx < CS && ly < CS && c.wet[ly * CS + lx] === 1) onWet++
      }
    }
  }
  console.log(`  … 5 种子共生成 ${spawns} 只旱虾`)
  ok(spawns > 0 && onWet === spawns, `旱虾全部生成在潮湿地形（${onWet}/${spawns}）`)
}

// 3) 玩家击杀必掉物品（killCheck 由玩家攻击路径触发，直接调用）
{
  engine.newRun(12345, 'normal')
  engine.paused = false
  const m = engine.map!
  const e = ENTITIES.dryshrimp
  const ent = { id: 99991, def: e, x: engine.player.x + 1, y: engine.player.y, z: 0, hp: 0, state: 'wander', targetX: 0, targetY: 0, stateT: 0, attackCd: 0, stunT: 0, facing: 0, lungeT: 0, dead: false, deathT: 0, animT: 0 } as unknown as import('../src/game/entities/types.ts').Entity
  m.entities.push(ent)
  const itemsBefore = m.items.length
  ;(engine as unknown as { killCheck: (x: unknown) => void }).killCheck(ent)
  const drop = m.items.slice(itemsBefore).find((i) => i.type === 'dryshrimp')
  ok(!!drop, '玩家击杀旱虾 → 掉落物品「旱虾」')
}

// 4) 敌方实体击杀不掉落（钝人 hunts 捕食路径）
{
  engine.newRun(54321, 'normal')
  engine.paused = false
  const m = engine.map!
  const mk = (def: import('../src/game/entities/types.ts').EntityDef, id: number, x: number, y: number) =>
    ({ id, def, x, y, z: 0, hp: def.hp, state: 'wander', targetX: 0, targetY: 0, stateT: 0, attackCd: 0, stunT: 0, facing: 0, lungeT: 0, dead: false, deathT: 0, animT: 0 }) as unknown as import('../src/game/entities/types.ts').Entity
  const shr = mk(ENTITIES.dryshrimp, 99992, engine.player.x + 40, engine.player.y + 40)
  const hunter = mk(ENTITIES.duller, 99993, engine.player.x + 40.5, engine.player.y + 40)
  m.entities.push(shr, hunter)
  const itemsBefore = m.items.length
  for (let f = 0; f < 30 * 30 && !shr.dead; f++) engine.update(1 / 30) // 最多 30s 等钝人吃完
  ok(shr.dead, '钝人（hunts）捕食了旱虾')
  ok(!m.items.slice(itemsBefore).some((i) => i.type === 'dryshrimp'), '被敌方实体捕食 → 不掉落物品')
}

console.log(fail === 0 ? '\n✓ 旱虾校验全部通过' : `\n✗ ${fail} 项失败`)
process.exit(fail ? 1 : 0)
