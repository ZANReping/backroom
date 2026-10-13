import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {bakeL1} from '../src/game/world/l1Bake'
import {l1BakeBuffers,L1_BAKE_REVISION,type L1BakeQuality} from '../src/game/world/l1BakeTypes'
const mode=process.argv[2]??'verify',folder='reports/l1-remake/iteration-9'
assert(['baseline','verify'].includes(mode));mkdirSync(folder,{recursive:true})
const prefix=`visibility-r${L1_BAKE_REVISION}`
const cases:[number,number,number,L1BakeQuality][]=[[7391,-1,-1,'high'],[1,0,0,'high'],[20261006,192,0,'low'],[20261006,152,0,'high']]
const rows=cases.map(([seed,cx,cy,quality])=>{
 const r=bakeL1(seed,cx,cy,quality),hash=createHash('sha256')
 for(const buffer of l1BakeBuffers(r))hash.update(new Uint8Array(buffer))
 hash.update(JSON.stringify(r.probes))
 return{seed,cx,cy,quality,fingerprint:r.fingerprint,digest:hash.digest('hex'),...r.metrics}
})
if(mode==='verify'){
 const baseline=JSON.parse(readFileSync(folder+`/${prefix}-baseline.json`,'utf8'))
 rows.forEach((r,i)=>{assert.equal(r.fingerprint,baseline[i].fingerprint);assert.equal(r.digest,baseline[i].digest,'visibility-only early exit must not change any light/mesh/probe value')})
}
writeFileSync(folder+`/${prefix}-${mode==='baseline'?'baseline':'optimized'}.json`,JSON.stringify(rows,null,2)+'\n')
console.log(JSON.stringify({mode,passed:true,rows}))
