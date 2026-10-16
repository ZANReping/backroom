import type { Engine } from '../engine'
import type { ExitDef, ExitInstance, FloorBand } from '../core/types'
import { canOccupy, PLAYER_RADIUS } from '../core/player'
import { floorHeight, walkableAt, type GameMap } from '../world/mapgen'
import { look } from '../core/renderer3d'
import { l11CityPlan, l11SurfaceAt, type L11Building } from '../world/l11Layout'
import { l11OfficeExit, L11_EXIT_SIGN_SPACING, L11_EXIT_BUILDING_SPACING, L11_ROAD_EXITS } from '../world/l11ExitPlan'
import { exitDistance, exitMatches, l11BuildingExitInstance } from '../world/devExitSearch'
import { prepareDevExit } from './devExitPreparation'
import type { GenChunk } from '../world/infiniteRegistry'
import { inPolygon, segmentDistance } from '../world/l11Geometry'
import { insideRedZone, redZonesNear } from '../world/l0RedZone'
import { infiniteImplFor } from '../world/infiniteRegistry'
import { l0WallSurface } from '../world/l0Architecture'

export interface DevExitResult {ok:boolean;message:string}
const result=(ok:boolean,message:string):DevExitResult=>({ok,message})
const stairKinds=new Set(['graystairs','graystairsup','oldstairs','stairs'])
const roadKinds=new Set(['l11roadback','countrypath','longroad','grasspath','arrowsign'])

/** Body clearance and floor support, including the whole standing footprint.
 * Radius-ordered samples give the closest safe spot to within 10 cm. */
export function devExitSafeSpot(m:GameMap,e:ExitInstance,radius=6){
  const band=e.floor??0,cx=e.x+.5,cy=e.y+.5,angle=e.l11?.angle??0
  const minimum=stairKinds.has(e.def.kind)?1.6:.6
  for(let r=minimum;r<=radius+.001;r+=.1)for(let k=0;k<48;k++){
    const theta=angle-Math.PI/2+k*Math.PI/24,x=cx+r*Math.cos(theta),y=cy+r*Math.sin(theta)
    if(e.l11&&(x-cx)*Math.sin(angle)-(y-cy)*Math.cos(angle)<.55)continue // approach side of the door/core
    if(x<1||y<1||x>=m.w-1||y>=m.h-1)continue
    const z=floorHeight(m,x,y,band)
    if(!Number.isFinite(z)||band===0&&z< -1||e.l11&&e.z!==undefined&&Math.abs(z-e.z)>1)continue
    let supported=true
    for(const [dx,dy]of [[0,0],[-.4,-.4],[.4,-.4],[-.4,.4],[.4,.4]]){
      const i=Math.floor(y+dy)*m.w+Math.floor(x+dx),height=floorHeight(m,x+dx,y+dy,band)
      if(m.elev[i]===4||m.liquid[i]===1||(m.stair[i]&7)!==0||Math.abs(height-z)>.16){supported=false;break}
    }
    if(!supported||!canOccupy(m,x,y,PLAYER_RADIUS+.04,{z:z+.02,band,crouch:false}))continue
    return {x,y,z:z+.02,floor:band}
  }
  return null
}

