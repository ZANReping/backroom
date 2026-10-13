import assert from 'node:assert/strict'
import {buildL1Data} from '../src/game/world/l1Building'
import {bakeL1,l1RayCrossesPortal} from '../src/game/world/l1Bake'
import {l1BakeBuffers} from '../src/game/world/l1BakeTypes'
const p=(x:number,z:number,w:number,d:number)=>({id:'test',x,z,w,d,height:2.2,door:true})
const a=p(0,-1,1,2);assert(l1RayCrossesPortal(a,[-1,1,0], [1,1,0]));assert(l1RayCrossesPortal(a,[1,1,0],[-1,1,0]));assert(!l1RayCrossesPortal(a,[0,1,-2],[0,1,2]));assert(!l1RayCrossesPortal(a,[-1,-.01,0],[1,-.01,0]));assert(!l1RayCrossesPortal(a,[-1,2.21,0],[1,2.21,0]));assert(!l1RayCrossesPortal(a,[-1,1,-.99],[1,1,-.99]));assert(!l1RayCrossesPortal(a,[-.01,1,0],[.01,1,0]))
const b=p(-1,0,2,1);assert(l1RayCrossesPortal(b,[0,1,-1],[0,1,1]));assert(l1RayCrossesPortal(b,[0,1,1],[0,1,-1]))
let found:{seed:number;cx:number;cy:number;data:any}|undefined;for(const seed of [1,42,7391,20261006])for(let cy=-8;cy<=8&&!found;cy++)for(let cx=-8;cx<=8&&!found;cx++){const data=buildL1Data(seed,cx,cy);if(data.openings.some(o=>o.door))found={seed,cx,cy,data}}
assert(found,'no portal opening found');const r=bakeL1(found.seed,found.cx,found.cy,'low');assert(r.portalIds&&r.portalIds.length>0&&r.portalIds.length<=8);assert(r.portalWeights&&r.portalWeights.byteLength===r.size*r.size*8);assert(r.portalWeights.some(v=>v>0));for(const q of r.probes)for(const v of [...(q.portal??[]),...(q.indirectPortal??[])])assert(v>=0&&v<=1);assert(l1BakeBuffers(r).some(b=>b===r.portalWeights!.buffer));console.log(`L1 portal checks passed: ${r.portalIds.length} portals, ${r.portalWeights.byteLength} bytes`)
