// [spokes] 迎宾女郎（Entity 28）的「参观」邀请：前台鞠躬伸手（bowInvite）时弹出（暂停游戏）。
//   接受 = 她放一只走危险路线的发条兔（关注度 +8）；婉拒 / Esc = 她继续推销，心声说「做得好」。复用 HotelNotice 卡纸（hn-*）与契约界面按钮（bd-*）。
import { useEffect } from 'react'
import { engine } from '@/game/engine'
import { audio } from '@/game/core/audio'
import { spokesAcceptInvite, spokesDeclineInvite, SK } from '@/game/engine/spokesAI'
import './HotelNotice.css'
import './BeastDeal.css'
import './Spokes.css'

export default function GreeterInvite({ onClose }: { onClose: () => void }) {
  const act = (f: () => boolean) => { f(); audio.uiTick(); onClose() }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === 'Escape' || e.code === 'Digit2') { e.preventDefault(); act(() => spokesDeclineInvite(engine)) }
      if (e.code === 'Digit1') { e.preventDefault(); act(() => spokesAcceptInvite(engine)) }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  return (
    <div className="hn-veil sp-inv" data-greeter-invite>
      <div className="bd-who">— 迎宾女郎 —</div>
      <div className="hn-card anim-slideUp">
        <div className="hn-corner tl" /><div className="hn-corner tr" /><div className="hn-corner bl" /><div className="hn-corner br" />
        <div className="hn-kicker">— 恐 怖 旅 馆 · 参 观 邀 请 —</div>
        <div className="hn-name">「加入我吧！」</div>
        <div className="hn-rule" />
        <div className="bd-v">和我一起参观，发现恐怖旅馆的一切优点。亲眼看到真相！你不想瞧一眼，否认你的怀疑吗？</div>
        <div className="sp-inv-inner">（不要！拒绝我！）</div>
      </div>
      <div className="bd-actions">
        <button className="bd-btn doubt" data-greeter-accept onClick={() => act(() => spokesAcceptInvite(engine))}>接受参观（关注度 +{SK.inviteAttn}）</button>
        <button className="bd-btn" data-greeter-decline onClick={() => act(() => spokesDeclineInvite(engine))}>婉拒</button>
      </div>
      <div className="hn-close">1 接受 · 2 / Esc 婉拒</div>
    </div>
  )
}
