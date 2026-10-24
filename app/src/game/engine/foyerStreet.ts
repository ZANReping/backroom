import { prepareBreakCube } from '../core/breakCube'
// 前厅 P2（M3）运行时：安全通道下楼、街区可交互目标（寻人启事/公告栏/便利店…）、
// 旧仓路后巷三个调查点（E 调查 + 手机相机拍照记入笔记）、论坛新回帖、回程异常（行人消失、路灯频闪、
// 同一家便利店出现两次、门洞无缝循环）与终点坠落（沿用 Cutscene 'fall' → Level 0，M4 由 RealityBreak 替换）。
// 剧情记录写在 player.prologue.flags（随存档）；运行时演出状态在 engine.foyer.street（不入存档）。
import { requestBreakShot } from './foyerLanding'
import type { Engine } from '../engine'
import { look } from '../renderer/shared'
import { audio } from '../core/audio'
import {
  STREET_PROPS, STREET_CLUES, STREET_LAMPS, STREET_ARRIVE, HOME_STAIR_DOOR, GATE_ARCH, ARCH_LOOP_DELTA, STAIR_TOP_Z,
  streetAreaAt, streetLampLights, type StreetLamp,
} from '../world/foyerStreetLayout'
import { FOYER_ID } from '../world/foyerLayout'
import type { LightSource, Structure } from '../core/types'
import { addPhoneNote } from './phone'

export interface StreetRuntime {
  fade: { t: number; dur: number; text: string; mid: (() => void) | null } | null
  lamps: { lamp: StreetLamp; light: LightSource; base: number }[] | null
  lampLevel: Float32Array
  lastY: number
  lastX: number
  sprintT: number
  replyT: number
  fallT: number
  msgCd: Record<string, number>
  t: number
  /** 黑场按真实时间推进（低帧率下游戏 dt 被钳制，按游戏时间会拖得很长）。 */
  lastNow: number
}

export type ClueId = 'graffiti' | 'boxes' | 'cctv'
const CLUE_IDS: ClueId[] = ['graffiti', 'boxes', 'cctv']

function F(eng: Engine): Record<string, boolean> { return (eng.player.prologue ??= { step: 'act0', flags: {} }).flags }
export function streetRt(eng: Engine): StreetRuntime {
  const fy = (eng.foyer ??= { open: {}, corridor: { level: 0, timer: 0, flick: 0 }, lookAcc: 0, lastYaw: look.yaw })
  return (fy.street ??= { fade: null, lamps: null, lampLevel: new Float32Array(STREET_LAMPS.length).fill(1), lastY: eng.player.y, lastX: eng.player.x, sprintT: 0, replyT: -1, fallT: -1, msgCd: {}, t: 0, lastNow: 0 })
}
export const cluesDone = (eng: Engine) => CLUE_IDS.filter((c) => F(eng)['clue_' + c]).length
export const inAct4 = (eng: Engine) => !!F(eng).act4

/** 街区里的交互目标（与 engine/foyer.ts FoyerTarget 同形）。 */
export interface StreetTarget { id: string; label: string; x: number; y: number; z: number; range: number; radius: number; volume: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }; priority?: number; s?: Structure }
const vol = (x: number, y: number, z: number, hx: number, hy: number, hz: number) => ({ minX: x - hx, minY: y - hy, minZ: z - hz, maxX: x + hx, maxY: y + hy, maxZ: z + hz })

