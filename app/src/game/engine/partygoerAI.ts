// 派对客（Entity 67「Partygoers =)」）专属 AI——依据中文维基 https://backrooms-wiki-cn.wikidot.com/entity-67
// 与用户确认的设计（见 app/PARTYGOER-REMAKE.md）：
//  · 群体：永不落单，2–4 只一群；彼此有视线的同伴之间「心灵感应」共享目标（维基：精神交流基于视觉，
//    必须把目光集中在接收者身上）；追击时按各自的包抄角分头逼近。
//  · 近视且慢：视距 6m，以听觉为主；追击速度略低于玩家奔跑，拉开距离或绕开障碍就能脱身。
//  · 假装办派对：未被激怒时友善靠近、挥手、递蛋糕；进入 2.4m 后暴起（提示文字为派对客专属）。
//  · 心灵低语：派对客注视着玩家时，偶尔弹出「熟人的声音」台词（结尾带 =)）。
//  · 攻击：面条臂（七鳃鳗吸盘口）抓住并咬，咬中增加转化值；狂战士形态改用恐惧蜈蚣爪臂快速连续抓挠。
//  · 防御：皮肤抗切割/穿刺（胸甲闭合时躯体减伤 90%），防火，免疫电击（法拉第笼）。
//  · 击杀顺序（严格）：① 打断两条面条臂（各自独立血量）→ 无法再转化玩家，进入狂战士形态、胸甲弹开；
//    ② 胸口打开后头/脸成为弱点，打到阈值倒地静止；③ 静止的「尸体」不处理就面朝下靠蜈蚣步足慢慢爬走，
//    一段时间后复苏；只有火盐晶体 / 火油桶（现有物品，复用投掷爆炸逻辑）能把它烧尽——黑烟、硫磺味。
//  · 转化：每咬一口增加转化值，不会自然消退、没有解药；转化值升高时痛觉减弱、视距缩短；满值即「加入派对」
//    死亡，并在原地生成一只新的派对客。转化值是引擎字段 eng.partyConv，只存在当局内存里，不写进存档。
// 运行时状态挂在 e.pg（不入存档/联机），与肢团 e.cl、猎犬 e.hd 同一范式。
import { audio } from '../core/audio'
import { makeEntity, type Entity } from '../entities'
import type { Engine } from '../engine'
import { partygoerLook, partyHash, type PartygoerColor } from '../entities/partygoerLook'

/** 关键规则常量（验收脚本 check:partygoers 直接读取） */
export const PARTY = {
  SIGHT: 6, // 近视：视距（米）
  HEAR: 7, // 普通脚步声的听觉半径上限（米）；蹲行几乎听不见，奔跑声 ≈10.5m
  FEIGN_RANGE: 2.4, // 假装友善 → 暴起的距离
  FRIENDLY_SPEED: 1.5, // 假装友善地走近（米/秒）
  CHASE_SPEED: 4.6, // 追击（玩家奔跑 6.0、步行 3.4）
  BERSERK_SPEED: 5.1, // 狂战士形态略快，仍跑不过奔跑的玩家
  ROAM_SPEED: 1.0,
  TELEPATHY_RANGE: 16, // 心灵感应（需要互相有视线）
  LOSE_T: 7, // 多久没有新信息就转入搜寻
  CALM_T: 22, // 搜寻多久无果后恢复「派对」伪装（被攻击过的个体不会）
  // 面条臂抓咬
  ARM_HP: 26, // 每条面条臂的独立血量（最薄弱的部位）
  BITE_RANGE: 1.7, // 开始抓咬的距离
  BITE_REACH: 1.95, // 判定距离
  BITE_WINDUP: 0.42, BITE_T: 0.36, BITE_CD: 1.5,
  BITE_DAMAGE: 0.55, // × def.damage
  BITE_CONV: 20, // 每咬一口增加的转化值（满 100 即加入派对）
  // 狂战士：恐惧蜈蚣爪臂
  CLAW_RANGE: 1.6, CLAW_REACH: 1.8, CLAW_T: 0.9, CLAW_HITS: [0.14, 0.4, 0.66] as readonly number[], CLAW_DAMAGE: 12, CLAW_CD: 0.65,
  // 防御
  CHEST_DR: 0.9, // 胸甲闭合：躯体（含头部）减伤 90%
  CLOSED_HP_FLOOR: 0.6, // 胸甲闭合时躯体血量不会低于 60%（只有先断臂才能继续）
  OPEN_BODY_MULT: 0.35, // 狂战士：躯干仍有皮革保护
  HEAD_MULT: 1.6, // 狂战士：头/脸是弱点
  // 倒地 → 爬走 → 复苏
  DOWN_T: 6, // 静止
  REVIVE_T: 36, // 从倒地起算的复苏时间
  CRAWL_SPEED: 0.42,
  REVIVE_HP: 0.45,
  BURN_T: 2.6, BURN_RADIUS: 3.2,
  // 转化
  CONV_MAX: 100,
  CAKE_CONV: 30, // 「丝绒蛋糕」
  WHISPER_CD: [10, 18] as readonly number[],
} as const

