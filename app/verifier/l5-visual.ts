import { Engine } from '../src/game/engine'
import { getRenderer, look } from '../src/game/renderer'
import { moveStep } from '../src/game/core/player'
import { l5HallRect,l5CorridorAt,l5CorrX,l5RegionAt,genL5ChunkRaw } from '../src/game/world/infiniteL5'
const canvas=document.querySelector('canvas')!,engine=new Engine(),renderer=getRenderer(canvas)
engine.newRun(424242,'normal');engine.dev.god=true;engine.dev.frozenAI=true;engine.dev.statLock=true;engine.paused=true
engine.loadLevel(5,{mapSeed:424242,firstVisit:false});engine.introT=0;engine.player.flashlight=false
const params=new URLSearchParams(location.search),initialMode=params.get('mode')==='classic'?'classic':'realistic'
renderer.resize(innerWidth,innerHeight,1);renderer.setTextureQuality(2);renderer.setLightMode(initialMode);renderer.setBloomFx(true);renderer.setLightShadows(params.get('shadows')==='0'?0:1);renderer.setShadowQuality(0)
let mode:string=initialMode,selected='hall',frames=0,last=performance.now();const timings:number[]=[]
function worldView(x:number,y:number,yaw=0,pitch=0){const inf=engine.map!.inf!;engine.player.x=x-inf.ox;engine.player.y=y-inf.oy;engine.player.z=0;engine.player.vz=0;engine.updateInfiniteWindow();look.yaw=yaw;look.pitch=pitch}
function select(view:string){
 selected=view
 const seed=engine.map!.inf!.seed,r=l5HallRect(seed,0,0),cx=((r.x0+r.x1)>>1)+.5,cy=((r.y0+r.y1)>>1)+.5
 if(view==='hall')worldView(cx+.8,cy+6,0,.10)
 else if(view==='ceiling')worldView(cx+1,cy+5,0,.64)
 else if(!['plain','ornate'].includes(view)){
  const rooms=new Map<string,NonNullable<ReturnType<typeof l5RegionAt>>>()
  for(let x=-800;x<=800;x+=8)for(let y=-800;y<=800;y+=8){const r=l5RegionAt(seed,x,y);if(r?.variant===(view==='pipegallery'?'boilerroom':view))rooms.set(`${r.x0},${r.y0}`,r)}
  const r=[...rooms.values()].sort((a,b)=>Math.hypot(a.x0,a.y0)-Math.hypot(b.x0,b.y0)).find(r=>{
   if(view!=='pipegallery'&&view!=='boilerroom')return true
   const x=Math.floor((r.x0+r.x1)/2),y=Math.floor((r.y0+r.y1)/2),c=genL5ChunkRaw(engine.levelDef,seed,Math.floor(x/32),Math.floor(y/32))
   return c.tint[((y%32+32)%32)*32+(x%32+32)%32]===(view==='pipegallery'?67:24)
  })
  if(r){const x=(r.x0+r.x1)/2+.5
   if(view==='beverly'||view==='dining')worldView(x+3,r.y1-3,0,.08)
   else if(view==='maintenance')worldView(x-3,(r.y0+r.y1)/2-3,.7,0)
   else if(view==='boilerroom'||view==='pipegallery')worldView(Math.floor((r.x0+r.x1)/2)+.5,r.y0+3,Math.PI,.02)
   else if(view==='guestroom')worldView(r.x0+2,r.y0+2,-2.3,-.05)
   else worldView(x,r.y1-1,0,-.05)
  }
 }
 else{
  const plain=view==='plain';let chosen:{x:number;y:number;d:number}|undefined
  for(let k=-18;k<=18;k++)for(let y=-80;y<=80;y+=8){const x=l5CorrX(seed,k)+1;if(l5CorridorAt(seed,x,y).plain!==plain)continue
   if([-12,-6,0,6,12].some(o=>l5RegionAt(seed,x,y+o)?.variant))continue
   const d=Math.hypot(x-15,y-15);if(!chosen||d<chosen.d)chosen={x,y,d}
  }
  if(chosen)worldView(chosen.x+.5,chosen.y+.5,0,0)
 }
 document.querySelector('#status')!.textContent=`${view} · ${mode}`
 return {view,position:{x:engine.player.x+engine.map!.inf!.ox,y:engine.player.y+engine.map!.inf!.oy}}
}
const qa={engine,renderer,look,select,worldView,mode(v:string){mode=v;renderer.setLightMode(v as 'classic'|'realistic');document.querySelector('#status')!.textContent=`${selected} · ${mode}`},stats(){const sorted=timings.slice(-180).sort((a,b)=>a-b);return{frames,view:selected,mode,calls:renderer.three.info.render.calls,triangles:renderer.three.info.render.triangles,memory:renderer.three.info.memory,median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)]}}}
Object.assign(window,{qa})
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>select(b.dataset.view!));document.querySelector<HTMLButtonElement>('#mode')!.onclick=()=>qa.mode(mode==='realistic'?'classic':'realistic')
const keys=new Set<string>();let dragging=false
canvas.onpointerdown=e=>{dragging=true;canvas.setPointerCapture(e.pointerId)};canvas.onpointerup=()=>dragging=false
canvas.onpointermove=e=>{if(dragging){look.yaw-=e.movementX*.003;look.pitch=Math.max(-1.4,Math.min(1.4,look.pitch-e.movementY*.003))}}
addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='KeyE'&&!e.repeat){engine.scanInteract();engine.doInteract()}});addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());addEventListener('resize',()=>renderer.resize(innerWidth,innerHeight,1))
select(params.get('view') ?? 'hall')
function frame(now:number){const dt=Math.min((now-last)/1000,.05);timings.push(now-last);if(timings.length>360)timings.shift();last=now
 const f=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),s=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));engine.player.facing=-look.yaw-Math.PI/2
 if(f||s){const k=dt*2.4/Math.hypot(f,s);moveStep(engine.map!,engine.player,(-Math.sin(look.yaw)*f+Math.cos(look.yaw)*s)*k,(-Math.cos(look.yaw)*f-Math.sin(look.yaw)*s)*k,undefined,{z:engine.player.z});engine.updateInfiniteWindow()}
 renderer.applyView(engine);renderer.render(canvas,engine,{grain:false,flicker:0,shake:false},dt);frames++;requestAnimationFrame(frame)
}requestAnimationFrame(frame)
