import assert from 'node:assert/strict'
import {createTradersMap} from '../src/game/world/tradersWorld'
import {levelDefOf} from '../src/game/levels'
import {TRADERS_VAULT_CELLS} from '../src/game/content/tradersLayout'
import {tradersVisibleChunks,tradersVaultsToPrepare} from '../src/game/renderer/tradersVisibility'
const m=createTradersMap(levelDefOf(102)!,424242),c=TRADERS_VAULT_CELLS[0],x=c.x+c.w/2,y=c.side==='n'?c.y+.35:c.y+c.h-.35
const start=performance.now(),closed=new Set(tradersVisibleChunks(m,x,y,94)),ms=performance.now()-start
assert(closed.has(Math.floor(x/32)+','+Math.floor(y/32)),'own room is visible')
assert(closed.size<=4,'walls prevent closed room from waiting for the entire warehouse')
const door=m.structures.find(s=>s.data?.tradersId==='door_'+c.id)!
door.solid=false;door.data!.open=1
const open=tradersVisibleChunks(m,x,y,94)
assert(open.size>closed.size,'opening the real shutter expands visible architectural readiness')
assert(tradersVaultsToPrepare(m,x,y).has(c.id),'near door prepares contents before opening')
assert(tradersVaultsToPrepare(m,c.x+c.w/2,c.y+c.h/2).has(c.id),'saved position inside vault prepares contents')
assert(tradersVaultsToPrepare(m,9,109).has(c.id),'an open vault stays prepared even from a distant pose')
const again=tradersVisibleChunks(m,x,y,94);assert.equal(again,open,'unchanged pose and door state reuse bounded query')
door.solid=true;door.data!.open=0;assert(!tradersVaultsToPrepare(m,9,109).has(c.id),'far closed vault defers decorative meshes');assert.deepEqual(tradersVisibleChunks(m,x,y,94),closed,'closing shutter invalidates visibility')
for(const [x,y] of [[9,109],[108,94],[325,100],[190,82.6],[403,241]])assert(tradersVisibleChunks(m,x,y,94).has(Math.floor(x/32)+','+Math.floor(y/32)),'arrival, halls and corridors include current chunk')
for(const [px,py] of [[95.9,109],[140.4,82.6],[190,82.6],[239,148],[276.1,142]])for(const key of tradersVisibleChunks(m,px,py)){const [cx,cy]=key.split(',').map(Number);assert(Math.hypot(Math.max(cx*32-px,0,px-cx*32-32),Math.max(cy*32-py,0,py-cy*32-32))<=94,'visibility never waits for a chunk outside streaming reach')}
console.log(JSON.stringify({ok:true,coldQueryMs:ms,closedRoomChunks:closed.size,openRoomChunks:open.size,scope:'actual wall/door visibility affects readiness and priority, never mesh culling'},null,2))
