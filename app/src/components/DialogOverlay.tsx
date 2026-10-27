// NPC 对话窗（RPG 式）：NPC 名+职业+形象、对话文本、预制回复选项；
// 设置页接入 LLM API 后出现特殊选项「聊天页面」——类似聊天软件的实时对话，
// 聊天记录跨局持久化（br_npc_chat）并作为模型上下文（NPC 会「记住」）；交易由独立商店处理，沿用各团体货币。
import { useEffect, useMemo, useRef, useState } from 'react'
import { NPCS, npcAvatar } from '@/game/content/npcs'
import { engine } from '@/game/engine'
import { audio } from '@/game/core/audio'
import { ITEMS } from '@/game/content/items'
import { llmConfigured, npcChat, loadChat, appendChat, type ChatMsg } from '@/game/core/llm'
import { FACTIONS, REP_TIER } from '@/game/content/factions'
import AvatarPreview from './AvatarPreview'
import WarehouseOverlay from './warehouse/WarehouseOverlay'
import { MegNpcMissions } from './MegMissions'
import { FactionNpcMissions } from './FactionMissions'
import { isNewFaction } from '@/game/content/factionTerminals'
import { megQuestProgress } from '@/game/content/megTerminal'
import { tinyScorn } from '@/game/engine/tinyAI'
import './DialogOverlay.css'
import { isMerchant } from '@/game/engine/merchantTrade'
import { getKeybinds, bindLabelFor } from '@/game/core/keybinds'


