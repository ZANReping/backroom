// 容器战利品面板（三角洲行动式摸金：逐件拿取 / 全部拿取）
import type { Engine } from '@/game/engine'
import { ITEMS } from '@/game/content/items'
import { ItemGlyph } from './HUD'
import { audio } from '@/game/core/audio'
import { bindLabelFor } from '@/game/core/keybinds'

export default function LootPanel({ engine, onClose }: { engine: Engine; onClose: () => void }) {
  const lp = engine.lootPanel
  if (!lp) return null
  const isMobile = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window)
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-end justify-center pb-24" onClick={onClose}>
      <div
        className="hud-panel anim-lootPop pointer-events-auto w-[300px] p-3"
        style={{ background: 'var(--panel)', boxShadow: '0 0 30px rgba(0,0,0,0.8)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="font-title text-[15px]" style={{ color: 'var(--amber)' }}>{lp.label}</span>
          <div className="flex gap-2">
            {lp.items.length > 0 && (
              <button
                className="font-mono2 border px-2 py-0.5 text-[11px]"
                style={{ borderColor: 'var(--amber)', color: 'var(--amber)' }}
                onClick={() => { engine.takeAllLoot(); audio.uiTick() }}
              >
                全部拿取
              </button>
            )}
            <button className="font-mono2 border px-2 py-0.5 text-[11px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--text-dim)' }} onClick={onClose}>离开</button>
          </div>
        </div>
        {!isMobile && (
          <div className="font-mono2 mb-2 text-[10px]" style={{ color: 'var(--text-dim)' }}>
            {lp.items.length > 0
              ? <>[{bindLabelFor('interact')}] 全部拿取　[Esc] 离开　未拿完的物品会留在容器里</>
              : <>[{bindLabelFor('interact')}] 或 [Esc] 关闭（v20：拿空后 {bindLabelFor('interact')}=关闭）</>}
          </div>
        )}
        {lp.items.length === 0 ? (
          <div className="font-mono2 py-4 text-center text-[12px]" style={{ color: 'var(--text-dim)' }}>—— 已经搜空了 ——</div>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {lp.items.map((type, i) => (
              <button
                key={`${type}-${i}`}
                className="anim-lootPop relative flex h-[64px] flex-col items-center justify-center gap-1 border active:scale-95"
                style={{ borderColor: 'var(--panel-edge)', background: 'rgba(0,0,0,0.35)', animationDelay: `${i * 0.05}s` }}
                onClick={() => engine.takeLoot(i)}
              >
                <ItemGlyph type={type} size={26} />
                <span className="text-[9px] leading-tight" style={{ color: 'var(--text-dim)' }}>{ITEMS[type]?.name ?? type}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
