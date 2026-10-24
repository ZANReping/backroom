// 前厅：卧室电脑上的本地社区论坛（虚构品牌「边界线 / borderline」，版块 b/、用户 u/）。
// 版式：顶栏（标志 + 搜索 + 头像）/ 左侧导航 / 版块横幅与图标 / 帖子卡片（左侧投票列、版块·发帖人·时间、标题、正文/配图、评论/分享/保存）
// / 帖子详情嵌套评论树（缩进线可点击折叠、投票）/ 右侧版块简介与版规 / 深浅色两套配色。
// 名称、标志、图标均为自绘，不使用真实网站的名称或标志；剧情内容见 content/foyerForum.ts。
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { audio } from '@/game/core/audio'
import { FORUM_BOARD, FORUM_POSTS, FORUM_SIDEBAR_BOARDS, FORUM_SITE, type ForumComment, type ForumPost } from '@/game/content/foyerForum'

type Theme = { bg: string; card: string; cardHover: string; border: string; text: string; meta: string; soft: string; input: string; up: string; down: string; accent: string; link: string; chip: string; thread: string; bar: string }
const DARK: Theme = { bg: '#0b0c0d', card: '#16181a', cardHover: '#1d2023', border: '#2f3336', text: '#d9dcde', meta: '#8a8f94', soft: '#202326', input: '#22262a', up: '#ff5a1f', down: '#7d8cff', accent: '#e8b93c', link: '#6fa8ff', chip: '#2a2e32', thread: '#3a3f44', bar: '#121416' }
const LIGHT: Theme = { bg: '#dce1e5', card: '#ffffff', cardHover: '#f7f8f9', border: '#cdd2d6', text: '#1b1d1f', meta: '#6e7378', soft: '#f1f3f4', input: '#eef1f3', up: '#ff5a1f', down: '#5b6cff', accent: '#c9921c', link: '#0b6bd3', chip: '#e9ecee', thread: '#d3d7da', bar: '#ffffff' }
const FONT = '-apple-system,"Segoe UI","Noto Sans","PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif'

