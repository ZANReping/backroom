import { room, type SettlementBlueprint as Blueprint, type RoomSpec, type FurniturePlacement as Furniture, type ShellSpec } from './settlementTypes'
import {BNTG_BLUEPRINT} from './bntgBlueprint'

// Metres. Function zones never imply walls; only E() authors enclosed construction.
const F=(kind:Furniture['kind'],x:number,y:number,w=2,d=.8,seats=0):Furniture=>({kind,x,y,w,d,seats})
const Z=(id:string,name:string,x:number,y:number,w:number,h:number,style:RoomSpec['style'],furniture:Furniture[]=[],height=3.2)=>room(id,name,x,y,w,h,style,'n',{furniture,height,floorMaterial:['bedroom','dining','library','residential'].includes(style)?'wood':['clinic','lab','wash','kitchen'].includes(style)?'tile':'concrete'})
function base(id:Blueprint['id'],level:number,size:number,faction:Blueprint['faction'],name:string,x:number,y:number,w:number,h:number,height:number,roof:ShellSpec['roof']):Blueprint{
 const nx=id==='alpha'?61:40,wy=Math.floor(size*.7),ey=size/2
 return {id,level,size,faction,name,rooms:[],shells:[{x,y,w,h,height,roof}],partitions:[],doors:[],services:[],circulation:[],
 corridors:[{x:nx-3,y:2,w:6,h:y+4},{x:2,y:wy-3,w:x+4,h:6},{x:x+w-3,y:ey-3,w:size-x-w+1,h:6}],
 exits:[{x:nx,y:2},{x:size-3,y:ey},{x:2,y:wy}],spawn:{x:nx,y:y+3},focus:{x:nx,y:y+6,targets:[]}}
}
function O(b:Blueprint,...zones:RoomSpec[]){b.rooms.push(...zones)}
function E(b:Blueprint,r:RoomSpec,access=0,side:RoomSpec['door']='n',glass=false,gap=2.4){
 r.enclosed=true;r.access=access;r.door=side;b.rooms.push(r)
 b.shells.push({x:r.x,y:r.y,w:r.w,h:r.h,height:r.height,roof:'domestic'})
 const part=(x:number,y:number,w:number,h:number)=>{
  if(glass){b.partitions.push({x,y,w,h,height:.85,material:'plaster'},{x,y,w,h,bottom:.85,height:r.height-.85,material:'glass'})}
  else b.partitions.push({x,y,w,h,height:r.height,material:'plaster'})
 }
 for(const s of ['n','s','w','e'] as const){
  const horizontal=s==='n'||s==='s',x=s==='e'?r.x+r.w-.2:r.x,y=s==='s'?r.y+r.h-.2:r.y,len=horizontal?r.w:r.h
  if(s!==side){part(x,y,horizontal?len:.2,horizontal?.2:len);continue}
  const half=(len-gap)/2
  part(x,y,horizontal?half:.2,horizontal?.2:half)
  part(x+(horizontal?half+gap:0),y+(horizontal?0:half+gap),horizontal?half:.2,horizontal?.2:half)
  const dx=x+(horizontal?half:0),dy=y+(horizontal?0:half)
  b.partitions.push({x:dx,y:dy,w:horizontal?gap:.2,h:horizontal?.2:gap,bottom:2.35,height:r.height-2.35,material:'plaster'})
  if(access)b.doors.push({id:r.id,x:dx,y:dy,w:horizontal?gap:.2,h:horizontal?.2:gap,height:2.35,access,axis:horizontal?'x':'y'})
 }
 return r
}
function S(b:Blueprint,id:string,x:number,y:number,services:string,npc?:string,access=0,label?:string){
 const r=b.rooms.find(r=>r.id===id)!
 r.service??=services.split('/')[0];if(npc)r.npc=npc
 b.services.push({id,zone:id,x:r.x+x,y:r.y+y,label:label??r.name,services:services.split('/'),npc,access,mount:'counter'})
}
const alpha=base('alpha',101,128,'meg','M.E.G. Alpha 基地',8,10,112,108,4.4,'slab')
O(alpha,
 Z('atrium','Alpha · 公共中庭',48,24,32,28,'residential',[F('sofa',2,6,6),F('sofa',24,6,6),F('table',11,21,10,1.3,8),F('planter',2,18,4),F('planter',26,18,4),F('board',10,0,12)],4.4),
 Z('reception','行政署 · 接待与公共服务',48,12,32,10,'intake',[F('counter',2,3,8),F('counter',20,3,8),F('board',11,0,10)],4.4),
 Z('hall_a','行政署 · 多用途会堂',12,12,32,18,'auditorium',[F('board',6,1,20),F('table',3,6,6,2,8),F('table',13,6,6,2,8),F('table',23,6,6,2,8),F('screen',11,11,.2,5),F('screen',21,11,.2,5)],4.4),
 Z('administration','行政署 · 集中办公',84,12,18,16,'office',[F('desk',2,3,6),F('desk',10,8,6),F('locker',1,13,10)]),
 Z('radio','探险署 · 行动与无线电大厅',12,34,32,20,'radio',[F('radio',1,1,12),F('radio',19,1,11),F('desk',2,6,7),F('desk',22,6,7),F('table',10,12,10,2,10),F('board',11,0,10)]),
 Z('equipment','探险署 · 整备与仓储带',12,58,32,16,'store',[F('shelf',1,1,11),F('shelf',20,1,11),F('shelf',1,5,11),F('shelf',20,5,11),F('counter',19,11,11)]),
 Z('field_training','探险署 · 训练工作区',12,78,32,12,'workshop',[F('table',2,2,13,1.2,8),F('locker',23,2,7),F('board',3,0,12)]),
 Z('query','档案署 · 开放信息与阅览区',48,56,32,28,'library',[F('shelf',1,2,9),F('shelf',22,2,9),F('shelf',1,7,9),F('shelf',22,7,9),F('table',12,12,8,2,8),F('desk',2,20,8),F('desk',22,20,8)]),
 Z('sample','研究署 · 样本接收与观察门厅',84,32,18,10,'lab',[F('counter',2,3,12)]),
 Z('community_dining','腥红区 · 社区食堂与起居',46,89,32,16,'dining',[F('table',2,2,8,1.2,8),F('table',20,2,8,1.2,8),F('sofa',2,10,8),F('counter',20,11,10)]),
 Z('anemoia_services','爱念陌异区 · 菌菇与居民服务',104,12,12,10,'garden',[F('planter',1,1,4,2),F('planter',7,1,4,2),F('counter',1,7,7)]),
 Z('river_services','利沃区 · 洗衣维修起居',84,90,32,14,'wash',[F('sink',2,2,9),F('table',20,2,10),F('sofa',3,10,9)]),
 Z('library','先驱区 · 图书与公共活动',12,94,30,10,'library',[F('shelf',1,0,10),F('sofa',16,3,10),F('radio',1,6,5)]),
 Z('zephyr_services','西风区 · 扩建联络',82,108,14,8,'workshop',[F('table',1,2,7),F('board',1,0,10)]))
