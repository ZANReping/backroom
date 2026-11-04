// L5「恐怖旅馆」1b：电梯面板（主电梯 1–12 + 磨损的 13 + 382 键数字键盘 + 红色拉杆回 Level 3；
// 维护电梯只通 B1 / 1F / 6F，15% 故障落到随机楼层、掉 10 血）。按 13 及以上：失踪。
// 界面在 components/ElevatorPanel.tsx（overlay 'elevator'，不暂停）。
import type { Engine } from '../engine'
import type { ExitDef } from '../core/types'
import { L5_FLOORS } from '../world/infiniteL5'
import { audio } from '../core/audio'
import { hotelRuleProve } from './l5Hotel'

export const EL = {
  serviceFloors: [0, 1, 6] as const,
  serviceFail: 0.15, serviceFailDmg: 10,
  vanishT: 3.2, // 13 楼：门开后黑暗 + 剪影 + 铃声，然后失踪
  climbT: 6, // 14 楼及以上：先无尽上升
  keypadMax: 3, // 数字键盘最多 3 位
}

export type ElevatorMode = 'main' | 'service'
export interface ElevatorUi { mode: ElevatorMode; entry: string; exit?: ExitDef; msg: string }
const UI = new WeakMap<Engine, ElevatorUi>()

export function elevatorView(eng: Engine): (ElevatorUi & { floor: number; floorName: string }) | null {
  const u = UI.get(eng)
  if (!u) return null
  const f = eng.hotel.floor
  return { ...u, floor: f, floorName: L5_FLOORS[f]?.name ?? '1F' }
}
export function openElevator(eng: Engine, mode: ElevatorMode, exit?: ExitDef) {
  UI.set(eng, { mode, entry: '', exit, msg: mode === 'service' ? '维护电梯。铁栅门上挂着手写的牌子：B1 · 1 · 6。' : '黄铜面板擦得锃亮。13 号键的刻字被磨平了。' })
  audio.uiTick()
  eng.emit({ kind: 'elevator' })
}
export function closeElevator(eng: Engine) { UI.delete(eng) }

/** 按下楼层键（含键盘输入确认后的楼层） */
export function elevatorGo(eng: Engine, floor: number): string {
  const u = UI.get(eng)
  if (!u || eng.transition || eng.hotelVanishT > 0) return ''
  const cur = eng.hotel.floor
  if (u.mode === 'service' && !(EL.serviceFloors as readonly number[]).includes(floor)) return (u.msg = '维护电梯只停 B1、1、6。')
  if (floor >= 13) { startVanish(eng, floor); UI.delete(eng); return '' }
  if (!L5_FLOORS[floor] || (floor === 0 && u.mode !== 'service')) return (u.msg = floor === 0 ? '主电梯没有地下一层的按钮。' : '这一层……不存在。')
  if (floor === cur) return (u.msg = `你已经在 ${L5_FLOORS[floor].name} 了。`)
  let dest = floor
  if (u.mode === 'service' && Math.random() < EL.serviceFail) {
    // 故障：钢缆一松，落到随机楼层
    do dest = 1 + Math.floor(Math.random() * 12); while (dest === cur)
    eng.player.hp = Math.max(1, eng.player.hp - EL.serviceFailDmg)
    eng.emit({ kind: 'damage' })
    eng.msg(`维护电梯猛地一沉——钢缆尖叫着打滑，轿厢在 ${L5_FLOORS[dest].name} 砸停。（-${EL.serviceFailDmg} 生命）`, 'damage')
  } else eng.msg(`电梯铃响了一声。${L5_FLOORS[dest].name} · ${L5_FLOORS[dest].theme}。`, 'system')
  eng.hotel.floor = dest
  eng.arriveElevator = true
  audio.pickup()
  eng.transition = { anim: 'shutter', t: 0, dest: 5 }
  eng.emit({ kind: 'transition', anim: 'shutter', dest: 5 })
  UI.delete(eng)
  return ''
}
/** 数字键盘：输入、退格、确认 */
export function elevatorKey(eng: Engine, k: string): string {
  const u = UI.get(eng)
  if (!u) return ''
  audio.uiTick()
  if (k === 'C') { u.entry = u.entry.slice(0, -1); return '' }
  if (k === 'OK') { const n = Number(u.entry); u.entry = ''; if (!Number.isFinite(n) || n < 1 && u.mode === 'main') return (u.msg = '面板没有反应。'); return elevatorGo(eng, n) }
  if (/^\d$/.test(k) && u.entry.length < EL.keypadMax) u.entry += k
  return ''
}
/** 红色拉杆：下行 · Level 3（原电梯出口） */
export function elevatorDown(eng: Engine) {
  const u = UI.get(eng)
  if (!u?.exit) return
  UI.delete(eng)
  eng.takeExit(u.exit)
}

function startVanish(eng: Engine, floor: number) {
  eng.hotelVanishT = floor === 13 ? EL.vanishT : EL.climbT + EL.vanishT
  eng.hotelVanishFloor = floor
  audio.hotelMusic('shift', -1, 0)
  eng.msg(floor === 13 ? '13 号键陷了下去。电梯开始上升。' : `你输入了 ${floor}。电梯开始上升，一直在上升。`, 'lore')
}
/** 每帧（l5Hotel.updateHotel 调用）：失踪倒计时 */
export function updateVanish(eng: Engine, dt: number) {
  if (eng.hotelVanishT <= 0) return
  const before = eng.hotelVanishT
  eng.hotelVanishT = Math.max(0, eng.hotelVanishT - dt)
  if (before > EL.vanishT && eng.hotelVanishT <= EL.vanishT) eng.msg('上升停了。', 'lore')
  if (before > EL.vanishT * 0.75 && eng.hotelVanishT <= EL.vanishT * 0.75) { eng.msg('门开了。外面没有灯。远处有一个人影，手里摇着一只铃。', 'lore'); audio.hotelBell(0.9) }
  if (eng.hotelVanishT <= 0) { hotelRuleProve(eng, 'f13'); hotelRuleProve(eng, 'desk13') }
  if (eng.hotelVanishT <= 0) eng.die(`在恐怖旅馆 ${eng.hotelVanishFloor} 楼失踪`, true)
}
