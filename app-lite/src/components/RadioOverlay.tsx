// 程序化电台说明面板（保留暂停页入口接口，lite 版不加载外部曲目）。
export default function RadioOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="anim-slideUp hud-panel w-full max-w-[420px] p-5" style={{ background: 'var(--panel)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-title text-[20px]" style={{ color: 'var(--amber)' }}>程序化电台</h2>
          <button type="button" className="font-mono2 border px-3 py-1 text-[13px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--text-dim)' }} onClick={onClose}>关闭</button>
        </div>
        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text)' }}>当前版本使用实时生成的音乐，随层级自动变化。</p>
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>背景音乐音量由音频设置控制。</p>
      </div>
    </div>
  )
}
