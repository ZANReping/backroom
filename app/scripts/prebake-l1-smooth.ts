/** Rebuild the shipped reference windows with bounded offline CPU workers. */
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads'
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs'
import {gzipSync,gunzipSync} from 'node:zlib'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {bakeL1} from '../src/game/world/l1Bake'
import {L1_BAKE_REVISION} from '../src/game/world/l1BakeTypes'
import {l1FindReference} from '../src/game/world/l1Spatial'
import {l1PlanRegions,l1PlanRooms} from '../src/game/world/l1Plan'
import {buildL1Data} from '../src/game/world/l1Building'

const app=path.resolve(fileURLToPath(new URL('../',import.meta.url))),defaultOut=path.join(app,'reports/l1-bake-smoothing/offline')
function resolveOut(argv: string[]) {
 const i=argv.indexOf('--out'),raw=i>=0?argv[i+1]:undefined
 if (i>=0 && (!raw || raw.startsWith('-'))) throw new Error('--out requires a relative reports/ path')
 const candidate=raw?path.resolve(app,raw):defaultOut,root=path.resolve(app,'reports')
 const rel=path.relative(root,candidate)
 if (rel.startsWith('..')||path.isAbsolute(rel)) throw new Error('--out must remain inside app/reports')
 return candidate
}
const encode=(v:any):any=>ArrayBuffer.isView(v)?{type:v.constructor.name,base64:Buffer.from(v.buffer,v.byteOffset,v.byteLength).toString('base64')}:Array.isArray(v)?v.map(encode):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)])):v
if(!isMainThread){
 const {seed,cx,cy,out}=workerData,r=bakeL1(seed,cx,cy,'high'),file=`chunk-${cx}-${cy}-high.json.gz`
 writeFileSync(path.join(out,file),gzipSync(JSON.stringify(encode(r))))
 parentPort!.postMessage({file,seed,cx,cy,quality:'high',bakeRevision:r.bakeRevision,fingerprint:r.fingerprint,metrics:r.metrics})
}else{
 const out=resolveOut(process.argv)
 mkdirSync(out,{recursive:true})
 const seed=20261006,anchors=['spawn','parking-common','parking-dim','storage','gothic','ouroboros','garden','fabled','path-room','path-corridor','parking-round']
 const rooms=l1PlanRooms(seed,-850,-850,850,850),room=rooms.find(r=>r.type==='office')??rooms[0]
 const fabled=l1PlanRegions(seed,-3400,-3400,3400,3400).filter(r=>r.section==='fabled').sort((a,b)=>Math.hypot(a.ix0,a.iy0)-Math.hypot(b.ix0,b.iy0))[0]
 const anchorPositions=anchors.map(id=>id==='spawn'?{centerX:15.5,centerY:15.5}:id==='fabled'?{centerX:fabled.ix0+6.5,centerY:fabled.iy1-6.5}:id==='path-room'?{centerX:(room.x0+room.x1)/2,centerY:(room.y0+room.y1)/2}:id==='path-corridor'?{centerX:room.door.x,centerY:room.door.y}:l1FindReference(seed,id,2400)!)
 const baseline={version:1,seed,quality:'high',radius:1,anchors,anchorPositions}
 const jobs=new Map<string,{seed:number;cx:number;cy:number}>()
 for(const [i,p]of anchorPositions.entries()){
  const radius=anchors[i]==='spawn'?2:1
  for(let z=-radius;z<=radius;z++)for(let x=-radius;x<=radius;x++){const cx=Math.floor(p.centerX/32)+x,cy=Math.floor(p.centerY/32)+z;jobs.set(`${cx},${cy}`,{seed,cx,cy})}
 }
 const chunks:any[]=[],queue=[...jobs.values()],started=performance.now();let done=0
 const run=async()=>{for(;;){const job=queue.shift();if(!job)return
  const file=`chunk-${job.cx}-${job.cy}-high.json.gz`,cached=path.join(out,file)
  if(process.argv.includes('--reuse')&&existsSync(cached)){
   const r=JSON.parse(gunzipSync(readFileSync(cached)).toString('utf8'))
   const i=process.argv.indexOf('--refresh-style'),refresh=i>=0?process.argv[i+1]:undefined
   let affected=false
   if(refresh)for(let z=-1;z<=1;z++)for(let x=-1;x<=1;x++)if(buildL1Data(seed,job.cx+x,job.cy+z).roofs.some(r=>r.style===refresh))affected=true
   if(!affected&&r.bakeRevision===L1_BAKE_REVISION&&r.fingerprint===buildL1Data(seed,job.cx,job.cy).fingerprint){chunks.push({file,...job,quality:'high',bakeRevision:r.bakeRevision,fingerprint:r.fingerprint,metrics:r.metrics});console.log(`reused ${job.cx},${job.cy} (${++done}/${jobs.size})`);continue}
  }
  const row=await new Promise<any>((resolve,reject)=>{const worker=new Worker(fileURLToPath(import.meta.url),{workerData:{...job,out}});let received=false
   worker.once('message',v=>{received=true;resolve(v)});worker.once('error',reject);worker.once('exit',code=>{if(!received||code!==0)reject(Error(`Bake worker ${job.cx},${job.cy} exited ${code}`))})
  });chunks.push(row);console.log(`baked ${row.cx},${row.cy} (${++done}/${jobs.size})`)
 }}
 await Promise.all(Array.from({length:3},run));chunks.sort((a,b)=>a.cy-b.cy||a.cx-b.cx)
 const manifest={...baseline,bakeRevision:L1_BAKE_REVISION,chunks}
 writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
 const publish=path.join(app,'public/assets/l1-bakes')
 for(const row of chunks)copyFileSync(path.join(out,row.file),path.join(publish,row.file))
 copyFileSync(path.join(out,'manifest.json'),path.join(publish,'manifest.json'))
 console.log(JSON.stringify({chunks:chunks.length,bakeRevision:L1_BAKE_REVISION,elapsedMs:performance.now()-started,out}))
}
