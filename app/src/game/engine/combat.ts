// v53：战斗/投掷/击退 + 伤害/死亡结算 + 粒子生成 —— 自 engine.ts 拆分，逻辑逐语句搬运。
import { ITEMS } from '../content/items'
import { tileAt, bandOfZ, bandOfPlayerZ, groundHeightAt } from '../world/mapgen'
import { look } from '../core/renderer3d'
import { audio } from '../core/audio'
import { recordEntityEncounter, type Entity } from '../entities'
import type { Engine, Projectile } from '../engine'
import { clearRunSlots } from './save'

export function hurtPlayer(eng: Engine, dmg: number, source: string) {
  if (eng.dev.god) return
  const p = eng.player
  p.hp -= dmg * (eng.manmadeT > 0 ? 0.9 : 1) // v51：人制品效应中受到的伤害 -10%
  p.sanity = Math.max(0, p.sanity - 4)
  eng.camShake = Math.min(1, eng.camShake + 0.6)
  audio.hurt()
  eng.emit({ kind: 'damage' })
  eng.msg(`受到 ${Math.round(dmg)} 点伤害（${source}）`, 'damage')
  if (p.hp <= 0) eng.die(`被 ${source} 撕碎`)
}

export function die(eng: Engine, cause: string, force = false) {
  if (eng.dev.god && !force) { eng.player.hp = Math.max(eng.player.hp, 20); return }
  eng.over = true
  eng.player.hp = 0
  clearRunSlots(eng) // v29a/v54：死亡后本局进度存档失效（绑定槽 + 自动槽；继续游戏将开新局）
  audio.stopHum(); audio.stopBGM(); audio.stopRain(); audio.setHeartbeat(false, 0) // v54：雨声随死亡停止
  eng.emit({ kind: 'dead', text: cause })
}

