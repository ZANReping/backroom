// v53：NPC/对话/委托/声望（游荡步进、杰瑞教化、BRC 模仿/坦白、传教、EL3A 物流与补给）——
// 自 engine.ts 拆分，逻辑逐语句搬运。
import { bandOfPlayerZ, bandOfZ, tileAt, solidStructAtFloor, upAt, upWallAt } from '../world/mapgen'
import { NPCS, JERRY_PREACH_LINES, JERRY_CHANT_LINES } from '../content/npcs'
import { OUTPOSTS } from '../content/outposts'
import { FACTIONS, genQuest, genBntgQuest, genArianeQuest, genEl3aQuest, genJerryQuest, type QuestDef, type QuestFaction } from '../content/factions'
import { recordEntityEncounter, loadSeen, type Entity } from '../entities'
import { itemName } from '../content/items'
import { audio } from '../core/audio'
import { l2JerryRoomRectAt } from '../world/infiniteL2' // v45：信众宣传间领地矩形（HUD 声望显示）
import type { Engine } from '../engine'

// ---- v45：信众领地判定（HUD 声望显示，仿衔尾段 ouroboros）+ 教化诵咏 + 接触冷却 ----
// （原 step 内联段，逐语句搬运）
export function updateJerry(eng: Engine, dt: number) {
  const p = eng.player, m = eng.map!
  // ---- v45：信众领地判定（HUD 声望显示，仿衔尾段 ouroboros：记下房间矩形，玩家在矩形内即显示）----
  eng.jerryTerritory = p.level === 2 && !!m.inf && l2JerryRoomRectAt(m.inf.seed, m.inf.ox + p.x, m.inf.oy + p.y) !== null
  // ---- v45：教化诵咏——在 Level 274 内被教化（教化值 >0 且鹉主未被驯服）的玩家周期性不受控咏出崇拜词；离开即停 ----
  if (p.level === 274 && eng.indoctrination > 0 && !eng.jerryTamed) {
    eng.chantT -= dt
    if (eng.chantT <= 0) {
      eng.chantT = 7 + Math.random() * 6
      eng.msg(`你不受控地诵咏：「${JERRY_CHANT_LINES[Math.floor(Math.random() * JERRY_CHANT_LINES.length)]}」`, 'lore')
    }
  } else eng.chantT = 0
  // v47：接触杰瑞冷却（20s 防连点刷声望/教化；HUD 交互提示显示剩余秒数）
  if (eng.jerryContactCd > 0) eng.jerryContactCd = Math.max(0, eng.jerryContactCd - dt)
}

