import type {Structure} from '../core/types'
import type {SettlementBlueprint,RoomStyle} from './settlementTypes'

/** Authored plan in metres. The supplied 700:460 proportions use scale .6.
 * Whole-plan data is deliberately cheap; no meshes, residents or per-metre props. */
export const TRADERS_LAYOUT_VERSION=4
export const TRADERS_CHUNK=32
export const TRADERS_BOUNDS={x:4,y:4,w:420,h:276}
export const TRADERS_MAP_SIZE={w:428,h:284}
export const TRADERS_SCALE=.6
export const tradersMetres=(n:number)=>4+n*TRADERS_SCALE
export type TradersZoneKind='hall'|'street'|'shop'|'anchor'|'bank'|'food'|'market'|'court'|'vault'|'logistics'|'office'|'guard'|'dorm'|'rail'|'dock'|'wash'
export interface TradersRect{x:number;y:number;w:number;h:number}
export interface TradersZone extends TradersRect{id:string;name:string;kind:TradersZoneKind;height:number;priority:number}
export interface TradersRoom extends TradersRect{id:string;name:string;kind:TradersZoneKind;height:number;side:'n'|'s'|'e'|'w';doorWidth:number;number?:number;access?:number;storage?:'ordinary'|'cold'|'secure'}
export interface TradersWall extends TradersRect{id:string;height:number;bottom:number;surface:'plaster'|'vault'|'wood'}
export interface TradersDoor extends TradersRect{id:string;axis:'x'|'y';room:string;height:number;access:number;label:string;face:1|-1}
const rect=(x:number,y:number,w:number,h:number):TradersRect=>({x:tradersMetres(x),y:tradersMetres(y),w:w*.6,h:h*.6})
const zones:TradersZone[]=[]
const rooms:TradersRoom[]=[]
const walls:TradersWall[]=[]
const doors:TradersDoor[]=[]
function zone(id:string,name:string,kind:TradersZoneKind,x:number,y:number,w:number,h:number,height:number,priority=1){
 const r={id,name,kind,...rect(x,y,w,h),height,priority};zones.push(r);return r
}
function room(id:string,name:string,kind:TradersZoneKind,x:number,y:number,w:number,h:number,side:TradersRoom['side'],height=4.8,doorWidth=3.6,extra:Partial<TradersRoom>={}){
 const r:TradersRoom={id,name,kind,...rect(x,y,w,h),side,height,doorWidth,...extra};rooms.push(r)
 zone(id,name,kind,x,y,w,h,height,kind==='vault'?5:3);return r
}
zone('public','公共回廊','hall',0,0,700,460,4.8,0)
zone('west_entry','西门大厅','hall',0,150,120,50,4.8)
zone('east_entry','东门大厅','hall',580,150,120,50,4.8)
zone('west_cross','西门公共通道','hall',120,170,80,16,4.8,2)
zone('east_cross','东门公共通道','hall',500,170,80,16,4.8,2)
zone('north_entry','北门大厅','hall',330,0,40,74,4.8)
zone('north_street','北步行街','street',120,54,460,20,7.2,2)
zone('south_street','南步行街','street',120,276,460,20,7.2,2)
zone('west_street','西横街','street',200,74,20,202,7.2,2)
zone('east_street','东横街','street',480,74,20,202,7.2,2)
zone('central_court','中央中庭','court',220,74,260,202,4.8,1)
zone('north_service','北后勤走廊','logistics',120,8,460,6,4.8,2)
zone('south_service','南后勤走廊','logistics',10,336,680,8,4.8,2)
zone('cargo_crossing','货运通道','logistics',300,296,100,48,4.8,2)
for(const [id,x,y] of [['A',10,14],['B',580,14],['C',10,200],['D',580,200]] as const)
 room('anchor_'+id,id==='A'?'批发市场 · 主力店 A':'主力店 '+id,'anchor',x,y,110,136,id==='A'||id==='B'?'s':'n',4.8,7.2)
