import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

;(globalThis as any).AudioContext = undefined
;(globalThis as any).localStorage = undefined
const { LEVELS } = await import('../src/game/levels/index.ts')
await import('../src/game/world/mapgen.ts')
const { OUTPOSTS } = await import('../src/game/content/outposts.ts')
const { ITEMS, UNIVERSAL_ITEMS } = await import('../src/game/content/items.ts')
const { infiniteImplFor } = await import('../src/game/world/infinite.ts')

const seed = 123456
const points = [[0, 0], [-1, 0], [0, -1], [1, 1], [8, -8]] as const
const clean = (v: any): any => {
  if (v === undefined || typeof v === 'function') return undefined
  if (ArrayBuffer.isView(v)) return Array.from(v as any)
  if (Array.isArray(v)) return v.map(clean).filter((x) => x !== undefined)
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const k of Object.keys(v).sort()) { const x = clean(v[k]); if (x !== undefined) o[k] = x }
    return o
  }
  return v
}
const chunk = (c: any) => clean(c)
const digest = (p: string) => createHash('sha256').update(readFileSync(resolve(process.cwd(), p))).digest('hex')

const sampleRows: any[] = []
const levels = LEVELS.slice(0, 6).map((def: any) => {
  const impl = infiniteImplFor(def.id)
  const variants = Object.keys(impl.variantNames).sort()
  const samples: any[] = points.map(([cx, cy]) => ({ levelId: def.id, seed, cx, cy, variant: impl.variantOf(seed, cx, cy), forced: false, chunk: chunk(impl.genRaw(def, seed, cx, cy)) }))
  for (const variant of variants) samples.push({ levelId: def.id, seed, cx: 0, cy: 0, variant, forced: true, chunk: chunk(impl.genRaw(def, seed, 0, 0, variant)) })
  sampleRows.push(...samples)
  return { definition: clean(def), variants }
})
const sourceFiles = ['infinite.ts', 'infiniteL1.ts', 'infiniteL2.ts', 'infiniteL3.ts', 'infiniteL4.ts', 'infiniteL5.ts'].map((f) => `app/src/game/world/${f}`)
const levelFiles = ['l0.ts', 'l1.ts', 'l2.ts', 'l3.ts', 'l4.ts', 'l5.ts'].map((f) => `app/src/game/levels/${f}`)
const levelVariants = levels.flatMap((l: any) => l.variants.map((variant: string) => `${l.definition.id}:${variant}`))
const allStruct = new Set<string>(), allItems = new Set<string>(), allEntities = new Set<string>()
for (const s of sampleRows) { for (const x of s.chunk.structures ?? []) allStruct.add(x.kind); for (const x of s.chunk.items ?? []) allItems.add(x.type); for (const x of s.chunk.entities ?? []) allEntities.add(x.type) }
const out = {
  format: 'backroom-godot-reference/v1',
  levels,
  outposts: Object.values(OUTPOSTS).filter((o: any) => o.parent >= 0 && o.parent <= 5).map(clean),
  items: clean(ITEMS), universalItems: clean(UNIVERSAL_ITEMS),
  samples: sampleRows,
  coverage: { seed, origins: points, levelCount: levels.length, variantCount: new Set(levelVariants.map((x) => x.split(':')[1])).size, sampleCount: sampleRows.length, variants: levelVariants.sort(), outpostCount: Object.values(OUTPOSTS).filter((o: any) => o.parent >= 0 && o.parent <= 5).length },
  manifest: { structureKinds: [...allStruct].sort(), itemIds: [...allItems].sort(), entityIds: [...allEntities].sort(), referencedLevelDefinitions: levels.map((l: any) => l.definition.id).sort(), referencedOutposts: Object.values(OUTPOSTS).filter((o: any) => o.parent >= 0 && o.parent <= 5).map((o: any) => o.id).sort(), sourceSha256: Object.fromEntries([...sourceFiles, ...levelFiles].map((p) => [p, digest(p)])) },
}
if (levels.length !== 6) throw new Error(`expected 6 levels, got ${levels.length}`)
if (new Set(levelVariants).size !== 39) throw new Error(`expected 39 level-qualified variants, got ${new Set(levelVariants).size}`)
if (sampleRows.length !== 69) throw new Error(`expected 69 samples, got ${sampleRows.length}`)
const expectedOutposts = Object.values(OUTPOSTS).filter((o: any) => o.parent >= 0 && o.parent <= 5)
if (expectedOutposts.length !== 12) throw new Error(`expected 12 outposts, got ${expectedOutposts.length}`)
for (const s of sampleRows.filter((x) => x.forced)) if (s.chunk.variant !== s.variant) throw new Error(`forced variant mismatch ${s.levelId}:${s.variant} -> ${s.chunk.variant}`)
const target = resolve(process.cwd(), 'migration/baseline_20260905/reference/threejs_reference.json')
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, JSON.stringify(out, null, 2) + '\n')
console.log(`reference exported levels=${levels.length} variants=${levelVariants.length} outposts=${out.coverage.outpostCount} bytes=${readFileSync(target).byteLength} path=${target}`)
