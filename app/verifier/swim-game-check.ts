import { floorHeight, l11MapWater } from '../src/game/world/mapgen'
import { canOccupy } from '../src/game/core/player'
import { l11CanalX } from '../src/game/world/l11Layout'
import { resetSwim } from '../src/game/engine/swim'
import { breathLimit } from '../src/game/engine/movement'
const sleep=(ms=100)=>new Promise(r=>setTimeout(r,ms))
const until=async(fn:()=>unknown,label:string,limit=60000)=>{const t=performance.now();while(!fn()){if(performance.now()-t>limit)throw Error('Timeout '+label);await sleep()}}
export async function mount(app:any){
 const e=app.engine,r=app.renderer(),checks:string[]=[],records:any[]=[]
 const ok=(v:unknown,s:string)=>{if(!v)throw Error(s);checks.push(s)}
 const key=(code:string,on:boolean)=>window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,key:code==='Space'?' ':code==='ControlLeft'?'Control':code==='ShiftLeft'?'Shift':code.replace('Key','').toLowerCase(),bubbles:true}))
 const release=()=>{for(const c of ['KeyW','KeyS','KeyA','KeyD','Space','ControlLeft','ShiftLeft'])key(c,false);e.input.mx=e.input.my=0;e.input.jump=e.input.crouch=e.input.sprint=false}
 const clear=()=>{e.map.entities=[];for(const c of e.map.inf?.chunks.values()??[])c.entities=[]}
 const quiet=()=>{release();e.dev.frozenAI=true;e.dev.god=true;e.dev.statLock=false;e.dev.bright=false;e.over=false;e.transition=null;e.introT=0;e.handsHidden=false;e.handsStowed=false;e.usingItem=null;e.searching=null;e.player.hp=100;e.player.stamina=100;e.player.hunger=e.player.thirst=e.player.sanity=100;e.player.battery=100;e.player.flashlight=true}
 const ready=()=>r.isNearWorldReady(e)&&!e.paused&&!document.querySelector('.loading-screen')
 const loc=()=>({x:e.player.x+(e.map.inf?.ox??0),y:e.player.y+(e.map.inf?.oy??0),z:e.player.z})
 const hs=()=>Math.hypot(e.swim.vx,e.swim.vy)
 const status=()=>({level:e.player.level,position:loc(),submerged:e.submerged,liquid:e.inLiquid,velocity:[e.swim.vx,e.swim.vy,e.swim.vz],oxygen:{used:e.breathT,stage:e.swim.stage,black:e.swim.blackK},hands:{right:r.vm.visible,left:r.vmFlash.visible,lighter:r.vmLighter.visible,rightPose:r.swimHand,leftPalm:r.swimLeftHand,blend:r.swimArmSt.k},memory:{...r.three.info.memory},calls:r.three.info.render.calls,triangles:r.three.info.render.triangles})
 const station=async()=>{release();quiet();e.player.x=-10-(e.map.inf?.ox??0);e.player.y=15-(e.map.inf?.oy??0);e.updateInfiniteWindow();const floor=floorHeight(e.map,e.player.x,e.player.y,0);e.player.z=Math.max(floor+.6,-5);e.player.vz=0;resetSwim(e.swim);e.breathT=0;e.player.equip.head={type:'headlamp',count:1};e.player.equip.offhand=null;e.syncPassives();e.player.flashlight=true;app.look.yaw=-Math.PI/2;app.look.pitch=-.24;await until(ready,'ocean station');clear();await sleep(500);return floor}
 const ocean=async()=>{quiet();e.loadLevel(7,{mapSeed:424242,firstVisit:false});quiet();await until(ready,'L7');await station();await sleep(500);ok(e.inLiquid===1&&e.submerged,'Actual L7 water activates the shared swim controller');ok(r.vm.visible&&r.vmFlash.visible&&r.swimLeftHand,'Empty hands display both swimming palms');ok(r.swimHand==='__swim','Right fist changes to the cached swimming palm');return status()}
 const controls=async()=>{
  await station();const start=loc();key('KeyW',true);await sleep(1400);key('KeyW',false);const speed=hs(),released=loc();await sleep(800);const glide=Math.hypot(loc().x-released.x,loc().y-released.y)
  ok(speed>1.9&&speed<2.6,'Actual forward key accelerates to the configured swim speed');ok(glide>.3,'Releasing the movement key preserves a short glide')
  release();e.swimMode='view';app.look.pitch=-.65;const z=e.player.z;key('KeyW',true);await sleep(1100);key('KeyW',false);const dive=e.player.z-z;ok(dive<-.35,'View swimming follows downward camera pitch')
  await station();e.swimMode='flat';app.look.pitch=-.65;const zFlat=e.player.z;key('KeyW',true);await sleep(1000);key('KeyW',false);const flat=e.player.z-zFlat;ok(Math.abs(flat)<.25,'Flat swimming keeps camera pitch independent of depth')
  release();key('ControlLeft',true);await sleep(850);key('ControlLeft',false);const down=e.swim.vz;ok(down<-.7,'Holding crouch dives with the real game input')
  key('Space',true);await sleep(1000);key('Space',false);ok(e.swim.vz>.7,'Holding jump ascends with the real game input');release()
  await station();e.swimMode='view';const strokes=e.swim.strokes;key('KeyW',true);key('ShiftLeft',true);await sleep(1800);release();ok(e.swim.strokes-strokes>=2&&e.player.stamina<100,'Real sprint input creates repeated strokes and spends stamina')
  const row={speed,glide,dive,flat,down,strokes:e.swim.strokes-strokes,...status()};records.push(row);return row
 }
 const hands=async()=>{
  await station();e.player.equip.head=null;e.player.equip.offhand={type:'flashlight',count:1};e.syncPassives();e.player.flashlight=true;key('KeyW',true);await sleep(650);release()
  ok(r.vmFlash.visible&&r.vmParts.flashlight.visible&&!r.swimLeftHand,'Equipped flashlight retains its grip during swimming')
  const a=r.flash.target.position.clone();await sleep(300);ok(a.distanceTo(r.flash.target.position)>.01,'Offhand flashlight beam follows the swimming arm')
  e.player.hotbar[0]={type:'knife',count:1};e.player.selected=0;await sleep(700);e.attackCooldownT=0;e.attack();await sleep(80)
  ok(e.attackAnimT>0&&r.vmHeld==='knife'&&r.swimHand!=='__swim','Underwater melee keeps the equipped weapon and attack animation')
  ok(r.vm.position.distanceTo({x:.27,y:-.3,z:-.55})>.01,'Melee animation moves the viewmodel while swimming');const attack={duration:e.attackAnimDur,remaining:e.attackAnimT,pending:e.meleePending?.t}
  await sleep(900);e.player.hotbar[0]=null;await sleep(700);ok(r.swimHand==='__swim','Swimming palm returns after putting away a weapon')
  e.handsStowed=true;await sleep(500);ok(!r.vm.visible,'Holstering hides the main hand while swimming');e.handsStowed=false
  e.player.equip.offhand={type:'lighter',count:1};e.syncPassives();await sleep(250);ok(r.vmLighter.visible&&!r.vmFlash.visible,'Offhand lighter does not create a third arm')
  e.player.equip.offhand={type:'flashlight',count:1};e.syncPassives();e.player.flashlight=true;await sleep(350);return{attack,...status()}
 }
 const breath=async()=>{
  release();e.breathT=breathLimit(e)*.93;e.swim.airT=0;await sleep(500)
  ok(e.swim.stage===2,'High oxygen consumption activates contractions in the actual game')
  const u=r.photoFinish?.uniforms.swimBreath.value;ok(u&&u.x>0&&u.y>0,'Hypoxia reaches the existing WebGL finish shader')
  ok(!document.querySelector('.anim-o2Pulse'),'Hypoxia does not install a HUD-covering backdrop filter');return status()
 }
 const blackout=async()=>{e.breathT=breathLimit(e)+4;e.swim.airT=0;await sleep(2400);ok(e.swim.blackK>.3&&r.photoFinish?.uniforms.swimBreath.value.z>.25,'Sustained hypoxia progressively darkens the game image');ok(document.body.innerText.includes('氧')||document.body.innerText.includes('屏气'),'Oxygen HUD remains mounted during blackout');return status()}
 const recover=async()=>{release();e.player.z=.1;e.player.vz=0;e.swim.vz=0;const before=e.breathT;await sleep(2100);ok(!e.submerged&&e.breathT<before-8,'Surfacing triggers gradual fast oxygen recovery');ok(e.swim.blackK<.05,'Blackout fades after breathing air');e.breathT=0;await sleep(200);ok(r.photoFinish?.uniforms.swimBreath.value.length()<.01,'Recovered oxygen clears all breath shader terms');return status()}
 const canal=async()=>{
  quiet();e.loadLevel(11,{mapSeed:20261006,firstVisit:false});quiet();e.player.x=l11CanalX(20261006,0,558)-(e.map.inf?.ox??0);e.player.y=558-(e.map.inf?.oy??0);e.player.z=-4.4;e.updateInfiniteWindow();await until(ready,'L11 canal',120000);clear();let point:any=null
  for(let y=6;y<e.map.h-6&&!point;y+=2)for(let x=6;x<e.map.w-6;x+=2){const w=l11MapWater(e.map,x+.5,y+.5);if(w&&!w.bridge&&canOccupy(e.map,x+.5,y+.5,.32,{z:w.surface-3.3,band:0})){point={x:x+.5,y:y+.5,z:w.surface-3.3};break}}
  ok(point,'Generated L11 has an unobstructed canal test point');Object.assign(e.player,point);e.player.vz=0;e.updateInfiniteWindow();resetSwim(e.swim);e.breathT=0;e.player.equip.head={type:'divemask',count:1};e.player.equip.offhand={type:'flashlight',count:1};e.syncPassives();e.player.flashlight=true;app.look.yaw=0;app.look.pitch=-.15;await until(ready,'canal viewport');clear();await sleep(500)
  ok(e.inLiquid===1&&e.submerged,'Actual L11 canal uses underwater swimming and oxygen');e.swimMode='flat';key('Space',true);await sleep(650);release();ok(e.swim.vz>.5,'Canal ascent uses the same inertial control');ok(e.swim.pressStage===0&&e.swim.bendsT===0,'Canals do not receive ocean pressure or decompression penalties');return status()
 }
 const resources=async()=>{
  await ocean();await until(()=>r.chunkBuilds.size===0,'settled ocean');await sleep(600);const rounds:any[]=[]
  const gl=r.three.getContext(),saved=new Map<string,any>();let draws=0,triangles=0
  for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){const original=gl[name];saved.set(name,original);gl[name]=function(...args:any[]){draws++;const count=name.startsWith('drawArrays')?args[2]:args[1],instances=name.endsWith('Instanced')?args.at(-1):1;if(args[0]===gl.TRIANGLES)triangles+=count/3*instances;return original.apply(this,args)}}
  try { for(let i=0;i<5;i++){const times:number[]=[];let last=performance.now(),d0=draws,t0=triangles;for(let k=0;k<60;k++){await new Promise(requestAnimationFrame);const now=performance.now();times.push(now-last);last=now}times.sort((a,b)=>a-b);rounds.push({median:times[30],p95:times[57],drawsPerFrame:(draws-d0)/60,trianglesPerFrame:(triangles-t0)/60})} } finally { for(const [name,original]of saved)gl[name]=original }
  const before={...r.three.info.memory};for(let i=0;i<6;i++){e.handsStowed=i%2===0;await sleep(180)}e.handsStowed=false;await sleep(500);const after={...r.three.info.memory};ok(after.geometries<=before.geometries+2&&after.textures<=before.textures,'Repeated swim/holster poses reuse cached geometry and textures');return{rounds,before,after,...status()}
 }
 const settings=async()=>{
  release();e.breathT=0
  const escape=()=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'Escape',key:'Escape',bubbles:true}))}
  escape();await until(()=>document.body.innerText.includes('已暂停'),'pause menu')
  ;[...document.querySelectorAll('button')].find(b=>b.querySelector('.menu-label')?.textContent==='设置')?.click();await until(()=>document.querySelector('[aria-label="设置分类"]'),'settings modal')
  ;[...document.querySelectorAll('[aria-label="设置分类"] button')].find(b=>b.querySelector('.set-tab-label')?.textContent==='操作')?.click();await until(()=>document.querySelector('[aria-label="游泳方向"]'),'swimming settings')
  const buttons=[...document.querySelectorAll('[aria-label="游泳方向"] button')] as HTMLButtonElement[]
  buttons.find(b=>b.textContent?.includes('水平游'))!.click();await until(()=>e.swimMode==='flat','flat setting applied')
  ok(JSON.parse(app.memory.get('br_settings')).swimMode==='flat','Swim mode persists through the actual settings UI')
  ok(buttons.find(b=>b.textContent?.includes('水平游'))!.getAttribute('aria-pressed')==='true','Selected swim mode is exposed as active')
  buttons.find(b=>b.textContent==='沿视线游')!.click();await until(()=>e.swimMode==='view','view setting restored')
  ;(document.querySelector('[aria-label="关闭设置"]')as HTMLButtonElement).click();await sleep(200);escape();await until(ready,'resume after settings');return{mode:e.swimMode,saved:JSON.parse(app.memory.get('br_settings')).swimMode}
 }
 const touchReady=async()=>{await station();e.swimMode='flat';await until(()=>document.querySelector('[aria-label="下潜（按住）"]'),'mobile diving button');return touchButton('下潜（按住）')}
 const touchButton=(label:string)=>{const b=document.querySelector('[aria-label="'+label+'"]')!,r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,label}}
 const touchState=()=>({crouch:e.input.crouch,jump:e.input.jump,vz:e.swim.vz,z:e.player.z})
 const touchCheck=(phase:string)=>{const s=touchState();if(phase==='dive')ok(s.crouch&&s.vz<-.7,'Touch hold dives in the actual game');if(phase==='cancel')ok(!s.crouch,'Touch cancellation clears the diving hold');if(phase==='ascend')ok(s.jump&&s.vz>.5,'Touch hold ascends in the actual game');if(phase==='release')ok(!s.jump,'Touch release clears the ascent hold');return s}
 const cleanup=async()=>{release();quiet();e.loadLevel(4,{mapSeed:424242,firstVisit:false});quiet();await until(ready,'return L4');await sleep(300);ok(e.swim.stage===0&&e.swim.blackK===0&&e.swim.bendsT===0&&!e.swim.out,'Changing level clears transient swim, breath and mantle states');return status()}
 return{ocean,controls,hands,breath,blackout,recover,canal,resources,settings,touchReady,touchButton,touchState,touchCheck,cleanup,summary:()=>({checks,records,status:status()})}
}