for(let i=0;i<14;i++){
 const first=i<7,j=i%7,x=first?120+j*30:370+j*30
 room('N'+String(i+1).padStart(2,'0'),'N'+String(i+1).padStart(2,'0'),'shop',x,14,30,40,'s',4.8,16.6)
 const sx=i<7?120+j*(180/7):400+j*(180/7)
 room('S'+String(i+1).padStart(2,'0'),'S'+String(i+1).padStart(2,'0'),'shop',sx,296,180/7,40,'n',4.8,14.0)
}
room('bank','银行与公共服务','bank',120,74,80,96,'e',4.8,5.4)
room('food_court','美食广场','food',500,74,80,96,'w',4.8,6)
room('vacant_market','活市场 · 空摊位','market',120,202,80,74,'e',4.8,6)
room('visitor_center','迎新与路线中心','office',500,220,80,56,'w',3,4.2)
room('logistics','分拣与加工中心','logistics',290,236,120,40,'s',4.8,6)
room('rail_terminal','铁路装卸场 · 未开通','rail',10,344,190,106,'e',4.8,6)
zone('unloading','卸货与叉车区','logistics',200,344,100,106,4.8)
room('secondary_sort','二级分拣仓','logistics',300,344,100,106,'n',4.8,6)
room('dock','补给码头 · 未开通','dock',400,344,92,106,'n',4.8,6)
room('tgpf','TGPF 警备驻地','guard',500,344,70,53,'n',3,3)
room('monitor','监控与值勤室','guard',500,397,70,53,'w',3,3)
room('transport','行政与业务办公室','office',570,344,62,53,'n',3,3)
room('boardroom','会议室','office',570,397,62,53,'s',3,3)
room('dormitory','职工宿舍','dorm',640,344,50,106,'w',3,3)
room('west_wash','西侧洗手间','wash',120,186,40,16,'w',3,1.4)
room('east_wash','东侧洗手间','wash',500,204,40,16,'w',3,1.4)

const vaultRect=rect(246,96,208,118)
zone('vault','交易保险库','vault',246,96,208,118,3.2,4)
interface PhysicalCell{physical:number;x:number;y:number;w:number;h:number;side:TradersRoom['side'];storage:NonNullable<TradersRoom['storage']>}
const physical:PhysicalCell[]=[]
for(let block=0;block<4;block++)for(let side=0;side<2;side++)for(let col=0;col<16;col++){
 const p=block*32+side*16+col
 physical.push({physical:p,x:278+col*9,y:120+block*22+(side?14:0),w:9,h:8,side:side?'n':'s',storage:block===0&&side===0?'secure':col<2||col>=14?'cold':'ordinary'})
}
// Keep the legacy ordinary-cell and valuable-cell identities meaningful.
const order=[18,19,20,21,22,0,...physical.map(p=>p.physical).filter(p=>![18,19,20,21,22,0].includes(p))]
export const TRADERS_VAULT_CELLS=order.map((p,i)=>{const c=physical[p];return room('storage_'+i,'V'+String(i+1).padStart(3,'0'),'vault',c.x,c.y,c.w,c.h,c.side,3.2,2.8,{number:i+1,access:c.storage==='secure'?3:2,storage:c.storage})})
export const TRADERS_CARGO_SLOTS=TRADERS_VAULT_CELLS.filter(c=>c.storage==='ordinary').slice(0,6).map(c=>({x:c.x+c.w*.5,y:c.y+c.h*.5}))

