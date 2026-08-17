// v58 联机：PeerJS 封装——房间号即房主 peer id 后缀（backroom-v1-XXXX），客户端直连房主。
// 只负责连接与消息收发；大厅状态机与游戏桥接在 session.ts。
// v59 跨设备修复：显式 ICE 配置——peerjs 默认只有 Google STUN + 欧美 TURN，
// 国内/受限网络下 srflx 收集不到、UDP 3478 常被拦，表现为「同设备能连、跨设备进不去」。
// 现加国内可达 STUN + TCP 443 TURN 兜底（UDP 被封时走类 HTTPS 流量），并细化失败原因。
import Peer, { type DataConnection } from 'peerjs'
import type { MpMsg } from './protocol'

export const MP_PREFIX = 'backroom-v1-'

/** ICE 服务（STUN 多源 + 公共 TURN 兜底；不可达项浏览器会自动跳过） */
const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.miwifi.com:3478' }, // 国内可达
    { urls: 'stun:stun.qq.com:3478' },
    // PeerJS 官方公共 TURN（peerjs 默认配置同款）
    { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
    // Open Relay 公共 TURN：443/TCP 兜底（对称 NAT / UDP 受限网络的最后通道）
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
  sdpSemantics: 'unified-plan',
} as RTCConfiguration

export function randomRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 去易混淆字符
  let s = ''
  const arr = new Uint32Array(4)
  crypto.getRandomValues(arr)
  for (let i = 0; i < 4; i++) s += chars[arr[i] % chars.length]
  return s
}

export interface PeerHandle {
  id: string
  onMessage: (connId: string, msg: MpMsg) => void
  onOpen?: (connId: string) => void
  onClose?: (connId: string) => void
}

/** 把 PeerJS 错误译为可读的失败原因 */
function peerError(err: unknown): Error {
  const t = (err as { type?: string })?.type ?? ''
  if (t === 'peer-unavailable') return new Error('找不到该房间（房间码有误，或房主已关闭房间）')
  if (t === 'network' || t === 'server-error') return new Error('信令服务不可达，请检查网络后重试')
  if (t === 'unavailable-id') return new Error('房间码冲突，请房主重新建房')
  return new Error(`连接失败（${t || (err as Error)?.message || '未知错误'}）`)
}

export class MpPeer {
  private peer: Peer | null = null
  private conns = new Map<string, DataConnection>() // 房主：全部客户端连接；客户端：唯一一条到房主
  private handler: PeerHandle | null = null

  get isOpen() { return this.conns.size > 0 }

  /** 房主：以指定房间码建房 */
  host(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(MP_PREFIX + code, { config: ICE_CONFIG })
      const timer = setTimeout(() => { peer.destroy(); reject(new Error('连接信令服务超时')) }, 15000)
      peer.on('open', () => { clearTimeout(timer); this.peer = peer; resolve() })
      peer.on('error', (err) => { clearTimeout(timer); peer.destroy(); reject(peerError(err)) })
      peer.on('connection', (conn) => {
        conn.on('open', () => {
          this.conns.set(conn.peer, conn)
          this.handler?.onOpen?.(conn.peer)
          conn.on('data', (d) => this.handler?.onMessage(conn.peer, d as MpMsg))
          conn.on('close', () => { this.conns.delete(conn.peer); this.handler?.onClose?.(conn.peer) })
        })
      })
    })
  }

  /** 客户端：按房间码加入 */
  join(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = new Peer({ config: ICE_CONFIG })
      // NAT 穿透（尤其 TURN 中继分配）可能较慢，放宽到 25s
      const timer = setTimeout(() => { peer.destroy(); reject(new Error('连接超时：P2P 打洞未成功（双方网络可能存在限制，可换网络重试）')) }, 25000)
      const fail = (err: unknown) => { clearTimeout(timer); peer.destroy(); reject(peerError(err)) }
      const failRaw = (msg: string) => { clearTimeout(timer); peer.destroy(); reject(new Error(msg)) }
      peer.on('open', () => {
        const conn = peer.connect(MP_PREFIX + code.toUpperCase().trim(), { reliable: true })
        conn.on('open', () => {
          clearTimeout(timer)
          this.peer = peer
          this.conns.set(conn.peer, conn)
          conn.on('data', (d) => this.handler?.onMessage(conn.peer, d as MpMsg))
          conn.on('close', () => { this.conns.delete(conn.peer); this.handler?.onClose?.(conn.peer) })
          resolve()
        })
        // ICE 失败/对端关闭要在打开前捕获，否则只会干等到超时
        conn.on('iceStateChanged', (st) => { if (st === 'failed' || st === 'closed') failRaw('P2P 连接建立失败：NAT 穿透未成功，可切换网络（如换 WiFi/关闭代理）后重试') })
        conn.on('error', fail)
      })
      peer.on('error', fail)
    })
  }

  onMessage(fn: PeerHandle['onMessage']) { this.handler = { ...this.handler, onMessage: fn } as PeerHandle }
  onOpen(fn: NonNullable<PeerHandle['onOpen']>) { this.handler = { ...this.handler, onOpen: fn } as PeerHandle }
  onClose(fn: NonNullable<PeerHandle['onClose']>) { this.handler = { ...this.handler, onClose: fn } as PeerHandle }

  send(connId: string, msg: MpMsg) {
    this.conns.get(connId)?.send(msg)
  }
  broadcast(msg: MpMsg, exceptId?: string) {
    for (const [id, c] of this.conns) if (id !== exceptId) c.send(msg)
  }
  connIds(): string[] { return [...this.conns.keys()] }

  destroy() {
    for (const [, c] of this.conns) c.close()
    this.conns.clear()
    this.peer?.destroy()
    this.peer = null
  }

  get selfId(): string { return (this.peer as unknown as { id?: string } | null)?.id ?? '' }
}
