// Level 0.2「重塑的混乱」第二阶段：崩塌事件（每帧调度）、粉尘、口罩、返回门停止崩塌，以及插座充电 / Wi‑Fi / 板夹 / 洗手间交互。
// 纯数据（矩形、地面高度、碰撞切分）见 world/l02Collapse.ts；画面见 renderer/l02Scene.ts。
// 进入 Level 0.2 时 resetL02(eng) 清空一切——崩塌不持久，重进即完全复原。
import type { Engine } from '../engine'
import type { Structure } from '../core/types'
import { audio } from '../core/audio'
import { restitch } from '../world/infinite'
import { L02_ID, L02_TILE_X, L02_TILE_Z, l02LampTile, l02NearestDoor, l02DoorsNear, L02_SPAWN, l02Layout, l02Neighbours } from '../world/l02Layout'
import { l0TrimWalls } from '../world/l0WallDetails'
import {
  L02_STAGES, L02_TUNING, l02Collapse, resetL02Collapse, applyCollapseToStructures, pickWallSegment, extendFreeEnds, planHole, l02UnderSlab, l02CeilingAt, L02_HEAD_CLEAR, rectsOverlap,
  type Rect, type RemovedWall, type Hole, type FallenTile,
} from '../world/l02Collapse'
import { phoneState, carriesPhone } from './phone'

type Ev =
  | { kind: 'tile'; t0: number; tile: FallenTile; hitDone: boolean; landDone: boolean }
  | { kind: 'wall'; t0: number; wall: RemovedWall; zone: Rect; landDone: boolean }
  | { kind: 'floor'; t0: number; hole: Hole; dropDone: boolean }

export interface L02Runtime {
  /** 崩塌时钟（秒；只在本层推进，调试跳阶段会改它）。 */
  t: number
  stage: number
  stopped: boolean
  nextTile: number; nextWall: number; nextFloor: number
  events: Ev[]
  puffs: { x: number; y: number; k: number; t0: number }[]
  /** 玩家处粉尘浓度（0..1，平滑）。 */
  dust: number
  lull: boolean
  dmgAcc: number
  coughT: number
  /** 正在充电的插座（世界坐标）。 */
  charge: { x: number; y: number } | null
  /** 已播报返回门方位。 */
  hinted?: boolean
  /** 统计（QA 用）。 */
  stats: { tiles: number; walls: number; floors: number; tileHits: number; wallHits: number; falls: number; dustDmg: number }
}

const rnd = Math.random
function expDelay(rate: number) { return rate <= 0 ? Infinity : Math.max(1.3, -Math.log(1 - rnd()) * 60 / rate) }

export function resetL02(eng: Engine) {
  resetL02Collapse()
  eng.l02 = {
    t: 0, stage: 0, stopped: false, nextTile: Infinity, nextWall: Infinity, nextFloor: Infinity, events: [], puffs: [], dust: 0, lull: false, dmgAcc: 0, coughT: 0, charge: null,
    stats: { tiles: 0, walls: 0, floors: 0, tileHits: 0, wallHits: 0, falls: 0, dustDmg: 0 },
  }
  scheduleAll(eng.l02)
}
function stageAt(t: number) { let s = 0; for (let i = 0; i < L02_STAGES.length; i++) if (t >= L02_STAGES[i].at) s = i; return s }
function scheduleAll(rt: L02Runtime) {
  const st = L02_STAGES[Math.max(0, rt.stage)]
  rt.nextTile = rt.t + expDelay(st.tileRate) * 0.6
  rt.nextWall = rt.t + expDelay(st.wallRate) * 0.6
  rt.nextFloor = rt.t + expDelay(st.floorRate) * 0.6
}

