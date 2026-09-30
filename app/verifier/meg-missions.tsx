// Development-only integration harness: all storage is isolated in memory.
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { engine } from '../src/game/engine'
import { storage } from '../src/game/core/storage'
import { NPCS, type NpcState } from '../src/game/content/npcs'
import { ITEMS } from '../src/game/content/items'
import { levelDefOf } from '../src/game/levels'
import { type GameMap } from '../src/game/world/mapgen'
import { MEG_MISSIONS, MEG_MISSION_BY_ID, MEG_NPC_PLACES, MEG_PROMOTION_COUNTS } from '../src/game/content/megMissions'
import { acceptMegMission, canMeetMegNpc, completedMegLines, megState, promoteMeg, registerMeg, resetMegRuntime, submitMegStage, trackMegTask, trackedMegSummary, updateMegMissions } from '../src/game/engine/megMissions'
import { actualRank, claimRewards, freshCareer, performCareer, route, startCareer } from '../src/game/engine/career'
import { canOccupy } from '../src/game/core/player'
import { floorHeight } from '../src/game/world/mapgen'
import { trackQuests } from '../src/game/engine/npc'
import type { QuestDef } from '../src/game/content/factions'
import InventoryOverlay from '../src/components/InventoryOverlay'
import DialogOverlay from '../src/components/DialogOverlay'
import HUD from '../src/components/HUD'
import TouchControls from '../src/components/TouchControls'
import { defaultSettings } from '../src/components/SettingsModal'
import '../src/index.css'

