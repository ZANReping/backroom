import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {generateLevel,wallAt,type GameMap} from '../src/game/world/mapgen'
import {restitch} from '../src/game/world/infinite'
import {LEVELS} from '../src/game/levels'
import {canOccupy,PLAYER_RADIUS} from '../src/game/core/player'
import {EyeAdaptation} from '../src/game/renderer/eyeAdaptation'
import {glowstickLights} from '../src/game/renderer/glowstickLights'
import {revealMapSight} from '../src/game/world/mapSight'
import {mapVision} from '../src/game/content/mapPlayer'
import {look} from '../src/game/renderer/shared'
import {graphicsSnapshot,graphicsEqual,completeGraphicsPreset,parseGraphicsPresets} from '../src/game/core/graphicsPresets'

const memory=new Map<string,string>()
Object.assign(globalThis,{window:{addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})},document:{createElement:()=>({getContext:()=>null,style:{}}),getElementById:()=>null,addEventListener(){},removeEventListener(){},body:{appendChild(){}}},localStorage:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)}})
const {Engine}=await import('../src/game/engine')
const {defaultSettings,GRAPHICS_PRESETS}=await import('../src/components/SettingsModal')
const {updateProjectiles,throwHeld}=await import('../src/game/engine/combat')
const {captureGlowFlight,restoreGlowFlight}=await import('../src/game/engine/glowsticks')
const {DOCS}=await import('../src/game/content/docs')
const checks:string[]=[]

// Real streamed generation, including restitch before walking for the first time.
const seeds=[20261006,0,1,0xffffffff,...Array.from({length:96},(_,i)=>((i+2)*2654435761)>>>0)]
assert.equal(new Set(seeds).size,100)
for(const seed of seeds){
 const m=generateLevel(LEVELS[0],seed,true),spawn={x:m.spawn.x+.5,y:m.spawn.y+.5}
 assert(canOccupy(m,spawn.x,spawn.y,PLAYER_RADIUS,{z:0}),`spawn blocked: ${seed}`)
 const starter=m.items.filter(it=>it.id<0x200000)
 assert.equal(starter.length,4);assert.equal(starter.filter(it=>it.type==='flashlight').length,1)
 for(const it of starter){assert(canOccupy(m,it.x,it.y,PLAYER_RADIUS,{z:0}));assert(Math.hypot(it.x-spawn.x,it.y-spawn.y)<9)}
 restitch(m);assert(starter.every(it=>m.items.includes(it)),`first stitch lost supplies: ${seed}`)
}
assert(!generateLevel(LEVELS[0],781,false).items.some(it=>it.id<0x200000&&it.type==='flashlight'))
checks.push('100 seeds: safe spawn, four accessible supplies, one flashlight, no loss on restitch; revisit generates none')

const e=new Engine();e.seed=20261006;e.loadLevel(0,{mapSeed:e.seed,firstVisit:true});e.introT=0
const base=e.map!,size=120,count=size*size
const empty:GameMap={...base,inf:undefined,w:size,h:size,structures:[],items:[],lights:[],entities:[],exits:[],tiles:new Uint8Array(count).fill(1),tint:new Uint8Array(count),elev:new Uint8Array(count),step:new Uint8Array(count),stair:new Uint8Array(count),up:new Uint8Array(count),upWall:new Uint8Array(count),liquid:new Uint8Array(count),seaFloor:new Uint8Array(count)}
e.map=empty;e.explored=new Uint8Array(count);e.visible=new Uint8Array(count);Object.assign(e.player,{x:60.5,y:100.5,z:0,floor:0});look.yaw=0;mapVision.range=60;mapVision.fov=Math.PI/2
revealMapSight(e);assert(e.explored[41*size+60]);assert(!e.explored[35*size+60]);assert(!e.explored[110*size+60]);assert(e.explored[101*size+60])
e.explored.fill(0);mapVision.range=12;e.time+=1;revealMapSight(e);assert(e.explored[89*size+60]);assert(!e.explored[80*size+60])
empty.structures=[{kind:'wall',x:40,y:75.25,w:40,h:.24,solid:true,data:{l0Wall:1,bottom:0,top:2.7}} as GameMap['structures'][number]]
mapVision.range=60;e.time++;e.explored.fill(0);revealMapSight(e);assert(e.explored[75*size+60]);assert(!e.explored[73*size+60])
empty.structures[0].solid=false;e.time++;revealMapSight(e);assert(e.explored[41*size+60]);assert(!wallAt(empty,60,41,0))
const timings:number[]=[]
for(let i=0;i<120;i++){e.time+=.2;const t=performance.now();revealMapSight(e);if(i>=20)timings.push(performance.now()-t)}timings.sort((a,b)=>a-b)
checks.push('Visibility reaches 60m / obeys 12m fog cap, view direction, near circle and thin wall/open-door occlusion')