/** Fixed, framed openings. Shared-wall entries name both rooms so neither side seals them. */
export interface TradersPassage {id:string;rooms:readonly string[];x:number;y:number;axis:'x'|'y';width:number;height:number;kind:'public'|'service'|'staff';label:string}
export const TRADERS_PASSAGES:readonly TradersPassage[]=[
 {
  "id": "bank_west",
  "rooms": [
   "bank"
  ],
  "x": 76,
  "y": 101.5,
  "axis": "y",
  "width": 3.2,
  "height": 3.2,
  "kind": "public",
  "label": "银行 · 西门大厅"
 },
 {
  "id": "bank_south",
  "rooms": [
   "bank"
  ],
  "x": 117,
  "y": 106,
  "axis": "x",
  "width": 3.6,
  "height": 3.2,
  "kind": "public",
  "label": "银行 · 公共回廊"
 },
 {
  "id": "food_east",
  "rooms": [
   "food_court"
  ],
  "x": 352,
  "y": 97,
  "axis": "y",
  "width": 4.2,
  "height": 3.2,
  "kind": "public",
  "label": "美食广场 · 东门大厅"
 },
 {
  "id": "food_south",
  "rooms": [
   "food_court"
  ],
  "x": 340,
  "y": 106,
  "axis": "x",
  "width": 3.6,
  "height": 3.2,
  "kind": "public",
  "label": "美食广场 · 迎新回廊"
 },
 {
  "id": "market_north",
  "rooms": [
   "vacant_market"
  ],
  "x": 112,
  "y": 125.2,
  "axis": "x",
  "width": 4.2,
  "height": 3.2,
  "kind": "public",
  "label": "活市场 · 西门回廊"
 },
 {
  "id": "visitor_north",
  "rooms": [
   "visitor_center"
  ],
  "x": 337,
  "y": 136,
  "axis": "x",
  "width": 3.6,
  "height": 2.8,
  "kind": "public",
  "label": "迎新中心 · 公共回廊"
 },
 {
  "id": "sorting_north",
  "rooms": [
   "logistics"
  ],
  "x": 227,
  "y": 145.6,
  "axis": "x",
  "width": 4.8,
  "height": 3.2,
  "kind": "service",
  "label": "分拣中心 · 保险库交接广场"
 },
 {
  "id": "secondary_west",
  "rooms": [
   "secondary_sort"
  ],
  "x": 184,
  "y": 242.2,
  "axis": "y",
  "width": 4.8,
  "height": 3.2,
  "kind": "service",
  "label": "二级分拣 · 装卸区"
 },
 {
  "id": "guard_monitor",
  "rooms": [
   "tgpf",
   "monitor"
  ],
  "x": 335.5,
  "y": 242.2,
  "axis": "x",
  "width": 2.4,
  "height": 2.8,
  "kind": "staff",
  "label": "警备 · 值勤室"
 },
 {
  "id": "office_meeting",
  "rooms": [
   "transport",
   "boardroom"
  ],
  "x": 365,
  "y": 242.2,
  "axis": "x",
  "width": 3,
  "height": 2.8,
  "kind": "staff",
  "label": "业务办公室 · 会议室"
 },
 {
  "id": "dorm_north",
  "rooms": [
   "dormitory"
  ],
  "x": 402,
  "y": 210.4,
  "axis": "x",
  "width": 2.4,
  "height": 2.8,
  "kind": "staff",
  "label": "宿舍 · 后勤回廊"
 }
]
/** Keep an independent four-metre public route between each entry hall and the inner street. */
export const TRADERS_THROUGH_ROUTES:readonly TradersRect[]=[{x:72,y:107,w:56,h:4},{x:300,y:107,w:56,h:4}]
export function tradersPassageApron(p:TradersPassage,depth=3.2,padding=.35):TradersRect {
 const half=p.width/2+padding
 return p.axis==='x'?{x:p.x-half,y:p.y-depth,w:half*2,h:depth*2}:{x:p.x-depth,y:p.y-half,w:depth*2,h:half*2}
}
export function tradersCirculationReserved(r:TradersRect){
 return TRADERS_THROUGH_ROUTES.some(a=>tradersIntersects(r,a))||TRADERS_PASSAGES.some(p=>tradersIntersects(r,tradersPassageApron(p)))
}

