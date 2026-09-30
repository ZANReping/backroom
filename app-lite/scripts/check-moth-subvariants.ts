import assert from 'node:assert/strict'
import {ENTITIES,makeEntity,loadSeen,recordEncounter,recordEntityEncounter,mergeMothCodex} from '../src/game/entities'
import {applyMpEnts} from '../src/game/net/apply'
import type {Engine} from '../src/game/engine'
import type {MothForm} from '../src/game/entities/types'
import type {MpEntSnap} from '../src/game/net/protocol'
const data=new Map<string,string>();Object.assign(globalThis,{localStorage:{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)}})
data.set('br_codex_seen',JSON.stringify({deathmoth:2,deathmoth_larva:3,deathmoth_female:4,deathmoth_guard:1,hound:7}))
assert.deepEqual(loadSeen(),{deathmoth:10,hound:7});assert.deepEqual(loadSeen(),{deathmoth:10,hound:7},'migration doubled encounters')
assert.equal(recordEncounter('deathmoth_female'),11)
const larva=makeEntity('deathmoth',2,2,0,'larva');recordEntityEncounter(larva);recordEntityEncounter(larva);assert.equal(loadSeen().deathmoth,12)
assert.deepEqual(mergeMothCodex({deathmoth_female:true,deathmoth_guard:true,hound:true}),{deathmoth:true,hound:true})
for(const broken of ['null','[]','invalid']){data.set('br_codex_seen',broken);assert.deepEqual(loadSeen(),{})}
assert.deepEqual(Object.keys(ENTITIES).filter(k=>k.startsWith('deathmoth')),['deathmoth'])
const forms:MothForm[]=['male','female','larva','guard'],entities=forms.map(f=>makeEntity('deathmoth',5,5,0,f))
const eng={map:{w:32,h:32,entities},mpSession:{isHost:false}} as unknown as Engine
const snap=(nid:number,mf:MothForm):MpEntSnap=>({nid,tp:'deathmoth',mf,es:mf==='male'?.6:1,x:5,y:5,z:mf==='female'?1:0,f:0,st:'wander',hp:11,dead:false,hid:null,dis:null})
const list=forms.map((f,i)=>snap(i+1,f));applyMpEnts(eng,list)
assert.equal(entities.length,4,'snapshot adoption duplicated entities');forms.forEach((f,i)=>{assert.equal(entities[i].netId,i+1);assert.equal(entities[i].def.mothForm,f)})
assert.equal(entities[0].def.scale,.6);assert.equal(entities[2].def.damage,0);assert.equal(entities[3].def.damage,16)
applyMpEnts(eng,list);assert.equal(entities.length,4,'second snapshot duplicated adopted entity')
applyMpEnts(eng,[{...snap(2,'guard'),hp:75}]);assert.equal(entities[1].def.mothForm,'guard');assert.equal(entities[1].hp,75);assert.equal(entities[1].def.flying,false)
applyMpEnts(eng,[{...snap(5,'female'),tp:'deathmoth_female',mf:undefined,x:15}]);assert.equal(entities[4].def.type,'deathmoth');assert.equal(entities[4].def.mothForm,'female')
console.log('Unified registration, encounter migration/idempotence, no duplicate network adoption, form switching, legacy snapshots and scale sync passed.')
