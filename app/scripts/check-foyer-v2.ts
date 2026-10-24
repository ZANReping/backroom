import assert from 'node:assert/strict'
import { createCanvas } from '@napi-rs/canvas'
const memory=new Map<string,string>()
Object.assign(globalThis,{document:{createElement:()=>createCanvas(256,256),createElementNS:()=>({addEventListener(){},removeEventListener(){}})},window:{addEventListener(){},removeEventListener(){},setTimeout,clearTimeout,matchMedia:()=>({matches:false})},localStorage:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)}})
const {Engine}=await import('../src/game/engine')
const {FOYER_DOORS,FOYER_PROPS,FOYER_PICKUP_POS,foyerHomeAt,foyerColliders}=await import('../src/game/world/foyerLayout')
const {FOYER_PEDS}=await import('../src/game/world/foyerStreetLayout')
const {foyerInteract}=await import('../src/game/engine/foyer')
const {updateFoyerStreet}=await import('../src/game/engine/foyerStreet')
const {updateNpcs}=await import('../src/game/engine/npc')
const {canOccupy,PLAYER_RADIUS}=await import('../src/game/core/player')
const {seatsFor}=await import('../src/game/world/seating')
const {pickSeat,beginSitting,updateSitting,standUp}=await import('../src/game/engine/seating')
const {look}=await import('../src/game/renderer/shared')
const {buildItemMesh}=await import('../src/game/renderer/itemsMesh')
const {FoyerScene}=await import('../src/game/renderer/foyerHome')
const {foyerTargets}=await import('../src/game/engine/foyer')
const {scanInteract,structureInteractionVolume,rayInteractionVolume,interactionEyeZ}=await import('../src/game/engine/interact')
const THREE=await import('three')
let checks=0;const ok=(v:unknown,s:string)=>{assert(v,s);checks++}
const e=new Engine();e.newRun(424243,'normal','slot1',true,900);e.paused=false;e.introT=0
for(const d of FOYER_DOORS)foyerInteract(e,d.id)
ok(foyerHomeAt(5.5,14.4)&&foyerHomeAt(5.5,15.2)&&!foyerHomeAt(42,17.5),'doorway shares home lighting pool')
ok(e.npcs.filter(n=>n.def.ambient).length===7&&FOYER_PEDS.length===7,'seven ambient NPCs')
ok(!e.knownNpcs.some(n=>n.ambient),'ambient NPCs never enter people codex')
const walkers=e.npcs.filter(n=>n.def.route),still=e.npcs.filter(n=>n.def.ambient&&!n.def.route)
const before=new Map(e.npcs.map(n=>[n.id,[n.x,n.y]]))
for(let i=0;i<120;i++)updateNpcs(e,1/60)
for(const n of walkers)ok(Math.hypot(n.x-before.get(n.id)![0],n.y-before.get(n.id)![1])>.4,'walker follows route '+n.id)
for(const n of still)ok(Math.hypot(n.x-before.get(n.id)![0],n.y-before.get(n.id)![1])<.02,'stationary NPC stays at post '+n.id)
const proxy=e.map!.structures.find(s=>s.data?.pid==='desk_chair')!
ok(!!proxy&&foyerColliders(proxy).length===0,'computer chair has interaction without blocking spawn')
ok(Object.values(structureInteractionVolume(e,proxy,0)).every(Number.isFinite),'non-solid chair has finite interaction bounds')
ok(rayInteractionVolume({ox:0,oy:0,oz:1,dx:1,dy:0,dz:0},{minX:Infinity,maxX:-Infinity,minY:0,maxY:1,minZ:0,maxZ:2})===null,'invalid volume cannot steal an interaction')
const nt=foyerTargets(e).find(t=>t.id==='nightstand')!,nx=6.448959235991435,ny=4.851040764008565,nd=Math.hypot(nt.x-nx,nt.y-ny),yaw=Math.atan2(-(nt.x-nx),-(nt.y-ny))
Object.assign(e.player,{x:nx,y:ny,z:0,facing:Math.atan2(nt.y-ny,nt.x-nx),crouching:false});const pitch=Math.atan2(nt.z-interactionEyeZ(e),nd)
Object.assign(look,{yaw,pitch,rayX:-Math.sin(yaw)*Math.cos(pitch),rayY:-Math.cos(yaw)*Math.cos(pitch),rayZ:Math.sin(pitch)});scanInteract(e)
ok(e.interactTarget?.foyerId==='nightstand','looking at nightstand is not stolen by non-solid chair behind player')
for(const id of ['desk_chair','sofa','armchair','chair_d1','stool1','toilet','bed']){
 const prop=FOYER_PROPS.find(p=>p.id===id)??FOYER_PROPS.find(p=>id==='stool1'&&p.kind==='stool')!
 const s=e.map!.structures.find(s=>s.data?.pid===prop.id)!
 const anchors=seatsFor(s,e.map!,900);ok(anchors.length>0,'seat anchors '+id)
 e.seating=null
 let reached=false
 for(const a of anchors)for(const d of [.55,.8,1.05])for(const off of [0,.65,-.65,Math.PI/2,-Math.PI/2]){
   if(reached)continue
   const x=a.x+Math.sin(a.yaw+off)*d,y=a.y+Math.cos(a.yaw+off)*d
   if(!canOccupy(e.map!,x,y,PLAYER_RADIUS,{z:0}))continue
   Object.assign(e.player,{x,y,z:0,vz:0});look.yaw=a.yaw+Math.PI
   if(pickSeat(e,s)&&beginSitting(e,s)){
     for(let j=0;j<50;j++)updateSitting(e,.02)
     ok(e.seating?.phase==='seated','sit completes '+id)
     ok(standUp(e),'safe stand-up '+id)
     for(let j=0;j<50;j++)updateSitting(e,.02)
     ok(!e.seating&&canOccupy(e.map!,e.player.x,e.player.y,PLAYER_RADIUS,{z:0}),'stand-up collision clear '+id)
     reached=true
   }
 }
 ok(reached,'reachable approach '+id)
}
// The previous table and planter blocked the only entrance-to-living-room gap.
const step=.2,minX=4.3,minY=4.3,W=63,H=67,pass=new Uint8Array(W*H),seen=new Uint8Array(W*H)
for(let y=0;y<H;y++)for(let x=0;x<W;x++)pass[y*W+x]=+canOccupy(e.map!,minX+x*step,minY+y*step,PLAYER_RADIUS,{z:0})
const cell=(x:number,y:number)=>Math.round((y-minY)/step)*W+Math.round((x-minX)/step)
const start=cell(5.25,5.75),q=[start];seen[start]=1
for(let i=0;i<q.length;i++){const k=q[i],x=k%W,y=Math.floor(k/W);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,n=ny*W+nx;if(nx>=0&&nx<W&&ny>=0&&ny<H&&pass[n]&&!seen[n]){seen[n]=1;q.push(n)}}}
for(const [name,x,y]of [['entry',8,12.5],['living',10.1,11.5],['kitchen',14,5.5],['corridor',5.5,16]] as const)ok(seen[cell(x,y)],'rooms connected: '+name)
e.player.prologue!.flags.act4=true;updateFoyerStreet(e,.01);ok(!e.npcs.some(n=>n.def.ambient),'act4 removes street NPCs')
for(const type of ['phone','bottledwater','snackbar','foyerpack']){
 const a=buildItemMesh(type,{halo:false}),b=buildItemMesh(type,{halo:false}),ga=new Set<THREE.BufferGeometry>(),gb=new Set<THREE.BufferGeometry>(),ma=new Set<THREE.Material>(),mb=new Set<THREE.Material>(),ta=new Set<THREE.Texture>(),tb=new Set<THREE.Texture>()
 for(const [root,gs,ms,ts]of [[a,ga,ma,ta],[b,gb,mb,tb]] as const)root.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){ms.add(m);const t=(m as THREE.MeshLambertMaterial).map;if(t)ts.add(t)}}})
 ok(![...ga].some(g=>gb.has(g))&&![...ma].some(m=>mb.has(m)),type+' owns geometry/materials')
 ok([...ta].some(t=>tb.has(t))&&[...ta].every(t=>t.userData.foyerShared),type+' shares marked textures')
 for(const g of ga){for(const name of ['position','normal','uv']){const attr=g.getAttribute(name);ok(!!attr&&Array.from(attr.array).every(Number.isFinite),type+' finite '+name)}g.dispose()}
 for(const m of ma)m.dispose()
 ok(b.children.length>0,type+' second instance survives disposal')
}
// The imported local-space pickup builders must receive their world transforms.
const scene=new FoyerScene();for(const _ of scene.build(e.map!))void _
const pickupMap=(scene as any).pickups as Map<string,THREE.Object3D>
scene.group.updateMatrixWorld(true)
for(const id of ['backpack','water','snack'] as const){const o=pickupMap.get(id)!,v=o.getWorldPosition(new THREE.Vector3()),q=FOYER_PICKUP_POS[id];ok(v.distanceTo(new THREE.Vector3(q.x,q.z,q.y))<.01,'pickup world transform '+id)}
// The visible flashlight must fit wholly within the open tray, above its bottom.
for(let i=0;i<100;i++)scene.update({nightstand:1},.02)
scene.group.updateMatrixWorld(true)
const fl=pickupMap.get('flashlight_drawer')!,bounds=new THREE.Box3().setFromObject(fl),ns=FOYER_PROPS.find(p=>p.id==='nightstand')!
ok(bounds.min.x>ns.x-.208&&bounds.max.x<ns.x+.208,'torch contained across drawer width')
ok(bounds.min.y>.382&&bounds.max.y<.493,'torch above drawer bottom and below rim')
ok(bounds.min.z>ns.y+.22-.198&&bounds.max.z<ns.y+.22+.198,'torch contained in drawer depth')
const doorRay=new THREE.Raycaster(new THREE.Vector3(6.35,1.3,16.9),new THREE.Vector3(1,0,0)),doorHit=doorRay.intersectObject(scene.group,true)[0]
ok(!!doorHit&&((doorHit.object as THREE.Mesh).material as THREE.Material).name==='foyer-home-fire-door','indoor safety door in front of stair wall')
ok(doorHit.point.x<7.99&&Math.abs(doorHit.point.z-16.9)<.01,'door faces -X from shared interaction coordinates')
console.log(JSON.stringify({checks,ok:true,walkers:walkers.length,seats:7,reachableCells:q.length}))
