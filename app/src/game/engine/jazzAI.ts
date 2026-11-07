// [jazz] 爵士脑（Entity 197「Jazz Brain」）阶段 3：机制。方案 /workspace/work/jazz/plan.md「机制」节 + ZAN 11-02 定稿：
//   四人（头儿小号 / 萨克斯 / 低音提琴 / 鼓兼钢琴）；舞台放厨师的餐厅（content/jazzLayout：舞台 / 钢琴 / 吧台 / 监控）；
//   出口不做，只留台词线索「墙上印着树的洞」（无 L63）；告发做成可选分支；E185 喜剧演员只留一句台词。
// 维基 entity-197：死后被老板（野兽）招来演了四十七年；头被换成乐器、天生会演奏；工作是演出时吸走观众的灵魂，
//   第一次演出被观众感动后从没真吸过，用计骗过老板；讨厌监控。低音提琴（叙述者）头太重得减肥、爱哈瓦那辣椒酱；
//   萨克斯名校出身、读不懂谱号、「你点名我来吹」；鼓不用碰头就能演奏、更爱弹钢琴、欠老四钱。
//
//   · 日程：随 L5 换班——每一轮营业（hotelPlayStart）里两场：开门后 JK.firstAt 秒第一场，每场 JK.showLen 秒，场间 JK.breakLen 秒。
//     一场 = 上台（walkOn）→ 调音（tuneUp）→ 演奏（若干首，第二首是独奏：头儿 / 萨克斯轮流）→ 终曲假吸魂（fakeSoulSuck）→ 谢幕（bow）→ 下台。
//     场间 / 打烊：头儿、萨克斯、低音提琴在吧台（drinkBeer / talkGesture / holdHead / glanceCamera；偶尔三人吵架劝和 argueReconcile），鼓手去台上弹钢琴（pianoPlay）。
//     迎宾女郎的推销和她画的海报都会预告「今晚在餐厅」（spokesAI 读 jazzNextShowText）。厨师：演出时段上菜更快（jazzLink.live）。
//   · 听演出：站在观众区 = 在听：理智每秒 +JK.listenSan，整场听完（≥ JK.fullFrac）谢幕时再 +JK.fullBonus；
//     代价「不想走」：移动 ×JK.stayMove、时间流逝 ×JK.timeWarp（多出来的时间照样饿、渴）；听了 ≥ JK.leaveAfter 秒中途离场 −JK.leaveSan 理智。
//   · 假吸魂：终曲 JK.suckT 秒，墙角监控在看（老板有 JK.beastSitP 概率坐在后排：关注上涨 ×JK.beastK）。
//     你在观众区：站定（速度 < JK.stillV）+ 低头（俯角 < JK.headDown）= 配合；乱动 / 抬头让「露馅」值上涨，满 JK.susBust = 露馅：
//       关注度 +JK.bustAttn、好感 −JK.bustFavor、老板起疑（beastTip）、乐队罚停下一场。
//     演完时配合时长 ≥ JK.complyNeed × 你在场的时长 → 成功：好感 +JK.favorGain；好感 ≥ JK.privateFavor 解锁吧台私下对话（线索台词）。
//   · 告发（可选）：知道把戏之后（看过一次终曲），站在监控下（JK.reportR）或坐在后排的老板身边，按住【特殊】JK.reportHold 秒。
//     奖励：关注度 −JK.reportAttnCut、野兽冒犯 −JK.reportStrike、理智 +JK.reportSan；后果：乐队被叫走 JK.reportGone 秒，
//     回来以后吸魂是真的了——听演出每秒 −JK.realSan 理智、终曲在场 −JK.realFinaleSan，好感锁死，不再搭话 / 点歌 / 送辣椒酱。
//   · 点歌：萨克斯「你点名我来吹」（吧台搭话或演出里站在台口 X）→ 5 首原创曲（core/audio jazzBand 程序合成），下一首就吹；
//     这首在演、你在听时给小增益，演完再留 JK.songBuffT 秒。
//   · 辣椒酱：低音提琴送（好感 ≥ JK.sauceFavor、冷却 JK.sauceCd）；用掉：耐力 +、理智 +、口渴 −；JK.sauceWarmT 秒内暖身：
//     厨师食物上瘾的饥饿加快和「再来一份」念头被压住、上瘾剩余 −JK.sauceCut、冷库体温掉得慢（jazzLink）。
//   · 音乐：按乐器拆声部（小号 / 萨克斯 / 低音 / 鼓 / 钢琴），每个声部按乐手到你的距离（1 / (1 + (d / JK.audRef)^JK.audPow)）、隔墙（×JK.occl）、方位（声像）。
//   · 存档 eng.hotel.jazz：好感、成功 / 露馅次数、是否告发 / 剩余、私下对话、线索、辣椒酱冷却 / 暖身、当前曲目增益、统计。
import type { Engine } from '../engine'
import type { Entity } from '../entities'
import { makeEntity } from '../entities'
import type { SpecialAction } from './special'
import { hotelAddAttn, hotelSetAttn, hotelPlayStart, saveBook } from './l5Hotel'
import { audio } from '../core/audio'
import { itemName } from '../content/items'
import { floorHeight } from '../world/mapgen'
import { look } from '../renderer/shared'
import { chefSite, chefZone } from './chefAI'
import { beastSpawnAudience, beastLeaveAudience, beastInAudience, beastTip, beastSay, beastSave, findBeast } from './beastAI'
import { setJazzLive } from './jazzLink'
import { jazzSiteOf, jazzFloorH, jazzFromRoot, inTR, jazzObstacles, jazzInSteps, jazzOnStageOk, type JazzSite } from '../content/jazzLayout'
import { canOccupy, PLAYER_RADIUS } from '../core/player'
import type { Spot } from '../content/chefLayout'
import type { JazzWho } from '../renderer/jazzRig'

// ---------- 调参表（单位：米 / 秒 / 点）---------- ZAN 可直接改这里
export const JK = {
  // —— 出现 ——
  spawnR: 50, despawnR: 78,
  // —— 日程（相对一轮营业开始）——
  firstAt: 125, showLen: 120, breakLen: 80, shows: 2, // 开门后 125 s 第一场；每场 120 s；场间 80 s（厨师打烊后 120 s 才重新营业，第一场排在那之后）
  walkOnT: 16, tuneT: 4.8, suckT: 12, bowT: 3.6, // 上台 / 调音 / 终曲假吸魂 / 谢幕
  pieceLen: [26, 34] as const, soloPiece: 1, // 每首长度；第几首是独奏（0 起）
  walkSpeed: 0.8, // = jazzAnim walk 片段速度
  // —— 听演出 ——
  listenSan: 0.3, fullFrac: 0.8, fullBonus: 12, leaveSan: 4, leaveAfter: 10,
  stayMove: 0.72, timeWarp: 1.5, // 不想走：移动 ×0.72；时间 ×1.5
  // —— 假吸魂 ——
  stillV: 0.25, headDown: -0.35, susMove: 16, susLook: 9, susDown: 5, beastK: 1.8, susBust: 100,
  complyNeed: 0.6, favorGain: 20, privateFavor: 20, bustAttn: 25, bustFavor: 15, bustSan: 6, sulkT: 300,
  beastSitP: 0.3,
  // —— 告发 ——
  reportR: 2.4, reportHold: 1.5, reportAttnCut: 30, reportStrike: 1, reportSan: 10, reportGone: 1800, realSan: 0.5, realFinaleSan: 20, realAttn: 10,
  // —— 搭话 / 点歌 / 辣椒酱 ——
  talkR: 2.3, talkCd: 1.2, familiarR: 2.4,
  songBuffT: 60,
  sauceFavor: 0, sauceCd: 480, sauceWarmT: 240, sauceStam: 30, sauceSan: 3, sauceThirst: 8, sauceCut: 150,
  hitFavor: 15,
  // —— 吧台 ——
  barAct: [7, 14] as const, argueP: 0.35,
  // —— 音乐空间化 ——
  audRef: 4.5, audPow: 1.6, occl: 0.35, audMax: 45,
  // —— [修] 走位避让（中心距 m / s / m·s⁻¹）：离你 < yieldGap 就停下等、说一句；等 yieldReplan 秒绕路；绕不过去 nudgeAfter 秒后侧身把你轻轻挤开 ——
  yieldGap: 0.75, yieldReplan: 0.5, nudgeAfter: 1.4, nudgeV: 0.9, routeAvoid: 1.0, walkR: 0.3, gridC: 0.25,
  // —— [修] 注视：多远内看你 ——
  lookR: 5, lookShowR: 9,
  // —— [修] 告发后离场：收拾（packUp 4.4 s）→ 依次下台（间隔 leaveStagger）→ 走到后场门出去；超时兜底 ——
  leaveStagger: 0.7, leaveTimeout: 60,
}
/** 5 首原创曲（core/audio jazzBand 合成；名字 / 增益文案）。buff：增益种类（stepJazzGlobal 施加） */
export const JAZZ_SONGS = [
  { name: '黄铜走廊', style: '中速摇摆', buff: '耐力回得更快', key: 'stamina' },
  { name: '十三楼的月光', style: '慢板抒情', buff: '理智慢慢回升', key: 'sanity' },
  { name: '哈瓦那辣椒', style: '拉丁', buff: '饿得慢一半', key: 'hunger' },
  { name: '无声换班', style: '小调华尔兹', buff: '酒店的关注慢慢退去', key: 'attn' },
  { name: '欠老四的钱', style: '快板比波普', buff: '脚步轻快，不再「不想走」', key: 'feet' },
] as const
export const SONG_BUFF = { stamina: 6, sanity: 0.25, hunger: 0.14, attn: 0.3, feet: 1.1 }
export const JAZZ_WHO_LIST: JazzWho[] = ['leader', 'sax', 'bass', 'drum']
export const JAZZ_NAME: Record<JazzWho, string> = { leader: '小号头儿', sax: '萨克斯', bass: '低音提琴', drum: '鼓手' }
/** 片段时长（= renderer/jazzAnim JAZZ_CLIPS.dur；AI 不依赖渲染模块）。check:jazz 对照 */
export const JAZZ_CLIP_LEN = { trumpetPlay: 4, trumpetSolo: 6, saxPlay: 4, saxSolo: 6, bassPlay: 4, drumPlay: 4, pianoPlay: 4, bow: 3.6, tuneUp: 4.8, fakeSoulSuck: 4, idleSway: 4, walk: 1.15, drinkBeer: 6, holdHead: 5, talkGesture: 4, leanFamiliar: 4, pointDirection: 3.6, glanceCamera: 4, argueReconcile: 6, packUp: 4.4, trueSoulSuck: 4 } as const
export type JazzClipId = keyof typeof JAZZ_CLIP_LEN
const LOOP = new Set<JazzClipId>(['trumpetPlay', 'saxPlay', 'bassPlay', 'drumPlay', 'pianoPlay', 'idleSway', 'walk', 'holdHead', 'talkGesture'])
const PLAY_CLIP: Record<JazzWho, JazzClipId> = { leader: 'trumpetPlay', sax: 'saxPlay', bass: 'bassPlay', drum: 'drumPlay' }

