// v53：交互（scanInteract/doInteract/容器搜索/战利品面板/结构触发伤害/配电箱嗡鸣）——
// 自 engine.ts 拆分，逻辑逐语句搬运；triggerStructs 返回 true 表示本帧已死亡（原 step 的 return）。
import { bandOfZ, groundHeightAt, FLOOR_H } from '../world/mapgen'
import { canOccupy, PLAYER_RADIUS } from '../core/player'
import { CONTAINERS, CONTAINER_RARE } from '../decorations/containers'
import { DECOR_VIEWS, GRAFFITI_LORE, GRAFFITI_LORE_KIND, BRAILLE_MARKS, GLASSWIN_TEXT } from '../decorations/lore'
import { L3_NOTE_IDS } from '../content/docs'
import { itemName } from '../content/items'
import { WIN_TAPES, NORMAL_LEVELS, levelDefOf } from '../levels'
import { audio } from '../core/audio'
import type { Structure } from '../core/types'
import type { NpcState } from '../content/npcs'
import type { Engine } from '../engine'

type DiffMult = { dmg: number; drain: number }

// ---- v51：L3 配电箱电流嗡鸣（定位音频惯例：按最近配电箱距离逐帧调音量）----
// （原 step 内联段，逐语句搬运）
export function updateElecHum(eng: Engine) {
  const p = eng.player, m = eng.map!
  // ---- v51：L3 配电箱电流嗡鸣（定位音频惯例：按最近配电箱距离逐帧调音量）----
  if (eng.levelDef.id === 3) {
    let dh = 1e9
    for (const s of m.structures) {
      if (s.kind !== 'elecbox') continue
      const dd = Math.hypot(s.x + 0.5 - p.x, s.y + 0.5 - p.y)
      if (dd < dh) dh = dd
    }
    audio.setElecHum(dh < 9 ? 1 - dh / 9 : 0)
  } else audio.setElecHum(0)
  // ---- v55：L5 留声机诡异古典乐（按最近播放中留声机距离逐帧调音量；E 停播的[data.on=0]不计；
  //      近场淡入留声机并闪避 BGM，远场恢复——audio.setPhono 内处理）----
  if (eng.levelDef.id === 5) {
    let dp = 1e9
    for (const s of m.structures) {
      if (s.kind !== 'phonograph' || s.data?.on === 0) continue
      const dd = Math.hypot(s.x + 0.5 - p.x, s.y + 0.5 - p.y)
      if (dd < dp) dp = dd
    }
    audio.setPhono(dp < 10 ? 1 - dp / 10 : 0)
  } else audio.setPhono(0)
}

/** 容器搜索进度 + 战利品面板自动关闭（原 step 内联段，逐语句搬运） */
export function updateContainerSearch(eng: Engine, dt: number) {
  const p = eng.player, m = eng.map!
  // ---- 容器搜索进度 ----
  if (eng.searching) {
    const s = eng.searching
    const st = m.structures.find((x) => x.data?.sid === s.sid)
    const near = st && Math.hypot(st.x + st.w / 2 - p.x, st.y + st.h / 2 - p.y) < 2.4
    if (!st || !near || st.looted) {
      eng.searching = null // 离开或已空，取消
    } else {
      s.t += dt
      if (Math.random() < dt * 5) audio.searchTick()
      if (s.t >= s.dur) {
        eng.searching = null
        eng.finishSearch(st)
      }
    }
  }

  // ---- 战利品面板：离开交互半径自动关闭（未拿取物品留在容器内，可再次搜索）----
  if (eng.lootPanel) {
    const lp = eng.lootPanel
    const st = m.structures.find((x) => x.data?.sid === lp.sid)
    if (!st || Math.hypot(st.x + st.w / 2 - p.x, st.y + st.h / 2 - p.y) > 2.5) {
      eng.closeLootPanel()
    }
  }
}

/** 未涂黑窗户陷阱 / 锈蚀钢筋 / 蒸汽阀门伤害（原 step 内联段；true=本帧已死亡） */
export function triggerStructs(eng: Engine, dt: number, dm: DiffMult): boolean {
  const p = eng.player, m = eng.map!
  // 未涂黑窗户陷阱（wiki L4：未涂黑的窗户必须避开）——靠近即触发一次
  for (const s of m.structures) {
    if (s.kind !== 'windowtrap' || s.data?.triggered) continue
    const d = Math.hypot(s.x + 0.5 - p.x, s.y + 0.5 - p.y)
    if (d < 1.9) {
      s.data = { ...s.data, triggered: 1 }
      p.sanity = Math.max(0, p.sanity - 14)
      eng.emit({ kind: 'sanityhit' })
      eng.camShake = Math.min(1, eng.camShake + 0.4)
      eng.msg('玻璃后面贴着一张脸——它不是你的倒影！你踉跄后退。（理智-14）', 'damage')
      audio.aggro()
      eng.noiseEvent(p.x, p.y, 12, true) // 响动引来实体
    }
  }

  // 锈蚀钢筋（L1：突出墙壁的生锈金属尖端——wikidot/Fandom：刺伤可致破伤风；一次性划伤）
  for (const s of m.structures) {
    if (s.kind !== 'rebar' || s.data?.triggered) continue
    if (Math.hypot(s.x + 0.5 - p.x, s.y + 0.5 - p.y) < 0.9) {
      s.data = { ...s.data, triggered: 1 }
      eng.hurtPlayer(4, '锈蚀钢筋')
    }
  }

  // 蒸汽阀门伤害
  for (const s of m.structures) {
    if (s.kind === 'valve' && s.data?.on) {
      const d = Math.hypot(s.x + 0.5 - p.x, s.y + 0.5 - p.y)
      if (d < 1.6 && !p.hasGloves) {
        p.hp -= 8 * dt * dm.dmg
        if (Math.random() < dt * 2) eng.steamParticles(s.x + 0.5, s.y + 0.5)
        if (p.hp <= 0) { eng.die('被蒸汽烫死了'); return true }
      }
      if (Math.random() < dt * 3) eng.steamParticles(s.x + 0.5, s.y + 0.5)
    }
  }
  return false
}
// 交互判定：3D 距离 + 视线角 + LOS（不依赖瓦片对齐）
export function inView(eng: Engine, x: number, y: number, radius: number): boolean {
  const p = eng.player
  const dx = x - p.x, dy = y - p.y
  const d = Math.hypot(dx, dy)
  if (d > radius) return false
  // 贴身目标无视线角要求
  if (d < 0.9) return true
  const ang = Math.atan2(dy, dx)
  let diff = Math.abs(ang - p.facing)
  if (diff > Math.PI) diff = Math.PI * 2 - diff
  if (diff > 1.5) return false // ~86° 半锥，宽容
  // 目标点向玩家回拉，避免实心容器/结构自身遮挡 LOS
  const pull = Math.min(0.65, d * 0.5)
  const tx = x - (dx / d) * pull, ty = y - (dy / d) * pull
  return eng.los(p.x, p.y, tx, ty)
}

