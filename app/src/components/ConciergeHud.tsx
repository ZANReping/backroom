// [concierge] 看门人（Entity 131）HUD：
//   · 挂眼提示：被他盯上（追踪 / 搭话 / 追逐）时，视野边缘偶尔闪一只橙色横瞳的眼（约 0.4 s，6–14 s 一次；移动端同样显示，不拦触控）。
//   · 挣脱条：被扑倒 / 被捆时的连按进度（沿用猎犬压制条的样式）。
//   · 13 楼：塞进送菜升降梯后的黑屏（拉绳声由 conciergeAI 播放），醒来时淡入。
// 只读 conciergeAI 的查询函数；什么都没有时不渲染。HUD.tsx 里一行接入（// [concierge]）。
import type { Engine } from '@/game/engine'
import { conciergeEyeFlash, conciergeStruggleHud, conciergeBlackout } from '@/game/engine/conciergeAI'
import { houndPinHint, HOUND_PIN_BAR_TOP, HOUND_PIN_BAR_W, HOUND_PIN_TOUCH_GUTTER } from './houndPinHud'

/** 一只山羊眼：杏仁形睑裂、琥珀橙虹膜、横向的黑瞳孔、湿亮高光（viewBox 120×64） */
export function ConciergeEyeSvg({ size = 92, open = 1 }: { size?: number; open?: number }) {
  const h = 26 * Math.max(0.08, Math.min(1, open))
  return (
    <svg width={size} height={size * 64 / 120} viewBox="0 0 120 64" aria-hidden>
      <defs>
        <radialGradient id="cg-iris" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffd36a" />
          <stop offset="55%" stopColor="#f08a1c" />
          <stop offset="92%" stopColor="#9a3c08" />
          <stop offset="100%" stopColor="#2a1004" />
        </radialGradient>
        <clipPath id="cg-lid"><path d={`M6 32 Q60 ${32 - h * 1.25} 114 30 Q60 ${32 + h} 6 32 Z`} /></clipPath>
        <radialGradient id="cg-skin" cx="50%" cy="50%" r="60%">
          <stop offset="60%" stopColor="rgba(20,12,10,0.9)" />
          <stop offset="100%" stopColor="rgba(20,12,10,0)" />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="32" rx="60" ry="32" fill="url(#cg-skin)" />
      <g clipPath="url(#cg-lid)">
        <rect x="0" y="0" width="120" height="64" fill="#e9dcc0" />
        <circle cx="60" cy="31" r="24" fill="url(#cg-iris)" />
        <rect x="38" y="27" width="44" height="8" rx="4" fill="#0b0705" />
        <ellipse cx="68" cy="22" rx="6" ry="3" fill="rgba(255,255,255,0.75)" />
      </g>
      <path d={`M6 32 Q60 ${32 - h * 1.25} 114 30`} stroke="#140b08" strokeWidth="3.2" fill="none" />
      <path d={`M6 32 Q60 ${32 + h} 114 30`} stroke="#140b08" strokeWidth="2" fill="none" />
    </svg>
  )
}

export default function ConciergeHud({ engine, isMobile }: { engine: Engine; isMobile: boolean }) {
  const eye = conciergeEyeFlash(engine)
  const st = conciergeStruggleHud(engine)
  const bo = conciergeBlackout(engine)
  if (!eye && !st && !bo) return null
  const width = isMobile ? `min(${HOUND_PIN_BAR_W}px, calc(100vw - 2 * (max(env(safe-area-inset-left), env(safe-area-inset-right)) + ${HOUND_PIN_TOUCH_GUTTER}px)))` : `${HOUND_PIN_BAR_W}px`
  return (
    <>
      {eye && (
        <div data-concierge-eye={eye.k.toFixed(2)} className="pointer-events-none fixed z-[32]"
          style={{ left: `${eye.x}%`, top: `${eye.y}%`, transform: `translate(-50%, -50%) rotate(${eye.rot}deg)`, opacity: Math.min(1, eye.k * 1.25), filter: 'blur(0.4px) drop-shadow(0 0 10px rgba(255,140,30,0.35))' }}>
          <ConciergeEyeSvg size={isMobile ? 70 : 92} open={Math.min(1, eye.k * 1.6)} />
        </div>
      )}
      {st && (
        <div data-concierge-struggle={st.progress.toFixed(3)} className="hud-panel pointer-events-none fixed left-1/2 z-[35] -translate-x-1/2 px-3 py-2"
          style={{ top: isMobile ? '64%' : HOUND_PIN_BAR_TOP, width, borderColor: '#b8924a', boxShadow: 'inset 0 0 0 1px rgba(184,146,74,0.35)' }}>
          <div className="mb-1.5 text-center text-[13px] leading-snug" style={{ color: 'var(--text)', textShadow: '0 1px 4px #000' }}>{st.label}{st.left > 0 ? <><br /><span style={{ color: 'var(--text-dim)' }}>{houndPinHint(isMobile)}</span></> : null}</div>
          {st.left > 0 && (
            <div className="hud-bar" style={{ ['--bar-c' as string]: '#d9a441' }}>
              <div className="hud-bar-track relative h-[8px] w-full overflow-hidden" role="progressbar" aria-label="挣脱进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={st.progress * 100}>
                <div className="hud-bar-fill h-full" style={{ width: `${(st.progress * 100).toFixed(1)}%`, background: '#d9a441', transition: 'width 0.16s linear' }} />
              </div>
            </div>
          )}
          {st.left > 0 && <div className="font-mono2 mt-1 flex justify-between text-[11px]" style={{ color: 'var(--text-dim)' }}><span>挣脱 {Math.round(st.progress * 100)}%</span><span style={{ color: st.left < 1.2 ? 'var(--amber)' : undefined }}>{st.left.toFixed(1)}s</span></div>}
        </div>
      )}
      {bo && (
        <div data-concierge-black={bo.k.toFixed(2)} className="pointer-events-none fixed inset-0 z-[60] flex items-end justify-center pb-[18vh]" style={{ background: `rgba(0,0,0,${bo.k.toFixed(3)})` }}>
          {bo.phase === 'lift' && bo.k > 0.9 && <div className="text-[13px] tracking-[0.3em]" style={{ color: 'rgba(200,170,120,0.55)', fontFamily: "'Songti SC','SimSun','Noto Serif SC',serif" }}>……吱——嘎……吱——嘎……</div>}
        </div>
      )}
    </>
  )
}
