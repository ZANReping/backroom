// Level 0.2：后室装修公司（BRC）纸质施工单据阅读界面（第五轮）。
// 按单据类型区分版式：施工许可证（蓝色复写联 + 钢印）、施工日志（打印表格 + 空白记录行）、工作单（栏位 + 主管批注）、
// 巡检记录表（勾选栏 + 现场备注，底边撕裂）。共同元素：表头（单位/单据名/编号/日期/页码）、表格栏位、签名栏、红色印章、
// 打印纸/复写纸质感、手写填写（志莽行 → 楷体回落，蓝黑墨水）。来源署名放在页脚小字。纯 CSS，无图片资源。
import type { CSSProperties } from 'react'
import type { DocDef } from '@/game/content/docs'
import { audio } from '@/game/core/audio'

const PRINT = "'Noto Sans CJK SC','PingFang SC','Microsoft YaHei',sans-serif"
const SERIF = "'Noto Serif CJK SC','SimSun','Songti SC',serif"
const HAND = "'Zhi Mang Xing','STKaiti','KaiTi','Kaiti SC',cursive"

const PAPER: Record<string, { bg: string; ink: string; rule: string; print: string; edge: string }> = {
  // 蓝色复写联：淡蓝纸底 + 复写出来的蓝紫字
  permit: { bg: '#dfe7f1', ink: '#1d2f7a', rule: 'rgba(40,60,130,.35)', print: '#2d3f86', edge: '#b8c6da' },
  log: { bg: '#f6f3ea', ink: '#1e2c66', rule: 'rgba(60,60,60,.45)', print: '#2b2a27', edge: '#d8d1bf' },
  workorder: { bg: '#f8f1d9', ink: '#1e2c66', rule: 'rgba(90,70,30,.45)', print: '#3a3020', edge: '#dccb98' },
  inspect: { bg: '#f3f2ee', ink: '#22306e', rule: 'rgba(60,60,60,.45)', print: '#2b2a27', edge: '#d6d3ca' },
}