E(alpha,Z('overseer','监督者驻办',104,34,12,8,'office',[F('desk',2,3,7)],2.8),3)
E(alpha,Z('botany','研究署 · 植物实验区',84,46,14,18,'lab',[F('lab',2,5,9,1.4),F('planter',2,11,8,2),F('sink',2,1,4)]),0,'n',true,3)
E(alpha,Z('microbiology','研究署 · 微生物实验区',102,46,14,18,'lab',[F('lab',2,5,9,1.4),F('lab',2,11,9,1.4),F('sink',2,1,4)]),1,'n',true,3)
E(alpha,Z('cold_samples','研究署 · 冷藏后勤',100,68,16,14,'vault',[F('fridge',1,1,5),F('fridge',10,1,5)],3.2),1,'s')
E(alpha,Z('servers','档案署 · 服务器',82,68,14,14,'radio',[F('radio',1,1,4),F('radio',9,1,4)],3.2),1,'s')
E(alpha,Z('restricted','档案署 · 受控记录',62,108,16,8,'archive',[F('shelf',1,2,4),F('shelf',11,2,4)],2.8),3)
for(const [key,name,x,y] of [['anemoia','爱念陌异',104,24],['crimson','腥红',46,108],['epiphany','先驱',10,108],['zephyr','西风',28,108],['river','利沃',100,108]] as const)
 for(let i=0;i<2;i++)E(alpha,{...Z(key+'_home_'+i,name+' · 住宅 '+(i+1),x+i*8,y,7,8,'bedroom',[F('bed',.7,1,1.2,2.1),F('desk',3.5,2,2),F('sofa',.7,5,2)],2.6),housing:i?'double':'single'},0,key==='anemoia'?'n':'n')
