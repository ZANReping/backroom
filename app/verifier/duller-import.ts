import { makeEntity } from '../src/game/entities'
import { initDuller, dullerControlsPlayer } from '../src/game/engine/dullerAI'
import { canOccupy } from '../src/game/core/player'
import { bandOfPlayerZ, floorHeight, wallAt, structBlocksSight } from '../src/game/world/mapgen'

/** Real level geometry, production AI/combat/renderer; the host isolates player storage. */
export async function verifyDullerImport(qa:any,level=2){
 const {eng,r,look}=qa,results:string[]=[]
 const check=(v:unknown,message:string)=>{if(!v)throw Error(message);results.push(message)}
 const settle=()=>new Promise(resolve=>setTimeout(resolve,800))
 await qa.scene(level);await qa.warm();qa.hide()
 const p=eng.player,m=eng.map,band=bandOfPlayerZ(m,p.z)
 const free=(x:number,y:number)=>eng.entityWalkH(m,Math.floor(x),Math.floor(y),band)!==null&&canOccupy(m,x,y,undefined,{z:p.z,band})&&Math.abs(floorHeight(m,x,y,band)-p.z)<.2
 m.entities=[];p.hotbar.fill(null);p.backpack.fill(null);p.flashlight=true
 const original={x:p.x,y:p.y,z:p.z}
 let pair:number[]|undefined
 for(let rad=0;rad<70&&!pair;rad++)for(let iy=-rad;iy<=rad&&!pair;iy++)for(let ix=-rad;ix<=rad&&!pair;ix++){
  if(Math.max(Math.abs(ix),Math.abs(iy))!==rad)continue
  const x=original.x+ix,y=original.y+iy
  if(!free(x,y))continue
  // Avoid decorative, deliberately non-solid pipe gauges covering the camera.
  if(m.structures.some((s:any)=>s.data?.l2WallProp&&Math.hypot(s.x+s.w/2-x,s.y+s.h/2-y)<2.5))continue
  for(const [dx,dy] of [[2.4,0],[-2.4,0],[0,2.4],[0,-2.4]]){
   let wall=false,obstructed=false
   for(let t=.02;t<1;t+=.02){const sx=x+dx*t,sy=y+dy*t;if(wallAt(m,Math.floor(sx),Math.floor(sy),band)){wall=true;break}if(structBlocksSight(m,sx,sy,p.z+1.25,band)){obstructed=true;break}}
   if(wall&&!obstructed&&free(x+dx,y+dy)&&!eng.los(x,y,x+dx,y+dy)){pair=[x,y,x+dx,y+dy];break}
  }
 }
 check(pair,'actual map has an accessible wall ambush pair')
 const [px,py,ex,ey]=pair!
 Object.assign(p,{x:px,y:py,hp:100,sanity:100,facing:Math.atan2(py-ey,px-ex)})
 const attacker=makeEntity('duller',ex,ey,p.z);initDuller(eng,attacker,'canned');m.entities=[attacker]
 eng.dev.frozenAI=false;eng.dev.god=false
 const phases=new Set<string>();let reach:any,midSave=false,locked=false
 for(let i=0;i<540;i++){
  eng.updateEntities(1/30,1);const s=attacker.dl!
  phases.add(s.phase)
  if(s.phase==='reach'&&s.reach>.8)reach={x:attacker.x,y:attacker.y,facing:attacker.facing,dl:{...s}}
  if(s.phase==='drag'&&s.t>.35&&!midSave){
   const before={x:p.x,y:p.y,z:p.z},snap=eng.snapshot()
   midSave=free(snap.player.x,snap.player.y)&&p.x===before.x&&p.y===before.y
   eng.input.mx=1;eng.updateMovement(1/30,{dmg:1,drain:1},false);eng.input.mx=0
   locked=p.x===before.x&&p.y===before.y&&p.z===before.z
  }
  if(s.phase==='flee'&&phases.has('hold'))break
 }
 check(['lurk','reach','drag','hold','flee'].every(s=>phases.has(s)),'real level completes wall ambush phases')
 check(midSave&&locked,'mid-wall save and movement remain safe')
 check(free(p.x,p.y)&&p.hp<100&&!dullerControlsPlayer(eng),'actual map landing is clear and player released')
 const gameplay={phases:[...phases],hp:p.hp,landing:{x:p.x,y:p.y,z:p.z},pair}
 eng.dev.frozenAI=true;eng.dev.god=true;m.entities=[];Object.assign(p,original,{hp:100})
 await settle()
 let point:number[]|undefined
 for(let d=3.3;d>=2.5&&!point;d-=.2)for(let i=0;i<16;i++){
  const a=i*Math.PI/8,x=p.x+Math.cos(a)*d,y=p.y+Math.sin(a)*d
  if(free(x,y)&&eng.los(p.x,p.y,x,y)){point=[x,y];break}
 }
 check(point,'clear production model view')
 const [x,y]=point!
 const spawn=(phase='roam')=>{
  const e=makeEntity('duller',x,y,p.z);initDuller(eng,e,'canned')
  e.facing=Math.atan2(p.y-y,p.x-x)+.35;e.animT=.3;e.state=phase==='flee'?'stunned':phase==='roam'?'wander':'attack'
  Object.assign(e.dl!,{phase,run:phase==='flee'?1:0,reach:phase==='hold'?1:0,reachLen:1.6})
  return e
 }
 async function show(phase:string){
  Object.assign(p,original);p.flashlight=true
  let e=spawn(phase)
  if(phase==='reach'&&reach){
   Object.assign(p,{x:px,y:py});e=makeEntity('duller',reach.x,reach.y,p.z);e.facing=reach.facing;e.dl={...reach.dl};e.animT=.3;e.state='attack'
   const a=reach.dl.wallAngle,wx=reach.dl.wallX-(m.inf?.ox??0),wy=reach.dl.wallY-(m.inf?.oy??0)
   const vx=wx+Math.cos(a)*1.6,vy=wy+Math.sin(a)*1.6
   if(free(vx,vy))Object.assign(p,{x:vx,y:vy})
  }
  look.yaw=Math.atan2(-(e.x-p.x),-(e.y-p.y));look.pitch=-.12;r.setFov(64);qa.freezeRenderTime(1.7)
  m.entities=[e];await settle()
  const g=r.entityMeshes.get(e.id)
  check(g?.visible&&g.userData.dullerRig,`${phase}: production rig rendered`)
  g.updateMatrixWorld(true);let meshes=0,triangles=0,finite=true
  g.traverse((o:any)=>{finite&&=o.matrixWorld.elements.every(Number.isFinite);if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3}})
  check(finite,`${phase}: finite transforms`)
  if(phase==='reach')check(g.userData.dullerRig.stain.visible,'actual entry face stain visible')
  return {meshes,triangles}
 }
 await show('roam')
 const e=m.entities[0],g=r.entityMeshes.get(e.id),carry=g.userData.dullerRig.carry
 check(carry.children.length===1,'held item attached')
 eng.killCheck(Object.assign(e,{hp:0}));await settle()
 check(r.entityMeshes.get(e.id)===g,'dropping held item retains body model')
 check(carry.children.length===0&&m.items.some((it:any)=>it.type==='canned'&&Math.hypot(it.x-e.x,it.y-e.y)<6),'held item becomes collectible drop')
 m.items=m.items.filter((it:any)=>!(it.type==='canned'&&Math.hypot(it.x-e.x,it.y-e.y)<6))
 const resources=[]
 // Keep world/camera fixed while measuring lifecycle, after the held item atlas warmed.
 m.entities=[];await qa.warm()
 for(let i=0;i<3;i++){
  m.entities=[spawn(),spawn('flee')];m.entities[1].y+=.5;await settle()
  check(r.entityMeshes.size===2,`cycle ${i}: two instances rendered`)
  m.entities=[];await qa.warm()
  check(r.entityMeshes.size===0,`cycle ${i}: entity cache released`)
  resources.push({...r.three.info.memory,programs:r.three.info.programs.length})
 }
 check(resources.every(v=>JSON.stringify(v)===JSON.stringify(resources[0])),'resource counts stable after three cycles')
 check(r.three.info.programs.every((v:any)=>v.diagnostics?.runnable!==false),'production shaders compile')
 ;(window as any).dullerQa={show}
 const model=await show('roam')
 return {checks:results.length,results,gameplay,resources,model,stats:qa.stats(),seed:20261006,placement:{...original,entityX:x,entityY:y},scope:'production AI/combat and rendered poses; headless desktop browser; not a hardware FPS benchmark'}
}
