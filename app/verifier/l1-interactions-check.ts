import * as THREE from 'three'
import {canOccupy} from '../src/game/core/player'
import {floorHeight,ceilingHeightAt,structColliders,structStandTopAt} from '../src/game/world/mapgen'
import {l1BakeStats} from '../src/game/renderer/l1BakeQueue'
import {requestDevMapPreview} from '../src/game/engine/devMap'

const sleep=(ms=50)=>new Promise(r=>setTimeout(r,ms))
const until=async(f:()=>unknown,label:string,timeout=120000)=>{const t=performance.now();while(!f()){if(performance.now()-t>timeout)throw Error('Timeout '+label);await sleep()}}
const key=(code:string)=>{const init={code,key:code==='Escape'?'Escape':code==='Space'?' ':code,bubbles:true,cancelable:true};window.dispatchEvent(new KeyboardEvent('keydown',init));window.dispatchEvent(new KeyboardEvent('keyup',init))}
export async function mount(app:any,before=false){
 const e=app.engine,r=app.renderer(),checks:string[]=[],records:any[]=[]
 const ok=(value:unknown,label:string)=>{if(!value)throw Error(label);checks.push(label)}
 const state=()=>({world:[e.player.x+e.map.inf.ox,e.player.y+e.map.inf.oy,e.player.z],mode:r.lightMode,camera:r.camera.position.toArray(),yaw:app.look.yaw,pitch:app.look.pitch,fov:r.camera.fov,memory:{...r.three.info.memory},held:r.vmHeld,cache:r.heldCache.size})
 const warm=async()=>{await until(()=>{const b=l1BakeStats();return r.isNearWorldReady(e)&&!b.active&&!b.queued&&!r.chunkBuilds.size&&!r.retiredWorld.length&&!r.precompileRunning&&r.precompileTimer===null},'current world/compile');await sleep(250)}
 const prepare=async()=>{
  e.devEnabled=true;e.dev.god=true;e.dev.frozenAI=true;e.dev.statLock=true;e.dev.phenOff.add('flicker');e.handsStowed=true;e.introT=0;e.blackoutT=0
  document.querySelector<HTMLButtonElement>('[aria-label="收起开发者面板"]')?.click();await warm()
  ok(e.player.level===1&&!r.three.getContext().isContextLost(),'Actual App enters L1 on a live WebGL context')
  return state()
 }
 let single:any
 const crate=async()=>{
  const find=(count:number)=>e.map.structures.filter((s:any)=>s.kind==='crate'&&s.data?.l1Crate&&Number(s.data.l1Stack??1)===count&&r.structMeshes.has(s)).sort((a:any,b:any)=>Math.hypot(a.x-e.player.x,a.y-e.player.y)-Math.hypot(b.x-e.player.x,b.y-e.player.y)).find((s:any)=>{
   const x=s.x+s.w/2,y=s.y+s.h/2,h=count*.68
   return canOccupy(e.map,x,y,.32,{z:h,band:0})&&ceilingHeightAt(e.map,x,y,3.25,0)>h+1.55+.15&&[[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy])=>canOccupy(e.map,x+dx*1.5,y+dy*1.5,.32,{z:0,band:0}))
  })
  single=find(1);ok(!!single,'A naturally generated single shipping case is available')
  const sample=(s:any)=>{
   const h=Number(s.data.l1Stack??1)*.68,x=s.x+s.w/2,y=s.y+s.h/2
   Object.assign(e.player,{x,y,z:h+.34,vz:0,floor:0,crouching:false});e.input.mx=e.input.my=0;e.input.jump=e.input.crouch=false
   for(let i=0;i<180;i++)e.updateMovement(1/120,{dmg:1,drain:1},false)
   const supported=Math.abs(e.player.z-h)<1e-5,colliders=structColliders(s,e.map)
   if(!before){const xNow=s.x+s.w/2,yNow=s.y+s.h/2;ok(supported,'Actual falling physics lands on case lid at '+h+'m');ok(canOccupy(e.map,xNow,yNow,.32,{z:h,band:0}),'Standing body is outside case collision at '+h+'m');ok(Math.abs(structStandTopAt(e.map,xNow,yNow,h,0)-h)<1e-5,'Production support query agrees with rendered lid')}
   records.push({kind:'case',stack:Number(s.data.l1Stack??1),supported,colliders,position:state()})
  }
  const stack=find(2);if(stack)sample(stack)
  sample(single)
  const cx=single.x+single.w/2,cy=single.y+single.h/2
  const direction=[[-1,0],[1,0],[0,-1],[0,1]].find(([dx,dy])=>canOccupy(e.map,cx+dx*1.5,cy+dy*1.5,.32,{z:0,band:0}))!
  const [dx,dy]=direction
  if(!before){
   Object.assign(e.player,{x:cx+dx*1.5,y:cy+dy*1.5,z:0,vz:0});e.input.mx=-dx;e.input.my=-dy;e.input.jump=true
   let peak=0
   for(let i=0;i<240;i++){if((cx-e.player.x)*dx+(cy-e.player.y)*dy>-.04)e.input.mx=e.input.my=0;e.updateMovement(1/120,{dmg:1,drain:1},false);peak=Math.max(peak,e.player.z)}
   ok(peak>.8&&Math.abs(e.player.z-.68)<1e-5,'A real jump from surrounding floor settles on the single case')
   e.input.mx=dx;e.input.my=dy;for(let i=0;i<105;i++)e.updateMovement(1/120,{dmg:1,drain:1},false);e.input.mx=e.input.my=0;for(let i=0;i<150;i++)e.updateMovement(1/120,{dmg:1,drain:1},false)
   ok(Math.abs(e.player.z)<1e-5,'Walking off the case returns to the real floor')
   sample(single)
  }
  app.look.yaw=Math.atan2(dx,dy);app.look.pitch=-.85;app.look.roll=0;await sleep(400)
  return state()
 }
 const hands=async()=>{
  e.handsStowed=false;e.input.mx=e.input.my=0;e.player.hotbar.fill(null);e.player.hotbar[0]={type:'crowbar',count:1};e.player.hotbar[1]={type:'almond',count:2};e.player.hotbar[2]={type:'wrench',count:1};e.player.selected=0;app.look.pitch=-.06
  await until(()=>r.vmHeld==='crowbar'&&r.stowK<.005,'crowbar raised');await sleep(350)
  const film=document.createElement('canvas');film.width=1920;film.height=360;const g=film.getContext('2d')!,timeline:any[]=[],render=r.render.bind(r);let tile=0,switched=false
  r.render=(...args:any[])=>{const value=render(...args),s=r.vmSwitch;timeline.push({time:performance.now(),held:r.vmHeld,y:r.vm.position.y,phase:s?.phase,dip:s?.dip??0});if(tile===0||tile===1&&switched&&(before||s?.dip>=.65)||tile===2&&switched&&r.vmHeld==='almond'&&(before||s?.phase==='idle')){g.drawImage(r.three.domElement,0,0,1920,1080,tile*640,0,640,360);tile++}return value}
  try{await until(()=>tile===1,'hand first frame');switched=true;key('Digit2');await until(()=>tile===3,'actual hotbar animation film');await sleep(40)}finally{r.render=render}
  ok(e.player.selected===1&&r.vmHeld==='almond','Production keyboard hotbar changes the selected and displayed item')
  if(!before){ok(timeline.some(v=>v.held==='crowbar'&&v.dip>.1),'Old item lowers before model swap');ok(Math.min(...timeline.map(v=>v.y))<timeline[0].y-.15,'Hand moves visibly below resting pose');ok(r.vmSwitch.phase==='idle'&&r.vmSwitch.dip===0,'Hand returns to idle after a short switch')
   key('Digit1');await until(()=>r.vmHeld==='crowbar'&&r.vmSwitch.phase==='idle','first rapid slot');key('Digit2');await sleep(20);key('Digit3');await until(()=>r.vmHeld==='wrench'&&r.vmSwitch.phase==='idle','latest rapid slot');ok(e.player.selected===2,'Rapid slot changes settle on the latest real selection')
   key('Digit1');e.attackCooldownT=0;e.attack();await sleep(40);ok(e.attackAnimT>0&&r.vmHeld==='crowbar'&&r.vmSwitch.dip===0,'Actual attack immediately takes priority over switching')
   await until(()=>e.attackAnimT<=0,'attack');key('Digit2');e.player.thirst=20;e.useSlot('hotbar',1);await sleep(40);ok(e.usingItem?.type==='almond'&&r.vmHeld==='almond'&&r.vmSwitch.dip===0,'Actual timed use takes priority over switching');await until(()=>!e.usingItem,'drink');ok(e.player.hotbar[1]?.count===1,'Switching does not change consumable settlement')
   key('AltLeft');key('Digit3');await sleep(400);ok(e.handsStowed&&!r.vm.visible,'Selecting a slot while stowed keeps the hand hidden');key('AltLeft');await until(()=>r.vm.visible&&r.vmHeld==='wrench'&&r.stowK<.005,'unstow');ok(r.heldCache.size<=12,'Switches preserve the bounded held-model cache')
  }
  records.push({kind:'hand-timeline',timeline});return{...state(),film:film.toDataURL('image/png')}
 }
 const map=async()=>{
  e.handsStowed=true;key('KeyM');await until(()=>!!document.querySelector('[data-world-map]'),'actual map UI')
  const opened=performance.now();if(!before)await until(()=>!!document.querySelector('[data-l1-map-legend]'),'L1 legend')
  const label=[...document.querySelectorAll('label')].find(l=>l.textContent?.includes('地图全开'));const box=label?.querySelector<HTMLInputElement>('input')
  if(box&&!box.checked){box.click();await sleep(500)}
  const canvas=document.querySelector<HTMLCanvasElement>('[data-world-map]')!
  if(!before){
   const text=document.querySelector('[data-l1-map-legend]')!.textContent??''
   ok(['天鹰段','跃金段','哥特段','衔尾段','花园段','小径','传说段','金属门','积水','容器','出口'].every(v=>text.includes(v)),'Actual map displays seven region symbols and feature legends')
   ok(!document.querySelector('[data-minimap]')?.parentElement?.querySelector('[data-l1-map-legend]'),'No legend is inserted underneath the HUD minimap')
   const signature=()=>JSON.stringify({chunks:[...e.map.inf.chunks.keys()],structures:e.map.structures.length,items:e.map.items.length,entities:e.map.entities.length,explored:[...e.explored],history:[...e.map.inf.explored].map(([k,v]:any)=>[k,[...v]])})
   const previous=signature(),controller=new AbortController(),start=performance.now(),preview=await requestDevMapPreview(e,{x:2000,y:-2000,span:96,floor:0},controller.signal)
   ok(preview.cells.length>0&&preview.cells.every(c=>c.regions?.length===1024&&c.doors&&c.walls),'Remote preview returns actual L1 architecture metadata');ok(signature()===previous,'Remote map preview changes no live world or exploration state')
   records.push({kind:'remote-preview',elapsedMs:performance.now()-start,chunks:preview.cells.length})
   const reveal=e.dev.mapReveal;e.dev.mapReveal=false
   const ordinary=await requestDevMapPreview(e,{x:2000,y:-2000,span:96,floor:0},new AbortController().signal)
   ok(ordinary.cells.length===0,'Ordinary map does not generate wholly unexplored far chunks');e.dev.mapReveal=reveal
   const {drawL1Map}=await import('../src/game/content/l1Map'),off=document.createElement('canvas');off.width=off.height=192;const ctx=off.getContext('2d')!
   e.dev.mapReveal=false;ctx.translate(-1952*2,2048*2);drawL1Map(ctx,e,{x0:1952,y0:-2048,x1:2048,y1:-1952,scale:2,preview})
   ok(!ctx.getImageData(0,0,192,192).data.some(Boolean),'Unexplored terrain stays invisible even if preview metadata was cached');e.dev.mapReveal=reveal
  }
  return{openMs:performance.now()-opened,width:canvas.width,height:canvas.height,...state()}
 }
 const closeMap=async()=>{key('Escape');await until(()=>!document.querySelector('[data-world-map]'),'close map');await sleep(250)}
 const corpse=async()=>{
  e.handsStowed=true;e.input.crouch=true;r.setFov(35,35)
  let found:any
  for(const s of e.map.structures.filter((s:any)=>s.kind==='corpse')){
   const root=r.structMeshes.get(s),body=root?.getObjectByName('object70 body')as THREE.Mesh|undefined;if(!body)continue
   const mats=Array.isArray(body.material)?body.material:[body.material],index=mats.findIndex(m=>m.name.includes('/ face'));if(index<0)continue
   const mat=mats[index]as THREE.MeshStandardMaterial,geo=body.geometry,p=geo.getAttribute('position'),n=geo.getAttribute('normal'),center=new THREE.Vector3(),normal=new THREE.Vector3();let count=0
   body.updateWorldMatrix(true,false)
   for(const group of geo.groups.filter(g=>g.materialIndex===index))for(let i=group.start;i<group.start+group.count;i++){const j=geo.index?.getX(i)??i;center.add(new THREE.Vector3().fromBufferAttribute(p,j).applyMatrix4(body.matrixWorld));normal.add(new THREE.Vector3().fromBufferAttribute(n,j).transformDirection(body.matrixWorld));count++}
   if(!count)continue;center.divideScalar(count);normal.normalize()
   for(const distance of [1.05,1.3,1.55]){
    const x=center.x+normal.x*distance,y=center.z+normal.z*distance,z=floorHeight(e.map,x,y,0)
    if(!canOccupy(e.map,x,y,.32,{z,band:0,crouch:true}))continue
    Object.assign(e.player,{x,y,z,vz:0});app.look.yaw=Math.atan2(x-center.x,y-center.z);app.look.pitch=Math.atan2(center.y-(z+1.0),Math.hypot(x-center.x,y-center.z));app.look.roll=0;found={s,mat,worldCenter:center.clone().add(new THREE.Vector3(e.map.inf.ox,0,e.map.inf.oy))};break
   }
   if(found)break
  }
  ok(!!found,'A natural corpse has a collision-safe head close-up')
  await until(()=>found.mat.map?.userData.ready!==false,'corpse face texture');await sleep(650)
  const src=found.mat.map?.image?.currentSrc??found.mat.map?.image?.src
  if(!before)ok(src?.includes('neutral-blink.png'),'Actual world corpse material resolves to the closed-eye image')
  const p=found.worldCenter.clone().sub(new THREE.Vector3(e.map.inf.ox,0,e.map.inf.oy)).project(r.camera),cx=(p.x+1)*960,cy=(1-p.y)*540
  return{...state(),faceTexture:src,detailClip:{x:Math.max(0,Math.min(1420,cx-250)),y:Math.max(0,Math.min(580,cy-250)),width:500,height:500,scale:1}}
 }
 return{prepare,crate,hands,map,closeMap,corpse,result:()=>({before,checks,records,state:state()})}
}
