// 后室装修公司「施工许可」与 Level 0.2「重塑的混乱」入口（第一阶段）。
//   1. 与后室装修公司声望 > 60 时，在其员工对话里出现「申请施工许可」（每局只发一张，关键物品）。
//   2. 在 Level 0 任意处使用：玩家所在区域逐渐停嗡鸣、地毯变干、灯光转冷白，周围出现施工路障，
//      附近墙上出现一扇「施工场所的门」→ 进入 Level 0.2，并完成任务目标「发现『重塑的混乱』」。
//   3. 许可可反复使用，但每次用后需要「切换层级刷新」：离开 Level 0 再回来才能再次使用。
//   4. 施工点永久留存：player.remodel.sites（世界坐标），区块实例化时注入（world/remodelSites.ts）。
import type { Engine } from '../engine'
import { audio } from '../core/audio'
import { look } from '../renderer/shared'
import { l0Sample, l0WallSurface, l0Meeting } from '../world/l0Architecture'
import { REMODEL_TUNING, doorFront, propFootprint, remodelProgress, remodelStrengthAt, setRemodelSites, type RemodelProp, type RemodelSite } from '../world/remodelSites'
import { L02_ID } from '../world/l02Layout'
import { rebuildL0, restitch } from '../world/infinite'
import { canOccupy, PLAYER_RADIUS } from '../core/player'

export const PERMIT_ITEM = 'brc_permit'

/** 存档结构（写入 player.remodel）。 */
export interface RemodelState {
  v: 1
  /** 本局已发放过许可（只发一张；即便之后丢失也不再补发）。 */
  permitIssued: boolean
  /** 当前可用（使用后置 false，离开 Level 0 再回来时恢复）。 */
  armed: boolean
  sites: RemodelSite[]
  /** 最近一次从哪个施工点进入 Level 0.2（回到 L0 时落在这扇门旁）。 */
  enteredSite?: string
}

export function remodelState(eng: Engine): RemodelState {
  const p = eng.player
  const st = (p.remodel ??= { v: 1, permitIssued: false, armed: true, sites: [] })
  st.sites ??= []
  if (st.armed === undefined) st.armed = true
  return st
}

// ---------- 1. 申请许可 ----------
export function canRequestPermit(eng: Engine): boolean {
  return (eng.rep.brc ?? 0) > REMODEL_TUNING.permitRep && !remodelState(eng).permitIssued
}
export function requestPermit(eng: Engine): boolean {
  const st = remodelState(eng)
  if (st.permitIssued) { eng.msg('他们已经给过你一张许可了。', 'system'); return false }
  if ((eng.rep.brc ?? 0) <= REMODEL_TUNING.permitRep) { eng.msg('工人看着你，白色的圆眼一动不动。（需要与后室装修公司声望 > 60）', 'system'); return false }
  if (!eng.addItem(PERMIT_ITEM)) { eng.msg('背包满了——空出一格来收下施工许可。', 'system'); return false }
  st.permitIssued = true
  st.armed = true
  try { audio.pickup(true) } catch { /* 测试环境 */ }
  eng.msg('工人从白围裙的口袋里抽出一张盖了钢印的单据，塞进你手里，然后转身继续敲打墙面。', 'lore')
  eng.msg('获得「施工许可」——在 Level 0 使用。', 'loot')
  eng.emit({ kind: 'toast', text: '获得 施工许可' })
  eng.emit({ kind: 'doc', text: 'brc_permit' }) // 第五轮：展示施工许可证单据（BrcDocument）
  return true
}

// ---------- 2. 使用许可 ----------
/** 当前不能使用的原因（null=可用）。 */
export function permitBlockReason(eng: Engine): string | null {
  const st = remodelState(eng)
  if (eng.player.level !== 0) return '施工许可只对 Level 0 有效。'
  if (!st.armed) return '许可上的登记章还没干——每次使用后需要「切换层级刷新」：离开 Level 0 再回来，才能再次使用。'
  const m = eng.map
  if (!m?.inf?.l0) return '这里没法施工。'
  const e = l0Sample(m, eng.player.x, eng.player.y)
  if ((e?.red ?? 0) > 0.1) return '红色的墙纸在许可边缘洇开了一圈。这里不归装修公司管。'
  if (l0Meeting(m, eng.player.x, eng.player.y) > 0) return '马尼拉房间附近不受理施工。'
  return null
}

