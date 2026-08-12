// 定居点地标卡（交互地标后弹出）：地标纸条内容 + 对应据点简介 + 前往/离开
import { OUTPOSTS } from '@/game/content/outposts'
import { engine } from '@/game/engine'
import { audio } from '@/game/core/audio'

export default function LandmarkOverlay({ outpostId, onClose }: { outpostId: string; onClose: () => void }) {
  const o = OUTPOSTS[outpostId]
  if (!o) return null
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      onTouchEnd={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="anim-slideUp w-full max-w-[520px] rounded-sm p-5"
        style={{ background: '#f3e9c6', color: '#3a332c', border: '1px solid #cfc09a', boxShadow: '0 14px 46px rgba(0,0,0,0.75)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 font-title text-[20px]" style={{ color: '#6a5a20' }}>🚩 定居点地标</div>
        {o.landmarkText.map((t, i) => (
          <p key={i} className="mb-2 text-[13px] leading-relaxed" style={{ fontStyle: 'italic', fontFamily: "'SimSun','Songti SC',serif" }}>{t}</p>
        ))}
        <div className="my-3 border-t" style={{ borderColor: '#cfc09a' }} />
        <div className="font-mono2 mb-1 text-[11px]" style={{ color: '#8a7a3a' }}>对应据点</div>
        <div className="font-title mb-1 text-[17px]">{o.name}</div>
        <p className="mb-4 text-[12.5px] leading-relaxed">{o.intro[0]}</p>
        <div className="flex gap-2">
          <button
            className="flex-1 border px-4 py-2 font-mono2 text-[13px]"
            style={{ borderColor: '#8a7a3a', background: '#e8d9a0', color: '#4a3f18' }}
            onClick={() => { audio.uiTick(); engine.enterOutpost(o.id); onClose() }}
          >
            前往 {o.name} →
          </button>
          {/* v55：家常酒店入住申请——未提交时显示申请按钮（姓名自动取玩家形象名；提交后永久解锁） */}
          {o.id === 'homely' && !engine.homelyApplied && (
            <button
              className="flex-1 border px-4 py-2 font-mono2 text-[13px]"
              style={{ borderColor: '#5a8a9a', background: '#d8e4e8', color: '#2a4a56' }}
              onClick={() => { audio.uiTick(); engine.applyHomelyStay() }}
            >
              提交流浪者信息申请
            </button>
          )}
          <button
            className="border px-4 py-2 font-mono2 text-[13px]"
            style={{ borderColor: '#cfc09a', color: '#6a6455' }}
            onClick={() => { audio.uiTick(); onClose() }}
          >
            离开
          </button>
        </div>
        {o.id === 'homely' && engine.homelyApplied && (
          <div className="mt-2 font-mono2 text-[11px]" style={{ color: '#5a8a9a' }}>✓ 入住申请已受理（永久有效）</div>
        )}
      </div>
    </div>
  )
}