const wallKeys=new Set<string>()
function wall(x:number,y:number,w:number,h:number,height:number,bottom=0,surface:TradersWall['surface']='plaster'){
 if(w<=.001||h<=.001||height<=.001)return
 const key=[x,y,w,h,height,bottom,surface].map(v=>typeof v==='number'?v.toFixed(4):v).join(':')
 if(wallKeys.has(key))return;wallKeys.add(key)
 walls.push({id:'wall_'+walls.length,x,y,w,h,height,bottom,surface})
}
const thickness=.18
function edge(axis:'x'|'y',fixed:number,start:number,length:number,height:number,gapAt?:number,gapWidth=0,doorHeight=3,material:TradersWall['surface']='plaster'){
 const add=(a:number,n:number,h=height,z=0)=>axis==='x'?wall(a,fixed-thickness/2,n,thickness,h,z,material):wall(fixed-thickness/2,a,thickness,n,h,z,material)
 if(gapAt===undefined){add(start,length);return}
 const lo=Math.max(start,gapAt-gapWidth/2),hi=Math.min(start+length,gapAt+gapWidth/2)
 add(start,lo-start);add(hi,start+length-hi)
 if(height>doorHeight)add(lo,hi-lo,height-doorHeight,doorHeight)
}
/** Multiple openings are cut from the same wall data used by physics, maps and baking. */
function roomEdge(r:TradersRoom,axis:'x'|'y',fixed:number,start:number,length:number,gapAt:number|undefined,dh:number,surface:TradersWall['surface']){
 const holes=TRADERS_PASSAGES.filter(p=>p.rooms.includes(r.id)&&p.axis===axis&&Math.abs((axis==='x'?p.y:p.x)-fixed)<.001).map(p=>({center:axis==='x'?p.x:p.y,width:p.width,height:Math.min(p.height,r.height-.2)}))
 if(gapAt!==undefined)holes.push({center:gapAt,width:r.doorWidth,height:dh})
 holes.sort((a,b)=>a.center-b.center)
 let cursor=start
 for(const hole of holes){
  const lo=Math.max(start,hole.center-hole.width/2),hi=Math.min(start+length,hole.center+hole.width/2)
  edge(axis,fixed,cursor,Math.max(0,lo-cursor),r.height,undefined,0,dh,surface)
  edge(axis,fixed,lo,hi-lo,r.height,(lo+hi)/2,hi-lo,hole.height,surface)
  cursor=Math.max(cursor,hi)
 }
 edge(axis,fixed,cursor,Math.max(0,start+length-cursor),r.height,undefined,0,dh,surface)
}
for(const r of rooms){
 const cy=r.y+r.h/2,cx=r.x+r.w/2,dh=r.kind==='vault'?2.7:Math.min(3.2,r.height-.2),surface=r.kind==='vault'?'vault' as const:'plaster' as const
 roomEdge(r,'x',r.y,r.x,r.w,r.side==='n'?cx:undefined,dh,surface)
 roomEdge(r,'x',r.y+r.h,r.x,r.w,r.side==='s'?cx:undefined,dh,surface)
 roomEdge(r,'y',r.x,r.y,r.h,r.side==='w'?cy:undefined,dh,surface)
 roomEdge(r,'y',r.x+r.w,r.y,r.h,r.side==='e'?cy:undefined,dh,surface)
 if(r.kind==='vault'){
  const axis=r.side==='n'||r.side==='s'?'x':'y'
  doors.push({id:'door_'+r.id,room:r.id,label:r.name,axis,x:cx-r.doorWidth/2,y:(r.side==='n'?r.y:r.y+r.h)-.09,w:r.doorWidth,h:.18,height:dh,access:r.access??2,face:r.side==='n'?-1:1})
 }
}
const vb=vaultRect
edge('x',vb.y,vb.x,vb.w,3.2,undefined,0,3,'vault')
edge('y',vb.x,vb.y,vb.h,3.2,undefined,0,3,'vault')
edge('y',vb.x+vb.w,vb.y,vb.h,3.2,undefined,0,3,'vault')
const va=tradersMetres(343),vc=tradersMetres(357),vw=2.8
for(const [lo,hi] of [[vb.x,va-vw/2],[va+vw/2,vc-vw/2],[vc+vw/2,vb.x+vb.w]])edge('x',vb.y+vb.h,lo,hi-lo,3.2,undefined,0,3,'vault')
wall(va-vw/2,vb.y+vb.h-.09,vw,.18,.4,2.8,'vault')
wall(vc-vw/2,vb.y+vb.h-.09,vw,.18,.4,2.8,'vault')
export const TRADERS_ENTRY_WIDTH=4.8
export const TRADERS_ENTRY_HEIGHT=3.3
const bb=TRADERS_BOUNDS,westY=tradersMetres(175),northX=tradersMetres(350)
edge('x',bb.y,bb.x,bb.w,4.8,northX,TRADERS_ENTRY_WIDTH,TRADERS_ENTRY_HEIGHT)
edge('x',bb.y+bb.h,bb.x,bb.w,4.8)
edge('y',bb.x,bb.y,bb.h,4.8,westY,TRADERS_ENTRY_WIDTH,TRADERS_ENTRY_HEIGHT)
edge('y',bb.x+bb.w,bb.y,bb.h,4.8,westY,TRADERS_ENTRY_WIDTH,TRADERS_ENTRY_HEIGHT)

