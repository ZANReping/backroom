// v53：实体 AI 步进（状态机/游荡/撞墙偏转/hunts 猎杀/provoked 激怒/群体激怒/圣所威慑/售货机活化）
// + 感知判定（los/视线锥/噪音事件/光照）——自 engine.ts 拆分，逻辑逐语句搬运。
import { floorHeight, tileAt, tileH, walkableAt, wallAt, solidStructAtFloor, bandOfZ, bandOfPlayerZ, stairServesBand, upAt, upWallAt, FLOOR_H, JUMP_REACH, UNDER_FLOOR, type GameMap } from '../world/mapgen'
import type { FloorBand } from '../core/types'
import { canOccupy, PLAYER_RADIUS } from '../core/player'
import { WALL_H } from '../renderer/shared'
import { look } from '../core/renderer3d'
import { recordEntityEncounter, ENTITIES, type Entity } from '../entities'
import { chunkKey, CS } from '../world/infinite'
import { audio } from '../core/audio'
import type { Engine } from '../engine'

// v51：人制品售货机——看过背面后，玩家背对它（视线锥外且 10m 内）即活化追击；受到攻击也会活化
// （原 step 内联段，逐语句搬运；位于糖果计时器 pre 组与人制品/麻痹 post 组之间）
export function updateVendingMachines(eng: Engine) {
  const p = eng.player, m = eng.map!
  // v51：人制品售货机——看过背面后，玩家背对它（视线锥外且 10m 内）即活化追击；受到攻击也会活化
  for (const e of m.entities) {
    if (e.dead || e.def.type !== 'vendingmachine') continue
    const d = Math.hypot(e.x - p.x, e.y - p.y)
    const provoked = e.hp < e.def.hp // 受到攻击
    const turnedBack = !!e.activated && d <= 10 && eng.viewAngle(e.x, e.y) > 1.7 // 看过背面后背对它
    if (provoked || turnedBack) {
      e.activated = false
      e.def = ENTITIES.vmad
      e.state = 'chase'; e.stateT = 0; e.targetX = p.x; e.targetY = p.y
      audio.aggro()
      eng.msg('背后传来白骨摩擦地面的声响——人制品售货机站起来了。', 'damage')
    }
  }
}
export function isLit(eng: Engine, x: number, y: number): boolean {
  if (eng.levelDef.noFlashlight) return false
  const m = eng.map!
  for (const l of m.lights) if (Math.hypot(l.x - x, l.y - y) < l.r * 0.7) return true
  return false
}

export function noiseEvent(eng: Engine, x: number, y: number, radius: number, sprint: boolean) {
  eng.playerNoiseT = 0.8 // 玩家噪音残余计时（猎犬威慑「持续发声」判定；脚步/挥击/搜索等都会刷新）
  for (const e of eng.map!.entities) {
    if (e.dead || e.def.stationary) continue
    // v58：小小（可对话被动个体）极其厌恶噪音——首次近处巨响先退避低鸣，再次被吵则彻底激怒
    if (e.def.type === 'tiny' && e.def.passive) {
      if (e.provoked) continue
      const d0 = Math.hypot(e.x - x, e.y - y)
      if (d0 >= Math.max(radius, e.def.hearing * 2.4)) continue
      e.scrapeT = (e.scrapeT ?? 0) + 1 // 借用 scrapeT 作恼怒计数
      if (e.scrapeT >= 2) {
        e.provoked = true
        e.state = 'chase'; e.targetX = x; e.targetY = y; e.stateT = 8
        eng.msg('噪音在水下炸开——小小的耐心耗尽了。它不再掩饰恶意。', 'damage')
        audio.aggro()
      } else {
        // 受惊退避：朝远离声源的方向蹿出一段
        const dd = Math.max(0.01, d0)
        e.state = 'investigate'; e.targetX = e.x + ((e.x - x) / dd) * 6; e.targetY = e.y + ((e.y - y) / dd) * 6; e.stateT = 2.5
        eng.msg('水下传来一声不悦的低鸣——噪音把它惹恼了。', 'system')
      }
      continue
    }
    if (e.def.passive) continue // 被动实体（无面灵）不循声索敌——只有被攻击才反击
    const d = Math.hypot(e.x - x, e.y - y)
    // v57o：tiny 对水下/水面噪音极敏感——投掷物落水、爆炸与游泳声都能从更远处把它引开
    const hearR = e.def.type === 'tiny' ? e.def.hearing * 2.4 : sprint && e.def.hearsSprint ? e.def.hearing * 1.6 : e.def.hearing
    // 失明实体（肢团）只按「响度半径」听觉——蹲行/慢走的小声响不会被顺风耳放大
    const effR = e.def.blind ? radius : Math.max(radius, hearR)
    if (d >= effR) continue
    if (e.state === 'chase' || e.state === 'attack') continue
    // 肢团（失明）：听见声音即高速径直冲撞声源
    if (e.def.blind) {
      e.state = 'chase'; e.targetX = x; e.targetY = y; e.stateT = 8
      continue
    }
    e.state = 'investigate'; e.targetX = x; e.targetY = y; e.stateT = 6
  }
}

// 玩家是否正「直视」实体（视角锥 ±0.4 rad 内且有视线）——猎犬威慑判定
export function lookingAt(eng: Engine, e: Entity): boolean {
  const p = eng.player
  const ang = Math.atan2(e.y - p.y, e.x - p.x)
  const fwd = Math.atan2(-Math.sin(look.yaw), -Math.cos(look.yaw)) // 与 renderer3d 视线前向一致
  let diff = Math.abs(ang - fwd)
  if (diff > Math.PI) diff = Math.PI * 2 - diff
  return diff < 0.4 && eng.los(p.x, p.y, e.x, e.y)
}

export function los(eng: Engine, x0: number, y0: number, x1: number, y1: number): boolean {
  const m = eng.map!
  const band = bandOfPlayerZ(m, eng.player.z)
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2)
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const tx = Math.floor(x0 + (x1 - x0) * t), ty = Math.floor(y0 + (y1 - y0) * t)
    if (wallAt(m, tx, ty, band) || solidStructAtFloor(m, tx + 0.5, ty + 0.5, band)) return false
  }
  return true
}
/** v57o：实体所在楼层带；水生实体在深水瓦片上强制归为 0（否则 z<-1 会被误判为 L6 地下层）。 */
export function entityBand(m: GameMap, e: Entity): FloorBand {
  const ti = Math.floor(e.y) * m.w + Math.floor(e.x)
  if (e.def.aquatic && m.liquid?.[ti] === 1) return 0
  return bandOfZ(e.z)
}

