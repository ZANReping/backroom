// Pure, world-coordinate architecture. Rendering, collision and room rules share this data.
import type { LevelDef, Structure } from '../core/types'
import type { GenChunk } from './infiniteRegistry'
import type { GameMap } from './mapgen'
import {UNIVERSAL_ITEMS} from '../content/items'
import {RNG} from '../core/rng'
import {applyRedZoneWalls,redZonesNear,redGateClearance,type L0RedZone,type L0RedProgressMap} from './l0RedZone'
import {denseL0Maze} from './l0Maze'
import {continuousL0Partitions} from './l0Partitions'
import {l0Hash,l0BaseRegion,legacyL0Region,l0EnvironmentAt,l0LayoutEnvironment,referenceL0Region,type L0BaseRegion,type L0Effect} from './l0Regions'
export {l0Hash,l0EnvironmentAt,l0LayoutEnvironment} from './l0Regions'
export const L0_REFERENCE_SEED = 20261006
export const L0_HEIGHT = 2.7
export type L0Region = 'maze'|'open'|'pillars'|'arch'|'pillarhall'|'pit'|'blackout'|'red'|'manila'
export type L0Surface = 'wall'|'dots'|'cream'|'khaki'|'red'|'manila'|'pit'
export interface L0Rect {x:number;y:number;w:number;h:number}
export interface L0Wall extends L0Rect {bottom:number;top:number;surface:L0Surface;redFace?:'nx'|'px'|'nz'|'pz';redGate?:string;redZone?:string}
export interface L0Layout {
  seed:number;cx:number;cy:number;region:L0Region;baseRegion:L0BaseRegion;effectOverride?:L0Effect;revision:number;reference:boolean
  walls:L0Wall[];pits:L0Rect[];puddles:(L0Rect&{depth:number})[]
  arches:{x:number;y:number;length:number}[]
  props?:{x:number;y:number;kind:'red-bin'|'paint-can';radius:number;height:number}[]
  mapRegions?:Uint8Array
  lamps:{x:number;y:number;red:boolean;off:boolean;round:boolean;width?:number;depth?:number}[]
  vents?:L0Rect[]
  flickers?:{x:number;y:number;nx:number;ny:number;phase:number}[]
  redZones?:L0RedZone[];wood?:L0Rect;meeting?:L0Rect;trap?:L0Rect;entries?:L0RedEntry[]
}
export interface L0RedEntry extends L0Rect {id:string;axis:'x'|'y';sign:1|-1;plane:number}
export interface L0SpaceState {version:1;revisions:Record<string,number>;space:string;trapped:boolean;checkAt:number;unseen:Record<string,number>;portal?:{lastX:number;lastY:number;armed:boolean;room:number};entryId?:string;redProgress?:L0RedProgressMap}
/** Wood continues through all four full-depth doorway reveals. */
export function l0WoodRects(a:L0Layout):L0Rect[]{return a.wood?[a.wood,...a.walls.filter(w=>w.surface==='manila'&&w.bottom>0).map(({x,y,w,h})=>({x,y,w,h}))]:[]}
export function newL0Space():L0SpaceState{return{version:1,revisions:{},space:'shared',trapped:false,checkAt:0,unseen:{}}}
const rnd=(...v:number[])=>l0Hash(...v)/4294967296
const contains=(r:L0Rect,x:number,y:number,pad=0)=>x>=r.x-pad&&y>=r.y-pad&&x<r.x+r.w+pad&&y<r.y+r.h+pad
export const L0_PHOTO_ANCHORS=[
  {id:'yellow',file:'黄室.jpg',x:13.5,y:25.7,yaw:0,pitch:-.26,fov:60},
  {id:'arch',file:'拱门.jpg',x:112.235,y:29.985,z:.327,yaw:-.31,pitch:-.272,fov:50.42},
  {id:'pillars',file:'柱厅.jpg',x:200.1,y:33.5,z:.25,yaw:-.30,pitch:-.03,fov:65},
  {id:'pits',file:'深坑.webp',x:301.5,y:28,z:-.15,yaw:0,pitch:-.025,fov:50.4},
  {id:'blackout',file:'熄灯区.jpg',x:399.5,y:31.5,z:-.35,yaw:0,pitch:0,fov:65},
  {id:'red',file:'红室.webp',x:488.1,y:33.5,z:.25,yaw:-.30,pitch:-.03,roll:-.12,fov:65},
  {id:'red-lost',file:'红室，玩家迷失前.png',x:501.5,y:21.4,yaw:.25,pitch:-.08,fov:64},
  {id:'manila-inside',file:'马尼拉房间内部.avif',x:591.708,y:14.073,z:.415,yaw:2.983,pitch:-.195,fov:40.01},
  {id:'manila-door',file:'马尼拉房间，从门向内.avif',x:597.55,y:15.75,z:-.12,yaw:1.8,pitch:-.03,fov:43,doors:[90,270]},
  {id:'manila-outside',file:'马尼拉房间附近.avif',x:585.65,y:23.2,yaw:-.02,pitch:-.07,fov:61},
  {id:'manila-wall',file:'马尼拉房间墙纸.avif',x:594.6,y:13.4,yaw:-1.03,pitch:.13,fov:62},
  {id:'manila-plan',file:'马尼拉房间布局.avif',x:592,y:16,yaw:0,pitch:-Math.PI/2,fov:50,z:22},
] as const

