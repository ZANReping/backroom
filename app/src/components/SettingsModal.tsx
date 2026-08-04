// 设置面板（标题/暂停共用）
import { useEffect, useState } from 'react'
import { audio } from '@/game/audio'
import type { Difficulty } from '@/game/engine'
import { BIND_ACTIONS, bindLabel, conflictOf, actionLabel, getKeybinds, setKeybind, resetKeybinds } from '@/game/keybinds'

export interface GameSettings {
  difficulty: Difficulty
  autoSprint: boolean
  grain: boolean
  dust: boolean // 漂浮尘埃粒子（默认关闭）
  shake: boolean
  flicker: number // 0-100
  dynamicRes: boolean
  shadows: boolean // 手电实时阴影（移动端强制关闭）
  fogOfWar: boolean // 战争迷雾（距离雾）：关闭后远处不再被雾遮蔽
  fogScale: number // 距离雾远近（%：50=更近更浓 … 100=默认 … 200=更远更淡）
  farLights: boolean // 远处灯光全开（默认关闭=灯光点亮距离与雾可视距离一致；开启后灯光池 48→96 全场景点亮，性能开销略增）
  volume: number
  ambient: number
  sfx: number
  muted: boolean
  leftHanded: boolean
  stickSize: number
  btnOpacity: number
  sensitivity: number // 视角灵敏度 0.2–3.0 倍
  devMode: boolean // 开发者模式：无敌 + 层级跳转面板
  llmEndpoint: string // LLM API 端点（OpenAI 兼容，如 https://api.openai.com/v1；空=未接入）
  llmApiKey: string // API 密钥（明文存本机 localStorage）
  llmModel: string // 模型名（如 gpt-4o-mini）
}

export const defaultSettings: GameSettings = {
  difficulty: 'normal', autoSprint: false,
  grain: true, dust: false, shake: true, flicker: 70, dynamicRes: true, shadows: true, fogOfWar: true,
  fogScale: 100, farLights: false,
  volume: 80, ambient: 50, sfx: 90, muted: false,
  leftHanded: false, stickSize: 120, btnOpacity: 70,
  sensitivity: 1.0, devMode: false,
  llmEndpoint: '', llmApiKey: '', llmModel: '',
}

const TABS = ['游戏', '画面', '音频', '操作', 'API'] as const

