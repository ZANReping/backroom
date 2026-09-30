// Real engine, in-memory storage: no player save is read or overwritten.
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { engine } from '../src/game/engine'
import { storage } from '../src/game/core/storage'
import { NPCS, type NpcState } from '../src/game/content/npcs'
import { ITEMS } from '../src/game/content/items'
import { levelDefOf } from '../src/game/levels'
import { floorHeight, type GameMap } from '../src/game/world/mapgen'
import { canOccupy } from '../src/game/core/player'
import { FACTION_MISSIONS, FACTION_MISSION_BY_ID, FACTION_NPC_PLACES } from '../src/game/content/factionMissions'
import { NEW_FACTIONS, isEnhancedFaction, type NewFaction } from '../src/game/content/factionTerminals'
import { MEG_PROMOTION_COUNTS } from '../src/game/content/megMissions'
import { acceptFactionMission, canMeetFactionNpc, completedFactionLines, factionState, factionMissionLock, hasVaultMission, performFactionStation, promoteFaction, registerFaction, submitFactionStage, trackFactionTask, trackedFactionSummary, updateFactionMissions } from '../src/game/engine/factionMissions'
import { trackMegTask, megState } from '../src/game/engine/megMissions'
import { actualRank, availableStation, claimRewards, freshCareer, reward, route, startCareer } from '../src/game/engine/career'
import { advanceVault, bntgDoorAllowed, migrateBntg, updateBntg, VAULT_SLOTS } from '../src/game/engine/bntg'
import { trackQuests } from '../src/game/engine/npc'
import InventoryOverlay from '../src/components/InventoryOverlay'
import DialogOverlay from '../src/components/DialogOverlay'
import FacilityPanel from '../src/components/FacilityPanel'
import FactionTerminal from '../src/components/FactionTerminal'
import HUD from '../src/components/HUD'
import '../src/index.css'