export function l0RegionOf(seed:number,cx:number,cy:number):L0Region{
 const ref=referenceL0Region(seed,cx,cy);if(ref)return ref
 const e=l0EnvironmentAt(seed,cx*32+16,cy*32+16)
 return e.effect==='none'?e.base:e.effect
}
export function l0Layout(seed:number,cx:number,cy:number,force?:L0Region,revision=0,legacyContents=false):L0Layout{
  const ref=referenceL0Region(seed,cx,cy),baseRegion=force?(force==='red'||force==='blackout'||force==='pillars'?'pillarhall':force):l0BaseRegion(seed,cx,cy)
  const region=legacyContents?(force??legacyL0Region(seed,cx,cy)):(force?baseRegion:ref??baseRegion),X=cx*32,Y=cy*32
  const reference=seed===L0_REFERENCE_SEED&&((cy===0&&cx%3===0&&cx>=0&&cx<=18)||(cx===6&&Math.abs(cy)<=1)||(cx===15&&cy>=-2&&cy<=1))
  if(reference)revision=0
  const a:L0Layout={seed,cx,cy,baseRegion,region,revision,reference,walls:[],pits:[],puddles:[],arches:[],lamps:[]}
  const wall=(x:number,y:number,w:number,h:number,surface:L0Surface='wall',bottom=0,top=L0_HEIGHT)=>a.walls.push({x:X+x,y:Y+y,w,h,surface,bottom,top})
  const box=(x:number,y:number,w:number,h:number)=>({x:X+x,y:Y+y,w,h})
  // Each edge is owned once. Neighbouring chunks use the same world-edge opening.
  const joins=(nx:number,ny:number)=>(region==='pillarhall'||reference&&region==='red')&&l0RegionOf(seed,nx,ny)===region
  if(!joins(cx-1,cy)){wall(0,0,.24,13);wall(0,17,.24,15)}
  if(!joins(cx,cy-1)){wall(0,0,13,.24);wall(17,0,15,.24)}
  const oldBoundary=a.walls.slice()
  if(region==='manila'){
    // Clear 8x8 interior, 1m thick walls and a continuous exterior ring.
    for(const [x,y,w,h]of [[11,11,4.1,1],[16.3,11,4.7,1],[11,20,4.7,1],[17.05,20,3.95,1],
      [11,12,1,4.1],[11,17.3,1,2.7],[20,12,1,3.3],[20,16.5,1,3.5]])wall(x,y,w,h,'manila')
    for(const [x,y,w,h]of [[15.1,11,1.2,1],[15.7,20,1.35,1],[11,16.1,1,1.2],[20,15.3,1,1.2]])wall(x,y,w,h,'manila',2.13)
    a.wood=box(12,12,8,8);a.meeting=box(9,9,14,14)
    wall(8,8,16,.24);wall(8,8,.24,5);wall(8,17,.24,1.8);wall(4.5,18.8,3.74,.24);wall(8,23.76,5,.24);wall(17,23.76,7,.24);wall(23.76,8,.24,5);wall(23.76,17,.24,7)
    wall(9.45,16,.9,1.15)
  }else if(region==='arch'){
    // The return meets a full pier, never cuts through an arch opening.
    const returnY=legacyContents?14.5:14.015
    wall(13.35,returnY,13.65,.25,'cream');wall(13.35,returnY,.25,29.5-returnY,'cream')
    // Every bay shares exact endpoints with a full-height khaki pier, including
    // the terminal bay. Sills abut piers without gaps or coplanar overlaps.
    if(legacyContents)for(let y=6;y<30;y+=2){wall(20,y,.36,1.98,'cream',0,1.04);wall(20,y,.36,.28,'cream')}
    else for(let i=0;i<=12;i++){
      const y=6+i*2;wall(20,y,.36,.28,'khaki')
      if(i<12){wall(20,y+.28,.36,1.72,'cream',0,1.04);a.arches.push({x:X+20,y:Y+y+.28,length:1.72})}
    }
    if(!legacyContents){
      a.props=[]
      if(reference||rnd(seed,cx,cy,0xb17)<.48)a.props.push({x:X+14.85,y:Y+23.7,kind:'red-bin',radius:.30,height:.72})
      if(reference||rnd(seed,cx,cy,0xca7)<.62)a.props.push({x:X+15.25,y:Y+23.7,kind:'paint-can',radius:.16,height:.32})
    }
  }else if(region==='pit'){
    wall(7,4,12,.24);wall(7,4,.24,19);wall(19,4,.24,19)
    for(let y=9;y<=21;y+=3)for(let x=8;x<=14;x+=2)a.pits.push(box(x,y,1,1))
    wall(3,23,8.07,.3);wall(15.37,23.2,13.63,.3);wall(16.6,12,2.4,6)
  }else if(region==='pillarhall'||region==='pillars'||region==='blackout'||region==='red'){
    const d=region==='pillars'?6:4.8
    for(let y=4;y<31;y+=d)for(let x=4;x<31;x+=d){
      if(reference&&(region==='pillarhall'||region==='red')&&cy===0&&Math.abs(y-28)<.01&&Math.abs(x-8.8)<.01)continue
      if(reference&&region==='blackout'&&Math.abs(y-23.2)<.01&&x>=8.8&&x<15)continue
      if(region==='red'&&x+1.35>17.5&&x<24&&y<23)continue
      if(region==='pillars'&&rnd(seed,cx,cy,x*10,y*10)<.2)continue
      const shift=revision%2&&x===4&&y===4?.65:0
      const nearest=reference&&cy===0&&Math.abs(y-28)<.01
      const edgeShift=nearest?(region==='blackout'?(x<18?-1.75:-.95):(region==='pillarhall'||region==='red')&&x===4?1:0):0
      const main=reference&&cy===0&&(region==='pillarhall'||region==='red')&&Math.abs(y-23.2)<.01
      wall(x+shift+edgeShift-(main&&Math.abs(x-8.8)<.01?.1:main&&Math.abs(x-13.6)<.01?.3:0),y-(nearest&&region==='blackout'?1.5:0),main&&Math.abs(x-8.8)<.01?1.6:1.35,main?2.3:1.8,region==='red'?'red':'wall')
    }
    if(region==='blackout')for(const [x,y]of [[9,13],[18,23]])a.puddles.push({...box(x,y,3,2),depth:.055})
    if(reference&&region==='blackout'){wall(10,4,12,.24);wall(9,23.2,5,1.8)}
    if(region==='red'){
      wall(18,2,.3,21,'red');wall(23,2,.3,21,'red');wall(18,2,5,.3,'red');wall(18,8,3.5,.3,'red')
      if(reference&&cy===0)wall(19.2,15,1,2.8,'red')
      a.trap=box(19,3,3,4)
    }
  }else if(reference){
    wall(13.87,23.46,14,.24)
    wall(4,23.16,8.15,.24,'dots')
    wall(9.5,15.76,4.3,.24);wall(9.5,15.76,.24,2.85)
    wall(3,11.8,26,.24);wall(19,11.8,.24,11.6)
  }else{
    for(let i=0;i<(region==='maze'?10:5);i++){
      const h=l0Hash(seed,cx,cy,i,0x24),x=4+h%23,y=4+(h>>>8)%23,len=3+(h>>>16)%8
      if(cx===0&&cy===0&&Math.abs(x-16)<6&&Math.abs(y-16)<6)continue
      const offset=i===0&&revision%2?1.5:0
      const candidate={x:X+x+(h&1?0:offset),y:Y+y+(h&1?offset:0),w:h&1?Math.min(len,31-x):.24,h:h&1?.24:Math.min(len,31-y)}
      if(a.walls.slice(4).some(w=>candidate.x<w.x+w.w+.9&&candidate.x+candidate.w>w.x-.9&&candidate.y<w.y+w.h+.9&&candidate.y+candidate.h>w.y-.9))continue
      if(h&1)wall(x,y+offset,Math.min(len,31-x),.24)
      else wall(x+offset,y,.24,Math.min(len,31-y))
    }
  }
  for(let y=3;y<31;y+=4)for(let x=3;x<31;x+=4){
    if(a.walls.some(w=>contains(w,X+x,Y+y,.25)))continue
    if(region==='manila'&&contains(a.meeting!,X+x,Y+y)&&!contains(a.wood!,X+x,Y+y))continue
    a.lamps.push({x:X+x,y:Y+y,red:region==='red',off:region==='blackout',round:!!a.wood&&contains(a.wood,X+x,Y+y)})
  }
  if(reference){
    const fixture=(x:number,y:number,width:number,depth=.34)=>({x,y,width,depth,red:region==='red',off:false,round:false})
    if(region==='open')a.lamps=[[12.448,20.018,1.164],[12.857,17.027,1.266],[13.22,14.445,1.146],[13.786,12.2,1.463],[11,27,1.13],[17,27,1.13]].map(([x,y,w])=>fixture(X+x,Y+y,w))
    if(region==='arch')a.lamps=[...a.lamps.filter(l=>l.x>X+20),...[[17.383,24.843,.931],[17.413,21.772,1.143],[17.284,18.285,1.296],[16.138,14.854,1.445]].map(([x,y,w])=>fixture(X+x,Y+y,w))]
    if(region==='pit')a.lamps=[[11.603,20.033,1.058],[11.881,16.953,.993],[12.119,14.155,.866],[12.392,11.339,.945],[16.825,17.81,1.294],[16.31,14.441,.663],[13,27,1.13]].map(([x,y,w])=>fixture(X+x,Y+y,w))
    if(region==='pillarhall'||region==='red'){
      const chain=[[8.124,28.767,1.07],[8,24.58,1.15],[7.841,18.834,1.417],[7.128,-2.271,2.3]]
      a.lamps=[...a.lamps.filter(l=>l.x>X+17||l.y>35),...chain.filter(([,y])=>Math.floor(y/32)===cy).map(([x,y,w])=>fixture(X+x,y,w))]
      if(cy===0)a.vents=[{x:X+9.792,y:31.544,w:.412,h:.412},{x:X+9.914,y:26.456,w:.481,h:.481}]
    }
  }
  if(region==='manila')a.lamps=[...a.lamps.filter(l=>!l.round),...[[13.1,13.9],[18.8,14.1],[18.8,18.1]].map(([x,y])=>({x:X+x,y:Y+y,red:false,off:false,round:true}))]
  if(region==='red'){a.lamps=a.lamps.filter(l=>l.x<X+18||l.x>X+23||l.y>Y+23);const points=reference&&cy===0?[[20.919,19.31,.509],[21.094,18.056,.694],[21.355,15.894,.799],[21.852,11.879,1.127]]:[5,10,13,16,19].map(y=>[21,y,1.13]);for(const [x,y,width]of points)a.lamps.push({x:X+x,y:Y+y,width,depth:reference&&cy===0?1:.34,red:true,off:false,round:false})}
  if(!reference){
    // Sparse ceiling returns use the same detailed, batched model as the
    // reference hall. Stable world positions survive layout revisions.
    a.vents=[]
    for(const [x,y]of [[10.1,10.2],[22.1,26.2]])if(!a.walls.some(w=>contains(w,X+x,Y+y,.6))&&!a.lamps.some(l=>Math.hypot(l.x-X-x,l.y-Y-y)<1))a.vents.push(box(x,y,.44,.44))
  }
  if(!reference&&!legacyContents){
    if(region==='maze'||region==='open'){
      a.walls=region==='maze'?denseL0Maze(seed,cx,cy):continuousL0Partitions(a,seed);a.lamps=[]
      for(let y=3;y<31;y+=4)for(let x=3;x<31;x+=4)a.lamps.push({x:X+x,y:Y+y,red:false,off:false,round:false})
    }
    else a.walls=a.walls.filter(w=>!oldBoundary.includes(w))
    // Fixtures retain the world lattice; reject any inside the new partitions.
    a.lamps=a.lamps.filter(l=>!a.walls.some(w=>contains(w,l.x,l.y,.2)))
    a.vents=a.vents?.filter(v=>!a.walls.some(w=>contains(w,v.x+v.w/2,v.y+v.h/2,.4)))
  }
  if(!legacyContents){
    if(force==='red'||force==='blackout')a.effectOverride=force
    // Apply the selected environment after architecture, without changing its walls.
    for(const l of a.lamps){const e=l0LayoutEnvironment(a,l.x,l.y);l.off=e.blackout>.5;l.red=e.red>.5;if(!l.round&&!reference){l.width=1.2;l.depth=.6}}
    if(!reference){
      a.region=force==='pillars'?'pillarhall':force??l0RegionOf(seed,cx,cy)
      a.entries=[]
      // A red entrance lies beyond an existing elbow; no extra corridor is carved.
      const walls=a.walls.filter(w=>w.bottom===0&&Math.min(w.w,w.h)<.4)
      for(const w of walls){
        const vertical=w.h>w.w,endX=w.x,endY=w.y
        if(!walls.some(v=>v!==w&&(v.w>v.h)!==!vertical&&Math.hypot(v.x-endX,v.y-endY)<.35))continue
        const px=endX+(vertical?1.0:1.7),py=endY+(vertical?1.7:1.0),e=l0LayoutEnvironment(a,px,py)
        if(e.red<.85||a.walls.some(v=>contains(v,px,py,.4)))continue
        a.entries.push({id:`${cx},${cy}:${Math.round(px*100)},${Math.round(py*100)}`,x:px-.5,y:py-.5,w:1,h:1,axis:vertical?'y':'x',sign:1,plane:vertical?py:px})
      }
    }
    if(reference&&a.trap)a.entries=[{...a.trap,id:`reference:${cx},${cy}`,axis:'y',sign:-1,plane:a.trap.y+a.trap.h}]
  }
  return a
}