// ---------- 坐标与查询 ----------
const W = (eng: Engine) => { const inf = eng.map!.inf!; return { x: eng.player.x + inf.ox, y: eng.player.y + inf.oy } }
function tallWalls(eng: Engine): Rect[] {
  const inf = eng.map!.inf!
  return eng.map!.structures.filter((s) => s.data?.l0Wall && !s.data?.l0Prop && !s.data?.l02House && Number(s.data?.bottom) <= 0 && Number(s.data?.top) > 2)
    .map((s) => ({ x: s.x + inf.ox, y: s.y + inf.oy, w: s.w, h: s.h }))
}
/** 这面墙是否装了防撞条（与渲染同一选墙规则 l0TrimWalls：本块 + 8 邻块的墙）。 */
function wallHasRail(eng: Engine, w: Rect): boolean {
  const inf = eng.map!.inf!, cx = Math.floor((w.x + w.w / 2) / 32), cy = Math.floor((w.y + w.h / 2) / 32)
  const a = l02Layout(inf.seed, cx, cy)
  const host = a.walls.find((v) => rectsOverlap(v, w, -0.01))
  if (!host) return false
  return l0TrimWalls(inf.seed, [...a.walls, ...l02Neighbours(inf.seed, a).flatMap((n) => n.walls)]).has(host)
}
function fixRects(eng: Engine): Rect[] {
  const inf = eng.map!.inf!
  return eng.map!.structures.filter((s) => s.kind === 'l02fix').map((s) => ({ x: s.x + inf.ox, y: s.y + inf.oy, w: s.w, h: s.h }))
}
/** 把当前崩塌状态注入已加载的区块（切墙 + 房屋碰撞），并重新缝合窗口。 */
function inject(eng: Engine) {
  const m = eng.map!, inf = m.inf!
  for (const c of inf.chunks.values()) c.structures = applyCollapseToStructures(c.structures, c.cx * 32, c.cy * 32, inf.ox, inf.oy)
  restitch(m)
}
function hurt(eng: Engine, dmg: number, msg: string, cause: string) {
  if (eng.dev.god) { eng.msg(`${msg}（无敌：未扣血）`, 'damage'); return }
  const p = eng.player
  p.hp -= dmg
  eng.camShake = Math.min(1, eng.camShake + 0.55)
  try { audio.hurt() } catch { /* */ }
  eng.emit({ kind: 'damage' })
  eng.msg(`${msg}（受到 ${Math.round(dmg)} 点伤害）`, 'damage')
  if (p.hp <= 0) eng.die(cause)
}
const inRect = (r: Rect, x: number, y: number, pad = 0) => x >= r.x - pad && y >= r.y - pad && x < r.x + r.w + pad && y < r.y + r.h + pad
function shakeAt(eng: Engine, x: number, y: number, k: number) {
  const P = W(eng), d = Math.hypot(P.x - x, P.y - y)
  eng.camShake = Math.min(1, eng.camShake + k * Math.max(0, 1 - d / 16))
}