// ---------- 存档（eng.hotel.jazz，随局）----------
export interface JazzSave {
  favor: number
  fakeOk: number; busted: number
  reported: 0 | 1; goneT: number
  priv: 0 | 1; clue: 0 | 1
  sauceCd: number; sauceT: number
  buff: number; buffT: number // 当前曲目增益（JAZZ_SONGS 序号，−1 = 无）/ 剩余
  sulkT: number // 露馅后罚停：这段时间内的演出取消
  sawFinale: 0 | 1
  n: { show: number; full: number; left: number; fake: number; bust: number; report: number; request: number; sauce: number; talk: number; hit: number }
}
const N0 = () => ({ show: 0, full: 0, left: 0, fake: 0, bust: 0, report: 0, request: 0, sauce: 0, talk: 0, hit: 0 })
export function freshJazzSave(): JazzSave { return { favor: 0, fakeOk: 0, busted: 0, reported: 0, goneT: 0, priv: 0, clue: 0, sauceCd: 0, sauceT: 0, buff: -1, buffT: 0, sulkT: 0, sawFinale: 0, n: N0() } }
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export function restoreJazzSave(raw: unknown): JazzSave {
  const f = freshJazzSave()
  if (!raw || typeof raw !== 'object') return f
  const r = raw as Partial<JazzSave>
  const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)
  const n = (r.n ?? {}) as Record<string, unknown>
  const buff = Math.floor(num(r.buff, -1))
  return {
    favor: clamp(num(r.favor), -100, 100), fakeOk: Math.max(0, Math.floor(num(r.fakeOk))), busted: Math.max(0, Math.floor(num(r.busted))),
    reported: r.reported ? 1 : 0, goneT: Math.max(0, num(r.goneT)), priv: r.priv ? 1 : 0, clue: r.clue ? 1 : 0,
    sauceCd: Math.max(0, num(r.sauceCd)), sauceT: clamp(num(r.sauceT), 0, JK.sauceWarmT),
    buff: buff >= 0 && buff < JAZZ_SONGS.length ? buff : -1, buffT: buff >= 0 && buff < JAZZ_SONGS.length ? clamp(num(r.buffT), 0, 600) : 0,
    sulkT: Math.max(0, num(r.sulkT)), sawFinale: r.sawFinale ? 1 : 0,
    n: Object.fromEntries(Object.keys(f.n).map((k) => [k, Math.max(0, Math.floor(num(n[k])))])) as JazzSave['n'],
  }
}
export function jazzSave(eng: Engine): JazzSave { return ((eng.hotel as { jazz?: JazzSave }).jazz ??= freshJazzSave()) }

// ---------- 实体状态（不入存档）----------
export type JazzMode = 'idle' | 'walk' | 'play' | 'act'
export interface JazzEntState {
  who: JazzWho
  mode: JazzMode; modeT: number
  clip: JazzClipId; seq: number; blend: number
  route: { x: number; y: number }[]; ri: number; goal: Spot | null; speed: number
  /** 地台高度（舞台 0.45 / 台阶过渡 / 地面 0）——渲染把模型抬上去 */
  h: number
  /** 当前所在：stage / bar / floor（决定下一段路线） */
  where: 'stage' | 'bar' | 'floor'
  actT: number; talkT: number; familiar: boolean
  /** 看着的点（地图米 + 眼高 z；null = 正前方）——渲染的注视层（头 / 颈叠加转角） */
  lookAt: { x: number; y: number; z?: number } | null
  /** [修] 真吸魂：雾的源（地图米 + 高度：你的胸口）；null = 观众席 */
  mistFrom: { x: number; y: number; z: number } | null
  /** [修] 走位避让：被挡住的时长 / 这段路说过「借过」/ 这段路绕过一次 / 下次查路线 / 这段路挤过你 */
  wait: number; yieldSaid: boolean; replanned: boolean; replanT: number; nudged: boolean
  /** [修] 告发后离场：收拾 → 下台走到后场门 → 穿门出去 */
  leave: { phase: 'pack' | 'walk' | 'door'; delay: number } | null
}
export function ensureJazz(e: Entity, who: JazzWho = 'leader'): JazzEntState {
  return (e.jz ??= { who, mode: 'idle', modeT: 0, clip: 'idleSway', seq: 0, blend: 0.4, route: [], ri: 0, goal: null, speed: JK.walkSpeed, h: 0, where: 'floor', actT: 3, talkT: 0, familiar: false, lookAt: null, mistFrom: null, wait: 0, yieldSaid: false, replanned: false, replanT: 0, nudged: false, leave: null })
}
export function findJazz(eng: Engine, who?: JazzWho): Entity[] { return eng.map?.entities.filter((e) => e.def.type === 'jazz' && !e.dead && (!who || e.jz?.who === who)) ?? [] }
const one = (eng: Engine, who: JazzWho) => findJazz(eng, who)[0] ?? null
function setClip(s: JazzEntState, clip: JazzClipId, blend = 0.35) { if (clip !== s.clip || !LOOP.has(clip)) s.seq++; s.clip = clip; s.blend = blend }
function setMode(s: JazzEntState, m: JazzMode, clip: JazzClipId, blend = 0.35) { s.mode = m; s.modeT = 0; setClip(s, clip, blend) }

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const inL5 = (eng: Engine) => eng.levelDef.id === 5 && !!eng.map?.inf
const off = (eng: Engine) => ({ ox: eng.map?.inf?.ox ?? 0, oy: eng.map?.inf?.oy ?? 0 })
function addAttn(eng: Engine, v: number) { if (inL5(eng)) hotelAddAttn(eng, v); else eng.hotel.attn = clamp(eng.hotel.attn + v, 0, 100) }
function meet(eng: Engine) { const b = eng.hotelBook; if (!b.met.includes('jazz')) { b.met.push('jazz'); saveBook(b) } }
function rel(eng: Engine, v: number) { const sv = jazzSave(eng); if (sv.reported) return; sv.favor = clamp(sv.favor + v, -100, 100); const h = eng.hotel; h.staff.jazz = sv.favor }
const hasT = (eng: Engine, t: string) => [eng.player.hotbar, eng.player.backpack].some((a) => a.some((sl) => sl?.type === t)) || (eng.player.equip?.pockets ?? []).some((sl) => sl?.type === t)
function dropItem(eng: Engine, type: string, x: number, y: number) {
  const m = eng.map; if (!m) return
  const it = { id: Math.random(), type, count: 1, x, y }
  m.items.push(it)
  const inf = m.inf
  if (inf) inf.chunks.get(`${Math.floor((x + inf.ox) / 32)},${Math.floor((y + inf.oy) / 32)}`)?.items.push(it)
}
function give(eng: Engine, t: string) { if (!eng.addItem(t)) { const p = eng.player; dropItem(eng, t, p.x, p.y); eng.msg(`背包满了。「${itemName(t)}」放在了你脚边。`, 'system') } }

// =====================================================================
// 台词（中文；按维基人设）
// =====================================================================
/** 场间吧台搭话（普通） */
export const TALK: Record<JazzWho, readonly string[]> = {
  leader: ['四十七年了，孩子。这台子比我认识的大多数人都老。', '别站在离监控太近的地方。它不喜欢我们，我们也不喜欢它。', '小伙子们吹得还行吧？我是说——还行吧？', '这里的啤酒是温的。四十七年都是温的。', '楼上有个讲笑话的家伙，笑点全在你身上。我们宁可吹小号。'],
  sax: ['谱号？那玩意儿我从来没看懂过。你点名，我来吹。', '我念过音乐学院，名校。他们教的我一样也没记住，可我吹得出来。', '你点一首。哪首都行——我是说，就那五首。', '别让头儿听见：他最后那个高音是我替他吹的。'],
  bass: ['我得减点肥。这颗头已经够沉了，脖子受不了。', '来点辣椒酱？哈瓦那的。什么东西抹上它都能下咽——包括这里的啤酒。', '你看着面熟。……不，不可能，我们的观众很少回来第二次。', '老四？别跟鼓手提老四。他还欠人家钱呢。'],
  drum: ['我不用碰它，它自己会响。可钢琴不一样，钢琴得用手。', '我欠老四一笔钱。别问多少。别问老四是谁。', '你会弹琴吗？不会也没关系，坐过来听就行。', '他们三个吵起来的时候，我就弹这台钢琴。弹到他们不吵为止。'],
}
/** 配合假吸魂成功之后的私下对话（线索 / 人设 / 讨厌监控 / 骗老板 / E185） */
export const PRIVATE: Record<JazzWho, readonly string[]> = {
  leader: ['你演得好。四十七年，台下的人总是傻站着等被吸——你知道该低头。', '我们第一次上台那晚，前排有个姑娘听哭了。从那以后，谁也没真动过手。', '老板问起来，我们就说吸到的东西「存在乐器里了」。他信不信，谁知道呢。', '想离开这儿？我不知道路。我只听说——墙上印着树的洞。别问我是哪面墙。', '楼上那个讲笑话的，你要是碰见他，千万别笑。'],
  sax: ['那台监控每晚都在。我们对着它举手，它对着我们眨红灯。谁骗谁呢？', '墙上印着树的洞——头儿老念叨这个。我们谁也没见过，可他说得跟真的一样。', '下次你点首慢的。终曲前吹慢的，台下的人容易低头。'],
  bass: ['我们被招来的那天，就没打算干这份活。头换了，心没换。', '辣椒酱的事别告诉厨子。他觉得他的菜不需要任何东西。他错了。', '你知道墙上印着树的洞吗？有人说那是一条出去的路。有人说不是。我得减点肥，然后去找找。'],
  drum: ['你是来听钢琴的吧？我就知道。', '老四要是来找我，你就说我在吹小号。', '那面墙——印着树的洞那面。头儿说过一次，就再也不提了。'],
}
/** 告发之后（冷冰冰） */
export const COLD: Record<JazzWho, readonly string[]> = {
  leader: ['……演出照常。', '你现在满意了？'],
  sax: ['我不接点歌了。', '吹什么都一样。'],
  bass: ['没有辣椒酱了。', '我们没什么好说的。'],
  drum: ['钢琴走音了。', '……'],
}
const EXIT_CLUE = '墙上印着树的洞'