/** NPC 主循环（原 step「---- v35：NPC ----」内联段，逐语句搬运） */
export function updateNpcs(eng: Engine, dt: number) {
  const p = eng.player, m = eng.map!
  // ---- v35：NPC（据点居民：岗位附近缓慢游荡 + 偶尔自言自语）----
  // v39：BRC 模仿装修（挥臂动画播完才结算 +2 声望——动作即「短暂延迟」；冷却全局 ~90s）
  if (eng.brcMimicCd > 0) eng.brcMimicCd = Math.max(0, eng.brcMimicCd - dt)
  if (eng.brcMimicPending > 0) {
    eng.brcMimicPending -= dt
    if (eng.brcMimicPending <= 0) {
      eng.changeRep('brc', 2)
      eng.msg('你学着他们的动作挥臂敲打了一阵。附近的员工似乎朝你点了点头。（后室装修公司 声望 +2）', 'loot')
    }
  }
  for (const n of eng.npcs) {
    n.bubbleT = Math.max(0, n.bubbleT - dt)
    // v46：NPC 楼层带感知的可行走判定（上层居民走 up 楼板避开上层墙/上层实心家具；主层居民走地板）
    // v54：三层泛化——floor=2 的三层居民走 up2 楼板/upWall2 三层墙（Gamma 基地行政部）
    const walkOk = (nx: number, ny: number): boolean => {
      const nf = n.floor ?? 0
      if (nf >= 1) {
        const ti = Math.floor(ny) * m.w + Math.floor(nx)
        return upAt(m, nf as 1 | 2)[ti] === 1 && upWallAt(m, nf as 1 | 2)[ti] !== 1 && !solidStructAtFloor(m, nx, ny, nf)
      }
      return tileAt(m, Math.floor(nx), Math.floor(ny)) === 1 && !solidStructAtFloor(m, nx, ny, 0)
    }
    // v39：死亡动画计时（尸体由渲染层倒地/下沉，计时归零后在循环尾移除）
    if (n.dead) { n.deathT = (n.deathT ?? 0) - dt; continue }
    // v45：杰瑞的信众敌意规则（全团体通用）——jerry 声望 ≤ -10 转敌对（主动攻击玩家），恢复后放下敌意
    if (n.def.faction === 'jerry') n.hostile = (eng.rep.jerry ?? 0) <= -10 ? true : undefined
    // v39：敌对（被当面坦白的 BRC 员工）：追击玩家 + 近战；玩家可反击杀死
    if (n.hostile) {
      const hdx = p.x - n.x, hdy = p.y - n.y, hdd = Math.hypot(hdx, hdy)
      n.atkT = Math.max(0, (n.atkT ?? 0) - dt)
      if (hdd > 1.15) {
        const sp = 2.3 * dt
        const nx2 = n.x + (hdx / hdd) * sp, ny2 = n.y + (hdy / hdd) * sp
        if (walkOk(nx2, ny2)) { n.x = nx2; n.y = ny2 }
        n.tx = p.x; n.ty = p.y // 渲染层据此播步态
      } else {
        n.tx = n.x; n.ty = n.y
        if (n.atkT <= 0) { n.atkT = 1.3; eng.hurtPlayer(9, `${FACTIONS[n.def.faction ?? 'meg']?.name ?? 'NPC'} ${n.def.name}`); audio.swing() }
      }
      n.facing = Math.atan2(hdy, hdx)
      continue
    }
    // v45：杰瑞的信众——看见玩家（~8m）主动靠近（approach 走向玩家），到 ~2.5m 停下后高频自言自语传教；
    // 不追出领地（玩家离岗位锚点 >10m 即放弃，回默认游荡）；
    // v47：仅野外随机信众（L2 宣传间）主动传教——L274 内的信众不主动靠近，需玩家主动交谈；
    // v54：蓝色救赎（L108 圣所）内的信众同样不主动靠近（圣地之内需玩家主动交谈，同 L274）
    if (n.def.faction === 'jerry' && p.level !== 274 && p.level !== 108) {
      const jdx = p.x - n.x, jdy = p.y - n.y, jdd = Math.hypot(jdx, jdy)
      if (jdd < 8 && Math.hypot(p.x - n.homeX, p.y - n.homeY) < 10) {
        if (jdd > 2.5) {
          const sp = 1.7 * dt
          const nx2 = n.x + (jdx / jdd) * sp, ny2 = n.y + (jdy / jdd) * sp
          if (walkOk(nx2, ny2)) { n.x = nx2; n.y = ny2 }
          n.tx = p.x; n.ty = p.y // 渲染层据此播步态
        } else {
          n.tx = n.x; n.ty = n.y // 停下：面向玩家高频传教
          n.moveT -= dt
          if (n.moveT <= 0) {
            n.bubbleText = JERRY_PREACH_LINES[Math.floor(Math.random() * JERRY_PREACH_LINES.length)]
            n.bubbleT = 2.8
            n.moveT = 2.5 + Math.random() * 2
          }
        }
        n.facing = Math.atan2(jdy, jdx)
        continue
      }
    }
    // v39：工作循环（BRC 员工）：锚定在工作点不游荡，始终面向工作面（墙/脚手架）
    if (n.def.workLoop) {
      n.tx = n.homeX; n.ty = n.homeY
      if (n.homeFacing !== undefined) n.facing = n.homeFacing
      continue
    }
    n.moveT -= dt
    if (n.moveT <= 0) {
      if (Math.random() < 0.3 && n.def.idle.length > 0) { // 驻足自语
        n.bubbleText = n.def.idle[Math.floor(Math.random() * n.def.idle.length)]
        n.bubbleT = 3
        n.moveT = 4 + Math.random() * 5
      } else { // 新挪动目标（岗位半径 3 内）
        const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 2.5
        n.tx = n.homeX + Math.cos(a) * r
        n.ty = n.homeY + Math.sin(a) * r
        n.moveT = 5 + Math.random() * 7
      }
    }
    const ndx = n.tx - n.x, ndy = n.ty - n.y, ndd = Math.hypot(ndx, ndy)
    if (ndd > 0.15) {
      const sp = 0.7 * dt
      const nx = n.x + (ndx / ndd) * sp, ny = n.y + (ndy / ndd) * sp
      if (walkOk(nx, ny)) { n.x = nx; n.y = ny }
      else { n.tx = n.homeX; n.ty = n.homeY } // 受阻回岗位
      n.facing = Math.atan2(ndy, ndx)
    }
  }
  // v39：尸体清理（引擎列表与所属 chunk 一并移除，防止窗口重缝合/重访时复活）
  if (eng.npcs.some((n) => n.dead && (n.deathT ?? 0) <= 0)) {
    const gone = eng.npcs.filter((n) => n.dead && (n.deathT ?? 0) <= 0)
    eng.npcs = eng.npcs.filter((n) => !(n.dead && (n.deathT ?? 0) <= 0))
    if (m.inf) for (const c of m.inf.chunks.values()) c.npcs = c.npcs.filter((n) => !gone.includes(n))
  }
}
// ---------- v35：团体声望与委托任务 ----------
/** 调整某团体声望（clamp ±100；流浪者等无声望团体直接忽略） */
export function changeRep(eng: Engine, factionId: string, delta: number) {
  const f = FACTIONS[factionId]
  if (!f?.hasRep || delta === 0) return
  const cur = eng.rep[factionId] ?? 0
  const next = Math.max(-100, Math.min(100, cur + delta))
  eng.rep[factionId] = next
  eng.msg(`与${f.name}的声望 ${cur > 0 ? '+' : ''}${cur} → ${next > 0 ? '+' : ''}${next}`, delta > 0 ? 'loot' : 'damage')
}

