import { useEffect, useId, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { Engine } from '@/game/engine'
import { FACTIONS, REP_TIER } from '@/game/content/factions'
import { MegMissionJournal } from './MegMissions'
import { megState, trackMegTask } from '@/game/engine/megMissions'
import { ITEMS } from '@/game/content/items'
import { isMegQuest, megPosition, megQuestProgress } from '@/game/content/megTerminal'
import { loadAvatar } from '@/game/core/avatar'
import type { PlayerProfile } from '@/game/core/playerProfile'
import { npcPortrait } from './npcPortrait'
import CareerPanel from './CareerPanel'
import MegContacts from './MegContacts'
import './MegTerminal.css'

const TABS = ['个人', '任务', '联系人'] as const
const TAB_CODES = ['PERSONNEL', 'ASSIGNMENTS', 'DIRECTORY']
type Tab = typeof TABS[number]

export function ProfileEditor({ engine, onDone }: { engine: Engine; onDone: (saved: boolean) => void }) {
  const [name, setName] = useState(engine.profile.name)
  const [gender, setGender] = useState<PlayerProfile['gender']>(engine.profile.gender)
  const [age, setAge] = useState(engine.profile.age?.toString() ?? '')
  const [error, setError] = useState('')
  return <form className="meg-profile-form" onSubmit={e => {
    e.preventDefault()
    if (!name.trim()) { setError('请填写姓名，最多 24 个字符。'); return }
    if (age !== '' && (!Number.isInteger(Number(age)) || Number(age) < 1 || Number(age) > 150)) {
      setError('年龄须为 1–150 的整数，或留空待补录。'); return
    }
    engine.updateProfile({ name, gender, age: age === '' ? null : Number(age) })
    onDone(true)
  }}>
    <p className="meg-eyebrow">EDIT PERSONNEL RECORD / 补录与更正</p>
    <div className="meg-form-fields">
      <label>姓名<input autoFocus required maxLength={24} value={name} onChange={e => setName(e.target.value)} placeholder="输入玩家姓名" autoComplete="off" /></label>
      <label>性别<select value={gender ?? ''} onChange={e => setGender((e.target.value || null) as PlayerProfile['gender'])}>
        <option value="">未登记</option>{(['男', '女', '其他', '不透露'] as const).map(g => <option key={g}>{g}</option>)}
      </select></label>
      <label>年龄<input type="number" inputMode="numeric" min={1} max={150} step={1} value={age} onChange={e => setAge(e.target.value)} placeholder="未登记" /></label>
    </div>
    <p className="meg-muted">资料随当前存档保存。性别登记不会改变你的捏人外观。</p>
    {error && <p role="alert" className="meg-error">{error}</p>}
    <div className="meg-actions"><button className="meg-button meg-button-primary" type="submit">保存档案 ↵</button><button className="meg-button" type="button" onClick={() => onDone(false)}>取消</button></div>
  </form>
}

function MegPersonal({ engine, readOnly }: { engine: Engine; readOnly: boolean }) {
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const profile = engine.profile
  const joined = !!engine.career.routes.meg?.joined
  const rep = engine.rep.meg ?? 0
  const recordId = `MEG-${(engine.seed >>> 0).toString(16).toUpperCase().padStart(8, '0')}`
  return <>
    <div className="meg-section-heading"><div><p className="meg-eyebrow">01 / PERSONNEL RECORD</p><h3>个人档案</h3></div><span className="meg-stamp">{readOnly ? '档案预览' : joined ? '已登记' : '访客档案'}</span></div>
    <div className="meg-id-card">
      <div className="meg-photo-column">
        <div className="meg-photo"><span className="meg-photo-corner">M.E.G. / ID</span><img src={npcPortrait(loadAvatar(), undefined, undefined, 240, 'identity')} alt="玩家当前形象的 MEG 证件照" /><span className="meg-photo-caption">IDENTIFICATION PHOTOGRAPH</span></div>
        <div className="meg-barcode" aria-hidden="true" />
        <span className="meg-record-id">{readOnly ? 'RECORD / PREVIEW' : recordId}</span>
      </div>
      <div className="meg-id-content">
        <p className="meg-eyebrow">MAJOR EXPLORER GROUP</p>
        <h4>{readOnly ? '流浪者档案' : profile.name || '姓名未登记'}</h4>
        <p className="meg-muted">探险者总署 · 人员身份记录</p>
        <dl className="meg-fields">
          <div><dt>姓名 / NAME</dt><dd>{readOnly ? '—' : profile.name || '未登记'}</dd></div>
          <div><dt>性别 / GENDER</dt><dd>{readOnly ? '—' : profile.gender ?? '未登记'}</dd></div>
          <div><dt>年龄 / AGE</dt><dd>{readOnly ? '—' : profile.age === null ? '未登记' : `${profile.age} 岁`}</dd></div>
          <div className="meg-field-wide"><dt>{joined && !readOnly ? 'MEG 职位 / POSITION' : '与 MEG 的关系 / RELATION'}</dt><dd className="meg-position">{readOnly ? '进入游戏后读取身份' : megPosition(engine)}</dd></div>
        </dl>
        {!readOnly && <button className="meg-button" onClick={() => { setEditing(!editing); setSaved(false) }}>{editing ? '收起编辑' : '编辑个人资料'} <span aria-hidden="true">↗</span></button>}
        {readOnly && <p className="meg-muted">进入游戏后可补录姓名、性别与年龄。</p>}
        {saved && <p role="status" className="meg-muted">档案已更新，已写入当前存档。</p>}
      </div>
    </div>
    {editing && !readOnly && <ProfileEditor engine={engine} onDone={didSave => { setEditing(false); setSaved(didSave) }} />}
    {!readOnly && <div className="meg-reputation">
      <div><span className="meg-eyebrow">REPUTATION / 声望</span><strong>{rep > 0 ? '+' : ''}{rep}</strong></div>
      <meter min={-100} max={100} value={rep} aria-label="MEG 声望" />
      <p>{rep <= REP_TIER.banned ? '禁止进入 MEG 据点。' : rep <= REP_TIER.noTalk ? 'MEG 人员拒绝交谈。' : rep <= REP_TIER.noTrade ? 'MEG 人员拒绝交易。' : rep >= REP_TIER.discount ? '信任优待：交易享八折。' : '完成 MEG 委托可积累信任与声望。'}</p>
      <small>敌人 ≤−60 · 不受信任 ≤−30 · 合作人员 ≥20 · 信赖合作 ≥80</small>
    </div>}
    <details className="meg-career"><summary>身份与晋升 <span>查看成长路线与办理条件</span></summary><CareerPanel faction="meg" readOnly={readOnly} /></details>
  </>
}

function MegTasks({ engine, readOnly }: { engine: Engine; readOnly: boolean }) {
  const [filter, setFilter] = useState<'all' | 'active' | 'ready'>('all')
  const quests = readOnly ? [] : engine.quests.filter(q => isMegQuest(q.def))
  const ready = quests.filter(q => megQuestProgress(engine, q).done).length
  const visible = quests.filter(q => filter === 'all' || megQuestProgress(engine, q).done === (filter === 'ready'))
  return <>
    <MegMissionJournal engine={engine} readOnly={readOnly} />
    <div className="meg-section-heading"><div><p className="meg-eyebrow">02 / FIELD ASSIGNMENTS</p><h3>任务档案</h3></div><span className="meg-stamp">{String(quests.length).padStart(2, '0')} 份委托</span></div>
    <p className="meg-muted">通用委托：从 MEG 所属人士处接取的委托归档于此。完成目标后返回交付；通用委托不计入晋升任务线数量。</p>
    <div className="meg-filters" role="group" aria-label="筛选 MEG 任务">
      {([['all', `全部 ${quests.length}`], ['active', `进行中 ${quests.length - ready}`], ['ready', `待交付 ${ready}`]] as const).map(([key, label]) => <button key={key} className="meg-button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
    </div>
    {!visible.length && <div className="meg-empty"><span aria-hidden="true">[ — ]</span><h4>{readOnly ? '尚未连接任务档案' : quests.length ? '此分类暂无委托' : '暂无 MEG 委托'}</h4><p>{readOnly ? '进入游戏后读取本局已接取任务。' : quests.length ? '切换筛选可查看其他委托。' : '前往 Alpha 基地中控室，与「夜莺」交谈接取委托。'}</p></div>}
    <div className="meg-quest-list">{visible.map(q => {
      const progress = megQuestProgress(engine, q)
      return <article className="meg-quest" key={q.def.id}>
        <div className="meg-quest-top"><span className="meg-eyebrow">{q.def.id.toUpperCase()} / {q.def.hard ? '困难委托' : '常规委托'}</span><span className={`meg-status ${progress.done ? 'is-ready' : ''}`}>{progress.done ? '● 待交付' : '◌ 进行中'}</span></div>
        <h4>{q.def.title}</h4><p>{q.def.desc}</p>
        <div className="meg-progress-label"><span>目标进度</span><strong>{progress.label}</strong></div><progress max={100} value={progress.percent} aria-label={`${q.def.title}进度`} />
        <div className="meg-quest-bottom"><span>发起人 / {q.def.issuer?.name ?? 'MEG 探险署（早期委托）'}</span><span>奖励 / 声望 +{q.def.rewardRep}{q.def.rewardCoin > 0 ? ` · ${q.def.faction === 'bntg' ? '压印币' : '天鹰币'} ×${q.def.rewardCoin}` : ''}{q.def.rewardItems.length > 0 ? ` · ${q.def.rewardItems.map(id => ITEMS[id]?.name ?? id).join('、')}` : ''}</span></div>
        <button className="meg-button" aria-pressed={megState(engine).tracked?.kind === 'quest' && megState(engine).tracked?.id === q.def.id} onClick={() => { const t = megState(engine).tracked; trackMegTask(engine, t?.kind === 'quest' && t.id === q.def.id ? null : { kind: 'quest', id: q.def.id }); engine.msg('任务追踪已更新。', 'system') }}>{megState(engine).tracked?.kind === 'quest' && megState(engine).tracked?.id === q.def.id ? '取消右上角追踪' : '在右上角追踪'}</button>
        {progress.done && <p className="meg-ready-note">目标达成，请返回 MEG 探险署中控室交付。</p>}
      </article>
    })}</div>
  </>
}

export default function MegTerminal({ engine, codex, readOnly = false, initialTab = '个人' }: { engine: Engine; codex: Record<string, boolean>; readOnly?: boolean; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [, refresh] = useState(0)
  const id = useId()
  useEffect(() => {
    if (readOnly) return
    const off = engine.on(() => refresh(n => n + 1))
    // 联机时游戏仍在运行，任务进度也须刷新；退出终端后释放订阅。
    const timer = window.setInterval(() => refresh(n => n + 1), 1000)
    return () => { off(); window.clearInterval(timer) }
  }, [engine, readOnly])
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = e.key === 'ArrowRight' ? (index + 1) % 3 : e.key === 'ArrowLeft' ? (index + 2) % 3 : e.key === 'Home' ? 0 : e.key === 'End' ? 2 : -1
    if (next < 0) return
    e.preventDefault(); setTab(TABS[next]); document.getElementById(`${id}-tab-${next}`)?.focus()
  }
  return <section className="meg-terminal" aria-label="MEG 团体终端" style={{ '--meg-accent': FACTIONS.meg.color } as CSSProperties} onKeyDown={e => {
    // 输入姓名、搜索与 Tab 导航不能触发游戏的背包/地图快捷键。
    if (e.key !== 'Escape') e.stopPropagation()
  }}>
    <header className="meg-header">
      <div className="meg-brand"><img src={`${import.meta.env.BASE_URL}textures/faction_meg.png`} alt="MEG 标志" /><div><p className="meg-eyebrow">EXPLORER NETWORK / 人员终端</p><h2>M.E.G.<span>探险者总署</span></h2></div></div>
      <div className="meg-connection"><span>● {readOnly ? '资料预览' : '本地档案已连接'}</span><small>EXPLORE · DOCUMENT · PROTECT</small></div>
    </header>
    <div className="meg-command" aria-hidden="true"><span>meg@terminal:~$</span> open / {TAB_CODES[TABS.indexOf(tab)].toLowerCase()}<b>_</b></div>
    <div className="meg-tabs" role="tablist" aria-label="MEG 终端标签页">{TABS.map((label, i) => <button key={label} id={`${id}-tab-${i}`} role="tab" aria-selected={tab === label} aria-controls={`${id}-panel`} tabIndex={tab === label ? 0 : -1} onKeyDown={e => onTabKey(e, i)} onClick={() => setTab(label)}><span className="meg-tab-index">0{i + 1}</span><span>{label}<small>{TAB_CODES[i]}</small></span><span className="meg-tab-marker" aria-hidden="true">↗</span></button>)}</div>
    <div className="meg-content" id={`${id}-panel`} role="tabpanel" tabIndex={0} aria-labelledby={`${id}-tab-${TABS.indexOf(tab)}`}>
      {tab === '个人' && <MegPersonal engine={engine} readOnly={readOnly} />}
      {tab === '任务' && <MegTasks engine={engine} readOnly={readOnly} />}
      {tab === '联系人' && <><div className="meg-section-heading"><div><p className="meg-eyebrow">03 / CONTACT DIRECTORY</p><h3>联系人档案</h3></div><span className="meg-stamp">已接触人员</span></div><MegContacts engine={engine} codex={codex} /></>}
    </div>
    <footer className="meg-footer"><span>M.E.G. / 探索 · 记录 · 保护</span><a href="https://backrooms-wiki.wikidot.com/the-m-e-g" target="_blank" rel="noreferrer">团体资料 ↗</a><span>END OF RECORD</span></footer>
  </section>
}