export function streetTargets(eng: Engine): StreetTarget[] {
  const p = eng.player, f = F(eng)
  const out: StreetTarget[] = []
  if (streetRt(eng).fade) return out
  const struct = (pid: string) => eng.map?.structures.find((s) => s.kind === 'foyerprop' && s.data?.pid === pid)
  // 家里楼道东墙：安全通道门（下楼）
  if (p.x < 20) {
    out.push({ id: 'st_down', label: inAct4(eng) ? '……门打不开' : '推开 安全通道门（下楼）', x: HOME_STAIR_DOOR.x - 0.05, y: HOME_STAIR_DOOR.y, z: 1.05, range: 1.8, radius: 0.5, volume: vol(HOME_STAIR_DOOR.x - 0.04, HOME_STAIR_DOOR.y, 1.05, 0.06, HOME_STAIR_DOOR.w / 2, 1.0) })
    return out
  }
  // 门厅：楼梯平台西侧的上行楼梯（回家）
  if (!inAct4(eng) && p.x < 47 && p.y < 15) out.push({ id: 'st_up', label: '上楼 回家', x: 34.15, y: 11, z: STAIR_TOP_Z + 0.9, range: 1.6, radius: 0.6, volume: vol(34.1, 11, STAIR_TOP_Z + 0.9, 0.1, 0.9, 0.9) })
  for (const s of STREET_PROPS) {
    if (Math.abs(s.x - p.x) > 6 || Math.abs(s.y - p.y) > 6) continue
    if (s.kind === 'missing') out.push({ id: 'st_poster:' + s.v, label: '看看 寻人启事', x: s.x, y: s.y, z: s.top, range: 1.9, radius: 0.35, volume: vol(s.x, s.y, s.top, Math.max(0.05, s.w / 2), Math.max(0.05, s.d / 2 + 0.03), 0.3), priority: 0.6 })
    else if (s.label && ['noticeboard', 'lift', 'counter', 'vending', 'guardbooth'].includes(s.kind)) {
      const z = s.kind === 'counter' ? 1.05 : s.kind === 'guardbooth' ? 1.4 : 1.4
      out.push({ id: 'st_' + s.id, label: `看看 ${s.label}`, x: s.x, y: s.y, z, range: 1.9, radius: 0.5, volume: vol(s.x, s.y, z, s.w / 2 + 0.04, s.d / 2 + 0.04, 0.6), s: struct(s.id) })
    }
  }
  for (const c of STREET_CLUES) {
    if (Math.abs(c.x - p.x) > 8 || Math.abs(c.y - p.y) > 8) continue
    const done = !!f['clue_' + c.id]
    out.push({ id: 'st_clue:' + c.id, label: done ? `再看看 ${c.label}` : `调查 ${c.label}`, x: c.x, y: c.y, z: c.z, range: c.range, radius: c.radius, volume: vol(c.x, c.y, c.z, c.id === 'graffiti' ? 0.06 : c.radius, c.id === 'graffiti' ? 1.2 : c.radius, c.id === 'graffiti' ? 0.7 : c.radius), priority: 0.4, s: c.id === 'boxes' ? struct('clue_boxes') : undefined })
  }
  return out
}

const CLUE_TEXT: Record<ClueId, { msg: string; note: string }> = {
  graffiti: {
    msg: '喷漆画的是一扇黄色的门，门框歪着，旁边写着「NOCLIP HERE →」，箭头指向墙角。墙角只是墙角。',
    note: '巷子西墙：黄色喷漆画的门 +「NOCLIP HERE →」。箭头指着墙角，敲了敲，实心砖。旁边有七道划痕，像在计数。',
  },
  boxes: {
    msg: '你翻开湿纸箱。几个空易拉罐、一条发霉的毯子……还有一股说不清的味道，像受潮的旧地毯。',
    note: '纸箱堆：空罐子、旧毯子，没有人。纸板被泡软了，闻起来像受潮的旧地毯。不知道为什么，让人想到荧光灯的嗡嗡声。',
  },
  cctv: {
    msg: '巷底墙上的旧监控，镜头被黄色胶带缠了好几圈。红灯还在一闪一闪。',
    note: '巷底的旧监控：镜头被黄色胶带缠死，指示灯还亮着。它到底在录什么？',
  },
}

const POSTER_TEXT = [
  '',
  '寻人启事：陈某，19 岁，身高 163，最后穿浅色外套。10 月 14 日晚 23 点后在第六大街附近失联。',
  '寻人启事：周某，24 岁，外卖骑手。最后一单送往旧仓路方向。',
  '寻人启事：一位老人，常在小区门口下棋。家属说他「去找一扇门」。',
  '寻人启事（便利店门上）：店员小许，夜班。监控只录到黄色的雪花点。',
]