S(alpha,'reception',5,4,'career/report/lost/cargo','justin')
S(alpha,'radio',4,7,'radio/dispatch/report','nightingale')
S(alpha,'equipment',22,12,'equipment/warehouse/inventory/cargo','brandt')
S(alpha,'field_training',4,3,'training/field_training/inspect/repair')
S(alpha,'query',5,21,'archive/report/repair/testimony','river')
S(alpha,'sample',5,4,'sample/observation/ethics/seal','faust')
S(alpha,'botany',5,6,'botany/analysis')
S(alpha,'microbiology',5,6,'analysis',undefined,1)
S(alpha,'overseer',4,4,'report','kat',3)
S(alpha,'community_dining',23,12,'meal/community/cargo','suanpan')
S(alpha,'river_services',24,3,'repair/care/community')
S(alpha,'anemoia_services',4,8,'cultivation/community')
S(alpha,'library',4,1,'archive/community')
S(alpha,'cold_samples',11,2,'cold',undefined,1)
S(alpha,'restricted',4,3,'classified',undefined,3)
alpha.circulation=[{x:44,y:10,w:4,h:108},{x:78,y:10,w:4,h:108},{x:8,y:30,w:96,h:4},{x:8,y:54,w:112,h:4},{x:8,y:84,w:112,h:4}]
alpha.focus={x:63,y:28,targets:['reception','radio','sample','query']}

const bntg=base('bntg',102,80,'bntg','商人之家',6,8,68,64,4.8,'industrial')
O(bntg,
 Z('market','市场 · 六店报价与议价',8,10,64,15,'market',Array.from({length:6},(_,i)=>[F('counter',2+i*10+(i>=3?4:0),3,7),F('shelf',2+i*10+(i>=3?4:0),0,7)]).flat(),4.8),
 Z('transport','运输合同与理赔工作区',8,29,16,30,'office',[F('desk',1,2,6),F('desk',9,2,6),F('table',3,12,10,1.5,8),F('shelf',1,25,12)]),
 Z('logistics','收货 → 验货 → 分拣打包',58,28,14,32,'workshop',[F('table',1,2,11),F('shelf',1,9,11),F('table',1,19,11),F('locker',1,27,11)],4.8),
 Z('canteen','职员食堂与休息',8,63,38,7,'dining',[F('table',1,2,12,1.2,10),F('sofa',18,2,9),F('counter',30,2,6)],2.8),
 Z('vault_entry','交易保险库 · 登记柜台',28,26,26,7,'intake',[F('counter',1,2,8),F('counter',17,2,8)],3.6))