// ---------- 运行时（不入存档）----------
type ShowPhase = 'none' | 'walkOn' | 'tune' | 'set' | 'finale' | 'bow'
interface JazzRt {
  map: unknown; site: JazzSite | null; siteScan: number
  /** 当前排期：这一轮营业的第几场（0 / 1，−1 = 场间）、阶段、场内时间 */
  k: number; phase: ShowPhase; showT: number; showKey: string; cycle: number; t0: number
  piece: number; pieceT: number; pieceLen: number; song: number; soloWho: JazzWho | null
  request: number | null
  // 听 / 假吸魂（每场重置）
  listenT: number; presentT: number; leftOnce: boolean; wasIn: boolean
  sus: number; complyT: number; finaleInT: number; busted: boolean; finaleDone: boolean; bowDone: boolean
  beastHere: boolean
  lastP: { x: number; y: number } | null; pv: number
  subs: { text: string; who: string; t: number }[]
  menu: number // 点歌菜单开着（1 / 0）——[修] 开着时游戏暂停（App 覆盖层 jazzmenu，同 BeastDeal / GreeterInvite）
  talkCd: number
  reportT: number
  bustAt: number | null
  argue: { t: number } | null
  qa: { k: number; showT: number } | null
  /** [修] 告发后离场进行中（计时）；真吸魂的画面压暗 / 发冷 0..1（渲染曝光 + HUD 冷色罩） */
  leave: { t: number } | null
  grade: number
  /** [修] 验收：避让事件计数（停下等 / 走着走着绕路 / 挤开你 / 出发时就绕开你） */
  yieldN: { wait: number; replan: number; nudge: number; detour: number }
}
const RT = new WeakMap<Engine, JazzRt>()
function rt(eng: Engine): JazzRt {
  let r = RT.get(eng)
  if (!r) { r = { map: null, site: null, siteScan: 0, k: -1, phase: 'none', showT: 0, showKey: '', cycle: -1, t0: 0, piece: -1, pieceT: 0, pieceLen: 30, song: 0, soloWho: null, request: null, listenT: 0, presentT: 0, leftOnce: false, wasIn: false, sus: 0, complyT: 0, finaleInT: 0, busted: false, finaleDone: false, bowDone: false, beastHere: false, lastP: null, pv: 0, subs: [], menu: 0, talkCd: 0, reportT: 0, bustAt: null, argue: null, qa: null, leave: null, grade: 0, yieldN: { wait: 0, replan: 0, nudge: 0, detour: 0 } }; RT.set(eng, r) }
  return r
}
export function jazzDebug(eng: Engine) { return rt(eng) }
export function jazzSay(eng: Engine, text: string, who = '', dur = 4, clear = false) {
  const r = rt(eng)
  if (clear) r.subs.length = 0
  r.subs.push({ text, who, t: dur })
  while (r.subs.length > 3) r.subs.shift()
}
/** 实机截图 / 验收：把排期钉在第 k 场的 showT 秒（null = 跟随时钟） */
export function jazzQaClock(eng: Engine, k: number | null, showT = 0) { rt(eng).qa = k === null ? null : { k, showT } }
export const JAZZ_QA = { freeze: false }

// =====================================================================
// 地点
// =====================================================================
/** 窗口里离玩家最近的厨师餐厅的舞台（世界坐标）；每 1 s 重查（沿用 chefSite） */
export function jazzSite(eng: Engine): JazzSite | null {
  const r = rt(eng), m = eng.map
  if (!m?.inf || eng.levelDef.id !== 5) return null
  if (r.map !== m) { r.map = m; r.site = null; r.siteScan = 0 }
  if (r.siteScan > 0 && r.site !== undefined) return r.site
  r.siteScan = 1
  const cs = chefSite(eng)
  r.site = cs ? jazzSiteOf(cs) : null
  // 舞台结构要真在地图里（出生点附近会跳过）
  if (r.site) { const { ox, oy } = off(eng), S = r.site.stage; if (!m.structures.some((t) => t.kind === 'jazzprop' && t.data?.prop === 'stage' && t.x === S.x0 - ox && t.y === S.y0 - oy)) r.site = null }
  return r.site
}
const W = (eng: Engine, p: { x: number; y: number }) => { const { ox, oy } = off(eng); return { x: p.x - ox, y: p.y - oy } }
const WS = (eng: Engine, p: Spot): Spot => { const { ox, oy } = off(eng); return { x: p.x - ox, y: p.y - oy, f: p.f } }
const world = (eng: Engine, x: number, y: number) => { const { ox, oy } = off(eng); return { x: x + ox, y: y + oy } }
/** 玩家（或某窗口点）在不在观众区 */
export function jazzInAudience(eng: Engine, x = eng.player.x, y = eng.player.y): boolean { const js = jazzSite(eng); if (!js) return false; const w = world(eng, x, y); return inTR(js.aud, w.x, w.y) }
/** 窗口点的地台高度（舞台 / 台阶） */
export function jazzStageH(eng: Engine, x: number, y: number): number { const js = jazzSite(eng); if (!js) return 0; const w = world(eng, x, y); return jazzFloorH(js, w.x, w.y) }

// =====================================================================
// 排期（纯时钟：一轮营业的开门时刻 + 偏移）
// =====================================================================
export interface JazzSlot { k: number; phase: ShowPhase; showT: number; cycle: number; t0: number; nextAt: number }
export function jazzSlot(eng: Engine): JazzSlot {
  const r = rt(eng), seed = eng.map?.inf?.seed ?? eng.seed ?? 0
  const ps = hotelPlayStart(seed, eng.time)
  const closed = eng.hotelShift.phase === 'shift'
  const sv = jazzSave(eng)
  const phaseOf = (t: number): ShowPhase => t < JK.walkOnT ? 'walkOn' : t < JK.walkOnT + JK.tuneT ? 'tune' : t < JK.showLen - JK.suckT - JK.bowT ? 'set' : t < JK.showLen - JK.bowT ? 'finale' : t < JK.showLen ? 'bow' : 'none'
  if (r.qa) return { k: r.qa.k, phase: r.qa.k < 0 ? 'none' : phaseOf(r.qa.showT), showT: r.qa.showT, cycle: ps.cycle, t0: ps.t0, nextAt: eng.time }
  const inPlay = eng.time - ps.t0
  let nextAt = Infinity
  for (let k = 0; k < JK.shows; k++) {
    const st = JK.firstAt + k * (JK.showLen + JK.breakLen)
    if (st + JK.showLen > ps.len) break // 这一轮营业太短：排不下
    const sulked = sv.sulkT > 0 && (r.bustAt === null || ps.t0 + st > r.bustAt) // 露馅之后才开演的场次取消（正在演的那场演完；读档后罚停期内一律取消）
    if (inPlay >= st && inPlay < st + JK.showLen && !closed && !sulked && !(sv.reported && sv.goneT > 0)) return { k, phase: phaseOf(inPlay - st), showT: inPlay - st, cycle: ps.cycle, t0: ps.t0, nextAt: ps.t0 + st }
    if (inPlay < st) nextAt = Math.min(nextAt, ps.t0 + st)
  }
  if (!Number.isFinite(nextAt)) nextAt = ps.t0 + ps.len + 45 + JK.firstAt // 下一轮营业的第一场
  return { k: -1, phase: 'none', showT: 0, cycle: ps.cycle, t0: ps.t0, nextAt }
}
/** 迎宾女郎的推销 / 海报用：下一场的预告文案 */
export function jazzNextShowText(eng: Engine): string {
  const sl = jazzSlot(eng)
  if (sl.k >= 0) return '爵士乐队此刻正在餐厅演出！快去！'
  const m = Math.max(1, Math.round((sl.nextAt - eng.time) / 60))
  return `今晚在餐厅：爵士脑乐队，${m} 分钟后开演！四位乐手，绝无危险！`
}
/** [修] 真吸魂的画面压暗 / 发冷（renderer 乘到曝光上：1 − 0.42 × grade） */
export function jazzGrade(eng: Engine): number { return RT.get(eng)?.grade ?? 0 }
export function jazzShowOn(eng: Engine): boolean { const r = RT.get(eng); return !!r && r.k >= 0 && r.phase !== 'none' }

