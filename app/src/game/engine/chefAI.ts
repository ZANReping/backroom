// [chef] 厨师（Entity 800「The Chef」）阶段 3：机制。方案 /workspace/work/chef/plan.md「机制」节 + ZAN 11-02 定稿：
//   吐锅只做远景背身、吃人只做冷库遮挡 + 声音；被抓 = 冷库限时脱身；打不死（偷锅 / 关灶 / 铃声引开）；食物上瘾轻度（饥饿加快 + 字幕）；肥厚人手。
// 维基 entity-800：慢节奏的夜晚循环；顾客着迷进食、看不见他（与环境融为一体）；被拍照 / 被看见就盯上那个人；用唯一带把手的锅砸人；
//   拖进冰柜铐在铁管上；把人吐进大锅做炖菜和香肠；打烊后绑门闩门；听到铃声和闪光灯耳朵抽搐；最后一台燃气灶；M.E.G. 档案员。
//
//   · 地点：L5 餐厅大厅格的北面后场（content/chefLayout：储藏室 / 厨房 / 冷库）+ 餐厅（餐桌、着迷进食的顾客、西南角服务铃、南墙双开正门）。
//     玩家走近一座餐厅（CK.spawnR）时他出现在灶前（孤例），走远（CK.despawnR）就收起；他不出餐厅大厅格（狂怒追偷锅贼除外）。
//   · 看不见他：默认与环境融为一体（渲染：抖动溶解 + 边缘先化开，不投影；没有余光提示）。「看见」= 被他盯上：
//       ① 用档案员的相机拍他（闪光 → flashFreeze 僵住 → 盯上）；② 盯着他看超过 CK.stareT 秒（越盯越清楚）；③ 进厨房（他在厨房、看得见你；打烊后进后场一律算）；
//       ④ 酒店关注度 ≥ CK.attnMark 时出现在餐厅里；⑤ 在 CK.bellWin 秒内摇铃 ≥ CK.bellSpam 次；⑥ 动手打他。不看他、不进厨房的人，他不碰。
//   · 盯上之后：变清晰，慢慢走过来（humWalk；打烊后 waddle）；你在餐桌边就绕到桌子对面敲你的桌子（tapTable，每一下 −理智）。
//     你转身背对他、或者看向出口的那一刻（CK.swingR 内）→ 冲上来 potSwing（蓄力慢、出手 0.12 s；1.41 s 判定，CK.swingReach 外躲得开）。
//   · 被砸中：黑屏 → grabDrag 拖走 → 冷库铐在铁管上。冷库：体温持续下降（低于 CK.coldHurt 掉血）；时限 CK.coldLimit 秒：
//       万能钥匙 / 撬棍（按住 X CK.keyHold 秒开铐）或连按 X 扯管子（QTE：每下 +CK.yankPer、持续回落，满 100 脱身；每过 25% 铁管哐一声，他提前 CK.yankEarly 秒回来）；
//       超时：门外刀从磁条上取下（takeKnife）→ 他拿着刀进来 → 黑屏、关门的声音 = 死亡（不演吃人）。
//   · 餐厅食物：营业时免费（桌上一盘：炖菜 / 香肠 / 牛排），回血回饱食多；轻度上瘾：吃过后 CK.addictT 秒饥饿下降 ×(1+CK.addictK)、
//     HUD 偶尔冒出「再来一份」的念头；吃的时候屏幕边缘变暖、盯他的进度不涨（更难注意到他）。
//     理智 ≥ CK.truthSan 时 X 先是「端详这盘菜」→ 看清真相；读过档案员遗物也一样。知道真相后再吃 −理智（与迎宾女郎心声「食物真相」一致）。
//   · 夜晚循环：接 L5 换班——音乐一停（shift）就打烊，直到恢复营业后 CK.closeExtra 秒：他走到正门 barricade 绑绳闩门，餐厅所有门上锁（撬棍 / 万能钥匙 / 斧头能撬侧门），
//     不再上菜；他在后场巡（stoveLean / sniffCrouch / 刀墙），偶尔穿过餐厅。打烊后进后场 = 立刻盯上；在餐厅里被他看见（CK.nightSee 内）也是。营业时坐着吃饭相对安全。
//     vomitPot 只在背身远景演：你在 CK.vomitMinD 外、在他身后时，他偶尔对着大锅干呕。
//   · 反制：在餐厅另一头摇服务铃 → earTwitch 去应铃（CK.bellWait 秒），趁机溜进厨房；偷走「唯一带把手的锅」→ 不上菜、没武器，暴怒赤手追（只能抓，不能砸），
//     抓到你 / 锅丢在餐厅里被他捡回之前一直停供；关掉燃气灶（CK.stoveOffT）/ 砸坏（拿着近战武器，CK.stoveBrokenT）→ 停产，他守着灶不出来（靠近 CK.guardR 才动手）。
//     打不死：挨打只顿一下（stun）并盯上你。
//   · M.E.G. 档案员遗物：冷库地上 / 餐桌边——未写完的表单、坏掉的胸麦、拍到他的照片、相机。读了 = 知道食物真相；相机可以拍照（会惊动他）。
//   · 联动：迎宾女郎的发条兔把人带进餐厅 = 送到他这里（盯上）；关注度满、野兽熄灯缠抓时，有一定概率把人「交给厨师」（直接醒在冷库）；
//     管家巡到餐厅会擦掉地毯上的血迹；setChefBlood 随吃掉的人数 / 夜晚推进加深。
//   · 存档 eng.hotel.chef：是否被盯上 / 上瘾剩余 / 真相 / 锅 / 灶 / 夜晚数 / 受害者 / 血迹 / 统计。
import type { Engine } from '../engine'
import type { Entity } from '../entities'
import { makeEntity } from '../entities'
import type { SpecialAction } from './special'
import type { Structure } from '../core/types'
import { hotelAddAttn, saveBook } from './l5Hotel'
import { audio } from '../core/audio'
import { floorHeight } from '../world/mapgen'
import { canOccupy, PLAYER_RADIUS } from '../core/player'
import { resetMoveVelocity } from './moveTuning'
import { ITEMS, itemName } from '../content/items'
import { look } from '../renderer/shared'
import { jazzLive, jazzSauceWarm, JAZZ_LINK } from './jazzLink' // [jazz]
import { chefSiteAt, inService, inDining, inHall, inRect, tapSpots, type ChefSite, type Spot } from '../content/chefLayout'

// ---------- 调参表（单位：米 / 秒 / 点）---------- ZAN 可直接改这里
export const CK = {
  // —— 出现 ——
  spawnR: 48, despawnR: 75, // 离餐厅中心多近他出现 / 多远收起
  // —— 看不见他 / 被看见 ——
  stareT: 3.0, stareR: 14, stareCone: 0.13, stareDecay: 0.8, stareVis: 0.32, // 盯 3 s 被发现；越盯越清楚（最多 0.32）
  attnMark: 70, // 关注度 ≥ 70 出现在餐厅 = 盯上
  bellSpam: 3, bellWin: 20, // 20 s 内摇 3 次 = 乱摇
  photoR: 14, photoCone: 0.5, flashCd: 3, // 相机：闪光范围 / 视锥半角 / 冷却
  markMem: 240, forgetR: 22, forgetT: 25, // 被盯上记多久；离开多远多久他放弃追
  // —— 盯上之后 ——
  stalkSpeed: 0.38, stalkFar: 0.6, stalkNear: 8, nightSpeed: 0.75, rageSpeed: 1.7, lungeSpeed: 2.4, // 8 m 内哼着小调慢慢走（humWalk 0.38），更远蹒跚走（waddle 0.6）
  tapR: 1.7, tapSan: 4, tapCd: 2.5, // 你在桌边 1.7 m 内他就去敲桌；每敲一下 −4 理智
  standOff: 1.25, // 没有桌子时他停在你面前多远
  swingR: 3.2, swingReach: 1.9, swingHit: 1.41, swingDmg: 15, awayAngle: 1.9, exitCone: 0.5, exitR: 6, // 背对（> 109°）或看向出口（6 m 内的门 ±0.5 rad）
  grabR: 1.0, // 赤手只能抓（偷锅之后）
  koT: 1.6, dragShow: 3.2, // 黑屏 / 拖行演出
  stunT: 0.9,
  // —— 冷库 ——
  coldLimit: 75, coldRate: 0.95, coldHurt: 35, coldHp: 1.0, // 体温每秒 −0.95；低于 35 每秒 −1 血
  keyHold: 2.2, yankNeed: 100, yankPer: 7, yankDecay: 6, yankEarly: 6,
  knifeLine: 3.2, knifeWalkSpeed: 0.75, killR: 1.35,
  // —— 食物 ——
  food: [
    { id: 'stew', name: '炖菜', hunger: 35, hp: 12, thirst: 8, look: '一碗浓得化不开的炖菜，肉块炖得酥烂，香得过分。', truth: '汤面上浮着一片没化开的指甲。肉块的纹理你认得——那是人的手掌。' },
    { id: 'sausage', name: '香肠', hunger: 30, hp: 10, thirst: 0, look: '一盘煎得油亮的粗香肠，肠衣上还冒着油泡。', truth: '肠衣里灌的东西是灰红色的，夹着一缕头发。' },
    { id: 'steak', name: '牛排', hunger: 40, hp: 18, thirst: 0, look: '一块五分熟的厚牛排，切面渗着粉红的汁。', truth: '这不是牛。皮下还有一小块蓝色的纹身。' },
  ],
  eatT: 2.4, eatR: 1.7, refill: 45, warmT: 8, eatSan: 2,
  addictT: 300, addictMax: 900, addictK: 0.6, thoughtEvery: [50, 110] as const,
  truthSan: 80, truthSanHit: 6,
  // —— 夜晚 ——
  closeExtra: 120, nightSee: 8, nightSniff: 1.5, patrolEvery: [18, 34] as const,
  vomitMinD: 7, vomitEvery: [60, 120] as const,
  // —— 反制 ——
  bellR: 1.6, bellWait: 12, bellCatchR: 4,
  stoveOffT: 240, stoveBrokenT: 480, guardR: 3.0, hookR: 1.5,
  rageT: 45,
  // —— 联动 ——
  beastHandoffP: 0.5, // 野兽熄灯缠抓（关注度满）时、你在餐厅附近（他已出现）把人交给厨师的概率
  rabbitAttn: 6, // 发条兔把人带到餐厅：额外关注度
  stainLife: 600, wipeT: 4, stainCap: 8,
  // —— 血 ——
  blood0: 0.35, bloodVictim: 0.1, bloodNight: 0.03,
}
/** 片段时长（= renderer/chefAnim CHEF_CLIPS.dur；AI 不依赖渲染模块）。check:chef 对照 */
export const CHEF_CLIP_LEN = { idle: 6, waddle: 1.4, humWalk: 2, serve: 5.6, earTwitch: 3.6, tapTable: 4, potSwing: 3.4, grabDrag: 2.2, sniffCrouch: 6, takeKnife: 6.4, barricade: 8, stuffedStagger: 2.6, stoveLean: 4, vomitPot: 6, flashFreeze: 4, standFromChair: 5, holdCabbage: 5 } as const
export type ChefClipId = keyof typeof CHEF_CLIP_LEN
const LOOP = new Set<ChefClipId>(['idle', 'waddle', 'humWalk', 'grabDrag', 'stuffedStagger', 'stoveLean', 'holdCabbage'])
/** 片段速度（m/s，= CHEF_CLIPS.speed）：渲染按实际速度 / 片段速度缩放步频 */
export const CHEF_CLIP_SPEED: Partial<Record<ChefClipId, number>> = { waddle: 0.6, humWalk: 0.38, grabDrag: 0.32, stuffedStagger: 0.26 }
/** tapTable 三下敲桌的时刻（chefAnim）；takeKnife 取下刀的时刻；barricade 推上门闩的时刻 */
export const TAP_TIMES = [1.4, 2.0, 2.6], KNIFE_TAKE = 1.95, BAR_BOLT = 6.8

