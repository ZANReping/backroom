import assert from 'node:assert/strict'
import * as THREE from 'three'
import { makeEntity } from '../src/game/entities'
import { beginSmilerFrame, initSmiler, updateSmiler } from '../src/game/engine/smilerAI'
import { SMILER_KINDS, type SmilerKind } from '../src/game/entities/smilers'
import { SMILER_STOP, SMILER_STRIKE, smilerReach, smilerStrikePose } from '../src/game/entities/smilerPose'
import { buildSmilerMesh, animateSmiler, type SmilerRig } from '../src/game/renderer/smilerMesh'

const kinds = Object.keys(SMILER_KINDS) as SmilerKind[]
let count = 0
const check = (condition: unknown, message: string) => { assert(condition, message); count++ }

// Keep the contract explicit: the five variants share one short, readable swing.
check(kinds.length === 5, `expected five smiler kinds, got ${kinds.length}`)
for (const kind of kinds) {
  check(smilerReach(kind) === SMILER_STOP[kind] + .12, `${kind}: reach is stop + .12`)
  check(smilerReach(kind) > SMILER_STOP[kind], `${kind}: reach is outside the approach stop`)
}
check(SMILER_STRIKE.windup === .28, 'windup is .28s')
check(SMILER_STRIKE.hitAt === .38, 'impact is .38s')
check(SMILER_STRIKE.duration === .74, 'recovery continues through .74s')
check(SMILER_STRIKE.hitAt > SMILER_STRIKE.windup, 'impact follows windup')
check(smilerStrikePose(undefined).charge === 0 && smilerStrikePose(undefined).thrust === 0, 'idle pose is neutral')
check(smilerStrikePose(SMILER_STRIKE.duration).charge === 0 && smilerStrikePose(SMILER_STRIKE.duration).jaw === 0, 'recovery end returns to neutral')

// Sample all mesh rigs at rest, windup, impact and recovery. This catches a
// connected pose implementation that changes only its state flag or jaw text.
const poseSnapshot = (g: THREE.Group) => {
  const out: number[] = []
  g.traverse(o => {
    if (o === g) return
    out.push(o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.scale.x, o.scale.y, o.scale.z)
  })
  return out
}
const distance = (a: number[], b: number[]) => a.reduce((n, v, i) => n + Math.abs(v - b[i]), 0)
for (const kind of kinds) {
  const e = makeEntity('smiler', 0, 0, 0, kind)
  const g = buildSmilerMesh(kind, 31)
  const ages: Array<number | undefined> = [undefined, .12, SMILER_STRIKE.hitAt, .6, SMILER_STRIKE.duration]
  const snaps: number[][] = []
  for (const age of ages) {
    e.sm = { kind, phase: 'pounce', strikeAge: age === SMILER_STRIKE.duration ? undefined : age, grin: 1, vis: 1, glow: 1 } as any
    e.state = age === undefined || age === SMILER_STRIKE.duration ? 'wander' : 'attack'
    animateSmiler(g, e, 0, 0)
    snaps.push(poseSnapshot(g))
  }
  check(distance(snaps[0], snaps[1]) > 1e-4, `${kind}: windup changes rig pose`)
  check(distance(snaps[1], snaps[2]) > 1e-4, `${kind}: impact changes rig pose`)
  check(distance(snaps[2], snaps[3]) > 1e-4, `${kind}: recovery changes rig pose`)
  check(distance(snaps[0], snaps[4]) < 1e-5, `${kind}: completed strike returns pose to neutral`)
  const rig = g.userData.smilerRig as SmilerRig
  check(!!rig.limbs.length && !!rig.face, `${kind}: strike rig has limbs and face`) 
  e.sm!.strikeAge=SMILER_STRIKE.hitAt;e.state='attack'
  animateSmiler(g,e,Math.PI/(2*.7)-e.id*1.7,0)
  check(rig.eyes.scale.y===1,`${kind}: eyes remain readable during the strike even at the idle blink phase`)
}

