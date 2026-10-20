// 捏人编辑器（主菜单进入）：性别/肤色/发型/发色/上衣（款式+颜色）/裤子（款式+颜色）/表情/眼镜/胡须/鞋子；
// v54b：枚举选项为下拉菜单（发型×16/上衣×8/裤子×6 + 新眼镜/胡须/鞋子）；
// v54c：颜色项恢复直接点选色板（一排色块即点即选，不用下拉）；
// 身高体型不可编辑（与碰撞体积绑定）
import { useRef, useState } from 'react'
import { audio } from '@/game/core/audio'
import {
  loadAvatar, saveAvatar,
  SKIN_OPTIONS, GENDER_NAMES, HAIR_NAMES, HAIR_COLORS,
  TOP_STYLE_NAMES, TOP_OPTIONS, PANTS_STYLE_NAMES, PANTS_OPTIONS, FACE_NAMES,
  GLASSES_NAMES, BEARD_NAMES, SHOE_NAMES,
  type AvatarCfg,
} from '@/game/core/avatar'
import AvatarPreview from './AvatarPreview'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-3 min-w-0">
      <legend className="font-mono2 mb-1 text-[11px]" style={{ color: 'var(--amber)' }}>{label}</legend>
      {children}
    </fieldset>
  )
}

const selectStyle = {
  borderColor: 'var(--panel-edge)', color: 'var(--text)',
  background: 'color-mix(in srgb, var(--panel) 80%, transparent)',
}

// 枚举下拉选择器
function Select({ names, cur, onChange, label }: { names: readonly string[]; cur: number; onChange: (i: number) => void; label: string }) {
  return (
    <select
      className="font-mono2 w-full border px-2 py-1.5 text-[13px]"
      style={selectStyle}
      value={cur}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {names.map((n, i) => <option key={n} value={i}>{n}</option>)}
    </select>
  )
}

// 颜色直接点选色板（一排色块即点即选；当前色高亮描边）
function Swatches({ options, cur, onPick }: { options: readonly string[]; cur: string; onPick: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((c) => (
        <button
          key={c}
          className="border"
          style={{
            width: 26, height: 26, background: c,
            borderColor: c === cur ? 'var(--amber)' : 'var(--panel-edge)',
            boxShadow: c === cur ? '0 0 0 1px var(--amber)' : 'none',
          }}
          onClick={() => onPick(c)}
          aria-label={`选择颜色 ${c}`}
          aria-pressed={c === cur}
        />
      ))}
    </div>
  )
}