// =====================================================================
// 世界步进（l5Hotel.updateHotel：任何层级都调 stepJazzGlobal；L5 调 stepJazzWorld）
// =====================================================================
export function stepJazzGlobal(eng: Engine, dt: number) {
  const r = rt(eng), sv = jazzSave(eng), p = eng.player
  if (r.subs.length) { r.subs[0].t -= dt; if (r.subs[0].t <= 0) r.subs.shift() }
  r.siteScan -= dt; r.talkCd = Math.max(0, r.talkCd - dt)
  sv.sauceCd = Math.max(0, sv.sauceCd - dt); sv.sulkT = Math.max(0, sv.sulkT - dt)
  if (sv.reported && sv.goneT > 0) { sv.goneT = Math.max(0, sv.goneT - dt); if (sv.goneT === 0 && inL5(eng) && jazzSite(eng)) eng.msg('餐厅那边传来调音的声音。乐队回来了——听起来不太一样。', 'lore') }
  if (sv.sauceT > 0) sv.sauceT = Math.max(0, sv.sauceT - dt)
  // 曲目增益：这首在演且你在听 → 持续刷新；演完再留 JK.songBuffT 秒
  if (sv.buff >= 0) {
    sv.buffT = Math.max(0, sv.buffT - dt)
    const k = JAZZ_SONGS[sv.buff].key
    if (k === 'stamina') p.stamina = Math.min(100, p.stamina + SONG_BUFF.stamina * dt)
    else if (k === 'sanity') p.sanity = Math.min(100, p.sanity + SONG_BUFF.sanity * dt)
    else if (k === 'hunger') p.hunger = Math.min(100, p.hunger + SONG_BUFF.hunger * dt)
    else if (k === 'attn' && inL5(eng)) hotelSetAttn(eng, eng.hotel.attn - SONG_BUFF.attn * dt)
    if (sv.buffT <= 0) sv.buff = -1
  }
  if (!inL5(eng)) { setJazzLive(eng, false); lastView = null; audio.jazzBand?.(null) }
}
export function stepJazzWorld(eng: Engine, dt: number) {
  if (!inL5(eng)) return
  const r = rt(eng), sv = jazzSave(eng), p = eng.player
  const js = jazzSite(eng)
  if (!js) { for (const e of findJazz(eng)) removeEnt(eng, e); r.k = -1; r.phase = 'none'; r.leave = null; r.grade = 0; setJazzLive(eng, false); audio.jazzBand?.(null); return }
  const pw = world(eng, p.x, p.y), d = Math.hypot(pw.x - js.stageC.x, pw.y - js.stageC.y)
  // —— 排期 ——
  const sl = jazzSlot(eng)
  const key = `${sl.cycle}:${sl.k}`
  if (sl.k >= 0 && key !== r.showKey) startShow(eng, key, sl)
  if (sl.k < 0 && r.k >= 0) endShow(eng)
  const prevPhase = r.phase
  r.k = sl.k; r.phase = sl.phase; r.showT = sl.showT; r.cycle = sl.cycle; r.t0 = sl.t0
  if (r.phase !== prevPhase) onPhase(eng, prevPhase, r.phase)
  setJazzLive(eng, r.k >= 0)
  // —— 出现 / 收起 ——
  const gone = sv.reported && sv.goneT > 0
  let band = findJazz(eng)
  // [修] 告发之后：不是直接收起——四人收拾、瞪你、依次下台从后场门出去（updateJazz 的离场状态机），走完 / 超时 / 你走远了才收起
  if (r.leave) { r.leave.t += dt; if (!band.length || r.leave.t > JK.leaveTimeout || d > JK.despawnR) { for (const e of band) removeEnt(eng, e); band = []; r.leave = null } }
  else if (!gone && band.length < 4 && d < JK.spawnR) { spawnBand(eng); band = findJazz(eng) }
  else if (band.length && (d > JK.despawnR || gone)) { for (const e of band) removeEnt(eng, e); band = [] }
  // [修] 真吸魂：终曲时画面压暗、发冷（渲染曝光 + HUD 冷色罩），演出中其余时候轻一点
  const realOn = !!sv.reported && !gone && r.k >= 0 && jazzInHallish(eng)
  const gT = realOn ? (r.phase === 'finale' ? 1 : 0.25) : 0
  r.grade += (gT - r.grade) * Math.min(1, dt * 1.6)
  if (r.grade < 1e-3 && gT === 0) r.grade = 0
  // —— 曲目推进 ——
  if (r.k >= 0 && r.phase === 'set') stepPieces(eng, dt)
  // —— 听演出 / 假吸魂 ——
  const vNow = r.lastP ? Math.hypot(p.x - r.lastP.x, p.y - r.lastP.y) / Math.max(1e-3, dt) : 0
  r.pv += (vNow - r.pv) * Math.min(1, dt * 10); r.lastP = { x: p.x, y: p.y }
  const inAud = inTR(js.aud, pw.x, pw.y)
  if (r.k >= 0 && band.length) stepListen(eng, dt, inAud)
  else r.wasIn = false
  // —— 告发按住 ——
  if (r.reportT > 0 && !JAZZ_QA.freeze && !(eng.specialHeld && jazzAct(eng)?.act === 'report')) r.reportT = 0
  if (eng.specialHeld && !JAZZ_QA.freeze && jazzAct(eng)?.act === 'report') { r.reportT += dt; if (r.reportT >= JK.reportHold) { r.reportT = 0; jazzReport(eng) } }
  // —— 点歌菜单：走远了就收起 ——
  if (r.menu > 0) { const sx = one(eng, 'sax'); if (!sx || Math.hypot(sx.x - p.x, sx.y - p.y) > JK.talkR + 2.5) r.menu = 0 }
  // —— 音乐 ——
  stepAudio(eng, js, band)
  // —— 吵架劝和计时 ——
  if (r.argue) { r.argue.t -= dt; if (r.argue.t <= 0) r.argue = null }
  void sv
}

// =====================================================================
// 演出
// =====================================================================
function startShow(eng: Engine, key: string, sl: JazzSlot) {
  const r = rt(eng), sv = jazzSave(eng)
  r.showKey = key
  r.listenT = 0; r.presentT = 0; r.leftOnce = false; r.wasIn = false
  r.sus = 0; r.complyT = 0; r.finaleInT = 0; r.busted = false; r.finaleDone = false; r.bowDone = false
  r.piece = -1; r.pieceT = 0; r.soloWho = null
  r.song = r.request ?? (sl.cycle * 2 + sl.k) % JAZZ_SONGS.length
  sv.n.show++
  // 老板有时坐在后排（第一场开始时掷一次）
  r.beastHere = false
  const js = jazzSite(eng)
  if (js && Math.random() < JK.beastSitP && !findBeast(eng)) {
    const at = WS(eng, { x: js.aud.x0 + 0.5, y: js.audC.y + 0.4, f: 0 })
    if (beastSpawnAudience(eng, at.x, at.y, at.f)) { r.beastHere = true; if (jazzInHallish(eng)) eng.msg('观众席最后一排，站着一位穿得很体面的绅士。他没有鼓掌。', 'lore') }
  }
  if (jazzInHallish(eng)) eng.msg(sv.reported ? '乐队上台了。没有人看你。' : '灯暗下来，舞台亮了。小号头儿朝台下点点头——今晚的第' + (sl.k + 1) + '场。', 'lore')
}
function endShow(eng: Engine) {
  const r = rt(eng)
  if (r.beastHere) { beastLeaveAudience(eng); r.beastHere = false }
  for (const e of findJazz(eng)) ensureJazz(e).familiar = false
  if (Math.random() < JK.argueP && !jazzSave(eng).reported) r.argue = { t: 40 } // 场间：三人吵一架、被头儿按肩劝和
  r.k = -1; r.phase = 'none'
}
function onPhase(eng: Engine, from: ShowPhase, to: ShowPhase) {
  const r = rt(eng), sv = jazzSave(eng)
  if (to === 'finale') {
    sv.sawFinale = jazzInHallish(eng) ? 1 : sv.sawFinale
    if (r.wasIn && !sv.reported) jazzSay(eng, '终曲。墙角的监控亮着红灯——站着别动，低下头。', '', 5, true)
    if (r.beastHere && r.wasIn) jazzSay(eng, '后排那位绅士往前倾了倾身子。', '', 4)
  }
  if (from === 'finale' && to !== 'finale') finishFinale(eng)
  if (to === 'bow' || (from === 'bow' && to === 'none')) finishShow(eng)
}
function stepPieces(eng: Engine, dt: number) {
  const r = rt(eng)
  const t = r.showT - JK.walkOnT - JK.tuneT
  if (r.piece < 0 || r.pieceT >= r.pieceLen) {
    r.piece++; r.pieceT = 0; r.pieceLen = rnd(JK.pieceLen[0], JK.pieceLen[1])
    if (r.piece > 0) r.song = r.request ?? (r.song + 1 + Math.floor(Math.random() * (JAZZ_SONGS.length - 1))) % JAZZ_SONGS.length
    if (r.request !== null) { const sv = jazzSave(eng); sv.buff = r.request; sv.buffT = Math.max(sv.buffT, JK.songBuffT); if (jazzInHallish(eng)) jazzSay(eng, `「${JAZZ_SONGS[r.request].name}」——这首是给你的。`, JAZZ_NAME.sax, 4); r.request = null }
    r.soloWho = r.piece === JK.soloPiece ? (Math.floor(r.cycle + rt(eng).k) % 2 === 0 ? 'leader' : 'sax') : null
  }
  r.pieceT += dt
  void t
}
function stepListen(eng: Engine, dt: number, inAud: boolean) {
  const r = rt(eng), sv = jazzSave(eng), p = eng.player
  const playing = r.phase === 'set' || r.phase === 'finale' || r.phase === 'tune'
  if (r.menu) return // [修] 点歌菜单开着：游戏本就暂停；无头 / 未暂停时也冻结听演出与露馅计时
  if (inAud && playing) {
    if (!r.wasIn) meet(eng)
    r.wasIn = true
    r.listenT += dt * JK.timeWarp; r.presentT += dt // listenT 按演出时钟算（时间加快的那部分也算听了）
    if (sv.reported) p.sanity = Math.max(0, p.sanity - JK.realSan * dt)
    else p.sanity = Math.min(100, p.sanity + JK.listenSan * dt)
    // 时间过得比你以为的快：多推进 (timeWarp − 1) 倍；多出来的时间照样饿 / 渴
    const extra = dt * (JK.timeWarp - 1)
    if (extra > 0 && !JAZZ_QA.freeze) { eng.time += extra; p.hunger = Math.max(0, p.hunger - 0.28 * extra); p.thirst = Math.max(0, p.thirst - 0.28 * extra) }
    // 这首是你点的：增益跟着刷新
    if (sv.buff >= 0 && r.song === sv.buff) sv.buffT = Math.max(sv.buffT, JK.songBuffT)
  } else if (r.wasIn && !inAud && playing) {
    r.wasIn = false
    if (r.listenT >= JK.leaveAfter && !r.leftOnce && !sv.reported) { r.leftOnce = true; sv.n.left++; p.sanity = Math.max(0, p.sanity - JK.leaveSan); jazzSay(eng, '你走出了观众区。音乐好像在背后拉着你的衣角。', '', 3.5) }
  }
  // 假吸魂
  if (r.phase === 'finale' && inAud && !r.busted && !JAZZ_QA.freeze) {
    r.finaleInT += dt
    if (sv.reported) return
    const moving = r.pv > JK.stillV, down = look.pitch < JK.headDown
    const k = beastInAudience(eng) ? JK.beastK : 1
    if (moving || !down) r.sus += ((moving ? JK.susMove : 0) + (!down ? JK.susLook : 0)) * k * dt
    else { r.sus = Math.max(0, r.sus - JK.susDown * dt); r.complyT += dt }
    if (r.sus >= JK.susBust) bust(eng)
  }
}
function bust(eng: Engine) {
  const r = rt(eng), sv = jazzSave(eng), p = eng.player
  r.busted = true; sv.busted++; sv.n.bust++; r.bustAt = eng.time
  addAttn(eng, JK.bustAttn); rel(eng, -JK.bustFavor); p.sanity = Math.max(0, p.sanity - JK.bustSan)
  sv.sulkT = JK.sulkT
  beastTip(eng)
  for (const e of findJazz(eng)) { const s = ensureJazz(e); setMode(s, 'act', 'glanceCamera', 0.2) }
  jazzSay(eng, '监控的红灯停在你身上。台上四个人同时僵住了——露馅了。', '', 5, true)
  if (beastInAudience(eng)) beastSay(eng, '……有意思。', 2.6)
  eng.msg('你没有装成被吸走的样子。墙角的监控转了过来，台上的乐手都看向了它。酒店的关注度上升了。', 'lore')
}
function finishFinale(eng: Engine) {
  const r = rt(eng), sv = jazzSave(eng), p = eng.player
  if (r.finaleDone) return
  r.finaleDone = true
  if (r.finaleInT < 1) return
  if (sv.reported) { p.sanity = Math.max(0, p.sanity - JK.realFinaleSan); addAttn(eng, JK.realAttn); jazzSay(eng, '白雾真的流进了乐器口里。你觉得身体里少了点什么。', '', 5, true); return }
  if (r.busted) return
  const need = JK.complyNeed * Math.max(r.finaleInT, JK.suckT * 0.5)
  if (r.complyT >= need) {
    sv.fakeOk++; sv.n.fake++
    rel(eng, JK.favorGain)
    const unlocked = !sv.priv && sv.favor >= JK.privateFavor
    if (unlocked) sv.priv = 1
    jazzSay(eng, '灯亮了。小号头儿冲你极轻地点了一下头——像是在说：演得好。', '', 5, true)
    eng.msg(unlocked ? '你陪乐队演完了终曲。场间去吧台找他们聊聊吧——他们有话想私下跟你说。' : '你陪乐队演完了终曲。', 'lore')
  } else jazzSay(eng, '你一会儿低头一会儿抬头。好在监控没看出来。', '', 4)
}
function finishShow(eng: Engine) {
  const r = rt(eng), sv = jazzSave(eng), p = eng.player
  if (r.bowDone) return
  r.bowDone = true
  if (r.listenT >= JK.fullFrac * (JK.showLen - JK.walkOnT - JK.bowT) && !sv.reported) {
    sv.n.full++
    p.sanity = Math.min(100, p.sanity + JK.fullBonus)
    jazzSay(eng, '你听完了一整场。心里有什么东西安静下来了。', '', 4.5)
  }
  if (r.beastHere) { beastLeaveAudience(eng); r.beastHere = false }
}
export function jazzInHallish(eng: Engine): boolean { const js = jazzSite(eng); if (!js) return false; const w = world(eng, eng.player.x, eng.player.y); return Math.hypot(w.x - js.stageC.x, w.y - js.stageC.y) < 22 }

