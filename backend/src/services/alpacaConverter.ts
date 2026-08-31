import type { ParsedConversation } from './deepseekParser.js'

export interface AlpacaItem {
  instruction: string
  input: string
  output: string
}

export interface AlpacaMultiItem {
  conversations: Array<{ role: 'user' | 'assistant'; content: string }>
}

/**
 * 单轮 Alpaca：每个 REQUEST → 其后紧跟的 RESPONSE 配对为 instruction/output
 */
export function toAlpacaSingle(conversations: ParsedConversation[]): AlpacaItem[] {
  const out: AlpacaItem[] = []
  for (const c of conversations) {
    const msgs = c.messages
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i].role === 'USER' && i + 1 < msgs.length && msgs[i + 1].role === 'ASSISTANT') {
        out.push({
          instruction: msgs[i].content,
          input: '',
          output: msgs[i + 1].content,
        })
      }
    }
  }
  return out
}

/**
 * 多轮 Alpaca：整段对话作为一组 conversations（role:user/assistant）
 */
export function toAlpacaMulti(conversations: ParsedConversation[]): AlpacaMultiItem[] {
  const out: AlpacaMultiItem[] = []
  for (const c of conversations) {
    const convs = c.messages.map((m) => ({
      role: (m.role === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }))
    out.push({ conversations: convs })
  }
  return out
}
