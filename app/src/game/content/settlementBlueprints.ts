import { room as R, type SettlementBlueprint, type RoomSpec } from './settlementTypes'

// Deliberate room programmes and metre coordinates, never generated from the loot RNG.
const alpha: RoomSpec[] = [
  R('radio','探险署 · 无线电中控室',4,6,16,11,'radio','s',{npc:'nightingale',service:'radio'}),
  R('training_a','探险署 · 培训会议室 A',23,6,17,11,'classroom','s',{service:'training'}),
  R('training_b','探险署 · 培训会议室 B',4,20,16,10,'classroom','s'),
  R('equipment','探险署 · 行动整备',23,20,17,10,'store','s',{service:'equipment'}),
  R('supply','探险署 · 分类仓库',4,33,16,10,'store','s',{npc:'brandt',service:'warehouse'}),
  R('field_training','探险署 · 现场训练室',23,33,17,10,'workshop','s',{service:'field_training'}),
  R('duty_beds','探险署 · 值班宿舍',4,46,16,10,'bedroom','s'),
  R('duty_lounge','探险署 · 休息室',23,46,17,10,'residential','s'),
  R('duty_clinic','探险署 · 医疗间',4,59,16,10,'clinic','s',{service:'care'}),
  R('duty_dining','探险署 · 自助食堂',23,59,17,10,'dining','s',{service:'meal'}),
  R('hall_a','行政署 · 大会厅 A',44,6,16,13,'auditorium','s'),
  R('hall_b','行政署 · 大会厅 B',63,6,15,13,'auditorium','s'),
  R('hall_c','行政署 · 大会厅 C',81,6,15,13,'auditorium','s'),
  R('reception','行政署 · 接待与资格认证',44,22,16,13,'intake','n',{service:'career',npc:'justin'}),
  R('administration','行政署 · 资源配给办公室',63,22,15,6,'office','n',{service:'report'}),
  R('overseer','行政署 · 监督者驻办',81,22,15,6,'office','n',{npc:'kat',access:3}),
  R('sorting','行政署 · 贸易中转与分拣',63,30,15,6,'store','s',{npc:'suanpan',service:'cargo'}),
  R('lost','行政署 · 失物招领',81,30,15,6,'intake','s',{service:'lost'}),
  R('query','档案署 · 公共查询',44,39,8,9,'library','s',{service:'archive'}),
  R('archivists','档案署 · 档案员办公室',55,39,9,9,'archive','s',{npc:'river',service:'report'}),
  R('support','档案署 · 技术支援',44,51,8,8,'workshop','s',{service:'repair'}),
  R('servers','档案署 · 服务器间',55,51,9,8,'radio','s',{access:1}),
  R('paper','档案署 · 纸质档案库',44,62,8,9,'archive','s',{service:'archive'}),
  R('restricted','档案署 · 受控记录室',55,62,9,9,'archive','s',{access:3,service:'classified'}),
  R('sample','研究署 · 样本接收',68,39,12,9,'intake','s',{service:'sample'}),
  R('botany','研究署 · 植物实验室',83,39,13,9,'lab','s',{service:'botany'}),
  R('microbiology','研究署 · 微生物实验室',68,51,12,8,'lab','s',{access:1,service:'analysis'}),
  R('observation','研究署 · 观察检测室',83,51,13,8,'lab','s',{npc:'faust',service:'observation'}),
  R('research_office','研究署 · 研究办公室',68,62,12,9,'office','s',{service:'ethics'}),
  R('cold_samples','研究署 · 冷藏样本间',83,62,13,9,'vault','s',{access:1,service:'cold'}),
  R('instruments','研究署 · 器材库',68,74,28,7,'store','s'),
]
function homes(prefix: string, label: string, x: number,y: number,w:number,h:number) {
  const out: RoomSpec[]=[]
  for(let i=0;i<4;i++) out.push(R(`${prefix}_home_${i}`,`${label} · ${i+1}号住房`,x+(i%2)*(w+3),y+Math.floor(i/2)*(h+3),w,h,'bedroom','s',{housing:(['single','double','family','single'] as const)[i]}))
  return out
}
alpha.push(
  ...homes('anemoia','爱念陌异区',100,6,10,8),
  R('anemoia_services','爱念陌异区 · 居民服务',100,28,10,10,'residential','s',{service:'community'}),
  R('mushrooms','爱念陌异区 · 菌菇生产',113,28,10,10,'garden','s',{service:'cultivation'}),
  ...homes('river','利沃区',100,44,10,8),
  R('laundry','利沃区 · 洗衣维修',100,66,10,10,'wash','s',{service:'repair'}),
  R('river_services','利沃区 · 便民服务',113,66,10,10,'residential','s',{service:'community'}),
  ...homes('crimson','腥红区',44,86,16,7),
  R('community_dining','腥红区 · 社区食堂',82,86,14,17,'dining','s',{service:'meal'}),
  ...homes('epiphany','先驱区',4,78,16,9),
  R('library','先驱区 · 多媒体图书馆',4,102,16,13,'library','s',{service:'archive'}),
  R('club','先驱区 · 公共活动室',23,102,17,13,'residential','s',{service:'community'}),
  ...[0,1,2,3].map(i=>R(`zephyr_home_${i}`,`西风区 · ${i+1}号住房`,44+i*13,109,11,11,'bedroom','s',{housing:(['single','double','family','double'] as const)[i]})),
  R('zephyr_services','西风区 · 扩建联络与居民服务',100,90,23,18,'workshop','s',{service:'repair'}),
  R('public_wash','居民公用洗手间',100,80,23,7,'wash','s'),
)

