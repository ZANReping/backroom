import * as THREE from 'three'
import type {RetroNpc} from './retroNpc'

export type AvatarFocus = 'head' | 'body'
export type AvatarFrame = {target:THREE.Vector3;distance:number}
/** Fit world-space anatomy and hats without changing the model's pose. */
export function avatarFrame(model:THREE.Object3D,camera:THREE.PerspectiveCamera,focus:AvatarFocus):AvatarFrame {
 model.updateMatrixWorld(true)
 const bounds=new THREE.Box3(),point=new THREE.Vector3(),rig=model.userData.retro as RetroNpc|undefined
 if(focus==='head'&&rig){
  const index=rig.mesh.skeleton.bones.indexOf(rig.bones.head)
  model.traverse(o=>{
   const mesh=o as THREE.SkinnedMesh;if(!mesh.isSkinnedMesh||mesh.skeleton!==rig.mesh.skeleton)return
   mesh.skeleton.update();const p=mesh.geometry.attributes.position,si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight
   for(let i=0;i<p.count;i++){
    let weight=0;for(let j=0;j<4;j++)if(si.getComponent(i,j)===index)weight+=sw.getComponent(i,j)
    if(weight<.6)continue
    point.fromBufferAttribute(p,i);mesh.applyBoneTransform(i,point);mesh.localToWorld(point);bounds.expandByPoint(point)
   }
  })
  bounds.min.y=Math.min(bounds.min.y,rig.bones.clavicleL.getWorldPosition(point).y-.045)
 }else{
  bounds.setFromObject(model)
  if(focus==='head'&&!bounds.isEmpty())bounds.min.y+=bounds.getSize(point).y*.62
 }
 if(bounds.isEmpty())bounds.set(new THREE.Vector3(-.25,0,-.12),new THREE.Vector3(.25,1.8,.12))
 const size=bounds.getSize(new THREE.Vector3()),target=bounds.getCenter(new THREE.Vector3())
 const height=size.y*(focus==='head'?1.12:1.08),width=size.x*(focus==='head'?1.4:1.12)
 const halfFov=Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))
 return {target,distance:Math.max(height/(2*halfFov),width/(2*halfFov*camera.aspect))+size.z*.5}
}
