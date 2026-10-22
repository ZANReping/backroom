import {placedTradersStructure,tradersLocalStructure,tradersDressingColliders} from './tradersDressingShapes'
import type {Structure} from '../core/types'
import {TRADERS_ROOMS,TRADERS_WALLS,TRADERS_BOUNDS,tradersContains,type TradersRect} from './tradersLayout'

/** Shared authored fit-out and duty anchors: meshes, collision and seated residents agree. */
export type TradersModel='waiting'|'planter'|'directory'|'queue'|'workstation'|'locker'|'divider'|'waterpoint'|'noticeboard'|'servicebay'|'parcel_cart'|'reception'|'lounge'|'dressing'|'atm'
export type TradersActivity='sit'|'desk'|'queue'|'guard'|'work'|'chat'|'walk'
export interface TradersDuty{id:string;x:number;y:number;facing:number;activity:TradersActivity;label:string;seatHeight?:number;route?:readonly [number,number][]}
export const TRADERS_SIGN_TEXT=['B.N.T.G. / ATM','存款 / DEPOSIT','取款 / CASH','信用点 / CREDIT','银行咨询与账户服务','B.N.T.G.','商人之家','TRADERS KEEP','咨询与导览 / INFORMATION','候场区 / WAITING','公共服务 / SERVICES','取号 · 等候叫号','员工通道 / STAFF','交易保险库 / TRADERS VAULT','货物交接 / DISPATCH','北步行街 / NORTH MALL','南步行街 / SOUTH MALL','库区 A / WAREHOUSE A','库区 B / WAREHOUSE B','库区 C / WAREHOUSE C','库区 D / WAREHOUSE D','冷藏库 / COLD STORE','高安库 / RESTRICTED','饮水与回收 / WATER','休息区 / LOUNGE','办公与登记 / ADMINISTRATION','装卸作业 / LOADING','应急出口 / EXIT','WC','A01','A02','A03','A04','请保持通道畅通'] as const
const props:Structure[]=[],duties:TradersDuty[]=[]
const room=(id:string)=>TRADERS_ROOMS.find(r=>r.id===id)!
function prop(model:TradersModel,id:string,x:number,y:number,w:number,h:number,data:Record<string,unknown>={}){
 if(model==='waterpoint'){w=1.85;h=.61}else if(model==='noticeboard')h=.15
 props.push(placedTradersStructure(model==='waiting'||model==='lounge'?'bench':'trade_counter',x,y,w,h,model!=='noticeboard',{tradersId:'fitout.'+id,tradersModel:model,tradersProp:model,height:1,...data}))
}
function duty(slot:number,x:number,y:number,facing:number,activity:TradersActivity,label:string,extra:Partial<TradersDuty>={}){duties.push({id:'traders_resident_'+slot,x,y,facing,activity,label,...extra})}
export function tradersFoodTable(row:number,col:number){const r=room('food_court');return{x:r.x+6+col*3.8+(col>=4?3:0),y:r.y+10+row*4.5+(row>=4?4:0)}}
// Arrival: a clear central route with paired terminal seating, information and luggage bays.
for(const [i,x] of [21,37,53].entries())for(const side of [0,1]){
 const y=side?120:98,deg=side?180:0;prop('waiting','west.wait.'+i+'.'+side,x,y,3.8,.8,{deg,height:.98})
 for(let seat=0;seat<2;seat++){const slot=i*4+side*2+seat;duty(slot,x+(seat?1.18:-1.18),y,side?-Math.PI/2:Math.PI/2,'sit','西门候场座椅',{seatHeight:.46})}
 prop('planter','west.planter.'+i+'.'+side,x+4,y,1.05,1.05,{height:1.55})
}
prop('directory','west.directory',65,100,2.8,.65,{height:2.35,label:'咨询与导览 / INFORMATION'})
prop('reception','west.information',64,116,5.4,2.4,{height:1.14,label:'咨询与导览 / INFORMATION'})
prop('waterpoint','west.water',13,120,1.8,.72,{height:1.55})
prop('noticeboard','west.notices',9,97,3,.18,{height:2.2,deg:180})
for(let i=0;i<6;i++){duty(12+i,97+(i%2)*1.9,69.4+Math.floor(i/2)*1.15,-Math.PI/2,'queue','公共柜台等候线');duty(18+i,98+(i%2)*1.2,89.5+Math.floor(i/2)*1.1,-Math.PI/2,'queue','兑换寄存等候线')}
for(const y of [71,90.5])prop('queue','bank.queue.'+y,97.6,y,3.1,4.5,{height:.95})
for(const x of [91,112]){prop('waiting','bank.wait.'+x,x,100,3.8,.8,{height:.98,deg:180});prop('planter','bank.green.'+x,x,97.5,1.05,1.05,{height:1.55})}
prop('servicebay','bank.assessment',106,73.2,4,1.3,{height:1.15,label:'办公与登记 / ADMINISTRATION'})
for(const [i,x] of [103,107].entries())prop('atm','bank.atm.'+i,x,105.382,1.08,1.04,{height:1.98,deg:180,bntgAtm:1,label:'银行 ATM '+(i+1)})
prop('directory','bank.tickets',115,90,1.1,.8,{height:1.85,label:'取号 · 等候叫号'})
for(let i=0;i<8;i++){
 const r=room('N'+String(2+i).padStart(2,'0'));const x=r.x+r.w/2,y=r.y+r.h+3.7
 duty(24+i,x,y,i%2?0:Math.PI,'walk','北街访客',{route:[[x-3,y],[x+3,y]]})
 const s=room('S'+String(2+i).padStart(2,'0'));const sx=s.x+s.w/2,sy=s.y-3.7
 duty(32+i,sx,sy,i%2?0:Math.PI,'walk','南街访客',{route:[[sx-3,sy],[sx+3,sy]]})
}
for(let i=0;i<8;i++){const p=tradersFoodTable(1+Math.floor(i/4)*3,1+i%4);duty(40+i,p.x,p.y+1.05,-Math.PI/2,'sit','美食广场休息座椅',{seatHeight:.46})}
for(const [i,p] of [[165,143],[168,143],[262,144],[265,144],[150,53],[153,53],[278,53],[281,53]].entries())duty(48+i,p[0],p[1],i%2?Math.PI:0,'chat','中庭会合点')
for(let i=0;i<4;i++){
 const x=376+i*11;prop('waiting','east.wait.'+i,x,119,3.8,.8,{deg:180,height:.98});prop('planter','east.green.'+i,x+3.5,119,1.05,1.05,{height:1.55})
 for(let side=0;side<2;side++)duty(56+i*2+side,x+(side?1.18:-1.18),119,-Math.PI/2,'sit','东门候场座椅',{seatHeight:.46})
}
for(let i=0;i<8;i++){const x=129.4+(i%2)*3.2,y=125+Math.floor(i/2)*10;duty(64+i,x,y,Math.PI/2,'walk','空市场公共通路',{route:[[x,y-3],[x,y+3]]})}
// Workstations include the actual chair, task lamp, screen, keyboard, folders and cabling.
const stations:{id:string;x:number;y:number;deg:number}[]=[]
for(const id of ['transport','visitor_center','tgpf','monitor']){
 const r=room(id),cols=id==='monitor'?3:2,rows=id==='visitor_center'?2:3
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
  const x=r.x+5+col*7,y=r.y+5+row*6.5,deg=0,station={id:id+'.station.'+row+'.'+col,x,y,deg};stations.push(station)
  prop('workstation',station.id,x,y,2.8,2.8,{deg,height:1.45,label:id==='monitor'?'TGPF / 通行核验':'办公与登记 / ADMINISTRATION'})
 }
 for(let j=0;j<3;j++)prop('locker',id+'.files.'+j,r.x+r.w-1.1,r.y+3+j*1.5,1.2,.6,{height:1.8,deg:90})
 prop('waterpoint',id+'.water',r.x+r.w-1.4,r.y+r.h-2.5,1.8,.7,{height:1.55})
 prop('noticeboard',id+'.notice',r.x+1,r.y+3,3,.18,{height:2.2,deg:90})
}
const bankPosts=[[98,63.4],[108,70.6],[98,83.5],[114,84],[90,61],[113,57]]
for(let i=0;i<16;i++){
 if(i<6)duty(72+i,bankPosts[i][0],bankPosts[i][1],Math.PI/2,'work','公共服务工位')
 else if(i<10){const s=stations.filter(s=>s.id.startsWith('visitor_center'))[i-6];duty(72+i,s.x,s.y+.76,-Math.PI/2,'desk','迎新登记桌',{seatHeight:.46})}
 else if(i<13)duty(72+i,201+(i-10)*5,137.8,Math.PI/2,'work','保险库登记台')
 else duty(72+i,63+(i-13)*1.2,114.25,Math.PI/2,'work','西门咨询台')
}
for(let i=0;i<24;i++){
 const r=room(i<12?'logistics':i<20?'secondary_sort':'dock'),j=i<12?i:i<20?i-12:i-20
 const x=r.x+5+(j%4)*Math.min(10,(r.w-10)/4),y=r.y+5+Math.floor(j/4)*7
 duty(88+i,x,y,Math.PI/2,i%3?'work':'walk',i<12?'分拣与封签工位':'后勤装卸通路',{route:[[x,y],[x+2,y],[x+2,y+2],[x,y+2]]})
 if(i%3===0)prop('parcel_cart','cargo.cart.'+i,x+2.2,y+1.2,1.2,1.7,{height:1.2})
}
const guardPosts=[[12,105],[71,111],[412,104],[368,112],[211,12],[217,12],[207,135],[223,135],[156,71],[273,71],[156,126],[273,126],[305,211],[335,212],[303,246],[336,264]]
for(let i=0;i<16;i++){const [x,y]=guardPosts[i];duty(112+i,x,y,i<2?0:i<4?Math.PI:Math.PI/2,'guard','TGPF 固定警戒岗')}
const admin=stations.filter(s=>s.id.startsWith('transport')||s.id.startsWith('monitor'))
for(let i=0;i<10;i++){const s=admin[i];duty(128+i,s.x,s.y+.76,-Math.PI/2,'desk','行政/监控工位',{seatHeight:.46})}
// Residential bays break the oversized barracks into six four-bed clusters.
const dorm=room('dormitory')
for(let row=0;row<3;row++)for(let col=0;col<2;col++){
 const x=dorm.x+3.5+col*13.5,y=dorm.y+7+row*17
 prop('divider','dorm.screen.'+row+'.'+col,x+3.3,y+6.5,8.7,.15,{height:2.15})
 for(let i=0;i<4;i++)prop('locker','dorm.locker.'+row+'.'+col+'.'+i,x+i*1.45,y+6,1.25,.6,{height:1.8})
}
for(let i=0;i<16;i++){
 const x=dorm.x+5+(i%4)*6,y=dorm.y+4+Math.floor(i/4)*17
 duty(138+i,x,y,i%2?0:Math.PI,i<8?'chat':'walk','宿舍公共休息通路',{route:[[x,y],[x+1.2,y]]})
}
// Public amenities and visual breaks, all outside the main evacuation/cargo lanes.
for(const p of [[154,147],[269,147],[151,58],[276,58]]){prop('lounge','court.lounge.'+p.join('.'),p[0],p[1],5,3,{height:1.05});prop('planter','court.green.'+p.join('.'),p[0]+4,p[1],1.3,1.3,{height:1.9})}
prop('directory','court.directory',144,98,3,.7,{height:2.5,label:'交易保险库 / TRADERS VAULT'})
for(const id of ['food_court','vacant_market']){
 const r=room(id);prop('waterpoint',id+'.recycle',r.x+3,r.y+r.h-4,2.5,.8,{height:1.55});prop('noticeboard',id+'.notices',r.x+r.w-3,r.y+1,3,.18,{height:2.2})
 for(const side of [0,1])for(const row of [0,1,2])prop('planter',id+'.planter.'+side+'.'+row,r.x+3+side*(r.w-6),r.y+5+row*(r.h-10)/2,1.1,1.1,{height:1.65})
}
// Attach existing wall furniture to a complete real wall, on its occupied side.
for(const s of props){
 const id=String(s.data?.tradersId),model=s.data?.tradersModel
 if(model!=='noticeboard'&&model!=='waterpoint'&&!(model==='locker'&&id.includes('.files.')))continue
 const local=tradersLocalStructure(s),cx=s.x+s.w/2,cy=s.y+s.h/2,candidates:{x:number;y:number;deg:number;wallId:string;score:number;nx:number;ny:number}[]=[]
 for(const wall of TRADERS_WALLS){
  if(wall.bottom!==0||wall.height<Number(s.data?.height??2.2)||Math.max(wall.w,wall.h)<local.w+.3)continue
  const horizontal=wall.w>wall.h,fixed=horizontal?wall.y+wall.h/2:wall.x+wall.w/2,start=horizontal?wall.x:wall.y,length=horizontal?wall.w:wall.h
  const along=Math.max(start+local.w/2+.14,Math.min(start+length-local.w/2-.14,horizontal?cx:cy)),sign=(horizontal?cy:cx)>=fixed?1:-1,nx=horizontal?0:sign,ny=horizontal?sign:0,off=(horizontal?wall.h:wall.w)/2+local.h/2+.008
  const x=(horizontal?along:fixed)+nx*off,y=(horizontal?fixed:along)+ny*off
  if(!tradersContains(TRADERS_BOUNDS,x,y)||TRADERS_ROOMS.some(r=>(r.kind==='shop'||r.kind==='anchor'||r.id==='dock'||r.id==='rail_terminal')&&tradersContains(r,x,y)))continue
  candidates.push({x,y,deg:Math.atan2(nx,ny)*180/Math.PI,wallId:wall.id,score:Math.hypot(cx-x,cy-y),nx,ny})
 }
 const best=candidates.sort((a,b)=>a.score-b.score)[0]
 if(best)Object.assign(s,placedTradersStructure(s.kind,best.x,best.y,local.w,local.h,s.solid,{...s.data,deg:best.deg,wallId:best.wallId,wallNormalX:best.nx,wallNormalY:best.ny,wallGap:.008}))
}
const guide=props.find(s=>s.data?.tradersId==='fitout.court.directory')!
Object.assign(guide,placedTradersStructure(guide.kind,guide.x+guide.w/2,guide.y+guide.h/2,Number(guide.data?.localW),Number(guide.data?.localD),guide.solid,{...guide.data,deg:-90}))
export const TRADERS_FITOUT:readonly Structure[]=props
export const TRADERS_DUTIES:readonly TradersDuty[]=duties
const byId=new Map(duties.map(d=>[d.id,d]))
export function tradersDuty(id:string){return byId.get(id)}
export function tradersFitoutForChunk(cx:number,cy:number){const bounds:TradersRect={x:cx*32,y:cy*32,w:32,h:32};return props.filter(s=>tradersContains(bounds,s.x+s.w/2,s.y+s.h/2)).map(s=>({...s,data:{...s.data}}))}

