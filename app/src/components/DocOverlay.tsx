// 文档视图（M.E.G. 文档）：仿真纸质文档 UI——米白纸张、红头文件式抬头、编号、落款。
// 数据来源 game/docs.ts 的 DOCS 注册表；场景交互与图鉴「文档」分类共用本组件。
import { DOCS } from '@/game/docs'
import { audio } from '@/game/audio'

const SERIF = "'SimSun','Songti SC',serif"

export default function DocOverlay({ docId, onClose }: { docId: string; onClose: () => void }) {
  const doc = DOCS[docId]
  if (!doc) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="anim-slideUp relative flex max-h-[86dvh] w-full max-w-[620px] flex-col overflow-hidden rounded-sm"
        style={{
          background: '#f7f4ea',
          border: '1px solid #c9c2ae',
          boxShadow: '0 14px 46px rgba(0,0,0,0.75), inset 0 0 80px rgba(150,140,110,0.18)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 红头文件式抬头 */}
        <div className="shrink-0 border-b-2 px-8 pb-3 pt-5" style={{ borderColor: '#b03a2e' }}>
          <div className="flex items-baseline justify-between">
            <div style={{ color: '#b03a2e', fontFamily: SERIF, fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>
              M.E.G. 内部资料
            </div>
            <div className="font-mono2 text-[12px]" style={{ color: '#8a8474' }}>文档 {doc.no}</div>
          </div>
          <div className="mt-1 text-[11px]" style={{ color: '#8a8474', fontFamily: SERIF }}>
            探险者总署 · 仅限流浪者传阅 · 请勿涂改
          </div>
        </div>
        {/* 正文 */}
        <div className="overflow-y-auto px-8 py-4" style={{ fontFamily: SERIF }}>
          <h2 className="mb-4 text-center" style={{ color: '#2a2620', fontSize: 20, fontWeight: 700, letterSpacing: 4 }}>
            {doc.title}
          </h2>
          {doc.body.map((sec, i) => (
            <section key={i} className="mb-3">
              <h3 style={{ color: '#2a2620', fontSize: 15, fontWeight: 700 }}>{sec.head}</h3>
              {sec.paras.map((para, j) => (
                <p key={j} className="mt-1 text-justify" style={{ color: '#3a352c', fontSize: 13.5, lineHeight: 1.85, textIndent: '2em' }}>
                  {para}
                </p>
              ))}
            </section>
          ))}
          {/* 落款 */}
          <div className="mt-6 flex items-end justify-between border-t pt-3" style={{ borderColor: '#c9c2ae' }}>
            <div className="text-[11px]" style={{ color: '#8a8474' }}>
              本文档由 M.E.G. 档案部整理印发<br />如有缺失请报备至最近的前哨站
            </div>
            <div
              className="rounded-sm px-3 py-1"
              style={{ border: '2px solid rgba(176,58,46,0.55)', color: 'rgba(176,58,46,0.75)', fontSize: 13, fontWeight: 700, transform: 'rotate(-6deg)' }}
            >
              M.E.G. 档案部
            </div>
          </div>
        </div>
        {/* 底部操作 */}
        <div className="shrink-0 border-t px-8 py-2 text-right" style={{ borderColor: '#c9c2ae', background: 'rgba(0,0,0,0.03)' }}>
          <button
            className="font-mono2 px-4 py-1 text-[12px]"
            style={{ color: '#6a6455', border: '1px solid #c9c2ae', background: 'rgba(255,252,244,0.7)' }}
            onClick={() => { audio.uiTick(); onClose() }}
          >
            放回（Esc）
          </button>
        </div>
      </div>
    </div>
  )
}