/** v57o：水生实体垂直游动——追击时贴近玩家深度，巡逻时悬在浅-中层水体。 */
export function updateAquaticDepth(eng: Engine, e: Entity, dt: number) {
  const m = eng.map!, p = eng.player
  const ti = Math.floor(e.y) * m.w + Math.floor(e.x)
  if (!e.def.aquatic || m.liquid[ti] !== 1) return
  const bottom = -(m.seaFloor?.[ti] || 1.7)
  const chasing = e.state === 'chase' || e.state === 'attack' || (e.state === 'investigate' && e.targetEnt !== undefined)
  let target: number
  if (chasing) {
    target = Math.max(bottom + 0.4, Math.min(0.05, p.z)) // 追到玩家所在深度，但不越过水面/海床
  } else {
    // v58fix4：七层之物压低巡逻水层——贴近海床蛰伏（原 45% 水深在深海太高）；
    // 其余水生实体保持约 45% 水层巡游
    const depth = e.def.type === 'thething'
      ? Math.min(18, Math.max(2.5, (m.seaFloor?.[ti] || 1.7) * 0.12))
      : Math.min(90, Math.max(3, m.seaFloor?.[ti] || 1.7) * 0.45)
    target = bottom + depth // 巡逻在离底目标高度的水体中
  }
  const maxStep = (e.def.type === 'thething' ? 3.0 : 4.4) * dt // v58fix3：海生生物垂直泳速提升（原 1.6/2.6 太慢）
  // v58fix：新生成的水生实体 z 默认是 0（海面）——深海个体会从海面花一分多钟慢慢沉下去，
  // 深水玩家根本看不见（「海里召唤/生成看不见」的根因）。非追击且离目标水层很远时直接就位；
  // 追击/近距仍走平滑游动，不在玩家面前瞬移
  if (!chasing && Math.abs(target - e.z) > 25) { e.z = target; return }
  e.z += Math.max(-maxStep, Math.min(maxStep, target - e.z))
}

