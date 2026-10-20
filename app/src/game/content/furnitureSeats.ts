// Seat surfaces are authored in the furniture's local model space, in metres.
import type { Structure } from '../core/types'
import { l11DecorDef } from './l11Decor'

export interface FurnitureSeat {
  x: number
  y: number // height of the cushion / seat surface
  z: number
  yaw: number // Three.js rotation: model front is +Z
  label: string
  relaxed?: boolean
}

const seat = (y: number, x = 0, z = 0, yaw = 0, label = '座椅', relaxed = false): FurnitureSeat => ({ x, y, z, yaw, label, relaxed })

/** Explicit seat surfaces, never inferred from a prop's bounding box (tables are not seats). */
export function furnitureSeats(s: Structure, level: number): FurnitureSeat[] {
  if (s.data?.fallen || s.data?.hidden || s.data?.noSit) return []
  const k = s.kind, w = s.w, d = s.h
  switch (k) {
    case 'settlementprop': {
      const height = Number(s.data?.seatHeight)
      if (!Number.isFinite(height)) return []
      const count = Math.max(1, Math.min(32, Number(s.data?.seatCount ?? 1)))
      return Array.from({ length: count }, (_, i) => seat(height, (i + .5) * w / count - w / 2, 0, Number(s.data?.seatYaw ?? 0), String(s.data?.seatLabel ?? '座椅'), !!s.data?.seatRelaxed))
    }
    case 'table': return s.data?.chair ? [seat(s.data?.l0Furniture ? .488 : .475)] : []
    case 'officechair': return [seat(level === 4 ? .52 : .475, 0, 0, level === 4 ? Math.PI : 0, '办公椅')]
    case 'barberchair': return [seat(.5125, 0, .02, 0, '理发椅')]
    case 'loungechair': return [seat(.43, 0, -.005, 0, '休闲椅', true)]
    case 'bench': case 'l5_pool_bench': return [seat(.475, -.43, .03, 0, '长椅'), seat(.475, .43, .03, 0, '长椅')]
    case 'sofa': case 'l5_antique_sofa':
      return level === 5 || k === 'l5_antique_sofa'
        ? [-.59, 0, .59].map(x => seat(.525, x, .12, 0, '沙发', true))
        : [-.37, .37].map(x => seat(.58, x, .10, 0, '沙发', true))
    case 'gymbench': return [seat(.46, 0, .25, Math.PI / 2, '训练凳')]
    case 'l9patiochair': return [seat(.52, 0, .04, 0, '庭院椅')]
    case 'alpha_chair': case 'alpha_swivel': return [seat(.515, 0, -.03, Math.PI)]
    case 'alpha_archive_chair': return [seat(.54, 0, -.03, Math.PI, '办公椅')]
    case 'alpha_executive_chair': return [seat(.57, 0, -.03, Math.PI, '办公椅')]
    case 'alpha_hall_seat': return [seat(.50, 0, -.04, Math.PI, '礼堂座椅')]
    case 'alpha_reading_chair': return [seat(.46, 0, .09, 0, '扶手椅', true)]
    case 'alpha_bench': return [-w * .32, 0].map(x => seat(.49, x, .035, 0, '长椅')) // Leave the books at the right end clear.
    case 'alpha_waiting_seats': return Array.from({ length: 4 }, (_, i) => seat(.475, .06 + (i + .5) * (w - .12) / 4 - w / 2 - .045, -.05, 0, '候座'))
    case 'alpha_executive_sofa': return [-1, 0, 1].map(i => seat(.54, i * (w - .32) / 3, .10, 0, '沙发', true))
    case 'alpha_home_table': return [.38, w - .86].flatMap(x => [.05, d - .47].map(z => seat(.46, x + .24 - w / 2, z + .21 - d / 2, z < .2 ? 0 : Math.PI, '餐椅')))
  }
  const city = l11DecorDef(k)
  if (!city) return []
  switch (k) {
    case 'l11_task_chair': return [seat(.55, 0, -.03, Math.PI, '办公椅')]
    case 'l11_cafe_chair': return [seat(.4775, 0, -.025, Math.PI, '咖啡椅')]
    case 'l11_dining_chair': return [seat(.492, 0, -.03, Math.PI, '餐椅')]
    case 'l11_armchair': return [seat(.54, 0, -.09, Math.PI, '扶手椅', true)]
    case 'l11_sofa': return [-1, 0, 1].map(i => seat(.55, i * 2.2 * .29, -.10, Math.PI, '沙发', true))
    case 'l11_park_bench': return [-.57, 0, .57].map(x => seat(.85 * .58 + .0275, x, -.025, Math.PI, '公园长椅'))
    case 'l11_gym_bench': return [-.6, 0, .6].map(x => seat(.4575, x, -.03, Math.PI, '长凳'))
    case 'l11_picnic_table': return [-.5, .5].flatMap(x => [-1, 1].map(sign => seat(.3075, x, sign * .736, sign < 0 ? 0 : Math.PI, '野餐长凳')))
    default: return []
  }
}
