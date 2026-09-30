import assert from 'node:assert/strict'
import {LEVELS} from '../src/game/levels'
import {genL5ChunkRaw,l5NestLayout,l5HallAt,l5RegionAt} from '../src/game/world/infiniteL5'
import {h32} from '../src/game/world/infinite'
import {ENTITIES,makeEntity} from '../src/game/entities'
import {provokeMoths,updateMothDoors,updateNestMoth} from '../src/game/engine/moths'
import type {Engine} from '../src/game/engine'
const seed=424242,cache=new Map<string,ReturnType<typeof genL5ChunkRaw>>()
function chunk(x:number,y:number){const cx=Math.floor(x/32),cy=Math.floor(y/32),key=`${cx},${cy}`;let c=cache.get(key);if(!c){c=genL5ChunkRaw(LEVELS[5],seed,cx,cy);cache.set(key,c)}return c}
function tile(x:number,y:number){const c=chunk(x,y),i=((y%32+32)%32)*32+(x%32+32)%32;return{tile:c.tiles[i],tint:c.tint[i],liquid:c.liquid?.[i]}}
let nests=0,beverlys=0,males=0,pools=0
for(let hk=-12;hk<=12;hk++)for(let hr=-12;hr<=12;hr++){
 if(l5HallAt(seed,hk,hr)==='beverly')beverlys++
 const n=l5NestLayout(seed,hk,hr);if(!n)continue;nests++
 const all=[]
 for(let cy=Math.floor((n.y0-1)/32);cy<=Math.floor((n.y1+1)/32);cy++)for(let cx=Math.floor((n.x0-1)/32);cx<=Math.floor((n.x1+1)/32);cx++)all.push(chunk(cx*32,cy*32))
 const inside=(x:number,y:number)=>x>=n.x0&&x<n.x1+1&&y>=n.y0&&y<n.y1+1
 const members=all.flatMap(c=>c.entities).filter(e=>e.mothNest===n.id)
 assert.equal(members.filter(e=>e.type==='deathmoth'&&e.mothForm==='larva').length,18)
 assert.equal(members.filter(e=>e.type==='deathmoth'&&e.mothForm==='female').length,12)
 assert(members.some(e=>e.type==='deathmoth'&&e.mothForm==='guard'));assert(members.every(e=>inside(e.x,e.y)))
 assert(!all.flatMap(c=>c.lights).some(l=>inside(l.x,l.y)),'no nest lamp')
 assert(!all.flatMap(c=>c.exits).some(e=>inside(e.x,e.y)),'no exit bypass')
 const holes=[]
 for(let y=n.y0-1;y<=n.y1+1;y++)for(let x=n.x0-1;x<=n.x1+1;x++){
  if(inside(x+.5,y+.5)){assert.equal(tile(x,y).tile,1);assert.equal(tile(x,y).tint,68)}
  else if(tile(x,y).tile===1)holes.push(`${x},${y}`)
 }
 assert.deepEqual(holes,[`${n.doorX},${n.doorY}`],'only Beverly doorway')
 assert.equal(l5RegionAt(seed,n.doorX+1,n.doorY)?.variant,'beverly')
 const doors=all.flatMap(c=>c.structures).filter(s=>s.data?.mothNest===n.id)
 assert.equal(doors.length,1);assert.equal(doors[0].data!.locked,0);assert(doors[0].solid)
}
for(let cy=-6;cy<=6;cy++)for(let cx=-6;cx<=6;cx++){
 const c=chunk(cx*32,cy*32)
 assert(!c.liquid?.some(v=>v===2),'no shallow shelf')
 pools+=c.liquid?.filter(v=>v===1).length??0
 for(const e of c.entities)if(e.type==='deathmoth'&&(!e.mothForm||e.mothForm==='male')){assert(e.calm);males++}
}
for(let cy=-40;cy<=40;cy++)for(let cx=-40;cx<=40;cx++)if(h32(seed,0x5e92,cx,cy)/4294967296<.0025){for(const e of chunk(cx*32,cy*32).entities)if(e.type==='deathmoth'&&(!e.mothForm||e.mothForm==='male')){assert(e.calm);males++}}
assert(nests>2&&nests<beverlys*.3);assert(pools>0&&males>0)
const n=l5NestLayout(seed,-1,-6)!,larva=makeEntity('deathmoth',n.x0+3,n.y0+3,0,'larva'),female=makeEntity('deathmoth',n.x0+3,n.y0+3,0,'female'),guard=makeEntity('deathmoth',n.x0+3,n.y0+3,0,'guard'),male=makeEntity('deathmoth',100,100,0,'male')
assert.equal(Object.keys(ENTITIES).filter(k=>k==='deathmoth'||k.startsWith('deathmoth_')).length,1)
for(const [e,form] of [[larva,'larva'],[female,'female'],[guard,'guard'],[male,'male']] as const){assert.equal(e.def.type,'deathmoth');assert.equal(e.def.codex.no,ENTITIES.deathmoth.codex.no);assert.equal(e.def.mothForm,form)}
assert.equal(makeEntity('deathmoth_female',0,0).def.type,'deathmoth');assert.equal(makeEntity('deathmoth_female',0,0).def.mothForm,'female')
for(const e of [larva,female,guard])e.mothNest=n.id
const door={data:{mothNest:n.id,open:0}},damage:number[]=[]
const eng={levelDef:LEVELS[5],map:{inf:{seed,ox:0,oy:0},structures:[door],entities:[larva,female,guard,male]},player:{x:n.doorX+2,y:n.doorY+.5},dev:{invisible:false},webbedT:0,msg(){},stepEntity(){return false},hurtPlayer(v:number){damage.push(v)},meleeZOk(){return true},los(){return true}} as unknown as Engine
updateMothDoors(eng);updateNestMoth(eng,female,.1,.1,1);assert(!female.provoked);assert.equal(damage.length,0)
door.data.open=1;updateMothDoors(eng);updateNestMoth(eng,female,.1,.1,1);assert(female.provoked);assert.equal(damage.length,1)
larva.hp--;provokeMoths(eng,larva);assert(eng.map!.inf!.mothAlerts?.all);assert(male.provoked&&guard.provoked)
const count=damage.length;updateNestMoth(eng,larva,.1,0,1);assert.equal(damage.length,count,'larvae never retaliate')
guard.attackCd=0;updateNestMoth(eng,guard,.1,0,1);assert(eng.webbedT>=2.5)
assert(!makeEntity('deathmoth',0,0,0,'larva').def.damage)
console.log(JSON.stringify({nests,beverlys,males,deepPoolTiles:pools,behavior:'door wave, global larva alarm, harmless larvae, guard paralysis passed'}))
