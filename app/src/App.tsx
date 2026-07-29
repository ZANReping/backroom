// 应用状态机：标题 → 层级进入 → 游戏（HUD）→ 暂停/背包/死亡/胜利
import { useCallback, useEffect, useRef, useState } from 'react'
import { Routes, Route } from 'react-router'
import { engine } from '@/game/engine'
import { storage } from '@/game/storage'
import { getRenderer, look, type Renderer3D } from '@/game/renderer3d'
import * as THREE from 'three'
import { audio } from '@/game/audio'
import { randomSeed } from '@/game/rng'
import { getKeybinds } from '@/game/keybinds'
import { LEVELS, levelLabel, levelNo } from '@/game/levels'
import { generateLevel } from '@/game/mapgen'
import type { HudEvent } from '@/game/engine'
import TitleScreen from '@/components/TitleScreen'
import SettingsModal, { defaultSettings, type GameSettings } from '@/components/SettingsModal'
import HowToPlay from '@/components/HowToPlay'
import LevelIntro from '@/components/LevelIntro'
import FallIntro from '@/components/FallIntro'
import HUD, { type LogEntry, type Toast } from '@/components/HUD'
import TouchControls from '@/components/TouchControls'
import PauseMenu from '@/components/PauseMenu'
import InventoryOverlay, { discoverFromEngine, loadCodex, saveCodex } from '@/components/InventoryOverlay'
import DocOverlay from '@/components/DocOverlay'
import AvatarEditor from '@/components/AvatarEditor'
import DeathScreen from '@/components/DeathScreen'
import NotebookOverlay from '@/components/NotebookOverlay'
import VictoryScreen from '@/components/VictoryScreen'
import LootPanel from '@/components/LootPanel'
import FullscreenHint from '@/components/FullscreenHint'
import LayoutEditor, { loadTouchLayout, type TouchLayoutStore } from '@/components/LayoutEditor'
import Cutscene, { type CutKind, type CutIn } from '@/components/Cutscene'

