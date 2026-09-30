/** 优先读取设备方向，避免软键盘压缩视口时被误判为手机旋转。 */
export function isPortraitOrientation(): boolean {
  if (typeof window === 'undefined') return false
  const type = window.screen.orientation?.type
  if (type?.startsWith('portrait')) return true
  if (type?.startsWith('landscape')) return false
  // 较早的 iOS Safari 使用 window.orientation（0/180 为竖屏）。
  const angle = (window as Window & { orientation?: number }).orientation
  if (typeof angle === 'number') return Math.abs(angle) % 180 === 0
  return window.innerHeight >= window.innerWidth
}
