import type { Engine } from '../engine'
import type { CareerId } from '../content/settlementTypes'
import { CAREERS, CAREER_IDS } from '../content/careers'
import type { QuestDef } from '../content/factions'
import { RNG } from '../core/rng'
import { canOccupy } from '../core/player'
import type { Structure } from '../core/types'
import {facilitySight} from './facilitySight'
import {updateBntg,type BntgSave} from './bntg'
import { freshMeg, megState, promoteMeg, registerMeg, type MegSave } from './megMissions'
import { isNewFaction, isEnhancedFaction, type NewFaction } from '../content/factionTerminals'
import { factionState, promoteFaction, registerFaction, type FactionSave } from './factionMissions'
export interface CareerSave {factions?:Partial<Record<NewFaction,FactionSave>>}
export interface CareerSave {meg?:MegSave}
export interface CareerSave {bntg?:BntgSave}
export interface CareerProgress {joined:boolean;task:number;rank:number;active:boolean;field:number;points:{x:number;y:number;level:number}[];records:string[];work?:number;measurements?:{x:number;y:number;steps:number;at:number}[]}
export interface CareerSave {version:1;clock:number;routes:Partial<Record<CareerId,CareerProgress>>;settled:string[];pending:{id:string;items:string[]}[];offers:Record<string,{epoch:number;quests:QuestDef[]}>;deprogram:number;case:{stage:'clear'|'warning'|'question'|'pursuit'|'hearing';evidence:string[];resolved:string[]};device?:{level:number;x:number;y:number;until:number};returnAnchor?:{level:number;x:number;y:number;yaw:number};returning?:boolean}
export const freshCareer=():CareerSave=>({version:1,clock:0,routes:{},settled:[],pending:[],offers:{},deprogram:0,case:{stage:'clear',evidence:[],resolved:[]},meg:freshMeg()})
export function restoreCareer(raw?:CareerSave):CareerSave {const s=freshCareer();if(raw?.version!==1)return s;const copy=structuredClone(raw);return {...s,...copy,routes:copy.routes??{},pending:copy.pending??[],settled:copy.settled??[],meg:copy.meg?.version===1?copy.meg:undefined}}
export function route(eng:Engine,id:CareerId){return eng.career.routes[id]??={joined:false,task:0,rank:0,active:false,field:0,points:[],records:[]}}
export function joinCareer(eng:Engine,id:CareerId){if(id==='meg')return registerMeg(eng);if(isNewFaction(id))return registerFaction(eng,id);if(!availableStation(eng,'career',id)&&!availableStation(eng,CAREERS[id].chapters[0].stations[0],id))return '请在对应登记或培训设施附近办理入会。';const p=route(eng,id);p.joined=true;eng.msg(`已登记${CAREERS[id].name}协作身份。其他团体的身份保持有效。`,'system');return '协作身份已登记。'}
export function startCareer(eng:Engine,id:CareerId){if(isEnhancedFaction(id))return false;const p=route(eng,id);if(!p.joined||p.task>=12)return false;if(CAREER_IDS.filter(k=>!isEnhancedFaction(k)&&route(eng,k).active).length>=3&&!p.active)return false;p.active=true;return true}
export function reward(eng:Engine,id:string,items:string[]){if(eng.career.settled.includes(id))return false;eng.career.settled.push(id);eng.career.pending.push({id,items:[...items]});claimRewards(eng);return true}
export function claimRewards(eng:Engine){for(const pack of eng.career.pending){while(pack.items.length&&eng.addItem(pack.items[0]))pack.items.shift()}eng.career.pending=eng.career.pending.filter(p=>p.items.length)}
export function stationServices(style:string,service?:string):string[]{
 const aliases:Record<string,string[]>={intake:['career','seal','report'],office:['report','contract','testimony','ethics'],radio:['radio','dispatch','equipment'],classroom:['training','hearing'],auditorium:['training'],store:['warehouse','cargo','inventory','equipment'],vault:['inventory','evidence','seal','cold'],archive:['archive','case','evidence','report'],library:['archive','testimony'],workshop:['repair','inspect','stabilize','field_training'],clinic:['care','observation'],lab:['sample','analysis','botany'],kitchen:['prep','serve','meal'],dining:['meal','serve','report'],residential:['lost','testimony','report']}
 return [...new Set([...(service?[service]:[]),...(aliases[style]??[])])]
}
export function availableStation(eng:Engine,service:string,id:CareerId){
 return eng.map?.structures.find(s=>(s.kind==='settlementstation'||s.data?.facility)&&s.data?.faction===id&&Math.hypot(s.x+s.w/2-eng.player.x,s.y+s.h/2-eng.player.y)<3&&Number(s.data.access??0)<=actualRank(eng,id)&&(s.data.services as string[]|undefined)?.includes(service)&&facilitySight(eng.map!,eng.player,{x:s.x+s.w/2,y:s.y+s.h/2},s))
}
export const SERVICE_LABELS:Record<string,string>={career:'登记与资格认证',training:'培训',field_training:'现场训练',report:'报告核验',equipment:'整备与器材',radio:'无线电中控',archive:'档案检索',sample:'样本接收',seal:'封签核验',cargo:'货物交接',warehouse:'仓储登记',inventory:'货位盘点',dispatch:'调度简报',contract:'合同室',evidence:'证据整理',care:'医疗处置',analysis:'样本分析',ethics:'伦理审查',inspect:'检查工位',repair:'维修工位',stabilize:'稳定工位',testimony:'证言记录',case:'案卷登记',hearing:'听证与申诉',meal:'订单登记',prep:'备餐工位',serve:'出餐窗口',lost:'失物登记'}
export const WORK_STEPS:Record<CareerId,string[]>={meg:['校准测距基准','保存原始测量与柜号','标注不确定性'],bntg:['登记货单与封签','对照编号货位及数量','记录差异并取得签收'],ariane:['取得同意并完成分诊','封装样本与污染标记','生成匿名病情记录'],brc:['检查风险与隔离总阀','执行工单修复','复测并解除隔离'],jerry:['确认自愿接触许可','记录同意或拒绝','允许退出并结束接触'],argos:['登记物证来源与编号','交叉核验证词','保留矛盾与申诉入口'],tom:['确认订单及食材归属','清洁备料并加工','按桌号出餐与回收餐具']}
export function workStep(eng:Engine,id:CareerId,step:number){if(isEnhancedFaction(id))return '该团体以完整任务线结案晋升，请查看团体终端任务档案。';const p=route(eng,id),ch=CAREERS[id].chapters[Math.floor(p.task/3)];if(!p.active||!ch||!availableStation(eng,ch.stations[p.task%3],id))return '请先抵达任务对应的工作台。';if(step!==(p.work??0)){p.work=0;return '工序顺序不符，已保留材料，请重新检查操作顺序。'}p.work=step+1;return `已完成：${WORK_STEPS[id][step]}`}
export const EXAMS:Record<CareerId,{question:string;options:string[];correct:number}>= {
 meg:{question:'测点互相矛盾时，报告应如何处理？',options:['保留原始测量，标记误差并复测','删除异常值，提交最短路线','改动原始记录，使路线闭合'],correct:0},
 bntg:{question:'封签完好但数量不符时应如何交接？',options:['直接打开其他货箱补足','登记数量、保留封签并双方复核','让下一位承运人承担差额'],correct:1},
 ariane:{question:'其他团体要求查看患者身份时怎么办？',options:['用患者姓名换取物资','公开整份病历','取得同意，提交必要的匿名医疗信息'],correct:2},
 brc:{question:'维修异常管线的正确顺序是什么？',options:['检查、隔离、修复、验收','先拆除再找总阀','把稳定设备放到任何地方'],correct:0},
 jerry:{question:'对方拒绝传教并要求离开时怎么办？',options:['限制对方的返程','尊重拒绝，结束接触','以援助为条件强迫认同'],correct:1},
 argos:{question:'只有互相矛盾的证词时可否定罪？',options:['声望低者必然有罪','按击杀记录判断','保留分歧，补充证据并允许申诉'],correct:2},
 tom:{question:'有人急需餐食但任务食材尚未验收怎么办？',options:['让 Tom 安排援助，分开登记订单与任务库存','把任务库存当作免费食物','要求 Aiko 离店代替自己战斗'],correct:0},
}
/** The qualification assessment is separate from reputation, including legacy high-reputation saves. */
export function performCareer(eng:Engine,id:CareerId,answer?:number){
 if(id==='meg')return promoteMeg(eng)
 if(isNewFaction(id))return promoteFaction(eng,id)
 const p=route(eng,id);if(!p.active||p.task>=12)return '请先登记并追踪这条路线。'
 const ch=CAREERS[id].chapters[Math.floor(p.task/3)],phase=p.task%3,service=ch.stations[phase]
 if(!availableStation(eng,service,id))return `请前往「${SERVICE_LABELS[service]??service}」工作台，并核对所需资格。`
 if(phase!==2&&(p.work??0)<3)return '需要先按顺序完成三项专业操作。'
 if(phase===1&&p.field<3)return `需要先在 Level ${ch.level} 完成三个现场记录（已完成 ${p.field}/3）。`
 if(phase===2&&answer!==EXAMS[id].correct)return '核验尚未通过。请核对专业规则后重试，证据与物品均予保留。'
 const key=`core:${id}:${p.task}`
 if(eng.career.settled.includes(key))return '这份任务已经结算。'
 const gain=phase===2?8:6;eng.changeRep(id,gain);reward(eng,key,['eaglecoin','bandage'])
 p.records.push(ch.tasks[phase]);p.task++;p.active=false;p.work=0
 if(phase===2){p.rank=Math.min(4,Math.floor(p.task/3));p.field=0;p.points=[]}
 return `已记录「${ch.tasks[phase]}」，${id==='tom'?'社区信任':'声望'} +${gain}。奖励如放不下，将保留在待领取清单。`
}
export function actualRank(eng:Engine,id:CareerId){if(id==='meg'||isNewFaction(id)){if(id==='meg')megState(eng);else factionState(eng,id);return route(eng,id).joined?Math.min(route(eng,id).rank,4):0}return Math.min(route(eng,id).rank,Math.max(0,Math.floor((eng.rep[id]??0)/20)),4)}
export function recordField(eng:Engine,id:CareerId){const p=route(eng,id),point=p.points[p.field];if(!p.active||p.task%3!==1||!point)return false;const inf=eng.map?.inf,x=eng.player.x+(inf?.ox??0),y=eng.player.y+(inf?.oy??0);if(point.level!==eng.player.level||Math.hypot(point.x-x,point.y-y)>3)return false;(p.measurements??=[]).push({x,y,steps:eng.player.steps,at:eng.career.clock});p.field++;eng.msg(`已核验现场记录 ${p.field}/3：${CAREERS[id].chapters[Math.floor(p.task/3)].field}`,'system');return true}
const fieldMarkers=new WeakMap<object,Structure>()
export function fieldTargets(eng:Engine){
 return CAREER_IDS.flatMap(id=>{const p=eng.career.routes[id],point=p?.points[p.field];if(isEnhancedFaction(id)||!p?.active||p.task%3!==1||!point||point.level!==eng.player.level)return [];let s=fieldMarkers.get(point);if(!s){s={kind:'settlementstation',x:0,y:0,w:.6,h:.6,solid:false,data:{faction:id}};fieldMarkers.set(point,s)}s.x=point.x-(eng.map?.inf?.ox??0)-.3;s.y=point.y-(eng.map?.inf?.oy??0)-.3;return [s]})
}
export function updateCareer(eng:Engine,dt:number){
 updateBntg(eng,dt)
 const s=eng.career;s.clock+=dt
 if(eng.indoctrination>=100&&!eng.jerryTamed&&eng.player.level!==274)eng.player.sanity=Math.max(25,eng.player.sanity-dt*.025)
 for(const id of CAREER_IDS){const p=s.routes[id];if(isEnhancedFaction(id)||!p?.active||p.task%3!==1||p.field>=3||p.points.length)continue
  const ch=CAREERS[id].chapters[Math.floor(p.task/3)];if(eng.player.level!==ch.level||!eng.map)continue
  const m=eng.map,inf=m.inf,rng=new RNG(eng.seed+CAREER_IDS.indexOf(id)*103+p.task*31)
  for(let tries=0;tries<1500&&p.points.length<3;tries++){const x=rng.int(3,m.w-4)+.5,y=rng.int(3,m.h-4)+.5;if(Math.hypot(x-eng.player.x,y-eng.player.y)<28||!canOccupy(m,x,y,.4,{z:0,band:0,crouch:false}))continue;const wx=x+(inf?.ox??0),wy=y+(inf?.oy??0);if(p.points.some(q=>Math.hypot(q.x-wx,q.y-wy)<25))continue;p.points.push({x:wx,y:wy,level:ch.level})}
 }
}
export function requestRecovery(eng:Engine,service:string){
 const s=eng.career
 const required=service==='isolation'?'care':service==='help'?'career':service
 const permitted=CAREER_IDS.some(id=>availableStation(eng,required,id)&&(!(service==='help')||id==='ariane'||id==='tom'))
 if(!permitted)return '请前往对应的接待、医疗、证言或听证设施。'
 if(service==='care'){eng.player.hp=100;eng.player.infection=0;return '基础诊疗完成，无需入会或付费。'}
 if(service==='help'&&s.deprogram===0){s.deprogram=1;return '已登记自愿求助。请在公开档案或证言设施核验证言。'}
 if(service==='testimony'&&s.deprogram===1){s.deprogram=2;return '已经核对外界证言。请在医疗设施完成隔离恢复。'}
 if(service==='isolation'&&s.deprogram===2){s.deprogram=3;eng.indoctrination=0;return '自愿恢复完成。你仍可选择自己的团体身份。'}
 if(service==='hearing'){s.case.resolved.push(...s.case.evidence);s.case.evidence=[];s.case.stage='clear';return '听证已受理：争议记录解除追捕，保留申诉材料。你可以自由离开。'}
 return '尚未满足这一恢复步骤的条件。'
}
export function witnessedOffense(eng:Engine,eventId:string,witness:string){const s=eng.career.case;if(s.resolved.includes(eventId)||s.evidence.includes(eventId)||!eng.npcs.some(n=>n.id===witness&&Math.hypot(n.x-eng.player.x,n.y-eng.player.y)<8))return;s.evidence.push(eventId);s.stage=s.evidence.length===1?'warning':s.evidence.length===2?'question':'pursuit'}
export function stableAt(eng:Engine,x:number,y:number){const d=eng.career.device,inf=eng.map?.inf,wx=x+(inf?.ox??0),wy=y+(inf?.oy??0);if(eng.mpSession?.started)return eng.mpSession.stabilizers.some(d=>d.level===eng.player.level&&d.expires>Date.now()&&Math.hypot(d.x-wx,d.y-wy)<=6);return !!d&&d.level===eng.player.level&&d.until>eng.career.clock&&Math.hypot(d.x-wx,d.y-wy)<=6}
export function deployStabilizer(eng:Engine){if(actualRank(eng,'brc')<3||!availableStation(eng,'stabilize','brc'))return false;if(eng.mpSession?.started)return eng.mpSession.requestStabilizer();const inf=eng.map?.inf;eng.career.device={level:eng.player.level,x:eng.player.x+(inf?.ox??0),y:eng.player.y+(inf?.oy??0),until:eng.career.clock+90};return true}