// ---------- 事件生成 ----------
function spawnTile(eng: Engine, rt: L02Runtime, at?: { x: number; y: number }): boolean {
  const P = W(eng), walls = tallWalls(eng), st = l02Collapse()
  for (let tries = 0; tries < (at ? 1 : 14); tries++) {
    let x: number, y: number
    if (at) { x = at.x; y = at.y } else if (rnd() < L02_TUNING.tileAimShare) { x = P.x + (rnd() - 0.5) * 1.6; y = P.y + (rnd() - 0.5) * 1.6 } else { const a = rnd() * Math.PI * 2, r = 3 + rnd() * 9; x = P.x + Math.cos(a) * r; y = P.y + Math.sin(a) * r }
    const kx = Math.floor(x / L02_TILE_X), kz = Math.floor(y / L02_TILE_Z)
    const lamp = l02LampTile(kx, kz)
    const tile: FallenTile = { x: kx * L02_TILE_X, y: kz * L02_TILE_Z, w: L02_TILE_X, h: L02_TILE_Z, t0: rt.t }
    if (lamp) continue
    if (walls.some((w) => rectsOverlap(tile, w, 0.04))) continue
    if (st.tiles.some((t) => Math.abs(t.x - tile.x) < 0.01 && Math.abs(t.y - tile.y) < 0.01)) continue
    st.tiles.push(tile)
    if (st.tiles.length > L02_TUNING.maxTiles) st.tiles.shift()
    rt.events.push({ kind: 'tile', t0: rt.t, tile, hitDone: false, landDone: false })
    rt.stats.tiles++
    try { audio.collapseSfx('creak', 0.6) } catch { /* */ }
    return true
  }
  return false
}
function spawnWall(eng: Engine, rt: L02Runtime, force = false, at?: { x: number; y: number; len?: number }): boolean {
  // Keep every cut until leaving this visit so rendered walls and live collision stay consistent.
  if (l02Collapse().removedWalls.length >= L02_TUNING.maxWalls) return false
  const st = l02Collapse(), P = at ?? W(eng), doors = l02DoorsNear(eng.map!.inf!.seed, P.x, P.y, 40)
  const cand = tallWalls(eng).filter((w) => {
    const dx = Math.max(w.x - P.x, 0, P.x - w.x - w.w), dy = Math.max(w.y - P.y, 0, P.y - w.y - w.h), d = Math.hypot(dx, dy)
    return (at ? d < 0.6 : d > (force ? 1.2 : 2.4) && d < 14) && Math.max(w.w, w.h) >= 1.2 && !doors.some((door) => rectsOverlap(w, door.wall, 0.5))
  }).sort((a, b) => Math.hypot(a.x + a.w / 2 - P.x, a.y + a.h / 2 - P.y) - Math.hypot(b.x + b.w / 2 - P.x, b.y + b.h / 2 - P.y))
  if (!cand.length) return false
  const w = at ? cand[0] : cand[Math.floor(rnd() * Math.min(6, cand.length))]
  const len = at?.len ?? L02_TUNING.wallSegMin + rnd() * (L02_TUNING.wallSegMax - L02_TUNING.wallSegMin)
  // 自由端外扩丢弃矩形（墙端面/护角/防撞条外伸部分一并移除）；端头外 5 cm 仍在某面全高墙里（含本墙剩余部分）= 连着墙，不外扩
  const seg = extendFreeEnds(pickWallSegment(w, P.x, P.y, len, rt.t, rnd()), tallWalls(eng))
  seg.rail = wallHasRail(eng, w)
  // 一半概率倒向玩家一侧（更危险，但有预警）
  const horiz = seg.axis === 'x', side = horiz ? Math.sign(P.y - (w.y + w.h / 2)) : Math.sign(P.x - (w.x + w.w / 2))
  if ((force || rnd() < 0.5) && side) seg.dir = side > 0 ? 1 : -1
  const H = 2.75
  const zone: Rect = horiz ? { x: seg.x, y: seg.dir > 0 ? w.y + w.h : w.y - H, w: seg.w, h: H } : { x: seg.dir > 0 ? w.x + w.w : w.x - H, y: seg.y, w: H, h: seg.h }
  st.removedWalls.push(seg)
  inject(eng)
  rt.events.push({ kind: 'wall', t0: rt.t, wall: seg, zone, landDone: false })
  rt.stats.walls++
  try { audio.collapseSfx('crack', 0.8) } catch { /* */ }
  return true
}
function spawnFloor(eng: Engine, rt: L02Runtime, at?: { x: number; y: number }): boolean {
  const P = W(eng), st = l02Collapse(), doors = l02DoorsNear(eng.map!.inf!.seed, P.x, P.y, 40)
  if (st.holes.length >= L02_TUNING.maxHoles) return false
  const walls = tallWalls(eng), avoid = [...doors.map((d) => d.clear), ...fixRects(eng), ...st.removedWalls]
  for (let tries = 0; tries < (at ? 3 : 8); tries++) {
    let cx: number, cy: number
    if (at) { cx = at.x + (tries ? (rnd() - 0.5) * 3 : 0); cy = at.y + (tries ? (rnd() - 0.5) * 3 : 0) } else if (rnd() < (rt.stage >= 4 ? 0.35 : 0.22)) { cx = P.x; cy = P.y } else { const a = rnd() * Math.PI * 2, r = 2.5 + rnd() * 4.5; cx = P.x + Math.cos(a) * r; cy = P.y + Math.sin(a) * r }
    const h = planHole(cx, cy, walls, avoid, st.nextHole, rt.t, rnd())
    if (!h) continue
    st.nextHole++
    st.holes.push(h)
    rt.events.push({ kind: 'floor', t0: rt.t, hole: h, dropDone: false })
    rt.stats.floors++
    try { audio.collapseSfx('rumble', 0.7) } catch { /* */ }
    return true
  }
  return false
}

