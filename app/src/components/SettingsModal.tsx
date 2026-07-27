// 设置面板（标题/暂停共用）
import { useEffect, useState } from 'react'
import { audio } from '@/game/audio'
import type { Difficulty } from '@/game/engine'
import { BIND_ACTIONS, bindLabel, conflictOf, actionLabel, getKeybinds, setKeybind, resetKeybinds } from '@/game/keybinds'

export interface GameSettings {
  difficulty: Difficulty
  autoSprint: boolean
  grain: boolean
  shake: boolean
  flicker: number // 0-100
  dynamicRes: boolean
  volume: number
  ambient: number
  sfx: number
  muted: boolean
  leftHanded: boolean
  stickSize: number
  btnOpacity: number
  sensitivity: number // 视角灵敏度 0.2–3.0 倍
  devMode: boolean // 开发者模式：无敌 + 层级跳转面板
}

export const defaultSettings: GameSettings = {
  difficulty: 'normal', autoSprint: false,
  grain: true, shake: true, flicker: 70, dynamicRes: true,
  volume: 80, ambient: 50, sfx: 90, muted: false,
  leftHanded: false, stickSize: 120, btnOpacity: 70,
  sensitivity: 1.0, devMode: false,
}

const TABS = ['游戏', '画面', '音频', '操作'] as const

