import { ENTITIES, canSpawnNaturally } from '../src/game/entities'
import { ENTITY_EVENT_SPAWNS } from '../src/game/entities/spawns'
import { extractLayouts } from '../src/game/design/extractLayouts'
const failures:string[]=[];let checks=0
const ok=(v:unknown,m:string)=>{checks++;if(!v)failures.push(m)}
ok(ENTITIES.pipeworm?.naturalSpawn===false,'pipeworm naturalSpawn is disabled')
ok(canSpawnNaturally('pipeworm')===false,'canSpawnNaturally rejects pipeworm')
ok(!ENTITY_EVENT_SPAWNS.pipeworm,'pipeworm event metadata removed')
const row=extractLayouts().flatMap(x=>x.spawnRules??[]).find(x=>x.key==='infiniteL2.pipeworm.chance') as any
ok(row?.value===0,'extracted pipeworm chance is zero')
ok(/停用/.test(row?.note??''),'extracted note records natural generation disabled')
if(failures.length) { console.error(JSON.stringify({checks,failures})); process.exit(1) }
console.log(JSON.stringify({checks,failures:[]}))



