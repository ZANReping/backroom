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
        className="loot-panel hud-panel anim-lootPop pointer-events-auto w-[320px] p-3"
        style={{ background: 'var(--panel)', boxShadow: '0 0 30px rgba(0,0,0,0.8)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="flex flex-col">
            <span className="loot-kicker font-mono2">搜索容器 · {lp.items.length} 件</span>
            <span className="font-title text-[16px]" style={{ color: 'var(--amber)' }}>{lp.label}</span>
          </span>
          <div className="flex gap-2">
            {lp.items.length > 0 && (
              <button
                className="loot-take font-mono2 border px-2 py-1 text-[11px]"
                onClick={() => { engine.takeAllLoot(); audio.uiTick() }}
              >
                全部拿取
              </button>
            )}
            <button className="loot-leave font-mono2 border px-2 py-1 text-[11px]" onClick={onClose}>离开</button>
          </div>
        </div>
        {!isMobile && (
          <div className="font-mono2 mb-2 text-[10px]" style={{ color: 'var(--text-dim)' }}>
            {lp.items.length > 0
              ? <><kbd className="hud-key">{bindLabelFor('interact')}</kbd> 全部拿取　<kbd className="hud-key">Esc</kbd> 离开　未拿完的会留在容器里</>
              : <><kbd className="hud-key">{bindLabelFor('interact')}</kbd> 或 <kbd className="hud-key">Esc</kbd> 关闭</>}
          </div>
        )}
        {lp.items.length === 0 ? (
          <div className="font-mono2 py-4 text-center text-[12px]" style={{ color: 'var(--text-dim)' }}>—— 已经搜空了 ——</div>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {lp.items.map((type, i) => (
              <button
                key={`${type}-${i}`}
                className="loot-cell wb-slot has-item anim-lootPop relative flex h-[68px] flex-col items-center justify-center gap-1 border active:scale-95"
                style={{ borderColor: 'var(--panel-edge)', animationDelay: `${i * 0.05}s` }}
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
