// 移动端虚拟摇杆 + 动作按钮组（浮点摇杆，≥48px 触摸目标，safe-area 适配；支持自定义按键布局）
import { useRef, useState, useCallback, useEffect } from 'react'
import type { Engine } from '@/game/engine'
import { look } from '@/game/renderer3d'
import type { GameSettings } from './SettingsModal'
import { IconFlashlight, IconBackpack, IconSprint, IconInteract, IconAttack, IconPause, IconJump, IconCrouch } from './icons'
import { CONTROL_SIZES, clampLayoutItem, type TouchControlId, type TouchLayoutMap } from './LayoutEditor'

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

  const interact = engine.getInteract()
  // v7：跳跃/蹲伏输入（游戏层契约字段，防御性写入，字段不存在也只是无害的额外属性）
  const zInput = engine.input as unknown as { jump?: boolean; crouch?: boolean }
  const setJump = (v: boolean) => { zInput.jump = v }
  const toggleCrouch = () => { zInput.crouch = !zInput.crouch }
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
      {/* 自定义布局：固定位置按钮 */}
      {fixedBtn('backpack', CONTROL_SIZES.backpack, {}, (e) => { e.stopPropagation(); onInventory() }, undefined, <IconBackpack width={22} height={22} />)}
      {fixedBtn('flashlight', CONTROL_SIZES.flashlight, { color: engine.player.flashlight ? 'var(--amber)' : 'var(--text-dim)' }, (e) => { e.stopPropagation(); engine.input.toggleLight = true }, undefined, <IconFlashlight width={22} height={22} />)}
      {fixedBtn('sprint', CONTROL_SIZES.sprint, { color: sprintHold ? 'var(--stamina)' : 'var(--text)' }, (e) => { e.stopPropagation(); setSprintHold(true) }, (e) => { e.stopPropagation(); setSprintHold(false) }, <IconSprint width={22} height={22} />)}
      {fixedBtn(
        'attack', CONTROL_SIZES.attack,
        { borderColor: 'var(--amber)', color: 'var(--amber)' },
        (e) => {
          e.stopPropagation()
          if (engine.getInteract()) engine.input.interact = true
          else engine.input.attack = true
        },
        undefined,
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
        (e) => { e.stopPropagation(); toggleCrouch() },
        undefined,
        <IconCrouch width={24} height={24} />,
      )}
      {fixedBtn('pause', CONTROL_SIZES.pause, {}, (e) => { e.stopPropagation(); onPause?.() }, undefined, <IconPause width={20} height={20} />)}
      {/* 默认按钮组（未被自定义的按钮保持原排布；横屏弧形）*/}
      {(!isCustom('backpack') || !isCustom('flashlight') || !isCustom('crouch') || !isCustom('sprint') || !isCustom('jump') || !isCustom('attack')) && (
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
              style={{ ...btnBase, width: 56, height: 56, color: engine.player.flashlight ? 'var(--amber)' : 'var(--text-dim)', ...(landscape ? { transform: 'translate(-96px, -8px)' } : {}) }}
              onTouchStart={(e) => { e.stopPropagation(); engine.input.toggleLight = true }}
            >
              <IconFlashlight width={22} height={22} />
            </button>
          )}
          {!isCustom('crouch') && (
            <button
              className="flex items-center justify-center rounded-full active:scale-90"
              style={{
                ...btnBase, width: 56, height: 56,
                color: crouchOn ? 'var(--amber)' : 'var(--text)',
                borderColor: crouchOn ? 'var(--amber)' : 'var(--panel-edge)',
                boxShadow: crouchOn ? 'inset 0 0 8px rgba(232,185,60,0.5)' : 'none',
                ...(landscape ? { transform: 'translate(-96px, -8px)' } : {}),
              }}
              onTouchStart={(e) => { e.stopPropagation(); toggleCrouch() }}
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
                  className={`flex items-center justify-center rounded-full active:scale-90 ${interact ? 'anim-pulseAmber' : ''}`}
                  style={{ ...btnBase, width: 72, height: 72, borderColor: 'var(--amber)', color: 'var(--amber)' }}
                  onTouchStart={(e) => {
                    e.stopPropagation()
                    if (engine.getInteract()) engine.input.interact = true
                    else engine.input.attack = true
                  }}
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
