import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import * as THREE from 'three'
import {NPCS,npcAvatar} from '../src/game/content/npcs'
import {L11_PEOPLE} from '../src/game/content/l11People'
import {buildCharacterModel} from '../src/game/renderer/characterModel'
import {buildAvatarModel,POOL_META} from '../src/game/renderer/retroAvatar'
import {NAMED_FACE_EYES,namedFaceMeta} from '../src/game/renderer/retroFaceAlignment'
import {RETRO_NAMED_FACE_IDS} from '../src/game/renderer/retroNamedFaces'
import {disposeCharacterModel} from '../src/game/renderer/retroResources'
import type {RetroNpc} from '../src/game/renderer/retroNpc'
import {DEFAULT_AVATAR} from '../src/game/core/avatar'

const baseline=process.argv.includes('--baseline'),root='reports/npc-face-alignment',folder=`${root}/${baseline?'before':'after'}`
mkdirSync(folder,{recursive:true})
let checks=0;const ok=(v:unknown,message:string)=>{assert(v,message);checks++}
const defs=new Map([...Object.values(NPCS),...L11_PEOPLE].map(d=>[d.id,d]))
/** Locate a photographed pupil through the production mesh's UV triangles. */
function pupilOnMesh(rig:RetroNpc,u:number,v:number){
 const mesh=rig.mesh,geometry=mesh.geometry,uv=geometry.attributes.uv,position=geometry.attributes.position
 const group=geometry.groups.find(g=>g.materialIndex===1)!,target=new THREE.Vector3(u,1-v,0),bary=new THREE.Vector3()
 for(let i=group.start;i<group.start+Math.min(group.count,252);i+=3){
  const points=[0,1,2].map(j=>new THREE.Vector3(uv.getX(i+j),uv.getY(i+j),0))
  THREE.Triangle.getBarycoord(target,...points as [THREE.Vector3,THREE.Vector3,THREE.Vector3],bary)
  if(Math.min(bary.x,bary.y,bary.z)<-1e-5)continue
  const world=new THREE.Vector3();for(let j=0;j<3;j++){
   const vertex=new THREE.Vector3().fromBufferAttribute(position,i+j);mesh.applyBoneTransform(i+j,vertex);world.addScaledVector(mesh.localToWorld(vertex),bary.getComponent(j))
  }return world
 }
 throw Error('Pupil is outside the production facial surface')
}
ok(Object.keys(NAMED_FACE_EYES).sort().join() === [...RETRO_NAMED_FACE_IDS].sort().join(),'Calibration covers exactly the named faces')
const priorPath=`${root}/before/uv-metrics.json`,prior=!baseline&&existsSync(priorPath)?JSON.parse(readFileSync(priorPath,'utf8')):undefined
const rows=[]
for(const [id,eyes] of Object.entries(NAMED_FACE_EYES)){
 const def=defs.get(id)!;ok(!!def,'Registered NPC '+id)
 const model=buildCharacterModel(npcAvatar(def),{npcId:id,npcDef:def,driven:true}),rig=model.userData.retro as RetroNpc
 model.updateMatrixWorld(true);rig.mesh.skeleton.update()
 const left=rig.bones.head.worldToLocal(pupilOnMesh(rig,eyes[0],eyes[1])),right=rig.bones.head.worldToLocal(pupilOnMesh(rig,eyes[2],eyes[3]))
 const rollDegrees=Math.atan2(right.y-left.y,right.x-left.x)*180/Math.PI,centerError=Math.abs((left.x+right.x)/2)
 const eyeHeightError=Math.abs((left.y+right.y)/2-rig.headFrame.eyeY)
 ok(Array.from(rig.mesh.geometry.attributes.uv.array).every(n=>Number.isFinite(n)&&n>=0&&n<=1),'Bounded finite UV '+id)
 if(!baseline){
  ok(Math.abs(rollDegrees)<.05,`Level eye line ${id}: ${rollDegrees}°`);ok(centerError<.0001,`Eyes centered on head ${id}: ${centerError}m`);ok(eyeHeightError<.002,`Photo eyes match mesh eye sockets ${id}: ${eyeHeightError}m`)
  if(prior){const before=prior.rows.find((r:{id:string})=>r.id===id);ok(before.triangles===rig.diagnostics.triangles&&before.draws===rig.diagnostics.drawCalls,'Unchanged geometry and draw budget '+id)}
 }
 rows.push({id,rollDegrees,centerError,eyeHeightError,triangles:rig.diagnostics.triangles,draws:rig.diagnostics.drawCalls})
 disposeCharacterModel(model)
}
ok(namedFaceMeta('unregistered',POOL_META)===POOL_META,'Unknown IDs preserve pool UVs')
const normal=buildAvatarModel(DEFAULT_AVATAR),unknown=buildAvatarModel(DEFAULT_AVATAR,{faceId:'unregistered'})
ok(Array.from(normal.userData.retro.mesh.geometry.attributes.uv.array).join()===Array.from(unknown.userData.retro.mesh.geometry.attributes.uv.array).join(),'Player and unknown NPC mapping unchanged')
disposeCharacterModel(normal);disposeCharacterModel(unknown)
const result={checks,named:rows.length,maxRollDegrees:Math.max(...rows.map(r=>Math.abs(r.rollDegrees))),maxCenterError:Math.max(...rows.map(r=>r.centerError)),maxEyeHeightError:Math.max(...rows.map(r=>r.eyeHeightError)),rows}
writeFileSync(`${folder}/uv-metrics.json`,JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify({...result,rows:undefined}))
