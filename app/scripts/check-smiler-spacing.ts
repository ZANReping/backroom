import assert from 'node:assert/strict'
import * as THREE from 'three'
import { makeEntity } from '../src/game/entities'
import { SMILER_KINDS, type SmilerKind } from '../src/game/entities/smilers'
import { SMILER_STOP, greatCeilingBend, greatWalkFactor, greatPoseHeight, GREAT_MAX_BEND, GREAT_WAIST } from '../src/game/entities/smilerPose'
import { beginSmilerFrame, initSmiler, updateSmiler } from '../src/game/engine/smilerAI'
import { buildSmilerMesh, animateSmiler, type SmilerRig } from '../src/game/renderer/smilerMesh'
import { smilerHeadroom } from '../src/game/world/smilerClearance'
import type { GameMap } from '../src/game/world/mapgen'

function map(): GameMap {
  const z = () => new Uint8Array(1024)
  return { w:32,h:32,tiles:z().fill(1),structures:[],items:[],lights:[],exits:[],entities:[],spawn:{x:16,y:16},
    wet:z(),elev:z(),outdoor:z(),step:z(),crawl:z(),ceiling:z(),up:z(),upWall:z(),up2:z(),upWall2:z(),stair:new Int32Array(1024),
    liquid:z(),seaFloor:new Float32Array(1024),floors:1,dn:z(),dnWall:z(),tint:z() }
}
const kinds = Object.keys(SMILER_KINDS) as SmilerKind[]
let count = 0
function check(v: unknown, msg: string) { assert(v, msg); count++ }
function world(kind: SmilerKind, roof = Infinity) {
  const m = map(); if (!Number.isFinite(roof)) m.outdoor.fill(1)
  const e = makeEntity('smiler', 22, 16, 0, kind)
  const eng: any = {
    map:m, levelDef:{id:3,gen:'pipes'}, player:{x:16,y:16,z:0,hp:1000,stamina:100,sanity:100,slowT:0},
    projectiles:[],input:{sprint:false},dev:{},camShake:0,hurt:0,
    msg(){},los:()=>true,lookingAt:()=>false,viewAngle:()=>0,entityWalkH:()=>0,
    wanderTarget(){},faceToward(e:any,x:number,y:number){e.facing=Math.atan2(y-e.y,x-e.x)},
    stepEntity(e:any,speed:number,dt:number){const a=Math.atan2(e.targetY-e.y,e.targetX-e.x); e.x+=Math.cos(a)*speed*dt;e.y+=Math.sin(a)*speed*dt;e.facing=a;return false},
    meleeZOk:()=>true,hurtPlayer(n:number){this.hurt+=n},
  }
  m.entities.push(e); initSmiler(eng,e,kind,1,false); e.facing=Math.PI;e.sm!.phase='pounce'; e.sm!.aware=10
  const step = (dt:number) => { e.attackCd-=dt;beginSmilerFrame(eng,dt,false);updateSmiler(eng,e,dt,Math.hypot(e.x-16,e.y-16),1,true) }
  return {eng,e,step}
}
for (const kind of kinds) for (const dt of [1/60,1/30,.1]) {
  const {eng,e,step}=world(kind)
  for(let t=0;t<2.5;t+=dt){step(dt);check(Math.hypot(e.x-16,e.y-16)>=SMILER_STOP[kind]-1e-6, `${kind}/${dt}: pounce cannot enter face clearance`)}
  check(eng.hurt>0,`${kind}: still damages at the new stop distance`)
  const hurt=eng.hurt;e.sm!.strikeT=.01;eng.los=()=>false;step(dt)
  check(eng.hurt===hurt,`${kind}: wall blocks pending hit`)
  eng.los=()=>true;e.x=16+SMILER_STOP[kind]+1;e.sm!.strikeT=.01;step(dt)
  check(eng.hurt===hurt,`${kind}: escaping the wind-up avoids damage`)
  e.x=16+.5;e.sm!.phase='pounce';step(dt)
  check(e.x>16+.5 && Math.cos(e.facing)<-.9,`${kind}: yields space without turning its back`)
}

