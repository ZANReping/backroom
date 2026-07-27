// 捏人编辑器（主菜单进入）：肤色/发型/发色/上衣/裤子；身高体型不可编辑（与碰撞体积绑定）
import { useState } from 'react'
import { audio } from '@/game/audio'
import {
  loadAvatar, saveAvatar,
  SKIN_OPTIONS, HAIR_NAMES, HAIR_COLORS, TOP_OPTIONS, PANTS_OPTIONS,
  type AvatarCfg,
} from '@/game/avatar'
import AvatarPreview from './AvatarPreview'

function Swatches({ options, cur, onPick }: { options: string[]; cur: string; onPick: (c: string) => void }) {
  return (
    <div className="flex gap-1.5">
      {options.map((c) => (
        <button
          key={c}
          className="border"
          style={{
            width: 26, height: 26, background: c,
            borderColor: cur === c ? 'var(--amber)' : 'var(--panel-edge)',
            boxShadow: cur === c ? '0 0 6px rgba(232,185,60,0.6)' : 'none',
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

export default function AvatarEditor({ onClose }: { onClose: () => void }) {
  const [cfg, setCfg] = useState<AvatarCfg>(() => loadAvatar())
  const set = (patch: Partial<AvatarCfg>) => {
    const next = { ...cfg, ...patch }
    setCfg(next)
    saveAvatar(next)
    audio.uiTick()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: 'rgba(10,9,8,0.7)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="hud-panel anim-slideUp w-full max-w-[520px] p-4" style={{ background: 'var(--panel)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="font-title text-[18px]" style={{ color: 'var(--amber)' }}>形象编辑</span>
          <button className="font-mono2 border px-3 py-1 text-[12px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--text-dim)' }} onClick={onClose}>完成</button>
        </div>
        <div className="flex gap-4 max-md:flex-col">
          <div className="flex shrink-0 flex-col items-center">
            <AvatarPreview avatar={cfg} size={150} />
            <div className="font-mono2 mt-1 text-center text-[10px]" style={{ color: 'var(--text-dim)' }}>
              身高与体型固定<br />（与碰撞体积一致，不可编辑）
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <Row label="肤色"><Swatches options={SKIN_OPTIONS} cur={cfg.skin} onPick={(c) => set({ skin: c })} /></Row>
            <Row label={`发型：${HAIR_NAMES[cfg.hair]}`}>
              <div className="flex items-center gap-2">
                <button className="menu-btn px-3 py-1" onClick={() => set({ hair: (cfg.hair + HAIR_NAMES.length - 1) % HAIR_NAMES.length })}>←</button>
                <span className="font-mono2 text-[13px]" style={{ color: 'var(--text)' }}>{HAIR_NAMES[cfg.hair]}</span>
                <button className="menu-btn px-3 py-1" onClick={() => set({ hair: (cfg.hair + 1) % HAIR_NAMES.length })}>→</button>
              </div>
            </Row>
            {cfg.hair > 0 && <Row label="发色"><Swatches options={HAIR_COLORS} cur={cfg.hairColor} onPick={(c) => set({ hairColor: c })} /></Row>}
            <Row label="上衣"><Swatches options={TOP_OPTIONS} cur={cfg.top} onPick={(c) => set({ top: c })} /></Row>
            <Row label="裤子"><Swatches options={PANTS_OPTIONS} cur={cfg.pants} onPick={(c) => set({ pants: c })} /></Row>
          </div>
        </div>
      </div>
    </div>
  )
}
