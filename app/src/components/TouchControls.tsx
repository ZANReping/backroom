// 移动端虚拟摇杆 + 动作按钮组（浮点摇杆，≥48px 触摸目标，safe-area 适配；支持自定义按键布局）
import { useRef, useState, useCallback, useEffect } from 'react'
import type { Engine } from '@/game/engine'
import { look } from '@/game/core/renderer3d'
import { audio } from '@/game/core/audio'
import type { GameSettings } from './SettingsModal'
import { GUNS, isGun, type AmmoType } from '../game/content/firearms'
import { gunReload, gunSelectAmmo } from '../game/engine/firearms'
import { IconFlashlight, IconBackpack, IconSprint, IconInteract, IconAttack, IconPause, IconJump, IconCrouch, IconQuickUse, IconWheelUp, IconWheelDown, IconHolster } from './icons'
import { CONTROL_SIZES, clampLayoutItem, type TouchControlId, type TouchLayoutMap } from './LayoutEditor'
import { specialAction } from '@/game/engine/special' // [window] 情境「特殊交互」按钮（如窗户旁的「默念」）

interface Props {
  engine: Engine
  settings: GameSettings
  onInventory: () => void
  /** 当前方向的自定义布局（无自定义项时传 {}） */
  layout?: TouchLayoutMap
  onPause?: () => void
}

