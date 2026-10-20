import type {GenChunk} from './infiniteRegistry'
import type {L1ArchitectureData} from './l1BuildingTypes'
import {l1PuddleContains} from './l1Puddles'
import {l1RoomDressing,l1HallDressing} from './l1Dressing'
import {l1PathRoom} from './l1Spatial'
import {l1PlanTile,l1PlanHash} from './l1Plan'
import {l1OutpostSites,l1OutpostSite} from './l1OutpostSites'
import {l1WallMounts} from './l1WallFixtures'

/** The legacy content manifest only allocates stable object identities. It never
 * edits v4 architecture. Content is fitted to the already completed building. */
export function placeL1Content(c:GenChunk,a:L1ArchitectureData):GenChunk {
 const ox=a.cx*32,oz=a.cy*32
 const doors=c.structures.filter(s=>s.kind==='inkdoor')
 c.l1=a;c.tiles=Uint8Array.from(a.floor,n=>n?1:2);c.wet.fill(0)
 c.structures=c.structures.filter(s=>!s.data?.l1Column&&!s.data?.l1PathDoor&&!['pipes','cables','vaultcol','lightgrid','hanglight'].includes(s.kind))
 // Retired untagged pillars are not new furniture. In mixed chunks these were
 // being fitted to arbitrary free cells beneath an unrelated gothic vault.
 c.structures=c.structures.filter(s=>s.kind!=='pillar'||!!s.data?.l1Prop)
 c.structures=c.structures.filter(s=>s.kind!=='landmark')
 for(const p of l1OutpostSites(a.seed,ox,oz,ox+32,oz+32))c.structures.push({kind:'landmark',x:p.x,y:p.z,w:1,h:1,solid:false,data:{outpost:p.outpost,l1Entrance:1,l1WallDir:p.dir,l1EntranceId:p.id}})
 // Legacy room furniture belonged to the retired chunk-room carver.
 c.structures=c.structures.filter(s=>!['desk','copier','officechair','bed','table','photo'].includes(s.kind))
 // 小径 mechanics (wiki): supplies are scarce in corridors, a little better in furnished rooms;
 // entities rarely roam there. Identities of the survivors are unchanged.
 const inPath=(x:number,z:number)=>l1PlanTile(a.seed,x,z).style==='maintenance'
 const inRoom=(x:number,z:number)=>!!l1PlanTile(a.seed,x,z).room
 const keep=(x:number,z:number,salt:number)=>!inPath(x,z)||l1PlanHash(a.seed,salt,Math.floor(x*4),Math.floor(z*4))<(inRoom(x,z)?.4:.1)
 c.structures=c.structures.filter(s=>!s.data?.loot||keep(s.x+s.w/2,s.y+s.h/2,0x7001))
 c.items=c.items.filter(i=>keep(i.x,i.y,0x7002))
 c.entities=c.entities.filter(e=>!inPath(e.x,e.y)||l1PlanHash(a.seed,0x7003,Math.floor(e.x*4),Math.floor(e.y*4))<.08)
 const dressing=l1RoomDressing(a.seed,a.cx,a.cy),room=dressing.length?l1PathRoom(a.seed,a.cx,a.cy):null
 if(dressing.length)c.structures=[...dressing,...c.structures.filter(s=>!['pathchair','airunit','caution','paintcan'].includes(String(s.data?.l1Prop)))]
 const hall=l1HallDressing(a)
 if(hall.length)c.structures=[...hall,...c.structures.filter(s=>!['foldingtable','seat','panel','extinguisher'].includes(String(s.data?.l1Prop)))]
 const architecture=a.boxes.filter(b=>b.solid)
 const occupied:{x:number;y:number;w:number;h:number}[]=[]
 if(a.exit)occupied.push({x:a.exit.x-.05,y:a.exit.z-.05,w:1.1,h:1.1})
 for(const s of c.structures)if(s.data?.l1Entrance)occupied.push({x:s.x-.48,y:s.y-.48,w:1.96,h:1.96})
 const valid=(x:number,z:number,w:number,h:number,spacing=.08)=>{
  for(let dz=Math.floor(z-spacing);dz<=Math.floor(z+h+spacing-1e-6);dz++)for(let dx=Math.floor(x-spacing);dx<=Math.floor(x+w+spacing-1e-6);dx++)if(dx<ox||dx>=ox+32||dz<oz||dz>=oz+32||!a.floor[(dz-oz)*32+dx-ox])return false
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
 const mounts=l1WallMounts(a),placed:typeof c.structures=[],wallProps=new Set(['vent','socket','graffiti','rebar','wallsign','photo'])
 for(const s of c.structures){
  if(s.data?.l1Waymark&&typeof s.data.targetX==='number'&&typeof s.data.targetY==='number'){
   const r=l1PlanTile(a.seed,s.data.targetX,s.data.targetY).region,p=r?l1OutpostSite(a.seed,r):undefined
   if(p){s.data.targetX=p.x+.5;s.data.targetY=p.z+.5}
  }
  if(s.data?.l1Entrance){placed.push(s);continue} // Validated globally, with new chunk ownership.
  if(wallProps.has(s.kind)&&!s.data?.flat){
   const p=mounts.filter(p=>valid(p.x,p.z,1,1,0)).sort((a,b)=>Math.hypot(a.x-s.x,a.z-s.y)-Math.hypot(b.x-s.x,b.z-s.y))[0]
   // A clear hall has no mounting surface. Omit optional dressing instead of
   // putting it on an invisible wall. Supplies and containers are never omitted.
   if(!p)continue
   s.x=p.x;s.y=p.z;s.data={...s.data,l1WallDir:p.dir};placed.push(s);continue
  }
  const p=fit(s.x,s.y,s.w,s.h);s.x=p.x;s.y=p.y
  placed.push(s)
  // A passable barber chair still occupies visual space. Reserve its armrests
  // and footplate while fitting the room table and remaining legacy content.
  if(s.kind==='barberchair')occupied.push({x:s.x-.15,y:s.y-.15,w:s.w+.3,h:s.h+.3})
  else if(s.solid)occupied.push(s)
 }
 c.structures=placed
 for(const list of [c.items,c.exits,c.entities,c.npcs??[]])for(const p of list){if(list===c.exits&&'l1' in p&&p.l1)continue;const q=fit(p.x-.17,p.y-.17,.34,.34,list===c.items);p.x=q.x+.17;p.y=q.y+.17}
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