/** 执行街区交互；返回是否已处理。 */
export function streetInteract(eng: Engine, id: string): boolean {
  if (!id.startsWith('st_')) return false
  const f = F(eng), p = eng.player
  if (id === 'st_down') {
    if (inAct4(eng)) { eng.msg('门把手冰凉，纹丝不动。', 'lore'); return true }
    if (!f.got_phone) { eng.msg('先把手机带上——导航和相机都在里面。', 'system'); return true }
    startFade(eng, 2.8, '安全通道 · 三楼 → 二楼 → 一楼', () => {
      p.x = STREET_ARRIVE.x; p.y = STREET_ARRIVE.y; p.z = STAIR_TOP_Z; p.vz = 0
      look.yaw = STREET_ARRIVE.yaw; look.pitch = -0.28
      if (eng.foyer) eng.foyer.lastYaw = look.yaw
      f.went_down = true
      if (p.prologue && (p.prologue.step === 'act0' || p.prologue.step === 'act1')) p.prologue.step = 'act2'
    })
    audio.uiTick()
    return true
  }
  if (id === 'st_up') {
    startFade(eng, 2.2, '一楼 → 二楼 → 三楼', () => {
      p.x = HOME_STAIR_DOOR.x - 0.7; p.y = HOME_STAIR_DOOR.y; p.z = 0; p.vz = 0
      look.yaw = Math.PI / 2; look.pitch = -0.05
      if (eng.foyer) { eng.foyer.lastYaw = look.yaw; eng.foyer.corridor.timer = 14 }
    })
    return true
  }
  if (id.startsWith('st_poster:')) {
    const v = Number(id.split(':')[1]) || 1
    f.read_poster = true
    f['poster_' + v] = true
    eng.emit({ kind: 'doc', text: 'foyer_missing' })
    eng.msg(POSTER_TEXT[v] ?? POSTER_TEXT[1], 'lore')
    return true
  }
  if (id.startsWith('st_clue:')) {
    const c = id.split(':')[1] as ClueId
    const first = !f['clue_' + c]
    f['clue_' + c] = true
    eng.msg(CLUE_TEXT[c].msg, 'lore')
    if (first) {
      addPhoneNote(eng, 'note', `调查 · ${STREET_CLUES.find((v) => v.id === c)!.label}`, CLUE_TEXT[c].note, '旧仓路后巷')
      eng.emit({ kind: 'toast', text: `笔记 + 调查记录（${cluesDone(eng)}/3）` })
      audio.pickup()
    }
    return true
  }
  const prop = STREET_PROPS.find((s) => 'st_' + s.id === id)
  if (prop) {
    const t: Record<string, string> = {
      noticeboard: '公告栏：电梯检修通知、物业电话、一张寻人启事被人撕掉了一半。',
      lift: '电梯门上贴着「检修中」。按钮按下去没有反应。',
      counter: inAct4(eng) ? '收银台后面没有人。收银机的屏幕上全是黄色的噪点。' : '收银台没人。屏幕上停着「请稍候，店员马上回来」。旁边的小电视在放午夜新闻。',
      vending: '售货机的灯管嗡嗡作响。最下面一排卖的是一种没见过的瓶装水，标签上写着「杏仁味」。',
      guardbooth: inAct4(eng) ? '门岗里的灯亮着，椅子还在转，人不见了。' : '门岗的保安趴在桌上睡着了，收音机小声放着天气预报。',
    }
    eng.msg(t[prop.kind] ?? '……', 'system')
    if (prop.kind === 'counter') f.visit_mart = true
    return true
  }
  return false
}

