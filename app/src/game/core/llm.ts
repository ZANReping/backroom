// LLM API 接入（可选）：设置页「API」配置 OpenAI 兼容端点后，NPC 对话可由模型按人设生成；
// 未配置或请求失败时回退预制对话树。配置存于 br_settings（明文 localStorage，仅本机）。
// v55：system prompt 组装升级（buildNpcPrompt）——角色卡/所处环境/所属团体/后室常识包/人物风格指令
// 五段注入；原住民历史名人注入原型身份；BRC 员工沉默设定不变（对话窗本就不给他们聊天入口）。
import { storage } from './storage'
import { OUTPOSTS } from '../content/outposts'
import { FACTIONS } from '../content/factions'
import { levelDefOf, levelLabel } from '../levels'
import type { NpcDef } from '../content/npcs'

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

// ---------- v55：system prompt 组装（角色卡/环境/团体/常识包/风格指令） ----------
/** 后室常识包：一段写死的世界观摘要（层级/切出/杏仁水/实体/据点） */
const BACKROOMS_PRIMER =
  '后室（Backrooms）是与现实相邻的无限异空间，由一个个「层级」（Level）组成——泛黄的办公区、车库、管道廊道、电站、酒店……' +
  '人们从现实「切出」（no-clip）坠入此处，很难回去。层级之间以楼梯、电梯、门与裂缝相连。' +
  '杏仁水是后室最常见的补给：甜腻、安全、能定神。层级里游荡着实体（Entity）——猎犬、无面灵、笑魇……大多危险。' +
  '流浪者在据点抱团求生：M.E.G. 探险者总署、B.N.T.G. 商团、阿丽亚娜集团等团体各据一方。'

/** 原住民历史名人的原型身份（一句话背景，让对话像与历史人物本人交谈） */
const ORIGINALS_PROTOTYPE: Record<string, string> = {
  amelia: '你是 1937 年环球飞行途中失踪的传奇飞行员阿梅莉亚·埃尔哈特本人。',
  dorothy: '你是 1910 年于纽约失踪的上流社会名媛多萝西·阿诺德本人。',
  astor: '你是 1912 年随巨轮「泰坦尼克号」沉没的实业家、当时的世界首富约翰·雅各布·阿斯特四世本人。',
  smith: '你是 1912 年与「泰坦尼克号」共存亡的船长爱德华·史密斯本人。',
  hoffa: '你是 1975 年失踪的卡车司机工会领袖吉米·霍法本人。',
  white: '你是 1587 年罗阿诺克失踪殖民队的总督约翰·怀特本人。',
  northup: '你是曾被掳为奴十二年、最终重获自由的作家与小提琴手所罗门·诺瑟普本人。',
}

/** 组装 NPC 自由对话的 system prompt（离线可测——prompt 组装与请求解耦） */
export function buildNpcPrompt(npc: NpcDef, level: number): string {
  const parts: string[] = []
  // 1) 角色卡：姓名/职业/性格/经历原样注入（v55：各段 capSection 限长，防超长背景顶爆上下文）
  parts.push(
    `你在扮演后室题材生存游戏《后室：深入》中的 NPC「${npc.name}」（${npc.role}）。`,
    `【角色卡】性格：${capSection(npc.personality)}\n经历：${capSection(npc.background)}`,
  )
  // 2) 所处环境：据点（名+简介摘要）或所在层级（名+一句话氛围）
  const outpost = Object.values(OUTPOSTS).find((o) => o.levelId === level)
  if (outpost) parts.push(`【你所在的地方】${outpost.name}——${capSection(outpost.intro[0])}`)
  else {
    const def = levelDefOf(level)
    if (def) parts.push(`【你所在的地方】${levelLabel(level)}「${def.name}」——${capSection(def.flavor ?? def.sd ?? '')}`)
  }
  // 3) 所属团体：团体名与简介
  const fac = FACTIONS[npc.faction ?? 'meg']
  if (fac) parts.push(`【你所属的团体】${fac.name}（${fac.en}）——${capSection(fac.desc)}`)
  // 4) 后室常识包
  parts.push(`【后室常识】${BACKROOMS_PRIMER}`)
  // 5) 人物风格指令：基础要求 + 原住民时代谈吐 + 历史原型身份
  const style: string[] = [
    '全程用简体中文、以该角色的口吻回答；1~3 句短句；不要跳出角色，不要提及 AI、模型或提示词。',
  ]
  if (npc.faction === 'originals') {
    style.push('你是 1300~1940 年代的人（原住民）——谈吐用你所属时代的措辞与礼仪，不使用任何现代词汇（手机、网络、电脑等你闻所未闻），也不理解你失踪之后的世界。')
    const proto = ORIGINALS_PROTOTYPE[npc.id]
    if (proto) style.push(`${proto}请带着那段真实人生的记忆、口吻与执念说话。`)
  }
  parts.push(`【说话方式】${style.join('')}`)
  return parts.join('\n')
}

