import * as THREE from 'three'
import type { Engine } from '../engine'
import { getAvatar } from '../core/avatar'
import { buildAvatarModel } from './retroAvatar'
import type { RetroNpc } from './retroNpc'
import { applySeatedPose } from './seatedPlayer'
import { look } from './shared'

/** A complete production avatar is visible only to the reflection camera.
 * Uses the same face, clothes and equipment as the avatar editor / seated body. */
export class MirrorPlayer {
  readonly root = new THREE.Group()
  model: THREE.Group|null = null
  private signature = ''
  constructor(){this.root.name='Local mirror avatar';this.root.visible=false}
  prepare(engine: Engine) {
    const p=engine.player,cfg=getAvatar(),ev={gloves:p.hasGloves,suit:p.hasSuit,cavingsuit:p.equip.body?.type==='cavingsuit',divemask:p.equip.head?.type==='divemask',headlamp:p.equip.head?.type==='headlamp',nightvision:p.equip.head?.type==='nightvision'}
    const signature=JSON.stringify([cfg,ev])
    if(this.model&&signature===this.signature)return
    this.clearModel();this.model=buildAvatarModel(cfg,{ev,driven:true});this.signature=signature
    this.root.add(this.model)
    this.model.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.isMesh){mesh.castShadow=false;mesh.receiveShadow=true}})
  }
  show(engine: Engine, time: number): ()=>void {
    this.prepare(engine)
    const p=engine.player,model=this.model!,rig=model.userData.retro as RetroNpc
    this.root.position.set(p.x,p.z,p.y);this.root.rotation.set(0,Math.PI+look.yaw,0)
    rig.update(time)
    for(const bone of Object.values(rig.bones)){bone.position.copy(bone.userData.bind as THREE.Vector3);bone.rotation.set(0,0,0);bone.scale.set(1,1,1)}
    if(engine.seating){
      const s=engine.seating;this.root.rotation.y=s.anchor.yaw
      applySeatedPose(model,{blend:s.blend,seatHeight:s.anchor.z-p.z,relaxed:s.anchor.relaxed,time,turn:Math.atan2(Math.sin(look.yaw-s.anchor.yaw-Math.PI),Math.cos(look.yaw-s.anchor.yaw-Math.PI)),pitch:look.pitch})
    }else{
      const b=rig.bones,walk=Math.min(1,engine.mv.speed/2.5),swing=Math.sin(engine.mv.stride*Math.PI)*.42*walk
      b.head.rotation.x=-look.pitch*.6
      b.thighL.rotation.x=swing;b.thighR.rotation.x=-swing
      b.shinL.rotation.x=Math.max(0,-swing)*.8;b.shinR.rotation.x=Math.max(0,swing)*.8
      b.upperArmL.rotation.x=-swing*.6;b.upperArmR.rotation.x=swing*.6
      if(p.crouching){
        b.hips.position.y-=.43/rig.group.scale.y;b.spine.rotation.x=.17
        for(const side of ['L','R'] as const){b[`thigh${side}`].rotation.x-=.85;b[`shin${side}`].rotation.x+=1.65;b[`foot${side}`].rotation.x-=.8}
      }
      if(!engine.handsStowed){b.upperArmR.rotation.x=-.6;b.foreArmR.rotation.x=-.75}
    }
    this.root.visible=!engine.over
    this.root.updateMatrixWorld(true);rig.mesh.skeleton.update()
    return()=>{this.root.visible=false}
  }
  private clearModel(){if(this.model){(this.model.userData.retro as RetroNpc).dispose();this.model.removeFromParent();this.model=null}}
  dispose(){this.clearModel();this.root.removeFromParent();this.signature=''}
}
