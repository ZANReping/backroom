import * as THREE from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type {Structure} from '../core/types'
import {getMaterialMode,levelTexture,litMaterial,noiseTexture} from './shared'

type Parts=THREE.BufferGeometry[]
const V=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z)
function timber(){
 const tex=(suffix:string,data=false)=>{const t=levelTexture('l0-remake/door-wood'+suffix+'.png',()=>noiseTexture(data?'#8080ff':'#765739',data?'#8080ff':'#62472e'));t.colorSpace=data?THREE.NoColorSpace:THREE.SRGBColorSpace;return t}
 return litMaterial({map:tex(''),normalMap:tex('-normal',true),normalScale:new THREE.Vector2(.12,.12),roughnessMap:getMaterialMode()==='realistic'?tex('-rough',true):undefined,roughness:.77,envBase:.04,vertexColors:true})
}
function brass(){return litMaterial({color:'#a18c60',metalness:.7,roughness:.46,envBase:.08,vertexColors:true})}
function part(parts:Parts,g:THREE.BufferGeometry,x=0,y=0,z=0,shade=1){
 g.translate(x,y,z)
 const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv'),colors=new Float32Array(p.count*3)
 for(let i=0;i<p.count;i++){
  const top=Math.abs(n.getY(i))>.7
  uv.setXY(i,(Math.abs(n.getX(i))>.7?p.getZ(i):p.getX(i))*.6,(top?p.getZ(i):p.getY(i))*.6)
  colors.set([shade,shade,shade],i*3)
 }
 g.setAttribute('color',new THREE.BufferAttribute(colors,3))
 if(!g.index)g.setIndex(Array.from({length:p.count},(_,i)=>i))
 parts.push(g)
}
function box(p:Parts,w:number,h:number,d:number,x:number,y:number,z:number,shade=1,bevel=0){part(p,bevel?new RoundedBoxGeometry(w,h,d,1,bevel):new THREE.BoxGeometry(w,h,d),x,y,z,shade)}
function rod(p:Parts,a:THREE.Vector3,b:THREE.Vector3,r1:number,r2=r1,segments=8){const g=new THREE.CylinderGeometry(r2,r1,a.distanceTo(b),segments);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0,1,0),b.clone().sub(a).normalize()));part(p,g,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2)}
function tube(p:Parts,points:THREE.Vector3[],radius:number,segments=12){part(p,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),segments,radius,6,false))}
function flush(p:Parts,material:THREE.Material,root:THREE.Object3D,name:string){
 if(!p.length)return
 const geometry=mergeGeometries(p,false);p.forEach(g=>g.dispose())
 if(!geometry)throw Error('L0 furniture merge failed: '+name)
 const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh)
}
/** Framed recessed panel: outer bead, sloped reveal, lower inset field. */
function panel(p:Parts,x:number,y:number,z:number,w:number,h:number,side=1,arched=false){
 box(p,w,h,.012,x,y,z,.56)
 const border=.019,face=z+side*.012
 for(const sx of [-1,1])box(p,border,h,.023,x+sx*(w-border)/2,y,face,1,.005)
 for(const sy of [-1,1])box(p,w-.025,border,.023,x,y+sy*(h-border)/2,face,1,.005)
 box(p,w-.062,h-.062,.014,x,y,z+side*.007,.9,.009)
 if(arched){
  tube(p,[V(x-w*.35,y+h*.25,face+side*.007),V(x-w*.27,y+h*.37,face+side*.007),V(x,y+h*.40,face+side*.007),V(x+w*.27,y+h*.37,face+side*.007),V(x+w*.35,y+h*.25,face+side*.007)],.009,10)
 }
}

