import { facelingAgeOf } from './facelingAI'
import { isVm36, vm36Struck, vm36Shocked, vm36KillGuard } from './vendingAI'
import { FACELING_AGE_HEIGHT } from '../entities/facelingTraits'
import { lightguideHit, lightguideLure } from './lightguideAI'
import { SQUIRT_LIQUID_NAME, SQUIRT_LIQUID_SRC, squirtActsAsWater } from '../content/squirtLiquids'
import {bursterKillGuard,bursterMelee,bursterSquirt,acidBurnEntity,BURSTER} from './bursterAI'
import { heldMelee, startMeleeSwing } from './melee'
import { isWrangler, wranglerFire, wranglerFireEggs, wranglerKillGuard, wranglerMelee } from './wranglerAI'
import { SWIM, underwater, meleeIntervalMul, blockUnderwaterGun } from './swim'
import { witnessedOffense } from './career'
import { nwInvulnerable, nwKilled, releaseNW } from './watchAI'
import { provokeMoths } from './moths'
import { mothEggSwing, mothHurt } from './mothAI'
import { provokeHound } from './houndAI'
import { tinyKillGuard, tinyStruck } from './tinyAI'
import { windowHittable, windowKillGuard } from './windowAI'
import { thingKillGuard, thingMeleePart, thingCut, thingStruck } from './thingAI'
import { camoHurt, camoProjectileLanded, camoSound } from './camoAI' // [L8-camo]
import { curabiturKilled } from './curabiturAI' // [L8-curabitur]
import { arachnidHurt, arachnidFireHit, arachnidExplosion, arachnidSquirted } from './arachnidAI' // [L8-arachnid]
// v53：战斗/投掷/击退 + 伤害/死亡结算 + 粒子生成 —— 自 engine.ts 拆分，逻辑逐语句搬运。
import { ITEMS } from '../content/items'
import { bandOfZ, bandOfPlayerZ, groundHeightAt, wallAt, structBlocksSight, l11MapWater } from '../world/mapgen'
import { look } from '../core/renderer3d'
import { audio } from '../core/audio'
import { recordEntityEncounter, type Entity } from '../entities'
import type { Engine, Projectile } from '../engine'
import { clearRunSlots } from './save'
import { releaseClumpPlayer } from './clumpAI'
import {jerryHurt,jerryKnockoutIntercept,jerryInputLock} from './jerryAI'
import { partygoerAimPart, partygoerDamage, partygoerKillGuard, partyPainK, partyConvK } from './partygoerAI'
import { seatedEyeHeight, seatedEyeOffset } from './seating'
import { skinStealerHit } from './skinStealerAI'
import { dullerDrop, dullerSquirted, dullerHurt, dullerDropPosition, releaseDullerPlayer } from './dullerAI'
import { armsGunshot, armsHittable, armsKillGuard, armsPlayerShielded, armsInputLock } from './armsAI'
import { nguithrKilled, nguithrProjectileHit,nguithrInputLock } from './nguithrAI'

export function hurtPlayer(eng: Engine, dmg: number, source: string) {
  if (eng.dev.god) return
  if (armsPlayerShielded(eng)) return // 手臂：被拖进风口 / 在管道里 / 正被吐出时，外界伤不到玩家
  const p = eng.player
  p.hp -= dmg * (eng.manmadeT > 0 ? 0.9 : 1) // v51：人制品效应中受到的伤害 -10%
  // 派对客转化：转化值越高痛觉越弱——伤害照扣，但镜头震动/红闪/理智损失逐步减弱，高转化时不再红闪
  const pain = partyPainK(eng)
  p.sanity = Math.max(0, p.sanity - 4 * pain)
  eng.camShake = Math.min(1, eng.camShake + 0.6 * pain)
  audio.hurt()
  if (partyConvK(eng) < 0.5) eng.emit({ kind: 'damage' })
  eng.msg(partyConvK(eng) >= 0.6 ? `你几乎感觉不到疼（受到 ${Math.round(dmg)} 点伤害，${source}）` : `受到 ${Math.round(dmg)} 点伤害（${source}）`, 'damage')
  if(jerryKnockoutIntercept(eng,source))return
  if (p.hp <= 0) eng.die(`被 ${source} 撕碎`)
}

export function die(eng: Engine, cause: string, force = false) {
  if (eng.dev.god && !force) { eng.player.hp = Math.max(eng.player.hp, 20); return }
  releaseDullerPlayer(eng)
  releaseClumpPlayer(eng)
  releaseNW(eng)
  eng.over = true
  eng.player.hp = 0
  eng.usingItem = null
  clearRunSlots(eng) // v29a/v54：死亡后本局进度存档失效（绑定槽 + 自动槽；继续游戏将开新局）
  audio.stopHum(); audio.stopBGM(); audio.stopRain(); audio.stopCaveWeather(); audio.setHeartbeat(false, 0) // v54：雨声随死亡停止
  eng.emit({ kind: 'dead', text: cause })
}

// 攻击距离：基础 1.9m，巨型实体按体量加成（v28：原 1.6 过短，近身常常够不到）
export function attackReach(_eng: Engine, e: Entity): number {
  return (_eng.meleeReach > 0 ? _eng.meleeReach : 1.9) + Math.max(0, (e.def.huge ?? 1) - 1) * 0.6
}

/** v59 联机：客人攻击房主权威实体（带 netId）——伤害改报房主结算（快照回同步 hp/死亡/激怒），
 *  返回 true 表示已走联机通道（调用方跳过本地扣血/killCheck，只做打击反馈，防两端分叉） */
export function mpHurtEntity(eng: Engine, e: Entity, dmg: number): boolean {
  if (e.netId === undefined || !eng.mpSession || eng.mpSession.isHost || eng.applyingNet) return false
  eng.emit({ kind: 'mpevent', mp: { t: 'entHit', nid: e.netId, dmg } })
  return true
}

/** v59 联机：房主击杀掉落物广播（客人端窗口内落地；takeItem 事件按同 id 同步拾取） */
function mpDrop(eng: Engine, id: number, it: string, x: number, y: number) {
  const mp = eng.mpSession, m = eng.map
  if (mp?.started && mp.isHost && m && !eng.applyingNet)
    eng.emit({ kind: 'mpevent', mp: { t: 'dropItem', id, it, x: x + (m.inf?.ox ?? 0), y: y + (m.inf?.oy ?? 0) } })
}

/** 当前攻击能否命中该实体：距离 + 高差 + 朝向锥（贴脸 <0.9m 免除朝向判定——
 *  实体与玩家几乎重合时 atan2 方向退化，旧判定会永远 miss，这就是"近身打不到"的根因） */
