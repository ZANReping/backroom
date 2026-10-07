import type { Structure, LightSource, StructKind } from '../core/types'
import { ALPHA_DEFS, type AlphaKind } from './alphaDecor'
import { alphaDoorway, alphaWindowOpenings, blocksAlphaDoor, type AlphaDoorway } from './alphaPlacement'
import { room, type Rect, type RoomSpec, type SettlementBlueprint } from './settlementTypes'
import { alphaCommunityLayout } from './alphaCommunityLayout'
import { ALPHA_COMMUNITY_STAFF } from './alphaPeople'

/** Trace of the supplied plan, north at -Y. Pixel proportions retained at ~0.25 m/px. */
export const ALPHA_DISTRICTS = [
 {id:'exploration',name:'探险署',x:10,y:10,w:44,h:58,color:'#b980a0'},
 {id:'administration',name:'行政署',x:67,y:4,w:34,h:28,color:'#00ae37'},
 {id:'administration_annex',name:'',x:103,y:4,w:19,h:6,color:'#00ae37'},
 {id:'archives',name:'档案署',x:56,y:19,w:9,h:36,color:'#ffc800'},
 {id:'archives_annex',name:'',x:65,y:34,w:7,h:21,color:'#ffc800'},
 {id:'research',name:'研究署',x:74,y:34,w:44,h:21,color:'#ff7855'},
 {id:'anemoia',name:'居民片区「爱念陌异区」',x:103,y:10,w:37,h:22,color:'#729fca'},
 {id:'anemoia_annex',name:'',x:120,y:32,w:20,h:23,color:'#729fca'},
 {id:'crimson',name:'居民片区「腥红区」',x:56,y:57,w:48,h:24,color:'#729fca'},
 {id:'epiphany',name:'居民片区「先驱区」',x:31,y:82,w:49,h:19,color:'#729fca'},
 {id:'epiphany_annex',name:'',x:31,y:70,w:23,h:12,color:'#729fca'},
 {id:'river',name:'居民片区「利沃区」',x:106,y:57,w:24,h:44,color:'#729fca'},
 {id:'zephyr',name:'居民片区「西风区」',x:82,y:83,w:22,h:42,color:'#729fca'},
] as const
export const ALPHA_ENTRIES = [
 {id:'entry_n',name:'北部入口 · 登记前厅',x:54,y:4,w:13,h:14,side:'s',exit:{x:60,y:4},mount:{x:60.5,y:4.26,deg:0}},
 {id:'entry_e',name:'东部入口 · 物资检查',x:130,y:59,w:10,h:12,side:'w',exit:{x:139,y:64},mount:{x:139.74,y:64.5,deg:270}},
 {id:'entry_w',name:'西部入口 · 居民接待',x:20,y:80,w:11,h:10,side:'e',exit:{x:20,y:85},mount:{x:20.26,y:85.5,deg:90}},
] as const
const decorations:Structure[]=[],lights:LightSource[]=[],doorways:AlphaDoorway[]=[]
const residentialSkins=new Map<string,string>()
const b:SettlementBlueprint={id:'alpha',level:101,size:152,faction:'meg',name:'M.E.G. Alpha 基地',
 staff:ALPHA_COMMUNITY_STAFF.map(p=>({...p})),
 rooms:[],shells:ALPHA_DISTRICTS.map(r=>({...r,height:2.9,roof:'domestic'})),partitions:[],doors:[],services:[],decorations,
 corridors:[{x:54,y:4,w:13,h:15},{x:54,y:19,w:2,h:65},{x:65,y:19,w:2,h:15},{x:54,y:32,w:66,h:2},{x:72,y:34,w:2,h:23},{x:54,y:55,w:79,h:2},{x:104,y:57,w:2,h:54},{x:30,y:81,w:100,h:2},{x:28,y:68,w:28,h:2},{x:28,y:68,w:3,h:58},{x:130,y:55,w:3,h:71},{x:80,y:83,w:2,h:18},{x:28,y:101,w:104,h:25}],
 exits:ALPHA_ENTRIES.map(r=>({...r.exit})),spawn:{x:60.5,y:13},circulation:[],focus:{x:55,y:39,targets:['radio','meeting','equipment','reception']}}
