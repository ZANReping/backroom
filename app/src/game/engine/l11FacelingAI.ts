import type { Engine } from '../engine'
import type { Entity } from '../entities'
import type { GameMap } from '../world/mapgen'
import { floorHeight,l11MapSpace } from '../world/mapgen'
import { canOccupy } from '../core/player'
import { l11PedestrianSurface,l11PedestrianSegment,L11_FACELING_RADIUS as R } from '../world/l11PedestrianSpace'
import { l11CollisionRevision } from '../world/l11Collision'
import { l11Hash,l11Local,l11Rand } from '../world/l11Layout'
import { l11InteriorPlan } from '../world/l11Interiors'
import type { L11FacelingHome } from '../world/l11FacelingTypes'
import type { Point } from '../world/l11Geometry'

const GRID=.75,MAX_VISITS=1100,FRAME_NODES=60
type Activity='planning'|'walking'|'waiting-crossing'|'yielding'|'working'|'resting'|'returning'
interface SearchNode {x:number;y:number;parent:number}
interface Search {nodes:SearchNode[];seen:Set<string>;head:number;best:number;score:number;goal:Point;start:Point}
interface Routine {
  activity:Activity;timer:number;cycle:number;path:Point[];search?:Search;stop:number
  crossing:boolean;crossingReady:boolean;blocked:number;interrupted:boolean;travel:number;crossings:number;smoothT:number
}
interface Navigation {structures:GameMap['structures'];ox:number;oy:number;revision:number;cells:Map<string,boolean>;budget:number}
const routines=new WeakMap<Entity,Routine>(),navigation=new WeakMap<GameMap,Navigation>()
export function l11FacelingActivity(e:Entity){const r=routines.get(e);return r?{activity:r.activity,travel:r.travel,crossings:r.crossings,pending:!!r.search,pathLength:r.path.length,next:r.path[0],blocked:r.blocked}:undefined}

/** Shared lazy walkability and a global search budget. Never generate a city
 * macroregion or build a complete navigation mesh in an AI frame. */