export function canHit(eng: Engine, e: Entity): boolean {
  const p = eng.player
  if (e.def.type === 'thething') return thingMeleePart(eng, e) !== null
  if (e.def.type === 'windowent') return !e.dead && windowHittable(eng, e) // [window] 只有伸出来的手臂打得到
  if (e.def.type === 'arms' && !armsHittable(e)) return false // 手臂：缩在管内 / 被赶走时打不到
  if (e.dead || (e.disguised && e.disguised !== 'human')) return false // v77：穿着人皮的窃皮者是真实的身体，可以被击中
  const d = Math.hypot(e.x - p.x, e.y - p.y)
  if (d > eng.attackReach(e)) return false
  if (Math.abs(e.z - p.z) >= 1) return false // 高差过大打不到（跨层够不着）
  if (d >= 0.9) {
    const ang = Math.atan2(e.y - p.y, e.x - p.x)
    let diff = Math.abs(ang - p.facing)
    if (diff > Math.PI) diff = Math.PI * 2 - diff
    if (diff > 1.1) return false
  }
  return true
}

/** 准星当前可命中的最近实体（渲染层据此改变准星样式） */
export function aimEntity(eng: Engine): Entity | null {
  if (eng.handsStowed||(nguithrInputLock(eng)||armsInputLock(eng))) return null
  const m = eng.map
  if (!m) return null
  let best: Entity | null = null, bd = 1e9
  for (const e of m.entities) {
    if (!eng.canHit(e)) continue
    const d = Math.hypot(e.x - eng.player.x, e.y - eng.player.y)
    if (d < bd) { bd = d; best = e }
  }
  return best
}

/** 相机中心准星的三维世界方向。所有远程/投掷行为必须共用它，避免俯仰只影响特效、不影响命中。 */
export function crosshairDirection() {
  const n = Math.hypot(look.rayX, look.rayY, look.rayZ)
  if (n > 0.5) return { x: look.rayX / n, y: look.rayY / n, z: look.rayZ / n }
  const cp = Math.cos(look.pitch)
  return {
    x: -Math.sin(look.yaw) * cp,
    y: -Math.cos(look.yaw) * cp,
    z: Math.sin(look.pitch),
  }
}

/** 从眼睛沿准星做简洁的三维射线步进，返回墙、地面或首个实体处的真实终点。 */
function traceCrosshair(eng: Engine, range: number): { x: number; y: number; z: number; travel: number; entity: Entity | null } {
  const p = eng.player, m = eng.map!
  const dir = crosshairDirection()
  const oz = p.z + seatedEyeHeight(eng)
  const offset = seatedEyeOffset(eng), ox = p.x + offset.x, oy = p.y + offset.y
  const band = bandOfPlayerZ(m, p.z, p.x, p.y)
  let end = { x: ox + dir.x * range, y: oy + dir.y * range, z: oz + dir.z * range, travel: range, entity: null as Entity | null }
  for (let s = 0.15; s <= range; s += 0.12) {
    const x = ox + dir.x * s, y = oy + dir.y * s, z = oz + dir.z * s
    const tx = Math.floor(x), ty = Math.floor(y)
    if (wallAt(m, tx, ty, band) || structBlocksSight(m, x, y, z, band) || z <= groundHeightAt(m, x, y, band) + 0.025) {
      end = { x: ox + dir.x * Math.max(0, s - 0.12), y: oy + dir.y * Math.max(0, s - 0.12), z: oz + dir.z * Math.max(0, s - 0.12), travel: Math.max(0, s - 0.12), entity: null }
      break
    }
    for (const e of m.entities) {
      if (e.dead || e.hidden || (e.disguised && e.disguised !== 'human')) continue
      const scale = (e.def.scale ?? 1) * Math.min(2.5, e.def.huge ?? 1)
      const radius = Math.max(0.3, Math.min(1.35, 0.42 * scale))
      const bottom = e.z - (e.def.flying ? 0.38 * scale : 0.05)
      const bodyHeight = e.def.type === 'skinstealer' ? (e.disguised === 'human' ? 1.95 : 2.2) : e.def.type === 'faceling' ? 1.85 * FACELING_AGE_HEIGHT[facelingAgeOf(e)] : 1.6
      const top = e.z + Math.max(0.8, bodyHeight * scale)
      if (Math.hypot(e.x - x, e.y - y) <= radius && z >= bottom && z <= top) {
        return { x, y, z, travel: s, entity: e }
      }
    }
  }
  return end
}

function startAttackAnimation(eng: Engine, kind: Engine['attackAnimKind'], duration: number) {
  eng.attackAnimKind = kind
  eng.attackAnimDur = Math.max(0.01, duration)
  eng.attackAnimT = eng.attackAnimDur
}

export function killCheck(eng: Engine, e: Entity) {
  if (vm36KillGuard(eng, e)) return // [vending] Entity 36 血量见底只会瘫倒（之后可撬开后部暗格）
  if (thingKillGuard(eng, e)) return
  if (e.def.type === 'windowent' && windowKillGuard(eng, e)) return // [window] 窗户不可杀；打中手臂 = 松手
  if (tinyKillGuard(eng, e)) return // Tiny cannot die or drop loot; attacks provoke it.
  if (lightguideHit(eng, e)) return
  if (e.def.type === 'arachnid' && arachnidHurt(eng, e)) return
  if(e.def.type==='burster'&&bursterKillGuard(eng,e))return
  if (isWrangler(e.def.type) && wranglerKillGuard(e)) return
  if (nwInvulnerable(e.def.type)) { e.hp = e.def.hp; return } // 观察者 / 残缺者：常规方式杀不死
  if (armsKillGuard(eng, e)) return // 手臂：永不死亡、不计击杀——血量清零 = 被赶走 90–120s 后回满
  if (partygoerKillGuard(eng, e)) return // 派对客：击杀必须按顺序（断臂→狂战士→倒地→火烧），血量见底只会倒地
  skinStealerHit(eng, e)
  if(!e.dead){provokeMoths(eng,e);mothHurt(eng,e,true)}
  provokeHound(eng,e)
  camoHurt(eng, e) // [L8-camo] 迷彩爬行者受击：播 hit、记下玩家位置、首次受击召唤同伴
  dullerHurt(eng,e)
  if (e.hp > 0 || e.dead) return
  const p = eng.player, m = eng.map!
  e.dead = true; e.deathT = 1.4
  curabiturKilled(eng, e) // [L8-curabitur] 受眷鸟：坠落尸体停留 9s + 掉落受眷胶
  if (e.def.type === 'clump') releaseClumpPlayer(eng, e)
  if (e.def.type === 'strider') nwKilled(eng, e)
  if (e.def.type === 'nguithr') nguithrKilled(eng, e) // 掉落镇静腺；释放被它重度镇静的玩家
  if(e.def.type==='duller'){
    const type=dullerDrop(e)
    if(type){
      const item={id:Math.random(),type,...dullerDropPosition(eng,e)}
      m.items.push(item)
      const inf=m.inf
      if(inf)inf.chunks.get(`${Math.floor((item.x+inf.ox)/32)},${Math.floor((item.y+inf.oy)/32)}`)?.items.push(item)
      eng.msg(`钝人攥着的${ITEMS[type]?.name??'东西'}掉在了地上。`,'loot')
    }
  }
  p.kills++
  // v35：杀死 Ferren——BNTG 声望大跌（它是商人之家的吉祥物）
  if (e.def.type === 'ferren') {
    eng.changeRep('bntg', -50)
    eng.msg('整个市场安静了一秒。你意识到自己干了什么。（B.N.T.G. 声望大跌）', 'damage')
  }
  // v47：杀死鹉主杰瑞——信众永远不会原谅：jerry 声望直接跌至 -100（彻底敌对）
  if (e.def.type === 'jerry') {
    eng.rep.jerry = -100
    audio.aggro()
    eng.msg('鹉主从栖木上坠落。穹顶的圣辉摇晃了一瞬——信众的哭喊与怒吼同时炸开。（杰瑞的信众 声望 → -100）', 'damage')
  }
  eng.msg(`击杀了 ${e.def.name}`, 'loot')
  // 旱虾（Entity 20）：被玩家击杀必掉可食用的「旱虾」——被敌方实体捕食不经由本函数，不掉落物品
  if (e.def.type === 'corpserat' && !e.def.ceilingCrawler && (e.def.capybara || e.rt?.morph === 'capybara' || Math.random() < 0.6)) {
    const item = { id: Math.random(), type: 'ratmeat', x: e.x, y: e.y, z: e.z }
    m.items.push(item)
    const inf = m.inf
    if (inf) inf.chunks.get(`${Math.floor((item.x + inf.ox) / 32)},${Math.floor((item.y + inf.oy) / 32)}`)?.items.push(item)
  }
  if (e.def.type === 'dryshrimp') {
    const id = Date.now() % 100000 + Math.random()
    m.items.push({ id, type: 'dryshrimp', x: e.x, y: e.y })
    mpDrop(eng, id, 'dryshrimp', e.x, e.y) // v59：联机掉落同步
  }
}

