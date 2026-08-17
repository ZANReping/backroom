// v58 联机：PeerJS 封装——房间号即房主 peer id 后缀（backroom-v1-XXXX），客户端直连房主。
// 只负责连接与消息收发；大厅状态机与游戏桥接在 session.ts。
import Peer, { type DataConnection } from 'peerjs'
import type { MpMsg } from './protocol'

export const MP_PREFIX = 'backroom-v1-'

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

export class MpPeer {
  private peer: Peer | null = null
  private conns = new Map<string, DataConnection>() // 房主：全部客户端连接；客户端：唯一一条到房主
  private handler: PeerHandle | null = null

  get isOpen() { return this.conns.size > 0 }

  /** 房主：以指定房间码建房 */
  host(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(MP_PREFIX + code)
      const timer = setTimeout(() => { peer.destroy(); reject(new Error('连接信令服务超时')) }, 12000)
      peer.on('open', () => { clearTimeout(timer); this.peer = peer; resolve() })
      peer.on('error', (err) => { clearTimeout(timer); peer.destroy(); reject(err) })
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
      const peer = new Peer()
      const timer = setTimeout(() => { peer.destroy(); reject(new Error('连接信令服务超时')) }, 12000)
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
        conn.on('error', (err) => { clearTimeout(timer); peer.destroy(); reject(err) })
      })
      peer.on('error', (err) => { clearTimeout(timer); peer.destroy(); reject(err) })
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
