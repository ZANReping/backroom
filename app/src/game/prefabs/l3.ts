// 主发电机房（L3 电站）
import { S, light, drop, type PrefabDef } from './shared'

export const L3_PREFABS: PrefabDef[] = [
  {
    id: 'maingenroom', name: '主发电机房', prob: 1, min: 1, max: 1, w: 10, h: 8,
    fill: (c) => {
      // 100% 生成：大型发电机 + 富资源（wiki：L3 资源全后室最丰富）
      S(c, 'maingen', 3, 2, 4, 3, true, { boss: 1 })
      S(c, 'generator', 0, 2, 3, 2, true)
      S(c, 'generator', 7, 5, 3, 2, true)
      S(c, 'cabinet', 0, 0, 1, 1, true)
      S(c, 'cabinet', 1, 0, 1, 1, true)
      S(c, 'cabinet', 8, 0, 1, 1, true)
      S(c, 'trench', 4, 0, 1, 1, false)
      S(c, 'trench', 4, 6, 1, 1, false)
      light(c, 5, 1, 5, '#9adfff')
      light(c, 2, 6, 4, '#9adfff')
      drop(c, 'fuse', 2.5, 6.5)
      drop(c, 'fuse', 7.5, 1.5)
      drop(c, 'battery', 5.5, 6.5)
      drop(c, 'capacitor', 8.5, 3.5)
      S(c, 'megcrate', 0, 6, 1, 1, true, { loot: 1 })
      S(c, 'prefabmark', 0, 0, 1, 1, false, { prefab: 'maingenroom' })
    },
  },
]
