import type { Engine } from '../engine'
import { MEG_MISSIONS, MEG_MISSION_BY_ID, MEG_NPC_PLACES, MEG_PROMOTION_COUNTS, type MegObjective } from '../content/megMissions'
import { NPCS } from '../content/npcs'
import { ITEMS } from '../content/items'
import { CAREERS } from '../content/careers'
import { isMegQuest, megQuestProgress } from '../content/megTerminal'
import { bandOfPlayerZ, floorHeight } from '../world/mapgen'
import { interactionLos3D } from './interact'
import { availableStation, claimRewards, reward, route } from './career'
import { clearFactionTracking } from './factionMissions'

export interface MegMissionProgress {
  stage: number; progress: number; completed: boolean
  points: { x: number; y: number; floor: number }[]; observed: string[]; journal: string[]
}
export interface MegSave {
  version: 1; missions: Record<string, MegMissionProgress>
  tracked: { kind: 'line' | 'quest'; id: string } | null; legacyRank: number
}
export const freshMeg = (): MegSave => ({ version: 1, missions: {}, tracked: null, legacyRank: 0 })
/** Legacy service is a retained qualification, never fabricated mission completions. */
export function megState(eng: Engine): MegSave {
  if (!eng.career.meg) {
    eng.career.meg = freshMeg()
    const old = eng.career.routes.meg
    if (old) { eng.career.meg.legacyRank = Math.max(0, Math.min(4, old.rank)); old.active = false }
  }
  return eng.career.meg
}
export function completedMegLines(eng: Engine) {
  return MEG_MISSIONS.filter(m => megState(eng).missions[m.id]?.completed).length
}
export function megMissionLock(eng: Engine, id: string): string | null {
  const d = MEG_MISSION_BY_ID[id]
  if (!d) return '任务档案不存在。'
  if ((eng.rep.meg ?? 0) <= -60) return 'MEG 当前拒绝交谈。'
  const missing = d.requires.filter(k => !megState(eng).missions[k]?.completed)
  return missing.length ? `先结案：${missing.map(k => MEG_MISSION_BY_ID[k].title).join('、')}` : null
}
export function canMeetMegNpc(eng: Engine, id: string) {
  const n = eng.npcs.find(n => n.id === id && !n.dead && !n.hostile)
  if (!eng.map || !n || (n.def.faction ?? 'meg') !== 'meg' || (eng.rep.meg ?? 0) <= -60) return false
  const band = bandOfPlayerZ(eng.map, eng.player.z)
  return (n.floor ?? 0) === band && Math.hypot(n.x - eng.player.x, n.y - eng.player.y) <= 4 &&
    interactionLos3D(eng, n.x, n.y, floorHeight(eng.map, n.x, n.y, band) + 1, band)
}
export function canAdministerMeg(eng: Engine) {
  return (eng.rep.meg ?? 0) > -60 && (!!availableStation(eng, 'career', 'meg') || !!availableStation(eng, 'training', 'meg') || Object.keys(MEG_NPC_PLACES).some(id => canMeetMegNpc(eng, id)))
}
export function registerMeg(eng: Engine) {
  if (!canAdministerMeg(eng)) return '请在 MEG 登记设施或任务联系人身边办理。'
  route(eng, 'meg').joined = true
  eng.persist()
  return '协作身份已登记。完整任务线结案后可办理晋升。'
}
export function promoteMeg(eng: Engine) {
  if (!canAdministerMeg(eng)) return '请到 MEG 登记设施或任务联系人身边核验履历。'
  const p = route(eng, 'meg'), count = completedMegLines(eng)
  if (!p.joined) return '请先登记 MEG 协作身份。'
  const rank = Math.max(megState(eng).legacyRank, MEG_PROMOTION_COUNTS.filter(n => count >= n).length)
  if (rank <= p.rank) return p.rank >= 4 ? '你已取得最高外勤资格。' : `下一职级需要结案 ${MEG_PROMOTION_COUNTS[p.rank]} 条不同任务线，当前 ${count} 条。`
  p.rank = rank; p.active = false
  const message = `履历核验通过：${CAREERS.meg.ranks[rank - 1]}。已结案 ${count} 条任务线。`
  eng.msg(message, 'system'); eng.persist()
  return message
}
export function trackMegTask(eng: Engine, target: MegSave['tracked']) {
  if (target?.kind === 'line') {
    const p = megState(eng).missions[target.id]
    if (!p || p.completed) return false
  }
  if (target?.kind === 'quest' && !eng.quests.some(q => q.def.id === target.id && isMegQuest(q.def))) return false
  if (target) clearFactionTracking(eng)
  megState(eng).tracked = target
  eng.persist()
  return true
}
export function acceptMegMission(eng: Engine, id: string, npcId: string) {
  const d = MEG_MISSION_BY_ID[id], state = megState(eng)
  if (!d || d.issuer !== npcId || !canMeetMegNpc(eng, npcId)) return '请与任务发起人当面交谈。'
  if (state.missions[id]) return '这条任务线已经接取或结案。'
  const lock = megMissionLock(eng, id)
  if (lock) return lock
  if (Object.values(state.missions).filter(p => !p.completed).length >= 3) return '最多同时办理三条连续任务线，请先结案一条。'
  state.missions[id] = { stage: 0, progress: 0, completed: false, points: [], observed: [], journal: [] }
  clearFactionTracking(eng)
  state.tracked = { kind: 'line', id }
  eng.msg(`接取 MEG 任务线「${d.title}」：${d.stages[0].title}`, 'loot')
  eng.persist()
  return '任务线已登记并显示在右上角。可在团体终端切换追踪。'
}
function advance(eng: Engine, id: string) {
  const d = MEG_MISSION_BY_ID[id], p = megState(eng).missions[id]
  if (p.completed) return
  p.journal.push(d.stages[p.stage].title)
  p.stage++; p.progress = 0; p.points = []; p.observed = []
  runtime.get(eng)?.candidates.delete(id)
  if (p.stage === d.stages.length) {
    p.completed = true
    // The ledger prevents duplicate coins AND reputation, including repeated submissions.
    if (reward(eng, `meg-line:${id}`, [...Array<string>(d.coins).fill('eaglecoin'), ...d.items])) eng.changeRep('meg', d.rep)
    if (megState(eng).tracked?.id === id && megState(eng).tracked?.kind === 'line') megState(eng).tracked = null
    eng.msg(`任务线「${d.title}」结案：${d.ending}`, 'loot')
    eng.emit({ kind: 'toast', text: `MEG 任务线结案 · 累计 ${completedMegLines(eng)} 条` })
  } else {
    eng.msg(`「${d.title}」记录已保存。下一步：${d.stages[p.stage].title}`, 'system')
    eng.emit({ kind: 'toast', text: `MEG：${d.stages[p.stage].title}` })
  }
  eng.persist()
}
export function submitMegStage(eng: Engine, id: string, npcId: string) {
  const d = MEG_MISSION_BY_ID[id], p = megState(eng).missions[id], o = d?.stages[p?.stage]?.objective
  if (!p || p.completed || !o || (o.kind !== 'talk' && o.kind !== 'deliver') || o.npc !== npcId || !canMeetMegNpc(eng, npcId)) return '请找到本阶段指定的联系人当面交接。'
  if (o.kind === 'deliver') {
    if (eng.countItem(o.item) < o.n) return `需要 ${ITEMS[o.item]?.name ?? o.item} ×${o.n}，物资尚未扣除。`
    for (let i = 0; i < o.n; i++) eng.consumeItem(o.item)
  }
  advance(eng, id)
  return p.completed ? d.ending : `已签收。下一步：${d.stages[p.stage].story}`
}
interface Runtime { steps: number; level: number; map: Engine['map']; x: number; y: number; candidates: Map<string, { key: string; time: number }> }
const runtime = new WeakMap<Engine, Runtime>()
export function resetMegRuntime(eng: Engine) { runtime.delete(eng) }