E(bntg,Z('vault','中央交易保险库',28,34,26,24,'vault',[F('shelf',1,2,10),F('shelf',15,2,10),F('shelf',1,7,10),F('shelf',15,7,10),F('board',2,0,8)],3.6),1,'n',false,3)
// Separate freight opening to the east logistics lane.
const freight=bntg.partitions.find(p=>Math.abs(p.x-53.8)<.01&&p.h===24)!
bntg.partitions.splice(bntg.partitions.indexOf(freight),1,{...freight,h:16},{...freight,y:53,h:5},{...freight,y:50,h:3,bottom:2.35,height:1.25})
bntg.doors.push({id:'freight',x:53.8,y:50,w:.2,h:3,height:2.35,access:1,axis:'y'})
E(bntg,Z('high_value','高价值货位',29,49,10,8,'vault',[F('shelf',1,2,7)],3.2),2)
E(bntg,Z('anomaly','异常货位与盘点',43,49,10,8,'vault',[F('shelf',1,2,7)],3.2),2)
for(let i=0;i<2;i++)E(bntg,Z('beds_'+i,'职员宿舍 '+(i+1),49+i*13,63,10,7,'bedroom',[F('bed',1,1,1.2,2.1),F('bed',7,1,1.2,2.1)],2.6))
S(bntg,'market',5,4,'career/market/contract/seal','vesper')
S(bntg,'vault_entry',4,3,'warehouse/inventory','dorian')
S(bntg,'transport',4,3,'dispatch/contract/report/evidence/training')
S(bntg,'logistics',4,3,'inspect/cargo/equipment/repair/seal')
S(bntg,'anomaly',4,3,'anomaly/inventory',undefined,2)
S(bntg,'canteen',32,3,'meal')
bntg.circulation=[{x:24,y:26,w:4,h:37},{x:54,y:26,w:4,h:37},{x:6,y:59,w:68,h:4}]
bntg.focus={x:40,y:21,targets:['market','vault_entry','logistics']}

const ariane=base('ariane',103,80,'ariane','希波克拉底 - 1',8,10,64,60,3.8,'vault')
ariane.staff=[{id:'muller',x:48,y:33},{id:'lefevre',x:62,y:33},{id:'morel',x:29,y:44}]
O(ariane,
 Z('reception','医疗大厅 · 免费诊疗与候诊',10,12,60,14,'intake',[F('counter',2,2,10),F('counter',47,2,10),F('sofa',2,10,14),F('sofa',43,10,14),F('board',22,0,16)],3.8),
 Z('public_ward','护理厅 · 四床病区与处置',10,29,25,21,'clinic',[...Array.from({length:4},(_,i)=>F('bed',1+i*6,2,1.2,2.1)),F('screen',4,1,.1,4),F('screen',10,1,.1,4),F('screen',16,1,.1,4),F('counter',7,10,11),F('sink',2,16,6)],3.8),
 Z('research_entry','研究翼 · 样本接收与更衣',42,28,26,7,'lab',[F('counter',2,1,8),F('locker',17,1,7)],2.8),
 Z('classroom','教学 · 病例查阅与职员休息',10,61,39,7,'library',[F('shelf',1,0,10),F('table',14,2,10,1.2,8),F('sofa',28,2,9)],2.8))
