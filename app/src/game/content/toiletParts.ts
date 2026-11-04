import type { L11PropPart } from './l11PropKit'

export type ToiletStyle = 'standard' | 'compact' | 'worn' | 'stone'
export type ToiletFinish = 'porcelain' | 'inner' | 'seat' | 'metal'
export interface ToiletPart extends L11PropPart { finish: ToiletFinish }
const scales: Record<ToiletStyle, readonly [number, number, number]> = {
  standard: [1, 1, 1], compact: [.94, 1, .78], worn: [1.12, 1.02, 1.05], stone: [1, 1, 1],
}
const cache = new Map<ToiletStyle, readonly ToiletPart[]>()
/** Metre-scale, front +Z. A single open lip joins the outside and the descending bowl interior. */
export function toiletParts(style: ToiletStyle = 'standard'): readonly ToiletPart[] {
  const hit = cache.get(style); if (hit) return hit
  const parts: ToiletPart[] = []
  const add = (finish: ToiletFinish, shape: ToiletPart['shape'], x: number, y: number, z: number, w: number, h: number, d: number, rx = 0, rz = 0) => {
    const p: ToiletPart = { finish, shape, x, y, z, w, h, d, rx, rz, surface: finish === 'metal' ? 'metal' : 'porcelain', solid: finish === 'porcelain' }
    parts.push(p); return p
  }
  const lathe = (finish: ToiletFinish, points: [number, number][]) => {
    const min = Math.min(...points.map(p => p[1])), max = Math.max(...points.map(p => p[1])), r = Math.max(...points.map(p => p[0]))
    const p = add(finish, 'cylinder', 0, (min + max) / 2, .06, r * 2, max - min, r * 2 * 1.22)
    p.latheProfile = points.map(([radius, y]) => [radius / (r * 2), (y - min) / (max - min) - .5])
  }
  lathe('porcelain', [[0,0],[.125,0],[.135,.022],[.118,.075],[.104,.19],[.145,.30],[.185,.366],[.195,.393],[.181,.407],[.160,.400]])
  lathe('inner', [[.160,.400],[.147,.366],[.108,.318],[.048,.296],[0,.295]])
  add('seat', 'ring', 0,.426,.065,.406,.49,.042,Math.PI/2)
  add('porcelain', 'box', 0,.604,-.255,.38,.34,.17)
  add('porcelain', 'box', 0,.790,-.255,.40,.032,.19)
  // The upright oval lid sits in front of the tank, hinged at the seat rather than cutting into it.
  add('seat', 'cylinder', 0,.642,-.137,.36,.020,.40,Math.PI/2-.08)
  add('metal', 'cylinder', 0,.452,-.140,.014,.23,.014,0,Math.PI/2)
  add('metal', 'cylinder', .07,.812,-.255,.048,.010,.048)
  add('metal', 'box', .07,.818,-.255,.002,.002,.040)
  const scale = scales[style]
  for (const p of parts) {
    p.x *= scale[0]; p.y *= scale[1]; p.z *= scale[2]
    // Dimensions live before rotation: horizontal rings/lids exchange local Y/Z.
    if(p.rx){p.w*=scale[0];p.h*=scale[2];p.d*=scale[1]}
    else if(p.rz){p.w*=scale[1];p.h*=scale[0];p.d*=scale[2]}
    else{p.w*=scale[0];p.h*=scale[1];p.d*=scale[2]}
  }
  cache.set(style, parts); return parts
}
/** Matches the top of the model's horizontal ring; this carries a semantic action, not a label heuristic. */
export function toiletSeat(style: ToiletStyle = 'standard') {
  const s = scales[style]
  return { x: 0, y: .447 * s[1], z: .065 * s[2], yaw: 0, label: style === 'stone' ? '石马桶' : '马桶', toilet: true as const }
}
