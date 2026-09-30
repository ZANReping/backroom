import type {Engine} from '../engine'
import {availableStation,route} from './career'
import {BNTG_BLUEPRINT} from '../content/bntgBlueprint'
import {generateLevel} from '../world/mapgen'
import {levelDefOf} from '../levels'
import {facilitySight} from './facilitySight'
import type {Structure} from '../core/types'
import {actualRank} from './career'
import {hasVaultMission} from './factionMissions'
export function bntgDoorAllowed(eng:Engine,s:Structure){
 const p=eng.career.routes.bntg,rank=actualRank(eng,'bntg')
 if(rank>=Number(s.data?.access??2))return true
 return (hasVaultMission(eng)||!!p?.active&&[3,4,5].includes(p.task))&&['storage_0','storage_1','storage_2','storage_3','storage_4','storage_6'].includes(String(s.data?.room))
}
export interface VaultState{sequence:number;remaining:number;phase:number;slots:number[];moving:number}
export interface BntgSave{version:2;proofs:Record<string,string[]>;vault:VaultState;baseline:number}
export const VAULT_SLOTS=[{x:34,y:31},{x:46,y:31},{x:34,y:38},{x:46,y:38},{x:34,y:45},{x:34,y:52}]
export function migrateBntg(eng:Engine){
 if(eng.career.bntg?.version===2)return eng.career.bntg
 const p=eng.career.routes.bntg
 if(p&&(p.field||p.work||p.points.length)){p.field=0;p.work=0;p.points=[];p.records.push('商人之家业务更新：已完成任务及资格保留，当前旧测点已替换为实际货物核验。')}
 return eng.career.bntg={version:2,proofs:{},vault:{sequence:0,remaining:60,phase:0,slots:[0,1,2],moving:0},baseline:-1}
}
export const BNTG_EXAMS=[
 {question:'首批货物数量与货单不符，应如何交接？',options:['从其他货箱补足','保留封签，登记差异并双方复核','直接签收'],correct:1},
 {question:'编号箱迁移后，哪项证据能证明它还是原来的货物？',options:['箱号、原始封签与前后货位记录','新货位的颜色','估算箱子大小'],correct:0},
 {question:'跨层运送完成后，什么构成有效交付？',options:['仅口头说明已到达','发送出发照片','收货点、箱号、数量与签收记录一致'],correct:2},
 {question:'争议证据显示封签正常，但数量记录互相矛盾，如何结算？',options:['扣除承运人全部酬劳','保留争议，核验交接责任后结算','修改原始货单'],correct:1},
]
export function bntgExam(task:number){return BNTG_EXAMS[Math.min(3,Math.floor(task/3))]}
type Action={id:string;label:string;service:string;room?:string;box?:number;level?:number}
export const BNTG_ACTIONS:Record<number,Action[]>={
 0:[{id:'order',label:'登记试用货单 TH-001',service:'career',room:'market'},{id:'manifest',label:'核对清单：三件封签货物',service:'inspect',room:'logistics'},{id:'accept',label:'确认交接工位与承运责任',service:'cargo',room:'logistics'}],
 1:[{id:'package',label:'查验箱号 TH-001-A',service:'inspect',room:'logistics'},{id:'quantity',label:'台秤复核：三件货物',service:'cargo',room:'logistics'},{id:'seal',label:'封签台核验 S-014',service:'seal',room:'logistics'}],
 3:[0,1,2].map(box=>({id:'baseline'+box,label:'记录盘点箱 TV-00'+(box+1)+' 基线',service:'inventory',box})),
 4:[0,1,2].map(box=>({id:'trace'+box,label:'复核 TV-00'+(box+1)+' 的箱号与当前货位',service:'inventory',box})),
 6:[{id:'route',label:'编制 Level 3 运输路线',service:'dispatch',room:'transport'},{id:'load',label:'登记三件电气物资',service:'inspect',room:'logistics'},{id:'contract',label:'签署运输单 EL3-017',service:'contract',room:'transport'}],
 7:[{id:'receipt',label:'核对 EL3-017 收货编号',service:'cargo',level:3},{id:'count',label:'核验电气物资三件',service:'cargo',level:3},{id:'signature',label:'获取收货设施签收',service:'cargo',level:3}],
 9:[{id:'terms',label:'阅读争议合同 D-021',service:'contract',room:'transport'},{id:'dispatch',label:'查阅原始发货清单',service:'dispatch',room:'transport'},{id:'inspection',label:'读取封签台验收记录',service:'seal',room:'logistics'}],
 10:[{id:'received',label:'比较收货记录：三件',service:'cargo',room:'logistics'},{id:'seal',label:'比对封签：未破损',service:'seal',room:'logistics'},{id:'loss',label:'登记数量矛盾并保留原件',service:'evidence',room:'transport'}],
}
export function bntgActions(eng:Engine){return BNTG_ACTIONS[route(eng,'bntg').task]??[]}
export function bntgReady(eng:Engine){const s=migrateBntg(eng),p=route(eng,'bntg');return p.task%3===2||bntgActions(eng).every(a=>(s.proofs[String(p.task)]??[]).includes(a.id))}
export function performBntgAction(eng:Engine,id:string){
 const s=migrateBntg(eng),p=route(eng,'bntg'),a=bntgActions(eng).find(a=>a.id===id)
 if(!p.joined||!p.active||!a)return '请先登记并追踪当前业务。'
 const key=String(p.task),done=s.proofs[key]??=[]
 if(done.includes(id))return '这项记录已保存，无需重复。'
 if(a.level&&eng.player.level!==a.level)return '请抵达 Level '+a.level+' 接货设施。'
 if(a.box!==undefined){
  if(eng.player.level!==102)return '请前往交易保险库的实际编号货位。'
  const v=eng.mpSession?.started?eng.mpSession.tradeVault??s.vault:s.vault
  if(v.phase>0)return '货物暂时消失，等待它重新出现后复核。'
  if(p.task===4&&v.sequence<=s.baseline)return '尚未发生迁移，请等待下一次库房异常。'
  const pos=VAULT_SLOTS[v.slots[a.box]]
  const target=eng.map?.structures.find(b=>b.kind==='trade_anomaly'&&Number(b.data?.cargoId)===a.box)
  if(Math.hypot(eng.player.x-pos.x,eng.player.y-pos.y)>2.8||!eng.map||!facilitySight(eng.map,eng.player,pos,target))return '请走到对应编号箱前核验。'
  if(p.task===3)s.baseline=v.sequence
 }else{
  const station=availableStation(eng,a.service,'bntg')
  if(!station||(a.room&&station.data?.room!==a.room))return '请前往 '+(a.room==='transport'?'业务办公室':a.room==='market'?'大厅雇佣柜台':a.level===3?'Level 3 接货设施':'南部物流工位')+' 完成此操作。'
  if(p.task<2&&a.room==='logistics'){
   const cargo=eng.map!.structures.filter(c=>c.data?.manifest==='TH-001')
   if(cargo.length!==3||cargo.reduce((n,c)=>n+Number(c.data?.quantity??0),0)!==3||cargo.some(c=>c.data?.seal!=='S-014'))return '货单、数量或封签不符，请保留现场并重新核验，不能直接签收。'
  }
 }
 if(eng.mpSession?.started&&!eng.mpSession.isHost){eng.mpSession.requestTradeAction(p.task,id);return '已提交现场记录，等待房主核验。'}
 done.push(id);p.work=done.length;p.field=p.task%3===1?Math.min(3,done.length):p.field
 return '已保存：'+a.label
}
const validationMaps=new Map<number,ReturnType<typeof generateLevel>>()
let validationSeed=-1
export function validateTradeAction(eng:Engine,task:number,id:string,player:{x:number;y:number;level:number},vault:VaultState){
 const a=BNTG_ACTIONS[task]?.find(a=>a.id===id);if(!a)return false
 if(a.box!==undefined){const p=VAULT_SLOTS[vault.slots[a.box]],cell=BNTG_BLUEPRINT.rooms.find(r=>r.id.startsWith('storage_')&&p.x>=r.x&&p.x<r.x+r.w&&p.y>=r.y&&p.y<r.y+r.h);return player.level===102&&vault.phase===0&&(task!==4||vault.sequence>0)&&!!cell&&player.x>cell.x&&player.x<cell.x+cell.w&&player.y>cell.y&&player.y<cell.y+cell.h&&Math.hypot(player.x-p.x,player.y-p.y)<2.8}
 const level=a.level??102;if(player.level!==level)return false
 let structures=BNTG_BLUEPRINT.decorations!,ox=0,oy=0
 if(level===3){
  let map=validationMaps.get(3)
  const seed=eng.mpMapSeed?.(3)??eng.seed
  if(!map||validationSeed!==seed){map=generateLevel(levelDefOf(3)!,seed,true);validationMaps.set(3,map);validationSeed=seed}
  structures=map.structures;ox=map.inf?.ox??0;oy=map.inf?.oy??0
 }
 return structures.some(s=>s.data?.facility&&s.data.faction==='bntg'&&(s.data.services as string[])?.includes(a.service)&&(!a.room||s.data.room===a.room)&&Math.hypot(player.x-(s.x+s.w/2+ox),player.y-(s.y+s.h/2+oy))<3)
}
export function acceptTradeReceipt(eng:Engine,task:number,id:string){
 const p=route(eng,'bntg');if(p.task!==task||!p.active||!BNTG_ACTIONS[task]?.some(a=>a.id===id))return
 const done=migrateBntg(eng).proofs[String(task)]??=[]
 if(!done.includes(id))done.push(id)
 p.work=done.length;if(task%3===1)p.field=Math.min(3,done.length)
 eng.msg('房主已核验现场交接记录。','system')
}
export function advanceVault(v:VaultState,dt:number,seed:number){
 if(v.phase>0){v.phase=Math.max(0,v.phase-dt);if(!v.phase){const shift=1+((seed+v.sequence*2654435761)>>>0)%5;v.slots=v.slots.map(n=>(n+shift)%6);v.sequence++}return}
 v.remaining-=dt
 if(v.remaining<=0){v.phase=2+((seed+v.sequence*17)%200)/100;v.remaining=45+((seed+v.sequence*7919)>>>0)%46}
}
export function updateBntg(eng:Engine,dt:number){
 if(eng.paused)dt=0
 const s=migrateBntg(eng),p=eng.career.routes.bntg,mp=eng.mpSession
 const active=(hasVaultMission(eng)||!!p?.active&&p.task===4)&&eng.player.level===102
 if(mp?.started){
  if(mp.isHost){
   const any=active||[...mp.remotes.values()].some(r=>r.s?.level===102&&r.s?.bntgCounting)
   if(any)advanceVault(s.vault,dt,eng.seed)
   mp.tradeVault=structuredClone(s.vault)
  }else if(mp.tradeVault)s.vault=structuredClone(mp.tradeVault)
 }else if(active)advanceVault(s.vault,dt,eng.seed)
 if(eng.player.level===102)for(const box of eng.map?.structures.filter(s=>s.kind==='trade_anomaly'&&s.data?.cargoId!==undefined)??[]){
  const i=Number(box.data?.cargoId),pos=VAULT_SLOTS[s.vault.slots[i]];box.x=pos.x;box.y=pos.y;box.data!.hidden=s.vault.phase>0||!(hasVaultMission(eng)||p?.active&&[3,4].includes(p.task))?1:0
 }
}
