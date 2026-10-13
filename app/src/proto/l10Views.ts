// 仅供预览截图使用：在给定种子下寻找 Level 10 的代表性取景点（返回 [相机x, 相机y, 目标x, 目标y]，世界坐标）。
import { l10FarmsteadOf, l10LakeDepth, l10PlotAt, l10Wetness, L10_LAKE_T, type L10Building } from '../game/world/infiniteL10'

function nearestBarn(seed: number): L10Building | null {
  let best: L10Building | null = null, bd = Infinity
  for (let b = -5; b <= 5; b++) for (let a = -5; a <= 5; a++) {
    const f = l10FarmsteadOf(seed, a, b)
    const barn = f?.buildings.find(x => x.kind === 'barn')
    if (!barn) continue
    const d = Math.hypot(barn.x, barn.y)
    if (d < bd) { bd = d; best = barn }
  }
  return best
}
const doorDir = (deg: number) => [Math.sin(deg * Math.PI / 180), Math.cos(deg * Math.PI / 180)]

export function __vFarm(seed: number) {
  const b = nearestBarn(seed); if (!b) return null
  const [dx, dy] = doorDir(b.deg), cx = b.x + b.w / 2, cy = b.y + b.h / 2
  const D = b.deg % 180 ? b.w : b.h
  return [cx + dx * (D / 2 + 21) + dy * 7, cy + dy * (D / 2 + 21) - dx * 7, cx, cy]
}
export function __vBarn(seed: number) {
  const b = nearestBarn(seed); if (!b) return null
  const [dx, dy] = doorDir(b.deg), cx = b.x + b.w / 2, cy = b.y + b.h / 2
  const D = b.deg % 180 ? b.w : b.h
  return [cx + dx * (D / 2 + 9) + dy * 2.5, cy + dy * (D / 2 + 9) - dx * 2.5, cx, cy]
}
export function __vBarnIn(seed: number) {
  const b = nearestBarn(seed); if (!b) return null
  const [dx, dy] = doorDir(b.deg), cx = b.x + b.w / 2, cy = b.y + b.h / 2
  const D = b.deg % 180 ? b.w : b.h
  return [cx + dx * (D / 2 - 1.0), cy + dy * (D / 2 - 1.0), cx - dx * D, cy - dy * D]
}
export function __vLake(seed: number) {
  let best: number[] | null = null, br = Infinity
  for (let y = -500; y < 500; y += 6) for (let x = -500; x < 500; x += 6) {
    if (l10LakeDepth(seed, x, y) < 1.4) continue
    const r = Math.hypot(x, y)
    if (r < br) { br = r; best = [x, y] }
  }
  if (!best) return null
  const [lx, ly] = best
  // 朝出生点方向走到岸上，再退 5m
  const ux = -lx / br, uy = -ly / br
  for (let t = 0; t < 80; t += .5) {
    const x = lx + ux * t, y = ly + uy * t
    if (l10Wetness(seed, x, y) > L10_LAKE_T + .02) return [x + ux * 3 + uy * 2.5, y + uy * 3 - ux * 2.5, lx - ux * 6, ly - uy * 6]
  }
  return null
}
function plotView(seed: number, use: string) {
  for (let r = 20; r < 600; r += 8) for (let a = 0; a < 24; a++) {
    const x = Math.cos(a / 24 * Math.PI * 2) * r, y = Math.sin(a / 24 * Math.PI * 2) * r
    const p = l10PlotAt(seed, x, y)
    if (p.use !== use || p.edge < 7 || p.edge > 11) continue
    if (l10Wetness(seed, x, y) < L10_LAKE_T + .12) continue
    const e1 = l10PlotAt(seed, x + 1, y).edge - p.edge, e2 = l10PlotAt(seed, x, y + 1).edge - p.edge
    const len = Math.hypot(e1, e2) || 1
    return [x, y, x - e1 / len * 12, y - e2 / len * 12]
  }
  return null
}
export const __vField = (seed: number) => plotView(seed, 'wheat')
export const __vCanola = (seed: number) => plotView(seed, 'canola')
