import * as THREE from 'three'
import {retroTexture,type RetroBoneName} from './retroNpc'
import {installL0EnvironmentShader} from './l0EnvironmentShader'
import {installL1DynamicProbe} from './l1Probes'
import {NpcGearFit,type GearPoint,type GearSkin} from './npcGearFit'

export type GearTile='cloth'|'leather'|'steel'|'brass'|'wood'|'paper'|'knit'|'rubber'|'enamel'|'glass'|'cross'|'label'|'mesh'|'feather'|'seam'|'plain'
const tiles:GearTile[]=['cloth','leather','steel','brass','wood','paper','knit','rubber','enamel','glass','cross','label','mesh','feather','seam','plain']
export const gearMaterial=()=>{
 const map=retroTexture('/textures/npc-gear/color.png')
 const m=new THREE.MeshLambertMaterial({map,emissiveMap:map,emissive:0xffffff,emissiveIntensity:.16,vertexColors:true,flatShading:true,side:THREE.DoubleSide})
 m.name='retro NPC accessories / shared CC0 material atlas'
 m.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif')}
 m.customProgramCacheKey=()=> 'retro-npc-gear-v1'
 installL0EnvironmentShader(m);installL1DynamicProbe(m);return m
}
/** Append in bind space, then upload once. All opaque wearables share one extra draw call. */
export class GearGeometry {
 readonly fit:NpcGearFit
 private pos:number[]=[];private normal:number[]=[];private uv:number[]=[];private colors:number[]=[];private indices:number[]=[];private weights:number[]=[]
 constructor(fit:NpcGearFit){this.fit=fit}
 get triangles(){return this.pos.length/9}
 add(geometry:THREE.BufferGeometry,tile:GearTile,color:string|number,skin:GearSkin|((p:GearPoint)=>GearSkin),matrix?:THREE.Matrix4){
  const g=geometry.index?geometry.toNonIndexed():geometry.clone();if(matrix)g.applyMatrix4(matrix)
  const p=g.attributes.position,n=g.attributes.normal,u=g.attributes.uv,c=new THREE.Color(color),ti=tiles.indexOf(tile),cx=ti%4,cy=Math.floor(ti/4)
  for(let i=0;i<p.count;i++){
   const point:GearPoint=[p.getX(i),p.getY(i),p.getZ(i)],s=typeof skin==='function'?skin(point):skin
   this.pos.push(...point);this.normal.push(n?.getX(i)??0,n?.getY(i)??1,n?.getZ(i)??0)
   this.uv.push((cx*64+2.5+Math.max(0,Math.min(1,u?.getX(i)??.5))*59)/256,1-(cy*64+2.5+(1-Math.max(0,Math.min(1,u?.getY(i)??.5)))*59)/256)
   this.colors.push(c.r,c.g,c.b);this.indices.push(...s.indices);this.weights.push(...s.weights)
  }g.dispose();geometry.dispose()
 }
 box(size:GearPoint,point:GearPoint,tile:GearTile,color:string|number,bone:RetroBoneName,rot:GearPoint=[0,0,0]){
  this.add(new THREE.BoxGeometry(...size),tile,color,this.fit.rigid(bone),new THREE.Matrix4().compose(new THREE.Vector3(...point),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),new THREE.Vector3(1,1,1)))
 }
 oval(size:GearPoint,point:GearPoint,tile:GearTile,color:string|number,bone:RetroBoneName,segments=10){const g=new THREE.SphereGeometry(1,segments,6);g.scale(...size);g.translate(...point);this.add(g,tile,color,this.fit.rigid(bone))}
 tube(points:GearPoint[],radius:number,tile:GearTile,color:string|number,bone:RetroBoneName,sides=5){
  for(let i=1;i<points.length;i++){
   const a=new THREE.Vector3(...points[i-1]),b=new THREE.Vector3(...points[i]),d=b.clone().sub(a),g=new THREE.CylinderGeometry(radius,radius,d.length(),sides,1,false)
   g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));g.translate(...a.add(b).multiplyScalar(.5).toArray() as GearPoint);this.add(g,tile,color,this.fit.rigid(bone))
  }
 }
 ring(point:GearPoint,rx:number,ry:number,radius:number,tile:GearTile,color:string|number,bone:RetroBoneName,plane:'xy'|'xz'='xy',segments=12){const pts:GearPoint[]=[];for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2;pts.push(plane==='xy'?[point[0]+Math.cos(a)*rx,point[1]+Math.sin(a)*ry,point[2]]:[point[0]+Math.cos(a)*rx,point[1],point[2]+Math.sin(a)*ry])}this.tube(pts,radius,tile,color,bone,4)}
 /** Elliptical rings, including a tiny top ring: closed low-poly cap, no stacked cuboids. */
 loft(rings:{y:number;rx:number;rz:number;x?:number;z?:number}[],tile:GearTile,color:string|number,bone:RetroBoneName,n=12){
  const p:number[]=[],uv:number[]=[],idx:number[]=[]
  for(let j=0;j<rings.length;j++)for(let i=0;i<=n;i++){const a=i/n*Math.PI*2,r=rings[j];p.push((r.x??0)+Math.cos(a)*r.rx,r.y,(r.z??0)+Math.sin(a)*r.rz);uv.push(i/n,j/(rings.length-1))}
  for(let j=1;j<rings.length;j++)for(let i=0;i<n;i++){const a=(j-1)*(n+1)+i,b=j*(n+1)+i;idx.push(a,b,a+1,b,b+1,a+1)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();this.add(g,tile,color,this.fit.rigid(bone))
 }
 /** Garment patch samples the native shirt and inherits its exact skin weights. */
 patch(x0:number,x1:number,y0:number,y1:number,tile:GearTile,color:string|number,back=false,gap=.005,nx=4,ny=6){
  const p:number[]=[],uv:number[]=[],idx:number[]=[]
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const s=this.fit.surface(x0+(x1-x0)*i/nx,y0+(y1-y0)*j/ny,back,gap);p.push(...s.point);uv.push(i/nx,j/ny)}
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+nx+1;idx.push(a,a+1,b,b,a+1,b+1)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals()
  this.add(g,tile,color,point=>this.fit.surface(point[0],point[1],back,gap).skin)
 }
 /** Continuous apron skirt: interpolate the two thighs through the crotch gap. */
 skirt(width:number,tile:GearTile,color:string|number,bottom=.62,back=false){
  const p:number[]=[],uv:number[]=[],idx:number[]=[],nx=8,ny=8
  const sign=back?-1:1
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const y=bottom+(1.06-bottom)*j/ny,x=(i/nx-.5)*width*2,sampleX=y<.94&&Math.abs(x)<.065?(x<0?-.065:.065):x,z=this.fit.surface(sampleX,y,back).point[2]+sign*.018;p.push(x,y,z);uv.push(i/nx,j/ny)}
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+nx+1;idx.push(a,a+1,b,b,a+1,b+1)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals()
  this.add(g,tile,color,p=>{
   if(p[1]>=.94||Math.abs(p[0])>=.065)return this.fit.surface(p[0],p[1],back).skin
   const l=this.fit.surface(.065,p[1],back).skin,r=this.fit.surface(-.065,p[1],back).skin,t=THREE.MathUtils.smoothstep(p[0],-.065,.065),weights=new Map<number,number>()
   for(let i=0;i<4;i++){weights.set(l.indices[i],(weights.get(l.indices[i])??0)+l.weights[i]*t);weights.set(r.indices[i],(weights.get(r.indices[i])??0)+r.weights[i]*(1-t))}
   const sorted=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=sorted.reduce((s,v)=>s+v[1],0),skin={indices:[0,0,0,0],weights:[0,0,0,0]};sorted.forEach(([index,w],i)=>{skin.indices[i]=index;skin.weights[i]=w/sum});return skin
  })
 }
 strap(x0:number,y0:number,x1:number,y1:number,width:number,tile:GearTile,color:string|number,back=false){
  const steps=24,p:number[]=[],uv:number[]=[],idx:number[]=[]
  for(let i=0;i<=steps;i++){const t=i/steps;for(const side of [-1,1]){const s=this.fit.surface(x0+(x1-x0)*t+side*width*.5,y0+(y1-y0)*t,back,.014);p.push(...s.point);uv.push((side+1)/2,t)}}
  for(let i=0;i<steps;i++){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();this.add(g,tile,color,p=>this.fit.surface(p[0],p[1],back).skin)
 }
 geometry(){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(this.pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.normal,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(this.colors,3));g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(this.indices,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(this.weights,4));g.computeBoundingSphere();return g}
 finish(){if(!this.triangles)return null;const m=new THREE.SkinnedMesh(this.geometry(),gearMaterial());m.name='NPC fitted accessories';m.bind(this.fit.rig.mesh.skeleton,this.fit.rig.mesh.bindMatrix);m.frustumCulled=false;m.userData.npcGear=true;this.fit.rig.group.add(m);return m}
}