b.corridors.push({x:118,y:32,w:2,h:23},...ALPHA_ENTRIES.map(({x,y,w,h})=>({x,y,w,h})))
b.corridors.push({x:77,y:4,w:2,h:30},{x:67,y:16,w:12,h:2},{x:101,y:4,w:2,h:30},{x:108,y:4,w:2,h:6})
b.circulation=[...b.corridors,{x:20,y:24,w:4,h:44},{x:24,y:24,w:30,h:4},{x:24,y:38,w:30,h:4},{x:40,y:28,w:2,h:30},{x:24,y:58,w:30,h:2}]
const put=(kind:AlphaKind,x:number,y:number,w?:number,d?:number,data:Structure['data']={})=>{const a=ALPHA_DEFS.find(p=>p.id===kind)!;const s:Structure={kind,x,y,w:w??a.w,h:d??a.d,solid:a.solid,data:{height:a.height,...data}};decorations.push(s);return s}
const old=(kind:StructKind,x:number,y:number,w=1,h=1,solid=true,data?:Structure['data'])=>decorations.push({kind,x,y,w,h,solid,data})
const facing=(kind:AlphaKind,cx:number,cy:number,w:number,d:number,deg=0,data:Structure['data']={})=>put(kind,cx-w/2,cy-d/2,w,d,{...data,deg})
const inside=(r:Rect,x:number,y:number)=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h
function zone(id:string,name:string,x:number,y:number,w:number,h:number,style:RoomSpec['style'],height=2.9,enclosed=false){
 const r=room(id,name,x,y,w,h,style,'s',{height,enclosed,furniture:[]});b.rooms.push(r);b.shells.push({x,y,w,h,height,roof:'domestic'});return r
}
function wall(x:number,y:number,w:number,h:number,height=2.9,skin='',color='#e8dfc2',z=0){put('alpha_wall',x,y,w,h,{height,skin,color,z})}
function enclosed(id:string,name:string,x:number,y:number,w:number,h:number,style:RoomSpec['style'],side:RoomSpec['door']='s',skin='',height=2.9,extraDoors:RoomSpec['door'][]=[]){
 const r=zone(id,name,x,y,w,h,style,height,true);r.door=side
 const sides=[side,...(id==='radio'?['n'] as const:extraDoors)]
 for(const edge of sides)doorways.push(alphaDoorway(r,edge))
 for(const edge of ['n','s','w','e'] as const){
  const horizontal=edge==='n'||edge==='s',len=horizontal?w:h,xx=edge==='e'?x+w-.18:x,yy=edge==='s'?y+h-.18:y,gap=skin.startsWith('res_')?1.92:1.8,half=id==='radio'&&edge==='n'?len-2.5:(len-gap)/2
  const segment=(offset:number,length:number,z=0,H=height)=>wall(xx+(horizontal?offset:0),yy+(horizontal?0:offset),horizontal?length:.18,horizontal?.18:length,H,skin,skin==='transit'?'#dddccb':skin==='admin_lobby'?'#c7bda4':skin==='executive'?'#d7ceb3':skin==='lecture'?'#e0dfae':skin.startsWith('archive')?'#d8d8c9':skin==='classroom'?'#b6a18b':skin==='office'?'#b6c0a9':skin==='lab'?'#d1d4c4':'#e8dfc2',z)
  if((style==='classroom'||id.startsWith('research_office'))&&edge==='e'){
   let end=0
   for(const aperture of alphaWindowOpenings(r)){
    segment(end,aperture.offset-end);segment(aperture.offset,aperture.width,0,aperture.bottom)
    segment(aperture.offset,aperture.width,aperture.bottom+aperture.height,height-aperture.bottom-aperture.height)
    end=aperture.offset+aperture.width
   }
   segment(end,len-end)
  }else if(sides.includes(edge)){segment(0,half);segment(half+gap,len-half-gap);segment(half,gap,skin.startsWith('res_')?2.36:2.3,height-(skin.startsWith('res_')?2.36:2.3))}else segment(0,len)
 }
 const doorway=alphaDoorway(r),deg={n:180,s:0,e:90,w:270}[side]
 const normal={n:[0,-1],s:[0,1],e:[1,0],w:[-1,0]}[side]
 facing('alpha_sign',doorway.cx+normal[0]*.13,doorway.cy+normal[1]*.13,1.5,.04,deg,{z:2.34,label:name,color:'#dad5b6'})
 return r
}
function service(id:string,zoneId:string,x:number,y:number,services:string,npc?:string,access=0){
 const r=b.rooms.find(r=>r.id===zoneId)!;r.service??=services.split('/')[0];r.npc??=npc
 b.services.push({id,zone:zoneId,x,y,label:r.name,services:services.split('/'),npc,access})
 // Bound to an actual desk/cabinet after furniture placement, never a floating service marker.
}
function lamp(x:number,y:number,height:number,warm=false){
 const residential=[...b.rooms].reverse().find(r=>inside(r,x,y)&&residentialSkins.has(r.id)),finish=residential?residentialSkins.get(residential.id):''
 put('alpha_light',x-(warm?.21:.625),y-(warm?.21:.15),warm?.42:1.25,warm?.42:.3,{z:height-.1,skin:warm?'warm':finish==='res_zephyr'||finish==='library'?'louvered':''})
 const classroom=b.rooms.some(r=>r.style==='classroom'&&inside(r,x,y))
 const research=inside(ALPHA_DISTRICTS.find(r=>r.id==='research')!,x,y),office=b.rooms.some(r=>r.id.startsWith('research_office')&&inside(r,x,y))
 const archiveRoom=b.rooms.find(r=>['paper_archive','query','archives_office_b','servers','restricted'].includes(r.id)&&inside(r,x,y)),paper=archiveRoom?.style==='archive'
 lights.push({x,y,r:warm?4.2:finish==='mushroom'?4.8:residential?4.8:paper?3.2:archiveRoom?4.2:office?3.6:research?4.8:5.8,color:warm?'#ffdc9b':finish==='res_zephyr'?'#d9e8f1':finish==='mushroom'?'#e5e4c3':archiveRoom?'#e5ece5':office?'#dfeacf':classroom?'#edf1f5':'#fff4d9',intensityMul:warm?.6:finish==='mushroom'?.35:residential?.48:paper?.24:archiveRoom?.34:office?.32:research?.42:classroom?.55:.75,fixZ:height-.17,flickerSeed:x+y,keep:1,noFix:1})
}

// The exploration wing has a corridor loop around its central operating rooms.
zone('exploration_hall','探险署 · 值班走廊',10,10,44,58,'intake')
enclosed('equipment','探险署 · 贮存室 A',11,11,19,13,'store')
enclosed('equipment_b','探险署 · 贮存室 B',32,11,21,13,'store')
enclosed('radio','探险署 · 中控室',24,28,9,8,'radio','s')
enclosed('meeting','探险署 · 会议室',26,44,12,12,'classroom','s','classroom',3)
enclosed('field_training','探险署 · 训练与简报室',42,28,11,10,'classroom','s','classroom',3)
enclosed('meeting_b','探险署 · 行动规划室',42,42,11,16,'classroom','n','classroom',3)
for(let i=0;i<4;i++){
 const r=enclosed('duty_dorm_'+i,'探险署 · 值班宿舍 '+String(i+1).padStart(2,'0'),14,28+i*10,6,8,'bedroom','e','wood',2.65)
 r.housing='double'
 put('alpha_bunk',14.4,r.y+.5);put('alpha_bed',17.8,r.y+6.3,2.1,1,{deg:90})
 // Cream partition pier, as in the photograph, standing between the two sleeping bays.
 wall(17.4,r.y+1.8,.78,1.2,2.65,'','#ebe4cf')
  put('alpha_bedside',18.35,r.y+5.2);put('alpha_bags',17.9,r.y+5.4);put('alpha_chair',14.6,r.y+6.5,.5,.54,{deg:25})
  put('alpha_bags',18.45,r.y+6.2,.65,.6,{z:.6,height:.18})
 lamp(r.x+2,r.y+2.5,2.65,true)
}
enclosed('duty_dining','探险署 · 生活区食堂与休息室',24,60,14,7,'dining','n')
enclosed('duty_clinic','探险署 · 医疗值班室',40,60,13,7,'clinic','n')
old('table',26,63,3,1);old('bench',26,65,3,1);old('sink',34,61,1,1);put('alpha_bed',41,62);put('alpha_bed',41,64.7);old('medcabinet',50,61)

// Radio room: freestanding bank of vintage racks, warm cream walls and surface wiring.
put('alpha_radio',24.5,29,4.8,1.15)
put('alpha_desk',31,33.6,1.6,.7)
for(const x of [25.6,27.4])put('alpha_swivel',x,30.7,.6,.65,{deg:0})
put('alpha_desk',24.5,34.3,2.5,.7);put('alpha_swivel',25.2,33.3)
put('alpha_map',29.6,28.2,.75,.06,{z:1.05})
put('alpha_clock',29.7,28.2,.34,.045,{z:2.02})
put('alpha_conduit',24.25,28.22,6,.05,{z:2.46});put('alpha_conduit',30.2,28.24,.05,.05,{z:.1,height:2.35})
for(const x of [26,30])for(const y of [31.5,34.5])lamp(x,y,2.9)
service('radio','radio',25.7,34.5,'radio/dispatch/report','nightingale')

