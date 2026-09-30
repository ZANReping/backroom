import assert from 'node:assert/strict'
import {TRADE_DEFS,tradeParts} from '../src/game/content/tradeDecor'
import {DECOR_REGISTRY} from '../src/game/content/decorRegistry'
import {BNTG_BLUEPRINT} from '../src/game/content/bntgBlueprint'
import {generateLevel,structColliders} from '../src/game/world/mapgen'
import {levelDefOf} from '../src/game/levels'
import {advanceVault,migrateBntg,updateBntg,bntgDoorAllowed,performBntgAction,acceptTradeReceipt,validateTradeAction,VAULT_SLOTS} from '../src/game/engine/bntg'
import {freshCareer,route,restoreCareer} from '../src/game/engine/career'
import type {Engine} from '../src/game/engine'
import { factionState } from '../src/game/engine/factionMissions'
assert.equal(TRADE_DEFS.length,30)
for(const d of TRADE_DEFS){
 assert(DECOR_REGISTRY.some(r=>r.id===d.id),d.id+' registered')
 const s={kind:d.id,x:5,y:5,w:d.w,h:d.d,solid:d.solid,data:{height:d.height,deg:90}}
 const parts=tradeParts(s);assert(parts.length>0)
 for(const p of parts)assert([p.x,p.y,p.z,p.w,p.d,p.h].every(Number.isFinite)&&p.w>0&&p.d>0&&p.h>0,d.id+' valid geometry')
 if(d.solid)assert(structColliders(s).length>0,d.id+' physical collision')
}
const decors=BNTG_BLUEPRINT.decorations!
assert(decors.every(s=>DECOR_REGISTRY.some(r=>r.id===s.kind)))
assert(!decors.some(s=>s.kind==='settlementprop'))
assert.equal(decors.filter(s=>s.kind==='trade_shop').length,16)
assert.equal(decors.filter(s=>s.kind==='rollerdoor').length,8)
assert.equal(decors.filter(s=>s.kind==='trade_car').length,1)
const e={seed:424242,career:freshCareer(),rep:{bntg:20},player:{level:102,x:34,y:31},map:generateLevel(levelDefOf(102)!,424242,true),msg(){}} as unknown as Engine
// Keep the legacy receipt protocol regression isolated from the one-time save migration.
factionState(e,'bntg')
const p=route(e,'bntg');p.joined=true;p.task=4;p.rank=1;p.active=true
const s=migrateBntg(e),v=s.vault,before=structuredClone(v)
e.paused=true;updateBntg(e,100);assert.deepEqual(v,before,'pause freezes anomaly')
e.paused=false;e.player.level=1;updateBntg(e,100);assert.deepEqual(v,before,'leaving freezes anomaly')
e.player.level=102;advanceVault(v,91,e.seed);assert(v.phase>=2&&v.phase<=4);assert(v.remaining>=45&&v.remaining<=90)
const restored=restoreCareer(JSON.parse(JSON.stringify(e.career)));assert.deepEqual(restored.bntg!.vault,v,'disappearance phase persists')
advanceVault(v,5,e.seed);assert.equal(new Set(v.slots).size,3);assert(v.slots.every((n,i)=>n!==before.slots[i]&&VAULT_SLOTS[n]))
assert.equal(v.sequence,1)
const normal=e.map.structures.find(d=>d.kind==='rollerdoor'&&d.data?.room==='storage_0')!
const valuable=e.map.structures.find(d=>d.kind==='rollerdoor'&&d.data?.room==='storage_5')!
assert(bntgDoorAllowed(e,normal),'temporary inventory permit');assert(!bntgDoorAllowed(e,valuable))
p.active=false;assert(!bntgDoorAllowed(e,normal));p.active=true
const target=VAULT_SLOTS[v.slots[0]];assert(validateTradeAction(e,4,'trace0',{...target,level:102},v))
assert(!validateTradeAction(e,4,'trace0',{x:40,y:target.y,level:102},v),'cannot verify across vault wall')
acceptTradeReceipt(e,4,'trace0');acceptTradeReceipt(e,4,'trace0');assert.equal(s.proofs['4'].length,1,'receipt idempotency')
p.task=1;p.work=0
const scale=e.map.structures.find(d=>d.data?.room==='logistics'&&(d.data.services as string[])?.includes('inspect'))!
e.player.x=scale.x+scale.w/2;e.player.y=scale.y+scale.h/2
const cargo=e.map.structures.find(d=>d.data?.manifest==='TH-001')!;cargo.data!.seal='BROKEN'
assert.match(performBntgAction(e,'package'),/封签不符/,'actual cargo seal required')
const old={...freshCareer(),routes:{bntg:{...p,task:7,rank:2,points:[{x:1,y:2,level:1}],work:2,field:2}},settled:['core:bntg:6'],pending:[{id:'core:bntg:6',items:['presses']}]}
e.career=restoreCareer(old);migrateBntg(e);assert.equal(e.career.routes.bntg!.task,7);assert.equal(e.career.routes.bntg!.rank,2);assert.equal(e.career.routes.bntg!.work,0);assert.deepEqual(e.career.settled,old.settled);assert.deepEqual(e.career.pending,old.pending)
console.log('BNTG checks passed: 30 registered components, collisions, 16 shops / 8 cells, pause/reload, unique moving cargo, temporary permits, remote rejection, seal validation, receipts and migration.')

// New mission participation uses the existing shared-vault wire state.
const missionState=factionState(e,'bntg')
missionState.missions['bntg-moving-inventory']={stage:0,progress:0,completed:false,points:[],observed:[],journal:[]}
route(e,'bntg').active=false;e.player.level=102
const newVault=migrateBntg(e).vault;newVault.phase=0;newVault.remaining=60
updateBntg(e,1);assert.equal(newVault.remaining,59,'new mission drives vault with old career inactive')
const permitRank=route(e,'bntg').rank;route(e,'bntg').rank=0
for(const pos of VAULT_SLOTS){
 const room=BNTG_BLUEPRINT.rooms.find(r=>r.id.startsWith('storage_')&&pos.x>=r.x&&pos.x<r.x+r.w&&pos.y>=r.y&&pos.y<r.y+r.h)!
 const door=e.map.structures.find(s=>s.kind==='rollerdoor'&&s.data?.room===room.id)!
 assert(bntgDoorAllowed(e,door),'new permit includes possible cargo cell '+room.id)
}
assert(!bntgDoorAllowed(e,valuable),'new permit does not grant high-value access');route(e,'bntg').rank=permitRank
e.player.level=1
e.mpSession={started:true,isHost:true,remotes:new Map([['guest',{s:{level:102,bntgCounting:true}}]])} as never
updateBntg(e,1);assert.equal(newVault.remaining,58,'remote participant advances host vault while host is elsewhere')
const shared=structuredClone(newVault);shared.remaining=42;shared.sequence=12
e.mpSession={started:true,isHost:false,tradeVault:shared} as never;e.player.level=102
updateBntg(e,20);assert.equal(e.career.bntg!.vault.remaining,42,'guest adopts host time without advancing its own');assert.equal(e.career.bntg!.vault.sequence,12)
console.log('New BNTG mission checks passed: inactive legacy route, all six permitted cargo cells, restricted valuable cell, remote-driven host vault and guest adoption.')
