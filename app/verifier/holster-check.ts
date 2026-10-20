import {setKeybind,resetKeybinds,DEFAULT_KEYBINDS} from '../src/game/core/keybinds'
import {makeEntity} from '../src/game/entities'
import {genRandomNpcs} from '../src/game/content/npcs'
const wait=(ms=80)=>new Promise(r=>setTimeout(r,ms))
const key=(code:string,repeat=false)=>{window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true,cancelable:true,repeat}));if(!repeat)window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true,cancelable:true}))}
export async function mount(app:any){
 const e=app.engine,p=e.player,r=app.renderer(),checks:string[]=[]
 const ok=(v:unknown,label:string)=>{if(!v)throw Error(label);checks.push(label)}
 const state=()=>({stowed:e.handsStowed,visible:r.vm.visible,vmHeld:r.vmHeld,stow:r.stowK,cooldown:e.attackCooldownT,using:e.usingItem?.type??null,offhand:r.vmFlash.visible,light:r.flash.intensity,position:[p.x,p.y,p.z],memory:{...r.three.info.memory},crosshair:document.getElementById('br-crosshair')?.style.display})
 const prepare=async(type='crowbar')=>{
  e.dev.god=true;e.dev.statLock=false;e.dev.frozenAI=true;e.dev.noAttackCooldown=false;e.introT=0
  e.map.entities=[];e.map.items=[];e.projectiles=[];e.particles=[];e.usingItem=null;e.lootPanel=null;e.searching=null;e.interactTarget=null
  p.x=41.7;p.y=25.5;p.z=0;p.vz=0;p.crouching=false;p.selected=0;p.hotbar.fill(null);p.backpack.fill(null);p.hotbar[0]={type,count:2};p.stamina=100;p.sanity=30;p.hunger=30
  p.equip.offhand={type:'flashlight',count:1};p.flashlight=true;p.battery=100;p.flashJamT=0;e.syncPassives()
  e.handsStowed=false;e.inspectHeld=false;e.gunCandyT=0;e.attackAnimT=0;e.attackCooldownT=0;e.attackCooldownDur=0
  app.look.yaw=-Math.PI/2;app.look.pitch=-.12;app.look.roll=0
  setKeybind('attack','KeyT');setKeybind('quickuse','KeyY')
  await wait(900)
  for(const yaw of [-Math.PI/2,0,Math.PI/2,Math.PI]){app.look.yaw=yaw;await wait(80);if(!e.getInteract())break}
  ok(!e.paused,'Production App is running with its input listeners')
  return state()
 }
 const stowed=async()=>{
  await wait(450);ok(e.handsStowed&&!r.vm.visible,'Main hand lowers out of view and stays stowed');ok(r.vmFlash.visible&&r.flash.intensity>0,'Offhand flashlight remains usable');ok(document.getElementById('br-crosshair')?.style.display!=='none','Interaction crosshair stays visible')
  const hints=document.querySelector('.hud-keyhints')?.textContent??''
  ok(hints.includes('取出主手')&&!hints.includes('攻击'),'Desktop hints show draw action instead of blocked attacks')
  return state()
 }
 const guardChecks=async()=>{
  ok(e.handsStowed,'Guard check begins stowed')
  const victim=makeEntity('dryshrimp',p.x+.8,p.y,0);e.map.entities=[victim];const hp=victim.hp,stamina=p.stamina,projectiles=e.projectiles.length,particles=e.particles.length
  for(const type of ['crowbar','glowstick','almond','chalkstub','squirtgun']){
   p.hotbar[0]={type,count:2};const before=JSON.stringify(p.hotbar)
   e.attack();e.throwHeld(type);e.quickUse();e.quickDrop();e.drawChalk();e.useSlot('hotbar',0)
   ok(JSON.stringify(p.hotbar)===before&&!e.usingItem,'Stowed attack/use/throw/drop blocked: '+type)
  }
  e.gunCandyT=10;e.shootChocolate();e.gunCandyT=0
  e.squirtTank='almond';e.squirtAmmo=3;p.backpack[0]={type:'almond',count:1};e.squirt();e.loadSquirt('almond');e.clearSquirt();e.useSlot('backpack',0)
  ok(e.squirtAmmo===3&&e.squirtTank==='almond'&&p.backpack[0].count===1,'Spray, reload, empty and backpack use cannot bypass holster')
  ok(victim.hp===hp&&p.stamina===stamina&&e.projectiles.length===projectiles&&e.particles.length===particles&&!e.attackAnimT,'Blocked actions spend no damage, stamina, ammunition or attack effect')
  p.hotbar[0]={type:'crowbar',count:2};p.hotbar[1]={type:'almond',count:2};p.selected=1;await wait(100);ok(e.handsStowed&&!r.vm.visible,'Hotbar switching does not draw the hand')
  key('KeyT');key('KeyY');await wait(100);ok(!e.usingItem&&p.hotbar[1].count===2&&victim.hp===hp,'Actual keyboard attack and quick use remain blocked')
  p.selected=0;e.attackCooldownT=.55;e.toggleHands();e.toggleHands();ok(Math.abs(e.attackCooldownT-.55)<.001,'Stowing and drawing cannot reset attack cooldown')
  e.toggleHands();p.hotbar[0]={type:'almond',count:2};e.useSlot('hotbar',0);ok(!!e.usingItem,'Drawn consumable can begin its real timed action')
  e.toggleHands();e.updateItemUse(20);ok(!e.usingItem&&p.hotbar[0].count===2,'Stowing cancels an unfinished use without consuming it')
  p.hotbar[0]={type:'crowbar',count:2};p.selected=0;e.attackCooldownT=0
  await wait(450);return{checks:[...checks],state:state()}
 }
 const interaction=async()=>{
  ok(e.handsStowed,'Interaction check begins stowed')
  app.look.yaw=-Math.PI/2
  const item={id:882000,type:'battery',x:p.x+.65,y:p.y};e.map.items=[item];let found=false
  for(let pitch=-1.45;pitch<-.35;pitch+=.07){app.look.pitch=pitch;await wait(25);e.scanInteract();if(e.interactTarget?.kind==='item'&&e.interactTarget.it?.id===item.id){found=true;break}}
  ok(found,'Actual scan finds a loose item while hands are stowed');key('KeyE');await wait(160)
  ok(!e.map.items.some((i:any)=>i.id===item.id)&&e.countItem('battery')===1,'Production E interaction still picks up an item')
  app.look.pitch=-.12;const x=p.x,y=p.y;key('KeyW',true);await wait(160);window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',bubbles:true}));await wait(60)
  ok(Math.hypot(p.x-x,p.y-y)>.03,'Player can still move while stowed')
  key('F1');await wait(60);ok(e.handsStowed&&e.handsHidden,'Immersion mode does not draw the hand');key('F1');await wait(80);ok(e.handsStowed&&!e.handsHidden&&!r.vm.visible,'Leaving immersion keeps gameplay holster active')
  return{checks:[...checks],state:state()}
 }
 const restored=async()=>{
  await wait(450);ok(!e.handsStowed&&r.vm.visible,'Drawing restores the held model')
  e.attackCooldownT=0;key('KeyT');await wait(70);ok(e.attackAnimT>0&&e.attackCooldownT>0,'Actual keyboard attack resumes after drawing')
  e.map.entities=[];p.hotbar[0]={type:'almond',count:1};p.selected=0;const sanity=p.sanity;key('KeyY')
  ok(!!e.usingItem,'Actual keyboard quick use begins after drawing');for(let i=0;i<100&&e.usingItem;i++)await wait(40)
  ok(!p.hotbar[0]&&p.sanity>sanity,'Timed consumable completes and consumes once after drawing')
  return{checks:[...checks],state:state()}
 }
 const repeatAndRebind=async()=>{
  const before=e.handsStowed;key('AltLeft',true);key('AltLeft',true);ok(e.handsStowed===before,'Key repeat cannot repeatedly toggle holster')
  setKeybind('attack','AltRight');key('AltRight');ok(e.handsStowed===before,'Right Alt alias does not steal another explicit binding');e.input.attack=false;setKeybind('attack','KeyT')
  setKeybind('holster','KeyH');key('AltLeft');ok(e.handsStowed===before,'Rebinding removes the default Alt action');key('KeyH');ok(e.handsStowed!==before,'Rebound key toggles through production App');key('KeyH');resetKeybinds();setKeybind('attack','KeyT');setKeybind('quickuse','KeyY')
  ok(DEFAULT_KEYBINDS.holster==='AltLeft','New binding defaults to Alt for existing settings');return{checks:[...checks],state:state()}
 }
 const faces=async()=>{
  await prepare();let seed=82;const defs=genRandomNpcs(()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296},3),template=e.npcs[0]
  if(!template)throw Error('Expected outpost NPC template')
  e.npcs=defs.map((def:any,i:number)=>({...template,id:def.id,def,x:42.3+i*.6,y:25.5,z:0,homeX:42.3+i*.6,homeY:25.5,tx:42.3+i*.6,ty:25.5,floor:0,facing:Math.PI/2,dead:false,hostile:false}))
  p.x=42.9;p.y=27;p.z=0;p.flashlight=false;app.look.yaw=0;app.look.pitch=.03;e.handsStowed=true
  for(let i=0;i<160;i++){await wait(40);if(e.npcs.every((n:any)=>r.npcMeshes.has(n.id)))break}
  await wait(500);const records=e.npcs.map((n:any)=>{const rec=r.npcMeshes.get(n.id);let model:any;rec?.grp.traverse((o:any)=>{if(o.userData.retro)model=o});if(!model)throw Error('Random NPC missing from actual game');const mat=model.userData.retro.mesh.material[1];ok(String(mat.map?.image?.src).includes('/pool/'),'Actual game NPC uses pool face');ok(mat.customProgramCacheKey().includes('v82'),'Actual game NPC uses the new hair shader');return{id:n.id,path:mat.map?.image?.src}})
  return{records,state:state()}
 }
 const buttons=()=>[...document.querySelectorAll<HTMLButtonElement>('[data-touch-id="holster"],[data-touch-id="attack"],.tc-quickuse')].map(b=>({id:b.dataset.touchId??'quickuse',label:b.getAttribute('aria-label'),pressed:b.getAttribute('aria-pressed'),disabled:b.getAttribute('aria-disabled'),rect:(()=>{const r=b.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2}})()}))
 const mobileCheck=async(stow=true)=>{
  await wait(450);ok(e.handsStowed===stow,'Touch holster toggles the actual engine');ok(r.vm.visible!==stow,'Touch holster updates the actual viewmodel')
  const rows=buttons(),h=rows.find(b=>b.id==='holster')!,a=rows.find(b=>b.id==='attack')!,u=rows.find(b=>b.id==='quickuse')!
  ok(h.rect.width>=48&&h.rect.height>=48,'Holster touch target is at least 48 pixels');ok(h.rect.x>=0&&h.rect.y>=0&&h.rect.x+h.rect.width<=innerWidth&&h.rect.y+h.rect.height<=innerHeight,'Holster control stays within viewport')
  ok(h.pressed===String(stow),'Accessible pressed state tracks holster');ok(!stow||u.disabled==='true','Quick use is visibly unavailable while stowed');ok(!stow||a.disabled==='true','Attack is visibly unavailable while stowed')
  return{checks:[...checks],buttons:rows,state:state()}
 }
 const mobileBlocked=async()=>{await wait(120);ok(e.handsStowed&&!e.usingItem&&e.player.hotbar[0]?.count===2&&!e.attackAnimT,'Touch attack and quick use cannot bypass holster');return{checks:[...checks],state:state()}}
 return{prepare,state,stowed,guardChecks,interaction,restored,repeatAndRebind,faces,buttons,mobileCheck,mobileBlocked,result:()=>({checks:[...checks],state:state(),memoryKeys:[...app.memory.keys()]})}
}
