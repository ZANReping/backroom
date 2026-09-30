// 豪华停车区/维护走廊（L1 停车场）
import { S, light, drop, type PrefabDef } from './shared'

export const L1_PREFABS: PrefabDef[] = [
  {
    id: 'luxgarage', name: '豪华停车区', prob: 0.25, mode: 'overlay', min: 1, max: 1, w: 8, h: 6,
    fill: (c) => {
      // 完好豪车 + 明亮吊灯区，物资更集中
      S(c, 'car', 1, 1, 2, 1, true, { loot: 1, lux: 1 })
      S(c, 'car', 5, 1, 2, 1, true, { loot: 1, lux: 1 })
      S(c, 'car', 3, 4, 1, 2, true, { loot: 1, lux: 1 })
      light(c, 4, 3, 5, '#e8e8e0')
      light(c, 2, 2, 4, '#e8e8e0')
      S(c, 'megcrate', 6, 4, 1, 1, true, { loot: 1 })
      drop(c, 'carkey', 4.5, 2.5)
      S(c, 'prefabmark', 0, 0, 1, 1, false, { prefab: 'luxgarage' })
    },
  },
  {
    id: 'maintcorridor', name: '维护走廊', prob: 0.5, mode: 'overlay', min: 1, max: 1, w: 10, h: 3,
    fill: (c) => {
      // wiki：维护走廊停电期间仍有电 → 灯密、管道、检修物资
      S(c, 'pipes', 2, 0, 1, 1, true)
      S(c, 'pipes', 5, 0, 1, 1, true)
      S(c, 'valve', 7, 0, 1, 1, false, { on: 0 })
      S(c, 'gauge', 3, 0, 1, 1, false)
      light(c, 2.5, 1.5, 4, '#d9c39a')
      light(c, 7.5, 1.5, 4, '#d9c39a')
      S(c, 'hanglight', 2, 1, 1, 1, false)
      S(c, 'hanglight', 7, 1, 1, 1, false)
      S(c, 'crate', 8, 1, 1, 1, true, { loot: 1 })
      drop(c, 'battery', 4.5, 1.5)
      S(c, 'prefabmark', 0, 0, 1, 1, false, { prefab: 'maintcorridor' })
    },
  },
]