/** 拍照时判定拍到的对象（调查点/寻人启事）：视线夹角 < 22°、距离 < 9m。返回描述或 null。 */
export function streetPhotoSubject(eng: Engine): { id: string; title: string; text: string } | null {
  const p = eng.player
  if (p.level !== FOYER_ID || p.x < 26) return null
  const eye = (p.z || 0) + (p.crouching ? 0.95 : 1.62)
  const fx = -Math.sin(look.yaw) * Math.cos(look.pitch), fy = -Math.cos(look.yaw) * Math.cos(look.pitch), fz = Math.sin(look.pitch)
  let best: { id: string; title: string; text: string; a: number } | null = null
  const test = (id: string, title: string, text: string, x: number, y: number, z: number) => {
    const dx = x - p.x, dy = y - p.y, dz = z - eye, d = Math.hypot(dx, dy, dz)
    if (d > 9 || d < 0.2) return
    const a = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dy * fy + dz * fz) / d)))
    if (a < 0.38 && (!best || a < best.a)) best = { id, title, text, a }
  }
  for (const c of STREET_CLUES) test('clue_' + c.id, c.label, CLUE_TEXT[c.id].note.split('。')[0] + '。', c.x, c.y, c.z)
  for (const s of STREET_PROPS) if (s.kind === 'missing') test('poster', '寻人启事', '电线杆/公交站上的寻人启事。', s.x, s.y, s.top)
  return best
}

/** takePhoto 之后调用：识别拍到的调查点，写 flags 并补充照片说明。 */
export function onStreetPhoto(eng: Engine): string | null {
  const sub = streetPhotoSubject(eng)
  if (!sub) return null
  const f = F(eng)
  f['photo_' + sub.id] = true
  if (sub.id.startsWith('clue_')) {
    f.photo_any = true
    eng.emit({ kind: 'toast', text: `照片已存进笔记：${sub.title}` })
  }
  return `拍到：${sub.title}。${sub.text}`
}

function startFade(eng: Engine, dur: number, text: string, mid: () => void) {
  const rt = streetRt(eng)
  rt.fade = { t: 0, dur, text, mid }
}

/** HUD：黑场与字幕。 */
export function foyerFadeView(eng: Engine): { k: number; text: string } | null {
  const fd = eng.foyer?.street?.fade
  if (!fd) return null
  const u = fd.t / fd.dur
  const k = u < 0.3 ? u / 0.3 : u > 0.7 ? (1 - u) / 0.3 : 1
  return { k: Math.max(0, Math.min(1, k)), text: fd.text }
}

function say(eng: Engine, key: string, text: string, kind: 'lore' | 'system' = 'lore') {
  const f = F(eng)
  if (f['said_' + key]) return
  f['said_' + key] = true
  eng.msg(text, kind)
}

/** 每帧（前厅内）：黑场推进、区域标记、教程事件、论坛回帖、回程异常、循环传送、终点坠落、路灯明灭。 */
export function updateFoyerStreet(eng: Engine, dt: number) {
  const p = eng.player, f = F(eng), rt = streetRt(eng)
  rt.t += dt
  const now = performance.now()
  const realDt = rt.lastNow ? Math.min(0.5, Math.max(0, (now - rt.lastNow) / 1000)) : dt
  rt.lastNow = now
  if (rt.fade) {
    const prev = rt.fade.t
    rt.fade.t += Math.max(dt, realDt)
    if (prev < rt.fade.dur / 2 && rt.fade.t >= rt.fade.dur / 2 && rt.fade.mid) { const m = rt.fade.mid; rt.fade.mid = null; m() }
    if (rt.fade.t >= rt.fade.dur) rt.fade = null
  }
  // 回程异常：街景路人（NPC 系统的 ambient 路人）全部消失；读档到第 4 幕时同样不出现
  if (f.act4 && eng.npcs.some((n) => n.def.ambient)) eng.npcs = eng.npcs.filter((n) => !n.def.ambient)
  const area = streetAreaAt(p.x, p.y)
  if (area) {
    if (area.id !== 'lobby' && !f.outside) { f.outside = true; say(eng, 'outside', '夜风有点凉。小区里很安静，只有几扇窗还亮着。') }
    if (area.id === 'street' || area.id === 'cross') f.on_street = true
    if (area.id === 'store') { f.visit_mart = true; say(eng, 'mart', '便利店的冷柜嗡嗡作响。收银台后面没有人。') }
    if (area.id === 'alley' && p.y > 62.5) { if (!f.reached_alley) say(eng, 'alley', '旧仓路后巷。比想象中窄，墙上全是水渍。'); f.reached_alley = true; if (p.prologue && p.prologue.step === 'act2') p.prologue.step = 'act3' }
  }
  // 冲刺教程：室外冲刺累计 0.6s
  const moved = Math.hypot(p.x - rt.lastX, p.y - rt.lastY)
  if (area && area.outdoor && eng.input.sprint && (eng.input.mx || eng.input.my) && moved > 0.001 && moved < 2) { rt.sprintT += Math.max(dt, realDt); if (rt.sprintT > 0.8) eng.markTutorial('sprint') }
  // 三处调查 + 至少一张照片 → 论坛新回帖（2.5 秒后手机震动）→ 第 4 幕：回家
  if (!f.act4 && cluesDone(eng) === 3 && f.photo_any) {
    if (rt.replyT < 0) rt.replyT = 2.5
    rt.replyT -= Math.max(dt, realDt)
    if (rt.replyT <= 0) {
      f.act4 = true; f.forum_reply = true
      if (p.prologue) p.prologue.step = 'act4'
      addPhoneNote(eng, 'note', '论坛 · 新回帖', '边界线论坛 214L 匿名用户：「又一个去巷子里拍墙的 😂 拍到门了吗？没拍到就早点回家睡觉吧，明天还上班呢。」\n215L noclip_0：「回家的路上别回头。」', '旧仓路后巷')
      eng.emit({ kind: 'toast', text: '手机震了一下：论坛新回帖' })
      eng.msg('手机震了一下。论坛有人回帖：「拍到门了吗？没拍到就早点回家睡觉吧。」', 'lore')
      audio.uiTick()
    }
  }
  if (f.act4) updateReturn(eng, Math.max(dt, realDt)) // 演出计时按真实时间（低帧率下不拖长）
  rt.lastY = p.y
  rt.lastX = p.x
  updateLamps(eng, dt)
}