// 攻击距离：基础 1.9m，巨型实体按体量加成（v28：原 1.6 过短，近身常常够不到）
export function attackReach(_eng: Engine, e: Entity): number {
  return 1.9 + Math.max(0, (e.def.huge ?? 1) - 1) * 0.6
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
  if (e.dead || e.disguised) return false
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

export function killCheck(eng: Engine, e: Entity) {
  if (e.hp > 0 || e.dead) return
  const p = eng.player, m = eng.map!
  e.dead = true; e.deathT = 1.4
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
  if (e.def.type === 'dryshrimp') {
    const id = Date.now() % 100000 + Math.random()
    m.items.push({ id, type: 'dryshrimp', x: e.x, y: e.y })
    mpDrop(eng, id, 'dryshrimp', e.x, e.y) // v59：联机掉落同步
    return
  }
  if (Math.random() < (p.hasRabbit ? 0.6 : 0.35)) {
    const drops = ['bandage', 'almond', 'canned', 'battery']
    const t0 = drops[Math.floor(Math.random() * drops.length)]
    const t = t0 === 'almond' && Math.random() < 0.1 ? 'cashew' : t0 // v32：腰果水 1/10 替代
    const id = Date.now() % 100000 + Math.random()
    m.items.push({ id, type: t, x: e.x, y: e.y })
    mpDrop(eng, id, t, e.x, e.y) // v59：联机掉落同步
  }
}

export function attack(eng: Engine) {
  const p = eng.player, m = eng.map!
  const held = p.hotbar[p.selected]
  // v51：枪糖生效中——无论当前持有什么，右手都是枪（左键发射巧克力子弹）
  if (eng.gunCandyT > 0) { eng.shootChocolate(); return }
  // 可投掷道具：左键掷出而非近战
  if (held && ITEMS[held.type]?.throw) { eng.throwHeld(held.type); return }
  // v32：滋水枪——左键喷射储罐液体
  if (held?.type === 'squirtgun') { eng.squirt(); return }
  audio.swing()
  eng.attackAnimT = 0.35 // 手部挥砍动画/准心收缩反馈
  eng.attackAnimKind = held && ITEMS[held.type]?.weapon ? 'swing' : 'punch'
  // 开发者模式：一击必杀
  const dmg = eng.dev.oneHit ? 99999 : held ? (ITEMS[held.type].weapon ?? 8) : 8
  let hit = false
  let blockedJerry = false // v47：教化约束——被拦下的对鹉主挥击（提示「你下不去手」）
  for (const e of m.entities) {
    // v58：七层之物——头部之后的体节可被击中：伤害大减，但能迟滞它转头/转身
    let thingBody = false
    if (e.def.type === 'thething' && !e.dead && !e.disguised && !eng.canHit(e)) {
      const reach = eng.attackReach(e)
      for (let i = 0; i < 8 && !thingBody; i++) { // 近似体节链：头后 2.2m 起每 1.35m 一节（v58fix4 随体型增大同步）
        const bx = e.x - Math.cos(e.facing) * (2.2 + i * 1.35), by = e.y - Math.sin(e.facing) * (2.2 + i * 1.35)
        const bd = Math.hypot(bx - p.x, by - p.y)
        if (bd > reach || Math.abs(e.z - p.z) >= 1.2) continue
        if (bd >= 0.9) {
          const ang2 = Math.atan2(by - p.y, bx - p.x)
          let diff2 = Math.abs(ang2 - p.facing)
          if (diff2 > Math.PI) diff2 = Math.PI * 2 - diff2
          if (diff2 > 1.1) continue
        }
        thingBody = true
      }
      if (!thingBody) continue
    } else if (!eng.canHit(e)) continue
    recordEntityEncounter(e) // v54：攻击命中计一次遭遇（按个体去重）
    // v47：教化约束——教化值 >0 后无法再对鹉主出手（驯服清零后解除约束）
    if (e.def.type === 'jerry' && eng.indoctrination > 0) { blockedJerry = true; continue }
    const ang = Math.atan2(e.y - p.y, e.x - p.x)
    // v59 联机：客人挥中房主权威实体——伤害上报房主结算（快照回同步 hp/死亡/激怒），
    // 本地只做打击反馈（血迹/挥中音效），不扣血不击杀（防两端状态与掉落分叉）
    if (mpHurtEntity(eng, e, thingBody ? dmg * 0.25 : dmg)) {
      if (thingBody && (e.turnSlowT ?? 0) <= 0) eng.msg('刀刃没入它皮革般的身体——伤害甚微，但它转头的动作滞涩了一瞬。', 'system')
      hit = true
      eng.bloodParticles(e.x, e.y)
      eng.provoked = true
      continue
    }
    if (thingBody) {
      // v58：体节命中——伤害大减，但让它转头迟滞 3 秒；巨躯不被击退
      e.hp -= dmg * 0.25
      if ((e.turnSlowT ?? 0) <= 0) eng.msg('刀刃没入它皮革般的身体——伤害甚微，但它转头的动作滞涩了一瞬。', 'system')
      e.turnSlowT = 3
    } else {
      e.hp -= dmg
      // 击退位移做墙体校验：落点不可走（墙/实心结构/不可达高差）则不位移——
      // 击杀后的尸体同样不会被钉进墙里（尸体落点即击退落点）
      const kx = e.x + Math.cos(ang) * 0.4, ky = e.y + Math.sin(ang) * 0.4
      if (eng.entityWalkH(m, Math.floor(kx), Math.floor(ky), bandOfZ(e.z)) !== null) { e.x = kx; e.y = ky }
    }
    e.stunT = 0.35
    // v47：伤害鹉主杰瑞——信众哗然：jerry 声望立即 -50（每次）
    if (e.def.type === 'jerry') eng.hurtJerryRep()
    hit = true
    eng.bloodParticles(e.x, e.y)
    eng.provoked = true // v23：主动挑衅解除「Level 11 Effect」的被动状态
    if (e.def.type === 'ferren') eng.changeRep('bntg', -15) // v35：攻击 Ferren 惹恼 B.N.T.G.（杀死罚更重，见 killCheck）
    if (e.def.passive && !e.def.noRetaliate) { e.provoked = true; e.targetEnt = undefined; e.state = 'chase'; e.stateT = 0 } // 激怒无面灵（被攻击才反击；Ferren 绝不反击不进 chase）
    if (e.def.type === 'corpserat' && e.provoked) eng.provokeRatPack(e) // v44：尸鼠群体激怒——周围同伴一同反击同一目标
    eng.killCheck(e)
  }
  if (hit) { audio.hit(); eng.camShake = Math.min(1, eng.camShake + 0.15) }
  else if (blockedJerry) eng.msg('你下不去手——鹉主的蓝羽在你眼中只剩神圣。（教化约束：驯服祂才能解除）', 'system')
  // v35：挥击波及 NPC——降低其所属团体声望（NPC 是居民不是实体：不会受伤、不会死亡）
  let blockedFollower = false // v47：教化约束——被拦下的对信众挥击
  for (const n of eng.npcs) {
    if (n.dead) continue
    if ((n.floor ?? 0) !== bandOfPlayerZ(m, p.z)) continue // v46：隔层打不到（夹楼 NPC 不会被穿楼板挥中；v56 七轮：玩家带按实际楼层钳制）
    const d = Math.hypot(n.x - p.x, n.y - p.y)
    if (d > 1.8) continue
    const ang = Math.atan2(n.y - p.y, n.x - p.x)
    let ndiff = Math.abs(ang - p.facing)
    if (ndiff > Math.PI) ndiff = Math.PI * 2 - ndiff
    if (ndiff > 0.7) continue
    // v39：BRC 员工——跳过 changeRep(-15)：不立即降声望，改记未告发次数（坦白时结清）。
    // 员工不受攻击影响（不逃跑/不反击/不停手），但可被杀死；敌对员工被杀死不另记罪（已坦白结清）
    if (n.def.faction === 'brc') {
      const dmg2 = eng.dev.oneHit ? 99999 : held ? (ITEMS[held.type].weapon ?? 8) : 8
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
      const dmg2 = eng.dev.oneHit ? 99999 : held ? (ITEMS[held.type].weapon ?? 8) : 8
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
  eng.noiseEvent(p.x, p.y, 8, false)
}

// ---------- v28：可投掷道具 ----------
/** 掷出手持的可投掷物品（消耗 1 个；订书机/玻璃珠落地后可捡回） */
export function throwHeld(eng: Engine, type: string) {
  const p = eng.player
  const slot = p.hotbar[p.selected]
  if (!slot || slot.type !== type) return
  slot.count--
  if (slot.count <= 0) p.hotbar[p.selected] = null
  audio.swing()
  eng.attackAnimT = 0.35
  eng.attackAnimKind = 'throw'
  const speed = 9
  eng.projectiles.push({
    id: eng.projId++, type,
    x: p.x + Math.cos(p.facing) * 0.4, y: p.y + Math.sin(p.facing) * 0.4,
    z: p.z + 1.4, floorZ: p.z,
    vx: Math.cos(p.facing) * speed, vy: Math.sin(p.facing) * speed, vz: 2.6,
  })
  eng.msg(`你掷出了${ITEMS[type].name}。`, 'system')
  eng.noiseEvent(p.x, p.y, 4, false)
}

// ---------- v32：滋水枪 / 迁跃浆果 ----------
/** 滋水枪储罐容量（份数）：9 瓶 × 每瓶 3 份 = 27 */
export const SQUIRT_CAP = 27
/** 往滋水枪储罐装入 1 瓶液体（3 份喷射量；储罐只能装一种液体，清水无需对应物品） */
export function loadSquirt(eng: Engine, liquid: 'water' | 'almond' | 'cashew' | 'liquidpain'): boolean {
  const NAME = { water: '清水', almond: '杏仁水', cashew: '腰果水', liquidpain: '液态痛苦' } as const
  if (eng.squirtTank !== 'none' && eng.squirtTank !== liquid) {
    eng.msg(`储罐里还有别的液体——喷完或喝完才能换。`, 'system')
    return false
  }
  if (eng.squirtAmmo >= SQUIRT_CAP) { eng.msg(`储罐已经装满了。（${SQUIRT_CAP}/${SQUIRT_CAP}）`, 'system'); return false }
  if (liquid !== 'water' && !eng.hasItem(liquid)) { eng.msg(`背包里没有${NAME[liquid]}。`, 'system'); return false }
  if (liquid !== 'water') eng.consumeItem(liquid)
  eng.squirtTank = liquid
  eng.squirtAmmo = Math.min(SQUIRT_CAP, eng.squirtAmmo + 3)
  audio.pickup()
  eng.msg(`装入 1 瓶${NAME[liquid]}（储罐 ${eng.squirtAmmo}/${SQUIRT_CAP}）。`, 'loot')
  return true
}

/** 清空储罐（把残液倒掉，换液体免喷完） */
export function clearSquirt(eng: Engine) {
  if (eng.squirtTank === 'none') { eng.msg('储罐本来就是空的。', 'system'); return }
  const NAME = { water: '清水', almond: '杏仁水', cashew: '腰果水', liquidpain: '液态痛苦' } as const
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
  const p = eng.player, m = eng.map!
  if (eng.chocoCd > 0) return
  eng.chocoCd = 0.22
  audio.swing()
  eng.attackAnimT = 0.2
  eng.attackAnimKind = 'spray'
  const dx = Math.cos(p.facing), dy = Math.sin(p.facing)
  const pc = '#7a4a2a' // 巧克力色
  let hitEnt: Entity | null = null
  let travel = 12
  for (let s = 0.5; s <= 12; s += 0.2) {
    const rx = p.x + dx * s, ry = p.y + dy * s
    if (tileAt(m, Math.floor(rx), Math.floor(ry)) !== 1) { travel = s - 0.2; break }
    for (const e of m.entities) {
      if (e.dead || e.hidden) continue
      if (Math.hypot(e.x - rx, e.y - ry) < 0.45) { hitEnt = e; travel = s; break }
    }
    if (hitEnt) break
  }
  // 弹道视觉（同滋水枪：枪口→准星点）
  const rfx = -Math.sin(p.facing), rfy = Math.cos(p.facing)
  const cp = Math.cos(look.pitch)
  const tx = p.x + dx * travel * cp, ty = p.y + dy * travel * cp
  const tz = p.z + 1.55 + Math.sin(look.pitch) * travel
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
  const p = eng.player, m = eng.map!
  if (eng.squirtAmmo <= 0 || eng.squirtTank === 'none') {
    eng.msg('储罐是空的——先装入液体。', 'system')
    return
  }
  eng.squirtAmmo--
  audio.swing()
  eng.attackAnimT = 0.35
  eng.attackAnimKind = 'spray' // 滋水枪专属喷射动画
  const dmg = eng.squirtTank === 'liquidpain' ? 60 : eng.squirtTank === 'cashew' ? 20 : 8 // 液态痛苦：腐蚀性高伤
  const pc = eng.squirtTank === 'liquidpain' ? '#d94a3a' : eng.squirtTank === 'cashew' ? '#c9a05a' : eng.squirtTank === 'almond' ? '#c9e8a0' : '#9adfff'
  // v34：线性水线——沿视线射线步进（射程 4.5m，撞墙即停，顺带修复隔墙命中）；水线碰到首个实体才触发液体效果
  const dx = Math.cos(p.facing), dy = Math.sin(p.facing)
  const RANGE = 4.5, STEP = 0.2
  let hitEnt: Entity | null = null
  let travel = RANGE
  for (let s = 0.6; s <= RANGE; s += STEP) {
    const rx = p.x + dx * s, ry = p.y + dy * s
    if (tileAt(m, Math.floor(rx), Math.floor(ry)) !== 1) { travel = s - STEP; break } // 撞墙
    for (const e of m.entities) {
      if (e.dead || e.hidden) continue
      if (Math.hypot(e.x - rx, e.y - ry) < 0.45) { hitEnt = e; travel = s; break }
    }
    if (hitEnt) break
  }
  // 水线视觉：从右手枪模口射出、笔直射向准星所指点（枪口=右手下前方；目标=视线射线末端，含俯仰）
  const rfx = -Math.sin(p.facing), rfy = Math.cos(p.facing) // 右手方向（与视角模型右手位一致）
  const cp = Math.cos(look.pitch)
  const tx = p.x + dx * travel * cp, ty = p.y + dy * travel * cp // 准星目标点
  const tz = p.z + 1.55 + Math.sin(look.pitch) * travel
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
    const a = p.facing + (Math.random() - 0.5) * 1.2
    eng.particles.push({
      x: p.x + dx * travel, y: p.y + dy * travel,
      vx: Math.cos(a) * (1 + Math.random() * 2), vy: Math.sin(a) * (1 + Math.random() * 2),
      t: 0, life: 0.3, color: pc, size: 1.4, z: 1.1,
    })
  }
  if (hitEnt) {
    const e = hitEnt
    if (eng.squirtTank !== 'water') {
      eng.provoked = true // v23：主动挑衅解除「Level 11 Effect」的被动状态
      if (!mpHurtEntity(eng, e, dmg)) { // v59：联机实体伤害走房主结算
        e.hp -= dmg
        if (e.def.passive) { e.provoked = true; e.targetEnt = undefined; e.state = 'chase'; e.stateT = 0 } // 激怒无面灵（与近战受击一致）
        if (e.def.type === 'corpserat' && e.provoked) eng.provokeRatPack(e) // v44：尸鼠群体激怒（与近战受击一致）
        eng.killCheck(e)
      }
      e.stunT = 0.4
      audio.hit()
      eng.msg(eng.squirtTank === 'liquidpain' ? `水线正中${e.def.name}——液态痛苦嘶嘶地腐蚀着它的表皮。` : eng.squirtTank === 'cashew' ? `水线正中${e.def.name}——苦涩的腰果水把它灼得发颤。` : `水线正中${e.def.name}，甜腻的杏仁水四溅。`, 'system')
    } else {
      eng.msg(`水线滋了${e.def.name}一身清水——什么效果也没有。`, 'system')
    }
  } else {
    eng.msg(eng.squirtTank === 'water' ? '你喷出一道清水——什么效果也没有。' : eng.squirtTank === 'liquidpain' ? '你喷出一道淡红色的腐蚀水线。' : eng.squirtTank === 'cashew' ? '你喷出一道苦涩的腰果水线。' : '你喷出一道甜腻的杏仁水线。', 'system')
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
    pr.vz -= 9.8 * dt
    pr.z += pr.vz * dt
    if (pr.z <= pr.floorZ) { pr.done = true; eng.landProjectile(pr, pr.x, pr.y); continue }
    // 撞墙：在原地提前落地
    if (tileAt(m, Math.floor(nx), Math.floor(ny)) !== 1) { pr.done = true; eng.landProjectile(pr, pr.x, pr.y); continue }
    pr.x = nx; pr.y = ny
  }
  eng.projectiles = eng.projectiles.filter((pr) => !pr.done)
}

export function landProjectile(eng: Engine, pr: Projectile, x: number, y: number) {
  const m = eng.map!
  const kind = ITEMS[pr.type].throw
  switch (kind) {
    case 'explode': { // 汽油罐：范围伤害
      eng.noiseEvent(x, y, 18, true)
      eng.camShake = Math.min(1, eng.camShake + 0.5)
      audio.hit()
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2
        eng.particles.push({ x, y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, t: 0, life: 0.6, color: i % 3 === 0 ? '#e8823c' : '#c93a1e', size: 3 + Math.random() * 3 })
      }
      let n = 0
      for (const e of m.entities) {
        if (e.dead || e.disguised) continue
        const d = Math.hypot(e.x - x, e.y - y)
        if (d > 3.2 || Math.abs(e.z - pr.floorZ) >= 1) continue
        if (e.def.type === 'jerry' && eng.indoctrination > 0) continue // v47：教化约束——投掷波及对鹉主无效
        if (!mpHurtEntity(eng, e, d < 2.2 ? 45 : 20)) { e.hp -= d < 2.2 ? 45 : 20; eng.killCheck(e) } // v59：联机走房主结算
        e.stunT = Math.max(e.stunT, 0.6)
        eng.bloodParticles(e.x, e.y)
        if (e.def.type === 'jerry') eng.hurtJerryRep() // v47：伤害鹉主 → 信众哗然 -50
        n++
      }
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
        if (e.dead || e.disguised) continue
        const d = Math.hypot(e.x - x, e.y - y)
        if (d > 2.8 || Math.abs(e.z - pr.floorZ) >= 1) continue
        if (e.def.type === 'jerry' && eng.indoctrination > 0) continue // v47：教化约束——投掷波及对鹉主无效
        if (!mpHurtEntity(eng, e, 20)) { e.hp -= 20; eng.killCheck(e) } // v59：联机走房主结算
        e.stunT = Math.max(e.stunT, 2.5)
        if (e.def.type === 'jerry') eng.hurtJerryRep() // v47：伤害鹉主 → 信众哗然 -50
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
      let n = 0
      for (const e of m.entities) {
        if (e.dead || e.def.type !== 'lightguide') continue
        e.state = 'investigate'; e.targetX = x; e.targetY = y; e.stateT = 10
        n++
      }
      eng.msg(n > 0 ? '玻璃珠滚落在地——蓝绿色的微光朝它聚拢过来。' : '玻璃珠滚落在地，发出清脆的声响。', n > 0 ? 'lore' : 'system')
      break
    }
  }
}

export function bloodParticles(eng: Engine, x: number, y: number) {
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2
    eng.particles.push({ x, y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, t: 0, life: 0.5, color: '#b3352b', size: 2 + Math.random() * 2 })
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
  for (let i = 0; i < 3; i++) {
    const a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.3
    eng.particles.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: Math.cos(a) * 0.7, vy: Math.sin(a) * 0.7, t: 0, life: 0.5, color: '#7fb8d8', size: 0.04 + Math.random() * 0.03, z: eng.inLiquid === 1 ? 0.06 : -0.16, vz: 0 })
  }
}
/** 引擎粒子推进（原 step「---- 粒子 ----」内联段） */
export function updateParticles(eng: Engine, dt: number) {
  // ---- 粒子 ----
  for (const pt of eng.particles) { pt.t += dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; if (pt.z !== undefined) pt.z += (pt.vz ?? 0) * dt }
  eng.particles = eng.particles.filter((pt) => pt.t < pt.life).slice(-120)
}