function publishExit(eng:Engine,e:ExitInstance){
  const m=eng.map!,inf=m.inf;e.discovered=true;m.exits.push(e)
  if(inf){inf.chunks.get(`${Math.floor((e.x+.5+inf.ox)/32)},${Math.floor((e.y+.5+inf.oy)/32)}`)?.exits.push(e);inf.redo=(inf.redo??0)+1}
  eng.mapRev++
  return result(true,`已在附近生成「${e.def.name}」：${(e.x+.5+(inf?.ox??0)).toFixed(1)}, ${(e.y+.5+(inf?.oy??0)).toFixed(1)} · ${(e.floor??0)+1}F。`)
}
function publishBuilding(eng:Engine,b:L11Building){
  const m=eng.map!,inf=m.inf!,previous=m.structures.find(s=>s.l11?.id===b.id);if(!previous)return
  const next={...previous,l11:b}
  // Replace identities to invalidate the physics index and detailed collider cache.
  m.structures=m.structures.map(s=>s===previous?next:s);inf.cityInstances?.set(b.id,next)
  for(const c of inf.chunks.values()){
    c.structures=c.structures.map(s=>s.l11?.id===b.id?next:s)
    if(c.l11)c.l11={...c.l11,buildings:c.l11.buildings.map(q=>q.id===b.id?b:q)}
  }
}
function citySummon(eng:Engine,def:ExitDef):DevExitResult{
  const m=eng.map!,inf=m.inf!,p=eng.player,wx=p.x+inf.ox,wy=p.y+inf.oy
  const local=(e:ExitInstance)=>({...e,x:e.x-inf.ox,y:e.y-inf.oy})
  if(roadKinds.has(def.kind)){
    const signs=m.exits.filter(e=>roadKinds.has(e.def.kind)).map(e=>({x:e.x+.5+inf.ox,y:e.y+.5+inf.oy}))
    for(const e of L11_ROAD_EXITS)if(!signs.some(s=>s.x===e.x+.5&&s.y===e.y+.5))signs.push({x:e.x+.5,y:e.y+.5})
    const blockAt=(x:number,y:number)=>{
      const plan=l11CityPlan(inf.seed,Math.floor((x-16)/1024),Math.floor((y-16)/1024))
      return plan.blocks.reduce<{id:string;d:number}>((best,b)=>{
        const d=inPolygon(x,y,b.polygon)?0:Math.min(...b.polygon[0].slice(1).map((v,i)=>segmentDistance(x,y,b.polygon[0][i],v)))
        return d<best.d?{id:b.id,d}:best
      },{id:plan.id,d:Infinity}).id
    }
    const counts=new Map<string,number>();for(const s of signs){const id=blockAt(s.x,s.y);counts.set(id,(counts.get(id)??0)+1)}
    for(let r=2;r<=24;r+=1)for(let k=0;k<24;k++){
      const angle=p.facing+k*Math.PI/12,x=wx+Math.cos(angle)*r,y=wy+Math.sin(angle)*r
      if(signs.some(s=>Math.hypot(x-s.x,y-s.y)<L11_EXIT_SIGN_SPACING)||(counts.get(blockAt(x,y))??0)>=2)continue
      const data=inf.chunks.get(`${Math.floor(x/32)},${Math.floor(y/32)}`)?.l11;if(!data)continue
      if(l11SurfaceAt(inf.seed,x,y,undefined,data).kind!=='sidewalk')continue
      const e=local({def,x:x-.5,y:y-.5,discovered:true,floor:0}),z=floorHeight(m,e.x+.5,e.y+.5,0)
      if(!canOccupy(m,e.x+.5,e.y+.5,.7,{z:z+.02,band:0})||!devExitSafeSpot(m,e,2))continue
      return publishExit(eng,e)
    }
    return result(false,'附近 24 米内没有可放置路牌的人行道空地，或与现有出口不足 90 米／同街区已有两处路牌。')
  }
  const candidates:{b:L11Building;e:ExitInstance;changed:boolean}[]=[],seen=new Set<string>()
  let occupied=false
  for(const s of m.structures){
    const old=s.l11;if(!old||seen.has(old.id))continue;seen.add(old.id)
    if(Math.hypot(Math.max(old.x-wx,0,wx-old.x-old.w),Math.max(old.y-wy,0,wy-old.y-old.h))>36)continue
    let b=old
    if(!b.exit&&def.kind==='l11officedoor'){
      const exit=l11OfficeExit(b,inf.seed);if(!exit)continue
      // A developer-placed ordinary office door follows the same sparse host policy.
      if(m.exits.some(e=>e.l11&&Math.hypot(e.x+.5+inf.ox-b.ox,e.y+.5+inf.oy-b.oy)<L11_EXIT_BUILDING_SPACING))continue
      b={...b,exit}
    }
    const source=l11BuildingExitInstance(b,def);if(!source)continue
    const e=local(source)
    if(exitDistance(e,p.x,p.y,p.z)>36)continue
    if(m.exits.some(q=>q.l11?.id===e.l11!.id)){occupied=true;continue}
    if(!devExitSafeSpot(m,e,3))continue
    candidates.push({b,e,changed:b!==old})
  }
  candidates.sort((a,b)=>exitDistance(a.e,p.x,p.y,p.z)-exitDistance(b.e,p.x,p.y,p.z))
  const choice=candidates[0]
  if(choice){if(choice.changed)publishBuilding(eng,choice.b);return publishExit(eng,choice.e)}
  if(occupied)return result(false,'附近符合条件的位置已有对应出口。召唤不会移动玩家；需要前往时请切换“传送到出口”。')
  const need:Record<string,string>={basebeta:'公共档案馆的专用门',l11unfinisheddoor:'封闭的未完工混凝土楼门',l11liftshaft:'有内部空间的未完工楼现有电梯井',l11brickdoor:'铁栅窗砖楼的木门',l11officedoor:'可进入多层办公楼的上层办公间门（且与其他出口建筑保持间距）'}
  return result(false,`附近 36 米内没有可用的${need[def.kind]??'建筑宿主'}，或门前没有安全空间。请靠近相应建筑后召唤。`)
}

