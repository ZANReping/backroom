// 安全存储：在沙盒 iframe / 隐私模式下 localStorage 可能抛 SecurityError，全部静默降级
export const storage = {
  get(key: string): string | null {
    try { return localStorage.getItem(key) } catch { return null }
  },
  set(key: string, value: string): void {
    try { localStorage.setItem(key, value) } catch { /* ignore */ }
  },
  remove(key: string): void {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
  },
}
