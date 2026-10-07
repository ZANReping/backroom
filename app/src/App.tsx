import CareerTracker from '@/components/CareerTracker'
// 应用状态机：标题 → 层级进入 → 游戏（HUD）→ 暂停/背包/死亡/胜利
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Routes, Route } from 'react-router'
import { engine } from '@/game/engine'
import type { SaveSlotId, SlotInfo } from '@/game/engine'
import { listSaveSlots, readSaveSlot, clearSaveSnapshot } from '@/game/engine/save'
import { storage } from '@/game/core/storage'
import { isPortraitOrientation } from '@/game/core/orientation'
import { getRenderer, look, type Renderer3D } from '@/game/core/renderer3d'
import { MouseLookInput, requestMouseCapture } from '@/game/core/mouseLook'
import * as THREE from 'three'
import { audio } from '@/game/core/audio'
import { randomSeed, parseSeedInput } from '@/game/core/rng'
import { preloadGameResources } from '@/game/core/preload'
import { getKeybinds, type KeyBindMap } from '@/game/core/keybinds'
import { LEVELS, levelLabel, levelNo, levelDefOf } from '@/game/levels'
import { generateLevel } from '@/game/world/mapgen'
import { prepareChunkWindow } from '@/game/world/chunkCache'
import { CS } from '@/game/world/infinite'
import type { HudEvent } from '@/game/engine'
import TitleScreen from '@/components/TitleScreen'
import SettingsModal, { createDefaultSettings, THEMES, type GameSettings } from '@/components/SettingsModal'
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
import FacilityPanel from '@/components/FacilityPanel'
import AvatarEditor from '@/components/AvatarEditor'
import DeathScreen from '@/components/DeathScreen'
import NotebookOverlay from '@/components/NotebookOverlay'
import VictoryScreen from '@/components/VictoryScreen'
import LootPanel from '@/components/LootPanel'
import FullscreenHint from '@/components/FullscreenHint'
import PortraitNotice from '@/components/PortraitNotice'
import LayoutEditor, { loadTouchLayout, type TouchLayoutStore } from '@/components/LayoutEditor'
import Cutscene, { type CutKind, type CutIn } from '@/components/Cutscene'
import DesignMode from '@/components/DesignMode' // v54：设计模式（开发者模式入口在标题屏）
import LobbyOverlay from '@/components/LobbyOverlay' // v58：联机大厅
import SquirtRadial, { type SquirtWheelAction, type SquirtWheelOption, type SquirtWheelState } from '@/components/SquirtRadial'
import { MpSession } from '@/game/net/session'
import { applyMpEvent } from '@/game/net/apply'
import { MULTIPLAYER_ENABLED } from '@/game/core/features'