export default function DialogOverlay({ npcId, onClose, onShop }: { npcId: string; onClose: () => void; onShop?: () => void }) {
  // 定义解析：静态注册表 + 运行时随机 NPC（否则随机 NPC 无法弹窗）
  const def = NPCS[npcId] ?? engine.npcs.find((n) => n.id === npcId)?.def ?? engine.knownNpcs.find((n) => n.id === npcId)
  const [node, setNode] = useState(0)
  const [mode, setMode] = useState<'chat' | 'chatpage' | 'quest' | 'warehouse'>('chat')
  // v56：乐手演奏反馈（演奏中的曲名提示）
  const [playNote, setPlayNote] = useState('')
  const [smallTalk, setSmallTalk] = useState<string>(() => def?.idle[Math.floor(Math.random() * def.idle.length)] ?? '')
  // 委托三选一（生成 → 选择 → 确认接取）
  const [offers, setOffers] = useState<import('@/game/content/factions').QuestDef[]>([])
  const [selOffer, setSelOffer] = useState(0)
  // 聊天页面：持久化的聊天记录
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const avatar = useMemo(() => (def ? npcAvatar(def) : null), [def])
  const useLlm = llmConfigured()
  // v39：BRC 对话页——模仿冷却/未告发记录需要秒级刷新
  const [, setBrcTick] = useState(0)
  // v54：BNTG 仓库付费临时解锁仅本次对话有效——对话窗卸载（任意关闭路径）即清空
  useEffect(() => () => { engine.warehouseTempUnlock.clear() }, [])
  useEffect(() => {
    if (def?.faction !== 'brc') return
    const t = setInterval(() => setBrcTick((x) => x + 1), 500)
    return () => clearInterval(t)
  }, [def?.faction])
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs, busy])
  // 键盘：数字键 1–9 选对应选项；特殊交互键（X）= 打开商店（独立入口，不混在对话选项里）
  const canShop = !!onShop && isMerchant(def)
  useEffect(() => {
    if (mode === 'warehouse') return
    const kb = getKeybinds()
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT' || e.repeat) return
      if (e.code === kb.special && canShop) { e.preventDefault(); audio.uiTick(); onShop!(); return }
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)
      if (m) {
        const opts = document.querySelectorAll<HTMLButtonElement>('.dlg-root .dlg-opts .dlg-opt')
        const b = opts[Number(m[1]) - 1]
        if (b) { e.preventDefault(); b.click() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canShop, onShop, mode])
  if (!def || !avatar) return null

  const cur = def.lines[node] ?? def.lines[0]
  const line = cur.npc
  // v35：所属团体与声望档位（流浪者系 NPC 无声望判定）
  const fac = FACTIONS[def.faction ?? 'meg']
  const rep = engine.rep[def.faction ?? 'meg'] ?? 0
  const isBrc = def.faction === 'brc' // v39：BRC 员工——沉默（永不拒谈也永不回应，走专属选项）
  const noTalk = !!fac?.hasRep && rep <= REP_TIER.noTalk && !isBrc
  const facColor = fac?.color ?? 'var(--amber)'
  const facSub = fac?.sub ?? fac?.color ?? 'var(--amber)' // 副主题色（团体相关文字）
  // 随机居民：未接入 API 时只能闲聊随机内容（不接对话树）
  const isRand = npcId.startsWith('rand_')

  const pick = (next?: number, action?: 'trade' | 'leave' | 'play' | 'scorn') => {
    audio.uiTick()
    if (action === 'trade') { if (onShop) onShop(); return } // 旧对话树里的「看看货」：直接去商店页面
    if (action === 'scorn') { onClose(); tinyScorn(engine); return } // [tiny] 跟小小提门/出路：第一次警告并记恼怒，再提就追杀
    if (action === 'leave') { onClose(); return }
    if (action === 'play') {
      // v56：乐手演奏——MIDI 曲风下随机摇滚风格（收听后进电台），程序化曲风下普通摇滚
      const name = engine.musicianPlay()
      setPlayNote(`${def.name}弹起了「${name}」……`)
      return
    }
    setNode(next ?? 0)
  }
  const openChatPage = () => {
    audio.uiTick()
    setMsgs(loadChat(npcId))
    setMode('chatpage')
  }
  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    setBusy(true)
    setInput('')
    const userMsg: ChatMsg = { role: 'user', content: text }
    setMsgs((m) => [...m, userMsg])
    try {
      const reply = await npcChat(def, [...loadChat(npcId), userMsg], text, engine.player.level)
      const aiMsg: ChatMsg = { role: 'assistant', content: reply }
      appendChat(npcId, userMsg, aiMsg)
      setMsgs((m) => [...m, aiMsg])
    } catch {
      const aiMsg: ChatMsg = { role: 'assistant', content: '（通讯杂音……对方似乎没听清。换个说法试试？）' }
      setMsgs((m) => [...m, aiMsg])
    } finally { setBusy(false) }
  }

  if (mode === 'warehouse' && def.warehouse) return <WarehouseOverlay npcId={npcId} onBack={() => setMode('chat')} onClose={onClose} />

  return (
    <div className="dlg-root" onClick={onClose} data-dlg-faction={def.faction ?? 'meg'}>
      <div
        className="dlg-stage anim-slideUp"
        style={{ ['--fac' as string]: facColor, ['--fac2' as string]: facSub }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dlg-portrait">
          <div className="dlg-portrait-frame"><AvatarPreview avatar={avatar} npcId={def.id} npcDef={def} size={148} /></div>
        </div>
        <div className="dlg-box">
          <div className="dlg-plate">
            <span className="dlg-name">{def.name}</span>
            <span className="dlg-role">{def.role}</span>
            {fac && <span className="dlg-fac" title={fac.en}>{fac.name}</span>}
            {fac?.hasRep && (
              <span className="dlg-rep" style={{ color: rep >= REP_TIER.discount ? 'var(--exit)' : rep <= REP_TIER.noTrade ? 'var(--blood)' : undefined }}>声望 {rep > 0 ? '+' : ''}{rep}</span>
            )}
            <span className="dlg-gap" />
            {canShop && (
              <button className="dlg-shop" onClick={() => { audio.uiTick(); onShop!() }}><kbd>{bindLabelFor('special')}</kbd>交易</button>
            )}
            <button className="dlg-x" aria-label="关闭" onClick={() => { audio.uiTick(); onClose() }}>✕</button>
          </div>
          <div className="dlg-content">
          {mode === 'chat' && (
            <>
              <div
                data-speaker={def.name}
                className="dlg-line"
              >
                <TypeLine text={noTalk ? `「……我跟你没什么好说的。」（与${fac!.name}的声望过低）` : isRand && !useLlm ? smallTalk : line} />
              </div>
              {playNote && (
                <div className="mb-2 border p-1.5 text-[12px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--amber)' }}>
                  ♪ {playNote}
                </div>
              )}
              {noTalk ? (
                <div className="dlg-opts">
                  <button className="dlg-opt" onClick={() => { audio.uiTick(); onClose() }}>告辞。</button>
                </div>
              ) : isBrc ? (
                // v39：BRC 员工——沉默（不回应任何问题），只有特殊选项：模仿装修 / 坦白 / 告辞
                <div className="dlg-opts">
                  <button
                    className="dlg-opt"
                    style={engine.brcMimicCd > 0 ? { opacity: 0.55 } : undefined}
                    onClick={() => { engine.mimicBrc(); setBrcTick((x) => x + 1) }}
                  >尝试模仿他们的动作进行装修{engine.brcMimicCd > 0 ? `（冷却 ${Math.ceil(engine.brcMimicCd)}s）` : '（声望 +2）'}</button>
                  {engine.canRequestBrcPermit() && (
                    // 施工许可（engine/remodel.ts）：声望 > 60 才出现；每局只发一张
                    <button
                      className="menu-btn px-3 py-1.5 text-left text-[12px]"
                      data-qa="brc-permit"
                      style={{ borderColor: facSub, color: facSub }}
                      onClick={() => { engine.requestBrcPermit(); setBrcTick((x) => x + 1) }}
                    >指指墙面，再指指自己——比划着要一份「施工许可」</button>
                  )}
                  {engine.brcSin.hurt + engine.brcSin.killed > 0 && (
                    <button
                      className="dlg-opt"
                      style={{ borderColor: 'var(--blood)', color: 'var(--blood)' }}
                      onClick={() => { engine.confessBrc(npcId); onClose() }}
                    >坦白你伤害/杀死了他们的同事（伤害 ×{engine.brcSin.hurt} · 杀死 ×{engine.brcSin.killed}，结清：声望 -{engine.brcSin.hurt * 10 + engine.brcSin.killed * 30}）</button>
                  )}
                  <button className="dlg-opt" onClick={() => { audio.uiTick(); onClose() }}>告辞。</button>
                  {engine.brcSin.hurt + engine.brcSin.killed > 0 && (
                    <div className="font-mono2 text-[10px]" style={{ color: 'var(--text-dim)' }}>
                      未告发记录：伤害 ×{engine.brcSin.hurt} · 杀死 ×{engine.brcSin.killed}——他们似乎还没有察觉。
                    </div>
                  )}
                </div>
              ) : fac?.id === 'jerry' ? (
                // v45/v47/v48/v49：杰瑞的信众——正常对话树选项在前，特殊选项一律追加其后（不覆盖）：
                // 认同（v48 仅野外 L2 宣传间信众可选；v49 每局仅首次 +10——已宣誓后任何信众处不再出现，
                // 改显示「你已宣誓过了」风味文本；L274 内信众不显示——他们已认可你才带你来）/
                // 带我去杰瑞的房间（认同后，≥10 引路）/ 传教使命（L274 侍立信众，≥30 三选一）/ 非议杰瑞（作死 -10）/ 告辞
                <div className="dlg-opts">
                  {cur.opts.filter((o) => o.action !== 'trade').map((o, i) => (
                    <button key={i} className="dlg-opt" onClick={() => pick(o.next, o.action)}>{o.text}</button>
                  ))}
                  {engine.canAgreeJerry(npcId) && (
                    <button className="dlg-opt" onClick={() => { engine.agreeJerry(npcId); setBrcTick((x) => x + 1) }}>「鹉主在上。杰瑞的伟大超乎一切层级。」（声望 +10）</button>
                  )}
                  {engine.player.level !== 274 && engine.player.level !== 108 && engine.jerryOath && (
                    <div className="font-mono2 text-[10px]" style={{ color: 'var(--text-dim)' }}>
                      你已宣誓过了——鹉主记得每一句誓言。（认同每局仅首次有效）
                    </div>
                  )}
                  {engine.jerryAgreed.has(npcId) && engine.player.level !== 274 && engine.player.level !== 108 && (
                    <button
                      className="dlg-opt"
                      style={{ borderColor: 'var(--exit)', color: 'var(--exit)' }}
                      onClick={() => { if (engine.gotoJerryRoom(npcId)) onClose(); else setBrcTick((x) => x + 1) }}
                    >「请引我朝见鹉主——带我去杰瑞的房间。」（需声望 ≥10）</button>
                  )}
                  {(() => {
                    // 传教委托：仅 L274 侍立信众（zeph/polly）发放与交付；进行中离开圣地免声望惩罚（takeExit）
                    const attendant = engine.player.level === 274 && (npcId === 'zeph' || npcId === 'polly')
                    if (!attendant) return null
                    const pq = engine.quests.find((q) => q.def.kind === 'preach')
                    if (pq?.done) {
                      return (
                        <button
                          className="dlg-opt"
                          style={{ borderColor: 'var(--exit)', color: 'var(--exit)' }}
                          onClick={() => { engine.turnInQuest('jerry'); setBrcTick((x) => x + 1) }}
                        >复命：传教使命「{pq.def.title}」已成。（声望 +{pq.def.rewardRep}{pq.def.rewardItems.length ? ` · ${pq.def.rewardItems.map((t) => ITEMS[t]?.name ?? t).join('、')}` : ''}）</button>
                      )
                    }
                    if (pq) {
                      return (
                        <div className="font-mono2 text-[10px]" style={{ color: 'var(--text-dim)' }}>
                          传教途中——完成「{pq.def.title}」后回来复命。（传教途中离开圣地免声望惩罚）
                        </div>
                      )
                    }
                    if (rep >= 30) {
                      return (
                        <button
                          className="dlg-opt"
                          onClick={() => { setOffers(engine.questOffers('jerry')); setSelOffer(0); setMode('quest'); audio.uiTick() }}
                        >「可有传扬鹉主之名的使命予我？」（委托三选一）</button>
                      )
                    }
                    return null
                  })()}
                  <button
                    className="dlg-opt"
                    style={{ borderColor: 'var(--blood)', color: 'var(--blood)' }}
                    onClick={() => { engine.slanderJerry(npcId); onClose() }}
                  >「恕我直言——祂不过是一只鸟。」（作死：声望 -10）</button>
                  <button className="dlg-opt" onClick={() => { audio.uiTick(); onClose() }}>告辞。</button>
                </div>
              ) : isRand && !useLlm ? (
                <div className="dlg-opts">
                  <button
                    className="dlg-opt"
                    onClick={() => { setSmallTalk(def.idle[Math.floor(Math.random() * def.idle.length)]); audio.uiTick() }}
                  >再闲聊一句</button>
                  <button className="dlg-opt" onClick={() => { audio.uiTick(); onClose() }}>告辞。</button>
                </div>
              ) : (
              <div className="dlg-opts">
                {cur.opts.filter((o) => o.action !== 'trade').map((o, i) => (
                  <button key={i} className="dlg-opt" onClick={() => pick(o.next, o.action)}>{o.text}</button>
                ))}
                {def.id === 'nightingale' && (
                  <>
                    <button
                      className="dlg-opt"
                      onClick={() => { setOffers(engine.questOffers('meg')); setSelOffer(0); setMode('quest'); audio.uiTick() }}
                    >有什么委托可以接？</button>
                    {engine.quests.some((q) => q.def.faction === 'meg' && megQuestProgress(engine, q).done) && (
                      <button
                        className="dlg-opt"
                        style={{ borderColor: 'var(--exit)', color: 'var(--exit)' }}
                        onClick={() => { engine.turnInQuest('meg'); setBrcTick(x => x + 1) }}
                      >交付已完成的委托（{engine.quests.filter((q) => q.def.faction === 'meg' && megQuestProgress(engine, q).done).length}）</button>
                    )}
                  </>
                )}
                {def.id === 'lan' && (
                  <>
                    <button
                      className="dlg-opt"
                      onClick={() => { setOffers(engine.questOffers('bntg')); setSelOffer(0); setMode('quest'); audio.uiTick() }}
                    >有押运或征集的活吗？</button>
                    {engine.quests.some((q) => q.def.faction === 'bntg' && megQuestProgress(engine, q).done) && (
                      <button
                        className="dlg-opt"
                        style={{ borderColor: 'var(--exit)', color: 'var(--exit)' }}
                        onClick={() => { engine.turnInQuest('bntg') }}
                      >交付已完成的征集（{engine.quests.filter((q) => q.def.faction === 'bntg' && megQuestProgress(engine, q).done).length}）</button>
                    )}
                  </>
                )}
                {def.id === 'lefevre' && (
                  <>
                    <button
                      className="dlg-opt"
                      onClick={() => { setOffers(engine.questOffers('ariane')); setSelOffer(0); setMode('quest'); audio.uiTick() }}
                    >有什么征集委托可以接？</button>
                    {engine.quests.some((q) => q.def.faction === 'ariane' && megQuestProgress(engine, q).done) && (
                      <button
                        className="dlg-opt"
                        style={{ borderColor: 'var(--exit)', color: 'var(--exit)' }}
                        onClick={() => { engine.turnInQuest('ariane') }}
                      >交付已完成的征集（{engine.quests.filter((q) => q.def.faction === 'ariane' && megQuestProgress(engine, q).done).length}）</button>
                    )}
                  </>
                )}
                {def.id === 'mccauley' && (
                  <>
                    <button
                      className="dlg-opt"
                      onClick={() => { setOffers(engine.goodsQuestOffers()); setSelOffer(0); setMode('quest'); audio.uiTick() }}
                    >有物流的活吗？</button>
                    {engine.quests.some((q) => q.def.kind === 'deliverGoods' && !q.done) && !engine.hasItem('parcel') && (
                      <button
                        className="dlg-opt"
                        style={{ borderColor: 'var(--blood)', color: 'var(--blood)' }}
                        onClick={() => { engine.failGoodsQuest(); onClose() }}
                      >包裹弄丢了……认栽（委托失败，声望 -3）</button>
                    )}
                  </>
                )}
                {/* v56：乐手乔伊——演奏中可叫停（停下后吉他收起、背景音乐恢复） */}
                {def.id === 'joey' && engine.joeyPlaying && (
                  <button
                    className="dlg-opt"
                    onClick={() => { engine.musicianStop(); setPlayNote(''); audio.uiTick() }}
                  >先停一下，别弹了。</button>
                )}
                {def.id === 'vesper' && engine.canClaimEl3aRelief() && (
                  <button
                    className="dlg-opt"
                    style={{ borderColor: 'var(--exit)', color: 'var(--exit)' }}
                    onClick={() => { engine.claimEl3aRelief(); onClose() }}
                  >免费领取补给包（杏仁水×1 + 罐装食品×1，本次进仓限领一次）</button>
                )}
                {engine.quests.some((q) => q.def.kind === 'deliverGoods' && q.def.target === npcId && !q.done) && (
                  <button
                    className="dlg-opt"
                    style={{ borderColor: 'var(--exit)', color: 'var(--exit)' }}
                    onClick={() => { if (engine.deliverGoodsTo(npcId)) onClose() }}
                  >交付物流包裹（{engine.quests.find((q) => q.def.kind === 'deliverGoods' && q.def.target === npcId)?.def.title}）</button>
                )}
                {engine.quests.some((q) => q.def.kind === 'deliver' && q.def.target === npcId && !q.done) && (
                  <button
                    className="dlg-opt"
                    style={{ borderColor: 'var(--exit)', color: 'var(--exit)' }}
                    onClick={() => { engine.deliverQuestTo(npcId); onClose() }}
                  >交付押运包裹（{engine.quests.find((q) => q.def.kind === 'deliver' && q.def.target === npcId)?.def.title}）</button>
                )}
                {engine.preachTargetOk(npcId) && (
                  <button
                    className="dlg-opt"
                    style={{ borderColor: '#4142a5', color: '#8a90e0' }}
                    onClick={() => { if (engine.preachTo(npcId)) onClose() }}
                  >「请听我说：鹉主杰瑞的道，超乎一切层级。」（传教委托目标；对方团体 -5）</button>
                )}
                {useLlm && (
                  <button
                    className="dlg-opt"
                    style={{ borderColor: 'var(--amber)', color: 'var(--amber)' }}
                    onClick={openChatPage}
                  >打开聊天页面</button>
                )}
                {/* v55：医疗身份 NPC——疫疾三阶以上出现「求治感染」（清除感染值） */}
                {def.medic && engine.player.infection >= 300 && (
                  <button
                    className="dlg-opt"
                    style={{ borderColor: '#7a9a4a', color: '#a8c96a' }}
                    onClick={() => { engine.cureInfection(npcId); setBrcTick((x) => x + 1) }}
                  >「医生……我病了。求您看看。」（求治感染——彻底清除）</button>
                )}
                {/* v54：寄存仓库 NPC——对应团体声望 ≥10 开放（阵营互通，48 栏）；
                    BNTG 侧声望不足可付 5 压印币临时使用（仅本次对话，关闭对话即恢复锁定） */}
                {def.warehouse && engine.canUseWarehouse(npcId) && (
                  <button
                    className="dlg-opt"
                    style={{ borderColor: 'var(--thirst)', color: 'var(--thirst)' }}
                    onClick={() => { setMode('warehouse'); audio.uiTick() }}
                  >寄存物品 / 取回物品（{def.warehouse === 'meg' ? 'M.E.G.' : 'B.N.T.G.'} 阵营仓库）</button>
                )}
                {def.warehouse === 'bntg' && !engine.canUseWarehouse(npcId) && (
                  <button
                    className="dlg-opt"
                    style={{ borderColor: 'var(--amber)', color: 'var(--amber)', opacity: engine.countItem('presses') + engine.bntgBank.balance >= 5 ? 1 : 0.55 }}
                    onClick={() => { engine.payWarehouseAccess('bntg'); setBrcTick((x) => x + 1) }}
                  >花 5 信用点／压印币临时使用仓库（合计 {engine.countItem('presses')+engine.bntgBank.balance} · 仅本次对话有效）</button>
                )}
                <button className="dlg-opt" onClick={() => { audio.uiTick(); onClose() }}>告辞。</button>
              </div>
              )}
            </>
          )}
          {mode === 'chat' && !noTalk && (def.faction ?? 'meg') === 'meg' && <MegNpcMissions npcId={npcId} />}
          {mode === 'chat' && !noTalk && def.faction && isNewFaction(def.faction) && <FactionNpcMissions faction={def.faction} npcId={npcId} />}
          {mode === 'quest' && (
            <>
              <div className="mb-2 text-[12px]" style={{ color: 'var(--text-dim)' }}>
                「挑一个吧。选好了跟我说。」（选择一个委托后确认接取）
              </div>
              <div className="mb-2 grid gap-1">
                {offers.map((q, i) => (
                  <button
                    key={q.id}
                    className="border p-2 text-left"
                    style={{ borderColor: selOffer === i ? facColor : 'var(--panel-edge)', background: selOffer === i ? 'rgba(232,185,60,0.08)' : undefined }}
                    onClick={() => { setSelOffer(i); audio.uiTick() }}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-title text-[13px]" style={{ color: facSub }}>{q.title}</span>
                      {q.hard && <span className="font-mono2 text-[9px]" style={{ color: 'var(--blood)' }}>困难·赠迁跃浆果</span>}
                    </div>
                    <div className="text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>{q.desc}</div>
                    <div className="font-mono2 mt-0.5 text-[10px]" style={{ color: 'var(--text-dim)' }}>
                      奖励：声望 +{q.rewardRep}{q.rewardCoin > 0 ? ` · ${q.faction === 'bntg' ? '压印币' : '天鹰币'} ×${q.rewardCoin}` : ''}{q.rewardItems.length ? ` · ${q.rewardItems.map((t) => ITEMS[t]?.name ?? t).join('、')}` : ''}
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex items-stretch gap-2">
                <button
                  className="menu-btn flex-[3] px-4 py-2 text-[13px]"
                  style={{ borderColor: 'var(--exit)', color: 'var(--exit)' }}
                  onClick={() => {
                    const q = offers[selOffer]
                    if (q && engine.acceptQuest(q, npcId)) setMode('chat')
                    audio.uiTick()
                  }}
                >确认接取「{offers[selOffer]?.title ?? ''}」</button>
                <button className="menu-btn flex-1 px-2 py-1 text-[11px]" onClick={() => { setMode('chat'); audio.uiTick() }}>返回</button>
              </div>
            </>
          )}
          {mode === 'chatpage' && (
            <>
              {/* 聊天软件式消息流（NPC 左 / 玩家右；记录跨局保存并被 NPC「记住」） */}
              <div ref={listRef} className="mb-2 max-h-[38dvh] min-h-[38dvh] overflow-y-auto border p-2 pr-1" style={{ borderColor: 'var(--panel-edge)', background: 'rgba(0,0,0,0.25)' }}>
                {msgs.length === 0 && (
                  <div className="py-4 text-center font-mono2 text-[11px]" style={{ color: 'var(--text-dim)' }}>开始与 {def.name} 的对话吧</div>
                )}
                {msgs.map((m, i) => (
                  <div key={i} className={`mb-1.5 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className="max-w-[85%] px-2 py-1 text-[12px] leading-relaxed"
                      style={m.role === 'user'
                        ? { background: 'rgba(232,185,60,0.18)', border: '1px solid rgba(232,185,60,0.45)', color: 'var(--text)' }
                        : { background: 'rgba(255,255,255,0.06)', border: '1px solid var(--panel-edge)', color: 'var(--text)' }}
                    >
                      {m.role !== 'user' && <span className="font-mono2 mr-1 text-[10px]" style={{ color: 'var(--amber)' }}>{def.name}</span>}
                      {m.content}
                    </div>
                  </div>
                ))}
                {busy && <div className="font-mono2 text-[11px]" style={{ color: 'var(--text-dim)' }}>{def.name} 正在输入…</div>}
              </div>
              {/* 输入区：多行动态高度输入框（独占一行，随内容换行增高） */}
              <div className="mb-1.5">
                <textarea
                  ref={(el) => {
                    if (el) {
                      el.style.height = 'auto'
                      el.style.height = `${Math.min(el.scrollHeight, 120)}px`
                    }
                  }}
                  value={input}
                  rows={1}
                  onChange={(e) => {
                    setInput(e.target.value)
                    const el = e.currentTarget
                    el.style.height = 'auto'
                    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  placeholder={`发消息给 ${def.name}…（Enter 发送，Shift+Enter 换行）`}
                  className="w-full resize-none border bg-transparent px-2 py-1.5 pr-14 font-mono2 text-[12px]"
                  style={{ borderColor: 'var(--panel-edge)', color: 'var(--text)' }}
                />
              </div>
              {/* 发送按钮固定在输入框下面一行（右对齐） */}
              <div className="mb-2 flex justify-end">
                <button className="menu-btn px-4 py-1 text-[12px]" disabled={busy} onClick={send}>{busy ? '…' : '发送'}</button>
              </div>
              <button className="menu-btn px-3 py-1.5 text-[12px]" onClick={() => { audio.uiTick(); setMode('chat') }}>返回交谈</button>
            </>
          )}

          </div>
        </div>
      </div>
    </div>
  )
}


/** 台词逐字出现（约 45 字/秒）；点一下直接显示全文 */
function TypeLine({ text }: { text: string }) {
  const [n, setN] = useState(0)
  const raf = useRef(0)
  useEffect(() => {
    setN(0)
    const t0 = performance.now()
    const step = () => { const k = Math.min(text.length, Math.floor((performance.now() - t0) / 22)); setN(k); if (k < text.length) raf.current = requestAnimationFrame(step) }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [text])
  const finish = () => { cancelAnimationFrame(raf.current); setN(text.length) }
  const done = n >= text.length
  return <span className="dlg-type" role="button" tabIndex={0} aria-label={text} onClick={finish} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish() } }}>{text.slice(0, n)}{!done && <span className="dlg-caret">▍</span>}{done && <span className="dlg-more">◆</span>}</span>
}