export function attack(eng: Engine) {
  if (eng.handsStowed || jerryInputLock(eng)||(nguithrInputLock(eng)||armsInputLock(eng))) return
  const p = eng.player
  const held = p.hotbar[p.selected]
  // An empty squirt gun is not an attack: keep its existing feedback, but do
  // not spend stamina or start the shared attack cooldown.
  if (held?.type === 'squirtgun' && (eng.squirtAmmo <= 0 || eng.squirtTank === 'none')) {
    eng.squirt()
    return
  }
  if (!eng.dev.noAttackCooldown && eng.attackCooldownT > 0) return
  // [swim 阶段 3] 水下不能开枪（滋水枪 / 枪糖）
  if ((eng.gunCandyT > 0 || held?.type === 'squirtgun') && blockUnderwaterGun(eng, eng.swim)) return
  // 近战重制：五把近战武器走三段式挥砍（前摇结束才判定，见 engine/melee.ts）
  if (heldMelee(eng)) { startMeleeSwing(eng, false, 0); return }
  const def = held ? ITEMS[held.type] : undefined
  // 所有左键攻击共用冷却入口；近战武器从物品定义读取独立间隔/体力，特殊攻击使用轻量模板。
  const interval = eng.gunCandyT > 0 ? 0.24
    : def?.throw ? 0.72
      : held?.type === 'squirtgun' ? 0.3
        : (def?.weapon ? (def.attackInterval ?? 0.65)
          : 0.58) * meleeIntervalMul(eng) // [swim 阶段 3] 水下近战 / 徒手间隔 ×1.3
  const staminaCost = eng.gunCandyT > 0 ? 2
    : def?.throw ? 5
      : held?.type === 'squirtgun' ? 2
        : def?.weapon ? (def.attackStamina ?? 8)
          : 7
  p.stamina = Math.max(0, p.stamina - staminaCost)
  const exhausted = p.stamina <= 0.01
  const duration = exhausted ? Math.max(3.1, interval * 4.5) : interval
  eng.attackCooldownDur = eng.dev.noAttackCooldown ? 0 : duration
  eng.attackCooldownT = eng.attackCooldownDur
  if (def?.weapon && eng.gunCandyT <= 0) eng.meleeSide = -eng.meleeSide // 近战重制：刀左右交替快划
  startAttackAnimation(eng,
    eng.gunCandyT > 0 || held?.type === 'squirtgun' ? 'spray'
      : def?.throw ? 'throw'
        : def?.weapon ? 'swing' : 'punch',
    duration,
  )
  if (exhausted && eng.statusMsgT.stamina <= 0) {
    eng.msg('体力已经耗尽——手臂沉得抬不起来，下一次攻击需要很久。', 'system')
    eng.statusMsgT.stamina = 2.5
  }
  // v51：枪糖生效中——无论当前持有什么，右手都是枪（左键发射巧克力子弹）
  if (eng.gunCandyT > 0) { eng.shootChocolate(); return }
  // 可投掷道具：左键掷出而非近战
  if (held && ITEMS[held.type]?.throw) { eng.throwHeld(held.type); return }
  // v32：滋水枪——左键喷射储罐液体
  if (held?.type === 'squirtgun') { eng.squirt(); return }
  audio.swing()
  const r = strike(eng, eng.dev.oneHit ? 99999 : held ? (ITEMS[held.type].weapon ?? 8) : 8)
  void r
}

