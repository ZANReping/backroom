import {useEffect,useState} from 'react'
import {engine} from '@/game/engine'
import {CAREERS} from '@/game/content/careers'
import type {CareerId} from '@/game/content/settlementTypes'
import {availableStation,WORK_STEPS,workStep,requestRecovery,deployStabilizer,route} from '@/game/engine/career'
import {MegCareerPanel} from './MegMissions'
import {FactionCareerPanel,FactionStationTasks} from './FactionMissions'
import {isNewFaction,isEnhancedFaction} from '@/game/content/factionTerminals'
export default function FacilityPanel({faction,onClose}:{faction:string;onClose:()=>void}){
 const [,refresh]=useState(0),[note,setNote]=useState(''),id=faction as CareerId
 useEffect(()=>engine.on(e=>{if(e.kind==='msg')refresh(n=>n+1)}),[])
 if(!(id in CAREERS))return null
 const p=route(engine,id),a=(label:string,fn:()=>unknown)=><button className="menu-btn px-3 py-2 text-left" onClick={()=>{const r=fn();if(typeof r==='string')setNote(r);refresh(x=>x+1)}}>{label}</button>
 return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"><section className="hud-panel max-h-[85vh] w-[min(620px,95vw)] overflow-auto p-5">
 <h2>{CAREERS[id].name} · 现场业务</h2><div className="my-3 flex flex-col gap-2">
 {id==='meg'?<MegCareerPanel/>:isNewFaction(id)?<><FactionStationTasks faction={id}/><FactionCareerPanel faction={id}/></>:p.active&&p.task%3!==2?WORK_STEPS[id].map((s,i)=><div key={s}>{a(s,()=>workStep(engine,id,i))}</div>):null}
 {availableStation(engine,'care',id)&&<>{a('免费基础诊疗',()=>requestRecovery(engine,'care'))}{a('自愿隔离恢复',()=>requestRecovery(engine,'isolation'))}</>}
 {['ariane','tom'].includes(id)&&a('请求自愿脱离教化帮助',()=>requestRecovery(engine,'help'))}
 {availableStation(engine,'testimony',id)&&a('核验外界证言',()=>requestRecovery(engine,'testimony'))}
 {availableStation(engine,'hearing',id)&&a('启动听证与申诉',()=>requestRecovery(engine,'hearing'))}
 {id==='brc'&&a('启动工位稳定设备',()=>deployStabilizer(engine)?'已提交部署。':'需要三级资格与授权工位。')}
 {isEnhancedFaction(id)&&a('查看团体履历与成长任务',()=>{engine.emit({kind:'faction',text:id})})}
 </div>{note&&<p role="status">{note}</p>}<button className="menu-btn mt-4 px-3 py-2" onClick={onClose}>返回游戏</button>
 </section></div>
}
