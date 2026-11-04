// L5 恐怖旅馆：住客登记簿（图鉴「团体」里的特殊卡片翻开后的面板）。1920 年代克苏鲁风：泛黄羊皮纸、装饰艺术金线框、
// 触手卷纹角花、红色「已核实」/黑色「伪造」墨章、火漆印（徽记 = 章鱼头侧影）。五个书脊页签：
// 登记卡 / 员工名录 / 住客须知 / 楼层图录 / 契约与失物。设计见 /workspace/work/l5-expand/hotel-panel.md。
// 数据：engine.hotel（局内）+ engine.hotelBook（跨局，死亡不清空）。关注度不显示数字，只有黄铜表盘的档位与抖动指针。
// 理智 < 40：个别字被替换成「他在看」之类的乱码，指上去才恢复。
import { useState, type ReactNode } from 'react'
import type { Engine } from '@/game/engine'
import { HOTEL_TIER_NAMES, l5Tier, hotelPencil, hotelShiftHint, LOST_FEE } from '@/game/engine/l5Hotel'
import { L5_RULES, L5_RULE, type L5RuleId } from '@/game/content/l5Rules'
import { L5_STAFF, L5_RELATION, relationTier } from '@/game/content/l5Staff'
import { L5_FLOORS, L5_VARIANT_NAMES } from '@/game/world/infiniteL5'
import { ITEMS } from '@/game/content/items'
import { audio } from '@/game/core/audio'
import StaffAvatar from './StaffAvatar'
import { TERROR_HOTEL_FACTION, TERROR_HOTEL_MARK } from '@/game/content/factionTerritory'
import './HotelLedger.css'

const TABS = ['登记卡', '员工名录', '住客须知', '楼层图录', '契约与失物'] as const
type Tab = typeof TABS[number]
const base = () => (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/')
const SEAL = () => `${base()}${TERROR_HOTEL_MARK}`
const FLOOR_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 0]
/** 违反后果批注（已核实为真的守则旁边） */
const CONSEQ: Partial<Record<L5RuleId, string>> = {
  run: '跑起来，铃声就会跟过来。', music: '换班时待在房里，脚步声会绕开你。', gaze: '盯久了，画里的人会记住你。', f13: '13 楼的门后没有灯。',
  dnd: '打扰一次，整栋楼都知道。', boiler: '热气会把人慢慢煮干。', flicker: '那扇门后有人在等。', lost: '奥蒂斯那里，一瓶杏仁水。', desk13: '去了就回不来。',
}
const DISCOVER: { key: string; name: string }[] = [
  { key: 'beverly', name: '贝弗莉室' }, { key: 'boilerroom', name: '锅炉房' }, { key: 'mothnest', name: '死亡飞蛾巢穴' }, { key: 'maintenance', name: '维修大厅' },
  { key: 'pool', name: '游泳池' }, { key: 'dining', name: '餐厅' }, { key: 'flicker', name: '灯光同时闪烁的木门' }, { key: 'office', name: '一间办公室' },
]
// 低理智乱码：按字串种子替换少量字符，指上去恢复
function Ink({ t, mad }: { t: string; mad: boolean }) {
  const [peek, setPeek] = useState(false)
  if (!mad || peek) return <>{t}</>
  let h = 7
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const chars = [...t]
  const out = chars.map((c, i) => (((h >> (i % 24)) ^ i * 2654435761) >>> 0) % 9 === 0 && c.trim() ? '▓' : c).join('')
  const shown = h % 5 === 0 && t.length > 6 ? out.slice(0, Math.floor(out.length / 2)) + '他在看' + out.slice(Math.floor(out.length / 2) + 3) : out
  return <span className="hl-mad" onMouseEnter={() => setPeek(true)} onTouchStart={() => setPeek(true)}>{shown}</span>
}

export function HotelLedgerCard({ engine, onOpen }: { engine: Engine; onOpen: () => void }) {
  const book = engine.hotelBook
  const unlocked = !!book.firstEntry
  const tier = l5Tier(engine.hotel.attn)
  return (
    <div className={`hl-card ${unlocked ? '' : 'burnt'}`} data-faction-card={TERROR_HOTEL_FACTION}>
      <img className="hl-card-mark" src={SEAL()} alt="" draggable={false} />
      <div className="hl-card-row">
        <span className="hl-card-name">恐怖旅馆</span>
        <span className="hl-card-en">THE TERROR HOTEL</span>
        <span className="hl-card-tier">{unlocked ? HOTEL_TIER_NAMES[tier] : '—'}</span>
      </div>
      {unlocked ? (
        <>
          <p className="hl-card-desc">Level 5 的酒店自己就是一个团体。没有声望，只有「先生」的目光。住进来的人都会被登记在册。</p>
          <button className="hl-card-btn" onClick={() => { audio.uiTick(); onOpen() }}>翻开登记簿</button>
        </>
      ) : <p className="hl-card-desc">一张边缘烧焦的空白卡片。上面什么也没写。</p>}
    </div>
  )
}

