import type {Engine} from '../engine'
import type {NpcState} from '../content/npcs'
/** Fixed jobs and bounded walking routes; people never scatter into arbitrary hall space. */
export function updateTradersDuty(eng:Engine,n:NpcState,dt:number,walkOk:(x:number,y:number)=>boolean){
 const d=eng.map?.traders?.duties.get(n.id)
 if(!d){n.tx=n.homeX;n.ty=n.homeY;n.facing=n.homeFacing??n.facing;return true}
 if(d.activity!=='walk'||!d.route?.length){n.x=n.homeX;n.y=n.homeY;n.tx=n.x;n.ty=n.y;n.facing=n.homeFacing??d.facing;return true}
 n.moveT-=dt
 if(n.moveT<=0){const i=Math.floor(eng.time/6+Number(n.id.split('_').at(-1)))%d.route.length,[x,y]=d.route[i];n.tx=x;n.ty=y;n.moveT=3.5}
 const dx=n.tx-n.x,dy=n.ty-n.y,len=Math.hypot(dx,dy)
 if(len>.12){const step=Math.min(len,.58*dt),x=n.x+dx/len*step,y=n.y+dy/len*step;if(walkOk(x,y)&&!eng.npcs.some(other=>other!==n&&!other.dead&&Math.hypot(other.x-x,other.y-y)<.65)){n.x=x;n.y=y;n.facing=Math.atan2(dy,dx)}else{n.tx=n.homeX;n.ty=n.homeY}}
 return true
}