/** Semantic solid pieces; independent of material batching and render readiness. */
export function tradersFitoutColliders(s:Structure){
 if(s.data?.tradersModel==='dressing')return tradersDressingColliders(s)
 s=tradersLocalStructure(s)
 const pieces:{x:number;z:number;w:number;d:number;bottom:number;top:number}[]=[],model=s.data?.tradersModel as TradersModel
 const add=(x:number,z:number,w:number,d:number,top:number,bottom=0)=>pieces.push({x,z,w,d,top,bottom})
 if(!s.solid)return[]
 if(model==='waiting')for(const x of [-1.18,0,1.18])add(x,0,.85,.62,1.03)
 else if(model==='workstation'){add(0,-.12,2.4,1.08,.80);add(0,.76,.62,.60,1.04);add(.2,-.32,.6,.10,1.48,.79)}
 else if(model==='planter')add(0,0,s.w,s.h,.66)
 else if(model==='queue')for(const x of [-s.w/2,s.w/2])for(const z of [-s.h/2,s.h/2])add(x,z,.17,.17,1)
 else if(model==='lounge'){for(const x of [-1.55,1.55])add(x,0,1.3,2.6,.58);add(0,0,1.1,1.2,.45)}
 else add(0,0,s.w,s.h,model==='divider'?2.15:model==='directory'?2.3:model==='locker'?1.8:model==='waterpoint'?1.4:model==='atm'?1.98:1.15)
 const a=Number(s.data?.deg??0)*Math.PI/180,c=Math.cos(a),sn=Math.sin(a),cx=s.x+s.w/2,cy=s.y+s.h/2
 return pieces.map(p=>{const points=[[-p.w/2,-p.d/2],[-p.w/2,p.d/2],[p.w/2,-p.d/2],[p.w/2,p.d/2]].map(([x,z])=>[cx+(x+p.x)*c+(z+p.z)*sn,cy-(x+p.x)*sn+(z+p.z)*c]);return{x0:Math.min(...points.map(p=>p[0])),x1:Math.max(...points.map(p=>p[0])),y0:Math.min(...points.map(p=>p[1])),y1:Math.max(...points.map(p=>p[1])),bottom:p.bottom,top:p.top,stand:false}})
}
