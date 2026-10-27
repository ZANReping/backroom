// 层级任务系统（LevelQuestDirector）：数据驱动的「任务 → 目标」两级结构，按层级挂在 HUD 任务面板上。
// 写法参照 TutorialDirector（engine/tutorial.ts）：定义表 + 每次 tick 推进；目标文字同样支持 {action}
// 占位符（复用 formatHint，桌面显示自定义键位，移动端显示触控按钮名）。
//
// 定义（content/levelQuestsL0.ts 等）：
//   LevelQuestDef { id, level, title, visible(显示条件), objectives[], reward(完成奖励) }
//   QuestObjectiveDef { id, text, target(计数目标), progress(计数), check(每 tick 判定), onEvent(事件判定),
//                       optional(可选目标), visible(未满足时隐藏且不可完成) }
// 进度：player.levelQuests（随存档；缺省=空进度，旧存档自动补齐）。
// 任务完成 = 所有「非可选」目标完成；可选目标不阻塞完成，任务完成后不再可完成。
import type { Engine } from '../engine'
import { formatHint } from './tutorial'
import { itemName } from '../content/items'
import { audio } from '../core/audio'

/** 存档结构（写入 player.levelQuests）。 */
export interface LevelQuestRecord {
  /** 已满足显示条件（一经显示保持显示，直到完成）。 */
  revealed?: boolean
  done?: boolean
  /** 完成奖励已发放。 */
  rewarded?: boolean
  /** 已完成的目标 id → true。 */
  obj: Record<string, boolean>
}
export interface LevelQuestState {
  v: 1
  quests: Record<string, LevelQuestRecord>
  /** 世界事实记录：去过的 Level 0 区域类型（L0_MAP_KEY id）。 */
  l0Regions: number[]
  /** 当前所在的 Level 0 子层级 id（null=不在子层级）。子层级尚未制作，目前只能由开发调试入口模拟进入。 */
  sublevel: string | null
  /** 到过的子层级 id。 */
  sublevelsSeen: string[]
  /** 其他一次性事实（如 'leave:0' 离开过 Level 0、'photo:l0red' 拍到红室入口）。 */
  flags: Record<string, boolean>
}

export type QuestEvent =
  | { t: 'leaveLevel'; from: number; to: number }
  | { t: 'photo'; subject: string | null }
  | { t: 'enterSublevel'; id: string }

export interface QuestCtx { eng: Engine; st: LevelQuestState; rec: LevelQuestRecord }

export interface QuestObjectiveDef {
  id: string
  /** 目标文字（支持 {action} 键位占位符）。 */
  text: string | ((c: QuestCtx) => string)
  /** 计数目标（显示「n/target」）；配合 progress 使用。 */
  target?: number
  progress?: (c: QuestCtx) => number
  /** 每 tick 判定是否完成（progress>=target 也算完成）。 */
  check?: (c: QuestCtx) => boolean
  /** 事件判定：返回 true 即完成（只在目标可见时调用）。 */
  onEvent?: (ev: QuestEvent, c: QuestCtx) => boolean
  /** 可选目标：面板标注「可选」，不阻塞任务完成。 */
  optional?: boolean
  /** 显示条件：不满足时隐藏且不能完成。 */
  visible?: (c: QuestCtx) => boolean
}

export interface LevelQuestDef {
  id: string
  /** 所属层级（面板只显示当前层级的任务）。 */
  level: number
  title: string
  /** 显示条件（缺省=进入该层级即显示）。 */
  visible?: (c: QuestCtx) => boolean
  objectives: QuestObjectiveDef[]
  reward?: { item?: string; count?: number; text?: string }
}

export interface QuestObjectiveView { id: string; text: string; done: boolean; optional: boolean; count?: string; pulse: boolean }
export interface QuestView { id: string; level: number; title: string; done: boolean; objectives: QuestObjectiveView[]; pulse: boolean }

export function newLevelQuestState(): LevelQuestState {
  return { v: 1, quests: {}, l0Regions: [], sublevel: null, sublevelsSeen: [], flags: {} }
}
/** 读档兼容：缺字段时补齐。 */
export function levelQuestState(eng: Engine): LevelQuestState {
  const p = eng.player
  const st = (p.levelQuests ??= newLevelQuestState())
  st.quests ??= {}; st.l0Regions ??= []; st.sublevelsSeen ??= []; st.flags ??= {}
  if (st.sublevel === undefined) st.sublevel = null
  return st
}

