// v18：PC 自定义键位绑定（localStorage 持久：br_keybinds）
// 绑定值为输入码：键盘 KeyboardEvent.code（KeyW/Space/ShiftLeft…）、
// 鼠标 Mouse0/1/2（左/中/右键）、滚轮 WheelUp/WheelDown。
import { storage } from './storage'

export interface BindActionDef { id: string; label: string }

export const BIND_ACTIONS: BindActionDef[] = [
  { id: 'forward', label: '前进' },
  { id: 'back', label: '后退' },
  { id: 'left', label: '左移' },
  { id: 'right', label: '右移' },
  { id: 'jump', label: '跳跃' },
  { id: 'crouch', label: '蹲伏' },
  { id: 'attack', label: '攻击' },
  { id: 'interact', label: '交互' },
  { id: 'flashlight', label: '手电' },
  { id: 'inventory', label: '背包' },
  { id: 'map', label: '地图' },
  { id: 'sprint', label: '冲刺' },
  { id: 'quickuse', label: '快捷使用' },
  { id: 'quickdrop', label: '快捷丢弃' },
  { id: 'slot1', label: '快捷栏 1' },
  { id: 'slot2', label: '快捷栏 2' },
  { id: 'slot3', label: '快捷栏 3' },
  { id: 'slot4', label: '快捷栏 4' },
  { id: 'slot5', label: '快捷栏 5' },
  { id: 'slot6', label: '快捷栏 6' },
  { id: 'slot7', label: '快捷栏 7' },
]

export type KeyBindMap = Record<string, string>

// 默认值与历史键位一致（WASD/空格跳/C蹲/左键攻击/E交互/F手电/I背包/Shift冲刺/右键使用/1-8快捷栏）
export const DEFAULT_KEYBINDS: KeyBindMap = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', crouch: 'KeyC',
  attack: 'Mouse0', interact: 'KeyE', flashlight: 'KeyF',
  inventory: 'KeyI', map: 'KeyM', sprint: 'ShiftLeft', quickuse: 'Mouse2', quickdrop: 'KeyQ',
  slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4',
  slot5: 'Digit5', slot6: 'Digit6', slot7: 'Digit7',
}

// 始终生效的辅助键（不算绑定、不参与冲突）：方向键移动 / Ctrl 蹲伏 / Tab 背包
export const AUX_KEYS = {
  forward: ['ArrowUp'], back: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
  crouch: ['ControlLeft', 'ControlRight'], inventory: ['Tab'],
} as const

const STORAGE_KEY = 'br_keybinds'
let cache: KeyBindMap | null = null

export function getKeybinds(): KeyBindMap {
  if (!cache) {
    cache = { ...DEFAULT_KEYBINDS }
    try {
      const saved = JSON.parse(storage.get(STORAGE_KEY) ?? '{}') as KeyBindMap
      for (const a of BIND_ACTIONS) if (typeof saved[a.id] === 'string' && saved[a.id]) cache[a.id] = saved[a.id]
    } catch { /* 损坏数据回退默认 */ }
  }
  return cache
}

function persist() {
  storage.set(STORAGE_KEY, JSON.stringify(getKeybinds()))
}

export function setKeybind(action: string, code: string) {
  getKeybinds()[action] = code
  persist()
}

export function resetKeybinds() {
  cache = { ...DEFAULT_KEYBINDS }
  storage.remove(STORAGE_KEY)
}

// 冲突检测：code 是否已被其它动作占用（返回该动作 id，无冲突返回 null）
export function conflictOf(action: string, code: string): string | null {
  const b = getKeybinds()
  for (const a of BIND_ACTIONS) if (a.id !== action && b[a.id] === code) return a.id
  return null
}

export function actionLabel(id: string): string {
  return BIND_ACTIONS.find((a) => a.id === id)?.label ?? id
}

// 输入码 → 显示文本（HUD 提示 / 设置页 / 操作说明共用）
const CODE_LABELS: Record<string, string> = {
  Space: '空格', Tab: 'Tab', Escape: 'Esc', Enter: '回车',
  ShiftLeft: '左Shift', ShiftRight: '右Shift',
  ControlLeft: '左Ctrl', ControlRight: '右Ctrl',
  AltLeft: '左Alt', AltRight: '右Alt',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Mouse0: '左键', Mouse1: '中键', Mouse2: '右键', Mouse3: '侧键1', Mouse4: '侧键2',
  WheelUp: '滚轮上', WheelDown: '滚轮下',
  Backspace: '退格', CapsLock: '大写锁定',
}
export function bindLabel(code: string | undefined): string {
  if (!code) return '未绑定'
  if (CODE_LABELS[code]) return CODE_LABELS[code]
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return `小键盘${code.slice(6)}`
  return code
}

export function bindLabelFor(action: string): string {
  return bindLabel(getKeybinds()[action])
}
