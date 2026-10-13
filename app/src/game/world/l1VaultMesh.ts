import {l1ModuleAt} from './l1Building'
import type {V3} from './l1BuildingTypes'
type P=[number,number]
/** Additional cuts on an existing grid edge must retain that edge's linear
 * height. Only the actual shaft boundary is constrained to the springing plane. */
export function l1VaultSplitHeight(seed:number,tri:V3[],v:P){
 const p=l1ModuleAt(seed,v[0],v[1],'gothic'),x=p.phaseX+Math.round((v[0]-p.phaseX)/p.spacingX)*p.spacingX,z=p.phaseZ+Math.round((v[1]-p.phaseZ)/p.spacingZ)*p.spacingZ
 if(Math.hypot(v[0]-x,v[1]-z)<=p.columnWidth/2+1e-8)return p.springHeight??1.35
 const [a,b,c]=tri,det=(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0])
 const u=((v[0]-a[0])*(c[2]-a[2])-(v[1]-a[2])*(c[0]-a[0]))/det,w=((b[0]-a[0])*(v[1]-a[2])-(b[2]-a[2])*(v[0]-a[0]))/det
 return a[1]*(1-u-w)+b[1]*u+c[1]*w
}
/** Subtract the actual polygonal shaft from a roof triangle. Unaffected triangles
 * retain their shared grid vertices; only the small springing ring is split. */
export function clipL1VaultTriangle(seed:number,triangle:P[],segments:number):P[][]|undefined {
 const mx=(triangle[0][0]+triangle[1][0]+triangle[2][0])/3,mz=(triangle[0][1]+triangle[1][1]+triangle[2][1])/3,p=l1ModuleAt(seed,mx,mz,'gothic')
 const x=p.phaseX+Math.round((mx-p.phaseX)/p.spacingX)*p.spacingX,z=p.phaseZ+Math.round((mz-p.phaseZ)/p.spacingZ)*p.spacingZ,r=p.columnWidth/2
 const minX=Math.min(...triangle.map(v=>v[0])),maxX=Math.max(...triangle.map(v=>v[0])),minZ=Math.min(...triangle.map(v=>v[1])),maxZ=Math.max(...triangle.map(v=>v[1]))
 if(Math.hypot(x-Math.max(minX,Math.min(maxX,x)),z-Math.max(minZ,Math.min(maxZ,z)))>r+.001)return
 const ring=Array.from({length:segments},(_,i):P=>[x+r*Math.cos(i/segments*Math.PI*2),z+r*Math.sin(i/segments*Math.PI*2)])
 let remaining=triangle;const outside:P[][]=[]
 for(let i=0;i<segments&&remaining.length>=3;i++){
  const a=ring[i],b=ring[(i+1)%segments],distance=(v:P)=>(b[0]-a[0])*(v[1]-a[1])-(b[1]-a[1])*(v[0]-a[0]),inner:P[]=[],outer:P[]=[]
  for(let j=0;j<remaining.length;j++){
   const v=remaining[j],w=remaining[(j+1)%remaining.length],d=distance(v),D=distance(w),inV=d>=0,inW=D>=0
   ;(inV?inner:outer).push(v)
   if(inV!==inW){const t=d/(d-D),q:P=[v[0]+(w[0]-v[0])*t,v[1]+(w[1]-v[1])*t];inner.push(q);outer.push(q)}
  }
  if(outer.length>=3)outside.push(outer)
  remaining=inner
 }
 // Each successive clipping plane can terminate on a previously emitted
 // edge. Insert those T-junction vertices on both polygons before lifting the
 // mesh into 3D: their springing heights are not linear along the old edge.
 const vertices=outside.flat()
 return outside.map(polygon=>polygon.flatMap((a,j)=>{
  const b=polygon[(j+1)%polygon.length],dx=b[0]-a[0],dz=b[1]-a[1],length2=dx*dx+dz*dz
  if(length2<1e-18)return []
  const cuts=vertices.map(v=>({v,t:((v[0]-a[0])*dx+(v[1]-a[1])*dz)/length2}))
   .filter(({v,t})=>t>1e-7&&t<1-1e-7&&Math.hypot(v[0]-a[0]-dx*t,v[1]-a[1]-dz*t)<1e-8)
   .sort((a,b)=>a.t-b.t)
  return [a,...cuts.filter((v,i)=>!i||Math.abs(v.t-cuts[i-1].t)>1e-7).map(v=>v.v)]
 }))
}