export function genL0Architecture(def:LevelDef,seed:number,cx:number,cy:number,force?:L0Region,revision=0,redProgress:L0RedProgressMap={}):GenChunk{
  const a=l0Layout(seed,cx,cy,force,revision),X=cx*32,Y=cy*32
  // Keep original item rolls/positions and container IDs through the geometry
  // update. Removed perimeter walls cannot reset supplies or searched crates.
  const contents=l0Layout(seed,cx,cy,force,0,true)
  const raw:GenChunk={l0:a,variant:a.region,tiles:new Uint8Array(1024).fill(1),wet:new Uint8Array(1024),elev:new Uint8Array(1024),step:new Uint8Array(1024),tint:new Uint8Array(1024),crawl:new Uint8Array(1024),structures:[],items:[],lights:[],exits:[],entities:[]}
  let sid=0
  const struct=(kind:Structure['kind'],x:number,y:number,w:number,h:number,solid:boolean,_interact:boolean,data:Structure['data']={})=>raw.structures.push({kind,x:X+x,y:Y+y,w,h,solid,data:{...data,sid:data.sid??l0Hash(seed,cx,cy,data.l0Wall?++sid:0x800,Math.round(x*100),Math.round(y*100))}})
  for(const w of a.walls)struct('pillar',w.x-X,w.y-Y,w.w,w.h,true,false,{l0Wall:1,bottom:w.bottom,top:w.top})
  // Arch windows have a solid sill; their upper shape is visual and above player clearance.
  if(a.baseRegion==='manila'){
    for(const [x,y,w,h,deg]of [[15.1,11,1.2,1,0],[15.7,20,1.35,1,180],[11,16.1,1,1.2,90],[20,15.3,1,1.2,270]])struct('hoteldoor',x,y,w,h,true,true,{manila:1,open:0,deg,l0Door:1})
    struct('dresser',13.325,17.475,1.35,1.35,true,true,{manilaTable:1,l0Furniture:1,loot:1,lootItems:['canned','canned','almond','almond']})
    struct('table',14.045,16.725,.65,.65,true,false,{manila:1,chair:1,deg:0,l0Furniture:1,sid:l0Hash(seed,cx,cy,0x800,Math.round(14.045*100),Math.round(16.625*100))})
    struct('table',15.075,17.925,.65,.65,true,false,{manila:1,chair:1,fallen:1,deg:280,roll:90,l0Furniture:1,sid:l0Hash(seed,cx,cy,0x800,Math.round(15.075*100),Math.round(18.075*100))})
    struct('megdoc',13.625,17.775,.25,.25,false,true,{manila:1,ontable:1,doc:'meg_levels',l0Furniture:1})
    struct('megdoc',14.025,17.975,.25,.25,false,true,{manila:1,ontable:1,doc:'backrooms_basics',l0Furniture:1})
    raw.exits.push({def:def.exits[0],x:X+8.3,y:Y+9.5,discovered:false})
  }
  const woodFloors=l0WoodRects(a)
  a.mapRegions=new Uint8Array(1024)
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){
    const i=y*32+x,wx=X+x+.5,wy=Y+y+.5
    const effect=l0LayoutEnvironment(a,wx,wy)
    raw.tint[i]=effect.red>.5?2:effect.blackout>.5?3:woodFloors.some(r=>contains(r,wx,wy))?1:0
    if(a.pits.some(r=>contains(r,wx,wy)))raw.elev[i]=4
    a.mapRegions[i]=raw.elev[i]===4?4:effect.red>.5?2:effect.blackout>.5?3:woodFloors.some(r=>contains(r,wx,wy))?6:effect.arch>.1?5:a.baseRegion==='pillarhall'?1:0
    if(a.puddles.some(r=>contains(r,wx,wy)))raw.wet[i]=1
  }
  for(const l of a.lamps)if(!l.off)raw.lights.push({x:l.x,y:l.y,r:4.2,color:l.red?'#ff6450':l.round?'#fff1df':'#f7f4dd',flickerSeed:l0Hash(seed,l.x,l.y),fixZ:L0_HEIGHT-.04,noFix:1,gen:1,keep:a.region==='manila'?1:undefined,intensityMul:.42})
  const rx=Math.floor(cx/8),ry=Math.floor(cy/8),hx=rx*8+l0Hash(seed,0xe11,rx,ry)%8,hy=ry*8+l0Hash(seed,0xe12,rx,ry)%8
  if(cx===hx&&cy===hy&&a.region!=='red'&&a.region!=='manila')raw.exits.push({def:def.exits[0],x:X+5,y:Y+1,discovered:false})
  // Existing content pools and probabilities remain available in ordinary exploration.
  if(!a.reference&&contents.region!=='red'&&contents.region!=='manila'){
    const rng=new RNG(l0Hash(seed,cx,cy,0x51)),pool=[...def.items,...UNIVERSAL_ITEMS]
    const spot=()=>{for(let t=0;t<30;t++){const x=rng.int(2,29)+.5,y=rng.int(2,29)+.5;if(!contents.walls.some(w=>contains(w,X+x,Y+y,.8))&&!contents.pits.some(w=>contains(w,X+x,Y+y,.8)))return{x,y}}return null}
    for(let i=0,n=rng.int(1,3);i<n;i++){const p=spot();if(!p)continue;const t=rng.weighted(pool.map(v=>({v:v.type,w:v.w})));raw.items.push({id:0x200000+l0Hash(seed,cx,cy,i),type:t==='almond'&&rng.chance(.1)?'cashew':t,x:X+p.x,y:Y+p.y})}
    if(rng.chance(.1)){const p=spot();if(p)raw.items.push({id:0x200000+l0Hash(seed,cx,cy,9),type:'tape',x:X+p.x,y:Y+p.y})}
    // Consume the old crate roll/position to preserve subsequent loose-item IDs.
    if(rng.chance(.4))spot()
    if(contents.region==='arch'&&rng.chance(.05)){const p=spot();if(p)raw.items.push({id:0x200000+l0Hash(seed,cx,cy,10),type:'squirtgun',x:X+p.x,y:Y+p.y})}
  }
  if(!a.reference&&a.baseRegion==='pillarhall'&&contents.region==='pillars'){
    // The legacy sparse-column item rolls are immutable. Remove a conflicting
    // hall pillar instead of burying an existing item or moving its identity.
    const keep=[...raw.items.map(p=>({x:p.x-.5,y:p.y-.5,w:1,h:1})),...raw.structures.filter(s=>!s.data?.l0Wall).map(s=>({x:s.x-.4,y:s.y-.4,w:s.w+.8,h:s.h+.8}))]
    a.walls=a.walls.filter(w=>!keep.some(r=>w.x<r.x+r.w&&w.x+w.w>r.x&&w.y<r.y+r.h&&w.y+w.h>r.y))
  }
  if(!a.reference&&(a.baseRegion==='maze'||a.baseRegion==='open')){
    // Preserve the immutable contents footprint; narrow cuts leave existing
    // supplies and interactive objects reachable without relocating their IDs.
    const protectedAreas=[...raw.items.map(it=>({x:it.x-.65,y:it.y-.65,w:1.3,h:1.3})),...raw.structures.filter(s=>!s.data?.l0Wall).map(s=>({x:s.x-.6,y:s.y-.6,w:s.w+1.2,h:s.h+1.2}))]
    if(!a.effectOverride)protectedAreas.push(...redZonesNear(seed,cx,cy).flatMap(z=>z.gates.map(redGateClearance)).filter(r=>r.x<X+32&&r.x+r.w>X&&r.y<Y+32&&r.y+r.h>Y))
    if(a.baseRegion==='maze')a.walls=denseL0Maze(seed,cx,cy,protectedAreas)
    for(const p of protectedAreas)a.walls=a.walls.flatMap(w=>{
      if(w.x>=p.x+p.w||w.x+w.w<=p.x||w.y>=p.y+p.h||w.y+w.h<=p.y)return[w]
      if(w.w>w.h)return[{...w,w:Math.max(0,p.x-w.x)},{...w,x:Math.max(w.x,p.x+p.w),w:Math.max(0,w.x+w.w-p.x-p.w)}].filter(v=>v.w>.08)
      return[{...w,h:Math.max(0,p.y-w.y)},{...w,y:Math.max(w.y,p.y+p.h),h:Math.max(0,w.y+w.h-p.y-p.h)}].filter(v=>v.h>.08)
    })
    raw.structures=raw.structures.filter(s=>!s.data?.l0Wall)
    for(const w of a.walls)struct('pillar',w.x-X,w.y-Y,w.w,w.h,true,false,{l0Wall:1,bottom:w.bottom,top:w.top})
  }
  if(!a.reference&&a.region!=='manila')for(const e of raw.exits){
    const candidates=a.walls.filter(w=>w.bottom===0&&Math.max(w.w,w.h)>2).flatMap(w=>w.w>w.h?[{x:w.x+w.w/2,y:w.y-.7},{x:w.x+w.w/2,y:w.y+w.h+.7}]:[{x:w.x-.7,y:w.y+w.h/2},{x:w.x+w.w+.7,y:w.y+w.h/2}])
    const safe=candidates.find(p=>p.x>X+.5&&p.x<X+31.5&&p.y>Y+.5&&p.y<Y+31.5&&!a.walls.some(w=>contains(w,p.x,p.y,.4))&&!a.pits.some(r=>contains(r,p.x,p.y,.6)))
    if(safe){e.x=safe.x-.5;e.y=safe.y-.5}
  }
  if(!a.reference&&a.baseRegion==='maze'){
    a.lamps=[]
    for(let y=3;y<31;y+=4)for(let x=3;x<31;x+=4){const wx=X+x,wy=Y+y;if(a.walls.some(w=>contains(w,wx,wy,.65)))continue;const e=l0LayoutEnvironment(a,wx,wy);a.lamps.push({x:wx,y:wy,round:false,width:1.2,depth:.6,off:e.blackout>.5,red:e.red>.5})}
    raw.lights=a.lamps.filter(l=>!l.off).map(l=>({x:l.x,y:l.y,r:4.2,color:l.red?'#ff6450':'#f7f4dd',flickerSeed:l0Hash(seed,l.x,l.y),fixZ:L0_HEIGHT-.04,noFix:1,gen:1,intensityMul:.42}))
  }
  if(!a.effectOverride)applyRedZoneWalls(a,redProgress)
  // Well walls occupy the ground outside the precise opening, below the floor.
  for(const p of a.pits)for(const [x,y,w,h]of [[p.x-.03,p.y,.03,p.h],[p.x+p.w,p.y,.03,p.h],[p.x,p.y-.03,p.w,.03],[p.x,p.y+p.h,p.w,.03]])a.walls.push({x,y,w,h,bottom:-9,top:0,surface:'pit'})
  raw.structures=raw.structures.filter(s=>!s.data?.l0Wall)
  for(const w of a.walls)struct('pillar',w.x-X,w.y-Y,w.w,w.h,true,false,{l0Wall:1,bottom:w.bottom,top:w.top})
  for(const p of a.props??[])struct('pillar',p.x-X-p.radius,p.y-Y-p.radius,p.radius*2,p.radius*2,true,false,{l0Wall:1,l0Prop:1,bottom:0,top:p.height})
  a.flickers=raw.exits.filter(e=>e.def.kind==='flickerdoor').flatMap(e=>{const hit=l0WallSurface(a.walls,e.x+.5,e.y+.5);return hit?[{x:hit.x,y:hit.y,nx:Math.sin(hit.yaw),ny:Math.cos(hit.yaw),phase:(l0Hash(seed,cx,cy,0xf11)%628)/100}]:[]})
  return raw
}
/** Layout refinements can cover saved drops with a new wall or pillar.
 * Repair only covered drops, within their original chunk and red enclosure. */
