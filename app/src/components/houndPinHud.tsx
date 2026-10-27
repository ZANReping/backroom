// 猎犬（Entity 8）阶段 3.1：扑倒压制的挣脱进度条。
// 只读 houndPinOverlay，没被压住时不渲染任何东西（挣脱 / 松口 / 被救后自动隐藏）。HUD.tsx 里一行接入（// [hound]）。
// 风格沿用 HUD 状态条（hud-panel + hud-bar-track / hud-bar-fill，--bar-c = var(--blood)），
// 填充宽度用 CSS 过渡平滑衰减；移动端宽度让开右下（左手模式左下）的「挣脱」情境按钮（TouchControls：64 px，距边 22 px）。
import type { Engine } from '@/game/engine'
import { houndPinOverlay, type HoundPinHud } from '@/game/engine/houndAI'
import { bindLabelFor } from '@/game/core/keybinds'

/** 移动端进度条两侧让出的宽度：安全区 + 按钮边距 22 + 按钮 64 + 间隙 14（两侧对称，保持居中） */
export const HOUND_PIN_TOUCH_GUTTER = 22 + 64 + 14
export const HOUND_PIN_BAR_W = 260
/** 面板顶边：压制时脸在画面中上、张开的嘴和牙在中下，面板放到原「特殊交互」提示那一格（76% 处，桌面端该提示压制时不显示，
 *  提示合并进面板），再保证底边离屏幕底 ≥ 120 px，不压到快捷栏和物品名；移动端摇杆 / 按钮在下方，保持 64% */
export const HOUND_PIN_BAR_TOP = 'min(74%, calc(100% - 190px))'

export function houndPinHint(isMobile: boolean) {
  if (isMobile) return '连点「挣脱」/「攻击」挣脱'
  const keys = [...new Set(['interact', 'attack', 'jump', 'special'].map((k) => bindLabelFor(k)).filter((l) => l && l !== '未绑定'))]
  return `连按 ${keys.join(' / ')} 挣脱`
}

export default function HoundPinHud({ engine, isMobile }: { engine: Engine; isMobile: boolean }) {
  const s = houndPinOverlay(engine)
  return s ? <HoundPinBar s={s} isMobile={isMobile} /> : null
}

/** 纯展示（预览页 proto-hound.html?view=pinhud 直接喂快照） */
export function HoundPinBar({ s, isMobile }: { s: HoundPinHud; isMobile: boolean }) {
  const pct = (s.progress * 100).toFixed(1)
  const width = isMobile
    ? `min(${HOUND_PIN_BAR_W}px, calc(100vw - 2 * (max(env(safe-area-inset-left), env(safe-area-inset-right)) + ${HOUND_PIN_TOUCH_GUTTER}px)))`
    : `${HOUND_PIN_BAR_W}px`
  return (
    <>
      {/* 被咬红闪：边缘血色暗角，咬下那一刻最亮 */}
      <div data-hound-bite={s.bite.toFixed(2)} className="pointer-events-none fixed inset-0 z-[31]"
        style={{ boxShadow: `inset 0 0 160px 60px rgba(150,20,14,${(0.18 + 0.5 * s.bite).toFixed(3)})`, background: s.bite > 0 ? `rgba(120,8,4,${(0.16 * s.bite).toFixed(3)})` : undefined }} />
      <div data-hound-pin={s.progress.toFixed(3)} className="hud-panel pointer-events-none fixed left-1/2 z-[35] -translate-x-1/2 px-3 py-2"
        style={{ top: isMobile ? '64%' : HOUND_PIN_BAR_TOP, width, boxShadow: s.bite > 0 ? `0 0 ${(14 * s.bite).toFixed(1)}px rgba(212,84,74,${(0.85 * s.bite).toFixed(2)})` : undefined, borderColor: s.bite > 0.05 ? 'var(--blood)' : undefined }}>
        <div className="mb-1.5 text-center text-[13px] leading-snug" style={{ color: 'var(--text)', textShadow: '0 1px 4px #000' }}>{houndPinHint(isMobile)}</div>
        <div className="hud-bar" style={{ ['--bar-c' as string]: 'var(--blood)' }}>
          <div className="hud-bar-track relative h-[8px] w-full overflow-hidden" role="progressbar" aria-label="挣脱进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.progress * 100}>
            <div className="hud-bar-fill h-full" style={{ width: `${pct}%`, background: s.bite > 0.05 ? '#ff6a5c' : 'var(--blood)', transition: 'width 0.16s linear, background-color 0.2s ease' }} />
          </div>
        </div>
        <div className="font-mono2 mt-1 flex justify-between text-[11px]" style={{ color: 'var(--text-dim)' }}>
          <span>挣脱 {Math.round(s.progress * 100)}%{s.flash ? <span style={{ color: 'var(--amber)' }}> · 手电照脸</span> : null}</span>
          <span data-hound-pin-left={s.left.toFixed(1)} style={{ color: s.left < 2 ? 'var(--amber)' : undefined }}>压制 {s.left.toFixed(1)}s</span>
        </div>
      </div>
    </>
  )
}
