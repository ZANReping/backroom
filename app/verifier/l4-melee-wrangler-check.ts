import * as THREE from 'three'
import {makeEntity} from '../src/game/entities'
import {canOccupy} from '../src/game/core/player'
import {floorHeight} from '../src/game/world/mapgen'
import {l4Block} from '../src/game/world/l4Plan'
import {MELEE_KINDS,MELEE} from '../src/game/content/melee'
import {slotDur,slotMaxDur} from '../src/game/engine/melee'
import {initWrangler,wranglerForceFrame,wranglerSetCaptor,wranglerDebug,WR} from '../src/game/engine/wranglerAI'
import {wranglerBudget,type WranglerKind} from '../src/game/renderer/wranglerMesh'
import {meleeBudget} from '../src/game/renderer/meleeMesh'
const sleep=(n=100)=>new Promise(r=>setTimeout(r,n))
const until=async(f:()=>unknown,label:string,limit=150000)=>{const start=performance.now();while(!f()){if(performance.now()-start>limit)throw Error('Timeout '+label);await sleep(35)}}
export async function mount(app:any){
 const e=app.engine,r=app.renderer(),checks:string[]=[],records:any[]=[];let serial=980000,base={x:e.player.x,y:e.player.y},wall:any
 const render=r.render;r.three.info.autoReset=false;r.render=function(...a:any[]){r.three.info.reset();return render.apply(this,a)}
 const ok=(v:unknown,msg:string)=>{if(!v)throw Error(msg);checks.push(msg)}
 const memory=()=>({...r.three.info.memory,programs:r.three.info.programs.length})
 const clear=()=>{if(e.map){e.map.entities=[];for(const c of e.map.inf?.chunks.values()??[])c.entities=[]}const f=wranglerForceFrame(e);f.captor=undefined;f.holes=[];f.eggs=[];f.black=0;f.wake=undefined;e.particles=[]}
 const reset=()=>{e.paused=true;e.over=false;e.dev.frozenAI=true;e.dev.god=true;e.dev.statLock=true;e.dev.invisible=false;e.dev.bright=false;e.handsStowed=true;e.player.hp=100;e.player.sanity=100;e.player.battery=100;e.player.flashlight=false;e.player.z=0;e.player.vz=0;e.player.slowT=0;e.input.mx=e.input.my=0;e.input.jump=e.input.attack=e.input.attackHeld=e.input.interact=false;e.meleePending=e.meleePress=null;e.meleeCharge=0;e.attackCooldownT=0;e.usingItem=null}
 const aim=(tx:number,ty:number,z=1.5)=>{const p=e.player;Object.assign(app.look,{yaw:Math.atan2(p.x-tx,p.y-ty),pitch:Math.atan2(z-(p.z+1.62),Math.hypot(tx-p.x,ty-p.y)),roll:0});p.facing=Math.atan2(ty-p.y,tx-p.x)}
 const safe=(x:number,y:number,rad=.34)=>canOccupy(e.map,x,y,rad,{z:floorHeight(e.map,x,y)})
 const world=()=>[e.player.x+(e.map.inf?.ox??0),e.player.y+(e.map.inf?.oy??0),e.player.z]
 const ready=()=>r.isNearWorldReady(e)
 const place=async(x:number,y:number)=>{const m=e.map;e.player.x=x-(m.inf?.ox??0);e.player.y=y-(m.inf?.oy??0);e.player.z=0;e.player.vz=0;e.updateInfiniteWindow();await until(ready,'streaming target');return{ox:e.map.inf?.ox??0,oy:e.map.inf?.oy??0}}
 const waitModel=async(q:any)=>{await until(()=>r.entityMeshes.has(q.id)&&!q.presentationPending,'GPU model '+q.def.type);await sleep(180);const g=r.entityMeshes.get(q.id);ok(g&&g.visible,'actual model visible: '+q.def.type+'/'+(q.wg?.kind??''));return g}
 const status=()=>({level:e.player.level,paused:e.paused,near:ready(),chunks:r.chunkGroups.size,tasks:r.chunkBuilds.size,memory:memory(),world:world()})
 const sceneL4=async(name:string)=>{
  reset();clear();let block:any,requested=name==='window-north'||name==='window-east'?'hall':name
  if(name==='watercooler')requested='open'
  for(let d=0;d<=5&&!block;d++)for(let j=-d;j<=d&&!block;j++)for(let i=-d;i<=d&&!block;i++)if(Math.max(Math.abs(i),Math.abs(j))===d){const b=l4Block(e.map.inf.seed,i,j);if(b.type===requested)block=b}
  ok(block,'L4 deterministic block '+requested)
  const start=performance.now(),b=block;await place(b.ix0+9,b.iy0+9)
  let target:any
  if(name==='watercooler'){
   target=e.map.structures.find((s:any)=>s.kind==='watercooler')
   ok(target,'real generated water cooler')
   let spot:any;for(const [dx,dy]of [[1.8,0],[-1.8,0],[0,1.8],[0,-1.8]])if(safe(target.x+.5+dx,target.y+.5+dy)){spot={x:target.x+.5+dx,y:target.y+.5+dy};break}
   ok(spot,'safe water cooler viewpoint');e.player.x=spot.x;e.player.y=spot.y;aim(target.x+.5,target.y+.5,.95)
  }else{
   const m=e.map,ox=m.inf.ox,oy=m.inf.oy;const windows=m.structures.filter((s:any)=>s.data?.l4Facade&&(!name.startsWith('window-')||Number(s.data.deg)===(name==='window-north'?180:90)))
   let shot:any
   for(const w of windows){const wx=w.x+.5,wy=w.y+.5;if(wx+ox<b.x0-3||wx+ox>b.x1+3||wy+oy<b.y0-3||wy+oy>b.y1+3)continue;const deg=Number(w.data.deg),nx=deg===90?1:deg===270?-1:0,ny=deg===0?1:deg===180?-1:0
    for(const sign of [-1,1])for(const D of name==='hall'?[13,9,6]:name==='open'?[7,5,3]:[4.5,3,2]){const x=wx+nx*sign*D,y=wy+ny*sign*D;if(wx+ox<b.x0||wx+ox>b.x1||wy+oy<b.y0||wy+oy>b.y1||x+ox<b.ix0+1||x+ox>b.ix1-1||y+oy<b.iy0+1||y+oy>b.iy1-1||!safe(x,y))continue;let good=true;for(let k=.6;k<D-.6;k+=.4)if(!safe(wx+nx*sign*k,wy+ny*sign*k,.24)){good=false;break}if(good){shot={x,y,wx,wy,deg};break}}if(shot)break
   }
   if(!name.startsWith('window-')&&name!=='hall'){const kind=name==='cubicle'?'cubicle':name==='rooms'?'desk':'pillar';const obj=m.structures.find((q:any)=>q.kind===kind&&q.x+ox>=b.ix0&&q.x+ox<=b.ix1&&q.y+oy>=b.iy0&&q.y+oy<=b.iy1);if(obj){let at:any;for(let D=4;D>=1.5&&!at;D-=.5)for(const [dx,dy]of [[-1,0],[1,0],[0,1],[0,-1],[-1,-1],[1,1]]){const x=obj.x+.5+dx*D,y=obj.y+.5+dy*D;if(x+ox>=b.ix0&&x+ox<=b.ix1&&y+oy>=b.iy0&&y+oy<=b.iy1&&safe(x,y)){at={x,y,wx:obj.x+obj.w/2,wy:obj.y+obj.h/2};break}}if(at)shot=at}}
  if(shot){e.player.x=shot.x;e.player.y=shot.y;aim(shot.wx,shot.wy,1.55);target=shot}
   else{let at:any;for(let dy=0;dy<12&&!at;dy++)for(let dx=0;dx<12&&!at;dx++)if(safe(b.ix0+4+dx-ox,b.iy0+4+dy-oy)){at={x:b.ix0+4+dx-ox,y:b.iy0+4+dy-oy}}ok(at,'safe L4 interior view');e.player.x=at.x;e.player.y=at.y;aim(at.x+4,at.y+6,1.5);target=at}
  }
  r.fovBase=name==='open'?66:58;e.player.z=floorHeight(e.map,e.player.x,e.player.y);await sleep(800)
  const rec={name,block:{i:b.i,j:b.j,type:b.type},target,world:world(),look:{...app.look},fov:r.camera.fov,prepareMs:performance.now()-start,...status()};records.push(rec);return rec
 }
 const setupMelee=async()=>{
  reset();clear();const m=e.map,p=e.player;let at:any
  for(let d=0;d<35&&!at;d++)for(let dy=-d;dy<=d&&!at;dy++)for(let dx=-d;dx<=d&&!at;dx++){
   if(Math.max(Math.abs(dx),Math.abs(dy))!==d)continue;const x=Math.floor(p.x)+dx+.5,y=Math.floor(p.y)+dy+.5
   if(safe(x,y)&&safe(x+1.2,y)&&safe(x+2.5,y)&&safe(x,y+1.5))at={x,y}
  }
  ok(at,'real L4 has safe melee interaction position');base=at;p.x=at.x;p.y=at.y;p.z=floorHeight(m,p.x,p.y);e.handsStowed=false;p.hotbar=Array(7).fill(null);p.backpack=Array(16).fill(null);p.equip.offhand={type:'flashlight',count:1};p.flashlight=true;p.selected=0;r.fovBase=70;aim(p.x+5,p.y,1.55);await sleep(250);return{base,world:world()}
 }
 const held=async(type:string,state='intact')=>{
  e.player.hotbar[0]={type,count:1,...(state==='broken'?{dur:0}:state==='worn'?{dur:Math.max(1,Math.floor(MELEE[type as keyof typeof MELEE].maxDur*.1)),blood:.55}:{})};e.player.selected=0;e.handsStowed=false;e.attackAnimT=0;e.attackCooldownT=0
  const key=type+(state==='broken'?':broken':'');await until(()=>r.vmHeld===key&&r.vmItem&&r.itemWarmup.ready(r.vmItem),'actual viewmodel '+key);await sleep(300);const g=r.vmItem.userData.meleeMesh;ok(g,'real first-person weapon factory '+key);const rec={name:type+'-'+state,budget:meleeBudget(g),memory:memory()};records.push(rec);return rec
 }
 const meleeMechanics=async()=>{
  await setupMelee();await held('knife');const p=e.player,q=makeEntity('faceling',base.x+1.1,base.y,0);q.id=++serial;q.def={...q.def,hp:9999,speed:0,damage:0,passive:true,noRetaliate:true};q.hp=9999;e.map.entities.push(q);aim(q.x,q.y,1.4);await waitModel(q);await sleep(150)
  const hp=q.hp;e.paused=false;e.input.attackHeld=false;e.input.attack=true
  await until(()=>!!e.meleePending,'actual light melee windup',4000);ok(q.hp===hp,'light hit waits for windup');await until(()=>q.hp<hp,'actual light hit damage',4000);ok(slotDur(p.hotbar[0])===MELEE.knife.maxDur-1,'light hit costs one durability');const lightDamage=hp-q.hp
  await until(()=>e.attackCooldownT<=0,'light recovery',4000);q.x=base.x+1.1;q.y=base.y;aim(q.x,q.y,1.4);const hp2=q.hp;e.input.attackHeld=true;e.input.attack=true
  await until(()=>e.meleeCharge>.9,'actual held charge',5000);ok(q.hp===hp2,'charging does not hit early');const charge=e.meleeCharge;e.input.attackHeld=false
  await until(()=>q.hp<hp2,'actual heavy melee hit',4000);ok(e.meleeHeavy&&hp2-q.hp>lightDamage,'released charge deals heavy strike');ok(slotDur(p.hotbar[0])===MELEE.knife.maxDur-3,'heavy hit costs two durability');e.paused=true;clear()
  p.hotbar[0]={type:'knife',count:1,dur:0,blood:.7};p.backpack[0]={type:'nails',count:3};p.selected=0;e.attackCooldownT=0;e.quickUse();ok(e.usingItem?.label==='修理','actual quick-use starts repair');e.paused=false;await until(()=>!e.usingItem,'actual repair completion',6500);ok(slotDur(p.hotbar[0])===slotMaxDur(p.hotbar[0])*.5&&e.countItem('nails')===2,'completed repair restores half and consumes one material');e.paused=true
  const slot=p.hotbar[0];slot.dur=0;e.dropSlot('hotbar',0);const drop=e.map.items.find((it:any)=>it.type==='knife'&&it.dur===0&&it.blood===.7);ok(drop,'actual drop retains broken state and blood');e.map.items=[drop];aim(drop.x,drop.y,.45);await sleep(350);e.scanInteract();ok(e.interactTarget?.item===drop||e.interactTarget?.it===drop||e.interactTarget?.kind==='pickup','actual crosshair selects dropped weapon');e.doInteract();ok(p.hotbar.some((s:any)=>s?.type==='knife'&&s.dur===0&&s.blood===.7),'actual pickup retains durability and blood');e.handsStowed=true
  const rec={lightDamage,heavyDamage:hp2-q.hp,charge,repairDur:MELEE.knife.maxDur*.5,...status()};records.push({name:'melee-mechanics',...rec});return rec
 }
 const loadL8=async()=>{reset();clear();const at=performance.now();e.loadLevel(8,{mapSeed:424242,firstVisit:false});e.paused=true;e.dev.frozenAI=true;e.dev.god=true;e.handsStowed=true;await until(ready,'L8 world and staged wrangler resources',240000);const entryMs=performance.now()-at;clear();e.player.equip.offhand={type:'flashlight',count:1};e.player.flashlight=true
  const m=e.map,p=e.player;const open=(x:number,y:number)=>x>3&&y>3&&x<m.w-4&&y<m.h-4&&e.entityWalkH(m,x,y,0)!==null;let found:any
  for(let d=1;d<40&&!found;d++)for(let dy=-d;dy<=d&&!found;dy++)for(let dx=-d;dx<=d&&!found;dx++){if(Math.max(Math.abs(dx),Math.abs(dy))!==d)continue;const x=Math.floor(p.x)+dx,y=Math.floor(p.y)+dy;if(open(x,y))continue;for(const[nx,ny]of [[1,0],[-1,0],[0,1],[0,-1]]){let k=1;for(;k<=9&&open(x+nx*k,y+ny*k)&&open(x+nx*k+ny,y+ny*k+nx)&&open(x+nx*k-ny,y+ny*k-nx);k++);if(k>=8){found={x:x+.5,y:y+.5,nx,ny};break}}}
  ok(found,'real cave has a broad exposed rock wall');wall={...found,wx:found.x+(m.inf?.ox??0),wy:found.y+(m.inf?.oy??0)};records.push({name:'L8-entry',entryMs,...status()});return{entryMs,wall,...status()}
 }
 const wranglerScene=async(kind:WranglerKind,pregnant=false)=>{reset();clear();e.player.equip.offhand={type:'flashlight',count:1};e.player.flashlight=true;const m=e.map,ox=m.inf?.ox??0,oy=m.inf?.oy??0,w={...wall,x:wall.wx-ox,y:wall.wy-oy}
  const q=makeEntity('wrangler',w.x+w.nx*3,w.y+w.ny*3,0);q.id=++serial;e.map.entities.push(q);const s=initWrangler(e,q,kind,pregnant);q.hidden=false;s.phase=kind==='juvenile'?'juv':kind==='female'?'graze':'hunt';s.headZ=kind==='juvenile'?.3:kind==='female'?2.4:1.92;s.mouth=kind==='male'?.35:.2;s.trail=[]
  for(let k=0;k<=40;k+=.5)s.trail.push({x:q.x+ox-w.nx*k,y:q.y+oy-w.ny*k,z:0});s.hole={x:w.x+ox,y:w.y+oy,nx:w.nx,ny:w.ny,id:++serial};const f=wranglerForceFrame(e);f.holes.push({x:w.x+ox,y:w.y+oy,nx:w.nx,ny:w.ny,z:1.4,r:1,open:1,rock:0,life:90,id:s.hole.id})
  e.player.x=w.x+w.nx*7-w.ny*1.8;e.player.y=w.y+w.ny*7+w.nx*1.8;e.player.z=floorHeight(m,e.player.x,e.player.y);e.player.vz=0;r.fovBase=68;aim(q.x,q.y,kind==='juvenile'?.3:s.headZ);await waitModel(q);await sleep(500);const g=r.entityMeshes.get(q.id),rig=g.userData.wranglerRig
  ok(rig.u.wSpine.value.isDataTexture&&rig.data.every(Number.isFinite),'native spine texture finite '+kind);ok(!rig.headRig.light,'gameplay wrangler uses current light pool');const rec={name:kind+(pregnant?'-pregnant':''),budget:wranglerBudget(g),world:world(),entity:[q.x,q.y,q.z],look:{...app.look},memory:memory()};records.push(rec);return rec
 }
 const wranglerMechanics=async()=>{
  reset();clear();const w={...wall,x:wall.wx-(e.map.inf?.ox??0),y:wall.wy-(e.map.inf?.oy??0)};const q=makeEntity('wrangler',w.x+w.nx*3,w.y+w.ny*3,0);q.id=++serial;e.map.entities.push(q);const s=initWrangler(e,q,'male',false);s.phase='hunt';s.coolT=0;s.stayT=50;s.headZ=1.92;s.trail=[];const ox=e.map.inf?.ox??0,oy=e.map.inf?.oy??0;for(let k=0;k<40;k+=.5)s.trail.push({x:q.x+ox-w.nx*k,y:q.y+oy-w.ny*k,z:0});q.hidden=false;e.player.x=w.x+w.nx*8;e.player.y=w.y+w.ny*8;e.player.z=0;aim(q.x,q.y,1.92);await waitModel(q)
  e.player.equip.offhand={type:'flashlight',count:1};e.player.flashlight=false;e.dev.frozenAI=false;e.paused=false
  await until(()=>wranglerDebug(e).captor===q.id&&s.phase==='hypno','actual gaze hypnosis',12000);ok(wranglerDebug(e).captor===q.id,'real engine triggers hypnosis');e.input.toggleLight=true;await until(()=>s.hypnoCd>0&&wranglerDebug(e).captor===undefined,'actual flashlight breaks hypnosis',4000);ok(s.hypnoCd>0,'flashlight toggle breaks actual hypnosis')
  e.paused=true;e.dev.frozenAI=true;e.dev.god=false;e.player.hp=100;s.phase='windup';s.t=0;s.lungeX=e.player.x;s.lungeY=e.player.y;wranglerSetCaptor(e,undefined);e.dev.frozenAI=false;e.paused=false;await until(()=>s.phase==='gulp','actual windup/lunge swallows',12000);const before=world();await until(()=>wranglerDebug(e).black>.8,'swallow darkness',2500);await until(()=>e.player.hp===1&&wranglerDebug(e).captor===undefined,'actual safe wake',12000);const after=world();ok(e.player.hp===1,'actual swallowed player wakes at one HP');ok(Math.hypot(before[0]-after[0],before[1]-after[1])>=WR.WAKE_MIN_D,'actual wake is at least 30 metres away');ok(safe(e.player.x,e.player.y),'actual wake has player clearance');e.dev.god=true;e.paused=true;e.dev.frozenAI=true;const rec={before,after,hp:e.player.hp,...status()};records.push({name:'wrangler-mechanics',...rec});return rec
 }
 const cycles=async()=>{await place(wall.wx+wall.nx*7,wall.wy+wall.ny*7);const samples=[];for(let k=0;k<6;k++){await wranglerScene(k%2?'female':'male',false);await sleep(180);const shown=memory();clear();await until(()=>r.entityMeshes.size===0,'actual entity recycling');await sleep(500);samples.push({shown,empty:memory()})}ok(new Set(samples.slice(-3).map(s=>JSON.stringify(s.empty))).size===1,'last three native creation/recycle rounds stabilize resources');return samples}
 const portraits=async()=>{clear();const{requestEntityPortrait,entityPortraitStats}=await import('../src/components/entityPortrait');const images=[];for(const[step,name]of [[0,'male'],[4,'female'],[8,'juvenile']] as const){const result=await new Promise<any>(resolve=>requestEntityPortrait('wrangler',resolve,step));ok(result.status==='ready','real archive preview '+name);images.push({name,src:result.src})}return{images,stats:entityPortraitStats()}}
 const sample=async()=>{const settleStart=performance.now();await until(()=>r.chunkBuilds.size===0&&r.chunkGroups.size>=e.map.inf.chunks.size,'all streamed chunks settled',240000);await sleep(900);const rounds=[];for(let n=0;n<5;n++){const values:number[]=[],draws:number[]=[],tri:number[]=[];let last=performance.now();for(let k=0;k<80;k++){await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));const now=performance.now();values.push(now-last);last=now;draws.push(r.three.info.render.calls);tri.push(r.three.info.render.triangles)}values.sort((a,b)=>a-b);draws.sort((a,b)=>a-b);tri.sort((a,b)=>a-b);rounds.push({median:values[40],p95:values[76],draws:draws[40],triangles:tri[40]})}return{settleMs:performance.now()-settleStart,chunks:r.chunkGroups.size,tasks:r.chunkBuilds.size,scope:'Native GPU requestAnimationFrame cadence; full frame includes world/shadows/post; not a GPU timer or Android result',rounds,memory:memory()}}
 const coolerMechanics=()=>{const s=e.map.structures.find((s:any)=>s.kind==='watercooler');ok(s,'generated water cooler for interaction');const data=s.data;s.data={...data,water:4,almond:false,searched:0};e.player.thirst=40;const sip=()=>{e.interactTarget={kind:'watercooler',s};e.doInteract()};sip();ok(s.data.water===3&&e.player.thirst===60,'actual cooler consumes a drink and restores thirst');s.data.almond=true;s.data.searched=0;const before=e.countItem('almond');sip();sip();ok(e.countItem('almond')===before+1,'almond cooler gives only one bottle');s.data=data;return{water:3,oneAlmond:true}};
 return{coolerMechanics,status,sceneL4,setupMelee,held,meleeMechanics,loadL8,wranglerScene,wranglerMechanics,cycles,portraits,sample,summary:()=>({checks,records,status:status()})}
}
