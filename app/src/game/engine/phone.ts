// 手机（前厅起随身）：装在副手，提供 手电 / 笔记 / 时钟 / 相机 四项功能，独立电量，需在充电处充电。
// 状态写入 player.phone（随存档）；物品本体是 'phone'（content/items.ts），可装副手或放在背包/快捷栏。
import type { Engine, PlayerState } from '../engine'
import { audio } from '../core/audio'
import { FOYER_ID, foyerRoomAt } from '../world/foyerLayout'
import { onStreetPhoto, streetPlaceName } from './foyerStreet'
import { redEntranceInShot } from './l0QuestProbe'

export interface PhoneNote { id: number; kind: 'note' | 'photo'; title: string; text: string; time: string; place?: string }
export interface PhoneState {
  battery: number // 0–100
  torch: boolean // 手机手电
  docked: boolean // 放在充电座上（此时不在背包里）
  notes: PhoneNote[]
  photos: number
  nextId: number
  /** M4：坠入 Level 0 后屏幕碎裂（界面加裂纹） */
  cracked?: boolean
  /** M4：Level 0 无信号（论坛无法刷新） */
  noSignal?: boolean
  /** Level 0.2：连上了工地临时 Wi‑Fi（路由器 16 m 内；离开本层清除）。 */
  wifi?: boolean
  /** Level 0.2：正插在墙上插座充电（每帧由 engine/l02Collapse.ts 置位）。 */
  charging?: boolean
}

export function newPhoneState(): PhoneState {
  return { battery: 38, torch: false, docked: true, notes: [], photos: 0, nextId: 1 }
}

export function phoneState(p: PlayerState): PhoneState {
  return (p.phone ??= newPhoneState())
}

/** 手机是否在身上（副手/快捷栏/背包）。 */
export function carriesPhone(p: PlayerState): boolean {
  return p.equip.offhand?.type === 'phone' || p.hotbar.some((s) => s?.type === 'phone') || p.backpack.some((s) => s?.type === 'phone')
}
export function phoneInHand(p: PlayerState): boolean { return p.equip.offhand?.type === 'phone' }
function statLocked(eng: Engine, ph: PhoneState) {
  const locked = eng.devEnabled && eng.dev.statLock
  if (locked) ph.battery = 100
  return locked
}

// ---- 时钟 ----
/** 前厅时钟：23:40 起，按游戏内秒推进（1:1）。离开前厅后沿用同一计数。 */
export function gameClockMinutes(eng: Engine): number {
  const t = eng.player.prologueClock ?? 0
  return (23 * 60 + 40 + Math.floor(t / 60)) % (24 * 60)
}
export function clockText(eng: Engine, withSec = false): string {
  const t = eng.player.prologueClock ?? 0
  const m = gameClockMinutes(eng)
  const hh = String(Math.floor(m / 60)).padStart(2, '0'), mm = String(m % 60).padStart(2, '0')
  return withSec ? `${hh}:${mm}:${String(Math.floor(t % 60)).padStart(2, '0')}` : `${hh}:${mm}`
}

// ---- 每帧 ----
/** 电量消耗/充电。充电速率为游戏化加速（约 1%/s）。 */
export function updatePhone(eng: Engine, dt: number) {
  const p = eng.player
  p.prologueClock = (p.prologueClock ?? 0) + dt
  const ph = p.phone
  if (!ph) return
  if (ph.docked) {
    ph.torch = false
    if (eng.devEnabled && eng.dev.statLock) ph.battery = 100
    else if (ph.battery < 100) ph.battery = Math.min(100, ph.battery + 1.1 * dt)
    return
  }
  const inHand = phoneInHand(p)
  if (ph.torch && !inHand) ph.torch = false
  if (eng.devEnabled && eng.dev.statLock) { ph.battery = 100; return }
  let drain = 0.012 // 待机
  if (ph.torch) drain += 0.32
  if (eng.phoneScreenOn) drain += 0.06
  ph.battery = Math.max(0, ph.battery - drain * dt)
  if (ph.battery <= 0 && (ph.torch || eng.phoneScreenOn)) {
    ph.torch = false
    eng.phoneScreenOn = false
    eng.msg('手机没电了，屏幕一黑。', 'system')
  }
}