// ---------- v55：请求长度预算与分错重试 ----------
/** 长度上限（字符）：prompt 各段 / 历史窗口 / 用户输入；retry 列为 400/413 超长重发时的更紧预算 */
export const LLM_LIMITS = {
  sectionChars: 700, // system prompt 单段注入上限（性格/经历/环境/团体简介等）
  historyChars: 1500, // 聊天记录窗口总字符预算（从最新往回装，超出丢弃更早的）
  userChars: 500, // 用户输入上限（超出截断）
  historyCharsRetry: 400,
  userCharsRetry: 200,
}
/** HTTP 错误（带状态码——区分「内容过长 400/413」与网络失败） */
class LlmHttpError extends Error {
  status: number
  constructor(status: number) { super(`HTTP ${status}`); this.status = status }
}
/** 聊天记录按字符预算从最新往回装窗（替代旧的 slice(-8)——长记录不再顶爆上下文） */
export function trimHistory(history: ChatMsg[], budget: number): ChatMsg[] {
  const out: ChatMsg[] = []
  let total = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const c = history[i]
    if (out.length && total + c.content.length > budget) break // 至少保留最新一条（超长单条截断）
    total += c.content.length
    out.unshift(c.content.length > budget ? { ...c, content: `${c.content.slice(0, budget)}…` } : c)
    if (total > budget) break
  }
  return out
}
const capSection = (s: string): string => (s.length > LLM_LIMITS.sectionChars ? `${s.slice(0, LLM_LIMITS.sectionChars)}…` : s)

/** 以 NPC 人设调用 OpenAI 兼容 /chat/completions；失败抛错（调用方回退预制回复）。
 *  v55 长输入修复：① 全程长度预算（system 各段/历史窗口/用户输入均截断到上限）；
 *  ② 失败分错处理——HTTP 400/413（内容过长/超上下文）自动裁剪历史与用户输入后重发一次，
 *  网络抖动/超时/5xx 原样重试一次；两次都败才抛错（调用方回退「通讯杂音」）。 */
export async function npcChat(
  npc: NpcDef,
  history: { role: 'user' | 'assistant'; content: string }[],
  userText: string,
  level = 0,
): Promise<string> {
  const c = loadLlmCfg()
  const sys = buildNpcPrompt(npc, level)
  const endpoint = `${c.endpoint.replace(/\/$/, '')}/chat/completions`
  const send = async (histBudget: number, userCap: number): Promise<string> => {
    const user = userText.length > userCap ? `${userText.slice(0, userCap)}…` : userText
    const messages = [
      { role: 'system', content: sys },
      ...trimHistory(history, histBudget),
      { role: 'user', content: user },
    ]
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 15000)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}) },
        body: JSON.stringify({ model: c.model, messages, max_tokens: 160, temperature: 0.8 }),
        signal: ctl.signal,
      })
      if (!res.ok) throw new LlmHttpError(res.status)
      const data = await res.json()
      const text = data?.choices?.[0]?.message?.content?.trim()
      if (!text) throw new Error('空响应')
      return text
    } finally { clearTimeout(timer) }
  }
  try {
    return await send(LLM_LIMITS.historyChars, LLM_LIMITS.userChars)
  } catch (e) {
    // 内容过长（400/413）：裁剪历史与用户输入后重发一次；其余错误（网络/超时/5xx）：原样重试一次
    if (e instanceof LlmHttpError && (e.status === 400 || e.status === 413)) {
      return send(LLM_LIMITS.historyCharsRetry, LLM_LIMITS.userCharsRetry)
    }
    return send(LLM_LIMITS.historyChars, LLM_LIMITS.userChars)
  }
}
