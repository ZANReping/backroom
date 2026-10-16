import type {Engine} from '../engine'
import type {NpcState} from '../content/npcs'
import {ALPHA_DUTIES,insideAlphaDuty} from '../content/alphaDuties'

/** Short work-area movements, with continuous collision checks and conversation pauses. */
export function updateAlphaDuty(eng:Engine,n:NpcState,dt:number,walkOk:(x:number,y:number)=>boolean){
 const duty=ALPHA_DUTIES[n.id];if(!duty)return false
 const p=eng.player,near=Math.hypot(p.x-n.x,p.y-n.y)<2.4&&eng.los(n.x,n.y,p.x,p.y)
 const clear=(x:number,y:number)=>walkOk(x,y)&&Math.hypot(p.x-x,p.y-y)>.65&&!eng.npcs.some(o=>o!==n&&!o.dead&&Math.hypot(o.x-x,o.y-y)<.68)
 const turn=(angle:number)=>{const diff=Math.atan2(Math.sin(angle-n.facing),Math.cos(angle-n.facing));n.facing+=diff*Math.min(1,dt*4)}
 n.moveT-=dt
 if(near){n.tx=n.x;n.ty=n.y;turn(Math.atan2(p.y-n.y,p.x-n.x));n.moveT=Math.max(n.moveT,3);return true}
 if(n.moveT<=0){
  n.tx=n.x;n.ty=n.y;n.moveT=10+Math.random()*12
  if(Math.random()<.25&&n.def.idle.length){n.bubbleText=n.def.idle[Math.floor(Math.random()*n.def.idle.length)];n.bubbleT=3}
  if(duty.radius>0)for(let attempt=0;attempt<5;attempt++){
   const a=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*duty.radius,x=duty.x+Math.cos(a)*r,y=duty.y+Math.sin(a)*r,steps=Math.ceil(Math.hypot(x-n.x,y-n.y)/.12)
   let valid=true
   for(let i=1;i<=steps;i++)if(!clear(n.x+(x-n.x)*i/steps,n.y+(y-n.y)*i/steps)){valid=false;break}
   if(valid){n.tx=x;n.ty=y;break}
  }
 }
 const dx=n.tx-n.x,dy=n.ty-n.y,d=Math.hypot(dx,dy)
 if(d>.025){
  const step=Math.min(d,.38*dt),x=n.x+dx/d*step,y=n.y+dy/d*step
  if(insideAlphaDuty(duty,x,y)&&clear(x,y)){n.x=x;n.y=y;turn(Math.atan2(dy,dx))}
  else{n.tx=n.x;n.ty=n.y;n.moveT=4}
 }else{n.tx=n.x;n.ty=n.y;turn(duty.facing)}
 return true
}
