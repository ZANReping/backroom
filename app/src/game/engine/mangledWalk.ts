import type {Engine} from '../engine'
import type {Entity} from '../entities'
// Outdoor arrival, pursuit and departure share a bounded route. World points survive streaming rebases.
type Route={map:Engine['map'];mode:string;goalX:number;goalY:number;points:{x:number;y:number}[];at:number;retry:number}
const routes=new WeakMap<Entity,Route>()
function plan(eng:Engine,e:Entity,gx:number,gy:number,stopRange:number){
 const m=eng.map!,w=m.w,h=m.h,ox=m.inf?.ox??0,oy=m.inf?.oy??0,sx=Math.floor(e.x),sy=Math.floor(e.y),start=sy*w+sx
 if(sx<0||sy<0||sx>=w||sy>=h)return []
 const parent=new Int32Array(w*h).fill(-1),queue=new Int32Array(w*h),height=new Float32Array(w*h),known=new Uint8Array(w*h)
 const ground=(i:number)=>{if(!known[i]){known[i]=1;const x=i%w,y=Math.floor(i/w);height[i]=(eng.levelDef.id!==9||m.outdoor[i]===1)?(eng.entityWalkH(m,x,y,0)??NaN):NaN}return height[i]}
 parent[start]=start;queue[0]=start;let used=1,best=start,score=-Infinity
 for(let head=0;head<used&&head<7000;head++){
  const i=queue[head],x=i%w+.5,y=Math.floor(i/w)+.5,dist=Math.hypot(gx-x,gy-y)
  const v=-dist
  if(v>score){best=i;score=v}
  if(dist<stopRange && eng.los(x,y,gx,gy)){best=i;break}
  const z=ground(i);if(!Number.isFinite(z))continue
  for(const j of [i-w,i+1,i+w,i-1]){
   const xx=j%w,yy=Math.floor(j/w)
   if(j<0||j>=w*h||xx<2||yy<2||xx>=w-2||yy>=h-2||Math.abs(xx-(i%w))+Math.abs(yy-Math.floor(i/w))!==1||parent[j]!==-1)continue
   const nz=ground(j);if(!Number.isFinite(nz)||Math.abs(nz-z)>.4)continue
   parent[j]=i;queue[used++]=j
  }
 }
 const points:{x:number;y:number}[]=[]
 for(let i=best;i!==start&&i>=0;i=parent[i])points.push({x:i%w+.5+ox,y:Math.floor(i/w)+.5+oy})
 points.reverse()
 const clear=(ax:number,ay:number,bx:number,by:number)=>{const n=Math.ceil(Math.hypot(bx-ax,by-ay)/.3);let z=ground(Math.floor(ay)*w+Math.floor(ax));for(let k=1;k<=n;k++){const x=ax+(bx-ax)*k/n,y=ay+(by-ay)*k/n;for(const [dx,dy] of [[0,0],[.25,0],[-.25,0],[0,.25],[0,-.25]]){const xx=Math.floor(x+dx),yy=Math.floor(y+dy);if(xx<0||yy<0||xx>=w||yy>=h)return false;const gh=ground(yy*w+xx);if(!Number.isFinite(gh)||Math.abs(gh-z)>.4)return false}z=ground(Math.floor(y)*w+Math.floor(x))}return true}
 const result:{x:number;y:number}[]=[];let ax=e.x,ay=e.y
 for(let a=0;a<points.length;){let b=points.length-1;while(b>a&&!clear(ax,ay,points[b].x-ox,points[b].y-oy))b--;const p=points[b];result.push(p);ax=p.x-ox;ay=p.y-oy;a=b+1}
 return result
}
function stepRoute(eng:Engine,e:Entity,speed:number,dt:number,mode:string,gx:number,gy:number,stopRange:number){
 const m=eng.map;if(!m||dt<=0)return
 const ox=m.inf?.ox??0,oy=m.inf?.oy??0
 let r=routes.get(e)
 const chasing=mode==='pursuit'
 if(!r||r.map!==m||r.mode!==mode||Math.hypot(r.goalX-gx,r.goalY-gy)>(chasing?3:8)||(r.retry-=dt)<=0){r={map:m,mode,goalX:gx,goalY:gy,points:plan(eng,e,gx-ox,gy-oy,stopRange),at:0,retry:chasing?2.5:8};routes.set(e,r)}
 while(r.at<r.points.length&&Math.hypot(r.points[r.at].x-ox-e.x,r.points[r.at].y-oy-e.y)<.32)r.at++
 const p=r.points[r.at];if(!p)return
 e.targetX=p.x-ox;e.targetY=p.y-oy
 const x=e.x,y=e.y;eng.stepEntity(e,Math.min(speed,Math.hypot(e.targetX-x,e.targetY-y)/Math.max(dt,.001)),dt)
 if(Math.hypot(e.x-x,e.y-y)<.001)r.retry=Math.min(r.retry,.6)
}
/** Keep following a moving player, including developer-spawned Mangled without a fog event. */
export function stepMangledPursuit(eng:Engine,e:Entity,speed:number,dt:number,stopRange:number){
 const m=eng.map;if(!m)return
 e.state='chase'
 stepRoute(eng,e,speed,dt,'pursuit',eng.player.x+(m.inf?.ox??0),eng.player.y+(m.inf?.oy??0),stopRange)
}
export function stepMangledFog(eng:Engine,e:Entity,speed:number,dt:number){
 const t=e.l9FogTravel,m=eng.map;if(!t||!m)return
 const leaving=t.mode==='leave',ox=m.inf?.ox??0,oy=m.inf?.oy??0
 stepRoute(eng,e,speed,dt,t.mode,leaving?t.exitX:eng.player.x+ox,leaving?t.exitY:eng.player.y+oy,leaving?0:18)
}
