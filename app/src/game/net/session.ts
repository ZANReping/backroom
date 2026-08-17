// v58 联机会话：大厅状态机（建房/加入/准备/开始）+ 游戏内桥接（状态同步/世界事件/确定性层级种子）
// v59：状态/实体快照改由 setInterval 驱动（后台标签页 rAF 停摆时网络仍保活——
// 此前客人切后台即停发状态，房主 3s 清扫把客人删掉，表现为「房主看不见其他人」）；
// 房主权威实体快照广播（~5.5Hz，世界坐标）。
import { MpPeer, randomRoomCode } from './peer'
import type { MpEntSnap, MpEvent, MpIdentity, MpLobbyPlayer, MpMsg, MpPlayerState } from './protocol'
import { look } from '../renderer/shared'
import { applyMpEnts } from './apply'
import type { Engine } from '../engine'

export interface MpRemotePlayer {
  id: string
  idn: MpIdentity
  slot: number
  s: MpPlayerState
  lastSeen: number
}

const now = () => Date.now()

export class MpSession {
  private peer = new MpPeer()
  readonly isHost: boolean
  readonly code: string
  selfId: string
  idn: MpIdentity
  players: MpLobbyPlayer[] = [] // 大厅快照（含槽位）
  started = false
  private destroyed = false

  /** 远端玩家状态表（remotePlayers 渲染读这里） */
  remotes = new Map<string, MpRemotePlayer>()
  /** 本地世界事件出口（App 挂到 engine.emit 链路上） */
  onLocalEvent: ((e: MpEvent) => void) | null = null

  onLobbyChange: ((players: MpLobbyPlayer[]) => void) | null = null
  onStart: ((seed: number) => void) | null = null
  onEnd: ((reason: string) => void) | null = null

  private constructor(isHost: boolean, code: string, selfId: string, idn: MpIdentity, peerOverride?: MpPeer) {
    this.isHost = isHost
    this.code = code
    this.selfId = selfId
    this.idn = idn
    if (peerOverride) this.peer = peerOverride // 离线冒烟用：注入 mock 直连
  }

  static async host(idn: MpIdentity, peerOverride?: MpPeer): Promise<MpSession> {
    const code = randomRoomCode()
    const s = new MpSession(true, code, 'HOST', idn, peerOverride)
    if (!peerOverride) await s.peer.host(code)
    s.players = [{ id: 'HOST', slot: 0, ready: false, ...idn }]
    s.wireHost()
    return s
  }

  static async join(code: string, idn: MpIdentity, peerOverride?: MpPeer): Promise<MpSession> {
    const s = new MpSession(false, code, '', idn, peerOverride)
    if (!peerOverride) await s.peer.join(code)
    s.wireClient()
    s.selfId = s.peer.selfId // 客户端自身 id = PeerJS 分配的 peer id（房主端按此登记）
    s.sendToHost({ k: 'hello', idn })
    return s
  }

  // ---------- 大厅 ----------
  private emitLobby() {
    const msg: MpMsg = { k: 'lobby', players: this.players }
    this.peer.broadcast(msg)
    this.onLobbyChange?.([...this.players])
  }

  private wireHost() {
    this.peer.onOpen((connId) => { /* 等 hello 再入列 */ void connId })
    this.peer.onMessage((from, msg) => {
      if (this.destroyed) return
      switch (msg.k) {
        case 'hello': {
          // 幂等：已登记玩家重发 hello = 更新名称/形象（准备前可调）
          const existing = this.players.find((q) => q.id === from)
          if (existing) {
            existing.name = msg.idn.name
            existing.avatar = msg.idn.avatar
            const r = this.remotes.get(from)
            if (r) r.idn = msg.idn
            this.emitLobby()
            return
          }
          if (this.started) { this.peer.send(from, { k: 'reject', reason: '房间已开局' }); return }
          if (this.players.length >= 4) { this.peer.send(from, { k: 'reject', reason: '房间已满（4 人）' }); return }
          const slot = Math.max(0, ...this.players.map((p) => p.slot)) + 1
          this.players.push({ id: from, slot, ready: false, ...msg.idn })
          this.remotes.set(from, { id: from, idn: msg.idn, slot, s: emptyState(), lastSeen: now() })
          this.emitLobby()
          break
        }
        case 'ready': {
          const p = this.players.find((q) => q.id === from)
          if (p) { p.ready = msg.ready; this.emitLobby() }
          break
        }
        case 'state': {
          const r = this.remotes.get(from)
          if (r) { r.s = msg.s; r.lastSeen = now() }
          break
        }
        case 'event': {
          // 客户端事件：本地应用 + 转发其他客户端
          this.onLocalEvent?.(msg.e)
          this.peer.broadcast({ k: 'event', id: from, e: msg.e }, from)
          break
        }
      }
    })
    this.peer.onClose((connId) => {
      const p = this.players.find((q) => q.id === connId)
      this.players = this.players.filter((q) => q.id !== connId)
      this.remotes.delete(connId)
      this.peer.broadcast({ k: 'leave', id: connId })
      this.emitLobby()
      void p
    })
  }