export type PartyPhase = 'party' | 'hunt' | 'search' | 'windup' | 'bite' | 'claw' | 'down' | 'crawl' | 'burn'
export interface PartyState {
  phase: PartyPhase
  t: number
  color: PartygoerColor
  intern: boolean
  balloon: boolean // 气球仍拴在面条臂上
  balloonArm: 0 | 1
  balloonFly: number // 气球飞走后的秒数（0 = 没有飞走）
  armHp: [number, number]
  berserk: boolean
  lastX: number; lastY: number // 最后得知的玩家位置（世界坐标）
  heardT: number // 距最后一次得知玩家位置（看见/听见/心灵感应）的秒数
  seeT: number // 本只亲眼看见玩家后经过的秒数
  shareT: number // 心灵感应收到信息后经过的秒数（渲染：头部微转）
  calmT: number // 搜寻计时
  flank: number // 包抄角（弧度）
  downT: number // 倒地后的累计时间
  burned: boolean
  hitT: number // 受击后经过的秒数（渲染：抖动）
  speed: number // 本帧移动速度（米/秒；渲染步态）
  // 渲染姿态量 0..1
  gait: number; wave: number; offer: number; reach: number; bite: number; open: number; claw: number
  down: number; crawl: number; burn: number
  armCut: [number, number] // 面条臂断裂动画 0→1
}

/** 引擎替身也可用的最小字段集（验收脚本的模拟引擎只提供这些） */
type Eng = Engine & { partyConv: number }

const newFrame = (map: Engine['map']) => ({ map, whisperCd: 6, told: new Set<string>(), revealT: -99 })
const frames = new WeakMap<Engine, ReturnType<typeof newFrame>>()
function frameFor(eng: Engine) {
  let f = frames.get(eng)
  if (!f || f.map !== eng.map) { f = newFrame(eng.map); frames.set(eng, f) }
  return f
}
const origin = (eng: Engine) => [eng.map?.inf?.ox ?? 0, eng.map?.inf?.oy ?? 0] as const
const once = (eng: Engine, key: string, text: string, kind: 'system' | 'damage' | 'lore' | 'loot' = 'system') => {
  const F = frameFor(eng)
  if (!F.told.has(key)) { F.told.add(key); eng.msg(text, kind) }
}
const setPhase = (s: PartyState, ph: PartyPhase) => { if (s.phase !== ph) { s.phase = ph; s.t = 0 } }
const isPg = (e: Entity) => e.def.type === 'partygoer' && !e.dead
/** 倒地/爬走/燃烧：不再参与感知、群体与攻击 */
export const partygoerInert = (s: PartyState | undefined) => !!s && (s.phase === 'down' || s.phase === 'crawl' || s.phase === 'burn')
const armsLeft = (s: PartyState) => (s.armHp[0] > 0 ? 1 : 0) + (s.armHp[1] > 0 ? 1 : 0)

export const WHISPERS: readonly string[] = [
  '他们都死啦，你就是下一个！=)',
  '你妈妈一直在等你回家吃蛋糕呢 =)',
  '别跑了，派对才刚刚开始 =)',
  '我们给你留了一个位子 =)',
  '不疼的，真的一点都不疼 =)',
  '你还记得我的声音吗？=)',
  '大家都到齐了，就差你了 =)',
  '把蛋糕吃了吧，你一定饿坏了 =)',
]

export function initPartygoer(eng: Engine, e: Entity): PartyState {
  const [ox, oy] = origin(eng)
  const look = partygoerLook(e.id)
  const s: PartyState = {
    phase: e.provoked ? 'hunt' : 'party', t: 0,
    color: look.color, intern: look.intern, balloon: look.intern, balloonArm: look.balloonArm, balloonFly: 0,
    armHp: [PARTY.ARM_HP, PARTY.ARM_HP], berserk: false,
    lastX: e.x + ox, lastY: e.y + oy, heardT: 99, seeT: 99, shareT: 99, calmT: 0,
    flank: 0, downT: 0, burned: false, hitT: 99, speed: 0,
    gait: partyHash(e.id, 7) * 10, wave: 0, offer: 0, reach: 0, bite: 0, open: 0, claw: 0, down: 0, crawl: 0, burn: 0,
    armCut: [0, 0],
  }
  e.pg = s
  return s
}

