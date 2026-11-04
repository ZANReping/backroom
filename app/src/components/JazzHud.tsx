// [jazz] 爵士脑（Entity 197）HUD：演出进度（第几场 / 阶段 / 曲名 / 独奏 / 在听）、终曲装死提示（监控在看：站定 + 低头，露馅进度）、
// [修] 点歌菜单挪到覆盖层 JazzMenu.tsx（暂停游戏）；真吸魂的冷色压暗罩、乐手字幕（名字金色）、曲目增益 / 辣椒酱暖身小牌、告发按住进度、下一场预告。
// 只读 jazzAI.jazzHud；什么都没有时不渲染。HUD.tsx 一行接入（// [jazz]）。
import type { Engine } from '@/game/engine'
import { jazzHud } from '@/game/engine/jazzAI'
import './Jazz.css'

const PHASE: Record<string, string> = { walkOn: '上台', tune: '调音', set: '演奏', finale: '终曲', bow: '谢幕' }

export default function JazzHud({ engine, isMobile }: { engine: Engine; isMobile: boolean }) {
  const v = jazzHud(engine)
  if (!v) return null
  const S = v.show, F = v.fake
  return (
    <>
      {S && (
        <div className="jz-show" data-jazz-show={S.phase} style={isMobile ? { top: '9%' } : undefined}>
          <div className="jz-show-h"><span className="jz-note">♪</span> 爵士脑 · 第 {S.k + 1} 场 · {PHASE[S.phase] ?? ''}</div>
          {S.phase === 'set' && <div className="jz-show-song">「{S.song}」<span>{S.style}</span>{S.solo && <em> · {S.solo}独奏</em>}</div>}
          <div className="jz-bar"><div style={{ width: `${(S.prog * 100).toFixed(1)}%` }} /></div>
          {S.listen && <div className={`jz-tag ${S.real ? 'real' : ''}`}>{S.real ? '在听——理智在流失' : '在听：理智慢慢回来 · 你不太想走'}</div>}
        </div>
      )}
      {F && (
        <div className={`jz-fake ${F.comply ? 'ok' : 'bad'}`} data-jazz-fake={F.sus.toFixed(2)}>
          <div className="jz-fake-h"><span className="jz-rec" /> 监控在看{F.beast ? ' · 后排坐着老板' : ''}</div>
          <div className="jz-fake-t">{F.comply ? '很好——就这样站着，低着头。' : '站着别动，低下头，装成被吸走的样子！'}</div>
          <div className="jz-bar sus"><div style={{ width: `${(F.sus * 100).toFixed(1)}%` }} /></div>
          <div className="jz-fake-l"><span>露馅</span><span>{Math.round(F.sus * 100)}%</span></div>
        </div>
      )}
      {v.grade > 0.01 && <div className={`jz-realfx ${S?.phase === 'finale' ? 'suck' : ''}`} data-jazz-real={v.grade.toFixed(2)} style={{ opacity: Math.min(1, v.grade) }} />}
      {v.grade > 0.5 && S?.phase === 'finale' && <div className="jz-realfx-edge" style={{ opacity: (v.grade - 0.5) * 2 }} />}
      {v.report > 0.01 && (
        <div className="jz-report" data-jazz-report={v.report.toFixed(2)}>
          <div>把他们的把戏说出来……</div>
          <div className="jz-bar rep"><div style={{ width: `${(Math.min(1, v.report) * 100).toFixed(1)}%` }} /></div>
        </div>
      )}
      {(v.buff || v.sauce > 0 || v.next) && (
        <div className="jz-chips">
          {v.next && <div className="jz-chip next" data-jazz-next>♪ {v.next}</div>}
          {v.buff && <div className="jz-chip" data-jazz-buff>♪「{v.buff.name}」{v.buff.buff} · {Math.ceil(v.buff.left)}s</div>}
          {v.sauce > 0 && <div className="jz-chip hot" data-jazz-sauce>辣椒酱暖身 · {Math.ceil(v.sauce * 240)}s</div>}
        </div>
      )}
      {v.subs.length > 0 && (
        <div className="jz-subs" data-jazz-sub>
          {v.subs.map((s, i) => <div key={i} className="jz-sub">{s.who && <b>{s.who}</b>}{s.who ? '：' : ''}{s.text}</div>)}
        </div>
      )}
    </>
  )
}
