import type {L1ArchitectureData,L1Box} from './l1BuildingTypes'
import {h32,regionHost,exitTarget,RS} from './infiniteSeed'
import {l1OutpostSites} from './l1OutpostSites'

export interface L1WallMount {x:number;z:number;dir:number}
export const L1_WALL_NORMALS=[[0,-1],[1,0],[0,1],[-1,0]] as const
/** A whole one-metre mounting face backed by real wall geometry. Coordinates
 * are the adjacent floor cell, so rendering and interactions use the same frame. */
export function l1WallMounts(a:L1ArchitectureData,height=2.3):L1WallMount[]{
 const ox=a.cx*32,oz=a.cy*32,out:L1WallMount[]=[],seen=new Set<string>()
 const add=(x:number,z:number,dir:number)=>{
  if(x<ox||x+1>ox+32||z<oz||z+1>oz+32||!a.floor[(z-oz)*32+x-ox])return
  const key=`${x},${z}:${dir}`;if(!seen.has(key)){seen.add(key);out.push({x,z,dir})}
 }
 for(const b of a.boxes){
  if(!b.solid||b.min[1]>.01||b.max[1]<height||!['wall','brick'].includes(b.surface))continue
  for(let z=Math.ceil(b.min[2]);z+1<=b.max[2];z++){
   if(Number.isInteger(b.min[0]))add(b.min[0]-1,z,1)
   if(Number.isInteger(b.max[0]))add(b.max[0],z,3)
  }
  for(let x=Math.ceil(b.min[0]);x+1<=b.max[0];x++){
   if(Number.isInteger(b.min[2]))add(x,b.min[2]-1,2)
   if(Number.isInteger(b.max[2]))add(x,b.max[2],0)
  }
 }
 return out
}
/** Subtract an XZ rectangle. Used by the real wall opening and floor below a
 * descending stair, so neither the old solid wall nor the floor covers a portal. */
export function l1CutRect(x:number,z:number,X:number,Z:number,hole:{x:number;z:number;w:number;d:number}){
 const a=Math.max(x,hole.x),b=Math.max(z,hole.z),c=Math.min(X,hole.x+hole.w),d=Math.min(Z,hole.z+hole.d)
 if(c<=a||d<=b)return [[x,z,X,Z]]
 return [[x,z,a,Z],[c,z,X,Z],[a,z,c,b],[a,d,c,Z]].filter(r=>r[2]-r[0]>1e-6&&r[3]-r[1]>1e-6)
}
export function l1ExitAllocation(seed:number,cx:number,cy:number){
 const rx=Math.floor(cx/RS),ry=Math.floor(cy/RS),host=regionHost(seed,rx,ry)
 return host.cx===cx&&host.cy===cy?{kind:h32(seed,0xe33,rx,ry)%2===0?'stairs' as const:'unlockeddoor' as const,target:exitTarget(seed,cx,cy)}:undefined
}
/** Build a real service recess if this exit's guaranteed host is an open hall.
 * This is part of normal architecture, with bake occlusion and collision. */
export function fitL1Exit(a:L1ArchitectureData,roof:(x:number,z:number)=>number){
 const allocation=l1ExitAllocation(a.seed,a.cx,a.cy);if(!allocation)return
 const ox=a.cx*32,oz=a.cy*32,target={x:ox+allocation.target.x,z:oz+allocation.target.y}
 const entrances=l1OutpostSites(a.seed,ox-3,oz-3,ox+35,oz+35)
 const clear=(p:L1WallMount,room=false)=>{
  const [dx,dz]=L1_WALL_NORMALS[p.dir],tx=p.x+.5,tz=p.z+.5
  const x=room?tx-1.5:p.x+.12,z=room?tz-1.5:p.z+.12,X=room?tx+1.5:p.x+.88,Z=room?tz+1.5:p.z+.88
  if(entrances.some(e=>Math.hypot(tx-e.x-.5,tz-e.z-.5)<3.2))return false
  for(let y=Math.floor(z);y<=Math.floor(Z-1e-6);y++)for(let q=Math.floor(x);q<=Math.floor(X-1e-6);q++)if(q<ox+1||q>=ox+31||y<oz+1||y>=oz+31||!a.floor[(y-oz)*32+q-ox])return false
  if(a.boxes.some(b=>b.solid&&b.min[0]<X&&b.max[0]>x&&b.min[2]<Z&&b.max[2]>z))return false
  // The complete frame and approaching player's head must clear the vault.
  return [-.48,0,.48].every(t=>[-.4,.4,.9].every(n=>roof(tx+dx*n+dz*t,tz+dz*n-dx*t)>=2.54))
 }
 const nearest=(list:L1WallMount[])=>list.filter(p=>clear(p)).sort((a,b)=>Math.hypot(a.x-target.x,a.z-target.z)-Math.hypot(b.x-target.x,b.z-target.z))[0]
 let p=nearest(l1WallMounts(a,2.5))
 if(!p){
  let distance=Infinity
  for(let z=oz+3;z<oz+29;z++)for(let x=ox+3;x<ox+29;x++){
   const candidate={x,z,dir:0},d=Math.hypot(x-target.x,z-target.z)
   if(d<distance&&clear(candidate,true)){p=candidate;distance=d}
  }
  if(!p)throw Error(`L1 exit has no accessible service recess: ${a.seed}:${a.cx},${a.cy}`)
  const style=a.styles[(p.z-oz)*32+p.x-ox],name=['parking','storage','gothic','ouroboros','garden','maintenance','fabled'][style] as L1Box['style']
  a.boxes.push({id:`exit-service:${a.cx},${a.cy}`,min:[p.x-1,0,p.z-1],max:[p.x+2,roof(p.x+.5,p.z+.5),p.z],style:name,surface:'wall',solid:true,occlude:true})
 }
 const [dx,dz]=L1_WALL_NORMALS[p.dir],hole={x:p.x+dx,z:p.z+dz,w:1,d:1},boxes:L1Box[]=[]
 for(const b of a.boxes){
  if(!b.solid||!['wall','brick'].includes(b.surface)||b.min[1]>.01||b.max[0]<=hole.x||b.min[0]>=hole.x+1||b.max[2]<=hole.z||b.min[2]>=hole.z+1){boxes.push(b);continue}
  l1CutRect(b.min[0],b.min[2],b.max[0],b.max[2],hole).forEach(([x,z,X,Z],i)=>boxes.push({...b,id:b.id+`:exit-side${i}`,min:[x,b.min[1],z],max:[X,b.max[1],Z]}))
  if(b.max[1]>2.45)boxes.push({...b,id:b.id+':exit-head',min:[Math.max(b.min[0],hole.x),2.45,Math.max(b.min[2],hole.z)],max:[Math.min(b.max[0],hole.x+1),b.max[1],Math.min(b.max[2],hole.z+1)]})
 }
 a.boxes=boxes;a.exit={...p,kind:allocation.kind}
}
