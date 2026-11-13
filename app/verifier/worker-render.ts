import { Engine } from '../src/game/engine'
import { storage } from '../src/game/core/storage'
import { floorHeight } from '../src/game/world/mapgen'
import { audio } from '../src/game/core/audio'
import { OffscreenLevelView } from '../src/game/renderer/offscreenView'
import type { RenderPose, RenderWorkerInit } from '../src/game/renderer/offscreenProtocol'

storage.get=()=>null;storage.set=()=>{};storage.remove=()=>{};audio.setMuted(true)
const query=new URLSearchParams(location.search),level=Number(query.get('level')??1) as 1|5|11,mode=query.get('mode')==='classic'?'classic':'realistic'
const engine=new Engine();engine.seed=424242;engine.loadLevel(level,{mapSeed:424242,firstVisit:false});engine.introT=0;engine.dev.god=true;engine.dev.statLock=true;engine.dev.frozenAI=true;engine.dev.phenOff.add('flicker')
const pose:RenderPose={worldX:engine.player.x+(engine.map?.inf?.ox??0),worldY:engine.player.y+(engine.map?.inf?.oy??0),z:engine.player.z,yaw:0,pitch:0,time:0}
const options:RenderWorkerInit={level,seed:424242,mode,width:innerWidth,height:innerHeight,dpr:1,assetBase:location.origin+'/',pose}
const canvas=document.querySelector('canvas')!,status=document.querySelector('#status')!
const view=new OffscreenLevelView(canvas,options),events:{at:number;frames:number}[]=[]
let mainFrames=0,last=performance.now(),spin=false,raf=0
Object.assign(window,{renderTrial:{engine,view,events,options,get mainFrames(){return mainFrames},set spin(v:boolean){spin=v},get ready(){return view.stats?.ready===true},get error(){return view.error},cross(){
 const before={x:engine.map!.inf!.ox,y:engine.map!.inf!.oy}
 const spot=engine.devFindSpot(engine.player.x+33,engine.player.y,6,engine.player.floor)
 if(!spot)throw Error('No safe streaming test point')
 Object.assign(engine.player,{x:spot.x,y:spot.y,z:floorHeight(engine.map!,spot.x,spot.y,engine.player.floor),vz:0})
 engine.updateInfiniteWindow()
 return {before,after:{x:engine.map!.inf!.ox,y:engine.map!.inf!.oy},worldX:engine.player.x+engine.map!.inf!.ox,worldY:engine.player.y+engine.map!.inf!.oy}
 },block(ms=200){const start=performance.timeOrigin+performance.now(),until=performance.now()+ms;while(performance.now()<until){}return {start,end:performance.timeOrigin+performance.now()}},dispose(){cancelAnimationFrame(raf);view.dispose()}}})
// The main thread runs the actual game Engine, never Three.js. Only the pose is sent.
function tick(now:number){
 const dt=Math.min(.05,(now-last)/1000);last=now
 engine.paused=!view.stats?.ready;engine.update(dt)
 pose.time=engine.time
 if(spin)pose.yaw+=dt*.3
 Object.assign(pose,{worldX:engine.player.x+(engine.map?.inf?.ox??0),worldY:engine.player.y+(engine.map?.inf?.oy??0),z:engine.player.z})
 view.view(pose);mainFrames++
 status.textContent=JSON.stringify(view.stats??{error:view.error})
 if(view.stats){events.push({at:view.stats.at,frames:view.stats.frames});if(events.length>1200)events.shift()}
 raf=requestAnimationFrame(tick)
}
await view.ready;raf=requestAnimationFrame(tick)
addEventListener('resize',()=>view.resize(innerWidth,innerHeight,1))
document.addEventListener('visibilitychange',()=>view.active(!document.hidden))
addEventListener('pagehide',()=>{cancelAnimationFrame(raf);view.dispose()},{once:true})
