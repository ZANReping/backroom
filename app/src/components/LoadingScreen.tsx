// 开始游戏前的加载界面：进度条 + 当前资源名 + 已完成内容滚动日志。
interface Props {
  progress: number // 0–100
  label: string
  detail: string
  history: string[]
}

export default function LoadingScreen({ progress, label, detail, history }: Props) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)))
  const recent = history.slice(-4)
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--ink) 94%, transparent)', padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' }}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.08] font-mono2 text-[10px]" style={{ color: 'var(--text-dim)' }}>
        {['LOADING REALITY', 'SECTOR 0', 'HUM: 50Hz', 'PACKET LOSS: LOW', 'DO NOT TURN BACK'].map((s, i) => (
          <div key={s} className="absolute" style={{ left: `${(i * 43) % 88}%`, top: `${(i * 37) % 90}%` }}>{s}</div>
        ))}
      </div>

      <div className="hud-panel font-mono2 relative w-[min(560px,92vw)] px-6 py-6" style={{ background: 'color-mix(in srgb, var(--panel) 92%, transparent)' }}>
        <div className="flex items-baseline justify-between gap-4">
          <div className="text-[13px] tracking-[0.34em]" style={{ color: 'var(--text)' }}>正在进入后室</div>
          <div className="text-[22px]" style={{ color: 'var(--amber)' }}>{pct}<span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>%</span></div>
        </div>

        {/* 进度条 */}
        <div className="mt-3 h-[10px] w-full overflow-hidden border" style={{ borderColor: 'var(--panel-edge)', background: 'color-mix(in srgb, var(--ink) 82%, transparent)' }}>
          <div
            className="h-full"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg, color-mix(in srgb, var(--amber) 72%, black), var(--amber))',
              boxShadow: '0 0 14px color-mix(in srgb, var(--amber) 55%, transparent)',
              transition: 'width 0.22s ease-out',
            }}
          />
        </div>

        <div className="mt-4 min-h-[38px]">
          <div className="text-[10px] tracking-[0.28em]" style={{ color: 'var(--text-dim)' }}>{label}</div>
          <div className="mt-1 text-[12px]" style={{ color: 'var(--text)' }}>{detail || '正在准备……'}</div>
        </div>

        <div className="mt-3 flex min-h-[56px] flex-col justify-end gap-1 border-t pt-2 text-[10px]" style={{ borderColor: 'var(--panel-edge)' }}>
          {recent.length === 0 && <div style={{ color: 'var(--text-dim)' }}>—— 初始化加载器 ——</div>}
          {recent.map((h, i) => (
            <div key={`${h}-${i}`} className="truncate" style={{ color: i === recent.length - 1 ? 'var(--text)' : 'var(--text-dim)' }}>
              <span style={{ color: 'var(--amber)' }}>▸ </span>{h}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