// ---------- 每帧 ----------
export function tickL02(eng: Engine, dt: number) {
  const rt = eng.l02
  if (!rt || eng.player.level !== L02_ID || !eng.map?.inf) return
  const p = eng.player, P = W(eng), T = L02_TUNING
  eng.map.inf.l02 = true
  rt.t += dt
  // 返回门（自然生成，可能有多扇）：入口处播报最近的一扇；靠近任意一扇即停止崩塌
  const seed = eng.map.inf.seed
  if (!rt.hinted) {
    rt.hinted = true
    const door = l02NearestDoor(seed, L02_SPAWN.x, L02_SPAWN.y)
    const a = Math.atan2(door.y - L02_SPAWN.y, door.x - L02_SPAWN.x), names = ['东', '东南', '南', '西南', '西', '西北', '北', '东北']
    const dir = names[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]
    eng.msg(`门在身后合上，消失在墙里。施工单背面潦草地写着：「最近的一扇返回 Level 0 的门在入口${dir}方向，约 ${Math.round(Math.hypot(door.x - L02_SPAWN.x, door.y - L02_SPAWN.y))} 米。」`, 'lore')
  }
  if (!rt.stopped && l02DoorsNear(seed, P.x, P.y, T.stopR + 1.5).some((door) => Math.hypot(P.x - door.x, P.y - (door.y + 0.8)) < T.stopR)) {
    rt.stopped = true
    eng.msg('你摸到了那扇门的把手。身后的崩塌声一下子停了，只剩粉尘还在慢慢落下。', 'lore')
    eng.emit({ kind: 'toast', text: '崩塌停止' })
  }
  // 阶段
  const s = stageAt(rt.t)
  if (s !== rt.stage) {
    rt.stage = s
    if (!rt.stopped) {
      const S = L02_STAGES[s]
      if (S.msg) eng.msg(S.msg, s >= 3 ? 'damage' : 'lore')
      eng.emit({ kind: 'toast', text: `崩塌阶段 ${s}：${S.name}` })
      scheduleAll(rt)
    }
  }
  const S = L02_STAGES[rt.stage]
  rt.lull = rt.stage >= 1 && (rt.t % T.lullEvery) > T.lullEvery - T.lullDur
  // 新事件
  if (!rt.stopped && !rt.lull) {
    if (rt.t >= rt.nextTile) { spawnTile(eng, rt); rt.nextTile = rt.t + expDelay(S.tileRate) }
    if (rt.t >= rt.nextWall) { spawnWall(eng, rt); rt.nextWall = rt.t + expDelay(S.wallRate) }
    if (rt.t >= rt.nextFloor) { spawnFloor(eng, rt); rt.nextFloor = rt.t + expDelay(S.floorRate) }
  }
  // 事件推进（已开始的事件即便停止崩塌也会完成——东西已经在往下掉了）
  for (const e of rt.events) {
    const age = rt.t - e.t0
    if (e.kind === 'tile') {
      const fall = age - T.tileWarn
      if (!e.hitDone && fall >= 0.49) {
        e.hitDone = true
        if (inRect(e.tile, P.x, P.y, 0.3) && p.z > -0.5 && p.z < 1.2) { rt.stats.tileHits++; hurt(eng, T.tileDamage, '一块吊顶板砸在你头上', '被掉落的吊顶板砸中') }
      }
      if (!e.landDone && fall >= 0.77) { e.landDone = true; rt.puffs.push({ x: e.tile.x + 0.6, y: e.tile.y + 0.3, k: T.puffTile, t0: rt.t }); shakeAt(eng, e.tile.x, e.tile.y, 0.12); try { audio.collapseSfx('tile', 0.7) } catch { /* */ } }
    } else if (e.kind === 'wall') {
      if (!e.landDone && age >= T.wallWarn + 0.9) {
        e.landDone = true
        const c = { x: e.wall.x + e.wall.w / 2, y: e.wall.y + e.wall.h / 2 }
        rt.puffs.push({ x: c.x, y: c.y, k: T.puffWall, t0: rt.t })
        shakeAt(eng, c.x, c.y, 0.5)
        try { audio.collapseSfx('wall', 1) } catch { /* */ }
        if (inRect(e.zone, P.x, P.y, 0.15) && p.z > -0.5) { rt.stats.wallHits++; hurt(eng, T.wallDamage, '倒下的隔墙压在你身上', '被倒塌的隔墙压住') }
      }
    } else if (e.kind === 'floor') {
      if (!e.dropDone && age >= T.floorWarn) {
        e.dropDone = true
        e.hole.dropped = true
        inject(eng)
        const c = { x: e.hole.open.x + e.hole.open.w / 2, y: e.hole.open.y + e.hole.open.h / 2 }
        rt.puffs.push({ x: c.x, y: c.y, k: T.puffFloor, t0: rt.t })
        shakeAt(eng, c.x, c.y, 0.7)
        try { audio.collapseSfx('floor', 1) } catch { /* */ }
        if (inRect(e.hole.open, P.x, P.y) && p.z > -0.3) {
          rt.stats.falls++
          eng.msg('地板在你脚下塌了下去——下面是一栋没装修完的房子。顺着碎料坡能爬上去。', 'lore')
          hurt(eng, T.fallDamage, '你摔进塌陷口', '跌进塌陷的地板')
        } else if (Math.hypot(c.x - P.x, c.y - P.y) < 14) eng.msg('一片地板塌了下去，露出下面木龙骨搭成的房子。', 'lore')
      }
    }
  }
  rt.events = rt.events.filter((e) => rt.t - e.t0 < 8)
  // 粉尘
  rt.puffs = rt.puffs.filter((q) => rt.t - q.t0 < T.puffLife)
  let dust = rt.stopped ? 0 : S.dust * (rt.lull ? 0.5 : 1)
  for (const q of rt.puffs) { const d = Math.hypot(q.x - P.x, q.y - P.y), life = 1 - (rt.t - q.t0) / T.puffLife; dust += q.k * Math.exp(-((d / T.puffR) ** 2)) * life * life }
  dust = Math.min(1, dust)
  rt.dust += (dust - rt.dust) * Math.min(1, dt * (dust > rt.dust ? 2.5 : 0.6))
  if (rt.dust > 0.04) {
    const mask = p.equip.head?.type === 'dustmask'
    const dps = rt.dust * T.dustDps * (mask ? T.maskFactor : 1)
    rt.dmgAcc += dps * dt
    rt.coughT -= dt
    if (rt.dmgAcc >= 1) {
      const d = Math.floor(rt.dmgAcc); rt.dmgAcc -= d; rt.stats.dustDmg += d
      if (!eng.dev.god) { p.hp -= d; if (p.hp <= 0) { eng.die('被崩塌扬起的石膏粉尘呛倒'); return } }
      if (rt.coughT <= 0) { rt.coughT = 7; eng.msg(mask ? '口罩外面糊了一层白灰。呼吸还算顺畅。' : '石膏粉尘呛得你直咳嗽，眼前一片灰白。（防尘口罩能挡住大部分）', 'damage') }
    }
  }
  // 持续微震
  if (!rt.stopped && S.shake > 0) eng.camShake = Math.max(eng.camShake, S.shake * 0.25 * (rt.lull ? 0.3 : 1))
  // 楼板下方：压头顶
  const under = l02UnderSlab(P.x, P.y, p.z)
  if (under) { const head = p.crouching ? 0.95 : 1.55; if (p.z + head > -0.3) { p.z = -0.3 - head; if (p.vz > 0) p.vz = 0 } }
  // 吊顶：跳跃/攀爬/站在高处时头顶（含相机余量）不穿吊顶（movement.ts 的通用天花板碰撞取 mapgen.ceilingHeightAt，这里再留 L02_HEAD_CLEAR 给相机近裁面）
  if (!eng.dev.noclip && !eng.dev.fly && !eng.ride && !eng.seating) { const ceil = l02CeilingAt(P.x, P.y), head = (p.crouching ? 0.95 : 1.55) + L02_HEAD_CLEAR; if (p.z + head > ceil) { p.z = ceil - head; if (p.vz > 0) p.vz = 0 } }
  tickDevices(eng, rt, dt, P)
}

