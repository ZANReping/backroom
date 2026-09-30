import type { Engine } from '../engine'
import { FACTION_MISSIONS, FACTION_MISSION_BY_ID, FACTION_NPC_PLACES, type FactionObjective } from '../content/factionMissions'
import { FACTION_TERMINALS, NEW_FACTIONS, questFaction, type NewFaction } from '../content/factionTerminals'
import { MEG_PROMOTION_COUNTS } from '../content/megMissions'
import type { MegMissionProgress, MegSave } from './megMissions'
import { NPCS } from '../content/npcs'
import { ITEMS } from '../content/items'
import { CAREERS } from '../content/careers'
import { megQuestProgress } from '../content/megTerminal'
import { availableStation, reward, route, SERVICE_LABELS } from './career'
import { interactionLos3D } from './interact'
import { bandOfPlayerZ, floorHeight } from '../world/mapgen'
import { migrateBntg, VAULT_SLOTS } from './bntg'

export interface FactionProgress extends MegMissionProgress { vaultBaseline?: number }
export interface FactionSave extends Omit<MegSave, 'missions'> { missions: Record<string, FactionProgress> }
export function factionState(eng: Engine, faction: NewFaction): FactionSave {
  const states = eng.career.factions ??= {}
  if (!states[faction]) {
    const old = eng.career.routes[faction]
    states[faction] = { version: 1, missions: {}, tracked: null, legacyRank: Math.max(0, Math.min(4, old?.rank ?? 0)) }
    if (old) old.active = false
  }
  return states[faction]!
}
export const completedFactionLines = (eng: Engine, f: NewFaction) => FACTION_MISSIONS.filter(d => d.faction === f && factionState(eng, f).missions[d.id]?.completed).length
export const factionCanTalk = (eng: Engine, f: NewFaction) => (eng.rep[f] ?? 0) > (f === 'jerry' ? -10 : -60)
export function factionMissionLock(eng: Engine, id: string): string | null {
  const d = FACTION_MISSION_BY_ID[id]
  if (!d) return '任务档案不存在。'
  if (!factionCanTalk(eng, d.faction)) return '该团体当前拒绝交谈。'
  const missing = d.requires.filter(k => !factionState(eng, d.faction).missions[k]?.completed)
  return missing.length ? `先结案：${missing.map(k => FACTION_MISSION_BY_ID[k].title).join('、')}` : null
}
export function canMeetFactionNpc(eng: Engine, id: string, f: NewFaction) {
  const n = eng.npcs.find(n => n.id === id && !n.dead && !n.hostile)
  if (!eng.map || !n || n.def.faction !== f || !factionCanTalk(eng, f)) return false
  const band = bandOfPlayerZ(eng.map, eng.player.z)
  return (n.floor ?? 0) === band && Math.hypot(n.x - eng.player.x, n.y - eng.player.y) <= 4 && interactionLos3D(eng, n.x, n.y, floorHeight(eng.map, n.x, n.y, band) + 1, band)
}
export function canAdministerFaction(eng: Engine, f: NewFaction) {
  return factionCanTalk(eng, f) && (!!availableStation(eng, 'career', f) || FACTION_MISSIONS.some(d => d.faction === f && canMeetFactionNpc(eng, d.issuer, f)))
}
export function registerFaction(eng: Engine, f: NewFaction) {
  if (!canAdministerFaction(eng, f)) return '请在该团体登记设施或任务联系人身边办理。'
  factionState(eng, f); route(eng, f).joined = true; eng.persist()
  return '协作身份已登记。完成整条任务线后可办理晋升。'
}
export function promoteFaction(eng: Engine, f: NewFaction) {
  if (!canAdministerFaction(eng, f)) return '请到该团体登记设施或任务联系人身边核验履历。'
  const p = route(eng, f), count = completedFactionLines(eng, f)
  if (!p.joined) return '请先登记该团体协作身份。'
  const rank = Math.max(factionState(eng, f).legacyRank, MEG_PROMOTION_COUNTS.filter(n => count >= n).length)
  if (rank <= p.rank) return p.rank >= 4 ? '已取得最高资格。' : `下一职级需结案 ${MEG_PROMOTION_COUNTS[p.rank]} 条不同任务线，当前 ${count} 条。`
  p.rank = rank; p.active = false
  const message = `履历核验通过：${CAREERS[f].ranks[rank - 1]}。`
  eng.msg(message, 'system'); eng.persist(); return message
}
/** One selected HUD task across all four terminals. Progress never depends on selection. */
export function clearFactionTracking(eng: Engine) {
  for (const state of Object.values(eng.career.factions ?? {})) if (state) state.tracked = null
}
export function trackFactionTask(eng: Engine, f: NewFaction, target: FactionSave['tracked']) {
  const state = factionState(eng, f)
  if (target?.kind === 'line' && (!state.missions[target.id] || state.missions[target.id].completed)) return false
  if (target?.kind === 'quest' && !eng.quests.some(q => q.def.id === target.id && questFaction(q.def) === f)) return false
  if (target) { clearFactionTracking(eng); if (eng.career.meg) eng.career.meg.tracked = null }
  state.tracked = target; eng.persist(); return true
}
export function acceptFactionMission(eng: Engine, id: string, npcId: string) {
  const d = FACTION_MISSION_BY_ID[id]
  if (!d || d.issuer !== npcId || !canMeetFactionNpc(eng, npcId, d.faction)) return '请与任务发起人当面交谈。'
  const state = factionState(eng, d.faction), lock = factionMissionLock(eng, id)
  if (state.missions[id]) return '这条任务线已接取或结案。'
  if (lock) return lock
  if (Object.values(state.missions).filter(p => !p.completed).length >= 3) return '该团体最多同时办理三条连续任务线，请先结案一条。'
  state.missions[id] = { stage: 0, progress: 0, completed: false, points: [], observed: [], journal: [] }
  trackFactionTask(eng, d.faction, { kind: 'line', id })
  eng.msg(`接取 ${FACTION_TERMINALS[d.faction].short} 任务线「${d.title}」`, 'loot')
  return '已登记并显示在右上角；可在团体任务页切换追踪。'
}
function advance(eng: Engine, id: string) {
  const d = FACTION_MISSION_BY_ID[id], state = factionState(eng, d.faction), p = state.missions[id]
  if (p.completed) return
  p.journal.push(d.stages[p.stage].title); p.stage++; p.progress = 0; p.points = []; p.observed = []
  runtime.get(eng)?.candidates.delete(id)
  if (p.stage >= d.stages.length) {
    p.completed = true
    const coin = FACTION_TERMINALS[d.faction].coin
    if (reward(eng, `faction-line:${id}`, [...(coin ? Array<string>(d.coins).fill(coin) : []), ...d.items])) eng.changeRep(d.faction, d.rep)
    if (state.tracked?.kind === 'line' && state.tracked.id === id) state.tracked = null
    eng.msg(`「${d.title}」结案：${d.ending}`, 'loot')
  } else eng.msg(`「${d.title}」已保存。下一步：${d.stages[p.stage].title}`, 'system')
  eng.emit({ kind: 'toast', text: `${FACTION_TERMINALS[d.faction].short} · ${p.completed ? '任务线结案' : d.stages[p.stage].title}` })
  eng.persist()
}
export function submitFactionStage(eng: Engine, id: string, npcId: string) {
  const d = FACTION_MISSION_BY_ID[id], p = d && factionState(eng, d.faction).missions[id], o = d?.stages[p?.stage]?.objective
  if (!p || p.completed || !o || !('npc' in o) || o.npc !== npcId || !canMeetFactionNpc(eng, npcId, d.faction)) return '请找到本阶段指定联系人当面交接。'
  if (o.kind === 'deliver') {
    if (eng.countItem(o.item) < o.n) return `需要 ${ITEMS[o.item]?.name ?? o.item} ×${o.n}；物资尚未扣除。`
    for (let i = 0; i < o.n; i++) eng.consumeItem(o.item)
  }
  if (o.kind === 'rite' && !eng.jerryTamed) eng.indoctrination = Math.min(100, eng.indoctrination + o.influence)
  advance(eng, id)
  return p.completed ? d.ending : `已签收。下一步：${d.stages[p.stage].story}`
}
export function performFactionStation(eng: Engine, id: string) {
  const d = FACTION_MISSION_BY_ID[id], p = d && factionState(eng, d.faction).missions[id], o = d?.stages[p?.stage]?.objective
  if (!p || p.completed || o?.kind !== 'station') return '没有待办工位操作。'
  if (!factionCanTalk(eng, d.faction) || eng.player.level !== o.level || !availableStation(eng, o.service, d.faction)) return `请抵达 Level ${o.level} 的${SERVICE_LABELS[o.service] ?? o.service}工位。`
  if (o.manifest) {
    const cargo = eng.map?.structures.filter(c => c.data?.manifest === 'TH-001') ?? []
    if (cargo.length !== 3 || cargo.reduce((n, c) => n + Number(c.data?.quantity ?? 0), 0) !== 3 || cargo.some(c => c.data?.seal !== 'S-014')) return '实物、数量或封签与 TH-001 不符，请保留现场。'
  }
  const label = o.actions[p.progress]
  if (!label) return '本工序已记录。'
  p.progress++
  if (p.progress >= o.actions.length) advance(eng, id)
  else eng.persist()
  return `已记录：${label}`
}
/** Read-only helpers also serve the shared warehouse simulation and multiplayer presence. */
export function hasFactionFieldwork(eng: Engine, f: NewFaction) {
  return FACTION_MISSIONS.some(d => d.faction === f && !!eng.career.factions?.[f]?.missions[d.id] && !eng.career.factions[f]!.missions[d.id].completed)
}
export function hasVaultMission(eng: Engine) {
  return FACTION_MISSIONS.some(d => { const p = eng.career.factions?.bntg?.missions[d.id]; return p && !p.completed && d.stages[p.stage]?.objective.kind === 'vault' })
}
interface Runtime { career: Engine['career']; steps: number; level: number; map: Engine['map']; x: number; y: number; candidates: Map<string, { key: string; time: number }> }
const runtime = new WeakMap<Engine, Runtime>()
export function updateFactionMissions(eng: Engine, dt: number) {
  const p = eng.player, m = eng.map
  if (!m || p.hp <= 0 || eng.paused || !(dt > 0)) return
  const x = p.x + (m.inf?.ox ?? 0), y = p.y + (m.inf?.oy ?? 0)
  let last = runtime.get(eng)
  if (!last || last.career !== eng.career) { last = { career: eng.career, steps: p.steps, level: p.level, map: m, x, y, candidates: new Map() }; runtime.set(eng, last) }
  const same = last.level === p.level && last.map === m
  const delta = same ? Math.max(0, Math.min(p.steps - last.steps, dt * 12)) : 0, moved = Math.hypot(x - last.x, y - last.y)
  if (!same) last.candidates.clear()
  last.level = p.level; last.map = m; last.steps = p.steps; last.x = x; last.y = y
  for (const d of FACTION_MISSIONS) {
    const progress = factionState(eng, d.faction).missions[d.id]
    if (!progress || progress.completed) continue
    const o = d.stages[progress.stage]?.objective
    if (!o || !('level' in o)) continue
    if (o.level !== p.level) { last.candidates.delete(d.id); continue }
    if (o.kind === 'walk') { progress.progress = Math.min(o.n, progress.progress + delta); if (progress.progress >= o.n) advance(eng, d.id); continue }
    const floor = bandOfPlayerZ(m, p.z)
    let key: string | undefined
    if (o.kind === 'record' && same && moved < .08 && Math.abs(p.vz) < .1 && !eng.input.mx && !eng.input.my && progress.points.every(q => q.floor !== floor || Math.hypot(q.x - x, q.y - y) >= 12)) key = `${Math.round(x)},${Math.round(y)},${floor}`
    if (o.kind === 'observe' || o.kind === 'vault') {
      const v = o.kind === 'vault' ? (eng.mpSession?.started ? eng.mpSession.tradeVault : migrateBntg(eng).vault) : undefined
      const target = m.structures.find(s => {
        if (o.kind === 'observe' ? !o.kinds.includes(s.kind) : s.kind !== 'trade_anomaly' || s.data?.cargoId === undefined) return false
        let sx = s.x + s.w / 2, sy = s.y + s.h / 2
        let identity = `${s.kind}:${sx + (m.inf?.ox ?? 0)}:${sy + (m.inf?.oy ?? 0)}:${s.floor ?? 0}`
        if (o.kind === 'vault') {
          const index = Number(s.data?.cargoId), pos = v && VAULT_SLOTS[v.slots[index]]
          if (!v || !pos || v.phase > 0 || s.data?.hidden || (o.mode === 'migrated' && v.sequence <= (progress.vaultBaseline ?? -1))) return false
          sx = pos.x; sy = pos.y; identity = `cargo:${index}`
        }
        if (progress.observed.includes(identity) || (s.floor ?? 0) !== floor || Math.hypot(sx - p.x, sy - p.y) > (o.kind === 'vault' ? 2.8 : 5)) return false
        if (!interactionLos3D(eng, sx, sy, floorHeight(m, sx, sy, floor) + 1, floor, s)) return false
        key = identity; return true
      })
      if (!target) key = undefined
      if (key && o.kind === 'vault' && o.mode === 'baseline') progress.vaultBaseline = v!.sequence
    }
    if (!key) { last.candidates.delete(d.id); continue }
    const candidate = last.candidates.get(d.id), time = candidate?.key === key ? candidate.time + Math.min(dt, .25) : 0
    last.candidates.set(d.id, { key, time }); if (time < 3) continue
    if (o.kind === 'record') progress.points.push({ x, y, floor }); else progress.observed.push(key)
    progress.progress++; last.candidates.delete(d.id)
    if ('n' in o && progress.progress >= o.n) advance(eng, d.id)
    else { eng.msg(`「${d.title}」已记录 ${progress.progress}/${'n' in o ? o.n : 1}。`, 'system'); eng.persist() }
  }
  for (const f of NEW_FACTIONS) { const st = factionState(eng, f); if (st.tracked?.kind === 'quest' && !eng.quests.some(q => q.def.id === st.tracked!.id)) st.tracked = null }
}
export function factionObjectiveText(o: FactionObjective) {
  if (o.kind === 'walk') return `Level ${o.level} · 实际步行 ${o.n} 米`
  if (o.kind === 'record') return `Level ${o.level} · ${o.n} 个记录点，每处静止 3 秒，间距 ≥12 米`
  if (o.kind === 'observe') return `Level ${o.level} · 观察 ${o.n} 处${o.subject}，5 米内保持视线 3 秒`
  if (o.kind === 'station') return `Level ${o.level} · ${SERVICE_LABELS[o.service] ?? o.service}工位，依次完成 ${o.actions.length} 项操作（靠近工位按 E）`
  if (o.kind === 'vault') return `商人之家保险库 · ${o.mode === 'baseline' ? '记录三个编号箱基线' : '等待迁移后复核三个编号箱'}；2.8 米内保持视线 3 秒`
  return `${o.kind === 'deliver' ? `交付 ${ITEMS[o.item]?.name ?? o.item} ×${o.n}` : o.kind === 'rite' ? `确认参加仪式 · 未驯服时教化 +${o.influence}` : '当面交谈'} → ${NPCS[o.npc]?.name ?? o.npc} · ${FACTION_NPC_PLACES[o.npc] ?? '团体据点'}`
}
export function factionStageProgress(eng: Engine, id: string) {
  const d = FACTION_MISSION_BY_ID[id], p = factionState(eng, d.faction).missions[id], o = d.stages[p?.stage]?.objective
  if (!o || p.completed) return { value: 1, max: 1, label: '已结案', hint: '' }
  const max = o.kind === 'station' ? o.actions.length : 'n' in o ? o.n : 1
  const value = o.kind === 'deliver' ? Math.min(max, eng.countItem(o.item)) : p.progress
  return { value, max, label: `${Math.floor(value)} / ${max}${o.kind === 'walk' ? ' 米' : ''}`, hint: factionObjectiveText(o) }
}
export function trackedFactionSummary(eng: Engine) {
  for (const f of NEW_FACTIONS) {
    const state = eng.career.factions?.[f], t = state?.tracked
    if (!t) continue
    if (t.kind === 'quest') {
      const q = eng.quests.find(q => q.def.id === t.id && questFaction(q.def) === f)
      if (!q) continue
      const p = megQuestProgress(eng, q)
      return { faction: f, title: q.def.title, chapter: '通用委托', objective: p.done ? '目标达成 · 返回所属团体交付点' : q.def.desc, label: p.label, percent: p.percent }
    }
    const d = FACTION_MISSION_BY_ID[t.id], p = state!.missions[t.id]
    if (!d || !p || p.completed) continue
    const s = factionStageProgress(eng, t.id)
    return { faction: f, title: d.title, chapter: `${p.stage + 1}/${d.stages.length} · ${d.stages[p.stage].title}`, objective: s.hint, label: s.label, percent: s.value / s.max * 100 }
  }
  return null
}
