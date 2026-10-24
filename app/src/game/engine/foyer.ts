// 前厅（序章，level 900）运行时：可开关的门/抽屉/衣柜/冰箱、电脑阅读、可拾取物（手机/背包/手电/冰箱补给）、
// 手机充电处、楼道声控灯、教程步骤推进等交互目标与状态。
// 剧情状态写入 player.prologue（随存档），全局「玩过前厅」标记见 core/foyerFlag.ts。
import type { Engine } from '../engine'
import type { LightSource, Structure } from '../core/types'
import { FOYER_DOORS, FOYER_ID, FOYER_PROPS, FOYER_SPAWN, FOYER_PICKUP_POS, foyerDoorBox, foyerRoomAt, type FoyerProp } from '../world/foyerLayout'
import { audio } from '../core/audio'
import { look } from '../renderer/shared'
import { markFoyerCompleted } from '../core/foyerFlag'
import { unlockAllHud, unlockHud, type HudKey } from './hud'
import { addPhoneNote, dockPhone, phoneState, carriesPhone, newPhoneState } from './phone'
import { TutorialDirector } from './tutorial'
import { prepareFoyerLanding } from './foyerLanding'
import { beginSitting } from './seating'
import { FOYER_TUTORIAL } from '../content/tutorialFoyer'
import { streetTargets, streetInteract, updateFoyerStreet, streetQuest, streetVisual, type StreetRuntime, type StreetVisual } from './foyerStreet'

export { HUD_KEYS, type HudKey } from './hud'

export { FOYER_PICKUP_POS } from '../world/foyerLayout'

export interface FoyerRuntime {
  open: Record<string, number>
  /** 楼道声控灯：亮度 0–1 与剩余亮灯秒数。 */
  corridor: { level: number; timer: number; flick: number }
  corridorLight?: LightSource | null
  lookAcc: number
  lastYaw: number
  /** M3 街区演出状态（engine/foyerStreet.ts；不入存档）。 */
  street?: StreetRuntime
}

/** 可拾取物：flag=拾取记录（prologue.flags），hud=拾取时解锁的 HUD 区块。 */
export interface FoyerPickup { id: string; flag: string; label: string; hud: HudKey[] }
export const FOYER_PICKUPS: Record<string, FoyerPickup> = {
  phone: { id: 'phone', flag: 'got_phone', label: '手机', hud: ['clock', 'quest', 'log', 'minimap', 'battery'] },
  backpack: { id: 'backpack', flag: 'got_backpack', label: '背包', hud: ['hotbar', 'inventory'] },
  flashlight: { id: 'flashlight', flag: 'got_flashlight', label: '手电筒', hud: ['battery'] },
  water: { id: 'water', flag: 'got_water', label: '瓶装水', hud: [] },
  snack: { id: 'snack', flag: 'got_snack', label: '能量棒', hud: [] },
}

/** 剧情 flags 便捷读写。 */
export function pflags(eng: Engine): Record<string, boolean> {
  return (eng.player.prologue ??= { step: 'act0', flags: {} }).flags
}
export function inFoyerRun(eng: Engine): boolean {
  return eng.player.level === FOYER_ID && !!eng.player.prologue && eng.player.prologue.step !== 'done'
}
/** 手电藏处（新游戏按种子二选一：床底或床头柜抽屉）。 */
export function flashlightSpot(eng: Engine): 'bed' | 'drawer' {
  return pflags(eng).flash_drawer ? 'drawer' : 'bed'
}

/** 新游戏从前厅开始：剧情第 0 幕，HUD 只有准星与交互提示。 */
export function beginFoyerRun(eng: Engine) {
  eng.player.prologue = { step: 'act0', flags: { flash_drawer: (eng.seed >>> 0) % 2 === 1 } }
  eng.player.hudUnlocks = {}
  eng.player.phone = newPhoneState()
  eng.player.prologueClock = 0
  eng.hudRevealAt = {}
  eng.introT = 0
  eng.tutorial = new TutorialDirector(FOYER_TUTORIAL)
  enterFoyer(eng, true)
  eng.msg('23:40。屏幕的光照着你的脸。', 'lore')
}

