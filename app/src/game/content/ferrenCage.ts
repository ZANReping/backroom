// [ferren] Ferren（Entity 92）重制·阶段 3：商人之家（Level 102，tradersWorld）里的小雪貂笼。
// 商人之家现由 tradersWorld.createTradersMap 生成（mapgenOutpost.genBntgOutpost 里的旧笼子不再被 102 用到，但同样改成了 1 只 + 窝 + 食盆）。
// 位置：迎新与路线中心（304–352 × 136–169.6）东半边的空地——不挡柜台、座位与通道（verify 时扫过占用格）。
// 笼子 = 4 m × 4 m 内沿的铁丝围栏（四面各一段实心细围栏，北面中间留 1.2 m 的笼门），笼里西南角是窝、东南角是食盆。
import type { Structure } from '../core/types'

export const FERREN_CAGE = {
  x0: 334, y0: 147, x1: 338, y1: 151, // 笼内沿（地图坐标）
  gate0: 335.4, gate1: 336.6, // 北面笼门开口（x 区间）
  wall: 0.06, height: 0.95,
  nest: { x: 334.8, y: 150.2 }, bowl: { x: 337.15, y: 150.25 },
  spawn: { x: 336, y: 148.8 },
}

/** 围栏 + 窝 + 食盆（solid 围栏用默认整段 AABB 碰撞；窝与食盆不挡路） */
export function ferrenCageStructures(): Structure[] {
  const C = FERREN_CAGE, t = C.wall, h = t / 2
  const fence = (x: number, y: number, w: number, hh: number, axis: 'x' | 'y'): Structure =>
    ({ kind: 'ferrencage', x, y, w, h: hh, solid: true, data: { axis, height: C.height, tradersId: 'ferren_cage_' + axis + Math.round(x * 10) + '_' + Math.round(y * 10) } })
  const cage = { cage0: C.x0, cage1: C.y0, cage2: C.x1, cage3: C.y1 }
  return [
    fence(C.x0 - h, C.y0 - h, C.gate0 - C.x0 + h, t, 'x'), // 北（笼门西侧）
    fence(C.gate1, C.y0 - h, C.x1 - C.gate1 + h, t, 'x'), // 北（笼门东侧）
    fence(C.x0 - h, C.y1 - h, C.x1 - C.x0 + t, t, 'x'), // 南
    fence(C.x0 - h, C.y0 - h, t, C.y1 - C.y0 + t, 'y'), // 西
    fence(C.x1 - h, C.y0 - h, t, C.y1 - C.y0 + t, 'y'), // 东
    { kind: 'ferrennest', x: C.nest.x - 0.5, y: C.nest.y - 0.5, w: 1, h: 1, solid: false, data: { ...cage } },
    { kind: 'ferrenbowl', x: C.bowl.x - 0.5, y: C.bowl.y - 0.5, w: 1, h: 1, solid: false },
  ]
}
