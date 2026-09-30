import { toySnapshot } from '../platform/toy'
/** Toy 容器方向优先；普通浏览器读取设备方向，避免软键盘误触发。 */
export function isPortraitOrientation(): boolean {
  if (typeof window === 'undefined') return false
  const container = toySnapshot().container
  if (container) return container.orientation === 'portrait'
  const type = window.screen.orientation?.type
  if (type?.startsWith('portrait')) return true
  if (type?.startsWith('landscape')) return false
  // 较早的 iOS Safari 使用 window.orientation（0/180 为竖屏）。
  const angle = (window as Window & { orientation?: number }).orientation
  if (typeof angle === 'number') return Math.abs(angle) % 180 === 0
  return window.innerHeight >= window.innerWidth
}
