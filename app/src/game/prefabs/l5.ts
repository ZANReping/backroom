// 客房/贝弗利厅宴会厅/锅炉房（L5 恐怖酒店）
import { S, light, drop, idx, type PrefabDef } from './shared'

export const L5_PREFABS: PrefabDef[] = [
  {
    id: 'guestroom', name: '客房', prob: 1, min: 2, max: 3, w: 6, h: 5,
    fill: (c) => {
      // 100% 多间：床 + 柜 + 酒店窗 + 桌；门部分上锁（撬棍/万能钥匙可开）
      const locked = c.rng.chance(0.5)
      // 门由放置器加在门洞上（carve 模式），此处记录锁状态
      if (c.doorX >= 0) {
        c.m.structures.push({
          kind: 'hoteldoor', x: c.doorX, y: c.doorY, w: 1, h: 1, solid: true,
          data: { open: 0, locked: locked ? 1 : 0 },
        })
      }
      S(c, 'bed', 1, 1, 1, 2, true)
      S(c, 'dresser', 4, 0, 1, 1, true, { loot: 1 })
      S(c, 'table', 3, 2, 1, 1, true)
      S(c, 'hotelwindow', 2, 0, 1, 1, false)
      S(c, 'sconce', 0, 3, 1, 1, false)
      light(c, 3, 2, 3.5, '#ffd9a0')
      if (c.rng.chance(0.6)) drop(c, 'silverware', 4.5, 3.5)
      S(c, 'prefabmark', 0, 0, 1, 1, false, { prefab: 'guestroom' })
    },
  },
  {
    id: 'beverlyhall', name: '贝弗利厅宴会厅', prob: 0.45, min: 1, max: 1, w: 12, h: 9,
    fill: (c) => {
      // wiki：贝弗利舞厅——长桌 + 水晶吊灯 + 银餐具
      S(c, 'table', 2, 2, 2, 1, true)
      S(c, 'table', 2, 5, 2, 1, true)
      S(c, 'table', 7, 2, 2, 1, true)
      S(c, 'table', 7, 5, 2, 1, true)
      S(c, 'chandelier', 3, 3, 1, 1, false)
      S(c, 'chandelier', 8, 4, 1, 1, false)
      light(c, 3.5, 3.5, 5, '#ffd9a0')
      light(c, 8.5, 4.5, 5, '#ffd9a0')
      S(c, 'mirror', 11, 3, 1, 2, true)
      drop(c, 'silverware', 2.5, 2.5)
      drop(c, 'silverware', 7.5, 5.5)
      drop(c, 'sedative', 10.5, 1.5)
      S(c, 'prefabmark', 0, 0, 1, 1, false, { prefab: 'beverlyhall' })
    },
  },
  {
    id: 'hotelboiler', name: '锅炉房', prob: 0.25, min: 1, max: 1, w: 7, h: 6,
    fill: (c) => {
      // wiki：锅炉房管道流杏仁水且会渗漏 → 湿地面 + 杏仁水
      S(c, 'boiler', 2, 1, 3, 3, true, { boss: 0 })
      S(c, 'pipes', 0, 2, 1, 1, true)
      S(c, 'pipes', 6, 2, 1, 1, true)
      S(c, 'valve', 1, 4, 1, 1, false, { on: 0 })
      for (const [wx, wy] of [[3, 4], [4, 4], [3, 5], [2, 4]] as const) c.m.wet[idx(c.m, c.x + wx, c.y + wy)] = 1
      light(c, 3.5, 0.5, 4, '#ffd9a0')
      drop(c, 'almond', 3.5, 4.5)
      drop(c, 'almond', 5.5, 4.5)
      S(c, 'prefabmark', 0, 0, 1, 1, false, { prefab: 'hotelboiler' })
    },
  },
]