// ---------- v39：BRC（后室装修公司）模仿装修 / 坦白 ----------
export const BRC_MIMIC_CD = 90 // 模仿装修全局冷却（秒，防连点）
/** 模仿 BRC 员工的动作进行装修：播放挥臂动画，动作播完 +2 声望；全局冷却 ~90s（冷却中返回 false） */
export function mimicBrc(eng: Engine): boolean {
  if (eng.brcMimicCd > 0) {
    eng.msg(`手臂还酸着——先歇 ${Math.ceil(eng.brcMimicCd)} 秒再学。`, 'system')
    return false
  }
  eng.brcMimicCd = BRC_MIMIC_CD
  eng.brcMimicPending = 0.9 // 挥臂动画播完结算（引擎主循环倒数）
  eng.attackAnimT = 0.5
  eng.attackAnimKind = 'swing'
  audio.swing()
  eng.msg('你学着他们的动作，对着墙面挥臂敲打起来……', 'system')
  return true
}

/** 向 BRC 员工坦白你伤害/杀死了他们的同事：结清未告发记录（伤害 -10/人、杀死 -30/人），
 *  且当前对话的这名员工转为敌对（追击 + 近战；可被反击杀死）。无未告发记录返回 false */
export function confessBrc(eng: Engine, npcId: string): boolean {
  const n = eng.npcs.find((x) => x.id === npcId)
  const { hurt, killed } = eng.brcSin
  if (!n || n.def.faction !== 'brc' || n.dead || hurt + killed === 0) return false
  const pen = hurt * 10 + killed * 30
  eng.brcSin = { hurt: 0, killed: 0 }
  n.hostile = true
  n.atkT = 0.9 // 坦白后短暂停顿（「困惑与不舒适」），随即追击
  n.bubbleT = 0
  eng.changeRep('brc', -pen)
  audio.aggro()
  eng.msg(`你坦白了。${n.def.name} 停下手里的活，缓缓转向你——贝雷帽下的黑脸没有任何表情。`, 'damage')
  return true
}

