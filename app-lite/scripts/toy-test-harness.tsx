// Development-only harness. Never copied into dist.
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import ToyShareActions from '../src/components/ToyShareActions'
import ToyEnvironment from '../src/components/ToyEnvironment'
import ToySurvivalReport from '../src/components/ToySurvivalReport'
import LobbyOverlay from '../src/components/LobbyOverlay'
import { MpSession } from '../src/game/net/session'
import * as platform from '../src/game/platform/toy'
import * as reports from '../src/game/platform/toyReport'
import { audio } from '../src/game/core/audio'
const sample: reports.SurvivalReport = { v: 1, outcome: 'dead', level: 'Level 0 · 阈限空间', seconds: 1234, kills: 3, tapes: 2, steps: 600, seed: 123456, cause: '迷失于无尽走廊' }
const calls: string[] = []
MpSession.host = async () => ({ code: 'AB23', isHost: true, started: false, players: [{ id: 'HOST', name: '测试房主', slot: 0, ready: false }], isSelf: (id: string) => id === 'HOST', leave: () => calls.push('leave'), setReady: () => {}, setIdentity: () => {} }) as unknown as MpSession
MpSession.join = async () => { calls.push('join'); throw new Error('模拟房间已关闭') }
Object.assign(window, { toyTest: { ...platform, ...reports, audio, calls } })
function ShareFixture() {
  const [code, setCode] = useState('AB23')
  return <><button onClick={() => setCode('CD45')}>切换邀请目标</button><ToyShareActions path={platform.invitationPath(code)} /></>
}
function Harness() {
  const [view, setView] = useState<'report' | 'lobby'>('report')
  if (location.search === '?share') return <><ToyEnvironment /><ShareFixture /></>
  return <><ToyEnvironment /><button onClick={() => setView('report')}>测试报告</button><button onClick={() => setView('lobby')}>测试大厅</button>
    {view === 'report' ? <ToySurvivalReport report={sample} onClose={() => setView('lobby')} /> : <LobbyOverlay initialCode="AB23" onClose={() => setView('report')} onStart={() => {}} />}</>
}
createRoot(document.getElementById('root')!).render(<Harness />)
