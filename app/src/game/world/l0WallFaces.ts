import type {L0Wall} from './l0Architecture'
type Rect={u:number;v:number;w:number;h:number}
export type L0WallFace=Rect&{axis:0|1|2;sign:1|-1;at:number;wall:L0Wall}
const EPS=1e-5
function cut(a:Rect,b:Rect):Rect[]{
 const u=Math.max(a.u,b.u),v=Math.max(a.v,b.v),U=Math.min(a.u+a.w,b.u+b.w),V=Math.min(a.v+a.h,b.v+b.h)
 if(U-u<EPS||V-v<EPS)return[a]
 return[{u:a.u,v:a.v,w:u-a.u,h:a.h},{u:U,v:a.v,w:a.u+a.w-U,h:a.h},{u,v:a.v,w:U-u,h:v-a.v},{u,v:V,w:U-u,h:a.v+a.h-V}].filter(r=>r.w>EPS&&r.h>EPS)
}
const ranges=(w:L0Wall)=>[[w.x,w.x+w.w],[w.bottom,w.top],[w.y,w.y+w.h]]
/** Boundary of the union of wall solids. Coplanar faces have one deterministic
 * owner; intersecting elbows and walls clipped at streaming edges have no caps. */
export function exposedL0WallFaces(walls:L0Wall[],neighbours:L0Wall[]=[]):L0WallFace[]{
 const all=[...walls,...neighbours],bounds=all.map(ranges),result:L0WallFace[]=[]
 for(let i=0;i<walls.length;i++){
  const wall=walls[i],a=bounds[i]
  const candidates=all.map((_,j)=>j).filter(j=>j!==i&&bounds[j][0][0]<=a[0][1]+EPS&&bounds[j][0][1]>=a[0][0]-EPS&&bounds[j][2][0]<=a[2][1]+EPS&&bounds[j][2][1]>=a[2][0]-EPS)
  for(const axis of [0,1,2] as const)for(const sign of [-1,1] as const){
   const ua=axis===0?2:0,va=axis===1?2:1,at=a[axis][sign===1?1:0]
   let patches:Rect[]=[{u:a[ua][0],v:a[va][0],w:a[ua][1]-a[ua][0],h:a[va][1]-a[va][0]}]
   for(const j of candidates){
    if(!patches.length)break
    const b=bounds[j],contains=b[axis][0]<=at+EPS&&b[axis][1]>=at-EPS
    if(!contains)continue
    const beyond=sign===1?b[axis][1]>at+EPS:b[axis][0]<at-EPS
    // Prefer earlier walls for surfaces on the exact same outer plane.
    if(!beyond&&j>i)continue
    patches=patches.flatMap(p=>cut(p,{u:b[ua][0],v:b[va][0],w:b[ua][1]-b[ua][0],h:b[va][1]-b[va][0]}))
   }
   result.push(...patches.map(p=>({...p,axis,sign,at,wall})))
  }
 }
 return result
}