// ---------- v45：杰瑞的信众 / Level 274 教化系统 ----------
/** 视线内 2.5m 内的活体杰瑞实体（接触/驯服判定共用） */
export function aimJerry(eng: Engine): Entity | null {
  const p = eng.player, m = eng.map
  if (!m) return null
  const band = bandOfPlayerZ(m, p.z)
  let best: { e: Entity; a: number; d: number } | null = null
  for (const e of eng.map?.entities ?? []) {
    if (e.dead || e.def.type !== 'jerry') continue
    const entityBand = bandOfZ(e.z)
    if (entityBand !== band) continue
    const probe = eng.interactionProbe(e.x, e.y, e.z + 0.8, entityBand, 2.5, 0.4, {
      minX: e.x - 0.42, minY: e.y - 0.42, minZ: e.z,
      maxX: e.x + 0.42, maxY: e.y + 0.42, maxZ: e.z + 1.6,
    })
    if (!probe) continue
    if (!best || probe.a < best.a - 1e-4 || (Math.abs(probe.a - best.a) <= 1e-4 && probe.d < best.d)) {
      best = { e, ...probe }
    }
  }
  return best?.e ?? null
}

/** 对话「认同：杰瑞是最伟大的」是否可选（DialogOverlay 显示条件与引擎判定同一口径）：
 *  v48 仅野外信众（L274 内他们已认可你才带你来）；v49 每局仅首次——已宣誓后任何信众处不再出现 */
export function canAgreeJerry(eng: Engine, npcId: string): boolean {
  const n = eng.npcs.find((x) => x.id === npcId)
  // v54：蓝色救赎（108）同 L274——圣所内信众不提供认同（声望 >30 才准入，已是虔徒）
  return !!n && n.def.faction === 'jerry' && !n.dead && eng.player.level !== 274 && eng.player.level !== 108 && !eng.jerryOath
}

/** 对话「认同：杰瑞是最伟大的」——jerry 声望 +10（v49：每局游戏仅首次有效——宣誓一次，
 *  全鹦鹉门下皆知；之后任何信众处该选项不再出现，引擎层同样拒绝）；
 *  v48：仅野外信众（L2 宣传间）可表达——L274 内的信众已认可你才带你来，不提供认同选项 */
export function agreeJerry(eng: Engine, npcId: string): boolean {
  const n = eng.npcs.find((x) => x.id === npcId)
  if (!n || n.def.faction !== 'jerry' || n.dead) return false
  if (eng.player.level === 274 || eng.player.level === 108) { // v54：圣所（274）与蓝色救赎（108）内同样不认同
    eng.msg(`${n.def.name}微笑着按住你的手：「无需多言——你能站在圣地，便是鹉主对你的认可。」`, 'system')
    return false
  }
  if (eng.jerryOath) {
    eng.msg(`${n.def.name}颔首：「你已宣誓过了，兄弟姐妹——鹉主记得每一句誓言。」（每局仅首次认同有效）`, 'system')
    return false
  }
  eng.jerryOath = true
  eng.jerryAgreed.add(npcId)
  eng.changeRep('jerry', 10)
  eng.msg(`${n.def.name}眼中亮起光：「鹉主听见了！欢迎你，兄弟姐妹。」`, 'loot')
  return true
}

/** 对话「带我去杰瑞的房间」（表达认同后出现）——jerry 声望 ≥10 才引路，否则拒绝 */
export function gotoJerryRoom(eng: Engine, npcId: string): boolean {
  const n = eng.npcs.find((x) => x.id === npcId)
  if (!n || n.def.faction !== 'jerry' || n.dead) return false
  const rep = eng.rep.jerry ?? 0
  if (rep < 10) {
    eng.msg(`${n.def.name}摇了摇头：「你还不够虔诚。」（需要杰瑞的信众声望 ≥10，当前 ${rep}）`, 'system')
    return false
  }
  eng.outpostReturn = eng.player.level
  eng.transition = { anim: 'bloom', t: 0, dest: 274 }
  eng.emit({ kind: 'transition', anim: 'bloom', cutIn: 'outpost', dest: 274 })
  eng.msg(`${n.def.name}虔诚地低下头：「随我来——鹉主在穹顶之下等你。」`, 'lore')
  return true
}

/** 对话「非议杰瑞」（作死选项）——jerry 声望 -10（≤-10 时信众立即转敌对） */
export function slanderJerry(eng: Engine, npcId: string): boolean {
  const n = eng.npcs.find((x) => x.id === npcId)
  if (!n || n.def.faction !== 'jerry' || n.dead) return false
  eng.changeRep('jerry', -10)
  eng.msg(`${n.def.name}的笑容凝固了：「……你刚才，是在非议鹉主吗？」`, 'damage')
  return true
}