// ---------- 存档（eng.hotel.chef，随局）----------
export interface ChefStain { x: number; y: number; t: number } // 绝对坐标；t = 剩余秒
export interface ChefSave {
  marked: 0 | 1; markT: number
  eat: number; addictT: number
  truth: 0 | 1
  potStolen: 0 | 1
  stoveT: number; stoveBroken: 0 | 1
  nights: number; victims: number
  stains: ChefStain[]
  relics: string[] // 读过的档案员遗物
  n: { seen: number; mark: number; tap: number; swing: number; caught: number; escKey: number; escYank: number; died: number; bell: number; pot: number; stove: number; photo: number; meal: number; rabbit: number; beast: number; wiped: number }
}
const N0 = () => ({ seen: 0, mark: 0, tap: 0, swing: 0, caught: 0, escKey: 0, escYank: 0, died: 0, bell: 0, pot: 0, stove: 0, photo: 0, meal: 0, rabbit: 0, beast: 0, wiped: 0 })
export function freshChefSave(): ChefSave { return { marked: 0, markT: 0, eat: 0, addictT: 0, truth: 0, potStolen: 0, stoveT: 0, stoveBroken: 0, nights: 0, victims: 0, stains: [], relics: [], n: N0() } }
export function restoreChefSave(raw: unknown): ChefSave {
  const f = freshChefSave()
  if (!raw || typeof raw !== 'object') return f
  const r = raw as Partial<ChefSave>
  const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)
  const n = (r.n ?? {}) as Record<string, unknown>
  return {
    marked: r.marked ? 1 : 0, markT: Math.max(0, num(r.markT)),
    eat: Math.max(0, Math.floor(num(r.eat))), addictT: clamp(num(r.addictT), 0, CK.addictMax),
    truth: r.truth ? 1 : 0, potStolen: r.potStolen ? 1 : 0,
    stoveT: Math.max(0, num(r.stoveT)), stoveBroken: r.stoveBroken ? 1 : 0,
    nights: Math.max(0, Math.floor(num(r.nights))), victims: Math.max(0, Math.floor(num(r.victims))),
    stains: Array.isArray(r.stains) ? r.stains.filter((s) => s && Number.isFinite(Number(s.x)) && Number.isFinite(Number(s.y))).slice(-CK.stainCap).map((s) => ({ x: Number(s.x), y: Number(s.y), t: Math.max(0, num(s.t, CK.stainLife)) })) : [],
    relics: Array.isArray(r.relics) ? r.relics.filter((v) => typeof v === 'string') : [],
    n: Object.fromEntries(Object.keys(f.n).map((k) => [k, Math.max(0, Math.floor(num(n[k])))])) as ChefSave['n'],
  }
}
export function chefSave(eng: Engine): ChefSave { return ((eng.hotel as { chef?: ChefSave }).chef ??= freshChefSave()) }

// ---------- 实体状态（不入存档）----------
export type ChefMode = 'cook' | 'walk' | 'serve' | 'twitch' | 'bell' | 'stalk' | 'tap' | 'lunge' | 'swing' | 'drag' | 'freeze' | 'barricade' | 'patrol' | 'sniff' | 'lean' | 'guard' | 'rage' | 'grab' | 'knife' | 'vomit' | 'stun' | 'pickup' | 'gone'
export interface ChefEntState {
  mode: ChefMode; modeT: number
  clip: ChefClipId; seq: number; blend: number
  /** 叠加转头（rad，+ = 向他的左边） */
  turn: number
  route: { x: number; y: number }[]; ri: number; then: ChefMode; at: Spot | null; speed: number; walkClip: ChefClipId
  /** 渲染：清晰度 0（融进环境）… 1（清楚）——AI 给目标，渲染平滑 */
  vis: number
  /** 手里拿着刀（takeKnife 之后进冷库） / 手里有没有那口锅（偷走之后没有） */
  knife: boolean; pot: boolean
  taps: number; tapCd: number; hitDone: boolean
  repath: number; lostT: number; idleT: number
  bellAt: { x: number; y: number } | null
  table: { x: number; y: number } | null
  applied: boolean
}
export function ensureChef(e: Entity): ChefEntState {
  return (e.ck ??= { mode: 'cook', modeT: 0, clip: 'idle', seq: 0, blend: 0.4, turn: 0, route: [], ri: 0, then: 'cook', at: null, speed: CK.stalkSpeed, walkClip: 'humWalk', vis: 0, knife: false, pot: true, taps: 0, tapCd: 0, hitDone: false, repath: 0, lostT: 0, idleT: 0, bellAt: null, table: null, applied: false })
}
export function findChef(eng: Engine): Entity | null { return eng.map?.entities.find((e) => e.def.type === 'chef' && !e.dead) ?? null }
function setClip(s: ChefEntState, clip: ChefClipId, blend = 0.3) { if (clip !== s.clip || !LOOP.has(clip)) s.seq++; s.clip = clip; s.blend = blend }
function setMode(s: ChefEntState, m: ChefMode, clip: ChefClipId, blend = 0.3) { s.mode = m; s.modeT = 0; s.applied = false; setClip(s, clip, blend) }

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const inL5 = (eng: Engine) => eng.levelDef.id === 5 && !!eng.map?.inf
const off = (eng: Engine) => ({ ox: eng.map?.inf?.ox ?? 0, oy: eng.map?.inf?.oy ?? 0 })
const hasT = (eng: Engine, t: string) => [eng.player.hotbar, eng.player.backpack].some((a) => a.some((sl) => sl?.type === t)) || (eng.player.equip?.pockets ?? []).some((sl) => sl?.type === t)
function take(eng: Engine, t: string): boolean {
  for (const arr of [eng.player.hotbar, eng.player.backpack]) for (let i = 0; i < arr.length; i++) { const sl = arr[i]; if (sl?.type === t) { if ((sl.count ?? 1) > 1) sl.count--; else arr[i] = null; eng.syncPassives?.(); return true } }
  return false
}
function addAttn(eng: Engine, v: number) { if (inL5(eng)) hotelAddAttn(eng, v); else eng.hotel.attn = clamp(eng.hotel.attn + v, 0, 100) }
function meet(eng: Engine) { const b = eng.hotelBook; if (!b.met.includes('chef')) { b.met.push('chef'); saveBook(b) } }
function rel(eng: Engine, v: number) { const h = eng.hotel; h.staff.chef = clamp((h.staff.chef ?? 0) + v, -100, 100) }

/** world 点 → 他的 root 空间（+Z 正前方、+X 他的左侧） */
export const chefToRoot = (e: { x: number; y: number; facing: number }, wx: number, wy: number, h = 0): [number, number, number] => {
  const dx = wx - e.x, dy = wy - e.y, c = Math.cos(e.facing), s = Math.sin(e.facing)
  return [dx * s - dy * c, h, dx * c + dy * s]
}
/** 他的 root 空间 → world */
export const chefFromRoot = (e: { x: number; y: number; facing: number }, rx: number, rz: number) => {
  const c = Math.cos(e.facing), s = Math.sin(e.facing)
  return { x: e.x + rx * s + rz * c, y: e.y - rx * c + rz * s }
}

// =====================================================================
// 字幕 / 文案
// =====================================================================
/** 「再来一份」的念头（上瘾时偶尔冒出来；HUD 暖色斜体） */
export const CRAVE: readonly string[] = [
  '……再来一份也没关系吧。',
  '那碗炖菜的味道还在舌头上。',
  '餐厅的方向，好像飘来烤肉的香味。',
  '肚子在叫。明明刚吃过。',
  '就一口。吃完就走。',
  '白桌布、银餐具、热腾腾的盘子——谁会拒绝呢。',
  '你发现自己在数还有几条走廊到餐厅。',
  '再来一份。再来一份。再来一份。',
]
/** 知道真相之后的念头 */
export const CRAVE_TRUE: readonly string[] = [
  '你知道那是什么。可你还是饿。',
  '舌头记得那个味道。你恨它记得。',
  '指甲。头发。纹身。……你咽了一下口水。',
  '你又闻到了。从很远的地方。',
]
/** 被盯上的征兆（只用字幕 + 声音，不画箭头） */
const MARK_LINE: Record<string, string> = {
  stare: '你盯着的那团影子，慢慢有了轮廓——一顶高高的厨师帽。它也在看你。',
  photo: '闪光灯一亮，灶台边那个肥胖的人形僵住了。两只耳朵猛地竖了起来。',
  kitchen: '后厨里有人停下了手里的活。你听见很重的呼吸声。',
  night: '黑暗里有人哼着小调，哼到一半停了。',
  attn: '餐厅里所有人都在低头吃饭。只有一个人在看你。',
  bell: '铃声还在响。后厨的弹簧门晃了一下。',
  hit: '你打中了什么很软、很厚的东西。它没有倒下。',
  rabbit: '兔子停在一张铺好白桌布的长桌下。后厨的弹簧门轻轻晃了一下，有人在门缝里看你。',
  beast: '',
}

// ---------- 运行时（不入存档）----------
interface ChefRt {
  map: unknown
  site: ChefSite | null; siteScan: number
  stare: number
  bells: number[]
  flashT: number; flashCd: number
  eating: { key: string; t: number; dish: number } | null
  warmT: number; thoughtT: number
  subs: { text: string; t: number; kind: 'chef' | 'thought' | 'sys' }[]
  ko: number // 黑屏剩余（秒）
  drag: { t: number } | null
  cuff: { t: number; temp: number; yank: number; keyT: number; early: number; phase: 'cuffed' | 'knife' | 'enter'; marks: number } | null
  plates: Map<string, number> // 桌子（世界格）→ 下一份上桌的时刻（eng.time）
  closedUntil: number; phase: string; closed: boolean
  barred: boolean
  locked: Set<string>; pried: Set<string>
  vomitT: number; patrolT: number
  killT: number
  siteKey: string
  sniffT: number
  wipes: Map<object, { x: number; y: number; t: number }>
}
const RT = new WeakMap<Engine, ChefRt>()
function rt(eng: Engine): ChefRt {
  let r = RT.get(eng)
  if (!r) { r = { map: null, site: null, siteScan: 0, stare: 0, bells: [], flashT: 0, flashCd: 0, eating: null, warmT: 0, thoughtT: 30, subs: [], ko: 0, drag: null, cuff: null, plates: new Map(), closedUntil: -1, phase: 'play', closed: false, barred: false, locked: new Set(), pried: new Set(), vomitT: 40, patrolT: 20, killT: 0, siteKey: '', sniffT: 0, wipes: new Map() }; RT.set(eng, r) }
  return r
}
export function chefDebug(eng: Engine) { return rt(eng) }
export function chefSay(eng: Engine, text: string, kind: 'chef' | 'thought' | 'sys' = 'sys', dur = 4, clear = false) {
  const r = rt(eng)
  if (clear) r.subs.length = 0
  r.subs.push({ text, t: dur, kind })
  while (r.subs.length > 3) r.subs.shift()
}