// ---------- 设施：插座充电 / Wi‑Fi ----------
function tickDevices(eng: Engine, rt: L02Runtime, dt: number, P: { x: number; y: number }) {
  const ph = eng.player.phone
  if (!ph) return
  let wifi = false
  for (const s of eng.map!.structures) if (s.kind === 'l02fix' && s.data?.fix === 'router' && Math.hypot(Number(s.data.fx) - P.x, Number(s.data.fy) - P.y) < 16) { wifi = true; break }
  if (wifi !== !!ph.wifi) { ph.wifi = wifi; if (wifi) eng.msg('手机自动连上了一个 Wi‑Fi：「BRC-工地-临时」。信号满格。', 'system') }
  ph.charging = false
  if (rt.charge) {
    if (outletGone(rt.charge.x, rt.charge.y)) { rt.charge = null; eng.msg('插座连同那面墙一起倒了，充电线被扯断。', 'system') }
    else if (Math.hypot(rt.charge.x - P.x, rt.charge.y - P.y) > 1.8 || !carriesPhone(eng.player) || ph.docked) { rt.charge = null; eng.msg('充电线被扯掉了。', 'system') }
    else { ph.charging = true; if (ph.battery < 100) ph.battery = Math.min(100, ph.battery + 1.1 * dt) }
  }
}