/** v47：伤害鹉主杰瑞——信众哗然：jerry 声望立即 -50（每次伤害；挥击/投掷波及均走此通道） */
export function hurtJerryRep(eng: Engine) {
  eng.changeRep('jerry', -50)
  audio.aggro()
  eng.msg('你伤害了鹉主——信众哗然！怒喝与哭喊响彻穹顶。（杰瑞的信众 声望 -50）', 'damage')
}

/** 接触杰瑞：jerry 声望 +5（每次）+ 教化 +25 + 触发诵咏；驯服后接触不再积累教化；
 *  v47：内置 20s 冷却（防连点刷声望/教化；冷却剩余在 HUD 交互提示显示） */
export function contactJerry(eng: Engine, ent?: Entity): boolean {
  const aimed = eng.aimJerry()
  const j = ent ? (aimed === ent ? ent : null) : aimed
  if (!j) return false
  if (eng.jerryContactCd > 0) {
    eng.msg(`鹉主刚刚赐福过你——先消化这份恩典。（接触冷却 ${Math.ceil(eng.jerryContactCd)}s）`, 'system')
    return false
  }
  eng.jerryContactCd = 20
  recordEntityEncounter(j) // v54：特殊交互计遭遇（按个体去重——这只鹉主只计一次）
  audio.pickup()
  eng.changeRep('jerry', 5) // 每次接触 +5
  if (eng.jerryTamed) {
    eng.msg('你抚摸着鹉主的羽毛。它温顺地蹭了蹭你的手——驯服之后，它的凝视不再触及你的灵魂。（声望 +5）', 'loot')
    return true
  }
  const before = eng.indoctrination
  eng.indoctrination = Math.min(100, eng.indoctrination + 25)
  eng.msg('你触碰了鹉主。一股温热的蓝意在脑海深处散开——词语开始自己涌上舌尖。（声望 +5 · 教化 +25）', 'lore')
  if (before === 0) eng.chantT = 3 // 首次接触后很快开始诵咏
  if (before < 100 && eng.indoctrination >= 100)
    eng.msg('教化完成了。你望着穹顶下的蓝色身影，忽然明白：你属于这里。鹉主还需要你。', 'lore')
  return true
}

/** 驯服：对杰瑞给予杏仁水（消耗 1 瓶）——教化清零且此后接触不再积累；
 *  但若被信众 NPC 看见（~8m 内有信众）→ 视为亵渎：jerry 声望 -10 */
export function tameJerry(eng: Engine): boolean {
  if (eng.jerryTamed) { eng.msg('鹉主已经被你驯服了——它安静地看着你。', 'system'); return false }
  if (!eng.aimJerry()) { eng.msg('这里没有鹉主的身影。', 'system'); return false }
  if (!eng.hasItem('almond')) { eng.msg('需要一瓶杏仁水。', 'system'); return false }
  eng.consumeItem('almond')
  eng.jerryTamed = true
  eng.indoctrination = 0
  audio.pickup()
  const p = eng.player
  const witnessed = eng.npcs.some((n) => !n.dead && n.def.faction === 'jerry' && Math.hypot(n.x - p.x, n.y - p.y) <= 8)
  if (witnessed) {
    // 被信众看见：亵渎
    eng.changeRep('jerry', -10)
    audio.aggro()
    eng.msg('「亵渎者！！」信众的怒喝响彻穹顶——你当着他们的面驯服了鹉主。（杰瑞的信众 声望 -10）', 'damage')
  } else {
    eng.msg('鹉主啄食了杏仁水，满足地抖了抖羽毛。它不再凝视你的灵魂——教化消退了。（教化值清零）', 'loot')
  }
  eng.emit({ kind: 'toast', text: '鹉主已被驯服（教化清零）' })
  return true
}

/** v55：求治感染（疫疾三阶以上，仅医疗身份 NPC）——清除感染值；对话选项显示条件同为 infection ≥300 */
export function cureInfection(eng: Engine, npcId: string): boolean {
  const def = eng.npcs.find((x) => x.id === npcId)?.def ?? NPCS[npcId]
  if (!def?.medic) return false
  if (eng.player.infection < 300) { eng.msg('你没有需要医治的病症。', 'system'); return false }
  eng.player.infection = 0
  eng.infectionStage = 0
  audio.pickup()
  eng.msg(`${def.name}为你做了彻底检查，开出隔离熏蒸与一疗程药剂——几天后那种沉重感褪得干干净净。（感染已治愈）`, 'loot')
  return true
}