/** 帧初始化：心灵感应（互相有视线的同伴共享目标与暴起状态）、包抄角分配、低语冷却 */
export function beginPartygoerFrame(eng: Engine, dt: number) {
  const m = eng.map
  if (!m) return
  const F = frameFor(eng)
  F.whisperCd -= dt
  const pack: Entity[] = []
  for (const e of m.entities) if (isPg(e)) { if (!e.pg) initPartygoer(eng, e); if (!partygoerInert(e.pg)) pack.push(e) }
  if (pack.length < 2) { for (const e of pack) e.pg!.flank = 0; return }
  // 心灵感应：知道玩家位置的个体把信息传给它注视着的同伴（双方须互相有视线）
  for (const a of pack) {
    const sa = a.pg!
    if (sa.heardT > 0.35) continue
    for (const b of pack) {
      if (b === a) continue
      const sb = b.pg!
      if (Math.hypot(a.x - b.x, a.y - b.y) > PARTY.TELEPATHY_RANGE || !eng.los(a.x, a.y, b.x, b.y)) continue
      if (sb.heardT > sa.heardT + 0.05) { sb.lastX = sa.lastX; sb.lastY = sa.lastY; sb.heardT = sa.heardT; sb.shareT = 0 }
      // 一只撕下伪装，看着它的同伴也一起撕下伪装
      if (sa.phase !== 'party' && sb.phase === 'party') {
        reveal(eng, b, sb, 'pack')
      }
    }
  }
  // 包抄：正在追击的个体按 id 排序依次分到 0、+0.95、-0.95、+1.7 rad 的包抄角
  const hunters = pack.filter((e) => e.pg!.phase === 'hunt' || e.pg!.phase === 'search').sort((a, b) => a.id - b.id)
  const FL = [0, 0.95, -0.95, 1.7, -1.7]
  hunters.forEach((e, i) => { e.pg!.flank = FL[i % FL.length] })
}

/** 撕下派对伪装（近身暴起 / 被攻击 / 同伴感应 / 心灵感应） */
function reveal(eng: Engine, e: Entity, s: PartyState, why: 'close' | 'hurt' | 'pack' | 'berserk') {
  if (s.phase !== 'party') return
  setPhase(s, 'hunt')
  s.calmT = 0
  e.state = 'chase'
  const F = frameFor(eng)
  const now = (eng as { time?: number }).time ?? 0
  if (why === 'pack') {
    once(eng, 'pack-reveal', '其余的派对客同时停止了鼓掌，一齐转过头来看着你。=)', 'damage')
    return
  }
  if (now - F.revealT > 3) {
    eng.msg(why === 'hurt'
      ? '派对客脸上的笑容一动不动——但派对结束了。它不再假装了。=)'
      : '派对客把蛋糕扔在地上。胸口传来「咔哒」一声，它不再假装了。=)', 'damage')
    F.revealT = now
  }
  audio.aggro()
}

/** 听觉：近视，以听觉为主——蹲行几乎无声，步行 ≈6.4m，奔跑 ≈10.5m */
export function partygoerHear(eng: Engine, e: Entity, x: number, y: number, radius: number, sprint: boolean) {
  const s = e.pg ?? initPartygoer(eng, e)
  if (partygoerInert(s)) return
  const d = Math.hypot(e.x - x, e.y - y)
  const hearR = sprint ? Math.max(radius, PARTY.HEAR * 1.5) : Math.min(radius * 1.6, PARTY.HEAR)
  if (d >= hearR) return
  const [ox, oy] = origin(eng)
  s.lastX = x + ox; s.lastY = y + oy; s.heardT = 0
}

/** 转化值增加（咬伤 / 丝绒蛋糕）；满值即「加入派对」 */
export function addPartyConversion(eng: Engine, amount: number, why: 'bite' | 'cake') {
  const E = eng as Eng
  if (eng.dev?.god) return
  const before = E.partyConv ?? 0
  E.partyConv = Math.min(PARTY.CONV_MAX, before + amount)
  const k = E.partyConv / PARTY.CONV_MAX
  if (why === 'bite') {
    if (before === 0) eng.msg('伤口周围的皮肤开始发硬、发亮，像一层光滑的皮革。只有死亡能够中止转变。', 'damage')
    else if (k >= 0.75 && before / PARTY.CONV_MAX < 0.75) eng.msg('你几乎感觉不到疼了。远处的东西糊成一片——你只想参加派对。=)', 'damage')
    else if (k >= 0.4 && before / PARTY.CONV_MAX < 0.4) eng.msg('痛觉在一点点褪去，视野边缘开始发糊。', 'damage')
  }
  if (E.partyConv >= PARTY.CONV_MAX) joinTheParty(eng)
}