export function l0RestoredDropPosition(a:L0Layout,x:number,y:number):{x:number;y:number}{
  if(!a.walls.some(w=>!w.redZone&&w.bottom<1.5&&w.top>0&&contains(w,x,y,.12)))return{x,y}
  const zones=(a.redZones??[]).map(z=>({r:z.bounds,inside:contains(z.bounds,x,y)}))
  const safe=(px:number,py:number)=>px>a.cx*32+.2&&px<(a.cx+1)*32-.2&&py>a.cy*32+.2&&py<(a.cy+1)*32-.2&&zones.every(z=>contains(z.r,px,py)===z.inside)&&!a.walls.some(w=>w.bottom<1.5&&w.top>0&&contains(w,px,py,.2))&&!a.pits.some(r=>contains(r,px,py,.2))
  for(let d=.25;d<=3;d+=.25)for(let i=0;i<16;i++){const px=x+Math.cos(i*Math.PI/8)*d,py=y+Math.sin(i*Math.PI/8)*d;if(safe(px,py))return{x:px,y:py}}
  return{x,y}
}
export function l0Sample(m:GameMap,x:number,y:number){const inf=m.inf,a=l0At(m,x,y);return inf&&a?l0LayoutEnvironment(a,x+inf.ox,y+inf.oy):undefined}
export function l0At(m:GameMap,x:number,y:number):L0Layout|undefined{
  const inf=m.inf;if(!inf?.l0)return
  return inf.chunks.get(`${Math.floor((x+inf.ox)/32)},${Math.floor((y+inf.oy)/32)}`)?.l0
}
export function l0Meeting(m:GameMap,x:number,y:number):number{
  const inf=m.inf;if(!inf?.l0||inf.l0.trapped)return 0
  const wx=x+inf.ox,wy=y+inf.oy
  for(const c of inf.chunks.values()){const r=c.l0?.meeting;if(!r)continue;const d=Math.max(r.x-wx,wx-r.x-r.w,r.y-wy,wy-r.y-r.h);if(d<2)return Math.max(0,Math.min(1,1-d/2))}
  return 0
}
export function l0Inside(r:L0Rect,x:number,y:number){return contains(r,x,y)}