/** v47：传教使命已标准委托化（QuestDef kind 'preach'，三选一接取/交付；jerry 声望 ≥30 才显示入口）。
 *  进行中的传教委托（未完成）可让玩家离开 L274 时免于声望惩罚（takeExit）。 */
export function preachQuest(eng: Engine): { def: QuestDef; progress: number; baseline: number; done: boolean } | undefined {
  return eng.quests.find((q) => q.def.kind === 'preach')
}

/** 传教目标是否有效（对话「传教」选项显示条件）：指定据点的任意 NPC / 任意地点的其他团体 NPC */
export function preachTargetOk(eng: Engine, npcId: string): boolean {
  const q = eng.quests.find((q) => q.def.kind === 'preach' && !q.done)
  if (!q) return false
  const def = eng.npcs.find((x) => x.id === npcId)?.def ?? NPCS[npcId]
  if (!def || def.faction === 'jerry') return false
  if (eng.player.level === OUTPOSTS[q.def.target]?.levelId) return true // 指定据点的任意 NPC
  const f = def.faction ?? 'meg'
  return f !== 'wanderer' && !!FACTIONS[f]?.hasRep // 任意地点的其他团体 NPC
}

/** 对目标 NPC 传教——委托目标达成（回 L274 侍立信众处交付领赏）；代价：目标 NPC 所属团体声望 -5（布道惹人嫌） */
export function preachTo(eng: Engine, npcId: string): boolean {
  const q = eng.quests.find((q) => q.def.kind === 'preach' && !q.done)
  if (!q) return false
  const def = eng.npcs.find((x) => x.id === npcId)?.def ?? NPCS[npcId]
  if (!def) return false
  if (!eng.preachTargetOk(npcId)) { eng.msg('他不是合适的传教对象。', 'system'); return false }
  const o = OUTPOSTS[q.def.target]
  q.progress = 1
  q.done = true
  const f = def.faction ?? 'meg'
  if (f !== 'jerry' && FACTIONS[f]?.hasRep) eng.changeRep(f, -5)
  else if (o && FACTIONS[o.faction]?.hasRep) eng.changeRep(o.faction, -5) // 无团体者：记在其所在据点头上
  audio.pickup()
  eng.emit({ kind: 'toast', text: '传教目标达成——回 Level 274 向侍立信众复命' })
  eng.msg(`${def.name}礼貌地听你讲完，表情微妙。教义已传播——总会有人记住鹉主之名。`, 'loot')
  eng.msg('传教目标达成——回 Level 274 向侍立信众复命，信众自会记你的好。', 'system')
  return true
}

