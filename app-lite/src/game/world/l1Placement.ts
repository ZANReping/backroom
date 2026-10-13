import type {GenChunk} from './infiniteRegistry'
import type {L1ArchitectureData} from './l1BuildingTypes'
import {l1PuddleContains} from './l1Puddles'
import {l1RoomDressing,l1HallDressing} from './l1Dressing'
import {l1PathRoom} from './l1Spatial'

/** The legacy content manifest only allocates stable object identities. It never
 * edits v4 architecture. Content is fitted to the already completed building. */
export function placeL1Content(c:GenChunk,a:L1ArchitectureData):GenChunk {
 const ox=a.cx*32,oz=a.cy*32
 const doors=c.structures.filter(s=>s.kind==='inkdoor')
 c.l1=a;c.tiles=Uint8Array.from(a.floor,n=>n?1:2);c.wet.fill(0)
 c.structures=c.structures.filter(s=>!s.data?.l1Column&&!s.data?.l1PathDoor&&!['pipes','cables','vaultcol','lightgrid','hanglight'].includes(s.kind))
 const dressing=l1RoomDressing(a.seed,a.cx,a.cy),room=dressing.length?l1PathRoom(a.seed,a.cx,a.cy):null
 if(dressing.length)c.structures=[...dressing,...c.structures.filter(s=>!['pathchair','airunit','caution','paintcan'].includes(String(s.data?.l1Prop)))]
 const hall=l1HallDressing(a)
 if(hall.length)c.structures=[...hall,...c.structures.filter(s=>!['foldingtable','seat','panel','extinguisher'].includes(String(s.data?.l1Prop)))]
 const architecture=a.boxes.filter(b=>b.solid)
 const occupied:{x:number;y:number;w:number;h:number}[]=[]
 const valid=(x:number,z:number,w:number,h:number,spacing=.08)=>{
  for(let dz=Math.floor(z-spacing);dz<=Math.floor(z+h+spacing);dz++)for(let dx=Math.floor(x-spacing);dx<=Math.floor(x+w+spacing);dx++)if(dx<ox||dx>=ox+32||dz<oz||dz>=oz+32||!a.floor[(dz-oz)*32+dx-ox])return false
  return !architecture.some(b=>x+w+spacing>b.min[0]&&x-spacing<b.max[0]&&z+h+spacing>b.min[2]&&z-spacing<b.max[2])&&!occupied.some(b=>x+w+spacing>b.x&&x-spacing<b.x+b.w&&z+h+spacing>b.y&&z-spacing<b.y+b.h)
 }
 const fit=(x:number,z:number,w:number,h:number,outsideRoom=false)=>{
  // Keep loose supplies outside furnished rooms and their immediate doorway
  // approach. This applies to procedural rooms too, never to player drops.
  const legal=(px:number,pz:number)=>valid(px,pz,w,h)&&(!outsideRoom||!room||![room,...(room.alcove?[room.alcove]:[])].some(r=>px+w>r.x0-1.75&&px<r.x1+1.75&&pz+h>r.y0-1.75&&pz<r.y1+1.75))
  if(legal(x,z))return{x,y:z}
  for(let r=0;r<32;r++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
   if(Math.max(Math.abs(dx),Math.abs(dz))!==r)continue
   // Both alignments matter: a 1m prop needs a half-cell offset to fit a 2m
   // corridor with clearance. Integer-only candidates incorrectly rejected it.
   for(const ax of [0,.5])for(const az of [0,.5]){
    const px=Math.floor(x)+dx+.5-w/2+ax,pz=Math.floor(z)+dz+.5-h/2+az
    if(legal(px,pz))return{x:px,y:pz}
   }
  }
  // Failing a migration is safer than deleting or duplicating an item.
  throw new Error(`L1 v4: no legal position for ${w}x${h} content in ${a.cx},${a.cy}`)
 }
 for(const s of c.structures){const p=fit(s.x,s.y,s.w,s.h);s.x=p.x;s.y=p.y;if(s.solid)occupied.push(s)}
 for(const list of [c.items,c.exits,c.entities,c.npcs??[]])for(const p of list){const q=fit(p.x-.17,p.y-.17,.34,.34,list===c.items);p.x=q.x+.17;p.y=q.y+.17}
 for(const b of architecture)c.structures.push({kind:'pillar',x:b.min[0],y:b.min[2],w:b.max[0]-b.min[0],h:b.max[2]-b.min[2],solid:true,data:{l1Static:1,l1Round:b.shape==='round'?1:0,...(['wall','brick'].includes(b.surface)?{}:{l1Column:b.style}),bottom:b.min[1],top:b.max[1]}})
 for(let i=0;i<a.openings.length;i++){
  const d=a.openings[i]
  const old=doors[i]
  c.structures.push({kind:'inkdoor',x:d.x,y:d.z,w:d.w,h:d.d,solid:true,data:{...old?.data,l1PathDoor:1,l1PortalId:d.id,rot:d.w>d.d?1:0,open:0,sid:old?.data?.sid??(((a.cx&255)<<24)|((a.cy&255)<<16)|((224+i)<<4)|1)}})
 }
 c.lights=a.emitters.map((e,i)=>({x:e.position[0],y:e.position[2],fixZ:e.position[1]+.2,color:'#'+e.color.map(v=>Math.round(Math.sqrt(v)*255).toString(16).padStart(2,'0')).join(''),flickerSeed:i*.173,on:e.power>0,gen:1,noFix:1,intensityMul:e.power,r:e.range/2.6,...(e.kind==='emergency'?{keep:1}:{}),...(e.kind==='sky'?{natural:1}:{})}))
 for(const p of a.puddles)for(let z=0;z<32;z++)for(let x=0;x<32;x++)if(a.floor[z*32+x]&&l1PuddleContains(p,ox+x+.5,oz+z+.5))c.wet[z*32+x]=1
 return c
}