// =====================================================================
// 地点
// =====================================================================
/** 窗口里离玩家最近的厨师餐厅（世界坐标的 ChefSite；没有 = null）。每 1 s 重查一次 */
export function chefSite(eng: Engine): ChefSite | null {
  const r = rt(eng), m = eng.map
  if (!m?.inf || eng.levelDef.id !== 5) return null
  if (r.map !== m) { r.map = m; r.site = null; r.siteScan = 0; r.plates.clear(); r.locked.clear(); r.pried.clear(); r.barred = false }
  if (r.siteScan > 0 && r.site) return r.site
  r.siteScan = 1
  const { ox, oy } = off(eng), seed = m.inf.seed
  const wx = eng.player.x + ox, wy = eng.player.y + oy
  // 大厅格 hk ≈ (wx − 13) / 40
  const hk0 = Math.floor((wx - 13) / 40), hr0 = Math.floor((wy - 13) / 40)
  let best: ChefSite | null = null, bd = Infinity
  for (let hk = hk0 - 2; hk <= hk0 + 2; hk++) for (let hr = hr0 - 2; hr <= hr0 + 2; hr++) {
    const s = chefSiteAt(seed, hk, hr); if (!s) continue
    const cx = (s.hall.x0 + s.hall.x1 + 1) / 2, cy = (s.hall.y0 + s.hall.y1 + 1) / 2
    // 整座餐厅要在窗口里
    if (s.hall.x0 - ox < 1 || s.hall.y0 - oy < 1 || s.hall.x1 + 2 - ox >= m.w || s.hall.y1 + 2 - oy >= m.h) continue
    const d = Math.hypot(cx - wx, cy - wy)
    if (d < bd) { bd = d; best = s }
  }
  r.site = best
  return best
}
const W = (eng: Engine, p: { x: number; y: number }) => { const { ox, oy } = off(eng); return { x: p.x - ox, y: p.y - oy } }
const WS = (eng: Engine, p: Spot): Spot => { const { ox, oy } = off(eng); return { x: p.x - ox, y: p.y - oy, f: p.f } }
const world = (eng: Engine, x: number, y: number) => { const { ox, oy } = off(eng); return { x: x + ox, y: y + oy } }
/** 玩家 / 某窗口点在哪：kitchen / pantry / cold / service / dining / hall / null */
export function chefZone(eng: Engine, x = eng.player.x, y = eng.player.y): 'kitchen' | 'pantry' | 'cold' | 'dining' | null {
  const s = chefSite(eng); if (!s) return null
  const w = world(eng, x, y)
  if (inRect(s.kitchen, w.x, w.y)) return 'kitchen'
  if (inRect(s.pantry, w.x, w.y)) return 'pantry'
  if (inRect(s.cold, w.x, w.y)) return 'cold'
  if (inDining(s, w.x, w.y)) return 'dining'
  if (inService(s, w.x, w.y)) return 'kitchen' // 隔墙门洞
  return null
}
export function chefInHall(eng: Engine, x = eng.player.x, y = eng.player.y) { const s = chefSite(eng); if (!s) return false; const w = world(eng, x, y); return inHall(s, w.x, w.y) || (w.y >= s.hall.y1 + 1 && w.y < s.hall.y1 + 2 && w.x >= s.front.x && w.x < s.front.x + 2) }
/** 发条兔「带进餐厅」的终点（窗口坐标）：餐厅正中、离正门几步的地毯上；附近没有厨师餐厅 → null（spokesAI 退回旧扫描，但跳过后场） */
export function chefDiningSpot(eng: Engine): { x: number; y: number } | null {
  const s = chefSite(eng); if (!s) return null
  return W(eng, { x: s.front.x + 1, y: s.hall.y1 - 1.5 })
}
/** spokesAI 旧扫描用：这一格（窗口）是不是后场 */
export function chefIsService(eng: Engine, x: number, y: number) { const s = chefSite(eng); if (!s) return false; const w = world(eng, x, y); return inService(s, w.x, w.y) }

// =====================================================================
// 营业 / 打烊（接 L5 换班）
// =====================================================================
export function chefClosed(eng: Engine): boolean { return rt(eng).closed }
function stepSchedule(eng: Engine) {
  const r = rt(eng), sv = chefSave(eng), ph = eng.hotelShift.phase
  if (ph !== r.phase) { if (r.phase === 'shift' && ph !== 'shift') r.closedUntil = eng.time + CK.closeExtra; r.phase = ph }
  const closed = ph === 'shift' || eng.time < r.closedUntil
  if (closed !== r.closed) {
    r.closed = closed
    if (closed) {
      sv.nights++
      r.plates.clear(); r.eating = null
      if (chefInHall(eng)) eng.msg('餐厅里的灯暗了一半。后厨传来收拾锅碗的声音——打烊了。', 'lore')
      const e = findChef(eng); if (e) goBarricade(eng, e)
    } else {
      r.barred = false
      unlockDoors(eng)
      if (chefInHall(eng)) eng.msg('正门的绳子不知什么时候解开了。银餐具又摆好了——营业了。', 'lore')
    }
  }
  // 打烊 20 s 了他还没来闩门（在忙别的）：门照样锁上
  if (r.closed && !r.barred && eng.hotelShift.phase === 'shift' && (findChef(eng)?.ck?.mode !== 'barricade') && eng.hotelShift.tLeft < 25) { r.barred = true; lockDoors(eng) }
  if (r.closed && r.barred) lockDoors(eng)
}
/** 正门结构（窗口里）与侧门 */
function frontDoor(eng: Engine): Structure | null { const s = chefSite(eng); if (!s) return null; const p = W(eng, s.front); return eng.map!.structures.find((t) => t.kind === 'chefprop' && t.data?.prop === 'front' && t.x === p.x && t.y === p.y) ?? null }
function hallDoors(eng: Engine): Structure[] {
  const s = chefSite(eng); if (!s) return []
  const { ox, oy } = off(eng), h = s.hall
  return eng.map!.structures.filter((t) => t.kind === 'hoteldoor' && !t.data?.chefCold && ((t.x + ox === h.x0 - 1 || t.x + ox === h.x1 + 1) && t.y + oy >= h.y0 && t.y + oy <= h.y1 || (t.y + oy === h.y1 + 1 && t.x + ox >= h.x0 && t.x + ox <= h.x1)))
}
function lockDoors(eng: Engine) {
  const r = rt(eng), { ox, oy } = off(eng)
  const fd = frontDoor(eng)
  if (fd && !fd.data?.bar) { fd.data = { ...fd.data, bar: 1 }; fd.solid = true }
  for (const d of hallDoors(eng)) {
    const k = `${d.x + ox},${d.y + oy}`
    if (r.pried.has(k)) continue
    if (r.locked.has(k) && !d.data?.locked) { if (d.data?.chefLock) { r.pried.add(k); continue } }
    if (!d.data?.locked) { d.data = { ...d.data, locked: 1, open: 0, chefLock: 1 }; d.solid = true }
    r.locked.add(k)
  }
}
function unlockDoors(eng: Engine) {
  const r = rt(eng)
  const fd = frontDoor(eng); if (fd) { fd.data = { ...fd.data, bar: 0 }; fd.solid = false }
  for (const d of hallDoors(eng)) if (d.data?.chefLock) { const { chefLock: _c, ...rest } = d.data; void _c; d.data = { ...rest, locked: 0 } }
  r.locked.clear(); r.pried.clear()
}
/** 这座餐厅的冷库门（窗口里） */
function coldDoorS(eng: Engine): Structure | null { const s = chefSite(eng); if (!s) return null; const p = W(eng, s.coldDoor); return eng.map!.structures.find((t) => t.kind === 'hoteldoor' && t.data?.chefCold && t.x === p.x && t.y === p.y) ?? null }
export { coldDoorS as chefColdDoor }
/** 灶能不能用（锅在、灶没关没坏） */
export function chefCooking(eng: Engine) { const sv = chefSave(eng); return !sv.potStolen && sv.stoveT <= 0 }
/** 这一桌现在有没有一盘菜 */
export function plateReady(eng: Engine, wx: number, wy: number) { const r = rt(eng); return !r.closed && chefCooking(eng) && eng.time >= (r.plates.get(`${wx},${wy}`) ?? -1) }

// =====================================================================
// 世界步进（l5Hotel.updateHotel：任何层级都调 stepChefGlobal；L5 调 stepChefWorld）
// =====================================================================
export function stepChefGlobal(eng: Engine, dt: number) {
  const r = rt(eng), sv = chefSave(eng)
  if (r.subs.length) { r.subs[0].t -= dt; if (r.subs[0].t <= 0) r.subs.shift() }
  r.flashT = Math.max(0, r.flashT - dt); r.flashCd = Math.max(0, r.flashCd - dt); r.warmT = Math.max(0, r.warmT - dt)
  r.siteScan -= dt
  // 上瘾：饥饿加快（survival 读 chefHungerMul）+ 偶尔冒出念头
  if (sv.addictT > 0) {
    sv.addictT = Math.max(0, sv.addictT - dt)
    r.thoughtT -= dt
    if (r.thoughtT <= 0) {
      r.thoughtT = rnd(CK.thoughtEvery[0], CK.thoughtEvery[1])
      if (!(inL5(eng) && chefInHall(eng)) && !jazzSauceWarm(eng)) { const pool = sv.truth ? CRAVE_TRUE : CRAVE; chefSay(eng, pool[(Math.random() * pool.length) | 0], 'thought', 4.5) }
    }
  }
  if (sv.markT > 0 && sv.marked) { const e = findChef(eng); const seeing = e && e.ck && (e.ck.mode === 'stalk' || e.ck.mode === 'tap' || e.ck.mode === 'rage'); if (!seeing) { sv.markT -= dt; if (sv.markT <= 0) { sv.marked = 0; sv.markT = 0 } } }
  if (sv.stoveT > 0) { sv.stoveT = Math.max(0, sv.stoveT - dt); if (sv.stoveT === 0) { sv.stoveBroken = 0; if (inL5(eng) && chefInHall(eng)) eng.msg('后厨“嘭”的一声——燃气灶又点着了。', 'lore') } }
  for (const st of sv.stains) st.t -= dt
  if (sv.stains.some((s) => s.t <= 0)) sv.stains = sv.stains.filter((s) => s.t > 0)
}
export function stepChefWorld(eng: Engine, dt: number) {
  if (!inL5(eng)) return
  const r = rt(eng), sv = chefSave(eng), p = eng.player
  const site = chefSite(eng)
  // 换了一座餐厅（走到另一座附近）：原来那位收起来，等这一座的出现
  const key = site ? `${site.hk},${site.hr}` : ''
  if (key !== r.siteKey) { r.siteKey = key; const e0 = findChef(eng); if (e0 && !r.cuff && !r.drag) removeEnt(eng, e0) }
  stepSchedule(eng)
  // 黑屏 / 拖行 / 冷库
  if (r.ko > 0) r.ko = Math.max(0, r.ko - dt)
  if (r.drag) stepDrag(eng, dt)
  if (r.cuff) stepCuff(eng, dt)
  if (!site) { const e = findChef(eng); if (e && !r.cuff && !r.drag) removeEnt(eng, e); return }
  const cx = (site.hall.x0 + site.hall.x1 + 1) / 2, cy = (site.hall.y0 + site.hall.y1 + 1) / 2
  const pw = world(eng, p.x, p.y), d = Math.hypot(pw.x - cx, pw.y - cy)
  let e = findChef(eng)
  if (!e && d < CK.spawnR) e = spawnChef(eng)
  else if (e && d > CK.despawnR && !r.cuff && !r.drag && e.ck?.mode !== 'rage') { removeEnt(eng, e); e = null }
  // 吃饭
  if (r.eating) stepEat(eng, dt)
  // 关注度高、出现在餐厅
  if (eng.hotel.attn >= CK.attnMark && chefInHall(eng) && !sv.marked) chefMark(eng, 'attn')
  // 管家擦血迹
  for (const [maid, w] of r.wipes) { w.t -= dt; if (w.t <= 0) { r.wipes.delete(maid); wipeStain(eng, w.x, w.y) } }
  void dt
}

// =====================================================================
// 生成
// =====================================================================
export function spawnChef(eng: Engine, at?: Spot, mode: ChefMode = 'cook'): Entity | null {
  const m = eng.map, site = chefSite(eng); if (!m || !site) return null
  const old = findChef(eng); if (old) return old
  const p = at ?? WS(eng, site.at.stove)
  const e = makeEntity('chef', p.x, p.y, floorHeight(m, p.x, p.y))
  e.facing = p.f
  const s = ensureChef(e)
  s.pot = !chefSave(eng).potStolen
  if (mode !== 'cook') s.mode = mode
  if (chefSave(eng).stoveT > 0) setMode(s, 'guard', 'stoveLean', 0.4)
  m.entities.push(e)
  return e
}
function removeEnt(eng: Engine, e: Entity) { const m = eng.map; if (m) m.entities = m.entities.filter((x) => x !== e) }

