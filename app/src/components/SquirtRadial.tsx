import { bindLabelFor } from '@/game/core/keybinds'

export type SquirtWheelAction = 'cancel' | 'clear' | 'water' | 'almond' | 'cashew' | 'liquidpain'

export interface SquirtWheelOption {
  action: Exclude<SquirtWheelAction, 'cancel'>
  label: string
  detail: string
  color: string
}

export interface SquirtWheelState {
  options: SquirtWheelOption[]
  selected: SquirtWheelAction
  cursorX: number
  cursorY: number
}

interface Props { wheel: SquirtWheelState }

const WHEEL_CENTER = 170
const INNER_RADIUS = 70
const OUTER_RADIUS = 151

function pointOnRing(radius: number, angle: number) {
  return {
    x: WHEEL_CENTER + Math.cos(angle) * radius,
    y: WHEEL_CENTER + Math.sin(angle) * radius,
  }
}

/** SVG 环形扇区；单选项保留一道缺口，避免退化成无法绘制的完整圆。 */
function annularSectorPath(index: number, count: number) {
  const step = Math.PI * 2 / count
  const gap = count === 1 ? .12 : .075
  const span = step - gap
  const center = -Math.PI / 2 + index * step
  const start = center - span / 2
  const end = center + span / 2
  const outerStart = pointOnRing(OUTER_RADIUS, start)
  const outerEnd = pointOnRing(OUTER_RADIUS, end)
  const innerEnd = pointOnRing(INNER_RADIUS, end)
  const innerStart = pointOnRing(INNER_RADIUS, start)
  const largeArc = span > Math.PI ? 1 : 0
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}

export default function SquirtRadial({ wheel }: Props) {
  const labelRadius = 110
  const selectedOption = wheel.options.find((option) => option.action === wheel.selected)

  return (
    <div
      className="fixed inset-0 z-[75] pointer-events-none select-none"
      style={{ background: 'radial-gradient(circle at center, rgba(4,8,8,.12) 0, rgba(2,5,5,.66) 52%, rgba(0,0,0,.78) 100%)' }}
      aria-hidden="true"
    >
      <div className="absolute left-1/2 top-1/2 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2">
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 340 340">
          <circle cx={WHEEL_CENTER} cy={WHEEL_CENTER} r={OUTER_RADIUS + 5} fill="rgba(5,7,6,.72)" stroke="rgba(212,188,104,.22)" />
          {wheel.options.map((option, index) => {
            const active = wheel.selected === option.action
            return (
              <path
                key={option.action}
                d={annularSectorPath(index, wheel.options.length)}
                fill={active ? option.color : '#171914'}
                fillOpacity={active ? .54 : .9}
                stroke={active ? option.color : 'rgba(188,174,116,.48)'}
                strokeWidth={active ? 3 : 1.4}
                strokeLinejoin="round"
                style={{
                  filter: active ? `drop-shadow(0 0 10px ${option.color})` : 'drop-shadow(0 4px 7px rgba(0,0,0,.72))',
                  transition: 'fill 75ms, fill-opacity 75ms, stroke 75ms, filter 75ms',
                }}
              />
            )
          })}
          <circle cx={WHEEL_CENTER} cy={WHEEL_CENTER} r={INNER_RADIUS - 2} fill="rgba(8,10,8,.96)" stroke="rgba(212,188,104,.3)" />
        </svg>

        {wheel.options.map((option, index) => {
          const angle = -Math.PI / 2 + (index * Math.PI * 2) / wheel.options.length
          const x = WHEEL_CENTER + Math.cos(angle) * labelRadius
          const y = WHEEL_CENTER + Math.sin(angle) * labelRadius
          const active = wheel.selected === option.action
          return (
            <div
              key={option.action}
              className="absolute flex h-[58px] w-[96px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center text-center font-mono transition-transform duration-75"
              style={{
                left: x,
                top: y,
                color: active ? '#fff8d5' : '#d8cfaa',
                textShadow: active ? `0 0 8px ${option.color}, 0 1px 2px #000` : '0 1px 3px #000',
                transform: `translate(-50%, -50%) scale(${active ? 1.06 : 1})`,
              }}
            >
              <span className="text-[13px] tracking-[.12em]">{option.label}</span>
              <span className="mt-1 text-[10px] opacity-70">{option.detail}</span>
            </div>
          )
        })}

        <div
          className="absolute left-1/2 top-1/2 flex h-[76px] w-[76px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border font-mono text-[12px] tracking-[.18em]"
          style={{
            color: wheel.selected === 'cancel' ? '#fff4c2' : '#a99f7e',
            borderColor: wheel.selected === 'cancel' ? '#d4bc68' : 'rgba(188,174,116,.38)',
            background: wheel.selected === 'cancel' ? 'rgba(93,76,29,.82)' : 'rgba(9,11,9,.92)',
            boxShadow: wheel.selected === 'cancel' ? '0 0 20px rgba(212,188,104,.32)' : 'none',
          }}
        >
          取消
        </div>

        <div
          className="absolute left-1/2 top-1/2 h-2.5 w-2.5 rounded-full border border-white/70 bg-white/90"
          style={{
            transform: `translate(calc(-50% + ${wheel.cursorX}px), calc(-50% + ${wheel.cursorY}px))`,
            boxShadow: selectedOption ? `0 0 12px ${selectedOption.color}` : '0 0 8px rgba(255,255,255,.7)',
          }}
        />
      </div>

      <div className="absolute left-1/2 top-[calc(50%+196px)] -translate-x-1/2 text-center font-mono">
        <div className="text-[14px] tracking-[.18em] text-[#dfc66e]">滋水枪液体轮盘</div>
        <div className="mt-1 text-[11px] text-[#b7ad8c]">移动鼠标选择 · 松开 {bindLabelFor('reload')} 确认</div>
      </div>
    </div>
  )
}
