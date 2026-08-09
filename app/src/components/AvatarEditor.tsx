// 捏人编辑器（主菜单进入）：性别/肤色/发型/发色/上衣（款式+颜色）/裤子（款式+颜色）/表情；
// 身高体型不可编辑（与碰撞体积绑定）
import { useState } from 'react'
import { audio } from '@/game/audio'
import {
  loadAvatar, saveAvatar,
  SKIN_OPTIONS, GENDER_NAMES, HAIR_NAMES, HAIR_COLORS,
  TOP_STYLE_NAMES, TOP_OPTIONS, PANTS_STYLE_NAMES, PANTS_OPTIONS, FACE_NAMES,
  type AvatarCfg,
} from '@/game/avatar'
import AvatarPreview from './AvatarPreview'

function Swatches({ options, cur, onPick }: { options: string[]; cur: string; onPick: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((c) => (
        <button
          key={c}
          className="border"
          style={{
            width: 26, height: 26, background: c,
            borderColor: cur === c ? 'var(--amber)' : 'var(--panel-edge)',
            boxShadow: cur === c ? '0 0 6px color-mix(in srgb, var(--amber) 60%, transparent)' : 'none',
          }}
          onClick={() => onPick(c)}
          aria-label={c}
        />
      ))}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="font-mono2 mb-1 text-[11px]" style={{ color: 'var(--amber)' }}>{label}</div>
      {children}
    </div>
  )
}

// 枚举循环选择器（←/→）
function Cycler({ names, cur, onChange }: { names: readonly string[]; cur: number; onChange: (i: number) => void }) {
  const arrow = { borderColor: 'var(--panel-edge)', color: 'var(--text)', background: 'color-mix(in srgb, var(--panel) 80%, transparent)' }
  return (
    <div className="flex items-center gap-2">
      <button className="shrink-0 border px-3 py-1" style={arrow} onClick={() => onChange((cur + names.length - 1) % names.length)}>←</button>
      <span className="font-mono2 whitespace-nowrap text-[13px]" style={{ color: 'var(--text)' }}>{names[cur]}</span>
      <button className="shrink-0 border px-3 py-1" style={arrow} onClick={() => onChange((cur + 1) % names.length)}>→</button>
    </div>
  )
}

export default function AvatarEditor({ onClose }: { onClose: () => void }) {
  const [cfg, setCfg] = useState<AvatarCfg>(() => loadAvatar())
  const isMobile = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window)
  const set = (patch: Partial<AvatarCfg>) => {
    const next = { ...cfg, ...patch }
    setCfg(next)
    saveAvatar(next)
    audio.uiTick()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 max-md:p-0" style={{ background: 'rgba(10,9,8,0.7)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      {/* 移动端：底部弹出面板（同设置面板），高度受限可滚动；桌面：居中小窗 */}
      <div
        className="hud-panel anim-slideUp flex max-h-[92dvh] w-full max-w-[520px] flex-col p-4 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:max-w-none max-md:rounded-t-xl"
        style={{ background: 'var(--panel)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="font-title text-[18px]" style={{ color: 'var(--amber)' }}>形象编辑</span>
          <button className="font-mono2 border px-3 py-1 text-[12px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--text-dim)' }} onClick={onClose}>完成</button>
        </div>
        {/* 内容区整体滚动；移动端横屏保持左右分栏（预览左/选项右），竖屏上下排布 */}
        <div className="flex min-h-0 flex-1 gap-4 overflow-y-auto max-md:flex-col max-md:landscape:flex-row">
          <div className="flex shrink-0 flex-col items-center max-md:landscape:sticky max-md:landscape:top-0">
            <AvatarPreview avatar={cfg} size={isMobile ? 110 : 150} />
            <div className="font-mono2 mt-1 text-center text-[10px] max-md:landscape:hidden" style={{ color: 'var(--text-dim)' }}>
              身高与体型固定<br />（与碰撞体积一致，不可编辑）
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <Row label="性别"><Cycler names={GENDER_NAMES} cur={cfg.gender} onChange={(i) => set({ gender: i })} /></Row>
            <Row label="肤色"><Swatches options={SKIN_OPTIONS} cur={cfg.skin} onPick={(c) => set({ skin: c })} /></Row>
            <Row label="发型"><Cycler names={HAIR_NAMES} cur={cfg.hair} onChange={(i) => set({ hair: i })} /></Row>
            {cfg.hair > 0 && <Row label="发色"><Swatches options={HAIR_COLORS} cur={cfg.hairColor} onPick={(c) => set({ hairColor: c })} /></Row>}
            <Row label="上衣款式"><Cycler names={TOP_STYLE_NAMES} cur={cfg.topStyle} onChange={(i) => set({ topStyle: i })} /></Row>
            <Row label="上衣颜色"><Swatches options={TOP_OPTIONS} cur={cfg.top} onPick={(c) => set({ top: c })} /></Row>
            <Row label="裤子款式"><Cycler names={PANTS_STYLE_NAMES} cur={cfg.pantsStyle} onChange={(i) => set({ pantsStyle: i })} /></Row>
            <Row label="裤子颜色"><Swatches options={PANTS_OPTIONS} cur={cfg.pants} onPick={(c) => set({ pants: c })} /></Row>
            <Row label="表情"><Cycler names={FACE_NAMES} cur={cfg.face} onChange={(i) => set({ face: i })} /></Row>
          </div>
        </div>
      </div>
    </div>
  )
}