/** Progress is independent of the selected HUD task. No offline/paused timers, teleport or chunk-shift credit. */
export function updateMegMissions(eng: Engine, dt: number) {
  const p = eng.player, m = eng.map
  if (!m || p.hp <= 0 || !(dt > 0)) return
  const x = p.x + (m.inf?.ox ?? 0), y = p.y + (m.inf?.oy ?? 0)
  let last = runtime.get(eng)
  if (!last) { last = { steps: p.steps, level: p.level, map: m, x, y, candidates: new Map() }; runtime.set(eng, last) }
  const same = last.level === p.level && last.map === m
  const delta = same ? Math.max(0, Math.min(p.steps - last.steps, dt * 12)) : 0
  const moved = Math.hypot(x - last.x, y - last.y)
  if (!same) last.candidates.clear()
  last.level = p.level; last.map = m; last.steps = p.steps; last.x = x; last.y = y
  for (const d of MEG_MISSIONS) {
    const progress = megState(eng).missions[d.id]
    if (!progress || progress.completed) continue
    const o = d.stages[progress.stage]?.objective
    if (!o || !('level' in o)) continue
    if (o.level !== p.level) { last.candidates.delete(d.id); continue }
    if (o.kind === 'walk') {
      progress.progress = Math.min(o.n, progress.progress + delta)
      if (progress.progress >= o.n) advance(eng, d.id)
      continue
    }
    const floor = bandOfPlayerZ(m, p.z)
    let key: string | undefined
    if (o.kind === 'record' && same && moved < .08 && Math.abs(p.vz) < .1 && !eng.input.mx && !eng.input.my && progress.points.every(q => q.floor !== floor || Math.hypot(q.x - x, q.y - y) >= 12)) key = `${Math.round(x)},${Math.round(y)},${floor}`
    if (o.kind === 'observe') {
      const target = m.structures.find(s => {
        if (!o.kinds.includes(s.kind)) return false
        const sx = s.x + s.w / 2, sy = s.y + s.h / 2
        const identity = `${s.kind}:${sx + (m.inf?.ox ?? 0)}:${sy + (m.inf?.oy ?? 0)}:${s.floor ?? 0}`
        if (progress.observed.includes(identity) || (s.floor ?? 0) !== floor || Math.hypot(sx - p.x, sy - p.y) > 5) return false
        if (!interactionLos3D(eng, sx, sy, floorHeight(m, sx, sy, floor) + 1, floor, s)) return false
        key = identity
        return true
      })
      if (!target) key = undefined
    }
    if (!key) { last.candidates.delete(d.id); continue }
    const candidate = last.candidates.get(d.id)
    const time = candidate?.key === key ? candidate.time + Math.min(dt, .25) : 0
    last.candidates.set(d.id, { key, time })
    if (time < 3) continue
    if (o.kind === 'record') progress.points.push({ x, y, floor })
    else progress.observed.push(key)
    progress.progress++
    last.candidates.delete(d.id)
    if (progress.progress >= o.n) advance(eng, d.id)
    else { eng.msg(`「${d.title}」已记录 ${progress.progress}/${o.n}。`, 'system'); eng.persist() }
  }
  const tracked = megState(eng).tracked
  if (tracked?.kind === 'quest' && !eng.quests.some(q => q.def.id === tracked.id)) megState(eng).tracked = null
}
export function megObjectiveText(o: MegObjective) {
  if (o.kind === 'walk') return `Level ${o.level} · 实际步行 ${o.n} 米`
  if (o.kind === 'record') return `Level ${o.level} · ${o.n} 个测点，每处静止 3 秒，测点相距 ≥12 米`
  if (o.kind === 'observe') return `Level ${o.level} · 观察 ${o.n} 处不同${o.subject}，5 米内保持视线 3 秒`
  const npc = NPCS[o.npc]?.name ?? o.npc
  return `${o.kind === 'deliver' ? `交付 ${ITEMS[o.item]?.name ?? o.item} ×${o.n}` : '当面交谈'} → ${npc} · ${MEG_NPC_PLACES[o.npc]}`
}
export function megStageProgress(eng: Engine, id: string) {
  const p = megState(eng).missions[id], d = MEG_MISSION_BY_ID[id], o = d?.stages[p?.stage]?.objective
  if (!o || p.completed) return { value: 1, max: 1, label: '已结案', hint: '' }
  const max = 'n' in o ? o.n : 1
  const value = o.kind === 'deliver' ? Math.min(max, eng.countItem(o.item)) : p.progress
  return { value, max, label: `${Math.floor(value)} / ${max}${o.kind === 'walk' ? ' 米' : ''}`, hint: megObjectiveText(o) }
}
export function trackedMegSummary(eng: Engine) {
  const t = megState(eng).tracked
  if (!t) return null
  if (t.kind === 'quest') {
    const q = eng.quests.find(q => q.def.id === t.id)
    if (!q) return null
    const p = megQuestProgress(eng, q)
    return { title: q.def.title, chapter: '通用委托', objective: p.done ? '目标达成 · 返回 Alpha 中控室向夜莺交付' : q.def.desc, label: p.label, percent: p.percent }
  }
  const d = MEG_MISSION_BY_ID[t.id], p = megState(eng).missions[t.id]
  if (!d || !p || p.completed) return null
  const s = megStageProgress(eng, t.id)
  return { title: d.title, chapter: `${p.stage + 1}/${d.stages.length} · ${d.stages[p.stage].title}`, objective: s.hint, label: s.label, percent: s.value / s.max * 100 }
}
export { claimRewards }