export function summonDevExit(eng:Engine,kind:string,destination?:ExitDef['dest']):DevExitResult{
  const m=eng.map,def=eng.levelDef.exits.find(e=>e.kind===kind&&(destination===undefined||e.dest===destination))
  if(!eng.devEnabled||!m||!def)return result(false,'本层没有该出口，或开发者模式未开启。')
  if(eng.transition)return result(false,'层级切换中，请等待抵达后再操作。')
  if(eng.levelDef.id===11&&m.inf)return citySummon(eng,def)
  const p=eng.player,band=p.floor as FloorBand
  if(m.inf?.l0&&kind==='flickerdoor'){
    const inf=m.inf,walls=m.structures.filter(s=>s.data?.l0Wall).map(s=>({x:s.x,y:s.y,w:s.w,h:s.h,bottom:Number(s.data?.bottom),top:Number(s.data?.top)}))
    const candidates=[]
    for(let y=p.y-8;y<=p.y+8;y+=.5)for(let x=p.x-8;x<=p.x+8;x+=.5){
      const face=l0WallSurface(walls,x,y);if(!face)continue
      const nx=Math.sin(face.yaw),ny=Math.cos(face.yaw),px=face.x+nx*.7,py=face.y+ny*.7,d=Math.hypot(px-p.x,py-p.y)
      if(d<1.6||d>8||m.exits.some(e=>Math.hypot(e.x+.5-px,e.y+.5-py)<3))continue
      const c=inf.chunks.get(`${Math.floor((px+inf.ox)/32)},${Math.floor((py+inf.oy)/32)}`)
      if(!c?.l0||c.l0.region==='red'||c.l0.region==='manila')continue
      const e:ExitInstance={def,x:px-.5,y:py-.5,floor:0,z:0,discovered:true}
      if(!canOccupy(m,px,py,PLAYER_RADIUS+.04,{z:.02,band:0})||floorHeight(m,px,py,0)<-.2)continue
      candidates.push({e,face,nx,ny,d})
    }
    candidates.sort((a,b)=>a.d-b.d);const best=candidates.find(q=>devExitSafeSpot(m,q.e,1.5))
    if(!best)return result(false,'附近 8 米内没有可放置出口的完整墙面及安全通道。')
    const wx=best.face.x+inf.ox,wy=best.face.y+inf.oy
    for(const c of inf.chunks.values())if(c.l0&&wx>=c.cx*32-1&&wx<=c.cx*32+33&&wy>=c.cy*32-1&&wy<=c.cy*32+33)c.l0={...c.l0,flickers:[...(c.l0.flickers??[]),{x:wx,y:wy,nx:best.nx,ny:best.ny,phase:0}]}
    return publishExit(eng,best.e)
  }
  const at=(x:number,y:number)=>x>=0&&y>=0&&x<m.w&&y<m.h&&walkableAt(m,x,y,band)
  const clear=(x:number,y:number)=>at(x,y)&&m.liquid[y*m.w+x]!==1&&m.elev[y*m.w+x]!==4&&!(m.stair[y*m.w+x]&7)&&canOccupy(m,x+.5,y+.5,.45,{z:floorHeight(m,x+.5,y+.5,band)+.02,band})
  // These exits belong to a specific environmental host. Recover that host's
  // original placement/height; never put a sea cave or ceiling vent on dry floor.
  if(['l7cave','notexit','littledoor','lakeswim','l8vent'].includes(kind)){
    if(m.inf){
      const inf=m.inf,wx=p.x+inf.ox,wy=p.y+inf.oy,impl=infiniteImplFor(eng.levelDef.id),candidates:ExitInstance[]=[]
      for(const c of inf.chunks.values()){
        if(Math.hypot(Math.max(c.cx*32-wx,0,wx-c.cx*32-32),Math.max(c.cy*32-wy,0,wy-c.cy*32-32))>24)continue
        for(const e of impl.genRaw(eng.levelDef,inf.seed,c.cx,c.cy).exits){
          if(!exitMatches(e,kind,destination)||Math.hypot(e.x+.5-wx,e.y+.5-wy)>24)continue
          const local={...e,x:e.x-inf.ox,y:e.y-inf.oy}
          if(!m.exits.some(q=>exitMatches(q,kind,destination)&&Math.hypot(q.x-local.x,q.y-local.y)<1))candidates.push(local)
        }
      }
      candidates.sort((a,b)=>exitDistance(a,p.x,p.y,p.z)-exitDistance(b,p.x,p.y,p.z))
      if(candidates[0])return publishExit(eng,candidates[0])
    }
    return result(false,'附近 24 米内没有尚未占用的深水／洞顶出口宿主。请靠近对应环境后召唤，或切换“传送到出口”。')
  }
  const candidates:{x:number;y:number;score:number;wall?:number[]}[]=[]
  for(let y=Math.floor(p.y)-8;y<=Math.floor(p.y)+8;y++)for(let x=Math.floor(p.x)-8;x<=Math.floor(p.x)+8;x++){
    const d=Math.hypot(x+.5-p.x,y+.5-p.y);if(d<2||d>8||!clear(x,y))continue
    if(m.exits.some(e=>(e.floor??0)===band&&Math.hypot(e.x-x,e.y-y)<3))continue
    const walls=[[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy])=>!at(x+dx,y+dy))
    if(!roadKinds.has(kind)&&kind!=='trapdoor'&&!walls.length)continue
    const wall=walls.find(([dx,dy])=>[1,2,3,4].every(k=>clear(x-dx*k,y-dy*k)))
    if(stairKinds.has(kind)&&(!wall||band!==0))continue
    if(roadKinds.has(kind)&&m.outdoor[y*m.w+x]!==1)continue
    const angle=Math.atan2(y+.5-p.y,x+.5-p.x)-p.facing
    candidates.push({x,y,wall,score:d+Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)))})
  }
  candidates.sort((a,b)=>a.score-b.score)
  const best=candidates[0];if(!best)return result(false,'附近没有符合条件的安全空地：门需邻墙，楼梯需连续四格通道，路牌需室外道路。')
  const e:ExitInstance={def,x:best.x,y:best.y,floor:band,z:floorHeight(m,best.x+.5,best.y+.5,band),discovered:true}
  if((kind==='graystairs'||kind==='oldstairs')&&best.wall){
    const [dx,dy]=best.wall
    for(let k=1;k<=3;k++){
      const x=best.x-dx*k,y=best.y-dy*k;m.elev[y*m.w+x]=4
      if(m.inf){const wx=x+m.inf.ox,wy=y+m.inf.oy,c=m.inf.chunks.get(`${Math.floor(wx/32)},${Math.floor(wy/32)}`);if(c)c.elev[(wy-c.cy*32)*32+wx-c.cx*32]=4}
    }
  }
  return publishExit(eng,e)
}

