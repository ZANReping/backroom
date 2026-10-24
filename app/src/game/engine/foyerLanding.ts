// 前厅 M4（P3）：RealityBreak 坠落后的 Level 0 着陆。
// - 离开前厅时（completeFoyer → prepareFoyerLanding）：把身上带着的东西（手机、手电、水、能量棒、背包里其余物品）
//   从背包/副手里取出，记为待散落；背包本身变成地面物品「你的背包」。HUD 全部收起（hudUnlocks = {}）。
// - 载入 Level 0 后（applyFoyerLanding）：这些物品散落在出生点周围约 1.5–5 m；手机屏幕碎裂、无信号。
//   去掉通用开局物资里重复的手电筒（玩家自己的手电筒在散落物里）。
// - 交还操作后（updateFoyerLanding）：生存状态 / 生命值 / 任务追踪首次解锁（浮现动画），任务追踪写入主线
//   「收集六张磁带并送往 Level 11 档案馆」；重新拾取手机 → 时钟/日志/小地图/电量，背包 → 快捷栏/背包界面，
//   手电 → 电量；全部恢复后 hudUnlocks 回到缺省（=全开）。
// 剧情记录写 player.prologue.flags（随存档）：landing / l0_hud / main_quest / l0_phone / l0_pack / l0_flash / l0_water / l0_snack / l0_done。
import type { Engine, InvSlot } from '../engine'
import type { GroundItem } from '../core/types'
import { canOccupy, PLAYER_RADIUS } from '../core/player'
import { look } from '../renderer/shared'
import { audio } from '../core/audio'
import { unlockAllHud, unlockHud, HUD_KEYS } from './hud'
import { addPhoneNote, phoneState } from './phone'
import { captureBreakCube, resetBreakCube } from '../core/breakCube'

/** 地面物品「你的背包」：拾取即恢复快捷栏与背包界面（物品本身随即消失）。 */
export const FOYER_PACK_ITEM = 'foyerpack'
export const MAIN_QUEST_TITLE = '收集六张磁带并送往 Level 11 档案馆'

let shot: HTMLCanvasElement | null = null
let shotRequested = false
/** 交还操作后的计时（不入存档）：用于延迟 HUD 浮现，使动画在过场结束后可见。 */
let wakeT = 0
let lastNow = 0
/** 新开局/读档清理演出引用，不清理存档中的待散落物。 */
export function resetFoyerPresentation() { shot = null; shotRequested = false; wakeT = 0; lastNow = 0; resetBreakCube() }

const flags = (eng: Engine) => (eng.player.prologue ??= { step: 'done', flags: {} }).flags

// ---------------------------------------------------------------------------
// RealityBreak 起手画面：回程终点最后一帧 3D 画面（App 渲染后同一任务截取，见 engine.pendingPhoto）
// ---------------------------------------------------------------------------
export function requestBreakShot(eng: Engine) {
  if (shotRequested || eng.pendingPhoto) return
  shotRequested = true
  eng.pendingPhoto = (canvas) => {
    try {
      const k = Math.min(1, 1280 / Math.max(1, canvas.width))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(canvas.width * k)); c.height = Math.max(1, Math.round(canvas.height * k))
      c.getContext('2d')!.drawImage(canvas, 0, 0, c.width, c.height)
      shot = c
    } catch { shot = null }
    // 3D 抓取在独立目标分帧完成，不阻塞读取，也不改写可见画布。
    captureBreakCube(canvas)
  }
}
/** 取走起手画面（只能取一次）。 */
export function takeBreakShot(): HTMLCanvasElement | null {
  const s = shot
  shot = null; shotRequested = false
  return s
}

// ---------------------------------------------------------------------------
// 离开前厅
// ---------------------------------------------------------------------------
export function prepareFoyerLanding(eng: Engine) {
  const p = eng.player
  if (p.prologue?.landingItems) return // 同一过场不重复取出物品。
  const items: InvSlot[] = []
  const take = (s: InvSlot | null) => { if (s && s.count > 0) items.push({ ...s }) }
  for (let i = 0; i < p.hotbar.length; i++) { take(p.hotbar[i]); p.hotbar[i] = null }
  for (let i = 0; i < p.backpack.length; i++) { take(p.backpack[i]); p.backpack[i] = null }
  take(p.equip.offhand); p.equip.offhand = null
  p.flashlight = false
  const f = flags(eng)
  // 背包：前厅拿到过才散落（未拿背包的特殊情况不生成）
  if (f.got_backpack) items.push({ type: FOYER_PACK_ITEM, count: 1 })
  const ph = p.phone
  if (ph && items.some((s) => s.type === 'phone')) { ph.torch = false; ph.docked = false; ph.cracked = true; ph.noSignal = true }
  eng.syncPassives()
  f.landing = true
  for (const k of ['l0_hud', 'main_quest', 'l0_phone', 'l0_pack', 'l0_flash', 'l0_water', 'l0_snack', 'l0_done']) delete f[k]
  // 没带出来的东西视为已恢复（不阻塞 HUD 恢复）
  if (!items.some((s) => s.type === 'phone')) f.l0_phone = true
  if (!f.got_backpack) f.l0_pack = true
  if (!items.some((s) => s.type === 'flashlight')) f.l0_flash = true
  if (!items.some((s) => s.type === 'bottledwater')) f.l0_water = true
  if (!items.some((s) => s.type === 'snackbar')) f.l0_snack = true
  p.hudUnlocks = {}
  eng.hudRevealAt = {}
  p.prologue!.landingItems = items
  wakeT = 0; lastNow = 0
}

