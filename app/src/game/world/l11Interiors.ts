import type { L11Building } from './l11Types'
import { inPolygon, rectangle, segmentDistance, type Point } from './l11Geometry'
import {l11Shopfront} from './l11Shopfront'

export type L11RoomKind='living'|'bedroom'|'bathroom'|'studio'|'kitchen'|'workspace'|'meeting'|'reception'|'breakroom'|'records'|'reading'|'classroom'|'staffroom'|'shop'|'stockroom'|'gallery'|'fitness'|'workshop'|'plant'|'waiting'|'parking'
export interface L11Room {id:string;kind:L11RoomKind;floor:number;x:number;y:number;w:number;h:number;unit?:string}
export interface L11RoomDoor {id:string;a:Point;b:Point;center:Point;floor:number;from:string;to:string}
export interface L11InteriorWall {a:Point;b:Point;floor:number}
export interface L11InteriorFloor {floor:number;rooms:L11Room[];doors:L11RoomDoor[];walls:L11InteriorWall[];routes:Point[][]}
export interface L11InteriorPlan {floors:L11InteriorFloor[];walls:L11InteriorWall[]}
export const L11_ROOM_NAMES:Record<L11RoomKind,string>={living:'起居室与开放厨房',bedroom:'卧室',bathroom:'卫生间',studio:'独立开间',kitchen:'厨房',workspace:'办公区',meeting:'会议室',reception:'接待室',breakroom:'茶水间',records:'档案库',reading:'阅览室',classroom:'教室',staffroom:'教职工办公室',shop:'营业厅',stockroom:'储藏室',gallery:'展厅',fitness:'健身训练室',workshop:'生产车间',plant:'设备控制室',waiting:'候车厅',parking:'停车区'}
const cache=new WeakMap<L11Building,L11InteriorPlan>()
const insideRect=(x:number,y:number,r:{x:number;y:number;w:number;h:number},pad=0)=>x>=r.x-pad&&x<=r.x+r.w+pad&&y>=r.y-pad&&y<=r.y+r.h+pad
const stairBox=(s:L11Building['stairs'][number],pad:number)=>({x:s.x-pad,y:s.y-pad,w:(s.axis==='x'?s.length:s.width)+pad*2,h:(s.axis==='y'?s.length:s.width)+pad*2})
const distance=(a:Point,b:Point)=>(a[0]-b[0])**2+(a[1]-b[1])**2

/** A connected circulation skeleton is reserved before rooms are fitted. All
 * coordinates are in the building frame, shared by physics, meshes and props.
 * Upper floors keep wet rooms and the stair core aligned with the ground floor. */
