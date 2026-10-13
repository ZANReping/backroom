import {l0Hash,l0LayoutEnvironment} from './l0Regions'
import type {L0Layout,L0Wall} from './l0Architecture'
/** Select a whole connected partition, so narrow junction/end faces and both
 * arms inherit the same moulding. Neighbour data is deterministic, not live. */
export function l0TrimWalls(seed:number,walls:L0Wall[]):Set<L0Wall>{
 const eligible=walls.filter(w=>!w.redFace&&w.bottom===0&&w.top>.205&&(w.surface==='wall'||w.surface==='dots'))
 const parent=eligible.map((_,i)=>i),root=(i:number):number=>parent[i]===i?i:parent[i]=root(parent[i]),bins=new Map<string,number[]>()
 for(let i=0;i<eligible.length;i++){
  const w=eligible[i],near=new Set<number>()
  for(let y=Math.floor((w.y-.001)/4);y<=Math.floor((w.y+w.h+.001)/4);y++)for(let x=Math.floor((w.x-.001)/4);x<=Math.floor((w.x+w.w+.001)/4);x++){
   const k=`${x},${y}`,list=bins.get(k)??[];for(const j of list)near.add(j);list.push(i);bins.set(k,list)
  }
  for(const j of near){const v=eligible[j];if(w.x<=v.x+v.w+.001&&w.x+w.w>=v.x-.001&&w.y<=v.y+v.h+.001&&w.y+w.h>=v.y-.001)parent[root(i)]=root(j)}
 }
 const keys=new Map<number,{x:number;y:number;maxX:number;maxY:number}>()
 eligible.forEach((w,i)=>{const r=root(i),old=keys.get(r);keys.set(r,old?{x:Math.min(old.x,w.x),y:Math.min(old.y,w.y),maxX:Math.max(old.maxX,w.x+w.w),maxY:Math.max(old.maxY,w.y+w.h)}:{x:w.x,y:w.y,maxX:w.x+w.w,maxY:w.y+w.h})})
 // Short components fit completely inside the deterministic 32m neighbour
 // halo. Longer networks stay undecorated, so clipping that halo cannot give
 // two adjacent chunks different choices for the same continuous partition.
 return new Set(eligible.filter((_,i)=>{const p=keys.get(root(i))!;return p.maxX-p.x<28&&p.maxY-p.y<28&&l0Hash(seed,Math.round(p.x*1000),Math.round(p.y*1000),0xdec)%100<12}))
}
export function l0OutletPositions(a:L0Layout){
 if(a.wood){const r=a.wood;return[{x:r.x+1.1,y:r.y,nx:0,ny:1},{x:r.x+r.w-1.1,y:r.y+r.h,nx:0,ny:-1},{x:r.x,y:r.y+1.5,nx:1,ny:0},{x:r.x+r.w,y:r.y+6.4,nx:-1,ny:0}]}
 return a.walls.filter(w=>w.bottom===0&&w.w>3&&w.h<1.1&&!w.redFace).map(w=>({x:w.x+.493,y:w.y+w.h,nx:0,ny:1})).filter(p=>l0LayoutEnvironment(a,p.x,p.y+.02).red<.01&&!a.walls.some(w=>p.x>w.x&&p.x<w.x+w.w&&p.y+.02>w.y&&p.y+.02<w.y+w.h)).slice(0,3)
}