const memory = new Map<string, string>()
storage.get = key => memory.get(key) ?? null
storage.set = (key, value) => { memory.set(key, value) }
storage.remove = key => { memory.delete(key) }
const checks: string[] = []
function check(ok: unknown, name: string) { if (!ok) throw new Error(name); checks.push(name) }
function flat(level: number) {
  const size = 128 * 128, a = () => new Uint8Array(size)
  engine.map = { w: 128, h: 128, tiles: a().fill(1), wet: a(), elev: a(), outdoor: a(), step: a(), crawl: a(), ceiling: a(), up: a(), upWall: a(), up2: a(), upWall2: a(), dn: a(), dnWall: a(), stair: new Int32Array(size), liquid: a(), seaFloor: new Float32Array(size), tint: a(), floors: 1, structures: [], entities: [], items: [], lights: [], exits: [], spawn: { x: 10, y: 10 } } as GameMap
  engine.player.level = level; engine.player.x = 10; engine.player.y = 10; engine.player.z = 0; engine.player.vz = 0; engine.player.floor = 0
  engine.input.mx = 0; engine.input.my = 0
  resetMegRuntime(engine)
}
function meet(id: string) {
  engine.player.x = 10; engine.player.y = 10; engine.player.z = 0
  engine.npcs = [{ id, def: NPCS[id], x: 11, y: 10, floor: 0, hostile: false, dead: false } as NpcState]
}
function tick(n = 34) { for (let i = 0; i < n; i++) updateMegMissions(engine, .1) }
function findRealNpc(id: string) {
  const n = engine.npcs.find(n => n.id === id)
  if (!n || !engine.map) return false
  for (let r = .8; r < 3.5; r += .4) for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
    const x = n.x + Math.cos(a) * r, y = n.y + Math.sin(a) * r, band = n.floor ?? 0
    const z = floorHeight(engine.map, x, y, band)
    if (!canOccupy(engine.map, x, y, .3, { z, band, crouch: false })) continue
    engine.player.x = x; engine.player.y = y; engine.player.z = z
    if (canMeetMegNpc(engine, id)) return true
  }
  return false
}
function runChecks() {
  engine.newRun(9202601, 'normal', 'slot3')
  const persisted = engine.persist.bind(engine)
  engine.persist = () => {}
  flat(101); meet('nightingale')
  check(new Set(MEG_MISSIONS.map(m => m.id)).size === 16, '16 条独立任务线，无重复 ID')
  const prior = new Set<string>()
  for (const d of MEG_MISSIONS) {
    check((NPCS[d.issuer]?.faction ?? 'meg') === 'meg' && !!NPCS[d.issuer] && !!MEG_NPC_PLACES[d.issuer], `${d.id} 发起人与地点存在`)
    check(d.requires.every(id => prior.has(id)), `${d.id} 前置无循环且均可解锁`)
    check(d.items.every(id => !!ITEMS[id]), `${d.id} 奖励可领取`)
    for (const s of d.stages) {
      const o = s.objective
      check('npc' in o ? !!NPCS[o.npc] && !!MEG_NPC_PLACES[o.npc] : !!levelDefOf(o.level), `${d.id}/${s.title} 目标存在`)
    }
    prior.add(d.id)
  }
  check(!startCareer(engine, 'meg'), '旧 MEG 职业入口不能再启动答题路线')
  check(registerMeg(engine).includes('已登记'), '任务 NPC 可登记协作身份')
  check(promoteMeg(engine).includes('当前 0'), '零任务线不能晋升')
  check(acceptMegMission(engine, 'pipe-margin', 'nightingale').includes('当面'), '不能冒用发起人接取')
  meet('river'); check(acceptMegMission(engine, 'pipe-margin', 'river').includes('先结案'), '前置任务未结案不能接取后续')
  meet('nightingale'); engine.player.x = 40
  check(acceptMegMission(engine, 'first-bearing', 'nightingale').includes('当面'), '远程接取被拒绝')
  meet('nightingale'); engine.npcs[0].floor = 1
  check(!canMeetMegNpc(engine, 'nightingale'), '隔层不能接取或交付')
  meet('nightingale'); engine.map!.tiles[10 * 128 + 10] = 2
  check(!canMeetMegNpc(engine, 'nightingale'), '墙体阻挡交谈视线')
  engine.map!.tiles[10 * 128 + 10] = 1
  engine.rep.meg = -60; check(!canMeetMegNpc(engine, 'nightingale'), '敌对声望拒绝交接'); engine.rep.meg = 30
  check(acceptMegMission(engine, 'first-bearing', 'nightingale').includes('已登记'), '接取后自动追踪第一阶段')
  check(trackedMegSummary(engine)?.title === '看得见的距离', '追踪摘要来自真实任务状态')
  const p = megState(engine).missions['first-bearing']
  flat(4); updateMegMissions(engine, .1); engine.player.steps += 500; updateMegMissions(engine, .1)
  check(p.progress === 0, '其他层级移动不计入任务')
  flat(1); updateMegMissions(engine, .1); check(p.progress === 0, '跨层不补计历史距离')
  engine.player.x += 50; updateMegMissions(engine, .1); check(p.progress === 0, '瞬移不能伪造步行进度')
  engine.player.steps += .5; updateMegMissions(engine, .1); check(p.progress === .5, '目标层实际移动累计进度')
  // Three active lines have a separate capacity from common commissions.
  flat(101); meet('suanpan'); acceptMegMission(engine, 'crate-ledger', 'suanpan')
  meet('hobbs'); acceptMegMission(engine, 'water-register', 'hobbs')
  meet('grove'); check(acceptMegMission(engine, 'office-copy', 'grove').includes('最多'), '连续任务线同时办理上限为三条')
  trackMegTask(engine, null)
  // Exercise every authored stage using deterministic physical fixtures and real engine APIs.
  for (const d of MEG_MISSIONS) {
    flat(101); meet(d.issuer)
    if (!megState(engine).missions[d.id]) check(acceptMegMission(engine, d.id, d.issuer).includes('已登记'), `${d.id} 解锁接取成功`)
    const p = megState(engine).missions[d.id]
    while (!p.completed) {
      const stageIndex = p.stage, o = d.stages[p.stage].objective
      if (o.kind === 'walk') {
        flat(o.level); updateMegMissions(engine, .1)
        for (let i = 0; i < o.n * 2 + 4 && p.stage === stageIndex; i++) { engine.player.steps += .8; engine.player.x += .8; updateMegMissions(engine, .1) }
      } else if (o.kind === 'record') {
        flat(o.level)
        for (let i = 0; i < o.n; i++) {
          engine.player.x = 10 + i * 16; tick()
          if (i === 0 && o.n > 1) { const before = p.progress; tick(); check(p.progress === before, `${d.id} 同一测点不能重复计数`) }
        }
      } else if (o.kind === 'observe') {
        flat(o.level)
        for (let i = 0; i < o.n; i++) {
          engine.map!.structures = [{ kind: o.kinds[0], x: 12 + i * 16, y: 10, w: 1, h: 1, solid: true }]
          engine.player.x = 10 + i * 16; tick()
          if (i === 0 && o.n > 1) { const before = p.progress; tick(); check(p.progress === before, `${d.id} 同一观察物不能重复计数`) }
        }
      } else {
        flat(101); meet(o.npc)
        if (o.kind === 'deliver') {
          engine.player.hotbar = []; engine.player.backpack = []
          check(submitMegStage(engine, d.id, o.npc).includes('尚未扣除') && p.stage === stageIndex, `${d.id} 物资不足不推进`)
          engine.player.backpack = [{ type: o.item, count: o.n }]
        }
        submitMegStage(engine, d.id, o.npc)
        if (o.kind === 'deliver' && !p.completed) check(engine.countItem(o.item) === 0, `${d.id} 精确扣除交付物资`)
      }
      check(p.stage === stageIndex + 1, `${d.id} 阶段 ${stageIndex + 1} 经真实行为推进`)
    }
    const count = completedMegLines(engine), rep = engine.rep.meg, rewards = engine.career.settled.length
    submitMegStage(engine, d.id, d.issuer); acceptMegMission(engine, d.id, d.issuer)
    check(engine.rep.meg === rep && engine.career.settled.length === rewards && completedMegLines(engine) === count, `${d.id} 重复交接无声望奖励与结案刷取`)
    flat(101); meet('nightingale'); promoteMeg(engine)
    check(actualRank(engine, 'meg') === MEG_PROMOTION_COUNTS.filter(n => count >= n).length, `${count} 条结案对应晋升门槛`)
  }
  check(completedMegLines(engine) === 16 && actualRank(engine, 'meg') === 4, '全部 16 条结案并达到最高职级')
  const rank = actualRank(engine, 'meg'); engine.rep.meg = 0
  check(actualRank(engine, 'meg') === rank, '贸易声望下降不抹除已获专业资格'); engine.rep.meg = 100
  check(performCareer(engine, 'meg', 0).includes('最高'), '旧答题 API 转入履历核验，不能刷旧奖励')
  // Reward overflow survives save serialization and is paid once.
  const { reward } = awaitlessCareer
  const add = engine.addItem.bind(engine); engine.addItem = () => false
  reward(engine, 'meg-overflow-test', ['battery', 'bandage'])
  engine.career = structuredClone(engine.career)
  check(engine.career.pending.some(p => p.id === 'meg-overflow-test'), '满背包奖励保存在待领取清单')
  const paid: string[] = []; engine.addItem = item => { paid.push(item); return true }
  claimRewards(engine); const paidCount = paid.length; claimRewards(engine)
  check(paid.length === paidCount && paid.includes('bandage'), '待发奖励重载后仅领取一次'); engine.addItem = add
  // Common commissions: only current level movement, dynamic items, tracking cleanup, no line credit.
  engine.quests = []
  const q: QuestDef = { id: 'meg-distance', faction: 'meg', kind: 'level', target: '1', n: 10, unit: 'dist', hard: false, title: '测绘测试', desc: '在 Level 1 步行 10 米', rewardRep: 1, rewardCoin: 1, rewardItems: [] }
  engine.acceptQuest(q, 'nightingale'); flat(4); trackQuests(engine, .1); engine.player.steps += 100; trackQuests(engine, .1)
  flat(1); trackQuests(engine, .1); check(engine.quests[0].progress === 0, '通用委托不能借其他层级刷里程')
  engine.player.steps += 1; trackQuests(engine, .1); check(engine.quests[0].progress === 1, '通用委托正确累计目标层移动')
  engine.quests = []; engine.acceptQuest({ ...q, id: 'meg-items', kind: 'item', target: 'almond', n: 2, unit: 'count' }, 'nightingale')
  engine.player.hotbar = []; engine.player.backpack = [{ type: 'almond', count: 2 }]
  trackMegTask(engine, { kind: 'quest', id: 'meg-items' }); check(engine.turnInQuest('meg'), '通用物资委托可按当前库存交付')
  check(!trackedMegSummary(engine) && completedMegLines(engine) === 16, '通用委托交付清除追踪且不增加任务线数量')
  // Actual generated maps and NPC interaction geometry (not only fixtures).
  engine.persist = persisted
  for (const [level, ids] of [[101, ['nightingale', 'suanpan', 'river']], [106, ['brandt', 'aurora']], [109, ['hobbs', 'grove', 'irene']], [110, ['barclay', 'otis', 'petra']], [113, ['nestmedic', 'nestwarden']], [115, ['l11_archivist', 'l11_quartermaster', 'l11_tutor']]] as const) {
    engine.loadLevel(level)
    for (const id of ids) check(findRealNpc(id), `${id} 在实际地图中可从合法站位交谈`)
  }
  engine.loadLevel(101); findRealNpc('nightingale')
  engine.persist()
  engine.newRun(9202601, 'normal', 'slot3')
  check(completedMegLines(engine) === 16 && actualRank(engine, 'meg') === 4, '真实 snapshot/newRun 恢复所有结案与职级')
  const old = JSON.parse(memory.get('br_save_slot3')!)
  delete old.career.meg; old.career.routes.meg.rank = 2; old.career.routes.meg.active = true; old.career.routes.meg.task = 7
  memory.set('br_save_slot3', JSON.stringify(old)); engine.newRun(9202601, 'normal', 'slot3')
  check(megState(engine).legacyRank === 2 && actualRank(engine, 'meg') === 2 && completedMegLines(engine) === 0 && !route(engine, 'meg').active, '旧档保留既得职级，清除旧追踪，不伪造任务线')
  engine.newRun(9202602, 'normal', 'slot3')
  check(completedMegLines(engine) === 0 && megState(engine).legacyRank === 0 && !megState(engine).tracked, '新一局重置全部 MEG 任务状态')
  engine.persist = () => {}
  flat(101); meet('nightingale'); acceptMegMission(engine, 'first-bearing', 'nightingale')
  flat(1); engine.over = false; engine.paused = false
  engine.input.mx = 1
  engine.update(.05)
  const initialSteps = engine.player.steps
  for (let i = 0; i < 20; i++) engine.update(.05)
  check(engine.player.steps > initialSteps && megState(engine).missions['first-bearing'].progress > 0, '实际 Engine.update 移动积分推进 MEG 任务')
  engine.input.mx = 0; engine.paused = true
  const beforePause = megState(engine).missions['first-bearing'].progress
  for (let i = 0; i < 80; i++) engine.update(.05)
  check(megState(engine).missions['first-bearing'].progress === beforePause, '暂停游戏不推进任务')
  engine.persist = persisted; engine.paused = false
  engine.loadLevel(101); engine.persist(); engine.newRun(9202602, 'normal', 'slot3')
  check(megState(engine).missions['first-bearing'].progress === beforePause && trackedMegSummary(engine)?.title === '看得见的距离', '进行中进度及追踪选择经真实存档恢复')
  engine.newRun(9202603, 'normal', 'slot3')
  engine.loadLevel(101); check(findRealNpc('nightingale'), '实际夜莺接取场景准备就绪')
}
import * as awaitlessCareer from '../src/game/engine/career'
let failure = ''
try { runChecks() } catch (error) { failure = String(error); console.error(error) }
Object.assign(window, { megMissionTest: { engine, checks, failure, memory, findRealNpc, acceptMegMission, submitMegStage, megState, MEG_MISSION_BY_ID, freshCareer, updateMegMissions, resetMegRuntime } })
function Verifier() {
  const [mode, setMode] = useState<'dialog' | 'terminal' | 'hud'>('dialog')
  const [mobile, setMobile] = useState(false)
  return <><div style={{ position: 'fixed', bottom: 0, left: 0, zIndex: 200, background: '#111', padding: 6, fontSize: 11 }}><span id="test-result">{failure ? `FAIL ${failure}` : `PASS / ${checks.length} checks`}</span>{' '}<button onClick={() => setMode('dialog')}>对话</button>{' '}<button onClick={() => setMode('terminal')}>终端</button>{' '}<button onClick={() => setMode('hud')}>HUD</button>{' '}<button onClick={() => setMobile(x => !x)}>手机模式</button></div>
    {mode === 'dialog' && <DialogOverlay npcId="nightingale" onClose={() => setMode('hud')} />}
    {mode === 'terminal' && <InventoryOverlay engine={engine} initialFaction="meg" onClose={() => setMode('hud')} />}
    {mode === 'hud' && <><HUD engine={engine} isMobile={mobile} log={[]} toasts={[]} devMode={false} fxScale={0} onPause={() => {}} onInventory={() => setMode('terminal')} onSelectSlot={() => {}} onUseSlot={() => {}} />{mobile && <TouchControls engine={engine} settings={defaultSettings} onInventory={() => setMode('terminal')} />}</>}
  </>
}
createRoot(document.getElementById('root')!).render(<Verifier />)