export interface MeleeStrike { kind: string; heavy: boolean; broken: boolean; targets: number; stun: number; backstab?: number; reach: number }
/** 一次近战结算（空手/旧路径立即调用；五把近战武器在前摇结束时由 engine/melee.ts 调用）。 */
export function strike(eng: Engine, dmgIn: number, melee?: MeleeStrike): { hit: boolean; wall: boolean } {
  const p = eng.player, m = eng.map!, held = p.hotbar[p.selected]
  if (melee) audio.swing()
  // 目标数限制：只取最近的 N 个可命中实体（木板 3，其余 1）
  let allowed: Set<Entity> | null = null
  if (melee) {
    const c = m.entities.filter((e) => eng.canHit(e)).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
    allowed = new Set(c.slice(0, melee.targets))
  }
  // 背刺：刀从目标背后（目标未在追击/攻击）出手 ×2
  const dmgFor = (e: Entity) => {
    if (!melee?.backstab || e.state === 'chase' || e.state === 'attack') return dmgIn
    const toP = Math.atan2(p.y - e.y, p.x - e.x)
    let d = Math.abs(toP - e.facing); if (d > Math.PI) d = Math.PI * 2 - d
    if (d < 2.1) return dmgIn
    if (eng.statusMsgT.backstab <= 0) { eng.msg('背刺！刀从它背后捅了进去。（伤害 ×2）', 'loot'); eng.statusMsgT.backstab = 4 }
    return dmgIn * melee.backstab
  }
  let hit = false
  let blockedJerry = false // v47：教化约束——被拦下的对鹉主挥击（提示「你下不去手」）
  for (const e of m.entities) {
    // [thing] 七层之物：按简化跟随链的头部/躯干胶囊判定命中；拿刀=割肉，其它武器=不掉血、转头迟滞、打醒（thingAI）
    const thingBody = false // 旧版体节减伤路径已由 thingAI 接管，保留变量供下方旧分支编译
    if (e.def.type === 'thething' && !e.dead && !e.disguised) {
      const part = thingMeleePart(eng, e)
      if (!part) continue
      recordEntityEncounter(e)
      hit = true
      if (held?.type === 'knife') thingCut(eng, e, part)
      else thingStruck(eng, e)
      continue
    } else if (!eng.canHit(e)) continue
    if (allowed && !allowed.has(e) && !thingBody) continue
    const edmg = dmgFor(e)
    recordEntityEncounter(e) // v54：攻击命中计一次遭遇（按个体去重）
    // v47：教化约束——教化值 >0 后无法再对鹉主出手（驯服清零后解除约束）
    if (e.def.type === 'jerry' && eng.indoctrination > 0) { blockedJerry = true; continue }
    const ang = Math.atan2(e.y - p.y, e.x - p.x)
    // v59 联机：客人挥中房主权威实体——伤害上报房主结算（快照回同步 hp/死亡/激怒），
    // 本地只做打击反馈（血迹/挥中音效），不扣血不击杀（防两端状态与掉落分叉）
    if (mpHurtEntity(eng, e, thingBody ? edmg * 0.25 : edmg)) {
      if (thingBody && (e.turnSlowT ?? 0) <= 0) eng.msg('刀刃没入它皮革般的身体——伤害甚微，但它转头的动作滞涩了一瞬。', 'system')
      hit = true
      eng.bloodParticles(e.x, e.y)
      eng.provoked = true
      continue
    }
    if (nwInvulnerable(e.def.type)) {
      hit = true
      if ((e.turnSlowT ?? 0) <= 0) eng.msg(e.def.type === 'watcher' ? '刀刃从湿滑的巩膜上滑开了。它甚至没有眨眼——它没有眼睑。' : '你砍进了烟雾里。什么也没砍到。', 'system')
      e.turnSlowT = 2
      continue
    }
    if (isWrangler(e.def.type) && wranglerMelee(eng, e)) { hit = true; continue }
    if(e.def.type==='burster'){bursterMelee(eng,e,edmg,!!melee?.heavy);hit=true;eng.provoked=true;continue}
    if (e.def.type === 'tiny') { tinyStruck(eng, e); hit = true; eng.provoked = true; continue }
    if (isVm36(e)) { vm36Struck(eng, e, edmg); hit = true; eng.provoked = true; continue } // [vending] Entity 36：普通武器几乎打不动，打了就活化
    if (e.def.type === 'partygoer') {
      // 派对客：按准星打中的部位结算（面条臂 / 头脸 / 躯干），胸甲闭合时躯体减伤 90%，倒地后只能用火烧尽
      const dir = crosshairDirection(), off = seatedEyeOffset(eng)
      const part = partygoerAimPart(eng, e, { ox: p.x + off.x, oy: p.y + off.y, oz: p.z + seatedEyeHeight(eng), dx: dir.x, dy: dir.y, dz: dir.z })
      partygoerDamage(eng, e, edmg, 'melee', part)
    } else if (thingBody) {
      // v58：体节命中——伤害大减，但让它转头迟滞 3 秒；巨躯不被击退
      e.hp -= edmg * 0.25
      if ((e.turnSlowT ?? 0) <= 0) eng.msg('刀刃没入它皮革般的身体——伤害甚微，但它转头的动作滞涩了一瞬。', 'system')
      e.turnSlowT = 3
    } else if (e.def.type === 'jerry') {
      e.hp -= edmg // 鹉主杰瑞：不被击退（它在栖木/神父肩上），受伤后尖啸反扑（jerryAI.jerryHurt）
      jerryHurt(eng, e)
    } else {
      e.hp -= edmg
      // 击退位移做墙体校验：落点不可走（墙/实心结构/不可达高差）则不位移——
      // 击杀后的尸体同样不会被钉进墙里（尸体落点即击退落点）
      const kx = e.x + Math.cos(ang) * 0.4, ky = e.y + Math.sin(ang) * 0.4
      const ktx = Math.floor(kx), kty = Math.floor(ky)
      const l9StreetBound = eng.levelDef.id === 9
        && (e.def.type === 'watcher' || e.def.type === 'strider' || e.def.type === 'mangled')
      if (eng.entityWalkH(m, ktx, kty, bandOfZ(e.z)) !== null
        && (!l9StreetBound || m.outdoor[kty * m.w + ktx] === 1)) { e.x = kx; e.y = ky }
    }
    e.stunT = melee ? melee.stun : 0.35
    // v47：伤害鹉主杰瑞——信众哗然：jerry 声望立即 -50（每次）
    if (e.def.type === 'jerry') eng.hurtJerryRep()
    hit = true
    eng.bloodParticles(e.x, e.y, bloodKind(e))
    skinStealerHit(eng, e) // v77：伪装中被打伤 → 透明的血露馅
    eng.provoked = true // v23：主动挑衅解除「Level 11 Effect」的被动状态
    if (e.def.type === 'ferren') eng.changeRep('bntg', -15) // v35：攻击 Ferren 惹恼 B.N.T.G.（杀死罚更重，见 killCheck）
    if (e.def.passive && !e.def.noRetaliate) { e.provoked = true; e.targetEnt = undefined; e.state = 'chase'; e.stateT = 0 } // 激怒无面灵（被攻击才反击；Ferren 绝不反击不进 chase）
    if (e.def.type === 'corpserat' && e.provoked) eng.provokeRatPack(e) // v44：尸鼠群体激怒——周围同伴一同反击同一目标
    eng.killCheck(e)
  }
  if (hit) { audio.hit(); eng.camShake = Math.min(1, eng.camShake + (melee?.heavy ? 0.3 : 0.15)) }
  else if (mothEggSwing(eng)) { audio.hit() }
  else if (blockedJerry) eng.msg('你下不去手——鹉主的蓝羽在你眼中只剩神圣。（教化约束：驯服祂才能解除）', 'system')
  // v35：挥击波及 NPC——降低其所属团体声望（NPC 是居民不是实体：不会受伤、不会死亡）
  let blockedFollower = false // v47：教化约束——被拦下的对信众挥击
  for (const n of eng.npcs) {
    if (n.dead || n.def.ambient) continue
    if ((n.floor ?? 0) !== bandOfPlayerZ(m, p.z, p.x, p.y)) continue // v46：隔层打不到（夹楼 NPC 不会被穿楼板挥中；v56 七轮：玩家带按实际楼层钳制）
    const d = Math.hypot(n.x - p.x, n.y - p.y)
    if (d > 1.8) continue
    const ang = Math.atan2(n.y - p.y, n.x - p.x)
    let ndiff = Math.abs(ang - p.facing)
    if (ndiff > Math.PI) ndiff = Math.PI * 2 - ndiff
    if (ndiff > 0.7) continue
    const witness=eng.npcs.find(w=>!w.dead&&w.id!==n.id&&Math.hypot(w.x-p.x,w.y-p.y)<8&&eng.los(w.x,w.y,p.x,p.y))
    if(witness)witnessedOffense(eng,`assault:${eng.player.level}:${eng.career.clock.toFixed(3)}:${n.id}`,witness.id)
    // v39：BRC 员工——跳过 changeRep(-15)：不立即降声望，改记未告发次数（坦白时结清）。
    // 员工不受攻击影响（不逃跑/不反击/不停手），但可被杀死；敌对员工被杀死不另记罪（已坦白结清）
    if (n.def.faction === 'brc') {
      const dmg2 = dmgIn
      n.hp = (n.hp ?? 55) - dmg2
      eng.bloodParticles(n.x, n.y)
      audio.hit()
      eng.camShake = Math.min(1, eng.camShake + 0.15)
      if (n.hp <= 0) {
        n.dead = true; n.deathT = 1.4
        p.kills++
        if (!n.hostile) {
          eng.brcSin.killed++
          eng.msg(`${n.def.name} 一声不响地倒下了——周围的员工没有一个人停下手里的活。（未告发的杀死 ×${eng.brcSin.killed}）`, 'damage')
        } else eng.msg(`${n.def.name} 倒下了。`, 'loot')
      } else if (!n.hostile) {
        eng.brcSin.hurt++
        eng.msg(`你攻击了 ${n.def.name}——对方没有任何反应，继续手中的活。（未告发的伤害 ×${eng.brcSin.hurt}）`, 'damage')
      }
      break
    }
    // v45：信众 NPC——与 BRC 员工同契约：可伤害/可杀死；非敌对时攻击会重降声望（并立即招致敌意）
    if (n.def.faction === 'jerry') {
      // v47：教化约束——教化值 ≥50 后无法再攻击信众 NPC（他们是你的兄弟姐妹；驯服清零后解除）
      if (eng.indoctrination >= 50) { blockedFollower = true; continue }
      const dmg2 = dmgIn
      n.hp = (n.hp ?? 45) - dmg2
      eng.bloodParticles(n.x, n.y)
      audio.hit()
      eng.camShake = Math.min(1, eng.camShake + 0.15)
      if (n.hp <= 0) {
        n.dead = true; n.deathT = 1.4
        p.kills++
        if (!n.hostile) {
          eng.changeRep('jerry', -30) // 杀死信众：信众永远不会原谅
          eng.msg(`${n.def.name} 倒下了——满墙海报上的鹉主仿佛在看着你。`, 'damage')
        } else eng.msg(`${n.def.name} 倒下了。`, 'loot')
      } else if (!n.hostile) {
        eng.changeRep('jerry', -15)
        eng.msg(`你攻击了 ${n.def.name}——信众视此为宣战。`, 'damage')
        audio.aggro()
      }
      break
    }
    eng.changeRep(n.def.faction ?? 'meg', -15)
    n.bubbleText = '你在干什么？！'
    n.bubbleT = 3
    eng.msg(`你攻击了 ${n.def.name}——周围的人都看见了。（声望下降）`, 'damage')
    audio.aggro()
    break // 一次挥击只结算一名 NPC
  }
  if (blockedFollower) eng.msg('你下不去手——他们是你的兄弟姐妹。（教化约束：驯服鹉主才能解除）', 'system')
  // 空手/武器挥击也产生噪音（可主动威慑猎犬）
  eng.noiseEvent(p.x, p.y, melee?.heavy ? 11 : 8, false)
  // 近战重制：什么都没打中时，沿准星检查是否砸到了墙（弹刀）
  let wall = false
  if (melee && !hit && !blockedJerry) {
    const tr = traceCrosshair(eng, melee.reach)
    wall = !tr.entity && tr.travel < melee.reach - 0.05
  }
  return { hit, wall }
}

