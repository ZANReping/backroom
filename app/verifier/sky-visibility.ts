import { l11MetroRampHeight } from '../src/game/world/l11Metro'
import { l11TerrainHeight } from '../src/game/world/l11Hydrology'

const baseline = new URLSearchParams(location.search).has('baseline')
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
async function frames(n=12) { for(let i=0;i<n;i++)await frame() }
function check(ok:unknown,reason:string){if(!baseline&&!ok)throw Error(reason)}
let current=''
const cases=['l2-corridor','l3-corridor','l4-office','l4-window','l5-corridor','l2-fog-off',
  'l11-metro-far','l11-metro-fog-off','l11-metro-rain','l11-metro-mist',
  'l11-entrance','l11-entrance-rain','l11-entrance-mist','l11-ramp','l11-street','l6-underground',
  'l7-cabin-closed','l7-cabin-open','l7-sea','l7-underwater','l9-street','l10-field']
export async function setup(qa:any){qa.hide();qa.r.resize(1920,1080,1);qa.freezeRenderTime(20);return cases}

function pose(qa:any,x:number,y:number,z:number,yaw=0,pitch=.02){
  qa.moveTo(x,y);Object.assign(qa.eng.player,{z,vz:0,crouching:false,flashlight:false});
  qa.look.yaw=yaw;qa.look.pitch=pitch;qa.look.roll=0;qa.r.setFov(75);qa.r.bobPhase=0
}
function corridor(qa:any,under=false){
  const m=qa.eng.map,a=under?m.dn:m.tiles
  let best={x:qa.eng.player.x,y:qa.eng.player.y,dx:0,dy:-1,len:0}
  for(let y=2;y<m.h-2;y+=2)for(let x=2;x<m.w-2;x+=2){
    if(a[y*m.w+x]!==1||(!under&&m.outdoor[y*m.w+x]))continue
    for(const[dx,dy]of [[1,0],[0,1]]){
      let n=0
      while(n<120&&x+dx*n<m.w-1&&y+dy*n<m.h-1&&a[(y+dy*n)*m.w+x+dx*n]===1)n++
      if(n>best.len)best={x:x+.5,y:y+.5,dx,dy,len:n}
    }
  }
  pose(qa,best.x+(m.inf?.ox??0),best.y+(m.inf?.oy??0),under?-5:0,Math.atan2(-best.dx,-best.dy))
  return best
}
function state(qa:any){const r=qa.r,s=r.skyMesh;return {level:qa.eng.player.level,sky:!!s,visible:s?.visible??false,
  opening:s?.material.uniforms?.uSkyPortal?.value??null,amount:s?.material.uniforms?.uSkyAmount?.value??null,
  enclosure:r.skyEnclosure??null,underwater:r.uwK,rainVisible:r.l10Rain.visible,cloudSize:s?.userData.sky?.rt?[s.userData.sky.rt.width,s.userData.sky.rt.height]:null,
  fog:{near:r.scene.fog.near,far:r.scene.fog.far,color:r.scene.fog.color.getHexString()},background:r.scene.background.getHexString(),
  memory:{...r.three.info.memory},pose:{x:qa.eng.player.x+(qa.eng.map.inf?.ox??0),y:qa.eng.player.y+(qa.eng.map.inf?.oy??0),z:qa.eng.player.z,yaw:qa.look.yaw,pitch:qa.look.pitch,fov:r.camera.fov}}}