function classroom(rid:string){
 const r=b.rooms.find(r=>r.id===rid)!,mid=r.x+r.w/2
 // The north-entry planning room faces south so its board never covers the entrance.
 const front=(kind:AlphaKind,x:number,y:number,w:number,d:number,data:Structure['data']={})=>r.door==='n'
  ?put(kind,2*mid-x-w,2*r.y+r.h-y-d,w,d,{...data,deg:180,room:rid})
  :put(kind,x,y,w,d,{...data,room:rid})
 front('alpha_board',mid-3,r.y+.22,6,.15)
 front('alpha_projector',mid-.2,r.y+4.5,.4,.35,{z:r.height-.52})
 front('alpha_clock',r.x+r.w-.65,r.y+.22,.32,.045,{z:2.2})
 for(let row=0;row<(r.h>=12?4:3);row++)for(const side of [-1,1]){
  const x=mid+(side<0?-5.2:.9),y=r.y+3.2+row*1.8
  front('alpha_desk',x,y,3.8,.7)
  for(const dx of [.55,2.45])front('alpha_chair',x+dx,y+1,.5,.54)
 }
 for(const a of alphaWindowOpenings(r))facing('alpha_blinds',r.x+r.w-.09,r.y+a.offset+a.width/2,a.width,.18,270,{z:a.bottom,height:a.height,skin:'open',room:rid})
 for(let y=r.y+2;y<r.y+r.h-1;y+=3.5)for(const x of [r.x+3,r.x+r.w-3])lamp(x,y,r.height)
}
classroom('meeting');classroom('meeting_b');classroom('field_training')
service('field_training','field_training',48,35.8,'training/field_training/inspect/repair')
for(const id of ['equipment','equipment_b']){
 const r=b.rooms.find(r=>r.id===id)!
 for(const y of [r.y+.5,r.y+4.2,r.y+7.9])for(let x=r.x+.5;x<r.x+r.w-3;x+=3.2)put('alpha_rack',x,y,3,.65)
 for(let i=0;i<4;i++)put('alpha_bins',r.x+r.w-2.2,r.y+1+i*1.3,.65,.48,{skin:i===3?'gray':''})
 for(const y of [r.y+2.7,r.y+6.3,r.y+10.6])for(const x of [r.x+5,r.x+r.w-4])lamp(x,y,2.9)
}
put('alpha_desk',22.8,21,2.4,.7)
service('equipment','equipment',24,21.6,'equipment/warehouse/inventory/cargo','brandt')
service('duty_dining','duty_dining',34.5,63,'meal/community')
service('duty_clinic','duty_clinic',48,64,'care/rescue')

// Administration extends north beside the arrival lobby. The transverse public route stays clear.
enclosed('reception','行政署 · 行政部门与接待',67,18,10,14,'intake','w','admin_lobby',3.8,['e'])
put('alpha_reception_counter',69.1,19.1,4.8,2,{room:'reception'})
put('alpha_swivel',71,18.6,.6,.65,{room:'reception',deg:180})
for(const x of [68.4,72.6])put('alpha_waiting_seats',x,27.2,3.2,1.15,{room:'reception'})
put('alpha_waiting_seats',69.9,30.2,3.2,1.15,{room:'reception',deg:180})
put('alpha_queue_rail',69.5,22.15,3.8,.20,{room:'reception'})
put('alpha_planter',68,19.3,.5,.5,{room:'reception'});put('alpha_planter',75.75,19.3,.5,.5,{room:'reception'})
put('alpha_map',70.9,18.23,2.4,.06,{z:1.6,room:'reception'})
facing('alpha_notice',76.74,21.9,1.8,.075,270,{z:1.22,room:'reception'})
facing('alpha_safety',67.28,28.5,.9,.18,90,{z:1.1,room:'reception'})
put('alpha_admin_cove',68.3,20,7.4,9.8,{z:3.75,room:'reception'})
for(const x of [67.23,76.57])for(const y of [22.7,26.25])wall(x,y,.2,1,3.35,'admin_veneer','#615544')
for(const x of [68,75.85])for(const y of [19.8,23,27,30.5]){
 put('alpha_light',x-.12,y-.12,.24,.24,{z:3.70,skin:'downlight',room:'reception'})
 lights.push({x,y,r:3.6,color:'#fff0c9',intensityMul:.31,fixZ:3.6,keep:1,noFix:1,flickerSeed:x+y})
}
for(const y of [22,27.8])lights.push({x:72,y,r:6,color:'#fff3d4',intensityMul:.45,fixZ:3.5,keep:1,noFix:1,flickerSeed:y})
service('reception','reception',71.5,21,'career/report/lost/cargo','justin')

enclosed('overseer','行政署 · 监督者驻办',67,4,10,12,'office','s','executive',3.2)
put('alpha_executive_desk',70.4,7,3.2,1.1,{room:'overseer'})
put('alpha_executive_chair',71.6,5.8,.76,.78,{deg:180,room:'overseer'})
for(const x of [67.5,73.6])put('alpha_executive_bookcase',x,4.27,2.9,.44,{room:'overseer'})
for(const x of [70.4,73])put('alpha_chair',x,8.9,.5,.54,{room:'overseer'})
put('alpha_admin_rug',68.2,10,7.6,4.25,{room:'overseer'})
facing('alpha_executive_sofa',68.9,12,2.5,.9,90,{room:'overseer'})
facing('alpha_executive_sofa',75.1,12,2.5,.9,270,{room:'overseer'})
put('alpha_desk',70.9,11.4,2.2,.85,{room:'overseer',skin:'executive',height:.455})
put('alpha_bedside',68.65,13.7,.5,.45,{room:'overseer'});put('alpha_planter',75.8,8.5,.5,.5,{room:'overseer'})
put('alpha_map',70.9,4.23,2.2,.06,{z:1.5,room:'overseer'})
put('alpha_clock',73.35,4.23,.34,.045,{z:2.27,room:'overseer'})
for(const y of [6.1,10.3,13.8])lamp(72,y,3.2)
lights.push({x:69,y:13.8,r:3,color:'#ffe0ab',intensityMul:.24,fixZ:1.1,keep:1,noFix:1,flickerSeed:1})
service('overseer','overseer',72,7.8,'report','kat',3)

