import assert from 'node:assert/strict'
import { canFlyOccupy, integrateFlight, FLIGHT_BODY_HEIGHT } from '../src/game/core/flight'
import { canOccupy, createIntegrator } from '../src/game/core/player'
import { generateLevel } from '../src/game/world/mapgen'
import { L4 } from '../src/game/levels/l4'
import type { Structure } from '../src/game/core/types'

const original = generateLevel(L4,20261006)
const m = {...original,structures:[] as Structure[],inf:undefined,floors:1}
for (const key of ['tiles','outdoor','elev','tint','up','upWall','up2','upWall2','crawl','ceiling','dn','dnWall','liquid'] as const) m[key] = new Uint8Array(m.w*m.h).fill(key==='tiles'?1:0)
m.stair = new Int32Array(m.w*m.h)
let checks = 0
const check = (v:unknown,label:string) => {assert.ok(v,label);checks++}
const advance = (p:{x:number;y:number;z:number},direction:[number,number,number],seconds:number,noclip=false,fps=60) => {
  const it = createIntegrator()
  for(let n=0;n<seconds*fps;n++) integrateFlight(m,p,...direction,3.4,1/fps,it,3,noclip)
}
let p = {x:20.5,y:20.5,z:0}
advance(p,[0,0,1],2)
check(p.z>1.25 && p.z+FLIGHT_BODY_HEIGHT<=3.001,'rise stops at ceiling with head and camera clearance')
const hover = p.z; advance(p,[0,0,0],2)
check(p.z===hover,'no vertical input hovers without gravity')
advance(p,[0,0,-1],2)
check(p.z>=-.001 && p.z<.04,'descent stops at floor')
m.tiles[20*m.w+22]=2
p={x:20.5,y:20.5,z:.6};advance(p,[1,0,0],2)
check(p.x<=21.681 && p.x>21.6,'wall collision includes player radius')
m.structures=[{kind:'pillar',x:22,y:22,w:.08,h:4,solid:true}]
p={x:20.5,y:23.5,z:.7};advance(p,[1,0,0],2)
check(p.x<21.69,'thin structure blocks horizontal flight')
advance(p,[0,1,0],.4);check(p.y>24.8,'flight slides along thin wall')
m.structures=[{kind:'seadais',x:20,y:20,w:1,h:1,solid:true}]
check(!canFlyOccupy(m,20.5,20.5,.1,3),'low furniture is solid without step allowance')
check(canFlyOccupy(m,20.5,20.5,.42,3),'furniture top is occupiable')
check(canOccupy(m,20.5,20.5,undefined,{z:.1,band:0}),'ordinary walking retains low-step allowance')
m.structures=[];m.floors=3;m.ceiling.fill(1)
check(canFlyOccupy(m,20.5,20.5,4,3),'upper atrium without a floor is open air')
const i=20*m.w+20;m.up[i]=1;m.up2[i]=1
check(!canFlyOccupy(m,20.5,20.5,1.2,3),'head collides with floor slab underside')
check(!canFlyOccupy(m,20.5,20.5,2.9,3),'feet cannot penetrate floor slab')
check(canFlyOccupy(m,20.5,20.5,3,3),'can hover on upper floor')
check(!canFlyOccupy(m,20.5,20.5,4.2,3),'third-floor underside also blocks')
check(canFlyOccupy(m,20.5,20.5,6,3),'third-floor top remains accessible')
m.up[i]=m.up2[i]=0;m.floors=1;m.ceiling.fill(0)
p={x:20.5,y:20.5,z:.7};advance(p,[1,0,1],2,true)
check(p.x>26 && p.z>7,'noclip bypasses wall and ceiling in every axis')
advance(p,[0,0,-1],4,true);check(p.z<0,'noclip can descend through floor')
const at30={x:20.5,y:30.5,z:0},at144={...at30}
advance(at30,[0,1,0],1,false,30);advance(at144,[0,1,0],1,false,144)
check(Math.abs(at30.y-at144.y)<1e-6,'fixed-step flight is frame-rate independent')
check(!canFlyOccupy(m,-1,20,1,3)&&!canFlyOccupy(m,20,20,NaN,3),'invalid and out-of-window positions rejected')
console.log(JSON.stringify({ok:true,checks}))