export function usePermit(eng: Engine): boolean {
  const why = permitBlockReason(eng)
  if (why) { eng.msg(why, 'system'); eng.emit({ kind: 'toast', text: why }); return false }
  const m = eng.map!, inf = m.inf!, p = eng.player
  const st = remodelState(eng)
  const walls = m.structures.filter((s) => s.data?.l0Wall && !s.data?.l0Prop).map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h, bottom: Number(s.data?.bottom), top: Number(s.data?.top) }))
  // 施工门：优先玩家正前方的墙面，退而求其次最近墙面
  const fx = p.x - Math.sin(look.yaw) * 1.2, fy = p.y - Math.cos(look.yaw) * 1.2
  const hit = l0WallSurface(walls, fx, fy) ?? l0WallSurface(walls, p.x, p.y)
  if (!hit) { const t = '附近没有能开门的墙。靠近一面完整的墙再试。'; eng.msg(t, 'system'); eng.emit({ kind: 'toast', text: t }); return false }
  const door = { x: hit.x + inf.ox, y: hit.y + inf.oy, yaw: hit.yaw }
  const nx = Math.sin(door.yaw), ny = Math.cos(door.yaw), tx = ny, ty = -nx
  const id = `rm${Math.round(eng.time * 10)}_${Math.round(door.x * 10)}_${Math.round(door.y * 10)}`
  const site: RemodelSite = { id, x: door.x + nx * 2.4, y: door.y + ny * 2.4, r: REMODEL_TUNING.zoneR, door, t0: eng.time, props: [] }
  // 路障：门前留出 1.4 m 宽通道；两侧条纹护栏、锥桶、「施工中」立牌、施工灯
  const candidates: RemodelProp[] = [
    { kind: 'barricade', x: door.x + nx * 1.7 + tx * 1.35, y: door.y + ny * 1.7 + ty * 1.35, yaw: door.yaw + Math.PI / 2 },
    { kind: 'barricade', x: door.x + nx * 1.7 - tx * 1.35, y: door.y + ny * 1.7 - ty * 1.35, yaw: door.yaw + Math.PI / 2 },
    { kind: 'cone', x: door.x + nx * 2.7 + tx * 0.95, y: door.y + ny * 2.7 + ty * 0.95, yaw: 0 },
    { kind: 'cone', x: door.x + nx * 2.7 - tx * 0.95, y: door.y + ny * 2.7 - ty * 0.95, yaw: 0.6 },
    { kind: 'cone', x: door.x + nx * 0.45 + tx * 1.55, y: door.y + ny * 0.45 + ty * 1.55, yaw: 1.1 },
    { kind: 'cone', x: door.x + nx * 0.45 - tx * 1.6, y: door.y + ny * 0.45 - ty * 1.6, yaw: 2.3 },
    { kind: 'sign', x: door.x + nx * 3.3 + tx * 2.0, y: door.y + ny * 3.3 + ty * 2.0, yaw: door.yaw + 0.35 },
    { kind: 'worklamp', x: door.x + nx * 0.55 + tx * 2.3, y: door.y + ny * 0.55 + ty * 2.3, yaw: door.yaw - 0.5 },
  ]
  const clearOf = (x: number, y: number, pad: number) => !walls.some((w) => w.bottom < 1.5 && w.top > 0 && x - inf.ox > w.x - pad && x - inf.ox < w.x + w.w + pad && y - inf.oy > w.y - pad && y - inf.oy < w.y + w.h + pad)
  for (const c of candidates) {
    const { hw } = propFootprint(c)
    if (!clearOf(c.x, c.y, hw + 0.05)) continue
    // 不压住玩家当前站位
    if (Math.hypot(c.x - inf.ox - p.x, c.y - inf.oy - p.y) < hw + PLAYER_RADIUS + 0.15) continue
    site.props.push(c)
  }
  st.sites.push(site)
  st.armed = false
  setRemodelSites(st.sites)
  injectLive(eng, site)
  try { audio.uiTick() } catch { /* */ }
  eng.msg('你把施工许可按在墙上。纸面上的钢印亮了一下——荧光灯的嗡鸣开始变小。', 'lore')
  eng.msg('附近的墙上出现了一扇施工场所的门。许可需要「切换层级刷新」后才能再次使用。', 'system')
  eng.emit({ kind: 'toast', text: '施工许可已生效' })
  return true
}

/** 把新施工点注入当前已加载的区块（不重建渲染几何：门与路障由 renderer/remodelSites.ts 单独绘制）。 */
function injectLive(eng: Engine, site: RemodelSite) {
  const m = eng.map!, inf = m.inf!
  const key = `${Math.floor(site.door.x / 32)},${Math.floor(site.door.y / 32)}`
  const keys = new Set([key, ...site.props.map((p) => `${Math.floor(p.x / 32)},${Math.floor(p.y / 32)}`)])
  // 复用区块实例化逻辑：重算受影响区块的出口/碰撞，保留其它活体对象身份
  for (const k of keys) {
    const c = inf.chunks.get(k)
    if (!c) continue
    const [cx, cy] = k.split(',').map(Number)
    const f = doorFront(site, 0.62)
    if (k === key) c.exits.push({ def: { kind: 'remodeldoor', name: '施工场所的门', dest: L02_ID, anim: 'shutter' }, x: f.x - 0.5 - inf.ox, y: f.y - 0.5 - inf.oy, discovered: true, remodelSite: site.id })
    for (const [i, p] of site.props.entries()) {
      if (Math.floor(p.x / 32) !== cx || Math.floor(p.y / 32) !== cy) continue
      const { hw, hd } = propFootprint(p)
      const ca = Math.abs(Math.cos(p.yaw)), sa = Math.abs(Math.sin(p.yaw))
      const ex = hw * ca + hd * sa, ey = hw * sa + hd * ca
      c.structures.push({ kind: 'pillar', x: p.x - ex - inf.ox, y: p.y - ey - inf.oy, w: ex * 2, h: ey * 2, solid: true, data: { l0Wall: 1, l0Prop: 1, remodelProp: 1, bottom: 0, top: p.kind === 'cone' ? 0.7 : 1.1, sid: 0x7a000000 + i } })
    }
  }
  restitch(m)
}