/** 转化完成：「加入派对」死亡结局，并在原地生成一只新的派对客 */
function joinTheParty(eng: Engine) {
  const p = eng.player, m = eng.map
  if ((eng as { over?: boolean }).over) return
  if (m) {
    const ne = makeEntity('partygoer', p.x, p.y, p.z)
    ne.facing = Math.random() * Math.PI * 2
    const s = initPartygoer(eng, ne)
    s.intern = true; s.balloon = true // 新转化的「实习生」拴着红气球
    m.entities.push(ne)
  }
  eng.die('加入了派对 =)', true)
}

/** 转化值 0..1（渲染/HUD/受伤反馈读取） */
export const partyConvK = (eng: { partyConv?: number }) => Math.max(0, Math.min(1, (eng.partyConv ?? 0) / PARTY.CONV_MAX))

/** 玩家准星打中的部位：面条臂（左/右）、头脸、躯干。按准星射线在实体处的横向偏移与高度判定。 */
export type PartyPart = 'armL' | 'armR' | 'head' | 'body'
export function partygoerAimPart(eng: Engine, e: Entity, ray: { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number }): PartyPart {
  const s = e.pg ?? initPartygoer(eng, e)
  const hx = ray.dx, hy = ray.dy, hh = hx * hx + hy * hy
  const tOf = (x: number, y: number) => hh > 1e-6 ? ((x - ray.ox) * hx + (y - ray.oy) * hy) / hh : 0
  // 实体朝向：模型正面 = (cos f, sin f)。渲染把游戏 (x,y) 映射到 three (x,z)（镜像），
  // 模型的左臂（建模 +X 一侧，armHp[0]）落在游戏坐标 (sin f, -cos f) 方向
  const fx = Math.cos(e.facing), fy = Math.sin(e.facing)
  const lx = fy, ly = -fx
  const scale = e.def.scale ?? 1
  // 面条臂：抓咬时甩向前方，平时垂在身体两侧
  const lunge = s.phase === 'windup' || s.phase === 'bite'
  for (const [i, sign] of [[0, 1], [1, -1]] as const) {
    if (s.armHp[i] <= 0) continue
    const ax = e.x + (lunge ? fx * 0.7 : 0) + lx * sign * 0.42 * scale
    const ay = e.y + (lunge ? fy * 0.7 : 0) + ly * sign * 0.42 * scale
    const t = tOf(ax, ay)
    if (t <= 0) continue
    const px = ray.ox + hx * t, py = ray.oy + hy * t, pz = ray.oz + ray.dz * t
    const h = pz - e.z
    if (Math.hypot(px - ax, py - ay) < 0.24 * scale && h > 0.55 * scale && h < 1.85 * scale) return i === 0 ? 'armL' : 'armR'
  }
  const t = tOf(e.x, e.y)
  const h = ray.oz + ray.dz * Math.max(0, t) - e.z
  if (lunge && h < 1.55 * scale) { // 正在甩出面条臂：挡在身前的面条臂先挨刀
    if (s.armHp[0] > 0) return 'armL'
    if (s.armHp[1] > 0) return 'armR'
  }
  return h >= 1.55 * scale ? 'head' : 'body'
}

/**
 * 派对客受到伤害的统一入口（近战/爆炸/电击/其他）。返回实际扣除的血量。
 * 近战按部位结算；火焰和电击被皮肤完全挡住（倒地/爬行中的「尸体」被火点燃则烧尽）。
 */
