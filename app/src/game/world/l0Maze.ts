import {l0Hash} from './l0Regions'
import type {L0Wall,L0Rect} from './l0Architecture'
type Point=[number,number]
function clip(poly:Point[],A:number,B:number,C:number):Point[]{
 const out:Point[]=[]
 for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],a=A*p[0]+B*p[1]-C,b=A*q[0]+B*q[1]-C
  if(a<=0)out.push(p)
  if((a<0)!==(b<0)){const t=a/(a-b);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])])}
 }return out
}
/** Exact convex endpoint-space clipping: a line crossing opposite sides must
 * pass entirely below or above every intervening wall rectangle. */
export function mazeHasStraightCrossing(walls:L0Wall[],X:number,Y:number,transpose=false){
 let possible:Point[][]=[[[0,0],[32,0],[32,32],[0,32]]]
 for(const w of walls){
  const x0=Math.max(0,(transpose?w.y-Y:w.x-X)),x1=Math.min(32,(transpose?w.y+w.h-Y:w.x+w.w-X))
  const y0=transpose?w.x-X:w.y-Y,y1=y0+(transpose?w.w:w.h)
  if(x0>=x1||y1<=0||y0>=32)continue
  possible=possible.flatMap(p=>{
   let below=p,above=p
   for(const x of [x0,x1]){below=clip(below,1-x/32,x/32,y0-.0001);above=clip(above,x/32-1,-x/32,-y1-.0001)}
   return[below,above].filter(p=>p.length>=3&&Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0]},0))>1e-7)
  })
  if(!possible.length)return false
 }return possible.length>0
}
const cache=new Map<string,L0Wall[]>()
/** Connected irregular bays, with doors removed from a spanning tree and a few
 * extra loops. No perimeter box; adjoining chunks meet through their open edges. */
export function denseL0Maze(seed:number,cx:number,cy:number,keepClear:L0Rect[]=[]):L0Wall[]{
 const key=`${seed}:${cx},${cy}:${JSON.stringify(keepClear)}`,cached=cache.get(key);if(cached)return cached.map(w=>({...w}))
 const X=cx*32,Y=cy*32,N=8,T=.24
 for(let attempt=0;attempt<128;attempt++){
  // Entrance clearances can coincide with an entire lattice strip. Retry the
  // bay positions as well as its doors, rather than retrying an impossible grid.
  const gridSeed=attempt<8?seed:l0Hash(seed,Math.floor(attempt/8),0xad5)
  const xs=Array.from({length:N+1},(_,i)=>i===0?0:i===N?32:i*32/N+(l0Hash(gridSeed,cx,cy,i,31)%1000/1000-.5)*1.2)
  const ys=Array.from({length:N+1},(_,i)=>i===0?0:i===N?32:i*32/N+(l0Hash(gridSeed,cx,cy,i,37)%1000/1000-.5)*1.2)
  const parent=Array.from({length:N*N},(_,i)=>i),root=(i:number):number=>parent[i]===i?i:(parent[i]=root(parent[i]))
  const edges:{a:number;b:number;axis:number;x:number;y:number;rank:number}[]=[]
  for(let y=0;y<N;y++)for(let x=0;x<N;x++)for(const axis of [0,1])if(axis===0?x<N-1:y<N-1)edges.push({a:y*N+x,b:axis===0?y*N+x+1:(y+1)*N+x,axis,x,y,rank:l0Hash(seed,cx,cy,x,y,axis,attempt)})
  edges.sort((a,b)=>a.rank-b.rank)
  const solid=edges.filter(e=>{const a=root(e.a),b=root(e.b);if(a!==b){parent[a]=b;return false}return e.rank%100>=3})
  let walls:L0Wall[]=solid.map(e=>{
   // Both arms reach the outer edge of the same junction. Previously the
   // starting arm stopped at the centre, leaving a 12cm step at L corners.
   const x0=Math.max(0,e.axis===0?xs[e.x+1]-T/2:xs[e.x]-T/2),y0=Math.max(0,e.axis===1?ys[e.y+1]-T/2:ys[e.y]-T/2)
   const x1=Math.min(32,xs[e.x+1]+T/2),y1=Math.min(32,ys[e.y+1]+T/2)
   return{x:X+x0,y:Y+y0,w:e.axis===0?T:x1-x0,h:e.axis===1?T:y1-y0,bottom:0,top:2.7,surface:'wall' as const}
  })
  for(const p of keepClear)walls=walls.flatMap(w=>{
   if(w.x>=p.x+p.w||w.x+w.w<=p.x||w.y>=p.y+p.h||w.y+w.h<=p.y)return[w]
   if(w.w>w.h)return[{...w,w:Math.max(0,p.x-w.x)},{...w,x:Math.max(w.x,p.x+p.w),w:Math.max(0,w.x+w.w-p.x-p.w)}].filter(v=>v.w>.08)
   return[{...w,h:Math.max(0,p.y-w.y)},{...w,y:Math.max(w.y,p.y+p.h),h:Math.max(0,w.y+w.h-p.y-p.h)}].filter(v=>v.h>.08)
  })
  if(mazeHasStraightCrossing(walls,X,Y)||mazeHasStraightCrossing(walls,X,Y,true))continue
  if(cache.size>=512)cache.delete(cache.keys().next().value!)
  cache.set(key,walls);return walls.map(w=>({...w}))
 }
 throw Error(`Unable to create screened connected maze ${key}`)
}