function updateReturn(eng: Engine, dt: number) {
  const p = eng.player, f = F(eng), rt = streetRt(eng)
  // 离开巷口：街上空无一人
  if (p.y < 60 && p.x > 100) say(eng, 'empty', '街上一个人都没有了。红绿灯只剩黄灯在闪。')
  if (p.x < 96 && p.y < 62) { f.dup1 = true; prepareBreakCube(); say(eng, 'dup1', '……洗衣店的灯箱，什么时候变成了「24H MART」？') }
  // 门洞循环：向北穿过小区门洞中线 → 无缝传送到巷口门洞（同一模块），第 3 次才放行
  const inGate = p.x >= GATE_ARCH.x0 && p.x < GATE_ARCH.x1
  if (inGate && !rt.fade && rt.lastY >= 45.0 && p.y < 45.0 && !f.loop2) {
    p.x += ARCH_LOOP_DELTA.dx; p.y += ARCH_LOOP_DELTA.dy
    rt.lastY = p.y; rt.lastX = p.x
    if (!f.loop1) { f.loop1 = true; eng.msg('……你从巷子口走了出来。', 'lore') }
    else { f.loop2 = true; eng.msg('又是巷子口。身后的路灯一盏一盏地熄了。', 'lore') }
    eng.camShake = Math.max(eng.camShake, 0.25)
    return
  }
  // 放行后：小区里的灯全灭，走进小区深处 → 地面碎裂坠落
  if (f.loop2 && p.y < 44 && p.x < 80 && p.y > 15) {
    say(eng, 'home_dark', '小区里所有的窗都黑着。你家那栋楼……少了一层。')
    if (p.y < 39 && rt.fallT < 0) {
      rt.fallT = 1.6
      prepareBreakCube()
      eng.msg('脚下的地砖发出一声脆响，裂缝里透出一片昏黄的光。', 'lore')
      eng.camShake = Math.max(eng.camShake, 1.2)
      audio.uiTick()
    }
  }
  if (rt.fallT > 0) {
    rt.fallT -= dt
    eng.camShake = Math.max(eng.camShake, 0.9)
    if (rt.fallT < 0.5) requestBreakShot(eng) // M4：RealityBreak 起手画面（最后一帧 3D 场景）
    if (rt.fallT <= 0) { rt.fallT = 0; f.fell = true; eng.takeExit(eng.levelDef.exits[0]) }
  }
}

