import { useMemo, useState } from 'react'
import { NPCS, npcAvatar, type NpcDef } from '@/game/content/npcs'
import type { Engine } from '@/game/engine'
import { loadChat } from '@/game/core/llm'
import { FACTIONS } from '@/game/content/factions'
import { npcPortrait } from './npcPortrait'

type ContactFaction = 'meg' | 'bntg' | 'ariane' | 'jerry'

export default function MegContacts({ engine, codex, faction = 'meg' }: { engine: Engine; codex: Record<string, boolean>; faction?: ContactFaction }) {
  const [query, setQuery] = useState('')
  const factionName = FACTIONS[faction]?.name ?? FACTIONS.meg.name
  const contacts = useMemo(() => {
    const byId = new Map<string, NpcDef>(Object.values(NPCS).map((npc) => [npc.id, npc]))
    for (const npc of engine.knownNpcs) if (!byId.has(npc.id)) byId.set(npc.id, npc)
    return [...byId.values()].filter((npc) => codex[`npc_${npc.id}`] && (npc.faction ?? 'meg') === faction)
  }, [engine.knownNpcs, codex, faction])
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = contacts.filter((npc) => !normalizedQuery || `${npc.name} ${npc.role}`.toLocaleLowerCase().includes(normalizedQuery))

  return (
    <section className="meg-contacts" aria-label={`${factionName} 联系人`}>
      <label className="meg-eyebrow" htmlFor="meg-contact-search">联系人检索</label>
      <input
        id="meg-contact-search"
        className="meg-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="按姓名或职位搜索…"
      />
      <div className="meg-muted" aria-live="polite">已收录 {contacts.length} 位联系人{normalizedQuery ? ` · 匹配 ${filtered.length} 位` : ''}</div>
      {contacts.length === 0 ? (
        <p className="meg-empty">暂无已解锁的{factionName}联系人。与{factionName}人员接触后，档案将出现在此处。</p>
      ) : filtered.length === 0 ? (
        <p className="meg-empty">没有找到匹配的联系人。</p>
      ) : (
        <div className="meg-contact-list">
          {filtered.map((npc) => {
            const chat = loadChat(npc.id)
            return (
              <article className="meg-contact" key={npc.id}>
                <img loading="lazy" src={npcPortrait(npcAvatar(npc), npc.id, npc)} alt={`${npc.name} 的证件照`} width={64} height={93} />
                <div className="meg-contact-copy">
                  <div className="meg-contact-heading">
                    <strong>{npc.name}</strong><span className="meg-muted">{npc.role}</span>
                  </div>
                  <p><span className="meg-eyebrow">性格</span> {npc.personality}</p>
                  <p><span className="meg-eyebrow">经历</span> {npc.background}</p>
                  {chat.length > 0 && (
                    <details className="meg-chat">
                      <summary>聊天记录（{chat.length}）</summary>
                      <div className="meg-chat-log">
                        {chat.map((message, index) => (
                          <div className={`meg-chat-message${message.role === 'user' ? ' meg-chat-player' : ''}`} key={`${npc.id}-${index}`}>
                            <span className="meg-eyebrow">{message.role === 'user' ? '玩家' : npc.name}</span>
                            <span>{message.content}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