/** 离开前厅：写入全局「玩过前厅」标记；P1 临时出口直接恢复全部 HUD（P3 改为 L0 散落拾取恢复）。 */
export function completeFoyer(eng: Engine) {
  markFoyerCompleted()
  eng.player.prologue = { step: 'done', flags: { ...(eng.player.prologue?.flags ?? {}) } }
  // 手机留在充电座上就不会随身带走：P1 临时出口按「已随身」处理，避免 L0 无手机
  const ph = eng.player.phone
  if (ph?.docked && pflags(eng).got_phone) { dockPhone(eng, false) }
  unlockAllHud(eng)
  eng.tutorial = null
  // M4：坠入 Level 0——随身物品改为着陆时散落，HUD 收起后在 L0 逐项恢复（engine/foyerLanding.ts）
  prepareFoyerLanding(eng)
}

export interface FoyerTarget {
  id: string
  label: string
  x: number; y: number; z: number
  range: number
  radius: number
  volume: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }
  /** 选择优先级（从命中角度分里扣除）：家具里的可拾取物 > 家具本身的开关，避免「关上 冰箱」抢走能量棒。 */
  priority?: number
  s?: Structure
}

/** 可开关部件：id → 显示名。 */
const TOGGLES: Record<string, string> = { wardrobe: '衣柜', desk_drawer: '书桌抽屉', nightstand: '床头柜抽屉', fridge: '冰箱' }

export function foyerState(eng: Engine): FoyerRuntime {
  return (eng.foyer ??= { open: { ...(eng.player.prologue?.open ?? {}) }, corridor: { level: 0, timer: 0, flick: 0 }, lookAcc: 0, lastYaw: look.yaw })
}

/** 进入前厅（新游戏或读档）：坐在书桌前，面朝屏幕。 */
export function enterFoyer(eng: Engine, fresh: boolean) {
  const open = { ...(eng.player.prologue?.open ?? {}) }
  eng.foyer = { open, corridor: { level: 0, timer: 0, flick: 0 }, lookAcc: 0, lastYaw: look.yaw }
  if (!fresh) {
    for (const d of FOYER_DOORS) {
      const s = eng.map?.structures.find(s => s.kind === 'foyerprop' && s.data?.pid === d.id)
      if (s) s.data = { ...s.data, open: open[d.id] ? 1 : 0 }
    }
    if (eng.map) eng.map.structures = eng.map.structures.slice()
    return
  }
  eng.player.x = FOYER_SPAWN.x; eng.player.y = FOYER_SPAWN.y; eng.player.z = 0
  look.yaw = FOYER_SPAWN.yaw; look.pitch = FOYER_SPAWN.pitch
  eng.foyer.lastYaw = look.yaw
  eng.player.facing = Math.PI // 朝西（-x）
  const chair = eng.map?.structures.find(s => s.kind === 'foyerprop' && s.data?.pid === 'desk_chair')
  if (chair) beginSitting(eng, chair, { instant: true, silent: true })
  eng.foyer.lastYaw = look.yaw
}

function propVolume(p: FoyerProp, z0 = 0, z1 = p.top) {
  return { minX: p.x - p.w / 2, minY: p.y - p.d / 2, minZ: z0, maxX: p.x + p.w / 2, maxY: p.y + p.d / 2, maxZ: Math.max(z0 + 0.1, z1) }
}
const prop = (id: string) => FOYER_PROPS.find((p) => p.id === id)!
const boxAt = (x: number, y: number, z: number, hx: number, hy: number, hz: number) => ({ minX: x - hx, minY: y - hy, minZ: z - hz, maxX: x + hx, maxY: y + hy, maxZ: z + hz })