const bntg: RoomSpec[] = [
  R('reception','商人之家 · 接待与报价',28,4,24,8,'intake','n',{through:true,npc:'vesper',service:'career'}),
  ...[0,1,2,3,4,5].map(i=>R(`shop_${i}`,`市场 · ${['食品','饮水','工具','衣物','医疗','旅行用品'][i]}`,5+i*12,15,10,9,'market','s',{service:'market'})),
  R('negotiation_a','议价室 A',5,4,10,8,'office','s'), R('negotiation_b','议价室 B',63,4,12,8,'office','s'),
  R('vault_entry','保险库 · 登记前室',28,27,24,7,'intake','n',{service:'warehouse',npc:'dorian'}),
  ...[0,1,2,3,4,5].map(i=>R(`vault_${i}`,`保险库 · ${['食品','工具','医疗','高价值','异常','周转'][i]}货位`,28+(i%2)*14,37+Math.floor(i/2)*9,10,7,'vault',i%2?'w':'e',{access:i===4?2:1,service:i===4?'anomaly':'inventory'})),
  R('transport','运输办公室',5,28,19,8,'office','s',{service:'dispatch'}),R('contract','合同与理赔',5,39,19,8,'office','s',{service:'contract'}),R('meeting','业务会议室',5,50,19,11,'classroom','s'),
  R('receiving','物流 · 收货验货',57,28,18,8,'store','s',{service:'inspect'}),R('sort','物流 · 分拣与暂扣',57,39,18,8,'store','s',{service:'cargo'}),R('packing','物流 · 打包维修',57,50,18,11,'workshop','s',{service:'seal'}),
  R('canteen','职员食堂',5,65,19,10,'dining','n',{service:'meal'}),R('beds_a','职员宿舍 A',28,65,10,10,'bedroom','n'),R('beds_b','职员宿舍 B',41,65,11,10,'bedroom','n'),R('changing','更衣与洗手间',57,65,8,10,'wash','n'),R('security','安保值班',68,65,7,10,'radio','n'),
]
const ariane: RoomSpec[] = [
  R('reception','希波克拉底 - 1 · 接待候诊',27,4,26,9,'intake','n',{through:true,height:3.8,npc:'lecomte',service:'career'}),
  R('triage','分诊室',5,4,19,9,'clinic','s',{service:'care',npc:'dupont'}),R('pharmacy','药品发放',57,4,18,9,'clinic','s',{service:'care',npc:'martin'}),
  R('consult_a','诊室 A',5,17,9,9,'clinic','s',{service:'care'}),R('consult_b','诊室 B',17,17,10,9,'clinic','s',{service:'care'}),
  R('public_ward','普通病房 · 四床',5,30,22,11,'clinic','s',{service:'rescue'}),
  R('observation_a','单人观察室 A',5,45,9,8,'clinic','s',{service:'observation'}),R('observation_b','单人观察室 B',17,45,10,8,'clinic','s',{service:'observation'}),
  R('treatment','处置与护理站',5,57,13,8,'clinic','s',{service:'treatment'}),R('medical_store','治疗器材',21,57,6,8,'store','s'),
  R('research_entry','研究门厅 · 样本接收',31,17,22,9,'intake','n',{service:'sample'}),
  R('changing','更衣与缓冲',57,17,18,9,'wash','s',{access:1,service:'prepare'}),
  R('pretreatment','样本前处理',31,30,10,11,'lab','s',{access:1,service:'seal'}),R('lab_a','微生物实验室',44,30,9,11,'lab','s',{access:1,service:'analysis'}),R('lab_b','植物实验室',57,30,18,11,'lab','s',{access:1,service:'botany'}),
  R('isolation','隔离观察室',31,45,10,8,'lab','s',{access:1,service:'observation'}),R('restricted','受控储藏',44,45,9,8,'vault','s',{access:2}),R('cold','冷藏样本',57,45,18,8,'vault','s',{access:1,service:'cold'}),
  R('classroom','救护培训教室',31,57,22,8,'classroom','s',{service:'training'}),R('wash','清洗与废弃物暂存',57,57,8,8,'wash','s'),R('repair','器材维修',68,57,7,8,'workshop','s',{service:'repair'}),
  R('office','研究办公室与病例档案',5,69,22,7,'archive','n',{service:'ethics'}),R('beds_a','值班宿舍 A',31,69,10,7,'bedroom','n'),R('beds_b','值班宿舍 B',44,69,9,7,'bedroom','n'),R('lounge','工作人员休息间',57,69,18,7,'residential','n'),
]
const tom: RoomSpec[] = [
  R('welcome','Tom 的餐馆 · 候位与留言墙',24,9,28,9,'intake','n',{through:true,height:3,service:'career',npc:'tom'}),
  R('lost','留言与失物格',8,9,12,9,'archive','s',{service:'lost'}),R('receiving','食材收货',56,9,16,9,'store','s',{service:'inspect'}),
  R('dining','主餐厅',8,22,44,26,'dining','n',{height:3,service:'serve',npc:'aiko'}),
  R('kitchen','厨房 · 备餐、烹饪与出餐',56,22,16,16,'kitchen','s',{access:1,service:'cook'}),
  R('dry','干货间',56,41,7,7,'store','s',{access:1,service:'ingredients'}),R('cold','冷藏间',65,41,7,7,'vault','s',{height:2.6,access:1,service:'cold'}),
  R('bar','吧台与咖啡',8,52,20,10,'kitchen','n',{height:3,service:'coffee'}),R('music','音乐与社区角',31,52,21,10,'residential','n',{height:3,service:'community'}),
  R('clean','清洗与清洁用品',56,52,16,10,'wash','n',{service:'wash',access:1}),
  R('restroom','公共卫生间',8,66,12,8,'wash','n'),R('staff','员工休息室',24,66,16,8,'residential','n',{access:1}),R('private','私人房间',44,66,12,8,'bedroom','n',{access:9}),R('office','供货与食谱记录',60,66,12,8,'office','n',{service:'recipe'}),
]
const cornucopia: RoomSpec[] = [
  R('reception','丰饶角 · 接待与规则告示',28,4,24,9,'intake','n',{through:true,height:4.2,npc:'argos_clerk',service:'career'}),R('report','报案室',5,4,19,9,'office','s',{service:'report'}),R('waiting','公众等候',56,4,19,9,'residential','s'),
  R('casefiles','案卷办公室',5,17,19,9,'archive','s',{npc:'argos_investigator',service:'case'}),R('testimony','证言记录室',5,30,19,9,'office','s',{service:'testimony'}),R('clues','线索整理室',5,43,19,9,'archive','s',{service:'evidence'}),
  R('interview_a','问询室 A',5,56,8,8,'office','s',{service:'interview'}),R('interview_b','问询室 B',16,56,8,8,'office','s',{service:'interview'}),
  R('evidence_entry','证物登记前室',28,17,24,9,'intake','n',{service:'seal'}),R('evidence_store','普通证物库',28,30,24,9,'vault','s',{access:1,service:'evidence'}),R('dangerous','危险证物隔间',28,43,24,9,'vault','s',{access:2,service:'analysis'}),
  R('briefing','巡逻简报室',56,17,19,9,'classroom','s',{npc:'argos_marshal',service:'dispatch'}),R('comms','通信与装备领取',56,30,19,9,'radio','s',{service:'equipment'}),R('changing','更衣与器材维护',56,43,19,9,'workshop','s',{service:'repair'}),
  R('hearing','听证与申诉',28,56,24,8,'classroom','s',{npc:'argos_reviewer',service:'hearing'}),
  R('holding_a','临时留置 A · 呼叫听证',5,68,8,8,'holding','n',{height:2.7,service:'hearing'}),R('holding_b','临时留置 B · 呼叫听证',16,68,8,8,'holding','n',{height:2.7,service:'hearing'}),
  R('medical','医疗检查与物品返还',28,68,24,8,'clinic','n',{npc:'argos_medic',service:'care'}),R('beds_a','巡逻宿舍 A',56,56,8,8,'bedroom','s'),R('beds_b','巡逻宿舍 B',67,56,8,8,'bedroom','s'),R('canteen','值班食堂',56,68,19,8,'dining','n',{service:'meal'}),
]
function blueprint(id:SettlementBlueprint['id'],level:number,size:number,faction:SettlementBlueprint['faction'],name:string,rooms:RoomSpec[]):SettlementBlueprint {
  return {id,level,size,faction,name,rooms,corridors:[{x:2,y:2,w:size-4,h:size-4}],exits:[{x:id==='alpha'?61:Math.floor(size/2),y:2},{x:size-3,y:Math.floor(size/2)},{x:2,y:Math.floor(size*.7)}],spawn:{x:id==='alpha'?61:Math.floor(size/2),y:3}}
}
export const SETTLEMENTS:Record<number,SettlementBlueprint>={
  101:blueprint('alpha',101,128,'meg','M.E.G. Alpha 基地',alpha),
  102:blueprint('bntg',102,80,'bntg','商人之家',bntg),
  103:blueprint('ariane',103,80,'ariane','希波克拉底 - 1',ariane),
  104:blueprint('tom',104,80,'tom','Tom 的餐馆',tom),
  116:blueprint('cornucopia',116,80,'argos','丰饶角',cornucopia),
}


