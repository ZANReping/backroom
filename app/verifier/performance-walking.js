import { canOccupy, PLAYER_RADIUS } from '/src/game/core/player.ts'
import { floorHeight, bandOfPlayerZ } from '/src/game/world/mapgen.ts'

/** Find a short walkable ground route, then drive the real movement/collision code. */
export async function measureWalking(id, samples=600) {
  await perfQA.measure(id,30)
  const {engine:e,renderer:r,look}=perfQA,m=e.map,p=e.player
  const origin={x:p.x,y:p.y},band=bandOfPlayerZ(m,p.z)
  const key=(x,y)=>`${x},${y}`,start={x:Math.floor(p.x)+.5,y:Math.floor(p.y)+.5,parent:null}
  const seen=new Map([[key(start.x,start.y),start]]),queue=[start]
  const clear=(x,y)=>canOccupy(m,x,y,PLAYER_RADIUS,{z:p.z,band,crouch:false})&&Math.abs(floorHeight(m,x,y,band)-p.z)<.25
  for(let i=0;i<queue.length;i++){
    const point=queue[i]
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const x=point.x+dx,y=point.y+dy,k=key(x,y)
      if(seen.has(k)||Math.hypot(x-origin.x,y-origin.y)>10||![.25,.5,.75,1].every(t=>clear(point.x+dx*t,point.y+dy*t)))continue
      const next={x,y,parent:point};seen.set(k,next);queue.push(next)
    }
  }
  let end=queue.reduce((best,n)=>Math.hypot(n.x-origin.x,n.y-origin.y)>Math.hypot(best.x-origin.x,best.y-origin.y)?n:best,start)
  const path=[];while(end){path.unshift({x:end.x,y:end.y});end=end.parent}
  if(path.length<3)throw new Error(`L${id}: no walkable test route near spawn`)
  const route=[...path,...path.slice(0,-1).reverse()],cpu=[],frames=[],calls=[]
  let waypoint=0,distance=0,last=await new Promise(requestAnimationFrame),operations=0,blockedFrames=0,blockedStreak=0,turnarounds=0
  const door=[...r.animatedStructMeshes].find(([s])=>['hoteldoor','cabinet','dresser'].includes(s.kind))?.[0]
  const previousOpen=door?.data?.open,previousOpened=door?.data?.opened
  try {
    for(let n=0;n<samples;n++){
      const now=await new Promise(requestAnimationFrame);frames.push(now-last);last=now
      const at=performance.now(),target=route[waypoint]
      let dx=target.x-p.x,dy=target.y-p.y,length=Math.hypot(dx,dy)
      if(length<.14){waypoint=(waypoint+1)%route.length;dx=route[waypoint].x-p.x;dy=route[waypoint].y-p.y;length=Math.hypot(dx,dy)}
      // applyView converts local forward input into the direction selected below.
      e.input.mx=0;e.input.my=-1
      look.yaw=Math.atan2(-dx,-dy);look.pitch=0
      const x=p.x,y=p.y
      if(n%120===0){r.setHeldItem(n%240?'almond':'crowbar');if(door){door.data??={};door.data.open=n%240?1:0;door.data.opened=n%240?1:0}operations++}
      r.three.info.reset();r.applyView(e);e.update(1/60);r.render(r.three.domElement,e,{grain:false,flicker:.7,shake:false},1/60)
      const moved=Math.hypot(p.x-x,p.y-y)
      distance+=moved;cpu.push(performance.now()-at);calls.push(r.three.info.render.calls)
      if(moved<.001){blockedFrames++;blockedStreak++}else blockedStreak=0
      if(blockedStreak>=8){waypoint=(route.length-waypoint)%route.length;blockedStreak=0;turnarounds++}
    }
  }finally{
    e.input.mx=0;e.input.my=0
    if(door){door.data.open=previousOpen;door.data.opened=previousOpened}
  }
  const q=(values,p)=>[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*p)]
  if(distance<1)throw new Error(`L${id}: movement test stayed blocked (${distance.toFixed(2)}m)`)
  return {level:id,kind:'Real collision-constrained walking near spawn, repeated held-item selection and door/container animation; one seed/route only',
    samples,routeCells:path.length,distance,operations,blockedFrames,turnarounds,cpuP90:q(cpu,.9),cpuMax:Math.max(...cpu),frameP90:q(frames,.9),framesOver50ms:frames.filter(t=>t>50).length,
    fractionWithin60HzBudget:frames.filter(t=>t<=1000/60+.75).length/frames.length,drawCallsP50:q(calls,.5)}
}