// 开关/滑块必须定义在组件外——组件内定义会在每次父渲染时生成新组件类型，React 因此反复
// 卸载重挂按钮；本游戏 HUD 每 0.12s 一跳，按钮常在 mousedown 与 mouseup 之间被销毁，
// click 事件无法完成（用户体感「开关经常要点好几下」）。
// （另注：不能用 <label> 包裹 <button>——浏览器会把点击转发给 label 的控件再触发一次。）
function Toggle({ k, label, value, onSet }: { k: keyof GameSettings; label: string; value: boolean; onSet: (k: keyof GameSettings, v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2 text-[14px]" style={{ color: 'var(--text)' }}>
      <span>{label}</span>
      <button
        className="h-6 w-11 rounded-full border transition-colors"
        style={{ borderColor: 'var(--panel-edge)', background: value ? 'var(--amber)' : 'var(--panel)' }}
        onClick={() => onSet(k, !value)}
      >
        <span className="block h-4 w-4 rounded-full bg-black/60 transition-transform" style={{ transform: value ? 'translateX(24px)' : 'translateX(4px)' }} />
      </button>
    </div>
  )
}

function Slider({ k, label, value, onSet }: { k: keyof GameSettings; label: string; value: number; onSet: (k: keyof GameSettings, v: number) => void }) {
  return (
    <label className="block py-2 text-[14px]" style={{ color: 'var(--text)' }}>
      <span className="mb-1 flex justify-between"><span>{label}</span><span className="font-mono2 text-[12px]" style={{ color: 'var(--amber)' }}>{value}</span></span>
      <input
        type="range" min={0} max={100} value={value}
        onChange={(e) => onSet(k, Number(e.target.value))}
        className="w-full accent-[#e8b93c]"
      />
    </label>
  )
}

export default function SettingsModal({ settings, onChange, onClose, onOpenLayoutEditor }: { settings: GameSettings; onChange: (s: GameSettings) => void; onClose: () => void; onOpenLayoutEditor?: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('游戏')
  const isMobile = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window)
  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => {
    const ns = { ...settings, [k]: v }
    onChange(ns)
    if (k === 'muted') audio.setMuted(v as boolean)
    if (k === 'volume') audio.setVolume((v as number) / 100)
  }

  const setBool = (k: keyof GameSettings, v: boolean) => set(k, v as GameSettings[typeof k])
  const setNum = (k: keyof GameSettings, v: number) => set(k, v as GameSettings[typeof k])

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
              <Toggle k="autoSprint" label="自动冲刺" value={settings.autoSprint as boolean} onSet={setBool} />
              <div className="py-2 text-[13px]" style={{ color: 'var(--text-dim)' }}>语言：简体中文（固定）</div>
              <div className="mt-4 border-t pt-2" style={{ borderColor: 'var(--panel-edge)' }}>
                <Toggle k="devMode" label="开发者模式（调试面板）" value={settings.devMode as boolean} onSet={setBool} />
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
              <Toggle k="grain" label="VHS 颗粒" value={settings.grain as boolean} onSet={setBool} />
              <Toggle k="dust" label="漂浮尘埃粒子" value={settings.dust as boolean} onSet={setBool} />
              <Toggle k="shake" label="屏幕震动" value={settings.shake as boolean} onSet={setBool} />
              <Slider k="flicker" label="灯光闪烁强度" value={settings.flicker as number} onSet={setNum} />
              <Toggle k="dynamicRes" label="动态分辨率" value={settings.dynamicRes as boolean} onSet={setBool} />
              <Toggle k="shadows" label="实时阴影（手电）" value={settings.shadows as boolean} onSet={setBool} />
              <Toggle k="fogOfWar" label="战争迷雾（距离雾）" value={settings.fogOfWar as boolean} onSet={setBool} />
              <label className="block py-2 text-[14px]" style={{ color: 'var(--text)' }}>
                <span className="mb-1 flex justify-between"><span>距离雾远近</span><span className="font-mono2 text-[12px]" style={{ color: 'var(--amber)' }}>{settings.fogScale}%</span></span>
                <input
                  type="range" min={50} max={200} step={5} value={settings.fogScale}
                  onChange={(e) => set('fogScale', Number(e.target.value))}
                  className="w-full accent-[#e8b93c]"
                />
                <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>50% = 更近更浓 · 100% = 默认 · 200% = 更远更淡（未开「远处灯光全开」时，灯光点亮距离自动与雾可视距离一致）</span>
              </label>
              <Toggle k="farLights" label="远处灯光全开（性能开销略增）" value={settings.farLights as boolean} onSet={setBool} />
            </div>
          )}
          {tab === '音频' && (
            <div>
              <Toggle k="muted" label="静音" value={settings.muted as boolean} onSet={setBool} />
              <Slider k="volume" label="主音量" value={settings.volume as number} onSet={setNum} />
              <Slider k="ambient" label="环境音" value={settings.ambient as number} onSet={setNum} />
              <Slider k="sfx" label="音效" value={settings.sfx as number} onSet={setNum} />
            </div>
          )}
          {tab === 'API' && (
            <div>
              <div className="py-2 text-[13px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
                接入 OpenAI 兼容的 LLM 端点后，与人士交谈时可<b style={{ color: 'var(--amber)' }}>自由输入对话</b>（由模型按人士人设生成回复）；不接入则只能使用预制对话。密钥以明文保存在本机浏览器存储中，请知悉。
              </div>
              {([['llmEndpoint', '端点（Base URL）', 'https://api.openai.com/v1', 'text'], ['llmApiKey', 'API 密钥', 'sk-…', 'password'], ['llmModel', '模型', 'gpt-4o-mini', 'text']] as const).map(([k, label, ph, type]) => (
                <label key={k} className="block py-2 text-[14px]" style={{ color: 'var(--text)' }}>
                  <span className="mb-1 block">{label}</span>
                  <input
                    type={type}
                    value={settings[k] as string}
                    placeholder={ph}
                    onChange={(e) => set(k, e.target.value as GameSettings[typeof k])}
                    className="w-full border bg-transparent px-2 py-1.5 font-mono2 text-[12px]"
                    style={{ borderColor: 'var(--panel-edge)', color: 'var(--text)' }}
                  />
                </label>
              ))}
              <div className="font-mono2 text-[11px]" style={{ color: settings.llmEndpoint && settings.llmModel ? 'var(--exit)' : 'var(--text-dim)' }}>
                {settings.llmEndpoint && settings.llmModel ? '● 已接入：人士对话启用自由输入' : '○ 未接入：人士对话使用预制内容'}
              </div>
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
              <Toggle k="leftHanded" label="左撇子镜像布局" value={settings.leftHanded as boolean} onSet={setBool} />
              <Slider k="stickSize" label="摇杆大小" value={settings.stickSize as number} onSet={setNum} />
              <Slider k="btnOpacity" label="按钮透明度" value={settings.btnOpacity as number} onSet={setNum} />
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
