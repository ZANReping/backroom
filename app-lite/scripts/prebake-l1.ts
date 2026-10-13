import {gzipSync} from 'node:zlib'
import {copyFileSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs'
import {resolve,relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {bakeL1} from '../src/game/world/l1Bake'
import {L1_PHOTO_ANCHORS} from '../src/game/world/l1Spatial'
import {L1_BAKE_REVISION} from '../src/game/world/l1BakeTypes'

const args=process.argv.slice(2),value=(name:string, fallback:string)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]??fallback}
const seed=Number(value('--seed','20261006')),ids=value('--anchors','parking-common,parking-dim,gothic').split(',').map(v=>v.trim()).filter(Boolean)
const app=resolve(fileURLToPath(new URL('../',import.meta.url))),radius=Math.max(0,Number(value('--radius','0'))),quality=value('--quality','high') as 'high'|'low',root=resolve(app,'reports/l1-remake'),out=resolve(root,value('--out','iteration-5/offline')),publish=args.includes('--publish'),publishDir=resolve(app,'public/assets/l1-bakes')
const rel=relative(root,out);if(rel.startsWith('..')||rel.includes(':'))throw Error('--out must stay inside app/reports/l1-remake')
const publishRel=relative(app,publishDir);if(publishRel.startsWith('..')||publishRel.includes(':'))throw Error('publish target must stay inside app')
if(!Number.isFinite(seed)||!Number.isInteger(radius)||!['high','low'].includes(quality))throw Error('Invalid bake options')
const anchors=ids.map(id=>L1_PHOTO_ANCHORS.find(a=>a.id===id));if(anchors.some(a=>!a))throw Error('Unknown anchor id')
mkdirSync(out,{recursive:true})
const encode=(v:any):any=>{if(ArrayBuffer.isView(v))return{type:v.constructor.name,base64:Buffer.from(v.buffer,v.byteOffset,v.byteLength).toString('base64')};if(Array.isArray(v))return v.map(encode);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]));return v}
const chunks:any[]=[]
for(const a of anchors as NonNullable<typeof anchors[number]>[])for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const cx=Math.floor(a.centerX/32)+dx,cy=Math.floor(a.centerY/32)+dy,r=bakeL1(seed,cx,cy,quality),file=`chunk-${cx}-${cy}-${quality}.json.gz`;writeFileSync(resolve(out,file),gzipSync(JSON.stringify(encode(r))));chunks.push({file,seed,cx,cy,quality,bakeRevision:r.bakeRevision,fingerprint:r.fingerprint,metrics:r.metrics})}
writeFileSync(resolve(out,'manifest.json'),JSON.stringify({version:1,bakeRevision:L1_BAKE_REVISION,seed,quality,anchors:ids,radius,chunks},null,2)+'\n')
if(publish){
 mkdirSync(publishDir,{recursive:true})
 const manifestPath=resolve(publishDir,'manifest.json')
 if(args.includes('--merge')&&existsSync(manifestPath)){
  const old=JSON.parse(readFileSync(manifestPath,'utf8'))
  if(old.seed!==seed||old.quality!==quality||old.radius!==radius)throw Error('Cannot merge different bake seed/quality/radius')
  const key=(c:any)=>`${c.seed}:${c.cx},${c.cy}:${c.quality}`,merged=new Map(old.chunks.filter((c:any)=>c.bakeRevision===L1_BAKE_REVISION).map((c:any)=>[key(c),c]))
  for(const c of chunks)merged.set(key(c),c)
  for(const c of chunks)copyFileSync(resolve(out,c.file),resolve(publishDir,c.file))
  writeFileSync(manifestPath,JSON.stringify({...old,bakeRevision:L1_BAKE_REVISION,anchors:[...new Set([...(old.bakeRevision===L1_BAKE_REVISION?old.anchors:[]),...ids])],chunks:[...merged.values()]},null,2)+'\n')
 }else {for(const c of chunks)copyFileSync(resolve(out,c.file),resolve(publishDir,c.file));copyFileSync(resolve(out,'manifest.json'),manifestPath)}
}
console.log(JSON.stringify({out,seed,quality,chunks:chunks.length}))
