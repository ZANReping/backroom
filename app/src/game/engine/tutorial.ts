// TutorialDirector：数据驱动的教程步骤机（前厅首用；后续「教程任务」复用）。
// 步骤 { id, trigger, hint, complete }：
//   trigger(eng)  —— 前置条件满足才会显示（optional 步骤不满足时跳过，不阻塞后续）
//   hint          —— 提示模板（字符串或按引擎状态返回字符串），{action} 占位符按自定义键位/移动端控件替换
//   complete(eng) —— 完成判定；完成记录写入 player.prologue.flags['tut:<id>']（repeatable 步骤不记录）
// 提示显示在底部纸带上（HUD），不弹窗；移动端额外高亮对应的触控按钮（data-touch-id）。
import type { Engine } from '../engine'
import { bindLabelFor } from '../core/keybinds'

export interface TutorialStep {
  id: string
  trigger: (eng: Engine) => boolean
  hint: string | ((eng: Engine) => string)
  complete: (eng: Engine) => boolean
  /** 旁支提示：不进主线序列、不阻塞后续步骤；满足 trigger 时以独立小提示显示（不占主线纸带）。 */
  optional?: boolean
  /** 不持久化完成记录：每次都重新判定（如低电量提醒）。 */
  repeatable?: boolean
}

export interface TutorialView { id: string; text: string; touch: string[]; index: number; total: number }
export interface TutorialSideView { id: string; text: string; touch: string[] }

/** 动作 → 移动端控件说明与高亮的触控按钮 id。 */
const TOUCH: Record<string, { text: string; id?: string }> = {
  interact: { text: '「交互」键', id: 'attack' },
  attack: { text: '「攻击」键', id: 'attack' },
  crouch: { text: '「蹲」按钮', id: 'crouch' },
  jump: { text: '「跳」按钮', id: 'jump' },
  sprint: { text: '「冲刺」按钮', id: 'sprint' },
  flashlight: { text: '「手电」按钮', id: 'flashlight' },
  inventory: { text: '「背包」按钮', id: 'backpack' },
  phone: { text: '右上「手机」按钮', id: 'phone' },
  move: { text: '左侧摇杆', id: 'stick' },
  look: { text: '在屏幕右半边拖动', id: 'look' },
}
/** 桌面端的组合动作（非单键绑定）。 */
const DESKTOP_COMBO: Record<string, () => string> = {
  move: () => `${['forward', 'left', 'back', 'right'].map(bindLabelFor).join('')} 移动`,
  look: () => '移动鼠标',
}

/** 把 {action} 占位符替换为键位文字；返回文本与需高亮的触控 id。 */
export function formatHint(tpl: string, mobile: boolean): { text: string; touch: string[] } {
  const touch: string[] = []
  const text = tpl.replace(/\{(\w+)\}/g, (_, a: string) => {
    if (mobile) {
      const t = TOUCH[a]
      if (t?.id) touch.push(t.id)
      return t?.text ?? a
    }
    if (DESKTOP_COMBO[a]) return DESKTOP_COMBO[a]()
    return `[${bindLabelFor(a)}]`
  })
  return { text, touch }
}

export class TutorialDirector {
  readonly steps: TutorialStep[]
  /** 主线当前步骤（纸带显示）。 */
  current: TutorialStep | null = null
  /** 旁支提示（optional 步骤；独立小提示，不占主线）。 */
  side: TutorialStep[] = []
  constructor(steps: TutorialStep[]) { this.steps = steps }

  private flags(eng: Engine): Record<string, boolean> | null {
    return eng.player.prologue?.flags ?? null
  }
  done(eng: Engine, id: string): boolean { return !!this.flags(eng)?.['tut:' + id] }

  /** 每帧（或每次 HUD tick）推进：标记已完成步骤，选出主线当前步骤与旁支提示。 */
  update(eng: Engine): TutorialStep | null {
    const flags = this.flags(eng)
    this.current = null
    this.side = []
    if (!flags) return null
    // 旁支：逐条独立判定，不影响主线
    for (const s of this.steps) {
      if (!s.optional) continue
      if (!s.repeatable && flags['tut:' + s.id]) continue
      if (s.complete(eng)) { if (!s.repeatable) flags['tut:' + s.id] = true; continue }
      if (s.trigger(eng)) this.side.push(s)
    }
    // 主线：按顺序，第一条未完成且已触发的步骤
    for (const s of this.steps) {
      if (s.optional) continue
      if (!s.repeatable && flags['tut:' + s.id]) continue
      if (s.complete(eng)) { if (!s.repeatable) flags['tut:' + s.id] = true; continue }
      if (!s.trigger(eng)) return null
      this.current = s
      return s
    }
    return null
  }

  private format(eng: Engine, s: TutorialStep, mobile: boolean) {
    const tpl = typeof s.hint === 'function' ? s.hint(eng) : s.hint
    return formatHint(tpl, mobile)
  }

  view(eng: Engine, mobile: boolean): TutorialView | null {
    const s = this.current
    if (!s) return null
    const { text, touch } = this.format(eng, s, mobile)
    const main = this.steps.filter((v) => !v.optional)
    return { id: s.id, text, touch, index: Math.max(0, main.indexOf(s)) + 1, total: main.length }
  }

  sideViews(eng: Engine, mobile: boolean): TutorialSideView[] {
    return this.side.map((s) => ({ id: s.id, ...this.format(eng, s, mobile) }))
  }
}
