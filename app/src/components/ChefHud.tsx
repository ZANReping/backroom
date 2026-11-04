// [chef] 厨师（Entity 800）HUD：字幕（念头「再来一份」暖色斜体 / 征兆白字）、黑屏（被锅砸中、拖走、冷库门关上）、吃饭时屏幕边缘变暖、
// 相机闪光、冷库面板（体温 / 剩余时间 / 扯管子或开铐进度；超时后变成「门外有刀声」）、打烊提示。只读 chefAI.chefHud；什么都没有时不渲染。HUD.tsx 一行接入（// [chef]）。
import type { Engine } from '@/game/engine'
import { chefHud } from '@/game/engine/chefAI'
import { HOUND_PIN_BAR_TOP, HOUND_PIN_BAR_W } from './houndPinHud'
import './Chef.css'

export default function ChefHud({ engine, isMobile }: { engine: Engine; isMobile: boolean }) {
  const v = chefHud(engine)
  if (!v) return null
  const c = v.cuff
  return (
    <>
      {v.warm > 0.01 && <div data-chef-warm={v.warm.toFixed(2)} className="ch-warm" style={{ opacity: v.warm }} />}
      {v.flash > 0.01 && <div data-chef-flash={v.flash.toFixed(2)} className="ch-flash" style={{ opacity: v.flash }} />}
      {c && <div data-chef-cold={(1 - c.temp / 100).toFixed(2)} className="ch-cold" style={{ opacity: Math.min(0.85, (1 - c.temp / 100) * 0.9 + 0.15) }} />}
      {v.veil > 0 && <div data-chef-veil={v.veil.toFixed(2)} className="pointer-events-none fixed inset-0 z-[58]" style={{ background: '#000', opacity: v.veil }} />}
      {v.subs.length > 0 && (
        <div className="ch-subs" data-chef-sub>
          {v.subs.map((s, i) => <div key={i} className={`ch-sub ${s.kind}`}>{s.text}</div>)}
        </div>
      )}
      {c && (
        <div data-chef-cuff={c.knife ? 'knife' : c.tool ? 'key' : 'yank'} className="hud-panel pointer-events-none fixed left-1/2 z-[59] -translate-x-1/2 px-3 py-2"
          style={{ top: isMobile ? '64%' : HOUND_PIN_BAR_TOP, width: isMobile ? 'min(320px, 86vw)' : `${HOUND_PIN_BAR_W}px`, borderColor: '#7fb0c9', boxShadow: 'inset 0 0 0 1px rgba(127,176,201,0.35)' }}>
          <div className="mb-1.5 text-center text-[13px] leading-snug" style={{ color: 'var(--text)', textShadow: '0 1px 4px #000' }}>
            {c.knife ? '门外有刀声……' : c.tool ? `铐在冷库的铁管上——按住【特殊】${c.tool === 'skeleton' ? '用万能钥匙开锁' : '用撬棍撬开手铐'}` : '铐在冷库的铁管上——连按挣扎，把铁管扯下来（会响）'}
          </div>
          {!c.knife && (
            <div className="hud-bar" style={{ ['--bar-c' as string]: '#7fb0c9' }}>
              <div className="hud-bar-track relative h-[8px] w-full overflow-hidden" role="progressbar" aria-label="脱身进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={(c.tool ? c.key : c.yank) * 100}>
                <div className="hud-bar-fill h-full" style={{ width: `${((c.tool ? c.key : c.yank) * 100).toFixed(1)}%`, background: '#9fd0e8', transition: 'width 0.12s linear' }} />
              </div>
            </div>
          )}
          <div className="font-mono2 mt-1 flex justify-between text-[11px]" style={{ color: 'var(--text-dim)' }}>
            <span style={{ color: c.temp < 35 ? '#e06a5a' : undefined }}>体温 {Math.round(c.temp)}%</span>
            {!c.knife && <span style={{ color: c.left < 15 ? 'var(--amber)' : undefined }}>他回来之前 {Math.ceil(c.left)}s</span>}
          </div>
        </div>
      )}
      {v.closed && !c && <div data-chef-closed className="ch-closed">餐厅已打烊</div>}
    </>
  )
}