export function partygoerDamage(eng: Engine, e: Entity, dmg: number, kind: 'melee' | 'fire' | 'shock' | 'other', part: PartyPart = 'body'): number {
  const s = e.pg ?? initPartygoer(eng, e)
  if (e.dead || s.phase === 'burn') return 0
  if (kind === 'fire') {
    if (s.phase === 'down' || s.phase === 'crawl') { ignite(eng, e, s); return 0 }
    once(eng, 'fire-proof', '火焰从派对客光滑的皮革表面滑开——它的皮肤防火。先打断它的面条臂。', 'system')
    if (s.phase === 'party') reveal(eng, e, s, 'hurt')
    return 0
  }
  if (kind === 'shock') {
    once(eng, 'shock-proof', '电火花在派对客的皮肤上散开，它连一下都没抖——那层皮像法拉第笼。', 'system')
    e.stunT = 0
    if (s.phase === 'party') reveal(eng, e, s, 'hurt')
    return 0
  }
  if (s.phase === 'down' || s.phase === 'crawl') {
    once(eng, 'corpse-hit', '刀刃砍在倒地的派对客身上，像砍在石头上。只有火盐或火油能烧尽它。', 'system')
    return 0
  }
  s.hitT = 0
  e.provoked = true
  if (s.phase === 'party') reveal(eng, e, s, 'hurt')
  const [ox, oy] = origin(eng)
  s.lastX = eng.player.x + ox; s.lastY = eng.player.y + oy; s.heardT = 0
  // ① 面条臂：最薄弱的部位，各自独立血量
  if ((part === 'armL' || part === 'armR') && kind === 'melee') {
    const i = part === 'armL' ? 0 : 1
    if (s.armHp[i] > 0) {
      const dealt = Math.min(s.armHp[i], dmg)
      s.armHp[i] -= dmg
      if (s.armHp[i] <= 0) severArm(eng, e, s, i)
      else once(eng, 'arm-hit', '面条臂上的皮肉很薄，刀刃轻易地切了进去。', 'system')
      return dealt
    }
    part = 'body'
  }
  if (!s.berserk) {
    // 胸甲闭合：躯体（含头）减伤 90%，且血量不会低于 60%——必须先断臂
    const floor = e.def.hp * PARTY.CLOSED_HP_FLOOR
    const want = dmg * (1 - PARTY.CHEST_DR)
    const dealt = Math.max(0, Math.min(want, e.hp - floor))
    e.hp -= dealt
    once(eng, 'chest-dr', '像打在石头上——胸甲被极大的力量锁紧了。面条臂才是它最薄弱的地方。', 'system')
    return dealt
  }
  // ② 狂战士：胸口洞开，头/脸是弱点
  const mult = part === 'head' ? PARTY.HEAD_MULT : PARTY.OPEN_BODY_MULT
  const dealt = dmg * mult
  e.hp -= dealt
  if (part === 'head') once(eng, 'head-weak', '你砸中了它的头——它晃了一下。胸口洞开时，头和脸是它的弱点。', 'system')
  if (e.hp <= 0) knockDown(eng, e, s)
  return dealt
}

function severArm(eng: Engine, e: Entity, s: PartyState, i: 0 | 1) {
  s.armHp[i] = 0
  eng.bloodParticles(e.x, e.y)
  audio.hit()
  if (s.balloon && s.balloonArm === i) { s.balloon = false; s.balloonFly = 0.001; eng.msg('拴着红气球的细线断了——气球慢慢飘走了。', 'system') }
  if (armsLeft(s) === 1) eng.msg('一条面条臂被砍断了，在地上痉挛着拍打空气。派对客既没有出声，也没有退缩。', 'loot')
  else enterBerserk(eng, e, s)
}

function enterBerserk(eng: Engine, e: Entity, s: PartyState) {
  if (s.berserk) return
  s.berserk = true
  if (s.balloon) { s.balloon = false; s.balloonFly = 0.001 }
  e.hp = Math.max(e.hp, e.def.hp * PARTY.CLOSED_HP_FLOOR)
  setPhase(s, 'hunt')
  e.stunT = Math.max(e.stunT, 0.55)
  eng.camShake = Math.min(1, eng.camShake + 0.4)
  audio.aggro()
  eng.msg('两条面条臂都断了——它再也没法转化你。胸甲像两扇门一样弹开：青绿色的人脸、蠕动的恐惧蜈蚣、粉色的甲壳肉……两条带长钩爪的蜈蚣臂弹了出来！（狂战士形态：攻击它的头和脸）', 'damage')
}

function knockDown(eng: Engine, e: Entity, s: PartyState) {
  e.hp = 1
  s.downT = 0
  setPhase(s, 'down')
  e.state = 'idle'
  e.stunT = 0
  audio.hit()
  eng.camShake = Math.min(1, eng.camShake + 0.3)
  eng.msg('派对客轰然倒地，面朝下一动不动——它没有死。趁它复苏之前，用火盐晶体或火油桶把它烧尽。', 'loot')
}

function ignite(eng: Engine, e: Entity, s: PartyState) {
  setPhase(s, 'burn')
  e.stunT = 0
  eng.msg('火焰钻进蠕动的蜈蚣足之间——恐惧蜈蚣的甲壳剧烈地燃烧起来，黑烟里满是硫磺燃烧的恶臭。', 'damage')
  audio.hit()
}

