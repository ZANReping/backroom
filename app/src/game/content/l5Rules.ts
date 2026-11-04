// L5 恐怖旅馆 1c：住客须知（真假混杂的守则卡）。
// 每个楼层按（种子, 楼层）抽 6 条真规则 + 2 条假规则；每张卡按位置哈希取其中一条。
// 假卡的破绽：抬头印成「恐怖旅舘」，或页脚房号是四位数（两种破绽至少有一种）。
// 真规则都对应游戏里的实际判定（见 l5Hotel.ts 的 hotelRuleProve）；读过的条目进登记簿，标「未核实」，
// 被实际判定验证后改为「已核实」。
import { h32 } from '../world/infinite'

export type L5RuleId =
  | 'run' | 'music' | 'gaze' | 'f13' | 'dnd' | 'boiler' | 'flicker' | 'lost'
  | 'rabbit' | 'dining' | 'bellhop' | 'night' | 'desk13'

export interface L5RuleDef {
  id: L5RuleId
  truth: boolean
  text: string // 卡面正文（酒店口吻）
  sub: string // 卡面小字补充
  proof?: string // 被证实时的消息（真规则；假规则为被证伪时）
}

export const L5_RULES: L5RuleDef[] = [
  { id: 'run', truth: true, text: '走廊内请勿奔跑。', sub: '本馆地毯为手工织造，员工对脚步声格外敏感。', proof: '你跑过走廊的时候，远处的铃声停了一拍。——「请勿奔跑」是真的。' },
  { id: 'music', truth: true, text: '音乐停止时，请回到您的房间。', sub: '换班期间，走廊仅供员工通行。', proof: '音乐停了。房门隔开了推车的声音。——「音乐停止时请回房间」是真的。' },
  { id: 'gaze', truth: true, text: '请勿长时间凝视画像。', sub: '画中诸位皆为本馆的老主顾，不喜被打量。', proof: '画里的眼睛也在看你。——「请勿凝视画像」是真的。' },
  { id: 'f13', truth: true, text: '13 楼为员工专用楼层。', sub: '住客请勿乘坐电梯前往该层。', proof: '13 楼没有住客。——「13 楼为员工专用」是真的。' },
  { id: 'dnd', truth: true, text: '请尊重挂有「请勿打扰」牌的房门。', sub: '房内的客人正在休息，请勿惊扰。', proof: '门开的一瞬间，整栋楼都安静了。——「请勿打扰」是真的。' },
  { id: 'boiler', truth: true, text: '锅炉房请勿久留。', sub: '高温与蒸汽可能造成不适，请尽快离开。', proof: '热气钻进喉咙。——「锅炉房请勿久留」是真的。' },
  { id: 'flicker', truth: true, text: '灯光同时闪烁时，请勿开启新出现的门。', sub: '那扇门并不为您而开。', proof: '门后是一间办公室。有人已经知道你来过了。——「请勿开启新出现的门」是真的。' },
  { id: 'lost', truth: true, text: '遗失物品请向家政服务查询。', sub: '本馆员工会妥善收拾住客遗落之物。', proof: '你的东西果然在家政服务那里。——「失物请找家政服务」是真的。' },
  { id: 'rabbit', truth: false, text: '迷路时，请跟随兔子。', sub: '它们熟悉本馆每一条走廊。' },
  { id: 'dining', truth: false, text: '餐厅全天免费开放，敬请享用。', sub: '一切餐饮均已计入房费。' },
  { id: 'bellhop', truth: false, text: '请将贵重物品交由行李员保管。', sub: '行李员会在您需要时送还。' }, // [bellhop] 半真半假：他确实保管、凭牌送还，13 楼也没收不到；但关注度到「清理」档时他拒收，并把东西先一步送去 10F 行李房
  { id: 'night', truth: false, text: '夜间请留在走廊，切勿返回房间。', sub: '房间会在夜间进行清洁。' },
  { id: 'desk13', truth: false, text: '如需前台服务，请乘电梯至 13 楼。', sub: '前台 24 小时为您服务。', proof: '13 楼没有前台。——「请去 13 楼前台」是假的。' },
]
export const L5_RULE: Record<L5RuleId, L5RuleDef> = Object.fromEntries(L5_RULES.map((r) => [r.id, r])) as Record<L5RuleId, L5RuleDef>
const TRUE_IDS = L5_RULES.filter((r) => r.truth).map((r) => r.id)
const FALSE_IDS = L5_RULES.filter((r) => !r.truth).map((r) => r.id)

const h01 = (...n: number[]) => h32(...n) / 4294967296
/** 种子洗牌取前 k 个（确定性） */
function pick<T>(arr: T[], k: number, seed: number, salt: number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) { const j = h32(seed, salt, i) % (i + 1); [a[i], a[j]] = [a[j], a[i]] }
  return a.slice(0, k)
}
/** 该楼层的 8 条守则（6 真 + 2 假）——纯函数 */
export function floorRules(seed: number, floor: number): L5RuleId[] {
  return [...pick(TRUE_IDS, 6, seed ^ 0x5c1, floor), ...pick(FALSE_IDS, 2, seed ^ 0x5c2, floor)]
}

export interface L5RuleCard { rule: L5RuleId; fake: boolean; tellName: boolean; tellRoom: boolean; room: string; no: number }
/** 世界坐标 (wx, wy) 处那张卡写着什么（纯函数；同一张卡每次读都一样） */
export function ruleCardAt(seed: number, floor: number, wx: number, wy: number): L5RuleCard {
  const rules = floorRules(seed, floor)
  const i = h32(seed, 0x5c3, wx, wy, floor) % rules.length
  const rule = rules[i]
  const fake = !L5_RULE[rule].truth
  // 假卡至少一种破绽：店名「旅舘」或四位数房号；真卡两种都没有
  const tk = h01(seed, 0x5c4, wx, wy)
  const tellName = fake && tk < 0.65
  const tellRoom = fake && (tk >= 0.35)
  const n = h32(seed, 0x5c5, wx, wy)
  let room = String(100 + (n % 900))
  if (room.endsWith('13')) room = room.slice(0, 2) + '4'
  if (tellRoom) room = String(1000 + (n % 9000))
  return { rule, fake, tellName, tellRoom, room, no: 1 + rules.indexOf(rule) }
}
export const HOTEL_NAME = '恐怖旅馆'
export const HOTEL_NAME_FAKE = '恐怖旅舘'
