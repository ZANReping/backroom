import { useState } from 'react'
import { engine, type Engine } from '@/game/engine'
import { MEG_MISSIONS, MEG_NPC_PLACES, MEG_PROMOTION_COUNTS, MEG_TIER_NAMES } from '@/game/content/megMissions'
import { CAREERS } from '@/game/content/careers'
import { NPCS } from '@/game/content/npcs'
import { ITEMS } from '@/game/content/items'
import { actualRank } from '@/game/engine/career'
import { acceptMegMission, canAdministerMeg, claimRewards, completedMegLines, megMissionLock, megObjectiveText, megStageProgress, megState, promoteMeg, registerMeg, submitMegStage, trackMegTask } from '@/game/engine/megMissions'

export function MegCareerPanel({ readOnly = false }: { readOnly?: boolean }) {
  const [note, setNote] = useState('')
  const [, refresh] = useState(0)
  const act = (fn: () => string | void) => { setNote(fn() ?? '奖励已领取，背包放不下的部分继续保留。'); refresh(n => n + 1) }
  const count = readOnly ? 0 : completedMegLines(engine)
  const rank = readOnly ? 0 : actualRank(engine, 'meg')
  const joined = !readOnly && engine.career.routes.meg?.joined
  const can = !readOnly && canAdministerMeg(engine)
  return <section className="meg-promotion space-y-3 text-sm">
    <h3>外勤履历与晋升</h3>
    <p>{readOnly ? '进入游戏后读取履历。' : `已结案 ${count} / ${MEG_MISSIONS.length} 条连续任务线 · ${joined ? rank ? CAREERS.meg.ranks[rank - 1] : '登记协作员' : '尚未登记协作身份'}`}</p>
    <ol className="space-y-2">{CAREERS.meg.ranks.map((name, i) => <li key={name}>{rank > i ? '✓' : '○'} {name} <span className="meg-muted">· 结案 {MEG_PROMOTION_COUNTS[i]} 条不同任务线</span></li>)}</ol>
    <p className="meg-muted">完成整条任务线才计入履历；通用委托、重复交付和单个阶段不计入。到 MEG 登记设施或任务联系人身边办理，无需答题。声望继续影响交谈、交易和据点准入。</p>
    {!readOnly && megState(engine).legacyRank > 0 && <p className="meg-muted">旧档已取得的 {CAREERS.meg.ranks[megState(engine).legacyRank - 1]} 资格予以保留；旧考核不折算为新任务线。</p>}
    {!readOnly && <div className="flex flex-wrap gap-2">
      {!joined ? <button className="menu-btn px-3 py-2 disabled:opacity-40" disabled={!can} onClick={() => act(() => registerMeg(engine))}>登记 MEG 协作身份</button> : rank < 4 && <button className="menu-btn px-3 py-2 disabled:opacity-40" disabled={!can || count < MEG_PROMOTION_COUNTS[rank]} onClick={() => act(() => promoteMeg(engine))}>核验履历并晋升</button>}
      {!!engine.career.pending.length && <button className="menu-btn px-3 py-2" onClick={() => act(() => { claimRewards(engine); engine.persist() })}>领取待发奖励</button>}
    </div>}
    {!readOnly && !can && <p className="meg-muted">需到登记设施或联系人身边办理。</p>}
    {note && <p role="status">{note}</p>}
  </section>
}