const PULSE_MS = 2600
/** 任务/目标刚完成的时间戳（performance.now；HUD 高亮动画用，不入存档）。 */
const pulses = new Map<string, number>()
/** 本次运行中刚完成的任务（完成后面板保留数秒再收起；不入存档）。 */
const doneAt = new Map<string, number>()
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export class LevelQuestDirector {
  readonly defs: LevelQuestDef[]
  private acc = 0
  /** 每 tick 前调用的世界探针（记录区域、子层级等事实；按层级注册）。 */
  private probes: ((eng: Engine, st: LevelQuestState) => void)[] = []
  constructor(defs: LevelQuestDef[], probes: ((eng: Engine, st: LevelQuestState) => void)[] = []) {
    this.defs = defs
    this.probes = probes
  }

  private ctx(eng: Engine, st: LevelQuestState, q: LevelQuestDef): QuestCtx {
    return { eng, st, rec: (st.quests[q.id] ??= { obj: {} }) }
  }
  private objVisible(o: QuestObjectiveDef, c: QuestCtx) { return !o.visible || o.visible(c) }
  private objText(o: QuestObjectiveDef, c: QuestCtx, mobile: boolean) {
    const tpl = typeof o.text === 'function' ? o.text(c) : o.text
    return formatHint(tpl, mobile).text
  }

  private notify(eng: Engine, text: string, kind: 'lore' | 'system' = 'lore') {
    eng.msg(text, kind)
    eng.emit({ kind: 'toast', text })
  }

  private completeObjective(eng: Engine, q: LevelQuestDef, o: QuestObjectiveDef, c: QuestCtx) {
    c.rec.obj[o.id] = true
    pulses.set(`${q.id}:${o.id}`, now())
    this.notify(eng, `目标完成 · ${this.objText(o, c, false).replace(/（.*?）$/, '')}`)
    try { audio.uiTick() } catch { /* 无音频上下文（测试） */ }
  }

  /** 发放奖励：背包满时保留待领，下次 tick 重试。 */
  private grant(eng: Engine, q: LevelQuestDef, c: QuestCtx) {
    const r = q.reward
    if (!r || c.rec.rewarded) return
    if (r.item) {
      const n = Math.max(1, r.count ?? 1)
      for (let k = 0; k < n; k++) {
        if (!eng.addItem(r.item)) {
          if (!c.st.flags['rewardFull:' + q.id]) { c.st.flags['rewardFull:' + q.id] = true; eng.msg(`背包满了——空出一格来收下「${itemName(r.item)}」。`, 'system') }
          return
        }
      }
      try { audio.pickup(true) } catch { /* 测试环境 */ }
      this.notify(eng, r.text ?? `获得 ${itemName(r.item)}${n > 1 ? ' ×' + n : ''}`)
    }
    c.rec.rewarded = true
    delete c.st.flags['rewardFull:' + q.id]
  }

  /** 推进一次：显示条件、目标判定、任务完成与奖励。 */
  evaluate(eng: Engine, ev?: QuestEvent) {
    const st = levelQuestState(eng)
    for (const q of this.defs) {
      const c = this.ctx(eng, st, q)
      if (c.rec.done) { if (!c.rec.rewarded) this.grant(eng, q, c); continue }
      if (!c.rec.revealed) {
        if (q.visible && !q.visible(c)) continue
        if (!q.visible && eng.player.level !== q.level) continue
        c.rec.revealed = true
        pulses.set(q.id, now())
        this.notify(eng, `新任务 · ${q.title}`)
      }
      for (const o of q.objectives) {
        if (c.rec.obj[o.id] || !this.objVisible(o, c)) continue
        let hit = false
        if (ev && o.onEvent) hit = o.onEvent(ev, c)
        if (!hit && o.check) hit = o.check(c)
        if (!hit && o.progress && o.target) hit = o.progress(c) >= o.target
        if (hit) this.completeObjective(eng, q, o, c)
      }
      if (q.objectives.every((o) => o.optional || c.rec.obj[o.id])) {
        c.rec.done = true
        doneAt.set(q.id, now())
        pulses.set(q.id, now())
        this.notify(eng, `任务完成 · ${q.title}`)
        this.grant(eng, q, c)
      }
    }
  }

  /** 每帧调用（内部节流约 5 次/秒）。 */
  update(eng: Engine, dt: number) {
    this.acc += dt
    if (this.acc < 0.2) return
    this.acc = 0
    const st = levelQuestState(eng)
    for (const p of this.probes) p(eng, st)
    this.evaluate(eng)
  }

  /** 事件入口（离开层级、拍照、进入子层级……）。 */
  event(eng: Engine, ev: QuestEvent) {
    const st = levelQuestState(eng)
    if (ev.t === 'leaveLevel') st.flags['leave:' + ev.from] = true
    this.evaluate(eng, ev)
  }

  /** HUD 面板：当前层级已显示的任务（完成后保留数秒）。 */
  views(eng: Engine, mobile: boolean, level = eng.player.level): QuestView[] {
    const st = levelQuestState(eng)
    const t = now()
    const out: QuestView[] = []
    for (const q of this.defs) {
      if (q.level !== level) continue
      const c = this.ctx(eng, st, q)
      if (!c.rec.revealed) continue
      if (c.rec.done && !(t - (doneAt.get(q.id) ?? -1e9) < 6000)) continue
      const objectives: QuestObjectiveView[] = []
      for (const o of q.objectives) {
        const done = !!c.rec.obj[o.id]
        if (!done && !this.objVisible(o, c)) continue
        if (c.rec.done && o.optional && !done) continue
        const count = o.target ? `${Math.min(o.target, done ? o.target : Math.floor(o.progress?.(c) ?? 0))}/${o.target}` : undefined
        objectives.push({ id: o.id, text: this.objText(o, c, mobile), done, optional: !!o.optional, count, pulse: t - (pulses.get(`${q.id}:${o.id}`) ?? -1e9) < PULSE_MS })
      }
      out.push({ id: q.id, level: q.level, title: q.title, done: !!c.rec.done, objectives, pulse: t - (pulses.get(q.id) ?? -1e9) < PULSE_MS })
    }
    return out
  }

  /** QA/调试：任务与目标完成情况。 */
  debug(eng: Engine) {
    const st = levelQuestState(eng)
    return this.defs.map((q) => {
      const c = this.ctx(eng, st, q)
      return { id: q.id, revealed: !!c.rec.revealed, done: !!c.rec.done, rewarded: !!c.rec.rewarded, obj: q.objectives.map((o) => ({ id: o.id, done: !!c.rec.obj[o.id], visible: this.objVisible(o, c), progress: o.progress ? o.progress(c) : undefined })) }
    })
  }
}

/** 测试用：清空运行期高亮/完成时间。 */
export function resetQuestPulses() { pulses.clear(); doneAt.clear() }