// =====================================================================
// 被看见 = 盯上
// =====================================================================
export function chefMark(eng: Engine, why: keyof typeof MARK_LINE | string): boolean {
  const sv = chefSave(eng)
  const fresh = !sv.marked
  sv.marked = 1; sv.markT = CK.markMem
  if (fresh) { sv.n.mark++; meet(eng); rel(eng, -10); const line = MARK_LINE[why]; if (line) chefSay(eng, line, 'sys', 4.5, true); audio.hotelCreak?.(0.5) }
  const e = findChef(eng)
  if (e) { const s = ensureChef(e); if (s.mode === 'cook' || s.mode === 'walk' || s.mode === 'serve' || s.mode === 'bell' || s.mode === 'twitch' || s.mode === 'patrol' || s.mode === 'sniff' || s.mode === 'lean' || s.mode === 'vomit' || s.mode === 'pickup') startStalk(eng, e) }
  return fresh
}
/** 玩家在不在看他：视线中心与他胸口的夹角（考虑他的体宽），返回夹角 rad；看不见 = Infinity */
export function lookAngle(eng: Engine, e: Entity): number {
  const p = eng.player, dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy)
  if (d > CK.stareR + 6 || !eng.los(p.x, p.y, e.x, e.y)) return Infinity
  return Math.abs(wrap(Math.atan2(dy, dx) - p.facing))
}
const sees = (eng: Engine, e: Entity, r = 18) => { const p = eng.player; return Math.hypot(p.x - e.x, p.y - e.y) < r && eng.los(e.x, e.y, p.x, p.y) }

// =====================================================================
// 主更新（entityAI 分派）
// =====================================================================
/** 实机截图用：冻结 AI（姿态 / 片段时间停在拨好的值；渲染照常） */
export const CHEF_QA = { freeze: false }
export function updateChef(eng: Engine, e: Entity, dt: number) {
  const s = ensureChef(e), p = eng.player, r = rt(eng), sv = chefSave(eng)
  if (e.presentationPending || CHEF_QA.freeze) return
  s.modeT += dt; s.tapCd = Math.max(0, s.tapCd - dt); s.repath -= dt
  if (e.hp < e.def.hp) chefKillGuard(eng, e)
  e.state = 'idle'
  const site = chefSite(eng)
  if (!site) { if (!r.cuff && !r.drag) removeEnt(eng, e); return }
  s.pot = !sv.potStolen
  const d = Math.hypot(p.x - e.x, p.y - e.y)
  // —— 被看见：盯着他看 ——
  if (!sv.marked && !r.cuff && !r.drag) {
    const a = lookAngle(eng, e), cone = Math.max(CK.stareCone, Math.atan2(0.45, Math.max(0.5, d)))
    const eatingK = r.eating ? 0 : r.warmT > 0 ? 0.3 : 1
    if (a < cone && d < CK.stareR) r.stare += dt * eatingK
    else r.stare = Math.max(0, r.stare - CK.stareDecay * dt)
    if (r.stare >= CK.stareT) { r.stare = 0; sv.n.seen++; chefMark(eng, 'stare') }
    // 进厨房
    const z = chefZone(eng)
    const ez = chefZone(eng, e.x, e.y)
    if (z === 'kitchen' && (ez === 'kitchen' || r.closed) && sees(eng, e, 16)) chefMark(eng, r.closed ? 'night' : 'kitchen')
    else if (r.closed && (z === 'pantry' || z === 'cold') && sees(eng, e, 12)) chefMark(eng, 'night')
    else if (r.closed && z === 'dining' && sees(eng, e, CK.nightSee)) chefMark(eng, 'night')
    // 打烊后的后场整个是他的：看不见你也闻得到（CK.nightSniff 秒）
    if (r.closed && (z === 'kitchen' || z === 'pantry' || z === 'cold') && !sv.marked) { r.sniffT += dt; if (r.sniffT >= CK.nightSniff) { r.sniffT = 0; chefMark(eng, 'night') } } else r.sniffT = 0
  } else r.stare = 0
  // —— 清晰度 ——
  const clear = sv.marked && (s.mode === 'stalk' || s.mode === 'tap' || s.mode === 'lunge' || s.mode === 'swing' || s.mode === 'drag' || s.mode === 'knife' || s.mode === 'grab' || s.mode === 'guard' || s.mode === 'stun')
  s.vis = s.mode === 'rage' || s.mode === 'freeze' || s.mode === 'knife' || clear ? 1 : Math.min(CK.stareVis, (r.stare / CK.stareT) * CK.stareVis)
  // —— 转头看你 ——
  const want = d < 12 && (sv.marked || s.mode === 'bell') && eng.los(e.x, e.y, p.x, p.y) ? clamp(wrap(Math.atan2(p.y - e.y, p.x - e.x) - e.facing), -1.0, 1.0) : 0
  s.turn += (want - s.turn) * Math.min(1, dt * 4)
  switch (s.mode) {
    case 'cook': {
      e.state = 'idle'
      const st = WS(eng, site.at.stove)
      if (Math.hypot(e.x - st.x, e.y - st.y) > 0.3) { goTo(eng, e, st, 'cook'); break }
      e.x = st.x; e.y = st.y; e.facing = st.f
      if (s.clip !== 'idle' && s.clip !== 'vomitPot') setClip(s, 'idle', 0.4)
      if (sv.stoveT > 0) { setMode(s, 'guard', 'stoveLean', 0.4); break }
      if (r.closed) { if (!r.barred) goBarricade(eng, e); else { setMode(s, 'patrol', 'idle', 0.4); r.patrolT = rnd(CK.patrolEvery[0], CK.patrolEvery[1]) } break }
      // 锅丢在餐厅里：去捡回来
      if (sv.potStolen) { const it = potOnFloor(eng); if (it) { s.table = { x: it.x, y: it.y }; goTo(eng, e, { x: it.x, y: it.y - 0.6, f: Math.PI / 2 }, 'pickup'); break } }
      // 偶尔对着大锅吐（只在你离得远、在他身后时：远景背身）
      r.vomitT -= dt
      if (r.vomitT <= 0 && s.clip === 'idle') {
        r.vomitT = rnd(CK.vomitEvery[0], CK.vomitEvery[1])
        const back = Math.abs(wrap(Math.atan2(p.y - e.y, p.x - e.x) - e.facing)) > 2.0
        if (d >= CK.vomitMinD && back && !sv.potStolen) { setMode(s, 'vomit', 'vomitPot', 0.35); break }
      }
      // 给顾客上菜（营业中，偶尔）
      s.idleT += dt
      if (s.idleT > 26 && !r.closed && chefCooking(eng)) { s.idleT = 0; const t = serveTable(eng); if (t) { s.table = t.table; goTo(eng, e, t.spot, 'serve') } }
      break
    }
    case 'vomit':
      e.state = 'idle'
      if (s.modeT >= CHEF_CLIP_LEN.vomitPot) setMode(s, 'cook', 'idle', 0.4)
      break
    case 'walk': {
      e.state = 'wander'
      if (walkStep(eng, e, s, dt)) arrive(eng, e, s)
      break
    }
    case 'serve':
      e.state = 'idle'
      if (s.modeT >= CHEF_CLIP_LEN.serve) { if (s.table) { const w = world(eng, s.table.x, s.table.y); r.plates.set(`${Math.floor(w.x)},${Math.floor(w.y)}`, eng.time) } s.table = null; goHome(eng, e) }
      break
    case 'twitch': {
      e.state = 'idle'
      if (s.bellAt) { const want2 = Math.atan2(s.bellAt.y - e.y, s.bellAt.x - e.x); if (s.modeT > 0.7) e.facing += clamp(wrap(want2 - e.facing), -3 * dt, 3 * dt) }
      if (s.modeT >= CHEF_CLIP_LEN.earTwitch) {
        if (s.bellAt) goTo(eng, e, nearStand(eng, s.bellAt), 'bell', 'waddle', CK.nightSpeed)
        else goHome(eng, e)
      }
      break
    }
    case 'bell': {
      e.state = 'idle'
      if (s.bellAt) e.facing += clamp(wrap(Math.atan2(s.bellAt.y - e.y, s.bellAt.x - e.x) - e.facing), -2 * dt, 2 * dt)
      if (s.bellAt && Math.hypot(p.x - s.bellAt.x, p.y - s.bellAt.y) < CK.bellCatchR && sees(eng, e, 8)) { chefMark(eng, 'bell'); break }
      if (s.modeT >= CK.bellWait) { s.bellAt = null; goHome(eng, e) }
      break
    }
    case 'freeze':
      e.state = 'idle'
      if (s.modeT >= CHEF_CLIP_LEN.flashFreeze) { setMode(s, 'cook', 'idle'); chefMark(eng, 'photo') }
      break
    case 'stun':
      e.state = 'idle'
      if (s.modeT >= CK.stunT) { if (sv.potStolen && s.mode === 'stun') startRage(eng, e); else startStalk(eng, e) }
      break
    case 'stalk': stepStalk(eng, e, s, dt, d); break
    case 'tap': {
      e.state = 'idle'
      for (let i = s.taps; i < TAP_TIMES.length; i++) if (s.modeT >= TAP_TIMES[i]) { s.taps = i + 1; p.sanity = Math.max(0, p.sanity - CK.tapSan); sv.n.tap++; audio.hotelTap?.(0.7); eng.camShake = Math.max(eng.camShake, 0.06) }
      if (awayCheck(eng, e, d)) { startLunge(eng, e); break }
      if (s.modeT >= CHEF_CLIP_LEN.tapTable) { s.tapCd = CK.tapCd; setMode(s, 'stalk', 'humWalk'); s.speed = 0 }
      break
    }
    case 'lunge': {
      e.state = 'chase'
      const k = Math.min(1, (CK.lungeSpeed * dt) / Math.max(1e-3, d))
      if (d > 1.15 && s.modeT < 0.9) { tryMove(eng, e, e.x + (p.x - e.x) * k, e.y + (p.y - e.y) * k) }
      faceTo(e, p.x, p.y, dt, 12)
      if (d <= 1.15 || s.modeT >= 0.9) { if (s.pot) { setMode(s, 'swing', 'potSwing', 0.15); s.hitDone = false; sv.n.swing++ } else { setMode(s, 'grab', 'grabDrag', 0.15) } }
      break
    }
    case 'swing': {
      e.state = 'attack'
      if (s.modeT < CK.swingHit) faceTo(e, p.x, p.y, dt, 2.5)
      if (!s.hitDone && s.modeT >= CK.swingHit) {
        s.hitDone = true
        if (d <= CK.swingReach && eng.los(e.x, e.y, p.x, p.y) && !r.cuff && !r.drag) { audio.hit(); capture(eng, e, 'pot'); break }
        audio.hotelCreak?.(0.4) // 落空：锅砸在空气里
      }
      if (s.modeT >= CHEF_CLIP_LEN.potSwing) startStalk(eng, e)
      break
    }
    case 'grab': {
      e.state = 'attack'
      faceTo(e, p.x, p.y, dt, 6)
      if (d <= CK.grabR + 0.3 && !r.cuff && !r.drag) { capture(eng, e, 'grab'); break }
      if (s.modeT > 0.8) { if (sv.potStolen) startRage(eng, e); else startStalk(eng, e) }
      break
    }
    case 'rage': stepRage(eng, e, s, dt, d); break
    case 'drag': e.state = 'wander'; break // 由 stepDrag 驱动
    case 'knife': break // 由 stepCuff 驱动
    case 'barricade': {
      e.state = 'idle'
      const b = WS(eng, site.at.barricade); e.x = b.x; e.y = b.y; e.facing = b.f
      if (!r.barred && s.modeT >= BAR_BOLT) { r.barred = true; lockDoors(eng); if (chefInHall(eng)) eng.msg('正门那边传来“咔嗒”一声——门闩推上了。', 'lore') }
      if (s.modeT >= CHEF_CLIP_LEN.barricade) { if (!r.barred) { r.barred = true; lockDoors(eng) } goHome(eng, e, 'patrol') }
      break
    }
    case 'patrol': {
      e.state = 'idle'
      if (!r.closed) { setMode(s, 'cook', 'idle', 0.4); break }
      if (sv.potStolen) { const it = potOnFloor(eng); if (it) { goTo(eng, e, { x: it.x, y: it.y - 0.6, f: Math.PI / 2 }, 'pickup'); break } }
      r.patrolT -= dt
      if (r.patrolT <= 0) {
        r.patrolT = rnd(CK.patrolEvery[0], CK.patrolEvery[1])
        const pick = Math.random()
        if (pick < 0.3) goTo(eng, e, WS(eng, site.at.knife), 'lean')
        else if (pick < 0.55) goTo(eng, e, { ...W(eng, { x: site.bcx + 1, y: site.dining.y0 + (site.dining.y1 - site.dining.y0) * 0.5 }), f: Math.PI / 2 }, 'sniff', 'waddle', CK.nightSpeed)
        else if (pick < 0.75) goTo(eng, e, { ...W(eng, { x: site.pantryDoor.x + 1.5, y: site.pantryDoor.y + 0.5 }), f: Math.PI }, 'sniff')
        else setMode(s, 'lean', 'stoveLean', 0.4)
      } else if (s.clip !== 'idle' && s.clip !== 'stoveLean') setClip(s, 'idle', 0.4)
      break
    }
    case 'lean':
      e.state = 'idle'
      if (s.clip !== 'stoveLean') setClip(s, 'stoveLean', 0.4)
      if (s.modeT >= 8) goHome(eng, e, r.closed ? 'patrol' : 'cook')
      break
    case 'sniff':
      e.state = 'idle'
      if (s.clip !== 'sniffCrouch') setClip(s, 'sniffCrouch', 0.35)
      if (s.modeT >= CHEF_CLIP_LEN.sniffCrouch) goHome(eng, e, r.closed ? 'patrol' : 'cook')
      break
    case 'pickup': {
      e.state = 'idle'
      if (s.clip !== 'sniffCrouch') setClip(s, 'sniffCrouch', 0.35)
      if (!s.applied && s.modeT >= 3.0) { s.applied = true; const it = potOnFloor(eng); if (it) { const m = eng.map!; m.items = m.items.filter((x) => x !== it); sv.potStolen = 0; s.pot = true; if (chefInHall(eng)) eng.msg('他弯下腰，捡起了那口带把手的锅，用围裙擦了擦。', 'lore') } }
      if (s.modeT >= CHEF_CLIP_LEN.sniffCrouch) goHome(eng, e)
      break
    }
    case 'guard': {
      e.state = 'idle'
      const st = WS(eng, site.at.stove)
      if (Math.hypot(e.x - st.x, e.y - st.y) > 0.3) { goTo(eng, e, st, 'guard'); break }
      e.x = st.x; e.y = st.y
      if (s.clip !== 'stoveLean') setClip(s, 'stoveLean', 0.4)
      if (sv.stoveT <= 0) { setMode(s, 'cook', 'idle', 0.4); break }
      // 守着灶不出来：靠太近才动手
      if (d < CK.guardR && eng.los(e.x, e.y, p.x, p.y) && !r.cuff && !r.drag) { if (!sv.marked) chefMark(eng, 'kitchen'); startLunge(eng, e) }
      break
    }
    default: break
  }
}

