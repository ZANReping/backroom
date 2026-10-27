import * as THREE from 'three'
import {createCanvas} from '@napi-rs/canvas'
const memory=new Map<string,string>()
Object.assign(globalThis,{window:{addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})},document:{createElement:(t:string)=>t==='canvas'?createCanvas(64,64):({style:{}}),getElementById:()=>null,addEventListener(){},removeEventListener(){},body:{appendChild(){}}},localStorage:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)}})
const {Engine}=await import('../src/game/engine')
const {L02}=await import('../src/game/levels/l02')
const L=await import('../src/game/world/l02Layout')
const C=await import('../src/game/world/l02Collapse')
const R=await import('../src/game/engine/l02Collapse')
const {phoneState}=await import('../src/game/engine/phone')
const {ceilingHeightAt}=await import('../src/game/world/mapgen')
const P=await import('../src/game/renderer/l02Props')
const S=await import('../src/game/renderer/l02Scene')
const {DOCS}=await import('../src/game/content/docs')
let checks=0
function ok(value:unknown,reason:string){checks++;if(!value)throw Error(reason)}
const within=(r:{x:number;y:number;w:number;h:number},x:number,y:number,pad=0)=>x>r.x-pad&&x<r.x+r.w+pad&&y>r.y-pad&&y<r.y+r.h+pad
let routers=0,clipboards=0,doorCount=0
for(let seed=0;seed<400;seed++){
 const c=L.genL02Chunk(L02,seed,0,0)
 const router=c.structures.find(s=>s.data?.fix==='router'),clip=c.structures.find(s=>s.data?.fix==='clipboard'&&s.data.doc==='brc_slogan')
 ok(router&&Math.hypot(Number(router.data!.fx)-16,Number(router.data!.fy)-16)<16,'spawn has working Wi-Fi reach: '+seed);routers++
 ok(clip&&Math.hypot(Number(clip.data!.fx)-16,Number(clip.data!.fy)-16)<=14.1,'spawn has nearby company clipboard: '+seed);clipboards++
 ok(c.entities.length===0,'no entity generation in L02')
 const d=L.l02NearestDoor(seed),distance=Math.hypot(d.x-16,d.y-16)
 ok(distance>=44&&distance<128,'nearest natural return respects spawn exclusion: '+seed)
 ok(L.l02DoorOf(seed,d.cx,d.cy)?.x===d.x,'same return door in cell and chunk queries')
 const doors=L.l02DoorsNear(seed,16,16,130)
 ok(doors.length>=2&&doors[0].x===d.x&&doors[0].y===d.y,'multiple exits sorted by actual distance')
 const dc=L.genL02Chunk(L02,seed,d.cx,d.cy),front={x:d.x,y:d.y+1}
 ok(dc.exits.length===1&&dc.exits[0].def.kind==='remodelreturn','generated chunk exposes real return interaction')
 ok(!dc.l0!.walls.some(w=>within(w,front.x,front.y,.3)),'return front has player clearance')
 for(const l of c.lights)ok(l.color==='#f7f4dd'&&l.r===4.2&&l.intensityMul===.42,'lamp uses main L0 light calibration')
 doorCount+=doors.length
}
const keys=[[-2,-2],[-1,0],[0,1],[1,-1],[3,2]]
const layouts=keys.map(([x,y])=>JSON.stringify(L.l02Layout(20261025,x,y)))
for(let i=keys.length-1;i>=0;i--){const [x,y]=keys[i];ok(JSON.stringify(L.l02Layout(20261025,x,y))===layouts[i],'negative/positive chunk loading order does not alter layout')}
// A wall viewed head-on at the entry must not survive as a near vertical white strip.
for(let seed=0;seed<80;seed++)for(let cy=-1;cy<=1;cy++)for(let cx=-1;cx<=1;cx++){
 const a=L.l02Layout(seed,cx,cy)
 for(const w of a.walls){const mx=w.x+w.w/2,my=w.y+w.h/2
  const strip=w.w>w.h?Math.abs(my-16)<.09&&Math.max(w.x,16)<Math.min(w.x+w.w,40):Math.abs(mx-16)<.09&&Math.max(w.y,16)<Math.min(w.y+w.h,40)
  // Restroom enclosure walls are intentionally stable and are not generator strip artifacts.
  const rest=L.l02RestroomOf(seed,cx,cy)
  if(strip)ok(!!rest&&within({x:rest.x-.2,y:rest.y-.2,w:rest.w+.4,h:rest.h+.4},mx,my),'only an actual restroom may cross the protected view axis '+JSON.stringify({seed,cx,cy,w,rest}))
 }
}
C.resetL02Collapse()
const wall={x:10,y:10,w:3,h:.16},raw=C.pickWallSegment(wall,11.5,10,4,0,.5),free=C.extendFreeEnds(raw,[wall])
ok(free.x<wall.x&&free.x+free.w>wall.x+wall.w,'isolated wall removal covers both end caps')
ok(free.freeEnds?.every(Boolean),'isolated wall records two free ends')
ok(free.y<wall.y-.0235&&free.y+free.h>wall.y+wall.h+.0235,'removal covers projecting outlet cover and screws')
C.l02Collapse().removedWalls.push(free)
const cut=C.applyCollapseToStructures([{kind:'pillar',...wall,solid:true,data:{l0Wall:1,bottom:0,top:2.7}}],0,0,0,0)
ok(cut.length===0,'a fully collapsed short wall has no live collider')
const e=new Engine();e.seed=20261025;e.loadLevel(L.L02_ID,{mapSeed:20261025,firstVisit:false});e.paused=false;e.introT=0;e.dev.god=true;e.dev.frozenAI=true;e.dev.statLock=false;e.l02!.stopped=true
ok(ceilingHeightAt(e.map!,e.player.x,e.player.y,3,0)===2.7,'generic movement sees exact L02 ceiling height')
e.player.z=2.4;e.player.vz=9;R.tickL02(e,.05)
ok(e.player.z+1.55<=2.7-.119&&e.player.vz===0,'forced elevated player and camera are pushed below the ceiling')
const inf=e.map!.inf!,wx=e.player.x+inf.ox,wy=e.player.y+inf.oy
C.l02Collapse().tiles.push({x:wx-.5,y:wy-.5,w:1.2,h:.6,t0:0})
ok(Math.abs(C.l02CeilingAt(wx,wy)-3.15)<1e-8,'open ceiling tile exposes higher equipment cavity')
const outlet=e.map!.structures.find(s=>s.data?.fix==='outlet')!
ok(!!outlet,'test seed has a real powered outlet')
const data=outlet.data!,ox=Number(data.fx),oy=Number(data.fy)
e.player.hotbar[0]={type:'phone',count:1};const ph=phoneState(e.player);ph.battery=40;ph.docked=false
Object.assign(e.player,{x:ox-inf.ox,y:oy+.7-inf.oy,z:0,vz:0});R.l02Interact(e,outlet);R.tickL02(e,.2)
ok(ph.charging&&ph.battery>40,'real outlet starts restoring phone charge')
const host=e.map!.structures.find(s=>s.data?.l0Wall&&!s.data?.l0Prop&&s.w>1&&Math.abs(s.y+inf.oy+s.h+.03-oy)<.02&&ox>s.x+inf.ox&&ox<s.x+inf.ox+s.w)!
ok(!!host,'outlet is mounted to a real wall')
const qa=(globalThis as any).__l02QA
ok(qa.wallAt(e,host.x+inf.ox+host.w/2,host.y+inf.oy+host.h/2,host.w+1),'targeted collapse uses live controller')
ok(R.l02FixLabel(e,outlet)===null,'destroyed outlet loses interaction immediately')
R.tickL02(e,.2);ok(!ph.charging&&!e.l02!.charge,'falling outlet breaks an active charging cable')
const before=ph.battery;R.l02Interact(e,outlet);R.tickL02(e,.2)
ok(!e.l02!.charge&&ph.battery===before,'destroyed outlet cannot resume charging')
const cuts=C.l02Collapse().removedWalls;cuts.length=0;for(let i=0;i<C.L02_TUNING.maxWalls;i++)cuts.push({x:1000+4*i,y:1000,w:3,h:.2,axis:'x',dir:1,t0:i});const first=cuts[0]
ok(!qa.wall(e)&&cuts.length===C.L02_TUNING.maxWalls&&cuts[0]===first,'round5 keeps existing wall budget and permanent cut consistency')
for(const doc of ['brc_permit','brc_slogan','brc_took','brc_report'])ok(DOCS[doc]?.style==='brc','separate paper form exists for '+doc)
// Actual scene lifecycle must not dispose shared prop materials when retiring one scene.
e.loadLevel(L.L02_ID,{mapSeed:20261025,firstVisit:false});e.l02!.stopped=true
const scene=new THREE.Scene();S.syncL02Scene(scene,e,0)
let vertices=0,meshes=0,disposedShared=0,disposedGeometry=0
const shared=P.propMat('routerWhite');shared.addEventListener('dispose',()=>disposedShared++)
scene.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;meshes++;const pos=m.geometry.getAttribute('position');vertices+=pos.count;ok(Array.from(pos.array).every(Number.isFinite),'finite modeled facility vertices');ok(!!m.geometry.getAttribute('uv'),'facility has UV');m.geometry.addEventListener('dispose',()=>disposedGeometry++)})
ok(meshes>10&&vertices>1000,'scene contains detailed actual facilities')
S.clearL02Scene(scene);await new Promise(r=>setTimeout(r,0))
ok(disposedGeometry>0&&!scene.getObjectByName('l02-scene'),'scene exit frees private facility geometry')
ok(disposedShared===0&&P.propMat('routerWhite')===shared,'retiring instance preserves the cached material used by other facilities')
console.log(JSON.stringify({checks,failures:0,seeds:400,routers,clipboards,doorCount,sceneMeshes:meshes,sceneVertices:vertices,disposedGeometry,disposedShared}))
