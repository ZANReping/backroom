// 红房间/拱门房（L0 黄色迷宫）
import { S, light, drop, type PrefabDef } from './shared'

export const L0_PREFABS: PrefabDef[] = [
  {
    id: 'redroom', name: '红房间', prob: 0.25, mode: 'overlay', min: 1, max: 1, w: 6, h: 6,
    fill: (c) => {
      // wiki：红房间——灯光被染红的异常区域，久待者「出来时都不说话」
      light(c, 2, 2, 4, '#ff2a1a')
      light(c, 4, 4, 4, '#ff2a1a')
      S(c, 'graffiti', 1, 1, 1, 1, false, { lore: 3 })
      S(c, 'corpse', 3, 3, 1, 1, false, { loot: 1 })
      S(c, 'hanglight', 2, 2, 1, 1, false, { red: 1 })
      drop(c, 'wallpaper', 4.5, 1.5)
      S(c, 'prefabmark', 0, 0, 1, 1, false, { prefab: 'redroom' })
    },
  },
  {
    id: 'archroom', name: '拱门房', prob: 0.5, mode: 'overlay', min: 1, max: 1, w: 7, h: 5,
    fill: (c) => {
      // 两排固定拱门（柱+横梁）
      S(c, 'arch', 1, 1, 1, 1, true)
      S(c, 'arch', 5, 1, 1, 1, true)
      S(c, 'arch', 1, 3, 1, 1, true)
      S(c, 'arch', 5, 3, 1, 1, true)
      S(c, 'hanglight', 3, 2, 1, 1, false)
      light(c, 3.5, 2.5, 4, '#fff6d8')
      S(c, 'crate', 3, 1, 1, 1, true, { loot: 1 })
      S(c, 'prefabmark', 0, 0, 1, 1, false, { prefab: 'archroom' })
    },
  },
]