// 目标与视线朝向的角差（弧度；贴身目标视为 0）——v12 统一目标选择的主排序键
export function viewAngle(eng: Engine, x: number, y: number): number {
  const p = eng.player
  const dx = x - p.x, dy = y - p.y
  if (Math.hypot(dx, dy) < 0.9) return 0
  const ang = Math.atan2(dy, dx)
  let diff = Math.abs(ang - p.facing)
  if (diff > Math.PI) diff = Math.PI * 2 - diff
  return diff
}
// v12：统一可交互目标选择（HUD 提示与 interact() 执行共用本函数结果）。
// 优先级：视线角最小（正对）> 距离最近 > 同角同距时可执行优先于不可执行
// （如上锁但无撬棍/万能钥匙的房门、无车钥匙的后备箱）。
export function scanInteract(eng: Engine) {
  const p = eng.player, m = eng.map!
  eng.interactTarget = null
  const band = bandOfZ(p.z)
  // 出口（进入判定仍用近距离，不挡拾取；v13：出口都在主层，上层不触发）
  if (band === 0) for (const e of m.exits) {
    if (e.def.kind === 'graystairs' || e.def.kind === 'graystairsup' || e.def.kind === 'oldstairs') continue // v29/v54：可行走阶梯——直接走上去/走下去，无 E 交互
    if (Math.hypot(e.x + 0.5 - p.x, e.y + 0.5 - p.y) < 1.6) {
      e.discovered = true
      eng.interactTarget = { kind: 'exit', label: `进入 ${e.def.name}`, e }
      return
    }
  }
  // 地面物品（同一优先级：视线角 > 距离，半径 2.0m；v13：按物品所在高度过滤楼层）
  {
    let bi: (typeof m.items)[0] | null = null, ba = 1e9, bd = 1e9
    for (const it of m.items) {
      const d = Math.hypot(it.x - p.x, it.y - p.y)
      if (d >= 2.0 || !eng.inView(it.x, it.y, 2.0)) continue
      const iz = it.z ?? groundHeightAt(m, it.x, it.y)
      if (Math.abs(iz - p.z) > 1.4) continue
      const a = eng.viewAngle(it.x, it.y)
      if (a < ba - 1e-6 || (Math.abs(a - ba) <= 1e-6 && d < bd - 1e-6)) { ba = a; bd = d; bi = it }
    }
    if (bi) { eng.interactTarget = { kind: 'item', label: bi.type === 'welcomenote' ? `查看 ${itemName(bi.type)}` : `拾取 ${itemName(bi.type)}`, it: bi }; return }
  }
  // 结构（半径 2.2m，含容器）
  let best: { kind: string; label: string; s: Structure; a: number; d: number; can: boolean } | null = null
  const consider = (kind: string, label: string, s: Structure, d: number, can: boolean) => {
    const a = eng.viewAngle(s.x + s.w / 2, s.y + s.h / 2)
    if (!best || a < best.a - 1e-6
      || (Math.abs(a - best.a) <= 1e-6 && d < best.d - 1e-6)
      || (Math.abs(a - best.a) <= 1e-6 && Math.abs(d - best.d) <= 1e-6 && can && !best.can)) {
      best = { kind, label, s, a, d, can }
    }
  }
  for (const s of m.structures) {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2
    const d = Math.hypot(cx - p.x, cy - p.y)
    const maxD = CONTAINERS[s.kind] ? 2.7 : 2.2 // v51：容器交互距离放宽（十字锥选取保留，不再要贴着才能搜）
    if (d > maxD || !eng.inView(cx, cy, maxD)) continue
    // v13：结构按楼层过滤（楼上楼下同名容器互不干扰）；lift 跨层服务
    if (s.kind !== 'lift' && (s.floor ?? 0) !== band) continue
    if (s.kind === 'lift') { consider('lift', band === 0 ? '乘电梯 上楼' : '乘电梯 下楼', s, d, !eng.ride); continue }
    // v18：已搜空容器仍可选中（交互时提示「容器是空的」），未搜空的正常提示
    // v23：全部容器走统一表（含新增的储物柜/工具箱/行李箱/冰箱/保险箱/信箱/木桶/书柜/骨堆/营地摊位）
    if (CONTAINERS[s.kind]) {
      // v51：容器要求准星近似对准（~26° 半锥）——86° 宽容锥下余光里的容器会抢占交互位，
      // 挡住玩家正对其他目标的交互；对准才可选中，不对准时完全不影响其他交互
      if (eng.viewAngle(cx, cy) > 0.45) continue
      const C = CONTAINERS[s.kind]
      const gate = !C.gate || (C.gate === 'carkey' ? eng.hasPocket('carkey') : eng.hasItem('crowbar'))
      const gateText = C.gate === 'carkey' ? '（需要车钥匙）' : '（需要撬棍）'
      const label = s.looted ? `${C.label}（空）`
        : !gate ? `${C.label}${gateText}`
        : s.data?.searched ? `查看 ${C.label}（剩余物品）`
        : `搜索 ${C.label}`
      consider(s.kind, label, s, d, s.looted ? true : gate)
    }
    else if (s.kind === 'lightswitch') consider('lightswitch', s.data?.flipped ? '电灯开关（已经拨过了）' : '拨动 电灯开关', s, d, true)
    else if (s.kind === 'roadsign' || s.kind === 'megsign') consider('roadsign', DECOR_VIEWS.roadsign.label, s, d, true)
    else if (s.kind === 'braille') consider('braille', DECOR_VIEWS.braille.label, s, d, true)
    else if (s.kind === 'arcadecab') consider('arcadecab', '投币 街机', s, d, true)
    else if (s.kind === 'endletters') consider('endletters', DECOR_VIEWS.endletters.label, s, d, true)
    else if (s.kind === 'clipfuse') consider('clipfuse', DECOR_VIEWS.clipfuse.label, s, d, true)
    else if (s.kind === 'handspike') consider('handspike', DECOR_VIEWS.handspike.label, s, d, true)
    else if (s.kind === 'hoteldoor') {
      if (s.data?.sealed) consider('hoteldoor', '锁死的门（锁的结构闻所未闻）', s, d, true) // v41：L2 特殊锁死门——任何方式都打不开
      else if (s.data?.locked) {
        const canAxe = eng.hasItem('axe') && eng.axeDur > 0
        const can = eng.hasItem('crowbar') || eng.hasPocket('skeleton') || canAxe
        const label = canAxe ? `劈开 上锁的房门（斧头耐久 ${eng.axeDur}/5）`
          : can ? '撬开 上锁的房门' : '上锁的房门（需要撬棍/万能钥匙/斧头）'
        consider('hoteldoor', label, s, d, can)
      } else consider('hoteldoor', s.data?.open ? '关上 房门' : '打开 房门', s, d, true)
    }
    else if (s.kind === 'rollerdoor') {
      if (s.data?.locked) consider('rollerdoor', '卷帘门锁死了', s, d, false)
      else consider('rollerdoor', s.data?.open ? '放下 卷帘门' : '升起 卷帘门', s, d, true)
    }
    else if (s.kind === 'glassdoor') consider('glassdoor', s.data?.open ? '关上 玻璃门' : '推开 玻璃门', s, d, true)
    else if (s.kind === 'inkdoor') consider('inkdoor', s.data?.open ? '关上 墨黑色金属门' : '打开 墨黑色金属门', s, d, true)
    else if (s.kind === 'bargate') consider('bargate', s.data?.open ? '关上 栅栏门' : '打开 栅栏门', s, d, true)
    else if (s.kind === 'glasswin') consider('glasswin', DECOR_VIEWS.glasswin.label, s, d, true)
    else if (s.kind === 'windowtrap') consider('windowtrap', s.data?.triggered ? '查看 窗户（已无异常）' : '查看 未涂黑的窗户', s, d, true)
    else if (s.kind === 'windowblack') consider('windowblack', DECOR_VIEWS.windowblack.label, s, d, true)
    else if (s.kind === 'graffiti') consider('graffiti', DECOR_VIEWS.graffiti.label, s, d, true)
    else if (s.kind === 'statue') consider('statue', DECOR_VIEWS.statue.label, s, d, true)
    else if (s.kind === 'bigpainting') consider('bigpainting', DECOR_VIEWS.bigpainting.label, s, d, true) // v53b：L3 大幅画作
    else if (s.kind === 'megdoc') consider('megdoc', '阅读 M.E.G. 文档', s, d, true)
    else if (s.kind === 'landmark') consider('landmark', '查看 定居点地标', s, d, true)
    else if (s.kind === 'invitation') consider('landmark', '阅读 烫金邀请函', s, d, true) // v55b：邀请函=地标式可交互装饰（弹地标卡前往原住民）
    else if (s.kind === 'valve') consider('valve', s.data?.on ? '关闭 蒸汽阀门' : '打开 蒸汽阀门', s, d, true)
    else if (s.kind === 'phonograph') consider('phonograph', s.data?.on === 0 ? '摇起 留声机（恢复播放）' : '停下 留声机', s, d, true) // v55：L5 留声机启停
    else if (s.kind === 'table' && eng.levelDef.id === 5 && s.data?.drink === 1 && s.data?.searched !== 1) consider('drinktable', '拿取 桌上的饮料', s, d, true) // v55：L5 休息室桌上饮料
    else if (s.kind === 'booth' && !eng.player.leverPulled) consider('lever', '扳动 电源拉杆', s, d, true)
    else if (s.kind === 'server' && s.locked) consider('server', '刷门禁卡 进入', s, d, eng.hasPocket('keycard'))
    else if (s.kind === 'vending') consider('vending', '使用 自动售货机', s, d, true)
    else if (s.kind === 'frontdesk') consider('frontdesk', '与前台交易', s, d, true)
  }
  //（闭包内赋值 TS 无法跟踪，显式还原声明类型）
  const picked = best as { kind: string; label: string; s: Structure } | null
  eng.interactTarget = picked ? { kind: picked.kind, label: picked.label, s: picked.s } : null
  // v35：NPC 交谈（据点；优先级最低——出口/物品/结构都未选中时才考虑）
  if (!eng.interactTarget) {
    let bn: NpcState | null = null, ba = 1e9, bd = 1e9
    for (const n of eng.npcs) {
      if (n.dead || n.hostile) continue // v39：尸体与敌对员工不可交谈
      if ((n.floor ?? 0) !== bandOfZ(p.z)) continue // v46：隔层不可交谈（夹楼 NPC 须上到 2F）
      const d = Math.hypot(n.x - p.x, n.y - p.y)
      if (d > 2.2 || !eng.inView(n.x, n.y, 2.2)) continue
      const a = eng.viewAngle(n.x, n.y)
      if (a < ba - 1e-6 || (Math.abs(a - ba) <= 1e-6 && d < bd)) { ba = a; bd = d; bn = n }
    }
    if (bn) eng.interactTarget = { kind: 'npc', label: `与 ${bn.def.name} 交谈`, npc: bn }
  }
  // v45：实体「杰瑞」——接触杰瑞（与 NPC 同级最低优先级；驯服提示随状态变化；v47：冷却剩余在提示中显示）
  if (!eng.interactTarget) {
    for (const e of m.entities) {
      if (e.dead || e.def.type !== 'jerry') continue
      const d = Math.hypot(e.x - p.x, e.y - p.y)
      if (d > 2.2 || !eng.inView(e.x, e.y, 2.2)) continue
      eng.interactTarget = {
        kind: 'jerry',
        label: eng.jerryContactCd > 0
          ? `接触 鹉主杰瑞（冷却 ${Math.ceil(eng.jerryContactCd)}s）`
          : eng.jerryTamed ? '接触 鹉主杰瑞（已驯服）' : '接触 鹉主杰瑞（教化 +25 · 对其使用杏仁水可驯服）',
        ent: e,
      }
      break
    }
  }
  // v51：人制品售货机（Entity 36）——正面取货 / 背面看标语（与杰瑞同级最低优先级）
  if (!eng.interactTarget) {
    for (const e of m.entities) {
      if (e.dead || e.def.type !== 'vendingmachine' || e.activated) continue
      const d = Math.hypot(e.x - p.x, e.y - p.y)
      if (d > 2.2 || !eng.inView(e.x, e.y, 2.2)) continue
      // 正/背面：玩家在机器朝向的一侧为正面
      const behind = Math.cos(e.facing) * (p.x - e.x) + Math.sin(e.facing) * (p.y - e.y) < 0
      eng.interactTarget = {
        kind: 'vendingmachine',
        label: behind ? '查看 人制品售货机（背面）' : '取出 人制品',
        ent: e, vmBack: behind,
      }
      break
    }
  }
}
export function doInteract(eng: Engine) {
  const t = eng.interactTarget
  if (!t || !eng.map) return
  const p = eng.player, m = eng.map
  switch (t.kind) {
    case 'exit': {
      // v12：执行 scanInteract 选中的同一出口（距离兜底校验）
      const e = t.e && Math.hypot(t.e.x + 0.5 - p.x, t.e.y + 0.5 - p.y) < 1.6 ? t.e
        : m.exits.find((x) => Math.hypot(x.x + 0.5 - p.x, x.y + 0.5 - p.y) < 1.6)
      if (e) eng.takeExit(e.def)
      break
    }
    case 'item': {
      // v12：拾取 scanInteract 选中的同一物品（仍在地上才有效）
      const bi = t.it && m.items.includes(t.it) ? t.it : null
      if (bi) {
        if (bi.fake) { m.items = m.items.filter((i) => i !== bi); if (m.inf) m.inf.taken.add(bi.id); return }
        // v34：致新流浪者的纸条——查看即收录图鉴「文档」（不入背包，归宿是文档存档）
        if (bi.type === 'welcomenote') {
          m.items = m.items.filter((i) => i !== bi)
          if (m.inf) m.inf.taken.add(bi.id)
          audio.pickup()
          eng.emit({ kind: 'doc', text: 'welcome_note' })
          eng.msg('纸条已存档到图鉴 ·「文档」。', 'system')
          break
        }
        // 手电筒：副手空着时拾取即自动装备（开局引导）
        if (bi.type === 'flashlight' && !p.equip.offhand) {
          m.items = m.items.filter((i) => i !== bi)
          if (m.inf) m.inf.taken.add(bi.id)
          p.equip.offhand = { type: 'flashlight', count: 1 }
          p.flashlight = true
          eng.syncPassives()
          audio.pickup()
          eng.msg('拾取 手电筒——已自动装到【副手】。', 'loot')
          eng.emit({ kind: 'toast', text: '+1 手电筒（副手）' })
          break
        }
        const n = bi.count ?? 1 // 整叠丢弃的地面物品带堆叠数量
        let got = 0
        for (let k = 0; k < n; k++) if (eng.addItem(bi.type)) got++
        if (got > 0) {
          if (got >= n) {
            m.items = m.items.filter((i) => i !== bi)
            if (m.inf) m.inf.taken.add(bi.id) // v17：防止窗口重载后物品复活
          } else {
            bi.count = n - got // 背包装不下：剩余的留在原地
            eng.msg(`背包已满，${n - got} 个 ${itemName(bi.type)} 留在地上。`, 'system')
          }
          audio.pickup(bi.type === 'tape')
          if (bi.type === 'tape') { p.tapes += got; eng.msg(`拾取 磁带（${p.tapes}/${WIN_TAPES}）`, 'lore') }
          eng.emit({ kind: 'toast', text: `+${got} ${itemName(bi.type)}` })
        } else eng.msg('背包已满。', 'system')
      }
      break
    }
    case 'crate': case 'corpse': case 'car': case 'cabinet': case 'dresser': case 'megcrate':
    case 'locker': case 'toolbox': case 'suitcase': case 'fridge': case 'safebox':
    case 'mailbox': case 'barrel': case 'bookcase': case 'bonepile': case 'campstall':
    case 'elecbox': { // v51：L3 配电箱（统一容器表成员，漏登记会导致显示可交互但按键无响应）
      const kind = t.kind
      // v12：搜索 scanInteract 选中的同一容器（不再是数组序第一个同类容器）
      // v51：容器交互距离 2.8（与 scanInteract 的 2.7 选取门限对齐，不再脱节）
      const s = t.s && t.s.kind === kind && Math.hypot(t.s.x + t.s.w / 2 - p.x, t.s.y + t.s.h / 2 - p.y) < 2.8 ? t.s : null
      if (!s) return
      // v18：空容器直接提示（不出面板、不出进度条）
      const leftover = s.data?.lootItems as string[] | undefined
      if (s.looted || (s.data?.searched && (!leftover || leftover.length === 0))) {
        s.looted = true
        eng.msg('容器是空的。', 'system')
        return
      }
      if (!s.data?.sid) s.data = { ...s.data, sid: Math.floor(Math.random() * 1e9) }
      const C = CONTAINERS[kind] ?? CONTAINERS.crate
      const label = C.label
      // v18：已搜索过且仍有剩余物品 → 免进度条，直接打开面板显示之前没拿完的物品
      if (s.data?.searched && leftover && leftover.length > 0) {
        eng.lootPanel = { sid: s.data.sid as number, label, items: leftover }
        audio.searchDone()
        eng.emit({ kind: 'lootpanel' })
        return
      }
      if (C.gate === 'carkey' && !eng.hasPocket('carkey')) { eng.msg('后备箱锁着，需要车钥匙（放在口袋栏生效）。', 'system'); return }
      if (C.gate === 'crowbar' && !eng.hasItem('crowbar')) { eng.msg('转盘锁纹丝不动。得用撬棍撬铰链。', 'system'); return }
      if (kind === 'crate' && !eng.hasItem('crowbar') && Math.random() < 0.5) { eng.msg('箱子钉死了，也许需要撬棍。', 'system'); return }
      // v18：首次搜索——内容物在搜索发起时生成并持久（即使中断重搜也不刷新）
      if (!Array.isArray(s.data?.lootItems)) s.data = { ...s.data, lootItems: eng.rollLoot(kind) }
      eng.searching = { sid: s.data.sid as number, t: 0, dur: C.dur, label }
      audio.searchStart()
      eng.noiseEvent(p.x, p.y, 6, false) // 翻找容器的声音会被听见（肢团）
      break
    }
    // ============ v23：新层级的可交互物 ============
    case 'lightswitch': {
      // Wikidot Level 6「世界最安静的房间」：那个人声称找到了电灯开关，会不断恳求来访者去拨动它。
      // 官方警告只有一句：不要拨。
      const s = t.s
      if (!s) return
      if (s.data?.flipped) { eng.msg('开关已经在另一侧了。什么也没有发生过。', 'system'); return }
      s.data = { ...s.data, flipped: 1 }
      audio.uiTick()
      eng.msg('你拨动了开关。', 'system')
      eng.msg('……什么都没有亮起来。但走廊里所有的声音，在这一瞬间同时停了。', 'damage')
      p.sanity = Math.max(0, p.sanity - 22)
      eng.emit({ kind: 'sanityhit' })
      // 拨开关会把本层所有「模仿者」引到你这里——它们一直在等有人拨它
      for (const e of m.entities) if (!e.dead && e.def.type === 'mimicry') { e.state = 'chase'; e.targetX = p.x; e.targetY = p.y }
      audio.aggro()
      break
    }
    case 'roadsign': {
      const ex = eng.nearestExit()
      const R = DECOR_VIEWS.roadsign.msgs!
      eng.msg(R[0].text, R[0].type)
      if (ex) { for (const e2 of m.exits) e2.discovered = true; eng.msg(R[1].text, R[1].type) }
      audio.uiTick()
      break
    }
    case 'braille': {
      eng.msg(`指尖摸到一行刻痕：${BRAILLE_MARKS[Math.floor(Math.random() * BRAILLE_MARKS.length)]}`, 'lore')
      p.sanity = Math.min(100, p.sanity + DECOR_VIEWS.braille.sanity)
      audio.uiTick()
      break
    }
    case 'arcadecab': {
      // Wikidot Level 11：位置不合常理的街机柜——任何交互都会把你送去 Level 25
      eng.msg('屏幕亮了。它没有投币口，但它开始运行了。', 'lore')
      const ad = Math.floor(Math.random() * NORMAL_LEVELS)
      eng.transition = { anim: 'glitch', t: 0, dest: ad }
      eng.emit({ kind: 'transition', anim: 'glitch', cutIn: levelDefOf(ad)?.entryAnim, dest: ad })
      break
    }
    case 'endletters': {
      for (const dm of DECOR_VIEWS.endletters.msgs!) eng.msg(dm.text, dm.type)
      p.sanity = Math.max(0, p.sanity + DECOR_VIEWS.endletters.sanity)
      break
    }
    case 'clipfuse': {
      for (const dm of DECOR_VIEWS.clipfuse.msgs!) eng.msg(dm.text, dm.type)
      p.sanity = Math.max(0, p.sanity + DECOR_VIEWS.clipfuse.sanity)
      eng.emit({ kind: 'sanityhit' })
      break
    }
    case 'statue': {
      // v51：L3 铁栅栏后的风化希腊女像（纯氛围查看，同 clipfuse/endletters 惯例）
      for (const dm of DECOR_VIEWS.statue.msgs!) eng.msg(dm.text, dm.type)
      p.sanity = Math.max(0, p.sanity + DECOR_VIEWS.statue.sanity)
      eng.emit({ kind: 'sanityhit' })
      break
    }
    case 'bigpainting': {
      // v53b：L3 大幅画作——先播报画作描述（按 data.tex），再随机展开一页笔记残页
      // （wikidot L3 多页笔记纸转录，志莽行手书风格文档；见 content/docs.ts L3_NOTES）
      // v55：按层级区分——L5 古典肖像/风景画只播报画作描述（不给 L3 笔记残页文档）
      const s = t.s && t.s.kind === 'bigpainting' ? t.s : null
      const tex = s?.data?.tex as string | undefined
      if (eng.levelDef.id === 5) {
        eng.msg(
          tex === 'l5_portrait1.png'
            ? '古典肖像：黑礼服贵族侧身而立，白领巾一丝不苟。他的眼睛像是在跟着你走。'
            : tex === 'l5_portrait2.png'
              ? '古典夫妇像：长裙贵妇与礼帽绅士并肩——两人的嘴角都被岁月磨平了，看不出是不是在笑。'
              : tex === 'l5_portrait3.png'
                ? '骑马像：骑手挺直腰背，马的眼神温顺。画的右下角没有签名，只有一道指甲划过的痕。'
                : '一幅风景油画：暗色的山峦与水面，笔触殷勤得近乎固执。',
          'lore',
        )
        p.sanity = Math.max(0, p.sanity + DECOR_VIEWS.bigpainting.sanity)
        eng.emit({ kind: 'sanityhit' })
        audio.uiTick()
        break
      }
      eng.msg(
        tex === 'l3_art_skeleton.png'
          ? '大幅画布上是一幅带翅膀的骷髅——它侧坐在桌案旁，烛火尚未燃尽。'
          : tex === 'l3_art_sketch.png'
            ? '整块白画布被狂乱的炭线涂满，夹着写不成句的字迹。'
            : '大幅画布上是一尊吹着长号的天使立像——它的脸被人用力涂抹掉了，像出于愤怒。',
        'lore',
      )
      p.sanity = Math.max(0, p.sanity + DECOR_VIEWS.bigpainting.sanity)
      eng.emit({ kind: 'sanityhit' })
      eng.msg('画框下缘钉着一页笔记，字迹疯狂而颤抖——', 'lore')
      eng.emit({ kind: 'doc', text: L3_NOTE_IDS[Math.floor(Math.random() * L3_NOTE_IDS.length)] })
      audio.uiTick()
      break
    }
    case 'handspike': {
      for (const dm of DECOR_VIEWS.handspike.msgs!) eng.msg(dm.text, dm.type)
      p.sanity = Math.max(0, p.sanity + DECOR_VIEWS.handspike.sanity)
      break
    }
    case 'hoteldoor': {
      // v12：开/关/撬 scanInteract 选中的同一扇门（根因修复：旧版按数组序找第一扇门，
      // 上锁门与普通门相邻时提示「打开 房门」却触发上锁门）
      const s = t.s && t.s.kind === 'hoteldoor' && Math.hypot(t.s.x + 0.5 - p.x, t.s.y + 0.5 - p.y) < 2.6 ? t.s : null
      if (!s) return
      if (s.data?.sealed) {
        // v41：L2 特殊锁死门——撬棍/万能钥匙/斧头全部无效（锁的结构闻所未闻）
        eng.msg('这扇门纹丝不动，锁的结构闻所未闻。', 'system')
        audio.uiTick()
        return
      }
      if (s.data?.locked) {
        if (eng.hasItem('axe') && eng.axeDur > 0) {
          // v32：斧头破门——消耗 1 点耐久（共 5 点，耗尽斧头报废）
          eng.axeDur--
          s.data = { ...s.data, locked: 0, open: 1 }
          s.solid = false
          audio.hit()
          eng.noiseEvent(p.x, p.y, 16, true) // 破门巨响引来实体
          if (eng.axeDur <= 0) {
            eng.consumeItem('axe')
            eng.axeDur = eng.hasItem('axe') ? 5 : 0
            eng.msg('你一斧劈开了门锁——斧刃崩断，斧头报废了！', 'damage')
          } else {
            eng.msg(`你一斧劈开了门锁！（斧头耐久剩余 ${eng.axeDur}）`, 'system')
          }
        } else if (eng.hasPocket('skeleton')) {
          s.data = { ...s.data, locked: 0, open: 1 }
          s.solid = false
          eng.msg('黄铜万能钥匙转了一圈——锁开了。', 'loot')
          audio.pickup()
        } else if (eng.hasItem('crowbar')) {
          s.data = { ...s.data, locked: 0, open: 1 }
          s.solid = false
          eng.msg('你用撬棍猛地撬开了门锁，巨响在走廊里回荡。', 'system')
          audio.hit()
          eng.noiseEvent(p.x, p.y, 14, true) // 撬锁巨响引来实体
        } else {
          eng.msg('门锁死了。需要撬棍撬开，或一把万能钥匙。', 'system')
        }
        return
      }
      const open = s.data?.open ? 0 : 1
      s.data = { ...s.data, open }
      s.solid = !open
      if (!open) {
        // v41：关门时玩家站在门洞——把玩家推到最近的可走一侧（否则嵌进实心门体卡死）
        const m = eng.map!
        const r = PLAYER_RADIUS
        if (p.x > s.x - r && p.x < s.x + s.w + r && p.y > s.y - r && p.y < s.y + s.h + r) {
          const f = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[y * m.w + x] === 1
          const ax = Math.floor(s.x + s.w / 2), ay = Math.floor(s.y + s.h / 2)
          const alongY = !f(ax - 1, ay) && !f(ax + 1, ay) // 门两侧是墙 ⇒ 通行沿 y 轴
          const cand = alongY
            ? [{ x: p.x, y: s.y - r - 0.12 }, { x: p.x, y: s.y + s.h + r + 0.12 }]
            : [{ x: s.x - r - 0.12, y: p.y }, { x: s.x + s.w + r + 0.12, y: p.y }]
          const ok = (c: { x: number; y: number }) => canOccupy(m, c.x, c.y, r, { z: p.z, crouch: p.crouching })
          const d0 = Math.hypot(cand[0].x - p.x, cand[0].y - p.y)
          const d1 = Math.hypot(cand[1].x - p.x, cand[1].y - p.y)
          const [near, far] = d0 <= d1 ? [cand[0], cand[1]] : [cand[1], cand[0]]
          if (ok(near)) { p.x = near.x; p.y = near.y }
          else if (ok(far)) { p.x = far.x; p.y = far.y }
        }
      }
      eng.msg(open ? '门吱呀一声开了。' : '你轻轻带上了门。', 'system')
      audio.uiTick()
      break
    }
    case 'lift': {
      // v13：电梯——交互后轿厢垂直送达另一层（脚本化乘降，期间锁定移动）
      const s = t.s && t.s.kind === 'lift' && Math.hypot(t.s.x + 0.5 - p.x, t.s.y + 0.5 - p.y) < 2.6 ? t.s : null
      if (!s || eng.ride) return
      const from = bandOfZ(p.z) === 1 ? FLOOR_H : 0
      const to = from === 0 ? FLOOR_H : 0
      p.x = s.x + 0.5; p.y = s.y + 0.5 // 走进轿厢
      eng.ride = { sx: p.x, sy: p.y, from, to, t: 0 }
      audio.uiTick()
      eng.msg(to > 0 ? '电梯抖动了一下，缓缓上升……' : '电梯抖动了一下，缓缓下降……', 'system')
      break
    }
    case 'rollerdoor': case 'glassdoor': {
      const s = t.s && t.s.kind === t.kind && Math.hypot(t.s.x + 0.5 - p.x, t.s.y + 0.5 - p.y) < 2.6 ? t.s : null
      if (!s) return
      if (t.kind === 'rollerdoor' && s.data?.locked) {
        eng.msg('卷帘门锁死了，纹丝不动。门缝里黑漆漆的，看不清里面堆了什么。', 'system')
        break
      }
      const open = s.data?.open ? 0 : 1
      s.data = { ...s.data, open }
      s.solid = !open
      eng.msg(
        open
          ? t.kind === 'rollerdoor' ? '卷帘门哗啦一声升起，室外的空气涌了进来。' : '玻璃门无声滑开。'
          : t.kind === 'rollerdoor' ? '卷帘门哐当落下。' : '玻璃门合上了。',
        'system',
      )
      audio.uiTick()
      break
    }
    case 'inkdoor': {
      // 维护通廊墨黑色金属门（横跨 2 格门洞，交互开/关；关门时实心阻挡）
      const s = t.s && t.s.kind === 'inkdoor' && Math.hypot(t.s.x + t.s.w / 2 - p.x, t.s.y + t.s.h / 2 - p.y) < 2.6 ? t.s : null
      if (!s) return
      const open = s.data?.open ? 0 : 1
      s.data = { ...s.data, open }
      s.solid = !open
      eng.msg(open ? '墨黑色金属门吱呀一声开了——门后是一片晃眼的白。' : '你带上了墨黑色金属门。', 'system')
      audio.uiTick()
      break
    }
    case 'bargate': {
      // v51：L3 铁栅栏门（交互开/关；关门时实心阻挡，玩家站门洞则推到最近可走一侧——同 hoteldoor）
      const s = t.s && t.s.kind === 'bargate' && Math.hypot(t.s.x + t.s.w / 2 - p.x, t.s.y + t.s.h / 2 - p.y) < 2.6 ? t.s : null
      if (!s) return
      const open = s.data?.open ? 0 : 1
      s.data = { ...s.data, open }
      s.solid = !open
      if (!open) {
        const m = eng.map!
        const r = PLAYER_RADIUS
        if (p.x > s.x - r && p.x < s.x + s.w + r && p.y > s.y - r && p.y < s.y + s.h + r) {
          const f = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[y * m.w + x] === 1
          const ax = Math.floor(s.x + s.w / 2), ay = Math.floor(s.y + s.h / 2)
          const alongY = !f(ax - 1, ay) && !f(ax + 1, ay) // 门两侧是墙 ⇒ 通行沿 y 轴
          const cand = alongY
            ? [{ x: p.x, y: s.y - r - 0.12 }, { x: p.x, y: s.y + s.h + r + 0.12 }]
            : [{ x: s.x - r - 0.12, y: p.y }, { x: s.x + s.w + r + 0.12, y: p.y }]
          const ok = (c: { x: number; y: number }) => canOccupy(m, c.x, c.y, r, { z: p.z, crouch: p.crouching })
          const d0 = Math.hypot(cand[0].x - p.x, cand[0].y - p.y)
          const d1 = Math.hypot(cand[1].x - p.x, cand[1].y - p.y)
          const [near, far] = d0 <= d1 ? [cand[0], cand[1]] : [cand[1], cand[0]]
          if (ok(near)) { p.x = near.x; p.y = near.y }
          else if (ok(far)) { p.x = far.x; p.y = far.y }
        }
      }
      eng.msg(open ? '栅栏门哐当一声开了。' : '你带上了栅栏门，铁栏撞出一声闷响。', 'system')
      audio.uiTick()
      break
    }
    case 'megdoc': {
      // M.E.G. 文档：打开文档视图（App 侧记录到图鉴「文档」分类）
      const s = t.s && t.s.kind === 'megdoc' ? t.s : null
      if (!s) return
      audio.pickup()
      eng.emit({ kind: 'doc', text: (s.data?.doc as string) ?? 'meg_levels' })
      break
    }
    case 'landmark': {
      // v35：定居点地标——打开地标卡（据点介绍 + 前往/离开）
      // v55b：邀请函（invitation 结构）同走本链路（data.outpost='originals'）
      const s = t.s && (t.s.kind === 'landmark' || t.s.kind === 'invitation') ? t.s : null
      if (!s) return
      audio.uiTick()
      eng.emit({ kind: 'landmark', text: (s.data?.outpost as string) ?? 'alpha' })
      break
    }
    case 'npc': {
      // v35：与 NPC 交谈（App 打开对话窗并记录图鉴「NPC」分类）
      const n = t.npc
      if (!n) return
      // NPC 转身面向玩家（v39：工作循环的 BRC 员工不转身——他们从不停手）
      if (!n.def.workLoop) n.facing = Math.atan2(p.y - n.y, p.x - n.x)
      audio.uiTick()
      eng.emit({ kind: 'dialog', text: n.id })
      break
    }
    case 'jerry': {
      // v45：接触杰瑞——声望 +5（每次）+ 教化 +25 + 触发诵咏（驯服后不再积累教化）
      eng.contactJerry(t.ent)
      break
    }
    case 'vendingmachine': {
      // v51：人制品售货机——背面看标语（此后背对它即激活）；正面取一份人制品
      const e = t.ent
      if (!e || e.dead || e.def.type !== 'vendingmachine') return
      if (t.vmBack) {
        eng.msg('人制品售货机 · 艾里克家族出品 ——「它于人人，人人为它，它为人人。」· 2019，亚利桑那', 'lore')
        e.activated = true // 标记：玩家已看过背面——背对它时激活
        eng.msg('看完最好也别背对它。', 'system')
      } else {
        eng.msg('格子里的金属线没有转动——一只白骨化的人手把产品推到了取货口。（获得 人制品 ×1）', 'lore')
        if (!eng.addItem('manmade')) eng.msg('背包已满，取不走这份产品。', 'system')
      }
      break
    }
    case 'glasswin': {
      const lvl = p.level
      eng.msg(lvl === 4 ? GLASSWIN_TEXT.l4 : GLASSWIN_TEXT.other, 'lore')
      p.sanity = Math.min(100, p.sanity + DECOR_VIEWS.glasswin.sanity)
      break
    }
    case 'windowtrap': {
      const s = t.s && t.s.kind === 'windowtrap' ? t.s : null
      if (!s || s.data?.triggered) { eng.msg('玻璃后面只剩黑暗。', 'system'); return }
      s.data = { ...s.data, triggered: 1 }
      p.sanity = Math.max(0, p.sanity - 14)
      eng.emit({ kind: 'sanityhit' })
      eng.camShake = Math.min(1, eng.camShake + 0.4)
      eng.msg('你凑近那扇没涂黑的窗户——里面的「房间」转过头来看你。（理智-14）', 'damage')
      audio.aggro()
      eng.noiseEvent(p.x, p.y, 12, true)
      break
    }
    case 'windowblack': {
      for (const dm of DECOR_VIEWS.windowblack.msgs!) eng.msg(dm.text, dm.type)
      p.sanity = Math.min(100, p.sanity + DECOR_VIEWS.windowblack.sanity)
      break
    }
    case 'graffiti': {
      // v17：变体房间专属 lore（涂鸦/文档，按 data.loreKind；同处再读顺延下一条）
      const s2g = t.s && t.s.kind === 'graffiti' ? t.s : null
      const loreKind = s2g?.data?.loreKind as string | undefined
      if (loreKind && GRAFFITI_LORE_KIND[loreKind] && s2g) {
        const pool2 = GRAFFITI_LORE_KIND[loreKind]
        const li2 = ((s2g.data?.loreIdx as number | undefined) ?? -1) + 1
        s2g.data = { ...s2g.data, loreIdx: li2 }
        eng.msg(pool2[li2 % pool2.length], 'lore')
        p.sanity = Math.min(100, p.sanity + DECOR_VIEWS.graffiti.sanity)
        break
      }
      eng.msg(GRAFFITI_LORE[Math.floor(Math.random() * GRAFFITI_LORE.length)], 'lore')
      // 出口方位涂鸦线索（按真实方位生成；v12：用选中的同一涂鸦）
      const s2 = t.s && t.s.kind === 'graffiti' ? t.s : null
      const ex = m.exits[0]
      if (s2 && ex && !s2.data?.readHint) {
        s2.data = { ...s2.data, readHint: 1 }
        const dx = ex.x - s2.x, dy = ex.y - s2.y
        const dir8 = ['东', '东南', '南', '西南', '西', '西北', '北', '东北']
        const idx = Math.round(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8
        const words = ['出口', '门', '电梯', '楼梯', '通道']
        const w = words[Math.floor(Math.random() * words.length)]
        eng.msg(`下面还有一行小字：「${w}在${dir8[idx]}边，别回头。」`, 'lore')
      }
      p.sanity = Math.min(100, p.sanity + DECOR_VIEWS.graffiti.sanity)
      break
    }
    case 'valve': {
      const s = t.s && t.s.kind === 'valve' && Math.hypot(t.s.x + 0.5 - p.x, t.s.y + 0.5 - p.y) < 2.6 ? t.s : null
      if (!s) return
      if (s.data?.on && !p.hasGloves && !eng.hasItem('wrench')) {
        p.hp -= 6; eng.emit({ kind: 'damage' })
        eng.msg('阀门烫得吓人！你需要扳手或隔热手套。', 'damage')
        if (p.hp <= 0) eng.die('被阀门烫死了')
        return
      }
      s.data = { ...s.data, on: s.data?.on ? 0 : 1 }
      eng.msg(s.data.on ? '蒸汽喷涌而出。' : '蒸汽阀门关上了。', 'system')
      audio.uiTick()
      break
    }
    case 'phonograph': {
      // v55：L5 留声机启停——data.on=0 停播停转（唱盘动画/音乐同标记；持久化走 ChunkDynState 的 on 键）
      const s = t.s && t.s.kind === 'phonograph' && Math.hypot(t.s.x + 0.5 - p.x, t.s.y + 0.5 - p.y) < 2.6 ? t.s : null
      if (!s) return
      const off = s.data?.on === 0
      s.data = { ...s.data, on: off ? 1 : 0 }
      eng.msg(off ? '你摇起曲柄。唱针落下，走调的旋律又响了起来。' : '你抬起唱针。旋律戛然而止，只剩下唱盘空转的细响。', 'system')
      audio.uiTick()
      break
    }
    case 'drinktable': {
      // v55：L5 休息室桌上饮料——随机一瓶（五种风味文本各异；一次性，data.searched 持久化记态）
      const s = t.s && t.s.kind === 'table' && Math.hypot(t.s.x + 0.5 - p.x, t.s.y + 0.5 - p.y) < 2.6 ? t.s : null
      if (!s || s.data?.searched === 1) return
      const roll = Math.random()
      const [type, flavor] = roll < 0.3 ? ['almond', '瓶身还带着冷凝水——杏仁水。甜腻的香气让你安下心来。']
        : roll < 0.55 ? ['coffee', '一罐冷掉的咖啡。拉环还很脆，像从来没被时间碰过。']
        : roll < 0.7 ? ['luckymilk', '纸盒上印着微笑的四叶草奶牛——幸运豆奶。今天也许是走运的一天。']
        : roll < 0.88 ? ['cashew', '看起来像杏仁水……但你注意到标签的印刷歪了一毫米。腰果水。小心。']
        : ['liquidpain', '淡红色的液体在瓶里微微发光。液态痛苦。你不打算喝它，但它能派上别的用场。'] as const
      if (!eng.addItem(type)) { eng.msg('背包已满，拿不走这瓶饮料。', 'system'); return }
      s.data = { ...s.data, searched: 1 }
      eng.msg(flavor, 'loot')
      audio.pickup()
      break
    }
    case 'lever': {
      p.leverPulled = true
      eng.msg('电源拉杆已扳下。货运电梯恢复供电！', 'loot')
      audio.pickup()
      break
    }
    case 'server': {
      if (eng.hasPocket('keycard')) {
        const s = t.s && t.s.kind === 'server' && t.s.locked ? t.s : m.structures.find((x) => x.kind === 'server' && x.locked)
        if (s) { s.locked = false; s.solid = false; eng.msg('服务器机房解锁了。里面有些设备。', 'loot'); eng.addItem('battery'); eng.addItem('capacitor') }
      } else eng.msg('需要门禁卡（放在口袋栏生效）。', 'system')
      break
    }
    case 'vending': {
      if (t.s?.data?.trade) {
        // v54：免费取用——但每台机器迟早会卡：每次出货后 25% 概率卡死（data.jammed），之后无法再用
        const s = t.s
        if (s.data?.jammed) {
          eng.msg('出货口的东西卡在一半，怎么拍都不动。', 'system')
          break
        }
        const roll = Math.random()
        const out = roll < 0.32 ? 'almond' : roll < 0.58 ? 'canned' : roll < 0.84 ? 'coffee' : roll < 0.94 ? 'cashew' : 'luckymilk'
        eng.addItem(out)
        const flavor: Record<string, string> = {
          almond: '机器哐当一声，滚出一瓶杏仁水。', canned: '机器哐当一声，滚出一罐没标签的罐头。',
          coffee: '机器哐当一声，滚出一罐咖啡。', cashew: '机器哐当一声，滚出一瓶……杏仁水？标签的颜色好像有点深。',
          luckymilk: '机器哐当一声，滚出一盒印着四叶草奶牛的豆奶——你从没见过这个牌子。',
        }
        eng.msg(flavor[out], 'loot')
        if (Math.random() < 0.25) {
          s.data = { ...s.data, jammed: 1 }
          eng.msg('出货的声响卡在一半，变成一种很低的不情愿的嗡嗡声。', 'system')
        }
        break
      }
      if (p.tapes > 0 && eng.consumeItem('tape')) {
        p.tapes--
        eng.addItem('coffee'); eng.addItem('canned')
        eng.msg('售货机吞下一盘磁带，吐出了咖啡和罐头。（公平交易？）', 'lore')
      } else eng.msg('售货机上贴着字条：「只收磁带」。', 'system')
      break
    }
    case 'frontdesk': {
      if (eng.hasItem('silverware') && eng.consumeItem('silverware')) {
        eng.addItem('sedative'); eng.addItem('almond')
        eng.msg('前台铃铛自己响了。托盘上多了些东西。', 'lore')
      } else { p.sanity = Math.min(100, p.sanity + 10); eng.msg('前台空无一人，但你觉得安全了一些。（理智+10）', 'lore') }
      break
    }
  }
}
// ---------- 容器搜索 / 战利品面板 ----------
// v18：内容物生成（首次搜索发起时调用一次，结果持久在结构 data.lootItems 上）
export function rollLoot(eng: Engine, kind: string): string[] {
  const p = eng.player
  const C = CONTAINERS[kind] ?? CONTAINERS.crate
  // 本层独有物品也可能出现在容器里（容器化掉落的核心：补给不再只躺在地上）
  const levelUnique = eng.levelDef.items.map((it) => it.type)
  const loot = [...C.pool, ...levelUnique]
  const lucky = p.hasRabbit
  const n = C.n + (lucky && Math.random() < 0.4 ? 1 : 0)
  const items: string[] = []
  for (let i = 0; i < n; i++) {
    const cap = lucky ? loot.length : loot.length - 1 // 非幸运不出磁带
    items.push(loot[Math.floor(Math.random() * cap)])
  }
  // v32：小概率稀有掉落（表在 containers.ts；onceOwned=玩家已拥有一个后不再生成）
  for (const r of CONTAINER_RARE[kind] ?? []) {
    if (Math.random() >= r.p) continue
    if (r.onceOwned && eng.hasItem(r.type)) continue
    items.push(r.type)
  }
  // v32：腰果水 1/10 概率替代杏仁水（开局势能物资不受影响——那部分不走生成器）
  return items.map((t) => (t === 'almond' && Math.random() < 0.1 ? 'cashew' : t))
}

// 搜索进度完成：打开面板，内容 = 结构上持久的物品数组（拿取即同步容器剩余）
export function finishSearch(eng: Engine, s: import('../core/types').Structure) {
  s.data = { ...s.data, opened: 1, searched: 1 }
  const items = (s.data.lootItems as string[] | undefined) ?? []
  const kind = s.kind
  const label = CONTAINERS[kind]?.label ?? '容器'
  if (items.length === 0) {
    s.looted = true
    eng.msg('容器是空的。', 'system')
    return
  }
  eng.lootPanel = { sid: s.data!.sid as number, label, items }
  audio.searchDone()
  eng.emit({ kind: 'lootpanel' })
}

// 从战利品面板拿取一件（返回 false=背包满）
export function takeLoot(eng: Engine, i: number): boolean {
  const lp = eng.lootPanel
  if (!lp) return false
  const type = lp.items[i]
  if (!type) return false
  if (!eng.addItem(type)) { eng.msg('背包已满。', 'system'); return false }
  lp.items.splice(i, 1)
  audio.pickup(type === 'tape')
  eng.emit({ kind: 'toast', text: `+1 ${itemName(type)}` })
  if (type === 'tape') { eng.player.tapes++; eng.msg(`找到 磁带（${eng.player.tapes}/${WIN_TAPES}）`, 'lore') }
  eng.afterLootChange()
  return true
}

export function takeAllLoot(eng: Engine) {
  const lp = eng.lootPanel
  if (!lp) return
  let i = 0
  while (lp.items.length && i++ < 20) {
    if (!eng.takeLoot(0)) break
  }
}

export function closeLootPanel(eng: Engine) {
  eng.afterLootChange()
  eng.lootPanel = null
}

export function afterLootChange(eng: Engine) {
  const lp = eng.lootPanel
  if (lp && lp.items.length === 0) {
    // 容器搜空：状态可见
    const s = eng.map?.structures.find((x) => x.data?.sid === lp.sid)
    if (s) s.looted = true
  }
}