function door(s:Structure){
 const root=new THREE.Group(),wood=timber(),metal=brass(),frame:Parts=[],leaf:Parts=[],hardware:Parts=[]
 root.rotation.y=Number(s.data?.deg??0)*Math.PI/180;root.userData.swing=1
 for(const x of [-.508,.508]){
  box(frame,.044,2.225,.095,x,1.1125,-.44,.83,.005)
  box(frame,.012,2.225,.016,x,1.1125,-.493,1,.003)
 }
 box(frame,1.06,.048,.095,0,2.235,-.44,.83,.004)
 flush(frame,wood,root,'l0-door-jamb')
 // Right-hand hinge remains the existing animated interaction pivot.
 const pivot=new THREE.Group();pivot.position.set(.495,0,-.44);pivot.userData.lid=1;root.add(pivot)
 box(leaf,.99,2.21,.040,-.495,1.105,0,.80,.004)
 for(const x of [-.945,-.495,-.045])box(leaf,x===-.495?.058:.082,2.21,.070,x,1.105,0,1,.005)
 for(const [y,h]of [[.054,.108],[.805,.115],[1.52,.11],[2.16,.10]])box(leaf,.99,h,.070,-.495,y,0,1,.005)
 for(const side of [-1,1])for(const x of [-.72,-.27])for(const [y,h]of [[.43,.60],[1.17,.55],[1.845,.49]])panel(leaf,x,y,side*.023,.35,h,side)
 flush(leaf,wood,pivot,'l0-six-panel-door')
 for(const side of [-1,1]){
  const x=-.84,z=side*.047
  part(hardware,new THREE.SphereGeometry(.031,10,7).scale(1,1,.38),x,1.03,z)
  rod(hardware,V(x,1.03,z),V(x,1.03,side*.089),.010)
  part(hardware,new THREE.SphereGeometry(.027,10,7),x,1.03,side*.094)
  part(hardware,new THREE.SphereGeometry(.010,8,5).scale(.7,1.3,.28),x,.981,z)
 }
 for(const y of [.27,1.09,1.96]){
  rod(hardware,V(-.012,y-.042,.03),V(-.012,y+.042,.03),.010)
  box(hardware,.031,.075,.007,-.024,y,.029)
 }
 flush(hardware,metal,pivot,'l0-door-hardware')
 root.scale.set(Math.max(s.w,s.h)/1.06,2.13/2.27,1)
 return root
}

function chair(s:Structure){
 const root=new THREE.Group(),wood=timber(),parts:Parts=[]
 // Solid saddle seat with a rounded rectangular front and narrower back.
 const seat=new THREE.Shape();seat.moveTo(-.19,-.21);seat.quadraticCurveTo(-.25,-.20,-.25,-.12);seat.lineTo(-.24,.15);seat.quadraticCurveTo(-.20,.24,0,.235);seat.quadraticCurveTo(.20,.24,.24,.15);seat.lineTo(.25,-.12);seat.quadraticCurveTo(.25,-.20,.19,-.21);seat.closePath()
 const sg=new THREE.ExtrudeGeometry(seat,{depth:.034,steps:1,bevelEnabled:true,bevelSegments:1,bevelSize:.010,bevelThickness:.009,curveSegments:5});sg.rotateX(-Math.PI/2);part(parts,sg,0,.455,0)
 for(const x of [-1,1])for(const z of [-1,1]){
  const bottom=V(x*.205,.025,z*.178),top=V(x*.158,.455,z*.142)
  rod(parts,bottom,top,.017,.024)
  part(parts,new THREE.SphereGeometry(.026,8,5).scale(1,1.55,1),x*.18,.27,z*.16)
 }
 for(const x of [-.18,.18])rod(parts,V(x,.18,-.16),V(x,.18,.16),.012)
 rod(parts,V(-.18,.20,0),V(.18,.20,0),.014)
 for(const x of [-.20,.20])rod(parts,V(x,.47,-.17),V(x,.965,-.235),.021,.019)
 for(const x of [-.135,-.0675,0,.0675,.135])rod(parts,V(x,.48,-.18),V(x,1.036-Math.abs(x)*.08,-.253),.010,.013)
 tube(parts,[V(-.20,.94,-.235),V(-.15,1.014,-.252),V(0,1.045,-.27),V(.15,1.014,-.252),V(.20,.94,-.235)],.026)
 // Bent wooden arms, each held by a turned front support.
 for(const sign of [-1,1]){
  tube(parts,[V(sign*.20,.80,-.225),V(sign*.255,.746,-.12),V(sign*.26,.73,.08),V(sign*.23,.724,.14)],.022,10)
  rod(parts,V(sign*.20,.48,.105),V(sign*.244,.728,.10),.015,.017)
 }
 flush(parts,wood,root,'l0-windsor-chair')
 root.rotation.y=Number(s.data?.deg??0)*Math.PI/180
 if(s.data?.fallen){
  const heading=new THREE.Quaternion().setFromAxisAngle(V(0,1,0),Number(s.data?.deg??0)*Math.PI/180)
  const tilt=new THREE.Quaternion().setFromAxisAngle(V(0,0,1),Number(s.data?.roll??90)*Math.PI/180)
  root.quaternion.copy(heading.multiply(tilt));root.updateMatrixWorld(true)
  root.position.y=-new THREE.Box3().setFromObject(root).min.y+.002
 }else root.scale.y=1.17
 return root
}

