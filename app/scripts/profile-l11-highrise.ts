import { mkdirSync,writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { genL11ChunkRaw } from '../src/game/world/l11Raw'
import { l11CityPlan,clearL11PlanCache } from '../src/game/world/l11Layout'
import { L11 } from '../src/game/levels/l11'
import { createHash } from 'node:crypto'
const label=process.argv[2]??'baseline',dir='reports/l11-access-fixes'
mkdirSync(dir,{recursive:true})
const runs=[]
for(const seed of [42,74911,20261014]){
  clearL11PlanCache();let t=performance.now();const plan=l11CityPlan(seed,0,0,'highrise'),planMs=performance.now()-t
  const chunks=[],hash=createHash('sha256');hash.update(JSON.stringify(plan))
  for(let y=14;y<19;y++)for(let x=14;x<19;x++){t=performance.now();const raw=genL11ChunkRaw(L11,seed,x,y,'highrise');chunks.push({x,y,ms:performance.now()-t,buildings:raw.l11!.buildings.length,structures:raw.structures.length});hash.update(JSON.stringify(raw))}
  runs.push({seed,planMs,buildings:plan.buildings.length,chunks,totalMs:chunks.reduce((n,c)=>n+c.ms,0),hash:hash.digest('hex')})
}
writeFileSync(`${dir}/generation-${label}.json`,JSON.stringify({label,runs},null,2))
console.log(JSON.stringify(runs.map(r=>({seed:r.seed,planMs:r.planMs,chunksMs:r.totalMs})),null,2))
