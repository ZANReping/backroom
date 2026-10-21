import * as THREE from 'three'
import {verifyTradersDressing} from './traders-dressing.js'
export async function inspectTradersDressing(qa){
 const {renderer:r}=qa,view=await verifyTradersDressing(qa,{labels:['tray-return']}),shots=view.shots
 const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true}
 const rays=[]
 for(const [x,y] of [[159,12],[165,42],[180,12],[286,12],[320,12],[434,12],[480,12],[960,12]]){
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x/1920*2-1,1-y/1080*2),r.camera)
  rays.push({pixel:[x,y],hits:ray.intersectObject(r.scene,true).filter(h=>visible(h.object)&&!h.object.userData.colliderProxy).slice(0,2).map(h=>{const o=h.object,g=o.geometry,indices=[h.face.a,h.face.b,h.face.c];return {point:h.point.toArray(),distance:h.distance,normal:h.face.normal.toArray(),material:o.material?.name,userData:o.material?.userData,parents:[o,o.parent,o.parent?.parent].filter(Boolean).map(p=>({name:p.name,data:p.userData})),vertices:indices.map(i=>new THREE.Vector3().fromBufferAttribute(g.attributes.position,i).applyMatrix4(o.matrixWorld).toArray()),light:indices.map(i=>g.attributes.tradersLight?[g.attributes.tradersLight.getX(i),g.attributes.tradersLight.getY(i),g.attributes.tradersLight.getZ(i)]:null)}})})
 }
 const draw=async()=>{for(let i=0;i<3;i++){await new Promise(requestAnimationFrame);r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},1/60)}}
 const normal=new THREE.MeshNormalMaterial();r.scene.overrideMaterial=normal;r.three.render(r.scene,r.camera);shots.push({label:'tray-normals',png:r.three.domElement.toDataURL('image/png')});r.scene.overrideMaterial=null;normal.dispose()
 return{ok:true,rays,shots}
}
