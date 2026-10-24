import assert from 'node:assert/strict'
const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => ({ getContext: () => null }), createElementNS: () => ({ addEventListener() {}, removeEventListener() {} }) },
  window: { addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const { FOYER_ID, FOYER_CEIL } = await import('../src/game/world/foyerLayout')
const { ceilingHeightAt, hasCeiling } = await import('../src/game/world/mapgen')
const { seatedEyeHeight, standUp, updateSitting } = await import('../src/game/engine/seating')
const { updateMovement } = await import('../src/game/engine/movement')
const { canFlyOccupy, integrateFlight, FLIGHT_BODY_HEIGHT } = await import('../src/game/core/flight')
const { canOccupy, PLAYER_RADIUS } = await import('../src/game/core/player')
const { titleBackgroundSource } = await import('../src/game/core/titleSave')
const { look } = await import('../src/game/renderer/shared')
let checks = 0
const ok = (v: unknown, label: string) => { assert(v, label); checks++ }
const eq = (a: unknown, b: unknown, label: string) => { assert.equal(a, b, label); checks++ }
const close = (a: number, b: number, label: string) => ok(Math.abs(a-b)<.00001, label)
const e = new Engine(); e.newRun(424243, 'normal', 'slot1', true, FOYER_ID)
const m = e.map!
eq(e.seating?.phase, 'seated', 'fresh prologue starts fully seated')
eq(e.seating?.structure.data?.pid, 'desk_chair', 'opening uses real computer chair')
eq(e.seating?.blend, 1, 'completed initial body pose')
close(seatedEyeHeight(e), 1.27, 'seated eyes aligned with computer monitor')
close(look.yaw, Math.PI/2, 'seated camera faces west toward computer')
for(let i=0;i<60;i++)updateSitting(e,1/60)
eq(e.seating?.phase,'seated','idle does not automatically stand')
const snap = e.snapshot()
ok(canOccupy(m,snap.player.x,snap.player.y,PLAYER_RADIUS,{z:snap.player.z}), 'save contains a checked safe standing position')
e.persist()
const resumed = new Engine(); resumed.newRun(424243,'normal','slot1',false,FOYER_ID)
eq(resumed.player.level,FOYER_ID,'saved foyer level restored')
eq(resumed.seating,null,'resume does not replay opening sit at spawn')
close(resumed.player.x,snap.player.x,'resume preserves safe saved x')
close(resumed.player.y,snap.player.y,'resume preserves safe saved y')
ok(standUp(e),'opening seat has safe stand-up path')
for(let i=0;i<60;i++)updateSitting(e,1/60)
eq(e.seating,null,'opening stand-up finishes')
ok(canOccupy(m,e.player.x,e.player.y,PLAYER_RADIUS,{z:e.player.z}),'standing endpoint has body clearance')

const points = [
  ['bedroom',5.8,7.3,2.8], ['bathroom',10.6,6.7,2.8], ['kitchen',14.3,6.2,2.8],
  ['living',10.4,9.5,2.8], ['entry',7.5,12.5,2.8], ['front doorway',5.5,14.5,2.8],
  ['home landing',6,16,2.8], ['lobby',40,11,3], ['street landing',34.8,11,4.6],
  ['stair ramp',37,11,4.6], ['unit doorway',41.5,14.5,2.6], ['store',77,64,3.1],
] as const
for(const [name,x,y,height] of points){
  close(ceilingHeightAt(m,x,y,3),height,name+' matches visible ceiling height')
  close(ceilingHeightAt(m,x,y,999,1),height,name+' does not depend on generic wall height or height band')
  ok(hasCeiling(m,Math.floor(x),Math.floor(y)),name+' has a real roof')
  ok(!canFlyOccupy(m,x,y,height-FLIGHT_BODY_HEIGHT+.02,3),name+' stops upward flight at roof')
}
for(const [x,y] of [[80,54],[60,30],[133,72],[0,0],[-1,8],[500,500]]){
  eq(ceilingHeightAt(m,x,y,3),Infinity,'open sky/void has no invisible roof '+x+','+y)
  eq(hasCeiling(m,Math.floor(x),Math.floor(y)),false,'open sky hasCeiling false '+x+','+y)
}
const safe = [{x:10.4,y:9.5},{x:7.5,y:12.5},{x:5.8,y:7.3}].find(p=>canOccupy(m,p.x,p.y,PLAYER_RADIUS,{z:0}))!
ok(safe,'movement test has clear floor')
Object.assign(e.player,{...safe,z:.95,vz:4.5,crouching:false});e.seating=null;e.introT=0;e.devEnabled=false
let maxZ=0
for(let i=0;i<150;i++){updateMovement(e,1/60,{dmg:1,drain:1},false);maxZ=Math.max(maxZ,e.player.z)}
ok(maxZ>.95&&maxZ<=FOYER_CEIL-1.7+.00001,'jump head stops below visible roof with near-plane clearance')
close(e.player.z,0,'jump returns to ground')
Object.assign(e.player,{...safe,z:1.65,vz:3.6,crouching:true});e.input.crouch=true
maxZ=0
for(let i=0;i<150;i++){updateMovement(e,1/60,{dmg:1,drain:1},false);maxZ=Math.max(maxZ,e.player.z)}
ok(maxZ<=FOYER_CEIL-1.1+.00001,'crouched head stops below visible roof')
e.input.crouch=false
const flight={...safe,z:0},it={acc:0}
for(let i=0;i<180;i++)integrateFlight(m,flight,0,0,1,3.4,1/60,it,3)
ok(flight.z>1&&flight.z<=FOYER_CEIL-FLIGHT_BODY_HEIGHT+.0001,'flight stops under actual 2.8m roof')
for(let i=0;i<60;i++)integrateFlight(m,flight,0,0,1,3.4,1/60,it,3,true)
ok(flight.z>FOYER_CEIL,'explicit noclip can still pass roof')

const slot = (id: 'slot1'|'auto', level: number, savedAt: number) => ({id,label:id,auto:id==='auto',snap:{...snap,level,savedAt}})
eq(titleBackgroundSource([slot('slot1',0,1),slot('auto',FOYER_ID,2)]).level,FOYER_ID,'latest foyer save determines actual title backdrop')
eq(titleBackgroundSource([slot('slot1',FOYER_ID,1),slot('auto',0,2)]).level,0,'later backroom save switches title backdrop back')
eq(titleBackgroundSource([slot('slot1',FOYER_ID,1)]).level,FOYER_ID,'removing newer save restores foyer backdrop')
eq(titleBackgroundSource([]).level,0,'no saves uses backroom backdrop')
eq(titleBackgroundSource([slot('slot1',-9999,1)]).level,0,'invalid level falls back safely')
console.log(JSON.stringify({ok:true,checks,initialEye:1.27,ceilings:points.length,maxFlightZ:flight.z}))