export function l11InteriorPlan(b:L11Building):L11InteriorPlan {
  const hit=cache.get(b);if(hit)return hit
  const plan:L11InteriorPlan={floors:[],walls:[]};cache.set(b,plan)
  if(b.sealed)return plan
  if(b.archetype==='unfinished-frame'){plan.floors.push({floor:0,rooms:[],doors:[],walls:[],routes:[[b.doorLocal,b.exit?.center??[b.width/2,b.depth/2]]]});return plan}
  const xs=b.localFootprint[0].map(p=>p[0]),ys=b.localFootprint[0].map(p=>p[1])
  const ox=Math.min(...xs)+.2,oy=Math.min(...ys)+.2,nx=Math.floor(Math.max(...xs)-ox-.15),ny=Math.floor(Math.max(...ys)-oy-.15),count=nx*ny
  const point=(i:number):Point=>[ox+i%nx+.5,oy+Math.floor(i/nx)+.5]
  const valid=new Uint8Array(count),reserved=new Uint8Array(count),hall=new Uint8Array(count),parent=new Int32Array(count).fill(-1)
  const stairs=b.stairs.map(s=>stairBox(s,.8)),locker={x:b.width-3.65,y:1.8,w:2.3,h:2.4}
  type Slot={x:number;y:number;w:number;h:number;side:0|1|2|3;door:Point;retail?:boolean;street?:Point}
  const shops:Slot[]=[]
  const storefront=l11Shopfront(b)
  if(b.architecture==='pier-retail'||b.architecture==='blue-retail'){
    if(storefront?.available){
      const {x,y,w,h,side}=storefront
        const door:Point=side==='e'?[x,y+h/2]:side==='w'?[x+w,y+h/2]:side==='s'?[x+w/2,y]:[x+w/2,y+h]
        const street:Point=side==='e'?[x+w,y+h/2]:side==='w'?[x,y+h/2]:side==='s'?[x+w/2,y+h]:[x+w/2,y]
        shops.push({x,y,w,h,side:side==='e'?3:side==='w'?1:side==='s'?0:2,door,retail:true,street})
    }
    const addShops=(side:L11Building['front'])=>{
      const ew=side==='e'||side==='w',extent=ew?b.depth:b.width,depth=Math.min(8,(ew?b.width:b.depth)*.23),mid=extent/2
      for(const [a,c]of [[1.3,mid-3.5],[mid+3.5,extent-1.3]]){
        const span=c-a;if(span<3.5||depth<3.5)continue
        const x=ew?(side==='e'?b.width-depth:.15):a,y=ew?a:side==='s'?b.depth-depth:.15,w=ew?depth-.15:span,h=ew?span:depth-.15
        const rect={x,y,w,h},overlap=(q:{x:number;y:number;w:number;h:number})=>x<q.x+q.w+.3&&x+w>q.x-.3&&y<q.y+q.h+.3&&y+h>q.y-.3
        if(stairs.some(overlap)||overlap(locker)||shops.some(overlap)||!rectangle(x,y,w,h)[0].every(p=>inPolygon(...p,b.localFootprint)))continue
        const door:Point=side==='e'?[x,y+h/2]:side==='w'?[x+w,y+h/2]:side==='s'?[x+w/2,y]:[x+w/2,y+h]
        shops.push({...rect,side:side==='e'?3:side==='w'?1:side==='s'?0:2,door,retail:true})
      }
    }
    addShops(b.front)
    if(storefront)addShops(storefront.back)
  }
  const inShop=(x:number,y:number)=>shops.some(s=>insideRect(x,y,s,.05))
  for(let i=0;i<count;i++){
    const [x,y]=point(i)
    valid[i]=[[-.5,-.5],[.5,-.5],[-.5,.5],[.5,.5]].every(([u,v])=>inPolygon(x+u,y+v,b.localFootprint))?1:0
    if(stairs.some(s=>insideRect(x,y,s))||insideRect(x,y,locker)||inShop(x,y)||Math.hypot(x-b.doorLocal[0],y-b.doorLocal[1])<3.3)reserved[i]=1
  }
  const nearest=(p:Point,walk=true)=>{let best=-1,score=Infinity;for(let i=0;i<count;i++)if(valid[i]&&(!walk||!b.stairs.some(s=>insideRect(...point(i),stairBox(s,.15))))){const d=distance(p,point(i));if(d<score){score=d;best=i}}return best}
  const root=nearest(b.doorLocal);if(root<0)return plan
  const queue=[root];parent[root]=root
  for(let head=0;head<queue.length;head++){
    const i=queue[head],x=i%nx,y=Math.floor(i/nx)
    for(const [dx,dy]of [[1,0],[0,1],[-1,0],[0,-1]]){const xx=x+dx,yy=y+dy,k=yy*nx+xx;if(xx<0||xx>=nx||yy<0||yy>=ny||!valid[k]||parent[k]>=0||inShop(...point(k))||b.stairs.some(s=>insideRect(...point(k),stairBox(s,.15))))continue;parent[k]=i;queue.push(k)}
  }
  const routes:Point[][]=[],anchors:Point[]=[b.doorLocal,[b.width-2.5,4.8]]
  for(const s of shops)anchors.push([s.door[0]+(s.side===1?.7:s.side===3?-.7:0),s.door[1]+(s.side===2?.7:s.side===0?-.7:0)])
  // Each wing gets a spine. Thin courtyard wings have a corridor on the court
  // side, leaving a useful room depth along their exterior windows.
  for(const v of b.volumes.filter(v=>v.lo===0)){
    if(v.w>=v.d){const y=v.d<10?(v.y+v.d/2<b.depth/2?v.y+v.d-1.35:v.y+1.35):v.y+v.d/2;anchors.push([v.x+1.7,y],[v.x+v.w-1.7,y])}
    else{const x=v.w<10?(v.x+v.w/2<b.width/2?v.x+v.w-1.35:v.x+1.35):v.x+v.w/2;anchors.push([x,v.y+1.7],[x,v.y+v.d-1.7])}
  }
  for(const s of b.stairs)anchors.push(s.axis==='x'?[s.x-.7,s.y+s.width/2]:[s.x+s.width/2,s.y-.7],s.axis==='x'?[s.x+s.length+.7,s.y+s.width/2]:[s.x+s.width/2,s.y+s.length+.7])
  for(const ring of b.localFootprint.slice(1))for(let i=1;i<ring.length;i++){const a=ring[i-1],c=ring[i];if(Math.hypot(c[0]-a[0],c[1]-a[1])>3)anchors.push([(a[0]+c[0])/2,(a[1]+c[1])/2])}
  if(b.id==='l11:public-archive')anchors.push([3,23],[3,25])
  for(const target of anchors){const k=nearest(target);if(k<0||parent[k]<0)continue;const route:Point[]=[target];let i=k;while(i!==root){route.push(point(i));i=parent[i]}route.push(point(root));routes.push(route)}
  for(let i=0;i<count;i++)if(valid[i]){const [x,y]=point(i);hall[i]=routes.some(r=>r.slice(1).some((p,j)=>segmentDistance(x,y,r[j],p)<1.05))?1:0}
  // Any leftover cell is public circulation; room candidates must touch the
  // connected skeleton through an actual 1.4m door, never an isolated void.
  const free=Uint8Array.from(valid,(v,i)=>v&&!hall[i]&&!reserved[i]?1:0)
  const doorFor=(x:number,y:number,w:number,h:number):Pick<Slot,'side'|'door'>|undefined=>{
    const options:{side:0|1|2|3;door:Point;score:number}[]=[]
    for(let t=1;t<w-1;t++)for(const side of [0,2] as const){const yy=side===0?y-1:y+h,i=yy*nx+x+t;if(yy>=0&&yy<ny&&hall[i]&&hall[i+1])options.push({side,door:[ox+x+t+1,oy+y+(side===0?0:h)],score:Math.abs(t+1-w/2)})}
    for(let t=1;t<h-1;t++)for(const side of [1,3] as const){const xx=side===3?x-1:x+w,i=(y+t)*nx+xx;if(xx>=0&&xx<nx&&hall[i]&&hall[i+nx])options.push({side,door:[ox+x+(side===3?0:w),oy+y+t+1],score:Math.abs(t+1-h/2)})}
    return options.sort((a,c)=>a.score-c.score)[0]
  }
  const candidates:Slot[]=[]
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)if(free[y*nx+x]){
    let width=Math.min(12,nx-x)
    for(let h=1;h<=Math.min(10,ny-y)&&width>=3;h++){
      let run=0;while(run<width&&free[(y+h-1)*nx+x+run])run++;width=Math.min(width,run)
      if(h<3||width<3)continue
      for(const w of new Set([width,Math.min(8,width),Math.min(6,width)])){if(w*h<15)continue;const door=doorFor(x,y,w,h);if(door)candidates.push({x,y,w,h,...door})}
    }
  }
  candidates.sort((a,c)=>c.w*c.h-a.w*a.h||a.y-c.y||a.x-c.x)
  const slots:Slot[]=[]
  for(const slot of candidates){const {x,y,w,h}=slot;let ok=true;for(let j=y;j<y+h&&ok;j++)for(let i=x;i<x+w;i++)if(!free[j*nx+i]){ok=false;break}if(!ok)continue;slots.push({...slot,x:ox+x,y:oy+y});for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)free[j*nx+i]=0;if(slots.length>=(b.facadeProfile?64:18))break}
  // Snap perimeter rooms to the existing facade lining. A second blind wall
  // in front of the facade would seal their windows and steal their daylight.
  for(const s of slots){
    let x0=s.x,y0=s.y,x1=s.x+s.w,y1=s.y+s.h
    for(const ring of b.localFootprint)for(let i=1;i<ring.length;i++){
      const a=ring[i-1],c=ring[i]
      if(Math.abs(a[0]-c[0])<.0001&&Math.min(a[1],c[1])<=s.y+.01&&Math.max(a[1],c[1])>=s.y+s.h-.01){
        if(s.x-a[0]>=0&&s.x-a[0]<1.2)x0=a[0]+.15
        if(a[0]-s.x-s.w>=0&&a[0]-s.x-s.w<1.2)x1=a[0]-.15
      }
      if(Math.abs(a[1]-c[1])<.0001&&Math.min(a[0],c[0])<=s.x+.01&&Math.max(a[0],c[0])>=s.x+s.w-.01){
        if(s.y-a[1]>=0&&s.y-a[1]<1.2)y0=a[1]+.15
        if(a[1]-s.y-s.h>=0&&a[1]-s.y-s.h<1.2)y1=a[1]-.15
      }
    }
    s.x=x0;s.y=y0;s.w=x1-x0;s.h=y1-y0
  }
  slots.push(...shops)
  const roomKind=(i:number,f:number):L11RoomKind=>{
    const slot=slots[i]
    if(f===0&&slot?.retail)return 'shop'
    if(f===0&&(b.architecture==='pier-retail'||b.architecture==='blue-retail')&&slot){const distance=(side:L11Building['front'])=>side==='e'?b.width-slot.x-slot.w:side==='w'?slot.x:side==='s'?b.depth-slot.y-slot.h:slot.y;if(distance(b.front)<1.5||storefront&&distance(storefront.back)<1.5)return 'shop'}
    if(b.use===0||b.archetype==='corner-shops'&&f>0)return i%3===0?'living':i%3===1?'bedroom':'kitchen'
    if(b.use===1||b.archetype==='municipal')return i===0?(f===0?'reception':'workspace'):i===1?'workspace':i%5===2?'meeting':i%5===3?'breakroom':i%5===4?'bathroom':'workspace'
    if(b.archetype==='archive')return i%4===0?'reading':i%4===1?'records':i%4===2?'workspace':'bathroom'
    if(b.archetype==='school')return i%5<3?'classroom':i%5===3?'staffroom':'bathroom'
    if(b.archetype==='hotel')return f===0&&i===0?'reception':'studio'
    if(b.archetype==='museum')return i%4<3?'gallery':'stockroom'
    if(b.archetype==='sports-hall')return i%3===0?'fitness':i%3===1?'bathroom':'staffroom'
    if(b.archetype==='transit-station')return i%3===0?'waiting':i%3===1?'shop':'plant'
    if(b.archetype==='parking')return i===0?'plant':'parking'
    if(b.use===7)return i===0?'workshop':i%4===1?'stockroom':i%4===2?'plant':'breakroom'
    return i===0?'shop':i%4===1?'stockroom':i%4===2?'breakroom':i%4===3?'bathroom':'shop'
  }
  for(let floor=0;floor<b.accessible;floor++){
    const result:L11InteriorFloor={floor,rooms:[],doors:[],walls:[],routes}
    const room=(kind:L11RoomKind,x:number,y:number,w:number,h:number,unit?:string)=>{const r:L11Room={id:`${b.id}:f${floor}:room:${result.rooms.length}`,kind,floor,x,y,w,h,unit};result.rooms.push(r);return r}
    const door=(center:Point,alongX:boolean,from:string,to:string,width=1.4)=>result.doors.push({id:`${b.id}:f${floor}:door:${result.doors.length}`,center,a:[center[0]-(alongX?width/2:0),center[1]-(alongX?0:width/2)],b:[center[0]+(alongX?width/2:0),center[1]+(alongX?0:width/2)],floor,from,to})
    slots.forEach((s,i)=>{
      const residential=b.use===0||b.archetype==='hotel'&&(floor>0||i>0)||b.archetype==='corner-shops'&&floor>0
      // Orient each apartment from its real corridor door. Beds, bathrooms and
      // cooking areas belong to the same unit instead of unrelated random bays.
      const W=s.side%2?s.h:s.w,D=s.side%2?s.w:s.h
      const p=(u:number,v:number):Point=>s.side===0?[s.x+u,s.y+v]:s.side===1?[s.x+s.w-v,s.y+u]:s.side===2?[s.x+s.w-u,s.y+s.h-v]:[s.x+v,s.y+s.h-u]
      const sub=(kind:L11RoomKind,u:number,v:number,w:number,d:number,unit:string)=>{const a=p(u,v),c=p(u+w,v+d);return room(kind,Math.min(a[0],c[0]),Math.min(a[1],c[1]),Math.abs(c[0]-a[0]),Math.abs(c[1]-a[1]),unit)}
      if(residential&&W>=6&&D>=6){
        const unit=`${b.id}:unit:${floor}:${i}`,front=D*.53,split=W*.64
        const living=sub('living',0,0,W,front,unit),bed=sub('bedroom',0,front,split,D-front,unit),bath=sub('bathroom',split,front,W-split,D-front,unit)
        door(s.door,s.side%2===0,living.id,'hall');door(p(split/2,front),s.side%2===0,living.id,bed.id,1.2);door(p(split+(W-split)/2,front),s.side%2===0,living.id,bath.id,1.2)
      }else if(residential&&W>=6&&D>=3){
        // A narrow wing contains compact studios with their own sanitary room.
        const unit=`${b.id}:unit:${floor}:${i}`,doorU=s.side===0?s.door[0]-s.x:s.side===1?s.door[1]-s.y:s.side===2?s.x+s.w-s.door[0]:s.y+s.h-s.door[1],left=doorU>W/2,bathWidth=2.2
        const bath=sub('bathroom',left?0:W-bathWidth,0,bathWidth,D,unit),studio=sub('studio',left?bathWidth:0,0,W-bathWidth,D,unit),cut=left?bathWidth:W-bathWidth
        door(s.door,s.side%2===0,studio.id,'hall');door(p(cut,D/2),s.side%2!==0,studio.id,bath.id,1.2)
      }else{const r=room(roomKind(i,floor),s.x,s.y,s.w,s.h);door(s.door,s.side%2===0,r.id,'hall');if(floor===0&&s.street)door(s.street,s.side%2===0,r.id,'street',2.4)}
    })
    const walls=new Map<string,L11InteriorWall>()
    for(const r of result.rooms)for(const [a,c]of rectangle(r.x,r.y,r.w,r.h)[0].slice(1).map((p,i)=>[rectangle(r.x,r.y,r.w,r.h)[0][i],p])){
      const dx=c[0]-a[0],dy=c[1]-a[1],len=Math.hypot(dx,dy),tx=dx/len,ty=dy/len
      const cuts=result.doors.filter(d=>segmentDistance(d.center[0],d.center[1],a,c)<.01).map(d=>{const t=(d.center[0]-a[0])*tx+(d.center[1]-a[1])*ty,w=Math.hypot(d.b[0]-d.a[0],d.b[1]-d.a[1]);return [Math.max(0,t-w/2),Math.min(len,t+w/2)]}).sort((u,v)=>u[0]-v[0])
      let cursor=0
      const add=(lo:number,hi:number)=>{if(hi-lo<.02)return;const p:Point=[a[0]+lo*tx,a[1]+lo*ty],q:Point=[a[0]+hi*tx,a[1]+hi*ty]
        const facade=[.1,.5,.9].every(t=>{const x=p[0]+(q[0]-p[0])*t,y=p[1]+(q[1]-p[1])*t;return !inPolygon(x-ty*.3,y+tx*.3,b.localFootprint)||!inPolygon(x+ty*.3,y-tx*.3,b.localFootprint)})
        if(facade)return
        const key=[p.map(n=>n.toFixed(3)).join(','),q.map(n=>n.toFixed(3)).join(',')].sort().join(':');walls.set(key,{a:p,b:q,floor})}
      for(const [lo,hi]of cuts){add(cursor,lo);cursor=Math.max(cursor,hi)}add(cursor,len)
    }
    result.walls=[...walls.values()];plan.floors.push(result);plan.walls.push(...result.walls)
  }
  return plan
}
