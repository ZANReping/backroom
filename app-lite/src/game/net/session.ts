// v58 联机会话：大厅状态机（建房/加入/准备/开始）+ 游戏内桥接（状态同步/世界事件/确定性层级种子）
// v59：状态/实体快照改由 setInterval 驱动（后台标签页 rAF 停摆时网络仍保活——
// 此前客人切后台即停发状态，房主 3s 清扫把客人删掉，表现为「房主看不见其他人」）；
// 房主权威实体快照广播（~5.5Hz，世界坐标）。
import { MpPeer, randomRoomCode } from './peer'
import type { MpEntSnap, MpEvent, MpIdentity, MpLobbyPlayer, MpMsg, MpPlayerState } from './protocol'
import { MP_PROTOCOL } from './protocol'
import {captureL0,l0Space,rememberL0Event} from '../engine/l0State'
import {l0Meeting} from '../world/l0Architecture'
import { look } from '../renderer/shared'
import { applyMpEnts } from './apply'
import type { Engine } from '../engine'
import { actualRank } from '../engine/career'
import {validateTradeAction,acceptTradeReceipt} from '../engine/bntg'
import {hasVaultMission} from '../engine/factionMissions'

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
  private roomSeed=0
  private resumeToken=''
  private resumeTokens=new Map<string,string>()
  private disconnected=new Map<string,{player:MpLobbyPlayer;until:number}>()
  resumeSnapshot?:import('../engine/save').SaveSnapshot

  /** 远端玩家状态表（remotePlayers 渲染读这里） */
  remotes = new Map<string, MpRemotePlayer>()
  stabilizers:Extract<MpEvent,{t:'stabilizers'}>['devices']=[]
  tradeVault?:import('../engine/bntg').VaultState
  private tradeReceipts=new Set<string>()
  private stabilizerEvents=new Set<string>()
  private stabilizerSequence=0
  /** 本地世界事件出口（App 挂到 engine.emit 链路上） */
  onLocalEvent: ((e: MpEvent) => void) | null = null

  onLobbyChange: ((players: MpLobbyPlayer[]) => void) | null = null
  private startCallback:((seed:number)=>void)|null=null
  get onStart(){return this.startCallback}
  set onStart(fn:((seed:number)=>void)|null){this.startCallback=fn;if(fn&&this.started)queueMicrotask(()=>fn(this.roomSeed))}
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
    try{s.resumeToken=sessionStorage.getItem('br_mp_token:'+code)||crypto.randomUUID();sessionStorage.setItem('br_mp_token:'+code,s.resumeToken);s.resumeSnapshot=JSON.parse(sessionStorage.getItem('br_mp_resume:'+code)||'null')??undefined}catch{s.resumeToken=s.selfId}
    s.sendToHost({ k: 'hello', idn,protocol:MP_PROTOCOL,resume:s.resumeToken })
    return s
  }

  // ---------- 大厅 ----------
  private emitLobby() {
    const msg: MpMsg = { k: 'lobby', players: this.players,protocol:MP_PROTOCOL }
    this.peer.broadcast(msg)
    this.onLobbyChange?.([...this.players])
  }

  private wireHost() {
    this.peer.onOpen((connId) => { /* 等 hello 再入列 */ void connId })
    this.peer.onMessage((from, msg) => {
      if (this.destroyed) return
      switch (msg.k) {
        case 'hello': {
          if(msg.protocol!==MP_PROTOCOL){this.peer.send(from,{k:'reject',reason:'联机版本不一致，请所有玩家更新至 Level 0 重制版。'});return}
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
          const reconnect=msg.resume?this.disconnected.get(msg.resume):undefined
          if(this.started&&reconnect&&reconnect.until>now()){
            const player={...reconnect.player,id:from,...msg.idn};this.disconnected.delete(msg.resume!);this.resumeTokens.set(from,msg.resume!);this.players.push(player);this.remotes.set(from,{id:from,idn:msg.idn,slot:player.slot,s:emptyState(),lastSeen:now()});this.emitLobby();this.peer.send(from,{k:'start',seed:this.roomSeed});this.l0SyncAt=0;return
          }
          if (this.started) { this.peer.send(from, { k: 'reject', reason: '房间已开局；仅支持五分钟内重连原会话' }); return }
          if (this.players.length >= 4) { this.peer.send(from, { k: 'reject', reason: '房间已满（4 人）' }); return }
          const slot = Math.max(0, ...this.players.map((p) => p.slot)) + 1
          this.players.push({ id: from, slot, ready: false, ...msg.idn })
          if(msg.resume)this.resumeTokens.set(from,msg.resume)
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
          const sender=this.remotes.get(from);if(!sender)break
          if(msg.e.scopeLevel===0&&(sender.s.level!==0||msg.e.space!==sender.s.l0Space))break
          if(msg.e.t==='l0world'||msg.e.t==='stabilizers'||msg.e.t==='tradeVault'||msg.e.t==='tradeReceipt')break // only the host can publish world worksite state
          if(msg.e.t==='tradeAction'){this.acceptTradeAction(from,msg.e.task,msg.e.action);break}
          if(msg.e.t==='stabilizerRequest'){this.acceptStabilizer(from,msg.e.eventId);break}
          // 客户端事件：本地应用 + 转发其他客户端
          this.onLocalEvent?.(msg.e)
          this.peer.broadcast({ k: 'event', id: from, e: msg.e }, from)
          break
        }
      }
    })
    this.peer.onClose((connId) => {
      const p = this.players.find((q) => q.id === connId)
      const token=this.resumeTokens.get(connId);if(p&&token&&this.started)this.disconnected.set(token,{player:p,until:now()+300000})
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
          if(msg.protocol!==MP_PROTOCOL){this.onEnd?.('联机版本不一致，请更新游戏。');return}
          this.players = msg.players
          this.onLobbyChange?.([...msg.players])
          break
        }
        case 'start': {
          this.roomSeed=msg.seed
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
        case 'event':
          if(msg.e.t==='tradeReceipt'){if(msg.e.owner===this.selfId&&this.eng)acceptTradeReceipt(this.eng,msg.e.task,msg.e.action)}
          else if(msg.e.t==='tradeVault'){this.tradeVault=structuredClone(msg.e.state)}
          else if(msg.e.t==='stabilizers'){const at=msg.e.at;this.stabilizers=msg.e.devices.map(d=>({...d,expires:now()+Math.max(0,Math.min(90000,d.expires-at))}))}
          else if(msg.e.t!=='stabilizerRequest')this.onLocalEvent?.(msg.e)
          break
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
    this.peer.onClose(() => {this.saveResume();if (!this.destroyed) this.onEnd?.('与房主断开连接；五分钟内可重新加入原房间')})
  }

  /** 大厅中改名称/形象（未准备时）——更新本地并同步 */
  setIdentity(idn: MpIdentity) {
    this.idn = idn
    const me = this.players.find((p) => this.isSelf(p.id))
    if (me && !me.ready) { me.name = idn.name; me.avatar = idn.avatar }
    const r = this.remotes.get(this.selfId)
    if (r) r.idn = idn
    if (this.isHost) this.emitLobby()
    else this.sendToHost({ k: 'hello', idn,protocol:MP_PROTOCOL }) // 复用 hello 更新（房主已登记则覆盖名称形象）
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
    this.roomSeed=seed
    this.peer.broadcast({ k: 'start', seed })
    this.onStart?.(seed)
    return true
  }

  leave() {
    if (this.destroyed) return
    this.saveResume()
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
  private worldSequence=0
  private l0SyncAt=0
  sendEvent(e: MpEvent) {
    if (this.destroyed || !this.started) return
    if(this.eng&&['takeItem','dropItem','loot','door','exit','died'].includes(e.t)){
      // Ordered transport must publish a new level/private-space identity before
      // its first world event, including an immediate drop after crossing a bend.
      if(!this.isHost)this.sendNow()
      const m=this.eng.map,ox=m?.inf?.ox??0,oy=m?.inf?.oy??0
      const event=e
      const structure=event.t==='loot'?m?.structures.find(s=>s.data?.sid===event.sid):event.t==='door'?m?.structures.find(s=>Math.abs(s.x+ox-event.x)<.01&&Math.abs(s.y+oy-event.y)<.01):undefined
      e={...e,scopeLevel:this.eng.player.level,space:l0Space(m),eventId:this.selfId+':'+(++this.worldSequence),worldAt:structure?[structure.x+ox,structure.y+oy]:undefined,structureId:structure?.data?.sid as number|undefined}
      if(this.isHost)rememberL0Event(this.eng,e)
    }
    if (this.isHost) this.peer.broadcast({ k: 'event', id: 'HOST', e })
    else this.sendToHost({ k: 'event', id: this.selfId, e })
  }

  requestTradeAction(task:number,action:string){this.sendEvent({t:'tradeAction',task,action})}
  private acceptTradeAction(owner:string,task:number,action:string){
    const p=this.remotes.get(owner)?.s
    if(!this.eng||!p||p.bntgTask!==task||!this.tradeVault)return false
    if(!validateTradeAction(this.eng,task,action,p,this.tradeVault))return false
    const key=owner+':'+task+':'+action
    this.tradeReceipts.add(key)
    // Re-sending an existing receipt is safe: client records and reward IDs are idempotent.
    this.sendEvent({t:'tradeReceipt',owner,task,action,sequence:this.tradeVault.sequence});return true
  }
  requestStabilizer(){
    const eventId=`${this.selfId}:${++this.stabilizerSequence}`
    if(this.isHost)return this.acceptStabilizer(this.selfId,eventId)
    this.sendEvent({t:'stabilizerRequest',eventId});return true
  }

  private acceptStabilizer(owner:string,eventId:string){
    const eng=this.eng,m=eng?.map
    if(!eng||!m||!this.isHost||!this.started||eventId.length>128)return false
    const key=`${owner}:${eventId}`
    if(this.stabilizerEvents.has(key))return false
    const local=this.isSelf(owner),p=local?eng.player:this.remotes.get(owner)?.s
    if(!p||p.level!==eng.player.level)return false
    const ox=m.inf?.ox??0,oy=m.inf?.oy??0,x=p.x+(local?ox:0),y=p.y+(local?oy:0)
    const qualification=local?actualRank(eng,'brc'):this.remotes.get(owner)?.s.brcQualification??0
    if(qualification<3||!Number.isFinite(x+y))return false
    const site=m.structures.find(s=>s.kind==='settlementstation'&&s.data?.faction==='brc'&&(s.data.services as string[])?.includes('stabilize')&&Math.hypot(s.x+ox-x,s.y+oy-y)<3)
    if(!site||!eng.los(x-ox,y-oy,site.x,site.y))return false
    this.stabilizerEvents.add(key)
    if(this.stabilizerEvents.size>512)this.stabilizerEvents.delete(this.stabilizerEvents.values().next().value!)
    this.stabilizers=this.stabilizers.filter(d=>d.owner!==owner&&d.expires>now())
    this.stabilizers.push({owner,eventId,level:p.level,x,y,expires:now()+90000})
    this.sendEvent({t:'stabilizers',at:now(),devices:this.stabilizers});return true
  }

  private eng: Engine | null = null
  private saveResume(){try{if(this.eng&&this.started&&!this.isHost)sessionStorage.setItem('br_mp_resume:'+this.code,JSON.stringify(this.eng.snapshot()))}catch{/* private mode keeps the current in-memory session */}}
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
    const meeting=m&&p.level===0?l0Meeting(m,p.x,p.y):1
    const iso=p.level===0&&meeting<=0
    const s: MpPlayerState = {
      x: p.x + ox, y: p.y + oy, z: p.z,
      yaw: p.facing, pitch: look.pitch,
      level: p.level,
      moving: Math.hypot(eng.input.mx, eng.input.my) > 0.1,
      sprint: !!eng.input.sprint, crouch: p.crouching, swim: eng.inLiquid === 1,
      attack: eng.attackAnimT > 0.3, // 挥击触发帧（远端播一次）
      held: p.hotbar[p.selected]?.type ?? null,
      dead: eng.over,
      iso,l0Space:l0Space(m),l0Meeting:meeting,
      brcQualification:eng.career?actualRank(eng,'brc'):0,
      bntgCounting:hasVaultMission(eng)||!!eng.career?.routes.bntg?.active&&eng.career.routes.bntg.task===4,
      bntgTask:eng.career?.routes.bntg?.active?eng.career.routes.bntg.task:-1,
    }
    if (this.isHost) {
      if(now()>this.l0SyncAt){this.l0SyncAt=now()+2000;const state=eng.map?.inf?.l0?.trapped?eng.l0SharedWorld:captureL0(eng);if(state&&!state.space.trapped)this.sendEvent({t:'l0world',seed:state.seed,revisions:state.space.revisions,taken:state.taken,chunks:state.chunks})}
      this.stabilizers=this.stabilizers.filter(d=>d.expires>now())
      if(this.tradeVault)this.sendEvent({t:'tradeVault',state:this.tradeVault})
      if(this.stabilizers.length)this.sendEvent({t:'stabilizers',at:now(),devices:this.stabilizers})
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
        ...(e.def.type === 'deathmoth' ? { mf: e.def.mothForm ?? 'male', es: e.def.scale ?? 1 } : {}),
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