const eye=new EyeAdaptation();eye.update(.02,0,true);const dark=eye.exposure;eye.update(2,.1,true);const glare=eye.glare
assert(eye.exposure<dark&&glare>0);for(let i=0;i<10;i++)eye.update(2,.1,true);assert(eye.exposure<.68)
const bright=eye.exposure;eye.update(.02,.1,true);assert(eye.exposure>bright&&eye.exposure<bright+.06);for(let i=0;i<120;i++)eye.update(0,.1,true);assert(eye.exposure<=1.65)
assert.equal(eye.update(0,.016,false),1);assert.equal(eye.glare,0)
checks.push('Asymmetric exposure: fast bright adaptation, slow dark adaptation, capped gain, temporary glare, toggle reset')

for(const values of Object.values(GRAPHICS_PRESETS)){
 const g=completeGraphicsPreset(defaultSettings,values),settings={...defaultSettings,...g,volume:3,newGameSeed:'abcd-1234'}
 assert(graphicsEqual(settings,g));assert(!graphicsEqual({...settings,exposure:settings.exposure+5},g))
}
const custom=graphicsSnapshot({...defaultSettings,maxPixelRatio:.75,loadingBudgetMs:1,eyeAdaptation:false})
const parsed=parseGraphicsPresets(JSON.stringify([{id:'a',name:' 我的预设 ',values:{...custom,llmApiKey:'secret',exposure:Infinity}}]),defaultSettings)
assert.equal(parsed[0].name,'我的预设');assert.equal(parsed[0].values.maxPixelRatio,.75);assert.equal(parsed[0].values.loadingBudgetMs,1);assert.equal(parsed[0].values.eyeAdaptation,false);assert(!('llmApiKey' in parsed[0].values));assert.equal(parsed[0].values.exposure,defaultSettings.exposure)
assert.deepEqual(parseGraphicsPresets('{broken',defaultSettings),[])
checks.push('Built-in equality, manual deviation, custom round trip, minimum quality values, corrupt input and non-graphics exclusion')

// Throw through the actual combat path, save mid-flight, then pick up and repeat.
e.player.hotbar[0]={type:'glowstick',count:2};e.player.selected=0;look.rayX=0;look.rayY=-1;look.rayZ=0
throwHeld(e,'glowstick');assert.equal(e.player.hotbar[0]?.count,1);assert.equal(glowstickLights(e).length,1)
for(let i=0;i<10;i++)updateProjectiles(e,1/120)
const flight=captureGlowFlight(e);assert.equal(flight.length,1);restoreGlowFlight(e,flight);assert.equal(e.projectiles.length,1)
for(let i=0;i<160;i++)updateProjectiles(e,1/120)
assert.equal(e.projectiles.length,0);assert.equal(empty.items.length,1);assert.equal(empty.items[0].type,'glowstick');assert.equal(glowstickLights(e).length,1)
empty.items=[];assert.equal(glowstickLights(e).length,0)
checks.push('Glowstick consumes one, lights flight/landing, retains flight after restore, and leaves no light after pickup')

e.map=base;e.explored=new Uint8Array(base.w*base.h);e.visible=new Uint8Array(base.w*base.h);Object.assign(e.player,{x:base.spawn.x+.5,y:base.spawn.y+.5,z:0,floor:0})
const flash=base.items.find(i=>i.type==='flashlight'&&i.id<0x200000)!
base.items=base.items.filter(i=>i!==flash);base.inf!.taken.add(flash.id)
e.player.hotbar[0]={type:'glowstick',count:2};throwHeld(e,'glowstick');e.persist()
const resumed=new Engine();resumed.newRun(e.seed,'normal','slot1')
assert(!resumed.map!.items.some(i=>i.id<0x200000&&i.type==='flashlight'),'collected flashlight respawned')
assert.equal(resumed.projectiles.filter(p=>p.type==='glowstick').length,1)
assert.equal(resumed.player.hotbar[0]?.count,1)
for(let i=0;i<200;i++)updateProjectiles(resumed,1/120)
const sticks=resumed.map!.items.filter(i=>i.type==='glowstick').map(i=>i.id);resumed.persist()
const again=new Engine();again.newRun(e.seed,'normal','slot1');assert.deepEqual(again.map!.items.filter(i=>i.type==='glowstick').map(i=>i.id).sort(),sticks.sort())
checks.push('Actual save/newRun: starter does not respawn, airborne stick survives, landed item identity/quantity retained')
assert.equal(DOCS.backrooms_basics.style,'foundation');assert(DOCS.backrooms_basics.body[0].paras[0].includes('马尼拉玛丽基金会'))
checks.push('Existing document ID resolves to the Foundation letter and its dedicated UI style')
const report={pass:true,checks,mapCpu:{median:timings[50],p95:timings[95],samples:100,scenario:'120x120 empty map, 60m range, forced uncached rays; Node CPU only'}}
const output=process.env.QA_OUT??'reports/l0-remake/iteration-19'
await mkdir(output,{recursive:true});await writeFile(output+'/experience.json',JSON.stringify(report,null,2));console.log(report)
