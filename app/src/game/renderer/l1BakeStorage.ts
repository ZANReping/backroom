import type {L1BakeResult} from '../world/l1BakeTypes'
import {L1_BAKE_REVISION} from '../world/l1BakeTypes'
const revision=`l1-static-v4-r${L1_BAKE_REVISION}`
let dbPromise:Promise<IDBDatabase|null>|undefined,manifest:Promise<{chunks:{file:string;fingerprint:string;cx:number;cy:number;quality:string;seed:number;bakeRevision?:number}[]}>|undefined
const database=()=>dbPromise??=new Promise(resolve=>{
 if(typeof indexedDB==='undefined'){resolve(null);return}
 const q=indexedDB.open(revision,2);q.onupgradeneeded=()=>{
  const db=q.result
  if(!db.objectStoreNames.contains('bakes'))db.createObjectStore('bakes',{keyPath:'key'})
  // This DB only contains regenerable lighting, never game saves. Drop v1
  // entries once so every cached payload has a matching lightweight size row.
  else q.transaction!.objectStore('bakes').clear()
  if(!db.objectStoreNames.contains('usage'))db.createObjectStore('usage',{keyPath:'key'})
 };q.onsuccess=()=>{q.result.onversionchange=()=>q.result.close();resolve(q.result)};q.onerror=()=>resolve(null);q.onblocked=()=>resolve(null)
})
export async function readL1Bake(key:string,seed:number,cx:number,cy:number,quality:string,fingerprint:string):Promise<L1BakeResult|{compressed:ArrayBuffer}|undefined>{
 const db=await database()
 if(db){const found=await new Promise<L1BakeResult|undefined>(resolve=>{const q=db.transaction('bakes').objectStore('bakes').get(key);q.onsuccess=()=>resolve(q.result?.result);q.onerror=()=>resolve(undefined)});if(found?.fingerprint===fingerprint&&found.bakeRevision===L1_BAKE_REVISION){const t=db.transaction('usage','readwrite');t.objectStore('usage').put({key,used:Date.now(),bytes:found.metrics.bytes});return found}}
 if(seed!==20261006)return
 try{
  manifest??=fetch('/assets/l1-bakes/manifest.json').then(r=>r.ok?r.json():{chunks:[]}).catch(()=>({chunks:[]}))
  const row=(await manifest).chunks.find(r=>r.bakeRevision===L1_BAKE_REVISION&&r.seed===seed&&r.cx===cx&&r.cy===cy&&r.quality===quality&&r.fingerprint===fingerprint);if(!row)return
  const response=await fetch('/assets/l1-bakes/'+row.file);if(!response.ok)return
  // Gzip, JSON and base64 decoding belong to the existing bounded Worker pool.
  return{compressed:await response.arrayBuffer()}
 }catch{return undefined}
}
export async function saveL1Bake(key:string,result:L1BakeResult){
 const db=await database();if(!db)return
 try{
  const t=db.transaction(['bakes','usage'],'readwrite'),s=t.objectStore('bakes'),meta=t.objectStore('usage');s.put({key,result});meta.put({key,used:Date.now(),bytes:result.metrics.bytes})
  // Never getAll() on the payload store: that cloned up to 128 MiB for every
  // arriving chunk and triggered collection stalls during otherwise warm frames.
  const q=meta.getAll();q.onsuccess=()=>{const rows=q.result.sort((a,b)=>b.used-a.used);let bytes=0;for(const row of rows){bytes+=row.bytes;if(bytes>128*1024*1024){s.delete(row.key);meta.delete(row.key)}}}
 }catch{/* Storage quota does not interrupt gameplay; memory/Worker remain available. */}
}
