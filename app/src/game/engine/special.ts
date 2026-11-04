import { toiletSpecial } from './toilet'
// [window] 特殊交互键（默认 X，可在设置里改绑；移动端是情境按钮，只在有可用动作时出现）。
// 一个键、多种情境：每个情境在下表登记「此刻能不能用 + 显示什么」，按顺序取第一个可用的。
// 按住型动作（hold）由 engine.specialHeld 持续为真来驱动；点按型以后需要时再加 onPress。
// 目前：窗户（Entity 2）的「默念」；无面灵（Entity 9）幼体的「安抚」；Ferren（Entity 92）按作息时段的摸摸 / 打扰 / 盖被子（点按，ferrenAI 取 specialHeld 上升沿）。
import type { Engine } from '../engine'
import { murmurAvailable } from './windowAI'
import { sootheAvailable } from './facelingAI'
import { ferrenSpecial } from './ferrenAI'
import { houndSpecial } from './houndAI'
import { creepSpecial,creepStage } from './creeperAI'
import { isMerchant } from './merchantTrade'
import { hotelSpecial } from './l5Hotel'
import { maidSpecial } from './maidAI'
import { conciergeSpecial } from './conciergeAI'
import { bellhopSpecial } from './bellhopAI'
import { beastSpecial } from './beastAI'
import { spokesSpecial } from './spokesAI'
import { chefSpecial } from './chefAI'
import { jazzSpecial } from './jazzAI'
import { casinoSpecial } from './casinoAI'

export interface SpecialAction {
  id: string
  /** 按钮 / 提示上的动词 */
  label: string
  /** 提示里的补充说明 */
  hint: string
  /** 按住生效 */
  hold: boolean
}
interface SpecialProvider { id: string; test: (eng: Engine) => SpecialAction | null }

const PROVIDERS: SpecialProvider[] = [
  { id: 'houndPin', test: (eng) => houndSpecial(eng) }, // 被扑倒时优先挣脱
  { id: 'creep', test: (eng) => creepSpecial(eng) }, // 爬菌一阶烧灼，优先于普通情境交互
  { id: 'toiletFart', test: toiletSpecial },
  { id: 'murmur', test: (eng) => murmurAvailable(eng) ? { id: 'murmur', label: '默念', hint: '在心里重复自我确认，抵抗窗户的诱引', hold: true } : null },
  // v90 无面灵：哭闹的幼体就在身边时，按住安抚（约 2.4 秒）
  { id: 'soothe', test: (eng) => sootheAvailable(eng) ? { id: 'soothe', label: '安抚', hint: '蹲下来轻拍哭闹的幼年无面灵，让它平静下来', hold: true } : null },
  // [ferren] 商人之家雪貂笼：娱乐/散步 摸摸 · 训练 打扰（扣声望）· 睡觉 盖被子
  { id: 'ferren', test: (eng) => ferrenSpecial(eng) },
  // 恐怖旅馆 1b：把肖像翻过去（点按，l5Hotel 消费）/ 贝弗莉麻将桌取牌（按住 4 秒）
  { id: 'hotel', test: (eng) => hotelSpecial(eng) },
  // [maid] 管家（Entity 111）：对平静的她按 X 从清洁车要回一件失物
  { id: 'maid', test: (eng) => maidSpecial(eng) },
  // [concierge] 看门人（Entity 131）：搭话时 X 跟他走；前台 X 交还 437 号钥匙
  { id: 'concierge', test: (eng) => conciergeSpecial(eng) },
  // [bellhop] 行李员（Entity 135）：2 m 内 X 递信 / 递茶 / 取回 / 领回钥匙 / 寄存；10F 行李房 X 翻找（移动端情境按钮文案同 label）
  { id: 'bellhop', test: (eng) => bellhopSpecial(eng) },
  // [beast] 第五层的野兽（Entity 18）：117 办公室书桌前 X 谈生意（三份契约选一，握手即签）
  { id: 'beast', test: (eng) => beastSpecial(eng) },
  // [spokes] 迎宾女郎（Entity 28）：大堂里 X 搭话 / 给她看照片 / 还证件；大堂与 L5 里 X 抓住发条兔
  { id: 'spokes', test: (eng) => spokesSpecial(eng) },
  // [chef] 厨师（Entity 800）：餐厅 X 吃一份 / 端详 / 摇服务铃；后厨 X 偷锅 / 关灶 / 砸灶；冷库 X 开铐 / 扯铁管
  { id: 'chef', test: (eng) => chefSpecial(eng) },
  // [jazz] 爵士脑（Entity 197）：场间吧台 X 搭话（萨克斯 = 点歌、低音提琴 = 辣椒酱）/ 演出中台口 X 点歌 / 监控下或老板身边按住 X 告发
  { id: 'jazz', test: (eng) => jazzSpecial(eng) },
  // [casino] Level 5.1：X 兑换台 / 老虎机 / 21 点 / 轮盘 / 骰宝 / 吧台
  { id: 'casino', test: (eng) => casinoSpecial(eng) },
  // 商人：准心对着有货的 NPC 时，X 直接打开该团体的商店界面（E 仍是交谈；engine.step 消费点按）
  { id: 'trade', test: (eng) => { const t = eng.interactTarget, n = t?.kind === 'npc' ? t.npc : undefined; return n && creepStage(eng.creepRun)<4 && !n.dead && !n.hostile && isMerchant(n.def) ? { id: 'trade', label: '交易', hint: `打开${n.def.name}的商店`, hold: false } : null } },
]

/** 当前情境下特殊交互键能做什么（null = 没有可用动作：HUD 不提示、移动端按钮隐藏） */
export function specialAction(eng: Engine): SpecialAction | null {
  if (!eng.map || eng.over) return null
  for (const p of PROVIDERS) { const a = p.test(eng); if (a) return a }
  return null
}
