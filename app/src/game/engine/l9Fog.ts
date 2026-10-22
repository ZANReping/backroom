import type {Engine} from '../engine'
import {makeEntity,type Entity} from '../entities'
import {look} from '../renderer/shared'
import {mapVision} from '../content/mapPlayer'
import {audio} from '../core/audio'
import {mangledGrowth,mangledOmen,nwCaptor,releaseNW} from './watchAI'

export const L9_FOG={arrival:35,activeMin:120,activeMax:180,departure:50,spawnMin:52,spawnMax:68,bodyRadius:30,unseenTime:2} as const
const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t)}
type Frame={map:Engine['map'];run:number;actor?:Entity;unseen:number;arrivalElapsed:number;retry:number;fadeStart:number}
const frames=new WeakMap<Engine,Frame>()
/** Conservative horizontal silhouette: buildings cannot conceal the forty-metre body. */
export function mangledOutsideView(eng:Engine,x:number,y:number,radius:number=L9_FOG.bodyRadius){
 const dx=x-eng.player.x,dy=y-eng.player.y,d=Math.hypot(dx,dy)
 if(d<=radius+4)return false
 const half=Math.min(Math.PI-.02,mapVision.fov/2+.12+Math.asin(Math.min(.999,radius/d)))
 return (-Math.sin(look.yaw)*dx-Math.cos(look.yaw)*dy)/d<Math.cos(half)
}
export function spawnL9FogMangled(eng:Engine):Entity|undefined{
 const m=eng.map,p=eng.player;if(!m||m.entities.some(e=>e.l9FogSpawn&&!e.dead))return
 const radius=L9_FOG.bodyRadius*mangledGrowth(eng),min=Math.max(L9_FOG.spawnMin,radius+18),max=Math.max(L9_FOG.spawnMax,min+12)
 const facing=Math.atan2(-Math.cos(look.yaw),-Math.sin(look.yaw))
 for(let a=0;a<96;a++){
  const angle=facing+Math.PI+(Math.random()-.5)*(a<64?1.7:Math.PI*2),d=min+Math.random()*(max-min)
  const x=Math.floor(p.x+Math.cos(angle)*d)+.5,y=Math.floor(p.y+Math.sin(angle)*d)+.5
  if(x<2||y<2||x>=m.w-2||y>=m.h-2||!mangledOutsideView(eng,x,y,radius))continue
  if(m.outdoor[Math.floor(y)*m.w+Math.floor(x)]!==1||eng.entityWalkH(m,Math.floor(x),Math.floor(y),0)===null)continue
  const e=makeEntity('mangled',x,y),ox=m.inf?.ox??0,oy=m.inf?.oy??0
  e.l9FogSpawn=true;e.l9FogTravel={mode:'arrive',homeX:x+ox,homeY:y+oy,exitX:x+ox,exitY:y+oy}
  e.state='chase';e.targetX=p.x;e.targetY=p.y;m.entities.push(e)
  return e
 }
}
function finish(eng:Engine,f:Frame){
 const e=f.actor,m=eng.map
 if(e&&m){m.entities=m.entities.filter(q=>q!==e);for(const c of m.inf?.chunks.values()??[])c.entities=c.entities.filter(q=>q!==e)}
 f.actor=undefined;f.unseen=0;eng.l9FogPhase='idle';eng.l9FogK=0;eng.l9FogT=320+Math.random()*520
}
function leave(eng:Engine,f:Frame){
 const e=f.actor;f.fadeStart=eng.l9FogK;eng.l9FogPhase='fade';eng.l9FogT=L9_FOG.departure
 if(e?.l9FogTravel){
  if(nwCaptor(eng)===e)releaseNW(eng,'drop')
  const ox=eng.map?.inf?.ox??0,oy=eng.map?.inf?.oy??0
  let dx=e.x-eng.player.x,dy=e.y-eng.player.y
  if(Math.hypot(dx,dy)<.5){dx=e.l9FogTravel.homeX-ox-e.x;dy=e.l9FogTravel.homeY-oy-e.y}
  if(Math.hypot(dx,dy)<.5){dx=Math.cos(e.facing);dy=Math.sin(e.facing)}
  const d=Math.hypot(dx,dy)||1
  Object.assign(e.l9FogTravel,{mode:'leave',exitX:e.x+ox+dx/d*110,exitY:e.y+oy+dy/d*110})
 }
 eng.msg('雾层渐渐变薄。高处的轮廓转身，沉重的脚步正慢慢远去。','system')
}
/** The event owns one physical actor: arrive -> hunt -> walk away, never visible pop-in/death. */
export function updateL9Fog(eng:Engine,dt:number){
 const m=eng.map
 if(eng.levelDef.id!==9||!m){frames.delete(eng);eng.l9FogPhase='idle';eng.l9FogK=0;eng.l9FogT=240;return}
 let f=frames.get(eng)
 if(!f||f.map!==m||f.run!==eng.player.startTime){f={map:m,run:eng.player.startTime,unseen:0,arrivalElapsed:0,retry:0,fadeStart:0};frames.set(eng,f);eng.l9FogPhase='idle';eng.l9FogK=0;eng.l9FogT=240}
 if(eng.dev.phenOff.has('l9fog')){if(eng.l9FogPhase==='idle')return;if(eng.l9FogPhase!=='fade')leave(eng,f)}
 if(eng.dev.phenOn.has('l9fog')&&eng.l9FogPhase==='idle')eng.l9FogT=0
 eng.l9FogT-=dt
 if(eng.l9FogPhase==='idle'){
  if(eng.l9FogT>0)return
  f.retry-=dt;if(f.retry>0)return
  f.actor=spawnL9FogMangled(eng)
  if(!f.actor){f.retry=3;return} // Wait for a genuinely unseen safe street, never force a visible spawn.
  f.arrivalElapsed=0;eng.l9FogPhase='warning';eng.l9FogT=L9_FOG.arrival
  eng.msg('远处响起沉重而缓慢的脚步。街道尽头开始浮起一层薄雾。','damage');audio.aggro();return
 }
 const e=f.actor,present=!!e&&!e.dead&&m.entities.includes(e)
 if(!present&&eng.l9FogPhase!=='fade')leave(eng,f)
 if(eng.l9FogPhase==='warning'){
  const d=Math.hypot(e!.x-eng.player.x,e!.y-eng.player.y);f.arrivalElapsed+=dt
  const target=Math.max(.35*smooth(0,L9_FOG.arrival,f.arrivalElapsed),1-smooth(18,64,d))
  eng.l9FogK+=(target-eng.l9FogK)*(1-Math.exp(-dt/2))
  mangledOmen(eng,dt,eng.l9FogK)
  if(d<=24||(eng.l9FogT<=0&&d<=34)){
   eng.l9FogPhase='active';eng.l9FogT=L9_FOG.activeMin+Math.random()*(L9_FOG.activeMax-L9_FOG.activeMin)
   if(e!.l9FogTravel)e!.l9FogTravel.mode='active'
   eng.msg('庞大的腿影从薄雾里走近，浓雾跟着它漫过整条街。','damage')
  }else if(f.arrivalElapsed>100)leave(eng,f)
  return
 }
 if(eng.l9FogPhase==='active'){
  eng.l9FogK+=(1-eng.l9FogK)*(1-Math.exp(-dt/2))
  if(eng.l9FogT<=0)leave(eng,f)
  return
 }
 const target=f.fadeStart*smooth(0,L9_FOG.departure,Math.max(0,eng.l9FogT))
 eng.l9FogK+=(target-eng.l9FogK)*(1-Math.exp(-dt/1.5))
 if(eng.l9FogT>0)return
 const radius=L9_FOG.bodyRadius*mangledGrowth(eng),d=e?Math.hypot(e.x-eng.player.x,e.y-eng.player.y):Infinity
 const unseen=!present||mangledOutsideView(eng,e!.x,e!.y,radius)||d-radius>mapVision.range+8
 f.unseen=unseen?f.unseen+dt:0
 if(f.unseen>=L9_FOG.unseenTime)finish(eng,f)
}
