// NPC 对话窗（RPG 式）：NPC 名+职业+形象、对话文本、预制回复选项；
// 设置页接入 LLM API 后出现特殊选项「聊天页面」——类似聊天软件的实时对话，
// 聊天记录跨局持久化（br_npc_chat）并作为模型上下文（NPC 会「记住」）；「交易」页以天鹰币结算。
import { useEffect, useMemo, useRef, useState } from 'react'
import { NPCS, npcAvatar } from '@/game/content/npcs'
import { engine } from '@/game/engine'
import { audio } from '@/game/core/audio'
import { ITEMS } from '@/game/content/items'
import { llmConfigured, npcChat, loadChat, appendChat, type ChatMsg } from '@/game/core/llm'
import { FACTIONS, REP_TIER } from '@/game/content/factions'
import AvatarPreview from './AvatarPreview'
import { ItemGlyph } from './HUD'

export default function DialogOverlay({ npcId, onClose }: { npcId: string; onClose: () => void }) {
  // 定义解析：静态注册表 + 运行时随机 NPC（否则随机 NPC 无法弹窗）
  const def = NPCS[npcId] ?? engine.npcs.find((n) => n.id === npcId)?.def ?? engine.knownNpcs.find((n) => n.id === npcId)
  const [node, setNode] = useState(0)
  const [mode, setMode] = useState<'chat' | 'trade' | 'chatpage' | 'quest' | 'warehouse'>('chat')
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
  if (!def || !avatar) return null

  const cur = def.lines[node] ?? def.lines[0]
  const line = cur.npc
  // v35：所属团体与声望档位（流浪者系 NPC 无声望判定）
  const fac = FACTIONS[def.faction ?? 'meg']
  const rep = engine.rep[def.faction ?? 'meg'] ?? 0
  const isBrc = def.faction === 'brc' // v39：BRC 员工——沉默（永不拒谈也永不回应，走专属选项）
  const noTalk = !!fac?.hasRep && rep <= REP_TIER.noTalk && !isBrc
  const noTrade = !!fac?.hasRep && rep <= REP_TIER.noTrade
  const discount = !!fac?.hasRep && rep >= REP_TIER.discount
  const facColor = fac?.color ?? 'var(--amber)'
  const facSub = fac?.sub ?? fac?.color ?? 'var(--amber)' // 副主题色（团体相关文字）
  // 交易货币（BNTG 系为压印币：1 杏仁水 ↔ 2 压印币；v54：'almond'=直接以杏仁水计价——Gamma 基地军需官，无币互换）
  const coinItem = def.currency === 'presses' ? 'presses' : def.currency === 'almond' ? 'almond' : 'eaglecoin'
  const coinName = def.currency === 'presses' ? '压印币' : def.currency === 'almond' ? '杏仁水' : '天鹰币'
  const coinUnit = def.currency === 'almond' ? '瓶' : '枚' // v54：货币量词
  const coinRate = def.currency === 'presses' ? 2 : 1 // 1 杏仁水 = coinRate 币
  // 随机居民：未接入 API 时只能闲聊随机内容（不接对话树）
  const isRand = npcId.startsWith('rand_')
  const [smallTalk, setSmallTalk] = useState<string>(() => def.idle[Math.floor(Math.random() * def.idle.length)] ?? '')

  const pick = (next?: number, action?: 'trade' | 'leave') => {
    audio.uiTick()
    if (action === 'trade') { setMode('trade'); return }
    if (action === 'leave') { onClose(); return }
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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="anim-slideUp hud-panel flex w-full max-w-[560px] gap-4 p-4"
        style={{ background: 'var(--panel)', borderColor: facColor }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex w-[104px] shrink-0 flex-col items-center gap-1">
          <AvatarPreview avatar={avatar} npcId={def.id} npcDef={def} size={92} />
          <div className="font-title text-[15px]" style={{ color: 'var(--amber)' }}>{def.name}</div>
          <div className="font-mono2 text-center text-[10px]" style={{ color: 'var(--text-dim)' }}>{def.role}</div>
          {fac && (
            <div className="font-mono2 text-center text-[9px]" style={{ color: 'var(--text-dim)' }}>
              {fac.name} {fac.en}
            </div>
          )}
          {fac?.hasRep && (
            <div className="font-mono2 text-center text-[9px]" style={{ color: rep >= REP_TIER.discount ? 'var(--exit)' : rep <= REP_TIER.noTrade ? 'var(--blood)' : 'var(--amber)' }}>
              声望 {rep > 0 ? '+' : ''}{rep}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {mode === 'chat' && (
            <>
              <div
                className="mb-3 min-h-[76px] border p-2 text-[13px] leading-relaxed"
                style={{ borderColor: 'var(--panel-edge)', color: 'var(--text)', background: 'rgba(0,0,0,0.25)' }}
              >
                {noTalk ? `「……我跟你没什么好说的。」（与${fac!.name}的声望过低）` : isRand && !useLlm ? smallTalk : line}
              </div>
              {noTalk ? (
                <div className="mb-2 flex flex-col gap-1">
                  <button className="menu-btn px-3 py-1.5 text-left text-[12px]" onClick={() => { audio.uiTick(); onClose() }}>告辞。</button>
                </div>
              ) : isBrc ? (
                // v39：BRC 员工——沉默（不回应任何问题），只有特殊选项：模仿装修 / 坦白 / 告辞
                <div className="mb-2 flex flex-col gap-1">
                  <button
                    className="menu-btn px-3 py-1.5 text-left text-[12px]"
                    style={engine.brcMimicCd > 0 ? { opacity: 0.55 } : undefined}
                    onClick={() => { engine.mimicBrc(); setBrcTick((x) => x + 1) }}
                  >尝试模仿他们的动作进行装修{engine.brcMimicCd > 0 ? `（冷却 ${Math.ceil(engine.brcMimicCd)}s）` : '（声望 +2）'}</button>
                  {engine.brcSin.hurt + engine.brcSin.killed > 0 && (
                    <button
                      className="menu-btn px-3 py-1.5 text-left text-[12px]"
                      style={{ borderColor: 'var(--blood)', color: 'var(--blood)' }}
                      onClick={() => { engine.confessBrc(npcId); onClose() }}
                    >坦白你伤害/杀死了他们的同事（伤害 ×{engine.brcSin.hurt} · 杀死 ×{engine.brcSin.killed}，结清：声望 -{engine.brcSin.hurt * 10 + engine.brcSin.killed * 30}）</button>
                  )}
                  <button className="menu-btn px-3 py-1.5 text-left text-[12px]" onClick={() => { audio.uiTick(); onClose() }}>告辞。</button>
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
                <div className="mb-2 flex flex-col gap-1">
                  {cur.opts.map((o, i) => (
                    <button key={i} className="menu-btn px-3 py-1.5 text-left text-[12px]" onClick={() => pick(o.next, o.action)}>{o.text}</button>
                  ))}
                  {engine.canAgreeJerry(npcId) && (
                    <button className="menu-btn px-3 py-1.5 text-left text-[12px]" onClick={() => { engine.agreeJerry(npcId); setBrcTick((x) => x + 1) }}>「鹉主在上。杰瑞的伟大超乎一切层级。」（声望 +10）</button>
                  )}
                  {engine.player.level !== 274 && engine.player.level !== 108 && engine.jerryOath && (
                    <div className="font-mono2 text-[10px]" style={{ color: 'var(--text-dim)' }}>
                      你已宣誓过了——鹉主记得每一句誓言。（认同每局仅首次有效）
                    </div>
                  )}
                  {engine.jerryAgreed.has(npcId) && engine.player.level !== 274 && engine.player.level !== 108 && (
                    <button
                      className="menu-btn px-3 py-1.5 text-left text-[12px]"
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
                          className="menu-btn px-3 py-1.5 text-left text-[12px]"
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
                          className="menu-btn px-3 py-1.5 text-left text-[12px]"
                          onClick={() => { setOffers(engine.questOffers('jerry')); setSelOffer(0); setMode('quest'); audio.uiTick() }}
                        >「可有传扬鹉主之名的使命予我？」（委托三选一）</button>
                      )
                    }
                    return null
                  })()}
                  <button
                    className="menu-btn px-3 py-1.5 text-left text-[12px]"
                    style={{ borderColor: 'var(--blood)', color: 'var(--blood)' }}
                    onClick={() => { engine.slanderJerry(npcId); onClose() }}
                  >「恕我直言——祂不过是一只鸟。」（作死：声望 -10）</button>
                  <button className="menu-btn px-3 py-1.5 text-left text-[12px]" onClick={() => { audio.uiTick(); onClose() }}>告辞。</button>
                </div>
              ) : isRand && !useLlm ? (
                <div className="mb-2 flex flex-col gap-1">
                  <button
                    className="menu-btn px-3 py-1.5 text-left text-[12px]"
                    onClick={() => { setSmallTalk(def.idle[Math.floor(Math.random() * def.idle.length)]); audio.uiTick() }}
                  >再闲聊一句</button>
                  <button className="menu-btn px-3 py-1.5 text-left text-[12px]" onClick={() => { audio.uiTick(); onClose() }}>告辞。</button>
                </div>
              ) : (
              <div className="mb-2 flex flex-col gap-1">
                {cur.opts.map((o, i) => (
                  <button key={i} className="menu-btn px-3 py-1.5 text-left text-[12px]" onClick={() => pick(o.next, o.action)}>{o.text}</button>
                ))}
                {def.id === 'nightingale' && (
                  <>
                    <button
                      className="menu-btn px-3 py-1.5 text-left text-[12px]"
                      onClick={() => { setOffers(engine.questOffers('meg')); setSelOffer(0); setMode('quest'); audio.uiTick() }}
                    >有什么委托可以接？</button>
                    {engine.quests.some((q) => q.done && q.def.faction === 'meg') && (
                      <button
                        className="menu-btn px-3 py-1.5 text-left text-[12px]"
                        style={{ borderColor: 'var(--exit)', color: 'var(--exit)' }}
                        onClick={() => { engine.turnInQuest('meg') }}
                      >交付已完成的委托（{engine.quests.filter((q) => q.done && q.def.faction === 'meg').length}）</button>
                    )}
                  </>
                )}
                {def.id === 'lan' && (
                  <>
                    <button
                      className="menu-btn px-3 py-1.5 text-left text-[12px]"
                      onClick={() => { setOffers(engine.questOffers('bntg')); setSelOffer(0); setMode('quest'); audio.uiTick() }}
                    >有押运或征集的活吗？</button>
                    {engine.quests.some((q) => q.done && q.def.faction === 'bntg') && (
                      <button
                        className="menu-btn px-3 py-1.5 text-left text-[12px]"
                        style={{ borderColor: 'var(--exit)', color: 'var(--exit)' }}
                        onClick={() => { engine.turnInQuest('bntg') }}
                      >交付已完成的征集（{engine.quests.filter((q) => q.done && q.def.faction === 'bntg').length}）</button>
                    )}
                  </>
                )}
                {def.id === 'lefevre' && (
                  <>
                    <button
                      className="menu-btn px-3 py-1.5 text-left text-[12px]"
                      onClick={() => { setOffers(engine.questOffers('ariane')); setSelOffer(0); setMode('quest'); audio.uiTick() }}
                    >有什么征集委托可以接？</button>
                    {engine.quests.some((q) => q.done && q.def.faction === 'ariane') && (
                      <button
                        className="menu-btn px-3 py-1.5 text-left text-[12px]"
                        style={{ borderColor: 'var(--exit)', color: 'var(--exit)' }}
                        onClick={() => { engine.turnInQuest('ariane') }}
                      >交付已完成的征集（{engine.quests.filter((q) => q.done && q.def.faction === 'ariane').length}）</button>
                    )}
                  </>
                )}
                {def.id === 'mccauley' && (
                  <>
                    <button
                      className="menu-btn px-3 py-1.5 text-left text-[12px]"
                      onClick={() => { setOffers(engine.goodsQuestOffers()); setSelOffer(0); setMode('quest'); audio.uiTick() }}
                    >有物流的活吗？</button>
                    {engine.quests.some((q) => q.def.kind === 'deliverGoods' && !q.done) && !engine.hasItem('parcel') && (
                      <button
                        className="menu-btn px-3 py-1.5 text-left text-[12px]"
                        style={{ borderColor: 'var(--blood)', color: 'var(--blood)' }}
                        onClick={() => { engine.failGoodsQuest(); onClose() }}
                      >包裹弄丢了……认栽（委托失败，声望 -3）</button>
                    )}
                  </>
                )}
                {def.id === 'vesper' && engine.canClaimEl3aRelief() && (
                  <button
                    className="menu-btn px-3 py-1.5 text-left text-[12px]"
                    style={{ borderColor: 'var(--exit)', color: 'var(--exit)' }}
                    onClick={() => { engine.claimEl3aRelief(); onClose() }}
                  >免费领取补给包（杏仁水×1 + 罐装食品×1，本次进仓限领一次）</button>
                )}
                {engine.quests.some((q) => q.def.kind === 'deliverGoods' && q.def.target === npcId && !q.done) && (
                  <button
                    className="menu-btn px-3 py-1.5 text-left text-[12px]"
                    style={{ borderColor: 'var(--exit)', color: 'var(--exit)' }}
                    onClick={() => { if (engine.deliverGoodsTo(npcId)) onClose() }}
                  >交付物流包裹（{engine.quests.find((q) => q.def.kind === 'deliverGoods' && q.def.target === npcId)?.def.title}）</button>
                )}
                {engine.quests.some((q) => q.def.kind === 'deliver' && q.def.target === npcId && !q.done) && (
                  <button
                    className="menu-btn px-3 py-1.5 text-left text-[12px]"
                    style={{ borderColor: 'var(--exit)', color: 'var(--exit)' }}
                    onClick={() => { engine.deliverQuestTo(npcId); onClose() }}
                  >交付押运包裹（{engine.quests.find((q) => q.def.kind === 'deliver' && q.def.target === npcId)?.def.title}）</button>
                )}
                {engine.preachTargetOk(npcId) && (
                  <button
                    className="menu-btn px-3 py-1.5 text-left text-[12px]"
                    style={{ borderColor: '#4142a5', color: '#8a90e0' }}
                    onClick={() => { if (engine.preachTo(npcId)) onClose() }}
                  >「请听我说：鹉主杰瑞的道，超乎一切层级。」（传教委托目标；对方团体 -5）</button>
                )}
                {useLlm && (
                  <button
                    className="menu-btn px-3 py-1.5 text-left text-[12px]"
                    style={{ borderColor: 'var(--amber)', color: 'var(--amber)' }}
                    onClick={openChatPage}
                  >打开聊天页面</button>
                )}
                {/* v55：医疗身份 NPC——疫疾三阶以上出现「求治感染」（清除感染值） */}
                {def.medic && engine.player.infection >= 300 && (
                  <button
                    className="menu-btn px-3 py-1.5 text-left text-[12px]"
                    style={{ borderColor: '#7a9a4a', color: '#a8c96a' }}
                    onClick={() => { engine.cureInfection(npcId); setBrcTick((x) => x + 1) }}
                  >「医生……我病了。求您看看。」（求治感染——彻底清除）</button>
                )}
                {/* v54：寄存仓库 NPC——对应团体声望 ≥10 开放（阵营互通，48 栏）；
                    BNTG 侧声望不足可付 5 压印币临时使用（仅本次对话，关闭对话即恢复锁定） */}
                {def.warehouse && engine.canUseWarehouse(npcId) && (
                  <button
                    className="menu-btn px-3 py-1.5 text-left text-[12px]"
                    style={{ borderColor: 'var(--thirst)', color: 'var(--thirst)' }}
                    onClick={() => { setMode('warehouse'); audio.uiTick() }}
                  >寄存物品 / 取回物品（{def.warehouse === 'meg' ? 'M.E.G.' : 'B.N.T.G.'} 阵营仓库）</button>
                )}
                {def.warehouse === 'bntg' && !engine.canUseWarehouse(npcId) && (
                  <button
                    className="menu-btn px-3 py-1.5 text-left text-[12px]"
                    style={{ borderColor: 'var(--amber)', color: 'var(--amber)', opacity: engine.countItem('presses') >= 5 ? 1 : 0.55 }}
                    onClick={() => { engine.payWarehouseAccess('bntg'); setBrcTick((x) => x + 1) }}
                  >花 5 压印币临时使用仓库（持有 {engine.countItem('presses')} 枚 · 仅本次对话有效）</button>
                )}
                {(def.trade || def.barter) && !cur.opts.some((o) => o.action === 'trade') && (
                  <button className="menu-btn px-3 py-1.5 text-left text-[12px]" onClick={() => pick(undefined, 'trade')}>看看货。</button>
                )}
                <button className="menu-btn px-3 py-1.5 text-left text-[12px]" onClick={() => { audio.uiTick(); onClose() }}>告辞。</button>
              </div>
              )}
            </>
          )}
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
                    if (q && engine.acceptQuest(q)) setMode('chat')
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
          {mode === 'warehouse' && def.warehouse && (() => {
            // v54：阵营寄存仓库面板——点背包格寄存，点仓库格取回（堆叠规则同背包；装备位需先卸下）
            const fac = def.warehouse
            const wh = engine.warehouses[fac]
            const facName = fac === 'meg' ? 'M.E.G.' : 'B.N.T.G.'
            const shareNote = fac === 'meg' ? 'Alpha / Gemma / Omega 基地互通' : '存储设施 / 办公区EL3A 互通'
            const cell = (key: string, s: { type: string; count: number } | null, onClick?: () => void) => (
              <button
                key={key}
                className="relative flex items-center justify-center border"
                style={{ width: 34, height: 34, borderColor: s ? facColor : 'var(--panel-edge)', background: 'rgba(0,0,0,0.25)', opacity: s ? 1 : 0.5 }}
                onClick={onClick}
              >
                {s && (
                  <>
                    <ItemGlyph type={s.type} count={s.count} />
                    {s.count > 1 && <span className="font-mono2 absolute bottom-0 right-0.5 text-[9px]" style={{ color: 'var(--amber)' }}>{s.count}</span>}
                  </>
                )}
              </button>
            )
            const used = wh.filter(Boolean).length
            return (
              <>
                <div className="mb-2 text-[12px]" style={{ color: 'var(--text-dim)' }}>
                  {facName} 阵营仓库（{used}/48 栏 · {shareNote}）——点下方背包物品寄存，点仓库物品取回。装备位物品需先卸下。
                </div>
                <div className="mb-1 font-mono2 text-[10px]" style={{ color: facSub }}>仓库</div>
                <div className="mb-2 flex max-h-[24dvh] flex-wrap gap-1 overflow-y-auto border p-1.5" style={{ borderColor: 'var(--panel-edge)' }}>
                  {wh.map((s, i) => cell(`w${i}`, s, s ? () => { engine.warehouseWithdraw(fac, i); setBrcTick((x) => x + 1) } : undefined))}
                </div>
                <div className="mb-1 font-mono2 text-[10px]" style={{ color: facSub }}>背包（快捷栏 + 行囊）</div>
                <div className="mb-2 flex max-h-[18dvh] flex-wrap gap-1 overflow-y-auto border p-1.5" style={{ borderColor: 'var(--panel-edge)' }}>
                  {engine.player.hotbar.map((s, i) => cell(`h${i}`, s, s ? () => { engine.warehouseDeposit(fac, { w: 'hotbar', i }); setBrcTick((x) => x + 1) } : undefined))}
                  {engine.player.backpack.map((s, i) => cell(`b${i}`, s, s ? () => { engine.warehouseDeposit(fac, { w: 'backpack', i }); setBrcTick((x) => x + 1) } : undefined))}
                </div>
                <button className="menu-btn px-3 py-1.5 text-[12px]" onClick={() => { audio.uiTick(); setMode('chat') }}>返回交谈</button>
              </>
            )
          })()}
          {mode === 'trade' && (
            <>
              {noTrade ? (
                <div className="mb-3 border p-3 text-[13px] leading-relaxed" style={{ borderColor: 'var(--panel-edge)', color: 'var(--text)' }}>
                  「生意？免谈。」（与{fac!.name}的声望过低，交易被拒绝）
                </div>
              ) : def.barter ? (
              <>
              {/* 以物易物（阿丽亚娜医疗品↔物资 / Tom 的餐馆食材↔菜肴：无货币，可含第二种食材 give2） */}
              <div className="mb-2 text-[12px]" style={{ color: 'var(--text-dim)' }}>
                以物易物——只收实物，不收货币。（{discount && <span style={{ color: 'var(--exit)' }}>声望卓著的流浪者，欢迎。</span>}）
              </div>
              <div className="mb-2 grid gap-1">
                {def.barter.map((b, i) => {
                  const giveIt = ITEMS[b.give], getIt = ITEMS[b.get], give2It = b.give2 ? ITEMS[b.give2] : undefined
                  const have = engine.countItem(b.give)
                  const have2 = b.give2 ? engine.countItem(b.give2) : 0
                  const afford = have >= b.giveN && (!b.give2 || have2 >= (b.give2N ?? 0))
                  const giveText = `${giveIt?.name ?? b.give} ×${b.giveN}${b.give2 ? ` + ${give2It?.name ?? b.give2} ×${b.give2N ?? 1}` : ''}`
                  return (
                    <button
                      key={i}
                      className="flex items-center gap-2 border px-2 py-1.5 text-left"
                      style={{ borderColor: afford ? facColor : 'var(--panel-edge)', opacity: afford ? 1 : 0.45 }}
                      onClick={() => {
                        if (engine.countItem(b.give) < b.giveN) { engine.msg(`${giveIt?.name ?? b.give}不够。`, 'system'); return }
                        if (b.give2 && engine.countItem(b.give2) < (b.give2N ?? 1)) { engine.msg(`${give2It?.name ?? b.give2}不够。`, 'system'); return }
                        for (let k = 0; k < b.giveN; k++) engine.consumeItem(b.give)
                        if (b.give2) for (let k = 0; k < (b.give2N ?? 1); k++) engine.consumeItem(b.give2)
                        for (let k = 0; k < b.getN; k++) engine.addItem(b.get)
                        audio.pickup()
                        engine.emit({ kind: 'toast', text: `${giveText} → ${getIt?.name ?? b.get}×${b.getN}` })
                      }}
                    >
                      <ItemGlyph type={b.get} size={20} />
                      <span className="flex-1 text-[12px]" style={{ color: 'var(--text)' }}>{giveText} → {getIt?.name ?? b.get} ×{b.getN}</span>
                      <span className="font-mono2 text-[11px]" style={{ color: afford ? 'var(--exit)' : 'var(--text-dim)' }}>持有 {have}{b.give2 ? ` / ${have2}` : ''}</span>
                    </button>
                  )
                })}
              </div>
              <button className="menu-btn px-3 py-1.5 text-[12px]" onClick={() => { audio.uiTick(); setMode('chat') }}>返回交谈</button>
              </>
              ) : (
              <>
              <div className="mb-2 text-[12px]" style={{ color: 'var(--text-dim)' }}>
                {coinName}结账，概不赊欠。（{coinName}：{engine.countItem(coinItem)} {coinUnit}
                {def.currency !== 'almond' && ` · 杏仁水：${engine.countItem('almond')} 瓶`}）
                {discount && <span style={{ color: 'var(--exit)' }}>声望优惠：全部八折</span>}
              </div>
              {/* 互换：1 杏仁水 ↔ coinRate 币（v54：杏仁水计价时无币可换，不显示互换） */}
              {def.currency !== 'almond' && (
              <div className="mb-2 flex gap-2">
                <button
                  className="menu-btn flex-1 px-2 py-1 text-[11px]"
                  onClick={() => { if (engine.consumeItem('almond')) { for (let i = 0; i < coinRate; i++) engine.addItem(coinItem); audio.uiTick() } }}
                >1 杏仁水 → {coinRate} {coinName}</button>
                <button
                  className="menu-btn flex-1 px-2 py-1 text-[11px]"
                  onClick={() => {
                    if (engine.countItem(coinItem) >= coinRate) {
                      for (let i = 0; i < coinRate; i++) engine.consumeItem(coinItem)
                      engine.addItem('almond'); audio.uiTick()
                    } else engine.msg(`${coinName}不够。`, 'system')
                  }}
                >{coinRate} {coinName} → 1 杏仁水</button>
              </div>
              )}
              <div className="mb-2 grid gap-1">
                {def.trade!.map((t) => {
                  const it = ITEMS[t.item]
                  // v51：银舌头（Object 5）——生效中交易再享 95 折
                  const price = Math.max(1, Math.floor((discount ? t.price * 0.8 : t.price) * (engine.silverTongueT > 0 ? 0.95 : 1)))
                  const afford = engine.countItem(coinItem) >= price
                  return (
                    <button
                      key={t.item}
                      className="flex items-center gap-2 border px-2 py-1.5 text-left"
                      style={{ borderColor: afford ? facColor : 'var(--panel-edge)', opacity: afford ? 1 : 0.45 }}
                      onClick={() => {
                        if (engine.countItem(coinItem) < price) { engine.msg(`${coinName}不够。`, 'system'); return }
                        for (let i = 0; i < price; i++) engine.consumeItem(coinItem)
                        engine.addItem(t.item)
                        audio.pickup()
                        engine.emit({ kind: 'toast', text: `-${price} ${coinName} → ${it?.name ?? t.item}` })
                      }}
                    >
                      <ItemGlyph type={t.item} size={20} />
                      <span className="flex-1 text-[12px]" style={{ color: 'var(--text)' }}>{it?.name ?? t.item}</span>
                      <span className="font-mono2 text-[11px]" style={{ color: 'var(--amber)' }}>{price} {coinUnit}{discount && price < t.price ? `（原 ${t.price}）` : ''}</span>
                    </button>
                  )
                })}
              </div>
              <button className="menu-btn px-3 py-1.5 text-[12px]" onClick={() => { audio.uiTick(); setMode('chat') }}>返回交谈</button>
              </>
              )}
              <button className="menu-btn px-3 py-1.5 text-[12px]" onClick={() => { audio.uiTick(); onClose() }}>告辞。</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