// Production AI on a clear plane. Pin movement to isolate damage boundaries;
// check-smiler-spacing and browser QA cover actual approach/collision movement.
function world(kind: SmilerKind, distance = SMILER_STOP[kind]) {
  const z = () => new Uint8Array(1024)
  const map: any = { w:32,h:32,tiles:z().fill(1),structures:[],items:[],lights:[],exits:[],entities:[],spawn:{x:16,y:16},
    wet:z(),elev:z(),outdoor:z().fill(1),step:z(),crawl:z(),ceiling:z(),up:z(),upWall:z(),up2:z(),upWall2:z(),stair:new Int32Array(1024),
    liquid:z(),seaFloor:new Float32Array(1024),floors:1,dn:z(),dnWall:z(),tint:z() }
  let elapsed = 0
  const hits: { time:number; damage:number }[] = []
  const eng:any = { map,levelDef:{id:3,gen:'pipes'},player:{x:16,y:16,z:0,hp:1000,stamina:100,sanity:100,slowT:0},
    projectiles:[],input:{sprint:false},dev:{},camShake:0,
    msg(){},los:()=>true,lookingAt:()=>false,viewAngle:()=>0,entityWalkH:()=>0,
    wanderTarget(){},faceToward(e:any,x:number,y:number){e.facing=Math.atan2(y-e.y,x-e.x)},
    stepEntity:()=>false,meleeZOk:()=>true,hurtPlayer(damage:number){hits.push({time:elapsed,damage})},
  }
  const e=makeEntity('smiler',16+distance,16,0,kind)
  initSmiler(eng,e,kind,1,false);map.entities=[e];e.facing=Math.PI;e.sm!.phase='pounce';e.sm!.aware=10
  const step=(dt:number)=>{elapsed+=dt;e.attackCd-=dt;beginSmilerFrame(eng,dt,false);updateSmiler(eng,e,dt,Math.hypot(e.x-16,e.y-16),1,true)}
  return {eng,e,step,hits,time:()=>elapsed}
}
for(const kind of kinds)for(const dt of [1/120,1/60,1/30,.1]){
  const w=world(kind);w.step(dt);const started=w.time()
  check(w.e.sm!.strikeAge===0&&w.e.sm!.strikeT===SMILER_STRIKE.hitAt,`${kind}/${dt}: AI starts complete strike clock`)
  while(w.time()-started<SMILER_STRIKE.duration+dt) {
    w.step(dt)
    if(w.time()-started<SMILER_STRIKE.hitAt-1e-7)check(w.hits.length===0,`${kind}/${dt}: no damage before impact`)
    if(w.time()-started>SMILER_STRIKE.hitAt+dt&&w.time()-started<SMILER_STRIKE.duration-1e-7)
      check(w.e.sm!.strikeAge!==undefined&&w.e.sm!.strikeT===undefined,`${kind}/${dt}: recovery persists after hit`)
  }
  check(w.hits.length===1,`${kind}/${dt}: one hit per swing`)
  check(w.hits[0].time-started>=SMILER_STRIKE.hitAt-1e-7&&w.hits[0].time-started<=SMILER_STRIKE.hitAt+dt+1e-7,`${kind}/${dt}: damage synchronized to animation`)
  check(w.hits[0].damage===SMILER_KINDS[kind].damage,`${kind}: damage value unchanged`)
  check(w.e.sm!.strikeAge===undefined,`${kind}: recovery finished`)
  const far=world(kind,smilerReach(kind)+.001)
  for(let t=0;t<1;t+=dt)far.step(dt)
  check(far.hits.length===0&&far.e.sm!.strikeAge===undefined,`${kind}: cannot begin attack beyond reach`)
}
for(const kind of kinds)for(const cancel of ['evade','wall','height','invisible','stun','retreat']) {
  const w=world(kind);w.step(.01);w.step(.2)
  if(cancel==='evade')w.e.x=16+smilerReach(kind)+.01
  if(cancel==='wall')w.eng.los=()=>false
  if(cancel==='height')w.eng.meleeZOk=()=>false
  if(cancel==='invisible')w.eng.dev.invisible=true
  if(cancel==='stun'){w.e.stunT=2;w.e.sm!.phase='stagger'}
  if(cancel==='retreat'){w.e.sm!.phase='retreat';w.e.sm!.aware=0}
  for(let t=0;t<.6;t+=.01)w.step(.01)
  check(w.hits.length===0,`${kind}: ${cancel} during windup prevents damage`)
}

console.log(`Smiler strike distance / timing / animation: ${count} assertions passed`)