/** 离开 Level 0.2：清掉手机上的本层状态。 */
export function leaveL02(eng: Engine) {
  const ph = eng.player.phone
  if (ph) { ph.wifi = false; ph.charging = false }
  if (eng.l02) eng.l02.charge = null
}

// ---------- 交互 ----------
/** 插座所在的墙已经倒了（插座点 = 墙面外 3 cm，丢弃矩形外扩 6 cm 内即视为随墙消失；与渲染层隐藏贴墙小件的判定一致） */
function outletGone(x: number, y: number): boolean {
  return l02Collapse().removedWalls.some((w) => x > w.x - 0.06 && x < w.x + w.w + 0.06 && y > w.y - 0.06 && y < w.y + w.h + 0.06)
}
export function l02FixLabel(eng: Engine, s: Structure): string | null {
  const f = s.data?.fix
  if (f === 'outlet' && outletGone(Number(s.data?.fx), Number(s.data?.fy))) return null // 墙倒了，插座跟着没了
  if (f === 'outlet') return eng.l02?.charge && Math.abs(eng.l02.charge.x - Number(s.data?.fx)) < 0.01 && Math.abs(eng.l02.charge.y - Number(s.data?.fy)) < 0.01 ? '拔下 手机充电线' : '插座（通电）：给手机充电'
  if (f === 'clipboard') return '阅读 后室装修公司板夹'
  if (f === 'sink') return '洗手台：喝几口水'
  if (f === 'toilet') return '查看 马桶'
  return null
}
export function l02Interact(eng: Engine, s: Structure) {
  const f = s.data?.fix, rt = eng.l02
  if (f === 'clipboard') { try { audio.pickup() } catch { /* */ } eng.emit({ kind: 'doc', text: String(s.data?.doc ?? 'brc_slogan') }); return }
  if (f === 'sink') {
    const p = eng.player
    p.thirst = Math.min(100, p.thirst + 25)
    eng.msg('水龙头吐出一股带着石膏味的凉水。你喝了几口。（口渴 +25）', 'system')
    try { audio.splash(0.4) } catch { /* */ }
    return
  }
  if (f === 'toilet') { eng.msg('崭新的马桶，水箱盖上还贴着「后室装修公司 · 验收合格」的标签。冲水键按下去，什么也没发生。', 'lore'); return }
  if (f === 'outlet' && rt) {
    const at = { x: Number(s.data?.fx), y: Number(s.data?.fy) }
    if (outletGone(at.x, at.y)) return
    if (rt.charge && Math.abs(rt.charge.x - at.x) < 0.01 && Math.abs(rt.charge.y - at.y) < 0.01) { rt.charge = null; eng.msg('你拔下了充电线。', 'system'); return }
    const ph = phoneState(eng.player)
    if (!carriesPhone(eng.player) || ph.docked) { eng.msg('插座的绿色指示灯亮着。可惜你身上没有手机。', 'system'); return }
    rt.charge = at
    try { audio.uiTick() } catch { /* */ }
    eng.msg(`你把手机插上了墙上的插座，屏幕亮起充电图标（电量 ${Math.round(ph.battery)}%）。别走远——线只有一米多长。`, 'system')
  }
}

