import type {L1Box,L1StyleName,L1SurfaceName,V3} from './l1BuildingTypes'
const add=(a:V3,b:V3):V3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]]
const mul=(a:V3,b:number):V3=>[a[0]*b,a[1]*b,a[2]*b]
const sub=(a:V3,b:V3):V3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]]
const dot=(a:V3,b:V3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
const cross=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
const unit=(a:V3)=>mul(a,1/Math.max(1e-8,Math.hypot(...a)))
export type Occluder=L1Box&{triangles?:V3[][]}
export interface Node {min:V3;max:V3;left?:Node;right?:Node;boxes?:Occluder[]}
export function tree(boxes:Occluder[]):Node {
 const min:V3=[Infinity,Infinity,Infinity],max:V3=[-Infinity,-Infinity,-Infinity]
 for(const b of boxes)for(let j=0;j<3;j++){min[j]=Math.min(min[j],b.min[j]);max[j]=Math.max(max[j],b.max[j])}
 if(boxes.length<8)return{min,max,boxes}
 const axis=max[0]-min[0]>max[2]-min[2]?0:2
 boxes.sort((a,b)=>a.min[axis]+a.max[axis]-b.min[axis]-b.max[axis]);const mid=boxes.length>>1
 return{min,max,left:tree(boxes.slice(0,mid)),right:tree(boxes.slice(mid))}
}
function slab(min:V3,max:V3,o:V3,d:V3,limit:number){
 let near=-Infinity,far=Infinity,axis=0,sign=1,exitAxis=0,exitSign=1
 for(let j=0;j<3;j++){
  if(Math.abs(d[j])<1e-8){if(o[j]<min[j]||o[j]>max[j])return null;continue}
  const a=(min[j]-o[j])/d[j],b=(max[j]-o[j])/d[j],lo=Math.min(a,b),hi=Math.max(a,b)
  if(lo>near){near=lo;axis=j;sign=d[j]>0?-1:1}
  if(hi<far){far=hi;exitAxis=j;exitSign=d[j]>0?1:-1}if(far<near)return null
 }
 // A ray starting inside a solid still hits its exit. Ignoring the containing
 // box made floor texels below columns see lamps through the whole column.
 const inside=near<.0005,t=inside?far:near
 if(t<.0005||t>=limit)return null
 const n:V3=[0,0,0];n[inside?exitAxis:axis]=inside?exitSign:sign;return{t,n}
}
function bound(n:Node,o:V3,d:V3,limit:number){
 let a=0,b=limit;for(let j=0;j<3;j++){if(Math.abs(d[j])<1e-8){if(o[j]<n.min[j]||o[j]>n.max[j])return false;continue}const x=(n.min[j]-o[j])/d[j],y=(n.max[j]-o[j])/d[j];a=Math.max(a,Math.min(x,y));b=Math.min(b,Math.max(x,y));if(b<a)return false}return true
}
/** Strict volume coverage, not distance-to-wall AO. Triangle roof bounds are
 * acceleration bounds only and must never be treated as filled cuboids. */
export function covered(node:Node,p:V3):boolean {
 if(p[0]<=node.min[0]||p[0]>=node.max[0]||p[1]<=node.min[1]||p[1]>=node.max[1]||p[2]<=node.min[2]||p[2]>=node.max[2])return false
 if(!node.boxes)return covered(node.left!,p)||covered(node.right!,p)
 for(const b of node.boxes){
  if(b.triangles||p[0]<=b.min[0]+.0001||p[0]>=b.max[0]-.0001||p[1]<=b.min[1]+.0001||p[1]>=b.max[1]-.0001||p[2]<=b.min[2]+.0001||p[2]>=b.max[2]-.0001)continue
  if(b.shape!=='round')return true
  const a=b.axis??1,u=a===0?2:a===2?1:0,v=a===0?1:a===2?0:2
  if(((p[u]-(b.min[u]+b.max[u])/2)/((b.max[u]-b.min[u])/2))**2+((p[v]-(b.min[v]+b.max[v])/2)/((b.max[v]-b.min[v])/2))**2<.9999)return true
 }return false
}
export function trace(root:Node,o:V3,d:V3,limit:number,anyHit=false){
 let nearest=limit,hit:{p:V3;n:V3;style:L1StyleName;surface:L1SurfaceName}|undefined
 const visit=(node:Node)=>{
  if(anyHit&&hit||!bound(node,o,d,nearest))return
  if(node.boxes)for(const b of node.boxes){
   let h=slab(b.min,b.max,o,d,nearest)
   if(h&&b.triangles){
    h=null
    for(const [a,c,e]of b.triangles){
     // A ceiling is an inward-facing shell. A ray leaving the back of the
     // coarse vault proxy must not shadow its own finer receiving surface.
     const ab=sub(c,a),ac=sub(e,a),p=cross(d,ac),det=dot(ab,p);if(det<1e-7)continue
     const inv=1/det,tv=sub(o,a),u=dot(tv,p)*inv;if(u<0||u>1)continue
     const q=cross(tv,ab),v=dot(d,q)*inv;if(v<0||u+v>1)continue
     const t=dot(ac,q)*inv;if(t>.002&&t<nearest&&(!h||t<h.t)){let n=unit(cross(ab,ac));if(dot(n,d)>0)n=mul(n,-1);h={t,n}}
    }
   }
   if(b.shape==='round'){
    const axis=b.axis??1,u=axis===0?2:axis===2?1:0,v=axis===0?1:axis===2?0:2
    const cx=(b.min[u]+b.max[u])/2,cz=(b.min[v]+b.max[v])/2,rx=(b.max[u]-b.min[u])/2,rz=(b.max[v]-b.min[v])/2,x=(o[u]-cx)/rx,z=(o[v]-cz)/rz,dx=d[u]/rx,dz=d[v]/rz,A=dx*dx+dz*dz,B=2*(x*dx+z*dz),C=x*x+z*z-1,disc=B*B-4*A*C
    h=null
    if(A>1e-8&&disc>=0)for(const t of [(-B-Math.sqrt(disc))/(2*A),(-B+Math.sqrt(disc))/(2*A)])if(t>.002&&t<nearest&&o[axis]+d[axis]*t>=b.min[axis]&&o[axis]+d[axis]*t<=b.max[axis]){const n:V3=[0,0,0];n[u]=(o[u]+d[u]*t-cx)/(rx*rx);n[v]=(o[v]+d[v]*t-cz)/(rz*rz);h={t,n:unit(n)};break}
    if(Math.abs(d[axis])>1e-8)for(const end of [b.min[axis],b.max[axis]]){const t=(end-o[axis])/d[axis];if(t>.002&&t<nearest&&(!h||t<h.t)&&((o[u]+d[u]*t-cx)/rx)**2+((o[v]+d[v]*t-cz)/rz)**2<=1){const n:V3=[0,0,0];n[axis]=end===b.min[axis]?-1:1;h={t,n}}}
   }
   if(h){nearest=h.t;hit={p:add(o,mul(d,h.t)),n:h.n,style:b.style,surface:b.surface};if(anyHit)return}
  }
  else {visit(node.left!);visit(node.right!)}
 };visit(root);return hit
}

/** Visibility needs a boolean, not an allocated hit position, shading normal,
 * or nearest-hit search. Keep the same intersection thresholds as trace(). */
export function occluded(node:Node,o:V3,d:V3,limit:number):boolean {
 if(!bound(node,o,d,limit))return false
 if(!node.boxes)return occluded(node.left!,o,d,limit)||occluded(node.right!,o,d,limit)
 for(const b of node.boxes){
  if(b.shape==='round'){
   const axis=b.axis??1,u=axis===0?2:axis===2?1:0,v=axis===0?1:axis===2?0:2
   const cx=(b.min[u]+b.max[u])/2,cz=(b.min[v]+b.max[v])/2,rx=(b.max[u]-b.min[u])/2,rz=(b.max[v]-b.min[v])/2
   const x=(o[u]-cx)/rx,z=(o[v]-cz)/rz,dx=d[u]/rx,dz=d[v]/rz,A=dx*dx+dz*dz,B=2*(x*dx+z*dz),C=x*x+z*z-1,disc=B*B-4*A*C
   if(A>1e-8&&disc>=0){const q=Math.sqrt(disc)
    for(let i=0;i<2;i++){const t=(-B+(i?q:-q))/(2*A),h=o[axis]+d[axis]*t;if(t>.002&&t<limit&&h>=b.min[axis]&&h<=b.max[axis])return true}
   }
   if(Math.abs(d[axis])>1e-8)for(let i=0;i<2;i++){const t=((i?b.max[axis]:b.min[axis])-o[axis])/d[axis]
    if(t>.002&&t<limit&&((o[u]+d[u]*t-cx)/rx)**2+((o[v]+d[v]*t-cz)/rz)**2<=1)return true
   }
   continue
  }
  let near=-Infinity,far=Infinity,miss=false
  for(let j=0;j<3;j++){
   if(Math.abs(d[j])<1e-8){if(o[j]<b.min[j]||o[j]>b.max[j]){miss=true;break}continue}
   const a=(b.min[j]-o[j])/d[j],c=(b.max[j]-o[j])/d[j]
   near=Math.max(near,Math.min(a,c));far=Math.min(far,Math.max(a,c));if(far<near){miss=true;break}
  }
  const t=near<.0005?far:near;if(miss||t<.0005||t>=limit)continue
  if(!b.triangles)return true
  for(const [a,c,e]of b.triangles){
   const ab=sub(c,a),ac=sub(e,a),p=cross(d,ac),det=dot(ab,p);if(det<1e-7)continue
   const inv=1/det,tv=sub(o,a),u=dot(tv,p)*inv;if(u<0||u>1)continue
   const q=cross(tv,ab),v=dot(d,q)*inv;if(v<0||u+v>1)continue
   const distance=dot(ac,q)*inv;if(distance>.002&&distance<limit)return true
  }
 }return false
}