export function updateEntities(eng: Engine, dt: number, dmgMult: number) {
  const m = eng.map!, p = eng.player
  const l3 = eng.levelDef.id === 3 // v53：L3 高智能实体行为开关（wikidot Level 3 条目）
  // v53：L3 尸鼠陷阱（未触发）列表——玩家/实体踩上即成为尸鼠的猎物
  const ratTraps = l3 ? m.structures.filter((st) => st.kind === 'rattrap' && !st.data?.sprung) : null
  const lightOn = p.flashlight && p.battery > 0 && p.flashJamT <= 0
  // v51：L3 圣所邻域 chunk 集（圣所 chunk + 八邻——wikidot：实体甚至不会进入包含圣所入口的走廊）
  let sanctChunks: Set<string> | null = null
  if (eng.levelDef.id === 3 && m.inf) {
    sanctChunks = new Set()
    for (const c of m.inf.chunks.values())
      if (c.variant === 'sanct')
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) sanctChunks.add(chunkKey(c.cx + dx, c.cy + dy))
  }
  // 开发者模式：冻结实体 AI（仅保留死亡动画消散，便于截图/观察）
  if (eng.dev.frozenAI) {
    for (const e of m.entities) if (e.dead) e.deathT -= dt
    m.entities = m.entities.filter((e) => !e.dead || e.deathT > 0)
    return
  }
  for (const e of m.entities) {
    // 死亡动画计时（倒地/消散后移除）
    if (e.dead) { e.deathT -= dt; continue }
    e.stateT -= dt; e.attackCd -= dt
    if (e.turnSlowT !== undefined && e.turnSlowT > 0) e.turnSlowT -= dt // v58：七层之物转头迟滞计时
    // v59 联机：客人端「提线木偶」实体（带 netId）——位置/状态由房主快照驱动，本地 AI 挂起；
    // 同步来的追击/攻击状态对本地玩家同样致命（各端本地结算接触伤害）；>8s 未刷新即移除
    if (e.netId !== undefined && eng.mpSession && !eng.mpSession.isHost) {
      if (Date.now() - (e.netT ?? 0) > 8000) { e.dead = true; e.deathT = 0; continue }
      const kN = Math.min(1, dt * 10)
      const txN = e.netX ?? e.x, tyN = e.netY ?? e.y, tzN = e.netZ ?? e.z
      const mvN = Math.hypot(txN - e.x, tyN - e.y)
      e.x += (txN - e.x) * kN; e.y += (tyN - e.y) * kN; e.z += (tzN - e.z) * kN
      e.animT += dt * (2 + mvN * 8)
      const pdN = Math.hypot(e.x - p.x, e.y - p.y)
      if ((e.state === 'chase' || e.state === 'attack') && pdN < (e.def.grabs ? 1.8 : 1.3)
        && e.attackCd <= 0 && Math.abs(e.z - p.z) < 1.6) {
        e.attackCd = 1.4
        eng.hurtPlayer(e.def.damage * dmgMult, e.def.name)
      }
      continue
    }
    // 开发者模式：隐形——所有距离判定视为无穷远，实体永不索敌/攻击/特殊触发
    const d = eng.dev.invisible ? 1e9 : Math.hypot(e.x - p.x, e.y - p.y)
    const def = e.def
    if (def.aquatic) updateAquaticDepth(eng, e, dt)
    // v51：Nguithr'xurh（Entity 16）——天花板网囊陷阱专属状态机
    if (def.type === 'nguithr') { eng.updateNguithr(e, d, dt); continue }
    // 猎犬威慑：玩家「实时直视 + 持续制造噪音」才定身——逐帧刷新 stunT，
    // 停止发声或移开视线即不再刷新，猎犬在 0.25s 内恢复行动（对已在追击的猎犬同样有效）
    if (def.intimidatable) {
      const held = d < 10 && eng.playerNoiseT > 0 && eng.lookingAt(e)
      if (held) {
        e.stunT = Math.max(e.stunT, 0.25)
        if (!e.intimidated) {
          e.intimidated = true
          eng.msg('你直视着猎犬的眼睛发出巨响——它被震慑住了！', 'system')
          audio.aggro()
        }
      } else if (e.intimidated) {
        e.intimidated = undefined
        eng.msg('猎犬摆脱了震慑，重新扑来！', 'damage')
      }
    }
    if (e.stunT > 0) { e.stunT -= dt; continue }

    // v51：L3 圣所威慑——实体畏惧天使雕像：不进入圣所 chunk 及其八邻（含入口走廊）。
    // 踏上圣所邻域/tint 20 瓦片的实体立刻以 ×1.4 速度逃向最近的非圣所可走瓦片，
    // 该 tick 跳过索敌/攻击/特殊行为（wanderTarget 同样拒绝这些瓦片）
    {
      const etx = Math.floor(e.x), ety = Math.floor(e.y)
      let holy = false
      if (etx >= 0 && ety >= 0 && etx < m.w && ety < m.h) {
        if (m.tint[ety * m.w + etx] === 20) holy = true
        else if (sanctChunks && m.inf)
          holy = sanctChunks.has(chunkKey(Math.floor((m.inf.ox + e.x) / CS), Math.floor((m.inf.oy + e.y) / CS)))
      }
      if (holy) {
        let fx = -1, fy = -1
        outer: for (let rad = 1; rad <= 16; rad++)
          for (let dy = -rad; dy <= rad; dy++)
            for (let dx = -rad; dx <= rad; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
              const nx = etx + dx, ny = ety + dy
              if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue
              const ni = ny * m.w + nx
              if (m.tint[ni] === 20 || tileAt(m, nx, ny) !== 1) continue
              if (sanctChunks && m.inf && sanctChunks.has(chunkKey(Math.floor((m.inf.ox + nx) / CS), Math.floor((m.inf.oy + ny) / CS)))) continue
              fx = nx; fy = ny; break outer
            }
        if (fx >= 0) {
          e.state = 'wander'; e.targetX = fx + 0.5; e.targetY = fy + 0.5; e.stateT = 4
          eng.stepEntity(e, def.speed * 1.4, dt)
        }
        continue
      }
    }

    // 遭遇记录（图鉴渐进解锁；v54 按个体去重——每只实体只计一次，recordEntityEncounter 内置守卫）：
    // ① 玩家看见：进入视野范围且有视线
    if (d < def.sight && eng.los(p.x, p.y, e.x, e.y)) recordEntityEncounter(e)
    // ② 实体察觉玩家：进入 追击/攻击（无实体仇恨目标即玩家指向——实体互猎带 targetEnt 不计），
    //    或 调查且目标点是玩家所在（噪音引动；尸鼠 investigate 猎物时目标≠玩家，不计）
    if (!e.targetEnt && (e.state === 'chase' || e.state === 'attack'
      || (e.state === 'investigate' && Math.hypot(e.targetX - p.x, e.targetY - p.y) < 2))) recordEntityEncounter(e)

    // 窃皮者伪装：近身才现身
    if (e.disguised) {
      // v53：L3 高智能窃皮者——伪装成流浪者，径直走向玩家，近身暴起
      if (e.disguised === 'human') {
        if (d < 2.0) {
          e.disguised = undefined
          eng.msg('那个「流浪者」的皮肉像外套一样翻卷脱落——是窃皮者！', 'damage')
          audio.aggro()
          e.state = 'chase'
        } else if (d < 14 && eng.los(e.x, e.y, p.x, p.y)) {
          eng.faceToward(e, p.x, p.y, dt, 3)
          e.targetX = p.x; e.targetY = p.y
          eng.stepEntity(e, def.speed * 0.45, dt) // 装作普通流浪者步行接近
          e.animT += dt * def.speed * 0.45
        }
        continue
      }
      if (d < 2.2) {
        e.disguised = undefined
        eng.msg('那不是物品——是窃皮者！', 'damage')
        audio.aggro()
        e.state = 'chase'
      } else continue
    }
    // 手臂：蛰伏于天花板通风管（hidden=缩回管内）；层级灯光熄灭时伸出猎捕
    if (def.type === 'arms') {
      const darkOut = (m.inf?.blackout ?? false) || eng.blackoutT > 0
      if (e.hidden) {
        if (darkOut && d < 5) {
          e.hidden = undefined
          eng.msg('头顶的通风管里伸出了一只手臂！', 'damage')
          audio.aggro()
        } else continue
      }
      if (!darkOut || d > 7) { e.hidden = true; continue } // 灯光恢复或玩家远离：缩回管内
      if (d < 2.2 && e.attackCd <= 0) {
        e.attackCd = 1.6
        eng.hurtPlayer(def.damage * dmgMult, def.name)
        p.slowT = Math.max(p.slowT, 1.5)
        eng.msg('通风管的手臂抓住了你！', 'damage')
      }
      e.animT += dt
      continue
    }
    // 管道蠕虫埋伏：近身破土
    if (e.hidden) {
      if (d < 3.2) {
        e.hidden = undefined
        eng.msg('管道炸开——蠕虫破土而出！', 'damage')
        audio.aggro()
        eng.camShake = Math.min(1, eng.camShake + 0.5)
        e.state = 'chase'
      } else continue
    }

    // v53：L3 高智能猎犬——伏击态：平日潜伏不动（普通猎犬的游荡/循声被压制），
    // 玩家进入视野且背对它（视线锥外 ~69°）时暴起追击；一旦被直视就僵住不动
    if (l3 && def.type === 'hound' && e.state !== 'chase' && e.state !== 'attack') {
      if (d < def.sight && eng.los(e.x, e.y, p.x, p.y) && eng.viewAngle(e.x, e.y) > 1.2) {
        e.state = 'chase'; e.stateT = 0
        if (!e.activated) { e.activated = true; eng.msg('背后响起湿冷的关节摩擦声——猎犬趁你背对它扑了上来！', 'damage') }
        audio.aggro()
      } else {
        e.state = 'idle'; e.stateT = 0.5; e.targetX = e.x; e.targetY = e.y
        continue // 保持伏击
      }
    }

    // v53：L3 尸鼠陷阱——实体踩上即被夹住（轻伤+僵直），并成为附近尸鼠的猎物
    if (ratTraps && def.type !== 'corpserat') {
      const tr = ratTraps.find((t) => Math.hypot(t.x + 0.5 - e.x, t.y + 0.5 - e.y) < 0.6)
      if (tr) {
        tr.data = { ...tr.data, sprung: 1 }
        e.hp -= 5; e.stunT = Math.max(e.stunT, 0.5)
        eng.bloodParticles(e.x, e.y)
        for (const q of m.entities) {
          if (q === e || q.dead || q.def.type !== 'corpserat') continue
          if (Math.hypot(q.x - e.x, q.y - e.y) < 14) { q.provoked = true; q.targetEnt = e; q.state = 'chase'; q.stateT = 0 }
        }
        if (d < 12) eng.msg(`捕兽夹「咔」地合上——附近的尸鼠盯上了那只${def.name}。`, 'system')
        if (e.hp <= 0 && !e.dead) { e.dead = true; e.deathT = 1.4; continue }
      }
    }

    if (def.stationary) {
      // 久坐者：看见玩家就尖叫
      if (def.type === 'seated' && !e.screamed && d < def.sight && eng.los(e.x, e.y, p.x, p.y)) {
        e.screamed = true
        eng.msg('久坐者发出了刺耳的尖叫！', 'damage')
        audio.aggro()
        eng.noiseEvent(p.x, p.y, 20, true)
        p.sanity = Math.max(0, p.sanity - 10)
        eng.emit({ kind: 'sanityhit' })
      }
      if (def.damage > 0 && d < 1.2 && e.attackCd <= 0 && eng.meleeZOk(e)) { e.attackCd = 1.2; eng.hurtPlayer(def.damage * dmgMult, def.name) }
      continue
    }

    // —— 特殊行为 ——
    // 笑魇：只在黑暗中逼近；手电照亮时后退
    if (def.darkAmbusher && lightOn && d < 7 && eng.los(e.x, e.y, p.x, p.y)) {
      if (e.state === 'chase' || e.state === 'investigate') { e.state = 'wander'; eng.wanderTarget(e) }
      // 缓慢远离玩家
      if (d < 5 && e.state === 'wander') {
        e.targetX = e.x + (e.x - p.x); e.targetY = e.y + (e.y - p.y); e.stateT = 1
      }
    }
    // 电弧体：靠近瘫痪手电
    if (def.jamsLight && d < 3 && p.flashlight && p.flashJamT <= 0) {
      p.flashJamT = 2.5
      p.flashlight = false
      p.battery = Math.max(0, p.battery - 6)
      eng.msg('电磁脉冲——手电瘫痪了！', 'damage')
      audio.spark()
    }
    // 笑魇听觉通道：手电熄灭但玩家在听觉半径内持续制造噪音（noiseEvent 刷新的残余计时），同样会被察觉
    const hearP = !!def.lightHunter && eng.playerNoiseT > 0 && d < def.hearing && eng.los(e.x, e.y, p.x, p.y)
    // 笑魇：趋光猎手——玩家手电熄灭时不再靠近，并缓慢退开（听见噪音除外：循声追击；
    // v53：L3 高智能笑魇在任何情况下都主动攻击，不因关灯退却）
    if (def.lightHunter && !lightOn && !hearP && d < 6 && !l3) {
      if (e.state === 'chase' || e.state === 'investigate') { e.state = 'wander'; eng.wanderTarget(e) }
      if (e.state === 'wander') {
        e.targetX = e.x + (e.x - p.x); e.targetY = e.y + (e.y - p.y); e.stateT = 1
      }
    }
    // 死亡飞蛾：扑灯耗电
    if (def.drainsLight && d < 1.4 && p.flashlight) {
      p.battery = Math.max(0, p.battery - 4 * dt)
      if (Math.random() < dt * 1.5) audio.searchTick()
    }
    // 复印机幽灵：周期性生成幻影
    if (def.spawnsFakes && d < 8) {
      e.fakeT = (e.fakeT ?? 0) - dt
      if (e.fakeT <= 0 && eng.fakes.length < 6) {
        e.fakeT = 5
        const ang = Math.random() * Math.PI * 2
        eng.fakes.push({ x: p.x + Math.cos(ang) * 3.5, y: p.y + Math.sin(ang) * 3.5, t: 4 })
      }
    }

    // v57o：thething 畏光但会被光激怒——手电照亮它时立即进入追击（而不是被光驱离）
    if (def.type === 'thething' && lightOn && d < def.sight && eng.los(e.x, e.y, p.x, p.y) && e.state !== 'chase' && e.state !== 'attack') {
      e.state = 'chase'; e.stateT = 0
      if (!e.activated) {
        e.activated = true
        eng.msg('手电光扫过黑暗——七层之物被激怒了！', 'damage')
        audio.aggro()
      }
    }
    // 视野追击（趋光猎手仅在玩家手电亮时能看见目标；关灯后可靠听觉察觉噪音；v53：L3 笑魇无视光照恒可索敌）
    const darkBonus = def.darkAmbusher && !lightOn ? 4 : 0
    const canSee = hearP || (d < def.sight + darkBonus && (!def.lightHunter || lightOn || l3) && eng.los(e.x, e.y, p.x, p.y))
    const feigning = def.feignNeutral && d > 2.4 && e.state !== 'chase' && e.state !== 'attack' // 侍者装中立
    // v23「Level 11 Effect」：本层敌对实体更不倾向于攻击——但主动挑衅（攻击过任何实体）会解除
    const pacified = !eng.provoked && (eng.levelDef.pacify ?? 0) > 0 && Math.random() < (eng.levelDef.pacify ?? 0)
    if (canSee && !def.passive && !feigning && !pacified && e.state !== 'chase' && e.state !== 'attack') {
      e.state = 'chase'
      if (def.aggroStinger) audio.aggro()
    }
    // 侍者近身暴起
    if (def.feignNeutral && d <= 2.4 && e.state !== 'chase' && e.state !== 'attack' && eng.los(e.x, e.y, p.x, p.y)) {
      e.state = 'chase'
      eng.msg('侍者不笑了。', 'damage')
      audio.aggro()
    }
    // 被动实体（无面灵）：脱战 8 秒后平息（不再反击）；无视线/听觉/贴身索敌——只有被打才反击。
    // v42：grudge（尸鼠=合并死亡鼠）记仇不放——激怒后持续仇恨，永不平息
    if (def.passive && !def.grudge && e.state === 'chase' && e.stateT < -8) { e.state = 'wander'; e.provoked = false; e.targetEnt = undefined }
    // 趋光实体（死亡飞蛾）：被手电光吸引
    if (def.lightLure && lightOn && d < 11 && (e.state === 'wander' || e.state === 'idle')) {
      e.state = 'investigate'; e.targetX = p.x; e.targetY = p.y; e.stateT = 4
    }
    // v44：尸鼠群体激怒（加入围殴）——注意到 4m 内有同伴处于激怒状态时一同激怒，攻击同一目标
    if (def.type === 'corpserat' && !e.provoked) {
      for (const q of m.entities) {
        if (q === e || q.dead || q.def.type !== 'corpserat' || !q.provoked) continue
        if (Math.hypot(q.x - e.x, q.y - e.y) < 4) { e.provoked = true; e.state = 'chase'; e.stateT = 0; break }
      }
    }
    // v41：尸鼠（hunts）——实体对实体仇恨：主动猎杀附近的死亡飞蛾；
    // 被玩家激怒（provoked）时优先反击玩家（走下方正常状态机）
    if (def.hunts && !e.provoked && e.state !== 'attack') {
      let prey: Entity | null = null, pd = 1e9
      for (const q of m.entities) {
        if (q === e || q.dead || q.hidden || q.disguised) continue
        if (!def.hunts.includes(q.def.type)) continue
        const qd = Math.hypot(q.x - e.x, q.y - e.y)
        if (qd < 9 && qd < pd && eng.los(e.x, e.y, q.x, q.y)) { prey = q; pd = qd }
      }
      if (prey) {
        if (pd < 1.0 && e.attackCd <= 0) {
          e.attackCd = 1.1
          prey.hp -= def.damage
          prey.stunT = Math.max(prey.stunT, 0.3)
          eng.bloodParticles(prey.x, prey.y)
          if (prey.hp <= 0 && !prey.dead) {
            prey.dead = true; prey.deathT = 1.4
            if (d < 9) eng.msg(`尸鼠扑翻了那只${prey.def.name}，几下撕碎拖进了墙缝。`, 'system')
          } else if (!prey.def.noRetaliate) {
            // 实体对实体仇恨：被尸鼠攻击的飞蛾反击该尸鼠（仇恨目标转为伤害者本人）
            prey.provoked = true; prey.targetEnt = e; prey.state = 'chase'; prey.stateT = 0
          }
        } else {
          e.state = 'investigate'; e.targetX = prey.x; e.targetY = prey.y; e.stateT = 2
        }
      }
    }

    switch (e.state) {
      case 'idle':
        if (e.stateT <= 0) { e.state = 'wander'; eng.wanderTarget(e) }
        break
      case 'wander': {
        if (eng.stepEntity(e, def.speed * 0.45, dt)) {
          // 撞墙卡住（未到达目标）：被动实体在当前目标方向上偏转 ±60°~120° 另选目标，
          // 不再顶着同一面墙蹭（Ferren 保留专属小半径逻辑；其余实体维持随机重选）
          if (def.passive && def.type !== 'ferren' && Math.hypot(e.targetX - e.x, e.targetY - e.y) > 0.35) eng.wanderDeflect(e)
          else eng.wanderTarget(e)
        }
        e.animT += dt * def.speed * 0.45
        break
      }
      case 'investigate': {
        if (def.grudge && e.provoked) {
          // v42：记仇（尸鼠=合并死亡鼠）——调查中持续追踪玩家本人，超时转回追击而非放弃
          e.targetX = p.x; e.targetY = p.y
          eng.stepEntity(e, def.speed * 0.7, dt)
          if (e.stateT <= 0 || d < def.sight) e.state = 'chase'
        } else if (eng.stepEntity(e, def.speed * 0.7, dt) || e.stateT <= 0) { e.state = 'wander'; eng.wanderTarget(e) }
        // v41：hunts 实体（尸鼠）调查中面向猎物目标；其余实体面向玩家方向
        eng.faceToward(e, def.hunts ? e.targetX : p.x, def.hunts ? e.targetY : p.y, dt, 5)
        e.animT += dt * def.speed * 0.7
        break
      }
      case 'chase': {
        if (def.passive && (def.noRetaliate || !e.provoked) ) { e.state = 'wander'; break } // 被动实体未被激怒：撤销追击（被攻击后由 provoked 放行；Ferren 绝不反击）
        if (e.targetEnt?.dead) { // 反击目标已死亡：仇恨解除（被动实体回到漫游，不迁怒玩家）
          e.targetEnt = undefined
          if (def.passive) { e.provoked = false; e.state = 'wander'; eng.wanderTarget(e); break }
        }
        if (def.mirrorMove) {
          // 镜中人：以玩家为镜面做镜像移动（保持距离对称）
          const mx = e.x + (e.x - p.x), my = e.y + (e.y - p.y)
          const dd = Math.hypot(mx - e.x, my - e.y) || 1
          eng.stepEntity(e, def.speed * (d > 1.6 ? 1 : 0.2), dt)
          if (d > 1.6) { e.targetX = mx; e.targetY = my }
          void dd
        } else if (def.charger) {
          // 运输车：直线冲撞，无法急转
          eng.faceToward(e, p.x, p.y, dt, 1.6)
          e.targetX = e.x + Math.cos(e.facing) * 5
          e.targetY = e.y + Math.sin(e.facing) * 5
          eng.stepEntity(e, def.speed * 1.7, dt)
          if (d < 1.1 && e.attackCd <= 0 && eng.meleeZOk(e)) {
            e.attackCd = 1.6
            eng.hurtPlayer(def.damage * dmgMult, def.name)
            eng.camShake = Math.min(1, eng.camShake + 0.5)
          }
          e.animT += dt * def.speed
          break
        } else if (def.blind) {
          if (l3) {
            // v53：L3 高智能肢团——追逐速度更快且会转弯（持续追踪玩家本人，而非径直冲撞最后声源点）
            e.targetX = p.x; e.targetY = p.y
            eng.stepEntity(e, def.speed * 1.3, dt)
            eng.faceToward(e, p.x, p.y, dt, 9)
            if (d > 14) { e.state = 'investigate'; e.stateT = 4 } // 甩开足够远才失去目标
          } else {
            // 肢团（失明）：径直冲向最后听见的声音点；冲达后无处可依则回游荡
            const arrived = eng.stepEntity(e, def.speed, dt)
            eng.faceToward(e, e.targetX, e.targetY, dt, 9)
            if (arrived) { e.state = 'wander'; eng.wanderTarget(e) }
          }
        } else if (e.targetEnt) {
          // 实体对实体反击（死亡飞蛾反击尸鼠）：追击伤害者本人
          const tgt = e.targetEnt
          e.targetX = tgt.x; e.targetY = tgt.y
          eng.stepEntity(e, def.speed, dt)
          eng.faceToward(e, tgt.x, tgt.y, dt, 9)
          const td = Math.hypot(tgt.x - e.x, tgt.y - e.y)
          if (td < 1.0 && e.attackCd <= 0) {
            e.attackCd = 1.2
            tgt.hp -= def.damage
            tgt.stunT = Math.max(tgt.stunT, 0.3)
            eng.bloodParticles(tgt.x, tgt.y)
            if (tgt.hp <= 0 && !tgt.dead) { tgt.dead = true; tgt.deathT = 1.4 }
          }
        } else if (def.type === 'thething') {
          // v58：巨鳗转向迟缓——沿当前面向行进、缓慢转头追向玩家（打体节会更慢，见 combat）
          const rate = (e.turnSlowT ?? 0) > 0 ? 0.4 : 1.15
          eng.faceToward(e, p.x, p.y, dt, rate)
          e.targetX = e.x + Math.cos(e.facing) * 6
          e.targetY = e.y + Math.sin(e.facing) * 6
          eng.stepEntity(e, def.speed * (d > 3 ? 1 : 0.55), dt)
        } else {
          e.targetX = p.x; e.targetY = p.y
          eng.stepEntity(e, def.speed, dt)
          eng.faceToward(e, p.x, p.y, dt, 9) // 追击时平滑转向面向玩家
        }
        e.animT += dt * def.speed
        const meleeReach = def.type === 'thething' ? 2.0 : 0.85 // v58：七层之物巨口攻击距离更大
        if (!e.targetEnt && d < meleeReach && e.attackCd <= 0) {
          e.state = 'attack'; e.lungeT = 0.32; e.attackCd = 1.4
        } else if (!e.targetEnt && !canSee && d > def.sight * 1.4 && !def.mirrorMove && !def.blind && !(def.grudge && e.provoked)) {
          e.state = 'investigate'; e.stateT = 5
        }
        break
      }
      case 'attack': {
        // v58：七层之物攻击前摇的转头同样迟缓（体节受击更慢）——给玩家躲开巨口的窗口
        eng.faceToward(e, p.x, p.y, dt, def.type === 'thething' ? ((e.turnSlowT ?? 0) > 0 ? 0.5 : 2.2) : 14) // 攻击前摇快速对准玩家
        e.lungeT -= dt
        if (e.lungeT <= 0) {
          // 必须基本正对玩家才出手，否则延长前摇继续转向
          const want = Math.atan2(p.y - e.y, p.x - e.x)
          let diff = Math.abs(want - e.facing)
          if (diff > Math.PI) diff = Math.PI * 2 - diff
          if (diff > 0.7) { e.lungeT = 0.1; break }
          if (d < (def.grabs ? 1.8 : 1.2) && eng.meleeZOk(e)) {
            eng.hurtPlayer(def.damage * dmgMult, def.name)
            if (def.grabs) {
              p.slowT = 2.5; p.stamina = 0
              eng.msg('团块的肢体缠住了你！', 'damage')
            }
          }
          e.state = 'chase'
        }
        break
      }
    }

    // 穿墙实体（钝人）：行动时发出刺耳的沙沙声，隔着墙也能听见
    if (def.phases && (e.state === 'wander' || e.state === 'investigate' || e.state === 'chase') && d < 14) {
      e.scrapeT = (e.scrapeT ?? Math.random() * 0.7) - dt
      if (e.scrapeT <= 0) {
        e.scrapeT = 0.7
        const inWall = tileAt(m, Math.floor(e.x), Math.floor(e.y)) !== 1
        audio.scrape(Math.min(1, (1 - d / 14) * (inWall ? 1.3 : 1)))
      }
    }

    // ---- v26：实体-玩家最小间距（碰撞推挤分离，攻击判定用距离+面向而非重叠）----
    if (!eng.dev.invisible && Math.abs(e.z - p.z) < 1.2) {
      const MIN_SEP = def.stationary ? 0.5 : 0.56
      let sx = e.x - p.x, sy = e.y - p.y
      let sd = Math.hypot(sx, sy)
      if (sd < 1e-4) { const a = Math.random() * Math.PI * 2; sx = Math.cos(a); sy = Math.sin(a); sd = 1 }
      if (sd < MIN_SEP) {
        const ux = sx / sd, uy = sy / sd, push = MIN_SEP - sd
        if (!def.stationary) {
          // 实体侧退 60%（目标瓦片可站才移动，防止被推进墙里）
          const ex = e.x + ux * push * 0.6, ey = e.y + uy * push * 0.6
          if (eng.entityWalkH(m, Math.floor(ex), Math.floor(ey), entityBand(m, e), e.def.aquatic === true) !== null) { e.x = ex; e.y = ey }
        }
        // 玩家侧退剩余部分（碰撞校验，贴墙时不强推）
        const k = def.stationary ? 1 : 0.4
        const px2 = p.x - ux * push * k, py2 = p.y - uy * push * k
        if (canOccupy(m, px2, py2, PLAYER_RADIUS, { z: p.z, crouch: p.crouching, band: bandOfPlayerZ(m, p.z) })) { p.x = px2; p.y = py2 }
      }
    }
  }
  m.entities = m.entities.filter((e) => !e.dead || e.deathT > 0)
}
export function wanderTarget(eng: Engine, e: Entity) {
  const m = eng.map!
  const band = entityBand(m, e)
  // Ferren（雪貂笼宠物）：小半径就近游荡 + 直线路径可走校验——不再隔着笼墙选点往墙上蹭；
  // 偶尔趴下歇一会儿（宠物漫游节奏）
  if (e.def.type === 'ferren') {
    if (Math.random() < 0.3) { e.state = 'idle'; e.stateT = 1.2 + Math.random() * 2.2; e.targetX = e.x; e.targetY = e.y; return }
    for (let t = 0; t < 12; t++) {
      const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 1.8
      const tx = e.x + Math.cos(a) * r, ty = e.y + Math.sin(a) * r
      let clear = true
      for (let k = 1; k <= 4 && clear; k++) {
        const sx = e.x + (tx - e.x) * (k / 4), sy = e.y + (ty - e.y) * (k / 4)
        if (!canOccupy(m, sx, sy, 0.2, { z: e.z, band })) clear = false
      }
      if (clear) { e.targetX = tx; e.targetY = ty; e.stateT = 3; return }
    }
    e.state = 'idle'; e.stateT = 1.5; e.targetX = e.x; e.targetY = e.y
    return
  }
  for (let t = 0; t < 20; t++) {
    const a = Math.random() * Math.PI * 2
    const tx = e.x + Math.cos(a) * 5, ty = e.y + Math.sin(a) * 5
    const ti = Math.floor(ty) * m.w + Math.floor(tx)
    if (Math.floor(tx) < 0 || Math.floor(ty) < 0 || Math.floor(tx) >= m.w || Math.floor(ty) >= m.h) continue
    // v13：按所在楼层高度带选游荡目标（上层实体不下楼闲逛；楼梯口允许上下）
    if (m.stair[ti] & 7) { e.targetX = tx; e.targetY = ty; e.stateT = 4; return }
    if (m.tint[ti] === 20) continue // v51：实体不主动进入圣所（tint 20）
    // v51：圣所邻域 chunk 同样不选为游荡目标（实体不进入包含圣所入口的走廊）
    if (eng.levelDef.id === 3 && m.inf) {
      const wcx = Math.floor((m.inf.ox + tx) / CS), wcy = Math.floor((m.inf.oy + ty) / CS)
      let holy = false
      for (const c of m.inf.chunks.values())
        if (c.variant === 'sanct' && Math.abs(c.cx - wcx) <= 1 && Math.abs(c.cy - wcy) <= 1) { holy = true; break }
      if (holy) continue
    }
    if (band === 0 ? tileAt(m, Math.floor(tx), Math.floor(ty)) === 1 : walkableAt(m, Math.floor(tx), Math.floor(ty), band)) {
      if (band === 0 && m.liquid[ti] === 1 && !e.def.aquatic) continue // 陆生实体不主动下水；水生实体可巡游
      e.targetX = tx; e.targetY = ty; e.stateT = 4; return
    }
  }
  e.targetX = e.x; e.targetY = e.y; e.stateT = 2
}

