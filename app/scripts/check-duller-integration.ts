import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createCanvas } from '@napi-rs/canvas'
import { makeEntity } from '../src/game/entities'
import { initDuller, dullerControlsPlayer, dullerSafePosition, dullerAlmondScent } from '../src/game/engine/dullerAI'
import { canOccupy } from '../src/game/core/player'
import { FLOOR_H } from '../src/game/world/mapgen'
import { buildEntityMesh } from '../src/game/renderer/entitiesMesh'
import { animateDuller } from '../src/game/renderer/dullerMesh'

const memory=new Map<string,string>()
Object.assign(globalThis,{
 document:{createElement:()=>createCanvas(256,256)},
 window:{addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})},
 localStorage:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)},
})
const {Engine}=await import('../src/game/engine')
const {look}=await import('../src/game/core/renderer3d')
let checks=0
const ok=(v:unknown,message:string)=>{assert(v,message);checks++}
function world(thin=false,upper=false){
 const eng=new Engine(),zero=()=>new Uint8Array(1024)
 eng.map={w:32,h:32,tiles:zero().fill(1),structures:[],items:[],lights:[],exits:[],entities:[],spawn:{x:16,y:16},
  wet:zero(),elev:zero(),outdoor:zero(),step:zero(),crawl:zero(),ceiling:zero(),up:zero(),upWall:zero(),up2:zero(),upWall2:zero(),stair:new Int32Array(1024),
  liquid:zero(),seaFloor:new Float32Array(1024),floors:upper?2:1,dn:zero(),dnWall:zero(),tint:zero()}
 const m=eng.map,p=eng.player,z=upper?FLOOR_H:0
 Object.assign(p,{level:2,x:16.5,y:16.5,z,floor:upper?1:0,hp:100,sanity:100,facing:Math.PI})
 p.hotbar.fill(null);p.backpack.fill(null)
 if(upper)m.up.fill(1)
 if(thin)m.structures.push({id:1,kind:'pillar',x:17.4,y:1,w:.16,h:30,solid:true,floor:upper?1:0,data:{l0Wall:1,bottom:0,top:2.8}} as any)
 else for(let y=0;y<32;y++){if(upper){m.up[y*32+17]=0;m.upWall[y*32+17]=1}else m.tiles[y*32+17]=0}
 look.yaw=Math.PI/2;look.pitch=0
 const spawn=(x=20,y=16.5)=>{const e=makeEntity('duller',x,y,z);m.entities.push(e);initDuller(eng,e,'canned');return e}
 const tick=()=>eng.updateEntities(1/30,1)
 const until=(test:()=>boolean,n=450)=>{for(let i=0;i<n&&!test();i++)tick();ok(test(),'expected AI phase reached '+JSON.stringify({thin,upper,p:[p.x,p.y,p.z],e:m.entities.map(e=>({x:e.x,y:e.y,z:e.z,dl:e.dl}))}))}
 return {eng,m,p,spawn,tick,until}
}
for(const thin of [false,true])for(const upper of [false,true]){
 const {eng,m,p,spawn,tick,until}=world(thin,upper),e=spawn(),phases=new Set<string>()
 until(()=>e.dl!.phase==='drag')
 const z=p.z,from=p.x,wall=e.dl!.wallX
 for(let i=0;i<14;i++)tick()
 const before={x:p.x,y:p.y,z:p.z};eng.input.mx=1
 eng.updateMovement(1/30,{dmg:1,drain:1},false)
 ok(p.x===before.x&&p.y===before.y&&p.z===before.z,'drag owns movement and gravity')
 const snap=eng.snapshot()
 ok(snap.player.x===from&&p.x!==from,'mid-wall snapshot uses safe endpoint without moving live player')
 ok(canOccupy(m,snap.player.x,snap.player.y,undefined,{z,band:p.floor}),'snapshot body clearance')
 ok(e.dl!.wallX===wall,'wall stain remains on entry face')
 for(let i=0;i<110;i++){phases.add(e.dl!.phase);tick()}
 ok(phases.has('hold')&&phases.has('flee')&&p.x>17.8,'production dispatch crosses and releases')
 ok(p.z===z&&canOccupy(m,p.x,p.y,undefined,{z,band:p.floor}),'safe landing on original floor')
 ok(p.hp<100&&p.hp>0,'real combat causes bounded damage')
}
for(const interrupt of ['damage','kill','drink','freeze','remove','floor','dead'] as const){
 const {eng,m,p,spawn,tick,until}=world(),e=spawn()
 until(()=>e.dl!.phase==='drag');for(let i=0;i<13;i++)tick()
 if(interrupt==='damage'){e.hp-=1;eng.killCheck(e)}
 if(interrupt==='kill'){e.hp=0;eng.killCheck(e);eng.killCheck(e)}
 if(interrupt==='drink'){eng.addItem('almond');const i=p.hotbar.findIndex(s=>s?.type==='almond');eng.useSlot('hotbar',i);eng.updateItemUse(10)}
 if(interrupt==='freeze')eng.dev.frozenAI=true
 if(interrupt==='remove')m.entities=[]
 if(interrupt==='floor')p.z=FLOOR_H
 if(interrupt==='dead')eng.die('test')
 ok(!dullerControlsPlayer(eng),`${interrupt}: releases control`)
 if(interrupt==='floor')ok(p.z===FLOOR_H,'external floor change is not undone')
 else ok(p.x===16.5&&canOccupy(m,p.x,p.y),'interruption restores clear source position')
 if(interrupt==='kill')ok(m.items.filter(i=>i.type==='canned').length===1,'fatal interrupt drops exactly once')
}
{
 const {eng,m,p,spawn,until,tick}=world(),e=spawn()
 until(()=>e.dl!.phase==='hold')
 m.tiles[Math.floor(p.y)*m.w+Math.floor(p.x)]=0;tick()
 ok(!dullerControlsPlayer(eng)&&canOccupy(m,p.x,p.y),'closing landing geometry releases to nearby clear ground')
}
{
 const {eng,m,p,spawn,until}=world(),e=spawn(),other=spawn(19.6,16.6)
 until(()=>m.entities.some(e=>e.dl!.phase==='drag'))
 for(let i=0;i<20;i++){eng.updateEntities(1/30,1);ok(m.entities.filter(e=>['drag','hold'].includes(e.dl!.phase)).length<=1,'one captor only')}
 void e;void other;void p
}
{
 const a=world(),b=world();dullerAlmondScent(a.eng)
 const ae=a.spawn(),be=b.spawn();b.until(()=>be.dl!.phase==='drag')
 for(let i=0;i<300;i++)a.tick()
 ok(a.p.hp===100&&!['drag','hold'].includes(ae.dl!.phase),'scent protects only its engine')
}
{
 const {eng,m,p,spawn,until,tick}=world(),e=spawn()
 until(()=>e.dl!.phase==='drag');for(let i=0;i<8;i++)tick()
 const inf={ox:100,oy:200,chunks:new Map(),taken:new Set()} as any;m.inf=inf
 // Simulate the exact same world position after a streamed window shifts one tile.
 e.dl!.fromX+=100;e.dl!.toX+=100;e.dl!.lx+=100;e.dl!.fromY+=200;e.dl!.toY+=200;e.dl!.ly+=200
 e.dl!.wallX!+=100;e.dl!.wallY!+=200
 for(let y=0;y<32;y++){m.tiles[y*32+17]=1;m.tiles[y*32+16]=0}
 inf.ox++;p.x--;e.x--;tick()
 const safe=dullerSafePosition(eng)!
 ok(safe.x+inf.ox===116.5,'safe endpoint follows world origin')
 until(()=>e.dl!.phase==='hold')
 ok(p.x+inf.ox===e.dl!.toX,'streamed drag reaches original world target')
}
{
 const {eng,m,p,spawn,tick}=world(),e=spawn(18.2)
 // No safe landing behind the wall: all destinations are pit tiles.
 for(let y=0;y<32;y++)for(let x=18;x<32;x++)m.elev[y*32+x]=4
 Object.assign(e.dl!,{phase:'reach',t:.9,reach:.7})
 tick();ok(e.dl!.phase==='flee'&&p.hp===100,'pit landing cancels grab')
 eng.dev.frozenAI=true;m.entities=[];ok(eng.devSpawnEntity('duller'),'developer spawn works')
 ok(!!m.entities[0].dl,'frozen developer spawn initializes carry state')
}
const a=buildEntityMesh('duller',{seed:42}),b=buildEntityMesh('duller',{seed:42})
const meshes=(g:THREE.Group)=>{const out:THREE.Mesh[]=[];g.traverse(o=>{if((o as THREE.Mesh).isMesh)out.push(o as THREE.Mesh)});return out}
const am=meshes(a),bm=meshes(b),textures=new Set<THREE.Texture>();let triangles=0
for(const m of am){
 for(const key of ['position','normal','uv']){const attr=m.geometry.getAttribute(key);ok(!!attr,`${key} present`);ok(Array.from(attr.array).every(Number.isFinite),`${key} finite`)}
 triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3
 ok(!bm.some(o=>o.geometry===m.geometry||o.material===m.material),'instance resources independent')
 const mat=m.material as THREE.MeshLambertMaterial;if(mat.map)textures.add(mat.map)
}
ok(textures.size===3,'three shared procedural maps')
ok(bm.every(m=>{const t=(m.material as THREE.MeshLambertMaterial).map;return !t||textures.has(t)}),'textures cached across models')
let disposed=0;for(const t of textures)t.addEventListener('dispose',()=>disposed++)
for(const g of new Set(am.map(m=>m.geometry)))g.dispose()
for(const m of new Set(am.map(m=>m.material as THREE.Material)))m.dispose()
ok(disposed===0,'instance disposal preserves shared maps')
const {eng,spawn}=world(),e=spawn()
for(const phase of ['roam','reach','drag','hold','flee'] as const){
 Object.assign(e.dl!,{phase,reach:['reach','drag','hold'].includes(phase)?1:0,reachLen:3,wallD:1,wallX:117,wallY:216.5,wallAngle:Math.PI,run:phase==='flee'?1:0})
 for(let i=0;i<20;i++){e.animT=i/10;animateDuller(b,e,i/20,3,100,200);b.updateMatrixWorld(true);ok(bm.every(m=>m.matrixWorld.elements.every(Number.isFinite)),'finite animated pose')}
}
void eng
ok(am.length<=40&&triangles<40000,'model complexity bounded')
console.log(JSON.stringify({integration:'passed',checks,meshes:am.length,triangles,sharedTextures:textures.size},null,2))
