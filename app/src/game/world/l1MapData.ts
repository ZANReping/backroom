import type {L1ArchitectureData} from './l1BuildingTypes'
import {l1PuddleContains} from './l1Puddles'

export interface L1MapRect{x:number;y:number;w:number;h:number;round?:boolean}
export interface L1MapDoor extends L1MapRect{id:string}
export interface L1MapGeometry{tiles:Uint8Array;regions:Uint8Array;walls:L1MapRect[];doors:L1MapDoor[];wet:Uint8Array}
const cache=new WeakMap<L1ArchitectureData,L1MapGeometry>()

/** Read the same immutable building as rendering/collision. No item, NPC or
 * entity generation and no Three.js objects are needed by a map preview. */
export function l1MapGeometry(data:L1ArchitectureData):L1MapGeometry{
 const old=cache.get(data);if(old)return old
 const walls=data.boxes.filter(b=>b.solid&&b.min[1]<1.75&&b.max[1]>.08).map(b=>({x:b.min[0],y:b.min[2],w:b.max[0]-b.min[0],h:b.max[2]-b.min[2],round:b.shape==='round'}))
 const wet=new Uint8Array(1024)
 for(let i=0;i<1024;i++)if(data.floor[i]){
  const x=data.cx*32+i%32+.5,y=data.cy*32+(i>>5)+.5
  if(data.puddles.some(p=>l1PuddleContains(p,x,y)))wet[i]=1
 }
 const value={tiles:Uint8Array.from(data.floor,n=>n?1:2),regions:data.styles,walls,doors:data.openings.filter(d=>d.door).map(d=>({id:d.id,x:d.x,y:d.z,w:d.w,h:d.d})),wet}
 cache.set(data,value);return value
}