// =====================================================================
// 生成 / 实体
// =====================================================================
export function spawnBand(eng: Engine): Entity[] {
  const m = eng.map, js = jazzSite(eng); if (!m || !js) return []
  const out: Entity[] = []
  const onStage = rt(eng).k >= 0 && rt(eng).phase !== 'walkOn'
  for (const who of JAZZ_WHO_LIST) {
    if (one(eng, who)) continue
    const sp = WS(eng, onStage ? js.play[who] : js.barAt[who])
    const e = makeEntity('jazz', sp.x, sp.y, floorHeight(m, sp.x, sp.y))
    e.facing = sp.f; e.state = 'idle'
    const s = ensureJazz(e, who)
    s.where = onStage || who === 'drum' ? 'stage' : 'bar'
    s.h = jazzFloorH(js, sp.x + off(eng).ox, sp.y + off(eng).oy)
    s.actT = rnd(1, 4)
    m.entities.push(e); out.push(e)
  }
  return out
}
function removeEnt(eng: Engine, e: Entity) { const m = eng.map; if (m) m.entities = m.entities.filter((x) => x !== e) }

/** 主更新（entityAI 分派） */
export function updateJazz(eng: Engine, e: Entity, dt: number) {
  const s = ensureJazz(e), r = rt(eng), p = eng.player
  if (e.presentationPending || JAZZ_QA.freeze) return
  e.state = 'idle'
  if (e.hp < e.def.hp) jazzKillGuard(eng, e)
  const js = jazzSite(eng)
  if (!js) { removeEnt(eng, e); return }
  s.modeT += dt; s.talkT = Math.max(0, s.talkT - dt)
  const pw = world(eng, e.x, e.y)
  s.h = jazzFloorH(js, pw.x, pw.y)
  s.mistFrom = null
  const show = r.k >= 0
  // —— [修] 告发后离场 ——
  if (s.leave) { leaveStep(eng, e, s, js, dt); return }
  // —— 走路中 ——
  if (s.mode === 'walk') { if (walkStep(eng, e, s, dt)) arrive(eng, e, s); return }
  if (show) {
    const at = WS(eng, js.play[s.who])
    // 不在站位上：先上台
    if (Math.hypot(at.x - e.x, at.y - e.y) > 0.3) { goTo(eng, e, js, at, 'stage'); return }
    e.facing = at.f
    // [修] 注视：你在观众区 / 台前附近就看你（演奏时渲染把幅度收小）；真吸魂：雾的源 = 你的胸口
    const dp = Math.hypot(p.x - e.x, p.y - e.y)
    s.lookAt = jazzInAudience(eng) || dp < JK.lookShowR ? eyeOf(eng) : null
    if (jazzSave(eng).reported && r.phase === 'finale' && dp < JK.lookShowR + 3) s.mistFrom = { x: p.x, y: p.y, z: (p.z ?? 0) + 1.15 }
    stepShowClip(eng, e, s)
    return
  }
  // —— 场间 / 打烊 ——
  const home = WS(eng, js.barAt[s.who])
  if (r.argue && s.who !== 'drum') {
    const sp = argueSpot(eng, js, s.who)
    if (Math.hypot(sp.x - e.x, sp.y - e.y) > 0.25) { goTo(eng, e, js, sp, 'floor'); return }
    e.facing = sp.f
    if (s.clip !== 'argueReconcile' && argueReady(eng, js)) { setMode(s, 'act', 'argueReconcile', 0.3) }
    else if (s.clip !== 'argueReconcile' && s.clip !== 'idleSway') setMode(s, 'idle', 'idleSway', 0.4)
    if (s.clip === 'argueReconcile' && s.modeT >= JAZZ_CLIP_LEN.argueReconcile) { r.argue = null; setMode(s, 'idle', 'idleSway', 0.4) }
    return
  }
  if (Math.hypot(home.x - e.x, home.y - e.y) > 0.3) { goTo(eng, e, js, home, s.who === 'drum' ? 'stage' : 'bar'); return }
  e.facing = home.f
  const d = Math.hypot(p.x - e.x, p.y - e.y)
  // 被搭话：转向你比划（鼓手接着弹琴）
  if (s.talkT > 0 && s.who !== 'drum') { s.lookAt = eyeOf(eng); if (s.clip !== 'talkGesture' && s.clip !== 'pointDirection' && s.clip !== 'leanFamiliar') setMode(s, 'act', 'talkGesture', 0.3); if (s.clip !== 'talkGesture' && s.modeT >= JAZZ_CLIP_LEN[s.clip]) setMode(s, 'act', 'talkGesture', 0.3); return }
  s.lookAt = d < JK.lookR ? eyeOf(eng) : null
  if (s.who === 'drum') { if (s.clip !== 'pianoPlay') setMode(s, 'act', 'pianoPlay', 0.5); return }
  // 萨克斯：你走近就凑过来「你看着面熟」（每个场间一次）
  if (s.who === 'sax' && !s.familiar && d < JK.familiarR && !jazzSave(eng).reported) { s.familiar = true; setMode(s, 'act', 'leanFamiliar', 0.3); jazzSay(eng, '……你看着面熟。我们见过吗？', JAZZ_NAME.sax, 3.5); return }
  // 吧台活动
  s.actT -= dt
  const cur = JAZZ_CLIP_LEN[s.clip]
  if (s.mode === 'act' && !LOOP.has(s.clip) && s.modeT < cur) return
  if (s.actT <= 0 || (s.mode === 'act' && !LOOP.has(s.clip) && s.modeT >= cur)) {
    s.actT = rnd(JK.barAct[0], JK.barAct[1])
    const pool: JazzClipId[] = s.who === 'bass' ? ['holdHead', 'drinkBeer', 'talkGesture', 'idleSway', 'glanceCamera'] : s.who === 'leader' ? ['drinkBeer', 'idleSway', 'talkGesture', 'glanceCamera'] : ['drinkBeer', 'idleSway', 'talkGesture']
    const c = pool[Math.floor(Math.random() * pool.length)]
    setMode(s, c === 'idleSway' ? 'idle' : 'act', c, 0.4)
  }
}
function stepShowClip(eng: Engine, e: Entity, s: JazzEntState) {
  const r = rt(eng)
  switch (r.phase) {
    case 'walkOn': if (s.clip !== 'idleSway') setMode(s, 'idle', 'idleSway', 0.4); return
    case 'tune': if (s.clip !== 'tuneUp') setMode(s, 'play', 'tuneUp', 0.3); return
    case 'set': {
      const solo = r.soloWho === s.who
      const want: JazzClipId = solo ? (s.who === 'leader' ? 'trumpetSolo' : 'saxSolo') : PLAY_CLIP[s.who]
      if (s.clip !== want || (!LOOP.has(want) && s.modeT >= JAZZ_CLIP_LEN[want])) setMode(s, 'play', want, 0.35)
      return
    }
    case 'finale': {
      // [修] 告发之后回来：真吸魂（专属片段 trueSoulSuck，雾从你身上被抽走）
      const suck: JazzClipId = jazzSave(eng).reported ? 'trueSoulSuck' : 'fakeSoulSuck'
      if (s.clip !== suck && s.clip !== 'glanceCamera') setMode(s, 'play', suck, 0.25); else if (s.modeT >= JAZZ_CLIP_LEN[s.clip]) setMode(s, 'play', r.busted ? 'glanceCamera' : suck, 0.2)
      return
    }
    case 'bow': if (s.clip !== 'bow') setMode(s, 'play', 'bow', 0.3); return
  }
  void e
}
// —— [修] 走路：网格寻路（0.25 m；台下按碰撞 canOccupy + 高脚凳 / 餐桌连椅子，台上离台边 / 幕布 / 钢琴 / 琴凳 / 谱架 / 台口柱，
//     台下 ↔ 台上只经台阶通道）+ 拉直；走的时候避让你：离你 < yieldGap 停下等、说一句「借过」，等一会儿绕路，绕不过去就侧身把你轻轻挤开 ——
export const eyeOf = (eng: Engine) => { const p = eng.player; return { x: p.x, y: p.y, z: (p.z ?? 0) + (p.crouching ? 1.05 : 1.55) } }
interface JazzGrid { key: string; map: unknown; x0: number; y0: number; nx: number; ny: number; c: number; ok: Uint8Array }
const GRID = new WeakMap<Engine, JazzGrid>()
/** 世界米：这一点（半径 JK.walkR 的人）乐手能不能站（静态：墙 / 实心结构 / 舞台边 / 道具） */
export function jazzWalkable(eng: Engine, js: JazzSite, wx: number, wy: number, r = JK.walkR): boolean {
  const m = eng.map; if (!m) return false
  if (jazzInSteps(js, wx, wy)) { /* 台阶通道 */ }
  else if (inTR(js.stage, wx, wy)) { if (!jazzOnStageOk(js, wx, wy, r)) return false }
  else { const q = W(eng, { x: wx, y: wy }); if (!canOccupy(m, q.x, q.y, r, { z: 0 })) return false }
  const O = jazzObstacles(js)
  for (const c of O.circles) if (Math.hypot(wx - c.x, wy - c.y) < c.r + r) return false
  for (const b of O.boxes) if (wx > b.x0 - r && wx < b.x1 + r && wy > b.y0 - r && wy < b.y1 + r) return false
  return true
}
function jazzGrid(eng: Engine, js: JazzSite): JazzGrid {
  const g0 = GRID.get(eng)
  if (g0 && g0.key === js.key && g0.map === eng.map) return g0
  const c = JK.gridC
  const x0 = Math.floor(Math.min(js.exit.out.x, js.aud.x0, js.bar.x0, js.argue.x) - 2), x1 = js.stage.x1 + 1
  const y0 = js.bar.y0, y1 = js.stage.y1 + 4
  const nx = Math.ceil((x1 - x0) / c), ny = Math.ceil((y1 - y0) / c)
  const ok = new Uint8Array(nx * ny)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) ok[j * nx + i] = jazzWalkable(eng, js, x0 + (i + 0.5) * c, y0 + (j + 0.5) * c) ? 1 : 0
  const g = { key: js.key, map: eng.map, x0, y0, nx, ny, c, ok }
  GRID.set(eng, g)
  return g
}
type Pt = { x: number; y: number }
/** 世界米寻路 a → b（避开 avoid 圆）；返回拉直后的路点（不含 a，含 b）；找不到 = null */
export function jazzPlan(eng: Engine, js: JazzSite, a: Pt, b: Pt, avoid: { x: number; y: number; r: number }[] = []): Pt[] | null {
  const G = jazzGrid(eng, js), { nx, ny, c } = G
  const cell = (p: Pt) => ({ i: Math.floor((p.x - G.x0) / c), j: Math.floor((p.y - G.y0) / c) })
  const inG = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny
  const ctr = (i: number, j: number) => ({ x: G.x0 + (i + 0.5) * c, y: G.y0 + (j + 0.5) * c })
  const free = (i: number, j: number) => { if (!inG(i, j) || !G.ok[j * nx + i]) return false; const q = ctr(i, j); for (const o of avoid) if (Math.hypot(q.x - o.x, q.y - o.y) < o.r) return false; return true }
  const snap = (p: Pt) => { const c0 = cell(p); let best: { i: number; j: number } | null = null, bd = 1e9; for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const i = c0.i + di, j = c0.j + dj; if (!free(i, j)) continue; const q = ctr(i, j), d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = { i, j } } } return best }
  const s0 = cell(a), g0 = cell(b)
  if (!inG(s0.i, s0.j) || !inG(g0.i, g0.j)) return null
  const S = free(s0.i, s0.j) ? s0 : snap(a), T = free(g0.i, g0.j) ? g0 : snap(b)
  if (!S || !T) return null
  const N = nx * ny, gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N)
  const si = S.j * nx + S.i, ti = T.j * nx + T.i
  gs[si] = 0
  const open: number[] = [si], h = (k: number) => Math.hypot((k % nx) - T.i, Math.floor(k / nx) - T.j)
  let found = false
  while (open.length) {
    let bi = 0, bf = Infinity
    for (let q = 0; q < open.length; q++) { const f = gs[open[q]] + h(open[q]); if (f < bf) { bf = f; bi = q } }
    const k = open[bi]; open[bi] = open[open.length - 1]; open.pop()
    if (k === ti) { found = true; break }
    if (closed[k]) continue
    closed[k] = 1
    const i = k % nx, j = Math.floor(k / nx)
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue
      const ii = i + di, jj = j + dj
      if (!free(ii, jj) || (di && dj && (!free(i + di, j) || !free(i, j + dj)))) continue
      const kk = jj * nx + ii, ng = gs[k] + (di && dj ? Math.SQRT2 : 1)
      if (ng < gs[kk]) { gs[kk] = ng; from[kk] = k; open.push(kk) }
    }
  }
  if (!found) return null
  const cells: Pt[] = []
  for (let k = ti; k !== -1; k = from[k]) cells.push(ctr(k % nx, Math.floor(k / nx)))
  cells.reverse()
  // 拉直：沿网格查视线（每 0.1 m 一个采样都得是可走格、不在 avoid 圆里）
  const clear = (p: Pt, q: Pt) => { const L = Math.hypot(q.x - p.x, q.y - p.y), n = Math.max(1, Math.ceil(L / 0.1)); for (let t = 0; t <= n; t++) { const x = p.x + (q.x - p.x) * t / n, y = p.y + (q.y - p.y) * t / n; const cc = cell({ x, y }); if (!free(cc.i, cc.j)) return false } return true }
  const out: Pt[] = []
  let cur: Pt = a
  let k0 = 0
  while (k0 < cells.length) {
    let far = k0
    for (let k = cells.length - 1; k > k0; k--) if (clear(cur, cells[k])) { far = k; break }
    cur = cells[far]; out.push(cur); k0 = far + 1
  }
  out.push({ x: b.x, y: b.y })
  return out
}
function setRoute(eng: Engine, s: JazzEntState, worldPts: Pt[]) { const { ox, oy } = off(eng); s.route = worldPts.map((q) => ({ x: q.x - ox, y: q.y - oy })); s.ri = 0 }
function playerAvoid(eng: Engine): { x: number; y: number; r: number }[] { const p = world(eng, eng.player.x, eng.player.y); return [{ x: p.x, y: p.y, r: JK.yieldGap + JK.routeAvoid * 0.25 }] }
function goTo(eng: Engine, e: Entity, js: JazzSite, at: Spot, where: JazzEntState['where']) {
  const s = ensureJazz(e), { ox, oy } = off(eng)
  const here = { x: e.x + ox, y: e.y + oy }
  const target = { x: at.x + ox, y: at.y + oy }
  let pts = jazzPlan(eng, js, here, target, playerAvoid(eng))
  if (pts && Math.hypot(eng.player.x - e.x, eng.player.y - e.y) < 10) {
    // 记一下：你本来就站在直路上 → 这条是绕开你的路
    const plain = jazzPlan(eng, js, here, target)
    if (plain) { const tmp = { ...s, route: plain.map((q) => ({ x: q.x - ox, y: q.y - oy })), ri: 0 }; if (routeNearPlayer(eng, e, tmp, JK.yieldGap + 0.15)) rt(eng).yieldN.detour++ }
  }
  pts ??= jazzPlan(eng, js, here, target)
  if (!pts) {
    // 兜底（不在这片网格里）：旧的台阶路点
    const onStage = inTR(js.stage, here.x, here.y), tOn = inTR(js.stage, target.x, target.y)
    pts = []
    if (onStage && !tOn) pts.push(js.stepTop, js.stepFoot)
    if (!onStage && tOn) pts.push(js.stepFoot, js.stepTop)
    pts.push(target)
  }
  setRoute(eng, s, pts); s.goal = at; s.speed = JK.walkSpeed; s.where = where
  s.wait = 0; s.yieldSaid = false; s.replanned = false; s.replanT = 0.4; s.nudged = false
  setMode(s, 'walk', 'walk', 0.3)
}
const YIELD_LINE: Record<JazzWho, string> = { leader: '借过，孩子——乐手上下台。', sax: '劳驾，让一让，我的键怕磕。', bass: '小心——这颗头可不好转身。借过。', drum: '借过借过，钢琴等着我呢。' }
function routeNearPlayer(eng: Engine, e: Entity, s: JazzEntState, r: number): boolean {
  const p = eng.player
  let a = { x: e.x, y: e.y }
  for (let i = s.ri; i < s.route.length; i++) {
    const b = s.route[i], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0, 1)
    if (Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y) < r) return true
    a = b
  }
  return false
}
function replan(eng: Engine, e: Entity, s: JazzEntState): boolean {
  const js = jazzSite(eng); if (!js || !s.goal) return false
  const { ox, oy } = off(eng)
  const pts = jazzPlan(eng, js, { x: e.x + ox, y: e.y + oy }, { x: s.goal.x + ox, y: s.goal.y + oy }, playerAvoid(eng))
  if (!pts) return false
  setRoute(eng, s, pts)
  return true
}
/** 挡路太久：侧身把你轻轻挤到路边（带碰撞；挤的方向 = 你在他前进方向的哪一侧就往哪侧） */
function nudgePlayer(eng: Engine, e: Entity, s: JazzEntState, dt: number) {
  const p = eng.player, m = eng.map; if (!m) return
  const q = s.route[s.ri] ?? { x: e.x + Math.cos(e.facing), y: e.y + Math.sin(e.facing) }
  let hx = q.x - e.x, hy = q.y - e.y; const hl = Math.hypot(hx, hy) || 1; hx /= hl; hy /= hl
  const side = Math.sign((p.x - e.x) * -hy + (p.y - e.y) * hx) || 1
  const v = JK.nudgeV * dt
  for (const [dx, dy] of [[-hy * side, hx * side], [hy * side, -hx * side], [hx, hy]] as [number, number][]) {
    const nx = p.x + dx * v, ny = p.y + dy * v
    if (canOccupy(m, nx, ny, PLAYER_RADIUS, { z: p.z ?? 0 }) && Math.hypot(nx - e.x, ny - e.y) >= Math.hypot(p.x - e.x, p.y - e.y) - 1e-6) { p.x = nx; p.y = ny; break }
  }
  if (!s.nudged) { s.nudged = true; rt(eng).yieldN.nudge++; eng.msg(`${JAZZ_NAME[s.who]}侧过身，${s.who === 'bass' ? '用琴身' : '用肩膀'}轻轻把你挤到一边。`, 'system') }
}
function walkStep(eng: Engine, e: Entity, s: JazzEntState, dt: number): boolean {
  const q = s.route[s.ri]; if (!q) return true
  const p = eng.player, r = rt(eng)
  const dx = q.x - e.x, dy = q.y - e.y, d = Math.hypot(dx, dy)
  const want = Math.atan2(dy, dx)
  // 注视：路过你（前方 5 m 内）就看你
  const pd = Math.hypot(p.x - e.x, p.y - e.y), pa = Math.abs(wrap(Math.atan2(p.y - e.y, p.x - e.x) - e.facing))
  s.lookAt = pd < JK.lookR && pa < 1.9 ? eyeOf(eng) : null
  // 隔一会儿看看你是不是站到了路线上：是就绕开（路线离你 < yieldGap + routeAvoid）
  s.replanT -= dt
  if (s.replanT <= 0) { s.replanT = 0.4; if (pd < 6 && routeNearPlayer(eng, e, s, JK.yieldGap + 0.15) && replan(eng, e, s)) r.yieldN.replan++ }
  const q2 = s.route[s.ri]; if (!q2) return true
  const dx2 = q2.x - e.x, dy2 = q2.y - e.y, d2 = Math.hypot(dx2, dy2), want2 = Math.atan2(dy2, dx2)
  e.facing += clamp(wrap(want2 - e.facing), -4 * dt, 4 * dt)
  const step = Math.min(d2, s.speed * dt * (Math.abs(wrap(want2 - e.facing)) > 1.2 ? 0.3 : 1))
  const nx = d2 > 1e-4 ? e.x + (dx2 / d2) * step : e.x, ny = d2 > 1e-4 ? e.y + (dy2 / d2) * step : e.y
  // 避让：这一步会让他离你 < yieldGap（而且是在靠近你）→ 停下等
  const pn = Math.hypot(nx - p.x, ny - p.y)
  if (pn < JK.yieldGap && pn <= pd + 1e-6 && step > 1e-5) {
    if (s.wait === 0) r.yieldN.wait++
    s.wait += dt; s.lookAt = eyeOf(eng)
    if (s.clip !== 'idleSway') setClip(s, 'idleSway', 0.3)
    if (!s.yieldSaid) { s.yieldSaid = true; jazzSay(eng, YIELD_LINE[s.who], JAZZ_NAME[s.who], 3) }
    if (s.wait > JK.yieldReplan && !s.replanned) { s.replanned = true; if (replan(eng, e, s)) { r.yieldN.replan++; s.wait = 0.001; return false } }
    if (s.wait > JK.nudgeAfter) nudgePlayer(eng, e, s, dt)
    return false
  }
  if (s.wait > 0) { s.wait = 0; s.replanned = false }
  if (s.clip !== 'walk') setClip(s, 'walk', 0.3)
  e.x = nx; e.y = ny
  void d; void want
  if (d2 - step < 0.05) { s.ri++; if (s.ri >= s.route.length) return true }
  return false
}
function arrive(eng: Engine, e: Entity, s: JazzEntState) {
  const g = s.goal
  if (g) { e.x = g.x; e.y = g.y; e.facing = g.f }
  s.route = []; s.ri = 0; s.goal = null; s.wait = 0
  setMode(s, 'idle', 'idleSway', 0.4)
  void eng
}
/** [修] 告发后离场：收拾（packUp：瞪你、摇头、收谱）→ 依次下台（台阶）→ 走到后场门口 → 穿门出去（实体收起） */
function leaveStep(eng: Engine, e: Entity, s: JazzEntState, js: JazzSite, dt: number) {
  const L = s.leave!
  if (L.phase === 'pack') {
    s.lookAt = eyeOf(eng)
    if (s.clip !== 'packUp') setMode(s, 'act', 'packUp', 0.3)
    if (s.modeT >= JAZZ_CLIP_LEN.packUp + L.delay) { L.phase = 'walk'; goTo(eng, e, js, WS(eng, { x: js.exit.out.x, y: js.exit.out.y, f: -Math.PI / 2 }), 'floor') }
    return
  }
  if (s.mode === 'walk') {
    if (walkStep(eng, e, s, dt)) {
      if (L.phase === 'walk') { L.phase = 'door'; const dw = W(eng, js.exit.door); s.route = [dw]; s.ri = 0; s.goal = { x: dw.x, y: dw.y, f: -Math.PI / 2 }; setMode(s, 'walk', 'walk', 0.2) }
      else removeEnt(eng, e)
    }
    return
  }
  // 被打断（没在走）：重新出发
  goTo(eng, e, js, WS(eng, { x: js.exit.out.x, y: js.exit.out.y, f: -Math.PI / 2 }), 'floor'); L.phase = 'walk'
}
/** 吵架劝和：头儿站在 js.argue，萨克斯 / 低音提琴按 jazzAnim JAZZ_ARGUE 在他 root 空间 [0.40, 0.55] 朝 −X / [−0.42, 0.55] 朝 +X */
export function argueSpot(eng: Engine, js: JazzSite, who: JazzWho): Spot {
  const L = js.argue
  if (who === 'leader') return WS(eng, L)
  const rx = who === 'sax' ? 0.4 : -0.42, rz = 0.55
  const w = jazzFromRoot({ x: L.x, y: L.y, facing: L.f }, rx, rz)
  // root −X 方向（萨克斯朝向）= facing − π/2 方向？root +X = 角色左侧 = facing − π/2（地图 y 向下）
  const f = who === 'sax' ? L.f + Math.PI / 2 : L.f - Math.PI / 2
  return WS(eng, { x: w.x, y: w.y, f })
}
function argueReady(eng: Engine, js: JazzSite) {
  return (['leader', 'sax', 'bass'] as JazzWho[]).every((w) => { const e = one(eng, w); if (!e) return false; const sp = argueSpot(eng, js, w); return Math.hypot(sp.x - e.x, sp.y - e.y) < 0.3 && e.jz?.mode !== 'walk' })
}
/** 场间开始时（低概率）三人吵一架、被头儿劝和 */
export function jazzStartArgue(eng: Engine) { rt(eng).argue = { t: 40 } }

