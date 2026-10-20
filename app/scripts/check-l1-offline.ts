import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {resolve} from 'node:path'
import {buildL1Data} from '../src/game/world/l1Building'
import {L1_BAKE_REVISION} from '../src/game/world/l1BakeTypes'
const root=resolve('public/assets/l1-bakes'),manifest=JSON.parse(readFileSync(resolve(root,'manifest.json'),'utf8')),keys=new Set<string>();let compressedBytes=0
assert.equal(manifest.bakeRevision,L1_BAKE_REVISION)
for(const row of manifest.chunks){
 assert(/^[\w-]+\.json\.gz$/.test(row.file));const bytes=readFileSync(resolve(root,row.file)),r=JSON.parse(gunzipSync(bytes).toString('utf8')),data=buildL1Data(row.seed,row.cx,row.cy)
 for(const key of ['seed','cx','cy','quality','fingerprint','bakeRevision'])assert.equal(r[key],row[key],`${row.file}: ${key}`)
 assert.equal(r.bakeRevision,L1_BAKE_REVISION);assert.equal(r.fingerprint,data.fingerprint,`${row.file}: architecture`)
 const key=`${row.seed}:${row.cx},${row.cy}:${row.quality}`;assert(!keys.has(key));keys.add(key);compressedBytes+=bytes.byteLength
}
assert(keys.size>=9,'published near-entry lighting window')
for(const id of ['spawn','parking-common','storage','gothic','ouroboros','garden','fabled','path-room'])assert(manifest.anchors.includes(id),`v2 bake coverage ${id}`)
assert(manifest.chunks.some((r:any)=>r.cx===0&&r.cy===0),'arrival chunk prebaked')
const result={passed:true,bakeRevision:L1_BAKE_REVISION,chunks:keys.size,anchors:manifest.anchors.length,compressedBytes}
if(process.env.L1_QA_ITERATION){assert(/^iteration-\d+$/.test(process.env.L1_QA_ITERATION));const out=resolve('reports/l1-remake',process.env.L1_QA_ITERATION);mkdirSync(out,{recursive:true});writeFileSync(resolve(out,'offline-check.json'),JSON.stringify(result,null,2)+'\n')}
console.log(JSON.stringify(result))
