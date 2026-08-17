// v58：联机大厅——P2P 房间（PeerJS 云信令）：房主创建房间得 4 位房间码，其他人输入房间码加入；
// 全员准备后房主才能开始。准备前每个玩家可调整自己的名称与形象（形象复用存档头像配置）。
import { useEffect, useRef, useState } from 'react'
import { MpSession } from '@/game/net/session'
import { loadAvatar, DEFAULT_AVATAR } from '@/game/core/avatar'
import { storage } from '@/game/core/storage'
import { audio } from '@/game/core/audio'
import AvatarPreview from './AvatarPreview'
import AvatarEditor from './AvatarEditor'

interface Props {
  onClose: () => void
  onStart: (session: MpSession, seed: number) => void
}

type Phase = 'menu' | 'room'

export default function LobbyOverlay({ onClose, onStart }: Props) {
  const [phase, setPhase] = useState<Phase>('menu')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editAvatar, setEditAvatar] = useState(false)
  const [name, setName] = useState(() => storage.get('br_mp_name') ?? '')
  const [, setTick] = useState(0)
  const sessionRef = useRef<MpSession | null>(null)

  const session = sessionRef.current
  const players = session?.players ?? []
  const me = session ? players.find((p) => session.isSelf(p.id)) : null
  const allReady = players.length > 0 && players.every((p) => p.ready)

  // 卸载清理仅在大厅阶段（未开局）断开；开局后由 quitToTitle/离开按钮管理生命周期
  useEffect(() => () => { const s = sessionRef.current; if (s && !s.started) s.leave() }, [])

  const identity = () => ({
    name: (name.trim() || '流浪者').slice(0, 12),
    avatar: loadAvatar(),
  })

  const attach = (s: MpSession) => {
    sessionRef.current = s
    s.onLobbyChange = () => setTick((n) => n + 1)
    s.onStart = (seed) => onStart(s, seed)
    s.onEnd = (reason) => {
      sessionRef.current = null
      setPhase('menu')
      setError(reason)
      setTick((n) => n + 1)
    }
  }

  const host = async () => {
    setBusy(true); setError('')
    try {
      const s = await MpSession.host(identity())
      attach(s)
      setPhase('room')
      audio.uiTick()
    } catch (e) {
      setError(`创建房间失败：${(e as Error).message ?? e}（检查网络后重试或更换时间再试）`)
    } finally { setBusy(false) }
  }

  const join = async () => {
    if (joinCode.trim().length !== 4) { setError('房间码是 4 位字符'); return }
    setBusy(true); setError('')
    try {
      const s = await MpSession.join(joinCode, identity())
      attach(s)
      setPhase('room')
      audio.uiTick()
    } catch (e) {
      setError(`加入失败：${(e as Error)?.message ?? '房间不存在或信令服务不可达'}`)
    } finally { setBusy(false) }
  }

  const applyIdentity = (newName?: string) => {
    const nn = (newName ?? name).trim() || '流浪者'
    storage.set('br_mp_name', nn)
    session?.setIdentity({ name: nn.slice(0, 12), avatar: loadAvatar() })
    setTick((n) => n + 1)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: 'rgba(10,9,8,0.78)', backdropFilter: 'blur(4px)' }}
      onClick={() => { sessionRef.current?.leave(); onClose() }}>
      <div className="hud-panel anim-slideUp flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-y-auto p-4"
        style={{ background: 'var(--panel)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="font-title text-[18px]" style={{ color: 'var(--amber)' }}>联机模式</span>
          <button className="font-mono2 border px-3 py-1 text-[12px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--text-dim)' }}
            onClick={() => { sessionRef.current?.leave(); onClose() }}>离开</button>
        </div>

        {phase === 'menu' && (
          <div className="flex flex-col gap-3">
            <div className="text-[12px] leading-5" style={{ color: 'var(--text-dim)' }}>
              P2P 联机：房主创建房间后把 4 位房间码告诉朋友；其他人输入房间码加入（最多 4 人）。
              全员准备后房主才能开始游戏。
            </div>
            <label className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--text)' }}>
              显示名称
              <input value={name} maxLength={12} onChange={(e) => setName(e.target.value)}
                onBlur={() => applyIdentity()}
                placeholder="流浪者"
                className="w-40 border bg-transparent px-2 py-1 text-[13px] outline-none"
                style={{ borderColor: 'var(--panel-edge)', color: 'var(--text)' }} />
            </label>
            <div className="flex items-center gap-3">
              <AvatarPreview avatar={loadAvatar()} size={84} />
              <button className="font-mono2 border px-3 py-1.5 text-[12px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--text)' }}
                onClick={() => setEditAvatar(true)}>调整形象</button>
            </div>
            <button disabled={busy} className="font-title border py-2 text-[15px]" style={{ borderColor: 'var(--amber)', color: 'var(--amber)' }}
              onClick={host}>{busy ? '连接中…' : '创建房间（我是房主）'}</button>
            <div className="flex gap-2">
              <input value={joinCode} maxLength={4} onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="房间码"
                className="w-32 border bg-transparent px-2 py-2 text-center font-mono2 text-[15px] tracking-[0.4em] outline-none"
                style={{ borderColor: 'var(--panel-edge)', color: 'var(--text)' }} />
              <button disabled={busy} className="font-title flex-1 border py-2 text-[15px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--text)' }}
                onClick={join}>{busy ? '连接中…' : '加入房间'}</button>
            </div>
            {error && <div className="text-[12px]" style={{ color: 'var(--danger, #c05050)' }}>{error}</div>}
          </div>
        )}

        {phase === 'room' && session && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between border p-2" style={{ borderColor: 'var(--panel-edge)' }}>
              <span className="text-[12px]" style={{ color: 'var(--text-dim)' }}>房间码</span>
              <span className="font-mono2 text-[22px] tracking-[0.4em]" style={{ color: 'var(--amber)' }}>{session.code}</span>
            </div>
            <div className="flex flex-col gap-2">
              {players.map((p) => (
                <div key={p.id} className="flex items-center gap-3 border p-2" style={{ borderColor: 'var(--panel-edge)' }}>
                  <AvatarPreview avatar={{ ...DEFAULT_AVATAR, ...p.avatar }} size={44} />
                  <div className="flex-1">
                    <div className="text-[13px]" style={{ color: 'var(--text)' }}>
                      {p.name}{session.isSelf(p.id) ? '（我）' : ''}{p.id === 'HOST' ? ' · 房主' : ''}
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-dim)' }}>出生点 {p.slot + 1} 号位</div>
                  </div>
                  <span className="font-mono2 text-[12px]" style={{ color: p.ready ? '#7fae6e' : 'var(--text-dim)' }}>
                    {p.ready ? '✓ 已准备' : '未准备'}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              {!me?.ready && (
                <>
                  <input value={name} maxLength={12} onChange={(e) => setName(e.target.value)} onBlur={() => applyIdentity()}
                    className="w-32 border bg-transparent px-2 py-1.5 text-[12px] outline-none"
                    style={{ borderColor: 'var(--panel-edge)', color: 'var(--text)' }} placeholder="显示名称" />
                  <button className="font-mono2 border px-3 py-1.5 text-[12px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--text)' }}
                    onClick={() => setEditAvatar(true)}>调整形象</button>
                </>
              )}
              <button className="font-title flex-1 border py-2 text-[14px]"
                style={{ borderColor: me?.ready ? '#7fae6e' : 'var(--amber)', color: me?.ready ? '#7fae6e' : 'var(--amber)' }}
                onClick={() => { audio.uiTick(); session.setReady(!me?.ready) }}>
                {me?.ready ? '取消准备' : '准备'}
              </button>
            </div>
            {session.isHost && (
              <button disabled={!allReady} className="font-title border py-2 text-[15px]"
                style={{ borderColor: allReady ? 'var(--amber)' : 'var(--panel-edge)', color: allReady ? 'var(--amber)' : 'var(--text-dim)' }}
                onClick={() => { if (allReady) session.startGame((Math.random() * 0xffffffff) >>> 0) }}>
                {allReady ? '开始游戏' : '等待全员准备…'}
              </button>
            )}
            {!session.isHost && <div className="text-center text-[12px]" style={{ color: 'var(--text-dim)' }}>等待房主开始游戏…</div>}
          </div>
        )}
      </div>
      {editAvatar && <AvatarEditor onClose={() => { setEditAvatar(false); applyIdentity() }} />}
    </div>
  )
}
