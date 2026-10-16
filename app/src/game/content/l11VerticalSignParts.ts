import { L11PropBuilder } from './l11PropKit'

/** Complete, solid vertical advertising boards. Fronts face -Z. */
export function l11VerticalSignParts(key: string, b: L11PropBuilder): boolean {
  const { w, height: H } = b.def
  if (key === 'vertical_wall_sign') {
    b.box(0, H / 2, 0, w, H, .12, 'paint', '#343a3b')
    for (const x of [-w / 2 + .08, w / 2 - .08]) {
      b.box(x, H / 2, -.052, .045, H - .18, .035, 'metal', '#8a918d')
      for (const y of [.15, H - .15]) {
        const bolt = b.cylinder(x, y, -.069, .035, .0125, 'metal', '#b8b1a0')
        bolt.rx = Math.PI / 2
      }
    }
    return true
  }
  if (key === 'vertical_blade_sign') {
    b.box(0, H / 2, -.12, .12, H, 1.3, 'paint', '#343a3b')
    for (const y of [.55, H / 2, H - .55]) b.box(0, y, .67, .1, .08, .26, 'metal', '#7b8581')
    return true
  }
  return false
}
