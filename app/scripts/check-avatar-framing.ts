import assert from 'node:assert/strict'
import * as THREE from 'three'
import {NPCS,npcAvatar} from '../src/game/content/npcs'
import {buildCharacterModel} from '../src/game/renderer/characterModel'
import {avatarFrame} from '../src/game/renderer/avatarFraming'
import {disposeCharacterModel} from '../src/game/renderer/retroResources'
let checks=0
for(const id of ['tom','aiko','kat','kowalski','nightingale','morel','bluebird','amelia','smith','dorothy','alpha_melody']){
 const d=NPCS[id],m=buildCharacterModel(npcAvatar(d),{npcId:id,npcDef:d,driven:true}),camera=new THREE.PerspectiveCamera(36,1/1.45,.01,20),rig=m.userData.retro
 for(const angle of [0,.6]){
  m.position.set(4,.2,-2);m.rotation.y=angle
  const head=avatarFrame(m,camera,'head'),body=avatarFrame(m,camera,'body');assert(head.distance<body.distance,id+' head framing is closer');checks++
  camera.position.copy(head.target).add(new THREE.Vector3(0,0,head.distance));camera.lookAt(head.target);camera.updateMatrixWorld(true)
  for(const y of [rig.headFrame.chinY,rig.headFrame.topY]){
   const p=rig.bones.head.localToWorld(new THREE.Vector3(0,y,rig.headFrame.faceZ)).project(camera);assert(Math.abs(p.x)<.98&&Math.abs(p.y)<.98,id+' face fits photograph');checks++
  }
  const spine=rig.bones.spine.getWorldPosition(new THREE.Vector3()).project(camera);assert(spine.y < -1,id+' lower torso excluded from head photograph');checks++
  camera.position.copy(body.target).add(new THREE.Vector3(0,0,body.distance));camera.lookAt(body.target);camera.updateMatrixWorld(true)
  const box=new THREE.Box3().setFromObject(m)
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
   const p=new THREE.Vector3(x,y,z).project(camera);assert(Math.abs(p.x)<=1&&Math.abs(p.y)<=1,id+' body fits full preview');checks++
  }
 }
 disposeCharacterModel(m)
}
console.log(`Avatar framing: ${checks} checks passed`)
