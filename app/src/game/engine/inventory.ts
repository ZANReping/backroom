// v53：背包/装备/物品使用（槽位读写、快捷使用/丢弃、粉笔头、迁跃浆果）——
// 自 engine.ts 拆分，逻辑逐语句搬运。
import { ITEMS, itemName } from '../content/items'
import { tileAt } from '../world/mapgen'
import { audio } from '../core/audio'
import type { Engine, InvSlot, SlotRef, SlotWhere } from '../engine'

// v51：天才糖的「冷知识」（简单但常被人认错）
const GENIUS_FACTS = [
  '土耳其的首都是安卡拉，不是伊斯坦布尔',
  '拿破仑并不矮，他大约有 170 厘米',
  '从太空里肉眼是看不见长城的',
  '金鱼的记忆远不止七秒',
  '蝙蝠并不是瞎子',
  '地球自转一周其实不足 24 小时',
  '指南针指的并不是真正的北极',
]
/** 迁跃浆果：传送回首次发现这种浆果的层级 */
export function warpToBerryLevel(eng: Engine, tag?: number) {    const dest = tag ?? eng.warpBerryLevel // 格子标签优先；无标签的旧档浆果回退到首次获得层级
  if (dest === null || dest === eng.player.level) {
    eng.msg('浆果的空间涟漪荡开——但你已经在这里了。', 'lore')
    return
  }
  eng.msg('浆果在你口中炸开一圈空间涟漪——', 'lore')
  eng.transition = { anim: 'bloom', t: 0, dest }
  eng.emit({ kind: 'transition', anim: 'bloom', dest })
}
// ---------- 背包 ----------
export function addItem(eng: Engine, type: string): boolean {
  const p = eng.player
  const def = ITEMS[type]
  const tag = type === 'warpberry' ? p.level : undefined // 迁跃浆果：获得时打上当前层级标签
  const all = [...p.hotbar, ...p.backpack]
  let ok = false
  for (const s of all) if (!ok && s && s.type === type && s.tag === tag && s.count < def.stack) { s.count++; ok = true }
  for (let i = 0; !ok && i < p.hotbar.length; i++) if (!p.hotbar[i]) { p.hotbar[i] = { type, count: 1, ...(tag !== undefined ? { tag } : {}) }; ok = true }
  for (let i = 0; !ok && i < p.backpack.length; i++) if (!p.backpack[i]) { p.backpack[i] = { type, count: 1, ...(tag !== undefined ? { tag } : {}) }; ok = true }
  if (ok) {
    eng.syncPassives()
    // v32：迁跃浆果——首次获得时记录所在层级（旧存档无标签浆果的回退传送目标；新档按格子标签传送）
    if (type === 'warpberry' && eng.warpBerryLevel === null) eng.warpBerryLevel = p.level
    // v32：斧头——获得时重置耐久（5 点，破门消耗）
    if (type === 'axe' && eng.axeDur <= 0) eng.axeDur = 5
  }
  return ok
}
export function hasItem(eng: Engine, type: string): boolean { return eng.countItem(type) > 0 }
export function countItem(eng: Engine, type: string): number {
  const p = eng.player
  return [...p.hotbar, ...p.backpack].reduce((s, sl) => s + (sl && sl.type === type ? sl.count : 0), 0)
}
export function consumeItem(eng: Engine, type: string): boolean {
  const p = eng.player
  for (const arr of [p.hotbar, p.backpack]) {
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i]
      if (s && s.type === type) {
        s.count--
        if (s.count <= 0) arr[i] = null
        eng.syncPassives()
        return true
      }
    }
  }
  return false
}
export function useSlot(eng: Engine, where: SlotWhere, i: number) {
  const s = eng.slotGet({ w: where, i })
  if (!s) return
  const def = ITEMS[s.type]
  // v57t：来源不明的书——翻开记录「七层之物」的旧书页（不消耗，读过的内容已存进图鉴文档）
  if (s.type === 'oddbook') {
    audio.uiTick()
    eng.emit({ kind: 'doc', text: 'l7_thing_journal' })
    eng.msg('书页已经脆得发黄。你翻到了那张关于「七层之物」的记录。', 'lore')
    return
  }
  // 装备类物品：主手使用无效果 → 提示其作用与应在的装备位
  if (def.equip) {
    const slotName = { offhand: '副手', body: '身体', gloves: '手套', head: '头饰', pocket: '口袋' }[def.equip]
    eng.msg(`${def.name} 是装备（${def.passive ?? def.desc}），应放在【${slotName}】栏——在背包中拖拽到对应装备位。`, 'system')
    return
  }
  if (!def.use || def.use === 'none') {
    // v32：笔记本和笔——翻开笔记本（可自由书写，字迹自动保留）
    if (s.type === 'notebook') { eng.emit({ kind: 'notebook' }); return }
    // v32：滋水枪——右键/使用 = 把储罐液体对自己喝一口（杏仁水理智+10，腰果水-10，清水无效果）
    if (s.type === 'squirtgun') {
      if (eng.squirtAmmo <= 0 || eng.squirtTank === 'none') {
        eng.msg('储罐是空的——在物品栏选中滋水枪，于右侧信息栏装入液体。', 'system')
        return
      }
      eng.squirtAmmo--
      eng.attackAnimT = 0.35
      eng.attackAnimKind = 'drink' // 举到嘴边的饮用动画
      audio.pickup()
      if (eng.squirtTank === 'almond') { eng.player.sanity = Math.min(100, eng.player.sanity + 10); eng.msg('你就着储罐喝了一口杏仁水——甜腻。（理智 +10）', 'loot') }
      else if (eng.squirtTank === 'cashew') { eng.player.sanity = Math.max(0, eng.player.sanity - 10); eng.msg('你就着储罐喝了一口腰果水——苦涩烧喉。（理智 -10）', 'damage') }
      else if (eng.squirtTank === 'liquidpain') {
        // 液态痛苦（Object 48）：腐蚀性酸液——自饮重创
        eng.player.hp = Math.max(1, eng.player.hp - 35)
        eng.player.sanity = Math.max(0, eng.player.sanity - 55)
        eng.msg('你就着储罐喝了一口液态痛苦——喉咙和胃像被烧穿了一样。千万别再这么干。（生命 -35 · 理智 -55）', 'damage')
      }
      else eng.msg('你就着储罐喝了一口清水。', 'system')
      if (eng.squirtAmmo <= 0) { eng.squirtTank = 'none'; eng.msg('储罐空了。', 'system') }
      return
    }
    eng.msg(`${def.name} 无法直接使用。`, 'system')
    return
  }
  const p = eng.player
  // v54：口渴效果（value3，正负均可）——饮用/汤类食物挂到各自 use 分支
  const applyThirst = (v?: number) => { if (v) p.thirst = Math.max(0, Math.min(100, p.thirst + v)) }
  let noConsume = false // v51：人制品效应拒食——效果门控时不消耗物品
  // v45：对杰瑞给予杏仁水（Level 274 视线内 2.5m）→ 驯服鹉主，而不是自己喝掉
  if (s.type === 'almond' && p.level === 274 && !eng.jerryTamed && eng.aimJerry()) {
    eng.tameJerry()
    return
  }
  switch (def.use) {
    case 'eat': {
      // v51：人制品——5 分钟效应（拒食他物/治疗减半/恒显饥饿特效/体力恢复减半消耗加倍/受伤 -10%）
      if (s.type === 'manmade') {
        eng.manmadeT = 300
        p.hunger = Math.min(100, p.hunger + (def.value ?? 15))
        eng.msg('甜得发腻，胃里却更空了——你还想要更多。（人制品效应 5 分钟 · 饥饿+15）', 'lore')
        break
      }
      // v51：人制品效应中——拒绝进食其他食物（不消耗物品）
      if (eng.manmadeT > 0) {
        eng.msg('你的胃拒绝接受别的食物——你满脑子只有那台售货机。（人制品效应）', 'damage')
        noConsume = true
        break
      }
      // v51：Object 5 糖果——统一 饥饿+5 理智+5 + 糖瘾计时 + 各自超自然效果
      if (s.type.startsWith('candy')) {
        p.hunger = Math.min(100, p.hunger + 5)
        p.sanity = Math.min(100, p.sanity + 5)
        eng.candyAddictT = 60
        if (s.type === 'candysilver') {
          eng.silverTongueT = 300
          eng.msg('银舌头在口中化开，一股金属凉意——说话突然顺溜了。（交易 95 折 · 5 分钟 · 饥饿+5 理智+5）', 'lore')
        } else if (s.type === 'candybullet') {
          eng.slipperyT = 10
          eng.msg('子弹巧克力滑下喉咙——脚底有点抹了油。（脚滑 10 秒 · 饥饿+5 理智+5）', 'lore')
        } else if (s.type === 'candygun') {
          eng.gunCandyT = 10
          eng.msg('你感觉右手一阵酥麻——它变成了一把枪。（10 秒 · 左键发射巧克力子弹 · 饥饿+5 理智+5）', 'lore')
        } else if (s.type === 'candystanley') {
          eng.stanleyTeleport()
        } else if (s.type === 'candywaste') {
          p.hp = Math.max(1, p.hp - 5)
          eng.msg('酸！唾液烧得口腔发疼。（生命 -5 · 饥饿+5 理智+5）', 'damage')
        } else if (s.type === 'candygenius') {
          const fact = GENIUS_FACTS[Math.floor(Math.random() * GENIUS_FACTS.length)]
          eng.msg(`「${fact}」——你好像知道了什么。（饥饿+5 理智+5）`, 'lore')
        } else {
          eng.msg('薄荷混着杏仁的清凉在口中散开——口气清新了。（饥饿+5 理智+5）', 'lore')
        }
        break
      }
      // v50：液态痛苦（Object 48）——饮用 = 腐蚀自身（生命/理智双损）；v54：灼烧般脱水（口渴 -30）
      if (s.type === 'liquidpain') {
        p.hp = Math.max(1, p.hp - 35)
        p.sanity = Math.max(0, p.sanity - 55)
        applyThirst(def.value3)
        eng.msg('你喝下了液态痛苦——盐酸般的灼烧从喉咙一路烧进胃里，眼前一阵发黑。（生命 -35 · 理智 -55 · 口渴 -30）', 'damage')
        break
      }
      // v32：皇家口粮——饥饿全满 + 理智下限锁定 + 成瘾机制（可多次食用，逐次加长成瘾）
      if (s.type === 'royalration') {
        p.hunger = 100
        if (p.infection < 100) { p.infection = 0; eng.infectionRecoverT = 60 } // v55：甘美之物压下初染（未满一阶清除 + 60s「恢复」buff）
        if (eng.sanityFloor < 40) {
          eng.sanityFloor = 40
          eng.msg('甘美难以言喻——你的理智下限仿佛被钉住了。（理智不再跌破 40）', 'lore')
        } else eng.msg('甘美依旧，渴求更深了。', 'loot')
        eng.royalAddictT += 180
        // 成瘾性触发：概率把余下的皇家口粮全部消耗掉，理智急速下降
        if (Math.random() < 0.25) {
          for (const arr of [p.hotbar, p.backpack])
            for (let i = 0; i < arr.length; i++)
              if (arr[i]?.type === 'royalration') arr[i] = null
          eng.royalDrainT = 5
          eng.msg('渴求压倒了你——余下的皇家口粮被发疯般全部吃光！理智开始崩塌。', 'damage')
        }
        break
      }
      // 成瘾期间：其他所有食物均不恢复饥饿（仍被吃掉）
      if (eng.royalAddictT > 0) {
        eng.msg('成瘾发作：其他食物尝起来像灰烬，一点也吃不饱。', 'damage')
        break
      }
      p.hunger = Math.min(100, p.hunger + (def.value ?? 30))
      applyThirst(def.value3) // v54：番茄浓汤等汤类食物顺带解渴
      // v32：迁跃浆果——食用后传送回该颗浆果标签记录的层级（不同标签不混堆）
      if (s.type === 'warpberry') eng.warpToBerryLevel(s.tag)
      break
    }
    case 'heal': p.hp = Math.min(100, p.hp + (def.value ?? 30) * (eng.manmadeT > 0 ? 0.5 : 1) * (p.infection >= 300 ? 0.5 : 1)); break // v51：人制品效应中治疗减半；v55：疫疾三阶起治疗减半
    case 'cure': {
      // 消毒液：消去疫疾（v55 实装）——一阶完全清除；二阶只能退回 50；三阶起病灶入里、消毒无效；
      // 生效即获 60s「恢复」buff（阻增长 + 非感染区自然消退；重复服用重置计时）
      if (p.infection >= 300) eng.msg('你仔细做了一遍消毒——但那种不适感已经不在皮肤表面了。', 'system')
      else if (p.infection >= 200) { p.infection = 50; eng.infectionRecoverT = 60; eng.msg('你把消毒液浇在皮肤上，刺痛的清爽让头脑清醒了些。', 'loot') }
      else if (p.infection > 0) { p.infection = 0; eng.infectionRecoverT = 60; eng.msg('你仔细做了一遍消毒——皮肤下那点若有似无的异样感消退了。', 'loot') }
      else eng.msg('你仔细地做了一遍预防性消毒。目前没有感染疫疾。', 'loot')
      break
    }
    case 'sanity': p.sanity = Math.min(100, p.sanity + (def.value ?? 30)); applyThirst(def.value3); if (s.type === 'almond' && p.infection < 100) eng.infectionRecoverT = 60; break // v54：杏仁水/市政自来水解渴，腰果水加剧口渴；v55：杏仁水（未满一阶）给 60s「恢复」buff
    case 'sanityeat': { // v54：幸运豆奶——理智 +value、饥饿 +value2、口渴 +value3
      p.sanity = Math.min(100, p.sanity + (def.value ?? 40))
      p.hunger = Math.min(100, p.hunger + (def.value2 ?? 20))
      applyThirst(def.value3)
      if (p.infection < 100) eng.infectionRecoverT = 60 // v55：幸运豆奶（未满一阶）给 60s「恢复」buff
      break
    }
    case 'bigsanity': p.sanity = Math.min(100, p.sanity + (def.value ?? 60)); break
    case 'battery': p.battery = Math.min(100, p.battery + (def.value ?? 50)); break
    case 'stamina': p.coffeeT = 60; p.stamina = 100; applyThirst(def.value3); break // v54：咖啡解渴 +10
    case 'light': {
      if (eng.levelDef.noFlashlight) {
        eng.msg('你启动了它。开关有反馈，但没有任何光出现。', 'lore')
      } else if (eng.map) eng.map.lights.push({ x: p.x, y: p.y, r: 2.5, color: '#a8e0a0', flickerSeed: Math.random() * 100 })
      break
    }
  }
  audio.pickup()
  eng.emit({ kind: 'toast', text: `使用了 ${def.name}` })
  // v35：皇家口粮不是消耗品——使用不会吃掉它（仅「全部吃光」触发时才被消耗）；
  // v51：人制品效应拒食时不消耗
  if (s.type !== 'royalration' && !noConsume) eng.consumeItem(s.type)
}
// ---------- 粉笔头：在墙上画白色记号 ----------
/** 手持粉笔头右键：在面前墙上画记号（消耗 1 支；同一墙面不重复消耗） */
export function drawChalk(eng: Engine) {
  const p = eng.player, m = eng.map!
  const ox = m.inf ? m.inf.ox : 0, oy = m.inf ? m.inf.oy : 0
  // 沿朝向由近及远探测墙面
  for (const r of [0.8, 1.2, 1.6]) {
    const tx = Math.floor(p.x + Math.cos(p.facing) * r)
    const ty = Math.floor(p.y + Math.sin(p.facing) * r)
    if (tileAt(m, tx, ty) === 1) continue // 地板，继续往前探
    // 墙面朝向玩家的一侧（4 向：0=+x 1=-x 2=+y 3=-y）
    const dx = p.x - (tx + 0.5), dy = p.y - (ty + 0.5)
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 1) : (dy > 0 ? 2 : 3)
    const wx = ox + tx, wy = oy + ty
    if (eng.wallMarks.some((mk) => mk.level === p.level && mk.wx === wx && mk.wy === wy && mk.dir === dir)) {
      eng.msg('这面墙上已经有你的记号了。', 'system')
      return
    }
    eng.wallMarks.push({ level: p.level, wx, wy, dir })
    if (eng.wallMarks.length > 60) eng.wallMarks.shift() // 上限 60，丢弃最旧
    const slot = p.hotbar[p.selected]
    if (slot && slot.type === 'chalkstub' && --slot.count <= 0) p.hotbar[p.selected] = null
    audio.uiTick()
    eng.msg('你在墙上画下一道白色记号。', 'system')
    return
  }
  eng.msg('伸手可及的范围内没有墙——粉笔无处下笔。', 'system')
}

