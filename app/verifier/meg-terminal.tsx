// Development-only harness. All storage is in memory: opening this verifier cannot overwrite saves.
import { engine } from '../src/game/engine'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import InventoryOverlay from '../src/components/InventoryOverlay'
import { storage } from '../src/game/core/storage'
import { normalizeProfile } from '../src/game/core/playerProfile'
import { isMegQuest, megPosition, megQuestProgress, megRelationship } from '../src/game/content/megTerminal'
import { NPCS } from '../src/game/content/npcs'
import type { QuestDef } from '../src/game/content/factions'
import { route } from '../src/game/engine/career'
import '../src/index.css'

const memory = new Map<string, string>()
storage.get = key => memory.get(key) ?? null
storage.set = (key, value) => { memory.set(key, value) }
storage.remove = key => { memory.delete(key) }
const checks: string[] = []
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label)
  checks.push(label)
}
const quest = (id: string, faction: QuestDef['faction'] = 'meg'): QuestDef => ({ id, faction, kind: 'item', target: 'almond', n: 2, unit: 'count', hard: false, title: '杏仁水补给核验', desc: '收集两瓶杏仁水，返回探险署中控室交付，为下一支巡逻队准备补给。', rewardRep: 8, rewardCoin: 3, rewardItems: ['bandage'] })
engine.newRun(220926, 'normal', 'slot3')
check(engine.profile.name === '' && engine.profile.age === null && engine.profile.gender === null, '未登记字段不伪造默认资料')
for (const [rep, label] of [[-90, '敌人'], [-60, '敌人'], [-59, '不受信任的流浪者'], [-30, '不受信任的流浪者'], [-29, '流浪者'], [19, '流浪者'], [20, 'MEG 合作人员'], [79, 'MEG 合作人员'], [80, 'MEG 信赖的合作人员']] as const) check(megRelationship(rep) === label, `声望边界 ${rep}`)
check(normalizeProfile({ name: '  测试  ', age: 0 }).name === '测试', '姓名去除首尾空格')
for (const age of [0, -1, 1.5, 151, NaN, Infinity]) check(normalizeProfile({ age }).age === null, `无效年龄 ${age}`)
engine.profile = { name: '档案测试', gender: '不透露', age: 27 }
engine.acceptQuest(quest('test-source'), 'nightingale')
check(engine.quests[0].def.issuer?.id === 'nightingale', '任务记录真实发起人')
check(isMegQuest(engine.quests[0].def), 'MEG NPC 任务归属')
engine.persist()
engine.profile.name = '临时改名'
engine.newRun(220926, 'normal', 'slot3')
check(engine.profile.name === '档案测试' && engine.profile.age === 27 && engine.profile.gender === '不透露', '真实存档序列化及 newRun 读档恢复个人资料')
check(engine.quests[0].def.issuer?.name === NPCS.nightingale.name, 'NPC 来源随存档恢复')
const legacy = JSON.parse(memory.get('br_save_slot3')!)
delete legacy.profile
delete legacy.quests[0].def.issuer
memory.set('br_save_slot3', JSON.stringify(legacy))
engine.newRun(220926, 'normal', 'slot3')
check(engine.profile.age === null && engine.profile.name === '', '旧档无 profile 可正常读取')
check(isMegQuest(engine.quests[0].def), '旧委托按 faction 回退')
check(!isMegQuest(quest('foreign', 'bntg')), '排除其他阵营委托')
check(isMegQuest({ ...quest('source-wins', 'bntg'), issuer: { id: 'n', name: '外勤', faction: 'meg' } }), '发起 NPC 所属优先于奖励方')
check(!isMegQuest({ ...quest('source-wins-foreign'), issuer: { id: 'n', name: '商人', faction: 'bntg' } }), '非 MEG 发起人不错误归档')
engine.rep.meg = 100
check(megPosition(engine) === 'MEG 信赖的合作人员', '高声望不等于已入署')
const career = route(engine, 'meg'); career.joined = true; career.rank = 2
check(megPosition(engine) === '正式探索员', '正式职位读取职业系统')
engine.rep.meg = 20
check(megPosition(engine) === '正式探索员', '已取得职级不随声望交易变化')
engine.rep.meg = 0
check(megPosition(engine) === '正式探索员', '零声望仍保留已取得的职级')
career.rank = 0
check(megPosition(engine).includes('登记协作员'), '已登记但未获资格的身份')
engine.player.backpack = [{ type: 'almond', count: 2 }]
engine.player.hotbar = []
check(megQuestProgress(engine, engine.quests[0]).done, '物品目标按当前背包可交付')
engine.player.backpack = []
engine.quests[0].done = true
check(!megQuestProgress(engine, engine.quests[0]).done, '消耗目标物品后取消待交付提示')
engine.profile = { name: '上一局', age: 36, gender: '男' }
engine.newRun(220927, 'normal', 'slot3')
check(engine.profile.name === '' && engine.profile.age === null, '新一局重置个人档案')

// Rich visual fixture exercises the production overlay, not a separate mock of its UI.
engine.profile = { name: '林远', age: 27, gender: '不透露' }
engine.rep.meg = 36
engine.acceptQuest(quest('q-meg-01'), 'nightingale')
engine.acceptQuest({ ...quest('q-meg-02'), kind: 'level', target: '1', unit: 'dist', n: 300, title: 'Level 1 · 廊道测绘', desc: '沿 Level 1 柱网勘测 300 米，记录可用于撤离的连续通道。' }, 'nightingale')
engine.quests[1].progress = 135
engine.acceptQuest({ ...quest('q-bntg-01', 'bntg'), target: 'battery', title: 'BNTG 电池采购' }, 'vesper')
engine.player.backpack = [{ type: 'almond', count: 2 }]
engine.player.hotbar = []
engine.knownNpcs = [{ ...NPCS.nightingale, id: 'random_meg_test', name: '梅拉', role: '巡逻队员' }, NPCS.nightingale]
memory.set('br_codex', JSON.stringify({ npc_nightingale: true, npc_abacus: true, npc_random_meg_test: true, npc_vesper: true }))
memory.set('br_npc_chat', JSON.stringify({ nightingale: [{ role: 'user', content: '我想参与下一次勘探。' }, { role: 'assistant', content: '先把补给备齐。我们会在中控室等你的报告。' }] }))
engine.persist()
Object.assign(window, { megTest: { engine, checks, memory } })

function Verifier() {
  const [mode, setMode] = useState(0)
  const [readOnly, setReadOnly] = useState(false)
  return <><div style={{ position: 'fixed', top: 0, left: 0, zIndex: 200, background: '#111', padding: 6, fontSize: 11 }}>
    <span id="test-result">PASS / {checks.length} 项数据检查</span>{' '}
    <button onClick={() => { setReadOnly(!readOnly); setMode(n => n + 1) }}>切换预览模式</button>{' '}
    <button onClick={() => { engine.newRun(220927, 'normal', 'slot3'); setMode(n => n + 1) }}>重新读档</button>
  </div><InventoryOverlay key={mode} engine={engine} initialFaction="meg" codexOnly={readOnly} onClose={() => {}} /></>
}
createRoot(document.getElementById('root')!).render(<Verifier />)
