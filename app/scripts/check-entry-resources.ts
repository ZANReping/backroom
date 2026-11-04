import assert from 'node:assert/strict'
import { needsShrimpHeldWarmup } from '../src/game/renderer/entryResources'
import type { Engine } from '../src/game/engine'
let checks=0
const fixture=()=>({levelDef:{id:900},player:{hotbar:[null],backpack:[null],equip:{pockets:[null],offhand:null}},map:{items:[],entities:[]}})
const test=(e:unknown,want:boolean,label:string)=>{assert.equal(needsShrimpHeldWarmup(e as Engine),want,label);checks++}
test(fixture(),false,'empty original prologue never waits for unavailable shrimp resources')
for(const id of [0,1,2,3,4,5,6,7,8,9,10,11,12,101,102,103,104,105,106,107,108,109,110,111,112,113,114,116,274,902]){const e=fixture();e.levelDef.id=id;test(e,false,'unavailable shrimp never delays Backrooms entry '+id)}
for(const slot of ['hotbar','backpack','pockets','offhand']){const e:any=fixture();if(slot==='offhand')e.player.equip.offhand={type:'liveshrimp'};else if(slot==='pockets')e.player.equip.pockets[0]={type:'liveshrimp'};else e.player[slot][0]={type:'liveshrimp'};test(e,true,'real saved shrimp in '+slot+' still prepares before entry')}
const item:any=fixture();item.map.items.push({type:'liveshrimp'});test(item,true,'developer ground shrimp remains prepared')
const entity:any=fixture();entity.map.entities.push({def:{type:'dryshrimp'},dead:false});test(entity,true,'developer catchable shrimp remains prepared');entity.map.entities[0].dead=true;test(entity,false,'dead shrimp cannot be caught')
for(const id of [0,1,5,8,9,102,902]){const e:any=fixture();e.levelDef.id=id;e.map.entities.push({def:{type:'dryshrimp'},dead:false});test(e,true,'real catch still blocks entry in '+id);e.map.entities=[];e.player.hotbar[0]={type:'liveshrimp'};test(e,true,'held shrimp still blocks entry in '+id)}
console.log(JSON.stringify({passed:checks}))