export default function SettingsModal({ settings, onChange, onClose, onOpenLayoutEditor }: { settings: GameSettings; onChange: (s: GameSettings) => void; onClose: () => void; onOpenLayoutEditor?: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('游戏')
  const isMobile = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window)
  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => {
    const ns = { ...settings, [k]: v }
    onChange(ns)
    if (k === 'muted') audio.setMuted(v as boolean)
    if (k === 'volume') audio.setVolume((v as number) / 100)
  }

  const Toggle = ({ k, label }: { k: keyof GameSettings; label: string }) => (
    <label className="flex items-center justify-between py-2 text-[14px]" style={{ color: 'var(--text)' }}>
      <span>{label}</span>
      <button
        className="h-6 w-11 rounded-full border transition-colors"
        style={{ borderColor: 'var(--panel-edge)', background: settings[k] ? 'var(--amber)' : 'var(--panel)' }}
        onClick={() => set(k, !settings[k] as GameSettings[typeof k])}
      >
        <span className="block h-4 w-4 rounded-full bg-black/60 transition-transform" style={{ transform: settings[k] ? 'translateX(24px)' : 'translateX(4px)' }} />
      </button>
    </label>
  )

  const Slider = ({ k, label }: { k: keyof GameSettings; label: string }) => (
    <label className="block py-2 text-[14px]" style={{ color: 'var(--text)' }}>
      <span className="mb-1 flex justify-between"><span>{label}</span><span className="font-mono2 text-[12px]" style={{ color: 'var(--amber)' }}>{settings[k] as number}</span></span>
      <input
        type="range" min={0} max={100} value={settings[k] as number}
        onChange={(e) => set(k, Number(e.target.value) as GameSettings[typeof k])}
        className="w-full accent-[#e8b93c]"
      />
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="hud-panel anim-slideUp w-full max-w-[520px] p-5 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:max-w-none max-md:rounded-t-xl"
        style={{ background: 'var(--panel)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-title text-[22px]" style={{ color: 'var(--amber)' }}>设置</h2>
          <button className="font-mono2 px-3 py-1 text-[13px] border" style={{ borderColor: 'var(--panel-edge)', color: 'var(--text-dim)' }} onClick={onClose}>关闭</button>
        </div>
        <div className="mb-3 flex gap-4 border-b" style={{ borderColor: 'var(--panel-edge)' }}>
          {TABS.map((t) => (
            <button
              key={t}
              className="pb-2 text-[14px]"
              style={{ color: tab === t ? 'var(--amber)' : 'var(--text-dim)', borderBottom: tab === t ? '2px solid var(--amber)' : '2px solid transparent' }}
              onClick={() => { setTab(t); audio.uiTick() }}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="max-h-[50dvh] overflow-y-auto pr-1">
          {tab === '游戏' && (
            <div>
              <div className="py-2 text-[14px]" style={{ color: 'var(--text)' }}>难度</div>
              <div className="flex gap-2">
                {([['easy', '轻松'], ['normal', '标准'], ['hard', '硬核']] as const).map(([v, l]) => (
                  <button
                    key={v}
                    className="flex-1 border px-3 py-2 text-[14px]"
                    style={{ borderColor: settings.difficulty === v ? 'var(--amber)' : 'var(--panel-edge)', color: settings.difficulty === v ? 'var(--amber)' : 'var(--text-dim)', background: 'var(--panel)' }}
                    onClick={() => set('difficulty', v)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <Toggle k="autoSprint" label="自动冲刺" />
              <div className="py-2 text-[13px]" style={{ color: 'var(--text-dim)' }}>语言：简体中文（固定）</div>
              <div className="mt-4 border-t pt-2" style={{ borderColor: 'var(--panel-edge)' }}>
                <Toggle k="devMode" label="开发者模式（调试面板）" />
                {settings.devMode && (
                  <div className="font-mono2 text-[11px]" style={{ color: 'var(--blood)' }}>
                    已开启：游戏中无敌，HUD 左下角显示开发者面板（召唤实体 / 给予物品 / 状态控制 / 传送 / 世界工具 / 调试信息），画面带「开发者模式」水印。
                  </div>
                )}
              </div>
            </div>
          )}
          {tab === '画面' && (
            <div>
              <Toggle k="grain" label="VHS 颗粒" />
              <Toggle k="shake" label="屏幕震动" />
              <Slider k="flicker" label="灯光闪烁强度" />
              <Toggle k="dynamicRes" label="动态分辨率" />
            </div>
          )}
          {tab === '音频' && (
            <div>
              <Toggle k="muted" label="静音" />
              <Slider k="volume" label="主音量" />
              <Slider k="ambient" label="环境音" />
              <Slider k="sfx" label="音效" />
            </div>
          )}
          {tab === '操作' && (
            <div className="font-mono2 text-[12px] leading-7" style={{ color: 'var(--text)' }}>
              <label className="mb-2 block text-[14px]">
                <span className="mb-1 flex justify-between"><span>视角灵敏度</span><span className="font-mono2 text-[12px]" style={{ color: 'var(--amber)' }}>{settings.sensitivity.toFixed(1)}×</span></span>
                <input
                  type="range" min={20} max={300} step={10} value={Math.round(settings.sensitivity * 100)}
                  onChange={(e) => set('sensitivity', Number(e.target.value) / 100)}
                  className="w-full accent-[#e8b93c]"
                />
                <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>同时作用于桌面鼠标与移动端拖动转视角（0.2× – 3.0×）</span>
              </label>
              {!isMobile && <KeybindSection />}
              <div className="mb-1 mt-3 text-[13px]" style={{ color: 'var(--amber)' }}>移动端</div>
              <Toggle k="leftHanded" label="左撇子镜像布局" />
              <Slider k="stickSize" label="摇杆大小" />
              <Slider k="btnOpacity" label="按钮透明度" />
              {onOpenLayoutEditor && (
                <div className="mt-2">
                  <button
                    className="w-full border px-3 py-2 text-[14px]"
                    style={{ borderColor: 'var(--amber)', color: 'var(--amber)', background: 'var(--panel)' }}
                    onClick={() => { audio.uiTick(); onOpenLayoutEditor() }}
                  >
                    自定义按键布局
                  </button>
                  <div className="mt-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
                    拖动调整摇杆与按钮位置，双指缩放大小；竖屏 / 横屏分别保存。
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// v18：PC 键位绑定区（仅桌面端渲染；触屏设备不挂载本组件）
function KeybindSection() {
  const [binds, setBinds] = useState(() => ({ ...getKeybinds() }))
  const [listening, setListening] = useState<string | null>(null) // 正在捕获的动作 id
  const [conflictMsg, setConflictMsg] = useState('')

  // 捕获态：按任意键/鼠标键/滚轮完成绑定（Esc 取消）
  useEffect(() => {
    if (!listening) return
    const finish = (code: string) => {
      if (code === 'Escape') { setListening(null); setConflictMsg(''); return }
      const other = conflictOf(listening, code)
      if (other) {
        setConflictMsg(`「${bindLabel(code)}」已绑定给「${actionLabel(other)}」——请先改绑它。`)
      } else {
        setKeybind(listening, code)
        setBinds({ ...getKeybinds() })
        setConflictMsg('')
        audio.uiTick()
      }
      setListening(null)
    }
    const kd = (e: KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); finish(e.code) }
    const md = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); finish(`Mouse${e.button}`) }
    const wh = (e: WheelEvent) => { e.preventDefault(); e.stopPropagation(); finish(e.deltaY < 0 ? 'WheelUp' : 'WheelDown') }
    window.addEventListener('keydown', kd, true)
    window.addEventListener('mousedown', md, true)
    window.addEventListener('wheel', wh, { capture: true, passive: false })
    return () => {
      window.removeEventListener('keydown', kd, true)
      window.removeEventListener('mousedown', md, true)
      window.removeEventListener('wheel', wh, true)
    }
  }, [listening])

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[13px]" style={{ color: 'var(--amber)' }}>键位绑定（PC）</div>
        <button
          className="border px-2 py-0.5 text-[11px]"
          style={{ borderColor: 'var(--panel-edge)', color: 'var(--text-dim)' }}
          onClick={() => { resetKeybinds(); setBinds({ ...getKeybinds() }); setConflictMsg(''); audio.uiTick() }}
        >
          恢复默认
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-4">
        {BIND_ACTIONS.map((a) => (
          <div key={a.id} className="flex items-center justify-between py-0.5">
            <span style={{ color: 'var(--text)' }}>{a.label}</span>
            <button
              className="min-w-[64px] border px-2 py-0.5 text-[11px]"
              style={{
                borderColor: listening === a.id ? 'var(--amber)' : 'var(--panel-edge)',
                color: listening === a.id ? 'var(--amber)' : 'var(--text-dim)',
                background: listening === a.id ? 'rgba(232,185,60,0.12)' : 'var(--panel)',
              }}
              onClick={() => { setListening(listening === a.id ? null : a.id); setConflictMsg(''); audio.uiTick() }}
            >
              {listening === a.id ? '按任意键…' : bindLabel(binds[a.id])}
            </button>
          </div>
        ))}
      </div>
      {conflictMsg && <div className="mt-1 text-[11px]" style={{ color: 'var(--blood)' }}>{conflictMsg}</div>}
      <div className="mt-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
        点击绑定框后按下新按键（支持键盘 / 鼠标键 / 滚轮），Esc 取消。方向键移动、Ctrl 蹲伏、Tab 背包为固定辅助键。
      </div>
    </div>
  )
}
