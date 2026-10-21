import * as THREE from 'three'
import type {NpcState} from '../content/npcs'
import type {TradersDuty} from '../content/tradersFitout'
import {humanoidMotion} from './humanoidMotion'
import {applySeatedPose} from './seatedPlayer'
export function applyTradersNpcPose(root:THREE.Group,n:NpcState,duty:TradersDuty|undefined,time:number){
 if(!duty)return
 const motion=humanoidMotion(root);if(!motion)return
 const b=motion.rig.bones
 if(duty.seatHeight){
  let avatar=root.userData.tradersAvatar as THREE.Group|undefined
  if(!avatar){root.traverse(o=>{if(!avatar&&o.userData.retro)avatar=o as THREE.Group});root.userData.tradersAvatar=avatar}
  if(avatar)applySeatedPose(avatar,{blend:1,seatHeight:duty.seatHeight,relaxed:duty.activity==='sit',time,turn:Math.sin(time*.23+n.homeX)*.12})
  if(duty.activity==='desk'){b.spine.rotation.x=.10;b.head.rotation.x=.12;for(const side of ['L','R'] as const){b['upperArm'+side as 'upperArmL'].rotation.x=-.55;b['foreArm'+side as 'foreArmL'].rotation.x=-.86+Math.sin(time*3.5+(side==='L'?0:2))*.035}}
 }else if(duty.activity==='work'){b.upperArmL.rotation.x=-.52;b.foreArmL.rotation.x=-1.15;b.head.rotation.x=.05+Math.sin(time*.5)*.025}
 else if(duty.activity==='chat'){b.head.rotation.y=Math.sin(time*.4+n.homeX)*.14;b.foreArmR.rotation.x=-.18-Math.max(0,Math.sin(time*.7+n.homeY))*.28}
}