// =====================================================================
// 交互（X）：搭话 / 点歌 / 要辣椒酱 / 告发
// =====================================================================
type JazzAct = { act: 'talk'; e: Entity } | { act: 'request'; e: Entity } | { act: 'report'; via: 'cctv' | 'beast' }
export function jazzAct(eng: Engine): JazzAct | null {
  if (!inL5(eng)) return null
  const js = jazzSite(eng); if (!js) return null
  const r = rt(eng), sv = jazzSave(eng), p = eng.player
  if (r.leave) return null // [修] 正在收拾离场
  // 告发：监控下 / 后排老板身边（知道把戏之后）
  if (!sv.reported && sv.sawFinale) {
    const c = W(eng, { x: js.cctv.x - 0.6, y: js.cctv.y + 1.6 })
    if (Math.hypot(c.x - p.x, c.y - p.y) < JK.reportR) return { act: 'report', via: 'cctv' }
    const b = findBeast(eng); if (b && beastInAudience(eng) && Math.hypot(b.x - p.x, b.y - p.y) < JK.reportR) return { act: 'report', via: 'beast' }
  }
  // 演出中：台口 X = 点歌（萨克斯）
  if (r.k >= 0 && (r.phase === 'set' || r.phase === 'tune') && !sv.reported) {
    const sx = one(eng, 'sax'); if (sx) { const edge = W(eng, { x: js.stage.x0 - 0.6, y: js.play.sax.y }); if (Math.hypot(edge.x - p.x, edge.y - p.y) < 1.6) return { act: 'request', e: sx } }
    return null
  }
  if (r.k >= 0) return null
  // 场间：搭话（最近的一位）
  let best: Entity | null = null, bd = JK.talkR
  for (const e of findJazz(eng)) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd && e.jz?.mode !== 'walk') { bd = d; best = e } }
  return best ? { act: 'talk', e: best } : null
}
export function jazzSpecial(eng: Engine): SpecialAction | null {
  const a = jazzAct(eng); if (!a) return null
  const sv = jazzSave(eng)
  switch (a.act) {
    case 'talk': { const w = a.e.jz!.who; return { id: 'jazz-talk', label: `和${JAZZ_NAME[w]}搭话`, hint: sv.reported ? '他们不太想理你。' : w === 'sax' ? '「你点名，我来吹。」' : w === 'bass' ? '他手边有一瓶哈瓦那辣椒酱。' : w === 'drum' ? '他在弹钢琴。' : '头儿端着一杯温啤酒。', hold: false } }
    case 'request': return { id: 'jazz-request', label: '向萨克斯点歌', hint: '「你点名，我来吹。」下一首就是你点的。', hold: false }
    case 'report': return { id: 'jazz-report', label: a.via === 'cctv' ? '对着监控揭穿乐队' : '告诉老板他们在装', hint: `按住 ${JK.reportHold} 秒。老板会记你一功；乐队就不再是原来的乐队了。`, hold: true }
  }
}
export function jazzPress(eng: Engine): boolean {
  if (!eng.specialPressed) return false
  const a = jazzAct(eng); if (!a || a.act === 'report') return false
  eng.specialPressed = false
  if (a.act === 'request') return jazzOpenMenu(eng)
  return jazzTalk(eng, a.e)
}
export function jazzTalk(eng: Engine, e: Entity): boolean {
  const r = rt(eng), sv = jazzSave(eng), s = ensureJazz(e)
  if (r.talkCd > 0) return false
  r.talkCd = JK.talkCd; sv.n.talk++; meet(eng)
  s.talkT = 4.5
  const who = s.who
  if (sv.reported) { const pool = COLD[who]; jazzSay(eng, pool[Math.floor(Math.random() * pool.length)], JAZZ_NAME[who], 3.5); return true }
  // 私下对话：解锁后每人第一次都先说线索
  if (sv.priv) {
    const pool = PRIVATE[who]
    let line = pool[Math.floor(Math.random() * pool.length)]
    if (!sv.clue) { const c = pool.find((l) => l.includes(EXIT_CLUE)); if (c) { line = c; sv.clue = 1 } }
    if (line.includes(EXIT_CLUE) && who !== 'drum') setMode(s, 'act', 'pointDirection', 0.3)
    jazzSay(eng, line, JAZZ_NAME[who], 5)
    if (line.includes(EXIT_CLUE)) eng.msg(`${JAZZ_NAME[who]}压低声音：「${EXIT_CLUE}。」`, 'lore')
  } else { const pool = TALK[who]; jazzSay(eng, pool[Math.floor(Math.random() * pool.length)], JAZZ_NAME[who], 4.5) }
  // 萨克斯：点歌菜单；低音提琴：送辣椒酱
  if (who === 'sax') jazzOpenMenu(eng)
  if (who === 'bass' && sv.favor >= JK.sauceFavor && sv.sauceCd <= 0) {
    sv.sauceCd = JK.sauceCd; sv.n.sauce++
    give(eng, 'habanero')
    jazzSay(eng, '拿着。哈瓦那的。抹在什么上都行——别抹在厨子的菜上，他会哭的。', JAZZ_NAME.bass, 4.5)
    eng.msg('低音提琴手塞给你一小瓶哈瓦那辣椒酱。', 'system')
    rel(eng, 2)
  }
  return true
}
/** [修] 点歌菜单：按项目惯例做成覆盖层（App overlay 'jazzmenu'，同 BeastDeal / GreeterInvite）——打开即暂停游戏；
 *  菜单自己处理 1–5 / 小键盘 1–5 / 鼠标 / 触屏点选、Esc 关；关掉以后数字键照常切快捷栏（不再在 window 捕获阶段截获按键） */
