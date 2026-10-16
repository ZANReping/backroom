import type {L11Building} from './l11Types'
import {L11_INSPECTED_SIGNS} from '../content/l11ReferenceSigns'
import {l11BoxSolid,makeL11Solid,transformL11Solid,type SolidPoint} from './l11Solid'
import {l11Shopfront} from './l11Shopfront'
import {l11RetailPiers} from './l11RetailFacade'

/** The shop's two street-facing elevations share a tenant, including in an
 * ordinary city. Mounts are in the building frame, never camera-facing. */
export function l11ShopSigns(b:L11Building){
  const corner=l11Shopfront(b);if(!corner)return []
  const sides=[corner.side,corner.back]
  return sides.flatMap(side=>{
    const ew=side==='e'||side==='w',extent=ew?b.depth:b.width
    if(extent<7)return []
    const end=ew?corner.south:corner.east,nx=side==='w'?-1:side==='e'?1:0,nz=side==='n'?-1:side==='s'?1:0
    const face=ew?(side==='e'?b.width:0):side==='s'?b.depth:0
    const supports=l11RetailPiers(b).filter(p=>Math.abs((ew?p.x:p.z)-face)<.5).map(p=>({u:ew?p.z:p.x,width:ew?p.d:p.w})).sort((a,b)=>a.u-b.u)
    const bays=supports.slice(1).map((p,i)=>({lo:supports[i].u+supports[i].width/2+.08,hi:p.u-p.width/2-.08,near:end?p.u:supports[i].u})).filter(p=>p.hi-p.lo>=L11_INSPECTED_SIGNS[1].width+.015)
    bays.sort((a,c)=>(end?extent-(a.lo+a.hi)/2:(a.lo+a.hi)/2)-(end?extent-(c.lo+c.hi)/2:(c.lo+c.hi)/2))
    // The complete wordmark fits between supports, while the round board's
    // bracket lands on a real pier. Never paint a column across the lettering.
    const bay=bays[0],u=bay?(bay.lo+bay.hi)/2:end?extent-3.4:3.4,roundU=bay?.near??u+(end?1:-1)*1.9
    const x=ew?(side==='e'?b.width:0):u,z=ew?u:side==='s'?b.depth:0,angle=Math.atan2(nx,nz)
    return [
      {spec:L11_INSPECTED_SIGNS[1],x:x+nx*.23,y:2.63,z:z+nz*.23,angle,side},
      ...(side===corner.side?[{spec:L11_INSPECTED_SIGNS[2],x:x+nx*.88+(ew?0:roundU-u),y:2.60,z:z+nz*.88+(ew?roundU-u:0),angle:angle+Math.PI/2,side}]:[]),
    ]
  })
}
export function l11ShopSignSolids(b:L11Building){
  return l11ShopSigns(b).flatMap(p=>{
    const {spec}=p
    if(spec.shape==='rectangle')return [transformL11Solid(l11BoxSolid(0,p.y,0,spec.width+.015,spec.height+.015,.055),p.x,p.z,-p.angle)]
    const vertices:SolidPoint[]=[],n=24
    for(const z of [-.05,.05])for(let i=0;i<n;i++){const a=i*2*Math.PI/n;vertices.push([Math.cos(a)*(spec.width+.015)/2,p.y+Math.sin(a)*(spec.height+.015)/2,z])}
    const solid=makeL11Solid(vertices,[Array.from({length:n},(_,i)=>i),Array.from({length:n},(_,i)=>n+i),...Array.from({length:n},(_,i)=>[i,(i+1)%n,(i+1)%n+n,i+n])])
    return [transformL11Solid(solid,p.x,p.z,-p.angle)]
  })
}
