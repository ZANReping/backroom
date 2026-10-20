// v83：Object 70（容器「尸体」）的纯数据工具——世界生成（含 worker）与渲染层共用，不依赖 three。
export const object70Hash = (a: number, b: number, c = 0) => {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0
  return (h ^ (h >>> 15)) >>> 0
}

/** 生成概率减半：按世界坐标的确定性哈希保留约 50%（不消耗生成器随机数，不打乱同一 chunk 其余生成结果） */
export function object70Keep(levelId: number, wx: number, wy: number): boolean {
  return object70Hash(Math.floor(wx) + 7919, Math.floor(wy) - 104729, levelId + 31) % 1000 < 500
}

/** Legacy L1 decoration corpses had no SID. Reserve negative IDs without consuming RNG. */
export function object70Sid(levelId: number, wx: number, wy: number, floor = 0): number {
  return -1 - object70Hash(Math.round(wx * 32), Math.round(wy * 32), levelId * 17 + floor + 11)
}