// 被动漫游撞墙转向：在当前目标方向基础上偏转 ±60°~120° 另选可走目标（两侧交替试），
// 找不到才回退到随机重选——解决顶着同一面墙反复蹭的问题
export function wanderDeflect(eng: Engine, e: Entity) {
  const m = eng.map!
  const band = entityBand(m, e)
  const base = Math.atan2(e.targetY - e.y, e.targetX - e.x)
  const s0 = Math.random() < 0.5 ? 1 : -1
  for (let t = 0; t < 6; t++) {
    const s = t % 2 === 0 ? s0 : -s0
    const a = base + s * (60 + Math.random() * 60) * Math.PI / 180
    const tx = e.x + Math.cos(a) * 4, ty = e.y + Math.sin(a) * 4
    const fx = Math.floor(tx), fy = Math.floor(ty)
    if (fx < 0 || fy < 0 || fx >= m.w || fy >= m.h) continue
    if (eng.entityWalkH(m, fx, fy, band, e.def.aquatic === true) === null) continue
    if (band === 0 && m.liquid[fy * m.w + fx] === 1 && !e.def.aquatic) continue // 陆生实体不主动下水；水生实体可巡游
    e.targetX = tx; e.targetY = ty; e.stateT = 4; return
  }
  eng.wanderTarget(e)
}

