import * as THREE from 'three'
import { makeEntity } from '../src/game/entities'
import { initSmiler, beginSmilerFrame, updateSmiler } from '../src/game/engine/smilerAI'
import { SMILER_STOP } from '../src/game/entities/smilerPose'
import type { SmilerKind } from '../src/game/entities/smilers'
import { smilerHeadroom } from '../src/game/world/smilerClearance'

/** Production renderer and AI; isolated save storage is supplied by l0-remake.html. */
export async function verifySmilerSpacing(qa:any) {
  await qa.scene(3);await qa.warm();qa.hide()
  const {eng,r,look}=qa,p=eng.player
  let m=eng.map
  eng.map.entities=[];eng.player.hotbar.fill(null);eng.player.flashlight=true
  const wait=()=>new Promise(resolve=>setTimeout(resolve,900))
  const walk=(x:number,y:number)=>eng.entityWalkH(m,Math.floor(x),Math.floor(y),0)
  function placement(high:boolean,dist:number) {
    for(let y=4.5;y<m.h-4;y+=2)for(let x=4.5;x<m.w-4;x+=2)for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]) {
      const ex=x+Math.cos(a)*dist,ey=y+Math.sin(a)*dist
      if(walk(x,y)!==0||walk(ex,ey)!==0||!eng.los(x,y,ex,ey))continue
      let safe=true
      for(let t=0;t<=dist;t+=.25)if(walk(x+Math.cos(a)*t,y+Math.sin(a)*t)!==0){safe=false;break}
      if(!safe)continue
      const roof=smilerHeadroom(m,ex,ey,0,a+Math.PI,r.wallH)
      if(high ? roof<4.5 : roof<2.7||roof>3.3)continue
      return {x,y,ex,ey,a,roof}
    }
    throw Error('No '+(high?'high':'low')+' ceiling placement')
  }
  const results:any[]=[]
  async function show(kind:SmilerKind,high=false,far=false,simulate=false) {
    if(high){if(!eng.devGotoVariant('genhall'))throw Error('No generation hall');m=eng.map;m.entities=[];await qa.warm()}
    const point=placement(high,simulate?6:far?6:SMILER_STOP[kind])
    Object.assign(p,{x:point.x,y:point.y,z:0,floor:0});eng.camShake=0
    look.yaw=Math.atan2(-Math.cos(point.a),-Math.sin(point.a));look.pitch=0;look.roll=0;r.setFov(60)
    const e=makeEntity('smiler',point.ex,point.ey,0,kind);initSmiler(eng,e,kind,1,false)
    e.facing=point.a+Math.PI;e.state=far?'wander':'attack';e.sm!.phase=far?'drift':'pounce';e.sm!.grin=1;e.sm!.glow=1;e.sm!.vis=1;e.sm!.aware=10
    m.entities=[e]
    let hitCount=0
    if(simulate){
      const original=eng.hurtPlayer;eng.hurtPlayer=()=>{hitCount++}
      const dt=1/60
      try{for(let i=0;i<240;i++){e.attackCd-=dt;beginSmilerFrame(eng,dt,false);updateSmiler(eng,e,dt,Math.hypot(e.x-p.x,e.y-p.y),1,true)}}finally{eng.hurtPlayer=original}
      if(!hitCount)throw Error(`${kind}: production movement did not complete an attack ${JSON.stringify({point,x:e.x,y:e.y,phase:e.sm?.phase,dist:Math.hypot(e.x-p.x,e.y-p.y),facing:e.facing,z:e.z})}`)
    }
    await qa.warm();await wait();eng.camShake=0
    const g=r.entityMeshes.get(e.id),rig=g?.userData.smilerRig
    if(!rig)throw Error('No production rig')
    const bounds=new THREE.Box3(),v=new THREE.Vector3()
    for(const mesh of [rig.eyes,rig.upper,rig.lower]){const pos=mesh.geometry.getAttribute('position');for(let i=0;i<pos.count;i++)bounds.expandByPoint(v.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld).project(r.camera))}
    if(!far&&(bounds.min.x<-.98||bounds.max.x>.98||bounds.min.y<-.98||bounds.max.y>.98||bounds.max.z>1))throw Error(`${kind}: face clipped ${JSON.stringify(bounds)}`)
    if(kind==='great'&&(far&&high?rig.bend>.01:rig.bend<.5))throw Error('Unexpected giant bend')
    const data={kind,high,far,simulate,hitCount,distance:Math.hypot(e.x-p.x,e.y-p.y),roof:point.roof,bend:rig.bend,faceNDC:bounds,placement:point,stats:qa.stats()}
    results.push(data);return data
  }
  async function recycle(){
    const memory=[]
    for(let i=0;i<3;i++){
      const e=makeEntity('smiler',p.x+3.4,p.y,0,'great');initSmiler(eng,e,'great',1,false);m.entities=[e];await wait()
      m.entities=[];await qa.warm();memory.push({...r.three.info.memory,programs:r.three.info.programs.length})
    }
    if(memory.some(a=>JSON.stringify(a)!==JSON.stringify(memory[0])))throw Error('Resource growth '+JSON.stringify(memory))
    return memory
  }
  ;(window as any).smilerSpacingQa={show,recycle,results}
  return {ready:true}
}