// ---------- 走路 ----------
function goTo(eng: Engine, e: Entity, at: Spot, then: ChefMode, clip: ChefClipId = 'humWalk', speed = CK.stalkSpeed) {
  const s = ensureChef(e)
  const path = Math.hypot(at.x - e.x, at.y - e.y) < 0.05 ? [] : (eng.los(e.x, e.y, at.x, at.y) ? [{ x: at.x, y: at.y }] : bfs(eng, e.x, e.y, at.x, at.y))
  if (!path) { e.x = at.x; e.y = at.y; e.facing = at.f; s.at = at; s.then = then; arrive(eng, e, s); return }
  s.route = path; s.ri = 0; s.then = then; s.at = at; s.speed = speed; s.walkClip = clip
  setMode(s, 'walk', clip, 0.3)
}
function goHome(eng: Engine, e: Entity, then: ChefMode = 'cook') {
  const site = chefSite(eng); if (!site) return
  goTo(eng, e, WS(eng, site.at.stove), then)
}
function goBarricade(eng: Engine, e: Entity) {
  const site = chefSite(eng); if (!site) return
  const s = ensureChef(e)
  if (s.mode === 'stalk' || s.mode === 'tap' || s.mode === 'swing' || s.mode === 'lunge' || s.mode === 'rage' || s.mode === 'drag' || s.mode === 'knife' || s.mode === 'grab') return
  goTo(eng, e, WS(eng, site.at.barricade), 'barricade', 'waddle', CK.nightSpeed)
}
function walkStep(eng: Engine, e: Entity, s: ChefEntState, dt: number): boolean {
  let left = s.speed * dt
  while (left > 0 && s.ri < s.route.length) {
    const t = s.route[s.ri], dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy)
    if (d < 1e-3) { s.ri++; continue }
    e.facing += clamp(wrap(Math.atan2(dy, dx) - e.facing), -3 * dt, 3 * dt)
    if (left < d) { e.x += dx * (left / d); e.y += dy * (left / d); break }
    e.x = t.x; e.y = t.y; left -= d; s.ri++
  }
  void eng
  return s.ri >= s.route.length
}
function arrive(eng: Engine, e: Entity, s: ChefEntState) {
  if (s.at) { e.x = s.at.x; e.y = s.at.y; e.facing = s.at.f }
  switch (s.then) {
    case 'serve': setMode(s, 'serve', 'serve', 0.35); break
    case 'bell': setMode(s, 'bell', 'idle', 0.4); break
    case 'barricade': setMode(s, 'barricade', 'barricade', 0.3); break
    case 'lean': setMode(s, 'lean', 'stoveLean', 0.4); break
    case 'sniff': setMode(s, 'sniff', 'sniffCrouch', 0.35); break
    case 'pickup': setMode(s, 'pickup', 'sniffCrouch', 0.35); break
    case 'guard': setMode(s, 'guard', 'stoveLean', 0.4); break
    case 'patrol': setMode(s, 'patrol', 'idle', 0.4); rt(eng).patrolT = rnd(CK.patrolEvery[0], CK.patrolEvery[1]); break
    default: setMode(s, 'cook', 'idle', 0.4)
  }
}
function faceTo(e: Entity, x: number, y: number, dt: number, rate: number) { e.facing += clamp(wrap(Math.atan2(y - e.y, x - e.x) - e.facing), -rate * dt, rate * dt) }
function tryMove(eng: Engine, e: Entity, nx: number, ny: number) { if (canOccupy(eng.map!, nx, ny, 0.34, { z: e.z ?? 0 })) { e.x = nx; e.y = ny } else if (canOccupy(eng.map!, nx, e.y, 0.34, { z: e.z ?? 0 })) e.x = nx; else if (canOccupy(eng.map!, e.x, ny, 0.34, { z: e.z ?? 0 })) e.y = ny }
function nearStand(eng: Engine, at: { x: number; y: number }): Spot {
  const site = chefSite(eng)
  if (site) { const bs = WS(eng, site.at.bellStand); if (Math.hypot(bs.x - at.x, bs.y - at.y) < 2) return bs }
  // 闪光的地方：停在 1.2 m 外面朝那里
  const e0 = findChef(eng)
  const a = e0 ? Math.atan2(at.y - e0.y, at.x - e0.x) : 0
  return { x: at.x - Math.cos(a) * 1.2, y: at.y - Math.sin(a) * 1.2, f: a }
}
/** 瓦片 BFS（8 邻接、不切墙角；只挡墙和实心结构）→ 折线（窗口坐标，拉直） */
export function bfs(eng: Engine, x0: number, y0: number, x1: number, y1: number, maxN = 30000): { x: number; y: number }[] | null {
  const m = eng.map!; const Wd = m.w
  const solid = new Set<number>()
  for (const s of m.structures) if (s.solid && Math.abs(s.x - x0) < 60 && Math.abs(s.y - y0) < 60) for (let y = s.y; y < s.y + (s.h || 1); y++) for (let x = s.x; x < s.x + (s.w || 1); x++) solid.add(y * Wd + x)
  const sx = Math.floor(x0), sy = Math.floor(y0), tx = Math.floor(x1), ty = Math.floor(y1)
  const ok = (x: number, y: number) => x >= 1 && y >= 1 && x < m.w - 1 && y < m.h - 1 && m.tiles[y * Wd + x] === 1 && !solid.has(y * Wd + x)
  const prev = new Map<number, number>()
  const q: number[] = []
  const s0 = sy * Wd + sx, goal = ty * Wd + tx
  prev.set(s0, s0); q.push(s0)
  let h = 0, found = s0 === goal
  while (h < q.length && !found && h < maxN) {
    const c = q[h++], cx = c % Wd, cy = (c - cx) / Wd
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = cx + dx, ny = cy + dy, ni = ny * Wd + nx
      if (prev.has(ni)) continue
      if (ni !== goal && !ok(nx, ny)) continue
      if (dx && dy && (!ok(cx + dx, cy) || !ok(cx, cy + dy))) continue
      prev.set(ni, c); q.push(ni)
      if (ni === goal) { found = true; break }
    }
  }
  if (!found) return null
  const pts: { x: number; y: number }[] = []
  for (let c = goal; c !== s0; c = prev.get(c)!) pts.push({ x: (c % Wd) + 0.5, y: Math.floor(c / Wd) + 0.5 })
  pts.reverse()
  if (pts.length) pts[pts.length - 1] = { x: x1, y: y1 }; else pts.push({ x: x1, y: y1 })
  const out: { x: number; y: number }[] = []
  let cur = { x: x0, y: y0 }, i = 0
  while (i < pts.length) { let j = pts.length - 1; while (j > i && !eng.los(cur.x, cur.y, pts[j].x, pts[j].y)) j--; out.push(pts[j]); cur = pts[j]; i = j + 1 }
  return out
}

