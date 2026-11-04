import type { Engine } from '../engine'
import type { FloorBand } from '../core/types'
import { OUTPOSTS, isLandmarkStruct } from '../content/outposts'
import { levelDefOf } from '../levels'
import { canOccupy, PLAYER_RADIUS } from '../core/player'
import { bandOfPlayerZ, ceilingHeightAt, floorHeight, structStandTopAt } from '../world/mapgen'
import { look, WALL_H } from '../renderer/shared'
import { sittingSafePosition } from './seating'
import { resetMoveVelocity } from './moveTuning'

/** Optional additions retain v1 career/save compatibility with the original x/y/yaw anchor. */
export interface OutpostReturnAnchor {
  level: number
  x: number
  y: number
  yaw: number
  mapSeed?: number
  z?: number
  floor?: FloorBand
  pitch?: number
  hotelFloor?: number
  outpost?: number
  previous?: OutpostReturnAnchor
}
export interface OutpostReturnContext { level: number; outpostId?: string; anchor?: OutpostReturnAnchor }
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const validLevel = (n: unknown): n is number => finite(n) && !!levelDefOf(n)
const validBand = (n: unknown): n is FloorBand => n === -1 || n === 0 || n === 1 || n === 2
function copyAnchor(a: OutpostReturnAnchor | undefined, depth = 0): OutpostReturnAnchor | undefined {
  if (!a || !validLevel(a.level) || !finite(a.x) || !finite(a.y) || !finite(a.yaw)) return undefined
  return { level:a.level,x:a.x,y:a.y,yaw:a.yaw,mapSeed:finite(a.mapSeed)?a.mapSeed:undefined,
    z:finite(a.z)?a.z:undefined,floor:validBand(a.floor)?a.floor:undefined,pitch:finite(a.pitch)?a.pitch:undefined,
    hotelFloor:finite(a.hotelFloor)?a.hotelFloor:undefined,
    outpost:validLevel(a.outpost)?a.outpost:undefined,previous:depth<8?copyAnchor(a.previous,depth+1):undefined }
}
/** All entry paths record the current map before the transition replaces it. Coordinates are absolute. */
export function rememberOutpostEntry(eng: Engine, outpost: number): void {
  const p=eng.player,m=eng.map!,safe=sittingSafePosition(eng),point=safe??p,old=copyAnchor(eng.career.returnAnchor)
  const nested=eng.levelDef.gen==='outpost' && old && (old.outpost===p.level || old.outpost===undefined&&eng.outpostReturn===old.level)
  eng.career.returnAnchor={level:p.level,x:point.x+(m.inf?.ox??0),y:point.y+(m.inf?.oy??0),z:point.z,
    floor:bandOfPlayerZ(m,point.z,point.x,point.y),yaw:look.yaw,pitch:look.pitch,mapSeed:eng.mapSeed,outpost,
    hotelFloor:p.level===5?eng.hotel.floor:undefined,previous:nested?old:undefined}
  eng.outpostReturn=p.level
  eng.career.returning=false
}
/** Older saves may have only the origin level; use the registered parent instead of an unrelated level. */
export function outpostBackLevel(eng: Engine): number {
  const a=copyAnchor(eng.career.returnAnchor),known=Object.values(OUTPOSTS).find(o=>o.levelId===eng.player.level)
  return [eng.outpostReturn,a?.outpost===undefined||a.outpost===eng.player.level?a?.level:undefined,known?.parent,eng.player.level>=117&&eng.player.level<=119?5:1]
    .find((id):id is number=>validLevel(id)&&id!==eng.player.level)??1
}
/** Capture this before loadLevel changes player.level; no return token affects ordinary level travel. */
export function pendingOutpostReturn(eng: Engine, destination: number): OutpostReturnContext | undefined {
  if(!eng.career.returning||eng.levelDef.gen!=='outpost'||outpostBackLevel(eng)!==destination)return undefined
  const raw=copyAnchor(eng.career.returnAnchor)
  const anchor=raw?.level===destination&&(raw.outpost===undefined||raw.outpost===eng.player.level)?raw:undefined
  return {level:destination,outpostId:Object.values(OUTPOSTS).find(o=>o.levelId===eng.player.level)?.id,anchor}
}
/** Shared by worker preparation and the eventual map load, so both build the source map. */
export function outpostReturnSeed(eng: Engine, destination: number): number | undefined {
  return pendingOutpostReturn(eng,destination)?.anchor?.mapSeed
}

