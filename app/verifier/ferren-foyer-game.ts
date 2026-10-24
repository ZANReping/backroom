import {ensureTradersAt} from '../src/game/world/tradersWorld'
import {foyerTargets,foyerInteract,foyerState} from '../src/game/engine/foyer'
import {canOccupy,PLAYER_RADIUS} from '../src/game/core/player'
import {scanInteract} from '../src/game/engine/interact'
import {FERREN_CAGE} from '../src/game/content/ferrenCage'
import * as F from '../src/game/engine/ferrenAI'
import {snapshot} from '../src/game/engine/save'
import {FOYER_PROPS} from '../src/game/world/foyerLayout'
import {GATE_ARCH,STREET_CLUES} from '../src/game/world/foyerStreetLayout'
export function mount(api:any){
 const e=api.engine,p=()=>e.player,wait=(ms:number)=>new Promise(r=>setTimeout(r,ms)),assert=(a:unknown,s:string)=>{if(!a)throw Error(s)}
 const move=(x:number,y:number,yaw=0,pitch=0)=>{Object.assign(p(),{x,y,z:0,vz:0,crouching:false});api.look.yaw=yaw;api.look.pitch=pitch;p().facing=Math.atan2(-Math.cos(yaw),-Math.sin(yaw));api.look.rayX=-Math.sin(yaw)*Math.cos(pitch);api.look.rayY=-Math.cos(yaw)*Math.cos(pitch);api.look.rayZ=Math.sin(pitch)}
 return {
  summary(){const r=api.renderer();return{seed:e.seed,level:p().level,paused:e.paused,pos:[p().x,p().y,p().z],prologue:p().prologue,unlock:p().hudUnlocks,phone:p().phone,transition:e.transition,resources:r.three.info.memory,geometries:r.three.info.memory.geometries}},
  setup(){e.dev.god=true;e.dev.statLock=true;return this.summary()},
  aim(id:string){
   const t=foyerTargets(e).find(t=>t.id===id);assert(t,'missing target '+id);if(!t)return
   for(const crouch of [false,true])for(const d of [.85,1.2,1.5])for(let i=0;i<16;i++){
    const a=i*Math.PI/8,x=t.x+Math.cos(a)*d,y=t.y+Math.sin(a)*d;
    if(!canOccupy(e.map,x,y,PLAYER_RADIUS,{z:0,crouch}))continue
    move(x,y,Math.atan2(-(t.x-x),-(t.y-y)),Math.atan2(t.z-(crouch?.95:1.55),d));p().crouching=crouch;
    scanInteract(e);if(e.interactTarget?.foyerId===id)return{id,pos:[x,y],crouch,target:e.interactTarget.label}
   }throw Error('cannot aim '+id+' got '+JSON.stringify(e.getInteract()))
  },
  toggle(id:string){foyerInteract(e,id);return{open:foyerState(e).open[id],flags:p().prologue.flags}},
  homeView(){move(8.2,8.25,-.2,-.05);return this.summary()},
  kitchenView(){move(13.4,8.8,-1.2,-.08);return this.summary()},
  streetView(){move(63,46,-Math.PI/2,-.06);return this.summary()},
  prepareReturn(){move(STREET_CLUES[0].x+1,STREET_CLUES[0].y,Math.PI/2,0);for(const c of STREET_CLUES)foyerInteract(e,'st_clue:'+c.id);return{clues:p().prologue.flags}},
  loop(n:number){move((GATE_ARCH.x0+GATE_ARCH.x1)/2,45.2,0);e.foyer.street.lastY=45.2;e.foyer.street.lastX=p().x;p().y=44.9;return{n,pos:[p().x,p().y],flags:p().prologue.flags}},
  fall(){move(65,37,0,-.3);return this.summary()},
  landingItems(){return e.map.items.filter((s:any)=>['phone','foyerpack','flashlight','bottledwater','snackbar'].includes(s.type)).map((s:any)=>({id:s.id,type:s.type,count:s.count??1,x:s.x,y:s.y}))},
  async ferrenSetup(kind='play'){
   e.loadLevel(102);e.dev.frozenAI=false;e.foyer=undefined;move(FERREN_CAGE.spawn.x+.65,FERREN_CAGE.spawn.y,Math.PI/2,-.85)
   const ph=F.FERREN_SCHEDULE.find(ph=>ph.kind===kind)!;e.ferrenRun.clock=(ph.from+ph.to)/2/F.FR.DAY_MIN*F.FR.CYCLE;p().sanity=70;
   const fr=e.map.entities.find((v:any)=>v.def.type==='ferren');F.updateFerren(e,fr,.01);if(kind==='sleep'){const h=F.ferrenHome(e,fr);move(h.nx+.65,h.ny,Math.PI/2,-.9);F.updateFerren(e,fr,.01)}
   ensureTradersAt(e.map,p().x,p().y,28);ensureTradersAt(e.map,p().x,p().y,28);await wait(1500);return{fr:fr.fr,at:[fr.x,fr.y],hint:F.ferrenSpecial(e),rep:e.rep.bntg,sanity:p().sanity}
  },
  ferrenPhase(kind:string){const ph=F.FERREN_SCHEDULE.find(ph=>ph.kind===kind)!;e.ferrenRun.clock=(ph.from+ph.to)/2/F.FR.DAY_MIN*F.FR.CYCLE;e.ferrenRun.tuck=null;return this.ferrenState()},
  ferrenState(){const fr=e.map.entities.find((v:any)=>v.def.type==='ferren');return{fr:fr?.fr,run:e.ferrenRun,hint:F.ferrenSpecial(e),rep:e.rep.bntg,sanity:p().sanity,tucked:!!api.renderer().entityMeshes?.get(fr?.id)?.userData.ferrenBlanket?.visible}},
  save(){return snapshot(e)},

  aimGround(type:string){const it=e.map.items.find((it:any)=>it.type===type);assert(it,'missing ground '+type);for(const d of [.7,1,1.35])for(let k=0;k<16;k++){const a=k*Math.PI/8,x=it.x+Math.cos(a)*d,y=it.y+Math.sin(a)*d;if(!canOccupy(e.map,x,y,PLAYER_RADIUS,{z:0}))continue;move(x,y,Math.atan2(-(it.x-x),-(it.y-y)),Math.atan2(.06-1.55,d));scanInteract(e);if(e.interactTarget?.it===it)return{type,target:e.interactTarget.label}}throw Error('cannot aim ground '+type)},
  relic(){const types=['acidcallus','ashpile','jerryflyer','fakelog','sedgland','bento','curabiturgel','curabiturspore','curabiturrepellent'],p0=p(),cx=p0.x,cy=p0.y;for(const [i,type]of types.entries()){const x=cx+(i%3-1)*.65,y=cy-1.35-Math.floor(i/3)*.65;const it={id:Math.random(),type,count:1,x,y};e.map.items.push(it);const inf=e.map.inf;if(inf)inf.chunks.get(Math.floor((x+inf.ox)/32)+','+Math.floor((y+inf.oy)/32))?.items.push(it)}p0.hotbar[0]={type:'curabiturrepellent',count:1};p0.selected=0;e.handsStowed=false;api.look.yaw=0;api.look.pitch=-.5;return{types}},
  async bench(){const r=api.renderer();await wait(1800);const was=r.three.info.autoReset;r.three.info.autoReset=false;const rounds:any[]=[];try{for(let j=0;j<5;j++){const ms:number[]=[],calls:number[]=[],tris:number[]=[];let prev=performance.now();r.three.info.reset();await new Promise<void>(resolve=>{const tick=(t:number)=>{ms.push(t-prev);prev=t;calls.push(r.three.info.render.calls);tris.push(r.three.info.render.triangles);r.three.info.reset();if(ms.length===60)resolve();else requestAnimationFrame(tick)};requestAnimationFrame(tick)});const q=(a:number[],p:number)=>a.slice().sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*p))];rounds.push({median:q(ms,.5),p95:q(ms,.95),calls:q(calls,.5),triangles:q(tris,.5),resources:{...r.three.info.memory}})}}finally{r.three.info.autoReset=was}return{rounds}},
  props(){return FOYER_PROPS},
 }
}
