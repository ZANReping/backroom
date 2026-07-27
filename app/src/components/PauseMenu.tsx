// 暂停菜单
import { audio } from '@/game/audio'

interface Props {
  onResume: () => void
  onSettings: () => void
  onHowTo: () => void
  onQuit: () => void
}

export default function PauseMenu({ onResume, onSettings, onHowTo, onQuit }: Props) {
  const items: [string, () => void][] = [
    ['继续', onResume],
    ['设置', onSettings],
    ['操作说明', onHowTo],
    ['保存并退出到标题', onQuit],
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center bg-black/60 backdrop-saturate-[0.6]">
      <div className="hud-panel anim-slideUp ml-0 flex w-[280px] flex-col gap-3 p-6 max-md:mx-auto" style={{ background: 'var(--panel)' }}>
        <h2 className="font-title mb-2 text-[26px]" style={{ color: 'var(--amber)' }}>已暂停</h2>
        {items.map(([label, fn], i) => (
          <button
            key={label}
            className="menu-btn anim-slideUp"
            style={{ animationDelay: `${i * 40}ms` }}
            onClick={() => { audio.uiTick(); fn() }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
