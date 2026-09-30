import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { drawReport, reportPath, reportRows, type SurvivalReport } from '@/game/platform/toyReport'
import { getToyQr, subscribeToy, toySnapshot } from '@/game/platform/toy'
import ToyShareActions from './ToyShareActions'

export default function ToySurvivalReport({ report, onClose, shared = false }: { report: SurvivalReport; onClose: () => void; shared?: boolean }) {
  const [image, setImage] = useState('')
  const [message, setMessage] = useState('')
  const dialog = useRef<HTMLDivElement>(null)
  const { supported } = useSyncExternalStore(subscribeToy, toySnapshot)
  const path = reportPath(report)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])
  useEffect(() => {
    let alive = true
    void (async () => {
      try { const data = await drawReport(report); if (alive) setImage(data) }
      catch { if (alive) setMessage('报告图片生成失败，仍可分享链接。') }
      if (!alive || !supported.getQrCode || !window.toy) return
      try {
        const qr = await getToyQr(path)
        if (!alive) return
        const data = await drawReport(report, qr.base64)
        if (alive) setImage(data)
      } catch { if (alive) setMessage('二维码暂不可用，已生成纯文字报告。可用“显示二维码”重试。') }
    })()
    return () => { alive = false }
  }, [report, path, supported.getQrCode])
  return <div ref={dialog} role="dialog" aria-modal="true" aria-label="后室生存报告" onKeyDown={e => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    if (e.key === 'Tab') {
      const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, summary') ?? []).filter(node => node.getClientRects().length > 0)
      if (!nodes.length) return
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }} className="fixed inset-0 z-[80] overflow-y-auto bg-black/90 p-4" style={{ paddingTop: 'calc(var(--toy-safe-top, env(safe-area-inset-top)) + 16px)', paddingBottom: 'calc(var(--toy-safe-bottom, env(safe-area-inset-bottom)) + 16px)', paddingLeft: 'calc(var(--toy-safe-left, env(safe-area-inset-left)) + 16px)', paddingRight: 'calc(var(--toy-safe-right, env(safe-area-inset-right)) + 16px)' }}>
    <div className="hud-panel mx-auto max-w-lg p-4" style={{ color: 'var(--text)' }}>
      <div className="flex items-center justify-between"><h2 className="text-lg">后室生存报告</h2><button className="border px-3 py-2" onClick={onClose}>{shared ? '进入游戏首页' : '关闭报告'}</button></div>
      {shared && <p className="my-2 text-xs">这是玩家分享的记录，仅供展示，不会覆盖你的存档。</p>}
      {image ? <img src={image} alt="后室生存报告卡片" className="mx-auto mt-3 w-full max-w-[360px]" /> : <dl>{reportRows(report).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
      {message && <p role="status" className="text-xs">{message}</p>}
      <ToyShareActions path={path} image={image} />
    </div>
  </div>
}