// ---------------------------------------------------------------- 自绘图标（线性 SVG）
const I = ({ d, size = 18, fill = false, sw = 1.7, style }: { d: string; size?: number; fill?: boolean; sw?: number; style?: CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block', ...style }} fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
)
const IC = {
  up: 'M12 4 4.5 12.5H9V20h6v-7.5h4.5z',
  down: 'M12 20l7.5-8.5H15V4H9v7.5H4.5z',
  comment: 'M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h-.5A1 1 0 0 1 4 15z',
  share: 'M14 5l6 6-6 6M20 11H10a6 6 0 0 0-6 6v1',
  save: 'M7 3.5h10a1 1 0 0 1 1 1V21l-6-4-6 4V4.5a1 1 0 0 1 1-1z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM20 20l-4.8-4.8',
  bell: 'M18 16.5H6l1.4-1.8V10a4.6 4.6 0 0 1 9.2 0v4.7zM10 19.5a2 2 0 0 0 4 0',
  plus: 'M12 5v14M5 12h14',
  home: 'M4 11 12 4l8 7v8.5a.5.5 0 0 1-.5.5H15v-5.5H9V20H4.5a.5.5 0 0 1-.5-.5z',
  trend: 'M3 17l6-6 4 4 7-7M15 8h5v5',
  all: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  back: 'M15 5l-7 7 7 7',
  pin: 'M14 3l7 7-3 1-4 4 .5 4.5L13 21l-4-4-5 5M9 17l-2-2 4-4 1-3z',
  shield: 'M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z',
  chev: 'M6 9l6 6 6-6',
  close: 'M6 6l12 12M18 6 6 18',
  hot: 'M12 21c4 0 6.5-2.8 6.5-6.5 0-3-2-5.6-3.5-7-.3 1.8-1.2 3-2.3 3.5.4-3-1-6.3-3.7-8 .3 3-1.5 5-3 6.8A7.6 7.6 0 0 0 5.5 14.5C5.5 18.2 8 21 12 21z',
  newest: 'M12 3l2.2 5.5L20 9l-4.5 3.8L17 19l-5-3.2L7 19l1.5-6.2L4 9l5.8-.5z',
  top: 'M5 20V10M12 20V4M19 20v-7',
}

/** 站点标志：自绘「边界线」——圆角方块里一道竖向细缝（半开的门缝）与一条地平线。 */
function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: 'block' }}>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#e8b93c" />
      <rect x="9" y="7" width="14" height="17" rx="1.5" fill="#1d1a14" />
      <rect x="15" y="7" width="2.2" height="17" fill="#f6e3a8" />
      <rect x="5" y="24" width="22" height="2.4" rx="1.2" fill="#1d1a14" />
    </svg>
  )
}
/** 版块图标：黄色走廊透视（自绘）。 */
function BoardIcon({ size = 64, ring }: { size?: number; ring: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: 'block', borderRadius: '50%', boxShadow: `0 0 0 4px ${ring}` }}>
      <circle cx="32" cy="32" r="32" fill="#cdb45a" />
      <path d="M0 0h64L44 22H20z" fill="#e9dc9a" />
      <path d="M0 64h64L44 42H20z" fill="#9a8a3e" />
      <path d="M0 0l20 22v20L0 64z" fill="#b8a14c" />
      <path d="M64 0 44 22v20l20 22z" fill="#b8a14c" />
      <rect x="20" y="22" width="24" height="20" fill="#2a2617" />
      <rect x="27" y="10" width="10" height="3" rx="1" fill="#fffbe0" />
      <rect x="30.5" y="27" width="3" height="15" fill="#f2df8a" />
    </svg>
  )
}
/** 用户头像：按用户名哈希出底色 + 首字。 */
function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const bg = ['#c9822b', '#4a7fb5', '#58a66b', '#9a7ad0', '#b8454a', '#3b7a57', '#6c5bb5', '#a0763a'][h % 8]
  return <span style={{ width: size, height: size, borderRadius: '50%', background: bg, color: '#fff', fontSize: size * 0.46, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{(name || '?').replace(/^u\//, '').slice(0, 1).toUpperCase()}</span>
}

// ---------------------------------------------------------------- 程序化配图（不加载外部图片）
function PostImage({ kind, t }: { kind: NonNullable<ForumPost['image']>; t: Theme }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const g = c.getContext('2d')!; const W = c.width, H = c.height
    let s = kind.length * 977
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
    if (kind === 'cctv') { // 四分格监控：泛黄雪花 + 时间戳
      for (let q = 0; q < 4; q++) {
        const ox = (q % 2) * W / 2, oy = Math.floor(q / 2) * H / 2
        const img = g.createImageData(W / 2 - 4, H / 2 - 4)
        for (let i = 0; i < img.data.length; i += 4) { const v = 90 + rnd() * 150; img.data[i] = v; img.data[i + 1] = v * 0.92; img.data[i + 2] = v * 0.45; img.data[i + 3] = 255 }
        g.putImageData(img, ox + 2, oy + 2)
        g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(ox + 8, oy + 8, 150, 22)
        g.fillStyle = '#f2f2f2'; g.font = 'bold 15px monospace'; g.fillText(`CAM0${q + 1}  23:58:0${q}`, ox + 14, oy + 25)
      }
      g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(W - 22, 20, 7, 0, 7); g.fill()
    } else if (kind === 'poster') { // 墙上的寻人启事（照片泡白）
      g.fillStyle = '#5d6166'; g.fillRect(0, 0, W, H)
      for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`; g.fillRect(rnd() * W, rnd() * H, 3, 3) }
      g.save(); g.translate(W / 2, H / 2); g.rotate(-0.03)
      g.fillStyle = '#efe9da'; g.fillRect(-150, -170, 300, 340)
      g.fillStyle = '#111'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.fillText('寻人启事', 0, -120)
      g.font = 'bold 18px sans-serif'; g.fillText('MISSING', 0, -94)
      g.fillStyle = '#d9d6cc'; g.fillRect(-80, -80, 160, 150)
      g.fillStyle = '#c4c0b4'; g.beginPath(); g.ellipse(0, -20, 40, 48, 0, 0, 7); g.fill(); g.fillRect(-60, 30, 120, 40)
      g.fillStyle = '#333'; g.font = '14px sans-serif'
      g.fillText('10 月 14 日晚 23 点后失联', 0, 100); g.fillText('最后定位：旧仓路一带', 0, 122); g.fillText('如有线索请联系家属', 0, 144)
      g.restore()
    } else { // 后巷：夜色、湿地面、墙角那块颜色不对的地方
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0d1016'); gr.addColorStop(1, '#1c1a16'); g.fillStyle = gr; g.fillRect(0, 0, W, H)
      g.fillStyle = '#3a2d26'; g.beginPath(); g.moveTo(0, 0); g.lineTo(W * 0.38, H * 0.3); g.lineTo(W * 0.38, H * 0.78); g.lineTo(0, H); g.fill()
      g.fillStyle = '#33281f'; g.beginPath(); g.moveTo(W, 0); g.lineTo(W * 0.62, H * 0.3); g.lineTo(W * 0.62, H * 0.78); g.lineTo(W, H); g.fill()
      for (let y = 0; y < H; y += 9) for (let x = 0; x < W; x += 22) { g.fillStyle = `rgba(0,0,0,${0.15 + rnd() * 0.1})`; if (x < W * 0.38 || x > W * 0.62) g.fillRect(x + (y / 9 % 2) * 11, y, 20, 1) }
      g.fillStyle = '#1a1d22'; g.fillRect(W * 0.38, H * 0.3, W * 0.24, H * 0.48)
      g.fillStyle = 'rgba(232,206,110,0.55)'; g.fillRect(W * 0.3, H * 0.5, 22, 60) // 颜色不对的墙角
      const lg = g.createRadialGradient(W * 0.5, H * 0.2, 4, W * 0.5, H * 0.2, 180); lg.addColorStop(0, 'rgba(255,214,140,0.5)'); lg.addColorStop(1, 'rgba(255,214,140,0)'); g.fillStyle = lg; g.fillRect(0, 0, W, H)
      g.fillStyle = 'rgba(140,150,170,0.18)'; g.beginPath(); g.ellipse(W * 0.5, H * 0.9, W * 0.3, 14, 0, 0, 7); g.fill()
    }
  }, [kind])
  return <canvas ref={ref} width={640} height={kind === 'poster' ? 420 : 360} style={{ width: '100%', maxHeight: 360, objectFit: 'contain', background: '#000', borderRadius: 8, border: `1px solid ${t.border}`, display: 'block' }} />
}

// ---------------------------------------------------------------- 组件
const fmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n))

function Votes({ base, t, vertical = true, small = false }: { base: number; t: Theme; vertical?: boolean; small?: boolean }) {
  const [v, setV] = useState<0 | 1 | -1>(0)
  const col = v === 1 ? t.up : v === -1 ? t.down : t.text
  const btn = (dir: 1 | -1) => (
    <button aria-label={dir === 1 ? '赞同' : '反对'} data-vote={dir} onClick={(e) => { e.stopPropagation(); audio.uiTick(); setV(v === dir ? 0 : dir) }} style={{ color: v === dir ? (dir === 1 ? t.up : t.down) : t.meta, padding: 2, borderRadius: 4, lineHeight: 0 }}>
      <I d={dir === 1 ? IC.up : IC.down} size={small ? 16 : 20} fill={v === dir} sw={1.6} />
    </button>
  )
  return (
    <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center', gap: vertical ? 0 : 4 }}>
      {btn(1)}
      <span style={{ fontSize: small ? 12 : 13, fontWeight: 700, color: col, minWidth: vertical ? 32 : 0, textAlign: 'center' }}>{fmt(base + v)}</span>
      {btn(-1)}
    </div>
  )
}

function ActionBtn({ icon, label, t, onClick }: { icon: string; label: string; t: Theme; onClick?: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); audio.uiTick(); onClick?.() }} style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.meta, fontSize: 12, fontWeight: 700, padding: '6px 8px', borderRadius: 4 }} className="forum-act">
      <I d={icon} size={18} /> {label}
    </button>
  )
}

function Flair({ f }: { f?: ForumPost['flair'] }) {
  if (!f) return null
  return <span style={{ background: f.color, color: '#fff', fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 10, marginRight: 6, verticalAlign: 2 }}>{f.text}</span>
}

function PostMeta({ p, t, big }: { p: ForumPost; t: Theme; big?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.meta, flexWrap: 'wrap' }}>
      {big && <BoardIcon size={22} ring="transparent" />}
      <span style={{ color: t.text, fontWeight: 700 }}>{p.board}</span>
      <span>·</span>
      <span>由 <span style={{ color: p.mod ? '#3fa96b' : t.meta }}>u/{p.user}</span>{p.mod && <I d={IC.shield} size={12} style={{ display: 'inline', marginLeft: 3, color: '#3fa96b', verticalAlign: -1 }} />} 发布</span>
      <span>·</span>
      <span>{p.time}</span>
      {p.pinned && <span style={{ color: '#3fa96b', display: 'flex', alignItems: 'center', gap: 3, marginLeft: 4 }}><I d={IC.pin} size={13} /> 置顶</span>}
    </div>
  )
}

function PostCard({ p, t, onOpen }: { p: ForumPost; t: Theme; onOpen: () => void }) {
  const [hover, setHover] = useState(false)
  const [saved, setSaved] = useState(false)
  return (
    <article role="link" tabIndex={0} aria-label={p.title} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen() } }} data-post={p.id} onClick={() => { audio.uiTick(); onOpen() }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', background: t.card, border: `1px solid ${hover ? t.meta : t.border}`, borderRadius: 6, marginBottom: 10, cursor: 'pointer', overflow: 'hidden' }}>
      <div style={{ width: 44, flex: 'none', background: t.soft, padding: '8px 0', display: 'flex', justifyContent: 'center' }}><Votes base={p.score} t={t} /></div>
      <div style={{ flex: 1, minWidth: 0, padding: '8px 10px 2px' }}>
        <PostMeta p={p} t={t} />
        <h3 style={{ margin: '6px 0 6px', fontSize: 18, fontWeight: 600, lineHeight: 1.32, color: t.text }}><Flair f={p.flair} />{p.title}</h3>
        {p.image ? <div style={{ margin: '4px 0 6px' }}><PostImage kind={p.image} t={t} /></div>
          : <p style={{ margin: '0 0 4px', fontSize: 14, lineHeight: 1.55, color: t.text, maxHeight: 66, overflow: 'hidden', maskImage: 'linear-gradient(#000 60%, transparent)', WebkitMaskImage: 'linear-gradient(#000 60%, transparent)' }}>{p.body.join(' ')}</p>}
        <div style={{ display: 'flex', gap: 2, marginLeft: -6 }}>
          <ActionBtn icon={IC.comment} label={`${fmt(p.comments)} 条评论`} t={t} onClick={onOpen} />
          <ActionBtn icon={IC.share} label="分享" t={t} />
          <ActionBtn icon={IC.save} label={saved ? '已保存' : '保存'} t={t} onClick={() => setSaved(!saved)} />
          <ActionBtn icon={IC.more} label="" t={t} />
        </div>
      </div>
    </article>
  )
}

/** 嵌套评论：左侧缩进线（点击折叠）+ 头像/用户名/时间 + 正文 + 投票/回复。 */
function Comment({ c, t, depth }: { c: ForumComment; t: Theme; depth: number }) {
  const [open, setOpen] = useState(!c.collapsed)
  const [hl, setHl] = useState(false)
  const count = (x: ForumComment): number => 1 + (x.replies ?? []).reduce((a, r) => a + count(r), 0)
  return (
    <div data-comment={c.id} data-depth={depth} style={{ display: 'flex', marginTop: 10 }}>
      <div style={{ width: 26, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {c.deleted ? <span style={{ width: 24, height: 24, borderRadius: '50%', background: t.chip, flex: 'none' }} /> : <Avatar name={c.user} />}
        {open && <button aria-label="折叠" data-thread={c.id} onClick={() => { audio.uiTick(); setOpen(false) }} onMouseEnter={() => setHl(true)} onMouseLeave={() => setHl(false)}
          style={{ flex: 1, width: 14, marginTop: 4, display: 'flex', justifyContent: 'center', cursor: 'pointer' }}>
          <span style={{ width: 2, height: '100%', background: hl ? t.link : t.thread, borderRadius: 1 }} />
        </button>}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingLeft: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.meta, minHeight: 24 }}>
          {!open && <button data-expand={c.id} onClick={() => { audio.uiTick(); setOpen(true) }} style={{ color: t.link, fontWeight: 700, fontSize: 12 }}>[+]</button>}
          <span style={{ color: c.deleted ? t.meta : t.text, fontWeight: 700 }}>{c.deleted ? '[已删除]' : c.user}</span>
          {c.op && <span style={{ color: t.link, fontWeight: 700 }}>楼主</span>}
          {c.mod && <span style={{ color: '#3fa96b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}><I d={IC.shield} size={12} />版主</span>}
          <span>·</span><span>{c.time}</span>
          {!open && <span style={{ fontStyle: 'italic' }}>（已折叠 {count(c)} 条）</span>}
        </div>
        {open && <>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: c.deleted ? t.meta : t.text, marginTop: 2 }}>
            {c.body.map((b, i) => <p key={i} style={{ margin: '0 0 6px' }}>{b}</p>)}
          </div>
          {!c.deleted && <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: -4 }}>
            <Votes base={c.score} t={t} vertical={false} small />
            <ActionBtn icon={IC.comment} label="回复" t={t} />
            <ActionBtn icon={IC.share} label="分享" t={t} />
            <ActionBtn icon={IC.more} label="" t={t} />
          </div>}
          {(c.replies ?? []).map((r) => <Comment key={r.id} c={r} t={t} depth={depth + 1} />)}
        </>}
      </div>
    </div>
  )
}

function SideCard({ t, title, children, banner }: { t: Theme; title?: string; children: ReactNode; banner?: boolean }) {
  return (
    <section style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
      {banner && <div style={{ height: 34, background: 'linear-gradient(90deg,#8a7428,#cdb45a)' }} />}
      {title && <h4 style={{ margin: 0, padding: '10px 12px 4px', fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: t.meta }}>{title}</h4>}
      <div style={{ padding: '6px 12px 12px' }}>{children}</div>
    </section>
  )
}

function Rules({ t }: { t: Theme }) {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <SideCard t={t} title={`${FORUM_BOARD.name} 版规`}>
      {FORUM_BOARD.rules.map((r, i) => (
        <div key={i} style={{ borderBottom: i < FORUM_BOARD.rules.length - 1 ? `1px solid ${t.border}` : 'none' }}>
          <button data-rule={i} onClick={() => { audio.uiTick(); setOpen(open === i ? null : i) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', color: t.text, fontSize: 13, textAlign: 'left' }}>
            <span style={{ color: t.meta, width: 14 }}>{i + 1}</span><span style={{ flex: 1, fontWeight: 600 }}>{r.t}</span>
            <I d={IC.chev} size={16} style={{ transform: open === i ? 'rotate(180deg)' : 'none', color: t.meta }} />
          </button>
          {open === i && <p style={{ margin: '0 0 8px 22px', fontSize: 12.5, lineHeight: 1.55, color: t.meta }}>{r.d}</p>}
        </div>
      ))}
    </SideCard>
  )
}

export default function ForumPage({ url, onClose }: { url?: string; onClose: () => void }) {
  const [dark, setDark] = useState(true)
  const [postId, setPostId] = useState<string | null>(null)
  const [sort, setSort] = useState('hot')
  const scroller = useRef<HTMLDivElement>(null)
  const t = dark ? DARK : LIGHT
  const post = FORUM_POSTS.find((p) => p.id === postId) ?? null
  const open = (id: string | null) => { setPostId(id); scroller.current?.scrollTo({ top: 0 }) }
  const addr = post ? `${FORUM_SITE.host}/b/legends/t/${post.id === 'p1' ? '41907' : post.id}` : (url ?? `${FORUM_SITE.host}/b/legends`)
  const navItem = (icon: string, label: string, active = false) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderRadius: 8, background: active ? t.soft : 'transparent', color: t.text, fontSize: 14 }}><I d={icon} size={19} />{label}</div>
  )
  return (
    <div data-forum={post ? 'post' : 'home'} data-theme={dark ? 'dark' : 'light'} className="anim-slideUp relative flex h-[90dvh] w-full max-w-[1180px] flex-col overflow-hidden rounded-md"
      style={{ background: t.bg, border: '1px solid #3a3d44', boxShadow: '0 14px 46px rgba(0,0,0,0.8), 0 0 0 6px #17191d', fontFamily: FONT }}
      onClick={(e) => e.stopPropagation()}>
      {/* 浏览器外框（虚构域名） */}
      <div className="flex shrink-0 items-center gap-2 px-3 py-[6px]" style={{ background: '#2a2d33' }}>
        <span className="inline-block h-[10px] w-[10px] rounded-full" style={{ background: '#e0605a' }} />
        <span className="inline-block h-[10px] w-[10px] rounded-full" style={{ background: '#e6b84f' }} />
        <span className="inline-block h-[10px] w-[10px] rounded-full" style={{ background: '#5fb66b' }} />
        <div className="ml-2 flex-1 truncate rounded px-3 py-[3px] font-mono2 text-[12px]" style={{ background: '#1b1d21', color: '#aab0ba' }}>🔒 {addr}</div>
        <button onClick={() => { audio.uiTick(); onClose() }} onTouchStart={() => { audio.uiTick(); onClose() }} className="font-mono2 px-3 py-[2px] text-[12px]" style={{ color: '#c8ccd3', border: '1px solid #4a4f57', borderRadius: 4 }}>离开屏幕（Esc）</button>
      </div>
      {/* 顶栏 */}
      <header style={{ height: 50, flex: 'none', display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px', background: t.bar, borderBottom: `1px solid ${t.border}` }}>
        <button onClick={() => open(null)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Logo />
          <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, color: t.text }}>{FORUM_SITE.name}</span>
        </button>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 560, height: 38, borderRadius: 19, background: t.input, border: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', color: t.meta }}>
            <I d={IC.search} size={18} />
            <span style={{ background: t.chip, color: t.text, fontSize: 12, padding: '2px 8px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 4 }}><BoardIcon size={14} ring="transparent" />{FORUM_BOARD.name}</span>
            <span style={{ fontSize: 14 }}>搜索本版</span>
          </div>
        </div>
        <button aria-label="切换深浅色" title="切换深浅色" data-theme-toggle onClick={() => { audio.uiTick(); setDark(!dark) }} style={{ color: t.text, padding: 6, borderRadius: 18 }}><I d={dark ? IC.sun : IC.moon} size={20} /></button>
        <div style={{ color: t.text, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}><I d={IC.plus} size={20} /> 发帖</div>
        <div style={{ color: t.text, position: 'relative' }}><I d={IC.bell} size={21} /><span style={{ position: 'absolute', top: -4, right: -6, background: t.up, color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 8, padding: '0 4px' }}>3</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', borderRadius: 6, border: `1px solid ${t.border}` }}>
          <span style={{ position: 'relative' }}><Avatar name="me" size={28} /><span style={{ position: 'absolute', right: -1, bottom: -1, width: 9, height: 9, borderRadius: '50%', background: '#3fa96b', border: `2px solid ${t.bar}` }} /></span>
          <span style={{ fontSize: 12, color: t.text, lineHeight: 1.2 }}>u/夜猫子_2340<br /><span style={{ color: t.meta }}>412 积分</span></span>
          <I d={IC.chev} size={16} style={{ color: t.meta }} />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        {/* 左侧栏 */}
        <nav style={{ width: 236, flex: 'none', borderRight: `1px solid ${t.border}`, background: t.bar, padding: '12px 10px', overflowY: 'auto' }} className="no-scrollbar">
          {navItem(IC.home, '首页')}{navItem(IC.trend, '热门')}{navItem(IC.all, '全部')}
          <div style={{ height: 1, background: t.border, margin: '10px 6px' }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: t.meta, letterSpacing: 0.8, padding: '4px 14px 6px' }}>我加入的版块</div>
          {FORUM_SIDEBAR_BOARDS.map((b) => (
            <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', borderRadius: 8, background: b.active ? t.soft : 'transparent', color: t.text, fontSize: 14 }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: b.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#1b1b1b', fontWeight: 800, fontSize: 11 }}>b/</span>{b.name}
            </div>
          ))}
          <div style={{ height: 1, background: t.border, margin: '10px 6px' }} />
          <div style={{ fontSize: 11, color: t.meta, padding: '4px 14px', lineHeight: 1.7 }}>关于 · 帮助 · 用户协议<br />隐私政策 · 内容政策<br />{FORUM_SITE.zh} © 2026</div>
        </nav>
        {/* 主区 */}
        <div ref={scroller} className="min-w-0 flex-1 overflow-y-auto" style={{ color: t.text }}>
          {!post && <>
            {/* 版块横幅 + 图标 */}
            <div style={{ height: 96, background: 'linear-gradient(120deg,#5c4d1e 0%,#a68f3c 45%,#d9c46e 100%)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.08) 0 2px, transparent 2px 28px), repeating-linear-gradient(0deg, rgba(0,0,0,0.06) 0 1px, transparent 1px 14px)' }} />
              <div style={{ position: 'absolute', right: 40, top: 18, width: 120, height: 6, borderRadius: 3, background: 'rgba(255,252,220,0.85)', boxShadow: '0 0 18px rgba(255,248,200,0.9)' }} />
            </div>
            <div style={{ background: t.bar, borderBottom: `1px solid ${t.border}`, padding: '0 24px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: -26 }}>
                <BoardIcon size={78} ring={t.bar} />
                <div style={{ flex: 1, paddingBottom: 4 }}>
                  <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: t.text }}>{FORUM_BOARD.name}</h1>
                  <div style={{ fontSize: 13, color: t.meta }}>{FORUM_BOARD.title}</div>
                </div>
                <button style={{ height: 34, padding: '0 18px', borderRadius: 17, border: `1px solid ${t.text}`, color: t.text, fontWeight: 700, fontSize: 14 }}>已加入</button>
              </div>
            </div>
          </>}
          <div style={{ display: 'flex', gap: 18, padding: '14px 20px', alignItems: 'flex-start' }}>
            <main style={{ flex: 1, minWidth: 0 }}>
              {!post ? <>
                {/* 发帖框 + 排序 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: t.card, border: `1px solid ${t.border}`, borderRadius: 6, padding: 8, marginBottom: 10 }}>
                  <Avatar name="me" size={32} />
                  <div style={{ flex: 1, height: 36, borderRadius: 4, background: t.input, border: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', padding: '0 12px', color: t.meta, fontSize: 14 }}>发布新帖</div>
                </div>
                <div style={{ display: 'flex', gap: 6, background: t.card, border: `1px solid ${t.border}`, borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
                  {[['best', '最佳', IC.newest], ['hot', '热门', IC.hot], ['new', '最新', IC.newest], ['top', '最高', IC.top]].map(([k, l, ic]) => (
                    <button key={k} onClick={() => { audio.uiTick(); setSort(k) }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 18, fontSize: 14, fontWeight: 700, color: sort === k ? t.text : t.meta, background: sort === k ? t.soft : 'transparent' }}><I d={ic} size={18} />{l}</button>
                  ))}
                </div>
                {FORUM_POSTS.map((p) => <PostCard key={p.id} p={p} t={t} onOpen={() => open(p.id)} />)}
              </> : <>
                {/* 帖子详情 */}
                <button data-back onClick={() => { audio.uiTick(); open(null) }} style={{ display: 'flex', alignItems: 'center', gap: 4, color: t.meta, fontSize: 13, fontWeight: 700, marginBottom: 8 }}><I d={IC.back} size={18} />返回 {FORUM_BOARD.name}</button>
                <article style={{ display: 'flex', background: t.card, border: `1px solid ${t.border}`, borderRadius: 6 }}>
                  <div style={{ width: 44, flex: 'none', padding: '10px 0', display: 'flex', justifyContent: 'center' }}><Votes base={post.score} t={t} /></div>
                  <div style={{ flex: 1, minWidth: 0, padding: '10px 14px 4px 4px' }}>
                    <PostMeta p={post} t={t} big />
                    <h2 style={{ margin: '8px 0 10px', fontSize: 22, fontWeight: 700, lineHeight: 1.3 }}><Flair f={post.flair} />{post.title}</h2>
                    {post.body.map((b, i) => <p key={i} style={{ margin: '0 0 10px', fontSize: 15, lineHeight: 1.7 }}>{b}</p>)}
                    {post.image && <div style={{ margin: '4px 0 10px' }}><PostImage kind={post.image} t={t} /></div>}
                    <div style={{ display: 'flex', gap: 2, marginLeft: -6 }}>
                      <ActionBtn icon={IC.comment} label={`${fmt(post.comments)} 条评论`} t={t} />
                      <ActionBtn icon={IC.share} label="分享" t={t} />
                      <ActionBtn icon={IC.save} label="保存" t={t} />
                      <ActionBtn icon={IC.more} label="" t={t} />
                    </div>
                    <div style={{ margin: '10px 0 6px', fontSize: 12, color: t.meta }}>以 <span style={{ color: t.link }}>u/夜猫子_2340</span> 的身份评论</div>
                    <div style={{ border: `1px solid ${t.border}`, borderRadius: 6, background: t.input, minHeight: 74, padding: '10px 12px', color: t.meta, fontSize: 14 }}>说点什么……</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 2px', fontSize: 12, color: t.meta, fontWeight: 700 }}>排序方式：<span style={{ color: t.link }}>最佳 ▾</span><span style={{ flex: 1, height: 1, background: t.border }} /></div>
                    <div style={{ paddingBottom: 12 }}>{(post.thread ?? []).map((c) => <Comment key={c.id} c={c} t={t} depth={0} />)}</div>
                  </div>
                </article>
              </>}
            </main>
            {/* 右侧栏 */}
            <aside style={{ width: 300, flex: 'none' }}>
              <SideCard t={t} banner>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: -2 }}><BoardIcon size={40} ring={t.card} /><b style={{ fontSize: 15 }}>{FORUM_BOARD.name}</b></div>
                <p style={{ fontSize: 13.5, lineHeight: 1.55, margin: '10px 0' }}>{FORUM_BOARD.about}</p>
                <div style={{ display: 'flex', gap: 24, padding: '8px 0', borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}` }}>
                  <div><b style={{ fontSize: 16 }}>{FORUM_BOARD.members}</b><div style={{ fontSize: 12, color: t.meta }}>成员</div></div>
                  <div><b style={{ fontSize: 16 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: '#3fa96b', marginRight: 5 }} />{FORUM_BOARD.online}</b><div style={{ fontSize: 12, color: t.meta }}>在线</div></div>
                </div>
                <div style={{ fontSize: 12.5, color: t.meta, margin: '8px 0 10px' }}>创建于 {FORUM_BOARD.created}</div>
                <div style={{ height: 34, borderRadius: 17, background: t.accent, color: '#1b1b1b', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>发布新帖</div>
              </SideCard>
              <Rules t={t} />
              <SideCard t={t} title="版主">
                {FORUM_BOARD.mods.map((m) => <div key={m} style={{ fontSize: 13, color: t.link, padding: '3px 0', display: 'flex', alignItems: 'center', gap: 6 }}><Avatar name={m} size={20} />{m}</div>)}
              </SideCard>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