/** 当前可交互目标（scanInteract 在前厅调用）。 */
export function foyerTargets(eng: Engine): FoyerTarget[] {
  const m = eng.map
  if (!m || eng.player.level !== FOYER_ID) return []
  const st = foyerState(eng)
  const f = pflags(eng)
  const p = eng.player
  const out: FoyerTarget[] = []
  const PICK_PRIORITY = 1.2
  const struct = (pid: string) => m.structures.find((s) => s.kind === 'foyerprop' && s.data?.pid === pid)
  for (const d of FOYER_DOORS) {
    const open = !!st.open[d.id]
    const b = foyerDoorBox(d, open)
    out.push({
      id: d.id, label: `${open ? '关上' : '打开'} ${d.label}`,
      x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: 1.0, range: 1.7, radius: 0.45,
      volume: { minX: b.x0 - 0.04, minY: b.y0 - 0.04, minZ: 0.1, maxX: b.x1 + 0.04, maxY: b.y1 + 0.04, maxZ: 2.05 },
      s: struct(d.id),
    })
  }
  // ---- 可拾取物（优先于其所在家具的开关：带 PICK_PRIORITY，准星落在物品上或物品附近时压过家具开关）----
  if (st.open.wardrobe && !f.got_backpack) {
    const q = FOYER_PICKUP_POS.backpack
    out.push({ id: 'pick_backpack', label: '拿起 背包', ...q, z: q.z + 0.25, range: 1.9, radius: 0.3, volume: boxAt(q.x, q.y, q.z + 0.24, 0.22, 0.14, 0.25), s: struct('wardrobe'), priority: PICK_PRIORITY })
  }
  if (!f.got_flashlight) {
    if (flashlightSpot(eng) === 'bed' && p.crouching) {
      const q = FOYER_PICKUP_POS.flashlight_bed
      out.push({ id: 'pick_flashlight', label: '从床底摸出 手电筒', ...q, z: 0.12, range: 2.0, radius: 0.35, volume: boxAt(q.x + 0.1, q.y, 0.1, 0.3, 0.45, 0.12), s: struct('bed'), priority: PICK_PRIORITY })
    } else if (flashlightSpot(eng) === 'drawer' && st.open.nightstand) {
      const q = FOYER_PICKUP_POS.flashlight_drawer
      out.push({ id: 'pick_flashlight', label: '拿起 手电筒', ...q, range: 1.7, radius: 0.25, volume: boxAt(q.x, q.y, q.z, 0.2, 0.12, 0.08), s: struct('nightstand'), priority: PICK_PRIORITY })
    }
  }
  if (st.open.fridge) {
    if (!f.got_water) { const q = FOYER_PICKUP_POS.water; out.push({ id: 'pick_water', label: '拿 瓶装水', ...q, range: 1.7, radius: 0.2, volume: boxAt(q.x + 0.04, q.y, q.z + 0.1, 0.14, 0.12, 0.13), s: struct('fridge'), priority: PICK_PRIORITY }) }
    if (!f.got_snack) { const q = FOYER_PICKUP_POS.snack; out.push({ id: 'pick_snack', label: '拿 能量棒', ...q, range: 1.7, radius: 0.2, volume: boxAt(q.x, q.y, q.z + 0.03, 0.14, 0.12, 0.08), s: struct('fridge'), priority: PICK_PRIORITY }) }
  }
  // ---- 手机 / 充电处（书桌右侧的充电座）----
  {
    const dock = prop('phone_dock')
    const ph = p.phone
    let label: string | null = null
    if (!f.got_phone) label = '拿起 手机'
    else if (ph?.docked) label = `拿起 手机（充电中 ${Math.round(ph.battery)}%）`
    else if (carriesPhone(p)) label = `把手机放上充电器（${Math.round(ph?.battery ?? 0)}%）`
    if (label) out.push({ id: 'phone_dock', label, x: dock.x, y: dock.y, z: 0.82, range: 1.6, radius: 0.22, volume: boxAt(dock.x, dock.y, 0.8, 0.12, 0.14, 0.06) })
  }
  for (const pr of FOYER_PROPS) {
    if (TOGGLES[pr.id]) {
      const open = !!st.open[pr.id]
      out.push({ id: pr.id, label: `${open ? '关上' : '打开'} ${TOGGLES[pr.id]}`, x: pr.x, y: pr.y, z: Math.min(1.2, pr.top * 0.6), range: 1.6, radius: 0.4, volume: propVolume(pr, 0.05), s: struct(pr.id) })
    } else if (pr.id === 'computer') {
      out.push({ id: pr.id, label: '使用 电脑', x: pr.x, y: pr.y, z: 1.05, range: 1.5, radius: 0.35, volume: propVolume(pr, 0.8, 1.2) })
    }
  }
  // M3：安全通道门、街区与巷子调查点
  for (const t of streetTargets(eng)) out.push(t)
  return out
}

