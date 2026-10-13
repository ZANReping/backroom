import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createCanvas } from '@napi-rs/canvas'
import { makeEntity, type Entity } from '../src/game/entities'
import { beginHoundFrame, initHound, houndHear, updateHound } from '../src/game/engine/houndAI'
import { buildEntityMesh } from '../src/game/renderer/entitiesMesh'
import { animateHound } from '../src/game/renderer/houndMesh'

function world(level=2) {
  const messages:string[]=[]
  const eng:any={levelDef:{id:level},map:{entities:[] as Entity[],items:[],inf:{ox:0,oy:0}},
    player:{x:0,y:0,z:0,hp:100,sanity:100,stamina:100,slowT:0,crouching:false},input:{sprint:false},dev:{},
    playerNoiseT:0,camShake:0,hurt:0,gaze:false,angle:Math.PI,projectiles:[],
    msg(t:string){messages.push(t)},los:()=>true,lookingAt(){return this.gaze},viewAngle(){return this.angle},
    wanderTarget(e:Entity){e.targetX=e.x+3;e.targetY=e.y;e.stateT=4},entityWalkH:()=>0,
    stepEntity(e:Entity,sp:number,dt:number){const a=Math.atan2(e.targetY-e.y,e.targetX-e.x);e.x+=Math.cos(a)*sp*dt;e.y+=Math.sin(a)*sp*dt;return false},
    faceToward(e:Entity,x:number,y:number){e.facing=Math.atan2(y-e.y,x-e.x)},meleeZOk:()=>true,
    hurtPlayer(d:number){this.hurt+=d},
  }
  function spawn(x=5,y=0,z=0,init=true){const e=makeEntity('hound',x,y,z);eng.map.entities.push(e);if(init)initHound(eng,e);return e}
  function step(dt=1/30){beginHoundFrame(eng,dt);for(const e of eng.map.entities){e.attackCd-=dt;e.stateT-=dt;updateHound(eng,e,dt,Math.hypot(e.x-eng.player.x,e.y-eng.player.y),1,level===3)}}
  return {eng,spawn,step,messages}
}
{
 const {eng,spawn,step}=world(11),e=spawn(4,0,0,false),q=spawn(6,1,0,false),upper=spawn(6,1,3,false)
 e.hp-=5;step()
 assert.equal(e.hd?.neutral,false,'damage before first AI tick still provokes')
 assert(e.provoked&&q.provoked&&!q.hd?.neutral,'uninitialized nearby peer retaliates')
 assert(upper.hd?.neutral,'upper floor does not join a local provocation')
 e.hd=undefined;initHound(eng,e);assert.equal(e.hd.neutral,false,'reinitialization respects provocation')
}
for(const block of ['wall','floor','invisible','gaze']){
 const {eng,spawn,step}=world(3),e=spawn(1)
 e.hd!.howled=true;e.hd!.phase='charge';e.hd!.strikeT=.01
 if(block==='wall')eng.los=()=>false
 if(block==='floor')eng.player.z=3
 if(block==='invisible')eng.dev.invisible=true
 if(block==='gaze')eng.gaze=true
 step();assert.equal(eng.hurt,0,`${block} cancels a pending pounce`)
}
{
 const {eng,spawn,step}=world(11),e=spawn(5),q=spawn(18,0,0,false)
 for(let i=0;i<180;i++)step()
 assert.equal(eng.hurt,0);assert(e.hd!.sit>.9)
 eng.gaze=true;for(let i=0;i<100;i++)step()
 const x=e.x;step();assert(e.x>x&&e.hd!.lookAwayT!>0,'neutral look-away lasts beyond one tick')
 assert.equal(q.provoked,undefined)
}
{
 const {eng,spawn,step,messages}=world(),e=spawn(5)
 eng.gaze=true;e.hd!.howled=true;e.hd!.phase='stalk';step()
 assert.equal(e.hd!.phase,'cower');eng.input.sprint=true
 for(let i=0;i<3;i++){eng.map.inf.ox+=32;eng.player.x-=32;e.x-=32;step()}
 assert(!messages.some(m=>m.includes('转身就跑')),'stream recenter is not sprinting')
 eng.gaze=false;eng.los=()=>false;e.hd!.phase='roam'
 houndHear(eng,e,e.x+3,e.y,12,false)
 const wx=e.hd!.lastX;eng.map.inf.ox+=32;eng.player.x-=32;e.x-=32;step()
 assert.equal(e.targetX+eng.map.inf.ox,wx,'heard target keeps its world position')
}
{
 const a=world(),b=world();a.spawn(5);b.spawn(5);a.step();b.step()
 assert(a.messages.some(m=>m.includes('嚎叫'))&&b.messages.some(m=>m.includes('嚎叫')),'engines have independent announcements')
 a.eng.map={entities:[],items:[],inf:{ox:0,oy:0}};a.messages.length=0;a.spawn(5);a.step()
 assert(a.messages.some(m=>m.includes('嚎叫')),'new map resets perception')
}
{
 const {eng,spawn,step}=world(3),e=spawn(5);eng.gaze=true;eng.angle=0
 step();assert.equal(e.state,'idle','L3 begins in ambush')
 eng.gaze=false;eng.angle=Math.PI;step();assert.equal(e.hd!.phase,'charge','turned back wakes L3 ambush')
 eng.gaze=true;for(let i=0;i<240;i++)step()
 assert.equal(e.hd!.phase,'cower','L3 gaze has no timeout')
 const x=e.x;step();assert.equal(e.x,x,'L3 gaze completely stops movement')
 eng.gaze=false;step();assert.notEqual(e.hd!.phase,'cower','L3 resumes when gaze breaks')
}

