// 派对客（Entity 67）个体外观：颜色变体与「实习生」红气球。
// 按实体 id 确定性哈希——AI（partygoerAI）与渲染（partygoerMesh）各自调用，结果一致；不入存档。
// 维基：「一般呈现金黄色……值得关注的有红色、蓝色、绿色和白色的派对客」；
// 「大部分新转变的派对客『实习生』会手持漂浮的红色气球」——本作取约三分之一的个体。

export type PartygoerColor = 'yellow' | 'red' | 'blue' | 'green' | 'white'

/** 皮肤主色（材质 color，叠乘在皮革贴图与顶点 AO 上） */
export const PARTYGOER_SKIN: Record<PartygoerColor, string> = {
  yellow: '#f7cf3c',
  red: '#cf3a2c',
  blue: '#3f66cf',
  green: '#4f9f3e',
  white: '#ece8dc',
}

/** 32 位整数哈希 → [0,1) */
export function partyHash(n: number, salt: number): number {
  let x = Math.imul((n | 0) ^ salt, 0x9e3779b1)
  x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

/** 颜色变体：80% 金黄，其余红/蓝/绿/白各 5% */
export function partygoerColorFor(id: number): PartygoerColor {
  const r = partyHash(id, 0x67c0)
  if (r < 0.8) return 'yellow'
  if (r < 0.85) return 'red'
  if (r < 0.9) return 'blue'
  if (r < 0.95) return 'green'
  return 'white'
}

/** 是否为拴着红气球的新转化「实习生」（约 35%） */
export function partygoerInternFor(id: number): boolean {
  return partyHash(id, 0xba11) < 0.35
}

/** 气球拴在哪条面条臂上（0=左，1=右） */
export function partygoerBalloonArm(id: number): 0 | 1 {
  return partyHash(id, 0x5717) < 0.5 ? 0 : 1
}

export interface PartygoerLook { color: PartygoerColor; intern: boolean; balloonArm: 0 | 1 }
export function partygoerLook(id: number): PartygoerLook {
  return { color: partygoerColorFor(id), intern: partygoerInternFor(id), balloonArm: partygoerBalloonArm(id) }
}