// v18：快捷使用当前持有物品（默认鼠标右键，同背包「使用」按钮效果）
// v23b/v26：主手持**装备类**物品（手电/打火机/手套/服饰/口袋类）按右键 = 直接装入对应装备位
// （占位则互换——v23b 曾实现后随仓库同步丢失，玩家反馈"没有实现"，此为断链修复）；
// 武器（撬棍/扳手/木板）本就握在主手，右键提示用法；其余物品 = 使用（吃/喝/治疗…）
export function quickUse(eng: Engine) {
  const p = eng.player
  const s = p.hotbar[p.selected]
  if (!s) return
  const def = ITEMS[s.type]
  if (def?.equip) {
    if (eng.equipItem('hotbar', p.selected)) audio.uiTick()
    return
  }
  if (s.type === 'chalkstub') { eng.drawChalk(); return }
  if (def?.throw) {
    eng.msg(`${def.name} 就握在你手里——左键把它掷出去。`, 'system')
    return
  }
  if (def?.weapon) {
    eng.msg(`${def.name} 就握在你手里——左键挥舞攻击（伤害 ${def.weapon}）。`, 'system')
    return
  }
  eng.useSlot('hotbar', p.selected)
}
// v20：快捷丢弃当前手持物品（默认 Q，整叠丢到脚下地面；空手无效）
export function quickDrop(eng: Engine) {
  const p = eng.player
  if (!p.hotbar[p.selected]) return
  eng.dropSlot('hotbar', p.selected)
  audio.uiTick()
}
// ---------- 槽位读写（背包格 + 装备位统一）----------
export function slotGet(eng: Engine, r: SlotRef): InvSlot | null {
  const p = eng.player
  if (r.w === 'hotbar') return p.hotbar[r.i] ?? null
  if (r.w === 'backpack') return p.backpack[r.i] ?? null
  if (r.w === 'pocket') return p.equip.pockets[r.i] ?? null
  return p.equip[r.w]
}
export function slotSet(eng: Engine, r: SlotRef, v: InvSlot | null) {
  const p = eng.player
  if (r.w === 'hotbar') p.hotbar[r.i] = v
  else if (r.w === 'backpack') p.backpack[r.i] = v
  else if (r.w === 'pocket') p.equip.pockets[r.i] = v
  else p.equip[r.w] = v
}
// 口袋中是否有指定物品（钥匙/门禁卡/护符类判定走口袋，不再全背包生效）
export function hasPocket(eng: Engine, type: string): boolean {
  return eng.player.equip.pockets.some((s) => s?.type === type)
}
export function dropSlot(eng: Engine, where: SlotWhere, i: number) {
  const p = eng.player
  const r = { w: where, i }
  const s = eng.slotGet(r)
  if (!s || !eng.map) return
  eng.map.items.push({ id: Math.random(), type: s.type, count: s.count, x: p.x + 0.3, y: p.y + 0.3 })
  eng.slotSet(r, null)
  eng.syncPassives()
  eng.msg(s.count > 1 ? `丢下了 ${itemName(s.type)} ×${s.count}` : `丢下了 ${itemName(s.type)}`, 'system')
}
// 卸下装备位物品到第一个空背包格（背包满则失败）
export function unequipSlot(eng: Engine, where: SlotWhere, i: number): boolean {
  const r = { w: where, i }
  const s = eng.slotGet(r)
  if (!s) return false
  const p = eng.player
  const freeHot = p.hotbar.findIndex((x) => !x)
  const freeBack = p.backpack.findIndex((x) => !x)
  if (freeHot < 0 && freeBack < 0) { eng.msg('背包已满，无法卸下。', 'system'); return false }
  eng.slotSet(r, null)
  if (freeHot >= 0) p.hotbar[freeHot] = s
  else p.backpack[freeBack] = s
  eng.syncPassives()
  eng.msg(`卸下了 ${itemName(s.type)}`, 'system')
  return true
}
// 一键装备：把背包/快捷栏物品放入对应装备位（占位则交换；口袋取第一个空位）
export function equipItem(eng: Engine, where: SlotWhere, i: number): boolean {
  if (where !== 'hotbar' && where !== 'backpack') return false
  const from = { w: where, i }
  const s = eng.slotGet(from)
  if (!s) return false
  const eq = ITEMS[s.type]?.equip
  if (!eq) { eng.msg(`${itemName(s.type)} 不是装备。`, 'system'); return false }
  if (eq === 'pocket') {
    // 口袋不允许重复道具（同类护符/钥匙只生效一件，堆叠没有意义）
    if (eng.player.equip.pockets.some((x) => x?.type === s.type)) {
      eng.msg(`口袋里已经有一件 ${itemName(s.type)} 了。`, 'system')
      return false
    }
    const free = eng.player.equip.pockets.findIndex((x) => !x)
    if (free < 0) { eng.msg('口袋栏已满。', 'system'); return false }
    return eng.moveSlot(from, { w: 'pocket', i: free })
  }
  return eng.moveSlot(from, { w: eq, i: 0 })
}
// 槽位交换（含装备位；装备位有类型限制，非法交换会被拒绝并提示）
export function moveSlot(eng: Engine, from: SlotRef, to: SlotRef): boolean {
  if (from.w === to.w && from.i === to.i) return false
  const fs = eng.slotGet(from)
  if (!fs) return false
  const ts = eng.slotGet(to)
  // v51：同类可堆叠物品拖到同一格——合并为一摞（合计不超过堆叠上限时优先于交换）
  if (ts && ts.type === fs.type && ts.tag === fs.tag) {
    const lim = ITEMS[fs.type]?.stack ?? 1
    if (lim > 1 && fs.count + ts.count <= lim) {
      if (to.w !== 'hotbar' && to.w !== 'backpack') return false // 装备位不合摞
      eng.slotSet(to, { ...ts, count: ts.count + fs.count })
      eng.slotSet(from, null)
      eng.syncPassives()
      return true
    }
  }
  const fits = (r: SlotRef, s: InvSlot | null): boolean => {
    if (!s) return true
    if (r.w === 'hotbar' || r.w === 'backpack') return true
    return ITEMS[s.type]?.equip === (r.w === 'pocket' ? 'pocket' : r.w)
  }
  if (!fits(to, fs) || !fits(from, ts)) {
    const name = to.w === 'offhand' ? '副手' : to.w === 'body' ? '身体' : to.w === 'gloves' ? '手套' : to.w === 'head' ? '头饰' : to.w === 'pocket' ? '口袋' : ''
    if (name) eng.msg(`${itemName(fs.type)} 不能放在【${name}】栏。`, 'system')
    return false
  }
  // 口袋不允许重复道具（拖拽换入同样校验）
  if (to.w === 'pocket' && eng.player.equip.pockets.some((x, xi) => xi !== to.i && x?.type === fs.type)) {
    eng.msg(`口袋里已经有一件 ${itemName(fs.type)} 了。`, 'system')
    return false
  }
  eng.slotSet(from, ts)
  eng.slotSet(to, fs)
  if (to.w === 'offhand' && fs.type === 'flashlight') eng.player.flashlight = true // 装备手电筒即点亮
  if (to.w === 'head' && fs.type === 'headlamp') eng.player.flashlight = true // v32：装备头灯即点亮
  eng.syncPassives()
  return true
}
export function syncPassives(eng: Engine) {
  const p = eng.player
  p.hasGloves = p.equip.gloves?.type === 'gloves'
  p.hasSuit = p.equip.body?.type === 'suit'
  p.hasLighter = p.equip.offhand?.type === 'lighter'
  p.hasRabbit = p.equip.pockets.some((s) => s?.type === 'rabbit')
  // v23 Object 51「Pockets」：背包上限 +4（取下时只收回空出来的格子，不会吞物品）
  p.hasPockets = p.equip.pockets.some((s) => s?.type === 'pockets')
  const wantBag = 16 + (p.hasPockets ? 4 : 0)
  while (p.backpack.length < wantBag) p.backpack.push(null)
  while (p.backpack.length > wantBag && !p.backpack[p.backpack.length - 1]) p.backpack.pop()
  // 照明=副手手电筒 / 头饰头灯：两者皆无则强制关灯（装备/拾取时由对应路径点亮）
  if (p.equip.offhand?.type !== 'flashlight' && p.equip.head?.type !== 'headlamp') p.flashlight = false
}
