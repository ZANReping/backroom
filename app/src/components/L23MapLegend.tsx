import {L23_MAP_KEY,L23_MAP_MARKS} from '@/game/content/l23MapKey'

export default function L23MapLegend({level}:{level:2|3}){
 const keys=L23_MAP_KEY[level]
 return <div data-l23-map-legend={level} aria-label={`Level ${level} 地图图例`} className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]" style={{color:'var(--text-dim)'}}>
  {keys.map(k=><span key={k.id} className="flex items-center gap-1" title={k.name}><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><rect width="18" height="12" rx="1" fill={k.color}/><path d={k.path} stroke={k.ink} strokeWidth="1.1" fill="none"/></svg>{k.name}</span>)}
  {L23_MAP_MARKS.map(k=><span key={k.id} className="flex items-center gap-1" title={k.name}><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><path d={k.path} stroke={k.color} strokeWidth="1.2" fill="none"/></svg>{k.name}</span>)}
 </div>
}