  private wireClient() {
    this.peer.onMessage((_from, msg) => {
      if (this.destroyed) return
      switch (msg.k) {
        case 'lobby': {
          this.players = msg.players
          this.onLobbyChange?.([...msg.players])
          break
        }
        case 'start': {
          this.started = true
          this.onStart?.(msg.seed)
          break
        }
        case 'states': {
          for (const [id, s] of Object.entries(msg.all)) {
            const lp = this.players.find((q) => q.id === id)
            const r = this.remotes.get(id)
            if (r) { r.s = s; r.lastSeen = now() }
            else if (lp) this.remotes.set(id, { id, idn: { name: lp.name, avatar: lp.avatar }, slot: lp.slot, s, lastSeen: now() })
          }
          break
        }
        case 'event': this.onLocalEvent?.(msg.e); break
        case 'ents': {
          // 房主权威实体快照：仅当客人与房主同层时应用
          if (this.eng && this.eng.player.level === msg.level) applyMpEnts(this.eng, msg.list)
          break
        }
        case 'leave': {
          this.remotes.delete(msg.id)
          break
        }
        case 'end': this.onEnd?.('房主解散了房间'); break
        case 'reject': this.onEnd?.(msg.reason); break
      }
    })
    this.peer.onClose(() => { if (!this.destroyed) this.onEnd?.('与房主断开连接') })
  }

  /** 大厅中改名称/形象（未准备时）——更新本地并同步 */
  setIdentity(idn: MpIdentity) {
    this.idn = idn
    const me = this.players.find((p) => this.isSelf(p.id))
    if (me && !me.ready) { me.name = idn.name; me.avatar = idn.avatar }
    const r = this.remotes.get(this.selfId)
    if (r) r.idn = idn
    if (this.isHost) this.emitLobby()
    else this.sendToHost({ k: 'hello', idn }) // 复用 hello 更新（房主已登记则覆盖名称形象）
  }

  isSelf(id: string) { return this.isHost ? id === 'HOST' : id === this.selfId }
  mySlot(): number { return this.players.find((p) => this.isSelf(p.id))?.slot ?? 0 }

  setReady(ready: boolean) {
    if (this.isHost) {
      const me = this.players.find((p) => p.id === 'HOST')
      if (me) { me.ready = ready; this.emitLobby() }
    } else this.sendToHost({ k: 'ready', ready })
  }

  /** 房主开局：需全员已准备 */
  startGame(seed: number): boolean {
    if (!this.isHost || this.started) return false
    if (this.players.some((p) => !p.ready)) return false
    this.started = true
    this.peer.broadcast({ k: 'start', seed })
    this.onStart?.(seed)
    return true
  }

  leave() {
    if (this.destroyed) return
    this.destroyed = true
    if (this.netTimer !== null) { clearInterval(this.netTimer); this.netTimer = null }
    if (this.isHost) this.peer.broadcast({ k: 'end' })
    this.peer.destroy()
  }

  // ---------- 游戏内 ----------
  private sendToHost(msg: MpMsg) {
    const hostId = this.peer.connIds()[0]
    if (hostId) this.peer.send(hostId, msg)
  }

