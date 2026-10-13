import type {Structure} from '../core/types'
import {l1Noise,l1PathRoom,l1ReferenceAt} from './l1Spatial'
import {l1LayoutVariant} from './l1Layout'
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