// ---------- v28：可投掷道具 ----------
/** 掷出手持的可投掷物品（消耗 1 个；订书机/玻璃珠落地后可捡回） */
export function throwHeld(eng: Engine, type: string) {
  if (eng.handsStowed||(nguithrInputLock(eng)||armsInputLock(eng))) return
  const p = eng.player
  const slot = p.hotbar[p.selected]
  if (!slot || slot.type !== type) return
  slot.count--
  if (slot.count <= 0) p.hotbar[p.selected] = null
  audio.swing()
  const water = underwater(eng) // [swim 阶段 3] 水下投掷：出手慢、受水阻、慢慢下沉——射程约一半
  const speed = 9 * (water ? SWIM.THROW_SPEED : 1)
  const dir = crosshairDirection()
  const lead = type==='glowstick'?.08:.38
  const offset = seatedEyeOffset(eng)
  eng.projectiles.push({
    id: eng.projId++, type,
    x: p.x + offset.x + dir.x * lead, y: p.y + offset.y + dir.y * lead,
    z: p.z + seatedEyeHeight(eng) + dir.z * lead, floorZ: p.z,
    vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed,
    ...(water ? { water: true } : {}),
  })
  eng.msg(`你掷出了${ITEMS[type].name}。`, 'system')
  eng.noiseEvent(p.x, p.y, 4, false)
}

// ---------- v32：滋水枪 / 迁跃浆果 ----------
/** 滋水枪储罐容量（份数）：9 瓶 × 每瓶 3 份 = 27 */
export const SQUIRT_CAP = 27
/** 往滋水枪储罐装入 1 瓶液体（3 份喷射量；储罐只能装一种液体，清水无需对应物品） */
export function loadSquirt(eng: Engine, liquid: 'water' | 'almond' | 'cashew' | 'liquidpain' | 'acid' | 'memoryjuice' | 'laughrepellent'): boolean {
  if (eng.handsStowed||(nguithrInputLock(eng)||armsInputLock(eng))) return false
  const NAME = SQUIRT_LIQUID_NAME
  if (eng.squirtTank !== 'none' && eng.squirtTank !== liquid) {
    eng.msg(`储罐里还有别的液体——喷完或喝完才能换。`, 'system')
    return false
  }
  if (eng.squirtAmmo >= SQUIRT_CAP) { eng.msg(`储罐已经装满了。（${SQUIRT_CAP}/${SQUIRT_CAP}）`, 'system'); return false }
  const src = SQUIRT_LIQUID_SRC[liquid]
  if (src && !eng.hasItem(src)) { eng.msg(`背包里没有${NAME[liquid]}。`, 'system'); return false }
  if (src) eng.consumeItem(src)
  eng.squirtTank = liquid
  eng.squirtAmmo = Math.min(SQUIRT_CAP, eng.squirtAmmo + 3)
  audio.pickup()
  eng.msg(`装入 1 瓶${NAME[liquid]}（储罐 ${eng.squirtAmmo}/${SQUIRT_CAP}）${squirtActsAsWater(liquid) && liquid !== 'water' ? '——效果等同清水' : ''}。`, 'loot')
  return true
}

/** 清空储罐（把残液倒掉，换液体免喷完） */
export function clearSquirt(eng: Engine) {
  if (eng.handsStowed||(nguithrInputLock(eng)||armsInputLock(eng))) return
  if (eng.squirtTank === 'none') { eng.msg('储罐本来就是空的。', 'system'); return }
  const NAME = SQUIRT_LIQUID_NAME
  eng.msg(`倒空了储罐里的${NAME[eng.squirtTank]}（${eng.squirtAmmo} 份残液）。`, 'system')
  eng.squirtTank = 'none'
  eng.squirtAmmo = 0
}
// ---------- v51：Object 5 糖果效果 ----------