// Canvas textures in Node, so the UV / alpha / sharing assertions cover the browser path.
Object.assign(globalThis,{document:{createElement:()=>createCanvas(256,256)}})
const a=buildEntityMesh('hound',{seed:42}),b=buildEntityMesh('hound',{seed:42,houndNeutral:true})
const objects=(g:THREE.Group)=>{const ms:THREE.Mesh[]=[];g.traverse(o=>{if((o as THREE.Mesh).isMesh)ms.push(o as THREE.Mesh)});return ms}
const am=objects(a),bm=objects(b),ag=new Set(am.map(m=>m.geometry)),bg=new Set(bm.map(m=>m.geometry))
let triangles=0
for(const m of am){
 for(const name of ['position','normal','uv']){const attr=m.geometry.getAttribute(name);assert(attr,`${name} required`);for(const value of attr.array)assert(Number.isFinite(value),`${name} finite`)}
 triangles+=(m.geometry.index?.count??m.geometry.getAttribute('position').count)/3
 assert(!bg.has(m.geometry),'instances own geometry')
 assert(!bm.some(other=>other.material===m.material),'instances own materials')
}
assert(am.length<=26,'bounded mesh count');assert(triangles<20000,'bounded triangle count')
const maps=(meshes:THREE.Mesh[])=>new Set(meshes.flatMap(m=>{const mat=m.material as THREE.MeshLambertMaterial;return mat.map?[mat.map]:[]}))
const textures=maps(am);assert.equal(textures.size,2);assert.deepEqual(maps(bm),textures,'cached skin and hair textures shared')
const hair=[...textures].find(t=>!t.flipY)!;assert(hair);assert.equal(hair.wrapS,THREE.RepeatWrapping)
const cv=hair.image as ReturnType<typeof createCanvas>,rgba=cv.getContext('2d').getImageData(0,0,256,256).data
assert(rgba[3]===255&&rgba[(255*256)*4+3]===0,'roots opaque, ends cut out')
let disposedTextures=0;for(const t of textures)t.addEventListener('dispose',()=>disposedTextures++)
for(const g of ag)g.dispose();for(const mat of new Set(am.map(m=>m.material as THREE.Material)))mat.dispose()
assert.equal(disposedTextures,0,'releasing one instance retains shared textures')
const {eng,spawn}=world(11),e=spawn();void eng
for(const phase of ['roam','howl','cower','sit','charge'] as const){
 Object.assign(e.hd!,{phase,crouch:phase==='cower'?1:0,howlPose:phase==='howl'?1:0,sit:phase==='sit'?1:0,jaw:.7,wag:1})
 e.state=phase==='cower'?'stunned':phase==='charge'?'chase':'wander'
 for(let i=0;i<24;i++){
  e.animT=i/12;animateHound(b,e,i/24,3);b.updateMatrixWorld(true);for(const m of bm)assert(m.matrixWorld.elements.every(Number.isFinite))
  if(phase==='cower'||phase==='sit'||phase==='howl')for(const leg of b.userData.houndRig.legs){
   let bottom=Infinity
   leg.knee.traverse((m:THREE.Mesh)=>{if(!m.isMesh)return;const p=m.geometry.getAttribute('position'),v=new THREE.Vector3();for(let n=0;n<p.count;n++){v.fromBufferAttribute(p,n).applyMatrix4(m.matrixWorld);bottom=Math.min(bottom,v.y)}})
   assert(bottom>=2.97&&bottom<=3.09,`${phase}: paws stay near floor (${bottom})`)
  }
 }
}
// Also run the actual engine dispatch, combat hook and developer spawn entry.
const memory = new Map<string,string>()
Object.assign(globalThis,{
 window:{addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})},
 localStorage:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)},
})
const {Engine}=await import('../src/game/engine')
const {look}=await import('../src/game/core/renderer3d')
const {FLOOR_H}=await import('../src/game/world/mapgen')
const runtime=new Engine(),zero=()=>new Uint8Array(1024)
runtime.map={w:32,h:32,tiles:zero().fill(1),structures:[],items:[],lights:[],exits:[],entities:[],spawn:{x:16,y:16},
 wet:zero(),elev:zero(),outdoor:zero(),step:zero(),crawl:zero(),ceiling:zero(),up:zero(),upWall:zero(),up2:zero(),upWall2:zero(),stair:new Int32Array(1024),
 liquid:zero(),seaFloor:new Float32Array(1024),floors:1,dn:zero(),dnWall:zero(),tint:zero()}