/** 散落点：出生点周围可站立、彼此相距 ≥0.9 m 的位置，按 1.5–5 m 环带、角度错开挑选。 */
function scatterSpots(eng: Engine, n: number): { x: number; y: number }[] {
  const m = eng.map!, p = eng.player
  const cx = p.x, cy = p.y
  const out: { x: number; y: number }[] = []
  const ok = (x: number, y: number) => x > 1 && y > 1 && x < m.w - 1 && y < m.h - 1
    && canOccupy(m, x, y, 0.25, { z: 0 }) && canOccupy(m, (x + cx) / 2, (y + cy) / 2, 0.2, { z: 0 })
    && !out.some((o) => Math.hypot(o.x - x, o.y - y) < 0.9)
  let seed = Math.floor(cx * 131 + cy * 71) >>> 0
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const base = rnd() * Math.PI * 2
  for (let i = 0; i < n; i++) {
    let placed = false
    for (let tries = 0; tries < 60 && !placed; tries++) {
      const r = 1.5 + rnd() * (tries < 30 ? 3.5 : 2)
      const a = base + (i / n) * Math.PI * 2 + (rnd() - 0.5) * (tries < 20 ? 0.8 : 3)
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r
      if (ok(x, y)) { out.push({ x, y }); placed = true }
    }
    if (!placed) {
      // 回退：环形逐格搜索
      outer: for (let r = 1; r < 7; r++) for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r
        if (ok(x, y)) { out.push({ x, y }); placed = true; break outer }
      }
    }
    if (!placed) out.push({ x: cx + 0.6, y: cy })
  }
  void PLAYER_RADIUS
  return out
}

// ---------------------------------------------------------------------------
// 载入 Level 0 之后（engine.ts 在 loadLevel 后调用）
// ---------------------------------------------------------------------------
export function applyFoyerLanding(eng: Engine) {
  const items = eng.player.prologue?.landingItems
  if (!items || !eng.map || eng.player.level !== 0) return
  const m = eng.map, p = eng.player
  delete p.prologue!.landingItems
  // 没带出的剧情物品没有找回目标；相应 HUD 也不能永远锁住。
  const f = p.prologue!.flags
  if (f.l0_pack) unlockHud(eng, ['hotbar', 'inventory'])
  if (f.l0_phone) unlockHud(eng, ['clock', 'log', 'minimap', 'battery'])
  // 通用开局物资里的手电筒与玩家自己的手电重复：去掉 8 m 内的那一支
  const dup = items.some(s => s.type === 'flashlight') ? m.items.findIndex((it) => it.type === 'flashlight' && Math.hypot(it.x - p.x, it.y - p.y) < 8) : -1
  if (dup >= 0) {
    const [gone] = m.items.splice(dup, 1)
    const inf = m.inf
    if (inf) {
      for (const ch of inf.chunks.values()) { const j = ch.items.indexOf(gone); if (j >= 0) ch.items.splice(j, 1) }
      inf.taken.add(gone.id)
    }
  }
  const spots = scatterSpots(eng, items.length)
  items.forEach((s, i) => {
    const sp = spots[i]
    const it: GroundItem = { ...s, id: Math.random(), x: sp.x, y: sp.y }
    if (s.count > 1) it.count = s.count
    if (s.dur !== undefined) it.dur = s.dur
    m.items.push(it)
    const inf = m.inf
    inf?.chunks.get(`${Math.floor((sp.x + inf.ox) / 32)},${Math.floor((sp.y + inf.oy) / 32)}`)?.items.push(it)
  })
  // 醒来：复用新游戏开局的「贴地侧躺 → 缓慢爬起」镜头（engine.introT，3.2 s，期间锁定移动），视线略朝上
  look.pitch = 0.25
  eng.introT = 3.2
  p.hp = Math.max(1, p.hp)
}

// ---------------------------------------------------------------------------
// 每帧（Level 0，着陆流程进行中）
// ---------------------------------------------------------------------------
export function landingActive(eng: Engine): boolean {
  const f = eng.player.prologue?.flags
  return !!f?.landing && !f.l0_done
}

