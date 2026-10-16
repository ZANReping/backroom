import * as THREE from 'three'
import type {RetroNpc,RetroBoneName} from './retroNpc'

export type GearPoint = [number,number,number]
export type GearSkin = {indices:number[]; weights:number[]}
export type GearSurface = {point:GearPoint; skin:GearSkin}
/** Fit against the actual bind mesh, never the currently animated bones or old block proportions. */
export class NpcGearFit {
 readonly rig:RetroNpc
 readonly bind=new Map<string,THREE.Vector3>()
 readonly boneIndex=new Map<string,number>()
 private faces:{a:THREE.Vector3;b:THREE.Vector3;c:THREE.Vector3;ia:number;ib:number;ic:number}[]=[]
 readonly samples:{x:number;y:number;z:number;gap:number}[]=[]
 constructor(root:THREE.Object3D){
  this.rig=root.userData.retro
  const skeleton=this.rig.mesh.skeleton
  skeleton.bones.forEach((b,i)=>{this.boneIndex.set(b.name,i);this.bind.set(b.name,new THREE.Vector3().setFromMatrixPosition(skeleton.boneInverses[i].clone().invert()))})
  const g=this.rig.mesh.geometry,p=g.attributes.position,si=g.attributes.skinIndex,sw=g.attributes.skinWeight
  const bodyBones=new Set(['hips','spine','chest','neck','clavicleL','clavicleR'].map(n=>this.boneIndex.get(n)))
  for(const group of g.groups){if(group.materialIndex!==0)continue
   for(let j=group.start;j<group.start+group.count;j+=3){const ids=[0,1,2].map(k=>g.index?g.index.getX(j+k):j+k),v=ids.map(i=>new THREE.Vector3().fromBufferAttribute(p,i))
    // Only the garment torso, excluding hanging sleeves which would incorrectly catch a strap ray.
    // Keep triangles crossing the fitting window: a shoulder triangle can extend
    // beyond it while still containing the strap sample near the neck.
    if(v.every(q=>q.y<.45)||v.every(q=>q.y>1.54)||v.every(q=>q.x<-.24)||v.every(q=>q.x>.24))continue
    let bodyWeight=0;for(const index of ids)for(let k=0;k<4;k++)if(bodyBones.has(si.getComponent(index,k)))bodyWeight+=sw.getComponent(index,k)
    if(bodyWeight<1.4&&v.some(q=>q.y>.98))continue
    this.faces.push({a:v[0],b:v[1],c:v[2],ia:ids[0],ib:ids[1],ic:ids[2]})
   }
  }
 }
 rigid(name:RetroBoneName):GearSkin{return {indices:[this.boneIndex.get(name)!,0,0,0],weights:[1,0,0,0]}}
 point(name:RetroBoneName,offset:GearPoint=[0,0,0]):GearPoint{const b=this.bind.get(name)!;return [b.x+offset[0],b.y+offset[1],b.z+offset[2]]}
 hand(side:'left'|'right'='left'){const bone:RetroBoneName=side==='left'?'handR':'handL';return {bone,point:this.point(bone,[side==='left'?.021:-.021,-.05,.008])}}
 halfWidth(y:number){
  let width=0;for(const f of this.faces){const v=[f.a,f.b,f.c];for(let i=0;i<3;i++){const a=v[i],b=v[(i+1)%3];if((a.y-y)*(b.y-y)>0||Math.abs(a.y-b.y)<1e-6)continue;const t=(y-a.y)/(b.y-a.y);width=Math.max(width,Math.abs(a.x+(b.x-a.x)*t))}}
  return width||.13
 }
 shoulderHeight(x:number,z:number){
  const ray=new THREE.Ray(new THREE.Vector3(x,1.6,z),new THREE.Vector3(0,-1,0)),hit=new THREE.Vector3();let y=1.34
  for(const f of this.faces)if(ray.intersectTriangle(f.a,f.b,f.c,false,hit)&&hit.y>y&&hit.y<1.49)y=hit.y
  return y
 }
 grip(side:'left'|'right'){
  const {bone}=this.hand(side),index=this.boneIndex.get(bone)!,bind=this.bind.get(bone)!,sign=side==='left'?-1:1,g=this.rig.mesh.geometry,p=g.attributes.position,si=g.attributes.skinIndex,sw=g.attributes.skinWeight
  for(let i=0;i<p.count;i++){
   if(si.getX(i)!==index||sw.getX(i)<.99)continue
   const y=p.getY(i),root=bind.y-.056
   if(y<root){const angle=Math.min(2.55,(root-y)/.066*2.55);p.setY(i,root-Math.sin(angle)*.024);p.setX(i,p.getX(i)-sign*(1-Math.cos(angle))*.024)}
  }p.needsUpdate=true
 }
 surface(x:number,y:number,back=false,gap=.005):GearSurface{
  const ray=new THREE.Ray(new THREE.Vector3(x,y,back?-1:1),new THREE.Vector3(0,0,back?1:-1)),target=new THREE.Vector3()
  let hit:THREE.Vector3|undefined,face:typeof this.faces[number]|undefined,dist=Infinity
  for(const f of this.faces){const h=ray.intersectTriangle(f.a,f.b,f.c,false,target);if(h&&ray.origin.distanceToSquared(h)<dist){dist=ray.origin.distanceToSquared(h);hit=h.clone();face=f}}
  if(!hit||!face){return {point:[x,y,(back?-1:1)*(.09+gap)],skin:this.rigid(y<1.04?'hips':y<1.23?'spine':'chest')}}
  const bary=new THREE.Vector3();THREE.Triangle.getBarycoord(hit,face.a,face.b,face.c,bary)
  const si=this.rig.mesh.geometry.attributes.skinIndex,sw=this.rig.mesh.geometry.attributes.skinWeight,weights=new Map<number,number>()
  ;[face.ia,face.ib,face.ic].forEach((index,k)=>{for(let j=0;j<4;j++){const bone=si.getComponent(index,j),w=sw.getComponent(index,j)*bary.getComponent(k);weights.set(bone,(weights.get(bone)??0)+w)}})
  const sorted=[...weights.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=sorted.reduce((s,v)=>s+v[1],0)
  const skin={indices:[0,0,0,0],weights:[0,0,0,0]};sorted.forEach((v,i)=>{skin.indices[i]=v[0];skin.weights[i]=v[1]/sum})
  const z=hit.z+(back?-gap:gap);this.samples.push({x,y,z,gap})
  return {point:[x,y,z],skin}
 }
 /** A cap encloses the crown; tuck only the covered hair, preserving sideburns and hanging tails. */
 tuckHair(baseY:number,topY:number,rx:number,rz:number,centerZ:number){
  const g=this.rig.mesh.geometry,p=g.attributes.position
  for(const group of g.groups){if(group.materialIndex!==4)continue
   for(let j=group.start;j<group.start+group.count;j++){const i=g.index?g.index.getX(j):j,y=p.getY(i);if(y<=baseY)continue
    const t=Math.min(1,(y-baseY)/Math.max(.01,topY-baseY)),r=Math.max(.23,Math.sqrt(1-t*t))*.94
    const x=p.getX(i),z=p.getZ(i)-centerZ,q=Math.sqrt((x/rx)**2+(z/rz)**2)
    if(q>r){p.setX(i,x*r/q);p.setZ(i,centerZ+z*r/q)}p.setY(i,Math.min(y,topY-.004))
   }
  }p.needsUpdate=true;g.computeBoundingSphere()
 }
}