type Screen = 'title' | 'loading' | 'intro' | 'game' | 'fall' | 'design'
type Overlay = 'none' | 'settings' | 'howto' | 'pause' | 'radio' | 'inventory' | 'codex' | 'death' | 'victory' | 'avatar' | 'notebook' | 'doc' | 'landmark' | 'dialog' | 'lobby' | 'facility'

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
  const [worldLoading, setWorldLoading] = useState(false)
  const worldLoadingRef = useRef(false)
  const updateWorldLoading = useCallback((loading: boolean) => {
    if (worldLoadingRef.current === loading) return
    worldLoadingRef.current = loading
    setWorldLoading(loading)
  }, [])
  const [settings, setSettings] = useState<GameSettings>(() => {
    const defaults = createDefaultSettings(typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window))
    try {
      const stored = JSON.parse(storage.get('br_settings') ?? '{}') as Record<string, unknown>
      delete stored.preloadAllLevels
      if(typeof stored.newGameSeed!=='string'||(stored.newGameSeed.trim()&&!parseSeedInput(stored.newGameSeed)&&parseSeedInput(stored.newGameSeed)!==0))delete stored.newGameSeed
      delete stored.dust // 已移除的旧版漂浮尘埃设置不再继续写回存档。
      return { ...defaults, ...stored, flicker:0,eyeAdaptation:typeof stored.eyeAdaptation==='boolean'?stored.eyeAdaptation:defaults.eyeAdaptation } as GameSettings
    } catch { return defaults }
  })
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const [log, setLog] = useState<LogEntry[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [damageFlash, setDamageFlash] = useState(0)
  const [sanityFlash, setSanityFlash] = useState(0)
  const [floorShift, setFloorShift] = useState<{ id: number; text: string } | null>(null)
  // v54：沉浸模式——F1 全沉浸（隐藏 HUD 层 + 手部建模/准星）；F2 半沉浸（仅隐藏 HUD 铬件，
  // 保留手部建模与准星）。两者互斥不叠加：按当前生效的键恢复，按另一个键直接切换模式。
  // 背包/图鉴/设置/战利品面板等覆盖层不受影响（只隐藏 HUD 铬件，面板类 UI 按现有逻辑正常显示）
  const [hudHidden, setHudHidden] = useState(false)
  const [squirtWheel, setSquirtWheel] = useState<SquirtWheelState | null>(null)
  // 指针锁定下鼠标移动与 keyup 都发生在 React 渲染之外，ref 保证它们读取同一帧的轮盘选择。
  const squirtWheelRef = useRef<SquirtWheelState | null>(null)
  // v23：切入切出过场（替代旧的简易 TransitionOverlay）
  const [cut, setCut] = useState<{ id: number; kind: CutKind; levelId?: number; cutIn?: CutIn; toName?: string; caption?: string } | null>(null)
  const cutSequence = useRef(0)
  const cutRef = useRef<typeof cut>(null)
  cutRef.current = cut
  const cutStageRef = useRef<'out' | 'loading' | 'in'>('out')
  const introPhaseRef = useRef<'presenting' | 'holding' | 'exiting'>('presenting')
  const pendingIntro = useRef(false)
  const [fallDmg, setFallDmg] = useState<number | null>(null)
  const [deathCause, setDeathCause] = useState('')
  const [docId, setDocId] = useState('meg_levels')
  const [landmarkId, setLandmarkId] = useState('alpha')
  const [dialogId, setDialogId] = useState('kat')
  const [factionPage,setFactionPage]=useState<string|undefined>()
  const [facilityFaction,setFacilityFaction]=useState('meg')
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

  useEffect(() => {
    if (screen !== 'game' || overlay !== 'none') {
      if (squirtWheelRef.current) {
        squirtWheelRef.current = null
        setSquirtWheel(null)
      }
      engine.inspectHeld = false
    }
  }, [screen, overlay])

  const isMobile = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window)

  // 自定义触屏按键布局（竖屏/横屏分开保存）
  const [touchLayout, setTouchLayout] = useState<TouchLayoutStore>(() => loadTouchLayout())
  const [layoutEditorOpen, setLayoutEditorOpen] = useState(false)
  // “无视”只对当前竖屏阶段生效；横屏后重新启用下次竖屏提示。
  const [portraitDismissed, setPortraitDismissed] = useState(false)
  const [, setOrientTick] = useState(0)
  useEffect(() => {
    const fn = () => {
      setOrientTick((n) => n + 1)
      if (!isPortraitOrientation()) setPortraitDismissed(false)
    }
    window.addEventListener('resize', fn)
    window.addEventListener('orientationchange', fn)
    window.screen.orientation?.addEventListener('change', fn)
    return () => {
      window.removeEventListener('resize', fn)
      window.removeEventListener('orientationchange', fn)
      window.screen.orientation?.removeEventListener('change', fn)
    }
  }, [])
  const landscapeNow = typeof window !== 'undefined' && window.innerWidth > window.innerHeight
  const portraitBlocked = isMobile && isPortraitOrientation() && !portraitDismissed
  const portraitBlockedRef = useRef(portraitBlocked)
  portraitBlockedRef.current = portraitBlocked
  useEffect(() => {
    if (!portraitBlocked) return
    engine.paused = true
    Object.assign(engine.input, { mx: 0, my: 0, sprint: false, crouch: false, jump: false, attack: false, interact: false, toggleLight: false })
    engine.inspectHeld = false
    if (document.pointerLockElement) document.exitPointerLock()
  }, [portraitBlocked])
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
    engine.devEnabled = settings.devMode
    if (!settings.devMode) engine.dev.mapReveal = false
    engine.dev.god = settings.devMode // 开发者模式：无敌
    // 界面主题：挂到 <html data-theme>，CSS 变量随之整体切换（见 index.css）
    document.documentElement.dataset.theme = settings.theme
    // 界面呈现与配色主题相互独立；挂到 html 后也能覆盖 createPortal 到 body 的地图等 UI。
    document.documentElement.dataset.ui = settings.uiPresentation
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
    const pausedUi = portraitBlocked || (screen === 'game' && (overlay === 'pause' || overlay === 'settings' || overlay === 'howto'))
    if (pausedUi) audio.suspendAll()
    else audio.resumeAll()
  }, [overlay, screen, portraitBlocked])

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
            cutStageRef.current = 'out'
            pendingIntro.current = false
            screenRef.current = 'game'
            setScreen('game')
            updateWorldLoading(true)
            const nextCut = {
              id: ++cutSequence.current,
              kind: e.anim as CutKind,
              levelId: d,
              cutIn: e.cutIn as CutIn | undefined,
              toName: d !== undefined ? (levelDefOf(d)?.label ?? `${levelLabel(d)} · ${levelDefOf(d)?.name ?? ''}`) : e.dest === 'win' ? undefined : '未知层级',
              caption: e.cutIn === 'outpost' ? '你跟着鲜黄色地标指示的路线，成功抵达了' : CUT_CAPTION[e.anim] ?? '你换了一层',
            }
            cutRef.current = nextCut
            setCut(nextCut)
            if (e.fallDamage) setTimeout(() => setFallDmg(e.fallDamage!), 900)
          } else if (e.anim === 'intro') {
            introPhaseRef.current = 'presenting'
            updateWorldLoading(!rendererRef.current?.isNearWorldReady(engine))
            if (cutRef.current && cutRef.current.levelId === undefined) {
              const levelId = engine.player.level
              const destination = levelDefOf(levelId)
              const toName = destination?.label ?? `${levelLabel(levelId)} · ${destination?.name ?? ''}`
              const completedCut = { ...cutRef.current, levelId, toName }
              cutRef.current = completedCut
              setCut(completedCut)
            }
            // 层级已载入：据点跳过层级卡（专属切入动画后直接进入）；其余若过场还在播，等过场结束再出层级卡
            if (levelDefOf(engine.player.level)?.gen === 'outpost') setScreen('game')
            else if (cutRef.current) pendingIntro.current = true
            else { screenRef.current = 'intro'; setScreen('intro') }
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
          updateWorldLoading(true)
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
        case 'faction':
          if(screenRef.current!=='game')break
          setFactionPage(e.text??'meg');setInvTab('图鉴');setOverlay('inventory');break
        case 'facility':
          if(screenRef.current!=='game')break
          setFacilityFaction(e.text??'meg');setOverlay('facility');break
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
  }, [addLog, updateWorldLoading])

  // 开始新一局的最终提交：先播开场坠落动画 FallIntro（新游戏），或直接进入存档层级（继续游戏）
  // v54：slot=绑定的存档槽（新游戏只能绑手动槽；继续游戏沿用所读槽位）
  const [fallPlaying, setFallPlaying] = useState(false)
  // v58：联机会话（非空=联机局进行中）
  const mpSessionRef = useRef<MpSession | null>(null)
  const onMpStart = useCallback((session: MpSession, seed: number) => {
    if (!MULTIPLAYER_ENABLED) {
      session.leave()
      return
    }
    mpSessionRef.current = session
    ;(window as unknown as { __mpSession: MpSession }).__mpSession = session // 调试/联机冒烟读取点
    engine.mpSession = session
    engine.mpMapSeed = (id: number) => (seed ^ Math.imul(id, 2654435761)) >>> 0 // 全房间同图（先到先得=同布局）
    engine.mpSpawnSlot = session.mySlot()
    session.onLocalEvent = (e) => applyMpEvent(engine, e)
    requestStart(seed, 'slot1', 0, true) // 强制新开局 + 播入场动画
  }, [])
  const commitStart = useCallback(async (seed?: number, slot: SaveSlotId = 'slot1', forceFresh = false) => {
    audio.resume()
    look.yaw = 0; look.pitch = 0
    const s = seed ?? parseSeedInput(settings.newGameSeed) ?? randomSeed()
    const fresh = seed === undefined || forceFresh // v58：联机开局强制新游戏（跳过读档恢复 + 播入场动画）
    if (fresh) {
      // 全新开局（非「继续游戏」）：清空 NPC 聊天记录与随机 NPC 图鉴记录
      storage.remove('br_npc_chat')
      const c = loadCodex()
      let cleared = false
      for (const k of Object.keys(c)) if (k.startsWith('npc_rand_')) { delete c[k]; cleared = true }
      if (cleared) saveCodex(c)
    }
    engine.newRun(s, settings.difficulty, slot, fresh)
    engine.paused = true
    setLoadState(prev => ({ ...prev, progress: 96, label: '准备附近场景', detail: '正在分帧构建入口并预热渲染', history: [...prev.history.slice(-7), '地图数据就绪，正在构建入口场景'] }))
    // The animation loop keeps rendering under LoadingScreen. Do not dismiss it
    // before the actual world exists (the old 100% was shown before newRun()).
    let preparationTime = 0, previousFrame = performance.now()
    while (!rendererRef.current?.isNearWorldReady(engine)) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      const now = performance.now()
      // Background tabs suspend animation frames; only count active wait time.
      preparationTime += Math.min(100, now - previousFrame); previousFrame = now
      if (preparationTime > 120_000) throw new Error('入口场景准备超时')
    }
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    setLoadState(prev => ({ ...prev, progress: 100, label: '进入后室', detail: '入口场景就绪' }))
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
  }, [settings.difficulty, settings.newGameSeed, refreshSlots])

  // 点击「开始游戏/继续游戏」后：显示加载界面 → 预载贴图/BGM 资源并回报进度 → 再进入游戏。
  // 预载失败一律降级放行（渲染层/音频层均有程序化兜底）。
  const requestStart = useCallback((seed?: number, slot: SaveSlotId = 'slot1', targetLevel = seed !== undefined ? engine.player.level : 0, forceFresh = false) => {
    if (loadingRef.current) return
    loadingRef.current = true
    if (seed === undefined || forceFresh) targetLevel = 0
    audio.resume() // 用户手势内解锁 WebAudio
    const runSeed = seed ?? parseSeedInput(settings.newGameSeed) ?? randomSeed()
    setLog([])
    setOverlay('none')
    setLoadState({ progress: 2, label: '初始化加载器', detail: '正在准备资源清单', history: [] })
    setScreen('loading')
    void preloadGameResources({ targetLevel, bgmStyle: settings.bgmStyle, allLevels: false }, (u) => {
      setLoadState((prev) => ({
        progress: Math.max(prev.progress, u.progress),
        label: u.label,
        detail: u.detail,
        history: u.log ? [...prev.history.slice(-7), u.log] : prev.history,
      }))
    }).catch(() => undefined).then(async () => {
      try {
        const snap = seed !== undefined && !forceFresh ? readSaveSlot(slot) : null
        const def = levelDefOf(targetLevel)!
        const mapSeed = snap?.mapSeed ?? engine.mpMapSeed?.(targetLevel) ?? runSeed
        await prepareChunkWindow(def, mapSeed, 0, 0, progress => {
          setLoadState(prev => ({ ...prev, progress: Math.max(prev.progress, 88 + Math.floor(progress*7)), label: '生成初始地图', detail: `Level ${targetLevel} · 后台准备区块 ${Math.round(progress*100)}%` }))
        })
        if (def.infinite && snap?.worldPos && Number.isFinite(snap.worldPos.x) && Number.isFinite(snap.worldPos.y)) {
          const cx = Math.floor(snap.worldPos.x / CS), cy = Math.floor(snap.worldPos.y / CS)
          if (cx !== 0 || cy !== 0) {
            setLoadState(prev => ({ ...prev, label: '恢复存档附近场景', detail: '正在准备上次离开的位置' }))
            await prepareChunkWindow(def, mapSeed, cx, cy)
          }
        }
        await commitStart(runSeed, slot, seed === undefined || forceFresh)
      }
      catch (err) {
        console.error('[loading] 进入游戏失败，返回标题', err)
        setScreen('title')
        refreshSlots()
      }
      finally { loadingRef.current = false }
    })
  }, [settings.bgmStyle, settings.newGameSeed, commitStart, refreshSlots])

  // v54：从槽位继续（读快照取种子与层级）；空槽回退为新游戏
  const continueSlot = useCallback((slot: SaveSlotId) => {
    const snap = readSaveSlot(slot)
    if (snap) requestStart(snap.seed, slot, snap.level)
    else requestStart(undefined, slot === 'auto' ? 'slot1' : slot, 0)
  }, [requestStart])

  // 键盘输入（v18：全部键位读自定义绑定表 getKeybinds()，方向键/Ctrl/Tab 为始终生效的辅助键）
  useEffect(() => {
    const keys: Record<string, boolean> = {}
    type ReloadHold = { timer: number; wheelOpened: boolean }
    let reloadHold: ReloadHold | null = null
    const heldSquirtGun = () => engine.player.hotbar[engine.player.selected]?.type === 'squirtgun'
    const publishWheel = (wheel: SquirtWheelState | null) => {
      squirtWheelRef.current = wheel
      setSquirtWheel(wheel)
    }
    const openSquirtWheel = () => {
      if (portraitBlockedRef.current || !heldSquirtGun() || screenRef.current !== 'game' || overlayRef.current !== 'none') return false
      const options: SquirtWheelOption[] = engine.squirtTank === 'none'
        ? [
            { action: 'water', label: '清水', detail: '无需物品', color: '#79cde8' },
            ...(engine.countItem('almond') > 0 ? [{ action: 'almond', label: '杏仁水', detail: `背包 ×${engine.countItem('almond')}`, color: '#a7d982' }] as SquirtWheelOption[] : []),
            ...(engine.countItem('cashew') > 0 ? [{ action: 'cashew', label: '腰果水', detail: `背包 ×${engine.countItem('cashew')}`, color: '#c59a57' }] as SquirtWheelOption[] : []),
            ...(engine.countItem('liquidpain') > 0 ? [{ action: 'liquidpain', label: '液态痛苦', detail: `背包 ×${engine.countItem('liquidpain')}`, color: '#d65343' }] as SquirtWheelOption[] : []),
          ]
        : [{ action: 'clear', label: '清空储罐', detail: `${engine.squirtAmmo} 份残液`, color: '#d06a55' }]
      publishWheel({ options, selected: 'cancel', cursorX: 0, cursorY: 0 })
      audio.uiTick()
      return true
    }
    const executeWheelAction = (action: SquirtWheelAction) => {
      if (action === 'cancel') return
      if (action === 'clear') {
        if (engine.squirtTank !== 'none') engine.squirtQuickLiquid = engine.squirtTank
        engine.clearSquirt()
        return
      }
      engine.squirtQuickLiquid = action
      engine.loadSquirt(action)
    }
    const quickReloadSquirt = () => {
      const liquid = engine.squirtTank === 'none' ? engine.squirtQuickLiquid : engine.squirtTank
      engine.loadSquirt(liquid)
    }
    // 页签键：背包/地图/图鉴/任务/状态/日志——游戏中直开对应页签；背包打开时切换页签，再按当前页签键关闭
    const tabKeys = (kb: KeyBindMap): [string, typeof invTab][] => [
      [kb.inventory, '背包'], ['Tab', '背包'], [kb.map, '地图'],
      [kb.codex, '图鉴'], [kb.quest, '任务'], [kb.status, '状态'], [kb.log, '日志'],
    ]
    const openTab = (t: typeof invTab) => { discoverFromEngine(engine);setFactionPage(undefined); setInvTab(t); setOverlay('inventory') }
    const down = (e: KeyboardEvent) => {
      if (portraitBlockedRef.current) return
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
      if (c === b.inspect) engine.inspectHeld = true
      if (c === b.reload && !e.repeat && heldSquirtGun()) {
        e.preventDefault()
        if (!reloadHold) {
          const hold: ReloadHold = { timer: 0, wheelOpened: false }
          reloadHold = hold
          hold.timer = window.setTimeout(() => {
            if (reloadHold !== hold) return
            hold.wheelOpened = openSquirtWheel()
          }, 300)
        }
      }
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
      if (e.code === b.inspect) engine.inspectHeld = false
      if (e.code === b.reload && reloadHold) {
        const hold = reloadHold
        reloadHold = null
        window.clearTimeout(hold.timer)
        const action = squirtWheelRef.current?.selected ?? 'cancel'
        publishWheel(null)
        if (!portraitBlockedRef.current && screenRef.current === 'game' && overlayRef.current === 'none' && heldSquirtGun()) {
          if (hold.wheelOpened) executeWheelAction(action)
          else quickReloadSquirt()
        }
      }
      updateMove()
    }
    const updateMove = () => {
      if (portraitBlockedRef.current) {
        for (const key of Object.keys(keys)) delete keys[key]
        engine.input.mx = 0; engine.input.my = 0
        engine.input.sprint = false; engine.input.crouch = false
        return
      }
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
      if (reloadHold) window.clearTimeout(reloadHold.timer)
      reloadHold = null
      publishWheel(null)
      engine.inspectHeld = false
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [portraitBlocked])

  // 标签页隐藏自动暂停
  useEffect(() => {
    const fn = () => {
      if (document.hidden && screenRef.current === 'game' && overlayRef.current === 'none') setOverlay('pause')
    }
    document.addEventListener('visibilitychange', fn)
    return () => document.removeEventListener('visibilitychange', fn)
  }, [])

  // 鼠标捕获的生命周期独立于画面设置，避免重建渲染循环时撤销正在建立的锁定。
  useEffect(() => {
    const canvas = canvasRef.current!
    // 桌面 Pointer Lock 鼠标视角
    let capturePending = false
    let rawRequestAccepted = false
    // Owning the element alone does not prove raw capture has completed (for
    // example an old lock can survive HMR). Keep input closed until both agree.
    let rawCaptureReady = false
    let disposed = false
    const canCapture = () => !disposed && !portraitBlockedRef.current && screenRef.current === 'game' && overlayRef.current === 'none' && document.hasFocus() && !document.hidden
    const onClick = () => {
      if (isMobile) return
      if (canCapture() && (!rawCaptureReady || document.pointerLockElement !== canvas) && !capturePending && typeof canvas.requestPointerLock === 'function') {
        capturePending = true
        rawRequestAccepted = false
        rawCaptureReady = false
        look.locked = false
        canvas.dataset.mouseInput = 'pending'
        void requestMouseCapture(canvas).then(() => {
          // Permission UI can transiently change focus. Only a real screen/menu
          // change cancels an acquired lock; the browser handles focus loss.
          if (disposed || portraitBlockedRef.current || screenRef.current !== 'game' || overlayRef.current !== 'none') {
            if (document.pointerLockElement === canvas) document.exitPointerLock()
            return
          }
          rawRequestAccepted = true
          rawCaptureReady = document.pointerLockElement === canvas
          canvas.dataset.mouseInput = rawCaptureReady ? 'raw' : 'unlocked'
          onFocusChange()
        }).catch(() => {
          // Escape, focus loss, or a denied capture leave the camera inactive.
          rawRequestAccepted = false
          rawCaptureReady = false
          canvas.dataset.mouseInput = 'unlocked'
          if (document.pointerLockElement === canvas) document.exitPointerLock()
          look.locked = false
        }).finally(() => { capturePending = false })
      }
    }
    const mouseLook = new MouseLookInput()
    const onLockChange = () => {
      if (document.pointerLockElement !== canvas) rawRequestAccepted = false
      rawCaptureReady = rawRequestAccepted && document.pointerLockElement === canvas
      canvas.dataset.mouseInput = rawCaptureReady ? 'raw' : capturePending ? 'pending' : 'unlocked'
      look.locked = rawCaptureReady && document.pointerLockElement === canvas
      mouseLook.reset(performance.now())
    }
    const onFocusChange = () => { mouseLook.reset(performance.now());look.locked=rawCaptureReady&&document.hasFocus()&&!document.hidden&&document.pointerLockElement===canvas }
    // Pointer Lock's mousemove is the authoritative relative-motion stream.
    // Do not also consume pointermove/coalesced events or reconstruct movement
    // from screen coordinates: the browser can recenter its hidden OS cursor.
    const motionEvent = 'mousemove'
    const onMouseMove = (e: MouseEvent) => {
      if ('pointerType' in e && e.pointerType !== 'mouse') return
      look.locked=rawCaptureReady&&document.pointerLockElement===canvas
      const active=!isMobile&&look.locked&&document.hasFocus()&&!document.hidden&&
        screenRef.current==='game'&&overlayRef.current==='none'&&!engine.paused&&cutRef.current===null
      const delta=mouseLook.read(e,active)
      if(!delta)return
      const wheel = squirtWheelRef.current
      if (wheel) {
        const nextX = wheel.cursorX + delta.x
        const nextY = wheel.cursorY + delta.y
        const length = Math.hypot(nextX, nextY)
        const maxRadius = 108
        const scale = length > maxRadius ? maxRadius / length : 1
        const cursorX = nextX * scale
        const cursorY = nextY * scale
        let selected: SquirtWheelAction = 'cancel'
        if (Math.hypot(cursorX, cursorY) >= 30 && wheel.options.length > 0) {
          const raw = Math.atan2(cursorY, cursorX) + Math.PI / 2
          const normalized = (raw + Math.PI * 2) % (Math.PI * 2)
          const index = Math.round(normalized / (Math.PI * 2 / wheel.options.length)) % wheel.options.length
          selected = wheel.options[index].action
        }
        const next = { ...wheel, selected, cursorX, cursorY }
        squirtWheelRef.current = next
        setSquirtWheel(next)
        if (selected !== wheel.selected) audio.uiTick()
        return
      }
      look.yaw -= delta.x * 0.0024 * sensRef.current
      look.pitch = Math.max(-1.2, Math.min(1.2, look.pitch - delta.y * 0.0022 * sensRef.current))
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
      if (portraitBlockedRef.current || screenRef.current !== 'game' || overlayRef.current !== 'none') return
      fireDiscrete(`Mouse${e.button}`)
    }
    // 屏蔽右键菜单（游戏中右键默认用作快捷使用）
    const onContextMenu = (e: Event) => {
      if (screenRef.current === 'game') e.preventDefault()
    }
    // 滚轮：先分发给绑定到 WheelUp/WheelDown 的动作，再循环切换快捷栏选中格
    const onWheel = (e: WheelEvent) => {
      if (!look.locked) return
      if (portraitBlockedRef.current || screenRef.current !== 'game' || overlayRef.current !== 'none') return
      fireDiscrete(e.deltaY < 0 ? 'WheelUp' : 'WheelDown')
      const dir = e.deltaY > 0 ? 1 : -1
      engine.player.selected = (engine.player.selected + dir + engine.player.hotbar.length) % engine.player.hotbar.length
      audio.uiTick()
    }
    canvas.addEventListener('click', onClick)
    document.addEventListener('pointerlockchange', onLockChange)
    window.addEventListener('blur',onFocusChange)
    window.addEventListener('focus',onFocusChange)
    document.addEventListener('visibilitychange',onFocusChange)
    window.addEventListener(motionEvent, onMouseMove)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('wheel', onWheel, { passive: true })

    onLockChange()
    return () => {
      disposed = true
      canvas.removeEventListener('click', onClick)
      document.removeEventListener('pointerlockchange', onLockChange)
      window.removeEventListener('blur',onFocusChange)
      window.removeEventListener('focus',onFocusChange)
      document.removeEventListener('visibilitychange',onFocusChange)
      window.removeEventListener(motionEvent, onMouseMove)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('wheel', onWheel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 主循环（Three.js 第一人称渲染）
  useEffect(() => {
    const canvas = canvasRef.current!
    const renderer = getRenderer(canvas)
    rendererRef.current = renderer
    renderer.setResolutionMode(settingsRef.current.renderResolution)
    // 诊断钩子（自动化测试用）：暴露渲染器与 THREE 构造器
    ;(window as unknown as { __renderer: typeof renderer }).__renderer = renderer
    ;(window as unknown as { __THREE: typeof THREE }).__THREE = THREE
    let raf = 0
    let last = performance.now()
    let hudAcc = 0
    let frameTimes: number[] = []
    let resScale = 1
    let resolutionKey = ''
    let pendingMap: typeof engine.map = null
    let waitingForMap = false
    let resolutionChangedAt = 0

    const resize = () => {
      const settings = settingsRef.current
      renderer.setResolutionMode(settings.renderResolution)
      const nativeDpr = Math.min(window.devicePixelRatio || 1, Math.max(.75, Math.min(2, settings.maxPixelRatio)))
      const targetHeight = settings.renderResolution === '720p' ? 720
        : settings.renderResolution === '480p_retro' ? 360
          : settings.renderResolution === '320p_ps1' ? 180
            : 0
      const baseScale = Math.max(0.5, Math.min(1, settings.renderScale / 100))
      const dpr = targetHeight > 0
        ? Math.max(0.05, Math.min(nativeDpr, targetHeight / Math.max(1, window.innerHeight)))
        : nativeDpr * baseScale * resScale
      renderer.resize(window.innerWidth, window.innerHeight, dpr)
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      canvas.style.imageRendering = settings.renderResolution === '480p_retro' || settings.renderResolution === '320p_ps1' ? 'pixelated' : 'auto'
    }
    resize()
    window.addEventListener('resize', resize)

    // 标题吸引模式地图
    let attractMap: ReturnType<typeof generateLevel> | null = null
    let attractPreparing = false
    let alive = true

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const settings = settingsRef.current
      const dt = (now - last) / 1000
      last = now
      if (document.hidden) { frameTimes = []; return }
      const nextResolutionKey = `${settings.renderResolution}:${settings.renderScale}:${settings.maxPixelRatio}:${settings.dynamicRes}:${settings.dynamicResTarget}`
      if (nextResolutionKey !== resolutionKey) {
        resolutionKey = nextResolutionKey; resScale = 1; frameTimes = []; resize()
      }
      // 动态分辨率
      if (settings.renderResolution === 'native' && settings.dynamicRes && dt < .25 && !loadingRef.current && !waitingForMap && !engine.transition) {
        frameTimes.push(now)
        if (frameTimes.length > 30) {
          const avg = (frameTimes[frameTimes.length - 1] - frameTimes[0]) / (frameTimes.length - 1)
          const minScale = engine.player.level === 5 ? 0.5 : 0.6
          const frameBudget = 1000 / settings.dynamicResTarget
          if (avg > frameBudget * 1.12 && resScale > minScale && now - resolutionChangedAt > 900) {
            resScale = Math.max(minScale, resScale - 0.1); resolutionChangedAt = now; resize()
          } else if (avg <= frameBudget * 1.04 && resScale < 1 && now - resolutionChangedAt > 5000) {
            // A 60 Hz display cannot reach the old 0.84 × 60 fps threshold.
            // Probe recovery slowly; sustained overload backs down on the next window.
            resScale = Math.min(1, resScale + 0.05); resolutionChangedAt = now; resize()
          }
          frameTimes = []
        }
      } else frameTimes = []

      const paused = overlayRef.current !== 'none' && overlayRef.current !== 'death' && overlayRef.current !== 'victory'
      // v23：过场演出播放中、且引擎的层级切换已完成 → 冻结操作，等过场放完再交还控制权
      const cine = cutRef.current !== null && engine.transition === null
      // Give the title/cut animation exclusive frame time while it enters or
      // leaves. World preparation runs only under the fully presented card.
      const presenting = (cutRef.current !== null && cutStageRef.current !== 'loading')
        || (screenRef.current === 'intro' && introPhaseRef.current !== 'holding')
      if (engine.map !== pendingMap) { pendingMap = engine.map; waitingForMap = true }
      if (waitingForMap && renderer.isNearWorldReady(engine)) waitingForMap = false
      engine.paused = portraitBlockedRef.current || paused || screenRef.current !== 'game' || cine || waitingForMap || presenting
      if (presenting) return

      if (screenRef.current === 'title' || screenRef.current === 'design') {
        // 吸引模式：L0 出生点缓慢环视（v54：设计模式全屏覆盖，背景同走吸引模式，引擎保持暂停）
        if (!attractMap && !attractPreparing) {
          attractPreparing = true
          void prepareChunkWindow(LEVELS[0], 1337).then(() => {
            if (alive && (screenRef.current === 'title' || screenRef.current === 'design')) {
              attractMap = generateLevel(LEVELS[0], 1337)
            }
          }).finally(() => { attractPreparing = false })
        }
        if (!attractMap) return
        look.yaw += dt * 0.18
        look.pitch = Math.sin(now / 4000) * 0.08
        const savedMap = engine.map
        const savedLevel = engine.player.level
        const px = engine.player.x, py = engine.player.y
        const fl = engine.player.flashlight
        engine.map = attractMap
        engine.player.level = 0
        engine.player.x = attractMap.spawn.x + 0.5
        engine.player.y = attractMap.spawn.y + 0.5
        engine.player.flashlight = true
        renderer.render(canvas, engine, { grain: settings.grain, flicker: 0, shake: false }, dt)
        engine.player.x = px; engine.player.y = py
        engine.player.flashlight = fl
        engine.map = savedMap
        engine.player.level = savedLevel
      } else {
        renderer.applyView(engine)
        engine.update(dt)
        if ((cutRef.current && cutStageRef.current !== 'loading')
          || (screenRef.current === 'intro' && introPhaseRef.current !== 'holding')) return
        mpSessionRef.current?.tick(engine, dt) // v58：联机状态同步（12Hz）
        renderer.render(canvas, engine, { grain: settings.grain, flicker: 0, shake: settings.shake }, dt)
        // loadLevel can replace the map inside update(). Publish readiness for
        // that exact map immediately, independently of the throttled HUD rate.
        if (engine.map !== pendingMap) { pendingMap = engine.map; waitingForMap = true }
        if (waitingForMap || screenRef.current === 'intro' || (cutRef.current && !engine.transition)) {
          waitingForMap = !renderer.isNearWorldReady(engine)
        }
        updateWorldLoading(waitingForMap || !!engine.transition)
      }

      hudAcc += dt
      if (hudAcc > 1 / settings.hudRefreshRate) {
        hudAcc = 0; setTick((n) => n + 1)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // 画面设置：不重建关卡即可即时调整的渲染负载与相机参数。
  useEffect(() => {
    const r = rendererRef.current
    if (!r) return
    r.setFov(settings.cameraFov)
    r.setTextureQuality(settings.textureQuality)
    r.setDetailDistance(settings.detailDistance / 100)
    r.setWallOcclusion(settings.wallOcclusion)
    r.setParticleDensity(settings.particleDensity / 100)
    r.setShadowUpdateRate(settings.shadowUpdateRate)
    r.setSceneLightLimit(settings.sceneLightLimit)
    r.setChunkBudget(settings.chunkBudgetMs)
    r.setLoadingBudget(settings.loadingBudgetMs)
  }, [settings.cameraFov, settings.textureQuality, settings.detailDistance, settings.wallOcclusion, settings.particleDensity, settings.shadowUpdateRate, settings.sceneLightLimit, settings.chunkBudgetMs, settings.loadingBudgetMs])

  // 画面设置：距离雾远近 / 远处灯光全开
  useEffect(() => {
    rendererRef.current?.setFogScale(settings.fogScale / 100)
  }, [settings.fogScale])
  useEffect(() => {
    rendererRef.current?.setDarknessBoost(settings.darknessBoost / 100)
  }, [settings.darknessBoost])
  useEffect(() => {
    rendererRef.current?.setFarLights(settings.farLights)
  }, [settings.farLights])

  // 画面设置：VCR 色差/跟踪失真、强度与动态扫描线可分别控制。
  useEffect(() => {
    const r = rendererRef.current
    if (!r) return
    r.setVcrFx(settings.vcrFx)
    r.setVcrStrength(settings.vcrStrength)
    r.setVcrScanlines(settings.vcrScanlines)
  }, [settings.vcrFx, settings.vcrStrength, settings.vcrScanlines])

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
    r.setEyeAdaptation(settings.eyeAdaptation)
    r.setPhotography(settings.ambientOcclusion??1,settings.grain?settings.grainStrength:0,settings.vignetteStrength,settings.colorGrade,settings.scanlineStrength)
  }, [settings.lightMode, settings.realWater, settings.shadowQuality, settings.sunShadows, settings.lightShadows, settings.reflectivity, settings.bloomFx, settings.bloomStrength, settings.exposure,settings.eyeAdaptation,settings.ambientOcclusion,settings.grain,settings.grainStrength,settings.vignetteStrength,settings.colorGrade,settings.scanlineStrength])

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
    cutRef.current = null
    setCut(null)
    pendingIntro.current = false
    audio.stopHum()
    audio.stopRain() // v54：L4 雨声随退出停止
    audio.stopBGM()
    setOverlay('none')
    setScreen('title')
    refreshSlots() // v54：回标题刷新槽位列表（暂停落盘在引擎 idleSaved 路径已完成）
  }

  const levelDef = engine.levelDef

  const scanlineBase = settings.theme === 'database' ? 0.5 : ['liminal', 'basalt', 'fandom', 'meg'].includes(settings.theme) ? 0.22 : 0.6
  const appStyle = {
    background: 'var(--ink)',
    '--scanline-opacity': String(Math.min(1, scanlineBase * settings.scanlineStrength / 60)),
    '--grain-opacity': String(0.12 * settings.grainStrength / 100),
  } as CSSProperties

  return (
    <>
    <div inert={portraitBlocked} data-ui={settings.uiPresentation} className={`br-app fixed inset-0 overflow-hidden ${customPause ? 'br-hide-hud-pause' : ''}`} style={appStyle}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed', top: 0, left: 0, zIndex: 1,
          imageRendering: settings.renderResolution === '480p_retro' || settings.renderResolution === '320p_ps1' ? 'pixelated' : 'auto',
        }}
      />

      {/* 沉浸式 UI 的低存在感取景框；纯装饰，不参与命中测试，也不增加逐帧状态。 */}
      <div className="immersive-ui-frame" aria-hidden="true">
        <i className="immersive-corner immersive-corner-tl" />
        <i className="immersive-corner immersive-corner-tr" />
        <i className="immersive-corner immersive-corner-bl" />
        <i className="immersive-corner immersive-corner-br" />
        <span className="immersive-frame-id">REC // BRC-09</span>
        <span className="immersive-frame-signal">FIELD ARCHIVE · SIGNAL LIVE</span>
      </div>

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
          key={cut.id}
          kind={cut.kind}
          levelId={cut.levelId}
          cutIn={cut.cutIn}
          toName={cut.toName}
          caption={cut.caption}
          ready={!worldLoading}
          onStageChange={(stage) => { cutStageRef.current = stage }}
          onDone={() => {
            cutRef.current = null
            setCut(null)
            if (pendingIntro.current) { pendingIntro.current = false; introPhaseRef.current = 'presenting'; screenRef.current = 'intro'; setScreen('intro') }
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
          key={engine.mapRev}
          level={levelNo(levelDef.id)}
          levelId={levelDef.id}
          name={levelDef.name}
          flavor={levelDef.flavor}
          seed={engine.seed}
          ready={!worldLoading}
          onPhaseChange={(phase) => { introPhaseRef.current = phase }}
          onDone={() => {
            if (worldLoadingRef.current || !rendererRef.current?.isNearWorldReady(engine)) {
              updateWorldLoading(true)
              return
            }
            setScreen('game')
          }}
        />
      )}

      {/* 开场坠落动画（街道→坠落→摔进 L0；淡出时进入游戏，爬起动画由引擎 introT 驱动） */}
      {fallPlaying && (
        <FallIntro
          onReveal={() => setScreen('game')}
          onDone={() => { setFallPlaying(false); setScreen('game') }}
        />
      )}

      {screen === 'game' && worldLoading && !cut && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/90 text-amber-100" role="status">正在准备附近场景…</div>
      )}
      {screen === 'game' && overlay === 'none' && !hudHidden && <CareerTracker />}
      {/* HUD（v54：沉浸模式 F1 隐藏整层；战利品面板等覆盖 UI 不受影响） */}
      {screen === 'game' && overlay !== 'death' && overlay !== 'victory' && !hudHidden && (
        <HUD
          engine={engine}
          isMobile={isMobile}
          log={log}
          toasts={toasts}
          devMode={settings.devMode}
          fxScale={0}
          onPause={() => setOverlay('pause')}
          onInventory={() => { discoverFromEngine(engine); setInvTab('背包'); setOverlay('inventory') }}
          onSelectSlot={(i) => { engine.player.selected = i; audio.uiTick() }}
          onUseSlot={(i) => engine.useSlot('hotbar', i)}
        />
      )}
      {screen === 'game' && overlay === 'none' && squirtWheel && <SquirtRadial wheel={squirtWheel} />}
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
      {screen === 'game' && isMobile && !portraitBlocked && overlay === 'none' && !hudHidden && (
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
          onMultiplayer={MULTIPLAYER_ENABLED ? () => setOverlay('lobby') : undefined}
          devMode={settings.devMode}
          onDesign={() => setScreen('design')}
        />
      )}

      {/* v54：设计模式（全屏覆盖；只读提取 + 内存编辑 + 导出 JSON，不回写游戏） */}
      {screen === 'design' && (
        <DesignMode onBack={() => setScreen('title')} />
      )}

      {/* 覆盖层 */}
      {MULTIPLAYER_ENABLED && overlay === 'lobby' && <LobbyOverlay onClose={() => setOverlay('none')} onStart={onMpStart} />}
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
      {overlay === 'facility' && <FacilityPanel faction={facilityFaction} onClose={()=>setOverlay('none')}/>}
      {overlay === 'inventory' && <InventoryOverlay key={factionPage??'all'} engine={engine} onClose={() => {setOverlay('none');setFactionPage(undefined)}} initialTab={invTab} initialFaction={factionPage} />}
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
    {portraitBlocked && <PortraitNotice onIgnore={() => setPortraitDismissed(true)} />}
    </>
  )
}

