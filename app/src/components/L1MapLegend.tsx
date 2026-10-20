import {L1_MAP_KEY,L1_MAP_MARKS} from '@/game/content/l1Map'

export default function L1MapLegend(){
 return <div data-l1-map-legend aria-label="Level 1 地图图例" className="grid grid-cols-3 gap-x-3 gap-y-1 text-[10px]" style={{color:'var(--text-dim)'}}>
  {L1_MAP_KEY.map(k=><span key={k.id} className="flex items-center gap-1" title={k.name}><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><rect width="18" height="12" rx="1" fill={k.color}/><path d={k.path} stroke={k.ink} strokeWidth="1.1" fill="none"/></svg>{k.name}</span>)}
  {L1_MAP_MARKS.map(k=><span key={k.id} className="flex items-center gap-1" title={k.name}><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><path d={k.path} stroke={k.color} strokeWidth="1.2" fill={['player','item','npc','exit','landmark','wall','sight'].includes(k.id)?k.color:'none'} fillOpacity={k.id==='sight'?.25:1}/>{k.id==='container'?<><path d="M2 3H8V9H2Z" fill="#c9a03a"/><path d="M11 3H17V9H11Z" fill="#c9a03a" opacity=".3"/></>:null}</svg>{k.name}</span>)}
 </div>
}