/** 三个候选委托（类型/目标互不相同，也不与手上委托重复；供玩家三选一；按发放团体分题库） */
export function questOffers(eng: Engine, faction: QuestFaction = 'meg'): QuestDef[] {
  // v47：传教使命（jerry）声望 ≥30 才提供（与 DialogOverlay 的入口显示门槛一致）
  if (faction === 'jerry' && (eng.rep.jerry ?? 0) < 30) return []
  const out: QuestDef[] = []
  const seen = new Set<string>(eng.quests.map((q) => `${q.def.kind}:${q.def.target}`))
  const gen = faction === 'bntg' ? genBntgQuest : faction === 'ariane' ? genArianeQuest : faction === 'jerry' ? genJerryQuest : genQuest
  for (let tries = 0; tries < 40 && out.length < 3; tries++) {
    const def = gen(Math.random)
    const key = `${def.kind}:${def.target}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(def)
  }
  return out
}

/** 接取 MEG 委托（探险署；同类同目标不重复；困难任务赠迁跃浆果） */
export function acceptQuest(eng: Engine, def?: QuestDef): boolean {
  if (eng.quests.filter((q) => !q.done).length >= 3) { eng.msg('手上的委托太多了——先完成一个再说。', 'system'); return false }
  for (let tries = 0; tries < 8; tries++) {
    const q = def ?? genQuest(Math.random)
    if (eng.quests.some((x) => x.def.kind === q.kind && x.def.target === q.target)) {
      if (def) { eng.msg('同样的委托已经在手上了。', 'system'); return false }
      continue
    }
    const baseline = q.kind === 'entity' ? (loadSeen()[q.target] ?? 0) : q.unit === 'dist' ? eng.player.steps : 0
    // v43：物流委托——接取即得实体「物流包裹」（占背包格；背包满则接取失败）
    if (q.kind === 'deliverGoods' && !eng.addItem('parcel')) { eng.msg('背包满了，腾不出放包裹的格子。', 'system'); return false }
    eng.quests.push({ def: q, progress: 0, baseline, done: false })
    eng.msg(`接取委托：「${q.title}」——${q.desc}`, 'loot')
    if (q.hard) {
      eng.addItem('warpberry')
      eng.msg('困难委托：探险署额外发了一枚迁跃浆果（食用可返回接取该任务的据点）。', 'loot')
    }
    return true
  }
  eng.msg('暂时没有合适的委托。', 'system')
  return false
}

/** 交付委托（按委托方过滤；物品类现场扣除；按委托方发放声望/货币/物资奖励） */
export function turnInQuest(eng: Engine, faction: QuestFaction = 'meg'): boolean {
  const q = eng.quests.find((q) => q.done && q.def.faction === faction)
  if (!q) { eng.msg('还没有已完成的委托。', 'system'); return false }
  if (q.def.kind === 'item') {
    if (eng.countItem(q.def.target) < q.def.n) { eng.msg(`物资不够：还差 ${q.def.n - eng.countItem(q.def.target)} 个。`, 'system'); return false }
    for (let i = 0; i < q.def.n; i++) eng.consumeItem(q.def.target)
  }
  eng.quests = eng.quests.filter((x) => x !== q)
  const coin = q.def.faction === 'bntg' ? 'presses' : 'eaglecoin'
  const coinName = q.def.faction === 'bntg' ? '压印币' : '天鹰币'
  eng.changeRep(q.def.faction, q.def.rewardRep)
  for (let i = 0; i < q.def.rewardCoin; i++) eng.addItem(coin)
  for (const t of q.def.rewardItems) eng.addItem(t)
  audio.pickup()
  // 阿丽亚娜无货币（rewardCoin=0）：toast 只显示声望 + 物资
  const rewardText = q.def.rewardCoin > 0
    ? `+${q.def.rewardRep} 声望 · ${coinName}×${q.def.rewardCoin}`
    : `+${q.def.rewardRep} 声望${q.def.rewardItems.length ? ` · ${q.def.rewardItems.map((t) => itemName(t)).join('、')}` : ''}`
  eng.emit({ kind: 'toast', text: `委托交付：${rewardText}` })
  eng.msg(`委托「${q.def.title}」交付完成。${FACTIONS[q.def.faction]?.name ?? '对方'}记下了你的贡献。`, 'loot')
  return true
}

/** 押运交付：与押运目标 NPC 交谈时当面交付（BNTG 委托；立即结算奖励） */
export function deliverQuestTo(eng: Engine, npcId: string): boolean {
  const q = eng.quests.find((q) => q.def.kind === 'deliver' && q.def.target === npcId && !q.done)
  if (!q) return false
  q.done = true
  eng.quests = eng.quests.filter((x) => x !== q)
  eng.changeRep('bntg', q.def.rewardRep)
  for (let i = 0; i < q.def.rewardCoin; i++) eng.addItem('presses')
  for (const t of q.def.rewardItems) eng.addItem(t)
  audio.pickup()
  eng.emit({ kind: 'toast', text: `押运交付：+${q.def.rewardRep} BNTG 声望 · 压印币×${q.def.rewardCoin}` })
  eng.msg(`包裹当面交付完成。商人之家记下了你的可靠。`, 'loot')
  return true
}

/** v43：EL3A 物流委托候选（三个目标互不相同的 deliverGoods；供物流主管处三选一） */
export function goodsQuestOffers(eng: Engine): QuestDef[] {
  const out: QuestDef[] = []
  const seen = new Set<string>(eng.quests.map((q) => `${q.def.kind}:${q.def.target}`))
  for (let tries = 0; tries < 40 && out.length < 3; tries++) {
    const def = genEl3aQuest(Math.random)
    const key = `${def.kind}:${def.target}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(def)
  }
  return out
}

