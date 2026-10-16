import * as THREE from 'three'
import type { Polygon, Point } from '../world/l11Geometry'
import { l11BoxSolid,l11MeshSolid,l11PlateSolid,transformL11Solid,type L11Solid,type SolidPoint } from '../world/l11Solid'
export class CityBatch {
  readonly solids:L11Solid[]=[]
  private capture:boolean
  constructor(capture=false){this.capture=capture}
  private buckets = new Map<THREE.Material, { p:number[]; n:number[]; uv:number[]; idx:number[] }>()
  private quadTarget=new THREE.Vector3()
  private quadFirst=new THREE.Vector3()
  private quadSecond=new THREE.Vector3()
  private quadDiffA=new THREE.Vector3()
  private quadDiffB=new THREE.Vector3()
  geometry(mat:THREE.Material,geo:THREE.BufferGeometry,matrix:THREE.Matrix4,metricUV?:ArrayLike<number>){
    let b=this.buckets.get(mat);if(!b){b={p:[],n:[],uv:[],idx:[]};this.buckets.set(mat,b)}
    const start=b.p.length/3,p=geo.getAttribute('position'),n=geo.getAttribute('normal'),uv=geo.getAttribute('uv'),normal=new THREE.Matrix3().getNormalMatrix(matrix),v=new THREE.Vector3()
    for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(matrix);b.p.push(v.x,v.y,v.z);v.fromBufferAttribute(n,i).applyMatrix3(normal).normalize();b.n.push(v.x,v.y,v.z);b.uv.push(metricUV?.[i*2]??uv?.getX(i)??0,metricUV?.[i*2+1]??uv?.getY(i)??0)}
    if(geo.index)for(let i=0;i<geo.index.count;i++)b.idx.push(start+geo.index.getX(i));else for(let i=0;i<p.count;i++)b.idx.push(start+i)
    if(this.capture)this.solids.push(l11MeshSolid(b.p.slice(start*3),geo.index?.array??Array.from({length:p.count},(_,i)=>i)))
  }
  surface(mat:THREE.Material,polygon:Polygon,height:number|((x:number,y:number)=>number),ox=0,oy=0){
    let b=this.buckets.get(mat);if(!b){b={p:[],n:[],uv:[],idx:[]};this.buckets.set(mat,b)}
    const rings=polygon.map(r=>r.slice(0,-1).map(p=>new THREE.Vector2(p[0],p[1]))),pts=rings.flat(),start=b.p.length/3
    const triangles=THREE.ShapeUtils.triangulateShape(rings[0],rings.slice(1))
    for(const p of pts){const h=typeof height==='number'?height:height(p.x,p.y);b.p.push(p.x-ox,h,p.y-oy);b.n.push(0,1,0);b.uv.push(p.x,p.y)}
    for(const [a,c,d]of triangles)b.idx.push(start+a,start+d,start+c)
    if(this.capture)for(const tri of triangles){const solid=l11PlateSolid(tri.map(i=>[pts[i].x-ox,typeof height==='number'?height:height(pts[i].x,pts[i].y),pts[i].y-oy]));if(solid)this.solids.push(solid)}
  }
  wall(mat:THREE.Material,a:Point,b:Point,lo:number,hi:number,thickness=.2){
    const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(len<.001||hi<=lo)return
    const nx=-dy/len*thickness/2,ny=dx/len*thickness/2,p=[[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny]]
    const capture=this.capture
    if(capture){this.solids.push(transformL11Solid(l11BoxSolid(0,(lo+hi)/2,0,len,hi-lo,thickness),(a[0]+b[0])/2,(a[1]+b[1])/2,Math.atan2(dy,dx)));this.capture=false}
    for(let i=0;i<4;i++){const q=p[i],r=p[(i+1)%4],ex=r[0]-q[0],ey=r[1]-q[1],d=Math.hypot(ex,ey);this.quad(mat,[[q[0],lo,q[1]],[r[0],lo,r[1]],[r[0],hi,r[1]],[q[0],hi,q[1]]],[-ey/d,0,ex/d])}
    this.quad(mat,p.map(q=>[q[0],hi,q[1]]),[0,1,0])
    this.capture=capture
  }
  prism(mat:THREE.Material,p:Polygon,lo:number,hi:number){for(const r of p)for(let i=1;i<r.length;i++)this.wall(mat,r[i-1],r[i],lo,hi,.015);this.surface(mat,p,hi)}
  quad(mat:THREE.Material, points:number[][], normal:number[], scale=1, uvs?:number[][]) {
    let b=this.buckets.get(mat)
    if(!b){b={p:[],n:[],uv:[],idx:[]};this.buckets.set(mat,b)}
    const start=b.p.length/3
    const target=this.quadTarget.set(normal[0],normal[1],normal[2]).normalize()
    this.quadDiffA.set(points[1][0]-points[0][0],points[1][1]-points[0][1],points[1][2]-points[0][2])
    this.quadDiffB.set(points[2][0]-points[0][0],points[2][1]-points[0][1],points[2][2]-points[0][2])
    const first=this.quadFirst.crossVectors(this.quadDiffA,this.quadDiffB)
    this.quadDiffA.set(points[2][0]-points[0][0],points[2][1]-points[0][1],points[2][2]-points[0][2])
    this.quadDiffB.set(points[3][0]-points[0][0],points[3][1]-points[0][1],points[3][2]-points[0][2])
    const second=this.quadSecond.crossVectors(this.quadDiffA,this.quadDiffB)
    let gn=first.lengthSq()>=1e-10?first:second
    const valid=gn.lengthSq()>=1e-10
    let reverse=false
    if(valid){reverse=gn.dot(target)<0;gn.normalize();if(reverse)gn.negate()}
    else gn.copy(target)
    const nx=target.x,nz=target.z
    const horizontalLength=Math.hypot(nx,nz),horizontal=horizontalLength>1e-6
    let tx=1,tz=0
    if(horizontal){tx=-nz/horizontalLength;tz=nx/horizontalLength;if(Math.abs(tx)>=Math.abs(tz)?tx<0:tz<0){tx=-tx;tz=-tz}}
    for(const [i,v] of points.entries()){
      b.p.push(...v);b.n.push(gn.x,gn.y,gn.z)
      if(uvs?.[i])b.uv.push(uvs[i][0],uvs[i][1])
      else if(horizontal)b.uv.push((v[0]*tx+v[2]*tz)*scale,v[1]*scale)
      else b.uv.push(v[0]*scale,v[2]*scale)
    }
    if(reverse)b.idx.push(start,start+2,start+1,start,start+3,start+2)
    else b.idx.push(start,start+1,start+2,start,start+2,start+3)
    if(this.capture&&valid){
      // Roof profiles occasionally contain a collapsed triangle at the eave.
      for(const ids of [[0,1,2],[0,2,3]]){const solid=l11PlateSolid(ids.map(i=>points[i] as SolidPoint));if(solid)this.solids.push(solid)}
    }
  }
  box(mat:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,slope?:Point) {
    const capture=this.capture
    const point=(a:number,b:number,c:number)=>[a,b+(slope?(a-x)*slope[0]+(c-z)*slope[1]:0),c]
    if(capture){const solid=l11BoxSolid(x,y,z,w,h,d);if(slope)solid.vertices=solid.vertices.map(p=>point(...p) as SolidPoint);this.solids.push(solid);this.capture=false}
    const a=x-w/2,b=x+w/2,c=y-h/2,e=y+h/2,f=z-d/2,g=z+d/2
    this.quad(mat,[point(a,c,g),point(b,c,g),point(b,e,g),point(a,e,g)],[0,0,1])
    this.quad(mat,[point(b,c,f),point(a,c,f),point(a,e,f),point(b,e,f)],[0,0,-1])
    this.quad(mat,[point(b,c,g),point(b,c,f),point(b,e,f),point(b,e,g)],[1,0,0])
    this.quad(mat,[point(a,c,f),point(a,c,g),point(a,e,g),point(a,e,f)],[-1,0,0])
    this.quad(mat,[point(a,e,g),point(b,e,g),point(b,e,f),point(a,e,f)],[0,1,0])
    this.quad(mat,[point(a,c,f),point(b,c,f),point(b,c,g),point(a,c,g)],[0,-1,0])
    this.capture=capture
  }
  finish(group:THREE.Group) {
    for(const [mat,b] of this.buckets){
      const geo=new THREE.BufferGeometry()
      geo.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(b.n,3))
      geo.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));geo.setIndex(b.idx);geo.computeBoundingSphere()
      const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=!mat.transparent;mesh.receiveShadow=true;group.add(mesh)
    }
    this.buckets.clear()
  }
}

