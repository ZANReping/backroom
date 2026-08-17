// 应用状态机：标题 → 层级进入 → 游戏（HUD）→ 暂停/背包/死亡/胜利
import { useCallback, useEffect, useRef, useState } from 'react'
import { Routes, Route } from 'react-router'
import { engine } from '@/game/engine'
import type { SaveSlotId, SlotInfo } from '@/game/engine'
import { listSaveSlots, readSaveSlot, clearSaveSnapshot } from '@/game/engine/save'
import { storage } from '@/game/core/storage'
import { getRenderer, look, type Renderer3D } from '@/game/core/renderer3d'
import * as THREE from 'three'
import { audio } from '@/game/core/audio'
import { randomSeed } from '@/game/core/rng'
import { preloadGameResources } from '@/game/core/preload'
import { getKeybinds, type KeyBindMap } from '@/game/core/keybinds'
import { LEVELS, levelLabel, levelNo, levelDefOf } from '@/game/levels'
import { generateLevel } from '@/game/world/mapgen'
import type { HudEvent } from '@/game/engine'
import TitleScreen from '@/components/TitleScreen'
import SettingsModal, { defaultSettings, THEMES, type GameSettings } from '@/components/SettingsModal'
import HowToPlay from '@/components/HowToPlay'
import LevelIntro from '@/components/LevelIntro'
import FallIntro from '@/components/FallIntro'
import LoadingScreen from '@/components/LoadingScreen'
import HUD, { type LogEntry, type Toast } from '@/components/HUD'
import TouchControls from '@/components/TouchControls'
import PauseMenu from '@/components/PauseMenu'
import RadioOverlay from '@/components/RadioOverlay'
import InventoryOverlay, { discoverFromEngine, loadCodex, saveCodex } from '@/components/InventoryOverlay'
import DocOverlay from '@/components/DocOverlay'
import LandmarkOverlay from '@/components/LandmarkOverlay'
import DialogOverlay from '@/components/DialogOverlay'
import AvatarEditor from '@/components/AvatarEditor'
import DeathScreen from '@/components/DeathScreen'
import NotebookOverlay from '@/components/NotebookOverlay'
import VictoryScreen from '@/components/VictoryScreen'
import LootPanel from '@/components/LootPanel'
import FullscreenHint from '@/components/FullscreenHint'
import LayoutEditor, { loadTouchLayout, type TouchLayoutStore } from '@/components/LayoutEditor'
import Cutscene, { type CutKind, type CutIn } from '@/components/Cutscene'
import DesignMode from '@/components/DesignMode' // v54：设计模式（开发者模式入口在标题屏）
import LobbyOverlay from '@/components/LobbyOverlay' // v58：联机大厅
import { MpSession } from '@/game/net/session'
import { applyMpEvent } from '@/game/net/apply'

type Screen = 'title' | 'loading' | 'intro' | 'game' | 'fall' | 'design'
type Overlay = 'none' | 'settings' | 'howto' | 'pause' | 'radio' | 'inventory' | 'codex' | 'death' | 'victory' | 'avatar' | 'notebook' | 'doc' | 'landmark' | 'dialog' | 'lobby'

// 冒烟测试钩子（Playwright page.evaluate 用）
if (typeof window !== 'undefined') {
  ;(window as unknown as { __engine: typeof engine }).__engine = engine
  ;(window as unknown as { __look: typeof look }).__look = look
}

// v23：切出过场的黑场字幕文案（按切出类型）
const CUT_CAPTION: Record<string, string> = {
  bloom: '光把这一层洗掉了',
  shutter: '门在你身后合拢',
  iris: '视野收成一个点',
  glitch: '信号断了一下',
  fall: '脚下什么都没有',
  noclip: '你从现实里剪了出去',
  collapse: '地板不结实',
  sink: '水面在你头顶合上',
  dawn: '前面亮起来了',
  intro: '',
}

let logId = 1
let toastId = 1

export default function App() {
  return (
    <Routes>
      {/* v16：部署在子路径（如 /room/）时 BrowserRouter 匹配不到 "/" 会整页空白，
          单页游戏改为通配路由，任意部署路径均可挂载 */}
      <Route path="*" element={<Game />} />
    </Routes>
  )
}

