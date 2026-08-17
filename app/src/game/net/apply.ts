// v58 联机：远端世界事件应用到本地（先到先得共享物资/容器/门；出口/死亡播报）
// v59：全局事件（L1「闪烁」停电链）+ 房主权威实体快照应用（提线木偶）+ 联机战斗伤害结算
import type { Engine } from '../engine'
import type { MpEntSnap, MpEvent } from './protocol'
import { makeEntity, type Entity } from '../entities'
import { chunkKey, CS } from '../world/infinite'

export function applyMpEvent(eng: Engine, e: MpEvent) {
  const m = eng.map
  if (!m) return
  const ox = m.inf?.ox ?? 0, oy = m.inf?.oy ?? 0
  eng.applyingNet = true // 防止应用远端事件时再次广播（回环）
  try {
    switch (e.t) {
      case 'takeItem': {
        const it = m.items.find((i) => i.id === e.id)
        if (it) {
          m.items = m.items.filter((i) => i !== it)
          if (m.inf) m.inf.taken.add(e.id)
        }
        break
      }
      case 'dropItem': {
        // 房主击杀掉落：世界坐标 → 本端窗口坐标；窗口内且不重复才落地（stitch 时吸收进 chunk 持久化）
        const x = e.x - ox, y = e.y - oy
        if (x >= 0 && y >= 0 && x < m.w && y < m.h && !m.items.some((i) => i.id === e.id))
          m.items.push({ id: e.id, type: e.it, x, y })
        break
      }
      case 'loot': {
        const s = m.structures.find((q) => q.data?.sid === e.sid)
        if (s && !s.looted) {
          s.looted = true
          if (eng.lootPanel?.sid === e.sid) eng.lootPanel = null
        }
        break
      }
      case 'door': {
        // 世界坐标 → 本端窗口坐标；仅匹配门类结构
        const wx = e.x, wy = e.y
        const s = m.structures.find((q) =>
          (q.kind === 'hoteldoor' || q.kind === 'inkdoor' || q.kind === 'bargate' || q.kind === 'glassdoor' || q.kind === 'rollerdoor')
          && Math.abs(q.x + ox - wx) < 0.51 && Math.abs(q.y + oy - wy) < 0.51)
        if (s) {
          s.data = { ...s.data, open: e.open ? 1 : 0 }
          s.solid = !e.open
        }
        break
      }
      case 'exit': eng.msg('远处传来动静——有同行者进入了别的层级。', 'system'); break
      case 'died': eng.msg(e.text ? `有同行者死去了：${e.text}` : '有同行者死去了。', 'damage'); break
      case 'blackout': {
        // L1「闪烁」：仅同层客人跟随房主节奏（warn 后本地 3.5s 自动 apply；房主 start 事件做幂等兜底）
        if (eng.player.level !== 1 || eng.mpSession?.isHost) break
        if (e.ph === 'warn') eng.startBlackout(e.dur ?? 20)
        else if (e.ph === 'start') eng.applyBlackout() // applyBlackout 内有 blackoutT>0 幂等守卫
        else eng.endBlackout()
        break
      }
      case 'entHit': {
        // 客人上报的伤害仅房主结算（快照随后把 hp/死亡同步回各端）
        if (!eng.mpSession?.isHost) break
        const t = eng.map?.entities.find((q) => q.netId === e.nid)
        if (t && !t.dead) { t.hp -= e.dmg; t.stunT = Math.max(t.stunT, 0.35); eng.killCheck(t) }
        break
      }
    }
  } finally {
    eng.applyingNet = false
  }
}

/** 客人端：应用房主实体快照——按 netId 匹配 / 就近同型收养 / 窗口内新建；驱动为提线木偶 */
export function applyMpEnts(eng: Engine, list: MpEntSnap[]) {
  const m = eng.map
  if (!m || !eng.mpSession || eng.mpSession.isHost) return
  const ox = m.inf?.ox ?? 0, oy = m.inf?.oy ?? 0
  const t = Date.now()
  for (const s of list) {
    const wx = s.x - ox, wy = s.y - oy // 世界坐标 → 本端窗口坐标
    let e = m.entities.find((q) => q.netId === s.nid)
    if (!e) {
      // 收养：就近同型本地实体（确定性生成使两端实体同源），避免重复个体
      let best: Entity | undefined = undefined, bd = 6
      for (const q of m.entities) {
        if (q.netId !== undefined || q.def.type !== s.tp || q.dead) continue
        const d = Math.hypot(q.x - wx, q.y - wy)
        if (d < bd) { bd = d; best = q }
      }
      e = best
    }
    if (!e) {
      if (wx < 1 || wy < 1 || wx >= m.w - 1 || wy >= m.h - 1) continue // 窗口外不建（靠近后自会出现）
      e = makeEntity(s.tp, wx, wy, s.z)
      e.netId = s.nid
      m.entities.push(e)
      // 登记进所在 chunk，窗口滚动 stitch 时按对象身份保留
      if (m.inf) {
        const c = m.inf.chunks.get(chunkKey(Math.floor(s.x / CS), Math.floor(s.y / CS)))
        if (c && !c.entities.includes(e)) c.entities.push(e)
      }
    }
    e.netX = wx; e.netY = wy; e.netZ = s.z; e.netT = t
    e.facing = s.f
    if (!e.dead) e.state = s.st as typeof e.state
    e.hp = s.hp
    e.hidden = s.hid ?? undefined
    e.disguised = s.dis ?? undefined
    if (s.dead && !e.dead) { e.dead = true; e.deathT = 1.4 } // 与本地死亡动画同长
  }
}
