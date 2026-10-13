import assert from 'node:assert/strict'
import {L1_PHOTO_ANCHORS,L1_SHOWCASE_SEED} from '../src/game/world/l1Spatial'
import {l1LayoutVariant} from '../src/game/world/l1Layout'
import {genL1ChunkRaw} from '../src/game/world/infiniteL1'
import {L1} from '../src/game/levels/l1'

const seeds=[1,42,7391,L1_SHOWCASE_SEED], checked=new Set<string>()
function finite(value:number,label:string){assert(Number.isFinite(value),`${label} finite`)}
function check(seed:number,cx:number,cy:number){
 const key=`${seed}:${cx}:${cy}`,variant=l1LayoutVariant(seed,cx,cy),c=genL1ChunkRaw(L1,seed,cx,cy,variant)
 assert(c.l1&&c.l1.version===4,`${key} missing L1 v4 data`)
 assert.equal(c.lights.length,c.l1.emitters.length,`${key} light/emitter count`)
 const floor=(x:number,y:number,label:string)=>{finite(x,`${key} ${label}.x`);finite(y,`${key} ${label}.y`);const tx=Math.floor(x-cx*32),ty=Math.floor(y-cy*32);assert(tx>=0&&tx<32&&ty>=0&&ty<32,`${key} ${label} bounds`);assert.equal(c.tiles[ty*32+tx],1,`${key} ${label} floor`)}
 for(const [i,l] of c.lights.entries()){const e=c.l1.emitters[i];finite(l.x,`${key} light ${i}.x`);finite(l.y,`${key} light ${i}.y`);assert(Math.abs(l.x-(e.position[0]))<1e-6&&Math.abs(l.y-e.position[2])<1e-6,`${key} light ${i} position`);if(l.fixZ!==undefined)assert.equal(l.fixZ,e.position[1]+.2,`${key} light ${i} height`)}
 for(const [i,v] of c.items.entries()){floor(v.x,v.y,`item ${i}`);finite(v.id,`${key} item ${i}.id`)}
 for(const [i,v] of c.exits.entries())floor(v.x,v.y,`exit ${i}`)
 for(const [i,v] of c.entities.entries())floor(v.x,v.y,`entity ${i}`)
 for(const [i,v] of (c.npcs??[]).entries())floor(v.x,v.y,`npc ${i}`)
 checked.add(key);return c
}
for(const a of L1_PHOTO_ANCHORS){const cx=Math.floor(a.centerX/32),cy=Math.floor(a.centerY/32);for(let y=cy-2;y<=cy+2;y++)for(let x=cx-2;x<=cx+2;x++)check(L1_SHOWCASE_SEED,x,y)}
for(const seed of [1,42,7391])for(let cy=-4;cy<=4;cy++)for(let cx=-4;cx<=4;cx++)check(seed,cx,cy)
for(const [seed,cx,cy] of [[1,-4,-4],[42,0,0],[7391,4,4]] as const){const a=check(seed,cx,cy),b=check(seed,cx,cy);assert.equal(a.l1?.fingerprint,b.l1?.fingerprint,`${seed}:${cx}:${cy} fingerprint determinism`);assert.deepEqual(a.items.map(v=>[v.id,v.type,v.x,v.y]),b.items.map(v=>[v.id,v.type,v.x,v.y]),`${seed}:${cx}:${cy} item identity determinism`)}
console.log(`L1 v4 placement checks passed: ${checked.size} chunks`)