export function MegMissionJournal({ engine, readOnly }: { engine: Engine; readOnly: boolean }) {
  const [filter, setFilter] = useState<'all' | 'active' | 'available' | 'completed'>('all')
  const [, refresh] = useState(0)
  const state = readOnly ? null : megState(engine)
  const count = readOnly ? 0 : completedMegLines(engine)
  const active = MEG_MISSIONS.filter(m => state?.missions[m.id] && !state.missions[m.id].completed).length
  const visible = MEG_MISSIONS.filter(m => {
    const p = state?.missions[m.id]
    return filter === 'all' || (filter === 'active' && p && !p.completed) || (filter === 'completed' && p?.completed) || (filter === 'available' && !readOnly && !p && !megMissionLock(engine, m.id))
  })
  return <section className="meg-mission-journal" aria-label="MEG 连续任务线">
    <div className="meg-section-heading"><div><p className="meg-eyebrow">FIELD DOSSIERS / 连续任务线</p><h3>每一程，都留下记录</h3></div><span className="meg-stamp">结案 {count} / {MEG_MISSIONS.length}</span></div>
    <p className="meg-muted">{active} / 3 条进行中。四档外勤逐步解锁，多位联系人接力签收。点击档案查看当前目标与办理地点；现场记录随游戏运行自动进行。</p>
    <div className="meg-filters" role="group" aria-label="筛选连续任务线">{([['all', '全部档案'], ['active', '进行中'], ['available', '可接取'], ['completed', '已结案']] as const).map(([key, text]) => <button key={key} className="meg-button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{text}</button>)}</div>
    {!visible.length && <p className="meg-empty">当前分类暂无任务线。可在全部档案中查看联系人和前置条件。</p>}
    <div className="meg-dossiers">{visible.map(d => {
      const p = state?.missions[d.id], lock = readOnly ? '进入游戏后读取任务状态。' : megMissionLock(engine, d.id)
      const tracked = state?.tracked?.kind === 'line' && state.tracked.id === d.id
      const stage = p && !p.completed ? d.stages[p.stage] : null
      const progress = stage ? megStageProgress(engine, d.id) : null
      return <details className={`meg-dossier ${tracked ? 'is-tracked' : ''}`} key={d.id}>
        <summary><span className="meg-eyebrow">0{d.tier} / {MEG_TIER_NAMES[d.tier - 1]}</span><strong>{d.title}</strong><span className="meg-status">{p?.completed ? '✓ 已结案' : p ? `${tracked ? '◉ 追踪中' : '◌ 进行中'} · ${p.stage + 1}/${d.stages.length}` : lock ? '前置未满足' : '可接取'}</span></summary>
        <div className="meg-dossier-body"><p>{d.brief}</p><p className="meg-muted">发起人：{NPCS[d.issuer]?.name ?? d.issuer} · {MEG_NPC_PLACES[d.issuer]}</p>
          {!p && <p className="meg-ready-note">{lock ?? '前往上述地点，与发起人交谈接取。无需先加入 MEG。'}</p>}
          {stage && progress && <div className="meg-current-stage"><p className="meg-eyebrow">CURRENT OBJECTIVE / 当前目标</p><h4>{stage.title}</h4><p>{stage.story}</p><p>{progress.hint}</p><div className="meg-progress-label"><span>阶段进度</span><strong>{progress.label}</strong></div><progress max={progress.max} value={progress.value} aria-label={`${d.title}阶段进度`} />
            <button className="meg-button" aria-pressed={tracked} onClick={() => { trackMegTask(engine, tracked ? null : { kind: 'line', id: d.id }); refresh(n => n + 1) }}>{tracked ? '取消右上角追踪' : '在右上角追踪'}</button>
          </div>}
          <ol className="meg-stage-list">{d.stages.map((s, i) => <li key={s.title} className={p && (p.completed || i < p.stage) ? 'is-done' : p?.stage === i ? 'is-current' : ''}><span>{p && (p.completed || i < p.stage) ? '✓' : String(i + 1).padStart(2, '0')}</span><div><strong>{s.title}</strong><small>{megObjectiveText(s.objective)}</small></div></li>)}</ol>
          {p?.completed && <blockquote className="meg-ending">{d.ending}</blockquote>}
          <p className="meg-muted">整线奖励：声望 +{d.rep} · 天鹰币 ×{d.coins} · {d.items.map(id => ITEMS[id]?.name ?? id).join('、')}。背包满时保留待领取。</p>
        </div>
      </details>
    })}</div>
  </section>
}

export function MegNpcMissions({ npcId }: { npcId: string }) {
  const [note, setNote] = useState('')
  const [, refresh] = useState(0)
  const state = megState(engine)
  const offers = MEG_MISSIONS.filter(m => m.issuer === npcId && !state.missions[m.id])
  const handoffs = MEG_MISSIONS.filter(m => {
    const p = state.missions[m.id], o = m.stages[p?.stage]?.objective
    return p && !p.completed && o && 'npc' in o && o.npc === npcId
  })
  if (!MEG_NPC_PLACES[npcId]) return null
  const act = (fn: () => string) => { setNote(fn()); refresh(n => n + 1) }
  return <section className="my-3 border-y py-3 text-xs" style={{ borderColor: '#646637', color: '#d4d4af' }} aria-label="MEG 外勤委托">
    <h3 className="mb-2 font-semibold">M.E.G. / 外勤任务线</h3>
    <div className="space-y-2">{handoffs.map(m => {
      const s = m.stages[state.missions[m.id].stage]
      return <div key={m.id}><p>「{m.title}」· {s.title}</p><p className="my-1 opacity-80">{s.story}</p><button className="menu-btn px-3 py-2" onClick={() => act(() => submitMegStage(engine, m.id, npcId))}>{s.objective.kind === 'deliver' ? '确认交付物资' : '交谈并签收记录'}</button></div>
    })}{offers.map(m => {
      const lock = megMissionLock(engine, m.id)
      return <details key={m.id}><summary className="cursor-pointer py-2">{MEG_TIER_NAMES[m.tier - 1]} / {m.title}{lock ? ' · 前置未满足' : ' · 可接取'}</summary><p className="mb-2 leading-relaxed">{m.brief}</p><p className="mb-2">{m.stages.length} 阶段 · 结案声望 +{m.rep} · 天鹰币 ×{m.coins} · {m.items.map(id => ITEMS[id]?.name ?? id).join('、')}</p>{lock ? <p className="opacity-70">{lock}</p> : <button className="menu-btn px-3 py-2" onClick={() => act(() => acceptMegMission(engine, m.id, npcId))}>接取任务线「{m.title}」</button>}</details>
    })}</div>
    {!offers.length && !handoffs.length && <p>本次没有新的外勤交接。完整档案可在团体终端查看。</p>}
    <div className="mt-3"><MegCareerPanel /></div>
    {note && <p role="status" className="mt-2 leading-relaxed">{note}</p>}
  </section>
}
