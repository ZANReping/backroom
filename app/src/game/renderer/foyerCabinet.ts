import type { Ctx } from './foyerHome'
import type { Material } from 'three'

/** Five actual panels, open at local +Z. The void remains empty when the door moves. */
export function cabinetCase(c: Ctx, mat: Material, w: number, h: number, d: number, x = 0, y = 0, z = 0, t = .02) {
  c.box(mat, w, t, d, x, y, z)
  c.box(mat, w, t, d, x, y + h - t, z)
  c.box(mat, t, h - 2 * t, d, x - (w - t) / 2, y + t, z)
  c.box(mat, t, h - 2 * t, d, x + (w - t) / 2, y + t, z)
  c.box(mat, w - 2 * t, h - 2 * t, t, x, y + t, z - (d - t) / 2)
}

/** Open-top drawer: bottom, two cheeks, rear and front. Contents sit above the bottom. */
export function drawerTray(c: Ctx, mat: Material, w: number, h: number, d: number, y: number, z = 0, t = .012) {
  c.box(mat, w, t, d, 0, y, z)
  c.box(mat, t, h - t, d, -(w - t) / 2, y + t, z)
  c.box(mat, t, h - t, d, (w - t) / 2, y + t, z)
  c.box(mat, w - 2 * t, h - t, t, 0, y + t, z - (d - t) / 2)
  c.box(mat, w - 2 * t, h - t, t, 0, y + t, z + (d - t) / 2)
}