/** killCheck 守卫：别的伤害来源把血量打到 0 时，也必须服从击杀顺序（只有烧尽才会真正死亡） */
export function partygoerKillGuard(eng: Engine, e: Entity): boolean {
  if (e.def.type !== 'partygoer' || e.dead) return false
  const s = e.pg ?? initPartygoer(eng, e)
  if (s.burned) return false
  if (e.hp > 0) return false
  if (!s.berserk) { e.hp = e.def.hp * PARTY.CLOSED_HP_FLOOR; return true }
  if (s.phase !== 'down' && s.phase !== 'crawl' && s.phase !== 'burn') knockDown(eng, e, s)
  else e.hp = 1
  return true
}

/** 是否正注视着玩家（心灵低语的条件：有视线、在视距内、面朝玩家） */
function gazing(eng: Engine, e: Entity, d: number) {
  const p = eng.player
  if (d > PARTY.SIGHT) return false
  let diff = Math.abs(Math.atan2(p.y - e.y, p.x - e.x) - e.facing)
  if (diff > Math.PI) diff = Math.PI * 2 - diff
  return diff < 0.7 && eng.los(e.x, e.y, p.x, p.y)
}

function smoke(eng: Engine, e: Entity, dt: number, rate: number) {
  const n = Math.random() < dt * rate ? 1 : 0
  for (let i = 0; i < n + (Math.random() < dt * rate * 0.5 ? 1 : 0); i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.5
    eng.particles.push({
      x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r, z: e.z + 0.2 + Math.random() * 0.3,
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, vz: 0.6 + Math.random() * 0.7,
      t: 0, life: 1.6 + Math.random() * 1.2, color: Math.random() < 0.18 ? '#e8622c' : (Math.random() < 0.5 ? '#141210' : '#2a2622'), size: 5 + Math.random() * 6, opacity: 0.8,
    })
  }
}

