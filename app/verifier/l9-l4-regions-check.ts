import {canOccupy} from '../src/game/core/player'
import {floorHeight} from '../src/game/world/mapgen'
import {genL4ChunkRaw} from '../src/game/world/infiniteL4'
import {L4} from '../src/game/levels/l4'
import {mangledOutsideView,L9_FOG} from '../src/game/engine/l9Fog'
import {mapVision} from '../src/game/content/mapPlayer'
const sleep=(n=100)=>new Promise(r=>setTimeout(r,n))
const until=async(f:()=>unknown,label:string,limit=180000)=>{const t=performance.now();while(!f()){if(performance.now()-t>limit)throw Error('Timeout '+label);await sleep(50)}}
export async function mount(app:any){
 const e=app.engine,r=app.renderer(),checks:string[]=[],records:any[]=[]
 const ok=(v:unknown,s:string)=>{if(!v)throw Error(s);checks.push(s)}
 const world=()=>({x:e.player.x+(e.map.inf?.ox??0),y:e.player.y+(e.map.inf?.oy??0),z:e.player.z})
 const status=()=>({level:e.player.level,world:world(),chunks:r.chunkGroups.size,tasks:r.chunkBuilds.size,memory:{...r.three.info.memory},fog:e.l9FogPhase,k:e.l9FogK,t:e.l9FogT})
 const aim=(x:number,y:number,z=1.5)=>{const p=e.player;app.look.yaw=Math.atan2(p.x-x,p.y-y);app.look.pitch=Math.atan2(z-(p.z+1.62),Math.hypot(x-p.x,y-p.y));p.facing=Math.atan2(y-p.y,x-p.x)}
 const reset=()=>{e.over=false;e.dev.frozenAI=true;e.dev.god=true;e.dev.statLock=true;e.dev.invisible=true;e.dev.bright=false;e.input.mx=e.input.my=0;e.input.attack=e.input.attackHeld=e.input.interact=false;e.handsStowed=true;e.player.z=e.player.vz=0;e.transition=null;e.introT=0}
 const clear=()=>{e.map.entities=[];for(const c of e.map.inf?.chunks.values()??[])c.entities=[]}
 const ready=()=>r.isNearWorldReady(e)&&!document.querySelector('.loading-screen')
 const load=async(id:number)=>{reset();const t=performance.now();e.loadLevel(id,{mapSeed:424242,firstVisit:false});reset();await until(ready,'level '+id);clear();return{entryMs:performance.now()-t,...status()}}
 const place=async(x:number,y:number)=>{e.player.x=x-e.map.inf.ox;e.player.y=y-e.map.inf.oy;e.player.z=e.player.vz=0;e.updateInfiniteWindow();await until(ready,'streaming viewpoint');await sleep(400)}
 const markers:any[]=[];for(let y=-16;y<=16;y++)for(let x=-16;x<=16;x++)for(const q of genL4ChunkRaw(L4,424242,x,y).exits)if(!markers.some(p=>p.def.kind===q.def.kind))markers.push(q)
 const exitScene=async(kind:string)=>{
  if(e.player.level!==4)await load(4);reset();clear();const p=markers.find(p=>p.def.kind===kind);ok(p,'generated '+kind)
  await place(p.x-2,p.y+2);const q=e.map.exits.find((q:any)=>q.def.kind===kind&&Math.abs(q.x+e.map.inf.ox-p.x)<.1&&Math.abs(q.y+e.map.inf.oy-p.y)<.1);ok(q,'live generated '+kind)
  const roots=[...r.chunkGroups.values()].flatMap((c:any)=>c.exitRoots),root=roots.find((g:any)=>g.userData.exitRef===q);ok(root,'rendered exit root '+kind);ok(Math.abs(root.rotation.y-q.l4.yaw)<1e-6,'render and layout share exit yaw '+kind)
  const x=q.x+.5,y=q.y+.5
  if(kind==='elevatorshaft'){e.player.x=x-3.1;e.player.y=y;aim(x,y,1.3)}
  else if(kind==='oldstairs'){e.player.x=x;e.player.y=y+1.25;aim(x,y-1,-.5)}
  else{e.player.x=x;e.player.y=y+1.15;aim(x,y,.05)}
  e.player.z=floorHeight(e.map,e.player.x,e.player.y);ok(canOccupy(e.map,e.player.x,e.player.y,.32,{z:e.player.z}),'exit has collision-safe approach '+kind)
  r.fovBase=68;await sleep(700);e.scanInteract();if(kind==='trapdoor')ok(e.interactTarget?.kind==='exit'&&e.interactTarget.e===q,'actual aimed exit interaction '+kind)
  const rec={kind,anchor:{x:p.x,y:p.y,yaw:q.l4.yaw},model:{x:root.position.x,y:root.position.y,z:root.position.z,yaw:root.rotation.y},...status()};records.push(rec);return rec
 }
 const exitUse=async(kind:string)=>{const q=e.map.exits.find((q:any)=>q.def.kind===kind);ok(q,'live exit to use');const dest=q.def.dest
  if(kind==='oldstairs'){for(let s=0;s<3.1&&!e.transition;s+=.1){e.player.x=q.x+.5;e.player.y=q.y+.5-s;e.updateStairs(.08)}}else{if(kind==='elevatorshaft'){e.player.x=q.x+.5-1.65;e.player.y=q.y+.5;aim(q.x+.5,q.y+.5,1.3);await sleep(400)}e.scanInteract();ok(e.interactTarget?.kind==='exit'&&e.interactTarget.e===q,'actual exit interaction '+kind);e.doInteract()}
  await until(()=>e.player.level===dest&&!e.transition&&ready(),'actual transition '+kind,240000);ok(e.player.level===dest,'actual transition destination '+dest);return status()
 }
 const mapOpen=async()=>{if(e.player.level!==4)await load(4);reset();e.dev.mapReveal=true;window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyM',key:'m',bubbles:true}));await until(()=>document.querySelector('[data-world-map]'),'original large map')
  await sleep(1400);const text=document.body.innerText;for(const name of ['办公间区','空旷区','小房间区','空旷大厅'])ok(text.includes(name),'original map legend '+name);ok(!text.includes('窗景区'),'retired window region absent from map')
  const c=document.querySelector('[data-world-map]') as HTMLCanvasElement;ok(c.width>=450&&c.height>=450,'original map opens at full canvas size');return{width:c.width,height:c.height,...status()}
 }
 const mapClose=async()=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape',bubbles:true}));await sleep(500)}
 let actor:any,track:number|undefined
 const fogRecord=()=>({id:actor?.id,actor:actor?{x:actor.x+(e.map.inf?.ox??0),y:actor.y+(e.map.inf?.oy??0),travel:actor.l9FogTravel?.mode,pending:actor.presentationPending,dead:actor.dead,distance:Math.hypot(actor.x-e.player.x,actor.y-e.player.y)}:null,visible:actor&&mangledOutsideView(e,actor.x,actor.y),range:mapVision.range,...status()})
 const fogStart=async()=>{await load(9);reset();clear();app.look.yaw=0;app.look.pitch=0;r.fovBase=80;e.dev.phenOff.delete('l9fog');e.dev.phenOn.add('l9fog');e.dev.frozenAI=false;await until(()=>e.map.entities.some((q:any)=>q.l9FogSpawn),'offscreen fog arrival',18000);actor=e.map.entities.find((q:any)=>q.l9FogSpawn);e.dev.phenOn.delete('l9fog');ok(mangledOutsideView(e,actor.x,actor.y),'actual giant spawned fully outside player view');ok(e.l9FogK<.1,'fog initially thin');await until(()=>r.entityMeshes.has(actor.id)&&!actor.presentationPending,'actual giant GPU model');const v=fogRecord();records.push({name:'arrival',...v});return v}
 const fogLook=async()=>{track=window.setInterval(()=>{if(actor&&e.map?.entities.includes(actor))aim(actor.x,actor.y,21)},50);await sleep(1200);return fogRecord()}
 const fogActive=async()=>{await until(()=>e.l9FogPhase==='active','natural walking arrival',200000);ok(e.l9FogT>L9_FOG.activeMin-5&&e.l9FogT<=L9_FOG.activeMax,'actual active event duration is two to three minutes');await sleep(1800);const v=fogRecord();records.push({name:'active',...v});return v}
 const fogLeave=async()=>{e.l9FogT=.01;await until(()=>actor.l9FogTravel?.mode==='leave','walk-away phase',4000);const d=Math.hypot(actor.x-e.player.x,actor.y-e.player.y);await sleep(12000);ok(Math.hypot(actor.x-e.player.x,actor.y-e.player.y)>d+9,'actual actor walks away during thinning mist');const v=fogRecord();records.push({name:'departure',...v});return v}
 const fogClear=async()=>{e.l9FogT=6;await sleep(9500);ok(e.l9FogK<.03,'actual mist clears gradually');ok(e.map.entities.includes(actor)&&!actor.dead,'watched actor remains alive instead of pop-out');const v=fogRecord();records.push({name:'clear-watching',...v});return v}
 const fogRetire=async()=>{clearInterval(track);app.look.yaw+=Math.PI;app.look.pitch=0;const before=e.map.items.length;await until(()=>!e.map.entities.includes(actor),'unseen final retirement',10000);ok(e.l9FogPhase==='idle','event cooldown after physical departure');ok(e.map.items.length===before,'no death loot during departure');const v=fogRecord();records.push({name:'retired',...v});return v}
 return{status,exitScene,exitUse,load,mapOpen,mapClose,fogStart,fogLook,fogActive,fogLeave,fogClear,fogRetire,summary:()=>({checks,records,status:status(),giant:fogRecord(),frozen:e.dev.frozenAI})}
}
