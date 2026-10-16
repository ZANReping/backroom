import { useEffect, useRef, useState } from 'react'
import type { Engine } from '@/game/engine'
import { levelLabel } from '@/game/levels'

type ExitMode = 'summon' | 'teleport'
type ExitDestination = Engine['levelDef']['exits'][number]['dest']
const targetLabel = (dest: ExitDestination) => typeof dest === 'number' ? `→ ${levelLabel(dest)}` : dest === 'back' ? '→ 返回' : dest === 'win' ? '→ 结局' : '→ 随机'

export default function DevExitTools({ engine }: { engine: Engine }) {
  const level = engine.player.level
  const [mode, setMode] = useState<ExitMode>('summon')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const request = useRef<AbortController | null>(null)
  const sequence = useRef(0)

  useEffect(() => {
    sequence.current++
    request.current?.abort()
    request.current = null
    setBusy(false)
    setStatus('')
    return () => { sequence.current++; request.current?.abort(); request.current = null }
  }, [engine, level])

  const operate = async (kind: string, dest: ExitDestination) => {
    if (busy) return
    const controller = new AbortController(), token = ++sequence.current
    request.current?.abort(); request.current = controller; setBusy(true); setStatus(mode === 'teleport' ? '正在查找最近出口…' : '正在检查放置位置…')
    try {
      const result = await engine.devOperateExit(kind, mode, controller.signal, dest, message => {
        if (token === sequence.current && !controller.signal.aborted) setStatus(message)
      })
      if (token === sequence.current && !controller.signal.aborted) setStatus(result.message)
    } catch (error) {
      if (token === sequence.current && !controller.signal.aborted) setStatus(error instanceof Error ? `失败：${error.message}` : '失败：出口操作未完成')
    } finally {
      if (token === sequence.current) { request.current = null; setBusy(false) }
    }
  }

  const cancel = () => {
    sequence.current++
    request.current?.abort()
    request.current = null
    setBusy(false)
    setStatus('已取消')
  }

  const buttonStyle = (active = false): React.CSSProperties => ({
    border: `1px solid ${active ? 'var(--amber)' : 'var(--panel-edge)'}`,
    color: active ? 'var(--amber)' : 'var(--text-dim)',
    background: 'color-mix(in srgb, var(--panel) 80%, transparent)',
    minHeight: 32,
    padding: '6px 8px',
  })
  const action = mode === 'summon' ? '召唤' : '传送'
  return <div data-dev-exit-tools className="mb-2">
    <div className="mb-1" style={{ color: 'var(--amber)' }}>出口工具</div>
    <div className="mb-1 flex gap-1" role="group" aria-label="出口操作模式">
      <button type="button" data-exit-mode="summon" aria-pressed={mode === 'summon'} disabled={busy} style={buttonStyle(mode === 'summon')} onClick={() => setMode('summon')}>召唤出口</button>
      <button type="button" data-exit-mode="teleport" aria-pressed={mode === 'teleport'} disabled={busy} style={buttonStyle(mode === 'teleport')} onClick={() => setMode('teleport')}>传送到出口</button>
    </div>
    <div className="mb-1" style={{ color: 'var(--text-dim)', fontSize: 11 }}>召唤在附近符合条件的地点生成；传送搜索最近对应出口并落在附近安全空地。</div>
    {busy && mode === 'teleport' && <button type="button" disabled={!busy} style={buttonStyle()} onClick={cancel}>取消传送</button>}
    <div className="grid grid-cols-2 gap-1">
      {Array.from(new Map(engine.levelDef.exits.map((exit) => [`${exit.kind}:${String(exit.dest)}`, exit] as const)).values()).map((exit) => <button key={`${exit.kind}:${String(exit.dest)}`} type="button" data-exit-kind={exit.kind} data-exit-dest={String(exit.dest)} disabled={busy} title={`${action}${exit.name}`} style={buttonStyle()} onClick={() => { void operate(exit.kind, exit.dest) }}>{busy ? (mode === 'summon' ? '正在放置…' : '正在准备传送…') : `${mode === 'summon' ? '🚪 召唤' : '⇢ 传送'} ${exit.name} ${targetLabel(exit.dest)}`}</button>)}
    </div>
    {level === 11 && <div style={{ color: 'var(--text-dim)', fontSize: 10, marginTop: 4 }}>L11 门依附对应建筑；电梯井仅限未完工楼现有井口；L4 为上层办公间，L601 为档案馆专用门。</div>}
    {status && <div role="status" style={{ color: 'var(--text-dim)', marginTop: 4 }}>{status}</div>}
  </div>
}