/** 纸片人斯坦利：瞬移到最近的「无阻挡开阔墙面」（贴墙地板且无实心结构遮挡） */
export function stanleyTeleport(eng: Engine) {
  const p = eng.player, m = eng.map!
  let best: { x: number; y: number; d: number } | null = null
  for (let y = 1; y < m.h - 1; y++) {
    for (let x = 1; x < m.w - 1; x++) {
      const i = y * m.w + x
      if (m.tiles[i] !== 1) continue
      const wall = m.tiles[i + 1] !== 1 || m.tiles[i - 1] !== 1 || m.tiles[i + m.w] !== 1 || m.tiles[i - m.w] !== 1
      if (!wall) continue
      if (m.structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)) continue
      const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y)
      if (d < 1.5) continue // 不落在脚下
      if (!best || d < best.d) best = { x, y, d }
    }
  }
  if (best) {
    p.x = best.x + 0.5; p.y = best.y + 0.5
    p.z = groundHeightAt(m, p.x, p.y)
    eng.camShake = Math.min(1, eng.camShake + 0.3)
    eng.msg('你突然扁成了一张纸——再展开时，已经贴在了最近的墙面上。（饥饿+5 理智+5）', 'lore')
  } else {
    eng.msg('你扁了一瞬又弹了回来——附近没有可以贴上去的开阔墙面。（饥饿+5 理智+5）', 'lore')
  }
}

/** 枪糖：左键发射巧克力子弹（直线 12m，1 点伤害，命中也只是糊一脸） */
export function shootChocolate(eng: Engine) {
  if (eng.handsStowed||(nguithrInputLock(eng)||armsInputLock(eng))) return
  if (blockUnderwaterGun(eng, eng.swim)) return
  const p = eng.player
  if (!eng.dev.noAttackCooldown && eng.chocoCd > 0) return
  eng.chocoCd = eng.dev.noAttackCooldown ? 0 : 0.22
  camoSound(eng, eng.player.x, eng.player.y, 14) // [L8-camo] 枪声
  audio.swing()
  armsGunshot(eng) // 开枪声：通风管里的手臂听得见
  const aim = crosshairDirection()
  const flat = Math.hypot(aim.x, aim.y) || 1
  const dx = aim.x / flat, dy = aim.y / flat
  const pc = '#7a4a2a' // 巧克力色
  const ray = traceCrosshair(eng, 12)
  const hitEnt = ray.entity
  // 弹道视觉（同滋水枪：枪口→准星点）
  const rfx = -dy, rfy = dx
  const tx = ray.x, ty = ray.y, tz = ray.z
  const mx = p.x + dx * 0.5 + rfx * 0.25, my = p.y + dy * 0.5 + rfy * 0.25, mz = p.z + 1.25
  const dist = Math.max(0.5, Math.hypot(tx - mx, ty - my, tz - mz))
  for (let s = 0.3; s < dist; s += 0.3) {
    const k = s / dist
    eng.particles.push({
      x: mx + (tx - mx) * k, y: my + (ty - my) * k,
      vx: ((tx - mx) / dist) * 9, vy: ((ty - my) / dist) * 9,
      t: 0, life: 0.22, color: pc, size: 1.2, z: mz + (tz - mz) * k, vz: ((tz - mz) / dist) * 9,
    })
  }
  if (hitEnt) {
    const e = hitEnt
    if (!mpHurtEntity(eng, e, 1)) { e.hp -= 1; eng.killCheck(e) } // v59：联机实体伤害走房主结算
    e.stunT = Math.max(e.stunT, 0.1)
    audio.hit()
    eng.msg(`巧克力子弹啪叽糊在${e.def.name}身上。（1 点伤害）`, 'system')
  }
}

