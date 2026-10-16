import assert from 'node:assert/strict'
import { mkdirSync,writeFileSync } from 'node:fs'
import { migrateL11Snapshot, needsL11Migration, L11MigrationBackupError } from '../src/game/engine/l11Migration'
import type { SaveSnapshot } from '../src/game/engine/save'
const key='br_save_slot1',records=new Map<string,string>()
const storage={get:(k:string)=>records.get(k)??null,set:(k:string,v:string)=>{records.set(k,v)}}
const base={v:1,seed:42,level:11,mapSeed:8841,mapFirstVisit:false,time:302,savedAt:71,difficulty:'normal',visited:[0,1,11,115],worldPos:{x:-240,y:800},outpostReturn:11,
  player:{level:11,x:18,y:29,z:3,floor:1,vz:1,tapes:4,hp:65,name:'保留角色',hotbar:[{type:'almond',n:2}],backpack:[{type:'tape',n:4}],equip:{body:{type:'vest'}}},
  career:{routes:{meg:{rank:4,joined:true}},rewarded:['meg-line:city-lesson'],meg:{missions:{'city-lesson':{completed:true},'shelter-chain':{completed:false,stage:2}},legacyRank:4}},
  quests:[{progress:12,done:false}],l0World:{version:2,marker:'preserved'},l1World:{version:4,marker:'preserved'},warehouses:{meg:['almond']},
  l11World:{version:1,seed:8841,chunks:[['old',{structs:[{sid:1}]}]],explored:[['old',[1,1]]],taken:[4],revisions:{old:2},unloaded:{old:5},marks:['capital']}}
let cases=0
for(const level of [11,115,9]){
  records.clear();const original={...base,level,player:{...base.player,level}},raw=JSON.stringify(original,null,2);records.set(key,raw)
  const next=migrateL11Snapshot(raw,key,storage);cases++
  assert.equal(records.get(key),raw,'transform does not overwrite source');assert.equal([...records.values()].filter(v=>v===raw).length,2,'byte-identical full backup')
  assert.equal(next.l11World?.version,2);assert.deepEqual(next.l11World?.chunks,[]);assert.deepEqual(next.l11World?.marks,[])
  for(const field of ['career','quests','l0World','l1World','warehouses','visited','savedAt','time'] as const)assert.deepEqual(next[field as keyof SaveSnapshot],original[field])
  for(const field of ['backpack','hotbar','equip','tapes','hp','name'] as const)assert.deepEqual((next.player as any)[field],original.player[field])
  if(level===9)assert.equal(next.level,9);else{assert.equal(next.level,11);assert.deepEqual(next.worldPos,{x:26.5,y:26.5});assert.equal(next.player.z,0)}
  const count=records.size;assert.deepEqual(migrateL11Snapshot(raw,key,storage),next);assert.equal(records.size,count,'retries reuse verified backup')
  assert(!needsL11Migration(next));assert.deepEqual(migrateL11Snapshot(JSON.stringify(next),key,storage),next);assert.equal(records.size,count,'version 2 is idempotent')
}
for(const failure of ['throw','ignore','corrupt'] as const){
  records.clear();const raw=JSON.stringify(base);records.set(key,raw)
  const broken={...storage,set:(k:string,v:string)=>{if(failure==='throw')throw Error('QuotaExceededError');if(failure==='corrupt')records.set(k,v.slice(0,20))}}
  assert.throws(()=>migrateL11Snapshot(raw,key,broken),L11MigrationBackupError);assert.equal(records.get(key),raw,'failed backup preserves original slot');cases++
}
const result={cases,fullBackup:true,idempotent:true,inventoryTapesRanksQuestsAndOtherLevelsPreserved:true,failClosed:true}
mkdirSync('reports/l11-remake',{recursive:true});writeFileSync('reports/l11-remake/migration-check.json',JSON.stringify(result,null,2));console.log(result)
