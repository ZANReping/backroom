import { stableAt } from './career'
import type { Engine } from '../engine'
import { restitch } from '../world/infinite'
import { newL1Dynamics,rememberL1Container,restoreL1Container,l1ContainerKey,l1CrateHidden,type L1Dynamics } from '../world/l1Dynamics'
import { RemotePlayerViews } from '../renderer/remotePlayers'
import {mapSight} from '../world/mapSight'
import {L1_GENERATION_VERSION} from '../world/l1Spatial'
export interface L1WorldSave {version:1;generation?:number;migration?:{from:number;to:number;applied:true};seed:number;dynamics:L1Dynamics;taken:number[];runtime?:{blackout:number;warning:number;pending:number;plant:number;stage:number}}
export function captureL1(eng:Engine):L1WorldSave|undefined {
  const inf=eng.map?.inf
  if(eng.player.level!==1||!inf)return eng.l1World
  const state=inf.l1Dynamics??=newL1Dynamics()
  for(const c of inf.chunks.values())for(const s of c.structures)rememberL1Container(state,c.cx,c.cy,s)
  return {version:1,generation:L1_GENERATION_VERSION,migration:eng.l1World?.seed===inf.seed?eng.l1World.migration:undefined,seed:inf.seed,dynamics:structuredClone(state),taken:[...inf.taken],runtime:{blackout:eng.blackoutT,warning:eng.blackoutWarnT,pending:eng.blackoutPendingDur,plant:eng.plantK,stage:eng.plantStage}}
}
const observations=new WeakMap<Engine,{map:unknown;seen:Map<string,number>;scan:number}>()
/** Low-frequency single-player dynamics share the actual occluded map visibility. */
export function tickL1Dynamics(eng:Engine,dt:number){
 const inf=eng.map?.inf;if(eng.player.level!==1||!inf||eng.mpSession?.started)return
 const state=inf.l1Dynamics??=newL1Dynamics()
 let watch=observations.get(eng)
 if(!watch||watch.map!==eng.map){watch={map:eng.map,seen:new Map(),scan:0};observations.set(eng,watch)}
 watch.scan-=dt
 if(watch.scan<=0){
  watch.scan=.5;const visible=new Set(mapSight(eng).cells)
  for(const c of inf.chunks.values())for(const s of c.structures)if(s.data?.l1Crate){
   const key=l1ContainerKey(c.cx,c.cy,s),i=Math.floor(s.y+s.h/2)*eng.map!.w+Math.floor(s.x+s.w/2)
   if(!watch.seen.has(key)||visible.has(i)||Math.hypot(s.x-eng.player.x,s.y-eng.player.y)<12)watch.seen.set(key,eng.time)
  }
  if(watch.seen.size>4096){const live=new Set([...inf.chunks.values()].flatMap(c=>c.structures.filter(s=>s.data?.l1Crate).map(s=>l1ContainerKey(c.cx,c.cy,s))));for(const k of watch.seen.keys())if(!live.has(k))watch.seen.delete(k)}
 }
 if(!eng.blackoutT&&!eng.blackoutWarnT){
  state.powerWait=Math.max(0,(state.powerWait??(300+Math.random()*300))-dt)
  if(state.powerWait===0&&!eng.dev.phenOff.has('flicker')){eng.startBlackout(45+Math.random()*45);state.powerWait=300+Math.random()*300}
 }
 state.crateWait=(state.crateWait??30)-dt
 if(state.crateWait<=0){state.crateWait=30;if(!eng.blackoutT&&!eng.blackoutWarnT)shiftL1Crates(eng,false)}
}
function shiftL1Crates(eng:Engine,afterPower:boolean){
 const inf=eng.map?.inf,watch=observations.get(eng);if(!inf)return
 const state=inf.l1Dynamics??=newL1Dynamics(),visible=new Set(mapSight(eng).cells);let changed=0
 state.epoch++
 for(const c of inf.chunks.values())for(const s of c.structures){
  if(!s.data?.l1Crate)continue
  const key=l1ContainerKey(c.cx,c.cy,s),i=Math.floor(s.y+s.h/2)*eng.map!.w+Math.floor(s.x+s.w/2)
  const protectedBox=Math.hypot(s.x-eng.player.x,s.y-eng.player.y)<12||visible.has(i)||eng.searching?.sid===s.data.sid||
    !!s.data.playerStored||Array.isArray(s.data.lootItems)&&s.data.lootItems.length>0||stableAt(eng,s.x,s.y)||
    eng.time-(watch?.seen.get(key)??eng.time)<5
  rememberL1Container(state,c.cx,c.cy,s)
  const previous=Number(s.data.l1Hidden??0),next=protectedBox||(!afterPower&&changed>0)?previous:l1CrateHidden(inf.seed,state.epoch,s.x+inf.ox,s.y+inf.oy)
  state.hidden[key]=next;s.data.l1Hidden=next;if(next!==previous)changed++
 }
 // Visibility is local to each reserved crate root. Restitch updates collision
 // and interaction lists, but must not invalidate static terrain/lighting.
 if(changed)restitch(eng.map!)
}
export function restoreL1(eng:Engine){
  const inf=eng.map?.inf,saved=eng.l1World;if(!inf||!saved||saved.seed!==inf.seed)return
  inf.l1Dynamics=structuredClone(saved.dynamics);inf.taken=new Set(saved.taken)
  if(saved.runtime){
    const t=saved.runtime
    eng.blackoutT=Math.max(0,Math.min(90,Number(t.blackout)||0));eng.blackoutWarnT=Math.max(0,Math.min(4,Number(t.warning)||0));eng.blackoutPendingDur=Math.max(0,Math.min(90,Number(t.pending)||0))
    eng.plantK=Math.max(0,Math.min(1,Number(t.plant)||0));eng.plantStage=Math.max(0,Math.min(3,Number(t.stage)||0));inf.blackout=eng.blackoutT>0
  }
  for(const c of inf.chunks.values())for(const s of c.structures)restoreL1Container(inf.l1Dynamics,inf.seed,c.cx,c.cy,s,inf.ox,inf.oy)
  restitch(eng.map!);inf.redo=(inf.redo??0)+1
  if((saved.generation??1)<L1_GENERATION_VERSION){
    eng.l1World={...saved,generation:L1_GENERATION_VERSION,migration:{from:saved.generation??1,to:L1_GENERATION_VERSION,applied:true}}
    eng.msg('Level 1 建筑已迁移至新版；背包、搜刮与事件进度保留，被墙柱覆盖的位置将调整至附近通路。','lore')
  }
}
/** Housekeeping changes only after a full flicker. Nearby/observed containers remain stable. */
export function flickerL1Crates(eng:Engine){
  if(!eng.mpSession?.started){if(eng.player.level===1)shiftL1Crates(eng,true);return}
  const inf=eng.map?.inf;if(eng.player.level!==1||!inf||(eng.mpSession?.started&&!eng.mpSession.isHost))return
  const state=inf.l1Dynamics??=newL1Dynamics();state.epoch++;state.hidden={}
  const observers=[eng.player,...(eng.mpSession?.started?RemotePlayerViews.nearby(eng,eng.mpSession):[])]
  for(const c of inf.chunks.values())for(const s of c.structures){
    if(!s.data?.l1Crate)continue
    rememberL1Container(state,c.cx,c.cy,s)
    // Conservative 24m protection includes players looking at or interacting with the box.
    const protectedBox=stableAt(eng,s.x,s.y)||observers.some(p=>Math.hypot(p.x-s.x-.5,p.y-s.y-.5)<24)
    const hidden=protectedBox?Number(s.data.l1Hidden??0):l1CrateHidden(inf.seed,state.epoch,s.x+inf.ox,s.y+inf.oy)
    s.data.l1Hidden=hidden;state.hidden[l1ContainerKey(c.cx,c.cy,s)]=hidden
  }
  restitch(eng.map!);inf.redo=(inf.redo??0)+1
  eng.msg('闪烁结束后，远处几堆板条箱的位置似乎不同了。','lore')
}
export function syncL1Crates(eng:Engine,epoch:number,hidden:Record<string,number>){
  const inf=eng.map?.inf;if(eng.player.level!==1||!inf)return
  const state=inf.l1Dynamics??=newL1Dynamics()
  if(epoch<state.epoch||epoch===state.epoch&&JSON.stringify(hidden)===JSON.stringify(state.hidden))return
  state.epoch=epoch;state.hidden={...hidden}
  for(const c of inf.chunks.values())for(const s of c.structures)if(s.data?.l1Crate)s.data.l1Hidden=hidden[l1ContainerKey(c.cx,c.cy,s)]??l1CrateHidden(inf.seed,epoch,s.x+inf.ox,s.y+inf.oy)
  restitch(eng.map!);inf.redo=(inf.redo??0)+1
}