export default function HotelLedger({ engine, readOnly }: { engine: Engine; readOnly?: boolean }) {
  const [tab, setTab] = useState<Tab>('登记卡')
  const [, setTick] = useState(0)
  const h = engine.hotel, book = engine.hotelBook
  const tier = l5Tier(h.attn)
  const mad = engine.player.sanity < 40 && !readOnly
  const flip = (t: Tab) => { if (t !== tab) { audio.uiTick(); setTab(t) } }
  const I = (t: string) => <Ink t={t} mad={mad} />
  let page: ReactNode
  if (tab === '登记卡') {
    const ang = -90 + Math.min(100, h.attn) * 1.8
    const first = book.firstEntry ? new Date(book.firstEntry) : null
    const room = h.pocket ? '—' : '—'
    page = (
      <div className="hl-reg">
        <div className="hl-reg-left">
          <div className="hl-field"><span>住客姓名</span><b>{readOnly ? '—' : engine.profile?.name || '（未署名）'}</b></div>
          <div className="hl-field"><span>首次入住</span><b>{first ? `${first.getFullYear()} 年 ${first.getMonth() + 1} 月 ${first.getDate()} 日` : '—'}</b></div>
          <div className="hl-field"><span>房号</span><b>{room}</b></div>
          <div className="hl-field"><span>本次停留</span><b>{Math.floor(h.stay / 60)} 分 {Math.floor(h.stay % 60)} 秒</b></div>
          <div className="hl-field"><span>被注视</span><b>{book.gazes} 次</b></div>
          <div className="hl-floors-title">到访楼层</div>
          <div className="hl-floors">
            {FLOOR_ORDER.map((f) => f === 13
              ? <span key={f} className="hl-badge struck" title="13 楼为员工专用">13</span>
              : <span key={f} className={`hl-badge ${book.floors.includes(f) ? 'on' : ''} ${h.floor === f && engine.levelDef.id === 5 ? 'here' : ''}`}>{L5_FLOORS[f]?.name}</span>)}
          </div>
        </div>
        <div className="hl-reg-right">
          <div className="hl-dial-title">{I('先生的目光')}</div>
          <svg className="hl-dial" viewBox="0 0 200 120" aria-label={`当前档位：${HOTEL_TIER_NAMES[tier]}`}>
            <defs><radialGradient id="hlBrass" cx="50%" cy="80%" r="80%"><stop offset="0" stopColor="#f4d98a" /><stop offset="0.6" stopColor="#b98c3a" /><stop offset="1" stopColor="#5a3e18" /></radialGradient></defs>
            <path d="M10,110 A90,90 0 0 1 190,110 Z" fill="url(#hlBrass)" stroke="#3a2610" strokeWidth="3" />
            <path d="M24,110 A76,76 0 0 1 176,110" fill="none" stroke="#2a1a0a" strokeWidth="1.2" />
            {[0, 25, 50, 75, 100].map((v, i) => {
              const a = (-180 + v * 1.8) * Math.PI / 180
              return <g key={v}>
                <line x1={100 + Math.cos(a) * 66} y1={110 + Math.sin(a) * 66} x2={100 + Math.cos(a) * 78} y2={110 + Math.sin(a) * 78} stroke="#2a1a0a" strokeWidth="2" />
                <text x={100 + Math.cos(a) * 52} y={113 + Math.sin(a) * 52} textAnchor="middle" className={`hl-dial-lab ${i === tier ? 'cur' : ''}`}>{HOTEL_TIER_NAMES[i]}</text>
              </g>
            })}
            <g className={`hl-needle t${tier}`} style={{ transform: `rotate(${ang}deg)`, transformOrigin: '100px 110px' }}>
              <line x1="100" y1="110" x2="100" y2="40" stroke="#1a0e06" strokeWidth="3" strokeLinecap="round" />
              <circle cx="100" cy="110" r="7" fill="#3a2610" stroke="#f4d98a" strokeWidth="1.5" />
            </g>
          </svg>
          <div className="hl-dial-tier">{I(HOTEL_TIER_NAMES[tier])}</div>
          <div className="hl-dial-hint">{I(hotelShiftHint(engine))}</div>
        </div>
      </div>
    )
  } else if (tab === '员工名录') {
    page = (
      <div className="hl-staff">
        {L5_STAFF.map((s) => {
          const met = book.met.includes(s.id)
          const rel = relationTier(h.staff[s.id] ?? 0)
          return (
            <div key={s.id} className={`hl-staff-card ${met ? 'met' : ''}`}>
              {met ? <StaffAvatar type={s.id} met={met} />
                : <div className="hl-sil" aria-hidden="true" data-staff-avatar={s.id} data-state="locked">
                    {s.id === 'beast' && <img src={SEAL()} alt="" draggable={false} style={{ opacity: .9 }} />}
                  </div>}
              <div className="hl-staff-body">
                <div className="hl-staff-head"><b>{met ? s.name : '？？？'}</b><span>{s.no}</span></div>
                <div className="hl-staff-duty">{met ? I(s.duty) : I('尚未遇见。')}</div>
                {met && <div className="hl-staff-rel">关系：{L5_RELATION[rel]}</div>}
                {met && s.id === 'maid' && h.maid && <div className="hl-staff-rel">被警告 {h.maid.warn} 次 · 被打扫 {h.maid.clean} 次 · 领回失物 {h.maid.reclaim} 件{h.maid.cart.length ? ` · 车上还有 ${h.maid.cart.length} 件` : ''}</div>}
                {met && s.id === 'chef' && h.chef && <div className="hl-staff-rel">被他看见 {h.chef.n.mark} 次 · 敲桌 {h.chef.n.tap} 下 · 被拖进冷库 {h.chef.n.caught} 次（钥匙 / 撬棍脱身 {h.chef.n.escKey} · 扯断铁管 {h.chef.n.escYank}）· 吃过 {h.chef.n.meal} 份{h.chef.truth ? ' · 你知道那是什么' : ''}{h.chef.potStolen ? ' · 锅在你手里' : ''}{h.chef.n.stove ? ` · 关灶 ${h.chef.n.stove} 次` : ''}</div>} {/* [chef] */}
                {met && s.id === 'greeter' && h.spokes && <div className="hl-staff-rel">来访 {h.spokes.n.visit} 次 · 被邀请 {h.spokes.n.invite} 次（接受 {h.spokes.n.accept} · 婉拒 {h.spokes.n.decline}）· 发条兔 {h.spokes.n.rabbit} 只（抓住 {h.spokes.n.caught} · 砸开 {h.spokes.n.broken}）{h.spokes.n.report ? ` · 她汇报过你 ${h.spokes.n.report} 次` : ''}{h.spokes.freed ? ' · 她自由了' : h.spokes.photo ? ' · 她认出了照片' : ''}</div>} {/* [spokes] */}
                {met && s.id === 'beast' && h.beast && <div className="hl-staff-rel">来访 {h.beast.n.visit} 次 · 签约 {h.beast.n.deal} 份（履行 {h.beast.contracts.filter((c) => c.state === 'done').length} · 违约 {h.beast.contracts.filter((c) => c.state === 'breach').length}）· 婉拒 {h.beast.n.decline} 次 · 余光里 {h.beast.n.seen} 次{h.beast.strikes ? ` · 冒犯 ${h.beast.strikes} 次` : ''}{h.beast.harsh.length ? ` · 苛刻契约 ${h.beast.harsh.length} 份` : ''}{h.beast.sanCut ? ` · 理智上限 −${h.beast.sanCut}` : ''}</div>} {/* [beast] */}
                {met && s.id === 'bellhop' && h.bellhop && <div className="hl-staff-rel">寄存 {h.bellhop.n.deposit} 次 · 取回 {h.bellhop.n.claim} 次 · 请茶 {h.bellhop.n.tea} 杯 · 恼怒铃 {h.bellhop.n.annoyed} 声{h.bellhop.deposits.length ? ` · 他手里还有 ${h.bellhop.deposits.length} 件` : ''}{h.bellhop.room.length ? ` · 10F 行李房 ${h.bellhop.room.length} 件` : ''}{h.bellhop.loved ? ' · 情书已送达' : ''}</div>} {/* [bellhop] */}
                {met && s.id === 'concierge' && h.concierge && <div className="hl-staff-rel">被搭话 {h.concierge.talks} 次 · 跟他走 {h.concierge.follows} 次 · 被追 {h.concierge.chases} 次 · 13 楼 {h.concierge.lifts} 次{h.concierge.key437 ? ' · 437 钥匙已交还' : ''}</div>}
                {met && <ul>{s.habits.map((t, i) => <li key={i}>{I(t)}</li>)}</ul>}
                {s.stage && <div className="hl-staff-tag">演出</div>}
              </div>
            </div>
          )
        })}
      </div>
    )
  } else if (tab === '住客须知') {
    const got = L5_RULES.filter((r) => book.rules[r.id])
    page = got.length ? (
      <ol className="hl-rules">
        {got.map((r) => {
          const st = book.rules[r.id]
          const mark = book.marks[r.id]
          return (
            <li key={r.id} className="hl-rule">
              <div className="hl-rule-text">{I(r.text)}</div>
              <div className="hl-rule-src">{book.src[r.id] ?? '出处不明'}</div>
              {st === 'true' && <><span className="hl-stamp red">已核实</span><div className="hl-pen">{I(CONSEQ[r.id] ?? '')}</div></>}
              {st === 'false' && <span className="hl-stamp black">伪造</span>}
              {st === 'seen' && (
                <div className="hl-pencil">
                  {(['true', 'false'] as const).map((v) => (
                    <button key={v} disabled={readOnly} className={mark === v ? 'on' : ''} onClick={() => { hotelPencil(engine, r.id, v); setTick((n) => n + 1); audio.uiTick() }}>{v === 'true' ? '真？' : '假？'}</button>
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    ) : <p className="hl-empty">{I('还没有读到任何住客须知。走廊墙上和客房桌上会有。')}</p>
    void L5_RULE
  } else if (tab === '楼层图录') {
    page = (
      <div className="hl-atlas">
        <div className="hl-atlas-floors">
          {FLOOR_ORDER.map((f) => f === 13 ? (
            <div key={f} className="hl-atlas-row struck"><b>13F</b><span>员工专用</span></div>
          ) : (
            <div key={f} className={`hl-atlas-row ${book.floors.includes(f) ? '' : 'dim'}`}><b>{L5_FLOORS[f]?.name}</b><span>{book.floors.includes(f) ? L5_FLOORS[f]?.theme : '未到访'}</span></div>
          ))}
        </div>
        <div className="hl-atlas-finds">
          <div className="hl-sub">发现记录</div>
          {DISCOVER.map((d) => {
            const fl = book.seen[d.key]
            return <div key={d.key} className={`hl-find ${fl === undefined ? 'dim' : ''}`}><span>{fl === undefined ? '……' : I(d.name)}</span><em>{fl === undefined ? '' : L5_FLOORS[fl]?.name}</em></div>
          })}
          <div className="hl-find lobby"><span>???</span><em className="hl-blot">{book.rooms.includes('lobby') ? '大堂' : '██'}</em></div>
          <div className="hl-sub small">{I(L5_VARIANT_NAMES.mainhall + '的留声机永远不会停。')}</div>
        </div>
      </div>
    )
  } else {
    page = (
      <div className="hl-deeds">
        <div className="hl-sub">契约</div>
        <div className="hl-contract empty"><img src={SEAL()} alt="" draggable={false} /><p>{I('还没有与先生签下任何契约。')}</p></div>
        <div className="hl-sub">失物招领（{h.lost.length} / 40）</div>
        {h.lost.length ? (
          <ul className="hl-lost">
            {h.lost.slice().reverse().map((it, i) => <li key={i}><span>{ITEMS[it.type]?.name ?? it.type}</span>{it.count > 1 && <em>×{it.count}</em>}</li>)}
          </ul>
        ) : <p className="hl-empty">{I('架子是空的。')}</p>}
        <p className="hl-note">丢在地上的东西没人看着时会被收走。到 M.E.G. 哨所「家政服务」找奥蒂斯，每件付 {LOST_FEE.count} 瓶杏仁水取回。</p>
      </div>
    )
  }
  return (
    <div className={`hl-book tier${tier} ${mad ? 'mad' : ''}`}>
      <div className="hl-tabs" role="tablist">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => flip(t)}>{t}</button>)}
      </div>
      <div className="hl-page" key={tab}>
        <div className="hl-corner tl" /><div className="hl-corner tr" /><div className="hl-corner bl" /><div className="hl-corner br" />
        <img className="hl-water" src={SEAL()} alt="" draggable={false} />
        <div className="hl-head">
          <div className="hl-title">恐 怖 旅 馆</div>
          <div className="hl-sub-title">THE TERROR HOTEL · 住客登记簿</div>
        </div>
        <div className="hl-section">{tab}</div>
        {page}
        <div className="hl-tendrils" aria-hidden="true" />
      </div>
    </div>
  )
}