const m=runtime.map,p=runtime.player
Object.assign(p,{level:11,x:16.5,y:16.5,z:0,floor:0,hp:100})
runtime.dev.frozenAI=true
assert(runtime.devSpawnEntity('hound'))
assert(m.entities[0].hd?.neutral,'frozen developer spawn immediately selects city variant')
assert.equal(m.entities[0].def.name,'中立猎犬')
m.up.fill(1);p.floor=1;p.z=FLOOR_H
assert(runtime.devSpawnEntity('hound'));assert.equal(m.entities.at(-1)!.z,FLOOR_H)
m.up.fill(0);p.floor=0;p.z=0;m.entities=[]
const victim=makeEntity('hound',19.5,16.5),peer=makeEntity('hound',21.5,16.5)
m.entities=[victim,peer];victim.hp=0;runtime.killCheck(victim)
assert(victim.dead&&peer.provoked&&!peer.hd!.neutral,'lethal first hit still provokes nearby peers')
const injured=makeEntity('hound',21.5,16.5);m.entities=[injured];injured.hp-=1;runtime.killCheck(injured)
runtime.dev.frozenAI=false;runtime.updateEntities(1/30,1)
assert.equal(injured.hd!.phase,'howl','nonlethal provocation keeps its first howl')
runtime.dev.frozenAI=false;m.entities=[makeEntity('hound',21.5,16.5)]
for(let i=0;i<120;i++)runtime.updateEntities(1/30,1)
assert(m.entities[0].hd!.neutral&&p.hp===100,'real Level 11 dispatch stays peaceful')
p.level=2;look.yaw=Math.PI/2;m.entities=[makeEntity('hound',19,16.5)]
for(let i=0;i<150;i++)runtime.updateEntities(1/30,1)
assert(p.hp<100&&p.slowT>0,'real dispatch completes damaging pounce')
p.hp=100;m.entities=[makeEntity('hound',19.5,16.5)]
for(let y=0;y<32;y++)m.tiles[y*32+18]=0
for(let i=0;i<180;i++)runtime.updateEntities(1/30,1)
assert.equal(p.hp,100,'actual wall blocks damage')
assert(m.entities[0].x>18.5,'actual collision keeps hound on its side of wall')
m.tiles.fill(1);Object.assign(p,{level:3,x:16.5,y:16.5,z:0,hp:100});m.entities=[makeEntity('hound',21.5,16.5)]
look.yaw=Math.PI/2;p.facing=Math.PI;runtime.updateEntities(1/30,1)
assert.equal(m.entities[0].hd!.phase,'charge','real L3 dispatch wakes ambush')
look.yaw=-Math.PI/2
for(let i=0;i<240;i++)runtime.updateEntities(1/30,1)
assert.equal(m.entities[0].hd!.phase,'cower','real L3 dispatch keeps gaze freeze')
look.yaw=Math.PI/2;runtime.updateEntities(1/30,1)
assert.notEqual(m.entities[0].hd!.phase,'cower','real L3 dispatch resumes after gaze')
console.log(JSON.stringify({integration:'passed',productionGameplay:'passed',meshes:am.length,triangles,sharedTextures:textures.size},null,2))
