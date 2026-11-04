import * as THREE from 'three'
import {mount as previous} from './l02-round5-import-game'
import {Engine} from '../src/game/engine'
import {toiletModel} from '../src/game/renderer/l02Props'
import {FoyerScene,Batch} from '../src/game/renderer/foyerHome'
import {FOYER_PROPS} from '../src/game/world/foyerLayout'
import {buildL4OfficeDetail} from '../src/game/renderer/l4OfficeDetails'
import {buildStructure} from '../src/game/renderer/structures'
import {buildL10Structure} from '../src/game/renderer/l10Meshes'
import {buildL11Structure} from '../src/game/renderer/l11Meshes'
import {stoneInstrumentGeometry} from '../src/game/renderer/stoneInstrumentsMesh'
import {buildTradersDressing} from '../src/game/renderer/tradersDressingMeshes'
import {TradersAssets,bakeTradersProp} from '../src/game/renderer/tradersMeshes'
import {TRADERS_DRESSING} from '../src/game/content/tradersDressing'
import {levelDefOf} from '../src/game/levels'
import {seatsFor} from '../src/game/world/seating'
import {furnitureSeats} from '../src/game/content/furnitureSeats'
import {beginSitting,pickSeat,updateSitting,standUp,sittingSafePosition} from '../src/game/engine/seating'
import {specialAction} from '../src/game/engine/special'
import {syncStructureModelColliders} from '../src/game/renderer/renderer'
import {syncFurnitureSeats} from '../src/game/renderer/furnitureSeats'
import {canOccupy,PLAYER_RADIUS} from '../src/game/core/player'
import {floorHeight} from '../src/game/world/mapgen'
import {look,litMaterial} from '../src/game/renderer/shared'
import {audio} from '../src/game/core/audio'