function cabinet(s:Structure){
 const root=new THREE.Group(),wood=timber(),metal=brass(),parts:Parts=[]
 root.rotation.y=Math.PI
 // Actual cabinet interior; opening its doors reveals shelves, not a solid cylinder.
 for(const [r,h,y]of [[.63,.040,.940],[.615,.022,.909],[.585,.023,.887],[.55,.048,.098],[.51,.025,.129],[.51,.024,.48]]){
  const g=new THREE.CylinderGeometry(r,r,h,8);g.rotateY(Math.PI/8);part(parts,g,0,y,0)
 }
 for(let i=1;i<8;i++){
  const angle=i*Math.PI/4,side:Parts=[]
  box(side,.399,.725,.027,0,.507,.495,.78)
  panel(side,0,.52,.513,.36,.62,1,true)
  for(const g of side){g.rotateY(angle);parts.push(g)}
 }
 for(const x of [-.38,.38])for(const z of [-.37,.37])box(parts,.10,.10,.10,x,.051,z,.9,.012)
 flush(parts,wood,root,'l0-octagonal-cabinet')
 // Double leaves span the front octagon face; each owns one animation pivot.
 for(const sign of [-1,1]){
  const pivot=new THREE.Group();pivot.position.set(sign*.198,.158,.504);pivot.userData={lid:1,part:sign<0?'doorL':'doorR'}
  const p:Parts=[],hardware:Parts=[],cx=-sign*.098
  box(p,.195,.688,.026,cx,.344,0,.82,.003);panel(p,cx,.344,.019,.177,.65,1,true)
  flush(p,wood,pivot,'l0-cabinet-leaf')
  part(hardware,new THREE.SphereGeometry(.012,8,6),-sign*.174,.397,.051)
  rod(hardware,V(-sign*.174,.397,.02),V(-sign*.174,.397,.05),.005)
  for(const y of [.10,.57])rod(hardware,V(0,y-.025,.02),V(0,y+.025,.02),.007)
  flush(hardware,metal,pivot,'l0-cabinet-hardware');root.add(pivot)
 }
 if(s.looted)root.userData.open=1
 return root
}

/** Only the new L0 furnishings are routed here; existing interaction metadata survives. */
export function buildL0Furniture(s:Structure):THREE.Group|null{
 const model=s.kind==='hoteldoor'&&s.data?.l0Door?door(s):s.kind==='table'&&s.data?.l0Furniture&&s.data?.chair?chair(s):s.kind==='dresser'&&s.data?.l0Furniture&&s.data?.manilaTable?cabinet(s):null
 if(model){model.position.x=s.x+s.w/2;model.position.z=s.y+s.h/2;model.userData.l0Furniture=true}
 return model
}