for(let i=0;i<4;i++)E(ariane,Z('consult_'+i,i<2?'私密诊室 '+(i+1):'单人观察 '+(i-1),10+i*7,53,6,6,'clinic',[F('bed',.6,1,1.2,2.1),F('sink',3.5,3,1.4)],2.8))
E(ariane,Z('research','共享仪器与样本前处理',42,37,26,22,'lab',[F('lab',2,2,10),F('sink',17,2,5)],2.8),1,'n',true,3)
E(ariane,Z('lab_a','研究翼 · 实体样本实验',43,45,11,12,'lab',[F('lab',2,4,7,1.3),F('sink',1,1,3)],2.8),0,'n',true)
E(ariane,Z('lab_b','研究翼 · 植物病理实验',57,45,10,12,'lab',[F('lab',1,4,7,1.3),F('planter',1,8,7,1.2)],2.8),0,'n',true)
E(ariane,Z('isolation','隔离观察与冷藏',52,61,8,7,'clinic',[F('bed',1,1,1.2,2.1),F('fridge',5,1,2)],2.8),1,'n',true)
E(ariane,Z('beds_a','值班宿舍 A',63,61,7,7,'bedroom',[F('bed',1,1,1.2,2.1)],2.6))
E(ariane,Z('beds_b','值班宿舍 B',31,39,7,10,'bedroom',[F('bed',1,1,1.2,2.1)],2.6),0,'e')
// Nursing bay ends before the staff dormitory; privacy rooms remain the only solid public enclosures.
ariane.rooms.find(r=>r.id==='public_ward')!.w=21
S(ariane,'reception',5,3,'career/care/training','lecomte')
ariane.services.push({id:'pharmacy',zone:'reception',x:60,y:15,label:'药品发放 · 基础治疗',services:['care'],npc:'martin',mount:'counter'})
S(ariane,'public_ward',10,11,'care/rescue/treatment/observation','dupont')
S(ariane,'research_entry',5,2,'sample/seal/prepare')
S(ariane,'lab_a',5,5,'analysis',undefined,1)
S(ariane,'lab_b',4,5,'botany/analysis',undefined,1)
S(ariane,'classroom',4,1,'archive/report/ethics/training/testimony')
S(ariane,'isolation',5,2,'cold/observation',undefined,1)
ariane.circulation=[{x:38,y:26,w:4,h:44},{x:8,y:26,w:64,h:3},{x:8,y:50,w:30,h:3},{x:68,y:28,w:4,h:33},{x:42,y:59,w:30,h:2}]
ariane.focus={x:40,y:23,targets:['reception','pharmacy','public_ward','research_entry']}

const tom=base('tom',104,80,'tom',"Tom 的餐馆",20,22,40,34,3,'domestic')
O(tom,
 Z('dining','餐厅 · 餐桌、卡座与公共长桌',21,23,24,18,'dining',[
 ...Array.from({length:6},(_,i)=>F('table',5+i%3*5,3+Math.floor(i/3)*6,2,1.2,4)),
 ...Array.from({length:4},(_,i)=>F('booth',.5,1+i*4,2,2,2)),F('table',6,15,6.5,1.1,8),F('board',5,0,9),F('sofa',16,15,3),F('radio',20,15,2)],3),
 Z('bar','吧台 · 咖啡与社区交流',45,23,3,18,'dining',[F('counter',0,2,1.2,10,6)],3),
 Z('staff','员工休息与食谱',36,47,8,7,'residential',[F('sofa',1,1,5),F('desk',1,4,5)],2.6),
 Z('receiving','送货验收与干货整理',52,47,7,7,'store',[F('table',1,1,5),F('shelf',1,5,5)],2.6))
E(tom,Z('kitchen','厨房 · 备料、烹饪、出餐与清洗',48,23,11,18,'kitchen',[F('stove',1,1,4),F('sink',6,1,4),F('lab',3,7,5,1.2),F('sink',6,13,4)],3.2),1,'s',false,2)
const hatch=tom.partitions.find(p=>p.x===48&&p.h===18&&p.w===.2)!
tom.partitions.splice(tom.partitions.indexOf(hatch),1,{...hatch,height:1.05},{...hatch,bottom:2.1,height:1.1})
E(tom,Z('restroom','公共卫生间',21,47,6,7,'wash',[F('sink',1,2,3)],2.6))
E(tom,Z('dry','干货与清洁储藏',29,47,5,7,'store',[F('shelf',1,3,3)],2.6),1)
E(tom,Z('private','私人房间',46,47,5,7,'bedroom',[F('bed',.7,1,1.2,2.1)],2.6),9)
E(tom,Z('cold','冷藏间',53,42,6,4,'vault',[F('fridge',3,1,2)],2.6),1,'w',false,1.8)
S(tom,'dining',7,1,'career/meal/serve/lost/testimony/community/report','tom')
S(tom,'bar',.5,5,'prep/serve/coffee/meal','aiko')
S(tom,'kitchen',5,8,'cook/prep/serve/meal/wash',undefined,1)
S(tom,'receiving',3,2,'inspect/cargo/inventory/ingredients/seal')
S(tom,'staff',3,5,'recipe/report')
S(tom,'cold',4,2,'cold',undefined,1)
tom.circulation=[{x:20,y:42,w:33,h:4},{x:46.5,y:23,w:1.5,h:18},{x:48,y:41,w:5,h:6}]
tom.focus={x:40,y:25,targets:['dining','bar','staff']}

