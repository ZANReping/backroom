import type { NpcDef } from './npcs'
import { genRandomNpcs } from './npcs'
import { RNG } from '../core/rng'

export const TRADERS_RESIDENT_COUNT = 154
export type TradersRole = 'visitor' | 'clerk' | 'porter' | 'guard' | 'office' | 'resident'

// v-market: BNTG is an American trade house; staff surnames follow its Western naming (no Chinese surname suffixes).
const SURNAME_POOL = ['卡特', '摩尔', '布朗', '米勒', '戴维斯', '加西亚', '威尔逊', '安德森', '泰勒', '托马斯', '杰克逊', '怀特', '哈里斯', '马丁', '汤普森', '罗宾逊', '克拉克', '刘易斯', '沃克', '霍尔', '艾伦', '帕克', '库珀', '赖特', '洛佩兹', '希尔', '斯科特', '格林', '亚当斯', '贝克', '尼尔森', '坎贝尔']
const ROLE_RANGES: readonly [TradersRole, number][] = [
  ['visitor', 72], ['clerk', 16], ['porter', 24], ['guard', 16], ['office', 10], ['resident', 16],
]

function roleForSlot(slot: number): TradersRole {
  let start = 0
  for (const [role, count] of ROLE_RANGES) {
    if (slot < start + count) return role
    start += count
  }
  throw new RangeError('invalid Traders resident slot')
}

function mixedSeed(seed: number, slot: number): number {
  return (Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul((slot + 1) >>> 0, 0x85ebca6b) ^ 0x54524752) >>> 0
}

const roleText: Record<TradersRole, { role: string; background: string; personality: string; idle: string; radius: number; gear: NonNullable<NpcDef['communityGear']> }> = {
  visitor: { role: '访客', background: '来商人之家办事或采购，正在熟悉路线与候场安排。', personality: '耐心观察，习惯先问清路线。', idle: '前面还要等多久？', radius: 1.8, gear: 'satchel' },
  clerk: { role: '公共服务职员', background: '负责公共服务窗口的登记与秩序。', personality: '说话清楚，做事按顺序。', idle: '请按顺序排队。', radius: .6, gear: 'clipboard' },
  porter: { role: '搬运工', background: '在通道间搬运货物，检查封签后再交接。', personality: '手脚利落，最在意封签和通道。', idle: '封签要再核一遍。', radius: 2, gear: 'tools' },
  guard: { role: 'TGPF警卫', background: '负责商人之家通道的日常警戒与通行证检查。', personality: '警觉而克制，先确认通行证。', idle: '通行证请准备好。', radius: 1, gear: 'radio' },
  office: { role: '办公室职员', background: '在办公室整理往来单据和登记记录。', personality: '细致耐心，喜欢把单据理顺。', idle: '这张单据还缺一栏。', radius: .7, gear: 'clipboard' },
  resident: { role: '商人之家职工', background: '在商人之家工作和生活，熟悉休息区与宿舍。', personality: '随和可靠，熟悉这里的生活节奏。', idle: '轮班后回宿舍歇会儿。', radius: 1.5, gear: 'book' },
}

function dialogue(role: TradersRole): NpcDef['lines'] {
  const topic = {
    visitor: '路线和候场：先看清要去的区段，再到指定位置等候。',
    clerk: '排队和登记：按窗口提示登记，轮到你时再上前。',
    porter: '封签和通道：封签完整才能交接，通道要保持畅通。',
    guard: '通行证：进入对应区段前，请把通行证准备好。',
    office: '单据：把日期、去向和经手人写清楚，之后查起来方便。',
    resident: '休息和宿舍：忙完这一班就回宿舍，公共休息区也能坐一会儿。',
  }[role]
  return [{ npc: `你好，我是这里的${roleText[role].role}。${topic}`, opts: [{ text: '知道了，先告辞。', action: 'leave' }] }]
}

export function createTradersResident(slot: number, seed: number): { role: TradersRole; def: NpcDef } {
  if (!Number.isInteger(slot) || slot < 0 || slot >= TRADERS_RESIDENT_COUNT) throw new RangeError('Traders resident slot must be 0..153')
  const rng = new RNG(mixedSeed(seed, slot))
  const role = roleForSlot(slot)
  const generated = genRandomNpcs(() => rng.next(), 1, 'bntg')[0]
  const spec = roleText[role]
  const { trade, barter, warehouse, medic, currency, ...base } = generated
  const def: NpcDef = {
    ...base,
    id: `traders_resident_${slot}`,
    name: `${base.name}·${SURNAME_POOL[Math.floor(rng.next() * SURNAME_POOL.length)]}`,
    role: spec.role,
    personality: spec.personality,
    background: spec.background,
    uniform: role === 'guard' || role === 'clerk' || role === 'office' ? { top: role==='guard'?'#4b555b':role==='clerk'?'#9a886b':'#b8b3a1', topStyle: 3, badge: '#e8e8e0' } : base.uniform,
    wanderRadius: spec.radius,
    communityGear: spec.gear,
    lines: dialogue(role),
    idle: [spec.idle],
  }
  return { role, def }
}