export function placeOutpostReturn(eng: Engine, back: OutpostReturnContext): boolean {
  const m=eng.map!,p=eng.player,a=back.anchor
  const fallback={x:p.x+(m.inf?.ox??0),y:p.y+(m.inf?.oy??0),z:p.z,floor:p.floor}
  const world=a??{x:m.spawn.x+.5+(m.inf?.ox??0),y:m.spawn.y+.5+(m.inf?.oy??0)}
  p.x=world.x-(m.inf?.ox??0);p.y=world.y-(m.inf?.oy??0)
  if(m.inf)eng.updateInfiniteWindow()
  let band=a?.floor??0
  const cx=p.x,cy=p.y
  const candidate=(x:number,y:number,reference?:number)=>{
    if(x<1||y<1||x>=m.w-1||y>=m.h-1)return undefined
    const i=Math.floor(y)*m.w+Math.floor(x)
    if(m.liquid[i]===1||m.elev[i]===4||(m.stair[i]&7)!==0)return undefined
    const ground=floorHeight(m,x,y,band,reference)
    if(!finite(ground))return undefined
    const support=structStandTopAt(m,x,y,finite(reference)?reference:ground,band,PLAYER_RADIUS)
    const z=Math.max(ground,finite(support)&&(!finite(reference)||Math.abs(support-reference)<.18)?support:ground)
    if(finite(reference)&&Math.abs(z-reference)>1.0)return undefined
    if(!canOccupy(m,x,y,PLAYER_RADIUS,{z,band,crouch:false}))return undefined
    if(ceilingHeightAt(m,x,y,WALL_H[eng.levelDef.gen]??3,band)-z<1.68)return undefined
    return {x,y,z}
  }
  const near=(x:number,y:number,reference?:number,maxRadius=3)=>{
    const exact=candidate(x,y,reference);if(exact)return exact
    for(let radius=.25;radius<=maxRadius;radius+=.25)for(let k=0;k<24;k++){
      const angle=k*Math.PI/12,spot=candidate(x+Math.sin(angle)*radius,y+Math.cos(angle)*radius,reference)
      if(spot)return spot
    }
    return undefined
  }
  // Complete anchors restore the exact checked approach. Legacy anchors prefer a matching real marker
  // if their missing map seed means their old coordinates no longer describe that entrance.
  const markers=m.structures.filter(s=>isLandmarkStruct(s)&&s.data?.outpost===back.outpostId&&(s.floor??0)===band)
    .sort((s,t)=>Math.hypot(s.x+s.w/2-cx,s.y+s.h/2-cy)-Math.hypot(t.x+t.w/2-cx,t.y+t.h/2-cy))
  let spot=a?.mapSeed!==undefined?near(cx,cy,a.z):undefined
  if(!spot)for(const s of markers){
    if(a?.mapSeed!==undefined&&Math.hypot(s.x+s.w/2-cx,s.y+s.h/2-cy)>5)continue
    spot=near(s.x+s.w/2,s.y+s.h/2);if(spot)break
  }
  spot??=near(cx,cy,a?.z)
  const atEntrance=!!spot
  if(!spot){
    // A removed/invalid legacy anchor must never leave the player inside a solid.
    p.x=fallback.x-(m.inf?.ox??0);p.y=fallback.y-(m.inf?.oy??0)
    if(m.inf)eng.updateInfiniteWindow()
    band=fallback.floor
    spot=near(p.x,p.y,undefined,16)
    if(!spot)Object.assign(p,{z:fallback.z,floor:band,vz:0,crouching:false})
    eng.msg('原入口附近暂时无法站立，已返回本层的默认入口。','system')
  }
  if(spot){
    Object.assign(p,spot,{floor:band,vz:0,crouching:false})
    if(a){look.yaw=a.yaw;look.pitch=Math.max(-1.5,Math.min(1.5,a.pitch??0));p.facing=Math.atan2(-Math.cos(a.yaw),-Math.sin(a.yaw))}
  }
  resetMoveVelocity(eng.mv);eng.moveIt.acc=0;eng.slipVx=eng.slipVy=0;eng.stepAcc=0
  eng.career.returning=false
  const previous=a?.previous
  eng.career.returnAnchor=previous
  eng.outpostReturn=previous?.level??null
  return atEntrance
}
