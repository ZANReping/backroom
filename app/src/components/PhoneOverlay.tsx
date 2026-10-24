// 手机界面（前厅起随身）：主屏 + 手电 / 笔记 / 时钟 / 相机。游戏不暂停（屏幕点亮额外耗电）。
// 相机：关闭界面进入取景模式（App 负责取景框与快门输入），照片存进笔记。
import { useEffect, useState } from 'react'
import type { Engine } from '@/game/engine'
import { audio } from '@/game/core/audio'
import { bindLabelFor } from '@/game/core/keybinds'
import PhoneCracks from './PhoneCracks'
import { clockText, phoneInHand, phoneState, togglePhoneTorch, type PhoneNote } from '@/game/engine/phone'

type App = 'home' | 'notes' | 'note' | 'clock'

interface Props {
  engine: Engine
  isMobile: boolean
  onClose: () => void
  onCamera: () => void
}

export default function PhoneOverlay({ engine, isMobile, onClose, onCamera }: Props) {
  const [app, setApp] = useState<App>('home')
  const [note, setNote] = useState<PhoneNote | null>(null)
  const [, setTick] = useState(0)
  const [refreshFail, setRefreshFail] = useState(0)
  useEffect(() => {
    engine.phoneScreenOn = true
    engine.markTutorial('phone_open')
    const id = window.setInterval(() => setTick((n) => n + 1), 250)
    return () => { window.clearInterval(id); engine.phoneScreenOn = false }
  }, [engine])
  const ph = phoneState(engine.player)
  const dead = ph.battery <= 0
  const inHand = phoneInHand(engine.player)
  const tap = (fn: () => void) => () => { audio.uiTick(); fn() }
  const batt = Math.round(ph.battery)
  const time = clockText(engine)

  const appBtn = (id: string, label: string, icon: React.ReactNode, onClick: () => void, on = false, disabled = false) => (
    <button key={id} data-phone-app={id} disabled={disabled} onClick={tap(onClick)}
      className="flex flex-col items-center gap-1.5 text-[11px]" style={{ color: disabled ? '#5b5f66' : '#e9edf2' }}>
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: on ? '#f2c94c' : disabled ? '#24272c' : 'linear-gradient(160deg,#3a4250,#22262d)', color: on ? '#1d1a12' : 'inherit', boxShadow: '0 2px 6px rgba(0,0,0,.5)' }}>{icon}</span>
      {label}
    </button>
  )
  const ico = (d: React.ReactNode) => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{d}</svg>

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ background: 'rgba(0,0,0,.35)' }} onClick={onClose} data-phone-overlay>
      <div onClick={(e) => e.stopPropagation()} className="relative flex flex-col overflow-hidden"
        style={{ width: isMobile ? 260 : 300, height: isMobile ? 470 : 560, borderRadius: 34, border: '9px solid #0d0e10', background: dead ? '#000' : 'radial-gradient(120% 80% at 30% 0%, #2c3a52 0%, #141820 60%, #0b0d11 100%)', boxShadow: '0 20px 60px rgba(0,0,0,.7), inset 0 0 0 1px #2a2c30', fontFamily: 'system-ui, sans-serif' }}>
        {/* 刘海 + 状态栏 */}
        <div className="absolute left-1/2 top-1.5 h-5 w-24 -translate-x-1/2 rounded-full" style={{ background: '#0d0e10' }} />
        {ph.cracked && <PhoneCracks />}
        {dead ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[12px]" style={{ color: '#c33' }} data-phone-dead>
            <svg width="54" height="28" viewBox="0 0 54 28"><rect x="1" y="3" width="46" height="22" rx="4" fill="none" stroke="#c33" strokeWidth="2" /><rect x="48" y="10" width="4" height="8" rx="1" fill="#c33" /><rect x="4" y="6" width="3" height="16" fill="#c33" /></svg>
            电量耗尽 · 请连接充电器
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 pt-2 text-[11px]" style={{ color: '#e9edf2' }}>
              <span>{time}</span>
              <span className="flex items-center gap-1.5" data-phone-battery>
                {ph.noSignal ? <span data-phone-nosignal style={{ color: '#e25' }}>无信号</span> : <span style={{ letterSpacing: -1 }}>▂▄▆</span>}
                {ph.docked ? '⚡' : ''}{batt}%
                <span className="relative inline-block h-[9px] w-[20px] rounded-[2px] border" style={{ borderColor: '#e9edf2' }}><i className="absolute left-[1px] top-[1px] bottom-[1px] block rounded-[1px]" style={{ width: `${Math.max(4, batt) * 0.16}px`, background: batt <= 15 ? '#e25' : '#e9edf2' }} /></span>
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3" style={{ color: '#e9edf2' }}>
              {app === 'home' && (
                <>
                  <div className="mt-5 text-center" data-phone-home-clock>
                    <div className="text-[54px] font-extralight leading-none tracking-tight">{time}</div>
                    <div className="mt-1 text-[12px]" style={{ color: '#aab3c0' }}>{ph.noSignal ? '周五 · 时间未同步' : '周五 · 夜间'}</div>
                  </div>
                  {ph.noSignal ? (
                    <div className="mt-6 rounded-xl px-3 py-2 text-[11px]" style={{ background: 'rgba(255,255,255,.07)' }} data-phone-forum-offline>
                      <div className="flex items-center justify-between"><span style={{ color: '#f2c94c' }}>边界论坛</span>
                        <button data-phone-forum-refresh onClick={tap(() => setRefreshFail((n) => n + 1))} className="rounded px-1.5 text-[10px]" style={{ background: 'rgba(255,255,255,.1)', color: '#c8ced8' }}>↻ 刷新</button></div>
                      <div style={{ color: '#c8ced8' }}>{refreshFail > 0 ? `刷新失败 ×${refreshFail}：无网络连接（无信号）` : '无法加载新内容 · 无信号'}</div>
                      <div style={{ color: '#7d8694' }}>最后一条：「回家的路上别回头。」</div>
                    </div>
                  ) : (
                  <div className="mt-6 rounded-xl px-3 py-2 text-[11px]" style={{ background: 'rgba(255,255,255,.07)' }}>
                    <div style={{ color: '#f2c94c' }}>边界论坛 · 1 条新回复</div>
                    <div style={{ color: '#c8ced8' }}>「你真信那条巷子？去了记得拍照。」</div>
                  </div>
                  )}
                  <div className="mt-6 grid grid-cols-4 gap-y-4">
                    {appBtn('torch', '手电', ico(<><path d="M8 2h8l-1 6H9z" /><path d="M9 8h6v12a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" /><path d="M12 12v3" /></>), () => togglePhoneTorch(engine) && engine.markTutorial('light_toggle'), ph.torch, !inHand)}
                    {appBtn('notes', '笔记', ico(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4" /></>), () => setApp('notes'))}
                    {appBtn('clock', '时钟', ico(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></>), () => setApp('clock'))}
                    {appBtn('camera', '相机', ico(<><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.4" /></>), () => onCamera())}
                  </div>
                  {!inHand && <div className="mt-4 text-center text-[10px]" style={{ color: '#9aa3b0' }}>手机不在副手：手电不可用。在背包里把手机装到【副手】。</div>}
                  <div className="mt-5 text-center text-[10px]" style={{ color: '#7d8694' }}>{isMobile ? '点屏幕外关闭' : `[${bindLabelFor('phone')}] / Esc 关闭`}{ph.torch ? ' · 手电开启（耗电）' : ''}</div>
                </>
              )}
              {app === 'notes' && (
                <>
                  <div className="mb-2 flex items-center justify-between"><button onClick={tap(() => setApp('home'))} className="text-[12px]" style={{ color: '#f2c94c' }}>‹ 主屏</button><span className="text-[15px] font-semibold">笔记</span><span className="w-10" /></div>
                  {ph.notes.length === 0 && <div className="mt-10 text-center text-[12px]" style={{ color: '#9aa3b0' }}>还没有笔记。</div>}
                  {ph.notes.map((n) => (
                    <button key={n.id} data-phone-note={n.kind} onClick={tap(() => { setNote(n); setApp('note') })} className="mb-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left" style={{ background: 'rgba(255,255,255,.07)' }}>
                      {n.kind === 'photo' && (engine.phoneThumbs.get(n.id)
                        ? <img src={engine.phoneThumbs.get(n.id)} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                        : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded" style={{ background: '#2a2f38' }}>▣</span>)}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium">{n.title}</span>
                        <span className="block truncate text-[10px]" style={{ color: '#9aa3b0' }}>{n.time} · {n.text}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
              {app === 'note' && note && (
                <>
                  <div className="mb-2 flex items-center justify-between"><button onClick={tap(() => setApp('notes'))} className="text-[12px]" style={{ color: '#f2c94c' }}>‹ 笔记</button><span className="text-[12px]" style={{ color: '#9aa3b0' }}>{note.time}</span></div>
                  <div className="text-[16px] font-semibold">{note.title}</div>
                  {note.kind === 'photo' && engine.phoneThumbs.get(note.id) && <img src={engine.phoneThumbs.get(note.id)} alt="" className="mt-2 w-full rounded-lg" />}
                  <div className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed" style={{ color: '#d6dbe3' }}>{note.text}</div>
                </>
              )}
              {app === 'clock' && (
                <>
                  <div className="mb-2 flex items-center justify-between"><button onClick={tap(() => setApp('home'))} className="text-[12px]" style={{ color: '#f2c94c' }}>‹ 主屏</button><span className="text-[15px] font-semibold">时钟</span><span className="w-10" /></div>
                  <div className="mt-8 text-center" data-phone-clock>
                    <div className="font-mono text-[44px] font-light">{clockText(engine, true)}</div>
                    <div className="mt-1 text-[12px]" style={{ color: '#9aa3b0' }}>本地时间 · 周五</div>
                  </div>
                  <div className="mt-8 rounded-xl px-3 py-2 text-[12px]" style={{ background: 'rgba(255,255,255,.07)' }}>
                    <div className="flex justify-between"><span>闹钟</span><span style={{ color: '#9aa3b0' }}>07:30 · 工作日</span></div>
                  </div>
                  <div className="mt-2 rounded-xl px-3 py-2 text-[12px]" style={{ background: 'rgba(255,255,255,.07)' }}>
                    <div className="flex justify-between"><span>23:40 起已过</span><span style={{ color: "#9aa3b0" }}>{Math.floor((engine.player.prologueClock ?? 0) / 60)} 分钟</span></div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