export function jazzOpenMenu(eng: Engine): boolean { const sv = jazzSave(eng); if (sv.reported) return false; rt(eng).menu = 1; audio.uiTick(); eng.emit({ kind: 'jazzmenu' }); return true }
export function jazzCloseMenu(eng: Engine) { rt(eng).menu = 0 }
export function jazzMenuOpen(eng: Engine): boolean { return !!RT.get(eng)?.menu }
export function jazzMenuView(eng: Engine): { songs: { name: string; style: string; buff: string }[]; during: boolean } | null {
  const r = RT.get(eng); if (!r?.menu) return null
  return { songs: JAZZ_SONGS.map((x) => ({ name: x.name, style: x.style, buff: x.buff })), during: r.k >= 0 }
}
/** 点歌：下一首就吹（演出中 = 下一首；场间 = 下一场第一首） */
export function jazzRequest(eng: Engine, i: number): boolean {
  const r = rt(eng), sv = jazzSave(eng)
  if (sv.reported || i < 0 || i >= JAZZ_SONGS.length) return false
  r.request = i; r.menu = 0; sv.n.request++
  if (r.k >= 0 && r.phase === 'set') r.pieceT = Math.max(r.pieceT, r.pieceLen - 3) // 这一首收个尾，下一首就是你的
  jazzSay(eng, `「${JAZZ_SONGS[i].name}」？好眼光。${r.k >= 0 ? '下一首。' : '下一场开场就吹。'}`, JAZZ_NAME.sax, 4)
  rel(eng, 1)
  audio.uiTick()
  return true
}
/** 告发：老板记你一功，乐队被叫走，回来以后吸魂是真的 */
export function jazzReport(eng: Engine): boolean {
  const sv = jazzSave(eng), p = eng.player
  if (sv.reported) return false
  sv.reported = 1; sv.goneT = JK.reportGone; sv.n.report++; sv.priv = 0; sv.favor = -100; eng.hotel.staff.jazz = -100
  hotelSetAttn(eng, eng.hotel.attn - JK.reportAttnCut)
  const bs = beastSave(eng); bs.strikes = Math.max(0, bs.strikes - JK.reportStrike)
  p.sanity = Math.min(100, p.sanity + JK.reportSan)
  const r = rt(eng)
  r.menu = 0
  // [修] 不再直接收起：四人一齐转向你、瞪着你摇头，收起谱架上的乐谱（packUp），然后依次下台、从后场门（弹簧门）出去
  const band = findJazz(eng)
  band.forEach((e, i) => { const s = ensureJazz(e); s.leave = { phase: 'pack', delay: i * JK.leaveStagger }; s.route = []; s.goal = null; setMode(s, 'act', 'packUp', 0.25) })
  r.leave = band.length ? { t: 0 } : null
  beastSay(eng, '谢谢你告诉我。我会和他们好好谈谈。', 3.4, true)
  jazzSay(eng, '台上四个人一齐看向你。小号头儿摇了摇头，开始收拾谱架。', '', 5, true)
  eng.msg('你揭穿了爵士乐队的把戏。酒店好像对你温和了一点——乐队收拾东西，被叫走了。', 'lore')
  audio.hotelScratch?.(0.6)
  return true
}

