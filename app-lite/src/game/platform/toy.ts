// Bilibili Toy SDK boundary: no login, identity or storage permissions are requested.
export type ToyContainerState = ToySDK.ToyContainerState
type Mode = ToySDK.SetContainerModeReq
const abilities = ['onContainerChange', 'getContainerState', 'setContainerMode', 'share', 'getQrCode', 'saveImageToAlbum'] as const
type Ability = typeof abilities[number]
type Snapshot = { ready: boolean; supported: Partial<Record<Ability, boolean>>; container: ToyContainerState | null; notice: string }
let snapshot: Snapshot = { ready: false, supported: {}, container: null, notice: '' }
const listeners = new Set<() => void>()
export const toySnapshot = () => snapshot
export const subscribeToy = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
function publish(update: Partial<Snapshot>) { snapshot = { ...snapshot, ...update }; listeners.forEach(fn => fn()) }
export function toyViewport() { return snapshot.container?.viewport ?? { width: window.innerWidth, height: window.innerHeight } }
export function toyNotice(notice: string) { publish({ notice }) }
// Bound asynchronous SDK calls so an unresponsive bridge cannot lock the UI.
export function toyTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('toy_timeout')), ms)
    promise.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
  })
}
export function toyErrorMessage(error: unknown): string {
  const e = error as { type?: string; code?: number; message?: string; name?: string } | null
  if (e?.message === 'toy_timeout') return '操作超时，请稍后重试；也可复制链接。'
  if (Number(e?.code) === 307044) return '请求过于频繁，请稍后再试。'
  if (e?.type === 'unsupported') return '当前环境不支持此操作，请在 B站 Toy 页面打开，或复制链接。'
  if (e?.type === 'invalid_param') return '平台未接受此内容，请重试或复制链接。'
  if (e?.name === 'NotAllowedError') return '未获得权限，可重试或手动复制下方链接。'
  return '操作未完成，可重试或复制链接。'
}
const qrCache = new Map<string, Promise<ToySDK.QrCodeResp>>()
export function getToyQr(path: string): Promise<ToySDK.QrCodeResp> {
  localToyLink(path) // Validate the relative path before crossing the bridge.
  const existing = qrCache.get(path)
  if (existing) return existing
  if (!window.toy || !snapshot.supported.getQrCode) return Promise.reject(new Error('unsupported'))
  const result = toyTimeout(Promise.resolve().then(() => window.toy!.getQrCode({ path, size: 240 }))).then(qr => {
    if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(qr.base64) || qr.base64.length > 2_000_000) throw new Error('invalid_qr')
    const url = new URL(qr.url)
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid_url')
    return qr
  }).catch(error => { if (qrCache.get(path) === result) qrCache.delete(path); throw error })
  if (qrCache.size >= 16) qrCache.delete(qrCache.keys().next().value!)
  qrCache.set(path, result)
  return result
}
let pending: { mode: Mode; timer: ReturnType<typeof setTimeout> } | null = null
function acceptContainer(state: ToyContainerState) {
  if (!state || !['portrait', 'landscape'].includes(state.orientation) || typeof state.immersive !== 'boolean' || !state.viewport || !Number.isFinite(state.viewport.width) || !Number.isFinite(state.viewport.height) || state.viewport.width <= 0 || state.viewport.height <= 0) return
  const style = document.documentElement.style
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const n = state.safeArea?.[side]
    style.setProperty(`--toy-safe-${side}`, `${Number.isFinite(n) ? Math.min(Math.max(0, n), side === 'left' || side === 'right' ? state.viewport.width / 2 : state.viewport.height / 2) : 0}px`)
  }
  style.setProperty('--toy-width', `${state.viewport.width}px`)
  style.setProperty('--toy-height', `${state.viewport.height}px`)
  document.documentElement.dataset.toyContainer = 'true'
  let notice = snapshot.notice
  if (pending && (pending.mode.immersive === undefined || pending.mode.immersive === state.immersive)
    && (pending.mode.orientation === undefined || pending.mode.orientation === state.orientation)) {
    clearTimeout(pending.timer); pending = null; notice = ''
  }
  publish({ container: state, notice })
  window.dispatchEvent(new Event('resize'))
}
// Effect-owned initialization also handles a slow/failed async SDK script.
export function initToy() {
  let disposed = false, started = false, off: (() => void) | undefined
  const script = document.getElementById('toy-sdk')
  const start = async () => {
    if (started || !window.toy) return
    started = true
    const sdk = window.toy
    const entries = await Promise.all(abilities.map(async a => {
      try { return [a, typeof sdk[a] === 'function' && await toyTimeout(Promise.resolve().then(() => sdk.isSupport(a)), 4000)] as const }
      catch { return [a, false] as const }
    }))
    if (disposed) return
    const supported = Object.fromEntries(entries)
    publish({ ready: true, supported })
    if (supported.onContainerChange) {
      try { off = sdk.onContainerChange(state => { if (!disposed) acceptContainer(state) }) }
      catch { publish({ supported: { ...supported, onContainerChange: false, setContainerMode: false } }) }
    }
    if (supported.getContainerState) {
      try { const state = await toyTimeout(sdk.getContainerState()); if (!disposed && !snapshot.container) acceptContainer(state) } catch { /* normal browser fallback */ }
    }
  }
  const load = () => { void start() }
  const fail = () => { if (!disposed) publish({ ready: true }) }
  script?.addEventListener('load', load); script?.addEventListener('error', fail)
  void start()
  const timer = setTimeout(fail, 5000)
  return () => {
    disposed = true; clearTimeout(timer); off?.()
    script?.removeEventListener('load', load); script?.removeEventListener('error', fail)
    if (pending) { clearTimeout(pending.timer); pending = null }
    for (const key of ['top', 'right', 'bottom', 'left']) document.documentElement.style.removeProperty(`--toy-safe-${key}`)
    for (const key of ['width', 'height']) document.documentElement.style.removeProperty(`--toy-${key}`)
    delete document.documentElement.dataset.toyContainer
    qrCache.clear()
    publish({ ready: false, supported: {}, container: null, notice: '' })
  }
}
export function requestToyMode(mode: Mode): boolean {
  if (!window.toy || !snapshot.supported.setContainerMode || !snapshot.supported.onContainerChange) return false
  if (snapshot.container && (mode.immersive === undefined || mode.immersive === snapshot.container.immersive)
    && (mode.orientation === undefined || mode.orientation === snapshot.container.orientation)) {
    if (pending) { clearTimeout(pending.timer); pending = null }
    toyNotice(''); return true
  }
  if (pending) clearTimeout(pending.timer)
  const request = { mode, timer: setTimeout(() => {
    if (pending === request) { pending = null; toyNotice('尚未确认横屏或沉浸模式，请手动横屏游玩。') }
  }, 4000) }
  pending = request
  toyNotice('正在调整显示模式…')
  // Call in the user gesture; the Promise is not a success acknowledgement.
  try { void window.toy.setContainerMode(mode).catch(() => {
    if (pending !== request) return
    clearTimeout(request.timer); pending = null; toyNotice('显示模式切换失败，请手动横屏游玩。')
  }) } catch { if (pending === request) { clearTimeout(request.timer); pending = null; toyNotice('当前客户端无法切换显示模式。') } }
  return true
}
export const enterToyGame = () => requestToyMode({ orientation: 'landscape', immersive: true })

export function validRoomCode(value: string | null): string | null {
  const code = value?.toUpperCase() ?? ''
  return /^[A-HJ-NP-Z2-9]{4}$/.test(code) ? code : null
}
export function invitationPath(code: string) {
  const valid = validRoomCode(code)
  if (!valid) throw new Error('房间码无效')
  return `index.html?room=${valid}`
}
export function localToyLink(path: string) {
  if (!/^index\.html(?:\?[^#\\]*)?$/.test(path)) throw new Error('分享路径无效')
  return new URL(path, new URL('./', window.location.href)).href
}