export async function teleportDevExit(eng:Engine,kind:string,signal?:AbortSignal,destination?:ExitDef['dest'],progress?:(message:string)=>void):Promise<DevExitResult>{
  const m=eng.map;if(!eng.devEnabled||!m||eng.transition)return result(false,'当前无法传送：请开启开发者模式并等待场景就绪。')
  const inf=m.inf,level=eng.levelDef.id,wx=eng.player.x+(inf?.ox??0),wy=eng.player.y+(inf?.oy??0)
  let target:ExitInstance|null=null
  let prepared:ReadonlyMap<string,GenChunk>|undefined
  if(inf){
    const ready=await prepareDevExit(eng,{def:eng.levelDef,seed:inf.seed,kind,destination,x:wx,y:wy,z:eng.player.z,state:inf.l0,plague:inf.plague,live:[...inf.chunks.values()].map(c=>({cx:c.cx,cy:c.cy,exits:c.exits.map(e=>({...e,x:e.x+inf.ox,y:e.y+inf.oy}))}))},signal,progress)
    const found=ready.found;prepared=ready.chunks
    if(!found.complete)return result(false,`已检查 ${found.searched} 个区域，尚未确认最近的对应出口；位置未改变。可靠近目标区域后重试。`)
    target=found.exit
  }else target=m.exits.filter(e=>exitMatches(e,kind,destination)).sort((a,b)=>exitDistance(a,wx,wy,eng.player.z)-exitDistance(b,wx,wy,eng.player.z))[0]??null
  if(signal?.aborted||eng.map!==m||eng.levelDef.id!==level||eng.transition)return result(false,'已取消：场景已改变。')
  if(!target)return result(false,'没有找到对应出口，位置未改变。')
  const confinement=inf?.l0?redZonesNear(inf.seed,Math.floor(wx/32),Math.floor(wy/32)).find(z=>insideRedZone(z,wx,wy)&&inf.l0?.redProgress?.[z.id]?.closed.length===z.gates.length):undefined
  if(confinement&&!insideRedZone(confinement,target.x+.5,target.y+.5,.4))return result(false,'红室已封闭，出口传送只能在围墙内进行。')
  const snapshot=structuredClone(m),explored=eng.explored.slice(),previous={...eng.player}
  const transient={fakes:structuredClone(eng.fakes),particles:structuredClone(eng.particles),projectiles:structuredClone(eng.projectiles),npcs:eng.npcs,searching:eng.searching,lootPanel:eng.lootPanel,interactTarget:eng.interactTarget,ride:eng.ride,climb:eng.climb,porchDrop:eng.porchDrop,bonusExit:eng.bonusExit}
  try{
    Object.assign(eng.player,{x:target.x+.5-(inf?.ox??0),y:target.y+.5-(inf?.oy??0),floor:target.floor??0})
    if(inf)eng.updateInfiniteWindow(prepared)
    const e=m.exits.find(e=>exitMatches(e,kind,destination)&&Math.hypot(e.x+(inf?.ox??0)-target!.x,e.y+(inf?.oy??0)-target!.y)<.1&&(e.floor??0)===(target!.floor??0))
    const spot=e&&devExitSafeSpot(m,e)
    if(e&&spot&&(!confinement||insideRedZone(confinement,spot.x+inf!.ox,spot.y+inf!.oy,.4))){
      Object.assign(eng.player,spot,{vz:0,crouching:false});eng.ride=null;eng.climb=null;eng.porchDrop=null;eng.searching=null;eng.lootPanel=null;eng.interactTarget=null
      e.discovered=true;look.yaw=Math.atan2(-(e.x+.5-spot.x),-(e.y+.5-spot.y));look.pitch=0
      eng.player.facing=Math.atan2(e.y+.5-spot.y,e.x+.5-spot.x);eng.moveIt.acc=0;eng.onStairs=false
      return result(true,`已传送到最近的「${e.def.name}」旁安全空地，距出口 ${Math.hypot(spot.x-e.x-.5,spot.y-e.y-.5).toFixed(1)} 米 · ${spot.floor<0?'B1':`${spot.floor+1}F`}。`)
    }
  }catch{/* An unreachable or stale destination must not strand the player. */}
  eng.map=snapshot;eng.mapRev++;eng.explored=explored;Object.assign(eng,transient);Object.assign(eng.player,previous)
  return result(false,'最近出口附近 6 米内没有安全落点，已保留原位置。')
}

export async function devOperateExit(eng:Engine,kind:string,mode:'summon'|'teleport',signal?:AbortSignal,destination?:ExitDef['dest'],progress?:(message:string)=>void):Promise<DevExitResult>{
  if(signal?.aborted)return result(false,'已取消。')
  try{
    const out=mode==='summon'?summonDevExit(eng,kind,destination):await teleportDevExit(eng,kind,signal,destination,progress)
    if(!signal?.aborted)eng.msg(`[DEV] ${out.message}`,'system')
    return out
  }catch(error){
    if(signal?.aborted)return result(false,'已取消，位置未改变。')
    const out=result(false,error instanceof Error?error.message:'出口操作失败，位置未改变。');eng.msg(`[DEV] ${out.message}`,'system');return out
  }
}