// v44：尸鼠群体激怒——一只被激怒时，周围 ~6m 的同伴一同被激怒（攻击同一目标：玩家）
export function provokeRatPack(eng: Engine, e: Entity) {
  for (const q of eng.map!.entities) {
    if (q === e || q.dead || q.def.type !== 'corpserat' || q.provoked) continue
    if (Math.hypot(q.x - e.x, q.y - e.y) < 6) { q.provoked = true; q.state = 'chase'; q.stateT = 0 }
  }
}

/** Nguithr'xurh（Entity 16）：网囊（hidden）→ 玩家经过正下方爆开（麻痹）→ 未离开即降下攻击 → 逃脱则回巢结囊 */
export function updateNguithr(eng: Engine, e: Entity, d: number, dt: number) {
  const p = eng.player, m = eng.map!
  const ceilZ = (WALL_H[eng.levelDef.gen] ?? 3) - 0.55
  // 陷阱点初始化（生成位置即结囊处）
  if (e.webX === undefined) { e.webX = e.x; e.webY = e.y; e.hidden = true }
  if (e.hidden) {
    // 网囊形态：挂顶不动，缓缓升到天花板
    e.z += (ceilZ - e.z) * Math.min(1, dt * 3)
    if (d < 1.3 && eng.webbedT <= 0 && !eng.dev.invisible) {
      // 爆开：镇静剂洒落——视野模糊 + 移动迟缓 4 秒
      eng.webbedT = 4
      e.hidden = false
      e.state = 'idle'; e.stateT = 4 // 等待麻痹期（与 webbedT 同步）
      eng.camShake = Math.min(1, eng.camShake + 0.4)
      audio.aggro()
      eng.msg('头顶的球状网囊突然爆开——镇静剂洒了你一身。（视线模糊 · 移动迟缓）', 'damage')
    }
    return
  }
  if (e.state === 'idle') {
    // 麻痹等待期：玩家仍停留在那一格 → 垂降进食；已离开 → 回巢重新结囊
    e.z += (ceilZ - e.z) * Math.min(1, dt * 3)
    if (e.stateT <= 0) {
      const sameTile = Math.floor(p.x) === Math.floor(e.webX!) && Math.floor(p.y) === Math.floor(e.webY!)
      if (sameTile) {
        e.state = 'chase'; e.stateT = 0
        audio.aggro()
        eng.msg('有什么东西顺着丝从天花板降了下来——', 'damage')
      } else {
        e.hidden = true; e.stateT = 0 // 猎物已离开：重新结囊
      }
    }
    return
  }
  // 地面态：慢速逼近玩家；玩家逃出 8m（且未杀死它）→ 回到陷阱点重新结囊
  if (d > 8) {
    const tx = e.webX, ty = e.webY!
    const dd = Math.hypot(tx - e.x, ty - e.y)
    if (dd < 0.4) { e.hidden = true; e.stateT = 0; return }
    eng.faceToward(e, tx, ty, dt, 6)
    e.targetX = tx; e.targetY = ty
    eng.stepEntity(e, e.def.speed, dt)
    e.animT += dt
    return
  }
  // 落地（z 降到地面）
  const gz = floorHeight(m, e.x, e.y, bandOfZ(e.z))
  e.z += (gz - e.z) * Math.min(1, dt * 6)
  // 攻击前摇：原地停步、抬起前身（节肢式蓄力），随后下扑
  if (e.lungeT > 0) {
    e.lungeT -= dt
    if (e.lungeT <= 0 && d < 1.3 && eng.meleeZOk(e)) {
      e.attackCd = 1.4
      eng.hurtPlayer(e.def.damage, e.def.name)
      // 每次遭到 Nguithr'xurh 攻击 → 麻痹 1 秒（模糊+迟缓）
      eng.webbedT = Math.max(eng.webbedT, 1)
      eng.msg('镇静剂的余效让你浑身发麻。（麻痹 1 秒）', 'damage')
    }
    return
  }
  eng.faceToward(e, p.x, p.y, dt, 5)
  e.targetX = p.x; e.targetY = p.y
  eng.stepEntity(e, e.def.speed, dt)
  e.animT += dt
  if (d < 1.3 && e.attackCd <= 0 && eng.meleeZOk(e)) e.lungeT = 0.45 // 进入前摇
}

