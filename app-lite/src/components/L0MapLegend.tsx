import {L0_MAP_KEY} from '@/game/content/l0Map'

export default function L0MapLegend({compact=false}:{compact?:boolean}){
 return <div data-l0-map-legend className={`grid ${compact?'grid-cols-3 gap-x-1 text-[8px]':'grid-cols-3 gap-x-4 text-[10px]'} gap-y-1`} style={{color:'var(--text-dim)'}}>
  {L0_MAP_KEY.map(k=><span key={k.id} className="flex items-center gap-1" title={k.name}>
   <svg width={compact?12:18} height="12" viewBox="0 0 18 12" aria-hidden="true"><rect width="18" height="12" rx="1" fill={k.color}/><g stroke={k.ink} strokeWidth="1.1" fill="none">
    {k.id===0&&<path d="M2 9H16"/>}{k.id===1&&<><path d="M4 3H7V6H4ZM11 6H14V9H11Z"/></>}
    {k.id===2&&<path d="M2 10L10 2M8 10L16 2"/>}{k.id===3&&<><circle cx="6" cy="4" r=".7"/><circle cx="12" cy="8" r=".7"/></>}
    {k.id===4&&<path d="M5 2H13V10H5Z"/>}{k.id===5&&<path d="M4 10V6A5 5 0 0 1 14 6V10"/>}{k.id===6&&<path d="M2 3H16M2 6H16M2 9H16"/>}
   </g></svg>{k.name}
  </span>)}
 </div>
}
