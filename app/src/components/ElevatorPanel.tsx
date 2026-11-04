// L5「恐怖旅馆」电梯面板（1b）：1920 年代黄铜面板——半圆楼层指针表、象牙按钮 12…1、磨平的 13、
// 382 键的数字键盘（输入后按住 OK 1 秒才确认，防误触）、红色拉杆「下行 · Level 3」。维护电梯只有 B1 / 1 / 6 三个铁键。
// 不暂停游戏（与售货机同）：面板贴在屏幕右侧。
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { engine } from '@/game/engine'
import { closeElevator, elevatorDown, elevatorGo, elevatorKey, elevatorView, EL } from '@/game/engine/l5Elevator'
import { L5_FLOORS } from '@/game/world/infiniteL5'
import './ElevatorPanel.css'

const MAIN = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
const PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK']

export default function ElevatorPanel({ onClose }: { onClose: () => void }) {
  const [, setTick] = useState(0)
  const [hold, setHold] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const holdT = useRef<number | null>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    root.current?.focus()
    const id = window.setInterval(() => setTick((n) => n + 1), 120)
    return () => { window.clearInterval(id); closeElevator(engine); prev?.focus() }
  }, [])
  const v = elevatorView(engine)
  useEffect(() => { if (!v) onClose() }, [v, onClose])
  if (!v) return null
  const svc = v.mode === 'service'
  const go = (f: number) => { elevatorGo(engine, f); setTick((n) => n + 1) }
  const key = (k: string) => { elevatorKey(engine, k); setTick((n) => n + 1) }
  // OK 键：按住 1 秒确认
  const okDown = () => {
    if (holdT.current) return
    const t0 = performance.now()
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 1000)
      setHold(k)
      if (k >= 1) { holdT.current = null; setHold(0); key('OK'); return }
      holdT.current = requestAnimationFrame(step)
    }
    holdT.current = requestAnimationFrame(step)
  }
  const okUp = () => { if (holdT.current) cancelAnimationFrame(holdT.current); holdT.current = null; setHold(0) }
  const onKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    ev.stopPropagation()
    if (ev.key === 'Escape') { ev.preventDefault(); onClose(); return }
    if (/^\d$/.test(ev.key) && !svc) { ev.preventDefault(); key(ev.key); return }
    if (ev.key === 'Backspace') { ev.preventDefault(); key('C'); return }
    if (ev.key === 'Enter' && !ev.repeat) { ev.preventDefault(); okDown() }
  }
  const onKeyUp = (ev: KeyboardEvent<HTMLDivElement>) => { if (ev.key === 'Enter') okUp() }
  // 指针：B1 在最左（-90°），12F 在最右（+90°）
  const needle = -90 + (v.floor / 12) * 180
  return (
    <div className="el-overlay" onClick={onClose}>
      <div ref={root} tabIndex={-1} className={`el-panel${svc ? ' el-svc' : ''}`} onClick={(e) => e.stopPropagation()} onKeyDown={onKey} onKeyUp={onKeyUp} data-elevator-panel>
        <span className="el-rivet tl" /><span className="el-rivet tr" /><span className="el-rivet bl" /><span className="el-rivet br" />
        <div className="el-head">
          <small>{svc ? 'SERVICE · 员工专用' : 'THE TERROR HOTEL'}</small>
          <strong>{svc ? '维护电梯' : '电 梯'}</strong>
          <button className="el-close" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <div className="el-dial" aria-label={`当前 ${v.floorName}`}>
          <svg viewBox="0 0 220 120">
            <path d="M14 112 A96 96 0 0 1 206 112" className="el-arc" />
            {Array.from({ length: 13 }, (_, i) => {
              const a = (-90 + (i / 12) * 180) * Math.PI / 180, x = 110 + Math.sin(a) * 84, y = 112 - Math.cos(a) * 84
              const tx = 110 + Math.sin(a) * 68, ty = 116 - Math.cos(a) * 68
              return <g key={i}><line x1={x} y1={y} x2={110 + Math.sin(a) * 94} y2={112 - Math.cos(a) * 94} className="el-tick" />
                <text x={tx} y={ty} className={`el-num${i === v.floor ? ' on' : ''}`}>{i === 0 ? 'B' : i}</text></g>
            })}
            <g style={{ transform: `rotate(${needle}deg)`, transformOrigin: '110px 112px', transition: 'transform .6s cubic-bezier(.3,1.6,.5,1)' }}>
              <line x1="110" y1="112" x2="110" y2="34" className="el-needle" />
            </g>
            <circle cx="110" cy="112" r="9" className="el-hub" />
          </svg>
          <div className="el-floorname">{v.floorName} · {L5_FLOORS[v.floor]?.theme}</div>
        </div>
        {svc ? (
          <div className="el-svc-keys">
            {EL.serviceFloors.map((f) => (
              <button key={f} className={`el-iron${f === v.floor ? ' cur' : ''}`} onClick={() => go(f)}>{f === 0 ? 'B1' : f}</button>
            ))}
            <p className="el-warn">本梯年久失修 · 超载即坠 · 后果自负</p>
          </div>
        ) : (
          <>
            <div className="el-grid">
              {MAIN.map((f) => (
                <button key={f} className={`el-btn${f === v.floor ? ' cur' : ''}`} onClick={() => go(f)}>
                  <span>{f}</span><i>{L5_FLOORS[f].theme}</i>
                </button>
              ))}
              <button className="el-btn el-13" onClick={() => go(13)} title="刻字被磨平了"><span>13</span><i>· · ·</i></button>
            </div>
            <div className="el-pad">
              <div className="el-screen"><span>{v.entry.padStart(3, '·')}</span></div>
              <div className="el-padkeys">
                {PAD.map((k) => k === 'OK'
                  ? <button key={k} className="el-pk el-ok" style={{ ['--hold' as string]: hold }} onPointerDown={okDown} onPointerUp={okUp} onPointerLeave={okUp}>按住</button>
                  : <button key={k} className="el-pk" onClick={() => key(k)}>{k}</button>)}
              </div>
              <small className="el-padnote">382 键 · 输入楼层后按住 1 秒</small>
            </div>
            {v.exit && (
              <button className="el-lever" onClick={() => { elevatorDown(engine); onClose() }}>
                <b /> 下行 · Level 3
              </button>
            )}
          </>
        )}
        <div className="el-msg">{v.msg}</div>
      </div>
    </div>
  )
}
