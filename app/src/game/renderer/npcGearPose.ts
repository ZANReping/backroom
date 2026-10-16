import * as THREE from 'three'
import type {RetroNpc} from './retroNpc'

/** Two-bone hand contact for the existing guitar animation; scratch data is private to each rig. */
class GuitarHands {
 private shoulder=new THREE.Vector3();private elbow=new THREE.Vector3();private wrist=new THREE.Vector3()
 private target=new THREE.Vector3();private direction=new THREE.Vector3();private bend=new THREE.Vector3();private offset=new THREE.Vector3()
 private axis=new THREE.Vector3();private origin=new THREE.Vector3();private scale=new THREE.Vector3()
 private worldQ=new THREE.Quaternion();private guitarQ=new THREE.Quaternion();private handQ=new THREE.Quaternion()
 private upperOld=new THREE.Quaternion();private foreOld=new THREE.Quaternion();private handOld=new THREE.Quaternion()
 private parentQ=new THREE.Quaternion();private aimQ=new THREE.Quaternion();private turnQ=new THREE.Quaternion()
 private aim(bone:THREE.Bone,child:THREE.Bone,target:THREE.Vector3){
  bone.getWorldPosition(this.origin);this.direction.subVectors(target,this.origin).normalize()
  this.axis.copy(child.position).normalize();this.aimQ.setFromUnitVectors(this.axis,this.direction)
  bone.parent!.getWorldQuaternion(this.parentQ);bone.quaternion.copy(this.parentQ.invert()).multiply(this.aimQ)
  bone.updateWorldMatrix(false,true)
 }
 update(rig:RetroNpc,guitar:THREE.Object3D,k:number,time:number){
  if(k<=0)return
  rig.group.updateWorldMatrix(true,true);guitar.getWorldQuaternion(this.guitarQ);rig.group.getWorldQuaternion(this.worldQ);rig.group.getWorldScale(this.scale)
  for(const side of ['L','R'] as const){
   const sign=side==='L'?1:-1,upper=rig.bones[`upperArm${side}`],fore=rig.bones[`foreArm${side}`],hand=rig.bones[`hand${side}`]
   this.upperOld.copy(upper.quaternion);this.foreOld.copy(fore.quaternion);this.handOld.copy(hand.quaternion)
   this.turnQ.setFromAxisAngle(this.axis.set(0,1,0),sign*Math.PI/2);this.handQ.copy(this.guitarQ).multiply(this.turnQ)
   this.target.set(...(side==='L'?[.024,-.035+Math.sin(time*8.8)*.016,.041]:[0,.30,.027]) as [number,number,number]);guitar.localToWorld(this.target)
   this.offset.set(-sign*.021,-.05,.008).multiply(this.scale).applyQuaternion(this.handQ);this.target.sub(this.offset)
   upper.getWorldPosition(this.shoulder);fore.getWorldPosition(this.elbow);hand.getWorldPosition(this.wrist)
   const a=this.shoulder.distanceTo(this.elbow),b=this.elbow.distanceTo(this.wrist)
   this.direction.subVectors(this.target,this.shoulder);const distance=THREE.MathUtils.clamp(this.direction.length(),Math.abs(a-b)+.001,a+b-.001);this.direction.normalize()
   const along=(a*a-b*b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a*a-along*along))
   this.bend.set(sign,0,-.5).applyQuaternion(this.worldQ);this.bend.addScaledVector(this.direction,-this.bend.dot(this.direction)).normalize()
   this.elbow.copy(this.shoulder).addScaledVector(this.direction,along).addScaledVector(this.bend,height)
   this.wrist.copy(this.shoulder).addScaledVector(this.direction,distance)
   this.aim(upper,fore,this.elbow);this.aim(fore,hand,this.wrist)
   hand.parent!.getWorldQuaternion(this.parentQ);hand.quaternion.copy(this.parentQ.invert()).multiply(this.handQ)
   this.aimQ.copy(upper.quaternion);upper.quaternion.copy(this.upperOld).slerp(this.aimQ,k)
   this.aimQ.copy(fore.quaternion);fore.quaternion.copy(this.foreOld).slerp(this.aimQ,k)
   this.aimQ.copy(hand.quaternion);hand.quaternion.copy(this.handOld).slerp(this.aimQ,k)
   upper.updateWorldMatrix(false,true)
  }
 }
}
const poses=new WeakMap<RetroNpc,GuitarHands>()
export function poseNpcGuitarHands(rig:RetroNpc,guitar:THREE.Object3D,k:number,time:number){
 let pose=poses.get(rig);if(!pose){pose=new GuitarHands();poses.set(rig,pose)}pose.update(rig,guitar,k,time)
}