  /** 本地世界事件 → 广播（房主：直接广播+本地应用；客户端：发给房主转发） */
  sendEvent(e: MpEvent) {
    if (this.destroyed || !this.started) return
    if (this.isHost) this.peer.broadcast({ k: 'event', id: 'HOST', e })
    else this.sendToHost({ k: 'event', id: this.selfId, e })
  }

  private eng: Engine | null = null
  private netTimer: ReturnType<typeof setInterval> | null = null
  private entTick = 0
  private nextNid = 1

  /** 每帧调用：仅缓存 engine 引用；实际发送由 setInterval 驱动（后台标签页 rAF 停摆时仍保活） */
  tick(eng: Engine, _dt: number) {
    if (this.destroyed || !this.started) return
    this.eng = eng
    if (this.netTimer === null) this.netTimer = setInterval(() => this.sendNow(), 90) // ≈11Hz
  }

  /** 定时网络心跳：发本地状态；房主聚合并广播 + 广播实体快照 */
  private sendNow() {
    if (this.destroyed || !this.started || !this.eng) return
    const eng = this.eng
    const p = eng.player
    // v58：状态一律走世界坐标（无限层窗口坐标随各端窗口原点漂移，不能直接共享）
    const m = eng.map
    const ox = m?.inf?.ox ?? 0, oy = m?.inf?.oy ?? 0
    // 孤立效应（L0 非马尼拉室 tint≠1）：本端孤立标记随状态广播，任一端孤立即互不可见
    let iso = false
    if (m && p.level === 0) {
      const pi = Math.floor(p.y) * m.w + Math.floor(p.x)
      iso = (m.tint?.[pi] ?? 0) !== 1
    }
    const s: MpPlayerState = {
      x: p.x + ox, y: p.y + oy, z: p.z,
      yaw: p.facing, pitch: look.pitch,
      level: p.level,
      moving: Math.hypot(eng.input.mx, eng.input.my) > 0.1,
      sprint: !!eng.input.sprint, crouch: p.crouching, swim: eng.inLiquid === 1,
      attack: eng.attackAnimT > 0.3, // 挥击触发帧（远端播一次）
      held: p.hotbar[p.selected]?.type ?? null,
      dead: eng.over,
      iso,
    }
    if (this.isHost) {
      // 房主：写入自身状态 + 聚合广播（剔除超 10s 未见的——后台标签 setInterval 仍约 1Hz 心跳，不会被误删）
      const all: Record<string, MpPlayerState> = { HOST: s }
      for (const [id, r] of this.remotes) {
        if (now() - r.lastSeen > 10000) { this.remotes.delete(id); continue }
        all[id] = r.s
      }
      this.peer.broadcast({ k: 'states', all })
      // 房主权威实体快照（隔 tick ≈5.5Hz，限最近 60 只，世界坐标）
      if (m && ++this.entTick % 2 === 0) this.broadcastEnts(eng, ox, oy)
    } else {
      this.sendToHost({ k: 'state', id: this.selfId, s })
    }
  }

  /** 房主：给本层实体分配联机 id 并广播快照（客人端据此刻画提线木偶） */
  private broadcastEnts(eng: Engine, ox: number, oy: number) {
    const m = eng.map!, p = eng.player
    const list: MpEntSnap[] = []
    const sorted = m.entities
      .filter((e) => !e.dead || e.deathT > 0)
      .map((e) => ({ e, d: Math.hypot(e.x - p.x, e.y - p.y) }))
      .sort((a, b) => a.d - b.d)
    for (const { e } of sorted.slice(0, 60)) {
      if (e.netId === undefined) e.netId = this.nextNid++
      list.push({
        nid: e.netId, tp: e.def.type,
        x: e.x + ox, y: e.y + oy, z: e.z,
        f: e.facing, st: e.state, hp: e.hp, dead: e.dead,
        hid: e.hidden ?? null, dis: e.disguised ?? null,
      })
    }
    if (list.length) this.peer.broadcast({ k: 'ents', level: p.level, list })
  }
}

function emptyState(): MpPlayerState {
  return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, level: 0, moving: false, sprint: false, crouch: false, swim: false, attack: false, held: null, dead: false, iso: false }
}
