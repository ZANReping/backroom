// M.E.G. Omega 前哨/涂黑窗户陷阱房（L4 废弃办公室）
import { S, light, drop, type PrefabDef } from './shared'

export const L4_PREFABS: PrefabDef[] = [
  {
    id: 'megoutpost', name: 'M.E.G. Omega 前哨', prob: 0.25, min: 1, max: 1, w: 8, h: 6,
    fill: (c) => {
      // wiki：M.E.G. Base Omega 重兵把守 → 富补给 + 明亮安全
      S(c, 'megcrate', 0, 0, 1, 1, true, { loot: 1 })
      S(c, 'megcrate', 1, 0, 1, 1, true, { loot: 1 })
      S(c, 'vending', 6, 0, 1, 2, true, { trade: 1 })
      S(c, 'desk', 3, 1, 2, 1, true)
      S(c, 'bed', 0, 3, 1, 2, true)
      S(c, 'graffiti', 7, 3, 1, 1, false, { lore: 6 })
      light(c, 2, 2, 5, '#ffe9b0')
      light(c, 6, 4, 5, '#ffe9b0')
      drop(c, 'almond', 3.5, 3.5)
      drop(c, 'almond', 4.5, 3.5)
      drop(c, 'bandage', 5.5, 2.5)
      S(c, 'prefabmark', 0, 0, 1, 1, false, { prefab: 'megoutpost' })
    },
  },
  {
    id: 'blackwinroom', name: '涂黑窗户陷阱房', prob: 0.45, min: 1, max: 1, w: 6, h: 6,
    fill: (c) => {
      // wiki：大多数窗户被涂黑（安全），未涂黑的是陷阱
      S(c, 'windowblack', 1, 0, 1, 1, false)
      S(c, 'windowblack', 4, 0, 1, 1, false)
      S(c, 'windowblack', 0, 3, 1, 1, false)
      S(c, 'windowtrap', 5, 3, 1, 1, false)
      S(c, 'desk', 2, 2, 2, 1, true)
      S(c, 'corpse', 3, 4, 1, 1, false, { loot: 1 })
      light(c, 3, 3, 3.5, '#ffe9b0')
      S(c, 'prefabmark', 0, 0, 1, 1, false, { prefab: 'blackwinroom' })
    },
  },
]
