// 锅炉房节点（L2 废弃公共带；v41：死代码——L2 已改无限 chunk 生成（infiniteL2.ts），
// 无限层级不走 prefab 路径，本文件仅保留作参考）
import { S, light, drop, type PrefabDef } from './shared'

export const L2_PREFABS: PrefabDef[] = [
  {
    id: 'boilernode', name: '锅炉房节点', prob: 0.45, min: 1, max: 1, w: 7, h: 7,
    fill: (c) => {
      // 高温节点：中央锅炉 + 开启的蒸汽阀（wiki：高温蒸汽管区）
      S(c, 'boiler', 2, 2, 3, 3, true, { boss: 0 })
      S(c, 'valve', 0, 1, 1, 1, false, { on: 1 })
      S(c, 'valve', 6, 5, 1, 1, false, { on: 1 })
      S(c, 'gauge', 1, 5, 1, 1, false)
      S(c, 'gauge', 5, 1, 1, 1, false)
      S(c, 'pipes', 0, 3, 1, 1, true)
      light(c, 3.5, 0.5, 4, '#cfc4b4')
      drop(c, 'gloves', 3.5, 5.5)
      S(c, 'prefabmark', 0, 0, 1, 1, false, { prefab: 'boilernode' })
    },
  },
]
