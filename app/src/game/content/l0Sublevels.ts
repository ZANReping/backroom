// Level 0 子层级任务注册表。重塑的混乱已由 levels/l02.ts / world/l02Layout.ts 实现，
// 从施工门实际进入时调用 enterL0Sublevel；天顶站和冰室仍只有任务占位与开发者模拟。
// 后续补齐地图时沿用相同发现事件，不在这里实例化世界。
export interface L0Sublevel { id: string; name: string; note?: string; level?: number; label?: string }

export const L0_SUBLEVELS: L0Sublevel[] = [
  { id: 'zenith_station', name: '天顶站' },
  { id: 'remade_chaos', name: '重塑的混乱', level: 902, label: 'Level 0.2' },
  { id: 'ice_room', name: '冰室' },
]

export function l0SublevelName(id: string): string {
  return L0_SUBLEVELS.find((s) => s.id === id)?.name ?? id
}
