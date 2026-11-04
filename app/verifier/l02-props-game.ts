import * as THREE from 'three'
import {mount as previous} from './l02-round5-import-game'
import {l02Collapse,housePartition,planHole} from '../src/game/world/l02Collapse'
import {look} from '../src/game/renderer/shared'
import {canOccupy,PLAYER_RADIUS} from '../src/game/core/player'
import {floorHeight} from '../src/game/world/mapgen'
export async function mount(app:any){
 const base=await previous(app),e=app.engine,r=app.renderer(),fixed=new URLSearchParams(location.search).get('baseline')!=='1',checks:string[]=[]
 const sleep=(n=150)=>new Promise(r=>setTimeout(r,n))
 const until=async(fn:()=>unknown,label:string)=>{const start=performance.now();while(!fn()){if(performance.now()-start>120000)throw Error('Timeout '+label);await sleep(80)}}
 const ok=(value:unknown,label:string)=>{if(!value)throw Error(label);checks.push(label)}
 const aim=(x:number,y:number,z:number)=>{const dx=x-e.map.inf.ox-e.player.x,dy=y-e.map.inf.oy-e.player.y;e.player.facing=Math.atan2(dy,dx);look.yaw=-e.player.facing-Math.PI/2;look.pitch=Math.atan2(z-e.player.z-1.55,Math.hypot(dx,dy));look.roll=0}
 const at=async(x:number,y:number,z:number,tx:number,ty:number,tz:number)=>{
  const inf=e.map.inf;e.seating=e.ride=e.climb=e.porchDrop=e.onStairs=null;e.handsStowed=true;e.player.flashlight=false;e.dev.bright=false;e.dev.fly=false;e.dev.noclip=false
  let point:{x:number;y:number}|undefined
  const offsets=[[0,0],[.25,0],[-.25,0],[0,.25],[0,-.25],[.5,0],[-.5,0]]
  for(const radius of [.75,1,1.25,1.5])for(let n=0;n<12;n++)offsets.push([Math.sin(n*Math.PI/6)*radius,Math.cos(n*Math.PI/6)*radius])
  for(const offset of offsets){const px=x+offset[0]-inf.ox,py=y+offset[1]-inf.oy;if(Math.abs(floorHeight(e.map,px,py,0,z)-z)<.04&&canOccupy(e.map,px,py,PLAYER_RADIUS,{z:z+.02,band:0,crouch:false})){point={x:px,y:py};break}}
  ok(point,'close-up camera has real body clearance')
  Object.assign(e.player,point,{z:z+.02,vz:0,floor:0,crouching:false});e.input.mx=e.input.my=0;e.input.attack=e.input.jump=e.input.interact=false;e.specialHeld=false;e.introT=0;e.updateInfiniteWindow();aim(tx,ty,tz)
  await until(()=>r.isNearWorldReady(e)&&!e.paused,'nearby models');await sleep(350)
 }
 const ray=(x:number,y:number,z:number,d:THREE.Vector3,objects:THREE.Object3D[])=>{r.scene.updateMatrixWorld(true);return new THREE.Raycaster(new THREE.Vector3(x,y,z),d).intersectObjects(objects,true)}
 const coneCheck=()=>{
  const h=l02Collapse().holes[0],x=h.open.x+h.open.w+.45,z=h.open.y+.35,ox=e.map.inf.ox,oz=e.map.inf.oy
  const objects:THREE.Object3D[]=[];r.scene.getObjectByName('l02-house:'+h.id)!.traverse((o:any)=>{if(o.isMesh&&/l02-house-props-cone(Orange|White)/.test(o.name))objects.push(o)})
  ok(objects.length===2,'actual house cone keeps two surface batches')
  const stripes=[.17,.20,.29,.32].map(y=>{const hit=ray(x-ox+.4,-h.depth+y,z-oz,new THREE.Vector3(-1,0,0),objects)[0];return{height:y,first:hit?.object.name,distance:hit?.distance}})
  if(fixed)ok(stripes.every(s=>s.first?.endsWith('coneWhite')),'both reflective stripes lie on the visible cone surface')
  return{fixed,stripes}
 }
 // Freeze only the scheduled event's real planner input; the controller still drops it normally.
 const houseSetup=async()=>{const qa=(globalThis as any).__l02QA,old=qa.floor;qa.floor=(...args:any[])=>{const made=old(...args);if(made){const state=l02Collapse(),h=state.holes.at(-1)!,o=h.open,index=state.holes.indexOf(h);state.holes.splice(index,1);let planned;try{planned=planHole(o.x+o.w/2,o.y+o.h/2,[],[],h.id,h.t0,.1)}finally{state.holes.splice(index,0,h)};ok(planned&&Math.abs(planned.open.w-o.w)<.01&&Math.abs(planned.open.h-o.h)<.01,'fixed collapse uses the same production opening');h.ramp=planned!.ramp;h.rampDir=planned!.rampDir}return made};try{return await base.houseSetup()}finally{qa.floor=old}}
 const coneClose=async()=>{const h=l02Collapse().holes[0];ok(h,'real collapsed house exists');const x=h.open.x+h.open.w+.45,z=h.open.y+.35;await at(x-1.05,z+1.3,-h.depth,x,z,-h.depth+.24);return{...base.summary(),...coneCheck(),camera:r.camera.position.toArray()}}
 const coneBack=async()=>{const h=l02Collapse().holes[0],x=h.open.x+h.open.w+.45,z=h.open.y+.35;await at(x-.55,z-1.1,-h.depth,x,z,-h.depth+.24);return{...base.summary(),...coneCheck()}}
 const lampClose=async()=>{const h=l02Collapse().holes[0],mesh=r.scene.getObjectByName('l02-house-props-lampGlass'),p=mesh.geometry.getAttribute('position'),centers:THREE.Vector3[]=[];for(let first=0;first<p.count;first+=36){const center=new THREE.Vector3();for(let i=first;i<Math.min(first+36,p.count);i++)center.add(new THREE.Vector3().fromBufferAttribute(p,i));centers.push(center.divideScalar(36))}const center=centers[0],x=center.x,z=center.z-.075,obstacles=[h.ramp,...housePartition(h)];const clearance=centers.map(c=>Math.min(...obstacles.map(o=>Math.hypot(Math.max(o.x-c.x,0,c.x-o.x-o.w),Math.max(o.y-(c.z-.075),0,c.z-.075-o.y-o.h)))));if(fixed)ok(clearance.every(d=>d>=.35),'actual tripod centers leave clearance for ramp and stud walls');await at(x+1.1,z-.9,-h.depth,x,z,-h.depth+.60);return{...base.summary(),lamp:{x,y:z,z:center.y},clearance,camera:r.camera.position.toArray()}}
 const toiletClose=async()=>{await base.fixedScene();const candidates=e.map.structures.filter((s:any)=>s.data?.fix==='toilet');ok(candidates.length,'actual level contains toilets');const s=candidates[0],d=s.data,x=Number(d.fx),z=Number(d.fy),yaw=Number(d.yaw??0);await at(x+Math.sin(yaw)*.8,z+Math.cos(yaw)*.8,0,x,z,.35);return base.summary()}
 const sinkClose=async()=>{await base.sinkView();const s=e.map.structures.find((s:any)=>s.data?.fix==='sink'),d=s.data,x=Number(d.fx),z=Number(d.fy),yaw=Number(d.yaw??0);const root=r.scene.getObjectByName('l02-scene');const targets:THREE.Object3D[]=[];root.traverse((o:any)=>{if(o.isMesh&&o.name.startsWith('l02-sink-'))targets.push(o)})
  const hits=ray(x-e.map.inf.ox+Math.sin(yaw)*.02,1.4,z-e.map.inf.oy+Math.cos(yaw)*.02,new THREE.Vector3(0,-1,0),targets),height=hits[0]?.point.y
  if(fixed)ok(height<.82&&height>.74,'actual sink view exposes the basin bottom, not a solid countertop')
  return{...base.summary(),firstSurfaceHeight:height}
 }
 let site:any
 const entranceSetup=async()=>{await base.l0();const pending=base.permit();await until(()=>document.querySelector('[data-brc-doc=permit]'),'permit form');const button=[...document.querySelectorAll<HTMLButtonElement>('[data-brc-doc=permit] button')].find(b=>b.textContent?.includes('放回'));ok(button,'permit closes through its actual UI');button!.click();await pending;site=e.player.remodel.sites.at(-1);ok(site,'real permit created site');return base.summary()}
 const entrance=async(kind:string)=>{const p=site.props.find((p:any)=>p.kind===kind);ok(p,'site has '+kind);let view:{x:number;y:number}|undefined
  for(const [a,dist]of [[.45,1.55],[-.45,1.55],[1.2,1.4],[-1.2,1.4],[2.4,1.6]]){const angle=p.yaw+a,x=p.x+Math.sin(angle)*dist,y=p.y+Math.cos(angle)*dist;if(canOccupy(e.map,x-e.map.inf.ox,y-e.map.inf.oy,PLAYER_RADIUS,{z:.02,band:0,crouch:false})){view={x,y};break}}
  ok(view,'construction prop has an approachable view '+kind);await at(view!.x,view!.y,0,p.x,p.y,kind==='worklamp'?.8:.4)
  const group=r.scene.getObjectByName('remodel-site:'+site.id).children.find((g:any)=>g.name==='remodel-'+kind),bounds=new THREE.Box3().setFromObject(group),count=group.children.length
  if(fixed)ok(bounds.min.y<.015&&bounds.min.y>-.01,kind+' support is grounded')
  return{...base.summary(),kind,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},meshes:count}
 }
 const resources=async()=>{const rounds:any[]=[];for(let i=0;i<3;i++){await houseSetup();e.loadLevel(0,{mapSeed:424242,firstVisit:false});e.introT=0;await until(()=>r.isNearWorldReady(e),'release L02');await sleep(600);rounds.push({...r.three.info.memory})}ok(rounds[2].geometries<=rounds[1].geometries+4,'retired modeled houses keep geometry bounded');ok(rounds[2].textures<=rounds[1].textures+2,'shared facility materials keep textures bounded');return{...base.summary(),rounds}}
 return{...base,houseSetup,coneClose,coneBack,lampClose,toiletClose,sinkClose,entranceSetup,entranceCone:()=>entrance('cone'),entranceSign:()=>entrance('sign'),entranceBarrier:()=>entrance('barricade'),entranceLamp:()=>entrance('worklamp'),resources,summary:()=>({...base.summary(),propChecks:checks}),cleanup:()=>({...base.cleanup(),propChecks:checks})}
}