/** 拾取：写入 flags、发放物品、解锁 HUD。 */
function takePickup(eng: Engine, key: keyof typeof FOYER_PICKUPS) {
  const pk = FOYER_PICKUPS[key]
  const f = pflags(eng)
  const p = eng.player
  if (f[pk.flag]) return
  let msg = ''
  switch (key) {
    case 'backpack': {
      msg = '背上背包。快捷栏与背包界面已就绪。'
      break
    }
    case 'flashlight': {
      // 副手被手机占着时收进背包/快捷栏；副手空着就直接装上
      if (!p.equip.offhand) { p.equip.offhand = { type: 'flashlight', count: 1 }; msg = '拿到手电筒——装在【副手】。' }
      else if (eng.addItem('flashlight')) msg = f.got_backpack ? '手电筒收进背包。副手拿着手机：可在背包里把手电换到【副手】。' : '手电筒先揣进兜里。'
      else return eng.msg('拿不下了。', 'system')
      break
    }
    case 'water': if (!eng.addItem('bottledwater')) return eng.msg('拿不下了。', 'system'); msg = '拿了一瓶水。'; break
    case 'snack': if (!eng.addItem('snackbar')) return eng.msg('拿不下了。', 'system'); eng.addItem('snackbar'); msg = '拿了两根能量棒。'; break
    case 'phone': {
      const ph = phoneState(p)
      msg = dockPhone(eng, false)
      if (ph.notes.length === 0) {
        addPhoneNote(eng, 'note', '论坛帖 · 巷子', '本地论坛「边界线」：有人说附近一条巷子能「卡进」后室。出来的人说，要集齐六张磁带，送进 Level 11 的档案馆。——多半是编的。')
        addPhoneNote(eng, 'note', '待办', '明早 9:00 交报告。牛奶没了。')
      }
      break
    }
  }
  f[pk.flag] = true
  eng.syncPassives()
  audio.pickup()
  if (msg) eng.msg(msg, 'loot')
  eng.emit({ kind: 'toast', text: `+ ${pk.label}` })
  unlockHud(eng, pk.hud)
}

/** 执行前厅交互（doInteract 'foyer'）。 */
export function foyerInteract(eng: Engine, id: string | undefined) {
  if (!id || !eng.map) return
  if (streetInteract(eng, id)) return
  const st = foyerState(eng)
  const door = FOYER_DOORS.find((d) => d.id === id)
  if (door) {
    const next = st.open[id] ? 0 : 1
    st.open[id] = next
    eng.player.prologue!.open = { ...st.open }
    const s = eng.map.structures.find((v) => v.kind === 'foyerprop' && v.data?.pid === id)
    if (s) {
      s.data = { ...s.data, open: next }
      // 碰撞网格按结构数组身份缓存：换新数组促使下一次查询重建（门的碰撞框在开/关间移动）
      eng.map.structures = eng.map.structures.slice()
    }
    // 防盗门的开门声足以唤醒楼道声控灯
    if (id === 'door_front') st.corridor.timer = Math.max(st.corridor.timer, 15)
    audio.uiTick()
    return
  }
  if (TOGGLES[id]) { st.open[id] = st.open[id] ? 0 : 1; eng.player.prologue!.open = { ...st.open }; audio.uiTick(); return }
  if (id === 'pick_backpack') return takePickup(eng, 'backpack')
  if (id === 'pick_flashlight') return takePickup(eng, 'flashlight')
  if (id === 'pick_water') return takePickup(eng, 'water')
  if (id === 'pick_snack') return takePickup(eng, 'snack')
  if (id === 'phone_dock') {
    const f = pflags(eng)
    if (!f.got_phone) return takePickup(eng, 'phone')
    const ph = phoneState(eng.player)
    eng.msg(dockPhone(eng, !ph.docked), 'system')
    audio.uiTick()
    return
  }
  if (id === 'computer') {
    // 第 0 幕：先看新闻，再看论坛帖；之后交替（阅读记录写入 player.prologue.flags）
    const pr = (eng.player.prologue ??= { step: 'act0', flags: {} })
    const showForum = pr.flags.read_news && !pr.flags.read_forum ? true : pr.flags.read_forum ? !pr.flags.last_forum : false
    pr.flags[showForum ? 'read_forum' : 'read_news'] = true
    pr.flags.last_forum = showForum
    eng.emit({ kind: 'doc', text: showForum ? 'foyer_forum' : 'foyer_news' })
    return
  }
}

