import {L4_MAP_KEY,L4_MAP_MARKS} from '@/game/content/l4Map'

export default function L4MapLegend(){
 return <div data-l4-map-legend aria-label="Level 4 地图图例" className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]" style={{color:'var(--text-dim)'}}>
  {L4_MAP_KEY.map(k=><span key={k.id} className="flex items-center gap-1" title={k.name}><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><rect width="18" height="12" rx="1" fill={k.color}/><path d={k.path} stroke={k.ink} strokeWidth="1.1" fill="none"/></svg>{k.name}</span>)}
  {L4_MAP_MARKS.map(k=><span key={k.id} className="flex items-center gap-1" title={k.name}><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><path d={k.path} stroke={k.color} strokeWidth="1.2" fill="none"/></svg>{k.name}</span>)}
 </div>
}