/** Place a wall effect on actual thin-wall faces, not the old one-metre tile grid. */
export function l0WallMount(m:GameMap,x:number,y:number){
  const walls=m.structures.filter(s=>s.data?.l0Wall).map(s=>({x:s.x,y:s.y,w:s.w,h:s.h,bottom:Number(s.data?.bottom),top:Number(s.data?.top)}))
  const hit=l0WallSurface(walls,x,y)
  return hit?{...hit,x:hit.x+Math.sin(hit.yaw)*.012,y:hit.y+Math.cos(hit.yaw)*.012}:undefined
}
export function l0WallSurface(walls:{x:number;y:number;w:number;h:number;bottom:number;top:number}[],x:number,y:number){
  let best:{x:number;y:number;yaw:number;distance:number}|undefined
  const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v))
  const offer=(px:number,py:number,nx:number,ny:number,yaw:number)=>{
    if((x-px)*nx+(y-py)*ny<0)return
    const distance=Math.hypot(x-px,y-py)
    if(distance<4&&(!best||distance<best.distance))best={x:px,y:py,yaw,distance}
  }
  for(const s of walls){
    if(s.bottom>0.1||s.top<2.2)continue
    if(s.h>=1.2){const py=clamp(y,s.y+.6,s.y+s.h-.6);offer(s.x,py,-1,0,-Math.PI/2);offer(s.x+s.w,py,1,0,Math.PI/2)}
    if(s.w>=1.2){const px=clamp(x,s.x+.6,s.x+s.w-.6);offer(px,s.y,0,-1,Math.PI);offer(px,s.y+s.h,0,1,0)}
  }
  return best
}

