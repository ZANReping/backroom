// [jazz] 爵士脑（Entity 197）萨克斯点歌菜单（「你点名，我来吹。」）——[修] 按项目惯例做成覆盖层（同 BeastDeal / GreeterInvite）：
//   打开即暂停游戏（App overlay 'jazzmenu'：引擎暂停，演出 / 露馅 / 时间都冻结）；1–5 或小键盘 1–5 点歌、鼠标 / 触屏点一行点歌、Esc 或「算了」关。
//   只在菜单开着时监听按键（冒泡阶段、不拦截其它监听）；关掉以后数字键照常切快捷栏。
import { useEffect } from 'react'
import { engine } from '@/game/engine'
import { audio } from '@/game/core/audio'
import { jazzMenuView, jazzRequest, jazzCloseMenu } from '@/game/engine/jazzAI'
import './Jazz.css'

export default function JazzMenu({ onClose }: { onClose: () => void }) {
  const v = jazzMenuView(engine)
  const pick = (i: number) => { if (jazzRequest(engine, i)) onClose() }
  const close = () => { jazzCloseMenu(engine); audio.uiTick(); onClose() }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.repeat) return
      const m = /^(?:Digit|Numpad)([1-5])$/.exec(e.code)
      if (m) { e.preventDefault(); pick(Number(m[1]) - 1) }
      else if (e.key === 'Escape') { e.preventDefault(); close() }
    }
    window.addEventListener('keydown', k)
    // 引擎那边收起了（走远 / 告发）：覆盖层跟着关
    const iv = window.setInterval(() => { if (!jazzMenuView(engine)) onClose() }, 250)
    return () => { window.removeEventListener('keydown', k); window.clearInterval(iv) }
  }, [])
  if (!v) return null
  return (
    <div className="jz-menu-veil" data-jazz-menu onClick={(e) => { if (e.target === e.currentTarget) close() }}>
      <div className="jz-menu">
        <div className="jz-menu-h">萨克斯：「你点名，我来吹。」</div>
        {v.songs.map((s, i) => (
          <button key={i} className="jz-menu-i" data-jazz-song={i} onClick={() => pick(i)}>
            <b>{i + 1}</b><span className="n">「{s.name}」</span><span className="st">{s.style}</span><span className="bf">{s.buff}</span>
          </button>
        ))}
        <button className="jz-menu-x" data-jazz-menu-close onClick={close}>算了</button>
        <div className="jz-menu-f">按 1–5 或点一首 · Esc 关 · {v.during ? '这首收尾，下一首就是' : '下一场第一首'} · 游戏已暂停</div>
      </div>
    </div>
  )
}
