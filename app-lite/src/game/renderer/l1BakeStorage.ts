import type {L1BakeResult} from '../world/l1BakeTypes'
import {L1_BAKE_REVISION} from '../world/l1BakeTypes'
const revision=`l1-static-v4-r${L1_BAKE_REVISION}`
let dbPromise:Promise<IDBDatabase|null>|undefined
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
export async function readL1Bake(key:string,_seed:number,_cx:number,_cy:number,_quality:string,fingerprint:string):Promise<L1BakeResult|{compressed:ArrayBuffer}|undefined>{
 const db=await database()
 if(db){const found=await new Promise<L1BakeResult|undefined>(resolve=>{const q=db.transaction('bakes').objectStore('bakes').get(key);q.onsuccess=()=>resolve(q.result?.result);q.onerror=()=>resolve(undefined)});if(found?.fingerprint===fingerprint&&found.bakeRevision===L1_BAKE_REVISION){const t=db.transaction('usage','readwrite');t.objectStore('usage').put({key,used:Date.now(),bytes:found.metrics.bytes});return found}}
 // Lite omits 106 MB of seed-specific offline bakes. The Worker regenerates
 // misses and stores them in IndexedDB through saveL1Bake.
 return undefined
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