// 616 m², larger than every other functional room. Two doors, side aisles and a centre aisle.
enclosed('assembly','行政署 · 大会厅 A',79,4,22,28,'auditorium','w','lecture',5.2,['s'])
put('alpha_hall_screen',86.6,4.3,6.8,.18,{room:'assembly'})
put('alpha_projector',89.8,11.2,.4,.35,{z:4.68,room:'assembly',deg:180})
put('alpha_hall_podium',85.1,8.3,1.2,.72,{room:'assembly'})
put('alpha_desk',87.2,7.8,3,.85,{room:'assembly'});put('alpha_chair',90.8,8.2,.5,.54,{deg:20,room:'assembly'})
old('sink',96.9,4.7,1,1);put('alpha_lockers',98.35,4.4,1.5,.48,{room:'assembly'})
put('alpha_clock',94.8,4.23,.4,.045,{z:2.8,room:'assembly'})
for(const x of [80,96.5])put('alpha_notice',x,4.25,3.1,.075,{z:1.2,room:'assembly',skin:'whiteboard'})
for(const x of [79.25,100.75])for(const y of [7.8,10.5])facing('alpha_notice',x,y,2.4,.075,x<90?90:270,{z:1.3,room:'assembly',skin:'whiteboard'})
wall(79.22,4.23,21.56,.48,.55,'','#d2d0aa',4.4)
for(let row=0;row<8;row++){
 const y=14+row*1.8,z=(row+1)*.12
 put('alpha_hall_tier',81,y,18,1.8,{height:z,room:'assembly'})
 for(const base of [81.7,91.1])for(let col=0;col<8;col++)put('alpha_hall_seat',base+col*.83,y+.55,.72,.85,{z,room:'assembly'})
}
// Return stair at the rear door: gradual descent rather than a one-metre drop.
for(let i=0;i<7;i++)put('alpha_hall_tier',88.9,28.4+i*.25,2.2,.25,{height:(7-i)*.12,room:'assembly'})
for(const x of [81.3,91.1])put('alpha_queue_rail',x,13.1,7.6,.2,{room:'assembly'})
for(const x of [83.5,90,96.5])for(const y of [7,12,18,24,29.8])lamp(x,y,5.2)
facing('alpha_sign',89.95,31.62,1.5,.04,180,{z:2.35,label:'出口 / EXIT',color:'#8aae8f',room:'assembly'})

// Public dispatch is separated from staff-only storage. Piles never occupy the central route.
enclosed('trade_public','行政署 · 贸易中转与失物招领',103,4,5,6,'intake','w','transit',3.2,['e'])
put('alpha_dispatch_desk',104.4,4.5,2.2,.85,{room:'trade_public'})
put('alpha_swivel',106.6,5.2,.6,.65,{deg:180,room:'trade_public'})
put('alpha_waiting_seats',103.7,8.5,3.2,1.15,{room:'trade_public',deg:180})
put('alpha_notice',104,4.23,1.8,.075,{z:1.5,room:'trade_public'})
lamp(105.5,7,3.2)
service('trade_dispatch','trade_public',105.5,5,'lost/cargo/inventory')
enclosed('trade_sorting','行政署 · 贸易路线中转分拣间',110,4,12,6,'store','w','transit',3.6)
for(const x of [110.5,114,117.5])put('alpha_sorting_rack',x,4.25,3,.65,{room:'trade_sorting'})
for(let i=0;i<5;i++)put('alpha_parcel_stack',113.1+i*1.7,8.45,1.45,1.15,{variant:i,room:'trade_sorting'})
for(let i=0;i<3;i++)put('alpha_parcel_stack',113+i*2.8,5.35,1.65,1.05,{variant:i+2,room:'trade_sorting'})
put('alpha_parcel_cart',111.6,8.2,1.1,.85,{deg:90,room:'trade_sorting'})
put('alpha_parcel_cart',120.4,6.9,1.1,.85,{room:'trade_sorting'})
facing('alpha_sign',121.73,7.3,2.6,.04,270,{z:2.6,label:'ROUTES 01–04 / 接收 · 分拣 · 发运',room:'trade_sorting'})
for(const x of [112.4,116,119.5])lamp(x,7.2,3.6)