/** 路灯明灭：常态微弱电流闪；回程异常时靠近玩家的灯频闪、身后的灯熄灭。 */
function updateLamps(eng: Engine, dt: number) {
  const rt = streetRt(eng), f = F(eng), p = eng.player
  if (!eng.map) return
  rt.lamps ??= streetLampLights(eng.map)
  const t = rt.t
  for (let i = 0; i < STREET_LAMPS.length; i++) {
    const L = STREET_LAMPS[i]
    let k = 1
    const h = Math.sin(i * 12.9898) * 43758.5453, rnd = h - Math.floor(h)
    if (L.area === 'arch') k = f.act4 ? 0 : 1
    else if (f.act4) {
      const d = Math.hypot(L.x - p.x, L.y - p.y)
      if (f.loop2) k = L.area === 'compound' ? (i % 4 === 0 ? flick(t, rnd, 9) * 0.6 : 0) : rnd < 0.5 ? 0 : flick(t, rnd, 7)
      else if (f.loop1) k = rnd < 0.25 ? 0 : d < 26 ? flick(t, rnd, 6) : 1
      else k = d < 22 ? flick(t, rnd, 4) : 1
    } else if (rnd > 0.88 && L.area === 'street') k = 0.7 + 0.3 * flick(t, rnd, 1.5) // 一两盏老路灯接触不良
    rt.lampLevel[i] += (k - rt.lampLevel[i]) * Math.min(1, dt * 18)
  }
  for (const e of rt.lamps) {
    const i = STREET_LAMPS.indexOf(e.lamp)
    e.light.intensityMul = e.base * rt.lampLevel[i]
  }
}
function flick(t: number, seed: number, rate: number): number {
  const a = Math.sin(t * rate * 3.1 + seed * 40) + Math.sin(t * rate * 7.7 + seed * 13) * 0.6
  return a > 0.55 ? 0.08 : a > 0.3 ? 0.6 : 1
}

/** 渲染层每帧可见性（FoyerStreetScene.update）。 */
export interface StreetVisual { act4: boolean; peds: boolean; dup: 0 | 1 | 2; lamps: Float32Array; traffic: 'cycle' | 'flash'; windowsDark: boolean; t: number }
export function streetVisual(eng: Engine): StreetVisual {
  const f = eng.player.prologue?.flags ?? {}
  const rt = streetRt(eng)
  const act4 = !!f.act4 && eng.player.prologue?.step !== 'done'
  return { act4, peds: !act4, dup: act4 ? (f.loop1 ? 2 : f.dup1 || (eng.player.x < 100) ? 1 : 0) : 0, lamps: rt.lampLevel, traffic: act4 ? 'flash' : 'cycle', windowsDark: act4 && !!f.loop2, t: rt.t }
}

/** 任务追踪（下楼之后）。 */
export function streetQuest(eng: Engine): { title: string; items: { text: string; done: boolean }[] } {
  const f = F(eng)
  if (f.act4) {
    const items = [{ text: '原路回家', done: false }]
    if (f.dup1) items.push({ text: '……那家便利店，刚才是不是见过？', done: true })
    if (f.loop1) items.push({ text: '怎么又回到了巷子口？', done: true })
    if (f.loop2) items.push({ text: '别回头。', done: false })
    return { title: '回家', items }
  }
  return {
    title: '旧仓路后巷',
    items: [
      { text: '下楼，出小区', done: !!f.on_street },
      { text: '看看寻人启事', done: !!f.read_poster },
      { text: '找到旧仓路后巷', done: !!f.reached_alley },
      { text: '调查：墙上的涂鸦', done: !!f.clue_graffiti },
      { text: '调查：湿纸箱', done: !!f.clue_boxes },
      { text: '调查：旧监控', done: !!f.clue_cctv },
      { text: '用手机相机拍下可疑处', done: !!f.photo_any },
    ],
  }
}

/** 手机照片地点名（街区）。 */
export function streetPlaceName(x: number, y: number): string | null {
  return streetAreaAt(x, y)?.name ?? null
}
