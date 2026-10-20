import type {Structure} from '../core/types'
import {l1Noise,l1PathRoom,l1ReferenceAt} from './l1Spatial'
import {l1LayoutVariant} from './l1Layout'
import {l1PlanRooms} from './l1Plan'
import type {L1ArchitectureData} from './l1BuildingTypes'

/** Assembly is placed after the building is complete, so legacy loot clearance
 * cannot silently delete the table. The same assembly fits ordinary hall walls. */
export function l1HallDressing(a:L1ArchitectureData):Structure[]{
 const {seed,cx,cy}=a,ref=l1ReferenceAt(seed,cx*32+16,cy*32+16)
 if(ref?(ref.id!=='parking-props'||cx!==Math.floor(ref.centerX/32)||cy!==Math.floor(ref.centerY/32)):l1Noise(cx,cy,seed^881)>=.14)return[]
 const wall=a.boxes.find(b=>b.style==='parking'&&b.solid&&['wall','brick'].includes(b.surface)&&b.max[0]-b.min[0]>8&&b.max[2]-b.min[2]<2)
 if(!wall)return[]
 const x=ref?ref.centerX:(wall.min[0]+wall.max[0])/2,z=wall.max[2]+.55,out:Structure[]=[]
 const prop=(kind:string,px:number,pz:number,w:number,h:number,deg=0)=>out.push({kind:'pillar',x:px,y:pz,w,h,solid:true,data:{l1Prop:kind,deg,l1HallDressing:1}})
 prop('foldingtable',x-.775,z,1.55,.72)
 prop('seat',x-.53,z+.84,.43,.43,0);prop('seat',x+.10,z+.84,.43,.43,0)
 prop('seat',x-1.31,z+.27,.43,.43,85)
 // Separate leaned panels and extinguishers around the near support, not a
 // flat backdrop; their reverse sides and collision remain present.
 const px=ref?ref.centerX+5.2:x+3.8,pz=ref?ref.centerY-1.8:z
 prop('louver',px-1.45,pz,.9,.30,0)
 prop('louver',px+.60,pz,.9,.30,0)
 prop('extinguisher',px+.65,pz+.45,.25,.25)
 return out
}

/** Furnish only completed rooms; never let the old content generator carve the
 * reference architecture or silently drop furniture before the room exists. */
export function l1RoomDressing(seed:number,cx:number,cy:number):Structure[]{
 // v2: every 小径 room centred in this chunk, furnished by its wiki type.
 const out:Structure[]=[]
 for(const r of l1PlanRooms(seed,cx*32,cy*32,cx*32+32,cy*32+32)){
  if(Math.floor((r.x0+r.x1)/2/32)!==cx||Math.floor((r.y0+r.y1)/2/32)!==cy)continue
  const w=r.x1-r.x0,h=r.y1-r.y0,mx=(r.x0+r.x1)/2,my=(r.y0+r.y1)/2
  // the wall opposite the doorway carries the main piece
  const back=r.door.dir===2?{x:mx,y:r.y1-1}:r.door.dir===3?{x:mx,y:r.y0}:r.door.dir===0?{x:r.x1-1,y:my}:{x:r.x0,y:my}
  const deg=r.door.dir===2?0:r.door.dir===3?180:r.door.dir===0?270:90
  const put=(kind:Structure['kind'],x:number,y:number,sw=1,sh=1,solid=true,data:Structure['data']={})=>out.push({kind,x:Math.floor(x),y:Math.floor(y),w:sw,h:sh,solid,data:{...data,l1RoomDressing:1,l1Room:r.id}})
  if(r.type==='office'){put('desk',back.x-.5,back.y,1,1,true,{deg});put('officechair',mx,my,1,1,false,{deg})}
  else if(r.type==='sickbay'&&((r.x0*73856093^r.y0*19349663)>>>0)%2===0){
   // ref 小径的房间之一: a narrow back room with old hydraulic barber chairs in a row along one wall
   // chairs sit a step off the back wall, facing the doorway (model +Z = seat front), one per 2 m tile pair
   const alongX=r.door.dir>=2,len=alongX?w:h,n=Math.max(1,Math.min(3,Math.floor((len-1)/2))),off=(len-(n-1)*2)/2-.5
   const cd=r.door.dir===0?270:r.door.dir===1?90:r.door.dir===2?180:0
   const by=r.door.dir===2?back.y-1:r.door.dir===3?back.y+1:back.y,bx=r.door.dir===0?back.x-1:r.door.dir===1?back.x+1:back.x
   for(let i=0;i<n;i++){if(alongX)put('barberchair',r.x0+off+i*2,by,1,1,false,{deg:cd});else put('barberchair',bx,r.y0+off+i*2,1,1,false,{deg:cd})}
   // Keep the table near the entrance, away from the back-wall chair row.
   const tx=alongX?(r.door.x>mx?r.x0+1:r.x1-2):r.door.dir===0?r.x0+1:r.x1-2
   const ty=alongX?(r.door.dir===2?r.y0+1:r.y1-2):(r.door.y>my?r.y0+1:r.y1-2)
   put('table',tx,ty)
  }
  else if(r.type==='sickbay'){put('bed',mx-.5,back.y,1,1,true,{deg});put('table',r.x0+.5,r.y0+.5);put('table',r.x1-1.5,r.y0+.5);put('table',r.x0+.5,r.y1-1.5)}
  else if(r.type==='rubber')put('officechair',mx-.5,my-.5,1,1,false,{l1Sunk:1})
  else if(r.type==='gallery'){put('photo',r.x0+1,r.y0,1,1,false);put('photo',r.x1-2,r.y0,1,1,false);put('photo',mx-.5,my-.5,1,1,false,{flat:1})}
  else if(r.type==='mattress'){put('bed',r.x0+.5,r.y0+.5,1,1,true,{l1Mattress:1});if(w>5||h>5)put('bed',r.x1-1.5,r.y1-1.5,1,1,true,{l1Mattress:1})}
 }
 return out
}
export function l1RoomDressingLegacy(seed:number,cx:number,cy:number):Structure[]{
 if(l1LayoutVariant(seed,cx,cy)!=='maintenance')return[]
 const room=l1PathRoom(seed,cx,cy),ref=l1ReferenceAt(seed,cx*32+16,cy*32+16)
 if(!room||ref&&ref.id!=='path-room'||!ref&&l1Noise(cx,cy,seed^887)>.5)return[]
 const out:Structure[]=[],{x0,x1,y0,y1}=room
 const prop=(kind:string,x:number,z:number,w:number,h:number,deg=0)=>out.push({kind:'pillar',x,y:z,w,h,solid:true,data:{l1Prop:kind,deg,l1RoomDressing:1}})
 prop('pathchair',x0+.60,y1-2.05,.60,.70,180)
 prop('pathchair',x0+.82,y1-3.55,.60,.70,174)
 prop('airunit',room.alcove?room.alcove.x0-.14:x1-.76,y1-1.05,.66,.48,165)
 prop('caution',x1-.40,y1-1.7,.30,.30,180)
 prop('paintcan',x1-.45,y0+1.30,.24,.24)
 return out
}
