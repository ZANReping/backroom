import {tradersHallPosts,tradersArchPosts} from './tradersRibs'
import type {Structure} from '../core/types'
import {TRADERS_ROOMS,TRADERS_WALLS,TRADERS_FIXED_PEOPLE,TRADERS_BOUNDS,tradersContains,type TradersRect} from './tradersLayout'
import {TRADERS_FITOUT,TRADERS_DUTIES,tradersFitoutColliders,tradersFoodTable} from './tradersFitout'
import {DRESSING_SIZE,placedTradersStructure,type DressingKind} from './tradersDressingShapes'
const props:Structure[]=[],skipped:{id:string;reason:string}[]=[]
const closed=new Set(['rail_terminal','dock']),reserved:{x:number;y:number}[]=[...TRADERS_FIXED_PEOPLE,...TRADERS_DUTIES]
for(const q of TRADERS_DUTIES)if(q.activity==='walk'&&q.route)for(let i=0;i<q.route.length;i++){const a=q.route[i],b=q.route[(i+1)%q.route.length],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.25);for(let j=0;j<=n;j++)reserved.push({x:a[0]+(b[0]-a[0])*j/n,y:a[1]+(b[1]-a[1])*j/n})}
const solids=[...TRADERS_FITOUT.flatMap(s=>tradersFitoutColliders(s)),...[...tradersHallPosts(),...tradersArchPosts()].map(s=>({x0:s.x,y0:s.y,x1:s.x+s.w,y1:s.y+s.h,bottom:0,top:5}))].filter(c=>c.bottom<1.8)
const distance=(s:TradersRect,p:{x:number;y:number})=>Math.hypot(Math.max(s.x-p.x,0,p.x-s.x-s.w),Math.max(s.y-p.y,0,p.y-s.y-s.h))
function emit(kind:DressingKind,id:string,x:number,y:number,deg=0,room='public',extra:Record<string,unknown>={}){
 const [w,d,height,bottom]=DRESSING_SIZE[kind],solid=!['clock','notice','camera','outlet','whiteboard','mapboard','rug','tabletop','monitors'].includes(kind)
 const s=placedTradersStructure(kind==='bedkit'?'bed':'trade_counter',x,y,w,d,solid,{tradersId:'dress.'+id,tradersModel:'dressing',dressing:kind,tradersProp:'dressing',deg,height,bottom,roomId:room,variant:props.length%3,...extra})
 const reason=TRADERS_ROOMS.some(r=>(r.kind==='shop'||r.kind==='anchor'||closed.has(r.id))&&tradersContains(r,x,y))?'excluded':solid&&bottom<1.8&&reserved.some(p=>distance(s,p)<.45)?'resident clearance':solid&&solids.some(c=>s.x<c.x1+.10&&s.x+s.w>c.x0-.10&&s.y<c.y1+.10&&s.y+s.h>c.y0-.10&&bottom<c.top&&height>c.bottom)?'existing furniture':undefined
 if(reason){skipped.push({id,reason});return}
 props.push(s)
}
function seating(model:'waiting'|'lounge',id:string,x:number,y:number,deg:number,roomId:string){
 const w=model==='waiting'?3.8:5,d=model==='waiting'?.8:3,s=placedTradersStructure('bench',x,y,w,d,true,{tradersId:'dress.'+id,tradersModel:model,tradersProp:model,deg,height:model==='waiting'?1.03:.64,roomId})
 if(reserved.some(p=>distance(s,p)<.50)||solids.some(c=>s.x<c.x1+.15&&s.x+s.w>c.x0-.15&&s.y<c.y1+.15&&s.y+s.h>c.y0-.15))return
 props.push(s)
}
type Side='n'|'s'|'e'|'w' 
function mount(r:TradersRect&{id?:string},side:Side,t:number,kind:DressingKind,id:string,outside=false){
 const [w,d,height]=DRESSING_SIZE[kind],horizontal=side==='n'||side==='s',axis=horizontal?r.x:r.y,fixed=side==='n'?r.y:side==='s'?r.y+r.h:side==='w'?r.x:r.x+r.w,along=axis+t
 const wall=TRADERS_WALLS.find(a=>a.bottom===0&&a.height>=height&&(horizontal?Math.abs(a.y+a.h/2-fixed)<.02&&along-w/2>a.x+.12&&along+w/2<a.x+a.w-.12:Math.abs(a.x+a.w/2-fixed)<.02&&along-w/2>a.y+.12&&along+w/2<a.y+a.h-.12))
 if(!wall){skipped.push({id,reason:'no complete backing wall'});return}
 let nx=side==='w'?1:side==='e'?-1:0,ny=side==='n'?1:side==='s'?-1:0
 if(outside){nx=-nx;ny=-ny}
 const off=.09+d/2+.008,x=(horizontal?along:fixed)+nx*off,y=(horizontal?fixed:along)+ny*off,deg=Math.atan2(nx,ny)*180/Math.PI
 emit(kind,id,x,y,deg,r.id??'public',{wallId:wall.id,wallSide:side,wallNormalX:nx,wallNormalY:ny,wallGap:.008})
}
const room=(id:string)=>TRADERS_ROOMS.find(r=>r.id===id)!
// Arrival: real public-wall fixtures, luggage outside seat access and central flow.
for(const [i,x] of [21,37,53].entries())for(const y of [98,120])emit('suitcase','west.luggage.'+i+'.'+y,x-2.7,y+(y===98?.15:-.15),i%2?90:0,'west_entry')
mount(room('anchor_A'),'s',8,'mapboard','west.route',true)
mount(room('anchor_A'),'s',51,'clock','west.clock',true)
mount(TRADERS_BOUNDS,'w',91,'wallphone','west.phone')
mount(TRADERS_BOUNDS,'w',113,'firecabinet','west.fire')
emit('ticket','west.ticket',59.8,117.4,0,'west_entry');emit('rug','west.mat',7.0,109,90,'west_entry')
mount(room('anchor_B'),'s',10,'mapboard','east.route',true)
mount(room('anchor_B'),'s',42,'clock','east.clock',true)
mount(TRADERS_BOUNDS,'e',93,'wallphone','east.phone')
mount(TRADERS_BOUNDS,'e',112,'firecabinet','east.fire')
for(const [i,x] of [376,387,398,409].entries())emit('suitcase','east.luggage.'+i,x-2.7,119.1,180,'east_entry')
emit('rug','east.mat',421,109,90,'east_entry')
mount(room('N07'),'e',9,'mapboard','north.route',true)
mount(room('N08'),'w',10,'firecabinet','north.fire',true)
emit('rug','north.mat',214,7,0,'north_entry')
// Public bank has a service support wall and a clear central waiting/queuing area.
const bank=room('bank')
for(const [kind,t] of [['archive',5],['copyhub',13],['mailboxes',22],['notice',32],['clock',42]] as const)mount(bank,'n',t,kind,'bank.'+kind)
mount(bank,'w',10,'wallphone','bank.phone');mount(bank,'w',23,'firstaid','bank.aid')
mount(bank,'e',36,'firecabinet','bank.fire');mount(bank,'s',7,'teapoint','bank.tea')
for(const t of [7,29,43])mount(bank,'n',t,'outlet','bank.power.'+t)
// General public furnishings around the vault. The centre remains a through route.
const vault={x:151.6,y:61.6,w:124.8,h:70.8,id:'vault'}
mount(vault,'w',20,'mapboard','court.west.route',true);mount(vault,'e',36,'mapboard','court.east.route',true)
mount(vault,'w',51,'firecabinet','court.west.fire',true);mount(vault,'e',13,'firstaid','court.east.aid',true)
mount(vault,'s',18,'notice','court.notices',true)
for(let row=0;row<4;row++){
 const z=4+(131+row*22)*.6
 mount(vault,'w',z-vault.y,'camera','vault.camera.'+row,true)
}
// Rest/food area: return stations, wash guidance and sparse everyday table objects.
const food=room('food_court')
mount(food,'n',7,'teapoint','food.tea');mount(food,'n',21,'notice','food.notice');mount(food,'n',35,'clock','food.clock')
mount(food,'s',7,'trayreturn','food.return.0');mount(food,'s',25,'trayreturn','food.return.1')
mount(food,'e',18,'firstaid','food.aid');mount(food,'e',61,'firecabinet','food.fire')
for(const row of [0,3,6])for(const col of [0,3,6]){const t=tradersFoodTable(row,col);emit('tabletop','food.tabletop.'+row+'.'+col,t.x,t.y,0,food.id)}
const market=room('vacant_market');mount(market,'w',9,'mapboard','market.public.route');mount(market,'n',8,'firecabinet','market.public.fire')
for(const x of [82,117])for(const y of [82,87,92,97])seating('waiting','bank.seating.'+x+'.'+y,x,y,x===82?90:-90,'bank')
seating('waiting','court.vault.waiting',180,140,180,'central_court')
// Every occupied office gets actual work support instead of a desk floating alone.
for(const id of ['visitor_center','transport','tgpf','monitor','boardroom']){
 const r=room(id)
 mount(r,'n',6,'clock',id+'.clock');mount(r,'n',14,'archive',id+'.archive');mount(r,'n',25,'copyhub',id+'.copy')
 mount(r,'s',7,'teapoint',id+'.tea');mount(r,'s',r.w-7,'radiator',id+'.heat')
 mount(r,'w',10,'wallphone',id+'.phone');mount(r,'w',19,'firstaid',id+'.aid')
 mount(r,'e',11,'whiteboard',id+'.board');mount(r,'e',22,'firecabinet',id+'.fire')
 for(const t of [5,19,30])mount(r,'n',t,'outlet',id+'.power.'+t)
 emit('coatstand',id+'.coats',r.x+3,r.y+r.h-3,0,id)
 if(id!=='monitor')seating('lounge',id+'.lounge',r.x+r.w-8,r.y+r.h-8,0,id)
 for(const station of TRADERS_FITOUT.filter(s=>s.data?.tradersModel==='workstation'&&String(s.data?.tradersId).includes(id+'.station.')))emit('officescreen',String(station.data?.tradersId)+'.screen',station.x+station.w/2+1.9,station.y+station.h/2,90,id)
 if(id==='monitor')mount(r,'n',34,'monitors','monitor.wall')
 if(id==='tgpf')emit('securitydesk','tgpf.check',r.x+3.7,r.y+3.0,0,id)
}
// Sorting/logistics surfaces are backed onto existing walls, outside staff routes.
for(const id of ['logistics','secondary_sort']){
 const r=room(id)
 mount(r,'n',9,'mailboxes',id+'.pigeonholes');mount(r,'n',r.w-9,'packingbench',id+'.bench')
 mount(r,'e',8,'utility',id+'.utility');mount(r,'w',r.h-5,'firecabinet',id+'.fire')
 mount(r,'s',r.w-6,'janitor',id+'.cleaning');mount(r,'w',6,'notice',id+'.manifest')
 mount(r,'e',r.h-4,'clock',id+'.clock')
 for(const t of [15,28])mount(r,'n',t,'outlet',id+'.power.'+t)
}
// Sanitary rooms replace the old sink-in-space and benches used as toilet stands.
for(const id of ['west_wash','east_wash']){
 const r=room(id)
 for(let i=0;i<3;i++)mount(r,'n',7+i*3.2,'wcstall',id+'.stall.'+i)
 mount(r,'s',6,'washcounter',id+'.basins');mount(r,'s',13,'washcounter',id+'.basins.1')
 for(let i=0;i<2;i++)mount(r,'e',2.5+i*2,'urinal',id+'.urinal.'+i)
 mount(r,'s',19,'janitor',id+'.cleaning');mount(r,'w',2,'firstaid',id+'.aid')
}
// Dormitories: bedside storage and personal luggage by the existing 24 real beds.
const dorm=room('dormitory')
for(let row=0;row<3;row++)for(let col=0;col<2;col++){
 const x=dorm.x+3.5+col*13.5,y=dorm.y+7+row*17
 for(let i=0;i<2;i++)emit('bedside','dorm.bedside.'+row+'.'+col+'.'+i,x+2.4,y+.7+i*4,0,dorm.id)
 emit('suitcase','dorm.luggage.'+row+'.'+col,x+6.8,y+.6,90,dorm.id)
}
mount(dorm,'s',6,'teapoint','dorm.tea');mount(dorm,'n',15,'notice','dorm.notice');mount(dorm,'n',24,'clock','dorm.clock')
mount(dorm,'w',6,'firstaid','dorm.aid');mount(dorm,'e',22,'radiator','dorm.heat');mount(dorm,'e',54,'firecabinet','dorm.fire')
export const TRADERS_DRESSING:readonly Structure[]=props
export const TRADERS_DRESSING_SKIPPED:readonly {id:string;reason:string}[]=skipped
const byChunk=new Map<string,Structure[]>()
for(const s of props){const key=Math.floor((s.x+s.w/2)/32)+','+Math.floor((s.y+s.h/2)/32),a=byChunk.get(key)??[];a.push(s);byChunk.set(key,a)}
export function tradersDressingForChunk(cx:number,cy:number){return(byChunk.get(cx+','+cy)??[]).map(s=>({...s,data:{...s.data}}))}