/** 每帧（仅前厅）：楼道声控灯、视角教程计量、教程推进。 */
export function updateFoyer(eng: Engine, dt: number) {
  if (eng.player.level !== FOYER_ID || !eng.map) return
  const st = foyerState(eng)
  const p = eng.player
  // ---- 视角：累计转动量（教程「环顾四周」）----
  let dy = look.yaw - st.lastYaw
  while (dy > Math.PI) dy -= Math.PI * 2
  while (dy < -Math.PI) dy += Math.PI * 2
  st.lastYaw = look.yaw
  st.lookAcc += Math.abs(dy)
  if (st.lookAcc > 1.2) eng.markTutorial('look')
  // ---- 楼道声控灯：楼道内有脚步/跳跃等声响即亮，静止约 14 秒后熄灭 ----
  const room = foyerRoomAt(p.x, p.y)
  const inCorridor = room?.id === 'stair' || (p.y >= 14 && p.y < 18.5 && p.x >= 4 && p.x < 8)
  if (inCorridor && eng.noise > 0.08) {
    if (st.corridor.timer <= 0) st.corridor.flick = 0.32 // 起辉闪一下
    st.corridor.timer = 14
  }
  if (st.corridor.timer > 0) st.corridor.timer = Math.max(0, st.corridor.timer - dt)
  const target = st.corridor.timer > 0 ? 1 : 0
  st.corridor.level += (target - st.corridor.level) * (1 - Math.exp(-dt * (target ? 14 : 3)))
  if (st.corridor.flick > 0) st.corridor.flick = Math.max(0, st.corridor.flick - dt)
  if (st.corridor.level > 0.6 && inCorridor) eng.markTutorial('corridor_light')
  // 灯的实际亮度由渲染层每帧 renderer.foyer.setCorridorLightLevel(corridorLightLevel(eng)) 写入
  // （实时直接光 = 基准 0.3 × level，同时缩放烘焙的楼道间接光与灯罩），这里不再直接改写 intensityMul。
  // ---- 教程 ----
  if (inFoyerRun(eng)) {
    eng.tutorial ??= new TutorialDirector(FOYER_TUTORIAL)
    eng.tutorial.update(eng)
    if (pflags(eng).got_phone && p.prologue!.step === 'act0') p.prologue!.step = 'act1'
  }
  // ---- M3：街区（下楼、调查、回程异常）----
  if (inFoyerRun(eng)) updateFoyerStreet(eng, dt)
}

/** 楼道灯当前亮度（渲染层灯罩发光用）。 */
export function corridorLightLevel(eng: Engine): number {
  const c = eng.foyer?.corridor
  if (!c) return 0
  return c.level * (c.flick > 0 ? (Math.sin(c.flick * 90) > 0 ? 0.25 : 1) : 1)
}

/** 「准备出门」任务清单（HUD 任务追踪，phone 解锁后显示）。 */
export function foyerQuest(eng: Engine): { title: string; items: { text: string; done: boolean }[] } | null {
  if (!inFoyerRun(eng)) return null
  const f = pflags(eng)
  if (f.went_down) return streetQuest(eng)
  return {
    title: '准备出门',
    items: [
      { text: '看看本地论坛的帖子', done: !!f.read_forum },
      { text: '带上手机', done: !!f.got_phone },
      { text: '从衣柜拿背包', done: !!f.got_backpack },
      { text: flashlightSpot(eng) === 'bed' ? '找到手电筒（床底？）' : '找到手电筒（床头柜？）', done: !!f.got_flashlight },
      { text: '冰箱：水和零食', done: !!f.got_water && !!f.got_snack },
      { text: '出门，去那条巷子', done: !!f.went_down },
    ],
  }
}

/** 渲染层每帧可见性（FoyerScene.update）：拾取物显隐 + 声控灯灯罩亮度。 */
export function foyerVisual(eng: Engine): { show: Record<string, boolean>; corridor: number; street: StreetVisual } {
  const f = eng.player.prologue?.flags ?? {}
  const done = !eng.player.prologue || eng.player.prologue.step === 'done'
  const open = eng.foyer?.open ?? {}
  const ph = eng.player.phone
  const drawer = !!f.flash_drawer
  return {
    show: {
      phone: done ? !!ph?.docked : !f.got_phone || !!ph?.docked,
      backpack: !done && !f.got_backpack && !!open.wardrobe,
      flashlight_bed: !done && !f.got_flashlight && !drawer,
      flashlight_drawer: !done && !f.got_flashlight && drawer,
      water: !done && !f.got_water && !!open.fridge,
      snack: !done && !f.got_snack && !!open.fridge,
    },
    corridor: corridorLightLevel(eng),
    street: streetVisual(eng),
  }
}
