import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {l0BaseRegion,l0EnvironmentAt} from '../src/game/world/l0Regions'
import {genL0Architecture,l0Layout} from '../src/game/world/l0Architecture'
import {l0TrimWalls,l0OutletPositions} from '../src/game/world/l0WallDetails'
import {createL0FlickerSampler} from '../src/game/renderer/l0Flicker'
import {inMapView,mapVision,drawMapPlayer,mapWallOccluded} from '../src/game/content/mapPlayer'
import {createCanvas} from '@napi-rs/canvas'
import '../src/game/world/mapgen'
import {LEVELS} from '../src/game/levels'
const report:{[k:string]:unknown}={pass:false},seeds=[7391,781,42561,20261006]
let regions=0,manilas=0,pits=0
for(const seed of seeds){
 const rooms:{x:number;y:number}[]=[],blocks=new Set<string>()
 for(let y=-32;y<=32;y++)for(let x=-32;x<=32;x++){
  const r=l0BaseRegion(seed,x,y);regions++
  if(r==='manila'){
   const key=`${Math.floor(x/8)},${Math.floor(y/8)}`;assert(!blocks.has(key),'two Manila rooms in a 256m block');blocks.add(key)
   for(const p of rooms)assert(Math.max(Math.abs(p.x-x),Math.abs(p.y-y))>=8,'Manila rooms crowd a region boundary')
   rooms.push({x,y});manilas++
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)assert.notEqual(l0BaseRegion(seed,x+dx,y+dy),'arch')
  }
  if(r==='pit'){pits++;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)assert.notEqual(l0BaseRegion(seed,x+dx,y+dy),'pit','adjacent pit regions')}
 }
}
assert(manilas>8&&pits>50)
for(let i=0;i<96;i++){const a=genL0Architecture(LEVELS[0],7391,i%12-6,Math.floor(i/12)-4);assert(!a.structures.some(s=>s.kind==='crate'),'L0 supply crate generated')}
const arch=l0Layout(20261006,3,0)
for(const b of arch.arches)assert(!arch.walls.some(w=>w.bottom===0&&w.top>1.34&&w.x<b.x+.36-.001&&w.x+w.w>b.x+.001&&w.y<b.y+b.length-.001&&w.y+w.h>b.y+.001),'wall passes through an arch')
assert.equal(l0OutletPositions(l0Layout(20261006,18,0)).length,4)
assert.equal(l0OutletPositions(l0Layout(20261006,15,0)).length,0)
const connected=[{x:1,y:1,w:4,h:.24,bottom:0,top:2.7,surface:'wall' as const},{x:1,y:1,w:.24,h:4,bottom:0,top:2.7,surface:'wall' as const}]
let decorated=0;for(let seed=0;seed<1000;seed++){const s=l0TrimWalls(seed,connected);assert(s.size===0||s.size===2,'moulding breaks at connected corner');if(s.size)decorated++}assert(decorated>60&&decorated<180)
const chunks=new Map<string,ReturnType<typeof genL0Architecture>>()
const get=(x:number,y:number)=>{const k=`${x},${y}`;let c=chunks.get(k);if(!c){c=genL0Architecture(LEVELS[0],7391,x,y);chunks.set(k,c)}return c.l0!}
let trimSeams=0
for(let cy=-3;cy<=3;cy++)for(let cx=-3;cx<3;cx++){
 const a=get(cx,cy),b=get(cx+1,cy),trimAt=(x:number,y:number)=>{const walls=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)walls.push(...get(x+dx,y+dy).walls);return l0TrimWalls(7391,walls)},ta=trimAt(cx,cy),tb=trimAt(cx+1,cy)
 for(const u of a.walls)for(const v of b.walls)if(!u.redFace&&!v.redFace&&u.surface==='wall'&&v.surface==='wall'&&u.x<=v.x+v.w+.001&&u.x+u.w>=v.x-.001&&u.y<=v.y+v.h+.001&&u.y+u.h>=v.y-.001){assert.equal(ta.has(u),tb.has(v),'connected trim breaks at streaming boundary');trimSeams++}
}
const manila=genL0Architecture(LEVELS[0],20261006,18,0).l0!,f=manila.flickers![0];assert(f)
const sample=createL0FlickerSampler([manila]),surface=sample(f.x,f.y,1.2,f.nx,0,f.ny),floor=sample(f.x+f.nx*.8,f.y+f.ny*.8,0,0,1,0),behind=sample(f.x-f.nx*.8,f.y-f.ny*.8,0,0,1,0)
assert.equal(surface[3],1,'actual exit wall not selected');assert(floor[0]>.01,'exit has no floor illumination');assert.equal(behind[0],0,'exit light leaks behind wall')
mapVision.fov=Math.PI/2
assert(inMapView(0,-7,0));assert(!inMapView(0,4,0));assert(inMapView(0,1.5,0));assert(inMapView(-7,0,Math.PI/2));assert(!inMapView(7,0,Math.PI/2))
const thinWall=[{x:4.15,y:1,w:.24,h:7}]
assert(mapWallOccluded(thinWall,2.5,3.5,6.5,3.5));assert(!mapWallOccluded(thinWall,2.5,3.5,4.5,3.5));assert(!mapWallOccluded(thinWall,2.5,3.5,4.5,-1.5))
const canvas=createCanvas(256,64),g=canvas.getContext('2d');g.fillStyle='#34372e';g.fillRect(0,0,256,64)
for(let i=0;i<4;i++)drawMapPlayer(g as unknown as CanvasRenderingContext2D,32+i*64,32,i*Math.PI/2,{scale:3,radius:5})
// Exercise actual movement/floor/collision, including diagonal approach and a jump.
const memory=new Map<string,string>();Object.assign(globalThis,{window:{addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})},document:{createElement:()=>({getContext:()=>null,style:{}}),getElementById:()=>null,addEventListener(){},removeEventListener(){},body:{appendChild(){}}},localStorage:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)}})
const {Engine}=await import('../src/game/engine'),{updateMovement}=await import('../src/game/engine/movement'),{computeVisibility}=await import('../src/game/engine/ambient'),{look}=await import('../src/game/renderer/shared')
const e=new Engine();e.seed=20261006;e.loadLevel(0,{mapSeed:e.seed,firstVisit:false});e.introT=0;e.dev.noclip=false;e.dev.god=false
const approaches=[[295.65,9.5,1,0],[297.35,9.5,-1,0],[296.5,8.65,0,1],[296.5,10.35,0,-1],[295.7,8.7,1,1]]
const falls:unknown[]=[]
for(const [x,y,mx,my]of approaches){
 Object.assign(e.player,{x:x-e.map!.inf!.ox,y:y-e.map!.inf!.oy,z:0,vz:0,stamina:100,hp:100,crouching:false});e.updateInfiniteWindow();e.input.mx=mx;e.input.my=my;e.input.jump=false;e.input.sprint=false
 let died=false;e.die=()=>{died=true}
 for(let frame=0;frame<180&&!died;frame++)updateMovement(e,1/120,{dmg:1,drain:1},false)
 assert(died,`pit edge blocked approach ${x},${y}`);falls.push({x,y,z:e.player.z})
}
Object.assign(e.player,{x:295.65-e.map!.inf!.ox,y:9.5-e.map!.inf!.oy,z:0,vz:0,stamina:100,hp:100});e.updateInfiniteWindow();e.input.mx=1;e.input.my=0;e.input.jump=true
let jumped=false;for(let frame=0;frame<70;frame++){updateMovement(e,1/120,{dmg:1,drain:1},false);jumped||=e.player.z>.5}assert(jumped,'pit edge prevented jumping')
const originalMap=e.map!,mock={...originalMap,w:24,h:24,inf:undefined,structures:[],tiles:new Uint8Array(576).fill(1),elev:new Uint8Array(576),step:new Uint8Array(576),stair:new Uint8Array(576),liquid:new Uint8Array(576),tint:new Uint8Array(576)},explored=new Uint8Array(576),visible=new Uint8Array(576)
e.map=mock;e.explored=explored;e.visible=visible;e.player.x=e.player.y=12.5;e.los=()=>true;look.yaw=0;computeVisibility(e)
assert(explored[5*24+12]);assert(!explored[18*24+12]);assert(explored[13*24+12]);look.yaw=Math.PI;computeVisibility(e);assert(explored[18*24+12]);assert(explored[5*24+12],'turning erased explored map')
assert(l0EnvironmentAt(20261006,114,25).arch>.9)
Object.assign(report,{pass:true,regions,manilas,pits,noCrateChunks:96,connectedTrimSeeds:1000,decorated,trimSeams,manilaOutlets:4,redOutlets:0,pitApproaches:falls,jump:true,mapFov:true,flicker:{surface,floor,behind}})
const dir=process.env.QA_OUT??'reports/l0-remake/iteration-18';await mkdir(dir,{recursive:true});await writeFile(`${dir}/refinements.json`,JSON.stringify(report,null,2));await writeFile(`${dir}/map-orientations.png`,canvas.toBuffer('image/png'));console.log(report)