// Real mesh positions projected through a first-person camera, including maximum open grin.
const v = new THREE.Vector3(), box = new THREE.Box3(),ray = new THREE.Raycaster()
for(const kind of kinds) for(const eye of [1.0,1.55]) for(const fov of [60,75]) for(const roof of [2.5,2.7,3.25,Infinity]) for(const age of [.24,.38]) {
  const e=makeEntity('smiler',0,0,0,kind),g=buildSmilerMesh(kind,17)
  initSmiler(world(kind).eng,e,kind,1,false);e.state='attack';e.sm!.phase='pounce';e.sm!.grin=1;e.sm!.strikeAge=age
  g.scale.setScalar(e.def.scale??1)
  const camera=new THREE.PerspectiveCamera(fov,16/10,.08,100)
  camera.position.set(SMILER_STOP[kind],eye,0);camera.lookAt(0,eye,0);camera.updateMatrixWorld()
  for(let i=0;i<120;i++)animateSmiler(g,e,i/60,0,{headroom:roof,eyeAboveFeet:eye,distance:SMILER_STOP[kind],dt:1/60})
  const rig=g.userData.smilerRig as SmilerRig
  // Exclude the intentional blink when testing body occlusion of open eyes.
  rig.eyes.scale.y=1;g.updateMatrixWorld(true);box.makeEmpty()
  for(const mesh of [rig.eyes,rig.upper,rig.lower]) {
    const pos=mesh.geometry.getAttribute('position')
    for(let i=0;i<pos.count;i++)box.expandByPoint(v.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld).project(camera))
    let visible=0,total=0
    for(let i=0;i<pos.count;i+=8){
      v.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld).sub(camera.position).normalize()
      ray.set(camera.position,v)
      if(ray.intersectObject(g,true)[0]?.object===mesh)visible++
      total++
    }
    // Back-facing tooth vertices can be hidden by the other row / mouth at a low angle.
    // Eyes must actually remain visible, not merely project inside the viewport.
    if(mesh===rig.eyes)check(visible/total>.25,`${kind}/${roof} eye=${eye} age=${age}: eyes remain outside body (${visible}/${total})`)
  }
  check(box.min.x>-.94&&box.max.x<.94&&box.min.y>-.94&&box.max.y<.94&&box.max.z<1,
    `${kind} eye=${eye} fov=${fov} age=${age}: complete face in frame ${JSON.stringify(box)}`)
  if(kind==='great')check(box.setFromObject(g,true).max.y+.2<=roof,`attacking giant keeps head below ${roof} roof`)
}

// Low ceilings, open air, upstairs underside, and predictive roof sampling.
const m=map()
check(smilerHeadroom(m,16,16,0,0,2.7)===2.7,'ordinary ceiling')
m.outdoor.fill(1)
check(smilerHeadroom(m,16,16,0,0,2.7)===Infinity,'open air remains upright')
m.outdoor[16*32+17]=0
check(smilerHeadroom(m,16,16,0,0,2.7)===2.7,'detect lower roof before upper body enters')
m.outdoor.fill(0);m.up.fill(1)
check(smilerHeadroom(m,16,16,0,0,4.5)===2.65,'actual upper-floor underside')
check(Math.abs(smilerHeadroom(m,16,16,3,0,4.5)-2.6)<1e-6,'upper-floor headroom is relative to feet')
for(const roof of [2.5,2.7,3.25,4.5,Infinity]) for(let seed=0;seed<24;seed++) {
  const e=makeEntity('smiler',0,0,0,'great'),g=buildSmilerMesh('great',seed),scale=e.def.scale!
  g.scale.setScalar(scale);e.state='wander'
  animateSmiler(g,e,0,0,{headroom:roof,eyeAboveFeet:1.55,distance:10,dt:1/60});g.updateMatrixWorld(true)
  box.setFromObject(g,true)
  check(box.max.y+.2<=roof,`giant seed=${seed} roof=${roof}: silhouette + flame margin below roof (${box.max.y})`)
  const rig=g.userData.smilerRig as SmilerRig
  check(roof>=4.5 ? rig.bend===0 : rig.bend!>.5,'only bend under low ceiling')
  for(const part of rig.bentGeometry!) {
    const pos=part.geometry.getAttribute('position')
    for(let i=0;i<pos.count;i++)if(part.rest[i*3+1]<=GREAT_WAIST)check(Math.abs(pos.getY(i)-part.rest[i*3+1])<1e-6,'lower body stays planted')
  }
  for(let i=0;i<120;i++)animateSmiler(g,e,i/60,0,{headroom:Infinity,eyeAboveFeet:1.55,distance:10,dt:1/60})
  check(rig.bend!<.001,'smooth return to standing in open air')
}
const low=world('great',2.7),open=world('great')
low.step(.1);open.step(.1)
const ratio=(22-low.e.x)/(22-open.e.x)
check(ratio>.8&&ratio<.95,`low roof slows walking modestly: ${ratio}`)
check(greatWalkFactor(0)===1&&Math.abs(greatWalkFactor(GREAT_MAX_BEND)-.82)<1e-9,'no speed penalty while upright')
check(greatCeilingBend(Infinity,1.65)===0&&greatPoseHeight(0,1.65)>3.25,'roof query considers horns and black flame')
console.log(`Smiler spacing / ceiling / face projection: ${count} assertions passed`)
