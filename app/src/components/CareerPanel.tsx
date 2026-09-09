import { useState } from 'react'
import { engine } from '@/game/engine'
import { CAREERS } from '@/game/content/careers'
import type { CareerId } from '@/game/content/settlementTypes'
import { WORK_STEPS,workStep,SERVICE_LABELS,actualRank,availableStation,claimRewards,deployStabilizer,EXAMS,joinCareer,performCareer,requestRecovery,route,startCareer } from '@/game/engine/career'

export default function CareerPanel({faction}:{faction:string}){
 const [,refresh]=useState(0),[note,setNote]=useState('')
 if(!(faction in CAREERS))return null
 const id=faction as CareerId,d=CAREERS[id],p=route(engine,id),ch=d.chapters[Math.floor(p.task/3)],rank=actualRank(engine,id)
 const act=(fn:()=>unknown)=>{const result=fn();if(typeof result==='string')setNote(result);refresh(x=>x+1)}
 const button=(text:string,fn:()=>unknown)=> <button className="menu-btn px-2 py-1 text-left text-[12px]" onClick={()=>act(fn)}>{text}</button>
 const s=engine.map?.structures.find(s=>s.kind==='settlementstation'&&Math.hypot(s.x-engine.player.x,s.y-engine.player.y)<3),services=s?.data?.services as string[]|undefined
 return <section className="mb-3 border p-2 text-[12px]" style={{borderColor:'var(--panel-edge)'}}>
  <strong>{d.name} · {rank?d.ranks[rank-1]:'尚无专业资格'}</strong>
  <p>声望 {engine.rep[id]??0} / 考核 {p.rank}/4 · 可同时加入多个团体</p>
  {ch&&<p>{ch.title}：{ch.tasks[p.task%3]}{p.task%3===1?` · Level ${ch.level} 现场记录 ${p.field}/3`:''}</p>}
  <div className="flex flex-col gap-1 mt-2">
  {!p.joined?button('登记协作身份',()=>joinCareer(engine,id)):p.task<12&&!p.active?button('追踪当前任务（最多三条）',()=>startCareer(engine,id)?'已追踪，请按房间门牌前往工作台。':'已追踪三条，请先暂停一条。'):null}
  {p.active&&button('暂停追踪，保留全部记录',()=>{p.active=false})}
  {p.active&&p.task%3!==2&&<><p>工作台：{SERVICE_LABELS[ch.stations[p.task%3]]} · 工序 {p.work??0}/3</p>{WORK_STEPS[id].map((step,i)=><div key={step}>{button(step,()=>workStep(engine,id,i))}</div>)}</>}
  {p.active&&p.task%3!==2&&button('在当前工作台核验并交付',()=>performCareer(engine,id))}
  {p.active&&p.task%3===2&&<><p>{EXAMS[id].question}</p>{EXAMS[id].options.map((a,i)=><div key={a}>{button(a,()=>performCareer(engine,id,i))}</div>)}</>}
  {!!engine.career.pending.length&&button(`领取待发奖励（${engine.career.pending.reduce((n,q)=>n+q.items.length,0)} 件）`,()=>claimRewards(engine))}
  {services?.includes('care')&&button('免费基础诊疗',()=>requestRecovery(engine,'care'))}
  {['ariane','tom'].includes(id)&&button('请求自愿脱离教化的帮助',()=>requestRecovery(engine,'help'))}
  {services?.includes('testimony')&&button('核验外界证言',()=>requestRecovery(engine,'testimony'))}
  {services?.includes('care')&&button('完成自愿隔离恢复',()=>requestRecovery(engine,'isolation'))}
  {services?.includes('hearing')&&button('启动听证与申诉（无需支付或声望）',()=>requestRecovery(engine,'hearing'))}
  {id==='brc'&&availableStation(engine,'stabilize','brc')&&button('启动现实清新剂（6m / 90 秒）',()=>deployStabilizer(engine)?engine.mpSession?.started?'部署请求已提交，房主核验同层工位后生效。':'工位稳定设备已启动。':'需要三级资格，并在房主当前载入的工位范围内操作。')}
  </div>{note&&<p className="mt-2" role="status">{note}</p>}
 </section>
}