// ---------- 盯上 / 靠近 / 敲桌 / 背身抡锅 ----------
function startStalk(eng: Engine, e: Entity) {
  const s = ensureChef(e), r = rt(eng)
  if (chefSave(eng).potStolen) { startRage(eng, e); return }
  setMode(s, 'stalk', r.closed ? 'waddle' : 'humWalk', 0.3); s.lostT = 0; s.repath = 0; s.route = []; s.ri = 0; s.table = null
}
function startLunge(eng: Engine, e: Entity) { const s = ensureChef(e); setMode(s, 'lunge', 'waddle', 0.15); void eng }
function startRage(eng: Engine, e: Entity) { const s = ensureChef(e); setMode(s, 'rage', 'waddle', 0.2); s.lostT = 0; s.repath = 0; s.route = []; s.ri = 0; void eng }
/** 你背对他 / 看向出口 */
export function awayCheck(eng: Engine, e: Entity, d: number): boolean {
  if (d > CK.swingR || rt(eng).cuff || rt(eng).drag) return false
  const p = eng.player
  const toChef = Math.atan2(e.y - p.y, e.x - p.x)
  if (Math.abs(wrap(p.facing - toChef)) > CK.awayAngle) return true
  // 看向出口：视线中心对着 6 m 内的一扇餐厅门 / 正门
  for (const ex of exitsNear(eng)) { const dd = Math.hypot(ex.x - p.x, ex.y - p.y); if (dd > CK.exitR) continue; if (Math.abs(wrap(Math.atan2(ex.y - p.y, ex.x - p.x) - p.facing)) < CK.exitCone && Math.abs(wrap(Math.atan2(ex.y - p.y, ex.x - p.x) - toChef)) > 0.6) return true }
  return false
}
function exitsNear(eng: Engine): { x: number; y: number }[] {
  const out = hallDoors(eng).map((d) => ({ x: d.x + 0.5, y: d.y + 0.5 }))
  const site = chefSite(eng); if (site) { const f = W(eng, site.front); out.push({ x: f.x + 1, y: f.y + 0.5 }) }
  return out
}
function stepStalk(eng: Engine, e: Entity, s: ChefEntState, dt: number, d: number) {
  const p = eng.player, r = rt(eng), sv = chefSave(eng)
  e.state = 'chase'
  if (r.cuff || r.drag) { goHome(eng, e); return }
  const see = eng.los(e.x, e.y, p.x, p.y)
  // 出了餐厅就不追了（他不离开餐厅）；你还在餐厅里，他就知道你在哪（隔着墙也慢慢走过来）
  if (!chefInHall(eng) && d > 4) s.lostT += dt * 2
  else if (!chefInHall(eng) && (!see || d > CK.forgetR)) s.lostT += dt
  else s.lostT = 0
  if (s.lostT > CK.forgetT || (!chefInHall(eng) && s.lostT > 6)) { goHome(eng, e); return }
  if (awayCheck(eng, e, d)) { startLunge(eng, e); return }
  // 目标：你在桌边 → 绕到桌子对面敲桌；否则停在你面前 standOff
  const tb = nearTable(eng, p.x, p.y)
  let goal: Spot | null = null
  if (tb && s.tapCd <= 0) {
    const spots = tapSpots(world(eng, tb.x, tb.y) as { x: number; y: number }).map((q) => WS(eng, q)).filter((q) => walkableAt(eng, q.x, q.y))
    spots.sort((a, b) => Math.hypot(b.x - p.x, b.y - p.y) - Math.hypot(a.x - p.x, a.y - p.y))
    if (spots.length) goal = spots[0]
  }
  const far = d > CK.stalkNear && !goal
  const speed = r.closed ? CK.nightSpeed : far ? CK.stalkFar : CK.stalkSpeed
  const clip: ChefClipId = r.closed || far ? 'waddle' : 'humWalk'
  if (s.clip !== clip) setClip(s, clip, 0.3)
  s.speed = speed
  if (goal) {
    if (Math.hypot(goal.x - e.x, goal.y - e.y) < 0.12) { e.x = goal.x; e.y = goal.y; e.facing = goal.f; s.table = tb; s.taps = 0; setMode(s, 'tap', 'tapTable', 0.3); return }
    followPath(eng, e, s, goal, dt)
    return
  }
  if (d > CK.standOff) followPath(eng, e, s, { x: p.x, y: p.y, f: 0 }, dt, CK.standOff)
  else { faceTo(e, p.x, p.y, dt, 3); s.speed = 0 }
  void sv
}
function followPath(eng: Engine, e: Entity, s: ChefEntState, goal: Spot, dt: number, stopAt = 0) {
  if (s.repath <= 0 || !s.route.length) {
    s.repath = 0.8
    s.route = eng.los(e.x, e.y, goal.x, goal.y) ? [{ x: goal.x, y: goal.y }] : (bfs(eng, e.x, e.y, goal.x, goal.y) ?? [])
    s.ri = 0
  }
  const last = s.route[s.route.length - 1]
  if (stopAt > 0 && last && Math.hypot(last.x - e.x, last.y - e.y) <= stopAt && s.ri >= s.route.length - 1) { faceTo(e, goal.x, goal.y, dt, 3); return }
  const before = { x: e.x, y: e.y }
  walkStep(eng, e, s, dt)
  if (stopAt > 0 && Math.hypot(goal.x - e.x, goal.y - e.y) < stopAt) { e.x = before.x; e.y = before.y }
}
function walkableAt(eng: Engine, x: number, y: number) { const m = eng.map!; return x > 1 && y > 1 && x < m.w - 1 && y < m.h - 1 && canOccupy(m, x, y, 0.3, { z: 0 }) }
/** 你身边 CK.tapR 内最近的一张餐桌（窗口格） */
function nearTable(eng: Engine, x: number, y: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null, bd = CK.tapR + 0.65
  for (const t of eng.map!.structures) if (t.kind === 'chefprop' && t.data?.prop === 'table') { const dd = Math.hypot(t.x + 0.5 - x, t.y + 0.5 - y); if (dd < bd) { bd = dd; best = { x: t.x, y: t.y } } }
  return best
}
function serveTable(eng: Engine): { table: { x: number; y: number }; spot: Spot } | null {
  const tabs = eng.map!.structures.filter((t) => t.kind === 'chefprop' && t.data?.prop === 'table' && Number(t.data?.diners) > 0)
  if (!tabs.length) return null
  const t = tabs[(Math.random() * tabs.length) | 0]
  const w = world(eng, t.x, t.y)
  const sp = tapSpots({ x: w.x, y: w.y }).map((q) => WS(eng, q)).filter((q) => walkableAt(eng, q.x, q.y))
  return sp.length ? { table: { x: t.x, y: t.y }, spot: sp[0] } : null
}
function stepRage(eng: Engine, e: Entity, s: ChefEntState, dt: number, d: number) {
  const p = eng.player, r = rt(eng), sv = chefSave(eng)
  e.state = 'chase'
  if (r.cuff || r.drag) { goHome(eng, e); return }
  if (!sv.potStolen) { startStalk(eng, e); return }
  const see = eng.los(e.x, e.y, p.x, p.y)
  if (!see || d > CK.forgetR) s.lostT += dt; else s.lostT = 0
  if (s.lostT > CK.rageT) { goHome(eng, e); if (chefInHall(eng)) eng.msg('后厨传来一声闷响，像是有人一拳砸在了灶台上。', 'lore'); return }
  if (s.clip !== 'waddle') setClip(s, 'waddle', 0.2)
  s.speed = CK.rageSpeed
  if (d <= CK.grabR) { setMode(s, 'grab', 'grabDrag', 0.15); return }
  followPath(eng, e, s, { x: p.x, y: p.y, f: 0 }, dt)
}

// ---------- 被抓：黑屏 → 拖走 → 冷库 ----------
export function capture(eng: Engine, e: Entity | null, how: 'pot' | 'grab' | 'beast'): boolean {
  const r = rt(eng), sv = chefSave(eng), p = eng.player, site = chefSite(eng)
  if (!site || r.cuff || r.drag) return false
  sv.n.caught++
  if (how === 'pot') { p.hp = Math.max(1, p.hp - CK.swingDmg); eng.camShake = Math.max(eng.camShake, 0.9); eng.emit({ kind: 'damage' }) }
  r.eating = null
  // 锅：抓到人就拿回来
  if (sv.potStolen && take(eng, 'chefpot')) { sv.potStolen = 0; if (e) ensureChef(e).pot = true }
  // 血迹（餐厅地毯上）
  addStain(eng, p.x, p.y)
  if (how === 'beast') { r.ko = CK.koT + 0.6; toCold(eng); return true }
  r.ko = CK.koT + CK.dragShow + 0.4
  if (e) { const s = ensureChef(e); setMode(s, 'drag', 'grabDrag', 0.2); const sw = W(eng, site.at.swingIn); s.route = bfs(eng, e.x, e.y, sw.x, sw.y) ?? []; s.ri = 0; s.speed = CHEF_CLIP_SPEED.grabDrag! }
  r.drag = { t: 0 }
  eng.msg(how === 'pot' ? '锅底砸在你的太阳穴上。世界一下子歪了。' : '一只又肥又热的手攥住了你的后领。', 'damage')
  return true
}
function stepDrag(eng: Engine, dt: number) {
  const r = rt(eng), D = r.drag!, e = findChef(eng)
  D.t += dt
  if (e && e.ck) { walkStep(eng, e, e.ck, dt) }
  if (D.t >= CK.koT + CK.dragShow) { r.drag = null; toCold(eng) }
}
/** 醒在冷库：铐在铁管上；他回灶前，冷库门关上 */
function toCold(eng: Engine) {
  const r = rt(eng), site = chefSite(eng), p = eng.player
  if (!site) return
  const c = WS(eng, site.at.cuff)
  p.x = c.x; p.y = c.y; p.facing = c.f; look.yaw = -c.f - Math.PI / 2
  r.cuff = { t: 0, temp: 100, yank: 0, keyT: 0, early: 0, phase: 'cuffed', marks: 0 }
  const cd = coldDoorS(eng)
  if (cd) { cd.data = { ...cd.data, open: 0 }; cd.solid = true }
  const e = findChef(eng)
  if (e) { const st = WS(eng, site.at.stove); e.x = st.x; e.y = st.y; e.facing = st.f; const s = ensureChef(e); s.knife = false; setMode(s, 'cook', 'idle', 0.4) }
  chefSay(eng, '冷。刺骨的冷。你的手腕被铐在一根结霜的铁管上。', 'sys', 5, true)
  eng.msg('你在冷库里醒来。手铐另一头锁在墙上的铁管上。门外，有人在哼小调。', 'lore')
}
/** 冷库：体温 / 时限 / 脱身 / 超时取刀 */
function stepCuff(eng: Engine, dt: number) {
  const r = rt(eng), C = r.cuff!, p = eng.player, sv = chefSave(eng), site = chefSite(eng)
  if (!site) { r.cuff = null; return }
  C.t += dt
  const c = WS(eng, site.at.cuff)
  if (C.phase === 'cuffed') { p.x = c.x; p.y = c.y }
  C.temp = Math.max(0, C.temp - CK.coldRate * dt * (jazzSauceWarm(eng) ? JAZZ_LINK.sauceCold : 1)) // [jazz] 辣椒酱暖身：体温掉得慢
  if (C.temp < CK.coldHurt && !eng.dev?.god) { p.hp -= CK.coldHp * dt; if (p.hp <= 0) { r.cuff = null; sv.n.died++; eng.die('冻死在了厨师的冷库里'); return } }
  C.yank = Math.max(0, C.yank - CK.yankDecay * dt)
  const limit = CK.coldLimit - C.early
  if (C.phase === 'cuffed' && C.t >= limit) {
    C.phase = 'knife'; C.t = 0
    chefSay(eng, '门外传来一声轻响：刀，从磁条上取了下来。', 'sys', CK.knifeLine, true)
    audio.hotelClick?.(0.6)
    const e = findChef(eng) ?? spawnChef(eng)
    if (e) { const s = ensureChef(e), k = WS(eng, site.at.knife); e.x = k.x; e.y = k.y; e.facing = k.f; setMode(s, 'knife', 'takeKnife', 0.3) }
  }
  if (C.phase === 'knife') {
    const e = findChef(eng); if (!e) return
    const s = ensureChef(e)
    if (s.clip === 'takeKnife' && s.modeT >= KNIFE_TAKE) s.knife = true
    if (s.clip === 'takeKnife' && s.modeT >= CHEF_CLIP_LEN.takeKnife) {
      C.phase = 'enter'; C.t = 0
      const ci = WS(eng, site.at.coldIn); e.x = ci.x; e.y = ci.y; e.facing = Math.atan2(p.y - ci.y, p.x - ci.x)
      const cd = coldDoorS(eng)
      if (cd) { cd.data = { ...cd.data, open: 1 }; cd.solid = false }
      setMode(s, 'knife', 'waddle', 0.3); s.knife = true
      audio.hotelCreak?.(0.8)
      chefSay(eng, '冷库门开了。他手里拿着那把雕刻刀，刀刃上还亮着口水。', 'sys', 4, true)
    }
  }
  if (C.phase === 'enter') {
    const e = findChef(eng); if (!e) return
    const s = ensureChef(e), d = Math.hypot(p.x - e.x, p.y - e.y)
    s.knife = true
    if (d > CK.killR) { const k = Math.min(1, (CK.knifeWalkSpeed * dt) / d); e.x += (p.x - e.x) * k; e.y += (p.y - e.y) * k; e.facing = Math.atan2(p.y - e.y, p.x - e.x) }
    else if (!r.killT) {
      // 遮挡：黑屏、冷库门「砰」地关上 + 声音——不演出来
      r.killT = 1; r.ko = 99
      const cd = coldDoorS(eng)
      if (cd) { cd.data = { ...cd.data, open: 0 }; cd.solid = true }
      audio.hit(); audio.hotelCreak?.(1)
      chefSay(eng, '冷库门在你们身后“砰”地合上了。', 'sys', 3, true)
      sv.victims++; sv.n.died++
      r.cuff = null
      if (!eng.dev?.god) eng.die('成了厨师今晚的炖菜')
      else { r.ko = 0; r.killT = 0 }
    }
  }
}
/** 扯管子（连按）。返回进度 0..1 */
export function chefYank(eng: Engine, n = 1): number {
  const r = rt(eng), C = r.cuff, sv = chefSave(eng)
  if (!C || C.phase !== 'cuffed') return 0
  for (let i = 0; i < n; i++) {
    C.yank = Math.min(CK.yankNeed, C.yank + CK.yankPer)
    const q = Math.floor((C.yank / CK.yankNeed) * 4)
    if (q > C.marks && q < 4) { C.marks = q; C.early += CK.yankEarly; audio.hit(); chefSay(eng, '铁管“哐”地响了一声。门外的哼歌停了一下。', 'sys', 2.5) }
    if (C.yank >= CK.yankNeed) { freeCuff(eng, 'yank'); sv.n.escYank++; break }
  }
  return C.yank / CK.yankNeed
}
/** 开铐（钥匙 / 撬棍按住 CK.keyHold 秒） */
export function chefUnlock(eng: Engine, dt: number): number {
  const r = rt(eng), C = r.cuff, sv = chefSave(eng)
  if (!C || C.phase !== 'cuffed' || !cuffTool(eng)) return 0
  C.keyT += dt
  if (C.keyT >= CK.keyHold) { const tool = cuffTool(eng)!; freeCuff(eng, tool); sv.n.escKey++; return 1 }
  return C.keyT / CK.keyHold
}
export function cuffTool(eng: Engine): 'skeleton' | 'crowbar' | null { return hasT(eng, 'skeleton') ? 'skeleton' : hasT(eng, 'crowbar') ? 'crowbar' : null }
function freeCuff(eng: Engine, how: string) {
  const r = rt(eng)
  r.cuff = null
  if (how === 'crowbar') { audio.hit(); eng.noiseEvent?.(eng.player.x, eng.player.y, 10, false); chefSay(eng, '撬棍别进手铐的链环，“嘣”的一声，开了。', 'sys', 3.5, true) }
  else if (how === 'skeleton') { audio.pickup(); chefSay(eng, '黄铜万能钥匙插进手铐的锁眼——居然转得动。', 'sys', 3.5, true) }
  else chefSay(eng, '铁管的卡箍崩开了。你连着手铐把它从墙上扯了下来。', 'sys', 3.5, true)
  eng.msg('你自由了。冷库门没有从外面锁上。', 'lore')
}
/** movement 钩子：黑屏 / 拖行 / 被铐时接管玩家 */
export function chefControlsPlayer(eng: Engine, dt = 1 / 60): boolean {
  const r = RT.get(eng); if (!r || eng.levelDef.id !== 5) return false
  if (r.drag) {
    const e = findChef(eng), p = eng.player
    if (e) { const g = chefFromRoot(e, -0.37, -0.75); if (canOccupy(eng.map!, g.x, g.y, PLAYER_RADIUS * 0.5, { z: p.z })) { p.x = g.x; p.y = g.y } }
    p.vz = 0; p.crouching = true; resetMoveVelocity(eng.mv); return true
  }
  if (r.cuff) {
    const p = eng.player; p.vz = 0; p.crouching = true
    if (r.cuff.phase === 'cuffed') {
      // 连按：攻击 / 交互 / 跳 / X 的上升沿都算扯一下
      const k = { a: !!eng.input.attack, i: !!eng.input.interact, j: !!eng.input.jump }
      const prev = (r as ChefRt & { keys?: typeof k }).keys
      if (!cuffTool(eng)) for (const n of ['a', 'i', 'j'] as const) if (k[n] && !prev?.[n]) chefYank(eng)
      ;(r as ChefRt & { keys?: typeof k }).keys = k
      if (eng.specialHeld && cuffTool(eng)) chefUnlock(eng, dt)
    }
    resetMoveVelocity(eng.mv); return true
  }
  if (r.ko > 0) { resetMoveVelocity(eng.mv); return true }
  return false
}

