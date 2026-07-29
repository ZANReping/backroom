// v25 冒烟断言：实体栖息地生成过滤（indoor/outdoor/any）+ 降级计数一致性
// 运行：npx tsx verifier/v1/smoke-v25.mts
import { LEVELS } from '../../src/game/levels'
import { generateLevel } from '../../src/game/mapgen'
import { ENTITIES } from '../../src/game/entities'

let failures = 0
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`)
  else { console.error(`  ✗ ${msg}`); failures++ }
}

console.log('== v25 实体栖息地生成过滤冒烟 ==')

// 全部实体均已显式声明 habitat
{
  const missing = Object.values(ENTITIES).filter((d) => !d.habitat).map((d) => d.type)
  ok(missing.length === 0, `全部 ${Object.keys(ENTITIES).length} 种实体均声明 habitat${missing.length ? '（缺：' + missing.join(',') + '）' : ''}`)
  const indoor = Object.values(ENTITIES).filter((d) => d.habitat === 'indoor').map((d) => d.type)
  const outdoor = Object.values(ENTITIES).filter((d) => d.habitat === 'outdoor').map((d) => d.type)
  ok(indoor.length >= 8, `indoor 实体 ≥8（${indoor.length}：${indoor.join('/')}）`)
  ok(outdoor.length >= 6, `outdoor 实体 ≥6（${outdoor.length}：${outdoor.join('/')}）`)
}

// 6+ 层 × 多种子：生成位置符合栖息地；违例必须被 habitatFallback 计数（降级 any 告警）
const SEEDS = [11, 222, 3333]
const LEVEL_IDS = [1, 2, 3, 5, 7, 9, 10, 11] // 车库/管道/电站/酒店/海洋/郊区/田野/城市（≥6 层）
for (const id of LEVEL_IDS) {
  const def = LEVELS.find((l) => l.id === id)
  if (!def) { ok(false, `找不到层级 L${id}`); continue }
  let checked = 0, degraded = 0, outdoorSeen = 0
  for (const seed of SEEDS) {
    const m = generateLevel(def, seed)
    const fb = m.habitatFallback ?? {}
    for (const e of m.entities) {
      const hab = e.def.habitat ?? 'any'
      if (hab === 'any') continue
      const tx = Math.floor(e.x), ty = Math.floor(e.y)
      if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) { ok(false, `L${id} seed=${seed} ${e.def.type} 生成越界`); continue }
      const isOut = m.outdoor[ty * m.w + tx] === 1 || (e.def.aquatic === true && m.liquid[ty * m.w + tx] !== 0)
      const fbCount = fb[`${e.def.type}:${hab}`] ?? 0
      checked++
      if (hab === 'indoor') {
        if (!isOut) outdoorSeen = 0
        if (isOut && fbCount <= 0) { ok(false, `L${id} seed=${seed} ${e.def.type}(indoor) 生成在室外 (${tx},${ty}) 且未计数降级`); continue }
        if (isOut) degraded++
      } else {
        if (isOut) outdoorSeen++
        else if (fbCount <= 0) { ok(false, `L${id} seed=${seed} ${e.def.type}(outdoor) 生成在室内 (${tx},${ty}) 且未计数降级`); continue }
        else degraded++
      }
    }
  }
  ok(true, `L${id} ${def.name}：${checked} 只过滤实体位置合规（降级 ${degraded}，室外就位 ${outdoorSeen}）`)
}

// 针对性：L7 海洋实体（tiny/thething）与 L9 街道实体（watcher/strider/mangled）应大量落在室外
for (const [id, types] of [[7, ['tiny', 'thething']], [9, ['watcher', 'strider', 'mangled']], [10, ['soilworm']]] as const) {
  const def = LEVELS.find((l) => l.id === id)!
  let out = 0, total = 0
  for (const seed of SEEDS) {
    const m = generateLevel(def, seed)
    for (const e of m.entities) {
      if (!(types as readonly string[]).includes(e.def.type)) continue
      total++
      const i = Math.floor(e.y) * m.w + Math.floor(e.x)
      if (m.outdoor[i] === 1 || (e.def.aquatic === true && m.liquid[i] !== 0)) out++
    }
  }
  ok(total > 0 && out / total >= 0.8, `L${id} ${types.join('/')} 室外生成率 ${out}/${total} ≥80%`)
}

// 针对性：L4/L5 室内实体（duller/seated/bellhop/mirrorself/deathmoth 所在层无室外栖息实体）
for (const [id, types] of [[5, ['bellhop', 'mirrorself', 'skinstealer']], [11, ['windowent', 'faceling', 'duller']]] as const) {
  const def = LEVELS.find((l) => l.id === id)!
  let ind = 0, total = 0
  for (const seed of SEEDS) {
    const m = generateLevel(def, seed)
    for (const e of m.entities) {
      if (!(types as readonly string[]).includes(e.def.type)) continue
      total++
      if (m.outdoor[Math.floor(e.y) * m.w + Math.floor(e.x)] === 0) ind++
    }
  }
  ok(total > 0 && ind === total, `L${id} ${types.join('/')} 全部室内生成（${ind}/${total}）`)
}

// L0 无限模式回归：实体绝迹不受影响
{
  const m0 = generateLevel(LEVELS[0], 20260726)
  ok(!!m0.inf && m0.entities.length === 0, 'L0 无限模式实体数=0（栖息地过滤不影响实体绝迹设定）')
}

console.log(failures ? `\n结果：${failures} 项失败` : '\n结果：全部通过')
process.exit(failures ? 1 : 0)