// Archives occupy the original yellow L-shaped district; the transverse halls stay open.
enclosed('paper_archive','档案署 · 纸质档案馆',56,20,9,12,'archive','s','archive',3)
for(const [i,aisle,category] of [[0,'A','实体文档'],[1,'B','探险日志'],[2,'C','研究论文']] as const){
 const x=57.6+i*2.6
 for(let module=0;module<6;module++)facing('alpha_archive_bank',x,20.95+(module+.5)*1.5,1.5,.62,270,{aisle,start:1+module*4,room:'paper_archive'})
 facing('alpha_sign',x-.75,20.4,1.4,.04,0,{z:2.42,label:aisle+' / '+category+' / 01 → 24',skin:'suspended'})
 for(const y of [22,26,29.6])lamp(x-.8,y,3)
}
facing('alpha_sign',64.78,27.4,2.5,.04,270,{z:1.4,label:'A124 = 通道 A · 底层 1 · 位置 24'})
for(const [id,name,y,h,side] of [['query','档案员办公室 1 · 信息与阅览',34,9,'w'],['archives_office_b','档案员办公室 2 · 编辑与编目',45,10,'s']] as const){
 const r=enclosed(id,'档案署 · '+name,56,y,9,h,'office',side,'archive_office',2.8)
 for(const [cx,cy,deg] of [[57.9,y+1.65,0],[63.1,y+1.65,0],[57.9,y+(id==='query'?7.25:7),180],[63.1,y+(id==='query'?7.25:7),180]]){
  facing('alpha_archive_cubicle',cx,cy,3,2.5,deg,{room:id})
  facing('alpha_archive_chair',cx-.15,cy+(deg===0?.45:-.45),.65,.68,deg,{room:id})
 }
 put('alpha_archive_trolley',59.7,y+.4,.8,.5,{room:id})
 put('alpha_clock',59.6,y+.20,.32,.045,{z:2.1,room:id})
 for(const xx of [58.1,62.9])for(const yy of [y+2,y+h-2.6])lamp(xx,yy,r.height)
}
facing('alpha_archive_reader',64.1,38.5,1.8,.8,270,{room:'query'})
service('query','query',64.1,38.5,'archive/report/repair/testimony','river')
enclosed('servers','档案署 · 技术支援与软件开发',66,34,6,12,'radio','e','archive_tech',2.8)
for(const [cy,deg] of [[35.55,0],[43.8,180]]){
 const cx=deg===0?68.2:69.8
 facing('alpha_tech_bench',cx,cy,3.6,2.2,deg,{room:'servers'})
 facing('alpha_archive_chair',cx,cy+(deg===0?.25:-.25),.65,.68,deg,{skin:'tech',room:'servers'})
}
facing('alpha_tech_bench',67.45,39.9,3.6,2.2,90,{room:'servers'})
facing('alpha_archive_chair',68.2,39.9,.65,.68,90,{skin:'tech',room:'servers'})
facing('alpha_notice',66.23,39.8,1.8,.075,90,{z:1.25,room:'servers'})
put('alpha_climate',68.5,34.23,.9,.3,{z:2.16,room:'servers'})
for(const y of [36.5,39.5,43])lamp(69,y,2.8)
enclosed('restricted','档案署 · 受控记录',66,48,6,7,'archive','s','archive',3)
for(let i=0;i<2;i++)put('alpha_archive_bank',66.5+i*1.75,48.4,1.72,.62,{aisle:'D',start:1+i*4,room:'restricted'})
facing('alpha_archive_reader',71.15,51.5,1.8,.8,270,{room:'restricted'})
put('alpha_archive_trolley',66.5,51,.8,.5,{room:'restricted'})
lamp(69,50.1,3);lamp(69,52.5,3)
service('restricted','restricted',71.15,51.5,'classified',undefined,3)
zone('research_hall','研究署 · 样品转运走廊',74,34,44,21,'intake',3.8)
b.circulation.push({x:74,y:43,w:44,h:3})
for(const [id,name,x,w] of [['sample','样本接收与生物检测室',75,13],['botany','植物实验室',90,12],['microbiology','微生物实验室',104,13]] as const){
 enclosed(id,'研究署 · '+name,x,35,w,8,'lab','s','lab',3.8)
 put('alpha_labbench',x+.35,35.35,w-5.1,.8,{room:id,skin:'sink'})
 put('alpha_lab_shelf',x+.4,35.3,w-5.3,.32,{z:1.48,room:id})
 facing('alpha_fumehood',x+w-.76,38.35,4.4,.9,270,{room:id})
 put('alpha_lab_island',x+2.1,38.45,3.6,1.1,{room:id})
 put('alpha_microscope',x+4.35,38.68,.8,.5,{z:.9,room:id})
 facing('alpha_swivel',x+3.1,40.2,.6,.65,180,{room:id})
 put('alpha_extractor',x+2.2,38.5,2.3,.5,{z:2.05,room:id})
 put('alpha_lab_duct',x+1.2,37,Math.min(w-2.5,9),.7,{z:3.08,room:id})
 for(const xx of [x+2.4,x+w-2.8])for(const yy of [37,41])lamp(xx,yy,3.8)
 lights.push({x:x+w-1.2,y:38.4,r:3.3,color:'#fff4dc',intensityMul:.38,fixZ:2.07,flickerSeed:x,keep:1,noFix:1})
 if(id==='botany'){put('alpha_planter',x+.6,40.3,.5,.5);put('alpha_planter',x+1.2,40.3,.5,.5)}
 service(id,id,x+2.7,36.15,id==='sample'?'sample/observation/ethics/seal':id==='botany'?'botany/analysis':'analysis',id==='sample'?'faust':undefined,id==='microbiology'?1:0)
}
for(let i=0;i<3;i++){
 const r=enclosed('research_office_'+i,'研究署 · 研究员办公室 '+(i+1),75+i*5,46,4.3,8,'office','n','office',2.7)
 for(const yy of [r.y+2.5,r.y+5.4]){
  facing('alpha_office_station',r.x+r.w-.55,yy,1.6,.65,270,{room:r.id})
  facing('alpha_chair',r.x+r.w-1.3,yy,.5,.54,270,{room:r.id})
 }
 facing('alpha_office_station',r.x+.55,r.y+5.2,1.6,.65,90,{room:r.id})
 facing('alpha_chair',r.x+1.25,r.y+5.2,.5,.54,90,{room:r.id})
 put('alpha_climate',r.x+1.4,r.y+r.h-.48,.9,.3,{z:2.05,room:r.id})
 put('alpha_climate',r.x+1.6,r.y+r.h-.85,.5,.3,{skin:'portable',room:r.id})
 facing('alpha_notice',r.x+.23,r.y+2.1,1.2,.075,90,{z:1.18,room:r.id})
 for(const p of alphaWindowOpenings(r))facing('alpha_blinds',r.x+r.w-.09,r.y+p.offset+p.width/2,p.width,.18,270,{z:p.bottom,height:p.height,room:r.id})
 lamp(r.x+2.15,r.y+3,2.7);lamp(r.x+2.15,r.y+6.3,2.7)
}
for(const [id,name,x,w,skin,label] of [
 ['research_reagents','试剂与无菌耗材',91,8,'reagents','R / REAGENTS'],
 ['research_specimens','样品与检测器械',101,8,'samples','S / SPECIMENS'],
] as const){
 const r=enclosed(id,'研究署 · '+name,x,46,w,8,'store','n','lab',3)
 for(const [cx,cy,deg,type,text] of [[x+.74,50,90,skin,label],[x+w-.74,50,270,'instruments','I / INSTRUMENTS'],[x+w/2,53.2,180,skin,label]] as const)
  facing('alpha_sample_rack',cx,cy,3,.78,deg,{skin:type,label:text,room:id})
 put('alpha_labbench',x+.5,47.7,2,.8,{room:id});lamp(x+3,48.4,r.height);lamp(x+w/2,51.8,r.height)
}
enclosed('cold_samples','研究署 · 受控冷藏间',111,46,6,8,'vault','n','lab',3)
for(const x of [111.5,114.8])put('alpha_cold_cabinet',x,51.8,1.35,.8,{room:'cold_samples'})
facing('alpha_sample_rack',111.7,49.8,2.4,.78,90,{room:'cold_samples',label:'C / COLD'})
lamp(114,49,3);service('cold_samples','cold_samples',112.2,52,'cold',undefined,1)
facing('alpha_notice',98,43.15,1.8,.075,0,{z:1.1});facing('alpha_safety',89.1,40.8,.9,.18,90,{z:.85})

// Three distinct arrival vestibules. Return exits sit at their outer ends, away from circulation.
for(const entry of ALPHA_ENTRIES){
 const r=enclosed(entry.id,entry.name,entry.x,entry.y,entry.w,entry.h,'intake',entry.side,'',3)
 put('alpha_bench',r.x+1,r.y+2,2.1,.55);put('alpha_lockers',entry.id==='entry_w'?r.x+4:r.x+1,entry.id==='entry_w'?r.y+.35:r.y+4.1,1.5,.48)
 put('alpha_notice',r.x+1,r.y+.22,2.1,.075,{z:1.15})
 put('alpha_desk',r.x+r.w-3.4,r.y+2.5,2,.7,{label:entry.id==='entry_e'?'物资检查':'来访登记'})
 put('alpha_swivel',r.x+r.w-2.8,r.y+3.4,.6,.65)
 put('alpha_sign',r.x+1,r.y+r.h-1,2,.04,{z:2.3,label:'ALPHA / '+entry.name.split(' · ')[0],skin:'suspended',color:'#a7bdb8'})
 lamp(r.x+3,r.y+3,3);lamp(r.x+r.w-3,r.y+r.h-3,3)
}