function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<Renderer3D | null>(null)
  const [screen, setScreen] = useState<Screen>('title')
  const [overlay, setOverlay] = useState<Overlay>('none')
  const [settings, setSettings] = useState<GameSettings>(() => {
    try { return { ...defaultSettings, ...JSON.parse(storage.get('br_settings') ?? '{}') } } catch { return defaultSettings }
  })
  const [log, setLog] = useState<LogEntry[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [damageFlash, setDamageFlash] = useState(0)
  const [sanityFlash, setSanityFlash] = useState(0)
  const [floorShift, setFloorShift] = useState<{ id: number; text: string } | null>(null)
  // v54：沉浸模式——F1 全沉浸（隐藏 HUD 层 + 手部建模/准星）；F2 半沉浸（仅隐藏 HUD 铬件，
  // 保留手部建模与准星）。两者互斥不叠加：按当前生效的键恢复，按另一个键直接切换模式。
  // 背包/图鉴/设置/战利品面板等覆盖层不受影响（只隐藏 HUD 铬件，面板类 UI 按现有逻辑正常显示）
  const [hudHidden, setHudHidden] = useState(false)
  // v23：切入切出过场（替代旧的简易 TransitionOverlay）
  const [cut, setCut] = useState<{ kind: CutKind; cutIn?: CutIn; toName?: string; caption?: string } | null>(null)
  const cutRef = useRef<typeof cut>(null)
  cutRef.current = cut
  const pendingIntro = useRef(false)
  const [fallDmg, setFallDmg] = useState<number | null>(null)
  const [deathCause, setDeathCause] = useState('')
  const [docId, setDocId] = useState('meg_levels')
  const [landmarkId, setLandmarkId] = useState('alpha')
  const [dialogId, setDialogId] = useState('kat')
  const [invTab, setInvTab] = useState<'背包' | '图鉴' | '状态' | '地图' | '日志' | '任务'>('背包')
  // v54：存档槽位列表（标题屏展示；回标题时刷新）
  const [slots, setSlots] = useState<SlotInfo[]>(() => listSaveSlots())
  const refreshSlots = useCallback(() => setSlots(listSaveSlots()), [])
  // v57：开始游戏加载界面状态（进度 + 当前资源 + 已完成内容）
  const [loadState, setLoadState] = useState({ progress: 0, label: '初始化加载器', detail: '准备预载资源', history: [] as string[] })
  const loadingRef = useRef(false)
  const [, setTick] = useState(0)
  const overlayRef = useRef(overlay)
  overlayRef.current = overlay
  const invTabRef = useRef(invTab)
  invTabRef.current = invTab
  const screenRef = useRef(screen)
  screenRef.current = screen
  const sensRef = useRef(settings.sensitivity)
  sensRef.current = settings.sensitivity

  const isMobile = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window)

  // 自定义触屏按键布局（竖屏/横屏分开保存）
  const [touchLayout, setTouchLayout] = useState<TouchLayoutStore>(() => loadTouchLayout())
  const [layoutEditorOpen, setLayoutEditorOpen] = useState(false)
  const [, setOrientTick] = useState(0)
  useEffect(() => {
    const fn = () => setOrientTick((n) => n + 1)
    window.addEventListener('resize', fn)
    window.addEventListener('orientationchange', fn)
    return () => {
      window.removeEventListener('resize', fn)
      window.removeEventListener('orientationchange', fn)
    }
  }, [])
  const landscapeNow = typeof window !== 'undefined' && window.innerWidth > window.innerHeight
  const activeTouchLayout = touchLayout[landscapeNow ? 'landscape' : 'portrait'] ?? {}
  const customPause = isMobile && !!activeTouchLayout.pause

  useEffect(() => {
    storage.set('br_settings', JSON.stringify(settings))
    audio.setMuted(settings.muted)
    audio.setVolume(settings.volume / 100)
    audio.setBgmVolume(settings.bgm / 100) // v54：分项音量（BGM/环境/音效）
    audio.setBgmStyle(settings.bgmStyle) // v56：BGM 曲风（程序化 / MIDI）
    audio.setAmbVolume(settings.ambient / 100)
    audio.setSfxVolume(settings.sfx / 100)
    engine.dev.god = settings.devMode // 开发者模式：无敌
    // 界面主题：挂到 <html data-theme>，CSS 变量随之整体切换（见 index.css）
    document.documentElement.dataset.theme = settings.theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES.find((t) => t.id === settings.theme)?.bg ?? '#0a0908')
  }, [settings])

  // 准心兜底隐藏（死亡/胜利/回标题/任意覆盖层时；渲染层缓存偶发不同步的保险）
  useEffect(() => {
    if (screen !== 'game' || overlay !== 'none') {
      const el = document.getElementById('br-crosshair')
      if (el) el.style.display = 'none'
    }
  }, [screen, overlay])

  // 打开任意覆盖层时释放鼠标指针（PC 指针锁定下无法操作面板）
  useEffect(() => {
    if (overlay !== 'none') document.exitPointerLock?.()
  }, [overlay])

  // v56：暂停（暂停菜单及其子页）时挂起全部音频——乐手演奏/BGM/环境音一起暂停，恢复后接着播。
  // 电台管理页除外：它是音乐播放器（试听/BGM 照常播放），关回暂停菜单再挂起
  useEffect(() => {
    const pausedUi = screen === 'game' && (overlay === 'pause' || overlay === 'settings' || overlay === 'howto')
    if (pausedUi) audio.suspendAll()
    else audio.resumeAll()
  }, [overlay, screen])

  const addLog = useCallback((text: string, kind: string) => {
    setLog((l) => [...l.slice(-20), { id: logId++, text, kind, t: Date.now() }])
  }, [])

  // 引擎事件
  useEffect(() => {
    const handler = (e: HudEvent) => {
      // v58：联机事件转发（世界事件广播 + 死亡播报）
      if (e.kind === 'mpevent' && e.mp) { mpSessionRef.current?.sendEvent(e.mp); return }
      if (e.kind === 'dead') mpSessionRef.current?.sendEvent({ t: 'died', text: e.text ?? '' })
      switch (e.kind) {
        case 'msg':
          addLog(e.text ?? '', e.msgKind ?? 'system')
          break
        case 'toast':
          setToasts((t) => [...t.slice(-3), { id: toastId++, text: e.text ?? '' }])
          setTimeout(() => setToasts((t) => t.slice(1)), 1700)
          break
        case 'damage':
          setDamageFlash((n) => n + 1)
          break
        case 'sanityhit':
          setSanityFlash((n) => n + 1)
          break
        case 'floorchange': {
          const id = Date.now()
          setFloorShift({ id, text: e.text ?? '楼层正在变化' })
          setTimeout(() => setFloorShift((v) => v?.id === id ? null : v), 1300)
          break
        }
        case 'transition':
          if (e.anim && e.anim !== 'intro') {
            const d = typeof e.dest === 'number' ? e.dest : undefined
            setCut({
              kind: e.anim as CutKind,
              cutIn: e.cutIn as CutIn | undefined,
              toName: d !== undefined ? (levelDefOf(d)?.label ?? `${levelLabel(d)} · ${levelDefOf(d)?.name ?? ''}`) : e.dest === 'win' ? undefined : '未知层级',
              caption: e.cutIn === 'outpost' ? '你跟着鲜黄色地标指示的路线，成功抵达了' : CUT_CAPTION[e.anim] ?? '你换了一层',
            })
            if (e.fallDamage) setTimeout(() => setFallDmg(e.fallDamage!), 900)
          } else if (e.anim === 'intro') {
            // 层级已载入：据点跳过层级卡（专属切入动画后直接进入）；其余若过场还在播，等过场结束再出层级卡
            if (levelDefOf(engine.player.level)?.gen === 'outpost') setScreen('game')
            else if (cutRef.current) pendingIntro.current = true
            else setScreen('intro')
          }
          break
        case 'dead':
          discoverFromEngine(engine)
          setTimeout(() => { setDeathCause(e.text ?? ''); setOverlay('death') }, 600)
          break
        case 'victory':
          discoverFromEngine(engine)
          setOverlay('victory')
          break
        case 'levelchange':
          setFallDmg(null)
          break
        case 'notebook':
          setOverlay('notebook')
          break
        case 'doc': {
          // 阅读 M.E.G. 文档：打开文档视图，并解锁图鉴「文档」存档
          const id = e.text ?? 'meg_levels'
          const c = loadCodex()
          if (!c[`doc_${id}`]) { c[`doc_${id}`] = true; saveCodex(c) }
          setDocId(id)
          setOverlay('doc')
          break
        }
        case 'landmark':
          // v35：查看定居点地标（地标卡 + 可前往据点）
          setLandmarkId(e.text ?? 'alpha')
          setOverlay('landmark')
          break
        case 'dialog': {
          // v35：与 NPC 交谈——打开对话窗，并解锁图鉴「NPC」存档（只显示遇见过的 NPC）
          const id = e.text ?? 'kat'
          const c = loadCodex()
          if (!c[`npc_${id}`]) { c[`npc_${id}`] = true; saveCodex(c) }
          setDialogId(id)
          setOverlay('dialog')
          break
        }
      }
    }
    // 返回取消订阅函数作为清理：StrictMode 双调用/HMR 重挂载时不再累积监听器（播报重复好几遍的根因）
    return engine.on(handler)
  }, [addLog])

  // 开始新一局的最终提交：先播开场坠落动画 FallIntro（新游戏），或直接进入存档层级（继续游戏）
  // v54：slot=绑定的存档槽（新游戏只能绑手动槽；继续游戏沿用所读槽位）
  const [fallPlaying, setFallPlaying] = useState(false)
  // v58：联机会话（非空=联机局进行中）
  const mpSessionRef = useRef<MpSession | null>(null)
  const onMpStart = useCallback((session: MpSession, seed: number) => {
    mpSessionRef.current = session
    ;(window as unknown as { __mpSession: MpSession }).__mpSession = session // 调试/联机冒烟读取点
    engine.mpSession = session
    engine.mpMapSeed = (id: number) => (seed ^ Math.imul(id, 2654435761)) >>> 0 // 全房间同图（先到先得=同布局）
    engine.mpSpawnSlot = session.mySlot()
    session.onLocalEvent = (e) => applyMpEvent(engine, e)
    requestStart(seed, 'slot1', 0, true) // 强制新开局 + 播入场动画
  }, [])
  const commitStart = useCallback((seed?: number, slot: SaveSlotId = 'slot1', forceFresh = false) => {
    audio.resume()
    look.yaw = 0; look.pitch = 0
    const s = seed ?? randomSeed()
    const fresh = seed === undefined || forceFresh // v58：联机开局强制新游戏（跳过读档恢复 + 播入场动画）
    if (fresh) {
      // 全新开局（非「继续游戏」）：清空 NPC 聊天记录与随机 NPC 图鉴记录
      storage.remove('br_npc_chat')
      const c = loadCodex()
      let cleared = false
      for (const k of Object.keys(c)) if (k.startsWith('npc_rand_')) { delete c[k]; cleared = true }
      if (cleared) saveCodex(c)
    }
    engine.newRun(s, settings.difficulty, slot)
    engine.hudHidden = false // v54：新一局退出沉浸模式
    engine.handsHidden = false
    setHudHidden(false)
    setLog([])
    setOverlay('none')
    if (!fresh) {
      // 继续游戏：跳过开场坠落动画，直接进入游戏（引擎读档恢复到存档层级）
      setScreen('game')
      engine.paused = false
    } else {
      engine.paused = true
      setFallPlaying(true)
      setScreen('fall')
    }
    refreshSlots()
  }, [settings.difficulty, refreshSlots])

  // 点击「开始游戏/继续游戏」后：显示加载界面 → 预载贴图/BGM 资源并回报进度 → 再进入游戏。
  // 预载失败一律降级放行（渲染层/音频层均有程序化兜底）。
  const requestStart = useCallback((seed?: number, slot: SaveSlotId = 'slot1', targetLevel = seed !== undefined ? engine.player.level : 0, forceFresh = false) => {
    if (loadingRef.current) return
    loadingRef.current = true
    audio.resume() // 用户手势内解锁 WebAudio
    const startedAt = performance.now()
    setLog([])
    setOverlay('none')
    setLoadState({ progress: 2, label: '初始化加载器', detail: '正在准备资源清单', history: [] })
    setScreen('loading')
    void preloadGameResources({ targetLevel, bgmStyle: settings.bgmStyle }, (u) => {
      setLoadState((prev) => ({
        progress: Math.max(prev.progress, u.progress),
        label: u.label,
        detail: u.detail,
        history: u.log ? [...prev.history.slice(-7), u.log] : prev.history,
      }))
    }).catch(() => undefined).then(async () => {
      // 保证加载界面至少可见约 1.1s：资源全命中缓存时也不闪屏
      const rest = Math.max(0, 1100 - (performance.now() - startedAt))
      if (rest > 0) {
        setLoadState((prev) => ({ ...prev, progress: 88, label: '资源预载完成', detail: '正在稳定渲染管线' }))
        await new Promise<void>((r) => setTimeout(r, rest))
      }
      setLoadState((prev) => ({ ...prev, progress: 92, label: '生成初始地图', detail: `正在生成 Level ${targetLevel} 的程序化世界`, history: [...prev.history.slice(-7), `生成初始地图：Level ${targetLevel}`] }))
      await new Promise<void>((r) => setTimeout(r, 220))
      setLoadState((prev) => ({ ...prev, progress: 100, label: '进入后室', detail: '初始化完成', history: [...prev.history.slice(-7), '资源与地图就绪'] }))
      await new Promise<void>((r) => setTimeout(r, 90))
      loadingRef.current = false
      try { commitStart(seed, slot, forceFresh) }
      catch (err) {
        console.error('[loading] 进入游戏失败，返回标题', err)
        setScreen('title')
        refreshSlots()
      }
    })
  }, [settings.bgmStyle, commitStart, refreshSlots])

  // v54：从槽位继续（读快照取种子与层级）；空槽回退为新游戏
  const continueSlot = useCallback((slot: SaveSlotId) => {
    const snap = readSaveSlot(slot)
    if (snap) requestStart(snap.seed, slot, snap.level)
    else requestStart(undefined, slot === 'auto' ? 'slot1' : slot, 0)
  }, [requestStart])

  // 键盘输入（v18：全部键位读自定义绑定表 getKeybinds()，方向键/Ctrl/Tab 为始终生效的辅助键）
  useEffect(() => {
    const keys: Record<string, boolean> = {}
    // 页签键：背包/地图/图鉴/任务/状态/日志——游戏中直开对应页签；背包打开时切换页签，再按当前页签键关闭
    const tabKeys = (kb: KeyBindMap): [string, typeof invTab][] => [
      [kb.inventory, '背包'], ['Tab', '背包'], [kb.map, '地图'],
      [kb.codex, '图鉴'], [kb.quest, '任务'], [kb.status, '状态'], [kb.log, '日志'],
    ]
    const openTab = (t: typeof invTab) => { discoverFromEngine(engine); setInvTab(t); setOverlay('inventory') }
    const down = (e: KeyboardEvent) => {
      // v54：F1 防呆——浏览器「帮助」默认键，任意界面一律拦截默认行为
      if (e.code === 'F1') e.preventDefault()
      if (screenRef.current !== 'game' || overlayRef.current !== 'none') {
        const kb = getKeybinds()
        if (overlayRef.current === 'inventory') {
          const hit = tabKeys(kb).find(([c]) => c === e.code)
          if (hit) {
            e.preventDefault()
            if (hit[1] === invTabRef.current) setOverlay('none')
            else setInvTab(hit[1])
            return
          }
        }
        if (e.key === 'Escape' && overlayRef.current !== 'none' && overlayRef.current !== 'death' && overlayRef.current !== 'victory') {
          setOverlay(screenRef.current === 'game' ? 'none' : 'none')
        }
        return
      }
      const c = e.code
      keys[c] = true
      const b = getKeybinds()
      // 攻击 / 快捷使用（默认在鼠标键上，改绑到键盘时由此分发）
      if (c === b.attack) engine.input.attack = true
      if (c === b.quickuse) engine.quickUse()
      if (c === b.quickdrop) engine.quickDrop() // v20：Q 快捷丢弃当前手持
      // 交互：战利品面板打开时 = 拿取全部物品（而不是重新搜索该容器）；
      // v20：物品已拿空（仅剩"离开"）时 E 直接关闭容器界面
      if (c === b.interact) {
        if (engine.lootPanel) {
          if (engine.lootPanel.items.length > 0) { engine.takeAllLoot(); audio.uiTick() }
          else { engine.closeLootPanel(); audio.uiTick(); setTick((n) => n + 1) }
        } else engine.input.interact = true
      }
      if (c === b.flashlight) engine.input.toggleLight = true
      // v54：沉浸模式切换——F1 全沉浸（HUD+手部）/ F2 半沉浸（仅 HUD）；互斥切换，按当前生效键恢复
      if (c === b.hidehud || c === b.hidehud2) {
        const full = c === b.hidehud
        if (engine.hudHidden && engine.handsHidden === full) {
          engine.hudHidden = false; engine.handsHidden = false // 再按当前模式键：恢复
        } else {
          engine.hudHidden = true; engine.handsHidden = full // 切换/进入模式
        }
        setHudHidden(engine.hudHidden) // 手部显隐由 renderer 每帧读 engine.handsHidden，无需 React 状态
      }
      if (c === b.jump) { engine.input.jump = true; e.preventDefault() }
      if (c === b.inventory || c === 'Tab') { e.preventDefault(); openTab('背包') }
      if (c === b.map) openTab('地图')
      if (c === b.codex) openTab('图鉴')
      if (c === b.quest) openTab('任务')
      if (c === b.status) openTab('状态')
      if (c === b.log) openTab('日志')
      // Esc：面板打开时优先关面板，再按才暂停
      if (c === 'Escape') { if (engine.lootPanel) { engine.closeLootPanel(); setTick((n) => n + 1) } else setOverlay('pause') }
      for (let i = 0; i < engine.player.hotbar.length; i++) if (c === b[`slot${i + 1}`]) engine.player.selected = i
      updateMove()
    }
    const up = (e: KeyboardEvent) => {
      keys[e.code] = false
      const b = getKeybinds()
      if (e.code === b.jump) engine.input.jump = false // v57t：松键即停止持续上浮（深水跳跃是长按态，不能永远锁存）
      updateMove()
    }
    const updateMove = () => {
      const b = getKeybinds()
      let x = 0, y = 0
      if (keys[b.forward] || keys['ArrowUp']) y -= 1
      if (keys[b.back] || keys['ArrowDown']) y += 1
      if (keys[b.left] || keys['ArrowLeft']) x -= 1
      if (keys[b.right] || keys['ArrowRight']) x += 1
      engine.input.mx = x; engine.input.my = y
      engine.input.sprint = !!(keys[b.sprint] || keys['ShiftLeft'] || keys['ShiftRight'])
      engine.input.crouch = !!(keys[b.crouch] || keys['ControlLeft'] || keys['ControlRight'])
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // 标签页隐藏自动暂停
  useEffect(() => {
    const fn = () => {
      if (document.hidden && screenRef.current === 'game' && overlayRef.current === 'none') setOverlay('pause')
    }
    document.addEventListener('visibilitychange', fn)
    return () => document.removeEventListener('visibilitychange', fn)
  }, [])

  // 主循环（Three.js 第一人称渲染）
  useEffect(() => {
    const canvas = canvasRef.current!
    const renderer = getRenderer(canvas)
    rendererRef.current = renderer
    renderer.setResolutionMode(settings.renderResolution)
    // 诊断钩子（自动化测试用）：暴露渲染器与 THREE 构造器
    ;(window as unknown as { __renderer: typeof renderer }).__renderer = renderer
    ;(window as unknown as { __THREE: typeof THREE }).__THREE = THREE
    let raf = 0
    let last = performance.now()
    let hudAcc = 0
    let frameTimes: number[] = []
    let resScale = 1
    const mobileDprCap = 1.5

    const resize = () => {
      const nativeDpr = Math.min(window.devicePixelRatio || 1, isMobile ? mobileDprCap : 2)
      const targetHeight = settings.renderResolution === '720p' ? 720
        : settings.renderResolution === '480p_retro' ? 360
          : settings.renderResolution === '320p_ps1' ? 180
            : 0
      const dpr = targetHeight > 0
        ? Math.max(0.05, Math.min(nativeDpr, targetHeight / Math.max(1, window.innerHeight)))
        : nativeDpr * resScale
      renderer.resize(window.innerWidth, window.innerHeight, dpr)
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      canvas.style.imageRendering = settings.renderResolution === '480p_retro' || settings.renderResolution === '320p_ps1' ? 'pixelated' : 'auto'
    }
    resize()
    window.addEventListener('resize', resize)

    // 桌面 Pointer Lock 鼠标视角
    const onClick = () => {
      if (isMobile) return
      if (screenRef.current === 'game' && overlayRef.current === 'none' && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.()
      }
    }
    const onLockChange = () => { look.locked = document.pointerLockElement === canvas }
    const onMouseMove = (e: MouseEvent) => {
      if (!look.locked) return
      look.yaw -= e.movementX * 0.0024 * sensRef.current
      look.pitch = Math.max(-1.2, Math.min(1.2, look.pitch - e.movementY * 0.0022 * sensRef.current))
    }
    // v18：离散动作（攻击/快捷使用/交互/手电/跳跃）按绑定码触发，鼠标与滚轮共用
    const fireDiscrete = (code: string) => {
      const b = getKeybinds()
      if (code === b.attack) engine.input.attack = true
      else if (code === b.quickuse) engine.quickUse()
      else if (code === b.quickdrop) engine.quickDrop()
      else if (code === b.interact) {
        if (engine.lootPanel) {
          if (engine.lootPanel.items.length > 0) { engine.takeAllLoot(); audio.uiTick() }
          else { engine.closeLootPanel(); audio.uiTick(); setTick((n) => n + 1) } // v20：空容器 E=关闭
        } else engine.input.interact = true
      }
      else if (code === b.flashlight) engine.input.toggleLight = true
      else if (code === b.jump) engine.input.jump = true
    }
    // 鼠标按键（仅在指针锁定游戏中触发；未锁定时的点击用于锁定不触发动作）
    const onMouseDown = (e: MouseEvent) => {
      if (!look.locked) return
      if (screenRef.current !== 'game' || overlayRef.current !== 'none') return
      fireDiscrete(`Mouse${e.button}`)
    }
    // 屏蔽右键菜单（游戏中右键默认用作快捷使用）
    const onContextMenu = (e: Event) => {
      if (screenRef.current === 'game') e.preventDefault()
    }
    // 滚轮：先分发给绑定到 WheelUp/WheelDown 的动作，再循环切换快捷栏选中格
    const onWheel = (e: WheelEvent) => {
      if (!look.locked) return
      if (screenRef.current !== 'game' || overlayRef.current !== 'none') return
      fireDiscrete(e.deltaY < 0 ? 'WheelUp' : 'WheelDown')
      const dir = e.deltaY > 0 ? 1 : -1
      engine.player.selected = (engine.player.selected + dir + engine.player.hotbar.length) % engine.player.hotbar.length
      audio.uiTick()
    }
    canvas.addEventListener('click', onClick)
    document.addEventListener('pointerlockchange', onLockChange)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('wheel', onWheel, { passive: true })

    // 标题吸引模式地图
    let attractMap: ReturnType<typeof generateLevel> | null = null

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = (now - last) / 1000
      last = now
      // 动态分辨率
      if (settings.renderResolution === 'native' && settings.dynamicRes) {
        frameTimes.push(now)
        if (frameTimes.length > 30) {
          const avg = (frameTimes[frameTimes.length - 1] - frameTimes[0]) / (frameTimes.length - 1)
          const minScale = engine.player.level === 5 ? 0.5 : 0.6
          if (avg > 20 && resScale > minScale) { resScale = Math.max(minScale, resScale - 0.1); resize() }
          else if (avg < 14 && resScale < 1) { resScale += 0.05; resize() }
          frameTimes = []
        }
      }

      const paused = overlayRef.current !== 'none' && overlayRef.current !== 'death' && overlayRef.current !== 'victory'
      // v23：过场演出播放中、且引擎的层级切换已完成 → 冻结操作，等过场放完再交还控制权
      const cine = cutRef.current !== null && engine.transition === null
      engine.paused = paused || screenRef.current !== 'game' || cine

      if (screenRef.current === 'title' || screenRef.current === 'design') {
        // 吸引模式：L0 出生点缓慢环视（v54：设计模式全屏覆盖，背景同走吸引模式，引擎保持暂停）
        if (!attractMap) attractMap = generateLevel(LEVELS[0], 1337)
        look.yaw += dt * 0.18
        look.pitch = Math.sin(now / 4000) * 0.08
        const savedMap = engine.map
        const px = engine.player.x, py = engine.player.y
        const fl = engine.player.flashlight
        engine.map = attractMap
        engine.player.x = attractMap.spawn.x + 0.5
        engine.player.y = attractMap.spawn.y + 0.5
        engine.player.flashlight = true
        renderer.render(canvas, engine, { grain: settings.grain, flicker: settings.flicker / 100, shake: false, dust: settings.dust }, dt)
        engine.player.x = px; engine.player.y = py
        engine.player.flashlight = fl
        engine.map = savedMap
      } else {
        renderer.applyView(engine)
        engine.update(dt)
        mpSessionRef.current?.tick(engine, dt) // v58：联机状态同步（12Hz）
        renderer.render(canvas, engine, { grain: settings.grain, flicker: settings.flicker / 100, shake: settings.shake, dust: settings.dust }, dt)
      }

      hudAcc += dt
      if (hudAcc > 0.12) { hudAcc = 0; setTick((n) => n + 1) }
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('click', onClick)
      document.removeEventListener('pointerlockchange', onLockChange)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('wheel', onWheel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.grain, settings.dust, settings.flicker, settings.shake, settings.dynamicRes, settings.renderResolution])

  // 画面设置：手电实时阴影（移动端强制关闭）
  useEffect(() => {
    rendererRef.current?.setShadows(settings.shadows && !isMobile)
  }, [settings.shadows, isMobile])

  // 画面设置：战争迷雾（距离雾）
  useEffect(() => {
    rendererRef.current?.setFog(settings.fogOfWar)
  }, [settings.fogOfWar])

  // 画面设置：真实视角摇晃（v54；默认关闭=基础 bob）
  useEffect(() => {
    rendererRef.current?.setHeadBob(settings.headBob)
  }, [settings.headBob])

  // 画面设置：距离雾远近 / 远处灯光全开
  useEffect(() => {
    rendererRef.current?.setFogScale(settings.fogScale / 100)
  }, [settings.fogScale])
  useEffect(() => {
    rendererRef.current?.setFarLights(settings.farLights)
  }, [settings.farLights])

  // 画面设置：VCR 滤镜（默认关）
  useEffect(() => {
    rendererRef.current?.setVcrFx(settings.vcrFx)
  }, [settings.vcrFx])

  // 画面设置：光影模式与细分项（v50；realistic 细项在 classic 下推送也无效，渲染器内自守门）
  useEffect(() => {
    const r = rendererRef.current
    if (!r) return
    r.setLightMode(settings.lightMode)
    r.setRealWater(settings.realWater)
    r.setShadowQuality(settings.shadowQuality)
    r.setSunShadows(settings.sunShadows)
    r.setLightShadows(settings.lightShadows)
    r.setReflectivity(settings.reflectivity)
    r.setBloomFx(settings.bloomFx)
    r.setBloomStrength(settings.bloomStrength)
    r.setExposure(settings.exposure)
  }, [settings.lightMode, settings.realWater, settings.shadowQuality, settings.sunShadows, settings.lightShadows, settings.reflectivity, settings.bloomFx, settings.bloomStrength, settings.exposure])

  const quitToTitle = () => {
    // 「保存并退出」必须在 over 置位前同步落盘，不能依赖暂停菜单打开后的下一帧自动保存。
    engine.persist()
    // v58：离开联机局——解散/断开并还原引擎联机字段
    mpSessionRef.current?.leave()
    mpSessionRef.current = null
    engine.mpSession = null
    engine.mpMapSeed = null
    engine.mpSpawnSlot = null
    engine.over = true
    audio.stopHum()
    audio.stopRain() // v54：L4 雨声随退出停止
    audio.stopBGM()
    setOverlay('none')
    setScreen('title')
    refreshSlots() // v54：回标题刷新槽位列表（暂停落盘在引擎 idleSaved 路径已完成）
  }

  const levelDef = engine.levelDef

  // 现象「孤立效应」附加表现：Level 0 内对画布施加极轻微的画面微调色（每次进层重新随机）
  const cg = engine.colorGrade
  const gradeFilter = engine.player.level === 0 && (cg.hue !== 0 || cg.sat !== 1 || cg.con !== 1 || cg.bri !== 1)
    ? `hue-rotate(${cg.hue.toFixed(2)}deg) saturate(${cg.sat.toFixed(3)}) contrast(${cg.con.toFixed(3)}) brightness(${cg.bri.toFixed(3)})`
    : undefined

  return (
    <div className={`br-app fixed inset-0 overflow-hidden ${settings.grain ? 'vhs-grain scanlines' : 'scanlines'} ${customPause ? 'br-hide-hud-pause' : ''}`} style={{ background: 'var(--ink)' }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed', top: 0, left: 0, zIndex: 1, filter: gradeFilter,
          imageRendering: settings.renderResolution === '480p_retro' || settings.renderResolution === '320p_ps1' ? 'pixelated' : 'auto',
        }}
      />

      {/* 受伤闪屏 */}
      {damageFlash > 0 && (
        <div key={damageFlash} className="pointer-events-none fixed inset-0 z-40" style={{ boxShadow: 'inset 0 0 120px 40px rgba(179,53,43,0.7)', animation: 'damageFlash 0.18s ease-out both' }} />
      )}
      {sanityFlash > 0 && (
        <div key={sanityFlash} className="pointer-events-none fixed inset-0 z-40" style={{ boxShadow: 'inset 0 0 120px 40px rgba(122,111,208,0.6)', animation: 'damageFlash 0.3s ease-out both' }} />
      )}
      {floorShift && (
        <div key={floorShift.id} className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-black text-sm tracking-[0.32em] text-stone-400" style={{ animation: 'floorShift 1.3s ease-in-out both' }}>
          {floorShift.text}
        </div>
      )}
      {/* v30 植殖癌：视野逐渐变绿（绿色浸染 + 绿植色 vignette，随 engine.plantK 渐变） */}
      {engine.plantK > 0.01 && (
        <div
          className="pointer-events-none fixed inset-0 z-40"
          style={{
            background: `rgba(74,140,58,${(engine.plantK * 0.26).toFixed(3)})`,
            boxShadow: `inset 0 0 ${Math.round(120 + engine.plantK * 180)}px ${Math.round(40 + engine.plantK * 60)}px rgba(42,104,38,${(0.2 + engine.plantK * 0.6).toFixed(3)})`,
          }}
        />
      )}

      {/* 出口过渡动画（v23：切入切出过场演出）*/}
      {cut && (
        <Cutscene
          kind={cut.kind}
          cutIn={cut.cutIn}
          toName={cut.toName}
          caption={cut.caption}
          onDone={() => {
            setCut(null)
            if (pendingIntro.current) { pendingIntro.current = false; setScreen('intro') }
          }}
        />
      )}
      {fallDmg !== null && !cut && (
        <div className="font-mono2 pointer-events-none fixed left-1/2 top-1/3 z-50 -translate-x-1/2 text-[20px]" style={{ color: 'var(--blood)' }}>-{fallDmg} HP</div>
      )}

      {/* 开始游戏加载界面（点击开始/继续后，进入游戏前） */}
      {screen === 'loading' && (
        <LoadingScreen
          progress={loadState.progress}
          label={loadState.label}
          detail={loadState.detail}
          history={loadState.history}
        />
      )}

      {/* 层级进入卡 */}
      {screen === 'intro' && (
        <LevelIntro
          level={levelNo(levelDef.id)}
          name={levelDef.name}
          flavor={levelDef.flavor}
          seed={engine.seed}
          onDone={() => { setScreen('game'); engine.paused = false }}
        />
      )}

      {/* 开场坠落动画（街道→坠落→摔进 L0；淡出时进入游戏，爬起动画由引擎 introT 驱动） */}
      {fallPlaying && (
        <FallIntro
          onReveal={() => setScreen('game')}
          onDone={() => { setFallPlaying(false); setScreen('game') }}
        />
      )}

      {/* HUD（v54：沉浸模式 F1 隐藏整层；战利品面板等覆盖 UI 不受影响） */}
      {screen === 'game' && overlay !== 'death' && overlay !== 'victory' && !hudHidden && (
        <HUD
          engine={engine}
          isMobile={isMobile}
          log={log}
          toasts={toasts}
          devMode={settings.devMode}
          fxScale={settings.flicker / 100}
          onPause={() => setOverlay('pause')}
          onInventory={() => { discoverFromEngine(engine); setInvTab('背包'); setOverlay('inventory') }}
          onSelectSlot={(i) => { engine.player.selected = i; audio.uiTick() }}
          onUseSlot={(i) => engine.useSlot('hotbar', i)}
        />
      )}
      {/* 战利品面板（容器搜索）*/}
      {screen === 'game' && overlay === 'none' && engine.lootPanel && (
        <LootPanel engine={engine} onClose={() => { engine.closeLootPanel(); setTick((n) => n + 1) }} />
      )}
      {overlay === 'notebook' && (
        <NotebookOverlay onClose={() => setOverlay('none')} />
      )}
      {overlay === 'doc' && (
        <DocOverlay docId={docId} onClose={() => setOverlay('none')} />
      )}
      {overlay === 'landmark' && (
        <LandmarkOverlay outpostId={landmarkId} onClose={() => setOverlay('none')} />
      )}
      {overlay === 'dialog' && (
        <DialogOverlay npcId={dialogId} onClose={() => setOverlay('none')} />
      )}
      <FullscreenHint />
      {screen === 'game' && isMobile && overlay === 'none' && !hudHidden && (
        <TouchControls
          engine={engine}
          settings={settings}
          layout={activeTouchLayout}
          onInventory={() => { discoverFromEngine(engine); setOverlay('inventory') }}
          onPause={() => setOverlay('pause')}
        />
      )}
      {/* 触屏布局编辑器（半透明覆盖，游戏画面为背景） */}
      {layoutEditorOpen && (
        <LayoutEditor
          leftHanded={settings.leftHanded}
          stickSize={settings.stickSize}
          onClose={(changed) => {
            setLayoutEditorOpen(false)
            if (changed) setTouchLayout(loadTouchLayout())
            setOverlay(screen === 'game' ? 'pause' : 'none')
          }}
        />
      )}

      {/* 标题 */}
      {screen === 'title' && overlay === 'none' && (
        <TitleScreen
          slots={slots}
          onNewGame={(slot) => requestStart(undefined, slot, 0)}
          onContinueSlot={continueSlot}
          onDeleteSlot={(slot) => { clearSaveSnapshot(slot); refreshSlots() }}
          onSettings={() => setOverlay('settings')}
          onHowTo={() => setOverlay('howto')}
          onCodex={() => setOverlay('codex')}
          onAvatar={() => setOverlay('avatar')}
          onMultiplayer={() => setOverlay('lobby')}
          devMode={settings.devMode}
          onDesign={() => setScreen('design')}
        />
      )}

      {/* v54：设计模式（全屏覆盖；只读提取 + 内存编辑 + 导出 JSON，不回写游戏） */}
      {screen === 'design' && (
        <DesignMode onBack={() => setScreen('title')} />
      )}

      {/* 覆盖层 */}
      {overlay === 'lobby' && <LobbyOverlay onClose={() => setOverlay('none')} onStart={onMpStart} />}
      {overlay === 'avatar' && <AvatarEditor onClose={() => setOverlay('none')} />}
      {overlay === 'settings' && (
        <SettingsModal
          settings={settings}
          onChange={setSettings}
          onClose={() => setOverlay(screen === 'game' ? 'pause' : 'none')}
          onOpenLayoutEditor={isMobile ? () => { setOverlay('none'); setLayoutEditorOpen(true) } : undefined}
        />
      )}
      {overlay === 'howto' && <HowToPlay onClose={() => setOverlay(screen === 'game' ? 'pause' : 'none')} />}
      {overlay === 'pause' && (
        <PauseMenu
          onResume={() => setOverlay('none')}
          onSettings={() => setOverlay('settings')}
          onHowTo={() => setOverlay('howto')}
          onRadio={() => setOverlay('radio')}
          showRadio={settings.bgmStyle === 'midi'}
          onUnstuck={() => { if (engine.startUnstuckCheck()) setOverlay('none') }}
          onQuit={quitToTitle}
        />
      )}
      {overlay === 'radio' && <RadioOverlay onClose={() => setOverlay('pause')} />}
      {overlay === 'inventory' && <InventoryOverlay engine={engine} onClose={() => setOverlay('none')} initialTab={invTab} />}
      {overlay === 'codex' && <InventoryOverlay engine={engine} onClose={() => setOverlay('none')} codexOnly />}
      {overlay === 'death' && (
        <DeathScreen
          engine={engine}
          cause={deathCause}
          onRetry={() => requestStart(undefined, engine.saveSlot === 'auto' ? 'slot1' : engine.saveSlot, engine.player.level)}
          onTitle={quitToTitle}
        />
      )}
      {overlay === 'victory' && (
        <VictoryScreen
          engine={engine}
          onNG={() => requestStart(undefined, engine.saveSlot === 'auto' ? 'slot1' : engine.saveSlot, engine.player.level)}
          onTitle={quitToTitle}
        />
      )}
    </div>
  )
}
