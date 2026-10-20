import type {L1Emitter,V3} from './l1BuildingTypes'
import {covered,occluded,type Node} from './l1BakeRaycast'

const strata=[1,14,6,9,0,2,3,4,5,7,8,10,11,12,13,15]
const receiver=[[-.25,-.25],[.25,.25],[-.25,.25],[.25,-.25],[-.375,.125],[.125,-.375],[.375,-.125],[-.125,.375],[-.375,-.375],[.375,.375],[-.125,-.125],[.125,.125],[-.375,.375],[.375,-.375],[-.125,.125],[.125,-.125]]

/** Integrate actual luminaire area and the receiving floor texel. The first
 * symmetric strata refine to sixteen only at a shadow/door transmission edge.
 * Absolute origins keep the same result on both sides of a chart seam. */
export function l1EmitterVisibility(root:Node,e:L1Emitter,origin:V3,high:boolean,footprint=0,crosses?:((a:V3,b:V3,index:number)=>boolean),portalCount=0){
 const initial=high?(e.kind==='tube'?2:4):1,through=Array<number>(portalCount).fill(0)
 let visible=0,count=initial
 const t=e.tangent,n=e.normal,side:V3=[t[1]*n[2]-t[2]*n[1],t[2]*n[0]-t[0]*n[2],t[0]*n[1]-t[1]*n[0]]
 for(let j=0;j<count;j++){
  const index=strata[j],u=high?(index+.5)/16-.5:0,v=high?((index*7+3)%16+.5)/16-.5:0
  const target:V3=[e.position[0]+t[0]*u*e.width+side[0]*v*e.height,e.position[1]+t[1]*u*e.width+side[1]*v*e.height,e.position[2]+t[2]*u*e.width+side[2]*v*e.height]
  const start:V3=footprint?[origin[0]+receiver[j][0]*footprint,origin[1],origin[2]+receiver[j][1]*footprint]:origin
  const dx=target[0]-start[0],dy=target[1]-start[1],dz=target[2]-start[2],len=Math.hypot(dx,dy,dz),direction:V3=[dx/len,dy/len,dz/len]
  if((!footprint||!covered(root,start))&&!occluded(root,start,direction,len-.006)){
   visible++
   if(crosses)for(let k=0;k<portalCount;k++)if(crosses(start,target,k))through[k]++
  }
  if(high&&j===initial-1&&(visible>0&&visible<initial||through.some(v=>v>0&&v<initial)))count=16
 }
 return{visibility:visible/count,through:through.map(v=>v/count),rays:count}
}
