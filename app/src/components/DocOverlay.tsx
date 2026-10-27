// 文档视图（M.E.G. 文档）：仿真纸质文档 UI——米白纸张、红头文件式抬头、编号、落款。
// v57t：新增 book 风格——散落已久的旧书页（深棕皮壳 + 泛黄纸张 + 旧照片式配图）。
import { useState } from 'react'
import { DOCS } from '@/game/content/docs'
import { audio } from '@/game/core/audio'
import ManilaLetter from './ManilaLetter'
import MissingNotice from './MissingNotice'
import ForumPage from './ForumPage'
import BrcDocument from './BrcDocument'

const SERIF = "'SimSun','Songti SC',serif"

export default function DocOverlay({ docId, onClose }: { docId: string; onClose: () => void }) {
  const doc = DOCS[docId]
  const [imgErr, setImgErr] = useState(false)
  if (!doc) return null
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      style={{ WebkitTouchCallout: 'none' }}
      onClick={onClose}
      // v29b：移动端改为正常点按关闭——touchend 直触（不再依赖 iOS 合成 click，避免误变长按判定）
      onTouchEnd={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {doc.id === 'foyer_forum' ? (
        /* 前厅：本地社区论坛（自拟品牌 borderline，社区论坛版式：见 ForumPage.tsx） */
        <ForumPage url={doc.url} onClose={onClose} />
      ) : doc.style === 'web' ? (
        /* 前厅：电脑屏幕上的网页（浏览器外框 + 地址栏；新闻站/论坛帖，虚构域名） */
        <div
          className="anim-slideUp relative flex max-h-[86dvh] w-full max-w-[760px] flex-col overflow-hidden rounded-md"
          style={{ background: '#fbfbfa', border: '1px solid #3a3d44', boxShadow: '0 14px 46px rgba(0,0,0,0.8), 0 0 0 6px #17191d' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center gap-2 px-3 py-2" style={{ background: '#2a2d33' }}>
            <span className="inline-block h-[10px] w-[10px] rounded-full" style={{ background: '#e0605a' }} />
            <span className="inline-block h-[10px] w-[10px] rounded-full" style={{ background: '#e6b84f' }} />
            <span className="inline-block h-[10px] w-[10px] rounded-full" style={{ background: '#5fb66b' }} />
            <div className="ml-2 flex-1 truncate rounded px-3 py-[3px] font-mono2 text-[12px]" style={{ background: '#1b1d21', color: '#aab0ba' }}>🔒 {doc.url ?? 'about:blank'}</div>
          </div>
          <div className="overflow-y-auto px-7 py-5" style={{ fontFamily: '-apple-system,"Segoe UI","PingFang SC","Noto Sans CJK SC",sans-serif' }}>
            <div className="mb-1 text-[12px]" style={{ color: '#8a8f98' }}>{doc.no}</div>
            <h2 className="mb-4" style={{ color: '#16181c', fontSize: 21, fontWeight: 700, lineHeight: 1.35 }}>{doc.title}</h2>
            {doc.body.map((sec, i) => (
              <section key={i} className="mb-4 rounded" style={{ borderLeft: '3px solid #2f6fd6', background: i % 2 ? '#f2f4f7' : 'transparent', padding: '6px 12px' }}>
                <h3 style={{ color: '#2f6fd6', fontSize: 13, fontWeight: 700 }}>{sec.head}</h3>
                {sec.paras.map((para, j) => (
                  <p key={j} className="mt-1" style={{ color: '#2b2e33', fontSize: 14, lineHeight: 1.8 }}>{para}</p>
                ))}
              </section>
            ))}
          </div>
          <div className="shrink-0 border-t px-6 py-2 text-right" style={{ borderColor: '#dde0e5', background: '#f2f3f5' }}>
            <button
              className="font-mono2 px-4 py-1 text-[12px]"
              style={{ color: '#4a4f57', border: '1px solid #c8ccd3', background: '#fff' }}
              onClick={() => { audio.uiTick(); onClose() }}
              onTouchStart={() => { audio.uiTick(); onClose() }}
            >
              离开屏幕（Esc）
            </button>
          </div>
        </div>
      ) : doc.style === 'missing' ? <MissingNotice doc={doc} onClose={onClose}/> : doc.style === 'foundation' ? <ManilaLetter doc={doc} onClose={onClose}/> : doc.style === 'brc' && doc.brc ? <BrcDocument doc={doc} onClose={onClose} /> : doc.style === 'note' ? (
        /* 手写纸条风格：泛黄横线纸 + 斜体，无红头/落款（v34：L1 迎新纸条） */
        <div
          className="anim-slideUp relative flex max-h-[86dvh] w-full max-w-[620px] flex-col overflow-hidden rounded-sm"
          style={{
            background: '#f3e9c6',
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent 0, transparent 27px, rgba(122,100,58,0.30) 27px, rgba(122,100,58,0.30) 28px)',
            border: '1px solid #cfc09a',
            boxShadow: '0 14px 46px rgba(0,0,0,0.75), inset 0 0 60px rgba(150,130,80,0.16)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="overflow-y-auto px-8 pb-2 pt-6" style={{ fontFamily: doc.font === 'zhimangxing' ? "'Zhi Mang Xing',cursive" : SERIF }}>
            {doc.body.map((sec, i) => (
              <section key={i}>
                {doc.heads && sec.head && <h3 data-doc-head="1" style={{ color: '#3b3122', fontSize: doc.font === 'zhimangxing' ? 21 : 16, fontWeight: 700, fontStyle: 'normal', letterSpacing: '.08em', lineHeight: '28px', margin: 0 }}>{sec.head}</h3>}
                {sec.paras.map((para, j) => (
                  <p key={j} className="text-justify" style={{ color: '#4d4331', fontSize: doc.font === 'zhimangxing' ? 19 : 15, lineHeight: '28px', fontStyle: doc.font === 'zhimangxing' ? 'normal' : 'italic', margin: 0, marginBottom: 28 }}>
                    {para}
                  </p>
                ))}
              </section>
            ))}
          </div>
          <div className="shrink-0 px-8 py-2 text-right" style={{ background: 'rgba(0,0,0,0.04)' }}>
            <button
              className="font-mono2 px-4 py-1 text-[12px]"
              style={{ color: '#6a6455', border: '1px solid #cfc09a', background: 'rgba(255,252,238,0.7)' }}
              onClick={() => { audio.uiTick(); onClose() }}
              onTouchStart={() => { audio.uiTick(); onClose() }}
            >
              放回（Esc）
            </button>
          </div>
        </div>
      ) : doc.style === 'book' ? (
        /* v57t：旧书风格——深棕皮壳、左侧书脊、泛黄厚纸，配图像夹在书页里的旧照片 */
        <div
          className="anim-slideUp relative w-full max-w-[760px]"
          style={{ transform: 'rotate(-0.6deg)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="relative flex max-h-[86dvh] flex-col overflow-hidden"
            style={{
              background: '#4a3322',
              padding: '14px 16px 16px 22px',
              borderRadius: '4px 18px 18px 4px',
              boxShadow: '0 18px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,235,190,0.12), inset 0 -1px 0 rgba(0,0,0,0.5)',
            }}
          >
            {/* 左侧书脊 */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-[14px]" style={{ background: 'linear-gradient(to right, #241710 0%, #3a2517 45%, #5a3d22 80%, #2c1b12 100%)' }} />
            <div className="pointer-events-none absolute inset-y-0 left-[14px] w-[2px]" style={{ background: 'rgba(0,0,0,0.55)' }} />
            <div
              className="no-scrollbar min-h-0 flex-1 overflow-y-auto pl-7 pr-5"
              style={{
                background: '#e8d6a6',
                backgroundImage:
                  'radial-gradient(ellipse at 20% 12%, rgba(120,90,50,0.14) 0 22%, transparent 38%), radial-gradient(ellipse at 85% 88%, rgba(110,80,40,0.16) 0 18%, transparent 32%), repeating-linear-gradient(0deg, rgba(90,64,34,0.045) 0 2px, transparent 2px 4px)',
                color: '#3f2f1d',
                boxShadow: 'inset 0 0 40px rgba(120,88,44,0.28)',
              }}
            >
              {/* 页眉：页码像旧打字机敲的 */}
              <div className="flex items-start justify-between pt-5" style={{ fontFamily: SERIF }}>
                <div className="text-[11px] tracking-[0.35em]" style={{ color: '#6a5232' }}>{doc.no}</div>
                <div className="font-mono2 text-[11px]" style={{ color: '#7a6240' }}>LEVEL 7 · 手记残页</div>
              </div>
              <h2 className="mb-1 mt-3 text-center" style={{ color: '#332414', fontSize: 26, fontWeight: 700, letterSpacing: 6, textShadow: '0 1px 0 rgba(255,244,214,0.55)' }}>
                {doc.title}
              </h2>
              <div className="mx-auto mb-3 mt-1 h-px w-2/3" style={{ background: 'linear-gradient(to right, transparent, rgba(74,52,26,0.6), transparent)' }} />
              {/* 配图：像一张夹在书页里的旧照片 */}
              {doc.image && !imgErr && (
                <figure className="mb-4 mt-2" style={{ textAlign: 'center' }}>
                  <img
                    src={doc.image}
                    alt={doc.title}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    onError={() => setImgErr(true)}
                    style={{
                      maxWidth: '100%',
                      maxHeight: 300,
                      margin: '0 auto',
                      border: '10px solid rgba(255,250,235,0.55)',
                      outline: '1px solid rgba(74,52,26,0.45)',
                      boxShadow: '0 6px 18px rgba(40,26,12,0.42), inset 0 0 24px rgba(255,248,224,0.25)',
                      filter: 'sepia(0.28) contrast(1.05) brightness(0.96)',
                      transform: 'rotate(0.8deg)',
                    }}
                  />
                  <figcaption className="mt-2 font-mono2 text-[10px]" style={{ color: '#6a5232', letterSpacing: 1 }}>
                    夹在书页间的照片——背面写着「The Thing On Level 7」
                  </figcaption>
                </figure>
              )}
              {doc.body.map((sec, i) => (
                <section key={i}>
                  {sec.head && <h3 style={{ color: '#332414', fontSize: 16, fontWeight: 700 }}>{sec.head}</h3>}
                  {sec.paras.map((para, j) => (
                    <p key={j} className="mb-4 text-justify" style={{ fontFamily: SERIF, fontSize: 15.5, lineHeight: 1.95, textIndent: '2em' }}>
                      {para}
                    </p>
                  ))}
                </section>
              ))}
              <div className="pb-5 pt-1 text-right text-[11px] italic" style={{ fontFamily: SERIF, color: '#6a5232' }}>—— 书页到此为止，后面被海水泡烂了。</div>
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <button
              className="font-mono2 px-4 py-1 text-[12px]"
              style={{ color: '#e8d6a6', border: '1px solid rgba(232,214,166,0.5)', background: 'rgba(20,12,8,0.55)' }}
              onClick={() => { audio.uiTick(); onClose() }}
              onTouchStart={() => { audio.uiTick(); onClose() }}
            >
              合上（Esc）
            </button>
          </div>
        </div>
      ) : (
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
            // v29b：移动端正常点按即关闭（合成 click 重复触发 onClose 亦幂等无害）
            onTouchStart={() => { audio.uiTick(); onClose() }}
          >
            放回（Esc）
          </button>
        </div>
      </div>
      )}
    </div>
  )
}
