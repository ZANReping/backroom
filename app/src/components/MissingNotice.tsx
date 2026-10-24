import { useEffect, useRef } from 'react'
import type { DocDef } from '@/game/content/docs'
import { audio } from '@/game/core/audio'
import './MissingNotice.css'

/** A weathered family notice from the Frontrooms, with the existing story text. */
export default function MissingNotice({ doc, onClose }: { doc: DocDef; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    ref.current?.focus()
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  return (
    <div ref={ref} className="missing-notice anim-slideUp" data-missing-notice role="dialog" aria-modal="true" aria-labelledby="missing-notice-title" tabIndex={-1} onClick={e => e.stopPropagation()}>
      <article className="missing-notice__paper">
        <div className="missing-notice__content">
          <div className="missing-notice__edition">家属张贴 · 寻找线索</div>
          <header className="missing-notice__header">
            <h2 id="missing-notice-title">寻人启事</h2>
            <p>MISSING PERSON</p>
          </header>
          <div className="missing-notice__identity">
            <figure className="missing-notice__photo">
              <svg viewBox="0 0 160 192" role="img" aria-label="被雨水漂白的失联者照片，依稀可见深色头发和浅色外套">
                <defs>
                  <linearGradient id="missing-photo-bg" x2="0.8" y2="1"><stop stopColor="#a8a69e"/><stop offset="1" stopColor="#ddd9cf"/></linearGradient>
                  <linearGradient id="missing-photo-fade" x2="0.7" y2="1"><stop stopColor="#e6e2d8" stopOpacity=".05"/><stop offset=".6" stopColor="#f5f0e5" stopOpacity=".72"/><stop offset="1" stopColor="#f5f0e5" stopOpacity=".16"/></linearGradient>
                </defs>
                <path fill="url(#missing-photo-bg)" d="M0 0h160v192H0z"/>
                <path fill="#53534f" d="M38 92c-9-42 5-69 38-73 42-3 52 35 43 82l-13 30H44z"/>
                <path fill="#bbb7aa" d="M67 109h28l3 28H62z"/>
                <path fill="#cfcbc0" d="M50 52c7-29 62-28 62 12l-4 31c-4 20-20 30-32 23-22-11-29-38-26-66"/>
                <path fill="#68665f" d="M48 63c5-47 59-46 66-7-18-6-23-14-29-19-8 15-22 22-37 26"/>
                <path fill="#d6d2c7" d="M8 192l5-41c3-14 19-19 49-25l17 16 18-17c30 6 48 13 50 29l7 38z"/>
                <path fill="#f0ece2" d="m60 126 19 16-10 22-18-32m47-7-19 17 10 22 20-31"/>
                <path fill="#77766f" d="m79 142-1 50h3v-50z"/>
                <path stroke="#7b7971" strokeWidth="2" d="m61 75 10 1m19-1 10-1m-18 25 9 1" opacity=".4"/>
                <path fill="url(#missing-photo-fade)" d="M0 0h160v192H0z"/>
                <path fill="#f1ecdf" d="M3 4 46 0l-9 192H0zm111-4h31l-17 192h-21z" opacity=".27"/>
                <path fill="none" stroke="#eee8d9" strokeWidth="4" d="m29 0-8 83 7 59-5 50m117-192-4 102 9 90" opacity=".45"/>
              </svg>
              <figcaption>近照 · 雨损复印件</figcaption>
            </figure>
            <dl>
              <div><dt>姓名</dt><dd>陈某</dd></div>
              <div><dt>年龄</dt><dd>19 岁</dd></div>
              <div><dt>衣着</dt><dd>浅色外套</dd></div>
              <div><dt>失联时间</dt><dd>10 月 14 日<br/>晚 23 点后</dd></div>
              <div><dt>最后出现</dt><dd>第六大街附近<br/>旧仓路一带</dd></div>
            </dl>
          </div>
          <div className="missing-notice__appeal">
            <strong>如有线索，请联系家属</strong>
            <p>{doc.body[0]?.paras[1]?.replace(/[「」]/g, '')}</p>
            <div className="missing-notice__phone">555-0127</div>
            <span>感谢每一位愿意提供帮助的人。</span>
          </div>
          <p className="missing-notice__pencil">不要去那条巷子找她。</p>
          <p className="missing-notice__observation">{doc.body[0]?.paras[3]}</p>
        </div>
        <div className="missing-notice__tabs" aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => <span key={i}>线索联系<br/><b>555-0127</b></span>)}
        </div>
      </article>
      <footer className="missing-notice__footer">
        <span>{doc.no}</span>
        <button type="button" data-missing-close onClick={() => { audio.uiTick(); onClose() }}>放回（Esc）</button>
      </footer>
    </div>
  )
}