// =====================================================================
// 物品：哈瓦那辣椒酱
// =====================================================================
export function jazzUseItem(eng: Engine, type: string): boolean {
  if (type !== 'habanero') return false
  const sv = jazzSave(eng), p = eng.player
  let took = false
  for (const arr of [eng.player.hotbar, eng.player.backpack]) { if (took) break; for (let i = 0; i < arr.length; i++) { const sl = arr[i]; if (sl?.type === 'habanero') { if ((sl.count ?? 1) > 1) sl.count--; else arr[i] = null; took = true; break } } }
  if (!took) return false
  eng.syncPassives?.()
  p.stamina = Math.min(100, p.stamina + JK.sauceStam); p.sanity = Math.min(100, p.sanity + JK.sauceSan); p.thirst = Math.max(0, p.thirst - JK.sauceThirst)
  sv.sauceT = JK.sauceWarmT
  const ch = (eng.hotel as { chef?: { addictT: number } }).chef
  const hadCrave = !!ch && ch.addictT > 0
  if (ch) ch.addictT = Math.max(0, ch.addictT - JK.sauceCut)
  audio.uiTick()
  eng.msg(hadCrave ? '辣得你眼泪都出来了。浑身发热——那份「再来一份」的念头被烧得一干二净。' : '辣得你眼泪都出来了。浑身发热，脑子清醒了不少。', 'lore')
  jazzSay(eng, '……好辣。', '', 2.5)
  return true
}
export function jazzMoveMul(eng: Engine): number {
  const r = RT.get(eng); if (!r || !r.wasIn || r.k < 0) return 1
  const sv = jazzSave(eng)
  if (sv.buff >= 0 && JAZZ_SONGS[sv.buff].key === 'feet') return SONG_BUFF.feet
  return JK.stayMove
}
/** 打不死：挨打只让他们很失望 */
export function jazzKillGuard(eng: Engine, e: Entity): boolean {
  if (e.def.type !== 'jazz') return false
  e.hp = e.def.hp; e.dead = false
  const sv = jazzSave(eng)
  sv.n.hit++; rel(eng, -JK.hitFavor)
  const s = ensureJazz(e)
  if (s.mode !== 'walk' && rt(eng).k < 0) setMode(s, 'act', 'glanceCamera', 0.2)
  jazzSay(eng, s.who === 'bass' ? '嘿！这颗头已经够沉了！' : s.who === 'leader' ? '四十七年，没人敢打乐手。' : s.who === 'sax' ? '我的键！' : '……别碰鼓。', JAZZ_NAME[s.who], 3)
  return true
}

// =====================================================================
// 音乐：按声部空间化（core/audio.jazzBand）
// =====================================================================
export interface JazzPart { g: number; pan: number }
export interface JazzAudioView {
  song: number; mode: 'set' | 'tune' | 'finale' | 'bow' | 'break' | 'walkOn'
  solo: 'leader' | 'sax' | null; real: boolean
  parts: { leader: JazzPart; sax: JazzPart; bass: JazzPart; drum: JazzPart; piano: JazzPart }
  duck: number
}
export function jazzPartGain(eng: Engine, x: number, y: number): JazzPart {
  const p = eng.player, dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy)
  if (d > JK.audMax) return { g: 0, pan: 0 }
  let g = 1 / (1 + Math.pow(d / JK.audRef, JK.audPow))
  if (d > 1.5 && chefZone(eng) !== 'dining' && !eng.los(p.x, p.y, x, y)) g *= JK.occl // 同在餐厅里不算隔墙（舞台本身是实心格）
  const a = wrap(Math.atan2(dy, dx) - p.facing)
  return { g, pan: d < 0.6 ? 0 : clamp(Math.sin(a), -1, 1) * 0.85 }
}
let lastView: JazzAudioView | null = null
export const jazzAudioView = () => lastView
function stepAudio(eng: Engine, js: JazzSite, band: Entity[]) {
  const r = rt(eng), sv = jazzSave(eng)
  if (!band.length) { lastView = null; audio.jazzBand?.(null); return }
  const pos = (who: JazzWho) => { const e = band.find((b) => b.jz?.who === who); return e ? { x: e.x, y: e.y } : W(eng, js.play[who]) }
  const piano = W(eng, { x: js.piano.ox, y: js.piano.oy })
  const mode: JazzAudioView['mode'] = r.k < 0 ? 'break' : r.phase === 'none' ? 'break' : r.phase
  const parts = { leader: jazzPartGain(eng, pos('leader').x, pos('leader').y), sax: jazzPartGain(eng, pos('sax').x, pos('sax').y), bass: jazzPartGain(eng, pos('bass').x, pos('bass').y), drum: jazzPartGain(eng, pos('drum').x, pos('drum').y), piano: jazzPartGain(eng, piano.x, piano.y) }
  // 场间只有钢琴（鼓手在弹），其余声部静音
  if (mode === 'break') { parts.leader.g = parts.sax.g = parts.bass.g = parts.drum.g = 0; const dr = band.find((b) => b.jz?.who === 'drum'); if (!dr || dr.jz?.clip !== 'pianoPlay') parts.piano.g = 0; else parts.piano.g *= 0.8 }
  else parts.piano.g *= 0.55 // 演出时钢琴只是轻轻垫和弦（鼓手在打鼓——这是录在「乐器头」里的余音）
  const near = Math.max(parts.leader.g, parts.sax.g, parts.bass.g, parts.drum.g, parts.piano.g)
  lastView = { song: r.song, mode, solo: r.k >= 0 && r.phase === 'set' ? r.soloWho as 'leader' | 'sax' | null : null, real: !!sv.reported, parts, duck: clamp(near * 1.6, 0, 0.85) }
  audio.jazzBand?.(lastView)
}

// =====================================================================
// HUD
// =====================================================================
export interface JazzHudView {
  subs: { text: string; who: string }[]
  show: { k: number; phase: ShowPhase; prog: number; song: string; style: string; solo: string | null; listen: boolean; real: boolean } | null
  fake: { sus: number; comply: boolean; beast: boolean } | null
  menu: { songs: { name: string; style: string; buff: string }[] } | null
  /** [修] 真吸魂的画面压暗 / 发冷 0..1；告发后离场中 */
  grade: number; leaving: boolean
  report: number
  buff: { name: string; buff: string; left: number } | null
  sauce: number
  next: string | null
}
export function jazzHud(eng: Engine): JazzHudView | null {
  const r = RT.get(eng); if (!r) return null
  const sv = jazzSave(eng)
  const inHall = inL5(eng) && !!jazzSite(eng) && jazzInHallish(eng)
  const onShow = inHall && r.k >= 0 && r.phase !== 'none'
  const moving = r.pv > JK.stillV, down = look.pitch < JK.headDown
  const v: JazzHudView = {
    subs: r.subs.map((s) => ({ text: s.text, who: s.who })),
    show: onShow ? { k: r.k, phase: r.phase, prog: clamp(r.showT / JK.showLen, 0, 1), song: JAZZ_SONGS[r.song].name, style: JAZZ_SONGS[r.song].style, solo: r.soloWho ? JAZZ_NAME[r.soloWho] : null, listen: r.wasIn, real: !!sv.reported } : null,
    fake: onShow && r.phase === 'finale' && r.wasIn && !sv.reported && !r.busted ? { sus: clamp(r.sus / JK.susBust, 0, 1), comply: !moving && down, beast: beastInAudience(eng) } : null,
    menu: r.menu > 0 && inL5(eng) ? { songs: JAZZ_SONGS.map((s) => ({ name: s.name, style: s.style, buff: s.buff })) } : null,
    grade: r.grade, leaving: !!r.leave,
    report: r.reportT / JK.reportHold,
    buff: sv.buff >= 0 ? { name: JAZZ_SONGS[sv.buff].name, buff: JAZZ_SONGS[sv.buff].buff, left: sv.buffT } : null,
    sauce: sv.sauceT / JK.sauceWarmT,
    next: inHall && r.k < 0 && !(sv.reported && sv.goneT > 0) ? jazzNextShowText(eng).replace('今晚在餐厅：爵士脑乐队，', '下一场：').replace('！四位乐手，绝无危险！', '') : null,
  }
  if (!v.subs.length && !v.show && !v.menu && !v.buff && v.sauce <= 0 && !v.next && v.report <= 0 && v.grade <= 0.01) return null
  return v
}
void hasT