const memory = new Map<string, string>()
storage.get = key => memory.get(key) ?? null
storage.set = (key, value) => { memory.set(key, value) }
storage.remove = key => { memory.delete(key) }
const checks: string[] = []
function check(ok: unknown, label: string) { if (!ok) throw new Error(label); checks.push(label) }
function flat(level: number) {
  const size = 128 * 128, a = () => new Uint8Array(size)
  engine.map = { w: 128, h: 128, tiles: a().fill(1), wet: a(), elev: a(), outdoor: a(), step: a(), crawl: a(), ceiling: a(), up: a(), upWall: a(), up2: a(), upWall2: a(), dn: a(), dnWall: a(), stair: new Int32Array(size), liquid: a(), seaFloor: new Float32Array(size), tint: a(), floors: 1, structures: [], entities: [], items: [], lights: [], exits: [], spawn: { x: 10, y: 10 } } as GameMap
  Object.assign(engine.player, { level, x: 10, y: 10, z: 0, vz: 0, floor: 0, hp: 100 }); engine.paused = false
  engine.input.mx = 0; engine.input.my = 0
}
function meet(id: string) {
  Object.assign(engine.player, { x: 10, y: 10, z: 0 })
  engine.npcs = [{ id, def: NPCS[id], x: 11, y: 10, floor: 0, hostile: false, dead: false } as NpcState]
}
function tick(n = 34) { for (let i = 0; i < n; i++) updateFactionMissions(engine, .1) }
function findRealNpc(id: string) {
  const n = engine.npcs.find(n => n.id === id), f = NPCS[id]?.faction as NewFaction
  if (!n || !engine.map) return false
  for (let r = .8; r < 3.5; r += .4) for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
    const x = n.x + Math.cos(a) * r, y = n.y + Math.sin(a) * r, band = n.floor ?? 0, z = floorHeight(engine.map, x, y, band)
    if (!canOccupy(engine.map, x, y, .3, { z, band, crouch: false })) continue
    Object.assign(engine.player, { x, y, z })
    if (canMeetFactionNpc(engine, id, f)) return true
  }
  return false
}
function findStation(f: NewFaction, service: string) {
  for (const s of engine.map!.structures.filter(s => s.data?.faction === f && (s.data.services as string[] | undefined)?.includes(service))) {
    for (let r = .8; r < 3; r += .35) for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const x = s.x + s.w / 2 + Math.cos(a) * r, y = s.y + s.h / 2 + Math.sin(a) * r, band = s.floor ?? 0, z = floorHeight(engine.map!, x, y, band)
      if (!canOccupy(engine.map!, x, y, .3, { z, band, crouch: false })) continue
      Object.assign(engine.player, { x, y, z })
      if (availableStation(engine, service, f)) return true
    }
  }
  return false
}
function runChecks() {
  engine.newRun(9202631, 'normal', 'slot3'); engine.paused = false
  const persisted = engine.persist.bind(engine); engine.persist = () => {}
  check(FACTION_MISSIONS.length === 48 && new Set(FACTION_MISSIONS.map(d => d.id)).size === 48, '48 条原创任务，无重复 ID')
  const prior = new Set<string>()
  for (const d of FACTION_MISSIONS) {
    check(NPCS[d.issuer]?.faction === d.faction && !!FACTION_NPC_PLACES[d.issuer], `${d.id} 发起人属于正确阵营`)
    check(d.requires.every(id => prior.has(id)), `${d.id} 前置存在且无环`)
    check(d.items.every(id => !!ITEMS[id]) && (d.faction === 'bntg' || d.coins === 0), `${d.id} 奖励与货币符合阵营`)
    for (const s of d.stages) check('npc' in s.objective ? NPCS[s.objective.npc]?.faction === d.faction : !!levelDefOf(s.objective.level), `${d.id}/${s.title} 实际目标存在`)
    prior.add(d.id)
  }
  for (const f of NEW_FACTIONS) {
    flat(1); const first = FACTION_MISSIONS.find(d => d.faction === f)!
    meet(first.issuer); check(registerFaction(engine, f).includes('已登记'), `${f} 联系人可登记身份`)
    check(!startCareer(engine, f) && promoteFaction(engine, f).includes('当前 0'), `${f} 旧考核关闭且零结案不能晋升`)
    engine.player.x = 40; check(acceptFactionMission(engine, first.id, first.issuer).includes('当面'), `${f} 禁止远程接取`)
    meet(first.issuer); engine.npcs[0].floor = 1; check(!canMeetFactionNpc(engine, first.issuer, f), `${f} 禁止跨楼层交接`)
    meet(first.issuer); engine.map!.tiles[10 * 128 + 10] = 2; check(!canMeetFactionNpc(engine, first.issuer, f), `${f} 墙体阻挡交接`); engine.map!.tiles[10 * 128 + 10] = 1
    engine.rep[f] = f === 'jerry' ? -10 : -60; check(!!factionMissionLock(engine, first.id), `${f} 敌对声望拒绝接取`); engine.rep[f] = 40
    const open = FACTION_MISSIONS.filter(d => d.faction === f && !d.requires.length)
    for (const d of open.slice(0, 3)) { meet(d.issuer); acceptFactionMission(engine, d.id, d.issuer) }
    meet(open[3].issuer); check(acceptFactionMission(engine, open[3].id, open[3].issuer).includes('最多'), `${f} 连续任务名额为三条`)
    const locked = FACTION_MISSIONS.find(d => d.faction === f && d.requires.length)!
    check(factionMissionLock(engine, locked.id)?.includes('先结案'), `${f} 后续任务受前置约束`)
    // Each authored stage goes through its actual engine handler, including costs and station records.
    for (const d of FACTION_MISSIONS.filter(d => d.faction === f)) {
      flat(1); meet(d.issuer)
      if (!factionState(engine, f).missions[d.id]) check(acceptFactionMission(engine, d.id, d.issuer).includes('已登记'), `${d.id} 可顺序解锁`)
      const p = factionState(engine, f).missions[d.id]
      while (!p.completed) {
        const index = p.stage, o = d.stages[index].objective
        if (o.kind === 'walk') {
          flat(o.level + 1000); updateFactionMissions(engine, .1); engine.player.steps += 50; tick(1); check(p.progress === 0, `${d.id} 错误层级不计步`)
          flat(o.level); tick(1); engine.player.x += 20; tick(1); check(p.progress === 0, `${d.id} 传送不计步`)
          for (let i = 0; i < o.n * 2 + 3 && p.stage === index; i++) { engine.player.steps += .8; updateFactionMissions(engine, .1) }
        } else if (o.kind === 'record') {
          flat(o.level)
          for (let i = 0; i < o.n; i++) { engine.player.x = 10 + i * 16; tick(); if (i === 0 && o.n > 1) { const value = p.progress; tick(); check(p.progress === value, `${d.id} 重复点不计数`) } }
        } else if (o.kind === 'station') {
          flat(o.level); engine.map!.structures.push({ kind: 'settlementstation', x: 11, y: 10, w: 1, h: 1, solid: false, data: { facility: true, faction: f, services: [o.service], access: 0 } })
          if (o.manifest) {
            check(performFactionStation(engine, d.id).includes('不符'), '缺失实际货物时不能伪造货单核验')
            for (let i = 0; i < 3; i++) engine.map!.structures.push({ kind: 'trade_anomaly', x: 30 + i * 2, y: 30, w: 1, h: 1, solid: false, data: { manifest: 'TH-001', quantity: 1, seal: 'S-014' } })
          }
          engine.player.x = 40; check(performFactionStation(engine, d.id).includes('请抵达'), `${d.id} 工位不可远程办理`); engine.player.x = 10
          for (const action of o.actions) check(performFactionStation(engine, d.id).includes(action), `${d.id} 实际工序 ${action}`)
        } else if (o.kind === 'vault') {
          flat(102); const v = migrateBntg(engine).vault
          engine.map!.structures = [0, 1, 2].map(i => ({ kind: 'trade_anomaly', x: 0, y: 0, w: 1, h: 1, solid: false, data: { cargoId: i, hidden: 0 } }))
          check(hasVaultMission(engine), '盘点任务开启真实保险库业务')
          check(bntgDoorAllowed(engine, { kind: 'rollerdoor', x: 0, y: 0, w: 1, h: 1, solid: true, data: { access: 4, room: 'storage_0' } }), '盘点任务提供临时库室准入')
          if (o.mode === 'migrated') { const pos = VAULT_SLOTS[v.slots[0]]; Object.assign(engine.player, pos); tick(); check(p.progress === 0, '迁移前不能伪造复盘'); advanceVault(v, 100, engine.seed); advanceVault(v, 5, engine.seed) }
          updateBntg(engine, 0)
          for (let i = 0; i < 3; i++) { const pos = VAULT_SLOTS[v.slots[i]]; engine.player.x = pos.x - 1; engine.player.y = pos.y; tick() }
        } else if ('npc' in o) {
          flat(1); meet(o.npc)
          if (o.kind === 'deliver') { engine.player.hotbar = []; engine.player.backpack = []; check(submitFactionStage(engine, d.id, o.npc).includes('尚未扣除'), `${d.id} 不足物资不扣除`); engine.player.backpack = [{ type: o.item, count: o.n }] }
          const influence = engine.indoctrination
          submitFactionStage(engine, d.id, o.npc)
          if (o.kind === 'rite') check(engine.indoctrination === Math.min(100, influence + o.influence), `${d.id} 仪式产生明确教化影响`)
          if (o.kind === 'deliver' && !p.completed) check(engine.countItem(o.item) === 0, `${d.id} 实物精确扣除`)
        }
        check(p.stage === index + 1, `${d.id} 阶段 ${index + 1} 通过实际行为推进`)
      }
      const rep = engine.rep[f], paid = engine.career.settled.length, count = completedFactionLines(engine, f)
      submitFactionStage(engine, d.id, d.issuer); acceptFactionMission(engine, d.id, d.issuer)
      check(engine.rep[f] === rep && engine.career.settled.length === paid && completedFactionLines(engine, f) === count, `${d.id} 防重复结算`)
      flat(1); meet(first.issuer); promoteFaction(engine, f)
      check(actualRank(engine, f) === MEG_PROMOTION_COUNTS.filter(n => count >= n).length, `${f}/${count} 结案职级正确`)
    }
    check(completedFactionLines(engine, f) === 16 && actualRank(engine, f) === 4, `${f} 全部结案与最高职级`)
    engine.rep[f] = 0; check(actualRank(engine, f) === 4, `${f} 声望下降不抹除资格`); engine.rep[f] = 100
  }
  // Real base geometry: NPC accessibility and novice facilities, not synthetic only.
  for (const [level, ids] of [[102, ['vesper', 'laozhangfang', 'shen', 'tang', 'kui']], [105, ['mccauley', 'pidge', 'boone', 'whitfield', 'kowalski']], [107, ['dorian', 'gunter', 'pippa']], [103, ['lecomte', 'muller', 'dupont', 'morel', 'martin', 'lefevre']], [274, ['zeph', 'polly', 'bluebird', 'sinclair']], [108, ['theron', 'aella']]] as const) {
    engine.loadLevel(level)
    for (const id of ids) check(findRealNpc(id), `${id} 真实地图可从合法站位交谈`)
  }
  for (const f of ['bntg', 'ariane'] as const) {
    const rank = route(engine, f).rank; route(engine, f).rank = 0
    const services = new Map(FACTION_MISSIONS.filter(d => d.faction === f).flatMap(d => d.stages.filter(s => s.objective.kind === 'station').map(s => { const o = s.objective; return o.kind === 'station' ? [o.service, o.level] as const : ['', 0] as const })))
    for (const [service, level] of services) { engine.loadLevel(level); check(findStation(f, service), `${f}/${service} 新人可在真实地图合法站位办理`) }
    route(engine, f).rank = rank
  }
  engine.loadLevel(108); check(engine.map!.tiles.some(x => x === 1), '蓝色救赎实际据点可加载')
  // Rewards, profile, snapshots and legacy migration use real save/newRun entry points.
  const add = engine.addItem.bind(engine); engine.addItem = () => false; reward(engine, 'faction-overflow', ['bandage', 'almond'])
  engine.career = structuredClone(engine.career); check(engine.career.pending.some(p => p.id === 'faction-overflow'), '满包奖励随存档结构保留')
  const paid: string[] = []; engine.addItem = id => { paid.push(id); return true }; claimRewards(engine); const n = paid.length; claimRewards(engine); check(paid.length === n && n >= 2, '待领取奖励仅结算一次'); engine.addItem = add
  engine.updateProfile({ name: '跨团体测试员', gender: '其他', age: 31 })
  engine.persist = persisted; engine.loadLevel(102); engine.persist(); engine.newRun(9202631, 'normal', 'slot3')
  check(NEW_FACTIONS.every(f => completedFactionLines(engine, f) === 16 && actualRank(engine, f) === 4), '真实 snapshot/newRun 恢复三团体结案及职级')
  check(engine.profile.name === '跨团体测试员' && engine.profile.age === 31, '共用个人资料随真实存档恢复')
  const old = JSON.parse(memory.get('br_save_slot3')!); delete old.career.factions
  for (const f of NEW_FACTIONS) Object.assign(old.career.routes[f], { rank: 2, active: true, task: 7 })
  memory.set('br_save_slot3', JSON.stringify(old)); engine.newRun(9202631, 'normal', 'slot3')
  check(NEW_FACTIONS.every(f => factionState(engine, f).legacyRank === 2 && actualRank(engine, f) === 2 && !route(engine, f).active && completedFactionLines(engine, f) === 0), '三团体旧档保留资格、关闭旧考核、不伪造新任务')
  engine.newRun(9202632, 'normal', 'slot3'); engine.persist = () => {}; engine.paused = false
  check(NEW_FACTIONS.every(f => completedFactionLines(engine, f) === 0 && factionState(engine, f).legacyRank === 0), '新局清空全部新任务线')
  flat(1); meet('tang'); acceptFactionMission(engine, 'bntg-shelf-water', 'tang')
  engine.over = false; engine.input.mx = 1; for (let i = 0; i < 25; i++) engine.update(.05)
  const before = factionState(engine, 'bntg').missions['bntg-shelf-water'].progress
  check(before > 0, '实际 Engine.update 移动积分推进任务')
  engine.input.mx = 0; engine.paused = true; for (let i = 0; i < 30; i++) engine.update(.05)
  check(factionState(engine, 'bntg').missions['bntg-shelf-water'].progress === before, '暂停不推进任务')
  engine.paused = false; engine.persist = persisted; engine.loadLevel(102); engine.persist(); engine.newRun(9202632, 'normal', 'slot3')
  check(factionState(engine, 'bntg').missions['bntg-shelf-water'].progress === before && trackedFactionSummary(engine)?.title === '空下来的水架', '进行中阶段与追踪经真实存档恢复')
  for (const f of NEW_FACTIONS) {
    flat(1); engine.quests = []; engine.player.backpack = []; engine.player.hotbar = []
    const issuer = FACTION_MISSIONS.find(d => d.faction === f)!.issuer
    engine.acceptQuest({ id: `${f}-generic`, faction: f, kind: 'item', target: 'bandage', n: 2, unit: 'count', hard: false, title: '物资委托', desc: '测试实时库存', rewardRep: 1, rewardCoin: f === 'bntg' ? 1 : 0, rewardItems: [] }, issuer)
    engine.player.backpack = [{ type: 'bandage', count: 2 }]; trackQuests(engine, .1); check(engine.quests[0].done, `${f} 通用物资实时达成`)
    engine.consumeItem('bandage'); trackQuests(engine, .1); check(!engine.quests[0].done && !engine.turnInQuest(f), `${f} 消耗物资后不能虚假交付`)
    engine.addItem('bandage'); check(engine.turnInQuest(f), `${f} 补齐物资后交付`)
  }
  engine.quests = [{ def: { id: 'meg-tracking-test', faction: 'meg', kind: 'level', target: '1', n: 1, unit: 'dist', hard: false, title: 'MEG', desc: '', rewardRep: 0, rewardCoin: 0, rewardItems: [] }, done: false, baseline: 0, progress: 0 }]
  trackMegTask(engine, { kind: 'quest', id: 'meg-tracking-test' }); check(!trackedFactionSummary(engine), 'MEG 追踪清除其他团体 HUD 选择')
  trackFactionTask(engine, 'bntg', { kind: 'line', id: 'bntg-shelf-water' }); check(!megState(engine).tracked, '新团体追踪清除 MEG HUD 选择')
  check(!isEnhancedFaction('brc') && !isEnhancedFaction('argos') && !isEnhancedFaction('tom') && isEnhancedFaction('meg'), '仅四个优化团体开放详情页')
  engine.newRun(9202633, 'normal', 'slot3'); engine.loadLevel(102); findRealNpc('vesper')
  engine.paused = false
  check(acceptFactionMission(engine, 'bntg-first-consignment', 'vesper').includes('已登记'), '真实地图接取首单')
  check(findStation('bntg', 'inspect'), '真实地图到达物流核验工位')
  for (let i = 0; i < 3; i++) check(performFactionStation(engine, 'bntg-first-consignment').includes('已记录'), `真实 TH-001 工序 ${i + 1}`)
  for (const npc of ['laozhangfang', 'vesper']) { check(findRealNpc(npc), `真实首单交接 ${npc}`); submitFactionStage(engine, 'bntg-first-consignment', npc) }
  check(factionState(engine, 'bntg').missions['bntg-first-consignment'].completed, '真实地图完成首单结算')
  findRealNpc('laozhangfang'); acceptFactionMission(engine, 'bntg-moving-inventory', 'laozhangfang')
  const vaultProgress = factionState(engine, 'bntg').missions['bntg-moving-inventory']
  for (const pos of VAULT_SLOTS) {
    const room = engine.map!.settlement!.blueprint.rooms.find(r => r.id.startsWith('storage_') && pos.x >= r.x && pos.x < r.x + r.w && pos.y >= r.y && pos.y < r.y + r.h)!
    const door = engine.map!.structures.find(s => s.kind === 'rollerdoor' && s.data?.room === room.id)!
    check(bntgDoorAllowed(engine, door), `盘点许可覆盖所有可能货位 ${room.id}`)
  }
  // Traverse legal stands within every actual occupied cell and observe real, moving cargo.
  for (const stage of [0, 1]) {
    if (stage === 1) { updateBntg(engine, 100); updateBntg(engine, 5) } else updateBntg(engine, 0)
    for (let i = 0; i < 3; i++) {
      const pos = VAULT_SLOTS[engine.career.bntg!.vault.slots[i]]
      let observed = false
      for (let r = .8; r < 2.7 && !observed; r += .4) for (let a = 0; a < Math.PI * 2 && !observed; a += Math.PI / 8) {
        const x = pos.x + Math.cos(a) * r, y = pos.y + Math.sin(a) * r
        if (!canOccupy(engine.map!, x, y, .3, { z: 0, band: 0, crouch: false })) continue
        Object.assign(engine.player, { x, y, z: 0 })
        const progress = vaultProgress.progress, st = vaultProgress.stage
        tick(); observed = vaultProgress.progress > progress || vaultProgress.stage > st
      }
      check(observed, `真实保险库 ${stage === 0 ? '基线' : '迁移复核'} TV-00${i + 1}`)
    }
    check(vaultProgress.stage === stage + 1, `真实保险库阶段 ${stage + 1} 完成`)
  }
  findRealNpc('laozhangfang'); submitFactionStage(engine, 'bntg-moving-inventory', 'laozhangfang')
  check(vaultProgress.completed, '实际迁移盘点回总账结案')
  engine.jerryTamed = true; flat(274); meet('bluebird')
  acceptFactionMission(engine, 'jerry-blue-sermon', 'bluebird')
  meet('zeph'); submitFactionStage(engine, 'jerry-blue-sermon', 'zeph'); meet('aella'); submitFactionStage(engine, 'jerry-blue-sermon', 'aella'); meet('bluebird')
  const influence = engine.indoctrination; submitFactionStage(engine, 'jerry-blue-sermon', 'bluebird')
  check(engine.indoctrination === influence, '已驯服杰瑞时仪式不增加教化'); engine.jerryTamed = false
  engine.loadLevel(102); findRealNpc('vesper')
  engine.updateProfile({ name: '林·格雷', gender: '不透露', age: 28 })
  engine.player.backpack = [{ type: 'bandage', count: 4 }, { type: 'almond', count: 4 }]
}
let failure = ''
try { runChecks() } catch (e) { failure = String(e); console.error(e) }
Object.assign(window, { factionTest: { engine, checks, failure, memory, findRealNpc, findStation, flat, meet, tick, FACTION_MISSION_BY_ID, factionState, acceptFactionMission, submitFactionStage, performFactionStation, trackFactionTask, freshCareer, updateFactionMissions } })
function Verifier() {
  const [f, setF] = useState<NewFaction>('bntg'), [mode, setMode] = useState('terminal'), [preview, setPreview] = useState(false)
  const ids = { bntg: 'vesper', ariane: 'lecomte', jerry: 'zeph' }, levels = { bntg: 102, ariane: 103, jerry: 274 }
  const codex = Object.fromEntries(Object.keys(NPCS).map(id => [`npc_${id}`, true]))
  return <><div style={{ position: 'fixed', bottom: 0, left: 0, zIndex: 300, background: '#111', color: '#fff', padding: 5, fontSize: 11 }}><span id="test-result">{failure ? `FAIL ${failure}` : `PASS / ${checks.length} checks`}</span>{NEW_FACTIONS.map(id => <button key={id} onClick={() => { setF(id); engine.loadLevel(levels[id]); engine.rep[id] = 30; findRealNpc(ids[id]) }}>{id}</button>)}{['terminal', 'dialog', 'facility', 'inventory', 'unsupported', 'hud'].map(x => <button key={x} onClick={() => setMode(x)}>{x}</button>)}<button onClick={() => setPreview(v => !v)}>预览切换</button></div>
    {mode === 'terminal' && <main style={{ maxWidth: 1040, margin: '20px auto 80px', padding: 12 }}><FactionTerminal key={`${f}-${preview}`} faction={f} engine={engine} codex={codex} readOnly={preview} /></main>}
    {mode === 'inventory' && <InventoryOverlay key={f} engine={engine} initialFaction={f} onClose={() => setMode('terminal')} />}
    {mode === 'unsupported' && <InventoryOverlay engine={engine} initialFaction="brc" onClose={() => setMode('terminal')} />}
    {mode === 'dialog' && <DialogOverlay key={f} npcId={ids[f]} onClose={() => setMode('terminal')} />}
    {mode === 'facility' && <FacilityPanel faction={f} onClose={() => setMode('terminal')} />}
    {mode === 'hud' && <HUD engine={engine} isMobile={false} log={[]} toasts={[]} devMode={false} fxScale={0} onPause={() => {}} onInventory={() => setMode('inventory')} onSelectSlot={() => {}} onUseSlot={() => {}} />}
  </>
}
createRoot(document.getElementById('root')!).render(<Verifier />)

