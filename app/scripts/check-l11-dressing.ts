import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { L11_DECOR_DEFS } from '../src/game/content/l11Decor'
import { genL11ChunkRaw } from '../src/game/world/l11Raw'
import { l11VerticalSignMount } from '../src/game/world/l11VerticalSignMounts'
import { L11 } from '../src/game/levels/l11'

const seeds = [42, 20261006]
const counts = new Map<string, number>()
const buildings = new Map<string, { sealed: boolean; accessible: number; archetype: string }>()
const chunks: string[] = []
for (const seed of seeds) {
  // Macroregion (0,0): 32x32 32-metre chunks, plus two negative-coordinate edge samples.
  const coords = [...Array.from({ length: 32 }, (_, cy) => cy).flatMap(cy => Array.from({ length: 32 }, (_, cx) => [cx, cy] as const)), [-1, 0] as const, [0, -1] as const]
  for (const [cx, cy] of coords) {
    const raw = genL11ChunkRaw(L11, seed, cx, cy)
    chunks.push(`${seed}:${cx}:${cy}`)
    for (const s of raw.structures) {
      if (s.kind.startsWith('l11_') && s.kind !== 'l11building') counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1)
      if(s.l11&&l11VerticalSignMount(s.l11)){const kind=s.l11.verticalSign!.mount==='flush'?'l11_vertical_wall_sign':'l11_vertical_blade_sign';counts.set(kind,(counts.get(kind)??0)+1)}
      if (s.kind === 'l11building' && s.l11) buildings.set(s.l11.id, { sealed: s.l11.sealed, accessible: s.l11.accessible, archetype: s.l11.archetype })
    }
  }
}
const missingKinds = L11_DECOR_DEFS.map(d => d.id).filter(id => !counts.has(id))
assert.deepEqual(missingKinds, [], 'all registered prototypes occur in the generated city')
const openness: Record<string, { open: number; sealed: number }> = {}
for (const b of buildings.values()) { const v=openness[b.archetype]??(openness[b.archetype]={open:0,sealed:0});v[b.sealed?'sealed':'open']++ }
for (const [id,v] of Object.entries(openness)) if(v.open+v.sealed>=10) assert(v.open>0&&v.sealed>0,`${id}: openness must not be locked to its archetype index`)
const byCategory = Object.fromEntries(['municipal', 'commerce', 'waterfront', 'service', 'interior'].map(category => {
  const defs = L11_DECOR_DEFS.filter(d => d.category === category)
  return [category, { kinds: defs.filter(d => counts.has(d.id)).length, quantities: Object.fromEntries(defs.map(d => [d.id, counts.get(d.id) ?? 0])) }]
}))
const buildingDistribution = { open: 0, sealed: 0, accessible1: 0, accessible2: 0, accessible3: 0 }
for (const b of buildings.values()) { if (b.sealed) buildingDistribution.sealed++; else { buildingDistribution.open++; buildingDistribution[`accessible${Math.min(3, Math.max(1, b.accessible))}` as 'accessible1'|'accessible2'|'accessible3']++ } }
assert.equal(buildingDistribution.accessible1 + buildingDistribution.accessible2 + buildingDistribution.accessible3, buildingDistribution.open, 'accessible distribution covers open buildings')
const report = { seeds, macroregion: { mx: 0, my: 0, chunksPerAxis: 32, worldBounds: { x0: 0, y0: 0, x1: 1024, y1: 1024 }, extraNegativeSamples: 2 }, scannedChunks: chunks.length, byCategory, missingKinds, buildingCount: buildings.size, buildingDistribution, openness }
await mkdir('reports/l11-remake', { recursive: true }); await writeFile('reports/l11-remake/dressing-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2))