export default function TouchControls({ engine, settings, onInventory, layout, onPause }: Props) {
  const stickSize = settings.stickSize
  const knobSize = Math.max(48, stickSize * 0.4)
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const [sprintRing, setSprintRing] = useState(false)
  const [sprintHold, setSprintHold] = useState(false)
  const stickId = useRef<number | null>(null)
  const lookId = useRef<number | null>(null)
  const lookLast = useRef({ x: 0, y: 0 })
  const rimT = useRef(0)
  const sprinting = useRef(false)
  const side = settings.leftHanded ? 'right' : 'left'
  const btnOpacity = settings.btnOpacity / 100

  const vw = typeof window !== 'undefined' ? window.innerWidth : 0
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0
  const customOf = (id: TouchControlId) => {
    const it = layout?.[id]
    if (!it) return null
    return clampLayoutItem(it, id === 'stick' ? stickSize : CONTROL_SIZES[id], vw, vh)
  }
  const stickCustom = customOf('stick')
  const stickMax = (stickSize * (stickCustom?.scale ?? 1)) / 2

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      const zoneOk = side === 'left' ? t.clientX < window.innerWidth * 0.45 : t.clientX > window.innerWidth * 0.55
      const lowerOk = t.clientY > window.innerHeight * 0.35
      if (stickId.current === null && zoneOk && lowerOk) {
        stickId.current = t.identifier
        // 自定义布局：摇杆固定在所配置的位置（静态摇杆）
        setOrigin(stickCustom ? { x: stickCustom.x * window.innerWidth, y: stickCustom.y * window.innerHeight } : { x: t.clientX, y: t.clientY })
        setKnob({ x: 0, y: 0 })
        rimT.current = 0
      } else if (lookId.current === null && !zoneOk) {
        // 右半屏（左手模式为左半屏）拖动 = 旋转视角
        lookId.current = t.identifier
        lookLast.current = { x: t.clientX, y: t.clientY }
      }
    }
  }, [side, stickCustom])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === lookId.current) {
        const dx = t.clientX - lookLast.current.x
        const dy = t.clientY - lookLast.current.y
        lookLast.current = { x: t.clientX, y: t.clientY }
        const sens = settings.sensitivity ?? 1
        look.yaw -= dx * 0.0052 * sens
        look.pitch = Math.max(-1.2, Math.min(1.2, look.pitch - dy * 0.0048 * sens))
        continue
      }
      if (stickId.current === null || !origin) continue
      if (t.identifier !== stickId.current) continue
      let dx = t.clientX - origin.x
      let dy = t.clientY - origin.y
      const d = Math.hypot(dx, dy)
      const max = stickMax
      if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max }
      setKnob({ x: dx, y: dy })
      const dead = 12
      if (d > dead) {
        engine.input.mx = dx / max
        engine.input.my = dy / max
      } else {
        engine.input.mx = 0; engine.input.my = 0
      }
      if (d / max > 0.9) {
        rimT.current += 0.016
        if (rimT.current > 0.4 && !sprinting.current) { sprinting.current = true; setSprintRing(true) }
      } else if (sprinting.current && d / max < 0.75) {
        sprinting.current = false; setSprintRing(false); rimT.current = 0
      }
      engine.input.sprint = sprinting.current || sprintHold
    }
  }, [origin, engine, stickMax, sprintHold, settings.sensitivity])

  const endStick = useCallback((e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === lookId.current) lookId.current = null
    }
    if (stickId.current === null) return
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === stickId.current) {
        stickId.current = null
        setOrigin(null); setKnob({ x: 0, y: 0 })
        engine.input.mx = 0; engine.input.my = 0
        sprinting.current = false; setSprintRing(false)
        engine.input.sprint = sprintHold
      }
    }
  }, [engine, sprintHold])

  useEffect(() => {
    engine.input.sprint = sprinting.current || sprintHold
  }, [sprintHold, engine])

  // v29b：滚轮模拟——循环切换快捷栏选中槽（与 PC 滚轮逻辑一致）
  const cycleSlot = (dir: 1 | -1) => {
    const n = engine.player.hotbar.length
    if (n === 0) return
    engine.player.selected = (engine.player.selected + dir + n) % n
    audio.uiTick()
  }
  // v29b：快捷使用——与 PC 右键（quickuse 绑定）相同的快捷使用/装备逻辑
  const quickUse = () => { if (!engine.handsStowed) engine.quickUse() }
  // 枪械：快捷使用键改为按住瞄准；另加装填键（长按 = 轮换弹种并立刻换上）
  const gunHeld = !engine.handsStowed && isGun(engine.player.hotbar[engine.player.selected]?.type)
  const reloadPress = useRef(0)
  const cycleGunAmmo = () => {
    const s = engine.player.hotbar[engine.player.selected]
    if (!s || !isGun(s.type)) return
    const have = GUNS[s.type].ammo.filter((a) => engine.countItem(a) > 0)
    if (!have.length) { engine.msg('身上没有能用的弹。', 'system'); return }
    const cur = have.indexOf(s.ammoSel as AmmoType)
    gunSelectAmmo(engine, have[(cur + 1) % have.length])
  }
  const handsStowed = !!engine.handsStowed
  const holster = (e: React.TouchEvent) => { e.stopPropagation(); engine.toggleHands() }

  const interact = engine.getInteract()
  const special = specialAction(engine)
  useEffect(() => { if (!special && engine.specialHeld) engine.specialHeld = false }, [special, engine])
  useEffect(() => () => { engine.specialHeld = false; engine.input.aimHeld = false; window.clearTimeout(reloadPress.current); reloadPress.current = 0 }, [engine])
  const attackUnavailable = handsStowed && !interact
  const holsterContent = <><IconHolster width={18} height={18} /><span className="text-[10px] leading-tight">{handsStowed ? '取出' : '收起'}</span></>
  // v7：跳跃/蹲伏输入（游戏层契约字段，防御性写入，字段不存在也只是无害的额外属性）
  const verticalCrouchHold = useRef(false)
  useEffect(() => () => { if (verticalCrouchHold.current) engine.input.crouch = false; engine.input.jump = false }, [engine])
  const zInput = engine.input as unknown as { jump?: boolean; crouch?: boolean }
  const setJump = (v: boolean) => { zInput.jump = v }
  const toggleCrouch = () => { zInput.crouch = !zInput.crouch }
  const flightActive = engine.devEnabled && engine.dev.fly
  const deepSwimming = engine.inLiquid === 1
  const crouchStart = (e: React.TouchEvent) => { e.stopPropagation(); if (flightActive || deepSwimming) { verticalCrouchHold.current = true; zInput.crouch = true } else toggleCrouch() }
  const crouchEnd = (e: React.TouchEvent) => { e.stopPropagation(); if (verticalCrouchHold.current || flightActive || deepSwimming) zInput.crouch = false; verticalCrouchHold.current = false }
  const crouchOn = !!zInput.crouch || !!(engine.player as unknown as { crouching?: boolean }).crouching
  // 横屏：按钮弧形排布，避免遮挡画面中心
  const landscape = typeof window !== 'undefined' && window.innerWidth > window.innerHeight
  const btnBase: React.CSSProperties = {
    background: `color-mix(in srgb, var(--panel) ${Math.round(btnOpacity * 100)}%, transparent)`,
    border: '1px solid var(--panel-edge)',
    color: 'var(--text)',
    touchAction: 'none',
  }
  const clusterSide = settings.leftHanded ? 'left-3' : 'right-3'

  // 摇杆环（浮点：按下时出现；自定义布局：常显固定位置）
  const ringOrigin = origin ?? (stickCustom ? { x: stickCustom.x * vw, y: stickCustom.y * vh } : null)
  const ringSize = stickSize * (stickCustom?.scale ?? 1)

  // 自定义定位的固定按钮（位置/缩放来自布局编辑器，已 clamp 在安全区内）
  const fixedBtn = (id: TouchControlId, size: number, extra: React.CSSProperties, onDown: (e: React.TouchEvent) => void, onUp?: (e: React.TouchEvent) => void, child?: React.ReactNode, cls = '') => {
    const it = customOf(id)
    if (!it) return null
    const s = size * it.scale
    return (
      <button
        data-touch-id={id}
        aria-label={id === 'holster' ? (handsStowed ? '取出主手' : '收起主手') : id === 'attack' ? interact ? '交互' : '攻击' : id === 'crouch' ? flightActive || deepSwimming ? (deepSwimming && !flightActive ? '下潜（按住）' : '下降（按住）') : '蹲伏（切换）' : id === 'jump' ? flightActive || deepSwimming ? (deepSwimming && !flightActive ? '上浮（按住）' : '上升（按住）') : '跳跃' : undefined}
        aria-pressed={id === 'holster' ? handsStowed : undefined}
        aria-disabled={id === 'attack' ? attackUnavailable : undefined}
        className={`flex items-center justify-center rounded-full active:scale-90 ${cls}`}
        style={{
          ...btnBase,
          position: 'absolute',
          left: it.x * vw,
          top: it.y * vh,
          transform: 'translate(-50%, -50%)',
          width: s,
          height: s,
          ...extra,
        }}
        onTouchStart={onDown}
        onTouchEnd={onUp}
        onTouchCancel={onUp}
      >
        {child}
      </button>
    )
  }
  const isCustom = (id: TouchControlId) => !!layout?.[id]

  return (
    <div
      className="fixed inset-0 z-20"
      style={{ touchAction: 'none' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={endStick}
      onTouchCancel={endStick}
    >
      {/* 摇杆 */}
      {ringOrigin && (
        <div
          className="pointer-events-none absolute rounded-full border"
          style={{
            width: ringSize, height: ringSize,
            left: ringOrigin.x - ringSize / 2, top: ringOrigin.y - ringSize / 2,
            borderColor: sprintRing ? 'var(--stamina)' : 'var(--panel-edge)',
            background: 'rgba(20,18,12,0.3)',
            boxShadow: sprintRing ? '0 0 10px rgba(111,154,85,0.6)' : 'none',
            opacity: origin ? 1 : 0.55, // 自定义静态摇杆未按下时稍淡
          }}
        >
          <div
            className="absolute rounded-full"
            style={{
              width: knobSize * (stickCustom?.scale ?? 1), height: knobSize * (stickCustom?.scale ?? 1),
              left: ringSize / 2 - (knobSize * (stickCustom?.scale ?? 1)) / 2 + knob.x,
              top: ringSize / 2 - (knobSize * (stickCustom?.scale ?? 1)) / 2 + knob.y,
              background: 'var(--panel-edge)',
              transition: knob.x === 0 && knob.y === 0 ? 'all 0.18s' : 'none',
            }}
          />
        </div>
      )}
      {/* [window] 特殊交互：只在有可用情境动作时出现，按住生效（窗户旁 = 默念）；放在攻击键簇正上方 */}
      {special && (
        <button data-touch-id="special" aria-label={special.label + (special.hold ? '（按住）' : '')}
          className="absolute flex flex-col items-center justify-center rounded-full active:scale-90"
          style={{ ...btnBase, width: 64, height: 64, borderColor: 'var(--amber)', color: engine.specialHeld ? 'var(--bg, #000)' : 'var(--amber)', background: engine.specialHeld ? 'var(--amber)' : btnBase.background,
            bottom: landscape ? 'calc(env(safe-area-inset-bottom) + 210px)' : 'calc(env(safe-area-inset-bottom) + 270px)',
            [settings.leftHanded ? 'left' : 'right']: `calc(env(safe-area-inset-${settings.leftHanded ? 'left' : 'right'}) + 22px)` }}
          onTouchStart={(e) => { e.stopPropagation(); engine.specialPressed = true; engine.specialHeld = true }}
          onTouchEnd={(e) => { e.stopPropagation(); engine.specialHeld = false }}
          onTouchCancel={(e) => { e.stopPropagation(); engine.specialHeld = false }}
        ><span className="text-[15px] font-bold leading-tight">{special.label}</span>{special.hold && <span className="text-[9px] leading-tight opacity-80">按住</span>}</button>
      )}
      {/* 自定义布局：固定位置按钮 */}
      {fixedBtn('backpack', CONTROL_SIZES.backpack, {}, (e) => { e.stopPropagation(); onInventory() }, undefined, <IconBackpack width={22} height={22} />)}
      {fixedBtn('flashlight', CONTROL_SIZES.flashlight, { color: engine.player.flashlight || engine.player.phone?.torch ? 'var(--amber)' : 'var(--text-dim)' }, (e) => { e.stopPropagation(); engine.input.toggleLight = true }, undefined, <IconFlashlight width={22} height={22} />)}
      {fixedBtn('sprint', CONTROL_SIZES.sprint, { color: sprintHold ? 'var(--stamina)' : 'var(--text)' }, (e) => { e.stopPropagation(); setSprintHold(true) }, (e) => { e.stopPropagation(); setSprintHold(false) }, <IconSprint width={22} height={22} />)}
      {fixedBtn(
        'attack', CONTROL_SIZES.attack,
        { borderColor: attackUnavailable ? 'var(--panel-edge)' : 'var(--amber)', color: attackUnavailable ? 'var(--text-dim)' : 'var(--amber)', opacity: attackUnavailable ? .5 : 1 },
        (e) => {
          e.stopPropagation()
          if (engine.getInteract()) engine.input.interact = true
          else if (!engine.handsStowed) { engine.input.attack = true; engine.input.attackHeld = true }
        },
        (e) => { e.stopPropagation(); engine.input.attackHeld = false }, // 近战重制：按住攻击键蓄力重击

        interact ? <IconInteract width={30} height={30} /> : <IconAttack width={30} height={30} />,
        interact ? 'anim-pulseAmber' : '',
      )}
      {fixedBtn(
        'jump', CONTROL_SIZES.jump,
        { color: 'var(--text)' },
        (e) => { e.stopPropagation(); setJump(true) },
        (e) => { e.stopPropagation(); setJump(false) },
        <IconJump width={24} height={24} />,
      )}
      {fixedBtn(
        'crouch', CONTROL_SIZES.crouch,
        { color: crouchOn ? 'var(--amber)' : 'var(--text)', borderColor: crouchOn ? 'var(--amber)' : 'var(--panel-edge)', boxShadow: crouchOn ? 'inset 0 0 8px rgba(232,185,60,0.5)' : 'none' },
        crouchStart,
        crouchEnd,
        <IconCrouch width={24} height={24} />,
      )}
      {fixedBtn('pause', CONTROL_SIZES.pause, {}, (e) => { e.stopPropagation(); onPause?.() }, undefined, <IconPause width={20} height={20} />)}
      {fixedBtn('holster', CONTROL_SIZES.holster, { color: handsStowed ? 'var(--amber)' : 'var(--text)' }, holster, undefined, holsterContent, 'flex-col')}
      {/* v29b：快捷使用 + 滚轮模拟按钮组（仅移动端渲染本组件；锚在摇杆侧底角，远离右侧交互/背包按钮簇与底部快捷栏，
          ≥48px 触摸目标，safe-area 适配；按钮本身是触摸目标并 stopPropagation，不会误触发浮点摇杆） */}
      <div
        className={`absolute ${side === 'left' ? 'left-3' : 'right-3'} ${landscape ? 'tc-quick-land' : 'flex flex-col items-center gap-2.5'}`}
        style={landscape
          ? { bottom: 'calc(env(safe-area-inset-bottom) + 104px)', [side]: 'calc(env(safe-area-inset-' + side + ') + 12px)' }
          : { bottom: 'calc(env(safe-area-inset-bottom) + 148px)' }}
      >
        <button
          aria-label="快捷栏上一切换（模拟滚轮上）"
          className="tc-wheel flex items-center justify-center rounded-full active:scale-90"
          style={{ ...btnBase, width: landscape ? 44 : 48, height: landscape ? 44 : 48 }}
          onTouchStart={(e) => { e.stopPropagation(); cycleSlot(-1) }}
        >
          <IconWheelUp width={22} height={22} />
        </button>
        <button
          aria-label="快捷栏下一切换（模拟滚轮下）"
          className="tc-wheel flex items-center justify-center rounded-full active:scale-90"
          style={{ ...btnBase, width: landscape ? 44 : 48, height: landscape ? 44 : 48 }}
          onTouchStart={(e) => { e.stopPropagation(); cycleSlot(1) }}
        >
          <IconWheelDown width={22} height={22} />
        </button>
        <button
          aria-label={gunHeld ? '瞄准（按住）' : '快捷使用（等同于 PC 右键）'}
          className="tc-quickuse flex items-center justify-center rounded-full active:scale-90"
          aria-disabled={handsStowed}
          style={{ ...btnBase, width: 56, height: 56, borderColor: 'var(--amber)', color: handsStowed ? 'var(--text-dim)' : 'var(--amber)', opacity: handsStowed ? 0.5 : 1 }}
          onTouchStart={(e) => { e.stopPropagation(); if (gunHeld) engine.input.aimHeld = true; else quickUse() }}
          onTouchEnd={(e) => { e.stopPropagation(); engine.input.aimHeld = false }}
          onTouchCancel={() => { engine.input.aimHeld = false }}
        >
          {gunHeld ? <span className="font-mono2 text-[12px]">瞄准</span> : <IconQuickUse width={24} height={24} />}
        </button>
        {gunHeld && (
          <button
            aria-label="装填（长按换弹种）"
            className="tc-reload flex items-center justify-center rounded-full active:scale-90"
            style={{ ...btnBase, width: 48, height: 48, color: 'var(--text)' }}
            onTouchStart={(e) => { e.stopPropagation(); reloadPress.current = window.setTimeout(() => { reloadPress.current = 0; cycleGunAmmo() }, 450) }}
            onTouchEnd={(e) => { e.stopPropagation(); if (reloadPress.current) { window.clearTimeout(reloadPress.current); reloadPress.current = 0; gunReload(engine) } }}
            onTouchCancel={() => { window.clearTimeout(reloadPress.current); reloadPress.current = 0 }}
          >
            <span className="font-mono2 text-[12px]">装填</span>
          </button>
        )}
      </div>
      {!isCustom('holster') && (
        <button data-touch-id="holster" aria-label={handsStowed ? '取出主手' : '收起主手'} aria-pressed={handsStowed}
          className="absolute flex flex-col items-center justify-center rounded-full active:scale-90"
          style={{ ...btnBase, width: 48, height: 48, bottom: landscape ? 'calc(env(safe-area-inset-bottom) + 76px)' : 'calc(env(safe-area-inset-bottom) + 186px)', [side]: `calc(env(safe-area-inset-${side}) + ${landscape ? 196 : 124}px)`, color: handsStowed ? 'var(--amber)' : 'var(--text)' }}
          onTouchStart={holster}>{holsterContent}</button>
      )}
      {/* 2026-10 横屏：以攻击/交互键为圆心的拇指扇形——内圈（r=92）跳跃/冲刺/蹲伏，外圈（r=164）手电/背包；
          整组贴屏幕右下角（左手模式镜像），不再竖向堆到小地图与电量行，避开底部快捷栏。仅未自定义的按钮参与。 */}
      {landscape && (
        <div className="tc-arc pointer-events-none absolute" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 16px)', [settings.leftHanded ? 'left' : 'right']: 'calc(env(safe-area-inset-' + (settings.leftHanded ? 'left' : 'right') + ') + 16px)', width: 76, height: 76 }}>
          {([
            ['jump', 56, 180, 92],
            ['sprint', 56, 136, 92],
            ['crouch', 56, 92, 92],
            ['flashlight', 48, 168, 164],
            ['backpack', 48, 140, 166],
          ] as const).filter(([id]) => !isCustom(id)).map(([id, size, deg, r]) => {
            const rad = (deg * Math.PI) / 180
            const dx = Math.cos(rad) * r * (settings.leftHanded ? -1 : 1)
            const dy = -Math.sin(rad) * r
            const common = { ...btnBase, position: 'absolute' as const, width: size, height: size, left: 38 + dx - size / 2, top: 38 + dy - size / 2 }
            const label = { jump: '跳', sprint: '冲刺', crouch: '蹲', flashlight: '手电', backpack: '背包' }[id]
            if (id === 'jump') return (
              <button key={id} data-touch-id={id} aria-label={deepSwimming ? '上浮（按住）' : '跳跃'} data-label={deepSwimming ? '上浮' : label} className="tc-btn pointer-events-auto flex items-center justify-center rounded-full active:scale-90" style={common}
                onTouchStart={(e) => { e.stopPropagation(); setJump(true) }} onTouchEnd={(e) => { e.stopPropagation(); setJump(false) }} onTouchCancel={(e) => { e.stopPropagation(); setJump(false) }}>
                <IconJump width={24} height={24} />
              </button>
            )
            if (id === 'sprint') return (
              <button key={id} data-touch-id={id} aria-label="冲刺（按住）" data-label={label} className={`tc-btn pointer-events-auto flex items-center justify-center rounded-full active:scale-90 ${sprintHold ? 'is-on' : ''}`} style={{ ...common, color: sprintHold ? 'var(--stamina)' : 'var(--text)', borderColor: sprintHold ? 'var(--stamina)' : 'var(--panel-edge)' }}
                onTouchStart={(e) => { e.stopPropagation(); setSprintHold(true) }} onTouchEnd={(e) => { e.stopPropagation(); setSprintHold(false) }} onTouchCancel={(e) => { e.stopPropagation(); setSprintHold(false) }}>
                <IconSprint width={22} height={22} />
              </button>
            )
            if (id === 'crouch') return (
              <button key={id} data-touch-id={id} aria-label={flightActive || deepSwimming ? (deepSwimming && !flightActive ? '下潜（按住）' : '下降（按住）') : '蹲伏（切换）'} data-label={flightActive || deepSwimming ? (deepSwimming && !flightActive ? '下潜' : '下降') : label} className={`tc-btn pointer-events-auto flex items-center justify-center rounded-full active:scale-90 ${crouchOn ? 'is-on' : ''}`}
                style={{ ...common, color: crouchOn ? 'var(--amber)' : 'var(--text)', borderColor: crouchOn ? 'var(--amber)' : 'var(--panel-edge)', boxShadow: crouchOn ? 'inset 0 0 8px color-mix(in srgb, var(--amber) 50%, transparent)' : 'none' }}
                onTouchStart={crouchStart} onTouchEnd={crouchEnd} onTouchCancel={crouchEnd}>
                <IconCrouch width={24} height={24} />
              </button>
            )
            if (id === 'flashlight') return (
              <button key={id} data-touch-id={id} aria-label="手电筒" data-label={label} className={`tc-btn tc-btn--sm pointer-events-auto flex items-center justify-center rounded-full active:scale-90 ${engine.player.flashlight || engine.player.phone?.torch ? 'is-on' : ''}`} style={{ ...common, color: engine.player.flashlight || engine.player.phone?.torch ? 'var(--amber)' : 'var(--text-dim)' }}
                onTouchStart={(e) => { e.stopPropagation(); engine.input.toggleLight = true }}>
                <IconFlashlight width={20} height={20} />
              </button>
            )
            return (
              <button key={id} data-touch-id={id} aria-label="背包" data-label={label} className="tc-btn tc-btn--sm pointer-events-auto flex items-center justify-center rounded-full active:scale-90" style={common}
                onTouchStart={(e) => { e.stopPropagation(); onInventory() }}>
                <IconBackpack width={20} height={20} />
              </button>
            )
          })}
          {!isCustom('attack') && (
            <button
              aria-label={interact ? '交互' : '攻击'}
              data-touch-id="attack"
              aria-disabled={attackUnavailable}
              data-label={interact ? '交互' : '攻击'}
              className={`tc-btn tc-btn--main pointer-events-auto absolute inset-0 flex items-center justify-center rounded-full active:scale-90 ${interact ? 'anim-pulseAmber' : ''}`}
              style={{ ...btnBase, borderColor: attackUnavailable ? 'var(--panel-edge)' : 'var(--amber)', color: attackUnavailable ? 'var(--text-dim)' : 'var(--amber)', borderWidth: 2, opacity: attackUnavailable ? .5 : 1 }}
              onTouchStart={(e) => {
                e.stopPropagation()
                if (engine.getInteract()) engine.input.interact = true
                else if (!engine.handsStowed) { engine.input.attack = true; engine.input.attackHeld = true }
              }}
              onTouchEnd={(e) => { e.stopPropagation(); engine.input.attackHeld = false }}
              onTouchCancel={() => { engine.input.attackHeld = false }}
            >
              {interact ? <IconInteract width={32} height={32} /> : <IconAttack width={32} height={32} />}
            </button>
          )}
        </div>
      )}
      {/* 默认按钮组（竖屏；未被自定义的按钮保持原排布）*/}
      {!landscape && (!isCustom('backpack') || !isCustom('flashlight') || !isCustom('crouch') || !isCustom('sprint') || !isCustom('jump') || !isCustom('attack')) && (
        <div
          className={`absolute ${clusterSide} flex flex-col items-center gap-3`}
          style={{ bottom: landscape ? 'calc(env(safe-area-inset-bottom) + 24px)' : 'calc(env(safe-area-inset-bottom) + 76px)' }}
        >
          {!isCustom('backpack') && (
            <button
              className="flex items-center justify-center rounded-full active:scale-90"
              style={{ ...btnBase, width: 56, height: 56, ...(landscape ? { transform: 'translateX(-64px)' } : {}) }}
              onTouchStart={(e) => { e.stopPropagation(); onInventory() }}
            >
              <IconBackpack width={22} height={22} />
            </button>
          )}
          {!isCustom('flashlight') && (
            <button
              className="flex items-center justify-center rounded-full active:scale-90"
              style={{ ...btnBase, width: 56, height: 56, color: engine.player.flashlight || engine.player.phone?.torch ? 'var(--amber)' : 'var(--text-dim)', ...(landscape ? { transform: 'translate(-96px, -8px)' } : {}) }}
              onTouchStart={(e) => { e.stopPropagation(); engine.input.toggleLight = true }}
            >
              <IconFlashlight width={22} height={22} />
            </button>
          )}
          {!isCustom('crouch') && (
            <button
              aria-label={flightActive || deepSwimming ? (deepSwimming && !flightActive ? '下潜（按住）' : '下降（按住）') : '蹲伏（切换）'}
              className="flex items-center justify-center rounded-full active:scale-90"
              style={{
                ...btnBase, width: 56, height: 56,
                color: crouchOn ? 'var(--amber)' : 'var(--text)',
                borderColor: crouchOn ? 'var(--amber)' : 'var(--panel-edge)',
                boxShadow: crouchOn ? 'inset 0 0 8px rgba(232,185,60,0.5)' : 'none',
                ...(landscape ? { transform: 'translate(-96px, -8px)' } : {}),
              }}
              onTouchStart={crouchStart} onTouchEnd={crouchEnd} onTouchCancel={crouchEnd}
            >
              <IconCrouch width={24} height={24} />
            </button>
          )}
          {(!isCustom('sprint') || !isCustom('jump') || !isCustom('attack')) && (
            <div className="flex items-center gap-3">
              {!isCustom('sprint') && (
                <button
                  className="flex items-center justify-center rounded-full active:scale-90"
                  style={{ ...btnBase, width: 56, height: 56, color: sprintHold ? 'var(--stamina)' : 'var(--text)', ...(landscape ? { transform: 'translateY(-16px)' } : {}) }}
                  onTouchStart={(e) => { e.stopPropagation(); setSprintHold(true) }}
                  onTouchEnd={(e) => { e.stopPropagation(); setSprintHold(false) }}
                >
                  <IconSprint width={22} height={22} />
                </button>
              )}
              {!isCustom('jump') && (
                <button
                  aria-label={deepSwimming ? '上浮（按住）' : '跳跃'}
                  className="flex items-center justify-center rounded-full active:scale-90"
                  style={{ ...btnBase, width: 56, height: 56, ...(landscape ? { transform: 'translateY(-8px)' } : {}) }}
                  onTouchStart={(e) => { e.stopPropagation(); setJump(true) }}
                  onTouchEnd={(e) => { e.stopPropagation(); setJump(false) }}
                  onTouchCancel={(e) => { e.stopPropagation(); setJump(false) }}
                >
                  <IconJump width={24} height={24} />
                </button>
              )}
              {!isCustom('attack') && (
                <button
                  data-touch-id="attack"
                  aria-label={interact ? '交互' : '攻击'}
                  aria-disabled={attackUnavailable}
                  className={`flex items-center justify-center rounded-full active:scale-90 ${interact ? 'anim-pulseAmber' : ''}`}
                  style={{ ...btnBase, width: 72, height: 72, borderColor: attackUnavailable ? 'var(--panel-edge)' : 'var(--amber)', color: attackUnavailable ? 'var(--text-dim)' : 'var(--amber)', opacity: attackUnavailable ? .5 : 1 }}
                  onTouchStart={(e) => {
                    e.stopPropagation()
                    if (engine.getInteract()) engine.input.interact = true
                    else if (!engine.handsStowed) { engine.input.attack = true; engine.input.attackHeld = true }
                  }}
                  onTouchEnd={(e) => { e.stopPropagation(); engine.input.attackHeld = false }}
                  onTouchCancel={() => { engine.input.attackHeld = false }}
                >
                  {interact ? <IconInteract width={30} height={30} /> : <IconAttack width={30} height={30} />}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
