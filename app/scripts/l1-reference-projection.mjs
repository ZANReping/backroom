import {Vector3,Vector4} from 'three'
// Project a direction at infinity, including off-frame vanishing points.
export function projectReferenceParallel(camera,line){
 const d=new Vector4(0,0,0,0);d.setComponent(line.axis,1)
 d.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix)
 const vp=[(d.x+d.w)/2,(d.w-d.y)/2,d.w],a=line.from,b=line.to,aspect=camera.aspect
 const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],v=[(vp[0]-mid[0]*vp[2])*aspect,vp[1]-mid[1]*vp[2]]
 const length=Math.hypot(...v),source=[(b[0]-a[0])*aspect,b[1]-a[1]],span=Math.hypot(...source)
 if(length<1e-10||span<1e-10)throw Error('Degenerate reference direction')
 const sine=(v[0]*source[1]-v[1]*source[0])/(length*span)
 return{angleDegrees:Math.asin(Math.max(-1,Math.min(1,sine)))*180/Math.PI,endpointError:span*.5*Math.abs(sine),vanishingPoint:Math.abs(vp[2])>1e-8?[vp[0]/vp[2],vp[1]/vp[2]]:null}
}
// A round pillar's visible edge is a view-dependent silhouette, not its world-X
// extremum at the centre depth. Use the actual high-quality 24-sided profile.
export function projectReferencePoint(camera,mark,origin=[0,0,0]){
 const project=p=>{const world=p.map((v,i)=>v+origin[i]),q=new Vector3(...world).project(camera);return{uv:[(q.x+1)/2,(1-q.y)/2],z:q.z,world,inFrame:q.z>-1&&q.z<1&&Math.abs(q.x)<=1&&Math.abs(q.y)<=1}}
 if(!mark.profile)return project(mark.world)
 const {center,radius,side}=mark.profile,points=[]
 for(let i=0;i<24;i++){const t=i/24*Math.PI*2;points.push(project([center[0]+Math.cos(t)*radius,center[1],center[2]+Math.sin(t)*radius]))}
 points.sort((a,b)=>a.uv[0]-b.uv[0]);return side==='left'?points[0]:points.at(-1)
}
