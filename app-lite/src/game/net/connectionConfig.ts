import type { PeerOptions } from 'peerjs'

export interface MultiplayerConfig {
  iceServers: RTCIceServer[]
  iceServersEndpoint?: string
  relayOnly?: boolean
  signaling?: Pick<PeerOptions, 'host' | 'port' | 'path' | 'secure' | 'key'>
}
const STUN: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.miwifi.com:3478' },
  { urls: 'stun:stun.qq.com:3478' },
]
export function validateIceServers(value: unknown): RTCIceServer[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error('中继配置必须是 iceServers 数组（最多 20 项）')
  return value.map(item => {
    const urls = typeof item?.urls === 'string' ? [item.urls] : item?.urls
    if (!Array.isArray(urls) || !urls.length || urls.length > 8 || urls.some(u => typeof u !== 'string' || !/^(stun|stuns|turn|turns):[^\s]+$/.test(u))) throw new Error('中继服务器地址格式无效')
    if (urls.some(u => /^turns?:/.test(u)) && (typeof item.username !== 'string' || !item.username || typeof item.credential !== 'string' || !item.credential)) throw new Error('TURN 服务器缺少账号或凭据')
    return { urls, ...(typeof item.username === 'string' ? { username: item.username } : {}), ...(typeof item.credential === 'string' ? { credential: item.credential } : {}) }
  })
}
async function readJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store', credentials: 'omit' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally { clearTimeout(timer) }
}
export async function connectionOptions(): Promise<PeerOptions> {
  let config: MultiplayerConfig
  try {
    config = await readJson(new URL('./multiplayer.json', location.href).href) as MultiplayerConfig
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('配置格式无效')
  } catch { throw new Error('无法读取联机配置 multiplayer.json，请检查发布包和网络') }
  let servers = validateIceServers(config.iceServers ?? [])
  const envUrl = import.meta.env.VITE_TURN_URL?.trim()
  if (envUrl) servers = [...validateIceServers([{ urls: envUrl.split(',').map((s: string) => s.trim()), username: import.meta.env.VITE_TURN_USER, credential: import.meta.env.VITE_TURN_PASS }]), ...servers]
  if (config.iceServersEndpoint) {
    const url = new URL(config.iceServersEndpoint, location.href)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('中继凭据接口必须使用 HTTPS')
    try {
      const data = await readJson(url.href)
      const remote = validateIceServers(Array.isArray(data) ? data : (data as { iceServers?: unknown })?.iceServers)
      if (!remote.some(s => (Array.isArray(s.urls) ? s.urls : [s.urls]).some(u => /^turns?:/.test(u)))) throw new Error('接口未提供 TURN')
      servers = [...remote, ...servers]
    } catch { throw new Error('无法取得中继凭据，请检查凭据接口的网络、CORS 和返回值') }
  }
  const hasRelay = servers.some(s => (Array.isArray(s.urls) ? s.urls : [s.urls]).some(u => /^turns?:/.test(u)))
  if (config.relayOnly && !hasRelay) throw new Error('已启用强制中继，但尚未配置 TURN 服务')
  const signaling = config.signaling ?? {}
  if (signaling.secure === false) throw new Error('Toy 联机信令必须使用 WSS')
  return { ...signaling, secure: true, config: { iceServers: [...servers, ...STUN], iceTransportPolicy: config.relayOnly ? 'relay' : 'all' } }
}

export async function diagnoseMultiplayer(): Promise<string> {
  if (typeof RTCPeerConnection === 'undefined') return '此浏览器没有 WebRTC 数据通道能力，请使用支持 WebRTC 的浏览器。'
  const options = await connectionOptions()
  const servers: RTCIceServer[] = options.config?.iceServers ?? []
  const hasTurn = servers.some(s => (Array.isArray(s.urls) ? s.urls : [s.urls]).some(u => /^turns?:/.test(u)))
  if (!hasTurn) return '当前仅能尝试直连：发布包未配置 TURN 中继，不同网络或运营商可能无法加入。'
  return new Promise(resolve => {
    const pc = new RTCPeerConnection({ ...options.config, iceTransportPolicy: 'relay' })
    let finished = false
    const finish = (text: string) => { if (finished) return; finished = true; clearTimeout(timer); pc.close(); resolve(text) }
    const timer = setTimeout(() => finish('TURN 未能分配中继通道。请检查地址、凭据、端口及当前网络；不要把建房成功当作中继可用。'), 12000)
    pc.onicecandidate = e => { if (e.candidate?.type === 'relay') finish('已取得 TURN 中继候选；还需让朋友实际加入，确认两端传输。') }
    pc.createDataChannel('connectivity-check')
    void pc.setLocalDescription().catch(() => finish('无法启动 WebRTC 中继检查。'))
  })
}
