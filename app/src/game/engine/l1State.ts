import { stableAt } from './career'
import type { Engine } from '../engine'
import { restitch } from '../world/infinite'
import { newL1Dynamics,rememberL1Container,restoreL1Container,l1ContainerKey,l1CrateHidden,type L1Dynamics } from '../world/l1Dynamics'
import { RemotePlayerViews } from '../renderer/remotePlayers'
export interface L1WorldSave {version:1;seed:number;dynamics:L1Dynamics;taken:number[]}
export function captureL1(eng:Engine):L1WorldSave|undefined {
  const inf=eng.map?.inf
  if(eng.player.level!==1||!inf)return eng.l1World
  const state=inf.l1Dynamics??=newL1Dynamics()
  for(const c of inf.chunks.values())for(const s of c.structures)rememberL1Container(state,c.cx,c.cy,s)
  return {version:1,seed:inf.seed,dynamics:structuredClone(state),taken:[...inf.taken]}
}
export function restoreL1(eng:Engine){
  const inf=eng.map?.inf,saved=eng.l1World;if(!inf||!saved||saved.seed!==inf.seed)return
  inf.l1Dynamics=structuredClone(saved.dynamics);inf.taken=new Set(saved.taken)
  for(const c of inf.chunks.values())for(const s of c.structures)restoreL1Container(inf.l1Dynamics,inf.seed,c.cx,c.cy,s,inf.ox,inf.oy)
  restitch(eng.map!);inf.redo=(inf.redo??0)+1
}
/** Housekeeping changes only after a full flicker. Nearby/observed containers remain stable. */
export function flickerL1Crates(eng:Engine){
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

