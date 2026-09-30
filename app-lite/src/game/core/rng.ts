// 种子随机数生成器
export class RNG {
  private s: number
  constructor(seed: number) {
    this.s = seed >>> 0 || 1
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  range(a: number, b: number): number {
    return a + this.next() * (b - a)
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1))
  }
  chance(p: number): boolean {
    return this.next() < p
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }
  weighted<T>(entries: readonly { v: T; w: number }[]): T {
    const total = entries.reduce((s, e) => s + e.w, 0)
    let r = this.next() * total
    for (const e of entries) {
      r -= e.w
      if (r <= 0) return e.v
    }
    return entries[entries.length - 1].v
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff)
}

export function seedString(seed: number): string {
  const h = (seed >>> 0).toString(16).toUpperCase().padStart(8, '0')
  return `${h.slice(0, 4)}-${h.slice(4)}`
}
