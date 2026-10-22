import { L7_MAP_BANDS } from '@/game/content/l7Map'

export default function L7MapLegend() {
  return <div data-l7-map-legend aria-label="Level 7 等深线与深度带图例" className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]" style={{ color: 'var(--text-dim)' }}>
    {L7_MAP_BANDS.map((b) => <span key={b.id} className="flex items-center gap-1" title={`${b.name}：${b.range}`}>
      <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><rect width="18" height="12" rx="1" fill={b.color} /><path d={b.line} stroke="rgba(255,255,255,.58)" strokeWidth=".7" fill="none" /><path d={b.line} transform="translate(0 3)" stroke="rgba(255,255,255,.32)" strokeWidth=".55" fill="none" /></svg>{b.name} {b.range}
    </span>)}
    <span className="flex items-center gap-1"><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><path d="M1 6h16" stroke="#f4f0c7" strokeWidth="1.4" /></svg>主等深线</span>
    <span className="flex items-center gap-1"><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><path d="M1 6h16" stroke="#f4f0c7" strokeWidth=".7" /></svg>次等深线</span>
    <span className="flex items-center gap-1"><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><rect x="1" y="2" width="16" height="8" rx="1" fill="#7a7e80" /></svg>灰色陆地／舱室</span>
    <span className="flex items-center gap-1"><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><path d="M9 1L16 6 9 11V8H3V4h6z" fill="#e0ad55" /></svg>玩家朝向</span>
    <span className="flex items-center gap-1"><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><circle cx="9" cy="6" r="3" fill="#d9a83f" /></svg>出口／岩洞</span>
    <span className="flex items-center gap-1"><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><rect x="4" y="2" width="10" height="8" fill="none" stroke="#b89456" strokeWidth="1.2" /></svg>容器</span>
    <span className="flex items-center gap-1"><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><circle cx="9" cy="6" r="2" fill="#54b9a6" /></svg>地面物品</span>
    <small className="col-span-2 leading-tight">数字为海床水深（米）；深度带按海床最深处划分，与当前下潜深度无关。</small>
  </div>
}