export const TRADERS_ZONES:readonly TradersZone[]=zones
export const TRADERS_ROOMS:readonly TradersRoom[]=rooms
export const TRADERS_WALLS:readonly TradersWall[]=walls
export const TRADERS_DOORS:readonly TradersDoor[]=doors
export const TRADERS_VAULT_BOUNDS=vaultRect
export const TRADERS_SPAWN={x:bb.x+5,y:westY}
export interface TradersEntry{id:'west'|'north'|'east';name:string;sign:string;x:number;y:number;face:number}
export const TRADERS_ENTRIES:readonly TradersEntry[]=[{id:'west',name:'西门 · 返回 Level 1',sign:'西门 / WEST GATE',x:bb.x+1,y:westY,face:-Math.PI/2},{id:'north',name:'北门 · 返回 Level 1',sign:'北门 / NORTH GATE',x:northX,y:bb.y+1,face:Math.PI},{id:'east',name:'东门 · 返回 Level 1',sign:'东门 / EAST GATE',x:bb.x+bb.w-1,y:westY,face:Math.PI/2}]
export const TRADERS_SHOP_GLAZING:readonly Structure[]=rooms.filter(r=>r.kind==='shop'||r.kind==='anchor').flatMap(r=>{
 const horizontal=r.side==='n'||r.side==='s',cx=r.x+r.w/2,cy=r.y+r.h/2,fx=horizontal?cx:r.side==='w'?r.x:r.x+r.w,fy=horizontal?r.side==='n'?r.y:r.y+r.h:cy,gap=3.6,width=(r.doorWidth-gap)/2
 return [-1,1].map(side=>{const offset=side*(gap/2+width/2),x=fx+(horizontal?offset:0),y=fy+(horizontal?0:offset);return{kind:'trade_glass' as const,x:x-(horizontal?width:.07)/2,y:y-(horizontal?.07:width)/2,w:horizontal?width:.07,h:horizontal?.07:width,solid:true,data:{tradersId:r.id+'.glass.'+side,tradersWindow:1,tradersArchitectural:1,noSight:1,height:3.12}}})
})
export function tradersShopFrontStructures(){return TRADERS_SHOP_GLAZING.map(s=>({...s,data:{...s.data}}))}
export const tradersContains=(r:TradersRect,x:number,y:number)=>x>=r.x&&y>=r.y&&x<r.x+r.w&&y<r.y+r.h
export const tradersIntersects=(a:TradersRect,b:TradersRect)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y
export function tradersZoneAt(x:number,y:number):TradersZone|undefined{
 let best:TradersZone|undefined
 for(const r of zones)if((!best||r.priority>=best.priority)&&tradersContains(r,x,y))best=r
 return best
}
export function tradersCeilingAt(x:number,y:number){
 const z=tradersZoneAt(x,y)
 if(!z)return 4.8
 if(z.kind!=='street')return z.height
 const horizontal=z.w>z.h,t=horizontal?(y-z.y)/z.h:(x-z.x)/z.w
 return 4.8+2.4*Math.sqrt(Math.max(0,1-(t*2-1)**2))
}
export function tradersRoomAt(x:number,y:number){return rooms.find(r=>tradersContains(r,x,y))}
export function tradersWallStructures():Structure[]{
 return walls.map(w=>({kind:'trade_wall',x:w.x,y:w.y,w:w.w,h:w.h,solid:true,data:{tradersId:w.id,z:w.bottom,bottom:w.bottom,height:w.height,tradersWall:1,surface:w.surface}}))
}
export function tradersDoorStructures():Structure[]{
 return doors.map(d=>({kind:'rollerdoor',x:d.x,y:d.y,w:d.w,h:d.h,solid:true,data:{tradersId:d.id,tradeDoor:1,tradersDoor:1,axis:d.axis,face:d.face,height:d.height,careerDoor:1,access:d.access,faction:'bntg',room:d.room,open:0}}))
}