function hasAnywhere(eng: Engine, type: string): boolean {
  const p = eng.player
  return p.equip.offhand?.type === type || p.hotbar.some((s) => s?.type === type) || p.backpack.some((s) => s?.type === type)
}

/** 把快捷栏/背包里的某件物品装到空着的副手。 */
function autoOffhand(eng: Engine, type: string): boolean {
  const p = eng.player
  if (p.equip.offhand) return false
  for (const arr of [p.hotbar, p.backpack]) {
    const i = arr.findIndex((s) => s?.type === type)
    if (i >= 0) { p.equip.offhand = arr[i]; arr[i] = null; if (type === 'flashlight') p.flashlight = true; eng.syncPassives(); return true }
  }
  return false
}

export function updateFoyerLanding(eng: Engine, dt: number) {
  if (!landingActive(eng) || eng.player.level !== 0) return
  const f = flags(eng)
  // 按真实时间计（低帧率下 dt 被截断，不拖长醒来演出）
  const now = performance.now()
  wakeT += Math.max(dt, lastNow ? Math.min(0.5, (now - lastNow) / 1000) : dt)
  lastNow = now
  if (!f.l0_hud && wakeT > 0.9) {
    f.l0_hud = true
    unlockHud(eng, ['status', 'hp', 'quest'])
    eng.msg('你在一片嗡嗡声里醒来。地毯是湿的，空气里有股霉味。', 'lore')
    eng.msg('你带出来的东西散落在四周。', 'system')
    audio.uiTick()
  }
  if (!f.main_quest && wakeT > 1.8) {
    f.main_quest = true
    eng.msg(`主线：${MAIN_QUEST_TITLE}。`, 'lore')
    eng.emit({ kind: 'toast', text: `主线 · ${MAIN_QUEST_TITLE}` })
  }
  // 重新拾取
  if (!f.l0_phone && hasAnywhere(eng, 'phone')) {
    f.l0_phone = true
    autoOffhand(eng, 'phone')
    unlockHud(eng, ['clock', 'log', 'minimap', 'battery'])
    const ph = phoneState(eng.player)
    ph.cracked = true; ph.noSignal = true
    addPhoneNote(eng, 'note', '主线', `${MAIN_QUEST_TITLE}。\n论坛帖子说的是真的。屏幕摔裂了，右上角一格信号都没有。`)
    eng.msg('手机屏幕摔裂了。右上角写着「无信号」。', 'lore')
  }
  if (!f.l0_pack && eng.countItem(FOYER_PACK_ITEM) > 0) {
    f.l0_pack = true
    while (eng.countItem(FOYER_PACK_ITEM) > 0) eng.consumeItem(FOYER_PACK_ITEM)
    unlockHud(eng, ['hotbar', 'inventory'])
    eng.msg('你重新背上了背包。', 'loot')
  }
  if (!f.l0_flash && hasAnywhere(eng, 'flashlight')) {
    f.l0_flash = true
    autoOffhand(eng, 'flashlight')
    unlockHud(eng, ['battery'])
  }
  if (!f.l0_water && hasAnywhere(eng, 'bottledwater')) f.l0_water = true
  if (!f.l0_snack && hasAnywhere(eng, 'snackbar')) f.l0_snack = true
  const hu = eng.player.hudUnlocks
  if (f.l0_phone && f.l0_pack && f.l0_flash && f.l0_water && f.l0_snack && (!hu || HUD_KEYS.every((k) => hu[k]))) {
    f.l0_done = true
    // 等最后一个浮现动画放完再回到缺省「全开」（避免动画被打断）
    window.setTimeout(() => { if (eng.player.prologue?.flags.l0_done && eng.player.hudUnlocks) unlockAllHud(eng) }, 2200)
    eng.msg('东西都找回来了。现在——磁带。', 'lore')
  }
}

// ---------------------------------------------------------------------------
// 任务追踪（HUD 右上，与前厅任务清单共用样式）
// ---------------------------------------------------------------------------
export function landingQuest(eng: Engine): { title: string; items: { text: string; done: boolean }[] } | null {
  const f = eng.player.prologue?.flags
  if (!f?.landing || !f.main_quest) return null
  const tapes = Math.min(6, eng.player.tapes ?? 0)
  const archived = !!eng.l11World?.archiveUnlocked
  const items: { text: string; done: boolean }[] = []
  if (!f.l0_done) {
    items.push({ text: '找回手机', done: !!f.l0_phone })
    items.push({ text: '找回背包', done: !!f.l0_pack })
    items.push({ text: '找回手电筒', done: !!f.l0_flash })
    items.push({ text: '找回水和能量棒', done: !!f.l0_water && !!f.l0_snack })
  }
  items.push({ text: `收集六张磁带（${tapes}/6）`, done: tapes >= 6 || archived })
  items.push({ text: '送往 Level 11 档案馆', done: archived })
  return { title: '主线 · 六张磁带', items }
}