const cornu=base('cornucopia',116,80,'argos','丰饶角',8,10,64,60,4.2,'industrial')
O(cornu,
 Z('reception','公开办事大厅 · 报案、公告与查询',10,12,60,15,'intake',[F('counter',2,2,12),F('counter',45,2,12),F('sofa',2,10,12),F('sofa',45,10,12),F('board',22,0,16)],4.2),
 Z('casefiles','案件工作岛 · 案卷与线索',10,30,18,18,'office',[F('desk',1,2,6),F('desk',10,2,6),F('table',3,9,11,1.4),F('shelf',1,15,14),F('board',2,0,12)],4.2),
 Z('evidence_entry','证物登记与交接',32,29,20,6,'intake',[F('counter',1,1,6),F('counter',13,1,6)],4.2),
 Z('briefing','巡逻整备 · 简报、通信与器材',56,30,14,18,'radio',[F('radio',1,1,11),F('table',2,7,9,1.2,6),F('locker',1,14,11)],4.2),
 Z('hearing','听证与申诉',30,55,24,13,'classroom',[F('table',2,1,19,1.2),F('table',2,6,7,1,6),F('table',15,6,7,1,6),F('screen',0,0,.1,9)],3.2),
 Z('medical','医疗检查与物品返还',10,49,18,5,'clinic',[F('bed',1,1,1.2,2.1),F('counter',9,1,7)],2.8),
 Z('canteen','轮值食堂与休息',56,61,14,7,'dining',[F('table',1,2,6,1.2,6),F('sofa',9,2,4)],2.8))
E(cornu,Z('evidence_store','中央证物库',32,36,20,16,'vault',[F('shelf',1,2,6),F('shelf',12,2,6),F('shelf',1,10,6)],3.6),1,'n',false,3)
E(cornu,Z('dangerous','危险证物隔间',43,43,8,8,'vault',[F('locker',1,3,5)],3.2),2)
for(let i=0;i<2;i++){
 E(cornu,Z('interview_'+i,'私密问询 '+(i+1),10+i*10,55,8,6,'office',[F('table',1,2,5,1,2)],2.8))
 E(cornu,Z('holding_'+i,'临时留置 · 呼叫与申诉',10+i*10,63,8,5,'holding',[F('bed',1,.5,1.2,2.1),F('sink',5,1,2)],2.7),0,'s')
 E(cornu,Z('beds_'+i,'巡逻队宿舍 '+(i+1),56+i*8,51,6,7,'bedroom',[F('bed',.6,1,1.2,2.1)],2.6))
}
S(cornu,'reception',5,3,'career/report/testimony','argos_clerk')
S(cornu,'casefiles',4,3,'case/evidence/testimony/archive/report','argos_investigator')
S(cornu,'evidence_entry',4,2,'evidence/seal/inventory','argos_investigator')
S(cornu,'briefing',4,2,'dispatch/training/equipment/inspect','argos_marshal')
S(cornu,'hearing',5,2,'hearing/appeal/report','argos_reviewer')
S(cornu,'medical',12,2,'care/compensation','argos_medic')
S(cornu,'dangerous',4,4,'evidence',undefined,2)
for(let i=0;i<2;i++)S(cornu,'holding_'+i,5,2,'appeal/hearing/compensation')
cornu.circulation=[{x:28,y:27,w:4,h:43},{x:52,y:27,w:4,h:28},{x:8,y:27,w:64,h:3},{x:56,y:48,w:16,h:3},{x:8,y:61,w:22,h:2},{x:8,y:68,w:64,h:2}]
cornu.focus={x:40,y:24,targets:['reception','casefiles','evidence_entry','briefing']}

export const SETTLEMENTS:Record<number,Blueprint>={101:alpha,102:BNTG_BLUEPRINT,103:ariane,104:tom,116:cornu}