type Screen = 'title' | 'intro' | 'game' | 'fall'
type Overlay = 'none' | 'settings' | 'howto' | 'pause' | 'inventory' | 'codex' | 'death' | 'victory' | 'avatar' | 'notebook' | 'doc'

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
  // v23：切入切出过场（替代旧的简易 TransitionOverlay）
  const [cut, setCut] = useState<{ kind: CutKind; cutIn?: CutIn; toName?: string; caption?: string } | null>(null)
  const cutRef = useRef<typeof cut>(null)
  cutRef.current = cut
  const pendingIntro = useRef(false)
  const [fallDmg, setFallDmg] = useState<number | null>(null)
  const [deathCause, setDeathCause] = useState('')
  const [docId, setDocId] = useState('meg_levels')
  const [invTab, setInvTab] = useState<'背包' | '地图'>('背包')
  const [hasSave, setHasSave] = useState(() => !!storage.get('br_save'))
  const [, setTick] = useState(0)
  const overlayRef = useRef(overlay)
  overlayRef.current = overlay
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
    engine.dev.god = settings.devMode // 开发者模式：无敌
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

  const addLog = useCallback((text: string, kind: string) => {
    setLog((l) => [...l.slice(-20), { id: logId++, text, kind, t: Date.now() }])
  }, [])

  // 引擎事件
  useEffect(() => {
    const handler = (e: HudEvent) => {
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
        case 'transition':
          if (e.anim && e.anim !== 'intro') {
            const d = typeof e.dest === 'number' ? e.dest : undefined
            setCut({
              kind: e.anim as CutKind,
              cutIn: e.cutIn as CutIn | undefined,
              toName: d !== undefined ? `${levelLabel(d)} · ${LEVELS[d]?.name ?? ''}` : e.dest === 'win' ? undefined : '未知层级',
              caption: CUT_CAPTION[e.anim] ?? '你换了一层',
            })
            if (e.fallDamage) setTimeout(() => setFallDmg(e.fallDamage!), 900)
          } else if (e.anim === 'intro') {
            // 层级已载入：若过场还在播，等过场结束再出层级卡
            if (cutRef.current) pendingIntro.current = true
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
      }
    }
    // 返回取消订阅函数作为清理：StrictMode 双调用/HMR 重挂载时不再累积监听器（播报重复好几遍的根因）
    return engine.on(handler)
  }, [addLog])

  // 开始新一局（先播开场坠落动画 FallIntro，淡出时进入游戏并播爬起动画）
  const [fallPlaying, setFallPlaying] = useState(false)
  const startRun = useCallback((seed?: number) => {
    audio.resume()
    look.yaw = 0; look.pitch = 0
    const s = seed ?? randomSeed()
    engine.newRun(s, settings.difficulty)
    engine.paused = true
    setLog([])
    setOverlay('none')
    setFallPlaying(true)
    setScreen('fall')
    storage.set('br_save', JSON.stringify({ seed: s, difficulty: settings.difficulty }))
    setHasSave(true)
  }, [settings.difficulty])

  // 键盘输入（v18：全部键位读自定义绑定表 getKeybinds()，方向键/Ctrl/Tab 为始终生效的辅助键）
  useEffect(() => {
    const keys: Record<string, boolean> = {}
    const down = (e: KeyboardEvent) => {
      if (screenRef.current !== 'game' || overlayRef.current !== 'none') {
        const kb = getKeybinds()
        // 背包打开时再按背包键/Tab 关闭背包（v22 背包键切换）
        if ((e.code === kb.inventory || e.code === 'Tab') && overlayRef.current === 'inventory') {
          e.preventDefault(); setOverlay('none')
        } else if (e.key === 'Escape' && overlayRef.current !== 'none' && overlayRef.current !== 'death' && overlayRef.current !== 'victory') {
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
      if (c === b.jump) { engine.input.jump = true; e.preventDefault() }
      if (c === b.inventory || c === 'Tab') { e.preventDefault(); discoverFromEngine(engine); setInvTab('背包'); setOverlay('inventory') }
      if (c === b.map) { discoverFromEngine(engine); setInvTab('地图'); setOverlay('inventory') }
      // Esc：面板打开时优先关面板，再按才暂停
      if (c === 'Escape') { if (engine.lootPanel) { engine.closeLootPanel(); setTick((n) => n + 1) } else setOverlay('pause') }
      for (let i = 0; i < engine.player.hotbar.length; i++) if (c === b[`slot${i + 1}`]) engine.player.selected = i
      updateMove()
    }
    const up = (e: KeyboardEvent) => {
      keys[e.code] = false
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
      const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? mobileDprCap : 2) * resScale
      renderer.resize(window.innerWidth, window.innerHeight, dpr)
      canvas.style.width = '100%'
      canvas.style.height = '100%'
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
      if (settings.dynamicRes) {
        frameTimes.push(now)
        if (frameTimes.length > 30) {
          const avg = (frameTimes[frameTimes.length - 1] - frameTimes[0]) / frameTimes.length
          if (avg > 20 && resScale > 0.6) { resScale -= 0.1; resize() }
          else if (avg < 14 && resScale < 1) { resScale += 0.05; resize() }
          frameTimes = []
        }
      }

      const paused = overlayRef.current !== 'none' && overlayRef.current !== 'death' && overlayRef.current !== 'victory'
      // v23：过场演出播放中、且引擎的层级切换已完成 → 冻结操作，等过场放完再交还控制权
      const cine = cutRef.current !== null && engine.transition === null
      engine.paused = paused || screenRef.current !== 'game' || cine

      if (screenRef.current === 'title') {
        // 吸引模式：L0 出生点缓慢环视
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
  }, [settings.grain, settings.dust, settings.flicker, settings.shake, settings.dynamicRes])

  // 画面设置：手电实时阴影（移动端强制关闭）
  useEffect(() => {
    rendererRef.current?.setShadows(settings.shadows && !isMobile)
  }, [settings.shadows, isMobile])

  // 画面设置：战争迷雾（距离雾）
  useEffect(() => {
    rendererRef.current?.setFog(settings.fogOfWar)
  }, [settings.fogOfWar])

  const quitToTitle = () => {
    engine.over = true
    audio.stopHum()
    audio.stopBGM()
    setOverlay('none')
    setScreen('title')
  }

  const levelDef = engine.levelDef

  // 现象「孤立效应」附加表现：Level 0 内对画布施加极轻微的画面微调色（每次进层重新随机）
  const cg = engine.colorGrade
  const gradeFilter = engine.player.level === 0 && (cg.hue !== 0 || cg.sat !== 1 || cg.con !== 1 || cg.bri !== 1)
    ? `hue-rotate(${cg.hue.toFixed(2)}deg) saturate(${cg.sat.toFixed(3)}) contrast(${cg.con.toFixed(3)}) brightness(${cg.bri.toFixed(3)})`
    : undefined

  return (
    <div className={`fixed inset-0 overflow-hidden ${settings.grain ? 'vhs-grain scanlines' : 'scanlines'} ${customPause ? 'br-hide-hud-pause' : ''}`} style={{ background: 'var(--ink)' }}>
      <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, left: 0, zIndex: 1, filter: gradeFilter }} />

      {/* 受伤闪屏 */}
      {damageFlash > 0 && (
        <div key={damageFlash} className="pointer-events-none fixed inset-0 z-40" style={{ boxShadow: 'inset 0 0 120px 40px rgba(179,53,43,0.7)', animation: 'damageFlash 0.18s ease-out both' }} />
      )}
      {sanityFlash > 0 && (
        <div key={sanityFlash} className="pointer-events-none fixed inset-0 z-40" style={{ boxShadow: 'inset 0 0 120px 40px rgba(122,111,208,0.6)', animation: 'damageFlash 0.3s ease-out both' }} />
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

      {/* HUD */}
      {screen === 'game' && overlay !== 'death' && overlay !== 'victory' && (
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
      <FullscreenHint />
      {screen === 'game' && isMobile && overlay === 'none' && (
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
          hasSave={hasSave}
          onStart={() => startRun()}
          onContinue={() => {
            try {
              const s = JSON.parse(storage.get('br_save') ?? '{}')
              startRun(s.seed)
            } catch { startRun() }
          }}
          onSettings={() => setOverlay('settings')}
          onHowTo={() => setOverlay('howto')}
          onCodex={() => setOverlay('codex')}
          onAvatar={() => setOverlay('avatar')}
        />
      )}

      {/* 覆盖层 */}
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
          onQuit={quitToTitle}
        />
      )}
      {overlay === 'inventory' && <InventoryOverlay engine={engine} onClose={() => setOverlay('none')} initialTab={invTab} />}
      {overlay === 'codex' && <InventoryOverlay engine={engine} onClose={() => setOverlay('none')} codexOnly />}
      {overlay === 'death' && (
        <DeathScreen
          engine={engine}
          cause={deathCause}
          onRetry={() => startRun()}
          onTitle={quitToTitle}
        />
      )}
      {overlay === 'victory' && (
        <VictoryScreen
          engine={engine}
          onNG={() => startRun()}
          onTitle={quitToTitle}
        />
      )}
    </div>
  )
}