// Residential districts retain the Aquila shell beneath progressively newer domestic fit-outs.
const residence=(id:string,name:string,x:number,y:number,w:number,h:number,style:RoomSpec['style'],side:RoomSpec['door'],skin:string,height=2.85,extra:RoomSpec['door'][]=[])=>{
 const r=enclosed(id,name,x,y,w,h,style,side,skin,height,extra);residentialSkins.set(id,skin)
 if(skin.startsWith('res_'))for(const edge of [side,...extra]){
  const door=alphaDoorway(r,edge),horizontal=edge==='n'||edge==='s'
  for(const offset of [-1.02,.9])wall(door.cx+(horizontal?offset:-.13),door.cy+(horizontal?-.13:offset),horizontal?.12:.26,horizontal?.26:.12,2.3,'door_frame','#987951')
  wall(door.cx-(horizontal?1.02:.13),door.cy-(horizontal?.13:1.02),horizontal?2.04:.26,horizontal?.26:2.04,.12,'door_frame','#987951',2.3)
 }return r
}
for(const district of ALPHA_DISTRICTS.filter(r=>['anemoia','crimson','epiphany','river','zephyr'].includes(r.id))){zone(district.id+'_hall',district.name+' · 居民走廊',district.x,district.y,district.w,district.h,'intake',2.85);residentialSkins.set(district.id+'_hall','res_'+district.id)}
zone('anemoia_annex_hall','爱念陌异区 · 住宅廊',120,32,20,23,'intake',2.85);residentialSkins.set('anemoia_annex_hall','res_anemoia')
const grow=residence('anemoia_services','爱念陌异区 · 菌菇生产房',104,11,17,18,'garden','s','mushroom',3.1)
put('alpha_grow_station',105,12,2.4,.75,{room:grow.id});put('alpha_water',117.6,12,1.2,.55,{room:grow.id})
for(let row=0;row<8;row++)for(let col=0;col<10;col++){
 const x=col<5?105.1+col*1.3:114.2+(col-5)*1.3,y=15+row*1.52
 put('alpha_mushroom_block',x,y,.64,.6,{room:grow.id,variant:row*10+col,skin:col<5?'substrate':'mycelium',height:.57+(row%3)*.07})
}
for(const x of [108,116.5])for(const y of [15,21,26])lamp(x,y,3.1)
service('anemoia_services',grow.id,106,13,'cultivation/community')
const anemoiaCommon=residence('anemoia_common','爱念陌异区 · 老街起居室',123,11,16,9,'dining','w','res_anemoia')
put('alpha_home_kitchen',124,11.5,3.8,.66,{room:anemoiaCommon.id});put('alpha_home_table',131,13,2.3,1.8,{room:anemoiaCommon.id});put('alpha_reading_chair',136.6,12, .86,.88,{room:anemoiaCommon.id,color:'#837b59'});put('alpha_reading_chair',136.6,16,.86,.88,{room:anemoiaCommon.id,color:'#837b59'});put('alpha_home_frame',130,11.22,.9,.055,{z:1.4,room:anemoiaCommon.id});lamp(128,16,2.85,true);lamp(135,16,2.85,true)
const dining=residence('community_dining','腥红区 · 社区厨房与食堂',57,58,46,12,'dining','s','res_crimson',2.85,['n'])
for(const x of [59,63])put('alpha_home_kitchen',x,58.5,3.8,.66,{room:dining.id,color:'#9c7661'})
for(const x of [61,67,73,85,91,97])put('alpha_home_table',x,63,2.3,1.8,{room:dining.id})
for(const x of [84,88,92,96])put('alpha_reading_chair',x,59,.86,.88,{room:dining.id,color:'#915e52'})
put('alpha_notice',100.6,58.24,1.8,.075,{z:1.3,room:dining.id});put('alpha_water',99.9,66.5,1.2,.55,{room:dining.id})
for(const x of [62,70,80,88,98])for(const y of [61,67])lamp(x,y,2.85,true)
service('community_dining',dining.id,64,60,'meal/community/cargo','suanpan')
const library=residence('library','先驱区 · 多媒体图书馆',33,83,24,17,'library','n','library',3.1,['s'])
put('alpha_library_counter',34,84,3,.85,{room:library.id})
for(const [col,x] of [34.5,38.7,42.8,46.2,50.4,54.6].entries())for(let row=0;row<4;row++)facing('alpha_library_shelf',x,88.2+row*2.5,2.4,.72,90,{room:library.id,label:['LITERATURE','FIELD GUIDES','HISTORY','AUDIO / VIDEO','PERIODICALS','COMMUNITY'][col]})
for(const y of [88,94])put('alpha_aquila_column',43.25,y,.48,.48,{height:3.1,room:library.id,skin:'library'})
put('alpha_library_soffit',44,84,1.55,15,{z:2.84,room:library.id})
for(let i=0;i<4;i++){put('alpha_library_terminal',47+i*2.2,84,1.5,.75,{room:library.id});put('alpha_swivel',47.4+i*2.2,85.2,.6,.65,{room:library.id})}
for(const x of [34,37,49,53])put('alpha_reading_chair',x,98,.86,.88,{room:library.id,color:'#6d746d'})
for(const x of [36,41,46,51,55])for(const y of [86,91,97])lamp(x,y,3.1)
service('library',library.id,34.5,85,'archive/community')
const river=residence('river_services','利沃区 · 纪念起居与洗衣维修',107,58,22,14,'wash','s','res_river',2.85,['n','e'])
put('alpha_memorial',108,58.5,2.2,.4,{room:river.id})
for(const x of [108,111])put('alpha_reading_chair',x,61,.86,.88,{room:river.id,color:'#638079'})
for(const x of [121,125])put('alpha_laundry',x,58.5,2.6,.7,{room:river.id})
put('alpha_build_bench',123.5,69,2.2,.8,{room:river.id});put('alpha_home_table',111,67,2.3,1.8,{room:river.id});put('alpha_home_frame',114,58.23,.9,.055,{z:1.5,room:river.id})
for(const x of [111,118,125])for(const y of [62,69])lamp(x,y,2.85,true)
service('river_services',river.id,124.5,70,'repair/care/community')
const home=(district:string,name:string,index:number,x:number,y:number,w:number,h:number,side:RoomSpec['door'])=>{
 const r=residence(district+'_home_'+index,name+' · 住宅 '+(index+1),x,y,w,h,'bedroom',side,'res_'+district);r.housing=index%2?'double':'single'
 const data={room:r.id};put('alpha_bed',x+.55,y+.75,2.1,1,data);put('alpha_bedside',x+2.95,y+.75,.5,.45,data)
 if(index%2)put('alpha_bed',x+(side==='w'?2:.55),y+2.3,2.1,1,data)
 put('alpha_home_wardrobe',x+w-2.05,y+.5,1.5,.56,{...data,color:district==='river'?'#839484':'#a38a63'})
 put('alpha_desk',x+.6,y+h-1.15,1.8,.65,data);put('alpha_swivel',x+1.1,y+h-2.05,.6,.65,data);put('alpha_bags',x+w-1.2,y+h-1.2,.7,.55,data)
 put('alpha_home_frame',x+2.1,y+.22,.9,.055,{...data,z:1.55});put('alpha_reading_chair',x+w-1.4,y+1.9,.86,.88,{...data,color:district==='crimson'?'#965d51':district==='river'?'#587b72':'#868068'})
 lamp(x+w/2,y+h/2,2.85,true);return r
}
home('anemoia','爱念陌异',0,123,22,7,9,'s');home('anemoia','爱念陌异',1,132,22,7,9,'s')
for(let i=0;i<4;i++)home('anemoia','爱念陌异',i+2,i%2?132:121,35+Math.floor(i/2)*10,i%2?7:8,8,i%2?'w':'e')
for(let i=0;i<4;i++)home('crimson','腥红',i,57+i*12,73,10,7,'n')
for(let i=0;i<4;i++)home('epiphany','先驱',i,59+(i%2)*11,84+Math.floor(i/2)*9,9,7,'n')
home('epiphany','先驱',4,32,71,9,9,'s');home('epiphany','先驱',5,43,71,10,9,'s')
for(let i=0;i<4;i++)home('river','利沃',i,107+(i%2)*12,76+Math.floor(i/2)*13,10,11,'n')
for(let i=0;i<6;i++)home('zephyr','西风',i,i%2?94.5:83,84+Math.floor(i/2)*10,8.5,8,i%2?'w':'e')
// A long photo-matched corridor, with a low boxed service soffit and successive wooden doors.
for(const x of [91.55,94.05]){wall(x,84,.4,39,.23,'res_zephyr','#cbd3d0',2.55);put('alpha_conduit',x+.1,84,.06,39,{z:2.49,height:.045})}
for(const y of [85,93,103,113,122])lamp(93,y,2.85)
for(const y of [90.5,100.5,110.5]){
 facing('alpha_home_frame',91.53,y,.7,.055,90,{z:1.45});facing('alpha_home_frame',94.47,y,.7,.055,270,{z:1.45})
}
const work=residence('zephyr_services','西风区 · 扩建联络与木工间',83,114,8.5,10,'workshop','e','res_zephyr')
put('alpha_build_bench',84,115,2.2,.8,{room:work.id});put('alpha_build_supplies',84,121,2.5,.85,{room:work.id});put('alpha_notice',88,114.22,1.8,.075,{z:1.2,room:work.id});lamp(86,118,2.85)
service('zephyr_services',work.id,85,116,'inspect/repair/report')
const extension=residence('zephyr_extension','西风区 · 未完工住宅',94.5,114,8.5,10,'workshop','w','aquila',3.1)
put('alpha_build_supplies',96,115,2.5,.85,{room:extension.id});put('alpha_build_barrier',98,122,2,.32,{room:extension.id});put('alpha_aquila_column',101,115,.85,.85,{height:3.1,room:extension.id});lamp(98,119,3.1)
// Beyond the finished homes: Aquila's large raw concrete piers, beams and exposed utilities.
zone('aquila_boundary_hall','天鹰段 · 基地扩建边界',31,111,49,15,'intake',3.6);residentialSkins.set('aquila_boundary_hall','aquila')
for(const x of [35,47,59,78])for(const y of [115,123])put('alpha_aquila_column',x,y,.95,.95,{height:3.6})
for(const y of [115,123]){wall(31,y,49,.42,.24,'aquila','#a5aba0',3.36);put('alpha_conduit',31,y+.55,49,.07,{z:3.15,height:.07})}