export async function mount(app:any){
 const base=await previous(app),e=app.engine,r=app.renderer(),checks:string[]=[]
 const sleep=(n=100)=>new Promise(resolve=>setTimeout(resolve,n))
 const until=async(fn:()=>unknown,label:string)=>{const start=performance.now();while(!fn()){if(performance.now()-start>120000)throw Error('Timeout '+label);await sleep()}}
 const ok=(value:unknown,label:string)=>{if(!value)throw Error(label);checks.push(label)}
 const summary=()=>({...base.summary(),toiletChecks:checks.length,soundEvents:[...sounds],sitting:e.seating?.phase,action:specialAction(e)})
 const assets=new TradersAssets(),ownMaterials:THREE.Material[]=[]
 const state=(kind:string,data:any={},w=1,h=1)=>({kind,x:11-w/2,y:11-h/2,w,h,solid:true,data})
 const factory=(id:string,s:any)=>{
  if(id==='l02'){const g=new THREE.Group();toiletModel(g);return g}
  if(id==='foyer'){const scene:any=new FoyerScene(),b=new Batch(),p=FOYER_PROPS.find(p=>p.kind==='toilet')!;scene.buildProp({...p,x:0,y:0,rot:0,w:.5,d:.58},b);b.flush(scene.group,'foyer-toilet');scene.group.traverse((o:any)=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(!ownMaterials.includes(m))ownMaterials.push(m)});return scene.group}
  if(id==='l4')return buildL4OfficeDetail('toilet')
  if(id==='stone'){const g=new THREE.Group(),mat=litMaterial({color:'#877963',roughness:1}),toilet=new THREE.Mesh(stoneInstrumentGeometry('toilet').clone(),mat);toilet.name='instr:toilet';g.add(toilet);ownMaterials.push(mat);return g}
  if(id==='l9'){const g=buildStructure(s,levelDefOf(9)!,e.map,3)!;g.position.set(0,0,0);g.traverse((o:any)=>{if(o.isMesh)ownMaterials.push(...(Array.isArray(o.material)?o.material:[o.material]))});return g}
  if(id==='l11'){const g=buildL11Structure(s)!;g.position.set(0,0,0);return g}
  if(id==='traders'){const g=buildTradersDressing(s,assets);g.position.set(0,0,0);return g}
  return buildL10Structure(s)!
 }
 const cases:any={l02:()=>state('l02fix',{fix:'toilet',yaw:0,l0Wall:1,l0Prop:1,bottom:0,top:.45},.44,.64),foyer:()=>state('foyerprop',{pid:'toilet'},.5,.58),l4:()=>state('l4prop',{detail:'toilet'},3,2),stone:()=>state('stoneinstruments',{rot:0}),l9:()=>state('l9toilet',{deg:0}),l11:()=>state('l11_toilet',{l11Interior:1},.4,.7),traders:()=>state('trade_counter',{tradersModel:'dressing',dressing:'wcstall',localW:1.55,localD:1.85},1.55,1.85),latrine:()=>state('l10outhouse',{deg:0},2,2)}
 const release=(root:THREE.Object3D)=>{root.removeFromParent();const gs=new Set<THREE.BufferGeometry>();root.traverse((o:any)=>{if(o.isMesh&&o.geometry)gs.add(o.geometry)});for(const g of gs)g.dispose()}
 const capture=(scene:THREE.Scene,camera:THREE.Camera)=>{
  const tm=r.three.toneMapping,exposure=r.three.toneMappingExposure;r.three.toneMapping=THREE.ACESFilmicToneMapping;r.three.toneMappingExposure=1
  r.three.setRenderTarget(null);r.three.render(scene,camera);const image=r.three.domElement.toDataURL('image/png');r.three.toneMapping=tm;r.three.toneMappingExposure=exposure;return image
 }
 const gallery=async(id:string)=>{
  const s=cases[id](),root=factory(id,s),scene=new THREE.Scene();scene.background=new THREE.Color('#555b59');scene.add(root)
  if(id==='traders'){
   const source=TRADERS_DRESSING.find(s=>s.data?.dressing==='wcstall')!
   root.position.set(source.x+source.w/2,0,source.y+source.h/2);root.rotation.y=Number(source.data?.deg??0)*Math.PI/180
   for(const _ of bakeTradersProp(root,assets)){}
   root.position.set(0,0,0);root.rotation.y=0
  }
  const hemi=new THREE.HemisphereLight('#fff7e5','#6d797e',2.4),key=new THREE.DirectionalLight('#fff3de',2.6);key.position.set(-2,4,3);scene.add(hemi,key)
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(7,7),new THREE.MeshStandardMaterial({color:'#737872',roughness:.95}));floor.rotation.x=-Math.PI/2;floor.position.y=-.012;scene.add(floor)
  const camera=new THREE.PerspectiveCamera(40,1920/1080,.02,50),large=id==='traders'||id==='latrine',front=id==='l11'?-1:1
  camera.position.set(large?2.6:1.05,large?1.85:1.35,front*(large?3.2:1.6));camera.lookAt(0,large?.85:.40,id==='traders'?-.35:0)
  if(id==='traders'){camera.position.set(.08,1.12,.48);camera.lookAt(0,.38,-.355)}
  if(id==='latrine'){camera.position.set(.12,1.16,.55);camera.lookAt(0,.38,-.57)}
  // Let source textures finish uploading, then render the unchanged game factory materials.
  await sleep(350);const captureData=capture(scene,camera),bounds=new THREE.Box3().setFromObject(root);let triangles=0,meshes=0
  root.traverse((o:any)=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3}})
  release(root);floor.geometry.dispose();(floor.material as THREE.Material).dispose()
  return{...summary(),id,captureData,meshes,triangles,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},fixtureOnly:true}
 }
 const aim=(x:number,y:number,z:number)=>{const dx=x-e.player.x,dy=y-e.player.y;look.yaw=Math.atan2(-dx,-dy);look.pitch=Math.atan2(z-e.player.z-1.55,Math.hypot(dx,dy));look.roll=0;look.visualHit=null}
 const approach=(eng:any,s:any)=>{
  const a=seatsFor(s,eng.map,eng.player.level)[0];if(!a)return false
  for(const distance of [.7,.9,1.15,1.4])for(const off of [0,.6,-.6,1.2,-1.2]){
   Object.assign(eng.player,{x:a.x+Math.sin(a.yaw+off)*distance,y:a.y+Math.cos(a.yaw+off)*distance,z:floorHeight(eng.map,a.x,a.y,a.floor),floor:a.floor,vz:0,crouching:false})
   if(canOccupy(eng.map,eng.player.x,eng.player.y,PLAYER_RADIUS,{z:eng.player.z,band:a.floor})&&pickSeat(eng,s)){if(eng===e)aim(a.x,a.y,a.z+.07);return true}
  }
  return false
 }
 const advance=(eng:any,seconds=.75)=>{for(let t=0;t<seconds;t+=1/60)updateSitting(eng,1/60)}
 const controlled=async()=>{
  const rows:any[]=[]
  for(const id of ['l02','l4','stone','l9','l11','traders','latrine'])for(const deg of [0,90,180,270]){
   const test:any=new Engine();test.player=structuredClone(e.player);test.npcs=[];test.seating=null;test.introT=0;test.inLiquid=0;test.msg=()=>{};test.dev.fly=false;test.player.level=id==='latrine'?10:108
   const w=24,n=w*w,a=()=>new Uint8Array(n);test.map={w,h:w,tiles:a().fill(1),wet:a(),elev:a(),outdoor:a(),step:a(),crawl:a(),ceiling:a(),up:a(),upWall:a(),up2:a(),upWall2:a(),stair:new Int32Array(n),liquid:a(),seaFloor:new Float32Array(n),dn:a(),dnWall:a(),tint:a(),floors:1,spawn:{x:11,y:12},structures:[],entities:[],items:[],exits:[],lights:[]}
   const s=cases[id]();s.data.deg=deg;if(id==='l02'){s.data.yaw=deg*Math.PI/180;delete s.data.deg}if(id==='stone'){s.data.rot=deg*Math.PI/180;delete s.data.deg}test.map.structures=[s]
   const root=factory(id,s);root.position.set(11,0,11);root.rotation.y=id==='latrine'?0:deg*Math.PI/180
   if(id==='stone'){const a=furnitureSeats(s,8)[0],o=root.getObjectByName('instr:toilet')!;o.position.set(a.x-Math.sin(a.yaw)*.065,0,a.z-Math.cos(a.yaw)*.065);o.rotation.y=a.yaw;root.rotation.y=0}
   if(id!=='foyer'&&id!=='l02')syncFurnitureSeats(s,root,0,id==='latrine'?10:108)
   if(id!=='stone')syncStructureModelColliders(s,root,0)
   ok(approach(test,s),id+'/'+deg+' safe front approach');ok(beginSitting(test,s),id+'/'+deg+' begins sitting');advance(test)
   ok(test.seating?.phase==='seated'&&test.seating.anchor.toilet,id+'/'+deg+' stable toilet pose')
   root.updateMatrixWorld(true);const anchor=seatsFor(s,test.map,test.player.level)[0],hit=new THREE.Raycaster(new THREE.Vector3(anchor.x,1.1,anchor.y),new THREE.Vector3(0,-1,0)).intersectObject(root,true)[0];ok(hit&&hit.point.y<anchor.z-.10,id+'/'+deg+' anchor directly above actual open bowl')
   ok(specialAction(test)?.id==='toiletFart',id+'/'+deg+' contextual action')
   const safe=sittingSafePosition(test);ok(safe&&canOccupy(test.map,safe.x,safe.y,PLAYER_RADIUS,{z:safe.z}),id+'/'+deg+' save uses safe standing position')
   ok(standUp(test),id+'/'+deg+' can stand');advance(test,.6);ok(!test.seating,id+'/'+deg+' exits seat');ok(specialAction(test)?.id!=='toiletFart',id+'/'+deg+' action removed on stand')
   rows.push({id,deg,seat:seatsFor(s,test.map,test.player.level)[0]});release(root)
  }
  return{...summary(),cases:rows}
 }
 let target:any
 const l02Setup=async()=>{await base.fixedScene();e.seating=null;e.dev.fly=false;e.l02.stopped=true;target=e.map.structures.filter((s:any)=>s.data?.fix==='toilet').sort((a:any,b:any)=>Math.hypot(a.x-e.player.x,a.y-e.player.y)-Math.hypot(b.x-e.player.x,b.y-e.player.y))[0];ok(target,'actual L02 has a generated toilet');ok(approach(e,target),'actual L02 safe approach');await until(()=>r.isNearWorldReady(e),'restroom geometry');await sleep(400);e.scanInteract();ok(e.interactTarget?.kind==='sit','actual E targets toilet');return summary()}
 const foyerSetup=async()=>{e.seating=null;e.player.prologue={step:'act0',flags:{got_phone:true}};e.loadLevel(900,{firstVisit:false});e.introT=0;e.paused=false;e.dev.fly=false;e.handsStowed=true;await until(()=>r.isNearWorldReady(e)&&!document.querySelector('.loading-screen'),'foyer build');target=e.map.structures.find((s:any)=>s.kind==='foyerprop'&&s.data?.pid==='toilet'&&s.solid);ok(target,'foyer actual fixture exists');ok(approach(e,target),'foyer toilet safe approach');await sleep(400);e.scanInteract();ok(e.interactTarget?.kind==='sit','actual foyer E targets toilet');return summary()}
 const seated=async(firstPerson=false)=>{
  ok(e.seating?.phase==='seated','actual key E reaches seated phase');ok(e.seating.anchor.toilet&&specialAction(e)?.id==='toiletFart','actual HUD has toilet action');r.seatedPlayer.firstPerson=firstPerson;r.seatedPlayer.update(e,20)
  if(firstPerson){look.pitch=-1.10;await sleep(150);return summary()}
  const o=e.map.inf,a=e.seating.anchor,x=a.x-(o?.ox??0),z=a.y-(o?.oy??0),camera=new THREE.PerspectiveCamera(48,1920/1080,.03,120)
  camera.position.set(x+Math.cos(a.yaw)*1.5+Math.sin(a.yaw)*1.5,e.player.z+1.3,z-Math.sin(a.yaw)*1.5+Math.cos(a.yaw)*1.5);camera.lookAt(x,e.player.z+.6,z)
  if(e.player.level===902){camera.fov=75;camera.updateProjectionMatrix();camera.position.set(x+Math.cos(a.yaw)*.30+Math.sin(a.yaw)*.95,e.player.z+1.4,z-Math.sin(a.yaw)*.30+Math.cos(a.yaw)*.95);camera.lookAt(x,e.player.z+.72,z)}
  const visible=[r.vm,r.vmFlash,r.vmLighter].map(o=>o.visible);[r.vm,r.vmFlash,r.vmLighter].forEach(o=>o.visible=false)
  const captureData=capture(r.scene,camera);[r.vm,r.vmFlash,r.vmLighter].forEach((o,i)=>o.visible=visible[i]);r.seatedPlayer.firstPerson=true
  return{...summary(),captureData,anchor:e.seating.anchor}
 }
 const sounds:any[]=[];let originalSource:any,context:any
 const audioSetup=async()=>{audio.resume();const nodes=audio.fxNodes();ok(nodes,'game sound bus exists');context=nodes!.ctx;await context.resume();ok(context.state==='running','native audio context unlocked');originalSource=context.createBufferSource;context.createBufferSource=function(){const source=originalSource.call(this),start=source.start;source.start=function(...args:any[]){if(source.buffer&&Math.abs(source.buffer.duration-.7)<.001){const data=source.buffer.getChannelData(0);sounds.push({at:e.time,duration:source.buffer.duration,peak:Math.max(...data.map(Math.abs)),rms:Math.sqrt(data.reduce((a,v)=>a+v*v,0)/data.length)})}return start.apply(source,args)};return source};return summary()}
 const soundCount=(expected:number)=>{ok(sounds.length===expected,'actual discrete sound count '+expected);ok(!e.specialPressed,'special press consumed');return summary()}
 const stood=()=>{ok(!e.seating,'actual E stands from toilet');ok(canOccupy(e.map,e.player.x,e.player.y,PLAYER_RADIUS,{z:e.player.z}), 'standing position has real clearance');ok(specialAction(e)?.id!=='toiletFart','toilet action hidden after standing');return summary()}
 const touchReady=()=>{const b=document.querySelector<HTMLElement>('[data-touch-id="special"]');ok(b?.textContent?.includes('放屁'),'actual mobile contextual button reads fart');const q=b!.getBoundingClientRect();return{...summary(),point:{x:q.x+q.width/2,y:q.y+q.height/2},desktopTouchSimulation:true}}
 const cleanup=()=>{if(context&&originalSource)context.createBufferSource=originalSource;for(const m of new Set(ownMaterials))m.dispose();for(const m of assets.materials.values())m.dispose();assets.atlas.dispose();return{...base.cleanup(),toiletChecks:checks}}
 return{...base,summary,controlled,l02SittingView:async()=>{await l02Setup();ok(beginSitting(e,target),'supplemental actual L02 sit');await until(()=>e.seating?.phase==='seated','sitting view');return seated()},l02Seated:()=>seated(),foyerSeated:()=>seated(),l02Setup,foyerSetup,seated:()=>seated(),firstPerson:()=>seated(true),audioSetup,soundOne:()=>soundCount(1),soundTwo:()=>soundCount(2),soundThree:()=>soundCount(3),soundFour:()=>soundCount(4),stood,touchReady,cleanup,...Object.fromEntries(Object.keys(cases).map(id=>['gallery'+id,()=>gallery(id)]))}
}