export function updatePartygoer(eng: Engine, e: Entity, dt: number, d: number, dmgMult: number) {
  const s = e.pg ?? initPartygoer(eng, e)
  const p = eng.player, F = frameFor(eng), [ox, oy] = origin(eng)
  s.t += dt; s.hitT += dt; s.heardT += dt; s.seeT += dt; s.shareT += dt
  if (s.balloonFly > 0) s.balloonFly += dt
  for (const i of [0, 1] as const) if (s.armHp[i] <= 0) s.armCut[i] = Math.min(1, s.armCut[i] + dt * 5)
  const ease = (cur: number, want: number, rate: number) => cur + (want - cur) * Math.min(1, dt * rate)
  s.open = ease(s.open, s.berserk ? 1 : 0, 6)
  s.speed = 0

  // ---------- 倒地 / 爬走 / 燃烧 ----------
  if (s.phase === 'burn') {
    s.burn = Math.min(1, s.t / PARTY.BURN_T)
    smoke(eng, e, dt, 26)
    if (s.t >= PARTY.BURN_T) {
      s.burned = true
      e.hp = 0
      once(eng, 'burn-out', '它烧得只剩下一摊灰。硫磺的气味久久不散。', 'loot')
      eng.killCheck(e)
      if (!e.dead) { e.dead = true; e.deathT = 1.4 } // 模拟引擎兜底
    }
    return
  }
  if (s.phase === 'down' || s.phase === 'crawl') {
    s.downT += dt
    s.down = ease(s.down, 1, 4)
    s.wave = ease(s.wave, 0, 6); s.offer = ease(s.offer, 0, 6); s.reach = ease(s.reach, 0, 6); s.claw = 0
    if (Math.random() < dt * 0.8) smoke(eng, e, dt, 2)
    if (s.phase === 'down' && s.downT >= PARTY.DOWN_T) {
      setPhase(s, 'crawl')
      if (d < 18) eng.msg('倒地的派对客腹下伸出细密的蜈蚣足——它面朝下，慢慢地爬走了。', 'damage')
    }
    if (s.phase === 'crawl') {
      s.crawl = ease(s.crawl, 1, 3)
      const away = Math.max(0.1, d)
      e.targetX = e.x + ((e.x - p.x) / away) * 3; e.targetY = e.y + ((e.y - p.y) / away) * 3
      if (eng.stepEntity(e, PARTY.CRAWL_SPEED, dt)) eng.wanderTarget(e) // 头朝前进方向（stepEntity 改写朝向）
      s.speed = PARTY.CRAWL_SPEED
      s.gait += dt * 6
      if (s.downT >= PARTY.REVIVE_T) {
        e.hp = e.def.hp * PARTY.REVIVE_HP
        s.down = 0; s.crawl = 0; s.downT = 0
        s.lastX = p.x + ox; s.lastY = p.y + oy; s.heardT = 0
        setPhase(s, 'hunt')
        e.state = 'chase'
        audio.aggro()
        eng.msg('那具「尸体」翻过身，站了起来。胸口还敞着。=)', 'damage')
      }
    }
    return
  }
  s.down = ease(s.down, 0, 5); s.crawl = ease(s.crawl, 0, 5); s.burn = 0

  // ---------- 感知：近视，视距 6m ----------
  const sees = !eng.dev?.invisible && d < PARTY.SIGHT && Math.abs(e.z - p.z) < 1.6 && eng.los(e.x, e.y, p.x, p.y)
  if (sees) { s.lastX = p.x + ox; s.lastY = p.y + oy; s.heardT = 0; s.seeT = 0 }
  const knows = s.heardT < PARTY.LOSE_T
  const lx = s.lastX - ox, ly = s.lastY - oy

  // ---------- 心灵低语：注视着玩家时偶尔弹出熟人的声音 ----------
  if (F.whisperCd <= 0 && s.phase !== 'party' && gazing(eng, e, d)) {
    F.whisperCd = PARTY.WHISPER_CD[0] + Math.random() * (PARTY.WHISPER_CD[1] - PARTY.WHISPER_CD[0])
    const line = WHISPERS[Math.floor(Math.random() * WHISPERS.length)]
    eng.msg(`一个熟人的声音在你脑子里说：「${line}」`, 'lore')
    p.sanity = Math.max(0, p.sanity - 3)
  }

  // ---------- 派对伪装：友善靠近、挥手、递蛋糕；2.4m 内暴起 ----------
  if (s.phase === 'party') {
    if (!eng.dev?.invisible && d <= PARTY.FEIGN_RANGE && eng.los(e.x, e.y, p.x, p.y) && Math.abs(e.z - p.z) < 1.6) {
      reveal(eng, e, s, 'close')
      s.lastX = p.x + ox; s.lastY = p.y + oy; s.heardT = 0
    } else {
      if (knows) {
        // 友善地走近：面朝玩家，挥手，近了就把蛋糕递过来
        e.targetX = lx; e.targetY = ly
        const near = Math.hypot(lx - e.x, ly - e.y)
        if (near > 0.6) { eng.stepEntity(e, PARTY.FRIENDLY_SPEED, dt); s.speed = PARTY.FRIENDLY_SPEED }
        eng.faceToward(e, lx, ly, dt, 4)
        s.wave = ease(s.wave, d > 4.2 ? 1 : 0, 4)
        s.offer = ease(s.offer, d <= 4.2 ? 1 : 0, 4)
        if (sees && d < 8) once(eng, `party-${e.id}`, '一个高大的黄色身影朝你挥了挥手——它端着一块深红色的蛋糕，脸上刻着血红的笑脸。=)', 'system')
      } else {
        // 没有目标：围着同伴闲逛（永不落单），偶尔挥手
        s.offer = ease(s.offer, 0, 3)
        s.wave = ease(s.wave, Math.sin(s.t * 0.4 + e.id) > 0.85 ? 1 : 0, 2)
        roam(eng, e, s, dt)
      }
      e.state = 'wander'
    }
    s.gait += dt * s.speed * 2.2
    s.reach = ease(s.reach, 0, 6); s.claw = 0; s.bite = 0
    return
  }
  s.wave = ease(s.wave, 0, 6); s.offer = ease(s.offer, 0, 6)

  // ---------- 攻击：面条臂抓咬 / 蜈蚣爪连续抓挠 ----------
  if (s.phase === 'windup') {
    eng.faceToward(e, p.x, p.y, dt, 10)
    s.reach = ease(s.reach, 0.25, 10) // 面条臂向后收，蓄势
    if (s.t >= PARTY.BITE_WINDUP) setPhase(s, 'bite')
    return
  }
  if (s.phase === 'bite') {
    eng.faceToward(e, p.x, p.y, dt, 8)
    s.reach = ease(s.reach, 1, 18)
    s.bite = Math.sin(Math.min(1, s.t / PARTY.BITE_T) * Math.PI)
    if (s.t - dt < 0.16 && s.t >= 0.16) {
      if (d < PARTY.BITE_REACH && eng.meleeZOk(e) && armsLeft(s) > 0 && !eng.dev?.invisible) {
        eng.hurtPlayer(e.def.damage * PARTY.BITE_DAMAGE * dmgMult, '派对客的吸盘口')
        p.slowT = Math.max(p.slowT ?? 0, 0.9)
        eng.msg('面条臂缠住了你——满是钩牙的吸盘口狠狠咬了进去。', 'damage')
        addPartyConversion(eng, PARTY.BITE_CONV, 'bite')
      }
    }
    if (s.t >= PARTY.BITE_T) { setPhase(s, 'hunt'); e.attackCd = PARTY.BITE_CD }
    return
  }
  if (s.phase === 'claw') {
    eng.faceToward(e, p.x, p.y, dt, 12)
    s.claw = s.t / PARTY.CLAW_T
    for (const at of PARTY.CLAW_HITS) {
      if (s.t - dt < at && s.t >= at && d < PARTY.CLAW_REACH && eng.meleeZOk(e) && !eng.dev?.invisible) {
        eng.hurtPlayer(PARTY.CLAW_DAMAGE * dmgMult, '恐惧蜈蚣的钩爪')
        audio.swing()
      }
    }
    if (s.t >= PARTY.CLAW_T) { setPhase(s, 'hunt'); s.claw = 0; e.attackCd = PARTY.CLAW_CD }
    return
  }
  s.reach = ease(s.reach, 0, 6); s.bite = 0

  // ---------- 追击 / 搜寻 ----------
  if (knows && s.phase === 'search') setPhase(s, 'hunt')
  if (s.phase === 'hunt') {
    e.state = 'chase'
    if (!knows) { setPhase(s, 'search'); s.calmT = 0 }
    else {
      // 分头包抄：以玩家为中心，把「玩家→自己」的方向转过包抄角，逐渐收拢
      const ux = (e.x - lx) / Math.max(0.01, Math.hypot(e.x - lx, e.y - ly)), uy = (e.y - ly) / Math.max(0.01, Math.hypot(e.x - lx, e.y - ly))
      const rr = Math.min(3.2, Math.max(0, Math.hypot(e.x - lx, e.y - ly) - 1.2) * 0.55)
      const c = Math.cos(s.flank), sn = Math.sin(s.flank)
      e.targetX = lx + (ux * c - uy * sn) * rr
      e.targetY = ly + (ux * sn + uy * c) * rr
      const sp = s.berserk ? PARTY.BERSERK_SPEED : PARTY.CHASE_SPEED
      if (Math.hypot(e.targetX - e.x, e.targetY - e.y) > 0.35) { eng.stepEntity(e, sp, dt); s.speed = sp }
      if (sees) eng.faceToward(e, p.x, p.y, dt, 8)
      if (sees && e.attackCd <= 0 && eng.meleeZOk(e)) {
        if (s.berserk && d < PARTY.CLAW_RANGE) { setPhase(s, 'claw'); s.speed = 0 }
        else if (!s.berserk && armsLeft(s) > 0 && d < PARTY.BITE_RANGE) { setPhase(s, 'windup'); s.speed = 0 }
      }
    }
  } else if (s.phase === 'search') {
    e.state = 'investigate'
    s.calmT += dt
    e.targetX = lx; e.targetY = ly
    if (Math.hypot(lx - e.x, ly - e.y) > 0.5 && !eng.stepEntity(e, PARTY.ROAM_SPEED * 1.4, dt)) s.speed = PARTY.ROAM_SPEED * 1.4
    else roam(eng, e, s, dt)
    if (s.calmT > PARTY.CALM_T && !e.provoked && !s.berserk) { setPhase(s, 'party'); e.state = 'wander' }
  }
  s.gait += dt * s.speed * 2.2
}

/** 闲逛：偏向最近的同伴（永不落单），不会走得离群太远 */
function roam(eng: Engine, e: Entity, s: PartyState, dt: number) {
  let mate: Entity | null = null, md = 1e9
  for (const q of eng.map!.entities) {
    if (q === e || !isPg(q) || partygoerInert(q.pg)) continue
    const qd = Math.hypot(q.x - e.x, q.y - e.y)
    if (qd < md) { md = qd; mate = q }
  }
  if (mate && md > 4.5) { e.targetX = mate.x; e.targetY = mate.y; e.stateT = 2 }
  else if (e.stateT <= 0 || Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.35) eng.wanderTarget(e)
  if (eng.stepEntity(e, PARTY.ROAM_SPEED, dt)) eng.wanderTarget(e)
  else s.speed = PARTY.ROAM_SPEED
}

/** 受伤反馈系数：转化值越高，痛觉越弱（hurtPlayer 读取） */
export function partyPainK(eng: { partyConv?: number }) { return 1 - 0.8 * partyConvK(eng) }