function Stamp({ text, sub, style }: { text: string; sub?: string; style?: CSSProperties }) {
  return (
    <div aria-hidden="true" data-doc-stamp className="pointer-events-none absolute flex flex-col items-center justify-center rounded-full text-center"
      style={{ width: 92, height: 92, border: '3px solid rgba(190,40,36,.78)', boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.0), inset 0 0 0 5px rgba(190,40,36,.55)', color: 'rgba(190,40,36,.82)', fontFamily: SERIF, fontWeight: 700, transform: 'rotate(-14deg)', mixBlendMode: 'multiply', opacity: .85, ...style }}>
      <div style={{ fontSize: 11, letterSpacing: '.05em', lineHeight: 1.2 }}>{text}</div>
      <div style={{ fontSize: 16, lineHeight: 1 }}>★</div>
      {sub && <div style={{ fontSize: 10, lineHeight: 1.2 }}>{sub}</div>}
    </div>
  )
}

export default function BrcDocument({ doc, onClose }: { doc: DocDef; onClose: () => void }) {
  const f = doc.brc!
  const P = PAPER[f.kind]
  const cell: CSSProperties = { border: `1px solid ${P.rule}`, padding: '4px 6px', verticalAlign: 'top', overflowWrap: 'anywhere', wordBreak: 'break-word' }
  const label: CSSProperties = { ...cell, color: P.print, fontFamily: PRINT, fontSize: 11, whiteSpace: 'nowrap', width: '1%', background: 'rgba(0,0,0,.035)' }
  const hand: CSSProperties = { color: P.ink, fontFamily: HAND, fontSize: 17, lineHeight: 1.45 }
  const torn = f.kind === 'inspect'
  return (
    <div
      data-brc-doc={f.kind}
      className="anim-slideUp relative flex max-h-[88dvh] w-full max-w-[640px] flex-col overflow-hidden"
      style={{
        background: P.bg,
        // 打印纸纤维 + 复写纸的横向轻微压痕
        backgroundImage: f.kind === 'permit'
          ? 'repeating-linear-gradient(0deg, rgba(30,50,120,.035) 0 1px, transparent 1px 3px), radial-gradient(circle at 20% 10%, rgba(255,255,255,.35), transparent 60%)'
          : 'repeating-linear-gradient(90deg, rgba(0,0,0,.012) 0 1px, transparent 1px 4px), radial-gradient(circle at 80% 0%, rgba(255,255,255,.4), transparent 55%), radial-gradient(circle at 10% 100%, rgba(150,130,90,.12), transparent 50%)',
        border: `1px solid ${P.edge}`,
        boxShadow: '0 14px 46px rgba(0,0,0,0.75), inset 0 0 50px rgba(120,100,60,0.10)',
        clipPath: torn ? 'polygon(0 0,100% 0,100% 97%,96% 99%,91% 97.5%,85% 99.6%,79% 97.8%,72% 99.4%,66% 97.6%,59% 99.7%,52% 98%,46% 99.5%,39% 97.7%,33% 99.6%,26% 98%,19% 99.5%,12% 97.8%,6% 99.4%,0 98%)' : undefined,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative overflow-y-auto px-4 pb-3 pt-4 sm:px-7 sm:pt-6" style={{ fontFamily: PRINT, color: P.print }}>
        {f.kind === 'permit' && <div aria-hidden="true" className="absolute left-0 top-0 h-full w-[10px]" style={{ background: 'repeating-linear-gradient(180deg, transparent 0 14px, rgba(30,50,120,.25) 14px 20px)' }} />}
        {/* 表头：单位 / 单据名 / 编号 / 日期 / 页码 */}
        <div className="flex items-start justify-between gap-3 border-b-2 pb-2" style={{ borderColor: P.print }}>
          <div className="min-w-0">
            <div className="text-[11px] tracking-[0.2em]" style={{ fontFamily: PRINT }}>后室装修公司 · BACKROOMS REMODELING CO.</div>
            <div className="mt-0.5 text-[22px] font-bold tracking-[0.3em]" style={{ fontFamily: SERIF, color: P.print }} data-doc-form>{f.form}</div>
            {f.motto && <div className="text-[11px]" style={{ color: P.print, opacity: .8 }}>{f.motto}</div>}
          </div>
          <table className="shrink-0 text-[10.5px]" style={{ borderCollapse: 'collapse', fontFamily: PRINT }}>
            <tbody>
              <tr><td style={label}>编号</td><td style={{ ...cell, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap', color: f.kind === 'permit' ? '#b3261e' : P.print }}>{f.no}</td></tr>
              <tr><td style={label}>日期</td><td style={{ ...cell, ...hand, fontSize: 14, whiteSpace: 'nowrap' }}>{f.date}</td></tr>
              <tr><td style={label}>页码</td><td style={{ ...cell, fontSize: 11, whiteSpace: 'nowrap' }}>{f.page}</td></tr>
            </tbody>
          </table>
        </div>
        {/* 栏位 */}
        {f.fields && f.fields.length > 0 && (
          <table className="mt-3 w-full" style={{ borderCollapse: 'collapse', tableLayout: 'auto' }}>
            <tbody>
              {f.fields.map(([k, v], i) => (
                <tr key={i}><td style={label}>{k}</td><td style={{ ...cell, ...hand, fontSize: 16 }}>{v}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        {/* 表格行（日志 / 巡检） */}
        {f.rows && f.cols && (
          <table className="mt-3 w-full text-[12px]" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead><tr>{f.cols.map((c, i) => <th key={i} style={{ ...label, width: f.colW?.[i], whiteSpace: 'normal', textAlign: 'center', fontWeight: 700 }}>{c}</th>)}</tr></thead>
            <tbody>
              {f.rows.map((r, i) => (
                <tr key={i}>{r.map((v, j) => <td key={j} style={{ ...cell, ...(j === 0 ? { fontFamily: PRINT, fontSize: 11, color: P.print } : { ...hand, fontSize: 15 }), height: 26, textAlign: v === '✓' || v === '✗' || v === '□' ? 'center' : 'left' }}>{v}</td>)}</tr>
              ))}
            </tbody>
          </table>
        )}
        {/* 手写正文（批注 / 报告 / 封面说明）：横线纸上的蓝黑墨水 */}
        {doc.body.map((sec, i) => (
          <section key={i} className="mt-3">
            {sec.head && <h3 data-doc-head="1" className="text-[12px] font-bold tracking-[0.15em]" style={{ color: P.print, fontFamily: PRINT, margin: 0, borderLeft: `3px solid ${P.print}`, paddingLeft: 6 }}>{sec.head}</h3>}
            <div className="mt-1" style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent 27px, ${P.rule} 27px, ${P.rule} 28px)`, padding: '0 4px' }}>
              {sec.paras.map((para, j) => (
                <p key={j} style={{ ...hand, lineHeight: '28px', margin: 0, transform: `rotate(${(j % 2 ? 0.25 : -0.2)}deg)` }}>{para}</p>
              ))}
            </div>
          </section>
        ))}
        {/* 签名栏 + 印章 */}
        {f.sign && (
          <div className="relative mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(3, f.sign.length)}, minmax(0, 1fr))` }}>
            {f.sign.map(([k, v], i) => (
              <div key={i} className="min-w-0" data-doc-sign>
                <div className="text-[10.5px]" style={{ fontFamily: PRINT }}>{k}</div>
                <div className="border-b" style={{ borderColor: P.print, minHeight: 30, ...hand, fontSize: 19, transform: 'rotate(-2deg)', overflowWrap: 'anywhere' }}>{v}</div>
              </div>
            ))}
            {f.stamp && <Stamp text={f.stamp} sub={f.stampSub} style={{ right: 16, top: -34 }} />}
            {f.kind === 'permit' && (
              <div aria-hidden="true" data-doc-seal className="pointer-events-none absolute rounded-full" style={{ width: 74, height: 74, right: 96, top: -18, background: 'radial-gradient(circle at 38% 34%, rgba(255,240,190,.9), rgba(200,160,60,.75) 45%, rgba(140,100,30,.8) 70%, rgba(110,80,20,.0) 72%)', boxShadow: 'inset 0 0 0 4px rgba(255,235,170,.35), inset 0 0 0 9px rgba(120,90,30,.25)', opacity: .8 }} />
            )}
          </div>
        )}
        {/* 页脚：联次 + 来源小字 */}
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-1 border-t pt-1.5 text-[9.5px] leading-snug" style={{ borderColor: P.rule, color: P.print, opacity: .72, fontFamily: PRINT }}>
          <span>{f.copy ?? '第一联：存根　第二联：施工方　第三联：主管'}</span>
          {f.src && <span data-doc-source className="min-w-0" style={{ fontSize: 9, opacity: .85, overflowWrap: 'anywhere' }}>{f.src}</span>}
        </div>
      </div>
      <div className="shrink-0 px-6 py-2 text-right" style={{ background: 'rgba(0,0,0,0.05)' }}>
        <button
          className="font-mono2 px-4 py-1 text-[12px]"
          style={{ color: P.print, border: `1px solid ${P.edge}`, background: 'rgba(255,255,255,0.6)' }}
          onClick={() => { audio.uiTick(); onClose() }}
          onTouchStart={() => { audio.uiTick(); onClose() }}
        >
          放回（Esc）
        </button>
      </div>
    </div>
  )
}