/** 滋水枪喷射：清水无效果；杏仁水雾轻伤实体，腰果水雾造成更大伤害 */
export function squirt(eng: Engine) {
  if (eng.handsStowed||(nguithrInputLock(eng)||armsInputLock(eng))) return
  if (blockUnderwaterGun(eng, eng.swim)) return
  const p = eng.player
  if (eng.squirtAmmo <= 0 || eng.squirtTank === 'none') {
    eng.msg('储罐是空的——先装入液体。', 'system')
    return
  }
  eng.squirtAmmo--
  audio.swing()
  const dmg = eng.squirtTank === 'liquidpain' ? 60 : eng.squirtTank === 'acid' ? BURSTER.acidShot : eng.squirtTank === 'cashew' ? 20 : 8 // 液态痛苦：腐蚀性高伤；酸液：中等直伤 + 持续腐蚀
  const pc = eng.squirtTank === 'acid' ? '#c9d83a' : eng.squirtTank === 'liquidpain' ? '#d94a3a' : eng.squirtTank === 'cashew' ? '#c9a05a' : eng.squirtTank === 'almond' ? '#c9e8a0' : eng.squirtTank === 'memoryjuice' ? '#e0a050' : '#9adfff'
  // 三维水线：实际命中、墙地遮挡与画面特效全部沿同一条准星射线。
  const aim = crosshairDirection()
  const flat = Math.hypot(aim.x, aim.y) || 1
  const dx = aim.x / flat, dy = aim.y / flat
  const facing = Math.atan2(dy, dx)
  const ray = traceCrosshair(eng, 4.5)
  const hitEnt = ray.entity
  // 水线视觉：从右手枪模口射出、笔直射向准星所指点（枪口=右手下前方；目标=视线射线末端，含俯仰）
  const rfx = -dy, rfy = dx // 右手方向（由实际准星射线水平投影求得）
  const tx = ray.x, ty = ray.y, tz = ray.z // 准星目标点
  const mx = p.x + dx * 0.5 + rfx * 0.25, my = p.y + dy * 0.5 + rfy * 0.25, mz = p.z + 1.25 // 枪口（右手下前方）
  const dist = Math.max(0.5, Math.hypot(tx - mx, ty - my, tz - mz))
  for (let s = 0.26; s < dist; s += 0.26) {
    const k = s / dist
    eng.particles.push({
      x: mx + (tx - mx) * k, y: my + (ty - my) * k,
      vx: ((tx - mx) / dist) * 5, vy: ((ty - my) / dist) * 5,
      t: 0, life: 0.3,
      color: pc, size: 1.6, z: mz + (tz - mz) * k, vz: ((tz - mz) / dist) * 5,
    })
  }
  for (let i = 0; i < 6; i++) {
    const a = facing + (Math.random() - 0.5) * 1.2
    eng.particles.push({
      x: tx, y: ty,
      vx: Math.cos(a) * (1 + Math.random() * 2), vy: Math.sin(a) * (1 + Math.random() * 2),
      t: 0, life: 0.3, color: pc, size: 1.4, z: tz,
    })
  }
  if (hitEnt && hitEnt.def.type === 'burster') {
    bursterSquirt(eng, hitEnt, eng.squirtTank) // 爆酸者：清水让它僵直，杏仁水重度灼伤
    audio.hit()
  } else if (hitEnt) {
    const e = hitEnt
    if (e.def.type === 'arachnid' && arachnidSquirted(eng, e, eng.squirtTank)) { /* [L8-arachnid] 螨群被泼散 */ } else if (eng.squirtTank !== 'water') {
      eng.provoked = true // v23：主动挑衅解除「Level 11 Effect」的被动状态
      if (!mpHurtEntity(eng, e, dmg)) { // v59：联机实体伤害走房主结算
        e.hp -= dmg
        if (e.def.passive) { e.provoked = true; e.targetEnt = undefined; e.state = 'chase'; e.stateT = 0 } // 激怒无面灵（与近战受击一致）
        if (e.def.type === 'corpserat' && e.provoked) eng.provokeRatPack(e) // v44：尸鼠群体激怒（与近战受击一致）
        eng.killCheck(e)
      }
      e.stunT = 0.4
      audio.hit()
      if (eng.squirtTank === 'almond' && e.def.type === 'duller' && !e.dead) dullerSquirted(eng, e) // v63：钝人厌恶杏仁水
      if (eng.squirtTank === 'acid' && !e.dead) acidBurnEntity(eng, e) // 爆酸者酸液：命中后持续腐蚀
      eng.msg(eng.squirtTank === 'acid' ? `黄色酸线正中${e.def.name}——它的表皮冒起白烟，开始被腐蚀。` : eng.squirtTank === 'liquidpain' ? `水线正中${e.def.name}——液态痛苦嘶嘶地腐蚀着它的表皮。` : eng.squirtTank === 'cashew' ? `水线正中${e.def.name}——苦涩的腰果水把它灼得发颤。` : `水线正中${e.def.name}，甜腻的杏仁水四溅。`, 'system')
    } else {
      eng.msg(`水线滋了${e.def.name}一身清水——什么效果也没有。`, 'system')
    }
  } else {
    eng.msg(squirtActsAsWater(eng.squirtTank) ? (eng.squirtTank === 'water' ? '你喷出一道清水——什么效果也没有。' : `你喷出一道${SQUIRT_LIQUID_NAME[eng.squirtTank as 'water']}——和清水一样，什么效果也没有。`) : eng.squirtTank === 'acid' ? '你喷出一道冒烟的黄色酸线。' : eng.squirtTank === 'liquidpain' ? '你喷出一道淡红色的腐蚀水线。' : eng.squirtTank === 'cashew' ? '你喷出一道苦涩的腰果水线。' : '你喷出一道甜腻的杏仁水线。', 'system')
  }
  if (eng.squirtAmmo <= 0) {
    eng.squirtTank = 'none'
    eng.msg('储罐空了。', 'system')
  }
}
export function updateProjectiles(eng: Engine, dt: number) {
  const m = eng.map!
  for (const pr of eng.projectiles) {
    const nx = pr.x + pr.vx * dt, ny = pr.y + pr.vy * dt
    const oldZ = pr.z
    if (pr.water) { const g = Math.exp(-SWIM.THROW_DRAG * dt); pr.vx *= g; pr.vy *= g; pr.vz = pr.vz * g - SWIM.THROW_G * dt }
    else pr.vz -= 9.8 * dt
    const nz = oldZ + pr.vz * dt
    if(pr.type==='glowstick')pr.floorZ=groundHeightAt(m,pr.x,pr.y,bandOfPlayerZ(m,pr.floorZ,pr.x,pr.y))
    if (nz <= pr.floorZ) { pr.done = true; eng.landProjectile(pr, pr.x, pr.y); continue }
    // 用短射线段而非旧 tileAt 整格占地判定，防止快速投掷物穿过薄模型，
    // 也不会在异形装饰的透明空隙外凭空撞停。
    const band = bandOfPlayerZ(m, pr.floorZ, pr.x, pr.y)
    const dist = Math.hypot(nx - pr.x, ny - pr.y, nz - oldZ)
    const steps = Math.max(1, Math.ceil(dist / .08))
    let blocked = false
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const sx = pr.x + (nx - pr.x) * t, sy = pr.y + (ny - pr.y) * t, sz = oldZ + (nz - oldZ) * t
      if (wallAt(m, Math.floor(sx), Math.floor(sy), band) || structBlocksSight(m, sx, sy, sz, band)) { blocked = true; break }
      if (nguithrProjectileHit(eng, sx, sy, sz)) { pr.x = sx; pr.y = sy; blocked = true; break } // Nguithr'xurh：砸破网囊 / 命中本体
    }
    if (blocked) { pr.done = true; eng.landProjectile(pr, pr.x, pr.y); continue }
    pr.x = nx; pr.y = ny; pr.z = nz
  }
  eng.projectiles = eng.projectiles.filter((pr) => !pr.done)
}

