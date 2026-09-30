// v58 联机：PeerJS 封装——房间号即房主 peer id 后缀（backroom-v1-XXXX），客户端直连房主。
// 只负责连接与消息收发；大厅状态机与游戏桥接在 session.ts。
// ICE 与信令由 multiplayer.json / 配置的凭据接口提供；不把失效公共 TURN 当作兜底。
import Peer, { type DataConnection } from 'peerjs'
import type { MpMsg } from './protocol'
import { connectionOptions } from './connectionConfig'

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
  async host(code: string): Promise<void> {
    if (typeof RTCPeerConnection === 'undefined') throw new Error('当前浏览器不支持 WebRTC 联机')
    const options = await connectionOptions()
    return new Promise((resolve, reject) => {
      const peer = new Peer(MP_PREFIX + code, options)
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
  async join(code: string): Promise<void> {
    if (typeof RTCPeerConnection === 'undefined') throw new Error('当前浏览器不支持 WebRTC 联机')
    const options = await connectionOptions()
    return new Promise((resolve, reject) => {
      const peer = new Peer(options)
      let signaled = false
      // NAT 穿透（尤其 TURN 中继分配）可能较慢，放宽到 25s
      const timer = setTimeout(() => { peer.destroy(); reject(new Error(signaled ? '连接超时：信令已连接，但两端直连/中继未建立。请运行联机诊断；房主与客人都需可用的 TURN 配置' : '连接信令服务超时，请检查网络或信令服务器配置')) }, 25000)
      const fail = (err: unknown) => { clearTimeout(timer); peer.destroy(); reject(peerError(err)) }
      const failRaw = (msg: string) => { clearTimeout(timer); peer.destroy(); reject(new Error(msg)) }
      peer.on('open', () => {
        signaled = true
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
