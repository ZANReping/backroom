import { useState } from 'react'
import { engine as singleton, type Engine } from '@/game/engine'
import { FACTION_MISSIONS, FACTION_NPC_PLACES } from '@/game/content/factionMissions'
import { FACTION_TERMINALS, type NewFaction } from '@/game/content/factionTerminals'
import { MEG_PROMOTION_COUNTS } from '@/game/content/megMissions'
import { CAREERS } from '@/game/content/careers'
import { NPCS } from '@/game/content/npcs'
import { ITEMS } from '@/game/content/items'
import { actualRank, claimRewards } from '@/game/engine/career'
import { acceptFactionMission, canAdministerFaction, completedFactionLines, factionMissionLock, factionObjectiveText, factionStageProgress, factionState, performFactionStation, promoteFaction, registerFaction, submitFactionStage, trackFactionTask } from '@/game/engine/factionMissions'

export function FactionCareerPanel({ faction, engine = singleton, readOnly = false }: { faction: NewFaction; engine?: Engine; readOnly?: boolean }) {
  const [note, setNote] = useState(''), [, refresh] = useState(0)
  const config = FACTION_TERMINALS[faction], count = readOnly ? 0 : completedFactionLines(engine, faction)
  const rank = readOnly ? 0 : actualRank(engine, faction), joined = !readOnly && engine.career.routes[faction]?.joined
  const can = !readOnly && canAdministerFaction(engine, faction)
  const act = (fn: () => string) => { setNote(fn()); refresh(n => n + 1) }
  return <section className="faction-career space-y-3 text-sm">
    <h3>{config.rank}</h3><p>{readOnly ? '进入游戏后读取个人履历。' : `结案 ${count} / 16 · ${joined ? rank ? CAREERS[faction].ranks[rank - 1] : '已登记 · 待完成任务线' : '尚未登记'}`}</p>
    <ol className="faction-ranks">{CAREERS[faction].ranks.map((r, i) => <li key={r} className={rank > i ? 'is-done' : ''}><b>{rank > i ? '✓' : `0${i + 1}`}</b><span>{r}<small>结案 {MEG_PROMOTION_COUNTS[i]} 条不同任务线</small></span></li>)}</ol>
    <p>完整任务线结案才计入晋升；通用委托、单个阶段和重复提交不计数。到该团体登记设施或任务联系人身边办理，无需答题。</p>
    {!readOnly && factionState(engine, faction).legacyRank > 0 && <p>旧档已取得资格保留，旧考核不折算为新任务线。</p>}
    {!readOnly && <div className="faction-actions">
      {!joined ? <button className="menu-btn" disabled={!can} onClick={() => act(() => registerFaction(engine, faction))}>{config.registration}</button> : rank < 4 && <button className="menu-btn" disabled={!can || count < MEG_PROMOTION_COUNTS[rank]} onClick={() => act(() => promoteFaction(engine, faction))}>核验履历并晋升</button>}
      {!!engine.career.pending.length && <button className="menu-btn" onClick={() => act(() => { claimRewards(engine); engine.persist(); return '已领取可装入背包的奖励，其余继续保留。' })}>领取待发奖励</button>}
    </div>}
    {!readOnly && !can && <small>请抵达登记设施或任务联系人身边办理；声望继续影响交谈、交易和准入。</small>}
    {note && <p role="status">{note}</p>}
  </section>
}
const rewardText = (d: typeof FACTION_MISSIONS[number]) => `声望 +${d.rep}${d.coins ? ` · 压印币 ×${d.coins}` : ''} · ${d.items.map(i => ITEMS[i]?.name ?? i).join('、')}`
export function FactionMissionJournal({ faction, engine, readOnly }: { faction: NewFaction; engine: Engine; readOnly: boolean }) {
  const [filter, setFilter] = useState<'all' | 'active' | 'available' | 'completed'>('all'), [, refresh] = useState(0)
  const config = FACTION_TERMINALS[faction], state = readOnly ? null : factionState(engine, faction)
  const missions = FACTION_MISSIONS.filter(d => d.faction === faction)
  const active = missions.filter(d => state?.missions[d.id] && !state.missions[d.id].completed).length
  const visible = missions.filter(d => { const p = state?.missions[d.id]; return filter === 'all' || (filter === 'active' && p && !p.completed) || (filter === 'completed' && p?.completed) || (filter === 'available' && !readOnly && !p && !factionMissionLock(engine, d.id)) })
  return <section aria-label={`${config.short} 连续任务线`}>
    <div className="faction-section-title"><div><small>02 / ASSIGNMENTS</small><h3>{config.journal}</h3></div><span>{active} / 3 进行中</span></div>
    <p className="faction-muted">四档任务按前置结案解锁。点击档案查看阶段、办理地点与奖励；现场记录需要实际行走或停留。</p>
    <div className="faction-filters">{([['all', '全部档案'], ['active', '进行中'], ['available', '可接取'], ['completed', '已结案']] as const).map(([key, text]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{text}</button>)}</div>
    {!visible.length && <p className="faction-empty">当前分类暂无任务线，可在全部档案查看前置条件。</p>}
    <div className="faction-dossiers">{visible.map(d => {
      const p = state?.missions[d.id], lock = readOnly ? '进入游戏后读取状态。' : factionMissionLock(engine, d.id)
      const tracked = state?.tracked?.kind === 'line' && state.tracked.id === d.id
      const stage = p && !p.completed ? d.stages[p.stage] : null, progress = stage ? factionStageProgress(engine, d.id) : null
      return <details key={d.id} className={`faction-dossier ${tracked ? 'is-tracked' : ''}`}>
        <summary><small>0{d.tier} / {config.tiers[d.tier - 1]}</small><strong>{d.title}</strong><span>{p?.completed ? '✓ 已结案' : p ? `${tracked ? '◉ 追踪中' : '进行中'} · ${p.stage + 1}/${d.stages.length}` : readOnly ? '档案预览' : lock ? '前置未满足' : '可接取'}</span></summary>
        <div className="faction-dossier-body"><p>{d.brief}</p><p className="faction-muted">发起人：{NPCS[d.issuer]?.name ?? d.issuer} · {FACTION_NPC_PLACES[d.issuer]}</p>
          {!p && <p className="faction-callout">{lock ?? '前往上述地点与发起人交谈接取；无需先加入团体。'}</p>}
          {stage && progress && <div className="faction-current"><small>CURRENT / 当前阶段</small><h4>{stage.title}</h4><p>{stage.story}</p><p>{progress.hint}</p><progress max={progress.max} value={progress.value} aria-label={`${d.title}阶段进度`} /><span>{progress.label}</span><button aria-pressed={tracked} onClick={() => { trackFactionTask(engine, faction, tracked ? null : { kind: 'line', id: d.id }); refresh(n => n + 1) }}>{tracked ? '取消右上角追踪' : '在右上角追踪'}</button></div>}
          <ol className="faction-stage-list">{d.stages.map((s, i) => <li key={i} className={p && (p.completed || i < p.stage) ? 'is-done' : p?.stage === i ? 'is-current' : ''}><b>{p && (p.completed || i < p.stage) ? '✓' : String(i + 1).padStart(2, '0')}</b><div><strong>{s.title}</strong><small>{factionObjectiveText(s.objective)}</small></div></li>)}</ol>
          {p?.completed && <blockquote>{d.ending}</blockquote>}<p className="faction-muted">整线奖励：{rewardText(d)}。满包时保留待领取。</p>
        </div>
      </details>
    })}</div>
  </section>
}
export function FactionNpcMissions({ faction, npcId, engine = singleton }: { faction: NewFaction; npcId: string; engine?: Engine }) {
  const [note, setNote] = useState(''), [, refresh] = useState(0)
  const config = FACTION_TERMINALS[faction], state = factionState(engine, faction), missions = FACTION_MISSIONS.filter(m => m.faction === faction)
  const offers = missions.filter(m => m.issuer === npcId && !state.missions[m.id])
  const handoffs = missions.filter(m => { const p = state.missions[m.id], o = m.stages[p?.stage]?.objective; return p && !p.completed && o && 'npc' in o && o.npc === npcId })
  if (!offers.length && !handoffs.length && !missions.some(m => m.issuer === npcId)) return null
  const act = (fn: () => string) => { setNote(fn()); refresh(n => n + 1) }
  return <section className="my-3 space-y-3 border-y py-3 text-xs" style={{ borderColor: config.color }} aria-label={`${config.short} 任务交接`}>
    <h3>{config.short} / 连续任务线</h3>
    {handoffs.map(m => { const s = m.stages[state.missions[m.id].stage], o = s.objective; return <div key={m.id} className="space-y-2"><strong>{m.title} · {s.title}</strong><p>{s.story}</p>{o.kind === 'rite' && <p>{engine.jerryTamed ? '杰瑞已被驯服，本次仪式不会增加教化。' : `确认后教化 +${o.influence}（当前 ${Math.round(engine.indoctrination)}/100）。可先离开，不参加不会自动扣除物资。`}</p>}<button className="menu-btn px-3 py-2" onClick={() => act(() => submitFactionStage(engine, m.id, npcId))}>{o.kind === 'deliver' ? '确认交付物资' : o.kind === 'rite' ? '确认参加蓝羽仪式' : '交谈并签收记录'}</button></div> })}
    {offers.map(m => { const lock = factionMissionLock(engine, m.id); return <details key={m.id}><summary className="cursor-pointer py-2">{config.tiers[m.tier - 1]} / {m.title}{lock ? ' · 前置未满足' : ' · 可接取'}</summary><p className="my-2">{m.brief}</p><p>{m.stages.length} 阶段 · {rewardText(m)}</p>{lock ? <p className="my-2">{lock}</p> : <button className="menu-btn my-2 px-3 py-2" onClick={() => act(() => acceptFactionMission(engine, m.id, npcId))}>接取任务线「{m.title}」</button>}</details> })}
    <FactionCareerPanel faction={faction} engine={engine} />{note && <p role="status">{note}</p>}
  </section>
}
export function FactionStationTasks({ faction, engine = singleton }: { faction: NewFaction; engine?: Engine }) {
  const [note, setNote] = useState(''), [, refresh] = useState(0), state = factionState(engine, faction)
  const active = FACTION_MISSIONS.filter(d => d.faction === faction && state.missions[d.id] && !state.missions[d.id].completed && d.stages[state.missions[d.id].stage]?.objective.kind === 'station')
  return <section className="space-y-3">{active.map(d => { const p = state.missions[d.id], o = d.stages[p.stage].objective; if (o.kind !== 'station') return null; return <div key={d.id}><h3>{d.title} · {d.stages[p.stage].title}</h3><p>{factionObjectiveText(o)}</p><p>{p.progress} / {o.actions.length} 已记录</p><button className="menu-btn px-3 py-2" onClick={() => { setNote(performFactionStation(engine, d.id)); refresh(n => n + 1) }}>{o.actions[p.progress]}</button></div> })}{!active.length && <p>当前没有工位待办。可在团体任务档案查看接取地点和下一阶段。</p>}{note && <p role="status">{note}</p>}</section>
}
