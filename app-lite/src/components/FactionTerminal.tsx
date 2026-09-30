import { useEffect, useId, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { Engine } from '@/game/engine'
import { FACTIONS } from '@/game/content/factions'
import { CAREERS } from '@/game/content/careers'
import { FACTION_TERMINALS, factionRelationship, questFaction, type NewFaction } from '@/game/content/factionTerminals'
import { actualRank } from '@/game/engine/career'
import { completedFactionLines, factionState, trackFactionTask } from '@/game/engine/factionMissions'
import { megQuestProgress } from '@/game/content/megTerminal'
import { ITEMS } from '@/game/content/items'
import { loadAvatar } from '@/game/core/avatar'
import { npcPortrait } from './npcPortrait'
import { ProfileEditor } from './MegTerminal'
import MegContacts from './MegContacts'
import { FactionCareerPanel, FactionMissionJournal } from './FactionMissions'
import './FactionTerminal.css'

const TABS = ['个人', '任务', '联系人'] as const
type Tab = typeof TABS[number]
function Personal({ faction, engine, readOnly }: { faction: NewFaction; engine: Engine; readOnly: boolean }) {
  const [editing, setEditing] = useState(false), [saved, setSaved] = useState(false)
  const config = FACTION_TERMINALS[faction], p = engine.profile, rep = engine.rep[faction] ?? 0
  const rank = readOnly ? 0 : actualRank(engine, faction), joined = !readOnly && !!engine.career.routes[faction]?.joined
  const role = readOnly ? '进入游戏后读取身份' : joined ? rank ? CAREERS[faction].ranks[rank - 1] : '已登记 · 待完成任务线' : factionRelationship(faction, rep)
  return <>
    <div className="faction-section-title"><div><small>01 / PERSONAL RECORD</small><h3>{config.record}</h3></div><span>{readOnly ? '档案预览' : joined ? '身份已登记' : '访客记录'}</span></div>
    <article className="faction-id">
      <div className="faction-photo-column"><div className="faction-photo"><small>{config.short} / ID</small><img src={npcPortrait(loadAvatar(), undefined, undefined, 240, 'identity')} alt={`玩家当前形象的 ${config.short} 证件照`} /><span>{config.record}</span></div><div className="faction-id-code">{readOnly ? 'PREVIEW' : `${faction.toUpperCase()}-${(engine.seed >>> 0).toString(16).toUpperCase().padStart(8, '0')}`}</div></div>
      <div className="faction-id-copy"><small>{config.code}</small><h4>{readOnly ? '个人档案' : p.name || '姓名未登记'}</h4><p className="faction-muted">{config.motto}</p><dl>
        <div><dt>姓名 / NAME</dt><dd>{readOnly ? '—' : p.name || '未登记'}</dd></div><div><dt>性别 / GENDER</dt><dd>{readOnly ? '—' : p.gender ?? '未登记'}</dd></div><div><dt>年龄 / AGE</dt><dd>{readOnly ? '—' : p.age === null ? '未登记' : `${p.age} 岁`}</dd></div><div className="faction-position"><dt>{joined ? '职位 / POSITION' : '团体关系 / RELATION'}</dt><dd>{role}</dd></div>
      </dl>{!readOnly && <button onClick={() => { setEditing(v => !v); setSaved(false) }}>{editing ? '收起编辑' : '编辑个人资料'} ↗</button>}{saved && <p role="status">资料已保存，各团体共用这份个人资料。</p>}{readOnly && <p>进入游戏后可填写姓名、性别和年龄。</p>}</div>
    </article>
    {editing && !readOnly && <ProfileEditor engine={engine} onDone={ok => { setEditing(false); setSaved(ok) }} />}
    {!readOnly && <div className="faction-ledger"><div><small>REPUTATION / 声望</small><strong>{rep > 0 ? '+' : ''}{rep}</strong><span>{factionRelationship(faction, rep)}</span></div><div><small>COMPLETED / 结案履历</small><strong>{completedFactionLines(engine, faction)}<em> / 16</em></strong><span>按完整任务线计入晋升</span></div>{faction === 'jerry' ? <div><small>INFLUENCE / 教化</small><strong>{Math.round(engine.indoctrination)}<em> / 100</em></strong><span>{engine.jerryTamed ? '杰瑞已驯服 · 仪式不增加教化' : '仪式与接触会留下实际影响'}</span></div> : <div><small>{faction === 'bntg' ? 'SETTLEMENT / 结算' : 'RESEARCH / 档案原则'}</small><strong>{faction === 'bntg' ? '压印币' : '匿名记录'}</strong><span>{faction === 'bntg' ? '实物核对 · 逐站签收' : '观察、推断与未知分开保存'}</span></div>}</div>}
    {faction === 'jerry' && <p className="faction-callout">蓝羽名册记录职位，教化条记录实际影响；两者独立。需要脱离教化时，可到 Ariane 或 Tom 接待设施求助，再核验证言并完成医疗隔离恢复。</p>}
    <details className="faction-growth"><summary>身份与晋升 · {config.rank}</summary><FactionCareerPanel faction={faction} engine={engine} readOnly={readOnly} /></details>
  </>
}
function Tasks({ faction, engine, readOnly }: { faction: NewFaction; engine: Engine; readOnly: boolean }) {
  const [filter, setFilter] = useState<'all' | 'active' | 'ready'>('all'), [, refresh] = useState(0)
  const quests = readOnly ? [] : engine.quests.filter(q => questFaction(q.def) === faction)
  const visible = quests.filter(q => filter === 'all' || megQuestProgress(engine, q).done === (filter === 'ready'))
  const state = readOnly ? null : factionState(engine, faction)
  return <><FactionMissionJournal faction={faction} engine={engine} readOnly={readOnly} /><section className="faction-generic"><h3>通用委托 <small>{quests.length} 份</small></h3><p>从本团体 NPC 接取的通用委托归档于此，不计入任务线晋升数量。</p><div className="faction-filters">{([['all', '全部'], ['active', '进行中'], ['ready', '待交付']] as const).map(([key, label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div>{!visible.length && <p className="faction-empty">暂无此类委托。与团体任务联系人交谈可获取委托。</p>}{visible.map(q => { const p = megQuestProgress(engine, q), tracked = state?.tracked?.kind === 'quest' && state.tracked.id === q.def.id; return <article className="faction-quest" key={q.def.id}><small>{p.done ? '待交付' : '进行中'} · {q.def.issuer?.name ?? FACTION_TERMINALS[faction].short}</small><h4>{q.def.title}</h4><p>{q.def.desc}</p><progress max={100} value={p.percent} aria-label={`${q.def.title}进度`} /><span>{p.label}</span><p>奖励：声望 +{q.def.rewardRep}{q.def.rewardCoin > 0 ? ` · 压印币 ×${q.def.rewardCoin}` : ''} · {q.def.rewardItems.map(i => ITEMS[i]?.name ?? i).join('、') || '无额外物资'}</p><button aria-pressed={tracked} onClick={() => { trackFactionTask(engine, faction, tracked ? null : { kind: 'quest', id: q.def.id }); refresh(n => n + 1) }}>{tracked ? '取消右上角追踪' : '在右上角追踪'}</button>{p.done && <p className="faction-callout">目标达成，请返回该团体委托交付点；指定收货人任务需当面交付。</p>}</article> })}</section></>
}
export default function FactionTerminal({ faction, engine, codex, readOnly = false, initialTab = '个人' }: { faction: NewFaction; engine: Engine; codex: Record<string, boolean>; readOnly?: boolean; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab), [, refresh] = useState(0), id = useId(), config = FACTION_TERMINALS[faction]
  useEffect(() => { if (readOnly) return; const off = engine.on(() => refresh(n => n + 1)), timer = setInterval(() => refresh(n => n + 1), 1000); return () => { off(); clearInterval(timer) } }, [engine, readOnly])
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => { const next = e.key === 'ArrowRight' ? (i + 1) % 3 : e.key === 'ArrowLeft' ? (i + 2) % 3 : e.key === 'Home' ? 0 : e.key === 'End' ? 2 : -1; if (next < 0) return; e.preventDefault(); setTab(TABS[next]); document.getElementById(`${id}-tab-${next}`)?.focus() }
  const url = faction === 'bntg' ? 'the-b-n-t-g' : faction === 'ariane' ? 'cercle-ariane' : 'followers-of-jerry'
  return <section className={`faction-terminal faction-${faction}`} aria-label={`${config.short} 团体终端`} style={{ '--f-accent': config.color, '--f-paper': config.paper, '--f-ink': config.ink, '--f-muted': config.muted, '--meg-accent': config.color, '--meg-text': config.ink, '--meg-dim': config.muted, '--meg-edge': `${config.color}55` } as CSSProperties} onKeyDown={e => { if (e.key !== 'Escape') e.stopPropagation() }}>
    <header className="faction-header"><div className="faction-brand"><img src={`${import.meta.env.BASE_URL}textures/${FACTIONS[faction].logo}`} alt={`${config.short} 标志`} /><div><small>{config.code}</small><h2>{config.short}</h2><span>{config.title}</span></div></div><div className="faction-seal"><b>{faction === 'bntg' ? 'LOCAL COPY' : faction === 'ariane' ? 'H / 01' : 'VII'}</b><span>{readOnly ? '资料预览' : '本地档案'} · {config.motto}</span></div></header>
    <div className="faction-intro"><span>● {readOnly ? 'PREVIEW' : 'CONNECTED'}</span><p>{config.description}</p></div>
    <nav className="faction-tabs" role="tablist" aria-label={`${config.short} 标签页`}>{TABS.map((label, i) => <button key={label} id={`${id}-tab-${i}`} role="tab" aria-selected={tab === label} aria-controls={`${id}-panel`} tabIndex={tab === label ? 0 : -1} onKeyDown={e => onTabKey(e, i)} onClick={() => setTab(label)}><small>0{i + 1}</small>{label}<span>{['IDENTITY', 'MISSIONS', 'CONTACTS'][i]}</span></button>)}</nav>
    <div className="faction-content" id={`${id}-panel`} role="tabpanel" tabIndex={0} aria-labelledby={`${id}-tab-${TABS.indexOf(tab)}`}>
      {tab === '个人' && <Personal faction={faction} engine={engine} readOnly={readOnly} />}{tab === '任务' && <Tasks faction={faction} engine={engine} readOnly={readOnly} />}{tab === '联系人' && <><div className="faction-section-title"><div><small>03 / DIRECTORY</small><h3>{faction === 'bntg' ? '业务联络簿' : faction === 'ariane' ? '团队协作名录' : '圣所人士名册'}</h3></div><span>已接触人士</span></div><MegContacts faction={faction} engine={engine} codex={codex} /></>}
    </div><footer className="faction-footer"><span>{config.short} / {config.motto}</span><a href={`https://backrooms-wiki.wikidot.com/${url}`} target="_blank" rel="noreferrer">团体资料 ↗</a></footer>
  </section>
}