// =====================================================================
// 交互（X）：吃 / 端详 / 摇铃 / 偷锅 / 关灶 / 砸灶 / 开铐 / 扯管子
// =====================================================================
type ChefAct = { act: 'eat' | 'inspect'; table: Structure; dish: number } | { act: 'bell' } | { act: 'steal' } | { act: 'stove' } | { act: 'break' } | { act: 'unlock' } | { act: 'yank' }
function heldMelee(eng: Engine): string | null { const p = eng.player, sl = p.hotbar[p.selected]; if (!sl) return null; const d = ITEMS[sl.type]; return d?.weapon ? sl.type : null }
export function chefAct(eng: Engine): ChefAct | null {
  if (!inL5(eng)) return null
  const r = rt(eng), sv = chefSave(eng), p = eng.player, site = chefSite(eng)
  if (r.cuff?.phase === 'cuffed') return cuffTool(eng) ? { act: 'unlock' } : { act: 'yank' }
  if (!site || r.drag || r.ko > 0) return null
  const pw = world(eng, p.x, p.y)
  // 服务铃
  if (Math.hypot(pw.x - site.at.bellAt.x, pw.y - site.at.bellAt.y) < CK.bellR) return { act: 'bell' }
  // 灶：偷锅 / 关灶 / 砸灶
  if (Math.hypot(pw.x - site.at.hook.x, pw.y - (site.at.hook.y + 0.9)) < CK.hookR + 0.3) {
    if (heldMelee(eng) && !sv.stoveBroken) return { act: 'break' }
    if (!sv.potStolen) return { act: 'steal' }
    if (sv.stoveT <= 0) return { act: 'stove' }
  }
  if (Math.hypot(pw.x - (site.stove.x + 1), pw.y - (site.stove.y + 1.3)) < CK.hookR && sv.stoveT <= 0) return heldMelee(eng) ? { act: 'break' } : { act: 'stove' }
  // 餐桌
  let best: Structure | null = null, bd = CK.eatR + 0.65
  for (const t of eng.map!.structures) if (t.kind === 'chefprop' && t.data?.prop === 'table') { const dd = Math.hypot(t.x + 0.5 - p.x, t.y + 0.5 - p.y); if (dd < bd) { bd = dd; best = t } }
  if (best) { const w = world(eng, best.x, best.y); if (plateReady(eng, w.x, w.y)) { const dish = Number(best.data?.dish ?? 0) % 3; return !sv.truth && p.sanity >= CK.truthSan ? { act: 'inspect', table: best, dish } : { act: 'eat', table: best, dish } } }
  return null
}
export function chefSpecial(eng: Engine): SpecialAction | null {
  const a = chefAct(eng); if (!a) return null
  const sv = chefSave(eng), r = rt(eng)
  switch (a.act) {
    case 'eat': { const F = CK.food[a.dish]; return { id: 'chef-eat', label: r.eating ? `正在吃${F.name}……` : `吃一份${F.name}`, hint: sv.truth ? F.truth : F.look, hold: false } }
    case 'inspect': { const F = CK.food[a.dish]; return { id: 'chef-inspect', label: `端详这份${F.name}`, hint: '你现在很清醒。清醒得能看清楚盘子里的东西。', hold: false } }
    case 'bell': return { id: 'chef-bell', label: '摇服务铃', hint: '叮——后厨的人会出来应单（摇太多次，他会记住是谁）', hold: false }
    case 'steal': return { id: 'chef-steal', label: '偷走带把手的锅', hint: '后厨唯一一口带把手的锅。没有它，他做不了饭，也没有武器', hold: false }
    case 'stove': return { id: 'chef-stove', label: '关掉燃气灶', hint: '最后一台燃气灶。关了它，后厨就停产了——他会守着它', hold: false }
    case 'break': return { id: 'chef-break', label: '砸坏燃气灶', hint: `用${itemName(heldMelee(eng) ?? 'crowbar')}砸烂旋钮和燃气管（很响）`, hold: false }
    case 'unlock': return { id: 'chef-unlock', label: cuffTool(eng) === 'skeleton' ? '用万能钥匙开手铐' : '用撬棍撬开手铐', hint: `按住 ${CK.keyHold} 秒`, hold: true }
    case 'yank': return { id: 'chef-yank', label: '扯铁管', hint: '连按！铁管会响——他会提前回来', hold: false }
  }
}
export function chefPress(eng: Engine): boolean {
  if (!eng.specialPressed) return false
  const a = chefAct(eng); if (!a) return false
  if (a.act === 'unlock') return false // 按住，由 chefControlsPlayer 推进
  eng.specialPressed = false
  switch (a.act) {
    case 'eat': return chefStartEat(eng, a.table)
    case 'inspect': return chefInspect(eng, a.dish)
    case 'bell': return chefRingBell(eng)
    case 'steal': return chefStealPot(eng)
    case 'stove': return chefStoveOff(eng, false)
    case 'break': return chefStoveOff(eng, true)
    case 'yank': chefYank(eng); return true
  }
  return false
}
// —— 食物 ——
export function chefStartEat(eng: Engine, t: Structure): boolean {
  const r = rt(eng); if (r.eating) return false
  const w = world(eng, t.x, t.y)
  if (!plateReady(eng, w.x, w.y)) return false
  r.eating = { key: `${w.x},${w.y}`, t: 0, dish: Number(t.data?.dish ?? 0) % 3 }
  audio.uiTick()
  return true
}
function stepEat(eng: Engine, dt: number) {
  const r = rt(eng), E = r.eating!, sv = chefSave(eng), p = eng.player
  const [wx, wy] = E.key.split(',').map(Number)
  const t = W(eng, { x: wx + 0.5, y: wy + 0.5 })
  if (Math.hypot(t.x - p.x, t.y - p.y) > CK.eatR + 0.9 || r.closed) { r.eating = null; return }
  E.t += dt; r.warmT = CK.warmT
  if (E.t < CK.eatT) return
  r.eating = null
  const F = CK.food[E.dish]
  p.hunger = Math.min(100, p.hunger + F.hunger); p.hp = Math.min(100, p.hp + F.hp); p.thirst = Math.min(100, p.thirst + F.thirst)
  sv.eat++; sv.n.meal++
  sv.addictT = Math.min(CK.addictMax, sv.addictT + CK.addictT)
  r.thoughtT = Math.min(r.thoughtT, 30)
  r.plates.set(E.key, eng.time + CK.refill * (jazzLive(eng) ? JAZZ_LINK.liveRefill : 1)) // [jazz] 演出时段营业：上菜更快
  if (sv.truth) { p.sanity = Math.max(0, p.sanity - CK.truthSanHit); chefSay(eng, `你知道这是什么。你还是把${F.name}吃完了。`, 'thought', 4) }
  else { p.sanity = Math.min(100, p.sanity + CK.eatSan); chefSay(eng, `${F.name}香得过分。你吃得一点不剩。……再来一份也没关系吧。`, 'thought', 4) }
  meet(eng)
}
export function chefInspect(eng: Engine, dish: number): boolean {
  const sv = chefSave(eng), F = CK.food[dish]
  if (!sv.truth) { sv.truth = 1; eng.player.sanity = Math.max(0, eng.player.sanity - 5) }
  chefSay(eng, F.truth, 'sys', 5, true)
  eng.msg(`你看清了盘子里的东西。${F.truth}`, 'lore')
  return true
}
/** 饥饿速度倍率（survival.ts 读）：上瘾期间饿得更快 */
export function chefHungerMul(eng: Engine): number { const sv = (eng.hotel as { chef?: ChefSave } | undefined)?.chef; return sv && sv.addictT > 0 && !jazzSauceWarm(eng) ? 1 + CK.addictK : 1 } // [jazz] 哈瓦那辣椒酱压住上瘾的饥饿
// —— 服务铃 ——
export function chefRingBell(eng: Engine): boolean {
  const r = rt(eng), sv = chefSave(eng), site = chefSite(eng)
  if (!site) return false
  sv.n.bell++
  audio.hotelBell(0.7)
  r.bells = r.bells.filter((t) => eng.time - t < CK.bellWin); r.bells.push(eng.time)
  if (r.bells.length >= CK.bellSpam) { chefMark(eng, 'bell'); return true }
  const e = findChef(eng)
  if (e) {
    const s = ensureChef(e)
    if (s.mode === 'cook' || s.mode === 'walk' || s.mode === 'serve' || s.mode === 'patrol' || s.mode === 'lean' || s.mode === 'sniff' || s.mode === 'vomit' || s.mode === 'bell') { s.bellAt = W(eng, site.at.bellAt); setMode(s, 'twitch', 'earTwitch', 0.15) }
  }
  return true
}
// —— 偷锅 ——
export function chefStealPot(eng: Engine): boolean {
  const sv = chefSave(eng)
  if (sv.potStolen) return false
  if (!eng.addItem('chefpot')) { eng.msg('背包满了，拿不下那口锅。', 'system'); return false }
  sv.potStolen = 1; sv.n.pot++
  audio.pickup()
  eng.msg('你从钩子上摘下了那口带把手的锅。很沉，锅底有一圈洗不掉的暗色。', 'loot')
  const e = findChef(eng)
  if (e) { const s = ensureChef(e); s.pot = false; if (sees(eng, e, 16)) { chefMark(eng, 'kitchen'); startRage(eng, e); chefSay(eng, '他看见了。他的耳朵贴着头皮压了下去。', 'sys', 3.5, true) } }
  return true
}
/** 地上那口锅（在这座餐厅里） */
function potOnFloor(eng: Engine) { return eng.map!.items.find((it) => it.type === 'chefpot' && chefInHall(eng, it.x, it.y)) ?? null }
// —— 关灶 / 砸灶 ——
export function chefStoveOff(eng: Engine, smash: boolean): boolean {
  const sv = chefSave(eng)
  if (smash) { if (sv.stoveBroken) return false; sv.stoveBroken = 1; sv.stoveT = CK.stoveBrokenT; audio.hit(); eng.noiseEvent?.(eng.player.x, eng.player.y, 14, true); eng.msg('你砸烂了旋钮，扯断了燃气管。最后一台燃气灶熄了，嘶嘶的漏气声慢慢停了。', 'system') }
  else { if (sv.stoveT > 0) return false; sv.stoveT = CK.stoveOffT; audio.hotelClick?.(0.6); eng.msg('你拧上了燃气阀。蓝色的火苗缩了一下，灭了。炖锅不再冒泡。', 'system') }
  sv.n.stove++
  const e = findChef(eng)
  if (e) { const s = ensureChef(e); if (smash && sees(eng, e, 16)) chefMark(eng, 'kitchen'); if (s.mode !== 'stalk' && s.mode !== 'rage' && s.mode !== 'drag' && s.mode !== 'knife') goTo(eng, e, WS(eng, chefSite(eng)!.at.stove), 'guard', 'waddle', CK.nightSpeed) }
  return true
}
// —— 相机 / 遗物（inventory.finishUseSlot 先问这里）——
export function chefUseItem(eng: Engine, type: string): boolean {
  const sv = chefSave(eng), r = rt(eng)
  if (type === 'megcamera') {
    if (r.flashCd > 0) { eng.msg('闪光灯还在充电，嗡嗡作响。', 'system'); return true }
    r.flashCd = CK.flashCd; r.flashT = 0.35; sv.n.photo++
    audio.hotelClick?.(0.9)
    const e = findChef(eng)
    if (e && inL5(eng)) {
      const p = eng.player, d = Math.hypot(e.x - p.x, e.y - p.y), a = Math.abs(wrap(Math.atan2(e.y - p.y, e.x - p.x) - p.facing))
      const s = ensureChef(e)
      if (d < CK.photoR && a < CK.photoCone && eng.los(p.x, p.y, e.x, e.y)) { setMode(s, 'freeze', 'flashFreeze', 0.08); eng.msg('咔嚓。闪光灯照亮了灶台边的那团影子——一顶高高的厨师帽，一张灰黑的猪脸。', 'lore'); return true }
      if (chefInHall(eng) && (s.mode === 'cook' || s.mode === 'patrol' || s.mode === 'lean' || s.mode === 'walk' || s.mode === 'serve')) { s.bellAt = { x: p.x, y: p.y }; setMode(s, 'twitch', 'earTwitch', 0.15) }
    }
    eng.msg('咔嚓。闪光灯亮了一下。', 'system')
    return true
  }
  const R = RELIC_TEXT[type]
  if (R) {
    if (!sv.relics.includes(type)) sv.relics.push(type)
    const first = !sv.truth
    sv.truth = 1
    audio.uiTick()
    for (const line of R) eng.msg(line, 'lore')
    chefSay(eng, R[R.length - 1], 'sys', 5, true)
    if (first) eng.player.sanity = Math.max(0, eng.player.sanity - 4)
    return true
  }
  return false
}
export const RELIC_TEXT: Record<string, string[]> = {
  megform: [
    'M.E.G. 实体观察记录（未完成）　编号：800　观察员：——　地点：Level 5，餐厅',
    '「顾客对他视而不见。我试着跟邻座说话，他头也不抬，只是一勺接一勺地往嘴里送。」',
    '「炖菜里的肉。我拿镊子挑出来对着灯看了。我不写了。我必须离开——」（字迹在这里拖成一道长线。）',
  ],
  megmic: [
    '坏掉的胸麦：外壳裂了，按下侧键还能放出最后一段录音。',
    '「……他拍照的时候会僵住。耳朵。他的耳朵会抽。铃声也是——」（一阵沉重的呼吸，越来越近。）',
    '「锅。只有一口锅有把手。如果拿走它……」（录音在一声闷响里断了。）',
  ],
  chefphoto: [
    '一张褪色的拍立得：后厨，一口冒着热气的大锅，锅前站着一个背影——高高的厨师帽，两只竖起的耳朵从帽边伸出来。',
    '背面用圆珠笔写着：「他把人吐进锅里。炖菜。香肠。别吃。」',
  ],
}
// —— 打他：只顿一下 ——
export function chefKillGuard(eng: Engine, e: Entity): boolean {
  if (e.def.type !== 'chef') return false
  e.hp = e.def.hp; e.dead = false
  const s = ensureChef(e)
  if (s.mode !== 'drag' && s.mode !== 'knife' && s.mode !== 'swing' && s.mode !== 'stun') { setMode(s, 'stun', 'flashFreeze', 0.08); chefMark(eng, 'hit') }
  return true
}