/** Five rooms in one logical space: the last obscured bend returns to the first room. */
export function genL0Private(def:LevelDef,seed:number,cx:number,cy:number):GenChunk{
  const raw=genL0Architecture(def,seed,cx,cy,'red'),a=raw.l0!,X=cx*32,Y=cy*32
  raw.tiles.fill(2);raw.items=[];raw.exits=[];raw.structures=[];a.walls=[];a.trap=undefined;a.entries=[];a.effectOverride='red';a.reference=false
  const rooms=[[2,22,7,8],[2,13,7,7],[11,13,7,7],[11,3,7,7],[22,3,7,7],[4,19,3,4],[8,15,4,3],[13,9,3,5],[17,5,6,3]]
  for(const [x,y,w,h]of rooms)for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)raw.tiles[j*32+i]=1
  const floor=(x:number,y:number)=>x>=0&&y>=0&&x<32&&y<32&&raw.tiles[y*32+x]===1
  for(let y=0;y<32;y++)for(let x=0;x<32;x++)if(floor(x,y)){
    for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1]])if(!floor(x+dx,y+dy)){
      const w={x:X+x+(dx>0?1:0)-(dx?.1:0),y:Y+y+(dy>0?1:0)-(dy?.1:0),w:dx?.2:1,h:dy?.2:1,bottom:0,top:L0_HEIGHT,surface:'red' as const};a.walls.push(w)
    }
  }
  // Congruent screened return pockets: local surfaces at the seam differ only by translation.
  a.walls.push({x:X+6,y:Y+22,w:.2,h:5,bottom:0,top:L0_HEIGHT,surface:'red'},{x:X+26,y:Y+3,w:.2,h:5,bottom:0,top:L0_HEIGHT,surface:'red'})
  raw.structures=a.walls.map((w,i)=>({kind:'pillar',x:w.x,y:w.y,w:w.w,h:w.h,solid:true,data:{l0Wall:1,bottom:0,top:L0_HEIGHT,sid:i+1}}))
  a.lamps=a.lamps.filter(l=>floor(Math.floor(l.x-X),Math.floor(l.y-Y)))
  a.vents=a.vents?.filter(v=>floor(Math.floor(v.x-X),Math.floor(v.y-Y)))
  raw.lights=raw.lights.filter(l=>floor(Math.floor(l.x-X),Math.floor(l.y-Y)))
  return raw
}