// ---------- 调试 / QA ----------
export function devL02Stage(eng: Engine, n: number) {
  const rt = eng.l02
  if (!rt || eng.player.level !== L02_ID) { eng.msg('[调试] 只在 Level 0.2 内可用', 'system'); return }
  if (n < 0) { rt.stopped = true; eng.msg('[调试] 崩塌已停止', 'system'); return }
  const k = Math.max(0, Math.min(L02_STAGES.length - 1, n))
  rt.t = L02_STAGES[k].at + 0.05
  rt.stopped = false
  rt.stage = -1 // 让下一帧走一次阶段切换（播报 + 重新排程）
  eng.msg(`[调试] 跳到崩塌阶段 ${k}：${L02_STAGES[k].name}`, 'system')
}
;(globalThis as unknown as { __l02QA?: unknown }).__l02QA = {
  rt: (eng: Engine) => eng.l02, state: () => l02Collapse(),
  tile: (eng: Engine, x?: number, y?: number) => !!eng.l02 && spawnTile(eng, eng.l02, x === undefined ? undefined : { x, y: y! }),
  wall: (eng: Engine) => !!eng.l02 && spawnWall(eng, eng.l02, true),
  /** QA：让 (x,y) 处那面墙倒一段（len 米，墙短于 len+0.8 时整面倒——两端都是自由端时可验证端面/护角不残留）。 */
  wallAt: (eng: Engine, x: number, y: number, len?: number) => !!eng.l02 && spawnWall(eng, eng.l02, true, { x, y, len }),
  floor: (eng: Engine, x?: number, y?: number) => !!eng.l02 && spawnFloor(eng, eng.l02, x === undefined ? undefined : { x, y: y! }),
  /** 入口最近的返回门（播报的那扇）；doors：(x,y) 附近 r 米内全部返回门。 */
  door: (eng: Engine) => l02NearestDoor(eng.map!.inf!.seed),
  doors: (eng: Engine, x: number, y: number, r: number) => l02DoorsNear(eng.map!.inf!.seed, x, y, r),
  ceil: (x: number, y: number) => l02CeilingAt(x, y),
  // 与交互键走同一函数（engine/interact.ts 的 'l02fix' 分支调用 l02FixLabel / l02Interact）
  label: (eng: Engine, st: Structure) => l02FixLabel(eng, st),
  interact: (eng: Engine, st: Structure) => l02Interact(eng, st),
}