// 平滑转向（最短弧 lerp yaw）面向目标点
export function faceToward(_eng: Engine, e: Entity, tx: number, ty: number, dt: number, rate: number) {    const want = Math.atan2(ty - e.y, tx - e.x)
  let diff = want - e.facing
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  const t = Math.min(1, rate * dt)
  e.facing += diff * t
}
// 实体行走高度（v13 楼层带感知；楼梯坡道取中位连续高度；深水不可进入；v54：band2 走 up2 楼板）
export function entityWalkH(_eng: Engine, m: GameMap, tx: number, ty: number, band: FloorBand, aquatic = false): number | null {
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return null
  const i = ty * m.w + tx
  if (m.stair[i] & 7) { // 楼梯：坡道到达的楼层带都可走（连续坡道上下；v54 带守卫，JUMP_REACH 宽松容差保旧行为）
    if (band >= 1 && (!stairServesBand(m.stair[i], band, JUMP_REACH) || upAt(m, band as 1 | 2)[i] !== 1)) return null
    if (solidStructAtFloor(m, tx, ty, band)) return null
    return tileH(m, tx, ty)
  }
  if (band >= 1) {
    const b = band as 1 | 2 // 已排除 band 0
    if (upAt(m, b)[i] !== 1 || upWallAt(m, b)[i] === 1) return null
    if (solidStructAtFloor(m, tx, ty, band)) return null
    return band * FLOOR_H
  }
  if (band === -1) {
    if (!walkableAt(m, tx, ty, -1) || solidStructAtFloor(m, tx, ty, -1)) return null
    return UNDER_FLOOR
  }
  if (tileAt(m, tx, ty) !== 1) return null
  if (m.crawl[i] === 1) return null
  if (m.liquid[i] === 1) {
    if (!aquatic) return null // 陆生实体不进入深水
    return -(m.seaFloor?.[i] || 1.7) // v57o：水生实体可进入水体，按海床深度寻路
  }
  if (aquatic) return null // v58：水生实体拒绝上岸——小小/7 层之物无法登上荒岛或任何干地
  if (m.elev[i] === 4) return 0 // 深坑洞口：实体不会避险，走入即坠落（stepEntity 中处死）
  return tileH(m, tx, ty)
}

