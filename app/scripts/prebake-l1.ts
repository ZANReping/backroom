import {gzipSync} from 'node:zlib'
import {copyFileSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs'
import {resolve,relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {bakeL1} from '../src/game/world/l1Bake'
import {l1FindReference} from '../src/game/world/l1Spatial'
import {l1PlanRegions,l1PlanRooms} from '../src/game/world/l1Plan'
import {L1_BAKE_REVISION} from '../src/game/world/l1BakeTypes'

const args=process.argv.slice(2),value=(name:string, fallback:string)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]??fallback}
const seed=Number(value('--seed','20261006')),ids=value('--anchors','spawn,parking-common,parking-dim,gothic').split(',').map(v=>v.trim()).filter(Boolean)
const app=resolve(fileURLToPath(new URL('../',import.meta.url))),radius=Math.max(0,Number(value('--radius','0'))),quality=value('--quality','high') as 'high'|'low',root=resolve(app,'reports/l1-remake'),out=resolve(root,value('--out','iteration-5/offline')),publish=args.includes('--publish'),publishDir=resolve(app,'public/assets/l1-bakes')
const rel=relative(root,out);if(rel.startsWith('..')||rel.includes(':'))throw Error('--out must stay inside app/reports/l1-remake')
const publishRel=relative(app,publishDir);if(publishRel.startsWith('..')||publishRel.includes(':'))throw Error('publish target must stay inside app')
if(!Number.isFinite(seed)||!Number.isInteger(radius)||!['high','low'].includes(quality))throw Error('Invalid bake options')
// Resolve v2 locations from the same plan used by the game, not the retired
// horizontal photo strip. Spawn is included to keep a cold first entry quick.
const anchors=ids.map(id=>{
 if(id==='spawn')return{centerX:15.5,centerY:15.5}
 if(id==='path-room'||id==='path-corridor'){
  const rooms=l1PlanRooms(seed,-850,-850,850,850),r=rooms.find(v=>v.type==='office')??rooms[0]
  return r?{centerX:id==='path-room'?(r.x0+r.x1)/2:r.door.x,centerY:id==='path-room'?(r.y0+r.y1)/2:r.door.y}:undefined
 }
 if(id==='fabled'){
  const r=l1PlanRegions(seed,-3400,-3400,3400,3400).filter(v=>v.section==='fabled').sort((a,b)=>Math.hypot(a.ix0,a.iy0)-Math.hypot(b.ix0,b.iy0))[0]
  return r?{centerX:r.ix0+6.5,centerY:r.iy1-6.5}:undefined
 }
 return l1FindReference(seed,id,2400)
});if(anchors.some(a=>!a))throw Error('Unknown or unavailable v2 anchor id')
mkdirSync(out,{recursive:true})
const encode=(v:any):any=>{if(ArrayBuffer.isView(v))return{type:v.constructor.name,base64:Buffer.from(v.buffer,v.byteOffset,v.byteLength).toString('base64')};if(Array.isArray(v))return v.map(encode);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]));return v}
const chunks:any[]=[],done=new Set<string>()
for(const [anchorIndex,a] of (anchors as NonNullable<typeof anchors[number]>[]).entries()){
 const ring=ids[anchorIndex]==='spawn'?Math.max(2,radius):radius
 for(let dy=-ring;dy<=ring;dy++)for(let dx=-ring;dx<=ring;dx++){
 const cx=Math.floor(a.centerX/32)+dx,cy=Math.floor(a.centerY/32)+dy,key=`${cx},${cy}`;if(done.has(key))continue;done.add(key)
 const r=bakeL1(seed,cx,cy,quality),file=`chunk-${cx}-${cy}-${quality}.json.gz`;writeFileSync(resolve(out,file),gzipSync(JSON.stringify(encode(r))));chunks.push({file,seed,cx,cy,quality,bakeRevision:r.bakeRevision,fingerprint:r.fingerprint,metrics:r.metrics})
 console.log(`baked ${key} (${chunks.length})`)
}
}
writeFileSync(resolve(out,'manifest.json'),JSON.stringify({version:1,bakeRevision:L1_BAKE_REVISION,seed,quality,anchors:ids,anchorPositions:anchors,radius,chunks},null,2)+'\n')
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
