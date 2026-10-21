import assert from 'node:assert/strict'
import {createTradersMap,generateTradersChunk,tradersHomes,captureTradersWorld,restoreTradersWorld} from '../src/game/world/tradersWorld'
import {TRADERS_SHOP_GLAZING,TRADERS_ROOMS} from '../src/game/content/tradersLayout'
import {levelDefOf} from '../src/game/levels'
import {canOccupy} from '../src/game/core/player'
import {enableRuntimeStructCollisionIndex} from '../src/game/world/mapgen'
import {TRADERS_DUTIES,TRADERS_FITOUT,tradersDuty} from '../src/game/content/tradersFitout'
import {seatsFor} from '../src/game/world/seating'
import {updateTradersDuty} from '../src/game/engine/tradersDuty'
import {createTradersResident} from '../src/game/content/tradersPeople'
import {NPCS,type NpcState} from '../src/game/content/npcs'
import type {Engine} from '../src/game/engine'
const m=createTradersMap(levelDefOf(102)!,424242)
assert.equal(m.traders!.chunks.size,0,'fit-out never instantiates the full world at entry')
for(let y=0;y<9;y++)for(let x=0;x<14;x++)generateTradersChunk(m,x,y)
enableRuntimeStructCollisionIndex(m)
assert.equal(TRADERS_SHOP_GLAZING.length,64,'two real side panes per empty storefront')
for(const pane of TRADERS_SHOP_GLAZING)assert(!canOccupy(m,pane.x+pane.w/2,pane.y+pane.h/2,.27,{z:0,band:0}),'glass must have physical collision')
const seats=m.structures.flatMap(s=>seatsFor(s,m,102)),homes=tradersHomes(424242)
assert.equal(TRADERS_DUTIES.length,154);assert.equal(new Set(TRADERS_DUTIES.map(d=>d.id)).size,154)
for(const h of homes){
 const d=tradersDuty(h.id)
 if(d?.seatHeight){const closest=seats.map(a=>({a,dist:Math.hypot(a.x-h.x,a.y-h.y)})).sort((a,b)=>a.dist-b.dist)[0];assert(closest.dist<.08,'no actual chair for '+h.id);assert(Math.abs(closest.a.z-d.seatHeight)<.04,'seat height '+h.id)}
 else assert(canOccupy(m,h.x,h.y,.27,{z:0,band:0}),'blocked duty home '+h.id)
}
for(let i=0;i<homes.length;i++)for(let j=i+1;j<homes.length;j++)assert(Math.hypot(homes[i].x-homes[j].x,homes[i].y-homes[j].y)>.65,'overlapping NPC homes')
const npcs:NpcState[]=homes.map(h=>({id:h.id,def:h.slot===undefined?NPCS[h.id]:createTradersResident(h.slot,424242).def,x:h.x,y:h.y,facing:h.facing,homeX:h.x,homeY:h.y,homeFacing:h.facing,tx:h.x,ty:h.y,moveT:0,bubbleText:'',bubbleT:0}))
const e={map:m,npcs,time:0,player:{x:9,y:109,level:102}} as unknown as Engine
for(let step=0;step<300;step++){
 e.time+=.2
 for(const n of npcs){const x=n.x,y=n.y;updateTradersDuty(e,n,.2,(x,y)=>canOccupy(m,x,y,.24,{z:0,band:0}));const d=tradersDuty(n.id)
  if(d?.activity==='walk'){assert(Math.hypot(n.x-x,n.y-y)<.13,'movement discontinuity');assert(Math.hypot(n.x-n.homeX,n.y-n.homeY)<4.5,'resident escaped assigned route')}
  else{assert.equal(n.x,n.homeX,'job drift');assert.equal(n.y,n.homeY,'job drift')}
 }
}
const before=captureTradersWorld(m)!;assert.equal(before.fitout,1);const next=createTradersMap(levelDefOf(102)!,424242);restoreTradersWorld(next,before)
assert.deepEqual(next.traders!.states,before.structures,'fit-out keeps existing saved door and loot identities')
assert(TRADERS_FITOUT.some(s=>s.data?.tradersModel==='workstation'));assert(TRADERS_FITOUT.some(s=>s.data?.tradersModel==='waiting'))
console.log(JSON.stringify({ok:true,duties:154,seatedDuties:TRADERS_DUTIES.filter(d=>d.seatHeight).length,fitoutObjects:TRADERS_FITOUT.length,seatAnchors:seats.length,simulatedSeconds:60,overlappingHomes:0,blockedHomes:0,worldSaveVersion:before.version,fitoutVersion:before.fitout},null,2))
