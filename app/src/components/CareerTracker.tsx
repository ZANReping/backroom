import { useEffect,useState } from 'react'
import { engine } from '@/game/engine'
import { CAREERS,CAREER_IDS } from '@/game/content/careers'
import { recordField } from '@/game/engine/career'
export default function CareerTracker(){
 const [,refresh]=useState(0)
 useEffect(()=>{const timer=setInterval(()=>refresh(n=>n+1),400);return()=>clearInterval(timer)},[])
 const active=CAREER_IDS.filter(id=>engine.career.routes[id]?.active)
 if(!active.length)return null
 return <aside className="absolute left-3 top-28 max-w-[300px] bg-black/70 p-2 text-xs text-white pointer-events-auto">
 {active.map(id=>{const p=engine.career.routes[id]!,d=CAREERS[id],ch=d.chapters[Math.floor(p.task/3)],point=p.points[p.field],inf=engine.map?.inf
 const dist=point?Math.hypot(point.x-engine.player.x-(inf?.ox??0),point.y-engine.player.y-(inf?.oy??0)):Infinity
 return <div key={id} className="mb-2"><strong>{d.name} · {ch.tasks[p.task%3]}</strong>
 {p.task%3===1&&p.field<3?<p>现场：Level {ch.level} · {p.field}/3{point&&engine.player.level===point.level?` · ${Math.round(dist)}m（${point.x.toFixed(0)}, ${point.y.toFixed(0)}）`:''}</p>:<p>返回据点对应房间工作台核验</p>}
 {point&&dist<3&&point.level===engine.player.level&&<button className="menu-btn" onClick={()=>{recordField(engine,id);refresh(n=>n+1)}}>记录现场证据</button>}
 </div>})}</aside>
}