// Preserve the existing staff access restrictions independently of the remade public wing.
for(const [id,access] of [['overseer',3],['trade_sorting',1],['servers',1],['restricted',3],['microbiology',1],['cold_samples',1]] as const){
 const r=b.rooms.find(r=>r.id===id)!,horizontal=r.door==='n'||r.door==='s';r.access=access
 b.doors.push({id,access,height:2.3,axis:horizontal?'x':'y',
  x:horizontal?r.x+(r.w-1.8)/2:r.door==='e'?r.x+r.w-.18:r.x,
  y:horizontal?(r.door==='s'?r.y+r.h-.18:r.y):r.y+(r.h-1.8)/2,w:horizontal?1.8:.18,h:horizontal?.18:1.8})
}
// Corridor details: expedition-station mudroom, briefing wall, water and rest pockets.
// Heavy props sit in wall-side bays; each doorway keeps a full unobstructed approach.
for(const [y1,y2] of [[28.25,30.65],[33.35,35.75],[38.25,40.65],[43.35,45.75],[48.25,50.65],[53.35,55.75],[58.25,60.65],[63.35,65.75]])
 facing('alpha_trim',20.03,(y1+y2)/2,y2-y1,.055,90)
for(const [x,w] of [[11.4,7.5],[22.1,7.3],[32.4,8.7],[44,8.6]])facing('alpha_trim',x+w/2,24.025,w,.055)
facing('alpha_bench',13.6,24.42,2.1,.55)
facing('alpha_notice',16.3,24.045,1.8,.075,0,{z:1.1})
facing('alpha_safety',23.4,24.1,.9,.18,0,{z:.85})
facing('alpha_lockers',35.5,24.39,1.5,.48)
facing('alpha_cart',38.1,24.52,.85,.6)
facing('alpha_mudroom',20.35,34.8,1.8,.48,90)
facing('alpha_notice',20.02,39.3,1.8,.075,90,{z:1.05})
facing('alpha_bench',20.4,44.8,2.1,.55,90)
facing('alpha_safety',20.08,49.2,.9,.18,90,{z:.85})
facing('alpha_lockers',20.4,54.7,1.5,.48,90)
facing('alpha_mudroom',20.35,64.9,1.8,.48,90)
// Across from the glazed meeting room, where passers-by can actually be seen through the windows.
facing('alpha_notice',41.97,46.1,1.8,.075,270,{z:1.1})
facing('alpha_bench',41.58,50.7,2.1,.55,270)
facing('alpha_water',41.59,54.2,1.2,.55,270)
put('alpha_planter',40.9,48.5)
// Communal waiting pocket along the southern corridor; freestanding board has real legs.
put('alpha_bench',70,112,2.1,.55);put('alpha_bench',74,112,2.1,.55)
put('alpha_notice',72.6,111.8,1.1,.075,{z:.95,stand:1})
put('alpha_planter',76.8,112);put('alpha_water',68.3,112,1.2,.55)
for(const [x,y,w] of [[25,26.6,27],[24.5,39.5,28],[25,58.8,27],[56,56,45]])
 put('alpha_conduit',x,y,w,.06,{z:2.69,height:.055})

