import type { Structure } from '../core/types'
import { l1Hash } from './l1Architecture'
export interface L1Dynamics {
  epoch:number
  hidden:Record<string,number>
  containers:Record<string,{looted?:boolean;data:NonNullable<Structure['data']>}>
}
export const newL1Dynamics=():L1Dynamics=>({epoch:0,hidden:{},containers:{}})
export const l1ContainerKey=(cx:number,cy:number,s:Structure)=>`${cx},${cy}:${s.data?.sid}`
export function l1CrateHidden(seed:number,epoch:number,wx:number,wy:number){return l1Hash(wx,wy,seed^(epoch===0?919:Math.imul(epoch,104729)))<.3?1:0}
export function restoreL1Container(state:L1Dynamics,seed:number,cx:number,cy:number,s:Structure,ox:number,oy:number){
  const key=l1ContainerKey(cx,cy,s),saved=state.containers[key]
  if(saved){s.looted=saved.looted;s.data={...s.data,...saved.data}}
  if(s.data?.l1Crate)s.data.l1Hidden=state.hidden[key]??l1CrateHidden(seed,state.epoch,s.x+ox,s.y+oy)
}
export function rememberL1Container(state:L1Dynamics,cx:number,cy:number,s:Structure){
  if(s.data?.sid===undefined||!(s.looted||s.data.searched||s.data.opened||Array.isArray(s.data.lootItems)))return
  const data={...s.data};delete data.l1Hidden
  state.containers[l1ContainerKey(cx,cy,s)]={looted:s.looted,data}
}