// ---------- 3. 每帧：改造渐变 / 嗡鸣 ----------
/** 玩家所在处的改造强度（0..1），l0State.tickL0 用它压低嗡鸣。 */
export function remodelHumDuck(eng: Engine): number {
  const inf = eng.map?.inf
  if (eng.player.level !== 0 || !inf) return 0
  return remodelStrengthAt(eng.player.x + inf.ox, eng.player.y + inf.oy, eng.time, remodelState(eng).sites)
}
export function tickRemodel(eng: Engine) {
  if (eng.player.level !== 0) return
  const st = eng.player.remodel
  if (!st) return
  for (const s of st.sites) if (!s.done && remodelProgress(s, eng.time) >= 1) s.done = true
}

// ---------- 4. 切换层级 ----------
/** loadLevel 开头调用：离开 Level 0 → 许可刷新；进入 L0 前同步施工点（区块实例化要用）。 */
export function remodelOnLevelChange(eng: Engine, from: number, to: number, restoring: boolean) {
  const st = remodelState(eng)
  if (!restoring && from === 0 && to !== 0 && !st.armed) {
    st.armed = true
    if (eng.hasItem(PERMIT_ITEM)) eng.msg('施工许可上的登记章干了。回到 Level 0 后可以再次使用。', 'system')
  }
  setRemodelSites(st.sites)
}
/** 走进施工门（takeExit 之前）：记录施工点、完成「发现『重塑的混乱』」。 */
export function remodelBeforeEnter(eng: Engine, siteId: string | undefined) {
  const st = remodelState(eng)
  if (siteId) st.enteredSite = siteId
  eng.enterL0Sublevel('remade_chaos')
}
/** 读档后：玩家状态已恢复，重新同步施工点并重建 L0 区块（首帧前，无可见代价）。 */
export function syncRemodelAfterLoad(eng: Engine) {
  const st = remodelState(eng)
  setRemodelSites(st.sites)
  for (const s of st.sites) s.done = true
  if (eng.player.level === 0 && eng.map?.inf?.l0) rebuildL0(eng.map, eng.levelDef)
}
/** 回到 Level 0 时落在施工门旁（loadLevel(0) 在 restoreL0 之后调用）。返回是否放置成功。 */
export function placeAtRemodelDoor(eng: Engine, siteId?: string): boolean {
  const st = remodelState(eng)
  const site = st.sites.find((s) => s.id === (siteId ?? st.enteredSite)) ?? st.sites[st.sites.length - 1]
  const m = eng.map, inf = m?.inf
  if (!site || !m || !inf) return false
  const f = doorFront(site, 1.1)
  eng.player.x = f.x - inf.ox; eng.player.y = f.y - inf.oy
  eng.updateInfiniteWindow()
  // 门前被路障占住时小范围找可站点
  const px = eng.player.x, py = eng.player.y
  if (!canOccupy(m, px, py, PLAYER_RADIUS, { z: 0 })) {
    outer: for (let r = 0.25; r <= 2.5; r += 0.25) for (let a = 0; a < 16; a++) {
      const x = px + Math.cos(a * Math.PI / 8) * r, y = py + Math.sin(a * Math.PI / 8) * r
      if (canOccupy(m, x, y, PLAYER_RADIUS, { z: 0 })) { eng.player.x = x; eng.player.y = y; break outer }
    }
  }
  eng.player.z = 0; eng.player.floor = 0
  // 背对施工门（面朝房间）：相机前向 = (-sin yaw, -cos yaw)
  look.yaw = site.door.yaw + Math.PI
  return true
}

/** 调试：直接给声望/许可/重置冷却。 */
export function devRemodel(eng: Engine, op: 'rep' | 'permit' | 'rearm' | 'clear') {
  const st = remodelState(eng)
  if (op === 'rep') { eng.rep.brc = REMODEL_TUNING.permitRep + 1; eng.msg(`[调试] 后室装修公司声望 = ${eng.rep.brc}`, 'system') }
  if (op === 'permit') { if (!eng.hasItem(PERMIT_ITEM)) eng.addItem(PERMIT_ITEM); st.permitIssued = true; st.armed = true; eng.msg('[调试] 已发放施工许可', 'system') }
  if (op === 'rearm') { st.armed = true; eng.msg('[调试] 施工许可冷却已重置', 'system') }
  if (op === 'clear') { st.sites = []; setRemodelSites(st.sites); if (eng.player.level === 0 && eng.map?.inf?.l0) rebuildL0(eng.map, eng.levelDef); eng.msg('[调试] 已清除全部施工点', 'system') }
}

// QA 钩子（无头测试读取；不参与游戏逻辑）
;(globalThis as unknown as { __remodelQA?: unknown }).__remodelQA = { remodelHumDuck, permitBlockReason, remodelState, canRequestPermit }