export function beginL11FacelingFrame(m:GameMap){
  if(!m.inf)return
  let n=navigation.get(m)
  if(!n||n.structures!==m.structures||n.ox!==m.inf.ox||n.oy!==m.inf.oy||n.revision!==l11CollisionRevision){
    n={structures:m.structures,ox:m.inf.ox,oy:m.inf.oy,revision:l11CollisionRevision,cells:new Map(),budget:FRAME_NODES};navigation.set(m,n)
  }else n.budget=FRAME_NODES
}
const dataAt=(m:GameMap,x:number,y:number)=>m.inf?.chunks.get(`${Math.floor(x/32)},${Math.floor(y/32)}`)?.l11
const cellPoint=(x:number,y:number):Point=>[(x+.5)*GRID,(y+.5)*GRID]
function allowed(m:GameMap,h:L11FacelingHome,x:number,y:number,withinRoom=false){
  const data=dataAt(m,x,y);if(!data)return false
  if(h.role==='pedestrian'){if(!l11PedestrianSurface(data,x,y))return false}
  else{
    const b=data.buildings.find(b=>b.id===h.buildingId);if(!b)return false
    const [u,v]=l11Local(b,x,y),floor=l11InteriorPlan(b).floors[h.floor]
    if(!floor)return false
    if(withinRoom){const r=floor.rooms.find(r=>r.id===h.roomId);if(!r||u<r.x+R||u>r.x+r.w-R||v<r.y+R||v>r.y+r.h-R)return false}
  }
  const lx=x-m.inf!.ox,ly=y-m.inf!.oy,space=l11MapSpace(m,lx,ly,h.floor)
  if(!space?.walkable||space.blocked||space.stair)return false
  return canOccupy(m,lx,ly,R,{z:space.height+.03,band:h.floor})
}
function cellAllowed(m:GameMap,h:L11FacelingHome,x:number,y:number){
  const n=navigation.get(m)!,key=`${h.buildingId??'street'}:${h.floor}:${x}:${y}`
  let value=n.cells.get(key)
  if(value===undefined){value=allowed(m,h,...cellPoint(x,y));if(n.cells.size>18000)n.cells.clear();n.cells.set(key,value)}
  return value
}
export function canPlaceL11Faceling(m:GameMap,e:Entity,x:number,y:number){
  return !e.l11Home||!m.inf||e.provoked?canOccupy(m,x,y,R,{z:e.z,band:e.l11Home?.floor}):allowed(m,e.l11Home,x+m.inf.ox,y+m.inf.oy)
}
function clearLine(m:GameMap,h:L11FacelingHome,a:Point,b:Point,room=false){
  const len=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.max(1,Math.ceil(len/.16))
  if(h.role==='pedestrian'){
    // Split at chunk boundaries so every interval uses its own road graph.
    const cuts=[0,1]
    for(const axis of [0,1])if(Math.abs(b[axis]-a[axis])>1e-8)for(let n=Math.floor(Math.min(a[axis],b[axis])/32)+1;n*32<Math.max(a[axis],b[axis]);n++)cuts.push((n*32-a[axis])/(b[axis]-a[axis]))
    cuts.sort((x,y)=>x-y)
    for(let i=1;i<cuts.length;i++){
      const at=(t:number):Point=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],data=dataAt(m,...at((cuts[i-1]+cuts[i])/2))
      if(!data||!l11PedestrianSegment(data,at(cuts[i-1]),at(cuts[i])))return false
    }
  }
  let z:number|undefined
  for(let i=0;i<=steps;i++){
    const x=a[0]+(b[0]-a[0])*i/steps,y=a[1]+(b[1]-a[1])*i/steps
    if(!allowed(m,h,x,y,room))return false
    const h0=floorHeight(m,x-m.inf!.ox,y-m.inf!.oy,h.floor)
    if(z!==undefined&&Math.abs(h0-z)>.4)return false;z=h0
  }
  return true
}
function newSearch(m:GameMap,e:Entity,r:Routine,goal:Point){
  const h=e.l11Home!,start:Point=[e.x+m.inf!.ox,e.y+m.inf!.oy],cx=Math.floor(start[0]/GRID),cy=Math.floor(start[1]/GRID)
  const candidates:Array<{x:number;y:number;d:number}>=[]
  for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++){const p=cellPoint(cx+x,cy+y);candidates.push({x:cx+x,y:cy+y,d:Math.hypot(p[0]-start[0],p[1]-start[1])})}
  const first=candidates.sort((a,b)=>a.d-b.d).find(p=>cellAllowed(m,h,p.x,p.y)&&clearLine(m,h,start,cellPoint(p.x,p.y)))
  if(!first){r.timer=1.5;r.activity='resting';return}
  r.search={nodes:[{x:first.x,y:first.y,parent:-1}],seen:new Set([`${first.x}:${first.y}`]),head:0,best:0,score:Infinity,goal,start}
  r.activity='planning'
}
function searchStep(m:GameMap,e:Entity,r:Routine){
  const s=r.search!,nav=navigation.get(m)!,h=e.l11Home!
  let visited=0,done=false
  while(s.head<s.nodes.length&&s.head<MAX_VISITS&&nav.budget>0&&visited<20){
    visited++;nav.budget--;const index=s.head++,node=s.nodes[index],p=cellPoint(node.x,node.y),score=Math.hypot(p[0]-s.goal[0],p[1]-s.goal[1])
    if(score<s.score){s.score=score;s.best=index}
    if(score<.85){done=true;break}
    for(const [dx,dy]of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
      const x=node.x+dx,y=node.y+dy,key=`${x}:${y}`;if(s.seen.has(key))continue
      const to=cellPoint(x,y)
      if(Math.hypot(to[0]-s.start[0],to[1]-s.start[1])>38||!cellAllowed(m,h,x,y)){s.seen.add(key);continue}
      // A rejected edge must not close the destination: another neighbour can
      // approach it legally. Validate the entire segment, including curb bends.
      if(!clearLine(m,h,p,to))continue
      s.seen.add(key)
      s.nodes.push({x,y,parent:index})
    }
  }
  if(!done&&s.head<s.nodes.length&&s.head<MAX_VISITS)return
  const path:Point[]=[];let i=s.best
  while(i>=0){const n=s.nodes[i];path.push(cellPoint(n.x,n.y));i=n.parent}
  r.search=undefined;r.path=path.reverse();r.activity='walking'
  if(r.path.length<3){r.path=[];r.timer=2+l11Rand(h.seed,r.cycle,971)*3;r.activity='resting'}
}
function pedestrianGoal(m:GameMap,e:Entity,r:Routine):Point{
  const x=e.x+m.inf!.ox,y=e.y+m.inf!.oy,h=e.l11Home!,rand=l11Rand(h.seed,r.cycle,972)
  // Occasionally deliberately cross at a nearby marked crossing. Other walks
  // follow the current street direction; both still use the same legal graph.
  const crossings=[...new Map([...m.inf!.chunks.values()].flatMap(c=>c.l11?.crosswalks??[]).map(c=>[c.id,c])).values()]
    .filter(c=>Math.hypot(c.center[0]-x,c.center[1]-y)<21)
    .sort((a,b)=>Math.hypot(a.center[0]-x,a.center[1]-y)-Math.hypot(b.center[0]-x,b.center[1]-y))
  if(crossings.length&&rand<.5){const c=crossings[Math.floor(l11Rand(h.seed,r.cycle,973)*Math.min(3,crossings.length))],nx=-c.axis[1],ny=c.axis[0],side=(x-c.center[0])*nx+(y-c.center[1])*ny>=0?-1:1;return [c.center[0]+nx*side*(c.width/2+1.7),c.center[1]+ny*side*(c.width/2+1.7)]}
  const angle=e.facing+(l11Rand(h.seed,r.cycle,974)-.5)*2.8+(r.blocked>0?Math.PI:0),len=18+l11Rand(h.seed,r.cycle,975)*15
  return [x+Math.cos(angle)*len,y+Math.sin(angle)*len]
}
export function updateL11Faceling(eng:Engine,e:Entity,dt:number):boolean{
  if(eng.levelDef.id!==11||e.def.type!=='faceling'||e.def.ignorePacify)return false
  const m=eng.map!,inf=m.inf;if(!inf)return false
  // Developer-spawned ordinary facelings acquire the street routine when they
  // are actually on a sidewalk. Existing non-L11 behavior stays unchanged.
  if(!e.l11Home){const x=e.x+inf.ox,y=e.y+inf.oy,data=dataAt(m,x,y);if(!data||!l11PedestrianSurface(data,x,y))return false;e.l11Home={id:`dev:${e.id}`,role:'pedestrian',seed:l11Hash(inf.seed,e.id),position:[x,y],facing:e.facing,floor:0}}
  const h=e.l11Home
  let r=routines.get(e)
  if(!r){r={activity:h.role==='pedestrian'?'resting':'working',timer:l11Rand(h.seed,970)*2,cycle:0,path:[],stop:0,crossing:false,crossingReady:false,blocked:0,interrupted:false,travel:0,crossings:0,smoothT:0};routines.set(e,r)}
  if(e.provoked){r.interrupted=true;r.path=[];r.search=undefined;return false}
  if(!navigation.has(m))beginL11FacelingFrame(m)
  e.state='idle';e.targetEnt=undefined;e.lungeT=0
  const pos:Point=[e.x+inf.ox,e.y+inf.oy]
  if(r.interrupted){r.interrupted=false;r.timer=.5;r.path=[];r.search=undefined;r.stop=0;r.activity=h.role==='pedestrian'?'resting':'returning'}
  if(r.timer>0){
    r.timer-=dt
    if(h.role!=='pedestrian'){
      // A counter attendant faces a nearby same-floor visitor, otherwise their
      // assigned work surface. Looking is passive and never starts combat.
      const d=Math.hypot(eng.player.x-e.x,eng.player.y-e.y),visitor=d<3&&Math.abs(eng.player.z-e.z)<.8&&eng.los(e.x,e.y,eng.player.x,eng.player.y)
      eng.faceToward(e,visitor?eng.player.x:e.x+Math.cos(h.facing),visitor?eng.player.y:e.y+Math.sin(h.facing),dt,2)
    }
    return true
  }
  if(r.search){searchStep(m,e,r);return true}
  if(!r.path.length){
    r.cycle++
    if(h.role==='pedestrian'){newSearch(m,e,r,pedestrianGoal(m,e,r));return true}
    const stops=h.stops??[h.position],atHome=Math.hypot(pos[0]-h.position[0],pos[1]-h.position[1])<.4
    r.stop=atHome&&stops.length>1?1+Math.floor(l11Rand(h.seed,r.cycle,976)*(stops.length-1)):0
    const goal=stops[r.stop]
    if(Math.hypot(goal[0]-pos[0],goal[1]-pos[1])<.35){r.timer=8+l11Rand(h.seed,r.cycle,977)*16;r.activity='working';return true}
    if(clearLine(m,h,pos,goal,true)){r.path=[goal];r.activity=r.stop?'walking':'returning'}
    else {newSearch(m,e,r,h.position);r.activity='returning'}
    return true
  }
  while(r.path.length&&Math.hypot(r.path[0][0]-pos[0],r.path[0][1]-pos[1])<.16){
    if(r.path.length>1&&!clearLine(m,h,pos,r.path[1])&&Math.hypot(r.path[0][0]-pos[0],r.path[0][1]-pos[1])>1e-6)break
    r.path.shift()
  }
  if(!r.path.length){r.timer=h.role==='pedestrian'?1+l11Rand(h.seed,r.cycle,978)*3:8+l11Rand(h.seed,r.cycle,979)*16;r.activity=h.role==='pedestrian'?'resting':'working';return true}
  // Smooth the raster's small stair-steps only after checking the complete
  // shortcut. This cannot shave a corner across an unmarked carriageway.
  r.smoothT-=dt
  if(r.path.length>2&&r.smoothT<=0){r.smoothT=.3;const j=Math.min(4,r.path.length-1);if(clearLine(m,h,pos,r.path[j]))r.path.splice(0,j)}
  const goal=r.path[0],dx=goal[0]-pos[0],dy=goal[1]-pos[1],d=Math.hypot(dx,dy),step=Math.min(d,(h.role==='pedestrian'?.88:.48)*dt),nx=pos[0]+dx/d*step,ny=pos[1]+dy/d*step
  const nextData=dataAt(m,nx,ny),crossing=h.role==='pedestrian'&&!!nextData&&l11PedestrianSurface(nextData,nx,ny)==='crosswalk'
  if(crossing&&!r.crossing&&!r.crossingReady){r.crossingReady=true;r.activity='waiting-crossing';r.timer=1.1+l11Rand(h.seed,r.cycle,980)*1.5;return true}
  const crowd=m.entities.some(q=>q!==e&&!q.dead&&Math.abs(q.z-e.z)<.7&&Math.hypot(q.x+inf.ox-nx,q.y+inf.oy-ny)<.6&&(q.x-e.x)*dx+(q.y-e.y)*dy>0)
  const player=!eng.dev.invisible&&Math.abs(eng.player.z-e.z)<.7&&Math.hypot(eng.player.x+inf.ox-nx,eng.player.y+inf.oy-ny)<.7
  const height=floorHeight(m,nx-inf.ox,ny-inf.oy,h.floor)
  if(crowd||player||!allowed(m,h,nx,ny)||Math.abs(height-e.z)>.45){
    r.blocked+=dt;r.activity='yielding'
    if(r.blocked>1.8){r.path=[];r.timer=.4+l11Rand(h.seed,r.cycle,981);r.crossingReady=false}
    return true
  }
  if(crossing&&!r.crossing)r.crossings++
  if(!crossing&&r.crossing)r.crossingReady=false
  r.crossing=crossing
  r.blocked=0;r.activity=!r.stop&&h.role!=='pedestrian'?'returning':'walking';e.state='wander'
  e.targetX=goal[0]-inf.ox;e.targetY=goal[1]-inf.oy;eng.faceToward(e,e.targetX,e.targetY,dt,7)
  e.x=nx-inf.ox;e.y=ny-inf.oy;e.z=height+.03;e.animT+=dt*2;r.travel+=step
  return true
}