export async function view(qa:any,id:string){
  const level=Number(id.match(/^l(\d+)/)![1]);current=id
  console.log('SKY_QA '+id)
  if(qa.eng.player.level!==level)await qa.scene(level)
  // Keep the renderer clock running while streaming/compilation settles;
  // freeze only the finished photograph, not background preparation timers.
  await qa.sample(1,0)
  qa.r.setFog(!id.endsWith('fog-off'));qa.eng.dev.bright=false
  Object.assign(qa.eng.l11Weather,{kind:'calm',k:0,wetness:0});Object.assign(qa.eng.l10Weather,{kind:'calm',k:0,wetness:0})
  if(id.endsWith('-rain')||id.endsWith('-mist'))Object.assign(qa.eng.l11Weather,{kind:id.endsWith('-rain')?'rain':'mist',k:1,wetness:1})
  let detail:any
  if(id==='l4-window'){
    qa.eng.devGotoVariant('windowview');await frames(2)
    const m=qa.eng.map,s=m.structures.find((s:any)=>s.kind==='glasswin'&&!s.data?.partition&&Math.hypot(s.x-qa.eng.player.x,s.y-qa.eng.player.y)<25)
    if(s){const x=s.x+.5,y=s.y+.5;let selected=false;for(const[dx,dy]of [[2,0],[-2,0],[0,2],[0,-2]]){const i=Math.floor(y+dy)*m.w+Math.floor(x+dx);if(m.tiles[i]===1&&!m.outdoor[i]){pose(qa,x+dx+m.inf.ox,y+dy+m.inf.oy,0,Math.atan2(dx,dy),.12);selected=true;break}}detail={window:!!s,selected}}
  }else if(level<=5)detail=corridor(qa)
  else if(level===11){
    if(id.startsWith('l11-metro-'))pose(qa,16,164,-5,Math.PI,.04)
    if(id.startsWith('l11-entrance'))pose(qa,27.5,132,-5,0,.55)
    if(id==='l11-ramp')pose(qa,27.5,125,l11MetroRampHeight(27.5,125,qa.eng.map.inf.seed)!,0,.35)
    if(id==='l11-street')pose(qa,27.5,116,l11TerrainHeight(qa.eng.map.inf.seed,27.5,116),Math.PI,.3)
  }else if(level===6){detail=corridor(qa,true);qa.eng.player.flashlight=true}
  else if(level===7){
    if(id.startsWith('l7-cabin')){
      pose(qa,14.5,22.6,3,Math.PI,.14)
      const door=qa.eng.map.structures.find((s:any)=>s.kind==='hoteldoor'&&s.data?.l7porch)
      check(door,'L7 cabin has a real door')
      door.data.open=id.endsWith('open')?1:0;door.solid=!door.data.open
    }else pose(qa,24,26,id==='l7-underwater'?-8:0,-1.6,id==='l7-underwater'?.05:.2)
    qa.eng.submerged=id==='l7-underwater'
  }
  else{qa.look.pitch=.26;qa.look.yaw=.42}
  await qa.warm();qa.freezeRenderTime(20);await frames(35)
  return {id,detail,...state(qa)}
}
export async function measure(qa:any){
  const r=qa.r,sky=r.skyMesh,system=sky?.userData.sky,render=r.three.render,draw=sky?.onBeforeRender
  const values:number[]=[],calls:number[]=[],geometry:number[]=[];let skyDraws=0,cloudDraws=0,last=performance.now()
  if(sky)sky.onBeforeRender=function(...args:any[]){skyDraws++;draw?.apply(this,args)}
  r.three.render=function(...args:any[]){if(system?.rt&&this.getRenderTarget()===system.rt)cloudDraws++;return render.apply(this,args)}
  try{for(let i=0;i<90;i++){await frame();const now=performance.now();values.push(now-last);last=now;calls.push(r.three.info.render.calls);geometry.push(r.three.info.render.triangles)}}
  finally{r.three.render=render;if(sky)sky.onBeforeRender=draw}
  const closed=/^l[2345]-/.test(current)||current==='l6-underground'||current==='l7-underwater'||current==='l7-cabin-closed'||current.startsWith('l11-metro-')
  if(closed){check(skyDraws===0,'Hidden sky was drawn in '+current);check(cloudDraws===0,'Hidden clouds updated in '+current)}
  if(/^l[2345]-/.test(current))check(!sky,'Fully indoor level still allocates a sky '+current)
  if(current==='l11-metro-rain'||current==='l11-metro-mist')check(r.scene.fog.far<=38.1,'Surface weather erased underground distance atmosphere')
  if(current==='l11-metro-rain')check(!r.l10Rain.visible,'Surface rain renders under the metro roof')
  check(r.scene.background.equals(r.scene.fog.color),'Background does not match final fog '+current)
  if(['l11-ramp','l11-street','l7-cabin-open','l7-sea','l9-street','l10-field'].includes(current))check(skyDraws>0,'Visible outdoor sky missing '+current)
  const percentile=(a:number[],p:number)=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*p)]
  return {frames:values.length,skyDraws,cloudDraws,median:percentile(values,.5),p95:percentile(values,.95),calls:percentile(calls,.5),triangles:percentile(geometry,.5),...state(qa)}
}
export async function transitions(qa:any){
  console.log('SKY_QA transitions: ramp down/up and scene replacement')
  if(qa.eng.player.level!==11)await qa.scene(11)
  await qa.sample(1,0);qa.r.setFog(true)
  Object.assign(qa.eng.l11Weather,{kind:'calm',k:0,wetness:0})
  pose(qa,27.5,116,l11TerrainHeight(qa.eng.map.inf.seed,27.5,116),0,.35);await qa.warm()
  const samples=[]
  // The ordinary renderer runs between every step; this is not a mock sky.
  for(let y=116;y<=134;y+=.5){
    const ground=l11TerrainHeight(qa.eng.map.inf.seed,27.5,y),ramp=l11MetroRampHeight(27.5,y,qa.eng.map.inf.seed)
    pose(qa,27.5,y,ramp??(y>130?-5:ground),0,.35);await frames(5);samples.push(state(qa))
  }
  for(let y=134;y>=116;y-=.5){
    pose(qa,27.5,y,l11MetroRampHeight(27.5,y,qa.eng.map.inf.seed)??(y>130?-5:l11TerrainHeight(qa.eng.map.inf.seed,27.5,y)),0,.35);await frames(5);samples.push(state(qa))
  }
  check(samples.every(v=>v.background===v.fog.color),'Transition fog/background mismatch')
  check(samples.some(v=>(v.enclosure??0)>.99)&&samples.some(v=>(v.enclosure??1)<.01),'Metro atmosphere did not transition both ways')
  let maxEnclosureStep=0
  for(let i=1;i<samples.length;i++)maxEnclosureStep=Math.max(maxEnclosureStep,Math.abs(samples[i].enclosure-samples[i-1].enclosure))
  check(maxEnclosureStep<.4,'Abrupt metro atmosphere switch '+maxEnclosureStep)
  const levels=[]
  for(const id of [2,10,5,10]){
    console.log('SKY_QA transition level '+id)
    const old=qa.r.skyMesh?.userData.sky
    await qa.scene(id);await qa.warm();await frames(3)
    if(old)check(old.disposed,'Prior sky not released on scene switch')
    check(id===10?!!qa.r.skyMesh:!qa.r.skyMesh,'Wrong sky after scene switch '+id)
    check(qa.r.uwK===0&&qa.r.skyEnclosure===(id===10?0:1),'Old underground/water atmosphere survived scene switch '+id)
    if(id===10)check(qa.r.skyMesh.material.uniforms.uSkyPortal.value===0,'Old metro aperture survived into outdoor scene')
    levels.push(state(qa))
  }
  return {samples,maxEnclosureStep,levels}
}