export function togglePhoneTorch(eng: Engine): boolean {
  const ph = eng.player.phone
  if (!ph) { eng.msg('你没有手机。', 'system'); return false }
  statLocked(eng, ph)
  if (!phoneInHand(eng.player)) { eng.msg('手机不在手上——把它装到【副手】。', 'system'); return false }
  if (ph.battery <= 0) { eng.msg('手机没电了。去充电。', 'system'); return false }
  ph.torch = !ph.torch
  if (ph.torch) eng.player.flashlight = false // 与副手手电互斥（副手只有一件）
  audio.uiTick()
  eng.markTutorial('phone_torch')
  return true
}

export function addPhoneNote(eng: Engine, kind: PhoneNote['kind'], title: string, text: string, place?: string): PhoneNote {
  const ph = phoneState(eng.player)
  const n: PhoneNote = { id: ph.nextId++, kind, title, text, time: clockText(eng), place }
  ph.notes.unshift(n)
  if (ph.notes.length > 40) ph.notes.length = 40
  return n
}

function placeName(eng: Engine): string {
  const p = eng.player
  if (p.level === FOYER_ID) return foyerRoomAt(p.x, p.y)?.name ?? streetPlaceName(p.x, p.y) ?? '家'
  return eng.levelDef.name
}

/** 拍照：消耗少量电量，存进笔记（照片条目记录地点与时间；画面缩略图由 UI 层附上）。 */
export function takePhoto(eng: Engine, thumb?: string): PhoneNote | null {
  const ph = eng.player.phone
  if (!ph) { eng.msg('你没有手机。', 'system'); return null }
  const locked = statLocked(eng, ph)
  if (ph.battery <= 0) { eng.msg('手机没电了。', 'system'); return null }
  if (!locked) ph.battery = Math.max(0, ph.battery - 0.8)
  ph.photos++
  const place = placeName(eng)
  const subject = eng.player.level === FOYER_ID ? onStreetPhoto(eng) : null // M3：巷子调查点/寻人启事
  // Level 0：在红室外拍到红室入口（任务「教学」可选目标）
  const redShot = eng.player.level === 0 ? redEntranceInShot(eng) : null
  const l0Subject = redShot ? '画面里是一处红室入口：门洞那边的墙纸泛着暗红，像是浸过什么。我没有走进去。' : null
  const n = addPhoneNote(eng, 'photo', `照片 #${ph.photos}`, `${place}，${clockText(eng)}。${subject ? '\n' + subject : ''}${l0Subject ? '\n' + l0Subject : ''}`, place)
  if (thumb) eng.phoneThumbs.set(n.id, thumb)
  audio.uiTick()
  eng.photoFlashT = 0.35
  eng.markTutorial('phone_photo')
  eng.questEvent({ t: 'photo', subject: redShot ? 'l0_red_entrance' : null })
  return n
}

/** 充电座：放上/取下。返回提示文本。 */
export function dockPhone(eng: Engine, on: boolean): string {
  const p = eng.player
  const ph = phoneState(p)
  if (on) {
    // 从身上移除手机实体
    if (p.equip.offhand?.type === 'phone') p.equip.offhand = null
    else {
      const i = p.hotbar.findIndex((s) => s?.type === 'phone')
      if (i >= 0) p.hotbar[i] = null
      else { const j = p.backpack.findIndex((s) => s?.type === 'phone'); if (j >= 0) p.backpack[j] = null }
    }
    ph.docked = true
    ph.torch = false
    eng.syncPassives()
    eng.markTutorial('phone_charge')
    return '手机放上充电器，屏幕亮起充电图标。'
  }
  ph.docked = false
  if (!p.equip.offhand) p.equip.offhand = { type: 'phone', count: 1 }
  else if (!eng.addItem('phone')) { ph.docked = true; return '手上和背包都满了。' }
  eng.syncPassives()
  return p.equip.offhand?.type === 'phone' ? `拿起手机（电量 ${Math.round(ph.battery)}%）——装在【副手】。` : `拿起手机（电量 ${Math.round(ph.battery)}%），收进背包。`
}