/** v43：物流交付——与收件 NPC 交谈时当面交付（须带着物流包裹；立即结算压印币 + BNTG 声望） */
export function deliverGoodsTo(eng: Engine, npcId: string): boolean {
  const q = eng.quests.find((q) => q.def.kind === 'deliverGoods' && q.def.target === npcId && !q.done)
  if (!q) return false
  if (!eng.hasItem('parcel')) { eng.msg('包裹不在身上——你不会把它弄丢了吧？回 EL3A 找物流主管说明情况。', 'system'); return false }
  eng.consumeItem('parcel')
  q.done = true
  eng.quests = eng.quests.filter((x) => x !== q)
  eng.changeRep('bntg', q.def.rewardRep)
  for (let i = 0; i < q.def.rewardCoin; i++) eng.addItem('presses')
  for (const t of q.def.rewardItems) eng.addItem(t)
  audio.pickup()
  eng.emit({ kind: 'toast', text: `物流交付：+${q.def.rewardRep} BNTG 声望 · 压印币×${q.def.rewardCoin}` })
  eng.msg(`包裹当面签收。办公区EL3A 的补给线又顺了一程。`, 'loot')
  return true
}

/** v43：物流失败认定——包裹不在身上时回 EL3A 向物流主管认栽（任务移除，BNTG 声望 -3） */
export function failGoodsQuest(eng: Engine): boolean {
  const q = eng.quests.find((q) => q.def.kind === 'deliverGoods' && !q.done)
  if (!q) { eng.msg('手上没有进行中的物流委托。', 'system'); return false }
  if (eng.hasItem('parcel')) { eng.msg('包裹不是还在你背包里吗？别自己吓自己。', 'system'); return false }
  eng.quests = eng.quests.filter((x) => x !== q)
  eng.changeRep('bntg', -3)
  eng.emit({ kind: 'toast', text: `委托失败：「${q.def.title}」——BNTG 声望 -3` })
  eng.msg(`你向麦考利主管认栽了。他在登记簿上画了一道黑杠：「下次看紧点。」`, 'system')
  return true
}

/** v43：玩家身上基础物资（杏仁水/罐装食品/绷带/电池）总数——免费救济判定用 */
export function basicSupplyCount(eng: Engine): number {
  return eng.countItem('almond') + eng.countItem('canned') + eng.countItem('bandage') + eng.countItem('battery')
}
/** v43：免费补给包可领条件（物资匮乏：基础物资 <2；每次进入 EL3A 限领一次） */
export function canClaimEl3aRelief(eng: Engine): boolean {
  return !eng.el3aReliefClaimed && eng.basicSupplyCount() < 2
}
/** v43：领取免费补给包（杏仁水×1 + 罐装食品×1） */
export function claimEl3aRelief(eng: Engine): boolean {
  if (eng.el3aReliefClaimed) { eng.msg('这趟你已经领过补给包了——下次进仓再来吧。', 'system'); return false }
  if (eng.basicSupplyCount() >= 2) { eng.msg('你身上的物资还够——补给包留给更需要的人。', 'system'); return false }
  if (!eng.addItem('almond') || !eng.addItem('canned')) { eng.msg('背包满了，腾不出放补给包的格子。', 'system'); return false }
  eng.el3aReliefClaimed = true
  audio.pickup()
  eng.emit({ kind: 'toast', text: '领取补给包：杏仁水×1 · 罐装食品×1' })
  eng.msg('维斯珀从柜台下取出一个补给包塞给你：「先顶着，别客气。」', 'loot')
  return true
}
/** 委托进度追踪（每帧 step 调用；完成即提示回探险署交付） */
export function trackQuests(eng: Engine, dt: number) {
  const p = eng.player
  for (const q of eng.quests) {
    if (q.done) continue
    const d = q.def
    if (d.kind === 'level' && p.level === Number(d.target)) {
      q.progress = d.unit === 'time' ? q.progress + dt : p.steps - q.baseline
    } else if (d.kind === 'phen' && eng.activePhenomena.includes(d.target)) {
      q.progress = 1
    } else if (d.kind === 'entity' && (loadSeen()[d.target] ?? 0) > q.baseline) {
      q.progress = 1
    } else continue
    if (q.progress >= d.n) {
      q.done = true
      audio.pickup()
      eng.msg(`委托目标达成：「${d.title}」——回探险署（中控室）交付。`, 'loot')
    }
  }
}