export default function AvatarEditor({ onClose }: { onClose: () => void }) {
  const [cfg, setCfg] = useState<AvatarCfg>(() => loadAvatar())
  const cfgRef = useRef(cfg)
  const [tab, setTab] = useState<'head' | 'body'>('head')
  const isMobile = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  const set = (patch: Partial<AvatarCfg>) => {
    const next = { ...cfgRef.current, ...patch }
    cfgRef.current = next
    setCfg(next)
    saveAvatar(next)
    audio.uiTick()
  }
  const tabs: Array<{ id: 'head' | 'body'; label: string }> = [{ id: 'head', label: '头部' }, { id: 'body', label: '身体' }]
  const focusTab = (id: 'head' | 'body') => setTab(id)
  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    const index = tabs.findIndex((item) => item.id === tab)
    const nextIndex = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    const next = tabs[nextIndex]
    setTab(next.id)
    requestAnimationFrame(() => document.getElementById(`avatar-tab-${next.id}`)?.focus())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 max-md:p-0" style={{ background: 'rgba(10,9,8,0.7)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      {/* 移动端：底部弹出面板（同设置面板），高度受限可滚动；桌面：居中小窗 */}
      <div
        className="hud-panel anim-slideUp flex max-h-[92dvh] w-full max-w-[680px] flex-col p-4 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:max-w-none max-md:rounded-t-xl"
        style={{ background: 'var(--panel)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="font-title text-[18px]" style={{ color: 'var(--amber)' }}>形象编辑</span>
          <button className="font-mono2 border px-3 py-1 text-[12px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--text-dim)' }} onClick={onClose}>完成</button>
        </div>
        {/* 内容区整体滚动；移动端横屏保持左右分栏（预览左/选项右），竖屏上下排布 */}
        <div className="mb-3 flex gap-1 border-b" role="tablist" aria-label="形象编辑分类" style={{ borderColor: 'var(--panel-edge)' }}>
          {tabs.map((item) => (
            <button key={item.id} id={`avatar-tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls={`avatar-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1}
              className="font-mono2 border-b-2 px-4 py-1.5 text-[13px]" style={{ color: tab === item.id ? 'var(--amber)' : 'var(--text-dim)', borderColor: tab === item.id ? 'var(--amber)' : 'transparent' }}
              onClick={() => focusTab(item.id)} onKeyDown={onTabKeyDown}>{item.label}</button>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 gap-4 overflow-y-auto max-md:flex-col max-md:landscape:flex-row">
          <div className="flex shrink-0 flex-col items-center max-md:landscape:sticky max-md:landscape:top-0">
            <AvatarPreview avatar={cfg} focus={tab} size={isMobile ? 150 : 200} />
            <div className="font-mono2 mt-1 text-center text-[10px]" style={{ color: 'var(--text-dim)' }}>拖动旋转查看</div>
            <div className="font-mono2 mt-1 text-center text-[10px] max-md:landscape:hidden" style={{ color: 'var(--text-dim)' }}>
              身高与体型固定<br />（与碰撞体积一致，不可编辑）
            </div>
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto">
            <div role="tabpanel" id="avatar-panel-head" aria-labelledby="avatar-tab-head" hidden={tab !== 'head'}>
              <Row label="肤色"><Swatches options={SKIN_OPTIONS} cur={cfg.skin} onPick={(c) => set({ skin: c })} /></Row>
              <Row label="发型"><Select label="发型" names={HAIR_NAMES} cur={cfg.hair} onChange={(i) => set({ hair: i })} /></Row>
              {cfg.hair > 0 && <Row label="发色"><Swatches options={HAIR_COLORS} cur={cfg.hairColor} onPick={(c) => set({ hairColor: c })} /></Row>}
              <Row label="表情"><Select label="表情" names={FACE_NAMES} cur={cfg.face} onChange={(i) => set({ face: i })} /></Row>
              <Row label="眼镜"><Select label="眼镜" names={GLASSES_NAMES} cur={cfg.glasses} onChange={(i) => set({ glasses: i })} /></Row>
              <Row label="胡须"><Select label="胡须" names={BEARD_NAMES} cur={cfg.beard} onChange={(i) => set({ beard: i })} /></Row>
            </div>
            <div role="tabpanel" id="avatar-panel-body" aria-labelledby="avatar-tab-body" hidden={tab !== 'body'}>
              <Row label="性别"><Select label="性别" names={GENDER_NAMES} cur={cfg.gender} onChange={(i) => set({ gender: i })} /></Row>
              <Row label="上衣款式"><Select label="上衣款式" names={TOP_STYLE_NAMES} cur={cfg.topStyle} onChange={(i) => set({ topStyle: i })} /></Row>
              <Row label="上衣颜色"><Swatches options={TOP_OPTIONS} cur={cfg.top} onPick={(c) => set({ top: c })} /></Row>
              <Row label="裤子款式"><Select label="裤子款式" names={PANTS_STYLE_NAMES} cur={cfg.pantsStyle} onChange={(i) => set({ pantsStyle: i })} /></Row>
              <Row label="裤子颜色"><Swatches options={PANTS_OPTIONS} cur={cfg.pants} onPick={(c) => set({ pants: c })} /></Row>
              <Row label="鞋子"><Select label="鞋子" names={SHOE_NAMES} cur={cfg.shoes} onChange={(i) => set({ shoes: i })} /></Row>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