export function stepEntity(eng: Engine, e: Entity, speed: number, dt: number): boolean {
  const dx = e.targetX - e.x, dy = e.targetY - e.y
  const d = Math.hypot(dx, dy)
  if (d < 0.3) return true
  const m = eng.map!
  let nx = e.x + (dx / d) * speed * dt
  let ny = e.y + (dy / d) * speed * dt
  // v7：实体不追入高差 >0.4m 的区域；v13：楼层带感知 + 可走楼梯跨层（坡道高差 ≤0.75）
  const band = entityBand(m, e)
  // 穿墙实体（钝人/缠斗者）：无视墙体与实心结构，径直穿行——仅钳制在地图边界内
  if (e.def.phases) {
    nx = Math.max(0.2, Math.min(m.w - 0.2, nx))
    ny = Math.max(0.2, Math.min(m.h - 0.2, ny))
    e.facing = Math.atan2(dy, dx)
    e.x = nx; e.y = ny
    if (walkableAt(m, Math.floor(nx), Math.floor(ny), band)) e.z = floorHeight(m, nx, ny, band)
    return false
  }
  const curStair = m.stair[Math.floor(e.y) * m.w + Math.floor(e.x)] & 7
  const h0 = curStair ? tileH(m, Math.floor(e.x), Math.floor(e.y)) : (band >= 1 ? band * FLOOR_H : tileH(m, Math.floor(e.x), Math.floor(e.y)))
  const canGo = (px: number, py: number): boolean => {
    const tx = Math.floor(px), ty = Math.floor(py)
    const nh = eng.entityWalkH(m, tx, ty, band, e.def.aquatic === true)
    if (nh === null) return false
    // v58fix：水生实体在水体瓦片间游动不看海床高差——v58 海床真实起伏让相邻格底高差常超 0.4m，
    // 否则它们会永久卡死在海床洼地（「七层之物卡在海床下面」的根因）；垂直位置由 updateAquaticDepth 管
    if (e.def.aquatic && m.liquid[Math.floor(e.y) * m.w + Math.floor(e.x)] === 1 && m.liquid[ty * m.w + tx] === 1) return true
    const onStair = (m.stair[ty * m.w + tx] & 7) !== 0 || curStair !== 0
    return Math.abs(nh - h0) <= (onStair ? 0.75 : 0.4)
  }
  if (!canGo(nx, e.y)) nx = e.x
  if (!canGo(nx, ny)) ny = e.y
  if (nx === e.x && ny === e.y) return true // 卡住
  e.facing = Math.atan2(dy, dx)
  const ox = e.x, oy = e.y
  e.x = nx; e.y = ny
  // v26：实体半径防穿模——把半径 0.24m 的「圆」从相邻阻挡瓦片（墙/实心结构/不可达高差）中推出，
  // 实体不再半身卡进桌柜/墙体（此前实体为零半径质点，贴墙移动时模型穿进实心结构）
  {
    const ER = 0.24
    const etx = Math.floor(e.x), ety = Math.floor(e.y)
    for (let ty2 = ety - 1; ty2 <= ety + 1; ty2++) {
      for (let tx2 = etx - 1; tx2 <= etx + 1; tx2++) {
        if (tx2 === etx && ty2 === ety) continue
        if (eng.entityWalkH(m, tx2, ty2, band, e.def.aquatic === true) !== null) continue
        const cx2 = Math.max(tx2, Math.min(tx2 + 1, e.x))
        const cy2 = Math.max(ty2, Math.min(ty2 + 1, e.y))
        const ddx = e.x - cx2, ddy = e.y - cy2
        const dd = Math.hypot(ddx, ddy)
        if (dd >= ER || dd < 1e-6) continue
        e.x = cx2 + (ddx / dd) * ER
        e.y = cy2 + (ddy / dd) * ER
      }
    }
  }
  // v13：跟随地面（楼梯坡道连续爬升；上下层带随 z 自动切换）
  // v57o：水生实体不吸到海床——垂直深度由 updateAquaticDepth 每帧驱动（可悬停/追击）
  if (!(e.def.aquatic && m.liquid[Math.floor(e.y) * m.w + Math.floor(e.x)] === 1)) {
    e.z = floorHeight(m, e.x, e.y, entityBand(m, e))
  }
  // 深坑：实体坠入后死亡（无血花，直坠深渊消散）
  if (m.elev[Math.floor(e.y) * m.w + Math.floor(e.x)] === 4 && !e.dead) {
    e.hp = 0; e.dead = true; e.deathT = 1.4
  }
  // 卡住判定（v44 补）：防穿模推挤把本步位移完全抵消——顶着墙原地蹭也算卡住，
  // 漫游状态据此偏转另选目标（见 wanderDeflect），不再顶着同一面墙蹭
  if (Math.hypot(e.x - ox, e.y - oy) < 1e-3) return true
  return false
}

// 实体近战高度判定：与玩家脚底高差 ≥1m 时够不着（高台/沟底/跨层安全）
export function meleeZOk(eng: Engine, e: Entity): boolean {
  return Math.abs(e.z - eng.player.z) < 1
}