// =====================================================================
// 联动
// =====================================================================
/** [spokes] 发条兔把人带进餐厅：送到他这里（盯上） */
export function chefRabbitDelivered(eng: Engine): boolean {
  const sv = chefSave(eng)
  if (!chefSite(eng)) return false
  sv.n.rabbit++
  addAttn(eng, CK.rabbitAttn)
  chefMark(eng, 'rabbit')
  return true
}
/** [beast] 关注度满、野兽熄灯缠抓之后：有一定概率把人「交给厨师」（醒在冷库）。返回 true = 已接管 */
export function chefBeastHandoff(eng: Engine): boolean {
  const r = rt(eng), sv = chefSave(eng)
  // 只在餐厅附近（他已经在后场 = 你离餐厅 CK.spawnR 内）才交接
  if (!inL5(eng) || r.cuff || r.drag || !chefSite(eng) || !findChef(eng) || Math.random() >= CK.beastHandoffP) return false
  sv.n.beast++
  capture(eng, null, 'beast')
  chefSay(eng, '触腕松开了你。有人把你接了过去——一双又肥又热的手。', 'sys', 4.5, true)
  return true
}
// —— 血迹（管家擦）——
export function addStain(eng: Engine, x: number, y: number) {
  const sv = chefSave(eng), w = world(eng, x, y)
  sv.stains.push({ x: w.x, y: w.y, t: CK.stainLife })
  while (sv.stains.length > CK.stainCap) sv.stains.shift()
}
function wipeStain(eng: Engine, wx: number, wy: number) {
  const sv = chefSave(eng)
  const before = sv.stains.length
  sv.stains = sv.stains.filter((s) => Math.hypot(s.x - wx, s.y - wy) > 0.6)
  if (sv.stains.length < before) { sv.n.wiped++; if (inL5(eng) && chefInHall(eng)) eng.msg('管家跪下来擦了很久。地毯上的血迹不见了。', 'lore') }
}
/** [maid] 巡楼时看见餐厅地毯上的血迹（窗口坐标；10 m 内、看得见）：返回要去擦的点 */
export function chefStainFor(eng: Engine, maid: Entity): { x: number; y: number } | null {
  const sv = chefSave(eng); if (!sv.stains.length || !inL5(eng)) return null
  const { ox, oy } = off(eng)
  for (const s of sv.stains) { const x = s.x - ox, y = s.y - oy; if (Math.hypot(x - maid.x, y - maid.y) < 10 && eng.los(maid.x, maid.y, x, y)) return { x, y } }
  return null
}
/** [maid] 开始擦（CK.wipeT 秒后血迹消失） */
export function chefStartWipe(eng: Engine, maid: Entity, x: number, y: number) { const w = world(eng, x, y); rt(eng).wipes.set(maid, { x: w.x, y: w.y, t: CK.wipeT }) }
/** setChefBlood 目标：受害者 / 夜晚越多越深 */
export function chefBloodLevel(eng: Engine): number { const sv = chefSave(eng); return clamp(CK.blood0 + CK.bloodVictim * sv.victims + CK.bloodNight * sv.nights, 0, 1) }

// =====================================================================
// HUD
// =====================================================================
export interface ChefHudView {
  subs: { text: string; kind: 'chef' | 'thought' | 'sys' }[]
  veil: number // 黑屏 0..1
  warm: number // 屏幕边缘变暖 0..1
  flash: number // 闪光 0..1
  cuff: { temp: number; left: number; yank: number; key: number; tool: string | null; knife: boolean } | null
  closed: boolean
}
export function chefHud(eng: Engine): ChefHudView | null {
  const r = RT.get(eng); if (!r) return null
  const C = r.cuff
  const v: ChefHudView = {
    subs: r.subs.map((s) => ({ text: s.text, kind: s.kind })),
    veil: r.ko > 0 ? Math.min(1, r.ko / 0.5) : 0,
    warm: r.eating ? 1 : Math.min(1, r.warmT / CK.warmT) * 0.8,
    flash: Math.min(1, r.flashT / 0.35),
    cuff: C ? { temp: C.temp, left: C.phase === 'cuffed' ? Math.max(0, CK.coldLimit - C.early - C.t) : 0, yank: C.yank / CK.yankNeed, key: C.keyT / CK.keyHold, tool: cuffTool(eng), knife: C.phase !== 'cuffed' } : null,
    closed: eng.levelDef.id === 5 && r.closed && chefInHall(eng),
  }
  if (!v.subs.length && !v.veil && !v.warm && !v.flash && !v.cuff && !v.closed) return null
  return v
}