decorations.push(...alphaCommunityLayout())
// The south edge is beyond the regular ceiling-light grid: light the crew's rest pockets locally.
lamp(86,125,2.9,true);lamp(99,125,2.9,true)

// A single placement rule also protects future authored props from blocking doorways.
export const ALPHA_PLACEMENT_CLEARANCES:Rect[]=[...doorways,...ALPHA_ENTRIES.map(entry=>{
 const rad=entry.mount.deg*Math.PI/180,nx=Math.round(Math.sin(rad)),ny=Math.round(Math.cos(rad)),cx=entry.mount.x+nx,cy=entry.mount.y+ny
 return {x:cx-(nx?1:1.02),y:cy-(ny?1:1.02),w:nx?2:2.04,h:ny?2:2.04}
})]
export const ALPHA_REMOVED_DOOR_PROPS:Structure[]=[]
for(let i=decorations.length-1;i>=0;i--)if(blocksAlphaDoor(decorations[i],ALPHA_PLACEMENT_CLEARANCES))ALPHA_REMOVED_DOOR_PROPS.push(...decorations.splice(i,1))
const serviceFurniture:Record<string,StructKind[]>={
 radio:['alpha_desk'],field_training:['alpha_desk'],equipment:['alpha_desk'],duty_dining:['table'],duty_clinic:['medcabinet'],
 reception:['alpha_reception_counter'],overseer:['alpha_executive_desk'],trade_dispatch:['alpha_dispatch_desk'],query:['alpha_archive_reader'],restricted:['alpha_archive_reader'],sample:['alpha_labbench'],botany:['alpha_labbench'],microbiology:['alpha_labbench'],cold_samples:['alpha_cold_cabinet'],
 anemoia_services:['alpha_grow_station'],community_dining:['alpha_home_kitchen'],library:['alpha_library_counter'],river_services:['alpha_build_bench'],zephyr_services:['alpha_build_bench']}
for(const service of b.services){
 const r=b.rooms.find(r=>r.id===service.zone)!
 const candidates=decorations.filter(s=>(serviceFurniture[service.id]??['alpha_desk']).includes(s.kind)&&inside(r,s.x+s.w/2,s.y+s.h/2)&&!s.data?.facility)
 candidates.sort((a,c)=>Math.hypot(a.x+a.w/2-service.x,a.y+a.h/2-service.y)-Math.hypot(c.x+c.w/2-service.x,c.y+c.h/2-service.y))
 const anchor=candidates[0]
 if(!anchor)throw new Error('Alpha service has no physical furnishing: '+service.id)
 anchor.data={...anchor.data,facility:1,room:service.zone,label:service.label,services:service.services,service:service.services[0],faction:'meg',access:service.access??0,npc:service.npc??''}
 service.x=anchor.x+anchor.w/2;service.y=anchor.y+anchor.h/2
}
export const ALPHA_DOORWAYS=doorways

// Authored ceiling/floor runs, clipped to the plan silhouette; no rectangular mega-hall.
const footprint=[...ALPHA_DISTRICTS,...b.corridors]
const at=(x:number,y:number)=>{const r=[...b.rooms].reverse().find(r=>inside(r,x,y));return {height:r?.height??2.9,skin:r&&residentialSkins.has(r.id)?residentialSkins.get(r.id)!:r?.id==='reception'?'admin_lobby':r?.id==='overseer'?'executive':r?.id==='assembly'?'lecture':r?.id.startsWith('trade_')?'transit':r?.id==='query'||r?.id==='archives_office_b'?'archive_office':r?.id==='servers'?'archive_tech':r?.id==='paper_archive'||r?.id==='restricted'?'archive':r?.style==='bedroom'?'wood':r?.style==='classroom'?'classroom':r?.id.startsWith('research_office')?'office':r?.style==='lab'||r?.id.startsWith('research_')||r?.id==='cold_samples'?'lab':!r&&(y>100||x<31||x>=130)?'aquila':''}}
const isFloor=(x:number,y:number)=>footprint.some(r=>inside(r,x,y))
for(let y=4;y<126;y++){
 for(let x=10;x<141;){
  if(!isFloor(x+.5,y+.5)){x++;continue}
  const p=at(x+.5,y+.5);let end=x+1
  while(end<141&&isFloor(end+.5,y+.5)&&JSON.stringify(at(end+.5,y+.5))===JSON.stringify(p))end++
  put('alpha_floor',x,y,end-x,1,{skin:p.skin});put('alpha_ceiling',x,y,end-x,1,{skin:p.skin,z:p.height});x=end
 }
}
// Perimeter closure and roof steps. Only the silhouette contributes exterior walls.
for(let y=4;y<126;y++)for(let x=10;x<141;x++)if(isFloor(x+.5,y+.5)){
 const p=at(x+.5,y+.5)
 for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const q=at(x+.5+dx,y+.5+dy),xx=x+(dx===1?.86:0),yy=y+(dy===1?.86:0)
  if(!isFloor(x+.5+dx,y+.5+dy))wall(xx,yy,dx?.14:1,dy?.14:1,p.height,'aquila')
  else if(q.height>p.height)wall(xx,yy,dx?.14:1,dy?.14:1,q.height-p.height,'','#e6dec6',p.height)
 }
}
// Fill remaining circulation and non-reference rooms with ceiling-aligned lights.
for(let y=8;y<124;y+=4)for(let x=12;x<140;x+=5)if(isFloor(x,y)&&!lights.some(l=>Math.hypot(l.x-x,l.y-y)<3.3)){
 if(b.rooms.some(r=>residentialSkins.has(r.id)&&!r.id.endsWith('_hall')&&inside(r,x,y)))continue
 const r=[...b.rooms].reverse().find(r=>inside(r,x,y));if(r?.style==='bedroom'||['reception','overseer','assembly','trade_public','trade_sorting','radio','meeting','meeting_b','field_training','equipment','equipment_b','paper_archive','query','archives_office_b','servers','restricted'].includes(r?.id??''))continue
 lamp(x,y,at(x,y).height)
}
for(const d of ALPHA_DISTRICTS.filter(d=>d.name))put('alpha_sign',d.x+d.w/2-1.5,d.y+.2,3,.04,{z:2.35,label:d.name,color:d.color,skin:'suspended'})
put('alpha_sign',87,115,7,.04,{z:2.35,label:'西风区 / 正在向南侧走廊扩建',color:'#849caa',skin:'suspended'})
export const ALPHA_BLUEPRINT=b
export const ALPHA_LIGHTS=lights
