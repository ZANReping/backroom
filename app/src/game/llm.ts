// LLM API 接入（可选）：设置页「API」配置 OpenAI 兼容端点后，NPC 对话可由模型按人设生成；
// 未配置或请求失败时回退预制对话树。配置存于 br_settings（明文 localStorage，仅本机）。
import { storage } from './storage'
import type { NpcDef } from './npcs'

export interface LlmCfg { endpoint: string; apiKey: string; model: string }

export function loadLlmCfg(): LlmCfg {
  try {
    const s = JSON.parse(storage.get('br_settings') ?? '{}')
    return { endpoint: s.llmEndpoint ?? '', apiKey: s.llmApiKey ?? '', model: s.llmModel ?? '' }
  } catch { return { endpoint: '', apiKey: '', model: '' } }
}

/** 已配置可用端点（apiKey 可空——本地/内网端点） */
export function llmConfigured(): boolean {
  const c = loadLlmCfg()
  return !!c.endpoint && !!c.model
}

// ---------- NPC 聊天记录（跨局持久化：br_npc_chat；NPC「记住」历史=记录喂回模型上下文） ----------
export interface ChatMsg { role: 'user' | 'assistant'; content: string }
const CHAT_KEY = 'br_npc_chat'
const CHAT_CAP = 60 // 每位 NPC 记录上限（溢出丢弃最旧）

function readAllChats(): Record<string, ChatMsg[]> {
  try { return JSON.parse(storage.get(CHAT_KEY) ?? '{}') } catch { return {} }
}

export function loadChat(npcId: string): ChatMsg[] {
  return readAllChats()[npcId] ?? []
}

export function appendChat(npcId: string, ...msgs: ChatMsg[]) {
  const all = readAllChats()
  all[npcId] = [...(all[npcId] ?? []), ...msgs].slice(-CHAT_CAP)
  storage.set(CHAT_KEY, JSON.stringify(all))
}

/** 以 NPC 人设调用 OpenAI 兼容 /chat/completions；失败抛错（调用方回退预制回复） */
export async function npcChat(
  npc: NpcDef,
  history: { role: 'user' | 'assistant'; content: string }[],
  userText: string,
): Promise<string> {
  const c = loadLlmCfg()
  const sys = [
    `你在扮演后室题材生存游戏《后室：深入》中 M.E.G. Alpha 基地的 NPC「${npc.name}」（${npc.role}）。`,
    `性格：${npc.personality}`,
    `经历：${npc.background}`,
    '要求：全程用简体中文、以该角色的口吻回答；1~3 句短句；不要跳出角色，不要提及 AI、模型或提示词；世界观是后室（Backrooms）与 M.E.G.（探险者总署）。',
  ].join('\n')
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 15000)
  try {
    const res = await fetch(`${c.endpoint.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}) },
      body: JSON.stringify({
        model: c.model,
        messages: [{ role: 'system', content: sys }, ...history.slice(-8), { role: 'user', content: userText }],
        max_tokens: 160,
        temperature: 0.8,
      }),
      signal: ctl.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content?.trim()
    if (!text) throw new Error('空响应')
    return text
  } finally { clearTimeout(timer) }
}
