// 设置面板（标题/暂停共用）
import { useEffect, useState } from 'react'
import { audio } from '@/game/core/audio'
import type { Difficulty } from '@/game/engine'
import { BIND_ACTIONS, bindLabel, conflictOf, actionLabel, getKeybinds, setKeybind, resetKeybinds } from '@/game/core/keybinds'

export type UiTheme = 'amber' | 'liminal' | 'basalt' | 'dark-liminal' | 'greyspace' | 'database' | 'fandom' | 'meg'

export interface GameSettings {
  difficulty: Difficulty
  autoSprint: boolean
  grain: boolean
  vcrFx: boolean // VCR 滤镜（扫描线/色差/噪点/跟踪失真后处理；默认关闭）
  dust: boolean // 漂浮尘埃粒子（默认关闭）
  shake: boolean
  headBob: boolean // v54：真实视角摇晃（垂直起伏+水平侧摆+roll 侧倾+落地回弹；默认关闭=基础 bob）
  flicker: number // 0-100
  dynamicRes: boolean
  shadows: boolean // 手电实时阴影（移动端强制关闭）
  fogOfWar: boolean // 战争迷雾（距离雾）：关闭后远处不再被雾遮蔽
  fogScale: number // 距离雾远近（%：50=更近更浓 … 100=默认 … 200=更远更淡）
  farLights: boolean // 远处灯光全开（默认关闭=灯光点亮距离与雾可视距离一致；开启后灯光池 48→96 全场景点亮，性能开销略增）
  lightMode: 'classic' | 'realistic' // 光影模式：classic=经典（当前版本）/ realistic=真实物理光照（默认 classic，可随时退回）
  shadowQuality: number // 阴影质量 0=低 1=中 2=高（手电/太阳 shadow map 尺寸与软影半径；仅 realistic）
  sunShadows: boolean // 自然光投影（室外太阳/月亮；仅 realistic）
  lightShadows: number // 场景灯投影盏数：0=关，1/2/4 盏最近荧光灯立方体阴影（开销随盏数增加；仅 realistic）
  bloomStrength: number // 泛光程度 0–100（仅 realistic 且泛光开启时生效）
  reflectivity: number // 反射强度 0–100（环境反射/水面反射；仅 realistic）
  bloomFx: boolean // 泛光（辉光后处理；仅 realistic）
  exposure: number // 曝光 %：50–200，100=默认 1.45
  volume: number
  ambient: number // 环境音（荧光灯嗡鸣 / L4 雨声）0-100
  bgm: number // v54：音乐（每层 BGM）0-100
  sfx: number // 音效（攻击/拾取/UI/实体叫声等全部单发）0-100
  muted: boolean
  leftHanded: boolean
  stickSize: number
  btnOpacity: number
  sensitivity: number // 视角灵敏度 0.2–3.0 倍
  devMode: boolean // 开发者模式：无敌 + 层级跳转面板
  theme: UiTheme // 界面主题：amber=经典琥珀 / liminal=阈限（仿 Backrooms 中文维基版式）
  llmEndpoint: string // LLM API 端点（OpenAI 兼容，如 https://api.openai.com/v1；空=未接入）
  llmApiKey: string // API 密钥（明文存本机 localStorage）
  llmModel: string // 模型名（如 gpt-4o-mini）
}

export const defaultSettings: GameSettings = {
  difficulty: 'normal', autoSprint: false,
  grain: true, dust: false, shake: true, headBob: false, flicker: 70, dynamicRes: true, shadows: true, fogOfWar: true,
  vcrFx: false,
  fogScale: 100, farLights: false,
  lightMode: 'classic', shadowQuality: 1, sunShadows: true, lightShadows: 0,
  reflectivity: 60, bloomFx: true, bloomStrength: 35, exposure: 100,
  volume: 80, ambient: 50, bgm: 100, sfx: 90, muted: false,
  leftHanded: false, stickSize: 120, btnOpacity: 70,
  sensitivity: 1.0, devMode: false,
  theme: 'amber',
  llmEndpoint: '', llmApiKey: '', llmModel: '',
}

const TABS = ['游戏', '画面', '音频', '操作', '主题', 'API'] as const