export interface TradersService{ id:string;zone:string;x:number;y:number;services:string[];npc?:string;kind:'trade_counter'|'trade_terminal'|'trade_scale'|'trade_seal'|'trade_pack';label:string }
const point=(x:number,y:number)=>({x:tradersMetres(x),y:tradersMetres(y)})
export const TRADERS_SERVICES:readonly TradersService[]=[
 {id:'market',zone:'market',...point(155,105),services:['market','seal'],kind:'trade_counter',npc:'tang',label:'市场咨询'},
 {id:'employment',zone:'market',...point(155,116),services:['career','contract','report'],kind:'trade_terminal',label:'雇佣与业务登记'},
 {id:'vault_entry',zone:'vault_entry',...point(335,225),services:['inventory','evidence','seal'],kind:'trade_terminal',label:'保险库登记'},
 {id:'warehouse',zone:'bank',...point(155,138),services:['warehouse','inventory'],kind:'trade_counter',label:'银行咨询与账户服务'},
 {id:'dispatch',zone:'transport',...point(600,365),services:['dispatch','contract','report','evidence'],kind:'trade_terminal',label:'业务与调度'},
 {id:'receiving',zone:'logistics',...point(315,252),services:['cargo','inspect'],kind:'trade_scale',label:'货物核验'},
 {id:'seal',zone:'logistics',...point(350,252),services:['seal','inventory'],kind:'trade_seal',label:'封签核验'},
 {id:'packing',zone:'logistics',...point(385,252),services:['cargo','repair'],kind:'trade_pack',label:'打包与交接'}
]
export const TRADERS_FIXED_PEOPLE=[
 {id:'laozhangfang',x:205,y:137.99,facing:Math.PI/2},{id:'kui',...point(348,217),facing:Math.PI/2},
 {id:'shen',x:106,y:72.0,facing:Math.PI/2},{id:'tang',x:97,y:65.95,facing:Math.PI/2},
 {id:'lan',x:62,y:114.25,facing:Math.PI/2},{id:'candyman',x:193,y:15.55,facing:Math.PI/2} // 北排 N07 糖佬糖果铺柜台后（原在活市场旁）
]
export function tradersServiceStructures():Structure[]{
 const a:Structure[]=TRADERS_SERVICES.map(s=>({kind:s.kind,x:s.x-1.2,y:s.y-.5,w:2.4,h:1,solid:true,data:{tradersId:'service_'+s.id,tradersModel:'servicebay',facility:true,faction:'bntg',room:s.zone,label:s.label,services:[...s.services],service:s.services[0],npc:s.npc??'',height:1.1}}))
 for(let i=0;i<3;i++)a.push({kind:'trade_anomaly',x:tradersMetres(325+i*8),y:tradersMetres(265),w:1,h:.8,solid:true,data:{tradersId:'manifest_'+i,height:.9,label:'TH-001-'+['A','B','C'][i]+' / S-014',manifest:'TH-001',quantity:1,seal:'S-014',fixedCargo:true}})
 for(let i=0;i<3;i++)a.push({kind:'trade_anomaly',...TRADERS_CARGO_SLOTS[i],w:1,h:.8,solid:false,data:{tradersId:'cargo_'+i,height:.9,cargoId:i,label:'TV-00'+(i+1)+' / S-014',faction:'bntg',hidden:1}})
 return a
}
const style=(z:TradersZone):RoomStyle=>z.kind==='vault'?'vault':z.kind==='office'?'office':z.kind==='dorm'?'bedroom':z.kind==='food'?'dining':z.kind==='logistics'||z.kind==='rail'||z.kind==='dock'?'workshop':z.kind==='wash'?'wash':'market'
export const TRADERS_BLUEPRINT:SettlementBlueprint={
 id:'bntg',level:102,size:TRADERS_MAP_SIZE.w,faction:'bntg',name:'商人之家',
 rooms:zones.filter(z=>z.priority>0).map(z=>({...z,style:style(z),door:'s',enclosed:rooms.some(r=>r.id===z.id),furniture:[]})),
 shells:[{...TRADERS_BOUNDS,height:4.8,roof:'industrial'}],partitions:[],doors:[],
 services:TRADERS_SERVICES.map(s=>({...s,label:s.label})),
 corridors:[],decorations:[],
 exits:TRADERS_ENTRIES.map(e=>({x:e.x-.5,y:e.y-.5})),spawn:TRADERS_SPAWN,
 circulation:zones.filter(z=>z.priority>0&&['street','hall','court'].includes(z.kind)),focus:{...point(225,175),targets:['central_court','vault','bank']},
 staff:TRADERS_FIXED_PEOPLE
}