export function landProjectile(eng: Engine, pr: Projectile, x: number, y: number) {
  const m = eng.map!
  const kind = ITEMS[pr.type].throw
  camoProjectileLanded(eng, x, y) // [L8-camo] 所有投掷物落点都会发声，可引开迷彩爬行者
  const tx = Math.floor(x), ty = Math.floor(y)
  if (eng.levelDef.id === 7 && tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && m.liquid[ty * m.w + tx] === 1) {
    audio.splash(0.6)
    eng.noiseEvent(x, y, 12, true)
  }
  switch (kind) {
    case 'light': {
      const z=groundHeightAt(m,x,y,bandOfPlayerZ(m,pr.floorZ,x,y))
      if(m.inf?.l0&&z<=-8)break // No recoverable object hovering over a bottomless pit.
      const item={id:Math.random(),type:pr.type,x,y,z}
      m.items.push(item)
      const inf=m.inf
      inf?.chunks.get(`${Math.floor((x+inf.ox)/32)},${Math.floor((y+inf.oy)/32)}`)?.items.push(item)
      eng.msg(eng.levelDef.noFlashlight?'荧光棒落在地上，这里仍然没有光。':'荧光棒落在地上，发出柔和的绿光，可以再次拾取。','system')
      break
    }
    case 'explode': { // 汽油罐：范围伤害
      eng.noiseEvent(x, y, 18, true)
      eng.camShake = Math.min(1, eng.camShake + 0.5)
      audio.hit()
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2
        eng.particles.push({ x, y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, t: 0, life: 0.6, color: i % 3 === 0 ? '#e8823c' : '#c93a1e', size: 3 + Math.random() * 3 })
      }
      let n = 0
      arachnidExplosion(eng, x, y) // [L8-arachnid] 火焰烧掉附近的蛛网
      for (const e of m.entities) {
        if (e.dead || (e.disguised && e.disguised !== 'human')) continue
        const d = Math.hypot(e.x - x, e.y - y)
        if (d > 3.2 || Math.abs(e.z - pr.floorZ) >= 1) continue
        if (e.def.type === 'jerry' && eng.indoctrination > 0) continue // v47：教化约束——投掷波及对鹉主无效
        if (isWrangler(e.def.type)) { if (wranglerFire(eng, e, d)) n++; continue } // 牧蛇：只有幼体会被烧死，死了引来母亲
        if (e.def.type === 'arachnid' && arachnidFireHit(eng, e, d < 2.2 ? 45 : 20)) { n++; continue }
        if (e.def.type === 'partygoer') { partygoerDamage(eng, e, d < 2.2 ? 45 : 20, 'fire'); e.stunT = Math.max(e.stunT, e.pg?.phase === 'burn' ? 0 : 0.6); n++; continue } // 派对客：皮肤防火；倒地/爬行的「尸体」被点燃即烧尽
        if (!mpHurtEntity(eng, e, d < 2.2 ? 45 : 20)) { e.hp -= d < 2.2 ? 45 : 20; eng.killCheck(e) } // v59：联机走房主结算
        e.stunT = Math.max(e.stunT, 0.6)
        eng.bloodParticles(e.x, e.y, bloodKind(e))
        if (e.def.type === 'jerry') { eng.hurtJerryRep(); if (!e.dead) jerryHurt(eng, e) } // v47：伤害鹉主 → 信众哗然 -50；重制：尖啸反扑
        n++
      }
      wranglerFireEggs(eng, x, y)
      eng.msg(n > 0 ? `汽油罐轰然炸开——火焰吞没了 ${n} 个实体。` : '汽油罐轰然炸开，火焰很快熄灭了。', n > 0 ? 'damage' : 'system')
      break
    }
    case 'shock': { // 瓶装闪电：电击 + 长眩晕
      eng.noiseEvent(x, y, 12, true)
      audio.spark()
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2
        eng.particles.push({ x, y, vx: Math.cos(a) * 2.2, vy: Math.sin(a) * 2.2, t: 0, life: 0.4, color: '#9ad2ff', size: 2 + Math.random() * 2 })
      }
      let n = 0
      for (const e of m.entities) {
        if (e.dead || (e.disguised && e.disguised !== 'human')) continue
        const d = Math.hypot(e.x - x, e.y - y)
        if (d > 2.8 || Math.abs(e.z - pr.floorZ) >= 1) continue
        if (e.def.type === 'jerry' && eng.indoctrination > 0) continue // v47：教化约束——投掷波及对鹉主无效
        if (isVm36(e)) { vm36Shocked(eng, e); n++; continue } // [vending] 瓶装闪电是 Entity 36 唯一的克星：重创 + 电晕 8 秒
        if (e.def.type === 'partygoer') { partygoerDamage(eng, e, 20, 'shock'); continue } // 派对客：免疫电击（法拉第笼般的皮肤），也不会被电僵
        if (!mpHurtEntity(eng, e, 20)) { e.hp -= 20; eng.killCheck(e) } // v59：联机走房主结算
        e.stunT = Math.max(e.stunT, 2.5)
        if (e.def.type === 'jerry') { eng.hurtJerryRep(); if (!e.dead) jerryHurt(eng, e) }
        n++
      }
      eng.msg(n > 0 ? `瓶装闪电炸开一团电火花——${n} 个实体被电得僵直。` : '瓶装闪电炸开一团电火花，什么也没电到。', n > 0 ? 'damage' : 'system')
      break
    }
    case 'noise': { // 订书机：落地脆响引怪（可捡回）
      m.items.push({ id: Math.random(), type: pr.type, x, y })
      eng.noiseEvent(x, y, 16, true)
      eng.msg('订书机「啪」地砸在远处——有什么听见了。', 'system')
      break
    }
    case 'lure': { // 氙气玻璃珠：引路者的筑巢材料（可捡回）
      m.items.push({ id: Math.random(), type: pr.type, x, y })
      eng.noiseEvent(x, y, 8, false)
      const n = lightguideLure(eng, x, y) // [L8-lightguide] 附近的向导全部过来守巢（nest_orbit）
      eng.msg(n > 0 ? '玻璃珠滚落在地——蓝绿色的微光朝它聚拢过来。' : '玻璃珠滚落在地，发出清脆的声响。', n > 0 ? 'lore' : 'system')
      break
    }
  }
}

/** 实体血液种类：v77 窃皮者半透明（[L8-lightguide] 微光向导也走半透明碎光，不溅红血）；v78 悲尸是浓稠的红褐分泌物混着棕色淤泥 */
export const bloodKind = (e: Entity): boolean | 'wretch' => (e.def.type === 'skinstealer' || e.def.type === 'lightguide' ? true : e.def.type === 'wretch' ? 'wretch' : false)
/** clear：v77 窃皮者的血完全半透明（水样、带一点反光）；'wretch'：v78 悲尸红褐稠液（量多、落得慢）；人类/其他实体为红色 */
export function bloodParticles(eng: Engine, x: number, y: number, clear: boolean | 'wretch' = false) {
  const wr = clear === 'wretch'
  for (let i = 0; i < (wr ? 11 : 8); i++) {
    const a = Math.random() * Math.PI * 2, sp = wr ? 1.2 : 2
    eng.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: clear === true ? 0.65 : wr ? 0.7 : 0.5, color: clear === true ? (i % 3 ? '#cfe0e4' : '#f4fafb') : wr ? (i % 3 ? '#6e2a1c' : '#5a3a16') : '#b3352b', size: wr ? 2.5 + Math.random() * 2.5 : 2 + Math.random() * 2, ...(clear === true ? { opacity: 0.28 } : {}) })
  }
}
export function steamParticles(eng: Engine, x: number, y: number) {
  eng.particles.push({ x, y, vx: (Math.random() - 0.5) * 0.5, vy: -1.5 - Math.random(), t: 0, life: 1.2, color: 'rgba(207,196,180,0.5)', size: 4 + Math.random() * 4 })
}
// ---- v13：液体粒子 ----
export function splashParticles(eng: Engine, x: number, y: number, z: number) {
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, sp = 0.8 + Math.random() * 2.2
    eng.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.45 + Math.random() * 0.3, color: '#bfe6ff', size: 0.05 + Math.random() * 0.06, z: z + 0.15, vz: 1.2 + Math.random() * 1.8 })
  }
}
export function bubbleParticles(eng: Engine, x: number, y: number, z: number) {
  for (let i = 0; i < 4; i++) {
    eng.particles.push({ x: x + (Math.random() - 0.5) * 0.5, y: y + (Math.random() - 0.5) * 0.5, vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2, t: 0, life: 0.8 + Math.random() * 0.5, color: '#9fd4f0', size: 0.03 + Math.random() * 0.03, z, vz: 0.8 + Math.random() * 0.6 })
  }
}
export function rippleParticles(eng: Engine, x: number, y: number) {
  const canal=eng.levelDef.id===11?l11MapWater(eng.map!,x,y):null
  for (let i = 0; i < 3; i++) {
    const a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.3
    eng.particles.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: Math.cos(a) * 0.7, vy: Math.sin(a) * 0.7, t: 0, life: 0.5, color: '#7fb8d8', size: 0.04 + Math.random() * 0.03, z: canal?canal.surface+.03:eng.inLiquid === 1 ? 0.06 : -0.16, vz: 0 })
  }
}
/** 引擎粒子推进（原 step「---- 粒子 ----」内联段） */
export function updateParticles(eng: Engine, dt: number) {
  // ---- 粒子 ----
  for (const pt of eng.particles) { pt.t += dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; if (pt.z !== undefined) pt.z += (pt.vz ?? 0) * dt }
  eng.particles = eng.particles.filter((pt) => pt.t < pt.life).slice(-120)
}