// 主题选项（主题页预览卡的色板取自各主题实际变量值；bg 同时用作 meta theme-color；
// fonts 为该主题实际使用的字体栈，卡片即以这些字体渲染自身预览）
export const THEMES: { id: UiTheme; name: string; desc: string; bg: string; fg: string; dim: string; accent: string; accent2: string; fonts: { title: string; titleWeight: number; body: string; mono: string } }[] = [
  { id: 'amber', name: '经典琥珀', desc: '默认暗色：琥珀荧光、VHS 扫描线、故障抖动', bg: '#14120c', fg: '#d6cfae', dim: '#8a8266', accent: '#e8b93c', accent2: '#3a3423', fonts: { title: "'ZCOOL QingKe HuangYou', 'Noto Sans SC', sans-serif", titleWeight: 400, body: "'Noto Sans SC', system-ui, sans-serif", mono: "'JetBrains Mono', monospace" } },
  { id: 'liminal', name: '阈限', desc: '仿维基版式：纸面底色、灰褐描边、红色强调、衬线等宽字体、点阵背景', bg: '#ede9df', fg: '#191410', dim: '#48453c', accent: '#e61744', accent2: '#8c887e', fonts: { title: "Inter, 'Noto Sans SC', sans-serif", titleWeight: 900, body: "Inter, 'Noto Sans SC', sans-serif", mono: "Recursive, 'Noto Serif SC', 'JetBrains Mono', monospace" } },
  { id: 'basalt', name: '玄武岩', desc: '近白纸面、浅灰分层、绯红点睛，8px 圆角的干净档案排版', bg: '#fcfcfc', fg: '#232326', dim: '#8a8992', accent: '#96182b', accent2: '#d0d0d8', fonts: { title: "'Sofia Sans', Inter, 'Noto Sans SC', sans-serif", titleWeight: 800, body: "Inter, 'Noto Sans SC', sans-serif", mono: "'JetBrains Mono', monospace" } },
  { id: 'dark-liminal', name: '暗色阈限', desc: '深蓝黑单色、点阵噪点、直角硬边，一点猩红', bg: '#121620', fg: '#e6ebef', dim: '#a6abb5', accent: '#e61744', accent2: '#4a5160', fonts: { title: "Inter, 'Noto Sans SC', sans-serif", titleWeight: 800, body: "Inter, 'Noto Sans SC', sans-serif", mono: "Recursive, 'Noto Serif SC', 'JetBrains Mono', monospace" } },
  { id: 'greyspace', name: '灰色阈限', desc: '暖调深灰档案卡、玫红链接跳色、半调网点', bg: '#23201e', fg: '#e6ebef', dim: '#9d9b95', accent: '#d92e53', accent2: '#42403c', fonts: { title: "Inter, 'Noto Sans SC', sans-serif", titleWeight: 800, body: "Inter, 'Noto Sans SC', sans-serif", mono: "Recursive, 'Noto Serif SC', 'JetBrains Mono', monospace" } },
  { id: 'database', name: '数据库', desc: '老式 CRT 终端：黑底琥珀磷光、全等宽字、扫描线', bg: '#0a0a0a', fg: '#af641e', dim: '#7d5a26', accent: '#e58c24', accent2: '#5c4218', fonts: { title: "'JetBrains Mono', 'Noto Sans SC', monospace", titleWeight: 700, body: "'JetBrains Mono', 'Noto Sans SC', monospace", mono: "'JetBrains Mono', 'Noto Sans SC', monospace" } },
  { id: 'fandom', name: 'Fandom 阈限', desc: '仿 Fandom 维基：做旧黄纸、橙色 UI、Rubik 圆体', bg: '#fbe7b5', fg: '#0c0c0c', dim: '#8a6224', accent: '#c36d2f', accent2: '#c36d2f', fonts: { title: "Rubik, 'Noto Sans SC', sans-serif", titleWeight: 700, body: "Rubik, 'Noto Sans SC', sans-serif", mono: "'JetBrains Mono', monospace" } },
  { id: 'meg', name: 'M.E.G.', desc: '探险者总署档案：荧光灯黄、全等宽终端字、圆角档案盒', bg: '#f5edab', fg: '#363415', dim: '#6b6740', accent: '#8a7d1a', accent2: '#a8a24f', fonts: { title: "'Overpass Mono', 'PT Mono', 'JetBrains Mono', 'Noto Sans SC', monospace", titleWeight: 700, body: "'Overpass Mono', 'PT Mono', 'JetBrains Mono', 'Noto Sans SC', monospace", mono: "'Overpass Mono', 'PT Mono', 'JetBrains Mono', 'Noto Sans SC', monospace" } },
]

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
        className="w-full accent-[var(--amber)]"
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
    if (k === 'ambient') audio.setAmbVolume((v as number) / 100)
    if (k === 'bgm') audio.setBgmVolume((v as number) / 100)
    if (k === 'sfx') audio.setSfxVolume((v as number) / 100)
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
              <Toggle k="vcrFx" label="VCR 滤镜（录像带效果）" value={settings.vcrFx as boolean} onSet={setBool} />
              <Toggle k="dust" label="漂浮尘埃粒子" value={settings.dust as boolean} onSet={setBool} />
              <Toggle k="shake" label="屏幕震动" value={settings.shake as boolean} onSet={setBool} />
              <Toggle k="headBob" label="真实视角摇晃（行走起伏/侧摆/落地回弹）" value={settings.headBob as boolean} onSet={setBool} />
              <Slider k="flicker" label="灯光闪烁强度" value={settings.flicker as number} onSet={setNum} />
              <Toggle k="dynamicRes" label="动态分辨率" value={settings.dynamicRes as boolean} onSet={setBool} />
              <Toggle k="shadows" label="实时阴影（手电）" value={settings.shadows as boolean} onSet={setBool} />
              <Toggle k="fogOfWar" label="战争迷雾（距离雾）" value={settings.fogOfWar as boolean} onSet={setBool} />
              <label className="block py-2 text-[14px]" style={{ color: 'var(--text)' }}>
                <span className="mb-1 flex justify-between"><span>距离雾远近</span><span className="font-mono2 text-[12px]" style={{ color: 'var(--amber)' }}>{settings.fogScale}%</span></span>
                <input
                  type="range" min={50} max={200} step={5} value={settings.fogScale}
                  onChange={(e) => set('fogScale', Number(e.target.value))}
                  className="w-full accent-[var(--amber)]"
                />
                <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>50% = 更近更浓 · 100% = 默认 · 200% = 更远更淡（未开「远处灯光全开」时，灯光点亮距离自动与雾可视距离一致）</span>
              </label>
              <Toggle k="farLights" label="远处灯光全开（性能开销略增）" value={settings.farLights as boolean} onSet={setBool} />
              {/* ---- 光影模式（v50：物理光照/反射，可一键退回经典） ---- */}
              <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--panel-edge)' }}>
                <div className="py-2 text-[14px]" style={{ color: 'var(--text)' }}>光影模式</div>
                <div className="flex gap-2">
                  {([['classic', '经典'], ['realistic', '真实']] as const).map(([v, l]) => (
                    <button
                      key={v}
                      className="flex-1 border px-3 py-2 text-[14px]"
                      style={{ borderColor: settings.lightMode === v ? 'var(--amber)' : 'var(--panel-edge)', color: settings.lightMode === v ? 'var(--amber)' : 'var(--text-dim)', background: 'var(--panel)' }}
                      onClick={() => set('lightMode', v)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <div className="pt-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
                  「经典」即当前版本。「真实」启用物理光照：环境反射、自然光投影、软阴影与泛光——性能开销更高（移动端建议经典），随时可退回经典。
                </div>
                {settings.lightMode === 'realistic' && (
                  <div className="mt-1">
                    <div className="py-2 text-[14px]" style={{ color: 'var(--text)' }}>阴影质量</div>
                    <div className="flex gap-2">
                      {([[0, '低'], [1, '中'], [2, '高']] as const).map(([v, l]) => (
                        <button
                          key={v}
                          className="flex-1 border px-3 py-2 text-[14px]"
                          style={{ borderColor: settings.shadowQuality === v ? 'var(--amber)' : 'var(--panel-edge)', color: settings.shadowQuality === v ? 'var(--amber)' : 'var(--text-dim)', background: 'var(--panel)' }}
                          onClick={() => set('shadowQuality', v)}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                    <Toggle k="sunShadows" label="自然光投影（室外太阳/月亮）" value={settings.sunShadows as boolean} onSet={setBool} />
                    <div className="py-2 text-[14px]" style={{ color: 'var(--text)' }}>场景灯投影（开销随盏数增加）</div>
                    <div className="flex gap-2">
                      {([[0, '关'], [1, '1 盏'], [2, '2 盏'], [4, '4 盏']] as const).map(([v, l]) => (
                        <button
                          key={v}
                          className="flex-1 border px-2 py-2 text-[13px]"
                          style={{ borderColor: settings.lightShadows === v ? 'var(--amber)' : 'var(--panel-edge)', color: settings.lightShadows === v ? 'var(--amber)' : 'var(--text-dim)', background: 'var(--panel)' }}
                          onClick={() => set('lightShadows', v)}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                    <Slider k="reflectivity" label="反射强度（环境/水面反射）" value={settings.reflectivity as number} onSet={setNum} />
                    <Toggle k="bloomFx" label="泛光（辉光后处理）" value={settings.bloomFx as boolean} onSet={setBool} />
                    {settings.bloomFx && <Slider k="bloomStrength" label="泛光程度" value={settings.bloomStrength as number} onSet={setNum} />}
                    <label className="block py-2 text-[14px]" style={{ color: 'var(--text)' }}>
                      <span className="mb-1 flex justify-between"><span>曝光</span><span className="font-mono2 text-[12px]" style={{ color: 'var(--amber)' }}>{settings.exposure}%</span></span>
                      <input
                        type="range" min={50} max={200} step={5} value={settings.exposure}
                        onChange={(e) => set('exposure', Number(e.target.value))}
                        className="w-full accent-[var(--amber)]"
                      />
                      <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>100% = 默认曝光；调高更亮、调低更暗</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}
          {tab === '音频' && (
            <div>
              <Toggle k="muted" label="静音" value={settings.muted as boolean} onSet={setBool} />
              <Slider k="volume" label="主音量" value={settings.volume as number} onSet={setNum} />
              <Slider k="bgm" label="音乐（BGM）" value={settings.bgm as number} onSet={setNum} />
              <Slider k="ambient" label="环境音（嗡鸣/雨声）" value={settings.ambient as number} onSet={setNum} />
              <Slider k="sfx" label="音效（攻击/拾取/UI/实体叫声）" value={settings.sfx as number} onSet={setNum} />
            </div>
          )}
          {tab === '主题' && (
            <div>
              <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    className="border p-3 text-left transition-transform"
                    style={{
                      borderColor: settings.theme === t.id ? 'var(--amber)' : 'var(--panel-edge)',
                      background: t.bg,
                      color: t.fg,
                      boxShadow: settings.theme === t.id ? '0 0 0 1px var(--amber), var(--quote-shadow)' : 'var(--quote-shadow)',
                    }}
                    onClick={() => { set('theme', t.id); audio.uiTick() }}
                  >
                    <div className="flex items-center justify-between" style={{ fontFamily: t.fonts.title }}>
                      <span className="text-[14px]" style={{ color: t.accent, fontWeight: t.fonts.titleWeight }}>{t.name}</span>
                      <span className="flex gap-1">
                        {[t.bg, t.accent2, t.accent].map((c) => (
                          <span key={c} className="block h-3 w-3 rounded-[2px] border" style={{ background: c, borderColor: t.dim }} />
                        ))}
                      </span>
                    </div>
                    <div className="mt-1.5 text-[11px] leading-relaxed" style={{ color: t.dim, fontFamily: t.fonts.body }}>{t.desc}</div>
                    <div className="mt-1.5 text-[10px]" style={{ color: t.dim, fontFamily: t.fonts.mono }}>
                      {settings.theme === t.id ? '● 使用中' : '○ 点击切换'}
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-3 text-[12px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
                各主题灵感均来自 <b style={{ color: 'var(--text)' }}>Backrooms 中文维基</b>的同名版式（阈限 / 玄武岩 / 暗色阈限 / 灰色阈限 / 数据库 / Fandom 阈限 / M.E.G.）。主题只改变界面外观（配色 / 字体 / 形状 / 动效），不影响 3D 场景渲染与游戏机制，即时生效并自动保存。
              </div>
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
                  className="w-full accent-[var(--amber)]"
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
                background: listening === a.id ? 'color-mix(in srgb, var(--amber) 12%, transparent)' : 'var(--panel)',
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
